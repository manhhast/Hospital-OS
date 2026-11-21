import React, { useState } from 'react';
import {
  Sun, TrendingUp, BookOpen, Wrench, Bot, ShieldCheck
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
      color: 'text-[#1976D2]',
      badge: 'Web & Telegram'
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
      badge: '7 ngày tới'
    },
    {
      id: 'iso-copilot' as const,
      label: 'AI ISO 15189 Copilot',
      subtitle: 'Tra Cứu SOP & Tiêu Chuẩn',
      icon: BookOpen,
      color: 'text-emerald-500',
      badge: 'SOP & ISO'
    },
    {
      id: 'maintenance' as const,
      label: 'Bảo Trì Dự Đoán',
      subtitle: 'Sức Khỏe & Hạn Kiểm Chuẩn Máy',
      icon: Wrench,
      color: 'text-rose-500',
      badge: 'Thiết bị'
    }
  ];

  return (
    <div className="space-y-4 w-full pb-8">
      {/* Compact HIS Clinical AI Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-2xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#EAF4FF] dark:bg-sky-950/60 border border-[#1976D2]/20 flex items-center justify-center text-[#1976D2] dark:text-sky-400 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#1976D2] dark:text-sky-400">
              <span>Trợ lý điều hành khoa</span>
              <span aria-hidden="true" className="text-[#DFE7F0]">·</span>
              <span>Dữ liệu trực tiếp &amp; Telegram</span>
            </div>
            <h1 className="text-lg font-bold text-[#263445] dark:text-white tracking-tight mt-0.5">
              Trợ Lý Ảo Điều Hành Khoa Cận Lâm Sàng
            </h1>
            <p className="text-xs text-[#718096] dark:text-slate-400 max-w-3xl leading-relaxed mt-0.5">
              Tổng hợp trực tiếp số liệu ca bệnh theo ngày và từng kỹ thuật từ Google Sheet, thiết bị, nhân sự, lịch trực và hồ sơ ISO 15189 trên cả Web và Telegram Bot.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EAF4FF] dark:bg-sky-950/40 text-[#155A9C] dark:text-sky-300 border border-[#1976D2]/25 text-[11px] font-semibold shrink-0 self-start md:self-center">
          <ShieldCheck className="w-3.5 h-3.5 text-[#1976D2]" />
          <span>Clinical Decision Support</span>
        </div>
      </div>

      {/* 5 Tab Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                isActive
                  ? 'bg-[#EAF4FF]/60 dark:bg-slate-900 border-[#1976D2] shadow-2xs ring-1 ring-[#1976D2]/20'
                  : 'bg-white dark:bg-slate-900/85 border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2]/50 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-[#1976D2] text-white' : 'bg-[#F4F7FB] dark:bg-slate-800 ' + tab.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[11px] font-semibold truncate ${
                    isActive
                      ? 'text-[#155A9C] dark:text-sky-400'
                      : 'text-[#718096] dark:text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                </div>

                <div className="mt-2">
                  <h3 className={`text-xs font-bold ${isActive ? 'text-[#155A9C] dark:text-sky-400' : 'text-[#263445] dark:text-slate-200'}`}>
                    {tab.label}
                  </h3>
                  <p className="text-[11px] text-[#718096] mt-0.5 line-clamp-1">
                    {tab.subtitle}
                  </p>
                </div>
              </div>

              {isActive && (
                <div className="w-full h-0.5 bg-[#1976D2] rounded-full mt-2" />
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
