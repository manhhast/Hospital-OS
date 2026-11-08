import React, { useState, useEffect, useRef } from 'react';
import { 
  KeyRound, Lock, Eye, EyeOff, ShieldCheck, 
  RefreshCw, CheckCircle2, AlertCircle, X, HelpCircle, ArrowRight,
  Search, User as UserIcon, Check, Sparkles, LogIn, Activity,
  Sun, Moon, Hospital, Building2, UserCheck, RotateCcw
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { User } from '../../types/hospital';
import { removeVietnameseTones } from '../../services/searchService';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onShowToast,
  isDarkMode,
  onToggleTheme
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  
  // Password fields
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = storageService.getUsers();
    setUsers(list);
    // Don't auto-select user so that the list stays hidden until typing
    setSelectedUserId('');
    setPassword('');
    setSearchQuery('');
  }, []);

  const selectedUser = users.find(u => u.id === selectedUserId);

  // Diacritic-insensitive filtering by staff name and department/title
  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return false;
    const q = removeVietnameseTones(searchQuery);
    const nameNorm = removeVietnameseTones(u.name);
    const deptNorm = removeVietnameseTones(u.department || '');
    const titleNorm = removeVietnameseTones(u.title || '');
    const phone = u.phone || '';
    return (
      nameNorm.includes(q) ||
      deptNorm.includes(q) ||
      titleNorm.includes(q) ||
      phone.includes(q)
    );
  });

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800';
      case 'Doctor':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
      case 'Manager':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
      case 'Staff':
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
    }
  };

  const handleSelectStaff = (u: User) => {
    setSelectedUserId(u.id);
    setSearchQuery(u.name);
    setIsSearching(false);
  };

  const handleClearSelection = () => {
    setSelectedUserId('');
    setSearchQuery('');
    setPassword('');
    setIsSearching(false);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      onShowToast('Chưa chọn cán bộ', 'Vui lòng nhập tên vào ô tìm kiếm và chọn cán bộ nhân viên đăng nhập', 'warning');
      searchInputRef.current?.focus();
      return;
    }
    if (!password) {
      onShowToast('Thiếu mật khẩu', 'Vui lòng nhập mật khẩu truy cập (mặc định: 123456)', 'warning');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const res = storageService.loginById(selectedUserId, password);
      setLoading(false);
      if (res.success && res.user) {
        onShowToast('Đăng nhập thành công', `Chào mừng ${res.user.name} truy cập hệ thống!`, 'success');
        onLoginSuccess(res.user);
      } else {
        onShowToast('Đăng nhập thất bại', res.message, 'error');
      }
    }, 250);
  };

  // Condition to show filtered list: user has typed characters and hasn't explicitly locked in a selection or is searching
  const hasTypedQuery = searchQuery.trim().length > 0;
  const shouldShowFilteredList = hasTypedQuery && (!selectedUser || isSearching);

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
      
      {/* Top Navigation / Brand Header */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 font-black">
            <Activity className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG
              </span>
              <span className="px-1.5 py-0.2 text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded">
                KHOA CẬN LÂM SÀNG
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-tight">
              Hệ Thống Điều Hành & Giám Sát Chuyên Môn Y Tế (Hospital OS)
            </h1>
          </div>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
          title="Chuyển đổi giao diện Sáng / Tối"
        >
          {isDarkMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Chế độ Sáng</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-500" />
              <span className="hidden sm:inline">Chế độ Tối</span>
            </>
          )}
        </button>
      </header>

      {/* Main Login Card Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Card Top Title Banner */}
          <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-b from-blue-50/60 to-transparent dark:from-blue-950/20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3 shadow-xs border border-blue-200/60 dark:border-blue-800/60">
              <KeyRound className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              ĐĂNG NHẬP HỆ THỐNG HOSPITAL OS
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Nhập tên cán bộ để tìm kiếm và chọn tài khoản truy cập hệ thống
            </p>
          </div>

          <div className="p-6 space-y-4">
            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              
              {/* Staff Name Search Input */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                    <UserIcon className="w-4 h-4 text-blue-500" />
                    <span>Tên cán bộ nhân viên đăng nhập *</span>
                  </label>
                  {shouldShowFilteredList && (
                    <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                      Tìm thấy {filteredUsers.length} cán bộ
                    </span>
                  )}
                </div>

                {/* Input Field */}
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsSearching(true);
                      if (selectedUserId && e.target.value !== selectedUser?.name) {
                        setSelectedUserId('');
                      }
                    }}
                    onFocus={() => {
                      if (searchQuery.trim().length > 0) {
                        setIsSearching(true);
                      }
                    }}
                    placeholder="Nhập họ tên cán bộ để tìm kiếm (vd: An, Mai, Nam, Admin)..."
                    className="w-full pl-9 pr-8 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      title="Xóa tìm kiếm"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* FILTERED STAFF LIST (Only visible when typing) */}
                {shouldShowFilteredList && (
                  <div className="border border-blue-200/80 dark:border-blue-900/60 rounded-2xl overflow-hidden bg-white dark:bg-slate-800 shadow-xl mt-1.5 animate-in fade-in slide-in-from-top-1 duration-150 z-20">
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60 custom-scrollbar">
                      {filteredUsers.length === 0 ? (
                        <div className="py-6 px-4 text-center">
                          <Search className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-1" />
                          <p className="font-semibold text-slate-600 dark:text-slate-300 text-xs">
                            Không tìm thấy cán bộ phù hợp
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Không có nhân sự nào khớp với từ khóa "{searchQuery}"
                          </p>
                        </div>
                      ) : (
                        filteredUsers.map((u, idx) => {
                          const isSelected = u.id === selectedUserId;
                          return (
                            <div
                              key={`${u.id}-${idx}`}
                              onClick={() => handleSelectStaff(u)}
                              className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-blue-50/90 dark:bg-blue-900/40 border-l-4 border-blue-600 dark:border-blue-400 pl-3'
                                  : 'hover:bg-blue-50/50 dark:hover:bg-slate-700/60'
                              }`}
                            >
                              <div className="flex items-center space-x-3 min-w-0 pr-2">
                                <img
                                  src={u.avatar}
                                  alt={u.name}
                                  className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                                    <span>{u.name}</span>
                                    {isSelected && (
                                      <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 px-1.5 py-0.2 rounded-full">
                                        Đã chọn
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {u.role === 'Admin'
                                      ? 'Quản trị ứng dụng & Hệ thống'
                                      : `${u.title || 'Cán bộ'} • ${u.department || 'Khoa Cận Lâm Sàng'}`}
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${getRoleBadgeColor(u.role)}`}>
                                  {u.role}
                                </span>
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                                  isSelected 
                                    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500' 
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Staff Card Display */}
              {selectedUser ? (
                <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-50/80 to-indigo-50/60 dark:from-blue-950/40 dark:to-indigo-950/30 border border-blue-200/80 dark:border-blue-900/50 flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="relative shrink-0">
                      <img
                        src={selectedUser.avatar}
                        alt={selectedUser.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-xs"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" title="Sẵn sàng đăng nhập"></span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider flex items-center gap-1">
                        <UserCheck className="w-3 h-3" />
                        <span>Cán bộ đã chọn:</span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {selectedUser.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {selectedUser.role === 'Admin'
                          ? 'Quản trị ứng dụng & Hệ thống'
                          : `${selectedUser.title || 'Cán bộ'} • ${selectedUser.department || 'Khoa Cận Lâm Sàng'}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md shadow-2xs ${getRoleBadgeColor(selectedUser.role)}`}>
                      {selectedUser.role}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="Chọn cán bộ khác"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Subtle Guidance when not typed yet */
                !hasTypedQuery && (
                  <div className="py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Gợi ý: Gõ một vài ký tự trong tên nhân viên (vd: <em>An</em>, <em>Mai</em>, <em>Nam</em>, <em>Admin</em>...) để hệ thống lọc danh sách.</span>
                  </div>
                )
              )}

              {/* Password Input Field with Eye Toggle */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                    <Lock className="w-3.5 h-3.5 text-blue-500" />
                    <span>Mật khẩu truy cập *</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPassword('123456')}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                    title="Tự động điền mật khẩu mặc định 123456"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Điền 123456</span>
                  </button>
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Nhập mật khẩu (mặc định: 123456)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Default Password Hint Notice (No change password button outside) */}
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl px-3.5 py-2.5 text-[11px] text-amber-800 dark:text-amber-300">
                <div className="flex items-center space-x-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Mật khẩu mặc định hệ thống: <strong className="font-mono text-amber-900 dark:text-amber-200 font-bold">123456</strong></span>
                </div>
                <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 italic">
                  (Đổi mật khẩu sau khi đăng nhập)
                </span>
              </div>

              {/* Submit Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold rounded-xl transition-all shadow-md shadow-blue-500/25 flex items-center justify-center space-x-2 text-xs"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Xác nhận Đăng nhập vào Hệ thống</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer info */}
      <footer className="w-full py-4 px-6 text-center text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xs">
        <p>Hệ thống quản lý nội bộ tuân thủ chuẩn ISO 15189:2022 & Tiêu chí chất lượng Bệnh viện Bộ Y Tế</p>
        <p className="mt-0.5 text-slate-400 dark:text-slate-500 font-mono text-[10px]">Hospital OS • Phiên bản 2.6.4 Clinical Release</p>
      </footer>
    </div>
  );
};
