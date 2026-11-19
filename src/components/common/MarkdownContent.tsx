import React from 'react';
import { ExternalLink } from 'lucide-react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

type ColumnAlign = 'left' | 'center' | 'right';

const TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/;
const HR_RE = /^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/;

function splitMarkdownTableRow(rawLine: string): string[] {
  let line = rawLine.trim();
  if (line.startsWith('|')) line = line.slice(1);
  if (line.endsWith('|') && !line.endsWith('\\|')) line = line.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isPotentialTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('```')) return false;
  if (HR_RE.test(trimmed)) return false;
  // Must contain an unescaped pipe and at least 2 cells
  const hasPipe = /(^|[^\\])\|/.test(trimmed);
  if (!hasPipe) return false;
  return splitMarkdownTableRow(trimmed).length >= 2;
}

function parseAlignments(separatorLine: string, colCount: number): ColumnAlign[] {
  const rawCells = splitMarkdownTableRow(separatorLine);
  const aligns: ColumnAlign[] = [];
  for (let i = 0; i < colCount; i++) {
    const token = (rawCells[i] || '').trim();
    const startsColon = token.startsWith(':');
    const endsColon = token.endsWith(':');
    if (startsColon && endsColon) {
      aligns.push('center');
    } else if (endsColon) {
      aligns.push('right');
    } else {
      aligns.push('left');
    }
  }
  return aligns;
}

