import { StaffProfile, User } from '../types/hospital';

const normalizeText = (value?: string | null): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Only system Admins have permission to register leave on behalf of any employee in the department.
 */
export const isStrictAdminUser = (
  user?: Pick<User, 'id' | 'role'> | null
): boolean => Boolean(user && (user.role === 'Admin' || user.id === 'USR-ADMIN'));

/**
 * Only Admin and Department Head / Deputy Head ("Trưởng khoa" / "Phó khoa") can approve or reject leave requests.
 */
export const canApproveLeaveRequest = (
  user?: Pick<User, 'id' | 'role' | 'title' | 'managementLevel' | 'permissionOverrides'> | null,
  matchedProfile?: Pick<StaffProfile, 'role' | 'title' | 'managementLevel' | 'permissionOverrides'> | null
): boolean => {
  if (!user && !matchedProfile) return false;
  if (isStrictAdminUser(user)) return true;

  const overrideVal =
    user?.permissionOverrides?.canApproveLeave ??
    matchedProfile?.permissionOverrides?.canApproveLeave;
  if (typeof overrideVal === 'boolean') return overrideVal;

  const tier = user?.managementLevel || matchedProfile?.managementLevel;
  if (tier === 'admin' || tier === 'department_head') return true;
  if (tier === 'section_head' || tier === 'room_head' || tier === 'staff') return false;

  if (user?.role === 'Manager' || matchedProfile?.role === 'Manager') return true;

  const normalizedTitles = [
    normalizeText(user?.title),
    normalizeText(matchedProfile?.title)
  ];
  return normalizedTitles.some(
    t => t.includes('truong khoa') || t.includes('pho khoa')
  );
};

/**
 * Returns true if the staff profile is marked as resigned / contract ended / unpaid leave
 * ("Đã nghỉ việc" / "Đã kết thúc hợp đồng / Nghỉ việc" / "Nghỉ không lương" / "Tạm nghỉ không hưởng lương").
 */
export const isResignedOrEndedStaff = (
  staff?: (Pick<StaffProfile, 'currentStatus'> & { status?: string }) | null
): boolean => {
  const rawStatus = staff?.currentStatus || staff?.status;
  if (!rawStatus) return false;
  if (rawStatus === 'Đã nghỉ việc' || rawStatus === 'Nghỉ không lương') {
    return true;
  }
  const normalized = normalizeText(String(rawStatus));
  return (
    normalized.includes('nghi viec') ||
    normalized.includes('ket thuc hop dong') ||
    normalized.includes('thoi viec') ||
    normalized.includes('nghi huu') ||
    normalized.includes('nghi khong luong') ||
    normalized.includes('khong huong luong')
  );
};

export const isActiveEmployedStaff = (staff?: StaffProfile | null): boolean =>
  Boolean(staff) && !isResignedOrEndedStaff(staff);

export const filterActiveStaffProfiles = (profiles: StaffProfile[]): StaffProfile[] =>
  profiles.filter(isActiveEmployedStaff);

export interface LoginAccountCandidate {
  id: string;
  name: string;
  role?: string;
  status?: string;
}

/**
 * Returns true if a login account should be hidden from the login picker and blocked from signing in
 * because the user is marked Inactive or their matched StaffProfile indicates they resigned/stopped working.
 */
export const isUserAccountBlockedOrResigned = (
  user?: LoginAccountCandidate | null,
  staffProfiles: Array<Pick<StaffProfile, 'userId' | 'fullName' | 'currentStatus'> & { status?: string }> = []
): boolean => {
  if (!user) return true;
  if (user.id === 'USR-ADMIN' || user.role === 'Admin') return false;
  if (String(user.status || '').trim().toLowerCase() === 'inactive') return true;

  const userIdTrimmed = (user.id || '').trim();
  const matchedById = userIdTrimmed
    ? staffProfiles.find((s) => (s.userId || '').trim() === userIdTrimmed)
    : undefined;
  if (matchedById) {
    return isResignedOrEndedStaff(matchedById);
  }

  const userNameNorm = normalizeText(user.name);
  const matchedByName = userNameNorm
    ? staffProfiles.find((s) => normalizeText(s.fullName) === userNameNorm)
    : undefined;
  return matchedByName ? isResignedOrEndedStaff(matchedByName) : false;
};

export const filterActiveLoginUsers = <T extends LoginAccountCandidate>(
  users: T[],
  staffProfiles: Array<Pick<StaffProfile, 'userId' | 'fullName' | 'currentStatus'> & { status?: string }> = []
): T[] => users.filter((u) => !isUserAccountBlockedOrResigned(u, staffProfiles));

export interface InactiveStaffMatchers {
  ids: Set<string>;
  names: Set<string>;
}

export const getInactiveStaffMatchers = (
  profiles: StaffProfile[]
): InactiveStaffMatchers => {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const s of profiles) {
    if (isResignedOrEndedStaff(s)) {
      if (s.userId) ids.add(s.userId.trim());
      if (s.fullName) names.add(s.fullName.trim().toLowerCase());
    }
  }
  return { ids, names };
};

export const isStaffNameInactive = (
  name: string | undefined | null,
  inactiveNames: Set<string>
): boolean => {
  const trimmed = (name || '').trim().toLowerCase();
  return Boolean(trimmed) && inactiveNames.has(trimmed);
};

export const filterActiveStaffDisplayName = (
  name: string | undefined | null,
  inactiveNames: Set<string>
): string => {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return isStaffNameInactive(trimmed, inactiveNames) ? '' : trimmed;
};
