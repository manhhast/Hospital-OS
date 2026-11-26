import {
  CLOUD_BUCKET_STORAGE_MAP,
  storageService,
  type CloudBucketKey
} from './storageService';
import {
  DEFAULT_REPORT_YEAR,
  getKnownReportYears,
  isValidReportYear,
  REPORT_MONTHS,
  registerCloudReportArchiveHandler,
  reportArchiveService,
  toReportArchiveKey,
  type ArchivedCaseReportItem
} from './reportArchiveService';
import type { User, UserRole } from '../types/hospital';
import { parseDbStatusPayload } from '../utils/postgresStatus';

const PG_SESSION_TOKEN_KEY = 'cls_workhub_pg_session_token_v1';

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
  private inFlightBuckets = new Set<CloudBucketKey>();
  private failedRetryBuckets = new Set<CloudBucketKey>();
  private bucketVersions: Partial<Record<CloudBucketKey, number>> = {};
  private reportArchiveVersions: Record<string, number> = {};
  private lastServerTimeMs = 0;
  private isHydrating = false;
  private hasExplicitSessionLogin = false;
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
      localStorage.removeItem(PG_SESSION_TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
  }

  public getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    const token = this.getSessionToken();
    return {
      ...(extra || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return this.getAuthHeaders(extra);
  }

  private activateStorageHooks(): void {
    storageService.registerCloudConnectedChecker(
      () => this.state.configured && this.state.authenticated && this.state.connected
    );
    storageService.registerCloudBucketChangeHandler((bucketKey) => {
      this.queueBucketPush(bucketKey);
    });
    registerCloudReportArchiveHandler((year, monthKey, items) => {
      this.queueReportArchivePush(year, monthKey, items);
    });
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.hasExplicitSessionLogin = false;
    this.saveSessionToken('');
    storageService.setAuthenticated(false);
    await this.refreshServerStatus();
  }

  public destroy(): void {
    this.stopPolling();
    this.clearPendingTimers();
    if (this.statusRetryTimer !== null) {
      window.clearTimeout(this.statusRetryTimer);
      this.statusRetryTimer = null;
    }
    this.initialized = false;
  }

  private updatePendingChangesCount(): void {
    const bucketPending = new Set<string>([
      ...Object.keys(this.pendingBucketTimers),
      ...Array.from(this.inFlightBuckets),
      ...Array.from(this.failedRetryBuckets),
    ]);
    const reportPending = Object.keys(this.pendingReportTimers).length;
    const total = bucketPending.size + reportPending;
    if (total !== this.state.pendingChangesCount) {
      this.setState({ pendingChangesCount: total });
    }
  }

  private clearPendingTimers(): void {
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
        this.setState({
          configured: false,
          connected: false,
          authenticated: false,
          driver: 'none',
          status: 'unconfigured',
          publicStaffDirectory: [],
          errorMessage: null
        });
        return this.state;
      }

      const dirData = await dirRes.json().catch(() => ({ staff: [] }));
      this.activateStorageHooks();

      const directory: PublicStaffDirectoryItem[] = Array.isArray(dirData?.staff)
        ? dirData.staff
        : [];
      const hasValidSession = parsed.authenticated && this.hasExplicitSessionLogin;

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

      if (!hasValidSession) {
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
        sessionUserName: parsed.sessionUser?.name || null,
        sessionUserRole: parsed.sessionUser?.role || null,
        errorMessage: null
      });

      await this.hydrateInitialFromServer();
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
        headers: { 'Content-Type': 'application/json' },
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

      this.hasExplicitSessionLogin = true;
      this.saveSessionToken(json.token);
      this.activateStorageHooks();

      this.setState({
        authenticated: true,
        connected: true,
        status: 'syncing',
        sessionUserName: json.user?.name || null,
        sessionUserRole: json.user?.role || null,
        errorMessage: null
      });

      await this.hydrateInitialFromServer();
      this.startPolling();

      const allUsers = storageService.getUsers();
      const matched = allUsers.find((u) => u.id === userId) || ({
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
    this.hasExplicitSessionLogin = false;
    this.stopPolling();
    this.clearPendingTimers();
    this.saveSessionToken('');
    if (this.state.configured) {
      this.setState({
        authenticated: false,
        status: 'needs_login',
        sessionUserName: null,
        sessionUserRole: null
      });
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
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

  public async hydrateInitialFromServer(): Promise<void> {
    if (!this.state.configured || !this.state.authenticated || this.isHydrating) return;
    this.isHydrating = true;

    try {
      const res = await fetch('/api/db/state', {
        headers: this.authHeaders(),
        credentials: 'include'
      });

      if (res.status === 401) {
        this.hasExplicitSessionLogin = false;
        this.saveSessionToken('');
        storageService.setAuthenticated(false);
        this.stopPolling();
        this.setState({
          authenticated: false,
          status: 'needs_login',
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
      const dirtyTimestamps = storageService.getDirtyBucketTimestamps();
      const bucketKeys = Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[];
      let syncedBuckets = 0;

      for (const bucketKey of bucketKeys) {
        const remote = remoteBuckets[bucketKey];
        const localItems = storageService.getBucketItemsForCloud(bucketKey);
        const localIsSeed = storageService.isUntouchedSeedData(bucketKey, localItems);
        const dirtyTs = dirtyTimestamps[bucketKey];

        if (remote && Array.isArray(remote.items)) {
          const cloudIsSeed = storageService.isUntouchedSeedData(bucketKey, remote.items);
          const remoteMs = Number(remote.updatedAtMs || 0);
          this.bucketVersions[bucketKey] = remoteMs;
          const shouldPreferLocal =
            (!localIsSeed && cloudIsSeed) ||
            (Boolean(dirtyTs) && !localIsSeed && Number(dirtyTs) > remoteMs);

          if (shouldPreferLocal) {
            await this.pushBucket(bucketKey, localItems);
          } else {
            storageService.applyRemoteBucketData(bucketKey, remote.items);
          }
          syncedBuckets++;
        } else if (!localIsSeed || Boolean(dirtyTs)) {
          await this.pushBucket(bucketKey, localItems);
          syncedBuckets++;
        }
      }

      // Sync report archives across all years
      const remoteArchives = Array.isArray(data.reportArchives) ? data.reportArchives : [];
      const remoteArchiveMap = new Map<string, { year: number; monthKey: string; items: ArchivedCaseReportItem[] }>();
      for (const arch of remoteArchives) {
        if (!arch?.archiveKey || !Array.isArray(arch.items)) continue;
        this.reportArchiveVersions[arch.archiveKey] = Number(arch.updatedAtMs || 0);
        remoteArchiveMap.set(arch.archiveKey, arch);
        if (arch.items.length > 0) {
          reportArchiveService.applyCloudMonthArchive(arch.year, arch.monthKey, arch.items);
        }
      }

      const idbYears = await reportArchiveService.getAllKnownYearsFromIDB();
      const activeSettings = storageService.getSettings();
      const allYears = getKnownReportYears(activeSettings, [
        ...idbYears,
        activeSettings.reportSheetYear || DEFAULT_REPORT_YEAR
      ]);

      for (const year of allYears) {
        const localYearStore = await reportArchiveService.hydrateYearArchiveFromIDB(year);
        for (const monthKey of REPORT_MONTHS) {
          const localItems = localYearStore[monthKey];
          if (!localItems || localItems.length === 0) continue;
          const archiveKey = toReportArchiveKey(year, monthKey);
          const remote = remoteArchiveMap.get(archiveKey);
          if (!remote || localItems.length > remote.items.length) {
            await this.pushReportArchive(year, monthKey, localItems);
          }
        }
      }

      this.setState({
        status: 'synced',
        connected: true,
        lastSyncedAt: formatNowShort(),
        syncedBucketsCount: syncedBuckets,
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
      const res = await fetch(`/api/db/changes?since=${this.lastServerTimeMs}`, {
        headers: this.authHeaders(),
        credentials: 'include'
      });

      if (res.status === 401) {
        this.hasExplicitSessionLogin = false;
        this.saveSessionToken('');
        storageService.setAuthenticated(false);
        this.stopPolling();
        this.setState({
          authenticated: false,
          status: 'needs_login',
          errorMessage: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'
        });
        return;
      }

      const data = await res.json();
      if (!res.ok || !data?.success) return;

      this.lastServerTimeMs = Number(data.serverTimeMs || this.lastServerTimeMs);
      let appliedSomething = false;

      if (Array.isArray(data.buckets)) {
        for (const b of data.buckets) {
          const key = b?.bucketKey as CloudBucketKey;
          if (key && b?.updatedAtMs) {
            this.bucketVersions[key] = Number(b.updatedAtMs);
          }
          if (
            key &&
            Array.isArray(b.items) &&
            !this.pendingBucketTimers[key] &&
            !this.inFlightBuckets.has(key) &&
            !this.failedRetryBuckets.has(key)
          ) {
            storageService.applyRemoteBucketData(key, b.items);
            appliedSomething = true;
          }
        }
      }

      if (Array.isArray(data.reportArchives)) {
        for (const arch of data.reportArchives) {
          if (arch?.archiveKey && arch?.updatedAtMs) {
            this.reportArchiveVersions[arch.archiveKey] = Number(arch.updatedAtMs);
          }
          if (arch?.year && arch?.monthKey && Array.isArray(arch.items) && arch.items.length > 0) {
            reportArchiveService.applyCloudMonthArchive(arch.year, arch.monthKey, arch.items);
            appliedSomething = true;
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
        this.hasExplicitSessionLogin = false;
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
          storageService.markBucketDirty(bucketKey);
        }
        throw new Error(data?.error || `Lỗi lưu ${bucketKey} lên PostgreSQL.`);
      }

      this.failedRetryBuckets.delete(bucketKey);
      storageService.clearBucketDirty(bucketKey);
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
        // Network failure -> keep bucket queued for automatic retry when online
        this.failedRetryBuckets.add(bucketKey);
        storageService.markBucketDirty(bucketKey);
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
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch('/api/db/state', {
        headers: this.authHeaders(),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Lỗi tải dữ liệu từ PostgreSQL.');
      }

      this.lastServerTimeMs = Number(data.serverTimeMs || Date.now());
      const remoteBuckets = (data.buckets || {}) as Record<
        string,
        { items: Record<string, unknown>[] }
      >;
      let bucketsPulled = 0;

      for (const bucketKey of Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[]) {
        const b = remoteBuckets[bucketKey];
        if (b && Array.isArray(b.items)) {
          this.bucketVersions[bucketKey] = Number((b as any).updatedAtMs || Date.now());
          storageService.applyRemoteBucketData(bucketKey, b.items);
          bucketsPulled++;
        }
      }

      const remoteArchives = Array.isArray(data.reportArchives) ? data.reportArchives : [];
      let reportMonthsPulled = 0;
      for (const arch of remoteArchives) {
        if (arch?.archiveKey) {
          this.reportArchiveVersions[arch.archiveKey] = Number(arch.updatedAtMs || Date.now());
        }
        if (arch?.year && arch?.monthKey && Array.isArray(arch.items) && arch.items.length > 0) {
          reportArchiveService.applyCloudMonthArchive(arch.year, arch.monthKey, arch.items);
          reportMonthsPulled++;
        }
      }

      this.setState({
        status: 'synced',
        lastSyncedAt: formatNowShort(),
        syncedBucketsCount: bucketsPulled,
        syncedReportMonthsCount: reportMonthsPulled,
        errorMessage: null
      });

      return { bucketsPulled, reportMonthsPulled };
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
