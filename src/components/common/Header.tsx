import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, Search, User as UserIcon, Shield, Bug, Sun, Moon, Monitor, Check,
  Plus, CheckCircle2, AlertTriangle, Hospital, Activity, KeyRound, LogIn,
  X, FileText, CheckSquare, Wrench, Building2, Clock, Users, ArrowRight,
  Sparkles, Command, ChevronRight
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { User, UserRole } from '../../types/hospital';
import { medicalSearchEngine, SearchResultItem, removeVietnameseTones } from '../../services/searchService';

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
  onOpenAuth
}) => {
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());
  const [users, setUsers] = useState<User[]>(storageService.getUsers());
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // Live Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const settings = storageService.getSettings();

  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setCurrentUser(storageService.getCurrentUser());
      setUsers(storageService.getUsers());
    });
    return () => unsubscribe();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
        setShowThemeDropdown(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter accounts live based on search query (diacritic-insensitive)
  const filteredUsers = React.useMemo(() => {
    if (!accountSearchQuery.trim()) return users;
    const q = removeVietnameseTones(accountSearchQuery.toLowerCase().trim());
    return users.filter((u) => {
      const name = removeVietnameseTones((u.name || '').toLowerCase());
      const dept = removeVietnameseTones((u.department || '').toLowerCase());
      const role = removeVietnameseTones((u.role || '').toLowerCase());
      const title = removeVietnameseTones((u.title || '').toLowerCase());
      const phone = (u.phone || '').toLowerCase();
      const room = removeVietnameseTones((u.room || '').toLowerCase());
      const email = (u.email || '').toLowerCase();

      return (
        name.includes(q) ||
        dept.includes(q) ||
        role.includes(q) ||
        title.includes(q) ||
        phone.includes(q) ||
        room.includes(q) ||
        email.includes(q)
      );
    });
  }, [users, accountSearchQuery]);

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

  const handleSwitchUser = (user: User) => {
    storageService.setCurrentUser(user);
    setCurrentUser(user);
    setShowRoleDropdown(false);
    setAccountSearchQuery('');
  };

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
      case 'tasks': return 'Quản lý Công việc & Y vụ';
      case 'documents': return 'Hồ sơ & Quy trình SOP / ISO';
      case 'equipment': return 'Quản lý Máy móc & Thiết bị';
      case 'rooms': return 'Phòng / Bộ phận Trực thuộc';
      case 'hr': return 'Nhân sự & Đào tạo Khoa';
      case 'schedule': return 'Lịch trực & Ca công tác';
      case 'meetings': return 'Cuộc họp & Hội chẩn';
      case 'reports': return 'Báo cáo & Thống kê';
      case 'integration': return 'Trung tâm Tích hợp LIS / PACS';
      case 'discussion': return 'Kênh Trao đổi Nội bộ';
      case 'notifications': return 'Trung tâm Thông báo';
      case 'settings': return 'Cấu hình Hệ thống';
      case 'users': return 'Người dùng & Phân quyền';
      case 'audit': return 'Lịch sử Audit Log';
      case 'gas-architecture': return 'Kiến trúc Google Apps Script';
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
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs transition-colors">
      {/* Left: Active Module Name & Quick Omnisearch Input */}
      <div className="flex items-center space-x-3 md:space-x-5 flex-1 min-w-0 mr-2">
        <div className="flex items-center space-x-2 text-slate-800 dark:text-slate-100 font-bold text-base md:text-lg shrink-0">
          <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span className="hidden sm:inline capitalize truncate max-w-[200px] lg:max-w-none">{getModuleTitle(activeModule)}</span>
        </div>

        {/* Global Omnisearch Bar with Live Results Dropdown */}
        <div className="relative flex-1 max-w-md lg:max-w-xl" ref={searchContainerRef}>
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={handleKeyDown}
              placeholder="Tìm nhanh SOP, máy móc, phòng ban, công việc..."
              className="w-full pl-9 pr-20 py-2 text-xs md:text-sm bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => onOpenSearchModal('')}
                  className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-200/60 dark:bg-slate-700/60 rounded border border-slate-300/60 dark:border-slate-600/60 hover:text-blue-600 transition-colors"
                  title="Mở bảng tìm kiếm Spotlight (Ctrl + K)"
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
                  onClick={() => onOpenSearchModal(searchQuery)}
                  className="w-full py-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                >
                  <span>Mở bảng Tìm Kiếm Toàn Diện Spotlight cho "{searchQuery}"</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions, Notifications, Role Switcher, Profile */}
      <div className="flex items-center space-x-2 md:space-x-3 shrink-0">
        {/* Quick Spotlight Button */}
        <button
          onClick={() => onOpenSearchModal('')}
          className="p-2 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden sm:flex items-center gap-1.5 text-xs font-semibold"
          title="Tìm kiếm Spotlight toàn hệ thống (Ctrl + K)"
        >
          <Search className="w-4 h-4 text-blue-500" />
          <span className="hidden md:inline">Spotlight</span>
        </button>

        {/* Quick Create Buttons */}
        {activeModule === 'tasks' && (
          <button
            onClick={onOpenNewTask}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Tạo việc</span>
          </button>
        )}

        {activeModule === 'documents' && (
          <button
            onClick={onOpenNewDoc}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Tải hồ sơ</span>
          </button>
        )}

        {/* Debug Mode Badge */}
        {settings.debugMode && (
          <div className="hidden xl:flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 text-xs rounded-full font-medium">
            <Bug className="w-3.5 h-3.5" />
            <span>Debug</span>
          </div>
        )}

        {/* Theme Mode Dropdown */}
        <div className="relative" ref={themeDropdownRef}>
          <button
            onClick={() => setShowThemeDropdown(!showThemeDropdown)}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center space-x-1"
            title="Tùy chỉnh giao diện Sáng / Tối / Hệ thống"
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-indigo-500" />
            )}
          </button>

          {showThemeDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Chủ đề giao diện
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    onChangeThemeMode?.('light');
                    setShowThemeDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-xs font-medium flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors ${
                    themeMode === 'light' ? 'text-amber-600 font-bold dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>Giao diện Sáng</span>
                  </div>
                  {themeMode === 'light' && <Check className="w-3.5 h-3.5 text-amber-500" />}
                </button>

                <button
                  onClick={() => {
                    onChangeThemeMode?.('dark');
                    setShowThemeDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-xs font-medium flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors ${
                    themeMode === 'dark' ? 'text-indigo-600 font-bold dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span>Giao diện Tối</span>
                  </div>
                  {themeMode === 'dark' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </button>

                <button
                  onClick={() => {
                    onChangeThemeMode?.('system');
                    setShowThemeDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-xs font-medium flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors ${
                    themeMode === 'system' ? 'text-blue-600 font-bold dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Monitor className="w-4 h-4 text-blue-500" />
                    <span>Theo Hệ thống</span>
                  </div>
                  {themeMode === 'system' && <Check className="w-3.5 h-3.5 text-blue-500" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Role & User Switcher */}
        <div className="relative" ref={roleDropdownRef}>
          <button
            onClick={() => setShowRoleDropdown(!showRoleDropdown)}
            className="flex items-center space-x-2.5 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
            />
            <div className="hidden lg:block text-left">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                {currentUser.name}
              </div>
              <span className={`inline-block px-1.5 py-0.2 text-[10px] font-bold rounded-md ${getRoleBadgeColor(currentUser.role)}`}>
                {currentUser.role}
              </span>
            </div>
          </button>

          {showRoleDropdown && (
            <div className="absolute right-0 mt-2 w-[360px] sm:w-[420px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-700/80 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Header: Title & Quick Auth Actions */}
              <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-500" />
                    <span>Tài khoản & Phân quyền RBAC</span>
                  </p>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200/70 dark:border-slate-700">
                    {filteredUsers.length} tài khoản
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-1">
                  <button
                    onClick={() => {
                      setShowRoleDropdown(false);
                      onOpenAuth('login');
                    }}
                    className="flex-1 flex items-center justify-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/40 py-1.5 rounded-xl border border-blue-200/60 dark:border-blue-800/50 transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Đăng nhập</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowRoleDropdown(false);
                      onOpenAuth('change-password');
                    }}
                    className="flex-1 flex items-center justify-center space-x-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    <span>Đổi mật khẩu</span>
                  </button>
                </div>
              </div>

              {/* Subheader & Quick Search Input */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Chuyển nhanh tài khoản mẫu:
                  </div>
                  {accountSearchQuery && (
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                      Lọc {filteredUsers.length}/{users.length}
                    </span>
                  )}
                </div>

                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={accountSearchQuery}
                    onChange={(e) => setAccountSearchQuery(e.target.value)}
                    placeholder="Tìm nhanh họ tên, phòng ban, chức vụ, SĐT..."
                    className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    autoFocus
                  />
                  {accountSearchQuery && (
                    <button
                      onClick={() => setAccountSearchQuery('')}
                      className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      title="Xóa tìm kiếm"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Table Column Headers */}
              <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span>Nhân sự & Phòng ban</span>
                <span>Vai trò RBAC</span>
              </div>

              {/* Scrollable List / Table */}
              <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70 custom-scrollbar">
                {filteredUsers.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <Search className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Không tìm thấy tài khoản phù hợp
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Thử tìm với từ khóa khác hoặc xóa bộ lọc
                    </p>
                    <button
                      onClick={() => setAccountSearchQuery('')}
                      className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Xóa bộ lọc tìm kiếm</span>
                    </button>
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = u.id === currentUser.id;
                    return (
                      <button
                        key={u.id}
                        onClick={() => handleSwitchUser(u)}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-all ${
                          isSelected
                            ? 'bg-blue-50/80 dark:bg-blue-900/25 border-l-3 border-blue-600 dark:border-blue-400 pl-[13px]'
                            : ''
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0 pr-2">
                          <div className="relative shrink-0">
                            <img
                              src={u.avatar}
                              alt={u.name}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            {isSelected && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" title="Đang sử dụng"></span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isSelected && (
                                <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/70 px-1 py-0.2 rounded">
                                  Hiện tại
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                              {u.department || 'Khoa Cận Lâm Sàng'}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${getRoleBadgeColor(u.role)}`}>
                            {u.role}
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer status */}
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                <span>Nhấp chọn để chuyển phiên làm việc</span>
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  Tổng {users.length} tài khoản
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

