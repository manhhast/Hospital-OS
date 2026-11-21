import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckSquare, Clock, FileText, FileWarning,
  Calendar, MessageSquare, Bell,
  Users, Sparkles, CheckCircle2,
  ChevronRight, Plus, Activity, UserMinus,
  CalendarCheck2, Wrench, BellRing, BarChart3, ShieldAlert
} from 'lucide-react';
import {
  TaskItem,
  DocumentItem,
  ShiftDuty,
  WeeklyMeeting,
  ChatChannelMessage,
  NotificationLog,
  User,
  LeaveRequest,
  EquipmentItem
} from '../../types/hospital';
import { storageService } from '../../services/storageService';
import { formatDateVN, getTodayISODateVN } from '../../utils/dateUtils';
import {
  scanEquipmentExpirations,
  scanTaskReminders,
  getDaysDiffFromTodayVN,
  formatDaysRemainingLabel,
  dispatchTaskReminder,
  dispatchEquipmentReminder,
  createTaskFromEquipmentAlert,
  EquipmentExpirationAlert
} from '../../utils/operationalAlerts';

interface DashboardViewProps {
  tasks: TaskItem[];
  documents: DocumentItem[];
  onNavigateModule: (module: string) => void;
  onOpenNewTask: () => void;
  onOpenNewDoc: () => void;
  onShowToast?: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface DailySnapshotSummary {
  monthLabel: string;
  dayNum: number;
  totalCases: number;
  bhTotal: number;
  ndTotal: number;
  activeServices: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  documents,
  onNavigateModule,
  onOpenNewTask,
  onOpenNewDoc,
  onShowToast
}) => {
  const [shifts, setShifts] = useState<ShiftDuty[]>([]);
  const [meetings, setMeetings] = useState<WeeklyMeeting[]>([]);
  const [messages, setMessages] = useState<ChatChannelMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const currentUser = storageService.getCurrentUser();

  const loadAllData = () => {
    setShifts(storageService.getShifts());
    setMeetings(storageService.getMeetings());
    setMessages(storageService.getChatMessages());
    setNotifications(storageService.getNotifications());
    setUsers(storageService.getUsers());
    setLeaveRequests(storageService.getLeaveRequests());
    setEquipmentList(storageService.getEquipment());
  };

  useEffect(() => {
    loadAllData();
    const unsubscribe = storageService.subscribe(loadAllData);
    return () => unsubscribe();
  }, []);

  const todayStr = getTodayISODateVN();

  // Read latest daily statistical snapshot from Reports storage
  const dailySnapshot = useMemo<DailySnapshotSummary | null>(() => {
    const nowVNMonth = Number(todayStr.split('-')[1]) || 1;
    const monthsToTry = [nowVNMonth, ...Array.from({ length: 12 }, (_, idx) => 12 - idx).filter((m) => m !== nowVNMonth)];

    for (const m of monthsToTry) {
      const monthLabel = `Tháng ${m}`;
      try {
        const raw = localStorage.getItem(`google_sheet_data_${monthLabel}`);
        if (!raw) continue;
        const items = JSON.parse(raw);
        if (!Array.isArray(items) || items.length === 0) continue;

        for (let d = 31; d >= 1; d--) {
          let totalCases = 0;
          let bhTotal = 0;
          let ndTotal = 0;
          let activeServices = 0;

          for (const item of items) {
            const entry = item?.dailyData?.[d];
            if (!entry) continue;
            const bh = typeof entry.bh === 'number' ? entry.bh : parseInt(String(entry.bh || '').replace(/[^0-9]/g, ''), 10) || 0;
            const nd = typeof entry.nd === 'number' ? entry.nd : parseInt(String(entry.nd || '').replace(/[^0-9]/g, ''), 10) || 0;
            if (bh + nd > 0) {
              bhTotal += bh;
              ndTotal += nd;
              totalCases += bh + nd;
              activeServices += 1;
            }
          }

          if (totalCases > 0) {
            return {
              monthLabel,
              dayNum: d,
              totalCases,
              bhTotal,
              ndTotal,
              activeServices
            };
          }
        }
      } catch {
        // ignore invalid localStorage JSON
      }
    }
    return null;
  }, [todayStr, tasks.length, notifications.length]);

  // Compliance & Task Reminder Scans
  const eqCompliance = useMemo(() => scanEquipmentExpirations(equipmentList, 60), [equipmentList]);
  const eqActionableAlerts = useMemo(
    () => eqCompliance.alerts.filter((a) => a.daysRemaining <= 30),
    [eqCompliance]
  );

  const taskReminders = useMemo(() => scanTaskReminders(tasks, 7), [tasks]);
  const urgentTaskCount = taskReminders.overdueCount + taskReminders.dueTodayCount + taskReminders.dueSoon3DaysCount;

  // 1. Today's Tasks (due today or created today and still relevant)
  const todayTasks = tasks.filter(
    (t) =>
      (t.dueDate === todayStr || t.createdDate?.startsWith(todayStr)) &&
      t.status !== 'Hủy'
  );

  // Today's Work Assignments
  const todayWorkAssignments = shifts.filter(
    (s) =>
      s.date === todayStr &&
      (s.workType === 'Làm việc' || s.workType === 'Đào tạo' || s.workType === 'Họp')
  );
  const displayWorkAssignments =
    todayWorkAssignments.length > 0
      ? todayWorkAssignments.slice(0, 4)
      : shifts.filter((s) => s.workType === 'Làm việc' || s.workType === 'Đào tạo').slice(0, 4);

  // 2. Today's Shifts
  const todayShifts = shifts.filter((s) => s.date === todayStr);
  const displayShifts = todayShifts.length > 0 ? todayShifts : shifts.filter((s) => s.workType === 'Ca trực').slice(0, 4);

  // People on leave today
  const activeLeaves = leaveRequests.filter((l) => l.status === 'Đã phê duyệt' || l.status === 'Chờ duyệt');
  const shiftsOff = shifts.filter((s) => s.date === todayStr && (s.workType === 'Nghỉ' || s.title?.includes('Nghỉ')));
  const todayOffCount = activeLeaves.length + shiftsOff.length;

  // 3. Weekly Schedule
  const upcomingMeetings = meetings.slice(0, 4);

  // 4. New Documents
  const newDocuments = [...documents].sort((a, b) => (b.uploadDate || '').localeCompare(a.uploadDate || '')).slice(0, 4);

  // 5. New Notifications
  const newNotifications = notifications.slice(0, 4);

  // 6. Unread Messages
  const unreadMessages = messages.filter((m) => m.isUnread).length > 0
    ? messages.filter((m) => m.isUnread).slice(0, 4)
    : messages.slice(0, 4);

  // 7. Expiring Documents (dynamic within <= 30 days or overdue relative to VN today)
  const expiringDocs = useMemo(() => {
    return documents
      .map((d) => ({
        doc: d,
        daysRemaining: d.expirationDate ? getDaysDiffFromTodayVN(d.expirationDate) : null
      }))
      .filter((x) => x.daysRemaining !== null && x.daysRemaining <= 30)
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999))
      .slice(0, 4);
  }, [documents]);

  // Quick action handlers
  const handleQuickCompleteTask = (task: TaskItem) => {
    storageService.saveTask({ ...task, status: 'Đã hoàn thành' });
    loadAllData();
    onShowToast?.('Hoàn thành công việc', `Đã đánh dấu hoàn tất "${task.title}"`, 'success');
  };

  const handleQuickRemindTask = (task: TaskItem, daysRemaining: number) => {
    dispatchTaskReminder(task, daysRemaining, 'Telegram');
    loadAllData();
    onShowToast?.('Đã gửi nhắc việc', `Đã gửi nhắc nhở tới ${task.assignee} qua Telegram`, 'success');
  };

  const handleQuickRemindEquipment = (alert: EquipmentExpirationAlert) => {
    dispatchEquipmentReminder(alert, 'Telegram');
    loadAllData();
    onShowToast?.('Đã gửi cảnh báo thiết bị', `Đã nhắc ${alert.assignedTechnician} về ${alert.trackLabel} (${alert.equipmentCode})`, 'success');
  };

  const handleQuickCreateEquipmentTask = (alert: EquipmentExpirationAlert) => {
    const res = createTaskFromEquipmentAlert(alert);
    loadAllData();
    if (res.created) {
      onShowToast?.('Đã tạo công việc xử lý', `Đã giao việc cho ${res.task.assignee} (#${res.task.id})`, 'success');
    } else {
      onShowToast?.('Đã có công việc đang mở', `Nhiệm vụ #${res.task.id} đang theo dõi thiết bị này`, 'info');
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Khẩn cấp':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900';
      case 'Cao':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900';
      case 'Trung bình':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-900';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-200">
      {/* Compact Enterprise HIS Executive Action Bar */}
      <div className="bg-white dark:bg-[#162033] rounded-xl border border-[#DFE7F0] dark:border-slate-700/80 p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 shadow-2xs">
        <div className="space-y-0.5 min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-[#263445] dark:text-white tracking-tight truncate">
            Tổng quan Điều hành · <span className="text-[#155A9C] dark:text-sky-300">{currentUser?.name}</span>
          </h1>
          <p className="text-xs text-[#718096] dark:text-slate-300 truncate">
            Theo dõi số liệu dịch vụ kỹ thuật hằng ngày, kiểm định thiết bị 4 chu kỳ, lịch trực chuyên môn &amp; hồ sơ ISO 15189.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={onOpenNewTask}
            className="px-3.5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Thêm công việc</span>
          </button>
          <button
            onClick={() => onNavigateModule('reports')}
            className="px-3.5 py-2 bg-white hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#155A9C] dark:text-sky-300 border border-[#DFE7F0] hover:border-[#1976D2]/40 dark:border-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0 text-[#1976D2]" />
            <span>Báo cáo ngày</span>
          </button>
          <button
            onClick={onOpenNewDoc}
            className="px-3.5 py-2 bg-white hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#263445] hover:text-[#155A9C] dark:text-slate-200 border border-[#DFE7F0] hover:border-[#1976D2]/40 dark:border-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 shrink-0 text-[#1976D2]" />
            <span>Tải SOP / Hồ sơ</span>
          </button>
        </div>
      </div>

      {/* High-Density HIS KPI Summary Bar (8 Operational Indicators) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => onNavigateModule('reports')}
          className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl p-3 hover:border-[#1976D2] dark:hover:border-sky-500 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-[#718096] dark:text-slate-400 text-[11px] font-semibold">
            <span>Số liệu ngày gần nhất</span>
            <BarChart3 className="w-4 h-4 text-[#16A34A]" />
          </div>
          {dailySnapshot ? (
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <p className="text-lg font-bold text-[#16A34A] dark:text-emerald-400 tabular-nums">
                {dailySnapshot.totalCases.toLocaleString('vi-VN')} ca
              </p>
              <span className="text-[11px] font-medium text-[#718096] dark:text-slate-400 tabular-nums">
                Ngày {dailySnapshot.dayNum} ({dailySnapshot.monthLabel})
              </span>
            </div>
          ) : (
            <p className="text-xs font-semibold text-[#718096] dark:text-slate-400 mt-1.5">Chưa có dữ liệu tháng</p>
          )}
        </div>

        <div
          onClick={() => onNavigateModule('equipment')}
          className={`bg-white dark:bg-slate-900 border rounded-xl p-3 transition-colors cursor-pointer shadow-2xs ${
            eqCompliance.overdueCount > 0
              ? 'border-red-300 dark:border-red-800 hover:border-red-500'
              : 'border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2]'
          }`}
        >
          <div className="flex items-center justify-between text-[#718096] dark:text-slate-400 text-[11px] font-semibold">
            <span>Cảnh báo thiết bị (≤30d)</span>
            <ShieldAlert className={`w-4 h-4 ${eqCompliance.overdueCount > 0 ? 'text-red-600' : 'text-orange-500'}`} />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <p className={`text-lg font-bold tabular-nums ${eqCompliance.overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>
              {eqActionableAlerts.length} mốc
            </p>
            <span className="text-[11px] font-medium text-[#718096] dark:text-slate-400 tabular-nums">
              {eqCompliance.overdueCount} quá hạn
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigateModule('tasks')}
          className={`bg-white dark:bg-slate-900 border rounded-xl p-3 transition-colors cursor-pointer shadow-2xs ${
            taskReminders.overdueCount > 0
              ? 'border-red-300 dark:border-red-800 hover:border-red-500'
              : 'border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2]'
          }`}
        >
          <div className="flex items-center justify-between text-[#718096] dark:text-slate-400 text-[11px] font-semibold">
            <span>Nhắc việc khẩn &amp; sắp hạn</span>
            <Clock className={`w-4 h-4 ${taskReminders.overdueCount > 0 ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <p className={`text-lg font-bold tabular-nums ${taskReminders.overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-[#263445] dark:text-slate-100'}`}>
              {urgentTaskCount} việc
            </p>
            <span className="text-[11px] font-medium text-[#718096] dark:text-slate-400 tabular-nums">
              {taskReminders.overdueCount} quá hạn
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigateModule('tasks')}
          className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl p-3 hover:border-[#1976D2] dark:hover:border-sky-500 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-[#718096] dark:text-slate-400 text-[11px] font-semibold">
            <span>Việc hôm nay</span>
            <CheckSquare className="w-4 h-4 text-[#1976D2]" />
          </div>
          <p className="text-lg font-bold text-[#263445] dark:text-slate-100 mt-1.5 tabular-nums">{todayTasks.length}</p>
        </div>

        <div
          onClick={() => onNavigateModule('hr')}
          className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl p-3 hover:border-[#1976D2] dark:hover:border-sky-500 transition-colors cursor-pointer shadow-2xs"
          title="Xem danh sách đơn nghỉ phép và nhân sự nghỉ hôm nay"
        >
          <div className="flex items-center justify-between text-[#718096] dark:text-slate-400 text-[11px] font-semibold">
            <span>Nhân sự nghỉ hôm nay</span>
            <UserMinus className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1.5 tabular-nums">{todayOffCount}</p>
        </div>

        <div
          onClick={() => onNavigateModule('schedule')}
          className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl p-3 hover:border-[#1976D2] dark:hover:border-sky-500 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-[#718096] dark:text-slate-400 text-[11px] font-semibold">
            <span>Lịch họp tuần</span>
            <Calendar className="w-4 h-4 text-[#1976D2]" />
          </div>
          <p className="text-lg font-bold text-[#263445] dark:text-slate-100 mt-1.5 tabular-nums">{meetings.length}</p>
        </div>

        <div
          onClick={() => onNavigateModule('discussion')}
          className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl p-3 hover:border-[#1976D2] dark:hover:border-sky-500 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-[#718096] dark:text-slate-400 text-[11px] font-semibold">
            <span>Tin trao đổi khoa</span>
            <MessageSquare className="w-4 h-4 text-[#16A34A]" />
          </div>
          <p className="text-lg font-bold text-[#263445] dark:text-slate-100 mt-1.5 tabular-nums">{unreadMessages.length}</p>
        </div>

        <div
          onClick={() => onNavigateModule('documents')}
          className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl p-3 hover:border-[#1976D2] dark:hover:border-sky-500 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-[#718096] dark:text-slate-400 text-[11px] font-semibold">
            <span>SOP / Hồ sơ sắp hạn</span>
            <FileWarning className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-lg font-bold text-[#263445] dark:text-slate-100 mt-1.5 tabular-nums">{expiringDocs.length}</p>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN (2 Cols wide on LG) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Widget 1: Cảnh báo Thời hạn Thiết bị 4 Chu kỳ */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-[#DFE7F0] dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 rounded-lg border border-rose-200/80 dark:border-rose-800">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100">
                    1. Cảnh báo Thời hạn Thiết bị (Giấy phép • ISO • Kiểm xạ • Bảo dưỡng)
                  </h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-400">
                    Quá hạn: <strong className="text-rose-600 tabular-nums">{eqCompliance.overdueCount}</strong> &bull; Hạn ≤7 ngày: <strong className="text-orange-600 tabular-nums">{eqCompliance.critical7Count}</strong> &bull; Đạt chuẩn: <strong className="text-emerald-600 tabular-nums">{eqCompliance.compliantEquipmentCount}/{equipmentList.length} máy</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => onNavigateModule('equipment')}
                className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Quản lý thiết bị</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {eqCompliance.alerts.length === 0 ? (
              <div className="p-4 text-center bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 rounded-lg text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                Toàn bộ thiết bị đều còn hiệu lực kiểm định, giấy phép, kiểm xạ và bảo dưỡng trên 60 ngày.
              </div>
            ) : (
              <div className="space-y-2">
                {eqCompliance.alerts.slice(0, 4).map((alert) => {
                  const isOverdue = alert.daysRemaining < 0;
                  const isCritical = alert.daysRemaining >= 0 && alert.daysRemaining <= 7;
                  return (
                    <div
                      key={alert.id}
                      className="p-3 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#1976D2]/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded tabular-nums ${
                              isOverdue
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                : isCritical
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                                : 'bg-[#EAF4FF] text-[#155A9C] dark:bg-sky-950/70 dark:text-sky-300 border border-[#1976D2]/25 dark:border-sky-800'
                            }`}
                          >
                            {formatDaysRemainingLabel(alert.daysRemaining)}
                          </span>
                          <span className="text-xs font-mono text-[#718096] dark:text-slate-400">{alert.equipmentCode}</span>
                          <span className="text-xs font-semibold text-[#263445] dark:text-slate-200">{alert.trackLabel}</span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-[#263445] dark:text-slate-100 truncate">
                          {alert.equipmentName} <span className="font-normal text-[#718096]">({alert.room})</span>
                        </h4>
                        <p className="text-[11px] text-[#718096] dark:text-slate-400 truncate">
                          Hết hạn: <strong className="text-[#263445] dark:text-slate-200 tabular-nums">{alert.expiryDateVN}</strong> &bull; Kỹ thuật viên: <strong>{alert.assignedTechnician}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleQuickRemindEquipment(alert)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-700 hover:border-amber-400 text-amber-700 dark:text-amber-300 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                          title="Gửi nhắc nhở ngay qua Telegram"
                        >
                          <BellRing className="w-3.5 h-3.5" />
                          <span>Nhắc</span>
                        </button>
                        <button
                          onClick={() => handleQuickCreateEquipmentTask(alert)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                          title="Tạo công việc xử lý hồ sơ thiết bị"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Tạo việc</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Widget 2: Nhắc nhở Công việc Quá hạn & Sắp đến hạn (7 ngày tới) */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-[#DFE7F0] dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 rounded-lg border border-amber-200/80 dark:border-amber-800">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100">
                    2. Nhắc nhở Công việc Quá hạn & Sắp đến hạn (7 ngày tới)
                  </h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-400">
                    Quá hạn: <strong className="text-rose-600 tabular-nums">{taskReminders.overdueCount}</strong> &bull; Hạn hôm nay: <strong className="text-orange-600 tabular-nums">{taskReminders.dueTodayCount}</strong> &bull; Sắp hạn ≤3 ngày: <strong className="text-[#1976D2] tabular-nums">{taskReminders.dueSoon3DaysCount}</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => onNavigateModule('tasks')}
                className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Bảng theo dõi việc ({tasks.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {taskReminders.alerts.length === 0 ? (
              <div className="p-4 text-center bg-[#F4F7FB] dark:bg-slate-800/40 rounded-lg border border-[#DFE7F0] dark:border-slate-800 text-[#718096] text-xs">
                Không có công việc quá hạn hoặc đến hạn trong 7 ngày tới.
              </div>
            ) : (
              <div className="space-y-2">
                {taskReminders.alerts.slice(0, 5).map(({ task, daysRemaining, reminderCount }) => (
                  <div
                    key={task.id}
                    className="p-3 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#1976D2]/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded tabular-nums ${
                            daysRemaining < 0
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                              : daysRemaining === 0
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                              : 'bg-[#EAF4FF] text-[#155A9C] dark:bg-sky-950/70 dark:text-sky-300 border border-[#1976D2]/25 dark:border-sky-800'
                          }`}
                        >
                          {formatDaysRemainingLabel(daysRemaining)}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border shrink-0 ${getPriorityBadge(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className="text-xs font-mono text-[#718096]">{task.id}</span>
                        {reminderCount > 0 && (
                          <span className="text-[10px] font-semibold text-[#1976D2] dark:text-sky-400 tabular-nums">
                            Đã nhắc {reminderCount} lần
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs sm:text-sm font-semibold text-[#263445] dark:text-slate-100 truncate">{task.title}</h4>
                      <p className="text-[11px] text-[#718096] dark:text-slate-400 truncate">
                        Phụ trách: <strong className="text-[#263445] dark:text-slate-200">{task.assignee}</strong> &bull; Hạn: <strong className="tabular-nums">{formatDateVN(task.dueDate)}</strong> &bull; {task.status}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleQuickRemindTask(task, daysRemaining)}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-700 hover:border-amber-400 text-amber-700 dark:text-amber-300 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                        title="Gửi nhắc việc cho người phụ trách"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Nhắc</span>
                      </button>
                      <button
                        onClick={() => handleQuickCompleteTask(task)}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                        title="Đánh dấu hoàn thành công việc"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Xong</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Widget 3: Công việc hôm nay & Lịch phân công tác ngày */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#DFE7F0] dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-[#EAF4FF] dark:bg-sky-900/40 text-[#1976D2] dark:text-sky-300 rounded-lg border border-[#1976D2]/15">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100">3. Công việc &amp; Phân công tác hôm nay</h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-300">Nhiệm vụ chuyên môn và vị trí trực phòng máy trong ngày</p>
                </div>
              </div>

              <button
                onClick={() => onNavigateModule('tasks')}
                className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Xem tất cả ({tasks.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {todayTasks.length === 0 ? (
              <div className="p-3.5 text-center bg-[#F4F7FB] dark:bg-slate-800/40 rounded-lg border border-[#DFE7F0] dark:border-slate-800 text-[#718096] dark:text-slate-300 text-xs">
                Không có đầu việc mới phát sinh riêng trong hôm nay ({formatDateVN(todayStr)}).
              </div>
            ) : (
              <div className="space-y-2">
                {todayTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${getPriorityBadge(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className="text-xs font-mono text-[#718096] dark:text-slate-300">{task.id}</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-semibold text-[#263445] dark:text-slate-100 truncate mt-1">{task.title}</h4>
                      <p className="text-[11px] text-[#718096] dark:text-slate-300 truncate">Phụ trách: {task.assignee} &bull; {task.taskType}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded shrink-0 border ${
                        task.status === 'Đã hoàn thành'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                          : task.status === 'Đang thực hiện'
                          ? 'bg-[#EAF4FF] text-[#1976D2] border-[#1976D2]/25 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
                          : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3.5 pt-3.5 border-t border-[#DFE7F0] dark:border-slate-800/80">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-[#EAF4FF] dark:bg-sky-950/60 text-[#1976D2] dark:text-sky-300 rounded-md">
                    <CalendarCheck2 className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#263445] dark:text-slate-200">
                    Lịch Phân Công Vị Trí Phòng Máy
                  </h4>
                </div>
                <button
                  onClick={() => onNavigateModule('schedule')}
                  className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Xem lịch công tác</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {displayWorkAssignments.length === 0 ? (
                <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/40 rounded-lg border border-[#DFE7F0] dark:border-slate-800 text-center text-xs text-[#718096] dark:text-slate-300">
                  Chưa có phân công tác ngày cho hôm nay.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {displayWorkAssignments.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onNavigateModule('schedule')}
                      className="p-2.5 bg-[#F4F7FB] dark:bg-slate-800/50 rounded-lg border border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between gap-2 hover:border-[#1976D2] cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <h5 className="text-xs font-bold text-[#263445] dark:text-slate-100 truncate">
                          {item.title || item.roleInShift || item.shiftName}
                        </h5>
                        <p className="text-[11px] text-[#718096] dark:text-slate-300 truncate">
                          {item.assignedUserName || item.userName || 'Chưa gán'} ({item.assignedRole || item.userTitle || 'Cán bộ'})
                        </p>
                        <p className="text-[10px] text-[#718096] dark:text-slate-300 truncate">
                          {item.roomLocation || item.room || 'Khoa CLS'} &bull; {item.shiftTime || 'Ca Sáng'}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#EAF4FF] text-[#155A9C] dark:bg-sky-950 dark:text-sky-300 shrink-0">
                        {item.workType || 'Làm việc'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Widget 4: Lịch trực & Lịch họp tuần */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#DFE7F0] dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-[#EAF4FF] dark:bg-sky-900/40 text-[#1976D2] dark:text-sky-300 rounded-lg border border-[#1976D2]/15">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100">4. Lịch trực &amp; Lịch họp tuần Khoa CLS</h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-300">Thành viên trực chuyên môn và lịch giao ban khoa</p>
                </div>
              </div>

              <button
                onClick={() => onNavigateModule('schedule')}
                className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Xếp lịch &amp; Họp</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3.5">
              {displayShifts.slice(0, 4).map((shift) => {
                const name = shift.assignedUserName || shift.userName || 'Thành viên';
                const role = shift.assignedRole || shift.roleInShift || shift.userTitle || 'Trực ca';
                const room = shift.roomLocation || shift.room || 'Khoa CLS';
                const type = shift.shiftType || shift.shiftName || 'Ca trực';
                const time = shift.shiftTime || (shift.startTime ? `${shift.startTime} - ${shift.endTime}` : 'Theo ca');

                return (
                  <div
                    key={shift.id}
                    className="p-2.5 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-full bg-[#1976D2] text-white font-bold flex items-center justify-center text-xs shrink-0">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-[#263445] dark:text-slate-100 truncate">{name}</h4>
                        <p className="text-[11px] text-[#1976D2] dark:text-sky-400 font-medium truncate">{role} &bull; {room}</p>
                        <p className="text-[10px] text-[#718096] dark:text-slate-300 truncate">{type} ({time})</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-white dark:bg-slate-700 border border-[#DFE7F0] dark:border-slate-600 text-[#263445] dark:text-slate-300 shrink-0">
                      {shift.status || 'Đã phân công'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 pt-3 border-t border-[#DFE7F0] dark:border-slate-800">
              {upcomingMeetings.map((mtg) => (
                <div
                  key={mtg.id}
                  className="p-2.5 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <span className="px-2 py-0.5 bg-[#EAF4FF] text-[#155A9C] dark:bg-sky-950 dark:text-sky-300 border border-[#1976D2]/20 rounded font-bold text-[11px] shrink-0">
                      {mtg.dayOfWeek}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-semibold text-[#263445] dark:text-slate-100 truncate">{mtg.title}</h4>
                      <p className="text-[11px] text-[#718096] dark:text-slate-300 truncate">{mtg.location} &bull; {mtg.time} &bull; Chủ trì: {mtg.chairperson}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-700 text-[#1976D2] dark:text-sky-300 text-[10px] font-semibold rounded shrink-0">
                    {mtg.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (1 Col wide on LG) */}
        <div className="space-y-4">
          {/* Widget 5: Số liệu Thống kê Hằng ngày Snapshot */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#DFE7F0] dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-[#EAF4FF] dark:bg-sky-900/40 text-[#1976D2] dark:text-sky-300 rounded-lg border border-[#1976D2]/15">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100">5. Thống kê số liệu hằng ngày</h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-300">Tổng hợp ca thực hiện BHYT &amp; Nhân dân</p>
                </div>
              </div>

              <button
                onClick={() => onNavigateModule('reports')}
                className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline cursor-pointer"
              >
                Chi tiết &rarr;
              </button>
            </div>

            {dailySnapshot ? (
              <div className="space-y-2.5">
                <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-[#718096] dark:text-slate-300">
                    <span>Kỳ dữ liệu gần nhất</span>
                    <span className="font-bold text-[#263445] dark:text-slate-200">
                      Ngày {dailySnapshot.dayNum} / {dailySnapshot.monthLabel}
                    </span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#155A9C] dark:text-white mt-1 tabular-nums">
                    {dailySnapshot.totalCases.toLocaleString('vi-VN')} <span className="text-xs font-medium text-[#718096] dark:text-slate-300">lượt ca</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2 border-t border-[#DFE7F0] dark:border-slate-700 text-xs">
                    <div>
                      <span className="text-[#718096] dark:text-slate-300 text-[11px]">Bảo hiểm y tế</span>
                      <p className="font-bold text-[#1976D2] dark:text-sky-400 tabular-nums">{dailySnapshot.bhTotal.toLocaleString('vi-VN')} ca</p>
                    </div>
                    <div>
                      <span className="text-[#718096] dark:text-slate-300 text-[11px]">Nhân dân / Dịch vụ</span>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{dailySnapshot.ndTotal.toLocaleString('vi-VN')} ca</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onNavigateModule('reports')}
                  className="w-full py-2 px-3 bg-[#1976D2] hover:bg-[#155A9C] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Mở Báo Cáo Ngày &amp; Giao Ban Sáng
                </button>
              </div>
            ) : (
              <div className="p-3.5 bg-[#F4F7FB] dark:bg-slate-800/40 rounded-lg border border-[#DFE7F0] dark:border-slate-800 text-center space-y-2">
                <p className="text-xs text-[#718096] dark:text-slate-300">Chưa có dữ liệu ca ngày nào được nhập trong tháng.</p>
                <button
                  onClick={() => onNavigateModule('reports')}
                  className="px-3 py-1.5 bg-[#1976D2] hover:bg-[#155A9C] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Nhập số liệu ngày ngay
                </button>
              </div>
            )}
          </div>

          {/* Widget 6: Kênh trao đổi khoa */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#DFE7F0] dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-[#EAF4FF] dark:bg-sky-900/40 text-[#1976D2] dark:text-sky-300 rounded-lg border border-[#1976D2]/15">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100">6. Kênh trao đổi khoa</h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-300">Trao đổi trực tiếp các bộ phận CLS</p>
                </div>
              </div>

              <button
                onClick={() => onNavigateModule('discussion')}
                className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline cursor-pointer"
              >
                Vào Chat &rarr;
              </button>
            </div>

            <div className="space-y-2">
              {unreadMessages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => onNavigateModule('discussion')}
                  className="p-2.5 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-bold text-[#155A9C] dark:text-sky-300 bg-[#EAF4FF] dark:bg-sky-950 px-1.5 py-0.5 rounded truncate max-w-[180px]">
                      #{msg.channelName}
                    </span>
                    <span className="text-[10px] text-[#718096] dark:text-slate-300 shrink-0">{msg.timestamp}</span>
                  </div>
                  <p className="text-xs text-[#263445] dark:text-slate-300 font-medium line-clamp-2 break-words">
                    <strong className="text-[#263445] dark:text-white">{msg.senderName}:</strong> {msg.content}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 7: Thông báo & Nhắc việc đã phát */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#DFE7F0] dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-[#EAF4FF] dark:bg-sky-900/40 text-[#1976D2] dark:text-sky-300 rounded-lg border border-[#1976D2]/15">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100">7. Nhật ký nhắc việc &amp; thông báo</h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-300">Thông báo đa kênh đã gửi gần đây</p>
                </div>
              </div>

              <button
                onClick={() => onNavigateModule('notifications')}
                className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline cursor-pointer"
              >
                Xem hết &rarr;
              </button>
            </div>

            <div className="space-y-2">
              {newNotifications.map((notif) => (
                <div key={notif.id} className="p-2.5 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-[#EAF4FF] text-[#155A9C] dark:bg-sky-950 dark:text-sky-300 rounded truncate">
                      {notif.channel}
                    </span>
                    <span className="text-[10px] text-[#718096] dark:text-slate-300 shrink-0 tabular-nums">{notif.sentAt}</span>
                  </div>
                  <h4 className="text-xs font-bold text-[#263445] dark:text-slate-100 mt-1 truncate" title={notif.title}>{notif.title}</h4>
                  <p className="text-[11px] text-[#718096] dark:text-slate-300 mt-0.5 line-clamp-2 break-words">{notif.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 8: Hồ sơ / SOP sắp hết hạn & Mới cập nhật */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#DFE7F0] dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 rounded-lg border border-amber-200/80 dark:border-amber-800">
                  <FileWarning className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100">8. Hồ sơ / SOP cần chú ý</h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-300">Hồ sơ sắp hết hiệu lực (≤30 ngày) &amp; mới tải</p>
                </div>
              </div>

              <button
                onClick={() => onNavigateModule('documents')}
                className="text-xs font-semibold text-[#1976D2] dark:text-sky-400 hover:underline cursor-pointer"
              >
                Kho SOP &rarr;
              </button>
            </div>

            <div className="space-y-2">
              {expiringDocs.length > 0 ? (
                expiringDocs.map(({ doc, daysRemaining }) => (
                  <div key={doc.id} className="p-2.5 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between gap-2 overflow-hidden">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block truncate">{doc.docType}</span>
                      <h4 className="text-xs font-bold text-[#263445] dark:text-slate-100 truncate" title={doc.title}>{doc.title}</h4>
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 truncate tabular-nums">
                        Hạn: {doc.expirationDate ? formatDateVN(doc.expirationDate) : 'Chưa rõ'}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded shrink-0 ml-1 tabular-nums ${
                      (daysRemaining ?? 0) < 0
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {daysRemaining !== null ? formatDaysRemainingLabel(daysRemaining) : 'Sắp hết hạn'}
                    </span>
                  </div>
                ))
              ) : (
                newDocuments.slice(0, 3).map((doc) => (
                  <div key={doc.id} className="p-2.5 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 overflow-hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-[#EAF4FF] text-[#155A9C] dark:bg-sky-950 dark:text-sky-300 rounded truncate">
                        {doc.docType}
                      </span>
                      <span className="text-[10px] text-[#718096] dark:text-slate-300 font-mono shrink-0">v{doc.version}</span>
                    </div>
                    <h4 className="text-xs font-bold text-[#263445] dark:text-slate-100 mt-1 truncate" title={doc.title}>{doc.title}</h4>
                    <p className="text-[11px] text-[#718096] dark:text-slate-300 mt-0.5 truncate">Đăng bởi: {doc.owner} &bull; {doc.uploadDate}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Compact AI Shortcut */}
          <div
            onClick={() => onNavigateModule('ai-ecosystem')}
            className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-sky-900/50 rounded-xl p-3.5 cursor-pointer hover:border-[#1976D2] transition-colors flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#1976D2] text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4.5 h-4.5 text-amber-200" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-[#263445] dark:text-slate-100 truncate">Trợ Lý Ảo Thông Minh &amp; AI CLS</h4>
                <p className="text-[11px] text-[#718096] dark:text-slate-300 truncate">Hỏi đáp dữ liệu thực &bull; Telegram Bot &bull; Giao ban</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#1976D2] shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
};

