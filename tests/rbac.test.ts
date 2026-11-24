import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  DepartmentUnit,
  EquipmentItem,
  ParaclinicalRoom,
  StaffProfile,
  User,
} from '../src/types/hospital';
import {
  canManageEquipmentTarget,
  canManageRoomTarget,
  canManageStaffTarget,
  filterSelectableDepartmentsForActor,
  filterSelectableRoomsForActor,
  matchesDepartmentName,
  matchesRoomName,
  normalizeRbacText,
  resolveEffectiveUserAccess,
  resolveUserManagementTier,
} from '../src/utils/rbac';

const sampleDepartments: DepartmentUnit[] = [
  {
    id: 'DEPT-XN',
    name: 'Bộ phận Xét nghiệm',
    code: 'XN',
    managerName: 'KTV. Trần Văn Bình',
    description: 'Xét nghiệm',
  },
  {
    id: 'DEPT-CDHA',
    name: 'Bộ phận Chẩn đoán hình ảnh',
    code: 'CDHA',
    managerName: 'BS. Lê Thị Hoa',
    description: 'CĐHA',
  },
];

const sampleRooms: ParaclinicalRoom[] = [
  {
    id: 'ROOM-SH',
    code: 'P.201',
    name: 'Phòng Sinh hóa - Miễn dịch',
    departmentSection: 'Bộ phận Xét nghiệm',
    floor: 'Tầng 2',
    status: 'Đang hoạt động',
    primaryEquipment: 'Cobas 8000',
    maxCapacityCasesPerDay: 200,
    currentDayCases: 0,
    utilizationRate: 70,
    managerInCharge: 'KTV. Phạm Thị Lan',
  },
  {
    id: 'ROOM-HH',
    code: 'P.202',
    name: 'Phòng Huyết học',
    departmentSection: 'Bộ phận Xét nghiệm',
    floor: 'Tầng 2',
    status: 'Đang hoạt động',
    primaryEquipment: 'Sysmex XN-1000',
    maxCapacityCasesPerDay: 150,
    currentDayCases: 0,
    utilizationRate: 60,
    managerInCharge: 'KTV. Trần Văn Bình',
  },
  {
    id: 'ROOM-XQ',
    code: 'P.101',
    name: 'Phòng X-Quang Kỹ thuật số',
    departmentSection: 'Bộ phận Chẩn đoán hình ảnh',
    floor: 'Tầng 1',
    status: 'Đang hoạt động',
    primaryEquipment: 'DR X-Ray',
    maxCapacityCasesPerDay: 100,
    currentDayCases: 0,
    utilizationRate: 65,
    managerInCharge: 'BS. Lê Thị Hoa',
  },
];

const adminUser: User = {
  id: 'USR-ADMIN',
  name: 'Quản trị Hệ thống',
  email: 'admin@cls.vn',
  role: 'Admin',
  department: 'Khoa Cận Lâm Sàng',
  title: 'Quản trị hệ thống',
  avatar: '',
  status: 'Active',
};

const deptHeadUser: User = {
  id: 'USR-TK',
  name: 'BS.CKII Nguyễn Minh Khoa',
  email: 'khoa@cls.vn',
  role: 'Manager',
  department: 'Khoa Cận Lâm Sàng',
  title: 'Trưởng khoa',
  avatar: '',
  status: 'Active',
};

const sectionHeadUser: User = {
  id: 'USR-TBP',
  name: 'KTV. Trần Văn Bình',
  email: 'binh@cls.vn',
  role: 'Manager',
  department: 'Xét nghiệm',
  title: 'Trưởng bộ phận',
  avatar: '',
  status: 'Active',
};

const roomHeadUser: User = {
  id: 'USR-TP',
  name: 'KTV. Phạm Thị Lan',
  email: 'lan@cls.vn',
  role: 'Staff',
  department: 'Bộ phận Xét nghiệm',
  room: 'P.201 - Phòng Sinh hóa - Miễn dịch',
  title: 'KTV trưởng',
  avatar: '',
  status: 'Active',
};

const staffUser: User = {
  id: 'USR-NV',
  name: 'KTV. Ngô Minh Tuấn',
  email: 'tuan@cls.vn',
  role: 'Staff',
  department: 'Bộ phận Xét nghiệm',
  room: 'Phòng Sinh hóa - Miễn dịch',
  title: 'Kỹ thuật viên',
  avatar: '',
  status: 'Active',
};

