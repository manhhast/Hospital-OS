import * as XLSX from 'xlsx';
import type { ArchivedCaseReportItem } from '../services/reportArchiveService';

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
  if (!/[\p{L}]/u.test(clean)) return false;
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
