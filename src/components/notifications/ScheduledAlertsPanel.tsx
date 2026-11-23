import React, { useEffect, useState, useCallback } from 'react';
import {
  Clock,
  Sun,
  BarChart3,
  Sunset,
  Eye,
  Send,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X
} from 'lucide-react';
import type {
  ScheduledAlertChannel,
  ScheduledAlertHistoryItem,
  ScheduledAlertPreviewResult,
  ScheduledAlertRuleConfig,
  ScheduledAlertRuleId
} from '../../types/hospital';
import { aiService } from '../../services/aiService';
import { postgresSyncService } from '../../services/postgresSyncService';
import { REPORT_ARCHIVE_UPDATED_EVENT } from '../../services/reportArchiveService';
import { storageService } from '../../services/storageService';
import { DEFAULT_SCHEDULED_ALERT_RULES } from '../../utils/scheduledAlertDefaults';

interface ScheduledAlertsPanelProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onNotificationsUpdated?: () => void;
  showHistory?: boolean;
}

const RULE_META: Record<
  ScheduledAlertRuleId,
  { icon: React.ReactNode; badgeLabel: string; accentText: string; accentBg: string }
> = {
  morning_0700: {
    icon: <Sun className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
    badgeLabel: 'Buổi sáng',
    accentText: 'text-amber-700 dark:text-amber-300',
    accentBg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
  },
  noon_services_1245: {
    icon: <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />,
    badgeLabel: 'Số liệu KT',
    accentText: 'text-sky-700 dark:text-sky-300',
    accentBg: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800'
  },
  evening_1700: {
    icon: <Sunset className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
    badgeLabel: 'Cuối ngày',
    accentText: 'text-indigo-700 dark:text-indigo-300',
    accentBg: 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800'
  }
};

