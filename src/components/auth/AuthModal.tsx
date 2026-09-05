import React, { useState } from 'react';
import { 
  KeyRound, Mail, Lock, Eye, EyeOff, ShieldCheck, 
  RefreshCw, CheckCircle2, AlertCircle, X, HelpCircle, ArrowRight
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { User } from '../../types/hospital';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'change-password' | 'forgot-password';
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onShowToast
}) => {
  const [mode, setMode] = useState<'login' | 'change-password' | 'forgot-password'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetNote, setResetNote] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentUser = storageService.getCurrentUser();

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      onShowToast('Lỗi', 'Vui lòng nhập đầy đủ email và mật khẩu', 'error');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const res = storageService.login(email, password);
      setLoading(false);
      if (res.success) {
        onShowToast('Thành công', `Xin chào ${res.user?.name}! Đăng nhập thành công.`, 'success');
        onClose();
      } else {
        onShowToast('Đăng nhập thất bại', res.message, 'error');
      }
    }, 300);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      onShowToast('Lỗi', 'Vui lòng điền đầy đủ các thông tin mật khẩu', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      onShowToast('Lỗi', 'Mật khẩu mới và xác nhận mật khẩu không khớp', 'error');
      return;
    }

    if (newPassword.length < 6) {
      onShowToast('Lỗi', 'Mật khẩu mới phải có ít nhất 6 ký tự', 'error');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const res = storageService.changePassword(currentUser.id, oldPassword, newPassword);
      setLoading(false);
      if (res.success) {
        onShowToast('Thành công', res.message, 'success');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
      } else {
        onShowToast('Lỗi', res.message, 'error');
      }
    }, 300);
  };

  const handleRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      onShowToast('Lỗi', 'Vui lòng nhập email đăng ký tài khoản', 'error');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const res = storageService.requestPasswordReset(email, resetNote);
      setLoading(false);
      if (res.success) {
        onShowToast('Đã gửi yêu cầu', res.message, 'info');
        setMode('login');
      } else {
        onShowToast('Lỗi', res.message, 'error');
      }
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-5 relative">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Title */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-xs">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {mode === 'login' && 'Đăng nhập Hệ thống Hospital OS'}
            {mode === 'change-password' && 'Đổi mật khẩu tài khoản'}
            {mode === 'forgot-password' && 'Yêu cầu reset mật khẩu'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login' && 'Nhập email & mật khẩu đã được cấp để truy cập hệ thống'}
            {mode === 'change-password' && `Tài khoản: ${currentUser.name} (${currentUser.email})`}
            {mode === 'forgot-password' && 'Gửi thông tin xác thực để Admin hỗ trợ khôi phục mật khẩu'}
          </p>
        </div>

        {/* Quick Credentials Info Box */}
        {mode === 'login' && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
            <div className="font-semibold flex items-center space-x-1">
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>Gợi ý tài khoản mẫu (Mật khẩu mặc định: 123456):</span>
            </div>
            <div className="grid grid-cols-2 gap-1 font-mono pt-1 text-[10px]">
              <div>• Admin: admin@hospital.vn</div>
              <div>• Manager: nam.nguyen@hospital.vn</div>
              <div>• Doctor: mai.tran@hospital.vn</div>
              <div>• Staff: hoa.le@hospital.vn</div>
            </div>
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Email tài khoản *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="admin@hospital.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 dark:text-slate-200">
                  Mật khẩu *
                </label>
                <button
                  type="button"
                  onClick={() => setMode('forgot-password')}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-xs flex items-center justify-center space-x-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Xác nhận Đăng nhập</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* CHANGE PASSWORD FORM */}
        {mode === 'change-password' && (
          <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Mật khẩu hiện tại *
              </label>
              <input
                type="password"
                required
                placeholder="Mật khẩu cũ (mặc định: 123456)"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Mật khẩu mới * (tối thiểu 6 ký tự)
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Mật khẩu mới"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Xác nhận mật khẩu mới *
              </label>
              <input
                type="password"
                required
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-slate-500 hover:text-slate-700 font-medium"
              >
                Quay lại
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
              >
                {loading ? 'Đang cập nhật...' : 'Cập nhật Mật khẩu'}
              </button>
            </div>
          </form>
        )}

        {/* FORGOT / REQUEST RESET FORM */}
        {mode === 'forgot-password' && (
          <form onSubmit={handleRequestReset} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Email tài khoản của bạn *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="mai.tran@hospital.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Lý do / Ghi chú cho Admin
              </label>
              <textarea
                rows={3}
                placeholder="Tôi quên mật khẩu truy cập hệ thống, nhờ Admin reset giúp về mặc định 123456"
                value={resetNote}
                onChange={(e) => setResetNote(e.target.value)}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-slate-500 hover:text-slate-700 font-medium"
              >
                Quay lại đăng nhập
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl"
              >
                {loading ? 'Đang gửi...' : 'Gửi yêu cầu Reset'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
