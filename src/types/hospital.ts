export type UserRole = 'Admin' | 'Manager' | 'Doctor' | 'Staff';
export type ManagementTier = 'admin' | 'department_head' | 'section_head' | 'room_head' | 'staff';
export type CLSTitle =
  | 'Quản trị ứng dụng'
  | 'Quản trị hệ thống'
  | 'Trưởng khoa'
  | 'Phó khoa'
  | 'Trưởng bộ phận'
  | 'Trưởng phòng'
  | 'KTV trưởng'
  | 'Điều dưỡng trưởng'
  | 'Bác sĩ'
  | 'Kỹ thuật viên'
  | 'Nhân viên'
  | (string & {});

export interface UserPermissionOverrides {
  canCreateStaff?: boolean;
  canEditStaff?: boolean;
  canDeleteStaff?: boolean;
  canManageCertificates?: boolean;
  canCreateEquipment?: boolean;
  canEditEquipment?: boolean;
  canDeleteEquipment?: boolean;
  canLogMaintenanceRepair?: boolean;
  canReportEquipmentIssue?: boolean;
  canLockoutEquipment?: boolean;
  canManageRoomsDepartments?: boolean;
  canApproveLeave?: boolean;
  canConfigureRBAC?: boolean;
  allowCrossScopeEdit?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title?: CLSTitle;
  department: string; // e.g. "Khoa Cận Lâm Sàng - Bộ phận Xét nghiệm", "Khoa Cận Lâm Sàng - Chẩn đoán hình ảnh"
  avatar: string;
  telegramChatId?: string;
  phone?: string;
  status: 'Active' | 'Inactive';
  password?: string;
  hasPassword?: boolean;
  resetRequested?: boolean;
  resetRequestNote?: string;
  room?: string; // e.g. "Phòng Xét nghiệm Tầng 2"
  managementLevel?: ManagementTier;
  managedDepartments?: string[];
  managedRooms?: string[];
  permissionOverrides?: UserPermissionOverrides;
}

export type TaskPriority = 'Thấp' | 'Trung bình' | 'Cao' | 'Khẩn cấp';
export type TaskStatus = 'Chờ xử lý' | 'Đang thực hiện' | 'Đã hoàn thành' | 'Hủy';
export type TaskType = 'Xét nghiệm khẩn' | 'Chẩn đoán hình ảnh' | 'Bảo trì thiết bị' | 'Kiểm chuẩn ISO' | 'Hội chẩn' | 'Đào tạo' | 'Hành chính' | 'Khác';
export type TaskRecurrence = 'Không' | 'Hàng ngày' | 'Hàng tuần' | 'Hàng tháng';

export interface TaskAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  createdDate: string; // YYYY-MM-DD HH:mm
  updatedDate: string; // YYYY-MM-DD HH:mm
  creator: string;
  assignee: string;
  assigneeEmail: string;
  telegramChatId: string;
  taskType: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  level: string; // e.g. "Bộ phận Xét nghiệm", "Bộ phận CĐHA"
  recurrence: TaskRecurrence;
  recurrenceCount: number;
  notes: string;
  attachments: TaskAttachment[];
  tags?: string[];
  reporter?: string;
  createdAt?: string;
}

export type DocType = 'Phiếu kiểm chuẩn' | 'Quy trình SOP' | 'Giấy chứng nhận' | 'Báo cáo ISO' | 'Hợp đồng bảo trì' | 'Hồ sơ bệnh án' | 'Khác';
export type DocExtension = 'PDF' | 'DOCX' | 'XLSX' | 'PPTX' | 'PNG' | 'JPG' | 'ZIP' | 'RAR' | 'MP4' | 'MP3';

export interface DocVersion {
  version: string;
  updatedAt: string;
  updatedBy: string;
  note: string;
  fileUrl: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  docType: DocType;
  fileExtension: DocExtension;
  fileSize: number; // bytes
  driveFileId: string;
  driveUrl: string;
  uploadDate: string;
  expirationDate: string | null; // YYYY-MM-DD
  isExpired: boolean;
  version: string; // e.g. "v1.2"
  versionHistory: DocVersion[];
  tags: string[];
  owner: string;
  note: string;
  code?: string; // Mã hiệu hồ sơ e.g. SOP-CLS-01
  syncStatus?: 'synced' | 'pending' | 'syncing' | 'failed';
  lastSyncedAt?: string;
  checksum?: string;
  driveFolderId?: string;
  rawFileData?: string;
  isUserUploaded?: boolean;
}

