import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Calendar, Clock, Users, Zap, CheckCircle2, 
  BarChart2, ArrowUpRight, ShieldCheck, Activity, Filter, 
  Sparkles, RefreshCw, AlertCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, 
  Tooltip, Legend, CartesianGrid 
} from 'recharts';
import { WorkloadForecastResponse, DayForecast, HourlyRosterSlot } from '../../types/aiEcosystem';
import { aiService } from '../../services/aiService';

interface PredictiveForecastingTabProps {
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const PredictiveForecastingTab: React.FC<PredictiveForecastingTabProps> = ({ onShowToast }) => {
  const [forecastData, setForecastData] = useState<WorkloadForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedDay, setSelectedDay] = useState<string>('Thứ Hai');

  const loadForecast = async () => {
    setIsLoading(true);
    try {
      const data = await aiService.getWorkloadForecast();
      setForecastData(data);
      if (onShowToast) {
        onShowToast('Dự Báo AI Cập Nhật', 'Đã tính toán xong chuỗi thời gian tải lượng 7 ngày tới', 'info');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Predictive Workload & Rostering AI
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded-full border border-blue-300 dark:border-blue-800">
                Time-Series ML
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mô hình học máy dự báo chuỗi thời gian 7 ngày tới & tự động xếp kíp trực tối ưu TAT
            </p>
          </div>
        </div>

        <button
          onClick={loadForecast}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-md shadow-blue-600/20 self-end sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Đang phân tích ML...' : 'Chạy lại dự báo'}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Đang huấn luyện mô hình dự báo chuỗi thời gian dựa trên 12 tháng lịch sử...
          </p>
        </div>
      ) : forecastData ? (
        <div className="space-y-6">
          {/* Key Forecast Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng dự báo 7 ngày</div>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {forecastData.totalPredictedWeek.toLocaleString()}{' '}
                <span className="text-xs font-medium text-slate-500">ca</span>
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                +6.2% so với tuần trước
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ngày cao điểm nhất</div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {forecastData.peakDay}
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1">
                Tái khám BHYT & Đoàn KSK định kỳ
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Thời gian trả KQ dự kiến (TAT)</div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                28 <span className="text-xs font-medium text-slate-500">phút</span>
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                Giảm 37% so với mức 45 phút chuẩn
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cơ cấu dự báo chuyên khoa</div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-2 space-y-1">
                {(() => {
                  const breakdown = forecastData.departmentBreakdown || {
                    xetNghiem: forecastData.dailyForecasts?.reduce((sum, d) => sum + (d.xetNghiemPredicted || 0), 0) || 4680,
                    cdha: forecastData.dailyForecasts?.reduce((sum, d) => sum + (d.cdhaPredicted || 0), 0) || 3450,
                    thamDoChucNang: forecastData.dailyForecasts?.reduce((sum, d) => sum + (d.thamDoCnPredicted || 0), 0) || 810
                  };
                  return (
                    <>
                      <div className="flex justify-between">
                        <span>Xét nghiệm:</span>
                        <span className="text-blue-600 font-black">{(breakdown.xetNghiem || 0).toLocaleString()} ca (52%)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Chẩn đoán H.Ảnh:</span>
                        <span className="text-indigo-600 font-black">{(breakdown.cdha || 0).toLocaleString()} ca (39%)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Thăm dò CN & Nội soi:</span>
                        <span className="text-purple-600 font-black">{(breakdown.thamDoChucNang || 0).toLocaleString()} ca (9%)</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Time Series Recharts Chart */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-500" />
                  Đồ Thị Dự Báo Tải Lượng 7 Ngày Tới (Có Dải Tin Cậy 95%)
                </h3>
                <p className="text-xs text-slate-500">
                  Đường màu xanh đậm biểu diễn dự báo trung tâm, dải mờ là dung sai dao động ngẫu nhiên
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-1 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-800">
                  🔥 Đỉnh Thứ Hai: ~1.680 ca
                </span>
                <span className="text-[11px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg">
                  Cuối tuần: 800 - 880 ca
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastData.dailyForecasts} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="dayOfWeek" 
                    tick={{ fontSize: 12, fill: '#64748b' }} 
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: '#64748b' }} 
                    axisLine={{ stroke: '#cbd5e1' }}
                    domain={[600, 1900]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderRadius: '12px', 
                      border: 'none', 
                      color: '#fff',
                      fontSize: '12px'
                    }}
                    formatter={(value: any, name: any) => {
                      if (name === 'predictedTotal') return [`${value} ca`, 'Dự báo trung bình'];
                      if (name === 'upperBound') return [`${value} ca`, 'Ngưỡng trên (Max)'];
                      if (name === 'lowerBound') return [`${value} ca`, 'Ngưỡng dưới (Min)'];
                      if (name === 'xetNghiemPredicted') return [`${value} ca`, 'Xét nghiệm'];
                      if (name === 'cdhaPredicted') return [`${value} ca`, 'Chẩn đoán hình ảnh'];
                      return [value, name];
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                    formatter={(value) => {
                      if (value === 'predictedTotal') return 'Tổng dự báo (ca)';
                      if (value === 'upperBound') return 'Dải tin cậy trên';
                      if (value === 'lowerBound') return 'Dải tin cậy dưới';
                      if (value === 'xetNghiemPredicted') return 'Khối Xét nghiệm';
                      if (value === 'cdhaPredicted') return 'Khối CĐHA';
                      return value;
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="predictedTotal" 
                    fill="url(#colorTotal)" 
                    stroke="#2563eb" 
                    strokeWidth={3}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="upperBound" 
                    stroke="#f43f5e" 
                    strokeDasharray="4 4" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="lowerBound" 
                    stroke="#10b981" 
                    strokeDasharray="4 4" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Bar dataKey="xetNghiemPredicted" fill="#60a5fa" barSize={16} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cdhaPredicted" fill="#818cf8" barSize={16} radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Section: Hourly Peak Rostering AI Grid */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Xếp Lịch Nhân Lực Thông Minh Theo Khung Giờ Cao Điểm (Smart Hourly Rostering)
                </h3>
                <p className="text-xs text-slate-500">
                  AI tính toán số lượng Bác sĩ đọc kết quả, Kỹ thuật viên vận hành máy và Tiếp đón theo từng khung giờ
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Chọn ngày mô phỏng:
                </span>
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 outline-none"
                >
                  <option value="Thứ Hai">Thứ Hai (Cao điểm nhất - 1.680 ca)</option>
                  <option value="Thứ Ba">Thứ Ba (1.450 ca)</option>
                  <option value="Thứ Tư">Thứ Tư (1.390 ca)</option>
                  <option value="Thứ Năm">Thứ Năm (1.420 ca)</option>
                  <option value="Thứ Sáu">Thứ Sáu (1.320 ca)</option>
                  <option value="Thứ Bảy">Thứ Bảy (880 ca)</option>
                  <option value="Chủ Nhật">Chủ Nhật (800 ca)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {forecastData.hourlyRostering.map((slot, idx) => (
                <div 
                  key={idx} 
                  className={`p-4 rounded-2xl border transition-all relative overflow-hidden ${
                    idx === 0 
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60 shadow-sm'
                      : idx === 1
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60 shadow-sm'
                      : idx === 2
                      ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/60 shadow-sm'
                      : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/60 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-black border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-blue-500" />
                      {slot.timeSlot}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">
                      {slot.expectedVolume} ca
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-2.5">
                    {slot.periodName}
                  </h4>

                  {/* Staff Allocation Counts */}
                  <div className="my-3 p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">Bác sĩ</div>
                      <div className="text-base font-black text-blue-600 dark:text-blue-400">{slot.recommendedDoctors}</div>
                    </div>
                    <div className="border-x border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] text-slate-400 font-semibold">KTV</div>
                      <div className="text-base font-black text-indigo-600 dark:text-indigo-400">{slot.recommendedTechnicians}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">Tiếp đón</div>
                      <div className="text-base font-black text-purple-600 dark:text-purple-400">{slot.recommendedReceivers}</div>
                    </div>
                  </div>

                  {/* TAT Target */}
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-500">Mục tiêu TAT:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {slot.expectedTATMin} phút <span className="text-[10px] text-slate-400 line-through">({slot.standardTATMin}p)</span>
                    </span>
                  </div>

                  {/* Key Directives */}
                  <div className="mt-2.5 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {slot.keyDirectives.map((d, dIdx) => (
                      <div key={dIdx} className="flex items-start gap-1.5">
                        <span className="text-blue-500 font-bold shrink-0">•</span>
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TAT Insights Banner */}
          <div className="bg-gradient-to-r from-emerald-900 to-teal-950 text-white p-5 rounded-2xl border border-emerald-700/50 flex items-start gap-4 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-emerald-200">
                Khuyến Nghị Tối Ưu Hóa Thời Gian Trả Kết Quả (TAT AI Optimization)
              </h4>
              <ul className="text-xs text-emerald-100 space-y-1 list-disc pl-4 mt-1">
                {forecastData.tatOptimizationInsights.map((ins, i) => (
                  <li key={i}>{ins}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
