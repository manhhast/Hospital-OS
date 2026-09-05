import React, { useState, useEffect } from 'react';
import { 
  Wrench, AlertTriangle, ShieldCheck, Cpu, Clock, CheckCircle2, 
  Activity, ArrowUpRight, ShoppingCart, Calendar, RefreshCw, 
  Sparkles, Thermometer, Droplets, Zap, ShieldAlert, ChevronRight
} from 'lucide-react';
import { PredictiveMaintenanceSummary, EquipmentHealthRiskItem } from '../../types/aiEcosystem';
import { aiService } from '../../services/aiService';

interface PredictiveMaintenanceTabProps {
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const PredictiveMaintenanceTab: React.FC<PredictiveMaintenanceTabProps> = ({ onShowToast }) => {
  const [summary, setSummary] = useState<PredictiveMaintenanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'HEALTHY'>('ALL');
  const [orderedParts, setOrderedParts] = useState<Record<string, boolean>>({});

  const loadSummary = async () => {
    setIsLoading(true);
    try {
      const data = await aiService.getPredictiveMaintenanceSummary();
      setSummary(data);
      if (onShowToast) {
        onShowToast('Cập Nhật Sức Khỏe Máy Móc', 'Đã phân tích xong dữ liệu cảm biến & RUL thiết bị', 'info');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleOrderPart = (partName: string) => {
    setOrderedParts(prev => ({ ...prev, [partName]: true }));
    if (onShowToast) {
      onShowToast('Đã Lập Phiếu Đặt Hàng', `Đã tạo yêu cầu mua sắm dự phòng: ${partName}`, 'success');
    }
  };

  const filteredEquipment = summary?.equipmentList.filter(item => {
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'CRITICAL') return item.riskLevel === 'CRITICAL_RISK';
    if (selectedFilter === 'HIGH') return item.riskLevel === 'HIGH_RISK';
    if (selectedFilter === 'HEALTHY') return item.riskLevel === 'HEALTHY';
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20 shrink-0">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                AI Predictive Maintenance (Bảo Trì Dự Đoán)
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 rounded-full border border-rose-300 dark:border-rose-800">
                Cảnh Báo Trước 7-14 Ngày
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Phân tích số ca chạy máy, cảm biến nhiệt độ & dự báo tuổi thọ còn lại (Remaining Useful Life - RUL)
            </p>
          </div>
        </div>

        <button
          onClick={loadSummary}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-md shadow-rose-600/20 self-end sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Đang phân tích...' : 'Quét lại cảm biến'}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Đang phân tích dữ liệu rung chấn, xung phát tia và nhật ký vận hành thiết bị...
          </p>
        </div>
      ) : summary ? (
        <div className="space-y-6">
          {/* 4 Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng máy giám sát</div>
              <div className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
                {summary.totalMonitoredEquipment}{' '}
                <span className="text-xs font-medium text-slate-500">hệ thống</span>
              </div>
              <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
                100% Cận Lâm Sàng
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-rose-200/80 dark:border-rose-900/60 shadow-sm bg-rose-50/20">
              <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Cảnh báo khẩn (RUL &lt; 10 ngày)</div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-2">
                {summary.criticalRiskCount}{' '}
                <span className="text-xs font-bold px-2 py-0.5 bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded-md">
                  Cần xử lý ngay
                </span>
              </div>
              <div className="text-[11px] text-rose-600 font-semibold mt-1">
                Bóng CT-Scanner 128 lát
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 shadow-sm bg-amber-50/20">
              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Nguy cơ cao (RUL &lt; 20 ngày)</div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {summary.highRiskCount}{' '}
                <span className="text-xs font-medium text-slate-500">hệ thống</span>
              </div>
              <div className="text-[11px] text-amber-600 font-semibold mt-1">
                MRI 3.0T & Cobas 6000
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Điểm sức khỏe TB toàn khoa</div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {summary.avgDepartmentHealthScore} <span className="text-xs font-medium text-slate-500">/ 100</span>
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Vận hành tin cậy 82%
              </div>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Lọc theo mức độ rủi ro:</span>
            <button
              onClick={() => setSelectedFilter('ALL')}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition ${
                selectedFilter === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              Tất cả ({summary.totalMonitoredEquipment})
            </button>
            <button
              onClick={() => setSelectedFilter('CRITICAL')}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition ${
                selectedFilter === 'CRITICAL'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              Khẩn cấp ({summary.criticalRiskCount})
            </button>
            <button
              onClick={() => setSelectedFilter('HIGH')}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition ${
                selectedFilter === 'HIGH'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}
            >
              Nguy cơ cao ({summary.highRiskCount})
            </button>
            <button
              onClick={() => setSelectedFilter('HEALTHY')}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition ${
                selectedFilter === 'HEALTHY'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              }`}
            >
              Hoạt động tốt ({summary.healthyCount})
            </button>
          </div>

          {/* Equipment Health Cards List */}
          <div className="space-y-4">
            {filteredEquipment.map((eq) => {
              const isCritical = eq.riskLevel === 'CRITICAL_RISK';
              const isHigh = eq.riskLevel === 'HIGH_RISK';
              const isHealthy = eq.riskLevel === 'HEALTHY';

              return (
                <div
                  key={eq.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 transition-all shadow-sm space-y-4 ${
                    isCritical
                      ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/10'
                      : isHigh
                      ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/10'
                      : 'border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shrink-0 shadow-sm ${
                          isCritical
                            ? 'bg-rose-600 animate-pulse'
                            : isHigh
                            ? 'bg-amber-600'
                            : 'bg-emerald-600'
                        }`}
                      >
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                            {eq.name}
                          </h3>
                          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {eq.code}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Model: <strong>{eq.model}</strong> · {eq.department} · {eq.room}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Xác suất hỏng hóc</div>
                        <div
                          className={`text-lg font-black ${
                            isCritical
                              ? 'text-rose-600 dark:text-rose-400'
                              : isHigh
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {eq.failureProbabilityPct}% Nguy cơ
                        </div>
                      </div>

                      <div className="text-right pl-3 border-l border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Tuổi thọ còn lại (RUL)</div>
                        <div
                          className={`text-lg font-black ${
                            isCritical
                              ? 'text-rose-600 dark:text-rose-400'
                              : isHigh
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {eq.componentRULDays} ngày
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sensor & Operation Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] font-semibold block">Tổng số ca đã chạy</span>
                      <strong className="text-slate-800 dark:text-slate-200">{eq.cumulativeCases.toLocaleString()} ca</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] font-semibold block">Giờ chạy tích lũy</span>
                      <strong className="text-slate-800 dark:text-slate-200">{eq.totalOperatingHours.toLocaleString()} giờ</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] font-semibold block">Cảm biến nhiệt / ẩm</span>
                      <strong className="text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Thermometer className="w-3 h-3 text-rose-500" />
                        {eq.sensorTempC}°C · {eq.sensorHumidityPct}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] font-semibold block">Thời gian hỏng nếu sự cố</span>
                      <strong className="text-rose-600 font-bold">{eq.estimatedDowntimeHoursIfFailed} giờ dừng máy</strong>
                    </div>
                  </div>

                  {/* Component Risk & Recommendation */}
                  <div className="space-y-2">
                    <div className="text-xs">
                      <strong className="text-slate-900 dark:text-slate-100">Linh kiện có rủi ro cao: </strong>
                      <span className="text-rose-700 dark:text-rose-400 font-semibold">{eq.criticalComponent}</span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        Khuyến nghị bảo trì ngăn ngừa từ AI:
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">
                        {eq.recommendedAction}
                      </p>
                    </div>
                  </div>

                  {/* Spare Parts Checklist & Actions */}
                  {eq.partsToOrder && eq.partsToOrder.length > 0 && (
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500">Linh kiện cần dự phòng:</span>
                        {eq.partsToOrder.map((part, pIdx) => {
                          const isOrdered = orderedParts[part];
                          return (
                            <button
                              key={pIdx}
                              onClick={() => handleOrderPart(part)}
                              disabled={isOrdered}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                                isOrdered
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300'
                                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {isOrdered ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Đã yêu cầu: {part}</span>
                                </>
                              ) : (
                                <>
                                  <ShoppingCart className="w-3 h-3 text-slate-500" />
                                  <span>Đặt hàng: {part}</span>
                                </>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => {
                          if (onShowToast) {
                            onShowToast('Lập Lịch Bảo Trì', `Đã chuyển tiếp lịch bảo dưỡng cho kỹ sư TBYT phụ trách ${eq.name}`, 'success');
                          }
                        }}
                        className="px-3 py-1.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 self-end sm:self-auto"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Xếp lịch kỹ sư</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
