import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatUniqueUnitLabel } from '../src/utils/roomDisplay';
import { buildDeterministicAssistantAnswer } from '../server/assistantEngine';

describe('Unit Label Deduplication (formatUniqueUnitLabel)', () => {
  it('collapses identical room and departmentSection names', () => {
    assert.equal(formatUniqueUnitLabel(['Siêu âm', 'Siêu âm']), 'Siêu âm');
    assert.equal(formatUniqueUnitLabel(['Nội soi', 'Nội soi']), 'Nội soi');
    assert.equal(formatUniqueUnitLabel(['XQ', 'XQ']), 'XQ');
    assert.equal(formatUniqueUnitLabel(['Siêu âm', 'siêu âm']), 'Siêu âm');
  });

  it('collapses unit names differing only by common prefixes or diacritics', () => {
    assert.equal(formatUniqueUnitLabel(['Phòng Siêu âm', 'Siêu âm']), 'Phòng Siêu âm');
    assert.equal(formatUniqueUnitLabel(['Siêu âm', 'Bộ phận Siêu âm']), 'Bộ phận Siêu âm');
    assert.equal(formatUniqueUnitLabel(['Noi soi', 'Nội soi']), 'Noi soi');
  });

  it('collapses pre-joined duplicate strings without touching distinct code-room labels', () => {
    assert.equal(formatUniqueUnitLabel(['Siêu âm - Siêu âm']), 'Siêu âm');
    assert.equal(formatUniqueUnitLabel(['Nội soi · Nội soi']), 'Nội soi');
    assert.equal(
      formatUniqueUnitLabel(['XN-01 - Phòng Sinh hóa', 'Xét nghiệm']),
      'XN-01 - Phòng Sinh hóa · Xét nghiệm'
    );
  });

  it('keeps genuinely distinct room and department names separated cleanly', () => {
    assert.equal(
      formatUniqueUnitLabel(['Phòng Siêu âm 02', 'Thăm dò chức năng']),
      'Phòng Siêu âm 02 · Thăm dò chức năng'
    );
    assert.equal(
      formatUniqueUnitLabel(['Phòng MSCT 128 lát', 'Máy CT Somatom'], ' / '),
      'Phòng MSCT 128 lát / Máy CT Somatom'
    );
    assert.equal(formatUniqueUnitLabel(['Chưa phân phòng', '—', 'Nội soi']), 'Nội soi');
  });
});

describe('Assistant Leave Formatting Deduplication', () => {
  it('renders single unit label in Telegram leave answer when room equals departmentSection', () => {
    const todayIso = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const liveContext = {
      staff: {
        items: [
          {
            userId: 'u1',
            fullName: 'Nguyễn Lan Anh',
            title: 'Bác sĩ',
            departmentSection: 'Siêu âm',
            room: 'Siêu âm',
          },
          {
            userId: 'u2',
            fullName: 'Hoàng Thị Linh San',
            title: 'Điều dưỡng',
            departmentSection: 'Nội soi',
            room: 'Nội soi',
          },
        ],
        leaveRequests: [
          {
            id: 'l1',
            userId: 'u1',
            userName: 'Nguyễn Lan Anh',
            departmentSection: 'Siêu âm',
            room: 'Siêu âm',
            leaveType: 'Phép năm',
            startDate: todayIso,
            endDate: todayIso,
            totalDays: 1,
            reason: 'việc riêng',
            status: 'Đã phê duyệt',
          },
          {
            id: 'l2',
            userId: 'u2',
            userName: 'Hoàng Thị Linh San',
            departmentSection: 'Nội soi',
            room: 'Nội soi',
            leaveType: 'Phép năm',
            startDate: todayIso,
            endDate: todayIso,
            totalDays: 1,
            reason: 'Việc riêng',
            substituteUserName: 'Nguyễn Thị Tuyên (SA)',
            status: 'Đã phê duyệt',
          },
        ],
      },
      shifts: { todayAndUpcoming: [] },
    };

    const res = buildDeterministicAssistantAnswer(
      'Lịch đăng ký nghỉ tuần này?',
      liveContext,
      undefined,
      'telegram'
    );

    assert.ok(res.answer.includes('**Nguyễn Lan Anh** (Siêu âm):'));
    assert.ok(res.answer.includes('**Hoàng Thị Linh San** (Nội soi):'));
    assert.equal(res.answer.includes('Siêu âm · Siêu âm'), false);
    assert.equal(res.answer.includes('Nội soi · Nội soi'), false);
  });
});
