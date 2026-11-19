import { AppSettings } from '../types/hospital';

export interface DailyCaseCount {
  bh: number | string;
  nd: number | string;
}

export interface ManualDayAudit {
  updatedAt: string;
  updatedBy: string;
}

export interface ArchivedCaseReportItem {
  id: string;
  category: string;
  name: string;
  dailyData: {
    [day: number]: DailyCaseCount;
  };
  manualDays?: {
    [day: number]: ManualDayAudit;
  };
  lastSyncedAt?: string;
}

export type YearlyMonthlyStore = { [monthKey: string]: ArchivedCaseReportItem[] };

export const REPORT_MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

export const DEFAULT_REPORT_YEAR = 2026;
export const MIN_REPORT_YEAR = 1900;
export const MAX_REPORT_YEAR = 2100;
export const AVAILABLE_REPORT_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

export function isValidReportYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_REPORT_YEAR && year <= MAX_REPORT_YEAR;
}

const IDB_NAME = 'CLS_WorkHub_ReportArchiveDB';
const IDB_STORE = 'monthly_archives';
const IDB_VERSION = 1;

const LEGACY_DATA_KEY_PREFIX = 'google_sheet_data_';
const YEARLY_DATA_KEY_PREFIX = 'cls_report_archive_v1_';
const YEARLY_META_KEY_PREFIX = 'cls_report_archive_meta_v1_';
const KNOWN_YEARS_STORAGE_KEY = 'cls_report_known_years_v1';

export interface YearArchiveMeta {
  year: number;
  lastSyncedAt?: string;
  lastManualEditAt?: string;
}

const getYearMonthStorageKey = (year: number, monthKey: string) =>
  `${YEARLY_DATA_KEY_PREFIX}${year}_${monthKey}`;

const getYearMetaStorageKey = (year: number) =>
  `${YEARLY_META_KEY_PREFIX}${year}`;

const getIdbKey = (year: number, monthKey: string) => `${year}__${monthKey}`;

export function toReportArchiveKey(year: number, monthKey: string): string {
  const mIdx = REPORT_MONTHS.indexOf(monthKey);
  const mNum = mIdx >= 0 ? mIdx + 1 : parseInt(monthKey.replace(/[^0-9]/g, ''), 10) || 1;
  return `${year}_m${String(Math.min(12, Math.max(1, mNum))).padStart(2, '0')}`;
}

export const REPORT_ARCHIVE_UPDATED_EVENT = 'cls-report-archive-updated';

let cloudReportArchiveHandler:
  | ((year: number, monthKey: string, items: ArchivedCaseReportItem[]) => void)
  | null = null;

export function registerCloudReportArchiveHandler(
  handler: ((year: number, monthKey: string, items: ArchivedCaseReportItem[]) => void) | null
): void {
  cloudReportArchiveHandler = handler;
}

function openArchiveDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeToIDB(year: number, monthKey: string, items: ArchivedCaseReportItem[]): Promise<void> {
  const db = await openArchiveDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put({
      key: getIdbKey(year, monthKey),
      year,
      monthKey,
      items,
      savedAt: new Date().toISOString()
    });
  } catch {
    // ignore IDB errors gracefully
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

async function readYearFromIDB(year: number): Promise<YearlyMonthlyStore> {
  const db = await openArchiveDB();
  if (!db) return {};
  return new Promise((resolve) => {
    const result: YearlyMonthlyStore = {};
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        for (const row of rows) {
          if (row && Number(row.year) === year && typeof row.monthKey === 'string' && Array.isArray(row.items) && row.items.length > 0) {
            result[row.monthKey] = row.items;
          }
        }
        try { db.close(); } catch { /* ignore */ }
        resolve(result);
      };
      req.onerror = () => {
        try { db.close(); } catch { /* ignore */ }
        resolve({});
      };
    } catch {
      try { db.close(); } catch { /* ignore */ }
      resolve({});
    }
  });
}

function hasRecordedDayValue(dayCount?: DailyCaseCount): boolean {
  if (!dayCount) return false;
  if (dayCount.bh === 'LT' || dayCount.nd === 'LT') return true;
  const bh = typeof dayCount.bh === 'number'
    ? dayCount.bh
    : parseInt(String(dayCount.bh || '').replace(/[^0-9]/g, ''), 10) || 0;
  const nd = typeof dayCount.nd === 'number'
    ? dayCount.nd
    : parseInt(String(dayCount.nd || '').replace(/[^0-9]/g, ''), 10) || 0;
  return bh > 0 || nd > 0;
}

function normalizeServiceKey(category: string, name: string): string {
  return `${(category || '').trim().toLowerCase()}___${(name || '').trim().toLowerCase()}`;
}

export function extractSpreadsheetIdFromInput(input?: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const urlMatch = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  return raw;
}

