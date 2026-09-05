import { storageService } from './storageService';
import { 
  TaskItem, DocumentItem, EquipmentItem, ParaclinicalRoom, 
  StaffProfile, ShiftDuty, MeetingItem, User 
} from '../types/hospital';

export type SearchCategory = 
  | 'all'
  | 'documents'
  | 'tasks'
  | 'equipment'
  | 'rooms'
  | 'staff'
  | 'shifts'
  | 'meetings'
  | 'navigation';

export interface SearchResultItem {
  id: string;
  category: SearchCategory;
  categoryLabel: string;
  categoryColor: string; // Tailwind color class for tag
  title: string;
  subtitle: string;
  description?: string;
  code?: string;
  badge?: {
    text: string;
    variant: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate' | 'indigo';
  };
  tags?: string[];
  moduleTarget: string; // Target module to navigate to
  targetId?: string; // Specific item ID to open
  actionUrl?: string; // For documents download / preview
  metadata?: Record<string, any>;
  score: number; // Relevance score
}

// Utility: Normalize Vietnamese text for diacritic-insensitive & accent-insensitive search
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// Medical synonyms and acronym dictionary for intelligent expansion
const MEDICAL_SYNONYMS: Record<string, string[]> = {
  sop: ['quy trinh', 'tieu chuan', 'iso', 'quy trinh chuan', 'huong dan'],
  iso: ['15189', 'chat luong', 'kiem dinh', 'kiem chuan', 'ngoai kiem', 'eqa', 'iqc'],
  mri: ['cong huong tu', 'signa', 'ge', 'p-102', 'tu truong', '3.0 tesla'],
  ct: ['msct', 'cat lop', 'somatom', '128', 'siemens', 'p-101', 'mach mau'],
  msct: ['ct', 'cat lop vi tinh', 'somatom', '128 dai'],
  xq: ['x-quang', 'xquang', 'buc xa', 'kts', 'chup phim', 'p-201'],
  'x-quang': ['xq', 'xquang', 'kts', 'chup phim', 'buc xa'],
  xn: ['xet nghiem', 'lab', 'sinh hoa', 'huyet hoc', 'vi sinh', 'cobas'],
  'xet nghiem': ['xn', 'lab', 'sinh hoa', 'huyet hoc', 'vi sinh', 'mieng dich', 'cobas', 'sysmex'],
  cdha: ['chan doan hinh anh', 'mri', 'ct', 'msct', 'x-quang', 'sieu am'],
  'chan doan hinh anh': ['cdha', 'mri', 'ct', 'msct', 'x-quang', 'sieu am'],
  bs: ['bac si', 'doctor', 'truong khoa', 'pho khoa', 'hoi chan'],
  'bac si': ['bs', 'doctor', 'chuyen gia', 'hoi chan'],
  ktv: ['ky thuat vien', 'technician', 'van hanh', 'chup phim'],
  'ky thuat vien': ['ktv', 'technician', 'van hanh'],
  qc: ['kiem chuan', 'noi kiem', 'ngoai kiem', 'iqc', 'eqa', 'hieu chuan'],
  p101: ['p-101', 'ct', 'msct', 'somatom'],
  p102: ['p-102', 'mri', 'cong huong tu'],
  p201: ['p-201', 'x-quang', 'xquang'],
  p301: ['p-301', 'xet nghiem', 'sinh hoa', 'roche']
};

export class MedicalSearchEngine {
  private static instance: MedicalSearchEngine;

  public static getInstance(): MedicalSearchEngine {
    if (!MedicalSearchEngine.instance) {
      MedicalSearchEngine.instance = new MedicalSearchEngine();
    }
    return MedicalSearchEngine.instance;
  }

