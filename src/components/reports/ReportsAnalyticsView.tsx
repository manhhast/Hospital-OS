import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, TrendingUp, PieChart, Calendar, FileSpreadsheet, Download, 
  CheckCircle2, Wrench, Activity, Users, FileText, ArrowUpRight, ArrowDownRight, Search,
  RefreshCw, Link, Edit3, Table, Layers, Sparkles, Filter, Check, Save, Upload, Plus, ChevronLeft, ChevronRight,
  Pin, Star, Bookmark, AlertTriangle, AlertCircle, Eye, EyeOff, SlidersHorizontal, Copy, Send, Printer, X, Lock, Database,
  Cloud, RotateCcw, History
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart as RePieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { storageService } from '../../services/storageService';
import * as XLSX from 'xlsx';
import { PinnedIndicatorsPanel } from './PinnedIndicatorsPanel';
import { ContextualBenchmarkingModal } from './ContextualBenchmarkingModal';
import { FastPinManagerModal } from './FastPinManagerModal';
import { SyncHistoryView } from './SyncHistoryView';
import { 
  getPinnedServiceNames, savePinnedServiceNames, calculateClinicalTriage, 
  ClinicalTriageResult, DEFAULT_PINNED_SERVICE_NAMES 
} from '../../utils/clinicalAnalytics';
import { scanEquipmentExpirations, scanTaskReminders } from '../../utils/operationalAlerts';
import {
  DEFAULT_REPORT_YEAR,
  getKnownReportYears,
  getReportSheetConfigForYear,
  isValidReportYear,
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
  RangeAuditDiscrepancy,
  REPORT_ARCHIVE_UPDATED_EVENT,
  reportArchiveService,
  REPORT_MONTHS
} from '../../services/reportArchiveService';
import {
  fetchRawTabCsv,
  fetchSingleSheetTab,
  getDaysInMonth,
  getMonthNumber,
  getRecentThreeDaysWindow,
  isValidServiceName,
  resolveSpreadsheetId,
  runThreeDaySmartSync
} from '../../services/googleSheetReportService';
import { postgresSyncService, type PostgresSyncState } from '../../services/postgresSyncService';
import type { SyncHistoryDiscrepancyItem, SyncHistoryEntry } from '../../types/hospital';

interface ReportsAnalyticsViewProps {
  pendingAuditRequest?: {
    startDate?: string;
    endDate?: string;
    year?: number;
    nonce: number;
  } | null;
  onClearPendingAuditRequest?: () => void;
  onShowToast?: (
    title: string,
    message: string,
    type?: 'success' | 'error' | 'warning' | 'info'
  ) => void;
}

// Data model for daily case report row matching the Google Sheet screenshot
export interface CaseReportItem {
  id: string;
  category: string; // 'Siêu Âm' | 'Nội Soi' | 'X quang' | 'Điện tim & LHN' | 'MSCT' | 'MRI' | 'Xét nghiệm'
  name: string;
  dailyData: {
    [day: number]: { bh: number | string; nd: number | string }; // Day 1 to 31: BH (Bảo hiểm), ND (Nhân dân)
  };
  manualDays?: {
    [day: number]: { updatedAt: string; updatedBy: string };
  };
  lastSyncedAt?: string;
}

// Helper to compute date range for Week 1..52 in a given year (e.g. 2026)
const getWeekDateRange = (weekNum: number, year: number = DEFAULT_REPORT_YEAR) => {
  const w = Math.max(1, Math.min(52, weekNum));
  const startDayOfYear = (w - 1) * 7 + 1;
  const endDayOfYear = w === 52 ? 365 : w * 7;

  const startDate = new Date(year, 0, startDayOfYear);
  const endDate = new Date(year, 0, endDayOfYear);

  const startMonthNum = startDate.getMonth() + 1;
  const startDayNum = startDate.getDate();
  const endMonthNum = endDate.getMonth() + 1;
  const endDayNum = endDate.getDate();

  const startMonthStr = `Tháng ${startMonthNum}`;
  const endMonthStr = `Tháng ${endMonthNum}`;

  const pad = (n: number) => n.toString().padStart(2, '0');

  let dateRangeLabel = '';
  if (startMonthNum === endMonthNum) {
    dateRangeLabel = `Ngày ${pad(startDayNum)} - ${pad(endDayNum)} / ${startMonthStr}`;
  } else {
    dateRangeLabel = `Ngày ${pad(startDayNum)}/${startMonthNum} - ${pad(endDayNum)}/${endMonthNum}`;
  }

  return {
    weekNum: w,
    startDate,
    endDate,
    startMonthNum,
    startDayNum,
    startMonthStr,
    endMonthNum,
    endDayNum,
    endMonthStr,
    dateRangeLabel,
    name: `Tuần ${w} (${dateRangeLabel})`
  };
};

// Helper to calculate week number for any date in year
const getWeekNumberForDate = (year: number, monthNum: number, dayNum: number) => {
  const d = new Date(year, monthNum - 1, dayNum);
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return Math.max(1, Math.min(52, weekNum));
};

// Helper to find latest day with valid data in a list of items
const findLatestDayInItems = (items: CaseReportItem[], maxDay: number = 31): number => {
  if (!items || items.length === 0) return maxDay;
  for (let d = maxDay; d >= 1; d--) {
    let hasData = false;
    let totalDayCases = 0;
    for (const item of items) {
      const dayEntry = item.dailyData?.[d];
      if (dayEntry) {
        if (dayEntry.bh === 'LT' || dayEntry.nd === 'LT') {
          hasData = true;
        }
        const bh = typeof dayEntry.bh === 'number' ? dayEntry.bh : (parseInt(String(dayEntry.bh).replace(/[^0-9]/g, ''), 10) || 0);
        const nd = typeof dayEntry.nd === 'number' ? dayEntry.nd : (parseInt(String(dayEntry.nd).replace(/[^0-9]/g, ''), 10) || 0);
        if (bh > 0 || nd > 0) {
          totalDayCases += bh + nd;
        }
      }
    }
    if (totalDayCases > 0 || hasData) {
      return d;
    }
  }
  return 1;
};

const ALL_MONTHS = REPORT_MONTHS;

// Helper to find the latest month and day that has valid data across all stored months
const findLatestDataDate = (
  store: { [monthKey: string]: CaseReportItem[] },
  fallbackItems?: CaseReportItem[],
  year: number = DEFAULT_REPORT_YEAR
): { month: string; day: number; week: number } => {
  const monthKeys = [...ALL_MONTHS].reverse();

  for (const m of monthKeys) {
    const items = store[m];
    if (items && items.length > 0) {
      const mNum = getMonthNumber(m);
      const maxDays = getDaysInMonth(m, year);

      for (let d = maxDays; d >= 1; d--) {
        let hasData = false;
        let totalDayCases = 0;
        for (const item of items) {
          const dayEntry = item.dailyData?.[d];
          if (dayEntry) {
            if (dayEntry.bh === 'LT' || dayEntry.nd === 'LT') {
              hasData = true;
            }
            const bh = typeof dayEntry.bh === 'number' ? dayEntry.bh : (parseInt(String(dayEntry.bh).replace(/[^0-9]/g, ''), 10) || 0);
            const nd = typeof dayEntry.nd === 'number' ? dayEntry.nd : (parseInt(String(dayEntry.nd).replace(/[^0-9]/g, ''), 10) || 0);
            if (bh > 0 || nd > 0) {
              totalDayCases += bh + nd;
            }
          }
        }
        if (totalDayCases > 0 || hasData) {
          const weekNum = getWeekNumberForDate(year, mNum, d);
          return { month: m, day: d, week: weekNum };
        }
      }
    }
  }

  if (fallbackItems && fallbackItems.length > 0) {
    const latestDay = findLatestDayInItems(fallbackItems, 28);
    const weekNum = getWeekNumberForDate(year, 2, latestDay);
    return { month: 'Tháng 2', day: latestDay, week: weekNum };
  }

  return { month: 'Tháng 2', day: 28, week: 8 };
};

const monthToFirstWeekMap: { [m: string]: number } = {
  'Tháng 1': 1,
  'Tháng 2': 5,
  'Tháng 3': 9,
  'Tháng 4': 14,
  'Tháng 5': 18,
  'Tháng 6': 23,
  'Tháng 7': 27,
  'Tháng 8': 31,
  'Tháng 9': 36,
  'Tháng 10': 40,
  'Tháng 11': 44,
  'Tháng 12': 49
};

