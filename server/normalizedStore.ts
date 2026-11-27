import crypto from "crypto";
import type { Pool, PoolClient } from "pg";

export const SINGLETON_ENTITIES = new Set<string>([
  "settings",
  "equipment_duration_defaults",
]);

export function extractEntityRecordId(
  entityType: string,
  item: Record<string, unknown>,
  fallbackIndex = 0
): string {
  if (SINGLETON_ENTITIES.has(entityType)) {
    return "default";
  }
  if (entityType === "staff_profiles") {
    const uid = typeof item.userId === "string" ? item.userId.trim() : "";
    if (uid) return uid;
  }
  const id = typeof item.id === "string" ? item.id.trim() : "";
  if (id) return id;
  const uid = typeof item.userId === "string" ? item.userId.trim() : "";
  if (uid) return uid;
  return `auto_${entityType}_${fallbackIndex}`;
}

export interface NormalizedEntityRow {
  entityType: string;
  id: string;
  version: number;
  data: Record<string, unknown>;
  updatedAtMs: number;
  deletedAtMs: number | null;
  updatedById?: string | null;
  updatedByName?: string | null;
}

export interface NormalizedReportServiceRow {
  archiveKey: string;
  year: number;
  monthKey: string;
  serviceId: string;
  category: string;
  name: string;
  sortOrder: number;
  meta: Record<string, unknown>;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

export interface NormalizedReportCellRow {
  archiveKey: string;
  serviceId: string;
  day: number;
  bh: number | string;
  nd: number | string;
  isManual: boolean;
  manualBy?: string | null;
  manualAt?: string | null;
  updatedAtMs: number;
}

export interface CellUpdateInput {
  serviceId: string;
  category: string;
  name: string;
  sortOrder?: number;
  day: number;
  bh: number | string;
  nd: number | string;
  isManual?: boolean;
  manualBy?: string;
  manualAt?: string;
  forceOverwrite?: boolean;
}

export function decomposeReportItemsToRows(
  archiveKey: string,
  year: number,
  monthKey: string,
  items: unknown[],
  nowMs: number
): {
  services: NormalizedReportServiceRow[];
  cells: NormalizedReportCellRow[];
} {
  const services: NormalizedReportServiceRow[] = [];
  const cells: NormalizedReportCellRow[] = [];
  const seenIds = new Set<string>();

  items.forEach((raw, idx) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const item = raw as Record<string, unknown>;
    const rawId = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `srv_${idx}`;
    const serviceId = seenIds.has(rawId) ? `${rawId}__${idx}` : rawId;
    seenIds.add(serviceId);

    const category = typeof item.category === "string" ? item.category : "Khác";
    const name = typeof item.name === "string" ? item.name : serviceId;
    const manualDays =
      item.manualDays && typeof item.manualDays === "object" && !Array.isArray(item.manualDays)
        ? (item.manualDays as Record<string, boolean>)
        : {};
    const manualMeta =
      item.manualMeta && typeof item.manualMeta === "object" && !Array.isArray(item.manualMeta)
        ? (item.manualMeta as Record<string, { updatedAt?: string; updatedBy?: string }>)
        : {};

    const extraMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (
        k === "id" ||
        k === "category" ||
        k === "name" ||
        k === "dailyData" ||
        k === "manualDays" ||
        k === "manualMeta"
      ) {
        continue;
      }
      extraMeta[k] = v;
    }

    services.push({
      archiveKey,
      year,
      monthKey,
      serviceId,
      category,
      name,
      sortOrder: idx,
      meta: extraMeta,
      updatedAtMs: nowMs,
      deletedAtMs: null,
    });

    const dailyData =
      item.dailyData && typeof item.dailyData === "object" && !Array.isArray(item.dailyData)
        ? (item.dailyData as Record<string, { bh?: number | string; nd?: number | string }>)
        : {};

    const allDayKeys = new Set<string>([
      ...Object.keys(dailyData),
      ...Object.keys(manualDays).filter((d) => manualDays[d]),
    ]);

    for (const dayKey of allDayKeys) {
      const dayNum = parseInt(dayKey, 10);
      if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) continue;
      const cell = dailyData[dayKey] || { bh: 0, nd: 0 };
      const bh = cell.bh === "LT" ? "LT" : Number(cell.bh || 0);
      const nd = cell.nd === "LT" ? "LT" : Number(cell.nd || 0);
      const isManual = Boolean(manualDays[String(dayNum)]);
      const mInfo = manualMeta[String(dayNum)];

      cells.push({
        archiveKey,
        serviceId,
        day: dayNum,
        bh,
        nd,
        isManual,
        manualBy: mInfo?.updatedBy || null,
        manualAt: mInfo?.updatedAt || null,
        updatedAtMs: nowMs,
      });
    }
  });

  return { services, cells };
}

