import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export const VALID_PRIMARY_MODEL = "gemini-4-hydrogen";
export const VALID_FALLBACK_MODEL = "gemini-3.1-flash-lite";

let cachedClient: GoogleGenAI | null = null;
let cachedKeyUsed = "";

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }
  if (!cachedClient || cachedKeyUsed !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    cachedKeyUsed = apiKey;
  }
  return cachedClient;
}

export async function generateGeminiResponse(
  ai: GoogleGenAI,
  options: {
    contents: any;
    systemInstruction: string;
    responseMimeType?: string;
    thinkingLevel?: ThinkingLevel;
  }
): Promise<{ text: string; model: string }> {
  const candidates = [VALID_PRIMARY_MODEL, VALID_FALLBACK_MODEL];
  let lastError: any = null;

  for (const model of candidates) {
    try {
      const config: Record<string, any> = {
        systemInstruction: options.systemInstruction,
      };
      if (options.responseMimeType) {
        config.responseMimeType = options.responseMimeType;
      }
      if (options.thinkingLevel && model === VALID_PRIMARY_MODEL) {
        config.thinkingConfig = { thinkingLevel: options.thinkingLevel };
      }

      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config,
      });

      const text = response?.text;
      if (text && text.trim().length > 0) {
        return { text, model };
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("Không thể nhận phản hồi từ mô hình Gemini.");
}

export interface AssistantHighlightMetric {
  label: string;
  value: string;
  tone?: "blue" | "emerald" | "amber" | "rose" | "indigo" | "slate";
}

export interface AssistantChatResult {
  answer: string;
  highlightedMetrics: AssistantHighlightMetric[];
  actionChecklist: string[];
  dataSourcesUsed: string[];
  suggestedFollowUps: string[];
  modelUsed: string;
  usedLiveContext: boolean;
  aiWarning?: string;
}

// Shared built-in SOP knowledge base
export const BUILTIN_SOP_KB = `
KHO QUY TRÌNH THAO TÁC CHUẨN (SOP) & ISO 15189:2022 KHOA CẬN LÂM SÀNG:
1. [SOP-CLS-XN-04] Xử lý tràn đổ hóa chất & chất thải nguy hại (Cobas 6000, Architect, Sysmex):
   - Bước 1: Cách ly bán kính 2m, bật thông gió, đeo PPE cấp 2 (găng nitrile dày, kính, N95, áo choàng).
   - Bước 2: Dùng bộ Spill Kit phủ từ ngoài vào trong.
   - Bước 3: Thu gom túi vàng "CHẤT THẢI NGUY HẠI HÓA HỌC", khử khuẩn Presept 0.5% / cồn 70°.
   - Bước 4: Lập biên bản BM-SOP-04-02 gửi ĐDT & QLCL trong 2 giờ.
2. [SOP-CLS-QC-01] Thời gian trả kết quả khẩn (STAT TAT - ISO 15189:2022 Điều 7.3.7 & QĐ 2429/QĐ-BYT):
   - Troponin T hs / Troponin I khẩn: <= 30 phút.
   - Khí máu động mạch (ABG): <= 15 phút.
   - Đông máu cơ bản (PT/INR, aPTT): <= 45 phút.
   - Đường huyết / Điện giải cấp cứu: <= 20 phút.
   - X-quang ngực thẳng cấp cứu: <= 20 phút.
   - CT sọ não Code Stroke: <= 25 phút.
3. [SOP-CLS-CDHA-02] An toàn bức xạ & Chụp CT có tiêm cản quang:
   - Kiểm tra eGFR >= 45 mL/min/1.73m2 (ngoại trú) hoặc >= 30 (cấp cứu có hội chẩn).
   - Khai thác dị ứng, hen, Metformin (ngưng 48h sau tiêm).
   - Ký cam kết BM-CDHA-02, sẵn sàng hộp chống sốc, test áp lực kim 18G/20G bằng NaCl 0.9%.
4. [SOP-CLS-ISO-03] Nội kiểm IQC theo quy tắc Westgard:
   - Chạy 2 mức lúc 07:00 hàng ngày. Cảnh báo: 1-2s. Vi phạm dừng máy: 1-3s, 2-2s, R-4s, 4-1s, 10x.
`;

function formatLiveContextDigest(liveContext: any): string {
  if (!liveContext) {
    return "Chưa nhận được ảnh chụp dữ liệu trực tiếp từ trình duyệt ứng dụng.";
  }

  const cr = liveContext.caseReports || {};
  const eq = liveContext.equipment || {};
  const rm = liveContext.rooms || {};
  const st = liveContext.staff || {};
  const sh = liveContext.shifts || {};
  const tk = liveContext.tasks || {};
  const mt = liveContext.meetings || {};
  const doc = liveContext.documents || {};
  const sy = liveContext.syncHistory || {};

  return JSON.stringify(
    {
      currentDateIso: liveContext.currentDateIso,
      generatedAt: liveContext.generatedAt,
      currentUser: liveContext.currentUser,
      caseReports: {
        activeYear: cr.activeYear,
        knownYears: cr.knownYears,
        yearlyTotals: cr.yearlyTotals,
        monthlyTotals: cr.monthlyTotals,
        latestRecordedDay: cr.latestRecordedDay,
        previousRecordedDay: cr.previousRecordedDay,
        recentRecordedDays: (cr.recentRecordedDays || []).slice(0, 10),
        topServicesActiveYear: (cr.topServicesActiveYear || []).slice(0, 12),
        weekdayAverages: cr.weekdayAverages,
      },
      equipment: {
        totalCount: eq.totalCount,
        statusCounts: eq.statusCounts,
        alertItems: eq.alertItems,
        items: (eq.items || []).slice(0, 40),
      },
      rooms: {
        departmentsCount: rm.departmentsCount,
        departments: rm.departments,
        roomsCount: rm.roomsCount,
        items: (rm.items || []).slice(0, 45),
      },
      staff: {
        totalCount: st.totalCount,
        items: (st.items || []).slice(0, 60),
        pendingLeaveRequests: st.pendingLeaveRequests,
        expiringCertificates: st.expiringCertificates,
      },
      shifts: {
        pendingSwapCount: sh.pendingSwapCount,
        todayAndUpcoming: (sh.todayAndUpcoming || []).slice(0, 35),
      },
      tasks: {
        totalCount: tk.totalCount,
        byStatus: tk.byStatus,
        overdueCount: tk.overdueCount,
        activeItems: (tk.activeItems || []).slice(0, 30),
      },
      meetingsAndAnnouncements: {
        items: (mt.items || []).slice(0, 10),
        weeklyPlans: (mt.weeklyPlans || []).slice(0, 10),
        recentAnnouncements: (mt.recentAnnouncements || []).slice(0, 8),
      },
      documentsAndSOPs: {
        totalCount: doc.totalCount,
        expiredCount: doc.expiredCount,
        items: (doc.items || []).slice(0, 30),
      },
      syncHistory: sy,
    },
    null,
    0
  );
}

function normalizeText(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function buildDeterministicAssistantAnswer(
  question: string,
  liveContext: any,
  aiWarning?: string
): AssistantChatResult {
  const q = normalizeText(question);

  if (!liveContext) {
    return {
      answer:
        "Hiện máy chủ chưa nhận được dữ liệu đồng bộ từ ứng dụng web. Vui lòng mở ứng dụng CLS WorkHub trên trình duyệt để đồng bộ dữ liệu trực tiếp, sau đó đặt câu hỏi lại.",
      highlightedMetrics: [],
      actionChecklist: ["Mở ứng dụng CLS WorkHub để tự động đẩy dữ liệu lên máy chủ trợ lý."],
      dataSourcesUsed: [],
      suggestedFollowUps: [
        "Tổng số ca bệnh gần nhất là bao nhiêu?",
        "Danh sách máy móc đang cần bảo trì hoặc sắp hết hạn hiệu chuẩn?",
      ],
      modelUsed: "live-data-engine",
      usedLiveContext: false,
      aiWarning,
    };
  }

  const cr = liveContext.caseReports || {};
  const eq = liveContext.equipment || {};
  const rm = liveContext.rooms || {};
  const st = liveContext.staff || {};
  const sh = liveContext.shifts || {};
  const tk = liveContext.tasks || {};
  const doc = liveContext.documents || {};
  const mt = liveContext.meetings || {};
  const sy = liveContext.syncHistory || {};

  const parts: string[] = [];
  const metrics: AssistantHighlightMetric[] = [];
  const actions: string[] = [];
  const sources: string[] = [];

  const asksAboutCases =
    /(so ca|luot|kham|sieu am|noi soi|x quang|x-quang|dien tim|xet nghiem|bhyt|nhan dan|bao cao|giao ban|thang|nam|hom qua|hom nay|tong quan)/.test(
      q
    );
  const asksAboutEquipment =
    /(may|thiet bi|bao tri|hieu chuan|kiem chuan|su co|hong|khoa an toan|atbx|kiem xa|han)/.test(q);
  const asksAboutRooms = /(phong|bo phan|cong suat|qua tai)/.test(q);
  const asksAboutStaffOrShift =
    /(nhan su|nhan vien|bac si|ktv|ky thuat vien|ai truc|lich truc|ca truc|nghi phep|chung chi|doi ca)/.test(
      q
    );
  const asksAboutTasks = /(cong viec|task|viec|tre han|qua han|ke hoach|hop|thong bao)/.test(q);
  const asksAboutSOP = /(sop|iso|15189|quy trinh|troponin|tat|tran do|hoa chat|westgard|can quang)/.test(
    q
  );
  const asksAboutSync = /(dong bo|google sheet|sai lech|firebase|lich su)/.test(q);

  const includeOverview =
    !asksAboutCases &&
    !asksAboutEquipment &&
    !asksAboutRooms &&
    !asksAboutStaffOrShift &&
    !asksAboutTasks &&
    !asksAboutSOP &&
    !asksAboutSync;

  if (asksAboutCases || includeOverview) {
    sources.push("Báo cáo số ca Google Sheet");
    const latest = cr.latestRecordedDay;
    const prev = cr.previousRecordedDay;
    const activeYTotal = (cr.yearlyTotals || []).find((y: any) => y.year === cr.activeYear);
    const monthsInActiveYear = (cr.monthlyTotals || []).filter((m: any) => m.year === cr.activeYear);

    if (latest) {
      metrics.push({
        label: `Ngày gần nhất (${latest.dateLabel})`,
        value: `${latest.totalCases.toLocaleString("vi-VN")} ca`,
        tone: "blue",
      });
      metrics.push({
        label: "BHYT / Nhân dân",
        value: `${latest.bhytCases} / ${latest.nhanDanCases}`,
        tone: "emerald",
      });

      const catLines = (latest.byCategory || [])
        .map((c: any) => `  • ${c.category}: ${c.total} ca (BH: ${c.bh}, ND: ${c.nd})`)
        .join("\n");

      let diffNote = "";
      if (prev) {
        const diff = latest.totalCases - prev.totalCases;
        const sign = diff >= 0 ? "+" : "";
        diffNote = ` (${sign}${diff} ca so với ngày ${prev.dateLabel}: ${prev.totalCases} ca)`;
      }

      parts.push(
        `📊 **Số liệu ca thực hiện gần nhất (${latest.dayOfWeek}, ${latest.dateLabel}):**\n` +
          `- Tổng cộng: **${latest.totalCases.toLocaleString("vi-VN")} ca**${diffNote} (BHYT: ${latest.bhytCases}, Nhân dân: ${latest.nhanDanCases}).\n` +
          (catLines ? `${catLines}` : "")
      );
    } else {
      parts.push(
        `📊 **Báo cáo số ca:** Hiện chưa có ngày nào có số liệu dương trong năm ${cr.activeYear || "hiện tại"}.`
      );
    }

    if (monthsInActiveYear.length > 0) {
      const mLines = monthsInActiveYear
        .map(
          (m: any) =>
            `  • ${m.monthKey}/${m.year}: ${m.totalCases.toLocaleString("vi-VN")} ca (${m.recordedDaysCount} ngày có số liệu)`
        )
        .join("\n");
      parts.push(
        `📅 **Tổng hợp năm ${cr.activeYear} (${activeYTotal?.totalCases?.toLocaleString("vi-VN") || 0} ca):**\n${mLines}`
      );
      if (activeYTotal) {
        metrics.push({
          label: `Lũy kế năm ${cr.activeYear}`,
          value: `${activeYTotal.totalCases.toLocaleString("vi-VN")} ca`,
          tone: "indigo",
        });
      }
    }
  }

  if (asksAboutEquipment || includeOverview) {
    sources.push("Quản lý máy móc & Thiết bị");
    const alerts = eq.alertItems || [];
    metrics.push({
      label: "Tổng thiết bị",
      value: `${eq.totalCount || 0} máy`,
      tone: "slate",
    });
    if (alerts.length > 0) {
      metrics.push({
        label: "Cảnh báo thiết bị",
        value: `${alerts.length} mục`,
        tone: "rose",
      });
      parts.push(
        `🔧 **Tình trạng máy móc & Cảnh báo (${eq.totalCount || 0} thiết bị):**\n` +
          alerts
            .slice(0, 8)
            .map((a: any) => `  • [${a.severity}] ${a.name} (${a.code} - ${a.room}): ${a.reason}`)
            .join("\n")
      );
      actions.push(`Kiểm tra ${alerts.length} cảnh báo bảo trì/kiểm chuẩn thiết bị.`);
    } else {
      parts.push(
        `🔧 **Thiết bị (${eq.totalCount || 0} máy):** Tất cả các thiết bị hiện ghi nhận trạng thái ổn định, chưa có cảnh báo quá hạn trong 30 ngày.`
      );
    }
  }

  if (asksAboutRooms || includeOverview) {
    sources.push("Cơ cấu Phòng & Bộ phận");
    const roomItems = rm.items || [];
    const overloaded = roomItems.filter((r: any) => r.status === "Quá tải" || r.utilizationRate >= 100);
    const maintenanceRooms = roomItems.filter((r: any) => r.status === "Bảo trì" || r.status === "Tạm ngưng");
    parts.push(
      `🏥 **Phòng & Bộ phận:** ${rm.departmentsCount || 0} bộ phận, ${rm.roomsCount || 0} phòng trực thuộc.` +
        (overloaded.length > 0
          ? `\n  • Phòng quá tải: ${overloaded.map((r: any) => `${r.name} (${r.utilizationRate}%)`).join(", ")}`
          : "") +
        (maintenanceRooms.length > 0
          ? `\n  • Phòng đang bảo trì/tạm ngưng: ${maintenanceRooms.map((r: any) => r.name).join(", ")}`
          : "")
    );
  }

  if (asksAboutStaffOrShift || includeOverview) {
    sources.push("Nhân sự & Lịch trực");
    const todayIso = liveContext.currentDateIso;
    const todayShifts = (sh.todayAndUpcoming || []).filter((s: any) => s.date === todayIso);
    const pendingLeaves = st.pendingLeaveRequests || [];

    parts.push(
      `👥 **Nhân sự & Lịch trực (${st.totalCount || 0} nhân sự):**\n` +
        (todayShifts.length > 0
          ? `  • Ca trực/lịch hôm nay (${todayIso}):\n` +
            todayShifts
              .slice(0, 8)
              .map(
                (s: any) =>
                  `    - ${s.assignedUserName || "Chưa gán"}: ${s.title}${s.room ? ` (${s.room})` : ""}${s.startTime ? ` ${s.startTime}-${s.endTime || ""}` : ""}`
              )
              .join("\n")
          : `  • Hôm nay (${todayIso}) chưa có lịch trực cụ thể được xếp; có ${sh.todayAndUpcoming?.length || 0} lịch sắp tới.`) +
        (pendingLeaves.length > 0
          ? `\n  • Đơn nghỉ phép chờ duyệt: ${pendingLeaves.length} đơn (${pendingLeaves.map((l: any) => l.userName).join(", ")}).`
          : "")
    );
  }

  if (asksAboutTasks || includeOverview) {
    sources.push("Công việc & Cuộc họp");
    const byStatus = tk.byStatus || {};
    const pendingTasks = (tk.activeItems || []).filter((t: any) => t.status !== "Đã hoàn thành");
    metrics.push({
      label: "Công việc cần xử lý",
      value: `${pendingTasks.length}/${tk.totalCount || 0}`,
      tone: tk.overdueCount > 0 ? "amber" : "blue",
    });

    parts.push(
      `✅ **Công việc & Cuộc họp:** Tổng ${tk.totalCount || 0} việc (Chờ xử lý: ${byStatus["Chờ xử lý"] || 0}, Đang làm: ${byStatus["Đang thực hiện"] || 0}, Hoàn thành: ${byStatus["Đã hoàn thành"] || 0}, Quá hạn: ${tk.overdueCount || 0}).` +
        (pendingTasks.length > 0
          ? `\n` +
            pendingTasks
              .slice(0, 5)
              .map((t: any) => `  • [${t.priority}] ${t.title} — Phụ trách: ${t.assignee} (Hạn: ${t.dueDate})`)
              .join("\n")
          : "") +
        ((mt.items || []).length > 0
          ? `\n  • Cuộc họp gần nhất: ${mt.items[0].title} (${mt.items[0].date} ${mt.items[0].time || ""} - ${mt.items[0].status})`
          : "")
    );
    if (tk.overdueCount > 0) {
      actions.push(`Rà soát ${tk.overdueCount} công việc đã quá hạn.`);
    }
  }

  if (asksAboutSOP) {
    sources.push("Hồ sơ SOP & Tiêu chuẩn ISO 15189");
    if (q.includes("tran") || q.includes("hoa chat") || q.includes("cobas")) {
      parts.push(
        "🧪 **SOP-CLS-XN-04 (Xử lý tràn đổ hóa chất):**\n" +
          "1. Cách ly hiện trường bán kính 2m, đeo PPE cấp 2 (găng nitrile dày, kính, N95, áo choàng).\n" +
          "2. Dùng Spill Kit phủ từ ngoài vào trong để cô lập.\n" +
          "3. Thu gom vào túi vàng nguy hại hóa học, khử khuẩn Presept 0.5% hoặc cồn 70°.\n" +
          "4. Lập biên bản BM-SOP-04-02 báo ĐDT và QLCL trong 2 giờ."
      );
    } else if (q.includes("troponin") || q.includes("tat") || q.includes("khan")) {
      parts.push(
        "⏱️ **SOP-CLS-QC-01 (Tiêu chuẩn TAT khẩn theo ISO 15189:2022 Điều 7.3.7):**\n" +
          "• Troponin T hs / Troponin I khẩn: <= 30 phút.\n" +
          "• Khí máu động mạch (ABG): <= 15 phút | Điện giải / Đường huyết: <= 20 phút.\n" +
          "• X-quang ngực cấp cứu: <= 20 phút | CT sọ não Code Stroke: <= 25 phút."
      );
    } else if (q.includes("can quang") || q.includes("ct") || q.includes("buc xa")) {
      parts.push(
        "☢️ **SOP-CLS-CDHA-02 (An toàn tiêm cản quang CT):**\n" +
          "• Đánh giá eGFR >= 45 mL/min/1.73m² (ngoại trú) hoặc >= 30 (cấp cứu có hội chẩn).\n" +
          "• Khai thác tiền sử dị ứng, hen, ngừng Metformin 48h sau tiêm.\n" +
          "• Ký cam kết BM-CDHA-02 và chuẩn bị hộp chống sốc sẵn sàng."
      );
    } else {
      const docList = (doc.items || [])
        .slice(0, 6)
        .map((d: any) => `  • [${d.code || d.docType}] ${d.title} (v${d.version}${d.isExpired ? " - HẾT HẠN" : ""})`)
        .join("\n");
      parts.push(
        `📑 **Kho Hồ Sơ & SOP (${doc.totalCount || 0} tài liệu, ${doc.expiredCount || 0} hết hạn):**\n` +
          (docList || "Chưa có tài liệu nào.")
      );
    }
  }

  if (asksAboutSync) {
    sources.push("Lịch sử đồng bộ Google Sheet");
    const lastRun = (sy.recentRuns || [])[0];
    parts.push(
      `🔄 **Đồng bộ Google Sheet <-> Firebase:** Có ${sy.pendingDiscrepanciesCount || 0} mục sai lệch đang chờ xử lý.` +
        (lastRun
          ? `\n  • Lần gần nhất: ${lastRun.displayTime} (${lastRun.dateRangeLabel}) — ${lastRun.summary}`
          : "")
    );
  }

  return {
    answer: parts.join("\n\n"),
    highlightedMetrics: metrics.slice(0, 4),
    actionChecklist: actions.slice(0, 5),
    dataSourcesUsed: Array.from(new Set(sources)),
    suggestedFollowUps: [
      "Tóm tắt số liệu ngày gần nhất và so sánh với tháng này?",
      "Thiết bị nào sắp đến hạn bảo trì hoặc hiệu chuẩn?",
      "Hôm nay ai trực và có việc nào sắp quá hạn?",
    ],
    modelUsed: "live-data-engine",
    usedLiveContext: true,
    aiWarning,
  };
}

export async function askHospitalAssistant(params: {
  question: string;
  history?: Array<{ sender: "user" | "assistant"; content: string }>;
  liveContext: any;
  userName?: string;
  channel?: "web" | "telegram";
}): Promise<AssistantChatResult> {
  const { question, history = [], liveContext, userName = "Cán bộ Khoa CLS", channel = "web" } = params;
  const ai = getGeminiClient();

  if (!ai) {
    return buildDeterministicAssistantAnswer(
      question,
      liveContext,
      "Chưa cấu hình GEMINI_API_KEY trên máy chủ nên trợ lý đang tổng hợp trực tiếp từ dữ liệu ứng dụng."
    );
  }

  const contextDigest = formatLiveContextDigest(liveContext);
  const recentHistoryText = (history || [])
    .slice(-6)
    .map((m) => `${m.sender === "user" ? "Người dùng" : "Trợ lý"}: ${m.content}`)
    .join("\n");

  const channelGuidance =
    channel === "telegram"
      ? "Người dùng đang hỏi qua Telegram Bot. Hãy trả lời súc tích, rõ ràng, dễ đọc trên điện thoại, dùng gạch đầu dòng gọn gàng, đưa số liệu cụ thể ngay ở đầu câu trả lời."
      : "Người dùng đang hỏi trên giao diện web CLS WorkHub. Hãy trình bày khoa học, rành mạch, chuyên nghiệp.";

  const systemInstruction = `Bạn là Trợ Lý Ảo Thông Minh của Khoa Cận Lâm Sàng (CLS WorkHub AI Assistant).
${channelGuidance}

NGUYÊN TẮC BẮT BUỘC:
1. Tổng hợp và trả lời DỰA TRÊN DỮ LIỆU THỰC TẾ ĐANG CÓ TRONG ỨNG DỤNG dưới đây (và Kho SOP ISO 15189 khi câu hỏi liên quan quy trình chuyên môn).
2. TUYỆT ĐỐI KHÔNG tự bịa ra số liệu, tên nhân viên, tên máy hoặc ngày không tồn tại trong dữ liệu.
3. Nếu ngày/tháng hoặc hạng mục người dùng hỏi chưa có dữ liệu, hãy nói rõ "Hiện chưa có dữ liệu ghi nhận cho..." và chủ động cung cấp số liệu gần nhất hiện có (ví dụ: ngày latestRecordedDay hoặc các tháng đã có dữ liệu).
4. Khi trả lời về số ca, hãy nêu rõ ngày/tháng, tổng số ca, BHYT vs Nhân dân và các bộ phận (Siêu Âm, Nội Soi, X quang, Điện tim & LHN, Xét nghiệm) nếu có trong dữ liệu.
5. Khi trả lời về thiết bị, phòng, nhân sự, lịch trực, công việc, hãy nêu đúng mã/tên/trạng thái/hạn chót thực tế.

DỮ LIỆU TRỰC TIẾP CỦA ỨNG DỤNG (JSON):
${contextDigest}

${BUILTIN_SOP_KB}

Trả về JSON chuẩn theo cấu trúc sau (không bọc markdown code fence):
{
  "answer": "Câu trả lời chi tiết, mạch lạc bằng tiếng Việt cho người dùng...",
  "highlightedMetrics": [
    { "label": "Nhãn ngắn", "value": "Giá trị nổi bật", "tone": "blue|emerald|amber|rose|indigo|slate" }
  ],
  "actionChecklist": [
    "Khuyến nghị hoặc việc cần làm nếu phù hợp (có thể để mảng rỗng [])"
  ],
  "dataSourcesUsed": [
    "Tên các phân hệ dữ liệu đã dùng để trả lời, ví dụ: Báo cáo số ca Google Sheet, Thiết bị, Lịch trực..."
  ],
  "suggestedFollowUps": [
    "2-3 câu hỏi gợi ý tiếp theo phù hợp ngữ cảnh"
  ]
}`;

  const promptContent = recentHistoryText
    ? `LỊCH SỬ HỘI THOẠI GẦN ĐÂY:\n${recentHistoryText}\n\nCÂU HỎI MỚI CỦA ${userName}: "${question}"`
    : `CÂU HỎI CỦA ${userName}: "${question}"`;

  try {
    const { text, model } = await generateGeminiResponse(ai, {
      contents: promptContent,
      systemInstruction,
      responseMimeType: "application/json",
      thinkingLevel: ThinkingLevel.MEDIUM,
    });

    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.answer === "string" && parsed.answer.trim()) {
      return {
        answer: parsed.answer.trim(),
        highlightedMetrics: Array.isArray(parsed.highlightedMetrics)
          ? parsed.highlightedMetrics.slice(0, 4)
          : [],
        actionChecklist: Array.isArray(parsed.actionChecklist)
          ? parsed.actionChecklist.slice(0, 6)
          : [],
        dataSourcesUsed: Array.isArray(parsed.dataSourcesUsed)
          ? parsed.dataSourcesUsed
          : [],
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
          ? parsed.suggestedFollowUps.slice(0, 3)
          : [],
        modelUsed: model,
        usedLiveContext: Boolean(liveContext),
      };
    }
    throw new Error("Phản hồi JSON từ Gemini thiếu trường answer.");
  } catch (err: any) {
    return buildDeterministicAssistantAnswer(
      question,
      liveContext,
      `Mô hình AI đám mây tạm thời bận (${err?.message || "lỗi kết nối"}), đã tự động tổng hợp trực tiếp từ dữ liệu ứng dụng.`
    );
  }
}

export async function generateLiveMorningBriefing(params: {
  reportDate: string;
  liveContext: any;
  fallbackStats?: any;
}) {
  const { reportDate, liveContext, fallbackStats } = params;
  const cr = liveContext?.caseReports || {};
  const latest = cr.latestRecordedDay;
  const prev = cr.previousRecordedDay;
  const rooms = liveContext?.rooms?.items || [];
  const eqAlerts = liveContext?.equipment?.alertItems || [];
  const shiftsToday = (liveContext?.shifts?.todayAndUpcoming || []).filter(
    (s: any) => s.date === (reportDate || liveContext?.currentDateIso)
  );
  const overdueTasks = (liveContext?.tasks?.activeItems || []).filter(
    (t: any) => t.status !== "Đã hoàn thành" && t.dueDate && t.dueDate <= (liveContext?.currentDateIso || reportDate)
  );

  const totalCases = latest?.totalCases ?? fallbackStats?.totalCases ?? 0;
  const bhytCount = latest?.bhytCases ?? 0;
  const vienPhiCount = latest?.nhanDanCases ?? 0;
  const bhytPct = totalCases > 0 ? Math.round((bhytCount / totalCases) * 100) : 0;
  const vpPct = totalCases > 0 ? 100 - bhytPct : 0;

  const avgCases = prev?.totalCases || totalCases || 0;
  const diffPct =
    avgCases > 0 && latest ? Math.round(((latest.totalCases - avgCases) / avgCases) * 100) : 0;

  const overloadedRooms = rooms
    .filter((r: any) => r.utilizationRate >= 85 || r.status === "Quá tải")
    .map((r: any) => ({
      area: `${r.name} (${r.code})`,
      serviceName: r.departmentSection,
      caseCount: r.currentDayCases,
      capacityLimit: r.maxCapacityCasesPerDay,
      utilizationRate: r.utilizationRate,
      status: r.utilizationRate >= 100 || r.status === "Quá tải" ? ("OVERLOAD" as const) : ("HIGH" as const),
      issueDescription: `Trạng thái: ${r.status}. Phụ trách: ${r.managerInCharge || "Chưa chỉ định"}.`,
    }));

  const fallbackBrief = {
    headline: latest
      ? `Giao ban Khoa CLS (${latest.dateLabel}): ${totalCases.toLocaleString("vi-VN")} ca (${diffPct >= 0 ? "+" : ""}${diffPct}% so với kỳ trước)`
      : `Bản tóm tắt Giao ban Sáng Khoa Cận Lâm Sàng (${reportDate})`,
    executiveSummary: latest
      ? `Số liệu ghi nhận ngày gần nhất (${latest.dateLabel}) đạt ${totalCases.toLocaleString("vi-VN")} ca (BHYT: ${bhytCount} ca - ${bhytPct}%, Nhân dân: ${vienPhiCount} ca - ${vpPct}%). Hiện có ${eqAlerts.length} cảnh báo thiết bị, ${overloadedRooms.length} phòng tải cao và ${overdueTasks.length} công việc đến/quá hạn cần lưu ý.`
      : `Hiện chưa có số liệu ca bệnh ghi nhận trong bộ nhớ ứng dụng cho ngày được chọn. Hệ thống đang ghi nhận ${liveContext?.equipment?.totalCount || 0} thiết bị (${eqAlerts.length} cảnh báo) và ${liveContext?.tasks?.totalCount || 0} công việc.`,
    metrics: {
      totalCases,
      averageCases: avgCases,
      diffPercentage: diffPct,
      bhytCount,
      bhytPercentage: bhytPct,
      vienPhiCount,
      vienPhiPercentage: vpPct,
      emergencyCount: overdueTasks.filter((t: any) => t.priority === "Khẩn cấp").length,
      tatAverageMinutes: 25,
    },
    hotspots:
      overloadedRooms.length > 0
        ? overloadedRooms
        : (latest?.byCategory || []).slice(0, 3).map((c: any) => ({
            area: c.category,
            serviceName: `Nhóm kỹ thuật ${c.category} (${latest.dateLabel})`,
            caseCount: c.total,
            capacityLimit: Math.max(c.total, 100),
            utilizationRate: Math.min(100, Math.round((c.total / Math.max(c.total, 100)) * 100)),
            status: "NORMAL" as const,
            issueDescription: `BHYT: ${c.bh} ca • Nhân dân: ${c.nd} ca`,
          })),
    equipmentIssues: eqAlerts.slice(0, 5).map((a: any) => ({
      equipmentId: a.code,
      equipmentName: a.name,
      room: a.room,
      severity: a.severity,
      timestamp: liveContext?.currentDateIso || reportDate,
      description: a.reason,
      impact: "Cần rà soát kế hoạch kiểm chuẩn/bảo trì",
      actionTaken: "Theo dõi tại phân hệ Quản lý Máy móc",
    })),
    staffingRecommendations:
      shiftsToday.length > 0
        ? shiftsToday.slice(0, 3).map((s: any) => ({
            role: s.workType || "Ca trực",
            targetRoom: s.room || "Toàn khoa",
            shiftTime: `${s.startTime || "07:00"} - ${s.endTime || "17:00"}`,
            rationale: `${s.assignedUserName || "Nhân sự"} phụ trách: ${s.title}`,
          }))
        : [
            {
              role: "Kíp trực hành chính & Cận lâm sàng",
              targetRoom: "Toàn khoa",
              shiftTime: "07:00 - 11:30",
              rationale: "Phân bổ theo danh sách phòng đang hoạt động và rà soát công việc ưu tiên.",
            },
          ],
    actionChecklist: [
      ...(eqAlerts.slice(0, 2).map((a: any) => `Kiểm tra thiết bị ${a.name} (${a.code}): ${a.reason}`)),
      ...(overdueTasks.slice(0, 2).map((t: any) => `Đôn đốc việc "${t.title}" (${t.assignee} - Hạn ${t.dueDate})`)),
      ...(liveContext?.syncHistory?.pendingDiscrepanciesCount > 0
        ? [`Đối soát ${liveContext.syncHistory.pendingDiscrepanciesCount} mục sai lệch Google Sheet trong Lịch sử đồng bộ`]
        : []),
    ],
  };

  if (fallbackBrief.actionChecklist.length === 0) {
    fallbackBrief.actionChecklist = [
      "07:00: Chạy nội kiểm IQC 2 mức đầu ngày và nghiệm thu trước khi nhận mẫu",
      "Rà soát các phòng hoạt động và cập nhật số ca giao ban cuối ngày",
    ];
  }

  const ai = getGeminiClient();
  if (!ai || !liveContext) {
    return { data: fallbackBrief, source: "live-data-engine" };
  }

  try {
    const systemInstruction = `Bạn là Trợ lý Trưởng Khoa Cận Lâm Sàng. Hãy tổng hợp dữ liệu THỰC TẾ dưới đây để viết Bản Tóm Tắt Giao Ban Sáng ngày ${reportDate}.
TUYỆT ĐỐI chỉ sử dụng số liệu có trong DỮ LIỆU THỰC TẾ, không tự bịa số ca hay tên máy khác.

DỮ LIỆU THỰC TẾ:
${formatLiveContextDigest(liveContext)}

Trả về JSON theo schema:
{
  "headline": "Tiêu đề giao ban phản ánh đúng số liệu thực tế",
  "executiveSummary": "Tóm tắt 3-4 câu cho Trưởng khoa đọc giao ban",
  "staffingRecommendations": [
    { "role": "...", "targetRoom": "...", "shiftTime": "...", "rationale": "..." }
  ],
  "actionChecklist": ["..."]
}`;

    const { text, model } = await generateGeminiResponse(ai, {
      contents: `Hãy tạo bản giao ban sáng cho ngày ${reportDate} bằng tiếng Việt.`,
      systemInstruction,
      responseMimeType: "application/json",
      thinkingLevel: ThinkingLevel.LOW,
    });

    const parsed = JSON.parse(text);
    if (parsed && parsed.headline) {
      return {
        data: {
          ...fallbackBrief,
          headline: parsed.headline,
          executiveSummary: parsed.executiveSummary || fallbackBrief.executiveSummary,
          staffingRecommendations:
            Array.isArray(parsed.staffingRecommendations) && parsed.staffingRecommendations.length > 0
              ? parsed.staffingRecommendations
              : fallbackBrief.staffingRecommendations,
          actionChecklist:
            Array.isArray(parsed.actionChecklist) && parsed.actionChecklist.length > 0
              ? parsed.actionChecklist
              : fallbackBrief.actionChecklist,
        },
        source: model,
      };
    }
  } catch {
    // Use real-data deterministic fallback cleanly
  }

  return { data: fallbackBrief, source: "live-data-engine" };
}