function parseAndFormatTimeHHmm(raw: string): string | null {
  const clean = String(raw || '').trim();
  const compactMatch = clean.match(/^(\d{2})(\d{2})$/);
  if (compactMatch) {
    const h = parseInt(compactMatch[1], 10);
    const m = parseInt(compactMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }
  const colonMatch = clean.match(/^(\d{1,2})\s*[:hH.]\s*(\d{1,2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }
  return null;
}

export const ScheduledAlertsPanel: React.FC<ScheduledAlertsPanelProps> = ({
  onShowToast,
  onNotificationsUpdated,
  showHistory = true
}) => {
  const [rules, setRules] = useState<ScheduledAlertRuleConfig[]>(() => {
    const saved = storageService.getSettings().scheduledAlertsConfig;
    return Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_SCHEDULED_ALERT_RULES;
  });
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({});
  const [timeErrors, setTimeErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<ScheduledAlertHistoryItem[]>([]);
  const [vnNowText, setVnNowText] = useState<string>('');
  const [telegramConfigured, setTelegramConfigured] = useState<boolean>(false);
  const [defaultChatId, setDefaultChatId] = useState<string>('');
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [isSavingRules, setIsSavingRules] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [busyRuleId, setBusyRuleId] = useState<ScheduledAlertRuleId | null>(null);
  const [busyAction, setBusyAction] = useState<'preview' | 'run' | null>(null);
  const [previewData, setPreviewData] = useState<ScheduledAlertPreviewResult | null>(null);

  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const status = await aiService.getScheduledAlertStatus();
      setRules(status.rules);
      const nextDrafts: Record<string, string> = {};
      status.rules.forEach((r) => {
        nextDrafts[r.id] = r.timeHHmm;
      });
      setTimeDrafts(nextDrafts);
      setTimeErrors({});
      setHistory(status.history);
      setVnNowText(status.vnNow?.dateTimeVN || '');
      setTelegramConfigured(status.telegramConfigured);
      setDefaultChatId(status.defaultChatId || '');
      setHasUnsavedChanges(false);
    } catch {
      // Keep local fallback rules if server status temporarily unavailable
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const updateRule = (id: ScheduledAlertRuleId, patch: Partial<ScheduledAlertRuleConfig>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setHasUnsavedChanges(true);
  };

  const handleTimeInputChange = (id: ScheduledAlertRuleId, nextVal: string) => {
    setTimeDrafts((prev) => ({ ...prev, [id]: nextVal }));
    setHasUnsavedChanges(true);
    const parsed = parseAndFormatTimeHHmm(nextVal);
    if (parsed) {
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, timeHHmm: parsed } : r)));
      setTimeErrors((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  };

  const handleTimeInputBlur = (id: ScheduledAlertRuleId) => {
    const raw = timeDrafts[id] ?? rules.find((r) => r.id === id)?.timeHHmm ?? '';
    const parsed = parseAndFormatTimeHHmm(raw);
    if (!parsed) {
      setTimeErrors((prev) => ({
        ...prev,
        [id]: 'Giờ không hợp lệ (nhập 00:00 – 23:59, VD: 07:15 hoặc 12:45)'
      }));
      return;
    }
    setTimeDrafts((prev) => ({ ...prev, [id]: parsed }));
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, timeHHmm: parsed } : r)));
    setTimeErrors((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleSaveRules = async () => {
    const nextErrors: Record<string, string> = {};
    const validatedRules = rules.map((r) => {
      const raw = timeDrafts[r.id] ?? r.timeHHmm;
      const parsed = parseAndFormatTimeHHmm(raw);
      if (!parsed) {
        nextErrors[r.id] = 'Giờ không hợp lệ (nhập 00:00 – 23:59)';
        return r;
      }
      return { ...r, timeHHmm: parsed };
    });

    if (Object.keys(nextErrors).length > 0) {
      setTimeErrors(nextErrors);
      onShowToast(
        'Giờ báo chưa hợp lệ',
        'Vui lòng nhập đúng định dạng 24 giờ HH:mm (ví dụ 07:00, 12:45, 17:00).',
        'error'
      );
      return;
    }

    setIsSavingRules(true);
    try {
      const saved = await aiService.saveScheduledAlertRules(validatedRules);
      setRules(saved);
      const nextDrafts: Record<string, string> = {};
      saved.forEach((r) => {
        nextDrafts[r.id] = r.timeHHmm;
      });
      setTimeDrafts(nextDrafts);
      setTimeErrors({});
      setHasUnsavedChanges(false);
      onShowToast(
        'Đã lưu lịch cảnh báo cố định',
        `Đã cập nhật giờ phát tự động (UTC+7): ${saved.map((s) => s.timeHHmm).join(' · ')}.`,
        'success'
      );
    } catch (err) {
      onShowToast(
        'Không thể lưu cấu hình',
        err instanceof Error ? err.message : String(err),
        'error'
      );
    } finally {
      setIsSavingRules(false);
    }
  };

  const handlePreview = async (rule: ScheduledAlertRuleConfig) => {
    const parsedTime = parseAndFormatTimeHHmm(timeDrafts[rule.id] ?? rule.timeHHmm) || rule.timeHHmm;
    setBusyRuleId(rule.id);
    setBusyAction('preview');
    try {
      const res = await aiService.previewScheduledAlert({
        ruleId: rule.id,
        equipmentWarningDays: rule.equipmentWarningDays,
        timeHHmmOverride: parsedTime
      });
      setPreviewData(res);
    } catch (err) {
      onShowToast(
        'Không thể tạo bản xem trước',
        err instanceof Error ? err.message : String(err),
        'error'
      );
    } finally {
      setBusyRuleId(null);
      setBusyAction(null);
    }
  };

  const handleRunNow = async (rule: ScheduledAlertRuleConfig) => {
    setBusyRuleId(rule.id);
    setBusyAction('run');
    try {
      const { historyItem, preview } = await aiService.runScheduledAlertNow({
        ruleId: rule.id,
        channelOverride: rule.channel,
        customChatId: rule.customChatId
      });
      setPreviewData(preview);
      setHistory((prev) => [historyItem, ...prev.filter((h) => h.id !== historyItem.id)].slice(0, 60));

      if (
        (rule.channel === 'telegram_and_inapp' || rule.channel === 'inapp') &&
        !historyItem.inAppSaved
      ) {
        storageService.sendNotification({
          recipient: 'Toàn Khoa CLS',
          targetAddress: historyItem.telegramSent ? `Telegram (${defaultChatId}) + In-App` : 'Hệ thống CLS WorkHub',
          title: `[Thủ công ${rule.timeHHmm}] ${preview.title}`,
          content: preview.inAppSummary,
          channel: historyItem.telegramSent ? 'Telegram' : 'In-App',
          status: 'Đã gửi'
        });
      }
      onNotificationsUpdated?.();
      void postgresSyncService.pollChanges().then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(REPORT_ARCHIVE_UPDATED_EVENT, { detail: { fromScheduledAlert: true } }));
        }
      });

      if (historyItem.status === 'success') {
        onShowToast(
          'Đã cập nhật dữ liệu & phát bản tin',
          `${rule.name} đã tự động đồng bộ dữ liệu mới nhất trước khi gửi qua ${historyItem.telegramSent ? 'Telegram' : ''}${
            historyItem.telegramSent && historyItem.inAppSaved ? ' & ' : ''
          }${historyItem.inAppSaved ? 'In-App' : ''}.`,
          'success'
        );
      } else {
        onShowToast(
          'Phát bản tin hoàn tất một phần',
          historyItem.errorMessage || 'Một số kênh chưa được cấu hình đầy đủ.',
          'warning'
        );
      }
    } catch (err) {
      onShowToast(
        'Không thể gửi bản tin ngay',
        err instanceof Error ? err.message : String(err),
        'error'
      );
    } finally {
      setBusyRuleId(null);
      setBusyAction(null);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#DFE7F0] dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#EAF4FF] dark:bg-blue-950/60 border border-[#1976D2]/25 dark:border-blue-800 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-[#1976D2] dark:text-blue-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-[#263445] dark:text-white">
                Hệ thống Cảnh báo &amp; Báo cáo Tự động theo Giờ cố định
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 text-[#718096] dark:text-slate-300 tabular-nums">
                UTC+7{vnNowText ? ` · ${vnNowText}` : ''}
              </span>
            </div>
            <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">
              Nhập trực tiếp giờ phát mong muốn (định dạng 24h <code className="font-mono">HH:mm</code>, VD: <code className="font-mono">07:00</code>, <code className="font-mono">12:45</code>, <code className="font-mono">17:00</code>) rồi bấm Lưu để áp dụng ngay.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadStatus()}
            disabled={isLoadingStatus}
            className="px-3 py-1.5 rounded-lg border border-[#DFE7F0] dark:border-slate-700 bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#263445] dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSaveRules()}
            disabled={isSavingRules}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50 ${
              hasUnsavedChanges
                ? 'bg-[#1976D2] hover:bg-[#155A9C] text-white shadow-xs'
                : 'bg-[#155A9C] hover:bg-[#1976D2] dark:bg-blue-600 dark:hover:bg-blue-700 text-white'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingRules ? 'Đang lưu...' : hasUnsavedChanges ? 'Lưu thay đổi giờ báo' : 'Lưu cấu hình lịch'}</span>
          </button>
        </div>
      </div>

      {/* Telegram Config Readiness Banner */}
      {!telegramConfigured && (
        <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Chưa phát hiện đủ Bot Token &amp; Default Chat ID Telegram. Hệ thống vẫn tổng hợp In-App, nhưng cần gắn Bot Token + Chat ID trong <strong>Cài Đặt Telegram Bot</strong> để gửi tự động qua Telegram.
          </span>
        </div>
      )}

      {/* 3 Fixed Schedules Rows (Fully Editable) */}
      <div className="divide-y divide-[#DFE7F0] dark:divide-slate-800">
        {rules.map((rule) => {
          const meta = RULE_META[rule.id];
          const isThisBusy = busyRuleId === rule.id;
          const draftTime = timeDrafts[rule.id] ?? rule.timeHHmm;
          const timeErr = timeErrors[rule.id];

          const todayVNPrefix = vnNowText ? vnNowText.slice(0, 10) : '';
          const todayRuns = todayVNPrefix
            ? history.filter((h) => h.ruleId === rule.id && String(h.triggeredAt || '').startsWith(todayVNPrefix))
            : [];
          const latestTodayAuto = todayRuns.find((h) => h.triggerMode === 'auto_schedule') || todayRuns[0];
          const sentTimeOnly = latestTodayAuto?.triggeredAt?.slice(11, 16) || '';

          return (
            <div
              key={rule.id}
              className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 hover:bg-[#EAF4FF]/30 dark:hover:bg-slate-800/30 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.accentBg}`}>
                  {meta.icon}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#263445] dark:text-white">
                      {rule.name}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border tabular-nums ${meta.accentBg} ${meta.accentText}`}>
                      {rule.timeHHmm}
                    </span>
                    <span className="text-[11px] font-semibold text-[#718096] dark:text-slate-500">
                      {rule.enabled ? 'Đang bật' : 'Đang tắt'}
                    </span>
                    {latestTodayAuto && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border tabular-nums ${
                          latestTodayAuto.status === 'success'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                            : latestTodayAuto.status === 'partial'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                        }`}
                        title={latestTodayAuto.errorMessage || latestTodayAuto.summary}
                      >
                        {latestTodayAuto.status === 'success'
                          ? `Đã phát hôm nay${sentTimeOnly ? ` (${sentTimeOnly})` : ''}`
                          : latestTodayAuto.status === 'partial'
                          ? `Phát một phần (${sentTimeOnly || 'hôm nay'})`
                          : 'Lỗi phát hôm nay (đang tự thử lại)'}
                      </span>
                    )}
                    {!latestTodayAuto && rule.enabled && todayVNPrefix && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-[#F4F7FB] text-[#718096] border-[#DFE7F0] dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                        Chờ phát hôm nay ({rule.timeHHmm})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#718096] dark:text-slate-400 leading-relaxed">
                    {rule.description}
                  </p>
                  {timeErr && (
                    <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                      {timeErr}
                    </p>
                  )}
                </div>
              </div>

              {/* Controls: Toggle + Editable 24h Time Input + Channel + Threshold + Preview + Run Now */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#DFE7F0] dark:border-slate-700 bg-[#F4F7FB] dark:bg-slate-800 text-xs font-semibold text-[#263445] dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                    className="rounded border-[#DFE7F0] text-[#1976D2] focus:ring-[#1976D2]"
                  />
                  <span>Bật</span>
                </label>

                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-[#F4F7FB] dark:bg-slate-800 ${
                    timeErr
                      ? 'border-rose-400 dark:border-rose-700'
                      : 'border-[#DFE7F0] dark:border-slate-700 focus-within:border-[#1976D2]'
                  }`}
                >
                  <span className="text-[11px] font-semibold text-[#718096] dark:text-slate-400 whitespace-nowrap">
                    Giờ báo:
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={draftTime}
                    onChange={(e) => handleTimeInputChange(rule.id, e.target.value)}
                    onBlur={() => handleTimeInputBlur(rule.id)}
                    placeholder="07:00"
                    aria-label={`Nhập giờ báo cho ${rule.name}`}
                    className="w-14 py-0.5 text-center font-mono text-xs font-bold bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-700 rounded text-[#263445] dark:text-white tabular-nums outline-none focus:ring-2 focus:ring-[#1976D2]/25"
                  />
                </div>

                <select
                  value={rule.channel}
                  onChange={(e) =>
                    updateRule(rule.id, { channel: e.target.value as ScheduledAlertChannel })
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-[#DFE7F0] dark:border-slate-700 bg-[#F4F7FB] dark:bg-slate-800 text-xs font-semibold text-[#263445] dark:text-slate-200"
                >
                  <option value="telegram_and_inapp">Telegram + In-App</option>
                  <option value="telegram">Chỉ Telegram</option>
                  <option value="inapp">Chỉ In-App</option>
                </select>

                {rule.id !== 'noon_services_1245' && (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#DFE7F0] dark:border-slate-700 bg-[#F4F7FB] dark:bg-slate-800 text-xs text-[#718096] dark:text-slate-300">
                    <span>Máy ≤</span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={rule.equipmentWarningDays || 30}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          equipmentWarningDays: Math.min(90, Math.max(1, Number(e.target.value) || 30))
                        })
                      }
                      className="w-10 text-center font-bold bg-transparent border-b border-[#DFE7F0] dark:border-slate-600 text-[#263445] dark:text-white tabular-nums outline-none"
                    />
                    <span>ngày</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handlePreview(rule)}
                  disabled={isThisBusy}
                  className="px-3 py-1.5 rounded-lg border border-[#DFE7F0] dark:border-slate-700 bg-white hover:bg-[#EAF4FF] dark:bg-slate-900 dark:hover:bg-slate-800 text-[#263445] dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5 text-[#718096]" />
                  <span>{isThisBusy && busyAction === 'preview' ? 'Đang tải...' : 'Xem trước'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleRunNow(rule)}
                  disabled={isThisBusy}
                  className="px-3 py-1.5 rounded-lg bg-[#1976D2] hover:bg-[#155A9C] text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isThisBusy && busyAction === 'run' ? 'Đang gửi...' : 'Gửi ngay'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Preview Panel */}
      {previewData && (
        <div className="p-4 sm:p-5 bg-[#F4F7FB] dark:bg-slate-950/60 border-t border-[#DFE7F0] dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#1976D2] dark:text-blue-400">
                  Bản xem trước trực tiếp
                </span>
                <span className="text-xs text-[#718096] dark:text-slate-400 tabular-nums">
                  {previewData.generatedAtVN} · Ngày mục tiêu: {previewData.targetDateVN}
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#263445] dark:text-white mt-0.5">
                {previewData.title}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setPreviewData(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
              title="Đóng bản xem trước"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 4 KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {previewData.stats.map((st, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {st.label}
                </div>
                <div
                  className={`text-sm font-bold mt-0.5 tabular-nums truncate ${
                    st.tone === 'danger'
                      ? 'text-rose-600 dark:text-rose-400'
                      : st.tone === 'warn'
                      ? 'text-amber-600 dark:text-amber-400'
                      : st.tone === 'good'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {st.value}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Nội dung chi tiết gửi Telegram</span>
              {previewData.dataSourceNotes.length > 0 && (
                <span>Nguồn: {previewData.dataSourceNotes.join(' · ')}</span>
              )}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800 dark:text-slate-200 max-h-[32rem] overflow-y-auto pr-1">
              {previewData.telegramMarkdown}
            </pre>
          </div>
        </div>
      )}

      {/* Recent Scheduled Alert Dispatch History */}
      {showHistory && history.length > 0 && (
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Nhật ký chạy cảnh báo cố định gần nhất ({history.length})
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase font-bold text-slate-400">
                <tr>
                  <th className="p-2.5">Thời điểm (VN)</th>
                  <th className="p-2.5">Bản tin</th>
                  <th className="p-2.5">Chế độ</th>
                  <th className="p-2.5">Kênh đã phát</th>
                  <th className="p-2.5">Tóm tắt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.slice(0, 10).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 whitespace-nowrap tabular-nums text-slate-500 dark:text-slate-400">
                      {item.triggeredAt}
                    </td>
                    <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-100">
                      {item.ruleName}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {item.triggerMode === 'auto_schedule' ? 'Tự động đúng giờ' : 'Chạy kiểm tra'}
                      </span>
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                          item.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : item.status === 'partial'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {item.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {[
                            item.telegramSent ? 'Telegram' : null,
                            item.inAppSaved ? 'In-App' : null
                          ]
                            .filter(Boolean)
                            .join(' + ') || 'Chưa phát'}
                        </span>
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-300 max-w-md truncate" title={item.errorMessage || item.summary}>
                      {item.errorMessage ? `${item.summary} (${item.errorMessage})` : item.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