export function composeReportItemsFromRows(
  services: NormalizedReportServiceRow[],
  cells: NormalizedReportCellRow[]
): Record<string, unknown>[] {
  const cellsByService = new Map<string, NormalizedReportCellRow[]>();
  for (const c of cells) {
    const list = cellsByService.get(c.serviceId) || [];
    list.push(c);
    cellsByService.set(c.serviceId, list);
  }

  return [...services]
    .filter((s) => !s.deletedAtMs)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((srv) => {
      const srvCells = cellsByService.get(srv.serviceId) || [];
      const dailyData: Record<number, { bh: number | string; nd: number | string }> = {};
      const manualDays: Record<number, boolean> = {};
      const manualMeta: Record<number, { updatedAt: string; updatedBy: string }> = {};

      for (const c of srvCells) {
        dailyData[c.day] = { bh: c.bh, nd: c.nd };
        if (c.isManual) {
          manualDays[c.day] = true;
          if (c.manualAt || c.manualBy) {
            manualMeta[c.day] = {
              updatedAt: c.manualAt || "",
              updatedBy: c.manualBy || "",
            };
          }
        }
      }

      const out: Record<string, unknown> = {
        ...(srv.meta || {}),
        id: srv.serviceId,
        category: srv.category,
        name: srv.name,
        dailyData,
      };
      if (Object.keys(manualDays).length > 0) {
        out.manualDays = manualDays;
      }
      if (Object.keys(manualMeta).length > 0) {
        out.manualMeta = manualMeta;
      }
      return out;
    });
}