export function getReportSheetConfigForYear(
  settings: AppSettings,
  year: number
): { url: string; sheetId: string } {
  const yearKey = String(year);
  const byYear = settings.reportGoogleSheetsByYear?.[yearKey];
  if (byYear && (byYear.url?.trim() || byYear.sheetId?.trim())) {
    const cleanId = byYear.sheetId?.trim() || extractSpreadsheetIdFromInput(byYear.url);
    const cleanUrl = byYear.url?.trim() || (cleanId ? `https://docs.google.com/spreadsheets/d/${cleanId}/edit` : '');
    return { url: cleanUrl, sheetId: cleanId };
  }

  // Backward-compatible fallback for default/legacy year when reportGoogleSheetsByYear has not been saved for this year
  const activeLegacyYear = settings.reportSheetYear || DEFAULT_REPORT_YEAR;
  if (year === activeLegacyYear) {
    const legacyUrl = settings.googleSheetUrl?.trim() || localStorage.getItem('google_sheet_url') || '';
    const legacyId = settings.reportGoogleSheetId?.trim() || extractSpreadsheetIdFromInput(legacyUrl);
    if (legacyUrl || legacyId) {
      return {
        url: legacyUrl || `https://docs.google.com/spreadsheets/d/${legacyId}/edit`,
        sheetId: legacyId
      };
    }
  }

  return { url: '', sheetId: '' };
}

function rememberKnownYear(year: number): void {
  if (!isValidReportYear(year) || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(KNOWN_YEARS_STORAGE_KEY);
    const parsed: number[] = raw ? JSON.parse(raw) : [];
    const set = new Set<number>(Array.isArray(parsed) ? parsed.filter(isValidReportYear) : []);
    if (!set.has(year)) {
      set.add(year);
      localStorage.setItem(KNOWN_YEARS_STORAGE_KEY, JSON.stringify(Array.from(set).sort((a, b) => a - b)));
    }
  } catch {
    // ignore
  }
}

export function getKnownReportYears(settings?: AppSettings, extraYears: number[] = []): number[] {
  const set = new Set<number>([2024, 2025, 2026, 2027, DEFAULT_REPORT_YEAR, new Date().getFullYear()]);

  if (settings?.reportSheetYear && isValidReportYear(settings.reportSheetYear)) {
    set.add(settings.reportSheetYear);
  }
  if (Array.isArray(settings?.archivedReportYears)) {
    settings.archivedReportYears.forEach((y) => {
      if (isValidReportYear(Number(y))) set.add(Number(y));
    });
  }
  if (settings?.reportGoogleSheetsByYear) {
    Object.keys(settings.reportGoogleSheetsByYear).forEach((k) => {
      const y = Number(k);
      if (isValidReportYear(y)) set.add(y);
    });
  }
  extraYears.forEach((y) => {
    if (isValidReportYear(y)) set.add(y);
  });

  if (typeof window !== 'undefined') {
    try {
      const rawKnown = localStorage.getItem(KNOWN_YEARS_STORAGE_KEY);
      if (rawKnown) {
        const arr = JSON.parse(rawKnown);
        if (Array.isArray(arr)) {
          arr.forEach((y) => {
            if (isValidReportYear(Number(y))) set.add(Number(y));
          });
        }
      }
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith(YEARLY_DATA_KEY_PREFIX)) {
          const y = parseInt(k.slice(YEARLY_DATA_KEY_PREFIX.length, YEARLY_DATA_KEY_PREFIX.length + 4), 10);
          if (isValidReportYear(y)) set.add(y);
        } else if (k.startsWith(YEARLY_META_KEY_PREFIX)) {
          const y = parseInt(k.slice(YEARLY_META_KEY_PREFIX.length), 10);
          if (isValidReportYear(y)) set.add(y);
        }
      }
    } catch {
      // ignore
    }
  }

  return Array.from(set).sort((a, b) => a - b);
}

export interface RangeResyncOptions {
  year: number;
  monthKey: string;
  incomingItems: ArchivedCaseReportItem[];
  startDay: number;
  endDay: number;
  overwriteExistingSheetDays?: boolean;
  overwriteManualEdits?: boolean;
}

export interface RangeResyncResult {
  mergedItems: ArchivedCaseReportItem[];
  updatedDaysCount: number;
  newlyCapturedDays: number;
  newlyAddedServices: number;
  skippedManualDays: number;
}

export type AuditDiscrepancyType =
  | 'value_changed'
  | 'new_from_sheet'
  | 'cleared_on_sheet'
  | 'new_service';

