import crypto from "crypto";
import express from "express";
import path from "path";
import dotenv from "dotenv";
import { ThinkingLevel } from "@google/genai";
import {
  BUILTIN_SOP_KB,
  askHospitalAssistant,
  generateGeminiResponse,
  generateLiveMorningBriefing,
  getGeminiClient,
} from "./server/assistantEngine";
import { telegramManager } from "./server/telegramBot";
import {
  isSessionSystemAdmin,
  loadStoredTelegramSettingsFromDb,
  mergeSheetConfigIntoSettingsDbIfMissing,
  registerPostgresSyncRoutes,
  requireAdminAuth,
  requireAppAuth,
  saveTelegramConfigToDb,
} from "./server/postgresSync";
import {
  registerScheduledAlertRoutes,
  startScheduledAlertsEngine,
  stopScheduledAlertsEngine,
  triggerScheduledAlertsCatchUp,
} from "./server/scheduledAlerts";

function getRequestHostLabel(req: express.Request): string {
  const fwd = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = String(req.get("host") || "").trim();
  return fwd || host;
}

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.set("trust proxy", 1);
app.use(express.json({ limit: "12mb" }));
registerPostgresSyncRoutes(app);
registerScheduledAlertRoutes(app);

// Health Check API
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    telegram: telegramManager.getStatus(),
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// LIVE DATA CONTEXT SYNC & TELEGRAM BOT Q&A
// ==========================================
app.post("/api/assistant/sync-context", requireAppAuth, async (req, res) => {
  try {
    telegramManager.updateHostLabel(getRequestHostLabel(req));
    const { liveContext, telegramConfig } = req.body || {};
    if (liveContext) {
      telegramManager.updateLiveContext(liveContext);
      if (liveContext.settings && typeof liveContext.settings === "object") {
        void mergeSheetConfigIntoSettingsDbIfMissing(liveContext.settings);
      }
    }

    const callerIsAdmin = await isSessionSystemAdmin(req);
    if (callerIsAdmin && telegramConfig && typeof telegramConfig === "object") {
      const existingDelivery = telegramManager.getDeliveryConfig();
      const incomingToken = String(telegramConfig.botToken || "").trim();
      const effectiveToken =
        incomingToken.length > 10 ? incomingToken : existingDelivery.botToken || "";
      const effectiveChatId =
        String(telegramConfig.defaultChatId || "").trim() ||
        existingDelivery.defaultChatId ||
        "";
      if (effectiveToken) {
        telegramManager.configure({
          botToken: effectiveToken,
          defaultChatId: effectiveChatId,
          enabled:
            telegramConfig.enabled !== undefined
              ? Boolean(telegramConfig.enabled)
              : existingDelivery.enabled,
        });
      }
    }

    triggerScheduledAlertsCatchUp();
    res.json({
      success: true,
      telegram: telegramManager.getStatus(),
      telegramLearnedMemories: telegramManager.getLearnedMemories(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to sync context",
    });
  }
});

app.get("/api/telegram/status", requireAppAuth, (req, res) => {
  telegramManager.updateHostLabel(getRequestHostLabel(req));
  res.json({
    success: true,
    data: telegramManager.getStatus(),
  });
});

app.post("/api/telegram/config", requireAdminAuth, async (req, res) => {
  try {
    telegramManager.updateHostLabel(getRequestHostLabel(req));
    const session = (req as any).pgSession;
    const { botToken, clearToken, defaultChatId, enabled, liveContext } = req.body || {};
    if (liveContext && typeof liveContext === "object") {
      telegramManager.updateLiveContext(liveContext);
    }

    const saved = await saveTelegramConfigToDb({
      botToken: typeof botToken === "string" ? botToken : undefined,
      clearToken: Boolean(clearToken),
      defaultChatId: typeof defaultChatId === "string" ? defaultChatId : undefined,
      qaEnabled: enabled !== false,
      actorId: session?.userId || "USR-ADMIN",
      actorName: session?.name || "Admin",
    });

    telegramManager.configure({
      botToken: saved.effectiveToken,
      defaultChatId: saved.defaultChatId,
      enabled: saved.enabled,
    });

    res.json({
      success: true,
      hasBotToken: Boolean(saved.effectiveToken),
      tokenHint: saved.effectiveToken.length >= 8 ? `••••${saved.effectiveToken.slice(-6)}` : "",
      updatedAtMs: saved.updatedAtMs,
      status: telegramManager.getStatus(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || "Không thể lưu cấu hình Telegram Bot",
    });
  }
});

app.post("/api/telegram/test", requireAdminAuth, async (req, res) => {
  try {
    telegramManager.updateHostLabel(getRequestHostLabel(req));
    const session = (req as any).pgSession;
    const { botToken, defaultChatId, liveContext, enabled } = req.body || {};
    if (liveContext) {
      telegramManager.updateLiveContext(liveContext);
    }
    const cleanIncoming = typeof botToken === "string" ? botToken.trim() : "";
    const effectiveToken =
      cleanIncoming.length > 10 ? cleanIncoming : telegramManager.getDeliveryConfig().botToken || "";
    const result = await telegramManager.testConnection(effectiveToken, defaultChatId);
    if (effectiveToken) {
      await saveTelegramConfigToDb({
        botToken: effectiveToken,
        defaultChatId: String(defaultChatId || ""),
        qaEnabled: enabled !== false,
        actorId: session?.userId || "USR-ADMIN",
        actorName: session?.name || "Admin",
      }).catch(() => {});
      telegramManager.configure(
        {
          botToken: effectiveToken,
          defaultChatId: String(defaultChatId || ""),
          enabled: enabled !== false,
        },
        true
      );
      await telegramManager.waitForPollSettled(3200);
    }
    res.json({
      success: true,
      data: result,
      status: telegramManager.getStatus(),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error?.message || "Không thể kết nối Telegram Bot",
      status: telegramManager.getStatus(),
    });
  }
});

app.post("/api/telegram/pause", requireAdminAuth, async (req, res) => {
  try {
    telegramManager.updateHostLabel(getRequestHostLabel(req));
    const status = await telegramManager.pausePolling();
    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || "Không thể tạm dừng lắng nghe Telegram",
    });
  }
});

