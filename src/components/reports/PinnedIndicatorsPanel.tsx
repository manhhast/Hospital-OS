import React, { useState } from 'react';
import { 
  Pin, Sparkles, TrendingUp, AlertTriangle, AlertCircle, CheckCircle2, 
  Settings, ChevronRight, Activity, ArrowUpRight, ArrowDownRight, Layers
} from 'lucide-react';
import { ClinicalTriageResult } from '../../utils/clinicalAnalytics';

interface PinnedIndicatorsPanelProps {
  pinnedResults: ClinicalTriageResult[];
  onOpenBenchmarkingModal: (item: ClinicalTriageResult) => void;
  onOpenPinManager: () => void;
  selectedDay: number;
  selectedMonth: string;
}

export const PinnedIndicatorsPanel: React.FC<PinnedIndicatorsPanelProps> = ({
  pinnedResults,
  onOpenBenchmarkingModal,
  onOpenPinManager,
  selectedDay,
  selectedMonth
}) => {
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'SURGE' | 'DROP'>('ALL');

  const filtered = pinnedResults.filter(item => {
    if (filterSeverity === 'SURGE') return item.severity === 'SURGE_CRITICAL' || item.severity === 'SURGE_MODERATE';
    if (filterSeverity === 'DROP') return item.severity === 'DROP_CRITICAL' || item.severity === 'DROP_MODERATE';
    return true;
  });

  const surgeCount = pinnedResults.filter(i => i.severity === 'SURGE_CRITICAL' || i.severity === 'SURGE_MODERATE').length;
  const dropCount = pinnedResults.filter(i => i.severity === 'DROP_CRITICAL' || i.severity === 'DROP_MODERATE').length;

  return (
    <div className="bg-white dark:bg-gradient-to-br dark:from-indigo-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-white rounded-2xl border border-slate-200/90 dark:border-indigo-500/30 p-4 sm:p-5 shadow-xs dark:shadow-lg space-y-4 transition-colors">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-indigo-800/40 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-400 dark:text-slate-950 dark:border-transparent flex items-center justify-center font-black shadow-xs dark:shadow-md shrink-0">
            <Pin className="w-4 h-4 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black tracking-wide text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                CHỈ SỐ KỸ THUẬT TRỌNG ĐIỂM ĐÃ GHIM (PINNED CLINICAL BENCHMARKS)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-200 border border-indigo-200/80 dark:border-indigo-400/40">
                {pinnedResults.length} Kỹ thuật
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-300 font-medium">
              Giám sát tức thời lưu lượng ca thực hiện so với trung bình 30 ngày chuẩn y khoa (Độ lệch chuẩn & Z-Score)
            </p>
          </div>
        </div>

        {/* Quick Filters & Settings */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200 dark:border-indigo-700/50 text-xs font-bold">
            <button
              onClick={() => setFilterSeverity('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                filterSeverity === 'ALL'
                  ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs border border-slate-200/60 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tất cả ({pinnedResults.length})
            </button>
            <button
              onClick={() => setFilterSeverity('SURGE')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                filterSeverity === 'SURGE'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-700 dark:text-rose-300 hover:bg-rose-50/80 dark:hover:bg-transparent'
              }`}
            >
              <span>🚨 Đột biến</span>
              {surgeCount > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                  filterSeverity === 'SURGE' 
                    ? 'bg-rose-800 text-white' 
                    : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-200'
                }`}>
                  {surgeCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterSeverity('DROP')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                filterSeverity === 'DROP'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-700 dark:text-amber-300 hover:bg-amber-50/80 dark:hover:bg-transparent'
              }`}
            >
              <span>📉 Sụt giảm</span>
              {dropCount > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                  filterSeverity === 'DROP' 
                    ? 'bg-amber-800 text-white' 
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-200'
                }`}>
                  {dropCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={onOpenPinManager}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/90 dark:bg-indigo-600/80 dark:hover:bg-indigo-600 dark:text-white dark:border-indigo-400/30 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
            title="Quản lý danh sách chỉ số ghim"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Quản Lý Ghim</span>
          </button>
        </div>
      </div>

      {/* Grid of Pinned Cards */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-indigo-800/30 text-slate-500 dark:text-slate-400 text-xs">
          Không có chỉ số nào khớp với bộ lọc cảnh báo.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(item => {
            const isSurgeCritical = item.severity === 'SURGE_CRITICAL';
            const isSurgeModerate = item.severity === 'SURGE_MODERATE';
            const isDrop = item.severity === 'DROP_CRITICAL' || item.severity === 'DROP_MODERATE';

            return (
              <div
                key={item.itemId}
                onClick={() => onOpenBenchmarkingModal(item)}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] shadow-xs hover:shadow-md flex flex-col justify-between gap-2.5 group relative overflow-hidden ${
                  isSurgeCritical
                    ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-500/70 hover:border-rose-400 dark:hover:border-rose-400 hover:bg-rose-100/50 dark:hover:bg-rose-900/50 ring-1 ring-rose-200 dark:ring-rose-500/30'
                    : isSurgeModerate
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-500/60 hover:border-amber-400 dark:hover:border-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/40 ring-1 ring-amber-200 dark:ring-amber-500/30'
                    : isDrop
                    ? 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-300 dark:border-sky-500/60 hover:border-sky-400 dark:hover:border-sky-400 hover:bg-sky-100/50 dark:hover:bg-sky-900/40 ring-1 ring-sky-200 dark:ring-sky-500/30'
                    : 'bg-slate-50/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-400 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                {/* Glow pulse for critical surges */}
                {isSurgeCritical && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-ping opacity-75" />
                )}

                {/* Top Info */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded border truncate ${
                      isSurgeCritical
                        ? 'text-rose-800 dark:text-rose-300 bg-rose-100/90 dark:bg-rose-950/80 border-rose-200 dark:border-rose-800/60'
                        : isSurgeModerate
                        ? 'text-amber-800 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-950/80 border-amber-200 dark:border-amber-800/60'
                        : isDrop
                        ? 'text-sky-800 dark:text-sky-300 bg-sky-100/90 dark:bg-sky-950/80 border-sky-200 dark:border-sky-800/60'
                        : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 border-indigo-200 dark:border-indigo-800/60'
                    }`}>
                      {item.category}
                    </span>
                    
                    {/* Visual Triage Badge */}
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                      isSurgeCritical
                        ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50'
                        : isSurgeModerate
                        ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/50'
                        : isDrop
                        ? 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/50'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50'
                    }`}>
                      {isSurgeCritical && <AlertTriangle className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400" />}
                      {isSurgeModerate && <TrendingUp className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />}
                      {isDrop && <ArrowDownRight className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400" />}
                      {!isSurgeCritical && !isSurgeModerate && !isDrop && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />}
                      <span>Z: {item.zScore > 0 ? `+${item.zScore}` : item.zScore}</span>
                    </span>
                  </div>

                  <h4 className="text-xs font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-amber-300 transition-colors line-clamp-1" title={item.itemName}>
                    {item.itemName}
                  </h4>
                </div>

                {/* Numbers Row */}
                <div className="flex items-baseline justify-between pt-1.5 border-t border-slate-200/80 dark:border-slate-700/60">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">Hôm nay (Ngày {selectedDay})</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-black text-slate-900 dark:text-white">
                        {item.todayCount}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-300 font-bold">ca</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-400 font-medium">
                        ({item.todayBH} BH / {item.todayND} ND)
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">TB 30 Ngày</span>
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {item.mean.toFixed(1)}
                      </span>
                      <span className={`text-[10px] font-black ${
                        item.pctDiffVsMean >= 0 
                          ? 'text-emerald-600 dark:text-emerald-400' 
                          : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {item.pctDiffVsMean >= 0 ? `+${item.pctDiffVsMean.toFixed(0)}%` : `${item.pctDiffVsMean.toFixed(0)}%`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer contextual trigger hint */}
                <div className={`flex items-center justify-between text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
                  isSurgeCritical
                    ? 'bg-rose-100/70 border-rose-200 text-rose-800 dark:bg-slate-900/60 dark:border-slate-700/60 dark:text-rose-300'
                    : isSurgeModerate
                    ? 'bg-amber-100/70 border-amber-200 text-amber-800 dark:bg-slate-900/60 dark:border-slate-700/60 dark:text-amber-300'
                    : isDrop
                    ? 'bg-sky-100/70 border-sky-200 text-sky-800 dark:bg-slate-900/60 dark:border-slate-700/60 dark:text-sky-300'
                    : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900/60 dark:border-slate-700/60 dark:text-indigo-300'
                }`}>
                  <span className="truncate max-w-[170px]" title={item.alertTitle}>
                    {item.alertTitle}
                  </span>
                  <span className="flex items-center gap-0.5 text-indigo-600 dark:text-amber-400 shrink-0">
                    Chi tiết <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