const staffProfiles: StaffProfile[] = [
  {
    userId: 'USR-ADMIN',
    fullName: 'Quản trị Hệ thống',
    title: 'Quản trị hệ thống',
    role: 'Admin',
    departmentSection: 'Khoa Cận Lâm Sàng',
    room: 'Khoa Cận Lâm Sàng',
    phone: '0900000001',
    email: 'admin@cls.vn',
    gender: 'Nam',
    dob: '1980-01-01',
    specialty: 'Quản trị',
    joinDate: '2015-01-01',
    experienceYears: 10,
    degrees: ['Thạc sĩ CNTT'],
    certificates: [],
    totalShiftsThisMonth: 0,
    leaveBalanceDays: 12,
    currentStatus: 'Đang làm việc',
    statusHistory: [],
  },
  {
    userId: 'USR-SH-STAFF',
    fullName: 'KTV. Đỗ Thị Thu',
    title: 'Kỹ thuật viên',
    role: 'Staff',
    departmentSection: 'Bộ phận Xét nghiệm',
    room: 'Phòng Sinh hóa - Miễn dịch',
    phone: '0900000002',
    email: 'thu@cls.vn',
    gender: 'Nữ',
    dob: '1995-02-02',
    specialty: 'Sinh hóa',
    joinDate: '2021-01-01',
    experienceYears: 5,
    degrees: ['Cử nhân Xét nghiệm'],
    certificates: [],
    totalShiftsThisMonth: 18,
    leaveBalanceDays: 10,
    currentStatus: 'Đang làm việc',
    statusHistory: [],
  },
  {
    userId: 'USR-XQ-STAFF',
    fullName: 'KTV. Lê Văn Cường',
    title: 'Kỹ thuật viên',
    role: 'Staff',
    departmentSection: 'Bộ phận Chẩn đoán hình ảnh',
    room: 'Phòng X-Quang Kỹ thuật số',
    phone: '0900000003',
    email: 'cuong@cls.vn',
    gender: 'Nam',
    dob: '1993-03-03',
    specialty: 'X-Quang',
    joinDate: '2020-01-01',
    experienceYears: 6,
    degrees: ['Cử nhân CĐHA'],
    certificates: [],
    totalShiftsThisMonth: 20,
    leaveBalanceDays: 11,
    currentStatus: 'Đang làm việc',
    statusHistory: [],
  },
];

describe('RBAC Normalization & Matching (rbac.ts)', () => {
  it('normalizes Vietnamese diacritics and matches equivalent department & room strings', () => {
    assert.equal(normalizeRbacText('Đoàn Thị Ánh Điệp'), 'doan thi anh diep');
    assert.equal(matchesDepartmentName('Bộ phận Xét nghiệm', 'Xét nghiệm'), true);
    assert.equal(matchesDepartmentName('Khoa Cận Lâm Sàng - Bộ phận Xét nghiệm', 'Xet nghiem'), true);
    assert.equal(matchesDepartmentName('Xét nghiệm', 'Chẩn đoán hình ảnh'), false);

    assert.equal(
      matchesRoomName('P.201 - Phòng Sinh hóa - Miễn dịch', 'Phòng Sinh hóa - Miễn dịch', sampleRooms),
      true
    );
    assert.equal(matchesRoomName('P.201', 'Phòng Sinh hóa - Miễn dịch', sampleRooms), true);
    assert.equal(matchesRoomName('Chưa phân phòng', 'Chưa phân phòng', sampleRooms), false);
  });

  it('resolves management tiers from explicit fields, titles, structural assignments, and legacy roles', () => {
    assert.equal(resolveUserManagementTier(adminUser, undefined, sampleDepartments, sampleRooms), 'admin');
    assert.equal(resolveUserManagementTier(deptHeadUser, undefined, sampleDepartments, sampleRooms), 'department_head');
    assert.equal(resolveUserManagementTier(sectionHeadUser, undefined, sampleDepartments, sampleRooms), 'section_head');
    assert.equal(resolveUserManagementTier(roomHeadUser, undefined, sampleDepartments, sampleRooms), 'room_head');
    assert.equal(resolveUserManagementTier(staffUser, undefined, sampleDepartments, sampleRooms), 'staff');

    const structuralSectionManager: User = {
      id: 'USR-STRUCT-SEC',
      name: 'BS. Lê Thị Hoa',
      email: 'hoa@cls.vn',
      role: 'Staff',
      department: 'Chẩn đoán hình ảnh',
      title: 'Bác sĩ',
      avatar: '',
      status: 'Active',
    };
    assert.equal(
      resolveUserManagementTier(structuralSectionManager, undefined, sampleDepartments, sampleRooms),
      'section_head'
    );
  });
});

