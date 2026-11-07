import { 
  TaskItem, DocumentItem, User, NotificationLog, AuditLogItem, AppSettings,
  ShiftDuty, WorkTaskRow, WeeklyMeeting, ChatChannelMessage, ChatGroupChannel, DepartmentAnnouncement,
  EquipmentItem, ParaclinicalRoom, StaffProfile, LeaveRequest, TrainingCourse,
  MeetingItem, IntegrationEndpoint, IntegrationPayloadSample
} from '../types/hospital';

export const initialUsers: User[] = [
  {
    id: 'USR-001',
    name: 'TS. BS. Phạm Đức Thành',
    email: 'thanh.pham@hospital.vn',
    role: 'Admin',
    title: 'Trưởng khoa',
    department: 'Khoa Cận Lâm Sàng - Ban Chủ Nhiệm Khoa',
    avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
    telegramChatId: '987654321',
    phone: '0903123456',
    status: 'Active',
    password: '123456',
    room: 'Phòng Trưởng Khoa - Tầng 2 Khoa CLS'
  },
  {
    id: 'USR-002',
    name: 'ThS. BS. Nguyễn Hoài Nam',
    email: 'nam.nguyen@hospital.vn',
    role: 'Manager',
    title: 'Phó khoa',
    department: 'Khoa Cận Lâm Sàng - Bộ phận Chẩn đoán hình ảnh',
    avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80',
    telegramChatId: '876543210',
    phone: '0908765432',
    status: 'Active',
    password: '123456',
    room: 'Phòng Đọc Phim MSCT/MRI - Tầng 1'
  },
  {
    id: 'USR-003',
    name: 'CN. Lê Thị Hương',
    email: 'huong.le@hospital.vn',
    role: 'Staff',
    title: 'Điều dưỡng trưởng',
    department: 'Khoa Cận Lâm Sàng - Quản lý KTV & Vật tư',
    avatar: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150&auto=format&fit=crop&q=80',
    telegramChatId: '765432109',
    phone: '0912345678',
    status: 'Active',
    password: '123456',
    room: 'Phòng Hành chính Khoa - Tầng 2'
  },
  {
    id: 'USR-004',
    name: 'KTV. Vũ Văn Hải',
    email: 'hai.vu@hospital.vn',
    role: 'Staff',
    title: 'Kỹ thuật viên',
    department: 'Khoa Cận Lâm Sàng - Bộ phận Xét nghiệm Sinh hóa',
    avatar: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150&auto=format&fit=crop&q=80',
    telegramChatId: '654321098',
    phone: '0934567890',
    status: 'Active',
    password: '123456',
    room: 'Phòng LAB Xét nghiệm - Tầng 2'
  },
  {
    id: 'USR-005',
    name: 'BS. CĐHA. Hoàng Quốc Việt',
    email: 'viet.hoang@hospital.vn',
    role: 'Doctor',
    title: 'Bác sĩ',
    department: 'Khoa Cận Lâm Sàng - Bộ phận Chẩn đoán hình ảnh',
    avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80',
    telegramChatId: '543210987',
    phone: '0945678901',
    status: 'Active',
    password: '123456',
    room: 'Phòng Siêu âm Màu 3D - Tầng 1'
  },
  {
    id: 'USR-006',
    name: 'NV. Trần Bảo Ngọc',
    email: 'ngoc.tran@hospital.vn',
    role: 'Staff',
    title: 'Nhân viên hành chính',
    department: 'Khoa Cận Lâm Sàng - Tiếp nhận & Trả kết quả',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    telegramChatId: '432109876',
    phone: '0956789012',
    status: 'Active',
    password: '123456',
    room: 'Quầy Trả Kết quả CLS - Tầng 1'
  }
];

export const initialShifts: ShiftDuty[] = [
  {
    id: 'SFT-001',
    title: 'Ca Trực Cấp Cứu CĐHA & Đọc phim MSCT 128',
    date: '2026-07-26', // Today
    startTime: '07:00',
    endTime: '15:00',
    shiftName: 'Ca Sáng (07:00 - 15:00)',
    shiftType: 'Ca Sáng',
    shiftTime: '07:00 - 15:00',
    roleInShift: 'Trưởng ca trực & Đọc phim CĐHA khẩn',
    assignedUserId: 'USR-002',
    assignedUserName: 'ThS. BS. Nguyễn Hoài Nam',
    assignedRole: 'Phó khoa',
    userId: 'USR-002',
    userName: 'ThS. BS. Nguyễn Hoài Nam',
    userTitle: 'Phó khoa',
    phone: '0908765432',
    room: 'Phòng MSCT / MRI',
    roomLocation: 'Phòng MSCT 128 lát - Tầng 1',
    machine: 'Somatom Definition 128 (Siemens)',
    department: 'Khoa Cận Lâm Sàng - Chẩn đoán hình ảnh',
    workType: 'Ca trực',
    priority: 'Khẩn cấp',
    color: 'Đỏ',
    status: 'Đang trực',
    isCurrentlyActive: true,
    notes: 'Phụ trách duyệt nhanh kết quả CT 128 dải ca Cấp cứu',
    recurrence: 'Không'
  },
  {
    id: 'SFT-002',
    title: 'Trực Vận hành Hệ thống Xét nghiệm Sinh hóa',
    date: '2026-07-26', // Today
    startTime: '07:00',
    endTime: '15:00',
    shiftName: 'Ca Sáng (07:00 - 15:00)',
    shiftType: 'Ca Sáng',
    shiftTime: '07:00 - 15:00',
    roleInShift: 'KTV Trực máy Xét nghiệm Sinh hóa Roche Cobas',
    assignedUserId: 'USR-004',
    assignedUserName: 'KTV. Vũ Văn Hải',
    assignedRole: 'Kỹ thuật viên',
    userId: 'USR-004',
    userName: 'KTV. Vũ Văn Hải',
    userTitle: 'Kỹ thuật viên',
    phone: '0934567890',
    room: 'Phòng Xét nghiệm Sinh hóa',
    roomLocation: 'Phòng LAB Xét nghiệm - Tầng 2',
    machine: 'Cobas 8000 (Roche)',
    department: 'Khoa Cận Lâm Sàng - Xét nghiệm',
    workType: 'Làm việc',
    priority: 'Cao',
    color: 'Xanh',
    status: 'Đang trực',
    isCurrentlyActive: true,
    notes: 'Chạy mẫu kiểm chuẩn QC đầu ca lúc 07:15',
    recurrence: 'Hàng ngày'
  },
  {
    id: 'SFT-003',
    title: 'Siêu âm Tim & Doppler Mạch Máu Khẩn',
    date: '2026-07-26', // Today
    startTime: '07:00',
    endTime: '15:00',
    shiftName: 'Ca Sáng (07:00 - 15:00)',
    shiftType: 'Ca Sáng',
    shiftTime: '07:00 - 15:00',
    roleInShift: 'BS Trực Siêu âm Doppler tim & Mạch máu khẩn',
    assignedUserId: 'USR-005',
    assignedUserName: 'BS. CĐHA. Hoàng Quốc Việt',
    assignedRole: 'Bác sĩ',
    userId: 'USR-005',
    userName: 'BS. CĐHA. Hoàng Quốc Việt',
    userTitle: 'Bác sĩ',
    phone: '0945678901',
    room: 'Phòng Siêu âm 02',
    roomLocation: 'Phòng Siêu âm 02 - Tầng 1',
    machine: 'Vivid E95 4D (GE)',
    department: 'Khoa Cận Lâm Sàng - Chẩn đoán hình ảnh',
    workType: 'Làm việc',
    priority: 'Trung bình',
    color: 'Xanh',
    status: 'Đang trực',
    isCurrentlyActive: true,
    notes: 'Sẵn sàng trực tại chỗ khi có báo động đỏ Code Red',
    recurrence: 'Không'
  },
  {
    id: 'SFT-004',
    title: 'Giao ban Khoa Cận Lâm Sàng Tuần 31',
    date: '2026-07-27', // Tomorrow
    startTime: '07:30',
    endTime: '08:30',
    shiftName: 'Họp Giao Ban',
    shiftType: 'Họp',
    shiftTime: '07:30 - 08:30',
    roleInShift: 'Chủ trì Giao ban Khoa',
    assignedUserId: 'USR-001',
    assignedUserName: 'TS. BS. Phạm Đức Thành',
    assignedRole: 'Trưởng khoa',
    userId: 'USR-001',
    userName: 'TS. BS. Phạm Đức Thành',
    userTitle: 'Trưởng khoa',
    phone: '0903123456',
    room: 'Hội trường Khoa CLS',
    roomLocation: 'Hội trường Tầng 2 - Khoa CLS',
    machine: 'Hệ thống Máy chiếu & Zoom Meeting',
    department: 'Khoa Cận Lâm Sàng - Ban Chủ Nhiệm Khoa',
    workType: 'Họp',
    priority: 'Cao',
    color: 'Cam',
    status: 'Đã phân công',
    isCurrentlyActive: false,
    notes: 'Giao ban chuyên môn và rà soát tiến độ ISO 15189',
    recurrence: 'Hàng tuần'
  },
  {
    id: 'SFT-005',
    title: 'Tập huấn An toàn Bức xạ & Vận hành Máy MRI 3.0T',
    date: '2026-07-28',
    startTime: '13:30',
    endTime: '16:30',
    shiftName: 'Chiều Đào Tạo',
    shiftType: 'Đào tạo',
    shiftTime: '13:30 - 16:30',
    roleInShift: 'Giảng viên Đào tạo KTV',
    assignedUserId: 'USR-002',
    assignedUserName: 'ThS. BS. Nguyễn Hoài Nam',
    assignedRole: 'Phó khoa',
    userId: 'USR-002',
    userName: 'ThS. BS. Nguyễn Hoài Nam',
    userTitle: 'Phó khoa',
    phone: '0908765432',
    room: 'Phòng Đào Tạo',
    roomLocation: 'Phòng Đào tạo Kỹ thuật - Tầng 2',
    machine: 'GE Signa Pioneer 3.0T',
    department: 'Khoa Cận Lâm Sàng - Chẩn đoán hình ảnh',
    workType: 'Đào tạo',
    priority: 'Trung bình',
    color: 'Tím',
    status: 'Đã phân công',
    isCurrentlyActive: false,
    notes: 'Hướng dẫn quy trình an toàn từ trường cao cho KTV mới',
    recurrence: 'Hàng tháng'
  },
  {
    id: 'SFT-006',
    title: 'Ca Trực Đêm Cấp Cứu Cận Lâm Sàng 24h',
    date: '2026-07-26', // Today
    startTime: '23:00',
    endTime: '07:00',
    shiftName: 'Ca Đêm (23:00 - 07:00)',
    shiftType: 'Ca Đêm',
    shiftTime: '23:00 - 07:00',
    roleInShift: 'KTV Trực đêm Xét nghiệm & X-quang khẩn',
    assignedUserId: 'USR-004',
    assignedUserName: 'KTV. Vũ Văn Hải',
    assignedRole: 'Kỹ thuật viên',
    userId: 'USR-004',
    userName: 'KTV. Vũ Văn Hải',
    userTitle: 'Kỹ thuật viên',
    phone: '0934567890',
    room: 'Phòng LAB Cấp cứu Đêm',
    roomLocation: 'Phòng LAB Cấp cứu Đêm - Tầng 1',
    machine: 'Roche Cobas c311 & Sysmex XN-1000',
    department: 'Khoa Cận Lâm Sàng - Xét nghiệm',
    workType: 'Ca trực',
    priority: 'Khẩn cấp',
    color: 'Đỏ',
    status: 'Đã phân công',
    isCurrentlyActive: false,
    notes: 'Trực 24/7 khẩn cấp khi có ca phẫu thuật đêm',
    recurrence: 'Không'
  },
  {
    id: 'SFT-007',
    title: 'Ca Trực Sáng Ngày Mai - Xét nghiệm Vi Sinh',
    date: '2026-07-27', // Tomorrow
    startTime: '07:00',
    endTime: '15:00',
    shiftName: 'Ca Sáng (07:00 - 15:00)',
    shiftType: 'Ca Sáng',
    shiftTime: '07:00 - 15:00',
    roleInShift: 'KTV Nuôi cấy Vi sinh & Kháng sinh đồ',
    assignedUserId: 'USR-003',
    assignedUserName: 'CN. Lê Thị Hương',
    assignedRole: 'Điều dưỡng trưởng',
    userId: 'USR-003',
    userName: 'CN. Lê Thị Hương',
    userTitle: 'Điều dưỡng trưởng',
    phone: '0912345678',
    room: 'Phòng Xét nghiệm Vi sinh',
    roomLocation: 'Phòng Vi sinh - Tầng 2',
    machine: 'VITEK 2 Compact (BioMérieux)',
    department: 'Khoa Cận Lâm Sàng - Vi sinh',
    workType: 'Ca trực',
    priority: 'Cao',
    color: 'Đỏ',
    status: 'Đã phân công',
    isCurrentlyActive: false,
    notes: 'Đọc mẫu máu nuôi cấy 24h và làm PCR nhanh',
    recurrence: 'Không'
  },
  {
    id: 'SFT-008',
    title: 'Nghỉ Phép Định Kỳ Lễ / Bù Ca',
    date: '2026-07-29',
    startTime: '08:00',
    endTime: '17:00',
    shiftName: 'Nghỉ Phép',
    shiftType: 'Nghỉ',
    shiftTime: '08:00 - 17:00',
    roleInShift: 'Nghỉ bù ca trực tuần trước',
    assignedUserId: 'USR-006',
    assignedUserName: 'NV. Trần Bảo Ngọc',
    assignedRole: 'Nhân viên hành chính',
    userId: 'USR-006',
    userName: 'NV. Trần Bảo Ngọc',
    userTitle: 'Nhân viên hành chính',
    phone: '0956789012',
    room: 'Nghỉ Phép',
    roomLocation: 'Nghỉ Phép Cá Nhân',
    machine: 'N/A',
    department: 'Khoa Cận Lâm Sàng - Hành chính',
    workType: 'Nghỉ',
    priority: 'Thấp',
    color: 'Xám',
    status: 'Đã phê duyệt',
    isCurrentlyActive: false,
    notes: 'Đã có đơn nghỉ phép được Trưởng khoa ký duyệt',
    recurrence: 'Không'
  }
];

