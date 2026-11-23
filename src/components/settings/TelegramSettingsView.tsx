import React, { useEffect, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  Key,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Terminal,
  AlertTriangle
} from 'lucide-react';
import { AppSettings } from '../../types/hospital';
import { TelegramBotStatus, TelegramExclusivityReport } from '../../types/aiEcosystem';
import { ScheduledAlertsPanel } from '../notifications/ScheduledAlertsPanel';
import { storageService } from '../../services/storageService';
import { aiService } from '../../services/aiService';

interface TelegramSettingsViewProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface DetectedTelegramChat {
  chatId: string;
  title: string;
  type: string;
  username?: string;
  lastSeenAt: string;
}

const BOTFATHER_COMMANDS_TEMPLATE = `tomtat - Tóm tắt nhanh giao ban toàn khoa
giaoban - Báo cáo số ca, thiết bị và lịch trực hôm nay
hoi - Hỏi Trợ lý AI trong nhóm chat
help - Xem hướng dẫn sử dụng trợ lý`;

export const TelegramSettingsView: React.FC<TelegramSettingsViewProps> = ({ onShowToast }) => {
  const [settings, setSettings] = useState<AppSettings>(() => storageService.getSettings());
  const [telegramStatus, setTelegramStatus] = useState<TelegramBotStatus | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetectingChats, setIsDetectingChats] = useState(false);
  const [isSyncingContext, setIsSyncingContext] = useState(false);
  const [isChangingPollState, setIsChangingPollState] = useState(false);
  const [isVerifyingExclusivity, setIsVerifyingExclusivity] = useState(false);
  const [exclusivityReport, setExclusivityReport] = useState<TelegramExclusivityReport | null>(null);
  const [detectedChats, setDetectedChats] = useState<DetectedTelegramChat[]>([]);
  const [detectHint, setDetectHint] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const refreshStatus = async () => {
    const st = await aiService.getTelegramBotStatus();
    if (st) setTelegramStatus(st);
  };

  useEffect(() => {
    void refreshStatus();
    const pollInterval = window.setInterval(() => {
      void refreshStatus();
    }, 5000);
    const unsub = storageService.subscribe(() => {
      setSettings(storageService.getSettings());
    });
    return () => {
      window.clearInterval(pollInterval);
      unsub();
    };
  }, []);

  const handleCopyText = async (text: string, key: string, label: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 2000);
        onShowToast('Đã sao chép', `Đã sao chép ${label} vào bộ nhớ tạm.`, 'success');
      } else {
        onShowToast('Sao chép thủ công', text, 'info');
      }
    } catch {
      onShowToast('Sao chép thủ công', text, 'info');
    }
  };

  const persistTelegramSettings = async (nextSettings: AppSettings) => {
    storageService.saveSettings(nextSettings);
    setSettings(nextSettings);
    await aiService.syncContextNow();
    await refreshStatus();
  };

  const handleSaveTelegramConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const normalized: AppSettings = {
        ...storageService.getSettings(),
        telegramBotToken: (settings.telegramBotToken || '').trim(),
        defaultTelegramChatId: (settings.defaultTelegramChatId || '').trim(),
        telegramQaEnabled: settings.telegramQaEnabled !== false
      };
      await persistTelegramSettings(normalized);
      onShowToast(
        'Đã lưu cấu hình Telegram',
        normalized.telegramBotToken
          ? 'Đã lưu Bot Token, Chat ID và đồng bộ dữ liệu khoa cho Trợ lý Telegram.'
          : 'Đã lưu cấu hình Telegram (chưa gắn Bot Token).',
        'success'
      );
    } catch (err) {
      onShowToast('Lỗi lưu cấu hình', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAndActivateBot = async () => {
    const token = (settings.telegramBotToken || '').trim();
    if (!token) {
      onShowToast(
        'Thiếu Bot Token',
        'Vui lòng tạo Bot qua @BotFather theo hướng dẫn bên dưới và dán HTTP API Token vào ô cấu hình.',
        'warning'
      );
      return;
    }

    setIsTesting(true);
    try {
      const normalized: AppSettings = {
        ...storageService.getSettings(),
        telegramBotToken: token,
        defaultTelegramChatId: (settings.defaultTelegramChatId || '').trim(),
        telegramQaEnabled: settings.telegramQaEnabled !== false
      };
      storageService.saveSettings(normalized);
      setSettings(normalized);

      await aiService.syncContextNow();
      const res = await aiService.testTelegramBot({
        botToken: token,
        defaultChatId: normalized.defaultTelegramChatId,
        enabled: normalized.telegramQaEnabled !== false
      });

      if (res.status) {
        setTelegramStatus(res.status);
      } else {
        await refreshStatus();
      }

      const botLabel = res.botUsername ? `@${res.botUsername}` : (res.botFirstName || 'Telegram Bot');
      const detail = res.messageSent
        ? ' Đã gửi tin nhắn chào xác nhận vào Default Chat ID và tự động nạp menu lệnh.'
        : ' Đã kích hoạt chế độ trực hỏi đáp và tự động nạp menu lệnh cho Bot.';
      onShowToast(`Kết nối ${botLabel} thành công`, `Bot sẵn sàng trả lời từ dữ liệu Khoa CLS.${detail}`, 'success');
    } catch (err) {
      await refreshStatus();
      onShowToast('Không thể kết nối Telegram Bot', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDetectChats = async () => {
    const token = (settings.telegramBotToken || '').trim();
    if (!token) {
      const msg = 'Vui lòng nhập Telegram Bot Token trước khi dò Chat ID.';
      setDetectHint({ type: 'info', message: msg });
      onShowToast('Thiếu Bot Token', msg, 'warning');
      return;
    }

    setIsDetectingChats(true);
    setDetectHint(null);
    try {
      const chats = await aiService.detectTelegramChats(token);
      setDetectedChats(chats);
      if (chats.length === 0) {
        const msg =
          'Chưa tìm thấy tin nhắn nào gửi tới Bot. Hãy mở Bot trên Telegram bấm Start (/start), hoặc thêm Bot vào nhóm rồi nhắn /start@ten_bot và bấm Dò Chat ID tự động lại.';
        setDetectHint({ type: 'info', message: msg });
        onShowToast('Chưa thấy tin nhắn mới', msg, 'info');
      } else {
        onShowToast('Đã tìm thấy Chat ID', `Phát hiện ${chats.length} cuộc trò chuyện gần đây với Bot.`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDetectHint({ type: 'error', message: msg });
      onShowToast('Lỗi dò Chat ID', msg, 'error');
    } finally {
      setIsDetectingChats(false);
    }
  };

  const handleSyncContextNow = async () => {
    setIsSyncingContext(true);
    try {
      const ok = await aiService.syncContextNow();
      await refreshStatus();
      onShowToast(
        ok ? 'Đã đồng bộ dữ liệu cho Bot' : 'Đồng bộ hoàn tất',
        'Dữ liệu số ca, thiết bị, phòng ban, nhân sự và lịch trực mới nhất đã được cập nhật cho Telegram Bot.',
        ok ? 'success' : 'info'
      );
    } finally {
      setIsSyncingContext(false);
    }
  };

  const handlePausePolling = async () => {
    setIsChangingPollState(true);
    try {
      const st = await aiService.pauseTelegramPolling();
      if (st) setTelegramStatus(st);
      onShowToast(
        'Đã tạm dừng Polling tại đây',
        'Máy chủ này đã ngừng gọi getUpdates để nhường kết nối Bot Token cho phiên bản khác hoặc công cụ ngoài.',
        'info'
      );
    } catch (err) {
      onShowToast('Không thể tạm dừng', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsChangingPollState(false);
    }
  };

  const handleRetryPolling = async () => {
    const token = (settings.telegramBotToken || '').trim();
    setIsChangingPollState(true);
    try {
      const st = await aiService.retryTelegramPolling(
        token
          ? {
              botToken: token,
              defaultChatId: (settings.defaultTelegramChatId || '').trim()
            }
          : undefined
      );
      if (st) setTelegramStatus(st);

      window.setTimeout(() => {
        void refreshStatus();
      }, 2800);

      if (st?.conflictDetected) {
        onShowToast(
          'Vẫn còn phiên kết nối khác (409)',
          'Một phiên bản khác vẫn đang giữ Bot Token này. Hãy đóng phiên bản đó trước hoặc bấm Tạm dừng tại đây.',
          'warning'
        );
      } else {
        onShowToast(
          'Đã kết nối lại Bot Telegram',
          'Đã chiếm quyền Polling thành công và đang lắng nghe tin nhắn trên phiên bản này.',
          'success'
        );
      }
    } catch (err) {
      await refreshStatus();
      onShowToast('Không thể kết nối lại', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsChangingPollState(false);
    }
  };

  const handleVerifyExclusivity = async () => {
    const token = (settings.telegramBotToken || '').trim();
    setIsVerifyingExclusivity(true);
    try {
      const { report, status } = await aiService.verifyTelegramExclusivity(token || undefined);
      setExclusivityReport(report);
      if (status) setTelegramStatus(status);
      onShowToast(
        report.isExclusive ? 'Bot đang dùng riêng cho app hiện tại' : 'Phát hiện kết nối khác với Bot',
        report.summary,
        report.isExclusive ? 'success' : 'warning'
      );
    } catch (err) {
      onShowToast(
        'Không thể kiểm tra độc quyền Bot',
        err instanceof Error ? err.message : String(err),
        'error'
      );
    } finally {
      setIsVerifyingExclusivity(false);
    }
  };

  const isConflict = Boolean(telegramStatus?.conflictDetected);
  const isPaused = Boolean(telegramStatus?.pausedByUser);
  const isStandby = Boolean(telegramStatus?.standbyMode);
  const isReconnecting = Boolean(
    !isConflict && !isPaused && !isStandby && (telegramStatus?.reconnecting || telegramStatus?.startingPolling)
  );
  const hasWebhook = Boolean(telegramStatus?.webhookUrl);
  const isBotActive = Boolean(
    telegramStatus?.pollingActive &&
      telegramStatus?.enabled &&
      !isConflict &&
      !isPaused &&
      !isStandby &&
      !isReconnecting &&
      !hasWebhook
  );

  return (
    <div className="space-y-4 pb-8 w-full">
      {/* 1. CONNECTION STATUS & METRICS STRIP */}
      <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#DFE7F0] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#EAF4FF] dark:bg-blue-950/70 border border-[#1976D2]/25 dark:border-blue-800 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-[#1976D2] dark:text-blue-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-[#263445] dark:text-white">
                  Cấu Hình Bot Telegram Riêng Cho Khoa CLS
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold border ${
                    isBotActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                      : isConflict
                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                      : isReconnecting || isStandby || hasWebhook
                      ? 'bg-[#EAF4FF] text-[#155A9C] border-[#1976D2]/30 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                      : telegramStatus?.configured
                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-[#F4F7FB] text-[#718096] border-[#DFE7F0] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}
                >
                  {isBotActive
                    ? `Đang hoạt động${telegramStatus?.botUsername ? ` (@${telegramStatus.botUsername})` : ''}`
                    : isConflict
                    ? 'Xung đột kết nối (409)'
                    : isReconnecting
                    ? 'Đang kết nối / đồng bộ phiên...'
                    : isStandby
                    ? 'Đang nhường quyền Polling'
                    : hasWebhook
                    ? 'Đang chạy qua Webhook'
                    : isPaused
                    ? 'Đã tạm dừng tại đây'
                    : telegramStatus?.configured
                    ? 'Đã gắn Token (chờ kích hoạt / đang tắt)'
                    : 'Chưa cấu hình Bot'}
                </span>
              </div>
              <p className="text-xs text-[#718096] dark:text-slate-400 mt-1">
                Kết nối Bot Telegram riêng của khoa để trả lời hỏi đáp AI từ dữ liệu thật và nhận cảnh báo thiết bị / giao ban tức thời.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleVerifyExclusivity()}
              disabled={isVerifyingExclusivity || isChangingPollState}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${isVerifyingExclusivity ? 'animate-pulse' : ''}`} />
              <span>{isVerifyingExclusivity ? 'Đang kiểm tra...' : 'Kiểm tra độc quyền Bot'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSyncContextNow()}
              disabled={isSyncingContext}
              className="px-3 py-1.5 rounded-lg bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#263445] dark:text-slate-200 border border-[#DFE7F0] dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingContext ? 'animate-spin' : ''}`} />
              <span>Đồng bộ dữ liệu</span>
            </button>
            {isBotActive && (
              <button
                type="button"
                onClick={() => void handlePausePolling()}
                disabled={isChangingPollState}
                className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Tạm dừng</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleTestAndActivateBot()}
              disabled={isTesting}
              className="px-3.5 py-1.5 rounded-lg bg-[#1976D2] hover:bg-[#155A9C] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra & Kích hoạt Bot'}</span>
            </button>
          </div>
        </div>

        {/* Metrics Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#F4F7FB] dark:bg-slate-800/40 divide-y sm:divide-y-0 sm:divide-x divide-[#DFE7F0] dark:divide-slate-800">
          <div className="px-4 py-3">
            <div className="text-[11px] font-medium text-[#718096] dark:text-slate-400">Bot đang liên kết</div>
            <div className="text-sm font-bold text-[#263445] dark:text-white mt-0.5 truncate">
              {telegramStatus?.botUsername ? `@${telegramStatus.botUsername}` : 'Chưa kết nối'}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-medium text-[#718096] dark:text-slate-400">Lắng nghe tin nhắn</div>
            <div
              className={`text-sm font-bold mt-0.5 ${
                isBotActive
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : isConflict
                  ? 'text-rose-700 dark:text-rose-400'
                  : isReconnecting || isStandby || hasWebhook
                  ? 'text-[#1976D2] dark:text-blue-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {isBotActive
                ? 'Đang trực 24/7'
                : isConflict
                ? 'Tạm dừng (Trùng Token 409)'
                : isReconnecting
                ? 'Đang tiếp nhận phiên...'
                : isStandby
                ? 'Dự phòng (Bản khác đang trực)'
                : hasWebhook
                ? 'Webhook trực tuyến'
                : 'Tạm dừng'}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-medium text-[#718096] dark:text-slate-400">Câu hỏi đã trả lời</div>
            <div className="text-sm font-bold text-[#155A9C] dark:text-blue-400 mt-0.5 tabular-nums">
              {telegramStatus?.totalAnswered ?? 0} câu
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-medium text-[#718096] dark:text-slate-400">Dữ liệu ứng dụng</div>
            <div className="text-sm font-bold text-[#263445] dark:text-slate-200 mt-0.5">
              {telegramStatus?.hasLiveContext ? 'Đã đồng bộ dữ liệu thật' : 'Chờ đồng bộ'}
            </div>
          </div>
        </div>

        {isReconnecting && !isConflict && !telegramStatus?.lastError && (
          <div className="px-5 py-3 bg-[#EAF4FF] dark:bg-blue-950/40 border-t border-[#1976D2]/20 dark:border-blue-900/60 flex items-center gap-2.5 text-xs text-[#155A9C] dark:text-blue-200">
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-[#1976D2] dark:text-blue-400" />
            <span>
              {telegramStatus?.reconnectingMessage ||
                'Đang chờ phiên kết nối cũ đóng hoàn toàn để tiếp nhận quyền lắng nghe Bot...'}
            </span>
          </div>
        )}

        {(telegramStatus?.lastError || isConflict) && (
          <div className="px-5 py-4 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-900/60 space-y-2.5 text-xs text-rose-800 dark:text-rose-200">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1">
                <div>
                  <span className="font-bold">Cảnh báo kết nối Telegram: </span>
                  <span>{telegramStatus?.lastError}</span>
                </div>
                {isConflict && (
                  <p className="text-[11px] text-rose-700/90 dark:text-rose-300/90 leading-relaxed">
                    Lưu ý kỹ thuật: Telegram chỉ cho phép <strong>duy nhất 1 máy chủ</strong> nhận tin qua <code className="font-mono">getUpdates</code> cho mỗi Bot Token. Khi cả link Phát triển (Dev) và link Chia sẻ (Shared) cùng chạy với cùng Token, hệ thống sẽ tạm dừng tại đây để tránh lỗi lặp{telegramStatus?.autoRecovering ? ' và tự động thử kết nối lại mỗi 30 giây khi phiên kia đóng' : ''}.
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <button
                type="button"
                onClick={() => void handleRetryPolling()}
                disabled={isChangingPollState}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChangingPollState ? 'animate-spin' : ''}`} />
                <span>Chiếm quyền &amp; Kết nối lại tại đây</span>
              </button>
              <button
                type="button"
                onClick={() => void handlePausePolling()}
                disabled={isChangingPollState}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Tạm dừng Polling tại đây (giữ bản chính chạy)</span>
              </button>
              <button
                type="button"
                onClick={() => void handleVerifyExclusivity()}
                disabled={isVerifyingExclusivity}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isVerifyingExclusivity ? 'Đang dò...' : 'Kiểm tra app ngoài'}</span>
              </button>
            </div>
          </div>
        )}

        {exclusivityReport && (
          <div
            className={`px-5 py-4 border-t text-xs space-y-2 ${
              exclusivityReport.isExclusive
                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {exclusivityReport.isExclusive ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                )}
                <div className="space-y-1">
                  <div className="font-bold">
                    {exclusivityReport.isExclusive
                      ? `Xác nhận: @${exclusivityReport.botUsername || 'Bot'} đang dùng riêng cho ứng dụng hiện tại`
                      : `Cảnh báo: @${exclusivityReport.botUsername || 'Bot'} đang có kết nối khác`}
                  </div>
                  <p className="leading-relaxed opacity-90">{exclusivityReport.summary}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExclusivityReport(null)}
                className="text-[11px] font-semibold opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
              >
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-6 pt-1 text-[11px]">
              <div className="px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-black/5 dark:border-white/10">
                <span className="opacity-70">Webhook ngoài: </span>
                <strong className="font-mono">{exclusivityReport.webhookUrl || 'Không có (Sạch)'}</strong>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-black/5 dark:border-white/10">
                <span className="opacity-70">Phiên getUpdates ngoài: </span>
                <strong>{exclusivityReport.externalListenerDetected ? 'Có phát hiện' : 'Không có'}</strong>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-black/5 dark:border-white/10">
                <span className="opacity-70">Máy chủ giữ quyền: </span>
                <strong className="font-mono">{exclusivityReport.leaseHolderHost || telegramStatus?.instanceHost || 'Hiện tại'}</strong>
              </div>
            </div>
          </div>
        )}

        {!telegramStatus?.lastError && isStandby && (
          <div className="px-5 py-3.5 bg-sky-50 dark:bg-sky-950/40 border-t border-sky-200 dark:border-sky-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-sky-900 dark:text-sky-200">
            <div className="leading-relaxed">
              <span className="font-bold">Chế độ điều phối tự động: </span>
              <span>
                Máy chủ <code className="font-mono font-semibold">{telegramStatus?.standbyHolder || 'phiên bản chính'}</code> đang giữ quyền lắng nghe Bot Token. Phiên bản này tự động tạm nhường để không gây xung đột 409.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleRetryPolling()}
              disabled={isChangingPollState}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Chuyển quyền Polling về đây</span>
            </button>
          </div>
        )}

        {!telegramStatus?.lastError && !isConflict && isPaused && telegramStatus?.configured && (
          <div className="px-5 py-3.5 bg-amber-50/80 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <div>
              <span className="font-bold">Đã tạm dừng Polling tại phiên bản này: </span>
              <span>Bot vẫn có thể hoạt động bình thường trên link chính khác mà không bị trùng Token.</span>
            </div>
            <button
              type="button"
              onClick={() => void handleRetryPolling()}
              disabled={isChangingPollState}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Bật lại lắng nghe tại đây</span>
            </button>
          </div>
        )}
      </section>

      {/* 2. BOT CONFIGURATION FORM */}
      <form
        onSubmit={handleSaveTelegramConfig}
        className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-slate-800 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-[#263445] dark:text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-[#1976D2] dark:text-blue-400" />
            <span>Thông Số Kết Nối Telegram Bot</span>
          </h3>
          <span className="text-[11px] text-[#718096] dark:text-slate-400">
            Mỗi bệnh viện / khoa nên dùng 1 Bot riêng
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Bot Token */}
          <div className="space-y-1.5">
            <label className="block font-bold text-[#263445] dark:text-slate-200">
              Telegram Bot Token <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showToken ? 'text' : 'password'}
                value={settings.telegramBotToken}
                onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                placeholder="1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full pl-3.5 pr-20 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-mono text-[#263445] dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#1976D2]/25 focus:border-[#1976D2]"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowToken(prev => !prev)}
                  title={showToken ? 'Ẩn Bot Token' : 'Hiện Bot Token'}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                {settings.telegramBotToken && (
                  <button
                    type="button"
                    onClick={() => void handleCopyText(settings.telegramBotToken, 'token', 'Bot Token')}
                    title="Sao chép Token"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    {copiedKey === 'token' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Lấy từ <strong>@BotFather</strong> sau khi chạy lệnh <code className="font-mono font-semibold">/newbot</code>. Không chia sẻ Token công khai.
            </p>
          </div>

          {/* Default Chat ID */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="block font-bold text-slate-700 dark:text-slate-200">
                Default Telegram Chat ID (Nhóm / Cá nhân nhận tin)
              </label>
              <button
                type="button"
                onClick={() => void handleDetectChats()}
                disabled={isDetectingChats}
                className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isDetectingChats ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                <span>{isDetectingChats ? 'Đang dò...' : 'Dò Chat ID tự động'}</span>
              </button>
            </div>
            <input
              type="text"
              value={settings.defaultTelegramChatId}
              onChange={(e) => setSettings({ ...settings, defaultTelegramChatId: e.target.value })}
              placeholder="Ví dụ: -1001234567890 (nhóm) hoặc 987654321 (cá nhân)"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Chat ID nhóm giao ban khoa (bắt đầu bằng <code className="font-mono">-100...</code>) hoặc ID cá nhân dùng để kiểm tra kết nối và nhận cảnh báo mặc định.
            </p>
          </div>
        </div>

        {/* Detect hint / error */}
        {detectHint && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              detectHint.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{detectHint.message}</div>
          </div>
        )}

        {/* Auto-detected recent chats */}
        {detectedChats.length > 0 && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <div className="font-bold text-slate-700 dark:text-slate-200">
              Các cuộc trò chuyện vừa tương tác với Bot (chọn 1 chạm để điền Chat ID):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {detectedChats.map((chat) => (
                <div
                  key={chat.chatId}
                  className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {chat.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                      ID: {chat.chatId} · {chat.type === 'private' ? 'Cá nhân' : 'Nhóm'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSettings(prev => ({ ...prev, defaultTelegramChatId: chat.chatId }));
                      onShowToast('Đã chọn Chat ID', `Đã điền Chat ID "${chat.chatId}" (${chat.title}).`, 'info');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    Chọn
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Q&A Toggle */}
        <div className="p-3.5 rounded-lg bg-[#EAF4FF]/60 dark:bg-blue-950/30 border border-[#1976D2]/20 dark:border-blue-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.telegramQaEnabled !== false}
              onChange={(e) => setSettings({ ...settings, telegramQaEnabled: e.target.checked })}
              className="mt-0.5 rounded border-[#DFE7F0] text-[#1976D2] focus:ring-[#1976D2]"
            />
            <div className="text-xs">
              <span className="font-bold text-[#263445] dark:text-white block">
                Bật Trợ lý Ảo AI tự động trả lời câu hỏi trên Telegram
              </span>
              <span className="text-[11px] text-[#718096] dark:text-slate-400 mt-0.5 block leading-relaxed">
                Khi bật, Bot tự động tổng hợp dữ liệu thực tế từ ứng dụng (báo cáo số ca, thiết bị sắp hết hạn, nhân sự nghỉ phép, lịch trực, phòng máy, công việc) để phản hồi ngay trên Telegram.
              </span>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 rounded-lg bg-[#1976D2] hover:bg-[#155A9C] text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình Telegram'}</span>
          </button>
        </div>
      </form>

      {/* 2B. SCHEDULED DAILY TELEGRAM DISPATCHES (EDITABLE TIMES & CHANNELS) */}
      <ScheduledAlertsPanel onShowToast={onShowToast} showHistory={true} />

      {/* 3. SUPPORTED COMMANDS CHEATSHEET */}
      <section className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
          <Terminal className="w-4 h-4 text-[#1976D2] dark:text-blue-400" />
          <h3 className="text-sm font-bold text-[#263445] dark:text-white">
            Các Lệnh &amp; Cách Hỏi Đáp Trên Telegram Sau Khi Kết Nối
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-lg bg-[#F4F7FB] dark:bg-slate-800/60 border border-[#DFE7F0] dark:border-slate-700/80 space-y-1.5">
            <div className="font-bold text-[#263445] dark:text-white flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-[#1976D2]" />
              <span>Chat riêng trực tiếp với Bot (1-1)</span>
            </div>
            <p className="text-[#718096] dark:text-slate-300 leading-relaxed">
              Nhắn bất kỳ câu hỏi tiếng Việt nào, ví dụ: <em>&ldquo;Số ca ngày gần nhất và tổng tháng này?&rdquo;</em>, <em>&ldquo;Máy nào sắp hết hạn bảo trì / kiểm định?&rdquo;</em>, <em>&ldquo;Hôm nay ai trực và ai đang nghỉ phép?&rdquo;</em>.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#F4F7FB] dark:bg-slate-800/60 border border-[#DFE7F0] dark:border-slate-700/80 space-y-1.5">
            <div className="font-bold text-[#263445] dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Trong nhóm chat Telegram của Khoa</span>
            </div>
            <p className="text-[#718096] dark:text-slate-300 leading-relaxed">
              Dùng lệnh <code className="font-mono font-bold text-[#1976D2] dark:text-blue-400">/tomtat</code>,{' '}
              <code className="font-mono font-bold text-[#1976D2] dark:text-blue-400">/giaoban</code>,{' '}
              <code className="font-mono font-bold text-[#1976D2] dark:text-blue-400">/hoi &lt;câu hỏi&gt;</code> hoặc tag{' '}
              <code className="font-mono font-bold text-[#1976D2] dark:text-blue-400">@ten_bot</code> để Bot chỉ trả lời khi được gọi tên.
            </p>
          </div>
        </div>
      </section>

      {/* 4. STEP-BY-STEP GUIDE TO CREATE A NEW TELEGRAM BOT */}
      <section className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-[#DFE7F0] dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h3 className="text-sm font-bold text-[#263445] dark:text-white">
              Hướng Dẫn Tạo Bot Telegram Mới Dùng Riêng Cho Ứng Dụng (6 Bước)
            </h3>
          </div>
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF4FF] hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/25 dark:border-blue-800 text-xs font-bold shrink-0"
          >
            <span>Mở @BotFather trên Telegram</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <ol className="space-y-3.5 text-xs">
          {/* Step 1 */}
          <li className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex gap-3">
            <span className="w-6 h-6 rounded-lg bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 tabular-nums">
              1
            </span>
            <div className="space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Mở công cụ chính thức @BotFather trên Telegram</div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Trên ứng dụng Telegram (điện thoại hoặc máy tính), gõ tìm kiếm <code className="font-mono font-bold text-sky-700 dark:text-sky-300">@BotFather</code> (chọn đúng tài khoản có dấu tích xanh xác thực) và nhấn <strong>Start</strong>.
              </p>
            </div>
          </li>

          {/* Step 2 */}
          <li className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex gap-3">
            <span className="w-6 h-6 rounded-lg bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 tabular-nums">
              2
            </span>
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-900 dark:text-white">Khởi tạo Bot mới bằng lệnh /newbot</div>
                <button
                  type="button"
                  onClick={() => void handleCopyText('/newbot', 'newbot', 'lệnh /newbot')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {copiedKey === 'newbot' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>Copy /newbot</span>
                </button>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>
                  Gửi <code className="font-mono font-bold">/newbot</code> cho @BotFather.
                </li>
                <li>
                  <strong>Đặt tên hiển thị (Name):</strong> Ví dụ <code className="font-mono">Trợ Lý Khoa CLS BV</code>.
                </li>
                <li>
                  <strong>Đặt Username duy nhất:</strong> Bắt buộc viết liền không dấu và <strong>kết thúc bằng chữ <code className="font-mono">bot</code></strong> (ví dụ: <code className="font-mono">cls_workhub_benhvien_bot</code>).
                </li>
              </ul>
            </div>
          </li>

          {/* Step 3 */}
          <li className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex gap-3">
            <span className="w-6 h-6 rounded-lg bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 tabular-nums">
              3
            </span>
            <div className="space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Sao chép HTTP API Token dán vào ứng dụng</div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                @BotFather sẽ trả về thông báo <em>&ldquo;Done! Congratulations on your new bot... Use this token to access the HTTP API:&rdquo;</em> kèm chuỗi dạng{' '}
                <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">7123456789:AAFxxx...</code>. Hãy sao chép chuỗi này và dán vào ô <strong>Telegram Bot Token</strong> ở trên.
              </p>
            </div>
          </li>

          {/* Step 4 */}
          <li className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex gap-3">
            <span className="w-6 h-6 rounded-lg bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 tabular-nums">
              4
            </span>
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-900 dark:text-white">Cài đặt menu lệnh nhanh (Khuyên dùng)</div>
                <button
                  type="button"
                  onClick={() => void handleCopyText(BOTFATHER_COMMANDS_TEMPLATE, 'cmds', 'bộ lệnh BotFather')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {copiedKey === 'cmds' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>Copy bộ lệnh</span>
                </button>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Khi bạn bấm <strong>Kiểm tra &amp; Kích hoạt Bot</strong> ở trên, ứng dụng sẽ tự động đăng ký menu lệnh. Hoặc bạn có thể gửi <code className="font-mono font-bold">/setcommands</code> cho @BotFather và dán bộ lệnh chuẩn:
              </p>
              <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed">
                {BOTFATHER_COMMANDS_TEMPLATE}
              </pre>
            </div>
          </li>

          {/* Step 5 */}
          <li className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex gap-3">
            <span className="w-6 h-6 rounded-lg bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 tabular-nums">
              5
            </span>
            <div className="space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Lấy Chat ID &amp; thêm Bot vào nhóm Giao ban Khoa</div>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>
                  Mở đường dẫn Bot vừa tạo (<code className="font-mono">t.me/&lt;username_bot&gt;</code>) và bấm <strong>Start</strong> (hoặc thêm Bot vào nhóm Telegram của khoa rồi nhắn <code className="font-mono">/start</code>).
                </li>
                <li>
                  Quay lại màn hình này, bấm nút <strong>Dò Chat ID tự động</strong> ở trên để chọn đúng ID cá nhân hoặc ID nhóm (<code className="font-mono">-100...</code>).
                </li>
              </ul>
            </div>
          </li>

          {/* Step 6 */}
          <li className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex gap-3">
            <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 tabular-nums">
              <CheckCircle2 className="w-4 h-4" />
            </span>
            <div className="space-y-1">
              <div className="font-bold text-emerald-900 dark:text-emerald-200">Kích hoạt &amp; kiểm tra trả lời trực tiếp</div>
              <p className="text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                Nhấn <strong>Kiểm tra &amp; Kích hoạt Bot</strong> ở đầu trang. Khi trạng thái chuyển sang <strong>Đang hoạt động</strong>, bạn có thể nhắn tin hỏi Bot ngay trên điện thoại hoặc máy tính và nhận câu trả lời tổng hợp từ dữ liệu thực tế của ứng dụng.
              </p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
};