export type WorkType = 'Ca trực' | 'Làm việc' | 'Họp' | 'Đào tạo' | 'Nghỉ';
export type ScheduleColor = 'Đỏ' | 'Xanh' | 'Cam' | 'Tím' | 'Xám';

export interface ShiftSwapRequest {
  id: string;
  shiftId: string;
  shiftTitle: string;
  shiftDate: string;
  requesterId: string;
  requesterName: string;
  targetUserId: string;
  targetUserName: string;
  status: 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối';
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface ShiftDuty {
  id: string;
  title?: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  shiftName?: string;
  shiftType?: string;
  shiftTime?: string;
  roleInShift?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  assignedRole?: string;
  userId?: string;
  userName?: string;
  userTitle?: string;
  phone?: string;
  room?: string;
  roomLocation?: string;
  machine?: string; // Máy xét nghiệm / CĐHA e.g. Cobas 8000, MRI 3.0T
  department?: string; // Khoa e.g. Khoa Cận Lâm Sàng
  workType?: WorkType; // Ca trực | Làm việc | Họp | Đào tạo | Nghỉ
  priority?: TaskPriority; // Khẩn cấp | Cao | Trung bình | Thấp
  color?: ScheduleColor; // Đỏ | Xanh | Cam | Tím | Xám
  status?: string;
  isCurrentlyActive?: boolean;
  notes?: string;
  attachments?: TaskAttachment[];
  recurrence?: TaskRecurrence; // 'Không' | 'Hàng ngày' | 'Hàng tuần' | 'Hàng tháng'
  taskRowId?: string; // Links shift to a custom work task row
  swapRequest?: ShiftSwapRequest;
}

export interface WorkTaskRow {
  id: string;
  name: string; // Customizable task/job name
  workType: WorkType;
  room?: string;
  machine?: string;
  defaultTime?: string;
  color?: ScheduleColor;
  notes?: string;
  createdAt?: string;
}

export interface WeeklyMeeting {
  id: string;
  title: string;
  date?: string;
  dayOfWeek?: string;
  time?: string;
  location?: string;
  chairperson?: string;
  participants?: string;
  type?: string;
  status?: string;
  notes?: string;
  description?: string;
}

// --- Equipment / Machine Management ---
export type EquipmentStatus = 'Hoạt động tốt' | 'Cần bảo trì' | 'Sự cố hỏng hóc' | 'Đang hiệu chuẩn' | 'Tạm ngưng';

export interface MaintenanceLog {
  id: string;
  equipmentId: string;
  equipmentName: string;
  date: string;
  type: 'Định kỳ' | 'Đột xuất' | 'Hiệu chuẩn' | 'Sửa chữa';
  performedBy: string;
  result: 'Đạt' | 'Cần theo dõi' | 'Không đạt';
  notes: string;
  nextDueDate?: string;
  cost?: number;
}

export interface RepairLog {
  id: string;
  equipmentId: string;
  equipmentName: string;
  issueDescription: string;
  reportedBy: string;
  reportedAt: string;
  resolvedAt?: string;
  replacedParts?: string;
  cost?: number;
  status: 'Đang xử lý' | 'Đã khôi phục' | 'Chờ linh kiện';
  technician?: string;
}

export interface SafetyViolationItem {
  id: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  room: string;
  category: string;
  severity: 'CRITICAL' | 'WARNING' | 'ATTENTION';
  violationType: 'ATBX_EXPIRED' | 'ISO_CALIB_EXPIRED' | 'MAINTENANCE_OVERDUE' | 'BROKEN_ACTIVE_CASES' | 'PERMIT_EXPIRED';
  title: string;
  description: string;
  regulatoryAgency: string; // e.g. "Cục An toàn Bức xạ và Hạt nhân" | "Bộ Y Tế / ISO 15189" | "Viện Trang Thiết Bị Y Tế"
  activeCasesToday: number;
  monthlyCases: number;
  detectedAt: string;
  assignedTechnician: string;
  managerInCharge: string;
  isLockedOut?: boolean;
  alertSentTelegram?: boolean;
  alertSentEmail?: boolean;
}

export interface OeeMetricItem {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  category: string;
  availability: number; // 0 - 100%
  performance: number;  // 0 - 100%
  quality: number;      // 0 - 100%
  oee: number;          // 0 - 100% (A * P * Q)
  oeeRating: 'World Class' | 'Tốt / Đạt chuẩn' | 'Khá / Trung bình' | 'Cần cải tiến';
  plannedHours: number;
  runTimeHours: number;
  idleTimeHours: number;
  downtimeHours: number;
  qcHours: number;
  totalCasesProcessed: number;
  cycleTimePerCaseMinutes: number;
  goodCasesPercentage: number;
}

export interface ReliabilityMetricItem {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  mtbfHours: number; // Mean Time Between Failures
  mtbfDays: number;
  mttrHours: number; // Mean Time To Repair
  failureCount: number;
  uptimePercentage: number;
  reliabilityScore: number; // 0 - 100
  lastIncidentDate?: string;
  healthIndex: 'Tối ưu' | 'Bình thường' | 'Cảnh báo rủi ro';
}

export interface DepreciationMetricItem {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  purchasePrice: number;
  depreciationYears: number;
  monthlyDepreciation: number;
  averageMonthlyCases: number;
  depreciationCostPerCase: number;
  averageRevenuePerCase: number;
  depreciationPercentage: number;
  bookValueRemaining: number;
  yearsInService: number;
}

export interface EquipmentDurationDefaults {
  permitMonths: number;
  calibrationMonths: number;
  radiationSurveyMonths: number;
  maintenanceMonths: number;
}

export interface EquipmentItem {
  id: string;
  code: string;
  name: string;
  category: 'Chẩn đoán hình ảnh' | 'Xét nghiệm' | 'Nội soi' | 'Siêu âm' | 'Khác';
  model: string;
  manufacturer: string;
  originCountry?: string;
  yearOfManufacture?: number;
  serialNumber: string;
  room: string;
  assignedTechnician: string;
  managerInCharge?: string;
  status: EquipmentStatus;
  installationDate: string;
  purchaseDate?: string;
  purchasePrice?: number;
  supplier?: string;
  warrantyExpiry?: string;
  maintenanceIntervalMonths: number;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  operatingPermitNumber?: string;
  operatingPermitIssueDate?: string;
  operatingPermitDurationMonths?: number;
  operatingPermitExpiry?: string;
  radiationLicenseNumber?: string;
  radiationLicenseExpiry?: string;
  radiationLicenseIssuedBy?: string;
  radiationSurveyDate?: string;
  radiationSurveyIntervalMonths?: number;
  radiationSurveyExpiry?: string;
  calibrationNumber?: string;
  calibrationDate?: string;
  calibrationIntervalMonths?: number;
  calibrationExpiry?: string;
  calibrationIssuedBy?: string;
  powerSupply?: string;
  specifications?: string;
  notes?: string;
  maintenanceHistory?: MaintenanceLog[];
  repairHistory?: RepairLog[];
  isLockedOut?: boolean;
  lockoutReason?: string;
  lockoutDate?: string;
  depreciationYears?: number;
}

// --- Room Management ---
export interface RoomReservation {
  id: string;
  roomId: string;
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  doctorInCharge: string;
  technicianInCharge: string;
  status: 'Đã xác nhận' | 'Đang sử dụng' | 'Hoàn thành' | 'Hủy';
  equipmentUsed?: string;
  patientInfo?: string;
}

export interface DepartmentUnit {
  id: string;
  code: string;
  name: string;
  description?: string;
  managerName?: string;
  createdAt?: string;
}

export interface ParaclinicalRoom {
  id: string;
  code: string;
  name: string;
  departmentSection: 'Chẩn đoán hình ảnh' | 'Xét nghiệm' | 'Thăm dò chức năng' | 'Hành chính Khoa' | 'Khác' | string;
  floor: string;
  maxCapacityCasesPerDay: number;
  currentDayCases: number;
  utilizationRate: number;
  status: 'Đang hoạt động' | 'Bảo trì' | 'Quá tải' | 'Tạm nghỉ' | 'Tạm ngưng';
  primaryEquipment: string;
  managerInCharge: string;
  deputyManager?: string;
  phoneExtension?: string;
  description?: string;
  establishedDate?: string;
  reservations?: RoomReservation[];
}

// --- HR / Staff / Certificates & Training ---
export interface MedicalCertificate {
  id: string;
  name: string;
  code: string;
  issuedBy: string;
  issuedDate: string;
  expiryDate: string;
  status: 'Còn hiệu lực' | 'Sắp hết hạn' | 'Hết hiệu lực';
  fileUrl?: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  leaveType: 'Phép năm' | 'Nghỉ ốm' | 'Nghỉ thai sản' | 'Học tập' | 'Nghỉ không lương';
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  substituteUserId?: string;
  substituteUserName?: string;
  status: 'Chờ duyệt' | 'Đã phê duyệt' | 'Từ chối';
  approvedBy?: string;
  createdAt: string;
}

export interface TrainingCourse {
  id: string;
  title: string;
  category: 'CME' | 'An toàn sinh học' | 'Vận hành thiết bị' | 'ISO 15189' | 'Khác';
  trainer: string;
  location: string;
  startDate: string;
  endDate: string;
  creditsOrHours: string;
  targetAudience: string;
  enrolledUsers: string[];
  status: 'Sắp diễn ra' | 'Đang diễn ra' | 'Đã hoàn thành';
}

export type EmploymentStatus = 'Đang làm việc' | 'Đang thử việc' | 'Nghỉ không lương' | 'Nghỉ thai sản' | 'Đã nghỉ việc';

export interface WorkStatusHistoryItem {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD hoặc 'Hiện tại'
  status: EmploymentStatus;
  departmentSection: string; // Bộ phận/Khoa
  room?: string; // Phòng làm việc cụ thể
  positionOrTitle?: string; // Chức danh / vị trí
  note?: string; // Ghi chú
  updatedBy?: string;
  createdAt?: string;
}

export interface StaffProfile {
  userId: string;
  fullName: string;
  title: string;
  role: string;
  departmentSection: string;
  room?: string;
  phone?: string;
  email?: string;
  dob?: string; // YYYY-MM-DD - Ngày sinh
  gender?: 'Nam' | 'Nữ' | 'Khác'; // Giới tính
  avatar?: string;
  specialty: string;
  educationLevel?: 'Trên Đại học' | 'Đại học' | 'Cao đẳng' | 'Trung cấp' | string;
  experienceYears: number;
  joinDate?: string; // YYYY-MM-DD - Ngày vào làm
  degrees: string[];
  certificates: MedicalCertificate[];
  totalShiftsThisMonth: number;
  leaveBalanceDays: number;
  currentStatus?: EmploymentStatus;
  statusHistory?: WorkStatusHistoryItem[];
  managementLevel?: ManagementTier;
  managedDepartments?: string[];
  managedRooms?: string[];
  permissionOverrides?: UserPermissionOverrides;
}

// --- Meeting Management & Action Items ---
export interface MeetingActionItem {
  id: string;
  taskTitle: string;
  assigneeName: string;
  assigneeId?: string;
  dueDate: string;
  priority: 'Cao' | 'Trung bình' | 'Thấp';
  status: 'Chưa giao' | 'Đã giao thành task' | 'Đã hoàn thành';
  createdTaskId?: string;
}

export interface MeetingMinutes {
  id: string;
  summary: string;
  keyDiscussions: string[];
  conclusions: string[];
  actionItems: MeetingActionItem[];
  recordedBy: string;
  approvedBy: string;
}

export interface MeetingItem {
  id: string;
  title: string;
  category: 'Giao ban khoa' | 'Hội chẩn ca khó' | 'Hội đồng ISO' | 'Họp chuyên môn' | 'Khác';
  date: string;
  time: string;
  location: string;
  chairperson: string;
  secretary: string;
  attendees: string[];
  status: 'Sắp diễn ra' | 'Đang diễn ra' | 'Đã hoàn thành' | 'Hủy';
  agenda: string;
  minutes?: MeetingMinutes;
  attachments?: TaskAttachment[];
}

// --- Integration Hub (HIS/LIS/PACS) ---
export interface IntegrationEndpoint {
  id: string;
  systemName: 'HIS' | 'LIS' | 'PACS' | 'Telegram Bot' | 'Google Workspace';
  protocol: 'REST API' | 'HL7 v2.5' | 'DICOM Web' | 'FHIR R4' | 'Webhook';
  endpointUrl: string;
  status: 'Connected' | 'Standby' | 'Error';
  lastSyncAt: string;
  latencyMs: number;
  totalRequestsToday: number;
  errorCountToday: number;
}

export interface IntegrationPayloadSample {
  id: string;
  system: string;
  eventType: string;
  direction: 'INBOUND' | 'OUTBOUND';
  timestamp: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  payloadJson: string;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'excel' | 'zip' | 'share_card' | 'announcement' | 'sticker';

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[]; // names or userIds
}

export interface ShareCardData {
  type: 'task' | 'document' | 'schedule' | 'link' | 'file' | 'image';
  id?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  url?: string;
  metadata?: Record<string, string>;
}

export interface ThreadReply {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  avatar: string;
  content: string;
  timestamp: string;
  reactions?: MessageReaction[];
}

export interface ChatChannelMessage {
  id: string;
  channelId?: string; // e.g. "toan-khoa", "bac-si", "may-ct", etc.
  channelName?: string;
  dmUserId?: string; // for direct 1-on-1 chats
  dmUserName?: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  avatar: string;
  content: string;
  timestamp: string;
  isUnread?: boolean;
  isRead?: boolean;
  readBy?: string[]; // userIds who read this
  msgType?: MessageType;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  isPinned?: boolean;
  isSaved?: boolean;
  isUrgent?: boolean;
  mentions?: string[]; // user names or userIds
  reactions?: MessageReaction[];
  shareCard?: ShareCardData;
  replies?: ThreadReply[];
  editedAt?: string;
  editHistory?: string[];
  isDeleted?: boolean;
  attachments?: string[];
}

export interface ChatGroupChannel {
  id: string;
  name: string;
  type: 'group' | 'dm' | 'announcement';
  description: string;
  icon?: string;
  members: string[]; // userIds
  admins: string[]; // userIds
  isDefault?: boolean;
  isCustom?: boolean;
  createdAt?: string;
  createdBy?: string;
  unreadCount?: number;
}

export type AnnouncementCategory = 'Toàn khoa' | 'Nhóm' | 'Thông báo khẩn' | 'Lịch họp' | 'Đổi lịch trực' | 'Công việc';

export interface DepartmentAnnouncement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  senderId: string;
  senderName: string;
  senderRole: string;
  createdAt: string;
  isUrgent: boolean;
  targetGroup?: string;
  attachments?: TaskAttachment[];
  reactions?: MessageReaction[];
  comments?: ThreadReply[];
  isPinned?: boolean;
}