export const initialWorkTaskRows: WorkTaskRow[] = [
  {
    id: 'TRow-001',
    name: '1. Trực Vận Hành Hệ Thống Xét Nghiệm Sinh Hóa (Cobas 8000)',
    workType: 'Ca trực',
    room: 'Phòng Xét nghiệm Sinh hóa',
    machine: 'Cobas 8000 (Roche)',
    defaultTime: '07:00 - 15:00',
    color: 'Đỏ',
    notes: 'Phân công KTV trực chạy mẫu, QC sinh hóa khẩn'
  },
  {
    id: 'TRow-002',
    name: '2. Đọc & Trả Kết Quả CĐHA Cấp Cứu (CT 128 & MRI 3.0T)',
    workType: 'Làm việc',
    room: 'Phòng MSCT 128 / MRI',
    machine: 'Somatom 128 (Siemens)',
    defaultTime: '07:00 - 15:00',
    color: 'Xanh',
    notes: 'Bác sĩ chẩn đoán hình ảnh trực cấp cứu'
  },
  {
    id: 'TRow-003',
    name: '3. Phân Tích Mẫu Huyết Học & Đông Máu (Sysmex XN-1000)',
    workType: 'Làm việc',
    room: 'Phòng Xét nghiệm Huyết học',
    machine: 'Sysmex XN-1000',
    defaultTime: '07:00 - 15:00',
    color: 'Xanh',
    notes: 'KTV kiểm tra công thức máu và đông máu'
  },
  {
    id: 'TRow-004',
    name: '4. Thực Hiện Siêu Âm Tim & Doppler Mạch Máu Khẩn',
    workType: 'Làm việc',
    room: 'Phòng Siêu âm 02',
    machine: 'Vivid E95 4D (GE)',
    defaultTime: '07:00 - 15:00',
    color: 'Xanh',
    notes: 'Phục vụ bệnh nhân ngoại trú và cấp cứu'
  },
  {
    id: 'TRow-005',
    name: '5. Kiểm Chuẩn ISO 15189 & Hiệu Chuẩn Thiết Bị Tuần',
    workType: 'Làm việc',
    room: 'Phòng Quản lý Chất lượng CLS',
    machine: 'Toàn bộ thiết bị Khoa',
    defaultTime: '13:30 - 17:00',
    color: 'Xanh',
    notes: 'Cán bộ ISO đánh giá định kỳ'
  },
  {
    id: 'TRow-006',
    name: '6. Họp Giao Ban Tuần & Đào Tạo An Toàn Sinh Học',
    workType: 'Họp',
    room: 'Hội trường Khoa CLS',
    defaultTime: '15:30 - 17:00',
    color: 'Cam',
    notes: 'Họp toàn thể nhân viên khoa'
  },
  {
    id: 'TRow-007',
    name: '7. Ca Trực Đêm 24/7 & Cấp Cứu Ngoại Giờ',
    workType: 'Ca trực',
    room: 'Phòng Trực Khoa Cận Lâm Sàng',
    defaultTime: '17:00 - 07:00',
    color: 'Đỏ',
    notes: 'Kíp trực đêm đảm bảo cấp cứu 24/7'
  }
];

export const initialWeeklyMeetings: WeeklyMeeting[] = [
  {
    id: 'MTG-001',
    title: 'Giao ban Khoa Cận Lâm Sàng đầu tuần',
    date: '2026-07-27', // Monday
    time: '07:30 - 08:15',
    location: 'Hội trường Tầng 2 - Khoa CLS',
    chairperson: 'TS. BS. Phạm Đức Thành (Trưởng khoa)',
    participants: 'Toàn thể Bác sĩ, KTV, Điều dưỡng & NV Hành chính',
    type: 'Giao ban khoa',
    status: 'Sắp diễn ra',
    description: 'Đánh giá chỉ số KPI xét nghiệm tuần qua, triển khai kế hoạch bảo trì máy MRI và đánh giá ISO 15189.'
  },
  {
    id: 'MTG-002',
    title: 'Họp Ban chỉ đạo Đánh giá Chất lượng ISO 15189 Phòng LAB',
    date: '2026-07-28', // Tuesday
    time: '14:00 - 15:30',
    location: 'Phòng Họp Nhỏ - Tầng 2',
    chairperson: 'CN. Lê Thị Hương (Điều dưỡng trưởng)',
    participants: 'Nhóm quản lý chất lượng & Nhóm KTV trưởng bộ phận',
    type: 'Đánh giá ISO',
    status: 'Sắp diễn ra',
    description: 'Rà soát sổ tay chất lượng SOP-CLS và hồ sơ kiểm định ngoại kiểm EQA tháng 7.'
  },
  {
    id: 'MTG-003',
    title: 'Hội chẩn Chẩn đoán hình ảnh ca bệnh U não góc cầu tiểu não',
    date: '2026-07-29', // Wednesday
    time: '10:00 - 11:30',
    location: 'Phòng Hội chẩn CĐHA 3D',
    chairperson: 'ThS. BS. Nguyễn Hoài Nam (Phó khoa)',
    participants: 'BS CĐHA, Khoa Ngoại Thần kinh & Khoa Ung bướu',
    type: 'Hội chẩn CĐHA',
    status: 'Sắp diễn ra',
    description: 'Phân tích chuỗi xung MRI 3.0 Tesla và phim MSCT dựng hình mạch máu não.'
  },
  {
    id: 'MTG-004',
    title: 'Tập huấn Quy trình An toàn Bức xạ & Mang trang phục phòng hộ X-quang',
    date: '2026-07-30', // Thursday
    time: '15:00 - 16:30',
    location: 'Phòng Đào tạo Khoa CLS',
    chairperson: 'BS. CĐHA. Hoàng Quốc Việt',
    participants: 'KTV Chẩn đoán hình ảnh & Thực tập sinh',
    type: 'Tập huấn KTV',
    status: 'Sắp diễn ra',
    description: 'Kiểm tra liều kế cá nhân định kỳ và cập nhật quy trình chiếu xạ an toàn theo BYT.'
  }
];

export const initialTasks: TaskItem[] = [
  {
    id: 'TSK-1001',
    title: 'Kiểm chuẩn QC đầu ngày 6 máy xét nghiệm tự động Roche Cobas 6000',
    description: 'Chạy mẫu ngoại kiểm EQA, ghi sổ nhật ký QC máy xét nghiệm hóa sinh. Nếu sai số vượt 2SD cần hiệu chỉnh lại mẫu chuẩn ngay.',
    dueDate: '2026-07-26', // Today
    createdDate: '2026-07-26 06:45',
    updatedDate: '2026-07-26 07:15',
    creator: 'CN. Lê Thị Hương',
    assignee: 'KTV. Vũ Văn Hải',
    assigneeEmail: 'hai.vu@hospital.vn',
    telegramChatId: '654321098',
    taskType: 'Kiểm chuẩn ISO',
    priority: 'Khẩn cấp',
    status: 'Đang thực hiện',
    level: 'Bộ phận Xét nghiệm',
    recurrence: 'Hàng ngày',
    recurrenceCount: 30,
    notes: 'Máy Cobas c501 và e601 đã đạt QC. Đang kiểm tra máy c311.',
    attachments: [
      { id: 'att-1', name: 'Nhat_Ky_Kiom_Chuan_Cobas_2607.pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', type: 'application/pdf', size: 1250000 }
    ]
  },
  {
    id: 'TSK-1002',
    title: 'Đọc phim và trả kết quả MSCT 128 dải ca phình động mạch chủ ngực',
    description: 'Bệnh nhân N.V.M (68 tuổi) từ Khoa Cấp cứu chuyển sang. Cần dựng hình 3D mạch máu ngực - bụng và báo kết quả khẩn qua điện thoại.',
    dueDate: '2026-07-26', // Today
    createdDate: '2026-07-26 08:10',
    updatedDate: '2026-07-26 08:20',
    creator: 'TS. BS. Phạm Đức Thành',
    assignee: 'ThS. BS. Nguyễn Hoài Nam',
    assigneeEmail: 'nam.nguyen@hospital.vn',
    telegramChatId: '876543210',
    taskType: 'Chẩn đoán hình ảnh',
    priority: 'Khẩn cấp',
    status: 'Đang thực hiện',
    level: 'Bộ phận CĐHA',
    recurrence: 'Không',
    recurrenceCount: 0,
    notes: 'Phim đã chụp xong lúc 08:05, đĩa DICOM đã upload PACS.',
    attachments: []
  },
  {
    id: 'TSK-1003',
    title: 'Kiểm tra liều kế cá nhân và bạt chì phòng chụp X-quang kỹ thuật số',
    description: 'Thu gom 12 liều kế cá nhân của KTV CĐHA gửi Viện Năng lượng Nguyên tử kiểm định quý III.',
    dueDate: '2026-07-28', // Upcoming
    createdDate: '2026-07-22 10:00',
    updatedDate: '2026-07-25 14:00',
    creator: 'CN. Lê Thị Hương',
    assignee: 'BS. CĐHA. Hoàng Quốc Việt',
    assigneeEmail: 'viet.hoang@hospital.vn',
    telegramChatId: '543210987',
    taskType: 'Bảo trì thiết bị',
    priority: 'Cao',
    status: 'Chờ xử lý',
    level: 'Bộ phận CĐHA',
    recurrence: 'Hàng tháng',
    recurrenceCount: 3,
    notes: 'Đã lập danh sách 12 KTV gửi bộ phận hành chính.',
    attachments: []
  },
  {
    id: 'TSK-1004',
    title: 'Hoàn thiện Hồ sơ Đánh giá ISO 15189 cho Phòng LAB Xét nghiệm',
    description: 'Cập nhật 18 quy trình SOP mới theo tiêu chuẩn ISO 15189:2022. Chuẩn bị cho đoàn chuyên gia Bộ Y tế kiểm tra định kỳ.',
    dueDate: '2026-07-30', // Upcoming
    createdDate: '2026-07-15 09:00',
    updatedDate: '2026-07-24 16:30',
    creator: 'TS. BS. Phạm Đức Thành',
    assignee: 'CN. Lê Thị Hương',
    assigneeEmail: 'huong.le@hospital.vn',
    telegramChatId: '765432109',
    taskType: 'Kiểm chuẩn ISO',
    priority: 'Cao',
    status: 'Đang thực hiện',
    level: 'Ban Chủ Nhiệm Khoa',
    recurrence: 'Không',
    recurrenceCount: 0,
    notes: 'Đã hoàn thành 15/18 SOP. Còn 3 SOP vi sinh đang rà soát.',
    attachments: []
  },
  {
    id: 'TSK-1005',
    title: 'Bảo trì định kỳ máy MRI 3.0 Tesla GE Signa Pioneer phòng 102',
    description: 'Kiểm tra mức Helium lỏng, hiệu chỉnh coil thu phát RF và kiểm tra bộ lưu điện UPS 100kVA.',
    dueDate: '2026-07-25', // Overdue
    createdDate: '2026-07-18 11:00',
    updatedDate: '2026-07-25 17:00',
    creator: 'ThS. BS. Nguyễn Hoài Nam',
    assignee: 'KTV. Vũ Văn Hải',
    assigneeEmail: 'hai.vu@hospital.vn',
    telegramChatId: '654321098',
    taskType: 'Bảo trì thiết bị',
    priority: 'Cao',
    status: 'Chờ xử lý',
    level: 'Bộ phận CĐHA',
    recurrence: 'Hàng tháng',
    recurrenceCount: 1,
    notes: 'Chờ hãng GE cử kỹ sư trưởng tới phối hợp.',
    attachments: []
  },
  {
    id: 'TSK-1006',
    title: 'Tổng hợp báo cáo số lượng Xét nghiệm & CĐHA tuần 3 tháng 7',
    description: 'Thống kê tổng số ca xét nghiệm máu, sinh hóa, nước tiểu, X-quang, CT, MRI, Siêu âm phục vụ giao ban.',
    dueDate: '2026-07-27',
    createdDate: '2026-07-25 15:00',
    updatedDate: '2026-07-26 07:00',
    creator: 'TS. BS. Phạm Đức Thành',
    assignee: 'NV. Trần Bảo Ngọc',
    assigneeEmail: 'ngoc.tran@hospital.vn',
    telegramChatId: '432109876',
    taskType: 'Hành chính',
    priority: 'Trung bình',
    status: 'Đang thực hiện',
    level: 'Hành chính Khoa',
    recurrence: 'Hàng tuần',
    recurrenceCount: 4,
    notes: 'Đã xuất dữ liệu từ phần mềm LIS và PACS.',
    attachments: []
  }
];

