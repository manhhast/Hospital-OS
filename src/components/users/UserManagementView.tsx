import React, { useState, useEffect } from 'react';
import { Users, Shield, UserCheck, Plus, CheckCircle2, Lock, User as UserIcon, X, AlertTriangle, KeyRound, RefreshCw, MessageSquare } from 'lucide-react';
import { User, UserRole } from '../../types/hospital';
import { storageService } from '../../services/storageService';

interface UserManagementViewProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ onShowToast }) => {
  const [users, setUsers] = useState<User[]>(storageService.getUsers());
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());
  const [showAddModal, setShowAddModal] = useState(false);
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [newAdminPassword, setNewAdminPassword] = useState('123456');

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'Doctor' as UserRole,
    department: 'Khoa Cấp Cứu',
    telegramChatId: '987654321',
    phone: '0901234567'
  });

  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setUsers(storageService.getUsers());
      setCurrentUser(storageService.getCurrentUser());
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = currentUser?.role === 'Admin';
  const pendingResetRequests = users.filter(u => u.resetRequested);

  const handleAdminResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    if (!newAdminPassword || newAdminPassword.length < 6) {
      onShowToast('Lỗi', 'Mật khẩu mới phải từ 6 ký tự trở lên', 'error');
      return;
    }

    const res = storageService.resetUserPassword(resetModalUser.id, newAdminPassword);
    if (res.success) {
      onShowToast('Thành công', res.message, 'success');
      setResetModalUser(null);
      setNewAdminPassword('123456');
    } else {
      onShowToast('Lỗi', res.message, 'error');
    }
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onShowToast('Từ chối truy cập', 'Chỉ tài khoản Admin mới có quyền thêm người dùng mới', 'error');
      return;
    }

    if (!newUser.name || !newUser.email) {
      onShowToast('Lỗi', 'Vui lòng nhập tên và email người dùng', 'error');
      return;
    }

    const created: User = {
      id: `USR-${Math.floor(100 + Math.random() * 900)}`,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department,
      avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
      telegramChatId: newUser.telegramChatId,
      phone: newUser.phone,
      status: 'Active'
    };

    storageService.saveUser(created);
    setUsers(storageService.getUsers());
    onShowToast('Thành công', `Đã thêm tài khoản "${created.name}"`, 'success');
    setShowAddModal(false);
    setNewUser({
      name: '',
      email: '',
      role: 'Doctor',
      department: 'Khoa Cấp Cứu',
      telegramChatId: '987654321',
      phone: '0901234567'
    });
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'Admin': return 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300';
      case 'Manager': return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
      case 'Doctor': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
      case 'Staff': return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 shadow-xs text-center space-y-4 max-w-xl mx-auto my-12 animate-in fade-in duration-200">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Quyền truy cập bị hạn chế</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Tính năng Quản lý Người dùng & Phân quyền RBAC chỉ dành riêng cho tài khoản quản trị viên (<span className="font-bold text-purple-600">Admin</span>).
          <br />Vui lòng chuyển đổi vai trò sang Admin ở góc trên bên phải thanh Header để thử nghiệm.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header & Add User Button */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
            <Users className="w-5 h-5 text-blue-600 mr-2" /> Quản lý Người dùng & Phân quyền RBAC
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Phân quyền chi tiết theo 4 cấp bậc: Admin, Manager (Trưởng khoa), Doctor (Bác sĩ), Staff (Nhân viên)</p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm người dùng</span>
          </button>
        )}
      </div>

      {/* Pending Reset Requests Alert Banner */}
      {pendingResetRequests.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 rounded-xl">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Có {pendingResetRequests.length} yêu cầu khôi phục mật khẩu đang chờ xử lý!
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
                Các người dùng: {pendingResetRequests.map(u => u.name).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Matrix */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Ma trận Phân quyền Hệ thống (Role Permission Matrix)</h4>
        
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3">Tính năng / Quyền</th>
                <th className="p-3 text-center">Admin</th>
                <th className="p-3 text-center">Manager (Trưởng khoa)</th>
                <th className="p-3 text-center">Doctor (Bác sĩ)</th>
                <th className="p-3 text-center">Staff (Nhân viên)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="p-3 font-semibold">Tạo & Chỉnh sửa Công việc</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Full</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Khoa</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Ca nhân</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Ca nhân</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Xóa & Hoàn thành hàng loạt</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Có</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Có</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Tải & Xóa Hồ sơ Google Drive</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Có</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Có</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Tải lên</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Tải lên</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Cấu hình Cổng Telegram & SMTP</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Full</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3.5">Họ tên & Email</th>
                <th className="p-3.5">Chức vụ / Khoa</th>
                <th className="p-3.5">Vai trò (Role)</th>
                <th className="p-3.5">Telegram Chat ID</th>
                <th className="p-3.5">Trạng thái</th>
                <th className="p-3.5 text-right">Quản lý Mật khẩu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="p-3.5 flex items-center space-x-3">
                    <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                        <span>{u.name}</span>
                        {u.resetRequested && (
                          <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded-md flex items-center space-x-0.5">
                            <KeyRound className="w-3 h-3 mr-0.5" />
                            <span>Cần Reset</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{u.email}</div>
                      {u.resetRequestNote && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 italic mt-0.5">
                          "{u.resetRequestNote}"
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="p-3.5 font-medium">{u.department}</td>

                  <td className="p-3.5">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md ${getRoleBadge(u.role)}`}>
                      {u.role}
                    </span>
                  </td>

                  <td className="p-3.5 font-mono text-slate-400">{u.telegramChatId || 'Chưa gán'}</td>

                  <td className="p-3.5">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded-md">
                      {u.status}
                    </span>
                  </td>

                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => {
                        setResetModalUser(u);
                        setNewAdminPassword('123456');
                      }}
                      className={`inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                        u.resetRequested 
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs animate-pulse' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{u.resetRequested ? 'Reset ngay' : 'Đổi MK'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD USER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
                <Users className="w-5 h-5 text-blue-600 mr-2" /> Thêm người dùng mới vào hệ thống
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: BS. Trần Thị Mai"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="mai.tran@hospital.vn"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Vai trò (Role) *</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="Admin">Admin (Quản trị toàn quyền)</option>
                    <option value="Manager">Manager (Trưởng khoa)</option>
                    <option value="Doctor">Doctor (Bác sĩ)</option>
                    <option value="Staff">Staff (Nhân viên)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Chức vụ / Khoa phòng</label>
                  <input
                    type="text"
                    value={newUser.department}
                    onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Telegram Chat ID (Nhận thông báo)</label>
                <input
                  type="text"
                  value={newUser.telegramChatId}
                  onChange={(e) => setNewUser({ ...newUser, telegramChatId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
                >
                  Tạo tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ADMIN RESET PASSWORD MODAL */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
                <KeyRound className="w-5 h-5 text-amber-500 mr-2" /> Đặt lại mật khẩu tài khoản
              </h3>
              <button onClick={() => setResetModalUser(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdminResetPassword} className="space-y-4 text-xs">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-100">{resetModalUser.name}</div>
                <div className="text-slate-400 font-mono">{resetModalUser.email}</div>
                {resetModalUser.resetRequestNote && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 pt-1 font-medium">
                    Ghi chú yêu cầu: "{resetModalUser.resetRequestNote}"
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Mật khẩu mới cho tài khoản *
                </label>
                <input
                  type="text"
                  required
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Khuyến nghị mật khẩu mặc định khởi tạo: <span className="font-mono text-blue-600 font-bold">123456</span>
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl"
                >
                  Xác nhận Reset Mật khẩu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

