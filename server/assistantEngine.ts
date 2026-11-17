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

export interface WebGroundingSource {
  title: string;
  uri: string;
}

export interface LearnedMemoryEntry {
  id?: string;
  category: "fact" | "preference" | "rule" | "correction";
  content: string;
  source?: "auto" | "user" | "feedback" | "telegram";
  createdAt?: string;
}

export async function generateGeminiResponse(
  ai: GoogleGenAI,
  options: {
    contents: any;
    systemInstruction: string;
    responseMimeType?: string;
    thinkingLevel?: ThinkingLevel;
    useGoogleSearch?: boolean;
  }
): Promise<{
  text: string;
  model: string;
  webSources: WebGroundingSource[];
  searchQueries: string[];
}> {
  const attempts: Array<{ model: string; withSearch: boolean }> = [];
  const allowSearch = Boolean(options.useGoogleSearch) && !options.responseMimeType;

  if (allowSearch) {
    attempts.push({ model: VALID_PRIMARY_MODEL, withSearch: true });
  }
  attempts.push({ model: VALID_PRIMARY_MODEL, withSearch: false });
  attempts.push({ model: VALID_FALLBACK_MODEL, withSearch: false });

  let lastError: any = null;

  for (const attempt of attempts) {
    try {
      const config: Record<string, any> = {
        systemInstruction: options.systemInstruction,
      };
      if (options.responseMimeType) {
        config.responseMimeType = options.responseMimeType;
      }
      if (options.thinkingLevel && attempt.model === VALID_PRIMARY_MODEL) {
        config.thinkingConfig = { thinkingLevel: options.thinkingLevel };
      }
      if (attempt.withSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: options.contents,
        config,
      });

      const text = response?.text;
      if (text && text.trim().length > 0) {
        const gm: any = response.candidates?.[0]?.groundingMetadata;
        const rawChunks: any[] = Array.isArray(gm?.groundingChunks) ? gm.groundingChunks : [];
        const seenUris = new Set<string>();
        const webSources: WebGroundingSource[] = [];
        for (const chunk of rawChunks) {
          const uri = chunk?.web?.uri ? String(chunk.web.uri).trim() : "";
          const title = chunk?.web?.title ? String(chunk.web.title).trim() : "";
          if (uri && !seenUris.has(uri)) {
            seenUris.add(uri);
            webSources.push({ title: title || uri, uri });
          }
        }
        const searchQueries: string[] = Array.isArray(gm?.webSearchQueries)
          ? gm.webSearchQueries.map((q: any) => String(q).trim()).filter(Boolean)
          : [];

        return {
          text,
          model: attempt.model,
          webSources: webSources.slice(0, 8),
          searchQueries: searchQueries.slice(0, 5),
        };
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
  webSources: WebGroundingSource[];
  searchQueries: string[];
  usedWebSearch: boolean;
  newlyLearnedMemory?: LearnedMemoryEntry;
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

function normalizeText(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function findMatchingRecordedDays(question: string, liveContext: any): any[] {
  const days: any[] = liveContext?.caseReports?.recentRecordedDays || [];
  if (!Array.isArray(days) || days.length === 0) return [];

  const q = normalizeText(question);

  // Full date like 16/11/2026 or 16/11 or 16-11
  const fullMatch = q.match(/(?:ngay\s*)?(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?/);
  if (fullMatch) {
    const targetDay = parseInt(fullMatch[1], 10);
    const targetMonth = parseInt(fullMatch[2], 10);
    let targetYear = fullMatch[3] ? parseInt(fullMatch[3], 10) : undefined;
    if (targetYear && targetYear < 100) targetYear += 2000;

    const exact = days.filter(
      (d) =>
        d.day === targetDay &&
        d.monthNumber === targetMonth &&
        (!targetYear || d.year === targetYear)
    );
    if (exact.length > 0) return exact;
  }

  // Day mention like "ngay 16", "ngay 5 thang 11"
  const dayMatch = q.match(/ngay\s+(\d{1,2})(?:\s*(?:thang|\/)\s*(\d{1,2}))?/);
  if (dayMatch) {
    const targetDay = parseInt(dayMatch[1], 10);
    const targetMonth = dayMatch[2] ? parseInt(dayMatch[2], 10) : undefined;
    const exact = days.filter(
      (d) => d.day === targetDay && (!targetMonth || d.monthNumber === targetMonth)
    );
    if (exact.length > 0) return exact;
  }

  if (q.includes("hom qua") && days[1]) {
    return [days[1]];
  }
  if (q.includes("hom nay") || q.includes("gan nhat") || q.includes("moi nhat")) {
    const todayIso = liveContext?.currentDateIso;
    const todayDay = days.find((d) => d.dateIso === todayIso);
    return todayDay ? [todayDay] : days[0] ? [days[0]] : [];
  }

  return [];
}

function formatLiveContextDigest(liveContext: any, question = ""): string {
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

  const matchedRequestedDays = question ? findMatchingRecordedDays(question, liveContext) : [];

  return JSON.stringify(
    {
      currentDateIso: liveContext.currentDateIso,
      generatedAt: liveContext.generatedAt,
      currentUser: liveContext.currentUser,
      matchedRequestedDays: matchedRequestedDays.length > 0 ? matchedRequestedDays : undefined,
      caseReports: {
        activeYear: cr.activeYear,
        knownYears: cr.knownYears,
        yearlyTotals: cr.yearlyTotals,
        monthlyTotals: cr.monthlyTotals,
        latestRecordedDay: cr.latestRecordedDay,
        previousRecordedDay: cr.previousRecordedDay,
        recentRecordedDays: (cr.recentRecordedDays || []).slice(0, 35),
        topServicesActiveYear: (cr.topServicesActiveYear || []).slice(0, 15),
        weekdayAverages: cr.weekdayAverages,
      },
      equipment: {
        totalCount: eq.totalCount,
        statusCounts: eq.statusCounts,
        alertItems: eq.alertItems,
        items: (eq.items || []).slice(0, 45),
      },
      rooms: {
        departmentsCount: rm.departmentsCount,
        departments: rm.departments,
        roomsCount: rm.roomsCount,
        items: (rm.items || []).slice(0, 45),
      },
      staff: {
        totalCount: st.totalCount,
        items: (st.items || []).slice(0, 65),
        pendingLeaveRequests: st.pendingLeaveRequests,
        expiringCertificates: st.expiringCertificates,
      },
      shifts: {
        pendingSwapCount: sh.pendingSwapCount,
        todayAndUpcoming: (sh.todayAndUpcoming || []).slice(0, 40),
      },
      tasks: {
        totalCount: tk.totalCount,
        byStatus: tk.byStatus,
        overdueCount: tk.overdueCount,
        activeItems: (tk.activeItems || []).slice(0, 35),
      },
      meetingsAndAnnouncements: {
        items: (mt.items || []).slice(0, 10),
        weeklyPlans: (mt.weeklyPlans || []).slice(0, 10),
        recentAnnouncements: (mt.recentAnnouncements || []).slice(0, 8),
      },
      documentsAndSOPs: {
        totalCount: doc.totalCount,
        expiredCount: doc.expiredCount,
        items: (doc.items || []).slice(0, 35),
      },
      syncHistory: sy,
    },
    null,
    0
  );
}

function formatDayDetailText(dayObj: any, prevDayObj?: any): string {
  const catLines = (dayObj.byCategory || [])
    .map(
      (c: any) =>
        `  • ${c.category}: **${Number(c.total || 0).toLocaleString("vi-VN")} ca** (BHYT: ${c.bh}, Nhân dân: ${c.nd})`
    )
    .join("\n");

  const topSvcLines = (dayObj.topServices || [])
    .slice(0, 8)
    .map(
      (s: any) =>
        `  • ${s.name} (${s.category}): **${Number(s.total || 0).toLocaleString("vi-VN")} ca** (BH: ${s.bh} / ND: ${s.nd})`
    )
    .join("\n");

  let diffNote = "";
  if (prevDayObj && prevDayObj.dateIso !== dayObj.dateIso) {
    const diff = dayObj.totalCases - prevDayObj.totalCases;
    const sign = diff >= 0 ? "+" : "";
    diffNote = ` (${sign}${diff} ca so với ${prevDayObj.dateLabel}: ${prevDayObj.totalCases.toLocaleString("vi-VN")} ca)`;
  }

  return (
    `📊 **Báo cáo chi tiết ngày ${dayObj.dayOfWeek ? `${dayObj.dayOfWeek}, ` : ""}${dayObj.dateLabel}:**\n` +
    `- Tổng số ca thực hiện: **${Number(dayObj.totalCases || 0).toLocaleString("vi-VN")} ca**${diffNote}\n` +
    `- Cơ cấu đối tượng: BHYT **${dayObj.bhytCases}** ca • Nhân dân **${dayObj.nhanDanCases}** ca\n` +
    (catLines ? `\n**Phân bổ theo bộ phận:**\n${catLines}` : "") +
    (topSvcLines ? `\n\n**Các kỹ thuật nổi bật trong ngày:**\n${topSvcLines}` : "")
  );
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
        "Chào bạn, hiện máy chủ trợ lý chưa nhận được bản đồng bộ dữ liệu mới nhất từ trình duyệt ứng dụng.\n\nBạn vui lòng mở lại trang web CLS WorkHub (hoặc bấm **Đồng bộ dữ liệu**) trong vài giây để tôi nạp đầy đủ số liệu ca bệnh, thiết bị và lịch trực rồi phản hồi ngay nhé.",
      highlightedMetrics: [],
      actionChecklist: ["Mở ứng dụng CLS WorkHub trên trình duyệt để đồng bộ dữ liệu trực tiếp."],
      dataSourcesUsed: [],
      webSources: [],
      searchQueries: [],
      usedWebSearch: false,
      suggestedFollowUps: [
        "Tổng hợp số ca ngày gần nhất?",
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

  const matchedDays = findMatchingRecordedDays(question, liveContext);

  const asksAboutCases =
    matchedDays.length > 0 ||
    /(so ca|so lieu|luot|kham|sieu am|noi soi|x quang|x-quang|dien tim|xet nghiem|bhyt|nhan dan|bao cao|giao ban|thang|nam|hom qua|hom nay|tong quan|ngay\s+\d)/.test(
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
    const targetDay = matchedDays[0] || cr.latestRecordedDay;
    const allDays: any[] = cr.recentRecordedDays || [];
    const targetIdx = targetDay ? allDays.findIndex((d) => d.dateIso === targetDay.dateIso) : -1;
    const prevOfTarget = targetIdx >= 0 ? allDays[targetIdx + 1] : cr.previousRecordedDay;

    const activeYTotal = (cr.yearlyTotals || []).find((y: any) => y.year === cr.activeYear);
    const monthsInActiveYear = (cr.monthlyTotals || []).filter((m: any) => m.year === cr.activeYear);

    if (targetDay) {
      metrics.push({
        label: `Ngày ${targetDay.dateLabel}`,
        value: `${Number(targetDay.totalCases || 0).toLocaleString("vi-VN")} ca`,
        tone: "blue",
      });
      metrics.push({
        label: "BHYT / Nhân dân",
        value: `${targetDay.bhytCases} / ${targetDay.nhanDanCases}`,
        tone: "emerald",
      });

      parts.push(formatDayDetailText(targetDay, prevOfTarget));
    } else {
      parts.push(
        `📊 **Báo cáo số ca:** Hiện chưa có ngày nào khớp yêu cầu trong bộ nhớ năm ${cr.activeYear || "hiện tại"}.`
      );
      if (cr.latestRecordedDay) {
        parts.push(`Ngày có số liệu gần nhất hiện có:\n${formatDayDetailText(cr.latestRecordedDay)}`);
      }
    }

    if (!matchedDays.length && monthsInActiveYear.length > 0) {
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
    webSources: [],
    searchQueries: [],
    usedWebSearch: false,
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

function parseAssistantResponseWithMeta(
  rawText: string,
  webSources: WebGroundingSource[],
  searchQueries: string[],
  modelUsed: string,
  usedLiveContext: boolean
): AssistantChatResult {
  let cleanAnswer = rawText.trim();
  let meta: any = null;

  const metaRegex = /<assistant_meta>([\s\S]*?)<\/assistant_meta>/i;
  const match = cleanAnswer.match(metaRegex);
  if (match && match[1]) {
    const jsonCandidate = match[1]
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      meta = JSON.parse(jsonCandidate);
    } catch {
      meta = null;
    }
    cleanAnswer = cleanAnswer.replace(metaRegex, "").trim();
  }

  const dataSourcesUsed: string[] = Array.isArray(meta?.dataSourcesUsed)
    ? meta.dataSourcesUsed.map((s: any) => String(s).trim()).filter(Boolean)
    : [];

  const usedWebSearch = webSources.length > 0 || searchQueries.length > 0;
  if (usedWebSearch && !dataSourcesUsed.some((s) => s.toLowerCase().includes("internet") || s.toLowerCase().includes("google search"))) {
    dataSourcesUsed.push("Internet (Google Search)");
  }

  let newlyLearnedMemory: LearnedMemoryEntry | undefined;
  if (meta?.learnedInsight && typeof meta.learnedInsight === "object" && meta.learnedInsight.content) {
    const cat = ["fact", "preference", "rule", "correction"].includes(meta.learnedInsight.category)
      ? meta.learnedInsight.category
      : "fact";
    newlyLearnedMemory = {
      category: cat,
      content: String(meta.learnedInsight.content).trim().slice(0, 400),
    };
  }

  return {
    answer: cleanAnswer,
    highlightedMetrics: Array.isArray(meta?.highlightedMetrics) ? meta.highlightedMetrics.slice(0, 4) : [],
    actionChecklist: Array.isArray(meta?.actionChecklist) ? meta.actionChecklist.slice(0, 6) : [],
    dataSourcesUsed,
    webSources,
    searchQueries,
    usedWebSearch,
    newlyLearnedMemory,
    suggestedFollowUps: Array.isArray(meta?.suggestedFollowUps) ? meta.suggestedFollowUps.slice(0, 3) : [],
    modelUsed,
    usedLiveContext,
  };
}

export async function askHospitalAssistant(params: {
  question: string;
  history?: Array<{ sender: "user" | "assistant"; content: string }>;
  liveContext: any;
  learnedMemories?: LearnedMemoryEntry[];
  useWebSearch?: boolean;
  userName?: string;
  channel?: "web" | "telegram";
}): Promise<AssistantChatResult> {
  const {
    question,
    history = [],
    liveContext,
    learnedMemories,
    useWebSearch,
    userName = "Cán bộ Khoa CLS",
    channel = "web",
  } = params;

  const ai = getGeminiClient();

  if (!ai) {
    return buildDeterministicAssistantAnswer(
      question,
      liveContext,
      "Chưa cấu hình GEMINI_API_KEY trên máy chủ nên trợ lý đang tổng hợp trực tiếp từ dữ liệu ứng dụng (chưa kích hoạt trả lời nâng cao và tra cứu Internet)."
    );
  }

  const effectiveMemories: LearnedMemoryEntry[] =
    Array.isArray(learnedMemories) && learnedMemories.length > 0
      ? learnedMemories
      : Array.isArray(liveContext?.assistantMemory?.memories)
      ? liveContext.assistantMemory.memories
      : [];

  const effectiveWebSearch =
    useWebSearch !== undefined
      ? useWebSearch
      : liveContext?.assistantMemory?.webSearchEnabled !== false;

  const contextDigest = formatLiveContextDigest(liveContext, question);
  const recentHistoryText = (history || [])
    .slice(-8)
    .map((m) => `${m.sender === "user" ? "Người dùng" : "Trợ lý"}: ${m.content}`)
    .join("\n");

  const memoriesText =
    effectiveMemories.length > 0
      ? effectiveMemories
          .slice(0, 40)
          .map((m, idx) => `${idx + 1}. [${m.category.toUpperCase()}] ${m.content}`)
          .join("\n")
      : "Chưa có ghi nhớ tùy chỉnh nào.";

  const channelGuidance =
    channel === "telegram"
      ? "Người dùng đang trao đổi qua Telegram Bot. Hãy giao tiếp tự nhiên, gần gũi như một trợ lý điều hành tận tâm trên điện thoại: trả lời thẳng trọng tâm ngay đoạn mở đầu, dùng gạch đầu dòng rõ ràng, dễ lướt nhanh, không rườm rà."
      : "Người dùng đang trao đổi trực tiếp trên CLS WorkHub. Hãy trình bày như một trợ lý chuyên môn cấp cao: ấm áp, linh hoạt, mạch lạc, có phân tích điểm đáng chú ý và gợi mở hướng xử lý thực tế.";

  const systemInstruction = `Bạn là **Trợ Lý Chuyên Môn & Điều Hành Thông Minh** của Khoa Cận Lâm Sàng (CLS WorkHub Assistant).
${channelGuidance}

PHONG CÁCH GIAO TIẾP NHÂN TÍNH HÓA & CHUYÊN NGHIỆP:
- Giao tiếp tự nhiên, lịch sự, thấu hiểu ngữ cảnh (xưng "tôi" và gọi tên hoặc "bạn/anh/chị" phù hợp với người hỏi: ${userName}).
- KHÔNG sao chép máy móc nguyên cấu trúc JSON hay đọc liệt kê khô khan; hãy tổng hợp, so sánh, rút ra nhận định hữu ích (ví dụ: ngày này tăng/giảm so với ngày trước ra sao, bộ phận nào chiếm tỷ trọng chính, có máy hay đầu việc nào cần lưu ý không).
- Nếu người dùng chào hỏi, tâm sự, hoặc hỏi kiến thức mở ngoài phạm vi bệnh viện, hãy trò chuyện tự nhiên, duyên dáng và trả lời đầy đủ.

NGUỒN DỮ LIỆU KẾT HỢP (NỘI BỘ ỨNG DỤNG + INTERNET):
1. **Dữ liệu nội bộ ứng dụng CLS WorkHub** (ưu tiên tuyệt đối cho mọi câu hỏi về số liệu khoa, ngày/tháng báo cáo, máy móc, phòng ban, nhân sự, lịch trực, công việc, lịch sử đồng bộ, tài liệu ISO/SOP):
   - TUYỆT ĐỐI KHÔNG tự bịa số liệu nội bộ, tên nhân viên, tên máy hoặc ngày không có trong dữ liệu.
   - Chú ý trường \`matchedRequestedDays\` và \`recentRecordedDays\` khi người dùng hỏi ngày cụ thể (ví dụ "ngày 16"). Nếu ngày được hỏi chưa có dữ liệu trong ứng dụng, hãy nói rõ và chủ động cung cấp ngày gần nhất hiện có.
2. **Tri thức & Tra cứu Internet (Google Search)**:
   - ${
     effectiveWebSearch
       ? "Bạn ĐƯỢC BẬT công cụ Google Search (`googleSearch`). Với MỌI câu hỏi chuyên môn y khoa mới, văn bản Bộ Y tế, tiêu chuẩn ISO/JCI, hướng dẫn chẩn đoán/xét nghiệm, công nghệ, thời sự, thời tiết, hoặc câu hỏi tổng quát bất kỳ mà dữ liệu nội bộ chưa bao phủ, hãy chủ động dùng Google Search để tra cứu thông tin chính xác, cập nhật nhất và lồng ghép mạch lạc với dữ liệu nội bộ (nếu liên quan)."
       : "Chế độ tra cứu Internet đang tạm tắt; chỉ sử dụng dữ liệu nội bộ và tri thức sẵn có, đồng thời nêu rõ nếu cần tra cứu trực tuyến mới nhất."
   }
   - Luôn phân biệt rạch ròi giữa **số liệu nội bộ khoa** và **thông tin tham khảo từ Internet**.

KHẢ NĂNG HỌC HỎI & GHI NHỚ DÀI HẠN:
- Dưới đây là những kiến thức, quy ước, sở thích trình bày và chỉnh sửa mà Khoa đã dạy bạn — hãy áp dụng nhất quán:
${memoriesText}
- Nếu trong câu hỏi hiện tại người dùng chủ động dạy bạn một quy ước mới, nhắc bạn sửa lỗi, hoặc yêu cầu ghi nhớ (VD: "nhớ giúp tôi...", "từ nay...", "lưu ý rằng...", "đúng ra phải là..."), hãy xác nhận tự nhiên trong câu trả lời VÀ ghi tóm tắt 1 câu ngắn gọn vào trường \`learnedInsight\` trong \`<assistant_meta>\`. Nếu không có nội dung mới cần học, để \`"learnedInsight": null\`.

DỮ LIỆU TRỰC TIẾP CỦA ỨNG DỤNG (JSON):
${contextDigest}

${BUILTIN_SOP_KB}

ĐỊNH DẠNG ĐẦU RA:
1. Trước tiên, viết phần trả lời hoàn chỉnh bằng Tiếng Việt (Markdown tự nhiên với **chữ đậm**, gạch đầu dòng gọn đẹp).
2. Ngay ở cuối cùng (sau câu trả lời), luôn gắn thêm khối metadata JSON hợp lệ nằm giữa cặp thẻ sau (KHÔNG giải thích thêm ngoài thẻ):
<assistant_meta>
{
  "highlightedMetrics": [
    { "label": "Nhãn ngắn tối đa 4 từ", "value": "Giá trị nổi bật", "tone": "blue|emerald|amber|rose|indigo|slate" }
  ],
  "actionChecklist": ["Khuyến nghị thực tế nếu cần, hoặc []"],
  "dataSourcesUsed": ["Tên nguồn dữ liệu nội bộ hoặc tri thức đã dùng"],
  "suggestedFollowUps": ["2-3 câu hỏi gợi ý tiếp theo tự nhiên, sát ngữ cảnh"],
  "learnedInsight": null
}
</assistant_meta>
(Khi có kiến thức cần ghi nhớ mới từ người dùng, thay \`null\` bằng \`{"category":"fact|preference|rule|correction","content":"Nội dung 1 câu ngắn gọn cần nhớ"}\`).`;

  const promptContent = recentHistoryText
    ? `LỊCH SỬ HỘI THOẠI GẦN ĐÂY:\n${recentHistoryText}\n\nTIN NHẮN MỚI CỦA ${userName}: "${question}"`
    : `TIN NHẮN CỦA ${userName}: "${question}"`;

  try {
    const { text, model, webSources, searchQueries } = await generateGeminiResponse(ai, {
      contents: promptContent,
      systemInstruction,
      thinkingLevel: ThinkingLevel.MEDIUM,
      useGoogleSearch: effectiveWebSearch,
    });

    return parseAssistantResponseWithMeta(
      text,
      webSources,
      searchQueries,
      model,
      Boolean(liveContext)
    );
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
