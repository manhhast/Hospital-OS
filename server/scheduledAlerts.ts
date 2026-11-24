import { ThinkingLevel } from "@google/genai";
import type { Express, Request } from "express";
import type {
  AppSettings,
  DepartmentUnit,
  EquipmentItem,
  LeaveRequest,
  MeetingItem,
  NotificationLog,
  ParaclinicalRoom,
  ScheduledAlertChannel,
  ScheduledAlertHistoryItem,
  ScheduledAlertPreviewResult,
  ScheduledAlertRuleConfig,
  ScheduledAlertRuleId,
  ShiftDuty,
  StaffProfile,
  SyncHistoryAutoWrittenItem,
  SyncHistoryDiscrepancyItem,
  SyncHistoryEntry,
  TaskItem,
  User,
  WeeklyMeeting,
} from "../src/types/hospital";
import type { ArchivedCaseReportItem } from "../src/services/reportArchiveService";
import { formatUniqueUnitLabel } from "../src/utils/roomDisplay";
import {
  getGeminiClient,
  VALID_FALLBACK_MODEL,
  VALID_PRIMARY_MODEL,
} from "./assistantEngine";
import {
  fetchRawTabCsv,
  fetchSingleSheetTab,
  isValidServiceName,
  resolveSpreadsheetId,
} from "../src/utils/caseReportParser";
import {
  appendScheduledAlertHistoryToDb,
  appendSyncHistoryEntryToDb,
  appendSystemNotificationToDb,
  clearTodayAlertLocksForRule,
  isPostgresConfigured,
  loadCloudBucketsForServer,
  loadCloudBucketsStatusForServer,
  loadReportArchiveMonthForServer,
  loadReportArchiveMonthStatusForServer,
  loadScheduledAlertHistoryFromDb,
  loadStoredTelegramSettingsFromDb,
  mergeSheetConfigIntoSettingsDbIfMissing,
  releaseDailyAlertLock,
  requireAdminAuth,
  requireAppAuth,
  saveScheduledAlertRulesToDb,
  tryClaimDailyAlertLock,
  upsertReportArchiveMonthFromServer,
} from "./postgresSync";
import { telegramManager } from "./telegramBot";

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

export const DEFAULT_SCHEDULED_ALERT_RULES: ScheduledAlertRuleConfig[] = [
  {
    id: "morning_0700",
    name: "Giao ban Sáng & Cảnh báo Đầu ngày",
    description:
      "Tổng hợp công việc cần làm hôm nay, công việc chưa hoàn thành/quá hạn, số người nghỉ, nhân sự trực, lịch họp và thiết bị sắp hết hạn.",
    enabled: true,
    timeHHmm: "07:00",
    channel: "telegram_and_inapp",
    equipmentWarningDays: 30,
  },
  {
    id: "noon_services_1245",
    name: "Tổng hợp Dịch vụ Kỹ thuật Ngày Hôm Trước",
    description:
      "Tự động tổng hợp số liệu dịch vụ kỹ thuật ngày hôm trước từ Google Sheet / Kho báo cáo (BHYT, Nhân dân, từng nhóm kỹ thuật) và báo qua Telegram.",
    enabled: true,
    timeHHmm: "12:45",
    channel: "telegram_and_inapp",
  },
  {
    id: "evening_1700",
    name: "Báo cáo Cuối ngày & Chuẩn bị Ngày mai",
    description:
      "Tổng kết công việc trong ngày, tồn đọng bàn giao và danh sách công việc, lịch trực, nhân sự nghỉ, lịch họp, thiết bị cần chuẩn bị cho ngày mai.",
    enabled: true,
    timeHHmm: "17:00",
    channel: "telegram_and_inapp",
    equipmentWarningDays: 30,
  },
];

let cachedRulesOverlay: ScheduledAlertRuleConfig[] | null = null;
let cachedLiveContextSnapshot: any = null;
let schedulerInterval: NodeJS.Timeout | null = null;
let isTickRunning = false;

// Catch-up windows (minutes after scheduled HH:mm) so container sleep/scale-to-zero never skips a day's report
const RULE_CATCHUP_WINDOW_MIN: Record<ScheduledAlertRuleId, number> = {
  morning_0700: 240, // 07:00 -> 11:00
  noon_services_1245: 600, // 12:45 -> 22:45
  evening_1700: 330, // 17:00 -> 22:30
};
// When user saves a schedule time already >15 min in the past for today, skip catch-up for that rule today
const skippedPastEditKeys = new Set<string>();
const failedRetryTracker = new Map<string, { count: number; nextRetryAtMs: number }>();

function pruneDailyAlertTrackers(todayISO: string): void {
  const dateMarker = `_${todayISO}_`;
  for (const key of skippedPastEditKeys) {
    if (!key.includes(dateMarker)) {
      skippedPastEditKeys.delete(key);
    }
  }
  while (skippedPastEditKeys.size > 100) {
    const oldest = skippedPastEditKeys.values().next().value;
    if (oldest === undefined) break;
    skippedPastEditKeys.delete(oldest);
  }
  for (const key of failedRetryTracker.keys()) {
    if (!key.includes(dateMarker)) {
      failedRetryTracker.delete(key);
    }
  }
  while (failedRetryTracker.size > 100) {
    const oldest = failedRetryTracker.keys().next().value;
    if (oldest === undefined) break;
    failedRetryTracker.delete(oldest);
  }
}

export interface VNNowParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateISO: string;
  timeHHmm: string;
  dateTimeVN: string;
  dateTimeLog: string;
  minuteOfDay: number;
}

