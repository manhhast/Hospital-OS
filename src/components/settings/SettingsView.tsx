import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, RefreshCw, Key, Folder, Database, Mail, Shield, AlertTriangle, 
  FileSpreadsheet, Link, Sun, Moon, Monitor, Palette, CheckCircle2, Trash2, 
  PlayCircle, Layers, Building2, UserCheck, Stethoscope, Calendar, Lock,
  Cloud, CloudOff, UploadCloud, DownloadCloud, LogOut,
  Bot, Send, Check
} from 'lucide-react';
import { AppSettings } from '../../types/hospital';
import { TelegramBotStatus } from '../../types/aiEcosystem';
import { storageService } from '../../services/storageService';
import { aiService } from '../../services/aiService';
import { postgresSyncService, type PostgresSyncState } from '../../services/postgresSyncService';
import { googleDriveService, type GoogleDriveAuthState } from '../../services/googleDriveService';
import { GoogleSignInButton } from '../common/GoogleSignInButton';
import {
  DEFAULT_REPORT_YEAR,
  getKnownReportYears,
  getReportSheetConfigForYear,
  isValidReportYear,
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR
} from '../../services/reportArchiveService';

interface SettingsViewProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onConfirmAction: (title: string, message: string, onConfirm: () => void, isDanger?: boolean) => void;
  themeMode?: 'light' | 'dark' | 'system';
  onChangeThemeMode?: (mode: 'light' | 'dark' | 'system') => void;
  onNavigateConfigTab?: (tab: 'telegram') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onShowToast,
  onConfirmAction,
  themeMode = 'system',
  onChangeThemeMode,
  onNavigateConfigTab
}) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const s = storageService.getSettings();
    const initialYear = s.reportSheetYear || DEFAULT_REPORT_YEAR;
    const legacyUrl = s.googleSheetUrl || localStorage.getItem('google_sheet_url') || '';
    const legacyId = s.reportGoogleSheetId || '';
    const existingMap = { ...(s.reportGoogleSheetsByYear || {}) };

    if (!existingMap[String(initialYear)] && (legacyUrl || legacyId)) {
      existingMap[String(initialYear)] = {
        url: legacyUrl,
        sheetId: legacyId
      };
    }

    return {
      ...s,
      reportSheetYear: initialYear,
      googleSheetUrl: legacyUrl,
      reportGoogleSheetsByYear: existingMap
    };
  });

  const [selectedSheetYear, setSelectedSheetYear] = useState<number>(() => {
    return settings.reportSheetYear || DEFAULT_REPORT_YEAR;
  });
  const [yearInputText, setYearInputText] = useState<string>(() => {
    return String(settings.reportSheetYear || DEFAULT_REPORT_YEAR);
  });

  // PostgreSQL & Google Drive OAuth State
  const [pgState, setPgState] = useState<PostgresSyncState>(() => postgresSyncService.getState());
  const [driveAuth, setDriveAuth] = useState<GoogleDriveAuthState>(() => googleDriveService.getState());
  const [isPgBusy, setIsPgBusy] = useState(false);

  // Telegram Q&A Bot Status Summary
  const [telegramStatus, setTelegramStatus] = useState<TelegramBotStatus | null>(null);
  const [, setStorageTick] = useState(0);

  useEffect(() => {
    const unsubDrive = googleDriveService.subscribe(() => {
      setDriveAuth(googleDriveService.getState());
    });
    const unsubPg = postgresSyncService.subscribe(() => {
      setPgState(postgresSyncService.getState());
    });
    const unsubStorage = storageService.subscribe(() => {
      setStorageTick((prev) => prev + 1);
      if (storageService.getIsApplyingRemote()) {
        const remoteSettings = storageService.getSettings();
        const remoteYear = remoteSettings.reportSheetYear || DEFAULT_REPORT_YEAR;
        setSettings((prev) => ({
          ...prev,
          ...remoteSettings,
          reportSheetYear: remoteYear
        }));
        setSelectedSheetYear(remoteYear);
        setYearInputText(String(remoteYear));
      }
    });
    void aiService.getTelegramBotStatus().then((st) => setTelegramStatus(st)).catch(() => {});
    const curPg = postgresSyncService.getState();
    if (!curPg.configured || !curPg.connected || !curPg.authenticated) {
      void postgresSyncService.refreshServerStatus();
    }
    return () => {
      unsubDrive();
      unsubPg();
      unsubStorage();
    };
  }, []);

  const handleDriveSignIn = async () => {
    const res = await googleDriveService.signInWithGoogle();
    if (res.success) {
      onShowToast(
        'Kết nối Google Drive thành công',
        `Đã đăng nhập tài khoản ${res.email || 'Google'}. Bạn có thể tải lên và xóa hồ sơ trên Google Drive.`,
        'success'
      );
    } else if (res.message) {
      onShowToast('Chưa hoàn tất đăng nhập Google', res.message, 'warning');
    }
  };

  const handleDriveSignOut = async () => {
    await googleDriveService.signOutGoogle();
    onShowToast(
      'Đã ngắt kết nối Google Drive',
      'Hệ thống chuyển về chế độ Chỉ Xem & Tải về công khai.',
      'info'
    );
  };

  const handlePgPushAll = async () => {
    setIsPgBusy(true);
    try {
      const res = await postgresSyncService.syncAllLocalToServer();
      onShowToast(
        'Đồng bộ lên PostgreSQL thành công',
        `Đã lưu ${res.bucketsPushed} phân hệ dữ liệu và ${res.reportMonthsPushed} bảng báo cáo tháng lên PostgreSQL.`,
        'success'
      );
    } catch (err) {
      onShowToast('Lỗi đồng bộ PostgreSQL', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsPgBusy(false);
    }
  };

  const handlePgPullAll = async () => {
    setIsPgBusy(true);
    try {
      const res = await postgresSyncService.pullAllServerToLocal();
      setSettings(storageService.getSettings());
      onShowToast(
        'Tải dữ liệu PostgreSQL hoàn tất',
        `Đã tải ${res.bucketsPulled} phân hệ và ${res.reportMonthsPulled} bảng báo cáo tháng từ máy chủ PostgreSQL về máy.`,
        'success'
      );
    } catch (err) {
      onShowToast('Lỗi tải dữ liệu PostgreSQL', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsPgBusy(false);
    }
  };

  const handlePgRefreshStatus = async () => {
    setIsPgBusy(true);
    try {
      const next = await postgresSyncService.refreshServerStatus();
      if (next.configured && next.connected && next.authenticated) {
        onShowToast(
          'PostgreSQL đang hoạt động',
          `Đã kết nối máy chủ PostgreSQL (${next.serverBucketCount} phân hệ dữ liệu).`,
          'success'
        );
      } else if (next.configured && next.connected && !next.authenticated) {
        onShowToast(
          'Máy chủ PostgreSQL đã sẵn sàng',
          'Vui lòng đăng xuất và đăng nhập lại để kích hoạt phiên đồng bộ hai chiều.',
          'info'
        );
      } else if (next.status === 'error') {
        onShowToast(
          'Chưa kết nối được máy chủ',
          next.errorMessage || 'Không thể kiểm tra trạng thái PostgreSQL lúc này.',
          'warning'
        );
      } else {
        onShowToast(
          'Chưa phát hiện biến môi trường',
          'Máy chủ hiện chưa nhận biến EXTERNAL_DATABASE_URL. Nếu vừa thêm Secrets, hãy khởi động lại ứng dụng.',
          'warning'
        );
      }
    } finally {
      setIsPgBusy(false);
    }
  };

  // Helper functions for auto-extracting & bi-directional matching between URL and ID
  const extractIdFromUrlOrText = (input: string): string => {
    if (!input) return '';
    const sheetMatch = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (sheetMatch && sheetMatch[1]) return sheetMatch[1];
    
    const driveFolderMatch = input.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (driveFolderMatch && driveFolderMatch[1]) return driveFolderMatch[1];

    if (!input.includes('/') && !input.includes('http')) {
      return input.trim();
    }
    return input.trim();
  };

  const buildSpreadsheetUrlFromId = (idOrUrl: string): string => {
    const clean = idOrUrl.trim();
    if (!clean) return '';
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    return `https://docs.google.com/spreadsheets/d/${clean}/edit?usp=sharing`;
  };

  const currentYearConfig = getReportSheetConfigForYear(settings, selectedSheetYear);
  const quickSelectableYears = getKnownReportYears(settings, [selectedSheetYear]);

  const handleSelectReportYear = (nextYear: number) => {
    const clamped = Math.max(MIN_REPORT_YEAR, Math.min(MAX_REPORT_YEAR, Math.round(nextYear)));
    setSelectedSheetYear(clamped);
    setYearInputText(String(clamped));
    const nextCfg = getReportSheetConfigForYear(settings, clamped);
    setSettings((prev) => ({
      ...prev,
      reportSheetYear: clamped,
      googleSheetUrl: nextCfg.url,
      reportGoogleSheetId: nextCfg.sheetId
    }));
  };

  const handleYearInputChange = (rawVal: string) => {
    const digitsOnly = rawVal.replace(/[^0-9]/g, '').slice(0, 4);
    setYearInputText(digitsOnly);
    if (digitsOnly.length === 4) {
      const parsed = parseInt(digitsOnly, 10);
      if (isValidReportYear(parsed)) {
        handleSelectReportYear(parsed);
      }
    }
  };

  const commitYearInput = () => {
    const parsed = parseInt(yearInputText, 10);
    if (isValidReportYear(parsed)) {
      handleSelectReportYear(parsed);
    } else {
      setYearInputText(String(selectedSheetYear));
    }
  };

  const updateActiveYearSheetConfig = (newUrl: string, newSheetId: string) => {
    const yearKey = String(selectedSheetYear);
    setSettings((prev) => ({
      ...prev,
      reportSheetYear: selectedSheetYear,
      googleSheetUrl: newUrl,
      reportGoogleSheetId: newSheetId,
      reportGoogleSheetsByYear: {
        ...(prev.reportGoogleSheetsByYear || {}),
        [yearKey]: {
          url: newUrl,
          sheetId: newSheetId,
          updatedAt: new Date().toISOString()
        }
      }
    }));
  };

  const handleReportUrlChange = (val: string) => {
    if (val.startsWith('http://') || val.startsWith('https://') || val.includes('/d/')) {
      const extractedId = extractIdFromUrlOrText(val);
      updateActiveYearSheetConfig(val, extractedId);
    } else {
      const cleanId = val.trim();
      const generatedUrl = buildSpreadsheetUrlFromId(cleanId);
      updateActiveYearSheetConfig(generatedUrl, cleanId);
    }
  };

  const handleReportIdChange = (val: string) => {
    if (val.startsWith('http://') || val.startsWith('https://') || val.includes('/d/')) {
      const extractedId = extractIdFromUrlOrText(val);
      updateActiveYearSheetConfig(val, extractedId);
    } else {
      const cleanId = val.trim();
      const generatedUrl = buildSpreadsheetUrlFromId(cleanId);
      updateActiveYearSheetConfig(generatedUrl, cleanId);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const yearKey = String(selectedSheetYear);
    const cfg = getReportSheetConfigForYear(settings, selectedSheetYear);
    const normalizedSettings: AppSettings = {
      ...settings,
      reportSheetYear: selectedSheetYear,
      googleSheetUrl: cfg.url,
      reportGoogleSheetId: cfg.sheetId,
      reportGoogleSheetsByYear: {
        ...(settings.reportGoogleSheetsByYear || {}),
        [yearKey]: {
          url: cfg.url,
          sheetId: cfg.sheetId,
          updatedAt: new Date().toISOString()
        }
      }
    };
    setSettings(normalizedSettings);
    storageService.saveSettings(normalizedSettings);
    if (cfg.url) {
      localStorage.setItem('google_sheet_url', cfg.url);
    }
    void aiService.syncContextNow().then(() =>
      aiService.getTelegramBotStatus().then((st) => setTelegramStatus(st)).catch(() => {})
    );
    onShowToast(
      'Cấu hình đã lưu',
      `Đã lưu cấu hình Google Sheet Báo cáo cho năm ${selectedSheetYear} và các tham số hệ thống thành công.`,
      'success'
    );
  };

  const usersCount = storageService.getUsers().length;
  const tasksCount = storageService.getTasks().length;
  const equipmentCount = storageService.getEquipment().length;
  const docsCount = storageService.getDocuments().length;
  const isCleanProduction = tasksCount === 0 && equipmentCount === 0;

  const handlePurgeTrialData = () => {
    onConfirmAction(
      'Kích hoạt Chế độ Vận hành Thực tế (Xóa sạch dữ liệu mẫu)',
      'CẢNH BÁO: Thao tác này sẽ xóa sạch 100% dữ liệu dùng thử (công việc, văn bản, lịch trực, máy móc mẫu). Hệ thống sẽ đưa về trạng thái sạch sẵn sàng cho khoa vận hành thực tế với tài khoản Quản trị: admin@hospital.vn (mật khẩu: admin). Bạn có chắc chắn muốn thực hiện?',
      () => {
        storageService.purgeAllTrialData();
        setSettings(storageService.getSettings());
        onShowToast('Đã chuyển sang Chế độ Thực tế', 'Toàn bộ dữ liệu dùng thử đã được loại bỏ hoàn toàn. Hệ thống sẵn sàng vận hành.', 'success');
      },
      true
    );
  };

  const handleLoadSampleData = () => {
    onConfirmAction(
      'Nạp lại dữ liệu dùng thử (Demo / Đào tạo)',
      'Thao tác này sẽ nạp lại bộ dữ liệu mẫu ban đầu để bạn thử nghiệm tính năng hoặc hướng dẫn sử dụng cho nhân sự khoa. Bạn có chắc chắn không?',
      () => {
        storageService.loadSampleDemoData();
        setSettings(storageService.getSettings());
        onShowToast('Đã nạp dữ liệu mẫu', 'Bộ dữ liệu minh họa đã được khôi phục thành công.', 'info');
      },
      false
    );
  };

  const handleResetDatabase = () => {
    handlePurgeTrialData();
  };

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-200 w-full">
      <form onSubmit={handleSave} className="space-y-4">
        {/* THEME SELECTOR CARD */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100 flex items-center">
              <Palette className="w-4 h-4 text-[#1976D2] dark:text-blue-400 mr-2" /> 
              Chủ Đề Giao Diện &amp; Trải Nghiệm Visual UI
            </h3>
            <span className="text-[11px] font-bold px-2.5 py-0.5 bg-[#EAF4FF] text-[#155A9C] dark:bg-blue-950 dark:text-blue-300 rounded-md border border-[#1976D2]/25">
              Đồng bộ hệ thống
            </span>
          </div>

          <p className="text-xs text-[#718096] dark:text-slate-400">
            Tùy chỉnh phong cách giao diện hiển thị cho toàn bộ ứng dụng Bệnh viện. Hỗ trợ tự động chuyển đổi theo hệ điều hành.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Light Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('light')}
              className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                themeMode === 'light'
                  ? 'border-[#1976D2] bg-[#EAF4FF]/60 dark:bg-blue-950/20 ring-1 ring-[#1976D2]/30'
                  : 'border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2]/50 dark:hover:border-slate-700 bg-[#F4F7FB] dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                  <Sun className="w-4 h-4" />
                </div>
                {themeMode === 'light' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-[#1976D2] text-white rounded">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className="text-xs font-bold text-[#263445] dark:text-slate-200">Giao diện Sáng</div>
                <p className="text-[11px] text-[#718096] dark:text-slate-400 mt-0.5">Tone nền sáng chuẩn HIS, thích hợp ban ngày &amp; phòng khám nhiều ánh sáng</p>
              </div>
            </button>

            {/* Dark Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('dark')}
              className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                themeMode === 'dark'
                  ? 'border-[#1976D2] bg-[#EAF4FF]/60 dark:bg-blue-950/20 ring-1 ring-[#1976D2]/30'
                  : 'border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2]/50 dark:hover:border-slate-700 bg-[#F4F7FB] dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-slate-900 text-blue-400 dark:bg-slate-950 dark:text-blue-400 border border-slate-700">
                  <Moon className="w-4 h-4" />
                </div>
                {themeMode === 'dark' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-[#1976D2] text-white rounded">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className="text-xs font-bold text-[#263445] dark:text-slate-200">Giao diện Tối</div>
                <p className="text-[11px] text-[#718096] dark:text-slate-400 mt-0.5">Dịu mắt, bảo vệ thị lực ca trực đêm &amp; phòng chẩn đoán hình ảnh tối</p>
              </div>
            </button>

            {/* System Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('system')}
              className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                themeMode === 'system'
                  ? 'border-[#1976D2] bg-[#EAF4FF]/60 dark:bg-blue-950/20 ring-1 ring-[#1976D2]/30'
                  : 'border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2]/50 dark:hover:border-slate-700 bg-[#F4F7FB] dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-[#EAF4FF] text-[#1976D2] dark:bg-blue-950 dark:text-blue-400">
                  <Monitor className="w-4 h-4" />
                </div>
                {themeMode === 'system' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-[#1976D2] text-white rounded">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className="text-xs font-bold text-[#263445] dark:text-slate-200">Theo Hệ Thống</div>
                <p className="text-[11px] text-[#718096] dark:text-slate-400 mt-0.5">Tự động đồng bộ với chế độ Sáng/Tối của hệ điều hành thiết bị</p>
              </div>
            </button>
          </div>
        </div>

        {/* EXTERNAL POSTGRESQL DATABASE SYNC CARD (LIVE AUTO-SYNC) */}
        {(() => {
          const isAdminUser = storageService.getCurrentUser()?.role === 'Admin';
          const isSyncingOrPending =
            pgState.status === 'syncing' ||
            pgState.status === 'checking' ||
            pgState.pendingChangesCount > 0;
          const isSyncedLive = pgState.status === 'synced' && !isSyncingOrPending;
          const isNeedsLogin = pgState.configured && pgState.connected && pgState.status === 'needs_login';
          const isConnectionError = pgState.status === 'error';

          return (
            <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-emerald-900/50 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100 flex items-center">
                  <Database className="w-4 h-4 text-emerald-600 mr-2 shrink-0" />
                  Đồng Bộ Live PostgreSQL (Tự Động Hai Chiều)
                </h3>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border ${
                      isSyncingOrPending
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300/60'
                        : isSyncedLive
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300/60'
                        : isNeedsLogin
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300/60'
                        : isConnectionError || pgState.configured
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300/60'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300/60'
                    }`}
                  >
                    {isSyncedLive && pgState.liveStreamConnected && (
                      <span className="relative inline-flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                      </span>
                    )}
                    {isSyncingOrPending
                      ? 'Đang tự động đồng bộ...'
                      : isSyncedLive && pgState.liveStreamConnected
                      ? 'Đồng bộ Live (SSE) · Tức thì'
                      : isSyncedLive
                      ? 'Tự động đồng bộ · Đang bật'
                      : isNeedsLogin
                      ? 'Cần đăng nhập lại để đồng bộ'
                      : isConnectionError
                      ? pgState.configured
                        ? 'Lỗi kết nối PostgreSQL'
                        : 'Lỗi kết nối máy chủ'
                      : 'Chưa cấu hình biến môi trường'}
                  </span>
                  <button
                    type="button"
                    disabled={isPgBusy}
                    onClick={() => void handlePgRefreshStatus()}
                    title="Kiểm tra lại kết nối máy chủ PostgreSQL"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isPgBusy ? 'animate-spin' : ''}`} />
                    <span>Kiểm tra lại</span>
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Hệ thống đồng bộ trực tiếp với máy chủ <strong className="text-slate-800 dark:text-slate-200">PostgreSQL</strong> chỉ bằng <strong className="text-emerald-700 dark:text-emerald-400">tài khoản đăng nhập nội bộ của ứng dụng</strong> mà không cần đăng nhập Google.
              </p>

              {pgState.configured ? (
                <>
                  {/* Live Auto-Sync Active or Needs Re-Login Banner */}
                  {isNeedsLogin ? (
                    <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex items-start gap-2.5 text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-bold text-amber-900 dark:text-amber-200">
                          Máy chủ PostgreSQL đã kết nối, nhưng phiên làm việc hiện tại chưa xác thực với PostgreSQL
                        </div>
                        <p className="text-[11.5px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                          Có thể bạn đã đăng nhập khi máy chủ đang khởi động lại. Vui lòng đăng xuất và đăng nhập lại bằng tài khoản nội bộ để bật đồng bộ hai chiều.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="font-bold text-emerald-900 dark:text-emerald-200">
                            Chế độ Live Sync đang chạy ngầm — Không cần nhấn nút đồng bộ
                          </div>
                          <p className="text-[11.5px] text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                            Mọi thao tác thêm/sửa/xóa được tự động đẩy lên PostgreSQL sau ~0,25 giây và phát tức thì tới các tab/thiết bị khác qua kênh SSE (tự thử lại khi rớt mạng &amp; tự xả hàng đợi khi đóng tab).
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-1 text-[11px] pl-6 sm:pl-0">
                        <span
                          className={`font-bold ${
                            pgState.liveStreamConnected
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {pgState.liveStreamConnected
                            ? 'Kênh Live (SSE): Đang nối'
                            : 'Kênh Live (SSE): Đang nối lại...'}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                          Chờ đồng bộ: <strong>{pgState.pendingChangesCount}</strong> mục
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Trạng thái máy chủ</div>
                      <div className="font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                        {pgState.connected ? 'Đã nối máy chủ PostgreSQL' : 'Mất kết nối'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Phân hệ &amp; Báo cáo</div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
                        {pgState.syncedBucketsCount || pgState.serverBucketCount} phân hệ · {pgState.syncedReportMonthsCount || pgState.serverReportArchiveCount} tháng
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Đồng bộ gần nhất</div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
                        {pgState.lastSyncedAt || '--:--'}
                      </div>
                    </div>
                  </div>

                  {pgState.errorMessage && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                      {pgState.errorMessage}
                    </div>
                  )}

                  {/* Demoted Maintenance / Backup Manual Controls */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Công cụ đồng bộ thủ công (chỉ dùng khi khởi tạo lần đầu hoặc khôi phục dữ liệu):
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        disabled={isPgBusy || !pgState.authenticated || !isAdminUser}
                        onClick={() => void handlePgPushAll()}
                        title={
                          !isAdminUser
                            ? 'Chỉ tài khoản Admin mới có quyền ghi đè toàn bộ dữ liệu lên PostgreSQL'
                            : 'Đẩy toàn bộ dữ liệu hiện tại trên máy lên PostgreSQL'
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Khởi tạo / Ghi đè lên PostgreSQL</span>
                      </button>
                      <button
                        type="button"
                        disabled={isPgBusy || !pgState.authenticated}
                        onClick={() => void handlePgPullAll()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <DownloadCloud className="w-3.5 h-3.5 text-blue-600" />
                        <span>Tải lại từ PostgreSQL</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : isConnectionError ? (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs space-y-2 text-rose-800 dark:text-rose-200">
                  <div className="font-bold">
                    Không thể liên lạc với máy chủ ứng dụng để kiểm tra trạng thái PostgreSQL
                  </div>
                  <p className="text-[11.5px] leading-relaxed">
                    {pgState.errorMessage || 'Máy chủ có thể đang khởi động lại hoặc kết nối mạng tạm thời gián đoạn. Hãy nhấn "Kiểm tra lại" sau vài giây.'}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-2 text-slate-700 dark:text-slate-300">
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Cách kích hoạt trong 2 phút (hiện tại hệ thống đang lưu trữ an toàn cục bộ bằng IndexedDB &amp; LocalStorage):
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[11.5px] leading-relaxed">
                    <li>Tạo 1 dự án PostgreSQL miễn phí trên <strong>Neon</strong> (<span className="font-mono">neon.tech</span>) hoặc <strong>Supabase</strong> (<span className="font-mono">supabase.com</span>) và sao chép chuỗi kết nối (Connection String dạng <span className="font-mono">postgresql://...</span>).</li>
                    <li>Thêm biến môi trường tên <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono font-bold">EXTERNAL_DATABASE_URL</code> vào mục <strong>Secrets</strong> / cấu hình môi trường của hệ thống.</li>
                    <li>Khởi động lại ứng dụng: chế độ đồng bộ PostgreSQL không cần Google Login sẽ tự động được kích hoạt và tự tạo bảng dữ liệu.</li>
                  </ol>
                </div>
              )}
            </div>
          );
        })()}

        {/* SHEET 1: GOOGLE SHEET BÁO CÁO SỐ CA */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-emerald-900/50 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100 flex items-center">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 mr-2 shrink-0" /> 
              1. Google Sheets Báo Cáo &amp; Thống Kê Số Ca
            </h3>
            <span className="text-[11px] font-bold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded-md border border-emerald-200 tabular-nums">
              Lấy dữ liệu số ca · Năm {selectedSheetYear}
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Trang tính Google Sheets này dùng riêng để <strong className="text-slate-700 dark:text-slate-200">đọc dữ liệu giao ban số ca thực tế theo từng năm</strong> cho menu <strong className="text-slate-700 dark:text-slate-200">"Báo cáo &amp; Thống kê"</strong>. Hệ thống hỗ trợ đồng bộ tất cả 12 tháng (tên tab dạng <strong>Tháng 1</strong>..<strong>Tháng 12</strong>, <strong>Tháng 11/{selectedSheetYear}</strong>, <strong>T11</strong>, <strong>11/{selectedSheetYear}</strong>).
          </p>

          {/* Year Selector (Direct Numeric Entry + Dynamic Configured Chips) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
            <div className="md:col-span-5">
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                Nhập Năm Áp Dụng Google Sheet (tùy ý):
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectReportYear(selectedSheetYear - 1)}
                  disabled={selectedSheetYear <= MIN_REPORT_YEAR}
                  className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  title="Năm trước"
                >
                  −
                </button>
                <input
                  type="number"
                  min={MIN_REPORT_YEAR}
                  max={MAX_REPORT_YEAR}
                  step={1}
                  value={yearInputText}
                  onChange={(e) => handleYearInputChange(e.target.value)}
                  onBlur={commitYearInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitYearInput();
                    }
                  }}
                  placeholder="VD: 2026"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl font-black text-center text-sm text-emerald-700 dark:text-emerald-300 outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => handleSelectReportYear(selectedSheetYear + 1)}
                  disabled={selectedSheetYear >= MAX_REPORT_YEAR}
                  className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  title="Năm sau"
                >
                  +
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Nhập trực tiếp bất kỳ năm nào (vd: 2022, 2026, 2035...) hoặc chọn nhanh bên cạnh.
              </p>
            </div>

            <div className="md:col-span-7 space-y-1.5">
              <span className="block font-semibold text-slate-600 dark:text-slate-300">
                Chọn nhanh năm đã cấu hình nguồn dữ liệu:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {quickSelectableYears.map((y) => {
                  const cfg = getReportSheetConfigForYear(settings, y);
                  const hasId = Boolean(cfg.sheetId);
                  const isActiveYear = y === selectedSheetYear;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => handleSelectReportYear(y)}
                      className={`px-2.5 py-1 rounded-lg font-bold tabular-nums transition-colors cursor-pointer border ${
                        isActiveYear
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : hasId
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                          : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {y}
                      {hasId && !isActiveYear ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                <Link className="w-3.5 h-3.5 text-emerald-600" />
                Đường dẫn Google Sheets Năm {selectedSheetYear} (URL Báo cáo số ca giao ban Khoa CLS):
              </label>
              <input
                type="text"
                value={currentYearConfig.url}
                onChange={(e) => handleReportUrlChange(e.target.value)}
                placeholder={`https://docs.google.com/spreadsheets/d/... (Nguồn năm ${selectedSheetYear})`}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Dán URL hoặc ID trang tính Báo cáo số ca của năm <strong>{selectedSheetYear}</strong> (Tự động khớp ô ID bên dưới).
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Google Sheet ID Báo Cáo Năm {selectedSheetYear} (Trích xuất tự động):
              </label>
              <input
                type="text"
                value={currentYearConfig.sheetId}
                onChange={(e) => handleReportIdChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-emerald-700 dark:text-emerald-400 font-bold"
                placeholder={`Nhập ID hoặc dán URL Google Sheet năm ${selectedSheetYear}`}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Chỉ cần nhập ID hoặc dán URL vào đây, ô URL ở trên sẽ tự động tạo khớp tương ứng cho năm {selectedSheetYear}.
              </p>
            </div>
          </div>

          {/* Immutable Archive Guarantee Banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-800 dark:text-slate-100">Lưu cố định trên Hệ thống &amp; Rà soát theo khoảng thời gian:</strong> Mọi dữ liệu kéo từ Google Sheet sẽ được lưu trữ cố định vào cơ sở dữ liệu hệ thống (<strong>PostgreSQL</strong> / bộ nhớ cục bộ IndexedDB &amp; LocalStorage). Nếu xóa hoặc sửa file Google Sheet, dữ liệu đã lưu vẫn được bảo toàn; khi cần đối chiếu, hãy nhấn <strong>Rà soát số liệu</strong> theo khoảng thời gian tùy chọn để kiểm tra sai lệch và tự quyết định có cập nhật lại hay không.
            </div>
          </div>
        </div>

        {/* SHEET 2: GOOGLE SHEET LƯU ID TỆP TẢI LÊN & CHỈ MỤC HỆ THỐNG */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-blue-900/50 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100 flex items-center">
              <Database className="w-4 h-4 text-[#1976D2] mr-2" /> 
              2. Google Sheets Cơ Sở Dữ Liệu Lưu ID Tệp Tải Lên
            </h3>
            <span className="text-[11px] font-bold px-2.5 py-0.5 bg-[#EAF4FF] text-[#155A9C] dark:bg-blue-950 dark:text-blue-300 rounded-md border border-[#1976D2]/25">
              Lưu chỉ mục tệp &amp; Hồ sơ
            </span>
          </div>

          <p className="text-xs text-[#718096] dark:text-slate-400">
            Trang tính Google Sheets này hoạt động như một <strong className="text-[#263445] dark:text-slate-200">Cơ sở dữ liệu Chỉ mục (File Index Database)</strong> để lưu trữ ID tệp PDF/Docx tải lên Google Drive, danh mục tài liệu SOP, liên kết chia sẻ và dữ liệu sao lưu của hệ thống.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">
                Google Sheet Database ID (Lưu chỉ mục ID tệp tải lên):
              </label>
              <input
                type="text"
                value={settings.googleSheetId}
                onChange={(e) => {
                  const val = e.target.value;
                  const cleanId = extractIdFromUrlOrText(val);
                  setSettings({ ...settings, googleSheetId: cleanId });
                }}
                className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-mono text-[#155A9C] dark:text-blue-400 font-bold"
                placeholder="Ví dụ: 1Spreadsheet_DB_CLS_WorkHub_Key"
              />
              <p className="text-[11px] text-[#718096] mt-1">Mã ID hoặc URL trang tính lưu bảng chỉ mục tệp (tự động lọc lấy ID sạch).</p>
            </div>

            <div>
              <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Tên Bảng Tính / CSDL Tệp Mặc Định:</label>
              <input
                type="text"
                value={settings.googleSheetName || 'CLS_WorkHub_FileIndex_Database'}
                onChange={(e) => setSettings({ ...settings, googleSheetName: e.target.value })}
                className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-mono"
              />
              <p className="text-[11px] text-[#718096] mt-1">Tên tab/trang tính lưu thông tin tệp.</p>
            </div>
          </div>
        </div>

        {/* Google Drive & Quick Link to Dedicated Telegram Bot Config */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100 flex items-center">
              <Key className="w-4 h-4 text-[#1976D2] mr-2" /> 3. Kết nối Google Drive &amp; Bot Telegram
            </h3>
          </div>

          <div className="text-xs space-y-4">
            <div className="p-4 rounded-xl bg-[#EAF4FF]/60 dark:bg-blue-950/30 border border-[#1976D2]/20 dark:border-blue-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-2">
                  <span>Tài khoản Google Drive (Tải lên &amp; Xóa tài liệu)</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border inline-flex items-center gap-1 ${
                      driveAuth.isSignedIn && driveAuth.hasAccessToken
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {driveAuth.isSignedIn && driveAuth.hasAccessToken ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Đã kết nối ({driveAuth.userEmail})</span>
                      </>
                    ) : (
                      <span>Chế độ Chỉ Xem &amp; Tải về</span>
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Mọi người đều có thể xem trước và tải về tài liệu. Để tải tài liệu mới lên hoặc xóa tệp trên Google Drive, vui lòng đăng nhập tài khoản Google.
                </p>
                {driveAuth.errorMessage && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-1">
                    {driveAuth.errorMessage}
                  </p>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {driveAuth.isSignedIn && driveAuth.hasAccessToken ? (
                  <button
                    type="button"
                    onClick={() => void handleDriveSignOut()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Đăng xuất Google</span>
                  </button>
                ) : (
                  <GoogleSignInButton
                    onClick={() => void handleDriveSignIn()}
                    loading={driveAuth.isSigningIn}
                    label="Đăng nhập Google Drive"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Google Drive Folder ID (Lưu trữ Hồ sơ SOP / Văn bản)
              </label>
              <input
                type="text"
                value={settings.googleDriveFolderId}
                onChange={(e) => {
                  const cleanFolderId = extractIdFromUrlOrText(e.target.value);
                  setSettings({ ...settings, googleDriveFolderId: cleanFolderId });
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100"
                placeholder="Nhập Folder ID hoặc dán liên kết Google Drive Folder"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Dán ID hoặc URL thư mục Google Drive (tự động trích xuất Folder ID). Để trống hoặc mặc định sẽ lưu ở thư mục gốc Google Drive của tài khoản đăng nhập.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Bot className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-2">
                    <span>Cài Đặt Telegram Bot Hỏi Đáp AI &amp; Cảnh Báo</span>
                    {telegramStatus && (
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                          telegramStatus.pollingActive &&
                          telegramStatus.enabled &&
                          !telegramStatus.conflictDetected &&
                          !telegramStatus.pausedByUser
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                            : telegramStatus.conflictDetected
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                            : telegramStatus.configured
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {telegramStatus.pollingActive &&
                        telegramStatus.enabled &&
                        !telegramStatus.conflictDetected &&
                        !telegramStatus.pausedByUser
                          ? `Đang hoạt động${telegramStatus.botUsername ? ` (@${telegramStatus.botUsername})` : ''}`
                          : telegramStatus.conflictDetected
                          ? 'Xung đột Token (409)'
                          : telegramStatus.reconnecting || telegramStatus.startingPolling
                          ? 'Đang kết nối...'
                          : telegramStatus.standbyMode
                          ? 'Đang nhường Polling'
                          : telegramStatus.pausedByUser
                          ? 'Đang tạm dừng'
                          : telegramStatus.configured
                          ? 'Đã nhập Token'
                          : 'Chưa cấu hình'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Cấu hình Bot Token, dò Chat ID tự động và chỉnh sửa giờ báo tự động cố định (07:00 · 12:45 · 17:00) tại tab chuyên biệt.
                  </p>
                </div>
              </div>

              {onNavigateConfigTab && (
                <button
                  type="button"
                  onClick={() => onNavigateConfigTab('telegram')}
                  className="px-3.5 py-2 rounded-lg bg-[#1976D2] hover:bg-[#155A9C] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Mở Cài Đặt Telegram Bot</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Performance & Execution */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100 flex items-center">
            <Database className="w-4 h-4 text-emerald-600 mr-2" /> Tối ưu Hiệu năng &amp; CacheService / LockService
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Cache TTL (Phút)</label>
              <input
                type="number"
                value={settings.cacheTtlMinutes}
                onChange={(e) => setSettings({ ...settings, cacheTtlMinutes: parseInt(e.target.value) || 10 })}
                className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Lock Timeout (Mili giây)</label>
              <input
                type="number"
                value={settings.lockTimeoutMs}
                onChange={(e) => setSettings({ ...settings, lockTimeoutMs: parseInt(e.target.value) || 30000 })}
                className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.debugMode}
                  onChange={(e) => setSettings({ ...settings, debugMode: e.target.checked })}
                  className="rounded border-[#DFE7F0] text-[#1976D2] focus:ring-[#1976D2]"
                />
                <span className="font-bold text-[#263445] dark:text-slate-200">Bật Chế độ Debug Mode</span>
              </label>
            </div>
          </div>
        </div>

        {/* PRODUCTION READINESS & DATA CLEANUP CARD */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-emerald-600/40 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DFE7F0] dark:border-slate-800 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#263445] dark:text-slate-100 flex items-center gap-2">
                  <span>Trạng Thái Vận Hành Bệnh Viện Thực Tế</span>
                  {isCleanProduction ? (
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-md inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sẵn sàng thực tế (Clean State)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-md inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" /> Đang chứa dữ liệu mẫu
                    </span>
                  )}
                </h3>
                <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">
                  Quản lý dọn sạch dữ liệu dùng thử để chuyển giao cho Khoa Cận Lâm Sàng vận hành chính thức
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSampleData}
                className="px-3 py-1.5 text-xs font-semibold text-[#263445] dark:text-slate-300 bg-[#F4F7FB] dark:bg-slate-800 hover:bg-[#EAF4FF] dark:hover:bg-slate-700 border border-[#DFE7F0] dark:border-slate-700 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="Nạp lại bộ dữ liệu mẫu để thử nghiệm tính năng hoặc đào tạo nhân sự"
              >
                <PlayCircle className="w-3.5 h-3.5 text-[#1976D2]" />
                <span>Nạp dữ liệu mẫu</span>
              </button>

              <button
                type="button"
                onClick={handlePurgeTrialData}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="Xóa toàn bộ dữ liệu dùng thử"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Làm sạch dữ liệu (Áp dụng thực tế)</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics of current database state */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-[#F4F7FB] dark:bg-slate-800/60 border border-[#DFE7F0] dark:border-slate-800">
              <div className="text-[11px] text-[#718096] dark:text-slate-400 font-medium flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-[#1976D2]" /> Tài khoản nhân sự
              </div>
              <div className="text-lg font-bold text-[#263445] dark:text-slate-100 mt-1 tabular-nums">
                {usersCount} <span className="text-xs font-normal text-[#718096]">người</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F7FB] dark:bg-slate-800/60 border border-[#DFE7F0] dark:border-slate-800">
              <div className="text-[11px] text-[#718096] dark:text-slate-400 font-medium flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5 text-[#1976D2]" /> Máy móc &amp; Thiết bị
              </div>
              <div className="text-lg font-bold text-[#263445] dark:text-slate-100 mt-1 tabular-nums">
                {equipmentCount} <span className="text-xs font-normal text-[#718096]">thiết bị</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F7FB] dark:bg-slate-800/60 border border-[#DFE7F0] dark:border-slate-800">
              <div className="text-[11px] text-[#718096] dark:text-slate-400 font-medium flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-600" /> Nhiệm vụ &amp; Công việc
              </div>
              <div className="text-lg font-bold text-[#263445] dark:text-slate-100 mt-1 tabular-nums">
                {tasksCount} <span className="text-xs font-normal text-[#718096]">công việc</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F7FB] dark:bg-slate-800/60 border border-[#DFE7F0] dark:border-slate-800">
              <div className="text-[11px] text-[#718096] dark:text-slate-400 font-medium flex items-center gap-1">
                <Folder className="w-3.5 h-3.5 text-emerald-600" /> Văn bản &amp; Chứng chỉ
              </div>
              <div className="text-lg font-bold text-[#263445] dark:text-slate-100 mt-1 tabular-nums">
                {docsCount} <span className="text-xs font-normal text-[#718096]">tài liệu</span>
              </div>
            </div>
          </div>

          {/* Quick Start Checklist for Production */}
          <div className="p-3.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 text-xs text-[#263445] dark:text-slate-300 space-y-2">
            <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              <span>Các bước khởi tạo dữ liệu thực tế cho Bệnh viện:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[#718096] dark:text-slate-400 text-[11.5px] leading-relaxed">
              <li>
                <strong>Tài khoản Quản trị:</strong> Đăng nhập bằng email <code className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 font-mono text-emerald-900 dark:text-emerald-200">admin@hospital.vn</code> (mật khẩu: <code className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 font-mono text-emerald-900 dark:text-emerald-200">admin</code>). Bạn có thể đổi mật khẩu bất kỳ lúc nào qua menu tài khoản ở góc trên.
              </li>
              <li>
                <strong>Nhân sự khoa:</strong> Vào mục <em>Quản lý Nhân sự</em> để thêm danh sách Bác sĩ, Kỹ thuật viên thật của khoa.
              </li>
              <li>
                <strong>Thiết bị cận lâm sàng:</strong> Vào mục <em>Thiết bị &amp; Máy móc</em> để thêm máy hoặc dùng tính năng <em>Nhập từ file Excel</em> để nạp danh mục máy toàn viện nhanh chóng.
              </li>
              <li>
                <strong>Phân ca trực:</strong> Vào mục <em>Lịch trực &amp; Phân công</em> để tạo lịch ca trực và phân bổ phòng máy tuần mới.
              </li>
              <li>
                <strong>Báo cáo số ca:</strong> Dán đường dẫn Google Sheet thật của bệnh viện vào ô bên trên để liên kết số liệu trực tiếp.
              </li>
            </ul>
          </div>
        </div>

        {/* Save & Reset Buttons */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleResetDatabase}
            className="flex items-center space-x-2 px-4 py-2 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-900/50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Làm sạch về Chế độ Thực tế</span>
          </button>

          <button
            type="submit"
            className="flex items-center space-x-2 px-5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white font-semibold rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Lưu cấu hình hệ thống</span>
          </button>
        </div>
      </form>
    </div>
  );
};