describe('RBAC Staff Management Scopes (canManageStaffTarget)', () => {
  it('protects Admin accounts from non-admin mutations while allowing Admin full control except self-delete', () => {
    const adminAccess = resolveEffectiveUserAccess(adminUser, staffProfiles, sampleDepartments, sampleRooms);
    const deptHeadAccess = resolveEffectiveUserAccess(deptHeadUser, staffProfiles, sampleDepartments, sampleRooms);
    const targetAdmin = staffProfiles[0];
    const targetStaff = staffProfiles[1];

    assert.equal(canManageStaffTarget(adminAccess, 'edit', targetAdmin, sampleRooms), true);
    assert.equal(canManageStaffTarget(adminAccess, 'delete', targetAdmin, sampleRooms), false);
    assert.equal(canManageStaffTarget(adminAccess, 'delete', targetStaff, sampleRooms), true);
    assert.equal(canManageStaffTarget(adminAccess, 'rbac', targetStaff, sampleRooms), true);

    assert.equal(canManageStaffTarget(deptHeadAccess, 'edit', targetAdmin, sampleRooms), false);
    assert.equal(canManageStaffTarget(deptHeadAccess, 'delete', targetAdmin, sampleRooms), false);
    assert.equal(canManageStaffTarget(deptHeadAccess, 'rbac', targetAdmin, sampleRooms), false);
    assert.equal(canManageStaffTarget(deptHeadAccess, 'edit', targetStaff, sampleRooms), true);
    assert.equal(canManageStaffTarget(deptHeadAccess, 'rbac', targetStaff, sampleRooms), false);
  });

  it('enforces section_head and room_head departmental/room boundaries cleanly', () => {
    const sectionAccess = resolveEffectiveUserAccess(sectionHeadUser, staffProfiles, sampleDepartments, sampleRooms);
    const roomAccess = resolveEffectiveUserAccess(roomHeadUser, staffProfiles, sampleDepartments, sampleRooms);
    const regularAccess = resolveEffectiveUserAccess(staffUser, staffProfiles, sampleDepartments, sampleRooms);

    const sinhHoaStaff = staffProfiles[1];
    const huyetHocStaff: Partial<StaffProfile> = {
      userId: 'USR-HH-1',
      departmentSection: 'Bộ phận Xét nghiệm',
      room: 'Phòng Huyết học',
      role: 'Staff',
    };
    const xquangStaff = staffProfiles[2];

    assert.equal(canManageStaffTarget(sectionAccess, 'edit', sinhHoaStaff, sampleRooms), true);
    assert.equal(canManageStaffTarget(sectionAccess, 'edit', huyetHocStaff, sampleRooms), true);
    assert.equal(canManageStaffTarget(sectionAccess, 'create', huyetHocStaff, sampleRooms), true);
    assert.equal(canManageStaffTarget(sectionAccess, 'delete', sinhHoaStaff, sampleRooms), false);
    assert.equal(canManageStaffTarget(sectionAccess, 'edit', xquangStaff, sampleRooms), false);
    assert.equal(canManageStaffTarget(sectionAccess, 'create', xquangStaff, sampleRooms), false);

    assert.equal(canManageStaffTarget(roomAccess, 'edit', sinhHoaStaff, sampleRooms), true);
    assert.equal(canManageStaffTarget(roomAccess, 'cert', sinhHoaStaff, sampleRooms), true);
    assert.equal(canManageStaffTarget(roomAccess, 'create', sinhHoaStaff, sampleRooms), false);
    assert.equal(canManageStaffTarget(roomAccess, 'edit', huyetHocStaff, sampleRooms), false);
    assert.equal(canManageStaffTarget(roomAccess, 'edit', xquangStaff, sampleRooms), false);

    assert.equal(canManageStaffTarget(regularAccess, 'create', sinhHoaStaff, sampleRooms), false);
    assert.equal(canManageStaffTarget(regularAccess, 'edit', sinhHoaStaff, sampleRooms), false);
    assert.equal(canManageStaffTarget(regularAccess, 'delete', sinhHoaStaff, sampleRooms), false);
    assert.equal(canManageStaffTarget(regularAccess, 'cert', sinhHoaStaff, sampleRooms), false);
  });

  it('respects explicit permissionOverrides for elevating or restricting individual capabilities', () => {
    const elevatedStaff: User = {
      ...staffUser,
      permissionOverrides: {
        canEditStaff: true,
        allowCrossScopeEdit: true,
      },
    };
    const elevatedAccess = resolveEffectiveUserAccess(elevatedStaff, staffProfiles, sampleDepartments, sampleRooms);
    assert.equal(elevatedAccess.isDepartmentWide, true);
    assert.equal(canManageStaffTarget(elevatedAccess, 'edit', staffProfiles[2], sampleRooms), true);
    assert.equal(canManageStaffTarget(elevatedAccess, 'delete', staffProfiles[2], sampleRooms), false);
  });
});