export const initialDocuments: DocumentItem[] = [
  {
    id: 'DOC-2001',
    code: 'SOP-CLS-01',
    title: 'Quy_Trinh_Lay_Mau_Xet_Nghiem_An_Toan_SOP_CLS_01.pdf',
    docType: 'Quy trình SOP',
    fileExtension: 'PDF',
    fileSize: 2450000,
    driveFileId: '1drive_file_sop01',
    driveUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    uploadDate: '2026-07-20',
    expirationDate: '2027-07-20',
    isExpired: false,
    version: 'v3.0',
    versionHistory: [
      { version: 'v1.0', updatedAt: '2024-07-20', updatedBy: 'TS. BS. Phạm Đức Thành', note: 'Ban hành lần đầu', fileUrl: '#' },
      { version: 'v3.0', updatedAt: '2026-07-20', updatedBy: 'CN. Lê Thị Hương', note: 'Cập nhật mã vạch Barcode tự động', fileUrl: '#' }
    ],
    tags: ['SOP', 'Xét nghiệm', 'ISO 15189', 'Mẫu máu'],
    owner: 'CN. Lê Thị Hương',
    note: 'Quy trình chuẩn áp dụng cho toàn bộ KTV và Điều dưỡng lấy mẫu.'
  },
  {
    id: 'DOC-2002',
    code: 'GCND-ATBX-2024',
    title: 'Giay_Chung_Nhan_An_Toan_Buc_Xa_Phong_CT_Scanner.pdf',
    docType: 'Giấy chứng nhận',
    fileExtension: 'PDF',
    fileSize: 1850000,
    driveFileId: '1drive_file_radiation_cert',
    driveUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    uploadDate: '2024-08-01',
    expirationDate: '2026-08-01', // Expiring in 6 days!
    isExpired: false,
    version: 'v1.0',
    versionHistory: [
      { version: 'v1.0', updatedAt: '2024-08-01', updatedBy: 'Cục An toàn Bức xạ Hạt nhân', note: 'Cấp thời hạn 2 năm', fileUrl: '#' }
    ],
    tags: ['An toàn bức xạ', 'Chẩn đoán hình ảnh', 'CT Scanner', 'Bộ Y tế'],
    owner: 'ThS. BS. Nguyễn Hoài Nam',
    note: 'CẢNH BÁO: Giấy chứng nhận hết hạn vào 01/08/2026! Cần nộp hồ sơ gia hạn khẩn cấp.'
  },
  {
    id: 'DOC-2003',
    code: 'HĐBT-GE-2025',
    title: 'Hop_Dong_Bao_Tri_May_Sieu_Am_3D_Color_GE_Healthcare.pdf',
    docType: 'Hợp đồng bảo trì',
    fileExtension: 'PDF',
    fileSize: 4200000,
    driveFileId: '1drive_file_contract_ge',
    driveUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    uploadDate: '2025-01-10',
    expirationDate: '2026-01-10', // Expired
    isExpired: true,
    version: 'v1.0',
    versionHistory: [
      { version: 'v1.0', updatedAt: '2025-01-10', updatedBy: 'CN. Lê Thị Hương', note: 'Hợp đồng bảo trì năm 2025', fileUrl: '#' }
    ],
    tags: ['Bảo trì', 'Siêu âm GE', 'Hợp đồng'],
    owner: 'CN. Lê Thị Hương',
    note: 'ĐÃ HẾT HẠN! Đang ký phụ lục gia hạn hợp đồng bảo trì năm 2026.'
  },
  {
    id: 'DOC-2004',
    code: 'ISO-LAB-Q2',
    title: 'Bao_Cao_Danh_Gia_Ngoai_Kiem_EQA_Lab_Xet_Nghiem_Q2.xlsx',
    docType: 'Báo cáo ISO',
    fileExtension: 'XLSX',
    fileSize: 3100000,
    driveFileId: '1drive_file_eqa_q2',
    driveUrl: 'https://docs.google.com/spreadsheets/d/example',
    uploadDate: '2026-07-10',
    expirationDate: null,
    isExpired: false,
    version: 'v1.0',
    versionHistory: [
      { version: 'v1.0', updatedAt: '2026-07-10', updatedBy: 'KTV. Vũ Văn Hải', note: 'Kết quả ngoại kiểm đạt 99.4% chỉ số chuẩn', fileUrl: '#' }
    ],
    tags: ['Báo cáo', 'EQA', 'ISO 15189', 'Sinh hóa'],
    owner: 'KTV. Vũ Văn Hải',
    note: 'Kết quả đánh giá từ Trung tâm Kiểm chuẩn Xét nghiệm TP.HCM.'
  },
  {
    id: 'DOC-2005',
    code: 'SOP-PACS-02',
    title: 'Quy_Trinh_Luu_Tru_Va_Truy_Xuat_Anh_Y_Khoa_PACS.docx',
    docType: 'Quy trình SOP',
    fileExtension: 'DOCX',
    fileSize: 1600000,
    driveFileId: '1drive_file_pacs_sop',
    driveUrl: 'https://docs.google.com/document/d/example',
    uploadDate: '2026-07-22',
    expirationDate: '2028-07-22',
    isExpired: false,
    version: 'v1.1',
    versionHistory: [
      { version: 'v1.1', updatedAt: '2026-07-22', updatedBy: 'ThS. BS. Nguyễn Hoài Nam', note: 'Kết nối DICOM đám mây', fileUrl: '#' }
    ],
    tags: ['PACS', 'Chẩn đoán hình ảnh', 'DICOM'],
    owner: 'ThS. BS. Nguyễn Hoài Nam',
    note: 'Hướng dẫn liên thông kết quả CĐHA với các phòng khám lâm sàng.'
  }
];

export const initialChannels: ChatGroupChannel[] = [
  { id: 'toan-khoa', name: 'Toàn khoa Cận Lâm Sàng', type: 'group', description: 'Kênh thông tin & thông báo chung toàn bộ nhân sự Khoa CLS', icon: 'Users', members: ['USR-001', 'USR-002', 'USR-003', 'USR-004', 'USR-005', 'USR-006'], admins: ['USR-001'], isDefault: true },
  { id: 'bac-si', name: 'Nhóm Bác sĩ Chẩn đoán', type: 'group', description: 'Hội chẩn ca khó, đọc phim MSCT/MRI & duyệt kết quả xét nghiệm', icon: 'Stethoscope', members: ['USR-001', 'USR-002', 'USR-005'], admins: ['USR-001', 'USR-002'], isDefault: true },
  { id: 'ky-thuat-vien', name: 'Nhóm Kỹ thuật viên', type: 'group', description: 'Vận hành thiết bị, xử lý mẫu bệnh phẩm, báo cáo ca trực & ISO', icon: 'Microscope', members: ['USR-004', 'USR-006'], admins: ['USR-004'], isDefault: true },
  { id: 'dieu-duong', name: 'Nhóm Điều dưỡng', type: 'group', description: 'Tiếp nhận bệnh nhân, lấy mẫu, bàn giao bệnh phẩm & vật tư y tế', icon: 'HeartHandshake', members: ['USR-003'], admins: ['USR-003'], isDefault: true },
  { id: 'hanh-chinh', name: 'Nhóm Hành chính & Vật tư', type: 'group', description: 'Hồ sơ tài liệu ISO, hóa chất tồn kho, công văn & báo cáo', icon: 'Building2', members: ['USR-001', 'USR-003'], admins: ['USR-003'], isDefault: true },
  { id: 'may-ct', name: 'Nhóm Máy CT Scanner 128', type: 'group', description: 'Lịch trực máy CT, bảo trì Somatom Siemens & quy trình tiêm thuốc', icon: 'Monitor', members: ['USR-002', 'USR-004'], admins: ['USR-002'], isDefault: true },
  { id: 'may-mri', name: 'Nhóm Máy MRI 3.0 Tesla', type: 'group', description: 'Vận hành MRI GE Signa, kiểm tra kim loại & lịch chụp khẩn', icon: 'Cpu', members: ['USR-002', 'USR-006'], admins: ['USR-002'], isDefault: true },
  { id: 'may-xquang', name: 'Nhóm Máy X-Quang KTS', type: 'group', description: 'Chụp X-quang tại giường, kiểm chuẩn an toàn bức xạ & liều tia', icon: 'Radio', members: ['USR-004', 'USR-006'], admins: ['USR-004'], isDefault: true },
  { id: 'may-sieu-am', name: 'Nhóm Máy Siêu âm Màu', type: 'group', description: 'Siêu âm Doppler tim mạch, ổ bụng, tuyến giáp & siêu âm đầu giường', icon: 'Activity', members: ['USR-002', 'USR-005'], admins: ['USR-002'], isDefault: true },
  { id: 'may-noi-soi', name: 'Nhóm Máy Nội soi Y khoa', type: 'group', description: 'Nội soi tiêu hóa, khử trùng ống soi Olympus & dụng cụ', icon: 'Eye', members: ['USR-003', 'USR-004'], admins: ['USR-003'], isDefault: true }
];

