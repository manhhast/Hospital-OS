import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as authSignOut,
  onAuthStateChanged,
  type Auth,
  type User
} from 'firebase/auth';
import oauthAppletConfig from '../../firebase-applet-config.json';
import type { DocumentItem } from '../types/hospital';
import { getCachedFileUrl } from './fileStorageCache';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const PLACEHOLDER_FOLDER_ID = '1CLSWorkHub_MainFolder_GoogleDrive_ID';

export interface GoogleDriveAuthState {
  isSignedIn: boolean;
  isSigningIn: boolean;
  hasAccessToken: boolean;
  userEmail: string | null;
  userName: string | null;
  userPhoto: string | null;
  errorMessage: string | null;
}

export interface DriveUploadResult {
  driveFileId: string;
  driveUrl: string;
  webContentLink?: string;
  sizeBytes: number;
  checksum: string;
  sharedPublicly: boolean;
  shareWarning?: string;
  folderUsed: string | null;
}

export interface DriveDiagnosticReport {
  folderConfigured: boolean;
  folderId: string;
  folderAccessible: boolean | null;
  folderName?: string;
  apiReachable: boolean;
  latencyMs: number;
  authenticated: boolean;
  accountEmail: string | null;
  storageUsedBytes?: number;
  storageLimitBytes?: number;
  detailMessage: string;
}

// Strict in-memory OAuth access token cache ONLY (never persisted to localStorage or sessionStorage).
let cachedAccessToken: string | null = null;
let oauthApp: FirebaseApp | null = null;
let oauthAuth: Auth | null = null;
let authListenerInitialized = false;

function getOAuthAuth(): Auth {
  if (!oauthApp) {
    oauthApp = getApps().length > 0 ? getApp() : initializeApp(oauthAppletConfig);
  }
  if (!oauthAuth) {
    oauthAuth = getAuth(oauthApp);
  }
  return oauthAuth;
}

function formatGoogleAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const message = err instanceof Error ? err.message : String(err);

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Trình duyệt đang chặn cửa sổ bật lên (Popup). Vui lòng cho phép popup để đăng nhập Google.';
  }
  if (code === 'auth/unauthorized-domain') {
    const domain = typeof window !== 'undefined' ? window.location.hostname : '';
    return `Tên miền "${domain}" chưa được cấp phép OAuth. Vui lòng kiểm tra cấu hình Authorized domains trên Google Cloud.`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Không thể kết nối tới máy chủ xác thực Google. Vui lòng kiểm tra kết nối mạng.';
  }
  return message || 'Không thể kết nối tài khoản Google.';
}

export function isValidGoogleDriveId(id?: string | null): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed === PLACEHOLDER_FOLDER_ID) return false;
  if (trimmed.startsWith('1Drive_') || trimmed.startsWith('drive_')) return false;
  // Google Drive file/folder IDs are alphanumeric + _/- and typically >= 15 characters
  return /^[a-zA-Z0-9_-]{15,}$/.test(trimmed);
}

class GoogleDriveService {
  private listeners = new Set<() => void>();
  private state: GoogleDriveAuthState = {
    isSignedIn: false,
    isSigningIn: false,
    hasAccessToken: false,
    userEmail: null,
    userName: null,
    userPhoto: null,
    errorMessage: null
  };

  constructor() {
    this.ensureAuthListener();
  }

  private ensureAuthListener(): void {
    if (authListenerInitialized || typeof window === 'undefined') return;
    try {
      const auth = getOAuthAuth();
      authListenerInitialized = true;
      onAuthStateChanged(auth, (user: User | null) => {
        if (!user) {
          cachedAccessToken = null;
          this.setState({
            isSignedIn: false,
            hasAccessToken: false,
            userEmail: null,
            userName: null,
            userPhoto: null
          });
        } else {
          this.setState({
            isSignedIn: true,
            hasAccessToken: Boolean(cachedAccessToken),
            userEmail: user.email,
            userName: user.displayName,
            userPhoto: user.photoURL
          });
        }
      });
    } catch (err) {
      console.warn('Unable to initialize Google Drive OAuth listener:', err);
    }
  }

