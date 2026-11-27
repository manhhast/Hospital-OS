import { 
  TaskItem, DocumentItem, User, NotificationLog, AuditLogItem, AppSettings, UserRole, CLSTitle,
  ShiftDuty, WorkTaskRow, WeeklyMeeting, ChatChannelMessage, ChatGroupChannel, DepartmentAnnouncement, MessageType, ShareCardData,
  EquipmentItem, EquipmentDurationDefaults, DepartmentUnit, ParaclinicalRoom, RoomReservation, StaffProfile, LeaveRequest, TrainingCourse,
  MeetingItem, MeetingMinutes, MeetingActionItem, IntegrationEndpoint, IntegrationPayloadSample, MaintenanceLog, RepairLog,
  SyncHistoryEntry, SyncHistoryStatus, AssistantMemoryItem, AssistantMemoryCategory
} from '../types/hospital';
import { 
  initialTasks, initialDocuments, initialUsers, initialNotifications, initialAuditLogs, initialSettings,
  initialShifts, initialWorkTaskRows, initialWeeklyMeetings, initialChatMessages, initialChannels, initialAnnouncements,
  initialEquipment, initialRooms, initialStaffProfiles, initialLeaveRequests, initialTrainingCourses,
  initialMeetings, initialIntegrationEndpoints, initialIntegrationPayloads, ADMIN_DEFAULT_AVATAR
} from './mockData';
import * as sampleDemoData from './sampleDemoData';
import { isResignedOrEndedStaff, isUserAccountBlockedOrResigned } from '../utils/staffStatus';

const PRODUCTION_MODE_KEY = 'cls_workhub_prod_clean_state_v2';

export const STORAGE_KEYS = {
  TASKS: 'cls_workhub_tasks',
  DOCUMENTS: 'cls_workhub_documents',
  USERS: 'cls_workhub_users',
  NOTIFICATIONS: 'cls_workhub_notifications',
  AUDIT_LOGS: 'cls_workhub_audit_logs',
  SETTINGS: 'cls_workhub_settings',
  CURRENT_USER: 'cls_workhub_current_user_id',
  SHIFTS: 'cls_workhub_shifts',
  MEETINGS: 'cls_workhub_meetings',
  MESSAGES: 'cls_workhub_messages',
  CHANNELS: 'cls_workhub_channels',
  ANNOUNCEMENTS: 'cls_workhub_announcements',
  EQUIPMENT: 'cls_workhub_equipment',
  DEPARTMENTS: 'cls_workhub_departments',
  ROOMS: 'cls_workhub_rooms',
  STAFF_PROFILES: 'cls_workhub_staff_profiles',
  LEAVE_REQUESTS: 'cls_workhub_leave_requests',
  TRAINING_COURSES: 'cls_workhub_training_courses',
  MEETING_ITEMS: 'cls_workhub_meeting_items',
  INTEGRATION_ENDPOINTS: 'cls_workhub_integration_endpoints',
  INTEGRATION_PAYLOADS: 'cls_workhub_integration_payloads',
  WORK_TASK_ROWS: 'cls_workhub_work_task_rows',
  EQUIPMENT_DURATION_DEFAULTS: 'cls_workhub_equipment_duration_defaults',
  SYNC_HISTORY: 'cls_workhub_sync_history'
};

export const CLOUD_BUCKET_STORAGE_MAP = {
  tasks: STORAGE_KEYS.TASKS,
  documents: STORAGE_KEYS.DOCUMENTS,
  users: STORAGE_KEYS.USERS,
  notifications: STORAGE_KEYS.NOTIFICATIONS,
  audit_logs: STORAGE_KEYS.AUDIT_LOGS,
  settings: STORAGE_KEYS.SETTINGS,
  shifts: STORAGE_KEYS.SHIFTS,
  work_task_rows: STORAGE_KEYS.WORK_TASK_ROWS,
  meetings: STORAGE_KEYS.MEETINGS,
  meeting_items: STORAGE_KEYS.MEETING_ITEMS,
  messages: STORAGE_KEYS.MESSAGES,
  channels: STORAGE_KEYS.CHANNELS,
  announcements: STORAGE_KEYS.ANNOUNCEMENTS,
  equipment: STORAGE_KEYS.EQUIPMENT,
  departments: STORAGE_KEYS.DEPARTMENTS,
  rooms: STORAGE_KEYS.ROOMS,
  staff_profiles: STORAGE_KEYS.STAFF_PROFILES,
  leave_requests: STORAGE_KEYS.LEAVE_REQUESTS,
  training_courses: STORAGE_KEYS.TRAINING_COURSES,
  integration_endpoints: STORAGE_KEYS.INTEGRATION_ENDPOINTS,
  integration_payloads: STORAGE_KEYS.INTEGRATION_PAYLOADS,
  equipment_duration_defaults: STORAGE_KEYS.EQUIPMENT_DURATION_DEFAULTS,
  sync_history: STORAGE_KEYS.SYNC_HISTORY
} as const;

export type CloudBucketKey = keyof typeof CLOUD_BUCKET_STORAGE_MAP;

export const SINGLETON_OBJECT_BUCKETS: ReadonlyArray<CloudBucketKey> = [
  'settings',
  'equipment_duration_defaults'
];

export interface EntityMutationOp {
  op: 'upsert' | 'delete';
  entityType: CloudBucketKey;
  id: string;
  record?: Record<string, unknown>;
  expectedVersion?: number;
}

export interface ServerEntityChangeItem {
  entityType: string;
  id: string;
  version: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
  record: Record<string, unknown> | null;
}

export function extractBucketRecordId(
  bucketKey: CloudBucketKey,
  record: Record<string, unknown>,
  fallbackIdx = 0
): string {
  if (SINGLETON_OBJECT_BUCKETS.includes(bucketKey)) return 'default';
  if (bucketKey === 'staff_profiles') {
    const uid = typeof record.userId === 'string' ? record.userId.trim() : '';
    if (uid) return uid;
  }
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (id) return id;
  if (typeof record.userId === 'string' && record.userId.trim()) return record.userId.trim();
  return `row-${fallbackIdx}`;
}

export function sanitizeRecordForCloud(
  bucketKey: CloudBucketKey,
  rec: Record<string, unknown>
): Record<string, unknown> {
  if (bucketKey === 'documents') {
    const copy = { ...rec };
    delete copy.rawFileData;
    return copy;
  }
  return rec;
}

export function computeBucketSnapshotDiffOps(
  bucketKey: CloudBucketKey,
  prevSerialized: string,
  nextSerialized: string,
  entityVersions: ReadonlyMap<string, number> = new Map()
): EntityMutationOp[] {
  const ops: EntityMutationOp[] = [];
  if (SINGLETON_OBJECT_BUCKETS.includes(bucketKey)) {
    try {
      const nextObj = nextSerialized ? JSON.parse(nextSerialized) : null;
      if (nextObj && typeof nextObj === 'object' && !Array.isArray(nextObj)) {
        ops.push({
          op: 'upsert',
          entityType: bucketKey,
          id: 'default',
          record: nextObj as Record<string, unknown>,
          expectedVersion: entityVersions.get(`${bucketKey}:default`) || 0
        });
      }
    } catch {
      // ignore invalid json
    }
    return ops;
  }

  let prevList: Record<string, unknown>[] = [];
  let nextList: Record<string, unknown>[] = [];
  try {
    const p = prevSerialized ? JSON.parse(prevSerialized) : [];
    if (Array.isArray(p)) prevList = p;
  } catch {
    prevList = [];
  }
  try {
    const n = nextSerialized ? JSON.parse(nextSerialized) : [];
    if (Array.isArray(n)) nextList = n;
  } catch {
    nextList = [];
  }

  const prevMap = new Map<string, { raw: string; rec: Record<string, unknown> }>();
  prevList.forEach((rawRec, idx) => {
    if (!rawRec || typeof rawRec !== 'object') return;
    const rec = sanitizeRecordForCloud(bucketKey, rawRec);
    const id = extractBucketRecordId(bucketKey, rec, idx);
    prevMap.set(id, { raw: JSON.stringify(rec), rec });
  });

  const nextMap = new Map<string, { raw: string; rec: Record<string, unknown> }>();
  nextList.forEach((rawRec, idx) => {
    if (!rawRec || typeof rawRec !== 'object') return;
    const rec = sanitizeRecordForCloud(bucketKey, rawRec);
    const id = extractBucketRecordId(bucketKey, rec, idx);
    nextMap.set(id, { raw: JSON.stringify(rec), rec });
  });

  for (const [id, nextEntry] of nextMap.entries()) {
    const prevEntry = prevMap.get(id);
    if (!prevEntry || prevEntry.raw !== nextEntry.raw) {
      ops.push({
        op: 'upsert',
        entityType: bucketKey,
        id,
        record: nextEntry.rec,
        expectedVersion: entityVersions.get(`${bucketKey}:${id}`) || 0
      });
    }
  }

  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      ops.push({
        op: 'delete',
        entityType: bucketKey,
        id,
        expectedVersion: entityVersions.get(`${bucketKey}:${id}`) || 0
      });
    }
  }

  return ops;
}

const STORAGE_KEY_TO_BUCKET: Record<string, CloudBucketKey> = Object.fromEntries(
  (Object.entries(CLOUD_BUCKET_STORAGE_MAP) as [CloudBucketKey, string][]).map(([bucket, sKey]) => [sKey, bucket])
);

const DEFAULT_DEPARTMENTS: DepartmentUnit[] = [
  {
    id: 'DEPT-CDHA',
    code: 'BP-CDHA',
    name: 'Chẩn đoán hình ảnh',
    description: 'Bộ phận Chẩn đoán hình ảnh (CT Scanner, MRI, X-Quang kỹ thuật số)'
  },
  {
    id: 'DEPT-XN',
    code: 'BP-XN',
    name: 'Xét nghiệm',
    description: 'Bộ phận Xét nghiệm (Hóa sinh, Huyết học, Vi sinh, Miễn dịch)'
  },
  {
    id: 'DEPT-TDCN',
    code: 'BP-TDCN',
    name: 'Thăm dò chức năng',
    description: 'Bộ phận Thăm dò chức năng (Siêu âm, Nội soi, Điện tim)'
  },
  {
    id: 'DEPT-HC',
    code: 'BP-HC',
    name: 'Hành chính Khoa',
    description: 'Bộ phận Hành chính, Tiếp đón & Quản trị chất lượng Khoa CLS'
  }
];

const DIRTY_BUCKETS_KEY = 'cls_workhub_cloud_dirty_buckets_v1';

class HospitalStorageService {
  private currentUser: User = initialUsers[0]; // Default to Admin
  private listeners: Array<() => void> = [];
  private idSeq = 0;
  private isApplyingRemote = false;
  private serverModeEnabled = false;
  private memoryBuckets: Partial<Record<CloudBucketKey, string>> = {};
  private entityVersions = new Map<string, number>();
  private lastBucketSnapshots: Partial<Record<CloudBucketKey, string>> = {};
  private cloudBucketChangeHandler: ((bucketKey: CloudBucketKey) => void) | null = null;
  private cloudMutationsHandler: ((ops: EntityMutationOp[]) => void) | null = null;
  private isCloudSyncedChecker: (() => boolean) | null = null;
  private dirtyBucketTimestamps: Partial<Record<CloudBucketKey, number>> = {};
  private sessionAuthenticated = false;

  private nextUniqueId(prefix: string): string {
    this.idSeq = (this.idSeq + 1) % 1000000;
    return `${prefix}-${Date.now().toString().slice(-6)}-${this.idSeq}-${Math.random().toString(36).slice(2, 6)}`;
  }

