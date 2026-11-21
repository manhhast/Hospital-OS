import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Bell, Search, User as UserIcon, Shield, Bug, Sun, Moon,
  Plus, CheckCircle2, AlertTriangle, Hospital, Activity, KeyRound, LogIn,
  X, FileText, CheckSquare, Wrench, Building2, Clock, Users, ArrowRight,
  Sparkles, Command, ChevronRight, LogOut, ArrowLeftRight, Send, BellRing,
  Cloud, CloudOff, RefreshCw, Lock
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { postgresSyncService, type PostgresSyncState } from '../../services/postgresSyncService';
import { EquipmentItem, TaskItem, User, UserRole } from '../../types/hospital';
import { medicalSearchEngine, SearchResultItem, removeVietnameseTones } from '../../services/searchService';
import {
  scanEquipmentExpirations,
  scanTaskReminders,
  formatDaysRemainingLabel,
  dispatchEquipmentReminder,
  dispatchTaskReminder
} from '../../utils/operationalAlerts';
import { formatDateVN } from '../../utils/dateUtils';

interface HeaderProps {
  onSearchChange?: (query: string) => void;
  onOpenSearchModal: (initialQuery?: string) => void;
  onNavigateModule: (module: string, targetId?: string, extraData?: any) => void;
  onOpenNewTask: () => void;
  onOpenNewDoc: () => void;
  onToggleTheme: () => void;
  onChangeThemeMode?: (mode: 'light' | 'dark' | 'system') => void;
  themeMode?: 'light' | 'dark' | 'system';
  isDarkMode: boolean;
  activeModule: string;
  onOpenAuth: (mode: 'login' | 'change-password' | 'forgot-password') => void;
  onQuickLock?: () => void;
  onShowToast?: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSearchChange,
  onOpenSearchModal,
  onNavigateModule,
  onOpenNewTask,
  onOpenNewDoc,
  onToggleTheme,
  onChangeThemeMode,
  themeMode = 'system',
  isDarkMode,
  activeModule,
  onOpenAuth,
  onQuickLock,
  onShowToast
}) => {
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>(() => storageService.getEquipment());
  const [taskList, setTaskList] = useState<TaskItem[]>(() => storageService.getTasks());
  const [pgState, setPgState] = useState<PostgresSyncState>(() => postgresSyncService.getState());
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showAlertPopover, setShowAlertPopover] = useState(false);
  const [alertTab, setAlertTab] = useState<'all' | 'equipment' | 'tasks'>('all');
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const alertPopoverRef = useRef<HTMLDivElement>(null);

  // Live Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Live System Clock (Section 3.1 HIS Header standard)
  const [nowClock, setNowClock] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNowClock(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const settings = storageService.getSettings();

  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setCurrentUser(storageService.getCurrentUser());
      setEquipmentList(storageService.getEquipment());
      setTaskList(storageService.getTasks());
    });
    const unsubPg = postgresSyncService.subscribe(() => {
      setPgState(postgresSyncService.getState());
    });
    return () => {
      unsubscribe();
      unsubPg();
    };
  }, []);

  const handleHeaderCloudClick = async () => {
    if (pgState.configured) {
      if (currentUser.role === 'Admin') {
        onNavigateModule('settings');
      } else if (pgState.status === 'synced') {
        try {
          const res = await postgresSyncService.pullAllServerToLocal();
          onShowToast?.(
            'Đã đồng bộ PostgreSQL mới nhất',
            `Đã cập nhật ${res.bucketsPulled} phân hệ từ máy chủ PostgreSQL.`,
            'success'
          );
        } catch (err) {
          onShowToast?.('Lỗi đồng bộ PostgreSQL', err instanceof Error ? err.message : String(err), 'error');
        }
      } else if (pgState.errorMessage) {
        onShowToast?.('Trạng thái PostgreSQL', pgState.errorMessage, 'warning');
      }
      return;
    }

    if (currentUser.role === 'Admin') {
      onNavigateModule('settings');
    } else {
      onShowToast?.(
        'Chế độ Lưu trữ Cục bộ',
        'Dữ liệu đang được lưu trực tiếp trên trình duyệt hiện tại (IndexedDB & LocalStorage).',
        'info'
      );
    }
  };

  const eqCompliance = useMemo(() => scanEquipmentExpirations(equipmentList, 30), [equipmentList]);
  const taskReminders = useMemo(() => scanTaskReminders(taskList, 3), [taskList]);
  const totalUrgentBadge = eqCompliance.alerts.length + taskReminders.alerts.length;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
      if (alertPopoverRef.current && !alertPopoverRef.current.contains(event.target as Node)) {
        setShowAlertPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update live search results
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const results = medicalSearchEngine.search(searchQuery, 'all', 8);
    setSearchResults(results);
    onSearchChange?.(searchQuery);
  }, [searchQuery, onSearchChange]);

  const getRoleBadgeColor = (role: UserRole | string) => {
    switch (role) {
      case 'Admin': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/40';
      case 'Manager':
      case 'Trưởng khoa':
      case 'Phó khoa':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40';
      case 'Doctor':
      case 'Bác sĩ':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40';
      case 'Staff':
      case 'Nhân viên':
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
    }
  };

  const getModuleTitle = (mod: string) => {
    switch (mod) {
      case 'dashboard': return 'Tổng quan Dashboard';
      case 'ai-ecosystem': return 'Trợ lý AI Điều hành Khoa';
      case 'tasks': return 'Quản lý Công việc & Y vụ';
      case 'documents': return 'Hồ sơ & Quy trình SOP / ISO';
      case 'equipment': return 'Quản lý Máy móc & Thiết bị';
      case 'rooms': return 'Phòng / Bộ phận Trực thuộc';
      case 'hr': return 'Nhân sự & Đào tạo Khoa';
      case 'schedule': return 'Lịch trực & Ca công tác';
      case 'meetings': return 'Cuộc họp & Hội chẩn';
      case 'reports': return 'Báo cáo & Thống kê';
      case 'sync-history': return 'Lịch sử Đồng bộ Dữ liệu';
      case 'integration': return 'Cấu hình · Cổng API HIS/LIS/PACS';
      case 'discussion': return 'Kênh Trao đổi Nội bộ';
      case 'notifications': return 'Cấu hình · Thông báo Nội bộ';
      case 'settings': return 'Cấu hình · Thiết lập Hệ thống';
      case 'users': return 'Cấu hình · Phân quyền Hệ thống';
      case 'audit': return 'Cấu hình · Lịch sử Audit Log';
      case 'gas-architecture': return 'Cấu hình · Kiến trúc GAS Code';
      default: return 'Phân hệ Cận Lâm Sàng';
    }
  };

  const handleSelectSearchResult = (item: SearchResultItem) => {
    setIsSearchFocused(false);
    setSearchQuery('');
    onNavigateModule(item.moduleTarget, item.targetId, item.metadata);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (searchResults.length > 0) {
        handleSelectSearchResult(searchResults[0]);
      } else {
        onOpenSearchModal(searchQuery);
      }
    } else if (e.key === 'Escape') {
      setIsSearchFocused(false);
    }
  };

  return (
    <header className="sm:sticky sm:top-0 z-30 flex flex-col bg-white dark:bg-[#162033] border-b border-[#DFE7F0] dark:border-slate-700/80 transition-colors shrink-0 shadow-2xs">
      {/* Row 1: Prominent Module Title & System Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-2.5 min-h-[64px]">
        {/* Left: Hospital Facility Unit & Prominent Active Page Title */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#EAF4FF] dark:bg-sky-950/60 border border-[#1976D2]/25 flex items-center justify-center shrink-0 shadow-2xs">
            <Hospital className="w-5 h-5 text-[#1976D2] dark:text-sky-400" />
          </div>
          <div className="flex flex-col min-w-0 leading-snug">
            <h1 className="text-base sm:text-lg md:text-xl font-extrabold text-[#155A9C] dark:text-sky-300 tracking-tight truncate sm:whitespace-normal">
              {getModuleTitle(activeModule)}
            </h1>
            <p className="text-xs font-medium text-[#718096] dark:text-slate-400 truncate">
              Khoa Cận Lâm Sàng · Bệnh viện Đa khoa Sông Thương
            </p>
          </div>
        </div>

        {/* Right: System Clock, Sync, Alerts, Theme Toggle, Quick Lock, Profile */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* HIS System Clock */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4F7FB] dark:bg-slate-800/70 border border-[#DFE7F0] dark:border-slate-700 text-xs font-mono font-semibold text-[#263445] dark:text-slate-200 tabular-nums shrink-0">
            <Clock className="w-3.5 h-3.5 text-[#1976D2] dark:text-sky-400 shrink-0" />
            <span>
              {nowClock.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} &middot;{' '}
              {nowClock.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          </div>



        {/* Debug Mode Badge */}
        {settings.debugMode && (
          <div className="hidden xl:flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 text-xs rounded-full font-medium">
            <Bug className="w-3.5 h-3.5" />
            <span>Debug</span>
          </div>
        )}

        {/* Database / Cloud Sync Trigger */}
        {pgState.configured ? (() => {
          const isSyncingNow =
            pgState.status === 'syncing' ||
            pgState.status === 'checking' ||
            pgState.pendingChangesCount > 0;
          const isSyncedOk = pgState.status === 'synced' && !isSyncingNow;
          return (
            <button
              type="button"
              onClick={() => void handleHeaderCloudClick()}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                isSyncingNow
                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60'
                  : isSyncedOk
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 hover:bg-emerald-100'
                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60 hover:bg-rose-100'
              }`}
              title={
                isSyncingNow
                  ? `Đang tự động đồng bộ ${pgState.pendingChangesCount > 0 ? `${pgState.pendingChangesCount} thay đổi ` : ''}lên PostgreSQL...`
                  : isSyncedOk
                  ? `Đồng bộ hai chiều tự động theo thời gian thực (${pgState.liveStreamConnected ? 'Kênh Live SSE đang bật' : 'Tự động định kỳ'}, không cần bấm nút)${pgState.lastSyncedAt ? ` · ${pgState.lastSyncedAt}` : ''}`
                  : pgState.errorMessage || 'Trạng thái đồng bộ PostgreSQL Server'
              }
            >
              {isSyncingNow ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : isSyncedOk ? (
                <span className="relative inline-flex items-center justify-center shrink-0">
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                  {pgState.liveStreamConnected && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}
                </span>
              ) : (
                <CloudOff className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="hidden sm:inline whitespace-nowrap">
                {isSyncingNow
                  ? 'Đang đồng bộ...'
                  : isSyncedOk
                  ? pgState.liveStreamConnected
                    ? 'Live Sync'
                    : 'PostgreSQL Sync'
                  : 'Lỗi PostgreSQL'}
              </span>
            </button>
          );
        })() : (
          <button
            type="button"
            onClick={() => void handleHeaderCloudClick()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Dữ liệu đang lưu cục bộ trên trình duyệt · Quản trị viên có thể cấu hình PostgreSQL Server"
          >
            <Cloud className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Lưu Cục Bộ</span>
          </button>
        )}

        {/* Unified Equipment Expiration & Task Reminder Bell */}
        <div className="relative" ref={alertPopoverRef}>
          <button
            type="button"
            onClick={() => setShowAlertPopover((prev) => !prev)}
            className="relative p-2 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cảnh báo thời hạn thiết bị & Nhắc việc đến hạn"
          >
            <Bell className={`w-5 h-5 ${totalUrgentBadge > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`} />
            {totalUrgentBadge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold tabular-nums flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                {totalUrgentBadge > 99 ? '99+' : totalUrgentBadge}
              </span>
            )}
          </button>

          {showAlertPopover && (
            <div className="absolute right-0 mt-2 w-[340px] sm:w-[420px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    Cảnh Báo Hạn Thiết Bị &amp; Nhắc Việc
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {eqCompliance.overdueCount + taskReminders.overdueCount} quá hạn &middot; {eqCompliance.critical7Count + taskReminders.dueTodayCount} khẩn cấp
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAlertPopover(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 bg-white dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setAlertTab('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer tabular-nums ${
                    alertTab === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Tất cả ({totalUrgentBadge})
                </button>
                <button
                  type="button"
                  onClick={() => setAlertTab('equipment')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer tabular-nums ${
                    alertTab === 'equipment'
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Thiết bị ({eqCompliance.alerts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAlertTab('tasks')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer tabular-nums ${
                    alertTab === 'tasks'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Công việc ({taskReminders.alerts.length})
                </button>
              </div>

              {/* Alert List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 custom-scrollbar">
                {totalUrgentBadge === 0 ? (
                  <div className="p-8 text-center text-slate-400 space-y-2">
                    <CheckCircle2 className="w-7 h-7 mx-auto text-emerald-500" />
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Không có thiết bị sắp hết hạn (≤ 30 ngày) hay công việc quá hạn.
                    </p>
                  </div>
                ) : (
                  <>
                    {(alertTab === 'all' || alertTab === 'equipment') &&
                      eqCompliance.alerts.slice(0, 6).map((item) => {
                        const isOverdue = item.daysRemaining < 0;
                        return (
                          <div
                            key={item.id}
                            className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-start justify-between gap-2.5"
                          >
                            <div
                              className="min-w-0 flex-1 cursor-pointer"
                              onClick={() => {
                                setShowAlertPopover(false);
                                onNavigateModule('equipment', item.equipmentId);
                              }}
                            >
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <Wrench className={`w-3.5 h-3.5 shrink-0 ${isOverdue ? 'text-rose-600' : 'text-amber-600'}`} />
                                <span className={`font-bold tabular-nums ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'}`}>
                                  {formatDaysRemainingLabel(item.daysRemaining)}
                                </span>
                                <span className="text-slate-400">&middot;</span>
                                <span className="font-mono text-slate-500 dark:text-slate-400 truncate">{item.equipmentCode}</span>
                              </div>
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                                {item.trackLabel}: {item.equipmentName}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                                Hạn: {item.expiryDateVN} &middot; {item.assignedTechnician}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                dispatchEquipmentReminder(item, 'Telegram');
                                onShowToast?.('Đã gửi nhắc hạn thiết bị', `${item.equipmentCode} (${item.trackLabel}) tới ${item.assignedTechnician}`, 'success');
                              }}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-indigo-950/60 shrink-0 cursor-pointer flex items-center gap-1"
                              title="Gửi nhắc nhở ngay"
                            >
                              <Send className="w-3 h-3" />
                              <span>Nhắc</span>
                            </button>
                          </div>
                        );
                      })}

                    {(alertTab === 'all' || alertTab === 'tasks') &&
                      taskReminders.alerts.slice(0, 6).map((item) => {
                        const isOverdue = item.daysRemaining < 0;
                        return (
                          <div
                            key={item.task.id}
                            className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-start justify-between gap-2.5"
                          >
                            <div
                              className="min-w-0 flex-1 cursor-pointer"
                              onClick={() => {
                                setShowAlertPopover(false);
                                onNavigateModule('tasks', item.task.id);
                              }}
                            >
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <CheckSquare className={`w-3.5 h-3.5 shrink-0 ${isOverdue ? 'text-rose-600' : 'text-blue-600'}`} />
                                <span className={`font-bold tabular-nums ${isOverdue ? 'text-rose-600 dark:text-rose-400' : item.daysRemaining === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                  {formatDaysRemainingLabel(item.daysRemaining)}
                                </span>
                                <span className="text-slate-400">&middot;</span>
                                <span className="font-mono text-slate-500 dark:text-slate-400">{item.task.id}</span>
                              </div>
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                                {item.task.title}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                                Hạn: {formatDateVN(item.task.dueDate)} &middot; {item.task.assignee}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                dispatchTaskReminder(item.task, item.daysRemaining, 'Telegram');
                                onShowToast?.('Đã nhắc việc', `Đã gửi nhắc nhở "${item.task.title}" cho ${item.task.assignee}`, 'success');
                              }}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950/60 shrink-0 cursor-pointer flex items-center gap-1"
                              title="Gửi nhắc việc qua Telegram/In-App"
                            >
                              <Send className="w-3 h-3" />
                              <span>Nhắc</span>
                            </button>
                          </div>
                        );
                      })}
                  </>
                )}
              </div>

              {/* Footer Links */}
              <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setShowAlertPopover(false);
                    onNavigateModule('equipment');
                  }}
                  className="text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Hạn thiết bị &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAlertPopover(false);
                    onNavigateModule('tasks');
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Quản lý nhắc việc &rarr;
                </button>
                {currentUser.role === 'Admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAlertPopover(false);
                      onNavigateModule('notifications');
                    }}
                    className="text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                  >
                    Trung tâm TB &rarr;
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Direct 1-Click Light / Dark Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2 text-slate-600 hover:text-[#155A9C] dark:text-slate-200 dark:hover:text-white rounded-xl bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-[#DFE7F0] dark:border-slate-700 transition-colors flex items-center justify-center cursor-pointer"
          title={isDarkMode ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
          aria-label={isDarkMode ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
        >
          {isDarkMode ? (
            <Sun className="w-4.5 h-4.5 text-amber-400" />
          ) : (
            <Moon className="w-4.5 h-4.5 text-[#1976D2]" />
          )}
        </button>

        {/* 1-Click Quick Lock Screen Button */}
        {onQuickLock && (
          <button
            type="button"
            onClick={onQuickLock}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#DFE7F0] dark:border-amber-800/70 bg-[#F4F7FB] hover:bg-[#EAF4FF] hover:border-[#1976D2]/40 dark:bg-amber-950/40 dark:hover:bg-amber-950/70 text-[#263445] hover:text-[#155A9C] dark:text-amber-300 text-xs font-semibold transition-colors cursor-pointer shrink-0"
            title="Khóa nhanh màn hình (Alt+L hoặc Ctrl+Shift+L)"
          >
            <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="hidden md:inline whitespace-nowrap">Khóa nhanh</span>
          </button>
        )}

        {/* Role & User Switcher */}
        <div className="relative" ref={roleDropdownRef}>
          <button
            onClick={() => setShowRoleDropdown(!showRoleDropdown)}
            className="flex items-center gap-2 p-1 pr-2 hover:bg-[#F4F7FB] dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-[#DFE7F0] transition-colors cursor-pointer whitespace-nowrap"
          >
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full object-cover border border-[#DFE7F0] dark:border-slate-700 shrink-0"
            />
            <div className="hidden lg:block text-left min-w-0">
              <div className="text-xs font-semibold text-[#263445] dark:text-slate-100 leading-tight truncate max-w-[140px]">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-[#718096] dark:text-slate-400 leading-tight truncate max-w-[140px]">
                {currentUser.title ? `${currentUser.title} · ${currentUser.role}` : currentUser.role}
              </div>
            </div>
          </button>

          {showRoleDropdown && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-700/80 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150 p-3.5">
              {/* Active User Information Card */}
              <div className="flex items-center justify-between mb-3.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-3 min-w-0">
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {currentUser.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {currentUser.role === 'Admin'
                        ? 'Quản trị hệ thống'
                        : `${currentUser.title || 'Cán bộ'} · ${currentUser.department || 'Khoa CLS'}`}
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md shrink-0 ${getRoleBadgeColor(currentUser.role)}`}>
                  {currentUser.role}
                </span>
              </div>

              {/* Cloud / PostgreSQL Status Row */}
              {pgState.configured ? (
                <div className="mb-3 p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0">
                    <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      {pgState.liveStreamConnected ? (
                        <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                      ) : (
                        <Cloud className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      )}
                      <span className="truncate">
                        {pgState.liveStreamConnected
                          ? 'Đồng bộ Live trực tiếp'
                          : 'Đồng bộ tự động định kỳ'}
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 pl-4 tabular-nums">
                      {pgState.pendingChangesCount > 0
                        ? `Đang gửi ${pgState.pendingChangesCount} thay đổi...`
                        : pgState.lastSyncedAt
                        ? `Tự động lưu · ${pgState.lastSyncedAt}`
                        : 'Tự động lưu hai chiều'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRoleDropdown(false);
                      void postgresSyncService
                        .pullAllServerToLocal()
                        .then((res) =>
                          onShowToast?.(
                            'Đã đồng bộ dữ liệu mới nhất',
                            `Đã tải ${res.bucketsPulled} phân hệ từ máy chủ PostgreSQL.`,
                            'success'
                          )
                        )
                        .catch((err) =>
                          onShowToast?.(
                            'Lỗi đồng bộ PostgreSQL',
                            err instanceof Error ? err.message : String(err),
                            'error'
                          )
                        );
                    }}
                    className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-200 text-emerald-700 dark:text-emerald-300 cursor-pointer shrink-0"
                    title="Làm mới thủ công từ PostgreSQL"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="mb-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                      <span className="truncate">Lưu trữ Cục bộ (IndexedDB &amp; LocalStorage)</span>
                    </div>
                  </div>
                  {currentUser.role === 'Admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowRoleDropdown(false);
                        onNavigateModule('settings');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-bold shrink-0 cursor-pointer"
                    >
                      Cấu hình
                    </button>
                  )}
                </div>
              )}

              {/* The 3 Required Action Buttons: Đăng xuất, Chuyển tài khoản, Đổi mật khẩu */}
              <div className="grid grid-cols-3 gap-2">
                {/* Button 1: Đăng xuất */}
                <button
                  onClick={() => {
                    setShowRoleDropdown(false);
                    void postgresSyncService.logout();
                    storageService.logout();
                    if (onShowToast) {
                      onShowToast('Đã đăng xuất', `Đã kết thúc phiên làm việc của ${currentUser.name}. Vui lòng đăng nhập lại.`, 'info');
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 py-3 px-1.5 rounded-xl text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50/60 hover:bg-rose-100/70 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/40 transition-all shadow-2xs group"
                  title="Đăng xuất khỏi hệ thống"
                >
                  <LogOut className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="font-bold">Đăng xuất</span>
                </button>

                {/* Button 2: Chuyển tài khoản */}
                <button
                  onClick={() => {
                    setShowRoleDropdown(false);
                    onOpenAuth('login');
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 py-3 px-1.5 rounded-xl text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50/60 hover:bg-blue-100/70 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/40 transition-all shadow-2xs group"
                  title="Chuyển đổi sang tài khoản cán bộ khác"
                >
                  <ArrowLeftRight className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="font-bold">Chuyển tài khoản</span>
                </button>

                {/* Button 3: Đổi mật khẩu */}
                <button
                  onClick={() => {
                    setShowRoleDropdown(false);
                    onOpenAuth('change-password');
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 py-3 px-1.5 rounded-xl text-[11px] font-semibold text-amber-700 hover:text-amber-800 bg-amber-50/60 hover:bg-amber-100/70 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/40 transition-all shadow-2xs group"
                  title="Đổi mật khẩu bảo vệ tài khoản"
                >
                  <KeyRound className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="font-bold">Đổi mật khẩu</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Row 2: Full-width Omnisearch Bar & Quick Contextual Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 md:px-6 py-2 border-t border-[#EDF2F7] dark:border-slate-700/60 bg-[#FAFBFD] dark:bg-[#131C2E]">
        {/* Global Omnisearch Bar with Live Results Dropdown */}
        <div className="relative flex-1 min-w-[240px] max-w-2xl" ref={searchContainerRef}>
          <div className="relative flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#718096] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={handleKeyDown}
              placeholder="Tra cứu nhanh SOP, máy móc, phòng ban, công việc..."
              className="w-full min-w-0 pl-9 pr-14 py-2 text-xs sm:text-[13px] bg-white dark:bg-slate-800/90 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 placeholder-[#718096] dark:placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2] transition-all"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenSearchModal('')}
                  className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-[#718096] dark:text-slate-300 bg-[#F4F7FB] dark:bg-slate-700/60 rounded border border-[#DFE7F0] dark:border-slate-600/60 hover:text-[#1976D2] hover:border-[#1976D2] transition-colors cursor-pointer"
                  title="Tìm kiếm nhanh toàn hệ thống (Ctrl + K)"
                >
                  <Command className="w-2.5 h-2.5" /> K
                </button>
              )}
            </div>
          </div>

          {/* Live Search Popover Dropdown */}
          {isSearchFocused && searchQuery.trim() !== '' && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150 max-h-[75vh] flex flex-col">
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" /> Kết quả khớp ({searchResults.length})
                </span>
                <span className="text-[10px] font-normal text-slate-400">Nhấn Enter để mở</span>
              </div>

              <div className="overflow-y-auto p-1.5 space-y-1 custom-scrollbar max-h-96">
                {searchResults.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 space-y-2">
                    <Search className="w-6 h-6 mx-auto opacity-50 text-slate-400" />
                    <p className="text-xs">Không tìm thấy dữ liệu khớp với "{searchQuery}"</p>
                    <button
                      onClick={() => onOpenSearchModal(searchQuery)}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      Mở tìm kiếm nâng cao toàn diện →
                    </button>
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectSearchResult(item)}
                      className="p-2.5 rounded-xl hover:bg-blue-50/70 dark:hover:bg-slate-800/80 cursor-pointer transition-colors flex items-start gap-2.5 border border-transparent hover:border-blue-100 dark:hover:border-slate-700"
                    >
                      <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5">
                        {item.category === 'documents' ? <FileText className="w-3.5 h-3.5 text-emerald-500" /> :
                         item.category === 'tasks' ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> :
                         item.category === 'equipment' ? <Wrench className="w-3.5 h-3.5 text-indigo-500" /> :
                         item.category === 'rooms' ? <Building2 className="w-3.5 h-3.5 text-teal-500" /> :
                         item.category === 'staff' ? <UserIcon className="w-3.5 h-3.5 text-purple-500" /> :
                         item.category === 'shifts' ? <Clock className="w-3.5 h-3.5 text-rose-500" /> :
                         <Users className="w-3.5 h-3.5 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded ${item.categoryColor}`}>
                            {item.categoryLabel}
                          </span>
                          {item.code && (
                            <span className="text-[10px] font-mono font-bold text-slate-500">
                              #{item.code}
                            </span>
                          )}
                        </div>
                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {item.title}
                        </h5>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.subtitle}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-2" />
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Expand Button */}
              <div className="p-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-700/80 text-center">
                <button
                  type="button"
                  onClick={() => onOpenSearchModal(searchQuery)}
                  className="w-full py-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>Mở bảng Tìm Kiếm Toàn Hệ Thống cho "{searchQuery}"</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Contextual Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {activeModule === 'tasks' && (
            <button
              type="button"
              onClick={onOpenNewTask}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tạo việc mới</span>
            </button>
          )}

          {activeModule === 'documents' && (
            <button
              type="button"
              onClick={onOpenNewDoc}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tải hồ sơ mới</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenSearchModal(searchQuery)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-[#EAF4FF] dark:hover:bg-slate-700 text-[#263445] dark:text-slate-200 hover:text-[#155A9C] border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            title="Mở bảng tra cứu nâng cao toàn hệ thống"
          >
            <Search className="w-3.5 h-3.5 text-[#1976D2] dark:text-sky-400" />
            <span>Tìm nâng cao</span>
          </button>
        </div>
      </div>
    </header>
  );
};