export const ReportsAnalyticsView: React.FC<ReportsAnalyticsViewProps> = ({
  pendingAuditRequest,
  onClearPendingAuditRequest,
  onShowToast
}) => {
  const initialSettings = storageService.getSettings();
  const initialYear = initialSettings.reportSheetYear || DEFAULT_REPORT_YEAR;
  const initialStore = reportArchiveService.loadYearArchiveSync(initialYear);
  const initialLatest = findLatestDataDate(initialStore, undefined, initialYear);

  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [yearInputStr, setYearInputStr] = useState<string>(() => String(initialYear));
  const [pgState, setPgState] = useState<PostgresSyncState>(() => postgresSyncService.getState());
  const isPgSynced = pgState.configured && pgState.authenticated && pgState.connected;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'google_sheet' | 'sync_history'>('google_sheet');
  const [timePeriod, setTimePeriod] = useState<string>(`${initialLatest.month}/${initialYear}`);
  const [sheetTab, setSheetTab] = useState<string>('Báo cáo ngày');

  // Smart Report specific state - automatically default to latest day with data
  const [selectedReportMonth, setSelectedReportMonth] = useState<string>(initialLatest.month);
  const [selectedReportDay, setSelectedReportDay] = useState<number>(initialLatest.day);
  const [selectedReportWeek, setSelectedReportWeek] = useState<number>(initialLatest.week);
  const [annualViewMode, setAnnualViewMode] = useState<'full' | 'actual_only'>('full');

  // Multi-month data cache store (scoped to selectedYear and backed by System Archive)
  const [monthlyDataStore, setMonthlyDataStore] = useState<{ [monthKey: string]: CaseReportItem[] }>(initialStore);

  const getEffectiveSheetTarget = (targetYear: number = selectedYear): string => {
    const s = storageService.getSettings();
    return getReportSheetConfigForYear(s, targetYear).url;
  };

  // Google Sheets integration state
  const [sheetUrl, setSheetUrl] = useState<string>(() => getEffectiveSheetTarget(initialYear));

  // Sync sheetUrl when settings or selectedYear change
  useEffect(() => {
    const currentUrl = getEffectiveSheetTarget(selectedYear);
    if (currentUrl !== sheetUrl) {
      setSheetUrl(currentUrl);
    }
  }, [activeTab, selectedYear]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [editingCell, setEditingCell] = useState<{ itemId: string; day: number; type: 'bh' | 'nd' } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Clinical Fast Pinning & Visual Triage Alert states
  const [pinnedServiceNames, setPinnedServiceNames] = useState<string[]>(() => getPinnedServiceNames());
  const [isPinManagerOpen, setIsPinManagerOpen] = useState<boolean>(false);
  const [selectedBenchmarkingItem, setSelectedBenchmarkingItem] = useState<ClinicalTriageResult | null>(null);
  const [showPinnedOnly, setShowPinnedOnly] = useState<boolean>(false);
  const [dailyTriageFilter, setDailyTriageFilter] = useState<'ALL' | 'PINNED' | 'SURGE' | 'DROP'>('ALL');
  const [isDailyEntryOpen, setIsDailyEntryOpen] = useState<boolean>(false);
  const [dailyDraftValues, setDailyDraftValues] = useState<Record<string, { bh: string; nd: string }>>({});
  const [copiedHandover, setCopiedHandover] = useState<boolean>(false);

  // Selective Range Audit & Discrepancy Confirmation Modal State
  const [isResyncModalOpen, setIsResyncModalOpen] = useState<boolean>(false);
  const [resyncYear, setResyncYear] = useState<number>(initialYear);
  const [resyncYearInput, setResyncYearInput] = useState<string>(String(initialYear));
  const [resyncStartDate, setResyncStartDate] = useState<string>(`${initialYear}-01-01`);
  const [resyncEndDate, setResyncEndDate] = useState<string>(`${initialYear}-01-31`);
  const [auditStep, setAuditStep] = useState<'select' | 'checking' | 'result'>('select');
  const [auditDiscrepancies, setAuditDiscrepancies] = useState<RangeAuditDiscrepancy[]>([]);
  const [selectedDiscrepancyIds, setSelectedDiscrepancyIds] = useState<Record<string, boolean>>({});
  const [auditCheckedCells, setAuditCheckedCells] = useState<number>(0);
  const [auditCheckedMonths, setAuditCheckedMonths] = useState<number>(0);
  const [auditMissingTabs, setAuditMissingTabs] = useState<string[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isApplyingAudit, setIsApplyingAudit] = useState<boolean>(false);

  useEffect(() => {
    const unsub = postgresSyncService.subscribe(() => {
      setPgState(postgresSyncService.getState());
    });
    return () => unsub();
  }, []);

  // Toggle Pin for a service
  const handleTogglePinService = (serviceName: string) => {
    setPinnedServiceNames(prev => {
      const isPinned = prev.some(p => p.trim().toLowerCase() === serviceName.trim().toLowerCase());
      const next = isPinned
        ? prev.filter(p => p.trim().toLowerCase() !== serviceName.trim().toLowerCase())
        : [...prev, serviceName];
      savePinnedServiceNames(next);
      setSyncToast(isPinned ? `Đã bỏ ghim "${serviceName}"` : `⭐ Đã ghim "${serviceName}" lên đầu báo cáo`);
      setTimeout(() => setSyncToast(null), 3000);
      return next;
    });
  };

  const handleSavePinnedNames = (newNames: string[]) => {
    setPinnedServiceNames(newNames);
    savePinnedServiceNames(newNames);
    setSyncToast(`⭐ Đã cập nhật danh mục ${newNames.length} chỉ số ghim trọng điểm!`);
    setTimeout(() => setSyncToast(null), 3500);
  };

  // Initial case data loaded from year archive (with Month 2 sample fallback for 2026)
  const [caseReports, setCaseReports] = useState<CaseReportItem[]>(() => {
    const archivedFeb = initialStore['Tháng 2'];
    if (archivedFeb && archivedFeb.length > 0) {
      return archivedFeb;
    }
    if (initialStore[initialLatest.month]?.length) {
      return initialStore[initialLatest.month];
    }
    if (initialYear !== 2026) {
      return [];
    }
    const ltBlock = { bh: 'LT', nd: 'LT' };
    return [
      // Category 1: Siêu Âm
      {
        id: 'sa-1',
        category: 'Siêu Âm',
        name: 'Siêu âm tim',
        dailyData: {
          1: { bh: 1, nd: 1 }, 2: { bh: 19, nd: 3 }, 3: { bh: 20, nd: 1 }, 4: { bh: 14, nd: 2 }, 5: { bh: 15, nd: 1 },
          6: { bh: 4, nd: 2 }, 7: { bh: 14, nd: 2 }, 8: { bh: 1, nd: 0 }, 9: { bh: 5, nd: 1 }, 10: { bh: 13, nd: 0 },
          11: { bh: 9, nd: 2 }, 12: { bh: 13, nd: 2 }, 13: { bh: 13, nd: 2 }, 14: { bh: 3, nd: 0 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 2, nd: 0 }, 23: { bh: 13, nd: 1 }, 24: { bh: 16, nd: 3 }, 25: { bh: 9, nd: 5 }, 26: { bh: 5, nd: 5 },
          27: { bh: 13, nd: 6 }, 28: { bh: 14, nd: 2 }
        }
      },
      {
        id: 'sa-2',
        category: 'Siêu Âm',
        name: 'Siêu âm mạch',
        dailyData: {
          1: { bh: 1, nd: 0 }, 2: { bh: 1, nd: 1 }, 3: { bh: 1, nd: 0 }, 5: { bh: 2, nd: 0 }, 6: { bh: 0, nd: 1 },
          7: { bh: 2, nd: 0 }, 11: { bh: 3, nd: 0 }, 12: { bh: 1, nd: 1 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 1, nd: 0 }, 24: { bh: 1, nd: 0 }, 25: { bh: 1, nd: 1 }, 26: { bh: 1, nd: 1 }, 27: { bh: 1, nd: 2 }, 28: { bh: 4, nd: 1 }
        }
      },
      {
        id: 'sa-3',
        category: 'Siêu Âm',
        name: 'Siêu âm thai 4D và đầu dò AD',
        dailyData: {
          1: { bh: 0, nd: 10 }, 2: { bh: 0, nd: 5 }, 3: { bh: 0, nd: 6 }, 4: { bh: 0, nd: 5 }, 5: { bh: 0, nd: 10 },
          6: { bh: 0, nd: 5 }, 7: { bh: 0, nd: 10 }, 8: { bh: 0, nd: 8 }, 9: { bh: 0, nd: 7 }, 10: { bh: 0, nd: 8 },
          11: { bh: 0, nd: 11 }, 12: { bh: 0, nd: 10 }, 13: { bh: 0, nd: 7 }, 14: { bh: 0, nd: 3 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 0, nd: 7 }, 23: { bh: 0, nd: 12 }, 24: { bh: 0, nd: 13 }, 25: { bh: 0, nd: 9 }, 26: { bh: 0, nd: 11 },
          27: { bh: 0, nd: 7 }, 28: { bh: 0, nd: 1 }
        }
      },
      {
        id: 'sa-4',
        category: 'Siêu Âm',
        name: 'Siêu âm tổng quát',
        dailyData: {
          1: { bh: 107, nd: 33 }, 2: { bh: 102, nd: 13 }, 3: { bh: 122, nd: 14 }, 4: { bh: 108, nd: 15 }, 5: { bh: 104, nd: 12 },
          6: { bh: 92, nd: 10 }, 7: { bh: 79, nd: 9 }, 8: { bh: 70, nd: 6 }, 9: { bh: 83, nd: 14 }, 10: { bh: 66, nd: 11 },
          11: { bh: 83, nd: 17 }, 12: { bh: 100, nd: 14 }, 13: { bh: 84, nd: 13 }, 14: { bh: 30, nd: 5 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 46, nd: 11 }, 23: { bh: 141, nd: 21 }, 24: { bh: 121, nd: 23 }, 25: { bh: 107, nd: 21 }, 26: { bh: 97, nd: 26 },
          27: { bh: 87, nd: 26 }, 28: { bh: 90, nd: 15 }
        }
      },
      {
        id: 'sa-5',
        category: 'Siêu Âm',
        name: 'Siêu âm đàn hồi mô',
        dailyData: {
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock
        }
      },
      {
        id: 'sa-6',
        category: 'Siêu Âm',
        name: 'Siêu âm can thiệp',
        dailyData: {
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock
        }
      },

      // Category 2: Nội Soi
      {
        id: 'ns-1',
        category: 'Nội Soi',
        name: 'Nội soi dạ dày',
        dailyData: {
          1: { bh: 13, nd: 2 }, 2: { bh: 9, nd: 0 }, 3: { bh: 6, nd: 2 }, 4: { bh: 11, nd: 3 }, 5: { bh: 9, nd: 1 },
          6: { bh: 4, nd: 3 }, 7: { bh: 6, nd: 0 }, 8: { bh: 20, nd: 2 }, 9: { bh: 11, nd: 1 }, 10: { bh: 4, nd: 0 },
          11: { bh: 8, nd: 1 }, 12: { bh: 3, nd: 3 }, 13: { bh: 7, nd: 1 }, 14: { bh: 7, nd: 0 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 7, nd: 1 }, 23: { bh: 14, nd: 2 }, 24: { bh: 10, nd: 1 }, 25: { bh: 7, nd: 1 }, 26: { bh: 3, nd: 2 },
          27: { bh: 5, nd: 1 }, 28: { bh: 7, nd: 0 }
        }
      },
      {
        id: 'ns-2',
        category: 'Nội Soi',
        name: 'Nội soi đại trực tràng',
        dailyData: {
          1: { bh: 4, nd: 0 }, 2: { bh: 3, nd: 0 }, 3: { bh: 1, nd: 1 }, 4: { bh: 2, nd: 1 }, 5: { bh: 4, nd: 0 },
          6: { bh: 1, nd: 0 }, 7: { bh: 1, nd: 0 }, 8: { bh: 7, nd: 1 }, 9: { bh: 3, nd: 0 }, 10: { bh: 6, nd: 0 },
          11: { bh: 4, nd: 1 }, 13: { bh: 1, nd: 0 }, 14: { bh: 2, nd: 0 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 2, nd: 1 }, 23: { bh: 2, nd: 2 }, 24: { bh: 10, nd: 0 }, 25: { bh: 2, nd: 1 }, 26: { bh: 2, nd: 0 },
          27: { bh: 2, nd: 1 }, 28: { bh: 3, nd: 0 }
        }
      },
      {
        id: 'ns-3',
        category: 'Nội Soi',
        name: 'Nội soi trực tràng',
        dailyData: {
          3: { bh: 1, nd: 0 }, 5: { bh: 1, nd: 0 }, 6: { bh: 1, nd: 0 }, 8: { bh: 1, nd: 0 }, 9: { bh: 1, nd: 0 }, 12: { bh: 1, nd: 0 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 2, nd: 0 }, 23: { bh: 1, nd: 0 }, 26: { bh: 1, nd: 0 }
        }
      },
      {
        id: 'ns-4',
        category: 'Nội Soi',
        name: 'Nội soi đại tràng Sigma',
        dailyData: {
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock
        }
      },
      {
        id: 'ns-5',
        category: 'Nội Soi',
        name: 'Thụt tháo',
        dailyData: {
          1: { bh: 0, nd: 4 }, 2: { bh: 0, nd: 3 }, 3: { bh: 0, nd: 3 }, 4: { bh: 0, nd: 2 }, 5: { bh: 0, nd: 6 },
          6: { bh: 0, nd: 2 }, 7: { bh: 0, nd: 2 }, 8: { bh: 0, nd: 6 }, 9: { bh: 0, nd: 4 }, 10: { bh: 0, nd: 7 },
          11: { bh: 0, nd: 5 }, 12: { bh: 0, nd: 2 }, 14: { bh: 0, nd: 1 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 0, nd: 5 }, 23: { bh: 0, nd: 4 }, 24: { bh: 0, nd: 12 }, 25: { bh: 0, nd: 3 }, 26: { bh: 0, nd: 5 },
          27: { bh: 0, nd: 3 }, 28: { bh: 4, nd: 2 }
        }
      },
      {
        id: 'ns-6',
        category: 'Nội Soi',
        name: 'Cắt polyp',
        dailyData: {
          11: { bh: 0, nd: 2 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          28: { bh: 0, nd: 2 }
        }
      },
      {
        id: 'ns-7',
        category: 'Nội Soi',
        name: 'Clotest H.pylori',
        dailyData: {
          1: { bh: 0, nd: 15 }, 2: { bh: 0, nd: 8 }, 3: { bh: 0, nd: 8 }, 4: { bh: 0, nd: 14 }, 5: { bh: 0, nd: 10 },
          6: { bh: 0, nd: 7 }, 7: { bh: 0, nd: 6 }, 8: { bh: 0, nd: 22 }, 9: { bh: 0, nd: 12 }, 10: { bh: 0, nd: 4 },
          11: { bh: 0, nd: 9 }, 12: { bh: 0, nd: 6 }, 13: { bh: 0, nd: 8 }, 14: { bh: 0, nd: 7 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 0, nd: 8 }, 23: { bh: 0, nd: 14 }, 24: { bh: 0, nd: 10 }, 25: { bh: 0, nd: 8 }, 26: { bh: 0, nd: 5 },
          27: { bh: 0, nd: 6 }, 28: { bh: 0, nd: 7 }
        }
      },
      {
        id: 'ns-8',
        category: 'Nội Soi',
        name: 'Dịch vụ gây mê Dạ dày + Đại tràng',
        dailyData: {
          1: { bh: 0, nd: 3 }, 2: { bh: 0, nd: 3 }, 4: { bh: 0, nd: 1 }, 5: { bh: 0, nd: 1 }, 8: { bh: 0, nd: 7 },
          9: { bh: 0, nd: 2 }, 10: { bh: 0, nd: 2 }, 11: { bh: 0, nd: 3 }, 14: { bh: 0, nd: 2 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 0, nd: 1 }, 23: { bh: 0, nd: 2 }, 24: { bh: 0, nd: 1 }, 25: { bh: 0, nd: 2 }, 26: { bh: 0, nd: 2 },
          27: { bh: 0, nd: 1 }, 28: { bh: 0, nd: 3 }
        }
      },
      {
        id: 'ns-9',
        category: 'Nội Soi',
        name: 'Dịch vụ gây mê ( Đơn )',
        dailyData: {
          2: { bh: 0, nd: 1 }, 3: { bh: 0, nd: 3 }, 4: { bh: 0, nd: 4 }, 5: { bh: 0, nd: 5 }, 7: { bh: 0, nd: 1 },
          8: { bh: 0, nd: 1 }, 9: { bh: 0, nd: 4 }, 10: { bh: 0, nd: 2 }, 11: { bh: 0, nd: 2 }, 12: { bh: 0, nd: 2 },
          13: { bh: 0, nd: 1 }, 14: { bh: 0, nd: 2 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 0, nd: 2 }, 23: { bh: 0, nd: 4 }, 24: { bh: 0, nd: 8 }, 25: { bh: 0, nd: 2 }, 26: { bh: 0, nd: 4 }, 28: { bh: 0, nd: 2 }
        }
      },

      // Category 3: X quang
      {
        id: 'xq-1',
        category: 'X quang',
        name: 'X quang',
        dailyData: {
          1: { bh: 99, nd: 9 }, 2: { bh: 131, nd: 24 }, 3: { bh: 138, nd: 13 }, 4: { bh: 96, nd: 12 }, 5: { bh: 121, nd: 7 },
          6: { bh: 85, nd: 8 }, 7: { bh: 91, nd: 10 }, 8: { bh: 56, nd: 4 }, 9: { bh: 82, nd: 10 }, 10: { bh: 88, nd: 10 },
          11: { bh: 88, nd: 14 }, 12: { bh: 108, nd: 15 }, 13: { bh: 83, nd: 16 }, 14: { bh: 25, nd: 4 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 46, nd: 5 }, 23: { bh: 188, nd: 49 }, 24: { bh: 148, nd: 42 }, 25: { bh: 120, nd: 22 }, 26: { bh: 93, nd: 27 },
          27: { bh: 108, nd: 24 }, 28: { bh: 123, nd: 15 }
        }
      },
      {
        id: 'xq-2',
        category: 'X quang',
        name: 'Xquang đặc biệt',
        dailyData: {
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock
        }
      },
      {
        id: 'xq-3',
        category: 'X quang',
        name: 'CLVT',
        dailyData: {
          1: { bh: 0, nd: 3 }, 2: { bh: 0, nd: 4 }, 3: { bh: 0, nd: 5 }, 4: { bh: 0, nd: 2 }, 5: { bh: 0, nd: 3 },
          6: { bh: 0, nd: 2 }, 7: { bh: 0, nd: 1 }, 8: { bh: 0, nd: 5 }, 9: { bh: 0, nd: 2 }, 10: { bh: 0, nd: 4 },
          11: { bh: 0, nd: 3 }, 12: { bh: 0, nd: 2 }, 13: { bh: 0, nd: 3 }, 14: { bh: 0, nd: 1 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 0, nd: 2 }, 23: { bh: 0, nd: 5 }, 24: { bh: 0, nd: 4 }, 25: { bh: 0, nd: 3 }, 26: { bh: 0, nd: 3 },
          27: { bh: 0, nd: 2 }, 28: { bh: 0, nd: 3 }
        }
      },

      // Category 4: Điện tim & LHN
      {
        id: 'dtlhn-1',
        category: 'Điện tim & LHN',
        name: 'Điện tim',
        dailyData: {
          1: { bh: 25, nd: 3 }, 2: { bh: 28, nd: 4 }, 3: { bh: 30, nd: 2 }, 4: { bh: 22, nd: 3 }, 5: { bh: 26, nd: 1 },
          6: { bh: 18, nd: 2 }, 7: { bh: 19, nd: 2 }, 8: { bh: 15, nd: 1 }, 9: { bh: 20, nd: 3 }, 10: { bh: 18, nd: 2 },
          11: { bh: 21, nd: 4 }, 12: { bh: 25, nd: 3 }, 13: { bh: 20, nd: 2 }, 14: { bh: 8, nd: 1 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 12, nd: 2 }, 23: { bh: 35, nd: 5 }, 24: { bh: 31, nd: 4 }, 25: { bh: 28, nd: 3 }, 26: { bh: 22, nd: 4 },
          27: { bh: 25, nd: 3 }, 28: { bh: 27, nd: 2 }
        }
      },
      {
        id: 'dtlhn-2',
        category: 'Điện tim & LHN',
        name: 'Lưu huyết não',
        dailyData: {
          1: { bh: 2, nd: 1 }, 2: { bh: 3, nd: 1 }, 3: { bh: 4, nd: 0 }, 4: { bh: 2, nd: 1 }, 5: { bh: 3, nd: 1 },
          6: { bh: 1, nd: 1 }, 7: { bh: 2, nd: 0 }, 8: { bh: 1, nd: 0 }, 9: { bh: 3, nd: 1 }, 10: { bh: 2, nd: 0 },
          11: { bh: 3, nd: 1 }, 12: { bh: 2, nd: 1 }, 13: { bh: 2, nd: 0 }, 14: { bh: 1, nd: 0 },
          15: ltBlock, 16: ltBlock, 17: ltBlock, 18: ltBlock, 19: ltBlock, 20: ltBlock, 21: ltBlock,
          22: { bh: 1, nd: 0 }, 23: { bh: 4, nd: 1 }, 24: { bh: 3, nd: 1 }, 25: { bh: 2, nd: 1 }, 26: { bh: 2, nd: 0 },
          27: { bh: 3, nd: 1 }, 28: { bh: 3, nd: 0 }
        }
      }
    ];
  });

  // Helper to record manual Range Audit entries into Sync History
  const mapDiscrepanciesForHistory = (
    discs: RangeAuditDiscrepancy[],
    statusResolver: (d: RangeAuditDiscrepancy) => 'pending' | 'updated_from_sheet' | 'kept_system'
  ): SyncHistoryDiscrepancyItem[] => {
    return discs.slice(0, 80).map((d) => ({
      id: d.id,
      year: d.year,
      monthKey: d.monthKey,
      day: d.day,
      dateLabel: d.dateLabel,
      category: d.category,
      serviceName: d.serviceName,
      type: d.type,
      systemBh: d.systemValue.bh,
      systemNd: d.systemValue.nd,
      sheetBh: d.sheetValue.bh,
      sheetNd: d.sheetValue.nd,
      isManualLocked: d.isManualLocked,
      resolutionStatus: statusResolver(d)
    }));
  };

  const logRangeAuditToHistory = (params: {
    status: SyncHistoryEntry['status'];
    checkedCellsCount: number;
    discrepancyCount: number;
    updatedFromSheetCount: number;
    savedToDatabase: boolean;
    databaseNote?: string;
    summary: string;
    discrepancies?: SyncHistoryDiscrepancyItem[];
  }) => {
    const now = new Date();
    const currentUser = storageService.getCurrentUser();
    const startLabel = resyncStartDate.split('-').reverse().join('/');
    const endLabel = resyncEndDate.split('-').reverse().join('/');
    const entry: SyncHistoryEntry = {
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now.toISOString(),
      displayTime: now.toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
      trigger: 'manual_range_audit',
      dateRangeLabel: `${startLabel} – ${endLabel}`,
      startDate: resyncStartDate,
      endDate: resyncEndDate,
      status: params.status,
      checkedCellsCount: params.checkedCellsCount,
      autoWrittenCount: 0,
      discrepancyCount: params.discrepancyCount,
      updatedFromSheetCount: params.updatedFromSheetCount,
      savedToDatabase: params.savedToDatabase,
      databaseNote:
        params.databaseNote ||
        (params.savedToDatabase
          ? 'Đã lưu cố định trên PostgreSQL'
          : 'Lưu cục bộ (IndexedDB/LocalStorage)'),
      performedBy: currentUser?.name || currentUser?.email || 'Quản trị viên',
      summary: params.summary,
      discrepancies: params.discrepancies
    };
    storageService.addSyncHistoryEntry(entry);
  };

  // Switch active reporting year cleanly (reads stored PostgreSQL/IDB archive only; multi-day sync requires manual Range Audit)
  const handleChangeReportYear = (rawYear: number) => {
    const nextYear = Math.max(MIN_REPORT_YEAR, Math.min(MAX_REPORT_YEAR, Math.round(rawYear)));
    setSelectedYear(nextYear);
    setYearInputStr(String(nextYear));
    setEditingCell(null);
    const nextStore = reportArchiveService.loadYearArchiveSync(nextYear);
    const latest = findLatestDataDate(nextStore, undefined, nextYear);
    setMonthlyDataStore(nextStore);
    setSelectedReportMonth(latest.month);
    setSelectedReportDay(latest.day);
    setSelectedReportWeek(latest.week);
    setTimePeriod(`${latest.month}/${nextYear}`);
    setCaseReports(nextStore[latest.month] || []);
    setSheetUrl(getEffectiveSheetTarget(nextYear));

    void reportArchiveService.hydrateYearArchiveFromIDB(nextYear).then((hydrated) => {
      if (Object.keys(hydrated).length > 0) {
        const latestHydrated = findLatestDataDate(hydrated, undefined, nextYear);
        setMonthlyDataStore(hydrated);
        setSelectedReportMonth(latestHydrated.month);
        setSelectedReportDay(latestHydrated.day);
        setSelectedReportWeek(latestHydrated.week);
        setTimePeriod(`${latestHydrated.month}/${nextYear}`);
        setCaseReports(hydrated[latestHydrated.month] || []);
      }
    });
  };

  const toIsoDateInput = (y: number, mNum: number, dNum: number): string => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${y}-${pad2(mNum)}-${pad2(dNum)}`;
  };

  const applyResyncPreset = (
    preset: 'day' | 'week' | 'month' | 'year',
    targetYear: number = resyncYear
  ) => {
    const mNum = getMonthNumber(selectedReportMonth);
    const maxD = getDaysInMonth(selectedReportMonth, targetYear);
    const clampedDay = Math.min(maxD, Math.max(1, selectedReportDay));

    if (preset === 'day') {
      const iso = toIsoDateInput(targetYear, mNum, clampedDay);
      setResyncStartDate(iso);
      setResyncEndDate(iso);
    } else if (preset === 'week') {
      const wInfo = getWeekDateRange(selectedReportWeek, targetYear);
      setResyncStartDate(toIsoDateInput(targetYear, wInfo.startMonthNum, wInfo.startDayNum));
      setResyncEndDate(toIsoDateInput(targetYear, wInfo.endMonthNum, wInfo.endDayNum));
    } else if (preset === 'month') {
      setResyncStartDate(toIsoDateInput(targetYear, mNum, 1));
      setResyncEndDate(toIsoDateInput(targetYear, mNum, maxD));
    } else {
      setResyncStartDate(toIsoDateInput(targetYear, 1, 1));
      setResyncEndDate(toIsoDateInput(targetYear, 12, 31));
    }
  };

  const openResyncModalWithOptions = (options?: {
    year?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const targetYear =
      options?.year && isValidReportYear(options.year) ? options.year : selectedYear;
    setResyncYear(targetYear);
    setResyncYearInput(String(targetYear));
    setAuditStep('select');
    setAuditDiscrepancies([]);
    setSelectedDiscrepancyIds({});
    setAuditCheckedCells(0);
    setAuditCheckedMonths(0);
    setAuditMissingTabs([]);
    setAuditError(null);
    setIsApplyingAudit(false);

    if (options?.startDate && options?.endDate) {
      setResyncStartDate(options.startDate);
      setResyncEndDate(options.endDate);
    } else if (sheetTab === 'Báo cáo ngày') {
      applyResyncPreset('day', targetYear);
    } else if (sheetTab === 'Báo cáo tuần') {
      applyResyncPreset('week', targetYear);
    } else if (sheetTab === 'Báo cáo năm') {
      applyResyncPreset('year', targetYear);
    } else {
      const mNum = getMonthNumber(sheetTab.startsWith('Tháng') ? sheetTab : selectedReportMonth);
      const maxD = getDaysInMonth(`Tháng ${mNum}`, targetYear);
      setResyncStartDate(toIsoDateInput(targetYear, mNum, 1));
      setResyncEndDate(toIsoDateInput(targetYear, mNum, maxD));
    }
    setIsResyncModalOpen(true);
  };

  const openResyncModal = () => {
    openResyncModalWithOptions();
  };

  useEffect(() => {
    if (!pendingAuditRequest) return;
    setActiveTab('google_sheet');
    openResyncModalWithOptions({
      year: pendingAuditRequest.year,
      startDate: pendingAuditRequest.startDate,
      endDate: pendingAuditRequest.endDate
    });
    onClearPendingAuditRequest?.();
  }, [pendingAuditRequest?.nonce]);

  const buildYearMonthSlices = (
    startDateStr: string,
    endDateStr: string
  ): Map<number, Array<{ monthKey: string; startDay: number; endDay: number }>> | null => {
    const startParts = startDateStr.split('-').map(Number);
    const endParts = endDateStr.split('-').map(Number);
    const startObj = new Date(startParts[0], startParts[1] - 1, startParts[2]);
    const endObj = new Date(endParts[0], endParts[1] - 1, endParts[2]);
    if (Number.isNaN(startObj.getTime()) || Number.isNaN(endObj.getTime()) || startObj > endObj) {
      return null;
    }

    const slicesByYear = new Map<number, Array<{ monthKey: string; startDay: number; endDay: number }>>();
    const cursor = new Date(startObj.getFullYear(), startObj.getMonth(), 1);
    const endMonthStart = new Date(endObj.getFullYear(), endObj.getMonth(), 1);

    while (cursor <= endMonthStart) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const monthKey = `Tháng ${m}`;
      const maxD = getDaysInMonth(monthKey, y);
      const sDay = y === startObj.getFullYear() && m === startObj.getMonth() + 1 ? startObj.getDate() : 1;
      const eDay = y === endObj.getFullYear() && m === endObj.getMonth() + 1 ? endObj.getDate() : maxD;
      const list = slicesByYear.get(y) || [];
      list.push({ monthKey, startDay: sDay, endDay: Math.min(maxD, eDay) });
      slicesByYear.set(y, list);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return slicesByYear;
  };

  const handleRunRangeAudit = async () => {
    const parsedYear = parseInt(resyncYearInput, 10);
    const targetYear = isValidReportYear(parsedYear) ? parsedYear : resyncYear;

    if (!resyncStartDate || !resyncEndDate) {
      setAuditError('Vui lòng chọn đầy đủ Từ ngày và Đến ngày để rà soát.');
      return;
    }

    const yearMonthSlices = buildYearMonthSlices(resyncStartDate, resyncEndDate);
    if (!yearMonthSlices) {
      setAuditError('Khoảng thời gian không hợp lệ (Từ ngày phải nhỏ hơn hoặc bằng Đến ngày).');
      return;
    }

    const effectiveUrl = getEffectiveSheetTarget(targetYear);
    const spreadsheetId = resolveSpreadsheetId(effectiveUrl);
    if (!spreadsheetId) {
      setAuditError(
        `Chưa gắn liên kết Google Sheets cho Năm ${targetYear}. Vui lòng vào "Menu Cấu Hình → Cấu Hình Hệ Thống" để nhập năm ${targetYear} và dán URL/ID Sheet.`
      );
      return;
    }

    setAuditError(null);
    setAuditStep('checking');

    try {
      const allDiscrepancies: RangeAuditDiscrepancy[] = [];
      let totalCheckedCells = 0;
      let totalCheckedMonths = 0;
      const missingTabs: string[] = [];

      for (const [sliceYear, slices] of yearMonthSlices.entries()) {
        await reportArchiveService.hydrateYearArchiveFromIDB(sliceYear);
        const sliceSheetUrl = getEffectiveSheetTarget(sliceYear) || effectiveUrl;
        const sliceSheetId = resolveSpreadsheetId(sliceSheetUrl);
        if (!sliceSheetId) {
          slices.forEach((s) => missingTabs.push(`${s.monthKey}/${sliceYear} (chưa có link)`));
          continue;
        }

        const probeCsv = await fetchRawTabCsv(sliceSheetId, '__cls_probe_nonexistent__');

        for (const slice of slices) {
          const parsedItems = await fetchSingleSheetTab(
            sliceSheetUrl,
            slice.monthKey,
            probeCsv,
            sliceYear
          );
          if (!parsedItems || parsedItems.length === 0) {
            missingTabs.push(`${slice.monthKey}/${sliceYear}`);
            continue;
          }

          totalCheckedMonths += 1;
          const res = reportArchiveService.auditMonthRangeAgainstSheet({
            year: sliceYear,
            monthKey: slice.monthKey,
            incomingItems: parsedItems,
            startDay: slice.startDay,
            endDay: slice.endDay
          });
          totalCheckedCells += res.checkedCellsCount;
          allDiscrepancies.push(...res.discrepancies);
        }
      }

      if (totalCheckedMonths === 0) {
        setAuditStep('select');
        const msg = `Không đọc được dữ liệu Google Sheet phù hợp cho khoảng thời gian ${resyncStartDate.split('-').reverse().join('/')} – ${resyncEndDate.split('-').reverse().join('/')}. Vui lòng kiểm tra lại link Sheet hoặc tên tab tháng.`;
        setAuditError(msg);
        logRangeAuditToHistory({
          status: 'error',
          checkedCellsCount: 0,
          discrepancyCount: 0,
          updatedFromSheetCount: 0,
          savedToDatabase: false,
          databaseNote: 'Không đọc được tab Google Sheet',
          summary: msg
        });
        return;
      }

      const defaultSelections: Record<string, boolean> = {};
      for (const disc of allDiscrepancies) {
        defaultSelections[disc.id] = !disc.isManualLocked && disc.type !== 'cleared_on_sheet';
      }

      setAuditDiscrepancies(allDiscrepancies);
      setSelectedDiscrepancyIds(defaultSelections);
      setAuditCheckedCells(totalCheckedCells);
      setAuditCheckedMonths(totalCheckedMonths);
      setAuditMissingTabs(missingTabs);
      setAuditStep('result');

      if (allDiscrepancies.length === 0) {
        const startLabel = resyncStartDate.split('-').reverse().join('/');
        const endLabel = resyncEndDate.split('-').reverse().join('/');
        const pgNow = postgresSyncService.getState();
        const pgReady = pgNow.configured && pgNow.authenticated && pgNow.connected;
        logRangeAuditToHistory({
          status: 'no_change',
          checkedCellsCount: totalCheckedCells,
          discrepancyCount: 0,
          updatedFromSheetCount: 0,
          savedToDatabase: pgReady,
          summary: `Rà soát thủ công (${startLabel} – ${endLabel}): kiểm tra ${totalCheckedCells.toLocaleString('vi-VN')} ô trên ${totalCheckedMonths} tháng, dữ liệu Hệ thống và Google Sheet hoàn toàn khớp.`
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setAuditStep('select');
      setAuditError(`Lỗi khi rà soát từ Google Sheet: ${errMsg}`);
      logRangeAuditToHistory({
        status: 'error',
        checkedCellsCount: 0,
        discrepancyCount: 0,
        updatedFromSheetCount: 0,
        savedToDatabase: false,
        databaseNote: errMsg,
        summary: `Lỗi khi rà soát thủ công: ${errMsg}`
      });
    }
  };

  const handleKeepSystemAfterAudit = () => {
    if (auditDiscrepancies.length > 0) {
      const startLabel = resyncStartDate.split('-').reverse().join('/');
      const endLabel = resyncEndDate.split('-').reverse().join('/');
      const pgNow = postgresSyncService.getState();
      const pgReady = pgNow.configured && pgNow.authenticated && pgNow.connected;
      logRangeAuditToHistory({
        status: 'discrepancy_alert',
        checkedCellsCount: auditCheckedCells,
        discrepancyCount: auditDiscrepancies.length,
        updatedFromSheetCount: 0,
        savedToDatabase: pgReady,
        summary: `Rà soát thủ công (${startLabel} – ${endLabel}): phát hiện ${auditDiscrepancies.length} sai lệch và đã chọn giữ nguyên số liệu Hệ thống.`,
        discrepancies: mapDiscrepanciesForHistory(auditDiscrepancies, () => 'kept_system')
      });
    }
    setIsResyncModalOpen(false);
  };

  const handleApplySelectedAuditUpdates = async () => {
    const approved = auditDiscrepancies.filter((d) => selectedDiscrepancyIds[d.id]);
    if (approved.length === 0) {
      setAuditError('Vui lòng chọn ít nhất 1 mục sai lệch để cập nhật, hoặc nhấn "Không cập nhật" để giữ nguyên.');
      return;
    }

    setIsApplyingAudit(true);
    setAuditError(null);

    try {
      const grouped = new Map<string, { year: number; monthKey: string; items: RangeAuditDiscrepancy[] }>();
      for (const disc of approved) {
        const key = `${disc.year}__${disc.monthKey}`;
        const existingGroup = grouped.get(key) || { year: disc.year, monthKey: disc.monthKey, items: [] };
        existingGroup.items.push(disc);
        grouped.set(key, existingGroup);
      }

      let pgSavedMonths = 0;
      let pgReason: string | undefined;
      const touchedYears = new Set<number>();

      for (const group of grouped.values()) {
        const updatedItems = reportArchiveService.applyAuditDiscrepanciesForMonth(
          group.year,
          group.monthKey,
          group.items
        );
        touchedYears.add(group.year);
        const dbRes = await postgresSyncService.forceSaveReportMonthToServer(
          group.year,
          group.monthKey,
          updatedItems
        );
        if (dbRes.saved) pgSavedMonths += 1;
        else if (!pgReason && dbRes.reason) pgReason = dbRes.reason;
      }

      const parsedYear = parseInt(resyncYearInput, 10);
      const preferredYear = isValidReportYear(parsedYear) ? parsedYear : resyncYear;
      const displayYear = touchedYears.has(preferredYear) ? preferredYear : Array.from(touchedYears)[0];

      if (displayYear && displayYear !== selectedYear) {
        handleChangeReportYear(displayYear);
      } else {
        const refreshed = reportArchiveService.loadYearArchiveSync(selectedYear);
        setMonthlyDataStore(refreshed);
        if (refreshed[selectedReportMonth]) {
          setCaseReports(refreshed[selectedReportMonth]);
        }
      }

      const startLabel = resyncStartDate.split('-').reverse().join('/');
      const endLabel = resyncEndDate.split('-').reverse().join('/');
      const skippedCount = auditDiscrepancies.length - approved.length;

      logRangeAuditToHistory({
        status: skippedCount > 0 ? 'discrepancy_alert' : 'success',
        checkedCellsCount: auditCheckedCells,
        discrepancyCount: auditDiscrepancies.length,
        updatedFromSheetCount: approved.length,
        savedToDatabase: pgSavedMonths > 0,
        databaseNote:
          pgReason ||
          (pgSavedMonths > 0
            ? `Đã lưu cố định ${pgSavedMonths} tháng trên PostgreSQL`
            : 'Lưu cục bộ (IndexedDB/LocalStorage)'),
        summary: `Rà soát thủ công (${startLabel} – ${endLabel}): đã cập nhật ${approved.length}/${auditDiscrepancies.length} sai lệch theo Google Sheet${skippedCount > 0 ? `, giữ nguyên ${skippedCount} mục trên Hệ thống` : ''}.`,
        discrepancies: mapDiscrepanciesForHistory(auditDiscrepancies, (d) =>
          selectedDiscrepancyIds[d.id] ? 'updated_from_sheet' : 'kept_system'
        )
      });

      setIsResyncModalOpen(false);
      const dbSummary =
        pgSavedMonths > 0
          ? `Đã lưu cố định ${pgSavedMonths} tháng lên PostgreSQL.`
          : `Đã lưu cục bộ vào trình duyệt (IndexedDB/LocalStorage).`;
      const toastMsg = `✅ Đã cập nhật ${approved.length} sai lệch sau rà soát (${startLabel} → ${endLabel}). ${dbSummary}`;
      setSyncToast(toastMsg);
      onShowToast?.('Cập nhật sau rà soát thành công', toastMsg, 'success');
      setTimeout(() => setSyncToast(null), 6500);
    } catch (err) {
      setAuditError(
        `Lỗi khi áp dụng cập nhật: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsApplyingAudit(false);
    }
  };

  // Hydrate durable IndexedDB backup ONLY (no multi-day auto-sync on mount; startup 3-day smart sync runs in App.tsx)
  useEffect(() => {
    let active = true;
    void reportArchiveService.hydrateYearArchiveFromIDB(initialYear).then((hydrated) => {
      if (!active) return;
      if (Object.keys(hydrated).length > Object.keys(initialStore).length) {
        const latest = findLatestDataDate(hydrated, undefined, initialYear);
        setMonthlyDataStore(hydrated);
        setSelectedReportMonth(latest.month);
        setSelectedReportDay(latest.day);
        setSelectedReportWeek(latest.week);
        setTimePeriod(`${latest.month}/${initialYear}`);
        setCaseReports(hydrated[latest.month] || []);
      }
    });
    return () => { active = false; };
  }, []);

  // Refresh UI immediately when PostgreSQL or 3-day smart sync pushes updated archive data
  useEffect(() => {
    const handleCloudArchiveUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<{ year?: number; monthKey?: string }>).detail;
      if (detail && detail.year !== selectedYear) return;
      const refreshed = reportArchiveService.loadYearArchiveSync(selectedYear);
      setMonthlyDataStore(refreshed);
      setCaseReports((prev) => refreshed[selectedReportMonth] || prev);
    };
    window.addEventListener(REPORT_ARCHIVE_UPDATED_EVENT, handleCloudArchiveUpdated);
    return () => window.removeEventListener(REPORT_ARCHIVE_UPDATED_EVENT, handleCloudArchiveUpdated);
  }, [selectedYear, selectedReportMonth]);

  // When sheetTab changes for monthly tabs, load saved data from archive store (multi-day fetch requires manual Range Audit)
  useEffect(() => {
    if (sheetTab.startsWith('Tháng')) {
      if (monthlyDataStore[sheetTab] && monthlyDataStore[sheetTab].length > 0) {
        setCaseReports(monthlyDataStore[sheetTab]);
      } else {
        setCaseReports([]);
      }
    }
  }, [sheetTab, monthlyDataStore]);

  // Manual 3-day recent smart sync button (any wider range > 3 days MUST go through "Rà soát số liệu")
  const handleRunManualThreeDaySync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    const w3 = getRecentThreeDaysWindow();
    setSyncToast(`Đang kiểm tra & đồng bộ 3 ngày gần nhất (${w3.dateRangeLabel})...`);
    try {
      const outcome = await runThreeDaySmartSync('manual_3d');
      if (!outcome.ran && outcome.reason === 'no_sheet_configured') {
        const msg = 'Chưa cấu hình liên kết Google Sheets Báo cáo cho năm hiện tại trong "Menu Cấu Hình → Cấu Hình Hệ Thống".';
        setSyncToast(`⚠️ ${msg}`);
        onShowToast?.('Chưa cấu hình Google Sheet', msg, 'warning');
        return;
      }

      const refreshed = reportArchiveService.loadYearArchiveSync(selectedYear);
      setMonthlyDataStore(refreshed);
      if (refreshed[selectedReportMonth]) {
        setCaseReports(refreshed[selectedReportMonth]);
      }

      if (outcome.entry) {
        const hasAlert = outcome.alertDiscrepancies.length > 0;
        setSyncToast(hasAlert ? `⚠️ ${outcome.entry.summary}` : `✅ ${outcome.entry.summary}`);
        onShowToast?.(
          hasAlert
            ? `Phát hiện ${outcome.alertDiscrepancies.length} sai lệch (3 ngày gần nhất)`
            : 'Đồng bộ 3 ngày gần nhất hoàn tất',
          outcome.entry.summary,
          hasAlert ? 'warning' : 'success'
        );
      }
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 6500);
    }
  };

  // Dynamic days array for month (uses numeric month parsing so Tháng 12 is 31 days, not 28)
  const getDaysList = () => {
    const activeMonth = sheetTab.startsWith('Tháng') ? sheetTab : selectedReportMonth;
    const count = getDaysInMonth(activeMonth, selectedYear);
    return Array.from({ length: count }, (_, i) => i + 1);
  };
  const daysList = getDaysList();

  // Calculation for active working days (excluding Lễ Tết / LT days)
  const getActiveWorkDays = () => {
    let activeCount = 0;
    for (const day of daysList) {
      let isLT = false;
      for (const item of caseReports) {
        if (item.dailyData[day]?.bh === 'LT' || item.dailyData[day]?.nd === 'LT') {
          isLT = true;
          break;
        }
      }
      if (!isLT) activeCount++;
    }
    return activeCount > 0 ? activeCount : daysList.length;
  };

  // Helper calculation for total cases per row
  const getRowTotal = (item: CaseReportItem, type?: 'bh' | 'nd') => {
    let total = 0;
    for (let day = 1; day <= 31; day++) {
      const data = item.dailyData[day];
      if (data) {
        const bhNum = typeof data.bh === 'number' ? data.bh : (parseInt(String(data.bh).replace(/[^0-9]/g, ''), 10) || 0);
        const ndNum = typeof data.nd === 'number' ? data.nd : (parseInt(String(data.nd).replace(/[^0-9]/g, ''), 10) || 0);
        if (!type) total += bhNum + ndNum;
        else if (type === 'bh') total += bhNum;
        else if (type === 'nd') total += ndNum;
      }
    }
    return total;
  };

  // Row Average Per Day calculation
  const getItemAveragePerDay = (item: CaseReportItem) => {
    const totalAll = getRowTotal(item, 'bh') + getRowTotal(item, 'nd');
    const activeDays = getActiveWorkDays();
    if (totalAll === 0) return '0,00';
    return (totalAll / activeDays).toFixed(2).replace('.', ',');
  };

  // Helper calculation for Category Totals per Day
  const getCategoryDayTotal = (category: string, day: number, type: 'bh' | 'nd'): number | 'LT' => {
    const categoryItems = caseReports.filter(i => i.category === category);
    let hasLT = false;
    let sum = 0;
    for (const curr of categoryItems) {
      const val = curr.dailyData[day]?.[type];
      if (val === 'LT') {
        hasLT = true;
      } else if (val) {
        const num = typeof val === 'number' ? val : (parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0);
        sum += num;
      }
    }
    if (hasLT && sum === 0) return 'LT';
    return sum;
  };

  // Category Average Per Day calculation
  const getCategoryAveragePerDay = (categoryName: string) => {
    const groupItems = caseReports.filter(i => i.category === categoryName);
    const totalAll = groupItems.reduce((acc, i) => acc + getRowTotal(i), 0);
    const activeDays = getActiveWorkDays();
    if (totalAll === 0) return '0,00';
    return (totalAll / activeDays).toFixed(2).replace('.', ',');
  };

  // Helper calculation for Grand Total Cases across all categories
  const calculateGrandTotal = () => {
    return caseReports.reduce((acc, curr) => acc + getRowTotal(curr), 0);
  };

  // Get active work days for any specified month
  const getActiveWorkDaysForMonth = (mTab: string, items: CaseReportItem[]) => {
    const maxDays = getDaysInMonth(mTab, selectedYear);
    let activeCount = 0;
    for (let day = 1; day <= maxDays; day++) {
      let isLT = false;
      for (const item of items) {
        if (item.dailyData[day]?.bh === 'LT' || item.dailyData[day]?.nd === 'LT') {
          isLT = true;
          break;
        }
      }
      if (!isLT) activeCount++;
    }
    return activeCount > 0 ? activeCount : maxDays;
  };

  // SMART DAILY REPORT RENDERER
  const renderDailyReport = () => {
    const hasMonthData = Boolean(monthlyDataStore[selectedReportMonth] && monthlyDataStore[selectedReportMonth].length > 0);
    const monthItems = hasMonthData
      ? monthlyDataStore[selectedReportMonth]
      : (selectedReportMonth === 'Tháng 2' && selectedYear === 2026 ? caseReports : []);
    const daysInMonth = getDaysInMonth(selectedReportMonth, selectedYear);
    const activeDays = getActiveWorkDaysForMonth(selectedReportMonth, monthItems);

    let totalDayBH = 0;
    let totalDayND = 0;
    let isHolidayLT = false;

    const itemStats = monthItems.map(item => {
      const dayData = item.dailyData[selectedReportDay] || { bh: 0, nd: 0 };
      const bhVal = typeof dayData.bh === 'number' ? dayData.bh : 0;
      const ndVal = typeof dayData.nd === 'number' ? dayData.nd : 0;
      if (dayData.bh === 'LT' || dayData.nd === 'LT') isHolidayLT = true;

      const totalDay = bhVal + ndVal;
      totalDayBH += bhVal;
      totalDayND += ndVal;

      const itemMonthTotal = getRowTotal(item);
      const itemAvgPerDay = activeDays > 0 ? itemMonthTotal / activeDays : 0;
      const diffVsAvg = totalDay - itemAvgPerDay;
      const diffPct = itemAvgPerDay > 0 ? (diffVsAvg / itemAvgPerDay) * 100 : 0;

      return {
        ...item,
        bhVal,
        ndVal,
        totalDay,
        itemAvgPerDay,
        diffVsAvg,
        diffPct
      };
    });

    const totalDayAll = totalDayBH + totalDayND;
    const overallMonthTotal = monthItems.reduce((acc, i) => acc + getRowTotal(i), 0);
    const overallMonthAvgPerDay = activeDays > 0 ? overallMonthTotal / activeDays : 0;
    const totalDiffVsAvg = totalDayAll - overallMonthAvgPerDay;
    const totalDiffPct = overallMonthAvgPerDay > 0 ? (totalDiffVsAvg / overallMonthAvgPerDay) * 100 : 0;

    const topServices = [...itemStats]
      .filter(i => i.totalDay > 0)
      .sort((a, b) => b.totalDay - a.totalDay)
      .slice(0, 8);

    // Compute Clinical Triage Results & Statistical Benchmarking for all items
    const triageMap: { [name: string]: ClinicalTriageResult } = {};
    monthItems.forEach(item => {
      triageMap[item.name] = calculateClinicalTriage(item, selectedReportDay, monthItems, activeDays);
    });

    // Compute Pinned Triage Results (deduplicated by itemId so identical items never render duplicate cards)
    const seenPinnedIds = new Set<string>();
    const pinnedTriageResults: ClinicalTriageResult[] = pinnedServiceNames
      .map(name => {
        const item = monthItems.find(i => i.name.trim().toLowerCase() === name.trim().toLowerCase()) ||
                     caseReports.find(i => i.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (item) {
          return calculateClinicalTriage(item, selectedReportDay, monthItems, activeDays);
        }
        return null;
      })
      .filter((r): r is ClinicalTriageResult => {
        if (!r || seenPinnedIds.has(r.itemId)) return false;
        seenPinnedIds.add(r.itemId);
        return true;
      });

    // Filter items based on dailyTriageFilter and search
    const filteredItemStats = itemStats.filter(item => {
      const isPinned = pinnedServiceNames.some(p => p.trim().toLowerCase() === item.name.trim().toLowerCase());
      const triage = triageMap[item.name];

      if (dailyTriageFilter === 'PINNED' && !isPinned) return false;
      if (dailyTriageFilter === 'SURGE' && (!triage || (triage.severity !== 'SURGE_CRITICAL' && triage.severity !== 'SURGE_MODERATE'))) return false;
      if (dailyTriageFilter === 'DROP' && (!triage || (triage.severity !== 'DROP_CRITICAL' && triage.severity !== 'DROP_MODERATE'))) return false;

      return true;
    });

    const catGrouped = categories.filter(c => c !== 'Tất cả').map(cat => {
      const items = filteredItemStats.filter(i => i.category === cat);
      const catBH = items.reduce((a, b) => a + b.bhVal, 0);
      const catND = items.reduce((a, b) => a + b.ndVal, 0);
      const catTotal = catBH + catND;
      return { category: cat, items, catBH, catND, catTotal };
    }).filter(g => g.items.length > 0);

    const surgeCritCount = Object.values(triageMap).filter(t => t.severity === 'SURGE_CRITICAL').length;
    const surgeModCount = Object.values(triageMap).filter(t => t.severity === 'SURGE_MODERATE').length;
    const dropCount = Object.values(triageMap).filter(t => t.severity === 'DROP_CRITICAL' || t.severity === 'DROP_MODERATE').length;

    // Previous active day baseline (so với hôm qua)
    let prevActiveDayNum: number | null = null;
    let prevDayTotal = 0;
    for (let d = selectedReportDay - 1; d >= 1; d--) {
      let daySum = 0;
      let isPrevLT = false;
      for (const it of monthItems) {
        const entry = it.dailyData?.[d];
        if (entry?.bh === 'LT' || entry?.nd === 'LT') isPrevLT = true;
        const bh = typeof entry?.bh === 'number' ? entry.bh : (parseInt(String(entry?.bh || '').replace(/[^0-9]/g, ''), 10) || 0);
        const nd = typeof entry?.nd === 'number' ? entry.nd : (parseInt(String(entry?.nd || '').replace(/[^0-9]/g, ''), 10) || 0);
        daySum += bh + nd;
      }
      if (!isPrevLT && daySum > 0) {
        prevActiveDayNum = d;
        prevDayTotal = daySum;
        break;
      }
    }
    const diffVsPrevDay = prevActiveDayNum !== null ? totalDayAll - prevDayTotal : 0;
    const diffVsPrevPct = prevActiveDayNum !== null && prevDayTotal > 0 ? (diffVsPrevDay / prevDayTotal) * 100 : 0;

    // Department share breakdown for all items in the day (independent of triage filter)
    const allCatDaily = categories
      .filter((c) => c !== 'Tất cả')
      .map((cat) => {
        const items = itemStats.filter((i) => i.category === cat);
        const bh = items.reduce((s, x) => s + x.bhVal, 0);
        const nd = items.reduce((s, x) => s + x.ndVal, 0);
        return { category: cat, bh, nd, total: bh + nd };
      })
      .filter((g) => g.total > 0);

    const buildHandoverBriefingText = () => {
      const mNum = getMonthNumber(selectedReportMonth);
      const eqSummary = scanEquipmentExpirations(storageService.getEquipment(), 30);
      const tskSummary = scanTaskReminders(storageService.getTasks(), 3);
      const bhPct = totalDayAll > 0 ? ((totalDayBH / totalDayAll) * 100).toFixed(1) : '0.0';
      const ndPct = totalDayAll > 0 ? ((totalDayND / totalDayAll) * 100).toFixed(1) : '0.0';
      const anomalyLines = Object.values(triageMap)
        .filter((t) => t.severity === 'SURGE_CRITICAL' || t.severity === 'DROP_CRITICAL')
        .slice(0, 5)
        .map((t) => `  • ${t.itemName}: ${t.todayCount} ca (TB ${t.mean.toFixed(1)}, Z=${t.zScore > 0 ? `+${t.zScore}` : t.zScore})`);

      return [
        `📊 BÁO CÁO SỐ LIỆU GIAO BAN NGÀY ${String(selectedReportDay).padStart(2, '0')}/${String(mNum).padStart(2, '0')}/${selectedYear} — KHOA CẬN LÂM SÀNG`,
        `────────────────────────────────────────`,
        `• Tổng số ca thực hiện: ${totalDayAll.toLocaleString('vi-VN')} ca${isHolidayLT ? ' (Lễ Tết - LT)' : ''}`,
        `  - Bảo hiểm (BHYT): ${totalDayBH.toLocaleString('vi-VN')} ca (${bhPct}%)`,
        `  - Nhân dân (Viện phí): ${totalDayND.toLocaleString('vi-VN')} ca (${ndPct}%)`,
        prevActiveDayNum !== null
          ? `  - So với ngày ${prevActiveDayNum}/${mNum}: ${diffVsPrevDay >= 0 ? '+' : ''}${diffVsPrevDay} ca (${diffVsPrevPct >= 0 ? '+' : ''}${diffVsPrevPct.toFixed(1)}%)`
          : `  - So với TB tháng (${overallMonthAvgPerDay.toFixed(1)} ca/ngày): ${totalDiffVsAvg >= 0 ? '+' : ''}${totalDiffVsAvg.toFixed(1)} ca`,
        ``,
        `🏥 CHI TIẾT THEO BỘ PHẬN:`,
        ...allCatDaily.map((c) => {
          const pct = totalDayAll > 0 ? ((c.total / totalDayAll) * 100).toFixed(1) : '0.0';
          return `  • ${c.category}: ${c.total.toLocaleString('vi-VN')} ca (${pct}%) [BH: ${c.bh} | ND: ${c.nd}]`;
        }),
        ...(anomalyLines.length > 0 ? [``, `🚨 BIẾN ĐỘNG CHUYÊN MÔN ĐÁNG CHÚ Ý:`, ...anomalyLines] : []),
        ``,
        `🛡️ CẢNH BÁO VẬN HÀNH & NHẮC VIỆC:`,
        `  • Thời hạn thiết bị (≤30 ngày/quá hạn): ${eqSummary.overdueCount} quá hạn, ${eqSummary.critical7Count} khẩn cấp ≤7 ngày, ${eqSummary.warning30Count} sắp hạn.`,
        `  • Công việc tồn đọng: ${tskSummary.overdueCount} quá hạn, ${tskSummary.dueTodayCount} hạn hôm nay, ${tskSummary.dueSoon3DaysCount} sắp hạn ≤3 ngày.`,
        `────────────────────────────────────────`,
        `Người lập báo cáo: ${storageService.getCurrentUser().name}`
      ].join('\n');
    };

    const handleCopyHandover = () => {
      const text = buildHandoverBriefingText();
      navigator.clipboard.writeText(text);
      setCopiedHandover(true);
      setSyncToast('✅ Đã sao chép Bản tin Giao ban Số liệu Hằng ngày vào clipboard!');
      setTimeout(() => {
        setCopiedHandover(false);
        setSyncToast(null);
      }, 3000);
    };

    const handleDispatchHandoverNotification = () => {
      const text = buildHandoverBriefingText();
      const mNum = getMonthNumber(selectedReportMonth);
      storageService.sendNotification({
        recipient: 'Ban Chủ Nhiệm Khoa CLS',
        targetAddress: storageService.getSettings().defaultTelegramChatId || '@cls_giaoban',
        title: `Báo cáo số liệu ngày ${selectedReportDay}/${mNum}/${selectedYear} (${totalDayAll.toLocaleString('vi-VN')} ca)`,
        content: text,
        channel: 'Telegram',
        status: 'Đã gửi'
      });
      setSyncToast(`✅ Đã phát Bản tin Giao ban Ngày ${selectedReportDay}/${mNum}/${selectedYear} tới Ban Chủ Nhiệm Khoa!`);
      setTimeout(() => setSyncToast(null), 3500);
    };

    const handleOpenDailyEntryModal = () => {
      const draft: Record<string, { bh: string; nd: string }> = {};
      monthItems.forEach((item) => {
        const d = item.dailyData?.[selectedReportDay] || { bh: 0, nd: 0 };
        draft[item.id] = {
          bh: d.bh === 'LT' ? 'LT' : String(d.bh ?? 0),
          nd: d.nd === 'LT' ? 'LT' : String(d.nd ?? 0)
        };
      });
      setDailyDraftValues(draft);
      setIsDailyEntryOpen(true);
    };

    return (
      <div className="space-y-6">
        {/* Controls Header */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center justify-center font-bold shadow-2xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>BÁO CÁO SỐ LIỆU THỐNG KÊ HẰNG NGÀY</span>
                <span className="px-2.5 py-0.5 text-xs font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded-full border border-blue-300 dark:border-blue-700 tabular-nums">
                  Ngày {selectedReportDay} - {selectedReportMonth}
                </span>
              </h3>
              <p className="text-xs text-slate-500">Tổng hợp BHYT/Nhân dân &middot; Đối chiếu ngày liền trước &amp; TB 30 ngày &middot; Xuất bản tin giao ban 1 chạm</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {monthItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleOpenDailyEntryModal}
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Nhập / Sửa số liệu ngày {selectedReportDay}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyHandover}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedHandover ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedHandover ? 'Đã sao chép' : 'Sao chép Giao ban'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDispatchHandoverNotification}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Gửi Giao Ban</span>
                </button>
              </>
            )}
            <button
              onClick={() => setIsPinManagerOpen(true)}
              className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Pin className="w-3.5 h-3.5 fill-current text-amber-500" />
              <span>Ghim ({pinnedServiceNames.length})</span>
            </button>
          </div>
        </div>

        {/* Empty state notice when selected month has not been synced yet */}
        {monthItems.length === 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-amber-900 dark:text-amber-200">
                  Chưa có dữ liệu lưu cho {selectedReportMonth}/{selectedYear}
                </h4>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
                  Hệ thống chỉ tự động đồng bộ <strong>3 ngày gần nhất</strong> khi khởi động. Để tải hoặc đối chiếu dữ liệu của cả{' '}
                  <strong>{selectedReportMonth}/{selectedYear}</strong> từ Google Sheet, vui lòng dùng nút{' '}
                  <strong>Rà soát số liệu</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const mNum = getMonthNumber(selectedReportMonth);
                const maxD = getDaysInMonth(selectedReportMonth, selectedYear);
                openResyncModalWithOptions({
                  year: selectedYear,
                  startDate: toIsoDateInput(selectedYear, mNum, 1),
                  endDate: toIsoDateInput(selectedYear, mNum, maxD)
                });
              }}
              disabled={isSyncing}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Rà soát số liệu {selectedReportMonth}</span>
            </button>
          </div>
        )}

        {/* CLINICAL UX: PINNED INDICATORS FAST BENCHMARK PANEL */}
        <PinnedIndicatorsPanel
          pinnedResults={pinnedTriageResults}
          onOpenBenchmarkingModal={item => setSelectedBenchmarkingItem(item)}
          onOpenPinManager={() => setIsPinManagerOpen(true)}
          selectedDay={selectedReportDay}
          selectedMonth={selectedReportMonth}
        />

        {/* Daily Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Ca Trong Ngày</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-blue-900 dark:text-blue-200">{totalDayAll.toLocaleString()} ca</h4>
              <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${isHolidayLT ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'}`}>
                {isHolidayLT ? 'Lễ Tết (LT)' : `Ngày ${selectedReportDay}`}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {prevActiveDayNum !== null
                ? `So ngày ${prevActiveDayNum}: ${diffVsPrevDay >= 0 ? '+' : ''}${diffVsPrevDay} ca (${diffVsPrevPct >= 0 ? '+' : ''}${diffVsPrevPct.toFixed(1)}%)`
                : 'Toàn bộ lượt thực hiện trong ngày'}
            </p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lượt Bảo Hiểm (BHYT)</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-indigo-700 dark:text-indigo-400">{totalDayBH.toLocaleString()} ca</h4>
              <span className="text-xs font-extrabold text-indigo-600">
                {totalDayAll > 0 ? ((totalDayBH / totalDayAll) * 100).toFixed(1) : '0'}%
              </span>
            </div>
            <p className="text-xs text-slate-500">Tỷ lệ bệnh nhân BHYT trong ngày</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lượt Viện Phí / Nhân Dân</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{totalDayND.toLocaleString()} ca</h4>
              <span className="text-xs font-extrabold text-emerald-600">
                {totalDayAll > 0 ? ((totalDayND / totalDayAll) * 100).toFixed(1) : '0'}%
              </span>
            </div>
            <p className="text-xs text-slate-500">Tỷ lệ bệnh nhân thu phí trực tiếp</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">So Với Trung Bình Ngày</span>
            <div className="flex items-baseline justify-between">
              <h4 className={`text-2xl font-black ${totalDiffVsAvg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totalDiffVsAvg >= 0 ? `+${totalDiffVsAvg.toFixed(1)}` : totalDiffVsAvg.toFixed(1)} ca
              </h4>
              <span className={`text-xs font-extrabold ${totalDiffPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totalDiffPct >= 0 ? `+${totalDiffPct.toFixed(1)}%` : `${totalDiffPct.toFixed(1)}%`}
              </span>
            </div>
            <p className="text-xs text-slate-500">TB tháng: {overallMonthAvgPerDay.toFixed(1)} ca/ngày</p>
          </div>
        </div>

        {/* Cơ Cấu Theo Bộ Phận Trong Ngày (Single-Elevation Executive Summary Strip) */}
        {allCatDaily.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Cơ Cấu Thực Hiện Theo Bộ Phận &mdash; Ngày {selectedReportDay}/{getMonthNumber(selectedReportMonth)}
              </h4>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {allCatDaily.length} bộ phận có phát sinh ca &middot; Tỷ lệ BH/ND: {totalDayAll > 0 ? Math.round((totalDayBH / totalDayAll) * 100) : 0}% / {totalDayAll > 0 ? Math.round((totalDayND / totalDayAll) * 100) : 0}%
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 tabular-nums">
              {allCatDaily.map((c) => {
                const share = totalDayAll > 0 ? (c.total / totalDayAll) * 100 : 0;
                return (
                  <div key={c.category} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700">
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate" title={c.category}>
                      {c.category}
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-base font-black text-slate-900 dark:text-white">{c.total.toLocaleString()}</span>
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">{share.toFixed(1)}%</span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      BH {c.bh} &middot; ND {c.nd}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detailed Daily Table with Fast Pinning & Visual Triage Filter Toolbar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm overflow-hidden space-y-0">
          <div className="bg-slate-100/80 dark:bg-slate-800/90 px-5 py-4 border-b-[1.5px] border-slate-300 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <span>CHI TIẾT CÁC KỸ THUẬT THỰC HIỆN TRONG NGÀY {selectedReportDay} - {selectedReportMonth.toUpperCase()}</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bấm vào biểu tượng ngôi sao để Ghim chỉ số • Bấm vào nhãn trạng thái để xem Phân tích Bối cảnh Y tế &amp; Độ lệch chuẩn
              </p>
            </div>

            {/* Quick Triage Filter Group */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Lọc nhanh:
              </span>
              <button
                onClick={() => setDailyTriageFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  dailyTriageFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Tất cả ({itemStats.length})
              </button>
              <button
                onClick={() => setDailyTriageFilter('PINNED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  dailyTriageFilter === 'PINNED'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                    : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-slate-800'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>Đã ghim ({pinnedServiceNames.length})</span>
              </button>
              <button
                onClick={() => setDailyTriageFilter('SURGE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  dailyTriageFilter === 'SURGE'
                    ? 'bg-rose-600 text-white font-black shadow-2xs'
                    : 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-slate-800'
                }`}
              >
                <span>🚨 Đột biến ({surgeCritCount + surgeModCount})</span>
              </button>
              <button
                onClick={() => setDailyTriageFilter('DROP')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  dailyTriageFilter === 'DROP'
                    ? 'bg-sky-600 text-white font-black shadow-2xs'
                    : 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 border border-slate-300 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-slate-800'
                }`}
              >
                <span>📉 Sụt giảm ({dropCount})</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse min-w-[820px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[13px] font-extrabold leading-tight border-b-2 border-slate-400 dark:border-slate-500">
                  <th className="px-1.5 py-2.5 w-11 text-center border-r border-slate-300 dark:border-slate-600">Ghim</th>
                  <th className="px-1.5 py-2.5 w-11 text-center border-r border-slate-300 dark:border-slate-600">STT</th>
                  <th className="px-2.5 py-2.5 w-[92px] border-r border-slate-300 dark:border-slate-600">Bộ<br />Phận</th>
                  <th className="px-3 py-2.5 min-w-[175px] border-r border-slate-300 dark:border-slate-600">Kỹ Thuật /<br />Dịch Vụ</th>
                  <th className="px-2 py-2.5 w-[114px] text-center border-r border-slate-300 dark:border-slate-600">Cảnh Báo<br />Lâm Sàng</th>
                  <th className="px-2.5 py-2.5 w-[78px] text-right border-r border-slate-300 dark:border-slate-600">Bảo Hiểm<br />(BH)</th>
                  <th className="px-2.5 py-2.5 w-[78px] text-right border-r border-slate-300 dark:border-slate-600">Nhân Dân<br />(ND)</th>
                  <th className="px-2.5 py-2.5 w-[68px] text-right bg-blue-100/80 dark:bg-blue-950 text-blue-950 dark:text-blue-100 border-r border-blue-300 dark:border-blue-700">Tổng<br />Ngày</th>
                  <th className="px-2 py-2.5 w-[62px] text-right border-r border-slate-300 dark:border-slate-600">Tỷ<br />Trọng</th>
                  <th className="px-2.5 py-2.5 w-[116px] text-right">So TB 30 Ngày<br />(Z-Score)</th>
                </tr>
              </thead>
              <tbody>
                {catGrouped.map((group) => (
                  <React.Fragment key={group.category}>
                    <tr className="bg-indigo-50/90 dark:bg-slate-800/95 font-black text-indigo-950 dark:text-indigo-200 border-y border-slate-400/80 dark:border-slate-600 text-sm">
                      <td colSpan={5} className="px-3 py-2.5 uppercase tracking-wide border-r border-slate-300 dark:border-slate-600">
                        📌 {group.category} <span className="font-semibold text-xs text-indigo-700 dark:text-indigo-300 ml-1">({group.items.length} kỹ thuật)</span>
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-extrabold tabular-nums text-[15px] border-r border-slate-300 dark:border-slate-600">
                        {group.catBH.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-extrabold tabular-nums text-[15px] border-r border-slate-300 dark:border-slate-600">
                        {group.catND.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-black tabular-nums text-[15px] text-blue-950 dark:text-blue-100 bg-blue-100/80 dark:bg-blue-950/70 border-r border-blue-300 dark:border-blue-700">
                        {group.catTotal.toLocaleString()}
                      </td>
                      <td className="px-2 py-2.5 text-right font-extrabold tabular-nums border-r border-slate-300 dark:border-slate-600">
                        {totalDayAll > 0 ? ((group.catTotal / totalDayAll) * 100).toFixed(1) : '0.0'}%
                      </td>
                      <td className="px-2.5 py-2.5 text-right text-slate-400 font-semibold">-</td>
                    </tr>
                    {group.items.map((item, itemIdx) => {
                      const isPinned = pinnedServiceNames.some(p => p.trim().toLowerCase() === item.name.trim().toLowerCase());
                      const triage = triageMap[item.name] || calculateClinicalTriage(item, selectedReportDay, monthItems, activeDays);

                      return (
                        <tr
                          key={`${item.id}-${itemIdx}`}
                          className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-800/35 hover:bg-blue-50/70 dark:hover:bg-slate-800/75 border-b border-slate-300 dark:border-slate-700 transition-colors"
                        >
                          {/* Pin Toggle Button */}
                          <td className="px-1.5 py-2.5 text-center border-r border-slate-300 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => handleTogglePinService(item.name)}
                              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                                isPinned
                                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100'
                                  : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                              }`}
                              title={isPinned ? 'Bỏ ghim khỏi chỉ số trọng điểm' : 'Ghim chỉ số lên đầu bảng'}
                            >
                              <Star className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
                            </button>
                          </td>

                          {/* STT */}
                          <td className="px-1.5 py-2.5 text-center text-slate-500 dark:text-slate-400 font-bold tabular-nums border-r border-slate-300 dark:border-slate-700">
                            {itemIdx + 1}
                          </td>

                          {/* Bộ phận */}
                          <td className="px-2.5 py-2.5 font-medium text-slate-600 dark:text-slate-300 leading-snug border-r border-slate-300 dark:border-slate-700">
                            {item.category}
                          </td>

                          {/* Service Name */}
                          <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700">
                            <div className="flex items-center justify-between gap-2">
                              <span className="leading-snug">{item.name}</span>
                              {isPinned && (
                                <span className="shrink-0 px-1.5 py-0.5 text-[11px] font-extrabold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 rounded border border-amber-300/70 whitespace-nowrap">
                                  Ghim
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Visual Triage Alert Pill */}
                          <td className="px-2 py-2.5 text-center border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedBenchmarkingItem(triage)}
                              className={`px-2 py-0.5 rounded-full text-xs font-extrabold border inline-flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 active:scale-95 shadow-2xs whitespace-nowrap ${triage.alertBadgeClass}`}
                              title="Bấm để xem đối soát lâm sàng & phân tích bối cảnh y tế"
                            >
                              {triage.severity === 'SURGE_CRITICAL' && <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                              {triage.severity === 'SURGE_MODERATE' && <TrendingUp className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                              {triage.severity === 'DROP_CRITICAL' && <ArrowDownRight className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                              <span>{triage.severity === 'SURGE_CRITICAL' ? '🚨 Đột biến' : triage.severity === 'SURGE_MODERATE' ? '⚠️ Biến động' : triage.severity === 'DROP_CRITICAL' ? '📉 Sụt giảm' : '🟢 Ổn định'}</span>
                            </button>
                          </td>

                          {/* Bảo hiểm (BH) */}
                          <td className="px-2.5 py-2.5 text-right font-bold text-[15px] tabular-nums text-indigo-700 dark:text-indigo-300 border-r border-slate-300 dark:border-slate-700">
                            {item.bhVal ? item.bhVal.toLocaleString() : <span className="text-slate-300 dark:text-slate-600 font-normal">-</span>}
                          </td>

                          {/* Nhân dân (ND) */}
                          <td className="px-2.5 py-2.5 text-right font-bold text-[15px] tabular-nums text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-700">
                            {item.ndVal ? item.ndVal.toLocaleString() : <span className="text-slate-300 dark:text-slate-600 font-normal">-</span>}
                          </td>

                          {/* Tổng Ngày */}
                          <td className="px-2.5 py-2.5 text-right font-black text-[15px] tabular-nums text-blue-950 dark:text-blue-100 bg-blue-50/70 dark:bg-blue-950/35 border-r border-blue-300 dark:border-blue-700">
                            {item.totalDay.toLocaleString()}
                          </td>

                          {/* Tỷ Trọng */}
                          <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700">
                            {totalDayAll > 0 ? ((item.totalDay / totalDayAll) * 100).toFixed(1) : '0.0'}%
                          </td>

                          {/* So TB 30 Ngày (Z-Score) */}
                          <td className={`px-2.5 py-2 text-right font-bold tabular-nums whitespace-nowrap ${item.diffVsAvg >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {item.itemAvgPerDay > 0 ? (
                              <button
                                type="button"
                                onClick={() => setSelectedBenchmarkingItem(triage)}
                                className="hover:underline cursor-pointer inline-flex flex-col items-end leading-tight ml-auto"
                                title="Bấm để xem phân tích độ lệch chuẩn chi tiết"
                              >
                                <span className="text-sm font-extrabold">
                                  {item.diffVsAvg >= 0 ? '+' : ''}{item.diffVsAvg.toFixed(1)} ({item.diffPct >= 0 ? '+' : ''}{item.diffPct.toFixed(0)}%)
                                </span>
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                                  Z-Score: {triage.zScore > 0 ? `+${triage.zScore}` : triage.zScore}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-normal">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
              {catGrouped.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-200/90 dark:bg-slate-800 font-black text-slate-950 dark:text-slate-100 border-t-2 border-slate-300 dark:border-slate-600 text-[15px]">
                    <td colSpan={5} className="px-3 py-3 uppercase tracking-wide border-r border-slate-300 dark:border-slate-600">
                      🏆 TỔNG CỘNG TOÀN KHOA NGÀY {selectedReportDay} - {selectedReportMonth.toUpperCase()}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums text-indigo-900 dark:text-indigo-200 border-r border-slate-300 dark:border-slate-600">
                      {totalDayBH.toLocaleString()}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-600">
                      {totalDayND.toLocaleString()}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums text-blue-950 dark:text-blue-100 bg-blue-200/80 dark:bg-blue-900/70 border-r border-blue-300 dark:border-blue-700">
                      {totalDayAll.toLocaleString()}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums border-r border-slate-300 dark:border-slate-600">
                      {totalDayAll > 0 ? '100.0%' : '0.0%'}
                    </td>
                    <td className={`px-2.5 py-3 text-right tabular-nums whitespace-nowrap ${totalDiffVsAvg >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {totalDiffVsAvg >= 0 ? '+' : ''}{totalDiffVsAvg.toFixed(1)} ({totalDiffPct >= 0 ? '+' : ''}{totalDiffPct.toFixed(1)}%)
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Chart: Top Performed Services on this Selected Day */}
        {topServices.length > 0 && (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-3">
            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" /> TOP KỸ THUẬT THỰC HIỆN NHIỀU NHẤT TRONG NGÀY {selectedReportDay}
            </h4>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topServices} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" fontSize={11} stroke="#64748b" />
                  <YAxis dataKey="name" type="category" fontSize={11} stroke="#64748b" width={180} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="bhVal" name="Ca Bảo Hiểm (BH)" fill="#4f46e5" radius={[0, 4, 4, 0]} stackId="a" />
                  <Bar dataKey="ndVal" name="Ca Nhân Dân (ND)" fill="#10b981" radius={[0, 4, 4, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    );
  };

  // SMART WEEKLY REPORT RENDERER (YEAR-BASED WEEKS 1..52)
  const renderWeeklyReport = () => {
    const currWeekInfo = getWeekDateRange(selectedReportWeek, selectedYear);
    const prevWeekInfo = selectedReportWeek > 1 ? getWeekDateRange(selectedReportWeek - 1, selectedYear) : null;

    // Collect dates for current week
    const weekDates: Date[] = [];
    let curDate = new Date(currWeekInfo.startDate);
    while (curDate <= currWeekInfo.endDate) {
      weekDates.push(new Date(curDate));
      curDate.setDate(curDate.getDate() + 1);
    }

    // Collect dates for previous week
    const prevWeekDates: Date[] = [];
    if (prevWeekInfo) {
      let pCur = new Date(prevWeekInfo.startDate);
      while (pCur <= prevWeekInfo.endDate) {
        prevWeekDates.push(new Date(pCur));
        pCur.setDate(pCur.getDate() + 1);
      }
    }

    // Daily breakdown for chart
    const dailyBreakdown: { dayLabel: string; bh: number; nd: number; total: number }[] = [];
    for (const date of weekDates) {
      const mNum = date.getMonth() + 1;
      const mKey = `Tháng ${mNum}`;
      const dayNum = date.getDate();
      const dayLabel = `${dayNum}/${mNum}`;

      const monthItems = monthlyDataStore[mKey] || (mKey === selectedReportMonth ? caseReports : []);

      let dayBH = 0;
      let dayND = 0;

      for (const item of monthItems) {
        const dayData = item.dailyData ? item.dailyData[dayNum] : undefined;
        if (dayData) {
          if (typeof dayData.bh === 'number') dayBH += dayData.bh;
          if (typeof dayData.nd === 'number') dayND += dayData.nd;
        }
      }

      dailyBreakdown.push({
        dayLabel,
        bh: dayBH,
        nd: dayND,
        total: dayBH + dayND
      });
    }

    // Calculate per-item statistics across the week dates
    let totalWeekBH = 0;
    let totalWeekND = 0;
    let prevWeekTotal = 0;

    const masterItems = caseReports;

    const weekItemStats = masterItems.map(item => {
      let itemWeekBH = 0;
      let itemWeekND = 0;

      for (const date of weekDates) {
        const mNum = date.getMonth() + 1;
        const mKey = `Tháng ${mNum}`;
        const dayNum = date.getDate();

        const monthItems = monthlyDataStore[mKey] || (mKey === selectedReportMonth ? caseReports : []);
        const foundItem = monthItems.find(i => i.id === item.id || i.name === item.name);

        if (foundItem && foundItem.dailyData && foundItem.dailyData[dayNum]) {
          const dData = foundItem.dailyData[dayNum];
          if (typeof dData.bh === 'number') itemWeekBH += dData.bh;
          if (typeof dData.nd === 'number') itemWeekND += dData.nd;
        }
      }

      let itemPrevWeekTotal = 0;
      for (const pDate of prevWeekDates) {
        const mNum = pDate.getMonth() + 1;
        const mKey = `Tháng ${mNum}`;
        const dayNum = pDate.getDate();

        const monthItems = monthlyDataStore[mKey] || (mKey === selectedReportMonth ? caseReports : []);
        const foundItem = monthItems.find(i => i.id === item.id || i.name === item.name);

        if (foundItem && foundItem.dailyData && foundItem.dailyData[dayNum]) {
          const dData = foundItem.dailyData[dayNum];
          const bh = typeof dData.bh === 'number' ? dData.bh : 0;
          const nd = typeof dData.nd === 'number' ? dData.nd : 0;
          itemPrevWeekTotal += bh + nd;
        }
      }

      const itemWeekTotal = itemWeekBH + itemWeekND;
      totalWeekBH += itemWeekBH;
      totalWeekND += itemWeekND;
      prevWeekTotal += itemPrevWeekTotal;

      const activeDaysInWeek = weekDates.length;
      const avgPerDayInWeek = activeDaysInWeek > 0 ? itemWeekTotal / activeDaysInWeek : 0;
      const weekDiffPct = itemPrevWeekTotal > 0 ? ((itemWeekTotal - itemPrevWeekTotal) / itemPrevWeekTotal) * 100 : 0;

      return {
        ...item,
        itemWeekBH,
        itemWeekND,
        itemWeekTotal,
        avgPerDayInWeek,
        itemPrevWeekTotal,
        weekDiffPct
      };
    });

    const totalWeekAll = totalWeekBH + totalWeekND;
    const weekActiveDays = weekDates.length;
    const overallWeekAvgPerDay = weekActiveDays > 0 ? totalWeekAll / weekActiveDays : 0;
    const overallWeekGrowthPct = prevWeekTotal > 0 ? ((totalWeekAll - prevWeekTotal) / prevWeekTotal) * 100 : 0;

    const catGroupedWeek = categories.filter(c => c !== 'Tất cả').map(cat => {
      const items = weekItemStats.filter(i => i.category === cat);
      const catBH = items.reduce((a, b) => a + b.itemWeekBH, 0);
      const catND = items.reduce((a, b) => a + b.itemWeekND, 0);
      const catTotal = catBH + catND;
      return { category: cat, items, catBH, catND, catTotal };
    }).filter(g => g.items.length > 0);

    return (
      <div className="space-y-6">
        {/* Controls Header */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center font-bold shadow-2xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                BÁO CÁO CÔNG TÁC TUẦN
                <span className="px-2.5 py-0.5 text-xs font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-full border border-indigo-300 dark:border-indigo-700">
                  Tuần {selectedReportWeek} ({currWeekInfo.dateRangeLabel}) - Năm {selectedYear}
                </span>
              </h3>
              <p className="text-xs text-slate-500">Tổng hợp lượt ca theo tuần trong năm (Từ Tuần 1 đến Tuần 52)</p>
            </div>
          </div>
        </div>

        {/* Weekly Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Ca Cả Tuần</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-indigo-900 dark:text-indigo-200">{totalWeekAll.toLocaleString()} ca</h4>
              <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{currWeekInfo.name}</span>
            </div>
            <p className="text-xs text-slate-500">Tổng số lượt thực hiện trong 7 ngày</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trung Bình / Ngày Tuần</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-blue-700 dark:text-blue-400">{overallWeekAvgPerDay.toFixed(1)} ca/ngày</h4>
              <span className="text-xs font-bold text-slate-400">{weekActiveDays} ngày</span>
            </div>
            <p className="text-xs text-slate-500">Công suất trung bình mỗi ngày trong tuần</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tỷ Lệ BHYT Tuần</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{totalWeekBH.toLocaleString()} ca</h4>
              <span className="text-xs font-extrabold text-emerald-600">
                {totalWeekAll > 0 ? ((totalWeekBH / totalWeekAll) * 100).toFixed(1) : '0'}%
              </span>
            </div>
            <p className="text-xs text-slate-500">So với {totalWeekND.toLocaleString()} ca Nhân dân</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">So Với Tuần Trước</span>
            <div className="flex items-baseline justify-between">
              <h4 className={`text-2xl font-black ${overallWeekGrowthPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {prevWeekTotal > 0 ? `${overallWeekGrowthPct >= 0 ? '+' : ''}${overallWeekGrowthPct.toFixed(1)}%` : 'N/A'}
              </h4>
              <span className="text-xs font-bold text-slate-400">vs Tuần {selectedReportWeek - 1 > 0 ? selectedReportWeek - 1 : 'trước'}</span>
            </div>
            <p className="text-xs text-slate-500">Chênh lệch so với tuần liền trước</p>
          </div>
        </div>

        {/* Daily Breakdown Chart for selected week */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-3">
          <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" /> DIỄN BIẾN SỐ CA THEO TỪNG NGÀY TRONG {currWeekInfo.name.toUpperCase()}
          </h4>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dayLabel" fontSize={11} stroke="#64748b" />
                <YAxis fontSize={11} stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="bh" name="Ca Bảo Hiểm (BH)" fill="#4f46e5" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="nd" name="Ca Nhân Dân (ND)" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Weekly Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="bg-slate-100/80 dark:bg-slate-800/90 px-5 py-4 border-b-[1.5px] border-slate-300 dark:border-slate-700 flex items-center justify-between">
            <h4 className="text-base font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              BẢNG TỔNG HỢP SỐ CA CÔNG TÁC {currWeekInfo.name.toUpperCase()}
            </h4>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[13px] font-extrabold leading-tight border-b-2 border-slate-400 dark:border-slate-500">
                  <th className="px-1.5 py-2.5 w-11 text-center border-r border-slate-300 dark:border-slate-600">STT</th>
                  <th className="px-2.5 py-2.5 w-[92px] border-r border-slate-300 dark:border-slate-600">Bộ<br />Phận</th>
                  <th className="px-3 py-2.5 min-w-[180px] border-r border-slate-300 dark:border-slate-600">Kỹ Thuật /<br />Dịch Vụ</th>
                  <th className="px-2.5 py-2.5 w-[76px] text-right border-r border-slate-300 dark:border-slate-600">BH<br />Tuần</th>
                  <th className="px-2.5 py-2.5 w-[76px] text-right border-r border-slate-300 dark:border-slate-600">ND<br />Tuần</th>
                  <th className="px-2.5 py-2.5 w-[80px] text-right bg-indigo-100/80 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-100 border-r border-indigo-300 dark:border-indigo-700">Tổng<br />Tuần</th>
                  <th className="px-2.5 py-2.5 w-[80px] text-right border-r border-slate-300 dark:border-slate-600">TB/Ngày<br />Tuần</th>
                  <th className="px-2.5 py-2.5 w-[86px] text-right">So Tuần<br />Trước</th>
                </tr>
              </thead>
              <tbody>
                {catGroupedWeek.map((group) => (
                  <React.Fragment key={group.category}>
                    <tr className="bg-indigo-50/90 dark:bg-slate-800/95 font-black text-indigo-950 dark:text-indigo-200 border-y border-slate-400/80 dark:border-slate-600 text-sm">
                      <td colSpan={3} className="px-3 py-2.5 uppercase tracking-wide border-r border-slate-300 dark:border-slate-600">
                        📌 {group.category}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-extrabold tabular-nums text-[15px] border-r border-slate-300 dark:border-slate-600">
                        {group.catBH.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-extrabold tabular-nums text-[15px] border-r border-slate-300 dark:border-slate-600">
                        {group.catND.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-black tabular-nums text-[15px] text-indigo-950 dark:text-indigo-100 bg-indigo-100/80 dark:bg-indigo-950/70 border-r border-indigo-300 dark:border-indigo-700">
                        {group.catTotal.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-extrabold tabular-nums border-r border-slate-300 dark:border-slate-600">
                        {(group.catTotal / weekActiveDays).toFixed(1)}
                      </td>
                      <td className="px-2.5 py-2.5 text-right text-slate-400 font-semibold">-</td>
                    </tr>
                    {group.items.map((item, itemIdx) => (
                      <tr key={`${item.id}-${itemIdx}`} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-800/35 hover:bg-indigo-50/60 dark:hover:bg-slate-800/75 border-b border-slate-300 dark:border-slate-700 transition-colors">
                        <td className="px-1.5 py-2.5 text-center text-slate-500 dark:text-slate-400 font-bold tabular-nums border-r border-slate-300 dark:border-slate-700">{itemIdx + 1}</td>
                        <td className="px-2.5 py-2.5 font-medium text-slate-600 dark:text-slate-300 leading-snug border-r border-slate-300 dark:border-slate-700">{item.category}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100 leading-snug border-r border-slate-300 dark:border-slate-700">{item.name}</td>
                        <td className="px-2.5 py-2.5 text-right font-bold text-[15px] tabular-nums text-indigo-700 dark:text-indigo-300 border-r border-slate-300 dark:border-slate-700">{item.itemWeekBH ? item.itemWeekBH.toLocaleString() : '-'}</td>
                        <td className="px-2.5 py-2.5 text-right font-bold text-[15px] tabular-nums text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-700">{item.itemWeekND ? item.itemWeekND.toLocaleString() : '-'}</td>
                        <td className="px-2.5 py-2.5 text-right font-black text-[15px] tabular-nums text-indigo-950 dark:text-indigo-100 bg-indigo-50/70 dark:bg-indigo-950/35 border-r border-indigo-300 dark:border-indigo-700">{item.itemWeekTotal.toLocaleString()}</td>
                        <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700">{item.avgPerDayInWeek.toFixed(1)}</td>
                        <td className={`px-2.5 py-2.5 text-right font-extrabold tabular-nums ${item.weekDiffPct >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {item.itemPrevWeekTotal > 0 ? `${item.weekDiffPct >= 0 ? '+' : ''}${item.weekDiffPct.toFixed(0)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              {catGroupedWeek.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-200/90 dark:bg-slate-800 font-black text-slate-950 dark:text-slate-100 border-t-2 border-slate-300 dark:border-slate-600 text-[15px]">
                    <td colSpan={3} className="px-3 py-3 uppercase tracking-wide border-r border-slate-300 dark:border-slate-600">
                      🏆 TỔNG CỘNG TUẦN {selectedReportWeek}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums text-indigo-900 dark:text-indigo-200 border-r border-slate-300 dark:border-slate-600">
                      {totalWeekBH.toLocaleString()}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-600">
                      {totalWeekND.toLocaleString()}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums text-indigo-950 dark:text-indigo-100 bg-indigo-200/80 dark:bg-indigo-900/70 border-r border-indigo-300 dark:border-indigo-700">
                      {totalWeekAll.toLocaleString()}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums border-r border-slate-300 dark:border-slate-600">
                      {overallWeekAvgPerDay.toFixed(1)}
                    </td>
                    <td className={`px-2.5 py-3 text-right tabular-nums ${overallWeekGrowthPct >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {prevWeekTotal > 0 ? `${overallWeekGrowthPct >= 0 ? '+' : ''}${overallWeekGrowthPct.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };

  // SMART ANNUAL REPORT RENDERER
  const renderAnnualReport = () => {
    const allMonths = ALL_MONTHS;
    const storedMonths = allMonths.filter(m => monthlyDataStore[m] && monthlyDataStore[m].length > 0);
    const actualMonths = storedMonths.length > 0 ? storedMonths : ['Tháng 2'];
    const actualMonthsSet = new Set(actualMonths);
    const actualLabelRange = actualMonths.length > 0
      ? actualMonths.map(m => m.replace('Tháng ', 'T')).join(', ')
      : 'T2';

    // 1. Build a master deduplicated list of unique services across all synced monthly stores
    const serviceMap = new Map<string, { category: string; name: string }>();

    const allSourceItems = [
      ...allMonths.flatMap(m => monthlyDataStore[m] || []),
      ...caseReports
    ];

    allSourceItems.forEach(item => {
      if (!isValidServiceName(item.name)) return;
      const cat = item.category ? item.category.trim() : 'Siêu Âm';
      const name = item.name.trim();
      const key = `${cat}___${name}`;
      if (!serviceMap.has(key)) {
        serviceMap.set(key, { category: cat, name });
      }
    });

    const masterServices = Array.from(serviceMap.values());

    // Seasonal coefficients for projected months without actual data yet
    const seasonalFactors: { [m: string]: number } = {
      'Tháng 1': 0.98,
      'Tháng 2': 0.95,
      'Tháng 3': 1.0,
      'Tháng 4': 1.02,
      'Tháng 5': 1.05,
      'Tháng 6': 1.03,
      'Tháng 7': 1.06,
      'Tháng 8': 1.08,
      'Tháng 9': 1.04,
      'Tháng 10': 1.07,
      'Tháng 11': 1.05,
      'Tháng 12': 1.12
    };

    // Calculate per-service stats for 12 months
    const annualItemStats = masterServices.map((srv, idx) => {
      const monthlyValues: { [m: string]: { count: number; isActual: boolean } } = {};

      let actualSum = 0;
      let actualMonthCount = 0;

      // Calculate actual recorded months (across all synced months from T1 to T12)
      actualMonths.forEach(m => {
        const storeForM = monthlyDataStore[m];
        if (storeForM && storeForM.length > 0) {
          const matchedItem = storeForM.find(i => i.name.trim().toLowerCase() === srv.name.toLowerCase() && i.category.trim().toLowerCase() === srv.category.toLowerCase());
          const val = matchedItem ? getRowTotal(matchedItem) : 0;
          monthlyValues[m] = { count: val, isActual: true };
          actualSum += val;
          actualMonthCount++;
        } else if (m === 'Tháng 2' && selectedYear === 2026 && caseReports.length > 0) {
          const matchedItem = caseReports.find(i => i.name.trim().toLowerCase() === srv.name.toLowerCase() && i.category.trim().toLowerCase() === srv.category.toLowerCase());
          const val = matchedItem ? getRowTotal(matchedItem) : 0;
          monthlyValues[m] = { count: val, isActual: true };
          actualSum += val;
          actualMonthCount++;
        } else {
          monthlyValues[m] = { count: 0, isActual: false };
        }
      });

      const actualAvgPerMonth = actualMonthCount > 0 ? actualSum / actualMonthCount : 0;

      // Calculate projected months for remaining unsynced months only
      let projectedSum = 0;
      allMonths.forEach(m => {
        if (actualMonthsSet.has(m)) return;
        const factor = seasonalFactors[m] || 1.0;
        const projVal = Math.round(actualAvgPerMonth * factor);
        monthlyValues[m] = { count: projVal, isActual: false };
        projectedSum += projVal;
      });

      const fullYearTotal = actualSum + projectedSum;
      const fullYearAvg = fullYearTotal / 12;

      return {
        id: `srv-${idx}-${srv.name}`,
        category: srv.category,
        name: srv.name,
        monthlyValues,
        actualSum,
        fullYearTotal,
        actualAvgPerMonth,
        fullYearAvg
      };
    });

    // Monthly totals across ALL services for each month
    const monthlyTotals: { [m: string]: { count: number; isActual: boolean } } = {};
    allMonths.forEach(m => {
      const isAct = actualMonthsSet.has(m);
      const totalCount = annualItemStats.reduce((acc, item) => acc + (item.monthlyValues[m]?.count || 0), 0);
      monthlyTotals[m] = { count: totalCount, isActual: isAct };
    });

    const displayedColumns = annualViewMode === 'full' ? allMonths : actualMonths;
    const grandActualTotal = actualMonths.reduce((acc, m) => acc + (monthlyTotals[m]?.count || 0), 0);
    const grandFullYearTotal = allMonths.reduce((acc, m) => acc + (monthlyTotals[m]?.count || 0), 0);
    const actualMonthlyAverage = actualMonths.length > 0 ? grandActualTotal / actualMonths.length : 0;

    // Peak month among actual months
    let peakActualMonth = actualMonths[0] || 'Tháng 2';
    let peakActualVal = 0;
    actualMonths.forEach(m => {
      const cnt = monthlyTotals[m]?.count || 0;
      if (cnt > peakActualVal) {
        peakActualVal = cnt;
        peakActualMonth = m;
      }
    });

    // Chart dataset
    const monthlyChartData = allMonths.map(m => ({
      month: m.replace('Tháng ', 'T'),
      ThucTe: monthlyTotals[m]?.isActual ? monthlyTotals[m].count : null,
      DuBao: !monthlyTotals[m]?.isActual ? monthlyTotals[m].count : null,
      total: monthlyTotals[m]?.count || 0
    }));

    // Grouping by category
    const categoryList = Array.from(new Set(masterServices.map(s => s.category)));
    const catGroupedAnnual = categoryList.map(cat => {
      const items = annualItemStats.filter(i => i.category === cat);
      const monthCatTotals: { [m: string]: number } = {};
      allMonths.forEach(m => {
        monthCatTotals[m] = items.reduce((acc, i) => acc + (i.monthlyValues[m]?.count || 0), 0);
      });
      const catActualTotal = items.reduce((acc, i) => acc + i.actualSum, 0);
      const catYearTotal = items.reduce((acc, i) => acc + i.fullYearTotal, 0);
      return { category: cat, items, monthCatTotals, catActualTotal, catYearTotal };
    }).filter(g => g.items.length > 0);

    return (
      <div className="space-y-6">
        {/* Controls Header */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center justify-center font-bold shadow-2xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                BÁO CÁO NĂM CÔNG TÁC CHẨN ĐOÁN HÌNH ẢNH {selectedYear}
                <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-black bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded-full border border-purple-300 dark:border-purple-700">
                  Chuẩn hóa 12 tháng
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Tích hợp dữ liệu thực tế ({actualMonths.join(', ')}) & Dự báo kế hoạch các tháng chưa có dữ liệu
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                openResyncModalWithOptions({
                  year: selectedYear,
                  startDate: `${selectedYear}-01-01`,
                  endDate: `${selectedYear}-12-31`
                })
              }
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-800 dark:text-amber-200 rounded-xl text-xs font-bold border border-amber-300 dark:border-amber-700 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Rà soát số liệu ({selectedYear})</span>
            </button>

            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">
              <button
                onClick={() => setAnnualViewMode('full')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${annualViewMode === 'full' ? 'bg-purple-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
              >
                Cả Năm (Thực Tế + Dự Báo)
              </button>
              <button
                onClick={() => setAnnualViewMode('actual_only')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${annualViewMode === 'actual_only' ? 'bg-purple-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
              >
                Chỉ {actualMonths.length} Tháng Thực Tế ({actualLabelRange})
              </button>
            </div>
          </div>
        </div>

        {/* Annual KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Lượt Ca Thực Tế ({actualLabelRange})</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-blue-900 dark:text-blue-200">{grandActualTotal.toLocaleString()} ca</h4>
              <span className="text-xs font-extrabold text-blue-700 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">{actualMonths.length} Tháng Có Dữ Liệu</span>
            </div>
            <p className="text-xs text-slate-500">Số ca thực tế trích xuất từ Google Sheet</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Hợp Cả Năm {selectedYear}</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-purple-900 dark:text-purple-200">{grandFullYearTotal.toLocaleString()} ca</h4>
              <span className="text-xs font-extrabold text-purple-700 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded-full">12 Tháng Kế Hoạch</span>
            </div>
            <p className="text-xs text-slate-500">Gồm {actualMonths.length} tháng thực tế & {12 - actualMonths.length} tháng dự báo</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tháng Cao Điểm Nhất (Thực Tế)</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{peakActualMonth}</h4>
              <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">{peakActualVal.toLocaleString()} ca</span>
            </div>
            <p className="text-xs text-slate-500">Tháng có khối lượng công việc lớn nhất</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Công Suất TB / Tháng Thực Tế</span>
            <div className="flex items-baseline justify-between">
              <h4 className="text-2xl font-black text-indigo-700 dark:text-indigo-400">{Math.round(actualMonthlyAverage).toLocaleString()} ca/tháng</h4>
            </div>
            <p className="text-xs text-slate-500">Mức công suất trung bình thực hiện</p>
          </div>
        </div>

        {/* Annual Month-by-Month Trend Chart */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-600" /> BIỂU ĐỒ DIỄN BIẾN SỐ CA 12 THÁNG TRONG NĂM {selectedYear}
            </h4>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1 text-blue-700 dark:text-blue-300">
                <span className="w-3 h-3 bg-blue-600 rounded-xs"></span> Số liệu Thực tế ({actualLabelRange})
              </span>
              {actualMonths.length < 12 && (
                <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                  <span className="w-3 h-3 bg-purple-400 rounded-xs opacity-60"></span> Dự báo kế hoạch (Các tháng còn lại)
                </span>
              )}
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" fontSize={11} stroke="#64748b" />
                <YAxis fontSize={11} stroke="#64748b" />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    `${value ? Number(value).toLocaleString() : 0} ca`,
                    name === 'ThucTe' ? 'Số ca Thực tế' : name === 'DuBao' ? 'Số ca Dự báo' : 'Tổng ca'
                  ]}
                />
                <Bar dataKey="ThucTe" name="Thực tế" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="DuBao" name="Dự báo" fill="#a855f7" radius={[4, 4, 0, 0]} opacity={0.65} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Annual Matrix Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="bg-slate-100/80 dark:bg-slate-800/90 px-5 py-4 border-b-[1.5px] border-slate-300 dark:border-slate-700 flex items-center justify-between">
            <h4 className="text-base font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              MA TRẬN SỐ LIỆU TỔNG HỢP CÔNG TÁC {annualViewMode === 'full' ? `12 THÁNG NĂM ${selectedYear}` : `${actualMonths.length} THÁNG THỰC TẾ (${actualLabelRange})`}
            </h4>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Tổng số kỹ thuật: {masterServices.length} dịch vụ
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse min-w-[920px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[13px] font-extrabold leading-tight border-b-2 border-slate-400 dark:border-slate-500">
                  <th className="px-1.5 py-2.5 w-10 text-center border-r border-slate-300 dark:border-slate-600">STT</th>
                  <th className="px-3 py-2.5 min-w-[180px] border-r border-slate-300 dark:border-slate-600">Kỹ Thuật /<br />Dịch Vụ</th>

                  {displayedColumns.map(m => {
                    const isAct = actualMonthsSet.has(m);
                    return (
                      <th
                        key={m}
                        className={
                          isAct
                            ? 'px-1.5 py-2.5 text-right bg-blue-100/80 dark:bg-blue-950/70 text-blue-950 dark:text-blue-200 border-r border-blue-300 dark:border-blue-700 font-black min-w-[56px]'
                            : 'px-1.5 py-2.5 text-right text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-600 min-w-[52px] font-bold'
                        }
                      >
                        {m.replace('Tháng ', 'T')}<br/>
                        <span className={isAct ? 'text-[10px] font-bold text-blue-700 dark:text-blue-400' : 'text-[10px] font-normal text-slate-500'}>
                          {isAct ? 'Thực tế' : 'Dự báo'}
                        </span>
                      </th>
                    );
                  })}

                  <th className="px-2 py-2.5 text-right bg-blue-100 dark:bg-blue-950 text-blue-950 dark:text-blue-100 border-r border-blue-300 dark:border-blue-700 font-black w-[82px]">
                    Tổng {actualMonths.length}T<br />Thực Tế
                  </th>

                  {annualViewMode === 'full' && (
                    <th className="px-2 py-2.5 text-right bg-purple-100 dark:bg-purple-950 text-purple-950 dark:text-purple-100 border-r border-purple-300 dark:border-purple-700 font-black w-[78px]">
                      Dự Báo<br />Cả Năm
                    </th>
                  )}

                  <th className="px-2 py-2.5 text-right w-[68px] font-extrabold">
                    TB /<br />Tháng
                  </th>
                </tr>
              </thead>
              <tbody>
                {catGroupedAnnual.map((group) => (
                  <React.Fragment key={group.category}>
                    <tr className="bg-indigo-50/90 dark:bg-slate-800/95 font-black text-purple-950 dark:text-purple-200 border-y border-slate-400/80 dark:border-slate-600 text-sm">
                      <td colSpan={2} className="px-3 py-2.5 uppercase tracking-wide border-r border-slate-300 dark:border-slate-600">
                        📌 {group.category} ({group.items.length} kỹ thuật)
                      </td>
                      {displayedColumns.map(m => {
                        const isAct = actualMonthsSet.has(m);
                        return (
                          <td
                            key={m}
                            className={
                              isAct
                                ? 'px-1.5 text-right py-2.5 font-black tabular-nums bg-blue-100/50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 border-r border-blue-300 dark:border-blue-700'
                                : 'px-1.5 text-right py-2.5 font-bold tabular-nums text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-600'
                            }
                          >
                            {group.monthCatTotals[m] ? group.monthCatTotals[m].toLocaleString() : 0}
                          </td>
                        );
                      })}
                      <td className="px-2 text-right py-2.5 font-black tabular-nums bg-blue-100/80 dark:bg-blue-950/70 text-blue-950 dark:text-blue-100 border-r border-blue-300 dark:border-blue-700">
                        {group.catActualTotal.toLocaleString()}
                      </td>
                      {annualViewMode === 'full' && (
                        <td className="px-2 text-right py-2.5 font-black tabular-nums bg-purple-100/80 dark:bg-purple-950/70 text-purple-950 dark:text-purple-100 border-r border-purple-300 dark:border-purple-700">
                          {group.catYearTotal.toLocaleString()}
                        </td>
                      )}
                      <td className="px-2 text-right py-2.5 font-bold tabular-nums text-slate-800 dark:text-slate-200">
                        {Math.round(annualViewMode === 'full' ? group.catYearTotal / 12 : group.catActualTotal / (actualMonths.length || 1)).toLocaleString()}
                      </td>
                    </tr>

                    {group.items.map((item, itemIdx) => (
                      <tr key={`${item.id}-${itemIdx}`} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-800/35 hover:bg-blue-50/70 dark:hover:bg-slate-800/75 border-b border-slate-300 dark:border-slate-700 transition-colors">
                        <td className="px-1.5 py-2.5 text-center text-slate-500 dark:text-slate-400 font-bold tabular-nums border-r border-slate-300 dark:border-slate-700">{itemIdx + 1}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100 leading-snug border-r border-slate-300 dark:border-slate-700">{item.name}</td>

                        {displayedColumns.map(m => {
                          const isAct = actualMonthsSet.has(m);
                          const val = item.monthlyValues[m]?.count || 0;
                          return (
                            <td
                              key={m}
                              className={
                                isAct
                                  ? 'px-1.5 py-2.5 text-right font-extrabold tabular-nums text-blue-900 dark:text-blue-300 bg-blue-50/40 dark:bg-blue-950/20 border-r border-blue-300/80 dark:border-blue-800'
                                  : 'px-1.5 py-2.5 text-right font-medium tabular-nums text-slate-600 dark:text-slate-400 border-r border-slate-300 dark:border-slate-700'
                              }
                            >
                              {val > 0 ? val.toLocaleString() : '-'}
                            </td>
                          );
                        })}

                        <td className="px-2 py-2.5 text-right font-black tabular-nums text-blue-950 dark:text-blue-100 bg-blue-50/70 dark:bg-blue-950/40 border-r border-blue-300 dark:border-blue-700">
                          {item.actualSum.toLocaleString()}
                        </td>

                        {annualViewMode === 'full' && (
                          <td className="px-2 py-2.5 text-right font-black tabular-nums text-purple-950 dark:text-purple-100 bg-purple-50/70 dark:bg-purple-950/40 border-r border-purple-300 dark:border-purple-700">
                            {item.fullYearTotal.toLocaleString()}
                          </td>
                        )}

                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          {Math.round(annualViewMode === 'full' ? item.fullYearAvg : item.actualAvgPerMonth).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}

                {/* Grand Total Row */}
                <tr className="bg-slate-200/95 dark:bg-slate-800 font-black text-slate-950 dark:text-slate-100 border-t-2 border-slate-400 dark:border-slate-500 text-[15px] uppercase">
                  <td colSpan={2} className="px-3 py-3 font-black text-indigo-950 dark:text-indigo-200 border-r border-slate-300 dark:border-slate-600">
                    🏆 TỔNG CỘNG TOÀN KHOA
                  </td>
                  {displayedColumns.map(m => {
                    const isAct = actualMonthsSet.has(m);
                    return (
                      <td
                        key={m}
                        className={
                          isAct
                            ? 'px-1.5 text-right py-3 font-black tabular-nums text-blue-950 dark:text-blue-100 bg-blue-200/70 dark:bg-blue-950/80 border-r border-blue-300 dark:border-blue-800'
                            : 'px-1.5 text-right py-3 font-black tabular-nums text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-600'
                        }
                      >
                        {(monthlyTotals[m]?.count || 0).toLocaleString()}
                      </td>
                    );
                  })}
                  <td className="px-2 text-right py-3 font-black tabular-nums text-blue-950 dark:text-blue-100 bg-blue-300/70 dark:bg-blue-900/80 border-r border-blue-300 dark:border-blue-700">
                    {grandActualTotal.toLocaleString()}
                  </td>
                  {annualViewMode === 'full' && (
                    <td className="px-2 text-right py-3 font-black tabular-nums text-purple-950 dark:text-purple-100 bg-purple-300/70 dark:bg-purple-900/80 border-r border-purple-300 dark:border-purple-700">
                      {grandFullYearTotal.toLocaleString()}
                    </td>
                  )}
                  <td className="px-2 text-right py-3 font-black tabular-nums text-slate-950 dark:text-slate-100">
                    {Math.round(annualViewMode === 'full' ? grandFullYearTotal / 12 : actualMonthlyAverage).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Manual cell editing logic (persists directly to year-scoped immutable system archive)
  const handleSaveCell = () => {
    if (!editingCell) return;
    const rawClean = editValue.trim().toUpperCase();
    const parsedVal: number | string =
      rawClean === 'LT' ? 'LT' : (parseInt(rawClean.replace(/[^0-9]/g, ''), 10) || 0);
    const activeMonthKey = sheetTab.startsWith('Tháng') ? sheetTab : selectedReportMonth;
    const editorName = storageService.getCurrentUser().name;

    const updatedList = caseReports.map(item => {
      if (item.id === editingCell.itemId) {
        const currentDayData = item.dailyData[editingCell.day] || { bh: 0, nd: 0 };
        return {
          ...item,
          dailyData: {
            ...item.dailyData,
            [editingCell.day]: {
              ...currentDayData,
              [editingCell.type]: parsedVal
            }
          }
        };
      }
      return item;
    });

    const lockedList = reportArchiveService.saveManualDayUpdates(
      selectedYear,
      activeMonthKey,
      updatedList,
      [editingCell.day],
      editorName
    );
    setCaseReports(lockedList);
    setMonthlyDataStore(prev => ({ ...prev, [activeMonthKey]: lockedList }));
    setSyncToast(
      `🔒 Đã chỉnh sửa thủ công & khóa bảo vệ Ngày ${editingCell.day} - ${activeMonthKey}/${selectedYear} trên hệ thống.`
    );
    setTimeout(() => setSyncToast(null), 3500);
    setEditingCell(null);
    setEditValue('');
  };

  // Charts Data derived from caseReports
  const equipmentUsageData = [
    { name: 'Siêu âm', cases: caseReports.filter(i => i.category === 'Siêu Âm').reduce((acc, i) => acc + getRowTotal(i), 0), color: '#8b5cf6' },
    { name: 'Nội soi', cases: caseReports.filter(i => i.category === 'Nội Soi').reduce((acc, i) => acc + getRowTotal(i), 0), color: '#f59e0b' },
    { name: 'X-quang KTS', cases: caseReports.filter(i => i.category === 'X quang').reduce((acc, i) => acc + getRowTotal(i), 0), color: '#10b981' },
    { name: 'Điện tim & LHN', cases: caseReports.filter(i => i.category === 'Điện tim & LHN').reduce((acc, i) => acc + getRowTotal(i), 0), color: '#ec4899' },
    { name: 'Xét nghiệm', cases: caseReports.filter(i => i.category === 'Xét nghiệm').reduce((acc, i) => acc + getRowTotal(i), 0), color: '#06b6d4' },
  ];

  const taskCompletionData = [
    { week: 'Tuần 27', completed: 28, pending: 4, rate: 87.5 },
    { week: 'Tuần 28', completed: 32, pending: 3, rate: 91.4 },
    { week: 'Tuần 29', completed: 35, pending: 2, rate: 94.5 },
    { week: 'Tuần 30', completed: 40, pending: 1, rate: 97.5 },
  ];

  const shiftCountData = [
    { name: 'TS. BS. Thành', shifts: 12, nightShifts: 3 },
    { name: 'ThS. BS. Nam', shifts: 14, nightShifts: 4 },
    { name: 'CN. Hương', shifts: 16, nightShifts: 5 },
    { name: 'KTV. Hải', shifts: 18, nightShifts: 6 },
    { name: 'BS. Hà', shifts: 15, nightShifts: 4 },
  ];

  const maintenanceCostData = [
    { month: 'Tháng 3', cost: 12.5, repairs: 1 },
    { month: 'Tháng 4', cost: 8.2, repairs: 2 },
    { month: 'Tháng 5', cost: 18.5, repairs: 1 },
    { month: 'Tháng 6', cost: 5.0, repairs: 0 },
    { month: 'Tháng 7', cost: 14.0, repairs: 1 },
  ];

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    if (sheetTab === 'Báo cáo ngày') {
      const monthItems = monthlyDataStore[selectedReportMonth] || (selectedReportMonth === 'Tháng 2' && selectedYear === 2026 ? caseReports : []);
      const activeDays = getActiveWorkDaysForMonth(selectedReportMonth, monthItems);

      const dailyRows = monthItems.map(item => {
        const dayData = item.dailyData[selectedReportDay] || { bh: 0, nd: 0 };
        const bhVal = dayData.bh === 'LT' ? 'LT' : (typeof dayData.bh === 'number' ? dayData.bh : 0);
        const ndVal = dayData.nd === 'LT' ? 'LT' : (typeof dayData.nd === 'number' ? dayData.nd : 0);
        const bhNum = typeof bhVal === 'number' ? bhVal : 0;
        const ndNum = typeof ndVal === 'number' ? ndVal : 0;
        const totalDay = bhNum + ndNum;
        const monthTotal = getRowTotal(item);
        const avgPerDay = activeDays > 0 ? (monthTotal / activeDays) : 0;
        const diffVsAvg = totalDay - avgPerDay;

        return {
          'Bộ Phận / Danh Mục': item.category,
          'Dịch Vụ': item.name,
          'Số Ca BH (BHYT)': bhVal,
          'Số Ca ND (Nhân Dân)': ndVal,
          'Tổng Ca Trong Ngày': totalDay,
          'TB/Ngày Trong Tháng': Number(avgPerDay.toFixed(1)),
          'Chênh Lệch So Vốn TB': Number(diffVsAvg.toFixed(1))
        };
      });

      const ws = XLSX.utils.json_to_sheet(dailyRows);
      XLSX.utils.book_append_sheet(wb, ws, `Ngày ${selectedReportDay} ${selectedReportMonth}`);
      XLSX.writeFile(wb, `Bao_Cao_Ngay_${selectedReportDay}_${selectedReportMonth.replace(/\s+/g, '_')}_${selectedYear}.xlsx`);

    } else if (sheetTab === 'Báo cáo tuần') {
      const currWeekInfo = getWeekDateRange(selectedReportWeek, selectedYear);
      const prevWeekInfo = selectedReportWeek > 1 ? getWeekDateRange(selectedReportWeek - 1, selectedYear) : null;

      const weekDates: Date[] = [];
      let curDate = new Date(currWeekInfo.startDate);
      while (curDate <= currWeekInfo.endDate) {
        weekDates.push(new Date(curDate));
        curDate.setDate(curDate.getDate() + 1);
      }

      const prevWeekDates: Date[] = [];
      if (prevWeekInfo) {
        let pCur = new Date(prevWeekInfo.startDate);
        while (pCur <= prevWeekInfo.endDate) {
          prevWeekDates.push(new Date(pCur));
          pCur.setDate(pCur.getDate() + 1);
        }
      }

      const weeklyRows = caseReports.map(item => {
        let itemWeekBH = 0;
        let itemWeekND = 0;
        for (const date of weekDates) {
          const mNum = date.getMonth() + 1;
          const mKey = `Tháng ${mNum}`;
          const dayNum = date.getDate();
          const monthItems = monthlyDataStore[mKey] || (mKey === selectedReportMonth ? caseReports : []);
          const foundItem = monthItems.find(i => i.id === item.id || i.name === item.name);
          if (foundItem && foundItem.dailyData && foundItem.dailyData[dayNum]) {
            const dData = foundItem.dailyData[dayNum];
            if (typeof dData.bh === 'number') itemWeekBH += dData.bh;
            if (typeof dData.nd === 'number') itemWeekND += dData.nd;
          }
        }

        let itemPrevWeekTotal = 0;
        for (const pDate of prevWeekDates) {
          const mNum = pDate.getMonth() + 1;
          const mKey = `Tháng ${mNum}`;
          const dayNum = pDate.getDate();
          const monthItems = monthlyDataStore[mKey] || (mKey === selectedReportMonth ? caseReports : []);
          const foundItem = monthItems.find(i => i.id === item.id || i.name === item.name);
          if (foundItem && foundItem.dailyData && foundItem.dailyData[dayNum]) {
            const dData = foundItem.dailyData[dayNum];
            const bh = typeof dData.bh === 'number' ? dData.bh : 0;
            const nd = typeof dData.nd === 'number' ? dData.nd : 0;
            itemPrevWeekTotal += bh + nd;
          }
        }

        const itemWeekTotal = itemWeekBH + itemWeekND;
        const avgPerDayInWeek = weekDates.length > 0 ? (itemWeekTotal / weekDates.length) : 0;
        const weekDiffPct = itemPrevWeekTotal > 0 ? (((itemWeekTotal - itemPrevWeekTotal) / itemPrevWeekTotal) * 100).toFixed(1) + '%' : '-';

        return {
          'Bộ Phận / Danh Mục': item.category,
          'Dịch Vụ': item.name,
          'Số Ca BH (Tuần)': itemWeekBH,
          'Số Ca ND (Tuần)': itemWeekND,
          'Tổng Ca Tuần': itemWeekTotal,
          'TB/Ngày Trong Tuần': Number(avgPerDayInWeek.toFixed(1)),
          'Tổng Tuần Trước': itemPrevWeekTotal,
          'Tăng Trưởng So Tuần Trước': weekDiffPct
        };
      });

      const ws = XLSX.utils.json_to_sheet(weeklyRows);
      XLSX.utils.book_append_sheet(wb, ws, `Tuần ${selectedReportWeek}`);
      XLSX.writeFile(wb, `Bao_Cao_Tuan_${selectedReportWeek}_${selectedYear}.xlsx`);

    } else if (sheetTab === 'Báo cáo năm') {
      const allMonths = ALL_MONTHS;
      const storedMonths = allMonths.filter(m => monthlyDataStore[m] && monthlyDataStore[m].length > 0);
      const actualMonths = storedMonths.length > 0 ? storedMonths : ['Tháng 2'];
      const actualMonthsSet = new Set(actualMonths);
      const seasonalFactors: { [m: string]: number } = {
        'Tháng 1': 0.98, 'Tháng 2': 0.95, 'Tháng 3': 1.0,
        'Tháng 4': 1.05, 'Tháng 5': 1.08, 'Tháng 6': 1.10, 'Tháng 7': 1.06,
        'Tháng 8': 1.04, 'Tháng 9': 1.07, 'Tháng 10': 1.09, 'Tháng 11': 1.05, 'Tháng 12': 1.02
      };

      const serviceMap = new Map<string, { category: string; name: string }>();
      const allSourceItems = [
        ...allMonths.flatMap(m => monthlyDataStore[m] || []),
        ...caseReports
      ];
      allSourceItems.forEach(item => {
        if (!isValidServiceName(item.name)) return;
        const cat = item.category ? item.category.trim() : 'Siêu Âm';
        const name = item.name.trim();
        const key = `${cat}___${name}`;
        if (!serviceMap.has(key)) {
          serviceMap.set(key, { category: cat, name });
        }
      });
      const masterServices = Array.from(serviceMap.values());

      const displayedMonths = annualViewMode === 'actual_only'
        ? actualMonths
        : allMonths;

      const annualRows = masterServices.map((srv, idx) => {
        let actualSum = 0;
        let actualMonthCount = 0;
        const monthlyValues: { [m: string]: number } = {};

        actualMonths.forEach(m => {
          if (monthlyDataStore[m]) {
            const storeForM = monthlyDataStore[m];
            const matchedItem = storeForM.find(i => i.name.trim().toLowerCase() === srv.name.toLowerCase() && i.category.trim().toLowerCase() === srv.category.toLowerCase());
            const val = matchedItem ? getRowTotal(matchedItem) : 0;
            monthlyValues[m] = val;
            actualSum += val;
            actualMonthCount++;
          } else if (m === 'Tháng 2' && selectedYear === 2026 && caseReports.length > 0) {
            const matchedItem = caseReports.find(i => i.name.trim().toLowerCase() === srv.name.toLowerCase() && i.category.trim().toLowerCase() === srv.category.toLowerCase());
            const val = matchedItem ? getRowTotal(matchedItem) : 0;
            monthlyValues[m] = val;
            actualSum += val;
            actualMonthCount++;
          } else {
            monthlyValues[m] = 0;
          }
        });

        const actualAvgPerMonth = actualMonthCount > 0 ? actualSum / actualMonthCount : 0;
        let projectedSum = 0;
        allMonths.forEach(m => {
          if (actualMonthsSet.has(m)) return;
          const factor = seasonalFactors[m] || 1.0;
          const projVal = Math.round(actualAvgPerMonth * factor);
          monthlyValues[m] = projVal;
          projectedSum += projVal;
        });

        const fullYearTotal = actualSum + projectedSum;

        const row: any = {
          'STT': idx + 1,
          'Bộ Phận / Danh Mục': srv.category,
          'Kỹ Thuật / Dịch Vụ': srv.name,
        };

        displayedMonths.forEach(m => {
          row[m] = monthlyValues[m] || 0;
        });

        row[`Tổng ${actualMonths.length} Tháng Thực Tế`] = actualSum;
        if (annualViewMode === 'full') {
          row[`Dự Báo Cả Năm ${selectedYear}`] = fullYearTotal;
          row['TB / Tháng'] = Math.round(fullYearTotal / 12);
        }

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(annualRows);
      XLSX.utils.book_append_sheet(wb, ws, `Báo Cáo Năm ${selectedYear}`);
      XLSX.writeFile(wb, `Bao_Cao_Nam_${selectedYear}_${annualViewMode}.xlsx`);

    } else {
      // Monthly matrix tab (e.g., Tháng 1 .. Tháng 12)
      const targetMonthItems = monthlyDataStore[sheetTab] || (sheetTab === 'Tháng 2' && selectedYear === 2026 ? caseReports : []);
      const maxDays = getDaysInMonth(sheetTab, selectedYear);
      
      const matrixRows = targetMonthItems.map(item => {
        const row: any = {
          'Bộ Phận / Danh Mục': item.category,
          'Dịch Vụ': item.name,
          'Tổng Ca BH': getRowTotal(item, 'bh'),
          'Tổng Ca ND': getRowTotal(item, 'nd'),
          'Tổng Cộng Tháng': getRowTotal(item),
        };
        for (let day = 1; day <= maxDays; day++) {
          row[`N${day}_BH`] = item.dailyData[day]?.bh ?? 0;
          row[`N${day}_ND`] = item.dailyData[day]?.nd ?? 0;
        }
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(matrixRows);
      XLSX.utils.book_append_sheet(wb, ws, sheetTab);
      XLSX.writeFile(wb, `Bao_Cao_${sheetTab.replace(/\s+/g, '_')}_${selectedYear}.xlsx`);
    }
  };

  const handleExportWord = () => {
    let titleText = '';
    let periodText = '';
    let summaryCardsHtml = '';
    let tableHeaderHtml = '';
    let tableBodyHtml = '';
    let fileName = '';

    if (sheetTab === 'Báo cáo ngày') {
      const monthItems = monthlyDataStore[selectedReportMonth] || (selectedReportMonth === 'Tháng 2' && selectedYear === 2026 ? caseReports : []);
      const activeDays = getActiveWorkDaysForMonth(selectedReportMonth, monthItems);

      titleText = `BÁO CÁO GIAO BAN KHOA CẬN LÂM SÀNG - NGÀY ${selectedReportDay}`;
      periodText = `Thời gian: Ngày ${selectedReportDay} - ${selectedReportMonth} năm ${selectedYear}`;
      fileName = `Bao_Cao_Ngay_${selectedReportDay}_${selectedReportMonth.replace(/\s+/g, '_')}_${selectedYear}.doc`;

      let totalBH = 0;
      let totalND = 0;

      monthItems.forEach(item => {
        const dayData = item.dailyData[selectedReportDay] || { bh: 0, nd: 0 };
        const bhNum = typeof dayData.bh === 'number' ? dayData.bh : 0;
        const ndNum = typeof dayData.nd === 'number' ? dayData.nd : 0;
        totalBH += bhNum;
        totalND += ndNum;
      });
      const grandTotal = totalBH + totalND;

      summaryCardsHtml = `
        <div class="summary-box">
          <div class="summary-title">TỔNG QUAN SỐ LIỆU NGÀY ${selectedReportDay} (${selectedReportMonth.toUpperCase()})</div>
          <table style="width: 100%; border: none;">
            <tr>
              <td style="border: none; padding: 4px 8px;">• <b>Tổng ca thực hiện:</b> <span style="color: #1e40af; font-size: 13pt;">${grandTotal.toLocaleString('vi-VN')}</span> ca</td>
              <td style="border: none; padding: 4px 8px;">• <b>Bảo hiểm (BHYT):</b> <span style="color: #047857;">${totalBH.toLocaleString('vi-VN')}</span> ca</td>
              <td style="border: none; padding: 4px 8px;">• <b>Nhân dân (Dịch vụ):</b> <span style="color: #b45309;">${totalND.toLocaleString('vi-VN')}</span> ca</td>
            </tr>
          </table>
        </div>
      `;

      tableHeaderHtml = `
        <tr>
          <th style="width: 6%;">STT</th>
          <th style="width: 36%;">Tên Dịch Vụ / Kỹ Thuật</th>
          <th style="width: 11%;">Ca BH</th>
          <th style="width: 11%;">Ca ND</th>
          <th style="width: 12%;">Tổng Ngày</th>
          <th style="width: 12%;">TB/Ngày (Tháng)</th>
          <th style="width: 12%;">Chênh Lệch</th>
        </tr>
      `;

      const cats: string[] = Array.from(new Set(monthItems.map(i => i.category))).filter((c): c is string => Boolean(c));
      let globalIdx = 1;

      cats.forEach(cat => {
        const catItems = monthItems.filter(i => i.category === cat);
        let catBH = 0;
        let catND = 0;
        let catDayTotal = 0;

        let rowsHtml = '';
        catItems.forEach(item => {
          const dayData = item.dailyData[selectedReportDay] || { bh: 0, nd: 0 };
          const bhVal = dayData.bh === 'LT' ? 'LT' : (typeof dayData.bh === 'number' ? dayData.bh : 0);
          const ndVal = dayData.nd === 'LT' ? 'LT' : (typeof dayData.nd === 'number' ? dayData.nd : 0);
          const bhNum = typeof bhVal === 'number' ? bhVal : 0;
          const ndNum = typeof ndVal === 'number' ? ndVal : 0;
          const totalDay = bhNum + ndNum;
          const monthTotal = getRowTotal(item);
          const avgPerDay = activeDays > 0 ? (monthTotal / activeDays) : 0;
          const diffVsAvg = totalDay - avgPerDay;

          catBH += bhNum;
          catND += ndNum;
          catDayTotal += totalDay;

          const diffText = diffVsAvg > 0 ? `+${diffVsAvg.toFixed(1)}` : diffVsAvg.toFixed(1);
          const diffColor = diffVsAvg > 0 ? '#047857' : (diffVsAvg < 0 ? '#b91c1c' : '#475569');

          rowsHtml += `
            <tr>
              <td style="text-align: center;">${globalIdx++}</td>
              <td>${item.name}</td>
              <td style="text-align: right;">${bhVal}</td>
              <td style="text-align: right;">${ndVal}</td>
              <td style="text-align: right; font-weight: bold;">${totalDay}</td>
              <td style="text-align: right;">${avgPerDay.toFixed(1)}</td>
              <td style="text-align: right; color: ${diffColor}; font-weight: bold;">${diffText}</td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="category-row">
            <td colspan="2">📌 ${cat.toUpperCase()} (${catItems.length} dịch vụ)</td>
            <td style="text-align: right;">${catBH}</td>
            <td style="text-align: right;">${catND}</td>
            <td style="text-align: right;">${catDayTotal}</td>
            <td colspan="2"></td>
          </tr>
          ${rowsHtml}
        `;
      });

      tableBodyHtml += `
        <tr class="grand-total-row">
          <td colspan="2" style="text-align: center; text-transform: uppercase;">TỔNG CỘNG HOẠT ĐỘNG NGÀY</td>
          <td style="text-align: right;">${totalBH}</td>
          <td style="text-align: right;">${totalND}</td>
          <td style="text-align: right;">${grandTotal}</td>
          <td colspan="2"></td>
        </tr>
      `;

    } else if (sheetTab === 'Báo cáo tuần') {
      const currWeekInfo = getWeekDateRange(selectedReportWeek, selectedYear);
      const prevWeekInfo = selectedReportWeek > 1 ? getWeekDateRange(selectedReportWeek - 1, selectedYear) : null;

      titleText = `BÁO CÁO GIAO BAN HOẠT ĐỘNG KHOA CLS - TUẦN ${selectedReportWeek}`;
      periodText = `Thời gian: Tuần ${selectedReportWeek} (${currWeekInfo.dateRangeLabel}) năm ${selectedYear}`;
      fileName = `Bao_Cao_Tuan_${selectedReportWeek}_${selectedYear}.doc`;

      const weekDates: Date[] = [];
      let curDate = new Date(currWeekInfo.startDate);
      while (curDate <= currWeekInfo.endDate) {
        weekDates.push(new Date(curDate));
        curDate.setDate(curDate.getDate() + 1);
      }

      const prevWeekDates: Date[] = [];
      if (prevWeekInfo) {
        let pCur = new Date(prevWeekInfo.startDate);
        while (pCur <= prevWeekInfo.endDate) {
          prevWeekDates.push(new Date(pCur));
          pCur.setDate(pCur.getDate() + 1);
        }
      }

      let grandWeekBH = 0;
      let grandWeekND = 0;
      let grandPrevWeekTotal = 0;

      const processedItems = caseReports.map(item => {
        let itemWeekBH = 0;
        let itemWeekND = 0;
        for (const date of weekDates) {
          const mNum = date.getMonth() + 1;
          const mKey = `Tháng ${mNum}`;
          const dayNum = date.getDate();
          const monthItems = monthlyDataStore[mKey] || (mKey === selectedReportMonth ? caseReports : []);
          const foundItem = monthItems.find(i => i.id === item.id || i.name === item.name);
          if (foundItem && foundItem.dailyData && foundItem.dailyData[dayNum]) {
            const dData = foundItem.dailyData[dayNum];
            if (typeof dData.bh === 'number') itemWeekBH += dData.bh;
            if (typeof dData.nd === 'number') itemWeekND += dData.nd;
          }
        }

        let itemPrevWeekTotal = 0;
        for (const pDate of prevWeekDates) {
          const mNum = pDate.getMonth() + 1;
          const mKey = `Tháng ${mNum}`;
          const dayNum = pDate.getDate();
          const monthItems = monthlyDataStore[mKey] || (mKey === selectedReportMonth ? caseReports : []);
          const foundItem = monthItems.find(i => i.id === item.id || i.name === item.name);
          if (foundItem && foundItem.dailyData && foundItem.dailyData[dayNum]) {
            const dData = foundItem.dailyData[dayNum];
            const bh = typeof dData.bh === 'number' ? dData.bh : 0;
            const nd = typeof dData.nd === 'number' ? dData.nd : 0;
            itemPrevWeekTotal += bh + nd;
          }
        }

        grandWeekBH += itemWeekBH;
        grandWeekND += itemWeekND;
        grandPrevWeekTotal += itemPrevWeekTotal;

        return {
          ...item,
          itemWeekBH,
          itemWeekND,
          itemWeekTotal: itemWeekBH + itemWeekND,
          itemPrevWeekTotal
        };
      });

      const grandWeekTotal = grandWeekBH + grandWeekND;
      const weekDiffPctGlobal = grandPrevWeekTotal > 0 ? (((grandWeekTotal - grandPrevWeekTotal) / grandPrevWeekTotal) * 100).toFixed(1) + '%' : '-';

      summaryCardsHtml = `
        <div class="summary-box">
          <div class="summary-title">TỔNG QUAN HOẠT ĐỘNG TUẦN ${selectedReportWeek} (${currWeekInfo.dateRangeLabel})</div>
          <table style="width: 100%; border: none;">
            <tr>
              <td style="border: none; padding: 4px 8px;">• <b>Tổng ca tuần:</b> <span style="color: #1e40af; font-size: 13pt;">${grandWeekTotal.toLocaleString('vi-VN')}</span> ca</td>
              <td style="border: none; padding: 4px 8px;">• <b>Bảo hiểm (BHYT):</b> <span style="color: #047857;">${grandWeekBH.toLocaleString('vi-VN')}</span> ca</td>
              <td style="border: none; padding: 4px 8px;">• <b>Nhân dân (Dịch vụ):</b> <span style="color: #b45309;">${grandWeekND.toLocaleString('vi-VN')}</span> ca</td>
              <td style="border: none; padding: 4px 8px;">• <b>Tăng trưởng so tuần trước:</b> <span style="color: #4f46e5;">${weekDiffPctGlobal}</span></td>
            </tr>
          </table>
        </div>
      `;

      tableHeaderHtml = `
        <tr>
          <th style="width: 6%;">STT</th>
          <th style="width: 34%;">Tên Dịch Vụ / Kỹ Thuật</th>
          <th style="width: 10%;">BH Tuần</th>
          <th style="width: 10%;">ND Tuần</th>
          <th style="width: 12%;">Tổng Tuần</th>
          <th style="width: 10%;">TB/Ngày</th>
          <th style="width: 10%;">Tuần Trước</th>
          <th style="width: 8%;">So T.Trước</th>
        </tr>
      `;

      const cats: string[] = Array.from(new Set(processedItems.map(i => i.category))).filter((c): c is string => Boolean(c));
      let globalIdx = 1;

      cats.forEach(cat => {
        const catItems = processedItems.filter(i => i.category === cat);
        let catBH = 0;
        let catND = 0;
        let catTotal = 0;
        let catPrev = 0;

        let rowsHtml = '';
        catItems.forEach(item => {
          catBH += item.itemWeekBH;
          catND += item.itemWeekND;
          catTotal += item.itemWeekTotal;
          catPrev += item.itemPrevWeekTotal;

          const avgPerDayInWeek = weekDates.length > 0 ? (item.itemWeekTotal / weekDates.length) : 0;
          const weekDiffPct = item.itemPrevWeekTotal > 0 ? (((item.itemWeekTotal - item.itemPrevWeekTotal) / item.itemPrevWeekTotal) * 100).toFixed(1) + '%' : '-';

          rowsHtml += `
            <tr>
              <td style="text-align: center;">${globalIdx++}</td>
              <td>${item.name}</td>
              <td style="text-align: right;">${item.itemWeekBH}</td>
              <td style="text-align: right;">${item.itemWeekND}</td>
              <td style="text-align: right; font-weight: bold;">${item.itemWeekTotal}</td>
              <td style="text-align: right;">${avgPerDayInWeek.toFixed(1)}</td>
              <td style="text-align: right;">${item.itemPrevWeekTotal}</td>
              <td style="text-align: right; font-weight: bold;">${weekDiffPct}</td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="category-row">
            <td colspan="2">📌 ${cat.toUpperCase()} (${catItems.length} dịch vụ)</td>
            <td style="text-align: right;">${catBH}</td>
            <td style="text-align: right;">${catND}</td>
            <td style="text-align: right;">${catTotal}</td>
            <td colspan="2" style="text-align: right;">Tuần trước: ${catPrev}</td>
            <td></td>
          </tr>
          ${rowsHtml}
        `;
      });

      tableBodyHtml += `
        <tr class="grand-total-row">
          <td colspan="2" style="text-align: center; text-transform: uppercase;">TỔNG CỘNG HOẠT ĐỘNG TUẦN ${selectedReportWeek}</td>
          <td style="text-align: right;">${grandWeekBH}</td>
          <td style="text-align: right;">${grandWeekND}</td>
          <td style="text-align: right;">${grandWeekTotal}</td>
          <td colspan="2" style="text-align: right;">T.Trước: ${grandPrevWeekTotal}</td>
          <td style="text-align: right;">${weekDiffPctGlobal}</td>
        </tr>
      `;

    } else if (sheetTab === 'Báo cáo năm') {
      const allMonths = ALL_MONTHS;
      const storedMonths = allMonths.filter(m => monthlyDataStore[m] && monthlyDataStore[m].length > 0);
      const actualMonths = storedMonths.length > 0 ? storedMonths : ['Tháng 2'];
      const actualMonthsSet = new Set(actualMonths);
      const actualRangeText = actualMonths.map(m => m.replace('Tháng ', 'T')).join(', ');

      titleText = `BÁO CÁO THỐNG KÊ HOẠT ĐỘNG NĂM ${selectedYear} - KHOA CẬN LÂM SÀNG`;
      periodText = `Thời gian: Toàn bộ Năm ${selectedYear} (${annualViewMode === 'full' ? 'Dự báo 12 tháng' : `${actualMonths.length} tháng thực tế`})`;
      fileName = `Bao_Cao_Nam_${selectedYear}_${annualViewMode}.doc`;

      const seasonalFactors: { [m: string]: number } = {
        'Tháng 1': 0.98, 'Tháng 2': 0.95, 'Tháng 3': 1.0,
        'Tháng 4': 1.05, 'Tháng 5': 1.08, 'Tháng 6': 1.10, 'Tháng 7': 1.06,
        'Tháng 8': 1.04, 'Tháng 9': 1.07, 'Tháng 10': 1.09, 'Tháng 11': 1.05, 'Tháng 12': 1.02
      };

      const serviceMap = new Map<string, { category: string; name: string }>();
      const allSourceItems = [
        ...allMonths.flatMap(m => monthlyDataStore[m] || []),
        ...caseReports
      ];
      allSourceItems.forEach(item => {
        if (!isValidServiceName(item.name)) return;
        const cat = item.category ? item.category.trim() : 'Siêu Âm';
        const name = item.name.trim();
        const key = `${cat}___${name}`;
        if (!serviceMap.has(key)) {
          serviceMap.set(key, { category: cat, name });
        }
      });
      const masterServices = Array.from(serviceMap.values());

      const displayedMonths = annualViewMode === 'actual_only'
        ? actualMonths
        : allMonths;

      tableHeaderHtml = `
        <tr>
          <th style="width: 5%;">STT</th>
          <th style="width: 25%;">Kỹ Thuật / Dịch Vụ</th>
          ${displayedMonths.map(m => `<th>${m}</th>`).join('')}
          <th>Tổng Thực Tế</th>
          ${annualViewMode === 'full' ? `<th>Dự Báo ${selectedYear}</th><th>TB/Tháng</th>` : ''}
        </tr>
      `;

      let grandActualSum = 0;
      let grandFullYearTotal = 0;

      const cats = Array.from(new Set(masterServices.map(s => s.category)));
      let globalIdx = 1;

      cats.forEach(cat => {
        const catServices = masterServices.filter(s => s.category === cat);
        let catActualSum = 0;
        let catFullYearSum = 0;

        let rowsHtml = '';
        catServices.forEach(srv => {
          let actualSum = 0;
          let actualMonthCount = 0;
          const monthlyValues: { [m: string]: number } = {};

          actualMonths.forEach(m => {
            if (monthlyDataStore[m]) {
              const storeForM = monthlyDataStore[m];
              const matchedItem = storeForM.find(i => i.name.trim().toLowerCase() === srv.name.toLowerCase() && i.category.trim().toLowerCase() === srv.category.toLowerCase());
              const val = matchedItem ? getRowTotal(matchedItem) : 0;
              monthlyValues[m] = val;
              actualSum += val;
              actualMonthCount++;
            } else if (m === 'Tháng 2' && selectedYear === 2026 && caseReports.length > 0) {
              const matchedItem = caseReports.find(i => i.name.trim().toLowerCase() === srv.name.toLowerCase() && i.category.trim().toLowerCase() === srv.category.toLowerCase());
              const val = matchedItem ? getRowTotal(matchedItem) : 0;
              monthlyValues[m] = val;
              actualSum += val;
              actualMonthCount++;
            } else {
              monthlyValues[m] = 0;
            }
          });

          const actualAvgPerMonth = actualMonthCount > 0 ? actualSum / actualMonthCount : 0;
          let projectedSum = 0;
          allMonths.forEach(m => {
            if (actualMonthsSet.has(m)) return;
            const factor = seasonalFactors[m] || 1.0;
            const projVal = Math.round(actualAvgPerMonth * factor);
            monthlyValues[m] = projVal;
            projectedSum += projVal;
          });

          const fullYearTotal = actualSum + projectedSum;
          catActualSum += actualSum;
          catFullYearSum += fullYearTotal;

          rowsHtml += `
            <tr>
              <td style="text-align: center;">${globalIdx++}</td>
              <td>${srv.name}</td>
              ${displayedMonths.map(m => `<td style="text-align: right;">${(monthlyValues[m] || 0).toLocaleString('vi-VN')}</td>`).join('')}
              <td style="text-align: right; font-weight: bold;">${actualSum.toLocaleString('vi-VN')}</td>
              ${annualViewMode === 'full' ? `<td style="text-align: right; font-weight: bold; color: #1e40af;">${fullYearTotal.toLocaleString('vi-VN')}</td><td style="text-align: right;">${Math.round(fullYearTotal / 12).toLocaleString('vi-VN')}</td>` : ''}
            </tr>
          `;
        });

        grandActualSum += catActualSum;
        grandFullYearTotal += catFullYearSum;

        tableBodyHtml += `
          <tr class="category-row">
            <td colspan="2">📌 ${cat.toUpperCase()} (${catServices.length} dịch vụ)</td>
            ${displayedMonths.map(() => `<td></td>`).join('')}
            <td style="text-align: right;">${catActualSum.toLocaleString('vi-VN')}</td>
            ${annualViewMode === 'full' ? `<td style="text-align: right;">${catFullYearSum.toLocaleString('vi-VN')}</td><td></td>` : ''}
          </tr>
          ${rowsHtml}
        `;
      });

      tableBodyHtml += `
        <tr class="grand-total-row">
          <td colspan="2" style="text-align: center; text-transform: uppercase;">TỔNG CỘNG TOÀN KHOA CẬN LÂM SÀNG</td>
          ${displayedMonths.map(() => `<td></td>`).join('')}
          <td style="text-align: right;">${grandActualSum.toLocaleString('vi-VN')}</td>
          ${annualViewMode === 'full' ? `<td style="text-align: right;">${grandFullYearTotal.toLocaleString('vi-VN')}</td><td></td>` : ''}
        </tr>
      `;

      summaryCardsHtml = `
        <div class="summary-box">
          <div class="summary-title">TỔNG QUAN HOẠT ĐỘNG CẢ NĂM ${selectedYear}</div>
          <table style="width: 100%; border: none;">
            <tr>
              <td style="border: none; padding: 4px 8px;">• <b>Tổng ${actualMonths.length} tháng thực tế (${actualRangeText}):</b> <span style="color: #047857; font-size: 13pt;">${grandActualSum.toLocaleString('vi-VN')}</span> ca</td>
              ${annualViewMode === 'full' ? `<td style="border: none; padding: 4px 8px;">• <b>Dự báo tổng cả năm ${selectedYear}:</b> <span style="color: #1e40af; font-size: 13pt;">${grandFullYearTotal.toLocaleString('vi-VN')}</span> ca</td>` : ''}
            </tr>
          </table>
        </div>
      `;

    } else {
      // Monthly tab e.g. Tháng 1 .. Tháng 12
      const targetMonthItems = monthlyDataStore[sheetTab] || (sheetTab === 'Tháng 2' && selectedYear === 2026 ? caseReports : []);
      titleText = `BÁO CÁO TỔNG HỢP HOẠT ĐỘNG KHOA CẬN LÂM SÀNG - ${sheetTab.toUpperCase()}`;
      periodText = `Thời gian: ${sheetTab} năm ${selectedYear}`;
      fileName = `Bao_Cao_${sheetTab.replace(/\s+/g, '_')}_${selectedYear}.doc`;

      let monthBH = 0;
      let monthND = 0;
      targetMonthItems.forEach(i => {
        monthBH += getRowTotal(i, 'bh');
        monthND += getRowTotal(i, 'nd');
      });
      const monthTotal = monthBH + monthND;

      summaryCardsHtml = `
        <div class="summary-box">
          <div class="summary-title">TỔNG QUAN SỐ LIỆU ${sheetTab.toUpperCase()} NĂM ${selectedYear}</div>
          <table style="width: 100%; border: none;">
            <tr>
              <td style="border: none; padding: 4px 8px;">• <b>Tổng ca thực hiện:</b> <span style="color: #1e40af; font-size: 13pt;">${monthTotal.toLocaleString('vi-VN')}</span> ca</td>
              <td style="border: none; padding: 4px 8px;">• <b>Bảo hiểm (BHYT):</b> <span style="color: #047857;">${monthBH.toLocaleString('vi-VN')}</span> ca</td>
              <td style="border: none; padding: 4px 8px;">• <b>Nhân dân (Dịch vụ):</b> <span style="color: #b45309;">${monthND.toLocaleString('vi-VN')}</span> ca</td>
            </tr>
          </table>
        </div>
      `;

      tableHeaderHtml = `
        <tr>
          <th style="width: 6%;">STT</th>
          <th style="width: 44%;">Tên Dịch Vụ / Kỹ Thuật</th>
          <th style="width: 16%;">Tổng Ca BH</th>
          <th style="width: 16%;">Tổng Ca ND</th>
          <th style="width: 18%;">Tổng Ca Thực Hiện</th>
        </tr>
      `;

      const cats: string[] = Array.from(new Set(targetMonthItems.map(i => i.category))).filter((c): c is string => Boolean(c));
      let globalIdx = 1;

      cats.forEach(cat => {
        const catItems = targetMonthItems.filter(i => i.category === cat);
        let cBH = 0;
        let cND = 0;

        let rowsHtml = '';
        catItems.forEach(item => {
          const bh = getRowTotal(item, 'bh');
          const nd = getRowTotal(item, 'nd');
          const tot = bh + nd;
          cBH += bh;
          cND += nd;

          rowsHtml += `
            <tr>
              <td style="text-align: center;">${globalIdx++}</td>
              <td>${item.name}</td>
              <td style="text-align: right;">${bh.toLocaleString('vi-VN')}</td>
              <td style="text-align: right;">${nd.toLocaleString('vi-VN')}</td>
              <td style="text-align: right; font-weight: bold;">${tot.toLocaleString('vi-VN')}</td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="category-row">
            <td colspan="2">📌 ${cat.toUpperCase()} (${catItems.length} dịch vụ)</td>
            <td style="text-align: right;">${cBH.toLocaleString('vi-VN')}</td>
            <td style="text-align: right;">${cND.toLocaleString('vi-VN')}</td>
            <td style="text-align: right;">${(cBH + cND).toLocaleString('vi-VN')}</td>
          </tr>
          ${rowsHtml}
        `;
      });

      tableBodyHtml += `
        <tr class="grand-total-row">
          <td colspan="2" style="text-align: center; text-transform: uppercase;">TỔNG CỘNG HOẠT ĐỘNG ${sheetTab.toUpperCase()}</td>
          <td style="text-align: right;">${monthBH.toLocaleString('vi-VN')}</td>
          <td style="text-align: right;">${monthND.toLocaleString('vi-VN')}</td>
          <td style="text-align: right;">${monthTotal.toLocaleString('vi-VN')}</td>
        </tr>
      `;
    }

    const htmlDocument = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
      <meta charset='utf-8'>
      <title>${titleText}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 20mm 15mm 20mm 15mm;
        }
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.4;
          color: #0f172a;
        }
        .header-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        .header-table td {
          vertical-align: top;
          font-size: 11pt;
        }
        .doc-title {
          text-align: center;
          font-size: 15pt;
          font-weight: bold;
          color: #1e3a8a;
          margin-top: 15px;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .doc-subtitle {
          text-align: center;
          font-size: 11pt;
          font-style: italic;
          color: #475569;
          margin-bottom: 20px;
        }
        .summary-box {
          background-color: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 10px 14px;
          margin-bottom: 18px;
        }
        .summary-title {
          font-weight: bold;
          color: #1e3a8a;
          font-size: 11pt;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          margin-bottom: 20px;
        }
        .report-table th {
          background-color: #1e40af;
          color: #ffffff;
          font-weight: bold;
          font-size: 10.5pt;
          padding: 7px 6px;
          border: 1px solid #1e3a8a;
          text-align: center;
        }
        .report-table td {
          border: 1px solid #cbd5e1;
          padding: 5px 7px;
          font-size: 10.5pt;
        }
        .category-row {
          background-color: #e0f2fe;
          font-weight: bold;
          color: #0369a1;
        }
        .grand-total-row {
          background-color: #1e3a8a;
          color: #ffffff;
          font-weight: bold;
          font-size: 11pt;
        }
        .signature-table {
          width: 100%;
          margin-top: 30px;
          border-collapse: collapse;
        }
        .signature-table td {
          text-align: center;
          vertical-align: top;
          font-size: 11pt;
        }
      </style>
      </head>
      <body>
        <table class="header-table">
          <tr>
            <td style="width: 45%; text-align: center;">
              <b>BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG</b><br/>
              <b>KHOA CẬN LÂM SÀNG</b><br/>
              -------------------
            </td>
            <td style="width: 55%; text-align: center;">
              <b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br/>
              <b>Độc lập - Tự do - Hạnh phúc</b><br/>
              ---------------------------------
            </td>
          </tr>
        </table>

        <div class="doc-title">${titleText}</div>
        <div class="doc-subtitle">${periodText}</div>

        ${summaryCardsHtml}

        <table class="report-table">
          <thead>
            ${tableHeaderHtml}
          </thead>
          <tbody>
            ${tableBodyHtml}
          </tbody>
        </table>

        <div style="margin-top: 15px; font-size: 11pt;">
          <b>ĐÁNH GIÁ CHUNG:</b> Hoạt động chuyên môn cận lâm sàng diễn ra an toàn, tuân thủ đúng quy trình chuyên môn. Đảm bảo đầy đủ hóa chất, vật tư y tế và vận hành thiết bị ổn định.
        </div>

        <table class="signature-table">
          <tr>
            <td style="width: 50%;">
              <br/>
              <b>NGƯỜI LẬP BÁO CÁO</b><br/>
              <i>(Ký và ghi rõ họ tên)</i>
              <br/><br/><br/><br/>
              <b>KTV. Nguyễn Văn A</b>
            </td>
            <td style="width: 50%;">
              <i>TP. Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</i><br/>
              <b>TRƯỞNG KHOA CẬN LÂM SÀNG</b><br/>
              <i>(Ký, đóng dấu và ghi rõ họ tên)</i>
              <br/><br/><br/><br/>
              <b>BS. CKI. Trần Thị B</b>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlDocument], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const availableCategories: string[] = Array.from(new Set(caseReports.map((item: CaseReportItem) => item.category))).filter((c): c is string => Boolean(c));
  const categories = ['Tất cả', ...availableCategories];

  // All unique services list for fast pin manager
  const allUniqueServicesList = useMemo(() => {
    const map = new Map<string, { category: string; name: string }>();
    caseReports.forEach(item => {
      if (item.name && !map.has(item.name)) {
        map.set(item.name, { category: item.category, name: item.name });
      }
    });
    // Include all monthlyDataStore items too
    Object.values(monthlyDataStore).forEach(monthList => {
      if (Array.isArray(monthList)) {
        (monthList as CaseReportItem[]).forEach(item => {
          if (item.name && !map.has(item.name)) {
            map.set(item.name, { category: item.category, name: item.name });
          }
        });
      }
    });
    return Array.from(map.values());
  }, [caseReports, monthlyDataStore]);

  const filteredItems = caseReports.filter(item => {
    const isPinned = pinnedServiceNames.some(p => p.trim().toLowerCase() === item.name.trim().toLowerCase());
    if (showPinnedOnly && !isPinned) return false;
    const matchesCat = selectedCategory === 'Tất cả' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Group items by category for structured table display
  const groupedCategories = availableCategories.map(cat => ({
    categoryName: cat,
    items: filteredItems.filter(i => i.category === cat)
  })).filter(g => g.items.length > 0);

  // Filtered pinned items for top dedicated matrix
  const pinnedMatrixItems = caseReports.filter(item => {
    const isPinned = pinnedServiceNames.some(p => p.trim().toLowerCase() === item.name.trim().toLowerCase());
    const matchesSearch = searchTerm ? (item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase())) : true;
    return isPinned && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Banner & Tab Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-extrabold tracking-wider uppercase mb-1">
            <BarChart3 className="w-4 h-4" /> BÁO CÁO &amp; THỐNG KÊ KHOA CẬN LÂM SÀNG
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {activeTab === 'google_sheet'
              ? 'Báo Cáo Giao Ban & Số Ca Chụp / Xét Nghiệm (Google Sheet)'
              : activeTab === 'sync_history'
                ? 'Lịch Sử Đồng Bộ & Rà Soát Số Liệu'
                : 'Dashboard Biểu Đồ & Thống Kê Tổng Hợp'}
          </h1>

          {/* 3 Tab Switcher Buttons in a Single Horizontal Row Below Title */}
          <div className="mt-3">
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl inline-flex flex-wrap sm:flex-nowrap items-center border border-slate-300 dark:border-slate-600 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('google_sheet')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'google_sheet'
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs border border-slate-300/80 dark:border-slate-500'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Báo Cáo Số Ca (Google Sheet)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-300/80 dark:border-slate-500'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Biểu Đồ &amp; KPI</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sync_history')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'sync_history'
                    ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs border border-slate-300/80 dark:border-slate-500'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <History className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Lịch Sử Đồng Bộ</span>
              </button>
            </div>
          </div>
        </div>

        {/* Multi-line Description Block on the Right */}
        <div className="lg:w-80 xl:w-96 shrink-0 lg:border-l-[1.5px] lg:border-slate-300 dark:lg:border-slate-700 lg:pl-5">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Theo dõi chi tiết lượt khám, Siêu âm, Nội soi, X-quang, Điện tim &amp; LHN, Xét nghiệm theo từng ngày &amp; bảo hiểm / nhân dân.
          </p>
        </div>
      </div>

      {/* Toast message for sync */}
      {syncToast && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-fade-in border ${
            syncToast.startsWith('⚠️')
              ? 'bg-amber-50 dark:bg-amber-950/80 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          <span>{syncToast}</span>
          <button onClick={() => setSyncToast(null)} className="font-bold ml-4 opacity-70 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* TAB 1: GOOGLE SHEET DAILY CASE REPORT (SLIDES / SPREADSHEET MATRIX) */}
      {activeTab === 'google_sheet' && (() => {
        const effectiveSheetUrl = getEffectiveSheetTarget(selectedYear) || sheetUrl;
        const syncedMonthKeys = ALL_MONTHS.filter(m => monthlyDataStore[m] && monthlyDataStore[m].length > 0);
        const archiveStats = reportArchiveService.getYearSummaryStats(selectedYear, monthlyDataStore);
        const syncedLabel = syncedMonthKeys.length > 0
          ? syncedMonthKeys.map(m => m.replace('Tháng ', 'T')).join(', ')
          : 'Chưa đồng bộ';

        return (
        <div className="space-y-4">
          {/* UNIFIED CONTROL HUB: SOURCE & SYNC + TIME SCOPE & EXPORT + FILTER & SEARCH */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm overflow-hidden divide-y-[1.5px] divide-slate-300 dark:divide-slate-700">
            {/* Band 1: Data Source Status & Sync Actions */}
            <div className="p-4 bg-emerald-50/35 dark:bg-emerald-950/15 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                  <Link className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      Google Sheets Giao Ban CLS · Năm {selectedYear}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 whitespace-nowrap ${
                        isPgSynced
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700'
                          : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'
                      }`}
                      title={
                        isPgSynced
                          ? `Dữ liệu Google Sheet sau đồng bộ được lưu cố định trên PostgreSQL (${pgState.sessionUserName || ''})`
                          : 'Dữ liệu báo cáo đang lưu trữ cục bộ (IndexedDB & LocalStorage) hoặc kết nối PostgreSQL ở Cài đặt'
                      }
                    >
                      {isPgSynced ? (
                        <Cloud className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                      )}
                      <span>
                        {isPgSynced ? 'PostgreSQL Cloud' : 'Lưu máy'}
                      </span>
                    </span>

                    {resolveSpreadsheetId(effectiveSheetUrl) ? (
                      <a
                        href={effectiveSheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 rounded-lg text-[11px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 cursor-pointer transition-all group whitespace-nowrap"
                        title={`Mở trang tính Google Sheets Năm ${selectedYear} (Chỉnh sửa link trong Menu Cấu Hình)`}
                      >
                        <Database className="w-3 h-3 shrink-0" />
                        <span>Đã kết nối ({selectedYear})</span>
                        <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                      </a>
                    ) : (
                      <span
                        className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 rounded-lg text-[11px] font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1 whitespace-nowrap"
                        title={`Vào Menu Cấu Hình → Cấu Hình Hệ Thống để gắn link Google Sheets Năm ${selectedYear}`}
                      >
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>Chưa gắn link ({selectedYear})</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Khởi động chỉ đồng bộ <strong>3 ngày gần nhất</strong> · Phạm vi rộng hơn dùng{' '}
                    <strong>Rà soát số liệu</strong> · Đã lưu:{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400">{syncedLabel}</strong>
                    {archiveStats.totalRecordedCells > 0 && (
                      <span className="ml-1.5 tabular-nums text-slate-500">
                        ({archiveStats.totalRecordedCells.toLocaleString('vi-VN')} ô đã khóa)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pl-12 xl:pl-0">
                <button
                  type="button"
                  onClick={openResyncModal}
                  disabled={isSyncing}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                  title="Rà soát & đồng bộ thủ công theo khoảng thời gian nhiều ngày hơn (> 3 ngày)"
                >
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <span>Rà soát số liệu</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunManualThreeDaySync()}
                  disabled={isSyncing}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                  title="Rà soát và đồng bộ 3 ngày gần nhất (tự điền ô trống trong Hệ thống; cảnh báo & ghi Lịch sử nếu có sai lệch)"
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Đang kiểm tra 3 ngày...' : 'Đồng bộ 3 ngày gần nhất'}</span>
                </button>
              </div>
            </div>

            {/* Band 2: Time Period Navigation & Report Export */}
            <div className="p-4 space-y-2.5 bg-white dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Left: Time Granularity + Numeric Year + Annual Scope */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-300 dark:border-slate-600">
                    <button
                      type="button"
                      onClick={() => setSheetTab('Báo cáo ngày')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        sheetTab === 'Báo cáo ngày'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>Theo Ngày</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSheetTab('Báo cáo tuần')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        sheetTab === 'Báo cáo tuần'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 shrink-0" />
                      <span>Theo Tuần</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSheetTab(selectedReportMonth || 'Tháng 2')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        sheetTab.startsWith('Tháng')
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                      <span>Theo Tháng</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSheetTab('Báo cáo năm')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        sheetTab === 'Báo cáo năm'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                      <span>Theo Năm</span>
                    </button>
                  </div>

                  {/* Direct Numeric Year Picker */}
                  <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">
                    <span className="text-slate-500 pl-2 text-[11px]">Năm:</span>
                    <button
                      type="button"
                      onClick={() => handleChangeReportYear(selectedYear - 1)}
                      disabled={selectedYear <= MIN_REPORT_YEAR}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                      title="Năm trước"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      list="cls-known-report-years"
                      value={yearInputStr}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                        setYearInputStr(clean);
                        if (clean.length === 4) {
                          const y = parseInt(clean, 10);
                          if (isValidReportYear(y)) {
                            handleChangeReportYear(y);
                          }
                        }
                      }}
                      onBlur={() => {
                        const y = parseInt(yearInputStr, 10);
                        if (isValidReportYear(y)) {
                          if (y !== selectedYear) handleChangeReportYear(y);
                        } else {
                          setYearInputStr(String(selectedYear));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const y = parseInt(yearInputStr, 10);
                          if (isValidReportYear(y)) {
                            handleChangeReportYear(y);
                          } else {
                            setYearInputStr(String(selectedYear));
                          }
                        }
                      }}
                      className="w-16 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 font-black px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 outline-none text-center text-xs tabular-nums focus:ring-2 focus:ring-emerald-500"
                      title="Nhập trực tiếp bất kỳ năm nào (vd: 2022, 2026, 2035)"
                    />
                    <datalist id="cls-known-report-years">
                      {getKnownReportYears(storageService.getSettings(), [selectedYear]).map((y) => (
                        <option key={y} value={y} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={() => handleChangeReportYear(selectedYear + 1)}
                      disabled={selectedYear >= MAX_REPORT_YEAR}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                      title="Năm sau"
                    >
                      +
                    </button>
                  </div>

                  {/* Annual Scope Toggle inline when "Theo Năm" is active */}
                  {sheetTab === 'Báo cáo năm' && (
                    <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">
                      <span className="text-slate-500 pl-2 text-[11px]">Phạm vi:</span>
                      <button
                        type="button"
                        onClick={() => setAnnualViewMode('full')}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          annualViewMode === 'full'
                            ? 'bg-purple-600 text-white font-black shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        12 Tháng
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnnualViewMode('actual_only')}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          annualViewMode === 'actual_only'
                            ? 'bg-purple-600 text-white font-black shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {syncedMonthKeys.length || 1} Tháng Thực Tế
                      </button>
                    </div>
                  )}
                </div>

                {/* Right: Active Scope Summary + Compact Export Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {sheetTab === 'Báo cáo ngày' && `Ngày ${selectedReportDay} · ${selectedReportMonth}/${selectedYear}`}
                      {sheetTab === 'Báo cáo tuần' && `Tuần ${selectedReportWeek} (${getWeekDateRange(selectedReportWeek, selectedYear).dateRangeLabel})`}
                      {sheetTab.startsWith('Tháng') && `Tổng hợp ${sheetTab}/${selectedYear}`}
                      {sheetTab === 'Báo cáo năm' && `Năm ${selectedYear} (${annualViewMode === 'full' ? '12 Tháng' : `${syncedMonthKeys.length || 1} Tháng thực tế`})`}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap"
                    title="Xuất báo cáo Excel theo khoảng thời gian đang chọn"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    <span>Xuất Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportWord}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap"
                    title="Xuất báo cáo Word (.doc) chuyên nghiệp theo khoảng thời gian đang chọn"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>Xuất Word</span>
                  </button>
                </div>
              </div>

              {/* Contextual Row 2: Month Picker + Day/Week Fine Controls (Hidden in Annual Mode) */}
              {(sheetTab === 'Báo cáo ngày' || sheetTab === 'Báo cáo tuần' || sheetTab.startsWith('Tháng')) && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {/* 12 Months Bar */}
                  <div className="flex flex-wrap items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">
                    <span className="text-slate-500 pl-2 pr-1 text-[11px] tabular-nums">Tháng ({selectedYear}):</span>
                    {ALL_MONTHS.map(m => {
                      const mNum = getMonthNumber(m);
                      const hasSynced = Boolean(monthlyDataStore[m] && monthlyDataStore[m].length > 0);
                      const isSelected = selectedReportMonth === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          title={`${m}/${selectedYear}${hasSynced ? ' (Đã lưu trong hệ thống)' : ' (Chưa có dữ liệu - bấm để kiểm tra/đồng bộ)'}`}
                          onClick={() => {
                            setSelectedReportMonth(m);
                            setTimePeriod(`${m}/${selectedYear}`);
                            const stored = monthlyDataStore[m];
                            const targetItems = stored && stored.length > 0 ? stored : (m === 'Tháng 2' && selectedYear === 2026 ? caseReports : []);
                            const maxD = getDaysInMonth(m, selectedYear);
                            const latestDInMonth = targetItems.length > 0 ? findLatestDayInItems(targetItems, maxD) : 1;
                            setSelectedReportDay(latestDInMonth);
                            setSelectedReportWeek(getWeekNumberForDate(selectedYear, mNum, latestDInMonth));
                            if (targetItems.length > 0) {
                              setCaseReports(targetItems);
                            } else {
                              setCaseReports([]);
                            }
                            if (sheetTab.startsWith('Tháng')) {
                              setSheetTab(m);
                            }
                          }}
                          className={`px-2 py-1 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 ${
                            isSelected
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-2xs border border-slate-300 dark:border-slate-600'
                              : hasSynced
                              ? 'text-emerald-700 dark:text-emerald-300 hover:bg-white/70 dark:hover:bg-slate-700/70'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          <span>T{mNum}</span>
                          {hasSynced && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Day Picker */}
                  {sheetTab === 'Báo cáo ngày' && (
                    <div className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">
                      <span className="text-slate-500 pl-2 text-[11px]">Ngày:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedReportDay(prev => Math.max(1, prev - 1))}
                        disabled={selectedReportDay <= 1}
                        className="p-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title="Ngày trước"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <select
                        value={selectedReportDay}
                        onChange={e => setSelectedReportDay(Number(e.target.value))}
                        className="bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 font-black px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 outline-none cursor-pointer text-xs"
                      >
                        {Array.from({ length: getDaysInMonth(selectedReportMonth, selectedYear) }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                            Ngày {d}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          const maxD = getDaysInMonth(selectedReportMonth, selectedYear);
                          setSelectedReportDay(prev => Math.min(maxD, prev + 1));
                        }}
                        disabled={selectedReportDay >= getDaysInMonth(selectedReportMonth, selectedYear)}
                        className="p-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title="Ngày sau"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Week Picker */}
                  {sheetTab === 'Báo cáo tuần' && (
                    <div className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">
                      <span className="text-slate-500 pl-2 text-[11px]">Tuần (1-52):</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextW = Math.max(1, selectedReportWeek - 1);
                          setSelectedReportWeek(nextW);
                          setSelectedReportMonth(getWeekDateRange(nextW, selectedYear).startMonthStr);
                        }}
                        disabled={selectedReportWeek <= 1}
                        className="p-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title="Tuần trước"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <select
                        value={selectedReportWeek}
                        onChange={e => {
                          const w = Number(e.target.value);
                          setSelectedReportWeek(w);
                          const info = getWeekDateRange(w, selectedYear);
                          setSelectedReportMonth(info.startMonthStr);
                        }}
                        className="bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 font-black px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 outline-none cursor-pointer text-xs"
                      >
                        {Array.from({ length: 52 }, (_, i) => i + 1).map(w => {
                          const info = getWeekDateRange(w, selectedYear);
                          return (
                            <option key={w} value={w} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                              Tuần {w} ({info.dateRangeLabel})
                            </option>
                          );
                        })}
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          const nextW = Math.min(52, selectedReportWeek + 1);
                          setSelectedReportWeek(nextW);
                          setSelectedReportMonth(getWeekDateRange(nextW, selectedYear).startMonthStr);
                        }}
                        disabled={selectedReportWeek >= 52}
                        className="p-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title="Tuần sau"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Band 3: Service Department Filter, Pinning & Search */}
            <div className="px-4 py-3 bg-slate-100/80 dark:bg-slate-800/45 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="cls-report-category-select"
                    className="text-xs font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Filter className="w-3.5 h-3.5 shrink-0" />
                    <span>Bộ phận:</span>
                  </label>
                  <select
                    id="cls-report-category-select"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 cursor-pointer min-w-[165px]"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat === 'Tất cả' ? 'Tất cả bộ phận' : cat}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPinnedOnly(prev => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    showPinnedOnly
                      ? 'bg-amber-500 text-slate-950 font-black shadow-2xs border border-amber-600'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                  }`}
                  title="Chỉ hiển thị các kỹ thuật đã ghim"
                >
                  <Star className={`w-3.5 h-3.5 shrink-0 ${showPinnedOnly ? 'fill-current' : ''}`} />
                  <span>Chỉ xem mục ghim ({pinnedServiceNames.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPinManagerOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border border-slate-300 dark:border-slate-600 whitespace-nowrap"
                  title="Cấu hình danh sách các chỉ số trọng điểm đã ghim"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                  <span>Quản lý ghim</span>
                </button>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                {(selectedCategory !== 'Tất cả' || showPinnedOnly || searchTerm.trim() !== '') && (
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                    {filteredItems.length}/{caseReports.length} kỹ thuật
                  </span>
                )}
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Tìm tên kỹ thuật..."
                    className="pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200 w-full sm:w-56"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title="Xóa từ khóa tìm kiếm"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* MAIN VIEW CONTENT BASED ON SELECTED TAB */}
          {sheetTab === 'Báo cáo ngày' && renderDailyReport()}
          {sheetTab === 'Báo cáo tuần' && renderWeeklyReport()}
          {sheetTab === 'Báo cáo năm' && renderAnnualReport()}

          {sheetTab.startsWith('Tháng') && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm overflow-hidden">
              {/* Sheet Title Bar Header */}
            <div className="bg-slate-100/80 dark:bg-slate-800/80 px-5 py-3 border-b-[1.5px] border-slate-300 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-wide uppercase">
                  BÁO CÁO GIAO BAN KHOA CẬN LÂM SÀNG
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  Thời gian: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{sheetTab} - Năm {selectedYear}</span> &middot; Bấm trực tiếp vào ô số liệu để chỉnh sửa thủ công (được khóa bảo vệ khỏi ghi đè khi đồng bộ Sheet)
                </p>
              </div>

              <div className="flex items-center space-x-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 rounded-xl text-emerald-800 dark:text-emerald-300">
                  TỔNG CỘNG THÁNG: <strong className="text-emerald-700 dark:text-emerald-200 text-sm ml-1">{calculateGrandTotal().toLocaleString()} Ca</strong>
                </div>
              </div>
            </div>

            {/* Scrollable Spreadsheet Table Container */}
            <div className="overflow-auto scrollbar-thin max-h-[680px] relative">
              <table className="w-full text-[13px] text-left border-separate border-spacing-0 min-w-[1750px] tabular-nums">
                <thead>
                  {/* Header Row 1: Day Numbers (1 to 28 / 31) */}
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 select-none">
                    <th colSpan={2} className="px-4 py-2.5 font-extrabold text-slate-900 dark:text-slate-100 border-b border-r-[1.5px] border-slate-400 dark:border-slate-600 sticky top-0 left-0 z-30 bg-slate-100 dark:bg-slate-800 w-[308px] min-w-[308px] h-[38px]">
                      Ngày trong tháng →
                    </th>
                    {daysList.map(day => {
                      // Highlight LT holiday days (15-21 in Feb ONLY - avoid matching Month 12) or weekends in yellow
                      const isLT = getMonthNumber(sheetTab) === 2 && day >= 15 && day <= 21;
                      const isWeekend = day === 7 || day === 8;
                      return (
                        <th 
                          key={day} 
                          colSpan={2} 
                          className={`text-center py-2 font-extrabold text-[13px] border-b border-r-[1.5px] border-slate-400/80 dark:border-slate-600 sticky top-0 z-20 h-[38px] ${
                            isLT
                              ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
                              : isWeekend 
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200' 
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          {day}
                        </th>
                      );
                    })}
                    <th colSpan={4} className="text-center py-2 font-extrabold text-[13px] bg-indigo-100 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-200 border-b border-l-2 border-indigo-400 dark:border-indigo-700 sticky top-0 z-20 h-[38px]">
                      Tổng
                    </th>
                  </tr>

                  {/* Header Row 2: BH / ND / Tất cả / TB(ngày) Sub-columns */}
                  <tr className="bg-slate-50 dark:bg-slate-800/95 text-slate-700 dark:text-slate-200 text-xs font-extrabold select-none">
                    <th className="px-4 py-2 sticky top-[38px] left-0 z-30 bg-slate-50 dark:bg-slate-800 border-b-2 border-r border-slate-400 dark:border-slate-600 w-[256px] min-w-[256px] max-w-[256px] h-[34px]">
                      Danh Mục Kỹ Thuật / Dịch Vụ
                    </th>
                    <th className="text-center border-b-2 border-r-[1.5px] border-slate-400 dark:border-slate-600 sticky top-[38px] left-[256px] z-30 bg-slate-50 dark:bg-slate-800 w-[52px] min-w-[52px] max-w-[52px] h-[34px]">
                      Loại
                    </th>
                    {daysList.map(day => {
                      const isLT = getMonthNumber(sheetTab) === 2 && day >= 15 && day <= 21;
                      const isWeekend = day === 7 || day === 8;
                      return (
                        <React.Fragment key={day}>
                          <th className={`w-10 text-center py-1.5 border-b-2 border-b-slate-400 border-r border-r-slate-300 dark:border-slate-600 font-extrabold sticky top-[38px] z-20 h-[34px] ${
                            isLT ? 'bg-red-50 dark:bg-red-950 text-red-700' : isWeekend ? 'bg-amber-50 dark:bg-amber-950 text-amber-900' : 'bg-slate-50 dark:bg-slate-800'
                          }`}>
                            BH
                          </th>
                          <th className={`w-10 text-center py-1.5 border-b-2 border-b-slate-400 border-r-[1.5px] border-r-slate-400/80 dark:border-slate-600 font-extrabold sticky top-[38px] z-20 h-[34px] ${
                            isLT ? 'bg-red-50 dark:bg-red-950 text-red-700' : isWeekend ? 'bg-amber-50 dark:bg-amber-950 text-amber-900' : 'bg-slate-50 dark:bg-slate-800'
                          }`}>
                            ND
                          </th>
                        </React.Fragment>
                      );
                    })}
                    <th className="w-14 text-center py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200 border-b-2 border-r border-l-2 border-l-indigo-400 border-indigo-200 font-extrabold sticky top-[38px] z-20 h-[34px]">
                      BH
                    </th>
                    <th className="w-14 text-center py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200 border-b-2 border-r border-indigo-200 font-extrabold sticky top-[38px] z-20 h-[34px]">
                      ND
                    </th>
                    <th className="w-16 text-center py-1.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-950 dark:text-indigo-100 border-b-2 border-r border-indigo-300 font-extrabold sticky top-[38px] z-20 h-[34px]">
                      Tất cả
                    </th>
                    <th className="w-20 text-center py-1.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-950 dark:text-indigo-100 border-b-2 border-indigo-300 font-extrabold sticky top-[38px] z-20 h-[34px]">
                      TB(ngày)
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* TOP PINNED SERVICES MATRIX (If any pinned items match current search & not in showPinnedOnly mode) */}
                  {pinnedMatrixItems.length > 0 && !showPinnedOnly && (
                    <React.Fragment>
                      <tr className="bg-amber-100/90 dark:bg-amber-950/80 font-extrabold text-amber-950 dark:text-amber-200">
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 sticky left-0 z-10 bg-amber-100 dark:bg-amber-950 border-b border-r border-amber-300 dark:border-amber-800 w-[308px] min-w-[308px]">
                          ⭐ CHỈ SỐ KỸ THUẬT TRỌNG ĐIỂM ĐÃ GHIM ({pinnedMatrixItems.length})
                        </td>
                        <td colSpan={daysList.length * 2 + 4} className="bg-amber-100/60 dark:bg-amber-950/40 border-b border-amber-300 dark:border-amber-800"></td>
                      </tr>
                      {pinnedMatrixItems.map((item, itemIdx) => (
                        <tr key={`pinned-top-${item.id}-${itemIdx}`} className="bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors">
                          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100 sticky left-0 z-10 bg-amber-50/95 dark:bg-slate-900 border-b border-r border-amber-300/70 dark:border-slate-700 w-[256px] min-w-[256px] max-w-[256px]" title={item.name}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleTogglePinService(item.name)}
                                className="shrink-0 p-0.5 rounded text-amber-500 hover:text-amber-600 transition-all cursor-pointer"
                                title="Bỏ ghim chỉ số"
                              >
                                <Star className="w-4 h-4 fill-current" />
                              </button>
                              <span className="truncate text-[13px] font-bold text-amber-950 dark:text-amber-200">{item.name}</span>
                            </div>
                          </td>
                          <td className="text-center font-semibold text-amber-700 dark:text-amber-400 sticky left-[256px] z-10 bg-amber-50/95 dark:bg-slate-900 border-b border-r border-amber-300/70 dark:border-slate-700 text-[11px] w-[52px] min-w-[52px] max-w-[52px]">
                            Ca
                          </td>
                          {daysList.map(day => {
                            const isLT = getMonthNumber(sheetTab) === 2 && day >= 15 && day <= 21;
                            const isWeekend = day === 7 || day === 8;
                            const dayData = item.dailyData[day] || { bh: 0, nd: 0 };
                            return (
                              <React.Fragment key={day}>
                                <td className={`text-center py-2 border-b border-slate-300 border-r border-r-slate-300 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200 ${isLT ? 'bg-red-50/50' : isWeekend ? 'bg-amber-50/50' : ''}`}>
                                  {dayData.bh === 'LT' ? <span className="text-red-600 font-extrabold italic text-xs">LT</span> : (dayData.bh || <span className="text-slate-300 dark:text-slate-700">-</span>)}
                                </td>
                                <td className={`text-center py-2 border-b border-slate-300 border-r-[1.5px] border-r-slate-400/80 dark:border-slate-600 font-medium text-slate-700 dark:text-slate-300 ${isLT ? 'bg-red-50/50' : isWeekend ? 'bg-amber-50/50' : ''}`}>
                                  {dayData.nd === 'LT' ? <span className="text-red-600 font-extrabold italic text-xs">LT</span> : (dayData.nd || <span className="text-slate-300 dark:text-slate-700">-</span>)}
                                </td>
                              </React.Fragment>
                            );
                          })}
                          <td className="text-center py-2 font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-r border-l-2 border-l-indigo-400 border-indigo-300">
                            {getRowTotal(item, 'bh') || 0}
                          </td>
                          <td className="text-center py-2 font-bold text-slate-800 dark:text-slate-200 bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-r border-indigo-300">
                            {getRowTotal(item, 'nd') || 0}
                          </td>
                          <td className="text-center py-2 font-extrabold text-blue-950 dark:text-blue-100 bg-blue-100/70 dark:bg-blue-950/60 border-b border-r border-blue-300">
                            {getRowTotal(item, 'bh') + getRowTotal(item, 'nd')}
                          </td>
                          <td className="text-center py-2 font-semibold text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-300">
                            {getItemAveragePerDay(item)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  )}

                  {groupedCategories.map(group => (
                    <React.Fragment key={group.categoryName}>
                      {/* Category Parent Row Header */}
                      <tr className="bg-indigo-50/90 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-slate-100">
                        <td colSpan={2} className="px-4 py-2.5 text-[13px] font-black uppercase tracking-wider text-indigo-950 dark:text-indigo-200 sticky left-0 z-10 bg-indigo-50 dark:bg-slate-800 border-b border-r-[1.5px] border-slate-400 dark:border-slate-600 w-[308px] min-w-[308px]">
                          📌 {group.categoryName}
                        </td>
                        <td colSpan={daysList.length * 2 + 4} className="bg-indigo-50/70 dark:bg-slate-800/70 border-b border-slate-400/80 dark:border-slate-600"></td>
                      </tr>

                      {/* Detail Service Rows under Category */}
                      {group.items.map((item, itemIdx) => {
                        const isPinned = pinnedServiceNames.some(p => p.trim().toLowerCase() === item.name.trim().toLowerCase());
                        return (
                          <tr 
                            key={`${item.id}-${itemIdx}`} 
                            className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/80 transition-colors"
                          >
                            {/* Service Name (Sticky Left with Pin Button) */}
                            <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100 sticky left-0 z-10 bg-white dark:bg-slate-900 border-b border-r border-slate-300 dark:border-slate-700 w-[256px] min-w-[256px] max-w-[256px]" title={item.name}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePinService(item.name)}
                                  className={`shrink-0 p-0.5 rounded transition-all cursor-pointer ${
                                    isPinned
                                      ? 'text-amber-500 hover:text-amber-600'
                                      : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                                  }`}
                                  title={isPinned ? 'Bỏ ghim khỏi danh sách trọng điểm' : 'Ghim kỹ thuật lên đầu báo cáo'}
                                >
                                  <Star className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
                                </button>
                                <span className={`truncate text-[13px] ${isPinned ? 'font-bold text-amber-950 dark:text-amber-200' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
                                  {item.name}
                                </span>
                              </div>
                            </td>
                            <td className="text-center font-semibold text-slate-500 sticky left-[256px] z-10 bg-white dark:bg-slate-900 border-b border-r-[1.5px] border-slate-400/80 dark:border-slate-600 text-[11px] w-[52px] min-w-[52px] max-w-[52px]">
                              Ca
                            </td>

                          {/* Days Cells (Archived on system; click to edit manually only) */}
                          {daysList.map(day => {
                            const isLT = getMonthNumber(sheetTab) === 2 && day >= 15 && day <= 21;
                            const isWeekend = day === 7 || day === 8;
                            const dayData = item.dailyData[day] || { bh: 0, nd: 0 };
                            const isManualDay = Boolean(item.manualDays?.[day]);
                            const isEditingBh = editingCell?.itemId === item.id && editingCell.day === day && editingCell.type === 'bh';
                            const isEditingNd = editingCell?.itemId === item.id && editingCell.day === day && editingCell.type === 'nd';

                            return (
                              <React.Fragment key={day}>
                                {/* BH Cell */}
                                <td
                                  onClick={() => {
                                    if (!isEditingBh) {
                                      setEditingCell({ itemId: item.id, day, type: 'bh' });
                                      setEditValue(dayData.bh === 'LT' ? 'LT' : String(dayData.bh ?? 0));
                                    }
                                  }}
                                  title={`Bấm để sửa thủ công BH Ngày ${day}${isManualDay ? ' (Đã chỉnh sửa thủ công & khóa)' : ''}`}
                                  className={`text-center py-2 border-b border-slate-300 border-r border-r-slate-300 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-blue-100/70 dark:hover:bg-blue-900/40 ${
                                    isManualDay ? 'bg-amber-50/40 dark:bg-amber-950/20' : isLT ? 'bg-red-50/50 dark:bg-red-950/30' : isWeekend ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                                  }`}
                                >
                                  {isEditingBh ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={handleSaveCell}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCell();
                                        if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-10 text-center text-xs font-bold px-0.5 py-0.5 bg-white dark:bg-slate-800 border border-blue-500 rounded outline-none"
                                    />
                                  ) : dayData.bh === 'LT' ? (
                                    <span className="text-red-600 dark:text-red-400 font-extrabold italic text-xs">LT</span>
                                  ) : (
                                    dayData.bh || <span className="text-slate-300 dark:text-slate-700 font-normal">-</span>
                                  )}
                                </td>

                                {/* ND Cell */}
                                <td
                                  onClick={() => {
                                    if (!isEditingNd) {
                                      setEditingCell({ itemId: item.id, day, type: 'nd' });
                                      setEditValue(dayData.nd === 'LT' ? 'LT' : String(dayData.nd ?? 0));
                                    }
                                  }}
                                  title={`Bấm để sửa thủ công ND Ngày ${day}${isManualDay ? ' (Đã chỉnh sửa thủ công & khóa)' : ''}`}
                                  className={`text-center py-2 border-b border-slate-300 border-r-[1.5px] border-r-slate-400/80 dark:border-slate-600 font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 ${
                                    isManualDay ? 'bg-amber-50/40 dark:bg-amber-950/20' : isLT ? 'bg-red-50/50 dark:bg-red-950/30' : isWeekend ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                                  }`}
                                >
                                  {isEditingNd ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={handleSaveCell}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCell();
                                        if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-10 text-center text-xs font-bold px-0.5 py-0.5 bg-white dark:bg-slate-800 border border-emerald-500 rounded outline-none"
                                    />
                                  ) : dayData.nd === 'LT' ? (
                                    <span className="text-red-600 dark:text-red-400 font-extrabold italic text-xs">LT</span>
                                  ) : (
                                    dayData.nd || <span className="text-slate-300 dark:text-slate-700 font-normal">-</span>
                                  )}
                                </td>
                              </React.Fragment>
                            );
                          })}

                          {/* Row Summary Columns: BH, ND, Tất cả, TB(ngày) */}
                          <td className="text-center py-2 font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-r border-l-2 border-l-indigo-400 border-indigo-200">
                            {getRowTotal(item, 'bh') || 0}
                          </td>
                          <td className="text-center py-2 font-bold text-slate-800 dark:text-slate-200 bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-r border-indigo-200">
                            {getRowTotal(item, 'nd') || 0}
                          </td>
                          <td className="text-center py-2 font-extrabold text-blue-950 dark:text-blue-100 bg-blue-100/70 dark:bg-blue-950/60 border-b border-r border-blue-300">
                            {getRowTotal(item, 'bh') + getRowTotal(item, 'nd')}
                          </td>
                          <td className="text-center py-2 font-semibold text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-300">
                            {getItemAveragePerDay(item)}
                          </td>
                        </tr>
                      );
                    })}

                      {/* Category Subtotal Row (Blue Highlighted Row matching Screenshots!) */}
                      <tr className="bg-sky-100 dark:bg-sky-950 font-extrabold text-slate-900 dark:text-slate-100">
                        <td className="px-4 py-2.5 text-[13px] font-black text-blue-950 dark:text-blue-100 sticky left-0 z-10 bg-sky-100 dark:bg-sky-950 border-b border-r border-sky-300 dark:border-sky-800 w-[256px] min-w-[256px] max-w-[256px]">
                          Tổng số {group.categoryName}
                        </td>
                        <td className="text-center text-[11px] text-blue-900 dark:text-blue-200 sticky left-[256px] z-10 bg-sky-100 dark:bg-sky-950 border-b border-r border-sky-300 dark:border-sky-800 w-[52px] min-w-[52px] max-w-[52px]">
                          Tổng
                        </td>
                        {daysList.map(day => {
                          const bhTotal = getCategoryDayTotal(group.categoryName, day, 'bh');
                          const ndTotal = getCategoryDayTotal(group.categoryName, day, 'nd');
                          return (
                            <React.Fragment key={day}>
                              <td className="text-center py-2 font-extrabold border-b border-r border-sky-300/75 dark:border-sky-800">
                                {bhTotal === 'LT' ? <span className="text-red-600 dark:text-red-400 font-extrabold italic text-xs">LT</span> : (bhTotal || '-')}
                              </td>
                              <td className="text-center py-2 font-extrabold border-b border-r border-sky-300 dark:border-sky-700">
                                {ndTotal === 'LT' ? <span className="text-red-600 dark:text-red-400 font-extrabold italic text-xs">LT</span> : (ndTotal || '-')}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="text-center py-2 font-black text-blue-950 dark:text-blue-100 bg-sky-200 dark:bg-sky-900 border-b border-r border-l-2 border-l-indigo-400 border-sky-300">
                          {group.items.reduce((acc, i) => acc + getRowTotal(i, 'bh'), 0)}
                        </td>
                        <td className="text-center py-2 font-black text-blue-950 dark:text-blue-100 bg-sky-200 dark:bg-sky-900 border-b border-r border-sky-300">
                          {group.items.reduce((acc, i) => acc + getRowTotal(i, 'nd'), 0)}
                        </td>
                        <td className="text-center py-2 font-black text-blue-950 dark:text-blue-100 bg-blue-200 dark:bg-blue-900 border-b border-r border-blue-300">
                          {group.items.reduce((acc, i) => acc + getRowTotal(i), 0)}
                        </td>
                        <td className="text-center py-2 font-extrabold text-blue-950 dark:text-blue-100 bg-sky-200/80 dark:bg-sky-900/80 border-b border-sky-300">
                          {getCategoryAveragePerDay(group.categoryName)}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                  {groupedCategories.length === 0 && (
                    <tr>
                      <td colSpan={daysList.length * 2 + 6} className="px-6 py-10 text-center">
                        <div className="max-w-lg mx-auto space-y-2">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            Chưa có dữ liệu đồng bộ cho {sheetTab}/{selectedYear}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Hệ thống hỗ trợ tự động nhận diện các tên tab: <strong>{sheetTab}</strong>, <strong>{sheetTab}/{selectedYear}</strong>, <strong>T{getMonthNumber(sheetTab)}</strong>, <strong>{getMonthNumber(sheetTab)}/{selectedYear}</strong>. Hãy đảm bảo Google Sheet năm {selectedYear} đã mở quyền xem công khai và bấm <strong>Đồng bộ ngay</strong>.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
        );
      })()}

      {/* TAB 2: OVERVIEW DASHBOARD & CHARTS */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Overview KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tỷ Lệ Hoàn Thành Task</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">97.5%</h3>
                <span className="text-xs font-bold text-emerald-600 flex items-center">
                  +3.0% <TrendingUp className="w-3.5 h-3.5 ml-0.5" />
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">40/41 công việc hoàn thành đúng hạn</p>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tổng Ca Trực Đêm Tháng</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">22 Ca</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">100% Phủ kín</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Phân bổ đều cho 5 nhân sự</p>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tổng Lượt Chụp / Xét Nghiệm</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{calculateGrandTotal().toLocaleString()} Ca</h3>
                <span className="text-xs font-bold text-emerald-600 flex items-center">+12% vs T2</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Đồng bộ từ Google Sheets Báo cáo giao ban</p>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Chi Phí Bảo Trì & Sửa Chữa</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">14.0 Triệu</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">Trong ngân sách</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">1 lần sửa chữa cảm biến CT</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Task Completion Rate */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" /> Tiến Độ Hoàn Thành Công Việc Theo Tuần
                </h3>
                <span className="text-xs font-semibold text-slate-500">% Đúng hạn</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={taskCompletionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="week" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} domain={[70, 100]} />
                    <Tooltip />
                    <Area type="monotone" dataKey="rate" stroke="#4f46e5" fill="#e0e7ff" strokeWidth={2} name="Tỷ lệ hoàn thành (%)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Staff Shift Distribution */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" /> Thống Kê Ca Trực Theo Nhân Viên
                </h3>
                <span className="text-xs font-semibold text-slate-500">Số ca / Tháng</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={shiftCountData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="shifts" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Tổng ca trực" />
                    <Bar dataKey="nightShifts" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Ca trực đêm" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: Equipment Usage Frequency derived from Google Sheet */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" /> Tần Suất Ca Chụp & Xét Nghiệm Theo Bộ Phận
                </h3>
                <span className="text-xs font-semibold text-slate-500">Số lượt</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={equipmentUsageData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" stroke="#64748b" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} width={130} />
                    <Tooltip />
                    <Bar dataKey="cases" fill="#10b981" radius={[0, 4, 4, 0]} name="Số ca chụp/xét nghiệm" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4: Maintenance Costs History */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-600" /> Biến Động Chi Phí Bảo Trì & Sửa Chữa (Triệu VNĐ)
                </h3>
                <span className="text-xs font-semibold text-slate-500">Theo tháng</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={maintenanceCostData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="cost" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5 }} name="Chi phí (Triệu VNĐ)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Benchmarking & Clinical Triage Modal */}
      {selectedBenchmarkingItem && (
        <ContextualBenchmarkingModal
          item={selectedBenchmarkingItem}
          onClose={() => setSelectedBenchmarkingItem(null)}
          selectedDay={selectedReportDay}
          selectedMonth={selectedReportMonth}
        />
      )}

      {/* Fast Pin Manager Modal */}
      {isPinManagerOpen && (
        <FastPinManagerModal
          isOpen={isPinManagerOpen}
          onClose={() => setIsPinManagerOpen(false)}
          allServices={allUniqueServicesList.map((s, idx) => ({
            id: `${s.category}::${s.name}::${idx}`,
            category: s.category,
            name: s.name,
            dailyData: {}
          }))}
          pinnedNames={pinnedServiceNames}
          onSavePinnedNames={handleSavePinnedNames}
        />
      )}

      {/* Quick Daily Data Entry Modal */}
      {isDailyEntryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Nhập / Cập Nhật Số Liệu Ngày {selectedReportDay} - {selectedReportMonth}/{selectedYear}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Nhập số ca BHYT và Nhân dân (hoặc nhập "LT" nếu là ngày nghỉ Lễ/Tết). Số liệu được khóa lưu bất biến trên hệ thống, không bị xóa hay ghi đè khi thay đổi file Google Sheet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDailyEntryOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-2 custom-scrollbar flex-1">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[11px] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Bộ Phận</th>
                    <th className="py-2.5 px-3">Kỹ Thuật / Dịch Vụ</th>
                    <th className="py-2.5 px-3 w-28 text-right">Bảo Hiểm (BH)</th>
                    <th className="py-2.5 px-3 w-28 text-right">Nhân Dân (ND)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(monthlyDataStore[selectedReportMonth] || caseReports).map((item) => {
                    const draft = dailyDraftValues[item.id] || { bh: '0', nd: '0' };
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">{item.category}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-100">{item.name}</td>
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            value={draft.bh}
                            onChange={(e) =>
                              setDailyDraftValues((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, bh: e.target.value }
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-right font-bold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-indigo-700 dark:text-indigo-300 outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            value={draft.nd}
                            onChange={(e) =>
                              setDailyDraftValues((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, nd: e.target.value }
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-right font-bold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-emerald-700 dark:text-emerald-300 outline-none focus:border-emerald-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDailyEntryOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  const parseCell = (v: string): number | string => {
                    const clean = v.trim().toUpperCase();
                    if (clean === 'LT') return 'LT';
                    const num = parseInt(clean.replace(/[^0-9]/g, ''), 10);
                    return Number.isFinite(num) ? num : 0;
                  };
                  const currentList = monthlyDataStore[selectedReportMonth] || caseReports;
                  const updatedList = currentList.map((item) => {
                    const draft = dailyDraftValues[item.id];
                    if (!draft) return item;
                    return {
                      ...item,
                      dailyData: {
                        ...item.dailyData,
                        [selectedReportDay]: {
                          bh: parseCell(draft.bh),
                          nd: parseCell(draft.nd)
                        }
                      }
                    };
                  });
                  const lockedList = reportArchiveService.saveManualDayUpdates(
                    selectedYear,
                    selectedReportMonth,
                    updatedList,
                    [selectedReportDay],
                    storageService.getCurrentUser().name
                  );
                  setMonthlyDataStore((prev) => ({ ...prev, [selectedReportMonth]: lockedList }));
                  setCaseReports(lockedList);
                  setIsDailyEntryOpen(false);
                  setSyncToast(`🔒 Đã lưu thủ công & khóa bảo vệ số liệu Ngày ${selectedReportDay} - ${selectedReportMonth}/${selectedYear}!`);
                  setTimeout(() => setSyncToast(null), 3500);
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu Số Liệu Ngày {selectedReportDay}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Selective Time-Range Audit & Discrepancy Confirmation Modal */}
      {isResyncModalOpen && (() => {
        const selectedAuditCount = auditDiscrepancies.filter((d) => selectedDiscrepancyIds[d.id]).length;
        const manualConflictCount = auditDiscrepancies.filter((d) => d.isManualLocked).length;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div
              className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full overflow-hidden transition-all ${
                auditStep === 'result' && auditDiscrepancies.length > 0 ? 'max-w-3xl' : 'max-w-lg'
              }`}
            >
              {/* Header */}
              <div className="px-5 py-4 bg-amber-50/70 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Rà Soát &amp; Đối Chiếu Số Liệu Google Sheet
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Kiểm tra sai lệch theo khoảng thời gian tùy chọn · Chỉ cập nhật khi bạn xác nhận
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResyncModalOpen(false)}
                  disabled={auditStep === 'checking' || isApplyingAudit}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 text-xs">
                {auditError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <span className="leading-relaxed font-medium">{auditError}</span>
                  </div>
                )}

                {auditStep === 'select' && (
                  <>
                    {/* Target Year Input */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <label className="sm:col-span-4 font-bold text-slate-700 dark:text-slate-200">
                        Năm nguồn Sheet:
                      </label>
                      <div className="sm:col-span-8 flex items-center gap-2">
                        <input
                          type="number"
                          min={MIN_REPORT_YEAR}
                          max={MAX_REPORT_YEAR}
                          value={resyncYearInput}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                            setResyncYearInput(clean);
                            if (clean.length === 4) {
                              const y = parseInt(clean, 10);
                              if (isValidReportYear(y)) {
                                setResyncYear(y);
                                applyResyncPreset('month', y);
                              }
                            }
                          }}
                          className="w-28 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-center text-emerald-700 dark:text-emerald-300 tabular-nums outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {resolveSpreadsheetId(getEffectiveSheetTarget(resyncYear))
                            ? 'Đã gắn ID Sheet'
                            : `Chưa gắn link năm ${resyncYear}`}
                        </span>
                      </div>
                    </div>

                    {/* Quick Time Range Presets */}
                    <div className="space-y-1.5">
                      <span className="block font-bold text-slate-700 dark:text-slate-200">
                        Chọn nhanh khoảng thời gian rà soát:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyResyncPreset('day', resyncYear)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950/60 border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                        >
                          Ngày {selectedReportDay}/{getMonthNumber(selectedReportMonth)}
                        </button>
                        <button
                          type="button"
                          onClick={() => applyResyncPreset('week', resyncYear)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950/60 border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                        >
                          Tuần {selectedReportWeek}
                        </button>
                        <button
                          type="button"
                          onClick={() => applyResyncPreset('month', resyncYear)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950/60 border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                        >
                          Cả {selectedReportMonth}
                        </button>
                        <button
                          type="button"
                          onClick={() => applyResyncPreset('year', resyncYear)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950/60 border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                        >
                          Cả Năm {resyncYear}
                        </button>
                      </div>
                    </div>

                    {/* Exact Start/End Date Range */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                          Từ ngày:
                        </label>
                        <input
                          type="date"
                          value={resyncStartDate}
                          onChange={(e) => setResyncStartDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                          Đến ngày:
                        </label>
                        <input
                          type="date"
                          value={resyncEndDate}
                          onChange={(e) => setResyncEndDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 leading-relaxed">
                      Hệ thống sẽ đọc trực tiếp Google Sheet và <strong>đối chiếu với dữ liệu đã lưu trên Hệ thống</strong> trong khoảng thời gian trên. Bước này <strong>không tự động ghi đè</strong>; nếu phát hiện sai lệch, bạn sẽ xem chi tiết từng ô lệch và tự quyết định có cập nhật hay không.
                    </div>
                  </>
                )}

                {auditStep === 'checking' && (
                  <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
                    <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        Đang tải và rà soát đối chiếu số liệu...
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Khoảng thời gian: {resyncStartDate.split('-').reverse().join('/')} → {resyncEndDate.split('-').reverse().join('/')}
                      </p>
                    </div>
                  </div>
                )}

                {auditStep === 'result' && auditDiscrepancies.length === 0 && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-extrabold text-emerald-800 dark:text-emerald-200">
                          Không phát hiện sai lệch nào!
                        </h4>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 leading-relaxed">
                          Đã rà soát <strong>{auditCheckedCells.toLocaleString('vi-VN')}</strong> ô dữ liệu thuộc{' '}
                          <strong>{auditCheckedMonths}</strong> tháng ({resyncStartDate.split('-').reverse().join('/')} →{' '}
                          {resyncEndDate.split('-').reverse().join('/')}). Toàn bộ số liệu đang lưu trên hệ thống hoàn toàn khớp với Google Sheet.
                        </p>
                      </div>
                    </div>
                    {auditMissingTabs.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200">
                        Lưu ý: Không tìm thấy tab Google Sheet cho: <strong>{auditMissingTabs.join(', ')}</strong>.
                      </div>
                    )}
                  </div>
                )}

                {auditStep === 'result' && auditDiscrepancies.length > 0 && (
                  <div className="space-y-3">
                    {/* Discrepancy Question Prompt Banner */}
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs font-extrabold text-amber-900 dark:text-amber-100">
                          Phát hiện {auditDiscrepancies.length} sai lệch so với Google Sheet ({resyncStartDate.split('-').reverse().join('/')} → {resyncEndDate.split('-').reverse().join('/')}) — Bạn có muốn cập nhật lại dữ liệu không?
                        </div>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                          Đã kiểm tra {auditCheckedCells.toLocaleString('vi-VN')} ô trên {auditCheckedMonths} tháng.
                          {manualConflictCount > 0 && (
                            <> Có <strong>{manualConflictCount}</strong> ô từng chỉnh sửa thủ công (đang bỏ chọn mặc định để bảo vệ).</>
                          )}
                        </p>
                      </div>
                    </div>

                    {auditMissingTabs.length > 0 && (
                      <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                        Tab chưa có trên Google Sheet: <strong>{auditMissingTabs.join(', ')}</strong>
                      </div>
                    )}

                    {/* Quick Select Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const next: Record<string, boolean> = {};
                            auditDiscrepancies.forEach((d) => { next[d.id] = true; });
                            setSelectedDiscrepancyIds(next);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                        >
                          Chọn tất cả
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next: Record<string, boolean> = {};
                            auditDiscrepancies.forEach((d) => {
                              next[d.id] = !d.isManualLocked && d.type !== 'cleared_on_sheet';
                            });
                            setSelectedDiscrepancyIds(next);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-200 font-semibold cursor-pointer"
                        >
                          Chỉ chọn lệch số &amp; bổ sung
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDiscrepancyIds({})}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                        >
                          Bỏ chọn tất cả
                        </button>
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        Đang chọn cập nhật: <span className="text-amber-600 dark:text-amber-400">{selectedAuditCount}</span> / {auditDiscrepancies.length} mục
                      </span>
                    </div>

                    {/* Discrepancy Comparison Table */}
                    <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="p-2.5 w-8 text-center">Chọn</th>
                            <th className="p-2.5">Ngày</th>
                            <th className="p-2.5">Kỹ thuật / Bộ phận</th>
                            <th className="p-2.5">Hệ thống (hiện tại)</th>
                            <th className="p-2.5">Google Sheet</th>
                            <th className="p-2.5">Phân loại</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {auditDiscrepancies.map((disc) => {
                            const isChecked = Boolean(selectedDiscrepancyIds[disc.id]);
                            const typeBadge =
                              disc.type === 'value_changed'
                                ? { label: 'Lệch số liệu', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' }
                                : disc.type === 'new_from_sheet'
                                  ? { label: 'Sheet bổ sung', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' }
                                  : disc.type === 'new_service'
                                    ? { label: 'Dịch vụ mới', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' }
                                    : { label: 'Sheet trống / đã xóa', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' };

                            return (
                              <tr
                                key={disc.id}
                                onClick={() =>
                                  setSelectedDiscrepancyIds((prev) => ({
                                    ...prev,
                                    [disc.id]: !prev[disc.id]
                                  }))
                                }
                                className={`cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                              >
                                <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) =>
                                      setSelectedDiscrepancyIds((prev) => ({
                                        ...prev,
                                        [disc.id]: e.target.checked
                                      }))
                                    }
                                    className="rounded cursor-pointer"
                                  />
                                </td>
                                <td className="p-2.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap tabular-nums">
                                  {disc.dateLabel}
                                </td>
                                <td className="p-2.5">
                                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                                    {disc.serviceName}
                                  </div>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {disc.category}
                                  </div>
                                </td>
                                <td className="p-2.5 tabular-nums whitespace-nowrap">
                                  <div className="font-semibold text-slate-700 dark:text-slate-200">
                                    BH: {disc.systemValue.bh} · ND: {disc.systemValue.nd}
                                  </div>
                                  {disc.isManualLocked && (
                                    <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[10px] font-bold">
                                      <Lock className="w-2.5 h-2.5" />
                                      Sửa tay{disc.manualUpdatedBy ? ` (${disc.manualUpdatedBy})` : ''}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 tabular-nums whitespace-nowrap font-bold text-blue-700 dark:text-blue-300">
                                  BH: {disc.sheetValue.bh} · ND: {disc.sheetValue.nd}
                                </td>
                                <td className="p-2.5 whitespace-nowrap">
                                  <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] ${typeBadge.cls}`}>
                                    {typeBadge.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Database Persistence Status Notice */}
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-200">
                      {isPgSynced ? (
                        <Cloud className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Database className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                      <div className="leading-relaxed">
                        {isPgSynced ? (
                          <>
                            Đang kết nối PostgreSQL (<strong>{pgState.sessionUserName}</strong>). Nếu bạn chọn cập nhật, các mục được đánh dấu sẽ được <strong>lưu cố định lên cơ sở dữ liệu PostgreSQL</strong>.
                          </>
                        ) : (
                          <>
                            Hệ thống đang lưu trữ an toàn cục bộ (IndexedDB & LocalStorage). Các mục được đánh dấu sẽ được lưu cố định và sẵn sàng đồng bộ ngay khi kết nối PostgreSQL.
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                {auditStep === 'select' && (
                  <>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Bước 1/2: Chọn khoảng thời gian đối chiếu
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setIsResyncModalOpen(false)}
                        className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRunRangeAudit()}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Bắt đầu Rà soát &amp; Đối chiếu</span>
                      </button>
                    </div>
                  </>
                )}

                {auditStep === 'checking' && (
                  <div className="w-full flex justify-end">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Vui lòng chờ hệ thống đối chiếu dữ liệu...
                    </span>
                  </div>
                )}

                {auditStep === 'result' && auditDiscrepancies.length === 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAuditError(null);
                        setAuditStep('select');
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
                    >
                      Rà soát khoảng khác
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsResyncModalOpen(false)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                    >
                      Đóng
                    </button>
                  </>
                )}

                {auditStep === 'result' && auditDiscrepancies.length > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={isApplyingAudit}
                      onClick={() => {
                        setAuditError(null);
                        setAuditStep('select');
                      }}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer disabled:opacity-50"
                    >
                      Chọn lại thời gian
                    </button>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        disabled={isApplyingAudit}
                        onClick={handleKeepSystemAfterAudit}
                        className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl cursor-pointer disabled:opacity-50"
                      >
                        Không cập nhật (Giữ nguyên)
                      </button>
                      <button
                        type="button"
                        disabled={isApplyingAudit || selectedAuditCount === 0}
                        onClick={() => void handleApplySelectedAuditUpdates()}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        {isApplyingAudit ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isApplyingAudit
                            ? 'Đang cập nhật...'
                            : `Có, cập nhật & Lưu dữ liệu (${selectedAuditCount} mục)`}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* TAB 3: SYNC HISTORY VIEW (INSIDE REPORTS & ANALYTICS) */}
      {activeTab === 'sync_history' && (
        <SyncHistoryView
          compact
          onShowToast={onShowToast}
          onOpenRangeAudit={(startDate, endDate, year) => {
            setActiveTab('google_sheet');
            openResyncModalWithOptions({ year, startDate, endDate });
          }}
        />
      )}
    </div>
  );
};