export type NotificationChannel = 'Email' | 'Telegram' | 'In-App';
export type NotificationStatus = 'Đã gửi' | 'Thất bại' | 'Chờ gửi';

export interface NotificationLog {
  id: string;
  recipient: string;
  targetAddress: string;
  title: string;
  content: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  sentAt: string;
  errorMessage?: string;
}

export interface ReportSheetYearConfig {
  url: string;
  sheetId: string;
  updatedAt?: string;
}

export type AssistantMemoryCategory = 'fact' | 'preference' | 'rule' | 'correction';

export interface AssistantMemoryItem {
  id: string;
  category: AssistantMemoryCategory;
  content: string;
  source: 'auto' | 'user' | 'feedback' | 'telegram';
  createdAt: string;
  updatedAt?: string;
}

export type ScheduledAlertRuleId = 'morning_0700' | 'noon_services_1245' | 'evening_1700';
export type ScheduledAlertChannel = 'telegram_and_inapp' | 'telegram' | 'inapp';

export interface ScheduledAlertRuleConfig {
  id: ScheduledAlertRuleId;
  name: string;
  description: string;
  enabled: boolean;
  timeHHmm: string; // HH:mm in Asia/Ho_Chi_Minh (e.g. "07:00", "12:45", "17:00")
  channel: ScheduledAlertChannel;
  equipmentWarningDays?: number;
  customChatId?: string;
}

