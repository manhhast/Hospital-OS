/**
 * Hospital OS - Enterprise Healthcare Application Entry
 * Built with React, Tailwind CSS, Lucide Icons, Recharts, SheetJS & jsPDF
 */

import React, { useState, useEffect, useRef } from 'react';
import { CloudOff, RefreshCw, WifiOff, X } from 'lucide-react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { BreadcrumbBar } from './components/common/BreadcrumbBar';
import { ToastContainer } from './components/common/ToastContainer';
import { ConfirmModal } from './components/common/ConfirmModal';
import { GlobalSearchModal } from './components/common/GlobalSearchModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { TaskManagementView } from './components/tasks/TaskManagementView';
import { DocumentManagementView } from './components/documents/DocumentManagementView';
import { SystemConfigHubView, CONFIG_MODULE_IDS, ConfigModuleId } from './components/settings/SystemConfigHubView';
import { ScheduleView } from './components/schedule/ScheduleView';
import { DiscussionView } from './components/discussion/DiscussionView';
import { EquipmentManagementView } from './components/equipment/EquipmentManagementView';
import { RoomManagementView } from './components/rooms/RoomManagementView';
import { StaffManagementView } from './components/hr/StaffManagementView';
import { MeetingManagementView } from './components/meetings/MeetingManagementView';
import { ReportsAnalyticsView } from './components/reports/ReportsAnalyticsView';
import { SyncHistoryView } from './components/reports/SyncHistoryView';
import { AIEcosystemView } from './components/ai/AIEcosystemView';
import { AuthModal } from './components/auth/AuthModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { QuickLockScreen } from './components/auth/QuickLockScreen';
import { storageService } from './services/storageService';
import { postgresSyncService, type PostgresSyncState } from './services/postgresSyncService';
import { runThreeDaySmartSync } from './services/googleSheetReportService';
import { scheduleLiveContextSync, syncLiveContextToServer } from './services/aiContextService';
import { REPORT_ARCHIVE_UPDATED_EVENT } from './services/reportArchiveService';
import { resolveEffectiveUserAccess } from './utils/rbac';
import { ToastMessage, TaskItem, DocumentItem, NotificationLog, User } from './types/hospital';
import hospitalTopBanner from './assets/images/hospital_top_banner_1795186653657.jpg';

