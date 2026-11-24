/**
 * Zero-dependency RFC-4180 compliant CSV parser.
 * Replaces SheetJS/xlsx CSV parsing to eliminate prototype pollution and ReDoS exposure.
 */
export function parseCsvRows(csvText: string): string[][] {
  if (!csvText || typeof csvText !== 'string') return [];

  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"' && currentField.length === 0) {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r') {
      if (i + 1 < text.length && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (inQuotes || currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.every((cell) => cell === '')) {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

export function csvTextToObjects(csvText: string): Record<string, string>[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h, idx) => {
    const trimmed = h.trim();
    return trimmed || `Column_${idx + 1}`;
  });

  const objects: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((cell) => cell.trim() === '')) continue;

    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = row[c] !== undefined ? row[c] : '';
    }
    objects.push(record);
  }
  return objects;
}
