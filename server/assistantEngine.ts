import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { isValidServiceName } from "../src/utils/caseReportParser";
import { formatUniqueUnitLabel } from "../src/utils/roomDisplay";
import {
  isPostgresConfigured,
  loadCloudBucketsForServer,
  loadReportArchiveMonthForServer,
} from "./postgresSync";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((val) => {
        if (timer) clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });
  });
}

function extractErrorStatusCode(err: any): number | null {
  const direct = Number(err?.status || err?.code || err?.error?.code);
  if (Number.isFinite(direct) && direct >= 400 && direct <= 599) {
    return direct;
  }
  const msg = String(err?.message || "");
  const match = msg.match(/"code"\s*:\s*(\d{3})|\b(429|500|502|503|504|401|403|404)\b/);
  if (match) {
    const parsed = parseInt(match[1] || match[2], 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isTransientGeminiError(err: any): boolean {
  const code = extractErrorStatusCode(err);
  if (code && [408, 425, 429, 500, 502, 503, 504].includes(code)) {
    return true;
  }
  const lower = String(err?.message || "").toLowerCase();
  return (
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("overloaded") ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate limit") ||
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed")
  );
}

export function formatFriendlyGeminiError(err: any): string {
  const code = extractErrorStatusCode(err);
  const rawMsg = String(err?.message || "");
  const lower = rawMsg.toLowerCase();

  if (
    code === 503 ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("overloaded")
  ) {
    return "Máy chủ AI đám mây đang cao điểm quá tải tạm thời (503). Hệ thống đã tự động tổng hợp trực tiếp từ dữ liệu thực tế của khoa.";
  }

  if (code === 429 || lower.includes("resource_exhausted") || lower.includes("quota")) {
    return "Lưu lượng truy cập AI đám mây tạm thời chạm ngưỡng giới hạn (429). Hệ thống đã tự động tổng hợp trực tiếp từ dữ liệu thực tế của khoa.";
  }

  if (lower.includes("timeout")) {
    return "Máy chủ AI đám mây phản hồi chậm hơn bình thường. Hệ thống đã tự động tổng hợp trực tiếp từ dữ liệu thực tế của khoa.";
  }

  if (code === 401 || code === 403 || lower.includes("api key") || lower.includes("permission")) {
    return "Kết nối AI đám mây chưa được xác thực hợp lệ trên máy chủ. Hệ thống đã tự động tổng hợp trực tiếp từ dữ liệu khoa.";
  }

  const withoutJson = rawMsg.replace(/\{[\s\S]*\}/g, "").trim();
  const cleanDetail = withoutJson.slice(0, 110).trim();
  return cleanDetail
    ? `Kết nối AI đám mây tạm thời gián đoạn (${cleanDetail}). Hệ thống đã tự động tổng hợp trực tiếp từ dữ liệu khoa.`
    : "Kết nối AI đám mây tạm thời gián đoạn. Hệ thống đã tự động tổng hợp trực tiếp từ dữ liệu thực tế của khoa.";
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
  const attempts: Array<{
    model: string;
    withSearch: boolean;
    thinkingLevel?: ThinkingLevel;
    delayBeforeMs: number;
    timeoutMs: number;
  }> = [];
  const allowSearch = Boolean(options.useGoogleSearch) && !options.responseMimeType;

  attempts.push({
    model: VALID_PRIMARY_MODEL,
    withSearch: allowSearch,
    thinkingLevel: options.thinkingLevel || ThinkingLevel.LOW,
    delayBeforeMs: 0,
    timeoutMs: 14000,
  });

  if (allowSearch) {
    attempts.push({
      model: VALID_PRIMARY_MODEL,
      withSearch: false,
      thinkingLevel: ThinkingLevel.LOW,
      delayBeforeMs: 600,
      timeoutMs: 12000,
    });
  } else {
    attempts.push({
      model: VALID_PRIMARY_MODEL,
      withSearch: false,
      thinkingLevel: ThinkingLevel.LOW,
      delayBeforeMs: 800,
      timeoutMs: 12000,
    });
  }

  attempts.push({
    model: VALID_FALLBACK_MODEL,
    withSearch: false,
    delayBeforeMs: 700,
    timeoutMs: 10000,
  });

  attempts.push({
    model: VALID_FALLBACK_MODEL,
    withSearch: false,
    delayBeforeMs: 1100,
    timeoutMs: 10000,
  });

  let lastError: any = null;

  for (let idx = 0; idx < attempts.length; idx++) {
    const attempt = attempts[idx];
    if (idx > 0 && lastError) {
      if (!isTransientGeminiError(lastError) && attempt.model === VALID_FALLBACK_MODEL) {
        break;
      }
      if (attempt.delayBeforeMs > 0) {
        await sleep(attempt.delayBeforeMs);
      }
    }

    try {
      const config: Record<string, any> = {
        systemInstruction: options.systemInstruction,
      };
      if (options.responseMimeType) {
        config.responseMimeType = options.responseMimeType;
      }
      if (attempt.thinkingLevel && attempt.model === VALID_PRIMARY_MODEL) {
        config.thinkingConfig = { thinkingLevel: attempt.thinkingLevel };
      }
      if (attempt.withSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await withTimeout(
        ai.models.generateContent({
          model: attempt.model,
          contents: options.contents,
          config,
        }),
        attempt.timeoutMs,
        `Upstream AI timeout (${attempt.model})`
      );

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

  throw lastError || new Error("Không thể nhận phản hồi từ mô hình AI.");
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

const WEEKDAY_NAMES_VI = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

function normalizeText(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function normalizeMatchPhrase(str: string): string {
  return normalizeText(str)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumericCount(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) && val > 0 ? val : 0;
  if (!val || val === "LT") return 0;
  const parsed = parseInt(String(val).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildDaySummariesFromArchiveItems(
  items: any[],
  year: number,
  monthNum: number
): any[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const monthKey = `Tháng ${monthNum}`;
  const dayMap = new Map<
    number,
    {
      total: number;
      bh: number;
      nd: number;
      byCat: Map<string, { total: number; bh: number; nd: number }>;
      services: Array<{ category: string; name: string; total: number; bh: number; nd: number }>;
    }
  >();

  for (const item of items) {
    const rawName = String(item?.name || "").trim();
    if (!rawName || !isValidServiceName(rawName)) continue;
    const cat = String(item?.category || "Khác").trim() || "Khác";
    const dailyData = item?.dailyData || {};

    for (let day = 1; day <= 31; day++) {
      const entry = dailyData[day] || dailyData[String(day)];
      if (!entry) continue;
      const bh = parseNumericCount(entry.bh);
      const nd = parseNumericCount(entry.nd);
      const total = bh + nd;
      if (total <= 0) continue;

      let acc = dayMap.get(day);
      if (!acc) {
        acc = { total: 0, bh: 0, nd: 0, byCat: new Map(), services: [] };
        dayMap.set(day, acc);
      }
      acc.total += total;
      acc.bh += bh;
      acc.nd += nd;

      const dc = acc.byCat.get(cat) || { total: 0, bh: 0, nd: 0 };
      dc.total += total;
      dc.bh += bh;
      dc.nd += nd;
      acc.byCat.set(cat, dc);

      acc.services.push({ category: cat, name: rawName, total, bh, nd });
    }
  }

  const out: any[] = [];
  dayMap.forEach((acc, day) => {
    const padM = String(monthNum).padStart(2, "0");
    const padD = String(day).padStart(2, "0");
    const dateIso = `${year}-${padM}-${padD}`;
    const dateLabel = `${padD}/${padM}/${year}`;
    const dt = new Date(Date.UTC(year, monthNum - 1, day));
    const dow = WEEKDAY_NAMES_VI[dt.getUTCDay()] || "";
    const sortedServices = [...acc.services].sort((a, b) => b.total - a.total);
    out.push({
      year,
      monthKey,
      monthNumber: monthNum,
      day,
      dateIso,
      dateLabel,
      dayOfWeek: dow,
      totalCases: acc.total,
      bhytCases: acc.bh,
      nhanDanCases: acc.nd,
      byCategory: Array.from(acc.byCat.entries())
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.total - a.total),
      topServices: sortedServices.slice(0, 8),
      services: sortedServices,
    });
  });

  return out;
}

async function enrichLiveContextWithPostgres(
  liveContext: any,
  question: string
): Promise<any> {
  if (!isPostgresConfigured()) return liveContext;

  const baseCtx = liveContext ? { ...liveContext } : {};
  const cr = { ...(baseCtx.caseReports || {}) };
  const existingDays: any[] = Array.isArray(cr.recentRecordedDays) ? cr.recentRecordedDays : [];

  // Determine whether we already have full services on existing days
  const missingFullServices =
    existingDays.length === 0 || existingDays.slice(0, 10).some((d) => !Array.isArray(d?.services));

  // Determine which months to inspect from PostgreSQL
  const qNorm = normalizeText(question);
  const nowVNStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [nowYStr, nowMStr] = nowVNStr.split("-");
  const activeYear = Number(cr.activeYear) || parseInt(nowYStr, 10) || new Date().getFullYear();
  const currentMonth = parseInt(nowMStr, 10) || new Date().getMonth() + 1;

  const monthsToLoad = new Set<number>([currentMonth, currentMonth > 1 ? currentMonth - 1 : 12]);
  if (cr.latestRecordedDay?.monthNumber) {
    monthsToLoad.add(Number(cr.latestRecordedDay.monthNumber));
  }
  const monthMatches = Array.from(qNorm.matchAll(/(?:thang|t)\s*0?(\d{1,2})/g));
  for (const m of monthMatches) {
    const mn = parseInt(m[1], 10);
    if (mn >= 1 && mn <= 12) monthsToLoad.add(mn);
  }
  const slashMatch = qNorm.match(/\b\d{1,2}\s*[\/\-]\s*0?(\d{1,2})\b/);
  if (slashMatch) {
    const mn = parseInt(slashMatch[1], 10);
    if (mn >= 1 && mn <= 12) monthsToLoad.add(mn);
  }

  try {
    if (missingFullServices || monthMatches.length > 0 || !liveContext) {
      const monthResults = await Promise.all(
        Array.from(monthsToLoad).map(async (mNum) => {
          const y = mNum > currentMonth && currentMonth === 1 ? activeYear - 1 : activeYear;
          const items = await loadReportArchiveMonthForServer(y, mNum);
          return buildDaySummariesFromArchiveItems(items, y, mNum);
        })
      );

      const dbDays = monthResults.flat();
      if (dbDays.length > 0) {
        const mergedByIso = new Map<string, any>();
        for (const d of existingDays) {
          if (d?.dateIso) mergedByIso.set(d.dateIso, d);
        }
        for (const dbDay of dbDays) {
          const prev = mergedByIso.get(dbDay.dateIso);
          // Prefer DB-computed full services breakdown when available
          mergedByIso.set(dbDay.dateIso, prev ? { ...prev, ...dbDay } : dbDay);
        }
        const mergedSorted = Array.from(mergedByIso.values())
          .sort((a, b) => String(b.dateIso).localeCompare(String(a.dateIso)))
          .slice(0, 90);

        cr.recentRecordedDays = mergedSorted;
        if (!cr.latestRecordedDay && mergedSorted[0]) {
          cr.latestRecordedDay = mergedSorted[0];
        } else if (cr.latestRecordedDay?.dateIso && mergedByIso.has(cr.latestRecordedDay.dateIso)) {
          cr.latestRecordedDay = mergedByIso.get(cr.latestRecordedDay.dateIso);
        }
        if (!cr.previousRecordedDay && mergedSorted[1]) {
          cr.previousRecordedDay = mergedSorted[1];
        } else if (cr.previousRecordedDay?.dateIso && mergedByIso.has(cr.previousRecordedDay.dateIso)) {
          cr.previousRecordedDay = mergedByIso.get(cr.previousRecordedDay.dateIso);
        }
        cr.activeYear = activeYear;
        baseCtx.caseReports = cr;
      }
    }

    // If caller sent no liveContext at all OR missed/empty leaveRequests, hydrate from DB buckets
    const needsLeaveHydration =
      !liveContext ||
      !Array.isArray(baseCtx?.staff?.leaveRequests) ||
      baseCtx.staff.leaveRequests.length === 0;

    if (!liveContext || needsLeaveHydration) {
      const bucketNames = !liveContext
        ? [
            "equipment",
            "rooms",
            "departments",
            "staff_profiles",
            "leave_requests",
            "tasks",
            "shifts",
            "documents",
            "meetings",
            "meeting_items",
          ]
        : ["staff_profiles", "leave_requests"];

      const buckets = await loadCloudBucketsForServer(bucketNames);
      if (Object.keys(buckets).length > 0) {
        const rawStaffList: any[] = Array.isArray(buckets.staff_profiles)
          ? buckets.staff_profiles
          : baseCtx?.staff?.items || [];
        const isStaffInactive = (s: any): boolean => {
          const st = normalizeText(String(s?.currentStatus || ""));
          return st.includes("nghi viec") || st.includes("nghi huu") || st.includes("chuyen cong tac");
        };
        const activeStaffList = rawStaffList.filter((s: any) => !isStaffInactive(s));
        const inactiveStaffNames = new Set(
          rawStaffList.filter(isStaffInactive).map((s: any) => String(s?.fullName || "").trim().toLowerCase())
        );

        const rawLeaveList: any[] = Array.isArray(buckets.leave_requests)
          ? buckets.leave_requests
          : [];
        const profileMapById = new Map(
          rawStaffList.map((s: any) => [String(s?.userId || ""), s])
        );
        const profileMapByName = new Map(
          rawStaffList.map((s: any) => [String(s?.fullName || "").trim().toLowerCase(), s])
        );
        const enrichedLeaves = rawLeaveList
          .filter((l: any) => !inactiveStaffNames.has(String(l?.userName || "").trim().toLowerCase()))
          .map((l: any) => {
            const prof =
              profileMapById.get(String(l?.userId || "")) ||
              profileMapByName.get(String(l?.userName || "").trim().toLowerCase());
            return {
              id: l.id,
              userId: l.userId,
              userName: l.userName,
              userRole: l.userRole,
              departmentSection: prof?.departmentSection || "",
              room: prof?.room || "",
              leaveType: l.leaveType,
              startDate: l.startDate,
              endDate: l.endDate,
              totalDays: l.totalDays,
              reason: l.reason,
              substituteUserName: l.substituteUserName,
              status: l.status,
              approvedBy: l.approvedBy,
              createdAt: l.createdAt,
            };
          });

        if (!liveContext) {
          baseCtx.currentDateIso = baseCtx.currentDateIso || nowVNStr;
          const todayMs = Date.parse(`${baseCtx.currentDateIso}T00:00:00Z`);
          const calcDaysLeft = (iso?: string): number | null => {
            const clean = String(iso || "").trim().slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(todayMs)) return null;
            return Math.round((Date.parse(`${clean}T00:00:00Z`) - todayMs) / (24 * 60 * 60 * 1000));
          };

          const eqList: any[] = Array.isArray(buckets.equipment) ? buckets.equipment : [];
          const eqStatusCounts: Record<string, number> = {};
          const eqAlertItems: any[] = [];
          for (const eq of eqList) {
            if (!eq) continue;
            const st = String(eq.status || "Đang hoạt động");
            eqStatusCounts[st] = (eqStatusCounts[st] || 0) + 1;
            const tracks = [
              { label: "Hạn kiểm chuẩn", date: eq.calibrationExpiry },
              { label: "Bảo trì định kỳ", date: eq.nextMaintenanceDate },
              { label: "Giấy phép bức xạ", date: eq.radiationSurveyExpiry || eq.radiationLicenseExpiry },
              { label: "Giấy phép hoạt động", date: eq.operatingPermitExpiry },
            ];
            let soonestReason = "";
            let minDays = 999;
            for (const tr of tracks) {
              const d = calcDaysLeft(tr.date);
              if (d !== null && d <= 30 && d < minDays) {
                minDays = d;
                soonestReason = d < 0 ? `${tr.label} quá hạn ${Math.abs(d)} ngày` : `${tr.label} còn ${d} ngày`;
              }
            }
            if (eq.isLockedOut || st === "Sự cố hỏng hóc" || st === "Cần bảo trì" || st === "Tạm ngưng" || soonestReason) {
              eqAlertItems.push({
                id: eq.id,
                code: eq.code,
                name: eq.name,
                room: eq.room,
                status: st,
                isLockedOut: Boolean(eq.isLockedOut),
                alertReason: eq.lockoutReason || soonestReason || st,
                daysRemaining: minDays < 999 ? minDays : undefined,
                assignedTechnician: eq.assignedTechnician,
              });
            }
          }
          baseCtx.equipment = {
            totalCount: eqList.length,
            statusCounts: eqStatusCounts,
            alertItems: eqAlertItems.slice(0, 30),
            items: eqList.slice(0, 60),
          };

          baseCtx.rooms = {
            departmentsCount: (buckets.departments || []).length,
            departments: buckets.departments || [],
            roomsCount: (buckets.rooms || []).length,
            items: (buckets.rooms || []).slice(0, 60),
          };

          const expiringCerts: any[] = [];
          for (const s of activeStaffList) {
            if (Array.isArray(s?.certificates)) {
              for (const cert of s.certificates) {
                const d = calcDaysLeft(cert?.expiryDate);
                if (d !== null && d <= 60) {
                  expiringCerts.push({
                    staffName: s.fullName,
                    certName: cert.name || "Chứng chỉ",
                    expiryDate: cert.expiryDate,
                    status: d < 0 ? `Quá hạn ${Math.abs(d)} ngày` : `Còn ${d} ngày`,
                  });
                }
              }
            }
          }
          baseCtx.staff = {
            totalCount: activeStaffList.length,
            activeCount: activeStaffList.length,
            items: activeStaffList.slice(0, 100),
            leaveRequests: enrichedLeaves.slice(0, 150),
            pendingLeaveRequests: enrichedLeaves.filter((l: any) => l.status === "Chờ duyệt").slice(0, 30),
            expiringCertificates: expiringCerts.slice(0, 30),
          };

          const rawTasks: any[] = Array.isArray(buckets.tasks) ? buckets.tasks : [];
          const byStatus: Record<string, number> = {};
          let overdueCount = 0;
          const activeTasks: any[] = [];
          for (const t of rawTasks) {
            if (!t) continue;
            const st = String(t.status || "Chưa thực hiện");
            byStatus[st] = (byStatus[st] || 0) + 1;
            const dLeft = calcDaysLeft(t.dueDate);
            if (st !== "Đã hoàn thành" && st !== "Hủy") {
              if (dLeft !== null && dLeft < 0) overdueCount += 1;
              activeTasks.push(t);
            }
          }
          baseCtx.tasks = {
            totalCount: rawTasks.length,
            byStatus,
            overdueCount,
            activeItems: (activeTasks.length > 0 ? activeTasks : rawTasks).slice(0, 60),
          };

          const rawShifts: any[] = Array.isArray(buckets.shifts) ? buckets.shifts : [];
          const filteredShifts = rawShifts
            .filter((sh: any) => {
              if (!sh?.date) return false;
              const nameLower = String(sh.assignedUserName || sh.userName || "").trim().toLowerCase();
              if (inactiveStaffNames.has(nameLower)) return false;
              const dLeft = calcDaysLeft(sh.date);
              return dLeft !== null && dLeft >= -14 && dLeft <= 21;
            })
            .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
          baseCtx.shifts = {
            todayAndUpcoming: (filteredShifts.length > 0 ? filteredShifts : rawShifts).slice(0, 150),
            pendingSwapCount: rawShifts.filter((sh: any) => sh?.hasPendingSwap).length,
          };

          baseCtx.meetings = {
            items: (buckets.meeting_items || []).slice(0, 20),
            weeklyPlans: (buckets.meetings || []).slice(0, 20),
            recentAnnouncements: [],
          };

          const docsList: any[] = Array.isArray(buckets.documents) ? buckets.documents : [];
          const expiredDocs = docsList.filter((doc: any) => {
            const dLeft = calcDaysLeft(doc?.expirationDate);
            return Boolean(doc?.isExpired) || (dLeft !== null && dLeft < 0);
          }).length;
          baseCtx.documents = {
            totalCount: docsList.length,
            expiredCount: expiredDocs,
            items: docsList.slice(0, 40),
          };
        } else if (enrichedLeaves.length > 0) {
          baseCtx.staff = {
            ...(baseCtx.staff || {}),
            leaveRequests: enrichedLeaves.slice(0, 150),
            pendingLeaveRequests:
              Array.isArray(baseCtx?.staff?.pendingLeaveRequests) &&
              baseCtx.staff.pendingLeaveRequests.length > 0
                ? baseCtx.staff.pendingLeaveRequests
                : enrichedLeaves.filter((l: any) => l.status === "Chờ duyệt").slice(0, 30),
          };
        }
      }
    }
  } catch (err: any) {
    console.error("[AssistantEngine] enrichLiveContextWithPostgres error:", err?.message);
  }

  return Object.keys(baseCtx).length > 0 ? baseCtx : liveContext;
}

function extractRequestedDayCount(question: string): number | null {
  const q = normalizeText(question);

  // Numeric pattern: "3 ngay gan nhat", "5 ngay qua", "7 ngay moi nhat", "10 ngay vua qua"
  const numMatch = q.match(
    /\b(\d{1,2})\s*(?:ngay|hom)\s*(?:gan\s*nhat|moi\s*nhat|gan\s*day|vua\s*qua|lien\s*tiep|qua|nay)\b/
  );
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (Number.isFinite(n) && n >= 1) return Math.min(31, n);
  }

  // Word-number patterns common in Vietnamese
  const wordNumMap: Record<string, number> = {
    hai: 2,
    ba: 3,
    bon: 4,
    nam: 5,
    sau: 6,
    bay: 7,
    tam: 8,
    chin: 9,
    muoi: 10,
  };
  const wordMatch = q.match(
    /\b(hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:ngay|hom)\s*(?:gan\s*nhat|moi\s*nhat|gan\s*day|vua\s*qua|lien\s*tiep|qua)\b/
  );
  if (wordMatch && wordNumMap[wordMatch[1]]) {
    return wordNumMap[wordMatch[1]];
  }

  if (/\b(?:1\s*tuan|tuan\s*qua|tuan\s*gan\s*nhat|7\s*ngay)\b/.test(q)) {
    return 7;
  }

  return null;
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

  // Multi-day window like "3 ngày gần nhất"
  const multiCount = extractRequestedDayCount(question);
  if (multiCount && multiCount > 1) {
    return days.slice(0, multiCount);
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

interface MatchedServiceTarget {
  kind: "service" | "category";
  name: string;
  category: string;
  score: number;
}

const GENERIC_CATEGORY_STOPWORDS = new Set([
  "xet",
  "nghiem",
  "sieu",
  "am",
  "noi",
  "soi",
  "x",
  "quang",
  "dien",
  "tim",
  "lhn",
  "thi",
  "sao",
  "con",
  "nao",
  "nay",
  "kia",
  "tuan",
  "thang",
  "nam",
  "ngay",
  "hom",
  "qua",
  "sau",
  "truoc",
  "nua",
  "cua",
  "cho",
  "voi",
  "ve",
  "trong",
  "ngoai",
  "tren",
  "duoi",
  "theo",
  "tu",
  "den",
  "tai",
  "cac",
  "nhung",
  "mot",
  "hai",
  "moi",
  "co",
  "khong",
  "chua",
  "dang",
  "da",
  "se",
  "duoc",
  "bi",
  "ai",
  "nguoi",
  "nhan",
  "vien",
  "su",
  "nghi",
  "phep",
  "truc",
  "lich",
  "don",
  "duyet",
  "kiem",
  "tra",
  "xem",
  "hoi",
  "biet",
  "the",
  "bao",
  "cao",
  "tong",
  "hop",
  "so",
  "lieu",
  "ca",
  "luot",
  "tinh",
  "hinh",
  "viec",
  "cong",
  "hop",
  "may",
  "thiet",
  "phong",
  "bo",
  "phan",
  "hien",
  "toi",
  "vua",
  "gan",
  "nhat",
  "them",
  "chi",
  "tiet",
  "het",
  "tat",
  "nhieu",
]);

function findMatchedServiceTargets(question: string, allDays: any[]): MatchedServiceTarget[] {
  const qPhrase = normalizeMatchPhrase(question);
  if (!qPhrase) return [];
  const qPadded = ` ${qPhrase} `;

  const knownServices = new Map<string, { name: string; category: string }>();
  const knownCategories = new Set<string>();

  for (const d of allDays.slice(0, 45)) {
    const list = Array.isArray(d?.services) ? d.services : Array.isArray(d?.topServices) ? d.topServices : [];
    for (const s of list) {
      if (!s?.name || !isValidServiceName(s.name)) continue;
      const key = normalizeMatchPhrase(s.name);
      if (key && !knownServices.has(key)) {
        knownServices.set(key, { name: s.name, category: s.category || "Khác" });
      }
      if (s.category) knownCategories.add(String(s.category));
    }
    for (const c of d?.byCategory || []) {
      if (c?.category) knownCategories.add(String(c.category));
    }
  }

  const matchedServices: MatchedServiceTarget[] = [];

  knownServices.forEach((meta, normKey) => {
    if (!normKey || normKey.length < 3) return;
    if (qPadded.includes(` ${normKey} `)) {
      matchedServices.push({
        kind: "service",
        name: meta.name,
        category: meta.category,
        score: 200 + normKey.length,
      });
      return;
    }

    // Token-based match for multi-word service names when all meaningful tokens appear
    const tokens = normKey.split(" ").filter((t) => t.length >= 2);
    if (tokens.length >= 2 && tokens.every((t) => qPadded.includes(` ${t} `))) {
      matchedServices.push({
        kind: "service",
        name: meta.name,
        category: meta.category,
        score: 140 + normKey.length,
      });
    }
  });

  if (matchedServices.length > 0) {
    matchedServices.sort((a, b) => b.score - a.score);
    const bestScore = matchedServices[0].score;
    // If we have an exact/strong match (e.g. "Siêu âm tổng quát"), keep top matches of comparable specificity
    return matchedServices.filter((m) => m.score >= bestScore - 15).slice(0, 4);
  }

  // Fallback to category matching (e.g., "siêu âm", "xét nghiệm", "x quang", "nội soi", "điện tim")
  const matchedCats: MatchedServiceTarget[] = [];
  knownCategories.forEach((cat) => {
    const normCat = normalizeMatchPhrase(cat);
    if (!normCat) return;
    const altPatterns = [normCat];
    if (normCat.includes("dien tim")) altPatterns.push("dien tim", "ecg", "luu huyet nao", "lhn");
    if (normCat.includes("x quang")) altPatterns.push("x quang", "xquang");
    if (normCat.includes("msct")) altPatterns.push("msct", "ct scanner", "chup ct");
    if (normCat.includes("mri")) altPatterns.push("mri", "cong huong tu");

    for (const pat of altPatterns) {
      if (pat.length >= 3 && qPadded.includes(` ${pat} `)) {
        matchedCats.push({
          kind: "category",
          name: cat,
          category: cat,
          score: 120 + pat.length,
        });
        break;
      }
    }
  });

  if (matchedCats.length > 0) {
    matchedCats.sort((a, b) => b.score - a.score);
    return matchedCats.slice(0, 3);
  }

  // Loose single non-generic whole-token match (e.g. "huyết học", "sinh hóa", "troponin", "doppler")
  const queryWords = qPhrase
    .split(" ")
    .filter((w) => w.length >= 4 && !GENERIC_CATEGORY_STOPWORDS.has(w));
  if (queryWords.length > 0) {
    knownServices.forEach((meta, normKey) => {
      const keyTokens = normKey.split(" ").filter(Boolean);
      let hits = 0;
      for (const w of queryWords) {
        if (keyTokens.some((tok) => tok === w)) hits += 1;
      }
      if (hits >= 2 || (hits === 1 && keyTokens.length <= 3)) {
        matchedServices.push({
          kind: "service",
          name: meta.name,
          category: meta.category,
          score: 60 + hits * 20,
        });
      }
    });
    if (matchedServices.length > 0) {
      return matchedServices.sort((a, b) => b.score - a.score).slice(0, 5);
    }
  }

  return [];
}

function getDayServicesList(dayObj: any): Array<{ category: string; name: string; total: number; bh: number; nd: number }> {
  if (!dayObj) return [];
  if (Array.isArray(dayObj.services) && dayObj.services.length > 0) return dayObj.services;
  if (Array.isArray(dayObj.topServices) && dayObj.topServices.length > 0) return dayObj.topServices;
  return [];
}

function computeTargetStatsForDay(
  dayObj: any,
  targets: MatchedServiceTarget[]
): { total: number; bh: number; nd: number; matchedLabels: string[] } {
  const svcList = getDayServicesList(dayObj);
  let total = 0;
  let bh = 0;
  let nd = 0;
  const matchedLabels = new Set<string>();
  const countedServiceKeys = new Set<string>();

  for (const t of targets) {
    if (t.kind === "service") {
      const targetNorm = normalizeMatchPhrase(t.name);
      for (const s of svcList) {
        const sNorm = normalizeMatchPhrase(s.name);
        if (sNorm === targetNorm && !countedServiceKeys.has(sNorm)) {
          countedServiceKeys.add(sNorm);
          total += Number(s.total || 0);
          bh += Number(s.bh || 0);
          nd += Number(s.nd || 0);
          matchedLabels.add(s.name);
        }
      }
    } else {
      const catNorm = normalizeMatchPhrase(t.category);
      const foundCat = (dayObj?.byCategory || []).find(
        (c: any) => normalizeMatchPhrase(c.category) === catNorm
      );
      if (foundCat) {
        total += Number(foundCat.total || 0);
        bh += Number(foundCat.bh || 0);
        nd += Number(foundCat.nd || 0);
        matchedLabels.add(foundCat.category);
      }
    }
  }

  return {
    total,
    bh,
    nd,
    matchedLabels: Array.from(matchedLabels),
  };
}

function buildMatchedServiceHistory(
  question: string,
  allDays: any[]
):
  | {
      targets: MatchedServiceTarget[];
      requestedCount: number;
      latestZeroSkippedDateLabels: string[];
      rows: Array<{
        dateIso: string;
        dateLabel: string;
        dayOfWeek: string;
        total: number;
        bh: number;
        nd: number;
        breakdown?: Array<{ name: string; total: number; bh: number; nd: number }>;
      }>;
    }
  | undefined {
  if (!Array.isArray(allDays) || allDays.length === 0) return undefined;
  const targets = findMatchedServiceTargets(question, allDays);
  if (targets.length === 0) return undefined;

  const requestedCount = extractRequestedDayCount(question) || 3;
  const skippedLatestZeros: string[] = [];
  const rows: Array<{
    dateIso: string;
    dateLabel: string;
    dayOfWeek: string;
    total: number;
    bh: number;
    nd: number;
    breakdown?: Array<{ name: string; total: number; bh: number; nd: number }>;
  }> = [];

  for (const dayObj of allDays) {
    const stat = computeTargetStatsForDay(dayObj, targets);
    if (stat.total > 0) {
      const breakdown =
        targets[0].kind === "category"
          ? getDayServicesList(dayObj)
              .filter(
                (s) => normalizeMatchPhrase(s.category) === normalizeMatchPhrase(targets[0].category)
              )
              .map((s) => ({ name: s.name, total: s.total, bh: s.bh, nd: s.nd }))
          : undefined;
      rows.push({
        dateIso: dayObj.dateIso,
        dateLabel: dayObj.dateLabel,
        dayOfWeek: dayObj.dayOfWeek || "",
        total: stat.total,
        bh: stat.bh,
        nd: stat.nd,
        breakdown,
      });
      if (rows.length >= requestedCount) break;
    } else if (rows.length === 0) {
      skippedLatestZeros.push(dayObj.dateLabel);
    }
  }

  return {
    targets,
    requestedCount,
    latestZeroSkippedDateLabels: skippedLatestZeros,
    rows,
  };
}

function compactDayForGeminiPrompt(dayObj: any, includeFullServices: boolean): any {
  const { services, ...rest } = dayObj || {};
  if (includeFullServices) {
    return {
      ...rest,
      services: Array.isArray(services) ? services : dayObj?.topServices || [],
    };
  }
  return rest;
}

function getTodayIsoVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeIsoDateStr(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const vnMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (vnMatch) {
    return `${vnMatch[3]}-${vnMatch[2].padStart(2, "0")}-${vnMatch[1].padStart(2, "0")}`;
  }
  return "";
}

function formatIsoToVN(iso?: string): string {
  const clean = normalizeIsoDateStr(iso);
  if (!clean) return String(iso || "");
  const [y, m, d] = clean.split("-");
  return `${d}/${m}/${y}`;
}

function shiftIsoDateDays(iso: string, deltaDays: number): string {
  const clean = normalizeIsoDateStr(iso);
  if (!clean) return iso;
  const [y, m, d] = clean.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function getWeekBoundsFromIso(anchorIso: string, weekOffset = 0): { mondayIso: string; sundayIso: string } {
  const clean = normalizeIsoDateStr(anchorIso) || getTodayIsoVietnam();
  const [y, m, d] = clean.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const mondayIso = shiftIsoDateDays(clean, diffToMonday + weekOffset * 7);
  const sundayIso = shiftIsoDateDays(mondayIso, 6);
  return { mondayIso, sundayIso };
}

function getMonthBounds(year: number, monthNum: number): { startIso: string; endIso: string } {
  const padM = String(monthNum).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return {
    startIso: `${year}-${padM}-01`,
    endIso: `${year}-${padM}-${String(lastDay).padStart(2, "0")}`,
  };
}

interface RequestedTimeWindow {
  kind: "week" | "day" | "month" | "range";
  label: string;
  startIso: string;
  endIso: string;
  isExplicit: boolean;
}

function parseRequestedTimeWindow(question: string, todayIso: string): RequestedTimeWindow {
  const q = normalizeText(question);
  const [nowY, nowM] = todayIso.split("-").map((n) => parseInt(n, 10));

  if (/\b(tuan hien tai|tuan nay|trong tuan|tuan dang chay)\b/.test(q)) {
    const { mondayIso, sundayIso } = getWeekBoundsFromIso(todayIso, 0);
    return {
      kind: "week",
      label: `Tuần hiện tại (${formatIsoToVN(mondayIso)} - ${formatIsoToVN(sundayIso)})`,
      startIso: mondayIso,
      endIso: sundayIso,
      isExplicit: true,
    };
  }

  if (/\b(tuan truoc|tuan qua|tuan roi|tuan vua roi)\b/.test(q)) {
    const { mondayIso, sundayIso } = getWeekBoundsFromIso(todayIso, -1);
    return {
      kind: "week",
      label: `Tuần trước (${formatIsoToVN(mondayIso)} - ${formatIsoToVN(sundayIso)})`,
      startIso: mondayIso,
      endIso: sundayIso,
      isExplicit: true,
    };
  }

  if (/\b(tuan sau|tuan toi|tuan ke tiep)\b/.test(q)) {
    const { mondayIso, sundayIso } = getWeekBoundsFromIso(todayIso, 1);
    return {
      kind: "week",
      label: `Tuần tới (${formatIsoToVN(mondayIso)} - ${formatIsoToVN(sundayIso)})`,
      startIso: mondayIso,
      endIso: sundayIso,
      isExplicit: true,
    };
  }

  if (/\b(hom nay|ngay nay|ngay hom nay)\b/.test(q)) {
    return {
      kind: "day",
      label: `Hôm nay (${formatIsoToVN(todayIso)})`,
      startIso: todayIso,
      endIso: todayIso,
      isExplicit: true,
    };
  }

  if (/\b(hom qua|ngay hom qua)\b/.test(q)) {
    const yest = shiftIsoDateDays(todayIso, -1);
    return {
      kind: "day",
      label: `Hôm qua (${formatIsoToVN(yest)})`,
      startIso: yest,
      endIso: yest,
      isExplicit: true,
    };
  }

  if (/\b(ngay mai)\b/.test(q)) {
    const tmr = shiftIsoDateDays(todayIso, 1);
    return {
      kind: "day",
      label: `Ngày mai (${formatIsoToVN(tmr)})`,
      startIso: tmr,
      endIso: tmr,
      isExplicit: true,
    };
  }

  if (/\b(ngay kia)\b/.test(q)) {
    const afterTmr = shiftIsoDateDays(todayIso, 2);
    return {
      kind: "day",
      label: `Ngày kia (${formatIsoToVN(afterTmr)})`,
      startIso: afterTmr,
      endIso: afterTmr,
      isExplicit: true,
    };
  }

  if (/\b(thang hien tai|thang nay|trong thang)\b/.test(q)) {
    const b = getMonthBounds(nowY, nowM);
    return {
      kind: "month",
      label: `Tháng ${nowM}/${nowY} (${formatIsoToVN(b.startIso)} - ${formatIsoToVN(b.endIso)})`,
      startIso: b.startIso,
      endIso: b.endIso,
      isExplicit: true,
    };
  }

  if (/\b(thang truoc|thang qua|thang roi)\b/.test(q)) {
    const prevM = nowM === 1 ? 12 : nowM - 1;
    const prevY = nowM === 1 ? nowY - 1 : nowY;
    const b = getMonthBounds(prevY, prevM);
    return {
      kind: "month",
      label: `Tháng ${prevM}/${prevY} (${formatIsoToVN(b.startIso)} - ${formatIsoToVN(b.endIso)})`,
      startIso: b.startIso,
      endIso: b.endIso,
      isExplicit: true,
    };
  }

  if (/\b(thang sau|thang toi)\b/.test(q)) {
    const nextM = nowM === 12 ? 1 : nowM + 1;
    const nextY = nowM === 12 ? nowY + 1 : nowY;
    const b = getMonthBounds(nextY, nextM);
    return {
      kind: "month",
      label: `Tháng ${nextM}/${nextY} (${formatIsoToVN(b.startIso)} - ${formatIsoToVN(b.endIso)})`,
      startIso: b.startIso,
      endIso: b.endIso,
      isExplicit: true,
    };
  }

  // Exact dd/mm(/yyyy)
  const fullSlash = q.match(/(?:ngay\s*)?(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?/);
  if (fullSlash) {
    const dd = parseInt(fullSlash[1], 10);
    const mm = parseInt(fullSlash[2], 10);
    let yy = fullSlash[3] ? parseInt(fullSlash[3], 10) : nowY;
    if (yy < 100) yy += 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const targetIso = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      return {
        kind: "day",
        label: `Ngày ${formatIsoToVN(targetIso)}`,
        startIso: targetIso,
        endIso: targetIso,
        isExplicit: true,
      };
    }
  }

  // "thang N"
  const monthOnly = q.match(/\bthang\s*0?(\d{1,2})(?:\s*(?:nam|\/)\s*(\d{4}))?/);
  if (monthOnly) {
    const mm = parseInt(monthOnly[1], 10);
    const yy = monthOnly[2] ? parseInt(monthOnly[2], 10) : nowY;
    if (mm >= 1 && mm <= 12) {
      const b = getMonthBounds(yy, mm);
      return {
        kind: "month",
        label: `Tháng ${mm}/${yy} (${formatIsoToVN(b.startIso)} - ${formatIsoToVN(b.endIso)})`,
        startIso: b.startIso,
        endIso: b.endIso,
        isExplicit: true,
      };
    }
  }

  // Default window: current week for overview/HR/shift/meeting awareness
  const { mondayIso, sundayIso } = getWeekBoundsFromIso(todayIso, 0);
  return {
    kind: "week",
    label: `Tuần hiện tại (${formatIsoToVN(mondayIso)} - ${formatIsoToVN(sundayIso)})`,
    startIso: mondayIso,
    endIso: sundayIso,
    isExplicit: false,
  };
}

interface NormalizedLeaveEntry {
  id: string;
  userName: string;
  userRole: string;
  departmentSection: string;
  room: string;
  unitLabel: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  substituteUserName: string;
  status: string;
  approvedBy: string;
  source: "leaveRequest" | "shiftOff";
}

function collectNormalizedLeaves(liveContext: any): NormalizedLeaveEntry[] {
  const st = liveContext?.staff || {};
  const sh = liveContext?.shifts || {};
  const staffItems: any[] = Array.isArray(st.items) ? st.items : [];
  const profileById = new Map(staffItems.map((s: any) => [String(s?.userId || ""), s]));
  const profileByName = new Map(
    staffItems.map((s: any) => [String(s?.fullName || "").trim().toLowerCase(), s])
  );

  const rawLeaves: any[] =
    Array.isArray(st.leaveRequests) && st.leaveRequests.length > 0
      ? st.leaveRequests
      : Array.isArray(st.pendingLeaveRequests)
      ? st.pendingLeaveRequests
      : [];

  const result: NormalizedLeaveEntry[] = [];
  const seenKeys = new Set<string>();

  for (const l of rawLeaves) {
    const startIso = normalizeIsoDateStr(l?.startDate);
    const endIso = normalizeIsoDateStr(l?.endDate) || startIso;
    const userName = String(l?.userName || l?.staffName || l?.fullName || "").trim();
    if (!userName || !startIso) continue;
    const prof =
      profileById.get(String(l?.userId || "")) ||
      profileByName.get(userName.toLowerCase());
    const key = `${normalizeText(userName)}|${startIso}|${endIso}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const departmentSection = String(l?.departmentSection || prof?.departmentSection || "");
    const room = String(l?.room || prof?.room || "");
    result.push({
      id: String(l?.id || key),
      userName,
      userRole: String(l?.userRole || prof?.title || ""),
      departmentSection,
      room,
      unitLabel: formatUniqueUnitLabel([room, departmentSection]),
      leaveType: String(l?.leaveType || "Nghỉ phép"),
      startDate: startIso,
      endDate: endIso,
      totalDays: Number(l?.totalDays || 1),
      reason: String(l?.reason || ""),
      substituteUserName: String(l?.substituteUserName || ""),
      status: String(l?.status || "Chờ duyệt"),
      approvedBy: String(l?.approvedBy || ""),
      source: "leaveRequest",
    });
  }

  // Also check shifts explicitly marked workType === 'Nghỉ' not already covered
  const shifts: any[] = Array.isArray(sh.todayAndUpcoming) ? sh.todayAndUpcoming : [];
  for (const s of shifts) {
    if (normalizeText(s?.workType) !== "nghi") continue;
    const dIso = normalizeIsoDateStr(s?.date);
    const uName = String(s?.assignedUserName || "").trim();
    if (!dIso || !uName) continue;
    const alreadyCovered = result.some(
      (r) =>
        normalizeText(r.userName) === normalizeText(uName) &&
        r.startDate <= dIso &&
        r.endDate >= dIso
    );
    if (alreadyCovered) continue;
    const prof = profileByName.get(uName.toLowerCase());
    const departmentSection = String(prof?.departmentSection || "");
    const room = String(s?.room || prof?.room || "");
    result.push({
      id: `shift-off-${uName}-${dIso}`,
      userName: uName,
      userRole: String(prof?.title || ""),
      departmentSection,
      room,
      unitLabel: formatUniqueUnitLabel([room, departmentSection]),
      leaveType: String(s?.title || "Nghỉ theo lịch phân ca"),
      startDate: dIso,
      endDate: dIso,
      totalDays: 1,
      reason: String(s?.title || "Lịch nghỉ trên bảng phân ca"),
      substituteUserName: "",
      status: "Đã xếp lịch nghỉ",
      approvedBy: "",
      source: "shiftOff",
    });
  }

  return result.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function detectQueryIntents(question: string, matchedDays: any[], serviceHistory: any) {
  const q = normalizeText(question);
  const asksAboutLeave =
    /\b(dang ky nghi|lich nghi|xin nghi|nghi phep|nghi om|thai san|khong luong|don nghi|duyet nghi|ai nghi|nghi bu|nghi viec|vang mat)\b/.test(
      q
    );
  const asksAboutShifts =
    /\b(ai truc|lich truc|ca truc|kip truc|doi ca|phan cong truc|phan ca|truc dem|truc hom|truc tuan)\b/.test(
      q
    );
  const asksAboutStaffProfiles =
    /\b(nhan su|nhan vien|bac si|ktv|ky thuat vien|dieu duong|chung chi|chung chi hanh nghe|ho so nhan su|danh sach can bo)\b/.test(
      q
    );
  const asksAboutEquipment =
    /\b(thiet bi|may moc|bao tri|hieu chuan|kiem chuan|su co|hong hoc|khoa an toan|atbx|kiem xa|het han|lockout)\b/.test(
      q
    ) || /\bmay\b(?! (ca|ngay|gio|nguoi|thang|nam|tuan|lan)\b)/.test(q);
  const asksAboutRooms = /\b(phong|bo phan|cong suat|qua tai)\b/.test(q);
  const asksAboutTasks = /\b(cong viec|task|dau viec|viec|tre han|qua han|giao viec|hoan thanh)\b/.test(q);
  const asksAboutMeetings = /\b(cuoc hop|lich hop|ke hoach tuan|giao ban tuan|thong bao)\b/.test(q);
  const asksAboutSOP =
    /\b(sop|iso|15189|quy trinh|troponin|stat tat|thoi gian tat|tat khan|tran do|hoa chat|spill kit|westgard|can quang|tai lieu|kho tai lieu|ho so sop)\b/.test(
      q
    ) || /\bho so\b(?! nhan su\b)/.test(q);
  const asksAboutSync = /\b(dong bo|google sheet|sai lech|postgresql|lich su dong bo)\b/.test(q);
  const asksAboutCases =
    matchedDays.length > 0 ||
    Boolean(serviceHistory) ||
    /\b(so ca|so lieu|luot|sieu am|noi soi|x quang|x-quang|dien tim|xet nghiem|sinh hoa|huyet hoc|nuoc tieu|dong mau|vi sinh|msct|mri|bhyt|nhan dan)\b/.test(
      q
    ) ||
    /\b(bao cao|giao ban|thang)\b.*\bca\b/.test(q);

  const hasSpecificIntent =
    asksAboutLeave ||
    asksAboutShifts ||
    asksAboutStaffProfiles ||
    asksAboutEquipment ||
    asksAboutRooms ||
    asksAboutTasks ||
    asksAboutMeetings ||
    asksAboutSOP ||
    asksAboutSync ||
    asksAboutCases;

  return {
    asksAboutLeave,
    asksAboutShifts,
    asksAboutStaffProfiles,
    asksAboutEquipment,
    asksAboutRooms,
    asksAboutTasks,
    asksAboutMeetings,
    asksAboutSOP,
    asksAboutSync,
    asksAboutCases,
    includeOverview: !hasSpecificIntent,
  };
}

function buildSmartQueryAnalysis(
  liveContext: any,
  question: string,
  history: Array<{ sender: "user" | "assistant"; content: string }> = []
) {
  const todayIso = normalizeIsoDateStr(liveContext?.currentDateIso) || getTodayIsoVietnam();
  const timeWindow = parseRequestedTimeWindow(question, todayIso);
  const cr = liveContext?.caseReports || {};
  const allDays: any[] = cr.recentRecordedDays || [];
  const matchedRequestedDays = question ? findMatchingRecordedDays(question, liveContext) : [];
  let matchedServiceHistory = question ? buildMatchedServiceHistory(question, allDays) : undefined;
  let intents = detectQueryIntents(question, matchedRequestedDays, matchedServiceHistory);

  // If this is a short follow-up like "Còn tuần sau thì sao?" or "Ai đang chờ duyệt?", inherit domain intent from last user turn
  const qNormFollow = normalizeText(question);
  const looksFollowUp =
    (intents.includeOverview || (!matchedRequestedDays.length && (!matchedServiceHistory || matchedServiceHistory.targets.every((t) => t.score < 120)))) &&
    (timeWindow.isExplicit ||
      /\b(con |the |tuan|thang|hom |ngay |cho duyet|da duyet|chi tiet|them|ai nua|sao roi|the nao)\b/.test(
        qNormFollow
      ));
  if (looksFollowUp && Array.isArray(history) && history.length > 0) {
    const normalizedHist = history.map((m: any) => ({
      sender: m?.sender === "user" || m?.role === "user" ? ("user" as const) : ("assistant" as const),
      content: String(m?.content ?? m?.text ?? ""),
    }));
    const prevUserMsg = [...normalizedHist].reverse().find((m) => m.sender === "user" && m.content.trim());
    if (prevUserMsg?.content) {
      const prevIntents = detectQueryIntents(prevUserMsg.content, [], undefined);
      if (!prevIntents.includeOverview) {
        intents = prevIntents;
        if (!prevIntents.asksAboutCases && matchedServiceHistory && matchedServiceHistory.targets.every((t) => t.score < 120)) {
          matchedServiceHistory = undefined;
        }
      }
    }
  }

  const allLeaves = collectNormalizedLeaves(liveContext);
  const qNorm = normalizeText(question);

  // Filter status if user explicitly asked for pending/approved/rejected
  const wantsPendingOnly = /\b(cho duyet|chua duyet|dang cho)\b/.test(qNorm);
  const wantsApprovedOnly = /\b(da duyet|da phe duyet|duoc duyet)\b/.test(qNorm);
  const wantsRejectedOnly = /\b(tu choi|bi huy)\b/.test(qNorm);

  const leavesInWindowRaw = allLeaves.filter(
    (l) => l.startDate <= timeWindow.endIso && l.endDate >= timeWindow.startIso
  );
  const leavesInWindow = leavesInWindowRaw.filter((l) => {
    const stNorm = normalizeText(l.status);
    if (wantsPendingOnly) return stNorm.includes("cho");
    if (wantsApprovedOnly) return stNorm.includes("duyet") && !stNorm.includes("cho");
    if (wantsRejectedOnly) return stNorm.includes("tu choi");
    return true;
  });
  const leavesToday = allLeaves.filter(
    (l) => l.startDate <= todayIso && l.endDate >= todayIso && !normalizeText(l.status).includes("tu choi")
  );

  // Match specific staff names mentioned in question
  const staffItems: any[] = Array.isArray(liveContext?.staff?.items) ? liveContext.staff.items : [];
  const matchedStaff = staffItems.filter((s) => {
    const fullNorm = normalizeText(s?.fullName || "");
    if (!fullNorm || fullNorm.length < 4) return false;
    return qNorm.includes(fullNorm);
  });

  // Shifts inside requested window
  const allShifts: any[] = Array.isArray(liveContext?.shifts?.todayAndUpcoming)
    ? liveContext.shifts.todayAndUpcoming
    : [];
  const shiftsInWindow = allShifts.filter((s) => {
    const dIso = normalizeIsoDateStr(s?.date);
    return dIso >= timeWindow.startIso && dIso <= timeWindow.endIso;
  });

  // Tasks relevant to window or overdue
  const activeTasks: any[] = Array.isArray(liveContext?.tasks?.activeItems)
    ? liveContext.tasks.activeItems
    : [];
  const tasksRelevant = activeTasks.filter((t) => {
    const dIso = normalizeIsoDateStr(t?.dueDate);
    if (!dIso) return false;
    const isOverdue = t.status !== "Đã hoàn thành" && dIso < todayIso;
    const inWin = dIso >= timeWindow.startIso && dIso <= timeWindow.endIso;
    return isOverdue || inWin;
  });

  // Meetings & weekly plans in window
  const meetingsInWindow = [
    ...(Array.isArray(liveContext?.meetings?.items) ? liveContext.meetings.items : []),
    ...(Array.isArray(liveContext?.meetings?.weeklyPlans) ? liveContext.meetings.weeklyPlans : []),
  ].filter((m: any) => {
    const dIso = normalizeIsoDateStr(m?.date);
    return dIso && dIso >= timeWindow.startIso && dIso <= timeWindow.endIso;
  });

  return {
    todayIso,
    todayLabel: formatIsoToVN(todayIso),
    requestedTimeWindow: {
      ...timeWindow,
      startLabel: formatIsoToVN(timeWindow.startIso),
      endLabel: formatIsoToVN(timeWindow.endIso),
    },
    intents,
    matchedStaff,
    leaveStatsInWindow: {
      totalInWindow: leavesInWindow.length,
      approvedCount: leavesInWindow.filter((l) => {
        const s = normalizeText(l.status);
        return s.includes("duyet") && !s.includes("cho");
      }).length,
      pendingCount: leavesInWindow.filter((l) => normalizeText(l.status).includes("cho")).length,
      rejectedCount: leavesInWindow.filter((l) => normalizeText(l.status).includes("tu choi")).length,
      totalLeavesRecordedAllTime: allLeaves.length,
      onLeaveTodayCount: leavesToday.length,
    },
    leavesInWindow,
    leavesToday,
    allRecentLeaves: allLeaves.slice(0, 25),
    shiftsInWindow: shiftsInWindow.slice(0, 50),
    tasksRelevant: tasksRelevant.slice(0, 30),
    meetingsInWindow: meetingsInWindow.slice(0, 20),
    matchedRequestedDays,
    matchedServiceHistory,
  };
}

function formatLiveContextDigest(
  liveContext: any,
  question = "",
  history: Array<{ sender: "user" | "assistant"; content: string }> = []
): string {
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

  const allDays: any[] = cr.recentRecordedDays || [];
  const analysis = buildSmartQueryAnalysis(liveContext, question, history);

  return JSON.stringify(
    {
      currentDateIso: analysis.todayIso,
      currentDateVN: analysis.todayLabel,
      generatedAt: liveContext.generatedAt,
      currentUser: liveContext.currentUser,
      queryAnalysis: {
        requestedTimeWindow: analysis.requestedTimeWindow,
        detectedIntents: analysis.intents,
        leaveStatsInWindow: analysis.leaveStatsInWindow,
        leavesInWindow: analysis.leavesInWindow,
        leavesToday: analysis.leavesToday,
        shiftsInWindow: analysis.shiftsInWindow,
        tasksInWindowOrOverdue: analysis.tasksRelevant,
        meetingsInWindow: analysis.meetingsInWindow,
        matchedStaff: analysis.matchedStaff.length > 0 ? analysis.matchedStaff : undefined,
        matchedRequestedDays:
          analysis.matchedRequestedDays.length > 0
            ? analysis.matchedRequestedDays.map((d) => compactDayForGeminiPrompt(d, true))
            : undefined,
        matchedServiceHistory: analysis.matchedServiceHistory,
      },
      caseReports: {
        activeYear: cr.activeYear,
        knownYears: cr.knownYears,
        yearlyTotals: cr.yearlyTotals,
        monthlyTotals: cr.monthlyTotals,
        latestRecordedDay: cr.latestRecordedDay
          ? compactDayForGeminiPrompt(cr.latestRecordedDay, true)
          : null,
        previousRecordedDay: cr.previousRecordedDay
          ? compactDayForGeminiPrompt(cr.previousRecordedDay, true)
          : null,
        recentRecordedDays: allDays
          .slice(0, 25)
          .map((d, idx) => compactDayForGeminiPrompt(d, idx < 7)),
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
        activeCount: st.activeCount,
        items: (st.items || []).slice(0, 80),
        leaveRequests: analysis.allRecentLeaves,
        pendingLeaveRequests: st.pendingLeaveRequests,
        expiringCertificates: st.expiringCertificates,
      },
      shifts: {
        pendingSwapCount: sh.pendingSwapCount,
        todayAndUpcoming: (sh.todayAndUpcoming || []).slice(0, 60),
      },
      tasks: {
        totalCount: tk.totalCount,
        byStatus: tk.byStatus,
        overdueCount: tk.overdueCount,
        activeItems: (tk.activeItems || []).slice(0, 40),
      },
      meetingsAndAnnouncements: {
        items: (mt.items || []).slice(0, 12),
        weeklyPlans: (mt.weeklyPlans || []).slice(0, 12),
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

  const svcList = getDayServicesList(dayObj);
  const topSvcLines = svcList
    .slice(0, 10)
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

function formatMultiDayTable(daysList: any[], allDays: any[], channel: "web" | "telegram"): string {
  const sumTotal = daysList.reduce((s, d) => s + Number(d.totalCases || 0), 0);
  const sumBh = daysList.reduce((s, d) => s + Number(d.bhytCases || 0), 0);
  const sumNd = daysList.reduce((s, d) => s + Number(d.nhanDanCases || 0), 0);

  if (channel === "telegram") {
    const lines = daysList.map((d) => {
      const idx = allDays.findIndex((x) => x.dateIso === d.dateIso);
      const prev = idx >= 0 ? allDays[idx + 1] : null;
      const diff = prev ? d.totalCases - prev.totalCases : null;
      const diffTxt = diff === null ? "" : ` (${diff >= 0 ? "+" : ""}${diff} ca)`;
      return `• **${d.dateLabel}** (${d.dayOfWeek}): **${Number(d.totalCases || 0).toLocaleString("vi-VN")} ca** [BH: ${d.bhytCases} / ND: ${d.nhanDanCases}]${diffTxt}`;
    });
    return (
      `📊 **Tổng hợp số ca ${daysList.length} ngày gần nhất:**\n` +
      lines.join("\n") +
      `\n• **Tổng cộng ${daysList.length} ngày:** **${sumTotal.toLocaleString("vi-VN")} ca** (BHYT: ${sumBh}, Nhân dân: ${sumNd})`
    );
  }

  const header =
    `| Ngày | Thứ | BHYT | Nhân dân | Tổng ca | So với ngày trước |\n` +
    `| :--- | :--- | ---: | ---: | ---: | ---: |`;
  const body = daysList
    .map((d) => {
      const idx = allDays.findIndex((x) => x.dateIso === d.dateIso);
      const prev = idx >= 0 ? allDays[idx + 1] : null;
      const diff = prev ? d.totalCases - prev.totalCases : null;
      const diffStr =
        diff === null
          ? "—"
          : `${diff >= 0 ? "+" : ""}${diff.toLocaleString("vi-VN")} ca`;
      return `| **${d.dateLabel}** | ${d.dayOfWeek || ""} | ${Number(d.bhytCases || 0).toLocaleString("vi-VN")} | ${Number(d.nhanDanCases || 0).toLocaleString("vi-VN")} | **${Number(d.totalCases || 0).toLocaleString("vi-VN")}** | ${diffStr} |`;
    })
    .join("\n");
  const totalRow = `| **Tổng cộng (${daysList.length} ngày)** | — | **${sumBh.toLocaleString("vi-VN")}** | **${sumNd.toLocaleString("vi-VN")}** | **${sumTotal.toLocaleString("vi-VN")}** | TB **${Math.round(sumTotal / daysList.length).toLocaleString("vi-VN")}**/ngày |`;

  return `📊 **Tổng hợp số ca ${daysList.length} ngày gần nhất:**\n\n${header}\n${body}\n${totalRow}`;
}

export function buildDeterministicAssistantAnswer(
  question: string,
  liveContext: any,
  aiWarning?: string,
  channel: "web" | "telegram" = "web",
  history: Array<{ sender: "user" | "assistant"; content: string }> = []
): AssistantChatResult {
  const q = normalizeText(question);

  if (!liveContext) {
    return {
      answer:
        "Chào bạn, hiện máy chủ trợ lý chưa nhận được bản đồng bộ dữ liệu mới nhất từ trình duyệt ứng dụng.\n\nBạn vui lòng mở lại trang web CLS WorkHub trong vài giây để hệ thống nạp đầy đủ số liệu ca bệnh, thiết bị và lịch trực rồi phản hồi ngay nhé.",
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

  const allDays: any[] = cr.recentRecordedDays || [];
  const analysis = buildSmartQueryAnalysis(liveContext, question, history);
  const matchedDays = analysis.matchedRequestedDays;
  const serviceHistory = analysis.matchedServiceHistory;
  const {
    asksAboutLeave,
    asksAboutShifts,
    asksAboutStaffProfiles,
    asksAboutEquipment,
    asksAboutRooms,
    asksAboutTasks,
    asksAboutMeetings,
    asksAboutSOP,
    asksAboutSync,
    asksAboutCases,
    includeOverview,
  } = analysis.intents;

  const contextualFollowUps: string[] = [];

  if (asksAboutCases || includeOverview) {
    sources.push("Báo cáo số ca Google Sheet");

    if (serviceHistory && serviceHistory.targets.length > 0) {
      const targetTitle = serviceHistory.targets.map((t) => t.name).join(" + ");
      const rows = serviceHistory.rows;

      if (rows.length === 0) {
        parts.push(
          `📊 **Số liệu kỹ thuật "${targetTitle}":** Hiện chưa có ngày nào phát sinh số ca dương trong ${allDays.length} ngày gần nhất được lưu trữ.`
        );
      } else {
        const sumTotal = rows.reduce((s, r) => s + r.total, 0);
        const sumBh = rows.reduce((s, r) => s + r.bh, 0);
        const sumNd = rows.reduce((s, r) => s + r.nd, 0);
        const avgDay = Math.round(sumTotal / rows.length);
        const peakRow = rows.reduce((best, r) => (r.total > best.total ? r : best), rows[0]);

        metrics.push({
          label: `${targetTitle} (${rows.length} ngày)`,
          value: `${sumTotal.toLocaleString("vi-VN")} ca`,
          tone: "blue",
        });
        metrics.push({
          label: "BHYT / Nhân dân",
          value: `${sumBh.toLocaleString("vi-VN")} / ${sumNd.toLocaleString("vi-VN")}`,
          tone: "emerald",
        });
        metrics.push({
          label: `Gần nhất (${rows[0].dateLabel.slice(0, 5)})`,
          value: `${rows[0].total.toLocaleString("vi-VN")} ca`,
          tone: "indigo",
        });
        metrics.push({
          label: "Trung bình / ngày",
          value: `${avgDay.toLocaleString("vi-VN")} ca`,
          tone: "slate",
        });

        const zeroNotice =
          serviceHistory.latestZeroSkippedDateLabels.length > 0
            ? `\n*Lưu ý:* Ngày ${serviceHistory.latestZeroSkippedDateLabels.join(", ")} chưa ghi nhận số liệu cho **${targetTitle}** (0 ca). Dưới đây là **${rows.length} ngày gần nhất có phát sinh số liệu thực tế**:`
            : "";

        if (channel === "telegram") {
          const lineRows = rows.map((r, idx) => {
            const older = rows[idx + 1];
            const diffTxt = older
              ? ` (${r.total - older.total >= 0 ? "+" : ""}${r.total - older.total} ca vs ${older.dateLabel.slice(0, 5)})`
              : "";
            return `• **${r.dateLabel}** (${r.dayOfWeek}): **${r.total.toLocaleString("vi-VN")} ca** [BHYT: ${r.bh}, Nhân dân: ${r.nd}]${diffTxt}`;
          });
          parts.push(
            `📊 **Số liệu ${targetTitle} (${rows.length} ngày gần nhất):**` +
              (zeroNotice ? `${zeroNotice}\n` : "\n") +
              lineRows.join("\n") +
              `\n• **Tổng cộng ${rows.length} ngày:** **${sumTotal.toLocaleString("vi-VN")} ca** (BHYT: ${sumBh.toLocaleString("vi-VN")} • Nhân dân: ${sumNd.toLocaleString("vi-VN")} • TB: ${avgDay.toLocaleString("vi-VN")} ca/ngày)`
          );
        } else {
          const header =
            `| Ngày | Thứ | BHYT | Nhân dân | Tổng ca | Biến động vs kỳ trước |\n` +
            `| :--- | :--- | ---: | ---: | ---: | ---: |`;
          const body = rows
            .map((r, idx) => {
              const older = rows[idx + 1];
              let diffCell = "—";
              if (older) {
                const diff = r.total - older.total;
                const pct = older.total > 0 ? Math.round((diff / older.total) * 100) : 0;
                const sign = diff >= 0 ? "+" : "";
                diffCell = `${sign}${diff.toLocaleString("vi-VN")} ca (${sign}${pct}%)`;
              }
              return `| **${r.dateLabel}** | ${r.dayOfWeek} | ${r.bh.toLocaleString("vi-VN")} | ${r.nd.toLocaleString("vi-VN")} | **${r.total.toLocaleString("vi-VN")}** | ${diffCell} |`;
            })
            .join("\n");
          const totalRow = `| **Tổng cộng (${rows.length} ngày)** | — | **${sumBh.toLocaleString("vi-VN")}** | **${sumNd.toLocaleString("vi-VN")}** | **${sumTotal.toLocaleString("vi-VN")}** | TB **${avgDay.toLocaleString("vi-VN")}** ca/ngày |`;

          let categorySubNote = "";
          if (serviceHistory.targets[0].kind === "category" && rows[0]?.breakdown?.length) {
            categorySubNote =
              `\n\n**Chi tiết theo từng kỹ thuật ngày gần nhất (${rows[0].dateLabel}):**\n` +
              rows[0].breakdown
                .slice(0, 10)
                .map(
                  (b) =>
                    `  • ${b.name}: **${b.total.toLocaleString("vi-VN")} ca** (BH: ${b.bh} / ND: ${b.nd})`
                )
                .join("\n");
          }

          parts.push(
            `📊 **Thống kê ${targetTitle} — ${rows.length} ngày gần nhất:**` +
              (zeroNotice ? `\n${zeroNotice}` : "") +
              `\n\n${header}\n${body}\n${totalRow}\n\n` +
              `- **Ngày cao điểm nhất:** ${peakRow.dateLabel} (${peakRow.dayOfWeek}) đạt **${peakRow.total.toLocaleString("vi-VN")} ca**.\n` +
              `- **Tỷ trọng BHYT / Nhân dân:** BHYT chiếm **${sumTotal > 0 ? Math.round((sumBh / sumTotal) * 100) : 0}%** (${sumBh.toLocaleString("vi-VN")} ca), Nhân dân **${sumTotal > 0 ? Math.round((sumNd / sumTotal) * 100) : 0}%** (${sumNd.toLocaleString("vi-VN")} ca).` +
              categorySubNote
          );
        }
      }
    } else if (matchedDays.length > 1) {
      const sumTotal = matchedDays.reduce((s, d) => s + Number(d.totalCases || 0), 0);
      const sumBh = matchedDays.reduce((s, d) => s + Number(d.bhytCases || 0), 0);
      const sumNd = matchedDays.reduce((s, d) => s + Number(d.nhanDanCases || 0), 0);
      metrics.push({
        label: `Tổng ${matchedDays.length} ngày`,
        value: `${sumTotal.toLocaleString("vi-VN")} ca`,
        tone: "blue",
      });
      metrics.push({
        label: "BHYT / Nhân dân",
        value: `${sumBh.toLocaleString("vi-VN")} / ${sumNd.toLocaleString("vi-VN")}`,
        tone: "emerald",
      });
      metrics.push({
        label: "Trung bình / ngày",
        value: `${Math.round(sumTotal / matchedDays.length).toLocaleString("vi-VN")} ca`,
        tone: "indigo",
      });
      parts.push(formatMultiDayTable(matchedDays, allDays, channel));
    } else {
      const targetDay = matchedDays[0] || cr.latestRecordedDay;
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
  }

  if (asksAboutLeave || includeOverview) {
    sources.push("Lịch nghỉ phép & Nhân sự");
    const win = analysis.requestedTimeWindow;
    const leaves = analysis.leavesInWindow;
    const stats = analysis.leaveStatsInWindow;

    if (asksAboutLeave) {
      metrics.push({
        label: "Đơn nghỉ trong kỳ",
        value: `${stats.totalInWindow} đơn`,
        tone: "blue",
      });
      metrics.push({
        label: "Đã phê duyệt",
        value: `${stats.approvedCount} đơn`,
        tone: "emerald",
      });
      metrics.push({
        label: "Chờ duyệt",
        value: `${stats.pendingCount} đơn`,
        tone: stats.pendingCount > 0 ? "amber" : "slate",
      });
      metrics.push({
        label: `Nghỉ hôm nay (${analysis.todayLabel.slice(0, 5)})`,
        value: `${stats.onLeaveTodayCount} người`,
        tone: stats.onLeaveTodayCount > 0 ? "indigo" : "slate",
      });
    }

    if (leaves.length > 0) {
      if (channel === "telegram") {
        const lines = leaves.map((l) => {
          const dateRange =
            l.startDate === l.endDate
              ? formatIsoToVN(l.startDate)
              : `${formatIsoToVN(l.startDate)} → ${formatIsoToVN(l.endDate)}`;
          const unit = l.unitLabel || formatUniqueUnitLabel([l.room, l.departmentSection]);
          const sub = l.substituteUserName ? ` · Thay thế: ${l.substituteUserName}` : "";
          return `• **${l.userName}**${unit ? ` (${unit})` : ""}: **${l.leaveType}** (${dateRange}, ${l.totalDays} ngày) — **${l.status}**${l.reason ? ` · Lý do: ${l.reason}` : ""}${sub}`;
        });
        parts.push(
          `🗓️ **Lịch đăng ký nghỉ — ${win.label} (${leaves.length} trường hợp):**\n` +
            `• Đã phê duyệt: **${stats.approvedCount}** · Chờ duyệt: **${stats.pendingCount}**` +
            (stats.rejectedCount > 0 ? ` · Từ chối: **${stats.rejectedCount}**` : "") +
            `\n` +
            lines.join("\n")
        );
      } else {
        const header =
          `| Nhân sự | Bộ phận / Phòng | Hình thức nghỉ | Thời gian nghỉ | Số ngày | Trạng thái | Người thay thế |\n` +
          `| :--- | :--- | :--- | :--- | ---: | :--- | :--- |`;
        const body = leaves
          .map((l) => {
            const dateRange =
              l.startDate === l.endDate
                ? formatIsoToVN(l.startDate)
                : `${formatIsoToVN(l.startDate)} – ${formatIsoToVN(l.endDate)}`;
            const unit = l.unitLabel || formatUniqueUnitLabel([l.room, l.departmentSection]) || l.userRole || "Khoa CLS";
            const sub = l.substituteUserName || "—";
            return `| **${l.userName}** | ${unit} | ${l.leaveType}${l.reason ? ` *(${l.reason})*` : ""} | ${dateRange} | ${l.totalDays}N | **${l.status}** | ${sub} |`;
          })
          .join("\n");

        parts.push(
          `🗓️ **Lịch đăng ký nghỉ nhân viên — ${win.label}:**\n` +
            `Ghi nhận **${leaves.length} lượt nghỉ** (Đã phê duyệt: **${stats.approvedCount}**, Chờ duyệt: **${stats.pendingCount}**` +
            (stats.rejectedCount > 0 ? `, Từ chối: **${stats.rejectedCount}**` : "") +
            `; riêng hôm nay **${analysis.todayLabel}**: **${stats.onLeaveTodayCount} người** đang trong thời gian nghỉ).\n\n` +
            `${header}\n${body}`
        );
      }

      if (stats.pendingCount > 0) {
        actions.push(`Xem xét và phê duyệt ${stats.pendingCount} đơn xin nghỉ đang ở trạng thái Chờ duyệt.`);
      }
    } else if (asksAboutLeave) {
      parts.push(
        `🗓️ **Lịch đăng ký nghỉ nhân viên — ${win.label}:**\n` +
          `• Không có nhân viên nào đăng ký nghỉ trong khoảng thời gian **${win.startLabel} – ${win.endLabel}**.\n` +
          (analysis.allRecentLeaves.length > 0
            ? `• Tổng cộng hệ thống hiện có **${analysis.allRecentLeaves.length} đơn nghỉ** ở các thời điểm khác (gần nhất: **${analysis.allRecentLeaves[0].userName}** từ ${formatIsoToVN(analysis.allRecentLeaves[0].startDate)} đến ${formatIsoToVN(analysis.allRecentLeaves[0].endDate)} — ${analysis.allRecentLeaves[0].status}).`
            : `• Hiện chưa có đơn đăng ký nghỉ nào được ghi nhận trong hệ thống.`)
      );
    }

    if (asksAboutLeave) {
      contextualFollowUps.push(
        "Kiểm tra lịch đăng ký nghỉ tuần sau và tháng này?",
        "Đơn nghỉ phép nào đang chờ duyệt cần xử lý?",
        "Hôm nay ai trực và có ai thay thế người nghỉ không?"
      );
    }
  }

  if (asksAboutShifts || (asksAboutStaffProfiles && !asksAboutLeave) || includeOverview) {
    if (!sources.includes("Nhân sự & Lịch trực")) {
      sources.push("Nhân sự & Lịch trực");
    }
    const todayIso = analysis.todayIso;
    const win = analysis.requestedTimeWindow;
    const workingShiftsInWin = analysis.shiftsInWindow.filter(
      (s: any) => normalizeText(s?.workType) !== "nghi"
    );
    const todayShifts = workingShiftsInWin.filter(
      (s: any) => normalizeIsoDateStr(s?.date) === todayIso
    );

    if (asksAboutShifts) {
      const targetShifts = win.isExplicit && win.kind !== "day" ? workingShiftsInWin : todayShifts;
      const scopeLabel = win.isExplicit ? win.label : `Hôm nay (${analysis.todayLabel})`;

      metrics.push({
        label: "Lịch trực trong kỳ",
        value: `${targetShifts.length} ca`,
        tone: "blue",
      });
      if (sh.pendingSwapCount > 0) {
        metrics.push({
          label: "Yêu cầu đổi ca",
          value: `${sh.pendingSwapCount} chờ duyệt`,
          tone: "amber",
        });
      }

      if (targetShifts.length > 0) {
        parts.push(
          `👨‍⚕️ **Lịch phân ca / trực — ${scopeLabel} (${targetShifts.length} ca):**\n` +
            targetShifts
              .slice(0, 15)
              .map(
                (s: any) =>
                  `  • **${formatIsoToVN(s.date)}**: **${s.assignedUserName || "Chưa gán"}** — ${s.title}${s.room ? ` (${s.room})` : ""}${s.startTime ? ` [${s.startTime}-${s.endTime || ""}]` : ""}`
              )
              .join("\n")
        );
      } else {
        parts.push(
          `👨‍⚕️ **Lịch trực — ${scopeLabel}:** Chưa có lịch trực cụ thể được xếp trong khoảng ${win.startLabel} – ${win.endLabel}. Hiện có **${sh.todayAndUpcoming?.length || 0} lịch** trong khung 3 tuần quanh hôm nay.`
        );
      }
      contextualFollowUps.push(
        "Kiểm tra lịch đăng ký nghỉ của nhân viên tuần hiện tại?",
        "Có yêu cầu đổi ca trực nào đang chờ duyệt không?"
      );
    }
  }

  if ((asksAboutStaffProfiles && !asksAboutLeave && !asksAboutShifts) || analysis.matchedStaff.length > 0) {
    sources.push("Hồ sơ Nhân sự & Chứng chỉ");
    const staffList: any[] = Array.isArray(st.items) ? st.items : [];
    const expCerts: any[] = Array.isArray(st.expiringCertificates) ? st.expiringCertificates : [];

    if (analysis.matchedStaff.length > 0) {
      for (const s of analysis.matchedStaff.slice(0, 3)) {
        const sNorm = normalizeText(s.fullName);
        const personLeaves = collectNormalizedLeaves(liveContext).filter(
          (l) => normalizeText(l.userName) === sNorm
        );
        const personShifts = (sh.todayAndUpcoming || []).filter(
          (x: any) => normalizeText(x.assignedUserName || "") === sNorm
        );
        const unitSummary = formatUniqueUnitLabel([s.departmentSection, s.room]);
        parts.push(
          `👤 **Thông tin nhân sự — ${s.fullName}:**\n` +
            `  • Chức danh: ${s.title || "—"} | Đơn vị: ${unitSummary || "—"}\n` +
            `  • Trạng thái: **${s.currentStatus || "Đang công tác"}** | Chuyên môn: ${s.specialty || "—"}\n` +
            (personLeaves.length > 0
              ? `  • Lịch nghỉ (${personLeaves.length}): ${personLeaves
                  .slice(0, 4)
                  .map((l) => `${l.leaveType} (${formatIsoToVN(l.startDate)}–${formatIsoToVN(l.endDate)}: ${l.status})`)
                  .join("; ")}\n`
              : `  • Lịch nghỉ: Không có đơn nghỉ nào được ghi nhận.\n`) +
            `  • Lịch trực gần đây/sắp tới: ${personShifts.length} ca`
        );
      }
    } else {
      const deptSummary = new Map<string, number>();
      staffList.forEach((s) => {
        const key = s.departmentSection || "Khác";
        deptSummary.set(key, (deptSummary.get(key) || 0) + 1);
      });
      const activeTotal = st.activeCount ?? (staffList.length > 0 ? staffList.length : st.totalCount || 0);
      metrics.push({
        label: "Tổng nhân sự",
        value: `${activeTotal} đang làm`,
        tone: "blue",
      });
      if (expCerts.length > 0) {
        metrics.push({
          label: "Chứng chỉ lưu ý",
          value: `${expCerts.length} mục`,
          tone: "amber",
        });
      }
      parts.push(
        `👥 **Tổng quan nhân sự Khoa CLS (${activeTotal} đang công tác / ${st.totalCount || staffList.length} hồ sơ):**\n` +
          Array.from(deptSummary.entries())
            .map(([dept, cnt]) => `  • ${dept}: **${cnt} nhân sự**`)
            .join("\n") +
          (expCerts.length > 0
            ? `\n\n**Chứng chỉ sắp hết hạn / cần gia hạn (${expCerts.length}):**\n` +
              expCerts
                .slice(0, 8)
                .map((c: any) => `  • ${c.staffName}: ${c.certName} (Hạn: ${c.expiryDate} — ${c.status})`)
                .join("\n")
            : "")
      );
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
            .slice(0, 10)
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

  if (asksAboutTasks || asksAboutMeetings || includeOverview) {
    sources.push("Công việc & Cuộc họp");
    const byStatus = tk.byStatus || {};
    const pendingTasks = (tk.activeItems || []).filter((t: any) => t.status !== "Đã hoàn thành");
    if (asksAboutTasks || includeOverview) {
      metrics.push({
        label: "Công việc cần xử lý",
        value: `${pendingTasks.length}/${tk.totalCount || 0}`,
        tone: tk.overdueCount > 0 ? "amber" : "blue",
      });

      parts.push(
        `✅ **Công việc & Điều hành:** Tổng ${tk.totalCount || 0} việc (Chờ xử lý: ${byStatus["Chờ xử lý"] || 0}, Đang làm: ${byStatus["Đang thực hiện"] || 0}, Hoàn thành: ${byStatus["Đã hoàn thành"] || 0}, Quá hạn: ${tk.overdueCount || 0}).` +
          (pendingTasks.length > 0
            ? `\n` +
              pendingTasks
                .slice(0, 6)
                .map((t: any) => `  • [${t.priority}] ${t.title} — Phụ trách: ${t.assignee} (Hạn: ${formatIsoToVN(t.dueDate)})`)
                .join("\n")
            : "")
      );
      if (tk.overdueCount > 0) {
        actions.push(`Rà soát ${tk.overdueCount} công việc đã quá hạn.`);
      }
    }

    if (asksAboutMeetings || (mt.items || []).length > 0 || analysis.meetingsInWindow.length > 0) {
      const mList =
        analysis.meetingsInWindow.length > 0
          ? analysis.meetingsInWindow
          : (mt.items || []).slice(0, 5);
      if (mList.length > 0 && (asksAboutMeetings || includeOverview)) {
        parts.push(
          `📅 **Lịch họp & Kế hoạch (${analysis.requestedTimeWindow.label}):**\n` +
            mList
              .slice(0, 6)
              .map(
                (m: any) =>
                  `  • **${formatIsoToVN(m.date)} ${m.time || ""}**: ${m.title} (${m.location || "Khoa CLS"} · Chủ trì: ${m.chairperson || "Lãnh đạo khoa"} — ${m.status || ""})`
              )
              .join("\n")
        );
      } else if (asksAboutMeetings) {
        parts.push(`📅 **Lịch họp & Kế hoạch:** Hiện không có cuộc họp nào được lên lịch trong ${analysis.requestedTimeWindow.label}.`);
      }
    }
  }

  if (asksAboutSOP) {
    sources.push("Hồ sơ SOP & Tiêu chuẩn ISO 15189");
    if (/\b(tran do|hoa chat|spill kit|cobas)\b/.test(q)) {
      parts.push(
        "🧪 **SOP-CLS-XN-04 (Xử lý tràn đổ hóa chất):**\n" +
          "1. Cách ly hiện trường bán kính 2m, đeo PPE cấp 2 (găng nitrile dày, kính, N95, áo choàng).\n" +
          "2. Dùng Spill Kit phủ từ ngoài vào trong để cô lập.\n" +
          "3. Thu gom vào túi vàng nguy hại hóa học, khử khuẩn Presept 0.5% hoặc cồn 70°.\n" +
          "4. Lập biên bản BM-SOP-04-02 báo ĐDT và QLCL trong 2 giờ."
      );
    } else if (/\b(troponin|stat tat|thoi gian tat|tat khan|abg|khi mau)\b/.test(q)) {
      parts.push(
        "⏱️ **SOP-CLS-QC-01 (Tiêu chuẩn TAT khẩn theo ISO 15189:2022 Điều 7.3.7):**\n" +
          "• Troponin T hs / Troponin I khẩn: <= 30 phút.\n" +
          "• Khí máu động mạch (ABG): <= 15 phút | Điện giải / Đường huyết: <= 20 phút.\n" +
          "• X-quang ngực cấp cứu: <= 20 phút | CT sọ não Code Stroke: <= 25 phút."
      );
    } else if (/\b(can quang|chup ct|buc xa|egfr|metformin)\b/.test(q)) {
      parts.push(
        "☢️ **SOP-CLS-CDHA-02 (An toàn tiêm cản quang CT):**\n" +
          "• Đánh giá eGFR >= 45 mL/min/1.73m² (ngoại trú) hoặc >= 30 (cấp cứu có hội chẩn).\n" +
          "• Khai thác tiền sử dị ứng, hen, Metformin (ngưng 48h sau tiêm).\n" +
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
      `🔄 **Đồng bộ Google Sheet <-> Hệ thống:** Có ${sy.pendingDiscrepanciesCount || 0} mục sai lệch đang chờ xử lý.` +
        (lastRun
          ? `\n  • Lần gần nhất: ${lastRun.displayTime} (${lastRun.dateRangeLabel}) — ${lastRun.summary}`
          : "")
    );
  }

  const defaultFollowUps = [
    "Tóm tắt số liệu ngày gần nhất và so sánh với tháng này?",
    "Kiểm tra lịch đăng ký nghỉ của nhân viên tuần hiện tại?",
    "Thiết bị nào sắp đến hạn bảo trì hoặc hiệu chuẩn?",
  ];

  return {
    answer: parts.join("\n\n"),
    highlightedMetrics: metrics.slice(0, 4),
    actionChecklist: actions.slice(0, 5),
    dataSourcesUsed: Array.from(new Set(sources)),
    webSources: [],
    searchQueries: [],
    usedWebSearch: false,
    suggestedFollowUps:
      contextualFollowUps.length > 0 ? contextualFollowUps.slice(0, 3) : defaultFollowUps,
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

export function isCompactSummaryRequest(rawText: string): boolean {
  const clean = String(rawText || "").trim();
  if (!clean) return false;
  if (/^\/tomtat(?:@\S+)?(?:\s|$)/i.test(clean)) return true;

  const q = normalizeText(clean);
  return /^(tom tat(\s+(nhanh|giao ban|so lieu|tinh hinh|toan khoa))+)(\s+(hom nay|hom qua|hom kia|ngay.*))?$/.test(
    q
  );
}

export function isBriefingStatsRequest(rawText: string): boolean {
  const clean = String(rawText || "").trim();
  if (!clean) return false;
  if (/^\/giaoban(?:@\S+)?(?:\s|$)/i.test(clean)) return true;

  const q = normalizeText(clean);
  if (!q.includes("giao ban")) return false;

  const asksOtherModules =
    /\b(lich hop|cuoc hop|hop giao ban|ke hoach tuan|bien ban|ai truc|lich truc|ca truc|thiet bi|may moc|cong viec|nghi phep|xin nghi|sop|iso)\b/.test(
      q
    );
  if (asksOtherModules) return false;

  return (
    /\b(so lieu|bao cao|bang|thong ke|chi tiet|xem|cho|gui|lay|tong hop)\b/.test(q) ||
    /^giao ban(\s+(hom nay|hom qua|hom kia|ngay.*|so lieu.*))?$/.test(q)
  );
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
    liveContext: rawLiveContext,
    learnedMemories,
    useWebSearch,
    userName = "Cán bộ Khoa CLS",
    channel = "web",
  } = params;

  const normalizedHistory: Array<{ sender: "user" | "assistant"; content: string }> = Array.isArray(history)
    ? history
        .map((m: any) => ({
          sender: m?.sender === "user" || m?.role === "user" ? ("user" as const) : ("assistant" as const),
          content: String(m?.content ?? m?.text ?? ""),
        }))
        .filter((m) => m.content.trim().length > 0)
    : [];

  if (isCompactSummaryRequest(question)) {
    const { generateCompactSummaryReport } = await import("./scheduledAlerts");
    const report = await generateCompactSummaryReport({
      queryText: question,
      liveContext: rawLiveContext,
    });
    return {
      answer: report.telegramMarkdown,
      highlightedMetrics: (report.stats || []).slice(0, 4).map((s) => ({
        label: s.label,
        value: s.value,
        tone: s.tone === "good" ? "emerald" : s.tone === "warn" ? "amber" : s.tone === "danger" ? "rose" : "blue",
      })),
      actionChecklist: [],
      dataSourcesUsed: report.dataSourceNotes || ["Google Sheet + Kho báo cáo"],
      webSources: [],
      searchQueries: [],
      usedWebSearch: false,
      suggestedFollowUps: [
        "/giaoban",
        "Số liệu giao ban hôm qua?",
      ],
      modelUsed: "live-data-engine",
      usedLiveContext: true,
    };
  }

  if (isBriefingStatsRequest(question)) {
    const { generateInteractiveBriefingReport } = await import("./scheduledAlerts");
    const report = await generateInteractiveBriefingReport({
      queryText: question,
      liveContext: rawLiveContext,
    });
    return {
      answer: report.telegramMarkdown,
      highlightedMetrics: (report.stats || []).slice(0, 4).map((s) => ({
        label: s.label,
        value: s.value,
        tone: s.tone === "good" ? "emerald" : s.tone === "warn" ? "amber" : s.tone === "danger" ? "rose" : "blue",
      })),
      actionChecklist: [],
      dataSourcesUsed: report.dataSourceNotes || ["Google Sheet + Kho báo cáo"],
      webSources: [],
      searchQueries: [],
      usedWebSearch: false,
      suggestedFollowUps: [
        "Số liệu giao ban hôm qua?",
        "/tomtat",
      ],
      modelUsed: "live-data-engine",
      usedLiveContext: true,
    };
  }

  const liveContext = await enrichLiveContextWithPostgres(rawLiveContext, question);
  const ai = getGeminiClient();

  if (!ai) {
    return buildDeterministicAssistantAnswer(
      question,
      liveContext,
      "Chưa cấu hình GEMINI_API_KEY trên máy chủ nên trợ lý đang tổng hợp trực tiếp từ dữ liệu ứng dụng.",
      channel,
      normalizedHistory
    );
  }

  const effectiveMemories: LearnedMemoryEntry[] =
    Array.isArray(learnedMemories) && learnedMemories.length > 0
      ? learnedMemories
      : Array.isArray(liveContext?.assistantMemory?.memories)
      ? liveContext.assistantMemory.memories
      : [];

  const webToggleEnabled =
    useWebSearch !== undefined
      ? useWebSearch
      : liveContext?.assistantMemory?.webSearchEnabled !== false;

  const isPureInternalPattern = (textNorm: string) =>
    /(so ca|so lieu|sieu am|noi soi|x quang|x-quang|dien tim|xet nghiem|sinh hoa|huyet hoc|nuoc tieu|dong mau|vi sinh|msct|mri|thiet bi|may moc|hieu chuan|kiem chuan|bao tri|kiem xa|atbx|lich truc|ai truc|ca truc|doi ca|dang ky nghi|lich nghi|xin nghi|nghi phep|nghi om|thai san|khong luong|don nghi|nhan su|nhan vien|chung chi|cong viec|qua han|tre han|cuoc hop|lich hop|ke hoach tuan|dong bo|google sheet|giao ban|tai lieu|ho so)/.test(
      textNorm
    ) &&
    !/(internet|google|bo y te|who|khuyen cao|huong dan moi|tin tuc|thoi tiet|gia |luat |thong tu|nghi dinh|quy chuan quoc gia|nghien cuu|y van|tai sao benh|dieu tri)/.test(
      textNorm
    );

  const qNormForSearch = normalizeText(question);
  const prevUserNorm = normalizeText(
    [...normalizedHistory].reverse().find((m) => m.sender === "user")?.content || ""
  );
  const looksLikeShortInternalFollowUp =
    normalizedHistory.length > 0 &&
    qNormForSearch.split(" ").length <= 10 &&
    isPureInternalPattern(prevUserNorm) &&
    !/(internet|google|bo y te|who|khuyen cao|huong dan moi|tin tuc|thoi tiet|gia |luat |thong tu|nghi dinh|quy chuan quoc gia|nghien cuu|y van)/.test(
      qNormForSearch
    );

  const looksPurelyInternalHospitalQuery =
    isPureInternalPattern(qNormForSearch) || looksLikeShortInternalFollowUp;

  const effectiveWebSearch = webToggleEnabled && !looksPurelyInternalHospitalQuery;
  const needsDeeperReasoning =
    /(so sanh|phan tich|xu huong|tai sao|danh gia|de xuat|du bao|nguyen nhan|toi uu|chieu sau|kiem tra)/.test(
      qNormForSearch
    );

  const contextDigest = formatLiveContextDigest(liveContext, question, normalizedHistory);
  const recentHistoryText = normalizedHistory
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
      ? "Người dùng đang trao đổi qua Telegram Bot. Hãy giao tiếp tự nhiên, gần gũi như một trợ lý điều hành tận tâm trên điện thoại: trả lời thẳng trọng tâm ngay đoạn mở đầu, dùng gạch đầu dòng rõ ràng, dễ lướt nhanh, không dùng bảng Markdown nhiều cột (| ... |) vì màn hình Telegram không kẻ khung bảng."
      : "Người dùng đang trao đổi trực tiếp trên CLS WorkHub. Hãy trình bày như một trợ lý chuyên môn cấp cao: ấm áp, linh hoạt, mạch lạc, có phân tích điểm đáng chú ý và gợi mở hướng xử lý thực tế. Khi cần trình bày bảng số liệu, danh sách nghỉ phép, so sánh theo ngày/tháng, cơ cấu bộ phận, danh sách thiết bị hoặc lịch trực nhiều cột, hãy dùng Bảng Markdown chuẩn (`| Cột 1 | Cột 2 | ... |` kèm hàng phân cách `| :--- | ---: |`) để giao diện tự kẻ khung viền trực quan.";

  const systemInstruction = `Bạn là **Trợ Lý Chuyên Môn & Điều Hành Thông Minh** của Khoa Cận Lâm Sàng (CLS WorkHub Assistant).
${channelGuidance}

PHONG CÁCH GIAO TIẾP NHÂN TÍNH HÓA & CHUYÊN NGHIỆP:
- Giao tiếp tự nhiên, lịch sự, thấu hiểu ngữ cảnh (xưng "tôi" và gọi tên hoặc "bạn/anh/chị" phù hợp với người hỏi: ${userName}).
- Trả lời TRỰC DIỆN, ĐÚNG TRỌNG TÂM câu hỏi đặt ra trước tiên — không trả lời lan man sang phân hệ khác nếu người dùng không hỏi.
- KHÔNG sao chép máy móc nguyên cấu trúc JSON hay đọc liệt kê khô khan; hãy tổng hợp, đối chiếu số liệu, rút ra nhận định hữu ích (ví dụ: ngày này tăng/giảm so với ngày trước ra sao, có bao nhiêu đơn đã phê duyệt / chờ duyệt, ai thay thế, có máy hay đầu việc nào cần lưu ý không).
- Nếu câu hỏi tiếp nối hội thoại trước (VD: "còn tuần trước thì sao?", "người nào chưa duyệt?"), hãy kế thừa ngữ cảnh từ LỊCH SỬ HỘI THOẠI GẦN ĐÂY.

NGUỒN DỮ LIỆU KẾT HỢP (NỘI BỘ ỨNG DỤNG + INTERNET):
1. **Dữ liệu nội bộ ứng dụng CLS WorkHub** (ưu tiên tuyệt đối cho mọi câu hỏi về số liệu khoa, ngày/tháng báo cáo, nghỉ phép, nhân sự, lịch trực, máy móc, phòng ban, công việc, lịch họp, lịch sử đồng bộ, tài liệu ISO/SOP):
   - TUYỆT ĐỐI KHÔNG tự bịa số liệu nội bộ, tên nhân viên, trạng thái đơn nghỉ, tên máy hoặc ngày không có trong dữ liệu.
   - Chú ý đặc biệt tới khối \`queryAnalysis\` đã được hệ thống tính toán chuẩn xác theo múi giờ Việt Nam:
     • \`requestedTimeWindow\`: khoảng thời gian chính xác của câu hỏi (VD: "Tuần hiện tại: 16/11/2026 - 22/11/2026").
     • \`leavesInWindow\` & \`leaveStatsInWindow\` & \`staff.leaveRequests\`: ĐÂY LÀ TOÀN BỘ LỊCH ĐĂNG KÝ NGHỈ (bao gồm cả **Đã phê duyệt**, **Chờ duyệt**, **Từ chối**). Tuyệt đối phân biệt rạch ròi **Lịch nghỉ phép** với **Lịch trực (\`shifts\`)** — khi hỏi lịch đăng ký nghỉ, phải trả lời bằng \`leavesInWindow\` / \`staff.leaveRequests\`, không được nói nhầm sang lịch trực! Khi ghi tên đơn vị/bộ phận của nhân sự, ưu tiên dùng \`unitLabel\` và KHÔNG lặp lại hai lần cùng một tên nếu \`room\` và \`departmentSection\` giống nhau (tránh viết \`Siêu âm · Siêu âm\` hay \`Nội soi - Nội soi\`).
     • \`matchedServiceHistory\`, \`matchedRequestedDays\` & \`recentRecordedDays[].services\`: dùng cho câu hỏi số ca theo kỹ thuật/ngày. Nếu ngày mới nhất chưa ghi nhận kỹ thuật được hỏi (0 ca), hãy nêu rõ và trình bày đầy đủ N ngày gần nhất có dữ liệu thực tế.
2. **Tri thức & Tra cứu Internet (Google Search)**:
   - ${
     effectiveWebSearch
       ? "Bạn ĐƯỢC BẬT công cụ Google Search (`googleSearch`). Với MỌI câu hỏi chuyên môn y khoa mới, văn bản Bộ Y tế, tiêu chuẩn ISO/JCI, hướng dẫn chẩn đoán/xét nghiệm, công nghệ, thời sự, thời tiết, hoặc câu hỏi tổng quát bất kỳ mà dữ liệu nội bộ chưa bao phủ, hãy chủ động dùng Google Search để tra cứu thông tin chính xác, cập nhật nhất và lồng ghép mạch lạc với dữ liệu nội bộ (nếu liên quan)."
       : "Chế độ tra cứu Internet đang tạm tắt hoặc câu hỏi thuần nội bộ; chỉ sử dụng dữ liệu nội bộ và tri thức sẵn có."
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
1. Trước tiên, viết phần trả lời hoàn chỉnh bằng Tiếng Việt (Markdown tự nhiên với **chữ đậm**, bảng số liệu khi liệt kê/so sánh nhiều mục, gạch đầu dòng gọn đẹp).
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
      thinkingLevel: needsDeeperReasoning ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
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
      formatFriendlyGeminiError(err),
      channel,
      normalizedHistory
    );
  }
}

export async function generateLiveMorningBriefing(params: {
  reportDate: string;
  liveContext: any;
  fallbackStats?: any;
}) {
  const { reportDate, liveContext: rawLiveContext, fallbackStats } = params;
  const liveContext = await enrichLiveContextWithPostgres(rawLiveContext, "");
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
