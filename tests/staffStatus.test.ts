import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterActiveLoginUsers,
  isResignedOrEndedStaff,
  isUserAccountBlockedOrResigned,
} from '../src/utils/staffStatus';

describe('Login Account Active / Resigned Filtering (staffStatus.ts)', () => {
  it('detects resigned, contract-ended, and unpaid-leave statuses on either currentStatus or status', () => {
    assert.equal(isResignedOrEndedStaff({ currentStatus: 'Đã nghỉ việc' }), true);
    assert.equal(isResignedOrEndedStaff({ currentStatus: 'Nghỉ không lương' }), true);
    assert.equal(isResignedOrEndedStaff({ currentStatus: undefined, status: 'Đã nghỉ việc' }), true);
    assert.equal(isResignedOrEndedStaff({ currentStatus: 'Đang làm việc' }), false);
    assert.equal(isResignedOrEndedStaff({ currentStatus: 'Nghỉ thai sản' }), false);
  });

  it('excludes Inactive users and staff marked resigned in StaffProfiles from login picker while keeping Admin and active staff', () => {
    const users = [
      { id: 'USR-ADMIN', name: 'Quản trị viên Hệ thống', role: 'Admin' as const, status: 'Active' },
      { id: 'USR-01', name: 'Nguyễn Văn A', role: 'Staff' as const, status: 'Inactive' },
      { id: 'USR-02', name: 'Trần Thị B', role: 'Doctor' as const, status: 'Active' },
      { id: 'USR-03', name: 'Lê Văn C', role: 'Staff' as const, status: 'Active' },
      { id: 'USR-04', name: 'Phạm Thị D', role: 'Staff' as const, status: 'Active' },
    ];

    const profiles = [
      { userId: 'USR-02', fullName: 'Trần Thị B', currentStatus: 'Đã nghỉ việc' as const },
      { userId: 'STF-OTHER', fullName: 'lê   văn c', currentStatus: 'Nghỉ không lương' as const },
      { userId: 'USR-04', fullName: 'Phạm Thị D', currentStatus: 'Đang làm việc' as const },
    ];

    const active = filterActiveLoginUsers(users, profiles);
    assert.deepEqual(
      active.map((u) => u.id),
      ['USR-ADMIN', 'USR-04']
    );

    assert.equal(isUserAccountBlockedOrResigned(users[0], profiles), false);
    assert.equal(isUserAccountBlockedOrResigned(users[1], profiles), true);
    assert.equal(isUserAccountBlockedOrResigned(users[2], profiles), true);
    assert.equal(isUserAccountBlockedOrResigned(users[3], profiles), true);
    assert.equal(isUserAccountBlockedOrResigned(users[4], profiles), false);
  });
});