app.post("/api/telegram/retry", requireAdminAuth, async (req, res) => {
  try {
    telegramManager.updateHostLabel(getRequestHostLabel(req));
    const { botToken, defaultChatId, liveContext } = req.body || {};
    if (liveContext) {
      telegramManager.updateLiveContext(liveContext);
    }
    if (typeof botToken === "string" && botToken.trim().length > 10) {
      telegramManager.configure(
        {
          botToken: botToken.trim(),
          defaultChatId: String(defaultChatId || ""),
          enabled: true,
        },
        true
      );
      await telegramManager.waitForPollSettled(3200);
    } else {
      await telegramManager.retryPolling(true);
    }
    res.json({
      success: true,
      data: telegramManager.getStatus(),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error?.message || "Không thể kết nối lại Telegram Bot",
      data: telegramManager.getStatus(),
    });
  }
});

app.post("/api/telegram/verify-exclusivity", requireAdminAuth, async (req, res) => {
  try {
    telegramManager.updateHostLabel(getRequestHostLabel(req));
    const { botToken } = req.body || {};
    const report = await telegramManager.verifyBotExclusivity(botToken);
    res.json({
      success: true,
      data: report,
      status: telegramManager.getStatus(),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error?.message || "Không thể kiểm tra độc quyền Telegram Bot",
      status: telegramManager.getStatus(),
    });
  }
});

app.post("/api/telegram/detect-chats", requireAdminAuth, async (req, res) => {
  try {
    const { botToken } = req.body || {};
    const chats = await telegramManager.detectRecentChats(botToken);
    res.json({
      success: true,
      data: chats,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error?.message || "Không thể dò Chat ID từ Telegram",
    });
  }
});

app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
    if (expectedSecret) {
      const provided = String(req.headers["x-telegram-bot-api-secret-token"] || "").trim();
      const expectedDigest = crypto.createHash("sha256").update(expectedSecret, "utf8").digest();
      const providedDigest = crypto.createHash("sha256").update(provided, "utf8").digest();
      if (!provided || !crypto.timingSafeEqual(expectedDigest, providedDigest)) {
        return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
      }
    }

    const body = req.body;
    const isValidUpdate =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (typeof body.update_id === "number" ||
        Boolean(
          body.message || body.edited_message || body.channel_post || body.callback_query
        ));
    if (!isValidUpdate) {
      return res.status(400).json({ ok: false, error: "Invalid Telegram update payload" });
    }

    if (!telegramManager.getStatus().configured) {
      return res.status(200).json({ ok: true, ignored: "bot_not_configured" });
    }

    await telegramManager.handleIncomingUpdate(body);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(200).json({ ok: true, warning: error?.message });
  }
});

