import {
  DepartmentUnit,
  EquipmentItem,
  ManagementTier,
  ParaclinicalRoom,
  StaffProfile,
  User,
  UserPermissionOverrides,
  UserRole,
} from '../types/hospital';
import { resolveRoomDisplay } from './roomDisplay';

export type ResolvedPermissions = Required<UserPermissionOverrides>;

export interface ManagementTierMeta {
  tier: ManagementTier;
  label: string;
  shortLabel: string;
  defaultRole: UserRole;
  description: string;
  scopeSummary: string;
  badgeClass: string;
}

export const MANAGEMENT_TIER_ORDER: ManagementTier[] = [
  'admin',
  'department_head',
  'section_head',
  'room_head',
  'staff',
];

export const MANAGEMENT_TIER_META: Record<ManagementTier, ManagementTierMeta> = {
  admin: {
    tier: 'admin',
    label: 'Quản trị viên (Admin)',
    shortLabel: 'Admin',
    defaultRole: 'Admin',
    description: 'Toàn quyền quản trị hệ thống, cấu hình kỹ thuật, phân quyền và quản lý tất cả nhân sự, thiết bị, bộ phận/phòng.',
    scopeSummary: 'Toàn hệ thống',
    badgeClass: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
  },
  department_head: {
    tier: 'department_head',
    label: 'Trưởng khoa / Phó khoa',
    shortLabel: 'Trưởng khoa',
    defaultRole: 'Manager',
    description: 'Quản lý toàn bộ nhân viên, thiết bị, chứng chỉ, cơ cấu bộ phận/phòng và duyệt nghỉ phép trong Khoa Cận Lâm Sàng (không chỉnh sửa tài khoản Admin).',
    scopeSummary: 'Toàn Khoa Cận Lâm Sàng',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
  section_head: {
    tier: 'section_head',
    label: 'Trưởng bộ phận',
    shortLabel: 'Trưởng bộ phận',
    defaultRole: 'Manager',
    description: 'Chỉ quản lý nhân viên, phòng làm việc và thiết bị thuộc Bộ phận chuyên môn được phân công.',
    scopeSummary: 'Theo Bộ phận được giao',
    badgeClass: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  },
  room_head: {
    tier: 'room_head',
    label: 'Trưởng phòng / KTV trưởng',
    shortLabel: 'Trưởng phòng',
    defaultRole: 'Manager',
    description: 'Chỉ quản lý nhân viên, chứng chỉ, vận hành và thiết bị trong Phòng chuyên môn được phân công.',
    scopeSummary: 'Theo Phòng được giao',
    badgeClass: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
  },
  staff: {
    tier: 'staff',
    label: 'Nhân viên / Bác sĩ / KTV',
    shortLabel: 'Nhân viên',
    defaultRole: 'Staff',
    description: 'Xem danh mục nhân sự/thiết bị, đăng ký nghỉ cá nhân và báo cáo sự cố thiết bị; không tự ý sửa đổi hồ sơ nhân sự hay thiết bị.',
    scopeSummary: 'Cá nhân (Chỉ xem)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
};

export const PERMISSION_FIELD_LABELS: Array<{
  key: keyof UserPermissionOverrides;
  label: string;
  group: 'staff' | 'equipment' | 'system';
  adminOnly?: boolean;
}> = [
  { key: 'canCreateStaff', label: 'Thêm nhân viên mới / Nhập Excel', group: 'staff' },
  { key: 'canEditStaff', label: 'Chỉnh sửa hồ sơ nhân viên (trong phạm vi)', group: 'staff' },
  { key: 'canDeleteStaff', label: 'Xóa hồ sơ nhân viên (trong phạm vi)', group: 'staff' },
  { key: 'canManageCertificates', label: 'Thêm / Sửa / Xóa chứng chỉ hành nghề', group: 'staff' },
  { key: 'canApproveLeave', label: 'Phê duyệt / Từ chối đơn nghỉ phép', group: 'staff' },
  { key: 'canCreateEquipment', label: 'Thêm thiết bị mới vào hệ thống', group: 'equipment' },
  { key: 'canEditEquipment', label: 'Chỉnh sửa lý lịch, giấy phép, kiểm định máy', group: 'equipment' },
  { key: 'canDeleteEquipment', label: 'Xóa thiết bị khỏi hệ thống', group: 'equipment' },
  { key: 'canLogMaintenanceRepair', label: 'Ghi / Sửa / Xóa nhật ký bảo trì & xử lý sự cố', group: 'equipment' },
  { key: 'canReportEquipmentIssue', label: 'Báo cáo sự cố hỏng hóc thiết bị', group: 'equipment' },
  { key: 'canLockoutEquipment', label: 'Khóa an toàn khẩn cấp (LOTO) & Mở khóa máy', group: 'equipment' },
  { key: 'canManageRoomsDepartments', label: 'Quản lý nhân sự/máy tại Phòng & Bộ phận', group: 'system' },
  { key: 'allowCrossScopeEdit', label: 'Mở rộng quản lý toàn Khoa (vượt phạm vi bộ phận/phòng)', group: 'system', adminOnly: true },
  { key: 'canConfigureRBAC', label: 'Điều chỉnh phân quyền & quyền chỉnh sửa nhân viên', group: 'system', adminOnly: true },
];

export const DEFAULT_TIER_PERMISSIONS: Record<ManagementTier, ResolvedPermissions> = {
  admin: {
    canCreateStaff: true,
    canEditStaff: true,
    canDeleteStaff: true,
    canManageCertificates: true,
    canCreateEquipment: true,
    canEditEquipment: true,
    canDeleteEquipment: true,
    canLogMaintenanceRepair: true,
    canReportEquipmentIssue: true,
    canLockoutEquipment: true,
    canManageRoomsDepartments: true,
    canApproveLeave: true,
    canConfigureRBAC: true,
    allowCrossScopeEdit: true,
  },
  department_head: {
    canCreateStaff: true,
    canEditStaff: true,
    canDeleteStaff: true,
    canManageCertificates: true,
    canCreateEquipment: true,
    canEditEquipment: true,
    canDeleteEquipment: true,
    canLogMaintenanceRepair: true,
    canReportEquipmentIssue: true,
    canLockoutEquipment: true,
    canManageRoomsDepartments: true,
    canApproveLeave: true,
    canConfigureRBAC: false,
    allowCrossScopeEdit: true,
  },
  section_head: {
    canCreateStaff: true,
    canEditStaff: true,
    canDeleteStaff: false,
    canManageCertificates: true,
    canCreateEquipment: true,
    canEditEquipment: true,
    canDeleteEquipment: false,
    canLogMaintenanceRepair: true,
    canReportEquipmentIssue: true,
    canLockoutEquipment: true,
    canManageRoomsDepartments: true,
    canApproveLeave: false,
    canConfigureRBAC: false,
    allowCrossScopeEdit: false,
  },
  room_head: {
    canCreateStaff: false,
    canEditStaff: true,
    canDeleteStaff: false,
    canManageCertificates: true,
    canCreateEquipment: false,
    canEditEquipment: true,
    canDeleteEquipment: false,
    canLogMaintenanceRepair: true,
    canReportEquipmentIssue: true,
    canLockoutEquipment: true,
    canManageRoomsDepartments: true,
    canApproveLeave: false,
    canConfigureRBAC: false,
    allowCrossScopeEdit: false,
  },
  staff: {
    canCreateStaff: false,
    canEditStaff: false,
    canDeleteStaff: false,
    canManageCertificates: false,
    canCreateEquipment: false,
    canEditEquipment: false,
    canDeleteEquipment: false,
    canLogMaintenanceRepair: false,
    canReportEquipmentIssue: true,
    canLockoutEquipment: false,
    canManageRoomsDepartments: false,
    canApproveLeave: false,
    canConfigureRBAC: false,
    allowCrossScopeEdit: false,
  },
};

export interface EffectiveUserAccess {
  userId: string;
  userName: string;
  tier: ManagementTier;
  tierLabel: string;
  shortTierLabel: string;
  scopeLabel: string;
  isSystemAdmin: boolean;
  isDepartmentWide: boolean;
  allowedDepartments: string[];
  allowedRooms: string[];
  permissions: ResolvedPermissions;
}

export const normalizeRbacText = (value?: string | null): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeDeptKey = (value?: string | null): string => {
  let norm = normalizeRbacText(value);
  if (!norm) return '';
  norm = norm.replace(/^khoa can lam sang\s*[-–/:]\s*/i, '').trim();
  norm = norm.replace(/^bo phan\s+/i, '').trim();
  return norm;
};

export const matchesDepartmentName = (a?: string | null, b?: string | null): boolean => {
  const rawA = normalizeRbacText(a);
  const rawB = normalizeRbacText(b);
  if (!rawA || !rawB) return false;
  if (rawA === rawB) return true;
  const keyA = normalizeDeptKey(a);
  const keyB = normalizeDeptKey(b);
  if (!keyA || !keyB) return false;
  if (
    keyA === 'chua phan bo phan' ||
    keyB === 'chua phan bo phan' ||
    keyA === 'khoa can lam sang' ||
    keyB === 'khoa can lam sang'
  ) {
    return keyA === keyB;
  }
  return keyA === keyB;
};

const isUnassignedRoomLabel = (val?: string | null): boolean => {
  const norm = normalizeRbacText(val);
  return (
    !norm ||
    norm === 'chua phan phong' ||
    norm === 'kho thiet bi / chua phan phong' ||
    norm === 'chua phan cong'
  );
};

export const matchesRoomName = (
  roomValA?: string | null,
  roomValB?: string | null,
  rooms: ParaclinicalRoom[] = []
): boolean => {
  if (isUnassignedRoomLabel(roomValA) || isUnassignedRoomLabel(roomValB)) return false;
  const normA = normalizeRbacText(roomValA);
  const normB = normalizeRbacText(roomValB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  if (rooms.length > 0) {
    const resolvedA = resolveRoomDisplay(roomValA || '', rooms);
    const resolvedB = resolveRoomDisplay(roomValB || '', rooms);
    if (resolvedA.matchedRoom && resolvedB.matchedRoom) {
      return resolvedA.matchedRoom.id === resolvedB.matchedRoom.id;
    }
    if (resolvedA.name && resolvedB.name && normalizeRbacText(resolvedA.name) === normalizeRbacText(resolvedB.name)) {
      return true;
    }
    if (resolvedA.code && resolvedB.code && normalizeRbacText(resolvedA.code) === normalizeRbacText(resolvedB.code)) {
      return true;
    }
  }
  return false;
};

export const isAdminIdentity = (
  user?: Pick<User, 'id' | 'role' | 'title' | 'managementLevel'> | null,
  profile?: Pick<StaffProfile, 'userId' | 'role' | 'title' | 'managementLevel'> | null
): boolean => {
  if (!user && !profile) return false;
  if (user?.id === 'USR-ADMIN' || profile?.userId === 'USR-ADMIN') return true;
  if (user?.role === 'Admin' || profile?.role === 'Admin') return true;
  if (user?.managementLevel === 'admin' || profile?.managementLevel === 'admin') return true;
  return false;
};

const isValidTier = (val?: string | null): val is ManagementTier =>
  val === 'admin' ||
  val === 'department_head' ||
  val === 'section_head' ||
  val === 'room_head' ||
  val === 'staff';

export const resolveUserManagementTier = (
  user?: Partial<User> | null,
  matchedProfile?: Partial<StaffProfile> | null,
  departments: DepartmentUnit[] = [],
  rooms: ParaclinicalRoom[] = []
): ManagementTier => {
  if (isAdminIdentity(user as User, matchedProfile as StaffProfile)) {
    return 'admin';
  }

  if (isValidTier(user?.managementLevel)) return user.managementLevel;
  if (isValidTier(matchedProfile?.managementLevel)) return matchedProfile.managementLevel;

  const titles = [normalizeRbacText(user?.title), normalizeRbacText(matchedProfile?.title)];
  const userNameNorm = normalizeRbacText(user?.name || matchedProfile?.fullName);

  // Explicit title hierarchy
  if (titles.some((t) => t.includes('truong khoa') || t.includes('pho khoa'))) {
    return 'department_head';
  }
  if (
    titles.some(
      (t) =>
        t.includes('truong bo phan') ||
        t.includes('pho bo phan') ||
        t.includes('phu trach bo phan')
    )
  ) {
    return 'section_head';
  }
  if (
    titles.some(
      (t) =>
        t.includes('truong phong') ||
        t.includes('pho phong') ||
        t.includes('ktv truong') ||
        t.includes('ky thuat vien truong') ||
        t.includes('dieu duong truong') ||
        t.includes('phu trach phong')
    )
  ) {
    return 'room_head';
  }

  // Structural leadership assignments in departments / rooms
  if (userNameNorm) {
    const managesDept = departments.some((d) => normalizeRbacText(d.managerName) === userNameNorm);
    if (managesDept) return 'section_head';

    const managesRoom = rooms.some(
      (r) =>
        normalizeRbacText(r.managerInCharge) === userNameNorm ||
        normalizeRbacText(r.deputyManager) === userNameNorm
    );
    if (managesRoom) return 'room_head';
  }

  // Legacy Manager role fallback -> department_head
  if (user?.role === 'Manager' || matchedProfile?.role === 'Manager') {
    return 'department_head';
  }

  return 'staff';
};

export const findMatchedStaffProfile = (
  user: Partial<User> | null | undefined,
  staffProfiles: StaffProfile[] = []
): StaffProfile | undefined => {
  if (!user) return undefined;
  const byId = user.id ? staffProfiles.find((s) => s.userId === user.id) : undefined;
  if (byId) return byId;
  const nameNorm = normalizeRbacText(user.name);
  if (!nameNorm) return undefined;
  return staffProfiles.find((s) => normalizeRbacText(s.fullName) === nameNorm);
};

export const resolveEffectiveUserAccess = (
  user: Partial<User> | null | undefined,
  staffProfiles: StaffProfile[] = [],
  departments: DepartmentUnit[] = [],
  rooms: ParaclinicalRoom[] = []
): EffectiveUserAccess => {
  if (!user) {
    return {
      userId: '',
      userName: '',
      tier: 'staff',
      tierLabel: MANAGEMENT_TIER_META.staff.label,
      shortTierLabel: MANAGEMENT_TIER_META.staff.shortLabel,
      scopeLabel: 'Chưa đăng nhập',
      isSystemAdmin: false,
      isDepartmentWide: false,
      allowedDepartments: [],
      allowedRooms: [],
      permissions: { ...DEFAULT_TIER_PERMISSIONS.staff },
    };
  }

  const matchedProfile = findMatchedStaffProfile(user, staffProfiles);
  const tier = resolveUserManagementTier(user, matchedProfile, departments, rooms);
  const isSystemAdmin = tier === 'admin';

  const basePermissions = DEFAULT_TIER_PERMISSIONS[tier];
  const mergedOverrides: UserPermissionOverrides = {
    ...(matchedProfile?.permissionOverrides || {}),
    ...(user.permissionOverrides || {}),
  };

  const permissions: ResolvedPermissions = isSystemAdmin
    ? { ...DEFAULT_TIER_PERMISSIONS.admin }
    : {
        canCreateStaff: mergedOverrides.canCreateStaff ?? basePermissions.canCreateStaff,
        canEditStaff: mergedOverrides.canEditStaff ?? basePermissions.canEditStaff,
        canDeleteStaff: mergedOverrides.canDeleteStaff ?? basePermissions.canDeleteStaff,
        canManageCertificates:
          mergedOverrides.canManageCertificates ?? basePermissions.canManageCertificates,
        canCreateEquipment:
          mergedOverrides.canCreateEquipment ?? basePermissions.canCreateEquipment,
        canEditEquipment: mergedOverrides.canEditEquipment ?? basePermissions.canEditEquipment,
        canDeleteEquipment:
          mergedOverrides.canDeleteEquipment ?? basePermissions.canDeleteEquipment,
        canLogMaintenanceRepair:
          mergedOverrides.canLogMaintenanceRepair ?? basePermissions.canLogMaintenanceRepair,
        canReportEquipmentIssue:
          mergedOverrides.canReportEquipmentIssue ?? basePermissions.canReportEquipmentIssue,
        canLockoutEquipment:
          mergedOverrides.canLockoutEquipment ?? basePermissions.canLockoutEquipment,
        canManageRoomsDepartments:
          mergedOverrides.canManageRoomsDepartments ?? basePermissions.canManageRoomsDepartments,
        canApproveLeave: mergedOverrides.canApproveLeave ?? basePermissions.canApproveLeave,
        canConfigureRBAC: mergedOverrides.canConfigureRBAC ?? basePermissions.canConfigureRBAC,
        allowCrossScopeEdit:
          mergedOverrides.allowCrossScopeEdit ?? basePermissions.allowCrossScopeEdit,
      };

  const isDepartmentWide =
    isSystemAdmin || tier === 'department_head' || Boolean(permissions.allowCrossScopeEdit);

  const userNameNorm = normalizeRbacText(user.name || matchedProfile?.fullName);
  const explicitDepts = Array.from(
    new Set([
      ...(user.managedDepartments || []),
      ...(matchedProfile?.managedDepartments || []),
    ].filter((d) => Boolean(d && d.trim())))
  );
  const explicitRooms = Array.from(
    new Set([
      ...(user.managedRooms || []),
      ...(matchedProfile?.managedRooms || []),
    ].filter((r) => Boolean(r && r.trim())))
  );

  let allowedDepartments: string[] = [];
  let allowedRooms: string[] = [];

  if (isDepartmentWide) {
    allowedDepartments = departments.map((d) => d.name);
    allowedRooms = rooms.map((r) => r.name);
  } else if (tier === 'section_head') {
    const deptSet = new Set<string>(explicitDepts);
    if (userNameNorm) {
      departments.forEach((d) => {
        if (normalizeRbacText(d.managerName) === userNameNorm) {
          deptSet.add(d.name);
        }
      });
    }
    const candidateDepts = [
      matchedProfile?.departmentSection,
      user.department,
    ].filter((v): v is string => Boolean(v && v.trim()));
    for (const cand of candidateDepts) {
      const matchedDept = departments.find((d) => matchesDepartmentName(d.name, cand));
      if (matchedDept) {
        deptSet.add(matchedDept.name);
      } else if (
        normalizeDeptKey(cand) &&
        normalizeDeptKey(cand) !== 'khoa can lam sang' &&
        normalizeDeptKey(cand) !== 'chua phan bo phan'
      ) {
        deptSet.add(cand.trim());
      }
    }
    allowedDepartments = Array.from(deptSet);

    const roomSet = new Set<string>(explicitRooms);
    rooms.forEach((r) => {
      if (allowedDepartments.some((ad) => matchesDepartmentName(ad, r.departmentSection))) {
        roomSet.add(r.name);
      }
      if (
        userNameNorm &&
        (normalizeRbacText(r.managerInCharge) === userNameNorm ||
          normalizeRbacText(r.deputyManager) === userNameNorm)
      ) {
        roomSet.add(r.name);
      }
    });
    allowedRooms = Array.from(roomSet);
  } else if (tier === 'room_head') {
    const roomSet = new Set<string>(explicitRooms);
    if (userNameNorm) {
      rooms.forEach((r) => {
        if (
          normalizeRbacText(r.managerInCharge) === userNameNorm ||
          normalizeRbacText(r.deputyManager) === userNameNorm
        ) {
          roomSet.add(r.name);
        }
      });
    }
    const ownRoomCandidates = [matchedProfile?.room, user.room].filter(
      (r): r is string => !isUnassignedRoomLabel(r)
    );
    for (const rCand of ownRoomCandidates) {
      const resolved = resolveRoomDisplay(rCand, rooms);
      roomSet.add(resolved.matchedRoom ? resolved.matchedRoom.name : rCand.trim());
    }
    allowedRooms = Array.from(roomSet);

    const deptSet = new Set<string>(explicitDepts);
    allowedRooms.forEach((roomName) => {
      const matched = rooms.find((r) => matchesRoomName(r.name, roomName, rooms));
      if (matched?.departmentSection) {
        deptSet.add(matched.departmentSection);
      }
    });
    allowedDepartments = Array.from(deptSet);
  } else {
    // Regular staff: track own assignment only (no edit grants unless explicit overrides)
    const ownRoom = matchedProfile?.room || user.room;
    if (!isUnassignedRoomLabel(ownRoom) && ownRoom) {
      allowedRooms = [ownRoom];
    }
    const ownDept = matchedProfile?.departmentSection || user.department;
    if (ownDept && normalizeDeptKey(ownDept) && normalizeDeptKey(ownDept) !== 'khoa can lam sang') {
      allowedDepartments = [ownDept];
    }
  }

  let scopeLabel = MANAGEMENT_TIER_META[tier].scopeSummary;
  if (isSystemAdmin) {
    scopeLabel = 'Toàn hệ thống (Admin)';
  } else if (isDepartmentWide) {
    scopeLabel = 'Toàn Khoa Cận Lâm Sàng';
  } else if (tier === 'section_head') {
    scopeLabel =
      allowedDepartments.length > 0
        ? `Bộ phận: ${allowedDepartments.join(', ')}`
        : 'Chưa gán Bộ phận quản lý';
  } else if (tier === 'room_head') {
    scopeLabel =
      allowedRooms.length > 0
        ? `Phòng: ${allowedRooms.join(', ')}`
        : 'Chưa gán Phòng quản lý';
  } else {
    scopeLabel = 'Chỉ xem / Cá nhân';
  }

  return {
    userId: user.id || matchedProfile?.userId || '',
    userName: user.name || matchedProfile?.fullName || '',
    tier,
    tierLabel: MANAGEMENT_TIER_META[tier].label,
    shortTierLabel: MANAGEMENT_TIER_META[tier].shortLabel,
    scopeLabel,
    isSystemAdmin,
    isDepartmentWide,
    allowedDepartments,
    allowedRooms,
    permissions,
  };
};

export const isDepartmentInAccessScope = (
  access: EffectiveUserAccess,
  departmentName?: string | null
): boolean => {
  if (access.isDepartmentWide) return true;
  if (!departmentName) return false;
  return access.allowedDepartments.some((ad) => matchesDepartmentName(ad, departmentName));
};

export const isRoomInAccessScope = (
  access: EffectiveUserAccess,
  roomNameOrCode?: string | null,
  rooms: ParaclinicalRoom[] = []
): boolean => {
  if (access.isDepartmentWide) return true;
  if (isUnassignedRoomLabel(roomNameOrCode)) return false;

  if (access.allowedRooms.some((ar) => matchesRoomName(ar, roomNameOrCode, rooms))) {
    return true;
  }

  // If actor is section_head, any room belonging to their allowedDepartments is also in scope
  if (access.tier === 'section_head' && rooms.length > 0) {
    const resolved = resolveRoomDisplay(roomNameOrCode || '', rooms);
    if (resolved.matchedRoom?.departmentSection) {
      return isDepartmentInAccessScope(access, resolved.matchedRoom.departmentSection);
    }
  }

  return false;
};

export const isStaffInAccessScope = (
  access: EffectiveUserAccess,
  targetStaff: Pick<StaffProfile, 'userId' | 'departmentSection' | 'room' | 'role' | 'managementLevel'>,
  rooms: ParaclinicalRoom[] = []
): boolean => {
  if (access.isDepartmentWide) return true;

  if (access.tier === 'section_head') {
    if (isDepartmentInAccessScope(access, targetStaff.departmentSection)) return true;
    if (targetStaff.room && isRoomInAccessScope(access, targetStaff.room, rooms)) return true;
    return false;
  }

  if (access.tier === 'room_head') {
    return isRoomInAccessScope(access, targetStaff.room, rooms);
  }

  return false;
};

export const canManageStaffTarget = (
  access: EffectiveUserAccess,
  action: 'create' | 'edit' | 'delete' | 'cert' | 'rbac',
  targetStaff?: Partial<StaffProfile> | Partial<User> | null,
  rooms: ParaclinicalRoom[] = []
): boolean => {
  if (!access.userId) return false;

  const targetId =
    (targetStaff as Partial<StaffProfile>)?.userId || (targetStaff as Partial<User>)?.id;
  const targetIsAdmin = targetStaff
    ? isAdminIdentity(targetStaff as User, targetStaff as StaffProfile)
    : false;

  // Only system Admins can edit, delete, or change RBAC on Admin accounts
  if (targetIsAdmin && !access.isSystemAdmin) {
    return false;
  }

  if (action === 'rbac') {
    return access.isSystemAdmin || access.permissions.canConfigureRBAC;
  }

  if (action === 'create') {
    if (!access.permissions.canCreateStaff) return false;
    if (!targetStaff || access.isDepartmentWide) return true;
    const dept =
      (targetStaff as Partial<StaffProfile>).departmentSection ??
      (targetStaff as Partial<User>).department;
    const room = targetStaff.room;
    if (access.tier === 'section_head') {
      return isDepartmentInAccessScope(access, dept) || isRoomInAccessScope(access, room, rooms);
    }
    if (access.tier === 'room_head') {
      return isRoomInAccessScope(access, room, rooms);
    }
    return false;
  }

  if (action === 'edit') {
    if (!access.permissions.canEditStaff) return false;
    if (!targetStaff) return access.isDepartmentWide || access.tier !== 'staff';
    if (access.isDepartmentWide) return true;
    return isStaffInAccessScope(
      access,
      {
        userId: targetId || '',
        departmentSection:
          (targetStaff as Partial<StaffProfile>).departmentSection ||
          (targetStaff as Partial<User>).department ||
          '',
        room: targetStaff.room,
        role: targetStaff.role || 'Staff',
        managementLevel: targetStaff.managementLevel,
      },
      rooms
    );
  }

  if (action === 'delete') {
    if (!access.permissions.canDeleteStaff) return false;
    if (targetId && targetId === access.userId) return false; // Never delete self
    if (!targetStaff) return access.isDepartmentWide || access.tier !== 'staff';
    if (access.isDepartmentWide) return true;
    return isStaffInAccessScope(
      access,
      {
        userId: targetId || '',
        departmentSection:
          (targetStaff as Partial<StaffProfile>).departmentSection ||
          (targetStaff as Partial<User>).department ||
          '',
        room: targetStaff.room,
        role: targetStaff.role || 'Staff',
        managementLevel: targetStaff.managementLevel,
      },
      rooms
    );
  }

  if (action === 'cert') {
    if (!access.permissions.canManageCertificates) return false;
    if (!targetStaff) return true;
    if (access.isDepartmentWide) return true;
    return isStaffInAccessScope(
      access,
      {
        userId: targetId || '',
        departmentSection:
          (targetStaff as Partial<StaffProfile>).departmentSection ||
          (targetStaff as Partial<User>).department ||
          '',
        room: targetStaff.room,
        role: targetStaff.role || 'Staff',
        managementLevel: targetStaff.managementLevel,
      },
      rooms
    );
  }

  return false;
};

export const resolveEquipmentDepartment = (
  eq: Pick<EquipmentItem, 'room' | 'category'>,
  rooms: ParaclinicalRoom[] = [],
  departments: DepartmentUnit[] = []
): string => {
  const resolved = resolveRoomDisplay(eq.room || '', rooms);
  if (resolved.matchedRoom?.departmentSection) {
    return resolved.matchedRoom.departmentSection;
  }

  if (eq.category) {
    const matchedDept = departments.find((d) => matchesDepartmentName(d.name, eq.category));
    if (matchedDept) return matchedDept.name;
    if (eq.category !== 'Khác') return eq.category;
  }
  return '';
};

export const isEquipmentInAccessScope = (
  access: EffectiveUserAccess,
  eq: Pick<EquipmentItem, 'room' | 'category'>,
  rooms: ParaclinicalRoom[] = [],
  departments: DepartmentUnit[] = []
): boolean => {
  if (access.isDepartmentWide) return true;

  if (access.tier === 'room_head') {
    return isRoomInAccessScope(access, eq.room, rooms);
  }

  if (access.tier === 'section_head') {
    if (isRoomInAccessScope(access, eq.room, rooms)) return true;
    const eqDept = resolveEquipmentDepartment(eq, rooms, departments);
    return isDepartmentInAccessScope(access, eqDept);
  }

  return false;
};

export const canManageEquipmentTarget = (
  access: EffectiveUserAccess,
  action:
    | 'create'
    | 'edit'
    | 'delete'
    | 'maintenance'
    | 'repair_manage'
    | 'report_issue'
    | 'lockout',
  targetEquipment?: Pick<EquipmentItem, 'room' | 'category'> | null,
  rooms: ParaclinicalRoom[] = [],
  departments: DepartmentUnit[] = []
): boolean => {
  if (!access.userId) return false;

  if (action === 'report_issue') {
    return (
      access.permissions.canReportEquipmentIssue || access.permissions.canLogMaintenanceRepair
    );
  }

  const hasBasePermission = (() => {
    switch (action) {
      case 'create':
        return access.permissions.canCreateEquipment;
      case 'edit':
        return access.permissions.canEditEquipment;
      case 'delete':
        return access.permissions.canDeleteEquipment;
      case 'maintenance':
      case 'repair_manage':
        return access.permissions.canLogMaintenanceRepair;
      case 'lockout':
        return access.permissions.canLockoutEquipment;
    }
  })();

  if (!hasBasePermission) return false;
  if (!targetEquipment) return access.isDepartmentWide || access.tier !== 'staff';
  if (access.isDepartmentWide) return true;

  return isEquipmentInAccessScope(access, targetEquipment, rooms, departments);
};

export const canManageRoomTarget = (
  access: EffectiveUserAccess,
  action:
    | 'manage_departments'
    | 'create_room'
    | 'edit_room'
    | 'delete_room'
    | 'manage_room_resources',
  target?: {
    departmentName?: string;
    room?: Pick<ParaclinicalRoom, 'id' | 'code' | 'name' | 'departmentSection'>;
  },
  rooms: ParaclinicalRoom[] = []
): boolean => {
  if (!access.userId || !access.permissions.canManageRoomsDepartments) return false;

  if (action === 'manage_departments') {
    return access.isDepartmentWide;
  }

  if (action === 'create_room') {
    if (access.isDepartmentWide) return true;
    if (access.tier !== 'section_head') return false;
    if (!target?.departmentName) return access.allowedDepartments.length > 0;
    return isDepartmentInAccessScope(access, target.departmentName);
  }

  if (action === 'edit_room' || action === 'delete_room') {
    if (access.isDepartmentWide) return true;
    if (access.tier !== 'section_head') return false;
    const deptName = target?.room?.departmentSection || target?.departmentName;
    return isDepartmentInAccessScope(access, deptName);
  }

  if (action === 'manage_room_resources') {
    if (access.isDepartmentWide) return true;
    if (target?.room) {
      return (
        isRoomInAccessScope(access, target.room.name, rooms) ||
        (access.tier === 'section_head' &&
          isDepartmentInAccessScope(access, target.room.departmentSection))
      );
    }
    if (target?.departmentName && access.tier === 'section_head') {
      return isDepartmentInAccessScope(access, target.departmentName);
    }
    return false;
  }

  return false;
};

export const filterSelectableDepartmentsForActor = (
  access: EffectiveUserAccess,
  departments: DepartmentUnit[]
): DepartmentUnit[] => {
  if (access.isDepartmentWide) return departments;
  return departments.filter((d) => isDepartmentInAccessScope(access, d.name));
};

export const filterSelectableRoomsForActor = (
  access: EffectiveUserAccess,
  rooms: ParaclinicalRoom[]
): ParaclinicalRoom[] => {
  if (access.isDepartmentWide) return rooms;
  return rooms.filter((r) => isRoomInAccessScope(access, r.name, rooms));
};
