/**
 * Hospital OS - Enterprise Healthcare Application Entry
 * Built with React, Tailwind CSS, Lucide Icons, Recharts, SheetJS & jsPDF
 */

import React, { useState, useEffect, useRef } from 'react';
import { CloudOff, RefreshCw, X } from 'lucide-react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
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
import { storageService } from './services/storageService';
import { postgresSyncService, type PostgresSyncState } from './services/postgresSyncService';
import { runThreeDaySmartSync } from './services/googleSheetReportService';
import { scheduleLiveContextSync, syncLiveContextToServer } from './services/aiContextService';
import { REPORT_ARCHIVE_UPDATED_EVENT } from './services/reportArchiveService';
import { resolveEffectiveUserAccess } from './utils/rbac';
import { ToastMessage, TaskItem, DocumentItem, NotificationLog, User } from './types/hospital';

const ADMIN_ONLY_MODULES: string[] = CONFIG_MODULE_IDS;

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => storageService.isAuthenticated());
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('theme_mode') as 'light' | 'dark' | 'system';
    if (saved) return saved;
    const settings = storageService.getSettings();
    return settings.theme || 'system';
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

  // Auth Modal State
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'change-password' | 'forgot-password'>('login');

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
    });
    const handleReportArchiveUpdated = () => {
      scheduleLiveContextSync(900);
    };
    window.addEventListener(REPORT_ARCHIVE_UPDATED_EVENT, handleReportArchiveUpdated);
    return () => {
      unsubscribe();
      unsubPg();
      window.removeEventListener(REPORT_ARCHIVE_UPDATED_EVENT, handleReportArchiveUpdated);
      postgresSyncService.destroy();
    };
  }, []);

  // Re-sync live hospital context when authenticated state becomes active & keep Telegram bridge alive across server restarts
  useEffect(() => {
    if (isAuthenticated) {
      scheduleLiveContextSync(400);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const verifyAndResyncBridge = async () => {
      const settings = storageService.getSettings();
      const hasToken = (settings.telegramBotToken || '').trim().length > 10;
      const qaEnabled = settings.telegramQaEnabled !== false;
      try {
        const res = await fetch('/api/telegram/status');
        if (!res.ok) return;
        const json = await res.json();
        const st = json?.data;
        if (!st) return;
        const needsContext = !st.hasLiveContext;
        const blockedByGuard = Boolean(
          st.conflictDetected || st.pausedByUser || st.standbyMode || st.webhookUrl
        );
        const needsBot = hasToken && qaEnabled && (!st.configured || (!st.pollingActive && !blockedByGuard));
        if (needsContext || needsBot) {
          await syncLiveContextToServer(true);
        }
      } catch {
        // ignore transient offline checks
      }
    };

    const handleFocus = () => {
      void verifyAndResyncBridge();
    };
    window.addEventListener('focus', handleFocus);
    const intervalId = window.setInterval(() => {
      void verifyAndResyncBridge();
    }, 35000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(intervalId);
    };
  }, []);

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

      if (outcome.alertDiscrepancies.length > 0) {
        showToast(
          'Cảnh báo sai lệch 3 ngày gần nhất',
          `Phát hiện ${outcome.alertDiscrepancies.length} mục sai lệch giữa Hệ thống và Google Sheet (đã giữ nguyên dữ liệu & lưu vào Lịch sử đồng bộ).`,
          'warning'
        );
      } else if (outcome.autoWrittenCount > 0) {
        showToast(
          'Đồng bộ tự động 3 ngày gần nhất',
          `Đã rà soát và tự động ghi mới ${outcome.autoWrittenCount} ô từ Google Sheet vào Hệ thống.`,
          'success'
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

  // Global Keyboard Shortcut: Ctrl + K or Cmd + K to open search modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  // Full-screen Login Portal when user logs out
  if (!isAuthenticated) {
    return (
      <div className={isDarkMode ? 'dark' : ''}>
        <LoginScreen
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setIsAuthenticated(true);
            showToast('Đăng nhập thành công', `Chào mừng ${user.name} đã đăng nhập hệ thống!`, 'success');
          }}
          onShowToast={showToast}
          isDarkMode={isDarkMode}
          onToggleTheme={() => {
            const nextMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
            handleThemeModeChange(nextMode);
          }}
        />
        {/* Floating Toast Message System on Login Screen */}
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors">
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
            const nextMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
            handleThemeModeChange(nextMode);
          }}
          onChangeThemeMode={handleThemeModeChange}
          themeMode={themeMode}
          isDarkMode={isDarkMode}
          activeModule={activeModule}
          onOpenAuth={(mode) => {
            setAuthMode(mode);
            setIsAuthOpen(true);
          }}
          onShowToast={showToast}
        />

        {pgState.configured && pgState.status === 'error' && !isCloudBannerDismissed && (
          <div className="px-4 md:px-6 py-2 border-b text-xs flex flex-wrap items-center justify-between gap-2 bg-rose-50 dark:bg-rose-950/35 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <CloudOff className="w-4 h-4 shrink-0" />
              <span className="truncate">
                <strong>Lỗi đồng bộ PostgreSQL:</strong> {pgState.errorMessage || 'Không thể kết nối tới cơ sở dữ liệu máy chủ.'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void postgresSyncService.refreshServerStatus()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Thử lại</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCloudBannerDismissed(true)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                title="Ẩn thông báo này"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
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
            <MeetingManagementView />
          )}

          {activeModule === 'schedule' && (
            <ScheduleView />
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

      {/* Global Spotlight Search Modal */}
      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        onNavigate={handleNavigateWithSearch}
        initialQuery={globalSearchQuery}
      />
    </div>
  );
}
