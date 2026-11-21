import React, { useState, useEffect, useRef } from 'react';
import {
  Lock, Unlock, Eye, EyeOff, RefreshCw, LogOut,
  Activity, Sun, Moon, ShieldCheck
} from 'lucide-react';
import { User } from '../../types/hospital';
import { storageService } from '../../services/storageService';
import { postgresSyncService } from '../../services/postgresSyncService';
import dashboardClsBanner from '../../assets/images/dashboard_cls_banner_1795182756340.jpg';

interface QuickLockScreenProps {
  user: User;
  lockedAt?: string;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onUnlockSuccess: (user: User) => void;
  onSwitchAccount: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const QuickLockScreen: React.FC<QuickLockScreenProps> = ({
  user,
  lockedAt,
  isDarkMode,
  onToggleTheme,
  onUnlockSuccess,
  onSwitchAccount,
  onShowToast
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg('Vui lòng nhập mật khẩu để mở khóa.');
      inputRef.current?.focus();
      return;
    }

    setErrorMsg('');
    setLoading(true);
    void (async () => {
      try {
        const res = postgresSyncService.isActiveBackend()
          ? await postgresSyncService.login(user.id, password)
          : storageService.loginById(user.id, password);

        if (res.success && res.user) {
          onShowToast(
            'Đã mở khóa màn hình',
            `Tiếp tục phiên làm việc của ${res.user.name}.`,
            'success'
          );
          onUnlockSuccess(res.user);
        } else {
          const msg = res.message || 'Mật khẩu không chính xác.';
          setErrorMsg(msg);
          setPassword('');
          onShowToast('Mở khóa thất bại', msg, 'error');
          inputRef.current?.focus();
        }
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-slate-950 text-slate-100 overflow-hidden">
      {/* Subtle architectural hospital backdrop with measured scrim */}
      <img
        src={dashboardClsBanner}
        alt=""
        referrerPolicy="no-referrer"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-35"
      />
      <div
        className={`absolute inset-0 transition-colors duration-200 ${
          isDarkMode
            ? 'bg-slate-950/85 backdrop-blur-md'
            : 'bg-slate-900/70 backdrop-blur-md'
        }`}
      />

      {/* Top Bar */}
      <header className="relative z-10 w-full border-b border-white/10 bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#1976D2] text-white flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              CLS WorkHub
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-amber-300 font-medium whitespace-nowrap">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Phiên làm việc đang tạm khóa bảo mật</span>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-white/15 bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
            title={isDarkMode ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-200" />}
          </button>
        </div>
      </header>

      {/* Center Unlock Panel */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-[400px] bg-white dark:bg-slate-900 text-[#263445] dark:text-slate-100 rounded-xl border border-[#DFE7F0] dark:border-slate-700/80 shadow-2xl p-6 space-y-5">
          {/* Active Locked User */}
          <div className="flex items-center gap-3.5 pb-4 border-b border-[#DFE7F0] dark:border-slate-800">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-full object-cover border border-[#DFE7F0] dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[#EAF4FF] dark:bg-sky-900/40 text-[#1976D2] dark:text-sky-300 font-bold text-base flex items-center justify-center shrink-0">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#263445] dark:text-slate-50 truncate">
                {user.name}
              </div>
              <div className="text-xs text-[#718096] dark:text-slate-400 truncate mt-0.5">
                {user.role === 'Admin'
                  ? 'Quản trị hệ thống'
                  : `${user.title || 'Cán bộ'} · ${user.department || 'Khoa CLS'}`}
              </div>
              {lockedAt && (
                <div className="text-[11px] font-mono text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
                  Đã khóa lúc {lockedAt}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#263445] dark:text-slate-200 block">
                Mật khẩu mở khóa phiên làm việc
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Nhập mật khẩu để tiếp tục"
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
              {errorMsg && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400 pt-0.5">
                  {errorMsg}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 px-4 bg-[#1976D2] hover:bg-[#155A9C] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Mở khóa màn hình</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-3 border-t border-[#DFE7F0] dark:border-slate-800 flex items-center justify-center">
            <button
              type="button"
              onClick={onSwitchAccount}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#718096] hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng nhập tài khoản khác</span>
            </button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full py-3.5 px-6 text-center text-xs text-slate-400">
        CLS WorkHub · Bệnh viện Đa khoa Sông Thương · Chuẩn quản lý chất lượng ISO 15189:2022
      </footer>
    </div>
  );
};