// ==========================================
// SMART HOSPITAL VIRTUAL ASSISTANT (CHAT)
// ==========================================
app.post("/api/ai/assistant-chat", requireAppAuth, async (req, res) => {
  try {
    const { question, history, liveContext, userName, learnedMemories, useWebSearch } = req.body || {};
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập câu hỏi." });
    }
    const effectiveContext = liveContext || telegramManager.getLiveContext();
    if (liveContext) {
      telegramManager.updateLiveContext(liveContext);
    }

    const result = await askHospitalAssistant({
      question: String(question).trim(),
      history: Array.isArray(history) ? history : [],
      liveContext: effectiveContext,
      learnedMemories: Array.isArray(learnedMemories) ? learnedMemories : undefined,
      useWebSearch: typeof useWebSearch === "boolean" ? useWebSearch : undefined,
      userName: userName || "Cán bộ Khoa CLS",
      channel: "web",
    });

    res.json({
      success: true,
      data: result,
      source: result.modelUsed,
    });
  } catch (error: any) {
    console.error("Error in /api/ai/assistant-chat:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Lỗi xử lý Trợ lý Ảo AI",
    });
  }
});

// ==========================================
// PILLAR 1: AI MORNING BRIEFING GENERATOR
// ==========================================
app.post("/api/ai/morning-briefing", requireAppAuth, async (req, res) => {
  try {
    const { reportDate, yesterdayStats, liveContext } = req.body || {};
    const effectiveContext = liveContext || telegramManager.getLiveContext();
    if (liveContext) {
      telegramManager.updateLiveContext(liveContext);
    }

    const result = await generateLiveMorningBriefing({
      reportDate: reportDate || new Date().toISOString().split("T")[0],
      liveContext: effectiveContext,
      fallbackStats: yesterdayStats,
    });

    return res.json({
      success: true,
      source: result.source,
      data: result.data,
    });
  } catch (error: any) {
    console.error("Error in /api/ai/morning-briefing:", error);
    res.status(500).json({ success: false, error: error?.message || "Internal AI Error" });
  }
});

