import React, { useState } from 'react';
import { 
  DollarSign, Clock, TrendingUp, BarChart3, PieChart, Sparkles, 
  Lightbulb, ArrowUpRight, Calculator, CheckCircle2, ChevronRight, Layers, Eye
} from 'lucide-react';
import { EquipmentItem, DepreciationMetricItem, OeeMetricItem } from '../../types/hospital';
import { calculateEquipmentDepreciation, calculateEquipmentOEE } from '../../utils/equipmentAnalytics';

interface DepreciationUtilizationTabProps {
  equipmentList: EquipmentItem[];
  onOpenDetailModal: (equipment: EquipmentItem) => void;
}

export const DepreciationUtilizationTab: React.FC<DepreciationUtilizationTabProps> = ({
  equipmentList,
  onOpenDetailModal
}) => {
  const [selectedEqId, setSelectedEqId] = useState<string>(equipmentList[0]?.id || '');
  const [simulatedCasesAdjustment, setSimulatedCasesAdjustment] = useState<number>(0); // -50% to +50%

  // Compute metrics for all equipment
  const data = equipmentList.map(eq => ({
    eq,
    depr: calculateEquipmentDepreciation(eq),
    oee: calculateEquipmentOEE(eq)
  }));

  const activeData = data.find(d => d.eq.id === selectedEqId) || data[0];

  // Adjust simulation
  const baseMonthlyCases = activeData.depr.averageMonthlyCases;
  const simulatedMonthlyCases = Math.max(10, Math.round(baseMonthlyCases * (1 + simulatedCasesAdjustment / 100)));
  const simulatedDeprCostPerCase = Math.round(activeData.depr.monthlyDepreciation / simulatedMonthlyCases);
  const simulatedProfitPerCase = Math.max(0, activeData.depr.averageRevenuePerCase - simulatedDeprCostPerCase);

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      {/* Header Info */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
            <DollarSign className="w-4 h-4" /> QUẢN TRỊ TÀI CHÍNH THIẾT BỊ & TỐI ƯU CÔNG SUẤT PHÒNG MÁY
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Chi Phí Khấu Hao Trên Từng Ca & Phân Bổ Thời Gian Nhàn Rỗi (Run vs Idle Time)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Tự động trích khấu hao tài sản cố định theo phương pháp đường thẳng (Bộ Tài Chính), phân bổ chi phí trên từng ca chụp/xét nghiệm và tối ưu hóa thời gian nhàn rỗi phòng máy.
          </p>
        </div>

        {/* Machine Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:inline">Chọn máy:</span>
          <select
            value={selectedEqId}
            onChange={e => {
              setSelectedEqId(e.target.value);
              setSimulatedCasesAdjustment(0);
            }}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none cursor-pointer"
          >
            {equipmentList.map(eq => (
              <option key={eq.id} value={eq.id}>
                {eq.code} - {eq.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Breakdown for Selected Equipment */}
      {activeData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 & 2: Depreciation Breakdown & Interactive Simulator */}
          <div className="lg:col-span-2 space-y-6">
            {/* Depreciation Summary Card */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {activeData.eq.name}
                  </h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    {activeData.eq.code} &bull; {activeData.eq.room} &bull; Nguyên giá: <strong>{(activeData.depr.purchasePrice).toLocaleString('vi-VN')} VNĐ</strong>
                  </div>
                </div>
                <button
                  onClick={() => onOpenDetailModal(activeData.eq)}
                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Hồ sơ</span>
                </button>
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">Thời Gian Khấu Hao</span>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                    {activeData.depr.depreciationYears} <span className="text-xs font-normal text-slate-500">năm (96T)</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">Khấu Hao Tháng</span>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                    {(activeData.depr.monthlyDepreciation / 1000000).toFixed(1)} <span className="text-xs font-normal text-slate-500">tr/tháng</span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 block">Khấu Hao / 1 Ca</span>
                  <div className="text-lg font-black text-emerald-800 dark:text-emerald-300 mt-1">
                    {(activeData.depr.depreciationCostPerCase).toLocaleString('vi-VN')} <span className="text-xs font-normal text-emerald-600">đ</span>
                  </div>
                </div>

                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-900/60">
                  <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 block">Giá Viện Phí / Ca</span>
                  <div className="text-lg font-black text-indigo-800 dark:text-indigo-300 mt-1">
                    {(activeData.depr.averageRevenuePerCase).toLocaleString('vi-VN')} <span className="text-xs font-normal text-indigo-600">đ</span>
                  </div>
                </div>
              </div>

              {/* Progress & Contribution Ratio */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600 dark:text-slate-400">Tỷ lệ chi phí khấu hao trong cơ cấu giá dịch vụ:</span>
                  <strong className="text-indigo-600 dark:text-indigo-400">{activeData.depr.depreciationPercentage}% viện phí</strong>
                </div>
                <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500" 
                    style={{ width: `${Math.min(100, activeData.depr.depreciationPercentage)}%` }}
                    title={`Chi phí khấu hao: ${activeData.depr.depreciationPercentage}%`}
                  ></div>
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-500" 
                    style={{ width: `${Math.max(0, 100 - activeData.depr.depreciationPercentage)}%` }}
                    title="Chi phí vật tư, nhân lực & thặng dư"
                  ></div>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>🟢 Khấu hao máy: {activeData.depr.depreciationPercentage}%</span>
                  <span>🔵 Chi phí vận hành & nhân công CLS: {(100 - activeData.depr.depreciationPercentage).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Interactive Simulation: Adjust Monthly Patient Volume */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 rounded-2xl border border-indigo-900 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-indigo-400" />
                  <h4 className="font-bold text-sm">Mô Phỏng Tối Ưu Chi Phí Khấu Hao Khi Tăng Số Ca (Economies of Scale)</h4>
                </div>
                <span className="text-xs px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-mono font-bold">
                  {simulatedCasesAdjustment > 0 ? `+${simulatedCasesAdjustment}%` : `${simulatedCasesAdjustment}%`}
                </span>
              </div>

              <p className="text-xs text-slate-300">
                Kéo thanh trượt để dự báo mức giảm chi phí khấu hao trên 1 ca khi tăng công suất tiếp nhận bệnh nhân:
              </p>

              <div className="space-y-2">
                <input
                  type="range"
                  min="-50"
                  max="100"
                  step="5"
                  value={simulatedCasesAdjustment}
                  onChange={e => setSimulatedCasesAdjustment(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>-50% (Giảm tải)</span>
                  <span>0% (Hiện tại: {baseMonthlyCases} ca/tháng)</span>
                  <span>+50% (Tăng trưởng)</span>
                  <span>+100% (Tối đa 2 ca)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                  <div className="text-[11px] text-slate-400">Số ca mô phỏng/tháng:</div>
                  <div className="text-base font-bold text-white mt-1">{simulatedMonthlyCases} ca</div>
                </div>
                <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-700/60">
                  <div className="text-[11px] text-emerald-300">Khấu hao sau tối ưu / ca:</div>
                  <div className="text-base font-bold text-emerald-300 mt-1">{simulatedDeprCostPerCase.toLocaleString('vi-VN')} đ</div>
                </div>
                <div className="p-3 bg-indigo-950/60 rounded-xl border border-indigo-700/60">
                  <div className="text-[11px] text-indigo-300">Biên độ chi phí tiết kiệm:</div>
                  <div className="text-base font-bold text-indigo-300 mt-1">
                    {simulatedCasesAdjustment >= 0 ? `Giảm ${Math.round(activeData.depr.depreciationCostPerCase - simulatedDeprCostPerCase).toLocaleString('vi-VN')} đ/ca` : `Tăng ${Math.round(simulatedDeprCostPerCase - activeData.depr.depreciationCostPerCase).toLocaleString('vi-VN')} đ/ca`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Run Time vs Idle Time Breakdown */}
          <div className="space-y-6">
            {/* Machine Utilization Card */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Phân Bổ Thời Gian 1 Ngày
                </h4>
                <span className="text-xs font-bold text-slate-500 font-mono">
                  Ca {activeData.oee.plannedHours}h/ngày
                </span>
              </div>

              {/* Progress Bar 4 Segments */}
              <div className="space-y-2">
                <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                  {/* Run Time */}
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${(activeData.oee.runTimeHours / activeData.oee.plannedHours) * 100}%` }}
                    title={`Thời gian chạy thực tế: ${activeData.oee.runTimeHours}h`}
                  ></div>
                  {/* Idle Time */}
                  <div 
                    className="h-full bg-amber-400" 
                    style={{ width: `${(activeData.oee.idleTimeHours / activeData.oee.plannedHours) * 100}%` }}
                    title={`Thời gian nhàn rỗi: ${activeData.oee.idleTimeHours}h`}
                  ></div>
                  {/* QC Prep Time */}
                  <div 
                    className="h-full bg-sky-500" 
                    style={{ width: `${(activeData.oee.qcHours / activeData.oee.plannedHours) * 100}%` }}
                    title={`QC & Khởi động: ${activeData.oee.qcHours}h`}
                  ></div>
                  {/* Downtime */}
                  <div 
                    className="h-full bg-rose-500" 
                    style={{ width: `${(activeData.oee.downtimeHours / activeData.oee.plannedHours) * 100}%` }}
                    title={`Sự cố dừng máy: ${activeData.oee.downtimeHours}h`}
                  ></div>
                </div>

                {/* Legend list */}
                <div className="space-y-2 text-xs pt-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200">
                    <span className="flex items-center gap-1.5 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Run Time (Chạy phát tia/đo):
                    </span>
                    <strong>{activeData.oee.runTimeHours}h ({Math.round((activeData.oee.runTimeHours / activeData.oee.plannedHours) * 100)}%)</strong>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                    <span className="flex items-center gap-1.5 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Idle Time (Nhàn rỗi chờ BN):
                    </span>
                    <strong>{activeData.oee.idleTimeHours}h ({Math.round((activeData.oee.idleTimeHours / activeData.oee.plannedHours) * 100)}%)</strong>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200">
                    <span className="flex items-center gap-1.5 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span> QC / Chuẩn bị mẫu:
                    </span>
                    <strong>{activeData.oee.qcHours}h ({Math.round((activeData.oee.qcHours / activeData.oee.plannedHours) * 100)}%)</strong>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200">
                    <span className="flex items-center gap-1.5 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Downtime (Dừng sự cố):
                    </span>
                    <strong>{activeData.oee.downtimeHours}h ({Math.round((activeData.oee.downtimeHours / activeData.oee.plannedHours) * 100)}%)</strong>
                  </div>
                </div>
              </div>

              {/* Optimization Recommendation Box */}
              <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-200">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span>Đề Xuất Tối Ưu Công Suất:</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                  Máy có tỷ lệ <strong>Idle Time {Math.round((activeData.oee.idleTimeHours / activeData.oee.plannedHours) * 100)}%</strong>, tập trung cao điểm vào khung giờ <strong>13:00 - 14:30</strong>. Đề xuất Ban Chủ Nhiệm điều phối lịch chụp bệnh nhân nội trú từ Khoa Cấp cứu & Thần kinh vào khung giờ này để giảm tải áp lực cho buổi sáng.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Equipment Depreciation Comparison Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Bảng Tổng Hợp Chi Phí Khấu Hao Toàn Khoa
          </h3>
          <span className="text-xs text-slate-400">Đơn vị tiền tệ: VNĐ</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">Mã & Thiết Bị</th>
                <th className="p-3.5">Nguyên Giá (VNĐ)</th>
                <th className="p-3.5">Khung KH</th>
                <th className="p-3.5">Khấu Hao Tháng</th>
                <th className="p-3.5">Số Ca TB / Tháng</th>
                <th className="p-3.5">Khấu Hao / 1 Ca</th>
                <th className="p-3.5">Viện Phí Thu / Ca</th>
                <th className="p-3.5">% Khấu Hao / Giá Thu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {data.map(({ eq, depr }) => (
                <tr 
                  key={eq.id} 
                  onClick={() => setSelectedEqId(eq.id)}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${selectedEqId === eq.id ? 'bg-indigo-50/50 dark:bg-indigo-950/30 font-semibold' : ''}`}
                >
                  <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                    {eq.name}
                    <div className="text-[11px] text-slate-400 font-mono font-normal">{eq.code}</div>
                  </td>
                  <td className="p-3.5 font-mono">{(depr.purchasePrice).toLocaleString('vi-VN')} đ</td>
                  <td className="p-3.5">{depr.depreciationYears} năm</td>
                  <td className="p-3.5 font-mono font-semibold text-slate-800 dark:text-slate-200">{(depr.monthlyDepreciation).toLocaleString('vi-VN')} đ</td>
                  <td className="p-3.5 font-bold text-indigo-600 dark:text-indigo-400">{depr.averageMonthlyCases} ca</td>
                  <td className="p-3.5 font-bold text-emerald-600 dark:text-emerald-400 font-mono">{(depr.depreciationCostPerCase).toLocaleString('vi-VN')} đ</td>
                  <td className="p-3.5 font-mono">{(depr.averageRevenuePerCase).toLocaleString('vi-VN')} đ</td>
                  <td className="p-3.5 font-bold">
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {depr.depreciationPercentage}%
                    </span>
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
