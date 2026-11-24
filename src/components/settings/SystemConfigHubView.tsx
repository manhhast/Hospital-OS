import React from 'react';
import {
  Settings,
  Users,
  Bell,
  Network,
  History,
  Code2,
  SlidersHorizontal,
  Bot
} from 'lucide-react';
import { NotificationLog } from '../../types/hospital';
import { storageService } from '../../services/storageService';
import { resolveEffectiveUserAccess } from '../../utils/rbac';
import { IntegrationHubView } from '../integration/IntegrationHubView';
import { NotificationCenterView } from '../notifications/NotificationCenterView';
import { UserManagementView } from '../users/UserManagementView';
import { SettingsView } from './SettingsView';
import { TelegramSettingsView } from './TelegramSettingsView';
import { AuditLogView } from '../audit/AuditLogView';
import { GASArchitectureView } from '../gas/GASArchitectureView';

export type ConfigModuleId =
  | 'settings'
  | 'telegram'
  | 'users'
  | 'notifications'
  | 'integration'
  | 'audit'
  | 'gas-architecture';

export const CONFIG_MODULE_IDS: ConfigModuleId[] = [
  'integration',
  'notifications',
  'users',
  'settings',
  'telegram',
  'audit',
  'gas-architecture'
];

interface ConfigMenuItem {
  id: ConfigModuleId;
  label: string;
  description: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CONFIG_MENU_ITEMS: ConfigMenuItem[] = [
  {
    id: 'settings',
    label: 'Cấu Hình Hệ Thống',
    description: 'Thông số chung, Google Drive & giao diện',
    icon: Settings
  },
  {
    id: 'telegram',
    label: 'Cài Đặt Telegram Bot',
    description: 'Bot Token, Chat ID & hướng dẫn tạo Bot riêng',
    badge: 'Bot AI',
    icon: Bot
  },
  {
    id: 'users',
    label: 'Phân Quyền Hệ Thống',
    description: 'Tài khoản, vai trò & cấp lại mật khẩu',
    icon: Users
  },
  {
    id: 'notifications',
    label: 'Thông Báo Nội Bộ',
    description: 'Cảnh báo hạn thiết bị, nhắc việc & lịch sử gửi',
    icon: Bell
  },
  {
    id: 'integration',
    label: 'Cổng API HIS/LIS/PACS',
    description: 'Gateway kết nối & kiểm thử gói tin chuẩn HL7/JSON',
    badge: 'Gateway',
    icon: Network
  },
  {
    id: 'audit',
    label: 'Lịch Sử Audit Log',
    description: 'Nhật ký truy vết thao tác & đối chiếu dữ liệu',
    icon: History
  },
  {
    id: 'gas-architecture',
    label: 'Kiến Trúc GAS Code',
    description: 'Mã nguồn Google Apps Script & cấu trúc triển khai',
    badge: 'SOLID',
    icon: Code2
  }
];

interface SystemConfigHubViewProps {
  activeTab: ConfigModuleId;
  onSelectTab: (tab: ConfigModuleId) => void;
  notifications: NotificationLog[];
  onNotificationsUpdated: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onConfirmAction: (title: string, message: string, onConfirm: () => void, isDanger?: boolean) => void;
  themeMode: 'light' | 'dark' | 'system';
  onChangeThemeMode: (mode: 'light' | 'dark' | 'system') => void;
}

export const SystemConfigHubView: React.FC<SystemConfigHubViewProps> = ({
  activeTab,
  onSelectTab,
  notifications,
  onNotificationsUpdated,
  onShowToast,
  onConfirmAction,
  themeMode,
  onChangeThemeMode
}) => {
  const currentUser = storageService.getCurrentUser();
  const actorAccess = resolveEffectiveUserAccess(
    currentUser,
    storageService.getStaffProfiles(),
    storageService.getDepartments(),
    storageService.getRooms()
  );
  const visibleMenuItems = actorAccess.isSystemAdmin
    ? CONFIG_MENU_ITEMS
    : CONFIG_MENU_ITEMS.filter(item => item.id === 'users' && actorAccess.permissions.canConfigureRBAC);
  const currentMeta = visibleMenuItems.find((item) => item.id === activeTab) || visibleMenuItems[0] || CONFIG_MENU_ITEMS[0];

  return (
    <div className="space-y-4 w-full pb-8">
      {/* Dedicated System Configuration Menu */}
      <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pb-3 border-b border-[#DFE7F0] dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#EAF4FF] dark:bg-blue-950/60 border border-[#1976D2]/25 dark:border-blue-800/60 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-[#1976D2] dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#263445] dark:text-slate-100 truncate">
                Menu Cấu Hình &amp; Quản Trị Hệ Thống
              </h2>
              <p className="text-xs text-[#718096] dark:text-slate-400 truncate">
                {currentMeta.label} &middot; {currentMeta.description}
              </p>
            </div>
          </div>
          <div className="text-xs font-medium text-[#718096] dark:text-slate-400 tabular-nums shrink-0">
            {actorAccess.shortTierLabel} &middot; {visibleMenuItems.length} phân hệ cấu hình
          </div>
        </div>

        {/* Configuration Navigation Tabs */}
        <nav
          aria-label="Menu cấu hình hệ thống"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3"
        >
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs font-semibold border transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1976D2] text-white border-[#1976D2] shadow-xs'
                    : 'bg-[#F4F7FB] dark:bg-slate-800/50 text-[#263445] dark:text-slate-300 border-[#DFE7F0] dark:border-slate-700/80 hover:bg-[#EAF4FF] dark:hover:bg-slate-800 hover:text-[#155A9C] dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-[#718096] dark:text-slate-400'
                    }`}
                  />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                </span>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#EAF4FF] text-[#155A9C] dark:bg-blue-950/60 dark:text-blue-300 border border-[#1976D2]/20 dark:border-blue-900/40'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </section>

      {/* Active Configuration Sub-Module Content */}
      <div>
        {activeTab === 'integration' && <IntegrationHubView onShowToast={onShowToast} />}

        {activeTab === 'notifications' && (
          <NotificationCenterView
            notifications={notifications}
            onNotificationsUpdated={onNotificationsUpdated}
            onShowToast={onShowToast}
          />
        )}

        {activeTab === 'users' && <UserManagementView onShowToast={onShowToast} />}

        {activeTab === 'settings' && (
          <SettingsView
            onShowToast={onShowToast}
            onConfirmAction={onConfirmAction}
            themeMode={themeMode}
            onChangeThemeMode={onChangeThemeMode}
            onNavigateConfigTab={onSelectTab}
          />
        )}

        {activeTab === 'telegram' && <TelegramSettingsView onShowToast={onShowToast} />}

        {activeTab === 'audit' && <AuditLogView />}

        {activeTab === 'gas-architecture' && <GASArchitectureView onShowToast={onShowToast} />}
      </div>
    </div>
  );
};
