import {
  EquipmentItem,
  NotificationChannel,
  TaskItem,
  TaskPriority,
  TaskType,
  User
} from '../types/hospital';
import { storageService } from '../services/storageService';
import { formatDateVN, getNowVNString, getTodayISODateVN, toInputDateFormat } from './dateUtils';

export type ExpirationTrack = 'PERMIT' | 'CALIBRATION' | 'RADIATION' | 'MAINTENANCE';
export type AlertUrgency = 'OVERDUE' | 'CRITICAL' | 'WARNING' | 'UPCOMING' | 'VALID';

export interface EquipmentExpirationAlert {
  id: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  room: string;
  category: EquipmentItem['category'];
  track: ExpirationTrack;
  trackLabel: string;
  expiryDateISO: string;
  expiryDateVN: string;
  daysRemaining: number; // < 0 means overdue
  urgency: AlertUrgency;
  assignedTechnician: string;
  managerInCharge: string;
  referenceNumber?: string;
}

export interface EquipmentComplianceSummary {
  alerts: EquipmentExpirationAlert[];
  overdueCount: number;
  critical7Count: number;
  warning30Count: number;
  upcoming60Count: number;
  affectedEquipmentCount: number;
  compliantEquipmentCount: number;
}

export type TaskReminderUrgency = 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING';

export interface TaskReminderAlert {
  task: TaskItem;
  daysRemaining: number;
  urgency: TaskReminderUrgency;
  lastRemindedAt?: string;
  reminderCount: number;
}

export interface TaskReminderSummary {
  alerts: TaskReminderAlert[];
  overdueCount: number;
  dueTodayCount: number;
  dueSoon3DaysCount: number;
  upcomingWeekCount: number;
}

interface ReminderRecord {
  lastRemindedAt: string;
  count: number;
  channel: NotificationChannel;
}

const TASK_REMINDER_LOG_KEY = 'cls_task_reminder_logs';
const EQUIPMENT_REMINDER_LOG_KEY = 'cls_equipment_reminder_logs';

let serverReminderMode = false;
let serverTaskReminders: Record<string, ReminderRecord> = {};
let serverEquipmentReminders: Record<string, ReminderRecord> = {};
let cloudReminderSaveHandler:
  | ((scope: 'task' | 'equipment', targetId: string, lastRemindedAt: string, channel: NotificationChannel) => void)
  | null = null;

export function setServerReminderMode(enabled: boolean): void {
  serverReminderMode = enabled;
}

export function registerCloudReminderHandler(
  handler:
    | ((scope: 'task' | 'equipment', targetId: string, lastRemindedAt: string, channel: NotificationChannel) => void)
    | null
): void {
  cloudReminderSaveHandler = handler;
}

export function hydrateServerReminderLogs(logs: {
  task?: Record<string, { lastRemindedAt: string; count: number; channel?: string }>;
  equipment?: Record<string, { lastRemindedAt: string; count: number; channel?: string }>;
}): void {
  if (logs.task && typeof logs.task === 'object') {
    const next: Record<string, ReminderRecord> = {};
    for (const [k, v] of Object.entries(logs.task)) {
      if (v) {
        next[k] = {
          lastRemindedAt: v.lastRemindedAt,
          count: Number(v.count || 1),
          channel: (v.channel as NotificationChannel) || 'Telegram'
        };
      }
    }
    serverTaskReminders = next;
  }
  if (logs.equipment && typeof logs.equipment === 'object') {
    const next: Record<string, ReminderRecord> = {};
    for (const [k, v] of Object.entries(logs.equipment)) {
      if (v) {
        next[k] = {
          lastRemindedAt: v.lastRemindedAt,
          count: Number(v.count || 1),
          channel: (v.channel as NotificationChannel) || 'Telegram'
        };
      }
    }
    serverEquipmentReminders = next;
  }
}

export function applyServerReminderEntry(entry: {
  scope: 'task' | 'equipment';
  targetId: string;
  lastRemindedAt: string;
  count: number;
  channel?: string;
}): void {
  const targetMap = entry.scope === 'task' ? serverTaskReminders : serverEquipmentReminders;
  targetMap[entry.targetId] = {
    lastRemindedAt: entry.lastRemindedAt,
    count: Number(entry.count || 1),
    channel: (entry.channel as NotificationChannel) || 'Telegram'
  };
}