// ==========================================
// PILLAR 2: PREDICTIVE WORKLOAD & ROSTERING
// ==========================================
app.post("/api/ai/workload-forecast", requireAppAuth, async (req, res) => {
  try {
    const { liveContext } = req.body || {};
    const effectiveContext = liveContext || telegramManager.getLiveContext();
    if (liveContext) {
      telegramManager.updateLiveContext(liveContext);
    }

    const weekdayAvgs: Array<{ dayOfWeek: string; avgTotal: number; sampleDays: number }> =
      effectiveContext?.caseReports?.weekdayAverages || [];
    const latestDay = effectiveContext?.caseReports?.latestRecordedDay;

    // Derive baseline per day from actual Google Sheet history when available
    const baseAvg =
      weekdayAvgs.filter((w) => w.avgTotal > 0).length > 0
        ? Math.round(
            weekdayAvgs
              .filter((w) => w.avgTotal > 0)
              .reduce((sum, w) => sum + w.avgTotal, 0) /
              weekdayAvgs.filter((w) => w.avgTotal > 0).length
          )
        : latestDay?.totalCases || 0;

    // Compute real category ratios from active year's monthly data
    const monthlyTotals = effectiveContext?.caseReports?.monthlyTotals || [];
    let cdhaShare = 0.38;
    let xnShare = 0.52;
    let tdcnShare = 0.1;

    if (monthlyTotals.length > 0) {
      let sumTotal = 0;
      let sumCdha = 0;
      let sumXn = 0;
      let sumTdcn = 0;
      monthlyTotals.forEach((m: any) => {
        sumTotal += m.totalCases || 0;
        (m.byCategory || []).forEach((c: any) => {
          const catLower = String(c.category || "").toLowerCase();
          if (catLower.includes("xét nghiệm")) sumXn += c.total || 0;
          else if (catLower.includes("x quang") || catLower.includes("ct") || catLower.includes("mri")) sumCdha += c.total || 0;
          else sumTdcn += c.total || 0;
        });
      });
      if (sumTotal > 0) {
        cdhaShare = sumCdha / sumTotal;
        xnShare = sumXn / sumTotal;
        tdcnShare = Math.max(0, 1 - cdhaShare - xnShare);
      }
    }

    const orderedWeekdays = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
    const baseDate = new Date();
    const dailyForecasts = orderedWeekdays.map((dow, idx) => {
      const matched = weekdayAvgs.find((w) => w.dayOfWeek === dow);
      const isWeekend = dow === "Thứ Bảy" || dow === "Chủ Nhật";
      const predictedTotal =
        matched && matched.avgTotal > 0
          ? matched.avgTotal
          : baseAvg > 0
          ? Math.round(baseAvg * (isWeekend ? 0.6 : dow === "Thứ Hai" ? 1.15 : 1.0))
          : 0;
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + idx + 1);
      const dateStr = d.toISOString().split("T")[0];
      const delta = Math.round(predictedTotal * 0.08);
      return {
        date: dateStr,
        dayOfWeek: dow,
        isWeekend,
        predictedTotal,
        lowerBound: Math.max(0, predictedTotal - delta),
        upperBound: predictedTotal + delta,
        cdhaPredicted: Math.round(predictedTotal * cdhaShare),
        xetNghiemPredicted: Math.round(predictedTotal * xnShare),
        thamDoCnPredicted: Math.max(
          0,
          predictedTotal - Math.round(predictedTotal * cdhaShare) - Math.round(predictedTotal * xnShare)
        ),
        surgeRiskFactor:
          predictedTotal > baseAvg * 1.1
            ? ("HIGH" as const)
            : predictedTotal > baseAvg * 0.8
            ? ("MEDIUM" as const)
            : ("LOW" as const),
        weatherOrEventContext:
          matched && matched.sampleDays > 0
            ? `Tính từ trung bình ${matched.sampleDays} ngày ${dow} thực tế đã ghi nhận`
            : baseAvg > 0
            ? "Ước tính từ dữ liệu lịch sử gần nhất"
            : "Chưa có dữ liệu Google Sheet đồng bộ",
      };
    });

    const totalPredictedWeek = dailyForecasts.reduce((s, d) => s + d.predictedTotal, 0);
    const peakItem = dailyForecasts.reduce(
      (best, cur) => (cur.predictedTotal > best.predictedTotal ? cur : best),
      dailyForecasts[0]
    );
    const staffCount = effectiveContext?.staff?.totalCount || 12;
    const peakAvgDay = peakItem?.predictedTotal || baseAvg || 100;

    const fallbackData = {
      forecastRange: "7 ngày tiếp theo (Dựa trên số liệu thực tế)",
      totalPredictedWeek,
      peakDay: `${peakItem.dayOfWeek} (~${peakItem.predictedTotal.toLocaleString("vi-VN")} ca)`,
      dailyForecasts,
      hourlyRostering: [
        {
          timeSlot: "07:30 - 09:30",
          periodName: "Cao điểm sáng 1 - Lấy mẫu & Khám ngoại trú",
          expectedVolume: Math.round(peakAvgDay * 0.36),
          recommendedDoctors: Math.max(2, Math.round(staffCount * 0.25)),
          recommendedTechnicians: Math.max(3, Math.round(staffCount * 0.45)),
          recommendedReceivers: 2,
          expectedTATMin: 26,
          standardTATMin: 45,
          keyDirectives: [
            "Ưu tiên giải tỏa khu vực có lưu lượng lớn nhất theo số liệu thực tế",
            "Bác sĩ duyệt kết quả song song trên LIS/PACS ngay khi KTV hoàn tất",
          ],
        },
        {
          timeSlot: "09:30 - 11:30",
          periodName: "Cao điểm sáng 2 - Chẩn đoán hình ảnh & Trả kết quả",
          expectedVolume: Math.round(peakAvgDay * 0.3),
          recommendedDoctors: Math.max(2, Math.round(staffCount * 0.25)),
          recommendedTechnicians: Math.max(3, Math.round(staffCount * 0.4)),
          recommendedReceivers: 2,
          expectedTATMin: 28,
          standardTATMin: 50,
          keyDirectives: [
            "Tập trung trả kết quả đúng giờ hẹn khám ngoại trú buổi sáng",
            "Duy trì luồng ưu tiên STAT cho các ca cấp cứu",
          ],
        },
        {
          timeSlot: "13:30 - 16:30",
          periodName: "Ca chiều - Nội trú, Thủ thuật & Hội chẩn",
          expectedVolume: Math.round(peakAvgDay * 0.24),
          recommendedDoctors: Math.max(1, Math.round(staffCount * 0.18)),
          recommendedTechnicians: Math.max(2, Math.round(staffCount * 0.3)),
          recommendedReceivers: 1,
          expectedTATMin: 24,
          standardTATMin: 40,
          keyDirectives: [
            "Thực hiện các kỹ thuật chuyên sâu, đối soát số liệu cuối ngày",
            "Bàn giao rõ danh sách máy móc/cảnh báo sang kíp trực",
          ],
        },
        {
          timeSlot: "16:30 - 07:30 (Hôm sau)",
          periodName: "Ca trực Cấp cứu & Nội trú 24/7",
          expectedVolume: Math.round(peakAvgDay * 0.1),
          recommendedDoctors: 1,
          recommendedTechnicians: 2,
          recommendedReceivers: 1,
          expectedTATMin: 18,
          standardTATMin: 30,
          keyDirectives: [
            "Đảm bảo thiết bị cấp cứu (CT, X-quang, Sinh hóa/Huyết học) luôn sẵn sàng",
          ],
        },
      ],
      departmentBreakdown: {
        cdha: dailyForecasts.reduce((s, d) => s + d.cdhaPredicted, 0),
        xetNghiem: dailyForecasts.reduce((s, d) => s + d.xetNghiemPredicted, 0),
        thamDoChucNang: dailyForecasts.reduce((s, d) => s + d.thamDoCnPredicted, 0),
      },
      tatOptimizationInsights:
        totalPredictedWeek > 0
          ? [
              `Dự báo tổng lưu lượng tuần tới khoảng ${totalPredictedWeek.toLocaleString("vi-VN")} ca dựa trên trung bình theo thứ trong tuần từ Google Sheet thực tế.`,
              `Ngày dự kiến cao điểm nhất là ${peakItem.dayOfWeek} (~${peakItem.predictedTotal.toLocaleString("vi-VN")} ca), nên bố trí tối đa nhân lực khung 07:30 - 11:30.`,
            ]
          : [
              "Hiện chưa đủ dữ liệu số ca theo ngày để lập chuỗi dự báo. Hãy đồng bộ Google Sheet Báo cáo Giao ban để AI tự động tính toán dự báo chính xác.",
            ],
    };

    const ai = getGeminiClient();
    if (ai && effectiveContext && totalPredictedWeek > 0) {
      try {
        const systemInstruction = `Bạn là Chuyên gia Tối ưu hóa Vận hành Y tế. Dựa trên số liệu trung bình theo thứ thực tế của Khoa Cận Lâm Sàng dưới đây, hãy tạo 2-3 nhận xét tối ưu hóa TAT & phân bổ nhân sự ngắn gọn.
Dữ liệu dự báo tính toán từ số liệu thực: ${JSON.stringify({
          totalPredictedWeek,
          peakDay: fallbackData.peakDay,
          departmentBreakdown: fallbackData.departmentBreakdown,
          staffCount,
          overloadedRooms: (effectiveContext?.rooms?.items || []).filter((r: any) => r.utilizationRate >= 85),
        })}
Trả về JSON: { "tatOptimizationInsights": ["...", "..."] }`;

        const { text, model } = await generateGeminiResponse(ai, {
          contents: "Phân tích và trả về khuyến nghị tối ưu hóa TAT dạng JSON.",
          systemInstruction,
          responseMimeType: "application/json",
          thinkingLevel: ThinkingLevel.LOW,
        });
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.tatOptimizationInsights) && parsed.tatOptimizationInsights.length > 0) {
          fallbackData.tatOptimizationInsights = parsed.tatOptimizationInsights;
        }
        return res.json({ success: true, data: fallbackData, source: model });
      } catch {
        // Return computed real-data forecast
      }
    }

    return res.json({
      success: true,
      source: "live-data-engine",
      data: fallbackData,
    });
  } catch (error: any) {
    console.error("Error in /api/ai/workload-forecast:", error);
    res.status(500).json({ success: false, error: error?.message || "Internal AI Error" });
  }
});

