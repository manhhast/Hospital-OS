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
export const AVAILABLE_REPORT_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

const IDB_NAME = 'CLS_WorkHub_ReportArchiveDB';
const IDB_STORE = 'monthly_archives';
const IDB_VERSION = 1;

const LEGACY_DATA_KEY_PREFIX = 'google_sheet_data_';
const YEARLY_DATA_KEY_PREFIX = 'cls_report_archive_v1_';
const YEARLY_META_KEY_PREFIX = 'cls_report_archive_meta_v1_';

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

export function toFirestoreReportArchiveKey(year: number, monthKey: string): string {
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

  persistMonthArchive(
    year: number,
    monthKey: string,
    items: ArchivedCaseReportItem[],
    skipCloudPush = false
  ): void {
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
   * Non-destructive merge when receiving a monthly report archive from Firebase Cloud Firestore.
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