const ADMIN_ONLY_MODULES: string[] = CONFIG_MODULE_IDS;

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => storageService.isAuthenticated());
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('theme_mode') as 'light' | 'dark' | 'system';
    if (saved) return saved;
    const settings = storageService.getSettings();
    return settings.theme === 'dark' ? 'dark' : 'light';
  });

  const [isSystemDark, setIsSystemDark] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Global Search Modal State
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState<boolean>(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');

  // Compute actual dark mode boolean
  const isDarkMode = themeMode === 'dark' ? true : themeMode === 'light' ? false : isSystemDark;

  // Listen to OS system dark mode changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Update DOM class and save preference when theme changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleThemeModeChange = (newMode: 'light' | 'dark' | 'system') => {
    setThemeMode(newMode);
    localStorage.setItem('theme_mode', newMode);
    const currentSettings = storageService.getSettings();
    storageService.saveSettings({ ...currentSettings, theme: newMode });
    
    const modeLabels = {
      light: 'Giao diện Sáng',
      dark: 'Giao diện Tối',
      system: 'Giao diện Theo hệ thống'
    };
    showToast('Chủ đề giao diện', `Đã chuyển sang ${modeLabels[newMode]}`, 'info');
  };

  // Auth Modal & Quick Lock State
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'change-password' | 'forgot-password'>('login');
  const [isScreenLocked, setIsScreenLocked] = useState<boolean>(false);
  const [lockedAtLabel, setLockedAtLabel] = useState<string>('');

  // Global Toast Messages
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Modal Triggers
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isUploadDocOpen, setIsUploadDocOpen] = useState(false);
  const [pendingAuditRequest, setPendingAuditRequest] = useState<{
    startDate?: string;
    endDate?: string;
    year?: number;
    nonce: number;
  } | null>(null);
  const startupThreeDayDoneRef = useRef<boolean>(false);

  // Data States
  const [tasks, setTasks] = useState<TaskItem[]>(storageService.getTasks());
  const [documents, setDocuments] = useState<DocumentItem[]>(storageService.getDocuments());
  const [notifications, setNotifications] = useState<NotificationLog[]>(storageService.getNotifications());
  const [pgState, setPgState] = useState<PostgresSyncState>(() => postgresSyncService.getState());
  const [isCloudBannerDismissed, setIsCloudBannerDismissed] = useState(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [topBannerFailed, setTopBannerFailed] = useState(false);
  const lastConflictIdRef = useRef<number>(0);

  // Storage & PostgreSQL server sync lifecycle
  useEffect(() => {
    void postgresSyncService.init();
    scheduleLiveContextSync(600);
    const unsubscribe = storageService.subscribe(() => {
      setTasks(storageService.getTasks());
      setDocuments(storageService.getDocuments());
      setNotifications(storageService.getNotifications());
      setCurrentUser(storageService.getCurrentUser());
      setIsAuthenticated(storageService.isAuthenticated());
      if (storageService.getIsApplyingRemote()) {
        const remoteTheme = storageService.getSettings().theme;
        if (remoteTheme === 'light' || remoteTheme === 'dark' || remoteTheme === 'system') {
          setThemeMode(remoteTheme);
          localStorage.setItem('theme_mode', remoteTheme);
        }
      }
      scheduleLiveContextSync(1200);
    });
    const unsubPg = postgresSyncService.subscribe(() => {
      const next = postgresSyncService.getState();
      setPgState(next);
      if (next.status === 'error') {
        setIsCloudBannerDismissed(false);
      }
      if (next.lastConflictNotice && next.lastConflictNotice.id !== lastConflictIdRef.current) {
        lastConflictIdRef.current = next.lastConflictNotice.id;
        showToast('Xung đột đồng bộ dữ liệu', next.lastConflictNotice.message, 'warning');
        postgresSyncService.dismissConflictNotice();
      }
    });
    const handleReportArchiveUpdated = () => {
      scheduleLiveContextSync(900);
    };
    const handleOnline = () => {
      setIsBrowserOnline(true);
      void postgresSyncService.flushPendingSync();
    };
    const handleOffline = () => {
      setIsBrowserOnline(false);
    };
    window.addEventListener(REPORT_ARCHIVE_UPDATED_EVENT, handleReportArchiveUpdated);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      unsubscribe();
      unsubPg();
      window.removeEventListener(REPORT_ARCHIVE_UPDATED_EVENT, handleReportArchiveUpdated);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      postgresSyncService.destroy();
    };
  }, []);

  // Clear lock state if session logs out / expires
  useEffect(() => {
    if (!isAuthenticated) {
      setIsScreenLocked(false);
      setLockedAtLabel('');
    } else {
      scheduleLiveContextSync(400);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let lastHeartbeatAtMs = 0;

    const verifyAndResyncBridge = async () => {
      if (!storageService.isAuthenticated() || !postgresSyncService.isAuthenticatedSession()) return;
      const settings = storageService.getSettings();
      const hasToken =
        (settings.telegramBotToken || '').trim().length > 10 ||
        Boolean(settings.hasTelegramBotToken);
      const qaEnabled = settings.telegramQaEnabled !== false;
      try {
        const res = await fetch('/api/telegram/status', {
          headers: postgresSyncService.getAuthHeaders(),
          credentials: 'include'
        });
        if (!res.ok) return;
        const json = await res.json();
        const st = json?.data;
        if (!st) return;
        const needsContext = !st.hasLiveContext;
        const blockedByGuard = Boolean(
          st.conflictDetected ||
            st.pausedByUser ||
            st.standbyMode ||
            st.webhookUrl ||
            st.startingPolling ||
            st.reconnecting
        );
        const needsBot = hasToken && qaEnabled && (!st.configured || (!st.pollingActive && !blockedByGuard));
        if (needsContext || needsBot) {
          await syncLiveContextToServer(true);
        }

        const nowMs = Date.now();
        if (nowMs - lastHeartbeatAtMs >= 50000) {
          lastHeartbeatAtMs = nowMs;
          await fetch('/api/alerts/heartbeat', {
            method: 'POST',
            headers: postgresSyncService.getAuthHeaders(),
            credentials: 'include'
          }).catch(() => {});
        }
      } catch {
        // ignore transient offline checks
      }
    };

    const startupTimer = window.setTimeout(() => {
      void verifyAndResyncBridge();
    }, 2000);

    const handleFocus = () => {
      void verifyAndResyncBridge();
    };
    window.addEventListener('focus', handleFocus);
    const intervalId = window.setInterval(() => {
      void verifyAndResyncBridge();
    }, 35000);

    return () => {
      window.clearTimeout(startupTimer);
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  // Automatic 3-day smart sync on app startup (after initial PostgreSQL hydration settles if configured)
  useEffect(() => {
    if (!isAuthenticated || startupThreeDayDoneRef.current) return;

    let cancelled = false;
    let fallbackTimer: number | undefined;

    const executeStartupThreeDaySync = async () => {
      if (cancelled || startupThreeDayDoneRef.current) return;
      startupThreeDayDoneRef.current = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);

      const outcome = await runThreeDaySmartSync('startup_3d_auto');
      if (cancelled || !outcome.ran) return;

      if (outcome.updatedFromSheetCount > 0 || outcome.autoWrittenCount > 0) {
        const parts: string[] = [];
        if (outcome.updatedFromSheetCount > 0) {
          parts.push(`ghi đè ${outcome.updatedFromSheetCount} mục dịch vụ khớp Google Sheet (đã lưu lịch sử dữ liệu gốc & thay thế)`);
        }
        if (outcome.autoWrittenCount > 0) {
          parts.push(`ghi mới ${outcome.autoWrittenCount} ô trống`);
        }
        showToast(
          'Đồng bộ tự động 3 ngày gần nhất',
          `Đã rà soát và ${parts.join(', ')}.`,
          'success'
        );
      } else if (outcome.alertDiscrepancies.length > 0) {
        showToast(
          'Cảnh báo sai lệch 3 ngày gần nhất',
          `Phát hiện ${outcome.alertDiscrepancies.length} mục sai lệch giữa Hệ thống và Google Sheet.`,
          'warning'
        );
      }
    };

    const currentPg = postgresSyncService.getState();
    if (currentPg.status !== 'checking' && currentPg.status !== 'syncing') {
      const quickTimer = window.setTimeout(() => {
        void executeStartupThreeDaySync();
      }, 900);
      return () => {
        cancelled = true;
        window.clearTimeout(quickTimer);
      };
    }

    const unsubPg = postgresSyncService.subscribe(() => {
      const nextPg = postgresSyncService.getState();
      if (nextPg.status !== 'checking' && nextPg.status !== 'syncing') {
        unsubPg();
        void executeStartupThreeDaySync();
      }
    });

    fallbackTimer = window.setTimeout(() => {
      unsubPg();
      void executeStartupThreeDaySync();
    }, 5500);

    return () => {
      cancelled = true;
      unsubPg();
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [isAuthenticated]);

  // Admin / delegated RBAC access guard
  const canOpenAdminModule = (mod: string) => {
    if (!ADMIN_ONLY_MODULES.includes(mod)) return true;
    const access = resolveEffectiveUserAccess(
      currentUser,
      storageService.getStaffProfiles(),
      storageService.getDepartments(),
      storageService.getRooms()
    );
    if (access.isSystemAdmin) return true;
    return mod === 'users' && access.permissions.canConfigureRBAC;
  };

  useEffect(() => {
    if (!canOpenAdminModule(activeModule)) {
      setActiveModule('dashboard');
    }
  }, [activeModule, currentUser]);

  const handleQuickLock = () => {
    if (!isAuthenticated || isScreenLocked) return;
    void postgresSyncService.flushPendingSync();
    setLockedAtLabel(
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    );
    setIsAuthOpen(false);
    setIsGlobalSearchOpen(false);
    setIsScreenLocked(true);
    showToast('Đã khóa nhanh màn hình', 'Nhập mật khẩu của bạn để mở khóa lại.', 'info');
  };

  // Global Keyboard Shortcuts: Ctrl+K (Search), Alt+L or Ctrl/Cmd+Shift+L (Quick Lock)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isAuthenticated || isScreenLocked) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(prev => !prev);
        return;
      }
      if (
        (e.altKey && e.key.toLowerCase() === 'l') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l')
      ) {
        e.preventDefault();
        handleQuickLock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, isScreenLocked]);

  // Dark mode effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Navigate from Search
  const handleNavigateWithSearch = (module: string, targetId?: string, extraData?: any) => {
    if (!canOpenAdminModule(module)) {
      showToast('Phân quyền hạn chế', 'Chức năng này chỉ dành riêng cho tài khoản Quản trị viên (Admin).', 'warning');
      return;
    }
    setActiveModule(module);
    showToast('Điều hướng thành công', `Đã chuyển đến phân hệ ${module.toUpperCase()}${targetId ? ` (Mã: #${targetId})` : ''}`, 'info');
  };

  // Toast Helper with guaranteed unique IDs
  const toastCounterRef = useRef<number>(0);
  const showToast = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    toastCounterRef.current += 1;
    const uniqueId = `toast-${Date.now()}-${toastCounterRef.current}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastMessage = {
      id: uniqueId,
      type,
      title,
      message
    };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== uniqueId));
    }, 4000);
  };

  const handleDismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Confirm Modal Helper
  const triggerConfirm = (title: string, message: string, onConfirm: () => void, isDanger = false) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      isDanger
    });
  };

  // Full-screen Login Portal when user starts app or logs out
  if (!isAuthenticated) {
    return (
      <div className={isDarkMode ? 'dark' : ''}>
        <LoginScreen
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setIsAuthenticated(true);
            setIsScreenLocked(false);
            showToast('Đăng nhập thành công', `Chào mừng ${user.name} đã đăng nhập hệ thống!`, 'success');
          }}
          onShowToast={showToast}
          isDarkMode={isDarkMode}
          onToggleTheme={() => {
            handleThemeModeChange(isDarkMode ? 'light' : 'dark');
          }}
        />
        {/* Floating Toast Message System on Login Screen */}
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
      </div>
    );
  }

  // Full-screen Quick Lock Portal (unmounts sensitive clinical workspace while keeping activeModule)
  if (isScreenLocked) {
    return (
      <div className={isDarkMode ? 'dark' : ''}>
        <QuickLockScreen
          user={currentUser}
          lockedAt={lockedAtLabel}
          isDarkMode={isDarkMode}
          onToggleTheme={() => {
            handleThemeModeChange(isDarkMode ? 'light' : 'dark');
          }}
          onUnlockSuccess={(user) => {
            setCurrentUser(user);
            setIsScreenLocked(false);
          }}
          onSwitchAccount={() => {
            setIsScreenLocked(false);
            setLockedAtLabel('');
            void postgresSyncService.logout();
            storageService.logout();
            showToast('Đã đăng xuất', 'Vui lòng chọn tài khoản khác để đăng nhập.', 'info');
          }}
          onShowToast={showToast}
        />
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F4F7FB] dark:bg-[#0F172A] text-[#263445] dark:text-slate-100 font-sans overflow-hidden transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <Header
          onSearchChange={(q) => console.log("Search query:", q)}
          onOpenSearchModal={(query) => {
            setGlobalSearchQuery(query || '');
            setIsGlobalSearchOpen(true);
          }}
          onNavigateModule={handleNavigateWithSearch}
          onOpenNewTask={() => {
            setActiveModule('tasks');
            setIsCreateTaskOpen(true);
          }}
          onOpenNewDoc={() => {
            setActiveModule('documents');
            setIsUploadDocOpen(true);
          }}
          onToggleTheme={() => {
            handleThemeModeChange(isDarkMode ? 'light' : 'dark');
          }}
          onChangeThemeMode={handleThemeModeChange}
          themeMode={themeMode}
          isDarkMode={isDarkMode}
          activeModule={activeModule}
          onOpenAuth={(mode) => {
            setAuthMode(mode);
            setIsAuthOpen(true);
          }}
          onQuickLock={handleQuickLock}
          onShowToast={showToast}
        />

        {/* HIS Hierarchical Breadcrumb Bar */}
        <BreadcrumbBar
          activeModule={activeModule}
          onNavigateModule={setActiveModule}
          defaultConfigModule={canOpenAdminModule('settings') ? 'settings' : 'users'}
        />

        {(!isBrowserOnline || (pgState.configured && pgState.status === 'error' && !isCloudBannerDismissed)) && (
          <div className="px-4 md:px-5 py-1.5 border-b text-xs flex flex-wrap items-center justify-between gap-2 bg-rose-50 dark:bg-rose-950/35 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {!isBrowserOnline ? <WifiOff className="w-4 h-4 shrink-0" /> : <CloudOff className="w-4 h-4 shrink-0" />}
              <span className="truncate">
                {!isBrowserOnline ? (
                  <>
                    <strong>Mất kết nối mạng:</strong> Các thay đổi đang được lưu tạm cục bộ
                    {pgState.pendingChangesCount > 0 ? ` (${pgState.pendingChangesCount} mục chờ đồng bộ)` : ''} và sẽ tự động gửi khi có mạng trở lại.
                  </>
                ) : (
                  <>
                    <strong>Lỗi đồng bộ PostgreSQL:</strong> {pgState.errorMessage || 'Không thể kết nối tới cơ sở dữ liệu máy chủ.'}
                    {pgState.pendingChangesCount > 0 ? ` (${pgState.pendingChangesCount} thay đổi đang chờ gửi lại)` : ''}
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isBrowserOnline && (
                <button
                  type="button"
                  onClick={() => void postgresSyncService.flushPendingSync().then(() => postgresSyncService.refreshServerStatus())}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Thử lại</span>
                </button>
              )}
              {isBrowserOnline && (
                <button
                  type="button"
                  onClick={() => setIsCloudBannerDismissed(true)}
                  className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                  title="Ẩn thông báo này"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-3.5 md:p-4 custom-scrollbar">
          {/* Top Enterprise Hospital Banner */}
          <div className="relative h-24 sm:h-28 rounded-xl overflow-hidden border border-[#DFE7F0] dark:border-slate-700/80 mb-4 bg-gradient-to-r from-[#0B2A4A] via-[#155A9C] to-[#1976D2] shadow-2xs">
            {!topBannerFailed && (
              <img
                src={hospitalTopBanner}
                alt="Bệnh viện Đa khoa Sông Thương · Khoa Cận Lâm Sàng"
                referrerPolicy="no-referrer"
                onError={() => setTopBannerFailed(true)}
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B2A4A]/92 via-[#155A9C]/80 to-[#0F355B]/45 dark:from-[#09101E]/95 dark:via-[#0F2442]/85 dark:to-[#09101E]/60" />
            <div className="relative z-10 h-full px-4 sm:px-6 flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-200 truncate">
                  Bệnh viện Đa khoa Sông Thương · Khoa Cận Lâm Sàng
                </p>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                  Hệ thống Quản trị &amp; Điều hành Cận Lâm Sàng (HIS)
                </h2>
                <p className="text-xs text-sky-100/95 hidden sm:block truncate">
                  Chuẩn hóa quy trình ISO 15189:2022 · Quản lý thiết bị, nhân sự, lịch trực &amp; đồng bộ số liệu trực tuyến
                </p>
              </div>
              <div className="hidden md:flex flex-col items-end text-right shrink-0 text-white">
                <span className="text-xs font-bold tabular-nums">
                  {new Date().toLocaleDateString('vi-VN', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    timeZone: 'Asia/Ho_Chi_Minh'
                  })}
                </span>
                <span className="text-[11px] text-sky-200 truncate max-w-[220px]">
                  Cán bộ: {currentUser.name}
                </span>
              </div>
            </div>
          </div>

          <ErrorBoundary fallbackTitle="Không thể hiển thị phân hệ này">
          {activeModule === 'dashboard' && (
            <DashboardView
              tasks={tasks}
              documents={documents}
              onNavigateModule={setActiveModule}
              onOpenNewTask={() => {
                setActiveModule('tasks');
                setIsCreateTaskOpen(true);
              }}
              onOpenNewDoc={() => {
                setActiveModule('documents');
                setIsUploadDocOpen(true);
              }}
              onShowToast={showToast}
            />
          )}

          {activeModule === 'ai-ecosystem' && (
            <AIEcosystemView
              onShowToast={showToast}
              onNavigateModule={setActiveModule}
            />
          )}

          {activeModule === 'tasks' && (
            <TaskManagementView
              tasks={tasks}
              onTasksUpdated={() => setTasks(storageService.getTasks())}
              onShowToast={showToast}
              onConfirmAction={triggerConfirm}
              isCreateOpen={isCreateTaskOpen}
              onCloseCreateModal={() => setIsCreateTaskOpen(false)}
            />
          )}

          {activeModule === 'documents' && (
            <DocumentManagementView
              documents={documents}
              onDocumentsUpdated={() => setDocuments(storageService.getDocuments())}
              onShowToast={showToast}
              onConfirmAction={triggerConfirm}
              isUploadOpen={isUploadDocOpen}
              onCloseUploadModal={() => setIsUploadDocOpen(false)}
            />
          )}

          {activeModule === 'reports' && (
            <ReportsAnalyticsView
              pendingAuditRequest={pendingAuditRequest}
              onClearPendingAuditRequest={() => setPendingAuditRequest(null)}
              onShowToast={showToast}
            />
          )}

          {activeModule === 'sync-history' && (
            <SyncHistoryView
              onShowToast={showToast}
              onOpenRangeAudit={(startDate, endDate, year) => {
                setPendingAuditRequest({
                  startDate,
                  endDate,
                  year,
                  nonce: Date.now()
                });
                setActiveModule('reports');
              }}
            />
          )}

          {activeModule === 'equipment' && (
            <EquipmentManagementView />
          )}

          {activeModule === 'rooms' && (
            <RoomManagementView />
          )}

          {activeModule === 'hr' && (
            <StaffManagementView />
          )}

          {activeModule === 'meetings' && (
            <MeetingManagementView onShowToast={showToast} />
          )}

          {activeModule === 'schedule' && (
            <ScheduleView onShowToast={showToast} onConfirmAction={triggerConfirm} />
          )}

          {activeModule === 'discussion' && (
            <DiscussionView />
          )}

          {CONFIG_MODULE_IDS.includes(activeModule as ConfigModuleId) && (
            <SystemConfigHubView
              activeTab={activeModule as ConfigModuleId}
              onSelectTab={(tab) => setActiveModule(tab)}
              notifications={notifications}
              onNotificationsUpdated={() => setNotifications(storageService.getNotifications())}
              onShowToast={showToast}
              onConfirmAction={triggerConfirm}
              themeMode={themeMode}
              onChangeThemeMode={handleThemeModeChange}
            />
          )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Floating Toast Message System */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isDanger={confirmModal.isDanger}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Auth Modal (Login / Change Password / Forgot Password) */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
        onShowToast={showToast}
      />

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        onNavigate={handleNavigateWithSearch}
        initialQuery={globalSearchQuery}
      />
    </div>
  );
}
