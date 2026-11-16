import * as XLSX from 'xlsx';
import {
  getReportSheetConfigForYear,
  REPORT_ARCHIVE_UPDATED_EVENT,
  reportArchiveService,
  type ArchivedCaseReportItem,
  type RangeAuditDiscrepancy
} from './reportArchiveService';
import { firebaseSyncService } from './firebaseSyncService';
import { storageService } from './storageService';
import type {
  SyncHistoryAutoWrittenItem,
  SyncHistoryDiscrepancyItem,
  SyncHistoryEntry
} from '../types/hospital';

export function getMonthNumber(monthStr: string): number {
  const match = String(monthStr || '').match(/(\d{1,2})/);
  const num = match ? parseInt(match[1], 10) : 0;
  return num >= 1 && num <= 12 ? num : 1;
}

export function getDaysInMonth(monthStr: string, year: number): number {
  const mNum = getMonthNumber(monthStr);
  if (mNum === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  if (mNum === 4 || mNum === 6 || mNum === 9 || mNum === 11) {
    return 30;
  }
  return 31;
}

export function resolveSpreadsheetId(urlOrId?: string): string | null {
  const raw = String(urlOrId || '').trim();
  if (!raw) return null;
  const urlMatch = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) return raw;
  return null;
}

export function isValidServiceName(rawName: string): boolean {
  if (!rawName || typeof rawName !== 'string') return false;
  const clean = rawName.trim();
  if (clean.length < 2) return false;
  if (/^\d+$/.test(clean)) return false;
  const u = clean.toUpperCase();
  if (
    u.startsWith('THÁNG') ||
    u.startsWith('THANG') ||
    u.startsWith('TÊN KỸ') ||
    u.startsWith('KỸ THUẬT') ||
    u.startsWith('DỊCH VỤ') ||
    u.startsWith('STT') ||
    u.startsWith('TỔNG') ||
    u.startsWith('CỘNG') ||
    u.startsWith('BÁO CÁO') ||
    u.startsWith('GHI CHÚ') ||
    u.startsWith('NGÀY')
  ) {
    return false;
  }
  if (
    u === 'BH' ||
    u === 'ND' ||
    u === 'TỔNG CỘNG' ||
    u === 'BÁO CÁO TỔNG HỢP' ||
    u === 'MÃ DỊCH VỤ' ||
    u === 'LOẠI'
  ) {
    return false;
  }
  return true;
}

export function getCandidateTabNames(monthKey: string, year: number): string[] {
  const mNum = getMonthNumber(monthKey);
  const pad2 = String(mNum).padStart(2, '0');
  const rawCandidates = [
    monthKey,
    `Tháng ${mNum}/${year}`,
    `Tháng ${mNum}-${year}`,
    `Tháng ${mNum} ${year}`,
    `Tháng ${mNum} năm ${year}`,
    `T${mNum}`,
    `T${mNum}/${year}`,
    `T${mNum}-${year}`,
    `${mNum}/${year}`,
    `${mNum}-${year}`,
    `Thang ${mNum}`,
    `Thang ${mNum}/${year}`,
    ...(mNum < 10
      ? [
          `Tháng ${pad2}`,
          `Tháng ${pad2}/${year}`,
          `Tháng ${pad2}-${year}`,
          `T${pad2}`,
          `T${pad2}/${year}`,
          `${pad2}/${year}`,
          `${pad2}-${year}`
        ]
      : [])
  ];
  return Array.from(new Set(rawCandidates));
}

export function detectMonthInSheetCsv(csvText: string): number | null {
  const headerSample = csvText.split(/\r?\n/).slice(0, 12).join(' ');
  const thangMatch = headerSample.match(/\b(?:tháng|thang)\s*0?(\d{1,2})\b/i);
  if (thangMatch) {
    const num = parseInt(thangMatch[1], 10);
    if (num >= 1 && num <= 12) return num;
  }
  const monthYearMatch = headerSample.match(/\b0?(\d{1,2})\s*[\/\-]\s*(?:19|20|21)\d{2}\b/);
  if (monthYearMatch) {
    const num = parseInt(monthYearMatch[1], 10);
    if (num >= 1 && num <= 12) return num;
  }
  const shortTMatch = headerSample.match(/\bT0?(\d{1,2})\b/);
  if (shortTMatch) {
    const num = parseInt(shortTMatch[1], 10);
    if (num >= 1 && num <= 12) return num;
  }
  return null;
}

