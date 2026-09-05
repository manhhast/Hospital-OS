import React, { useState, useRef, useEffect } from 'react';
import { 
  BookOpen, Send, Sparkles, FileText, CheckCircle, AlertTriangle, 
  ExternalLink, Copy, Check, Bot, User, ShieldAlert, ArrowRight, 
  Search, Bookmark, ShieldCheck, Flame, RefreshCw
} from 'lucide-react';
import { ISOCopilotChatMessage, SOPReference } from '../../types/aiEcosystem';
import { aiService } from '../../services/aiService';

interface IsoCopilotTabProps {
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const IsoCopilotTab: React.FC<IsoCopilotTabProps> = ({ onShowToast }) => {
  const [messages, setMessages] = useState<ISOCopilotChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      timestamp: '07:00',
      content: `Xin chào Quý đồng nghiệp! Tôi là **AI ISO 15189 & SOP Copilot** của Khoa Cận Lâm Sàng. Tôi được nạp toàn bộ Quy trình Thao tác Chuẩn (SOP), Tiêu chuẩn ISO 15189:2022, An toàn Bức xạ và Kiểm soát Nhiễm khuẩn của khoa.\n\nBạn có thể hỏi tôi về bất kỳ quy trình kỹ thuật, tiêu chuẩn thời gian trả kết quả (TAT), xử lý sự cố tràn đổ hóa chất hay quy tắc kiểm tra chất lượng (IQC) nào.`,
      references: [
        {
          sopCode: 'ISO 15189:2022',
          isoClause: 'Toàn văn tiêu chuẩn',
          title: 'Yêu cầu về chất lượng và năng lực phòng xét nghiệm y tế',
          category: 'XÉT NGHIỆM',
          effectiveDate: '2025-01-01'
        }
      ]
    }
  ]);
  const [inputQuery, setInputQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    {
      label: 'Tràn đổ hóa chất Cobas 6000',
      query: 'Quy trình xử lý sự cố tràn đổ hóa chất máy xét nghiệm Cobas 6000 như thế nào?'
    },
    {
      label: 'Thời gian trả kết quả Troponin khẩn',
      query: 'Tiêu chuẩn thời gian trả kết quả (TAT) xét nghiệm Troponin T hs khẩn cấp theo ISO 15189 là bao lâu?'
    },
    {
      label: 'An toàn tiêm cản quang CT',
      query: 'Quy trình an toàn bức xạ và đánh giá chức năng thận trước khi tiêm thuốc cản quang chụp CT?'
    },
    {
      label: 'Quy tắc Westgard dừng máy IQC',
      query: 'Những quy tắc Westgard nào vi phạm buộc phải dừng máy xét nghiệm và không được trả kết quả?'
    }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ISOCopilotChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      content: textToSend
    };

    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const assistantMsg = await aiService.askISOCopilot(textToSend, messages);
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      console.error(e);
      if (onShowToast) {
        onShowToast('Lỗi tra cứu SOP', 'Không thể kết nối máy chủ AI', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    if (onShowToast) onShowToast('Đã sao chép', 'Nội dung quy trình đã lưu vào bộ nhớ tạm', 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                AI ISO 15189 & SOP Copilot (RAG)
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-full border border-emerald-300 dark:border-emerald-800">
                Tra Cứu Quy Trình & ISO Chuẩn Xác
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Trợ lý RAG tra cứu tức thì tài liệu SOP nội bộ, tiêu chuẩn ISO 15189:2022 và xử lý sự cố khẩn cấp
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            100% Khớp Hồ Sơ Khoa
          </span>
        </div>
      </div>

      {/* Quick Prompt Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-xs font-bold text-slate-500 shrink-0 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          Gợi ý tra cứu nhanh:
        </span>
        {quickQuestions.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q.query)}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 transition shrink-0 shadow-sm flex items-center gap-1.5"
          >
            <span>{q.label}</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col h-[560px]">
        {/* Messages Scroll Area */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-2xl p-4 space-y-3 ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 pb-1 border-b border-black/5 dark:border-white/10 text-[11px]">
                    <span className="font-bold opacity-80">
                      {isUser ? 'Bạn' : 'AI ISO & SOP Copilot'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="opacity-60">{msg.timestamp}</span>
                      {!isUser && (
                        <button
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                          title="Sao chép"
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

                  {/* Message Content */}
                  <div className="text-xs leading-relaxed whitespace-pre-line font-medium">
                    {msg.content}
                  </div>

                  {/* Action Checklist (If provided by RAG) */}
                  {msg.actionChecklist && msg.actionChecklist.length > 0 && (
                    <div className="bg-white dark:bg-slate-900/90 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Checklist Các Bước Thao Tác Chuẩn:
                      </div>
                      <div className="space-y-1.5">
                        {msg.actionChecklist.map((step, sIdx) => (
                          <div key={sIdx} className="text-xs text-slate-700 dark:text-slate-200 flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                              {sIdx + 1}
                            </span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warning Note */}
                  {msg.warningNote && (
                    <div className="bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold">Lưu ý an toàn:</strong> {msg.warningNote}
                      </div>
                    </div>
                  )}

                  {/* SOP Document References */}
                  {msg.references && msg.references.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-2">
                      {msg.references.map((ref, rIdx) => (
                        <div
                          key={rIdx}
                          className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[11px] font-bold flex items-center gap-1.5"
                        >
                          <FileText className="w-3 h-3 text-emerald-600" />
                          <span>{ref.sopCode} ({ref.isoClause})</span>
                        </div>
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
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-500">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                <span>Đang truy hồi tài liệu SOP và đối chiếu tiêu chuẩn ISO 15189:2022...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200/80 dark:border-slate-800 rounded-b-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Nhập câu hỏi quy trình SOP, an toàn bức xạ, ISO 15189, TAT khẩn..."
              className="flex-1 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-emerald-500 transition"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gửi câu hỏi</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
