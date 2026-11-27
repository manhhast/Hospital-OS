import {
  CLOUD_BUCKET_STORAGE_MAP,
  storageService,
  type CloudBucketKey,
  type EntityMutationOp,
  type ServerEntityChangeItem
} from './storageService';
import {
  applyServerKnownYears,
  clearReportArchiveMemoryCache,
  DEFAULT_REPORT_YEAR,
  getKnownReportYears,
  isValidReportYear,
  registerCloudKnownYearsHandler,
  registerCloudReportArchiveHandler,
  registerCloudReportCellsHandler,
  reportArchiveService,
  REPORT_MONTHS,
  setServerReportArchiveMode,
  toReportArchiveKey,
  type ArchivedCaseReportItem,
  type ReportCellPatchInput
} from './reportArchiveService';
import {
  hydrateServerQuickAccessPins,
  registerCloudQuickAccessPinsHandler,
  setServerQuickAccessMode
} from '../utils/quickAccessMenu';
import {
  hydrateServerPinnedServiceNames,
  registerCloudPinnedServicesHandler,
  setServerPinnedServicesMode
} from '../utils/clinicalAnalytics';
import {
  applyServerReminderEntry,
  hydrateServerReminderLogs,
  registerCloudReminderHandler,
  setServerReminderMode
} from '../utils/operationalAlerts';
import type { User, UserRole } from '../types/hospital';
import { parseDbStatusPayload } from '../utils/postgresStatus';

export const PREFERENCES_UPDATED_EVENT = 'cls-workhub-preferences-updated';

export type PostgresSyncStatus =
  | 'unconfigured'
  | 'checking'
  | 'needs_login'
  | 'syncing'
  | 'synced'
  | 'error';

export interface PublicStaffDirectoryItem {
  id: string;
  name: string;
  role: UserRole;
  department?: string;
  title?: string;
  avatar?: string;
}

export interface ServerUploadedFileMeta {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  url: string;
  createdAtMs: number;
}

export interface PostgresSyncState {
  configured: boolean;
  connected: boolean;
  authenticated: boolean;
  driver: 'postgres' | 'none';
  status: PostgresSyncStatus;
  lastSyncedAt: string | null;
  syncedBucketsCount: number;
  syncedReportMonthsCount: number;
  serverBucketCount: number;
  serverReportArchiveCount: number;
  publicStaffDirectory: PublicStaffDirectoryItem[];
  sessionUserId: string | null;
  sessionUserName: string | null;
  sessionUserRole: string | null;
  errorMessage: string | null;
  liveStreamConnected: boolean;
  pendingChangesCount: number;
  lastConflictNotice: { id: number; message: string } | null;
}

function formatNowShort(): string {
  return new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không thể đọc nội dung tệp.'));
      }
    };
    reader.onerror = () => reject(new Error('Lỗi đọc tệp từ thiết bị.'));
    reader.readAsDataURL(file);
  });
}

class PostgresSyncService {
  private initialized = false;
  private listeners: Array<() => void> = [];
  private pollTimer: number | null = null;
  private pendingBucketTimers: Partial<Record<CloudBucketKey, number>> = {};
  private pendingReportTimers: Record<string, number> = {};
  private pendingReportPayloads: Record<
    string,
    { year: number; monthKey: string; items: ArchivedCaseReportItem[] }
  > = {};
  private pendingCellTimers: Record<string, number> = {};
  private pendingCellPayloads: Record<
    string,
    { year: number; monthKey: string; cells: Map<string, ReportCellPatchInput>; fullItems: ArchivedCaseReportItem[] }
  > = {};
  private pendingEntityOps = new Map<string, EntityMutationOp>();
  private inFlightEntityKeys = new Set<string>();
  private pendingMutationsTimer: number | null = null;
  private inFlightBuckets = new Set<CloudBucketKey>();
  private failedRetryBuckets = new Set<CloudBucketKey>();
  private bucketVersions: Partial<Record<CloudBucketKey, number>> = {};
  private reportArchiveVersions: Record<string, number> = {};
  private preferencesCache: Record<string, unknown> = {};
  private blobUrlCache = new Map<string, string>();
  private lastServerTimeMs = 0;
  private isHydrating = false;
  private isFlushingMutations = false;
  private inMemorySessionToken = '';
  private eventSource: EventSource | null = null;
  private sseReconnectTimer: number | null = null;
  private sseReconnectAttempt = 0;
  private ssePullTimer: number | null = null;
  private focusHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private pageHideHandler: (() => void) | null = null;
  private statusRetryTimer: number | null = null;

  private state: PostgresSyncState = {
    configured: false,
    connected: false,
    authenticated: false,
    driver: 'none',
    status: 'checking',
    lastSyncedAt: null,
    syncedBucketsCount: 0,
    syncedReportMonthsCount: 0,
    serverBucketCount: 0,
    serverReportArchiveCount: 0,
    publicStaffDirectory: [],
    sessionUserId: null,
    sessionUserName: null,
    sessionUserRole: null,
    errorMessage: null,
    liveStreamConnected: false,
    pendingChangesCount: 0,
    lastConflictNotice: null
  };

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getState(): PostgresSyncState {
    return this.state;
  }

  public isActiveBackend(): boolean {
    return this.state.configured;
  }

  public isAuthenticatedSession(): boolean {
    return !this.state.configured || this.state.authenticated;
  }