  // System navigation shortcuts
  private readonly navigationModules: Array<{
    id: string;
    title: string;
    description: string;
    keywords: string[];
    module: string;
  }> = [
    {
      id: 'nav-dashboard',
      title: 'Tổng Quan Dashboard',
      description: 'Chỉ số KPI, biểu đồ năng suất xét nghiệm, cảnh báo khẩn và tổng quan khoa',
      keywords: ['dashboard', 'tong quan', 'kpi', 'bieu do', 'thong ke', 'trang chu', 'home'],
      module: 'dashboard'
    },
    {
      id: 'nav-tasks',
      title: 'Quản Lý Công Việc & Y Lệnh',
      description: 'Giao việc, theo dõi tiến độ, kiểm chuẩn ISO, bảo trì thiết bị và chỉ định cận lâm sàng',
      keywords: ['cong viec', 'task', 'y lenh', 'giao viec', 'tien do', 'kiem chuan', 'bao tri'],
      module: 'tasks'
    },
    {
      id: 'nav-documents',
      title: 'Hồ Sơ & Quy Trình SOP / ISO',
      description: 'Quản lý tài liệu chuẩn, sổ tay chất lượng SOP-CLS, chứng chỉ ISO 15189, biểu mẫu',
      keywords: ['tai lieu', 'ho so', 'sop', 'iso', '15189', 'bieu mau', 'quy trinh', 'van ban', 'doc'],
      module: 'documents'
    },
    {
      id: 'nav-equipment',
      title: 'Quản Lý Máy Móc & Thiết Bị Y Tế',
      description: 'Danh mục trang thiết bị, tình trạng hoạt động, nhật ký bảo trì, hiệu chuẩn máy',
      keywords: ['may moc', 'thiet bi', 'equipment', 'mri', 'ct', 'x-quang', 'cobas', 'sysmex', 'bao tri'],
      module: 'equipment'
    },
    {
      id: 'nav-rooms',
      title: 'Phòng / Bộ Phận Trực Thuộc Khoa',
      description: 'Cơ cấu phòng ban, sơ đồ phòng máy, phân bổ nhân sự và điều phối nguồn lực',
      keywords: ['phong', 'bo phan', 'room', 'p-101', 'p-102', 'p-201', 'p-301', 'khu vuc', 'so do'],
      module: 'rooms'
    },
    {
      id: 'nav-hr',
      title: 'Nhân Sự & Đào Tạo Khoa CLS',
      description: 'Hồ sơ cán bộ y tế, bác sĩ, kỹ thuật viên, phân quyền, chứng chỉ và khóa đào tạo',
      keywords: ['nhan su', 'dao tao', 'staff', 'hr', 'bac si', 'ktv', 'chung chi', 'nghi phep'],
      module: 'hr'
    },
    {
      id: 'nav-schedule',
      title: 'Lịch Trực & Ca Công Tác',
      description: 'Lịch trực 24/7, ca sáng/chiều/đêm, phân công vị trí máy và đổi ca trực',
      keywords: ['lich truc', 'ca truc', 'shift', 'schedule', 'phan cong', 'doi ca', 'lich lam viec'],
      module: 'schedule'
    },
    {
      id: 'nav-meetings',
      title: 'Cuộc Họp & Hội Chẩn Chuyên Môn',
      description: 'Lịch giao ban khoa, hội chẩn liên viện, họp đánh giá ISO và biên bản kết luận',
      keywords: ['cuoc hop', 'hoi chan', 'meeting', 'giao ban', 'bien ban', 'ket luan'],
      module: 'meetings'
    },
    {
      id: 'nav-reports',
      title: 'Báo Cáo & Thống Kê Năng Suất',
      description: 'Phân tích sản lượng xét nghiệm, công suất chụp phim, báo cáo chất lượng',
      keywords: ['bao cao', 'thong ke', 'report', 'analytics', 'nang suat', 'san luong'],
      module: 'reports'
    },
    {
      id: 'nav-integration',
      title: 'Trung Tâm Tích Hợp LIS / PACS / HIS',
      description: 'Cổng kết nối HL7, DICOM, API đồng bộ dữ liệu bệnh án và máy xét nghiệm',
      keywords: ['tich hop', 'integration', 'lis', 'pacs', 'his', 'hl7', 'dicom', 'api', 'webhook'],
      module: 'integration'
    },
    {
      id: 'nav-discussion',
      title: 'Kênh Trao Đổi & Hội Chẩn Nội Bộ',
      description: 'Chat nhóm chuyên môn, chia sẻ ca bệnh khẩn, thông báo nhanh toàn khoa',
      keywords: ['trao doi', 'chat', 'tin nhan', 'thao luan', 'thong bao', 'hoi y'],
      module: 'discussion'
    },
    {
      id: 'nav-audit',
      title: 'Nhật Ký Hệ Thống & Audit Log',
      description: 'Truy vết thay đổi dữ liệu, lịch sử thao tác người dùng, bảo mật y tế',
      keywords: ['audit', 'log', 'nhat ky', 'lich su', 'truy vet', 'bao mat'],
      module: 'audit'
    },
    {
      id: 'nav-settings',
      title: 'Cấu Hình Hệ Thống',
      description: 'Tùy chỉnh giao diện, thông báo Telegram, kết nối Google Sheets/GAS và sao lưu',
      keywords: ['cai dat', 'cau hinh', 'settings', 'telegram', 'gas', 'sao luu', 'backup'],
      module: 'settings'
    }
  ];