export interface ScheduledAlertHistoryItem {
  id: string;
  ruleId: ScheduledAlertRuleId;
  ruleName: string;
  targetDateVN: string;
  triggeredAt: string;
  triggerMode: 'auto_schedule' | 'manual_test';
  status: 'success' | 'partial' | 'error' | 'skipped';
  telegramSent: boolean;
  inAppSaved: boolean;
  summary: string;
  errorMessage?: string;
  hostLabel?: string;
}

export interface ScheduledAlertPreviewResult {
  ruleId: ScheduledAlertRuleId;
  ruleName: string;
  targetDateVN: string;
  generatedAtVN: string;
  title: string;
  telegramMarkdown: string;
  inAppSummary: string;
  stats: Array<{
    label: string;
    value: string;
    tone?: 'neutral' | 'good' | 'warn' | 'danger';
  }>;
  dataSourceNotes: string[];
}

export interface AppSettings {
  telegramBotToken: string;
  hasTelegramBotToken?: boolean;
  telegramBotTokenHint?: string;
  defaultTelegramChatId: string;
  telegramQaEnabled?: boolean;
  aiWebSearchEnabled?: boolean;
  assistantMemories?: AssistantMemoryItem[];
  scheduledAlertsConfig?: ScheduledAlertRuleConfig[];
  googleDriveFolderId: string;
  // 1. Google Sheet Báo Cáo Số Ca (Case Reports Data)
  reportSheetYear?: number;
  archivedReportYears?: number[];
  reportGoogleSheetsByYear?: Record<string, ReportSheetYearConfig>;
  googleSheetUrl?: string;
  reportGoogleSheetId?: string;
  // 2. Google Sheet Cơ Sở Dữ Liệu Lưu ID Tệp Tải Lên (File & Document Indexing)
  googleSheetName: string;
  googleSheetId: string;
  smtpServer: string;
  smtpPort: number;
  smtpUser: string;
  theme: 'light' | 'dark' | 'system';
  language: 'vi' | 'en';
  debugMode: boolean;
  cacheTtlMinutes: number;
  lockTimeoutMs: number;
}

