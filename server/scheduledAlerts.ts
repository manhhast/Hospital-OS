import type { Express, Request } from "express";
import type {
  AppSettings,
  EquipmentItem,
  LeaveRequest,
  MeetingItem,
  NotificationLog,
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
      const place = [sh.room || sh.roomLocation, sh.machine].filter(Boolean).join(" / ");
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

export async function buildNoonServiceReport(
  data: ResolvedHospitalDataset,
  yesterdayISO: string,
  allowPersistSync: boolean,
  generatedAtVN = "",
  scheduleTimeHHmm = "12:45",
  syncModeLabel?: string
): Promise<ScheduledAlertPreviewResult> {
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
  let prevSummary = summarizeMonthDay(prevDayMonthItems, dbDay);
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

  // Merge union of categories from yesterday and dayBeforeYesterday
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

  // Merge union of all technical services across yesterday and dayBeforeYesterday
  const unionServiceMap = new Map<
    string,
    {
      key: string;
      name: string;
      category: string;
      curBh: number;
      curNd: number;
      curTotal: number;
      prevTotal: number;
      isLt: boolean;
    }
  >();

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

  const formatCategoryHeader = (catName: string): { icon: string; title: string } => {
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
  };

  const syncBaseLabel = syncModeLabel || `Đồng bộ Tự động ${scheduleTimeHHmm}`;
  const syncOriginLabel = primaryMonth.sourceLabel.includes("Google Sheet")
    ? `Hệ thống (${syncBaseLabel} · Google Sheet)`
    : `Hệ thống (${syncBaseLabel} · ${primaryMonth.sourceLabel})`;

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
    const activeCategories = categoryNames.filter((catName) => {
      const curCat = summary.byCategoryMap.get(catName);
      return (curCat?.total || 0) > 0;
    });

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

  return {
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
      const place = [sh.room || sh.roomLocation, sh.machine].filter(Boolean).join(" / ");
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
  const vnNow = getVNNowParts();
  const data = await resolveHospitalDataset(params.liveContext);
  const syncModeLabel = `Đồng bộ trực tiếp ${vnNow.timeHHmm}`;
  const explicitISO = parseExplicitBriefingDateISO(params.queryText || "", vnNow);

  if (explicitISO) {
    return buildNoonServiceReport(
      data,
      explicitISO,
      false,
      vnNow.dateTimeVN,
      vnNow.timeHHmm,
      syncModeLabel
    );
  }

  const todayReport = await buildNoonServiceReport(
    data,
    vnNow.dateISO,
    false,
    vnNow.dateTimeVN,
    vnNow.timeHHmm,
    syncModeLabel
  );
  const todayHasCases = !todayReport.telegramMarkdown.includes("Chưa ghi nhận số ca nào");
  if (todayHasCases) {
    return todayReport;
  }

  const yesterdayISO = offsetDateISO(vnNow.dateISO, -1);
  const yesterdayReport = await buildNoonServiceReport(
    data,
    yesterdayISO,
    false,
    vnNow.dateTimeVN,
    vnNow.timeHHmm,
    syncModeLabel
  );
  const yesterdayHasCases = !yesterdayReport.telegramMarkdown.includes("Chưa ghi nhận số ca nào");
  if (yesterdayHasCases) {
    return yesterdayReport;
  }

  const latestLiveIso = data.liveContext?.caseReports?.latestRecordedDay?.dateIso;
  if (typeof latestLiveIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(latestLiveIso)) {
    return buildNoonServiceReport(
      data,
      latestLiveIso,
      false,
      vnNow.dateTimeVN,
      vnNow.timeHHmm,
      syncModeLabel
    );
  }

  return yesterdayReport;
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
