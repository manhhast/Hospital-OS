import React, { useState } from 'react';
import {
  Sparkles, Sun, TrendingUp, BookOpen, Wrench, Bot
} from 'lucide-react';
import { SmartAssistantTab } from './SmartAssistantTab';
import { MorningBriefingTab } from './MorningBriefingTab';
import { PredictiveForecastingTab } from './PredictiveForecastingTab';
import { IsoCopilotTab } from './IsoCopilotTab';
import { PredictiveMaintenanceTab } from './PredictiveMaintenanceTab';

export type AIEcosystemTabId = 'assistant' | 'briefing' | 'forecasting' | 'iso-copilot' | 'maintenance';

interface AIEcosystemViewProps {
  initialTab?: AIEcosystemTabId;
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onNavigateModule?: (module: string) => void;
}

export const AIEcosystemView: React.FC<AIEcosystemViewProps> = ({
  initialTab = 'assistant',
  onShowToast,
  onNavigateModule
}) => {
  const [activeTab, setActiveTab] = useState<AIEcosystemTabId>(initialTab);

  const tabs = [
    {
      id: 'assistant' as const,
      label: 'Trợ Lý Ảo Thông Minh',
      subtitle: 'Hỏi Đáp Tổng Hợp Dữ Liệu Thực',
      icon: Bot,
      color: 'text-indigo-600',
      badge: 'Live Data + Telegram'
    },
    {
      id: 'briefing' as const,
      label: 'AI Smart Brief',
      subtitle: 'Báo Cáo Giao Ban 07:00 Sáng',
      icon: Sun,
      color: 'text-amber-500',
      badge: 'Giao ban'
    },
    {
      id: 'forecasting' as const,
      label: 'Dự Báo Lưu Lượng',
      subtitle: 'Chuỗi Thời Gian & Xếp Kíp Trực',
      icon: TrendingUp,
      color: 'text-blue-500',
      badge: 'Time-Series'
    },
    {
      id: 'iso-copilot' as const,
      label: 'AI ISO 15189 Copilot',
      subtitle: 'Tra Cứu SOP & Tiêu Chuẩn',
      icon: BookOpen,
      color: 'text-emerald-500',
      badge: 'SOP / ISO'
    },
    {
      id: 'maintenance' as const,
      label: 'Bảo Trì Dự Đoán',
      subtitle: 'Sức Khỏe & Hạn Kiểm Chuẩn Máy',
      icon: Wrench,
      color: 'text-rose-500',
      badge: 'RUL Thiết bị'
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Ecosystem Header Banner */}
      <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-sky-50/80 dark:bg-gradient-to-r dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 text-slate-800 dark:text-white p-6 rounded-3xl border border-blue-200/70 dark:border-indigo-500/20 shadow-xs dark:shadow-xl relative overflow-hidden transition-colors">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-400/10 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full text-xs font-black tracking-wide flex items-center gap-1.5 shadow-xs shadow-blue-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                TRỢ LÝ ẢO &amp; HỆ SINH THÁI AI CLS
              </span>
              <span className="text-xs text-indigo-700 dark:text-indigo-300 font-bold bg-white/90 dark:bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 shadow-2xs">
                Gemini 4 AI Engine
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              Trợ Lý Ảo Điều Hành Khoa Cận Lâm Sàng (Web &amp; Telegram Q&amp;A)
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl font-normal leading-relaxed">
              Tổng hợp trực tiếp dữ liệu số ca Google Sheet, thiết bị, phòng, nhân sự, lịch trực, công việc và hồ sơ ISO 15189 để trả lời chính xác mọi câu hỏi trên ứng dụng và qua Telegram Bot.
            </p>
          </div>
        </div>
      </div>

      {/* 5 Tab Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                isActive
                  ? 'bg-white dark:bg-slate-900 border-blue-500 shadow-md shadow-blue-500/10 ring-2 ring-blue-500/20'
                  : 'bg-white/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 ' + tab.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md truncate ${
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                </div>

                <div className="mt-2.5">
                  <h3 className={`text-xs font-black ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                    {tab.label}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                    {tab.subtitle}
                  </p>
                </div>
              </div>

              {isActive && (
                <div className="w-full h-1 bg-blue-600 rounded-full mt-2.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab View Content */}
      <div className="transition-opacity duration-200">
        {activeTab === 'assistant' && (
          <SmartAssistantTab onShowToast={onShowToast} onNavigateModule={onNavigateModule} />
        )}
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