export interface AuditLogItem {
  id: string;
  userEmail: string;
  userName: string;
  userRole: UserRole;
  action: string;
  module: 'Task' | 'Document' | 'User' | 'Shift' | 'Setting' | 'System' | 'Equipment' | 'Room' | 'HR' | 'Meeting' | 'Integration';
  timestamp: string;
  ipAddress: string;
  device: string;
  oldData?: string;
  newData?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface GASFileCode {
  filename: string;
  type: 'backend' | 'frontend';
  language: 'javascript' | 'html' | 'css';
  description: string;
  code: string;
}

export type SyncHistoryTrigger = 'startup_3d_auto' | 'manual_3d' | 'manual_range_audit';
export type SyncHistoryStatus = 'success' | 'discrepancy_alert' | 'no_change' | 'error';

export interface SyncHistoryDiscrepancyItem {
  id: string;
  year: number;
  monthKey: string;
  day: number;
  dateLabel: string;
  category: string;
  serviceName: string;
  type: 'value_changed' | 'cleared_on_sheet' | 'new_from_sheet' | 'new_service';
  systemBh: number | string;
  systemNd: number | string;
  sheetBh: number | string;
  sheetNd: number | string;
  isManualLocked?: boolean;
  resolutionStatus?: 'pending' | 'updated_from_sheet' | 'kept_system';
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface SyncHistoryAutoWrittenItem {
  dateLabel: string;
  category: string;
  serviceName: string;
  bh: number | string;
  nd: number | string;
}

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  displayTime: string;
  trigger: SyncHistoryTrigger;
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  status: SyncHistoryStatus;
  checkedCellsCount: number;
  autoWrittenCount: number;
  discrepancyCount: number;
  updatedFromSheetCount: number;
  savedToDatabase?: boolean;
  databaseNote?: string;
  /** @deprecated Legacy alias kept optional for older local records */
  savedOnFirebase?: boolean;
  /** @deprecated Legacy alias kept optional for older local records */
  firebaseNote?: string;
  performedBy: string;
  summary: string;
  autoWrittenSamples?: SyncHistoryAutoWrittenItem[];
  discrepancies?: SyncHistoryDiscrepancyItem[];
}

