import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { Pool, type PoolClient } from "pg";
import type {
  AppSettings,
  DepartmentUnit,
  EquipmentItem,
  NotificationLog,
  ParaclinicalRoom,
  RepairLog,
  ScheduledAlertHistoryItem,
  ScheduledAlertRuleConfig,
  StaffProfile,
  SyncHistoryEntry,
  User,
} from "../src/types/hospital";
import {
  canManageEquipmentTarget,
  canManageRoomTarget,
  canManageStaffTarget,
  isAdminIdentity,
  resolveEffectiveUserAccess,
} from "../src/utils/rbac";

export const ALLOWED_CLOUD_BUCKETS = new Set<string>([
  "tasks",
  "documents",
  "users",
  "notifications",
  "audit_logs",
  "settings",
  "shifts",
  "work_task_rows",
  "meetings",
  "meeting_items",
  "messages",
  "channels",
  "announcements",
  "equipment",
  "departments",
  "rooms",
  "staff_profiles",
  "leave_requests",
  "training_courses",
  "integration_endpoints",
  "integration_payloads",
  "equipment_duration_defaults",
  "sync_history",
]);

const ARCHIVE_KEY_REGEX = /^(19|20|21)[0-9]{2}_m(0[1-9]|1[0-2])$/;
const SESSION_COOKIE_NAME = "cls_pg_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface PgSessionPayload {
  userId: string;
  role: string;
  name: string;
  exp: number;
}

interface AuthedRequest extends Request {
  pgSession?: PgSessionPayload;
}

interface StaffLoginRecord {
  id: string;
  name: string;
  email?: string;
  password?: string;
  role: string;
  department?: string;
  title?: string;
  avatar?: string;
  resetRequested?: boolean;
  resetRequestNote?: string;
  [key: string]: unknown;
}

const FALLBACK_ADMIN_RECORD: StaffLoginRecord = {
  id: "USR-ADMIN",
  name: "Quản trị Hệ thống",
  email: "admin@hospital.vn",
  password: "admin",
  role: "Admin",
  department: "Bộ phận CNTT & Quản trị Hệ thống",
  title: "Quản trị ứng dụng",
};

let pgPool: Pool | null = null;
let cachedConnectionString = "";
let schemaReadyPromise: Promise<void> | null = null;
let cachedSessionSecret: string | null = null;

interface PostgresLiveChangeEvent {
  type: "bucket" | "report_archive" | "bulk" | "telegram_takeover";
  key: string;
  updatedAtMs: number;
  actorId: string;
  emitterId?: string;
  meta?: Record<string, string>;
}

const SERVER_EMITTER_ID = crypto.randomUUID().slice(0, 8);
const syncStreamClients = new Set<(evt: PostgresLiveChangeEvent) => void>();
const telegramTakeoverSubscribers = new Set<
  (evt: { tokenHash: string; winnerInstanceId: string; winnerHost?: string }) => void
>();
let notifyListenerClient: PoolClient | null = null;
let notifyListenerStarting = false;

async function ensurePgNotifyListener(pool: Pool): Promise<void> {
  if (notifyListenerClient || notifyListenerStarting) return;
  notifyListenerStarting = true;
  try {
    const client = await pool.connect();
    client.on("notification", (msg) => {
      if (msg.channel !== "cls_bucket_changes" || !msg.payload) return;
      try {
        const parsed = JSON.parse(msg.payload) as PostgresLiveChangeEvent;
        if (parsed.emitterId && parsed.emitterId === SERVER_EMITTER_ID) return;
        if (parsed.type === "telegram_takeover") {
          telegramTakeoverSubscribers.forEach((cb) =>
            cb({
              tokenHash: parsed.key,
              winnerInstanceId: parsed.actorId,
              winnerHost: parsed.meta?.winnerHost,
            })
          );
          return;
        }
        syncStreamClients.forEach((cb) => cb(parsed));
      } catch {
        // ignore malformed notification payload
      }
    });
    client.on("error", () => {
      try {
        client.release();
      } catch {
        // ignore
      }
      if (notifyListenerClient === client) {
        notifyListenerClient = null;
      }
    });
    client.on("end", () => {
      if (notifyListenerClient === client) {
        notifyListenerClient = null;
      }
    });
    await client.query("LISTEN cls_bucket_changes");
    notifyListenerClient = client;
  } catch {
    // Pooler environments without LISTEN support gracefully fall back to in-process SSE + polling
  } finally {
    notifyListenerStarting = false;
  }
}

export function subscribeTelegramTakeover(
  cb: (evt: { tokenHash: string; winnerInstanceId: string; winnerHost?: string }) => void
): () => void {
  telegramTakeoverSubscribers.add(cb);
  const pool = getPool();
  if (pool) {
    void ensurePgNotifyListener(pool);
  }
  return () => {
    telegramTakeoverSubscribers.delete(cb);
  };
}

function broadcastPostgresChange(pool: Pool, evt: PostgresLiveChangeEvent): void {
  const fullEvent: PostgresLiveChangeEvent = { ...evt, emitterId: SERVER_EMITTER_ID };
  if (evt.type !== "telegram_takeover") {
    syncStreamClients.forEach((cb) => cb(fullEvent));
  }
  const payload = JSON.stringify(fullEvent).slice(0, 7000);
  void pool.query(`SELECT pg_notify('cls_bucket_changes', $1)`, [payload]).catch(() => {});
}

function getExternalDatabaseUrl(): string {
  return (
    process.env.EXTERNAL_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    ""
  ).trim();
}

function shouldUseSsl(connStr: string): boolean {
  const lower = connStr.toLowerCase();
  if (lower.includes("sslmode=disable")) return false;
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) {
    return lower.includes("sslmode=require");
  }
  return true;
}

function getPool(): Pool | null {
  const connStr = getExternalDatabaseUrl();
  if (!connStr) return null;

  if (pgPool && cachedConnectionString === connStr) {
    return pgPool;
  }

  if (pgPool) {
    void pgPool.end().catch(() => {});
    pgPool = null;
    schemaReadyPromise = null;
    cachedSessionSecret = null;
  }

  cachedConnectionString = connStr;
  pgPool = new Pool({
    connectionString: connStr,
    ssl: shouldUseSsl(connStr) ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 12000,
  });

  pgPool.on("error", (err) => {
    console.error("[PostgresSync] Idle pool error:", err.message);
  });

  return pgPool;
}