  private ensureUniqueIds<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.map((item, idx) => {
      const baseId = item.id || `ITEM-${idx}`;
      if (!seen.has(baseId)) {
        seen.add(baseId);
        return item;
      }
      let unique = `${baseId}-${idx}`;
      let suffix = 1;
      while (seen.has(unique)) {
        unique = `${baseId}-${idx}-${suffix++}`;
      }
      seen.add(unique);
      return { ...item, id: unique };
    });
  }

  constructor() {
    try {
      localStorage.removeItem('cls_workhub_is_authenticated');
    } catch {
      // ignore storage access errors
    }
    this.initDefaultData();
    this.loadDirtyBucketTimestamps();
    this.captureCurrentBucketSnapshots();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (!e.key) return;
        const matchedEntry = (Object.entries(CLOUD_BUCKET_STORAGE_MAP) as [CloudBucketKey, string][]).find(
          ([, storageKey]) => storageKey === e.key
        );
        if (!matchedEntry) return;
        const [bucketKey] = matchedEntry;
        const nextVal = e.newValue || '';
        if (this.lastBucketSnapshots[bucketKey] === nextVal) return;

        this.lastBucketSnapshots[bucketKey] = nextVal;
        this.isApplyingRemote = true;
        try {
          if (bucketKey === 'users' || bucketKey === 'staff_profiles') {
            const users = this.getUsers();
            const found = users.find((u) => u.id === this.currentUser.id);
            if (found) this.currentUser = found;
          }
          this.notify();
        } finally {
          this.isApplyingRemote = false;
        }
      });
    }
  }

  private loadDirtyBucketTimestamps() {
    try {
      const raw = localStorage.getItem(DIRTY_BUCKETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.dirtyBucketTimestamps = parsed as Partial<Record<CloudBucketKey, number>>;
          return;
        }
      }
    } catch {
      // ignore parse errors
    }
    this.dirtyBucketTimestamps = {};
  }

  public setServerMode(enabled: boolean) {
    this.serverModeEnabled = enabled;
    if (enabled) {
      // Seed memory buckets from any untouched defaults so pre-login screens remain consistent
      (Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[]).forEach((bucketKey) => {
        if (this.memoryBuckets[bucketKey] === undefined) {
          this.memoryBuckets[bucketKey] = this.getDefaultSerializedBucket(bucketKey);
        }
      });
    }
  }

  public isServerMode(): boolean {
    return this.serverModeEnabled;
  }

  private getDefaultSerializedBucket(bucketKey: CloudBucketKey): string {
    switch (bucketKey) {
      case 'tasks': return JSON.stringify(initialTasks);
      case 'documents': return JSON.stringify(initialDocuments);
      case 'users': return JSON.stringify(initialUsers);
      case 'notifications': return JSON.stringify(initialNotifications);
      case 'audit_logs': return JSON.stringify(initialAuditLogs);
      case 'settings': return JSON.stringify(initialSettings);
      case 'shifts': return JSON.stringify(initialShifts);
      case 'work_task_rows': return JSON.stringify(initialWorkTaskRows);
      case 'meetings': return JSON.stringify(initialWeeklyMeetings);
      case 'messages': return JSON.stringify(initialChatMessages);
      case 'channels': return JSON.stringify(initialChannels);
      case 'announcements': return JSON.stringify(initialAnnouncements);
      case 'equipment': return JSON.stringify(initialEquipment);
      case 'departments': return JSON.stringify(DEFAULT_DEPARTMENTS);
      case 'rooms': return JSON.stringify(initialRooms);
      case 'equipment_duration_defaults':
        return JSON.stringify({ permitMonths: 60, calibrationMonths: 12, radiationSurveyMonths: 12, maintenanceMonths: 3 });
      case 'staff_profiles': return JSON.stringify(initialStaffProfiles);
      case 'leave_requests': return JSON.stringify(initialLeaveRequests);
      case 'training_courses': return JSON.stringify(initialTrainingCourses);
      case 'meeting_items': return JSON.stringify(initialMeetings);
      case 'integration_endpoints': return JSON.stringify(initialIntegrationEndpoints);
      case 'integration_payloads': return JSON.stringify(initialIntegrationPayloads);
      case 'sync_history': return '[]';
      default: return '[]';
    }
  }

  public clearLegacyLocalStorageBuckets(): void {
    try {
      Object.values(STORAGE_KEYS).forEach((k) => {
        localStorage.removeItem(k);
      });
      localStorage.removeItem(DIRTY_BUCKETS_KEY);
      localStorage.removeItem(PRODUCTION_MODE_KEY);
      localStorage.removeItem('cls_workhub_pg_session_token_v1');
      localStorage.removeItem('cls_recent_searches');
      localStorage.removeItem('cls_pinned_clinical_services_v1');
      localStorage.removeItem('cls_task_reminder_logs');
      localStorage.removeItem('cls_equipment_reminder_logs');
      localStorage.removeItem('google_sheet_url');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('google_sheet_data_') ||
            key.startsWith('cls_workhub_quick_access_pins_v1_'))
        ) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore storage access errors
    }
  }

  public readBucketRaw(storageKey: string): string | null {
    const bucketKey = STORAGE_KEY_TO_BUCKET[storageKey];
    if (this.serverModeEnabled && bucketKey) {
      const val = this.memoryBuckets[bucketKey];
      return val !== undefined ? val : null;
    }
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  public writeBucketRaw(storageKey: string, value: string): void {
    if (storageKey === STORAGE_KEYS.CURRENT_USER) {
      if (!this.serverModeEnabled) {
        try {
          localStorage.setItem(storageKey, value);
        } catch {
          // ignore
        }
      }
      return;
    }
    const bucketKey = STORAGE_KEY_TO_BUCKET[storageKey];
    if (this.serverModeEnabled && bucketKey) {
      this.memoryBuckets[bucketKey] = value;
      return;
    }
    this.safeSetItem(storageKey, value);
  }

  private saveDirtyBucketTimestamps() {
    if (this.serverModeEnabled) return;
    try {
      localStorage.setItem(DIRTY_BUCKETS_KEY, JSON.stringify(this.dirtyBucketTimestamps));
    } catch {
      // ignore storage errors
    }
  }

  public markBucketDirty(bucketKey: CloudBucketKey, timestampMs = Date.now()) {
    if (this.serverModeEnabled) return;
    this.dirtyBucketTimestamps[bucketKey] = timestampMs;
    this.saveDirtyBucketTimestamps();
  }

  public clearBucketDirty(bucketKey?: CloudBucketKey) {
    if (bucketKey) {
      if (this.dirtyBucketTimestamps[bucketKey] !== undefined) {
        delete this.dirtyBucketTimestamps[bucketKey];
        this.saveDirtyBucketTimestamps();
      }
      return;
    }
    this.dirtyBucketTimestamps = {};
    this.saveDirtyBucketTimestamps();
  }

  public getDirtyBucketTimestamps(): Partial<Record<CloudBucketKey, number>> {
    return this.serverModeEnabled ? {} : { ...this.dirtyBucketTimestamps };
  }

  public getIsApplyingRemote(): boolean {
    return this.isApplyingRemote;
  }

  public registerCloudConnectedChecker(checker: (() => boolean) | null) {
    this.isCloudSyncedChecker = checker;
  }

  private captureCurrentBucketSnapshots() {
    (Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[]).forEach((bucketKey) => {
      const storageKey = CLOUD_BUCKET_STORAGE_MAP[bucketKey];
      this.lastBucketSnapshots[bucketKey] = this.readBucketRaw(storageKey) || '';
    });
  }

  public registerCloudBucketChangeHandler(handler: ((bucketKey: CloudBucketKey) => void) | null) {
    this.cloudBucketChangeHandler = handler;
  }

  public registerCloudMutationsHandler(handler: ((ops: EntityMutationOp[]) => void) | null) {
    this.cloudMutationsHandler = handler;
  }

  public getEntityVersion(entityType: CloudBucketKey, recordId: string): number {
    return this.entityVersions.get(`${entityType}:${recordId}`) || 0;
  }

  public setEntityVersions(versionMap: Record<string, number> | undefined | null) {
    if (!versionMap || typeof versionMap !== 'object') return;
    for (const [key, ver] of Object.entries(versionMap)) {
      if (typeof ver === 'number' && ver > 0) {
        this.entityVersions.set(key, ver);
      }
    }
  }

  public updateEntityVersionsFromResults(
    results: Array<{ entityType: string; id: string; op: 'upsert' | 'delete'; version: number }>
  ) {
    for (const r of results) {
      const key = `${r.entityType}:${r.id}`;
      if (r.op === 'delete') {
        this.entityVersions.delete(key);
      } else if (typeof r.version === 'number' && r.version > 0) {
        this.entityVersions.set(key, r.version);
      }
    }
  }

  public isUntouchedSeedData(
    bucketKey: CloudBucketKey,
    items: Record<string, unknown>[]
  ): boolean {
    if (!Array.isArray(items)) return true;

    switch (bucketKey) {
      case 'tasks':
      case 'notifications':
      case 'shifts':
      case 'work_task_rows':
      case 'meetings':
      case 'meeting_items':
      case 'messages':
      case 'announcements':
      case 'equipment':
      case 'staff_profiles':
      case 'leave_requests':
      case 'training_courses':
      case 'sync_history':
        return items.length === 0;

      case 'documents': {
        if (items.length === 0) return true;
        if (items.length === sampleDemoData.initialDocuments.length) {
          const seedIds = sampleDemoData.initialDocuments.map((d) => d.id).sort().join('|');
          const curIds = items.map((d) => String(d.id || '')).sort().join('|');
          return seedIds === curIds;
        }
        return false;
      }

      case 'departments': {
        if (items.length !== DEFAULT_DEPARTMENTS.length) return false;
        const seedSig = DEFAULT_DEPARTMENTS.map((d) => `${d.id}:${d.code}:${d.name}`).sort().join('|');
        const curSig = items.map((d) => `${String(d.id || '')}:${String(d.code || '')}:${String(d.name || '')}`).sort().join('|');
        return seedSig === curSig;
      }

      case 'rooms': {
        if (items.length !== initialRooms.length) return false;
        const seedSig = initialRooms.map((r) => `${r.id}:${r.code}:${r.name}:${r.departmentSection}`).sort().join('|');
        const curSig = items.map((r) => `${String(r.id || '')}:${String(r.code || '')}:${String(r.name || '')}:${String(r.departmentSection || '')}`).sort().join('|');
        return seedSig === curSig;
      }

      case 'users': {
        if (items.length !== initialUsers.length) return false;
        const u = items[0];
        const seed = initialUsers[0];
        return (
          String(u?.id || '') === seed.id &&
          String(u?.name || '') === seed.name &&
          String(u?.email || '') === seed.email &&
          String(u?.password || '') === String(seed.password || 'admin') &&
          String(u?.telegramChatId || '') === ''
        );
      }

      case 'channels': {
        if (items.length !== initialChannels.length) return false;
        const seedSig = initialChannels.map((c) => `${c.id}:${c.name}`).sort().join('|');
        const curSig = items.map((c) => `${String(c.id || '')}:${String(c.name || '')}`).sort().join('|');
        return seedSig === curSig;
      }

      case 'audit_logs': {
        return items.every((log) => {
          const action = String(log.action || '');
          return (
            String(log.id || '') === 'AUD-001' ||
            action === 'PURGE_TRIAL_DATA' ||
            action === 'Khởi tạo hệ thống thực tế'
          );
        });
      }

      case 'settings': {
        const s = items[0] as Partial<AppSettings> | undefined;
        if (!s || typeof s !== 'object') return true;
        const hasSheetYears =
          s.reportGoogleSheetsByYear &&
          Object.values(s.reportGoogleSheetsByYear).some((cfg) => Boolean(cfg?.sheetId || cfg?.url));
        return (
          !(s.telegramBotToken || '').trim() &&
          !s.hasTelegramBotToken &&
          !(s.defaultTelegramChatId || '').trim() &&
          !(s.googleDriveFolderId || '').trim() &&
          !(s.googleSheetUrl || '').trim() &&
          !(s.reportGoogleSheetId || '').trim() &&
          !(s.googleSheetId || '').trim() &&
          !(s.smtpUser || '').trim() &&
          !hasSheetYears &&
          (!Array.isArray(s.archivedReportYears) || s.archivedReportYears.length === 0) &&
          (!Array.isArray(s.assistantMemories) || s.assistantMemories.length === 0)
        );
      }

      case 'equipment_duration_defaults': {
        const d = items[0] as Partial<EquipmentDurationDefaults> | undefined;
        if (!d || typeof d !== 'object') return true;
        return (
          (d.permitMonths ?? 60) === 60 &&
          (d.calibrationMonths ?? 12) === 12 &&
          (d.radiationSurveyMonths ?? 12) === 12 &&
          (d.maintenanceMonths ?? 3) === 3
        );
      }

      case 'integration_endpoints': {
        if (items.length !== initialIntegrationEndpoints.length) return false;
        const seedSig = initialIntegrationEndpoints.map((e) => `${e.id}:${e.endpointUrl}`).sort().join('|');
        const curSig = items.map((e) => `${String(e.id || '')}:${String(e.endpointUrl || '')}`).sort().join('|');
        return seedSig === curSig;
      }

      case 'integration_payloads': {
        if (items.length !== initialIntegrationPayloads.length) return false;
        const seedSig = initialIntegrationPayloads.map((p) => String(p.id)).sort().join('|');
        const curSig = items.map((p) => String(p.id || '')).sort().join('|');
        return seedSig === curSig;
      }

      default:
        return false;
    }
  }

  public getBucketItemsForCloud(bucketKey: CloudBucketKey): Record<string, unknown>[] {
    const storageKey = CLOUD_BUCKET_STORAGE_MAP[bucketKey];
    let parsed: unknown = null;
    try {
      const raw = this.readBucketRaw(storageKey);
      if (raw) {
        parsed = JSON.parse(raw);
      }
    } catch {
      parsed = null;
    }

    if (bucketKey === 'settings' && (!parsed || typeof parsed !== 'object')) {
      parsed = this.getSettings();
    } else if (bucketKey === 'equipment_duration_defaults' && (!parsed || typeof parsed !== 'object')) {
      parsed = this.getEquipmentDurationDefaults();
    } else if (bucketKey === 'departments' && !Array.isArray(parsed)) {
      parsed = this.getDepartments();
    }

    if (SINGLETON_OBJECT_BUCKETS.includes(bucketKey)) {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return [parsed as Record<string, unknown>];
      }
      return [];
    }

    if (Array.isArray(parsed)) {
      if (bucketKey === 'documents') {
        // Keep binary files in PostgreSQL / Google Drive; only metadata & links go to documents table
        return parsed.slice(0, 1000).map((doc: any) => {
          const copy = { ...doc };
          delete copy.rawFileData;
          return copy;
        });
      }
      if (bucketKey === 'audit_logs') {
        return parsed.slice(0, 250);
      }
      return parsed.slice(0, 2000);
    }

    return [];
  }

  public applyRemoteBucketData(bucketKey: CloudBucketKey, items: Record<string, unknown>[]): void {
    const storageKey = CLOUD_BUCKET_STORAGE_MAP[bucketKey];
    let serialized = '[]';

    if (SINGLETON_OBJECT_BUCKETS.includes(bucketKey)) {
      const firstObj = items[0];
      if (!firstObj || typeof firstObj !== 'object') return;
      serialized = JSON.stringify(firstObj);
    } else {
      serialized = JSON.stringify(items);
    }

    if (this.lastBucketSnapshots[bucketKey] === serialized) {
      this.clearBucketDirty(bucketKey);
      return;
    }

    this.isApplyingRemote = true;
    try {
      this.writeBucketRaw(storageKey, serialized);
      this.lastBucketSnapshots[bucketKey] = serialized;
      this.clearBucketDirty(bucketKey);
      // Keep in-memory currentUser synced when users bucket updates remotely
      if (bucketKey === 'users' || bucketKey === 'staff_profiles') {
        const users = this.getUsers();
        const found = users.find((u) => u.id === this.currentUser.id);
        if (found) {
          this.currentUser = found;
        }
      }
      this.notify();
    } finally {
      this.isApplyingRemote = false;
    }
  }

  public applyServerInitialState(
    remoteBuckets: Record<string, { items: Record<string, unknown>[] }>,
    versions?: Record<string, number>,
    sessionUserId?: string
  ): void {
    this.setServerMode(true);
    this.clearLegacyLocalStorageBuckets();
    if (versions) {
      this.entityVersions.clear();
      this.setEntityVersions(versions);
    }

    const hasRemoteData = Object.keys(remoteBuckets).length > 0;
    this.isApplyingRemote = true;
    try {
      (Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[]).forEach((bucketKey) => {
        const remote = remoteBuckets[bucketKey];
        let serialized: string;
        if (remote && Array.isArray(remote.items)) {
          if (SINGLETON_OBJECT_BUCKETS.includes(bucketKey)) {
            serialized =
              remote.items[0] && typeof remote.items[0] === 'object'
                ? JSON.stringify(remote.items[0])
                : this.getDefaultSerializedBucket(bucketKey);
          } else {
            serialized = JSON.stringify(remote.items);
          }
        } else if (!hasRemoteData) {
          serialized = this.getDefaultSerializedBucket(bucketKey);
        } else {
          serialized = SINGLETON_OBJECT_BUCKETS.includes(bucketKey)
            ? this.getDefaultSerializedBucket(bucketKey)
            : '[]';
        }
        this.memoryBuckets[bucketKey] = serialized;
        this.lastBucketSnapshots[bucketKey] = serialized;
      });

      if (sessionUserId) {
        const users = this.getUsers();
        const matched = users.find((u) => u.id === sessionUserId);
        if (matched) {
          this.currentUser = matched;
        }
      } else {
        const users = this.getUsers();
        const matched = users.find((u) => u.id === this.currentUser.id);
        if (matched) {
          this.currentUser = matched;
        }
      }

      this.notify();
    } finally {
      this.isApplyingRemote = false;
    }
  }

  public applyServerEntityChanges(changes: ServerEntityChangeItem[]): boolean {
    if (!Array.isArray(changes) || changes.length === 0) return false;
    const grouped = new Map<CloudBucketKey, ServerEntityChangeItem[]>();
    for (const c of changes) {
      const bKey = c.entityType as CloudBucketKey;
      if (!CLOUD_BUCKET_STORAGE_MAP[bKey]) continue;
      if (!grouped.has(bKey)) grouped.set(bKey, []);
      grouped.get(bKey)!.push(c);
    }
    if (grouped.size === 0) return false;

    let anyChanged = false;
    this.isApplyingRemote = true;
    try {
      for (const [bucketKey, itemChanges] of grouped.entries()) {
        if (SINGLETON_OBJECT_BUCKETS.includes(bucketKey)) {
          const latest = itemChanges[itemChanges.length - 1];
          if (latest) {
            this.entityVersions.set(`${bucketKey}:${latest.id}`, latest.version);
            if (!latest.deletedAtMs && latest.record) {
              const serialized = JSON.stringify(latest.record);
              if (this.lastBucketSnapshots[bucketKey] !== serialized) {
                this.writeBucketRaw(CLOUD_BUCKET_STORAGE_MAP[bucketKey], serialized);
                this.lastBucketSnapshots[bucketKey] = serialized;
                anyChanged = true;
              }
            }
          }
          continue;
        }

        let currentList: Record<string, unknown>[] = [];
        try {
          const raw = this.readBucketRaw(CLOUD_BUCKET_STORAGE_MAP[bucketKey]);
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) currentList = parsed;
        } catch {
          currentList = [];
        }

        const nextList = [...currentList];
        for (const ch of itemChanges) {
          const verKey = `${bucketKey}:${ch.id}`;
          if (ch.deletedAtMs) {
            this.entityVersions.delete(verKey);
            const idx = nextList.findIndex(
              (row, i) => extractBucketRecordId(bucketKey, row, i) === ch.id
            );
            if (idx >= 0) {
              nextList.splice(idx, 1);
              anyChanged = true;
            }
          } else if (ch.record) {
            this.entityVersions.set(verKey, ch.version);
            const idx = nextList.findIndex(
              (row, i) => extractBucketRecordId(bucketKey, row, i) === ch.id
            );
            if (idx >= 0) {
              if (JSON.stringify(nextList[idx]) !== JSON.stringify(ch.record)) {
                nextList[idx] = ch.record;
                anyChanged = true;
              }
            } else {
              if (
                bucketKey === 'audit_logs' ||
                bucketKey === 'notifications' ||
                bucketKey === 'sync_history' ||
                bucketKey === 'announcements'
              ) {
                nextList.unshift(ch.record);
              } else {
                nextList.push(ch.record);
              }
              anyChanged = true;
            }
          }
        }

        const serialized = JSON.stringify(nextList);
        this.writeBucketRaw(CLOUD_BUCKET_STORAGE_MAP[bucketKey], serialized);
        this.lastBucketSnapshots[bucketKey] = serialized;
      }

      if (grouped.has('users') || grouped.has('staff_profiles')) {
        const users = this.getUsers();
        const found = users.find((u) => u.id === this.currentUser.id);
        if (found) {
          this.currentUser = found;
        }
      }
      if (anyChanged) {
        this.notify();
      }
    } finally {
      this.isApplyingRemote = false;
    }
    return anyChanged;
  }

  private diffBucketSnapshotsToOps(
    bucketKey: CloudBucketKey,
    prevSerialized: string,
    nextSerialized: string
  ): EntityMutationOp[] {
    return computeBucketSnapshotDiffOps(
      bucketKey,
      prevSerialized,
      nextSerialized,
      this.entityVersions
    );
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    if (!this.isApplyingRemote) {
      const cloudSynced = this.isCloudSyncedChecker ? this.isCloudSyncedChecker() : false;
      const collectedOps: EntityMutationOp[] = [];
      (Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[]).forEach((bucketKey) => {
        const storageKey = CLOUD_BUCKET_STORAGE_MAP[bucketKey];
        try {
          const current = this.readBucketRaw(storageKey) || '';
          const prev = this.lastBucketSnapshots[bucketKey] ?? '';
          if (current !== prev) {
            this.lastBucketSnapshots[bucketKey] = current;
            if (cloudSynced) {
              if (this.cloudMutationsHandler) {
                collectedOps.push(...this.diffBucketSnapshotsToOps(bucketKey, prev, current));
              } else if (this.cloudBucketChangeHandler) {
                this.cloudBucketChangeHandler(bucketKey);
              }
            } else if (!this.serverModeEnabled) {
              const items = this.getBucketItemsForCloud(bucketKey);
              if (!this.isUntouchedSeedData(bucketKey, items)) {
                this.markBucketDirty(bucketKey);
              }
            }
          }
        } catch {
          // ignore read errors
        }
      });
      if (cloudSynced && this.cloudMutationsHandler && collectedOps.length > 0) {
        this.cloudMutationsHandler(collectedOps);
      }
    }
    this.listeners.forEach(listener => listener());
  }

  private initDefaultData() {
    if (typeof localStorage === 'undefined') return;
    // Tự động dọn sạch toàn bộ dữ liệu dùng thử cũ (nếu có trên trình duyệt) để đưa vào áp dụng thực tế
    if (localStorage.getItem(PRODUCTION_MODE_KEY) !== 'true') {
      this.purgeAllTrialData();
      localStorage.setItem(PRODUCTION_MODE_KEY, 'true');
      return;
    }

    // Tự động giải phóng dung lượng nếu bộ nhớ trình duyệt có dữ liệu audit/base64 cũ quá lớn
    try {
      const rawAudit = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (rawAudit && (rawAudit.length > 200000 || rawAudit.includes('data:application/pdf') || rawAudit.includes('data:image/'))) {
        localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
      }
      const rawDocs = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
      if (rawDocs && (rawDocs.includes('data:application/pdf') || rawDocs.includes('data:image/'))) {
        try {
          const parsedDocs = JSON.parse(rawDocs);
          const cleaned = parsedDocs.map((d: any) => {
            const copy = { ...d };
            delete copy.rawFileData;
            if (typeof copy.driveUrl === 'string' && copy.driveUrl.startsWith('data:')) {
              copy.driveUrl = `https://drive.google.com/file/d/${copy.driveFileId || copy.id}/view`;
            }
            return copy;
          });
          localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(cleaned));
        } catch (e) {
          // Ignore
        }
      }
    } catch (e) {
      // Ignore
    }

    if (!localStorage.getItem(STORAGE_KEYS.TASKS)) {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(initialTasks));
    }
    if (!localStorage.getItem(STORAGE_KEYS.DOCUMENTS)) {
      localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(initialDocuments));
    }
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(initialUsers));
    }
    if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(initialNotifications));
    }
    if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(initialAuditLogs));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SHIFTS)) {
      localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(initialShifts));
    }
    if (!localStorage.getItem(STORAGE_KEYS.WORK_TASK_ROWS)) {
      localStorage.setItem(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(initialWorkTaskRows));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MEETINGS)) {
      localStorage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(initialWeeklyMeetings));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MESSAGES)) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(initialChatMessages));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CHANNELS)) {
      localStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(initialChannels));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS)) {
      localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(initialAnnouncements));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EQUIPMENT)) {
      localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(initialEquipment));
    }
    if (!localStorage.getItem(STORAGE_KEYS.DEPARTMENTS)) {
      localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(DEFAULT_DEPARTMENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ROOMS)) {
      localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(initialRooms));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EQUIPMENT_DURATION_DEFAULTS)) {
      localStorage.setItem(
        STORAGE_KEYS.EQUIPMENT_DURATION_DEFAULTS,
        JSON.stringify({ permitMonths: 60, calibrationMonths: 12, radiationSurveyMonths: 12, maintenanceMonths: 3 })
      );
    }
    if (!localStorage.getItem(STORAGE_KEYS.STAFF_PROFILES)) {
      localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(initialStaffProfiles));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS)) {
      localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(initialLeaveRequests));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TRAINING_COURSES)) {
      localStorage.setItem(STORAGE_KEYS.TRAINING_COURSES, JSON.stringify(initialTrainingCourses));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MEETING_ITEMS)) {
      localStorage.setItem(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(initialMeetings));
    }
    if (!localStorage.getItem(STORAGE_KEYS.INTEGRATION_ENDPOINTS)) {
      localStorage.setItem(STORAGE_KEYS.INTEGRATION_ENDPOINTS, JSON.stringify(initialIntegrationEndpoints));
    }
    if (!localStorage.getItem(STORAGE_KEYS.INTEGRATION_PAYLOADS)) {
      localStorage.setItem(STORAGE_KEYS.INTEGRATION_PAYLOADS, JSON.stringify(initialIntegrationPayloads));
    }

    const savedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (savedUserId) {
      const users = this.getUsers();
      const found = users.find(u => u.id === savedUserId);
      if (found) this.currentUser = found;
    }

    if (this.currentUser.role === 'Admin' || this.currentUser.id === 'USR-ADMIN') {
      this.currentUser = {
        ...this.currentUser,
        title: 'Quản trị ứng dụng' as CLSTitle,
        department: 'Bộ phận CNTT & Quản trị Hệ thống',
        avatar: ADMIN_DEFAULT_AVATAR
      };
    }
  }

  // --- Shifts (Lịch trực & Lịch làm việc) ---
  public getShifts(): ShiftDuty[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.SHIFTS);
      const list: ShiftDuty[] = raw ? JSON.parse(raw) : initialShifts;
      const seen = new Set<string>();
      return list.filter(item => {
        if (!item?.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    } catch (e) {
      return initialShifts;
    }
  }

  public saveShift(shift: ShiftDuty): ShiftDuty {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shift.id);
    if (idx >= 0) {
      shifts[idx] = shift;
    } else {
      shifts.unshift(shift);
    }
    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('SAVE_SHIFT', 'Shift', undefined, shift);
    this.notify();
    return shift;
  }

  public deleteShift(shiftId: string): boolean {
    const shifts = this.getShifts();
    const target = shifts.find(s => s.id === shiftId);
    if (!target) return false;

    const filtered = shifts.filter(s => s.id !== shiftId);
    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(filtered));
    this.logAudit('DELETE_SHIFT', 'Shift', target, undefined);
    this.notify();
    return true;
  }

  public duplicateShift(shiftId: string, newDate?: string, newAssignedUserId?: string): ShiftDuty | null {
    const shifts = this.getShifts();
    const target = shifts.find(s => s.id === shiftId);
    if (!target) return null;

    const users = this.getUsers();
    let newUserName = target.assignedUserName || target.userName;
    let newUserRole = target.assignedRole || target.userTitle;

    if (newAssignedUserId) {
      const u = users.find(usr => usr.id === newAssignedUserId);
      if (u) {
        newUserName = u.name;
        newUserRole = u.title || u.role;
      }
    }

    const duplicated: ShiftDuty = {
      ...target,
      id: `SFT-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
      title: `${target.title || target.shiftName || 'Ca làm việc'} (Bản sao)`,
      date: newDate || target.date,
      assignedUserId: newAssignedUserId || target.assignedUserId || target.userId,
      assignedUserName: newUserName,
      assignedRole: newUserRole,
      userName: newUserName,
      userTitle: newUserRole,
      swapRequest: undefined
    };

    shifts.unshift(duplicated);
    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('DUPLICATE_SHIFT', 'Shift', target, duplicated);
    this.notify();
    return duplicated;
  }

  public requestShiftSwap(shiftId: string, targetUserId: string, reason: string): boolean {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shiftId);
    if (idx < 0) return false;

    const users = this.getUsers();
    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) return false;

    const currentShift = shifts[idx];
    const swapReq = {
      id: `SWP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
      shiftId,
      shiftTitle: currentShift.title || currentShift.shiftName || 'Ca làm việc',
      shiftDate: currentShift.date,
      requesterId: this.currentUser.id,
      requesterName: this.currentUser.name,
      targetUserId,
      targetUserName: targetUser.name,
      status: 'Chờ duyệt' as const,
      reason,
      createdAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16)
    };

    shifts[idx] = {
      ...currentShift,
      swapRequest: swapReq
    };

    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('REQUEST_SHIFT_SWAP', 'Shift', currentShift, swapReq);
    this.notify();
    return true;
  }

  public approveShiftSwap(shiftId: string): boolean {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shiftId);
    if (idx < 0) return false;

    const currentShift = shifts[idx];
    if (!currentShift.swapRequest) return false;

    const users = this.getUsers();
    const newAssignee = users.find(u => u.id === currentShift.swapRequest?.targetUserId);

    const updatedSwap = {
      ...currentShift.swapRequest,
      status: 'Đã duyệt' as const,
      approvedBy: this.currentUser.name,
      approvedAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16)
    };

    shifts[idx] = {
      ...currentShift,
      assignedUserId: newAssignee?.id || currentShift.swapRequest.targetUserId,
      assignedUserName: newAssignee?.name || currentShift.swapRequest.targetUserName,
      assignedRole: newAssignee?.title || newAssignee?.role || currentShift.assignedRole,
      userName: newAssignee?.name || currentShift.swapRequest.targetUserName,
      userTitle: newAssignee?.title || currentShift.userTitle,
      userId: newAssignee?.id || currentShift.userId,
      swapRequest: updatedSwap
    };

    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('APPROVE_SHIFT_SWAP', 'Shift', currentShift, shifts[idx]);
    this.notify();
    return true;
  }

  public rejectShiftSwap(shiftId: string): boolean {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shiftId);
    if (idx < 0) return false;

    const currentShift = shifts[idx];
    if (!currentShift.swapRequest) return false;

    shifts[idx] = {
      ...currentShift,
      swapRequest: {
        ...currentShift.swapRequest,
        status: 'Từ chối' as const,
        approvedBy: this.currentUser.name,
        approvedAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16)
      }
    };

    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('REJECT_SHIFT_SWAP', 'Shift', currentShift, shifts[idx]);
    this.notify();
    return true;
  }

  // --- Work Task Rows (Danh Mục / Tên Công Việc Hàng Tuần) ---
  public getWorkTaskRows(): WorkTaskRow[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.WORK_TASK_ROWS);
      return raw ? JSON.parse(raw) : initialWorkTaskRows;
    } catch (e) {
      return initialWorkTaskRows;
    }
  }

  public saveWorkTaskRow(row: WorkTaskRow): WorkTaskRow {
    const rows = this.getWorkTaskRows();
    const idx = rows.findIndex(r => r.id === row.id);
    if (idx >= 0) {
      rows[idx] = row;
    } else {
      rows.push(row);
    }
    this.writeBucketRaw(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(rows));
    this.logAudit('SAVE_WORK_TASK_ROW', 'Setting', undefined, row);
    this.notify();
    return row;
  }

  public deleteWorkTaskRow(rowId: string): boolean {
    const rows = this.getWorkTaskRows();
    const filtered = rows.filter(r => r.id !== rowId);
    this.writeBucketRaw(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(filtered));
    this.logAudit('DELETE_WORK_TASK_ROW', 'Setting', { id: rowId }, undefined);
    this.notify();
    return true;
  }

  public resetWorkTaskRows(): WorkTaskRow[] {
    this.writeBucketRaw(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(initialWorkTaskRows));
    this.notify();
    return initialWorkTaskRows;
  }

  // Carry over schedule / task rows to next week
  public copyWeeklyScheduleToNextWeek(currentWeekMondayStr: string): { newWeekMonday: string; createdCount: number } {
    const currentMonday = new Date(currentWeekMondayStr);
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(currentMonday.getDate() + 7);

    const activeRows = this.getWorkTaskRows();
    const shifts = this.getShifts();

    let createdCount = 0;

    // For each day of current week (0..6), find shifts and copy them to next week's corresponding day
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const srcDate = new Date(currentMonday);
      srcDate.setDate(currentMonday.getDate() + dayIndex);
      const srcDateStr = srcDate.toISOString().split('T')[0];

      const tgtDate = new Date(nextMonday);
      tgtDate.setDate(nextMonday.getDate() + dayIndex);
      const tgtDateStr = tgtDate.toISOString().split('T')[0];

      // Get shifts belonging to current week date
      const srcShifts = shifts.filter(s => s.date === srcDateStr);

      for (const s of srcShifts) {
        // If shift belongs to a task row, check if that task row is still active (not deleted)
        if (s.taskRowId) {
          const rowExists = activeRows.some(r => r.id === s.taskRowId);
          if (!rowExists) continue; // Skip deleted task rows!
        }

        // Create new shift for next week
        const newShift: ShiftDuty = {
          ...s,
          id: `SFT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
          date: tgtDateStr,
          status: 'Đã phân công',
          swapRequest: undefined
        };

        shifts.unshift(newShift);
        createdCount++;
      }
    }

    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.notify();
    return {
      newWeekMonday: nextMonday.toISOString().split('T')[0],
      createdCount
    };
  }

  // --- Weekly Meetings & Plans (Lịch họp & Kế hoạch tuần) ---
  public getMeetings(): WeeklyMeeting[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.MEETINGS);
      return raw ? JSON.parse(raw) : initialWeeklyMeetings;
    } catch (e) {
      return initialWeeklyMeetings;
    }
  }

  public saveMeeting(meeting: WeeklyMeeting): WeeklyMeeting {
    const meetings = this.getMeetings();
    const idx = meetings.findIndex(m => m.id === meeting.id);
    if (idx >= 0) {
      meetings[idx] = meeting;
    } else {
      meetings.unshift(meeting);
    }
    this.writeBucketRaw(STORAGE_KEYS.MEETINGS, JSON.stringify(meetings));
    this.logAudit('SAVE_MEETING', 'Task', undefined, meeting);
    this.notify();
    return meeting;
  }

  // --- Chat Channels & Groups ---
  public getChannels(): ChatGroupChannel[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.CHANNELS);
      return raw ? JSON.parse(raw) : initialChannels;
    } catch (e) {
      return initialChannels;
    }
  }

  public saveChannel(channel: ChatGroupChannel): ChatGroupChannel {
    const channels = this.getChannels();
    const idx = channels.findIndex(c => c.id === channel.id);
    if (idx >= 0) {
      channels[idx] = channel;
    } else {
      channels.push(channel);
      this.logAudit('CREATE_CHAT_GROUP', 'System', undefined, { id: channel.id, name: channel.name });
    }
    this.writeBucketRaw(STORAGE_KEYS.CHANNELS, JSON.stringify(channels));
    this.notify();
    return channel;
  }

  public deleteChannel(channelId: string): boolean {
    const channels = this.getChannels();
    const filtered = channels.filter(c => c.id !== channelId);
    this.writeBucketRaw(STORAGE_KEYS.CHANNELS, JSON.stringify(filtered));
    this.logAudit('DELETE_CHAT_GROUP', 'System', { channelId });
    this.notify();
    return true;
  }

  // --- Department Announcements ---
  public getAnnouncements(): DepartmentAnnouncement[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.ANNOUNCEMENTS);
      return raw ? JSON.parse(raw) : initialAnnouncements;
    } catch (e) {
      return initialAnnouncements;
    }
  }

  public saveAnnouncement(announcement: DepartmentAnnouncement): DepartmentAnnouncement {
    const announcements = this.getAnnouncements();
    const idx = announcements.findIndex(a => a.id === announcement.id);
    if (idx >= 0) {
      announcements[idx] = announcement;
    } else {
      announcements.unshift(announcement);
      this.logAudit('CREATE_ANNOUNCEMENT', 'System', undefined, announcement);
    }
    this.writeBucketRaw(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(announcements));
    this.notify();
    return announcement;
  }

  // --- Chat Messages (Direct & Group) ---
  public getChatMessages(): ChatChannelMessage[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.MESSAGES);
      return raw ? JSON.parse(raw) : initialChatMessages;
    } catch (e) {
      return initialChatMessages;
    }
  }

  public sendChatMessage(params: {
    channelId?: string;
    channelName?: string;
    dmUserId?: string;
    dmUserName?: string;
    content: string;
    msgType?: MessageType;
    fileUrl?: string;
    fileName?: string;
    fileSize?: string;
    shareCard?: ShareCardData;
    mentions?: string[];
    isUrgent?: boolean;
  }): ChatChannelMessage {
    const msgs = this.getChatMessages();
    const newMsg: ChatChannelMessage = {
      id: this.nextUniqueId('MSG'),
      channelId: params.channelId,
      channelName: params.channelName,
      dmUserId: params.dmUserId,
      dmUserName: params.dmUserName,
      senderId: this.currentUser.id,
      senderName: this.currentUser.name,
      senderRole: this.currentUser.title || this.currentUser.role,
      avatar: this.currentUser.avatar,
      content: params.content,
      timestamp: 'Vừa xong',
      msgType: params.msgType || 'text',
      fileUrl: params.fileUrl,
      fileName: params.fileName,
      fileSize: params.fileSize,
      shareCard: params.shareCard,
      mentions: params.mentions,
      isUrgent: params.isUrgent,
      isRead: false,
      isUnread: false,
      reactions: [],
      replies: []
    };

    msgs.push(newMsg);
    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.logAudit('SEND_CHAT_MESSAGE', 'System', undefined, { id: newMsg.id, channelId: params.channelId, dmUserId: params.dmUserId });
    this.notify();
    return newMsg;
  }

  public addMessageReaction(messageId: string, emoji: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    const msg = msgs[idx];
    let reactions = msg.reactions || [];
    const rIndex = reactions.findIndex(r => r.emoji === emoji);

    if (rIndex >= 0) {
      const existing = reactions[rIndex];
      const userHasReacted = existing.users.includes(this.currentUser.name);
      if (userHasReacted) {
        // Toggle off
        existing.users = existing.users.filter(u => u !== this.currentUser.name);
        existing.count = existing.users.length;
        if (existing.count === 0) {
          reactions.splice(rIndex, 1);
        }
      } else {
        existing.users.push(this.currentUser.name);
        existing.count = existing.users.length;
      }
    } else {
      reactions.push({
        emoji,
        count: 1,
        users: [this.currentUser.name]
      });
    }

    msgs[idx] = { ...msg, reactions };
    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.notify();
  }

  public togglePinMessage(messageId: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    msgs[idx] = { ...msgs[idx], isPinned: !msgs[idx].isPinned };
    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.logAudit('TOGGLE_PIN_MESSAGE', 'System', undefined, { messageId, isPinned: msgs[idx].isPinned });
    this.notify();
  }

  public toggleSaveMessage(messageId: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    msgs[idx] = { ...msgs[idx], isSaved: !msgs[idx].isSaved };
    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.notify();
  }

  public editChatMessage(messageId: string, newContent: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    const msg = msgs[idx];
    const history = msg.editHistory || [];
    history.push(msg.content);

    msgs[idx] = {
      ...msg,
      content: newContent,
      editedAt: 'Vừa xong',
      editHistory: history
    };

    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.logAudit('EDIT_CHAT_MESSAGE', 'System', { old: msg.content }, { new: newContent });
    this.notify();
  }

  public deleteChatMessage(messageId: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    msgs[idx] = {
      ...msgs[idx],
      content: 'Tin nhắn này đã bị xóa bởi người gửi.',
      isDeleted: true
    };

    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.logAudit('DELETE_CHAT_MESSAGE', 'System', { messageId });
    this.notify();
  }

  public addThreadReply(messageId: string, content: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    const msg = msgs[idx];
    const replies = msg.replies || [];
    replies.push({
      id: this.nextUniqueId('RPL'),
      senderId: this.currentUser.id,
      senderName: this.currentUser.name,
      senderRole: this.currentUser.title || this.currentUser.role,
      avatar: this.currentUser.avatar,
      content,
      timestamp: 'Vừa xong',
      reactions: []
    });

    msgs[idx] = { ...msg, replies };
    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.notify();
  }

  public markMessagesAsRead(channelIdOrDmId?: string) {
    const msgs = this.getChatMessages();
    const updated = msgs.map(m => {
      if (!channelIdOrDmId || m.channelId === channelIdOrDmId || m.dmUserId === channelIdOrDmId) {
        return { ...m, isRead: true, isUnread: false };
      }
      return m;
    });
    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    this.notify();
  }

  // --- Current Active User Context ---
  public getCurrentUser(): User {
    if (this.currentUser.role === 'Admin' || this.currentUser.id === 'USR-ADMIN') {
      if (
        this.currentUser.title === 'Trưởng khoa' ||
        this.currentUser.department?.includes('Ban Chủ Nhiệm') ||
        !this.currentUser.avatar?.startsWith('data:image/svg')
      ) {
        this.currentUser = {
          ...this.currentUser,
          title: 'Quản trị ứng dụng' as CLSTitle,
          department: 'Bộ phận CNTT & Quản trị Hệ thống',
          avatar: ADMIN_DEFAULT_AVATAR
        };
      }
    }
    return this.currentUser;
  }

  public setCurrentUser(user: User) {
    if (user.role === 'Admin' || user.id === 'USR-ADMIN') {
      user = {
        ...user,
        title: 'Quản trị ứng dụng' as CLSTitle,
        department: 'Bộ phận CNTT & Quản trị Hệ thống',
        avatar: ADMIN_DEFAULT_AVATAR
      };
    }
    this.currentUser = user;
    this.writeBucketRaw(STORAGE_KEYS.CURRENT_USER, user.id);
    this.notify();
  }

  // --- Safe LocalStorage Wrapper to Prevent QuotaExceededError ---
  public safeSetItem(key: string, value: string): void {
    const bucketKey = STORAGE_KEY_TO_BUCKET[key];
    if (this.serverModeEnabled && bucketKey) {
      this.memoryBuckets[bucketKey] = value;
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[StorageService] Dung lượng lưu trữ đầy đối với "${key}", đang tự động tối ưu hóa...`, e);
      try {
        // Tự động thu gọn nhật ký để giải phóng dung lượng ngay lập tức (chỉ khi không dùng PostgreSQL)
        localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
        localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
        localStorage.setItem(key, value);
      } catch (innerErr) {
        console.error(`[StorageService] Không thể ghi dữ liệu vào "${key}":`, innerErr);
      }
    }
  }

  private sanitizeForAudit(data: any): any {
    if (!data || typeof data !== 'object') return data;
    try {
      const copy = { ...data };
      if ('rawFileData' in copy) delete copy.rawFileData;
      if (typeof copy.driveUrl === 'string' && copy.driveUrl.startsWith('data:')) {
        copy.driveUrl = '[DỮ_LIỆU_TỆP_ĐÃ_LƯU_TRỮ]';
      }
      if (Array.isArray(copy.versionHistory)) {
        copy.versionHistory = copy.versionHistory.map((vh: any) => ({
          ...vh,
          fileUrl: vh.fileUrl && typeof vh.fileUrl === 'string' && vh.fileUrl.startsWith('data:') ? '#' : vh.fileUrl
        }));
      }
      return copy;
    } catch (e) {
      return undefined;
    }
  }

  // --- Audit Logging ---
  public logAudit(action: string, module: 'Task' | 'Document' | 'User' | 'Shift' | 'Setting' | 'System' | 'Equipment' | 'Room' | 'HR' | 'Meeting' | 'Integration', oldData?: any, newData?: any) {
    const logs = this.getAuditLogs();
    const sanitizedOld = oldData ? this.sanitizeForAudit(oldData) : undefined;
    const sanitizedNew = newData ? this.sanitizeForAudit(newData) : undefined;
    const browserHost = typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'Phiên trình duyệt';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const deviceLabel = /Edg\//.test(ua)
      ? 'Microsoft Edge'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua) && !/Chrome\//.test(ua)
          ? 'Safari'
          : 'Chrome / Chromium';
    const osLabel = /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Windows';
    const newLog: AuditLogItem = {
      id: this.nextUniqueId('LOG'),
      userEmail: this.currentUser.email,
      userName: this.currentUser.name,
      userRole: this.currentUser.role,
      action,
      module,
      timestamp: new Date().toLocaleString('sv-SE').replace('T', ' '),
      ipAddress: `Trình duyệt (${browserHost})`,
      device: `${deviceLabel} (${osLabel})`,
      oldData: sanitizedOld ? JSON.stringify(sanitizedOld) : undefined,
      newData: sanitizedNew ? JSON.stringify(sanitizedNew) : undefined
    };
    logs.unshift(newLog);
    this.safeSetItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs.slice(0, 250)));
    this.notify();
  }

  public getAuditLogs(): AuditLogItem[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.AUDIT_LOGS);
      const parsed: AuditLogItem[] = raw ? JSON.parse(raw) : [];
      return this.ensureUniqueIds(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      return this.ensureUniqueIds(initialAuditLogs);
    }
  }

  // --- Tasks CRUD & Operations ---
  public getTasks(): TaskItem[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.TASKS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return initialTasks;
    }
  }

  public saveTask(task: TaskItem): TaskItem {
    const tasks = this.getTasks();
    const existingIndex = tasks.findIndex(t => t.id === task.id);
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);

    let updatedTask: TaskItem;
    if (existingIndex >= 0) {
      const oldTask = tasks[existingIndex];
      updatedTask = { ...task, updatedDate: now };
      tasks[existingIndex] = updatedTask;
      this.logAudit('UPDATE_TASK', 'Task', oldTask, updatedTask);
    } else {
      updatedTask = {
        ...task,
        id: task.id || `TSK-${Math.floor(1000 + Math.random() * 9000)}`,
        createdDate: now,
        updatedDate: now,
        creator: this.currentUser.name
      };
      tasks.unshift(updatedTask);
      this.logAudit('CREATE_TASK', 'Task', undefined, updatedTask);
    }

    this.writeBucketRaw(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    this.notify();
    return updatedTask;
  }

  public deleteTask(taskId: string): boolean {
    const tasks = this.getTasks();
    const target = tasks.find(t => t.id === taskId);
    if (!target) return false;

    const filtered = tasks.filter(t => t.id !== taskId);
    this.writeBucketRaw(STORAGE_KEYS.TASKS, JSON.stringify(filtered));
    this.logAudit('DELETE_TASK', 'Task', target, undefined);
    this.notify();
    return true;
  }

  public bulkDeleteTasks(taskIds: string[]): number {
    const tasks = this.getTasks();
    const toDelete = tasks.filter(t => taskIds.includes(t.id));
    const remaining = tasks.filter(t => !taskIds.includes(t.id));

    this.writeBucketRaw(STORAGE_KEYS.TASKS, JSON.stringify(remaining));
    this.logAudit(`BULK_DELETE_TASKS (${taskIds.length})`, 'Task', toDelete, undefined);
    this.notify();
    return toDelete.length;
  }

  public bulkCompleteTasks(taskIds: string[]): number {
    const tasks = this.getTasks();
    let count = 0;
    const updated = tasks.map(t => {
      if (taskIds.includes(t.id) && t.status !== 'Đã hoàn thành') {
        count++;
        return { ...t, status: 'Đã hoàn thành' as const, updatedDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16) };
      }
      return t;
    });

    this.writeBucketRaw(STORAGE_KEYS.TASKS, JSON.stringify(updated));
    this.logAudit(`BULK_COMPLETE_TASKS (${count})`, 'Task', undefined, { completedIds: taskIds });
    this.notify();
    return count;
  }

  public duplicateTask(taskId: string): TaskItem | null {
    const tasks = this.getTasks();
    const target = tasks.find(t => t.id === taskId);
    if (!target) return null;

    const newId = `TSK-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
    const duplicated: TaskItem = {
      ...target,
      id: newId,
      title: `${target.title} (Bản sao)`,
      status: 'Chờ xử lý',
      createdDate: now,
      updatedDate: now,
      creator: this.currentUser.name
    };

    tasks.unshift(duplicated);
    this.writeBucketRaw(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    this.logAudit('DUPLICATE_TASK', 'Task', target, duplicated);
    this.notify();
    return duplicated;
  }

  // --- Documents CRUD & Operations ---
  public getDocuments(): DocumentItem[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.DOCUMENTS);
      if (raw === null) {
        return initialDocuments;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((d: DocumentItem) => ({
        ...d,
        syncStatus: d.syncStatus || 'synced',
        lastSyncedAt: d.lastSyncedAt || d.uploadDate || '2026-11-10 16:45',
        checksum: d.checksum || `sha256_${Math.random().toString(36).substr(2, 10)}`,
        driveFolderId: d.driveFolderId || this.getSettings().googleDriveFolderId || '1CLSWorkHub_MainFolder_GoogleDrive_ID'
      }));
    } catch (e) {
      return initialDocuments;
    }
  }

  public saveDocument(doc: DocumentItem): DocumentItem {
    const docs = this.getDocuments();
    const existingIndex = docs.findIndex(d => d.id === doc.id);
    const settings = this.getSettings();
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);

    let updatedDoc: DocumentItem;
    if (existingIndex >= 0) {
      const oldDoc = docs[existingIndex];
      updatedDoc = { 
        ...doc,
        syncStatus: doc.syncStatus || 'synced',
        lastSyncedAt: doc.lastSyncedAt || now,
        checksum: doc.checksum || `sha256_${Math.random().toString(36).substr(2, 10)}`,
        driveFolderId: doc.driveFolderId || settings.googleDriveFolderId || '1CLSWorkHub_MainFolder_GoogleDrive_ID'
      };
      const sanitizedDoc = { ...updatedDoc };
      delete sanitizedDoc.rawFileData;
      if (typeof sanitizedDoc.driveUrl === 'string' && sanitizedDoc.driveUrl.startsWith('data:')) {
        sanitizedDoc.driveUrl = `https://drive.google.com/file/d/${sanitizedDoc.driveFileId}/view`;
      }
      docs[existingIndex] = sanitizedDoc;
      this.logAudit('UPDATE_DOCUMENT', 'Document', oldDoc, sanitizedDoc);
    } else {
      updatedDoc = {
        ...doc,
        id: doc.id || `DOC-${Math.floor(2000 + Math.random() * 8000)}`,
        owner: doc.owner || this.currentUser.name,
        uploadDate: new Date().toISOString().split('T')[0],
        syncStatus: doc.syncStatus || 'synced',
        lastSyncedAt: now,
        checksum: doc.checksum || `sha256_${Math.random().toString(36).substr(2, 10)}`,
        driveFolderId: doc.driveFolderId || settings.googleDriveFolderId || '1CLSWorkHub_MainFolder_GoogleDrive_ID'
      };
      const sanitizedDoc = { ...updatedDoc };
      delete sanitizedDoc.rawFileData;
      if (typeof sanitizedDoc.driveUrl === 'string' && sanitizedDoc.driveUrl.startsWith('data:')) {
        sanitizedDoc.driveUrl = `https://drive.google.com/file/d/${sanitizedDoc.driveFileId}/view`;
      }
      docs.unshift(sanitizedDoc);
      this.logAudit('UPLOAD_DOCUMENT', 'Document', undefined, sanitizedDoc);
    }

    this.safeSetItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
    this.notify();
    return updatedDoc;
  }

  public syncDocumentToDrive(docId: string): DocumentItem | null {
    const docs = this.getDocuments();
    const idx = docs.findIndex(d => d.id === docId);
    if (idx === -1) return null;

    const settings = this.getSettings();
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
    const updated: DocumentItem = {
      ...docs[idx],
      syncStatus: 'synced',
      lastSyncedAt: now,
      driveFileId: docs[idx].driveFileId?.startsWith('drive_') || !docs[idx].driveFileId 
        ? `1Drive_${Math.random().toString(36).substr(2, 9)}_${docs[idx].id.replace('-', '')}` 
        : docs[idx].driveFileId,
      driveFolderId: settings.googleDriveFolderId || '1CLSWorkHub_MainFolder_GoogleDrive_ID',
      checksum: `sha256_${Math.random().toString(36).substr(2, 12)}`
    };

    docs[idx] = updated;
    this.safeSetItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
    this.logAudit('SYNC_DOCUMENT_DRIVE', 'Document', undefined, { docId, driveFileId: updated.driveFileId, syncedAt: now });
    this.notify();
    return updated;
  }

  public syncAllDocumentsToDrive(): DocumentItem[] {
    const docs = this.getDocuments();
    const settings = this.getSettings();
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);

    const syncedDocs = docs.map(d => ({
      ...d,
      syncStatus: 'synced' as const,
      lastSyncedAt: now,
      driveFileId: d.driveFileId?.startsWith('drive_') || !d.driveFileId 
        ? `1Drive_${Math.random().toString(36).substr(2, 9)}_${d.id.replace('-', '')}` 
        : d.driveFileId,
      driveFolderId: settings.googleDriveFolderId || '1CLSWorkHub_MainFolder_GoogleDrive_ID',
      checksum: d.checksum || `sha256_${Math.random().toString(36).substr(2, 12)}`
    }));

    this.safeSetItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(syncedDocs));
    this.logAudit('SYNC_ALL_DOCUMENTS_DRIVE', 'Document', undefined, { totalCount: syncedDocs.length, syncedAt: now });
    this.notify();
    return syncedDocs;
  }

  public deleteDocument(docId: string): boolean {
    const docs = this.getDocuments();
    const target = docs.find(d => d.id === docId);
    if (!target) return false;

    const filtered = docs.filter(d => d.id !== docId);
    this.safeSetItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(filtered));
    this.logAudit('DELETE_DOCUMENT', 'Document', target, undefined);
    this.notify();
    return true;
  }

  // --- Notifications Log ---
  public getNotifications(): NotificationLog[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.NOTIFICATIONS);
      const parsed: NotificationLog[] = raw ? JSON.parse(raw) : [];
      return this.ensureUniqueIds(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      return this.ensureUniqueIds(initialNotifications);
    }
  }

  public sendNotification(notif: Omit<NotificationLog, 'id' | 'sentAt'>): NotificationLog {
    const logs = this.getNotifications();
    const newNotif: NotificationLog = {
      ...notif,
      id: this.nextUniqueId('NOTIF'),
      sentAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16)
    };
    logs.unshift(newNotif);
    this.writeBucketRaw(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(logs));
    this.logAudit(`SEND_NOTIFICATION_${notif.channel.toUpperCase()}`, 'System', undefined, newNotif);
    this.notify();
    return newNotif;
  }

  public deleteNotification(notifId: string): void {
    const next = this.getNotifications().filter((n) => n.id !== notifId);
    this.safeSetItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(next));
    this.notify();
  }

  public clearNotifications(): void {
    this.safeSetItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
    this.logAudit('CLEAR_NOTIFICATIONS', 'System', undefined, {
      note: 'Đã xóa toàn bộ lịch sử phát thông báo.'
    });
    this.notify();
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.SETTINGS);
      return raw ? JSON.parse(raw) : initialSettings;
    } catch (e) {
      return initialSettings;
    }
  }

  public saveSettings(settings: AppSettings) {
    const old = this.getSettings();
    this.writeBucketRaw(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    this.logAudit('UPDATE_SETTINGS', 'Setting', old, settings);
    this.notify();
  }

  // --- AI Assistant Learned Memory (Synced with Cloud Settings) ---
  public getAssistantMemories(): AssistantMemoryItem[] {
    const settings = this.getSettings();
    return Array.isArray(settings.assistantMemories) ? settings.assistantMemories : [];
  }

  public addAssistantMemory(params: {
    content: string;
    category?: AssistantMemoryCategory;
    source?: AssistantMemoryItem['source'];
  }): AssistantMemoryItem[] {
    const clean = (params.content || '').trim().replace(/\s+/g, ' ');
    if (!clean || clean.length < 3) return this.getAssistantMemories();

    const settings = this.getSettings();
    const current = Array.isArray(settings.assistantMemories) ? settings.assistantMemories : [];
    const normalizedNew = clean.toLowerCase();
    const existingIdx = current.findIndex((m) => m.content.trim().toLowerCase() === normalizedNew);
    const nowStr = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);

    let next: AssistantMemoryItem[];
    if (existingIdx >= 0) {
      const updated: AssistantMemoryItem = {
        ...current[existingIdx],
        category: params.category || current[existingIdx].category,
        updatedAt: nowStr
      };
      next = [updated, ...current.filter((_, idx) => idx !== existingIdx)].slice(0, 60);
    } else {
      const created: AssistantMemoryItem = {
        id: this.nextUniqueId('AIMEM'),
        category: params.category || 'fact',
        content: clean.slice(0, 400),
        source: params.source || 'auto',
        createdAt: nowStr
      };
      next = [created, ...current].slice(0, 60);
    }

    this.writeBucketRaw(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ...settings, assistantMemories: next })
    );
    this.notify();
    return next;
  }

  public deleteAssistantMemory(id: string): AssistantMemoryItem[] {
    const settings = this.getSettings();
    const current = Array.isArray(settings.assistantMemories) ? settings.assistantMemories : [];
    const next = current.filter((m) => m.id !== id);
    this.writeBucketRaw(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ...settings, assistantMemories: next })
    );
    this.notify();
    return next;
  }

  public clearAssistantMemories(): void {
    const settings = this.getSettings();
    this.writeBucketRaw(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ...settings, assistantMemories: [] })
    );
    this.notify();
  }

  // --- Authentication & Password Management ---
  public isAuthenticated(): boolean {
    return this.sessionAuthenticated;
  }

  public setAuthenticated(status: boolean): void {
    this.sessionAuthenticated = status;
    this.notify();
  }

  public login(email: string, password: string): { success: boolean; message: string; user?: User } {
    const users = this.getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());

    if (!user) {
      return { success: false, message: 'Email không tồn tại trong hệ thống' };
    }

    if (isUserAccountBlockedOrResigned(user, this.getStaffProfiles())) {
      return { success: false, message: 'Tài khoản nhân viên đã nghỉ việc hoặc ngừng hoạt động.' };
    }

    const validPassword = user.password || '123456';
    if (password !== validPassword) {
      return { success: false, message: 'Mật khẩu không chính xác' };
    }

    this.setCurrentUser(user);
    this.setAuthenticated(true);
    this.logAudit('USER_LOGIN', 'User', undefined, { email: user.email, name: user.name });
    return { success: true, message: 'Đăng nhập thành công', user };
  }

  public loginById(userId: string, password: string): { success: boolean; message: string; user?: User } {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return { success: false, message: 'Không tìm thấy thông tin cán bộ trong hệ thống' };
    }

    if (isUserAccountBlockedOrResigned(user, this.getStaffProfiles())) {
      return { success: false, message: 'Tài khoản nhân viên đã nghỉ việc hoặc ngừng hoạt động.' };
    }

    const validPassword = user.password || '123456';
    if (password !== validPassword) {
      return { success: false, message: 'Mật khẩu không chính xác! (Mật khẩu mặc định: 123456)' };
    }

    this.setCurrentUser(user);
    this.setAuthenticated(true);
    this.logAudit('USER_LOGIN', 'User', undefined, { userId: user.id, name: user.name, role: user.role });
    return { success: true, message: `Đăng nhập thành công: ${user.name}`, user };
  }

  public logout(): void {
    this.logAudit('USER_LOGOUT', 'User', undefined, { userId: this.currentUser.id, name: this.currentUser.name });
    this.setAuthenticated(false);
  }

  public changePassword(userId: string, oldPassword: string, newPassword: string): { success: boolean; message: string } {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0) {
      return { success: false, message: 'Không tìm thấy người dùng' };
    }

    const currentPass = users[idx].password || '123456';
    if (oldPassword !== currentPass) {
      return { success: false, message: 'Mật khẩu hiện tại không đúng' };
    }

    users[idx] = {
      ...users[idx],
      password: newPassword,
      resetRequested: false,
      resetRequestNote: undefined
    };

    this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(users));
    if (this.currentUser.id === userId) {
      this.currentUser = users[idx];
    }
    this.logAudit('CHANGE_PASSWORD', 'User', undefined, { userId, name: users[idx].name });
    this.notify();
    return { success: true, message: 'Đổi mật khẩu thành công!' };
  }

  public requestPasswordReset(email: string, note?: string): { success: boolean; message: string } {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase().trim());
    if (idx < 0) {
      return { success: false, message: 'Email không tồn tại trong hệ thống' };
    }

    users[idx] = {
      ...users[idx],
      resetRequested: true,
      resetRequestNote: note || 'Yêu cầu khôi phục mật khẩu từ trang đăng nhập'
    };

    this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(users));
    this.logAudit('REQUEST_PASSWORD_RESET', 'User', undefined, { email, note });
    this.notify();
    return { success: true, message: 'Đã gửi yêu cầu reset mật khẩu tới Admin. Vui lòng liên hệ Admin để nhận mật khẩu mới.' };
  }

  public resetUserPassword(userId: string, newPassword: string): { success: boolean; message: string } {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0) {
      return { success: false, message: 'Không tìm thấy tài khoản người dùng' };
    }

    users[idx] = {
      ...users[idx],
      password: newPassword,
      resetRequested: false,
      resetRequestNote: undefined
    };

    this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(users));
    if (this.currentUser.id === userId) {
      this.currentUser = users[idx];
    }
    this.logAudit('ADMIN_RESET_PASSWORD', 'User', undefined, {
      userId,
      targetName: users[idx].name,
      reset: true
    });
    this.notify();
    return { success: true, message: `Đã đặt lại mật khẩu thành công cho tài khoản ${users[idx].name}` };
  }

  // --- Users List ---
  public getUsers(): User[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.USERS);
      const users: User[] = raw ? JSON.parse(raw) : [...initialUsers];

      // Merge with staff profiles if present so all hospital personnel can log in
      const staffRaw = this.readBucketRaw(STORAGE_KEYS.STAFF_PROFILES);
      if (staffRaw) {
        const staffList: StaffProfile[] = JSON.parse(staffRaw);
        for (const s of staffList) {
          const isInactive = isResignedOrEndedStaff(s);
          const existingIdx = users.findIndex(u => u.id === s.userId || u.name === s.fullName);
          if (existingIdx < 0) {
            users.push({
              id: s.userId,
              name: s.fullName,
              email: s.email || `${s.userId.toLowerCase()}@hospital.vn`,
              role: (s.role as UserRole) || 'Staff',
              title: (s.title as CLSTitle) || 'Nhân viên',
              department: s.departmentSection || 'Khoa Cận Lâm Sàng',
              room: s.room,
              phone: s.phone,
              avatar: s.avatar || 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80',
              status: isInactive ? 'Inactive' : 'Active',
              password: '123456',
              managementLevel: s.managementLevel,
              managedDepartments: s.managedDepartments,
              managedRooms: s.managedRooms,
              permissionOverrides: s.permissionOverrides,
            });
          } else if (users[existingIdx].id !== 'USR-ADMIN' && users[existingIdx].role !== 'Admin') {
            users[existingIdx] = {
              ...users[existingIdx],
              status: isInactive ? 'Inactive' : users[existingIdx].status,
              managementLevel: users[existingIdx].managementLevel ?? s.managementLevel,
              managedDepartments: users[existingIdx].managedDepartments ?? s.managedDepartments,
              managedRooms: users[existingIdx].managedRooms ?? s.managedRooms,
              permissionOverrides: users[existingIdx].permissionOverrides ?? s.permissionOverrides,
            };
          }
        }
      }

      // Deduplicate by user ID
      const uniqueMap = new Map<string, User>();
      for (const u of users) {
        if (!uniqueMap.has(u.id)) {
          uniqueMap.set(u.id, u);
        }
      }

      return Array.from(uniqueMap.values()).map(u => {
        if (u.role === 'Admin' || u.id === 'USR-ADMIN') {
          return {
            ...u,
            title: 'Quản trị ứng dụng' as CLSTitle,
            department: 'Bộ phận CNTT & Quản trị Hệ thống',
            avatar: ADMIN_DEFAULT_AVATAR
          };
        }
        return {
          ...u,
          avatar: u.avatar?.includes('1594824813566')
            ? 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150&auto=format&fit=crop&q=80'
            : u.avatar
        };
      });
    } catch (e) {
      return initialUsers;
    }
  }

  public saveUser(user: User): User {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(users));

    // Sync RBAC & department/room fields back to matching StaffProfile if it exists
    try {
      const profiles = this.getStaffProfiles();
      const pIdx = profiles.findIndex(
        p => p.userId === user.id || (user.name && p.fullName.trim().toLowerCase() === user.name.trim().toLowerCase())
      );
      if (pIdx >= 0) {
        profiles[pIdx] = {
          ...profiles[pIdx],
          role: user.role,
          title: user.title || profiles[pIdx].title,
          departmentSection: user.department || profiles[pIdx].departmentSection,
          room: user.room ?? profiles[pIdx].room,
          managementLevel: user.managementLevel,
          managedDepartments: user.managedDepartments,
          managedRooms: user.managedRooms,
          permissionOverrides: user.permissionOverrides,
        };
        this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(profiles));
      }
    } catch (e) {
      // ignore staff profile sync error
    }

    if (this.currentUser.id === user.id) {
      this.currentUser = user;
    }

    this.logAudit('UPDATE_USER', 'User', undefined, user);
    this.notify();
    return user;
  }

  // --- Equipment & Machine Management ---
  public getEquipment(): EquipmentItem[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.EQUIPMENT);
      if (!raw) return initialEquipment;
      const parsed: EquipmentItem[] = JSON.parse(raw);
      const seen = new Set<string>();
      const uniqueParsed = parsed.filter(item => {
        if (!item?.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      // Merge with initial data to ensure complete fields if stored from older version
      return uniqueParsed.map(item => {
        const seed = initialEquipment.find(e => e.id === item.id);
        if (!seed) return item;
        return {
          ...seed,
          ...item,
          managerInCharge: item.managerInCharge || seed.managerInCharge,
          purchaseDate: item.purchaseDate || seed.purchaseDate,
          purchasePrice: item.purchasePrice || seed.purchasePrice,
          supplier: item.supplier || seed.supplier,
          originCountry: item.originCountry || seed.originCountry,
          yearOfManufacture: item.yearOfManufacture || seed.yearOfManufacture,
          warrantyExpiry: item.warrantyExpiry || seed.warrantyExpiry,
          operatingPermitNumber: item.operatingPermitNumber || seed.operatingPermitNumber,
          operatingPermitIssueDate: item.operatingPermitIssueDate || seed.operatingPermitIssueDate,
          operatingPermitDurationMonths: item.operatingPermitDurationMonths ?? seed.operatingPermitDurationMonths,
          operatingPermitExpiry: item.operatingPermitExpiry || seed.operatingPermitExpiry,
          radiationLicenseNumber: item.radiationLicenseNumber || seed.radiationLicenseNumber,
          radiationLicenseIssuedBy: item.radiationLicenseIssuedBy || seed.radiationLicenseIssuedBy,
          radiationSurveyDate: item.radiationSurveyDate || seed.radiationSurveyDate,
          radiationSurveyIntervalMonths: item.radiationSurveyIntervalMonths ?? seed.radiationSurveyIntervalMonths,
          radiationSurveyExpiry: item.radiationSurveyExpiry || seed.radiationSurveyExpiry,
          calibrationNumber: item.calibrationNumber || seed.calibrationNumber,
          calibrationDate: item.calibrationDate || seed.calibrationDate,
          calibrationIntervalMonths: item.calibrationIntervalMonths ?? seed.calibrationIntervalMonths,
          calibrationIssuedBy: item.calibrationIssuedBy || seed.calibrationIssuedBy,
          powerSupply: item.powerSupply || seed.powerSupply,
          specifications: item.specifications || seed.specifications,
          notes: item.notes ?? seed.notes,
          maintenanceHistory: (item.maintenanceHistory && item.maintenanceHistory.length > 0) ? item.maintenanceHistory : seed.maintenanceHistory,
          repairHistory: (item.repairHistory && item.repairHistory.length > 0) ? item.repairHistory : seed.repairHistory
        };
      });
    } catch (e) {
      return initialEquipment;
    }
  }

  public getEquipmentDurationDefaults(): EquipmentDurationDefaults {
    const fallback: EquipmentDurationDefaults = {
      permitMonths: 60,
      calibrationMonths: 12,
      radiationSurveyMonths: 12,
      maintenanceMonths: 3
    };
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.EQUIPMENT_DURATION_DEFAULTS);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        permitMonths: Number(parsed.permitMonths) > 0 ? Number(parsed.permitMonths) : fallback.permitMonths,
        calibrationMonths: Number(parsed.calibrationMonths) > 0 ? Number(parsed.calibrationMonths) : fallback.calibrationMonths,
        radiationSurveyMonths: Number(parsed.radiationSurveyMonths) > 0 ? Number(parsed.radiationSurveyMonths) : fallback.radiationSurveyMonths,
        maintenanceMonths: Number(parsed.maintenanceMonths) > 0 ? Number(parsed.maintenanceMonths) : fallback.maintenanceMonths
      };
    } catch (e) {
      return fallback;
    }
  }

  public saveEquipmentDurationDefaults(defaults: EquipmentDurationDefaults): EquipmentDurationDefaults {
    const normalized: EquipmentDurationDefaults = {
      permitMonths: Math.max(1, Math.round(Number(defaults.permitMonths) || 60)),
      calibrationMonths: Math.max(1, Math.round(Number(defaults.calibrationMonths) || 12)),
      radiationSurveyMonths: Math.max(1, Math.round(Number(defaults.radiationSurveyMonths) || 12)),
      maintenanceMonths: Math.max(1, Math.round(Number(defaults.maintenanceMonths) || 3))
    };
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT_DURATION_DEFAULTS, JSON.stringify(normalized));
    this.notify();
    return normalized;
  }

  public saveEquipment(item: EquipmentItem): EquipmentItem {
    const list = this.getEquipment();
    const idx = list.findIndex(e => e.id === item.id);
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.unshift(item);
    }
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('SAVE_EQUIPMENT', 'Equipment', undefined, item);
    this.notify();
    return item;
  }

  public deleteEquipment(equipmentId: string): boolean {
    const list = this.getEquipment();
    const target = list.find(e => e.id === equipmentId);
    if (!target) return false;
    const updated = list.filter(e => e.id !== equipmentId);
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(updated));
    this.logAudit('DELETE_EQUIPMENT', 'Equipment', target, undefined);
    this.notify();
    return true;
  }

  public addMaintenanceLog(equipmentId: string, log: MaintenanceLog): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item) return null;
    if (!item.maintenanceHistory) item.maintenanceHistory = [];
    item.maintenanceHistory.unshift(log);
    item.lastMaintenanceDate = log.date;
    if (log.nextDueDate) item.nextMaintenanceDate = log.nextDueDate;
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('ADD_MAINTENANCE_LOG', 'Equipment', undefined, log);
    this.notify();
    return item;
  }

  public updateMaintenanceLog(equipmentId: string, updatedLog: MaintenanceLog): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item || !item.maintenanceHistory) return null;
    const idx = item.maintenanceHistory.findIndex(m => m.id === updatedLog.id);
    if (idx < 0) return null;
    const oldLog = item.maintenanceHistory[idx];
    item.maintenanceHistory[idx] = updatedLog;
    if (idx === 0) {
      item.lastMaintenanceDate = updatedLog.date;
      if (updatedLog.nextDueDate) item.nextMaintenanceDate = updatedLog.nextDueDate;
    }
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('UPDATE_MAINTENANCE_LOG', 'Equipment', oldLog, updatedLog);
    this.notify();
    return item;
  }

  public deleteMaintenanceLog(equipmentId: string, logId: string): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item || !item.maintenanceHistory) return null;
    const target = item.maintenanceHistory.find(m => m.id === logId);
    if (!target) return null;
    item.maintenanceHistory = item.maintenanceHistory.filter(m => m.id !== logId);
    if (item.maintenanceHistory.length > 0) {
      item.lastMaintenanceDate = item.maintenanceHistory[0].date;
      if (item.maintenanceHistory[0].nextDueDate) {
        item.nextMaintenanceDate = item.maintenanceHistory[0].nextDueDate;
      }
    }
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('DELETE_MAINTENANCE_LOG', 'Equipment', target, undefined);
    this.notify();
    return item;
  }

  public addRepairLog(equipmentId: string, log: RepairLog): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item) return null;
    if (!item.repairHistory) item.repairHistory = [];
    item.repairHistory.unshift(log);
    if (log.status === 'Đã khôi phục') {
      item.status = 'Hoạt động tốt';
    } else {
      item.status = 'Sự cố hỏng hóc';
    }
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('ADD_REPAIR_LOG', 'Equipment', undefined, log);
    this.notify();
    return item;
  }

  public updateRepairLog(equipmentId: string, updatedLog: RepairLog): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item || !item.repairHistory) return null;
    const idx = item.repairHistory.findIndex(r => r.id === updatedLog.id);
    if (idx < 0) return null;
    const oldLog = item.repairHistory[idx];
    item.repairHistory[idx] = updatedLog;
    // Update equipment status based on recent repairs
    const hasUnresolved = item.repairHistory.some(r => r.status !== 'Đã khôi phục');
    item.status = hasUnresolved ? 'Sự cố hỏng hóc' : 'Hoạt động tốt';
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('UPDATE_REPAIR_LOG', 'Equipment', oldLog, updatedLog);
    this.notify();
    return item;
  }

  public deleteRepairLog(equipmentId: string, logId: string): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item || !item.repairHistory) return null;
    const target = item.repairHistory.find(r => r.id === logId);
    if (!target) return null;
    item.repairHistory = item.repairHistory.filter(r => r.id !== logId);
    const hasUnresolved = item.repairHistory.some(r => r.status !== 'Đã khôi phục');
    item.status = hasUnresolved ? 'Sự cố hỏng hóc' : 'Hoạt động tốt';
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('DELETE_REPAIR_LOG', 'Equipment', target, undefined);
    this.notify();
    return item;
  }

  // --- Level 1 Departments (Bộ phận) ---
  public getDepartments(): DepartmentUnit[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.DEPARTMENTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          return parsed.filter((d: DepartmentUnit) => {
            if (!d?.id || seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
          });
        }
      }
      const seeded: DepartmentUnit[] = [...DEFAULT_DEPARTMENTS];
      const existingRooms = this.getRooms();
      existingRooms.forEach((r, idx) => {
        const sec = r.departmentSection?.trim();
        if (sec && sec !== 'Chưa phân bộ phận' && !seeded.some(d => d.name === sec)) {
          seeded.push({
            id: `DEPT-AUTO-${idx}-${Date.now()}`,
            code: `BP-${String(seeded.length + 1).padStart(2, '0')}`,
            name: sec
          });
        }
      });
      if (!this.serverModeEnabled) {
        this.writeBucketRaw(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(seeded));
      }
      return seeded;
    } catch (e) {
      return [...DEFAULT_DEPARTMENTS];
    }
  }

  public saveDepartment(dept: DepartmentUnit): DepartmentUnit {
    const depts = this.getDepartments();
    const idx = depts.findIndex(d => d.id === dept.id);
    let oldDept: DepartmentUnit | undefined;

    if (idx >= 0) {
      oldDept = depts[idx];
      depts[idx] = dept;
      if (oldDept && oldDept.name !== dept.name) {
        this.cascadeDepartmentNameChange(oldDept.name, dept.name);
      }
    } else {
      depts.push(dept);
    }

    this.writeBucketRaw(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(depts));
    this.logAudit('SAVE_DEPARTMENT', 'Room', oldDept, dept);
    this.notify();
    return dept;
  }

  public cascadeDepartmentNameChange(oldName: string, newName: string) {
    if (!oldName || !newName || oldName === newName) return;

    const rooms = this.getRooms();
    let roomsUpdated = false;
    rooms.forEach(r => {
      if (r.departmentSection === oldName) {
        r.departmentSection = newName;
        roomsUpdated = true;
      }
    });
    if (roomsUpdated) {
      this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    }

    const staffList = this.getStaffProfiles();
    let staffUpdated = false;
    staffList.forEach(s => {
      if (s.departmentSection === oldName) {
        s.departmentSection = newName;
        staffUpdated = true;
      }
    });
    if (staffUpdated) {
      this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    }

    const rawUsers = this.readBucketRaw(STORAGE_KEYS.USERS);
    if (rawUsers) {
      try {
        const users: User[] = JSON.parse(rawUsers);
        let usersUpdated = false;
        users.forEach(u => {
          if (u.department === oldName) {
            u.department = newName;
            usersUpdated = true;
          }
        });
        if (usersUpdated) {
          this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(users));
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  public deleteDepartment(
    deptId: string,
    options?: { mode: 'transfer' | 'unassign' | 'delete_rooms'; targetDepartmentName?: string }
  ): boolean {
    const depts = this.getDepartments();
    const targetDept = depts.find(d => d.id === deptId);
    if (!targetDept) return false;

    const filteredDepts = depts.filter(d => d.id !== deptId);
    this.writeBucketRaw(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(filteredDepts));

    const mode = options?.mode || 'unassign';
    const targetDeptName = options?.targetDepartmentName?.trim();

    const rooms = this.getRooms();
    const affectedRoomNames = new Set(
      rooms.filter(r => r.departmentSection === targetDept.name).map(r => r.name)
    );

    if (mode === 'delete_rooms') {
      const remainingRooms = rooms.filter(r => r.departmentSection !== targetDept.name);
      this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(remainingRooms));

      const staffList = this.getStaffProfiles();
      let staffUpdated = false;
      staffList.forEach(s => {
        if (s.departmentSection === targetDept.name) {
          s.departmentSection = 'Chưa phân bộ phận';
          staffUpdated = true;
        }
        if (s.room && affectedRoomNames.has(s.room)) {
          s.room = 'Chưa phân phòng';
          staffUpdated = true;
        }
      });
      if (staffUpdated) {
        this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
      }

      const eqList = this.getEquipment();
      let eqUpdated = false;
      eqList.forEach(e => {
        if (affectedRoomNames.has(e.room)) {
          e.room = 'Kho thiết bị / Chưa phân phòng';
          eqUpdated = true;
        }
      });
      if (eqUpdated) {
        this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
      }
    } else {
      const newSection = mode === 'transfer' && targetDeptName ? targetDeptName : 'Chưa phân bộ phận';
      let roomsUpdated = false;
      rooms.forEach(r => {
        if (r.departmentSection === targetDept.name) {
          r.departmentSection = newSection;
          roomsUpdated = true;
        }
      });
      if (roomsUpdated) {
        this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
      }

      const staffList = this.getStaffProfiles();
      let staffUpdated = false;
      staffList.forEach(s => {
        if (s.departmentSection === targetDept.name) {
          s.departmentSection = newSection;
          staffUpdated = true;
        }
      });
      if (staffUpdated) {
        this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
      }
    }

    this.logAudit('DELETE_DEPARTMENT', 'Room', targetDept, options);
    this.notify();
    return true;
  }

  // --- Level 2 Paraclinical Rooms (Phòng trực thuộc Bộ phận) ---
  public getRooms(): ParaclinicalRoom[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.ROOMS);
      const list: ParaclinicalRoom[] = raw ? JSON.parse(raw) : initialRooms;
      const seen = new Set<string>();
      return list.filter(r => {
        if (!r?.id || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    } catch (e) {
      return initialRooms;
    }
  }

  public saveRoom(room: ParaclinicalRoom): ParaclinicalRoom {
    const rooms = this.getRooms();
    const idx = rooms.findIndex(r => r.id === room.id);
    let oldRoom: ParaclinicalRoom | undefined;
    if (idx >= 0) {
      oldRoom = rooms[idx];
      rooms[idx] = room;
      // If room name changed, cascade update to staff and equipment
      if (oldRoom && oldRoom.name !== room.name) {
        this.cascadeRoomNameChange(oldRoom.name, room.name);
      }
    } else {
      rooms.unshift(room);
    }
    this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    this.logAudit('SAVE_ROOM', 'Room', oldRoom, room);
    this.notify();
    return room;
  }

  public deleteRoom(roomId: string, transferRoomName?: string): boolean {
    const rooms = this.getRooms();
    const targetRoom = rooms.find(r => r.id === roomId);
    if (!targetRoom) return false;

    const filtered = rooms.filter(r => r.id !== roomId);
    this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(filtered));

    // Cascade staff and equipment reassignment
    const staffList = this.getStaffProfiles();
    let staffUpdated = false;
    staffList.forEach(s => {
      if (s.room === targetRoom.name) {
        s.room = transferRoomName || 'Chưa phân phòng';
        staffUpdated = true;
      }
    });
    if (staffUpdated) {
      this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    }

    const eqList = this.getEquipment();
    let eqUpdated = false;
    eqList.forEach(e => {
      if (e.room === targetRoom.name || e.room.includes(targetRoom.name)) {
        e.room = transferRoomName || 'Kho thiết bị / Chưa phân phòng';
        eqUpdated = true;
      }
    });
    if (eqUpdated) {
      this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
    }

    this.logAudit('DELETE_ROOM', 'Room', targetRoom, { transferRoomName });
    this.notify();
    return true;
  }

  public cascadeRoomNameChange(oldName: string, newName: string) {
    if (!oldName || !newName || oldName === newName) return;
    
    // Update Staff
    const staffList = this.getStaffProfiles();
    let staffUpdated = false;
    staffList.forEach(s => {
      if (s.room === oldName) {
        s.room = newName;
        staffUpdated = true;
      }
    });
    if (staffUpdated) {
      this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    }

    // Update Equipment
    const eqList = this.getEquipment();
    let eqUpdated = false;
    eqList.forEach(e => {
      if (e.room === oldName) {
        e.room = newName;
        eqUpdated = true;
      } else if (e.room.includes(oldName)) {
        e.room = e.room.replace(oldName, newName);
        eqUpdated = true;
      }
    });
    if (eqUpdated) {
      this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
    }
  }

  public assignStaffToRoom(staffUserId: string, targetRoomName: string, departmentSection?: string): boolean {
    const staffList = this.getStaffProfiles();
    const staff = staffList.find(s => s.userId === staffUserId);
    if (!staff) return false;

    const oldRoom = staff.room;
    staff.room = targetRoomName;
    if (departmentSection) {
      staff.departmentSection = departmentSection;
    }

    this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    this.logAudit('ASSIGN_STAFF_TO_ROOM', 'HR', { staffUserId, oldRoom }, { staffUserId, newRoom: targetRoomName });
    this.notify();
    return true;
  }

  public removeStaffFromRoom(staffUserId: string): boolean {
    const staffList = this.getStaffProfiles();
    const staff = staffList.find(s => s.userId === staffUserId);
    if (!staff) return false;

    const oldRoom = staff.room;
    staff.room = 'Chưa phân phòng';
    this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    this.logAudit('REMOVE_STAFF_FROM_ROOM', 'HR', { staffUserId, oldRoom });
    this.notify();
    return true;
  }

  public assignEquipmentToRoom(equipmentId: string, targetRoomName: string): boolean {
    const eqList = this.getEquipment();
    const eq = eqList.find(e => e.id === equipmentId);
    if (!eq) return false;

    const oldRoom = eq.room;
    eq.room = targetRoomName;
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
    this.logAudit('ASSIGN_EQUIPMENT_TO_ROOM', 'Equipment', { equipmentId, oldRoom }, { equipmentId, newRoom: targetRoomName });
    this.notify();
    return true;
  }

  public removeEquipmentFromRoom(equipmentId: string): boolean {
    const eqList = this.getEquipment();
    const eq = eqList.find(e => e.id === equipmentId);
    if (!eq) return false;

    const oldRoom = eq.room;
    eq.room = 'Kho thiết bị / Chưa phân phòng';
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
    this.logAudit('REMOVE_EQUIPMENT_FROM_ROOM', 'Equipment', { equipmentId, oldRoom });
    this.notify();
    return true;
  }

  public addRoomReservation(roomId: string, reservation: RoomReservation): ParaclinicalRoom | null {
    const rooms = this.getRooms();
    const room = rooms.find(r => r.id === roomId);
    if (!room) return null;
    if (!room.reservations) room.reservations = [];
    room.reservations.unshift(reservation);
    this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    this.logAudit('ADD_ROOM_RESERVATION', 'Room', undefined, reservation);
    this.notify();
    return room;
  }

  // --- Staff Profiles & HR ---
  public getStaffProfiles(): StaffProfile[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.STAFF_PROFILES);
      const list: StaffProfile[] = raw ? JSON.parse(raw) : initialStaffProfiles;
      const seen = new Set<string>();
      return list
        .filter(s => {
          if (!s?.userId || seen.has(s.userId)) return false;
          seen.add(s.userId);
          return true;
        })
        .map(s => ({
          ...s,
          avatar: s.avatar?.includes('1594824813566')
            ? 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=200&auto=format&fit=crop&q=80'
            : s.avatar
        }));
    } catch (e) {
      return initialStaffProfiles;
    }
  }

  private clearResignedStaffAssignments(resignedProfiles: StaffProfile[]): void {
    const resignedNames = new Set(
      resignedProfiles
        .map(p => (p.fullName || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const resignedIds = new Set(
      resignedProfiles
        .map(p => (p.userId || '').trim())
        .filter(Boolean)
    );
    if (resignedNames.size === 0 && resignedIds.size === 0) return;

    const isMatchName = (val?: string) => {
      const t = (val || '').trim().toLowerCase();
      return Boolean(t) && resignedNames.has(t);
    };

    // 1. Clear room leaders standing on rooms
    const rooms = this.getRooms();
    let roomsChanged = false;
    const nextRooms = rooms.map(r => {
      const clearMgr = isMatchName(r.managerInCharge);
      const clearDep = isMatchName(r.deputyManager);
      if (!clearMgr && !clearDep) return r;
      roomsChanged = true;
      return {
        ...r,
        managerInCharge: clearMgr ? '' : r.managerInCharge,
        deputyManager: clearDep ? '' : r.deputyManager
      };
    });
    if (roomsChanged) {
      this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(nextRooms));
    }

    // 2. Clear department manager standing on departments
    const departments = this.getDepartments();
    let deptsChanged = false;
    const nextDepts = departments.map(d => {
      if (!isMatchName(d.managerName)) return d;
      deptsChanged = true;
      return { ...d, managerName: undefined };
    });
    if (deptsChanged) {
      this.writeBucketRaw(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(nextDepts));
    }

    // 3. Clear equipment manager / assigned technician
    const equipment = this.getEquipment();
    let eqChanged = false;
    const nextEq = equipment.map(eq => {
      const clearMgr = isMatchName(eq.managerInCharge);
      const clearTech = isMatchName(eq.assignedTechnician);
      if (!clearMgr && !clearTech) return eq;
      eqChanged = true;
      return {
        ...eq,
        managerInCharge: clearMgr ? undefined : eq.managerInCharge,
        assignedTechnician: clearTech ? '' : eq.assignedTechnician
      };
    });
    if (eqChanged) {
      this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(nextEq));
    }

    // 4. Mark corresponding user account Inactive
    try {
      const rawUsers = this.readBucketRaw(STORAGE_KEYS.USERS);
      if (rawUsers) {
        const users: User[] = JSON.parse(rawUsers);
        let usersChanged = false;
        const nextUsers = users.map(u => {
          if (
            (resignedIds.has(u.id) || isMatchName(u.name)) &&
            u.id !== 'USR-ADMIN' &&
            u.role !== 'Admin' &&
            u.status !== 'Inactive'
          ) {
            usersChanged = true;
            return { ...u, status: 'Inactive' as const };
          }
          return u;
        });
        if (usersChanged) {
          this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
        }
      }
    } catch (e) {
      // ignore user sync error
    }
  }

  public saveStaffProfile(profile: StaffProfile): StaffProfile {
    const list = this.getStaffProfiles();
    const idx = list.findIndex(s => s.userId === profile.userId);
    const prevProfile = idx >= 0 ? list[idx] : undefined;
    if (idx >= 0) {
      list[idx] = profile;
    } else {
      list.unshift(profile);
    }
    this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(list));

    // Sync RBAC and structural assignment updates to USERS bucket
    try {
      const rawUsers = this.readBucketRaw(STORAGE_KEYS.USERS);
      if (rawUsers) {
        const users: User[] = JSON.parse(rawUsers);
        const targetName = (profile.fullName || '').trim().toLowerCase();
        let usersChanged = false;
        const isInactive = isResignedOrEndedStaff(profile);
        const nextUsers = users.map(u => {
          if (
            (u.id === profile.userId || (targetName && u.name.trim().toLowerCase() === targetName)) &&
            u.id !== 'USR-ADMIN' &&
            u.role !== 'Admin'
          ) {
            usersChanged = true;
            return {
              ...u,
              name: profile.fullName || u.name,
              title: (profile.title as CLSTitle) || u.title,
              role: (['Admin', 'Manager', 'Doctor', 'Staff'].includes(profile.role)
                ? profile.role
                : u.role) as UserRole,
              department: profile.departmentSection || u.department,
              room: profile.room ?? u.room,
              status: isInactive
                ? ('Inactive' as const)
                : prevProfile && isResignedOrEndedStaff(prevProfile)
                  ? ('Active' as const)
                  : u.status,
              managementLevel: profile.managementLevel ?? u.managementLevel,
              managedDepartments: profile.managedDepartments ?? u.managedDepartments,
              managedRooms: profile.managedRooms ?? u.managedRooms,
              permissionOverrides: profile.permissionOverrides ?? u.permissionOverrides,
            };
          }
          return u;
        });
        if (usersChanged) {
          this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
          const updatedSelf = nextUsers.find(u => u.id === this.currentUser.id);
          if (updatedSelf) {
            this.currentUser = updatedSelf;
          }
        }
      }
    } catch (e) {
      // ignore user sync error
    }

    if (isResignedOrEndedStaff(profile)) {
      this.clearResignedStaffAssignments([profile]);
    }
    this.logAudit('SAVE_STAFF_PROFILE', 'HR', undefined, profile);
    this.notify();
    return profile;
  }

  public saveStaffProfilesBatch(newProfiles: StaffProfile[]): void {
    const list = this.getStaffProfiles();
    for (const p of newProfiles) {
      const idx = list.findIndex(s => s.userId === p.userId);
      if (idx >= 0) {
        list[idx] = p;
      } else {
        list.push(p);
      }
    }
    this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(list));
    const resigned = newProfiles.filter(isResignedOrEndedStaff);
    if (resigned.length > 0) {
      this.clearResignedStaffAssignments(resigned);
    }
    this.logAudit('BATCH_IMPORT_STAFF', 'HR', undefined, { count: newProfiles.length });
    this.notify();
  }

  public deleteStaffProfile(userId: string): boolean {
    const list = this.getStaffProfiles();
    const target = list.find(s => s.userId === userId);
    if (!target) return false;
    const filtered = list.filter(s => s.userId !== userId);
    this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(filtered));
    this.logAudit('DELETE_STAFF_PROFILE', 'HR', target, undefined);
    this.notify();
    return true;
  }

  public getLeaveRequests(): LeaveRequest[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.LEAVE_REQUESTS);
      return raw ? JSON.parse(raw) : initialLeaveRequests;
    } catch (e) {
      return initialLeaveRequests;
    }
  }

  public saveLeaveRequest(req: LeaveRequest): LeaveRequest {
    const list = this.getLeaveRequests();
    const idx = list.findIndex(l => l.id === req.id);
    if (idx >= 0) {
      list[idx] = req;
    } else {
      list.unshift(req);
    }
    this.writeBucketRaw(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(list));
    this.logAudit('SAVE_LEAVE_REQUEST', 'HR', undefined, req);
    this.notify();
    return req;
  }

  public updateLeaveStatus(id: string, status: 'Đã phê duyệt' | 'Từ chối', approvedBy: string): LeaveRequest | null {
    const list = this.getLeaveRequests();
    const req = list.find(l => l.id === id);
    if (!req) return null;
    req.status = status;
    req.approvedBy = approvedBy;
    this.writeBucketRaw(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(list));
    this.logAudit('UPDATE_LEAVE_STATUS', 'HR', undefined, req);
    this.notify();
    return req;
  }

  public deleteLeaveRequest(id: string): boolean {
    const list = this.getLeaveRequests();
    const target = list.find(l => l.id === id);
    if (!target) return false;
    const next = list.filter(l => l.id !== id);
    this.writeBucketRaw(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(next));
    this.logAudit('DELETE_LEAVE_REQUEST', 'HR', target);
    this.notify();
    return true;
  }

  public getTrainingCourses(): TrainingCourse[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.TRAINING_COURSES);
      return raw ? JSON.parse(raw) : initialTrainingCourses;
    } catch (e) {
      return initialTrainingCourses;
    }
  }

  public saveTrainingCourse(course: TrainingCourse): TrainingCourse {
    const list = this.getTrainingCourses();
    const idx = list.findIndex(c => c.id === course.id);
    if (idx >= 0) {
      list[idx] = course;
    } else {
      list.unshift(course);
    }
    this.writeBucketRaw(STORAGE_KEYS.TRAINING_COURSES, JSON.stringify(list));
    this.logAudit('SAVE_TRAINING_COURSE', 'HR', undefined, course);
    this.notify();
    return course;
  }

  // --- Meeting Management ---
  public getMeetingItems(): MeetingItem[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.MEETING_ITEMS);
      return raw ? JSON.parse(raw) : initialMeetings;
    } catch (e) {
      return initialMeetings;
    }
  }

  public saveMeetingItem(meeting: MeetingItem): MeetingItem {
    const list = this.getMeetingItems();
    const idx = list.findIndex(m => m.id === meeting.id);
    if (idx >= 0) {
      list[idx] = meeting;
    } else {
      list.unshift(meeting);
    }
    this.writeBucketRaw(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(list));
    this.logAudit('SAVE_MEETING', 'Meeting', undefined, meeting);
    this.notify();
    return meeting;
  }

  public saveMeetingMinutes(meetingId: string, minutes: MeetingMinutes): MeetingItem | null {
    const list = this.getMeetingItems();
    const meeting = list.find(m => m.id === meetingId);
    if (!meeting) return null;
    meeting.minutes = minutes;
    meeting.status = 'Đã hoàn thành';
    this.writeBucketRaw(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(list));
    this.logAudit('SAVE_MEETING_MINUTES', 'Meeting', undefined, minutes);
    this.notify();
    return meeting;
  }

  // --- Integration Hub ---
  public getIntegrationEndpoints(): IntegrationEndpoint[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.INTEGRATION_ENDPOINTS);
      return raw ? JSON.parse(raw) : initialIntegrationEndpoints;
    } catch (e) {
      return initialIntegrationEndpoints;
    }
  }

  public getIntegrationPayloads(): IntegrationPayloadSample[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.INTEGRATION_PAYLOADS);
      return raw ? JSON.parse(raw) : initialIntegrationPayloads;
    } catch (e) {
      return initialIntegrationPayloads;
    }
  }

  public addIntegrationPayload(payload: IntegrationPayloadSample): IntegrationPayloadSample {
    const list = this.getIntegrationPayloads();
    list.unshift(payload);
    this.writeBucketRaw(STORAGE_KEYS.INTEGRATION_PAYLOADS, JSON.stringify(list));
    this.notify();
    return payload;
  }

  // --- Quản Lý Dữ Liệu Thực Tế & Thử Nghiệm ---

  /**
   * Xóa sạch 100% dữ liệu dùng thử / demo, đưa hệ thống về trạng thái sẵn sàng vận hành thực tế
   */
  public purgeAllTrialData() {
    this.writeBucketRaw(STORAGE_KEYS.TASKS, JSON.stringify(initialTasks));
    this.writeBucketRaw(STORAGE_KEYS.DOCUMENTS, JSON.stringify(initialDocuments));
    this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(initialUsers));
    this.writeBucketRaw(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(initialNotifications));
    this.writeBucketRaw(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(initialAuditLogs));
    this.writeBucketRaw(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(initialShifts));
    this.writeBucketRaw(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(initialWorkTaskRows));
    this.writeBucketRaw(STORAGE_KEYS.MEETINGS, JSON.stringify(initialWeeklyMeetings));
    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(initialChatMessages));
    this.writeBucketRaw(STORAGE_KEYS.CHANNELS, JSON.stringify(initialChannels));
    this.writeBucketRaw(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(initialAnnouncements));
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(initialEquipment));
    this.writeBucketRaw(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(DEFAULT_DEPARTMENTS));
    this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(initialRooms));
    this.writeBucketRaw(
      STORAGE_KEYS.EQUIPMENT_DURATION_DEFAULTS,
      JSON.stringify({ permitMonths: 60, calibrationMonths: 12, radiationSurveyMonths: 12, maintenanceMonths: 3 })
    );
    this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(initialStaffProfiles));
    this.writeBucketRaw(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(initialLeaveRequests));
    this.writeBucketRaw(STORAGE_KEYS.TRAINING_COURSES, JSON.stringify(initialTrainingCourses));
    this.writeBucketRaw(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(initialMeetings));
    this.writeBucketRaw(STORAGE_KEYS.INTEGRATION_ENDPOINTS, JSON.stringify(initialIntegrationEndpoints));
    this.writeBucketRaw(STORAGE_KEYS.INTEGRATION_PAYLOADS, JSON.stringify(initialIntegrationPayloads));
    this.writeBucketRaw(STORAGE_KEYS.SYNC_HISTORY, JSON.stringify([]));
    
    // Xóa bộ nhớ tạm Google Sheet demo (tất cả 12 tháng)
    Array.from({ length: 12 }, (_, idx) => `Tháng ${idx + 1}`).forEach(m => {
      localStorage.removeItem(`google_sheet_data_${m}`);
    });
    localStorage.removeItem('google_sheet_url');

    this.currentUser = initialUsers[0];
    this.writeBucketRaw(STORAGE_KEYS.CURRENT_USER, initialUsers[0].id);

    this.logAudit('PURGE_TRIAL_DATA', 'System', undefined, { 
      note: 'Đã dọn sạch toàn bộ dữ liệu dùng thử để áp dụng thực tế.' 
    });
    this.notify();
  }

  /**
   * Nạp lại dữ liệu dùng thử mẫu (dùng cho đào tạo hoặc thử nghiệm tính năng)
   */
  public loadSampleDemoData() {
    this.writeBucketRaw(STORAGE_KEYS.TASKS, JSON.stringify(sampleDemoData.initialTasks));
    this.writeBucketRaw(STORAGE_KEYS.DOCUMENTS, JSON.stringify(sampleDemoData.initialDocuments));
    this.writeBucketRaw(STORAGE_KEYS.USERS, JSON.stringify(sampleDemoData.initialUsers));
    this.writeBucketRaw(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(sampleDemoData.initialNotifications));
    this.writeBucketRaw(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(sampleDemoData.initialAuditLogs));
    this.writeBucketRaw(STORAGE_KEYS.SETTINGS, JSON.stringify(sampleDemoData.initialSettings));
    this.writeBucketRaw(STORAGE_KEYS.SHIFTS, JSON.stringify(sampleDemoData.initialShifts));
    this.writeBucketRaw(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(sampleDemoData.initialWorkTaskRows));
    this.writeBucketRaw(STORAGE_KEYS.MEETINGS, JSON.stringify(sampleDemoData.initialWeeklyMeetings));
    this.writeBucketRaw(STORAGE_KEYS.MESSAGES, JSON.stringify(sampleDemoData.initialChatMessages));
    this.writeBucketRaw(STORAGE_KEYS.CHANNELS, JSON.stringify(sampleDemoData.initialChannels));
    this.writeBucketRaw(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(sampleDemoData.initialAnnouncements));
    this.writeBucketRaw(STORAGE_KEYS.EQUIPMENT, JSON.stringify(sampleDemoData.initialEquipment));
    this.writeBucketRaw(STORAGE_KEYS.ROOMS, JSON.stringify(sampleDemoData.initialRooms));
    this.writeBucketRaw(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(sampleDemoData.initialStaffProfiles));
    this.writeBucketRaw(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(sampleDemoData.initialLeaveRequests));
    this.writeBucketRaw(STORAGE_KEYS.TRAINING_COURSES, JSON.stringify(sampleDemoData.initialTrainingCourses));
    this.writeBucketRaw(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(sampleDemoData.initialMeetings));
    this.writeBucketRaw(STORAGE_KEYS.INTEGRATION_ENDPOINTS, JSON.stringify(sampleDemoData.initialIntegrationEndpoints));
    this.writeBucketRaw(STORAGE_KEYS.INTEGRATION_PAYLOADS, JSON.stringify(sampleDemoData.initialIntegrationPayloads));

    this.currentUser = sampleDemoData.initialUsers[0];
    this.writeBucketRaw(STORAGE_KEYS.CURRENT_USER, sampleDemoData.initialUsers[0].id);

    this.logAudit('LOAD_SAMPLE_DATA', 'System', undefined, { 
      note: 'Đã nạp lại bộ dữ liệu dùng thử mẫu để minh họa tính năng.' 
    });
    this.notify();
  }

  // Khôi phục mặc định (tương đương dọn sạch sang chế độ thực tế)
  public resetToDefault() {
    this.purgeAllTrialData();
  }

  // --- Data Sync History (Google Sheet <-> System / PostgreSQL) ---
  public getSyncHistory(): SyncHistoryEntry[] {
    try {
      const raw = this.readBucketRaw(STORAGE_KEYS.SYNC_HISTORY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SyncHistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  public addSyncHistoryEntry(entry: SyncHistoryEntry): SyncHistoryEntry[] {
    const current = this.getSyncHistory();
    const trimmedEntry: SyncHistoryEntry = {
      ...entry,
      autoWrittenSamples: entry.autoWrittenSamples?.slice(0, 80),
      discrepancies: entry.discrepancies?.slice(0, 250)
    };
    const next = [trimmedEntry, ...current.filter((e) => e.id !== entry.id)].slice(0, 80);
    this.safeSetItem(STORAGE_KEYS.SYNC_HISTORY, JSON.stringify(next));
    this.notify();
    return next;
  }

  public updateSyncHistoryDiscrepancyStatus(
    entryId: string,
    discrepancyId: string,
    resolution: 'updated_from_sheet' | 'kept_system'
  ): SyncHistoryEntry[] {
    const nowDisplay = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
    const actor = this.getCurrentUser()?.name || 'Cán bộ CLS';
    const current = this.getSyncHistory();
    const next = current.map((entry) => {
      if (entry.id !== entryId || !Array.isArray(entry.discrepancies)) return entry;
      const updatedDiscs = entry.discrepancies.map((d) =>
        d.id === discrepancyId
          ? {
              ...d,
              resolutionStatus: resolution,
              resolvedAt: nowDisplay,
              resolvedBy: actor
            }
          : d
      );
      const pendingLeft = updatedDiscs.filter(
        (d) => !d.resolutionStatus || d.resolutionStatus === 'pending'
      ).length;
      return {
        ...entry,
        discrepancies: updatedDiscs,
        status:
          pendingLeft === 0 && entry.status === 'discrepancy_alert'
            ? 'success'
            : entry.status
      };
    });
    this.safeSetItem(STORAGE_KEYS.SYNC_HISTORY, JSON.stringify(next));
    this.notify();
    return next;
  }

  public deleteSyncHistoryEntry(entryId: string): SyncHistoryEntry[] {
    const current = this.getSyncHistory();
    const next = current.filter((entry) => entry.id !== entryId);
    this.safeSetItem(STORAGE_KEYS.SYNC_HISTORY, JSON.stringify(next));
    this.notify();
    return next;
  }

  public deleteSyncHistoryEntries(entryIds: string[]): SyncHistoryEntry[] {
    const idSet = new Set(entryIds);
    const current = this.getSyncHistory();
    const next = current.filter((entry) => !idSet.has(entry.id));
    this.safeSetItem(STORAGE_KEYS.SYNC_HISTORY, JSON.stringify(next));
    this.notify();
    return next;
  }

  public clearSyncHistory(statusFilter?: SyncHistoryStatus | 'all'): SyncHistoryEntry[] {
    const current = this.getSyncHistory();
    const next =
      !statusFilter || statusFilter === 'all'
        ? []
        : current.filter((entry) => entry.status !== statusFilter);
    this.safeSetItem(STORAGE_KEYS.SYNC_HISTORY, JSON.stringify(next));
    this.notify();
    return next;
  }
}

export const storageService = new HospitalStorageService();