export function parseGoogleSheetRowsToCaseReports(rows: any[][]): ArchivedCaseReportItem[] {
  const items: ArchivedCaseReportItem[] = [];
  let currentCategory = 'Siêu Âm';

  const dayMap: { [day: number]: { bhCol: number; ndCol: number } } = {};
  let foundHeaderRow = false;

  const extractDayNumber = (rawCell: string): number | null => {
    const val = rawCell.trim();
    if (!val) return null;
    const simpleMatch = val.match(/^(?:ngày|ngay|ng|n)?\s*0?(\d{1,2})$/i);
    if (simpleMatch) {
      const d = parseInt(simpleMatch[1], 10);
      if (d >= 1 && d <= 31) return d;
    }
    const dateMatch = val.match(/^0?(\d{1,2})\s*[\/\-]\s*0?\d{1,2}(?:\s*[\/\-]\s*\d{2,4})?$/);
    if (dateMatch) {
      const d = parseInt(dateMatch[1], 10);
      if (d >= 1 && d <= 31) return d;
    }
    return null;
  };

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r];
    if (!row) continue;

    const daysInRow: { day: number; col: number }[] = [];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim();
      const dayNum = extractDayNumber(val);
      if (dayNum !== null) {
        const contextStr = row.slice(Math.max(0, c - 1), c + 2).join(' ').toLowerCase();
        if (
          !contextStr.includes('tổng') &&
          !contextStr.includes('total') &&
          !contextStr.includes('tb') &&
          !contextStr.includes('tháng')
        ) {
          daysInRow.push({ day: dayNum, col: c });
        }
      }
    }

    if (daysInRow.length >= 3) {
      foundHeaderRow = true;
      const subHeaderRow = rows[r + 1] || [];
      for (let idx = 0; idx < daysInRow.length; idx++) {
        const item = daysInRow[idx];
        const nextItem = daysInRow[idx + 1];
        const isSingleColPerDay = nextItem && nextItem.col === item.col + 1;
        const nextSubCell = String(subHeaderRow[item.col + 1] || '').trim().toUpperCase();
        const hasExplicitNdCol =
          !isSingleColPerDay &&
          (nextSubCell === 'ND' || !nextItem || nextItem.col >= item.col + 2);
        dayMap[item.day] = {
          bhCol: item.col,
          ndCol: hasExplicitNdCol ? item.col + 1 : -1
        };
      }
      break;
    }
  }

  if (!foundHeaderRow || Object.keys(dayMap).length === 0) {
    for (let d = 1; d <= 31; d++) {
      dayMap[d] = { bhCol: 2 + (d - 1) * 2, ndCol: 3 + (d - 1) * 2 };
    }
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const col0 = String(row[0] || '').trim();
    const col1 = String(row[1] || '').trim();
    const col2 = String(row[2] || '').trim();
    const combinedText = `${col0} ${col1} ${col2}`.toLowerCase();

    if (combinedText.includes('siêu âm') && !combinedText.includes('tổng số')) currentCategory = 'Siêu Âm';
    else if (combinedText.includes('nội soi') && !combinedText.includes('tổng số')) currentCategory = 'Nội Soi';
    else if (
      (combinedText.includes('điện tim') ||
        combinedText.includes('lhn') ||
        combinedText.includes('lưu huyết não')) &&
      !combinedText.includes('tổng số')
    )
      currentCategory = 'Điện tim & LHN';
    else if (combinedText.includes('x quang') && !combinedText.includes('tổng số')) currentCategory = 'X quang';
    else if (combinedText.includes('msct') || combinedText.includes('ct scanner')) currentCategory = 'MSCT';
    else if (combinedText.includes('mri') || combinedText.includes('cộng hưởng từ')) currentCategory = 'MRI';
    else if (combinedText.includes('xét nghiệm') && !combinedText.includes('tổng số')) currentCategory = 'Xét nghiệm';

    const rawName =
      col1 ||
      (col0 && !col0.includes('BÁO CÁO') && !col0.includes('Ngày') && !col0.includes('Tổng số')
        ? col0
        : '');
    const name = rawName.trim();

    if (!isValidServiceName(name)) {
      continue;
    }

    let itemCategory = currentCategory;
    const lowerName = name.toLowerCase();
    if (lowerName.includes('điện tim') || lowerName.includes('lưu huyết não')) {
      itemCategory = 'Điện tim & LHN';
    }

    const dailyData: { [day: number]: { bh: number | string; nd: number | string } } = {};
    const sortedDays = Object.keys(dayMap).map(Number).sort((a, b) => a - b);

    for (const day of sortedDays) {
      const { bhCol, ndCol } = dayMap[day];
      if (bhCol >= row.length && (ndCol < 0 || ndCol >= row.length)) continue;

      const rawBh = bhCol >= 0 && bhCol < row.length ? String(row[bhCol] || '').trim() : '';
      const rawNd = ndCol >= 0 && ndCol < row.length ? String(row[ndCol] || '').trim() : '';

      let bhVal: number | string = 0;
      let ndVal: number | string = 0;

      if (rawBh.toUpperCase() === 'LT') bhVal = 'LT';
      else bhVal = parseInt(rawBh.replace(/[^0-9]/g, ''), 10) || 0;

      if (rawNd.toUpperCase() === 'LT') ndVal = 'LT';
      else ndVal = parseInt(rawNd.replace(/[^0-9]/g, ''), 10) || 0;

      if (bhVal || ndVal) {
        dailyData[day] = { bh: bhVal, nd: ndVal };
      }
    }

    items.push({
      id: `item-${r}-${items.length}-${Math.random().toString(36).slice(2, 7)}`,
      category: itemCategory,
      name,
      dailyData
    });
  }

  return items;
}