// ==========================================
// PILLAR 3: ISO 15189 & SOP COPILOT (RAG AI)
// ==========================================
app.post("/api/ai/iso-copilot", requireAppAuth, async (req, res) => {
  try {
    const { question, liveContext } = req.body || {};
    const effectiveContext = liveContext || telegramManager.getLiveContext();
    if (liveContext) {
      telegramManager.updateLiveContext(liveContext);
    }

    const ai = getGeminiClient();
    const docsList = effectiveContext?.documents?.items || [];
    const docsDigest =
      docsList.length > 0
        ? `\nHỒ SƠ TÀI LIỆU / SOP HIỆN CÓ TRONG ỨNG DỤNG (${docsList.length} tài liệu):\n` +
          docsList
            .map(
              (d: any) =>
                `- [${d.code || d.docType}] ${d.title} (Phiên bản: ${d.version}, Hạn: ${d.expirationDate || "Không thời hạn"}${d.isExpired ? " - ĐÃ HẾT HẠN" : ""}) ${d.note ? `| Ghi chú: ${d.note}` : ""}`
            )
            .join("\n")
        : "";

    if (ai) {
      try {
        const systemInstruction = `Bạn là "AI ISO & SOP Copilot" - Trợ lý chuyên trách Tiêu chuẩn ISO 15189:2022, An toàn bức xạ và Quy trình Thao tác Chuẩn (SOP) của Khoa Cận Lâm Sàng.
Hãy dựa vào KHO TÀI LIỆU SOP NỘI BỘ và DANH SÁCH HỒ SƠ THỰC TẾ TRONG ỨNG DỤNG để giải đáp chính xác:
${BUILTIN_SOP_KB}
${docsDigest}

Trả về JSON:
{
  "content": "Lời giải đáp chi tiết...",
  "references": [
    {
      "sopCode": "Mã SOP",
      "isoClause": "Điều khoản ISO liên quan",
      "title": "Tên quy trình",
      "category": "XÉT NGHIỆM|CĐHA|NỘI SOI|AN TOÀN BỨC XẠ|KIỂM SOÁT NHIỄM KHUẨN|QUẢN LÝ THIẾT BỊ",
      "effectiveDate": "2025-01-01"
    }
  ],
  "actionChecklist": ["Bước 1: ...", "Bước 2: ..."],
  "warningNote": "Lưu ý an toàn...",
  "urgencyLevel": "URGENT|NORMAL|HIGH_RISK"
}`;

        const { text, model } = await generateGeminiResponse(ai, {
          contents: `Câu hỏi của nhân viên: "${question}"`,
          systemInstruction,
          responseMimeType: "application/json",
          thinkingLevel: ThinkingLevel.LOW,
        });

        const parsed = JSON.parse(text);
        if (parsed && parsed.content) {
          return res.json({ success: true, data: parsed, source: model });
        }
      } catch {
        // fallback below
      }
    }

    const qLower = String(question || "").toLowerCase();
    let sampleResp = {
      content: `Theo tiêu chuẩn ISO 15189:2022 và kho hồ sơ Khoa Cận Lâm Sàng (hiện lưu trữ ${docsList.length} tài liệu), nhân viên cần tuân thủ đúng mã SOP và quy định thời gian trả kết quả của khoa.`,
      references: [
        {
          sopCode: "SOP-CLS-QC-01",
          isoClause: "ISO 15189:2022 Điều 7.3.7",
          title: "Tiêu chuẩn thời gian trả kết quả xét nghiệm khẩn (STAT TAT)",
          category: "XÉT NGHIỆM",
          effectiveDate: "2025-01-01",
        },
      ],
      actionChecklist: [
        "1. Kiểm tra mã hiệu SOP hiệu lực mới nhất trong phân hệ Hồ Sơ & Quy Trình ISO",
        "2. Tuân thủ đúng định mức TAT khẩn (Troponin <= 30p, ABG <= 15p)",
        "3. Ghi nhận và báo ngay giá trị nguy hiểm (Critical Value) cho khoa lâm sàng",
      ],
      warningNote: "Luôn sử dụng phiên bản SOP còn hiệu lực mới nhất trong kho hồ sơ khoa.",
      urgencyLevel: "NORMAL" as "NORMAL" | "URGENT" | "HIGH_RISK",
    };

    if (qLower.includes("tràn") || qLower.includes("hóa chất") || qLower.includes("cobas")) {
      sampleResp = {
        content: `Quy trình xử lý sự cố tràn đổ hóa chất được thực hiện theo SOP-CLS-XN-04 (ISO 15189:2022 Điều 6.4). Lập tức cách ly hiện trường và sử dụng bộ Spill Kit chuyên dụng.`,
        references: [
          {
            sopCode: "SOP-CLS-XN-04",
            isoClause: "ISO 15189:2022 Điều 6.4",
            title: "Quy trình xử lý sự cố tràn đổ hóa chất & chất thải nguy hại",
            category: "XÉT NGHIỆM",
            effectiveDate: "2025-01-01",
          },
        ],
        actionChecklist: [
          "Bước 1: Cách ly bán kính 2 mét, bật thông gió tối đa.",
          "Bước 2: Đeo đầy đủ PPE cấp 2 (găng nitrile dày, kính bảo hộ, khẩu trang N95, áo choàng).",
          "Bước 3: Dùng bộ Spill Kit phủ quây tròn từ ngoài viền vào tâm vệt tràn.",
          "Bước 4: Thu gom vào túi vàng nguy hại hóa học, khử khuẩn bằng Presept 0.5% hoặc cồn 70°.",
          "Bước 5: Lập biên bản BM-SOP-04-02 gửi ĐDT và Phòng QLCL trong vòng 2 giờ.",
        ],
        warningNote: "Tuyệt đối không dùng giẻ lau thông thường hoặc xịt nước trực tiếp vào hóa chất.",
        urgencyLevel: "HIGH_RISK",
      };
    }

    return res.json({ success: true, source: "live-data-engine", data: sampleResp });
  } catch (error: any) {
    console.error("Error in /api/ai/iso-copilot:", error);
    res.status(500).json({ success: false, error: error?.message || "Internal AI Error" });
  }
});