export interface RangeAuditDiscrepancy {
  id: string;
  year: number;
  monthKey: string;
  day: number;
  dateLabel: string;
  category: string;
  serviceName: string;
  serviceId?: string;
  type: AuditDiscrepancyType;
  systemValue: DailyCaseCount;
  sheetValue: DailyCaseCount;
  isManualLocked: boolean;
  manualUpdatedBy?: string;
  manualUpdatedAt?: string;
}

export interface RangeAuditResult {
  discrepancies: RangeAuditDiscrepancy[];
  checkedCellsCount: number;
}

export const reportArchiveService = {
  /**
   * Synchronous read from localStorage for initial render, including automatic one-time migration
   * from legacy un-year-scoped keys (`google_sheet_data_Tháng X`) into DEFAULT_REPORT_YEAR (2026).
   */
  loadYearArchiveSync(year: number): YearlyMonthlyStore {
    const store: YearlyMonthlyStore = {};

    REPORT_MONTHS.forEach((monthKey) => {
      const yearKey = getYearMonthStorageKey(year, monthKey);
      let raw = localStorage.getItem(yearKey);

      // Migrate legacy 2026 cache once without wiping anything
      if (!raw && year === DEFAULT_REPORT_YEAR) {
        const legacyRaw = localStorage.getItem(`${LEGACY_DATA_KEY_PREFIX}${monthKey}`);
        if (legacyRaw) {
          try {
            const parsedLegacy = JSON.parse(legacyRaw);
            if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
              // Sanity guard used historically for Month 2 corrupt total column
              const saTim = parsedLegacy.find((i: any) => i.name && String(i.name).includes('Siêu âm tim'));
              const isCorruptFeb =
                monthKey === 'Tháng 2' &&
                saTim?.dailyData?.[5] &&
                (Number(saTim.dailyData[5].bh) > 50 || Number(saTim.dailyData[5].bh) === 328);
              if (!isCorruptFeb) {
                localStorage.setItem(yearKey, legacyRaw);
                raw = legacyRaw;
                void writeToIDB(year, monthKey, parsedLegacy);
              }
            }
          } catch {
            // ignore corrupt legacy JSON
          }
        }
      }

      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            store[monthKey] = parsed;
          }
        } catch {
          // ignore
        }
      }
    });

    return store;
  },

  /**
   * Async hydration from IndexedDB: if IndexedDB contains months that are missing from localStorage
   * (e.g., user cleared browser cache or hit localStorage limits), restore them cleanly.
   */
  async hydrateYearArchiveFromIDB(year: number): Promise<YearlyMonthlyStore> {
    const idbStore = await readYearFromIDB(year);
    const currentSync = this.loadYearArchiveSync(year);
    const combined: YearlyMonthlyStore = { ...currentSync };

    for (const monthKey of REPORT_MONTHS) {
      if ((!combined[monthKey] || combined[monthKey].length === 0) && idbStore[monthKey]?.length) {
        combined[monthKey] = idbStore[monthKey];
        try {
          localStorage.setItem(getYearMonthStorageKey(year, monthKey), JSON.stringify(idbStore[monthKey]));
        } catch {
          // ignore quota error; IDB remains authoritative
        }
      }
    }
    return combined;
  },

  async getAllKnownYearsFromIDB(): Promise<number[]> {
    const db = await openArchiveDB();
    if (!db) return [];
    return new Promise((resolve) => {
      const years = new Set<number>();
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? req.result : [];
          for (const row of rows) {
            const y = Number(row?.year);
            if (isValidReportYear(y)) years.add(y);
          }
          try { db.close(); } catch { /* ignore */ }
          resolve(Array.from(years).sort((a, b) => a - b));
        };
        req.onerror = () => {
          try { db.close(); } catch { /* ignore */ }
          resolve([]);
        };
      } catch {
        try { db.close(); } catch { /* ignore */ }
        resolve([]);
      }
    });
  },

  persistMonthArchive(
    year: number,
    monthKey: string,
    items: ArchivedCaseReportItem[],
    skipCloudPush = false
  ): void {
    rememberKnownYear(year);
    try {
      localStorage.setItem(getYearMonthStorageKey(year, monthKey), JSON.stringify(items));
    } catch (err) {
      console.warn(`Unable to persist ${monthKey}/${year} in localStorage:`, err);
    }
    void writeToIDB(year, monthKey, items);
    if (!skipCloudPush && cloudReportArchiveHandler) {
      cloudReportArchiveHandler(year, monthKey, items);
    }
  },

  /**
   * Non-destructive merge when receiving a monthly report archive from the PostgreSQL backend server.
   * Preserves all locally recorded and manual-locked days and takes whichever manual edit is newer.
   */
  applyCloudMonthArchive(
    year: number,
    monthKey: string,
    cloudItems: ArchivedCaseReportItem[]
  ): ArchivedCaseReportItem[] {
    if (!Array.isArray(cloudItems) || cloudItems.length === 0) {
      return this.loadYearArchiveSync(year)[monthKey] || [];
    }

    const existingStore = this.loadYearArchiveSync(year);
    const localItems = existingStore[monthKey] || [];

    let merged: ArchivedCaseReportItem[];

    if (localItems.length === 0) {
      merged = cloudItems;
    } else {
      const localByFullKey = new Map<string, ArchivedCaseReportItem>();
      const localByName = new Map<string, ArchivedCaseReportItem>();
      for (const loc of localItems) {
        localByFullKey.set(normalizeServiceKey(loc.category, loc.name), loc);
        localByName.set(loc.name.trim().toLowerCase(), loc);
      }

      const matchedCloudKeys = new Set<string>();
      merged = localItems.map((loc) => {
        const fullKey = normalizeServiceKey(loc.category, loc.name);
        const cloudMatch = cloudItems.find(
          (c) =>
            normalizeServiceKey(c.category, c.name) === fullKey ||
            c.name.trim().toLowerCase() === loc.name.trim().toLowerCase()
        );
        if (!cloudMatch) return loc;

        matchedCloudKeys.add(normalizeServiceKey(cloudMatch.category, cloudMatch.name));
        const nextDaily: { [day: number]: DailyCaseCount } = { ...(loc.dailyData || {}) };
        const nextManual: { [day: number]: ManualDayAudit } = { ...(loc.manualDays || {}) };

        for (let d = 1; d <= 31; d++) {
          const localVal = loc.dailyData?.[d];
          const cloudVal = cloudMatch.dailyData?.[d];
          const localManual = loc.manualDays?.[d];
          const cloudManual = cloudMatch.manualDays?.[d];

          if (cloudManual && (!localManual || cloudManual.updatedAt >= localManual.updatedAt)) {
            if (cloudVal) nextDaily[d] = { ...cloudVal };
            nextManual[d] = { ...cloudManual };
          } else if (!hasRecordedDayValue(localVal) && hasRecordedDayValue(cloudVal) && cloudVal) {
            nextDaily[d] = { ...cloudVal };
          }
        }

        return {
          ...loc,
          dailyData: nextDaily,
          manualDays: Object.keys(nextManual).length > 0 ? nextManual : loc.manualDays,
          lastSyncedAt:
            cloudMatch.lastSyncedAt && (!loc.lastSyncedAt || cloudMatch.lastSyncedAt > loc.lastSyncedAt)
              ? cloudMatch.lastSyncedAt
              : loc.lastSyncedAt
        };
      });

      for (const cloudItem of cloudItems) {
        const cKey = normalizeServiceKey(cloudItem.category, cloudItem.name);
        if (!matchedCloudKeys.has(cKey)) {
          const existsByName = merged.some(
            (m) => m.name.trim().toLowerCase() === cloudItem.name.trim().toLowerCase()
          );
          if (!existsByName) {
            merged.push(cloudItem);
          }
        }
      }
    }

    this.persistMonthArchive(year, monthKey, merged, true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(REPORT_ARCHIVE_UPDATED_EVENT, { detail: { year, monthKey } })
      );
    }
    return merged;
  },

  getYearMeta(year: number): YearArchiveMeta {
    try {
      const raw = localStorage.getItem(getYearMetaStorageKey(year));
      if (raw) return JSON.parse(raw) as YearArchiveMeta;
    } catch {
      // ignore
    }
    return { year };
  },

  updateYearMeta(year: number, patch: Partial<YearArchiveMeta>): void {
    const next: YearArchiveMeta = { ...this.getYearMeta(year), ...patch, year };
    try {
      localStorage.setItem(getYearMetaStorageKey(year), JSON.stringify(next));
    } catch {
      // ignore
    }
  },

  /**
   * Immutable, non-destructive merge when pulling daily data from Google Sheets:
   * - Never deletes services/months already saved on the system (even if deleted on Google Sheet).
   * - Never overwrites days that are manually edited (`manualDays[d]`) OR already saved with values on the system.
   * - Only captures new days (empty/0 in archive -> non-empty in sheet) and newly added services.
   */
  mergeSyncedMonthIntoArchive(
    year: number,
    monthKey: string,
    incomingItems: ArchivedCaseReportItem[]
  ): {
    mergedItems: ArchivedCaseReportItem[];
    newlyCapturedDays: number;
    newlyAddedServices: number;
    protectedExistingDays: number;
  } {
    const existingStore = this.loadYearArchiveSync(year);
    const existingItems = existingStore[monthKey] || [];
    const nowIso = new Date().toISOString();

    if (incomingItems.length === 0) {
      return {
        mergedItems: existingItems,
        newlyCapturedDays: 0,
        newlyAddedServices: 0,
        protectedExistingDays: existingItems.reduce(
          (sum, item) => sum + Object.keys(item.dailyData || {}).length,
          0
        )
      };
    }

    if (existingItems.length === 0) {
      const stamped = incomingItems.map((item) => ({
        ...item,
        lastSyncedAt: nowIso
      }));
      this.persistMonthArchive(year, monthKey, stamped);
      this.updateYearMeta(year, { lastSyncedAt: nowIso });

      const capturedDays = stamped.reduce(
        (sum, item) => sum + Object.values(item.dailyData || {}).filter(hasRecordedDayValue).length,
        0
      );

      return {
        mergedItems: stamped,
        newlyCapturedDays: capturedDays,
        newlyAddedServices: stamped.length,
        protectedExistingDays: 0
      };
    }

    let newlyCapturedDays = 0;
    let newlyAddedServices = 0;
    let protectedExistingDays = 0;

    // Index incoming items by (category + name) and fallback exact name
    const incomingByFullKey = new Map<string, ArchivedCaseReportItem>();
    const incomingByName = new Map<string, ArchivedCaseReportItem>();
    for (const inc of incomingItems) {
      incomingByFullKey.set(normalizeServiceKey(inc.category, inc.name), inc);
      incomingByName.set(inc.name.trim().toLowerCase(), inc);
    }

    const matchedIncomingKeys = new Set<string>();

    const mergedItems: ArchivedCaseReportItem[] = existingItems.map((existing) => {
      const fullKey = normalizeServiceKey(existing.category, existing.name);
      const nameKey = existing.name.trim().toLowerCase();
      const matchedIncoming = incomingByFullKey.get(fullKey) || incomingByName.get(nameKey);

      if (!matchedIncoming) {
        // Row was deleted/removed on Google Sheet -> preserve completely on system
        protectedExistingDays += Object.values(existing.dailyData || {}).filter(hasRecordedDayValue).length;
        return existing;
      }

      matchedIncomingKeys.add(normalizeServiceKey(matchedIncoming.category, matchedIncoming.name));

      const nextDailyData: { [day: number]: DailyCaseCount } = { ...(existing.dailyData || {}) };
      for (let d = 1; d <= 31; d++) {
        const isManualLocked = Boolean(existing.manualDays?.[d]);
        const existingDayVal = existing.dailyData?.[d];
        const hasExistingVal = hasRecordedDayValue(existingDayVal);
        const incomingDayVal = matchedIncoming.dailyData?.[d];
        const hasIncomingVal = hasRecordedDayValue(incomingDayVal);

        if (isManualLocked || hasExistingVal) {
          // System archive is locked once recorded (or edited manually): Sheet deletion/changes cannot overwrite it
          if (hasExistingVal || isManualLocked) {
            protectedExistingDays += 1;
          }
          continue;
        }

        if (hasIncomingVal && incomingDayVal) {
          nextDailyData[d] = { ...incomingDayVal };
          newlyCapturedDays += 1;
        }
      }

      return {
        ...existing,
        dailyData: nextDailyData,
        lastSyncedAt: nowIso
      };
    });

    // Append any brand-new services found on Google Sheet that did not exist in archive
    for (const inc of incomingItems) {
      const fullKey = normalizeServiceKey(inc.category, inc.name);
      if (!matchedIncomingKeys.has(fullKey)) {
        const alreadyExistsByName = mergedItems.some(
          (m) => m.name.trim().toLowerCase() === inc.name.trim().toLowerCase()
        );
        if (!alreadyExistsByName) {
          mergedItems.push({ ...inc, lastSyncedAt: nowIso });
          newlyAddedServices += 1;
          newlyCapturedDays += Object.values(inc.dailyData || {}).filter(hasRecordedDayValue).length;
        }
      }
    }

    this.persistMonthArchive(year, monthKey, mergedItems);
    this.updateYearMeta(year, { lastSyncedAt: nowIso });

    return {
      mergedItems,
      newlyCapturedDays,
      newlyAddedServices,
      protectedExistingDays
    };
  },

  /**
   * Selective time-range re-sync from Google Sheets:
   * - Days OUTSIDE [startDay..endDay] remain 100% untouched.
   * - Days INSIDE [startDay..endDay] are updated from Google Sheet when `overwriteExistingSheetDays` is true.
   * - Manually edited cells (`manualDays[d]`) remain protected unless `overwriteManualEdits` is explicitly enabled.
   */
  resyncMonthRangeIntoArchive(options: RangeResyncOptions): RangeResyncResult {
    const {
      year,
      monthKey,
      incomingItems,
      startDay,
      endDay,
      overwriteExistingSheetDays = true,
      overwriteManualEdits = false
    } = options;

    const minD = Math.max(1, Math.min(31, startDay));
    const maxD = Math.max(minD, Math.min(31, endDay));
    const existingStore = this.loadYearArchiveSync(year);
    const existingItems = existingStore[monthKey] || [];
    const nowIso = new Date().toISOString();

    if (incomingItems.length === 0) {
      return {
        mergedItems: existingItems,
        updatedDaysCount: 0,
        newlyCapturedDays: 0,
        newlyAddedServices: 0,
        skippedManualDays: 0
      };
    }

    let updatedDaysCount = 0;
    let newlyCapturedDays = 0;
    let newlyAddedServices = 0;
    let skippedManualDays = 0;

    if (existingItems.length === 0) {
      const slicedItems = incomingItems.map((item) => {
        const filteredDaily: { [day: number]: DailyCaseCount } = {};
        for (let d = minD; d <= maxD; d++) {
          const val = item.dailyData?.[d];
          if (hasRecordedDayValue(val) && val) {
            filteredDaily[d] = { ...val };
            newlyCapturedDays += 1;
          }
        }
        return {
          ...item,
          dailyData: filteredDaily,
          lastSyncedAt: nowIso
        };
      });

      this.persistMonthArchive(year, monthKey, slicedItems);
      this.updateYearMeta(year, { lastSyncedAt: nowIso });
      return {
        mergedItems: slicedItems,
        updatedDaysCount: 0,
        newlyCapturedDays,
        newlyAddedServices: slicedItems.length,
        skippedManualDays: 0
      };
    }

    const incomingByFullKey = new Map<string, ArchivedCaseReportItem>();
    const incomingByName = new Map<string, ArchivedCaseReportItem>();
    for (const inc of incomingItems) {
      incomingByFullKey.set(normalizeServiceKey(inc.category, inc.name), inc);
      incomingByName.set(inc.name.trim().toLowerCase(), inc);
    }

    const matchedIncomingKeys = new Set<string>();

    const mergedItems: ArchivedCaseReportItem[] = existingItems.map((existing) => {
      const fullKey = normalizeServiceKey(existing.category, existing.name);
      const nameKey = existing.name.trim().toLowerCase();
      const matchedIncoming = incomingByFullKey.get(fullKey) || incomingByName.get(nameKey);

      if (!matchedIncoming) {
        return existing;
      }

      matchedIncomingKeys.add(normalizeServiceKey(matchedIncoming.category, matchedIncoming.name));

      const nextDailyData: { [day: number]: DailyCaseCount } = { ...(existing.dailyData || {}) };
      const nextManualDays: { [day: number]: ManualDayAudit } = { ...(existing.manualDays || {}) };

      for (let d = minD; d <= maxD; d++) {
        const isManualLocked = Boolean(nextManualDays[d]);
        if (isManualLocked && !overwriteManualEdits) {
          skippedManualDays += 1;
          continue;
        }

        const existingVal = nextDailyData[d];
        const hasExistingVal = hasRecordedDayValue(existingVal);
        const incomingVal = matchedIncoming.dailyData?.[d];
        const hasIncomingVal = hasRecordedDayValue(incomingVal);

        if (!overwriteExistingSheetDays && hasExistingVal) {
          continue;
        }

        if (hasIncomingVal && incomingVal) {
          const changed =
            !existingVal ||
            String(existingVal.bh) !== String(incomingVal.bh) ||
            String(existingVal.nd) !== String(incomingVal.nd);
          nextDailyData[d] = { ...incomingVal };
          if (isManualLocked && overwriteManualEdits) {
            delete nextManualDays[d];
          }
          if (!hasExistingVal) newlyCapturedDays += 1;
          else if (changed) updatedDaysCount += 1;
        } else if (overwriteExistingSheetDays && hasExistingVal) {
          // Google Sheet explicitly cleared/zeroed this day inside selected re-sync window
          nextDailyData[d] = { bh: 0, nd: 0 };
          if (isManualLocked && overwriteManualEdits) {
            delete nextManualDays[d];
          }
          updatedDaysCount += 1;
        }
      }

      return {
        ...existing,
        dailyData: nextDailyData,
        manualDays: Object.keys(nextManualDays).length > 0 ? nextManualDays : undefined,
        lastSyncedAt: nowIso
      };
    });

    for (const inc of incomingItems) {
      const fullKey = normalizeServiceKey(inc.category, inc.name);
      if (!matchedIncomingKeys.has(fullKey)) {
        const alreadyExistsByName = mergedItems.some(
          (m) => m.name.trim().toLowerCase() === inc.name.trim().toLowerCase()
        );
        if (!alreadyExistsByName) {
          const filteredDaily: { [day: number]: DailyCaseCount } = {};
          for (let d = minD; d <= maxD; d++) {
            const val = inc.dailyData?.[d];
            if (hasRecordedDayValue(val) && val) {
              filteredDaily[d] = { ...val };
              newlyCapturedDays += 1;
            }
          }
          mergedItems.push({ ...inc, dailyData: filteredDaily, lastSyncedAt: nowIso });
          newlyAddedServices += 1;
        }
      }
    }

    this.persistMonthArchive(year, monthKey, mergedItems);
    this.updateYearMeta(year, { lastSyncedAt: nowIso });

    return {
      mergedItems,
      updatedDaysCount,
      newlyCapturedDays,
      newlyAddedServices,
      skippedManualDays
    };
  },

  /**
   * Read-only comparison between Google Sheet data and the persisted system archive
   * within [startDay..endDay]. Never mutates stored data.
   */
  auditMonthRangeAgainstSheet(options: {
    year: number;
    monthKey: string;
    incomingItems: ArchivedCaseReportItem[];
    startDay: number;
    endDay: number;
  }): RangeAuditResult {
    const { year, monthKey, incomingItems, startDay, endDay } = options;
    const minD = Math.max(1, Math.min(31, startDay));
    const maxD = Math.max(minD, Math.min(31, endDay));
    const existingStore = this.loadYearArchiveSync(year);
    const existingItems = existingStore[monthKey] || [];
    const monthNum = parseInt(monthKey.replace(/[^0-9]/g, ''), 10) || 1;
    const pad2 = (n: number) => String(n).padStart(2, '0');

    const normPart = (v: number | string | undefined): string => {
      if (v === undefined || v === null || v === '') return '0';
      if (String(v).trim().toUpperCase() === 'LT') return 'LT';
      const n =
        typeof v === 'number'
          ? v
          : parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0;
      return String(n);
    };

    const toCleanCount = (val?: DailyCaseCount): DailyCaseCount => {
      if (!val) return { bh: 0, nd: 0 };
      const bhStr = normPart(val.bh);
      const ndStr = normPart(val.nd);
      return {
        bh: bhStr === 'LT' ? 'LT' : parseInt(bhStr, 10) || 0,
        nd: ndStr === 'LT' ? 'LT' : parseInt(ndStr, 10) || 0
      };
    };

    const isSameCell = (a?: DailyCaseCount, b?: DailyCaseCount): boolean =>
      normPart(a?.bh) === normPart(b?.bh) && normPart(a?.nd) === normPart(b?.nd);

    const discrepancies: RangeAuditDiscrepancy[] = [];
    let checkedCellsCount = 0;

    const incomingByFullKey = new Map<string, ArchivedCaseReportItem>();
    const incomingByName = new Map<string, ArchivedCaseReportItem>();
    for (const inc of incomingItems) {
      incomingByFullKey.set(normalizeServiceKey(inc.category, inc.name), inc);
      incomingByName.set(inc.name.trim().toLowerCase(), inc);
    }

    const matchedIncomingKeys = new Set<string>();

    for (const existing of existingItems) {
      const fullKey = normalizeServiceKey(existing.category, existing.name);
      const nameKey = existing.name.trim().toLowerCase();
      const matchedIncoming =
        incomingByFullKey.get(fullKey) || incomingByName.get(nameKey);

      if (matchedIncoming) {
        matchedIncomingKeys.add(
          normalizeServiceKey(matchedIncoming.category, matchedIncoming.name)
        );
      }

      for (let d = minD; d <= maxD; d++) {
        checkedCellsCount += 1;
        const sysVal = existing.dailyData?.[d];
        const shtVal = matchedIncoming?.dailyData?.[d];

        if (isSameCell(sysVal, shtVal)) continue;

        const hasSys = hasRecordedDayValue(sysVal);
        const hasSht = hasRecordedDayValue(shtVal);
        if (!hasSys && !hasSht) continue;

        const manualInfo = existing.manualDays?.[d];
        const type: AuditDiscrepancyType = !hasSys && hasSht
          ? 'new_from_sheet'
          : hasSys && !hasSht
            ? 'cleared_on_sheet'
            : 'value_changed';

        discrepancies.push({
          id: `${year}_${monthNum}_${d}_${fullKey}`,
          year,
          monthKey,
          day: d,
          dateLabel: `${pad2(d)}/${pad2(monthNum)}/${year}`,
          category: existing.category,
          serviceName: existing.name,
          serviceId: existing.id,
          type,
          systemValue: toCleanCount(sysVal),
          sheetValue: toCleanCount(shtVal),
          isManualLocked: Boolean(manualInfo),
          manualUpdatedBy: manualInfo?.updatedBy,
          manualUpdatedAt: manualInfo?.updatedAt
        });
      }
    }

    for (const inc of incomingItems) {
      const fullKey = normalizeServiceKey(inc.category, inc.name);
      if (matchedIncomingKeys.has(fullKey)) continue;
      const existsByName = existingItems.some(
        (m) => m.name.trim().toLowerCase() === inc.name.trim().toLowerCase()
      );
      if (existsByName) continue;

      for (let d = minD; d <= maxD; d++) {
        checkedCellsCount += 1;
        const shtVal = inc.dailyData?.[d];
        if (!hasRecordedDayValue(shtVal) || !shtVal) continue;

        discrepancies.push({
          id: `${year}_${monthNum}_${d}_new_${fullKey}`,
          year,
          monthKey,
          day: d,
          dateLabel: `${pad2(d)}/${pad2(monthNum)}/${year}`,
          category: inc.category,
          serviceName: inc.name,
          serviceId: inc.id,
          type: 'new_service',
          systemValue: { bh: 0, nd: 0 },
          sheetValue: toCleanCount(shtVal),
          isManualLocked: false
        });
      }
    }

    return { discrepancies, checkedCellsCount };
  },

  /**
   * Applies ONLY the user-approved discrepancies from an audit into the month archive
   * and saves immediately. Days and services not included remain untouched.
   */
  applyAuditDiscrepanciesForMonth(
    year: number,
    monthKey: string,
    approvedDiscrepancies: RangeAuditDiscrepancy[]
  ): ArchivedCaseReportItem[] {
    const existingStore = this.loadYearArchiveSync(year);
    const existingItems = existingStore[monthKey] || [];
    const nowIso = new Date().toISOString();

    const nextItems: ArchivedCaseReportItem[] = existingItems.map((item) => ({
      ...item,
      dailyData: { ...(item.dailyData || {}) },
      manualDays: item.manualDays ? { ...item.manualDays } : undefined
    }));

    for (const disc of approvedDiscrepancies) {
      if (disc.year !== year || disc.monthKey !== monthKey) continue;

      const targetKey = normalizeServiceKey(disc.category, disc.serviceName);
      const targetName = disc.serviceName.trim().toLowerCase();

      let targetItem = nextItems.find(
        (item) =>
          normalizeServiceKey(item.category, item.name) === targetKey ||
          item.name.trim().toLowerCase() === targetName
      );

      if (!targetItem) {
        targetItem = {
          id:
            disc.serviceId ||
            `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          category: disc.category,
          name: disc.serviceName,
          dailyData: {},
          lastSyncedAt: nowIso
        };
        nextItems.push(targetItem);
      }

      targetItem.dailyData[disc.day] = {
        bh: disc.sheetValue.bh,
        nd: disc.sheetValue.nd
      };

      if (targetItem.manualDays && targetItem.manualDays[disc.day]) {
        delete targetItem.manualDays[disc.day];
        if (Object.keys(targetItem.manualDays).length === 0) {
          targetItem.manualDays = undefined;
        }
      }

      targetItem.lastSyncedAt = nowIso;
    }

    this.persistMonthArchive(year, monthKey, nextItems);
    this.updateYearMeta(year, { lastSyncedAt: nowIso });
    return nextItems;
  },

  /**
   * Saves manual day edits into the system archive and flags `manualDays[day]` so automated
   * Google Sheet pulls can never overwrite manual adjustments.
   */
  saveManualDayUpdates(
    year: number,
    monthKey: string,
    updatedItems: ArchivedCaseReportItem[],
    editedDays: number[],
    updatedBy: string
  ): ArchivedCaseReportItem[] {
    const nowIso = new Date().toISOString();
    const stamped = updatedItems.map((item) => {
      const nextManualDays = { ...(item.manualDays || {}) };
      for (const d of editedDays) {
        nextManualDays[d] = { updatedAt: nowIso, updatedBy };
      }
      return {
        ...item,
        manualDays: nextManualDays
      };
    });

    this.persistMonthArchive(year, monthKey, stamped);
    this.updateYearMeta(year, { lastManualEditAt: nowIso });
    return stamped;
  },

  getYearSummaryStats(year: number, store: YearlyMonthlyStore): {
    archivedMonthsCount: number;
    totalRecordedCells: number;
    manualEditedDaysCount: number;
  } {
    let archivedMonthsCount = 0;
    let totalRecordedCells = 0;
    let manualEditedDaysCount = 0;

    for (const m of REPORT_MONTHS) {
      const items = store[m];
      if (items && items.length > 0) {
        archivedMonthsCount += 1;
        const manualDaysSet = new Set<number>();
        for (const item of items) {
          totalRecordedCells += Object.values(item.dailyData || {}).filter(hasRecordedDayValue).length;
          if (item.manualDays) {
            Object.keys(item.manualDays).forEach((d) => manualDaysSet.add(Number(d)));
          }
        }
        manualEditedDaysCount += manualDaysSet.size;
      }
    }

    return { archivedMonthsCount, totalRecordedCells, manualEditedDaysCount };
  }
};
