import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Calendar, Clock, AlertTriangle, CheckCircle2, UserCheck, 
  Volume2, VolumeX, Copy, Check, FileDown, RefreshCw, Flame, Cpu, 
  ShieldAlert, Layers, ArrowUpRight, Award, Printer
} from 'lucide-react';
import { MorningBriefingData } from '../../types/aiEcosystem';
import { aiService } from '../../services/aiService';

interface MorningBriefingTabProps {
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const MorningBriefingTab: React.FC<MorningBriefingTabProps> = ({ onShowToast }) => {
  const [reportDate, setReportDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [briefing, setBriefing] = useState<MorningBriefingData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});

  const fetchBriefing = async () => {
    setIsLoading(true);
    try {
      const data = await aiService.generateMorningBriefing({
        reportDate,
        totalCases: 1341,
        diffPercentage: 18,
        bhytPercentage: 74,
        vienPhiPercentage: 26
      });
      setBriefing(data);
      if (onShowToast) {
        onShowToast('AI Smart Brief Sẵn Sàng', 'Đã tổng hợp bản giao ban 07:00 sáng thành công', 'success');
      }
    } catch (e) {
      console.error(e);
      if (onShowToast) {
        onShowToast('Lỗi tải báo cáo', 'Vui lòng thử lại sau', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefing();
  }, [reportDate]);

  const handleCopyText = () => {
    if (!briefing) return;
    const text = `📋 BẢN TÓM TẮT GIAO BAN KHOA CẬN LÂM SÀNG (07:00 SÁNG)
📅 Ngày: ${briefing.reportDate} | Khởi tạo: ${briefing.generatedAt}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TIÊU ĐỀ: ${briefing.headline}

📝 TỔNG QUAN VẬN HÀNH:
${briefing.executiveSummary}

📊 CHỈ SỐ HOẠT ĐỘNG:
- Tổng số ca: ${briefing.metrics.totalCases.toLocaleString()} ca (${briefing.metrics.diffPercentage > 0 ? '+' : ''}${briefing.metrics.diffPercentage}% so với TB 30 ngày)
- Tỷ lệ BHYT: ${briefing.metrics.bhytPercentage}% (${briefing.metrics.bhytCount} ca) | Viện phí: ${briefing.metrics.vienPhiPercentage}% (${briefing.metrics.vienPhiCount} ca)
- Ca khẩn cấp / Cấp cứu: ${briefing.metrics.emergencyCount} ca
- TAT trung bình: ${briefing.metrics.tatAverageMinutes} phút

🔥 ĐIỂM NÓNG & SỰ CỐ:
${briefing.hotspots.map(h => `• ${h.area}: ${h.caseCount} ca (${h.utilizationRate}% công suất) - ${h.issueDescription}`).join('\n')}
${briefing.equipmentIssues.map(eq => `• [Thiết bị] ${eq.equipmentName} (${eq.room}): ${eq.description}`).join('\n')}

👥 ĐỀ XUẤT ĐIỀU PHỐI NHÂN LỰC:
${briefing.staffingRecommendations.map(s => `• ${s.role} -> ${s.targetRoom} (${s.shiftTime}): ${s.rationale}`).join('\n')}

✅ CHECKLIST CHỈ ĐẠO:
${briefing.actionChecklist.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    if (onShowToast) onShowToast('Đã sao chép', 'Nội dung giao ban đã lưu vào bộ nhớ tạm', 'info');
    setTimeout(() => setCopied(false), 2500);
  };

  const toggleSpeech = () => {
    if (!briefing) return;
    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          `${briefing.headline}. ${briefing.executiveSummary}`
        );
        utterance.lang = 'vi-VN';
        utterance.rate = 1.0;
        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
        setIsPlayingAudio(true);
      } else {
        if (onShowToast) onShowToast('Trình duyệt không hỗ trợ', 'Tính năng đọc văn bản không khả dụng', 'warning');
      }
    }
  };

  const toggleCheck = (idx: number) => {
    setCompletedActions(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                AI Morning Briefing Generator
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-full border border-amber-300 dark:border-amber-800">
                07:00 Sáng Tự Động
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quét toàn bộ số liệu 24h qua, phát hiện quá tải cục bộ, sự cố thiết bị & gợi ý phân bổ nhân sự
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Calendar className="w-4 h-4 text-blue-500" />
            <span>Ngày:</span>
            <input 
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="bg-transparent outline-none cursor-pointer font-bold text-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            onClick={fetchBriefing}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-md shadow-blue-600/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Đang tổng hợp...' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Trí tuệ nhân tạo Gemini đang quét số liệu ca bệnh, nhật ký máy móc và lịch trực...
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Đang trích xuất điểm nóng và tối ưu hóa nhân sự giao ban 07:00 sáng
          </p>
        </div>
      ) : briefing ? (
        <div className="space-y-6">
          {/* Executive Summary Hero Card */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-blue-950 text-white p-6 rounded-3xl border border-indigo-700/40 shadow-xl relative overflow-hidden">
            {/* Ambient Background Lights */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-indigo-500/30">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-lg text-xs font-black tracking-wide flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5" />
                    BẢN TÓM TẮT GIAO BAN ĐIỀU HÀNH
                  </span>
                  <span className="text-xs text-slate-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    07:00 Sáng | {briefing.reportDate}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSpeech}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      isPlayingAudio
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                    title="Đọc to bản tóm tắt giao ban"
                  >
                    {isPlayingAudio ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{isPlayingAudio ? 'Dừng đọc' : 'Đọc tóm tắt'}</span>
                  </button>

                  <button
                    onClick={handleCopyText}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Đã sao chép' : 'Sao chép văn bản'}</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In phiếu</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-lg md:text-xl font-black text-white leading-snug">
                  {briefing.headline}
                </h3>
                <p className="text-sm text-slate-200 mt-2 leading-relaxed bg-white/5 p-3.5 rounded-2xl border border-white/10">
                  {briefing.executiveSummary}
                </p>
              </div>

              {/* 4 Metric Pill Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <div className="text-[11px] text-slate-300 font-medium">Tổng số ca hôm qua</div>
                  <div className="text-xl font-black text-white mt-0.5">
                    {briefing.metrics.totalCases.toLocaleString()}{' '}
                    <span className="text-xs font-bold text-emerald-300">
                      +{briefing.metrics.diffPercentage}%
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">So với TB 30 ngày ({briefing.metrics.averageCases})</div>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <div className="text-[11px] text-slate-300 font-medium">Cơ cấu BHYT / Viện phí</div>
                  <div className="text-xl font-black text-cyan-300 mt-0.5">
                    {briefing.metrics.bhytPercentage}% <span className="text-xs text-slate-300">/ {briefing.metrics.vienPhiPercentage}%</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{briefing.metrics.bhytCount} BHYT · {briefing.metrics.vienPhiCount} VP</div>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <div className="text-[11px] text-slate-300 font-medium">Ca Cấp cứu / Khẩn</div>
                  <div className="text-xl font-black text-rose-300 mt-0.5">
                    {briefing.metrics.emergencyCount} <span className="text-xs text-slate-300">ca</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">100% trả đúng hạn STAT</div>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <div className="text-[11px] text-slate-300 font-medium">TAT Trung Bình Toàn Khoa</div>
                  <div className="text-xl font-black text-amber-300 mt-0.5">
                    {briefing.metrics.tatAverageMinutes} <span className="text-xs text-slate-300">phút</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Đạt chuẩn ISO 15189</div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Hotspots & Equipment Incidents Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hotspots Card */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      Điểm Nóng Quá Tải Cục Bộ (Operational Hotspots)
                    </h4>
                    <p className="text-[11px] text-slate-500">Khu vực vượt công suất thiết kế cần lưu ý ca sáng</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {briefing.hotspots.map((hotspot, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {hotspot.area}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-black rounded-md ${
                        hotspot.status === 'OVERLOAD' 
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}>
                        {hotspot.utilizationRate}% Công suất ({hotspot.caseCount}/{hotspot.capacityLimit} ca)
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {hotspot.issueDescription}
                    </p>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${hotspot.utilizationRate > 125 ? 'bg-rose-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(100, (hotspot.utilizationRate / 150) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Equipment Warnings */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 flex items-center justify-center">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      Sự Cố Thiết Bị & Cảnh Báo Kỹ Thuật
                    </h4>
                    <p className="text-[11px] text-slate-500">Giám sát trạng thái máy móc và hệ số an toàn 24h qua</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {briefing.equipmentIssues.map((eq, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-500" />
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                          {eq.equipmentName}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                        {eq.timestamp} · {eq.room}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      <strong className="text-slate-900 dark:text-slate-100">Hiện tượng:</strong> {eq.description}
                    </p>
                    <div className="text-[11px] text-slate-500 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">Đã xử lý:</span> {eq.actionTaken}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Staffing Directives & Action Checklist */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Staffing Allocation */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Đề Xuất Phân Bổ Nhân Lực Giao Ban (Staffing Rostering)
                  </h4>
                  <p className="text-[11px] text-slate-500">AI tự động gợi ý điều động kíp trực giải tỏa điểm nghẽn</p>
                </div>
              </div>

              <div className="space-y-3">
                {briefing.staffingRecommendations.map((staff, idx) => (
                  <div key={idx} className="p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/60 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="space-y-1 text-xs flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {staff.role} → {staff.targetRoom}
                        </span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-[10px]">
                          {staff.shiftTime}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">
                        {staff.rationale}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Checklist of Directives */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Checklist Chỉ Đạo & Nhiệm Vụ Ca Trực Sáng
                  </h4>
                  <p className="text-[11px] text-slate-500">Nội dung Trưởng khoa / Điều dưỡng trưởng chỉ đạo thực hiện ngay</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {briefing.actionChecklist.map((action, idx) => {
                  const isDone = completedActions[idx];
                  return (
                    <div 
                      key={idx}
                      onClick={() => toggleCheck(idx)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center gap-3 ${
                        isDone 
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 line-through text-slate-400 dark:text-slate-500'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 hover:border-blue-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                        isDone 
                          ? 'bg-emerald-600 border-emerald-600 text-white' 
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                      }`}>
                        {isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-semibold select-none">
                        {action}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
