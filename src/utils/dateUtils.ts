/**
 * Utilities for formatting dates and times in Vietnamese format (DD/MM/YYYY)
 * aligned with Vietnam timezone (Asia/Ho_Chi_Minh - GMT+7).
 */

const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Formats any date string, ISO string, timestamp or Date object to DD/MM/YYYY.
 * If input is already in DD/MM/YYYY format, it returns as is.
 * Handles 'YYYY-MM-DD', 'YYYY/MM/DD', ISO 8601 strings safely.
 */
export function formatDateVN(dateInput?: string | number | Date | null, fallback = '—'): string {
  if (!dateInput) return fallback;
  
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return fallback;
    
    // Check if already in DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      const parts = trimmed.split('/');
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${d}/${m}/${y}`;
    }

    // Check if in YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
  }

  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return typeof dateInput === 'string' ? dateInput : fallback;
    }
    
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: VIETNAM_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    return formatter.format(d);
  } catch (e) {
    return typeof dateInput === 'string' ? dateInput : fallback;
  }
}

/**
 * Formats any date string or Date object to DD/MM/YYYY HH:mm in Vietnam timezone.
 */
export function formatDateTimeVN(dateInput?: string | number | Date | null, fallback = '—'): string {
  if (!dateInput) return fallback;
  
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return typeof dateInput === 'string' ? dateInput : fallback;
    }

    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: VIETNAM_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return formatter.format(d);
  } catch (e) {
    return typeof dateInput === 'string' ? dateInput : fallback;
  }
}

/**
 * Returns current date in Vietnam timezone as YYYY-MM-DD (suitable for HTML <input type="date" />)
 */
export function getTodayISODateVN(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

/**
 * Returns current timestamp formatted in Vietnam timezone (HH:mm DD/MM/YYYY)
 */
export function getNowVNString(): string {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  return `${timeFormatter.format(now)} ${dateFormatter.format(now)}`;
}

/**
 * Checks if a given date string (YYYY-MM-DD or DD/MM/YYYY or ISO) is before today in Vietnam timezone.
 */
export function isDatePastVN(dateInput?: string | null): boolean {
  if (!dateInput) return false;
  
  let targetDate: Date;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // If DD/MM/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmyMatch) {
      targetDate = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]), 23, 59, 59);
    } else {
      const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (ymdMatch) {
        targetDate = new Date(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3]), 23, 59, 59);
      } else {
        targetDate = new Date(trimmed);
      }
    }
  } else {
    targetDate = new Date(dateInput);
  }

  if (isNaN(targetDate.getTime())) return false;

  // Compare with current midnight in VN
  const todayVNStr = getTodayISODateVN(); // "YYYY-MM-DD"
  const [y, m, d] = todayVNStr.split('-').map(Number);
  const todayStartVN = new Date(y, m - 1, d, 0, 0, 0);

  return targetDate.getTime() < todayStartVN.getTime();
}

/**
 * Converts any date format (DD/MM/YYYY, ISO, timestamp) to YYYY-MM-DD for HTML <input type="date" />.
 */
export function toInputDateFormat(dateInput?: string | null): string {
  if (!dateInput) return '';
  const trimmed = dateInput.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  if (trimmed.includes('T')) {
    return trimmed.split('T')[0];
  }

  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // ignore
  }

  return '';
}

/**
 * Normalizes Vietnamese phone numbers:
 * - Drops unwanted spaces, dots, dashes
 * - Converts +84 or 84 to 0
 * - If 9 digits (when Excel drops the leading 0, e.g. 987218099), prepends 0 to make it 10 digits
 * - Preserves valid 10-digit number e.g. 0987218099
 */
export function normalizeVietnamesePhone(raw: any): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).trim();
  if (!str) return '';

  // Remove spaces, dots, dashes, parentheses
  str = str.replace(/[\s.\-()]/g, '');

  // If starts with +84, replace with 0
  if (str.startsWith('+84')) {
    str = '0' + str.slice(3);
  } else if (str.startsWith('84') && (str.length === 11 || str.length === 12)) {
    str = '0' + str.slice(2);
  }

  // Extract numeric digits
  const digits = str.replace(/\D/g, '');

  // If 9 digits (Excel dropped leading 0)
  if (digits.length === 9) {
    return '0' + digits;
  }

  // If 10 digits starting with 0
  if (digits.length === 10 && digits.startsWith('0')) {
    return digits;
  }

  return digits || str;
}
