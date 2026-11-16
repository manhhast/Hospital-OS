import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe
} from 'firebase/firestore';
import {
  auth,
  db,
  firebaseConfig,
  handleFirestoreError,
  OperationType,
  signInWithGoogleForFirebase,
  signOutFromFirebase,
  testFirestoreConnection
} from './firebaseClient';
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
  toFirestoreReportArchiveKey,
  type ArchivedCaseReportItem
} from './reportArchiveService';
import type { UserRole } from '../types/hospital';

export const FIRESTORE_WORKSPACE_ID = 'cls-song-thuong';
export const BOOTSTRAPPED_ADMIN_EMAIL = 'ngmha.st@gmail.com';

export type CloudSyncStatus =
  | 'disconnected'
  | 'connecting'
  | 'synced'
  | 'syncing'
  | 'unauthorized'
  | 'unverified'
  | 'error';

export interface CloudInviteItem {
  inviteId: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export interface CloudMemberItem {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: 'Active' | 'Revoked';
}

export interface FirebaseCloudState {
  status: CloudSyncStatus;
  userEmail: string | null;
  userName: string | null;
  userUid: string | null;
  isAdmin: boolean;
  workspaceId: string;
  projectId: string;
  lastSyncedAt: string | null;
  syncedBucketsCount: number;
  syncedReportMonthsCount: number;
  activeReportYear: number;
  errorMessage: string | null;
  unauthorizedDomain: string | null;
  invites: CloudInviteItem[];
  members: CloudMemberItem[];
}

function encodeEmailSlug(email: string): string {
  const normalized = email.trim().toLowerCase();
  let hex = '';
  for (let i = 0; i < normalized.length; i++) {
    hex += normalized.charCodeAt(i).toString(16).padStart(2, '0');
  }
  const raw = `inv_${hex}`;
  return raw.length <= 120 ? raw : raw.slice(0, 120);
}

function sanitizeForFirestore<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined && typeof v !== 'function')
      .map((v) => sanitizeForFirestore(v)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || typeof v === 'function' || k === 'rawFileData') continue;
      out[k] = sanitizeForFirestore(v);
    }
    return out as T;
  }
  return value;
}

function formatNowShort(): string {
  return new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
}

class FirebaseSyncService {
  private initialized = false;
  private listeners: Array<() => void> = [];
  private authUnsubscribe: Unsubscribe | null = null;
  private bucketUnsubs: Unsubscribe[] = [];
  private reportUnsubs: Unsubscribe[] = [];
  private adminUnsubs: Unsubscribe[] = [];
  private pendingBucketTimers: Partial<Record<CloudBucketKey, number>> = {};
  private pendingReportTimers: Record<string, number> = {};
  private currentFirebaseUser: FirebaseUser | null = null;

  private state: FirebaseCloudState = {
    status: 'disconnected',
    userEmail: null,
    userName: null,
    userUid: null,
    isAdmin: false,
    workspaceId: FIRESTORE_WORKSPACE_ID,
    projectId: firebaseConfig.projectId,
    lastSyncedAt: null,
    syncedBucketsCount: 0,
    syncedReportMonthsCount: 0,
    activeReportYear: storageService.getSettings().reportSheetYear || DEFAULT_REPORT_YEAR,
    errorMessage: null,
    unauthorizedDomain: null,
    invites: [],
    members: []
  };

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getState(): FirebaseCloudState {
    return this.state;
  }

  private setState(patch: Partial<FirebaseCloudState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    void testFirestoreConnection();

    storageService.registerCloudBucketChangeHandler((bucketKey) => {
      this.queueBucketPush(bucketKey);
    });

    registerCloudReportArchiveHandler((year, monthKey, items) => {
      this.queueReportArchivePush(year, monthKey, items);
    });

    this.authUnsubscribe = onAuthStateChanged(auth, (fbUser) => {
      void this.handleAuthStateChanged(fbUser);
    });
  }

