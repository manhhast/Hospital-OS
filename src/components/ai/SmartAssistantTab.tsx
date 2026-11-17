import React, { useState, useRef, useEffect } from 'react';
import {
  Bot, Send, Sparkles, RefreshCw, Copy, Check, CheckCircle2,
  Database, MessageCircle, AlertTriangle, Trash2, ArrowRight, User, Settings
} from 'lucide-react';
import { SmartAssistantMessage, TelegramBotStatus } from '../../types/aiEcosystem';
import { aiService } from '../../services/aiService';
import { buildLiveHospitalContext, LiveHospitalContextSnapshot } from '../../services/aiContextService';
import { storageService } from '../../services/storageService';
import { REPORT_ARCHIVE_UPDATED_EVENT } from '../../services/reportArchiveService';

interface SmartAssistantTabProps {
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onNavigateModule?: (module: string) => void;
}

const buildWelcomeMessage = (ctx: LiveHospitalContextSnapshot): SmartAssistantMessage => {
  const latest = ctx.caseReports.latestRecordedDay;
  const latestText = latest
    ? `Ngày ghi nhận gần nhất là **${latest.dateLabel}** với **${latest.totalCases.toLocaleString('vi-VN')} ca** (BHYT: ${latest.bhytCases}, Nhân dân: ${latest.nhanDanCases}).`
    : `Hiện bộ nhớ chưa có ngày nào có số ca dương trong năm ${ctx.caseReports.activeYear}.`;

  return {
    id: 'welcome-1',
    sender: 'assistant',
    timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    content:
      `Xin chào! Tôi là **Trợ Lý Ảo Thông Minh Khoa Cận Lâm Sàng**.\n\n` +
      `Tôi đang kết nối trực tiếp với toàn bộ dữ liệu thực tế trong ứng dụng (${ctx.caseReports.monthlyTotals.length} tháng báo cáo Google Sheet, ${ctx.equipment.totalCount} thiết bị, ${ctx.rooms.roomsCount} phòng, ${ctx.staff.totalCount} nhân sự, ${ctx.tasks.totalCount} công việc và ${ctx.documents.totalCount} tài liệu SOP/ISO). ${latestText}\n\n` +
      `Bạn có thể hỏi bất kỳ thông tin nào về số ca, máy móc, lịch trực, công việc, nhân sự hoặc quy trình chuyên môn — ngay tại đây hoặc qua **Telegram Bot** đã kết nối.`,
    dataSourcesUsed: ['Dữ liệu trực tiếp toàn ứng dụng'],
    suggestedFollowUps: [
      'Tổng hợp số liệu ngày gần nhất và lũy kế năm nay?',
      'Thiết bị nào đang cảnh báo hoặc sắp đến hạn bảo trì / kiểm chuẩn?',
      'Hôm nay có ai trực và công việc nào cần xử lý gấp?'
    ]
  };
};

