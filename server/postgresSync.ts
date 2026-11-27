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
import {
  filterActiveLoginUsers,
  isUserAccountBlockedOrResigned,
} from "../src/utils/staffStatus";
import {
  ensureNormalizedTablesAndMigrate,
  extractEntityRecordId,
  loadEntityVersionMap,
  loadFileBlobFromDb,
  rebuildAppBucketProjectionInTx,
  saveFileBlobToDb,
  syncNormalizedReportMonthInTx,
  syncNormalizedRowsFromBucketInTx,
  upsertReportCellsAndRebuildArchiveInTx,
  type CellUpdateInput,
  type StoredFileMeta,
} from "./normalizedStore";

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
  type:
    | "bucket"
    | "report_archive"
    | "bulk"
    | "telegram_takeover"
    | "entities"
    | "preferences"
    | "reminders";
  key: string;
  updatedAtMs: number;
  actorId: string;
  emitterId?: string;
  entityTypes?: string[];
  meta?: Record<string, string>;
}

const SERVER_EMITTER_ID = crypto.randomUUID().slice(0, 8);
const memoryFileBlobFallback = new Map<string, { meta: StoredFileMeta; content: Buffer }>();
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
      await ensureNormalizedTablesAndMigrate(pool);
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

export async function claimTelegramUpdateOnce(
  tokenHash: string,
  updateId: number,
  chatId: string | number,
  messageId?: number
): Promise<boolean> {
  const pool = getPool();
  if (!pool || !tokenHash || !Number.isFinite(updateId) || updateId <= 0) return true;
  try {
    await ensureSchema(pool);
    const metaKey = `tg_upd_${tokenHash}_${Math.floor(updateId)}_${String(chatId)}_${
      Number.isFinite(messageId) ? Math.floor(Number(messageId)) : 0
    }`;
    const res = await pool.query(
      `INSERT INTO app_meta (meta_key, meta_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (meta_key) DO NOTHING
       RETURNING meta_key`,
      [metaKey, new Date().toISOString()]
    );
    if (Math.random() < 0.04) {
      await pool
        .query(
          `DELETE FROM app_meta WHERE meta_key LIKE 'tg_upd_%' AND updated_at < NOW() - INTERVAL '2 days'`
        )
        .catch(() => {});
    }
    return (res.rowCount || 0) > 0;
  } catch {
    // If DB temporarily fails, let in-memory Set handle deduplication
    return true;
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

const SCRYPT_PREFIX = "scrypt$";
const LOGIN_RATE_WINDOW_MS = 2 * 60 * 1000;
const LOGIN_RATE_MAX_FAILURES = 12;
const authFailureTracker = new Map<string, { count: number; resetAt: number }>();

function getAuthRateKey(req: Request, identifier: string): string {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = fwd || req.ip || "unknown";
  return `${ip}::${identifier.toLowerCase().slice(0, 80)}`;
}

function checkAuthRateLimited(rateKey: string): boolean {
  const now = Date.now();
  const entry = authFailureTracker.get(rateKey);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    authFailureTracker.delete(rateKey);
    return false;
  }
  return entry.count >= LOGIN_RATE_MAX_FAILURES;
}

function recordAuthFailure(rateKey: string): void {
  const now = Date.now();
  if (authFailureTracker.size > 2000) {
    for (const [k, v] of authFailureTracker.entries()) {
      if (v.resetAt <= now) authFailureTracker.delete(k);
    }
    if (authFailureTracker.size > 2000) authFailureTracker.clear();
  }
  const existing = authFailureTracker.get(rateKey);
  if (!existing || existing.resetAt <= now) {
    authFailureTracker.set(rateKey, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

function clearAuthFailures(rateKey: string): void {
  authFailureTracker.delete(rateKey);
}

export function isHashedPassword(stored?: unknown): stored is string {
  if (typeof stored !== "string" || !stored.startsWith(SCRYPT_PREFIX)) return false;
  const parts = stored.split("$");
  return parts.length === 3 && Boolean(parts[1]) && Boolean(parts[2]);
}

export function hashPasswordScrypt(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

export function verifyPasswordConstantTime(plain: string, stored: string): boolean {
  if (isHashedPassword(stored)) {
    const [, saltHex, hashHex] = stored.split("$");
    try {
      const expectedBuf = Buffer.from(hashHex, "hex");
      const actualBuf = crypto.scryptSync(plain, saltHex, 64);
      if (expectedBuf.length !== actualBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }
  const plainDigest = crypto.createHash("sha256").update(plain, "utf8").digest();
  const storedDigest = crypto.createHash("sha256").update(stored, "utf8").digest();
  return crypto.timingSafeEqual(plainDigest, storedDigest);
}

function scrubBucketItemsForClient(
  bucketKey: string,
  items: unknown,
  viewerIsAdmin: boolean
): Record<string, unknown>[] {
  if (!Array.isArray(items)) return [];
  if (bucketKey === "users") {
    return items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return {};
      const copy = { ...(item as Record<string, unknown>) };
      const hasPw = typeof copy.password === "string" && copy.password.length > 0;
      delete copy.password;
      copy.hasPassword = hasPw;
      return copy;
    });
  }
  if (bucketKey === "settings") {
    return items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return {};
      const copy = { ...(item as Record<string, unknown>) };
      const rawToken = typeof copy.telegramBotToken === "string" ? copy.telegramBotToken.trim() : "";
      delete copy.telegramBotToken;
      copy.hasTelegramBotToken = Boolean(rawToken);
      if (viewerIsAdmin && rawToken.length >= 8) {
        copy.telegramBotTokenHint = `••••${rawToken.slice(-6)}`;
      } else {
        delete copy.telegramBotTokenHint;
      }
      return copy;
    });
  }
  return items as Record<string, unknown>[];
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
  return "";
}

function isHttpsRequest(req: Request): boolean {
  const fwdProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return Boolean(req.secure || fwdProto === "https");
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "HttpOnly",
  ];
  if (isHttps) {
    attrs.push("Secure", "SameSite=None", "Partitioned");
  } else {
    attrs.push("SameSite=Lax");
  }
  res.append("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
  ];
  if (isHttps) {
    attrs.push("Secure", "SameSite=None", "Partitioned");
  } else {
    attrs.push("SameSite=Lax");
  }
  res.append("Set-Cookie", attrs.join("; "));
}

function sanitizeBucketItems(rawItems: unknown, bucketKey?: string): Record<string, unknown>[] {
  if (!Array.isArray(rawItems)) return [];
  const cap = bucketKey === "audit_logs" ? 250 : 2000;
  return rawItems.slice(0, cap).map((item) => {
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

async function getStoredStaffProfiles(pool: Pool): Promise<StaffProfile[]> {
  await ensureSchema(pool);
  const res = await pool.query<{ items: unknown }>(
    `SELECT items FROM app_buckets WHERE bucket_key = 'staff_profiles' LIMIT 1`
  );
  if (!res.rows[0] || !Array.isArray(res.rows[0].items)) {
    return [];
  }
  return res.rows[0].items.filter(
    (s): s is StaffProfile => Boolean(s && typeof s === "object")
  );
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
    const SELF_SAFE_KEYS = ["password", "hasPassword", "avatar", "resetRequested", "resetRequestNote"];
    const USER_RBAC_KEYS = [
      "role",
      "managementLevel",
      "managedDepartments",
      "managedRooms",
      "permissionOverrides",
    ];

    for (const rawNext of safeItems) {
      const nextUser = rawNext as unknown as User;
      if (!nextUser?.id) continue;
      nextIds.add(nextUser.id);
      const prevUser = prevById.get(nextUser.id);
      const incomingPlainPass = typeof rawNext.password === "string" ? rawNext.password.trim() : "";

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

      const prevClean = stripObjectKeys(prevUser as unknown as Record<string, unknown>, ["password", "hasPassword"]);
      const nextClean = stripObjectKeys(rawNext, ["password", "hasPassword"]);
      if (stableStringify(prevClean) === stableStringify(nextClean) && !incomingPlainPass) continue;

      const prevRaw = prevUser as unknown as Record<string, unknown>;

      // Allow own safe profile updates (passwords should use /api/auth/change-password)
      if (prevUser.id === session.userId) {
        const onlySelfSafeChanged =
          stableStringify(stripObjectKeys(prevRaw, SELF_SAFE_KEYS)) ===
          stableStringify(stripObjectKeys(rawNext, SELF_SAFE_KEYS));
        if (onlySelfSafeChanged && !incomingPlainPass) continue;
      }

      if (isAdminIdentity(prevUser) || isAdminIdentity(nextUser)) {
        return {
          allowed: false,
          status: 403,
          error: "Chỉ Admin hệ thống mới có quyền chỉnh sửa hoặc gán vai trò tài khoản Admin.",
        };
      }

      const rbacOrCredsChanged =
        Boolean(incomingPlainPass) ||
        USER_RBAC_KEYS.some((k) => stableStringify(prevRaw[k]) !== stableStringify(rawNext[k]));
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
        stableStringify(stripObjectKeys(prevRaw, [...USER_RBAC_KEYS, "password", "hasPassword"])) !==
        stableStringify(stripObjectKeys(rawNext, [...USER_RBAC_KEYS, "password", "hasPassword"]));

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

function verifyMutationOriginOrHeader(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ") && authHeader.slice(7).trim().length > 10) {
    return true;
  }
  if (req.headers["x-requested-with"]) {
    return true;
  }
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
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
  if (!session) return { pool, session: null };

  try {
    const [{ users, existsInDb }, staffProfiles] = await Promise.all([
      getStoredUsers(pool),
      getStoredStaffProfiles(pool),
    ]);
    if (existsInDb) {
      const matched = users.find((u) => u.id === session.userId);
      if (
        matched &&
        isUserAccountBlockedOrResigned(
          {
            id: matched.id,
            name: matched.name,
            role: matched.role as User["role"],
            status: typeof matched.status === "string" ? matched.status : undefined,
          },
          staffProfiles
        )
      ) {
        return { pool, session: null };
      }
    }
  } catch {
    // Allow token verification fallback if table lookup transiently fails
  }

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
    if (!verifyMutationOriginOrHeader(req)) {
      return res.status(403).json({
        success: false,
        error: "Yêu cầu không hợp lệ (Origin CSRF check).",
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

export async function requireAppAuth(req: Request, res: Response, next: NextFunction) {
  if (!getPool()) {
    return next();
  }
  return requirePgAuth(req as AuthedRequest, res, next);
}

export async function isSessionSystemAdmin(req: Request): Promise<boolean> {
  const pool = getPool();
  if (!pool) return true;
  const session = (req as AuthedRequest).pgSession;
  if (!session) return false;
  try {
    const { actorAccess, matchedDbUser } = await resolveServerRbacContext(pool, session);
    if (matchedDbUser?.status === "Inactive") return false;
    return Boolean(actorAccess.isSystemAdmin);
  } catch {
    return false;
  }
}

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const pool = getPool();
  if (!pool) {
    return next();
  }
  return requirePgAuth(req as AuthedRequest, res, async () => {
    try {
      const session = (req as AuthedRequest).pgSession!;
      const { actorAccess, matchedDbUser } = await resolveServerRbacContext(pool, session);
      if (matchedDbUser?.status === "Inactive" || !actorAccess.isSystemAdmin) {
        return res.status(403).json({
          success: false,
          error: "Chỉ Quản trị viên hệ thống (Admin) mới có quyền thực hiện thao tác này.",
        });
      }
      next();
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || "Lỗi kiểm tra phân quyền Admin.",
      });
    }
  });
}

const APPEND_MERGE_BUCKETS = new Set<string>(["audit_logs", "sync_history"]);

function mergeAppendBucketItems(
  bucketKey: string,
  existingItems: Record<string, unknown>[],
  incomingItems: Record<string, unknown>[]
): Record<string, unknown>[] {
  const cap = bucketKey === "audit_logs" ? 250 : 500;
  const seenIds = new Set<string>();
  const merged: Record<string, unknown>[] = [];
  for (const item of incomingItems) {
    const id = typeof item?.id === "string" ? item.id : "";
    if (id) seenIds.add(id);
    merged.push(item);
  }
  for (const oldItem of existingItems) {
    const id = typeof oldItem?.id === "string" ? oldItem.id : "";
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);
    merged.push(oldItem);
  }
  return merged.slice(0, cap);
}

function reconcileSensitiveBucketOnSave(
  bucketKey: string,
  safeItems: Record<string, unknown>[],
  existingItems: Record<string, unknown>[],
  actorIsAdmin: boolean
): Record<string, unknown>[] {
  if (bucketKey === "users") {
    const prevPassMap = new Map<string, string>();
    for (const prev of existingItems) {
      if (prev && typeof prev.id === "string" && typeof prev.password === "string" && prev.password) {
        prevPassMap.set(prev.id, prev.password);
      }
    }
    return safeItems.map((item) => {
      const copy = { ...item };
      delete copy.hasPassword;
      const uid = typeof copy.id === "string" ? copy.id : "";
      const incomingPass = typeof copy.password === "string" ? copy.password : "";
      if (incomingPass.trim()) {
        copy.password = isHashedPassword(incomingPass)
          ? incomingPass
          : hashPasswordScrypt(incomingPass);
      } else {
        const prevPass = uid ? prevPassMap.get(uid) : undefined;
        if (prevPass) {
          copy.password = isHashedPassword(prevPass)
            ? prevPass
            : hashPasswordScrypt(prevPass);
        } else {
          const defaultPlain = uid === "USR-ADMIN" ? "admin" : "123456";
          copy.password = hashPasswordScrypt(defaultPlain);
        }
      }
      return copy;
    });
  }

  if (bucketKey === "settings") {
    const prevFirst =
      existingItems[0] && typeof existingItems[0] === "object" ? existingItems[0] : {};
    const prevToken =
      typeof prevFirst.telegramBotToken === "string" ? prevFirst.telegramBotToken.trim() : "";

    return safeItems.slice(0, 1).map((item) => {
      const copy = { ...item };
      delete copy.hasTelegramBotToken;
      delete copy.telegramBotTokenHint;
      const incomingToken =
        typeof copy.telegramBotToken === "string" ? copy.telegramBotToken.trim() : "";
      if (actorIsAdmin && incomingToken.length > 10) {
        copy.telegramBotToken = incomingToken;
      } else {
        copy.telegramBotToken = prevToken;
      }
      return copy;
    });
  }

  return safeItems;
}

export async function saveTelegramConfigToDb(params: {
  botToken?: string;
  clearToken?: boolean;
  defaultChatId?: string;
  qaEnabled?: boolean;
  actorId: string;
  actorName: string;
}): Promise<{
  effectiveToken: string;
  defaultChatId: string;
  enabled: boolean;
  updatedAtMs: number;
}> {
  const pool = getPool();
  const cleanChatId = String(params.defaultChatId || "").trim();
  const nextQaEnabled = params.qaEnabled !== false;

  if (!pool) {
    const effectiveToken = params.clearToken ? "" : String(params.botToken || "").trim();
    return {
      effectiveToken,
      defaultChatId: cleanChatId,
      enabled: nextQaEnabled && effectiveToken.length > 10,
      updatedAtMs: Date.now(),
    };
  }

  await ensureSchema(pool);
  const client = await pool.connect();
  let effectiveToken = "";
  const nowMs = Date.now();
  try {
    await client.query("BEGIN");
    const existingRes = await client.query<{ items: unknown }>(
      `SELECT items FROM app_buckets WHERE bucket_key = 'settings' FOR UPDATE`
    );
    const existingObj =
      Array.isArray(existingRes.rows[0]?.items) &&
      existingRes.rows[0].items[0] &&
      typeof existingRes.rows[0].items[0] === "object"
        ? { ...(existingRes.rows[0].items[0] as Record<string, unknown>) }
        : {};

    const prevToken =
      typeof existingObj.telegramBotToken === "string" ? existingObj.telegramBotToken.trim() : "";
    if (params.clearToken) {
      effectiveToken = "";
    } else if (typeof params.botToken === "string" && params.botToken.trim().length > 10) {
      effectiveToken = params.botToken.trim();
    } else {
      effectiveToken = prevToken;
    }

    const nextSettings: Record<string, unknown> = {
      ...existingObj,
      telegramBotToken: effectiveToken,
      defaultTelegramChatId:
        params.defaultChatId !== undefined
          ? cleanChatId
          : String(existingObj.defaultTelegramChatId || "").trim(),
      telegramQaEnabled: nextQaEnabled,
    };
    delete nextSettings.hasTelegramBotToken;
    delete nextSettings.telegramBotTokenHint;

    await client.query(
      `INSERT INTO app_buckets (bucket_key, items, item_count, updated_by_id, updated_by_name, updated_at_ms, updated_at)
       VALUES ('settings', $1::jsonb, 1, $2, $3, $4, NOW())
       ON CONFLICT (bucket_key)
       DO UPDATE SET
         items = EXCLUDED.items,
         item_count = EXCLUDED.item_count,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_at_ms = EXCLUDED.updated_at_ms,
         updated_at = NOW()`,
      [JSON.stringify([nextSettings]), params.actorId, params.actorName, nowMs]
    );
    await syncNormalizedRowsFromBucketInTx(
      client,
      "settings",
      [nextSettings],
      params.actorId,
      params.actorName,
      nowMs,
      true
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  broadcastPostgresChange(pool, {
    type: "bucket",
    key: "settings",
    updatedAtMs: nowMs,
    actorId: params.actorId,
  });

  return {
    effectiveToken,
    defaultChatId: cleanChatId,
    enabled: nextQaEnabled && effectiveToken.length > 10,
    updatedAtMs: nowMs,
  };
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
      const [{ users, existsInDb }, staffProfiles] = await Promise.all([
        getStoredUsers(pool),
        getStoredStaffProfiles(pool),
      ]);
      const { session } = await resolveSession(req);

      const activeUsers = filterActiveLoginUsers(
        users.map((u) => ({
          ...u,
          status: typeof u.status === "string" ? u.status : undefined,
        })),
        staffProfiles
      );

      const safeStaff = activeUsers.map((u) => ({
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
      const identifier =
        typeof userId === "string" && userId.trim()
          ? userId.trim()
          : typeof email === "string" && email.trim()
            ? email.trim()
            : "unknown";
      const rateKey = getAuthRateKey(req, identifier);
      if (checkAuthRateLimited(rateKey)) {
        return res.status(429).json({
          success: false,
          error: "Quá nhiều lần nhập sai mật khẩu. Vui lòng thử lại sau 1–2 phút.",
        });
      }
      if (!cleanPass) {
        return res.status(400).json({ success: false, error: "Vui lòng nhập mật khẩu." });
      }

      const [{ users, existsInDb }, staffProfiles] = await Promise.all([
        getStoredUsers(pool),
        getStoredStaffProfiles(pool),
      ]);
      const candidatePool = existsInDb ? users : [FALLBACK_ADMIN_RECORD];

      let matched: StaffLoginRecord | undefined;
      if (typeof userId === "string" && userId.trim()) {
        matched = candidatePool.find((u) => u.id === userId.trim());
      } else if (typeof email === "string" && email.trim()) {
        const lower = email.trim().toLowerCase();
        matched = candidatePool.find((u) => (u.email || "").toLowerCase() === lower);
      }

      if (!matched) {
        recordAuthFailure(rateKey);
        return res.status(401).json({
          success: false,
          error: "Không tìm thấy tài khoản cán bộ trong cơ sở dữ liệu.",
        });
      }

      if (
        isUserAccountBlockedOrResigned(
          {
            id: matched.id,
            name: matched.name,
            role: matched.role as User["role"],
            status: typeof matched.status === "string" ? matched.status : undefined,
          },
          staffProfiles
        )
      ) {
        return res.status(403).json({
          success: false,
          error: "Tài khoản nhân viên đã nghỉ việc hoặc ngừng hoạt động. Vui lòng liên hệ Quản trị viên.",
        });
      }

      const expectedPass =
        matched.password ||
        (matched.id === "USR-ADMIN" || matched.role === "Admin" ? "admin" : "123456");

      if (!verifyPasswordConstantTime(cleanPass, expectedPass)) {
        recordAuthFailure(rateKey);
        return res.status(401).json({
          success: false,
          error: "Mật khẩu không chính xác.",
        });
      }

      clearAuthFailures(rateKey);

      // Transparently upgrade legacy plaintext DB password to salted scrypt hash on successful login
      if (existsInDb && !isHashedPassword(matched.password)) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const curRes = await client.query<{ items: unknown }>(
            `SELECT items FROM app_buckets WHERE bucket_key = 'users' FOR UPDATE`
          );
          if (Array.isArray(curRes.rows[0]?.items)) {
            const nextUsers = curRes.rows[0].items.map((item: any) =>
              item && item.id === matched!.id
                ? { ...item, password: hashPasswordScrypt(cleanPass) }
                : item
            );
            await client.query(
              `UPDATE app_buckets SET items = $1::jsonb WHERE bucket_key = 'users'`,
              [JSON.stringify(nextUsers)]
            );
            await syncNormalizedRowsFromBucketInTx(
              client,
              "users",
              nextUsers as Record<string, unknown>[],
              matched!.id,
              matched!.name || "User",
              Date.now(),
              false
            );
          }
          await client.query("COMMIT");
        } catch {
          await client.query("ROLLBACK").catch(() => {});
        } finally {
          client.release();
        }
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

  // 3B. Self Password Change (authenticated, verifies oldPassword server-side via scrypt)
  app.post("/api/auth/change-password", requirePgAuth, async (req: AuthedRequest, res) => {
    const pool = getPool()!;
    const session = req.pgSession!;
    const { oldPassword, newPassword } = req.body || {};
    const cleanOld = String(oldPassword || "");
    const cleanNew = String(newPassword || "");

    const rateKey = getAuthRateKey(req, `cp_${session.userId}`);
    if (checkAuthRateLimited(rateKey)) {
      return res.status(429).json({
        success: false,
        error: "Quá nhiều lần nhập sai mật khẩu hiện tại. Vui lòng thử lại sau ít phút.",
      });
    }

    if (!cleanOld || cleanNew.length < 6 || cleanNew.length > 128) {
      return res.status(400).json({
        success: false,
        error: "Mật khẩu mới phải từ 6 đến 128 ký tự.",
      });
    }

    const client = await pool.connect();
    try {
      await ensureSchema(pool);
      await client.query("BEGIN");
      const usersRes = await client.query<{ items: unknown }>(
        `SELECT items FROM app_buckets WHERE bucket_key = 'users' FOR UPDATE`
      );
      const list: StaffLoginRecord[] = Array.isArray(usersRes.rows[0]?.items)
        ? (usersRes.rows[0].items as StaffLoginRecord[])
        : [];
      const idx = list.findIndex((u) => u && u.id === session.userId);
      if (idx < 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Không tìm thấy tài khoản trong cơ sở dữ liệu.",
        });
      }

      const target = list[idx];
      const expectedPass =
        target.password ||
        (target.id === "USR-ADMIN" || target.role === "Admin" ? "admin" : "123456");

      if (!verifyPasswordConstantTime(cleanOld, expectedPass)) {
        recordAuthFailure(rateKey);
        await client.query("ROLLBACK");
        return res.status(401).json({
          success: false,
          error: "Mật khẩu hiện tại không đúng.",
        });
      }

      clearAuthFailures(rateKey);
      const nextUsers = [...list];
      nextUsers[idx] = {
        ...target,
        password: hashPasswordScrypt(cleanNew),
        resetRequested: false,
        resetRequestNote: undefined,
      };
      const nowMs = Date.now();
      await client.query(
        `UPDATE app_buckets
         SET items = $1::jsonb, item_count = $2, updated_by_id = $3, updated_by_name = $4, updated_at_ms = $5, updated_at = NOW()
         WHERE bucket_key = 'users'`,
        [JSON.stringify(nextUsers), nextUsers.length, session.userId, session.name, nowMs]
      );
      await syncNormalizedRowsFromBucketInTx(
        client,
        "users",
        nextUsers as Record<string, unknown>[],
        session.userId,
        session.name,
        nowMs,
        false
      );
      await client.query("COMMIT");

      broadcastPostgresChange(pool, {
        type: "bucket",
        key: "users",
        updatedAtMs: nowMs,
        actorId: session.userId,
      });

      return res.json({
        success: true,
        message: "Đổi mật khẩu thành công!",
        updatedAtMs: nowMs,
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[PostgresSync] change-password error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Lỗi cập nhật mật khẩu.",
      });
    } finally {
      client.release();
    }
  });

  // 3C. Admin / RBAC Manager Reset Password (authenticated + RBAC checked)
  app.post("/api/auth/reset-password", requirePgAuth, async (req: AuthedRequest, res) => {
    const pool = getPool()!;
    const session = req.pgSession!;
    const { userId, newPassword } = req.body || {};
    const targetId = String(userId || "").trim();
    const cleanNew = String(newPassword || "");

    if (!targetId || cleanNew.length < 6 || cleanNew.length > 128) {
      return res.status(400).json({
        success: false,
        error: "Thiếu mã tài khoản hoặc mật khẩu mới không hợp lệ (tối thiểu 6 ký tự).",
      });
    }

    const { actorAccess, rooms, matchedDbUser } = await resolveServerRbacContext(pool, session);
    if (matchedDbUser?.status === "Inactive") {
      return res.status(403).json({ success: false, error: "Tài khoản đã ngừng hoạt động." });
    }
    const canConfigureRBAC =
      actorAccess.isSystemAdmin || canManageStaffTarget(actorAccess, "rbac", null, rooms);
    if (!canConfigureRBAC) {
      return res.status(403).json({
        success: false,
        error: "Bạn không có quyền cấp lại mật khẩu tài khoản.",
      });
    }

    const client = await pool.connect();
    try {
      await ensureSchema(pool);
      await client.query("BEGIN");
      const usersRes = await client.query<{ items: unknown }>(
        `SELECT items FROM app_buckets WHERE bucket_key = 'users' FOR UPDATE`
      );
      const list: StaffLoginRecord[] = Array.isArray(usersRes.rows[0]?.items)
        ? (usersRes.rows[0].items as StaffLoginRecord[])
        : [];
      const idx = list.findIndex((u) => u && u.id === targetId);
      if (idx < 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Không tìm thấy tài khoản người dùng.",
        });
      }

      const target = list[idx];
      if (isAdminIdentity(target as unknown as User) && !actorAccess.isSystemAdmin) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          error: "Chỉ Quản trị viên hệ thống (Admin) mới có quyền đổi mật khẩu tài khoản Admin.",
        });
      }

      const nextUsers = [...list];
      nextUsers[idx] = {
        ...target,
        password: hashPasswordScrypt(cleanNew),
        resetRequested: false,
        resetRequestNote: undefined,
      };
      const nowMs = Date.now();
      await client.query(
        `UPDATE app_buckets
         SET items = $1::jsonb, item_count = $2, updated_by_id = $3, updated_by_name = $4, updated_at_ms = $5, updated_at = NOW()
         WHERE bucket_key = 'users'`,
        [JSON.stringify(nextUsers), nextUsers.length, session.userId, session.name, nowMs]
      );
      await syncNormalizedRowsFromBucketInTx(
        client,
        "users",
        nextUsers as Record<string, unknown>[],
        session.userId,
        session.name,
        nowMs,
        false
      );
      await client.query("COMMIT");

      broadcastPostgresChange(pool, {
        type: "bucket",
        key: "users",
        updatedAtMs: nowMs,
        actorId: session.userId,
      });

      return res.json({
        success: true,
        message: `Đã đặt lại mật khẩu thành công cho tài khoản ${target.name}`,
        updatedAtMs: nowMs,
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[PostgresSync] reset-password error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Lỗi đặt lại mật khẩu.",
      });
    } finally {
      client.release();
    }
  });

  // 3D. Password Reset Request (persists reset flag without disclosing user existence)
  app.post("/api/auth/request-reset", async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        error: "EXTERNAL_DATABASE_URL chưa được cấu hình.",
      });
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const note = String(req.body?.note || "Yêu cầu khôi phục mật khẩu từ trang đăng nhập")
      .trim()
      .slice(0, 200);
    if (!email) {
      return res.status(400).json({ success: false, error: "Vui lòng cung cấp email tài khoản." });
    }

    const rateKey = getAuthRateKey(req, `rr_${email}`);
    if (checkAuthRateLimited(rateKey)) {
      return res.status(429).json({
        success: false,
        error: "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
      });
    }
    recordAuthFailure(rateKey);

    const client = await pool.connect();
    try {
      await ensureSchema(pool);
      await client.query("BEGIN");
      const usersRes = await client.query<{ items: unknown }>(
        `SELECT items FROM app_buckets WHERE bucket_key = 'users' FOR UPDATE`
      );
      const list: StaffLoginRecord[] = Array.isArray(usersRes.rows[0]?.items)
        ? (usersRes.rows[0].items as StaffLoginRecord[])
        : [];
      const idx = list.findIndex((u) => (u?.email || "").toLowerCase().trim() === email);
      if (idx >= 0) {
        const nextUsers = [...list];
        nextUsers[idx] = {
          ...nextUsers[idx],
          resetRequested: true,
          resetRequestNote: note,
        };
        const nowMs = Date.now();
        await client.query(
          `UPDATE app_buckets SET items = $1::jsonb, updated_at_ms = $2, updated_at = NOW() WHERE bucket_key = 'users'`,
          [JSON.stringify(nextUsers), nowMs]
        );
        await syncNormalizedRowsFromBucketInTx(
          client,
          "users",
          nextUsers as Record<string, unknown>[],
          "RESET_REQ",
          "Password Reset Request",
          nowMs,
          false
        );
        await client.query("COMMIT");
        broadcastPostgresChange(pool, {
          type: "bucket",
          key: "users",
          updatedAtMs: nowMs,
          actorId: "RESET_REQ",
        });
      } else {
        await client.query("ROLLBACK");
      }
      return res.json({
        success: true,
        message: "Đã gửi yêu cầu khôi phục mật khẩu tới Admin. Vui lòng liên hệ Quản trị viên để nhận mật khẩu mới.",
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(500).json({
        success: false,
        error: err?.message || "Không thể ghi nhận yêu cầu khôi phục mật khẩu.",
      });
    } finally {
      client.release();
    }
  });

  // 3E. Session Validation & Memory Token Refresh on F5/New Tab (uses HttpOnly cookie)
  app.get("/api/auth/session", async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.json({ configured: false, authenticated: false, sessionUser: null });
    }
    const { session } = await resolveSession(req);
    if (!session) {
      return res.json({ configured: true, authenticated: false, sessionUser: null });
    }
    const secret = await getSessionSecret(pool);
    const refreshedPayload: PgSessionPayload = {
      userId: session.userId,
      role: session.role,
      name: session.name,
      exp: Date.now() + SESSION_TTL_MS,
    };
    const token = signSessionToken(refreshedPayload, secret);
    setSessionCookie(req, res, token);
    return res.json({
      configured: true,
      authenticated: true,
      token,
      sessionUser: { id: session.userId, name: session.name, role: session.role },
    });
  });

  // 4. Logout
  app.post("/api/auth/logout", (req, res) => {
    clearSessionCookie(req, res);
    res.json({ success: true });
  });

  // 5. Full State Pull (authenticated + scrubbed credentials & secrets + row versions/prefs/reminders)
  app.get("/api/db/state", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const [bucketsRes, archivesRes, versionMap, prefsRes, remindersRes, viewerIsAdmin] = await Promise.all([
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
        loadEntityVersionMap(pool),
        pool.query<{ user_id: string; pref_key: string; value: unknown; updated_at_ms: string }>(
          `SELECT user_id, pref_key, value, updated_at_ms::text
           FROM his_user_preferences
           WHERE user_id = $1 OR user_id = '__global__'`,
          [session.userId]
        ),
        pool.query<{
          scope: string;
          target_id: string;
          last_reminded_at: string;
          count: number;
          channel: string | null;
          updated_at_ms: string;
        }>(`SELECT scope, target_id, last_reminded_at, count, channel, updated_at_ms::text FROM his_reminder_logs`),
        isSessionSystemAdmin(req),
      ]);

      const buckets: Record<
        string,
        { items: Record<string, unknown>[]; updatedAtMs: number; updatedByName?: string | null }
      > = {};
      for (const row of bucketsRes.rows) {
        if (!ALLOWED_CLOUD_BUCKETS.has(row.bucket_key)) continue;
        buckets[row.bucket_key] = {
          items: scrubBucketItemsForClient(row.bucket_key, row.items, viewerIsAdmin),
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

      const preferences: Record<string, unknown> = {};
      for (const p of prefsRes.rows) {
        preferences[p.pref_key] = p.value;
      }

      const reminderLogs: {
        task: Record<string, { lastRemindedAt: string; count: number; channel?: string }>;
        equipment: Record<string, { lastRemindedAt: string; count: number; channel?: string }>;
      } = { task: {}, equipment: {} };
      for (const r of remindersRes.rows) {
        if (r.scope === "task" || r.scope === "equipment") {
          reminderLogs[r.scope][r.target_id] = {
            lastRemindedAt: r.last_reminded_at,
            count: Number(r.count || 1),
            channel: r.channel || undefined,
          };
        }
      }

      res.json({
        success: true,
        buckets,
        versions: versionMap,
        reportArchives,
        preferences,
        reminderLogs,
        serverTimeMs: Date.now(),
        actorId: session.userId,
      });
    } catch (err: any) {
      console.error("[PostgresSync] /api/db/state error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể tải dữ liệu từ PostgreSQL.",
      });
    }
  });

  // 6. Incremental Changes Polling (authenticated + scrubbed credentials & secrets)
  app.get("/api/db/changes", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const pool = getPool()!;
      await ensureSchema(pool);
      const since = Math.max(0, Number(req.query.since || 0) || 0);

      const [bucketsRes, archivesRes, viewerIsAdmin] = await Promise.all([
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
        isSessionSystemAdmin(req),
      ]);

      res.json({
        success: true,
        buckets: bucketsRes.rows
          .filter((r) => ALLOWED_CLOUD_BUCKETS.has(r.bucket_key))
          .map((r) => ({
            bucketKey: r.bucket_key,
            items: scrubBucketItemsForClient(r.bucket_key, r.items, viewerIsAdmin),
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

  // 7. Upsert Single Bucket (authenticated + RBAC + optimistic concurrency + credential preservation)
  app.put("/api/db/bucket/:bucketKey", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const bucketKey = String(req.params.bucketKey || "").trim();
      if (!ALLOWED_CLOUD_BUCKETS.has(bucketKey)) {
        return res.status(400).json({ success: false, error: "Bucket key không hợp lệ." });
      }

      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const safeItems = sanitizeBucketItems(req.body?.items, bucketKey);
      const expectedUpdatedAtMs = Number(req.body?.expectedUpdatedAtMs || 0) || 0;

      const rbacCheck = await enforceServerBucketRbac(pool, session, bucketKey, safeItems);
      if (rbacCheck.allowed === false) {
        return res.status(rbacCheck.status).json({
          success: false,
          error: rbacCheck.error,
        });
      }

      const { actorAccess } = await resolveServerRbacContext(pool, session);
      const actorIsAdmin = Boolean(actorAccess.isSystemAdmin);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existingRes = await client.query<{
          items: Record<string, unknown>[];
          updated_at_ms: string;
        }>(
          `SELECT items, updated_at_ms::text FROM app_buckets WHERE bucket_key = $1 FOR UPDATE`,
          [bucketKey]
        );
        const existingRow = existingRes.rows[0];
        const existingItems = Array.isArray(existingRow?.items) ? existingRow.items : [];
        const existingUpdatedAtMs = Number(existingRow?.updated_at_ms || 0);

        let itemsToSave = reconcileSensitiveBucketOnSave(
          bucketKey,
          safeItems,
          existingItems,
          actorIsAdmin
        );

        if (
          existingRow &&
          expectedUpdatedAtMs > 0 &&
          existingUpdatedAtMs > expectedUpdatedAtMs
        ) {
          if (APPEND_MERGE_BUCKETS.has(bucketKey)) {
            itemsToSave = mergeAppendBucketItems(bucketKey, existingItems, itemsToSave);
          } else {
            await client.query("ROLLBACK");
            return res.status(409).json({
              success: false,
              conflict: true,
              error: `Dữ liệu "${bucketKey}" vừa được cán bộ khác cập nhật trước đó. Đã đồng bộ bản mới nhất từ máy chủ.`,
              serverBucket: {
                bucketKey,
                items: scrubBucketItemsForClient(bucketKey, existingItems, actorIsAdmin),
                updatedAtMs: existingUpdatedAtMs,
              },
            });
          }
        }

        const nowMs = Date.now();
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
          [bucketKey, JSON.stringify(itemsToSave), itemsToSave.length, session.userId, session.name, nowMs]
        );
        await syncNormalizedRowsFromBucketInTx(
          client,
          bucketKey,
          itemsToSave,
          session.userId,
          session.name,
          nowMs,
          !APPEND_MERGE_BUCKETS.has(bucketKey)
        );
        await client.query("COMMIT");

        res.json({
          success: true,
          bucketKey,
          itemCount: itemsToSave.length,
          updatedAtMs: nowMs,
        });

        broadcastPostgresChange(pool, {
          type: "bucket",
          key: bucketKey,
          updatedAtMs: nowMs,
          actorId: session.userId,
        });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[PostgresSync] PUT bucket error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể lưu dữ liệu vào PostgreSQL.",
      });
    }
  });

  // 8. Upsert Single Report Archive Month (authenticated + optimistic concurrency)
  app.put("/api/db/report-archive/:archiveKey", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const archiveKey = String(req.params.archiveKey || "").trim();
      if (!ARCHIVE_KEY_REGEX.test(archiveKey)) {
        return res.status(400).json({ success: false, error: "Archive key không hợp lệ." });
      }

      const year = Number(req.body?.year);
      const monthKey = String(req.body?.monthKey || "").trim().slice(0, 24);
      const safeItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
      const expectedUpdatedAtMs = Number(req.body?.expectedUpdatedAtMs || 0) || 0;
      const forceOverwrite = Boolean(req.body?.forceOverwrite);
      if (!Number.isInteger(year) || year < 1900 || year > 2100 || !monthKey) {
        return res.status(400).json({ success: false, error: "Thông tin năm/tháng báo cáo không hợp lệ." });
      }

      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existingRes = await client.query<{
          items: unknown[];
          updated_at_ms: string;
        }>(
          `SELECT items, updated_at_ms::text FROM app_report_archives WHERE archive_key = $1 FOR UPDATE`,
          [archiveKey]
        );
        const existingRow = existingRes.rows[0];
        const existingUpdatedAtMs = Number(existingRow?.updated_at_ms || 0);
        if (
          existingRow &&
          !forceOverwrite &&
          expectedUpdatedAtMs > 0 &&
          existingUpdatedAtMs > expectedUpdatedAtMs
        ) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            success: false,
            conflict: true,
            error: `Kho báo cáo tháng "${archiveKey}" vừa được cập nhật ở nơi khác. Đã tải bản mới nhất.`,
            serverArchive: {
              archiveKey,
              year,
              monthKey,
              items: Array.isArray(existingRow.items) ? existingRow.items : [],
              updatedAtMs: existingUpdatedAtMs,
            },
          });
        }

        const nowMs = Date.now();
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
        await syncNormalizedReportMonthInTx(client, archiveKey, year, monthKey, safeItems, nowMs);
        await client.query("COMMIT");

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
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }
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

        const existingRowsRes = await client.query<{
          bucket_key: string;
          items: Record<string, unknown>[];
        }>(`SELECT bucket_key, items FROM app_buckets WHERE bucket_key = ANY($1::text[]) FOR UPDATE`, [
          ["users", "settings"],
        ]);
        const existingSensitiveMap = new Map<string, Record<string, unknown>[]>();
        for (const r of existingRowsRes.rows) {
          existingSensitiveMap.set(r.bucket_key, Array.isArray(r.items) ? r.items : []);
        }

        for (const [bucketKey, rawItems] of Object.entries(rawBuckets)) {
          if (!ALLOWED_CLOUD_BUCKETS.has(bucketKey)) continue;
          const sanitized = sanitizeBucketItems(rawItems, bucketKey);
          const safeItems = reconcileSensitiveBucketOnSave(
            bucketKey,
            sanitized,
            existingSensitiveMap.get(bucketKey) || [],
            true
          );
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
          await syncNormalizedRowsFromBucketInTx(
            client,
            bucketKey,
            safeItems,
            session.userId,
            session.name,
            nowMs,
            true
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
          await syncNormalizedReportMonthInTx(client, archiveKey, year, monthKey, safeItems, nowMs);
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

  // 11. V2 Normalized Delta Changes Endpoint (row-level upserts + soft deletes + prefs + reminders)
  app.get("/api/v2/changes", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const since = Math.max(0, Number(req.query.since || 0) || 0);

      const [entitiesRes, archivesRes, prefsRes, remindersRes, viewerIsAdmin] = await Promise.all([
        pool.query<{
          entity_type: string;
          entity_id: string;
          sort_order: number;
          data: Record<string, unknown>;
          version: number;
          updated_at_ms: string;
          deleted_at_ms: string | null;
        }>(
          `SELECT entity_type, entity_id, sort_order, data, version, updated_at_ms::text, deleted_at_ms::text
           FROM his_entities
           WHERE updated_at_ms > $1
           ORDER BY updated_at_ms ASC, sort_order ASC`,
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
        pool.query<{ pref_key: string; value: unknown; updated_at_ms: string }>(
          `SELECT pref_key, value, updated_at_ms::text
           FROM his_user_preferences
           WHERE (user_id = $1 OR user_id = '__global__') AND updated_at_ms > $2`,
          [session.userId, since]
        ),
        pool.query<{
          scope: string;
          target_id: string;
          last_reminded_at: string;
          count: number;
          channel: string | null;
          updated_at_ms: string;
        }>(
          `SELECT scope, target_id, last_reminded_at, count, channel, updated_at_ms::text
           FROM his_reminder_logs
           WHERE updated_at_ms > $1`,
          [since]
        ),
        isSessionSystemAdmin(req),
      ]);

      const entityChanges = entitiesRes.rows
        .filter((r) => ALLOWED_CLOUD_BUCKETS.has(r.entity_type))
        .map((r) => {
          const scrubbed = r.deleted_at_ms
            ? null
            : scrubBucketItemsForClient(r.entity_type, [r.data || {}], viewerIsAdmin)[0] || null;
          return {
            entityType: r.entity_type,
            id: r.entity_id,
            version: Number(r.version || 1),
            updatedAtMs: Number(r.updated_at_ms || 0),
            deletedAtMs: r.deleted_at_ms ? Number(r.deleted_at_ms) : null,
            record: scrubbed,
          };
        });

      const preferences: Record<string, unknown> = {};
      for (const p of prefsRes.rows) {
        preferences[p.pref_key] = p.value;
      }

      const reminderLogs: Array<{
        scope: "task" | "equipment";
        targetId: string;
        lastRemindedAt: string;
        count: number;
        channel?: string;
      }> = [];
      for (const r of remindersRes.rows) {
        if (r.scope === "task" || r.scope === "equipment") {
          reminderLogs.push({
            scope: r.scope,
            targetId: r.target_id,
            lastRemindedAt: r.last_reminded_at,
            count: Number(r.count || 1),
            channel: r.channel || undefined,
          });
        }
      }

      res.json({
        success: true,
        entities: entityChanges,
        reportArchives: archivesRes.rows.map((r) => ({
          archiveKey: r.archive_key,
          year: Number(r.year),
          monthKey: r.month_key,
          items: Array.isArray(r.items) ? r.items : [],
          updatedAtMs: Number(r.updated_at_ms || 0),
        })),
        preferences,
        reminderLogs,
        serverTimeMs: Date.now(),
      });
    } catch (err: any) {
      console.error("[PostgresSync] /api/v2/changes error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Lỗi kiểm tra thay đổi từ PostgreSQL.",
      });
    }
  });

  // 12. V2 Atomic Row-Level Transactional Mutations (supports cross-entity batch + row version lock)
  app.post("/api/v2/mutations", requirePgAuth, async (req: AuthedRequest, res) => {
    const rawOps = Array.isArray(req.body?.operations) ? req.body.operations : [];
    if (rawOps.length === 0) {
      return res.json({ success: true, results: [], serverTimeMs: Date.now() });
    }
    if (rawOps.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "Số lượng thao tác trong một giao dịch vượt quá giới hạn (tối đa 1000).",
      });
    }

    interface ParsedOp {
      entityType: string;
      op: "upsert" | "delete";
      id: string;
      record?: Record<string, unknown>;
      expectedVersion: number;
    }

    const ops: ParsedOp[] = [];
    for (const rawOp of rawOps) {
      if (!rawOp || typeof rawOp !== "object") continue;
      const entityType = String(rawOp.entityType || "").trim();
      const op = rawOp.op === "delete" ? "delete" : "upsert";
      if (!ALLOWED_CLOUD_BUCKETS.has(entityType)) {
        return res.status(400).json({
          success: false,
          error: `Loại dữ liệu "${entityType}" không hợp lệ.`,
        });
      }
      const record =
        rawOp.record && typeof rawOp.record === "object" && !Array.isArray(rawOp.record)
          ? { ...(rawOp.record as Record<string, unknown>) }
          : undefined;
      if (record) delete record.rawFileData;

      const id = String(
        rawOp.id || (record ? extractEntityRecordId(entityType, record, 0) : "")
      ).trim();
      if (!id) {
        return res.status(400).json({
          success: false,
          error: `Thiếu định danh bản ghi cho "${entityType}".`,
        });
      }
      if (op === "upsert" && !record) {
        return res.status(400).json({
          success: false,
          error: `Thiếu nội dung bản ghi cho thao tác cập nhật "${entityType}/${id}".`,
        });
      }
      ops.push({
        entityType,
        op,
        id,
        record,
        expectedVersion: Math.max(0, Number(rawOp.expectedVersion || 0) || 0),
      });
    }

    const pool = getPool()!;
    await ensureSchema(pool);
    const session = req.pgSession!;
    const { actorAccess } = await resolveServerRbacContext(pool, session);
    const actorIsAdmin = Boolean(actorAccess.isSystemAdmin);
    const nowMs = Date.now();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Group touched RBAC buckets & verify per-bucket RBAC on projected candidate lists before mutating
      const touchedTypes = Array.from(new Set(ops.map((o) => o.entityType)));
      const rbacTouchedTypes = touchedTypes.filter((t) => RBAC_GUARDED_BUCKETS.has(t));

      for (const bucketKey of rbacTouchedTypes) {
        const currentRowsRes = await client.query<{
          entity_id: string;
          data: Record<string, unknown>;
        }>(
          `SELECT entity_id, data FROM his_entities WHERE entity_type = $1 AND deleted_at_ms IS NULL ORDER BY sort_order ASC, updated_at_ms DESC`,
          [bucketKey]
        );
        const candidateMap = new Map<string, Record<string, unknown>>();
        for (const row of currentRowsRes.rows) {
          candidateMap.set(row.entity_id, row.data);
        }
        for (const op of ops) {
          if (op.entityType !== bucketKey) continue;
          if (op.op === "delete") {
            candidateMap.delete(op.id);
          } else if (op.record) {
            candidateMap.set(op.id, op.record);
          }
        }
        const rbacCheck = await enforceServerBucketRbac(
          pool,
          session,
          bucketKey,
          Array.from(candidateMap.values())
        );
        if (rbacCheck.allowed === false) {
          await client.query("ROLLBACK");
          return res.status(rbacCheck.status).json({
            success: false,
            error: rbacCheck.error,
          });
        }
      }

      const conflicts: Array<{
        entityType: string;
        id: string;
        serverVersion: number;
        deletedAtMs: number | null;
        serverRecord: Record<string, unknown> | null;
      }> = [];
      const results: Array<{
        entityType: string;
        id: string;
        op: "upsert" | "delete";
        version: number;
        updatedAtMs: number;
        deletedAtMs: number | null;
        record: Record<string, unknown> | null;
      }> = [];

      for (const itemOp of ops) {
        const existingRes = await client.query<{
          data: Record<string, unknown>;
          version: number;
          sort_order: number;
          deleted_at_ms: string | null;
        }>(
          `SELECT data, version, sort_order, deleted_at_ms::text
           FROM his_entities
           WHERE entity_type = $1 AND entity_id = $2
           FOR UPDATE`,
          [itemOp.entityType, itemOp.id]
        );
        const existingRow = existingRes.rows[0];
        const currentVersion = existingRow ? Number(existingRow.version || 1) : 0;

        if (
          existingRow &&
          itemOp.expectedVersion > 0 &&
          currentVersion > itemOp.expectedVersion &&
          !APPEND_MERGE_BUCKETS.has(itemOp.entityType)
        ) {
          conflicts.push({
            entityType: itemOp.entityType,
            id: itemOp.id,
            serverVersion: currentVersion,
            deletedAtMs: existingRow.deleted_at_ms ? Number(existingRow.deleted_at_ms) : null,
            serverRecord: existingRow.deleted_at_ms
              ? null
              : scrubBucketItemsForClient(itemOp.entityType, [existingRow.data], actorIsAdmin)[0] ||
                null,
          });
          continue;
        }

        if (itemOp.op === "delete") {
          const nextVer = existingRow ? currentVersion + 1 : 1;
          if (existingRow) {
            await client.query(
              `UPDATE his_entities
               SET deleted_at_ms = $3, updated_at_ms = $3, version = $4,
                   updated_by_id = $5, updated_by_name = $6, updated_at = NOW()
               WHERE entity_type = $1 AND entity_id = $2`,
              [itemOp.entityType, itemOp.id, nowMs, nextVer, session.userId, session.name]
            );
          } else {
            await client.query(
              `INSERT INTO his_entities (
                 entity_type, entity_id, sort_order, data, version,
                 updated_by_id, updated_by_name, updated_at_ms, deleted_at_ms, updated_at
               )
               VALUES ($1, $2, 0, '{}'::jsonb, 1, $3, $4, $5, $5, NOW())`,
              [itemOp.entityType, itemOp.id, session.userId, session.name, nowMs]
            );
          }
          results.push({
            entityType: itemOp.entityType,
            id: itemOp.id,
            op: "delete",
            version: nextVer,
            updatedAtMs: nowMs,
            deletedAtMs: nowMs,
            record: null,
          });
          continue;
        }

        // Upsert
        const reconciledList = reconcileSensitiveBucketOnSave(
          itemOp.entityType,
          [itemOp.record!],
          existingRow?.data ? [existingRow.data] : [],
          actorIsAdmin
        );
        const safeRecord = reconciledList[0] || itemOp.record!;
        const sortOrder =
          existingRow && Number.isFinite(existingRow.sort_order)
            ? existingRow.sort_order
            : itemOp.entityType === "notifications" ||
                itemOp.entityType === "audit_logs" ||
                itemOp.entityType === "sync_history" ||
                itemOp.entityType === "announcements"
              ? -Math.floor(nowMs / 1000)
              : 1000;

        const upsertRes = await client.query<{ version: number }>(
          `INSERT INTO his_entities (
             entity_type, entity_id, sort_order, data, version,
             updated_by_id, updated_by_name, updated_at_ms, deleted_at_ms, updated_at
           )
           VALUES ($1, $2, $3, $4::jsonb, 1, $5, $6, $7, NULL, NOW())
           ON CONFLICT (entity_type, entity_id)
           DO UPDATE SET
             data = EXCLUDED.data,
             version = his_entities.version + 1,
             updated_by_id = EXCLUDED.updated_by_id,
             updated_by_name = EXCLUDED.updated_by_name,
             updated_at_ms = EXCLUDED.updated_at_ms,
             deleted_at_ms = NULL,
             updated_at = NOW()
           RETURNING version`,
          [
            itemOp.entityType,
            itemOp.id,
            sortOrder,
            JSON.stringify(safeRecord),
            session.userId,
            session.name,
            nowMs,
          ]
        );
        const savedVersion = Number(upsertRes.rows[0]?.version || currentVersion + 1);
        const scrubbed =
          scrubBucketItemsForClient(itemOp.entityType, [safeRecord], actorIsAdmin)[0] ||
          safeRecord;
        results.push({
          entityType: itemOp.entityType,
          id: itemOp.id,
          op: "upsert",
          version: savedVersion,
          updatedAtMs: nowMs,
          deletedAtMs: null,
          record: scrubbed,
        });
      }

      if (conflicts.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          conflict: true,
          error:
            "Bản ghi bạn đang sửa vừa được người khác cập nhật trước đó. Hệ thống đã tải phiên bản mới nhất.",
          conflicts,
        });
      }

      for (const bucketKey of touchedTypes) {
        await rebuildAppBucketProjectionInTx(
          client,
          bucketKey,
          session.userId,
          session.name,
          nowMs
        );
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        results,
        serverTimeMs: nowMs,
      });

      broadcastPostgresChange(pool, {
        type: "entities",
        key: touchedTypes.join(","),
        entityTypes: touchedTypes,
        updatedAtMs: nowMs,
        actorId: session.userId,
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[PostgresSync] /api/v2/mutations error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể ghi giao dịch dữ liệu vào PostgreSQL.",
      });
    } finally {
      client.release();
    }
  });

  // 13. V2 Cell-Level Report Archive Update (avoids whole-month overwrites across browsers)
  app.put("/api/v2/reports/:archiveKey/cells", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const archiveKey = String(req.params.archiveKey || "").trim();
      if (!ARCHIVE_KEY_REGEX.test(archiveKey)) {
        return res.status(400).json({ success: false, error: "Archive key không hợp lệ." });
      }
      const year = Number(req.body?.year);
      const monthKey = String(req.body?.monthKey || "").trim().slice(0, 24);
      const rawCells = Array.isArray(req.body?.cells) ? req.body.cells : [];
      if (!Number.isInteger(year) || year < 1900 || year > 2100 || !monthKey) {
        return res.status(400).json({ success: false, error: "Thông tin năm/tháng không hợp lệ." });
      }
      const cells: CellUpdateInput[] = rawCells
        .filter((c: unknown): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
        .slice(0, 1500)
        .map((c) => ({
          serviceId: String(c.serviceId || "").trim(),
          category: String(c.category || "Khác").trim(),
          name: String(c.name || "").trim(),
          sortOrder: typeof c.sortOrder === "number" ? c.sortOrder : undefined,
          day: Number(c.day),
          bh: c.bh === "LT" ? "LT" : Number(c.bh || 0),
          nd: c.nd === "LT" ? "LT" : Number(c.nd || 0),
          isManual: Boolean(c.isManual),
          manualBy: typeof c.manualBy === "string" ? c.manualBy : undefined,
          manualAt: typeof c.manualAt === "string" ? c.manualAt : undefined,
          forceOverwrite: Boolean(c.forceOverwrite),
        }))
        .filter((c) => c.serviceId && Number.isInteger(c.day) && c.day >= 1 && c.day <= 31);

      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const nowMs = Date.now();
      const client = await pool.connect();
      let updatedItems: Record<string, unknown>[] = [];
      try {
        await client.query("BEGIN");
        updatedItems = await upsertReportCellsAndRebuildArchiveInTx(client, {
          archiveKey,
          year,
          monthKey,
          cells,
          actorId: session.userId,
          actorName: session.name,
          nowMs,
        });
        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      res.json({
        success: true,
        archiveKey,
        items: updatedItems,
        updatedAtMs: nowMs,
      });

      broadcastPostgresChange(pool, {
        type: "report_archive",
        key: archiveKey,
        updatedAtMs: nowMs,
        actorId: session.userId,
      });
    } catch (err: any) {
      console.error("[PostgresSync] PUT /api/v2/reports cells error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể lưu ô số liệu báo cáo.",
      });
    }
  });

  // 14. User Preferences & Global App UI Config (replaces client-only localStorage settings)
  const ALLOWED_PREF_KEYS = new Set<string>([
    "quick_access_pins",
    "pinned_clinical_services",
    "recent_searches",
    "theme_mode",
    "known_report_years",
  ]);
  const GLOBAL_PREF_KEYS = new Set<string>(["known_report_years"]);

  app.get("/api/v2/preferences", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const rowsRes = await pool.query<{ pref_key: string; value: unknown; updated_at_ms: string }>(
        `SELECT pref_key, value, updated_at_ms::text
         FROM his_user_preferences
         WHERE user_id = $1 OR user_id = '__global__'`,
        [session.userId]
      );
      const preferences: Record<string, unknown> = {};
      for (const r of rowsRes.rows) {
        preferences[r.pref_key] = r.value;
      }
      res.json({ success: true, preferences });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Lỗi tải tùy chọn người dùng." });
    }
  });

  app.put("/api/v2/preferences/:prefKey", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const prefKey = String(req.params.prefKey || "").trim();
      if (!ALLOWED_PREF_KEYS.has(prefKey)) {
        return res.status(400).json({ success: false, error: "Preference key không hợp lệ." });
      }
      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const targetUserId = GLOBAL_PREF_KEYS.has(prefKey) ? "__global__" : session.userId;
      const value = req.body?.value ?? null;
      const nowMs = Date.now();

      await pool.query(
        `INSERT INTO his_user_preferences (user_id, pref_key, value, updated_at_ms, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, NOW())
         ON CONFLICT (user_id, pref_key)
         DO UPDATE SET value = EXCLUDED.value, updated_at_ms = EXCLUDED.updated_at_ms, updated_at = NOW()`,
        [targetUserId, prefKey, JSON.stringify(value), nowMs]
      );

      res.json({ success: true, prefKey, value, updatedAtMs: nowMs });
      broadcastPostgresChange(pool, {
        type: "preferences",
        key: prefKey,
        updatedAtMs: nowMs,
        actorId: session.userId,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Lỗi lưu tùy chọn người dùng." });
    }
  });

  // 15. Reminder Logs Sync (replaces localStorage operationalAlerts logs)
  app.get("/api/v2/reminders", requirePgAuth, async (_req: AuthedRequest, res) => {
    try {
      const pool = getPool()!;
      await ensureSchema(pool);
      const rowsRes = await pool.query<{
        scope: string;
        target_id: string;
        last_reminded_at: string;
        count: number;
        channel: string | null;
      }>(`SELECT scope, target_id, last_reminded_at, count, channel FROM his_reminder_logs`);
      const task: Record<string, { lastRemindedAt: string; count: number; channel?: string }> = {};
      const equipment: Record<string, { lastRemindedAt: string; count: number; channel?: string }> = {};
      for (const r of rowsRes.rows) {
        const entry = {
          lastRemindedAt: r.last_reminded_at,
          count: Number(r.count || 1),
          channel: r.channel || undefined,
        };
        if (r.scope === "task") task[r.target_id] = entry;
        else if (r.scope === "equipment") equipment[r.target_id] = entry;
      }
      res.json({ success: true, task, equipment });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Lỗi tải nhật ký nhắc nhở." });
    }
  });

  app.post("/api/v2/reminders", requirePgAuth, async (req: AuthedRequest, res) => {
    try {
      const scope = req.body?.scope === "equipment" ? "equipment" : req.body?.scope === "task" ? "task" : "";
      const targetId = String(req.body?.targetId || "").trim().slice(0, 120);
      const lastRemindedAt = String(req.body?.lastRemindedAt || new Date().toISOString()).slice(0, 48);
      const channel = typeof req.body?.channel === "string" ? req.body.channel.slice(0, 40) : null;
      if (!scope || !targetId) {
        return res.status(400).json({ success: false, error: "Thiếu scope hoặc targetId nhắc nhở." });
      }
      const pool = getPool()!;
      await ensureSchema(pool);
      const session = req.pgSession!;
      const nowMs = Date.now();
      const upsertRes = await pool.query<{ count: number }>(
        `INSERT INTO his_reminder_logs (scope, target_id, last_reminded_at, count, channel, reminded_by_id, updated_at_ms)
         VALUES ($1, $2, $3, 1, $4, $5, $6)
         ON CONFLICT (scope, target_id)
         DO UPDATE SET
           last_reminded_at = EXCLUDED.last_reminded_at,
           count = his_reminder_logs.count + 1,
           channel = COALESCE(EXCLUDED.channel, his_reminder_logs.channel),
           reminded_by_id = EXCLUDED.reminded_by_id,
           updated_at_ms = EXCLUDED.updated_at_ms
         RETURNING count`,
        [scope, targetId, lastRemindedAt, channel, session.userId, nowMs]
      );
      const count = Number(upsertRes.rows[0]?.count || 1);
      res.json({ success: true, scope, targetId, lastRemindedAt, count, channel });
      broadcastPostgresChange(pool, {
        type: "reminders",
        key: `${scope}:${targetId}`,
        updatedAtMs: nowMs,
        actorId: session.userId,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Lỗi lưu nhật ký nhắc nhở." });
    }
  });

  // 16. Server File Upload & Download (supports Chat Attachments & Documents across devices)
  app.post("/api/files/upload", requireAppAuth, async (req, res) => {
    try {
      const pool = getPool();
      if (pool) await ensureSchema(pool);
      const session = (req as AuthedRequest).pgSession;

      const filename = String(req.body?.filename || "attachment.bin").trim();
      const mimeType = String(req.body?.mimeType || "application/octet-stream").trim();
      const scope = String(req.body?.scope || "general").trim().slice(0, 40);
      const rawBase64 = String(req.body?.dataBase64 || "");
      if (!rawBase64) {
        return res.status(400).json({ success: false, error: "Thiếu dữ liệu tệp tải lên." });
      }
      const commaIdx = rawBase64.indexOf(",");
      const cleanB64 = rawBase64.startsWith("data:") && commaIdx >= 0 ? rawBase64.slice(commaIdx + 1) : rawBase64;
      const content = Buffer.from(cleanB64, "base64");
      const maxBytes = 15 * 1024 * 1024;
      if (content.length === 0) {
        return res.status(400).json({ success: false, error: "Tệp trống hoặc mã hóa không hợp lệ." });
      }
      if (content.length > maxBytes) {
        return res.status(413).json({
          success: false,
          error: "Kích thước tệp vượt quá giới hạn 15MB cho lưu trữ trực tiếp trên máy chủ.",
        });
      }

      const meta = await saveFileBlobToDb(pool, memoryFileBlobFallback, {
        filename,
        mimeType,
        content,
        uploaderId: session?.userId,
        uploaderName: session?.name,
        scope,
      });

      res.json({
        success: true,
        file: {
          id: meta.id,
          filename: meta.filename,
          mimeType: meta.mimeType,
          sizeBytes: meta.sizeBytes,
          sha256: meta.sha256,
          url: `/api/files/${meta.id}`,
          createdAtMs: meta.createdAtMs,
        },
      });
    } catch (err: any) {
      console.error("[PostgresSync] File upload error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể lưu tệp lên máy chủ.",
      });
    }
  });

  app.get("/api/files/:id", requireAppAuth, async (req, res) => {
    try {
      const fileId = String(req.params.id || "").trim();
      if (!fileId || !/^[a-zA-Z0-9_-]{4,80}$/.test(fileId)) {
        return res.status(400).json({ success: false, error: "Mã tệp không hợp lệ." });
      }
      const pool = getPool();
      if (pool) await ensureSchema(pool);
      const found = await loadFileBlobFromDb(pool, memoryFileBlobFallback, fileId);
      if (!found) {
        return res.status(404).json({ success: false, error: "Không tìm thấy tệp trên máy chủ." });
      }

      const { meta, content } = found;
      const lowerMime = meta.mimeType.toLowerCase();
      const forceDownload = req.query.download === "1" || req.query.download === "true";
      const isUnsafeActiveType =
        lowerMime.includes("html") ||
        lowerMime.includes("svg") ||
        lowerMime.includes("xml") ||
        lowerMime.includes("javascript") ||
        /\.(html?|svg|js|mjs|xhtml)$/i.test(meta.filename);

      const safeContentType = isUnsafeActiveType ? "application/octet-stream" : meta.mimeType;
      const dispositionType = forceDownload || isUnsafeActiveType ? "attachment" : "inline";
      const encodedName = encodeURIComponent(meta.filename);

      res.setHeader("Content-Type", safeContentType);
      res.setHeader(
        "Content-Disposition",
        `${dispositionType}; filename*=UTF-8''${encodedName}`
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(content);
    } catch (err: any) {
      console.error("[PostgresSync] File download error:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể tải tệp từ máy chủ.",
      });
    }
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
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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
      await syncNormalizedReportMonthInTx(client, archiveKey, year, monthKey, safeItems, nowMs);
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

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
    const nowMs = Date.now();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query<{ items: Record<string, unknown>[] }>(
        `SELECT items FROM app_buckets WHERE bucket_key = 'notifications' FOR UPDATE`
      );
      const existing = Array.isArray(res.rows[0]?.items) ? res.rows[0].items : [];
      const next = [notif, ...existing].slice(0, 200);
      await client.query(
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
      await syncNormalizedRowsFromBucketInTx(
        client,
        "notifications",
        next as unknown as Record<string, unknown>[],
        "SYS-SCHEDULER",
        "Hệ thống Cảnh báo Tự động",
        nowMs,
        true
      );
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

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
    const nowMs = Date.now();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query<{ items: Record<string, unknown>[] }>(
        `SELECT items FROM app_buckets WHERE bucket_key = 'settings' FOR UPDATE`
      );
      const currentList = Array.isArray(res.rows[0]?.items) ? res.rows[0].items : [];
      const baseSettings =
        currentList[0] && typeof currentList[0] === "object"
          ? { ...currentList[0] }
          : {};
      const nextSettings = [{ ...baseSettings, scheduledAlertsConfig: rules }];
      await client.query(
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
      await syncNormalizedRowsFromBucketInTx(
        client,
        "settings",
        nextSettings,
        "SYS-SCHEDULER",
        "Cấu hình Cảnh báo Tự động",
        nowMs,
        true
      );
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

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
    const nowMs = Date.now();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query<{ items: Record<string, unknown>[] }>(
        `SELECT items FROM app_buckets WHERE bucket_key = 'sync_history' FOR UPDATE`
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

      await client.query(
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
      await syncNormalizedRowsFromBucketInTx(
        client,
        "sync_history",
        next as unknown as Record<string, unknown>[],
        "SYS-SCHEDULER",
        "Hệ thống Đồng bộ Tự động",
        nowMs,
        true
      );
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

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
    const nowMs = Date.now();
    const client = await pool.connect();
    let changed = false;
    try {
      await client.query("BEGIN");
      const res = await client.query<{ items: Record<string, unknown>[] }>(
        `SELECT items FROM app_buckets WHERE bucket_key = 'settings' FOR UPDATE`
      );
      const currentList = Array.isArray(res.rows[0]?.items) ? res.rows[0].items : [];
      const baseSettings =
        currentList[0] && typeof currentList[0] === "object"
          ? ({ ...currentList[0] } as Partial<AppSettings>)
          : ({} as Partial<AppSettings>);

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

      if (!changed) {
        await client.query("ROLLBACK");
        return false;
      }

      await client.query(
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
      await syncNormalizedRowsFromBucketInTx(
        client,
        "settings",
        [baseSettings as Record<string, unknown>],
        "SYS-SCHEDULER",
        "Đồng bộ Cấu hình Sheet",
        nowMs,
        true
      );
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

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

function pruneInMemoryDailyAlertClaims(currentDateVN: string): void {
  const dateSegment = `_${currentDateVN}`;
  for (const k of inMemoryDailyAlertClaims) {
    if (!k.includes(dateSegment)) {
      inMemoryDailyAlertClaims.delete(k);
    }
  }
  while (inMemoryDailyAlertClaims.size > 100) {
    const oldest = inMemoryDailyAlertClaims.values().next().value;
    if (oldest === undefined) break;
    inMemoryDailyAlertClaims.delete(oldest);
  }
}

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
  pruneInMemoryDailyAlertClaims(dateVN);
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