export async function ensureNormalizedTablesAndMigrate(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS his_entities (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      data JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_by_id TEXT,
      updated_by_name TEXT,
      updated_at_ms BIGINT NOT NULL,
      deleted_at_ms BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_his_entities_active
      ON his_entities (entity_type, sort_order, updated_at_ms)
      WHERE deleted_at_ms IS NULL;
    CREATE INDEX IF NOT EXISTS idx_his_entities_updated_ms
      ON his_entities (updated_at_ms);

    CREATE TABLE IF NOT EXISTS his_report_services (
      archive_key TEXT NOT NULL,
      year INTEGER NOT NULL,
      month_key TEXT NOT NULL,
      service_id TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at_ms BIGINT NOT NULL,
      deleted_at_ms BIGINT,
      PRIMARY KEY (archive_key, service_id)
    );
    CREATE INDEX IF NOT EXISTS idx_his_report_services_year
      ON his_report_services (year, archive_key)
      WHERE deleted_at_ms IS NULL;

    CREATE TABLE IF NOT EXISTS his_report_cells (
      archive_key TEXT NOT NULL,
      service_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      bh JSONB NOT NULL DEFAULT '0'::jsonb,
      nd JSONB NOT NULL DEFAULT '0'::jsonb,
      is_manual BOOLEAN NOT NULL DEFAULT FALSE,
      manual_by TEXT,
      manual_at TEXT,
      updated_at_ms BIGINT NOT NULL,
      PRIMARY KEY (archive_key, service_id, day)
    );
    CREATE INDEX IF NOT EXISTS idx_his_report_cells_updated
      ON his_report_cells (updated_at_ms);

    CREATE TABLE IF NOT EXISTS his_file_blobs (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      content BYTEA NOT NULL,
      uploader_id TEXT,
      uploader_name TEXT,
      scope TEXT NOT NULL DEFAULT 'general',
      created_at_ms BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS his_user_preferences (
      user_id TEXT NOT NULL,
      pref_key TEXT NOT NULL,
      value JSONB NOT NULL DEFAULT 'null'::jsonb,
      updated_at_ms BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, pref_key)
    );

    CREATE TABLE IF NOT EXISTS his_reminder_logs (
      scope TEXT NOT NULL,
      target_id TEXT NOT NULL,
      last_reminded_at TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      channel TEXT,
      reminded_by_id TEXT,
      updated_at_ms BIGINT NOT NULL,
      PRIMARY KEY (scope, target_id)
    );
  `);

  // One-time idempotent migration from legacy app_buckets & app_report_archives
  const migCheck = await pool.query<{ meta_value: string }>(
    `SELECT meta_value FROM app_meta WHERE meta_key = 'normalized_migration_v1' LIMIT 1`
  );
  if (migCheck.rows.length > 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recheck = await client.query<{ meta_value: string }>(
      `SELECT meta_value FROM app_meta WHERE meta_key = 'normalized_migration_v1' FOR UPDATE`
    );
    if (recheck.rows.length > 0) {
      await client.query("COMMIT");
      return;
    }

    // Create one-time safety backups of original tables before normalization
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_buckets_backup_v1 AS SELECT * FROM app_buckets;
      CREATE TABLE IF NOT EXISTS app_report_archives_backup_v1 AS SELECT * FROM app_report_archives;
    `);

    const bucketsRes = await client.query<{
      bucket_key: string;
      items: unknown;
      updated_by_id: string | null;
      updated_by_name: string | null;
      updated_at_ms: string;
    }>(
      `SELECT bucket_key, items, updated_by_id, updated_by_name, updated_at_ms::text FROM app_buckets`
    );

    for (const row of bucketsRes.rows) {
      const items = Array.isArray(row.items) ? row.items : [];
      const rowUpdatedAtMs = Number(row.updated_at_ms || 0) || Date.now();
      await syncNormalizedRowsFromBucketInTx(
        client,
        row.bucket_key,
        items as Record<string, unknown>[],
        row.updated_by_id || "SYS-MIGRATION",
        row.updated_by_name || "Migration",
        rowUpdatedAtMs,
        false // preserve any existing normalized rows if partially populated
      );
    }

    const archivesRes = await client.query<{
      archive_key: string;
      year: number;
      month_key: string;
      items: unknown;
      updated_at_ms: string;
    }>(
      `SELECT archive_key, year, month_key, items, updated_at_ms::text FROM app_report_archives`
    );

    for (const arch of archivesRes.rows) {
      const items = Array.isArray(arch.items) ? arch.items : [];
      const rowUpdatedAtMs = Number(arch.updated_at_ms || 0) || Date.now();
      await syncNormalizedReportMonthInTx(
        client,
        arch.archive_key,
        Number(arch.year),
        arch.month_key,
        items,
        rowUpdatedAtMs
      );
    }

    await client.query(
      `INSERT INTO app_meta (meta_key, meta_value, updated_at)
       VALUES ('normalized_migration_v1', $1, NOW())
       ON CONFLICT (meta_key) DO NOTHING`,
      [new Date().toISOString()]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[NormalizedStore] Migration failed:", err);
  } finally {
    client.release();
  }
}

export async function syncNormalizedRowsFromBucketInTx(
  client: PoolClient,
  entityType: string,
  items: Record<string, unknown>[],
  actorId: string,
  actorName: string,
  nowMs: number,
  softDeleteMissing = true
): Promise<void> {
  const seenIds: string[] = [];
  const dedupedIds = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entityId = extractEntityRecordId(entityType, raw, i);
    if (dedupedIds.has(entityId)) continue;
    dedupedIds.add(entityId);
    seenIds.push(entityId);

    const cleanRecord = { ...raw };
    delete cleanRecord.rawFileData;

    await client.query(
      `INSERT INTO his_entities (
         entity_type, entity_id, sort_order, data, version,
         updated_by_id, updated_by_name, updated_at_ms, deleted_at_ms, updated_at
       )
       VALUES ($1, $2, $3, $4::jsonb, 1, $5, $6, $7, NULL, NOW())
       ON CONFLICT (entity_type, entity_id)
       DO UPDATE SET
         sort_order = EXCLUDED.sort_order,
         data = EXCLUDED.data,
         version = CASE
           WHEN his_entities.data::text = EXCLUDED.data::text AND his_entities.deleted_at_ms IS NULL
             THEN his_entities.version
           ELSE his_entities.version + 1
         END,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_at_ms = CASE
           WHEN his_entities.data::text = EXCLUDED.data::text AND his_entities.deleted_at_ms IS NULL
             THEN his_entities.updated_at_ms
           ELSE EXCLUDED.updated_at_ms
         END,
         deleted_at_ms = NULL,
         updated_at = NOW()`,
      [entityType, entityId, i, JSON.stringify(cleanRecord), actorId, actorName, nowMs]
    );
  }

  if (softDeleteMissing) {
    if (seenIds.length === 0) {
      await client.query(
        `UPDATE his_entities
         SET deleted_at_ms = $2, updated_at_ms = $2, version = version + 1,
             updated_by_id = $3, updated_by_name = $4, updated_at = NOW()
         WHERE entity_type = $1 AND deleted_at_ms IS NULL`,
        [entityType, nowMs, actorId, actorName]
      );
    } else {
      await client.query(
        `UPDATE his_entities
         SET deleted_at_ms = $3, updated_at_ms = $3, version = version + 1,
             updated_by_id = $4, updated_by_name = $5, updated_at = NOW()
         WHERE entity_type = $1 AND deleted_at_ms IS NULL AND NOT (entity_id = ANY($2::text[]))`,
        [entityType, seenIds, nowMs, actorId, actorName]
      );
    }
  }
}

