import {
  getReportSheetConfigForYear,
  REPORT_ARCHIVE_UPDATED_EVENT,
  reportArchiveService,
  type ArchivedCaseReportItem,
  type RangeAuditDiscrepancy
} from './reportArchiveService';
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
  alertDiscrepancies: SyncHistoryDiscrepancyItem[];
}

/**
 * 3-Day Smart Sync (runs on startup or via manual 3-day check):
 * - Audits the 3 most recent calendar days BEFORE writing anything.
 * - Rule 1: If System database is empty for a service day & Google Sheet has data -> auto-writes to System/PostgreSQL.
 * - Rule 2: If System has data & Google Sheet is empty/missing OR both have differing values -> DO NOT overwrite;
 *   raise notification/toast and persist full result into Sync History (`buckets/sync_history`).
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
      alertDiscrepancies: []
    };
  }

  let totalCheckedCells = 0;
  let processedSlices = 0;
  let dbSavedMonths = 0;
  let dbFailureNote: string | undefined;

  const autoWrittenSamples: SyncHistoryAutoWrittenItem[] = [];
  let autoWrittenCount = 0;
  const alertDiscrepancies: SyncHistoryDiscrepancyItem[] = [];
  const unreachableTabs: string[] = [];

  try {
    // Group slices by year so we only probe once per spreadsheet
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

        const autoFillItems: RangeAuditDiscrepancy[] = [];
        for (const disc of auditRes.discrepancies) {
          if (
            (disc.type === 'new_from_sheet' || disc.type === 'new_service') &&
            !disc.isManualLocked
          ) {
            autoFillItems.push(disc);
            autoWrittenCount += 1;
            autoWrittenSamples.push({
              dateLabel: disc.dateLabel,
              category: disc.category,
              serviceName: disc.serviceName,
              bh: disc.sheetValue.bh,
              nd: disc.sheetValue.nd
            });
          } else {
            // System has data & Sheet missing OR both differ OR manual lock -> Alert & log, DO NOT overwrite
            alertDiscrepancies.push({
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
              resolutionStatus: 'pending'
            });
          }
        }

        if (autoFillItems.length > 0) {
          const updatedMonthItems = reportArchiveService.applyAuditDiscrepanciesForMonth(
            sliceYear,
            slice.monthKey,
            autoFillItems
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

    const pgState = postgresSyncService.getState();
    const pgConnected = pgState.configured && pgState.authenticated;
    const savedToDatabase =
      autoWrittenCount > 0 ? dbSavedMonths > 0 : pgConnected;

    const status =
      processedSlices === 0
        ? 'error'
        : alertDiscrepancies.length > 0
          ? 'discrepancy_alert'
          : autoWrittenCount > 0
            ? 'success'
            : 'no_change';

    let summary = '';
    if (processedSlices === 0) {
      summary = `Không đọc được tab Google Sheet trong 3 ngày gần nhất (${window3d.dateRangeLabel}): ${unreachableTabs.join(', ')}.`;
    } else if (alertDiscrepancies.length > 0 && autoWrittenCount > 0) {
      summary = `Rà soát 3 ngày gần nhất (${window3d.dateRangeLabel}): đã tự động ghi ${autoWrittenCount} ô mới vào hệ thống; phát hiện ${alertDiscrepancies.length} ô sai lệch cần kiểm tra.`;
    } else if (alertDiscrepancies.length > 0) {
      summary = `Rà soát 3 ngày gần nhất (${window3d.dateRangeLabel}): phát hiện ${alertDiscrepancies.length} ô sai lệch giữa Hệ thống và Google Sheet (đã giữ nguyên dữ liệu để chờ xác nhận).`;
    } else if (autoWrittenCount > 0) {
      summary = `Rà soát 3 ngày gần nhất (${window3d.dateRangeLabel}): đã tự động ghi ${autoWrittenCount} ô từ Google Sheet vào Hệ thống.`;
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
      discrepancyCount: alertDiscrepancies.length,
      updatedFromSheetCount: 0,
      savedToDatabase,
      databaseNote: persistenceNote,
      performedBy,
      summary,
      autoWrittenSamples: autoWrittenSamples.slice(0, 40),
      discrepancies: alertDiscrepancies.slice(0, 80)
    };

    storageService.addSyncHistoryEntry(entry);

    if (alertDiscrepancies.length > 0) {
      storageService.sendNotification({
        recipient: 'Quản trị & Tổ Thống kê CLS',
        targetAddress: 'In-App / Lịch sử đồng bộ',
        title: `Cảnh báo sai lệch số liệu 3 ngày gần nhất (${alertDiscrepancies.length} mục)`,
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
      alertDiscrepancies
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
      discrepancyCount: alertDiscrepancies.length,
      updatedFromSheetCount: 0,
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
      alertDiscrepancies
    };
  }
}