export const initialAnnouncements: DepartmentAnnouncement[] = [
  {
    id: 'ANC-001',
    title: '🚨 THÔNG BÁO KHẨN: Kiểm tra An toàn Bức xạ & Gia hạn Giấy phép CT Scanner',
    content: 'Kính gửi toàn thể Bác sĩ & KTV bộ phận CĐHA: Giấy chứng nhận an toàn bức xạ phòng CT-128 sẽ hết hạn vào 01/08/2026. Đề nghị các KTV tuân thủ nghiêm ngặt quy trình đeo liều kế cá nhân và phối hợp đoàn kiểm tra của Sở Y tế vào chiều Thứ 5.',
    category: 'Thông báo khẩn',
    senderId: 'USR-001',
    senderName: 'TS. BS. Phạm Đức Thành',
    senderRole: 'Trưởng khoa',
    createdAt: '2026-07-26 08:00',
    isUrgent: true,
    isPinned: true,
    reactions: [{ emoji: '👍', count: 5, users: ['ThS. BS. Nguyễn Hoài Nam', 'CN. Lê Thị Hương', 'KTV. Vũ Văn Hải'] }],
    comments: [
      { id: 'CMT-01', senderId: 'USR-003', senderName: 'CN. Lê Thị Hương', senderRole: 'Điều dưỡng trưởng', avatar: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150&auto=format&fit=crop&q=80', content: 'Dạ tôi đã chuẩn bị xong đầy đủ hồ sơ nhật ký đo liều kế trình Trưởng khoa!', timestamp: '2026-07-26 08:15' }
    ]
  },
  {
    id: 'ANC-002',
    title: '📅 Lịch Giao Ban Khoa & Đánh Giá Đột Xuất ISO 15189 Tuần 30',
    content: 'Lịch giao ban định kỳ diễn ra vào 07:30 Sáng Thứ 2 (27/07) tại Hội trường Tầng 2. Nội dung chính: Đánh giá tiêu chuẩn ISO phòng Xét nghiệm Sinh hóa & nghiệm thu máy Cobas e601.',
    category: 'Lịch họp',
    senderId: 'USR-001',
    senderName: 'TS. BS. Phạm Đức Thành',
    senderRole: 'Trưởng khoa',
    createdAt: '2026-07-25 16:30',
    isUrgent: false,
    reactions: [{ emoji: '❤️', count: 4, users: ['KTV. Vũ Văn Hải', 'BS. Trịnh Thu Hà'] }]
  },
  {
    id: 'ANC-003',
    title: '🔄 Phê Duyệt Thay Đổi Lịch Trực Đêm Ca Cấp Cứu 26/07',
    content: 'Trưởng khoa đã phê duyệt đề xuất đổi ca trực giữa KTV. Vũ Văn Hải và KTV. Nguyễn Thị Mai. Ca trực đêm nay 26/07 do KTV. Vũ Văn Hải đảm nhiệm chính.',
    category: 'Đổi lịch trực',
    senderId: 'USR-003',
    senderName: 'CN. Lê Thị Hương',
    senderRole: 'Điều dưỡng trưởng',
    createdAt: '2026-07-26 07:45',
    isUrgent: false,
    reactions: [{ emoji: 'Done ✅', count: 3, users: ['KTV. Vũ Văn Hải', 'TS. BS. Phạm Đức Thành'] }]
  }
];

export const initialChatMessages: ChatChannelMessage[] = [
  {
    id: 'MSG-001',
    channelId: 'toan-khoa',
    channelName: 'Toàn khoa Cận Lâm Sàng',
    senderId: 'USR-001',
    senderName: 'TS. BS. Phạm Đức Thành',
    senderRole: 'Trưởng khoa',
    avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
    content: 'Chào toàn thể cán bộ nhân viên Khoa Cận Lâm Sàng! Đề nghị các bộ phận kiểm tra lại lịch trực tuần mới và hoàn thiện hồ sơ ngoại kiểm EQA.',
    timestamp: 'Hôm nay, 08:00',
    msgType: 'text',
    isPinned: true,
    reactions: [
      { emoji: '👍', count: 4, users: ['ThS. BS. Nguyễn Hoài Nam', 'CN. Lê Thị Hương', 'KTV. Vũ Văn Hải'] },
      { emoji: '❤️', count: 2, users: ['BS. Trịnh Thu Hà'] }
    ]
  },
  {
    id: 'MSG-002',
    channelId: 'toan-khoa',
    channelName: 'Toàn khoa Cận Lâm Sàng',
    senderId: 'USR-003',
    senderName: 'CN. Lê Thị Hương',
    senderRole: 'Điều dưỡng trưởng',
    avatar: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150&auto=format&fit=crop&q=80',
    content: 'Tôi vừa đính kèm file Quy trình SOP lấy mẫu xét nghiệm an toàn phiên bản mới v3.0 cho toàn khoa tham khảo.',
    timestamp: 'Hôm nay, 08:10',
    msgType: 'pdf',
    fileName: 'SOP_CLS_01_Lay_Mau_An_Toan_v3.pdf',
    fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileSize: '2.45 MB',
    shareCard: {
      type: 'document',
      id: 'DOC-2001',
      title: 'Quy Trình Lấy Mẫu Xét Nghiệm An Toàn (SOP-CLS-01)',
      subtitle: 'Áp dụng bắt buộc cho toàn bộ KTV & Điều dưỡng',
      badge: 'v3.0 - ISO 15189'
    },
    reactions: [{ emoji: 'Done ✅', count: 3, users: ['KTV. Vũ Văn Hải'] }]
  },
  {
    id: 'MSG-003',
    channelId: 'may-ct',
    channelName: 'Nhóm Máy CT Scanner 128',
    senderId: 'USR-002',
    senderName: 'ThS. BS. Nguyễn Hoài Nam',
    senderRole: 'Phó khoa',
    avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80',
    content: '@KTV. Vũ Văn Hải Ca chụp MSCT 128 dải dựng hình động mạch chủ ngực khẩn cấp cho BN N.V.M đã gửi lên hệ thống PACS. Bác sĩ chuyên khoa Tim mạch đã đọc xong kết quả!',
    timestamp: 'Hôm nay, 08:30',
    msgType: 'text',
    mentions: ['KTV. Vũ Văn Hải'],
    shareCard: {
      type: 'task',
      id: 'TSK-1001',
      title: 'Đọc Phim MSCT 128 Dải - Phình ĐC Chủ Ngực',
      subtitle: 'Bệnh nhân N.V.M (65T) - Khoa Cấp Cứu',
      badge: 'Khẩn cấp'
    },
    reactions: [{ emoji: '🔥', count: 2, users: ['KTV. Vũ Văn Hải'] }]
  },
  {
    id: 'MSG-004',
    channelId: 'bac-si',
    channelName: 'Nhóm Bác sĩ Chẩn đoán',
    senderId: 'USR-005',
    senderName: 'BS. Trịnh Thu Hà',
    senderRole: 'Bác sĩ',
    avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80',
    content: 'Gửi các Bác sĩ sơ đồ phân tích kết quả siêu âm Doppler tim màu ca lâm sàng hiếm gặp sáng nay.',
    timestamp: 'Hôm nay, 08:45',
    msgType: 'image',
    fileName: 'Sieu_Am_Doppler_Heart_Case.png',
    fileUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&auto=format&fit=crop&q=80',
    fileSize: '1.2 MB'
  },
  // Direct Messages (1-on-1 Chats)
  {
    id: 'MSG-005',
    dmUserId: 'USR-002', // DM between current user and Nam
    dmUserName: 'ThS. BS. Nguyễn Hoài Nam',
    senderId: 'USR-002',
    senderName: 'ThS. BS. Nguyễn Hoài Nam',
    senderRole: 'Phó khoa',
    avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80',
    content: 'Chào Anh Thành, anh đã xem qua báo cáo thẩm định hồ sơ máy MRI 3.0T tuần tới chưa ạ?',
    timestamp: 'Hôm nay, 08:50',
    msgType: 'text',
    isRead: true
  },
  {
    id: 'MSG-006',
    dmUserId: 'USR-002',
    dmUserName: 'ThS. BS. Nguyễn Hoài Nam',
    senderId: 'USR-001',
    senderName: 'TS. BS. Phạm Đức Thành',
    senderRole: 'Trưởng khoa',
    avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
    content: 'Tôi vừa xem xong rồi Nam nhé. Hồ sơ chuẩn bị rất kỹ, chiều nay giao ban anh sẽ ký duyệt phê duyệt dự toán bảo trì.',
    timestamp: 'Hôm nay, 08:52',
    msgType: 'text',
    isRead: true,
    reactions: [{ emoji: '👍', count: 1, users: ['ThS. BS. Nguyễn Hoài Nam'] }]
  },
  {
    id: 'MSG-007',
    dmUserId: 'USR-004',
    dmUserName: 'KTV. Vũ Văn Hải',
    senderId: 'USR-004',
    senderName: 'KTV. Vũ Văn Hải',
    senderRole: 'Kỹ thuật viên',
    avatar: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150&auto=format&fit=crop&q=80',
    content: 'Báo cáo Trưởng khoa: Máy xét nghiệm sinh hóa Roche Cobas e601 đã hoàn thành calibration đầu ca sáng ạ!',
    timestamp: 'Hôm nay, 09:00',
    msgType: 'sticker',
    fileName: 'Sticker_Done.png',
    fileUrl: '✅',
    isRead: false
  }
];

export const initialNotifications: NotificationLog[] = [
  {
    id: 'NOTIF-001',
    recipient: 'ThS. BS. Nguyễn Hoài Nam',
    targetAddress: 'nam.nguyen@hospital.vn',
    title: 'Phim MSCT khẩn: Phình động mạch chủ ngực',
    content: 'Yêu cầu đọc phim và trả kết quả gấp cho bệnh nhân N.V.M từ Khoa Cấp cứu.',
    channel: 'Email',
    status: 'Đã gửi',
    sentAt: '2026-07-26 08:15'
  },
  {
    id: 'NOTIF-002',
    recipient: 'KTV. Vũ Văn Hải',
    targetAddress: '654321098',
    title: 'Cảnh báo Telegram: QC Máy xét nghiệm Roche Cobas',
    content: 'Đã đến giờ kiểm chuẩn QC đầu ca sáng 26/07/2026. Vui lòng ghi sổ nhật ký ISO.',
    channel: 'Telegram',
    status: 'Đã gửi',
    sentAt: '2026-07-26 07:00'
  },
  {
    id: 'NOTIF-003',
    recipient: 'TS. BS. Phạm Đức Thành',
    targetAddress: 'thanh.pham@hospital.vn',
    title: 'Cảnh báo Hồ sơ sắp hết hạn: An toàn Bức xạ CT',
    content: 'Giấy chứng nhận an toàn bức xạ phòng CT Scanner sẽ hết hạn ngày 01/08/2026.',
    channel: 'In-App',
    status: 'Đã gửi',
    sentAt: '2026-07-26 08:00'
  }
];

export const initialAuditLogs: AuditLogItem[] = [
  {
    id: 'LOG-8001',
    userEmail: 'thanh.pham@hospital.vn',
    userName: 'TS. BS. Phạm Đức Thành',
    userRole: 'Admin',
    action: 'CREATE_TASK',
    module: 'Task',
    timestamp: '2026-07-26 08:10:12',
    ipAddress: '118.69.182.45',
    device: 'Chrome 126.0 (Windows 11)',
    newData: '{"title":"Đọc phim MSCT 128 dải...","priority":"Khẩn cấp","assignee":"ThS. BS. Nguyễn Hoài Nam"}'
  },
  {
    id: 'LOG-8002',
    userEmail: 'hai.vu@hospital.vn',
    userName: 'KTV. Vũ Văn Hải',
    userRole: 'Staff',
    action: 'UPDATE_TASK_STATUS',
    module: 'Task',
    timestamp: '2026-07-26 07:15:00',
    ipAddress: '14.161.22.10',
    device: 'Safari 17.4 (macOS)',
    oldData: '{"status":"Chờ xử lý"}',
    newData: '{"status":"Đang thực hiện"}'
  },
  {
    id: 'LOG-8003',
    userEmail: 'huong.le@hospital.vn',
    userName: 'CN. Lê Thị Hương',
    userRole: 'Staff',
    action: 'UPLOAD_DOCUMENT',
    module: 'Document',
    timestamp: '2026-07-20 09:40:22',
    ipAddress: '118.69.182.45',
    device: 'Edge 126.0 (Windows 10)',
    newData: '{"title":"Quy_Trinh_Lay_Mau_An_Toan_SOP_CLS_01.pdf","docType":"Quy trình SOP"}'
  }
];

export const initialSettings: AppSettings = {
  telegramBotToken: '7123456789:AAFxxx_MockTelegramTokenCLSWorkHub',
  defaultTelegramChatId: '987654321',
  googleDriveFolderId: '1CLSWorkHub_MainFolder_GoogleDrive_ID',
  // 1. Google Sheet Báo cáo số ca (Báo cáo & Thống kê)
  googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
  reportGoogleSheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  // 2. Google Sheet Cơ sở dữ liệu lưu ID tệp tải lên
  googleSheetName: 'CLS_WorkHub_FileIndex_Database',
  googleSheetId: '1Spreadsheet_DB_CLS_WorkHub_Key',
  smtpServer: 'smtp.gmail.com',
  smtpPort: 587,
  smtpUser: 'khoa.canlamsang@hospital.vn',
  theme: 'light',
  language: 'vi',
  debugMode: true,
  cacheTtlMinutes: 10,
  lockTimeoutMs: 30000
};

// --- Initial Equipment & Machine Management Data ---
export const initialEquipment: EquipmentItem[] = [
  {
    id: 'EQ-CT-01',
    code: 'MSCT-128-01',
    name: 'Máy Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải',
    category: 'Chẩn đoán hình ảnh',
    model: 'Somatom Go.Top 128',
    manufacturer: 'Siemens Healthineers',
    originCountry: 'CHLB Đức',
    yearOfManufacture: 2023,
    serialNumber: 'SN-CT128-2023-998',
    room: 'Phòng MSCT 128 Dải - Tầng 1',
    assignedTechnician: 'KTV. Vũ Văn Hải',
    managerInCharge: 'ThS. BS. Nguyễn Hoài Nam',
    status: 'Hoạt động tốt',
    installationDate: '2023-05-10',
    purchaseDate: '2023-04-15',
    purchasePrice: 28500000000,
    supplier: 'Công ty TNHH Thiết Bị Y Tế Siemens Healthcare Việt Nam',
    warrantyExpiry: '2026-05-10',
    maintenanceIntervalMonths: 3,
    lastMaintenanceDate: '2026-05-15',
    nextMaintenanceDate: '2026-08-15',
    operatingPermitNumber: 'GPHĐ-BYT/2023-1092',
    operatingPermitExpiry: '2028-05-10',
    radiationLicenseNumber: 'ATBX-HN-2023-455',
    radiationLicenseExpiry: '2026-08-01', // Sắp hết hạn!
    radiationLicenseIssuedBy: 'Cục An Toàn Bức Xạ & Hạt Nhân - Bộ KH&CN',
    calibrationNumber: 'KD-TT1-2025-8831',
    calibrationExpiry: '2026-11-20',
    calibrationIssuedBy: 'Trung tâm Kỹ thuật Tiêu chuẩn Đo lường Chất lượng 1 (Quatest 1)',
    powerSupply: '380V - 3 Pha / 100 kVA',
    specifications: '128 dãy đầu thu Stellar, tốc độ quay 0.33s/vòng, công nghệ giảm liều tia X thông minh Care Dose4D, hỗ trợ tưới máu não đa pha, nội soi đại tràng ảo & chụp mạch vành tim.',
    maintenanceHistory: [
      {
        id: 'MNT-101',
        equipmentId: 'EQ-CT-01',
        equipmentName: 'Máy Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải',
        date: '2026-05-15',
        type: 'Định kỳ',
        performedBy: 'Kỹ sư Trưởng Siemens Medical - Đặng Quốc Bảo',
        result: 'Đạt',
        notes: 'Hiệu chỉnh bóng X-Quang, vệ sinh lọc bụi làm mát, kiểm tra dòng chuẩn kV/mA, hiệu chuẩn bộ chuẩn trực liều tia đạt chuẩn quy định ISO 15189.',
        nextDueDate: '2026-08-15',
        cost: 18500000
      },
      {
        id: 'MNT-100',
        equipmentId: 'EQ-CT-01',
        equipmentName: 'Máy Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải',
        date: '2026-02-12',
        type: 'Hiệu chuẩn',
        performedBy: 'Quatest 1 & KTV. Vũ Văn Hải',
        result: 'Đạt',
        notes: 'Đo đạc kiểm chuẩn độ đồng nhất hình ảnh HU, kiểm tra độ phân giải không gian và liều CTDIvol.',
        nextDueDate: '2026-05-15',
        cost: 12000000
      }
    ],
    repairHistory: [
      {
        id: 'RPR-201',
        equipmentId: 'EQ-CT-01',
        equipmentName: 'Máy Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải',
        issueDescription: 'Lỗi cảnh báo quá nhiệt bộ làm mát bóng X-quang ca trực đêm 10/04 do quạt phụ tản nhiệt ngừng quay.',
        reportedBy: 'KTV. Vũ Văn Hải',
        reportedAt: '2026-04-10 23:15',
        resolvedAt: '2026-04-11 09:30',
        replacedParts: 'Cảm biến nhiệt độ dầu & Quạt tản nhiệt khối cao thế',
        cost: 8200000,
        status: 'Đã khôi phục',
        technician: 'Kỹ sư Nguyễn Hoàng Anh (Siemens Medical)'
      }
    ]
  },
  {
    id: 'EQ-MRI-01',
    code: 'MRI-3T-01',
    name: 'Hệ Thống Cộng Hưởng Từ Magnetom Lumina 3.0 Tesla',
    category: 'Chẩn đoán hình ảnh',
    model: 'Magnetom Lumina 3.0T',
    manufacturer: 'Siemens Healthineers',
    originCountry: 'CHLB Đức',
    yearOfManufacture: 2023,
    serialNumber: 'SN-MRI30T-8871',
    room: 'Phòng Máy MRI 3.0T - Tầng 1',
    assignedTechnician: 'ThS. BS. Nguyễn Hoài Nam',
    managerInCharge: 'TS. BS. Phạm Đức Thành',
    status: 'Cần bảo trì',
    installationDate: '2024-01-15',
    purchaseDate: '2023-11-20',
    purchasePrice: 42000000000,
    supplier: 'Siemens Healthcare VN',
    warrantyExpiry: '2027-01-15',
    maintenanceIntervalMonths: 6,
    lastMaintenanceDate: '2026-01-20',
    nextMaintenanceDate: '2026-07-20', // Đã quá hạn!
    operatingPermitNumber: 'GPHĐ-BYT/2024-0322',
    operatingPermitExpiry: '2029-01-15',
    calibrationNumber: 'KD-TT1-2026-1102',
    calibrationExpiry: '2026-12-10',
    calibrationIssuedBy: 'Viện Trang Thiết Bị & Công Trình Y Tế',
    powerSupply: '380V - 3 Pha / 120 kVA + UPS True Online',
    specifications: 'Từ trường 3.0 Tesla siêu dẫn, đường kính khoang 70cm, công nghệ BioMatrix tự động điều chỉnh theo nhịp thở bệnh nhân, chuỗi xung thần kinh Turbo Suite, cơ xương khớp & tim mạch nâng cao.',
    maintenanceHistory: [
      {
        id: 'MNT-201',
        equipmentId: 'EQ-MRI-01',
        equipmentName: 'Hệ Thống Cộng Hưởng Từ Magnetom Lumina 3.0 Tesla',
        date: '2026-01-20',
        type: 'Định kỳ',
        performedBy: 'Đội ngũ Kỹ sư Chuyên gia Siemens & Viện TTBYT',
        result: 'Đạt',
        notes: 'Kiểm tra áp suất và mức tiêu hao Helium lỏng (đạt 94%), hiệu chuẩn coil RF sọ não và cột sống.',
        nextDueDate: '2026-07-20',
        cost: 35000000
      }
    ],
    repairHistory: []
  },
  {
    id: 'EQ-LAB-01',
    code: 'XN-COBAS-601',
    name: 'Hệ Thống Phân Tích Miễn Dịch Tự Động Roche Cobas e601',
    category: 'Xét nghiệm',
    model: 'Cobas e601 module',
    manufacturer: 'Roche Diagnostics',
    originCountry: 'Thụy Sĩ',
    yearOfManufacture: 2022,
    serialNumber: 'SN-ROCHE-601-445',
    room: 'Phòng Xét nghiệm Sinh hóa & Miễn dịch',
    assignedTechnician: 'CN. Lê Thị Hương',
    managerInCharge: 'TS. BS. Phạm Đức Thành',
    status: 'Hoạt động tốt',
    installationDate: '2022-11-01',
    purchaseDate: '2022-09-10',
    purchasePrice: 6800000000,
    supplier: 'Công ty TNHH Roche Việt Nam',
    warrantyExpiry: '2025-11-01',
    maintenanceIntervalMonths: 1,
    lastMaintenanceDate: '2026-07-01',
    nextMaintenanceDate: '2026-08-01',
    operatingPermitNumber: 'GPHĐ-BYT/2022-9901',
    operatingPermitExpiry: '2027-11-01',
    calibrationNumber: 'KD-ROCHE-2026-0711',
    calibrationExpiry: '2026-09-15',
    calibrationIssuedBy: 'Trung tâm Kiểm chuẩn Chất lượng Xét nghiệm Y học',
    powerSupply: '220V - 50Hz / 2.5 kVA',
    specifications: 'Công nghệ điện hóa phát quang ECL (Electrochemiluminescence), công suất 170 test/giờ, nạp mẫu liên tục 150 vị trí, phát hiện marker ung thư CEA/AFP/PSA, tim mạch Troponin T-hs, nội tiết tố và viêm gan virus.',
    maintenanceHistory: [
      {
        id: 'MNT-301',
        equipmentId: 'EQ-LAB-01',
        equipmentName: 'Hệ Thống Phân Tích Miễn Dịch Tự Động Roche Cobas e601',
        date: '2026-07-01',
        type: 'Định kỳ',
        performedBy: 'KTV. Vũ Văn Hải & Chuyên gia Roche',
        result: 'Đạt',
        notes: 'Vệ sinh kim hút probe, thay thế ống peristaltic pump, chạy kiểm chuẩn mẫu chuẩn Calibrator và Control 3 mức nồng độ đều nằm trong giới hạn 1SD.',
        nextDueDate: '2026-08-01',
        cost: 4500000
      }
    ],
    repairHistory: []
  },
  {
    id: 'EQ-LAB-02',
    code: 'XN-SYSMEX-XN',
    name: 'Máy Phân Tích Huyết Học Tự Động Sysmex XN-1000',
    category: 'Xét nghiệm',
    model: 'Sysmex XN-1000',
    manufacturer: 'Sysmex Corporation',
    originCountry: 'Nhật Bản',
    yearOfManufacture: 2023,
    serialNumber: 'SN-SYS-XN1000-112',
    room: 'Phòng Xét nghiệm Huyết học & Truyền máu',
    assignedTechnician: 'CN. Lê Thị Hương',
    managerInCharge: 'CN. Lê Thị Hương',
    status: 'Đang hiệu chuẩn',
    installationDate: '2023-08-20',
    purchaseDate: '2023-07-05',
    purchasePrice: 4200000000,
    supplier: 'Sysmex Vietnam Co., Ltd',
    warrantyExpiry: '2026-08-20',
    maintenanceIntervalMonths: 3,
    lastMaintenanceDate: '2026-04-20',
    nextMaintenanceDate: '2026-07-20',
    operatingPermitNumber: 'GPHĐ-BYT/2023-7744',
    operatingPermitExpiry: '2028-08-20',
    calibrationNumber: 'KD-SYS-2026-441',
    calibrationExpiry: '2026-07-26', // Hạn hiệu chuẩn hôm nay!
    calibrationIssuedBy: 'Viện Huyết Học & Truyền Máu Trung Ương',
    powerSupply: '220V - 50Hz / 1.5 kVA',
    specifications: 'Phân tích 32 thông số huyết học toàn phần (CBC + Diff + RET), công nghệ Laser Flow Cytometry huỳnh quang nhuộm tế bào máu, tự động phát hiện tế bào bất thường và đếm tiểu cầu huỳnh quang PLT-F.',
    maintenanceHistory: [
      {
        id: 'MNT-401',
        equipmentId: 'EQ-LAB-02',
        equipmentName: 'Máy Phân Tích Huyết Học Tự Động Sysmex XN-1000',
        date: '2026-04-20',
        type: 'Định kỳ',
        performedBy: 'Kỹ sư Sysmex - Trần Minh Đức',
        result: 'Đạt',
        notes: 'Bảo trì buồng phản ứng quang học, căn chỉnh dòng chảy Sheath flow và rửa hệ thống đường ống hóa chất Cellpack.',
        nextDueDate: '2026-07-20',
        cost: 3200000
      }
    ],
    repairHistory: []
  },
  {
    id: 'EQ-US-01',
    code: 'SA-VOLUSON-E10',
    name: 'Máy Siêu Âm Màu 4D Nâng Cao GE Voluson E10 Expert',
    category: 'Siêu âm',
    model: 'Voluson E10 BT22',
    manufacturer: 'GE Healthcare',
    originCountry: 'Hoa Kỳ (USA)',
    yearOfManufacture: 2024,
    serialNumber: 'SN-EQ-VOL-2024-88',
    room: 'Phòng Siêu âm Màu 01 - Tầng 2',
    assignedTechnician: 'BS. Trịnh Thu Hà',
    managerInCharge: 'BS. Trịnh Thu Hà',
    status: 'Hoạt động tốt',
    installationDate: '2024-03-01',
    purchaseDate: '2024-01-18',
    purchasePrice: 5900000000,
    supplier: 'GE Healthcare Vietnam',
    warrantyExpiry: '2027-03-01',
    maintenanceIntervalMonths: 6,
    lastMaintenanceDate: '2026-03-05',
    nextMaintenanceDate: '2026-09-05',
    operatingPermitNumber: 'GPHĐ-BYT/2024-1188',
    operatingPermitExpiry: '2029-03-01',
    calibrationNumber: 'KD-GE-2026-899',
    calibrationExpiry: '2027-03-01',
    calibrationIssuedBy: 'Trung tâm Đo lường Chất lượng 1',
    powerSupply: '220V - 50Hz / 1.2 kVA',
    specifications: 'Kiến trúc phần cứng Radiance System, đầu dò ma trận khối eSTIC, phần mềm xử lý hình ảnh Silhouette & HDlive Studio tái tạo giải phẫu thai nhi và mạch máu tim sâu thời gian thực.',
    maintenanceHistory: [
      {
        id: 'MNT-501',
        equipmentId: 'EQ-US-01',
        equipmentName: 'Máy Siêu Âm Màu 4D Nâng Cao GE Voluson E10 Expert',
        date: '2026-03-05',
        type: 'Định kỳ',
        performedBy: 'Kỹ sư GE Healthcare & BS. Trịnh Thu Hà',
        result: 'Đạt',
        notes: 'Kiểm tra tính toàn vẹn thấu kính 4 đầu dò (Convex, Tuyến giáp, Khối 4D, Âm đạo), nâng cấp bản vá phần mềm BT22.2.',
        nextDueDate: '2026-09-05',
        cost: 6500000
      }
    ],
    repairHistory: []
  },
  {
    id: 'EQ-ENDO-01',
    code: 'NS-OLYMPUS-190',
    name: 'Hệ Thống Nội Soi Tiêu Hóa NBI Olympus EVIS EXERA III CV-190',
    category: 'Nội soi',
    model: 'EVIS EXERA III CV-190',
    manufacturer: 'Olympus Medical Systems',
    originCountry: 'Nhật Bản',
    yearOfManufacture: 2023,
    serialNumber: 'SN-OLY-CV190-332',
    room: 'Phòng Nội Soi Tiêu Hóa - Tầng 2',
    assignedTechnician: 'TS. BS. Phạm Đức Thành',
    managerInCharge: 'TS. BS. Phạm Đức Thành',
    status: 'Hoạt động tốt',
    installationDate: '2023-02-15',
    purchaseDate: '2022-12-28',
    purchasePrice: 7500000000,
    supplier: 'Công ty Cổ phần Thiết Bị Y Tế Olympus VN',
    warrantyExpiry: '2026-02-15',
    maintenanceIntervalMonths: 3,
    lastMaintenanceDate: '2026-06-10',
    nextMaintenanceDate: '2026-09-10',
    operatingPermitNumber: 'GPHĐ-BYT/2023-0512',
    operatingPermitExpiry: '2028-02-15',
    calibrationNumber: 'KD-OLY-2026-339',
    calibrationExpiry: '2027-02-15',
    calibrationIssuedBy: 'Viện Trang Thiết Bị & Công Trình Y Tế',
    powerSupply: '220V - 50Hz / 1.8 kVA',
    specifications: 'Nguồn sáng Xenon CLV-190, xử lý ảnh HDTV độ nét cao, công nghệ nhuộm dải tần hẹp Dual Focus NBI phóng đại 100 lần tầm soát ung thư biểu mô sớm đường tiêu hóa trên và dưới.',
    maintenanceHistory: [
      {
        id: 'MNT-601',
        equipmentId: 'EQ-ENDO-01',
        equipmentName: 'Hệ Thống Nội Soi Tiêu Hóa NBI Olympus EVIS EXERA III CV-190',
        date: '2026-06-10',
        type: 'Định kỳ',
        performedBy: 'Kỹ sư Olympus Medical - Hoàng Văn Lâm',
        result: 'Đạt',
        notes: 'Kiểm tra độ kín áp lực nước dây soi dạ dày GIF-HQ190 và đại tràng CF-HQ190L, khử khuẩn và đo cường độ đèn Xenon.',
        nextDueDate: '2026-09-10',
        cost: 8500000
      }
    ],
    repairHistory: []
  },
  {
    id: 'EQ-XR-01',
    code: 'XQ-DIGITAL-01',
    name: 'Máy Chụp X-Quang Kỹ Thuật Số Treo Trần Siemens Ysio Max',
    category: 'Chẩn đoán hình ảnh',
    model: 'Ysio Max Ceiling',
    manufacturer: 'Siemens Healthineers',
    originCountry: 'CHLB Đức',
    yearOfManufacture: 2023,
    serialNumber: 'SN-XQ-YSIO-2023-882',
    room: 'Phòng X-Quang KTS 01 - Tầng 1',
    assignedTechnician: 'KTV. Vũ Văn Hải',
    managerInCharge: 'ThS. BS. Nguyễn Hoài Nam',
    status: 'Hoạt động tốt',
    installationDate: '2023-06-15',
    purchaseDate: '2023-04-10',
    purchasePrice: 6500000000,
    depreciationYears: 8,
    supplier: 'Công ty TNHH Thiết Bị Y Tế Siemens Healthcare Việt Nam',
    warrantyExpiry: '2026-06-15',
    maintenanceIntervalMonths: 3,
    lastMaintenanceDate: '2026-06-15',
    nextMaintenanceDate: '2026-09-15',
    operatingPermitNumber: 'GPHĐ-BYT/2023-3399',
    operatingPermitExpiry: '2028-06-15',
    radiationLicenseNumber: 'ATBX-HN-2023-882',
    radiationLicenseExpiry: '2026-07-15', // Đã quá hạn kiểm xạ -> Kích hoạt Khóa chéo An toàn Bức xạ!
    radiationLicenseIssuedBy: 'Cục An Toàn Bức Xạ & Hạt Nhân - Bộ KH&CN',
    calibrationNumber: 'KD-TT1-2026-551',
    calibrationExpiry: '2026-12-15',
    calibrationIssuedBy: 'Trung tâm Kỹ thuật Tiêu chuẩn Đo lường Chất lượng 1 (Quatest 1)',
    powerSupply: '380V - 3 Pha / 65 kVA',
    specifications: 'Tấm cảm biến phẳng không dây MAX wi-D, cánh tay treo trần tự động bám vị trí bóng, chương trình tự động tối ưu liều tia CARE, xử lý ảnh MAX image processing.',
    maintenanceHistory: [
      {
        id: 'MNT-701',
        equipmentId: 'EQ-XR-01',
        equipmentName: 'Máy Chụp X-Quang Kỹ Thuật Số Treo Trần Siemens Ysio Max',
        date: '2026-06-15',
        type: 'Định kỳ',
        performedBy: 'Kỹ sư Siemens Medical - Nguyễn Hoàng Anh',
        result: 'Đạt',
        notes: 'Kiểm tra độ chuẩn trực chùm tia X, đo liều phát DAP, kiểm tra cơ cấu nâng hạ cột bóng và tấm nhận ảnh.',
        nextDueDate: '2026-09-15',
        cost: 6500000
      }
    ],
    repairHistory: []
  }
];

// --- Initial Room Management Data ---
export const initialRooms: ParaclinicalRoom[] = [
  {
    id: 'RM-CT-01',
    code: 'P-101-CT',
    name: 'Phòng Chụp MSCT 128 Dải',
    departmentSection: 'Chẩn đoán hình ảnh',
    floor: 'Tầng 1 - Khu Cận Lâm Sàng',
    maxCapacityCasesPerDay: 45,
    currentDayCases: 38,
    utilizationRate: 84,
    status: 'Đang hoạt động',
    primaryEquipment: 'Máy Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải',
    managerInCharge: 'ThS. BS. Nguyễn Hoài Nam',
    reservations: [
      {
        id: 'RES-101',
        roomId: 'RM-CT-01',
        roomName: 'Phòng Chụp MSCT 128 Dải',
        date: '2026-07-26',
        startTime: '08:30',
        endTime: '09:30',
        purpose: 'Chụp MSCT tim & động mạch chủ ngực khẩn ca Cấp cứu',
        doctorInCharge: 'ThS. BS. Nguyễn Hoài Nam',
        technicianInCharge: 'KTV. Vũ Văn Hải',
        status: 'Đang sử dụng',
        equipmentUsed: 'MSCT-128-01',
        patientInfo: 'BN Nguyễn Văn M (65T) - Khoa Cấp Cứu'
      },
      {
        id: 'RES-102',
        roomId: 'RM-CT-01',
        roomName: 'Phòng Chụp MSCT 128 Dải',
        date: '2026-07-26',
        startTime: '10:00',
        endTime: '11:00',
        purpose: 'Chụp MSCT sọ não & mạch máu não tầm soát đột quỵ',
        doctorInCharge: 'TS. BS. Phạm Đức Thành',
        technicianInCharge: 'KTV. Vũ Văn Hải',
        status: 'Đã xác nhận',
        equipmentUsed: 'MSCT-128-01',
        patientInfo: 'BN Trần Thị B (52T) - Khoa Thần kinh'
      }
    ]
  },
  {
    id: 'RM-MRI-01',
    code: 'P-102-MRI',
    name: 'Phòng Chụp Cộng Hưởng Từ MRI 3.0T',
    departmentSection: 'Chẩn đoán hình ảnh',
    floor: 'Tầng 1 - Khu Cận Lâm Sàng',
    maxCapacityCasesPerDay: 25,
    currentDayCases: 18,
    utilizationRate: 72,
    status: 'Đang hoạt động',
    primaryEquipment: 'Hệ Thống Cộng Hưởng Từ Magnetom Lumina 3.0 Tesla',
    managerInCharge: 'ThS. BS. Nguyễn Hoài Nam',
    reservations: []
  },
  {
    id: 'RM-XN-01',
    code: 'P-201-XN',
    name: 'Phòng Xét Nghiệm Sinh Hóa & Miễn Dịch',
    departmentSection: 'Xét nghiệm',
    floor: 'Tầng 2 - Khu Xét nghiệm ISO 15189',
    maxCapacityCasesPerDay: 300,
    currentDayCases: 245,
    utilizationRate: 81,
    status: 'Đang hoạt động',
    primaryEquipment: 'Hệ Thống Phân Tích Miễn Dịch Tự Động Roche Cobas e601',
    managerInCharge: 'CN. Lê Thị Hương',
    reservations: []
  },
  {
    id: 'RM-XN-02',
    code: 'P-202-XN',
    name: 'Phòng Xét Nghiệm Huyết Học & Truyền Máu',
    departmentSection: 'Xét nghiệm',
    floor: 'Tầng 2 - Khu Xét nghiệm ISO 15189',
    maxCapacityCasesPerDay: 250,
    currentDayCases: 190,
    utilizationRate: 76,
    status: 'Đang hoạt động',
    primaryEquipment: 'Máy Phân Tích Huyết Học Sysmex XN-1000',
    managerInCharge: 'CN. Lê Thị Hương',
    reservations: []
  },
  {
    id: 'RM-SA-01',
    code: 'P-205-SA',
    name: 'Phòng Siêu Âm Tim & Mạch Máu 01',
    departmentSection: 'Thăm dò chức năng',
    floor: 'Tầng 2 - Khám Bệnh Chuyên Khoa',
    maxCapacityCasesPerDay: 40,
    currentDayCases: 32,
    utilizationRate: 80,
    status: 'Đang hoạt động',
    primaryEquipment: 'GE Voluson E10 Expert',
    managerInCharge: 'BS. Trịnh Thu Hà',
    reservations: []
  },
  {
    id: 'RM-NS-01',
    code: 'P-208-NS',
    name: 'Phòng Nội Soi Tiêu Hóa Can Thượng',
    departmentSection: 'Thăm dò chức năng',
    floor: 'Tầng 2 - Khu Nội Soi',
    maxCapacityCasesPerDay: 30,
    currentDayCases: 22,
    utilizationRate: 73,
    status: 'Đang hoạt động',
    primaryEquipment: 'Olympus EVIS EXERA III CV-190',
    managerInCharge: 'TS. BS. Phạm Đức Thành',
    reservations: []
  }
];

// --- Initial HR & Staff Profiles Data ---
export const initialStaffProfiles: StaffProfile[] = [
  {
    userId: 'USR-001',
    fullName: 'TS. BS. Phạm Đức Thành',
    title: 'Trưởng khoa',
    role: 'Admin',
    departmentSection: 'Ban Chủ Nhiệm Khoa & CĐHA',
    room: 'Ban Chủ Nhiệm Khoa',
    phone: '0912 345 678',
    email: 'ducthanh.pham@benhvien.vn',
    dob: '1978-04-12',
    gender: 'Nam',
    specialty: 'Chẩn đoán hình ảnh chuyên sâu & Cắt lớp vi tính, Nội soi can thiệp',
    experienceYears: 18,
    joinDate: '2018-05-10',
    degrees: ['Tiến sĩ Y Khoa (Đại học Y Hà Nội)', 'Bác sĩ CKI Chẩn đoán Hình ảnh', 'Chứng chỉ ISO 15189 Lead Auditor'],
    certificates: [
      {
        id: 'CERT-101',
        name: 'Chứng chỉ Hành Nghề Khám Chữa Bệnh CĐHA',
        code: 'CCHN-001882/BYT',
        issuedBy: 'Bộ Y Tế',
        issuedDate: '2012-04-10',
        expiryDate: '2028-04-10',
        status: 'Còn hiệu lực'
      },
      {
        id: 'CERT-102',
        name: 'Chứng chỉ An Toàn Bức Xạ Hạt Nhân & Phòng Rạ',
        code: 'ATBX-2023-889',
        issuedBy: 'Sở Khoa Học & Công Nghệ',
        issuedDate: '2023-08-15',
        expiryDate: '2026-08-15',
        status: 'Sắp hết hạn'
      }
    ],
    totalShiftsThisMonth: 12,
    leaveBalanceDays: 10,
    currentStatus: 'Đang làm việc',
    statusHistory: [
      {
        id: 'SH-101',
        startDate: '2024-01-01',
        endDate: 'Hiện tại',
        status: 'Đang làm việc',
        departmentSection: 'Ban Chủ Nhiệm Khoa & CĐHA',
        room: 'Ban Chủ Nhiệm Khoa',
        positionOrTitle: 'Trưởng khoa',
        note: 'Bổ nhiệm Trưởng Khoa Cận Lâm Sàng',
        updatedBy: 'Hội đồng Quản trị'
      },
      {
        id: 'SH-102',
        startDate: '2018-05-10',
        endDate: '2023-12-31',
        status: 'Đang làm việc',
        departmentSection: 'Bộ phận Chẩn đoán Hình ảnh',
        room: 'Phòng MSCT 128 Dải',
        positionOrTitle: 'Phó khoa',
        note: 'Phụ trách chuyên môn CĐHA & KTS',
        updatedBy: 'Ban Giám Đốc'
      }
    ]
  },
  {
    userId: 'USR-002',
    fullName: 'ThS. BS. Nguyễn Hoài Nam',
    title: 'Phó khoa',
    role: 'Manager',
    departmentSection: 'Bộ phận Chẩn đoán Hình ảnh (CT / MRI)',
    room: 'Phòng Máy MRI 3.0T',
    phone: '0988 765 432',
    email: 'nam.nguyen@benhvien.vn',
    dob: '1984-08-25',
    gender: 'Nam',
    specialty: 'Cộng hưởng từ 3.0T, Đọc phim MSCT Tim mạch & Thần kinh',
    experienceYears: 12,
    joinDate: '2018-02-15',
    degrees: ['Thạc sĩ Y Khoa', 'Bác sĩ Nội trú CĐHA'],
    certificates: [
      {
        id: 'CERT-201',
        name: 'Chứng chỉ Hành Nghề Khám Chữa Bệnh CĐHA',
        code: 'CCHN-003412/BYT',
        issuedBy: 'Bộ Y Tế',
        issuedDate: '2016-06-20',
        expiryDate: '2031-06-20',
        status: 'Còn hiệu lực'
      },
      {
        id: 'CERT-202',
        name: 'Chứng chỉ Chụp & Đọc Phim MRI 3.0T Nâng Cao',
        code: 'MRI-CERT-2022',
        issuedBy: 'Hội Quang Học & CĐHA Việt Nam',
        issuedDate: '2022-11-05',
        expiryDate: '2027-11-05',
        status: 'Còn hiệu lực'
      }
    ],
    totalShiftsThisMonth: 14,
    leaveBalanceDays: 8,
    currentStatus: 'Đang làm việc',
    statusHistory: [
      {
        id: 'SH-201',
        startDate: '2023-06-01',
        endDate: 'Hiện tại',
        status: 'Đang làm việc',
        departmentSection: 'Bộ phận Chẩn đoán Hình ảnh (CT / MRI)',
        room: 'Phòng Máy MRI 3.0T',
        positionOrTitle: 'Phó khoa',
        note: 'Phụ trách Hệ thống Cộng hưởng từ 3.0T',
        updatedBy: 'TS. BS. Phạm Đức Thành'
      },
      {
        id: 'SH-202',
        startDate: '2018-02-15',
        endDate: '2023-05-31',
        status: 'Đang làm việc',
        departmentSection: 'Bộ phận Chẩn đoán Hình ảnh',
        room: 'Phòng X-Quang KTS 01',
        positionOrTitle: 'Bác sĩ CĐHA',
        note: 'Bác sĩ đọc phim X-quang & CT',
        updatedBy: 'Ban Giám Đốc'
      }
    ]
  },
  {
    userId: 'USR-003',
    fullName: 'CN. Lê Thị Hương',
    title: 'Điều dưỡng trưởng',
    role: 'Staff',
    departmentSection: 'Bộ phận Xét nghiệm & Quản lý Chất lượng ISO',
    room: 'Phòng Xét nghiệm Sinh hóa & Miễn dịch',
    phone: '0903 112 233',
    email: 'huong.le@benhvien.vn',
    dob: '1989-11-14',
    gender: 'Nữ',
    specialty: 'Sinh hóa lâm sàng, Kiểm chuẩn EQA ISO 15189, Quản lý vật tư hóa chất',
    experienceYears: 15,
    joinDate: '2015-08-01',
    degrees: ['Cử nhân Điều Dưỡng', 'Chứng chỉ Chuyên môn Xét nghiệm Y học'],
    certificates: [
      {
        id: 'CERT-301',
        name: 'Chứng chỉ Quản lý Chất lượng Phòng Xét Nghiệm ISO 15189:2022',
        code: 'ISO15189-2024-99',
        issuedBy: 'Viện Công Nhận Chất Lượng BoA',
        issuedDate: '2024-02-10',
        expiryDate: '2027-02-10',
        status: 'Còn hiệu lực'
      }
    ],
    totalShiftsThisMonth: 16,
    leaveBalanceDays: 12,
    currentStatus: 'Đang làm việc',
    statusHistory: [
      {
        id: 'SH-301',
        startDate: '2022-03-01',
        endDate: 'Hiện tại',
        status: 'Đang làm việc',
        departmentSection: 'Bộ phận Xét nghiệm & Quản lý Chất lượng ISO',
        room: 'Phòng Xét nghiệm Sinh hóa & Miễn dịch',
        positionOrTitle: 'Điều dưỡng trưởng',
        note: 'Phụ trách Quản lý Chất lượng ISO 15189',
        updatedBy: 'Ban Chủ Nhiệm Khoa'
      },
      {
        id: 'SH-302',
        startDate: '2015-08-01',
        endDate: '2022-02-28',
        status: 'Đang làm việc',
        departmentSection: 'Bộ phận Xét nghiệm',
        room: 'Phòng Xét nghiệm Huyết học',
        positionOrTitle: 'Cử nhân Điều dưỡng',
        note: 'KTV Xét nghiệm chính',
        updatedBy: 'Ban Giám Đốc'
      }
    ]
  },
  {
    userId: 'USR-004',
    fullName: 'KTV. Vũ Văn Hải',
    title: 'Kỹ thuật viên',
    role: 'Staff',
    departmentSection: 'Bộ phận Chẩn đoán Hình ảnh (CT / X-Quang)',
    room: 'Phòng MSCT 128 Dải - Tầng 1',
    phone: '0977 445 566',
    email: 'hai.vu@benhvien.vn',
    dob: '1996-03-30',
    gender: 'Nam',
    specialty: 'Kỹ thuật vận hành máy CT 128 dải & X-quang KTS, Dựng hình 3D',
    experienceYears: 8,
    joinDate: '2026-01-01',
    degrees: ['Cử nhân Kỹ thuật Hình ảnh Y học'],
    certificates: [
      {
        id: 'CERT-401',
        name: 'Chứng chỉ An Toàn Bức Xạ Cho KTV X-quang & CT',
        code: 'ATBX-2024-112',
        issuedBy: 'Sở KH&CN',
        issuedDate: '2024-01-20',
        expiryDate: '2027-01-20',
        status: 'Còn hiệu lực'
      }
    ],
    totalShiftsThisMonth: 18,
    leaveBalanceDays: 6,
    currentStatus: 'Đang thử việc',
    statusHistory: [
      {
        id: 'SH-401',
        startDate: '2026-06-01',
        endDate: 'Hiện tại',
        status: 'Đang thử việc',
        departmentSection: 'Bộ phận Chẩn đoán Hình ảnh (CT / X-Quang)',
        room: 'Phòng MSCT 128 Dải - Tầng 1',
        positionOrTitle: 'Kỹ thuật viên',
        note: 'Hợp đồng thử việc vị trí KTV Vận hành MSCT 128 dải (2 tháng)',
        updatedBy: 'CN. Lê Thị Hương'
      },
      {
        id: 'SH-402',
        startDate: '2026-01-01',
        endDate: '2026-05-31',
        status: 'Đang làm việc',
        departmentSection: 'Bộ phận Chẩn đoán Hình ảnh',
        room: 'Phòng X-Quang KTS 02',
        positionOrTitle: 'KTV Học việc',
        note: 'Thực tập sinh kỹ thuật hình ảnh',
        updatedBy: 'TS. BS. Phạm Đức Thành'
      }
    ]
  },
  {
    userId: 'USR-005',
    fullName: 'BS. Trịnh Thu Hà',
    title: 'Bác sĩ',
    role: 'Doctor',
    departmentSection: 'Bộ phận Thăm dò chức năng & Siêu âm',
    room: 'Phòng Siêu Âm Tim & Mạch Máu 01',
    phone: '0936 998 877',
    email: 'ha.trinh@benhvien.vn',
    dob: '1992-07-18',
    gender: 'Nữ',
    specialty: 'Siêu âm tim Doppler màu, Siêu âm mạch máu & Tầm soát ung thư',
    experienceYears: 7,
    joinDate: '2021-09-01',
    degrees: ['Bác sĩ Đa khoa', 'Chứng chỉ Chuyên khoa Định hướng Siêu âm Tim'],
    certificates: [
      {
        id: 'CERT-501',
        name: 'Chứng chỉ Thực Hành Siêu Âm Tim Mạch Doppler',
        code: 'SA-TIM-2021-08',
        issuedBy: 'Viện Tim Mạch Quốc Gia',
        issuedDate: '2021-09-12',
        expiryDate: '2026-09-12',
        status: 'Còn hiệu lực'
      }
    ],
    totalShiftsThisMonth: 15,
    leaveBalanceDays: 9,
    currentStatus: 'Nghỉ thai sản',
    statusHistory: [
      {
        id: 'SH-501',
        startDate: '2026-07-01',
        endDate: '2027-01-01',
        status: 'Nghỉ thai sản',
        departmentSection: 'Bộ phận Thăm dò chức năng & Siêu âm',
        room: 'Phòng Siêu Âm Tim & Mạch Máu 01',
        positionOrTitle: 'Bác sĩ Siêu âm',
        note: 'Hưởng chế độ nghỉ thai sản 06 tháng theo quy định',
        updatedBy: 'Ban Chủ Nhiệm Khoa'
      },
      {
        id: 'SH-502',
        startDate: '2021-09-01',
        endDate: '2026-06-30',
        status: 'Đang làm việc',
        departmentSection: 'Bộ phận Thăm dò chức năng & Siêu âm',
        room: 'Phòng Siêu Âm Tim & Mạch Máu 01',
        positionOrTitle: 'Bác sĩ Siêu âm',
        note: 'Bác sĩ phụ trách phòng Siêu âm Doppler',
        updatedBy: 'Ban Giám Đốc'
      }
    ]
  },
  {
    userId: 'USR-006',
    fullName: 'NV. Trần Bảo Ngọc',
    title: 'Nhân viên hành chính',
    role: 'Staff',
    departmentSection: 'Hành chính & Tiếp đón Khoa',
    room: 'Phòng Hành chính Khoa CLS - Tầng 1',
    phone: '0915 223 344',
    email: 'ngoc.tran@benhvien.vn',
    dob: '1998-09-05',
    gender: 'Nữ',
    specialty: 'Quản lý hồ sơ bệnh án, Tiếp đón bệnh nhân & Thống kê HIS/LIS',
    experienceYears: 5,
    joinDate: '2023-01-10',
    degrees: ['Cử nhân Quản trị Văn phòng'],
    certificates: [],
    totalShiftsThisMonth: 20,
    leaveBalanceDays: 14,
    currentStatus: 'Nghỉ không lương',
    statusHistory: [
      {
        id: 'SH-601',
        startDate: '2026-07-15',
        endDate: '2026-08-15',
        status: 'Nghỉ không lương',
        departmentSection: 'Hành chính & Tiếp đón Khoa',
        room: 'Phòng Hành chính Khoa CLS - Tầng 1',
        positionOrTitle: 'Nhân viên hành chính',
        note: 'Xin nghỉ không lương 1 tháng giải quyết việc riêng',
        updatedBy: 'TS. BS. Phạm Đức Thành'
      },
      {
        id: 'SH-602',
        startDate: '2023-01-10',
        endDate: '2026-07-14',
        status: 'Đang làm việc',
        departmentSection: 'Hành chính & Tiếp đón Khoa',
        room: 'Phòng Hành chính Khoa CLS - Tầng 1',
        positionOrTitle: 'Nhân viên hành chính',
        note: 'Tiếp nhận công tác hành chính khoa',
        updatedBy: 'Ban Giám Đốc'
      }
    ]
  }
];

// --- Initial Leave Requests Data ---
export const initialLeaveRequests: LeaveRequest[] = [
  {
    id: 'LR-2026-001',
    userId: 'USR-004',
    userName: 'KTV. Vũ Văn Hải',
    userRole: 'Kỹ thuật viên',
    leaveType: 'Phép năm',
    startDate: '2026-08-01',
    endDate: '2026-08-03',
    totalDays: 3,
    reason: 'Giải quyết công việc gia đình ở quê',
    substituteUserId: 'USR-002',
    substituteUserName: 'ThS. BS. Nguyễn Hoài Nam',
    status: 'Chờ duyệt',
    createdAt: '2026-07-25 14:20'
  },
  {
    id: 'LR-2026-002',
    userId: 'USR-005',
    userName: 'BS. Trịnh Thu Hà',
    userRole: 'Bác sĩ',
    leaveType: 'Học tập',
    startDate: '2026-07-28',
    endDate: '2026-07-29',
    totalDays: 2,
    reason: 'Tham dự Hội thảo Siêu âm Tim Mạch Toàn quốc tại Đà Nẵng',
    substituteUserId: 'USR-001',
    substituteUserName: 'TS. BS. Phạm Đức Thành',
    status: 'Đã phê duyệt',
    approvedBy: 'TS. BS. Phạm Đức Thành',
    createdAt: '2026-07-20 09:10'
  }
];

// --- Initial Training Courses Data ---
export const initialTrainingCourses: TrainingCourse[] = [
  {
    id: 'TRN-2026-01',
    title: 'Đào Tạo Liên Tục CME: Cập Nhật Chỉ Định & Kỹ Thuật Chụp MSCT 128 Dải Tim Mạch',
    category: 'CME',
    trainer: 'PGS. TS. Trần Văn Bình (Bệnh viện Bạch Mai)',
    location: 'Hội trường Tầng 3 - Bệnh viện',
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    creditsOrHours: '24 Tiết CME',
    targetAudience: 'Toàn bộ Bác sĩ CĐHA & Kỹ thuật viên MSCT/MRI',
    enrolledUsers: ['TS. BS. Phạm Đức Thành', 'ThS. BS. Nguyễn Hoài Nam', 'KTV. Vũ Văn Hải'],
    status: 'Sắp diễn ra'
  },
  {
    id: 'TRN-2026-02',
    title: 'Tập Huấn Chuẩn Hóa Quy Trình An Toàn Sinh Học & Kiểm Soát Chất Lượng ISO 15189:2022',
    category: 'ISO 15189',
    trainer: 'CN. Lê Thị Hương (Điều dưỡng trưởng)',
    location: 'Phòng Đào tạo Cận Lâm Sàng Tầng 2',
    startDate: '2026-07-15',
    endDate: '2026-07-16',
    creditsOrHours: '12 Giờ',
    targetAudience: 'Toàn bộ cán bộ nhân viên Xét nghiệm & Điều dưỡng',
    enrolledUsers: ['CN. Lê Thị Hương', 'BS. Trịnh Thu Hà'],
    status: 'Đã hoàn thành'
  }
];

// --- Initial Meetings Data ---
export const initialMeetings: MeetingItem[] = [
  {
    id: 'MTG-2026-101',
    title: 'Họp Giao Ban Tuần Khoa Cận Lâm Sàng & Đánh Giá ISO 15189',
    category: 'Giao ban khoa',
    date: '2026-07-27',
    time: '07:30 - 08:30',
    location: 'Phòng Giao Ban Khoa CLS - Tầng 2',
    chairperson: 'TS. BS. Phạm Đức Thành',
    secretary: 'CN. Lê Thị Hương',
    attendees: ['TS. BS. Phạm Đức Thành', 'ThS. BS. Nguyễn Hoài Nam', 'CN. Lê Thị Hương', 'KTV. Vũ Văn Hải', 'BS. Trịnh Thu Hà'],
    status: 'Sắp diễn ra',
    agenda: '1. Báo cáo hoạt động chuyên môn tuần qua.\n2. Rà soát tiến độ bảo trì máy MSCT 128 dải & gia hạn chứng nhận an toàn bức xạ.\n3. Đánh giá kết quả kiểm chuẩn EQA phòng xét nghiệm ISO 15189.\n4. Phân công ca trực tuần 31.',
    minutes: {
      id: 'MIN-101',
      summary: 'Giao ban tuần đã thống nhất kế hoạch kiểm chuẩn máy móc và phân công ca trực.',
      keyDiscussions: [
        'KTV. Vũ Văn Hải báo cáo bóng X-quang máy CT 128 dải hoạt động ổn định sau bảo trì.',
        'CN. Lê Thị Hương báo cáo kết quả ngoại kiểm EQA tháng 7 đạt 100% tiêu chí ISO 15189.',
        'ThS. BS. Nguyễn Hoài Nam đề xuất làm thủ tục xin gia hạn chứng nhận an toàn bức xạ phòng CT trước ngày 01/08.'
      ],
      conclusions: [
        'Đồng ý gia hạn chứng nhận an toàn bức xạ phòng CT Scanner 128 dải.',
        'Hoàn thiện hồ sơ đánh giá nội bộ ISO 15189 trước ngày 30/07/2026.'
      ],
      actionItems: [
        {
          id: 'ACT-001',
          taskTitle: 'Nộp hồ sơ gia hạn chứng nhận An toàn Bức xạ phòng MSCT 128 dải lên Sở KH&CN',
          assigneeName: 'ThS. BS. Nguyễn Hoài Nam',
          dueDate: '2026-07-30',
          priority: 'Cao',
          status: 'Chưa giao'
        },
        {
          id: 'ACT-002',
          taskTitle: 'Tải biểu mẫu kiểm chuẩn ISO 15189 mới lên thư mục Google Drive khoa',
          assigneeName: 'CN. Lê Thị Hương',
          dueDate: '2026-07-29',
          priority: 'Trung bình',
          status: 'Chưa giao'
        }
      ],
      recordedBy: 'CN. Lê Thị Hương',
      approvedBy: 'TS. BS. Phạm Đức Thành'
    }
  },
  {
    id: 'MTG-2026-102',
    title: 'Hội Chẩn Đa Khoa: Ca Bệnh Khó Đột Quỵ Não & Tổn Thương Mạch Máu Phức Tạp',
    category: 'Hội chẩn ca khó',
    date: '2026-07-28',
    time: '14:00 - 15:30',
    location: 'Phòng Hội Chẩn Trực Tuyến Tele-Medicine Tầng 1',
    chairperson: 'TS. BS. Phạm Đức Thành',
    secretary: 'ThS. BS. Nguyễn Hoài Nam',
    attendees: ['TS. BS. Phạm Đức Thành', 'ThS. BS. Nguyễn Hoài Nam', 'BS. Trịnh Thu Hà'],
    status: 'Sắp diễn ra',
    agenda: 'Phân tích hình ảnh MSCT tưới máu não 128 dải và MRI 3.0T dựng hình mạch máu cho bệnh nhân N.V.T (68 tuổi) nghi tắc hẹp động mạch thân nền.'
  }
];

// --- Initial Integration Endpoints & Payloads (HIS / LIS / PACS API Hub) ---
export const initialIntegrationEndpoints: IntegrationEndpoint[] = [
  {
    id: 'INT-HIS-01',
    systemName: 'HIS',
    protocol: 'REST API',
    endpointUrl: 'https://his.hospital.vn/api/v2/paraclinical/orders',
    status: 'Connected',
    lastSyncAt: '2026-07-26 09:15:20',
    latencyMs: 42,
    totalRequestsToday: 1420,
    errorCountToday: 0
  },
  {
    id: 'INT-LIS-01',
    systemName: 'LIS',
    protocol: 'HL7 v2.5',
    endpointUrl: 'mllp://lis.hospital.vn:2575/hl7/oru_r01',
    status: 'Connected',
    lastSyncAt: '2026-07-26 09:18:05',
    latencyMs: 18,
    totalRequestsToday: 890,
    errorCountToday: 1
  },
  {
    id: 'INT-PACS-01',
    systemName: 'PACS',
    protocol: 'DICOM Web',
    endpointUrl: 'https://pacs.hospital.vn/dicom-web/studies',
    status: 'Connected',
    lastSyncAt: '2026-07-26 09:17:40',
    latencyMs: 65,
    totalRequestsToday: 312,
    errorCountToday: 0
  },
  {
    id: 'INT-TG-01',
    systemName: 'Telegram Bot',
    protocol: 'Webhook',
    endpointUrl: 'https://api.telegram.org/bot7123456789:AAFxxx/sendMessage',
    status: 'Connected',
    lastSyncAt: '2026-07-26 09:10:00',
    latencyMs: 120,
    totalRequestsToday: 145,
    errorCountToday: 0
  },
  {
    id: 'INT-GW-01',
    systemName: 'Google Workspace',
    protocol: 'REST API',
    endpointUrl: 'https://www.googleapis.com/drive/v3/files',
    status: 'Connected',
    lastSyncAt: '2026-07-26 08:30:11',
    latencyMs: 185,
    totalRequestsToday: 98,
    errorCountToday: 0
  }
];

export const initialIntegrationPayloads: IntegrationPayloadSample[] = [
  {
    id: 'PAY-1001',
    system: 'HIS -> CLS WorkHub',
    eventType: 'ORDER_CREATE (Chỉ định CĐHA khẩn)',
    direction: 'INBOUND',
    timestamp: '2026-07-26 09:15:10',
    status: 'SUCCESS',
    payloadJson: JSON.stringify({
      orderId: "HIS-2026-9901",
      patientId: "BN-883912",
      patientName: "Nguyễn Văn M",
      age: 65,
      gender: "Nam",
      department: "Khoa Cấp Cứu",
      modality: "CT",
      procedureCode: "CT-128-THORAX-ANGIO",
      procedureName: "Chụp MSCT 128 dải dựng hình ĐM chủ ngực khẩn",
      priority: "URGENT",
      doctorOrder: "TS. BS. Nguyễn Văn Hùng"
    }, null, 2)
  },
  {
    id: 'PAY-1002',
    system: 'LIS -> CLS WorkHub',
    eventType: 'HL7 ORU_R01 (Kết quả Xét nghiệm Roche)',
    direction: 'INBOUND',
    timestamp: '2026-07-26 09:10:02',
    status: 'SUCCESS',
    payloadJson: `MSH|^~\\&|ROCHE_COBAS|LAB_CLS|HIS_SYSTEM|HOSPITAL|20260726091002||ORU^R01|MSG20260726001|P|2.5
PID|1||BN-883912||Nguyễn Văn M||19610512|M
OBR|1|HIS-2026-9901|LAB-901|4520-8^Glucose Blood^LN|||20260726090000
OBX|1|NM|1021-0^Glucose [Mass/volume] in Blood^LN||6.8|mmol/L|4.1-5.9|H|||F`
  },
  {
    id: 'PAY-1003',
    system: 'PACS -> CLS WorkHub',
    eventType: 'DICOM_STUDY_STORED (Phim MRI 3.0T)',
    direction: 'INBOUND',
    timestamp: '2026-07-26 08:45:30',
    status: 'SUCCESS',
    payloadJson: JSON.stringify({
      studyInstanceUID: "1.2.840.113619.2.55.3.2831164023.891",
      patientID: "BN-771239",
      modality: "MR",
      seriesCount: 8,
      instancesCount: 320,
      pacsViewerUrl: "https://pacs.hospital.vn/viewer?studyUID=1.2.840.113619.2.55.3.2831164023.891"
    }, null, 2)
  }
];