export async function fetchRawTabCsv(
  spreadsheetId: string,
  tabName: string
): Promise<string | null> {
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    const response = await fetch(csvUrl, { cache: 'no-store' });
    if (!response.ok) return null;
    const csvText = await response.text();
    if (!csvText || csvText.includes('<!DOCTYPE html>')) return null;
    return csvText;
  } catch {
    return null;
  }
}

export function parseCsvTextToItems(csvText: string): ArchivedCaseReportItem[] {
  const workbook = XLSX.read(csvText, { type: 'string' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (rows && rows.length > 0) {
    return parseGoogleSheetRowsToCaseReports(rows);
  }
  return [];
}

export async function fetchSingleSheetTab(
  targetUrl: string,
  targetTab: string,
  probeCsv?: string | null,
  targetYear: number = 2026
): Promise<ArchivedCaseReportItem[] | null> {
  try {
    const spreadsheetId = resolveSpreadsheetId(targetUrl);
    if (!spreadsheetId) return null;

    const resolvedProbeCsv =
      probeCsv !== undefined
        ? probeCsv
        : await fetchRawTabCsv(spreadsheetId, '__cls_probe_nonexistent__');
    const normalizedProbe = resolvedProbeCsv ? resolvedProbeCsv.trim() : '';
    const probeDetectedMonth = resolvedProbeCsv
      ? detectMonthInSheetCsv(resolvedProbeCsv)
      : null;

    const targetMonthNum = targetTab.startsWith('Tháng') ? getMonthNumber(targetTab) : null;
    const candidates = targetTab.startsWith('Tháng')
      ? getCandidateTabNames(targetTab, targetYear)
      : [targetTab];

    for (const candidateTab of candidates) {
      const csvText = await fetchRawTabCsv(spreadsheetId, candidateTab);
      if (!csvText) continue;

      const isSameAsProbe = normalizedProbe !== '' && csvText.trim() === normalizedProbe;

      if (isSameAsProbe && targetMonthNum !== null) {
        if (probeDetectedMonth !== targetMonthNum) {
          continue;
        }
      }

      const parsed = parseCsvTextToItems(csvText);
      if (parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`Error fetching tab ${targetTab}:`, e);
  }
  return null;
}

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
 * - Rule 1: If Firebase/system is empty for a service day & Google Sheet has data -> auto-writes to Firebase.
 * - Rule 2: If Firebase has data & Google Sheet is empty/missing OR both have differing values -> DO NOT overwrite;
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
  let firebaseSavedMonths = 0;
  let firebaseFailureNote: string | undefined;

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
            // Firebase has data & Sheet missing OR both differ OR manual lock -> Alert & log, DO NOT overwrite
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
          const fbRes = await firebaseSyncService.forceSaveReportMonthToCloud(
            sliceYear,
            slice.monthKey,
            updatedMonthItems
          );
          if (fbRes.savedOnFirebase) {
            firebaseSavedMonths += 1;
          } else if (!firebaseFailureNote && fbRes.reason) {
            firebaseFailureNote = fbRes.reason;
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

    const fbConnected = firebaseSyncService.getState().status === 'synced';
    const savedOnFirebase =
      autoWrittenCount > 0 ? firebaseSavedMonths > 0 : fbConnected;

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
      summary = `Rà soát 3 ngày gần nhất (${window3d.dateRangeLabel}): đã tự động ghi ${autoWrittenCount} ô mới lên Firebase; phát hiện ${alertDiscrepancies.length} ô sai lệch cần kiểm tra.`;
    } else if (alertDiscrepancies.length > 0) {
      summary = `Rà soát 3 ngày gần nhất (${window3d.dateRangeLabel}): phát hiện ${alertDiscrepancies.length} ô sai lệch giữa Firebase và Google Sheet (đã giữ nguyên dữ liệu để chờ xác nhận).`;
    } else if (autoWrittenCount > 0) {
      summary = `Rà soát 3 ngày gần nhất (${window3d.dateRangeLabel}): đã tự động ghi ${autoWrittenCount} ô từ Google Sheet vào Firebase.`;
    } else {
      summary = `Rà soát 3 ngày gần nhất (${window3d.dateRangeLabel}): đã kiểm tra ${totalCheckedCells} ô, dữ liệu Firebase và Google Sheet hoàn toàn khớp.`;
    }

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
      savedOnFirebase,
      firebaseNote:
        firebaseFailureNote ||
        (savedOnFirebase
          ? 'Đã lưu cố định trên Firebase Cloud Firestore'
          : 'Lưu cục bộ (chưa kết nối Firebase)'),
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
      savedOnFirebase: false,
      firebaseNote: errMsg,
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