// ==========================================
// PILLAR 4: PREDICTIVE MAINTENANCE AI
// ==========================================
app.post("/api/ai/predictive-maintenance", requireAppAuth, async (req, res) => {
  try {
    const { equipmentItems, liveContext } = req.body || {};
    const effectiveContext = liveContext || telegramManager.getLiveContext();
    if (liveContext) {
      telegramManager.updateLiveContext(liveContext);
    }

    const rawEq: any[] =
      Array.isArray(equipmentItems) && equipmentItems.length > 0
        ? equipmentItems
        : effectiveContext?.equipment?.items || [];

    const todayMs = Date.now();
    const mappedList = rawEq.map((eq: any) => {
      const nextMaintMs = eq.nextMaintenanceDate ? Date.parse(eq.nextMaintenanceDate) : NaN;
      const calibMs = eq.calibrationExpiry ? Date.parse(eq.calibrationExpiry) : NaN;
      const radMs = eq.radiationSurveyExpiry ? Date.parse(eq.radiationSurveyExpiry) : NaN;

      const minDueDays = [nextMaintMs, calibMs, radMs]
        .filter((t) => !Number.isNaN(t))
        .map((t) => Math.round((t - todayMs) / (1000 * 60 * 60 * 24)));

      const soonestDays = minDueDays.length > 0 ? Math.min(...minDueDays) : 90;

      let riskLevel: "CRITICAL_RISK" | "HIGH_RISK" | "MODERATE_RISK" | "HEALTHY" = "HEALTHY";
      let failureProbabilityPct = 12;
      let healthScore = 92;

      if (eq.isLockedOut || eq.status === "Sự cố hỏng hóc" || soonestDays < 0) {
        riskLevel = "CRITICAL_RISK";
        failureProbabilityPct = 82;
        healthScore = 40;
      } else if (eq.status === "Cần bảo trì" || eq.status === "Đang hiệu chuẩn" || soonestDays <= 15) {
        riskLevel = "HIGH_RISK";
        failureProbabilityPct = 62;
        healthScore = 62;
      } else if (soonestDays <= 35) {
        riskLevel = "MODERATE_RISK";
        failureProbabilityPct = 36;
        healthScore = 76;
      }

      const lastMaintMs = eq.lastMaintenanceDate ? Date.parse(eq.lastMaintenanceDate) : NaN;
      const daysSinceLastMaintenance = !Number.isNaN(lastMaintMs)
        ? Math.max(0, Math.round((todayMs - lastMaintMs) / (1000 * 60 * 60 * 24)))
        : 30;

      return {
        id: eq.id,
        name: eq.name,
        code: eq.code,
        model: eq.model || "Chưa cập nhật",
        department: eq.category || "Khoa CLS",
        room: eq.room || "Chưa phân phòng",
        installedYear: eq.yearOfManufacture || 2022,
        totalOperatingHours: Math.max(200, daysSinceLastMaintenance * 14),
        cumulativeCases: Math.max(100, daysSinceLastMaintenance * 35),
        daysSinceLastMaintenance,
        sensorTempC: 22.5,
        sensorHumidityPct: 52,
        failureProbabilityPct,
        healthScore,
        riskLevel,
        criticalComponent:
          eq.lockoutReason ||
          (soonestDays < 0
            ? `Đã quá hạn kiểm tra/hiệu chuẩn ${Math.abs(soonestDays)} ngày`
            : soonestDays <= 30
            ? `Sắp đến hạn bảo trì/hiệu chuẩn sau ${soonestDays} ngày`
            : "Vận hành bình thường theo lịch định kỳ"),
        componentRULDays: Math.max(1, soonestDays),
        predictedFailureWindow:
          soonestDays < 0 ? "Quá hạn — Cần xử lý ngay" : soonestDays <= 15 ? `${soonestDays} ngày tới` : "> 30 ngày",
        recommendedAction:
          riskLevel === "CRITICAL_RISK"
            ? `Ưu tiên xử lý ngay cho ${eq.name} (${eq.room}). Liên hệ KTV phụ trách: ${eq.assignedTechnician || "TBYT"}.`
            : riskLevel === "HIGH_RISK"
            ? `Lên lịch bảo trì / hiệu chuẩn trong ${Math.max(1, soonestDays)} ngày tới.`
            : "Duy trì theo dõi và bảo dưỡng định kỳ theo SOP.",
        partsToOrder: [],
        estimatedDowntimeHoursIfFailed: riskLevel === "CRITICAL_RISK" ? 24 : 8,
      };
    });

    const criticalRiskCount = mappedList.filter((e) => e.riskLevel === "CRITICAL_RISK").length;
    const highRiskCount = mappedList.filter((e) => e.riskLevel === "HIGH_RISK").length;
    const healthyCount = mappedList.filter((e) => e.riskLevel === "HEALTHY").length;
    const avgHealth =
      mappedList.length > 0
        ? Math.round(mappedList.reduce((s, e) => s + e.healthScore, 0) / mappedList.length)
        : 100;

    const computedSummary = {
      totalMonitoredEquipment: mappedList.length,
      criticalRiskCount,
      highRiskCount,
      healthyCount,
      avgDepartmentHealthScore: avgHealth,
      urgentPartsAlertsCount: criticalRiskCount + highRiskCount,
      equipmentList: mappedList.sort((a, b) => a.healthScore - b.healthScore),
    };

    return res.json({
      success: true,
      source: "live-data-engine",
      data: computedSummary,
    });
  } catch (error: any) {
    console.error("Error in /api/ai/predictive-maintenance:", error);
    res.status(500).json({ success: false, error: error?.message || "Internal AI Error" });
  }
});

// Vite Middleware setup for Development vs Production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[CLS WorkHub Full-Stack Server] running on http://0.0.0.0:${PORT}`);
    void (async () => {
      try {
        const storedTg = await loadStoredTelegramSettingsFromDb();
        if (storedTg && storedTg.botToken && storedTg.enabled && !telegramManager.getStatus().configured) {
          telegramManager.configure(storedTg, false);
        }
      } catch {
        // ignore startup Telegram autoload error
      } finally {
        startScheduledAlertsEngine();
      }
    })();
  });

  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[CLS WorkHub] Received ${signal}, closing Telegram polling & HTTP server...`);
    stopScheduledAlertsEngine();
    try {
      await telegramManager.shutdown();
    } catch {
      // ignore shutdown error
    }
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
}

startServer();