function parseISOToMidnightMs(dateInput?: string | null): number | null {
  const iso = toInputDateFormat(dateInput);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function getDaysDiffFromTodayVN(targetDateInput?: string | null): number | null {
  const targetMs = parseISOToMidnightMs(targetDateInput);
  const todayMs = parseISOToMidnightMs(getTodayISODateVN());
  if (targetMs === null || todayMs === null) return null;
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function classifyUrgencyByDays(daysRemaining: number): AlertUrgency {
  if (daysRemaining < 0) return 'OVERDUE';
  if (daysRemaining <= 7) return 'CRITICAL';
  if (daysRemaining <= 30) return 'WARNING';
  if (daysRemaining <= 60) return 'UPCOMING';
  return 'VALID';
}

export function formatDaysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining < 0) return `Quá ${Math.abs(daysRemaining)} ngày`;
  if (daysRemaining === 0) return 'Hết hạn hôm nay';
  return `Còn ${daysRemaining} ngày`;
}

/**
 * Quét toàn bộ thiết bị qua 4 mốc thời hạn:
 * 1. Giấy phép hoạt động / lưu hành
 * 2. Kiểm định / Hiệu chuẩn ISO 15189
 * 3. Kiểm xạ & Giấy phép ATBX
 * 4. Bảo dưỡng định kỳ
 */
export function scanEquipmentExpirations(
  equipmentList: EquipmentItem[],
  maxDaysWindow: number = 60
): EquipmentComplianceSummary {
  const alerts: EquipmentExpirationAlert[] = [];
  const affectedEqIds = new Set<string>();

  equipmentList.forEach((eq) => {
    const tracks: Array<{
      track: ExpirationTrack;
      trackLabel: string;
      rawDate?: string;
      ref?: string;
    }> = [
      {
        track: 'PERMIT',
        trackLabel: 'Giấy phép hoạt động',
        rawDate: eq.operatingPermitExpiry,
        ref: eq.operatingPermitNumber
      },
      {
        track: 'CALIBRATION',
        trackLabel: 'Kiểm định / Hiệu chuẩn ISO',
        rawDate: eq.calibrationExpiry,
        ref: eq.calibrationNumber
      },
      {
        track: 'RADIATION',
        trackLabel: 'Kiểm xạ & An toàn Bức xạ',
        rawDate: eq.radiationSurveyExpiry || eq.radiationLicenseExpiry,
        ref: eq.radiationLicenseNumber
      },
      {
        track: 'MAINTENANCE',
        trackLabel: 'Bảo dưỡng định kỳ',
        rawDate: eq.nextMaintenanceDate
      }
    ];

    tracks.forEach((t) => {
      if (!t.rawDate) return;
      const daysRemaining = getDaysDiffFromTodayVN(t.rawDate);
      if (daysRemaining === null || daysRemaining > maxDaysWindow) return;

      const iso = toInputDateFormat(t.rawDate);
      const urgency = classifyUrgencyByDays(daysRemaining);
      affectedEqIds.add(eq.id);

      alerts.push({
        id: `${eq.id}-${t.track}`,
        equipmentId: eq.id,
        equipmentCode: eq.code,
        equipmentName: eq.name,
        room: eq.room,
        category: eq.category,
        track: t.track,
        trackLabel: t.trackLabel,
        expiryDateISO: iso,
        expiryDateVN: formatDateVN(iso),
        daysRemaining,
        urgency,
        assignedTechnician: eq.assignedTechnician || 'Chưa phân công',
        managerInCharge: eq.managerInCharge || 'Ban Chủ Nhiệm Khoa',
        referenceNumber: t.ref
      });
    });
  });

  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    alerts,
    overdueCount: alerts.filter((a) => a.urgency === 'OVERDUE').length,
    critical7Count: alerts.filter((a) => a.urgency === 'CRITICAL').length,
    warning30Count: alerts.filter((a) => a.urgency === 'WARNING').length,
    upcoming60Count: alerts.filter((a) => a.urgency === 'UPCOMING').length,
    affectedEquipmentCount: affectedEqIds.size,
    compliantEquipmentCount: Math.max(0, equipmentList.length - affectedEqIds.size)
  };
}