export function getVNNowParts(now: Date = new Date()): VNNowParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const getNum = (type: Intl.DateTimeFormatPartTypes, fallback = 0): number => {
    const raw = parts.find((p) => p.type === type)?.value || "";
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  const year = getNum("year", now.getUTCFullYear());
  const month = getNum("month", now.getUTCMonth() + 1);
  const day = getNum("day", now.getUTCDate());
  let hour = getNum("hour", 0);
  if (hour === 24) hour = 0;
  const minute = getNum("minute", 0);
  const second = getNum("second", 0);

  const p2 = (n: number) => String(n).padStart(2, "0");
  const dateISO = `${year}-${p2(month)}-${p2(day)}`;
  const timeHHmm = `${p2(hour)}:${p2(minute)}`;
  const dateTimeVN = `${p2(day)}/${p2(month)}/${year} ${p2(hour)}:${p2(minute)}:${p2(second)}`;
  const dateTimeLog = `${dateISO} ${p2(hour)}:${p2(minute)}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateISO,
    timeHHmm,
    dateTimeVN,
    dateTimeLog,
    minuteOfDay: hour * 60 + minute,
  };
}

export function offsetDateISO(baseISO: string, deltaDays: number): string {
  const m = String(baseISO || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return baseISO;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(Date.UTC(y, mo - 1, d + deltaDays));
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
}

export function formatDateISOToVN(dateISO?: string): string {
  const clean = String(dateISO || "").trim().slice(0, 10);
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return clean || "Chưa rõ";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function getVNWeekdayLabel(dateISO: string): string {
  const m = String(dateISO || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  const names = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  return names[dt.getUTCDay()] || "";
}

function diffDaysBetweenISO(targetISO: string, baseISO: string): number | null {
  const tMatch = String(targetISO || "").trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const bMatch = String(baseISO || "").trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!tMatch || !bMatch) return null;
  const tUtc = Date.UTC(parseInt(tMatch[1], 10), parseInt(tMatch[2], 10) - 1, parseInt(tMatch[3], 10));
  const bUtc = Date.UTC(parseInt(bMatch[1], 10), parseInt(bMatch[2], 10) - 1, parseInt(bMatch[3], 10));
  return Math.round((tUtc - bUtc) / (24 * 60 * 60 * 1000));
}

function parseTimeHHmmToMinutes(hhmm: string): number | null {
  const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

export function normalizeScheduledRules(raw?: unknown): ScheduledAlertRuleConfig[] {
  const incomingList = Array.isArray(raw) ? raw : [];
  return DEFAULT_SCHEDULED_ALERT_RULES.map((def) => {
    const found = incomingList.find(
      (r: any) => r && typeof r === "object" && r.id === def.id
    ) as Partial<ScheduledAlertRuleConfig> | undefined;
    if (!found) return { ...def };

    const validTime = parseTimeHHmmToMinutes(String(found.timeHHmm || "")) !== null
      ? String(found.timeHHmm).trim().padStart(5, "0")
      : def.timeHHmm;
    const validChannel: ScheduledAlertChannel =
      found.channel === "telegram" || found.channel === "inapp" || found.channel === "telegram_and_inapp"
        ? found.channel
        : def.channel;
    const warnDays =
      typeof found.equipmentWarningDays === "number" && Number.isFinite(found.equipmentWarningDays)
        ? Math.min(90, Math.max(1, Math.round(found.equipmentWarningDays)))
        : def.equipmentWarningDays;

    return {
      id: def.id,
      name: typeof found.name === "string" && found.name.trim() ? found.name.trim().slice(0, 100) : def.name,
      description: def.description,
      enabled: typeof found.enabled === "boolean" ? found.enabled : def.enabled,
      timeHHmm: validTime,
      channel: validChannel,
      ...(def.id !== "noon_services_1245" ? { equipmentWarningDays: warnDays || 30 } : {}),
      customChatId: typeof found.customChatId === "string" ? found.customChatId.trim().slice(0, 64) : undefined,
    };
  });
}

interface ResolvedHospitalDataset {
  settings: Partial<AppSettings>;
  tasks: TaskItem[];
  equipment: EquipmentItem[];
  rooms: ParaclinicalRoom[];
  departments: DepartmentUnit[];
  shifts: ShiftDuty[];
  leaveRequests: LeaveRequest[];
  meetings: WeeklyMeeting[];
  meetingItems: MeetingItem[];
  users: User[];
  staffProfiles: StaffProfile[];
  liveContext: any;
  dataSourceNotes: string[];
  dbConfigured: boolean;
  dbReachable: boolean;
}

function pickNonEmptyArray<T>(dbVal: unknown, ctxVal: unknown): T[] {
  if (Array.isArray(dbVal) && dbVal.length > 0) return dbVal as T[];
  if (Array.isArray(ctxVal) && ctxVal.length > 0) return ctxVal as T[];
  return Array.isArray(dbVal) ? (dbVal as T[]) : Array.isArray(ctxVal) ? (ctxVal as T[]) : [];
}

function mergeSettingsPreservingNonEmpty(
  ctxSettings: Partial<AppSettings>,
  dbSettings: Partial<AppSettings>
): Partial<AppSettings> {
  const merged: Partial<AppSettings> = {
    ...ctxSettings,
    ...dbSettings,
  };
  const ctxUrl = String(ctxSettings.googleSheetUrl || "").trim();
  const dbUrl = String(dbSettings.googleSheetUrl || "").trim();
  if (dbUrl || ctxUrl) {
    merged.googleSheetUrl = dbUrl || ctxUrl;
  }
  const ctxId = String(ctxSettings.reportGoogleSheetId || "").trim();
  const dbId = String(dbSettings.reportGoogleSheetId || "").trim();
  if (dbId || ctxId) {
    merged.reportGoogleSheetId = dbId || ctxId;
  }
  if (!merged.reportSheetYear && ctxSettings.reportSheetYear) {
    merged.reportSheetYear = ctxSettings.reportSheetYear;
  }
  const mergedByYear: Record<string, any> = {
    ...(ctxSettings.reportGoogleSheetsByYear || {}),
  };
  for (const [yr, dbCfg] of Object.entries(dbSettings.reportGoogleSheetsByYear || {})) {
    const ctxCfg = mergedByYear[yr];
    const dbHas = Boolean(dbCfg && (String(dbCfg.url || "").trim() || String(dbCfg.sheetId || "").trim()));
    if (dbHas || !ctxCfg) {
      mergedByYear[yr] = dbCfg;
    }
  }
  if (Object.keys(mergedByYear).length > 0) {
    merged.reportGoogleSheetsByYear = mergedByYear;
  }
  const ctxToken = String(ctxSettings.telegramBotToken || "").trim();
  const dbToken = String(dbSettings.telegramBotToken || "").trim();
  if (dbToken || ctxToken) {
    merged.telegramBotToken = dbToken || ctxToken;
  }
  const ctxChat = String(ctxSettings.defaultTelegramChatId || "").trim();
  const dbChat = String(dbSettings.defaultTelegramChatId || "").trim();
  if (dbChat || ctxChat) {
    merged.defaultTelegramChatId = dbChat || ctxChat;
  }
  return merged;
}

async function resolveHospitalDataset(liveContextOverride?: any): Promise<ResolvedHospitalDataset> {
  if (liveContextOverride && typeof liveContextOverride === "object") {
    cachedLiveContextSnapshot = liveContextOverride;
    telegramManager.updateLiveContext(liveContextOverride);
  }
  const liveCtx = liveContextOverride || telegramManager.getLiveContext() || cachedLiveContextSnapshot;

  const dbRes = await loadCloudBucketsStatusForServer([
    "settings",
    "tasks",
    "equipment",
    "rooms",
    "departments",
    "shifts",
    "leave_requests",
    "meetings",
    "meeting_items",
    "users",
    "staff_profiles",
  ]);
  const buckets = dbRes.buckets;

  const dataSourceNotes: string[] = [];
  const hasDbBuckets = Object.keys(buckets).length > 0;
  if (hasDbBuckets) {
    dataSourceNotes.push("Cơ sở dữ liệu PostgreSQL");
  } else if (liveCtx) {
    dataSourceNotes.push("Ảnh đồng bộ trực tiếp từ trình duyệt");
  }

  const settingsFromDb =
    Array.isArray(buckets.settings) && buckets.settings[0]
      ? (buckets.settings[0] as Partial<AppSettings>)
      : {};
  const settingsFromCtx =
    liveCtx?.settings && typeof liveCtx.settings === "object"
      ? (liveCtx.settings as Partial<AppSettings>)
      : {};
  const mergedSettings = mergeSettingsPreservingNonEmpty(settingsFromCtx, settingsFromDb);

  const tasks = pickNonEmptyArray<TaskItem>(
    buckets.tasks,
    liveCtx?.tasks?.activeItems ?? liveCtx?.tasks?.items
  );

  const equipment = pickNonEmptyArray<EquipmentItem>(
    buckets.equipment,
    liveCtx?.equipment?.items
  );

  const rooms = pickNonEmptyArray<ParaclinicalRoom>(
    buckets.rooms,
    liveCtx?.rooms?.items
  );

  const departments = pickNonEmptyArray<DepartmentUnit>(
    buckets.departments,
    liveCtx?.rooms?.departments
  );

  const shifts = pickNonEmptyArray<ShiftDuty>(
    buckets.shifts,
    liveCtx?.shifts?.todayAndUpcoming ?? liveCtx?.shifts?.items
  );

  const leaveRequests = pickNonEmptyArray<LeaveRequest>(
    buckets.leave_requests,
    liveCtx?.staff?.leaveRequests ?? liveCtx?.hr?.leaveRequests
  );

  const meetings = pickNonEmptyArray<WeeklyMeeting>(
    buckets.meetings,
    liveCtx?.meetings?.weeklyPlans ?? liveCtx?.meetings?.weeklyMeetings
  );

  const meetingItems = pickNonEmptyArray<MeetingItem>(
    buckets.meeting_items,
    liveCtx?.meetings?.items
  );

  const users = Array.isArray(buckets.users)
    ? (buckets.users as unknown as User[])
    : [];

  const staffProfiles = pickNonEmptyArray<StaffProfile>(
    buckets.staff_profiles,
    liveCtx?.staff?.items
  );

  return {
    settings: mergedSettings,
    tasks,
    equipment,
    rooms,
    departments,
    shifts,
    leaveRequests,
    meetings,
    meetingItems,
    users,
    staffProfiles,
    liveContext: liveCtx,
    dataSourceNotes,
    dbConfigured: dbRes.configured,
    dbReachable: dbRes.reachable,
  };
}

interface ExpiringEquipmentFinding {
  equipmentName: string;
  equipmentCode: string;
  room: string;
  trackLabel: string;
  expiryDateISO: string;
  daysRemaining: number;
  technician: string;
}

function scanEquipmentAlertsForDate(
  equipment: EquipmentItem[],
  referenceISO: string,
  warningDays: number
): {
  expiringAlerts: ExpiringEquipmentFinding[];
  brokenOrLocked: EquipmentItem[];
} {
  const expiringAlerts: ExpiringEquipmentFinding[] = [];
  const brokenOrLocked: EquipmentItem[] = [];

  for (const eq of equipment) {
    if (!eq || !eq.name) continue;
    if (
      eq.isLockedOut ||
      eq.status === "Sự cố hỏng hóc" ||
      eq.status === "Cần bảo trì" ||
      eq.status === "Tạm ngưng"
    ) {
      brokenOrLocked.push(eq);
    }

    const tracks: Array<{ label: string; date?: string }> = [
      { label: "Giấy phép hoạt động", date: eq.operatingPermitExpiry },
      { label: "Kiểm chuẩn / Hiệu chuẩn ISO", date: eq.calibrationExpiry },
      {
        label: "An toàn bức xạ",
        date: eq.radiationSurveyExpiry || eq.radiationLicenseExpiry,
      },
      { label: "Bảo trì định kỳ", date: eq.nextMaintenanceDate },
    ];

    for (const tr of tracks) {
      const cleanDate = String(tr.date || "").trim().slice(0, 10);
      if (!cleanDate) continue;
      const daysRemaining = diffDaysBetweenISO(cleanDate, referenceISO);
      if (daysRemaining === null) continue;
      if (daysRemaining <= warningDays) {
        expiringAlerts.push({
          equipmentName: eq.name,
          equipmentCode: eq.code || eq.id,
          room: eq.room || "Chưa phân phòng",
          trackLabel: tr.label,
          expiryDateISO: cleanDate,
          daysRemaining,
          technician: eq.assignedTechnician || eq.managerInCharge || "Tổ TBYT",
        });
      }
    }
  }

  expiringAlerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return { expiringAlerts, brokenOrLocked };
}

function collectLeaveForDate(
  leaveRequests: LeaveRequest[],
  shifts: ShiftDuty[],
  targetISO: string
): Array<{ name: string; detail: string; substitute?: string; statusLabel: string }> {
  const resultMap = new Map<
    string,
    { name: string; detail: string; substitute?: string; statusLabel: string }
  >();

  for (const lr of leaveRequests) {
    if (!lr || !lr.userName) continue;
    if (lr.status === "Từ chối") continue;
    const start = String(lr.startDate || "").trim().slice(0, 10);
    const end = String(lr.endDate || start).trim().slice(0, 10);
    if (!start) continue;
    if (start <= targetISO && end >= targetISO) {
      const key = lr.userName.trim().toLowerCase();
      resultMap.set(key, {
        name: lr.userName.trim(),
        detail: `${lr.leaveType}${lr.reason ? ` (${lr.reason})` : ""}`,
        substitute: lr.substituteUserName?.trim() || undefined,
        statusLabel: lr.status === "Chờ duyệt" ? "Chờ duyệt" : "Đã duyệt",
      });
    }
  }

  for (const sh of shifts) {
    if (!sh) continue;
    const d = String(sh.date || "").trim().slice(0, 10);
    if (d !== targetISO || sh.workType !== "Nghỉ") continue;
    const staffName = String(sh.userName || sh.assignedUserName || "").trim();
    if (!staffName) continue;
    const key = staffName.toLowerCase();
    if (!resultMap.has(key)) {
      resultMap.set(key, {
        name: staffName,
        detail: sh.notes || sh.title || "Nghỉ theo lịch phân ca",
        statusLabel: "Theo lịch trực",
      });
    }
  }

  return Array.from(resultMap.values());
}

function collectOnDutyForDate(shifts: ShiftDuty[], targetISO: string): ShiftDuty[] {
  return shifts
    .filter((sh) => {
      if (!sh) return false;
      const d = String(sh.date || "").trim().slice(0, 10);
      return d === targetISO && sh.workType !== "Nghỉ";
    })
    .sort((a, b) =>
      String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99"))
    );
}

function collectMeetingsForDate(
  meetings: WeeklyMeeting[],
  meetingItems: MeetingItem[],
  targetISO: string
): Array<{ title: string; time: string; location: string; chair?: string }> {
  const list: Array<{ title: string; time: string; location: string; chair?: string }> = [];
  const seen = new Set<string>();

  for (const m of meetingItems) {
    if (!m || m.status === "Hủy") continue;
    if (String(m.date || "").trim().slice(0, 10) !== targetISO) continue;
    const key = `${m.title}|${m.time}`.toLowerCase();
    seen.add(key);
    list.push({
      title: m.title,
      time: m.time || "Trong ngày",
      location: m.location || "Khoa CLS",
      chair: m.chairperson,
    });
  }

  for (const wm of meetings) {
    if (!wm || wm.status === "Hủy") continue;
    if (String(wm.date || "").trim().slice(0, 10) !== targetISO) continue;
    const key = `${wm.title}|${wm.time || ""}`.toLowerCase();
    if (seen.has(key)) continue;
    list.push({
      title: wm.title,
      time: wm.time || "Trong ngày",
      location: wm.location || "Khoa CLS",
      chair: wm.chairperson,
    });
  }

  return list.sort((a, b) => a.time.localeCompare(b.time));
}

function priorityScore(p?: string): number {
  if (p === "Khẩn cấp") return 0;
  if (p === "Cao") return 1;
  if (p === "Trung bình") return 2;
  return 3;
}

function formatExpiryDeltaLabel(days: number): string {
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return "Hết hạn HÔM NAY";
  return `Còn ${days} ngày`;
}

// ==========================================
// 1. MORNING 07:00 BRIEFING BUILDER
// ==========================================
export function buildMorningBriefing(
  data: ResolvedHospitalDataset,
  todayISO: string,
  warningDays = 30,
  generatedAtVN = "",
  scheduleTimeHHmm = "07:00"
): ScheduledAlertPreviewResult {
  const weekday = getVNWeekdayLabel(todayISO);
  const dateVN = formatDateISOToVN(todayISO);

  const openTasks = data.tasks.filter(
    (t) => t && t.status !== "Đã hoàn thành" && t.status !== "Hủy"
  );
  const tasksDueToday = openTasks
    .filter((t) => String(t.dueDate || "").trim().slice(0, 10) === todayISO)
    .sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority));

  const tasksOverdue = openTasks
    .filter((t) => {
      const d = String(t.dueDate || "").trim().slice(0, 10);
      return Boolean(d) && d < todayISO;
    })
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  const tasksOtherOpen = openTasks.filter((t) => {
    const d = String(t.dueDate || "").trim().slice(0, 10);
    return !d || d > todayISO;
  });

  const leaveList = collectLeaveForDate(data.leaveRequests, data.shifts, todayISO);
  const dutyList = collectOnDutyForDate(data.shifts, todayISO);
  const meetingsToday = collectMeetingsForDate(data.meetings, data.meetingItems, todayISO);
  const eqScan = scanEquipmentAlertsForDate(data.equipment, todayISO, warningDays);

  const lines: string[] = [];
  lines.push(`☀️ **BẢN TIN GIAO BAN SÁNG KHOA CLS (${weekday}, ${dateVN})**`);
  lines.push(`⏰ Tự động tổng hợp lúc **${scheduleTimeHHmm}** (Giờ Việt Nam)`);
  lines.push("");

  // 1. Today's tasks & overdue tasks
  lines.push(`📋 **1. CÔNG VIỆC HÔM NAY & TỒN ĐỌNG (${openTasks.length} việc chưa hoàn thành)**`);
  if (tasksDueToday.length > 0) {
    lines.push(`• **Đến hạn hôm nay (${tasksDueToday.length}):**`);
    tasksDueToday.slice(0, 8).forEach((t, idx) => {
      lines.push(
        `  ${idx + 1}. [${t.priority}] ${t.title} — _${t.assignee || "Chưa gán"}_ (${t.status})`
      );
    });
    if (tasksDueToday.length > 8) {
      lines.push(`  _... và ${tasksDueToday.length - 8} công việc đến hạn khác._`);
    }
  } else {
    lines.push(`• **Đến hạn hôm nay:** Không có đầu việc mới đến hạn trong ngày.`);
  }

  if (tasksOverdue.length > 0) {
    lines.push(`• 🔴 **Chưa hoàn thành / Quá hạn (${tasksOverdue.length}):**`);
    tasksOverdue.slice(0, 8).forEach((t, idx) => {
      const lateDays = Math.abs(diffDaysBetweenISO(t.dueDate, todayISO) || 0);
      lines.push(
        `  ${idx + 1}. ${t.title} — _${t.assignee || "Chưa gán"}_ (hạn ${formatDateISOToVN(
          t.dueDate
        )}, trễ ${lateDays} ngày)`
      );
    });
    if (tasksOverdue.length > 8) {
      lines.push(`  _... và ${tasksOverdue.length - 8} công việc quá hạn khác._`);
    }
  } else if (tasksOtherOpen.length > 0) {
    lines.push(`• **Việc đang triển khai hạn sau hôm nay:** ${tasksOtherOpen.length} công việc.`);
  } else if (openTasks.length === 0) {
    lines.push(`• ✅ Hiện không có công việc tồn đọng hoặc quá hạn.`);
  }
  lines.push("");

  // 2. Staff on leave today
  lines.push(`🏖️ **2. NHÂN SỰ NGHỈ HÔM NAY: ${leaveList.length} người**`);
  if (leaveList.length > 0) {
    leaveList.slice(0, 10).forEach((l, idx) => {
      const subText = l.substitute ? ` · Thay ca: ${l.substitute}` : "";
      lines.push(`  ${idx + 1}. **${l.name}** — ${l.detail} [${l.statusLabel}]${subText}`);
    });
  } else {
    lines.push(`• Đầy đủ quân số, không có nhân sự đăng ký nghỉ hôm nay.`);
  }
  lines.push("");

  // 3. On duty today
  lines.push(`🩺 **3. LỊCH TRỰC & PHÂN CA HÔM NAY (${dutyList.length} lượt phân công)**`);
  if (dutyList.length > 0) {
    dutyList.slice(0, 12).forEach((sh, idx) => {
      const name = sh.userName || sh.assignedUserName || "Chưa rõ";
      const timeStr =
        sh.startTime && sh.endTime
          ? `${sh.startTime}–${sh.endTime}`
          : sh.shiftTime || sh.shiftName || sh.workType || "Trong ca";
      const place = formatUniqueUnitLabel([sh.room || sh.roomLocation, sh.machine], " / ");
      lines.push(
        `  ${idx + 1}. **${name}** (${sh.workType || "Ca trực"} · ${timeStr})${
          place ? ` — ${place}` : ""
        }`
      );
    });
    if (dutyList.length > 12) {
      lines.push(`  _... và ${dutyList.length - 12} lượt trực/làm việc khác._`);
    }
  } else {
    lines.push(`• Chưa ghi nhận lịch trực ngày ${dateVN} trong phân hệ Lịch trực.`);
  }

  if (meetingsToday.length > 0) {
    lines.push(`• 📅 **Lịch họp hôm nay (${meetingsToday.length}):**`);
    meetingsToday.slice(0, 5).forEach((m) => {
      lines.push(`  - ${m.time}: ${m.title} (${m.location})`);
    });
  }
  lines.push("");

  // 4. Equipment expiring / broken
  const expiredCount = eqScan.expiringAlerts.filter((e) => e.daysRemaining < 0).length;
  lines.push(
    `🛠️ **4. THIẾT BỊ SẮP HẾT HẠN (≤${warningDays} NGÀY) & CẦN XỬ LÝ (${eqScan.expiringAlerts.length} mốc, ${eqScan.brokenOrLocked.length} máy cảnh báo trạng thái)**`
  );
  if (eqScan.brokenOrLocked.length > 0) {
    eqScan.brokenOrLocked.slice(0, 5).forEach((eq) => {
      lines.push(
        `  • ⚠️ **${eq.name}** (${eq.code}) — ${eq.isLockedOut ? "ĐANG KHÓA AN TOÀN" : eq.status} (${eq.room})`
      );
    });
  }
  if (eqScan.expiringAlerts.length > 0) {
    eqScan.expiringAlerts.slice(0, 10).forEach((a, idx) => {
      const icon = a.daysRemaining < 0 ? "🔴" : a.daysRemaining <= 7 ? "🟠" : "🟡";
      lines.push(
        `  ${idx + 1}. ${icon} **${a.equipmentName}** (${a.equipmentCode}) — ${a.trackLabel}: ${formatDateISOToVN(
          a.expiryDateISO
        )} (${formatExpiryDeltaLabel(a.daysRemaining)}) · PT: ${a.technician}`
      );
    });
    if (eqScan.expiringAlerts.length > 10) {
      lines.push(`  _... và ${eqScan.expiringAlerts.length - 10} mốc thiết bị sắp hết hạn khác._`);
    }
  } else if (eqScan.brokenOrLocked.length === 0) {
    lines.push(`• ✅ Tất cả thiết bị đều còn hạn kiểm định/bảo trì trên ${warningDays} ngày.`);
  }

  const inAppSummary = `Giao ban sáng ${dateVN}: ${tasksDueToday.length} việc đến hạn hôm nay, ${tasksOverdue.length} việc quá hạn, ${leaveList.length} người nghỉ, ${dutyList.length} lượt trực, ${eqScan.expiringAlerts.length} mốc thiết bị ≤${warningDays} ngày (${expiredCount} quá hạn).`;

  return {
    ruleId: "morning_0700",
    ruleName: "Giao ban Sáng & Cảnh báo Đầu ngày",
    targetDateVN: todayISO,
    generatedAtVN,
    title: `Giao ban sáng Khoa CLS (${dateVN})`,
    telegramMarkdown: lines.join("\n"),
    inAppSummary,
    stats: [
      {
        label: "Việc hôm nay",
        value: `${tasksDueToday.length} việc`,
        tone: tasksDueToday.length > 0 ? "warn" : "good",
      },
      {
        label: "Chưa xong / Quá hạn",
        value: `${tasksOverdue.length} trễ / ${openTasks.length} mở`,
        tone: tasksOverdue.length > 0 ? "danger" : "good",
      },
      {
        label: "Nghỉ / Trực hôm nay",
        value: `${leaveList.length} nghỉ · ${dutyList.length} trực`,
        tone: "neutral",
      },
      {
        label: `Máy ≤${warningDays} ngày`,
        value: `${eqScan.expiringAlerts.length} mốc (${expiredCount} trễ)`,
        tone: expiredCount > 0 ? "danger" : eqScan.expiringAlerts.length > 0 ? "warn" : "good",
      },
    ],
    dataSourceNotes: data.dataSourceNotes,
  };
}

// ==========================================
// 2. NOON 12:45 TECHNICAL SERVICES BUILDER
// ==========================================
function toIntSafe(v: number | string | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const clean = String(v).trim();
  if (clean.toUpperCase() === "LT") return 0;
  const parsed = parseInt(clean.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normCellPartServer(v: number | string | undefined): string {
  if (v === undefined || v === null || v === "") return "0";
  if (String(v).trim().toUpperCase() === "LT") return "LT";
  const n =
    typeof v === "number"
      ? v
      : parseInt(String(v).replace(/[^0-9]/g, ""), 10) || 0;
  return String(n);
}

function toCleanCaseCellServer(val?: { bh?: number | string; nd?: number | string }): {
  bh: number | "LT";
  nd: number | "LT";
} {
  if (!val) return { bh: 0, nd: 0 };
  const bhStr = normCellPartServer(val.bh);
  const ndStr = normCellPartServer(val.nd);
  return {
    bh: bhStr === "LT" ? "LT" : parseInt(bhStr, 10) || 0,
    nd: ndStr === "LT" ? "LT" : parseInt(ndStr, 10) || 0,
  };
}

function hasRecordedCellValueServer(val?: { bh?: number | string; nd?: number | string }): boolean {
  if (!val) return false;
  const bhStr = String(val.bh ?? "").trim().toUpperCase();
  const ndStr = String(val.nd ?? "").trim().toUpperCase();
  if (bhStr === "LT" || ndStr === "LT") return true;
  return toIntSafe(val.bh) > 0 || toIntSafe(val.nd) > 0;
}

function isSameCaseCellServer(
  a?: { bh?: number | string; nd?: number | string },
  b?: { bh?: number | string; nd?: number | string }
): boolean {
  return (
    normCellPartServer(a?.bh) === normCellPartServer(b?.bh) &&
    normCellPartServer(a?.nd) === normCellPartServer(b?.nd)
  );
}

function normalizeSvcKeyServer(category: string, name: string): string {
  return `${String(category || "").trim().toLowerCase()}__${String(name || "").trim().toLowerCase()}`;
}

/**
 * Full-match overwrite of Google Sheet data into stored archive within specified day windows.
 * Records both newly filled empty cells AND detailed original -> replacement data for every overwritten service.
 */
function overwriteArchiveDaysFromSheet(params: {
  year: number;
  monthNum: number;
  monthKey: string;
  existingItems: ArchivedCaseReportItem[];
  sheetItems: ArchivedCaseReportItem[];
  targetDays: number[];
  actorLabel: string;
  resolvedAtDisplay: string;
}): {
  merged: ArchivedCaseReportItem[];
  checkedCellsCount: number;
  autoWrittenCount: number;
  updatedFromSheetCount: number;
  autoWrittenSamples: SyncHistoryAutoWrittenItem[];
  overwrittenDiscrepancies: SyncHistoryDiscrepancyItem[];
} {
  const {
    year,
    monthNum,
    monthKey,
    existingItems,
    sheetItems,
    targetDays,
    actorLabel,
    resolvedAtDisplay,
  } = params;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const nowIso = new Date().toISOString();
  const uniqueDays = Array.from(
    new Set(targetDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))
  ).sort((a, b) => a - b);

  if (sheetItems.length === 0) {
    return {
      merged: existingItems,
      checkedCellsCount: 0,
      autoWrittenCount: 0,
      updatedFromSheetCount: 0,
      autoWrittenSamples: [],
      overwrittenDiscrepancies: [],
    };
  }

  const nextItems: ArchivedCaseReportItem[] = existingItems.map((it) => ({
    ...it,
    dailyData: { ...(it.dailyData || {}) },
    manualDays: it.manualDays ? { ...it.manualDays } : undefined,
  }));

  const incomingByFullKey = new Map<string, ArchivedCaseReportItem>();
  const incomingByName = new Map<string, ArchivedCaseReportItem>();
  for (const inc of sheetItems) {
    incomingByFullKey.set(normalizeSvcKeyServer(inc.category, inc.name), inc);
    incomingByName.set(String(inc.name || "").trim().toLowerCase(), inc);
  }

  const matchedIncomingKeys = new Set<string>();
  let checkedCellsCount = 0;
  let autoWrittenCount = 0;
  let updatedFromSheetCount = 0;
  const autoWrittenSamples: SyncHistoryAutoWrittenItem[] = [];
  const overwrittenDiscrepancies: SyncHistoryDiscrepancyItem[] = [];

  for (const existing of nextItems) {
    const fullKey = normalizeSvcKeyServer(existing.category, existing.name);
    const nameKey = String(existing.name || "").trim().toLowerCase();
    const matchedIncoming = incomingByFullKey.get(fullKey) || incomingByName.get(nameKey);
    if (matchedIncoming) {
      matchedIncomingKeys.add(
        normalizeSvcKeyServer(matchedIncoming.category, matchedIncoming.name)
      );
    }

    for (const d of uniqueDays) {
      checkedCellsCount += 1;
      const sysVal = existing.dailyData?.[d];
      const shtVal = matchedIncoming?.dailyData?.[d];
      if (isSameCaseCellServer(sysVal, shtVal)) continue;

      const hasSys = hasRecordedCellValueServer(sysVal);
      const hasSht = hasRecordedCellValueServer(shtVal);
      if (!hasSys && !hasSht) continue;

      const sysClean = toCleanCaseCellServer(sysVal);
      const shtClean = toCleanCaseCellServer(shtVal);
      const isManualLocked = Boolean(existing.manualDays?.[d]);
      const dateLabel = `${pad2(d)}/${pad2(monthNum)}/${year}`;

      // Overwrite unconditionally so System === Google Sheet
      existing.dailyData[d] = { bh: shtClean.bh, nd: shtClean.nd };
      if (existing.manualDays && existing.manualDays[d]) {
        delete existing.manualDays[d];
        if (Object.keys(existing.manualDays).length === 0) {
          existing.manualDays = undefined;
        }
      }
      existing.lastSyncedAt = nowIso;

      if (!hasSys && hasSht && !isManualLocked) {
        autoWrittenCount += 1;
        autoWrittenSamples.push({
          dateLabel,
          category: existing.category,
          serviceName: existing.name,
          bh: shtClean.bh,
          nd: shtClean.nd,
        });
      } else {
        updatedFromSheetCount += 1;
        const type: SyncHistoryDiscrepancyItem["type"] = !hasSys && hasSht
          ? "new_from_sheet"
          : hasSys && !hasSht
            ? "cleared_on_sheet"
            : "value_changed";
        overwrittenDiscrepancies.push({
          id: `${year}_${monthNum}_${d}_${fullKey}`,
          year,
          monthKey,
          day: d,
          dateLabel,
          category: existing.category,
          serviceName: existing.name,
          type,
          systemBh: sysClean.bh,
          systemNd: sysClean.nd,
          sheetBh: shtClean.bh,
          sheetNd: shtClean.nd,
          isManualLocked,
          resolutionStatus: "updated_from_sheet",
          resolvedAt: resolvedAtDisplay,
          resolvedBy: actorLabel,
        });
      }
    }
  }

  for (const inc of sheetItems) {
    const fullKey = normalizeSvcKeyServer(inc.category, inc.name);
    if (matchedIncomingKeys.has(fullKey)) continue;
    const existsByName = nextItems.some(
      (m) => String(m.name || "").trim().toLowerCase() === String(inc.name || "").trim().toLowerCase()
    );
    if (existsByName) continue;

    const newDailyData: Record<number, { bh: number | "LT"; nd: number | "LT" }> = {};
    let serviceHasAnyNew = false;

    for (const d of uniqueDays) {
      checkedCellsCount += 1;
      const shtVal = inc.dailyData?.[d];
      if (!hasRecordedCellValueServer(shtVal)) continue;

      const shtClean = toCleanCaseCellServer(shtVal);
      const dateLabel = `${pad2(d)}/${pad2(monthNum)}/${year}`;
      newDailyData[d] = { bh: shtClean.bh, nd: shtClean.nd };
      serviceHasAnyNew = true;
      autoWrittenCount += 1;
      autoWrittenSamples.push({
        dateLabel,
        category: inc.category,
        serviceName: inc.name,
        bh: shtClean.bh,
        nd: shtClean.nd,
      });
    }

    if (serviceHasAnyNew || existingItems.length === 0) {
      // When archive is completely empty, initialize full month rows from sheet
      const seededDaily =
        existingItems.length === 0 ? { ...(inc.dailyData || {}) } : newDailyData;
      nextItems.push({
        ...inc,
        dailyData: seededDaily,
        lastSyncedAt: nowIso,
      });
    }
  }

  return {
    merged: nextItems,
    checkedCellsCount,
    autoWrittenCount,
    updatedFromSheetCount,
    autoWrittenSamples,
    overwrittenDiscrepancies,
  };
}

function resolveSheetUrlForYear(settings: Partial<AppSettings>, year: number): string {
  const byYear = settings.reportGoogleSheetsByYear?.[String(year)];
  if (byYear?.url && String(byYear.url).trim()) return String(byYear.url).trim();
  if (byYear?.sheetId && String(byYear.sheetId).trim()) return String(byYear.sheetId).trim();
  if (settings.googleSheetUrl && String(settings.googleSheetUrl).trim()) {
    return String(settings.googleSheetUrl).trim();
  }
  if (settings.reportGoogleSheetId && String(settings.reportGoogleSheetId).trim()) {
    return String(settings.reportGoogleSheetId).trim();
  }
  return "";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} (timeout ${ms}ms)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      }
    );
  });
}

interface ServerPreSendSyncSummary {
  ran: boolean;
  sheetConfigured: boolean;
  sheetReachable: boolean;
  autoWrittenCount: number;
  updatedFromSheetCount: number;
  syncedMonthsCount: number;
}

async function syncRecentThreeDaysFromSheetForServer(
  settings: Partial<AppSettings>,
  options?: {
    extraDateISO?: string;
    actorLabel?: string;
    recordHistoryAlways?: boolean;
  }
): Promise<ServerPreSendSyncSummary> {
  const vnNow = getVNNowParts();
  const targetISOs = [
    offsetDateISO(vnNow.dateISO, -2),
    offsetDateISO(vnNow.dateISO, -1),
    vnNow.dateISO,
  ];
  if (
    options?.extraDateISO &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.extraDateISO) &&
    !targetISOs.includes(options.extraDateISO)
  ) {
    targetISOs.push(options.extraDateISO);
  }

  const sliceMap = new Map<
    string,
    { year: number; monthNum: number; monthKey: string; days: number[] }
  >();
  for (const iso of targetISOs) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    const year = parseInt(m[1], 10);
    const monthNum = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const monthKey = `Tháng ${monthNum}`;
    const mapKey = `${year}__${monthNum}`;
    const existing = sliceMap.get(mapKey);
    if (!existing) {
      sliceMap.set(mapKey, { year, monthNum, monthKey, days: [day] });
    } else if (!existing.days.includes(day)) {
      existing.days.push(day);
    }
  }

  const slices = Array.from(sliceMap.values());
  const hasAnySheet = slices.some((s) =>
    Boolean(resolveSpreadsheetId(resolveSheetUrlForYear(settings, s.year)))
  );
  if (!hasAnySheet) {
    return {
      ran: false,
      sheetConfigured: false,
      sheetReachable: false,
      autoWrittenCount: 0,
      updatedFromSheetCount: 0,
      syncedMonthsCount: 0,
    };
  }

  const actorLabel =
    options?.actorLabel || "Hệ thống Tự động Đồng bộ (Trước khi gửi báo cáo)";
  const displayTime = vnNow.dateTimeLog;
  const startDateIso = targetISOs[0];
  const endDateIso = targetISOs[2];
  const dateRangeLabel = `${formatDateISOToVN(startDateIso)} – ${formatDateISOToVN(endDateIso)}`;

  let checkedCellsCount = 0;
  let autoWrittenCount = 0;
  let updatedFromSheetCount = 0;
  let syncedMonthsCount = 0;
  const autoWrittenSamples: SyncHistoryAutoWrittenItem[] = [];
  const overwrittenDiscrepancies: SyncHistoryDiscrepancyItem[] = [];
  const unreachableTabs: string[] = [];

  try {
    const slicesByYear = new Map<number, typeof slices>();
    for (const s of slices) {
      const arr = slicesByYear.get(s.year) || [];
      arr.push(s);
      slicesByYear.set(s.year, arr);
    }

    for (const [year, yearSlices] of slicesByYear.entries()) {
      const sheetUrl = resolveSheetUrlForYear(settings, year);
      const sheetId = resolveSpreadsheetId(sheetUrl);
      if (!sheetId) {
        yearSlices.forEach((s) => unreachableTabs.push(`${s.monthKey}/${year}`));
        continue;
      }

      const probeCsv = await withTimeout(
        fetchRawTabCsv(sheetId, "__cls_probe_nonexistent__"),
        10000,
        "Google Sheet probe"
      );

      for (const slice of yearSlices) {
        const sheetItems = await withTimeout(
          fetchSingleSheetTab(sheetUrl, slice.monthKey, probeCsv, year),
          12000,
          `Google Sheet ${slice.monthKey}/${year}`
        );

        if (!sheetItems || sheetItems.length === 0) {
          unreachableTabs.push(`${slice.monthKey}/${year}`);
          continue;
        }

        syncedMonthsCount += 1;
        const dbRaw = await loadReportArchiveMonthForServer(year, slice.monthNum);
        const existingItems = dbRaw as unknown as ArchivedCaseReportItem[];

        const diffRes = overwriteArchiveDaysFromSheet({
          year,
          monthNum: slice.monthNum,
          monthKey: slice.monthKey,
          existingItems,
          sheetItems,
          targetDays: slice.days,
          actorLabel,
          resolvedAtDisplay: displayTime,
        });

        checkedCellsCount += diffRes.checkedCellsCount;
        autoWrittenCount += diffRes.autoWrittenCount;
        updatedFromSheetCount += diffRes.updatedFromSheetCount;
        autoWrittenSamples.push(...diffRes.autoWrittenSamples);
        overwrittenDiscrepancies.push(...diffRes.overwrittenDiscrepancies);

        const changedInMonth =
          diffRes.autoWrittenCount > 0 ||
          diffRes.updatedFromSheetCount > 0 ||
          existingItems.length === 0;
        if (changedInMonth) {
          await upsertReportArchiveMonthFromServer(
            year,
            slice.monthNum,
            slice.monthKey,
            diffRes.merged
          );
        }
      }
    }

    const totalChanges = autoWrittenCount + updatedFromSheetCount;
    const shouldLog =
      Boolean(options?.recordHistoryAlways) || totalChanges > 0 || syncedMonthsCount === 0;

    if (shouldLog) {
      const status: SyncHistoryEntry["status"] =
        syncedMonthsCount === 0
          ? "error"
          : totalChanges > 0
            ? "success"
            : "no_change";

      let summary = "";
      if (syncedMonthsCount === 0) {
        summary = `Cập nhật trước khi gửi báo cáo (${dateRangeLabel}): không đọc được tab Google Sheet (${unreachableTabs.join(", ")}).`;
      } else if (updatedFromSheetCount > 0 && autoWrittenCount > 0) {
        summary = `Cập nhật 3 ngày gần nhất trước khi gửi báo cáo (${dateRangeLabel}): đã ghi đè ${updatedFromSheetCount} dịch vụ khác biệt (kèm dữ liệu gốc & thay thế) và ghi mới ${autoWrittenCount} ô để khớp 100% Google Sheet.`;
      } else if (updatedFromSheetCount > 0) {
        summary = `Cập nhật 3 ngày gần nhất trước khi gửi báo cáo (${dateRangeLabel}): đã ghi đè ${updatedFromSheetCount} dịch vụ khác biệt theo Google Sheet (đã lưu chi tiết dữ liệu gốc & thay thế).`;
      } else if (autoWrittenCount > 0) {
        summary = `Cập nhật 3 ngày gần nhất trước khi gửi báo cáo (${dateRangeLabel}): đã tự động ghi mới ${autoWrittenCount} ô từ Google Sheet vào PostgreSQL.`;
      } else {
        summary = `Cập nhật trước khi gửi báo cáo (${dateRangeLabel}): đã đối chiếu ${checkedCellsCount} ô, số liệu hoàn toàn khớp Google Sheet.`;
      }

      const historyEntry: SyncHistoryEntry = {
        id: `SRV-SYNC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        displayTime,
        trigger: "startup_3d_auto",
        dateRangeLabel,
        startDate: startDateIso,
        endDate: endDateIso,
        status,
        checkedCellsCount,
        autoWrittenCount,
        discrepancyCount: overwrittenDiscrepancies.length,
        updatedFromSheetCount,
        savedToDatabase: true,
        databaseNote: "Đã cập nhật & lưu cố định trên PostgreSQL trước khi gửi báo cáo",
        performedBy: actorLabel,
        summary,
        autoWrittenSamples: autoWrittenSamples.slice(0, 80),
        discrepancies: overwrittenDiscrepancies.slice(0, 250),
      };

      await appendSyncHistoryEntryToDb(historyEntry);
    }

    return {
      ran: true,
      sheetConfigured: true,
      sheetReachable: syncedMonthsCount > 0,
      autoWrittenCount,
      updatedFromSheetCount,
      syncedMonthsCount,
    };
  } catch (err: any) {
    console.warn("[ScheduledAlerts] Pre-send 3-day sync warning:", err?.message || err);
    return {
      ran: true,
      sheetConfigured: true,
      sheetReachable: syncedMonthsCount > 0,
      autoWrittenCount,
      updatedFromSheetCount,
      syncedMonthsCount,
    };
  }
}

