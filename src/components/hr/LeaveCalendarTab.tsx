import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
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
  User
} from 'lucide-react';
import { LeaveRequest, StaffProfile } from '../../types/hospital';
import { removeVietnameseTones } from '../../services/searchService';
import { filterActiveStaffDisplayName, getInactiveStaffMatchers } from '../../utils/staffStatus';

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

type CalendarViewMode = 'week' | 'month';
type StatusFilter = 'all' | 'Chờ duyệt' | 'Đã phê duyệt' | 'Từ chối';

const WEEKDAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

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

const formatDateShortVN = (raw?: string): string => {
  const dt = parseFlexibleDate(raw);
  if (!dt) return raw || '—';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
};

const getMondayOfWeek = (anchor: Date): Date => {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const day = d.getDay(); // 0 = Sun, 1 = Mon...
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
  const start = parseFlexibleDate(leave.startDate);
  const end = parseFlexibleDate(leave.endDate) || start;
  if (!start || !end) return false;
  const startIso = toISODateLocal(start);
  const endIso = toISODateLocal(end);
  return dayIso >= startIso && dayIso <= endIso;
};

const getStatusStyle = (status: LeaveRequest['status']) => {
  switch (status) {
    case 'Đã phê duyệt':
      return {
        chip: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/60',
        label: 'Đã duyệt',
        icon: CheckCircle2,
        textClass: 'text-emerald-700 dark:text-emerald-400'
      };
    case 'Từ chối':
      return {
        chip: 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/70 hover:bg-rose-100/80 dark:hover:bg-rose-900/50',
        label: 'Từ chối',
        icon: XCircle,
        textClass: 'text-rose-700 dark:text-rose-400'
      };
    default:
      return {
        chip: 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/70 hover:bg-amber-100/80 dark:hover:bg-amber-900/50',
        label: 'Chờ duyệt',
        icon: Clock,
        textClass: 'text-amber-700 dark:text-amber-400'
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
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [expandedDayIso, setExpandedDayIso] = useState<string | null>(null);

  const todayIso = useMemo(() => toISODateLocal(new Date()), []);

  const inactiveStaff = useMemo(
    () => getInactiveStaffMatchers(profiles),
    [profiles]
  );

  const activeLeaveRequests = useMemo(
    () =>
      leaveRequests.filter(
        req =>
          !inactiveStaff.ids.has(req.userId) &&
          !inactiveStaff.names.has((req.userName || '').trim().toLowerCase())
      ),
    [leaveRequests, inactiveStaff]
  );

  const profileByUserId = useMemo(() => {
    const map = new Map<string, StaffProfile>();
    profiles.forEach(p => map.set(p.userId, p));
    return map;
  }, [profiles]);

  const filteredRequests = useMemo(() => {
    const q = removeVietnameseTones(searchTerm);
    return activeLeaveRequests.filter(req => {
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (!q) return true;
      const staff = profileByUserId.get(req.userId);
      const activeSub = filterActiveStaffDisplayName(req.substituteUserName, inactiveStaff.names);
      const hay = removeVietnameseTones(
        `${req.userName} ${req.userRole} ${req.leaveType} ${req.reason} ${activeSub} ${staff?.departmentSection || ''} ${staff?.room || ''}`
      );
      return hay.includes(q);
    });
  }, [activeLeaveRequests, statusFilter, searchTerm, profileByUserId, inactiveStaff]);

  // Period date cells
  const weekDays = useMemo(() => {
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

  const monthGridDays = useMemo(() => {
    const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const gridStart = getMondayOfWeek(firstOfMonth);
    const lastOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    const lastDayOfWeek = lastOfMonth.getDay(); // 0=Sun..6=Sat
    const trailingDays = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
    const gridEnd = addDays(lastOfMonth, trailingDays);

    const cells: Array<{
      date: Date;
      iso: string;
      isCurrentMonth: boolean;
      isWeekend: boolean;
    }> = [];

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

  const activePeriodDays = calendarView === 'week' ? weekDays : monthGridDays.filter(d => d.isCurrentMonth);

  const periodRangeBounds = useMemo(() => {
    const first = activePeriodDays[0]?.iso || todayIso;
    const last = activePeriodDays[activePeriodDays.length - 1]?.iso || todayIso;
    return { first, last };
  }, [activePeriodDays, todayIso]);

  const leavesByDayIso = useMemo(() => {
    const targetDays = calendarView === 'week' ? weekDays : monthGridDays;
    const map = new Map<string, LeaveRequest[]>();
    targetDays.forEach(cell => {
      const matched = filteredRequests.filter(req => doesLeaveCoverDate(req, cell.iso));
      map.set(cell.iso, matched);
    });
    return map;
  }, [calendarView, weekDays, monthGridDays, filteredRequests]);

  // Period metrics
  const periodMetrics = useMemo(() => {
    const inPeriod = filteredRequests.filter(req => {
      const start = parseFlexibleDate(req.startDate);
      const end = parseFlexibleDate(req.endDate) || start;
      if (!start || !end) return false;
      const startIso = toISODateLocal(start);
      const endIso = toISODateLocal(end);
      return endIso >= periodRangeBounds.first && startIso <= periodRangeBounds.last;
    });

    const offToday = activeLeaveRequests.filter(
      req => req.status === 'Đã phê duyệt' && doesLeaveCoverDate(req, todayIso)
    ).length;

    const pendingTotal = activeLeaveRequests.filter(req => req.status === 'Chờ duyệt').length;
    const approvedInPeriod = inPeriod.filter(req => req.status === 'Đã phê duyệt').length;

    return {
      inPeriodCount: inPeriod.length,
      offToday,
      pendingTotal,
      approvedInPeriod
    };
  }, [filteredRequests, activeLeaveRequests, periodRangeBounds, todayIso]);

  const pendingQueue = useMemo(
    () => filteredRequests.filter(req => req.status === 'Chờ duyệt'),
    [filteredRequests]
  );

  const handleNavigatePeriod = (direction: -1 | 1) => {
    if (calendarView === 'week') {
      setAnchorDate(prev => addDays(prev, direction * 7));
    } else {
      setAnchorDate(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    }
  };

  const handleJumpToday = () => {
    const now = new Date();
    setAnchorDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
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
    return `Tháng ${String(anchorDate.getMonth() + 1).padStart(2, '0')} / ${anchorDate.getFullYear()}`;
  }, [calendarView, weekDays, anchorDate]);

  const statusCounts = useMemo(() => ({
    all: activeLeaveRequests.length,
    pending: activeLeaveRequests.filter(r => r.status === 'Chờ duyệt').length,
    approved: activeLeaveRequests.filter(r => r.status === 'Đã phê duyệt').length,
    rejected: activeLeaveRequests.filter(r => r.status === 'Từ chối').length
  }), [activeLeaveRequests]);

  const expandedDayLeaves = expandedDayIso ? (leavesByDayIso.get(expandedDayIso) || []) : [];

  return (
    <div className="p-5 sm:p-6 space-y-5">
      {/* Top Toolbar: Heading + Week/Month Switcher + Navigation + Primary Action */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Lịch Đăng Ký Nghỉ &amp; Điều Phối Nhân Lực
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Theo dõi lịch nghỉ phép năm, nghỉ ốm, thai sản và tập huấn theo tuần hoặc theo tháng. Nhấn vào ngày bất kỳ để đăng ký nhanh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Week / Month View Toggle */}
          <div
            role="group"
            aria-label="Chế độ xem lịch"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
          >
            <button
              type="button"
              onClick={() => setCalendarView('week')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                calendarView === 'week'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Theo Tuần
            </button>
            <button
              type="button"
              onClick={() => setCalendarView('month')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                calendarView === 'month'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Theo Tháng
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenCreateModal(todayIso)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Đăng Ký Nghỉ</span>
          </button>
        </div>
      </div>

      {/* Period Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Đăng ký trong {calendarView === 'week' ? 'tuần' : 'tháng'}
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {periodMetrics.inPeriodCount}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">lượt</span>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Đã duyệt trong kỳ
          </div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
            {periodMetrics.approvedInPeriod}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">đơn</span>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Đang chờ phê duyệt
          </div>
          <div className="text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
            {periodMetrics.pendingTotal}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">đơn</span>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Nghỉ hôm nay ({formatDateShortVN(todayIso)})
          </div>
          <div className="text-lg font-bold text-indigo-700 dark:text-indigo-400 tabular-nums mt-0.5">
            {periodMetrics.offToday}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">cán bộ</span>
          </div>
        </div>
      </div>

      {/* Calendar Navigation & Status Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
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

          <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums pl-1 whitespace-nowrap">
            {periodTitle}
          </h4>
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { key: 'all', label: 'Tất cả', count: statusCounts.all },
              { key: 'Chờ duyệt', label: 'Chờ duyệt', count: statusCounts.pending },
              { key: 'Đã phê duyệt', label: 'Đã duyệt', count: statusCounts.approved },
              { key: 'Từ chối', label: 'Từ chối', count: statusCounts.rejected }
            ] as Array<{ key: StatusFilter; label: string; count: number }>
          ).map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatusFilter(item.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer tabular-nums ${
                statusFilter === item.key
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>
      </div>

      {/* CALENDAR GRID: MONTH VIEW */}
      {calendarView === 'month' && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70">
            {WEEKDAY_LABELS.map((dayName, idx) => (
              <div
                key={dayName}
                className={`py-2.5 px-2 text-center text-xs font-bold border-r last:border-r-0 border-slate-200 dark:border-slate-800 ${
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

          {/* Days Grid */}
          <div className="grid grid-cols-7">
            {monthGridDays.map((cell) => {
              const dayLeaves = leavesByDayIso.get(cell.iso) || [];
              const isToday = cell.iso === todayIso;
              const visibleLeaves = dayLeaves.slice(0, 3);
              const overflowCount = dayLeaves.length - visibleLeaves.length;

              return (
                <div
                  key={cell.iso}
                  onClick={() => onOpenCreateModal(cell.iso)}
                  className={`group min-h-[116px] sm:min-h-[128px] p-2 border-r border-b border-slate-200 dark:border-slate-800 [&:nth-child(7n)]:border-r-0 flex flex-col justify-between transition-colors cursor-pointer ${
                    !cell.isCurrentMonth
                      ? 'bg-slate-50/70 dark:bg-slate-950/60 text-slate-400 dark:text-slate-600'
                      : cell.isWeekend
                      ? 'bg-slate-50/40 dark:bg-slate-900/60 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20'
                      : 'bg-white dark:bg-slate-900 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20'
                  }`}
                >
                  <div className="space-y-1.5">
                    {/* Day header row */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`inline-flex items-center justify-center text-xs font-bold tabular-nums ${
                          isToday
                            ? 'w-6 h-6 rounded-full bg-indigo-600 text-white'
                            : cell.isCurrentMonth
                            ? 'text-slate-800 dark:text-slate-200'
                            : 'text-slate-400 dark:text-slate-600'
                        }`}
                      >
                        {cell.date.getDate()}
                      </span>

                      <div className="flex items-center gap-1">
                        {dayLeaves.length > 0 && (
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
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
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-opacity cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Leave bars inside day */}
                    <div className="space-y-1">
                      {visibleLeaves.map((leave) => {
                        const st = getStatusStyle(leave.status);
                        return (
                          <button
                            key={`${cell.iso}-${leave.id}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLeave(leave);
                            }}
                            title={`${leave.userName} • ${leave.leaveType} • ${st.label}`}
                            className={`w-full text-left px-1.5 py-1 rounded-md border text-[11px] leading-tight transition-colors cursor-pointer truncate block ${st.chip}`}
                          >
                            <span className="font-bold">{leave.userName}</span>
                            <span className="opacity-80"> · {leave.leaveType}</span>
                          </button>
                        );
                      })}

                      {overflowCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDayIso(cell.iso);
                          }}
                          className="w-full text-left px-1.5 py-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          +{overflowCount} lượt khác
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CALENDAR GRID: WEEK VIEW */}
      {calendarView === 'week' && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto bg-white dark:bg-slate-900">
          <div className="grid grid-cols-7 min-w-[840px]">
            {weekDays.map((cell, idx) => {
              const dayLeaves = leavesByDayIso.get(cell.iso) || [];
              const isToday = cell.iso === todayIso;
              const dayNum = String(cell.date.getDate()).padStart(2, '0');
              const monthNum = String(cell.date.getMonth() + 1).padStart(2, '0');

              return (
                <div
                  key={cell.iso}
                  className={`border-r last:border-r-0 border-slate-200 dark:border-slate-800 flex flex-col min-h-[340px] ${
                    cell.isWeekend ? 'bg-slate-50/50 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-900'
                  }`}
                >
                  {/* Day Column Header */}
                  <div
                    className={`px-3 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1 ${
                      isToday
                        ? 'bg-indigo-50 dark:bg-indigo-950/50'
                        : 'bg-slate-50/80 dark:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-bold ${isToday ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-100'}`}>
                        {WEEKDAY_LABELS[idx]}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {dayNum}/{monthNum}
                        {isToday && ' · Hôm nay'}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                      {dayLeaves.length}
                    </span>
                  </div>

                  {/* Leave Cards List in Week Column */}
                  <div className="flex-1 p-2.5 space-y-2">
                    {dayLeaves.length === 0 ? (
                      <div className="h-full min-h-[120px] flex items-center justify-center text-center px-2">
                        <span className="text-[11px] text-slate-400 dark:text-slate-600">
                          Đủ quân số trực
                        </span>
                      </div>
                    ) : (
                      dayLeaves.map((leave) => {
                        const st = getStatusStyle(leave.status);
                        const StatusIcon = st.icon;
                        const staff = profileByUserId.get(leave.userId);
                        return (
                          <div
                            key={`${cell.iso}-${leave.id}`}
                            onClick={() => setSelectedLeave(leave)}
                            className={`p-2.5 rounded-lg border text-xs space-y-1.5 cursor-pointer transition-colors ${st.chip}`}
                          >
                            <div className="font-bold leading-snug">{leave.userName}</div>
                            <div className="text-[11px] opacity-85">
                              {staff?.room || leave.userRole}
                            </div>
                            <div className="text-[11px] font-medium">
                              {leave.leaveType} · {leave.totalDays || 1} ngày
                            </div>
                            <div className={`flex items-center gap-1 text-[11px] font-bold ${st.textClass}`}>
                              <StatusIcon className="w-3 h-3 shrink-0" />
                              <span>{st.label}</span>
                            </div>
                            {(() => {
                              const activeSub = filterActiveStaffDisplayName(
                                leave.substituteUserName,
                                inactiveStaff.names
                              );
                              return activeSub ? (
                                <div className="text-[10px] opacity-80 truncate" title={`Trực thay: ${activeSub}`}>
                                  Thay: {activeSub}
                                </div>
                              ) : null;
                            })()}

                            {canApproveLeave && leave.status === 'Chờ duyệt' && (
                              <div
                                className="flex items-center gap-1 pt-1 border-t border-amber-200/70 dark:border-amber-800/60"
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

                  {/* Quick Add Footer inside Week Column */}
                  <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => onOpenCreateModal(cell.iso)}
                      className="w-full py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Đăng ký ngày này</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend & Empty Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
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
        </div>

        {activeLeaveRequests.length === 0 && (
          <span>
            Chưa có lịch đăng ký nghỉ nào. Nhấn <strong>Đăng Ký Nghỉ</strong> hoặc chọn một ngày trên lịch để tạo mới.
          </span>
        )}
      </div>

      {/* Pending Approvals Quick Queue (so pending requests on other months are still immediately visible & actionable) */}
      {pendingQueue.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Đơn đăng ký nghỉ đang chờ phê duyệt ({pendingQueue.length})
            </h4>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {pendingQueue.map((leave) => {
              const activeSub = filterActiveStaffDisplayName(leave.substituteUserName, inactiveStaff.names);
              return (
              <div
                key={`pending-${leave.id}`}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div
                  className="space-y-0.5 cursor-pointer flex-1 min-w-0"
                  onClick={() => setSelectedLeave(leave)}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">{leave.userName}</span>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span className="text-slate-600 dark:text-slate-300">{leave.userRole}</span>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{leave.leaveType}</span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                    {formatDateShortVN(leave.startDate)} → {formatDateShortVN(leave.endDate)} ({leave.totalDays} ngày) · Lý do: {leave.reason}
                    {activeSub ? ` · Trực thay: ${activeSub}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canApproveLeave && (
                    <>
                      <button
                        type="button"
                        onClick={() => onApproveLeave(leave.id, 'Đã phê duyệt')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Duyệt
                      </button>
                      <button
                        type="button"
                        onClick={() => onApproveLeave(leave.id, 'Từ chối')}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Từ chối
                      </button>
                    </>
                  )}
                  {(isAdmin || leave.userId === currentUserId) && (
                    <button
                      type="button"
                      onClick={() => onDeleteLeave(leave.id)}
                      title="Xóa đơn đăng ký này"
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Overflow Day List (+X lượt khác) */}
      {expandedDayIso && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedDayIso(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
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
                return (
                  <button
                    key={leave.id}
                    type="button"
                    onClick={() => {
                      setExpandedDayIso(null);
                      setSelectedLeave(leave);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs space-y-1 transition-colors cursor-pointer ${st.chip}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{leave.userName}</span>
                      <span className={`font-bold ${st.textClass}`}>{st.label}</span>
                    </div>
                    <div className="opacity-85">
                      {leave.leaveType} · {formatDateShortVN(leave.startDate)} → {formatDateShortVN(leave.endDate)}
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
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
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
            onClick={e => e.stopPropagation()}
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
                  {selectedLeave.reason}
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
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
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