export async function rebuildAppBucketProjectionInTx(
  client: PoolClient,
  entityType: string,
  actorId: string,
  actorName: string,
  nowMs: number
): Promise<Record<string, unknown>[]> {
  const rowsRes = await client.query<{ data: Record<string, unknown> }>(
    `SELECT data
     FROM his_entities
     WHERE entity_type = $1 AND deleted_at_ms IS NULL
     ORDER BY sort_order ASC, updated_at_ms DESC`,
    [entityType]
  );
  const items = rowsRes.rows
    .map((r) => r.data)
    .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === "object"));

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
    [entityType, JSON.stringify(items), items.length, actorId, actorName, nowMs]
  );

  return items;
}

export async function syncNormalizedReportMonthInTx(
  client: PoolClient,
  archiveKey: string,
  year: number,
  monthKey: string,
  items: unknown[],
  nowMs: number
): Promise<void> {
  const { services, cells } = decomposeReportItemsToRows(archiveKey, year, monthKey, items, nowMs);
  const activeServiceIds = services.map((s) => s.serviceId);

  for (const srv of services) {
    await client.query(
      `INSERT INTO his_report_services (
         archive_key, year, month_key, service_id, category, name, sort_order, meta, updated_at_ms, deleted_at_ms
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NULL)
       ON CONFLICT (archive_key, service_id)
       DO UPDATE SET
         year = EXCLUDED.year,
         month_key = EXCLUDED.month_key,
         category = EXCLUDED.category,
         name = EXCLUDED.name,
         sort_order = EXCLUDED.sort_order,
         meta = EXCLUDED.meta,
         updated_at_ms = EXCLUDED.updated_at_ms,
         deleted_at_ms = NULL`,
      [
        srv.archiveKey,
        srv.year,
        srv.monthKey,
        srv.serviceId,
        srv.category,
        srv.name,
        srv.sortOrder,
        JSON.stringify(srv.meta),
        nowMs,
      ]
    );
  }

  if (activeServiceIds.length > 0) {
    await client.query(
      `UPDATE his_report_services
       SET deleted_at_ms = $3, updated_at_ms = $3
       WHERE archive_key = $1 AND deleted_at_ms IS NULL AND NOT (service_id = ANY($2::text[]))`,
      [archiveKey, activeServiceIds, nowMs]
    );
  }

  for (const c of cells) {
    await client.query(
      `INSERT INTO his_report_cells (
         archive_key, service_id, day, bh, nd, is_manual, manual_by, manual_at, updated_at_ms
       )
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (archive_key, service_id, day)
       DO UPDATE SET
         bh = EXCLUDED.bh,
         nd = EXCLUDED.nd,
         is_manual = EXCLUDED.is_manual,
         manual_by = EXCLUDED.manual_by,
         manual_at = EXCLUDED.manual_at,
         updated_at_ms = EXCLUDED.updated_at_ms`,
      [
        c.archiveKey,
        c.serviceId,
        c.day,
        JSON.stringify(c.bh),
        JSON.stringify(c.nd),
        c.isManual,
        c.manualBy || null,
        c.manualAt || null,
        nowMs,
      ]
    );
  }
}