function alignClass(align: ColumnAlign): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function renderInlineSegment(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Matches: **bold**, *italic*, `code`, or [label](https://url)
  const pattern = /(\*\*[^*\n]+\*\*|\*(?!\s)[^*\n]+(?<!\s)\*|`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const raw = match[0];
    if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push(
        <strong key={`${keyPrefix}-b-${keyIdx++}`} className="font-bold text-slate-900 dark:text-white">
          {raw.slice(2, -2)}
        </strong>
      );
    } else if (raw.startsWith('*') && raw.endsWith('*') && raw.length > 2) {
      tokens.push(
        <em key={`${keyPrefix}-i-${keyIdx++}`} className="italic">
          {raw.slice(1, -1)}
        </em>
      );
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push(
        <code
          key={`${keyPrefix}-c-${keyIdx++}`}
          className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 font-mono text-[11px] text-slate-800 dark:text-slate-100"
        >
          {raw.slice(1, -1)}
        </code>
      );
    } else {
      const linkMatch = raw.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) {
        tokens.push(
          <a
            key={`${keyPrefix}-l-${keyIdx++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-blue-400 text-blue-600 dark:text-blue-400 hover:text-blue-700 font-semibold inline-flex items-center gap-0.5"
          >
            <span>{linkMatch[1]}</span>
            <ExternalLink className="w-3 h-3 inline shrink-0" />
          </a>
        );
      } else {
        tokens.push(raw);
      }
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

function renderCellContent(cellText: string, keyPrefix: string): React.ReactNode {
  const parts = String(cellText || '').split(/<br\s*\/?>/i);
  if (parts.length === 1) {
    return renderInlineSegment(parts[0], keyPrefix);
  }
  return parts.map((part, pIdx) => (
    <React.Fragment key={`${keyPrefix}-br-${pIdx}`}>
      {pIdx > 0 && <br />}
      {renderInlineSegment(part, `${keyPrefix}-p-${pIdx}`)}
    </React.Fragment>
  ));
}

function isSummaryRow(firstCell: string): boolean {
  const plain = firstCell.replace(/\*+/g, '').trim().toLowerCase();
  return /^(tổng(\s+cộng|\s+số|\s+hợp)?|total|cộng)\b/.test(plain);
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Blank line
    if (!trimmed) {
      blocks.push(<div key={`sp-${i}`} className="h-1" />);
      i += 1;
      continue;
    }

    // 2. Fenced code block ```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      const startIdx = i;
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing ```
      blocks.push(
        <pre
          key={`code-${startIdx}`}
          className="my-2 p-3 rounded-xl bg-slate-900 text-slate-100 border border-slate-700 font-mono text-[11px] overflow-x-auto leading-relaxed"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // 3. Markdown Table (header row + separator row + 0..N data rows)
    if (
      i + 1 < lines.length &&
      isPotentialTableRow(line) &&
      TABLE_SEPARATOR_RE.test(lines[i + 1].trim())
    ) {
      const startIdx = i;
      const headers = splitMarkdownTableRow(line);
      const alignments = parseAlignments(lines[i + 1].trim(), headers.length);
      i += 2;

      const rows: string[][] = [];
      while (i < lines.length && isPotentialTableRow(lines[i]) && !TABLE_SEPARATOR_RE.test(lines[i].trim())) {
        const rawCells = splitMarkdownTableRow(lines[i]);
        const normalizedCells: string[] = [];
        for (let c = 0; c < headers.length; c++) {
          normalizedCells.push(rawCells[c] ?? '');
        }
        rows.push(normalizedCells);
        i += 1;
      }

      blocks.push(
        <div
          key={`tbl-${startIdx}`}
          className="my-2.5 w-full overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xs"
        >
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/95">
                {headers.map((header, hIdx) => (
                  <th
                    key={`th-${startIdx}-${hIdx}`}
                    className={`px-3 py-2 font-bold text-slate-800 dark:text-slate-100 border-b-2 border-r last:border-r-0 border-slate-300 dark:border-slate-600 align-middle leading-snug ${alignClass(
                      alignments[hIdx] || 'left'
                    )}`}
                  >
                    {renderCellContent(header, `th-${startIdx}-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={headers.length}
                    className="px-3 py-2.5 text-center text-slate-400 italic"
                  >
                    Không có dòng dữ liệu
                  </td>
                </tr>
              ) : (
                rows.map((row, rIdx) => {
                  const summary = isSummaryRow(row[0] || '');
                  return (
                    <tr
                      key={`tr-${startIdx}-${rIdx}`}
                      className={`border-b last:border-b-0 border-slate-200 dark:border-slate-700 transition-colors ${
                        summary
                          ? 'bg-sky-50/75 dark:bg-sky-950/35 font-semibold'
                          : 'odd:bg-white even:bg-slate-50/75 dark:odd:bg-slate-900 dark:even:bg-slate-800/40 hover:bg-blue-50/40 dark:hover:bg-blue-950/25'
                      }`}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={`td-${startIdx}-${rIdx}-${cIdx}`}
                          className={`px-3 py-2 text-slate-700 dark:text-slate-200 border-r last:border-r-0 border-slate-200 dark:border-slate-700 align-top tabular-nums leading-snug ${alignClass(
                            alignments[cIdx] || 'left'
                          )}`}
                        >
                          {renderCellContent(cell, `td-${startIdx}-${rIdx}-${cIdx}`)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 4. Horizontal Rule (--- / *** / ___)
    if (HR_RE.test(trimmed)) {
      blocks.push(<hr key={`hr-${i}`} className="my-2.5 border-slate-200 dark:border-slate-700" />);
      i += 1;
      continue;
    }

    // 5. Headings (# / ## / ### / ####)
    if (/^#{1,4}\s+/.test(trimmed)) {
      const headingText = trimmed.replace(/^#{1,4}\s+/, '');
      blocks.push(
        <h4
          key={`h-${i}`}
          className="text-[13px] sm:text-sm font-extrabold text-slate-900 dark:text-white pt-1.5"
        >
          {renderInlineSegment(headingText, `h-${i}`)}
        </h4>
      );
      i += 1;
      continue;
    }

    // 6. Blockquote (> ...)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      const startIdx = i;
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`bq-${startIdx}`}
          className="my-1.5 pl-3 py-1 border-l-3 border-blue-400 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 rounded-r-lg text-slate-700 dark:text-slate-300 space-y-1"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={`bqp-${startIdx}-${qIdx}`}>{renderInlineSegment(ql, `bq-${startIdx}-${qIdx}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 7. Bullet list (* / - / •) with nesting indent support
    const bulletMatch = line.match(/^(\s*)(\*|-|•)\s+(.*)$/);
    if (bulletMatch) {
      const indentSpaces = bulletMatch[1].length;
      const paddingLeftClass = indentSpaces >= 4 ? 'pl-8' : indentSpaces >= 2 ? 'pl-5' : 'pl-1';
      blocks.push(
        <div key={`ul-${i}`} className={`flex items-start gap-2 ${paddingLeftClass}`}>
          <span className="text-blue-500 font-bold mt-0.5 shrink-0">•</span>
          <span className="flex-1 min-w-0">{renderInlineSegment(bulletMatch[3], `ul-${i}`)}</span>
        </div>
      );
      i += 1;
      continue;
    }

    // 8. Ordered list (1. / 2. ...)
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const indentSpaces = orderedMatch[1].length;
      const paddingLeftClass = indentSpaces >= 4 ? 'pl-8' : indentSpaces >= 2 ? 'pl-5' : 'pl-1';
      blocks.push(
        <div key={`ol-${i}`} className={`flex items-start gap-2 ${paddingLeftClass}`}>
          <span className="text-blue-600 dark:text-blue-400 font-bold tabular-nums shrink-0">
            {orderedMatch[2]}.
          </span>
          <span className="flex-1 min-w-0">{renderInlineSegment(orderedMatch[3], `ol-${i}`)}</span>
        </div>
      );
      i += 1;
      continue;
    }

    // 9. Standard paragraph line
    blocks.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {renderInlineSegment(line, `p-${i}`)}
      </p>
    );
    i += 1;
  }

  return (
    <div className={`space-y-1.5 text-xs sm:text-[13px] leading-relaxed font-medium ${className}`}>
      {blocks}
    </div>
  );
};