async function loadArchiveMonthWithSheetSync(
  year: number,
  monthNum: number,
  settings: Partial<AppSettings>,
  allowPersist: boolean,
  focusDay?: number
): Promise<{
  items: ArchivedCaseReportItem[];
  sourceLabel: string;
  dbReachable: boolean;
  sheetConfigured: boolean;
}> {
  const monthKey = `Tháng ${monthNum}`;
  const dbStatus = await loadReportArchiveMonthStatusForServer(year, monthNum);
  const dbItems = dbStatus.items as unknown as ArchivedCaseReportItem[];

  const sheetUrl = resolveSheetUrlForYear(settings, year);
  const sheetId = resolveSpreadsheetId(sheetUrl);

  if (!sheetId) {
    return {
      items: dbItems,
      sourceLabel: dbItems.length > 0 ? "Kho báo cáo PostgreSQL" : "Chưa cấu hình Google Sheet",
      dbReachable: dbStatus.reachable,
      sheetConfigured: false,
    };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sheetItems = await withTimeout(
        (async () => {
          const probeCsv = await fetchRawTabCsv(sheetId, "__cls_probe_nonexistent__");
          return fetchSingleSheetTab(sheetUrl, monthKey, probeCsv, year);
        })(),
        12000,
        "Google Sheet sync"
      );
      if (sheetItems && sheetItems.length > 0) {
        const targetDays = focusDay
          ? [Math.max(1, focusDay - 1), focusDay]
          : Array.from({ length: 31 }, (_, i) => i + 1);
        const vnNow = getVNNowParts();
        const res = overwriteArchiveDaysFromSheet({
          year,
          monthNum,
          monthKey,
          existingItems: dbItems,
          sheetItems,
          targetDays,
          actorLabel: "Hệ thống Báo cáo Dịch vụ (Khớp Google Sheet)",
          resolvedAtDisplay: vnNow.dateTimeLog,
        });
        const changed = res.autoWrittenCount > 0 || res.updatedFromSheetCount > 0 || dbItems.length === 0;
        if (allowPersist && changed) {
          await upsertReportArchiveMonthFromServer(year, monthNum, monthKey, res.merged);
        }
        return {
          items: res.merged,
          sourceLabel:
            res.updatedFromSheetCount > 0 || res.autoWrittenCount > 0
              ? "Google Sheet (đã cập nhật mới & khớp 100%) + PostgreSQL"
              : "Google Sheet + Kho báo cáo PostgreSQL",
          dbReachable: dbStatus.reachable,
          sheetConfigured: true,
        };
      }
    } catch (err: any) {
      console.warn(`[ScheduledAlerts] Google Sheet fetch warning (attempt ${attempt + 1}/2):`, err?.message);
    }
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return {
    items: dbItems,
    sourceLabel:
      dbItems.length > 0
        ? "Kho báo cáo PostgreSQL (Sheet không phản hồi)"
        : "Không truy cập được Google Sheet",
    dbReachable: dbStatus.reachable,
    sheetConfigured: true,
  };
}

interface DayServiceSummary {
  key: string;
  name: string;
  category: string;
  bh: number;
  nd: number;
  total: number;
  isLt: boolean;
}

interface DayCategorySummary {
  category: string;
  bh: number;
  nd: number;
  total: number;
}

function summarizeMonthDay(items: ArchivedCaseReportItem[], dayNum: number) {
  let totalBh = 0;
  let totalNd = 0;
  let ltCount = 0;
  const byCategory = new Map<string, DayCategorySummary>();
  const serviceTotals: DayServiceSummary[] = [];
  const serviceByKey = new Map<string, DayServiceSummary>();

  for (const item of items) {
    if (!item || !item.name || !isValidServiceName(item.name)) continue;
    const cat = item.category || "Khác";
    const key = `${cat.trim().toLowerCase()}__${item.name.trim().toLowerCase()}`;
    const cell = item?.dailyData?.[dayNum];
    const isLt = Boolean(
      cell &&
        (String(cell.bh).toUpperCase() === "LT" || String(cell.nd).toUpperCase() === "LT")
    );
    if (isLt) ltCount += 1;

    const bh = cell ? toIntSafe(cell.bh) : 0;
    const nd = cell ? toIntSafe(cell.nd) : 0;
    const rowTotal = bh + nd;

    totalBh += bh;
    totalNd += nd;

    const prevCat = byCategory.get(cat) || { category: cat, bh: 0, nd: 0, total: 0 };
    prevCat.bh += bh;
    prevCat.nd += nd;
    prevCat.total += rowTotal;
    byCategory.set(cat, prevCat);

    const existingSvc = serviceByKey.get(key);
    if (existingSvc) {
      existingSvc.bh += bh;
      existingSvc.nd += nd;
      existingSvc.total += rowTotal;
      existingSvc.isLt = existingSvc.isLt || isLt;
    } else {
      const entry: DayServiceSummary = {
        key,
        name: item.name.trim(),
        category: cat,
        bh,
        nd,
        total: rowTotal,
        isLt,
      };
      serviceByKey.set(key, entry);
      serviceTotals.push(entry);
    }
  }

  const totalCases = totalBh + totalNd;
  const categories = Array.from(byCategory.values()).sort((a, b) => b.total - a.total);

  return {
    totalBh,
    totalNd,
    totalCases,
    ltCount,
    categories,
    byCategoryMap: byCategory,
    allServices: serviceTotals,
    serviceByKey,
  };
}

function formatComparisonDelta(current: number, prev: number, hasPrevBaseline: boolean): string {
  if (!hasPrevBaseline) {
    return "chưa có số liệu hôm trước";
  }
  const diff = current - prev;
  if (prev === 0 && current === 0) {
    return "➡️ 0% (0 ca)";
  }
  if (prev === 0 && current > 0) {
    return `📈 Mới phát sinh (+${current.toLocaleString("vi-VN")} ca; hôm trước 0)`;
  }
  const pct = (diff / prev) * 100;
  const pctFormatted = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  const diffFormatted = `${diff > 0 ? "+" : ""}${diff.toLocaleString("vi-VN")} ca`;
  const icon = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";
  if (diff === 0) {
    return `➡️ 0.0% (bằng hôm trước: ${prev.toLocaleString("vi-VN")})`;
  }
  return `${icon} ${pctFormatted} (${diffFormatted}; hôm trước ${prev.toLocaleString("vi-VN")})`;
}

function computeMonthAverageToDay(items: ArchivedCaseReportItem[], maxDay: number): {
  activeDays: number;
  monthTotal: number;
  avgPerDay: number;
} {
  let monthTotal = 0;
  const activeDaySet = new Set<number>();
  for (const item of items) {
    for (const [dStr, cell] of Object.entries(item.dailyData || {})) {
      const d = parseInt(dStr, 10);
      if (!Number.isInteger(d) || d < 1 || d > maxDay) continue;
      const tot = toIntSafe(cell?.bh) + toIntSafe(cell?.nd);
      if (tot > 0) {
        monthTotal += tot;
        activeDaySet.add(d);
      }
    }
  }
  const activeDays = activeDaySet.size;
  return {
    activeDays,
    monthTotal,
    avgPerDay: activeDays > 0 ? Math.round(monthTotal / activeDays) : 0,
  };
}

interface MergedServiceComparisonRow {
  key: string;
  name: string;
  category: string;
  curBh: number;
  curNd: number;
  curTotal: number;
  prevTotal: number;
  isLt: boolean;
}

