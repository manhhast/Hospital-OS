import { 
  TaskItem, DocumentItem, User, NotificationLog, AuditLogItem, AppSettings, UserRole, CLSTitle,
  ShiftDuty, WorkTaskRow, WeeklyMeeting, ChatChannelMessage, ChatGroupChannel, DepartmentAnnouncement, MessageType, ShareCardData,
  EquipmentItem, ParaclinicalRoom, RoomReservation, StaffProfile, LeaveRequest, TrainingCourse,
  MeetingItem, MeetingMinutes, MeetingActionItem, IntegrationEndpoint, IntegrationPayloadSample, MaintenanceLog, RepairLog
} from '../types/hospital';
import { 
  initialTasks, initialDocuments, initialUsers, initialNotifications, initialAuditLogs, initialSettings,
  initialShifts, initialWorkTaskRows, initialWeeklyMeetings, initialChatMessages, initialChannels, initialAnnouncements,
  initialEquipment, initialRooms, initialStaffProfiles, initialLeaveRequests, initialTrainingCourses,
  initialMeetings, initialIntegrationEndpoints, initialIntegrationPayloads
} from './mockData';
import * as sampleDemoData from './sampleDemoData';

const PRODUCTION_MODE_KEY = 'cls_workhub_prod_clean_state_v2';

const STORAGE_KEYS = {
  TASKS: 'cls_workhub_tasks',
  DOCUMENTS: 'cls_workhub_documents',
  USERS: 'cls_workhub_users',
  NOTIFICATIONS: 'cls_workhub_notifications',
  AUDIT_LOGS: 'cls_workhub_audit_logs',
  SETTINGS: 'cls_workhub_settings',
  CURRENT_USER: 'cls_workhub_current_user_id',
  SHIFTS: 'cls_workhub_shifts',
  MEETINGS: 'cls_workhub_meetings',
  MESSAGES: 'cls_workhub_messages',
  CHANNELS: 'cls_workhub_channels',
  ANNOUNCEMENTS: 'cls_workhub_announcements',
  EQUIPMENT: 'cls_workhub_equipment',
  ROOMS: 'cls_workhub_rooms',
  STAFF_PROFILES: 'cls_workhub_staff_profiles',
  LEAVE_REQUESTS: 'cls_workhub_leave_requests',
  TRAINING_COURSES: 'cls_workhub_training_courses',
  MEETING_ITEMS: 'cls_workhub_meeting_items',
  INTEGRATION_ENDPOINTS: 'cls_workhub_integration_endpoints',
  INTEGRATION_PAYLOADS: 'cls_workhub_integration_payloads',
  WORK_TASK_ROWS: 'cls_workhub_work_task_rows'
};

class HospitalStorageService {
  private currentUser: User = initialUsers[0]; // Default to Admin
  private listeners: Array<() => void> = [];

