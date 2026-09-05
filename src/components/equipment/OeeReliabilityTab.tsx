import React, { useState } from 'react';
import { 
  Activity, Gauge, Zap, CheckCircle2, AlertTriangle, TrendingUp, 
  Clock, Award, Wrench, ShieldCheck, Filter, Info, Eye, Layers, ArrowUpRight
} from 'lucide-react';
import { EquipmentItem, OeeMetricItem, ReliabilityMetricItem } from '../../types/hospital';
import { calculateEquipmentOEE, calculateEquipmentReliability } from '../../utils/equipmentAnalytics';

interface OeeReliabilityTabProps {
  equipmentList: EquipmentItem[];
  onOpenDetailModal: (equipment: EquipmentItem) => void;
}

export const OeeReliabilityTab: React.FC<OeeReliabilityTabProps> = ({
  equipmentList,
  onOpenDetailModal
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Compute OEE and Reliability for each equipment
  const oeeList: { eq: EquipmentItem; oee: OeeMetricItem; reliability: ReliabilityMetricItem }[] = equipmentList.map(eq => ({
    eq,
    oee: calculateEquipmentOEE(eq),
    reliability: calculateEquipmentReliability(eq)
  }));

  const filteredData = oeeList.filter(item => {
    if (selectedCategory === 'all') return true;
    return item.eq.category === selectedCategory;
  });

  // Calculate department aggregate metrics
  const count = filteredData.length || 1;
  const avgAvailability = Number((filteredData.reduce((sum, item) => sum + item.oee.availability, 0) / count).toFixed(1));
  const avgPerformance = Number((filteredData.reduce((sum, item) => sum + item.oee.performance, 0) / count).toFixed(1));
  const avgQuality = Number((filteredData.reduce((sum, item) => sum + item.oee.quality, 0) / count).toFixed(1));
  const avgOEE = Number(((avgAvailability * avgPerformance * avgQuality) / 10000).toFixed(1));
  const avgMTBF = Math.round(filteredData.reduce((sum, item) => sum + item.reliability.mtbfHours, 0) / count);
  const avgMTTR = Number((filteredData.reduce((sum, item) => sum + item.reliability.mttrHours, 0) / count).toFixed(1));

  const getOeeBadge = (rating: OeeMetricItem['oeeRating']) => {
    switch (rating) {
      case 'World Class':
        return (
          <div className="inline-flex flex-col items-start px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-2xs leading-snug">
            <span className="font-bold text-xs flex items-center gap-1 whitespace-nowrap">
              <span>🌟</span> Đẳng Cấp Quốc Tế
            </span>
            <span className="text-[10.5px] font-medium text-indigo-600/85 dark:text-indigo-400/85 whitespace-nowrap mt-0.5">
              Đạt chuẩn cao (≥85%)
            </span>
          </div>
        );
      case 'Tốt / Đạt chuẩn':
        return (
          <div className="inline-flex flex-col items-start px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs leading-snug">
            <span className="font-bold text-xs flex items-center gap-1 whitespace-nowrap">
              <span>🟢</span> Tốt / Đạt Chuẩn
            </span>
            <span className="text-[10.5px] font-medium text-emerald-600/85 dark:text-emerald-400/85 whitespace-nowrap mt-0.5">
              Tiêu chuẩn tốt (75-84%)
            </span>
          </div>
        );
      case 'Khá / Trung bình':
        return (
          <div className="inline-flex flex-col items-start px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs leading-snug">
            <span className="font-bold text-xs flex items-center gap-1 whitespace-nowrap">
              <span>🟡</span> Khá / Cần Tối Ưu
            </span>
            <span className="text-[10.5px] font-medium text-amber-600/85 dark:text-amber-400/85 whitespace-nowrap mt-0.5">
              Dư địa cải thiện (65-74%)
            </span>
          </div>
        );
      default:
        return (
          <div className="inline-flex flex-col items-start px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-2xs leading-snug">
            <span className="font-bold text-xs flex items-center gap-1 whitespace-nowrap">
              <span>🔴</span> Cần Cải Thiện
            </span>
            <span className="text-[10.5px] font-medium text-rose-600/85 dark:text-rose-400/85 whitespace-nowrap mt-0.5">
              Cảnh báo rủi ro (&lt;65%)
            </span>
          </div>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      {/* Header Info */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Gauge className="w-4 h-4" /> QUẢN TRỊ HIỆU SUẤT THIẾT BỊ NÂNG CAO (OEE & MTBF/MTTR)
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Bộ Chỉ Số Đo Lường Hiệu Suất Tổng Thể & Độ Tin Cậy Thiết Bị
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Đánh giá toàn diện 3 trụ cột: Tính khả dụng (Availability), Hiệu suất vận hành (Performance), và Chất lượng kết quả (Quality) theo chuẩn ISO 15189 và JCI.
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
          >
            <option value="all">Toàn bộ chuyên khoa ({equipmentList.length} máy)</option>
            <option value="Chẩn đoán hình ảnh">Chẩn đoán hình ảnh (CT, MRI, X-Quang)</option>
            <option value="Xét nghiệm">Xét nghiệm (Miễn dịch, Huyết học)</option>
            <option value="Siêu âm">Siêu âm</option>
            <option value="Nội soi">Nội soi tiêu hóa</option>
          </select>
        </div>
      </div>

      {/* KPI Cards: Aggregate OEE and MTBF/MTTR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Department OEE */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl border border-indigo-800/60 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">OEE Toàn Khoa</span>
            <span className="p-2 bg-indigo-500/20 rounded-xl">
              <Gauge className="w-5 h-5 text-indigo-400" />
            </span>
          </div>
          <div className="text-3xl font-black text-white mt-2">
            {avgOEE}%
          </div>
          <div className="mt-2 text-xs text-indigo-200 flex items-center gap-1.5">
            {avgOEE >= 85 ? (
              <span className="text-emerald-400 font-bold">★ Đẳng cấp quốc tế</span>
            ) : avgOEE >= 75 ? (
              <span className="text-emerald-300 font-bold">✓ Đạt mức tốt chuẩn</span>
            ) : (
              <span className="text-amber-300 font-bold">⚡ Cần tối ưu thêm</span>
            )}
            <span>(A × P × Q)</span>
          </div>
        </div>

        {/* Card 2: 3 Pillars (A, P, Q) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">3 Trụ Cột Thành Phần</span>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Khả dụng (A):</span>
              <strong className="text-indigo-600 dark:text-indigo-400">{avgAvailability}%</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Hiệu suất (P):</span>
              <strong className="text-emerald-600 dark:text-emerald-400">{avgPerformance}%</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Chất lượng (Q):</span>
              <strong className="text-sky-600 dark:text-sky-400">{avgQuality}%</strong>
            </div>
          </div>
        </div>

        {/* Card 3: MTBF */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">MTBF Trung Bình</span>
            <span className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Activity className="w-5 h-5" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {avgMTBF.toLocaleString('vi-VN')} <span className="text-sm font-normal text-slate-500">giờ</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            ~{Math.round(avgMTBF / 12)} ngày chạy an toàn giữa 2 sự cố
          </p>
        </div>

        {/* Card 4: MTTR */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">MTTR Trung Bình</span>
            <span className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
              <Wrench className="w-5 h-5" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {avgMTTR} <span className="text-sm font-normal text-slate-500">giờ</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Thời gian trung bình kỹ sư xử lý & khôi phục máy
          </p>
        </div>
      </div>

      {/* World Class Benchmarks Explainer */}
      <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300">
          <Info className="w-4 h-4 text-indigo-500" />
          <span>Thang Đo Chuẩn OEE Quốc Tế:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 font-medium text-indigo-700 dark:text-indigo-300">
            <span className="w-2 h-2 rounded-full bg-indigo-600"></span> <strong>&gt;85%:</strong> World Class (Đẳng cấp xuất sắc)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> <strong>75% - 84%:</strong> Tiêu chuẩn bệnh viện tốt
          </span>
          <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> <strong>65% - 74%:</strong> Khá (Có dư địa tăng công suất)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-300">
            <span className="w-2 h-2 rounded-full bg-red-500"></span> <strong>&lt;65%:</strong> Cần can thiệp bảo trì khẩn
          </span>
        </div>
      </div>

      {/* Equipment Detailed OEE & MTBF Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Bảng Đánh Giá Hiệu Suất Từng Thiết Bị Trong Khoa
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Hiển thị <strong>{filteredData.length}</strong> thiết bị
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300 border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3.5 px-4 min-w-[230px]">Mã & Tên Máy</th>
                <th className="py-3.5 px-4 min-w-[120px]">Khả Dụng (A)</th>
                <th className="py-3.5 px-4 min-w-[120px]">Hiệu Suất (P)</th>
                <th className="py-3.5 px-4 min-w-[120px]">Chất Lượng (Q)</th>
                <th className="py-3.5 px-4 text-center min-w-[100px]">Chỉ Số OEE</th>
                <th className="py-3.5 px-4 min-w-[150px]">MTBF / MTTR</th>
                <th className="py-3.5 px-4 min-w-[190px]">Đánh Giá Chuẩn</th>
                <th className="py-3.5 px-4 text-right min-w-[95px]">Chi Tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filteredData.map(({ eq, oee, reliability }) => (
                <tr key={eq.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  {/* Name & Code */}
                  <td className="py-3.5 px-4 align-middle">
                    <button
                      onClick={() => onOpenDetailModal(eq)}
                      className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors block text-sm leading-snug"
                    >
                      {eq.name}
                    </button>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                      {eq.code} &bull; {eq.room}
                    </div>
                  </td>

                  {/* Availability */}
                  <td className="py-3.5 px-4 align-middle font-semibold">
                    <div className="text-slate-900 dark:text-slate-100 text-sm font-bold">{oee.availability}%</div>
                    <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                      Chạy {oee.runTimeHours}h / {oee.plannedHours}h
                    </div>
                  </td>

                  {/* Performance */}
                  <td className="py-3.5 px-4 align-middle font-semibold">
                    <div className="text-slate-900 dark:text-slate-100 text-sm font-bold">{oee.performance}%</div>
                    <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                      {oee.totalCasesProcessed} ca ({oee.cycleTimePerCaseMinutes}p/ca)
                    </div>
                  </td>

                  {/* Quality */}
                  <td className="py-3.5 px-4 align-middle font-semibold">
                    <div className="text-slate-900 dark:text-slate-100 text-sm font-bold">{oee.quality}%</div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-normal mt-0.5">
                      Đạt chuẩn ISO
                    </div>
                  </td>

                  {/* Overall OEE */}
                  <td className="py-3.5 px-4 align-middle text-center">
                    <div className="inline-flex flex-col items-center justify-center">
                      <span className={`text-base font-black ${
                        oee.oee >= 85 ? 'text-indigo-600 dark:text-indigo-400' :
                        oee.oee >= 75 ? 'text-emerald-600 dark:text-emerald-400' :
                        oee.oee >= 65 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {oee.oee}%
                      </span>
                    </div>
                  </td>

                  {/* MTBF / MTTR */}
                  <td className="py-3.5 px-4 align-middle">
                    <div className="font-mono text-xs text-slate-800 dark:text-slate-200">
                      MTBF: <strong>{reliability.mtbfHours.toLocaleString('vi-VN')}h</strong>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                      MTTR: {reliability.mttrHours}h ({reliability.failureCount} sự cố)
                    </div>
                  </td>

                  {/* Rating badge (Multi-line comfortable card) */}
                  <td className="py-3.5 px-4 align-middle">
                    {getOeeBadge(oee.oeeRating)}
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-4 align-middle text-right">
                    <button
                      onClick={() => onOpenDetailModal(eq)}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl text-xs font-bold transition-all shadow-2xs whitespace-nowrap inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Hồ sơ</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
