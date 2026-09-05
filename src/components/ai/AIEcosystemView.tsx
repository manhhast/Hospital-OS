import React, { useState } from 'react';
import { 
  Sparkles, Sun, TrendingUp, BookOpen, Wrench, 
  Cpu, Layers, ShieldCheck, Zap, ArrowRight 
} from 'lucide-react';
import { MorningBriefingTab } from './MorningBriefingTab';
import { PredictiveForecastingTab } from './PredictiveForecastingTab';
import { IsoCopilotTab } from './IsoCopilotTab';
import { PredictiveMaintenanceTab } from './PredictiveMaintenanceTab';

interface AIEcosystemViewProps {
  initialTab?: 'briefing' | 'forecasting' | 'iso-copilot' | 'maintenance';
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onNavigateModule?: (module: string) => void;
}

export const AIEcosystemView: React.FC<AIEcosystemViewProps> = ({ 
  initialTab = 'briefing', 
  onShowToast,
  onNavigateModule
}) => {
  const [activeTab, setActiveTab] = useState<'briefing' | 'forecasting' | 'iso-copilot' | 'maintenance'>(initialTab);

  const tabs = [
    {
      id: 'briefing' as const,
      label: 'AI Smart Brief',
      subtitle: 'Báo Cáo Giao Ban 07:00 Sáng',
      icon: Sun,
      color: 'text-amber-500',
      badge: '07:00 AM'
    },
    {
      id: 'forecasting' as const,
      label: 'Predictive Forecasting',
      subtitle: 'Dự Báo Lưu Lượng & Xếp Lịch',
      icon: TrendingUp,
      color: 'text-blue-500',
      badge: 'Time-Series ML'
    },
    {
      id: 'iso-copilot' as const,
      label: 'AI ISO 15189 Copilot',
      subtitle: 'Trợ Lý RAG SOP & Tiêu Chuẩn',
      icon: BookOpen,
      color: 'text-emerald-500',
      badge: 'RAG Pipeline'
    },
    {
      id: 'maintenance' as const,
      label: 'Predictive Maintenance',
      subtitle: 'Bảo Trì Dự Đoán & RUL Máy',
      icon: Wrench,
      color: 'text-rose-500',
      badge: 'RUL Sensor AI'
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Ecosystem Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl border border-indigo-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full text-xs font-black tracking-wide flex items-center gap-1.5 shadow-md shadow-blue-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                HỆ SINH THÁI AI KHOA CẬN LÂM SÀNG
              </span>
              <span className="text-xs text-indigo-300 font-semibold bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-800">
                Gemini 3.7 Flash Engine
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white">
              Trung Tâm Điều Hành Trí Tuệ Nhân Tạo (AI Clinical Diagnostics Hub)
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl">
              Hệ thống tích hợp 4 trụ cột AI thực chiến: Tóm tắt giao ban tự động 07:00, Dự báo lưu lượng chuỗi thời gian, Trợ lý ISO 15189 RAG và Phân tích bảo trì dự đoán thiết bị.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 shrink-0">
            <div className="text-center px-2">
              <div className="text-lg font-black text-white">4 / 4</div>
              <div className="text-[10px] text-slate-300 font-semibold">Trụ cột AI Active</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-2">
              <div className="text-lg font-black text-emerald-400">&lt; 30p</div>
              <div className="text-[10px] text-slate-300 font-semibold">TAT Mục tiêu</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Pillar Tab Buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                isActive
                  ? 'bg-white dark:bg-slate-900 border-blue-500 shadow-md shadow-blue-500/10 ring-2 ring-blue-500/20'
                  : 'bg-white/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 ' + tab.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                    isActive 
                      ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300' 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                </div>

                <div className="mt-3">
                  <h3 className={`text-xs font-black ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                    {tab.label}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                    {tab.subtitle}
                  </p>
                </div>
              </div>

              {isActive && (
                <div className="w-full h-1 bg-blue-600 rounded-full mt-3" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab View Content */}
      <div className="transition-opacity duration-200">
        {activeTab === 'briefing' && (
          <MorningBriefingTab onShowToast={onShowToast} />
        )}
        {activeTab === 'forecasting' && (
          <PredictiveForecastingTab onShowToast={onShowToast} />
        )}
        {activeTab === 'iso-copilot' && (
          <IsoCopilotTab onShowToast={onShowToast} />
        )}
        {activeTab === 'maintenance' && (
          <PredictiveMaintenanceTab onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
};
