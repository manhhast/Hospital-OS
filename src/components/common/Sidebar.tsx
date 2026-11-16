import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Calendar, CheckSquare, FolderOpen, MessageSquare, Settings,
  Activity, ChevronRight, Wrench, Building2, BarChart3, FileCheck, UserCheck,
  Sparkles, SlidersHorizontal, History
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { User } from '../../types/hospital';
import { CONFIG_MODULE_IDS } from '../settings/SystemConfigHubView';

interface SidebarProps {
  activeModule: string;
  onSelectModule: (module: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  collapsed,
  onToggleCollapse
}) => {
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());

  const [pendingSyncDiscrepancies, setPendingSyncDiscrepancies] = useState<number>(() => {
    return storageService.getSyncHistory().reduce(
      (sum, entry) =>
        sum +
        (entry.discrepancies || []).filter(
          (d) => !d.resolutionStatus || d.resolutionStatus === 'pending'
        ).length,
      0
    );
  });

  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setCurrentUser(storageService.getCurrentUser());
      const count = storageService.getSyncHistory().reduce(
        (sum, entry) =>
          sum +
          (entry.discrepancies || []).filter(
            (d) => !d.resolutionStatus || d.resolutionStatus === 'pending'
          ).length,
        0
      );
      setPendingSyncDiscrepancies(count);
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = currentUser?.role === 'Admin';
  const isConfigActive = CONFIG_MODULE_IDS.includes(activeModule as typeof CONFIG_MODULE_IDS[number]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard CLS', icon: LayoutDashboard, badge: null },
    { id: 'ai-ecosystem', label: 'Hệ Sinh Thái AI CLS', icon: Sparkles, badge: '4 Trụ Cột' },
    { id: 'reports', label: 'Báo Cáo & Thống Kê', icon: BarChart3, badge: 'Mới' },
    {
      id: 'sync-history',
      label: 'Lịch Sử Đồng Bộ',
      icon: History,
      badge: pendingSyncDiscrepancies > 0 ? `${pendingSyncDiscrepancies} lệch` : null
    },
    { id: 'equipment', label: 'Quản Lý Máy Móc', icon: Wrench, badge: 'Thiết bị' },
    { id: 'rooms', label: 'Quản Lý Phòng / Bộ Phận', icon: Building2, badge: 'Cơ cấu' },
    { id: 'tasks', label: 'Công Việc & Kế Hoạch', icon: CheckSquare, badge: 'Hôm nay' },
    { id: 'schedule', label: 'Lịch Làm Việc Tuần', icon: Calendar, badge: '2 Bảng' },
    { id: 'hr', label: 'Nhân Sự & Đào Tạo', icon: UserCheck, badge: 'Hồ sơ' },
    { id: 'meetings', label: 'Quản Lý Cuộc Họp', icon: FileCheck, badge: 'Giao việc' },
    { id: 'documents', label: 'Hồ Sơ & Quy Trình ISO', icon: FolderOpen, badge: '15189' },
    { id: 'discussion', label: 'Trao Đổi & Chat Khoa', icon: MessageSquare, badge: 'Teams' },
  ];

  return (
    <aside
      className={`relative flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 z-40 select-none shadow-xs ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Logo & Name */}
      <div className="flex items-center h-16 px-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xl shadow-md shadow-blue-500/20 shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="truncate">
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight flex items-center space-x-1">
                <span>CLS WorkHub</span>
              </h1>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold truncate uppercase tracking-wider">Khoa Cận Lâm Sàng</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {!collapsed && (
          <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Quản trị Khoa Cận Lâm Sàng
          </div>
        )}

        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;

          return (
            <div key={item.id} className="relative group">
              <button
                onClick={() => onSelectModule(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/70'
                }`}
                title={item.label}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-white'}`} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!collapsed && item.badge && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
                    isActive ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>

              {/* Floating Tooltip displaying full menu name */}
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg border border-slate-700 shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 flex items-center gap-2 transform translate-x-1 group-hover:translate-x-0">
                <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-1 border-4 border-transparent border-r-slate-900 dark:border-r-slate-800"></div>
                <Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 rounded text-[10px] font-bold">
                    {item.badge}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Dedicated Configuration Menu Entry (Admin Only) */}
        {isAdmin && (
          <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
            {!collapsed && (
              <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Quản trị &amp; Cấu hình
              </div>
            )}
            <div className="relative group">
              <button
                onClick={() => onSelectModule(isConfigActive ? activeModule : 'settings')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isConfigActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/70'
                }`}
                title="Menu Cấu Hình Hệ Thống"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <SlidersHorizontal className={`w-4.5 h-4.5 shrink-0 ${isConfigActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-white'}`} />
                  {!collapsed && <span className="truncate">Menu Cấu Hình</span>}
                </div>
                {!collapsed && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md tabular-nums ${
                    isConfigActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}>
                    6 mục
                  </span>
                )}
              </button>

              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg border border-slate-700 shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 flex items-center gap-2 transform translate-x-1 group-hover:translate-x-0">
                <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-1 border-4 border-transparent border-r-slate-900 dark:border-r-slate-800"></div>
                <Settings className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Menu Cấu Hình (API, Thông báo, Phân quyền, Hệ thống, Audit, GAS)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Collapse Toggle Footer */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          title={collapsed ? "Mở rộng thanh menu" : "Thu gọn thanh menu"}
        >
          <ChevronRight className={`w-5 h-5 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
          {!collapsed && <span className="ml-2 text-xs font-medium">Thu gọn menu</span>}
        </button>
      </div>
    </aside>
  );
};

