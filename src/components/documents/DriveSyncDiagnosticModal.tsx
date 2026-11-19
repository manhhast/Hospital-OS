import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink,
  Copy, Check, ShieldCheck, Cloud, Clock, FileText,
  X, Lock, Activity, Download, Globe, LogOut
} from 'lucide-react';
import { DocumentItem } from '../../types/hospital';
import { storageService } from '../../services/storageService';
import {
  googleDriveService,
  isValidGoogleDriveId,
  type DriveDiagnosticReport,
  type GoogleDriveAuthState
} from '../../services/googleDriveService';
import { GoogleSignInButton } from '../common/GoogleSignInButton';

interface DriveSyncDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentItem[];
  onDocumentsUpdated?: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface DiagnosticStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error';
  latency?: string;
  detail?: string;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || Number.isNaN(bytes)) return 'Chưa xác định';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const DriveSyncDiagnosticModal: React.FC<DriveSyncDiagnosticModalProps> = ({
  isOpen,
  onClose,
  documents,
  onShowToast
}) => {
  const [driveAuth, setDriveAuth] = useState<GoogleDriveAuthState>(() => googleDriveService.getState());
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [diagReport, setDiagReport] = useState<DriveDiagnosticReport | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'diagnostic' | 'file-list'>('diagnostic');

  useEffect(() => {
    return googleDriveService.subscribe(() => {
      setDriveAuth(googleDriveService.getState());
    });
  }, []);

  const settings = storageService.getSettings();
  const configuredFolderId = (settings.googleDriveFolderId || '').trim();
  const hasValidFolder = isValidGoogleDriveId(configuredFolderId);
  const driveFolderUrl = hasValidFolder
    ? `https://drive.google.com/drive/folders/${configuredFolderId}`
    : 'https://drive.google.com/drive/my-drive';

  const realDriveCount = documents.filter((d) => isValidGoogleDriveId(d.driveFileId)).length;

  const runFullDiagnostics = useCallback(async (showResultToast = true) => {
    setIsRunningDiag(true);
    setDiagError(null);
    try {
      const report = await googleDriveService.runDiagnostics(configuredFolderId);
      setDiagReport(report);
      if (showResultToast) {
        onShowToast(
          report.authenticated ? 'Kiểm tra Google Drive thành công' : 'Chế độ Chỉ Xem & Tải về công khai',
          report.detailMessage,
          report.authenticated ? 'success' : 'info'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể kiểm tra kết nối Google Drive.';
      setDiagError(msg);
      if (showResultToast) {
        onShowToast('Lỗi kiểm tra Google Drive', msg, 'error');
      }
    } finally {
      setIsRunningDiag(false);
    }
  }, [configuredFolderId, onShowToast]);

  useEffect(() => {
    if (isOpen) {
      void runFullDiagnostics(false);
    }
  }, [isOpen, driveAuth.hasAccessToken, runFullDiagnostics]);

  const handleGoogleSignIn = async () => {
    const res = await googleDriveService.signInWithGoogle();
    if (res.success) {
      onShowToast(
        'Đã đăng nhập Google',
        `Kết nối thành công tài khoản ${res.email || 'Google'}. Bạn có thể tải lên & xóa tài liệu trên Google Drive.`,
        'success'
      );
      void runFullDiagnostics(false);
    } else if (res.message) {
      onShowToast('Chưa hoàn tất đăng nhập Google', res.message, 'warning');
    }
  };

  const handleGoogleSignOut = async () => {
    await googleDriveService.signOutGoogle();
    onShowToast(
      'Đã đăng xuất tài khoản Google',
      'Hệ thống chuyển về chế độ Chỉ Xem & Tải về công khai.',
      'info'
    );
  };

  const handleCopy = (text: string, fieldKey: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    onShowToast('Đã sao chép', `Đã sao chép ${label} vào bộ nhớ tạm`, 'info');
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!isOpen) return null;

  const totalBytes = documents.reduce((acc, d) => acc + (d.fileSize || 0), 0);
  const formattedTotalSize = formatBytes(totalBytes);
  const hasWriteSession = driveAuth.isSignedIn && driveAuth.hasAccessToken;

  const diagnosticSteps: DiagnosticStep[] = [
    {
      id: 'step-auth',
      name: 'Phân quyền Truy cập Google Drive',
      description: 'Xem trước & tải về mở cho mọi nhân viên; Tải lên & xóa yêu cầu đăng nhập tài khoản Google.',
      status: hasWriteSession ? 'success' : 'warning',
      detail: hasWriteSession
        ? `Đã đăng nhập Google: ${driveAuth.userEmail || 'Đã xác thực'} (Quyền Tải lên, Xem, Tải về & Xóa)`
        : 'Chế độ Chỉ Xem & Tải về công khai (Chưa đăng nhập Google — hãy đăng nhập khi cần Tải lên hoặc Xóa)'
    },
    {
      id: 'step-folder-id',
      name: 'Cấu hình Thư mục Google Drive Khoa',
      description: 'Kiểm tra Google Drive Folder ID lưu hồ sơ trong phần Cài đặt Hệ thống.',
      status: hasValidFolder
        ? diagReport?.folderAccessible === false
          ? 'warning'
          : 'success'
        : 'warning',
      detail: !hasValidFolder
        ? 'Chưa cấu hình Folder ID thật (tệp mới tải lên sẽ lưu vào Drive gốc của tài khoản Google đang đăng nhập).'
        : diagReport?.folderAccessible === true
          ? `Thư mục hợp lệ & truy cập được: "${diagReport.folderName || configuredFolderId}"`
          : diagReport?.folderAccessible === false
            ? `Folder ID "${configuredFolderId}" không tồn tại hoặc tài khoản hiện tại chưa được cấp quyền truy cập.`
            : `Đã cấu hình Folder ID: ${configuredFolderId}`
    },
    {
      id: 'step-gateway',
      name: 'Kết nối Google Drive API v3',
      description: 'Đo phản hồi trực tiếp từ máy chủ drive.googleapis.com.',
      status: isRunningDiag
        ? 'running'
        : diagError
          ? 'error'
          : hasWriteSession && diagReport?.apiReachable
            ? 'success'
            : 'pending',
      latency: hasWriteSession && diagReport?.latencyMs ? `${diagReport.latencyMs} ms` : undefined,
      detail: diagError
        ? diagError
        : hasWriteSession && diagReport?.apiReachable
          ? `Google Drive API v3 phản hồi ổn định (${diagReport.latencyMs} ms).`
          : 'Đăng nhập Google để thực hiện kiểm tra trực tiếp tới Google Drive API v3.'
    },
    {
      id: 'step-quota',
      name: 'Dung lượng Lưu trữ Tài khoản Google Drive',
      description: 'Truy vấn thông số sử dụng thực tế từ Google Drive About API.',
      status: hasWriteSession && diagReport?.storageUsedBytes !== undefined ? 'success' : 'pending',
      detail:
        hasWriteSession && diagReport?.storageUsedBytes !== undefined
          ? diagReport.storageLimitBytes
            ? `Đã dùng ${formatBytes(diagReport.storageUsedBytes)} / ${formatBytes(diagReport.storageLimitBytes)}`
            : `Đã dùng ${formatBytes(diagReport.storageUsedBytes)} (Gói không giới hạn)`
          : 'Thông số dung lượng chỉ hiển thị sau khi đăng nhập tài khoản Google.'
    },
    {
      id: 'step-catalog',
      name: 'Chỉ mục Hồ sơ & Quy trình trên Hệ thống',
      description: 'Thống kê số lượng hồ sơ đã gắn Google Drive File ID thật và hồ sơ mẫu.',
      status: realDriveCount > 0 ? 'success' : 'warning',
      detail: `${realDriveCount}/${documents.length} tài liệu đã lưu trực tiếp trên Google Drive · ${documents.length - realDriveCount} hồ sơ mẫu hệ thống.`
    }
  ];

  const storagePercent =
    diagReport?.storageUsedBytes !== undefined && diagReport?.storageLimitBytes
      ? Math.min(100, Math.round((diagReport.storageUsedBytes / diagReport.storageLimitBytes) * 1000) / 10)
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-emerald-50/40 dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-800 shadow-md border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.25z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                  Trung tâm Kiểm tra Kết nối Google Drive
                </h3>
                {hasWriteSession ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    ĐÃ KẾT NỐI GOOGLE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    <Globe className="w-3 h-3" />
                    CHẾ ĐỘ XEM & TẢI CÔNG KHAI
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Khoa Cận Lâm Sàng - Bệnh viện Sông Thương</span>
                <span>•</span>
                <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                  Folder ID: {hasValidFolder ? configuredFolderId : 'Thư mục gốc Drive'}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* METRICS BAR (REAL DATA ONLY) */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {/* Metric 1: Account Status */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="font-medium text-[11px]">Phiên Google Drive</span>
              <ShieldCheck className={`w-4 h-4 ${hasWriteSession ? 'text-emerald-500' : 'text-amber-500'}`} />
            </div>
            <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100 truncate" title={driveAuth.userEmail || ''}>
              {hasWriteSession ? driveAuth.userEmail || 'Đã đăng nhập' : 'Chưa đăng nhập'}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 block">
              {hasWriteSession ? 'Có quyền Tải lên & Xóa' : 'Chỉ Xem trước & Tải về'}
            </span>
          </div>

          {/* Metric 2: Storage */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="font-medium text-[11px]">Dung lượng Drive</span>
              <HardDrive className="w-4 h-4 text-blue-500" />
            </div>
            <div className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
              {diagReport?.storageUsedBytes !== undefined
                ? formatBytes(diagReport.storageUsedBytes)
                : 'Cần đăng nhập'}
            </div>
            {storagePercent !== null ? (
              <>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${storagePercent}%` }}></div>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                  Giới hạn {formatBytes(diagReport?.storageLimitBytes)} ({storagePercent}%)
                </span>
              </>
            ) : (
              <span className="text-[10px] text-slate-400 mt-1.5 block">
                {hasWriteSession ? 'Đang lấy thông số Drive' : 'Đăng nhập Google để xem'}
              </span>
            )}
          </div>

          {/* Metric 3: API Latency */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="font-medium text-[11px]">Phản hồi Drive API</span>
              <Activity className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
              {hasWriteSession && diagReport?.latencyMs ? `${diagReport.latencyMs} ms` : 'Công khai'}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {hasWriteSession ? 'Drive API v3 (OAuth 2.0)' : 'Link xem & tải trực tiếp'}
            </p>
          </div>

          {/* Metric 4: Tracked Docs */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="font-medium text-[11px]">Tệp trên Google Drive</span>
              <Cloud className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
              {realDriveCount} / {documents.length} <span className="text-[10px] font-normal text-slate-400">hồ sơ</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 block">
              Tổng danh mục: {formattedTotalSize}
            </span>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('diagnostic')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'diagnostic'
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Kiểm tra Kết nối (5 Hạng mục)</span>
            </button>

            <button
              onClick={() => setActiveTab('file-list')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'file-list'
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Danh sách Tài liệu ({documents.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            {hasWriteSession ? (
              <button
                type="button"
                onClick={() => void handleGoogleSignOut()}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất Google</span>
              </button>
            ) : (
              <GoogleSignInButton
                compact
                loading={driveAuth.isSigningIn}
                onClick={() => void handleGoogleSignIn()}
                label="Đăng nhập Google"
              />
            )}

            <button
              onClick={() => void runFullDiagnostics(true)}
              disabled={isRunningDiag}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-blue-200 dark:border-blue-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiag ? 'animate-spin' : ''}`} />
              <span>{isRunningDiag ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</span>
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-5 overflow-y-auto max-h-[54vh] space-y-4">
          {activeTab === 'diagnostic' && (
            <div className="space-y-2.5">
              {diagnosticSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-start justify-between shadow-2xs"
                >
                  <div className="flex items-start space-x-3 min-w-0 pr-3">
                    <div className="mt-0.5 shrink-0">
                      {step.status === 'running' ? (
                        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
                      ) : step.status === 'success' ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : step.status === 'pending' ? (
                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </div>
                      ) : (
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                          Hạng mục {idx + 1}: {step.name}
                        </h5>
                        {step.latency && (
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                            {step.latency}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {step.description}
                      </p>
                      {step.detail && (
                        <div
                          className={`mt-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border inline-flex items-center gap-1.5 ${
                            step.status === 'success'
                              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-900/60'
                              : step.status === 'error'
                                ? 'text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-900/60'
                                : 'text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-900/60'
                          }`}
                        >
                          {step.status === 'success' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                          <span>{step.detail}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      step.status === 'success'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : step.status === 'running'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : step.status === 'error'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {step.status === 'success'
                      ? 'HOẠT ĐỘNG'
                      : step.status === 'running'
                        ? 'ĐANG KIỂM TRA'
                        : step.status === 'error'
                          ? 'LỖI'
                          : 'LƯU Ý'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'file-list' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Danh mục toàn bộ hồ sơ & quy trình chuẩn. Mọi nhân viên đều có thể tải về hoặc mở xem mà không cần đăng nhập Google.
              </p>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">Tài liệu / Mã hồ sơ</th>
                        <th className="p-3">Định dạng</th>
                        <th className="p-3">Google Drive File ID</th>
                        <th className="p-3">Cập nhật</th>
                        <th className="p-3">Nguồn lưu trữ</th>
                        <th className="p-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {documents.map((doc) => {
                        const isRealDrive = isValidGoogleDriveId(doc.driveFileId);
                        return (
                          <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1" title={doc.title}>
                                {doc.title}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {doc.code || doc.id} • {doc.docType}
                              </div>
                            </td>

                            <td className="p-3 whitespace-nowrap">
                              <span className="font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px]">
                                {doc.fileExtension}
                              </span>
                            </td>

                            <td className="p-3 font-mono text-[11px]">
                              <div className="flex items-center space-x-1.5">
                                <span className="truncate max-w-[140px] text-slate-600 dark:text-slate-300">
                                  {isRealDrive ? doc.driveFileId : 'Hồ sơ mẫu'}
                                </span>
                                {isRealDrive && (
                                  <button
                                    onClick={() => handleCopy(doc.driveFileId, `drive-${doc.id}`, 'Drive File ID')}
                                    className="p-1 text-slate-400 hover:text-blue-600"
                                    title="Sao chép Drive File ID"
                                  >
                                    {copiedField === `drive-${doc.id}` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>

                            <td className="p-3 whitespace-nowrap text-slate-500 dark:text-slate-400 text-[11px]">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>{doc.lastSyncedAt || doc.uploadDate}</span>
                              </div>
                            </td>

                            <td className="p-3 whitespace-nowrap">
                              {isRealDrive ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                  Google Drive
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  Mẫu hệ thống
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  type="button"
                                  onClick={() => void googleDriveService.downloadDocument(doc)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg"
                                  title="Tải tệp về máy"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                {isRealDrive && (
                                  <a
                                    href={googleDriveService.getViewUrl(doc)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                                    title="Mở tệp trên Google Drive"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            <span>Tải lên & xóa tài liệu được bảo vệ bằng xác thực OAuth 2.0 Google Drive</span>
          </div>

          <div className="flex items-center space-x-2.5">
            {hasValidFolder && (
              <button
                onClick={() => handleCopy(driveFolderUrl, 'drive-url-folder', 'Liên kết Thư mục Google Drive')}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copiedField === 'drive-url-folder' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Sao chép Link Thư mục</span>
              </button>
            )}

            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Mở trên Google Drive</span>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};