function loadReminderMap(storageKey: string): Record<string, ReminderRecord> {
  if (serverReminderMode) {
    return storageKey === TASK_REMINDER_LOG_KEY ? serverTaskReminders : serverEquipmentReminders;
  }
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function recordReminder(storageKey: string, id: string, channel: NotificationChannel): void {
  const nowStr = getNowVNString();
  if (serverReminderMode) {
    const scope = storageKey === TASK_REMINDER_LOG_KEY ? 'task' : 'equipment';
    const map = scope === 'task' ? serverTaskReminders : serverEquipmentReminders;
    const prev = map[id];
    map[id] = {
      lastRemindedAt: nowStr,
      count: (prev?.count || 0) + 1,
      channel
    };
    if (cloudReminderSaveHandler) {
      cloudReminderSaveHandler(scope, id, nowStr, channel);
    }
    return;
  }
  try {
    const map = loadReminderMap(storageKey);
    const prev = map[id];
    map[id] = {
      lastRemindedAt: nowStr,
      count: (prev?.count || 0) + 1,
      channel
    };
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function getEquipmentReminderInfo(alertId: string): ReminderRecord | undefined {
  return loadReminderMap(EQUIPMENT_REMINDER_LOG_KEY)[alertId];
}

/**
 * Quét toàn bộ công việc chưa hoàn thành để phân loại nhắc việc theo hạn
 */
export function scanTaskReminders(tasks: TaskItem[], windowDays: number = 7): TaskReminderSummary {
  const reminderMap = loadReminderMap(TASK_REMINDER_LOG_KEY);
  const alerts: TaskReminderAlert[] = [];

  tasks.forEach((task) => {
    if (task.status === 'Đã hoàn thành' || task.status === 'Hủy') return;
    const daysRemaining = getDaysDiffFromTodayVN(task.dueDate);
    if (daysRemaining === null || daysRemaining > windowDays) return;

    let urgency: TaskReminderUrgency = 'UPCOMING';
    if (daysRemaining < 0) urgency = 'OVERDUE';
    else if (daysRemaining === 0) urgency = 'DUE_TODAY';
    else if (daysRemaining <= 3) urgency = 'DUE_SOON';

    const log = reminderMap[task.id];
    alerts.push({
      task,
      daysRemaining,
      urgency,
      lastRemindedAt: log?.lastRemindedAt,
      reminderCount: log?.count || 0
    });
  });

  const priorityRank: Record<TaskPriority, number> = {
    'Khẩn cấp': 4,
    'Cao': 3,
    'Trung bình': 2,
    'Thấp': 1
  };

  alerts.sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
    return priorityRank[b.task.priority] - priorityRank[a.task.priority];
  });

  return {
    alerts,
    overdueCount: alerts.filter((a) => a.urgency === 'OVERDUE').length,
    dueTodayCount: alerts.filter((a) => a.urgency === 'DUE_TODAY').length,
    dueSoon3DaysCount: alerts.filter((a) => a.urgency === 'DUE_SOON').length,
    upcomingWeekCount: alerts.filter((a) => a.urgency === 'UPCOMING').length
  };
}

/**
 * Tạo công việc xử lý tự động từ cảnh báo hết hạn thiết bị (tránh trùng lặp task đang mở)
 */
export function createTaskFromEquipmentAlert(
  alert: EquipmentExpirationAlert
): { created: boolean; task: TaskItem } {
  const existingTasks = storageService.getTasks();
  const tagKey = `EQ-ALERT:${alert.id}`;
  const duplicate = existingTasks.find(
    (t) =>
      t.status !== 'Đã hoàn thành' &&
      t.status !== 'Hủy' &&
      (t.tags?.includes(tagKey) ||
        (t.title.includes(alert.equipmentCode) && t.title.includes(alert.trackLabel)))
  );

  if (duplicate) {
    return { created: false, task: duplicate };
  }

  const users = storageService.getUsers();
  const matchedUser: User | undefined = users.find(
    (u) =>
      u.name.toLowerCase().includes(alert.assignedTechnician.toLowerCase()) ||
      alert.assignedTechnician.toLowerCase().includes(u.name.toLowerCase())
  );

  const taskType: TaskType =
    alert.track === 'CALIBRATION' || alert.track === 'RADIATION'
      ? 'Kiểm chuẩn ISO'
      : 'Bảo trì thiết bị';

  const priority: TaskPriority =
    alert.urgency === 'OVERDUE' || alert.urgency === 'CRITICAL'
      ? 'Khẩn cấp'
      : alert.urgency === 'WARNING'
      ? 'Cao'
      : 'Trung bình';

  const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
  const currentUser = storageService.getCurrentUser();

  const newTask: TaskItem = {
    id: `TSK-EQ-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 89)}`,
    title: `[${alert.equipmentCode}] Gia hạn ${alert.trackLabel} - ${alert.equipmentName}`,
    description: `Xử lý hồ sơ ${alert.trackLabel} cho thiết bị ${alert.equipmentName} (${alert.equipmentCode}) tại ${alert.room}. Hạn hiệu lực: ${alert.expiryDateVN} (${formatDaysRemainingLabel(alert.daysRemaining)}).${alert.referenceNumber ? ` Số hồ sơ/GP hiện tại: ${alert.referenceNumber}.` : ''}`,
    dueDate: alert.expiryDateISO,
    createdDate: now,
    updatedDate: now,
    creator: currentUser.name,
    assignee: matchedUser?.name || alert.assignedTechnician,
    assigneeEmail: matchedUser?.email || 'tbyt.cls@hospital.vn',
    telegramChatId: matchedUser?.telegramChatId || storageService.getSettings().defaultTelegramChatId || '',
    taskType,
    priority,
    status: 'Chờ xử lý',
    level: alert.category,
    recurrence: 'Không',
    recurrenceCount: 0,
    notes: `Tạo tự động từ Cảnh báo Thời hạn Thiết bị. Phụ trách quản lý: ${alert.managerInCharge}.`,
    attachments: [],
    tags: [tagKey, alert.equipmentCode, alert.track]
  };

  const saved = storageService.saveTask(newTask);
  return { created: true, task: saved };
}

/**
 * Gửi nhắc nhở thời hạn thiết bị qua Telegram / Email / In-App và lưu NotificationLog
 */
export function dispatchEquipmentReminder(
  alert: EquipmentExpirationAlert,
  channel: NotificationChannel = 'Telegram'
) {
  const users = storageService.getUsers();
  const matchedUser = users.find((u) => u.name === alert.assignedTechnician);
  const statusTag = alert.daysRemaining < 0 ? 'QUÁ HẠN' : alert.daysRemaining <= 7 ? 'KHẨN CẤP' : 'SẮP HẾT HẠN';

  const title = `[${statusTag}] ${alert.trackLabel} — ${alert.equipmentName} (${alert.equipmentCode})`;
  const content = `Thiết bị ${alert.equipmentName} tại ${alert.room} có mốc "${alert.trackLabel}" hết hạn ngày ${alert.expiryDateVN} (${formatDaysRemainingLabel(alert.daysRemaining)}). Đề nghị ${alert.assignedTechnician} phối hợp ${alert.managerInCharge} hoàn tất gia hạn / kiểm chuẩn.`;

  const targetAddress =
    channel === 'Email'
      ? matchedUser?.email || 'tbyt.cls@hospital.vn'
      : channel === 'Telegram'
      ? matchedUser?.telegramChatId || storageService.getSettings().defaultTelegramChatId || '@cls_alert_bot'
      : 'Hệ thống CLS WorkHub';

  const log = storageService.sendNotification({
    recipient: `${alert.assignedTechnician} (${alert.managerInCharge})`,
    targetAddress,
    title,
    content,
    channel,
    status: 'Đã gửi'
  });

  recordReminder(EQUIPMENT_REMINDER_LOG_KEY, alert.id, channel);
  return log;
}

/**
 * Gửi nhắc việc công việc sắp hạn / quá hạn và ghi nhận lịch sử nhắc
 */
export function dispatchTaskReminder(
  task: TaskItem,
  daysRemaining: number,
  channel: NotificationChannel = 'Telegram'
) {
  const prefix =
    daysRemaining < 0
      ? `QUÁ HẠN ${Math.abs(daysRemaining)} NGÀY`
      : daysRemaining === 0
      ? 'HẠN CHÓT HÔM NAY'
      : `CÒN ${daysRemaining} NGÀY`;

  const title = `[NHẮC VIỆC - ${prefix}] ${task.title}`;
  const content = `Công việc #${task.id} (${task.taskType}, ưu tiên: ${task.priority}) giao cho ${task.assignee} có hạn hoàn thành ${formatDateVN(task.dueDate)} (${prefix}). Trạng thái hiện tại: ${task.status}. Vui lòng cập nhật tiến độ.`;

  const targetAddress =
    channel === 'Email'
      ? task.assigneeEmail || 'cls@hospital.vn'
      : channel === 'Telegram'
      ? task.telegramChatId || storageService.getSettings().defaultTelegramChatId || '@cls_workhub'
      : 'Hệ thống CLS WorkHub';

  const log = storageService.sendNotification({
    recipient: task.assignee,
    targetAddress,
    title,
    content,
    channel,
    status: 'Đã gửi'
  });

  recordReminder(TASK_REMINDER_LOG_KEY, task.id, channel);
  return log;
}