describe('RBAC Equipment & Room Scopes (canManageEquipmentTarget, canManageRoomTarget)', () => {
  const eqSinhHoa: Pick<EquipmentItem, 'room' | 'category'> = {
    room: 'P.201 - Phòng Sinh hóa - Miễn dịch',
    category: 'Xét nghiệm',
  };

  const eqXquang: Pick<EquipmentItem, 'room' | 'category'> = {
    room: 'Phòng X-Quang Kỹ thuật số',
    category: 'Chẩn đoán hình ảnh',
  };

  it('scopes equipment LOTO, maintenance, create, and delete per actor tier', () => {
    const sectionAccess = resolveEffectiveUserAccess(sectionHeadUser, staffProfiles, sampleDepartments, sampleRooms);
    const roomAccess = resolveEffectiveUserAccess(roomHeadUser, staffProfiles, sampleDepartments, sampleRooms);
    const regularAccess = resolveEffectiveUserAccess(staffUser, staffProfiles, sampleDepartments, sampleRooms);

    assert.equal(canManageEquipmentTarget(sectionAccess, 'edit', eqSinhHoa, sampleRooms, sampleDepartments), true);
    assert.equal(canManageEquipmentTarget(sectionAccess, 'lockout', eqSinhHoa, sampleRooms, sampleDepartments), true);
    assert.equal(canManageEquipmentTarget(sectionAccess, 'delete', eqSinhHoa, sampleRooms, sampleDepartments), false);
    assert.equal(canManageEquipmentTarget(sectionAccess, 'edit', eqXquang, sampleRooms, sampleDepartments), false);

    assert.equal(canManageEquipmentTarget(roomAccess, 'lockout', eqSinhHoa, sampleRooms, sampleDepartments), true);
    assert.equal(canManageEquipmentTarget(roomAccess, 'maintenance', eqSinhHoa, sampleRooms, sampleDepartments), true);
    assert.equal(canManageEquipmentTarget(roomAccess, 'create', eqSinhHoa, sampleRooms, sampleDepartments), false);
    assert.equal(canManageEquipmentTarget(roomAccess, 'lockout', eqXquang, sampleRooms, sampleDepartments), false);

    assert.equal(canManageEquipmentTarget(regularAccess, 'report_issue', eqSinhHoa, sampleRooms, sampleDepartments), true);
    assert.equal(canManageEquipmentTarget(regularAccess, 'lockout', eqSinhHoa, sampleRooms, sampleDepartments), false);
    assert.equal(canManageEquipmentTarget(regularAccess, 'edit', eqSinhHoa, sampleRooms, sampleDepartments), false);
  });

  it('scopes room/department administration and selectable filters accurately', () => {
    const deptHeadAccess = resolveEffectiveUserAccess(deptHeadUser, staffProfiles, sampleDepartments, sampleRooms);
    const sectionAccess = resolveEffectiveUserAccess(sectionHeadUser, staffProfiles, sampleDepartments, sampleRooms);
    const roomAccess = resolveEffectiveUserAccess(roomHeadUser, staffProfiles, sampleDepartments, sampleRooms);

    assert.equal(canManageRoomTarget(deptHeadAccess, 'manage_departments', undefined, sampleRooms), true);
    assert.equal(canManageRoomTarget(sectionAccess, 'manage_departments', undefined, sampleRooms), false);
    assert.equal(
      canManageRoomTarget(sectionAccess, 'create_room', { departmentName: 'Bộ phận Xét nghiệm' }, sampleRooms),
      true
    );
    assert.equal(
      canManageRoomTarget(sectionAccess, 'create_room', { departmentName: 'Bộ phận Chẩn đoán hình ảnh' }, sampleRooms),
      false
    );
    assert.equal(
      canManageRoomTarget(roomAccess, 'manage_room_resources', { room: sampleRooms[0] }, sampleRooms),
      true
    );
    assert.equal(
      canManageRoomTarget(roomAccess, 'manage_room_resources', { room: sampleRooms[1] }, sampleRooms),
      false
    );

    assert.equal(filterSelectableDepartmentsForActor(sectionAccess, sampleDepartments).length, 1);
    assert.equal(filterSelectableRoomsForActor(sectionAccess, sampleRooms).length, 2);
    assert.equal(filterSelectableRoomsForActor(roomAccess, sampleRooms).length, 1);
    assert.equal(filterSelectableRoomsForActor(deptHeadAccess, sampleRooms).length, 3);
  });
});