  private setState(patch: Partial<GoogleDriveAuthState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // Ignore subscriber UI errors
      }
    });
  }

  public getState(): GoogleDriveAuthState {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.ensureAuthListener();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public hasActiveWriteSession(): boolean {
    return Boolean(this.state.isSignedIn && cachedAccessToken);
  }

  public async signInWithGoogle(): Promise<{ success: boolean; email?: string; message?: string }> {
    this.ensureAuthListener();
    this.setState({ isSigningIn: true, errorMessage: null });

    try {
      const auth = getOAuthAuth();
      const provider = new GoogleAuthProvider();
      provider.addScope(DRIVE_SCOPE);
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;

      if (!token) {
        const msg = 'Không nhận được Google Drive Access Token. Vui lòng thử đăng nhập lại và cấp quyền truy cập Google Drive.';
        this.setState({
          isSigningIn: false,
          hasAccessToken: false,
          errorMessage: msg
        });
        return { success: false, message: msg };
      }

      cachedAccessToken = token;
      this.setState({
        isSignedIn: true,
        isSigningIn: false,
        hasAccessToken: true,
        userEmail: result.user.email,
        userName: result.user.displayName,
        userPhoto: result.user.photoURL,
        errorMessage: null
      });

      return {
        success: true,
        email: result.user.email || undefined
      };
    } catch (err) {
      const friendly = formatGoogleAuthError(err);
      this.setState({
        isSigningIn: false,
        errorMessage: friendly
      });
      return { success: false, message: friendly };
    }
  }

  public async signOutGoogle(): Promise<void> {
    cachedAccessToken = null;
    try {
      const auth = getOAuthAuth();
      await authSignOut(auth);
    } catch (err) {
      console.warn('Error during Google sign-out:', err);
    }
    this.setState({
      isSignedIn: false,
      isSigningIn: false,
      hasAccessToken: false,
      userEmail: null,
      userName: null,
      userPhoto: null,
      errorMessage: null
    });
  }

  private async ensureValidToken(): Promise<string> {
    if (cachedAccessToken) {
      return cachedAccessToken;
    }
    const res = await this.signInWithGoogle();
    if (!res.success || !cachedAccessToken) {
      throw new Error(res.message || 'Vui lòng đăng nhập tài khoản Google để thao tác với Google Drive.');
    }
    return cachedAccessToken;
  }

  private async driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
    let token = await this.ensureValidToken();
    const doRequest = async (accessToken: string) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${accessToken}`);
      return fetch(url, { ...init, headers });
    };

    let response = await doRequest(token);
    if (response.status === 401) {
      // Access token expired in memory — clear & request fresh Google consent popup once
      cachedAccessToken = null;
      this.setState({ hasAccessToken: false });
      const reauth = await this.signInWithGoogle();
      if (!reauth.success || !cachedAccessToken) {
        throw new Error(reauth.message || 'Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.');
      }
      token = cachedAccessToken;
      response = await doRequest(token);
    }
    return response;
  }

  /**
   * Upload a real File to Google Drive (using configured folder if valid, else Drive root),
   * and grant public read access (`anyone` -> `reader`) so any Hospital OS user can preview & download without Google login.
   */
  public async uploadFileToDrive(params: {
    file: File;
    targetFileName: string;
    description?: string;
    configuredFolderId?: string;
  }): Promise<DriveUploadResult> {
    const token = await this.ensureValidToken();
    const { file, targetFileName, description, configuredFolderId } = params;

    let validParentFolderId: string | null = null;
    if (isValidGoogleDriveId(configuredFolderId)) {
      // Verify the configured folder exists & is accessible to this Google account before uploading into it
      try {
        const folderCheck = await this.driveFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(configuredFolderId!.trim())}?fields=id,name,mimeType,trashed&supportsAllDrives=true`
        );
        if (folderCheck.ok) {
          const folderMeta = (await folderCheck.json()) as { id?: string; trashed?: boolean; mimeType?: string };
          if (folderMeta.id && !folderMeta.trashed && folderMeta.mimeType === 'application/vnd.google-apps.folder') {
            validParentFolderId = folderMeta.id;
          }
        }
      } catch {
        // If verification fails, upload safely to root Drive instead of crashing
      }
    }

    const metadata: { name: string; description?: string; parents?: string[] } = {
      name: targetFileName
    };
    if (description) {
      metadata.description = description;
    }
    if (validParentFolderId) {
      metadata.parents = [validParentFolderId];
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size,mimeType,webViewLink,webContentLink,md5Checksum',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      }
    );

    if (uploadRes.status === 401) {
      cachedAccessToken = null;
      this.setState({ hasAccessToken: false });
      throw new Error('Phiên xác thực Google Drive đã hết hạn. Vui lòng đăng nhập Google lại và thử tải lên.');
    }

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      throw new Error(`Google Drive từ chối tải tệp (${uploadRes.status}): ${errBody}`);
    }

    const uploaded = (await uploadRes.json()) as {
      id: string;
      name?: string;
      size?: string;
      webViewLink?: string;
      webContentLink?: string;
      md5Checksum?: string;
    };

    // Best-effort: enable public link viewing/downloading so Hospital OS users don't need Google login to preview/download
    let sharedPublicly = false;
    let shareWarning: string | undefined;
    try {
      const permRes = await this.driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploaded.id)}/permissions?supportsAllDrives=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        }
      );
      if (permRes.ok) {
        sharedPublicly = true;
      } else {
        const permErr = await permRes.text();
        shareWarning = `Đã tải lên Google Drive nhưng chính sách tổ chức hạn chế bật chia sẻ công khai (${permRes.status}): ${permErr}`;
      }
    } catch (err) {
      shareWarning = err instanceof Error ? err.message : String(err);
    }

    return {
      driveFileId: uploaded.id,
      driveUrl: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      webContentLink: uploaded.webContentLink || `https://drive.google.com/uc?export=download&id=${uploaded.id}`,
      sizeBytes: uploaded.size ? Number(uploaded.size) : file.size,
      checksum: uploaded.md5Checksum ? `md5_${uploaded.md5Checksum}` : `drive_${uploaded.id}`,
      sharedPublicly,
      shareWarning,
      folderUsed: validParentFolderId
    };
  }

  /**
   * Permanently delete a file from Google Drive.
   * Requires an authenticated Google account with Drive permissions.
   */
  public async deleteFileFromDrive(driveFileId?: string | null): Promise<{
    deletedFromDrive: boolean;
    wasLocalOnly: boolean;
    note: string;
  }> {
    if (!this.hasActiveWriteSession()) {
      throw new Error('Bạn cần đăng nhập tài khoản Google trước khi xóa tài liệu trên Google Drive.');
    }

    if (!isValidGoogleDriveId(driveFileId)) {
      return {
        deletedFromDrive: false,
        wasLocalOnly: true,
        note: 'Tệp mẫu hoặc tệp chỉ lưu cục bộ (không có Google Drive File ID thật) — đã xóa khỏi danh mục hệ thống.'
      };
    }

    const res = await this.driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId!.trim())}?supportsAllDrives=true`,
      {
        method: 'DELETE'
      }
    );

    if (res.status === 404) {
      return {
        deletedFromDrive: false,
        wasLocalOnly: false,
        note: 'Tệp không còn tồn tại trên Google Drive (404) — đã gỡ khỏi danh mục hệ thống.'
      };
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Không thể xóa tệp trên Google Drive (${res.status}): ${errText}`);
    }

    return {
      deletedFromDrive: true,
      wasLocalOnly: false,
      note: 'Đã xóa tệp vĩnh viễn khỏi Google Drive và danh mục hệ thống.'
    };
  }

  /**
   * Verify Drive API connectivity, quota, and target folder (requires Google login for private/write API check).
   */
  public async runDiagnostics(configuredFolderId?: string): Promise<DriveDiagnosticReport> {
    const cleanFolder = (configuredFolderId || '').trim();
    const folderConfigured = isValidGoogleDriveId(cleanFolder);

    if (!this.hasActiveWriteSession()) {
      return {
        folderConfigured,
        folderId: cleanFolder || PLACEHOLDER_FOLDER_ID,
        folderAccessible: null,
        apiReachable: true,
        latencyMs: 0,
        authenticated: false,
        accountEmail: this.state.userEmail,
        detailMessage: 'Chế độ Chỉ Xem & Tải về công khai đang hoạt động. Đăng nhập Google để kiểm tra hạn ngạch Drive và quyền tải lên/xóa.'
      };
    }

    const start = performance.now();
    const aboutRes = await this.driveFetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName),storageQuota(usage,limit)'
    );
    const latencyMs = Math.max(1, Math.round(performance.now() - start));

    if (!aboutRes.ok) {
      const txt = await aboutRes.text();
      throw new Error(`Google Drive API trả về lỗi ${aboutRes.status}: ${txt}`);
    }

    const aboutData = (await aboutRes.json()) as {
      user?: { emailAddress?: string };
      storageQuota?: { usage?: string; limit?: string };
    };

    let folderAccessible: boolean | null = null;
    let folderName: string | undefined;

    if (folderConfigured) {
      try {
        const fRes = await this.driveFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanFolder)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`
        );
        if (fRes.ok) {
          const fMeta = (await fRes.json()) as { name?: string; trashed?: boolean; mimeType?: string };
          folderAccessible = !fMeta.trashed && fMeta.mimeType === 'application/vnd.google-apps.folder';
          folderName = fMeta.name;
        } else {
          folderAccessible = false;
        }
      } catch {
        folderAccessible = false;
      }
    }

    return {
      folderConfigured,
      folderId: cleanFolder || PLACEHOLDER_FOLDER_ID,
      folderAccessible,
      folderName,
      apiReachable: true,
      latencyMs,
      authenticated: true,
      accountEmail: aboutData.user?.emailAddress || this.state.userEmail,
      storageUsedBytes: aboutData.storageQuota?.usage ? Number(aboutData.storageQuota.usage) : undefined,
      storageLimitBytes: aboutData.storageQuota?.limit ? Number(aboutData.storageQuota.limit) : undefined,
      detailMessage: 'Kết nối Google Drive API v3 thành công. Tài khoản sẵn sàng tải lên và quản lý hồ sơ.'
    };
  }

  /**
   * Public URL for embedded iframe preview (works without Google login when Drive file has reader access).
   */
  public getPublicPreviewUrl(doc: DocumentItem): string | null {
    const cached = getCachedFileUrl(doc.id, doc.rawFileData || '');
    if (cached) return cached;
    if (isValidGoogleDriveId(doc.driveFileId)) {
      return `https://drive.google.com/file/d/${doc.driveFileId}/preview`;
    }
    return null;
  }

  /**
   * Public URL to view the file directly on Google Drive in a new tab.
   */
  public getViewUrl(doc: DocumentItem): string {
    if (isValidGoogleDriveId(doc.driveFileId)) {
      return doc.driveUrl && doc.driveUrl.startsWith('https://drive.google.com')
        ? doc.driveUrl
        : `https://drive.google.com/file/d/${doc.driveFileId}/view`;
    }
    return doc.driveUrl || '#';
  }

  /**
   * Public/Direct download URL (works for ALL users without requiring Google login).
   */
  public getPublicDownloadUrl(doc: DocumentItem): string {
    const cached = getCachedFileUrl(doc.id, doc.rawFileData || '');
    if (cached) return cached;
    if (isValidGoogleDriveId(doc.driveFileId)) {
      return `https://drive.google.com/uc?export=download&id=${doc.driveFileId}`;
    }
    return doc.driveUrl || '';
  }

  /**
   * Download document for ANY Hospital OS user (does NOT require Google login).
   * If user is already authenticated with Google & no local cache exists, streams clean Blob via Drive API;
   * otherwise triggers direct public Drive download link or local blob download.
   */
  public async downloadDocument(doc: DocumentItem): Promise<{ started: boolean; method: 'cache' | 'drive_api' | 'public_link' | 'metadata_fallback' }> {
    const cached = getCachedFileUrl(doc.id, doc.rawFileData || '');
    if (cached) {
      const a = document.createElement('a');
      a.href = cached;
      a.download = doc.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return { started: true, method: 'cache' };
    }

    if (isValidGoogleDriveId(doc.driveFileId)) {
      // If Google OAuth session is active, fetch authenticated blob for exact filename download
      if (cachedAccessToken) {
        try {
          const res = await this.driveFetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.driveFileId)}?alt=media&supportsAllDrives=true`
          );
          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.title;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            return { started: true, method: 'drive_api' };
          }
        } catch {
          // Fall through to public Drive download link (no login required)
        }
      }

      const publicUrl = `https://drive.google.com/uc?export=download&id=${doc.driveFileId}`;
      const a = document.createElement('a');
      a.href = publicUrl;
      a.download = doc.title;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return { started: true, method: 'public_link' };
    }

    // Legacy sample document without real Drive file or uploaded file blob
    if (doc.driveUrl && doc.driveUrl !== '#' && !doc.driveUrl.includes('1Demo_') && !doc.driveUrl.includes('1Drive_')) {
      const a = document.createElement('a');
      a.href = doc.driveUrl;
      a.download = doc.title;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return { started: true, method: 'public_link' };
    }

    // Generate clean informational summary sheet for legacy sample record so download never fails silently
    const content = [
      `BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG - KHOA CẬN LÂM SÀNG`,
      `Tài liệu: ${doc.title}`,
      `Mã hồ sơ: ${doc.code || doc.id}`,
      `Loại tài liệu: ${doc.docType}`,
      `Phiên bản: ${doc.version}`,
      `Người phụ trách: ${doc.owner}`,
      `Ngày cập nhật: ${doc.uploadDate}`,
      `Ghi chú: ${doc.note || 'Hồ sơ mẫu hệ thống CLS WorkHub (chưa có tệp nhị phân đính kèm trên Google Drive).'}`
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/\.[^/.]+$/, '')}_thong_tin.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { started: true, method: 'metadata_fallback' };
  }
}

export const googleDriveService = new GoogleDriveService();