export async function upsertReportCellsAndRebuildArchiveInTx(
  client: PoolClient,
  params: {
    archiveKey: string;
    year: number;
    monthKey: string;
    cells: CellUpdateInput[];
    actorId: string;
    actorName: string;
    nowMs: number;
  }
): Promise<Record<string, unknown>[]> {
  const { archiveKey, year, monthKey, cells, actorId, actorName, nowMs } = params;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell.serviceId || !Number.isInteger(cell.day) || cell.day < 1 || cell.day > 31) continue;

    await client.query(
      `INSERT INTO his_report_services (
         archive_key, year, month_key, service_id, category, name, sort_order, meta, updated_at_ms, deleted_at_ms
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8, NULL)
       ON CONFLICT (archive_key, service_id)
       DO UPDATE SET
         category = EXCLUDED.category,
         name = EXCLUDED.name,
         updated_at_ms = EXCLUDED.updated_at_ms,
         deleted_at_ms = NULL`,
      [
        archiveKey,
        year,
        monthKey,
        cell.serviceId,
        cell.category || "Khác",
        cell.name || cell.serviceId,
        cell.sortOrder ?? 999 + i,
        nowMs,
      ]
    );

    await client.query(
      `INSERT INTO his_report_cells (
         archive_key, service_id, day, bh, nd, is_manual, manual_by, manual_at, updated_at_ms
       )
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (archive_key, service_id, day)
       DO UPDATE SET
         bh = CASE
           WHEN his_report_cells.is_manual AND NOT EXCLUDED.is_manual AND NOT $10 THEN his_report_cells.bh
           ELSE EXCLUDED.bh
         END,
         nd = CASE
           WHEN his_report_cells.is_manual AND NOT EXCLUDED.is_manual AND NOT $10 THEN his_report_cells.nd
           ELSE EXCLUDED.nd
         END,
         is_manual = CASE
           WHEN EXCLUDED.is_manual THEN TRUE
           WHEN $10 THEN FALSE
           ELSE his_report_cells.is_manual
         END,
         manual_by = CASE
           WHEN EXCLUDED.is_manual THEN EXCLUDED.manual_by
           WHEN $10 THEN NULL
           ELSE his_report_cells.manual_by
         END,
         manual_at = CASE
           WHEN EXCLUDED.is_manual THEN EXCLUDED.manual_at
           WHEN $10 THEN NULL
           ELSE his_report_cells.manual_at
         END,
         updated_at_ms = $9`,
      [
        archiveKey,
        cell.serviceId,
        cell.day,
        JSON.stringify(cell.bh === "LT" ? "LT" : Number(cell.bh || 0)),
        JSON.stringify(cell.nd === "LT" ? "LT" : Number(cell.nd || 0)),
        Boolean(cell.isManual),
        cell.manualBy || null,
        cell.manualAt || null,
        nowMs,
        Boolean(cell.forceOverwrite),
      ]
    );
  }

  const [srvRes, cellRes] = await Promise.all([
    client.query<{
      archive_key: string;
      year: number;
      month_key: string;
      service_id: string;
      category: string;
      name: string;
      sort_order: number;
      meta: Record<string, unknown>;
      updated_at_ms: string;
      deleted_at_ms: string | null;
    }>(
      `SELECT archive_key, year, month_key, service_id, category, name, sort_order, meta, updated_at_ms::text, deleted_at_ms::text
       FROM his_report_services WHERE archive_key = $1`,
      [archiveKey]
    ),
    client.query<{
      archive_key: string;
      service_id: string;
      day: number;
      bh: number | string;
      nd: number | string;
      is_manual: boolean;
      manual_by: string | null;
      manual_at: string | null;
      updated_at_ms: string;
    }>(
      `SELECT archive_key, service_id, day, bh, nd, is_manual, manual_by, manual_at, updated_at_ms::text
       FROM his_report_cells WHERE archive_key = $1`,
      [archiveKey]
    ),
  ]);

  const items = composeReportItemsFromRows(
    srvRes.rows.map((r) => ({
      archiveKey: r.archive_key,
      year: Number(r.year),
      monthKey: r.month_key,
      serviceId: r.service_id,
      category: r.category,
      name: r.name,
      sortOrder: Number(r.sort_order),
      meta: r.meta || {},
      updatedAtMs: Number(r.updated_at_ms || 0),
      deletedAtMs: r.deleted_at_ms ? Number(r.deleted_at_ms) : null,
    })),
    cellRes.rows.map((c) => ({
      archiveKey: c.archive_key,
      serviceId: c.service_id,
      day: Number(c.day),
      bh: c.bh,
      nd: c.nd,
      isManual: Boolean(c.is_manual),
      manualBy: c.manual_by,
      manualAt: c.manual_at,
      updatedAtMs: Number(c.updated_at_ms || 0),
    }))
  );

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
    [archiveKey, year, monthKey, JSON.stringify(items), actorId, actorName, nowMs]
  );

  return items;
}