interface ComputedServiceReportBundle {
  preview: ScheduledAlertPreviewResult;
  targetISO: string;
  prevISO: string;
  dateVN: string;
  weekday: string;
  prevDateVN: string;
  prevWeekday: string;
  year: number;
  monthNum: number;
  sourceLabel: string;
  syncOriginLabel: string;
  summary: ReturnType<typeof summarizeMonthDay>;
  prevSummary: ReturnType<typeof summarizeMonthDay>;
  mtdStats: ReturnType<typeof computeMonthAverageToDay>;
  categoryNames: string[];
  activeCategories: string[];
  allMergedServices: MergedServiceComparisonRow[];
  activeServicesCount: number;
  hasPrevBaseline: boolean;
  bhPct: number;
  ndPct: number;
}

function formatCategoryHeader(catName: string): { icon: string; title: string } {
  const norm = String(catName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
  if (norm.includes("noi soi")) return { icon: "👁️", title: "NỘI SOI" };
  if (norm.includes("x quang") || norm.includes("x-quang")) return { icon: "🩻", title: "X-QUANG & CLVT" };
  if (norm.includes("dien tim") || norm.includes("lhn")) return { icon: "📈", title: "ĐIỆN TIM & LHN" };
  if (norm.includes("xet nghiem")) return { icon: "🧪", title: "XÉT NGHIỆM" };
  if (norm.includes("sieu am")) return { icon: "🩺", title: "SIÊU ÂM" };
  if (norm.includes("msct")) return { icon: "🖥️", title: "MSCT" };
  if (norm.includes("mri")) return { icon: "🧲", title: "MRI" };
  return { icon: "📌", title: catName.toUpperCase() };
}

async function computeServiceReportBundle(
  data: ResolvedHospitalDataset,
  yesterdayISO: string,
  allowPersistSync: boolean,
  generatedAtVN = "",
  scheduleTimeHHmm = "12:45",
  syncModeLabel?: string
): Promise<ComputedServiceReportBundle> {
  const m = yesterdayISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const yYear = m ? parseInt(m[1], 10) : new Date().getUTCFullYear();
  const yMonth = m ? parseInt(m[2], 10) : new Date().getUTCMonth() + 1;
  const yDay = m ? parseInt(m[3], 10) : new Date().getUTCDate();

  const dayBeforeISO = offsetDateISO(yesterdayISO, -1);
  const dbMatch = dayBeforeISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dbYear = dbMatch ? parseInt(dbMatch[1], 10) : yYear;
  const dbMonth = dbMatch ? parseInt(dbMatch[2], 10) : yMonth;
  const dbDay = dbMatch ? parseInt(dbMatch[3], 10) : Math.max(1, yDay - 1);

  const primaryMonth = await loadArchiveMonthWithSheetSync(
    yYear,
    yMonth,
    data.settings,
    allowPersistSync,
    yDay
  );

  let prevDayMonthItems = primaryMonth.items;
  if (dbYear !== yYear || dbMonth !== yMonth) {
    const prevMonth = await loadArchiveMonthWithSheetSync(
      dbYear,
      dbMonth,
      data.settings,
      false,
      dbDay
    );
    prevDayMonthItems = prevMonth.items;
  }

  let summary = summarizeMonthDay(primaryMonth.items, yDay);
  const prevSummary = summarizeMonthDay(prevDayMonthItems, dbDay);
  const mtdStats = computeMonthAverageToDay(primaryMonth.items, yDay);
  const notes = [...data.dataSourceNotes, primaryMonth.sourceLabel];

  // Fallback to browser-synced liveContext summary only if archive + Sheet returned zero cases
  if (summary.totalCases === 0 && data.liveContext?.caseReports) {
    const liveMonth = Array.isArray(data.liveContext.caseReports.monthlyTotals)
      ? data.liveContext.caseReports.monthlyTotals.find(
          (mt: any) => mt.monthKey === `Tháng ${yMonth}`
        )
      : null;
    const matchedDaily = Array.isArray(liveMonth?.dailyTotals)
      ? liveMonth.dailyTotals.find((d: any) => Number(d.day) === yDay)
      : null;

    if (matchedDaily && Number(matchedDaily.total) > 0) {
      const catList: DayCategorySummary[] = Array.isArray(liveMonth?.byCategory)
        ? liveMonth.byCategory.map((c: any) => ({
            category: c.category,
            bh: 0,
            nd: 0,
            total: Number(c.total || 0),
          }))
        : [];
      summary = {
        totalBh: Number(matchedDaily.bh || 0),
        totalNd: Number(matchedDaily.nd || 0),
        totalCases: Number(matchedDaily.total || 0),
        ltCount: 0,
        categories: catList,
        byCategoryMap: new Map(catList.map((c) => [c.category, c])),
        allServices: [],
        serviceByKey: new Map(),
      };
      notes.push("Dữ liệu tổng hợp trực tiếp từ liveContext");
    }
  }

  const weekday = getVNWeekdayLabel(yesterdayISO);
  const dateVN = formatDateISOToVN(yesterdayISO);
  const prevDateVN = formatDateISOToVN(dayBeforeISO);
  const prevWeekday = getVNWeekdayLabel(dayBeforeISO);
  const bhPct = summary.totalCases > 0 ? Math.round((summary.totalBh / summary.totalCases) * 100) : 0;
  const ndPct = summary.totalCases > 0 ? 100 - bhPct : 0;
  const hasPrevBaseline = prevSummary.totalCases > 0 || prevSummary.ltCount > 0;

  const categoryNames = Array.from(
    new Set([
      ...summary.categories.map((c) => c.category),
      ...prevSummary.categories.map((c) => c.category),
    ])
  ).sort((a, b) => {
    const totA = summary.byCategoryMap.get(a)?.total || 0;
    const totB = summary.byCategoryMap.get(b)?.total || 0;
    return totB - totA;
  });

  const unionServiceMap = new Map<string, MergedServiceComparisonRow>();

  for (const svc of summary.allServices) {
    const prevSvc = prevSummary.serviceByKey.get(svc.key);
    unionServiceMap.set(svc.key, {
      key: svc.key,
      name: svc.name,
      category: svc.category,
      curBh: svc.bh,
      curNd: svc.nd,
      curTotal: svc.total,
      prevTotal: prevSvc?.total || 0,
      isLt: svc.isLt,
    });
  }
  for (const prevSvc of prevSummary.allServices) {
    if (!unionServiceMap.has(prevSvc.key)) {
      unionServiceMap.set(prevSvc.key, {
        key: prevSvc.key,
        name: prevSvc.name,
        category: prevSvc.category,
        curBh: 0,
        curNd: 0,
        curTotal: 0,
        prevTotal: prevSvc.total,
        isLt: false,
      });
    }
  }

  const allMergedServices = Array.from(unionServiceMap.values());
  const activeServicesCount = allMergedServices.filter(
    (s) => s.curTotal > 0 || s.prevTotal > 0 || s.isLt
  ).length;

  const syncBaseLabel = syncModeLabel || `Đồng bộ Tự động ${scheduleTimeHHmm}`;
  const syncOriginLabel = primaryMonth.sourceLabel.startsWith("Google Sheet")
    ? `Hệ thống (${syncBaseLabel} · Google Sheet)`
    : `Hệ thống (${syncBaseLabel} · ${primaryMonth.sourceLabel})`;

  const activeCategories = categoryNames.filter((catName) => {
    const curCat = summary.byCategoryMap.get(catName);
    return (curCat?.total || 0) > 0;
  });

  const lines: string[] = [];
  lines.push(`📊 **BÁO CÁO GIAO BAN SỐ LIỆU SỬ DỤNG AI**`);
  lines.push(`📅 Ngày báo cáo: **${dateVN}** (${weekday})`);
  lines.push(`👤 Đồng bộ từ: ${syncOriginLabel}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);

  if (summary.totalCases === 0 && !hasPrevBaseline) {
    lines.push(
      `⚠️ **Chưa ghi nhận số ca nào cho ngày ${dateVN}** (Tháng ${yMonth}/${yYear}).`
    );
    lines.push(
      `• Vui lòng kiểm tra dữ liệu đã nhập lên tab **Tháng ${yMonth}/${yYear}** trên Google Sheet hoặc nhập trực tiếp trong phân hệ Báo Cáo Số Ca.`
    );
    if (mtdStats.monthTotal > 0) {
      lines.push(
        `• Lũy kế Tháng ${yMonth}/${yYear} hiện có: **${mtdStats.monthTotal.toLocaleString(
          "vi-VN"
        )} ca** (${mtdStats.activeDays} ngày có số liệu, TB **${mtdStats.avgPerDay.toLocaleString(
          "vi-VN"
        )} ca/ngày**).`
      );
    }
  } else {
    activeCategories.forEach((catName) => {
      const curCat = summary.byCategoryMap.get(catName) || {
        category: catName,
        bh: 0,
        nd: 0,
        total: 0,
      };
      const { icon, title } = formatCategoryHeader(catName);
      lines.push(`${icon} **${title} (Tổng: ${curCat.total.toLocaleString("vi-VN")} ca)**`);

      const catServices = allMergedServices.filter(
        (s) => s.category === catName && (s.curTotal > 0 || s.isLt)
      );

      catServices.forEach((svc) => {
        const bhPart = svc.curBh > 0 ? `BH: ${svc.curBh.toLocaleString("vi-VN")}` : "";
        const ndPart = svc.curNd > 0 ? `ND: ${svc.curNd.toLocaleString("vi-VN")}` : "";
        const breakdownList = [bhPart, ndPart].filter(Boolean);
        const breakdownTxt = breakdownList.length > 0 ? ` (${breakdownList.join(", ")})` : "";
        const ltSuffix = svc.isLt ? " [LT]" : "";
        lines.push(
          `• ${svc.name}${ltSuffix}: **${svc.curTotal.toLocaleString("vi-VN")} ca**${breakdownTxt}`
        );
      });
    });

    const totalPctDeltaText = formatComparisonDelta(
      summary.totalCases,
      prevSummary.totalCases,
      hasPrevBaseline
    );

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(
      `📈 **TỔNG CỘNG TOÀN KHOA: ${summary.totalCases.toLocaleString("vi-VN")} ca thực hiện**`
    );
    lines.push(`• So với ngày hôm trước (${prevDateVN}): ${totalPctDeltaText}`);
    lines.push(`• Bảo hiểm Y tế (BH): **${summary.totalBh.toLocaleString("vi-VN")} ca**`);
    lines.push(`• Ngoài định mức / Dịch vụ (ND): **${summary.totalNd.toLocaleString("vi-VN")} ca**`);
  }

  const totalDeltaShort = hasPrevBaseline
    ? (() => {
        const d = summary.totalCases - prevSummary.totalCases;
        const pct =
          prevSummary.totalCases > 0
            ? `${d >= 0 ? "+" : ""}${((d / prevSummary.totalCases) * 100).toFixed(1)}%`
            : d > 0
            ? "Mới"
            : "0%";
        return ` (${d >= 0 ? "+" : ""}${d} ca / ${pct} so với ${prevDateVN})`;
      })()
    : "";

  const inAppSummary =
    summary.totalCases > 0
      ? `Số liệu CLS ${dateVN}: ${summary.totalCases.toLocaleString(
          "vi-VN"
        )} ca${totalDeltaShort} · BHYT ${summary.totalBh.toLocaleString(
          "vi-VN"
        )} · ND ${summary.totalNd.toLocaleString("vi-VN")} · ${activeServicesCount} dịch vụ kỹ thuật có số liệu.`
      : `Báo cáo ${scheduleTimeHHmm} ngày ${dateVN}: Chưa ghi nhận phát sinh số ca trong kho lưu trữ/Google Sheet.`;

  const preview: ScheduledAlertPreviewResult = {
    ruleId: "noon_services_1245",
    ruleName: "Tổng hợp Dịch vụ Kỹ thuật Ngày Hôm Trước",
    targetDateVN: yesterdayISO,
    generatedAtVN,
    title: `Số liệu chi tiết dịch vụ kỹ thuật ngày ${dateVN}`,
    telegramMarkdown: lines.join("\n"),
    inAppSummary,
    stats: [
      {
        label: `Tổng ca (${dateVN})`,
        value: `${summary.totalCases.toLocaleString("vi-VN")} ca`,
        tone: summary.totalCases > 0 ? "good" : "warn",
      },
      {
        label: `So với ${prevDateVN}`,
        value: hasPrevBaseline
          ? (() => {
              const d = summary.totalCases - prevSummary.totalCases;
              const pct =
                prevSummary.totalCases > 0
                  ? `${d > 0 ? "+" : ""}${((d / prevSummary.totalCases) * 100).toFixed(1)}%`
                  : "+100%";
              return `${d > 0 ? "+" : ""}${d.toLocaleString("vi-VN")} (${pct})`;
            })()
          : "Chưa có nền",
        tone:
          !hasPrevBaseline
            ? "neutral"
            : summary.totalCases >= prevSummary.totalCases
            ? "good"
            : "warn",
      },
      {
        label: "BHYT / Nhân dân",
        value: `${summary.totalBh.toLocaleString("vi-VN")} / ${summary.totalNd.toLocaleString("vi-VN")}`,
        tone: "neutral",
      },
      {
        label: "Dịch vụ / TB tháng",
        value: `${activeServicesCount} KT · ${mtdStats.avgPerDay.toLocaleString("vi-VN")}/ng`,
        tone: "neutral",
      },
    ],
    dataSourceNotes: Array.from(new Set(notes)),
  };

  return {
    preview,
    targetISO: yesterdayISO,
    prevISO: dayBeforeISO,
    dateVN,
    weekday,
    prevDateVN,
    prevWeekday,
    year: yYear,
    monthNum: yMonth,
    sourceLabel: primaryMonth.sourceLabel,
    syncOriginLabel,
    summary,
    prevSummary,
    mtdStats,
    categoryNames,
    activeCategories,
    allMergedServices,
    activeServicesCount,
    hasPrevBaseline,
    bhPct,
    ndPct,
  };
}

export async function buildNoonServiceReport(
  data: ResolvedHospitalDataset,
  yesterdayISO: string,
  allowPersistSync: boolean,
  generatedAtVN = "",
  scheduleTimeHHmm = "12:45",
  syncModeLabel?: string
): Promise<ScheduledAlertPreviewResult> {
  const bundle = await computeServiceReportBundle(
    data,
    yesterdayISO,
    allowPersistSync,
    generatedAtVN,
    scheduleTimeHHmm,
    syncModeLabel
  );
  return bundle.preview;
}

// ==========================================
// 3. EVENING 17:00 BRIEFING BUILDER
// ==========================================
export function buildEveningPrepBriefing(
  data: ResolvedHospitalDataset,
  todayISO: string,
  tomorrowISO: string,
  warningDays = 30,
  generatedAtVN = "",
  scheduleTimeHHmm = "17:00"
): ScheduledAlertPreviewResult {
  const todayVN = formatDateISOToVN(todayISO);
  const tomorrowVN = formatDateISOToVN(tomorrowISO);
  const tomorrowWeekday = getVNWeekdayLabel(tomorrowISO);

  // Today work report
  const completedToday = data.tasks.filter((t) => {
    if (!t || t.status !== "Đã hoàn thành") return false;
    const upd = String(t.updatedDate || "").trim().slice(0, 10);
    const due = String(t.dueDate || "").trim().slice(0, 10);
    return upd === todayISO || due === todayISO;
  });

  const openTasks = data.tasks.filter(
    (t) => t && t.status !== "Đã hoàn thành" && t.status !== "Hủy"
  );
  const unfinishedToday = openTasks.filter(
    (t) => String(t.dueDate || "").trim().slice(0, 10) <= todayISO
  );

  // Tomorrow preparation
  const tasksTomorrow = openTasks
    .filter((t) => String(t.dueDate || "").trim().slice(0, 10) === tomorrowISO)
    .sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority));

  const dutiesTomorrow = collectOnDutyForDate(data.shifts, tomorrowISO);
  const leaveTomorrow = collectLeaveForDate(data.leaveRequests, data.shifts, tomorrowISO);
  const meetingsTomorrow = collectMeetingsForDate(data.meetings, data.meetingItems, tomorrowISO);
  const eqScanTomorrow = scanEquipmentAlertsForDate(data.equipment, tomorrowISO, Math.min(7, warningDays));

  const lines: string[] = [];
  lines.push(`🌆 **BÁO CÁO CUỐI NGÀY & CHUẨN BỊ CHO NGÀY MAI**`);
  lines.push(`📅 Hết ca **${todayVN}** → Chuẩn bị **${tomorrowWeekday}, ${tomorrowVN}** (⏰ ${scheduleTimeHHmm})`);
  lines.push("");

  // Section 1: Today's work wrap-up
  lines.push(`✅ **1. TỔNG KẾT CÔNG VIỆC NGÀY ${todayVN}**`);
  lines.push(`• **Đã hoàn thành trong ngày:** ${completedToday.length} đầu việc`);
  completedToday.slice(0, 6).forEach((t, idx) => {
    lines.push(`  ${idx + 1}. ${t.title} — _${t.assignee || "N/A"}_`);
  });

  lines.push(`• **Chưa xong / Tồn đọng cần bàn giao:** ${unfinishedToday.length} đầu việc`);
  if (unfinishedToday.length > 0) {
    unfinishedToday.slice(0, 8).forEach((t, idx) => {
      const dueVN = formatDateISOToVN(t.dueDate);
      lines.push(
        `  ${idx + 1}. [${t.priority}] ${t.title} — _${t.assignee || "Chưa gán"}_ (Hạn: ${dueVN}, ${t.status})`
      );
    });
  } else {
    lines.push(`  _Đã hoàn tất toàn bộ đầu việc đến hạn hôm nay._`);
  }
  lines.push("");

  // Section 2: Tomorrow preparation
  lines.push(`🧭 **2. KẾ HOẠCH CHUẨN BỊ CHO NGÀY MAI (${tomorrowWeekday}, ${tomorrowVN})**`);
  lines.push(`• **Công việc đến hạn ngày mai (${tasksTomorrow.length}):**`);
  if (tasksTomorrow.length > 0) {
    tasksTomorrow.slice(0, 8).forEach((t, idx) => {
      lines.push(
        `  ${idx + 1}. [${t.priority}] ${t.title} — _${t.assignee || "Chưa gán"}_`
      );
    });
  } else {
    lines.push(`  - Chưa có đầu việc mới đến hạn trong ngày ${tomorrowVN}.`);
  }

  lines.push(
    `• **Nhân sự trực ngày mai (${dutiesTomorrow.length} lượt) & Nghỉ phép (${leaveTomorrow.length} người):**`
  );
  if (dutiesTomorrow.length > 0) {
    dutiesTomorrow.slice(0, 10).forEach((sh, idx) => {
      const name = sh.userName || sh.assignedUserName || "Chưa rõ";
      const timeStr =
        sh.startTime && sh.endTime
          ? `${sh.startTime}–${sh.endTime}`
          : sh.shiftTime || sh.shiftName || sh.workType || "Trong ca";
      const place = formatUniqueUnitLabel([sh.room || sh.roomLocation, sh.machine], " / ");
      lines.push(
        `  ${idx + 1}. **${name}** (${sh.workType || "Ca trực"} · ${timeStr})${
          place ? ` — ${place}` : ""
        }`
      );
    });
  } else {
    lines.push(`  - Chưa có ca trực được phân cho ngày ${tomorrowVN}.`);
  }
  if (leaveTomorrow.length > 0) {
    leaveTomorrow.forEach((l) => {
      const subText = l.substitute ? ` (Thay: ${l.substitute})` : "";
      lines.push(`  - 🏖️ Nghỉ: **${l.name}** — ${l.detail}${subText}`);
    });
  }

  if (meetingsTomorrow.length > 0) {
    lines.push(`• 📅 **Lịch họp / Hội chẩn ngày mai (${meetingsTomorrow.length}):**`);
    meetingsTomorrow.slice(0, 5).forEach((m) => {
      lines.push(`  - ${m.time}: **${m.title}** (${m.location})`);
    });
  }

  if (eqScanTomorrow.brokenOrLocked.length > 0 || eqScanTomorrow.expiringAlerts.length > 0) {
    lines.push(
      `• 🛠️ **Thiết bị cần kiểm tra trước ca sáng mai (${eqScanTomorrow.brokenOrLocked.length} sự cố, ${eqScanTomorrow.expiringAlerts.length} mốc ≤7 ngày):**`
    );
    eqScanTomorrow.brokenOrLocked.slice(0, 4).forEach((eq) => {
      lines.push(`  - ⚠️ ${eq.name} (${eq.code}): ${eq.isLockedOut ? "Đang khóa an toàn" : eq.status}`);
    });
    eqScanTomorrow.expiringAlerts.slice(0, 5).forEach((a) => {
      lines.push(
        `  - 🔔 ${a.equipmentName} (${a.equipmentCode}) — ${a.trackLabel} (${formatExpiryDeltaLabel(
          a.daysRemaining
        )})`
      );
    });
  }

  const inAppSummary = `Cuối ngày ${todayVN}: Xong ${completedToday.length} việc, tồn ${unfinishedToday.length} việc. Ngày mai (${tomorrowVN}): ${tasksTomorrow.length} việc đến hạn, ${dutiesTomorrow.length} lượt trực, ${leaveTomorrow.length} người nghỉ, ${meetingsTomorrow.length} lịch họp.`;

  return {
    ruleId: "evening_1700",
    ruleName: "Báo cáo Cuối ngày & Chuẩn bị Ngày mai",
    targetDateVN: tomorrowISO,
    generatedAtVN,
    title: `Báo cáo cuối ngày ${todayVN} & Chuẩn bị ${tomorrowVN}`,
    telegramMarkdown: lines.join("\n"),
    inAppSummary,
    stats: [
      {
        label: `Đã xong (${todayVN})`,
        value: `${completedToday.length} việc`,
        tone: "good",
      },
      {
        label: "Tồn đọng bàn giao",
        value: `${unfinishedToday.length} việc`,
        tone: unfinishedToday.length > 0 ? "warn" : "good",
      },
      {
        label: `Việc ngày ${tomorrowVN}`,
        value: `${tasksTomorrow.length} việc`,
        tone: tasksTomorrow.length > 0 ? "warn" : "neutral",
      },
      {
        label: `Trực / Nghỉ ${tomorrowVN}`,
        value: `${dutiesTomorrow.length} trực · ${leaveTomorrow.length} nghỉ`,
        tone: "neutral",
      },
    ],
    dataSourceNotes: data.dataSourceNotes,
  };
}

// ==========================================
// PREVIEW & DISPATCH ENGINE
// ==========================================
export async function getActiveAlertRules(): Promise<ScheduledAlertRuleConfig[]> {
  const buckets = await loadCloudBucketsForServer(["settings"]);
  const settingsObj =
    Array.isArray(buckets.settings) && buckets.settings[0]
      ? (buckets.settings[0] as Partial<AppSettings>)
      : {};
  if (Array.isArray(settingsObj.scheduledAlertsConfig) && settingsObj.scheduledAlertsConfig.length > 0) {
    const normalized = normalizeScheduledRules(settingsObj.scheduledAlertsConfig);
    cachedRulesOverlay = normalized;
    return normalized;
  }
  if (cachedRulesOverlay) {
    return cachedRulesOverlay;
  }
  return normalizeScheduledRules(settingsObj.scheduledAlertsConfig);
}

export async function generateRulePreview(params: {
  ruleId: ScheduledAlertRuleId;
  targetDateVN?: string;
  equipmentWarningDays?: number;
  timeHHmmOverride?: string;
  liveContext?: any;
  allowPersistSheetSync?: boolean;
}): Promise<ScheduledAlertPreviewResult> {
  const vnNow = getVNNowParts();
  const data = await resolveHospitalDataset(params.liveContext);
  const rules = normalizeScheduledRules(
    cachedRulesOverlay || data.settings.scheduledAlertsConfig
  );
  const matchedRule = rules.find((r) => r.id === params.ruleId);
  const warnDays = params.equipmentWarningDays || matchedRule?.equipmentWarningDays || 30;
  const effectiveTimeHHmm =
    params.timeHHmmOverride && parseTimeHHmmToMinutes(params.timeHHmmOverride) !== null
      ? params.timeHHmmOverride
      : matchedRule?.timeHHmm;

  if (params.ruleId === "morning_0700") {
    const todayISO = params.targetDateVN || vnNow.dateISO;
    return buildMorningBriefing(
      data,
      todayISO,
      warnDays,
      vnNow.dateTimeVN,
      effectiveTimeHHmm || "07:00"
    );
  }

  if (params.ruleId === "noon_services_1245") {
    const yesterdayISO = params.targetDateVN || offsetDateISO(vnNow.dateISO, -1);
    return buildNoonServiceReport(
      data,
      yesterdayISO,
      Boolean(params.allowPersistSheetSync),
      vnNow.dateTimeVN,
      effectiveTimeHHmm || "12:45"
    );
  }

  const todayISO = vnNow.dateISO;
  const tomorrowISO = params.targetDateVN || offsetDateISO(vnNow.dateISO, 1);
  return buildEveningPrepBriefing(
    data,
    todayISO,
    tomorrowISO,
    warnDays,
    vnNow.dateTimeVN,
    effectiveTimeHHmm || "17:00"
  );
}

function isStaffInactiveStatus(status?: string): boolean {
  const norm = String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
  return (
    norm.includes("nghi viec") ||
    norm.includes("nghi huu") ||
    norm.includes("chuyen cong tac")
  );
}

function getActiveStaffAndLeaves(data: ResolvedHospitalDataset) {
  const activeStaff = data.staffProfiles.filter(
    (s) => s && !isStaffInactiveStatus(s.currentStatus)
  );
  const inactiveNames = new Set(
    data.staffProfiles
      .filter((s) => s && isStaffInactiveStatus(s.currentStatus))
      .map((s) => String(s.fullName || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const activeLeaveRequests = data.leaveRequests.filter(
    (l) => l && !inactiveNames.has(String(l.userName || "").trim().toLowerCase())
  );
  return { activeStaff, activeLeaveRequests };
}

function scanStaffCertificateAlertsForDate(
  staffList: StaffProfile[],
  referenceISO: string,
  warningDays = 30
): Array<{
  staffName: string;
  certName: string;
  expiryDateISO: string;
  daysRemaining: number;
}> {
  const alerts: Array<{
    staffName: string;
    certName: string;
    expiryDateISO: string;
    daysRemaining: number;
  }> = [];

  for (const s of staffList) {
    if (!Array.isArray(s?.certificates)) continue;
    for (const cert of s.certificates) {
      const cleanDate = String(cert?.expiryDate || "").trim().slice(0, 10);
      if (!cleanDate) continue;
      const daysRemaining = diffDaysBetweenISO(cleanDate, referenceISO);
      if (daysRemaining === null || daysRemaining > warningDays) continue;
      alerts.push({
        staffName: s.fullName,
        certName: cert.name || "Chứng chỉ chuyên môn",
        expiryDateISO: cleanDate,
        daysRemaining,
      });
    }
  }

  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return alerts;
}

function formatShortDM(dateISO?: string): string {
  const clean = String(dateISO || "").trim().slice(0, 10);
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return clean || "Chưa rõ";
  return `${m[3]}/${m[2]}`;
}

async function resolveBestServiceReportBundle(params: {
  data: ResolvedHospitalDataset;
  queryText?: string;
  vnNow: ReturnType<typeof getVNNowParts>;
  syncModeLabel: string;
}): Promise<{
  bundle: ComputedServiceReportBundle;
  explicitISO: string | null;
}> {
  const { data, queryText, vnNow, syncModeLabel } = params;
  const explicitISO = parseExplicitBriefingDateISO(queryText || "", vnNow);

  if (explicitISO) {
    const bundle = await computeServiceReportBundle(
      data,
      explicitISO,
      false,
      vnNow.dateTimeVN,
      vnNow.timeHHmm,
      syncModeLabel
    );
    return { bundle, explicitISO };
  }

  const todayBundle = await computeServiceReportBundle(
    data,
    vnNow.dateISO,
    false,
    vnNow.dateTimeVN,
    vnNow.timeHHmm,
    syncModeLabel
  );
  if (todayBundle.summary.totalCases > 0) {
    return { bundle: todayBundle, explicitISO: null };
  }

  const yesterdayISO = offsetDateISO(vnNow.dateISO, -1);
  const yesterdayBundle = await computeServiceReportBundle(
    data,
    yesterdayISO,
    false,
    vnNow.dateTimeVN,
    vnNow.timeHHmm,
    syncModeLabel
  );
  if (yesterdayBundle.summary.totalCases > 0) {
    return { bundle: yesterdayBundle, explicitISO: null };
  }

  const latestLiveIso = data.liveContext?.caseReports?.latestRecordedDay?.dateIso;
  if (typeof latestLiveIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(latestLiveIso)) {
    const latestBundle = await computeServiceReportBundle(
      data,
      latestLiveIso,
      false,
      vnNow.dateTimeVN,
      vnNow.timeHHmm,
      syncModeLabel
    );
    return { bundle: latestBundle, explicitISO: null };
  }

  return { bundle: yesterdayBundle, explicitISO: null };
}

// ==========================================
// 4A. COMPACT /tomtat REPORT BUILDER
// ==========================================
export async function generateCompactSummaryReport(params: {
  queryText?: string;
  liveContext?: any;
}): Promise<ScheduledAlertPreviewResult> {
  const vnNow = getVNNowParts();
  const data = await resolveHospitalDataset(params.liveContext);
  const syncModeLabel = `Đồng bộ trực tiếp ${vnNow.timeHHmm}`;

  const { bundle, explicitISO } = await resolveBestServiceReportBundle({
    data,
    queryText: params.queryText,
    vnNow,
    syncModeLabel,
  });

  const opsDateISO = explicitISO || vnNow.dateISO;
  const opsDateVN = formatDateISOToVN(opsDateISO);
  const opsIsToday = opsDateISO === vnNow.dateISO;

  // Compact open tasks summary
  const openTasks = data.tasks.filter(
    (t) => t && t.status !== "Đã hoàn thành" && t.status !== "Hủy"
  );
  const sortedOpenTasks = [...openTasks].sort((a, b) => {
    const dA = String(a.dueDate || "").trim().slice(0, 10);
    const dB = String(b.dueDate || "").trim().slice(0, 10);
    const rank = (d: string) => (d && d < opsDateISO ? 0 : d === opsDateISO ? 1 : 2);
    const rDiff = rank(dA) - rank(dB);
    if (rDiff !== 0) return rDiff;
    const pDiff = priorityScore(a.priority) - priorityScore(b.priority);
    if (pDiff !== 0) return pDiff;
    return (dA || "9999").localeCompare(dB || "9999");
  });

  const overdueCount = openTasks.filter((t) => {
    const d = String(t.dueDate || "").trim().slice(0, 10);
    return Boolean(d) && d < opsDateISO;
  }).length;
  const dueTodayCount = openTasks.filter(
    (t) => String(t.dueDate || "").trim().slice(0, 10) === opsDateISO
  ).length;

  // Compact leave summary
  const { activeLeaveRequests } = getActiveStaffAndLeaves(data);
  const leaveList = collectLeaveForDate(activeLeaveRequests, data.shifts, opsDateISO);
  const pendingLeaveCount = activeLeaveRequests.filter((l) => l.status === "Chờ duyệt").length;

  const extraLines: string[] = [];
  extraLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);

  const taskSummaryTags = [
    `${openTasks.length} mở`,
    ...(overdueCount > 0 ? [`${overdueCount} quá hạn`] : []),
    ...(dueTodayCount > 0 ? [`${dueTodayCount} đến hạn`] : []),
  ].join(" · ");
  extraLines.push(`📋 **CÔNG VIỆC (${taskSummaryTags})**`);

  if (sortedOpenTasks.length === 0) {
    extraLines.push(`• ✅ Không có công việc tồn đọng.`);
  } else {
    sortedOpenTasks.slice(0, 5).forEach((t) => {
      const dueISO = String(t.dueDate || "").trim().slice(0, 10);
      const tag =
        dueISO && dueISO < opsDateISO
          ? "🔴 Quá hạn"
          : dueISO === opsDateISO
          ? "🟠 Hôm nay"
          : t.priority;
      const dueShort = dueISO ? ` · ${formatShortDM(dueISO)}` : "";
      extraLines.push(
        `• [${tag}] ${t.title} — _${t.assignee || "Chưa gán"}_${dueShort}`
      );
    });
    if (sortedOpenTasks.length > 5) {
      extraLines.push(`• _... và ${sortedOpenTasks.length - 5} việc khác._`);
    }
  }

  extraLines.push("");
  extraLines.push(
    `🏖️ **NGƯỜI NGHỈ (${opsIsToday ? `Hôm nay ${opsDateVN}` : opsDateVN}: ${leaveList.length} người)**`
  );
  if (leaveList.length === 0) {
    extraLines.push(`• ✅ Đủ quân số (không có người nghỉ).`);
  } else {
    leaveList.slice(0, 8).forEach((l) => {
      const subTxt = l.substitute ? ` · Thay: ${l.substitute}` : "";
      const pendTxt = l.statusLabel === "Chờ duyệt" ? " [Chờ duyệt]" : "";
      extraLines.push(`• **${l.name}** — ${l.detail}${subTxt}${pendTxt}`);
    });
    if (leaveList.length > 8) {
      extraLines.push(`• _... và ${leaveList.length - 8} người nghỉ khác._`);
    }
  }
  if (pendingLeaveCount > 0 && leaveList.every((l) => l.statusLabel !== "Chờ duyệt")) {
    extraLines.push(`• _Có ${pendingLeaveCount} đơn xin nghỉ đang chờ duyệt._`);
  }

  return {
    ...bundle.preview,
    title: `Tóm tắt số liệu ${bundle.dateVN}, công việc & người nghỉ (${opsDateVN})`,
    telegramMarkdown: `${bundle.preview.telegramMarkdown}\n${extraLines.join("\n")}`,
    inAppSummary: `${bundle.preview.inAppSummary} Công việc mở: ${openTasks.length} (${overdueCount} quá hạn). Người nghỉ ${opsDateVN}: ${leaveList.length}.`,
    stats: [
      ...bundle.preview.stats.slice(0, 2),
      {
        label: "Công việc mở",
        value: `${openTasks.length} việc (${overdueCount} trễ)`,
        tone: overdueCount > 0 ? "danger" : openTasks.length > 0 ? "warn" : "good",
      },
      {
        label: `Nghỉ (${formatShortDM(opsDateISO)})`,
        value: `${leaveList.length} người`,
        tone: leaveList.length > 0 ? "warn" : "good",
      },
    ],
  };
}

// ==========================================
// 4B. FULL DETAILED & EVALUATED /giaoban BUILDER
// ==========================================
function buildDeterministicComprehensiveEvaluation(ctx: {
  caseDateVN: string;
  prevDateVN: string;
  opsDateVN: string;
  opsIsToday: boolean;
  bundle: ComputedServiceReportBundle;
  roomsTotal: number;
  overloadedRooms: ParaclinicalRoom[];
  maintenanceRooms: ParaclinicalRoom[];
  eqTotal: number;
  eqBrokenCount: number;
  eqExpiringCount: number;
  eqExpiredComplianceCount: number;
  activeStaffCount: number;
  dutyCount: number;
  leaveList: Array<{ name: string; detail: string; substitute?: string; statusLabel: string }>;
  pendingLeavesCount: number;
  certAlertCount: number;
  openTasksCount: number;
  overdueTasksCount: number;
  dueTodayTasksCount: number;
  urgentTasksCount: number;
  completedOpsCount: number;
  meetingsCount: number;
}): string[] {
  const { bundle } = ctx;
  const { summary, prevSummary, mtdStats, hasPrevBaseline, bhPct, ndPct } = bundle;
  const evalLines: string[] = [];

  // 1. Service volume evaluation
  if (summary.totalCases > 0) {
    const prevPctStr =
      hasPrevBaseline && prevSummary.totalCases > 0
        ? (() => {
            const diff = summary.totalCases - prevSummary.totalCases;
            const pct = ((diff / prevSummary.totalCases) * 100).toFixed(1);
            return ` (${diff >= 0 ? "+" : ""}${pct}%, ${diff >= 0 ? "+" : ""}${diff.toLocaleString("vi-VN")} ca so với ${ctx.prevDateVN})`;
          })()
        : "";
    const mtdCompStr =
      mtdStats.avgPerDay > 0
        ? (() => {
            const diffMtd = summary.totalCases - mtdStats.avgPerDay;
            const pctMtd = ((diffMtd / mtdStats.avgPerDay) * 100).toFixed(1);
            return `, ${diffMtd >= 0 ? "vượt" : "thấp hơn"} TB tháng ${Math.abs(Number(pctMtd))}% (TB ${mtdStats.avgPerDay.toLocaleString("vi-VN")} ca/ngày)`;
          })()
        : "";
    const topCat = bundle.activeCategories[0]
      ? summary.byCategoryMap.get(bundle.activeCategories[0])
      : undefined;
    const topCatTxt = topCat
      ? ` Nhóm chủ lực là **${formatCategoryHeader(topCat.category).title}** (${topCat.total.toLocaleString("vi-VN")} ca, chiếm ${Math.round(
          (topCat.total / summary.totalCases) * 100
        )}%).`
      : "";
    evalLines.push(
      `• **Hoạt động chuyên môn & sản lượng:** Tổng khối lượng đạt **${summary.totalCases.toLocaleString(
        "vi-VN"
      )} ca**${prevPctStr}${mtdCompStr}. Cơ cấu BHYT chiếm **${bhPct}%**, Dịch vụ/ND chiếm **${ndPct}%**.${topCatTxt}`
    );
  } else {
    evalLines.push(
      `• **Hoạt động chuyên môn & sản lượng:** Chưa ghi nhận số ca ngày ${ctx.caseDateVN} trên hệ thống/Google Sheet; cần kiểm tra tiến độ cập nhật bảng số liệu.`
    );
  }

  // 2. Rooms & capacity evaluation
  if (ctx.roomsTotal === 0) {
    evalLines.push(
      `• **Phòng chuyên môn & công suất:** Chưa có dữ liệu phòng chuyên môn trong kho đồng bộ.`
    );
  } else if (ctx.overloadedRooms.length > 0 || ctx.maintenanceRooms.length > 0) {
    const parts: string[] = [];
    if (ctx.overloadedRooms.length > 0) {
      parts.push(
        `${ctx.overloadedRooms.length} phòng đang tải cao/quá tải (${ctx.overloadedRooms
          .slice(0, 3)
          .map((r) => `${r.name} ${r.utilizationRate}%`)
          .join(", ")})`
      );
    }
    if (ctx.maintenanceRooms.length > 0) {
      parts.push(
        `${ctx.maintenanceRooms.length} phòng đang bảo trì/tạm ngưng (${ctx.maintenanceRooms
          .slice(0, 2)
          .map((r) => r.name)
          .join(", ")})`
      );
    }
    evalLines.push(
      `• **Phòng chuyên môn & điều phối luồng bệnh nhân:** Trong ${ctx.roomsTotal} phòng có ${parts.join(
        "; "
      )} — cần điều tiết bệnh nhân sang phòng dự phòng trong khung giờ cao điểm.`
    );
  } else {
    evalLines.push(
      `• **Phòng chuyên môn & công suất:** Cả ${ctx.roomsTotal} phòng vận hành ổn định, chưa ghi nhận điểm nghẽn quá tải.`
    );
  }

  // 3. Equipment & compliance evaluation
  if (ctx.eqBrokenCount > 0 || ctx.eqExpiringCount > 0) {
    const riskLevel =
      ctx.eqBrokenCount > 0 || ctx.eqExpiredComplianceCount > 0 ? "Mức cảnh báo cao" : "Cần theo dõi";
    evalLines.push(
      `• **Trang thiết bị & an toàn kiểm định (${riskLevel}):** Hiện có **${ctx.eqBrokenCount}** máy gặp sự cố/khóa an toàn và **${ctx.eqExpiringCount}** mốc kiểm định/bảo trì ≤30 ngày (trong đó **${ctx.eqExpiredComplianceCount}** mốc đã quá hạn), cần tổ TBYT bám sát khắc phục.`
    );
  } else {
    evalLines.push(
      `• **Trang thiết bị & an toàn kiểm định:** Toàn bộ ${ctx.eqTotal} thiết bị hoạt động bình thường, các hạn kiểm chuẩn/ATBX/bảo trì đều an toàn (>30 ngày).`
    );
  }

  // 4. HR, Duty roster, Leaves & Certs evaluation
  const missingSubCount = ctx.leaveList.filter((l) => !l.substitute).length;
  const hrParts: string[] = [
    `Quân số hoạt động **${ctx.activeStaffCount} người**, phân công **${ctx.dutyCount} lượt trực/ca làm việc**`,
    ctx.leaveList.length > 0
      ? `có **${ctx.leaveList.length} người nghỉ**${
          missingSubCount > 0 ? ` (${missingSubCount} người chưa ghi nhận người thay ca)` : " (đã bố trí người thay thế)"
        }`
      : `không có người nghỉ trong ngày`,
  ];
  if (ctx.pendingLeavesCount > 0) {
    hrParts.push(`${ctx.pendingLeavesCount} đơn nghỉ phép chờ duyệt`);
  }
  if (ctx.certAlertCount > 0) {
    hrParts.push(`${ctx.certAlertCount} chứng chỉ nhân sự sắp/đã hết hạn ≤30 ngày`);
  }
  evalLines.push(`• **Nhân sự, lịch trực & chứng chỉ:** ${hrParts.join("; ")}.`);

  // 5. Tasks & Meetings evaluation
  evalLines.push(
    `• **Công việc & lịch họp:** Đang mở **${ctx.openTasksCount}** đầu việc (**${ctx.overdueTasksCount}** quá hạn, **${ctx.dueTodayTasksCount}** đến hạn ${
      ctx.opsIsToday ? "hôm nay" : ctx.opsDateVN
    }, **${ctx.urgentTasksCount}** khẩn cấp/cao; đã xong **${ctx.completedOpsCount}** việc). Lịch họp ghi nhận **${ctx.meetingsCount}** cuộc họp.`
  );

  // 6. Prioritized executive recommendations
  const actions: string[] = [];
  if (ctx.eqBrokenCount > 0 || ctx.eqExpiredComplianceCount > 0) {
    actions.push(
      `Xử lý dứt điểm ${ctx.eqBrokenCount > 0 ? `${ctx.eqBrokenCount} thiết bị sự cố/khóa` : ""}${
        ctx.eqBrokenCount > 0 && ctx.eqExpiredComplianceCount > 0 ? " và " : ""
      }${
        ctx.eqExpiredComplianceCount > 0 ? `${ctx.eqExpiredComplianceCount} hồ sơ kiểm định quá hạn` : ""
      } để đảm bảo thông suốt kỹ thuật & ISO/ATBX.`
    );
  }
  if (ctx.overdueTasksCount > 0 || ctx.dueTodayTasksCount > 0) {
    const taskActionParts = [
      ctx.overdueTasksCount > 0 ? `${ctx.overdueTasksCount} việc quá hạn` : "",
      ctx.dueTodayTasksCount > 0 ? `${ctx.dueTodayTasksCount} việc đến hạn trong ngày ${ctx.opsDateVN}` : "",
    ].filter(Boolean);
    actions.push(`Đôn đốc hoàn thành ${taskActionParts.join(" và ")}.`);
  }
  if (ctx.overloadedRooms.length > 0) {
    actions.push(
      `Điều phối nhân lực hỗ trợ ${ctx.overloadedRooms
        .slice(0, 2)
        .map((r) => r.name)
        .join(", ")} đang công suất cao.`
    );
  }
  if (missingSubCount > 0 || ctx.pendingLeavesCount > 0) {
    actions.push(
      `Rà soát ${missingSubCount > 0 ? "bố trí người thay ca cho nhân sự nghỉ" : ""}${
        missingSubCount > 0 && ctx.pendingLeavesCount > 0 ? " và " : ""
      }${ctx.pendingLeavesCount > 0 ? `phê duyệt ${ctx.pendingLeavesCount} đơn nghỉ tồn` : ""}.`
    );
  }
  if (actions.length === 0) {
    actions.push(
      "Duy trì IQC đầu ngày, giám sát TAT trả kết quả các nhóm kỹ thuật trọng điểm và cập nhật số ca kịp thời lên Google Sheet."
    );
  }

  evalLines.push(`• **Kiến nghị điều hành ưu tiên:** ${actions.join(" ")}`);
  return evalLines;
}

async function generateGeminiBriefingEvaluation(
  digestText: string,
  fallbackLines: string[]
): Promise<{ lines: string[]; usedAi: boolean }> {
  const ai = getGeminiClient();
  if (!ai) {
    return { lines: fallbackLines, usedAi: false };
  }

  const systemInstruction = `Bạn là Trưởng Khoa Cận Lâm Sàng dày dặn kinh nghiệm đang tổng kết báo cáo giao ban toàn khoa.
Hãy viết phần **ĐÁNH GIÁ TỔNG HỢP TẤT CẢ CÁC NỘI DUNG & KHUYẾN NGHỊ ĐIỀU HÀNH** bằng tiếng Việt súc tích, thực chiến dựa HOÀN TOÀN vào DỮ LIỆU THỰC TẾ bên dưới.

QUY TẮC BẮT BUỘC:
1. Chỉ sử dụng số liệu, tên phòng, tên máy, tên nhân sự, tên công việc có thật trong dữ liệu cung cấp. TUYỆT ĐỐI không tự bịa số liệu hay thêm SOP không liên quan.
2. Đánh giá ĐẦY ĐỦ cả 5 mảng nội dung:
   • **Số liệu dịch vụ & biến động** (tổng ca, % tăng/giảm, so với TB tháng, cơ cấu BH/ND, nhóm nổi bật)
   • **Phòng chuyên môn & công suất** (điểm nóng quá tải, phòng bảo trì/tạm ngưng hoặc vận hành ổn)
   • **Trang thiết bị & an toàn kiểm định** (máy sự cố/khóa, mốc sắp/quá hạn ATBX/ISO/bảo trì)
   • **Nhân sự, lịch trực, nghỉ phép & chứng chỉ** (đủ hay thiếu quân số, thay ca, đơn chờ duyệt, chứng chỉ sắp hạn)
   • **Công việc & lịch họp** (việc quá hạn/đến hạn/ưu tiên, cuộc họp trọng tâm)
3. Kết thúc bằng mục **• Khuyến nghị điều hành ưu tiên:** gồm 2-4 hành động cụ thể nhất ngay trong ngày (gắn đúng tên đối tượng thực tế).
4. Định dạng: mỗi mảng 1 gạch đầu dòng \`• **Tên mảng:** nội dung súc tích 1-2 câu\`. Không dùng bảng Markdown \`|...|\`, không viết lời mở đầu hay kết luận thừa.`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: VALID_PRIMARY_MODEL,
        contents: `DỮ LIỆU GIAO BAN THỰC TẾ:\n${digestText}`,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      10000,
      "Briefing evaluation AI timeout"
    );

    const text = (response?.text || "").trim();
    if (text.length > 60) {
      const cleanedLines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      return { lines: cleanedLines, usedAi: true };
    }
  } catch {
    // Quick fallback to flash-lite once before deterministic fallback
    try {
      const fallbackRes = await withTimeout(
        ai.models.generateContent({
          model: VALID_FALLBACK_MODEL,
          contents: `DỮ LIỆU GIAO BAN THỰC TẾ:\n${digestText}`,
          config: { systemInstruction },
        }),
        7000,
        "Briefing evaluation fallback timeout"
      );
      const text = (fallbackRes?.text || "").trim();
      if (text.length > 60) {
        const cleanedLines = text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        return { lines: cleanedLines, usedAi: true };
      }
    } catch {
      // Fall back cleanly to deterministic multi-domain evaluation
    }
  }

  return { lines: fallbackLines, usedAi: false };
}

