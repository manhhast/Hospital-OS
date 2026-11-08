import { 
  TaskItem, DocumentItem, User, NotificationLog, AuditLogItem, AppSettings,
  ShiftDuty, WorkTaskRow, WeeklyMeeting, ChatChannelMessage, ChatGroupChannel, DepartmentAnnouncement,
  EquipmentItem, ParaclinicalRoom, StaffProfile, LeaveRequest, TrainingCourse,
  MeetingItem, IntegrationEndpoint, IntegrationPayloadSample
} from '../types/hospital';

// ==============================================================================
// HOSPITAL-OS: DỮ LIỆU THỰC TẾ (PRODUCTION CLEAN STATE)
// Đã loại bỏ hoàn toàn các dữ liệu dùng thử / demo giả lập.
// Chỉ giữ lại tài khoản Quản trị viên (Admin) mặc định và cấu hình chuẩn để bắt đầu vận hành.
// ==============================================================================

/**
 * Tài khoản Quản trị viên hệ thống ban đầu (Super Admin)
 * Mật khẩu mặc định: admin (có thể đổi ngay sau khi đăng nhập)
 */
export const ADMIN_DEFAULT_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none"><rect width="120" height="120" rx="32" fill="%231e1b4b"/><rect x="1.5" y="1.5" width="117" height="117" rx="30.5" stroke="%234338ca" stroke-width="2" stroke-opacity="0.6"/><path d="M60 22 C76 22 88 28 88 28 C88 56 78 78 60 92 C42 78 32 56 32 28 C32 28 44 22 60 22 Z" fill="%232563eb" fill-opacity="0.25" stroke="%2338bdf8" stroke-width="3" stroke-linejoin="round"/><circle cx="60" cy="52" r="14" fill="%230f172a" stroke="%2338bdf8" stroke-width="2.5"/><path d="M54 48 L58 52 L54 56" stroke="%2338bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="62" y1="56" x2="68" y2="56" stroke="%23e2e8f0" stroke-width="2" stroke-linecap="round"/><path d="M51 72 H69 M54 77 H66 M57 82 H63" stroke="%2393c5fd" stroke-width="2.5" stroke-linecap="round"/><circle cx="84" cy="36" r="6" fill="%2310b981"/><circle cx="84" cy="36" r="3" fill="%23ffffff"/></svg>`;

export const initialUsers: User[] = [
  {
    id: 'USR-ADMIN',
    name: 'Quản trị viên Hệ thống',
    email: 'admin@hospital.vn',
    role: 'Admin',
    title: 'Quản trị ứng dụng',
    department: 'Bộ phận CNTT & Quản trị Hệ thống',
    avatar: ADMIN_DEFAULT_AVATAR,
    telegramChatId: '',
    phone: '0900000000',
    status: 'Active',
    password: 'admin',
    room: 'Phòng Máy Chủ & Quản trị Hệ thống'
  }
];

// Lịch trực ca rỗng (sẵn sàng tạo lịch thật)
export const initialShifts: ShiftDuty[] = [];

// Bảng công việc tuần rỗng
export const initialWorkTaskRows: WorkTaskRow[] = [];

// Lịch họp giao ban rỗng
export const initialWeeklyMeetings: WeeklyMeeting[] = [];

// Danh sách công việc rỗng
export const initialTasks: TaskItem[] = [];

// Danh mục văn bản & chứng chỉ rỗng
export const initialDocuments: DocumentItem[] = [];

// Các nhóm trao đổi nội bộ tiêu chuẩn của khoa
export const initialChannels: ChatGroupChannel[] = [
  {
    id: 'ch-announcements',
    name: 'Thông Báo Chung Khoa',
    description: 'Kênh phát đi các chỉ đạo, văn bản và thông báo chính thức của Ban chủ nhiệm',
    type: 'announcement',
    members: ['USR-ADMIN'],
    admins: ['USR-ADMIN'],
    createdBy: 'USR-ADMIN',
    createdAt: new Date().toISOString()
  },
  {
    id: 'ch-emergency',
    name: 'Trực Ban & Cấp Cứu',
    description: 'Kênh điều phối các ca khẩn cấp và báo cáo giao ban ca trực',
    type: 'group',
    members: ['USR-ADMIN'],
    admins: ['USR-ADMIN'],
    createdBy: 'USR-ADMIN',
    createdAt: new Date().toISOString()
  },
  {
    id: 'ch-tech-equipment',
    name: 'Kỹ Thuật & Thiết Bị Máy',
    description: 'Kênh tiếp nhận sự cố kỹ thuật máy móc và thông báo bảo trì',
    type: 'group',
    members: ['USR-ADMIN'],
    admins: ['USR-ADMIN'],
    createdBy: 'USR-ADMIN',
    createdAt: new Date().toISOString()
  }
];

// Thông báo khoa rỗng
export const initialAnnouncements: DepartmentAnnouncement[] = [];

// Tin nhắn trao đổi rỗng
export const initialChatMessages: ChatChannelMessage[] = [];

// Thông báo hệ thống rỗng
export const initialNotifications: NotificationLog[] = [];

// Nhật ký hệ thống khởi đầu
export const initialAuditLogs: AuditLogItem[] = [
  {
    id: 'AUD-001',
    userEmail: 'admin@hospital.vn',
    userName: 'Quản trị viên Hệ thống',
    userRole: 'Admin',
    action: 'Khởi tạo hệ thống thực tế',
    module: 'System',
    timestamp: new Date().toISOString(),
    ipAddress: '127.0.0.1',
    device: 'System Web Client'
  }
];

// Cấu hình tham số hệ thống thực tế (sạch)
export const initialSettings: AppSettings = {
  telegramBotToken: '',
  defaultTelegramChatId: '',
  googleDriveFolderId: '',
  googleSheetUrl: '',
  reportGoogleSheetId: '',
  googleSheetName: 'CLS_Database',
  googleSheetId: '',
  smtpServer: 'smtp.gmail.com',
  smtpPort: 587,
  smtpUser: '',
  theme: 'light',
  language: 'vi',
  debugMode: false,
  cacheTtlMinutes: 10,
  lockTimeoutMs: 30000
};

// Danh sách thiết bị rỗng (sẵn sàng nhập máy móc thực tế của viện hoặc nạp từ file Excel)
export const initialEquipment: EquipmentItem[] = [];

// Danh sách phòng chuyên môn cận lâm sàng tiêu chuẩn
export const initialRooms: ParaclinicalRoom[] = [
  {
    id: 'RM-XQ-01',
    code: 'P-XQ-01',
    name: 'Phòng Chụp X-Quang Kỹ Thuật Số',
    departmentSection: 'Chẩn đoán hình ảnh',
    floor: 'Tầng 1 - Khu Cận Lâm Sàng',
    maxCapacityCasesPerDay: 80,
    currentDayCases: 0,
    utilizationRate: 0,
    status: 'Đang hoạt động',
    primaryEquipment: '',
    managerInCharge: 'Quản trị viên Hệ thống',
    reservations: []
  },
  {
    id: 'RM-SA-01',
    code: 'P-SA-01',
    name: 'Phòng Siêu Âm Tổng Quát & Màu',
    departmentSection: 'Thăm dò chức năng',
    floor: 'Tầng 1 - Khu Cận Lâm Sàng',
    maxCapacityCasesPerDay: 60,
    currentDayCases: 0,
    utilizationRate: 0,
    status: 'Đang hoạt động',
    primaryEquipment: '',
    managerInCharge: 'Quản trị viên Hệ thống',
    reservations: []
  },
  {
    id: 'RM-XN-01',
    code: 'P-XN-01',
    name: 'Phòng Lấy Mẫu Xét Nghiệm',
    departmentSection: 'Xét nghiệm',
    floor: 'Tầng 1 - Khu Cận Lâm Sàng',
    maxCapacityCasesPerDay: 150,
    currentDayCases: 0,
    utilizationRate: 0,
    status: 'Đang hoạt động',
    primaryEquipment: '',
    managerInCharge: 'Quản trị viên Hệ thống',
    reservations: []
  }
];

// Danh sách hồ sơ nhân sự rỗng
export const initialStaffProfiles: StaffProfile[] = [];

// Danh sách đơn nghỉ phép rỗng
export const initialLeaveRequests: LeaveRequest[] = [];

// Danh sách khóa đào tạo rỗng
export const initialTrainingCourses: TrainingCourse[] = [];

// Danh sách lịch họp rỗng
export const initialMeetings: MeetingItem[] = [];

// Cổng tích hợp y tế chuẩn sẵn sàng cấu hình
export const initialIntegrationEndpoints: IntegrationEndpoint[] = [
  {
    id: 'EP-HIS',
    systemName: 'HIS',
    protocol: 'REST API',
    endpointUrl: 'https://api.hospital.vn/his/v1/workload',
    status: 'Connected',
    lastSyncAt: 'Chưa đồng bộ',
    latencyMs: 12,
    totalRequestsToday: 0,
    errorCountToday: 0
  },
  {
    id: 'EP-LIS',
    systemName: 'LIS',
    protocol: 'HL7 v2.5',
    endpointUrl: 'https://api.hospital.vn/lis/v1/results',
    status: 'Connected',
    lastSyncAt: 'Chưa đồng bộ',
    latencyMs: 8,
    totalRequestsToday: 0,
    errorCountToday: 0
  },
  {
    id: 'EP-PACS',
    systemName: 'PACS',
    protocol: 'DICOM Web',
    endpointUrl: 'https://api.hospital.vn/pacs/dicom/v2',
    status: 'Connected',
    lastSyncAt: 'Chưa đồng bộ',
    latencyMs: 18,
    totalRequestsToday: 0,
    errorCountToday: 0
  }
];

// Danh sách payload mẫu rỗng
export const initialIntegrationPayloads: IntegrationPayloadSample[] = [];
