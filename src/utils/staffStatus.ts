import { StaffProfile, User } from '../types/hospital';

const normalizeText = (value?: string | null): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
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
  user?: Pick<User, 'id' | 'role' | 'title'> | null,
  matchedProfile?: Pick<StaffProfile, 'role' | 'title'> | null
): boolean => {
  if (!user && !matchedProfile) return false;
  if (isStrictAdminUser(user)) return true;
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
  staff?: Pick<StaffProfile, 'currentStatus'> | null
): boolean => {
  if (!staff?.currentStatus) return false;
  if (
    staff.currentStatus === 'Đã nghỉ việc' ||
    staff.currentStatus === 'Nghỉ không lương'
  ) {
    return true;
  }
  const normalized = normalizeText(String(staff.currentStatus));
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
