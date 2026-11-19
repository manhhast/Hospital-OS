import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  Database,
  MessageCircle,
  AlertTriangle,
  Trash2,
  ArrowRight,
  User,
  Settings,
  Globe,
  Brain,
  ThumbsUp,
  Pencil,
  Plus,
  ExternalLink,
  X
} from 'lucide-react';
import { SmartAssistantMessage, TelegramBotStatus } from '../../types/aiEcosystem';
import type { AssistantMemoryCategory, AssistantMemoryItem } from '../../types/hospital';
import { aiService } from '../../services/aiService';
import { buildLiveHospitalContext, LiveHospitalContextSnapshot } from '../../services/aiContextService';
import { storageService } from '../../services/storageService';
import { REPORT_ARCHIVE_UPDATED_EVENT } from '../../services/reportArchiveService';
import { MarkdownContent } from '../common/MarkdownContent';

interface SmartAssistantTabProps {
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onNavigateModule?: (module: string) => void;
}

const buildWelcomeMessage = (
  ctx: LiveHospitalContextSnapshot,
  memoriesCount: number,
  webEnabled: boolean
): SmartAssistantMessage => {
  const latest = ctx.caseReports.latestRecordedDay;
  const latestText = latest
    ? `Ngày ghi nhận gần nhất là **${latest.dateLabel}** với **${latest.totalCases.toLocaleString('vi-VN')} ca** (BHYT: ${latest.bhytCases}, Nhân dân: ${latest.nhanDanCases}).`
    : `Hiện bộ nhớ chưa có ngày nào có số ca dương trong năm ${ctx.caseReports.activeYear}.`;

  return {
    id: 'welcome-1',
    sender: 'assistant',
    timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    content:
      `Xin chào **${ctx.currentUser.name || 'bạn'}**! Tôi là **Trợ Lý Chuyên Môn & Điều Hành Khoa Cận Lâm Sàng**.\n\n` +
      `Tôi đang kết nối đồng thời **2 nguồn tri thức**:\n` +
      `• **Dữ liệu thực tế trong ứng dụng**: ${ctx.caseReports.monthlyTotals.length} tháng báo cáo, ${ctx.equipment.totalCount} thiết bị, ${ctx.rooms.roomsCount} phòng, ${ctx.staff.totalCount} nhân sự, ${ctx.tasks.totalCount} công việc và ${ctx.documents.totalCount} tài liệu SOP/ISO. ${latestText}\n` +
      `• **Tra cứu Internet trực tiếp (${webEnabled ? 'Đang bật' : 'Đang tắt'}) & Bộ nhớ học hỏi (${memoriesCount} mục)**: sẵn sàng giải đáp bất kỳ câu hỏi chuyên môn y khoa, văn bản Bộ Y tế, thời sự hoặc kiến thức tổng hợp nào, đồng thời ghi nhớ các quy ước riêng bạn dặn.\n\n` +
      `Bạn muốn tôi kiểm tra số liệu ngày nào, tra cứu thông tin gì hay ghi nhớ quy ước mới cho khoa?`,
    dataSourcesUsed: [
      'Dữ liệu trực tiếp toàn ứng dụng',
      ...(webEnabled ? ['Tra cứu Internet (Google Search)'] : [])
    ],
    suggestedFollowUps: [
      'Báo cáo chi tiết số liệu ngày gần nhất và so sánh với tháng này?',
      'Thiết bị nào đang cảnh báo hoặc sắp đến hạn bảo trì / kiểm chuẩn?',
      'So sánh tiêu chuẩn TAT Troponin khẩn hiện nay theo khuyến cáo Bộ Y tế & ISO 15189?'
    ]
  };
};

const MEMORY_CATEGORY_META: Record<
  AssistantMemoryCategory,
  { label: string; badgeCls: string }
> = {
  rule: {
    label: 'Quy ước',
    badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
  },
  fact: {
    label: 'Kiến thức khoa',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
  },
  preference: {
    label: 'Phong cách trả lời',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
  },
  correction: {
    label: 'Hiệu chỉnh AI',
    badgeCls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
  }
};

