import writeXlsxFile, { type Cell, type Row } from 'write-excel-file/browser';
import { readSheet } from 'read-excel-file/browser';
import { csvTextToObjects } from './csvParser';

export function sanitizeExcelSheetName(name: string): string {
  const cleaned = String(name || 'Sheet1')
    .replace(/[:\\/?*\[\]]/g, '-')
    .trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

function toWriteCell(raw: unknown, options?: { isHeader?: boolean; forceText?: boolean }): Cell {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  const baseStyle = options?.isHeader ? { fontWeight: 'bold' as const } : {};

  if (options?.forceText) {
    return {
      value: String(raw),
      type: String,
      format: '@',
      ...baseStyle,
    };
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return {
      value: raw,
      type: Number,
      ...baseStyle,
    };
  }

  if (typeof raw === 'boolean') {
    return {
      value: raw,
      type: Boolean,
      ...baseStyle,
    };
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return {
      value: raw,
      type: Date,
      format: 'dd/mm/yyyy',
      ...baseStyle,
    };
  }

  return {
    value: String(raw),
    type: String,
    ...baseStyle,
  };
}

export async function exportObjectsToXlsxFile(
  rows: Record<string, unknown>[],
  options: {
    fileName: string;
    sheetName: string;
  }
): Promise<void> {
  const safeSheet = sanitizeExcelSheetName(options.sheetName);

  const headerSet = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((k) => headerSet.add(k));
  }
  const headers = Array.from(headerSet);

  if (headers.length === 0) {
    const emptySheet: Row[] = [[{ value: 'Không có dữ liệu', type: String }]];
    await writeXlsxFile(emptySheet, { sheet: safeSheet }).toFile(options.fileName);
    return;
  }

  const headerRow: Row = headers.map((h) => toWriteCell(h, { isHeader: true }));
  const dataRows: Row[] = rows.map((row) => headers.map((h) => toWriteCell(row[h])));

  const columns = headers.map((header) => {
    let maxLen = header.length + 3;
    for (const r of rows) {
      const len = String(r[header] ?? '').length;
      if (len + 2 > maxLen) maxLen = len + 2;
    }
    return { width: Math.min(Math.max(maxLen, 12), 45) };
  });

  await writeXlsxFile([headerRow, ...dataRows], {
    sheet: safeSheet,
    columns,
  }).toFile(options.fileName);
}

export async function exportMatrixToXlsxFile(
  matrix: unknown[][],
  options: {
    fileName: string;
    sheetName: string;
    columnWidths?: number[];
    textColumns?: number[];
    boldFirstRow?: boolean;
  }
): Promise<void> {
  const safeSheet = sanitizeExcelSheetName(options.sheetName);
  const textColSet = new Set(options.textColumns || []);
  const boldFirst = options.boldFirstRow !== false;

  const sheetData: Row[] = matrix.map((row, rowIdx) =>
    row.map((cellVal, colIdx) =>
      toWriteCell(cellVal, {
        isHeader: boldFirst && rowIdx === 0,
        forceText: textColSet.has(colIdx) && (rowIdx > 0 || textColSet.has(colIdx)),
      })
    )
  );

  const columns = options.columnWidths?.map((width) => ({ width }));

  await writeXlsxFile(sheetData, {
    sheet: safeSheet,
    ...(columns ? { columns } : {}),
  }).toFile(options.fileName);
}

export async function readSpreadsheetFileToObjects(
  file: File
): Promise<Record<string, unknown>[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    const csvText = await file.text();
    return csvTextToObjects(csvText);
  }

  if (lowerName.endsWith('.xls') && !lowerName.endsWith('.xlsx')) {
    throw new Error(
      'Định dạng .xls cũ không còn được hỗ trợ vì lý do bảo mật; vui lòng lưu lại tệp dưới dạng .xlsx hoặc .csv và thử lại.'
    );
  }

  if (!lowerName.endsWith('.xlsx')) {
    throw new Error('Vui lòng chọn tệp định dạng .xlsx hoặc .csv.');
  }

  const rows = await readSheet(file);
  if (!rows || rows.length < 2) {
    return [];
  }

  const rawHeaders = rows[0] || [];
  const headers = rawHeaders.map((cell, idx) => {
    const label = cell === null || cell === undefined ? '' : String(cell).trim();
    return label || `Column_${idx + 1}`;
  });

  const result: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const hasContent = row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasContent) continue;

    const record: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const val = c < row.length ? row[c] : '';
      record[headers[c]] = val === null || val === undefined ? '' : val;
    }
    result.push(record);
  }

  return result;
}
