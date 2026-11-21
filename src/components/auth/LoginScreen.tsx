import React, { useState, useEffect, useRef } from 'react';
import {
  Lock, Eye, EyeOff, RefreshCw, X, Search,
  Activity, Sun, Moon, Cloud, CloudOff, HelpCircle, ChevronRight,
  ShieldCheck, Microscope, Users
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { postgresSyncService, type PostgresSyncState } from '../../services/postgresSyncService';
import { User } from '../../types/hospital';
import { removeVietnameseTones } from '../../services/searchService';
import loginClsHero from '../../assets/images/login_cls_hero_1795182757386.jpg';

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
  const [users, setUsers] = useState<User[]>(() => storageService.getUsers());
  const [pgState, setPgState] = useState<PostgresSyncState>(() => postgresSyncService.getState());
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHelpTip, setShowHelpTip] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const pickerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUsers(storageService.getUsers());
    setSelectedUserId('');
    setPassword('');
    setSearchQuery('');
    setErrorMsg('');
    void postgresSyncService.refreshDirectory();

    const unsubStorage = storageService.subscribe(() => {
      setUsers(storageService.getUsers());
    });
    const unsubPg = postgresSyncService.subscribe(() => {
      setPgState(postgresSyncService.getState());
    });
    return () => {
      unsubStorage();
      unsubPg();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerContainerRef.current && !pickerContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const effectiveUsers: User[] =
    pgState.configured && pgState.publicStaffDirectory.length > 0
      ? pgState.publicStaffDirectory.map((s) => {
          const localMatch = users.find((u) => u.id === s.id);
          return {
            ...(localMatch || {}),
            id: s.id,
            name: s.name,
            email: localMatch?.email || '',
            role: s.role,
            department: s.department || localMatch?.department || 'Khoa Cận Lâm Sàng',
            title: (s.title || localMatch?.title || s.role) as User['title'],
            avatar: s.avatar || localMatch?.avatar
          } as User;
        })
      : users;

  const selectedUser = effectiveUsers.find((u) => u.id === selectedUserId) || null;

  const filteredUsers = effectiveUsers.filter((u) => {
    const raw = searchQuery.trim();
    if (!raw) return true;
    const q = removeVietnameseTones(raw);
    const nameNorm = removeVietnameseTones(u.name);
    const deptNorm = removeVietnameseTones(u.department || '');
    const titleNorm = removeVietnameseTones(u.title || '');
    const roleNorm = removeVietnameseTones(u.role || '');
    const phone = u.phone || '';
    return (
      nameNorm.includes(q) ||
      deptNorm.includes(q) ||
      titleNorm.includes(q) ||
      roleNorm.includes(q) ||
      phone.includes(q)
    );
  });

  const handleSelectStaff = (u: User) => {
    setSelectedUserId(u.id);
    setSearchQuery('');
    setIsDropdownOpen(false);
    setErrorMsg('');
    window.setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 30);
  };

  const handleClearSelection = () => {
    setSelectedUserId('');
    setSearchQuery('');
    setPassword('');
    setErrorMsg('');
    setIsDropdownOpen(true);
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      const msg = 'Vui lòng chọn tài khoản cán bộ trước khi đăng nhập.';
      setErrorMsg(msg);
      setIsDropdownOpen(true);
      onShowToast('Chưa chọn tài khoản', msg, 'warning');
      searchInputRef.current?.focus();
      return;
    }
    if (!password) {
      const msg = 'Vui lòng nhập mật khẩu truy cập.';
      setErrorMsg(msg);
      onShowToast('Thiếu mật khẩu', msg, 'warning');
      passwordInputRef.current?.focus();
      return;
    }

    setErrorMsg('');
    setLoading(true);
    void (async () => {
      try {
        const res = pgState.configured
          ? await postgresSyncService.login(selectedUserId, password)
          : storageService.loginById(selectedUserId, password);
        if (res.success && res.user) {
          onShowToast('Đăng nhập thành công', `Chào mừng ${res.user.name} truy cập hệ thống!`, 'success');
          onLoginSuccess(res.user);
        } else {
          const msg = res.message || 'Thông tin đăng nhập không chính xác.';
          setErrorMsg(msg);
          onShowToast('Đăng nhập thất bại', msg, 'error');
        }
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#F4F7FB] dark:bg-[#0b0f19] text-[#263445] dark:text-slate-100 transition-colors duration-200">
      {/* Clean HIS Top Bar */}
      <header className="w-full border-b border-[#DFE7F0] dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#1976D2] text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Activity className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-base font-bold tracking-tight text-[#155A9C] dark:text-slate-50 whitespace-nowrap shrink-0">
              CLS WorkHub
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-[#718096] dark:text-slate-400 whitespace-nowrap">
            <span>Bệnh viện Đa khoa Sông Thương</span>
            <span aria-hidden="true">·</span>
            <span>Khoa Cận Lâm Sàng</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">ISO 15189:2022</span>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#DFE7F0] dark:border-slate-700 bg-[#F4F7FB] dark:bg-slate-800 hover:bg-[#EAF4FF] dark:hover:bg-slate-700 text-[#263445] dark:text-slate-300 transition-colors cursor-pointer shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1976D2]"
            title={isDarkMode ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
            aria-label={isDarkMode ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#155A9C]" />}
          </button>
        </div>
      </header>

      {/* Main Architectural Split Viewport */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-8 py-6 sm:py-8">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch">
          {/* Left Architectural Hospital Banner (7 cols on desktop) */}
          <section className="lg:col-span-7 relative rounded-xl overflow-hidden border border-[#DFE7F0] dark:border-slate-800 bg-[#155A9C] min-h-[260px] sm:min-h-[340px] lg:min-h-[520px] flex flex-col justify-end">
            {!heroImgFailed ? (
              <img
                src={loginClsHero}
                alt="Không gian Khoa Cận Lâm Sàng Bệnh viện Đa khoa Sông Thương"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex items-center justify-center">
                <Microscope className="w-20 h-20 text-sky-400/20" />
              </div>
            )}

            {/* Measured Scrim ensuring >= 7:1 contrast for foreground copy */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/55 to-slate-950/15" />

            <div className="relative z-10 p-6 sm:p-8 lg:p-10 space-y-6 text-white">
              <div className="space-y-3 max-w-xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-sky-200/90 font-medium">
                  <span>Bệnh viện Đa khoa Sông Thương</span>
                  <span aria-hidden="true">·</span>
                  <span>Khoa Cận Lâm Sàng</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">ISO 15189:2022</span>
                </div>

                <h1
                  className="text-2xl sm:text-3xl lg:text-[34px] font-bold tracking-tight leading-[1.18] text-white"
                  style={{ textWrap: 'balance' }}
                >
                  Hệ thống Điều hành &amp; Giám sát Chuyên môn Cận Lâm Sàng
                </h1>

                <p className="text-sm text-slate-200/90 leading-relaxed max-w-lg">
                  Nền tảng quản trị tập trung cho hoạt động xét nghiệm, chẩn đoán hình ảnh, kiểm định thiết bị y tế và điều phối nhân sự trực theo thời gian thực.
                </p>
              </div>

              {/* Clean Architectural Pillars Divider Strip (No Pill Clutter) */}
              <div className="pt-5 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Microscope className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                    <span>Báo cáo số ca hằng ngày</span>
                  </div>
                  <p className="text-slate-300 leading-snug">
                    Tổng hợp BHYT, Viện phí &amp; tỷ lệ tăng giảm từng kỹ thuật.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                    <span>Kiểm định thiết bị 4 chu kỳ</span>
                  </div>
                  <p className="text-slate-300 leading-snug">
                    Cảnh báo sớm hạn hiệu chuẩn, bảo dưỡng &amp; hồ sơ ISO.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Users className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>Quản lý nhân sự chuyên nghiệp</span>
                  </div>
                  <p className="text-slate-300 leading-snug">
                    Phân quyền theo phạm vi phụ trách, hồ sơ đào tạo, chứng chỉ &amp; lịch trực.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Right Clinical Authentication Panel (5 cols on desktop) */}
          <section className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 p-6 sm:p-7 flex flex-col justify-between shadow-2xs">
            <div className="space-y-5">
              <div className="space-y-1 pb-4 border-b border-[#DFE7F0] dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#1976D2] dark:text-sky-400">
                  <span>Cổng xác thực nội bộ HIS</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums font-mono">{effectiveUsers.length} cán bộ</span>
                </div>
                <h2 className="text-lg font-bold tracking-tight text-[#263445] dark:text-slate-50">
                  Đăng nhập hệ thống
                </h2>
                <p className="text-xs text-[#718096] dark:text-slate-400 leading-relaxed">
                  Chọn hồ sơ cán bộ phụ trách và nhập mật khẩu để mở phân quyền tương ứng.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Staff Combobox / Inline Selected Row */}
                <div className="space-y-1.5 relative" ref={pickerContainerRef}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#263445] dark:text-slate-200">
                      Tài khoản cán bộ
                    </label>
                    {selectedUser && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="text-xs font-semibold text-[#1976D2] hover:text-[#155A9C] dark:text-sky-400 cursor-pointer"
                      >
                        Đổi cán bộ
                      </button>
                    )}
                  </div>

                  {selectedUser ? (
                    <div className="min-h-[46px] px-3 py-2 rounded-lg border border-[#1976D2]/30 dark:border-slate-700 bg-[#EAF4FF] dark:bg-slate-800/70 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {selectedUser.avatar ? (
                          <img
                            src={selectedUser.avatar}
                            alt={selectedUser.name}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-full object-cover border border-[#1976D2]/30 dark:border-slate-600 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#1976D2] text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {selectedUser.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#263445] dark:text-slate-100 truncate leading-tight">
                            {selectedUser.name}
                          </div>
                          <div className="text-xs text-[#718096] dark:text-slate-400 truncate leading-tight mt-0.5">
                            {selectedUser.role === 'Admin'
                              ? 'Quản trị hệ thống'
                              : `${selectedUser.title || selectedUser.role} · ${selectedUser.department || 'Khoa CLS'}`}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="p-1.5 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 rounded-md hover:bg-white/70 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
                        title="Chọn tài khoản khác"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onFocus={() => setIsDropdownOpen(true)}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setIsDropdownOpen(true);
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="Tìm theo họ tên, chức danh hoặc bộ phận..."
                        autoComplete="off"
                        className="w-full h-10 pl-9 pr-9 text-sm bg-white dark:bg-slate-800/80 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 placeholder-[#718096] focus:outline-hidden focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2] transition-colors"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            searchInputRef.current?.focus();
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 rounded-md cursor-pointer"
                          title="Xóa từ khóa"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      {isDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-1.5 rounded-lg border border-[#DFE7F0] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-30 overflow-hidden">
                          <div className="max-h-60 overflow-y-auto divide-y divide-[#DFE7F0]/60 dark:divide-slate-700/60 custom-scrollbar">
                            {filteredUsers.length === 0 ? (
                              <div className="py-6 px-4 text-center text-xs text-[#718096] dark:text-slate-400">
                                Không tìm thấy cán bộ phù hợp
                              </div>
                            ) : (
                              filteredUsers.map((u, idx) => (
                                <button
                                  key={`${u.id}-${idx}`}
                                  type="button"
                                  onClick={() => handleSelectStaff(u)}
                                  className="w-full text-left px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-[#EAF4FF] dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {u.avatar ? (
                                      <img
                                        src={u.avatar}
                                        alt={u.name}
                                        referrerPolicy="no-referrer"
                                        className="w-8 h-8 rounded-full object-cover border border-[#DFE7F0] dark:border-slate-600 shrink-0"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-[#EAF4FF] dark:bg-slate-700 text-[#155A9C] dark:text-slate-300 text-xs font-bold flex items-center justify-center shrink-0">
                                        {u.name.slice(0, 1).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-[#263445] dark:text-slate-100 truncate">
                                        {u.name}
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                        {u.role === 'Admin'
                                          ? 'Quản trị hệ thống'
                                          : `${u.title || 'Cán bộ'} · ${u.department || 'Khoa CLS'}`}
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Password Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Mật khẩu truy cập
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowHelpTip((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Gợi ý</span>
                    </button>
                  </div>

                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={passwordInputRef}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="Nhập mật khẩu bảo mật"
                      className="w-full h-10 pl-9 pr-10 text-sm bg-white dark:bg-slate-800/80 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 placeholder-[#718096] focus:outline-hidden focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2] font-mono transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 cursor-pointer"
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {showHelpTip && (
                    <p className="text-xs text-[#718096] dark:text-slate-400 leading-relaxed pt-0.5">
                      Mật khẩu khởi tạo mặc định: <span className="font-mono font-semibold text-[#263445] dark:text-slate-300">123456</span> (nhân viên) hoặc <span className="font-mono font-semibold text-[#263445] dark:text-slate-300">admin</span> (quản trị). Vui lòng đổi sau khi đăng nhập.
                    </p>
                  )}

                  {errorMsg && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400 pt-0.5">
                      {errorMsg}
                    </p>
                  )}
                </div>

                {/* Primary CTA */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 px-4 bg-[#1976D2] hover:bg-[#155A9C] dark:bg-[#1976D2] dark:hover:bg-[#155A9C] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:ring-offset-2"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Đăng nhập vào hệ thống</span>
                  )}
                </button>
              </form>
            </div>

            {/* Clean Database Synchronization Footer Row */}
            <div className="mt-5 pt-3.5 border-t border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-[#718096] dark:text-slate-400">
              <div className="flex items-center gap-2 min-w-0">
                {pgState.configured ? (
                  pgState.connected ? (
                    <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <CloudOff className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  )
                ) : (
                  <Cloud className="w-4 h-4 text-[#718096] shrink-0" />
                )}
                <span className="truncate tabular-nums">
                  {pgState.configured
                    ? pgState.connected
                      ? `Đồng bộ PostgreSQL · ${effectiveUsers.length} tài khoản`
                      : 'Mất kết nối PostgreSQL'
                    : `Lưu cục bộ · ${effectiveUsers.length} tài khoản`}
                </span>
              </div>

              {pgState.configured && (
                <button
                  type="button"
                  onClick={() => void postgresSyncService.refreshDirectory()}
                  className="text-[#1976D2] hover:text-[#155A9C] dark:text-sky-400 dark:hover:text-white font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                  title="Làm mới danh sách tài khoản"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Làm mới</span>
                </button>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Clean Institutional Footer */}
      <footer className="w-full py-3 px-6 border-t border-[#DFE7F0] dark:border-slate-800/60 bg-white dark:bg-slate-900/50 text-center text-xs text-[#718096] dark:text-slate-500">
        CLS WorkHub · Bệnh viện Đa khoa Sông Thương · Chuẩn quản lý chất lượng ISO 15189:2022
      </footer>
    </div>
  );
};