  private setState(patch: Partial<PostgresSyncState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  public dismissConflictNotice(): void {
    if (this.state.lastConflictNotice) {
      this.setState({ lastConflictNotice: null });
    }
  }

  private getSessionToken(): string {
    return this.inMemorySessionToken;
  }

  private saveSessionToken(token: string): void {
    this.inMemorySessionToken = token || '';
    try {
      localStorage.removeItem('cls_workhub_pg_session_token_v1');
    } catch {
      // ignore storage errors
    }
  }

  public getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    const token = this.getSessionToken();
    return {
      'X-Requested-With': 'CLSWorkHub',
      ...(extra || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return this.getAuthHeaders(extra);
  }

  private activateStorageHooks(): void {
    storageService.setServerMode(true);
    setServerReportArchiveMode(true);
    setServerQuickAccessMode(true);
    setServerPinnedServicesMode(true);
    setServerReminderMode(true);

    storageService.registerCloudConnectedChecker(
      () => this.state.configured && this.state.authenticated && this.state.connected
    );
    storageService.registerCloudMutationsHandler((ops) => {
      this.queueEntityMutations(ops);
    });
    storageService.registerCloudBucketChangeHandler((bucketKey) => {
      this.queueBucketPush(bucketKey);
    });
    registerCloudReportArchiveHandler((year, monthKey, items) => {
      this.queueReportArchivePush(year, monthKey, items);
    });
    registerCloudReportCellsHandler((year, monthKey, cells, fullItems) => {
      this.queueReportCellsPush(year, monthKey, cells, fullItems);
    });
    registerCloudKnownYearsHandler((years) => {
      if (this.state.configured && this.state.authenticated) {
        void this.savePreference('known_report_years', years);
      }
    });
    registerCloudQuickAccessPinsHandler((ids) => {
      if (this.state.configured && this.state.authenticated) {
        void this.savePreference('quick_access_pins', ids);
      }
    });
    registerCloudPinnedServicesHandler((names) => {
      if (this.state.configured && this.state.authenticated) {
        void this.savePreference('pinned_clinical_services', names);
      }
    });
    registerCloudReminderHandler((scope, targetId, lastRemindedAt, channel) => {
      if (this.state.configured && this.state.authenticated) {
        void this.saveReminder(scope, targetId, lastRemindedAt, channel);
      }
    });
  }

  private deactivateServerHooks(): void {
    storageService.setServerMode(false);
    setServerReportArchiveMode(false);
    setServerQuickAccessMode(false);
    setServerPinnedServicesMode(false);
    setServerReminderMode(false);
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.refreshServerStatus();
  }

  public destroy(): void {
    this.stopPolling();
    this.clearPendingTimers();
    this.revokeCachedBlobUrls();
    if (this.statusRetryTimer !== null) {
      window.clearTimeout(this.statusRetryTimer);
      this.statusRetryTimer = null;
    }
    this.initialized = false;
  }

  private revokeCachedBlobUrls(): void {
    for (const blobUrl of this.blobUrlCache.values()) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // ignore
      }
    }
    this.blobUrlCache.clear();
  }

  private updatePendingChangesCount(): void {
    const bucketPending = new Set<string>([
      ...Object.keys(this.pendingBucketTimers),
      ...Array.from(this.inFlightBuckets),
      ...Array.from(this.failedRetryBuckets)
    ]);
    const reportPending =
      Object.keys(this.pendingReportTimers).length + Object.keys(this.pendingCellTimers).length;
    const entityPending = this.pendingEntityOps.size + this.inFlightEntityKeys.size;
    const total = bucketPending.size + reportPending + entityPending;
    if (total !== this.state.pendingChangesCount) {
      this.setState({ pendingChangesCount: total });
    }
  }

  private clearPendingTimers(): void {
    if (this.pendingMutationsTimer !== null) {
      window.clearTimeout(this.pendingMutationsTimer);
      this.pendingMutationsTimer = null;
    }
    this.pendingEntityOps.clear();
    this.inFlightEntityKeys.clear();

    (Object.keys(this.pendingBucketTimers) as CloudBucketKey[]).forEach((k) => {
      const t = this.pendingBucketTimers[k];
      if (t) window.clearTimeout(t);
    });
    this.pendingBucketTimers = {};
    Object.values(this.pendingReportTimers).forEach((t) => {
      if (t) window.clearTimeout(t);
    });
    this.pendingReportTimers = {};
    this.pendingReportPayloads = {};

    Object.values(this.pendingCellTimers).forEach((t) => {
      if (t) window.clearTimeout(t);
    });
    this.pendingCellTimers = {};
    this.pendingCellPayloads = {};

    this.failedRetryBuckets.clear();
    this.updatePendingChangesCount();
  }

  private scheduleStatusRetryIfNeeded(): void {
    if (typeof window === 'undefined' || this.statusRetryTimer !== null) return;
    this.statusRetryTimer = window.setTimeout(() => {
      this.statusRetryTimer = null;
      void this.refreshServerStatus();
    }, 2500);
  }

  public async refreshServerStatus(): Promise<PostgresSyncState> {
    if (this.statusRetryTimer !== null) {
      window.clearTimeout(this.statusRetryTimer);
      this.statusRetryTimer = null;
    }

    try {
      const [statusRes, dirRes] = await Promise.all([
        fetch('/api/db/status', {
          headers: this.authHeaders(),
          credentials: 'include'
        }),
        fetch('/api/auth/staff-directory', {
          headers: this.authHeaders(),
          credentials: 'include'
        })
      ]);

      const rawStatusData = await statusRes.json().catch(() => null);
      const parsed = parseDbStatusPayload(statusRes.ok, statusRes.status, rawStatusData);

      if (parsed.kind === 'http_error') {
        this.setState({
          configured: this.state.configured,
          connected: false,
          driver: this.state.configured ? 'postgres' : 'none',
          status: 'error',
          errorMessage: parsed.errorMessage
        });
        this.scheduleStatusRetryIfNeeded();
        return this.state;
      }

      if (parsed.kind === 'unconfigured') {
        this.stopPolling();
        this.deactivateServerHooks();
        this.setState({
          configured: false,
          connected: false,
          authenticated: false,
          driver: 'none',
          status: 'unconfigured',
          publicStaffDirectory: [],
          sessionUserId: null,
          sessionUserName: null,
          sessionUserRole: null,
          errorMessage: null
        });
        return this.state;
      }

      const dirData = await dirRes.json().catch(() => ({ staff: [] }));
      this.activateStorageHooks();

      const directory: PublicStaffDirectoryItem[] = Array.isArray(dirData?.staff)
        ? dirData.staff
        : [];

      if (!parsed.connected) {
        this.setState({
          configured: true,
          connected: false,
          authenticated: false,
          driver: 'postgres',
          status: 'error',
          serverBucketCount: parsed.bucketCount,
          serverReportArchiveCount: parsed.reportArchiveCount,
          publicStaffDirectory: directory,
          errorMessage: parsed.errorMessage || 'Không thể kết nối tới PostgreSQL.'
        });
        return this.state;
      }

      // Restore HttpOnly cookie session across F5 / new tabs cleanly via /api/auth/session
      let sessionUser = parsed.sessionUser;
      let sessionValid = parsed.authenticated;

      if (sessionValid || this.inMemorySessionToken) {
        try {
          const sessionRes = await fetch('/api/auth/session', {
            headers: this.authHeaders(),
            credentials: 'include'
          });
          const sessionJson = await sessionRes.json().catch(() => null);
          if (sessionJson?.authenticated && sessionJson?.token) {
            this.saveSessionToken(String(sessionJson.token));
            sessionUser = sessionJson.sessionUser || sessionUser;
            sessionValid = true;
          } else {
            sessionValid = false;
            sessionUser = null;
          }
        } catch {
          // If transient error while checking cookie, fallback to status parsed result
        }
      }

      if (!sessionValid || !sessionUser) {
        this.saveSessionToken('');
        storageService.setAuthenticated(false);
        this.stopPolling();
        this.setState({
          configured: true,
          connected: true,
          authenticated: false,
          driver: 'postgres',
          status: 'needs_login',
          serverBucketCount: parsed.bucketCount,
          serverReportArchiveCount: parsed.reportArchiveCount,
          publicStaffDirectory: directory,
          sessionUserId: null,
          sessionUserName: null,
          sessionUserRole: null,
          errorMessage: null
        });
        return this.state;
      }

      this.setState({
        configured: true,
        connected: true,
        authenticated: true,
        driver: 'postgres',
        status: 'syncing',
        serverBucketCount: parsed.bucketCount,
        serverReportArchiveCount: parsed.reportArchiveCount,
        publicStaffDirectory: directory,
        sessionUserId: sessionUser.id || null,
        sessionUserName: sessionUser.name || null,
        sessionUserRole: sessionUser.role || null,
        errorMessage: null
      });

      await this.hydrateInitialFromServer(sessionUser.id);
      storageService.setAuthenticated(true);
      this.startPolling();
      return this.state;
    } catch {
      this.setState({
        configured: this.state.configured,
        connected: false,
        driver: this.state.configured ? 'postgres' : 'none',
        status: 'error',
        errorMessage: 'Không thể kết nối tới máy chủ ứng dụng để kiểm tra PostgreSQL. Vui lòng thử lại.'
      });
      this.scheduleStatusRetryIfNeeded();
      return this.state;
    }
  }