async function ensureSchema(pool: Pool): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_buckets (
          bucket_key TEXT PRIMARY KEY,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          item_count INTEGER NOT NULL DEFAULT 0,
          updated_by_id TEXT,
          updated_by_name TEXT,
          updated_at_ms BIGINT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_report_archives (
          archive_key TEXT PRIMARY KEY,
          year INTEGER NOT NULL,
          month_key TEXT NOT NULL,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_by_id TEXT,
          updated_by_name TEXT,
          updated_at_ms BIGINT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_meta (
          meta_key TEXT PRIMARY KEY,
          meta_value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

export interface TelegramPollLeaseResult {
  supported: boolean;
  acquired: boolean;
  holderInstanceId?: string;
  holderLabel?: string;
  tookOverFromInstanceId?: string;
  tookOverFromHost?: string;
}

export async function acquireTelegramPollLease(
  tokenHash: string,
  instanceId: string,
  hostLabel: string,
  ttlMs = 45000,
  forceTakeover = false
): Promise<TelegramPollLeaseResult> {
  const pool = getPool();
  if (!pool || !tokenHash) {
    return { supported: false, acquired: true, holderInstanceId: instanceId, holderLabel: hostLabel };
  }

  try {
    await ensureSchema(pool);
    void ensurePgNotifyListener(pool);
    const metaKey = `telegram_poll_lease_${tokenHash}`;
    const now = Date.now();
    const expiresAtMs = now + Math.max(15000, ttlMs);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const existingRes = await client.query<{ meta_value: string }>(
        `SELECT meta_value FROM app_meta WHERE meta_key = $1 FOR UPDATE`,
        [metaKey]
      );

      let current: {
        instanceId?: string;
        hostLabel?: string;
        updatedAtMs?: number;
        expiresAtMs?: number;
      } | null = null;
      if (existingRes.rows[0]?.meta_value) {
        try {
          current = JSON.parse(existingRes.rows[0].meta_value);
        } catch {
          current = null;
        }
      }

      const isExpired =
        typeof current?.expiresAtMs !== "number" || current.expiresAtMs <= now;
      // Active holders heartbeat every 5s; >10s stale on the exact same explicit domain means container restarted
      const isSameExplicitHostRestart =
        Boolean(hostLabel && current?.hostLabel) &&
        current!.hostLabel === hostLabel &&
        !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|server)$/i.test(hostLabel) &&
        typeof current?.updatedAtMs === "number" &&
        now - current.updatedAtMs > 10000;

      const isActiveOtherHolder =
        Boolean(current?.instanceId) &&
        current!.instanceId !== instanceId &&
        !isExpired &&
        !isSameExplicitHostRestart;

      if (isActiveOtherHolder && !forceTakeover) {
        await client.query("COMMIT");
        return {
          supported: true,
          acquired: false,
          holderInstanceId: current!.instanceId,
          holderLabel: current!.hostLabel || "Phiên bản máy chủ khác",
        };
      }

      const tookOverFromInstanceId =
        isActiveOtherHolder && forceTakeover ? current!.instanceId : undefined;
      const tookOverFromHost =
        isActiveOtherHolder && forceTakeover ? current!.hostLabel : undefined;

      const nextPayload = JSON.stringify({
        instanceId,
        hostLabel: hostLabel || "server",
        updatedAtMs: now,
        expiresAtMs,
      });

      await client.query(
        `INSERT INTO app_meta (meta_key, meta_value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (meta_key)
         DO UPDATE SET meta_value = EXCLUDED.meta_value, updated_at = NOW()`,
        [metaKey, nextPayload]
      );

      await client.query("COMMIT");

      if (tookOverFromInstanceId) {
        broadcastPostgresChange(pool, {
          type: "telegram_takeover",
          key: tokenHash,
          updatedAtMs: now,
          actorId: instanceId,
          meta: {
            winnerHost: hostLabel || "server",
          },
        });
      }

      return {
        supported: true,
        acquired: true,
        holderInstanceId: instanceId,
        holderLabel: hostLabel,
        tookOverFromInstanceId,
        tookOverFromHost,
      };
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn("[PostgresSync] Telegram poll lease check fallback:", (err as Error)?.message);
    return { supported: false, acquired: true, holderInstanceId: instanceId, holderLabel: hostLabel };
  }
}

/**
 * Strictly renews an already-held lease without stealing if another instance forcibly took over.
 */
export async function renewTelegramPollLease(
  tokenHash: string,
  instanceId: string,
  hostLabel: string,
  ttlMs = 45000
): Promise<TelegramPollLeaseResult> {
  const pool = getPool();
  if (!pool || !tokenHash) {
    return { supported: false, acquired: true, holderInstanceId: instanceId, holderLabel: hostLabel };
  }

  try {
    await ensureSchema(pool);
    const metaKey = `telegram_poll_lease_${tokenHash}`;
    const now = Date.now();
    const expiresAtMs = now + Math.max(15000, ttlMs);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const existingRes = await client.query<{ meta_value: string }>(
        `SELECT meta_value FROM app_meta WHERE meta_key = $1 FOR UPDATE`,
        [metaKey]
      );

      let current: {
        instanceId?: string;
        hostLabel?: string;
        updatedAtMs?: number;
        expiresAtMs?: number;
      } | null = null;
      if (existingRes.rows[0]?.meta_value) {
        try {
          current = JSON.parse(existingRes.rows[0].meta_value);
        } catch {
          current = null;
        }
      }

      const isExpired =
        !current ||
        !current.instanceId ||
        typeof current.expiresAtMs !== "number" ||
        current.expiresAtMs <= now;

      if (!isExpired && current!.instanceId !== instanceId) {
        await client.query("COMMIT");
        return {
          supported: true,
          acquired: false,
          holderInstanceId: current!.instanceId,
          holderLabel: current!.hostLabel || "Phiên bản máy chủ khác",
        };
      }

      const nextPayload = JSON.stringify({
        instanceId,
        hostLabel: hostLabel || current?.hostLabel || "server",
        updatedAtMs: now,
        expiresAtMs,
      });

      await client.query(
        `INSERT INTO app_meta (meta_key, meta_value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (meta_key)
         DO UPDATE SET meta_value = EXCLUDED.meta_value, updated_at = NOW()`,
        [metaKey, nextPayload]
      );

      await client.query("COMMIT");
      return {
        supported: true,
        acquired: true,
        holderInstanceId: instanceId,
        holderLabel: hostLabel,
      };
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch {
    return { supported: false, acquired: true, holderInstanceId: instanceId, holderLabel: hostLabel };
  }
}

export interface TelegramPollLeaseInfo {
  supported: boolean;
  active: boolean;
  holderInstanceId?: string;
  holderLabel?: string;
  expiresAtMs?: number;
}

export async function getTelegramPollLeaseInfo(tokenHash: string): Promise<TelegramPollLeaseInfo> {
  const pool = getPool();
  if (!pool || !tokenHash) {
    return { supported: false, active: false };
  }
  try {
    await ensureSchema(pool);
    const metaKey = `telegram_poll_lease_${tokenHash}`;
    const existingRes = await pool.query<{ meta_value: string }>(
      `SELECT meta_value FROM app_meta WHERE meta_key = $1 LIMIT 1`,
      [metaKey]
    );
    if (!existingRes.rows[0]?.meta_value) {
      return { supported: true, active: false };
    }
    const parsed = JSON.parse(existingRes.rows[0].meta_value);
    const now = Date.now();
    const active = Boolean(parsed?.instanceId) && typeof parsed?.expiresAtMs === "number" && parsed.expiresAtMs > now;
    return {
      supported: true,
      active,
      holderInstanceId: parsed?.instanceId,
      holderLabel: parsed?.hostLabel || undefined,
      expiresAtMs: parsed?.expiresAtMs,
    };
  } catch {
    return { supported: false, active: false };
  }
}

export async function loadStoredTelegramSettingsFromDb(): Promise<{
  botToken: string;
  defaultChatId: string;
  enabled: boolean;
} | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    await ensureSchema(pool);
    const res = await pool.query<{ items: unknown }>(
      `SELECT items FROM app_buckets WHERE bucket_key = 'settings' LIMIT 1`
    );
    const first = Array.isArray(res.rows[0]?.items) ? res.rows[0].items[0] : null;
    if (!first || typeof first !== "object") return null;
    const obj = first as Record<string, unknown>;
    const botToken = typeof obj.telegramBotToken === "string" ? obj.telegramBotToken.trim() : "";
    if (!botToken) return null;
    const defaultChatId =
      typeof obj.defaultTelegramChatId === "string" ? obj.defaultTelegramChatId.trim() : "";
    const enabled = obj.telegramQaEnabled !== false;
    return { botToken, defaultChatId, enabled };
  } catch {
    return null;
  }
}

export async function releaseTelegramPollLease(tokenHash: string, instanceId: string): Promise<void> {
  const pool = getPool();
  if (!pool || !tokenHash) return;

  try {
    await ensureSchema(pool);
    const metaKey = `telegram_poll_lease_${tokenHash}`;
    const existingRes = await pool.query<{ meta_value: string }>(
      `SELECT meta_value FROM app_meta WHERE meta_key = $1 LIMIT 1`,
      [metaKey]
    );
    if (!existingRes.rows[0]?.meta_value) return;

    const current = JSON.parse(existingRes.rows[0].meta_value);
    if (current?.instanceId === instanceId) {
      await pool.query(`DELETE FROM app_meta WHERE meta_key = $1`, [metaKey]);
    }
  } catch {
    // ignore release errors on shutdown
  }
}

export async function loadTelegramUpdateOffsetFromDb(tokenHash: string): Promise<number> {
  const pool = getPool();
  if (!pool || !tokenHash) return 0;
  try {
    await ensureSchema(pool);
    const metaKey = `telegram_update_offset_${tokenHash}`;
    const res = await pool.query<{ meta_value: string }>(
      `SELECT meta_value FROM app_meta WHERE meta_key = $1 LIMIT 1`,
      [metaKey]
    );
    const parsed = parseInt(res.rows[0]?.meta_value || "0", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function saveTelegramUpdateOffsetToDb(tokenHash: string, offset: number): Promise<void> {
  const pool = getPool();
  if (!pool || !tokenHash || !Number.isFinite(offset) || offset <= 0) return;
  try {
    await ensureSchema(pool);
    const metaKey = `telegram_update_offset_${tokenHash}`;
    await pool.query(
      `INSERT INTO app_meta (meta_key, meta_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (meta_key)
       DO UPDATE SET meta_value = EXCLUDED.meta_value, updated_at = NOW()`,
      [metaKey, String(Math.floor(offset))]
    );
  } catch {
    // non-fatal
  }
}

async function getSessionSecret(pool: Pool): Promise<string> {
  const envSecret = (process.env.AUTH_SESSION_SECRET || "").trim();
  if (envSecret.length >= 16) {
    return envSecret;
  }
  if (cachedSessionSecret) return cachedSessionSecret;

  await ensureSchema(pool);
  const existing = await pool.query<{ meta_value: string }>(
    `SELECT meta_value FROM app_meta WHERE meta_key = 'session_secret' LIMIT 1`
  );
  if (existing.rows[0]?.meta_value) {
    cachedSessionSecret = existing.rows[0].meta_value;
    return cachedSessionSecret;
  }

  const generated = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO app_meta (meta_key, meta_value)
     VALUES ('session_secret', $1)
     ON CONFLICT (meta_key) DO NOTHING`,
    [generated]
  );

  const recheck = await pool.query<{ meta_value: string }>(
    `SELECT meta_value FROM app_meta WHERE meta_key = 'session_secret' LIMIT 1`
  );
  cachedSessionSecret = recheck.rows[0]?.meta_value || generated;
  return cachedSessionSecret;
}

function signSessionToken(payload: PgSessionPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string, secret: string): PgSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PgSessionPayload;
    if (!decoded || !decoded.userId || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.cookie;
  if (!raw) return {};
  const result: Record<string, string> = {};
  raw.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx <= 0) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  });
  return result;
}

function extractTokenFromRequest(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  if (typeof req.query?.token === "string" && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return "";
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    (process.env.APP_URL || "").startsWith("https://");

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

function sanitizeBucketItems(rawItems: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.slice(0, 1000).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {};
    }
    const copy = { ...(item as Record<string, unknown>) };
    delete copy.rawFileData;
    return copy;
  });
}

async function getStoredUsers(pool: Pool): Promise<{ users: StaffLoginRecord[]; existsInDb: boolean }> {
  await ensureSchema(pool);
  const res = await pool.query<{ items: unknown }>(
    `SELECT items FROM app_buckets WHERE bucket_key = 'users' LIMIT 1`
  );
  if (!res.rows[0] || !Array.isArray(res.rows[0].items) || res.rows[0].items.length === 0) {
    return { users: [], existsInDb: false };
  }
  const list = res.rows[0].items.filter(
    (u): u is StaffLoginRecord => Boolean(u && typeof u === "object" && (u as StaffLoginRecord).id)
  );
  return { users: list, existsInDb: list.length > 0 };
}

const RBAC_GUARDED_BUCKETS = new Set<string>([
  "users",
  "staff_profiles",
  "equipment",
  "departments",
  "rooms",
]);

function stableStringify(val: unknown): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val !== "object") return JSON.stringify(val);
  if (Array.isArray(val)) return "[" + val.map(stableStringify).join(",") + "]";
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function stripObjectKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const copy = { ...obj };
  for (const k of keys) {
    delete copy[k];
  }
  return copy;
}

function isPureNewIssueReport(prevEq: EquipmentItem, nextEq: EquipmentItem): boolean {
  const prevLogs: RepairLog[] = Array.isArray(prevEq.repairHistory) ? prevEq.repairHistory : [];
  const nextLogs: RepairLog[] = Array.isArray(nextEq.repairHistory) ? nextEq.repairHistory : [];
  if (nextLogs.length <= prevLogs.length) return false;

  const nextMap = new Map<string, RepairLog>();
  for (const log of nextLogs) {
    if (log && log.id) nextMap.set(log.id, log);
  }
  for (const prevLog of prevLogs) {
    const matched = prevLog?.id ? nextMap.get(prevLog.id) : undefined;
    if (!matched || stableStringify(matched) !== stableStringify(prevLog)) {
      return false;
    }
  }
  const statusAllowed =
    nextEq.status === prevEq.status ||
    nextEq.status === "Sự cố hỏng hóc" ||
    nextEq.status === "Tạm ngưng";
  return statusAllowed;
}

function getPrivilegeEscalationError(
  prevObj: Record<string, unknown> | undefined,
  nextObj: Record<string, unknown>
): string | null {
  if (isAdminIdentity(nextObj as unknown as User, nextObj as unknown as StaffProfile)) {
    return "Chỉ Admin hệ thống mới có quyền gán hoặc chỉnh sửa tài khoản vai trò Admin.";
  }
  const prevOverrides =
    prevObj && typeof prevObj.permissionOverrides === "object" && prevObj.permissionOverrides
      ? (prevObj.permissionOverrides as Record<string, unknown>)
      : {};
  const nextOverrides =
    typeof nextObj.permissionOverrides === "object" && nextObj.permissionOverrides
      ? (nextObj.permissionOverrides as Record<string, unknown>)
      : {};

  if (nextOverrides.canConfigureRBAC === true && prevOverrides.canConfigureRBAC !== true) {
    return "Chỉ Admin hệ thống mới được cấp quyền điều chỉnh phân quyền (RBAC).";
  }
  if (nextOverrides.allowCrossScopeEdit === true && prevOverrides.allowCrossScopeEdit !== true) {
    return "Chỉ Admin hệ thống mới được cấp quyền mở rộng quản lý vượt phạm vi Bộ phận/Phòng.";
  }
  return null;
}

async function resolveServerRbacContext(
  pool: Pool,
  session: PgSessionPayload,
  extraBucketKey?: string
) {
  const keys = Array.from(
    new Set(["users", "staff_profiles", "departments", "rooms", ...(extraBucketKey ? [extraBucketKey] : [])])
  );
  const rowsRes = await pool.query<{ bucket_key: string; items: unknown }>(
    `SELECT bucket_key, items FROM app_buckets WHERE bucket_key = ANY($1::text[])`,
    [keys]
  );

  const rowMap = new Map<string, Record<string, unknown>[]>();
  for (const row of rowsRes.rows) {
    rowMap.set(row.bucket_key, Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : []);
  }

  const users = (rowMap.get("users") || []) as unknown as User[];
  const staffProfiles = (rowMap.get("staff_profiles") || []) as unknown as StaffProfile[];
  const departments = (rowMap.get("departments") || []) as unknown as DepartmentUnit[];
  const rooms = (rowMap.get("rooms") || []) as unknown as ParaclinicalRoom[];

  const matchedDbUser = users.find((u) => u.id === session.userId);
  const effectiveUser: Partial<User> | null = matchedDbUser
    ? matchedDbUser
    : users.length === 0 && (session.userId === "USR-ADMIN" || session.role === "Admin")
      ? { id: session.userId, name: session.name, role: "Admin", managementLevel: "admin" }
      : session.userId === "USR-ADMIN"
        ? { id: "USR-ADMIN", name: session.name || "Admin", role: "Admin", managementLevel: "admin" }
        : null;

  const actorAccess = resolveEffectiveUserAccess(effectiveUser, staffProfiles, departments, rooms);

  return {
    rowMap,
    users,
    staffProfiles,
    departments,
    rooms,
    matchedDbUser,
    actorAccess,
  };
}

async function enforceServerBucketRbac(
  pool: Pool,
  session: PgSessionPayload,
  bucketKey: string,
  safeItems: Record<string, unknown>[]
): Promise<{ allowed: true } | { allowed: false; status: number; error: string }> {
  if (!RBAC_GUARDED_BUCKETS.has(bucketKey)) {
    return { allowed: true };
  }

  const { rowMap, users, staffProfiles, departments, rooms, matchedDbUser, actorAccess } =
    await resolveServerRbacContext(pool, session, bucketKey);

  if (!actorAccess.userId) {
    return {
      allowed: false,
      status: 403,
      error: "Tài khoản không tồn tại trong cơ sở dữ liệu hoặc không đủ quyền thực hiện thao tác.",
    };
  }

  if (matchedDbUser?.status === "Inactive") {
    return {
      allowed: false,
      status: 403,
      error: "Tài khoản đã ngừng hoạt động, không thể cập nhật dữ liệu.",
    };
  }

  if (actorAccess.isSystemAdmin) {
    return { allowed: true };
  }

  // Initial empty DB migration must be done by Admin
  if (!rowMap.has("users") || users.length === 0) {
    return {
      allowed: false,
      status: 403,
      error: "Chỉ Admin mới có quyền khởi tạo dữ liệu phân quyền ban đầu.",
    };
  }

  const prevItems = rowMap.get(bucketKey) || [];

  if (bucketKey === "departments") {
    if (stableStringify(prevItems) === stableStringify(safeItems)) {
      return { allowed: true };
    }
    if (!canManageRoomTarget(actorAccess, "manage_departments", undefined, rooms)) {
      return {
        allowed: false,
        status: 403,
        error: "Bạn không có quyền thêm, sửa hoặc xóa cơ cấu Bộ phận (chỉ Admin / Trưởng khoa).",
      };
    }
    return { allowed: true };
  }

  if (bucketKey === "rooms") {
    const prevById = new Map<string, ParaclinicalRoom>();
    for (const item of prevItems as unknown as ParaclinicalRoom[]) {
      if (item?.id) prevById.set(item.id, item);
    }
    const nextIds = new Set<string>();
    const ROOM_RESOURCE_KEYS = [
      "managerInCharge",
      "deputyManager",
      "assignedStaff",
      "equipment",
      "updatedAt",
    ];

    for (const rawNext of safeItems) {
      const nextRoom = rawNext as unknown as ParaclinicalRoom;
      if (!nextRoom?.id) continue;
      nextIds.add(nextRoom.id);
      const prevRoom = prevById.get(nextRoom.id);

      if (!prevRoom) {
        if (
          !canManageRoomTarget(
            actorAccess,
            "create_room",
            { departmentName: nextRoom.departmentSection, room: nextRoom },
            rooms
          )
        ) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền tạo phòng "${nextRoom.name || nextRoom.id}" ngoài phạm vi phụ trách.`,
          };
        }
        continue;
      }

      if (stableStringify(prevRoom) === stableStringify(nextRoom)) continue;

      const onlyResourcesChanged =
        stableStringify(stripObjectKeys(prevRoom as unknown as Record<string, unknown>, ROOM_RESOURCE_KEYS)) ===
        stableStringify(stripObjectKeys(rawNext, ROOM_RESOURCE_KEYS));

      if (onlyResourcesChanged) {
        if (
          !canManageRoomTarget(
            actorAccess,
            "manage_room_resources",
            { departmentName: prevRoom.departmentSection, room: prevRoom },
            rooms
          )
        ) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền điều chỉnh nhân sự/thiết bị của phòng "${prevRoom.name}" (ngoài phạm vi).`,
          };
        }
      } else {
        const canEditPrev = canManageRoomTarget(
          actorAccess,
          "edit_room",
          { departmentName: prevRoom.departmentSection, room: prevRoom },
          rooms
        );
        const canEditNext =
          actorAccess.isDepartmentWide ||
          canManageRoomTarget(
            actorAccess,
            "edit_room",
            { departmentName: nextRoom.departmentSection, room: nextRoom },
            rooms
          );
        if (!canEditPrev || !canEditNext) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền chỉnh sửa thông tin phòng "${prevRoom.name}" ngoài phạm vi quản lý.`,
          };
        }
      }
    }

    for (const prevRoom of prevById.values()) {
      if (!nextIds.has(prevRoom.id)) {
        if (
          !canManageRoomTarget(
            actorAccess,
            "delete_room",
            { departmentName: prevRoom.departmentSection, room: prevRoom },
            rooms
          )
        ) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền xóa phòng "${prevRoom.name}" ngoài phạm vi quản lý.`,
          };
        }
      }
    }
    return { allowed: true };
  }

  if (bucketKey === "equipment") {
    const prevById = new Map<string, EquipmentItem>();
    for (const item of prevItems as unknown as EquipmentItem[]) {
      if (item?.id) prevById.set(item.id, item);
    }
    const nextIds = new Set<string>();
    const LOTO_KEYS = [
      "isLockedOut",
      "lockoutReason",
      "lockoutTriggeredAt",
      "lockoutTriggeredBy",
      "lastSafetyCheck",
      "updatedAt",
    ];
    const MAINT_KEYS = [
      "maintenanceHistory",
      "lastMaintenanceDate",
      "nextMaintenanceDate",
      "status",
      "updatedAt",
    ];
    const REPAIR_KEYS = ["repairHistory", "status", "updatedAt"];

    for (const rawNext of safeItems) {
      const nextEq = rawNext as unknown as EquipmentItem;
      if (!nextEq?.id) continue;
      nextIds.add(nextEq.id);
      const prevEq = prevById.get(nextEq.id);

      if (!prevEq) {
        if (!canManageEquipmentTarget(actorAccess, "create", nextEq, rooms, departments)) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền thêm thiết bị "${nextEq.name || nextEq.id}" vào vị trí này.`,
          };
        }
        continue;
      }

      if (stableStringify(prevEq) === stableStringify(nextEq)) continue;

      const prevRaw = prevEq as unknown as Record<string, unknown>;
      const onlyLotoChanged =
        stableStringify(stripObjectKeys(prevRaw, LOTO_KEYS)) ===
        stableStringify(stripObjectKeys(rawNext, LOTO_KEYS));

      if (onlyLotoChanged) {
        if (!canManageEquipmentTarget(actorAccess, "lockout", prevEq, rooms, departments)) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền Khóa/Mở khóa an toàn (LOTO) cho thiết bị "${prevEq.name}".`,
          };
        }
        continue;
      }

      const onlyMaintChanged =
        stableStringify(stripObjectKeys(prevRaw, MAINT_KEYS)) ===
        stableStringify(stripObjectKeys(rawNext, MAINT_KEYS));

      if (onlyMaintChanged) {
        if (!canManageEquipmentTarget(actorAccess, "maintenance", prevEq, rooms, departments)) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền ghi/sửa nhật ký bảo trì cho thiết bị "${prevEq.name}" (ngoài phạm vi).`,
          };
        }
        continue;
      }

      const onlyRepairChanged =
        stableStringify(stripObjectKeys(prevRaw, REPAIR_KEYS)) ===
        stableStringify(stripObjectKeys(rawNext, REPAIR_KEYS));

      if (onlyRepairChanged) {
        if (isPureNewIssueReport(prevEq, nextEq)) {
          if (!canManageEquipmentTarget(actorAccess, "report_issue", prevEq, rooms, departments)) {
            return {
              allowed: false,
              status: 403,
              error: `Bạn không có quyền báo cáo sự cố thiết bị "${prevEq.name}".`,
            };
          }
        } else if (
          !canManageEquipmentTarget(actorAccess, "repair_manage", prevEq, rooms, departments)
        ) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền sửa/xóa nhật ký sự cố thiết bị "${prevEq.name}" (ngoài phạm vi).`,
          };
        }
        continue;
      }

      const canEditPrev = canManageEquipmentTarget(actorAccess, "edit", prevEq, rooms, departments);
      const canEditNext =
        actorAccess.isDepartmentWide ||
        canManageEquipmentTarget(actorAccess, "edit", nextEq, rooms, departments);
      if (!canEditPrev || !canEditNext) {
        return {
          allowed: false,
          status: 403,
          error: `Bạn không có quyền chỉnh sửa thông tin thiết bị "${prevEq.name}" ngoài phạm vi phụ trách.`,
        };
      }
    }

    for (const prevEq of prevById.values()) {
      if (!nextIds.has(prevEq.id)) {
        if (!canManageEquipmentTarget(actorAccess, "delete", prevEq, rooms, departments)) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền xóa thiết bị "${prevEq.name}" khỏi hệ thống.`,
          };
        }
      }
    }
    return { allowed: true };
  }

  if (bucketKey === "staff_profiles") {
    const prevById = new Map<string, StaffProfile>();
    for (const item of staffProfiles) {
      if (item?.userId) prevById.set(item.userId, item);
    }
    const nextIds = new Set<string>();
    const RBAC_KEYS = [
      "role",
      "managementLevel",
      "managedDepartments",
      "managedRooms",
      "permissionOverrides",
    ];

    for (const rawNext of safeItems) {
      const nextStaff = rawNext as unknown as StaffProfile;
      if (!nextStaff?.userId) continue;
      nextIds.add(nextStaff.userId);
      const prevStaff = prevById.get(nextStaff.userId);

      if (!prevStaff) {
        const escErr = getPrivilegeEscalationError(undefined, rawNext);
        if (escErr) return { allowed: false, status: 403, error: escErr };
        if (!canManageStaffTarget(actorAccess, "create", nextStaff, rooms)) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền thêm nhân viên "${nextStaff.fullName || nextStaff.userId}" vào bộ phận/phòng này.`,
          };
        }
        continue;
      }

      if (stableStringify(prevStaff) === stableStringify(nextStaff)) continue;

      const prevRaw = prevStaff as unknown as Record<string, unknown>;
      const rbacChanged = RBAC_KEYS.some(
        (k) => stableStringify(prevRaw[k]) !== stableStringify(rawNext[k])
      );

      if (rbacChanged) {
        if (!canManageStaffTarget(actorAccess, "rbac", prevStaff, rooms)) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền thay đổi vai trò hoặc phân quyền của "${prevStaff.fullName}".`,
          };
        }
        const escErr = getPrivilegeEscalationError(prevRaw, rawNext);
        if (escErr) return { allowed: false, status: 403, error: escErr };
      }

      const onlyCertAndRbacChanged =
        stableStringify(stripObjectKeys(prevRaw, [...RBAC_KEYS, "certificates"])) ===
        stableStringify(stripObjectKeys(rawNext, [...RBAC_KEYS, "certificates"]));
      const certsChanged =
        stableStringify(prevRaw.certificates) !== stableStringify(rawNext.certificates);

      if (certsChanged && !canManageStaffTarget(actorAccess, "cert", prevStaff, rooms)) {
        return {
          allowed: false,
          status: 403,
          error: `Bạn không có quyền cập nhật chứng chỉ của nhân viên "${prevStaff.fullName}" (ngoài phạm vi).`,
        };
      }

      if (!onlyCertAndRbacChanged) {
        const canEditPrev = canManageStaffTarget(actorAccess, "edit", prevStaff, rooms);
        const canEditNext =
          actorAccess.isDepartmentWide ||
          canManageStaffTarget(actorAccess, "edit", nextStaff, rooms);
        if (!canEditPrev || !canEditNext) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền chỉnh sửa hồ sơ nhân viên "${prevStaff.fullName}" ngoài phạm vi phụ trách.`,
          };
        }
      }
    }

    for (const prevStaff of prevById.values()) {
      if (!nextIds.has(prevStaff.userId)) {
        if (!canManageStaffTarget(actorAccess, "delete", prevStaff, rooms)) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền xóa hồ sơ nhân viên "${prevStaff.fullName}".`,
          };
        }
      }
    }
    return { allowed: true };
  }

  if (bucketKey === "users") {
    const prevById = new Map<string, User>();
    for (const u of users) {
      if (u?.id) prevById.set(u.id, u);
    }
    const nextIds = new Set<string>();
    const canConfigureRBAC = canManageStaffTarget(actorAccess, "rbac", null, rooms);
    const SELF_SAFE_KEYS = ["password", "avatar", "resetRequested", "resetRequestNote"];
    const USER_RBAC_KEYS = [
      "role",
      "managementLevel",
      "managedDepartments",
      "managedRooms",
      "permissionOverrides",
      "password",
    ];

    for (const rawNext of safeItems) {
      const nextUser = rawNext as unknown as User;
      if (!nextUser?.id) continue;
      nextIds.add(nextUser.id);
      const prevUser = prevById.get(nextUser.id);

      if (!prevUser) {
        const escErr = getPrivilegeEscalationError(undefined, rawNext);
        if (escErr) return { allowed: false, status: 403, error: escErr };
        if (!canConfigureRBAC && !canManageStaffTarget(actorAccess, "create", nextUser, rooms)) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền tạo tài khoản người dùng "${nextUser.name || nextUser.id}".`,
          };
        }
        continue;
      }

      if (stableStringify(prevUser) === stableStringify(nextUser)) continue;

      const prevRaw = prevUser as unknown as Record<string, unknown>;

      // Allow own safe profile/password changes for any authenticated user
      if (prevUser.id === session.userId) {
        const onlySelfSafeChanged =
          stableStringify(stripObjectKeys(prevRaw, SELF_SAFE_KEYS)) ===
          stableStringify(stripObjectKeys(rawNext, SELF_SAFE_KEYS));
        if (onlySelfSafeChanged) continue;
      }

      if (isAdminIdentity(prevUser) || isAdminIdentity(nextUser)) {
        return {
          allowed: false,
          status: 403,
          error: "Chỉ Admin hệ thống mới có quyền chỉnh sửa hoặc gán vai trò tài khoản Admin.",
        };
      }

      const rbacOrCredsChanged = USER_RBAC_KEYS.some(
        (k) => stableStringify(prevRaw[k]) !== stableStringify(rawNext[k])
      );
      if (rbacOrCredsChanged) {
        if (!canConfigureRBAC) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền thay đổi phân quyền hoặc mật khẩu tài khoản "${prevUser.name}".`,
          };
        }
        const escErr = getPrivilegeEscalationError(prevRaw, rawNext);
        if (escErr) return { allowed: false, status: 403, error: escErr };
      }

      const otherUserFieldsChanged =
        stableStringify(stripObjectKeys(prevRaw, USER_RBAC_KEYS)) !==
        stableStringify(stripObjectKeys(rawNext, USER_RBAC_KEYS));

      if (otherUserFieldsChanged) {
        const canEditTarget =
          canConfigureRBAC ||
          (canManageStaffTarget(actorAccess, "edit", prevUser, rooms) &&
            (actorAccess.isDepartmentWide ||
              canManageStaffTarget(actorAccess, "edit", nextUser, rooms)));
        if (!canEditTarget) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền chỉnh sửa thông tin tài khoản "${prevUser.name}" ngoài phạm vi phụ trách.`,
          };
        }
      }
    }

    for (const prevUser of prevById.values()) {
      if (!nextIds.has(prevUser.id)) {
        if (
          prevUser.id === session.userId ||
          isAdminIdentity(prevUser) ||
          !canConfigureRBAC
        ) {
          return {
            allowed: false,
            status: 403,
            error: `Bạn không có quyền xóa tài khoản người dùng "${prevUser.name}".`,
          };
        }
      }
    }

    return { allowed: true };
  }

  return { allowed: true };
}

async function resolveSession(req: Request): Promise<{
  pool: Pool | null;
  session: PgSessionPayload | null;
}> {
  const pool = getPool();
  if (!pool) return { pool: null, session: null };

  const token = extractTokenFromRequest(req);
  if (!token) return { pool, session: null };

  const secret = await getSessionSecret(pool);
  const session = verifySessionToken(token, secret);
  return { pool, session };
}

async function requirePgAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        error: "EXTERNAL_DATABASE_URL chưa được cấu hình trên server.",
      });
    }
    const token = extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Chưa đăng nhập phiên làm việc PostgreSQL.",
      });
    }
    const secret = await getSessionSecret(pool);
    const session = verifySessionToken(token, secret);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
      });
    }
    req.pgSession = session;
    next();
  } catch (err: any) {
    console.error("[PostgresSync] Auth error:", err);
    res.status(500).json({
      success: false,
      error: err?.message || "Lỗi xác thực phiên PostgreSQL.",
    });
  }
}

export function registerPostgresSyncRoutes(app: Express): void {
  // 1. Database configuration & health status (safe metadata only)
  app.get("/api/db/status", async (req, res) => {
    const connStr = getExternalDatabaseUrl();
    if (!connStr) {
      return res.json({
        configured: false,
        driver: "none",
        connected: false,
        schemaReady: false,
        bucketCount: 0,
        reportArchiveCount: 0,
        authenticated: false,
        serverTimeMs: Date.now(),
      });
    }

    try {
      const pool = getPool();
      if (!pool) {
        return res.json({
          configured: false,
          driver: "none",
          connected: false,
          schemaReady: false,
          bucketCount: 0,
          reportArchiveCount: 0,
          authenticated: false,
          serverTimeMs: Date.now(),
        });
      }

      await ensureSchema(pool);
      const [bucketCountRes, archiveCountRes] = await Promise.all([
        pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM app_buckets`),
        pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM app_report_archives`),
      ]);
      const { session } = await resolveSession(req);

      return res.json({
        configured: true,
        driver: "postgres",
        connected: true,
        schemaReady: true,
        bucketCount: parseInt(bucketCountRes.rows[0]?.cnt || "0", 10),
        reportArchiveCount: parseInt(archiveCountRes.rows[0]?.cnt || "0", 10),
        authenticated: Boolean(session),
        sessionUser: session
          ? { id: session.userId, name: session.name, role: session.role }
          : null,
        serverTimeMs: Date.now(),
      });
    } catch (err: any) {
      console.error("[PostgresSync] Status check failed:", err?.message || err);
      return res.json({
        configured: true,
        driver: "postgres",
        connected: false,
        schemaReady: false,
        bucketCount: 0,
        reportArchiveCount: 0,
        authenticated: false,
        serverTimeMs: Date.now(),
        error: "Không thể kết nối tới máy chủ PostgreSQL. Vui lòng kiểm tra lại EXTERNAL_DATABASE_URL.",
      });
    }
  });

  // 2. Non-sensitive public staff picker directory for LoginScreen (NO passwords/emails/phones/tokens)
  app.get("/api/auth/staff-directory", async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.json({
        configured: false,
        hasCloudUsers: false,
        authenticated: false,
        staff: [],
      });
    }

    try {
      const { users, existsInDb } = await getStoredUsers(pool);
      const { session } = await resolveSession(req);

      const safeStaff = users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        department: u.department || "Khoa Cận Lâm Sàng",
        title: u.title || u.role,
        avatar: u.avatar || "",
      }));

      return res.json({
        configured: true,
        hasCloudUsers: existsInDb,
        authenticated: Boolean(session),
        sessionUser: session
          ? { id: session.userId, name: session.name, role: session.role }
          : null,
        staff: safeStaff,
      });
    } catch (err: any) {
      return res.status(500).json({
        configured: true,
        hasCloudUsers: false,
        authenticated: false,
        staff: [],
        error: err?.message || "Không thể đọc danh sách cán bộ từ PostgreSQL.",
      });
    }
  });

  // 3. App Login (verifies Hospital OS userId/email + password against PostgreSQL users bucket)
  app.post("/api/auth/login", async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        error: "EXTERNAL_DATABASE_URL chưa được cấu hình trên server.",
      });
    }

    try {
      const { userId, email, password } = req.body || {};
      const cleanPass = String(password || "");
      if (!cleanPass) {
        return res.status(400).json({ success: false, error: "Vui lòng nhập mật khẩu." });
      }

      const { users, existsInDb } = await getStoredUsers(pool);
      const candidatePool = existsInDb ? users : [FALLBACK_ADMIN_RECORD];

      let matched: StaffLoginRecord | undefined;
      if (typeof userId === "string" && userId.trim()) {
        matched = candidatePool.find((u) => u.id === userId.trim());
      } else if (typeof email === "string" && email.trim()) {
        const lower = email.trim().toLowerCase();
        matched = candidatePool.find((u) => (u.email || "").toLowerCase() === lower);
      }

      if (!matched) {
        return res.status(401).json({
          success: false,
          error: "Không tìm thấy tài khoản cán bộ trong cơ sở dữ liệu.",
        });
      }

      const expectedPass =
        matched.password ||
        (matched.id === "USR-ADMIN" || matched.role === "Admin" ? "admin" : "123456");

      if (cleanPass !== expectedPass) {
        return res.status(401).json({
          success: false,
          error: "Mật khẩu không chính xác.",
        });
      }

      const secret = await getSessionSecret(pool);
      const sessionPayload: PgSessionPayload = {
        userId: matched.id,
        role: matched.role || "Staff",
        name: matched.name || "Cán bộ CLS",
        exp: Date.now() + SESSION_TTL_MS,
      };
      const token = signSessionToken(sessionPayload, secret);
      setSessionCookie(req, res, token);

      return res.json({
        success: true,
        token,
        dbBootstrapped: existsInDb,
        user: {
          id: matched.id,
          name: matched.name,
          role: matched.role,
          department: matched.department,
          title: matched.title,
          avatar: matched.avatar,
        },
      });
    } catch (err: any) {
      console.error("[PostgresSync] Login error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Lỗi đăng nhập với PostgreSQL.",
      });
    }
  });

  // 4. Logout
  app.post("/api/auth/logout", (req, res) => {
    const isHttps =
      req.secure ||
      req.headers["x-forwarded-proto"] === "https" ||
      (process.env.APP_URL || "").startsWith("https://");
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      path: "/",
    });
    res.json({ success: true });
  });

  // 5. Full State Pull (authenticated)
  app.get("/api/db/state", requirePgAuth, async (_req: AuthedRequest, res) => {
    try {
      const pool = getPool()!;
      await ensureSchema(pool);
      const [bucketsRes, archivesRes] = await Promise.all([
        pool.query<{
          bucket_key: string;
          items: Record<string, unknown>[];
          updated_at_ms: string;
          updated_by_name: string | null;
        }>(
          `SELECT bucket_key, items, updated_at_ms::text, updated_by_name FROM app_buckets`
        ),
        pool.query<{
          archive_key: string;
          year: number;
          month_key: string;
          items: unknown[];
          updated_at_ms: string;
        }>(
          `SELECT archive_key, year, month_key, items, updated_at_ms::text FROM app_report_archives`
        ),
      ]);

      const buckets: Record<
        string,
        { items: Record<string, unknown>[]; updatedAtMs: number; updatedByName?: string | null }
      > = {};
      for (const row of bucketsRes.rows) {
        if (!ALLOWED_CLOUD_BUCKETS.has(row.bucket_key)) continue;
        buckets[row.bucket_key] = {
          items: Array.isArray(row.items) ? row.items : [],
          updatedAtMs: Number(row.updated_at_ms || 0),
          updatedByName: row.updated_by_name,
        };
      }

      const reportArchives = archivesRes.rows.map((r) => ({
        archiveKey: r.archive_key,
        year: Number(r.year),
        monthKey: r.month_key,
        items: Array.isArray(r.items) ? r.items : [],
        updatedAtMs: Number(r.updated_at_ms || 0),
      }));

      res.json({
        success: true,
        buckets,
        reportArchives,
        serverTimeMs: Date.now(),
      });
    } catch (err: any) {
      console.error("[PostgresSync] /api/db/state error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể tải dữ liệu từ PostgreSQL.",
      });
    }
  });

  // 6. Incremental Changes Polling (authenticated)
  app.get("/api/db/changes", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const pool = getPool()!;
      await ensureSchema(pool);
      const since = Math.max(0, Number(req.query.since || 0) || 0);

      const [bucketsRes, archivesRes] = await Promise.all([
        pool.query<{
          bucket_key: string;
          items: Record<string, unknown>[];
          updated_at_ms: string;
        }>(
          `SELECT bucket_key, items, updated_at_ms::text
           FROM app_buckets
           WHERE updated_at_ms > $1`,
          [since]
        ),
        pool.query<{
          archive_key: string;
          year: number;
          month_key: string;
          items: unknown[];
          updated_at_ms: string;
        }>(
          `SELECT archive_key, year, month_key, items, updated_at_ms::text
           FROM app_report_archives
           WHERE updated_at_ms > $1`,
          [since]
        ),
      ]);

      res.json({
        success: true,
        buckets: bucketsRes.rows
          .filter((r) => ALLOWED_CLOUD_BUCKETS.has(r.bucket_key))
          .map((r) => ({
            bucketKey: r.bucket_key,
            items: Array.isArray(r.items) ? r.items : [],
            updatedAtMs: Number(r.updated_at_ms || 0),
          })),
        reportArchives: archivesRes.rows.map((r) => ({
          archiveKey: r.archive_key,
          year: Number(r.year),
          monthKey: r.month_key,
          items: Array.isArray(r.items) ? r.items : [],
          updatedAtMs: Number(r.updated_at_ms || 0),
        })),
        serverTimeMs: Date.now(),
      });
    } catch (err: any) {
      console.error("[PostgresSync] /api/db/changes error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Lỗi kiểm tra đồng bộ PostgreSQL.",
      });
    }
  });

  // 7. Upsert Single Bucket (authenticated)
  app.put("/api/db/bucket/:bucketKey", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const bucketKey = String(req.params.bucketKey || "").trim();
      if (!ALLOWED_CLOUD_BUCKETS.has(bucketKey)) {
        return res.status(400).json({ success: false, error: "Bucket key không hợp lệ." });
      }

      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const safeItems = sanitizeBucketItems(req.body?.items);

      const rbacCheck = await enforceServerBucketRbac(pool, session, bucketKey, safeItems);
      if (rbacCheck.allowed === false) {
        return res.status(rbacCheck.status).json({
          success: false,
          error: rbacCheck.error,
        });
      }

      const nowMs = Date.now();
      await pool.query(
        `INSERT INTO app_buckets (bucket_key, items, item_count, updated_by_id, updated_by_name, updated_at_ms, updated_at)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6, NOW())
         ON CONFLICT (bucket_key)
         DO UPDATE SET
           items = EXCLUDED.items,
           item_count = EXCLUDED.item_count,
           updated_by_id = EXCLUDED.updated_by_id,
           updated_by_name = EXCLUDED.updated_by_name,
           updated_at_ms = EXCLUDED.updated_at_ms,
           updated_at = NOW()`,
        [bucketKey, JSON.stringify(safeItems), safeItems.length, session.userId, session.name, nowMs]
      );

      res.json({
        success: true,
        bucketKey,
        itemCount: safeItems.length,
        updatedAtMs: nowMs,
      });

      broadcastPostgresChange(pool, {
        type: "bucket",
        key: bucketKey,
        updatedAtMs: nowMs,
        actorId: session.userId,
      });
    } catch (err: any) {
      console.error("[PostgresSync] PUT bucket error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể lưu dữ liệu vào PostgreSQL.",
      });
    }
  });

  // 8. Upsert Single Report Archive Month (authenticated)
  app.put("/api/db/report-archive/:archiveKey", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const archiveKey = String(req.params.archiveKey || "").trim();
      if (!ARCHIVE_KEY_REGEX.test(archiveKey)) {
        return res.status(400).json({ success: false, error: "Archive key không hợp lệ." });
      }

      const year = Number(req.body?.year);
      const monthKey = String(req.body?.monthKey || "").trim().slice(0, 24);
      const safeItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
      if (!Number.isInteger(year) || year < 1900 || year > 2100 || !monthKey) {
        return res.status(400).json({ success: false, error: "Thông tin năm/tháng báo cáo không hợp lệ." });
      }

      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const nowMs = Date.now();

      await pool.query(
        `INSERT INTO app_report_archives (archive_key, year, month_key, items, updated_by_id, updated_by_name, updated_at_ms, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
         ON CONFLICT (archive_key)
         DO UPDATE SET
           year = EXCLUDED.year,
           month_key = EXCLUDED.month_key,
           items = EXCLUDED.items,
           updated_by_id = EXCLUDED.updated_by_id,
           updated_by_name = EXCLUDED.updated_by_name,
           updated_at_ms = EXCLUDED.updated_at_ms,
           updated_at = NOW()`,
        [archiveKey, year, monthKey, JSON.stringify(safeItems), session.userId, session.name, nowMs]
      );

      res.json({
        success: true,
        archiveKey,
        updatedAtMs: nowMs,
      });

      broadcastPostgresChange(pool, {
        type: "report_archive",
        key: archiveKey,
        updatedAtMs: nowMs,
        actorId: session.userId,
      });
    } catch (err: any) {
      console.error("[PostgresSync] PUT report archive error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể lưu báo cáo tháng lên PostgreSQL.",
      });
    }
  });

  // 9. Bulk Push All Buckets & Report Archives (Admin or initial migration)
  app.post("/api/db/bulk-push", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;

      const countRes = await pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM app_buckets`);
      const existingBuckets = parseInt(countRes.rows[0]?.cnt || "0", 10);
      if (existingBuckets > 0) {
        const { actorAccess } = await resolveServerRbacContext(pool, session);
        if (!actorAccess.isSystemAdmin) {
          return res.status(403).json({
            success: false,
            error: "Chỉ Admin mới có quyền ghi đè toàn bộ cơ sở dữ liệu PostgreSQL.",
          });
        }
      }

      const rawBuckets = (req.body?.buckets || {}) as Record<string, unknown>;
      const rawArchives = Array.isArray(req.body?.reportArchives) ? req.body.reportArchives : [];
      const nowMs = Date.now();

      let bucketsPushed = 0;
      let reportMonthsPushed = 0;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const [bucketKey, rawItems] of Object.entries(rawBuckets)) {
          if (!ALLOWED_CLOUD_BUCKETS.has(bucketKey)) continue;
          const safeItems = sanitizeBucketItems(rawItems);
          await client.query(
            `INSERT INTO app_buckets (bucket_key, items, item_count, updated_by_id, updated_by_name, updated_at_ms, updated_at)
             VALUES ($1, $2::jsonb, $3, $4, $5, $6, NOW())
             ON CONFLICT (bucket_key)
             DO UPDATE SET
               items = EXCLUDED.items,
               item_count = EXCLUDED.item_count,
               updated_by_id = EXCLUDED.updated_by_id,
               updated_by_name = EXCLUDED.updated_by_name,
               updated_at_ms = EXCLUDED.updated_at_ms,
               updated_at = NOW()`,
            [bucketKey, JSON.stringify(safeItems), safeItems.length, session.userId, session.name, nowMs]
          );
          bucketsPushed++;
        }

        for (const arch of rawArchives) {
          if (!arch || typeof arch !== "object") continue;
          const archiveKey = String(arch.archiveKey || "").trim();
          const year = Number(arch.year);
          const monthKey = String(arch.monthKey || "").trim().slice(0, 24);
          const safeItems = Array.isArray(arch.items) ? arch.items.slice(0, 500) : [];
          if (!ARCHIVE_KEY_REGEX.test(archiveKey) || !Number.isInteger(year) || !monthKey) continue;

          await client.query(
            `INSERT INTO app_report_archives (archive_key, year, month_key, items, updated_by_id, updated_by_name, updated_at_ms, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
             ON CONFLICT (archive_key)
             DO UPDATE SET
               year = EXCLUDED.year,
               month_key = EXCLUDED.month_key,
               items = EXCLUDED.items,
               updated_by_id = EXCLUDED.updated_by_id,
               updated_by_name = EXCLUDED.updated_by_name,
               updated_at_ms = EXCLUDED.updated_at_ms,
               updated_at = NOW()`,
            [archiveKey, year, monthKey, JSON.stringify(safeItems), session.userId, session.name, nowMs]
          );
          reportMonthsPushed++;
        }

        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }

      res.json({
        success: true,
        bucketsPushed,
        reportMonthsPushed,
        updatedAtMs: nowMs,
      });

      broadcastPostgresChange(pool, {
        type: "bulk",
        key: "all",
        updatedAtMs: nowMs,
        actorId: session.userId,
      });
    } catch (err: any) {
      console.error("[PostgresSync] Bulk push error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Lỗi đồng bộ hàng loạt lên PostgreSQL.",
      });
    }
  });

  // 10. Real-Time Live Sync Server-Sent Events Stream (authenticated)
  app.get("/api/db/stream", requirePgAuth, async (req: AuthedRequest, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).end();
    }

    await ensureSchema(pool);
    void ensurePgNotifyListener(pool);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const sendEvent = (eventName: string, payload: unknown) => {
      if (res.writableEnded) return;
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent("ready", {
      live: true,
      serverTimeMs: Date.now(),
      pgNotifyActive: Boolean(notifyListenerClient),
    });

    const onChange = (evt: PostgresLiveChangeEvent) => {
      sendEvent("change", evt);
    };
    syncStreamClients.add(onChange);

    const keepAliveTimer = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: ping ${Date.now()}\n\n`);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAliveTimer);
      syncStreamClients.delete(onChange);
    });
  });
}

// ==========================================
// SERVER-SIDE HELPERS FOR SCHEDULED ALERTS
// ==========================================

export function isPostgresConfigured(): boolean {
  return Boolean(getPool());
}

async function withServerDbRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 1200): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i + 1 < attempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

export async function loadCloudBucketsStatusForServer(bucketKeys: string[]): Promise<{
  configured: boolean;
  reachable: boolean;
  buckets: Record<string, Record<string, unknown>[]>;
  error?: string;
}> {
  const pool = getPool();
  if (!pool) {
    return { configured: false, reachable: false, buckets: {} };
  }
  if (bucketKeys.length === 0) {
    return { configured: true, reachable: true, buckets: {} };
  }

  try {
    const validKeys = bucketKeys.filter((k) => ALLOWED_CLOUD_BUCKETS.has(k));
    if (validKeys.length === 0) {
      return { configured: true, reachable: true, buckets: {} };
    }

    const res = await withServerDbRetry(async () => {
      await ensureSchema(pool);
      return pool.query<{
        bucket_key: string;
        items: Record<string, unknown>[];
      }>(
        `SELECT bucket_key, items FROM app_buckets WHERE bucket_key = ANY($1::text[])`,
        [validKeys]
      );
    });

    const out: Record<string, Record<string, unknown>[]> = {};
    for (const row of res.rows) {
      out[row.bucket_key] = Array.isArray(row.items) ? row.items : [];
    }
    return { configured: true, reachable: true, buckets: out };
  } catch (err: any) {
    console.error("[PostgresSync] loadCloudBucketsStatusForServer error:", err?.message);
    return {
      configured: true,
      reachable: false,
      buckets: {},
      error: err?.message || "Database read failed",
    };
  }
}

export async function loadCloudBucketsForServer(
  bucketKeys: string[]
): Promise<Record<string, Record<string, unknown>[]>> {
  const res = await loadCloudBucketsStatusForServer(bucketKeys);
  return res.buckets;
}

export async function loadReportArchiveMonthStatusForServer(
  year: number,
  monthNum: number
): Promise<{
  configured: boolean;
  reachable: boolean;
  items: Record<string, unknown>[];
  error?: string;
}> {
  const pool = getPool();
  if (!pool) {
    return { configured: false, reachable: false, items: [] };
  }
  const archiveKey = `${year}_m${String(Math.min(12, Math.max(1, monthNum))).padStart(2, "0")}`;
  try {
    const res = await withServerDbRetry(async () => {
      await ensureSchema(pool);
      return pool.query<{ items: Record<string, unknown>[] }>(
        `SELECT items FROM app_report_archives WHERE archive_key = $1`,
        [archiveKey]
      );
    });
    const items = res.rows[0]?.items;
    return {
      configured: true,
      reachable: true,
      items: Array.isArray(items) ? items : [],
    };
  } catch (err: any) {
    console.error("[PostgresSync] loadReportArchiveMonthStatusForServer error:", err?.message);
    return {
      configured: true,
      reachable: false,
      items: [],
      error: err?.message || "Archive read failed",
    };
  }
}

export async function loadReportArchiveMonthForServer(
  year: number,
  monthNum: number
): Promise<Record<string, unknown>[]> {
  const res = await loadReportArchiveMonthStatusForServer(year, monthNum);
  return res.items;
}

export async function upsertReportArchiveMonthFromServer(
  year: number,
  monthNum: number,
  monthKey: string,
  items: unknown[]
): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const archiveKey = `${year}_m${String(Math.min(12, Math.max(1, monthNum))).padStart(2, "0")}`;
  if (!ARCHIVE_KEY_REGEX.test(archiveKey)) return false;

  try {
    await ensureSchema(pool);
    const safeItems = Array.isArray(items) ? items.slice(0, 500) : [];
    const nowMs = Date.now();
    await pool.query(
      `INSERT INTO app_report_archives (archive_key, year, month_key, items, updated_by_id, updated_by_name, updated_at_ms, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
       ON CONFLICT (archive_key)
       DO UPDATE SET
         year = EXCLUDED.year,
         month_key = EXCLUDED.month_key,
         items = EXCLUDED.items,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_at_ms = EXCLUDED.updated_at_ms,
         updated_at = NOW()`,
      [
        archiveKey,
        year,
        monthKey,
        JSON.stringify(safeItems),
        "SYS-SCHEDULER",
        "Hệ thống Cảnh báo Tự động",
        nowMs,
      ]
    );

    broadcastPostgresChange(pool, {
      type: "report_archive",
      key: archiveKey,
      updatedAtMs: nowMs,
      actorId: "SYS-SCHEDULER",
    });
    return true;
  } catch (err: any) {
    console.error("[PostgresSync] upsertReportArchiveMonthFromServer error:", err?.message);
    return false;
  }
}

export async function appendSystemNotificationToDb(
  notif: NotificationLog
): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    await ensureSchema(pool);
    const res = await pool.query<{ items: Record<string, unknown>[] }>(
      `SELECT items FROM app_buckets WHERE bucket_key = 'notifications'`
    );
    const existing = Array.isArray(res.rows[0]?.items) ? res.rows[0].items : [];
    const next = [notif, ...existing].slice(0, 200);
    const nowMs = Date.now();

    await pool.query(
      `INSERT INTO app_buckets (bucket_key, items, item_count, updated_by_id, updated_by_name, updated_at_ms, updated_at)
       VALUES ('notifications', $1::jsonb, $2, 'SYS-SCHEDULER', 'Hệ thống Cảnh báo Tự động', $3, NOW())
       ON CONFLICT (bucket_key)
       DO UPDATE SET
         items = EXCLUDED.items,
         item_count = EXCLUDED.item_count,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_at_ms = EXCLUDED.updated_at_ms,
         updated_at = NOW()`,
      [JSON.stringify(next), next.length, nowMs]
    );

    broadcastPostgresChange(pool, {
      type: "bucket",
      key: "notifications",
      updatedAtMs: nowMs,
      actorId: "SYS-SCHEDULER",
    });
    return true;
  } catch (err: any) {
    console.error("[PostgresSync] appendSystemNotificationToDb error:", err?.message);
    return false;
  }
}

export async function saveScheduledAlertRulesToDb(
  rules: ScheduledAlertRuleConfig[]
): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    await ensureSchema(pool);
    const res = await pool.query<{ items: Record<string, unknown>[] }>(
      `SELECT items FROM app_buckets WHERE bucket_key = 'settings'`
    );
    const currentList = Array.isArray(res.rows[0]?.items) ? res.rows[0].items : [];
    const baseSettings =
      currentList[0] && typeof currentList[0] === "object"
        ? { ...currentList[0] }
        : {};
    const nextSettings = [{ ...baseSettings, scheduledAlertsConfig: rules }];
    const nowMs = Date.now();

    await pool.query(
      `INSERT INTO app_buckets (bucket_key, items, item_count, updated_by_id, updated_by_name, updated_at_ms, updated_at)
       VALUES ('settings', $1::jsonb, 1, 'SYS-SCHEDULER', 'Cấu hình Cảnh báo Tự động', $2, NOW())
       ON CONFLICT (bucket_key)
       DO UPDATE SET
         items = EXCLUDED.items,
         item_count = EXCLUDED.item_count,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_at_ms = EXCLUDED.updated_at_ms,
         updated_at = NOW()`,
      [JSON.stringify(nextSettings), nowMs]
    );

    broadcastPostgresChange(pool, {
      type: "bucket",
      key: "settings",
      updatedAtMs: nowMs,
      actorId: "SYS-SCHEDULER",
    });
    return true;
  } catch (err: any) {
    console.error("[PostgresSync] saveScheduledAlertRulesToDb error:", err?.message);
    return false;
  }
}

export async function appendSyncHistoryEntryToDb(
  entry: SyncHistoryEntry
): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    await ensureSchema(pool);
    const res = await pool.query<{ items: Record<string, unknown>[] }>(
      `SELECT items FROM app_buckets WHERE bucket_key = 'sync_history'`
    );
    const existing = Array.isArray(res.rows[0]?.items) ? res.rows[0].items : [];
    const trimmedEntry: SyncHistoryEntry = {
      ...entry,
      autoWrittenSamples: entry.autoWrittenSamples?.slice(0, 80),
      discrepancies: entry.discrepancies?.slice(0, 250),
    };
    const next = [
      trimmedEntry,
      ...existing.filter((e: any) => e && e.id !== entry.id),
    ].slice(0, 80);
    const nowMs = Date.now();

    await pool.query(
      `INSERT INTO app_buckets (bucket_key, items, item_count, updated_by_id, updated_by_name, updated_at_ms, updated_at)
       VALUES ('sync_history', $1::jsonb, $2, 'SYS-SCHEDULER', 'Hệ thống Đồng bộ Tự động', $3, NOW())
       ON CONFLICT (bucket_key)
       DO UPDATE SET
         items = EXCLUDED.items,
         item_count = EXCLUDED.item_count,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_at_ms = EXCLUDED.updated_at_ms,
         updated_at = NOW()`,
      [JSON.stringify(next), next.length, nowMs]
    );

    broadcastPostgresChange(pool, {
      type: "bucket",
      key: "sync_history",
      updatedAtMs: nowMs,
      actorId: "SYS-SCHEDULER",
    });
    return true;
  } catch (err: any) {
    console.error("[PostgresSync] appendSyncHistoryEntryToDb error:", err?.message);
    return false;
  }
}

export async function mergeSheetConfigIntoSettingsDbIfMissing(
  incomingSettings?: Partial<AppSettings> | null
): Promise<boolean> {
  if (!incomingSettings || typeof incomingSettings !== "object") return false;
  const incomingUrl = String(incomingSettings.googleSheetUrl || "").trim();
  const incomingSheetId = String(incomingSettings.reportGoogleSheetId || "").trim();
  const incomingByYear =
    incomingSettings.reportGoogleSheetsByYear &&
    typeof incomingSettings.reportGoogleSheetsByYear === "object"
      ? incomingSettings.reportGoogleSheetsByYear
      : null;

  const hasIncomingByYear = Boolean(
    incomingByYear &&
      Object.values(incomingByYear).some(
        (cfg) => cfg && (String(cfg.url || "").trim() || String(cfg.sheetId || "").trim())
      )
  );
  if (!incomingUrl && !incomingSheetId && !hasIncomingByYear) {
    return false;
  }

  const pool = getPool();
  if (!pool) return false;

  try {
    await ensureSchema(pool);
    const res = await pool.query<{ items: Record<string, unknown>[] }>(
      `SELECT items FROM app_buckets WHERE bucket_key = 'settings'`
    );
    const currentList = Array.isArray(res.rows[0]?.items) ? res.rows[0].items : [];
    const baseSettings =
      currentList[0] && typeof currentList[0] === "object"
        ? ({ ...currentList[0] } as Partial<AppSettings>)
        : ({} as Partial<AppSettings>);

    let changed = false;

    if (!String(baseSettings.googleSheetUrl || "").trim() && incomingUrl) {
      baseSettings.googleSheetUrl = incomingUrl;
      changed = true;
    }
    if (!String(baseSettings.reportGoogleSheetId || "").trim() && incomingSheetId) {
      baseSettings.reportGoogleSheetId = incomingSheetId;
      changed = true;
    }
    if (!baseSettings.reportSheetYear && incomingSettings.reportSheetYear) {
      baseSettings.reportSheetYear = incomingSettings.reportSheetYear;
      changed = true;
    }

    if (incomingByYear) {
      const mergedByYear = { ...(baseSettings.reportGoogleSheetsByYear || {}) };
      for (const [yr, cfg] of Object.entries(incomingByYear)) {
        if (!cfg || (!String(cfg.url || "").trim() && !String(cfg.sheetId || "").trim())) {
          continue;
        }
        const existingCfg = mergedByYear[yr];
        const existingHas = Boolean(
          existingCfg && (String(existingCfg.url || "").trim() || String(existingCfg.sheetId || "").trim())
        );
        if (!existingHas) {
          mergedByYear[yr] = cfg;
          changed = true;
        }
      }
      if (changed) {
        baseSettings.reportGoogleSheetsByYear = mergedByYear;
      }
    }

    if (!changed) return false;

    const nowMs = Date.now();
    await pool.query(
      `INSERT INTO app_buckets (bucket_key, items, item_count, updated_by_id, updated_by_name, updated_at_ms, updated_at)
       VALUES ('settings', $1::jsonb, 1, 'SYS-SCHEDULER', 'Đồng bộ Cấu hình Sheet', $2, NOW())
       ON CONFLICT (bucket_key)
       DO UPDATE SET
         items = EXCLUDED.items,
         item_count = EXCLUDED.item_count,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_at_ms = EXCLUDED.updated_at_ms,
         updated_at = NOW()`,
      [JSON.stringify([baseSettings]), nowMs]
    );

    broadcastPostgresChange(pool, {
      type: "bucket",
      key: "settings",
      updatedAtMs: nowMs,
      actorId: "SYS-SCHEDULER",
    });
    return true;
  } catch (err: any) {
    console.error("[PostgresSync] mergeSheetConfigIntoSettingsDbIfMissing error:", err?.message);
    return false;
  }
}

const inMemoryDailyAlertClaims = new Set<string>();

function buildDailyAlertLockKey(ruleId: string, dateVN: string, timeHHmm?: string): string {
  const timeSuffix = timeHHmm ? `_${String(timeHHmm).replace(/[^0-9]/g, "")}` : "";
  return `scheduled_alert_lock_${ruleId}_${dateVN}${timeSuffix}`;
}

export async function tryClaimDailyAlertLock(
  ruleId: string,
  dateVN: string,
  timeHHmm: string,
  hostLabel: string
): Promise<boolean> {
  const lockKey = buildDailyAlertLockKey(ruleId, dateVN, timeHHmm);
  const legacyKey = buildDailyAlertLockKey(ruleId, dateVN);
  const pool = getPool();
  if (!pool) {
    if (inMemoryDailyAlertClaims.has(lockKey)) return false;
    inMemoryDailyAlertClaims.add(lockKey);
    return true;
  }

  try {
    await ensureSchema(pool);
    // Respect legacy key too if exact default time hasn't changed
    const legacyRes = await pool.query<{ meta_key: string }>(
      `SELECT meta_key FROM app_meta WHERE meta_key = $1 LIMIT 1`,
      [legacyKey]
    );
    if (legacyRes.rows.length > 0) {
      return false;
    }

    const payload = JSON.stringify({
      claimedAt: new Date().toISOString(),
      timeHHmm,
      hostLabel: hostLabel || "cls-server",
    });
    const res = await pool.query<{ meta_key: string }>(
      `INSERT INTO app_meta (meta_key, meta_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (meta_key) DO NOTHING
       RETURNING meta_key`,
      [lockKey, payload]
    );
    return res.rows.length > 0;
  } catch (err: any) {
    console.error("[PostgresSync] tryClaimDailyAlertLock error:", err?.message);
    if (inMemoryDailyAlertClaims.has(lockKey)) return false;
    inMemoryDailyAlertClaims.add(lockKey);
    return true;
  }
}

export async function releaseDailyAlertLock(
  ruleId: string,
  dateVN: string,
  timeHHmm: string
): Promise<void> {
  const lockKey = buildDailyAlertLockKey(ruleId, dateVN, timeHHmm);
  const legacyKey = buildDailyAlertLockKey(ruleId, dateVN);
  inMemoryDailyAlertClaims.delete(lockKey);
  inMemoryDailyAlertClaims.delete(legacyKey);
  const pool = getPool();
  if (!pool) return;

  try {
    await ensureSchema(pool);
    await pool.query(`DELETE FROM app_meta WHERE meta_key = ANY($1::text[])`, [
      [lockKey, legacyKey],
    ]);
  } catch {
    // ignore cleanup error
  }
}

export async function clearTodayAlertLocksForRule(ruleId: string, dateVN: string): Promise<void> {
  const prefix = `scheduled_alert_lock_${ruleId}_${dateVN}`;
  for (const k of Array.from(inMemoryDailyAlertClaims)) {
    if (k.startsWith(prefix)) inMemoryDailyAlertClaims.delete(k);
  }
  const pool = getPool();
  if (!pool) return;

  try {
    await ensureSchema(pool);
    await pool.query(`DELETE FROM app_meta WHERE meta_key LIKE $1`, [`${prefix}%`]);
  } catch {
    // ignore
  }
}

const SCHEDULED_ALERT_HISTORY_META_KEY = "scheduled_alert_history_v1";
let inMemoryAlertHistory: ScheduledAlertHistoryItem[] = [];

export async function loadScheduledAlertHistoryFromDb(): Promise<ScheduledAlertHistoryItem[]> {
  const pool = getPool();
  if (!pool) return inMemoryAlertHistory;

  try {
    await ensureSchema(pool);
    const res = await pool.query<{ meta_value: string }>(
      `SELECT meta_value FROM app_meta WHERE meta_key = $1`,
      [SCHEDULED_ALERT_HISTORY_META_KEY]
    );
    const raw = res.rows[0]?.meta_value;
    if (!raw) return inMemoryAlertHistory;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScheduledAlertHistoryItem[]) : [];
  } catch {
    return inMemoryAlertHistory;
  }
}

export async function appendScheduledAlertHistoryToDb(
  entry: ScheduledAlertHistoryItem
): Promise<ScheduledAlertHistoryItem[]> {
  const current = await loadScheduledAlertHistoryFromDb();
  const next = [entry, ...current.filter((h) => h.id !== entry.id)].slice(0, 60);
  inMemoryAlertHistory = next;

  const pool = getPool();
  if (!pool) return next;

  try {
    await ensureSchema(pool);
    await pool.query(
      `INSERT INTO app_meta (meta_key, meta_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (meta_key)
       DO UPDATE SET meta_value = EXCLUDED.meta_value, updated_at = NOW()`,
      [SCHEDULED_ALERT_HISTORY_META_KEY, JSON.stringify(next)]
    );
  } catch (err: any) {
    console.error("[PostgresSync] appendScheduledAlertHistoryToDb error:", err?.message);
  }
  return next;
}

