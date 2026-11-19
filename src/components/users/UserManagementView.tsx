import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Shield, Plus, Lock, X, KeyRound, Sliders, CheckCircle2,
  RotateCcw, Search, Building2, DoorOpen, ShieldCheck
} from 'lucide-react';
import {
  DepartmentUnit,
  ManagementTier,
  ParaclinicalRoom,
  StaffProfile,
  User,
  UserPermissionOverrides,
  UserRole,
} from '../../types/hospital';
import { storageService } from '../../services/storageService';
import {
  DEFAULT_TIER_PERMISSIONS,
  MANAGEMENT_TIER_META,
  MANAGEMENT_TIER_ORDER,
  PERMISSION_FIELD_LABELS,
  resolveEffectiveUserAccess,
  resolveUserManagementTier,
  findMatchedStaffProfile,
  normalizeRbacText,
} from '../../utils/rbac';

interface UserManagementViewProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ onShowToast }) => {
  const [users, setUsers] = useState<User[]>(storageService.getUsers());
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>(storageService.getStaffProfiles());
  const [departments, setDepartments] = useState<DepartmentUnit[]>(storageService.getDepartments());
  const [rooms, setRooms] = useState<ParaclinicalRoom[]>(storageService.getRooms());
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());

  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | ManagementTier>('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [newAdminPassword, setNewAdminPassword] = useState('123456');

  // Edit RBAC modal state
  const [editingRbacUser, setEditingRbacUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('Staff');
  const [editTitle, setEditTitle] = useState('');
  const [editTier, setEditTier] = useState<ManagementTier>('staff');
  const [editPrimaryDept, setEditPrimaryDept] = useState('');
  const [editPrimaryRoom, setEditPrimaryRoom] = useState('');
  const [editManagedDepts, setEditManagedDepts] = useState<string[]>([]);
  const [editManagedRooms, setEditManagedRooms] = useState<string[]>([]);
  const [editOverrides, setEditOverrides] = useState<UserPermissionOverrides>({});

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'Doctor' as UserRole,
    managementLevel: 'staff' as ManagementTier,
    title: 'Bác sĩ',
    department: departments[0]?.name || 'Chẩn đoán hình ảnh',
    room: '',
    telegramChatId: '',
    phone: ''
  });

  useEffect(() => {
    const reload = () => {
      setUsers(storageService.getUsers());
      setStaffProfiles(storageService.getStaffProfiles());
      setDepartments(storageService.getDepartments());
      setRooms(storageService.getRooms());
      setCurrentUser(storageService.getCurrentUser());
    };
    const unsubscribe = storageService.subscribe(reload);
    return () => unsubscribe();
  }, []);

  const actorAccess = useMemo(
    () => resolveEffectiveUserAccess(currentUser, staffProfiles, departments, rooms),
    [currentUser, staffProfiles, departments, rooms]
  );

  const canConfigureRbac = actorAccess.isSystemAdmin || actorAccess.permissions.canConfigureRBAC;
  const pendingResetRequests = users.filter(u => u.resetRequested);

  const enrichedUsers = useMemo(() => {
    return users.map(u => {
      const matchedProfile = findMatchedStaffProfile(u, staffProfiles);
      const access = resolveEffectiveUserAccess(u, staffProfiles, departments, rooms);
      const overrideKeys = Object.keys(u.permissionOverrides || {}).filter(
        k => (u.permissionOverrides as Record<string, unknown>)?.[k] !== undefined
      );
      return {
        user: u,
        matchedProfile,
        access,
        overrideCount: overrideKeys.length,
      };
    });
  }, [users, staffProfiles, departments, rooms]);

  const filteredUsers = useMemo(() => {
    const q = normalizeRbacText(searchTerm);
    return enrichedUsers.filter(({ user, access }) => {
      if (tierFilter !== 'all' && access.tier !== tierFilter) return false;
      if (!q) return true;
      return (
        normalizeRbacText(user.name).includes(q) ||
        normalizeRbacText(user.email).includes(q) ||
        normalizeRbacText(user.department).includes(q) ||
        normalizeRbacText(user.title).includes(q) ||
        normalizeRbacText(access.scopeLabel).includes(q)
      );
    });
  }, [enrichedUsers, searchTerm, tierFilter]);

  const handleAdminResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    if (resetModalUser.role === 'Admin' && !actorAccess.isSystemAdmin) {
      onShowToast('Từ chối truy cập', 'Chỉ Quản trị viên hệ thống (Admin) mới có quyền đổi mật khẩu tài khoản Admin.', 'error');
      return;
    }
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
    if (!canConfigureRbac) {
      onShowToast('Từ chối truy cập', 'Bạn không có quyền tạo tài khoản mới.', 'error');
      return;
    }
    if ((newUser.role === 'Admin' || newUser.managementLevel === 'admin') && !actorAccess.isSystemAdmin) {
      onShowToast('Từ chối truy cập', 'Chỉ Admin mới có thể cấp quyền Quản trị viên (Admin).', 'error');
      return;
    }
    if (!newUser.name.trim() || !newUser.email.trim()) {
      onShowToast('Lỗi', 'Vui lòng nhập họ tên và email người dùng.', 'error');
      return;
    }

    const tier = actorAccess.isSystemAdmin
      ? newUser.managementLevel
      : newUser.managementLevel === 'admin'
        ? 'staff'
        : newUser.managementLevel;

    const created: User = {
      id: `USR-${Math.floor(1000 + Math.random() * 9000)}`,
      name: newUser.name.trim(),
      email: newUser.email.trim(),
      role: tier === 'admin' ? 'Admin' : newUser.role,
      title: newUser.title.trim() || MANAGEMENT_TIER_META[tier].shortLabel,
      department: newUser.department || 'Khoa Cận Lâm Sàng',
      room: newUser.room || undefined,
      avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
      telegramChatId: newUser.telegramChatId.trim() || undefined,
      phone: newUser.phone.trim() || undefined,
      status: 'Active',
      managementLevel: tier,
      managedDepartments: tier === 'section_head' && newUser.department ? [newUser.department] : undefined,
      managedRooms: tier === 'room_head' && newUser.room ? [newUser.room] : undefined,
    };

    storageService.saveUser(created);
    onShowToast('Thành công', `Đã thêm tài khoản "${created.name}" (${MANAGEMENT_TIER_META[tier].shortLabel})`, 'success');
    setShowAddModal(false);
    setNewUser({
      name: '',
      email: '',
      role: 'Doctor',
      managementLevel: 'staff',
      title: 'Bác sĩ',
      department: departments[0]?.name || 'Chẩn đoán hình ảnh',
      room: '',
      telegramChatId: '',
      phone: ''
    });
  };

  const openEditRbacModal = (targetUser: User) => {
    const matchedProfile = findMatchedStaffProfile(targetUser, staffProfiles);
    const resolvedAccess = resolveEffectiveUserAccess(targetUser, staffProfiles, departments, rooms);
    const derivedTier = resolveUserManagementTier(targetUser, matchedProfile, departments, rooms);

    if (derivedTier === 'admin' && !actorAccess.isSystemAdmin) {
      onShowToast('Từ chối truy cập', 'Không thể chỉnh sửa quyền của tài khoản Quản trị viên (Admin).', 'warning');
      return;
    }

    setEditingRbacUser(targetUser);
    setEditTier(derivedTier);
    setEditRole(targetUser.role);
    setEditTitle(targetUser.title || matchedProfile?.title || MANAGEMENT_TIER_META[derivedTier].shortLabel);
    setEditPrimaryDept(matchedProfile?.departmentSection || targetUser.department || '');
    setEditPrimaryRoom(matchedProfile?.room || targetUser.room || '');
    setEditManagedDepts(
      targetUser.managedDepartments && targetUser.managedDepartments.length > 0
        ? [...targetUser.managedDepartments]
        : derivedTier === 'section_head'
          ? [...resolvedAccess.allowedDepartments]
          : []
    );
    setEditManagedRooms(
      targetUser.managedRooms && targetUser.managedRooms.length > 0
        ? [...targetUser.managedRooms]
        : derivedTier === 'room_head'
          ? [...resolvedAccess.allowedRooms]
          : []
    );
    setEditOverrides({
      ...(matchedProfile?.permissionOverrides || {}),
      ...(targetUser.permissionOverrides || {}),
    });
  };

  const handleSelectTierInModal = (nextTier: ManagementTier) => {
    if (nextTier === 'admin' && !actorAccess.isSystemAdmin) {
      onShowToast('Hạn chế quyền', 'Chỉ Quản trị viên (Admin) mới có quyền nâng cấp tài khoản lên Admin.', 'warning');
      return;
    }
    setEditTier(nextTier);
    if (nextTier === 'admin') {
      setEditRole('Admin');
    } else if (nextTier === 'department_head' || nextTier === 'section_head' || nextTier === 'room_head') {
      setEditRole('Manager');
    } else if (editRole === 'Admin' || editRole === 'Manager') {
      setEditRole('Staff');
    }

    if (nextTier === 'section_head' && editManagedDepts.length === 0 && editPrimaryDept) {
      const matched = departments.find(d => normalizeRbacText(d.name) === normalizeRbacText(editPrimaryDept));
      if (matched) setEditManagedDepts([matched.name]);
    }
    if (nextTier === 'room_head' && editManagedRooms.length === 0 && editPrimaryRoom) {
      setEditManagedRooms([editPrimaryRoom]);
    }
  };

  const toggleManagedDept = (deptName: string) => {
    setEditManagedDepts(prev =>
      prev.includes(deptName) ? prev.filter(d => d !== deptName) : [...prev, deptName]
    );
  };

  const toggleManagedRoom = (roomName: string) => {
    setEditManagedRooms(prev =>
      prev.includes(roomName) ? prev.filter(r => r !== roomName) : [...prev, roomName]
    );
  };

  const getEffectivePreviewValue = (key: keyof UserPermissionOverrides): boolean => {
    if (editTier === 'admin') return true;
    const explicit = editOverrides[key];
    if (typeof explicit === 'boolean') return explicit;
    return DEFAULT_TIER_PERMISSIONS[editTier][key];
  };

  const handleToggleOverride = (key: keyof UserPermissionOverrides) => {
    if (editTier === 'admin') return;
    const fieldMeta = PERMISSION_FIELD_LABELS.find(f => f.key === key);
    if (fieldMeta?.adminOnly && !actorAccess.isSystemAdmin) {
      onShowToast('Hạn chế quyền', 'Quyền đặc biệt này chỉ do Quản trị viên (Admin) cấp.', 'warning');
      return;
    }
    const currentEffective = getEffectivePreviewValue(key);
    const nextVal = !currentEffective;
    const defaultVal = DEFAULT_TIER_PERMISSIONS[editTier][key];
    setEditOverrides(prev => {
      const copy = { ...prev };
      if (nextVal === defaultVal) {
        delete copy[key];
      } else {
        copy[key] = nextVal;
      }
      return copy;
    });
  };

  const handleSaveRbacChanges = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRbacUser) return;
    if ((editTier === 'admin' || editRole === 'Admin') && !actorAccess.isSystemAdmin) {
      onShowToast('Từ chối truy cập', 'Chỉ Admin mới có quyền gán vai trò Admin.', 'error');
      return;
    }

    const cleanOverrides: UserPermissionOverrides = { ...editOverrides };
    if (!actorAccess.isSystemAdmin) {
      const existingOrig = editingRbacUser.permissionOverrides || {};
      cleanOverrides.allowCrossScopeEdit = existingOrig.allowCrossScopeEdit;
      cleanOverrides.canConfigureRBAC = existingOrig.canConfigureRBAC;
    }
    // Strip undefined keys
    (Object.keys(cleanOverrides) as Array<keyof UserPermissionOverrides>).forEach(k => {
      if (cleanOverrides[k] === undefined) {
        delete cleanOverrides[k];
      }
    });

    const updatedUser: User = {
      ...editingRbacUser,
      role: editTier === 'admin' ? 'Admin' : editRole,
      title: editTitle.trim() || MANAGEMENT_TIER_META[editTier].shortLabel,
      department: editPrimaryDept || editingRbacUser.department,
      room: editPrimaryRoom || editingRbacUser.room,
      managementLevel: editTier,
      managedDepartments: editTier === 'section_head' ? editManagedDepts : [],
      managedRooms: editTier === 'room_head' ? editManagedRooms : [],
      permissionOverrides: Object.keys(cleanOverrides).length > 0 ? cleanOverrides : undefined,
    };

    storageService.saveUser(updatedUser);
    onShowToast(
      'Cập nhật phân quyền thành công',
      `Đã lưu cấp bậc "${MANAGEMENT_TIER_META[editTier].shortLabel}" và phạm vi cho ${updatedUser.name}.`,
      'success'
    );
    setEditingRbacUser(null);
  };

  if (!canConfigureRbac) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 shadow-xs text-center space-y-4 max-w-xl mx-auto my-12 animate-in fade-in duration-200">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Quyền truy cập bị hạn chế</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Chức năng điều chỉnh phân quyền &amp; phạm vi nhân sự chỉ dành cho tài khoản <span className="font-bold text-purple-600">Admin</span> hoặc quản lý được Admin ủy quyền phân quyền RBAC.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
            <ShieldCheck className="w-5 h-5 text-blue-600 mr-2" /> Phân Quyền Hệ Thống &amp; Phạm Vi Quản Lý (RBAC)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Thiết lập cấp quản lý (Admin, Trưởng khoa, Trưởng bộ phận, Trưởng phòng, Nhân viên), phạm vi Bộ phận/Phòng phụ trách và quyền chỉnh sửa chi tiết cho từng nhân viên.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm tài khoản</span>
        </button>
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
                Các tài khoản: {pendingResetRequests.map(u => u.name).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5-Tier Role Permission Matrix */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Ma Trận Phân Quyền Mặc Định Theo 5 Cấp Quản Lý
          </h4>
          <span className="text-[11px] text-slate-500">
            Có thể tùy chỉnh bật/tắt từng quyền cụ thể cho từng nhân viên bên dưới
          </span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3 border-b border-slate-200 dark:border-slate-700">Nhóm quyền / Phạm vi</th>
                <th className="p-3 text-center border-b border-slate-200 dark:border-slate-700 text-purple-700 dark:text-purple-300">Admin</th>
                <th className="p-3 text-center border-b border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-300">Trưởng khoa</th>
                <th className="p-3 text-center border-b border-slate-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300">Trưởng bộ phận</th>
                <th className="p-3 text-center border-b border-slate-200 dark:border-slate-700 text-teal-700 dark:text-teal-300">Trưởng phòng</th>
                <th className="p-3 text-center border-b border-slate-200 dark:border-slate-700">Nhân viên / BS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="p-3 font-semibold">Phạm vi dữ liệu quản lý</td>
                <td className="p-3 text-center font-bold text-purple-600">Toàn hệ thống</td>
                <td className="p-3 text-center font-bold text-blue-600">Toàn Khoa CLS</td>
                <td className="p-3 text-center font-bold text-indigo-600">Bộ phận phụ trách</td>
                <td className="p-3 text-center font-bold text-teal-600">Phòng phụ trách</td>
                <td className="p-3 text-center text-slate-500">Chỉ xem / Cá nhân</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Quản lý Hồ sơ &amp; Chứng chỉ Nhân sự</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Full (kể cả Admin)</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Toàn Khoa (trừ Admin)</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Trong Bộ phận</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Sửa trong Phòng</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Quản lý Máy móc, Bảo trì &amp; LOTO</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Full</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Toàn Khoa</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Trong Bộ phận</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Trong Phòng</td>
                <td className="p-3 text-center text-amber-600 font-bold">Chỉ báo sự cố</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Điều phối Nhân sự / Thiết bị tại Phòng</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Toàn Khoa</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Toàn Khoa</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Bộ phận</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Phòng phụ trách</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Phân quyền RBAC &amp; Cấu hình Hệ thống</td>
                <td className="p-3 text-center text-emerald-600 font-bold">✓ Toàn quyền</td>
                <td className="p-3 text-center text-amber-600 font-bold">Khi được ủy quyền</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
                <td className="p-3 text-center text-rose-500 font-bold">✗ Khóa</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên, email, chức danh, bộ phận hoặc phòng..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTierFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              tierFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Tất cả ({users.length})
          </button>
          {MANAGEMENT_TIER_ORDER.map(t => {
            const count = enrichedUsers.filter(item => item.access.tier === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTierFilter(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  tierFilter === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {MANAGEMENT_TIER_META[t].shortLabel} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3.5">Cán bộ &amp; Tài khoản</th>
                <th className="p-3.5">Cấp Quản Lý &amp; Chức Danh</th>
                <th className="p-3.5">Phạm Vi Quản Lý Thực Tế</th>
                <th className="p-3.5">Quyền Tùy Chỉnh</th>
                <th className="p-3.5">Trạng thái</th>
                <th className="p-3.5 text-right">Thao Tác Phân Quyền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map(({ user: u, access, overrideCount }) => {
                const tierMeta = MANAGEMENT_TIER_META[access.tier];
                const isTargetLockedForActor = access.isSystemAdmin && !actorAccess.isSystemAdmin;

                return (
                  <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-3.5">
                      <div className="flex items-center space-x-3">
                        <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                            <span>{u.name}</span>
                            {u.resetRequested && (
                              <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded-md inline-flex items-center gap-0.5">
                                <KeyRound className="w-3 h-3" />
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
                      </div>
                    </td>

                    <td className="p-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md border ${tierMeta.badgeClass}`}>
                          {tierMeta.shortLabel}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {u.title || u.role} • Role: <strong className="font-semibold">{u.role}</strong>
                        </span>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {access.scopeLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {u.department}{u.room ? ` • ${u.room}` : ''}
                      </div>
                    </td>

                    <td className="p-3.5">
                      {overrideCount > 0 ? (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-md text-[11px] font-bold">
                          Tùy chỉnh {overrideCount} quyền
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Theo chuẩn cấp bậc</span>
                      )}
                    </td>

                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 font-bold rounded-md text-[11px] ${
                        u.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {u.status}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isTargetLockedForActor}
                          onClick={() => openEditRbacModal(u)}
                          title={isTargetLockedForActor ? 'Chỉ Admin mới có thể sửa tài khoản Admin' : 'Điều chỉnh cấp bậc, phạm vi & quyền chỉnh sửa'}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            isTargetLockedForActor
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed dark:bg-slate-800 dark:border-slate-700'
                              : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800 cursor-pointer'
                          }`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Sửa quyền &amp; Phạm vi</span>
                        </button>

                        <button
                          type="button"
                          disabled={isTargetLockedForActor}
                          onClick={() => {
                            setResetModalUser(u);
                            setNewAdminPassword('123456');
                          }}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            isTargetLockedForActor
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800'
                              : u.resetRequested
                                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs animate-pulse cursor-pointer'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer'
                          }`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>{u.resetRequested ? 'Reset ngay' : 'Đổi MK'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT RBAC & SCOPE MODAL */}
      {editingRbacUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <img src={editingRbacUser.avatar} alt={editingRbacUser.name} className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <span>Điều chỉnh Quyền &amp; Phạm Vi: {editingRbacUser.name}</span>
                  </h3>
                  <p className="text-xs text-slate-500">{editingRbacUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRbacUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRbacChanges} className="p-5 overflow-y-auto space-y-5 text-xs flex-1">
              {/* 1. Cấp quản lý (5 Tiers) */}
              <div className="space-y-2.5">
                <label className="block font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                  1. Chọn Cấp Bậc Quản Lý &amp; Phạm Vi Quyền Hạn
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {MANAGEMENT_TIER_ORDER.map(tierKey => {
                    const meta = MANAGEMENT_TIER_META[tierKey];
                    const disabled = tierKey === 'admin' && !actorAccess.isSystemAdmin;
                    const active = editTier === tierKey;
                    return (
                      <button
                        key={tierKey}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleSelectTierInModal(tierKey)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          disabled
                            ? 'opacity-45 cursor-not-allowed bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-800'
                            : active
                              ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 ring-2 ring-blue-500/20 cursor-pointer'
                              : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-800/40 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${meta.badgeClass}`}>
                            {meta.shortLabel}
                          </span>
                          {active && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                        </div>
                        <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 mt-1.5">
                          {meta.scopeSummary}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {meta.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Thông tin chức danh & đơn vị gốc */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Chức danh</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder="VD: Trưởng bộ phận, KTV trưởng..."
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Vai trò tài khoản (Role)</label>
                  <select
                    value={editRole}
                    disabled={editTier === 'admin'}
                    onChange={e => setEditRole(e.target.value as UserRole)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {actorAccess.isSystemAdmin && <option value="Admin">Admin</option>}
                    <option value="Manager">Manager</option>
                    <option value="Doctor">Doctor</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bộ phận trực thuộc</label>
                  <select
                    value={editPrimaryDept}
                    onChange={e => setEditPrimaryDept(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">-- Chọn bộ phận --</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Phòng làm việc chính</label>
                  <select
                    value={editPrimaryRoom}
                    onChange={e => setEditPrimaryRoom(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">-- Chọn phòng --</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.name}>{r.name} ({r.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. Phạm vi Bộ phận / Phòng được phép quản lý */}
              {editTier === 'section_head' && (
                <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-900/60 space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-200">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span>Phạm vi Bộ phận được quyền quản lý (Nhân sự, Phòng &amp; Thiết bị thuộc Bộ phận):</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {departments.map(dept => {
                      const checked = editManagedDepts.includes(dept.name);
                      return (
                        <label
                          key={dept.id}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer transition-all ${
                            checked
                              ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggleManagedDept(dept.name)}
                          />
                          <span>{dept.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {editTier === 'room_head' && (
                <div className="p-4 rounded-xl bg-teal-50/60 dark:bg-teal-950/25 border border-teal-200 dark:border-teal-900/60 space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-teal-900 dark:text-teal-200">
                    <DoorOpen className="w-4 h-4 text-teal-600" />
                    <span>Phạm vi Phòng chuyên môn được quyền quản lý (Chỉ quản lý nhân viên &amp; thiết bị trong các phòng chọn):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {rooms.map(room => {
                      const checked = editManagedRooms.includes(room.name);
                      return (
                        <label
                          key={room.id}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                            checked
                              ? 'bg-teal-600 text-white border-teal-600 font-semibold'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <div className="truncate">
                            <span className="font-mono text-[10px] mr-1.5 opacity-80">[{room.code}]</span>
                            <span>{room.name}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleManagedRoom(room.name)}
                            className="accent-white"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Điều chỉnh chi tiết quyền chỉnh sửa */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                    2. Điều Chỉnh Quyền Chỉnh Sửa Chi Tiết Cho Nhân Viên Này
                  </label>
                  {editTier !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => setEditOverrides({})}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-[11px] cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Khôi phục mặc định cấp bậc</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_FIELD_LABELS.map(field => {
                    const effective = getEffectivePreviewValue(field.key);
                    const isOverridden = editOverrides[field.key] !== undefined;
                    const disabled =
                      editTier === 'admin' || (Boolean(field.adminOnly) && !actorAccess.isSystemAdmin);

                    return (
                      <label
                        key={field.key}
                        className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all ${
                          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          effective
                            ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50'
                            : 'bg-slate-50/70 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700/70'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="truncate">{field.label}</span>
                          </div>
                          {isOverridden && (
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                              Đã điều chỉnh riêng
                            </span>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={effective}
                          onChange={() => handleToggleOverride(field.key)}
                          className="w-4 h-4 accent-blue-600 shrink-0"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingRbacUser(null)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Lưu Quyền &amp; Phạm Vi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
                <Users className="w-5 h-5 text-blue-600 mr-2" /> Thêm người dùng mới vào hệ thống
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
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
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Cấp quản lý *</label>
                  <select
                    value={newUser.managementLevel}
                    onChange={(e) => {
                      const tier = e.target.value as ManagementTier;
                      setNewUser({
                        ...newUser,
                        managementLevel: tier,
                        role: MANAGEMENT_TIER_META[tier].defaultRole,
                        title: MANAGEMENT_TIER_META[tier].shortLabel,
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {MANAGEMENT_TIER_ORDER.filter(t => actorAccess.isSystemAdmin || t !== 'admin').map(t => (
                      <option key={t} value={t}>{MANAGEMENT_TIER_META[t].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Bộ phận</label>
                  <select
                    value={newUser.department}
                    onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Phòng phụ trách / làm việc</label>
                  <select
                    value={newUser.room}
                    onChange={(e) => setNewUser({ ...newUser, room: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="">-- Chưa phân phòng --</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Telegram Chat ID</label>
                  <input
                    type="text"
                    value={newUser.telegramChatId}
                    onChange={(e) => setNewUser({ ...newUser, telegramChatId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl cursor-pointer"
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
              <button onClick={() => setResetModalUser(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
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
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl cursor-pointer"
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
