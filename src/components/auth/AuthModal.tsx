import React, { useState, useEffect } from 'react';
import { 
  KeyRound, Lock, Eye, EyeOff, ShieldCheck, 
  RefreshCw, CheckCircle2, AlertCircle, X, HelpCircle, ArrowRight,
  Search, User as UserIcon, Check, Sparkles, LogIn, ChevronDown
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { User } from '../../types/hospital';
import { removeVietnameseTones } from '../../services/searchService';

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
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>('');
  
  // Password fields
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetNote, setResetNote] = useState('');
  
  // Toggles & Loading
  const [showPassword, setShowPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      const list = storageService.getUsers();
      setUsers(list);
      const cur = storageService.getCurrentUser();
      if (list.length > 0) {
        const found = list.find(u => u.id === cur.id);
        setSelectedUserId(found ? found.id : list[0].id);
      }
      setMode(initialMode);
      setPassword('');
      setStaffSearchQuery('');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowOldPassword(false);
      setShowNewPassword(false);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const selectedUser = users.find(u => u.id === selectedUserId) || users[0];

  // Diacritic-insensitive filtering
  const filteredUsers = users.filter((u) => {
    if (!staffSearchQuery.trim()) return true;
    const q = removeVietnameseTones(staffSearchQuery);
    const nameNorm = removeVietnameseTones(u.name);
    const deptNorm = removeVietnameseTones(u.department || '');
    const titleNorm = removeVietnameseTones(u.title || '');
    const phone = u.phone || '';
    const emailNorm = removeVietnameseTones(u.email || '');
    const roleNorm = removeVietnameseTones(u.role);
    return (
      nameNorm.includes(q) ||
      deptNorm.includes(q) ||
      titleNorm.includes(q) ||
      phone.includes(q) ||
      emailNorm.includes(q) ||
      roleNorm.includes(q)
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      onShowToast('Chưa chọn tài khoản', 'Vui lòng chọn một cán bộ trong danh sách nhân viên', 'warning');
      return;
    }
    if (!password) {
      onShowToast('Thiếu mật khẩu', 'Vui lòng nhập mật khẩu (mặc định: 123456)', 'warning');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const res = storageService.loginById(selectedUserId, password);
      setLoading(false);
      if (res.success) {
        onShowToast('Đăng nhập thành công', `Chào mừng ${res.user?.name} đã đăng nhập hệ thống!`, 'success');
        onClose();
      } else {
        onShowToast('Đăng nhập thất bại', res.message, 'error');
      }
    }, 250);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      onShowToast('Lỗi', 'Chưa xác định tài khoản cần đổi mật khẩu', 'error');
      return;
    }
    if (!oldPassword || !newPassword || !confirmPassword) {
      onShowToast('Lỗi', 'Vui lòng điền đầy đủ các thông tin mật khẩu', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      onShowToast('Lỗi', 'Mật khẩu mới và xác nhận mật khẩu không trùng khớp', 'error');
      return;
    }

    if (newPassword.length < 6) {
      onShowToast('Lỗi', 'Mật khẩu mới phải có ít nhất 6 ký tự', 'error');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const res = storageService.changePassword(selectedUser.id, oldPassword, newPassword);
      setLoading(false);
      if (res.success) {
        onShowToast('Thành công', `Đã cập nhật mật khẩu mới cho ${selectedUser.name}!`, 'success');
        setPassword(newPassword);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setMode('login');
      } else {
        onShowToast('Đổi mật khẩu thất bại', res.message, 'error');
      }
    }, 250);
  };

  const handleRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser?.email) {
      onShowToast('Lỗi', 'Tài khoản chưa có email liên kết để reset', 'error');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const res = storageService.requestPasswordReset(selectedUser.email, resetNote);
      setLoading(false);
      if (res.success) {
        onShowToast('Đã gửi yêu cầu', res.message, 'info');
        setMode('login');
      } else {
        onShowToast('Lỗi', res.message, 'error');
      }
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 max-w-lg w-full p-6 space-y-4.5 relative text-slate-800 dark:text-slate-100 max-h-[92vh] overflow-y-auto custom-scrollbar">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Đóng cửa sổ"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Title */}
        <div className="text-center space-y-1 pt-1">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-blue-100 dark:border-blue-900/60 shadow-xs">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {mode === 'login' && 'Đăng nhập Hệ thống Hospital OS'}
            {mode === 'change-password' && 'Đổi Mật Khẩu Cán Bộ'}
            {mode === 'forgot-password' && 'Yêu cầu Reset Mật khẩu'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login' && 'Chọn nhân viên từ danh sách bên dưới và nhập mật khẩu để truy cập'}
            {mode === 'change-password' && `Cập nhật mật khẩu mới cho cán bộ: ${selectedUser?.name}`}
            {mode === 'forgot-password' && 'Gửi yêu cầu tới Admin để hỗ trợ khôi phục mật khẩu tài khoản'}
          </p>
        </div>

        {/* ===================== MODE: LOGIN ===================== */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            
            {/* Top Quick Search Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-blue-500" />
                  <span>Chọn cán bộ nhân viên đăng nhập *</span>
                </label>
                <span className="text-[11px] text-slate-400 dark:text-slate-400">
                  {filteredUsers.length}/{users.length} nhân viên
                </span>
              </div>

              {/* Quick Search Input */}
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                  placeholder="Tìm nhanh nhân viên theo tên, chức danh, phòng ban, SĐT..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
                {staffSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setStaffSearchQuery('')}
                    className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                    title="Xóa tìm kiếm"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Staff Members List - Only display when user types in search */}
            {staffSearchQuery.trim().length > 0 && (
              <div className="border border-slate-200 dark:border-slate-700/80 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/40">
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 custom-scrollbar">
                  {filteredUsers.length === 0 ? (
                    <div className="py-6 px-4 text-center">
                      <Search className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-500 mb-1" />
                      <p className="font-semibold text-slate-600 dark:text-slate-400">Không tìm thấy cán bộ phù hợp</p>
                      <p className="text-[11px] text-slate-400">Thử tìm theo họ tên hoặc chức danh khác</p>
                    </div>
                  ) : (
                    filteredUsers.map((u, idx) => {
                      const isSelected = u.id === selectedUserId;
                      return (
                        <div
                          key={`${u.id}-${idx}`}
                          onClick={() => {
                            setSelectedUserId(u.id);
                            setStaffSearchQuery(u.name);
                          }}
                          className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-50/90 dark:bg-blue-900/30 border-l-4 border-blue-600 dark:border-blue-400 pl-2.5'
                              : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                            <img
                              src={u.avatar}
                              alt={u.name}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                                <span>{u.name}</span>
                                {isSelected && (
                                  <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 px-1 py-0.2 rounded">
                                    Đang chọn
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                                {u.title || 'Cán bộ'} • {u.department || 'Khoa Cận Lâm Sàng'}
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

            {/* Selected Employee Preview Card */}
            {selectedUser && (
              <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 flex items-center justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <img
                    src={selectedUser.avatar}
                    alt={selectedUser.name}
                    className="w-9 h-9 rounded-full object-cover border border-blue-200 dark:border-blue-700 shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider">
                      Cán bộ đang chọn:
                    </span>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {selectedUser.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {selectedUser.title || 'Cán bộ y tế'} • {selectedUser.department || 'Khoa Cận Lâm Sàng'}
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md shrink-0 ${getRoleBadgeColor(selectedUser.role)}`}>
                  {selectedUser.role}
                </span>
              </div>
            )}

            {/* Password Input Field with Eye Toggle */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
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

            {/* Default Password Hint Notice */}
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
              <div className="flex items-center space-x-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Mật khẩu mặc định: <strong className="font-mono text-amber-900 dark:text-amber-200 font-bold">123456</strong></span>
              </div>
              <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 italic">
                (Đổi mật khẩu tại menu sau khi đăng nhập)
              </span>
            </div>

            {/* Login Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 text-xs"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Xác nhận Đăng nhập</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ===================== MODE: CHANGE PASSWORD ===================== */}
        {mode === 'change-password' && (
          <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
            
            {/* Target User Switcher / Banner */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Tài khoản thực hiện đổi mật khẩu:
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${getRoleBadgeColor(selectedUser?.role || 'Staff')}`}>
                  {selectedUser?.role}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                <img
                  src={selectedUser?.avatar}
                  alt={selectedUser?.name}
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 dark:text-slate-100 text-xs truncate">
                    {selectedUser?.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {selectedUser?.title || 'Cán bộ'} • {selectedUser?.department || 'Khoa Cận Lâm Sàng'}
                  </div>
                </div>
              </div>

              {/* Quick User Picker dropdown if user wants to change another person */}
              <div className="pt-1">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.title || u.role} - {u.department})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Current Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 dark:text-slate-200">
                  Mật khẩu hiện tại *
                </label>
                <button
                  type="button"
                  onClick={() => setOldPassword('123456')}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Điền mặc định 123456</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  required
                  placeholder="Mật khẩu cũ (mặc định: 123456)"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password Field */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Mật khẩu mới * (tối thiểu 6 ký tự)
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Nhập mật khẩu mới"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password Field */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Xác nhận mật khẩu mới *
              </label>
              <input
                type="password"
                required
                placeholder="Nhập lại mật khẩu mới vừa đặt"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-xs"
              />
            </div>

            {/* Actions Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-semibold transition-colors"
              >
                Quay lại đăng nhập
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-xs flex items-center space-x-1.5"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Lưu Mật Khẩu Mới</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ===================== MODE: FORGOT / RESET ===================== */}
        {mode === 'forgot-password' && (
          <form onSubmit={handleRequestReset} className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-amber-800 dark:text-amber-300 text-xs">
              Mật khẩu mặc định hệ thống luôn là <strong>123456</strong>. Nếu bạn quên mật khẩu tự đặt, hãy gửi yêu cầu dưới đây để Quản trị viên reset về mặc định.
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Cán bộ yêu cầu reset mật khẩu:
              </label>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-2.5">
                <img
                  src={selectedUser?.avatar}
                  alt={selectedUser?.name}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 dark:text-slate-100">{selectedUser?.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{selectedUser?.email}</div>
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Lý do / Ghi chú gửi Admin
              </label>
              <textarea
                rows={3}
                placeholder="Tôi quên mật khẩu truy cập hệ thống, nhờ Admin reset giúp về mật khẩu mặc định 123456."
                value={resetNote}
                onChange={(e) => setResetNote(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-semibold"
              >
                Quay lại
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
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
