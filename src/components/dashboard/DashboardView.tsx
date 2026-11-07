import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, Clock, AlertTriangle, FileText, FileWarning, 
  Calendar, AlertCircle, ArrowUpRight, MessageSquare, Bell,
  Users, ShieldAlert, Sparkles, UserCheck, Phone, CheckCircle2,
  ChevronRight, Plus, ExternalLink, Activity, Filter, Eye, Tag, UserMinus,
  CalendarCheck2, Briefcase
} from 'lucide-react';
import { TaskItem, DocumentItem, ShiftDuty, WeeklyMeeting, ChatChannelMessage, NotificationLog, User, LeaveRequest } from '../../types/hospital';
import { storageService } from '../../services/storageService';

interface DashboardViewProps {
  tasks: TaskItem[];
  documents: DocumentItem[];
  onNavigateModule: (module: string) => void;
  onOpenNewTask: () => void;
  onOpenNewDoc: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  documents,
  onNavigateModule,
  onOpenNewTask,
  onOpenNewDoc
}) => {
  const [shifts, setShifts] = useState<ShiftDuty[]>([]);
  const [meetings, setMeetings] = useState<WeeklyMeeting[]>([]);
  const [messages, setMessages] = useState<ChatChannelMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const currentUser = storageService.getCurrentUser();

  const loadAllData = () => {
    setShifts(storageService.getShifts());
    setMeetings(storageService.getMeetings());
    setMessages(storageService.getChatMessages());
    setNotifications(storageService.getNotifications());
    setUsers(storageService.getUsers());
    setLeaveRequests(storageService.getLeaveRequests());
  };

  useEffect(() => {
    loadAllData();
    const unsubscribe = storageService.subscribe(loadAllData);
    return () => unsubscribe();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Today's Tasks
  const todayTasks = tasks.filter(t => t.dueDate === todayStr || t.createdDate?.startsWith(todayStr));

  // Today's Work Assignments (Lịch phân công tác ngày - Vị trí & phòng chuyên môn)
  const todayWorkAssignments = shifts.filter(s => 
    (s.date === todayStr || s.date === '2026-07-26') && (s.workType === 'Làm việc' || s.workType === 'Đào tạo' || s.workType === 'Họp')
  );
  const displayWorkAssignments = todayWorkAssignments.length > 0 
    ? todayWorkAssignments.slice(0, 4) 
    : shifts.filter(s => s.workType === 'Làm việc' || s.workType === 'Đào tạo').slice(0, 4);
  
  // 2. Today's Shift & Currently On Duty Members
  const todayShifts = shifts.filter(s => s.date === todayStr || s.date === '2026-07-26'); // Fallback to demo date
  const onDutyUsers = users.filter(u => u.isOnDuty || todayShifts.some(s => s.assignedUserId === u.id));

  // People on leave today (approved or pending leave requests + shifts marked as 'Nghỉ')
  const activeLeaves = leaveRequests.filter(l => l.status === 'Đã phê duyệt' || l.status === 'Chờ duyệt');
  const shiftsOff = shifts.filter(s => (s.date === todayStr || s.date === '2026-07-26') && (s.workType === 'Nghỉ' || s.title?.includes('Nghỉ')));
  const todayOffCount = activeLeaves.length + shiftsOff.length;

  // 3. Weekly Schedule (Meetings & Shifts this week)
  const upcomingMeetings = meetings.slice(0, 4);

  // 4. New Documents (SOPs / Documents uploaded recently)
  const newDocuments = [...documents].sort((a, b) => (b.uploadDate || '').localeCompare(a.uploadDate || '')).slice(0, 4);

  // 5. New Notifications
  const newNotifications = notifications.slice(0, 4);

  // 6. Unread Messages / Teams Chat
  const unreadMessages = messages.filter(m => m.isUnread || true).slice(0, 4);

  // 7. Upcoming Tasks (Due in the next 7 days)
  const upcomingTasks = tasks.filter(t => t.dueDate > todayStr && t.status !== 'Đã hoàn thành').slice(0, 4);

  // 8. Expiring Documents
  const expiringDocs = documents.filter(d => d.expirationDate && d.expirationDate <= '2026-08-31').slice(0, 4);

  // Helper for status badge styling
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
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      
      {/* Notion + MS Teams Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-sky-50/80 dark:bg-gradient-to-r dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 text-slate-800 dark:text-white rounded-2xl p-6 sm:p-8 shadow-xs dark:shadow-xl border border-blue-200/70 dark:border-indigo-900/40 transition-colors">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 -mb-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-3">
              <span className="px-3 py-1 bg-indigo-100/80 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> CLS WorkHub &bull; Khoa Cận Lâm Sàng
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline-block">
                Hôm nay: {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Xin chào, <span className="text-indigo-600 dark:text-indigo-300">{currentUser?.name}</span> 👋
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Hệ thống điều hành tác nghiệp Khoa Cận Lâm Sàng. Tích hợp Quản lý Lịch trực, Lịch họp, Kế hoạch tuần, Nhiệm vụ chuyên môn, Hồ sơ xét nghiệm SOP & Kênh trao đổi nội bộ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigateModule('ai-ecosystem')}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-sm rounded-xl shadow-xs transition-all flex items-center space-x-2 border border-indigo-400/30 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Hệ Sinh Thái AI CLS</span>
            </button>
            <button
              onClick={onOpenNewTask}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-xl shadow-xs transition-all flex items-center space-x-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm công việc</span>
            </button>
            <button
              onClick={onOpenNewDoc}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-700 font-medium text-sm rounded-xl shadow-xs transition-all flex items-center space-x-2 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-500 dark:text-slate-300" />
              <span>Tải SOP / Hồ sơ</span>
            </button>
          </div>
        </div>
      </div>

      {/* AI 4-Pillars Quick Access Widget */}
      <div 
        onClick={() => onNavigateModule('ai-ecosystem')}
        className="bg-white dark:bg-gradient-to-r dark:from-slate-900 dark:via-indigo-950 dark:to-blue-950 border border-blue-200/80 dark:border-indigo-500/30 rounded-2xl p-4 text-slate-800 dark:text-white shadow-xs dark:shadow-lg cursor-pointer hover:border-blue-400 dark:hover:border-indigo-400/60 transition-all flex flex-col md:flex-row items-center justify-between gap-4 group"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/30 group-hover:scale-105 transition-transform text-white">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider bg-amber-100 dark:bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-300/20">
                AI Trí Tuệ Nhân Tạo
              </span>
              <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">Gemini 3.7 & ML Operations</span>
            </div>
            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base mt-0.5">
              4 Trụ Cột AI: Giao ban sáng 07:00 • Dự báo tải lượng & xếp lịch • ISO Copilot • Bảo trì máy RUL
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-200 group-hover:text-blue-600 dark:group-hover:text-white transition-colors">
            Khám phá Trung tâm AI
          </span>
          <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>

      {/* Quick Summary Counter Bar (9 Key Indices) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div 
          onClick={() => onNavigateModule('tasks')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Việc hôm nay</span>
            <CheckSquare className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-2">{todayTasks.length}</p>
        </div>

        <div 
          onClick={() => onNavigateModule('hr')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-amber-400 dark:hover:border-amber-600 transition-all cursor-pointer shadow-2xs"
          title="Xem danh sách đơn nghỉ phép và nhân sự nghỉ hôm nay"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Số người nghỉ hôm nay</span>
            <UserMinus className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-2">{todayOffCount}</p>
        </div>

        <div 
          onClick={() => onNavigateModule('schedule')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-purple-400 dark:hover:border-purple-600 transition-all cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Lịch họp tuần</span>
            <Calendar className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-2">{meetings.length}</p>
        </div>

        <div 
          onClick={() => onNavigateModule('discussion')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Tin chưa đọc</span>
            <MessageSquare className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-2">{unreadMessages.length}</p>
        </div>

        <div 
          onClick={() => onNavigateModule('tasks')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-amber-400 dark:hover:border-amber-600 transition-all cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Việc sắp hạn</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-2">{upcomingTasks.length}</p>
        </div>

        <div 
          onClick={() => onNavigateModule('documents')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-rose-400 dark:hover:border-rose-600 transition-all cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>SOP hết hạn</span>
            <FileWarning className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-2">{expiringDocs.length}</p>
        </div>
      </div>

      {/* Main Grid Section: Microsoft Teams + Notion + Google Calendar style widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN (2 Cols wide on LG) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Widget 1: Công việc hôm nay (Today's Tasks) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-xl">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">1. Công việc hôm nay</h3>
                  <p className="text-xs text-slate-500">Nhiệm vụ chuyên môn cận lâm sàng cần hoàn tất trong ngày</p>
                </div>
              </div>

              <button 
                onClick={() => onNavigateModule('tasks')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>Xem tất cả ({tasks.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {todayTasks.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl text-slate-500 text-sm">
                Không có công việc quá hạn hoặc cần hoàn thành trong hôm nay.
              </div>
            ) : (
              <div className="space-y-3">
                {todayTasks.slice(0, 4).map((task) => (
                  <div 
                    key={task.id} 
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-3 hover:border-blue-300 dark:hover:border-blue-700 transition-all overflow-hidden"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border shrink-0 ${getPriorityBadge(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className="text-xs font-mono text-slate-400 shrink-0">{task.id}</span>
                        <span className="text-xs px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded shrink-0">
                          {task.taskType}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words line-clamp-2">{task.title}</h4>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                        <span className="truncate">👤 Phụ trách: <strong className="text-slate-700 dark:text-slate-300">{task.assignee}</strong></span>
                        <span className="shrink-0">⏰ Hạn: <strong className="text-slate-700 dark:text-slate-300">{task.dueDate}</strong></span>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 text-xs font-medium rounded-lg shrink-0 ${
                      task.status === 'Đã hoàn thành' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                      task.status === 'Đang thực hiện' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                      'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Sub-section: Lịch phân công tác ngày (Work Duty Roster) */}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 rounded-lg shrink-0">
                    <CalendarCheck2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      Lịch Phân Công Tác Ngày (Vị Trí & Phòng Chuyên Môn)
                    </h4>
                    <p className="text-[11px] text-slate-500">Phân công cán bộ làm việc tại các phòng máy, bàn đọc phim & phòng LAB hôm nay</p>
                  </div>
                </div>

                <button 
                  onClick={() => onNavigateModule('schedule')}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 shrink-0 self-start sm:self-center"
                >
                  <span>Xem lịch công tác</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {displayWorkAssignments.length === 0 ? (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-center text-xs text-slate-500 italic">
                  Chưa có phân công tác ngày cho hôm nay. Bấm "Xem lịch công tác" để xếp lịch.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {displayWorkAssignments.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => onNavigateModule('schedule')}
                      className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 overflow-hidden hover:border-teal-400 cursor-pointer transition-all"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0"></span>
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={item.title || item.roleInShift || item.shiftName}>
                            {item.title || item.roleInShift || item.shiftName}
                          </h5>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          👤 <strong>{item.assignedUserName || item.userName || 'Chưa gán'}</strong> ({item.assignedRole || item.userTitle || 'Cán bộ'})
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          📍 {item.roomLocation || item.room || 'Khoa CLS'} &bull; ⏰ {item.shiftTime || 'Ca Sáng (07:00 - 15:00)'}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0 ml-1">
                        {item.workType || 'Làm việc'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Widget 2: Lịch trực hôm nay & Thành viên đang trực */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">2. Lịch trực & Thành viên đang trực hôm nay</h3>
                  <p className="text-xs text-slate-500">Kỹ thuật viên & Bác sĩ trực ca xét nghiệm, CĐHA, vi sinh hiện tại</p>
                </div>
              </div>

              <button 
                onClick={() => onNavigateModule('schedule')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>Xếp lịch trực</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* List of active members on duty */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {todayShifts.slice(0, 4).map((shift) => {
                const name = shift.assignedUserName || shift.userName || 'Thành viên';
                const role = shift.assignedRole || shift.roleInShift || shift.userTitle || 'Trực ca';
                const room = shift.roomLocation || shift.room || 'Khoa CLS';
                const type = shift.shiftType || shift.shiftName || 'Ca trực';
                const time = shift.shiftTime || (shift.startTime ? `${shift.startTime} - ${shift.endTime}` : 'Theo ca');

                return (
                  <div 
                    key={shift.id} 
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 overflow-hidden"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                          {name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{name}</h4>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium truncate">{role} &bull; {room}</p>
                        <p className="text-[11px] text-slate-500 truncate">{type} ({time})</p>
                      </div>
                    </div>

                    <span className={`px-2 py-1 text-[10px] font-bold rounded-md shrink-0 ml-1 ${
                      shift.status === 'Đang trực' 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/50 animate-pulse'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {shift.status || 'Đã phân công'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Widget 3: Lịch họp & Kế hoạch tuần (Google Calendar style) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">3. Lịch họp & Kế hoạch tuần Khoa CLS</h3>
                  <p className="text-xs text-slate-500">Lịch giao ban khoa, kiểm chuẩn thiết bị, sinh hoạt chuyên môn</p>
                </div>
              </div>

              <button 
                onClick={() => onNavigateModule('schedule')}
                className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
              >
                <span>Xem lịch Google Calendar</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {upcomingMeetings.map((mtg) => (
                <div 
                  key={mtg.id} 
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-hidden"
                >
                  <div className="flex items-start space-x-3 min-w-0 flex-1">
                    <div className="px-2.5 py-1.5 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded-lg text-center shrink-0 font-bold text-xs">
                      {mtg.dayOfWeek}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{mtg.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">📍 {mtg.location} &bull; ⏰ {mtg.time} &bull; Chủ trì: {mtg.chairperson}</p>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 font-mono truncate">Ghi chú: {mtg.notes}</p>
                    </div>
                  </div>

                  <span className="self-start sm:self-center px-2.5 py-1 bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-medium rounded-lg border border-purple-200 dark:border-purple-800/60 shrink-0">
                    {mtg.type}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 4: Công việc sắp đến hạn (Upcoming Tasks) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">4. Công việc sắp đến hạn (7 ngày tới)</h3>
                  <p className="text-xs text-slate-500">Cần theo dõi tiến độ để hoàn thành đúng thời gian quy định</p>
                </div>
              </div>

              <button 
                onClick={() => onNavigateModule('tasks')}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <span>Chi tiết nhiệm vụ</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {upcomingTasks.map((task) => (
                <div key={task.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 overflow-hidden">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-mono text-slate-400 truncate block">{task.id} &bull; {task.taskType}</span>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{task.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">Phụ trách: <strong>{task.assignee}</strong> | Hạn: <strong className="text-amber-600">{task.dueDate}</strong></p>
                  </div>

                  <span className={`px-2.5 py-1 text-xs font-medium rounded-lg shrink-0 ${getPriorityBadge(task.priority)}`}>
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN (1 Col wide on LG) */}
        <div className="space-y-6">

          {/* Widget 5: Tin nhắn & Trao đổi chưa đọc (MS Teams channel style) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 rounded-xl">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">5. Kênh trao đổi khoa</h3>
                  <p className="text-xs text-slate-500">Kênh MS Teams nội bộ Khoa CLS</p>
                </div>
              </div>

              <button 
                onClick={() => onNavigateModule('discussion')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Vào khung Chat &rarr;
              </button>
            </div>

            <div className="space-y-3">
              {unreadMessages.map((msg) => (
                <div 
                  key={msg.id}
                  onClick={() => onNavigateModule('discussion')}
                  className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-emerald-400 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded truncate max-w-[180px]">
                      #{msg.channelName}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">{msg.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium line-clamp-2 break-words">
                    <strong className="text-slate-900 dark:text-white">{msg.senderName}:</strong> {msg.content}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 6: Hồ sơ mới (Notion style SOP database) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">6. Hồ sơ mới cập nhật</h3>
                  <p className="text-xs text-slate-500">SOP xịn, quy trình KT, phiếu hiệu chuẩn mới</p>
                </div>
              </div>

              <button 
                onClick={() => onNavigateModule('documents')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Kho SOP &rarr;
              </button>
            </div>

            <div className="space-y-3">
              {newDocuments.map((doc) => (
                <div key={doc.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded truncate">
                      {doc.docType}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">v{doc.version}</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 truncate break-all" title={doc.title}>{doc.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">Đăng bởi: {doc.owner} &bull; {doc.uploadDate}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 7: Thông báo nội bộ (Internal Directives) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 rounded-xl">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">7. Thông báo nội bộ mới</h3>
                  <p className="text-xs text-slate-500">Chỉ đạo BCN Khoa & Bệnh viện</p>
                </div>
              </div>

              <button 
                onClick={() => onNavigateModule('notifications')}
                className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
              >
                Xem hết &rarr;
              </button>
            </div>

            <div className="space-y-3">
              {newNotifications.map((notif) => (
                <div key={notif.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded truncate">
                      {notif.type}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">{notif.sentAt}</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 truncate">{notif.subject}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 break-words">{notif.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 8: Hồ sơ sắp hết hạn (Expiring Documents) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 rounded-xl">
                  <FileWarning className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">8. Hồ sơ / Giấy phép sắp hết hạn</h3>
                  <p className="text-xs text-slate-500">Cần gia hạn hoặc kiểm chuẩn thiết bị</p>
                </div>
              </div>

              <button 
                onClick={() => onNavigateModule('documents')}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
              >
                Gia hạn &rarr;
              </button>
            </div>

            <div className="space-y-3">
              {expiringDocs.map((doc) => (
                <div key={doc.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 overflow-hidden">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block truncate">{doc.docType}</span>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate break-all" title={doc.title}>{doc.title}</h4>
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 truncate">Hạn: {doc.expirationDate}</p>
                  </div>

                  <span className="px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold rounded shrink-0 ml-1">
                    Sắp hết hạn
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
