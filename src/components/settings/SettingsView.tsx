import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, RefreshCw, Key, Folder, Database, Mail, Shield, AlertTriangle, 
  FileSpreadsheet, Link, Sun, Moon, Monitor, Palette, CheckCircle2, Trash2, 
  PlayCircle, Layers, Building2, UserCheck, Stethoscope, Calendar, Lock,
  Cloud, CloudOff, UploadCloud, DownloadCloud, UserPlus, LogOut, Copy, ExternalLink,
  Bot, Send
} from 'lucide-react';
import { AppSettings, UserRole } from '../../types/hospital';
import { TelegramBotStatus } from '../../types/aiEcosystem';
import { storageService } from '../../services/storageService';
import { aiService } from '../../services/aiService';
import { firebaseSyncService, type FirebaseCloudState } from '../../services/firebaseSyncService';
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
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onShowToast,
  onConfirmAction,
  themeMode = 'system',
  onChangeThemeMode
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

  // Firebase Cloud Firestore State
  const [cloudState, setCloudState] = useState<FirebaseCloudState>(() => firebaseSyncService.getState());
  const [isCloudBusy, setIsCloudBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('Staff');

  // Telegram Q&A Bot State
  const [telegramStatus, setTelegramStatus] = useState<TelegramBotStatus | null>(null);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);

  useEffect(() => {
    const unsub = firebaseSyncService.subscribe(() => {
      setCloudState(firebaseSyncService.getState());
    });
    void aiService.getTelegramBotStatus().then((st) => setTelegramStatus(st)).catch(() => {});
    return () => unsub();
  }, []);

  const handleTestTelegramBot = async () => {
    const token = (settings.telegramBotToken || '').trim();
    if (!token) {
      onShowToast('Thiếu Bot Token', 'Vui lòng nhập Telegram Bot Token trước khi kiểm tra kết nối.', 'warning');
      return;
    }
    setIsTestingTelegram(true);
    try {
      const normalizedSettings: AppSettings = {
        ...settings,
        telegramQaEnabled: settings.telegramQaEnabled !== false
      };
      storageService.saveSettings(normalizedSettings);
      setSettings(normalizedSettings);
      await aiService.syncContextNow();
      const res = await aiService.testTelegramBot({
        botToken: token,
        defaultChatId: (settings.defaultTelegramChatId || '').trim(),
        enabled: settings.telegramQaEnabled !== false
      });
      if (res.status) {
        setTelegramStatus(res.status);
      }
      const botLabel = res.botUsername ? `@${res.botUsername}` : (res.botFirstName || 'Telegram Bot');
      const extraMsg = res.messageSent
        ? ' Đã gửi tin nhắn chào xác nhận vào Default Chat ID và kích hoạt trực hỏi đáp.'
        : ' Đã kích hoạt Bot trực hỏi đáp tự động.';
      onShowToast(
        `Kết nối ${botLabel} thành công`,
        `Bot đã sẵn sàng tiếp nhận và trả lời câu hỏi từ dữ liệu Khoa CLS.${extraMsg}`,
        'success'
      );
    } catch (err) {
      onShowToast('Lỗi Telegram Bot', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleCopyHostname = async (hostnameToCopy: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(hostnameToCopy);
        onShowToast('Đã sao chép tên miền', `Đã copy "${hostnameToCopy}" để dán vào Firebase Console.`, 'success');
      } else {
        onShowToast('Tên miền triển khai', `Vui lòng sao chép thủ công: ${hostnameToCopy}`, 'info');
      }
    } catch {
      onShowToast('Tên miền triển khai', `Vui lòng sao chép thủ công: ${hostnameToCopy}`, 'info');
    }
  };

  const handleFirebaseSignIn = async () => {
    setIsCloudBusy(true);
    try {
      const res = await firebaseSyncService.signInWithGoogle();
      onShowToast(
        res.success ? 'Kết nối Firebase thành công' : 'Kết nối Firebase',
        res.message,
        res.success ? 'success' : 'warning'
      );
    } finally {
      setIsCloudBusy(false);
    }
  };

  const handleFirebasePushAll = async () => {
    setIsCloudBusy(true);
    try {
      const res = await firebaseSyncService.syncAllLocalToCloud();
      onShowToast(
        'Đồng bộ lên Firebase thành công',
        `Đã lưu ${res.bucketsPushed} phân hệ dữ liệu và ${res.reportMonthsPushed} bảng báo cáo tháng lên Cloud Firestore.`,
        'success'
      );
    } catch (err) {
      onShowToast('Lỗi đồng bộ Firebase', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsCloudBusy(false);
    }
  };

  const handleFirebasePullAll = async () => {
    setIsCloudBusy(true);
    try {
      const res = await firebaseSyncService.pullAllCloudToLocal();
      setSettings(storageService.getSettings());
      onShowToast(
        'Tải dữ liệu Firebase hoàn tất',
        `Đã tải ${res.bucketsPulled} phân hệ và ${res.reportMonthsPulled} bảng báo cáo tháng từ Cloud Firestore về máy.`,
        'success'
      );
    } catch (err) {
      onShowToast('Lỗi tải dữ liệu Firebase', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsCloudBusy(false);
    }
  };

  const handleInviteCloudMember = async () => {
    if (!inviteEmail.trim()) {
      onShowToast('Thiếu email', 'Vui lòng nhập Gmail đồng nghiệp cần cấp quyền đồng bộ Firebase.', 'warning');
      return;
    }
    setIsCloudBusy(true);
    try {
      const res = await firebaseSyncService.inviteCloudMember(inviteEmail, inviteRole);
      onShowToast(res.success ? 'Đã cấp quyền' : 'Lỗi cấp quyền', res.message, res.success ? 'success' : 'error');
      if (res.success) setInviteEmail('');
    } catch (err) {
      onShowToast('Lỗi cấp quyền Firebase', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsCloudBusy(false);
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
    <div className="space-y-6 pb-12 animate-in fade-in duration-200 max-w-4xl">
      <form onSubmit={handleSave} className="space-y-6">
        {/* THEME SELECTOR CARD */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-2" /> 
              Chủ Đề Giao Diện & Trải Nghiệm Visual UI
            </h3>
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-full border border-indigo-300/60">
              Đồng bộ hệ thống
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tùy chỉnh phong cách giao diện hiển thị cho toàn bộ ứng dụng Bệnh viện. Hỗ trợ tự động chuyển đổi theo hệ điều hành.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Light Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('light')}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                themeMode === 'light'
                  ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                  <Sun className="w-5 h-5" />
                </div>
                {themeMode === 'light' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-600 text-white rounded-md">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Giao diện Sáng</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Tone nền sáng rạng rỡ, thích hợp ban ngày & phòng khám nhiều ánh sáng</p>
              </div>
            </button>

            {/* Dark Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('dark')}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                themeMode === 'dark'
                  ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-slate-900 text-indigo-400 dark:bg-slate-950 dark:text-indigo-400 border border-slate-700">
                  <Moon className="w-5 h-5" />
                </div>
                {themeMode === 'dark' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-600 text-white rounded-md">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Giao diện Tối</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Dịu mắt, bảo vệ thị lực ca trực đêm & phòng chẩn đoán hình ảnh tối</p>
              </div>
            </button>

            {/* System Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('system')}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                themeMode === 'system'
                  ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Monitor className="w-5 h-5" />
                </div>
                {themeMode === 'system' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-600 text-white rounded-md">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Theo Hệ Thống</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Tự động đồng bộ với chế độ Sáng/Tối của hệ điều hành thiết bị</p>
              </div>
            </button>
          </div>
        </div>

        {/* HYBRID CLOUD STORAGE: FIREBASE CLOUD FIRESTORE + GOOGLE DRIVE */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-amber-200/80 dark:border-amber-900/50 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <Cloud className="w-5 h-5 text-amber-500 mr-2 shrink-0" />
              Lưu Trữ Đám Mây Firebase Cloud Firestore &amp; Google Drive
            </h3>
            <span
              className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                cloudState.status === 'synced'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300/60'
                  : cloudState.status === 'syncing' || cloudState.status === 'connecting'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300/60'
                  : cloudState.status === 'unauthorized' || cloudState.status === 'error'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300/60'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300/60'
              }`}
            >
              {cloudState.status === 'synced'
                ? 'Đã kết nối · Đồng bộ Real-time'
                : cloudState.status === 'syncing' || cloudState.status === 'connecting'
                ? 'Đang đồng bộ dữ liệu...'
                : cloudState.status === 'unauthorized'
                ? 'Chờ Admin cấp quyền'
                : cloudState.status === 'error'
                ? 'Lỗi kết nối Cloud'
                : 'Chưa kết nối Google Cloud'}
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Kiến trúc lưu trữ kết hợp: <strong className="text-slate-800 dark:text-slate-200">Toàn bộ dữ liệu vận hành</strong> (công việc, lịch trực, thiết bị, nhân sự, phòng ban, báo cáo số ca theo năm) được lưu &amp; đồng bộ tức thời qua <strong className="text-amber-600 dark:text-amber-400">Firebase Cloud Firestore</strong>; riêng <strong className="text-blue-600 dark:text-blue-400">tệp gốc Hồ sơ, Quy trình SOP &amp; Văn bản ISO</strong> vẫn lưu trữ an toàn trên <strong className="text-blue-600 dark:text-blue-400">Google Drive</strong> (Folder ID cấu hình ở mục 3 bên dưới).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Tài khoản Firebase</div>
              <div className="font-bold text-slate-800 dark:text-slate-100 mt-1 truncate">
                {cloudState.userEmail || 'Chưa đăng nhập'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Workspace Khoa</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-100 mt-1 truncate">
                {cloudState.workspaceId}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Phân hệ &amp; Báo cáo</div>
              <div className="font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                {cloudState.syncedBucketsCount} phân hệ · {cloudState.syncedReportMonthsCount} tháng
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Đồng bộ gần nhất</div>
              <div className="font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
                {cloudState.lastSyncedAt || '--:--'}
              </div>
            </div>
          </div>

          {cloudState.errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 space-y-2.5">
              <div className="font-semibold leading-relaxed">{cloudState.errorMessage}</div>

              {cloudState.unauthorizedDomain && (
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-rose-200/80 dark:border-rose-800/70 space-y-2 text-slate-700 dark:text-slate-200">
                  <div className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 shrink-0" />
                    <span>Hướng dẫn mở khóa tên miền trên Firebase Console (chỉ làm 1 lần):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                    <li>
                      Mở trang{' '}
                      <a
                        href={`https://console.firebase.google.com/project/${cloudState.projectId}/authentication/settings`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <span>Firebase Console &rarr; Authentication &rarr; Settings</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                    <li>
                      Chọn mục <strong>Authorized domains</strong> &rarr; nhấn nút <strong>Add domain</strong>.
                    </li>
                    <li>Dán chính xác tên miền bên dưới rồi nhấn <strong>Add</strong>, sau đó quay lại bấm đăng nhập Google:</li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <code className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-slate-100">
                      {cloudState.unauthorizedDomain}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopyHostname(cloudState.unauthorizedDomain!)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Sao chép tên miền</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {cloudState.status === 'disconnected' || cloudState.status === 'unverified' ? (
              <button
                type="button"
                disabled={isCloudBusy}
                onClick={() => void handleFirebaseSignIn()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Cloud className="w-4 h-4" />
                <span>Đăng nhập Google để Đồng bộ Firebase</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isCloudBusy || cloudState.status === 'unauthorized'}
                  onClick={() => void handleFirebasePushAll()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Đẩy toàn bộ dữ liệu lên Firebase</span>
                </button>
                <button
                  type="button"
                  disabled={isCloudBusy || cloudState.status === 'unauthorized'}
                  onClick={() => void handleFirebasePullAll()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>Tải từ Firebase về máy</span>
                </button>
                <button
                  type="button"
                  disabled={isCloudBusy}
                  onClick={() => void firebaseSyncService.signOut()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Ngắt kết nối Google</span>
                </button>
              </>
            )}
          </div>

          {/* Admin Collaborator Access Management */}
          {cloudState.isAdmin && cloudState.status === 'synced' && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-blue-600" />
                Cấp quyền Gmail đồng bộ Firebase cho máy tính khác trong khoa
              </div>
              <div className="flex flex-col sm:flex-row gap-2 text-xs">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Nhập Gmail đồng nghiệp (vd: bshung.cls@gmail.com)"
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value="Staff">Nhân viên / KTV (Staff)</option>
                  <option value="Doctor">Bác sĩ (Doctor)</option>
                  <option value="Manager">Trưởng / Phó khoa (Manager)</option>
                  <option value="Admin">Quản trị (Admin)</option>
                </select>
                <button
                  type="button"
                  disabled={isCloudBusy}
                  onClick={() => void handleInviteCloudMember()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shrink-0 cursor-pointer disabled:opacity-60"
                >
                  Cấp quyền
                </button>
              </div>

              {(cloudState.invites.length > 0 || cloudState.members.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                    <div className="font-bold text-slate-700 dark:text-slate-200">
                      Email đã cấp quyền ({cloudState.invites.length})
                    </div>
                    {cloudState.invites.length === 0 ? (
                      <div className="text-slate-400">Chưa có email mời bổ sung.</div>
                    ) : (
                      cloudState.invites.map((inv) => (
                        <div key={inv.inviteId} className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/60 dark:border-slate-700/60 last:border-none">
                          <span className="truncate font-mono text-slate-700 dark:text-slate-200">
                            {inv.email} ({inv.role})
                          </span>
                          <button
                            type="button"
                            onClick={() => void firebaseSyncService.removeCloudInvite(inv.inviteId)}
                            className="text-rose-600 hover:underline font-semibold shrink-0 cursor-pointer"
                          >
                            Xóa
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                    <div className="font-bold text-slate-700 dark:text-slate-200">
                      Thành viên đang đồng bộ ({cloudState.members.length})
                    </div>
                    {cloudState.members.map((m) => (
                      <div key={m.uid} className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/60 dark:border-slate-700/60 last:border-none">
                        <span className="truncate text-slate-700 dark:text-slate-200">
                          {m.displayName} · <span className="font-mono">{m.email}</span> ({m.role})
                        </span>
                        {m.uid !== cloudState.userUid && (
                          <button
                            type="button"
                            onClick={() =>
                              void firebaseSyncService.toggleMemberStatus(
                                m.uid,
                                m.status === 'Active' ? 'Revoked' : 'Active'
                              )
                            }
                            className={`font-semibold shrink-0 cursor-pointer ${
                              m.status === 'Active' ? 'text-rose-600 hover:underline' : 'text-emerald-600 hover:underline'
                            }`}
                          >
                            {m.status === 'Active' ? 'Thu hồi' : 'Khôi phục'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SHEET 1: GOOGLE SHEET BÁO CÁO SỐ CA */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-emerald-200/80 dark:border-emerald-900/50 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 mr-2 shrink-0" /> 
              1. Google Sheets Báo Cáo &amp; Thống Kê Số Ca
            </h3>
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-full border border-emerald-300/60 tabular-nums">
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
              <strong className="text-slate-800 dark:text-slate-100">Lưu cố định trên Firebase &amp; Rà soát theo khoảng thời gian:</strong> Mọi dữ liệu kéo từ Google Sheet sẽ được lưu trữ cố định lên <strong>Firebase Cloud Firestore</strong> (cùng bản dự phòng IndexedDB/LocalStorage). Nếu xóa hoặc sửa file Google Sheet, dữ liệu đã lưu vẫn được bảo toàn; khi cần đối chiếu, hãy nhấn <strong>Rà soát số liệu</strong> theo khoảng thời gian tùy chọn để kiểm tra sai lệch và tự quyết định có cập nhật lại hay không.
            </div>
          </div>
        </div>

        {/* SHEET 2: GOOGLE SHEET LƯU ID TỆP TẢI LÊN & CHỈ MỤC HỆ THỐNG */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-blue-200/80 dark:border-blue-900/50 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <Database className="w-5 h-5 text-blue-600 mr-2" /> 
              2. Google Sheets Cơ Sở Dữ Liệu Lưu ID Tệp Tải Lên
            </h3>
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded-full border border-blue-300/60">
              Lưu chỉ mục tệp & Hồ sơ
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Trang tính Google Sheets này hoạt động như một <strong className="text-slate-700 dark:text-slate-200">Cơ sở dữ liệu Chỉ mục (File Index Database)</strong> để lưu trữ ID tệp PDF/Docx tải lên Google Drive, danh mục tài liệu SOP, liên kết chia sẻ và dữ liệu sao lưu của hệ thống.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
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
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-blue-700 dark:text-blue-400 font-bold"
                placeholder="Ví dụ: 1Spreadsheet_DB_CLS_WorkHub_Key"
              />
              <p className="text-[11px] text-slate-400 mt-1">Mã ID hoặc URL trang tính lưu bảng chỉ mục tệp (tự động lọc lấy ID sạch).</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Tên Bảng Tính / CSDL Tệp Mặc Định:</label>
              <input
                type="text"
                value={settings.googleSheetName || 'CLS_WorkHub_FileIndex_Database'}
                onChange={(e) => setSettings({ ...settings, googleSheetName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">Tên tab/trang tính lưu thông tin tệp.</p>
            </div>
          </div>
        </div>

        {/* Telegram & Drive Config */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <Key className="w-5 h-5 text-blue-600 mr-2" /> Kết nối Google Drive &amp; Telegram Bot Hỏi Đáp AI
            </h3>
            <div className="flex items-center gap-2">
              {telegramStatus && (
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 border ${
                  telegramStatus.pollingActive && telegramStatus.enabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                    : telegramStatus.hasToken
                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}>
                  <Bot className="w-3.5 h-3.5" />
                  {telegramStatus.pollingActive && telegramStatus.enabled
                    ? `Đang trực hỏi đáp${telegramStatus.botUsername ? ` (@${telegramStatus.botUsername})` : ''}`
                    : telegramStatus.hasToken
                    ? 'Đã nhập Token (chờ kích hoạt)'
                    : 'Chưa gắn Bot Token'}
                </span>
              )}
              <button
                type="button"
                onClick={handleTestTelegramBot}
                disabled={isTestingTelegram}
                className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition"
              >
                {isTestingTelegram ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{isTestingTelegram ? 'Đang kiểm tra...' : 'Kiểm tra & Kích hoạt Bot'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Telegram Bot Token</label>
              <input
                type="text"
                value={settings.telegramBotToken}
                onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                placeholder="123456789:ABCdefGHIjklMNOpqrs..."
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Default Telegram Chat ID</label>
              <input
                type="text"
                value={settings.defaultTelegramChatId}
                onChange={(e) => setSettings({ ...settings, defaultTelegramChatId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                placeholder="Ví dụ: -1001234567890 hoặc ID cá nhân"
              />
            </div>

            <div className="md:col-span-2 p-3.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.telegramQaEnabled !== false}
                  onChange={(e) => setSettings({ ...settings, telegramQaEnabled: e.target.checked })}
                  className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-100 block">
                    Bật Trợ lý Ảo AI tự động trả lời câu hỏi trên Telegram
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Chat riêng nhắn trực tiếp câu hỏi; trong nhóm dùng lệnh <code className="font-mono font-bold">/hoi</code>, <code className="font-mono font-bold">/tomtat</code>, <code className="font-mono font-bold">/giaoban</code> hoặc tag <code className="font-mono font-bold">@bot</code>.
                  </span>
                </div>
              </label>

              {telegramStatus && (
                <div className="text-[11px] text-slate-600 dark:text-slate-300 shrink-0 text-right">
                  <div>Đã trả lời: <strong>{telegramStatus.totalQuestionsAnswered || 0}</strong> câu</div>
                  {telegramStatus.lastError && (
                    <div className="text-rose-600 dark:text-rose-400 font-medium max-w-xs truncate" title={telegramStatus.lastError}>
                      Lỗi: {telegramStatus.lastError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Google Drive Folder ID (Lưu trữ Hồ sơ SOP / Văn bản)</label>
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
              <p className="text-[11px] text-slate-400 mt-1">Dán ID hoặc URL thư mục Google Drive (tự động trích xuất Folder ID).</p>
            </div>
          </div>
        </div>

        {/* Performance & Execution */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
            <Database className="w-5 h-5 text-emerald-600 mr-2" /> Tối ưu Hiệu năng & CacheService / LockService
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Cache TTL (Phút)</label>
              <input
                type="number"
                value={settings.cacheTtlMinutes}
                onChange={(e) => setSettings({ ...settings, cacheTtlMinutes: parseInt(e.target.value) || 10 })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Lock Timeout (Mili giây)</label>
              <input
                type="number"
                value={settings.lockTimeoutMs}
                onChange={(e) => setSettings({ ...settings, lockTimeoutMs: parseInt(e.target.value) || 30000 })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.debugMode}
                  onChange={(e) => setSettings({ ...settings, debugMode: e.target.checked })}
                  className="rounded-md border-slate-300"
                />
                <span className="font-bold text-slate-700 dark:text-slate-200">Bật Chế độ Debug Mode</span>
              </label>
            </div>
          </div>
        </div>

        {/* PRODUCTION READINESS & DATA CLEANUP CARD */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border-2 border-emerald-500/30 dark:border-emerald-600/40 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span>Trạng Thái Vận Hành Bệnh Viện Thực Tế</span>
                  {isCleanProduction ? (
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-full inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sẵn sàng thực tế (Clean State)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-full inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" /> Đang chứa dữ liệu mẫu
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Quản lý dọn sạch dữ liệu dùng thử để chuyển giao cho Khoa Cận Lâm Sàng vận hành chính thức
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSampleData}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors inline-flex items-center gap-1.5"
                title="Nạp lại bộ dữ liệu mẫu để thử nghiệm tính năng hoặc đào tạo nhân sự"
              >
                <PlayCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Nạp dữ liệu mẫu</span>
              </button>

              <button
                type="button"
                onClick={handlePurgeTrialData}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5"
                title="Xóa toàn bộ dữ liệu dùng thử"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Làm sạch dữ liệu (Áp dụng thực tế)</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics of current database state */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-blue-600" /> Tài khoản nhân sự
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                {usersCount} <span className="text-xs font-normal text-slate-400">người</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5 text-indigo-600" /> Máy móc & Thiết bị
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                {equipmentCount} <span className="text-xs font-normal text-slate-400">thiết bị</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-600" /> Nhiệm vụ & Công việc
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                {tasksCount} <span className="text-xs font-normal text-slate-400">công việc</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <Folder className="w-3.5 h-3.5 text-emerald-600" /> Văn bản & Chứng chỉ
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                {docsCount} <span className="text-xs font-normal text-slate-400">tài liệu</span>
              </div>
            </div>
          </div>

          {/* Quick Start Checklist for Production */}
          <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-xs text-slate-700 dark:text-slate-300 space-y-2">
            <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              <span>📋</span> Các bước khởi tạo dữ liệu thực tế cho Bệnh viện:
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400 text-[11.5px] leading-relaxed">
              <li>
                <strong>Tài khoản Quản trị:</strong> Đăng nhập bằng email <code className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 font-mono text-emerald-900 dark:text-emerald-200">admin@hospital.vn</code> (mật khẩu: <code className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 font-mono text-emerald-900 dark:text-emerald-200">admin</code>). Bạn có thể đổi mật khẩu bất kỳ lúc nào qua menu tài khoản ở góc trên.
              </li>
              <li>
                <strong>Nhân sự khoa:</strong> Vào mục <em>Quản lý Nhân sự</em> để thêm danh sách Bác sĩ, Kỹ thuật viên thật của khoa.
              </li>
              <li>
                <strong>Thiết bị cận lâm sàng:</strong> Vào mục <em>Thiết bị & Máy móc</em> để thêm máy hoặc dùng tính năng <em>Nhập từ file Excel</em> để nạp danh mục máy toàn viện nhanh chóng.
              </li>
              <li>
                <strong>Phân ca trực:</strong> Vào mục <em>Lịch trực & Phân công</em> để tạo lịch ca trực và phân bổ phòng máy tuần mới.
              </li>
              <li>
                <strong>Báo cáo số ca:</strong> Dán đường dẫn Google Sheet thật của bệnh viện vào ô bên trên để liên kết số liệu trực tiếp.
              </li>
            </ul>
          </div>
        </div>

        {/* Save & Reset Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleResetDatabase}
            className="flex items-center space-x-2 px-4 py-2.5 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100 rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Làm sạch về Chế độ Thực tế</span>
          </button>

          <button
            type="submit"
            className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-md transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Lưu cấu hình hệ thống</span>
          </button>
        </div>
      </form>
    </div>
  );
};
