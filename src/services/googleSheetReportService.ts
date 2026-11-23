import {
  getReportSheetConfigForYear,
  REPORT_ARCHIVE_UPDATED_EVENT,
  reportArchiveService,
  type ArchivedCaseReportItem,
  type RangeAuditDiscrepancy
} from './reportArchiveService';
import { syncLiveContextToServer } from './aiContextService';
import { postgresSyncService } from './postgresSyncService';
import { storageService } from './storageService';
import type {
  SyncHistoryAutoWrittenItem,
  SyncHistoryDiscrepancyItem,
  SyncHistoryEntry
} from '../types/hospital';
import {
  detectMonthInSheetCsv,
  fetchRawTabCsv,
  fetchSingleSheetTab,
  getCandidateTabNames,
  getDaysInMonth,
  getMonthNumber,
  isValidServiceName,
  parseCsvTextToItems,
  parseGoogleSheetRowsToCaseReports,
  resolveSpreadsheetId
} from '../utils/caseReportParser';

export {
  detectMonthInSheetCsv,
  fetchRawTabCsv,
  fetchSingleSheetTab,
  getCandidateTabNames,
  getDaysInMonth,
  getMonthNumber,
  isValidServiceName,
  parseCsvTextToItems,
  parseGoogleSheetRowsToCaseReports,
  resolveSpreadsheetId
};

export interface ThreeDaySlice {
  year: number;
  monthKey: string;
  startDay: number;
  endDay: number;
}

export interface RecentThreeDaysWindow {
  startDateIso: string;
  endDateIso: string;
  dateRangeLabel: string;
  slices: ThreeDaySlice[];
}

export function getRecentThreeDaysWindow(referenceDate: Date = new Date()): RecentThreeDaysWindow {
  const endObj = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const startObj = new Date(endObj.getFullYear(), endObj.getMonth(), endObj.getDate() - 2);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const fmtIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fmtVi = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

  const sliceMap = new Map<string, ThreeDaySlice>();
  for (let offset = 0; offset < 3; offset++) {
    const dayObj = new Date(startObj.getFullYear(), startObj.getMonth(), startObj.getDate() + offset);
    const y = dayObj.getFullYear();
    const m = dayObj.getMonth() + 1;
    const d = dayObj.getDate();
    const monthKey = `Tháng ${m}`;
    const mapKey = `${y}__${monthKey}`;
    const existing = sliceMap.get(mapKey);
    if (!existing) {
      sliceMap.set(mapKey, { year: y, monthKey, startDay: d, endDay: d });
    } else {
      existing.startDay = Math.min(existing.startDay, d);
      existing.endDay = Math.max(existing.endDay, d);
    }
  }

  return {
    startDateIso: fmtIso(startObj),
    endDateIso: fmtIso(endObj),
    dateRangeLabel: `${fmtVi(startObj)} – ${fmtVi(endObj)}`,
    slices: Array.from(sliceMap.values())
  };
}

export interface ThreeDaySmartSyncOutcome {
  ran: boolean;
  reason?: 'no_sheet_configured' | 'sheet_unreachable';
  entry?: SyncHistoryEntry;
  autoWrittenCount: number;
  updatedFromSheetCount: number;
  overwrittenItems: SyncHistoryDiscrepancyItem[];
  alertDiscrepancies: SyncHistoryDiscrepancyItem[];
}

function isEmptyNumericCell(val?: { bh?: number | string; nd?: number | string }): boolean {
  if (!val) return true;
  const bhStr = String(val.bh ?? '').trim().toUpperCase();
  const ndStr = String(val.nd ?? '').trim().toUpperCase();
  if (bhStr === 'LT' || ndStr === 'LT') return false;
  const bhNum = parseInt(bhStr.replace(/[^0-9]/g, ''), 10) || 0;
  const ndNum = parseInt(ndStr.replace(/[^0-9]/g, ''), 10) || 0;
  return bhNum === 0 && ndNum === 0;
}

/**
 * 3-Day Smart Sync (runs on startup, before report dispatch, or via manual 3-day check):
 * - Audits the 3 most recent calendar days against Google Sheet.
 * - ALWAYS allows overwriting ALL differing cells (empty->filled, value_changed, cleared_on_sheet,
 *   including previously manual-locked cells within the 3-day window) so System & PostgreSQL 100% match Google Sheet.
 * - Records detailed per-service original data (systemBh/Nd) & replacement data (sheetBh/Nd) in Sync History.
 */
