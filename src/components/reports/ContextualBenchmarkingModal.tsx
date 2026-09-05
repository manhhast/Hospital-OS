import React from 'react';
import { 
  X, Activity, TrendingUp, AlertTriangle, AlertCircle, CheckCircle2, 
  HelpCircle, ArrowUpRight, ArrowDownRight, Layers, ShieldAlert, Sparkles, Lightbulb
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend 
} from 'recharts';
import { ClinicalTriageResult } from '../../utils/clinicalAnalytics';

interface ContextualBenchmarkingModalProps {
  item: ClinicalTriageResult | null;
  onClose: () => void;
  selectedDay: number;
  selectedMonth: string;
}

export const ContextualBenchmarkingModal: React.FC<ContextualBenchmarkingModalProps> = ({
  item,
  onClose,
  selectedDay,
  selectedMonth
}) => {
  if (!item) return null;

  const isSurgeCritical = item.severity === 'SURGE_CRITICAL';
  const isSurgeModerate = item.severity === 'SURGE_MODERATE';
  const isDrop = item.severity === 'DROP_CRITICAL' || item.severity === 'DROP_MODERATE';

  // Chart data preparing
  const chartData = item.historical30Days.map(d => ({
    dayLabel: `N${d.day}`,
    dayNum: d.day,
    count: d.count,
    bh: d.bh,
    nd: d.nd,
    mean: item.mean,
    upper1_5Sigma: Number((item.mean + 1.5 * item.stdDev).toFixed(1)),
    upper2Sigma: Number((item.mean + 2.0 * item.stdDev).toFixed(1)),
    lower1_5Sigma: Math.max(0, Number((item.mean - 1.5 * item.stdDev).toFixed(1))),
    isCurrentDay: d.day === selectedDay
  }));

  const bhRatio = item.todayCount > 0 ? ((item.todayBH / item.todayCount) * 100).toFixed(1) : '0';
  const ndRatio = item.todayCount > 0 ? ((item.todayND / item.todayCount) * 100).toFixed(1) : '0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-3xl overflow-hidden max-h-[92vh] flex flex-col animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`p-5 text-white flex items-start justify-between gap-3 ${
          isSurgeCritical 
            ? 'bg-gradient-to-r from-rose-900 via-rose-800 to-slate-900' 
            : isSurgeModerate
            ? 'bg-gradient-to-r from-amber-900 via-amber-800 to-slate-900'
            : isDrop
            ? 'bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900'
            : 'bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-900'
        }`}>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-white/20 text-white backdrop-blur-xs uppercase tracking-wider">
                {item.category}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-black/30 text-amber-300 border border-amber-400/40 flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Độ Lệch Chuẩn Z-Score: {item.zScore > 0 ? `+${item.zScore}` : item.zScore}
              </span>
            </div>
            <h3 className="text-xl font-black text-white tracking-wide">
              {item.itemName}
            </h3>
            <p className="text-xs text-slate-200 font-medium">
              Đối soát & Phân tích Đột biến Lâm sàng (Contextual Clinical Benchmarking) • Ngày {selectedDay} - {selectedMonth}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-black/20 hover:bg-black/40 text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-800 dark:text-slate-100">
          
          {/* Key Metrics Quick Comparison Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500 block">Số Ca Hôm Nay</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{item.todayCount}</span>
                <span className="text-xs font-bold text-slate-500">ca</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{item.todayBH} BHYT / {item.todayND} Viện phí</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500 block">Trung Bình 30 Ngày (μ)</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-slate-800 dark:text-slate-200">{item.mean.toFixed(1)}</span>
                <span className="text-xs font-bold text-slate-500">ca/ngày</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Độ lệch chuẩn σ = {item.stdDev.toFixed(1)}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500 block">Biến Động So Chuẩn (%)</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-2xl font-black ${item.pctDiffVsMean >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {item.pctDiffVsMean >= 0 ? `+${item.pctDiffVsMean.toFixed(0)}%` : `${item.pctDiffVsMean.toFixed(0)}%`}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{item.diffVsMean >= 0 ? `+${item.diffVsMean}` : item.diffVsMean} ca so với TB</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500 block">Cơ Cấu Đối Tượng</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-lg font-black text-emerald-600">{bhRatio}%</span>
                <span className="text-xs font-bold text-slate-400">BH</span>
                <span className="text-sm font-bold text-amber-600 ml-1">{ndRatio}%</span>
                <span className="text-xs font-bold text-slate-400">VP</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Tỷ lệ bệnh nhân BHYT / Thu phí</span>
            </div>
          </div>

          {/* Contextual Clinical Reasoning Alert Box */}
          <div className={`p-4 rounded-2xl border-2 space-y-2 ${
            isSurgeCritical
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
              : isSurgeModerate
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
              : isDrop
              ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-100'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
          }`}>
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500 shrink-0" />
              <h4 className="text-sm font-black uppercase tracking-wide">
                GIẢI MÃ NGUYÊN NHÂN LÂM SÀNG & BỐI CẢNH (CLINICAL CONTEXT)
              </h4>
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-relaxed pl-7">
              {item.contextualReason}
            </p>
          </div>

          {/* 30-Day Trend Chart with Reference Bands */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                BIỂU ĐỒ DIỄN BIẾN SỐ CA THEO NGÀY VÀ VÙNG DUNG SAI CHUẨN (±1.5σ)
              </h4>
              <span className="text-[11px] text-slate-500 font-bold">
                Điểm màu đỏ: Ngày {selectedDay} đang chọn
              </span>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="dayLabel" fontSize={10} stroke="#64748b" interval={2} />
                  <YAxis fontSize={10} stroke="#64748b" />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs space-y-1 shadow-lg border border-slate-700">
                            <p className="font-extrabold text-amber-300">Ngày {data.dayNum} - {selectedMonth}</p>
                            <p>• Tổng ca: <b>{data.count}</b> ca ({data.bh} BH, {data.nd} ND)</p>
                            <p>• Mức chuẩn TB (μ): <b>{data.mean.toFixed(1)}</b> ca</p>
                            <p>• Ngưỡng báo động (+1.5σ): <b>{data.upper1_5Sigma}</b> ca</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={item.mean} stroke="#4f46e5" strokeDasharray="4 4" label={{ value: `TB μ (${item.mean.toFixed(1)})`, fill: '#4f46e5', fontSize: 10, position: 'right' }} />
                  <ReferenceLine y={item.mean + 1.5 * item.stdDev} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: `+1.5σ (${(item.mean + 1.5 * item.stdDev).toFixed(1)})`, fill: '#f59e0b', fontSize: 10, position: 'right' }} />
                  
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    name="Số ca thực hiện" 
                    stroke="#3b82f6" 
                    strokeWidth={2.5}
                    fill="#3b82f6" 
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Manager Action Recommendations */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-emerald-600" />
              KHUYẾN NGHỊ ĐIỀU HÀNH DÀNH CHO TRƯỞNG KHOA & ĐIỀU DƯỠNG TRƯỞNG
            </h4>
            <div className="space-y-1.5">
              {item.recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-bold">
            Hệ thống CLS WorkHub 4.0 • Chuẩn hóa Phân tích Lâm sàng
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            Đóng Cửa Sổ
          </button>
        </div>
      </div>
    </div>
  );
};
