import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  UserCheck,
  Trash2,
  User,
  Users,
  Building2,
  AlertTriangle,
  Filter
} from 'lucide-react';
import { LeaveRequest, StaffProfile } from '../../types/hospital';
import { removeVietnameseTones } from '../../services/searchService';
import { filterActiveStaffDisplayName, filterActiveStaffProfiles, getInactiveStaffMatchers } from '../../utils/staffStatus';

interface LeaveCalendarTabProps {
  leaveRequests: LeaveRequest[];
  profiles: StaffProfile[];
  searchTerm: string;
  isAdmin: boolean;
  canApproveLeave: boolean;
  currentUserId: string;
  onOpenCreateModal: (prefillDate?: string) => void;
  onApproveLeave: (id: string, status: 'Đã phê duyệt' | 'Từ chối') => void;
  onDeleteLeave: (id: string) => void;
}

type CalendarViewMode = 'month' | 'week' | 'roster';
type StatusFilter = 'all' | 'Chờ duyệt' | 'Đã phê duyệt' | 'Từ chối';
type LeaveTypeFilter = 'all' | LeaveRequest['leaveType'];

interface DayCell {
  date: Date;
  iso: string;
  isCurrentMonth: boolean;
  isWeekend: boolean;
}

interface WeekSpanSegment {
  leave: LeaveRequest;
  startCol: number;
  endCol: number;
  spanCols: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

const WEEKDAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const LEAVE_TYPE_OPTIONS: LeaveRequest['leaveType'][] = [
  'Phép năm',
  'Nghỉ ốm',
  'Nghỉ thai sản',
  'Học tập',
  'Nghỉ không lương'
];

const MAX_MONTH_LANES = 3;

const toISODateLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseFlexibleDate = (raw?: string): Date | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const dt = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const vnMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (vnMatch) {
    const dt = new Date(Number(vnMatch[3]), Number(vnMatch[2]) - 1, Number(vnMatch[1]));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const fallback = new Date(trimmed);
  if (isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
};

const toRangeIso = (leave: LeaveRequest): { startIso: string; endIso: string } | null => {
  const start = parseFlexibleDate(leave.startDate);
  const end = parseFlexibleDate(leave.endDate) || start;
  if (!start || !end) return null;
  const s = toISODateLocal(start);
  const e = toISODateLocal(end);
  return s <= e ? { startIso: s, endIso: e } : { startIso: e, endIso: s };
};

const formatDateShortVN = (raw?: string): string => {
  const dt = parseFlexibleDate(raw);
  if (!dt) return raw || '—';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
};

const formatDateCompactVN = (raw?: string): string => {
  const dt = parseFlexibleDate(raw);
  if (!dt) return '—';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

const getWeekdayLabelVN = (iso: string): string => {
  const dt = parseFlexibleDate(iso);
  if (!dt) return '';
  const jsDay = dt.getDay();
  const idx = jsDay === 0 ? 6 : jsDay - 1;
  return WEEKDAY_LABELS[idx] || '';
};

const getMondayOfWeek = (anchor: Date): Date => {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

const doesLeaveCoverDate = (leave: LeaveRequest, dayIso: string): boolean => {
  const range = toRangeIso(leave);
  if (!range) return false;
  return dayIso >= range.startIso && dayIso <= range.endIso;
};

const getInitials = (fullName?: string): string => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'NV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const getStatusStyle = (status: LeaveRequest['status']) => {
  switch (status) {
    case 'Đã phê duyệt':
      return {
        bar: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800/80 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/70',
        matrixCell: 'bg-emerald-500/90 dark:bg-emerald-500/80 text-white hover:bg-emerald-600',
        avatar: 'bg-emerald-600 text-white',
        label: 'Đã duyệt',
        icon: CheckCircle2,
        textClass: 'text-emerald-700 dark:text-emerald-300',
        dotClass: 'bg-emerald-500'
      };
    case 'Từ chối':
      return {
        bar: 'bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-100 border-rose-200 dark:border-rose-800/80 hover:bg-rose-100/90 dark:hover:bg-rose-900/60',
        matrixCell: 'bg-rose-400/90 dark:bg-rose-500/80 text-white hover:bg-rose-500',
        avatar: 'bg-rose-600 text-white',
        label: 'Từ chối',
        icon: XCircle,
        textClass: 'text-rose-700 dark:text-rose-300',
        dotClass: 'bg-rose-500'
      };
    default:
      return {
        bar: 'bg-amber-50 dark:bg-amber-950/65 text-amber-950 dark:text-amber-100 border-amber-300/80 dark:border-amber-700/80 hover:bg-amber-100/90 dark:hover:bg-amber-900/65',
        matrixCell: 'bg-amber-400 dark:bg-amber-500 text-slate-950 hover:bg-amber-500',
        avatar: 'bg-amber-600 text-white',
        label: 'Chờ duyệt',
        icon: Clock,
        textClass: 'text-amber-700 dark:text-amber-300',
        dotClass: 'bg-amber-500'
      };
  }
};

export const LeaveCalendarTab: React.FC<LeaveCalendarTabProps> = ({
  leaveRequests,
  profiles,
  searchTerm,
  isAdmin,
  canApproveLeave,
  currentUserId,
  onOpenCreateModal,
  onApproveLeave,
  onDeleteLeave
}) => {
  const todayIso = useMemo(() => toISODateLocal(new Date()), []);

  const [calendarView, setCalendarView] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [selectedDayIso, setSelectedDayIso] = useState<string>(todayIso);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<LeaveTypeFilter>('all');
  const [rosterOnlyWithLeaves, setRosterOnlyWithLeaves] = useState<boolean>(false);

  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [expandedDayIso, setExpandedDayIso] = useState<string | null>(null);
  const [hoveredDayIso, setHoveredDayIso] = useState<string | null>(null);

  const inactiveStaff = useMemo(() => getInactiveStaffMatchers(profiles), [profiles]);

  const activeProfiles = useMemo(
    () => filterActiveStaffProfiles(profiles),
    [profiles]
  );

  const profileByUserId = useMemo(() => {
    const map = new Map<string, StaffProfile>();
    profiles.forEach((p) => map.set(p.userId, p));
    return map;
  }, [profiles]);

  const activeLeaveRequests = useMemo(
    () =>
      leaveRequests.filter(
        (req) =>
          !inactiveStaff.ids.has(req.userId) &&
          !inactiveStaff.names.has((req.userName || '').trim().toLowerCase())
      ),
    [leaveRequests, inactiveStaff]
  );

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    activeProfiles.forEach((p) => {
      const label = (p.room || p.departmentSection || '').trim();
      if (label) set.add(label);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [activeProfiles]);

  // Scope filter (search + department + leave type) used for status counts & metrics
  const scopedRequests = useMemo(() => {
    const q = removeVietnameseTones(searchTerm);
    return activeLeaveRequests.filter((req) => {
      const staff = profileByUserId.get(req.userId);
      const staffLocation = (staff?.room || staff?.departmentSection || '').trim();
      if (departmentFilter !== 'all' && staffLocation !== departmentFilter && (staff?.departmentSection || '').trim() !== departmentFilter) {
        return false;
      }
      if (leaveTypeFilter !== 'all' && req.leaveType !== leaveTypeFilter) {
        return false;
      }
      if (!q) return true;
      const activeSub = filterActiveStaffDisplayName(req.substituteUserName, inactiveStaff.names);
      const hay = removeVietnameseTones(
        `${req.userName} ${req.userRole} ${req.leaveType} ${req.reason} ${activeSub} ${staff?.departmentSection || ''} ${staff?.room || ''}`
      );
      return hay.includes(q);
    });
  }, [activeLeaveRequests, profileByUserId, departmentFilter, leaveTypeFilter, searchTerm, inactiveStaff]);

  const filteredRequests = useMemo(() => {
    if (statusFilter === 'all') return scopedRequests;
    return scopedRequests.filter((req) => req.status === statusFilter);
  }, [scopedRequests, statusFilter]);

  // Period grid builders
  const weekDays = useMemo<DayCell[]>(() => {
    const monday = getMondayOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return {
        date,
        iso: toISODateLocal(date),
        isCurrentMonth: date.getMonth() === anchorDate.getMonth(),
        isWeekend: i >= 5
      };
    });
  }, [anchorDate]);

  const monthGridDays = useMemo<DayCell[]>(() => {
    const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const gridStart = getMondayOfWeek(firstOfMonth);
    const lastOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    const lastDayOfWeek = lastOfMonth.getDay();
    const trailingDays = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
    const gridEnd = addDays(lastOfMonth, trailingDays);

    const cells: DayCell[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      const dayOfWeek = cursor.getDay();
      cells.push({
        date: cursor,
        iso: toISODateLocal(cursor),
        isCurrentMonth: cursor.getMonth() === anchorDate.getMonth(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6
      });
      cursor = addDays(cursor, 1);
    }
    return cells;
  }, [anchorDate]);

  const monthWeeks = useMemo<DayCell[][]>(() => {
    const weeks: DayCell[][] = [];
    for (let i = 0; i < monthGridDays.length; i += 7) {
      weeks.push(monthGridDays.slice(i, i + 7));
    }
    return weeks;
  }, [monthGridDays]);

  const currentMonthDays = useMemo<DayCell[]>(() => {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const total = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: total }, (_, idx) => {
      const d = new Date(year, month, idx + 1);
      const dow = d.getDay();
      return {
        date: d,
        iso: toISODateLocal(d),
        isCurrentMonth: true,
        isWeekend: dow === 0 || dow === 6
      };
    });
  }, [anchorDate]);

  const activePeriodDays =
    calendarView === 'week'
      ? weekDays
      : calendarView === 'roster'
      ? currentMonthDays
      : monthGridDays.filter((d) => d.isCurrentMonth);

  const periodRangeBounds = useMemo(() => {
    const first = activePeriodDays[0]?.iso || todayIso;
    const last = activePeriodDays[activePeriodDays.length - 1]?.iso || todayIso;
    return { first, last };
  }, [activePeriodDays, todayIso]);

  const leavesByDayIso = useMemo(() => {
    const targetDays =
      calendarView === 'week'
        ? weekDays
        : calendarView === 'roster'
        ? currentMonthDays
        : monthGridDays;
    const map = new Map<string, LeaveRequest[]>();
    targetDays.forEach((cell) => {
      map.set(
        cell.iso,
        filteredRequests.filter((req) => doesLeaveCoverDate(req, cell.iso))
      );
    });
    return map;
  }, [calendarView, weekDays, currentMonthDays, monthGridDays, filteredRequests]);

  // Continuous multi-day spanning lane layout for each week row in Month View
  const monthWeekLayouts = useMemo(() => {
    return monthWeeks.map((week) => {
      const weekStartIso = week[0]?.iso || '';
      const weekEndIso = week[6]?.iso || '';

      const segments: WeekSpanSegment[] = [];
      filteredRequests.forEach((leave) => {
        const range = toRangeIso(leave);
        if (!range) return;
        if (range.endIso < weekStartIso || range.startIso > weekEndIso) return;

        let startCol = 0;
        let endCol = 6;
        for (let c = 0; c < 7; c++) {
          if (week[c].iso >= range.startIso) {
            startCol = c;
            break;
          }
        }
        for (let c = 6; c >= 0; c--) {
          if (week[c].iso <= range.endIso) {
            endCol = c;
            break;
          }
        }
        if (endCol < startCol) return;

        segments.push({
          leave,
          startCol,
          endCol,
          spanCols: endCol - startCol + 1,
          continuesLeft: range.startIso < weekStartIso,
          continuesRight: range.endIso > weekEndIso
        });
      });

      segments.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        if (a.spanCols !== b.spanCols) return b.spanCols - a.spanCols;
        return (a.leave.userName || '').localeCompare(b.leave.userName || '', 'vi');
      });

      const lanes: WeekSpanSegment[][] = [];
      segments.forEach((seg) => {
        let placed = false;
        for (const lane of lanes) {
          const lastInLane = lane[lane.length - 1];
          if (!lastInLane || lastInLane.endCol < seg.startCol) {
            lane.push(seg);
            placed = true;
            break;
          }
        }
        if (!placed) {
          lanes.push([seg]);
        }
      });

      const visibleLanes = lanes.slice(0, MAX_MONTH_LANES);
      const hiddenByCol = week.map((_, colIdx) => {
        let hiddenCount = 0;
        for (let l = MAX_MONTH_LANES; l < lanes.length; l++) {
          if (lanes[l].some((seg) => colIdx >= seg.startCol && colIdx <= seg.endCol)) {
            hiddenCount++;
          }
        }
        return hiddenCount;
      });

      return {
        week,
        visibleLanes,
        totalLanes: lanes.length,
        hiddenByCol,
        hasAnyOverflow: hiddenByCol.some((n) => n > 0)
      };
    });
  }, [monthWeeks, filteredRequests]);

  // Period metrics
  const periodMetrics = useMemo(() => {
    const inPeriod = filteredRequests.filter((req) => {
      const range = toRangeIso(req);
      if (!range) return false;
      return range.endIso >= periodRangeBounds.first && range.startIso <= periodRangeBounds.last;
    });

    const offTodayList = activeLeaveRequests.filter(
      (req) => req.status === 'Đã phê duyệt' && doesLeaveCoverDate(req, todayIso)
    );
    const uniqueOffToday = new Set(offTodayList.map((r) => r.userId)).size;
    const totalActiveStaff = activeProfiles.length;
    const readyCount = Math.max(0, totalActiveStaff - uniqueOffToday);
    const readinessPct = totalActiveStaff > 0 ? Math.round((readyCount / totalActiveStaff) * 100) : 100;

    return {
      inPeriodCount: inPeriod.length,
      approvedInPeriod: inPeriod.filter((r) => r.status === 'Đã phê duyệt').length,
      pendingTotal: activeLeaveRequests.filter((r) => r.status === 'Chờ duyệt').length,
      offToday: uniqueOffToday,
      readyCount,
      totalActiveStaff,
      readinessPct
    };
  }, [filteredRequests, activeLeaveRequests, activeProfiles.length, periodRangeBounds, todayIso]);

  const statusCounts = useMemo(
    () => ({
      all: scopedRequests.length,
      pending: scopedRequests.filter((r) => r.status === 'Chờ duyệt').length,
      approved: scopedRequests.filter((r) => r.status === 'Đã phê duyệt').length,
      rejected: scopedRequests.filter((r) => r.status === 'Từ chối').length
    }),
    [scopedRequests]
  );

  // Selected Day Inspector data (always respects search/department/type + active status)
  const selectedDayLeaves = useMemo(
    () => filteredRequests.filter((req) => doesLeaveCoverDate(req, selectedDayIso)),
    [filteredRequests, selectedDayIso]
  );

  const selectedDayRoomWarnings = useMemo(() => {
    const counts = new Map<string, number>();
    selectedDayLeaves
      .filter((r) => r.status !== 'Từ chối')
      .forEach((req) => {
        const staff = profileByUserId.get(req.userId);
        const roomName = (staff?.room || staff?.departmentSection || '').trim();
        if (!roomName) return;
        counts.set(roomName, (counts.get(roomName) || 0) + 1);
      });
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .map(([room, count]) => ({ room, count }));
  }, [selectedDayLeaves, profileByUserId]);

  const pendingQueue = useMemo(
    () => activeLeaveRequests.filter((req) => req.status === 'Chờ duyệt'),
    [activeLeaveRequests]
  );

  // Roster Matrix staff list
  const rosterStaffList = useMemo(() => {
    const q = removeVietnameseTones(searchTerm);
    const withLeavesIds = new Set<string>();
    filteredRequests.forEach((req) => {
      const range = toRangeIso(req);
      if (!range) return;
      if (range.endIso >= periodRangeBounds.first && range.startIso <= periodRangeBounds.last) {
        withLeavesIds.add(req.userId);
      }
    });

    const filteredStaff = activeProfiles.filter((staff) => {
      const loc = (staff.room || staff.departmentSection || '').trim();
      if (
        departmentFilter !== 'all' &&
        loc !== departmentFilter &&
        (staff.departmentSection || '').trim() !== departmentFilter
      ) {
        return false;
      }
      if (rosterOnlyWithLeaves && !withLeavesIds.has(staff.userId)) {
        return false;
      }
      if (!q) return true;
      const hay = removeVietnameseTones(`${staff.fullName} ${staff.title} ${staff.room} ${staff.departmentSection}`);
      return hay.includes(q);
    });

    // Sort staff who have leaves in current month to the top
    return [...filteredStaff].sort((a, b) => {
      const aHas = withLeavesIds.has(a.userId) ? 0 : 1;
      const bHas = withLeavesIds.has(b.userId) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.fullName.localeCompare(b.fullName, 'vi');
    });
  }, [activeProfiles, filteredRequests, periodRangeBounds, departmentFilter, rosterOnlyWithLeaves, searchTerm]);

  const handleNavigatePeriod = (direction: -1 | 1) => {
    if (calendarView === 'week') {
      const next = addDays(anchorDate, direction * 7);
      setAnchorDate(next);
      setSelectedDayIso(toISODateLocal(next));
    } else {
      const next = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1);
      setAnchorDate(next);
      setSelectedDayIso(toISODateLocal(next));
    }
  };

  const handleJumpToday = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setAnchorDate(today);
    setSelectedDayIso(toISODateLocal(today));
  };

  const handleSelectDay = (iso: string) => {
    setSelectedDayIso(iso);
  };

  const periodTitle = useMemo(() => {
    if (calendarView === 'week') {
      const start = weekDays[0]?.date;
      const end = weekDays[6]?.date;
      if (!start || !end) return '';
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      return `Tuần ${fmt(start)} – ${fmt(end)}/${end.getFullYear()}`;
    }
    return `Tháng ${String(anchorDate.getMonth() + 1).padStart(2, '0')}, ${anchorDate.getFullYear()}`;
  }, [calendarView, weekDays, anchorDate]);

  const expandedDayLeaves = useMemo(
    () => (expandedDayIso ? filteredRequests.filter((req) => doesLeaveCoverDate(req, expandedDayIso)) : []),
    [expandedDayIso, filteredRequests]
  );

  const hasExtraFilters = departmentFilter !== 'all' || leaveTypeFilter !== 'all' || statusFilter !== 'all';

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* 1. Unified Command Toolbar */}
      <div className="flex flex-col gap-3.5 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Period Nav + Title + Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
              <button
                type="button"
                onClick={() => handleNavigatePeriod(-1)}
                aria-label={calendarView === 'week' ? 'Tuần trước' : 'Tháng trước'}
                className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleJumpToday}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border-x border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => handleNavigatePeriod(1)}
                aria-label={calendarView === 'week' ? 'Tuần sau' : 'Tháng sau'}
                className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white tabular-nums whitespace-nowrap pr-1">
              {periodTitle}
            </h3>

            {/* Department / Room Dropdown */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                aria-label="Lọc theo phòng hoặc bộ phận"
                className="bg-transparent outline-none font-medium text-slate-700 dark:text-slate-200 cursor-pointer max-w-[155px] truncate"
              >
                <option value="all" className="dark:bg-slate-900">Tất cả phòng / bộ phận</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept} className="dark:bg-slate-900">
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Leave Type Dropdown */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <select
                value={leaveTypeFilter}
                onChange={(e) => setLeaveTypeFilter(e.target.value as LeaveTypeFilter)}
                aria-label="Lọc theo hình thức nghỉ"
                className="bg-transparent outline-none font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="all" className="dark:bg-slate-900">Mọi hình thức nghỉ</option>
                {LEAVE_TYPE_OPTIONS.map((lt) => (
                  <option key={lt} value={lt} className="dark:bg-slate-900">
                    {lt}
                  </option>
                ))}
              </select>
            </div>

            {hasExtraFilters && (
              <button
                type="button"
                onClick={() => {
                  setDepartmentFilter('all');
                  setLeaveTypeFilter('all');
                  setStatusFilter('all');
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Đặt lại lọc
              </button>
            )}
          </div>

          {/* Right: View Switcher + Primary Action */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div
              role="group"
              aria-label="Chế độ hiển thị lịch nghỉ"
              className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
            >
              <button
                type="button"
                onClick={() => setCalendarView('month')}
                aria-pressed={calendarView === 'month'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  calendarView === 'month'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Theo Tháng</span>
              </button>
              <button
                type="button"
                onClick={() => setCalendarView('week')}
                aria-pressed={calendarView === 'week'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  calendarView === 'week'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                <span>Theo Tuần</span>
              </button>
              <button
                type="button"
                onClick={() => setCalendarView('roster')}
                aria-pressed={calendarView === 'roster'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  calendarView === 'roster'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Theo Nhân Sự</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onOpenCreateModal(selectedDayIso || todayIso)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Đăng Ký Nghỉ</span>
            </button>
          </div>
        </div>

        {/* Row 2: Unboxed Metrics Strip (Left) + Segmented Status Filter (Right) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-y-2 text-xs divide-x divide-slate-200 dark:divide-slate-800">
            <div className="pr-4">
              <span className="text-slate-500 dark:text-slate-400">Trong kỳ: </span>
              <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                {periodMetrics.inPeriodCount} lượt
              </span>
              <span className="text-slate-400 dark:text-slate-500 mx-1" aria-hidden="true">·</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                {periodMetrics.approvedInPeriod} đã duyệt
              </span>
            </div>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'Chờ duyệt' ? 'all' : 'Chờ duyệt')}
              className="px-4 text-left hover:opacity-80 transition-opacity cursor-pointer"
              title="Nhấn để lọc đơn đang chờ phê duyệt"
            >
              <span className="text-slate-500 dark:text-slate-400">Chờ duyệt: </span>
              <span
                className={`font-bold tabular-nums ${
                  periodMetrics.pendingTotal > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {periodMetrics.pendingTotal} đơn
              </span>
            </button>

            <div className="px-4">
              <span className="text-slate-500 dark:text-slate-400">Nghỉ hôm nay ({formatDateCompactVN(todayIso)}): </span>
              <span className="font-bold text-indigo-700 dark:text-indigo-400 tabular-nums">
                {periodMetrics.offToday} cán bộ
              </span>
            </div>

            <div className="pl-4">
              <span className="text-slate-500 dark:text-slate-400">Quân số sẵn sàng: </span>
              <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                {periodMetrics.readyCount}/{periodMetrics.totalActiveStaff}
              </span>
              <span className="text-slate-500 dark:text-slate-400 tabular-nums ml-1">
                ({periodMetrics.readinessPct}%)
              </span>
            </div>
          </div>

          {/* Segmented Status Control */}
          <div
            role="group"
            aria-label="Lọc theo trạng thái phê duyệt"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 self-start lg:self-auto"
          >
            {(
              [
                { key: 'all', label: 'Tất cả', count: statusCounts.all },
                { key: 'Chờ duyệt', label: 'Chờ duyệt', count: statusCounts.pending },
                { key: 'Đã phê duyệt', label: 'Đã duyệt', count: statusCounts.approved },
                { key: 'Từ chối', label: 'Từ chối', count: statusCounts.rejected }
              ] as Array<{ key: StatusFilter; label: string; count: number }>
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(item.key)}
                aria-pressed={statusFilter === item.key}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer tabular-nums ${
                  statusFilter === item.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label} <span className="opacity-70">({item.count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Master-Detail Workspace: Primary Calendar Canvas (Left) + Day & Approval Inspector (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">
        {/* LEFT: CALENDAR VIEWPORT */}
        <div className="min-w-0 space-y-3">
          {/* VIEW 1: MONTH VIEW WITH CONTINUOUS MULTI-DAY SPANNING BARS */}
          {calendarView === 'month' && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
              {/* Weekday Header */}
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/70">
                {WEEKDAY_LABELS.map((dayName, idx) => (
                  <div
                    key={dayName}
                    className={`py-2.5 px-2 text-center text-xs font-semibold border-r last:border-r-0 border-slate-200 dark:border-slate-800 ${
                      idx >= 5
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="hidden sm:inline">{dayName}</span>
                    <span className="sm:hidden">{WEEKDAY_SHORT[idx]}</span>
                  </div>
                ))}
              </div>

              {/* Week-by-week Rows */}
              <div
                className="divide-y divide-slate-200 dark:divide-slate-800"
                onMouseLeave={() => setHoveredDayIso(null)}
              >
                {monthWeekLayouts.map((weekLayout, weekIdx) => {
                  return (
                    <div key={`week-${weekIdx}`} className="relative">
                      {/* Layer 1: Full-height Background 7-Column Day Grid */}
                      <div className="absolute inset-0 grid grid-cols-7 z-0">
                        {weekLayout.week.map((cell) => {
                          const isSelected = cell.iso === selectedDayIso;
                          return (
                            <div
                              key={`bg-${cell.iso}`}
                              onClick={() => handleSelectDay(cell.iso)}
                              onDoubleClick={() => onOpenCreateModal(cell.iso)}
                              onMouseEnter={() => setHoveredDayIso(cell.iso)}
                              className={`border-r last:border-r-0 border-slate-200 dark:border-slate-800 transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-50/50 dark:bg-indigo-950/30 ring-1 ring-inset ring-indigo-500/70'
                                  : !cell.isCurrentMonth
                                  ? 'bg-slate-50/75 dark:bg-slate-950/60'
                                  : cell.isWeekend
                                  ? 'bg-slate-50/40 dark:bg-slate-900/50 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                              }`}
                            />
                          );
                        })}
                      </div>

                      {/* Layer 2: Flow Foreground (Day Headers + Auto-expanding Event Lanes + Overflow) */}
                      <div className="relative z-10 pointer-events-none flex flex-col min-h-[84px] pb-1.5">
                        {/* Day Header Row */}
                        <div className="grid grid-cols-7">
                          {weekLayout.week.map((cell) => {
                            const dayLeaves = leavesByDayIso.get(cell.iso) || [];
                            const isToday = cell.iso === todayIso;
                            const isSelected = cell.iso === selectedDayIso;
                            const isHovered = hoveredDayIso === cell.iso;

                            return (
                              <div
                                key={`hdr-${cell.iso}`}
                                className="h-8 px-2 pt-1.5 flex items-center justify-between gap-1"
                              >
                                <span
                                  className={`inline-flex items-center justify-center text-xs font-bold tabular-nums ${
                                    isToday
                                      ? 'w-6 h-6 rounded-full bg-indigo-600 text-white'
                                      : isSelected
                                      ? 'text-indigo-700 dark:text-indigo-300'
                                      : cell.isCurrentMonth
                                      ? 'text-slate-800 dark:text-slate-200'
                                      : 'text-slate-400 dark:text-slate-600'
                                  }`}
                                >
                                  {cell.date.getDate()}
                                </span>

                                <div className="flex items-center gap-1">
                                  {dayLeaves.length > 0 && (
                                    <span
                                      className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums"
                                      title={`${dayLeaves.length} cán bộ nghỉ`}
                                    >
                                      {dayLeaves.length}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenCreateModal(cell.iso);
                                    }}
                                    title={`Đăng ký nghỉ ngày ${formatDateShortVN(cell.iso)}`}
                                    className={`pointer-events-auto p-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-opacity cursor-pointer focus-visible:opacity-100 ${
                                      isHovered ? 'opacity-100' : 'opacity-0'
                                    }`}
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Continuous Spanning Lanes (Auto-height so 2-line names never clip or overlap) */}
                        {weekLayout.visibleLanes.length > 0 && (
                          <div className="px-1 space-y-1 mt-0.5">
                            {weekLayout.visibleLanes.map((lane, laneIdx) => (
                              <div
                                key={`week-${weekIdx}-lane-${laneIdx}`}
                                className="grid grid-cols-7 gap-x-1 items-stretch"
                              >
                                {lane.map((seg) => {
                                  const st = getStatusStyle(seg.leave.status);
                                  const StatusIcon = st.icon;
                                  const staff = profileByUserId.get(seg.leave.userId);
                                  const roundedClasses = `${
                                    seg.continuesLeft ? 'rounded-l-none border-l-0' : 'rounded-l-md'
                                  } ${seg.continuesRight ? 'rounded-r-none border-r-0' : 'rounded-r-md'}`;

                                  return (
                                    <button
                                      key={`seg-${weekIdx}-${seg.leave.id}`}
                                      type="button"
                                      style={{
                                        gridColumn: `${seg.startCol + 1} / span ${seg.spanCols}`,
                                        gridRow: '1'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDayIso(weekLayout.week[seg.startCol].iso);
                                        setSelectedLeave(seg.leave);
                                      }}
                                      onMouseEnter={() => setHoveredDayIso(weekLayout.week[seg.startCol].iso)}
                                      title={`${seg.leave.userName}${staff?.room ? ` (${staff.room})` : ''} · ${seg.leave.leaveType} · ${formatDateShortVN(seg.leave.startDate)} → ${formatDateShortVN(seg.leave.endDate)} (${seg.leave.totalDays} ngày) · ${st.label}`}
                                      className={`pointer-events-auto min-h-[26px] px-1.5 py-1 border text-[11px] leading-[1.25] flex items-start gap-1 text-left transition-colors cursor-pointer ${st.bar} ${roundedClasses}`}
                                    >
                                      <StatusIcon className={`w-3 h-3 shrink-0 mt-[1.5px] ${st.textClass}`} />
                                      {seg.spanCols === 1 ? (
                                        <span className="font-semibold whitespace-normal break-words min-w-0 flex-1">
                                          {seg.leave.userName}
                                        </span>
                                      ) : (
                                        <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                                          <span className="font-semibold whitespace-normal break-words">
                                            {seg.leave.userName}
                                          </span>
                                          <span className="opacity-80 truncate hidden sm:inline">
                                            · {seg.leave.leaveType} ({seg.leave.totalDays}N)
                                          </span>
                                          {seg.spanCols >= 3 && staff?.room && (
                                            <span className="opacity-65 truncate hidden md:inline">
                                              · {staff.room}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Overflow Row */}
                        {weekLayout.hasAnyOverflow && (
                          <div className="grid grid-cols-7 px-1 pt-1">
                            {weekLayout.week.map((cell, colIdx) => {
                              const hiddenCount = weekLayout.hiddenByCol[colIdx] || 0;
                              return (
                                <div key={`ovf-${cell.iso}`} className="px-1">
                                  {hiddenCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedDayIso(cell.iso);
                                      }}
                                      className="pointer-events-auto text-left text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap"
                                    >
                                      +{hiddenCount} lượt khác
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 2: WEEK SHIFT & COVERAGE VIEW */}
          {calendarView === 'week' && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto bg-white dark:bg-slate-900">
              <div className="grid grid-cols-7 min-w-[820px]">
                {weekDays.map((cell, idx) => {
                  const dayLeaves = leavesByDayIso.get(cell.iso) || [];
                  const isToday = cell.iso === todayIso;
                  const isSelected = cell.iso === selectedDayIso;

                  return (
                    <div
                      key={cell.iso}
                      onClick={() => handleSelectDay(cell.iso)}
                      className={`border-r last:border-r-0 border-slate-200 dark:border-slate-800 flex flex-col min-h-[360px] cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/35 dark:bg-indigo-950/20'
                          : cell.isWeekend
                          ? 'bg-slate-50/50 dark:bg-slate-900/50'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      {/* Column Header */}
                      <div
                        className={`px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1 ${
                          isToday
                            ? 'bg-indigo-50 dark:bg-indigo-950/60'
                            : isSelected
                            ? 'bg-slate-100/80 dark:bg-slate-800/80'
                            : 'bg-slate-50/80 dark:bg-slate-800/50'
                        }`}
                      >
                        <div>
                          <div
                            className={`text-xs font-bold ${
                              isToday ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {WEEKDAY_LABELS[idx]}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatDateCompactVN(cell.iso)}
                            {isToday ? ' · Hôm nay' : ''}
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                          {dayLeaves.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="flex-1 p-2 space-y-2">
                        {dayLeaves.length === 0 ? (
                          <div className="h-full min-h-[160px] flex items-center justify-center text-center px-2">
                            <span className="text-[11px] text-slate-400 dark:text-slate-600">
                              Đủ quân số trực
                            </span>
                          </div>
                        ) : (
                          dayLeaves.map((leave) => {
                            const st = getStatusStyle(leave.status);
                            const StatusIcon = st.icon;
                            const staff = profileByUserId.get(leave.userId);
                            const activeSub = filterActiveStaffDisplayName(
                              leave.substituteUserName,
                              inactiveStaff.names
                            );

                            return (
                              <div
                                key={`${cell.iso}-${leave.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLeave(leave);
                                }}
                                className={`p-2.5 rounded-lg border text-xs space-y-1.5 cursor-pointer transition-colors ${st.bar}`}
                              >
                                <div className="flex items-start gap-2">
                                  <span
                                    className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${st.avatar}`}
                                  >
                                    {getInitials(leave.userName)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold leading-snug break-words">
                                      {leave.userName}
                                    </div>
                                    <div className="text-[11px] opacity-80 truncate">
                                      {staff?.room || staff?.departmentSection || leave.userRole}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-[11px] font-medium opacity-90 pt-0.5">
                                  {leave.leaveType} · <span className="tabular-nums">{leave.totalDays || 1} ngày</span>
                                </div>

                                <div className={`flex items-center gap-1 text-[11px] font-semibold ${st.textClass}`}>
                                  <StatusIcon className="w-3 h-3 shrink-0" />
                                  <span>{st.label}</span>
                                </div>

                                {activeSub && (
                                  <div className="text-[11px] opacity-80 truncate" title={`Trực thay: ${activeSub}`}>
                                    Thay: {activeSub}
                                  </div>
                                )}

                                {canApproveLeave && leave.status === 'Chờ duyệt' && (
                                  <div
                                    className="flex items-center gap-1 pt-1.5 border-t border-amber-300/60 dark:border-amber-800/60"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => onApproveLeave(leave.id, 'Đã phê duyệt')}
                                      className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                    >
                                      Duyệt
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onApproveLeave(leave.id, 'Từ chối')}
                                      className="flex-1 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                    >
                                      Từ chối
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Quick Add Footer */}
                      <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCreateModal(cell.iso);
                          }}
                          className="w-full py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Đăng ký</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 3: STAFF ROSTER TIMELINE MATRIX (MONTHLY) */}
          {calendarView === 'roster' && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Bảng phân bổ nghỉ phép theo từng cán bộ ({rosterStaffList.length} nhân sự)
                </span>
                <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rosterOnlyWithLeaves}
                    onChange={(e) => setRosterOnlyWithLeaves(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Chỉ hiển thị cán bộ có lịch nghỉ trong tháng</span>
                </label>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                      <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-200 min-w-[210px] border-r border-slate-200 dark:border-slate-700">
                        Cán bộ / Phòng chuyên môn
                      </th>
                      {currentMonthDays.map((cell) => {
                        const jsDay = cell.date.getDay();
                        const shortIdx = jsDay === 0 ? 6 : jsDay - 1;
                        const isToday = cell.iso === todayIso;
                        const isSelected = cell.iso === selectedDayIso;
                        return (
                          <th
                            key={`roster-h-${cell.iso}`}
                            onClick={() => handleSelectDay(cell.iso)}
                            className={`min-w-[30px] py-1.5 px-0.5 text-center border-r last:border-r-0 border-slate-200 dark:border-slate-800 cursor-pointer tabular-nums ${
                              isToday
                                ? 'bg-indigo-600 text-white'
                                : isSelected
                                ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200'
                                : cell.isWeekend
                                ? 'bg-slate-100/70 dark:bg-slate-900/70 text-slate-400 dark:text-slate-500'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <div className="text-[10px] font-medium opacity-80">{WEEKDAY_SHORT[shortIdx]}</div>
                            <div className="text-[11px] font-bold">{cell.date.getDate()}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rosterStaffList.length === 0 ? (
                      <tr>
                        <td colSpan={currentMonthDays.length + 1} className="py-10 text-center text-slate-500 dark:text-slate-400">
                          Không có nhân sự phù hợp bộ lọc trong tháng này.
                        </td>
                      </tr>
                    ) : (
                      rosterStaffList.map((staff) => {
                        const staffLeaves = filteredRequests.filter(
                          (r) =>
                            r.userId === staff.userId ||
                            (r.userName || '').trim().toLowerCase() === staff.fullName.trim().toLowerCase()
                        );
                        return (
                          <tr
                            key={`roster-row-${staff.userId}`}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35 transition-colors"
                          >
                            <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 border-r border-slate-200 dark:border-slate-800">
                              <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[195px]">
                                {staff.fullName}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[195px]">
                                {staff.room || staff.departmentSection || staff.title}
                              </div>
                            </td>
                            {currentMonthDays.map((cell) => {
                              const matched = staffLeaves.find((r) => doesLeaveCoverDate(r, cell.iso));
                              const isToday = cell.iso === todayIso;
                              const isSelected = cell.iso === selectedDayIso;
                              if (matched) {
                                const st = getStatusStyle(matched.status);
                                return (
                                  <td
                                    key={`rc-${staff.userId}-${cell.iso}`}
                                    className="p-0.5 border-r last:border-r-0 border-slate-200 dark:border-slate-800 text-center"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setSelectedLeave(matched)}
                                      title={`${staff.fullName} · ${matched.leaveType} (${st.label}) · ${formatDateShortVN(matched.startDate)} → ${formatDateShortVN(matched.endDate)}`}
                                      className={`w-full h-7 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${st.matrixCell}`}
                                    >
                                      {matched.leaveType === 'Phép năm'
                                        ? 'P'
                                        : matched.leaveType === 'Nghỉ ốm'
                                        ? 'Ô'
                                        : matched.leaveType === 'Nghỉ thai sản'
                                        ? 'TS'
                                        : matched.leaveType === 'Học tập'
                                        ? 'HT'
                                        : 'KL'}
                                    </button>
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={`rc-${staff.userId}-${cell.iso}`}
                                  onClick={() => handleSelectDay(cell.iso)}
                                  onDoubleClick={() => onOpenCreateModal(cell.iso)}
                                  title={`${staff.fullName} · Ngày ${formatDateShortVN(cell.iso)} (Nhấn đúp để đăng ký nghỉ)`}
                                  className={`border-r last:border-r-0 border-slate-200 dark:border-slate-800 h-8 cursor-pointer ${
                                    isToday
                                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                                      : isSelected
                                      ? 'bg-indigo-50/30 dark:bg-indigo-950/20'
                                      : cell.isWeekend
                                      ? 'bg-slate-50/60 dark:bg-slate-900/50'
                                      : ''
                                  }`}
                                />
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compact Footer Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 px-1">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Đã phê duyệt</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Chờ duyệt</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Từ chối</span>
              </span>
              {calendarView === 'roster' && (
                <span className="text-slate-400 dark:text-slate-500">
                  Ký hiệu: P (Phép năm) · KL (Không lương) · Ô (Ốm) · HT (Học tập) · TS (Thai sản)
                </span>
              )}
            </div>

            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Nhấn ngày để xem chi tiết bên phải · Nhấn đúp hoặc nút + để đăng ký nhanh
            </span>
          </div>
        </div>

        {/* RIGHT: DOCKED DAY COVERAGE & APPROVAL INSPECTOR PANEL */}
        <aside className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          {/* Selected Date Header */}
          <div className="px-4 py-3.5 bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {getWeekdayLabelVN(selectedDayIso)}
                {selectedDayIso === todayIso ? ' · Hôm nay' : ''}
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                Ngày {formatDateShortVN(selectedDayIso)}
              </h4>
            </div>

            <button
              type="button"
              onClick={() => onOpenCreateModal(selectedDayIso)}
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Đăng ký</span>
            </button>
          </div>

          {/* Room Overlap Clinical Warning */}
          {selectedDayRoomWarnings.length > 0 && (
            <div className="mx-3.5 mt-3.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-snug">
                <div className="font-semibold">Lưu ý quân số phòng chuyên môn</div>
                <div className="text-[11px] opacity-90">
                  {selectedDayRoomWarnings.map((w) => `${w.room} (${w.count} người nghỉ)`).join(', ')}
                </div>
              </div>
            </div>
          )}

          {/* Selected Day Absences List */}
          <div className="p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Nhân sự nghỉ trong ngày
              </span>
              <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                {selectedDayLeaves.length} lượt
              </span>
            </div>

            {selectedDayLeaves.length === 0 ? (
              <div className="py-7 px-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Không có cán bộ đăng ký nghỉ trong ngày {formatDateCompactVN(selectedDayIso)}. Toàn khoa đủ quân số trực.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenCreateModal(selectedDayIso)}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + Tạo đăng ký nghỉ cho ngày này
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-0.5">
                {selectedDayLeaves.map((leave) => {
                  const st = getStatusStyle(leave.status);
                  const StatusIcon = st.icon;
                  const staff = profileByUserId.get(leave.userId);
                  const activeSub = filterActiveStaffDisplayName(
                    leave.substituteUserName,
                    inactiveStaff.names
                  );

                  return (
                    <div
                      key={`insp-${leave.id}`}
                      onClick={() => setSelectedLeave(leave)}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-slate-50/50 dark:bg-slate-800/35 space-y-2 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${st.avatar}`}
                          >
                            {getInitials(leave.userName)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {leave.userName}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {[staff?.room || staff?.departmentSection, leave.userRole]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </div>
                        </div>

                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 ${st.textClass}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          <span>{st.label}</span>
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                        <div>
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {leave.leaveType}
                          </span>
                          <span className="text-slate-400 mx-1" aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {formatDateCompactVN(leave.startDate)} → {formatDateCompactVN(leave.endDate)} ({leave.totalDays} ngày)
                          </span>
                        </div>
                        {activeSub && (
                          <div className="text-slate-500 dark:text-slate-400">
                            Trực thay: <span className="font-medium text-slate-700 dark:text-slate-200">{activeSub}</span>
                          </div>
                        )}
                        {leave.reason && (
                          <div className="text-slate-500 dark:text-slate-400 line-clamp-2">
                            Lý do: {leave.reason}
                          </div>
                        )}
                      </div>

                      {canApproveLeave && leave.status === 'Chờ duyệt' && (
                        <div
                          className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => onApproveLeave(leave.id, 'Đã phê duyệt')}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" /> Duyệt
                          </button>
                          <button
                            type="button"
                            onClick={() => onApproveLeave(leave.id, 'Từ chối')}
                            className="flex-1 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" /> Từ chối
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Queue inside Inspector */}
          {pendingQueue.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5 bg-amber-50/30 dark:bg-amber-950/15">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Hàng chờ phê duyệt
                </span>
                <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {pendingQueue.length}
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {pendingQueue.map((leave) => (
                  <div
                    key={`pq-${leave.id}`}
                    onClick={() => {
                      const range = toRangeIso(leave);
                      if (range) setSelectedDayIso(range.startIso);
                      setSelectedLeave(leave);
                    }}
                    className="p-2.5 rounded-lg border border-amber-200/80 dark:border-amber-800/70 bg-white dark:bg-slate-900 space-y-1.5 cursor-pointer hover:border-amber-400 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {leave.userName}
                      </span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium shrink-0">
                        {leave.leaveType}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatDateShortVN(leave.startDate)} → {formatDateShortVN(leave.endDate)} ({leave.totalDays}N)
                    </div>
                    {canApproveLeave && (
                      <div
                        className="flex items-center gap-1.5 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onApproveLeave(leave.id, 'Đã phê duyệt')}
                          className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold cursor-pointer"
                        >
                          Duyệt
                        </button>
                        <button
                          type="button"
                          onClick={() => onApproveLeave(leave.id, 'Từ chối')}
                          className="flex-1 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-[11px] font-semibold cursor-pointer"
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Modal: Overflow Day List (+X lượt khác) */}
      {expandedDayIso && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedDayIso(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Danh sách nghỉ ngày {formatDateShortVN(expandedDayIso)}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  Tổng {expandedDayLeaves.length} cán bộ đăng ký nghỉ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedDayIso(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {expandedDayLeaves.map((leave) => {
                const st = getStatusStyle(leave.status);
                const staff = profileByUserId.get(leave.userId);
                return (
                  <button
                    key={leave.id}
                    type="button"
                    onClick={() => {
                      setExpandedDayIso(null);
                      setSelectedLeave(leave);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs space-y-1 transition-colors cursor-pointer ${st.bar}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{leave.userName}</span>
                      <span className={`font-semibold ${st.textClass}`}>{st.label}</span>
                    </div>
                    <div className="opacity-85">
                      {[staff?.room, leave.leaveType, `${formatDateShortVN(leave.startDate)} → ${formatDateShortVN(leave.endDate)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => {
                  const dt = expandedDayIso;
                  setExpandedDayIso(null);
                  onOpenCreateModal(dt);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Đăng ký thêm
              </button>
              <button
                type="button"
                onClick={() => setExpandedDayIso(null)}
                className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Leave Registration Detail & Approval */}
      {selectedLeave && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedLeave(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Chi Tiết Đăng Ký Nghỉ
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedLeave.leaveType} · {selectedLeave.status}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLeave(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Cán bộ đăng ký:
                </span>
                <span className="font-bold text-slate-900 dark:text-white text-right">
                  {selectedLeave.userName} ({selectedLeave.userRole})
                </span>
              </div>

              {(() => {
                const staff = profileByUserId.get(selectedLeave.userId);
                return staff?.room || staff?.departmentSection ? (
                  <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> Phòng / Bộ phận:
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                      {[staff.room, staff.departmentSection].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                ) : null;
              })()}

              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Thời gian nghỉ:</span>
                <span className="font-bold text-slate-900 dark:text-white tabular-nums text-right">
                  {formatDateShortVN(selectedLeave.startDate)} → {formatDateShortVN(selectedLeave.endDate)} ({selectedLeave.totalDays} ngày)
                </span>
              </div>

              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Hình thức nghỉ:</span>
                <span className="font-semibold text-indigo-700 dark:text-indigo-300 text-right">
                  {selectedLeave.leaveType}
                </span>
              </div>

              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" /> Người trực thay:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                  {filterActiveStaffDisplayName(selectedLeave.substituteUserName, inactiveStaff.names) || 'Chưa chỉ định'}
                </span>
              </div>

              <div className="py-1.5 space-y-1">
                <span className="text-slate-500 dark:text-slate-400 block">Lý do đăng ký:</span>
                <p className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 leading-relaxed">
                  {selectedLeave.reason || 'Không ghi lý do'}
                </p>
              </div>

              {selectedLeave.approvedBy && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Người xử lý: <strong className="text-slate-700 dark:text-slate-300">{selectedLeave.approvedBy}</strong>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {canApproveLeave && selectedLeave.status === 'Chờ duyệt' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onApproveLeave(selectedLeave.id, 'Đã phê duyệt');
                        setSelectedLeave(null);
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApproveLeave(selectedLeave.id, 'Từ chối');
                        setSelectedLeave(null);
                      }}
                      className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" /> Từ chối
                    </button>
                  </>
                )}

                {(isAdmin || selectedLeave.userId === currentUserId) && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteLeave(selectedLeave.id);
                      setSelectedLeave(null);
                    }}
                    className="px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa đơn
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedLeave(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer ml-auto"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