  /**
   * Main Search Query Function with multi-index scoring and categorization
   */
  public search(query: string, categoryFilter: SearchCategory = 'all', limit: number = 30): SearchResultItem[] {
    const rawQuery = query.trim();
    if (!rawQuery) return [];

    const normQuery = removeVietnameseTones(rawQuery);
    const queryTokens = normQuery.split(/\s+/).filter(Boolean);

    // Expand search query with medical synonyms
    const expandedTokens = new Set<string>(queryTokens);
    queryTokens.forEach(token => {
      const syns = MEDICAL_SYNONYMS[token];
      if (syns) {
        syns.forEach(s => removeVietnameseTones(s).split(/\s+/).forEach(t => expandedTokens.add(t)));
      }
    });

    const results: SearchResultItem[] = [];

    // 1. SEARCH IN DOCUMENTS (SOP, ISO, Guidelines, Reports)
    if (categoryFilter === 'all' || categoryFilter === 'documents') {
      const docs = storageService.getDocuments();
      docs.forEach(doc => {
        const score = this.calculateDocumentScore(doc, rawQuery, normQuery, expandedTokens);
        if (score > 0) {
          results.push({
            id: `doc-${doc.id}`,
            category: 'documents',
            categoryLabel: 'Tài liệu & SOP',
            categoryColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
            title: doc.title,
            subtitle: `${doc.code ? `[${doc.code}] ` : ''}${doc.docType} • Phiên bản ${doc.version} • Người ban hành: ${doc.owner}`,
            description: doc.note || `Tài liệu quản lý chất lượng khoa Cận Lâm Sàng. Dung lượng: ${(doc.fileSize / 1024 / 1024).toFixed(2)} MB`,
            code: doc.code || doc.id,
            badge: {
              text: doc.docType,
              variant: doc.docType.includes('SOP') ? 'emerald' : doc.docType.includes('ISO') ? 'purple' : 'blue'
            },
            tags: doc.tags,
            moduleTarget: 'documents',
            targetId: doc.id,
            actionUrl: doc.driveUrl,
            metadata: doc,
            score
          });
        }
      });
    }

    // 2. SEARCH IN TASKS & WORK ORDERS
    if (categoryFilter === 'all' || categoryFilter === 'tasks') {
      const tasks = storageService.getTasks();
      tasks.forEach(task => {
        const score = this.calculateTaskScore(task, rawQuery, normQuery, expandedTokens);
        if (score > 0) {
          const priorityVariant = 
            task.priority === 'Khẩn cấp' ? 'rose' :
            task.priority === 'Cao' ? 'amber' :
            task.priority === 'Trung bình' ? 'blue' : 'slate';

          results.push({
            id: `task-${task.id}`,
            category: 'tasks',
            categoryLabel: 'Công việc & Chỉ định',
            categoryColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
            title: task.title,
            subtitle: `Mã: ${task.id} • ${task.taskType} • Phụ trách: ${task.assignee} • Hạn: ${task.dueDate}`,
            description: task.description || task.notes,
            code: task.id,
            badge: {
              text: `${task.priority} • ${task.status}`,
              variant: priorityVariant
            },
            tags: task.tags,
            moduleTarget: 'tasks',
            targetId: task.id,
            metadata: task,
            score
          });
        }
      });
    }

    // 3. SEARCH IN MEDICAL EQUIPMENT & MACHINES
    if (categoryFilter === 'all' || categoryFilter === 'equipment') {
      const equipmentList = storageService.getEquipment();
      equipmentList.forEach(eq => {
        const score = this.calculateEquipmentScore(eq, rawQuery, normQuery, expandedTokens);
        if (score > 0) {
          const statusVariant = 
            eq.status === 'Hoạt động tốt' ? 'emerald' :
            eq.status === 'Cần bảo trì' ? 'amber' :
            eq.status === 'Đang hiệu chuẩn' ? 'blue' : 'rose';

          results.push({
            id: `eq-${eq.id}`,
            category: 'equipment',
            categoryLabel: 'Máy móc & Thiết bị',
            categoryColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
            title: eq.name,
            subtitle: `Mã: ${eq.code || eq.id} • ${eq.manufacturer} (${eq.model}) • Vị trí: ${eq.room}`,
            description: `Serial: ${eq.serialNumber || 'N/A'} • KTV quản lý: ${eq.assignedTechnician || 'Chưa gán'} • Thông số: ${eq.specifications || 'Tiêu chuẩn Y tế'}`,
            code: eq.code || eq.id,
            badge: {
              text: eq.status,
              variant: statusVariant
            },
            tags: [eq.category, eq.manufacturer, eq.room],
            moduleTarget: 'equipment',
            targetId: eq.id,
            metadata: eq,
            score
          });
        }
      });
    }

    // 4. SEARCH IN PARACLINICAL ROOMS & DEPARTMENTS
    if (categoryFilter === 'all' || categoryFilter === 'rooms') {
      const rooms = storageService.getRooms();
      rooms.forEach(room => {
        const score = this.calculateRoomScore(room, rawQuery, normQuery, expandedTokens);
        if (score > 0) {
          results.push({
            id: `room-${room.id}`,
            category: 'rooms',
            categoryLabel: 'Phòng / Bộ phận',
            categoryColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
            title: room.name,
            subtitle: `Mã: ${room.code} • ${room.departmentSection} • Tầng: ${room.floor} • Trưởng phòng: ${room.managerInCharge || 'Chưa phân công'}`,
            description: room.description || `Bộ phận chuyên môn trực thuộc Khoa Cận Lâm Sàng. Thiết bị chính: ${room.primaryEquipment || 'Nhiều máy'}`,
            code: room.code,
            badge: {
              text: room.departmentSection,
              variant: 'blue'
            },
            tags: [room.floor, room.departmentSection, room.primaryEquipment || ''],
            moduleTarget: 'rooms',
            targetId: room.id,
            metadata: room,
            score
          });
        }
      });
    }

    // 5. SEARCH IN STAFF & HR PROFILES
    if (categoryFilter === 'all' || categoryFilter === 'staff') {
      const staffList = storageService.getStaffProfiles();
      staffList.forEach(staff => {
        const score = this.calculateStaffScore(staff, rawQuery, normQuery, expandedTokens);
        if (score > 0) {
          results.push({
            id: `staff-${staff.userId}`,
            category: 'staff',
            categoryLabel: 'Nhân sự & Bác sĩ',
            categoryColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
            title: staff.fullName,
            subtitle: `Mã ID: ${staff.userId} • ${staff.title || staff.role} • ${staff.departmentSection} • Phòng: ${staff.room || 'Khoa CLS'}`,
            description: `SĐT: ${staff.phone || 'Chưa có'} • Email: ${staff.email || 'Chưa có'} • Chuyên môn: ${staff.specialty || 'Cận lâm sàng'}`,
            code: staff.userId,
            badge: {
              text: staff.title || staff.role,
              variant: staff.role === 'Doctor' ? 'emerald' : staff.role === 'Manager' ? 'blue' : 'purple'
            },
            tags: [staff.role, staff.departmentSection, staff.specialty, ...(staff.degrees || [])],
            moduleTarget: 'hr',
            targetId: staff.userId,
            metadata: staff,
            score
          });
        }
      });
    }

    // 6. SEARCH IN SHIFTS & DUTY SCHEDULES
    if (categoryFilter === 'all' || categoryFilter === 'shifts') {
      const shifts = storageService.getShifts();
      shifts.forEach(shift => {
        const score = this.calculateShiftScore(shift, rawQuery, normQuery, expandedTokens);
        if (score > 0) {
          results.push({
            id: `shift-${shift.id}`,
            category: 'shifts',
            categoryLabel: 'Lịch trực & Ca kíp',
            categoryColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800',
            title: shift.title || shift.shiftName || 'Ca làm việc',
            subtitle: `Ngày: ${shift.date} • Giờ: ${shift.startTime || ''} - ${shift.endTime || ''} • Cán bộ trực: ${shift.assignedUserName || shift.userName}`,
            description: `Vị trí: ${shift.room || shift.roomLocation || 'Khoa CLS'} • Máy phụ trách: ${shift.machine || 'Toàn bộ'} • Ghi chú: ${shift.notes || 'Không có'}`,
            code: shift.id,
            badge: {
              text: shift.shiftType || 'Ca trực',
              variant: 'rose'
            },
            tags: [shift.date, shift.workType || 'Ca trực'],
            moduleTarget: 'schedule',
            targetId: shift.id,
            metadata: shift,
            score
          });
        }
      });
    }

    // 7. SEARCH IN MEETINGS & CONSULTATIONS
    if (categoryFilter === 'all' || categoryFilter === 'meetings') {
      const meetings = storageService.getMeetingItems();
      meetings.forEach(mtg => {
        const score = this.calculateMeetingScore(mtg, rawQuery, normQuery, expandedTokens);
        if (score > 0) {
          results.push({
            id: `mtg-${mtg.id}`,
            category: 'meetings',
            categoryLabel: 'Cuộc họp & Hội chẩn',
            categoryColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
            title: mtg.title,
            subtitle: `Ngày: ${mtg.date} (${mtg.time}) • Chủ trì: ${mtg.chairperson} • Địa điểm: ${mtg.location}`,
            description: mtg.agenda || mtg.minutes?.summary || `Hội chẩn & Giao ban khoa Cận Lâm Sàng. Tham dự: ${mtg.attendees?.join(', ') || 'Toàn thể khoa'}`,
            code: mtg.id,
            badge: {
              text: mtg.status || 'Họp',
              variant: 'amber'
            },
            tags: [mtg.category, mtg.chairperson, ...(mtg.attendees || [])],
            moduleTarget: 'meetings',
            targetId: mtg.id,
            metadata: mtg,
            score
          });
        }
      });
    }

    // 8. SEARCH IN SYSTEM NAVIGATION SHORTCUTS
    if (categoryFilter === 'all' || categoryFilter === 'navigation') {
      this.navigationModules.forEach(nav => {
        const score = this.calculateNavScore(nav, normQuery, queryTokens);
        if (score > 0) {
          results.push({
            id: `nav-${nav.id}`,
            category: 'navigation',
            categoryLabel: 'Lối tắt Phân hệ',
            categoryColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
            title: nav.title,
            subtitle: `Mở nhanh phân hệ ${nav.title}`,
            description: nav.description,
            badge: {
              text: 'Đi tới',
              variant: 'blue'
            },
            tags: nav.keywords,
            moduleTarget: nav.module,
            score: score + 15 // Boost nav shortcuts slightly for direct navigation terms
          });
        }
      });
    }

    // Sort by Score Descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  // --- Scoring Algorithms ---

  private calculateDocumentScore(doc: DocumentItem, rawQ: string, normQ: string, tokens: Set<string>): number {
    let score = 0;
    const titleNorm = removeVietnameseTones(doc.title);
    const codeNorm = removeVietnameseTones(doc.code || '');
    const noteNorm = removeVietnameseTones(doc.note || '');
    const ownerNorm = removeVietnameseTones(doc.owner || '');
    const docTypeNorm = removeVietnameseTones(doc.docType || '');
    const tagsNorm = (doc.tags || []).map(t => removeVietnameseTones(t)).join(' ');

    // 1. Exact match on Code (e.g. SOP-CLS-01)
    if (doc.code && (doc.code.toLowerCase().includes(rawQ.toLowerCase()) || codeNorm.includes(normQ))) {
      score += 120;
    }

    // 2. Query matches title
    if (titleNorm.includes(normQ)) {
      score += 80;
      if (titleNorm.startsWith(normQ)) score += 30;
    }

    // 3. Match SOP / ISO explicit keyword
    if (normQ === 'sop' && (codeNorm.includes('sop') || docTypeNorm.includes('sop') || titleNorm.includes('sop') || tagsNorm.includes('sop'))) {
      score += 100;
    }

    if (docTypeNorm.includes(normQ)) score += 50;
    if (tagsNorm.includes(normQ)) score += 40;
    if (noteNorm.includes(normQ)) score += 30;
    if (ownerNorm.includes(normQ)) score += 30;

    // Token matching
    tokens.forEach(t => {
      if (t.length < 2) return;
      if (titleNorm.includes(t)) score += 15;
      if (codeNorm.includes(t)) score += 20;
      if (tagsNorm.includes(t)) score += 10;
    });

    return score;
  }

  private calculateTaskScore(task: TaskItem, rawQ: string, normQ: string, tokens: Set<string>): number {
    let score = 0;
    const titleNorm = removeVietnameseTones(task.title);
    const idNorm = removeVietnameseTones(task.id);
    const descNorm = removeVietnameseTones(task.description || '');
    const assigneeNorm = removeVietnameseTones(task.assignee || '');
    const typeNorm = removeVietnameseTones(task.taskType || '');

    if (task.id.toLowerCase().includes(rawQ.toLowerCase()) || idNorm.includes(normQ)) {
      score += 110;
    }
    if (titleNorm.includes(normQ)) {
      score += 75;
      if (titleNorm.startsWith(normQ)) score += 25;
    }
    if (assigneeNorm.includes(normQ)) score += 45;
    if (typeNorm.includes(normQ)) score += 40;
    if (descNorm.includes(normQ)) score += 25;

    tokens.forEach(t => {
      if (t.length < 2) return;
      if (titleNorm.includes(t)) score += 15;
      if (assigneeNorm.includes(t)) score += 10;
    });

    return score;
  }

  private calculateEquipmentScore(eq: EquipmentItem, rawQ: string, normQ: string, tokens: Set<string>): number {
    let score = 0;
    const nameNorm = removeVietnameseTones(eq.name);
    const codeNorm = removeVietnameseTones(eq.code || eq.id);
    const modelNorm = removeVietnameseTones(eq.model || '');
    const mfgNorm = removeVietnameseTones(eq.manufacturer || '');
    const roomNorm = removeVietnameseTones(eq.room || '');

    if (codeNorm.includes(normQ) || (eq.code && eq.code.toLowerCase().includes(rawQ.toLowerCase()))) {
      score += 110;
    }
    if (nameNorm.includes(normQ)) {
      score += 85;
      if (nameNorm.startsWith(normQ)) score += 25;
    }
    if (modelNorm.includes(normQ) || mfgNorm.includes(normQ)) score += 50;
    if (roomNorm.includes(normQ)) score += 40;

    tokens.forEach(t => {
      if (t.length < 2) return;
      if (nameNorm.includes(t)) score += 20;
      if (modelNorm.includes(t)) score += 15;
    });

    return score;
  }

  private calculateRoomScore(room: ParaclinicalRoom, rawQ: string, normQ: string, tokens: Set<string>): number {
    let score = 0;
    const nameNorm = removeVietnameseTones(room.name);
    const codeNorm = removeVietnameseTones(room.code);
    const secNorm = removeVietnameseTones(room.departmentSection || '');
    const mgrNorm = removeVietnameseTones(room.managerInCharge || '');
    const eqNorm = removeVietnameseTones(room.primaryEquipment || '');

    if (codeNorm.includes(normQ) || room.code.toLowerCase().includes(rawQ.toLowerCase())) {
      score += 115;
    }
    if (nameNorm.includes(normQ)) {
      score += 80;
      if (nameNorm.startsWith(normQ)) score += 25;
    }
    if (secNorm.includes(normQ)) score += 45;
    if (mgrNorm.includes(normQ)) score += 35;
    if (eqNorm.includes(normQ)) score += 35;

    tokens.forEach(t => {
      if (t.length < 2) return;
      if (nameNorm.includes(t)) score += 15;
      if (codeNorm.includes(t)) score += 20;
    });

    return score;
  }

  private calculateStaffScore(staff: StaffProfile, rawQ: string, normQ: string, tokens: Set<string>): number {
    let score = 0;
    const nameNorm = removeVietnameseTones(staff.fullName);
    const codeNorm = removeVietnameseTones(staff.userId);
    const roleNorm = removeVietnameseTones(staff.role || '');
    const titleNorm = removeVietnameseTones(staff.title || '');
    const specNorm = removeVietnameseTones(staff.specialty || '');
    const degreesNorm = (staff.degrees || []).map(d => removeVietnameseTones(d)).join(' ');

    if (codeNorm.includes(normQ) || staff.userId.toLowerCase().includes(rawQ.toLowerCase())) {
      score += 110;
    }
    if (nameNorm.includes(normQ)) {
      score += 85;
      if (nameNorm.startsWith(normQ)) score += 30;
    }
    if (titleNorm.includes(normQ) || roleNorm.includes(normQ)) score += 45;
    if (specNorm.includes(normQ)) score += 35;
    if (degreesNorm.includes(normQ)) score += 25;

    tokens.forEach(t => {
      if (t.length < 2) return;
      if (nameNorm.includes(t)) score += 20;
      if (titleNorm.includes(t)) score += 15;
    });

    return score;
  }

  private calculateShiftScore(shift: ShiftDuty, rawQ: string, normQ: string, tokens: Set<string>): number {
    let score = 0;
    const titleNorm = removeVietnameseTones(shift.title || shift.shiftName || '');
    const userNorm = removeVietnameseTones(shift.assignedUserName || shift.userName || '');
    const roomNorm = removeVietnameseTones(shift.room || shift.roomLocation || '');
    const machNorm = removeVietnameseTones(shift.machine || '');

    if (titleNorm.includes(normQ)) score += 70;
    if (userNorm.includes(normQ)) score += 55;
    if (roomNorm.includes(normQ)) score += 40;
    if (machNorm.includes(normQ)) score += 40;
    if (shift.date && shift.date.includes(rawQ)) score += 60;

    tokens.forEach(t => {
      if (t.length < 2) return;
      if (titleNorm.includes(t)) score += 15;
      if (userNorm.includes(t)) score += 15;
    });

    return score;
  }

  private calculateMeetingScore(mtg: MeetingItem, rawQ: string, normQ: string, tokens: Set<string>): number {
    let score = 0;
    const titleNorm = removeVietnameseTones(mtg.title);
    const chairNorm = removeVietnameseTones(mtg.chairperson || '');
    const locNorm = removeVietnameseTones(mtg.location || '');
    const catNorm = removeVietnameseTones(mtg.category || '');
    const agendaNorm = removeVietnameseTones(mtg.agenda || '');

    if (titleNorm.includes(normQ)) score += 75;
    if (chairNorm.includes(normQ)) score += 50;
    if (locNorm.includes(normQ)) score += 35;
    if (catNorm.includes(normQ)) score += 30;
    if (agendaNorm.includes(normQ)) score += 25;

    tokens.forEach(t => {
      if (t.length < 2) return;
      if (titleNorm.includes(t)) score += 15;
    });

    return score;
  }

  private calculateNavScore(nav: { title: string; description: string; keywords: string[] }, normQ: string, tokens: string[]): number {
    let score = 0;
    const titleNorm = removeVietnameseTones(nav.title);
    const descNorm = removeVietnameseTones(nav.description);
    const kwNorm = nav.keywords.map(k => removeVietnameseTones(k));

    if (titleNorm.includes(normQ)) score += 80;
    if (kwNorm.some(k => k === normQ || normQ.includes(k) || k.includes(normQ))) score += 60;
    if (descNorm.includes(normQ)) score += 30;

    tokens.forEach(t => {
      if (t.length < 2) return;
      if (kwNorm.some(k => k.includes(t))) score += 20;
    });

    return score;
  }
}

export const medicalSearchEngine = MedicalSearchEngine.getInstance();