  public async login(
    userId: string,
    password: string
  ): Promise<{ success: boolean; message: string; user?: User }> {
    if (!this.state.configured) {
      return storageService.loginById(userId, password);
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'CLSWorkHub'
        },
        credentials: 'include',
        body: JSON.stringify({ userId, password })
      });
      const json = await res.json();

      if (!res.ok || !json?.success || !json?.token) {
        return {
          success: false,
          message: json?.error || 'Đăng nhập thất bại.'
        };
      }

      this.saveSessionToken(json.token);
      this.activateStorageHooks();

      this.setState({
        authenticated: true,
        connected: true,
        status: 'syncing',
        sessionUserId: json.user?.id || userId,
        sessionUserName: json.user?.name || null,
        sessionUserRole: json.user?.role || null,
        errorMessage: null
      });

      await this.hydrateInitialFromServer(json.user?.id || userId);
      this.startPolling();

      const allUsers = storageService.getUsers();
      const matched =
        allUsers.find((u) => u.id === userId) ||
        ({
          id: json.user.id,
          name: json.user.name,
          email: '',
          role: json.user.role,
          department: json.user.department || 'Khoa Cận Lâm Sàng',
          title: json.user.title || json.user.role,
          avatar: json.user.avatar || ''
        } as User);

      storageService.setCurrentUser(matched);
      storageService.setAuthenticated(true);

      return {
        success: true,
        message: `Đăng nhập thành công: ${matched.name} (Đã đồng bộ PostgreSQL)`,
        user: matched
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ PostgreSQL.'
      };
    }
  }

  public async logout(): Promise<void> {
    this.stopPolling();
    this.clearPendingTimers();
    this.revokeCachedBlobUrls();
    this.preferencesCache = {};
    this.saveSessionToken('');
    storageService.setAuthenticated(false);
    if (this.state.configured) {
      this.setState({
        authenticated: false,
        status: 'needs_login',
        sessionUserId: null,
        sessionUserName: null,
        sessionUserRole: null
      });
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'X-Requested-With': 'CLSWorkHub' },
          credentials: 'include'
        });
      } catch {
        // ignore network errors during logout
      }
    }
  }

  public async refreshDirectory(): Promise<void> {
    if (!this.state.configured) {
      if (this.state.status === 'error') {
        await this.refreshServerStatus();
      }
      return;
    }
    try {
      const res = await fetch('/api/auth/staff-directory', {
        headers: this.authHeaders(),
        credentials: 'include'
      });
      const json = await res.json();
      if (Array.isArray(json?.staff)) {
        this.setState({ publicStaffDirectory: json.staff });
      }
    } catch {
      // ignore
    }
  }

  private applyServerPreferences(
    prefs: Record<string, unknown> | undefined | null,
    targetUserId?: string | null
  ): void {
    if (!prefs || typeof prefs !== 'object') return;
    let changed = false;
    for (const [k, v] of Object.entries(prefs)) {
      this.preferencesCache[k] = v;
      changed = true;
      if (k === 'quick_access_pins') {
        hydrateServerQuickAccessPins(targetUserId || this.state.sessionUserId, v);
      } else if (k === 'pinned_clinical_services') {
        hydrateServerPinnedServiceNames(v);
      } else if (k === 'known_report_years' && Array.isArray(v)) {
        applyServerKnownYears(v.map(Number));
      }
    }
    if (changed && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(PREFERENCES_UPDATED_EVENT, { detail: { preferences: this.preferencesCache } })
      );
    }
  }

  public getPreference<T = unknown>(key: string, fallback?: T): T | undefined {
    if (Object.prototype.hasOwnProperty.call(this.preferencesCache, key)) {
      return this.preferencesCache[key] as T;
    }
    return fallback;
  }

  public async savePreference(key: string, value: unknown): Promise<void> {
    this.preferencesCache[key] = value;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(PREFERENCES_UPDATED_EVENT, { detail: { key, value, preferences: this.preferencesCache } })
      );
    }
    if (!this.state.configured || !this.state.authenticated) return;
    try {
      const res = await fetch(`/api/v2/preferences/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ value })
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.updatedAtMs && Number(data.updatedAtMs) > this.lastServerTimeMs) {
          this.lastServerTimeMs = Number(data.updatedAtMs);
        }
      }
    } catch {
      // ignore non-fatal pref sync error
    }
  }

  public async saveReminder(
    scope: 'task' | 'equipment',
    targetId: string,
    lastRemindedAt: string,
    channel?: string
  ): Promise<void> {
    if (!this.state.configured || !this.state.authenticated) return;
    try {
      const res = await fetch('/api/v2/reminders', {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ scope, targetId, lastRemindedAt, channel })
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.success) {
          applyServerReminderEntry({
            scope,
            targetId,
            lastRemindedAt: String(json.lastRemindedAt || lastRemindedAt),
            count: Number(json.count || 1),
            channel: json.channel || channel
          });
        }
      }
    } catch {
      // ignore transient error
    }
  }

  public async uploadFile(file: File, scope = 'general'): Promise<ServerUploadedFileMeta> {
    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error('Dung lượng tệp vượt quá giới hạn 15MB cho lưu trữ trên máy chủ.');
    }
    const dataBase64 = await readFileAsBase64(file);
    const res = await fetch('/api/files/upload', {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        scope,
        dataBase64
      })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json?.file) {
      throw new Error(json?.error || 'Không thể tải tệp lên máy chủ.');
    }
    return json.file as ServerUploadedFileMeta;
  }

  public async fetchFileAsBlobUrl(url: string): Promise<string> {
    if (!url || !url.startsWith('/api/files/')) return url;
    const cached = this.blobUrlCache.get(url);
    if (cached) return cached;
    const res = await fetch(url, {
      headers: this.authHeaders(),
      credentials: 'include'
    });
    if (!res.ok) {
      throw new Error(`Không thể tải tệp (${res.status}).`);
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    this.blobUrlCache.set(url, objUrl);
    return objUrl;
  }

  public async downloadServerFile(url: string, filename: string): Promise<void> {
    const targetUrl = url.startsWith('/api/files/')
      ? `${url}${url.includes('?') ? '&' : '?'}download=1`
      : url;
    const res = await fetch(targetUrl, {
      headers: this.authHeaders(),
      credentials: 'include'
    });
    if (!res.ok) {
      throw new Error(`Không thể tải xuống tệp (${res.status}).`);
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    }
  }

  public async hydrateInitialFromServer(sessionUserId?: string): Promise<void> {
    if (!this.state.configured || !this.state.authenticated || this.isHydrating) return;
    this.isHydrating = true;

    try {
      const res = await fetch('/api/db/state', {
        headers: this.authHeaders(),
        credentials: 'include'
      });

      if (res.status === 401) {
        this.saveSessionToken('');
        storageService.setAuthenticated(false);
        this.stopPolling();
        this.setState({
          authenticated: false,
          status: 'needs_login',
          sessionUserId: null,
          sessionUserName: null,
          sessionUserRole: null,
          errorMessage: 'Phiên đăng nhập PostgreSQL đã hết hạn.'
        });
        return;
      }

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Không thể tải dữ liệu từ PostgreSQL.');
      }

      this.lastServerTimeMs = Number(data.serverTimeMs || Date.now());
      const remoteBuckets = (data.buckets || {}) as Record<
        string,
        { items: Record<string, unknown>[]; updatedAtMs: number }
      >;
      const remoteVersions = (data.versions || {}) as Record<string, number>;
      const resolvedUserId = sessionUserId || data.actorId || this.state.sessionUserId || undefined;

      for (const bucketKey of Object.keys(remoteBuckets) as CloudBucketKey[]) {
        const rb = remoteBuckets[bucketKey];
        if (rb?.updatedAtMs) {
          this.bucketVersions[bucketKey] = Number(rb.updatedAtMs);
        }
      }

      // Server is authoritative: initialize in-memory storage strictly from PostgreSQL + remove legacy local buckets
      storageService.applyServerInitialState(remoteBuckets, remoteVersions, resolvedUserId);

      // Hydrate monthly report archives cleanly into memory
      clearReportArchiveMemoryCache();
      this.reportArchiveVersions = {};
      const remoteArchives = Array.isArray(data.reportArchives) ? data.reportArchives : [];
      for (const arch of remoteArchives) {
        if (!arch?.archiveKey || !Array.isArray(arch.items)) continue;
        this.reportArchiveVersions[arch.archiveKey] = Number(arch.updatedAtMs || 0);
        if (arch.items.length > 0) {
          reportArchiveService.applyCloudMonthArchive(arch.year, arch.monthKey, arch.items);
        }
      }

      // Hydrate user/global preferences and reminder logs
      this.preferencesCache = {};
      this.applyServerPreferences(data.preferences, resolvedUserId);
      if (data.reminderLogs && typeof data.reminderLogs === 'object') {
        hydrateServerReminderLogs(data.reminderLogs);
      }

      this.setState({
        status: 'synced',
        connected: true,
        lastSyncedAt: formatNowShort(),
        syncedBucketsCount: Object.keys(remoteBuckets).length,
        syncedReportMonthsCount: remoteArchives.length,
        serverBucketCount: Object.keys(remoteBuckets).length,
        serverReportArchiveCount: remoteArchives.length,
        errorMessage: null
      });
    } catch (err) {
      this.setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Lỗi đồng bộ PostgreSQL.'
      });
    } finally {
      this.isHydrating = false;
    }
  }

  private connectLiveStream(): void {
    if (
      typeof EventSource === 'undefined' ||
      !this.state.configured ||
      !this.state.authenticated ||
      this.eventSource
    ) {
      return;
    }

    if (this.sseReconnectTimer !== null) {
      window.clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }

    try {
      const es = new EventSource('/api/db/stream', { withCredentials: true });
      this.eventSource = es;

      es.addEventListener('ready', () => {
        this.sseReconnectAttempt = 0;
        this.setState({ liveStreamConnected: true, errorMessage: null });
        void this.flushFailedRetries();
      });

      es.addEventListener('change', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data || '{}') as {
            updatedAtMs?: number;
          };
          if (payload?.updatedAtMs && payload.updatedAtMs <= this.lastServerTimeMs) {
            return;
          }
        } catch {
          // ignore parse error and still poll
        }
        if (this.ssePullTimer !== null) {
          window.clearTimeout(this.ssePullTimer);
        }
        this.ssePullTimer = window.setTimeout(() => {
          this.ssePullTimer = null;
          void this.pollChanges();
        }, 60);
      });

      es.onerror = () => {
        if (this.eventSource === es) {
          es.close();
          this.eventSource = null;
        }
        this.setState({ liveStreamConnected: false });
        if (!this.state.configured || !this.state.authenticated) return;

        const delays = [2000, 4000, 8000, 15000];
        const delay = delays[Math.min(this.sseReconnectAttempt, delays.length - 1)];
        this.sseReconnectAttempt += 1;
        if (this.sseReconnectTimer === null) {
          this.sseReconnectTimer = window.setTimeout(() => {
            this.sseReconnectTimer = null;
            this.connectLiveStream();
          }, delay);
        }
      };
    } catch {
      this.setState({ liveStreamConnected: false });
    }
  }

  private disconnectLiveStream(): void {
    if (this.sseReconnectTimer !== null) {
      window.clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }
    if (this.ssePullTimer !== null) {
      window.clearTimeout(this.ssePullTimer);
      this.ssePullTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.state.liveStreamConnected) {
      this.setState({ liveStreamConnected: false });
    }
  }

  public async flushPendingSync(useKeepalive = false): Promise<void> {
    await this.flushFailedRetries(useKeepalive);
  }

  private async flushFailedRetries(useKeepalive = false): Promise<void> {
    if (!this.state.configured || !this.state.authenticated) return;

    if (this.pendingMutationsTimer !== null) {
      window.clearTimeout(this.pendingMutationsTimer);
      this.pendingMutationsTimer = null;
    }
    if (this.pendingEntityOps.size > 0) {
      void this.flushEntityMutations(useKeepalive).catch(() => {});
    }

    const pendingBucketKeys = Object.keys(this.pendingBucketTimers) as CloudBucketKey[];
    for (const bucketKey of pendingBucketKeys) {
      const t = this.pendingBucketTimers[bucketKey];
      if (t) window.clearTimeout(t);
      delete this.pendingBucketTimers[bucketKey];
      const items = storageService.getBucketItemsForCloud(bucketKey);
      void this.pushBucket(bucketKey, items, useKeepalive).catch(() => {});
    }

    const retryKeys = Array.from(this.failedRetryBuckets);
    for (const bucketKey of retryKeys) {
      const items = storageService.getBucketItemsForCloud(bucketKey);
      void this.pushBucket(bucketKey, items, useKeepalive).catch(() => {});
    }

    const pendingCellKeys = Object.keys(this.pendingCellTimers);
    for (const archiveKey of pendingCellKeys) {
      const t = this.pendingCellTimers[archiveKey];
      if (t) window.clearTimeout(t);
      delete this.pendingCellTimers[archiveKey];
      const entry = this.pendingCellPayloads[archiveKey];
      delete this.pendingCellPayloads[archiveKey];
      if (entry) {
        void this.pushReportCells(
          archiveKey,
          entry.year,
          entry.monthKey,
          Array.from(entry.cells.values()),
          entry.fullItems,
          useKeepalive
        ).catch(() => {});
      }
    }

    const pendingReportKeys = Object.keys(this.pendingReportTimers);
    for (const archiveKey of pendingReportKeys) {
      const t = this.pendingReportTimers[archiveKey];
      if (t) window.clearTimeout(t);
      delete this.pendingReportTimers[archiveKey];
      const payload = this.pendingReportPayloads[archiveKey];
      delete this.pendingReportPayloads[archiveKey];
      if (payload) {
        void this.pushReportArchive(payload.year, payload.monthKey, payload.items, useKeepalive).catch(() => {});
      }
    }
    this.updatePendingChangesCount();
  }

  private startPolling(): void {
    this.connectLiveStream();
    if (this.pollTimer !== null) return;

    // Lightweight safety-net poll (SSE delivers instant updates in < 100ms)
    this.pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void this.flushFailedRetries();
        void this.pollChanges();
      }
    }, 10000);

    if (!this.focusHandler) {
      this.focusHandler = () => {
        if (!this.eventSource) this.connectLiveStream();
        void this.flushFailedRetries();
        void this.pollChanges();
      };
      window.addEventListener('focus', this.focusHandler);
    }

    if (!this.onlineHandler) {
      this.onlineHandler = () => {
        this.connectLiveStream();
        void this.flushFailedRetries();
        void this.pollChanges();
      };
      window.addEventListener('online', this.onlineHandler);
    }

    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          if (!this.eventSource) this.connectLiveStream();
          void this.flushFailedRetries();
          void this.pollChanges();
        } else {
          void this.flushFailedRetries(true);
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    if (!this.pageHideHandler) {
      this.pageHideHandler = () => {
        void this.flushFailedRetries(true);
      };
      window.addEventListener('pagehide', this.pageHideHandler);
    }
  }

  private stopPolling(): void {
    this.disconnectLiveStream();
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.focusHandler) {
      window.removeEventListener('focus', this.focusHandler);
      this.focusHandler = null;
    }
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.pageHideHandler) {
      window.removeEventListener('pagehide', this.pageHideHandler);
      this.pageHideHandler = null;
    }
  }

  public async pollChanges(): Promise<void> {
    if (!this.state.configured || !this.state.authenticated || this.isHydrating) return;

    try {
      const res = await fetch(`/api/v2/changes?since=${this.lastServerTimeMs}`, {
        headers: this.authHeaders(),
        credentials: 'include'
      });

      if (res.status === 401) {
        this.saveSessionToken('');
        storageService.setAuthenticated(false);
        this.stopPolling();
        this.setState({
          authenticated: false,
          status: 'needs_login',
          sessionUserId: null,
          sessionUserName: null,
          sessionUserRole: null,
          errorMessage: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'
        });
        return;
      }

      const data = await res.json();
      if (!res.ok || !data?.success) return;

      this.lastServerTimeMs = Number(data.serverTimeMs || this.lastServerTimeMs);
      let appliedSomething = false;

      if (Array.isArray(data.entities) && data.entities.length > 0) {
        const incomingChanges = (data.entities as ServerEntityChangeItem[]).filter((item) => {
          const opKey = `${item.entityType}:${item.id}`;
          return !this.pendingEntityOps.has(opKey) && !this.inFlightEntityKeys.has(opKey);
        });
        if (incomingChanges.length > 0) {
          const changed = storageService.applyServerEntityChanges(incomingChanges);
          if (changed) appliedSomething = true;
        }
      }

      if (Array.isArray(data.reportArchives)) {
        for (const arch of data.reportArchives) {
          if (arch?.archiveKey && arch?.updatedAtMs) {
            this.reportArchiveVersions[arch.archiveKey] = Number(arch.updatedAtMs);
          }
          if (
            arch?.year &&
            arch?.monthKey &&
            Array.isArray(arch.items) &&
            arch.items.length > 0 &&
            !this.pendingCellTimers[arch.archiveKey] &&
            !this.pendingReportTimers[arch.archiveKey]
          ) {
            reportArchiveService.applyCloudMonthArchive(arch.year, arch.monthKey, arch.items);
            appliedSomething = true;
          }
        }
      }

      if (data.preferences && typeof data.preferences === 'object') {
        this.applyServerPreferences(data.preferences, this.state.sessionUserId);
      }

      if (Array.isArray(data.reminderLogs)) {
        for (const r of data.reminderLogs) {
          if (r && (r.scope === 'task' || r.scope === 'equipment') && r.targetId) {
            applyServerReminderEntry({
              scope: r.scope,
              targetId: r.targetId,
              lastRemindedAt: r.lastRemindedAt,
              count: Number(r.count || 1),
              channel: r.channel
            });
          }
        }
      }

      if (appliedSomething) {
        this.setState({
          status: 'synced',
          lastSyncedAt: formatNowShort(),
          errorMessage: null
        });
      }
    } catch {
      // ignore transient network errors on background poll
    }
  }

  private queueEntityMutations(ops: EntityMutationOp[]): void {
    if (!this.state.configured || !this.state.authenticated || ops.length === 0) return;

    for (const op of ops) {
      const opKey = `${op.entityType}:${op.id}`;
      const existing = this.pendingEntityOps.get(opKey);
      this.pendingEntityOps.set(opKey, {
        ...op,
        expectedVersion: existing ? existing.expectedVersion : op.expectedVersion
      });
    }

    if (this.pendingMutationsTimer !== null) {
      window.clearTimeout(this.pendingMutationsTimer);
    }

    this.pendingMutationsTimer = window.setTimeout(() => {
      this.pendingMutationsTimer = null;
      void this.flushEntityMutations().catch((err) => {
        this.setState({
          errorMessage: err instanceof Error ? err.message : String(err)
        });
      });
    }, 120);
    this.updatePendingChangesCount();
  }

  private async flushEntityMutations(keepalive = false): Promise<void> {
    if (
      !this.state.configured ||
      !this.state.authenticated ||
      this.isFlushingMutations ||
      this.pendingEntityOps.size === 0
    ) {
      return;
    }

    this.isFlushingMutations = true;
    const allOps = Array.from(this.pendingEntityOps.entries());
    const batchEntries = allOps.slice(0, 1000);
    for (const [k] of batchEntries) {
      this.pendingEntityOps.delete(k);
      this.inFlightEntityKeys.add(k);
    }
    const batchOps = batchEntries.map(([, op]) => op);
    this.updatePendingChangesCount();

    try {
      const res = await fetch('/api/v2/mutations', {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        keepalive,
        body: JSON.stringify({ operations: batchOps })
      });

      if (res.status === 401) {
        this.saveSessionToken('');
        storageService.setAuthenticated(false);
        this.stopPolling();
        this.setState({ authenticated: false, status: 'needs_login' });
        throw new Error('Phiên làm việc hết hạn, vui lòng đăng nhập lại.');
      }

      const data = await res.json().catch(() => null);

      if (res.status === 409 && Array.isArray(data?.conflicts)) {
        const conflictChanges: ServerEntityChangeItem[] = data.conflicts.map((c: any) => ({
          entityType: String(c.entityType || ''),
          id: String(c.id || ''),
          version: Number(c.serverVersion || 1),
          updatedAtMs: Date.now(),
          deletedAtMs: c.deletedAtMs ? Number(c.deletedAtMs) : null,
          record: c.serverRecord || null
        }));
        storageService.applyServerEntityChanges(conflictChanges);
        const conflictMsg =
          data?.error ||
          'Bản ghi bạn đang sửa vừa được người khác cập nhật trước đó. Hệ thống đã tải bản mới nhất.';
        this.setState({
          lastConflictNotice: { id: Date.now(), message: conflictMsg },
          errorMessage: conflictMsg
        });
        return;
      }

      if (res.status === 403 || res.status === 400) {
        const errMsg = data?.error || 'Thao tác không hợp lệ hoặc bị từ chối quyền hạn.';
        this.setState({
          lastConflictNotice: { id: Date.now(), message: errMsg },
          errorMessage: errMsg
        });
        // Re-sync from server so optimistic local change does not diverge from DB
        await this.hydrateInitialFromServer(this.state.sessionUserId || undefined);
        return;
      }

      if (!res.ok || !data?.success) {
        if (res.status >= 500) {
          for (const [k, op] of batchEntries) {
            if (!this.pendingEntityOps.has(k)) {
              this.pendingEntityOps.set(k, op);
            }
          }
        }
        throw new Error(data?.error || 'Không thể lưu thay đổi lên PostgreSQL.');
      }

      if (Array.isArray(data.results)) {
        storageService.updateEntityVersionsFromResults(data.results);
      }

      const savedAt = Number(data.serverTimeMs || Date.now());
      if (savedAt > this.lastServerTimeMs) {
        this.lastServerTimeMs = savedAt;
      }

      this.setState({
        status: 'synced',
        lastSyncedAt: formatNowShort(),
        errorMessage: null
      });
    } catch (err) {
      if (err instanceof TypeError) {
        // Network disconnect: re-queue for retry
        for (const [k, op] of batchEntries) {
          if (!this.pendingEntityOps.has(k)) {
            this.pendingEntityOps.set(k, op);
          }
        }
      }
      throw err;
    } finally {
      for (const [k] of batchEntries) {
        this.inFlightEntityKeys.delete(k);
      }
      this.isFlushingMutations = false;
      this.updatePendingChangesCount();

      if (this.pendingEntityOps.size > 0 && !this.pendingMutationsTimer && !keepalive) {
        this.pendingMutationsTimer = window.setTimeout(() => {
          this.pendingMutationsTimer = null;
          void this.flushEntityMutations().catch(() => {});
        }, 120);
      }
    }
  }

  private async pushBucket(
    bucketKey: CloudBucketKey,
    items: Record<string, unknown>[],
    keepalive = false
  ): Promise<void> {
    if (!this.state.configured || !this.state.authenticated) return;

    this.inFlightBuckets.add(bucketKey);
    this.updatePendingChangesCount();

    try {
      const expectedUpdatedAtMs = this.bucketVersions[bucketKey] || 0;
      const res = await fetch(`/api/db/bucket/${encodeURIComponent(bucketKey)}`, {
        method: 'PUT',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        keepalive,
        body: JSON.stringify({ items, expectedUpdatedAtMs })
      });

      if (res.status === 401) {
        this.saveSessionToken('');
        storageService.setAuthenticated(false);
        this.stopPolling();
        this.setState({ authenticated: false, status: 'needs_login' });
        throw new Error('Phiên làm việc hết hạn, vui lòng đăng nhập lại.');
      }

      const data = await res.json();
      if (res.status === 409 && data?.serverBucket) {
        const srv = data.serverBucket;
        if (srv.updatedAtMs) {
          this.bucketVersions[bucketKey] = Number(srv.updatedAtMs);
        }
        if (Array.isArray(srv.items)) {
          storageService.applyRemoteBucketData(bucketKey, srv.items);
        }
        storageService.clearBucketDirty(bucketKey);
        this.failedRetryBuckets.delete(bucketKey);
        const conflictMsg =
          data?.error || 'Dữ liệu vừa được cán bộ khác cập nhật. Hệ thống đã tải bản mới nhất.';
        this.setState({
          lastConflictNotice: { id: Date.now(), message: conflictMsg },
          errorMessage: conflictMsg
        });
        throw new Error(conflictMsg);
      }

      if (!res.ok || !data?.success) {
        if (res.status >= 500) {
          this.failedRetryBuckets.add(bucketKey);
        }
        throw new Error(data?.error || `Lỗi lưu ${bucketKey} lên PostgreSQL.`);
      }

      this.failedRetryBuckets.delete(bucketKey);
      const savedAt = Number(data.updatedAtMs || Date.now());
      this.bucketVersions[bucketKey] = savedAt;
      if (savedAt > this.lastServerTimeMs) {
        this.lastServerTimeMs = savedAt;
      }
      this.setState({
        status: 'synced',
        lastSyncedAt: formatNowShort(),
        errorMessage: null
      });
    } catch (err) {
      if (err instanceof TypeError) {
        this.failedRetryBuckets.add(bucketKey);
      }
      throw err;
    } finally {
      this.inFlightBuckets.delete(bucketKey);
      this.updatePendingChangesCount();
    }
  }

  private queueBucketPush(bucketKey: CloudBucketKey): void {
    if (!this.state.configured || !this.state.authenticated) return;

    const existingTimer = this.pendingBucketTimers[bucketKey];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    this.pendingBucketTimers[bucketKey] = window.setTimeout(() => {
      delete this.pendingBucketTimers[bucketKey];
      const items = storageService.getBucketItemsForCloud(bucketKey);
      void this.pushBucket(bucketKey, items).catch((err) => {
        this.setState({
          errorMessage: err instanceof Error ? err.message : String(err)
        });
      });
    }, 250);
    this.updatePendingChangesCount();
  }

  private async pushReportCells(
    archiveKey: string,
    year: number,
    monthKey: string,
    cells: ReportCellPatchInput[],
    fullItems: ArchivedCaseReportItem[],
    keepalive = false
  ): Promise<void> {
    if (!this.state.configured || !this.state.authenticated || cells.length === 0) return;

    const res = await fetch(`/api/v2/reports/${encodeURIComponent(archiveKey)}/cells`, {
      method: 'PUT',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      keepalive,
      body: JSON.stringify({ year, monthKey, cells })
    });

    if (res.status === 401) {
      this.saveSessionToken('');
      storageService.setAuthenticated(false);
      this.stopPolling();
      this.setState({ authenticated: false, status: 'needs_login' });
      throw new Error('Phiên làm việc hết hạn, vui lòng đăng nhập lại.');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // Fallback full-month push only if endpoint didn't succeed and not 4xx client error
      if (res.status >= 500) {
        this.queueReportArchivePush(year, monthKey, fullItems);
      }
      throw new Error(data?.error || 'Lỗi lưu ô số liệu báo cáo lên PostgreSQL.');
    }

    const data = await res.json();
    const savedAt = Number(data?.updatedAtMs || Date.now());
    this.reportArchiveVersions[archiveKey] = savedAt;
    if (savedAt > this.lastServerTimeMs) {
      this.lastServerTimeMs = savedAt;
    }
    if (Array.isArray(data?.items) && data.items.length > 0) {
      reportArchiveService.applyCloudMonthArchive(year, monthKey, data.items);
    }
    this.setState({
      status: 'synced',
      lastSyncedAt: formatNowShort(),
      errorMessage: null
    });
  }

  private queueReportCellsPush(
    year: number,
    monthKey: string,
    cells: ReportCellPatchInput[],
    fullItems: ArchivedCaseReportItem[]
  ): void {
    if (!this.state.configured || !this.state.authenticated || cells.length === 0) return;
    const archiveKey = toReportArchiveKey(year, monthKey);

    if (this.pendingCellTimers[archiveKey]) {
      window.clearTimeout(this.pendingCellTimers[archiveKey]);
    }

    const existing = this.pendingCellPayloads[archiveKey] || {
      year,
      monthKey,
      cells: new Map<string, ReportCellPatchInput>(),
      fullItems
    };
    existing.fullItems = fullItems;
    for (const c of cells) {
      existing.cells.set(`${c.serviceId}:${c.day}`, c);
    }
    this.pendingCellPayloads[archiveKey] = existing;

    this.pendingCellTimers[archiveKey] = window.setTimeout(() => {
      delete this.pendingCellTimers[archiveKey];
      const payload = this.pendingCellPayloads[archiveKey];
      delete this.pendingCellPayloads[archiveKey];
      if (!payload) return;
      void this.pushReportCells(
        archiveKey,
        payload.year,
        payload.monthKey,
        Array.from(payload.cells.values()),
        payload.fullItems
      )
        .catch((err) => {
          this.setState({
            errorMessage: err instanceof Error ? err.message : String(err)
          });
        })
        .finally(() => this.updatePendingChangesCount());
    }, 200);
    this.updatePendingChangesCount();
  }

  private async pushReportArchive(
    year: number,
    monthKey: string,
    items: ArchivedCaseReportItem[],
    keepalive = false,
    forceOverwrite = false
  ): Promise<void> {
    if (!this.state.configured || !this.state.authenticated) return;
    const archiveKey = toReportArchiveKey(year, monthKey);
    const expectedUpdatedAtMs = this.reportArchiveVersions[archiveKey] || 0;

    const res = await fetch(`/api/db/report-archive/${encodeURIComponent(archiveKey)}`, {
      method: 'PUT',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      keepalive,
      body: JSON.stringify({ year, monthKey, items, expectedUpdatedAtMs, forceOverwrite })
    });

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      if (data?.serverArchive && Array.isArray(data.serverArchive.items)) {
        this.reportArchiveVersions[archiveKey] = Number(data.serverArchive.updatedAtMs || Date.now());
        reportArchiveService.applyCloudMonthArchive(
          data.serverArchive.year,
          data.serverArchive.monthKey,
          data.serverArchive.items
        );
      }
      const conflictMsg =
        data?.error || 'Báo cáo tháng vừa được cập nhật ở nơi khác. Hệ thống đã tải bản mới nhất.';
      this.setState({
        lastConflictNotice: { id: Date.now(), message: conflictMsg },
        errorMessage: conflictMsg
      });
      throw new Error(conflictMsg);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Lỗi lưu báo cáo tháng lên PostgreSQL.');
    }

    const data = await res.json();
    const savedAt = Number(data?.updatedAtMs || Date.now());
    this.reportArchiveVersions[archiveKey] = savedAt;
    if (savedAt > this.lastServerTimeMs) {
      this.lastServerTimeMs = savedAt;
    }
    this.setState({
      status: 'synced',
      lastSyncedAt: formatNowShort(),
      errorMessage: null
    });
  }

  private queueReportArchivePush(
    year: number,
    monthKey: string,
    items: ArchivedCaseReportItem[]
  ): void {
    if (!this.state.configured || !this.state.authenticated) return;

    const archiveKey = toReportArchiveKey(year, monthKey);
    if (this.pendingReportTimers[archiveKey]) {
      window.clearTimeout(this.pendingReportTimers[archiveKey]);
    }

    this.pendingReportPayloads[archiveKey] = { year, monthKey, items };
    this.pendingReportTimers[archiveKey] = window.setTimeout(() => {
      delete this.pendingReportTimers[archiveKey];
      delete this.pendingReportPayloads[archiveKey];
      void this.pushReportArchive(year, monthKey, items)
        .catch((err) => {
          this.setState({
            errorMessage: err instanceof Error ? err.message : String(err)
          });
        })
        .finally(() => this.updatePendingChangesCount());
    }, 250);
    this.updatePendingChangesCount();
  }

  public async forceSaveReportMonthToServer(
    year: number,
    monthKey: string,
    items: ArchivedCaseReportItem[]
  ): Promise<{ saved: boolean; reason?: string }> {
    if (!this.state.configured) {
      return { saved: false, reason: 'PostgreSQL chưa được cấu hình.' };
    }
    if (!this.state.authenticated) {
      return { saved: false, reason: 'Chưa đăng nhập phiên PostgreSQL.' };
    }
    const archiveKey = toReportArchiveKey(year, monthKey);
    if (this.pendingReportTimers[archiveKey]) {
      window.clearTimeout(this.pendingReportTimers[archiveKey]);
      delete this.pendingReportTimers[archiveKey];
    }
    if (this.pendingCellTimers[archiveKey]) {
      window.clearTimeout(this.pendingCellTimers[archiveKey]);
      delete this.pendingCellTimers[archiveKey];
      delete this.pendingCellPayloads[archiveKey];
    }

    try {
      await this.pushReportArchive(year, monthKey, items, false, true);
      return { saved: true };
    } catch (err) {
      return {
        saved: false,
        reason: err instanceof Error ? err.message : String(err)
      };
    }
  }

  public async changePassword(
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.state.configured) {
      const cur = storageService.getCurrentUser();
      return storageService.changePassword(cur.id, oldPassword, newPassword);
    }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        return { success: false, message: json?.error || 'Không thể đổi mật khẩu.' };
      }
      if (json.updatedAtMs) {
        this.bucketVersions.users = Number(json.updatedAtMs);
      }
      return { success: true, message: json.message || 'Đổi mật khẩu thành công!' };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Lỗi kết nối khi đổi mật khẩu.'
      };
    }
  }

  public async adminResetPassword(
    userId: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.state.configured) {
      return storageService.resetUserPassword(userId, newPassword);
    }
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ userId, newPassword })
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        return { success: false, message: json?.error || 'Không thể đặt lại mật khẩu.' };
      }
      if (json.updatedAtMs) {
        this.bucketVersions.users = Number(json.updatedAtMs);
      }
      await this.pollChanges();
      return { success: true, message: json.message || 'Đã đặt lại mật khẩu thành công.' };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Lỗi kết nối khi đặt lại mật khẩu.'
      };
    }
  }

  public async requestPasswordReset(
    email: string,
    note?: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.state.configured) {
      return storageService.requestPasswordReset(email, note);
    }
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'CLSWorkHub'
        },
        credentials: 'include',
        body: JSON.stringify({ email, note })
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        return { success: false, message: json?.error || 'Không thể gửi yêu cầu reset mật khẩu.' };
      }
      return {
        success: true,
        message:
          json.message ||
          'Đã gửi yêu cầu khôi phục mật khẩu tới Admin. Vui lòng liên hệ Quản trị viên để nhận mật khẩu mới.'
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Lỗi gửi yêu cầu reset mật khẩu.'
      };
    }
  }

  public async syncAllLocalToServer(): Promise<{
    bucketsPushed: number;
    reportMonthsPushed: number;
  }> {
    if (!this.state.configured || !this.state.authenticated) {
      throw new Error('Vui lòng đăng nhập tài khoản ứng dụng trước khi đồng bộ lên PostgreSQL.');
    }

    this.setState({ status: 'syncing', errorMessage: null });
    try {
      const bucketsPayload: Record<string, Record<string, unknown>[]> = {};
      const bucketKeys = Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[];
      for (const bucketKey of bucketKeys) {
        bucketsPayload[bucketKey] = storageService.getBucketItemsForCloud(bucketKey);
      }

      const idbYears = await reportArchiveService.getAllKnownYearsFromIDB();
      const settings = storageService.getSettings();
      const yearsToSync = getKnownReportYears(settings, [
        ...idbYears,
        settings.reportSheetYear || DEFAULT_REPORT_YEAR
      ]);

      const reportArchivesPayload: Array<{
        archiveKey: string;
        year: number;
        monthKey: string;
        items: ArchivedCaseReportItem[];
      }> = [];

      for (const year of yearsToSync) {
        if (!isValidReportYear(year)) continue;
        const yearStore = await reportArchiveService.hydrateYearArchiveFromIDB(year);
        for (const monthKey of REPORT_MONTHS) {
          const items = yearStore[monthKey];
          if (items && items.length > 0) {
            reportArchivesPayload.push({
              archiveKey: toReportArchiveKey(year, monthKey),
              year,
              monthKey,
              items
            });
          }
        }
      }

      const res = await fetch('/api/db/bulk-push', {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          buckets: bucketsPayload,
          reportArchives: reportArchivesPayload
        })
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Lỗi đẩy dữ liệu lên PostgreSQL.');
      }

      storageService.clearBucketDirty();
      this.lastServerTimeMs = Number(data.updatedAtMs || Date.now());
      this.setState({
        status: 'synced',
        lastSyncedAt: formatNowShort(),
        syncedBucketsCount: Number(data.bucketsPushed || 0),
        syncedReportMonthsCount: Number(data.reportMonthsPushed || 0),
        errorMessage: null
      });

      return {
        bucketsPushed: Number(data.bucketsPushed || 0),
        reportMonthsPushed: Number(data.reportMonthsPushed || 0)
      };
    } catch (err) {
      this.setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  }

  public async pullAllServerToLocal(): Promise<{
    bucketsPulled: number;
    reportMonthsPulled: number;
  }> {
    if (!this.state.configured || !this.state.authenticated) {
      throw new Error('Vui lòng đăng nhập tài khoản ứng dụng trước khi tải từ PostgreSQL.');
    }

    this.setState({ status: 'syncing', errorMessage: null });
    try {
      await this.hydrateInitialFromServer(this.state.sessionUserId || undefined);
      return {
        bucketsPulled: this.state.syncedBucketsCount,
        reportMonthsPulled: this.state.syncedReportMonthsCount
      };
    } catch (err) {
      this.setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  }
}

export const postgresSyncService = new PostgresSyncService();
