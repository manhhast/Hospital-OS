import {
  MorningBriefingData,
  WorkloadForecastResponse,
  ISOCopilotChatMessage,
  PredictiveMaintenanceSummary,
  SmartAssistantMessage,
  TelegramBotStatus,
  TelegramExclusivityReport
} from '../types/aiEcosystem';
import { buildLiveHospitalContext, syncLiveContextToServer } from './aiContextService';
import { storageService } from './storageService';

export const aiService = {
  /**
   * Flagship Smart Virtual Assistant: Synthesizes all real live app data + SOPs via Gemini 4
   */
  async askSmartAssistant(
    question: string,
    history: SmartAssistantMessage[] = [],
    options?: { useWebSearch?: boolean }
  ): Promise<SmartAssistantMessage> {
    const liveContext = buildLiveHospitalContext();
    const currentUser = storageService.getCurrentUser();
    const settings = storageService.getSettings();
    const learnedMemories = storageService.getAssistantMemories();
    const useWebSearch =
      options?.useWebSearch !== undefined
        ? options.useWebSearch
        : settings.aiWebSearchEnabled !== false;

    const response = await fetch('/api/ai/assistant-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        history: history.slice(-8).map(m => ({ sender: m.sender, content: m.content })),
        liveContext,
        learnedMemories,
        useWebSearch,
        userName: currentUser?.name || 'Cán bộ Khoa CLS'
      })
    });

    const json = await response.json();
    if (!response.ok || !json.success || !json.data) {
      throw new Error(json?.error || `Lỗi máy chủ AI (HTTP ${response.status})`);
    }

    const d = json.data;
    let newlyLearnedNote: string | undefined;
    if (d.newlyLearnedMemory && d.newlyLearnedMemory.content) {
      storageService.addAssistantMemory({
        content: d.newlyLearnedMemory.content,
        category: d.newlyLearnedMemory.category || 'fact',
        source: 'auto'
      });
      newlyLearnedNote = d.newlyLearnedMemory.content;
    }

    return {
      id: `ast-${Date.now()}`,
      sender: 'assistant',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      content: d.answer,
      highlightedMetrics: d.highlightedMetrics || [],
      actionChecklist: d.actionChecklist || [],
      dataSourcesUsed: d.dataSourcesUsed || [],
      webSources: Array.isArray(d.webSources) ? d.webSources : [],
      searchQueries: Array.isArray(d.searchQueries) ? d.searchQueries : [],
      usedWebSearch: Boolean(d.usedWebSearch),
      newlyLearnedNote,
      suggestedFollowUps: d.suggestedFollowUps || [],
      modelUsed: d.modelUsed || json.source || 'gemini-4-hydrogen',
      usedLiveContext: Boolean(d.usedLiveContext),
      aiWarning: d.aiWarning
    };
  },

  /**
   * Telegram Bot status & test helpers
   */
  async getTelegramBotStatus(): Promise<TelegramBotStatus | null> {
    try {
      const res = await fetch('/api/telegram/status');
      const json = await res.json();
      return json?.success ? (json.data as TelegramBotStatus) : null;
    } catch {
      return null;
    }
  },

  async testTelegramBot(params: {
    botToken: string;
    defaultChatId?: string;
    enabled?: boolean;
  }): Promise<{
    botUsername?: string;
    botFirstName?: string;
    messageSent: boolean;
    status?: TelegramBotStatus;
  }> {
    const liveContext = buildLiveHospitalContext();
    const res = await fetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: params.botToken,
        defaultChatId: params.defaultChatId || '',
        enabled: params.enabled !== false,
        liveContext
      })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error || 'Không thể kết nối Telegram Bot');
    }
    return {
      botUsername: json.data?.botUsername,
      botFirstName: json.data?.botFirstName,
      messageSent: Boolean(json.data?.messageSent),
      status: json.status
    };
  },

  async detectTelegramChats(botToken: string): Promise<
    Array<{ chatId: string; title: string; type: string; username?: string; lastSeenAt: string }>
  > {
    const res = await fetch('/api/telegram/detect-chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken })
    });
    const rawText = await res.text();
    let json: any = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new Error(`Máy chủ trả về phản hồi không hợp lệ (HTTP ${res.status}). Vui lòng thử lại.`);
    }
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || `Không thể dò danh sách Chat ID từ Telegram (HTTP ${res.status})`);
    }
    return Array.isArray(json.data) ? json.data : [];
  },

  async pauseTelegramPolling(): Promise<TelegramBotStatus | null> {
    const res = await fetch('/api/telegram/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || 'Không thể tạm dừng lắng nghe Telegram');
    }
    return (json.data as TelegramBotStatus) || null;
  },

  async retryTelegramPolling(params?: {
    botToken?: string;
    defaultChatId?: string;
  }): Promise<TelegramBotStatus | null> {
    const liveContext = buildLiveHospitalContext();
    const res = await fetch('/api/telegram/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: params?.botToken,
        defaultChatId: params?.defaultChatId,
        liveContext
      })
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || 'Không thể kết nối lại Telegram Bot');
    }
    return (json.data as TelegramBotStatus) || null;
  },

  async verifyTelegramExclusivity(botToken?: string): Promise<{
    report: TelegramExclusivityReport;
    status?: TelegramBotStatus;
  }> {
    const res = await fetch('/api/telegram/verify-exclusivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken })
    });
    const json = await res.json();
    if (!res.ok || !json?.success || !json?.data) {
      throw new Error(json?.error || 'Không thể kiểm tra trạng thái độc quyền Bot Telegram');
    }
    return {
      report: json.data as TelegramExclusivityReport,
      status: json.status as TelegramBotStatus | undefined
    };
  },

  async syncContextNow(): Promise<boolean> {
    return syncLiveContextToServer(true);
  },

  /**
   * Pillar 1: Generate or retrieve AI Morning Executive Briefing (Real Live Context)
   */
  async generateMorningBriefing(params: {
    reportDate: string;
    totalCases?: number;
    diffPercentage?: number;
    bhytPercentage?: number;
    vienPhiPercentage?: number;
    hotspots?: any[];
    equipmentStatus?: any[];
  }): Promise<MorningBriefingData> {
    const liveContext = buildLiveHospitalContext();

    const response = await fetch('/api/ai/morning-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportDate: params.reportDate,
        yesterdayStats: {
          totalCases: params.totalCases,
          diffPercentage: params.diffPercentage,
          bhytPercentage: params.bhytPercentage,
          vienPhiPercentage: params.vienPhiPercentage
        },
        liveContext
      })
    });

    const json = await response.json();
    if (!response.ok || !json.success || !json.data) {
      throw new Error(json?.error || 'Không thể tổng hợp báo cáo giao ban sáng');
    }

    const d = json.data;
    return {
      id: `brief-${Date.now()}`,
      reportDate: params.reportDate,
      generatedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      headline: d.headline,
      executiveSummary: d.executiveSummary,
      metrics: d.metrics,
      hotspots: d.hotspots || [],
      equipmentIssues: d.equipmentIssues || [],
      staffingRecommendations: d.staffingRecommendations || [],
      actionChecklist: d.actionChecklist || []
    };
  },

  /**
   * Pillar 2: Predictive Workload Forecasting & Rostering (Real Live Context)
   */
  async getWorkloadForecast(): Promise<WorkloadForecastResponse> {
    const liveContext = buildLiveHospitalContext();
    const response = await fetch('/api/ai/workload-forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liveContext })
    });
    const json = await response.json();
    if (!response.ok || !json.success || !json.data) {
      throw new Error(json?.error || 'Không thể tính toán dự báo lưu lượng');
    }
    return json.data;
  },

  /**
   * Pillar 3: ISO 15189 & SOP Copilot (RAG Chat with Real Documents & SOP KB)
   */
  async askISOCopilot(question: string, history: ISOCopilotChatMessage[] = []): Promise<ISOCopilotChatMessage> {
    const liveContext = buildLiveHospitalContext();
    const response = await fetch('/api/ai/iso-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        chatHistory: history.slice(-6),
        liveContext
      })
    });
    const json = await response.json();
    if (!response.ok || !json.success || !json.data) {
      throw new Error(json?.error || 'Không thể tra cứu SOP & ISO 15189');
    }
    return {
      id: `msg-${Date.now()}`,
      sender: 'assistant',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      content: json.data.content,
      references: json.data.references,
      actionChecklist: json.data.actionChecklist,
      warningNote: json.data.warningNote,
      urgencyLevel: json.data.urgencyLevel || 'NORMAL'
    };
  },

  /**
   * Pillar 4: Predictive Maintenance AI (Real Equipment Registry)
   */
  async getPredictiveMaintenanceSummary(): Promise<PredictiveMaintenanceSummary> {
    const liveContext = buildLiveHospitalContext();
    const equipmentItems = storageService.getEquipment();
    const response = await fetch('/api/ai/predictive-maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipmentItems, liveContext })
    });
    const json = await response.json();
    if (!response.ok || !json.success || !json.data) {
      throw new Error(json?.error || 'Không thể phân tích bảo trì dự đoán');
    }
    return json.data;
  }
};