export async function generateFullBriefingReport(params: {
  queryText?: string;
  liveContext?: any;
}): Promise<ScheduledAlertPreviewResult> {
  const vnNow = getVNNowParts();
  const data = await resolveHospitalDataset(params.liveContext);
  const syncModeLabel = `Đồng bộ trực tiếp ${vnNow.timeHHmm}`;

  const { bundle, explicitISO } = await resolveBestServiceReportBundle({
    data,
    queryText: params.queryText,
    vnNow,
    syncModeLabel,
  });

  const opsDateISO = explicitISO || vnNow.dateISO;
  const opsDateVN = formatDateISOToVN(opsDateISO);
  const opsWeekday = getVNWeekdayLabel(opsDateISO);
  const opsIsToday = opsDateISO === vnNow.dateISO;

  // Operational data
  const { activeStaff, activeLeaveRequests } = getActiveStaffAndLeaves(data);
  const certAlerts = scanStaffCertificateAlertsForDate(activeStaff, opsDateISO, 30);
  const dutyList = collectOnDutyForDate(data.shifts, opsDateISO);
  const leaveList = collectLeaveForDate(activeLeaveRequests, data.shifts, opsDateISO);
  const pendingLeaves = activeLeaveRequests.filter((l) => l.status === "Chờ duyệt");

  const eqScan = scanEquipmentAlertsForDate(data.equipment, opsDateISO, 30);
  const eqExpiredComplianceCount = eqScan.expiringAlerts.filter((e) => e.daysRemaining < 0).length;

  const rooms = data.rooms || [];
  const overloadedRooms = rooms
    .filter((r) => r.utilizationRate >= 85 || r.status === "Quá tải")
    .sort((a, b) => (b.utilizationRate || 0) - (a.utilizationRate || 0));
  const maintenanceRooms = rooms.filter(
    (r) => r.status === "Bảo trì" || r.status === "Tạm nghỉ" || r.status === "Tạm ngưng"
  );
  const activeRoomsCount = rooms.filter(
    (r) => r.status === "Đang hoạt động" || r.status === "Quá tải"
  ).length;

  const openTasks = data.tasks.filter(
    (t) => t && t.status !== "Đã hoàn thành" && t.status !== "Hủy"
  );
  const completedOps = data.tasks.filter((t) => {
    if (!t || t.status !== "Đã hoàn thành") return false;
    const upd = String(t.updatedDate || "").trim().slice(0, 10);
    const due = String(t.dueDate || "").trim().slice(0, 10);
    return upd === opsDateISO || due === opsDateISO;
  });
  const tasksOverdue = openTasks
    .filter((t) => {
      const d = String(t.dueDate || "").trim().slice(0, 10);
      return Boolean(d) && d < opsDateISO;
    })
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const tasksDueToday = openTasks
    .filter((t) => String(t.dueDate || "").trim().slice(0, 10) === opsDateISO)
    .sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority));
  const tasksUrgentOther = openTasks
    .filter((t) => {
      const d = String(t.dueDate || "").trim().slice(0, 10);
      return (!d || d > opsDateISO) && (t.priority === "Khẩn cấp" || t.priority === "Cao");
    })
    .sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority));

  const meetingsOnDate = collectMeetingsForDate(data.meetings, data.meetingItems, opsDateISO);
  const upcomingMeetings: Array<{ dateVN: string; title: string; time: string; location: string }> = [];
  for (let delta = 1; delta <= 2; delta++) {
    const dIso = offsetDateISO(opsDateISO, delta);
    const list = collectMeetingsForDate(data.meetings, data.meetingItems, dIso);
    for (const m of list) {
      upcomingMeetings.push({
        dateVN: formatShortDM(dIso),
        title: m.title,
        time: m.time,
        location: m.location,
      });
    }
  }

  const { summary, prevSummary, mtdStats, hasPrevBaseline, bhPct, ndPct } = bundle;
  const lines: string[] = [];

  // Header
  lines.push(`📋 **BÁO CÁO GIAO BAN CHI TIẾT & ĐÁNH GIÁ TOÀN KHOA CLS**`);
  lines.push(
    `📅 Số liệu kỹ thuật: **${bundle.dateVN}** (${bundle.weekday}) · Điều hành: **${opsDateVN}** (${opsWeekday})`
  );
  lines.push(`👤 Đồng bộ từ: ${bundle.syncOriginLabel}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);

  // SECTION 1: Detailed Service Metrics
  lines.push(`📊 **1. CHI TIẾT SỐ LIỆU DỊCH VỤ KỸ THUẬT**`);
  if (summary.totalCases === 0 && !hasPrevBaseline) {
    lines.push(`⚠️ Chưa ghi nhận số ca nào cho ngày **${bundle.dateVN}** (Tháng ${bundle.monthNum}/${bundle.year}).`);
  } else {
    bundle.activeCategories.forEach((catName) => {
      const curCat = summary.byCategoryMap.get(catName) || {
        category: catName,
        bh: 0,
        nd: 0,
        total: 0,
      };
      const prevCat = prevSummary.byCategoryMap.get(catName);
      const { icon, title } = formatCategoryHeader(catName);
      let catDeltaBadge = "";
      if (hasPrevBaseline && prevCat && prevCat.total > 0) {
        const diff = curCat.total - prevCat.total;
        const pct = ((diff / prevCat.total) * 100).toFixed(1);
        catDeltaBadge = ` · ${diff >= 0 ? "+" : ""}${pct}%`;
      }
      lines.push(
        `${icon} **${title} (Tổng: ${curCat.total.toLocaleString("vi-VN")} ca${catDeltaBadge})**`
      );

      const catServices = bundle.allMergedServices.filter(
        (s) => s.category === catName && (s.curTotal > 0 || s.isLt)
      );
      catServices.forEach((svc) => {
        const bhPart = svc.curBh > 0 ? `BH: ${svc.curBh.toLocaleString("vi-VN")}` : "";
        const ndPart = svc.curNd > 0 ? `ND: ${svc.curNd.toLocaleString("vi-VN")}` : "";
        const breakdownList = [bhPart, ndPart].filter(Boolean);
        const breakdownTxt = breakdownList.length > 0 ? ` (${breakdownList.join(", ")})` : "";
        const ltSuffix = svc.isLt ? " [LT]" : "";
        lines.push(
          `• ${svc.name}${ltSuffix}: **${svc.curTotal.toLocaleString("vi-VN")} ca**${breakdownTxt}`
        );
      });
    });

    const totalPctDeltaText = formatComparisonDelta(
      summary.totalCases,
      prevSummary.totalCases,
      hasPrevBaseline
    );
    lines.push(
      `📈 **TỔNG CỘNG TOÀN KHOA: ${summary.totalCases.toLocaleString("vi-VN")} ca**${
        bundle.activeServicesCount > 0 ? ` (${bundle.activeServicesCount} dịch vụ kỹ thuật)` : ""
      }`
    );
    lines.push(`• So với ngày hôm trước (${bundle.prevDateVN}): ${totalPctDeltaText}`);
    lines.push(
      `• Cơ cấu thanh toán: BHYT **${summary.totalBh.toLocaleString(
        "vi-VN"
      )} ca** (${bhPct}%) · Ngoài định mức / DV **${summary.totalNd.toLocaleString(
        "vi-VN"
      )} ca** (${ndPct}%)`
    );
    if (mtdStats.monthTotal > 0) {
      const mtdDeltaTxt =
        mtdStats.avgPerDay > 0
          ? (() => {
              const d = summary.totalCases - mtdStats.avgPerDay;
              const p = ((d / mtdStats.avgPerDay) * 100).toFixed(1);
              return ` (${d >= 0 ? "+" : ""}${p}% so với TB tháng)`;
            })()
          : "";
      lines.push(
        `• Lũy kế Tháng ${bundle.monthNum}/${bundle.year}: **${mtdStats.monthTotal.toLocaleString(
          "vi-VN"
        )} ca** (${mtdStats.activeDays} ngày · TB **${mtdStats.avgPerDay.toLocaleString(
          "vi-VN"
        )} ca/ngày**)${mtdDeltaTxt}`
      );
    }

    if (hasPrevBaseline) {
      const topMoversUp = bundle.allMergedServices
        .filter((s) => s.curTotal - s.prevTotal > 0 && s.prevTotal > 0)
        .sort((a, b) => b.curTotal - b.prevTotal - (a.curTotal - a.prevTotal))
        .slice(0, 3);
      const topMoversDown = bundle.allMergedServices
        .filter((s) => s.curTotal - s.prevTotal < 0 && s.prevTotal > 0)
        .sort((a, b) => a.curTotal - a.prevTotal - (b.curTotal - b.prevTotal))
        .slice(0, 3);
      if (topMoversUp.length > 0) {
        lines.push(
          `• Biến động tăng nổi bật: ${topMoversUp
            .map((s) => `${s.name} (+${s.curTotal - s.prevTotal})`)
            .join(", ")}`
        );
      }
      if (topMoversDown.length > 0) {
        lines.push(
          `• Biến động giảm đáng chú ý: ${topMoversDown
            .map((s) => `${s.name} (${s.curTotal - s.prevTotal})`)
            .join(", ")}`
        );
      }
    }
  }

  lines.push("");

  // SECTION 2: Rooms & Capacity
  lines.push(
    `🏥 **2. PHÒNG CHUYÊN MÔN & CÔNG SUẤT (${rooms.length} phòng · ${activeRoomsCount} đang hoạt động)**`
  );
  if (rooms.length === 0) {
    lines.push(`• Chưa ghi nhận danh sách phòng chuyên môn trong hệ thống.`);
  } else {
    if (overloadedRooms.length > 0) {
      lines.push(`• 🔥 **Phòng tải cao / quá tải (${overloadedRooms.length}):**`);
      overloadedRooms.slice(0, 6).forEach((r) => {
        lines.push(
          `  - **${r.name}** (${r.code}): ${r.currentDayCases}/${r.maxCapacityCasesPerDay} ca (**${r.utilizationRate}%** · ${r.status}) — PT: _${
            r.managerInCharge || "Chưa gán"
          }_`
        );
      });
    }
    if (maintenanceRooms.length > 0) {
      lines.push(`• 🔧 **Phòng bảo trì / tạm ngưng (${maintenanceRooms.length}):**`);
      maintenanceRooms.slice(0, 5).forEach((r) => {
        lines.push(`  - **${r.name}** (${r.code}): ${r.status} — PT: _${r.managerInCharge || "Chưa gán"}_`);
      });
    }
    if (overloadedRooms.length === 0 && maintenanceRooms.length === 0) {
      const topBusyRooms = [...rooms]
        .sort((a, b) => (b.utilizationRate || 0) - (a.utilizationRate || 0))
        .slice(0, 4);
      lines.push(
        `• ✅ Các phòng đều vận hành trong ngưỡng an toàn (<85% công suất). Cao nhất: ${topBusyRooms
          .map((r) => `${r.name} (${r.utilizationRate}%)`)
          .join(", ")}.`
      );
    }
  }

  lines.push("");

  // SECTION 3: Equipment & Compliance
  lines.push(
    `🛠️ **3. THIẾT BỊ Y TẾ & KIỂM ĐỊNH (${data.equipment.length} máy · ${eqScan.brokenOrLocked.length} sự cố/khóa · ${eqScan.expiringAlerts.length} mốc ≤30 ngày)**`
  );
  if (data.equipment.length === 0) {
    lines.push(`• Chưa có dữ liệu máy móc trong hệ thống.`);
  } else {
    if (eqScan.brokenOrLocked.length > 0) {
      lines.push(`• ⚠️ **Máy đang khóa an toàn / sự cố / bảo trì (${eqScan.brokenOrLocked.length}):**`);
      eqScan.brokenOrLocked.slice(0, 8).forEach((eq, idx) => {
        const reason = eq.lockoutReason ? ` (${eq.lockoutReason})` : "";
        lines.push(
          `  ${idx + 1}. **${eq.name}** (${eq.code} · ${eq.room}) — ${
            eq.isLockedOut ? "ĐANG KHÓA AN TOÀN" : eq.status
          }${reason}`
        );
      });
    }
    if (eqScan.expiringAlerts.length > 0) {
      lines.push(`• 🔔 **Mốc hết hạn kiểm định / ATBX / bảo trì ≤30 ngày (${eqScan.expiringAlerts.length}):**`);
      eqScan.expiringAlerts.slice(0, 10).forEach((a, idx) => {
        const icon = a.daysRemaining < 0 ? "🔴" : a.daysRemaining <= 7 ? "🟠" : "🟡";
        lines.push(
          `  ${idx + 1}. ${icon} **${a.equipmentName}** (${a.equipmentCode}) — ${
            a.trackLabel
          }: ${formatDateISOToVN(a.expiryDateISO)} (${formatExpiryDeltaLabel(a.daysRemaining)}) · PT: ${
            a.technician
          }`
        );
      });
      if (eqScan.expiringAlerts.length > 10) {
        lines.push(`  _... và ${eqScan.expiringAlerts.length - 10} mốc khác._`);
      }
    }
    if (eqScan.brokenOrLocked.length === 0 && eqScan.expiringAlerts.length === 0) {
      lines.push(`• ✅ Tất cả ${data.equipment.length} thiết bị hoạt động tốt và còn hạn kiểm định >30 ngày.`);
    }
  }

  lines.push("");

  // SECTION 4: HR, Duty Roster, Leave & Certificates
  lines.push(
    `👥 **4. NHÂN SỰ, LỊCH TRỰC & NGHỈ PHÉP (${opsDateVN} · ${activeStaff.length} nhân sự hoạt động)**`
  );
  lines.push(`• **Lịch trực & phân ca (${dutyList.length} lượt phân công):**`);
  if (dutyList.length > 0) {
    dutyList.slice(0, 15).forEach((sh, idx) => {
      const name = sh.userName || sh.assignedUserName || "Chưa rõ";
      const timeStr =
        sh.startTime && sh.endTime
          ? `${sh.startTime}–${sh.endTime}`
          : sh.shiftTime || sh.shiftName || sh.workType || "Trong ca";
      const place = formatUniqueUnitLabel([sh.room || sh.roomLocation, sh.machine], " / ");
      lines.push(
        `  ${idx + 1}. **${name}** (${sh.workType || "Ca trực"} · ${timeStr})${
          place ? ` — ${place}` : ""
        }`
      );
    });
    if (dutyList.length > 15) {
      lines.push(`  _... và ${dutyList.length - 15} lượt phân ca khác._`);
    }
  } else {
    lines.push(`  - Chưa ghi nhận lịch trực ngày ${opsDateVN}.`);
  }

  lines.push(`• **Nhân sự nghỉ ngày ${opsDateVN} (${leaveList.length} người):**`);
  if (leaveList.length > 0) {
    leaveList.forEach((l, idx) => {
      const subText = l.substitute ? ` · Thay ca: ${l.substitute}` : " · ⚠️ Chưa ghi nhận người thay";
      lines.push(`  ${idx + 1}. **${l.name}** — ${l.detail} [${l.statusLabel}]${subText}`);
    });
  } else {
    lines.push(`  - ✅ Đầy đủ quân số, không có nhân sự nghỉ ngày ${opsDateVN}.`);
  }

  if (pendingLeaves.length > 0) {
    lines.push(`• ⏳ **Đơn xin nghỉ đang chờ duyệt (${pendingLeaves.length} đơn):**`);
    pendingLeaves.slice(0, 5).forEach((pl) => {
      lines.push(
        `  - **${pl.userName}** — ${pl.leaveType} (${formatShortDM(pl.startDate)}–${formatShortDM(
          pl.endDate
        )})`
      );
    });
  }

  if (certAlerts.length > 0) {
    lines.push(`• 🪪 **Chứng chỉ nhân sự sắp/đã hết hạn ≤30 ngày (${certAlerts.length}):**`);
    certAlerts.slice(0, 5).forEach((c) => {
      const icon = c.daysRemaining < 0 ? "🔴" : "🟠";
      lines.push(
        `  - ${icon} **${c.staffName}** — ${c.certName} (${formatExpiryDeltaLabel(c.daysRemaining)})`
      );
    });
  }

  lines.push("");

  // SECTION 5: Tasks & Meetings
  lines.push(
    `📋 **5. CÔNG VIỆC & LỊCH HỌP (${openTasks.length} việc mở · ${completedOps.length} xong ${
      opsIsToday ? "hôm nay" : opsDateVN
    })**`
  );
  if (tasksOverdue.length > 0) {
    lines.push(`• 🔴 **Công việc quá hạn (${tasksOverdue.length}):**`);
    tasksOverdue.slice(0, 8).forEach((t, idx) => {
      const lateDays = Math.abs(diffDaysBetweenISO(t.dueDate, opsDateISO) || 0);
      lines.push(
        `  ${idx + 1}. [${t.priority}] ${t.title} — _${t.assignee || "Chưa gán"}_ (Hạn ${formatDateISOToVN(
          t.dueDate
        )}, trễ ${lateDays} ngày · ${t.status})`
      );
    });
    if (tasksOverdue.length > 8) {
      lines.push(`  _... và ${tasksOverdue.length - 8} việc quá hạn khác._`);
    }
  }
  if (tasksDueToday.length > 0) {
    lines.push(`• 🟠 **Công việc đến hạn ngày ${opsDateVN} (${tasksDueToday.length}):**`);
    tasksDueToday.slice(0, 8).forEach((t, idx) => {
      lines.push(
        `  ${idx + 1}. [${t.priority}] ${t.title} — _${t.assignee || "Chưa gán"}_ (${t.status})`
      );
    });
  }
  if (tasksUrgentOther.length > 0) {
    lines.push(`• ⚡ **Việc ưu tiên Cao/Khẩn cấp hạn sắp tới (${tasksUrgentOther.length}):**`);
    tasksUrgentOther.slice(0, 5).forEach((t, idx) => {
      lines.push(
        `  ${idx + 1}. [${t.priority}] ${t.title} — _${t.assignee || "Chưa gán"}_ (Hạn ${formatShortDM(
          t.dueDate
        )})`
      );
    });
  }
  if (openTasks.length === 0) {
    lines.push(`• ✅ Hiện không có công việc tồn đọng hoặc quá hạn.`);
  } else if (tasksOverdue.length === 0 && tasksDueToday.length === 0 && tasksUrgentOther.length === 0) {
    lines.push(`• ✅ Không có việc quá hạn hay đến hạn trong ngày; còn ${openTasks.length} việc hạn sau ${opsDateVN}.`);
  }

  if (meetingsOnDate.length > 0) {
    lines.push(`• 📅 **Lịch họp ngày ${opsDateVN} (${meetingsOnDate.length}):**`);
    meetingsOnDate.slice(0, 6).forEach((m) => {
      lines.push(
        `  - ${m.time}: **${m.title}** (${m.location}${m.chair ? ` · Chủ trì: ${m.chair}` : ""})`
      );
    });
  } else {
    lines.push(`• 📅 **Lịch họp ngày ${opsDateVN}:** Không có cuộc họp lên lịch.`);
  }
  if (upcomingMeetings.length > 0) {
    lines.push(
      `• 🗓️ Lịch họp 2 ngày tới: ${upcomingMeetings
        .slice(0, 4)
        .map((m) => `${m.dateVN} ${m.time} (${m.title})`)
        .join("; ")}`
    );
  }

  lines.push("");
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);

  // SECTION 6: Comprehensive evaluation across ALL sections
  const deterministicEvalLines = buildDeterministicComprehensiveEvaluation({
    caseDateVN: bundle.dateVN,
    prevDateVN: bundle.prevDateVN,
    opsDateVN,
    opsIsToday,
    bundle,
    roomsTotal: rooms.length,
    overloadedRooms,
    maintenanceRooms,
    eqTotal: data.equipment.length,
    eqBrokenCount: eqScan.brokenOrLocked.length,
    eqExpiringCount: eqScan.expiringAlerts.length,
    eqExpiredComplianceCount,
    activeStaffCount: activeStaff.length,
    dutyCount: dutyList.length,
    leaveList,
    pendingLeavesCount: pendingLeaves.length,
    certAlertCount: certAlerts.length,
    openTasksCount: openTasks.length,
    overdueTasksCount: tasksOverdue.length,
    dueTodayTasksCount: tasksDueToday.length,
    urgentTasksCount: tasksUrgentOther.length,
    completedOpsCount: completedOps.length,
    meetingsCount: meetingsOnDate.length,
  });

  // Compact verified facts snapshot for AI evaluation
  const digestForEval = lines.join("\n").slice(0, 7500);
  const evalResult = await generateGeminiBriefingEvaluation(
    digestForEval,
    deterministicEvalLines
  );

  lines.push(`🧠 **6. ĐÁNH GIÁ TỔNG HỢP TẤT CẢ CÁC NỘI DUNG & KHUYẾN NGHỊ ĐIỀU HÀNH**`);
  evalResult.lines.forEach((el) => lines.push(el));

  const inAppSummary = `${bundle.preview.inAppSummary} Phòng: ${overloadedRooms.length}/${rooms.length} tải cao. Máy: ${eqScan.brokenOrLocked.length} sự cố, ${eqScan.expiringAlerts.length} mốc ≤30 ngày. Trực ${dutyList.length}, nghỉ ${leaveList.length}, việc mở ${openTasks.length} (${tasksOverdue.length} quá hạn).`;

  return {
    ruleId: "morning_0700",
    ruleName: "Giao ban Toàn diện Khoa CLS",
    targetDateVN: bundle.targetISO,
    generatedAtVN: vnNow.dateTimeVN,
    title: `Báo cáo giao ban chi tiết toàn khoa (${bundle.dateVN})`,
    telegramMarkdown: lines.join("\n"),
    inAppSummary,
    stats: [
      {
        label: `Tổng ca (${formatShortDM(bundle.targetISO)})`,
        value: `${summary.totalCases.toLocaleString("vi-VN")} ca`,
        tone: summary.totalCases > 0 ? "good" : "warn",
      },
      {
        label: "Thiết bị / Phòng",
        value: `${eqScan.brokenOrLocked.length} sự cố · ${overloadedRooms.length} phòng nóng`,
        tone:
          eqScan.brokenOrLocked.length > 0 || overloadedRooms.length > 0
            ? "danger"
            : eqScan.expiringAlerts.length > 0
            ? "warn"
            : "good",
      },
      {
        label: "Trực / Nghỉ phép",
        value: `${dutyList.length} trực · ${leaveList.length} nghỉ`,
        tone: "neutral",
      },
      {
        label: "Công việc mở",
        value: `${openTasks.length} việc (${tasksOverdue.length} trễ)`,
        tone: tasksOverdue.length > 0 ? "danger" : openTasks.length > 0 ? "warn" : "good",
      },
    ],
    dataSourceNotes: Array.from(
      new Set([
        ...bundle.preview.dataSourceNotes,
        evalResult.usedAi ? "Đánh giá tổng hợp AI" : "Đánh giá tổng hợp tự động",
      ])
    ),
  };
}

function parseExplicitBriefingDateISO(queryText: string, vnNow: ReturnType<typeof getVNNowParts>): string | null {
  const clean = String(queryText || "").trim();
  const norm = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

  if (/\bhom kia\b/.test(norm)) return offsetDateISO(vnNow.dateISO, -2);
  if (/\bhom qua\b/.test(norm)) return offsetDateISO(vnNow.dateISO, -1);
  if (/\bhom nay\b/.test(norm)) return vnNow.dateISO;

  const fullMatch = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (fullMatch) {
    const d = Math.min(31, Math.max(1, parseInt(fullMatch[1], 10)));
    const m = Math.min(12, Math.max(1, parseInt(fullMatch[2], 10)));
    const y = parseInt(fullMatch[3], 10);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const dmMatch = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (dmMatch) {
    const d = Math.min(31, Math.max(1, parseInt(dmMatch[1], 10)));
    const m = Math.min(12, Math.max(1, parseInt(dmMatch[2], 10)));
    return `${vnNow.year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const dayOnlyMatch = norm.match(/\bngay\s+(\d{1,2})\b/);
  if (dayOnlyMatch) {
    const d = Math.min(31, Math.max(1, parseInt(dayOnlyMatch[1], 10)));
    return `${vnNow.year}-${String(vnNow.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  return null;
}

export async function generateInteractiveBriefingReport(params: {
  queryText?: string;
  liveContext?: any;
}): Promise<ScheduledAlertPreviewResult> {
  return generateFullBriefingReport(params);
}

export async function executeScheduledAlertRule(params: {
  rule: ScheduledAlertRuleConfig;
  triggerMode: "auto_schedule" | "manual_test";
  targetDateVN?: string;
  liveContext?: any;
  channelOverride?: ScheduledAlertChannel;
  customChatId?: string;
}): Promise<{
  historyItem: ScheduledAlertHistoryItem;
  preview: ScheduledAlertPreviewResult;
}> {
  const vnNow = getVNNowParts();
  if (params.liveContext?.settings && typeof params.liveContext.settings === "object") {
    await mergeSheetConfigIntoSettingsDbIfMissing(params.liveContext.settings);
  }

  // Step 1: ALWAYS update & sync data from PostgreSQL + Google Sheet BEFORE building and sending report
  const initialData = await resolveHospitalDataset(params.liveContext);
  const deliveryCfgInit = telegramManager.getDeliveryConfig();

  // Guard 1: On auto_schedule, NEVER dispatch empty/false-alarm Telegram reports when PostgreSQL failed or instance is unlinked
  if (params.triggerMode === "auto_schedule") {
    if (initialData.dbConfigured && !initialData.dbReachable) {
      const errMsg =
        "PostgreSQL tạm thời không phản hồi khi chuẩn bị gửi báo cáo tự động; hủy gửi tin rỗng và tự động thử lại sau 2 phút.";
      console.warn(`[ScheduledAlerts] ${errMsg}`);
      const failedPreview: ScheduledAlertPreviewResult = {
        ruleId: params.rule.id,
        ruleName: params.rule.name,
        targetDateVN: params.targetDateVN || vnNow.dateISO,
        generatedAtVN: vnNow.dateTimeVN,
        title: params.rule.name,
        telegramMarkdown: "",
        inAppSummary: errMsg,
        stats: [],
        dataSourceNotes: [],
      };
      const historyItem: ScheduledAlertHistoryItem = {
        id: `RUN-${params.rule.id}-${Date.now().toString().slice(-6)}`,
        ruleId: params.rule.id,
        ruleName: params.rule.name,
        targetDateVN: failedPreview.targetDateVN,
        triggeredAt: vnNow.dateTimeVN,
        triggerMode: params.triggerMode,
        status: "error",
        telegramSent: false,
        inAppSaved: false,
        summary: errMsg,
        errorMessage: errMsg,
        hostLabel: deliveryCfgInit.hostLabel,
      };
      return { historyItem, preview: failedPreview };
    }

    const hasAnyHospitalState =
      initialData.dbConfigured ||
      Boolean(initialData.liveContext?.settings) ||
      initialData.equipment.length > 0 ||
      initialData.tasks.length > 0;
    if (!hasAnyHospitalState) {
      const errMsg =
        "Phiên bản máy chủ chưa liên kết PostgreSQL (EXTERNAL_DATABASE_URL) và chưa có dữ liệu trình duyệt nên không tự phát báo cáo.";
      console.warn(`[ScheduledAlerts] ${errMsg}`);
      const skippedPreview: ScheduledAlertPreviewResult = {
        ruleId: params.rule.id,
        ruleName: params.rule.name,
        targetDateVN: params.targetDateVN || vnNow.dateISO,
        generatedAtVN: vnNow.dateTimeVN,
        title: params.rule.name,
        telegramMarkdown: "",
        inAppSummary: errMsg,
        stats: [],
        dataSourceNotes: [],
      };
      const historyItem: ScheduledAlertHistoryItem = {
        id: `RUN-${params.rule.id}-${Date.now().toString().slice(-6)}`,
        ruleId: params.rule.id,
        ruleName: params.rule.name,
        targetDateVN: skippedPreview.targetDateVN,
        triggeredAt: vnNow.dateTimeVN,
        triggerMode: params.triggerMode,
        status: "error",
        telegramSent: false,
        inAppSaved: false,
        summary: errMsg,
        errorMessage: errMsg,
        hostLabel: deliveryCfgInit.hostLabel,
      };
      return { historyItem, preview: skippedPreview };
    }
  }

  const preSendExtraIso =
    params.rule.id === "noon_services_1245"
      ? params.targetDateVN || offsetDateISO(vnNow.dateISO, -1)
      : undefined;

  const preSyncSummary = await syncRecentThreeDaysFromSheetForServer(initialData.settings, {
    extraDateISO: preSendExtraIso,
    actorLabel:
      params.triggerMode === "auto_schedule"
        ? `Tự động cập nhật trước giờ phát ${params.rule.timeHHmm}`
        : `Cập nhật trước khi gửi báo cáo (${params.rule.name})`,
    recordHistoryAlways: params.rule.id === "noon_services_1245",
  });

  // Reload fresh dataset after sync so any updated DB/Sheet numbers reflect immediately
  const data = await resolveHospitalDataset(params.liveContext);
  const channel = params.channelOverride || params.rule.channel;

  const preview = await generateRulePreview({
    ruleId: params.rule.id,
    targetDateVN: params.targetDateVN,
    equipmentWarningDays: params.rule.equipmentWarningDays,
    timeHHmmOverride: params.rule.timeHHmm,
    liveContext: params.liveContext,
    // For noon_services_1245, preSyncSummary just persisted 3-day & targetDateVN updates cleanly
    allowPersistSheetSync: params.rule.id !== "noon_services_1245" || !preSyncSummary.sheetReachable,
  });

  // Guard 2: If noon_services_1245 auto_schedule still sees "Chưa cấu hình Google Sheet" (no sheet URL AND 0 archive cases), abort send & retry later
  if (
    params.triggerMode === "auto_schedule" &&
    params.rule.id === "noon_services_1245" &&
    preview.dataSourceNotes.includes("Chưa cấu hình Google Sheet")
  ) {
    const errMsg =
      "Chưa đọc được cấu hình Google Sheet hoặc kho lưu trữ từ PostgreSQL; tạm hoãn gửi tự động để tránh báo nhầm 'Chưa cấu hình Google Sheet'.";
    console.warn(`[ScheduledAlerts] ${errMsg}`);
    const historyItem: ScheduledAlertHistoryItem = {
      id: `RUN-${params.rule.id}-${Date.now().toString().slice(-6)}`,
      ruleId: params.rule.id,
      ruleName: params.rule.name,
      targetDateVN: preview.targetDateVN,
      triggeredAt: vnNow.dateTimeVN,
      triggerMode: params.triggerMode,
      status: "error",
      telegramSent: false,
      inAppSaved: false,
      summary: errMsg,
      errorMessage: errMsg,
      hostLabel: deliveryCfgInit.hostLabel,
    };
    await appendScheduledAlertHistoryToDb(historyItem);
    return { historyItem, preview };
  }

  if (
    preSyncSummary.sheetConfigured &&
    (preSyncSummary.updatedFromSheetCount > 0 || preSyncSummary.autoWrittenCount > 0)
  ) {
    preview.dataSourceNotes = Array.from(
      new Set([
        ...preview.dataSourceNotes,
        `Đã đồng bộ trước khi gửi: ghi đè ${preSyncSummary.updatedFromSheetCount} mục & ghi mới ${preSyncSummary.autoWrittenCount} ô từ Google Sheet`,
      ])
    );
  }

  // Hydrate Telegram delivery config from Postgres on cold boot if needed
  let deliveryCfg = telegramManager.getDeliveryConfig();
  if (!deliveryCfg.botToken) {
    const storedTg = await loadStoredTelegramSettingsFromDb().catch(() => null);
    if (storedTg?.botToken) {
      telegramManager.configure(storedTg, false);
      deliveryCfg = telegramManager.getDeliveryConfig();
    }
  }

  const effectiveToken =
    String(data.settings.telegramBotToken || "").trim() || deliveryCfg.botToken;
  const effectiveChatId =
    String(params.customChatId || params.rule.customChatId || data.settings.defaultTelegramChatId || deliveryCfg.defaultChatId || "").trim();

  const wantsTelegram = channel === "telegram_and_inapp" || channel === "telegram";
  const wantsInApp = channel === "telegram_and_inapp" || channel === "inapp";

  let telegramSent = false;
  let inAppSaved = false;
  const errors: string[] = [];

  if (wantsTelegram) {
    if (!effectiveToken || !effectiveChatId) {
      errors.push("Chưa cấu hình Telegram Bot Token hoặc Default Chat ID");
    } else {
      try {
        await telegramManager.sendMessage(effectiveChatId, preview.telegramMarkdown, effectiveToken);
        telegramSent = true;
      } catch (err: any) {
        errors.push(`Lỗi Telegram: ${err?.message || "Không thể gửi tin nhắn"}`);
      }
    }
  }

  if (wantsInApp) {
    const notif: NotificationLog = {
      id: `AUTO-${params.rule.id.toUpperCase()}-${Date.now().toString().slice(-6)}`,
      recipient: "Toàn Khoa CLS",
      targetAddress: telegramSent ? `Telegram (${effectiveChatId}) + In-App` : "Hệ thống CLS WorkHub",
      title: `[Tự động ${params.rule.timeHHmm}] ${preview.title}`,
      content: preview.inAppSummary,
      channel: wantsTelegram && telegramSent ? "Telegram" : "In-App",
      status: "Đã gửi",
      sentAt: vnNow.dateTimeLog,
    };
    const savedDb = await appendSystemNotificationToDb(notif);
    inAppSaved = savedDb;
    if (!savedDb && !wantsTelegram) {
      errors.push("PostgreSQL chưa cấu hình nên không thể đẩy In-App từ server.");
    }
  }

  let status: ScheduledAlertHistoryItem["status"] = "success";
  if (errors.length > 0) {
    status = telegramSent || inAppSaved ? "partial" : "error";
  }

  const historyItem: ScheduledAlertHistoryItem = {
    id: `RUN-${params.rule.id}-${Date.now().toString().slice(-6)}`,
    ruleId: params.rule.id,
    ruleName: params.rule.name,
    targetDateVN: preview.targetDateVN,
    triggeredAt: vnNow.dateTimeVN,
    triggerMode: params.triggerMode,
    status,
    telegramSent,
    inAppSaved,
    summary: preview.inAppSummary,
    errorMessage: errors.length > 0 ? errors.join(" | ") : undefined,
    hostLabel: deliveryCfg.hostLabel,
  };

  await appendScheduledAlertHistoryToDb(historyItem);

  return { historyItem, preview };
}

async function runSchedulerTick() {
  if (isTickRunning) return;
  isTickRunning = true;

  try {
    // Do not auto-dispatch scheduled reports from unlinked containers that have neither Postgres DB nor browser context
    if (!isPostgresConfigured() && !telegramManager.getLiveContext() && !cachedLiveContextSnapshot) {
      return;
    }

    // Ensure Telegram settings from Postgres are loaded before auto-dispatching
    if (!telegramManager.getDeliveryConfig().botToken) {
      const storedTg = await loadStoredTelegramSettingsFromDb().catch(() => null);
      if (storedTg?.botToken && storedTg.enabled) {
        telegramManager.configure(storedTg, false);
      }
    }

    const vnNow = getVNNowParts();
    pruneDailyAlertTrackers(vnNow.dateISO);
    const rules = await getActiveAlertRules();
    const deliveryCfg = telegramManager.getDeliveryConfig();

    for (const rule of rules) {
      if (!rule.enabled) continue;
      const targetMin = parseTimeHHmmToMinutes(rule.timeHHmm);
      if (targetMin === null) continue;

      const maxWindow = RULE_CATCHUP_WINDOW_MIN[rule.id] ?? 240;
      const diffMin = vnNow.minuteOfDay - targetMin;
      if (diffMin < 0 || diffMin > maxWindow) continue;

      const editSkipKey = `${rule.id}_${vnNow.dateISO}_${rule.timeHHmm}`;
      if (skippedPastEditKeys.has(editSkipKey)) continue;

      const retryKey = `${rule.id}_${vnNow.dateISO}_${rule.timeHHmm}`;
      const retryInfo = failedRetryTracker.get(retryKey);
      if (retryInfo) {
        if (retryInfo.count >= 3 || Date.now() < retryInfo.nextRetryAtMs) {
          continue;
        }
      }

      const lockKeyDate = vnNow.dateISO;
      const claimed = await tryClaimDailyAlertLock(
        rule.id,
        lockKeyDate,
        rule.timeHHmm,
        deliveryCfg.hostLabel || "cls-server"
      );
      if (!claimed) continue;

      console.log(
        `[ScheduledAlerts] Triggering rule "${rule.id}" (${rule.timeHHmm} VN, now=${vnNow.timeHHmm}, lag=${diffMin}m)...`
      );
      const result = await executeScheduledAlertRule({
        rule,
        triggerMode: "auto_schedule",
      });

      if (result.historyItem.status === "error") {
        // Release today's lock on hard failure and back off 2 minutes (up to 3 retries)
        await releaseDailyAlertLock(rule.id, lockKeyDate, rule.timeHHmm);
        const prevCount = retryInfo?.count || 0;
        failedRetryTracker.set(retryKey, {
          count: prevCount + 1,
          nextRetryAtMs: Date.now() + 2 * 60 * 1000,
        });
      } else {
        failedRetryTracker.delete(retryKey);
      }
    }
  } catch (err: any) {
    console.error("[ScheduledAlerts] Tick error:", err?.message || err);
  } finally {
    isTickRunning = false;
  }
}

export function triggerScheduledAlertsCatchUp() {
  void runSchedulerTick();
}

export function startScheduledAlertsEngine() {
  if (schedulerInterval) return;
  const vnNow = getVNNowParts();
  console.log(
    `[ScheduledAlerts] Engine started (VN time: ${vnNow.dateTimeVN} | Schedules: 07:00, 12:45, 17:00)`
  );
  // Allow startup Postgres & Telegram hydration to complete, then run catch-up check every 20 seconds
  setTimeout(() => {
    void runSchedulerTick();
  }, 10000).unref();
  schedulerInterval = setInterval(() => {
    void runSchedulerTick();
  }, 20000);
  schedulerInterval.unref();
}

export function stopScheduledAlertsEngine() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

function getReqHost(req: Request): string {
  const fwd = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = String(req.get("host") || "").trim();
  return fwd || host;
}

export function registerScheduledAlertRoutes(app: Express) {
  app.post("/api/alerts/heartbeat", requireAppAuth, async (req, res) => {
    try {
      telegramManager.updateHostLabel(getReqHost(req));
      const { liveContext } = req.body || {};
      if (liveContext && typeof liveContext === "object") {
        cachedLiveContextSnapshot = liveContext;
        telegramManager.updateLiveContext(liveContext);
        if (liveContext.settings && typeof liveContext.settings === "object") {
          void mergeSheetConfigIntoSettingsDbIfMissing(liveContext.settings);
        }
      }
      triggerScheduledAlertsCatchUp();
      res.json({
        success: true,
        vnNow: getVNNowParts(),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || "Heartbeat failed",
      });
    }
  });

  app.get("/api/alerts/schedule-status", requireAppAuth, async (req, res) => {
    try {
      telegramManager.updateHostLabel(getReqHost(req));
      triggerScheduledAlertsCatchUp();
      const vnNow = getVNNowParts();
      const [rules, history, buckets] = await Promise.all([
        getActiveAlertRules(),
        loadScheduledAlertHistoryFromDb(),
        loadCloudBucketsForServer(["settings"]),
      ]);

      const settingsObj =
        Array.isArray(buckets.settings) && buckets.settings[0]
          ? (buckets.settings[0] as Partial<AppSettings>)
          : {};
      const delivery = telegramManager.getDeliveryConfig();
      const hasToken = Boolean(
        String(settingsObj.telegramBotToken || "").trim() || delivery.botToken
      );
      const defaultChatId =
        String(settingsObj.defaultTelegramChatId || "").trim() || delivery.defaultChatId || "";

      res.json({
        success: true,
        data: {
          vnNow,
          rules,
          history,
          telegramConfigured: hasToken && Boolean(defaultChatId),
          hasBotToken: hasToken,
          defaultChatId,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể tải trạng thái lịch cảnh báo tự động",
      });
    }
  });

  app.put("/api/alerts/schedule-rules", requireAdminAuth, async (req, res) => {
    try {
      telegramManager.updateHostLabel(getReqHost(req));
      const { rules, liveContext } = req.body || {};
      if (!Array.isArray(rules)) {
        return res.status(400).json({
          success: false,
          error: "Danh sách quy tắc lịch cảnh báo không hợp lệ.",
        });
      }

      if (liveContext) {
        cachedLiveContextSnapshot = liveContext;
        telegramManager.updateLiveContext(liveContext);
        if (liveContext.settings && typeof liveContext.settings === "object") {
          await mergeSheetConfigIntoSettingsDbIfMissing(liveContext.settings);
        }
      }

      const prevRules = await getActiveAlertRules();
      const normalized = normalizeScheduledRules(rules);
      const vnNow = getVNNowParts();
      pruneDailyAlertTrackers(vnNow.dateISO);

      for (const nextRule of normalized) {
        const prevRule = prevRules.find((p) => p.id === nextRule.id);
        if (prevRule && prevRule.timeHHmm !== nextRule.timeHHmm) {
          // Clear previous time locks for today so edited times can run cleanly
          await clearTodayAlertLocksForRule(nextRule.id, vnNow.dateISO);
          const editKey = `${nextRule.id}_${vnNow.dateISO}_${nextRule.timeHHmm}`;
          failedRetryTracker.delete(editKey);
          const targetMin = parseTimeHHmmToMinutes(nextRule.timeHHmm);
          if (targetMin !== null && vnNow.minuteOfDay - targetMin > 15) {
            skippedPastEditKeys.add(editKey);
          } else {
            skippedPastEditKeys.delete(editKey);
          }
        }
      }

      cachedRulesOverlay = normalized;
      const savedDb = await saveScheduledAlertRulesToDb(normalized);
      triggerScheduledAlertsCatchUp();

      res.json({
        success: true,
        savedToPostgres: savedDb,
        rules: normalized,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể lưu cấu hình cảnh báo tự động",
      });
    }
  });

  app.post("/api/alerts/preview", requireAppAuth, async (req, res) => {
    try {
      telegramManager.updateHostLabel(getReqHost(req));
      const { ruleId, targetDateVN, equipmentWarningDays, timeHHmmOverride, liveContext } = req.body || {};
      if (
        ruleId !== "morning_0700" &&
        ruleId !== "noon_services_1245" &&
        ruleId !== "evening_1700"
      ) {
        return res.status(400).json({
          success: false,
          error: "Mã lịch cảnh báo không hợp lệ.",
        });
      }

      const preview = await generateRulePreview({
        ruleId,
        targetDateVN: typeof targetDateVN === "string" && targetDateVN ? targetDateVN : undefined,
        equipmentWarningDays:
          typeof equipmentWarningDays === "number" ? equipmentWarningDays : undefined,
        timeHHmmOverride:
          typeof timeHHmmOverride === "string" && timeHHmmOverride ? timeHHmmOverride : undefined,
        liveContext,
        allowPersistSheetSync: false,
      });

      res.json({
        success: true,
        data: preview,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể tạo bản xem trước cảnh báo",
      });
    }
  });

  app.post("/api/alerts/run-now", requireAdminAuth, async (req, res) => {
    try {
      telegramManager.updateHostLabel(getReqHost(req));
      const { ruleId, targetDateVN, channelOverride, customChatId, liveContext } = req.body || {};
      if (
        ruleId !== "morning_0700" &&
        ruleId !== "noon_services_1245" &&
        ruleId !== "evening_1700"
      ) {
        return res.status(400).json({
          success: false,
          error: "Mã lịch cảnh báo không hợp lệ.",
        });
      }

      const rules = await getActiveAlertRules();
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) {
        return res.status(404).json({
          success: false,
          error: "Không tìm thấy quy tắc cảnh báo.",
        });
      }

      const result = await executeScheduledAlertRule({
        rule,
        triggerMode: "manual_test",
        targetDateVN: typeof targetDateVN === "string" && targetDateVN ? targetDateVN : undefined,
        channelOverride,
        customChatId,
        liveContext,
      });

      res.json({
        success: result.historyItem.status !== "error",
        historyItem: result.historyItem,
        preview: result.preview,
        error: result.historyItem.errorMessage,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || "Không thể phát cảnh báo ngay",
      });
    }
  });
}