export const SmartAssistantTab: React.FC<SmartAssistantTabProps> = ({
  onShowToast,
  onNavigateModule
}) => {
  const [liveSnapshot, setLiveSnapshot] = useState<LiveHospitalContextSnapshot>(() =>
    buildLiveHospitalContext()
  );
  const [messages, setMessages] = useState<SmartAssistantMessage[]>(() => [
    buildWelcomeMessage(buildLiveHospitalContext())
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramBotStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshContextAndTelegram = async (showNotice = false) => {
    setIsSyncing(true);
    try {
      const nextCtx = buildLiveHospitalContext();
      setLiveSnapshot(nextCtx);
      await aiService.syncContextNow();
      const tg = await aiService.getTelegramBotStatus();
      setTelegramStatus(tg);
      if (showNotice && onShowToast) {
        onShowToast(
          'Đã đồng bộ dữ liệu Trợ lý Ảo',
          `Đã cập nhật ${nextCtx.caseReports.monthlyTotals.length} tháng báo cáo, ${nextCtx.equipment.totalCount} thiết bị, ${nextCtx.rooms.roomsCount} phòng.`,
          'success'
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    void refreshContextAndTelegram(false);
    const unsub = storageService.subscribe(() => {
      setLiveSnapshot(buildLiveHospitalContext());
    });
    const onArchiveUpdated = () => {
      setLiveSnapshot(buildLiveHospitalContext());
    };
    window.addEventListener(REPORT_ARCHIVE_UPDATED_EVENT, onArchiveUpdated);
    return () => {
      unsub();
      window.removeEventListener(REPORT_ARCHIVE_UPDATED_EVENT, onArchiveUpdated);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const quickPrompts = [
    {
      label: 'Số ca gần nhất & Tổng kết tháng',
      query: 'Tổng hợp chi tiết số ca ngày gần nhất và lũy kế các tháng năm nay theo từng bộ phận?'
    },
    {
      label: 'Cảnh báo máy móc & Hiệu chuẩn',
      query: 'Danh sách thiết bị đang gặp sự cố hoặc sắp đến hạn bảo trì, kiểm chuẩn, kiểm xạ?'
    },
    {
      label: 'Lịch trực hôm nay & Công việc gấp',
      query: 'Hôm nay có ai trực và những công việc nào đang chờ xử lý hoặc quá hạn?'
    },
    {
      label: 'Phòng quá tải & Phân công phụ trách',
      query: 'Tình trạng các phòng Cận Lâm Sàng, trưởng phòng và máy chính hiện tại?'
    },
    {
      label: 'Đối soát sai lệch Google Sheet',
      query: 'Kiểm tra lịch sử đồng bộ Google Sheet gần nhất có sai lệch nào chưa xử lý không?'
    }
  ];

  const handleSend = async (customText?: string) => {
    const query = (customText ?? inputQuery).trim();
    if (!query || isLoading) return;

    const userMsg: SmartAssistantMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      content: query
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!customText) setInputQuery('');
    setIsLoading(true);

    try {
      const reply = await aiService.askSmartAssistant(query, messages);
      setMessages(prev => [...prev, reply]);
      setLiveSnapshot(buildLiveHospitalContext());
    } catch (err: any) {
      const errText = err?.message || 'Không thể kết nối máy chủ AI.';
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          content: `Rất tiếc, đã xảy ra sự cố khi xử lý câu hỏi: ${errText}`,
          aiWarning: errText
        }
      ]);
      if (onShowToast) {
        onShowToast('Lỗi Trợ lý Ảo AI', errText, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    if (onShowToast) onShowToast('Đã sao chép', 'Nội dung trả lời đã lưu vào bộ nhớ tạm', 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetChat = () => {
    const fresh = buildLiveHospitalContext();
    setLiveSnapshot(fresh);
    setMessages([buildWelcomeMessage(fresh)]);
  };

  const metricToneClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
    amber: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
    rose: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200',
    slate: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
  };

  return (
    <div className="space-y-4">
      {/* Live Data & Telegram Bridge Status Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300/80 dark:border-slate-700 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Database className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Ngữ Cảnh Dữ Liệu Thực Tế Đang Kết Nối
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Live Sync Active
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {liveSnapshot.caseReports.monthlyTotals.length} tháng số liệu ca •{' '}
              {liveSnapshot.equipment.totalCount} máy móc ({liveSnapshot.equipment.alertItems.length} cảnh báo) •{' '}
              {liveSnapshot.rooms.roomsCount} phòng • {liveSnapshot.staff.totalCount} nhân sự •{' '}
              {liveSnapshot.tasks.totalCount} công việc • {liveSnapshot.documents.totalCount} SOP/ISO
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {telegramStatus?.pollingActive ? (
            <div className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-xs font-semibold text-sky-800 dark:text-sky-200 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-sky-600" />
              <span>
                Telegram Q&A: @{telegramStatus.botUsername || 'Bot'} ({telegramStatus.totalAnswered} đã trả lời)
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateModule?.('settings')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Cấu hình Bot Telegram Q&A</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => refreshContextAndTelegram(true)}
            disabled={isSyncing}
            className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Đồng bộ dữ liệu</span>
          </button>

          <button
            type="button"
            onClick={handleResetChat}
            title="Làm mới cuộc hội thoại"
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-bold text-slate-500 shrink-0 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          Hỏi nhanh:
        </span>
        {quickPrompts.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSend(item.query)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 transition shrink-0 shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>{item.label}</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </button>
        ))}
      </div>

      {/* Main Chat Window */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300/80 dark:border-slate-700 shadow-sm flex flex-col h-[580px]">
        <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 custom-scrollbar">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-3xl rounded-2xl p-4 space-y-3 ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 pb-1.5 border-b border-black/10 dark:border-white/10 text-[11px]">
                    <span className="font-bold opacity-90">
                      {isUser ? 'Bạn' : 'Trợ Lý Ảo Thông Minh CLS'}
                    </span>
                    <div className="flex items-center gap-2">
                      {!isUser && msg.modelUsed && (
                        <span className="px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-500">
                          {msg.modelUsed}
                        </span>
                      )}
                      <span className="opacity-65">{msg.timestamp}</span>
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                          title="Sao chép câu trả lời"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 opacity-60" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {msg.aiWarning && (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>{msg.aiWarning}</span>
                    </div>
                  )}

                  {/* Highlighted Live Metrics */}
                  {!isUser && msg.highlightedMetrics && msg.highlightedMetrics.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {msg.highlightedMetrics.map((m, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border text-left ${
                            metricToneClasses[m.tone || 'slate'] || metricToneClasses.slate
                          }`}
                        >
                          <div className="text-[10px] font-semibold opacity-80 truncate">
                            {m.label}
                          </div>
                          <div className="text-sm font-black mt-0.5 truncate">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Text */}
                  <div className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-line font-medium">
                    {msg.content}
                  </div>

                  {/* Action Checklist */}
                  {!isUser && msg.actionChecklist && msg.actionChecklist.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                      <div className="text-[11px] font-black text-blue-700 dark:text-blue-400 flex items-center gap-1.5 uppercase tracking-wide">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Khuyến Nghị Hành Động
                      </div>
                      <div className="space-y-1">
                        {msg.actionChecklist.map((step, idx) => (
                          <div key={idx} className="text-xs text-slate-700 dark:text-slate-200 flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Data Sources Cited */}
                  {!isUser && msg.dataSourcesUsed && msg.dataSourcesUsed.length > 0 && (
                    <div className="pt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Nguồn dữ liệu:</span>
                      {msg.dataSourcesUsed.map((src, sIdx) => (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Follow-up Suggestions */}
                  {!isUser && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5">
                      {msg.suggestedFollowUps.map((fup, fIdx) => (
                        <button
                          key={fIdx}
                          type="button"
                          onClick={() => handleSend(fup)}
                          disabled={isLoading}
                          className="px-2.5 py-1 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-700 dark:text-blue-300 transition flex items-center gap-1 disabled:opacity-50"
                        >
                          <span>{fup}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>Đang tổng hợp số liệu Google Sheet, thiết bị, nhân sự & quy trình SOP...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 rounded-b-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Hỏi về số ca khám/chụp, tình trạng máy móc, lịch trực hôm nay, phòng quá tải, công việc hoặc SOP..."
              className="flex-1 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-md shadow-blue-600/20 flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Gửi câu hỏi</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
