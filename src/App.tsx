/**
 * Hospital OS - Enterprise Healthcare Application Entry
 * Built with React, Tailwind CSS, Lucide Icons, Recharts, SheetJS & jsPDF
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { ToastContainer } from './components/common/ToastContainer';
import { ConfirmModal } from './components/common/ConfirmModal';
import { GlobalSearchModal } from './components/common/GlobalSearchModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { TaskManagementView } from './components/tasks/TaskManagementView';
import { DocumentManagementView } from './components/documents/DocumentManagementView';
import { NotificationCenterView } from './components/notifications/NotificationCenterView';
import { SettingsView } from './components/settings/SettingsView';
import { UserManagementView } from './components/users/UserManagementView';
import { AuditLogView } from './components/audit/AuditLogView';
import { GASArchitectureView } from './components/gas/GASArchitectureView';
import { ScheduleView } from './components/schedule/ScheduleView';
import { DiscussionView } from './components/discussion/DiscussionView';
import { EquipmentManagementView } from './components/equipment/EquipmentManagementView';
import { RoomManagementView } from './components/rooms/RoomManagementView';
import { StaffManagementView } from './components/hr/StaffManagementView';
import { MeetingManagementView } from './components/meetings/MeetingManagementView';
import { ReportsAnalyticsView } from './components/reports/ReportsAnalyticsView';
import { IntegrationHubView } from './components/integration/IntegrationHubView';
import { AIEcosystemView } from './components/ai/AIEcosystemView';
import { AuthModal } from './components/auth/AuthModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { storageService } from './services/storageService';
import { ToastMessage, TaskItem, DocumentItem, NotificationLog, User } from './types/hospital';

const ADMIN_ONLY_MODULES = ['integration', 'notifications', 'users', 'settings', 'audit', 'gas-architecture'];

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

  // Data States
  const [tasks, setTasks] = useState<TaskItem[]>(storageService.getTasks());
  const [documents, setDocuments] = useState<DocumentItem[]>(storageService.getDocuments());
  const [notifications, setNotifications] = useState<NotificationLog[]>(storageService.getNotifications());

  // Storage listener sync
  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setTasks(storageService.getTasks());
      setDocuments(storageService.getDocuments());
      setNotifications(storageService.getNotifications());
      setCurrentUser(storageService.getCurrentUser());
      setIsAuthenticated(storageService.isAuthenticated());
    });
    return () => unsubscribe();
  }, []);

  // Admin access guard: If non-admin attempts to view admin-only modules, redirect to dashboard
  useEffect(() => {
    if (currentUser?.role !== 'Admin' && ADMIN_ONLY_MODULES.includes(activeModule)) {
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
    if (currentUser?.role !== 'Admin' && ADMIN_ONLY_MODULES.includes(module)) {
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

        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
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
            <ReportsAnalyticsView />
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

          {activeModule === 'integration' && (
            <IntegrationHubView />
          )}

          {activeModule === 'schedule' && (
            <ScheduleView />
          )}

          {activeModule === 'discussion' && (
            <DiscussionView />
          )}

          {activeModule === 'notifications' && (
            <NotificationCenterView
              notifications={notifications}
              onNotificationsUpdated={() => setNotifications(storageService.getNotifications())}
              onShowToast={showToast}
            />
          )}

          {activeModule === 'settings' && (
            <SettingsView
              onShowToast={showToast}
              onConfirmAction={triggerConfirm}
              themeMode={themeMode}
              onChangeThemeMode={handleThemeModeChange}
            />
          )}

          {activeModule === 'users' && (
            <UserManagementView
              onShowToast={showToast}
            />
          )}

          {activeModule === 'audit' && (
            <AuditLogView />
          )}

          {activeModule === 'gas-architecture' && (
            <GASArchitectureView
              onShowToast={showToast}
            />
          )}
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