export async function loadEntityVersionMap(
  pool: Pool
): Promise<Record<string, Record<string, { version: number; updatedAtMs: number; deletedAtMs: number | null }>>> {
  const res = await pool.query<{
    entity_type: string;
    entity_id: string;
    version: number;
    updated_at_ms: string;
    deleted_at_ms: string | null;
  }>(
    `SELECT entity_type, entity_id, version, updated_at_ms::text, deleted_at_ms::text
     FROM his_entities`
  );
  const out: Record<string, Record<string, { version: number; updatedAtMs: number; deletedAtMs: number | null }>> = {};
  for (const r of res.rows) {
    if (!out[r.entity_type]) out[r.entity_type] = {};
    out[r.entity_type][r.entity_id] = {
      version: Number(r.version || 1),
      updatedAtMs: Number(r.updated_at_ms || 0),
      deletedAtMs: r.deleted_at_ms ? Number(r.deleted_at_ms) : null,
    };
  }
  return out;
}

export interface StoredFileMeta {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploaderId: string | null;
  uploaderName: string | null;
  scope: string;
  createdAtMs: number;
}

export async function saveFileBlobToDb(
  pool: Pool | null,
  memoryFallbackMap: Map<string, { meta: StoredFileMeta; content: Buffer }>,
  params: {
    filename: string;
    mimeType: string;
    content: Buffer;
    uploaderId?: string;
    uploaderName?: string;
    scope?: string;
  }
): Promise<StoredFileMeta> {
  const id = `FILE-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const sha256 = crypto.createHash("sha256").update(params.content).digest("hex");
  const createdAtMs = Date.now();
  const safeFilename = (params.filename || "attachment.bin")
    .replace(/[\r\n\0/\\]+/g, "_")
    .slice(0, 180);
  const safeMime = (params.mimeType || "application/octet-stream")
    .replace(/[\r\n\0;].*$/g, "")
    .trim()
    .slice(0, 120) || "application/octet-stream";

  const meta: StoredFileMeta = {
    id,
    filename: safeFilename,
    mimeType: safeMime,
    sizeBytes: params.content.length,
    sha256,
    uploaderId: params.uploaderId || null,
    uploaderName: params.uploaderName || null,
    scope: params.scope || "general",
    createdAtMs,
  };

  if (!pool) {
    if (memoryFallbackMap.size > 100) {
      const oldest = memoryFallbackMap.keys().next().value;
      if (oldest) memoryFallbackMap.delete(oldest);
    }
    memoryFallbackMap.set(id, { meta, content: params.content });
    return meta;
  }

  await pool.query(
    `INSERT INTO his_file_blobs (
       id, filename, mime_type, size_bytes, sha256, content, uploader_id, uploader_name, scope, created_at_ms, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [
      id,
      safeFilename,
      safeMime,
      params.content.length,
      sha256,
      params.content,
      params.uploaderId || null,
      params.uploaderName || null,
      params.scope || "general",
      createdAtMs,
    ]
  );

  return meta;
}

export async function loadFileBlobFromDb(
  pool: Pool | null,
  memoryFallbackMap: Map<string, { meta: StoredFileMeta; content: Buffer }>,
  fileId: string
): Promise<{ meta: StoredFileMeta; content: Buffer } | null> {
  if (!fileId) return null;
  if (!pool) {
    return memoryFallbackMap.get(fileId) || null;
  }

  const res = await pool.query<{
    id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
    content: Buffer;
    uploader_id: string | null;
    uploader_name: string | null;
    scope: string;
    created_at_ms: string;
  }>(
    `SELECT id, filename, mime_type, size_bytes, sha256, content, uploader_id, uploader_name, scope, created_at_ms::text
     FROM his_file_blobs WHERE id = $1 LIMIT 1`,
    [fileId]
  );
  const row = res.rows[0];
  if (!row) return null;

  return {
    meta: {
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      sha256: row.sha256,
      uploaderId: row.uploader_id,
      uploaderName: row.uploader_name,
      scope: row.scope,
      createdAtMs: Number(row.created_at_ms || 0),
    },
    content: row.content,
  };
}
