import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decomposeReportItemsToRows,
  composeReportItemsFromRows,
  extractEntityRecordId
} from '../server/normalizedStore';
import {
  computeBucketSnapshotDiffOps,
  extractBucketRecordId
} from '../src/services/storageService';
import {
  reportArchiveService,
  setServerReportArchiveMode,
  clearReportArchiveMemoryCache
} from '../src/services/reportArchiveService';

test('decomposeReportItemsToRows and composeReportItemsFromRows roundtrip report cells and manual locks', () => {
  const nowMs = 1764000000000;
  const input = [
    {
      id: 'SRV-001',
      category: 'Siêu Âm',
      name: 'Siêu âm tim',
      dailyData: {
        1: { bh: 10, nd: 2 },
        2: { bh: 'LT', nd: 'LT' }
      },
      manualDays: { 1: true },
      manualMeta: {
        1: { updatedAt: '2026-11-23 08:30', updatedBy: 'Nguyễn Đức Vạn' }
      },
      lastSyncedAt: '2026-11-23 09:00'
    },
    {
      id: 'SRV-002',
      category: 'Nội Soi',
      name: 'Nội soi dạ dày',
      dailyData: {
        1: { bh: 5, nd: 1 }
      }
    }
  ];

  const { services, cells } = decomposeReportItemsToRows('2026::Tháng 11', 2026, 'Tháng 11', input, nowMs);
  assert.equal(services.length, 2);
  assert.equal(cells.length, 3);

  const recomposed = composeReportItemsFromRows(services, cells);
  assert.equal(recomposed.length, 2);
  assert.equal(recomposed[0].id, 'SRV-001');
  assert.deepEqual(recomposed[0].dailyData, {
    1: { bh: 10, nd: 2 },
    2: { bh: 'LT', nd: 'LT' }
  });
  assert.deepEqual(recomposed[0].manualDays, { 1: true });
  assert.deepEqual(recomposed[0].manualMeta, {
    1: { updatedAt: '2026-11-23 08:30', updatedBy: 'Nguyễn Đức Vạn' }
  });
  assert.equal(recomposed[0].lastSyncedAt, '2026-11-23 09:00');
  assert.equal(recomposed[1].id, 'SRV-002');
});

test('extractEntityRecordId & extractBucketRecordId handle singleton, staff_profiles, and standard rows', () => {
  assert.equal(extractEntityRecordId('settings', { id: 'anything' }), 'default');
  assert.equal(extractEntityRecordId('staff_profiles', { userId: 'USR-001', id: 'prof-1' }), 'USR-001');
  assert.equal(extractEntityRecordId('tasks', { id: 'TSK-101' }), 'TSK-101');

  assert.equal(extractBucketRecordId('settings', { clinicName: 'ABC' }), 'default');
  assert.equal(extractBucketRecordId('staff_profiles', { userId: 'USR-002', id: 'ignored' }), 'USR-002');
  assert.equal(extractBucketRecordId('tasks', { id: 'TSK-202' }), 'TSK-202');
});

test('computeBucketSnapshotDiffOps emits row-level upserts/deletes with expectedVersion and strips rawFileData', () => {
  const prevDocs = JSON.stringify([
    { id: 'DOC-1', title: 'SOP 1', version: 'v1.0', rawFileData: 'data:application/pdf;base64,AAA' },
    { id: 'DOC-2', title: 'SOP 2', version: 'v1.0' }
  ]);
  const nextDocs = JSON.stringify([
    { id: 'DOC-1', title: 'SOP 1 Updated', version: 'v1.1', rawFileData: 'data:application/pdf;base64,BBB' },
    { id: 'DOC-3', title: 'SOP 3', version: 'v1.0' }
  ]);

  const versions = new Map<string, number>([
    ['documents:DOC-1', 4],
    ['documents:DOC-2', 2]
  ]);

  const ops = computeBucketSnapshotDiffOps('documents', prevDocs, nextDocs, versions);
  assert.equal(ops.length, 3);

  const doc1Upsert = ops.find((o) => o.op === 'upsert' && o.id === 'DOC-1');
  assert.ok(doc1Upsert);
  assert.equal(doc1Upsert.expectedVersion, 4);
  assert.equal(doc1Upsert.record?.rawFileData, undefined);

  const doc3Upsert = ops.find((o) => o.op === 'upsert' && o.id === 'DOC-3');
  assert.ok(doc3Upsert);
  assert.equal(doc3Upsert.expectedVersion, 0);

  const doc2Delete = ops.find((o) => o.op === 'delete' && o.id === 'DOC-2');
  assert.ok(doc2Delete);
  assert.equal(doc2Delete.expectedVersion, 2);
});

test('applyCloudMonthArchive authoritatively replaces cached month snapshot including cleared cells', () => {
  setServerReportArchiveMode(true);
  clearReportArchiveMemoryCache();

  reportArchiveService.applyCloudMonthArchive(2026, 'Tháng 11', [
    {
      id: 'SRV-1',
      category: 'Xét nghiệm',
      name: 'Sinh hóa',
      dailyData: { 10: { bh: 100, nd: 50 } },
      manualDays: { 10: { updatedAt: '2026-11-10 09:00', updatedBy: 'Admin' } }
    }
  ]);

  // Simulate authoritative server edit that zeroed day 10 and unlocked it
  const updated = reportArchiveService.applyCloudMonthArchive(2026, 'Tháng 11', [
    {
      id: 'SRV-1',
      category: 'Xét nghiệm',
      name: 'Sinh hóa',
      dailyData: { 10: { bh: 0, nd: 0 } }
    }
  ]);

  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0].dailyData[10], { bh: 0, nd: 0 });
  assert.equal(updated[0].manualDays, undefined);

  const reloaded = reportArchiveService.loadYearArchiveSync(2026)['Tháng 11'];
  assert.deepEqual(reloaded[0].dailyData[10], { bh: 0, nd: 0 });

  clearReportArchiveMemoryCache();
  setServerReportArchiveMode(false);
});