  constructor() {
    this.initDefaultData();
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  private initDefaultData() {
    // Tự động dọn sạch toàn bộ dữ liệu dùng thử cũ (nếu có trên trình duyệt) để đưa vào áp dụng thực tế
    if (localStorage.getItem(PRODUCTION_MODE_KEY) !== 'true') {
      this.purgeAllTrialData();
      localStorage.setItem(PRODUCTION_MODE_KEY, 'true');
      return;
    }

    if (!localStorage.getItem(STORAGE_KEYS.TASKS)) {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(initialTasks));
    }
    if (!localStorage.getItem(STORAGE_KEYS.DOCUMENTS)) {
      localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(initialDocuments));
    }
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(initialUsers));
    }
    if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(initialNotifications));
    }
    if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(initialAuditLogs));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SHIFTS)) {
      localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(initialShifts));
    }
    if (!localStorage.getItem(STORAGE_KEYS.WORK_TASK_ROWS)) {
      localStorage.setItem(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(initialWorkTaskRows));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MEETINGS)) {
      localStorage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(initialWeeklyMeetings));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MESSAGES)) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(initialChatMessages));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EQUIPMENT)) {
      localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(initialEquipment));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ROOMS)) {
      localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(initialRooms));
    }
    if (!localStorage.getItem(STORAGE_KEYS.STAFF_PROFILES)) {
      localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(initialStaffProfiles));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS)) {
      localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(initialLeaveRequests));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TRAINING_COURSES)) {
      localStorage.setItem(STORAGE_KEYS.TRAINING_COURSES, JSON.stringify(initialTrainingCourses));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MEETING_ITEMS)) {
      localStorage.setItem(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(initialMeetings));
    }
    if (!localStorage.getItem(STORAGE_KEYS.INTEGRATION_ENDPOINTS)) {
      localStorage.setItem(STORAGE_KEYS.INTEGRATION_ENDPOINTS, JSON.stringify(initialIntegrationEndpoints));
    }
    if (!localStorage.getItem(STORAGE_KEYS.INTEGRATION_PAYLOADS)) {
      localStorage.setItem(STORAGE_KEYS.INTEGRATION_PAYLOADS, JSON.stringify(initialIntegrationPayloads));
    }

    const savedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (savedUserId) {
      const users = this.getUsers();
      const found = users.find(u => u.id === savedUserId);
      if (found) this.currentUser = found;
    }
  }

  // --- Shifts (Lịch trực & Lịch làm việc) ---
  public getShifts(): ShiftDuty[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SHIFTS);
      return raw ? JSON.parse(raw) : initialShifts;
    } catch (e) {
      return initialShifts;
    }
  }

  public saveShift(shift: ShiftDuty): ShiftDuty {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shift.id);
    if (idx >= 0) {
      shifts[idx] = shift;
    } else {
      shifts.unshift(shift);
    }
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('SAVE_SHIFT', 'Shift', undefined, shift);
    this.notify();
    return shift;
  }

  public deleteShift(shiftId: string): boolean {
    const shifts = this.getShifts();
    const target = shifts.find(s => s.id === shiftId);
    if (!target) return false;

    const filtered = shifts.filter(s => s.id !== shiftId);
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(filtered));
    this.logAudit('DELETE_SHIFT', 'Shift', target, undefined);
    this.notify();
    return true;
  }

  public duplicateShift(shiftId: string, newDate?: string, newAssignedUserId?: string): ShiftDuty | null {
    const shifts = this.getShifts();
    const target = shifts.find(s => s.id === shiftId);
    if (!target) return null;

    const users = this.getUsers();
    let newUserName = target.assignedUserName || target.userName;
    let newUserRole = target.assignedRole || target.userTitle;

    if (newAssignedUserId) {
      const u = users.find(usr => usr.id === newAssignedUserId);
      if (u) {
        newUserName = u.name;
        newUserRole = u.title || u.role;
      }
    }

    const duplicated: ShiftDuty = {
      ...target,
      id: `SFT-${Date.now().toString().slice(-6)}`,
      title: `${target.title || target.shiftName || 'Ca làm việc'} (Bản sao)`,
      date: newDate || target.date,
      assignedUserId: newAssignedUserId || target.assignedUserId || target.userId,
      assignedUserName: newUserName,
      assignedRole: newUserRole,
      userName: newUserName,
      userTitle: newUserRole,
      swapRequest: undefined
    };

    shifts.unshift(duplicated);
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('DUPLICATE_SHIFT', 'Shift', target, duplicated);
    this.notify();
    return duplicated;
  }

  public requestShiftSwap(shiftId: string, targetUserId: string, reason: string): boolean {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shiftId);
    if (idx < 0) return false;

    const users = this.getUsers();
    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) return false;

    const currentShift = shifts[idx];
    const swapReq = {
      id: `SWP-${Date.now().toString().slice(-6)}`,
      shiftId,
      shiftTitle: currentShift.title || currentShift.shiftName || 'Ca làm việc',
      shiftDate: currentShift.date,
      requesterId: this.currentUser.id,
      requesterName: this.currentUser.name,
      targetUserId,
      targetUserName: targetUser.name,
      status: 'Chờ duyệt' as const,
      reason,
      createdAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16)
    };

    shifts[idx] = {
      ...currentShift,
      swapRequest: swapReq
    };

    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('REQUEST_SHIFT_SWAP', 'Shift', currentShift, swapReq);
    this.notify();
    return true;
  }

  public approveShiftSwap(shiftId: string): boolean {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shiftId);
    if (idx < 0) return false;

    const currentShift = shifts[idx];
    if (!currentShift.swapRequest) return false;

    const users = this.getUsers();
    const newAssignee = users.find(u => u.id === currentShift.swapRequest?.targetUserId);

    const updatedSwap = {
      ...currentShift.swapRequest,
      status: 'Đã duyệt' as const,
      approvedBy: this.currentUser.name,
      approvedAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16)
    };

    shifts[idx] = {
      ...currentShift,
      assignedUserId: newAssignee?.id || currentShift.swapRequest.targetUserId,
      assignedUserName: newAssignee?.name || currentShift.swapRequest.targetUserName,
      assignedRole: newAssignee?.title || newAssignee?.role || currentShift.assignedRole,
      userName: newAssignee?.name || currentShift.swapRequest.targetUserName,
      userTitle: newAssignee?.title || currentShift.userTitle,
      userId: newAssignee?.id || currentShift.userId,
      swapRequest: updatedSwap
    };

    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('APPROVE_SHIFT_SWAP', 'Shift', currentShift, shifts[idx]);
    this.notify();
    return true;
  }

  public rejectShiftSwap(shiftId: string): boolean {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shiftId);
    if (idx < 0) return false;

    const currentShift = shifts[idx];
    if (!currentShift.swapRequest) return false;

    shifts[idx] = {
      ...currentShift,
      swapRequest: {
        ...currentShift.swapRequest,
        status: 'Từ chối' as const,
        approvedBy: this.currentUser.name,
        approvedAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16)
      }
    };

    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.logAudit('REJECT_SHIFT_SWAP', 'Shift', currentShift, shifts[idx]);
    this.notify();
    return true;
  }

  // --- Work Task Rows (Danh Mục / Tên Công Việc Hàng Tuần) ---
  public getWorkTaskRows(): WorkTaskRow[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WORK_TASK_ROWS);
      return raw ? JSON.parse(raw) : initialWorkTaskRows;
    } catch (e) {
      return initialWorkTaskRows;
    }
  }

  public saveWorkTaskRow(row: WorkTaskRow): WorkTaskRow {
    const rows = this.getWorkTaskRows();
    const idx = rows.findIndex(r => r.id === row.id);
    if (idx >= 0) {
      rows[idx] = row;
    } else {
      rows.push(row);
    }
    localStorage.setItem(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(rows));
    this.logAudit('SAVE_WORK_TASK_ROW', 'Setting', undefined, row);
    this.notify();
    return row;
  }

  public deleteWorkTaskRow(rowId: string): boolean {
    const rows = this.getWorkTaskRows();
    const filtered = rows.filter(r => r.id !== rowId);
    localStorage.setItem(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(filtered));
    this.logAudit('DELETE_WORK_TASK_ROW', 'Setting', { id: rowId }, undefined);
    this.notify();
    return true;
  }

  public resetWorkTaskRows(): WorkTaskRow[] {
    localStorage.setItem(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(initialWorkTaskRows));
    this.notify();
    return initialWorkTaskRows;
  }

  // Carry over schedule / task rows to next week
  public copyWeeklyScheduleToNextWeek(currentWeekMondayStr: string): { newWeekMonday: string; createdCount: number } {
    const currentMonday = new Date(currentWeekMondayStr);
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(currentMonday.getDate() + 7);

    const activeRows = this.getWorkTaskRows();
    const shifts = this.getShifts();

    let createdCount = 0;

    // For each day of current week (0..6), find shifts and copy them to next week's corresponding day
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const srcDate = new Date(currentMonday);
      srcDate.setDate(currentMonday.getDate() + dayIndex);
      const srcDateStr = srcDate.toISOString().split('T')[0];

      const tgtDate = new Date(nextMonday);
      tgtDate.setDate(nextMonday.getDate() + dayIndex);
      const tgtDateStr = tgtDate.toISOString().split('T')[0];

      // Get shifts belonging to current week date
      const srcShifts = shifts.filter(s => s.date === srcDateStr);

      for (const s of srcShifts) {
        // If shift belongs to a task row, check if that task row is still active (not deleted)
        if (s.taskRowId) {
          const rowExists = activeRows.some(r => r.id === s.taskRowId);
          if (!rowExists) continue; // Skip deleted task rows!
        }

        // Create new shift for next week
        const newShift: ShiftDuty = {
          ...s,
          id: `SFT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
          date: tgtDateStr,
          status: 'Đã phân công',
          swapRequest: undefined
        };

        shifts.unshift(newShift);
        createdCount++;
      }
    }

    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.notify();
    return {
      newWeekMonday: nextMonday.toISOString().split('T')[0],
      createdCount
    };
  }

  // --- Weekly Meetings & Plans (Lịch họp & Kế hoạch tuần) ---
  public getMeetings(): WeeklyMeeting[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MEETINGS);
      return raw ? JSON.parse(raw) : initialWeeklyMeetings;
    } catch (e) {
      return initialWeeklyMeetings;
    }
  }

  public saveMeeting(meeting: WeeklyMeeting): WeeklyMeeting {
    const meetings = this.getMeetings();
    const idx = meetings.findIndex(m => m.id === meeting.id);
    if (idx >= 0) {
      meetings[idx] = meeting;
    } else {
      meetings.unshift(meeting);
    }
    localStorage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(meetings));
    this.logAudit('SAVE_MEETING', 'Task', undefined, meeting);
    this.notify();
    return meeting;
  }

  // --- Chat Channels & Groups ---
  public getChannels(): ChatGroupChannel[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CHANNELS);
      return raw ? JSON.parse(raw) : initialChannels;
    } catch (e) {
      return initialChannels;
    }
  }

  public saveChannel(channel: ChatGroupChannel): ChatGroupChannel {
    const channels = this.getChannels();
    const idx = channels.findIndex(c => c.id === channel.id);
    if (idx >= 0) {
      channels[idx] = channel;
    } else {
      channels.push(channel);
      this.logAudit('CREATE_CHAT_GROUP', 'System', undefined, { id: channel.id, name: channel.name });
    }
    localStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(channels));
    this.notify();
    return channel;
  }

  public deleteChannel(channelId: string): boolean {
    const channels = this.getChannels();
    const filtered = channels.filter(c => c.id !== channelId);
    localStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(filtered));
    this.logAudit('DELETE_CHAT_GROUP', 'System', { channelId });
    this.notify();
    return true;
  }

  // --- Department Announcements ---
  public getAnnouncements(): DepartmentAnnouncement[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS);
      return raw ? JSON.parse(raw) : initialAnnouncements;
    } catch (e) {
      return initialAnnouncements;
    }
  }

  public saveAnnouncement(announcement: DepartmentAnnouncement): DepartmentAnnouncement {
    const announcements = this.getAnnouncements();
    const idx = announcements.findIndex(a => a.id === announcement.id);
    if (idx >= 0) {
      announcements[idx] = announcement;
    } else {
      announcements.unshift(announcement);
      this.logAudit('CREATE_ANNOUNCEMENT', 'System', undefined, announcement);
    }
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(announcements));
    this.notify();
    return announcement;
  }

  // --- Chat Messages (Direct & Group) ---
  public getChatMessages(): ChatChannelMessage[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      return raw ? JSON.parse(raw) : initialChatMessages;
    } catch (e) {
      return initialChatMessages;
    }
  }

  public sendChatMessage(params: {
    channelId?: string;
    channelName?: string;
    dmUserId?: string;
    dmUserName?: string;
    content: string;
    msgType?: MessageType;
    fileUrl?: string;
    fileName?: string;
    fileSize?: string;
    shareCard?: ShareCardData;
    mentions?: string[];
    isUrgent?: boolean;
  }): ChatChannelMessage {
    const msgs = this.getChatMessages();
    const newMsg: ChatChannelMessage = {
      id: `MSG-${Date.now().toString().slice(-6)}`,
      channelId: params.channelId,
      channelName: params.channelName,
      dmUserId: params.dmUserId,
      dmUserName: params.dmUserName,
      senderId: this.currentUser.id,
      senderName: this.currentUser.name,
      senderRole: this.currentUser.title || this.currentUser.role,
      avatar: this.currentUser.avatar,
      content: params.content,
      timestamp: 'Vừa xong',
      msgType: params.msgType || 'text',
      fileUrl: params.fileUrl,
      fileName: params.fileName,
      fileSize: params.fileSize,
      shareCard: params.shareCard,
      mentions: params.mentions,
      isUrgent: params.isUrgent,
      isRead: false,
      isUnread: false,
      reactions: [],
      replies: []
    };

    msgs.push(newMsg);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.logAudit('SEND_CHAT_MESSAGE', 'System', undefined, { id: newMsg.id, channelId: params.channelId, dmUserId: params.dmUserId });
    this.notify();
    return newMsg;
  }

  public addMessageReaction(messageId: string, emoji: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    const msg = msgs[idx];
    let reactions = msg.reactions || [];
    const rIndex = reactions.findIndex(r => r.emoji === emoji);

    if (rIndex >= 0) {
      const existing = reactions[rIndex];
      const userHasReacted = existing.users.includes(this.currentUser.name);
      if (userHasReacted) {
        // Toggle off
        existing.users = existing.users.filter(u => u !== this.currentUser.name);
        existing.count = existing.users.length;
        if (existing.count === 0) {
          reactions.splice(rIndex, 1);
        }
      } else {
        existing.users.push(this.currentUser.name);
        existing.count = existing.users.length;
      }
    } else {
      reactions.push({
        emoji,
        count: 1,
        users: [this.currentUser.name]
      });
    }

    msgs[idx] = { ...msg, reactions };
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.notify();
  }

  public togglePinMessage(messageId: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    msgs[idx] = { ...msgs[idx], isPinned: !msgs[idx].isPinned };
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.logAudit('TOGGLE_PIN_MESSAGE', 'System', undefined, { messageId, isPinned: msgs[idx].isPinned });
    this.notify();
  }

  public toggleSaveMessage(messageId: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    msgs[idx] = { ...msgs[idx], isSaved: !msgs[idx].isSaved };
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.notify();
  }

  public editChatMessage(messageId: string, newContent: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    const msg = msgs[idx];
    const history = msg.editHistory || [];
    history.push(msg.content);

    msgs[idx] = {
      ...msg,
      content: newContent,
      editedAt: 'Vừa xong',
      editHistory: history
    };

    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.logAudit('EDIT_CHAT_MESSAGE', 'System', { old: msg.content }, { new: newContent });
    this.notify();
  }

  public deleteChatMessage(messageId: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    msgs[idx] = {
      ...msgs[idx],
      content: 'Tin nhắn này đã bị xóa bởi người gửi.',
      isDeleted: true
    };

    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.logAudit('DELETE_CHAT_MESSAGE', 'System', { messageId });
    this.notify();
  }

  public addThreadReply(messageId: string, content: string) {
    const msgs = this.getChatMessages();
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    const msg = msgs[idx];
    const replies = msg.replies || [];
    replies.push({
      id: `RPL-${Date.now().toString().slice(-6)}`,
      senderId: this.currentUser.id,
      senderName: this.currentUser.name,
      senderRole: this.currentUser.title || this.currentUser.role,
      avatar: this.currentUser.avatar,
      content,
      timestamp: 'Vừa xong',
      reactions: []
    });

    msgs[idx] = { ...msg, replies };
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.notify();
  }

  public markMessagesAsRead(channelIdOrDmId?: string) {
    const msgs = this.getChatMessages();
    const updated = msgs.map(m => {
      if (!channelIdOrDmId || m.channelId === channelIdOrDmId || m.dmUserId === channelIdOrDmId) {
        return { ...m, isRead: true, isUnread: false };
      }
      return m;
    });
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    this.notify();
  }

  // --- Current Active User Context ---
  public getCurrentUser(): User {
    return this.currentUser;
  }

  public setCurrentUser(user: User) {
    this.currentUser = user;
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, user.id);
    this.notify();
  }

  // --- Audit Logging ---
  public logAudit(action: string, module: 'Task' | 'Document' | 'User' | 'Shift' | 'Setting' | 'System' | 'Equipment' | 'Room' | 'HR' | 'Meeting' | 'Integration', oldData?: any, newData?: any) {
    const logs = this.getAuditLogs();
    const newLog: AuditLogItem = {
      id: `LOG-${Date.now().toString().slice(-6)}`,
      userEmail: this.currentUser.email,
      userName: this.currentUser.name,
      userRole: this.currentUser.role,
      action,
      module,
      timestamp: new Date().toLocaleString('sv-SE').replace('T', ' '),
      ipAddress: '118.69.182.45',
      device: navigator.userAgent.includes('Mac') ? 'Safari (macOS)' : 'Chrome (Windows 11)',
      oldData: oldData ? JSON.stringify(oldData) : undefined,
      newData: newData ? JSON.stringify(newData) : undefined
    };
    logs.unshift(newLog);
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs.slice(0, 100))); // keep max 100
    this.notify();
  }

  public getAuditLogs(): AuditLogItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return initialAuditLogs;
    }
  }

  // --- Tasks CRUD & Operations ---
  public getTasks(): TaskItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TASKS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return initialTasks;
    }
  }

  public saveTask(task: TaskItem): TaskItem {
    const tasks = this.getTasks();
    const existingIndex = tasks.findIndex(t => t.id === task.id);
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);

    let updatedTask: TaskItem;
    if (existingIndex >= 0) {
      const oldTask = tasks[existingIndex];
      updatedTask = { ...task, updatedDate: now };
      tasks[existingIndex] = updatedTask;
      this.logAudit('UPDATE_TASK', 'Task', oldTask, updatedTask);
    } else {
      updatedTask = {
        ...task,
        id: task.id || `TSK-${Math.floor(1000 + Math.random() * 9000)}`,
        createdDate: now,
        updatedDate: now,
        creator: this.currentUser.name
      };
      tasks.unshift(updatedTask);
      this.logAudit('CREATE_TASK', 'Task', undefined, updatedTask);
    }

    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    this.notify();
    return updatedTask;
  }

  public deleteTask(taskId: string): boolean {
    const tasks = this.getTasks();
    const target = tasks.find(t => t.id === taskId);
    if (!target) return false;

    const filtered = tasks.filter(t => t.id !== taskId);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(filtered));
    this.logAudit('DELETE_TASK', 'Task', target, undefined);
    this.notify();
    return true;
  }

  public bulkDeleteTasks(taskIds: string[]): number {
    const tasks = this.getTasks();
    const toDelete = tasks.filter(t => taskIds.includes(t.id));
    const remaining = tasks.filter(t => !taskIds.includes(t.id));

    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(remaining));
    this.logAudit(`BULK_DELETE_TASKS (${taskIds.length})`, 'Task', toDelete, undefined);
    this.notify();
    return toDelete.length;
  }

  public bulkCompleteTasks(taskIds: string[]): number {
    const tasks = this.getTasks();
    let count = 0;
    const updated = tasks.map(t => {
      if (taskIds.includes(t.id) && t.status !== 'Đã hoàn thành') {
        count++;
        return { ...t, status: 'Đã hoàn thành' as const, updatedDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16) };
      }
      return t;
    });

    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(updated));
    this.logAudit(`BULK_COMPLETE_TASKS (${count})`, 'Task', undefined, { completedIds: taskIds });
    this.notify();
    return count;
  }

  public duplicateTask(taskId: string): TaskItem | null {
    const tasks = this.getTasks();
    const target = tasks.find(t => t.id === taskId);
    if (!target) return null;

    const newId = `TSK-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
    const duplicated: TaskItem = {
      ...target,
      id: newId,
      title: `${target.title} (Bản sao)`,
      status: 'Chờ xử lý',
      createdDate: now,
      updatedDate: now,
      creator: this.currentUser.name
    };

    tasks.unshift(duplicated);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    this.logAudit('DUPLICATE_TASK', 'Task', target, duplicated);
    this.notify();
    return duplicated;
  }

  // --- Documents CRUD & Operations ---
  public getDocuments(): DocumentItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return initialDocuments;
    }
  }

  public saveDocument(doc: DocumentItem): DocumentItem {
    const docs = this.getDocuments();
    const existingIndex = docs.findIndex(d => d.id === doc.id);

    let updatedDoc: DocumentItem;
    if (existingIndex >= 0) {
      const oldDoc = docs[existingIndex];
      updatedDoc = { ...doc };
      docs[existingIndex] = updatedDoc;
      this.logAudit('UPDATE_DOCUMENT', 'Document', oldDoc, updatedDoc);
    } else {
      updatedDoc = {
        ...doc,
        id: doc.id || `DOC-${Math.floor(2000 + Math.random() * 8000)}`,
        owner: doc.owner || this.currentUser.name,
        uploadDate: new Date().toISOString().split('T')[0]
      };
      docs.unshift(updatedDoc);
      this.logAudit('UPLOAD_DOCUMENT', 'Document', undefined, updatedDoc);
    }

    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
    this.notify();
    return updatedDoc;
  }

  public deleteDocument(docId: string): boolean {
    const docs = this.getDocuments();
    const target = docs.find(d => d.id === docId);
    if (!target) return false;

    const filtered = docs.filter(d => d.id !== docId);
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(filtered));
    this.logAudit('DELETE_DOCUMENT', 'Document', target, undefined);
    this.notify();
    return true;
  }

  // --- Notifications Log ---
  public getNotifications(): NotificationLog[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return initialNotifications;
    }
  }

  public sendNotification(notif: Omit<NotificationLog, 'id' | 'sentAt'>): NotificationLog {
    const logs = this.getNotifications();
    const newNotif: NotificationLog = {
      ...notif,
      id: `NOTIF-${Date.now().toString().slice(-6)}`,
      sentAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16)
    };
    logs.unshift(newNotif);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(logs));
    this.logAudit(`SEND_NOTIFICATION_${notif.channel.toUpperCase()}`, 'System', undefined, newNotif);
    this.notify();
    return newNotif;
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return raw ? JSON.parse(raw) : initialSettings;
    } catch (e) {
      return initialSettings;
    }
  }

  public saveSettings(settings: AppSettings) {
    const old = this.getSettings();
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    this.logAudit('UPDATE_SETTINGS', 'Setting', old, settings);
    this.notify();
  }

  // --- Authentication & Password Management ---
  public isAuthenticated(): boolean {
    const val = localStorage.getItem('cls_workhub_is_authenticated');
    return val !== 'false';
  }

  public setAuthenticated(status: boolean): void {
    localStorage.setItem('cls_workhub_is_authenticated', status ? 'true' : 'false');
    this.notify();
  }

  public login(email: string, password: string): { success: boolean; message: string; user?: User } {
    const users = this.getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());

    if (!user) {
      return { success: false, message: 'Email không tồn tại trong hệ thống' };
    }

    const validPassword = user.password || '123456';
    if (password !== validPassword) {
      return { success: false, message: 'Mật khẩu không chính xác' };
    }

    this.setCurrentUser(user);
    this.setAuthenticated(true);
    this.logAudit('USER_LOGIN', 'User', undefined, { email: user.email, name: user.name });
    return { success: true, message: 'Đăng nhập thành công', user };
  }

  public loginById(userId: string, password: string): { success: boolean; message: string; user?: User } {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return { success: false, message: 'Không tìm thấy thông tin cán bộ trong hệ thống' };
    }

    const validPassword = user.password || '123456';
    if (password !== validPassword) {
      return { success: false, message: 'Mật khẩu không chính xác! (Mật khẩu mặc định: 123456)' };
    }

    this.setCurrentUser(user);
    this.setAuthenticated(true);
    this.logAudit('USER_LOGIN', 'User', undefined, { userId: user.id, name: user.name, role: user.role });
    return { success: true, message: `Đăng nhập thành công: ${user.name}`, user };
  }

  public logout(): void {
    this.logAudit('USER_LOGOUT', 'User', undefined, { userId: this.currentUser.id, name: this.currentUser.name });
    this.setAuthenticated(false);
  }

  public changePassword(userId: string, oldPassword: string, newPassword: string): { success: boolean; message: string } {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0) {
      return { success: false, message: 'Không tìm thấy người dùng' };
    }

    const currentPass = users[idx].password || '123456';
    if (oldPassword !== currentPass) {
      return { success: false, message: 'Mật khẩu hiện tại không đúng' };
    }

    users[idx] = {
      ...users[idx],
      password: newPassword,
      resetRequested: false,
      resetRequestNote: undefined
    };

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    if (this.currentUser.id === userId) {
      this.currentUser = users[idx];
    }
    this.logAudit('CHANGE_PASSWORD', 'User', undefined, { userId, name: users[idx].name });
    this.notify();
    return { success: true, message: 'Đổi mật khẩu thành công!' };
  }

  public requestPasswordReset(email: string, note?: string): { success: boolean; message: string } {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase().trim());
    if (idx < 0) {
      return { success: false, message: 'Email không tồn tại trong hệ thống' };
    }

    users[idx] = {
      ...users[idx],
      resetRequested: true,
      resetRequestNote: note || 'Yêu cầu khôi phục mật khẩu từ trang đăng nhập'
    };

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    this.logAudit('REQUEST_PASSWORD_RESET', 'User', undefined, { email, note });
    this.notify();
    return { success: true, message: 'Đã gửi yêu cầu reset mật khẩu tới Admin. Vui lòng liên hệ Admin để nhận mật khẩu mới.' };
  }

  public resetUserPassword(userId: string, newPassword: string): { success: boolean; message: string } {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0) {
      return { success: false, message: 'Không tìm thấy tài khoản người dùng' };
    }

    users[idx] = {
      ...users[idx],
      password: newPassword,
      resetRequested: false,
      resetRequestNote: undefined
    };

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    if (this.currentUser.id === userId) {
      this.currentUser = users[idx];
    }
    this.logAudit('ADMIN_RESET_PASSWORD', 'User', undefined, { userId, newPassword });
    this.notify();
    return { success: true, message: `Đã đặt lại mật khẩu thành công cho tài khoản ${users[idx].name}` };
  }

  // --- Users List ---
  public getUsers(): User[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = raw ? JSON.parse(raw) : [...initialUsers];

      // Merge with staff profiles if present so all hospital personnel can log in
      const staffRaw = localStorage.getItem(STORAGE_KEYS.STAFF_PROFILES);
      if (staffRaw) {
        const staffList: StaffProfile[] = JSON.parse(staffRaw);
        for (const s of staffList) {
          if (!users.some(u => u.id === s.userId || u.name === s.fullName)) {
            users.push({
              id: s.userId,
              name: s.fullName,
              email: s.email || `${s.userId.toLowerCase()}@hospital.vn`,
              role: (s.role as UserRole) || 'Staff',
              title: (s.title as CLSTitle) || 'Kỹ thuật viên',
              department: s.departmentSection || 'Khoa Cận Lâm Sàng',
              phone: s.phone,
              avatar: s.avatar || 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80',
              status: 'Active',
              password: '123456'
            });
          }
        }
      }

      // Deduplicate by user ID
      const uniqueMap = new Map<string, User>();
      for (const u of users) {
        if (!uniqueMap.has(u.id)) {
          uniqueMap.set(u.id, u);
        }
      }

      return Array.from(uniqueMap.values()).map(u => ({
        ...u,
        avatar: u.avatar?.includes('1594824813566')
          ? 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150&auto=format&fit=crop&q=80'
          : u.avatar
      }));
    } catch (e) {
      return initialUsers;
    }
  }

  public saveUser(user: User): User {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    this.logAudit('UPDATE_USER', 'User', undefined, user);
    this.notify();
    return user;
  }

  // --- Equipment & Machine Management ---
  public getEquipment(): EquipmentItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EQUIPMENT);
      if (!raw) return initialEquipment;
      const parsed: EquipmentItem[] = JSON.parse(raw);
      // Merge with initial data to ensure complete fields if stored from older version
      return parsed.map(item => {
        const seed = initialEquipment.find(e => e.id === item.id);
        if (!seed) return item;
        return {
          ...seed,
          ...item,
          managerInCharge: item.managerInCharge || seed.managerInCharge,
          purchaseDate: item.purchaseDate || seed.purchaseDate,
          purchasePrice: item.purchasePrice || seed.purchasePrice,
          supplier: item.supplier || seed.supplier,
          originCountry: item.originCountry || seed.originCountry,
          yearOfManufacture: item.yearOfManufacture || seed.yearOfManufacture,
          warrantyExpiry: item.warrantyExpiry || seed.warrantyExpiry,
          operatingPermitNumber: item.operatingPermitNumber || seed.operatingPermitNumber,
          operatingPermitExpiry: item.operatingPermitExpiry || seed.operatingPermitExpiry,
          radiationLicenseNumber: item.radiationLicenseNumber || seed.radiationLicenseNumber,
          radiationLicenseIssuedBy: item.radiationLicenseIssuedBy || seed.radiationLicenseIssuedBy,
          calibrationNumber: item.calibrationNumber || seed.calibrationNumber,
          calibrationIssuedBy: item.calibrationIssuedBy || seed.calibrationIssuedBy,
          powerSupply: item.powerSupply || seed.powerSupply,
          specifications: item.specifications || seed.specifications,
          maintenanceHistory: (item.maintenanceHistory && item.maintenanceHistory.length > 0) ? item.maintenanceHistory : seed.maintenanceHistory,
          repairHistory: (item.repairHistory && item.repairHistory.length > 0) ? item.repairHistory : seed.repairHistory
        };
      });
    } catch (e) {
      return initialEquipment;
    }
  }

  public saveEquipment(item: EquipmentItem): EquipmentItem {
    const list = this.getEquipment();
    const idx = list.findIndex(e => e.id === item.id);
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.unshift(item);
    }
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('SAVE_EQUIPMENT', 'Equipment', undefined, item);
    this.notify();
    return item;
  }

  public deleteEquipment(equipmentId: string): boolean {
    const list = this.getEquipment();
    const target = list.find(e => e.id === equipmentId);
    if (!target) return false;
    const updated = list.filter(e => e.id !== equipmentId);
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(updated));
    this.logAudit('DELETE_EQUIPMENT', 'Equipment', target, undefined);
    this.notify();
    return true;
  }

  public addMaintenanceLog(equipmentId: string, log: MaintenanceLog): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item) return null;
    if (!item.maintenanceHistory) item.maintenanceHistory = [];
    item.maintenanceHistory.unshift(log);
    item.lastMaintenanceDate = log.date;
    if (log.nextDueDate) item.nextMaintenanceDate = log.nextDueDate;
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('ADD_MAINTENANCE_LOG', 'Equipment', undefined, log);
    this.notify();
    return item;
  }

  public updateMaintenanceLog(equipmentId: string, updatedLog: MaintenanceLog): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item || !item.maintenanceHistory) return null;
    const idx = item.maintenanceHistory.findIndex(m => m.id === updatedLog.id);
    if (idx < 0) return null;
    const oldLog = item.maintenanceHistory[idx];
    item.maintenanceHistory[idx] = updatedLog;
    if (idx === 0) {
      item.lastMaintenanceDate = updatedLog.date;
      if (updatedLog.nextDueDate) item.nextMaintenanceDate = updatedLog.nextDueDate;
    }
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('UPDATE_MAINTENANCE_LOG', 'Equipment', oldLog, updatedLog);
    this.notify();
    return item;
  }

  public deleteMaintenanceLog(equipmentId: string, logId: string): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item || !item.maintenanceHistory) return null;
    const target = item.maintenanceHistory.find(m => m.id === logId);
    if (!target) return null;
    item.maintenanceHistory = item.maintenanceHistory.filter(m => m.id !== logId);
    if (item.maintenanceHistory.length > 0) {
      item.lastMaintenanceDate = item.maintenanceHistory[0].date;
      if (item.maintenanceHistory[0].nextDueDate) {
        item.nextMaintenanceDate = item.maintenanceHistory[0].nextDueDate;
      }
    }
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('DELETE_MAINTENANCE_LOG', 'Equipment', target, undefined);
    this.notify();
    return item;
  }

  public addRepairLog(equipmentId: string, log: RepairLog): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item) return null;
    if (!item.repairHistory) item.repairHistory = [];
    item.repairHistory.unshift(log);
    if (log.status === 'Đã khôi phục') {
      item.status = 'Hoạt động tốt';
    } else {
      item.status = 'Sự cố hỏng hóc';
    }
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('ADD_REPAIR_LOG', 'Equipment', undefined, log);
    this.notify();
    return item;
  }

  public updateRepairLog(equipmentId: string, updatedLog: RepairLog): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item || !item.repairHistory) return null;
    const idx = item.repairHistory.findIndex(r => r.id === updatedLog.id);
    if (idx < 0) return null;
    const oldLog = item.repairHistory[idx];
    item.repairHistory[idx] = updatedLog;
    // Update equipment status based on recent repairs
    const hasUnresolved = item.repairHistory.some(r => r.status !== 'Đã khôi phục');
    item.status = hasUnresolved ? 'Sự cố hỏng hóc' : 'Hoạt động tốt';
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('UPDATE_REPAIR_LOG', 'Equipment', oldLog, updatedLog);
    this.notify();
    return item;
  }

  public deleteRepairLog(equipmentId: string, logId: string): EquipmentItem | null {
    const list = this.getEquipment();
    const item = list.find(e => e.id === equipmentId);
    if (!item || !item.repairHistory) return null;
    const target = item.repairHistory.find(r => r.id === logId);
    if (!target) return null;
    item.repairHistory = item.repairHistory.filter(r => r.id !== logId);
    const hasUnresolved = item.repairHistory.some(r => r.status !== 'Đã khôi phục');
    item.status = hasUnresolved ? 'Sự cố hỏng hóc' : 'Hoạt động tốt';
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(list));
    this.logAudit('DELETE_REPAIR_LOG', 'Equipment', target, undefined);
    this.notify();
    return item;
  }

  // --- Paraclinical Rooms ---
  public getRooms(): ParaclinicalRoom[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ROOMS);
      return raw ? JSON.parse(raw) : initialRooms;
    } catch (e) {
      return initialRooms;
    }
  }

  public saveRoom(room: ParaclinicalRoom): ParaclinicalRoom {
    const rooms = this.getRooms();
    const idx = rooms.findIndex(r => r.id === room.id);
    let oldRoom: ParaclinicalRoom | undefined;
    if (idx >= 0) {
      oldRoom = rooms[idx];
      rooms[idx] = room;
      // If room name changed, cascade update to staff and equipment
      if (oldRoom && oldRoom.name !== room.name) {
        this.cascadeRoomNameChange(oldRoom.name, room.name);
      }
    } else {
      rooms.unshift(room);
    }
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    this.logAudit('SAVE_ROOM', 'Room', oldRoom, room);
    this.notify();
    return room;
  }

  public deleteRoom(roomId: string, transferRoomName?: string): boolean {
    const rooms = this.getRooms();
    const targetRoom = rooms.find(r => r.id === roomId);
    if (!targetRoom) return false;

    const filtered = rooms.filter(r => r.id !== roomId);
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(filtered));

    // Cascade staff and equipment reassignment
    const staffList = this.getStaffProfiles();
    let staffUpdated = false;
    staffList.forEach(s => {
      if (s.room === targetRoom.name) {
        s.room = transferRoomName || 'Chưa phân phòng';
        staffUpdated = true;
      }
    });
    if (staffUpdated) {
      localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    }

    const eqList = this.getEquipment();
    let eqUpdated = false;
    eqList.forEach(e => {
      if (e.room === targetRoom.name || e.room.includes(targetRoom.name)) {
        e.room = transferRoomName || 'Kho thiết bị / Chưa phân phòng';
        eqUpdated = true;
      }
    });
    if (eqUpdated) {
      localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
    }

    this.logAudit('DELETE_ROOM', 'Room', targetRoom, { transferRoomName });
    this.notify();
    return true;
  }

  public cascadeRoomNameChange(oldName: string, newName: string) {
    if (!oldName || !newName || oldName === newName) return;
    
    // Update Staff
    const staffList = this.getStaffProfiles();
    let staffUpdated = false;
    staffList.forEach(s => {
      if (s.room === oldName) {
        s.room = newName;
        staffUpdated = true;
      }
    });
    if (staffUpdated) {
      localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    }

    // Update Equipment
    const eqList = this.getEquipment();
    let eqUpdated = false;
    eqList.forEach(e => {
      if (e.room === oldName) {
        e.room = newName;
        eqUpdated = true;
      } else if (e.room.includes(oldName)) {
        e.room = e.room.replace(oldName, newName);
        eqUpdated = true;
      }
    });
    if (eqUpdated) {
      localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
    }
  }

  public assignStaffToRoom(staffUserId: string, targetRoomName: string, departmentSection?: string): boolean {
    const staffList = this.getStaffProfiles();
    const staff = staffList.find(s => s.userId === staffUserId);
    if (!staff) return false;

    const oldRoom = staff.room;
    staff.room = targetRoomName;
    if (departmentSection) {
      staff.departmentSection = departmentSection;
    }

    localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    this.logAudit('ASSIGN_STAFF_TO_ROOM', 'HR', { staffUserId, oldRoom }, { staffUserId, newRoom: targetRoomName });
    this.notify();
    return true;
  }

  public removeStaffFromRoom(staffUserId: string): boolean {
    const staffList = this.getStaffProfiles();
    const staff = staffList.find(s => s.userId === staffUserId);
    if (!staff) return false;

    const oldRoom = staff.room;
    staff.room = 'Chưa phân phòng';
    localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(staffList));
    this.logAudit('REMOVE_STAFF_FROM_ROOM', 'HR', { staffUserId, oldRoom });
    this.notify();
    return true;
  }

  public assignEquipmentToRoom(equipmentId: string, targetRoomName: string): boolean {
    const eqList = this.getEquipment();
    const eq = eqList.find(e => e.id === equipmentId);
    if (!eq) return false;

    const oldRoom = eq.room;
    eq.room = targetRoomName;
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
    this.logAudit('ASSIGN_EQUIPMENT_TO_ROOM', 'Equipment', { equipmentId, oldRoom }, { equipmentId, newRoom: targetRoomName });
    this.notify();
    return true;
  }

  public removeEquipmentFromRoom(equipmentId: string): boolean {
    const eqList = this.getEquipment();
    const eq = eqList.find(e => e.id === equipmentId);
    if (!eq) return false;

    const oldRoom = eq.room;
    eq.room = 'Kho thiết bị / Chưa phân phòng';
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(eqList));
    this.logAudit('REMOVE_EQUIPMENT_FROM_ROOM', 'Equipment', { equipmentId, oldRoom });
    this.notify();
    return true;
  }

  public addRoomReservation(roomId: string, reservation: RoomReservation): ParaclinicalRoom | null {
    const rooms = this.getRooms();
    const room = rooms.find(r => r.id === roomId);
    if (!room) return null;
    if (!room.reservations) room.reservations = [];
    room.reservations.unshift(reservation);
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    this.logAudit('ADD_ROOM_RESERVATION', 'Room', undefined, reservation);
    this.notify();
    return room;
  }

  // --- Staff Profiles & HR ---
  public getStaffProfiles(): StaffProfile[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STAFF_PROFILES);
      const list: StaffProfile[] = raw ? JSON.parse(raw) : initialStaffProfiles;
      return list.map(s => ({
        ...s,
        avatar: s.avatar?.includes('1594824813566')
          ? 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=200&auto=format&fit=crop&q=80'
          : s.avatar
      }));
    } catch (e) {
      return initialStaffProfiles;
    }
  }

  public saveStaffProfile(profile: StaffProfile): StaffProfile {
    const list = this.getStaffProfiles();
    const idx = list.findIndex(s => s.userId === profile.userId);
    if (idx >= 0) {
      list[idx] = profile;
    } else {
      list.unshift(profile);
    }
    localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(list));
    this.logAudit('SAVE_STAFF_PROFILE', 'HR', undefined, profile);
    this.notify();
    return profile;
  }

  public saveStaffProfilesBatch(newProfiles: StaffProfile[]): void {
    const list = this.getStaffProfiles();
    for (const p of newProfiles) {
      const idx = list.findIndex(s => s.userId === p.userId);
      if (idx >= 0) {
        list[idx] = p;
      } else {
        list.push(p);
      }
    }
    localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(list));
    this.logAudit('BATCH_IMPORT_STAFF', 'HR', undefined, { count: newProfiles.length });
    this.notify();
  }

  public deleteStaffProfile(userId: string): boolean {
    const list = this.getStaffProfiles();
    const target = list.find(s => s.userId === userId);
    if (!target) return false;
    const filtered = list.filter(s => s.userId !== userId);
    localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(filtered));
    this.logAudit('DELETE_STAFF_PROFILE', 'HR', target, undefined);
    this.notify();
    return true;
  }

  public getLeaveRequests(): LeaveRequest[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS);
      return raw ? JSON.parse(raw) : initialLeaveRequests;
    } catch (e) {
      return initialLeaveRequests;
    }
  }

  public saveLeaveRequest(req: LeaveRequest): LeaveRequest {
    const list = this.getLeaveRequests();
    const idx = list.findIndex(l => l.id === req.id);
    if (idx >= 0) {
      list[idx] = req;
    } else {
      list.unshift(req);
    }
    localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(list));
    this.logAudit('SAVE_LEAVE_REQUEST', 'HR', undefined, req);
    this.notify();
    return req;
  }

  public updateLeaveStatus(id: string, status: 'Đã phê duyệt' | 'Từ chối', approvedBy: string): LeaveRequest | null {
    const list = this.getLeaveRequests();
    const req = list.find(l => l.id === id);
    if (!req) return null;
    req.status = status;
    req.approvedBy = approvedBy;
    localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(list));
    this.logAudit('UPDATE_LEAVE_STATUS', 'HR', undefined, req);
    this.notify();
    return req;
  }

  public getTrainingCourses(): TrainingCourse[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TRAINING_COURSES);
      return raw ? JSON.parse(raw) : initialTrainingCourses;
    } catch (e) {
      return initialTrainingCourses;
    }
  }

  public saveTrainingCourse(course: TrainingCourse): TrainingCourse {
    const list = this.getTrainingCourses();
    const idx = list.findIndex(c => c.id === course.id);
    if (idx >= 0) {
      list[idx] = course;
    } else {
      list.unshift(course);
    }
    localStorage.setItem(STORAGE_KEYS.TRAINING_COURSES, JSON.stringify(list));
    this.logAudit('SAVE_TRAINING_COURSE', 'HR', undefined, course);
    this.notify();
    return course;
  }

  // --- Meeting Management ---
  public getMeetingItems(): MeetingItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MEETING_ITEMS);
      return raw ? JSON.parse(raw) : initialMeetings;
    } catch (e) {
      return initialMeetings;
    }
  }

  public saveMeetingItem(meeting: MeetingItem): MeetingItem {
    const list = this.getMeetingItems();
    const idx = list.findIndex(m => m.id === meeting.id);
    if (idx >= 0) {
      list[idx] = meeting;
    } else {
      list.unshift(meeting);
    }
    localStorage.setItem(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(list));
    this.logAudit('SAVE_MEETING', 'Meeting', undefined, meeting);
    this.notify();
    return meeting;
  }

  public saveMeetingMinutes(meetingId: string, minutes: MeetingMinutes): MeetingItem | null {
    const list = this.getMeetingItems();
    const meeting = list.find(m => m.id === meetingId);
    if (!meeting) return null;
    meeting.minutes = minutes;
    meeting.status = 'Đã hoàn thành';
    localStorage.setItem(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(list));
    this.logAudit('SAVE_MEETING_MINUTES', 'Meeting', undefined, minutes);
    this.notify();
    return meeting;
  }

  // --- Integration Hub ---
  public getIntegrationEndpoints(): IntegrationEndpoint[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.INTEGRATION_ENDPOINTS);
      return raw ? JSON.parse(raw) : initialIntegrationEndpoints;
    } catch (e) {
      return initialIntegrationEndpoints;
    }
  }

  public getIntegrationPayloads(): IntegrationPayloadSample[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.INTEGRATION_PAYLOADS);
      return raw ? JSON.parse(raw) : initialIntegrationPayloads;
    } catch (e) {
      return initialIntegrationPayloads;
    }
  }

  public addIntegrationPayload(payload: IntegrationPayloadSample): IntegrationPayloadSample {
    const list = this.getIntegrationPayloads();
    list.unshift(payload);
    localStorage.setItem(STORAGE_KEYS.INTEGRATION_PAYLOADS, JSON.stringify(list));
    this.notify();
    return payload;
  }

  // --- Quản Lý Dữ Liệu Thực Tế & Thử Nghiệm ---

  /**
   * Xóa sạch 100% dữ liệu dùng thử / demo, đưa hệ thống về trạng thái sẵn sàng vận hành thực tế
   */
  public purgeAllTrialData() {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(initialTasks));
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(initialDocuments));
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(initialUsers));
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(initialNotifications));
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(initialAuditLogs));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(initialShifts));
    localStorage.setItem(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(initialWorkTaskRows));
    localStorage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(initialWeeklyMeetings));
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(initialChatMessages));
    localStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(initialChannels));
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(initialAnnouncements));
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(initialEquipment));
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(initialRooms));
    localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(initialStaffProfiles));
    localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(initialLeaveRequests));
    localStorage.setItem(STORAGE_KEYS.TRAINING_COURSES, JSON.stringify(initialTrainingCourses));
    localStorage.setItem(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(initialMeetings));
    localStorage.setItem(STORAGE_KEYS.INTEGRATION_ENDPOINTS, JSON.stringify(initialIntegrationEndpoints));
    localStorage.setItem(STORAGE_KEYS.INTEGRATION_PAYLOADS, JSON.stringify(initialIntegrationPayloads));
    
    // Xóa bộ nhớ tạm Google Sheet demo
    ['Tháng 1', 'Tháng 2', 'Tháng 3'].forEach(m => {
      localStorage.removeItem(`google_sheet_data_${m}`);
    });
    localStorage.removeItem('google_sheet_url');

    this.currentUser = initialUsers[0];
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, initialUsers[0].id);

    this.logAudit('PURGE_TRIAL_DATA', 'System', undefined, { 
      note: 'Đã dọn sạch toàn bộ dữ liệu dùng thử để áp dụng thực tế.' 
    });
    this.notify();
  }

  /**
   * Nạp lại dữ liệu dùng thử mẫu (dùng cho đào tạo hoặc thử nghiệm tính năng)
   */
  public loadSampleDemoData() {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(sampleDemoData.initialTasks));
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(sampleDemoData.initialDocuments));
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(sampleDemoData.initialUsers));
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(sampleDemoData.initialNotifications));
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(sampleDemoData.initialAuditLogs));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sampleDemoData.initialSettings));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(sampleDemoData.initialShifts));
    localStorage.setItem(STORAGE_KEYS.WORK_TASK_ROWS, JSON.stringify(sampleDemoData.initialWorkTaskRows));
    localStorage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(sampleDemoData.initialWeeklyMeetings));
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(sampleDemoData.initialChatMessages));
    localStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(sampleDemoData.initialChannels));
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(sampleDemoData.initialAnnouncements));
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(sampleDemoData.initialEquipment));
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(sampleDemoData.initialRooms));
    localStorage.setItem(STORAGE_KEYS.STAFF_PROFILES, JSON.stringify(sampleDemoData.initialStaffProfiles));
    localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(sampleDemoData.initialLeaveRequests));
    localStorage.setItem(STORAGE_KEYS.TRAINING_COURSES, JSON.stringify(sampleDemoData.initialTrainingCourses));
    localStorage.setItem(STORAGE_KEYS.MEETING_ITEMS, JSON.stringify(sampleDemoData.initialMeetings));
    localStorage.setItem(STORAGE_KEYS.INTEGRATION_ENDPOINTS, JSON.stringify(sampleDemoData.initialIntegrationEndpoints));
    localStorage.setItem(STORAGE_KEYS.INTEGRATION_PAYLOADS, JSON.stringify(sampleDemoData.initialIntegrationPayloads));

    this.currentUser = sampleDemoData.initialUsers[0];
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, sampleDemoData.initialUsers[0].id);

    this.logAudit('LOAD_SAMPLE_DATA', 'System', undefined, { 
      note: 'Đã nạp lại bộ dữ liệu dùng thử mẫu để minh họa tính năng.' 
    });
    this.notify();
  }

  // Khôi phục mặc định (tương đương dọn sạch sang chế độ thực tế)
  public resetToDefault() {
    this.purgeAllTrialData();
  }
}

export const storageService = new HospitalStorageService();