export const SmartAssistantTab: React.FC<SmartAssistantTabProps> = ({
  onShowToast,
  onNavigateModule
}) => {
  const [liveSnapshot, setLiveSnapshot] = useState<LiveHospitalContextSnapshot>(() =>
    buildLiveHospitalContext()
  );
  const [memories, setMemories] = useState<AssistantMemoryItem[]>(() =>
    storageService.getAssistantMemories()
  );
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(
    () => storageService.getSettings().aiWebSearchEnabled !== false
  );
  const [messages, setMessages] = useState<SmartAssistantMessage[]>(() => [
    buildWelcomeMessage(
      buildLiveHospitalContext(),
      storageService.getAssistantMemories().length,
      storageService.getSettings().aiWebSearchEnabled !== false
    )
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramBotStatus | null>(null);

  // AI Memory Panel & Teach Form
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<AssistantMemoryCategory>('rule');

  // Inline correction / teach per message
  const [teachingMsgId, setTeachingMsgId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshContextAndTelegram = async (showNotice = false) => {
    setIsSyncing(true);
    try {
      const nextCtx = buildLiveHospitalContext();
      setLiveSnapshot(nextCtx);
      setMemories(storageService.getAssistantMemories());
      setWebSearchEnabled(storageService.getSettings().aiWebSearchEnabled !== false);
      await aiService.syncContextNow();
      setMemories(storageService.getAssistantMemories());
      const tg = await aiService.getTelegramBotStatus();
      setTelegramStatus(tg);
      if (showNotice && onShowToast) {
        onShowToast(
          'Đã đồng bộ dữ liệu Trợ lý Ảo',
          `Đã cập nhật ${nextCtx.caseReports.monthlyTotals.length} tháng báo cáo, ${nextCtx.equipment.totalCount} thiết bị, ${nextCtx.rooms.roomsCount} phòng và bộ nhớ học hỏi.`,
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
      setMemories(storageService.getAssistantMemories());
      setWebSearchEnabled(storageService.getSettings().aiWebSearchEnabled !== false);
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

  const handleToggleWebSearch = async () => {
    const nextVal = !webSearchEnabled;
    const settings = storageService.getSettings();
    storageService.saveSettings({
      ...settings,
      aiWebSearchEnabled: nextVal
    });
    setWebSearchEnabled(nextVal);
    await aiService.syncContextNow();
    onShowToast?.(
      nextVal ? 'Đã bật tra cứu Internet' : 'Đã chuyển sang chỉ dùng dữ liệu nội bộ',
      nextVal
        ? 'Trợ lý AI sẽ tự động kết hợp Google Search khi cần trả lời kiến thức y khoa mới hoặc câu hỏi mở.'
        : 'Trợ lý AI chỉ sử dụng dữ liệu nội bộ ứng dụng và kho SOP sẵn có.',
      'info'
    );
  };

  const handleAddMemoryManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newMemoryText.trim();
    if (!clean) return;
    const updated = storageService.addAssistantMemory({
      content: clean,
      category: newMemoryCategory,
      source: 'user'
    });
    setMemories(updated);
    setNewMemoryText('');
    await aiService.syncContextNow();
    onShowToast?.('Đã dạy AI ghi nhớ mới', clean, 'success');
  };

  const handleDeleteMemory = async (id: string) => {
    const updated = storageService.deleteAssistantMemory(id);
    setMemories(updated);
    await aiService.syncContextNow();
    onShowToast?.('Đã xóa ghi nhớ', 'Đã cập nhật bộ nhớ học hỏi của Trợ lý AI.', 'info');
  };

  const handlePositiveFeedback = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, feedback: 'up' } : m))
    );
    onShowToast?.('Cảm ơn phản hồi', 'Trợ lý đã ghi nhận câu trả lời hữu ích cho phong cách phản hồi.', 'success');
  };

  const handleSubmitCorrection = async (msgId: string) => {
    const clean = correctionText.trim();
    if (!clean) return;
    const updated = storageService.addAssistantMemory({
      content: clean,
      category: 'correction',
      source: 'feedback'
    });
    setMemories(updated);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, feedback: 'down', newlyLearnedNote: clean }
          : m
      )
    );
    setTeachingMsgId(null);
    setCorrectionText('');
    await aiService.syncContextNow();
    onShowToast?.(
      'Đã học từ góp ý của bạn',
      'Trợ lý sẽ áp dụng điều chỉnh này cho cả Web và Telegram Bot.',
      'success'
    );
  };

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
      label: 'Chuẩn TAT & Khuyến cáo Bộ Y tế (Internet)',
      query: 'So sánh thời gian trả kết quả Troponin khẩn và nội kiểm IQC của khoa với hướng dẫn mới nhất từ Bộ Y tế và ISO 15189?'
    },
    {
      label: 'Dạy AI quy ước giao ban',
      query: 'Hãy ghi nhớ giúp tôi: khi tóm tắt báo cáo giao ban hàng ngày, luôn nêu tổng số ca trước rồi phân tách rõ BHYT và Nhân dân.'
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
      const reply = await aiService.askSmartAssistant(query, messages, {
        useWebSearch: webSearchEnabled
      });
      setMessages((prev) => [...prev, reply]);
      setLiveSnapshot(buildLiveHospitalContext());
      setMemories(storageService.getAssistantMemories());
      if (reply.newlyLearnedNote) {
        void aiService.syncContextNow();
      }
    } catch (err: any) {
      const errText = err?.message || 'Không thể kết nối máy chủ AI.';
      setMessages((prev) => [
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
    setMessages([buildWelcomeMessage(fresh, memories.length, webSearchEnabled)]);
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
      {/* Live Data, Internet Grounding & AI Learning Status Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300/80 dark:border-slate-700 p-4 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Database className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Trợ Lý Chuyên Môn CLS (App + Internet + Học Hỏi)
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Live Sync
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {liveSnapshot.caseReports.monthlyTotals.length} tháng số liệu ca •{' '}
              {liveSnapshot.equipment.totalCount} máy móc ({liveSnapshot.equipment.alertItems.length} cảnh báo) •{' '}
              {liveSnapshot.rooms.roomsCount} phòng • {liveSnapshot.staff.totalCount} nhân sự •{' '}
              {liveSnapshot.documents.totalCount} SOP/ISO
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleToggleWebSearch()}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              webSearchEnabled
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
            title="Bật/tắt tra cứu Internet qua Google Search"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Internet: {webSearchEnabled ? 'Bật' : 'Tắt'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMemoryPanel((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showMemoryPanel
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Bộ nhớ học hỏi ({memories.length})</span>
          </button>

          {telegramStatus?.pollingActive &&
          !telegramStatus?.conflictDetected &&
          !telegramStatus?.pausedByUser ? (
            <button
              type="button"
              onClick={() => onNavigateModule?.('telegram')}
              className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-xs font-semibold text-sky-800 dark:text-sky-200 flex items-center gap-1.5 cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-900/50"
            >
              <MessageCircle className="w-3.5 h-3.5 text-sky-600" />
              <span>
                @{telegramStatus.botUsername || 'Bot'} ({telegramStatus.totalAnswered})
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateModule?.('telegram')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                telegramStatus?.conflictDetected
                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{telegramStatus?.conflictDetected ? 'Telegram (Lỗi 409)' : 'Cấu hình Telegram'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void refreshContextAndTelegram(true)}
            disabled={isSyncing}
            className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Đồng bộ</span>
          </button>

          <button
            type="button"
            onClick={handleResetChat}
            title="Làm mới cuộc hội thoại"
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Collapsible AI Learning & Memory Manager */}
      {showMemoryPanel && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                  Bộ Nhớ & Kinh Nghiệm Đã Học ({memories.length}/60)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mọi quy ước, kiến thức và chỉnh sửa tại đây được đồng bộ cho cả Trợ lý Web & Telegram Bot.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMemoryPanel(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={(e) => void handleAddMemoryManual(e)} className="flex flex-col sm:flex-row gap-2">
            <select
              value={newMemoryCategory}
              onChange={(e) => setNewMemoryCategory(e.target.value as AssistantMemoryCategory)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <option value="rule">Quy ước vận hành</option>
              <option value="fact">Kiến thức chuyên môn</option>
              <option value="preference">Phong cách trả lời</option>
              <option value="correction">Hiệu chỉnh AI</option>
            </select>
            <input
              type="text"
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              placeholder="VD: Phòng SA-02 ưu tiên ca cấp cứu buổi sáng, hoặc khi báo cáo luôn so sánh với hôm qua..."
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!newMemoryText.trim()}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dạy AI ngay</span>
            </button>
          </form>

          {memories.length === 0 ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
              Chưa có ghi nhớ tùy chỉnh nào. Bạn có thể dạy AI ở ô trên, bấm nút "Dạy lại / Góp ý" dưới câu trả lời, hoặc nhắn "Ghi nhớ: ..." qua chat/Telegram.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {memories.map((mem) => {
                const meta = MEMORY_CATEGORY_META[mem.category] || MEMORY_CATEGORY_META.fact;
                return (
                  <div
                    key={mem.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.badgeCls}`}>
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {mem.source === 'telegram'
                            ? 'Từ Telegram'
                            : mem.source === 'feedback'
                            ? 'Từ góp ý'
                            : mem.source === 'user'
                            ? 'Nhập tay'
                            : 'Tự học'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">
                        {mem.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMemory(mem.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer shrink-0"
                      title="Xóa ghi nhớ này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick Prompts */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-bold text-slate-500 shrink-0 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          Gợi ý:
        </span>
        {quickPrompts.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => void handleSend(item.query)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 transition shrink-0 shadow-2xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
                  className={`max-w-3xl min-w-0 rounded-2xl p-4 space-y-3 ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 pb-1.5 border-b border-black/10 dark:border-white/10 text-[11px]">
                    <span className="font-bold opacity-90">
                      {isUser ? 'Bạn' : 'Trợ Lý Chuyên Môn CLS'}
                    </span>
                    <div className="flex items-center gap-2">
                      {!isUser && msg.usedWebSearch && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" />
                          Internet
                        </span>
                      )}
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
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition cursor-pointer"
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

                  {msg.newlyLearnedNote && (
                    <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-800 dark:text-indigo-200 flex items-start gap-2">
                      <Brain className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Đã tự động ghi nhớ cho lần sau:</strong> {msg.newlyLearnedNote}
                      </span>
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

                  {/* Formatted Message Text */}
                  {isUser ? (
                    <div className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-line font-medium">
                      {msg.content}
                    </div>
                  ) : (
                    <MarkdownContent content={msg.content} />
                  )}

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

                  {/* Internet Grounding Citations */}
                  {!isUser && msg.webSources && msg.webSources.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/70 space-y-1.5">
                      <div className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                        <Globe className="w-3.5 h-3.5" />
                        Nguồn Tham Khảo Internet
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.webSources.map((src, wIdx) => (
                          <a
                            key={wIdx}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 transition max-w-xs truncate"
                          >
                            <span className="truncate">{src.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
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

                  {/* Learning Feedback Controls */}
                  {!isUser && msg.id !== 'welcome-1' && (
                    <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/70 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePositiveFeedback(msg.id)}
                          className={`px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition ${
                            msg.feedback === 'up'
                              ? 'bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          <span>{msg.feedback === 'up' ? 'Đã đánh giá hữu ích' : 'Hữu ích'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTeachingMsgId((prev) => (prev === msg.id ? null : msg.id));
                            setCorrectionText('');
                          }}
                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1 cursor-pointer transition"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Dạy lại / Bổ sung kiến thức</span>
                        </button>
                      </div>

                      {teachingMsgId === msg.id && (
                        <div className="flex flex-col sm:flex-row gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
                          <input
                            type="text"
                            value={correctionText}
                            onChange={(e) => setCorrectionText(e.target.value)}
                            placeholder="Nhập điều cần sửa hoặc quy ước muốn AI nhớ cho lần sau..."
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleSubmitCorrection(msg.id)}
                              disabled={!correctionText.trim()}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                            >
                              Lưu để AI học
                            </button>
                            <button
                              type="button"
                              onClick={() => setTeachingMsgId(null)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Follow-up Suggestions */}
                  {!isUser && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5">
                      {msg.suggestedFollowUps.map((fup, fIdx) => (
                        <button
                          key={fIdx}
                          type="button"
                          onClick={() => void handleSend(fup)}
                          disabled={isLoading}
                          className="px-2.5 py-1 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-700 dark:text-blue-300 transition flex items-center gap-1 disabled:opacity-50 cursor-pointer"
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
                <span>
                  {webSearchEnabled
                    ? 'Đang phân tích dữ liệu khoa & tra cứu tri thức Internet...'
                    : 'Đang tổng hợp số liệu Google Sheet, thiết bị, nhân sự & quy trình SOP...'}
                </span>
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
              placeholder="Hỏi bất kỳ điều gì từ số liệu ngày/tháng, máy móc, lịch trực đến kiến thức y khoa Internet hoặc dạy AI ghi nhớ..."
              className="flex-1 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-md shadow-blue-600/20 flex items-center gap-1.5 shrink-0 cursor-pointer"
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