  public destroy(): void {
    this.clearRealtimeListeners();
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }
    registerCloudReportArchiveHandler(null);
    storageService.registerCloudBucketChangeHandler(null);
    this.initialized = false;
  }

  private clearRealtimeListeners(): void {
    this.bucketUnsubs.forEach((u) => u());
    this.bucketUnsubs = [];
    this.reportUnsubs.forEach((u) => u());
    this.reportUnsubs = [];
    this.adminUnsubs.forEach((u) => u());
    this.adminUnsubs = [];
  }

  public async signInWithGoogle(): Promise<{
    success: boolean;
    code?: string;
    message: string;
  }> {
    try {
      this.setState({ status: 'connecting', errorMessage: null, unauthorizedDomain: null });
      const user = await signInWithGoogleForFirebase();
      return {
        success: true,
        message: `Đã kết nối tài khoản Google ${user.email || ''} với Firebase.`
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const rawCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      const hostname =
        typeof window !== 'undefined' && window.location?.hostname
          ? window.location.hostname
          : 'tên miền hiện tại';

      const isUnauthorizedDomain =
        rawCode === 'auth/unauthorized-domain' || msg.includes('auth/unauthorized-domain');
      const isPopupClosed =
        rawCode === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user');
      const isPopupBlocked =
        rawCode === 'auth/popup-blocked' || msg.includes('auth/popup-blocked');
      const isNetworkError =
        rawCode === 'auth/network-request-failed' || msg.includes('network-request-failed');

      let friendlyMessage = `Không thể đăng nhập Google: ${msg}`;
      let detectedCode = rawCode || undefined;

      if (isUnauthorizedDomain) {
        detectedCode = 'auth/unauthorized-domain';
        friendlyMessage = `Tên miền "${hostname}" chưa được thêm vào Authorized domains của Firebase Authentication (Project: ${firebaseConfig.projectId}). Mở Cấu hình Hệ thống để sao chép tên miền và thêm vào Firebase Console.`;
      } else if (isPopupClosed) {
        detectedCode = 'auth/popup-closed-by-user';
        friendlyMessage = 'Đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.';
      } else if (isPopupBlocked) {
        detectedCode = 'auth/popup-blocked';
        friendlyMessage =
          'Trình duyệt đang chặn cửa sổ bật lên (Pop-up) đăng nhập Google. Vui lòng cho phép Pop-up cho trang web này và thử lại.';
      } else if (isNetworkError) {
        detectedCode = 'auth/network-request-failed';
        friendlyMessage = 'Lỗi kết nối mạng tới Google Authentication. Vui lòng kiểm tra Internet và thử lại.';
      }

      this.setState({
        status: this.currentFirebaseUser ? 'error' : 'disconnected',
        errorMessage: isPopupClosed ? null : friendlyMessage,
        unauthorizedDomain: isUnauthorizedDomain ? hostname : null
      });

      return {
        success: false,
        code: detectedCode,
        message: friendlyMessage
      };
    }
  }

  public async signOut(): Promise<void> {
    this.clearRealtimeListeners();
    this.currentFirebaseUser = null;
    await signOutFromFirebase();
    this.setState({
      status: 'disconnected',
      userEmail: null,
      userName: null,
      userUid: null,
      isAdmin: false,
      errorMessage: null,
      unauthorizedDomain: null,
      invites: [],
      members: []
    });
  }

  private async handleAuthStateChanged(fbUser: FirebaseUser | null): Promise<void> {
    this.clearRealtimeListeners();
    this.currentFirebaseUser = fbUser;

    if (!fbUser) {
      this.setState({
        status: 'disconnected',
        userEmail: null,
        userName: null,
        userUid: null,
        isAdmin: false,
        invites: [],
        members: []
      });
      return;
    }

    if (!fbUser.emailVerified) {
      this.setState({
        status: 'unverified',
        userEmail: fbUser.email,
        userName: fbUser.displayName,
        userUid: fbUser.uid,
        isAdmin: false,
        errorMessage: 'Tài khoản Google chưa xác minh email để đồng bộ Firestore.'
      });
      return;
    }

    this.setState({
      status: 'connecting',
      userEmail: fbUser.email,
      userName: fbUser.displayName,
      userUid: fbUser.uid,
      errorMessage: null,
      unauthorizedDomain: null
    });

    try {
      const access = await this.ensureWorkspaceAccess(fbUser);
      if (!access.authorized) {
        this.setState({
          status: 'unauthorized',
          isAdmin: false,
          errorMessage:
            access.reason ||
            `Email ${fbUser.email} chưa được Admin (${BOOTSTRAPPED_ADMIN_EMAIL}) cấp quyền đồng bộ lên workspace.`
        });
        return;
      }

      this.setState({ isAdmin: access.isAdmin, status: 'syncing' });

      await this.attachAndInitialSyncBuckets(fbUser);
      await this.subscribeReportYear(this.state.activeReportYear);

      if (access.isAdmin) {
        this.attachAdminDirectoryListeners(fbUser);
      }

      this.setState({
        status: 'synced',
        lastSyncedAt: formatNowShort(),
        errorMessage: null
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({
        status: 'error',
        errorMessage: msg
      });
    }
  }

  private async ensureWorkspaceAccess(
    fbUser: FirebaseUser
  ): Promise<{ authorized: boolean; isAdmin: boolean; reason?: string }> {
    const email = (fbUser.email || '').trim().toLowerCase();
    const isBootstrapAdmin = email === BOOTSTRAPPED_ADMIN_EMAIL;
    const displayName = (fbUser.displayName || email || 'Cán bộ CLS').slice(0, 120);

    // 1. Check/bootstrap admin record
    let isCloudAdmin = isBootstrapAdmin;
    const adminPath = `admins/${fbUser.uid}`;
    if (isBootstrapAdmin) {
      try {
        const adminRef = doc(db, 'admins', fbUser.uid);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid: fbUser.uid,
            email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
            grantedAt: serverTimestamp()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, adminPath);
      }
    } else {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
        if (adminSnap.exists()) {
          isCloudAdmin = true;
        }
      } catch {
        // Non-admin read denial on missing admin doc is fine
      }
    }

    // 2. Ensure workspace exists (created by Admin on first connect)
    const wsPath = `workspaces/${FIRESTORE_WORKSPACE_ID}`;
    const wsRef = doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID);
    let wsExists = false;
    try {
      const wsSnap = await getDoc(wsRef);
      wsExists = wsSnap.exists();
    } catch (err) {
      if (isCloudAdmin) {
        handleFirestoreError(err, OperationType.GET, wsPath);
      }
    }

    if (!wsExists) {
      if (!isCloudAdmin) {
        return {
          authorized: false,
          isAdmin: false,
          reason: `Kho dữ liệu Firebase chưa được khởi tạo. Vui lòng đăng nhập lần đầu bằng tài khoản quản trị (${BOOTSTRAPPED_ADMIN_EMAIL}).`
        };
      }
      try {
        const driveFolderId = (
          storageService.getSettings().googleDriveFolderId || '1CLSWorkHub_MainFolder_GoogleDrive_ID'
        ).slice(0, 200);
        await setDoc(wsRef, {
          workspaceId: FIRESTORE_WORKSPACE_ID,
          ownerId: fbUser.uid,
          name: 'Khoa Cận Lâm Sàng - BVĐK Sông Thương',
          googleDriveFolderId: driveFolderId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, wsPath);
      }
    }

    // 3. Ensure active member document exists
    const memberPath = `workspaces/${FIRESTORE_WORKSPACE_ID}/members/${fbUser.uid}`;
    const memberRef = doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'members', fbUser.uid);
    let memberData: Record<string, unknown> | null = null;
    try {
      const mSnap = await getDoc(memberRef);
      if (mSnap.exists()) {
        memberData = mSnap.data() as Record<string, unknown>;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, memberPath);
    }

    if (memberData) {
      if (memberData.status === 'Revoked') {
        return {
          authorized: false,
          isAdmin: false,
          reason: `Tài khoản ${fbUser.email} đã bị thu hồi quyền truy cập Cloud Firestore.`
        };
      }
      return {
        authorized: true,
        isAdmin: isCloudAdmin || memberData.role === 'Admin'
      };
    }

    if (isCloudAdmin) {
      try {
        await setDoc(memberRef, {
          uid: fbUser.uid,
          workspaceId: FIRESTORE_WORKSPACE_ID,
          ownerId: fbUser.uid,
          inviteId: 'bootstrap_admin',
          email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
          displayName,
          role: 'Admin',
          status: 'Active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, memberPath);
      }
      return { authorized: true, isAdmin: true };
    }

    // Check invite for non-admin colleagues
    const inviteSlug = encodeEmailSlug(email);
    const invitePath = `workspaces/${FIRESTORE_WORKSPACE_ID}/invites/${inviteSlug}`;
    try {
      const inviteSnap = await getDoc(
        doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'invites', inviteSlug)
      );
      if (!inviteSnap.exists()) {
        return {
          authorized: false,
          isAdmin: false,
          reason: `Email ${fbUser.email} chưa được Admin (${BOOTSTRAPPED_ADMIN_EMAIL}) cấp quyền đồng bộ trên Firebase.`
        };
      }
      const inv = inviteSnap.data() as { role?: UserRole; email?: string };
      const assignedRole: UserRole = inv.role || 'Staff';
      await setDoc(memberRef, {
        uid: fbUser.uid,
        workspaceId: FIRESTORE_WORKSPACE_ID,
        ownerId: fbUser.uid,
        inviteId: inviteSlug,
        email: fbUser.email || email,
        displayName,
        role: assignedRole,
        status: 'Active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { authorized: true, isAdmin: assignedRole === 'Admin' };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, invitePath);
    }
  }

  private async attachAndInitialSyncBuckets(fbUser: FirebaseUser): Promise<void> {
    const bucketKeys = Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[];
    let syncedCount = 0;

    await Promise.all(
      bucketKeys.map(async (bucketKey) => {
        const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/buckets/${bucketKey}`;
        const docRef = doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'buckets', bucketKey);

        try {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data() as { items?: Record<string, unknown>[] };
            if (Array.isArray(data.items) && data.items.length > 0) {
              storageService.applyRemoteBucketData(bucketKey, data.items);
            }
            syncedCount++;
          } else {
            const localItems = storageService.getBucketItemsForCloud(bucketKey);
            if (localItems.length > 0) {
              await this.writeBucketDoc(fbUser, bucketKey, localItems, false);
              syncedCount++;
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, path);
        }

        const unsub = onSnapshot(
          docRef,
          (snap) => {
            if (!snap.exists() || snap.metadata.hasPendingWrites) return;
            const data = snap.data() as { items?: Record<string, unknown>[] };
            if (Array.isArray(data.items)) {
              storageService.applyRemoteBucketData(bucketKey, data.items);
              this.setState({ lastSyncedAt: formatNowShort() });
            }
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, path);
          }
        );
        this.bucketUnsubs.push(unsub);
      })
    );

    this.setState({ syncedBucketsCount: syncedCount });
  }

  private async writeBucketDoc(
    fbUser: FirebaseUser,
    bucketKey: CloudBucketKey,
    rawItems: Record<string, unknown>[],
    knowExists?: boolean
  ): Promise<void> {
    const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/buckets/${bucketKey}`;
    const docRef = doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'buckets', bucketKey);
    const safeItems = sanitizeForFirestore(rawItems).slice(0, 1000);
    const updatedByName = (fbUser.displayName || fbUser.email || 'CLS Staff').slice(0, 120);

    try {
      const exists = knowExists !== undefined ? knowExists : (await getDoc(docRef)).exists();
      if (exists) {
        await updateDoc(docRef, {
          items: safeItems,
          itemCount: safeItems.length,
          updatedByUid: fbUser.uid,
          updatedByName,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(docRef, {
          bucketKey,
          workspaceId: FIRESTORE_WORKSPACE_ID,
          ownerId: fbUser.uid,
          items: safeItems,
          itemCount: safeItems.length,
          updatedByUid: fbUser.uid,
          updatedByName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      this.setState({ lastSyncedAt: formatNowShort() });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  private queueBucketPush(bucketKey: CloudBucketKey): void {
    const fbUser = this.currentFirebaseUser;
    if (!fbUser || !fbUser.emailVerified) return;
    if (this.state.status !== 'synced' && this.state.status !== 'syncing') return;

    const existingTimer = this.pendingBucketTimers[bucketKey];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    this.pendingBucketTimers[bucketKey] = window.setTimeout(() => {
      delete this.pendingBucketTimers[bucketKey];
      const activeUser = this.currentFirebaseUser;
      if (!activeUser) return;
      const items = storageService.getBucketItemsForCloud(bucketKey);
      void this.writeBucketDoc(activeUser, bucketKey, items).catch((err) => {
        this.setState({ errorMessage: err instanceof Error ? err.message : String(err) });
      });
    }, 450);
  }

  public async subscribeReportYear(year: number): Promise<void> {
    this.setState({ activeReportYear: year });
    this.reportUnsubs.forEach((u) => u());
    this.reportUnsubs = [];

    const fbUser = this.currentFirebaseUser;
    if (!fbUser || !fbUser.emailVerified) return;
    if (this.state.status === 'disconnected' || this.state.status === 'unauthorized') return;

    const localYearStore = await reportArchiveService.hydrateYearArchiveFromIDB(year);
    let syncedMonths = 0;

    await Promise.all(
      REPORT_MONTHS.map(async (monthKey) => {
        const archiveKey = toFirestoreReportArchiveKey(year, monthKey);
        const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/report_archives/${archiveKey}`;
        const docRef = doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'report_archives', archiveKey);

        try {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data() as { items?: ArchivedCaseReportItem[] };
            if (Array.isArray(data.items) && data.items.length > 0) {
              const merged = reportArchiveService.applyCloudMonthArchive(year, monthKey, data.items);
              syncedMonths++;
              // If local had additional days/manual edits not yet in cloud, push merged back
              if (localYearStore[monthKey]?.length && merged.length > data.items.length) {
                void this.writeReportArchiveDoc(fbUser, year, monthKey, merged, true);
              }
            }
          } else if (localYearStore[monthKey]?.length) {
            await this.writeReportArchiveDoc(fbUser, year, monthKey, localYearStore[monthKey], false);
            syncedMonths++;
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, path);
        }

        const unsub = onSnapshot(
          docRef,
          (snap) => {
            if (!snap.exists() || snap.metadata.hasPendingWrites) return;
            const data = snap.data() as { items?: ArchivedCaseReportItem[] };
            if (Array.isArray(data.items) && data.items.length > 0) {
              reportArchiveService.applyCloudMonthArchive(year, monthKey, data.items);
              this.setState({ lastSyncedAt: formatNowShort() });
            }
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, path);
          }
        );
        this.reportUnsubs.push(unsub);
      })
    );

    this.setState({ syncedReportMonthsCount: syncedMonths });
  }

  private async writeReportArchiveDoc(
    fbUser: FirebaseUser,
    year: number,
    monthKey: string,
    items: ArchivedCaseReportItem[],
    knowExists?: boolean
  ): Promise<void> {
    const archiveKey = toFirestoreReportArchiveKey(year, monthKey);
    const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/report_archives/${archiveKey}`;
    const docRef = doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'report_archives', archiveKey);
    const safeItems = sanitizeForFirestore(items).slice(0, 500);
    const updatedByName = (fbUser.displayName || fbUser.email || 'CLS Staff').slice(0, 120);

    try {
      const exists = knowExists !== undefined ? knowExists : (await getDoc(docRef)).exists();
      if (exists) {
        await updateDoc(docRef, {
          items: safeItems,
          updatedByUid: fbUser.uid,
          updatedByName,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(docRef, {
          archiveKey,
          workspaceId: FIRESTORE_WORKSPACE_ID,
          ownerId: fbUser.uid,
          year,
          monthKey: monthKey.slice(0, 24),
          items: safeItems,
          updatedByUid: fbUser.uid,
          updatedByName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      this.setState({ lastSyncedAt: formatNowShort() });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  private queueReportArchivePush(
    year: number,
    monthKey: string,
    items: ArchivedCaseReportItem[]
  ): void {
    const fbUser = this.currentFirebaseUser;
    if (!fbUser || !fbUser.emailVerified) return;
    if (this.state.status !== 'synced' && this.state.status !== 'syncing') return;

    const archiveKey = toFirestoreReportArchiveKey(year, monthKey);
    if (this.pendingReportTimers[archiveKey]) {
      window.clearTimeout(this.pendingReportTimers[archiveKey]);
    }

    this.pendingReportTimers[archiveKey] = window.setTimeout(() => {
      delete this.pendingReportTimers[archiveKey];
      const activeUser = this.currentFirebaseUser;
      if (!activeUser) return;
      this.ensureYearTrackedInSettings(year);
      void this.writeReportArchiveDoc(activeUser, year, monthKey, items).catch((err) => {
        this.setState({ errorMessage: err instanceof Error ? err.message : String(err) });
      });
    }, 350);
  }

  private ensureYearTrackedInSettings(year: number): void {
    if (!isValidReportYear(year)) return;
    const settings = storageService.getSettings();
    const existingYears = Array.isArray(settings.archivedReportYears) ? settings.archivedReportYears : [];
    if (!existingYears.includes(year)) {
      const nextYears = Array.from(new Set([...existingYears, year])).sort((a, b) => a - b);
      storageService.saveSettings({
        ...settings,
        archivedReportYears: nextYears
      });
    }
  }

  public async forceSaveReportMonthToCloud(
    year: number,
    monthKey: string,
    items: ArchivedCaseReportItem[]
  ): Promise<{ savedOnFirebase: boolean; reason?: string }> {
    this.ensureYearTrackedInSettings(year);
    const archiveKey = toFirestoreReportArchiveKey(year, monthKey);
    if (this.pendingReportTimers[archiveKey]) {
      window.clearTimeout(this.pendingReportTimers[archiveKey]);
      delete this.pendingReportTimers[archiveKey];
    }

    const fbUser = this.currentFirebaseUser;
    if (!fbUser || !fbUser.emailVerified) {
      return {
        savedOnFirebase: false,
        reason: 'Chưa đăng nhập Google Firebase trên thiết bị này.'
      };
    }
    if (this.state.status !== 'synced' && this.state.status !== 'syncing') {
      return {
        savedOnFirebase: false,
        reason: this.state.errorMessage || 'Tài khoản chưa được kích hoạt đồng bộ Firebase.'
      };
    }

    try {
      await this.writeReportArchiveDoc(fbUser, year, monthKey, items);
      return { savedOnFirebase: true };
    } catch (err) {
      return {
        savedOnFirebase: false,
        reason: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private attachAdminDirectoryListeners(fbUser: FirebaseUser): void {
    const isBootstrap = (fbUser.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
    const invitesCol = collection(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'invites');
    const invitesQuery = isBootstrap
      ? query(invitesCol)
      : query(invitesCol, where('ownerId', '==', fbUser.uid));

    const invUnsub = onSnapshot(
      invitesQuery,
      (snap) => {
        const list: CloudInviteItem[] = snap.docs.map((d) => {
          const data = d.data() as { inviteId: string; email: string; role: UserRole };
          return {
            inviteId: data.inviteId || d.id,
            email: data.email,
            role: data.role
          };
        });
        this.setState({ invites: list });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `workspaces/${FIRESTORE_WORKSPACE_ID}/invites`);
      }
    );
    this.adminUnsubs.push(invUnsub);

    const membersCol = collection(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'members');
    const membersQuery = isBootstrap
      ? query(membersCol)
      : query(membersCol, where('ownerId', '==', fbUser.uid));

    const memUnsub = onSnapshot(
      membersQuery,
      (snap) => {
        const list: CloudMemberItem[] = snap.docs.map((d) => {
          const data = d.data() as CloudMemberItem;
          return {
            uid: data.uid || d.id,
            email: data.email,
            displayName: data.displayName,
            role: data.role,
            status: data.status || 'Active'
          };
        });
        this.setState({ members: list });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `workspaces/${FIRESTORE_WORKSPACE_ID}/members`);
      }
    );
    this.adminUnsubs.push(memUnsub);
  }

  public async inviteCloudMember(
    emailInput: string,
    role: UserRole
  ): Promise<{ success: boolean; message: string }> {
    const fbUser = this.currentFirebaseUser;
    if (!fbUser || !this.state.isAdmin) {
      return { success: false, message: 'Chỉ Quản trị viên Firebase mới có thể cấp quyền email.' };
    }
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, message: 'Địa chỉ email không hợp lệ.' };
    }

    const inviteId = encodeEmailSlug(cleanEmail);
    const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/invites/${inviteId}`;
    const docRef = doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'invites', inviteId);

    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          role,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(docRef, {
          inviteId,
          workspaceId: FIRESTORE_WORKSPACE_ID,
          ownerId: fbUser.uid,
          email: cleanEmail,
          role,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      return {
        success: true,
        message: `Đã cấp quyền đồng bộ Firebase cho ${cleanEmail} (${role}).`
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  public async removeCloudInvite(inviteId: string): Promise<void> {
    if (!this.currentFirebaseUser || !this.state.isAdmin) return;
    const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/invites/${inviteId}`;
    try {
      await deleteDoc(doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'invites', inviteId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  public async toggleMemberStatus(
    memberUid: string,
    nextStatus: 'Active' | 'Revoked'
  ): Promise<void> {
    if (!this.currentFirebaseUser || !this.state.isAdmin) return;
    const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/members/${memberUid}`;
    try {
      await updateDoc(doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'members', memberUid), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  public async syncAllLocalToCloud(): Promise<{
    bucketsPushed: number;
    reportMonthsPushed: number;
  }> {
    const fbUser = this.currentFirebaseUser;
    if (!fbUser || !fbUser.emailVerified) {
      throw new Error('Vui lòng đăng nhập tài khoản Google trước khi đồng bộ lên Firebase.');
    }

    this.setState({ status: 'syncing', errorMessage: null });
    let bucketsPushed = 0;
    let reportMonthsPushed = 0;

    try {
      // Update workspace Drive folder ID reference too
      const driveFolderId = (
        storageService.getSettings().googleDriveFolderId || '1CLSWorkHub_MainFolder_GoogleDrive_ID'
      ).slice(0, 200);
      if (this.state.isAdmin) {
        const wsRef = doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID);
        await updateDoc(wsRef, {
          name: 'Khoa Cận Lâm Sàng - BVĐK Sông Thương',
          googleDriveFolderId: driveFolderId,
          updatedAt: serverTimestamp()
        });
      }

      const bucketKeys = Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[];
      for (const bucketKey of bucketKeys) {
        const items = storageService.getBucketItemsForCloud(bucketKey);
        await this.writeBucketDoc(fbUser, bucketKey, items);
        bucketsPushed++;
      }

      const idbYears = await reportArchiveService.getAllKnownYearsFromIDB();
      const yearsToSync = getKnownReportYears(storageService.getSettings(), [
        ...idbYears,
        this.state.activeReportYear
      ]);

      for (const year of yearsToSync) {
        const yearStore = await reportArchiveService.hydrateYearArchiveFromIDB(year);
        for (const monthKey of REPORT_MONTHS) {
          const items = yearStore[monthKey];
          if (items && items.length > 0) {
            this.ensureYearTrackedInSettings(year);
            await this.writeReportArchiveDoc(fbUser, year, monthKey, items);
            reportMonthsPushed++;
          }
        }
      }

      this.setState({
        status: 'synced',
        syncedBucketsCount: bucketsPushed,
        lastSyncedAt: formatNowShort()
      });

      return { bucketsPushed, reportMonthsPushed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({ status: 'error', errorMessage: msg });
      throw err;
    }
  }

  public async pullAllCloudToLocal(): Promise<{
    bucketsPulled: number;
    reportMonthsPulled: number;
  }> {
    const fbUser = this.currentFirebaseUser;
    if (!fbUser || !fbUser.emailVerified) {
      throw new Error('Vui lòng đăng nhập tài khoản Google trước khi tải dữ liệu từ Firebase.');
    }

    this.setState({ status: 'syncing', errorMessage: null });
    let bucketsPulled = 0;
    let reportMonthsPulled = 0;

    try {
      const bucketKeys = Object.keys(CLOUD_BUCKET_STORAGE_MAP) as CloudBucketKey[];
      await Promise.all(
        bucketKeys.map(async (bucketKey) => {
          const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/buckets/${bucketKey}`;
          try {
            const snap = await getDoc(
              doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'buckets', bucketKey)
            );
            if (snap.exists()) {
              const data = snap.data() as { items?: Record<string, unknown>[] };
              if (Array.isArray(data.items) && data.items.length > 0) {
                storageService.applyRemoteBucketData(bucketKey, data.items);
                bucketsPulled++;
              }
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, path);
          }
        })
      );

      const idbYears = await reportArchiveService.getAllKnownYearsFromIDB();
      const yearsToPull = getKnownReportYears(storageService.getSettings(), [
        ...idbYears,
        this.state.activeReportYear
      ]);

      for (const year of yearsToPull) {
        for (const monthKey of REPORT_MONTHS) {
          const archiveKey = toFirestoreReportArchiveKey(year, monthKey);
          const path = `workspaces/${FIRESTORE_WORKSPACE_ID}/report_archives/${archiveKey}`;
          try {
            const snap = await getDoc(
              doc(db, 'workspaces', FIRESTORE_WORKSPACE_ID, 'report_archives', archiveKey)
            );
            if (snap.exists()) {
              const data = snap.data() as { items?: ArchivedCaseReportItem[] };
              if (Array.isArray(data.items) && data.items.length > 0) {
                reportArchiveService.applyCloudMonthArchive(year, monthKey, data.items);
                reportMonthsPulled++;
              }
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, path);
          }
        }
      }

      this.setState({
        status: 'synced',
        syncedBucketsCount: bucketsPulled,
        lastSyncedAt: formatNowShort()
      });

      return { bucketsPulled, reportMonthsPulled };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({ status: 'error', errorMessage: msg });
      throw err;
    }
  }
}

export const firebaseSyncService = new FirebaseSyncService();