export async function runThreeDaySmartSync(
  trigger: 'startup_3d_auto' | 'manual_3d'
): Promise<ThreeDaySmartSyncOutcome> {
  const window3d = getRecentThreeDaysWindow();
  const settings = storageService.getSettings();
  const now = new Date();
  const displayTime = now.toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
  const currentUser = storageService.getCurrentUser();
  const performedBy = currentUser?.name || currentUser?.email || 'Hệ thống tự động';

  // Verify at least one slice year has a configured Google Sheet
  const hasAnyConfiguredSheet = window3d.slices.some((s) =>
    Boolean(resolveSpreadsheetId(getReportSheetConfigForYear(settings, s.year).url))
  );

  if (!hasAnyConfiguredSheet) {
    return {
      ran: false,
      reason: 'no_sheet_configured',
      autoWrittenCount: 0,
      updatedFromSheetCount: 0,
      overwrittenItems: [],
      alertDiscrepancies: []
    };
  }

  let totalCheckedCells = 0;
  let processedSlices = 0;
  let dbSavedMonths = 0;
  let dbFailureNote: string | undefined;

  const autoWrittenSamples: SyncHistoryAutoWrittenItem[] = [];
  let autoWrittenCount = 0;
  let updatedFromSheetCount = 0;
  const overwrittenItems: SyncHistoryDiscrepancyItem[] = [];
  const unreachableTabs: string[] = [];

  try {
    const slicesByYear = new Map<number, ThreeDaySlice[]>();
    for (const s of window3d.slices) {
      const list = slicesByYear.get(s.year) || [];
      list.push(s);
      slicesByYear.set(s.year, list);
    }

    for (const [sliceYear, slices] of slicesByYear.entries()) {
      await reportArchiveService.hydrateYearArchiveFromIDB(sliceYear);
      const sheetUrl = getReportSheetConfigForYear(settings, sliceYear).url;
      const sheetId = resolveSpreadsheetId(sheetUrl);
      if (!sheetId) {
        slices.forEach((s) => unreachableTabs.push(`${s.monthKey}/${sliceYear} (chưa có ID Sheet)`));
        continue;
      }

      const probeCsv = await fetchRawTabCsv(sheetId, '__cls_probe_nonexistent__');

      for (const slice of slices) {
        const incomingItems = await fetchSingleSheetTab(
          sheetUrl,
          slice.monthKey,
          probeCsv,
          sliceYear
        );

        if (!incomingItems || incomingItems.length === 0) {
          unreachableTabs.push(`${slice.monthKey}/${sliceYear}`);
          continue;
        }

        processedSlices += 1;
        const auditRes = reportArchiveService.auditMonthRangeAgainstSheet({
          year: sliceYear,
          monthKey: slice.monthKey,
          incomingItems,
          startDay: slice.startDay,
          endDay: slice.endDay
        });

        totalCheckedCells += auditRes.checkedCellsCount;

        const allOverwriteItems: RangeAuditDiscrepancy[] = [];
        for (const disc of auditRes.discrepancies) {
          allOverwriteItems.push(disc);

          if (
            (disc.type === 'new_from_sheet' || disc.type === 'new_service') &&
            !disc.isManualLocked &&
            isEmptyNumericCell(disc.systemValue)
          ) {
            autoWrittenCount += 1;
            autoWrittenSamples.push({
              dateLabel: disc.dateLabel,
              category: disc.category,
              serviceName: disc.serviceName,
              bh: disc.sheetValue.bh,
              nd: disc.sheetValue.nd
            });
          } else {
            updatedFromSheetCount += 1;
            overwrittenItems.push({
              id: disc.id,
              year: disc.year,
              monthKey: disc.monthKey,
              day: disc.day,
              dateLabel: disc.dateLabel,
              category: disc.category,
              serviceName: disc.serviceName,
              type: disc.type,
              systemBh: disc.systemValue.bh,
              systemNd: disc.systemValue.nd,
              sheetBh: disc.sheetValue.bh,
              sheetNd: disc.sheetValue.nd,
              isManualLocked: disc.isManualLocked,
              resolutionStatus: 'updated_from_sheet',
              resolvedAt: displayTime,
              resolvedBy: performedBy
            });
          }
        }

        if (allOverwriteItems.length > 0) {
          const updatedMonthItems = reportArchiveService.applyAuditDiscrepanciesForMonth(
            sliceYear,
            slice.monthKey,
            allOverwriteItems
          );
          const dbRes = await postgresSyncService.forceSaveReportMonthToServer(
            sliceYear,
            slice.monthKey,
            updatedMonthItems
          );
          if (dbRes.saved) {
            dbSavedMonths += 1;
          } else if (!dbFailureNote && dbRes.reason) {
            dbFailureNote = dbRes.reason;
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(REPORT_ARCHIVE_UPDATED_EVENT, {
                detail: { year: sliceYear, monthKey: slice.monthKey }
              })
            );
          }
        }
      }
    }

    const totalChanges = autoWrittenCount + updatedFromSheetCount;
    if (totalChanges > 0) {
      void syncLiveContextToServer(true);
    }

    const pgState = postgresSyncService.getState();
    const pgConnected = pgState.configured && pgState.authenticated;
    const savedToDatabase =
      totalChanges > 0 ? dbSavedMonths > 0 : pgConnected;

    const status =
      processedSlices === 0
        ? 'error'
        : totalChanges > 0
          ? 'success'
          : 'no_change';

    let summary = '';
    if (processedSlices === 0) {
      summary = `Không đọc được tab Google Sheet trong 3 ngày gần nhất (${window3d.dateRangeLabel}): ${unreachableTabs.join(', ')}.`;
    } else if (updatedFromSheetCount > 0 && autoWrittenCount > 0) {
      summary = `Rà soát & đồng bộ 3 ngày gần nhất (${window3d.dateRangeLabel}): đã ghi đè ${updatedFromSheetCount} dịch vụ sai lệch (lưu chi tiết dữ liệu gốc & thay thế) và ghi mới ${autoWrittenCount} ô để khớp 100% Google Sheet.`;
    } else if (updatedFromSheetCount > 0) {
      summary = `Rà soát & đồng bộ 3 ngày gần nhất (${window3d.dateRangeLabel}): đã tự động ghi đè ${updatedFromSheetCount} mục của dịch vụ theo Google Sheet (đã lưu chi tiết dữ liệu gốc & dữ liệu thay thế).`;
    } else if (autoWrittenCount > 0) {
      summary = `Rà soát & đồng bộ 3 ngày gần nhất (${window3d.dateRangeLabel}): đã tự động ghi mới ${autoWrittenCount} ô từ Google Sheet vào Hệ thống.`;
    } else {
      summary = `Rà soát 3 ngày gần nhất (${window3d.dateRangeLabel}): đã kiểm tra ${totalCheckedCells} ô, dữ liệu Hệ thống và Google Sheet hoàn toàn khớp.`;
    }

    const persistenceNote =
      dbFailureNote ||
      (savedToDatabase
        ? 'Đã lưu cố định trên PostgreSQL'
        : pgState.configured
          ? 'Đã lưu cục bộ (chưa đồng bộ PostgreSQL)'
          : 'Đã lưu cục bộ (IndexedDB & LocalStorage)');

    const entry: SyncHistoryEntry = {
      id: `SYNC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now.toISOString(),
      displayTime,
      trigger,
      dateRangeLabel: window3d.dateRangeLabel,
      startDate: window3d.startDateIso,
      endDate: window3d.endDateIso,
      status,
      checkedCellsCount: totalCheckedCells,
      autoWrittenCount,
      discrepancyCount: overwrittenItems.length,
      updatedFromSheetCount,
      savedToDatabase,
      databaseNote: persistenceNote,
      performedBy,
      summary,
      autoWrittenSamples: autoWrittenSamples.slice(0, 80),
      discrepancies: overwrittenItems.slice(0, 250)
    };

    storageService.addSyncHistoryEntry(entry);

    if (updatedFromSheetCount > 0) {
      storageService.sendNotification({
        recipient: 'Quản trị & Tổ Thống kê CLS',
        targetAddress: 'In-App / Lịch sử đồng bộ',
        title: `Đã đồng bộ & ghi đè ${updatedFromSheetCount} dịch vụ khớp Google Sheet (3 ngày gần nhất)`,
        content: summary,
        channel: 'In-App',
        status: 'Đã gửi'
      });
    }

    return {
      ran: true,
      reason: processedSlices === 0 ? 'sheet_unreachable' : undefined,
      entry,
      autoWrittenCount,
      updatedFromSheetCount,
      overwrittenItems,
      alertDiscrepancies: []
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errEntry: SyncHistoryEntry = {
      id: `SYNC-ERR-${Date.now()}`,
      timestamp: now.toISOString(),
      displayTime,
      trigger,
      dateRangeLabel: window3d.dateRangeLabel,
      startDate: window3d.startDateIso,
      endDate: window3d.endDateIso,
      status: 'error',
      checkedCellsCount: totalCheckedCells,
      autoWrittenCount,
      discrepancyCount: overwrittenItems.length,
      updatedFromSheetCount,
      savedToDatabase: false,
      databaseNote: errMsg,
      performedBy,
      summary: `Lỗi khi rà soát tự động 3 ngày gần nhất (${window3d.dateRangeLabel}): ${errMsg}`
    };
    storageService.addSyncHistoryEntry(errEntry);

    return {
      ran: true,
      reason: 'sheet_unreachable',
      entry: errEntry,
      autoWrittenCount,
      updatedFromSheetCount,
      overwrittenItems,
      alertDiscrepancies: []
    };
  }
}
