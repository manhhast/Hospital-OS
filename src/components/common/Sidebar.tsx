import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Calendar, CheckSquare, FolderOpen, MessageSquare, Bell, Settings, Users, 
  History, Code2, Activity, ChevronRight, Wrench, Building2, BarChart3, Network, FileCheck, UserCheck,
  Sparkles
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { User } from '../../types/hospital';

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

  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setCurrentUser(storageService.getCurrentUser());
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = currentUser?.role === 'Admin';

  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard CLS', icon: LayoutDashboard, badge: null, adminOnly: false },
    { id: 'ai-ecosystem', label: 'Hệ Sinh Thái AI CLS', icon: Sparkles, badge: '4 Trụ Cột', adminOnly: false },
    { id: 'reports', label: 'Báo Cáo & Thống Kê', icon: BarChart3, badge: 'Mới', adminOnly: false },
    { id: 'equipment', label: 'Quản Lý Máy Móc', icon: Wrench, badge: 'Thiết bị', adminOnly: false },
    { id: 'rooms', label: 'Quản Lý Phòng / Bộ Phận', icon: Building2, badge: 'Cơ cấu', adminOnly: false },
    { id: 'tasks', label: 'Công Việc & Kế Hoạch', icon: CheckSquare, badge: 'Hôm nay', adminOnly: false },
    { id: 'schedule', label: 'Lịch Làm Việc Tuần', icon: Calendar, badge: '2 Bảng', adminOnly: false },
    { id: 'hr', label: 'Nhân Sự & Đào Tạo', icon: UserCheck, badge: 'Hồ sơ', adminOnly: false },
    { id: 'meetings', label: 'Quản Lý Cuộc Họp', icon: FileCheck, badge: 'Giao việc', adminOnly: false },
    { id: 'documents', label: 'Hồ Sơ & Quy Trình ISO', icon: FolderOpen, badge: '15189', adminOnly: false },
    { id: 'discussion', label: 'Trao Đổi & Chat Khoa', icon: MessageSquare, badge: 'Teams', adminOnly: false },
    { id: 'integration', label: 'Cổng API HIS/LIS/PACS', icon: Network, badge: 'Gateway', adminOnly: false },
    { id: 'notifications', label: 'Thông Báo Nội Bộ', icon: Bell, badge: null, adminOnly: false },
    { id: 'users', label: 'Phân Quyền Hệ Thống', icon: Users, badge: null, adminOnly: true },
    { id: 'settings', label: 'Cấu Hình Hệ Thống', icon: Settings, badge: null, adminOnly: false },
    { id: 'audit', label: 'Lịch Sử Audit Log', icon: History, badge: null, adminOnly: false },
    { id: 'gas-architecture', label: 'Kiến Trúc GAS Code', icon: Code2, badge: 'SOLID', adminOnly: true },
  ];

  const menuItems = allMenuItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside
      className={`relative flex flex-col h-screen bg-slate-900 text-slate-300 border-r border-slate-800 transition-all duration-300 z-40 select-none ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Logo & Name */}
      <div className="flex items-center h-16 px-4 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-bold text-xl shadow-lg shrink-0">
            <Activity className="w-6 h-6 text-white" />
          </div>
          {!collapsed && (
            <div className="truncate">
              <h1 className="text-base font-extrabold text-white tracking-wide leading-tight flex items-center space-x-1">
                <span>CLS WorkHub</span>
              </h1>
              <p className="text-[10px] text-blue-400 font-semibold truncate uppercase tracking-wider">Khoa Cận Lâm Sàng</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {!collapsed && (
          <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
                title={item.label}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!collapsed && item.badge && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
                    isActive ? 'bg-white/20 text-white' : 'bg-blue-900/50 text-blue-300'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>

              {/* Floating Tooltip displaying full menu name */}
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg border border-slate-700 shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 flex items-center gap-2 transform translate-x-1 group-hover:translate-x-0">
                <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-1 border-4 border-transparent border-r-slate-800"></div>
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
      </div>

      {/* Collapse Toggle Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/20">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          title={collapsed ? "Mở rộng thanh menu" : "Thu gọn thanh menu"}
        >
          <ChevronRight className={`w-5 h-5 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
          {!collapsed && <span className="ml-2 text-xs font-medium">Thu gọn menu</span>}
        </button>
      </div>
    </aside>
  );
};

