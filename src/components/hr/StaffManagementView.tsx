import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Users, Award, Calendar, BookOpen, CheckCircle2, Clock, AlertCircle, 
  Search, Check, X, Edit3, Building2, Grid, Layers, History, Plus, Briefcase, ChevronRight, UserCheck, Phone, Mail,
  Trash2, AlertTriangle, ShieldCheck, Filter, FileText, FileSpreadsheet, Download, Upload, FileUp, Sparkles, CheckSquare, PlusCircle,
  Shield, KeyRound, Lock, User as UserIcon, Camera, RotateCcw, Smile
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { 
  StaffProfile, LeaveRequest, TrainingCourse, EmploymentStatus, WorkStatusHistoryItem, CLSTitle, UserRole,
  MedicalCertificate, DepartmentUnit, ParaclinicalRoom, User, ManagementTier, UserPermissionOverrides
} from '../../types/hospital';
import { formatDateVN, toInputDateFormat, normalizeFlexibleDateVN, normalizeVietnamesePhone } from '../../utils/dateUtils';
import { LeaveCalendarTab } from './LeaveCalendarTab';
import { SearchableCombobox, ComboboxOption } from '../common/SearchableCombobox';
import {
  canApproveLeaveRequest,
  filterActiveStaffProfiles,
  getInactiveStaffMatchers,
  isStrictAdminUser
} from '../../utils/staffStatus';
import {
  MANAGEMENT_TIER_ORDER,
  MANAGEMENT_TIER_META,
  PERMISSION_FIELD_LABELS,
  DEFAULT_TIER_PERMISSIONS,
  resolveEffectiveUserAccess,
  resolveUserManagementTier,
  canManageStaffTarget,
  filterSelectableDepartmentsForActor,
  filterSelectableRoomsForActor,
  isStaffInAccessScope,
  isAdminIdentity,
  ResolvedPermissions,
} from '../../utils/rbac';

// Helper to parse dates from Excel (can be Date instance, Excel serial number, or string) strictly to dd/mm/yyyy
const parseExcelDateToDDMMYYYY = (val: any): string => {
  if (val === null || val === undefined || val === '') return '';

  // 1. If JS Date instance
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // 2. If numeric Excel cell (4-digit year vs Excel serial date number)
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val >= 1900 && val <= 2100) {
      return String(val);
    }
    if (val > 0) {
      try {
        const parsed = XLSX.SSF.parse_date_code(val);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const d = String(parsed.d).padStart(2, '0');
          const m = String(parsed.m).padStart(2, '0');
          const y = parsed.y;
          return `${d}/${m}/${y}`;
        }
      } catch (e) {
        const dt = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (!isNaN(dt.getTime())) {
          const d = String(dt.getUTCDate()).padStart(2, '0');
          const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const y = dt.getUTCFullYear();
          return `${d}/${m}/${y}`;
        }
      }
    }
  }

  const s = String(val).trim();
  if (!s) return '';

  // 2b. Preserve year-only (yyyy) or month/year (mm/yyyy)
  if (/^\d{4}$/.test(s)) {
    return s;
  }
  const myMatch = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (myMatch) {
    const mNum = parseInt(myMatch[1], 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${myMatch[1].padStart(2, '0')}/${myMatch[2]}`;
    }
  }

  // 3. If ISO date: YYYY-MM-DD or YYYY-MM-DDT...
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  // 4. If already DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${d}/${m}/${y}`;
  }

  // 5. If date string like "Mon May 15 1985..."
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return s;
};

// Danh mục biểu tượng y tế chuyên ngành cho Avatar cán bộ
const PRESET_MEDICAL_ICONS = [
  { id: 'stethoscope', emoji: '🩺', label: 'Bác sĩ / Ống nghe', bg: '#4f46e5' },
  { id: 'microscope', emoji: '🔬', label: 'Xét nghiệm / Vi sinh', bg: '#059669' },
  { id: 'labcoat', emoji: '🥼', label: 'Áo Blouse Y Tế', bg: '#0284c7' },
  { id: 'xray', emoji: '🩻', label: 'Phim X-Quang / CĐHA', bg: '#7c3aed' },
  { id: 'testtube', emoji: '🧪', label: 'Ống nghiệm / Hóa sinh', bg: '#d97706' },
  { id: 'syringe', emoji: '💉', label: 'Bơm tiêm / Điều dưỡng', bg: '#e11d48' },
  { id: 'dna', emoji: '🧬', label: 'Gen & Sinh học phân tử', bg: '#0891b2' },
  { id: 'heart', emoji: '🫀', label: 'Tim mạch học', bg: '#dc2626' },
  { id: 'brain', emoji: '🧠', label: 'Thần kinh học', bg: '#9333ea' },
  { id: 'hospital', emoji: '🏥', label: 'Bệnh viện / Cơ sở', bg: '#0d9488' },
  { id: 'pill', emoji: '💊', label: 'Dược phẩm & Thuốc', bg: '#ea580c' },
  { id: 'clipboard', emoji: '📋', label: 'Bệnh án / Hồ sơ ISO', bg: '#475569' },
  { id: 'caduceus', emoji: '⚕️', label: 'Biểu tượng Ngành Y', bg: '#16a34a' },
  { id: 'eye', emoji: '👁️', label: 'Mắt / Nhãn khoa', bg: '#0369a1' },
  { id: 'tooth', emoji: '🦷', label: 'Răng hàm mặt', bg: '#2563eb' },
  { id: 'ambulance', emoji: '🚑', label: 'Cấp cứu 115', bg: '#b91c1c' }
];

// Danh mục ảnh chân dung mẫu cán bộ y tế chất lượng cao
const PRESET_MEDICAL_PHOTOS = [
  { id: 'doc-m1', name: 'Bác sĩ Nam (Trẻ)', url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=200&auto=format&fit=crop&q=80' },
  { id: 'doc-m2', name: 'Bác sĩ Nam (Kinh nghiệm)', url: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&auto=format&fit=crop&q=80' },
  { id: 'doc-f1', name: 'Bác sĩ Nữ', url: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=200&auto=format&fit=crop&q=80' },
  { id: 'doc-f2', name: 'Bác sĩ Chuyên khoa Nữ', url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&auto=format&fit=crop&q=80' },
  { id: 'doc-f3', name: 'Bác sĩ Nữ (Trẻ)', url: 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=200&auto=format&fit=crop&q=80' },
  { id: 'nurse-f', name: 'Điều dưỡng Nữ', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80' },
  { id: 'tech-m', name: 'Kỹ thuật viên Nam', url: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=200&auto=format&fit=crop&q=80' }
];

// Tạo URL ảnh SVG từ emoji y tế với nền màu chuyên nghiệp
const createEmojiSvgDataUri = (emoji: string, bg: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" rx="44" fill="${bg}"/><text x="100" y="132" font-size="96" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, sans-serif">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const StaffManagementView: React.FC = () => {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [trainingCourses, setTrainingCourses] = useState<TrainingCourse[]>([]);
  
  // Tab 1 (Lịch nghỉ phép) is now moved to the far left!
  const [activeTab, setActiveTab] = useState<'leave' | 'profiles' | 'certificates' | 'training'>('leave');
  
  // Filtering & View mode
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'grouped'>('grid');

  // Modal States
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveApplicantId, setLeaveApplicantId] = useState('');
  const [leaveType, setLeaveType] = useState<'Phép năm' | 'Nghỉ ốm' | 'Nghỉ thai sản' | 'Học tập' | 'Nghỉ không lương'>('Phép năm');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [substituteUser, setSubstituteUser] = useState('');
  const [leaveFeedbackMsg, setLeaveFeedbackMsg] = useState('');

  // Edit Staff Modal (Admin only)
  const [editingStaff, setEditingStaff] = useState<StaffProfile | null>(null);
  
  // New History Item State inside Edit Modal
  const [showAddHistoryForm, setShowAddHistoryForm] = useState(false);
  const [histStartDate, setHistStartDate] = useState('');
  const [histEndDate, setHistEndDate] = useState('Hiện tại');
  const [histStatus, setHistStatus] = useState<EmploymentStatus>('Đang làm việc');
  const [histDept, setHistDept] = useState('');
  const [histRoom, setHistRoom] = useState('');
  const [histTitle, setHistTitle] = useState('');
  const [histNote, setHistNote] = useState('');

  // Avatar / Icon Picker Modal State for Staff Profile Edit
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);
  const [avatarPickerTab, setAvatarPickerTab] = useState<'icons' | 'photos' | 'upload'>('icons');
  const [previewUploadedAvatar, setPreviewUploadedAvatar] = useState<string>('');

  // Toast / Banner feedback replacing native alerts
  const [staffBannerMsg, setStaffBannerMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const notifyStaffBanner = (text: string, type: 'success' | 'error' = 'success') => {
    setStaffBannerMsg({ text, type });
    setTimeout(() => setStaffBannerMsg(null), 5000);
  };

  // Handle image upload and resize to max 256x256 for optimal storage
  const handleAvatarFileUpload = (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notifyStaffBanner('Dung lượng ảnh tối đa 5MB. Vui lòng chọn ảnh nhỏ hơn.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 256;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
            if (editingStaff) {
              setEditingStaff({ ...editingStaff, avatar: resizedDataUrl });
            }
            setPreviewUploadedAvatar(resizedDataUrl);
          } else {
            if (editingStaff) {
              setEditingStaff({ ...editingStaff, avatar: dataUrl });
            }
            setPreviewUploadedAvatar(dataUrl);
          }
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  };

  // View Work History Modal (for any user)
  const [historyViewingStaff, setHistoryViewingStaff] = useState<StaffProfile | null>(null);

  // Staff Detail Modal & RBAC Permissions State
  const [selectedDetailStaff, setSelectedDetailStaff] = useState<StaffProfile | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'profile' | 'permissions' | 'history' | 'certs'>('profile');
  const [assignedRole, setAssignedRole] = useState<UserRole>('Staff');
  const [assignedTier, setAssignedTier] = useState<ManagementTier>('staff');
  const [assignedManagedDepts, setAssignedManagedDepts] = useState<string[]>([]);
  const [assignedManagedRooms, setAssignedManagedRooms] = useState<string[]>([]);
  const [assignedOverrides, setAssignedOverrides] = useState<UserPermissionOverrides>({});
  const [assignedTitle, setAssignedTitle] = useState<string>('');
  const [assignedDept, setAssignedDept] = useState<string>('');
  const [assignedRoom, setAssignedRoom] = useState<string>('');
  const [permissionSuccessMsg, setPermissionSuccessMsg] = useState<string>('');
  const [scopeOnlyFilter, setScopeOnlyFilter] = useState<boolean>(false);

  // Certificate Management State (Add / Edit / Delete)
  const [certStatusFilter, setCertStatusFilter] = useState<'all' | 'Còn hiệu lực' | 'Sắp hết hạn' | 'Hết hiệu lực'>('all');
  const [showCertModal, setShowCertModal] = useState(false);
  const [editingCert, setEditingCert] = useState<{ certId: string; staffUserId: string } | null>(null);
  const [certStaffUserId, setCertStaffUserId] = useState('');
  const [certName, setCertName] = useState('');
  const [certCode, setCertCode] = useState('');
  const [certIssuedBy, setCertIssuedBy] = useState('');
  const [certIssuedDate, setCertIssuedDate] = useState('');
  const [certExpiryDate, setCertExpiryDate] = useState('');
  const [certStatus, setCertStatus] = useState<'Còn hiệu lực' | 'Sắp hết hạn' | 'Hết hiệu lực'>('Còn hiệu lực');
  const [certFileUrl, setCertFileUrl] = useState('');

  // Delete Confirmation State
  const [deleteConfirmCert, setDeleteConfirmCert] = useState<{
    certId: string;
    certName: string;
    certCode: string;
    staffUserId: string;
    staffName: string;
  } | null>(null);

  // Paraclinical Departments & Rooms from Quản lý phòng ban
  const [departments, setDepartments] = useState<DepartmentUnit[]>([]);
  const [rooms, setRooms] = useState<ParaclinicalRoom[]>([]);

  // Add Staff Modal State
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState({
    userId: '',
    fullName: '',
    title: 'Nhân viên' as CLSTitle,
    role: 'Staff' as UserRole,
    departmentSection: '',
    room: '',
    phone: '',
    email: '',
    dob: '1990-01-01',
    gender: 'Nam' as 'Nam' | 'Nữ' | 'Khác',
    specialty: '',
    educationLevel: '',
    joinDate: formatDateVN(new Date()),
    experienceYears: 3,
    currentStatus: 'Đang làm việc' as EmploymentStatus,
    certName: '',
    certCode: ''
  });

  // Delete Staff State
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<StaffProfile | null>(null);

  // Import Excel Modal State
  const [showImportExcelModal, setShowImportExcelModal] = useState(false);
  const [excelFileName, setExcelFileName] = useState('');
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [excelImportStep, setExcelImportStep] = useState<'upload' | 'preview'>('upload');
  const [isDraggingExcel, setIsDraggingExcel] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const editJoinDatePickerRef = useRef<HTMLInputElement>(null);
  const newJoinDatePickerRef = useRef<HTMLInputElement>(null);
  const [parsedExcelStaff, setParsedExcelStaff] = useState<Array<{
    userId: string;
    fullName: string;
    title: string;
    role: string;
    departmentSection: string;
    room: string;
    phone: string;
    email: string;
    dob: string;
    gender: 'Nam' | 'Nữ' | 'Khác';
    specialty: string;
    joinDate: string;
    experienceYears: number;
    currentStatus: EmploymentStatus;
    certCode: string;
    isValid: boolean;
    errorReason?: string;
  }>>([]);

  const [allUsers, setAllUsers] = useState<User[]>(() => storageService.getUsers());
  const currentUser = storageService.getCurrentUser();
  const actorAccess = useMemo(
    () => resolveEffectiveUserAccess(currentUser, profiles, departments, rooms),
    [currentUser, profiles, departments, rooms, allUsers]
  );
  const isStrictLeaveAdmin = isStrictAdminUser(currentUser) || actorAccess.permissions.canApproveLeave;
  const canCreateAnyStaff = canManageStaffTarget(actorAccess, 'create', undefined, rooms);
  const selectableDepartmentsForActor = useMemo(
    () => filterSelectableDepartmentsForActor(actorAccess, departments),
    [actorAccess, departments]
  );
  const selectableRoomsForActor = useMemo(
    () => filterSelectableRoomsForActor(actorAccess, rooms),
    [actorAccess, rooms]
  );

  // Helper function to calculate years of service automatically based on join date (dd/mm/yyyy, mm/yyyy, yyyy, or yyyy-mm-dd)
  const calculateYearsOfService = (joinDateStr?: string, defaultYears: number = 0): number => {
    if (!joinDateStr) return defaultYears;
    const trimmed = String(joinDateStr).trim();
    if (!trimmed) return defaultYears;
    const now = new Date();

    // 1. Year only: yyyy (1900 - 2100)
    if (/^\d{4}$/.test(trimmed)) {
      const y = parseInt(trimmed, 10);
      if (y < 1900 || y > 2100) return defaultYears;
      return Math.max(0, now.getFullYear() - y);
    }

    // 2. Month/Year: m/yyyy or mm/yyyy or mm-yyyy
    const myMatch = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
    if (myMatch) {
      const m = parseInt(myMatch[1], 10);
      const y = parseInt(myMatch[2], 10);
      if (m < 1 || m > 12 || y < 1900 || y > 2100) return defaultYears;
      let years = now.getFullYear() - y;
      if (now.getMonth() + 1 < m) {
        years--;
      }
      return Math.max(0, years);
    }

    // 3. Full date: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, or ISO
    let join: Date;
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10);
      const y = parseInt(dmyMatch[3], 10);
      if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return defaultYears;
      join = new Date(y, m - 1, d);
    } else if (ymdMatch) {
      const y = parseInt(ymdMatch[1], 10);
      const m = parseInt(ymdMatch[2], 10);
      const d = parseInt(ymdMatch[3], 10);
      if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return defaultYears;
      join = new Date(y, m - 1, d);
    } else {
      return defaultYears;
    }

    if (isNaN(join.getTime())) return defaultYears;
    let years = now.getFullYear() - join.getFullYear();
    const monthDiff = now.getMonth() - join.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < join.getDate())) {
      years--;
    }
    return Math.max(0, years);
  };

  useEffect(() => {
    const loadData = () => {
      setProfiles(storageService.getStaffProfiles());
      setLeaveRequests(storageService.getLeaveRequests());
      setTrainingCourses(storageService.getTrainingCourses());
      setDepartments(storageService.getDepartments());
      setRooms(storageService.getRooms());
      setAllUsers(storageService.getUsers());
    };
    loadData();
    return storageService.subscribe(loadData);
  }, []);

  const getLocalTodayISO = (): string => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const calculateInclusiveDays = (startStr: string, endStr: string): number => {
    if (!startStr) return 1;
    const parseLocal = (s: string) => {
      const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!m) return null;
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    };
    const start = parseLocal(startStr);
    const end = parseLocal(endStr || startStr);
    if (!start || !end) return 1;
    const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return Math.max(1, diff);
  };

  const computedLeaveDays = useMemo(
    () => calculateInclusiveDays(leaveStart, leaveEnd),
    [leaveStart, leaveEnd]
  );

  const currentStaffProfile = useMemo(
    () =>
      profiles.find(
        p =>
          p.userId === currentUser.id ||
          (currentUser.name && p.fullName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
      ) || null,
    [profiles, currentUser.id, currentUser.name]
  );

  const canApproveLeave = useMemo(
    () => canApproveLeaveRequest(currentUser, currentStaffProfile),
    [currentUser, currentStaffProfile]
  );

  const activeProfiles = useMemo(
    () => filterActiveStaffProfiles(profiles),
    [profiles]
  );

  const inactiveMatchers = useMemo(
    () => getInactiveStaffMatchers(profiles),
    [profiles]
  );

  const activeLeaveRequests = useMemo(
    () =>
      leaveRequests.filter(
        req =>
          !inactiveMatchers.ids.has(req.userId) &&
          !inactiveMatchers.names.has((req.userName || '').trim().toLowerCase())
      ),
    [leaveRequests, inactiveMatchers]
  );

  const leaveStaffOptions = useMemo<ComboboxOption[]>(
    () =>
      activeProfiles.map(p => ({
        value: p.userId,
        label: p.fullName,
        badge: p.title || 'Nhân viên',
        subLabel: [p.departmentSection, p.room].filter(Boolean).join(' · ')
      })),
    [activeProfiles]
  );

  const leaveSubstituteOptions = useMemo<ComboboxOption[]>(
    () =>
      activeProfiles
        .filter(p => p.userId !== (leaveApplicantId || currentUser.id))
        .map(p => ({
          value: p.fullName,
          label: p.fullName,
          badge: p.title || 'Nhân viên',
          subLabel: [p.departmentSection, p.room].filter(Boolean).join(' · ')
        })),
    [activeProfiles, leaveApplicantId, currentUser.id]
  );

  const openCreateLeaveModal = (prefillDate?: string) => {
    const baseDate = prefillDate || getLocalTodayISO();
    if (isStrictLeaveAdmin) {
      const isCurrentActive = activeProfiles.some(p => p.userId === currentUser.id);
      setLeaveApplicantId(isCurrentActive ? currentUser.id : activeProfiles[0]?.userId || '');
    } else {
      setLeaveApplicantId(currentStaffProfile?.userId || currentUser.id);
    }
    setLeaveStart(baseDate);
    setLeaveEnd(baseDate);
    setLeaveReason('');
    setSubstituteUser('');
    setShowLeaveModal(true);
  };

  const handleApproveLeave = (id: string, status: 'Đã phê duyệt' | 'Từ chối') => {
    if (!canApproveLeave) {
      setLeaveFeedbackMsg('Chỉ Admin hoặc Trưởng / Phó khoa mới có quyền phê duyệt đơn đăng ký nghỉ.');
      setTimeout(() => setLeaveFeedbackMsg(''), 4000);
      return;
    }
    storageService.updateLeaveStatus(id, status, storageService.getCurrentUser().name);
  };

  const handleDeleteLeave = (id: string) => {
    storageService.deleteLeaveRequest(id);
    setLeaveFeedbackMsg('Đã xóa đơn đăng ký nghỉ khỏi lịch.');
    setTimeout(() => setLeaveFeedbackMsg(''), 4000);
  };

  const handleCreateLeaveRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const currUser = storageService.getCurrentUser();
    const ownProfile = profiles.find(
      p =>
        p.userId === currUser.id ||
        (currUser.name && p.fullName.trim().toLowerCase() === currUser.name.trim().toLowerCase())
    );
    const selectedStaff = isStrictLeaveAdmin
      ? activeProfiles.find(p => p.userId === leaveApplicantId)
      : ownProfile;
    const normalizedStart = leaveStart || getLocalTodayISO();
    const normalizedEnd = leaveEnd && leaveEnd >= normalizedStart ? leaveEnd : normalizedStart;
    const totalDays = calculateInclusiveDays(normalizedStart, normalizedEnd);

    const newReq: LeaveRequest = {
      id: `LR-${Date.now()}`,
      userId: isStrictLeaveAdmin ? (selectedStaff?.userId || currUser.id) : (ownProfile?.userId || currUser.id),
      userName: isStrictLeaveAdmin ? (selectedStaff?.fullName || currUser.name) : (ownProfile?.fullName || currUser.name),
      userRole: isStrictLeaveAdmin ? (selectedStaff?.title || currUser.title || 'Nhân viên') : (ownProfile?.title || currUser.title || 'Nhân viên'),
      leaveType,
      startDate: normalizedStart,
      endDate: normalizedEnd,
      totalDays,
      reason: leaveReason.trim(),
      substituteUserName: substituteUser.trim() || undefined,
      status: 'Chờ duyệt',
      createdAt: new Date().toLocaleString('vi-VN')
    };

    storageService.saveLeaveRequest(newReq);
    setShowLeaveModal(false);
    setLeaveReason('');
    setLeaveFeedbackMsg(`Đã đăng ký lịch nghỉ (${totalDays} ngày) cho ${newReq.userName}. Đơn đang chờ Admin hoặc Trưởng / Phó khoa phê duyệt.`);
    setTimeout(() => setLeaveFeedbackMsg(''), 5000);
  };

  // --- Certificate CRUD Handlers ---
  const computeCertStatusFromExpiry = (expDate: string): 'Còn hiệu lực' | 'Sắp hết hạn' | 'Hết hiệu lực' => {
    if (!expDate) return 'Còn hiệu lực';
    const exp = new Date(expDate);
    if (isNaN(exp.getTime())) return 'Còn hiệu lực';
    const now = new Date();
    // Normalize to date comparison
    const diffMs = exp.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Hết hiệu lực';
    if (diffDays <= 180) return 'Sắp hết hạn'; // under 6 months warning
    return 'Còn hiệu lực';
  };

  const handleExpiryDateChange = (newDate: string) => {
    setCertExpiryDate(newDate);
    setCertStatus(computeCertStatusFromExpiry(newDate));
  };

  const handleOpenAddCert = (preselectedStaffUserId?: string) => {
    if (!actorAccess.permissions.canManageCertificates) {
      notifyStaffBanner('Bạn không có quyền thêm hoặc quản lý chứng chỉ hành nghề.', 'error');
      return;
    }
    const eligibleStaff = profiles.filter((p) => canManageStaffTarget(actorAccess, 'cert', p, rooms));
    const defaultStaffId =
      preselectedStaffUserId && eligibleStaff.some((p) => p.userId === preselectedStaffUserId)
        ? preselectedStaffUserId
        : eligibleStaff[0]?.userId || '';
    if (!defaultStaffId) {
      notifyStaffBanner('Không có nhân sự nào trong phạm vi quản lý của bạn để gán chứng chỉ.', 'error');
      return;
    }
    setEditingCert(null);
    setCertStaffUserId(defaultStaffId);
    setCertName('');
    setCertCode('');
    setCertIssuedBy('');
    const todayStr = new Date().toISOString().split('T')[0];
    setCertIssuedDate(todayStr);
    const defExp = new Date();
    defExp.setFullYear(defExp.getFullYear() + 5);
    const defExpStr = defExp.toISOString().split('T')[0];
    setCertExpiryDate(defExpStr);
    setCertStatus('Còn hiệu lực');
    setCertFileUrl('');
    setShowCertModal(true);
  };

  const handleOpenEditCert = (cert: MedicalCertificate, staffUserId: string) => {
    const ownerProfile = profiles.find(p => p.userId === staffUserId);
    if (!ownerProfile || !canManageStaffTarget(actorAccess, 'cert', ownerProfile, rooms)) {
      notifyStaffBanner('Bạn chỉ có thể chỉnh sửa chứng chỉ của nhân sự trong phạm vi quản lý.', 'error');
      return;
    }
    setEditingCert({ certId: cert.id, staffUserId });
    setCertStaffUserId(staffUserId);
    setCertName(cert.name);
    setCertCode(cert.code);
    setCertIssuedBy(cert.issuedBy);
    setCertIssuedDate(cert.issuedDate);
    setCertExpiryDate(cert.expiryDate);
    setCertStatus(cert.status);
    setCertFileUrl(cert.fileUrl || '');
    setShowCertModal(true);
  };

  const handleDeleteCertClick = (cert: MedicalCertificate, staffUserId: string, staffName: string) => {
    const ownerProfile = profiles.find(p => p.userId === staffUserId);
    if (!ownerProfile || !canManageStaffTarget(actorAccess, 'cert', ownerProfile, rooms)) {
      notifyStaffBanner('Bạn không có quyền xóa chứng chỉ của nhân sự ngoài phạm vi quản lý.', 'error');
      return;
    }
    setDeleteConfirmCert({
      certId: cert.id,
      certName: cert.name,
      certCode: cert.code,
      staffUserId,
      staffName
    });
  };

  const handleConfirmDeleteCert = () => {
    if (!deleteConfirmCert) return;
    const targetProfile = profiles.find(p => p.userId === deleteConfirmCert.staffUserId);
    if (!targetProfile) {
      setDeleteConfirmCert(null);
      return;
    }
    if (!canManageStaffTarget(actorAccess, 'cert', targetProfile, rooms)) {
      notifyStaffBanner('Bạn không có quyền xóa chứng chỉ của nhân sự ngoài phạm vi quản lý.', 'error');
      setDeleteConfirmCert(null);
      return;
    }

    const updatedCerts = (targetProfile.certificates || []).filter(c => c.id !== deleteConfirmCert.certId);
    const updatedProfile: StaffProfile = {
      ...targetProfile,
      certificates: updatedCerts
    };

    storageService.saveStaffProfile(updatedProfile);
    setProfiles(prev => prev.map(p => p.userId === updatedProfile.userId ? updatedProfile : p));
    setDeleteConfirmCert(null);
    notifyStaffBanner(`Đã xóa chứng chỉ "${deleteConfirmCert.certName}" của ${targetProfile.fullName}.`);
  };

  const handleSaveCert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!certStaffUserId) {
      notifyStaffBanner('Vui lòng chọn cán bộ / nhân viên sở hữu chứng chỉ!', 'error');
      return;
    }
    if (!certName.trim()) {
      notifyStaffBanner('Vui lòng nhập tên chứng chỉ!', 'error');
      return;
    }
    if (!certCode.trim()) {
      notifyStaffBanner('Vui lòng nhập mã số chứng chỉ!', 'error');
      return;
    }
    if (!certIssuedBy.trim()) {
      notifyStaffBanner('Vui lòng nhập cơ quan cấp!', 'error');
      return;
    }

    const targetProfile = profiles.find(p => p.userId === certStaffUserId);
    if (!targetProfile) {
      notifyStaffBanner('Không tìm thấy thông tin cán bộ được chọn!', 'error');
      return;
    }
    if (!canManageStaffTarget(actorAccess, 'cert', targetProfile, rooms)) {
      notifyStaffBanner('Nhân sự được chọn nằm ngoài phạm vi quản lý chứng chỉ của bạn!', 'error');
      return;
    }

    if (editingCert) {
      const certData: MedicalCertificate = {
        id: editingCert.certId,
        name: certName.trim(),
        code: certCode.trim(),
        issuedBy: certIssuedBy.trim(),
        issuedDate: certIssuedDate,
        expiryDate: certExpiryDate,
        status: certStatus,
        fileUrl: certFileUrl.trim() || undefined
      };

      if (editingCert.staffUserId !== certStaffUserId) {
        // Staff member changed: Remove from old staff profile and add to new staff profile
        const oldProfile = profiles.find(p => p.userId === editingCert.staffUserId);
        if (oldProfile) {
          const updatedOldProfile: StaffProfile = {
            ...oldProfile,
            certificates: (oldProfile.certificates || []).filter(c => c.id !== editingCert.certId)
          };
          storageService.saveStaffProfile(updatedOldProfile);
        }
        const updatedTargetProfile: StaffProfile = {
          ...targetProfile,
          certificates: [...(targetProfile.certificates || []).filter(c => c.id !== editingCert.certId), certData]
        };
        storageService.saveStaffProfile(updatedTargetProfile);
      } else {
        // Same staff member
        const updatedCerts = (targetProfile.certificates || []).map(c => 
          c.id === editingCert.certId ? certData : c
        );
        const updatedTargetProfile: StaffProfile = {
          ...targetProfile,
          certificates: updatedCerts
        };
        storageService.saveStaffProfile(updatedTargetProfile);
      }
    } else {
      // Adding new certificate
      const newCert: MedicalCertificate = {
        id: `CERT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        name: certName.trim(),
        code: certCode.trim(),
        issuedBy: certIssuedBy.trim(),
        issuedDate: certIssuedDate,
        expiryDate: certExpiryDate,
        status: certStatus,
        fileUrl: certFileUrl.trim() || undefined
      };

      const updatedTargetProfile: StaffProfile = {
        ...targetProfile,
        certificates: [...(targetProfile.certificates || []), newCert]
      };
      storageService.saveStaffProfile(updatedTargetProfile);
    }

    setProfiles(storageService.getStaffProfiles());
    setShowCertModal(false);
    setEditingCert(null);
  };

  // Helper for status badge styling
  const getEmploymentStatusBadge = (status?: EmploymentStatus) => {
    switch (status) {
      case 'Đang làm việc':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Đang làm việc
          </span>
        );
      case 'Đang thử việc':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-500" />
            Đang thử việc
          </span>
        );
      case 'Nghỉ không lương':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-500" />
            Nghỉ không lương
          </span>
        );
      case 'Nghỉ thai sản':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Award className="w-3 h-3 text-purple-500" />
            Nghỉ thai sản
          </span>
        );
      case 'Đã nghỉ việc':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
            Đã nghỉ việc
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Đang làm việc
          </span>
        );
    }
  };

  // Extract departments & rooms strictly from Quản lý Phòng / Bộ phận
  const allDepartments = Array.from(
    new Set<string>(departments.map(d => d.name).filter((n): n is string => Boolean(n)))
  ).filter(d => d !== 'Chưa phân bộ phận');

  const allRoomNames = Array.from(
    new Set<string>(rooms.map(r => r.name).filter((n): n is string => Boolean(n)))
  );

  const getRoomsForDepartment = (deptName?: string): string[] => {
    const trimmed = deptName?.trim();
    if (!trimmed) return allRoomNames;
    return Array.from(
      new Set<string>(
        rooms
          .filter(r => r.departmentSection === trimmed)
          .map(r => r.name)
          .filter((n): n is string => Boolean(n))
      )
    );
  };

  const allDepartmentsAndRooms = Array.from(new Set<string>([...allDepartments, ...allRoomNames]));

  // Filter staff profiles
  const filteredProfiles = profiles.filter(p => {
    const matchSearch = p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.specialty.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.departmentSection.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.room && p.room.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchDept = selectedDepartmentFilter === 'all' ||
      p.departmentSection === selectedDepartmentFilter ||
      p.room === selectedDepartmentFilter;

    const matchScope = !scopeOnlyFilter || actorAccess.isDepartmentWide || isStaffInAccessScope(actorAccess, p, rooms);

    return matchSearch && matchDept && matchScope;
  });

  // Group profiles by Department / Room when in 'grouped' view mode
  const groupedProfiles = filteredProfiles.reduce<Record<string, StaffProfile[]>>((acc, profile) => {
    const key = profile.departmentSection || 'Chưa phân bộ phận';
    if (!acc[key]) acc[key] = [];
    acc[key].push(profile);
    return acc;
  }, {});

  // Reset Add Staff Form
  const resetNewStaffForm = () => {
    const allowedDepts = selectableDepartmentsForActor.map(d => d.name).filter(n => n && n !== 'Chưa phân bộ phận');
    const defaultDept = allowedDepts[0] || allDepartments[0] || '';
    const allowedRoomNames = selectableRoomsForActor.map(r => r.name);
    const defaultDeptRooms = getRoomsForDepartment(defaultDept).filter(rName =>
      actorAccess.isDepartmentWide || allowedRoomNames.includes(rName)
    );
    setNewStaffForm({
      userId: `NV-${Math.floor(1000 + Math.random() * 9000)}`,
      fullName: '',
      title: 'Nhân viên' as CLSTitle,
      role: 'Staff' as UserRole,
      departmentSection: defaultDept,
      room: defaultDeptRooms[0] || '',
      phone: '',
      email: '',
      dob: '1990-01-01',
      gender: 'Nam',
      specialty: '',
      educationLevel: '',
      joinDate: formatDateVN(new Date()),
      experienceYears: 3,
      currentStatus: 'Đang làm việc',
      certName: '',
      certCode: ''
    });
  };

  const handleOpenAddStaffModal = () => {
    if (!canManageStaffTarget(actorAccess, 'create', undefined, rooms)) {
      notifyStaffBanner('Bạn không có quyền thêm nhân viên mới trong phạm vi hiện tại.', 'error');
      return;
    }
    resetNewStaffForm();
    setShowAddStaffModal(true);
  };

  // --- Download Excel Template ---
  const handleDownloadExcelTemplate = () => {
    const sampleRoom1 = rooms[0]?.name || 'Phòng Chụp X-Quang Kỹ Thuật Số';
    const sampleDept1 = rooms[0]?.departmentSection || 'Chẩn đoán hình ảnh';
    const sampleRoom2 = rooms[1]?.name || 'Phòng Siêu Âm Tổng Quát & Màu';
    const sampleDept2 = rooms[1]?.departmentSection || 'Thăm dò chức năng';
    const sampleRoom3 = rooms[2]?.name || 'Phòng Lấy Mẫu Xét Nghiệm';
    const sampleDept3 = rooms[2]?.departmentSection || 'Xét nghiệm';

    const headers = [
      'Mã NV',
      'Họ và Tên (*)',
      'Chức danh (*)',
      'Vai trò hệ thống',
      'Bộ phận (*)',
      'Phòng làm việc',
      'Số điện thoại (10 số)',
      'Email',
      'Giới tính',
      'Ngày sinh (dd/mm/yyyy)',
      'Chuyên môn',
      'Ngày vào làm (dd/mm/yyyy)',
      'Số năm kinh nghiệm',
      'Trạng thái làm việc',
      'Số CCHN'
    ];

    const sampleRows = [
      [
        'NV-001',
        'BS.CKI Nguyễn Văn An',
        'Bác sĩ',
        'Doctor',
        sampleDept1,
        sampleRoom1,
        '0912345678',
        'an.nguyen@hospital.vn',
        'Nam',
        '15/05/1985',
        'Chẩn đoán hình ảnh & X-Quang can thiệp',
        '01/03/2018',
        7,
        'Đang làm việc',
        '012345/BYT-CCHN'
      ],
      [
        'NV-002',
        'KTV. Trần Thị Mai',
        'Kỹ thuật viên',
        'Staff',
        sampleDept2,
        sampleRoom2,
        '0987654321',
        'mai.tran@hospital.vn',
        'Nữ',
        '20/08/1992',
        'Kỹ thuật siêu âm Doppler màu',
        '15/06/2020',
        5,
        'Đang làm việc',
        '023456/BYT-CCHN'
      ],
      [
        'NV-003',
        'KTV. Lê Hoàng Nam',
        'Kỹ thuật viên',
        'Staff',
        sampleDept3,
        sampleRoom3,
        '0903112233',
        'nam.le@hospital.vn',
        'Nam',
        '10/11/1989',
        'Kỹ thuật lấy & xử lý mẫu xét nghiệm',
        '01/09/2019',
        6,
        'Đang làm việc',
        '034567/BYT-CCHN'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 18 },
      { wch: 16 },
      { wch: 24 },
      { wch: 32 },
      { wch: 18 },
      { wch: 25 },
      { wch: 10 },
      { wch: 22 },
      { wch: 35 },
      { wch: 24 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 }
    ];

    // Explicitly enforce text cell format for Phone (c=6) and Dates (c=9, c=11)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:O4');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const phoneCell = XLSX.utils.encode_cell({ r: R, c: 6 });
      if (ws[phoneCell]) {
        ws[phoneCell].t = 's';
        ws[phoneCell].z = '@';
      }
      const dobCell = XLSX.utils.encode_cell({ r: R, c: 9 });
      if (ws[dobCell] && R > 0) {
        ws[dobCell].t = 's';
        ws[dobCell].z = '@';
      }
      const joinCell = XLSX.utils.encode_cell({ r: R, c: 11 });
      if (ws[joinCell] && R > 0) {
        ws[joinCell].t = 's';
        ws[joinCell].z = '@';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhan_Vien');
    XLSX.writeFile(wb, 'Mau_Danh_Sach_Nhan_Vien_Khoa_CLS.xlsx');
  };

  // --- Excel File Upload, Drag & Drop, and Parse ---
  const processExcelFile = (file: File) => {
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      notifyStaffBanner('Vui lòng chọn hoặc kéo thả tệp định dạng Excel (.xlsx, .xls) hoặc .csv!', 'error');
      return;
    }

    setExcelFileName(file.name);
    setIsParsingExcel(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawData || rawData.length === 0) {
          notifyStaffBanner('Tệp Excel không có dữ liệu hàng nào!', 'error');
          setIsParsingExcel(false);
          return;
        }

        const normalizeKey = (row: any, candidates: string[]): any => {
          for (const key of Object.keys(row)) {
            const cleanKey = key.toLowerCase().replace(/[\s_*()]/g, '');
            for (const cand of candidates) {
              const cleanCand = cand.toLowerCase().replace(/[\s_*()]/g, '');
              if (cleanKey.includes(cleanCand)) {
                return row[key];
              }
            }
          }
          return '';
        };

        const parsed = rawData.map((row, index) => {
          const fullName = String(normalizeKey(row, ['họvàtên', 'hoten', 'họtên', 'fullname', 'tên', 'họ']) || '').trim();
          const rawTitle = String(normalizeKey(row, ['chứcdanh', 'chucdanh', 'vịtrí', 'vitri', 'title']) || 'Nhân viên').trim();
          const rawRole = String(normalizeKey(row, ['vaitrò', 'vaitro', 'role']) || (rawTitle.toLowerCase().includes('bác sĩ') ? 'Doctor' : rawTitle.toLowerCase().includes('trưởng khoa') ? 'Manager' : 'Staff')).trim();
          const dept = String(normalizeKey(row, ['bộphận', 'bophan', 'khoa', 'phânkhoa', 'department']) || (rooms[0]?.departmentSection || 'Chẩn đoán hình ảnh')).trim();
          const room = String(normalizeKey(row, ['phòng', 'phong', 'room']) || (rooms[0]?.name || 'Phòng xét nghiệm')).trim();
          
          // Format phone number to 10 digits with leading 0 (e.g. 987218099 -> 0987218099)
          const rawPhone = normalizeKey(row, ['sốđiệnthoại', 'sđt', 'phone', 'dienthoai', 'dienthoailienhe']);
          const phone = normalizeVietnamesePhone(rawPhone);

          const email = String(normalizeKey(row, ['email', 'thưđiệntử', 'mail']) || '').trim();
          const gender = String(normalizeKey(row, ['giớitính', 'gioitinh', 'gender']) || 'Nam').trim();
          
          // Format DOB and Join Date strictly to dd/mm/yyyy
          const rawDob = normalizeKey(row, ['ngàysinh', 'ngaysinh', 'dob', 'birth', 'nămsinh']);
          const dob = parseExcelDateToDDMMYYYY(rawDob);

          const specialty = String(normalizeKey(row, ['chuyênmôn', 'chuyenmon', 'specialty']) || `Kỹ thuật ${dept}`).trim();
          
          const rawJoin = normalizeKey(row, ['ngàyvàolàm', 'ngayvaolam', 'joindate', 'ngàyvào', 'ngayvao']);
          const joinDate = parseExcelDateToDDMMYYYY(rawJoin);

          const expRaw = String(normalizeKey(row, ['kinhnghiệm', 'kinhnghiem', 'nămkinhnghiệm', 'exp']) || '0').trim();
          const experienceYears = parseInt(expRaw, 10) || (joinDate ? calculateYearsOfService(joinDate, 1) : 1);
          const rawStatus = String(normalizeKey(row, ['trạngthái', 'trangthai', 'status']) || 'Đang làm việc').trim();
          const certCode = String(normalizeKey(row, ['cchn', 'chứngchỉ', 'chungchi', 'giấyphép']) || '').trim();
          const codeCandidate = String(normalizeKey(row, ['mãnv', 'manv', 'mãnhânviên', 'id', 'code']) || '').trim();
          const userId = codeCandidate || `NV-${Date.now().toString().slice(-4)}${index + 1}`;

          const hasName = Boolean(fullName && fullName.length >= 2);
          const candidateForRbac: Partial<StaffProfile> = {
            userId,
            fullName,
            role: rawRole,
            title: rawTitle,
            departmentSection: dept,
            room,
          };
          const allowedInScope = canManageStaffTarget(actorAccess, 'create', candidateForRbac, rooms);
          const isValid = hasName && allowedInScope;

          return {
            userId,
            fullName,
            title: rawTitle,
            role: rawRole,
            departmentSection: dept,
            room,
            phone,
            email,
            dob,
            gender: (gender.toLowerCase().includes('nữ') ? 'Nữ' : 'Nam') as 'Nam' | 'Nữ' | 'Khác',
            specialty,
            joinDate,
            experienceYears,
            currentStatus: (rawStatus.toLowerCase().includes('thử việc') ? 'Đang thử việc' : rawStatus.toLowerCase().includes('thai sản') ? 'Nghỉ thai sản' : rawStatus.toLowerCase().includes('không lương') || rawStatus.toLowerCase().includes('không hưởng lương') ? 'Nghỉ không lương' : (rawStatus.toLowerCase().includes('nghỉ việc') || rawStatus.toLowerCase().includes('kết thúc hợp đồng')) ? 'Đã nghỉ việc' : 'Đang làm việc') as EmploymentStatus,
            certCode,
            isValid,
            errorReason: !hasName
              ? 'Thiếu họ và tên'
              : !allowedInScope
              ? 'Ngoài phạm vi quyền hạn của bạn'
              : undefined
          };
        });

        setParsedExcelStaff(parsed);
        setExcelImportStep('preview');
        setIsParsingExcel(false);
      } catch (err: any) {
        console.error(err);
        notifyStaffBanner('Có lỗi khi đọc file Excel: ' + (err?.message || 'Định dạng file không hỗ trợ'), 'error');
        setIsParsingExcel(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processExcelFile(file);
    e.target.value = '';
  };

  const handleExcelDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingExcel) {
      setIsDraggingExcel(true);
    }
  };

  const handleExcelDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingExcel(true);
  };

  const handleExcelDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDraggingExcel(false);
  };

  const handleExcelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingExcel(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processExcelFile(files[0]);
    }
  };

  // --- Confirm Import Excel to Storage ---
  const handleConfirmImportExcel = () => {
    const validRows = parsedExcelStaff.filter(
      (r) => r.isValid && canManageStaffTarget(actorAccess, 'create', r as Partial<StaffProfile>, rooms)
    );
    if (validRows.length === 0) {
      notifyStaffBanner('Không có bản ghi hợp lệ trong phạm vi quản lý để nhập!', 'error');
      return;
    }

    const newProfiles: StaffProfile[] = validRows.map((r, rowIdx) => {
      const certificates: MedicalCertificate[] = r.certCode ? [{
        id: `CERT-${Date.now()}-${rowIdx}-${Math.floor(100 + Math.random() * 900)}`,
        name: `Chứng chỉ Hành Nghề Cận Lâm Sàng (${r.specialty || r.departmentSection})`,
        code: r.certCode,
        issuedBy: 'Sở Y Tế / Bộ Y Tế',
        issuedDate: r.joinDate ? toInputDateFormat(r.joinDate) : new Date().toISOString().split('T')[0],
        expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().split('T')[0],
        status: 'Còn hiệu lực'
      }] : [];

      const initialHistory: WorkStatusHistoryItem = {
        id: `SH-${Date.now()}-${rowIdx}-${Math.floor(100 + Math.random() * 900)}`,
        startDate: r.joinDate || formatDateVN(new Date()),
        endDate: 'Hiện tại',
        status: r.currentStatus,
        departmentSection: r.departmentSection,
        room: r.room,
        positionOrTitle: r.title,
        note: 'Nhập tự động từ tệp danh sách Excel',
        updatedBy: currentUser.name,
        createdAt: new Date().toLocaleDateString('vi-VN')
      };

      const safeRole: UserRole =
        !actorAccess.isSystemAdmin && r.role === 'Admin'
          ? 'Staff'
          : ((['Admin', 'Manager', 'Doctor', 'Staff'].includes(r.role) ? r.role : 'Staff') as UserRole);

      return {
        userId: r.userId,
        fullName: r.fullName,
        title: r.title,
        role: safeRole,
        departmentSection: r.departmentSection,
        room: r.room,
        phone: r.phone,
        email: r.email,
        dob: r.dob,
        gender: r.gender,
        specialty: r.specialty,
        experienceYears: r.experienceYears,
        joinDate: r.joinDate,
        degrees: [r.title.includes('Bác sĩ') ? 'Bác sĩ Đa khoa' : 'Cử nhân Kỹ thuật Y học'],
        certificates,
        totalShiftsThisMonth: 0,
        leaveBalanceDays: 12,
        currentStatus: r.currentStatus,
        statusHistory: [initialHistory]
      };
    });

    storageService.saveStaffProfilesBatch(newProfiles);

    // Sync to Users list so they can be assigned tasks/shifts
    const existingUsers = storageService.getUsers();
    newProfiles.forEach(p => {
      if (!existingUsers.some(u => u.id === p.userId)) {
        storageService.saveUser({
          id: p.userId,
          name: p.fullName,
          email: p.email || `${p.userId.toLowerCase()}@hospital.vn`,
          role: (p.role as UserRole) || 'Staff',
          title: (p.title as CLSTitle) || 'Nhân viên',
          department: p.departmentSection,
          room: p.room,
          avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150',
          phone: p.phone || '',
          status: 'Active'
        });
      }
    });

    setProfiles(storageService.getStaffProfiles());
    setShowImportExcelModal(false);
    setParsedExcelStaff([]);
    setExcelImportStep('upload');
    notifyStaffBanner(`Đã nhập thành công ${validRows.length} nhân viên vào hệ thống!`);
  };

  // --- Create Single Staff Member ---
  const handleCreateNewStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffForm.fullName.trim()) {
      notifyStaffBanner('Vui lòng nhập họ và tên nhân viên!', 'error');
      return;
    }
    if (!actorAccess.isSystemAdmin && newStaffForm.role === 'Admin') {
      notifyStaffBanner('Chỉ Quản trị viên (Admin) mới có quyền tạo tài khoản vai trò Admin.', 'error');
      return;
    }
    if (
      !canManageStaffTarget(
        actorAccess,
        'create',
        {
          departmentSection: newStaffForm.departmentSection,
          room: newStaffForm.room,
          role: newStaffForm.role,
        },
        rooms
      )
    ) {
      notifyStaffBanner('Bộ phận hoặc phòng được chọn nằm ngoài phạm vi quản lý của bạn.', 'error');
      return;
    }
    const finalUserId = newStaffForm.userId.trim() || `NV-${Math.floor(1000 + Math.random() * 9000)}`;

    const normalizedJoinDate = normalizeFlexibleDateVN(newStaffForm.joinDate);
    const certs: MedicalCertificate[] = newStaffForm.certCode ? [{
      id: `CERT-${Date.now()}`,
      name: newStaffForm.certName.trim() || `Chứng chỉ Hành Nghề (${newStaffForm.specialty || newStaffForm.departmentSection})`,
      code: newStaffForm.certCode.trim(),
      issuedBy: 'Sở Y Tế / Bộ Y Tế',
      issuedDate: normalizedJoinDate ? (toInputDateFormat(normalizedJoinDate) || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
      expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().split('T')[0],
      status: 'Còn hiệu lực'
    }] : [];

    const initialHistory: WorkStatusHistoryItem = {
      id: `SH-${Date.now()}`,
      startDate: normalizedJoinDate || formatDateVN(new Date()),
      endDate: 'Hiện tại',
      status: newStaffForm.currentStatus,
      departmentSection: newStaffForm.departmentSection,
      room: newStaffForm.room,
      positionOrTitle: newStaffForm.title,
      note: 'Khởi tạo hồ sơ nhân sự mới',
      updatedBy: currentUser.name,
      createdAt: new Date().toLocaleDateString('vi-VN')
    };

    const newProfile: StaffProfile = {
      userId: finalUserId,
      fullName: newStaffForm.fullName.trim(),
      title: newStaffForm.title,
      role: newStaffForm.role,
      departmentSection: newStaffForm.departmentSection,
      room: newStaffForm.room,
      phone: normalizeVietnamesePhone(newStaffForm.phone),
      email: newStaffForm.email.trim(),
      dob: formatDateVN(newStaffForm.dob),
      gender: newStaffForm.gender,
      specialty: newStaffForm.specialty.trim() || `Chuyên môn ${newStaffForm.departmentSection}`,
      educationLevel: newStaffForm.educationLevel || undefined,
      experienceYears: normalizedJoinDate ? calculateYearsOfService(normalizedJoinDate, newStaffForm.experienceYears) : newStaffForm.experienceYears,
      joinDate: normalizedJoinDate,
      degrees: [newStaffForm.title.includes('Bác sĩ') ? 'Bác sĩ Đa khoa' : 'Cử nhân Kỹ thuật Y học'],
      certificates: certs,
      totalShiftsThisMonth: 0,
      leaveBalanceDays: 12,
      currentStatus: newStaffForm.currentStatus,
      statusHistory: [initialHistory]
    };

    storageService.saveStaffProfile(newProfile);

    // Sync to Users
    const existingUsers = storageService.getUsers();
    if (!existingUsers.some(u => u.id === finalUserId)) {
      storageService.saveUser({
        id: finalUserId,
        name: newProfile.fullName,
        email: newProfile.email || `${finalUserId.toLowerCase()}@hospital.vn`,
        role: (newProfile.role as UserRole) || 'Staff',
        title: (newProfile.title as CLSTitle) || 'Nhân viên',
        department: newProfile.departmentSection,
        room: newProfile.room,
        avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150',
        phone: newProfile.phone || '',
        status: 'Active'
      });
    }

    setProfiles(storageService.getStaffProfiles());
    setShowAddStaffModal(false);
    notifyStaffBanner(`Đã thêm nhân viên ${newProfile.fullName} thành công!`);
  };

  // --- Delete Staff Profile ---
  const handleConfirmDeleteStaff = () => {
    if (!deleteConfirmStaff) return;
    if (!canManageStaffTarget(actorAccess, 'delete', deleteConfirmStaff, rooms)) {
      notifyStaffBanner('Bạn không có quyền xóa hồ sơ nhân viên này!', 'error');
      setDeleteConfirmStaff(null);
      return;
    }
    storageService.deleteStaffProfile(deleteConfirmStaff.userId);
    setProfiles(prev => prev.filter(p => p.userId !== deleteConfirmStaff.userId));
    notifyStaffBanner(`Đã xóa hồ sơ nhân viên ${deleteConfirmStaff.fullName}.`);
    setDeleteConfirmStaff(null);
  };

  // Save edited profile (RBAC scoped action)
  const handleSaveProfileEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    const originalProfile = profiles.find(p => p.userId === editingStaff.userId) || editingStaff;
    if (!canManageStaffTarget(actorAccess, 'edit', originalProfile, rooms)) {
      notifyStaffBanner('Bạn không có quyền chỉnh sửa hồ sơ nhân sự ngoài phạm vi quản lý.', 'error');
      return;
    }
    if (!actorAccess.isDepartmentWide && !canManageStaffTarget(actorAccess, 'edit', editingStaff, rooms)) {
      notifyStaffBanner('Không thể điều chuyển nhân viên sang Bộ phận / Phòng ngoài phạm vi quản lý của bạn.', 'error');
      return;
    }

    const canChangeRoleField = canManageStaffTarget(actorAccess, 'rbac', originalProfile, rooms);
    const safeRole = canChangeRoleField
      ? (!actorAccess.isSystemAdmin && editingStaff.role === 'Admin' ? originalProfile.role : editingStaff.role)
      : originalProfile.role;

    const staffToSave: StaffProfile = {
      ...editingStaff,
      role: safeRole,
      joinDate: normalizeFlexibleDateVN(editingStaff.joinDate)
    };
    storageService.saveStaffProfile(staffToSave);
    
    // Also sync back to user list if name/role/title/department changed
    const users = storageService.getUsers();
    const userIdx = users.findIndex(u => u.id === editingStaff.userId);
    if (userIdx >= 0) {
      const targetUser = users[userIdx];
      storageService.saveUser({
        ...targetUser,
        name: staffToSave.fullName,
        title: staffToSave.title as CLSTitle,
        role: staffToSave.role as UserRole,
        department: staffToSave.departmentSection,
        room: staffToSave.room,
        avatar: staffToSave.avatar || targetUser.avatar
      });
    }

    setProfiles(storageService.getStaffProfiles());
    setEditingStaff(null);
    notifyStaffBanner(`Đã cập nhật thông tin cán bộ ${staffToSave.fullName} thành công!`);
  };

  // Add history item to editingStaff
  const handleAddHistoryItem = () => {
    if (!editingStaff || !histStartDate) {
      notifyStaffBanner('Vui lòng nhập từ ngày bắt đầu!', 'error');
      return;
    }

    const newItem: WorkStatusHistoryItem = {
      id: `SH-${Date.now()}`,
      startDate: histStartDate,
      endDate: histEndDate || 'Hiện tại',
      status: histStatus,
      departmentSection: histDept || editingStaff.departmentSection,
      room: histRoom || editingStaff.room,
      positionOrTitle: histTitle || editingStaff.title,
      note: histNote,
      updatedBy: currentUser.name,
      createdAt: new Date().toLocaleDateString('vi-VN')
    };

    const updatedHistory = [newItem, ...(editingStaff.statusHistory || [])];
    setEditingStaff({
      ...editingStaff,
      currentStatus: histStatus, // Also update current status to latest status
      departmentSection: newItem.departmentSection,
      room: newItem.room,
      title: newItem.positionOrTitle || editingStaff.title,
      statusHistory: updatedHistory
    });

    // Reset history subform
    setShowAddHistoryForm(false);
    setHistStartDate('');
    setHistEndDate('Hiện tại');
    setHistNote('');
  };

  // Open Staff Detail Modal
  const handleOpenDetailModal = (staff: StaffProfile, defaultTab: 'profile' | 'permissions' | 'history' | 'certs' = 'profile') => {
    const matchedUser = allUsers.find(
      u => u.id === staff.userId || u.name.trim().toLowerCase() === staff.fullName.trim().toLowerCase()
    );
    const effectiveTier = resolveUserManagementTier(matchedUser, staff, departments, rooms);
    const validRole = (['Admin', 'Manager', 'Doctor', 'Staff'].includes(staff.role) ? staff.role : 'Staff') as UserRole;
    setSelectedDetailStaff(staff);
    setDetailModalTab(defaultTab);
    setAssignedRole(validRole);
    setAssignedTier(effectiveTier);
    setAssignedManagedDepts(
      Array.from(new Set([...(matchedUser?.managedDepartments || []), ...(staff.managedDepartments || [])]))
    );
    setAssignedManagedRooms(
      Array.from(new Set([...(matchedUser?.managedRooms || []), ...(staff.managedRooms || [])]))
    );
    setAssignedOverrides({
      ...(staff.permissionOverrides || {}),
      ...(matchedUser?.permissionOverrides || {}),
    });
    setAssignedTitle(staff.title?.trim() ? staff.title : 'Nhân viên');
    setAssignedDept(staff.departmentSection || '');
    setAssignedRoom(staff.room || '');
    setPermissionSuccessMsg('');
  };

  // Open Edit Modal from Detail Modal
  const handleEditFromDetail = () => {
    if (!selectedDetailStaff) return;
    if (!canManageStaffTarget(actorAccess, 'edit', selectedDetailStaff, rooms)) {
      notifyStaffBanner('Bạn không có quyền chỉnh sửa hồ sơ nhân sự ngoài phạm vi quản lý.', 'error');
      return;
    }
    const staffToEdit = { ...selectedDetailStaff };
    setSelectedDetailStaff(null);
    setEditingStaff({
      ...staffToEdit,
      title: staffToEdit.title?.trim() ? staffToEdit.title : 'Nhân viên',
      joinDate: staffToEdit.joinDate ? formatDateVN(staffToEdit.joinDate, '') : '',
      experienceYears: staffToEdit.joinDate ? calculateYearsOfService(staffToEdit.joinDate, staffToEdit.experienceYears) : staffToEdit.experienceYears
    });
  };

  // Save RBAC Permissions for selected staff
  const handleSavePermissions = () => {
    if (!selectedDetailStaff) return;
    if (!canManageStaffTarget(actorAccess, 'rbac', selectedDetailStaff, rooms)) {
      notifyStaffBanner('Bạn không có quyền điều chỉnh phân quyền RBAC cho nhân sự này.', 'error');
      return;
    }
    if (!actorAccess.isSystemAdmin && (assignedTier === 'admin' || assignedRole === 'Admin')) {
      notifyStaffBanner('Chỉ Quản trị viên (Admin) mới có quyền cấp vai trò Admin.', 'error');
      return;
    }

    const sanitizedOverrides: UserPermissionOverrides = { ...assignedOverrides };
    if (!actorAccess.isSystemAdmin) {
      delete sanitizedOverrides.canConfigureRBAC;
      delete sanitizedOverrides.allowCrossScopeEdit;
    }

    const nextDepts = assignedTier === 'section_head' ? assignedManagedDepts : [];
    const nextRooms = assignedTier === 'room_head' ? assignedManagedRooms : [];
    const resolvedRole: UserRole =
      assignedTier === 'admin'
        ? 'Admin'
        : assignedRole === 'Admin'
        ? MANAGEMENT_TIER_META[assignedTier].defaultRole
        : assignedRole;

    // 1. Update StaffProfile
    const updatedStaff: StaffProfile = {
      ...selectedDetailStaff,
      role: resolvedRole,
      title: assignedTitle || selectedDetailStaff.title,
      departmentSection: assignedDept || selectedDetailStaff.departmentSection,
      room: assignedRoom || selectedDetailStaff.room,
      managementLevel: assignedTier,
      managedDepartments: nextDepts,
      managedRooms: nextRooms,
      permissionOverrides: sanitizedOverrides,
    };
    storageService.saveStaffProfile(updatedStaff);

    // 2. Sync to User accounts
    const users = storageService.getUsers();
    const idx = users.findIndex(u => u.id === selectedDetailStaff.userId || u.name.trim().toLowerCase() === selectedDetailStaff.fullName.trim().toLowerCase());
    if (idx >= 0) {
      storageService.saveUser({
        ...users[idx],
        name: updatedStaff.fullName,
        role: resolvedRole,
        title: (assignedTitle as CLSTitle) || users[idx].title,
        department: assignedDept || users[idx].department,
        room: assignedRoom || users[idx].room,
        phone: updatedStaff.phone || users[idx].phone,
        email: updatedStaff.email || users[idx].email,
        managementLevel: assignedTier,
        managedDepartments: nextDepts,
        managedRooms: nextRooms,
        permissionOverrides: sanitizedOverrides,
      });
    } else {
      const newUser: User = {
        id: selectedDetailStaff.userId,
        name: updatedStaff.fullName,
        email: updatedStaff.email || `${selectedDetailStaff.userId.toLowerCase()}@hospital.vn`,
        role: resolvedRole,
        title: (assignedTitle as CLSTitle) || 'Nhân viên',
        department: assignedDept || updatedStaff.departmentSection,
        room: assignedRoom || updatedStaff.room,
        phone: updatedStaff.phone,
        status: 'Active',
        avatar: updatedStaff.avatar || 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
        managementLevel: assignedTier,
        managedDepartments: nextDepts,
        managedRooms: nextRooms,
        permissionOverrides: sanitizedOverrides,
      };
      storageService.saveUser(newUser);
    }

    // 3. Update local state
    setSelectedDetailStaff(updatedStaff);
    setProfiles(storageService.getStaffProfiles());
    setAllUsers(storageService.getUsers());
    setPermissionSuccessMsg(`Đã cập nhật cấp bậc "${MANAGEMENT_TIER_META[assignedTier].shortLabel}" & phân quyền cho ${updatedStaff.fullName} thành công!`);
    setTimeout(() => setPermissionSuccessMsg(''), 4500);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-sm font-semibold mb-1">
            <Users className="w-4 h-4" /> QUẢN LÝ NHÂN SỰ KHOA CẬN LÂM SÀNG
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hồ Sơ Cán Bộ, Chứng Chỉ Hành Nghề & Đào Tạo</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý trình độ chuyên môn, phân loại theo phòng/bộ phận, theo dõi trạng thái làm việc (thử việc, nghỉ phép, thai sản) & lịch sử công tác.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            title={`Phạm vi quyền hạn: ${actorAccess.scopeLabel}`}
            className={`hidden lg:inline-flex px-3 py-1.5 rounded-xl text-xs font-bold items-center gap-1.5 border ${MANAGEMENT_TIER_META[actorAccess.tier].badgeClass}`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{actorAccess.shortTierLabel}</span>
            <span className="opacity-75 font-medium">• {actorAccess.scopeLabel}</span>
          </span>
          {canCreateAnyStaff && (
            <>
              <button
                onClick={handleDownloadExcelTemplate}
                title="Tải tệp mẫu Excel danh sách nhân viên (.xlsx)"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-xs transition-all border border-slate-200 dark:border-slate-700 shadow-sm"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Tải File Mẫu Excel</span>
              </button>
              <button
                onClick={() => {
                  setExcelImportStep('upload');
                  setParsedExcelStaff([]);
                  setShowImportExcelModal(true);
                }}
                title="Nhập danh sách nhân viên từ tệp Excel"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl font-semibold text-xs transition-all border border-emerald-200 dark:border-emerald-800 shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Nhập từ Excel</span>
              </button>
              <button
                onClick={handleOpenAddStaffModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-semibold text-xs transition-all shadow-sm shadow-indigo-200"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Nhân Viên</span>
              </button>
            </>
          )}
          <button
            onClick={() => openCreateLeaveModal()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-xs transition-all cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <span>Đăng Ký Nghỉ</span>
          </button>
        </div>
      </div>

      {/* Inline Feedback Banner */}
      {staffBannerMsg && (
        <div
          className={`px-4 py-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 shadow-sm ${
            staffBannerMsg.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {staffBannerMsg.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span>{staffBannerMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStaffBannerMsg(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Dòng 1: Thanh Menu / Tabs Chuyên Mục */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
            {/* 1. Lịch Đăng Ký Nghỉ (Far Left) */}
            <button
              onClick={() => setActiveTab('leave')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'leave' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/80'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Lịch Đăng Ký Nghỉ</span>
              {activeLeaveRequests.filter(l => l.status === 'Chờ duyệt').length > 0 && (
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
                  activeTab === 'leave'
                    ? 'bg-indigo-700 text-amber-200'
                    : 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                }`}>
                  {activeLeaveRequests.filter(l => l.status === 'Chờ duyệt').length}
                </span>
              )}
            </button>

            {/* 2. Hồ Sơ Nhân Viên */}
            <button
              onClick={() => setActiveTab('profiles')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'profiles' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/80'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Hồ Sơ Nhân Viên</span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                activeTab === 'profiles' ? 'bg-indigo-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {profiles.length}
              </span>
            </button>

            {/* 3. Quản Lý Chứng Chỉ CCHN/ATBX */}
            <button
              onClick={() => setActiveTab('certificates')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'certificates' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/80'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>Quản Lý Chứng Chỉ CCHN/ATBX</span>
            </button>

            {/* 4. Lịch Đào Tạo CME & ISO */}
            <button
              onClick={() => setActiveTab('training')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'training' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/80'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Lịch Đào Tạo CME & ISO</span>
            </button>
          </div>
        </div>

        {/* Dòng 2: Thanh Tìm Kiếm và Bộ Lọc */}
        <div className="p-3 md:px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Ô Tìm Kiếm */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={
                activeTab === 'profiles'
                  ? 'Tìm tên cán bộ, mã NV, chuyên môn, phòng ban...'
                  : activeTab === 'leave'
                  ? 'Tìm tên cán bộ, lý do, loại nghỉ hoặc người trực thay...'
                  : 'Tìm kiếm thông tin theo từ khóa...'
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Controls bên phải: Department filter & layout switcher */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {activeTab === 'profiles' && (
              <>
                {/* Department/Room Filter with Optgroups */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <select
                    value={selectedDepartmentFilter}
                    onChange={e => setSelectedDepartmentFilter(e.target.value)}
                    className="bg-transparent outline-none font-medium text-slate-700 dark:text-slate-200 cursor-pointer text-xs max-w-[210px] sm:max-w-[260px] truncate"
                  >
                    <option value="all" className="dark:bg-slate-900 font-bold">Tất cả Phòng / Bộ phận</option>
                    {allDepartments.length > 0 && (
                      <optgroup label="── Bộ phận (Quản lý Phòng / Bộ phận) ──" className="dark:bg-slate-900 font-bold text-slate-500">
                        {allDepartments.map(dept => (
                          <option key={`dept-${dept}`} value={dept} className="dark:bg-slate-900 font-normal">{dept}</option>
                        ))}
                      </optgroup>
                    )}
                    {allRoomNames.length > 0 && (
                      <optgroup label="── Phòng trực thuộc (Quản lý Phòng / Bộ phận) ──" className="dark:bg-slate-900 font-bold text-slate-500">
                        {allRoomNames.map(room => (
                          <option key={`rm-${room}`} value={room} className="dark:bg-slate-900 font-normal">{room}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* View Layout Switcher */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setViewMode('grid')}
                    title="Hiển thị dạng Lưới Thẻ"
                    className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('grouped')}
                    title="Hiển thị Gom nhóm theo Phòng / Bộ phận"
                    className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grouped' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                </div>

                {!actorAccess.isDepartmentWide && (actorAccess.allowedDepartments.length > 0 || actorAccess.allowedRooms.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setScopeOnlyFilter(prev => !prev)}
                    title="Chỉ hiển thị nhân sự thuộc phạm vi bạn quản lý"
                    className={`px-2.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border shrink-0 ${
                      scopeOnlyFilter
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Trong phạm vi quản lý</span>
                    <span className="lg:hidden">Phạm vi</span>
                  </button>
                )}

                {/* Quick Add Employee & Import Buttons */}
                {canCreateAnyStaff && (
                  <>
                    <button
                      onClick={handleOpenAddStaffModal}
                      title="Thêm nhân viên mới"
                      className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shadow-sm shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Thêm NV</span>
                    </button>
                    <button
                      onClick={() => {
                        setExcelImportStep('upload');
                        setParsedExcelStaff([]);
                        setShowImportExcelModal(true);
                      }}
                      title="Nhập danh sách từ Excel"
                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shrink-0"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="hidden md:inline">Excel</span>
                    </button>
                  </>
                )}
              </>
            )}

            {(searchTerm || selectedDepartmentFilter !== 'all' || scopeOnlyFilter) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedDepartmentFilter('all');
                  setScopeOnlyFilter(false);
                }}
                className="px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/30 rounded-xl transition-colors shrink-0"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>

        {/* Tab 1 (Far Left): Leave Registration Calendar (Week / Month view) */}
        {activeTab === 'leave' && (
          <>
            {leaveFeedbackMsg && (
              <div className="mx-5 sm:mx-6 mt-5 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{leaveFeedbackMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLeaveFeedbackMsg('')}
                  className="p-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <LeaveCalendarTab
              leaveRequests={leaveRequests}
              profiles={profiles}
              searchTerm={searchTerm}
              isAdmin={isStrictLeaveAdmin}
              canApproveLeave={canApproveLeave}
              currentUserId={currentUser.id}
              onOpenCreateModal={openCreateLeaveModal}
              onApproveLeave={handleApproveLeave}
              onDeleteLeave={handleDeleteLeave}
            />
          </>
        )}

        {/* Tab 2: Staff Profiles (with Filter by Room/Dept, Admin Edit, Status Badges & Career History) */}
        {activeTab === 'profiles' && (
          <div className="p-6 space-y-6">
            {/* View Mode 1: GRID VIEW */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProfiles.map((staff, idx) => (
                  <div key={`${staff.userId}-${idx}`} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all p-5 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      {/* Top Row: Chức danh badge (trái) & Action buttons + Số năm công tác gọn (phải) */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-extrabold px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 rounded uppercase whitespace-nowrap shrink-0 border border-indigo-100 dark:border-indigo-900/50">
                          {staff.title?.trim() || 'Nhân viên'}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Scoped Edit & Delete Buttons */}
                          {canManageStaffTarget(actorAccess, 'edit', staff, rooms) && (
                            <button
                              onClick={() => setEditingStaff({
                                ...staff,
                                title: staff.title?.trim() ? staff.title : 'Nhân viên',
                                joinDate: staff.joinDate ? formatDateVN(staff.joinDate, '') : '',
                                experienceYears: staff.joinDate ? calculateYearsOfService(staff.joinDate, staff.experienceYears) : staff.experienceYears
                              })}
                              title="Chỉnh sửa thông tin cán bộ trong phạm vi quyền hạn"
                              className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 rounded-md transition-all text-xs font-semibold flex items-center gap-1 border border-indigo-200 dark:border-indigo-800"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Sửa</span>
                            </button>
                          )}
                          {canManageStaffTarget(actorAccess, 'delete', staff, rooms) && (
                            <button
                              onClick={() => setDeleteConfirmStaff(staff)}
                              title="Xóa nhân viên khỏi hệ thống"
                              className="p-0.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {/* Số năm công tác hiển thị gọn trong ô */}
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700 whitespace-nowrap"
                            title={`${staff.experienceYears} năm công tác`}
                          >
                            ⏱️ {staff.experienceYears} năm
                          </span>
                        </div>
                      </div>

                      {/* Full Name Row: Chiếm trọn 100% chiều rộng của ô, hiển thị kèm icon/ảnh đại diện */}
                      <div className="pt-0.5">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                          <button
                            type="button"
                            onClick={() => handleOpenDetailModal(staff, 'profile')}
                            className="w-full text-left hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer flex items-center justify-between gap-2.5 group"
                            title="Nhấn để mở chi tiết hồ sơ & phân quyền nhân viên"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 shadow-2xs">
                                {staff.avatar ? (
                                  <img 
                                    src={staff.avatar} 
                                    alt={staff.fullName} 
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  staff.fullName.charAt(0) || 'NV'
                                )}
                              </div>
                              <span className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:underline truncate">
                                {staff.fullName}
                              </span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 shrink-0 group-hover:translate-x-0.5 transition-all" />
                          </button>
                        </h3>
                      </div>

                      {/* Current Status Badge & Room */}
                      <div className="flex items-center justify-between">
                        {getEmploymentStatusBadge(staff.currentStatus)}
                        {staff.room && (
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            🏢 {staff.room}
                          </span>
                        )}
                      </div>

                      {/* Department Section */}
                      <p className="text-xs text-indigo-900 dark:text-indigo-200 font-semibold bg-indigo-50/70 dark:bg-indigo-950/40 p-2 rounded-lg border border-indigo-100 dark:border-indigo-900/50 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                        {staff.departmentSection}
                      </p>

                      {/* Personal Info Details: Gender, DOB, Phone, Email */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/90 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                        <div className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <span className="font-semibold text-slate-500 dark:text-slate-400">Giới tính:</span>
                          <strong className="text-slate-900 dark:text-white font-bold">{staff.gender || '---'}</strong>
                        </div>
                        <div className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <span className="font-semibold text-slate-500 dark:text-slate-400">Ngày sinh:</span>
                          <strong className="text-slate-900 dark:text-white font-bold">{staff.dob ? formatDateVN(staff.dob) : '---'}</strong>
                        </div>
                        <div className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5 col-span-2 sm:col-span-1 truncate" title={staff.phone}>
                          <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <strong className="text-slate-800 dark:text-slate-200 font-semibold font-mono truncate">{normalizeVietnamesePhone(staff.phone) || 'Chưa có SĐT'}</strong>
                        </div>
                        <div className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5 col-span-2 sm:col-span-1 truncate" title={staff.email}>
                          <Mail className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <strong className="text-slate-800 dark:text-slate-200 font-semibold truncate">{staff.email || 'Chưa có Email'}</strong>
                        </div>
                      </div>

                      {/* Join Date & Service Years Info */}
                      <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 font-medium">
                        <span className="text-slate-600 dark:text-slate-400">📅 Ngày vào làm: <strong className="text-slate-900 dark:text-white">{staff.joinDate ? formatDateVN(staff.joinDate) : 'Chưa cập nhật'}</strong></span>
                        <span className="text-slate-600 dark:text-slate-400">⏱️ Công tác: <strong className="text-indigo-600 dark:text-indigo-400">{staff.experienceYears} năm</strong></span>
                      </div>

                      {/* Specialty & Degrees */}
                      <div className="space-y-2 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Trình độ chuyên môn:</span>
                          <p className="text-slate-800 dark:text-slate-200 font-medium mt-0.5">
                            {staff.educationLevel && (
                              <span className="inline-block mr-1.5 px-1.5 py-0.2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-100 dark:border-indigo-800 text-[10px] font-bold">
                                {staff.educationLevel}
                              </span>
                            )}
                            {staff.specialty}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Bằng cấp & Học vị:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {staff.degrees.map((deg, idx) => (
                              <span key={idx} className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                                {deg}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions & Stats */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                        <span>Ca trực tháng này: <strong className="text-slate-900 dark:text-white">{staff.totalShiftsThisMonth} ca</strong></span>
                        <span>Phép còn: <strong className="text-indigo-600 dark:text-indigo-400">{staff.leaveBalanceDays} ngày</strong></span>
                      </div>

                      {/* Quick Detail & Permissions Action Buttons */}
                      <div className={`grid gap-2 ${canManageStaffTarget(actorAccess, 'rbac', staff, rooms) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button
                          onClick={() => handleOpenDetailModal(staff, 'profile')}
                          className="py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-800"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Chi tiết
                        </button>
                        {canManageStaffTarget(actorAccess, 'rbac', staff, rooms) && (
                          <button
                            onClick={() => handleOpenDetailModal(staff, 'permissions')}
                            className="py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 border border-purple-200 dark:border-purple-800"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> Phân quyền
                          </button>
                        )}
                      </div>

                      {/* Career History Button */}
                      <button
                        onClick={() => setHistoryViewingStaff(staff)}
                        className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700"
                      >
                        <History className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /> Diễn biến công tác ({staff.statusHistory?.length || 0})
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* View Mode 2: GROUPED BY DEPARTMENT / ROOM */}
            {viewMode === 'grouped' && (
              <div className="space-y-6">
                {(Object.entries(groupedProfiles) as [string, StaffProfile[]][]).map(([deptName, deptStaffList]) => (
                  <div key={deptName} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    {/* Section Header */}
                    <div className="bg-slate-100/80 dark:bg-slate-800/80 px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">{deptName}</h3>
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 rounded-full text-xs font-extrabold border border-indigo-200/50 dark:border-indigo-900/50">
                          {deptStaffList.length} nhân sự
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                        <span>Đang làm việc: <strong className="text-emerald-600 dark:text-emerald-400">{deptStaffList.filter(s => s.currentStatus === 'Đang làm việc').length}</strong></span>
                        <span>Đang thử việc: <strong className="text-blue-600 dark:text-blue-400">{deptStaffList.filter(s => s.currentStatus === 'Đang thử việc').length}</strong></span>
                        <span>Nghỉ thai sản/không lương: <strong className="text-purple-600 dark:text-purple-400">{deptStaffList.filter(s => s.currentStatus === 'Nghỉ thai sản' || s.currentStatus === 'Nghỉ không lương').length}</strong></span>
                      </div>
                    </div>

                    {/* Staff List Table inside Department */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3 whitespace-nowrap">Họ & Tên</th>
                            <th className="p-3 whitespace-nowrap">Thông Tin Cá Nhân & Liên Hệ</th>
                            <th className="p-3 whitespace-nowrap">Chức danh / Vai trò</th>
                            <th className="p-3 whitespace-nowrap">Phòng làm việc</th>
                            <th className="p-3 whitespace-nowrap">Trạng thái</th>
                            <th className="p-3 whitespace-nowrap">Trình độ chuyên môn</th>
                            <th className="p-3 whitespace-nowrap">Ngày vào làm</th>
                            <th className="p-3 whitespace-nowrap">Số năm công tác</th>
                            <th className="p-3 text-right whitespace-nowrap min-w-[150px]">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {deptStaffList.map((staff, idx) => (
                            <tr key={`${staff.userId}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="p-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleOpenDetailModal(staff, 'profile')}
                                  className="flex items-center gap-2.5 text-left group hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                                  title="Nhấn để mở bảng chi tiết thông tin & phân quyền nhân viên"
                                >
                                  <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-[11px] font-bold text-indigo-700 dark:text-indigo-300 shadow-2xs">
                                    {staff.avatar ? (
                                      <img 
                                        src={staff.avatar} 
                                        alt={staff.fullName} 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      staff.fullName.charAt(0) || 'NV'
                                    )}
                                  </div>
                                  <span className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:underline underline-offset-2">{staff.fullName}</span>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                                </button>
                              </td>
                              <td className="p-3 text-slate-700 dark:text-slate-300">
                                <div className="space-y-0.5 text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">{staff.gender || '---'}</span>
                                    {staff.dob && <span className="text-slate-400 dark:text-slate-500">• {formatDateVN(staff.dob)}</span>}
                                  </div>
                                  {(staff.phone || staff.email) && (
                                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[10px]">
                                      {staff.phone && <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-mono"><Phone className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />{normalizeVietnamesePhone(staff.phone)}</span>}
                                      {staff.email && <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400"><Mail className="w-2.5 h-2.5 text-indigo-500 dark:text-indigo-400" />{staff.email}</span>}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span className="font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] border border-slate-200 dark:border-slate-700">
                                  {staff.title} ({staff.role})
                                </span>
                              </td>
                              <td className="p-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                                {staff.room || 'Phòng chung khoa'}
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                {getEmploymentStatusBadge(staff.currentStatus)}
                              </td>
                              <td className="p-3 text-slate-700 dark:text-slate-300 max-w-xs truncate" title={`${staff.educationLevel ? staff.educationLevel + ' - ' : ''}${staff.specialty}`}>
                                {staff.educationLevel ? `${staff.educationLevel} • ` : ''}{staff.specialty}
                              </td>
                              <td className="p-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {staff.joinDate ? formatDateVN(staff.joinDate) : '---'}
                              </td>
                              <td className="p-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                                {staff.experienceYears} năm
                              </td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                  {canManageStaffTarget(actorAccess, 'rbac', staff, rooms) && (
                                    <button
                                      onClick={() => handleOpenDetailModal(staff, 'permissions')}
                                      className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 border border-purple-200 dark:border-purple-800 shrink-0"
                                      title="Phân quyền cho nhân viên"
                                    >
                                      <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> Phân quyền
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setHistoryViewingStaff(staff)}
                                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-300 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 shrink-0"
                                  >
                                    <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Lịch sử
                                  </button>
                                  {canManageStaffTarget(actorAccess, 'edit', staff, rooms) && (
                                    <button
                                      onClick={() => setEditingStaff({
                                        ...staff,
                                        title: staff.title?.trim() ? staff.title : 'Nhân viên',
                                        joinDate: staff.joinDate ? formatDateVN(staff.joinDate, '') : '',
                                        experienceYears: staff.joinDate ? calculateYearsOfService(staff.joinDate, staff.experienceYears) : staff.experienceYears
                                      })}
                                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 border border-indigo-200 dark:border-indigo-800 shrink-0"
                                    >
                                      <Edit3 className="w-3 h-3" /> Sửa
                                    </button>
                                  )}
                                  {canManageStaffTarget(actorAccess, 'delete', staff, rooms) && (
                                    <button
                                      onClick={() => setDeleteConfirmStaff(staff)}
                                      title="Xóa nhân viên"
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State when no profiles found */}
            {filteredProfiles.length === 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center max-w-xl mx-auto my-6 shadow-sm">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">
                  {profiles.length === 0 
                    ? 'Chưa có nhân viên nào trong danh sách' 
                    : 'Không tìm thấy nhân viên phù hợp với bộ lọc'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                  {profiles.length === 0
                    ? 'Hệ thống đã sẵn sàng đưa vào vận hành thực tế. Bạn có thể thêm từng nhân viên mới hoặc nhập nhanh toàn bộ danh sách cán bộ từ file Excel.'
                    : 'Thử tìm kiếm với từ khóa khác hoặc bấm nút "Xóa lọc" để xem toàn bộ danh sách nhân sự.'}
                </p>
                {profiles.length === 0 ? (
                  canCreateAnyStaff ? (
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        onClick={handleOpenAddStaffModal}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> Thêm Nhân Viên Mới
                      </button>
                      <button
                        onClick={() => {
                          setExcelImportStep('upload');
                          setParsedExcelStaff([]);
                          setShowImportExcelModal(true);
                        }}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4" /> Nhập Từ File Excel
                      </button>
                      <button
                        onClick={handleDownloadExcelTemplate}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border border-slate-200 dark:border-slate-700"
                      >
                        <Download className="w-4 h-4" /> Tải File Mẫu (.xlsx)
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-medium">
                      <Lock className="w-3.5 h-3.5" /> Tài khoản hiện tại chỉ có quyền xem danh mục
                    </span>
                  )
                ) : (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedDepartmentFilter('all');
                      setScopeOnlyFilter(false);
                    }}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-all"
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Certificate Tracker */}
        {activeTab === 'certificates' && (() => {
          const allFlattenedCerts = profiles.flatMap(p => 
            (p.certificates || []).map(c => ({
              ...c,
              staffName: p.fullName,
              staffUserId: p.userId,
              staffTitle: p.title,
              staffDept: p.departmentSection
            }))
          );

          const totalCertsCount = allFlattenedCerts.length;
          const validCertsCount = allFlattenedCerts.filter(c => c.status === 'Còn hiệu lực').length;
          const expiringCertsCount = allFlattenedCerts.filter(c => c.status === 'Sắp hết hạn').length;
          const expiredCertsCount = allFlattenedCerts.filter(c => c.status === 'Hết hiệu lực').length;

          const displayedCertificates = allFlattenedCerts.filter(cert => {
            const matchesSearch = !searchTerm.trim() || 
              cert.staffName.toLowerCase().includes(searchTerm.toLowerCase()) ||
              cert.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              cert.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
              cert.issuedBy.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = certStatusFilter === 'all' || cert.status === certStatusFilter;

            return matchesSearch && matchesStatus;
          });

          return (
            <div className="p-6 space-y-5">
              {/* Header & Primary Action Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Award className="w-5 h-5 text-indigo-600" />
                    <span>Danh Sách Chứng Chỉ Chuyên Môn & Cảnh Báo Hạn CCHN / An Toàn Bức Xạ</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Theo dõi chứng chỉ hành nghề khám chữa bệnh, giấy phép an toàn bức xạ hạt nhân, siêu âm & kiểm chuẩn ISO 15189
                  </p>
                </div>
                
                {/* NÚT THÊM MỚI CHỨNG CHỈ */}
                {actorAccess.permissions.canManageCertificates && (
                  <button
                    onClick={() => handleOpenAddCert()}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Mới Chứng Chỉ</span>
                  </button>
                )}
              </div>

              {/* KPI Summary & Status Filter Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => setCertStatusFilter('all')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    certStatusFilter === 'all'
                      ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20'
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-slate-500">Tổng số chứng chỉ</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{totalCertsCount}</div>
                </button>

                <button
                  onClick={() => setCertStatusFilter('Còn hiệu lực')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    certStatusFilter === 'Còn hiệu lực'
                      ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Còn hiệu lực
                  </div>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">{validCertsCount}</div>
                </button>

                <button
                  onClick={() => setCertStatusFilter('Sắp hết hạn')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    certStatusFilter === 'Sắp hết hạn'
                      ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20'
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Sắp hết hạn (≤ 6 tháng)
                  </div>
                  <div className="text-lg font-bold text-amber-700 mt-0.5">{expiringCertsCount}</div>
                </button>

                <button
                  onClick={() => setCertStatusFilter('Hết hiệu lực')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    certStatusFilter === 'Hết hiệu lực'
                      ? 'bg-red-50 border-red-300 ring-2 ring-red-500/20'
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Hết hiệu lực
                  </div>
                  <div className="text-lg font-bold text-red-700 mt-0.5">{expiredCertsCount}</div>
                </button>
              </div>

              {/* Certificates Table */}
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3 whitespace-nowrap">Họ & Tên Nhân Viên</th>
                      <th className="p-3">Tên Chứng Chỉ</th>
                      <th className="p-3 whitespace-nowrap">Mã Số</th>
                      <th className="p-3">Cơ Quan Cấp</th>
                      <th className="p-3 whitespace-nowrap">Ngày Cấp</th>
                      <th className="p-3 whitespace-nowrap">Hạn Hiệu Lực</th>
                      <th className="p-3 whitespace-nowrap">Trạng Thái</th>
                      <th className="p-3 text-center whitespace-nowrap min-w-[130px]">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {displayedCertificates.length > 0 ? (
                      displayedCertificates.map((cert, idx) => (
                        <tr key={`${cert.staffUserId}-${cert.id}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900 dark:text-white">{cert.staffName}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{cert.staffTitle} • {cert.staffDept}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                              <Award className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span>{cert.name}</span>
                            </div>
                            {cert.fileUrl && (
                              <div className="text-[10px] text-slate-400 mt-0.5">Tệp: {cert.fileUrl}</div>
                            )}
                          </td>
                          <td className="p-3 font-mono font-medium text-slate-700">
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {cert.code}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{cert.issuedBy}</td>
                          <td className="p-3 text-slate-600 whitespace-nowrap">{formatDateVN(cert.issuedDate)}</td>
                          <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                            <span className={cert.status === 'Hết hiệu lực' ? 'text-red-600 font-bold' : cert.status === 'Sắp hết hạn' ? 'text-amber-600 font-bold' : 'text-slate-900'}>
                              {formatDateVN(cert.expiryDate)}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
                              cert.status === 'Còn hiệu lực' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : cert.status === 'Sắp hết hạn'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {cert.status === 'Còn hiệu lực' && <CheckCircle2 className="w-3.5 h-3.5" />}
                              {cert.status === 'Sắp hết hạn' && <AlertCircle className="w-3.5 h-3.5" />}
                              {cert.status === 'Hết hiệu lực' && <AlertTriangle className="w-3.5 h-3.5" />}
                              {cert.status}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            {(() => {
                              const ownerProfile = profiles.find(p => p.userId === cert.staffUserId);
                              const canManageCert = ownerProfile ? canManageStaffTarget(actorAccess, 'cert', ownerProfile, rooms) : false;
                              if (!canManageCert) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-medium">
                                    <Lock className="w-3 h-3" /> Chỉ xem
                                  </span>
                                );
                              }
                              return (
                                <div className="flex items-center justify-center gap-1.5">
                                  {/* NÚT CHỈNH SỬA */}
                                  <button
                                    onClick={() => handleOpenEditCert(cert, cert.staffUserId)}
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 border border-indigo-200"
                                    title="Chỉnh sửa chứng chỉ"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Sửa</span>
                                  </button>

                                  {/* NÚT XÓA */}
                                  <button
                                    onClick={() => handleDeleteCertClick(cert, cert.staffUserId, cert.staffName)}
                                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 border border-red-200"
                                    title="Xóa chứng chỉ"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Xóa</span>
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Award className="w-8 h-8 text-slate-300" />
                            <p className="font-semibold text-slate-600">Không tìm thấy chứng chỉ nào phù hợp</p>
                            <p className="text-xs text-slate-400">Thử thay đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm</p>
                            {actorAccess.permissions.canManageCertificates && (
                              <button
                                onClick={() => handleOpenAddCert()}
                                className="mt-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" /> Thêm Mới Chứng Chỉ
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Tab 4: Training Courses */}
        {activeTab === 'training' && (
          <div className="p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Lịch Đào Tạo Liên Tục CME & Tập Huấn Chất Lượng ISO 15189</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {trainingCourses.map(course => (
                <div key={course.id} className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 uppercase">
                      {course.category}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                      {course.status}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">{course.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300">Giảng viên: <strong>{course.trainer}</strong></p>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-100 dark:border-slate-700 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400 dark:text-slate-500">Địa điểm:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{course.location}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 dark:text-slate-500">Thời gian:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{course.startDate} đến {course.endDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Số tiết tích lũy:</span>
                      <span className="font-bold text-indigo-600">{course.creditsOrHours}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Admin Edit Staff Profile Modal - Khoa học, cân đối, bố cục chuẩn công thái học */}
      {editingStaff && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-6 sm:p-7 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                {/* Clickable Avatar thumbnail */}
                <button
                  type="button"
                  onClick={() => setShowAvatarPickerModal(true)}
                  className="relative group cursor-pointer focus:outline-none"
                  title="Nhấn để đổi icon hoặc ảnh đại diện"
                >
                  <div className="w-11 h-11 rounded-2xl overflow-hidden border-2 border-indigo-200 dark:border-indigo-800 group-hover:border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center shadow-xs transition-all">
                    {editingStaff.avatar ? (
                      <img 
                        src={editingStaff.avatar} 
                        alt={editingStaff.fullName} 
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.onerror = null;
                          target.src = createEmojiSvgDataUri('👨‍⚕️', '#4f46e5');
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm">
                        {editingStaff.fullName.charAt(0) || 'NV'}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform">
                    <Camera className="w-2.5 h-2.5" />
                  </div>
                </button>

                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Chỉnh Sửa Hồ Sơ Cán Bộ
                    <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/60">
                      {editingStaff.id}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cập nhật ảnh đại diện, thông tin định danh, chuyên môn công tác và phân quyền hệ thống
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
                title="Đóng cửa sổ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfileEdit} className="space-y-4 text-xs">
              {/* KHỐI ẢNH & ICON ĐẠI DIỆN */}
              <div className="p-3 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-purple-50/50 dark:from-slate-800/80 dark:via-indigo-950/30 dark:to-slate-800/80 rounded-2xl border border-indigo-100 dark:border-indigo-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div
                    onClick={() => setShowAvatarPickerModal(true)}
                    className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 shadow-2xs flex items-center justify-center shrink-0 cursor-pointer hover:border-indigo-400 transition-all"
                    title="Nhấn để đổi icon hoặc ảnh đại diện"
                  >
                    {editingStaff.avatar ? (
                      <img 
                        src={editingStaff.avatar} 
                        alt={editingStaff.fullName} 
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.onerror = null;
                          target.src = createEmojiSvgDataUri('👨‍⚕️', '#4f46e5');
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-base">
                        {editingStaff.fullName.charAt(0) || 'NV'}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                      <Smile className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Ảnh / Icon Đại Diện Cán Bộ
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Chọn icon y tế chuyên ngành (ống nghe, kính hiển vi, X-Quang...) hoặc tải ảnh từ máy tính
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="px-3 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Tải Ảnh Lên</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => {
                        if (e.target.files?.[0]) handleAvatarFileUpload(e.target.files[0]);
                      }}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowAvatarPickerModal(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Chọn Icon Mẫu</span>
                  </button>

                  {editingStaff.avatar && (
                    <button
                      type="button"
                      onClick={() => setEditingStaff({ ...editingStaff, avatar: '' })}
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                      title="Khôi phục ảnh mặc định"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* SECTION 1: Định danh & Chức vụ (Cân đối 2 cột 60/40) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                <div className="sm:col-span-7">
                  <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Họ và Tên Cán Bộ <span className="text-rose-500 ml-0.5">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    value={editingStaff.fullName}
                    onChange={e => setEditingStaff({ ...editingStaff, fullName: e.target.value })}
                    className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white shadow-2xs"
                    placeholder="VD: BS.CKI Nguyễn Văn An"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Chức Danh Chuyên Môn <span className="text-rose-500 ml-0.5">*</span>:
                  </label>
                  <select
                    value={editingStaff.title?.trim() || 'Nhân viên'}
                    onChange={e => setEditingStaff({ ...editingStaff, title: e.target.value })}
                    className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800 dark:text-slate-100 shadow-2xs cursor-pointer"
                  >
                    {editingStaff.title?.trim() && !['Trưởng khoa', 'Phó khoa', 'Điều dưỡng trưởng', 'Nhân viên'].includes(editingStaff.title.trim()) && (
                      <option value={editingStaff.title.trim()}>{editingStaff.title.trim()}</option>
                    )}
                    <option value="Trưởng khoa">Trưởng khoa</option>
                    <option value="Phó khoa">Phó khoa</option>
                    <option value="Điều dưỡng trưởng">Điều dưỡng trưởng</option>
                    <option value="Nhân viên">Nhân viên</option>
                  </select>
                </div>
              </div>

              {/* SECTION 2: Thông tin cá nhân & Liên hệ (Thẳng hàng tuyệt đối trên 1 hàng 12 cột) */}
              <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Thông Tin Cá Nhân & Liên Hệ
                  </h4>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Các ô nhập được căn chỉnh cân đối chuẩn</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  {/* Giới tính: 2/12 */}
                  <div className="sm:col-span-2">
                    <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Giới Tính:
                    </label>
                    <select
                      value={editingStaff.gender || 'Nam'}
                      onChange={e => setEditingStaff({ ...editingStaff, gender: e.target.value as 'Nam' | 'Nữ' | 'Khác' })}
                      className="w-full h-10 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-slate-100 shadow-2xs cursor-pointer"
                    >
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </div>

                  {/* Ngày sinh: 3/12 */}
                  <div className="sm:col-span-3">
                    <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Ngày Sinh:
                    </label>
                    <input
                      type="date"
                      value={toInputDateFormat(editingStaff.dob)}
                      onChange={e => setEditingStaff({ ...editingStaff, dob: formatDateVN(e.target.value) })}
                      className="w-full h-10 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-slate-100 shadow-2xs"
                    />
                  </div>

                  {/* Số điện thoại: 3/12 */}
                  <div className="sm:col-span-3">
                    <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Số Điện Thoại:
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        placeholder="VD: 0987218099"
                        value={editingStaff.phone || ''}
                        onChange={e => setEditingStaff({ ...editingStaff, phone: normalizeVietnamesePhone(e.target.value) })}
                        className="w-full h-10 pl-8 pr-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-medium text-slate-800 dark:text-slate-100 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Email liên hệ: 4/12 (Đủ độ rộng không bị che khuất) */}
                  <div className="sm:col-span-4">
                    <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Email Liên Hệ:
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        placeholder="canbo@benhvien.vn"
                        value={editingStaff.email || ''}
                        onChange={e => setEditingStaff({ ...editingStaff, email: e.target.value })}
                        className="w-full h-10 pl-8 pr-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-slate-100 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Phân công đơn vị & Chuyên môn công tác (Ô lựa chọn gọn gàng, 2 bên cao bằng nhau) */}
              <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Phân Công Đơn Vị & Chuyên Môn
                  </h4>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Chọn nhanh từ danh mục hoặc nhập mới</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cột trái: Bộ Phận (Từ Quản lý Phòng / Bộ phận) */}
                  <div>
                    <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Bộ Phận <span className="text-rose-500 ml-0.5">*</span>:
                    </label>
                    {(() => {
                      const deptChoices = actorAccess.isDepartmentWide
                        ? allDepartments
                        : selectableDepartmentsForActor.map(d => d.name).filter(n => n && n !== 'Chưa phân bộ phận');
                      return (
                        <select
                          required
                          value={editingStaff.departmentSection}
                          onChange={e => {
                            const nextDept = e.target.value;
                            const allowedRoomNames = new Set(selectableRoomsForActor.map(r => r.name));
                            const nextDeptRooms = getRoomsForDepartment(nextDept).filter(
                              rName => actorAccess.isDepartmentWide || allowedRoomNames.has(rName)
                            );
                            const keepRoom = editingStaff.room && nextDeptRooms.includes(editingStaff.room) ? editingStaff.room : '';
                            setEditingStaff({ ...editingStaff, departmentSection: nextDept, room: keepRoom });
                          }}
                          className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800 dark:text-slate-100 shadow-2xs cursor-pointer"
                        >
                          <option value="">-- Chọn bộ phận ({deptChoices.length}) --</option>
                          {editingStaff.departmentSection && !deptChoices.includes(editingStaff.departmentSection) && (
                            <option value={editingStaff.departmentSection}>{editingStaff.departmentSection}</option>
                          )}
                          {deptChoices.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>

                  {/* Cột phải: Phòng Làm Việc Trực Thuộc theo Bộ phận đã chọn */}
                  <div>
                    <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                      <Grid className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Phòng Làm Việc Trực Thuộc:
                    </label>
                    {(() => {
                      const allowedRoomNames = new Set(selectableRoomsForActor.map(r => r.name));
                      const deptRooms = getRoomsForDepartment(editingStaff.departmentSection).filter(
                        rName => actorAccess.isDepartmentWide || allowedRoomNames.has(rName)
                      );
                      return (
                        <select
                          value={editingStaff.room || ''}
                          onChange={e => setEditingStaff({ ...editingStaff, room: e.target.value })}
                          className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800 dark:text-slate-100 shadow-2xs cursor-pointer"
                        >
                          <option value="">
                            {editingStaff.departmentSection && deptRooms.length === 0
                              ? `-- Bộ phận "${editingStaff.departmentSection}" chưa có phòng trực thuộc trong phạm vi --`
                              : `-- Chưa phân phòng làm việc (${deptRooms.length}) --`}
                          </option>
                          {editingStaff.room && !deptRooms.includes(editingStaff.room) && (
                            <option value={editingStaff.room}>{editingStaff.room}</option>
                          )}
                          {deptRooms.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                </div>

                {/* Hàng giữa: Trình độ chuyên môn (ô nhập + menu thả xuống chọn bậc) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-1">
                  {/* Ô nhập Trình độ chuyên môn */}
                  <div className="md:col-span-7">
                    <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Trình Độ Chuyên Môn <span className="text-rose-500 ml-0.5">*</span>:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Kỹ thuật X-Quang & Chẩn đoán hình ảnh..."
                      value={editingStaff.specialty}
                      onChange={e => setEditingStaff({ ...editingStaff, specialty: e.target.value })}
                      className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-slate-100 shadow-2xs"
                    />
                  </div>

                  {/* Menu thả xuống chọn bậc trình độ */}
                  <div className="md:col-span-5">
                    <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Bậc Trình Độ:
                    </label>
                    <select
                      value={editingStaff.educationLevel || ''}
                      onChange={e => setEditingStaff({ ...editingStaff, educationLevel: e.target.value })}
                      className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800 dark:text-slate-100 shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Chọn trình độ --</option>
                      {editingStaff.educationLevel && !['Trên Đại học', 'Đại học', 'Cao đẳng', 'Trung cấp'].includes(editingStaff.educationLevel) && (
                        <option value={editingStaff.educationLevel}>{editingStaff.educationLevel}</option>
                      )}
                      <option value="Trên Đại học">Trên Đại học</option>
                      <option value="Đại học">Đại học</option>
                      <option value="Cao đẳng">Cao đẳng</option>
                      <option value="Trung cấp">Trung cấp</option>
                    </select>
                  </div>
                </div>

                {/* Hàng dưới: Ngày Vào Làm & Số Năm Công Tác */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <div className="h-5 flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Ngày Vào Làm:
                      </label>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">dd/mm/yyyy · mm/yyyy · yyyy</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="dd/mm/yyyy, mm/yyyy hoặc yyyy"
                        value={editingStaff.joinDate || ''}
                        onChange={e => {
                          const raw = e.target.value;
                          const calculatedYears = calculateYearsOfService(raw, editingStaff.experienceYears);
                          setEditingStaff({
                            ...editingStaff,
                            joinDate: raw,
                            experienceYears: calculatedYears
                          });
                        }}
                        onBlur={() => {
                          const normalized = normalizeFlexibleDateVN(editingStaff.joinDate);
                          if (normalized !== (editingStaff.joinDate || '')) {
                            setEditingStaff({
                              ...editingStaff,
                              joinDate: normalized,
                              experienceYears: calculateYearsOfService(normalized, editingStaff.experienceYears)
                            });
                          }
                        }}
                        className="w-full h-10 pl-3 pr-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-slate-100 shadow-2xs"
                      />
                      <button
                        type="button"
                        title="Chọn ngày từ lịch"
                        onClick={() => {
                          const picker = editJoinDatePickerRef.current;
                          if (!picker) return;
                          if (typeof picker.showPicker === 'function') {
                            picker.showPicker();
                          } else {
                            picker.click();
                          }
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 rounded-lg transition-colors"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <input
                        ref={editJoinDatePickerRef}
                        type="date"
                        tabIndex={-1}
                        aria-hidden="true"
                        value={toInputDateFormat(editingStaff.joinDate)}
                        onChange={e => {
                          if (!e.target.value) return;
                          const newJoinDate = formatDateVN(e.target.value, '');
                          const calculatedYears = calculateYearsOfService(newJoinDate, editingStaff.experienceYears);
                          setEditingStaff({
                            ...editingStaff,
                            joinDate: newJoinDate,
                            experienceYears: calculatedYears
                          });
                        }}
                        className="sr-only"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="h-5 flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Số Năm Công Tác:</label>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">(Tự tính)</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={editingStaff.experienceYears}
                        onChange={e => setEditingStaff({ ...editingStaff, experienceYears: parseInt(e.target.value) || 0 })}
                        className="w-full h-10 pl-3 pr-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white shadow-2xs"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 dark:text-slate-500 pointer-events-none">
                        năm
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: Phân quyền & Trạng thái hoạt động (Cân đối 50/50) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Phân Quyền Hệ Thống (RBAC):
                  </label>
                  {(() => {
                    const originalProfile = profiles.find(p => p.userId === editingStaff.userId) || editingStaff;
                    const canChangeEditRole = canManageStaffTarget(actorAccess, 'rbac', originalProfile, rooms);
                    return (
                      <>
                        <select
                          value={editingStaff.role}
                          disabled={!canChangeEditRole}
                          onChange={e => setEditingStaff({ ...editingStaff, role: e.target.value })}
                          className={`w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800 dark:text-slate-100 shadow-2xs ${
                            canChangeEditRole ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed'
                          }`}
                        >
                          {(actorAccess.isSystemAdmin || editingStaff.role === 'Admin') && (
                            <option value="Admin">Admin (Quản trị viên toàn hệ thống)</option>
                          )}
                          <option value="Manager">Manager (Ban Chủ Nhiệm / Quản lý khoa / Trưởng bộ phận / Trưởng phòng)</option>
                          <option value="Doctor">Doctor (Bác sĩ chuyên khoa)</option>
                          <option value="Staff">Staff (Kỹ thuật viên / Điều dưỡng / Nhân viên)</option>
                        </select>
                        {!canChangeEditRole && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            Chỉ Quản trị viên (Admin) hoặc người được ủy quyền RBAC mới có thể đổi vai trò hệ thống.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div>
                  <label className="h-5 flex items-center font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Trạng Thái Làm Việc Hiện Tại:
                  </label>
                  <select
                    value={editingStaff.currentStatus || 'Đang làm việc'}
                    onChange={e => setEditingStaff({ ...editingStaff, currentStatus: e.target.value as EmploymentStatus })}
                    className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-700 dark:text-indigo-300 shadow-2xs cursor-pointer"
                  >
                    <option value="Đang làm việc">🟢 Đang làm việc bình thường</option>
                    <option value="Đang thử việc">🔵 Đang trong thời gian thử việc</option>
                    <option value="Nghỉ không lương">🟠 Tạm nghỉ không hưởng lương</option>
                    <option value="Nghỉ thai sản">🟣 Chế độ nghỉ thai sản</option>
                    <option value="Đã nghỉ việc">⚪ Đã kết thúc hợp đồng / Nghỉ việc</option>
                  </select>
                </div>
              </div>

              {/* SECTION 4: Diễn biến lịch sử công tác & Trạng thái */}
              <div className="p-4 bg-slate-50/75 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider">
                      4. Diễn Biến Lịch Sử Công Tác & Thuyên Chuyển
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                      {editingStaff.statusHistory?.length || 0} mốc
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddHistoryForm(!showAddHistoryForm)}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm Mốc Lịch Sử
                  </button>
                </div>

                {/* Khung thêm mốc lịch sử */}
                {showAddHistoryForm && (
                  <div className="p-3.5 bg-white dark:bg-slate-850 rounded-xl border border-indigo-200 dark:border-indigo-900/60 shadow-sm space-y-3">
                    <h5 className="font-bold text-indigo-900 dark:text-indigo-200 text-xs">Ghi nhận mốc lịch sử công tác mới</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Từ ngày:</label>
                        <input
                          type="date"
                          value={histStartDate}
                          onChange={e => setHistStartDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Đến ngày:</label>
                        <input
                          type="text"
                          placeholder="YYYY-MM-DD hoặc Hiện tại"
                          value={histEndDate}
                          onChange={e => setHistEndDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Trạng thái:</label>
                        <select
                          value={histStatus}
                          onChange={e => setHistStatus(e.target.value as EmploymentStatus)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100"
                        >
                          <option value="Đang làm việc">Đang làm việc</option>
                          <option value="Đang thử việc">Đang thử việc</option>
                          <option value="Nghỉ không lương">Nghỉ không lương</option>
                          <option value="Nghỉ thai sản">Nghỉ thai sản</option>
                          <option value="Đã nghỉ việc">Đã nghỉ việc</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Phòng / Bộ phận:</label>
                        <input
                          type="text"
                          list="existing-dept-datalist"
                          placeholder={editingStaff.departmentSection}
                          value={histDept}
                          onChange={e => setHistDept(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Ghi chú / Số quyết định:</label>
                        <input
                          type="text"
                          placeholder="VD: Quyết định điều chuyển số 12/QĐ-BV..."
                          value={histNote}
                          onChange={e => setHistNote(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowAddHistoryForm(false)}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleAddHistoryItem}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        Lưu Mốc Lịch Sử
                      </button>
                    </div>
                  </div>
                )}

                {/* Danh sách mốc lịch sử hiện có */}
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {editingStaff.statusHistory && editingStaff.statusHistory.length > 0 ? (
                    editingStaff.statusHistory.map((item, idx) => (
                      <div key={item.id ? `${item.id}-${idx}` : idx} className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200/90 dark:border-slate-750 flex items-center justify-between text-xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white font-mono">{item.startDate} ➔ {item.endDate}</span>
                            {getEmploymentStatusBadge(item.status)}
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">
                            {item.positionOrTitle || editingStaff.title} • {item.departmentSection} {item.room ? `(${item.room})` : ''}
                          </p>
                          {item.note && <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">📝 {item.note}</p>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-dashed border-slate-200 dark:border-slate-750 text-center text-slate-400 dark:text-slate-500 text-xs">
                      Chưa ghi nhận diễn biến thay đổi phòng ban / trạng thái đặc biệt
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Dữ liệu lưu sẽ đồng bộ tự động tới danh bạ và tài khoản hệ thống.
                </p>
                <div className="flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingStaff(null)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition-colors"
                  >
                    Hủy Thao Tác
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-md shadow-indigo-200 dark:shadow-none hover:shadow-lg transition-all"
                  >
                    Lưu Thay Đổi (Admin)
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PHỤ: Chọn Icon / Tải Ảnh Đại Diện Cán Bộ */}
      {showAvatarPickerModal && editingStaff && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
                  <Smile className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Chọn Icon / Ảnh Đại Diện Cán Bộ
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Áp dụng cho: <span className="font-semibold text-slate-700 dark:text-slate-200">{editingStaff.fullName}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAvatarPickerModal(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
              <button
                type="button"
                onClick={() => setAvatarPickerTab('icons')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  avatarPickerTab === 'icons'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Icon Y Tế Chuẩn ({PRESET_MEDICAL_ICONS.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setAvatarPickerTab('photos')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  avatarPickerTab === 'photos'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Ảnh Bác Sĩ Mẫu</span>
              </button>
              <button
                type="button"
                onClick={() => setAvatarPickerTab('upload')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  avatarPickerTab === 'upload'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Tải Từ Thiết Bị</span>
              </button>
            </div>

            {/* TAB 1: Biểu tượng y tế chuẩn (16 icons) */}
            {avatarPickerTab === 'icons' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nhấn vào biểu tượng phù hợp với chuyên môn của cán bộ để áp dụng tức thì:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
                  {PRESET_MEDICAL_ICONS.map(item => {
                    const iconSvgUrl = createEmojiSvgDataUri(item.emoji, item.bg);
                    const isSelected = editingStaff.avatar === iconSvgUrl;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setEditingStaff({ ...editingStaff, avatar: iconSvgUrl });
                          setShowAvatarPickerModal(false);
                        }}
                        className={`p-2.5 rounded-2xl border transition-all flex flex-col items-center gap-2 group text-center ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-xs'
                        }`}
                      >
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-xs group-hover:scale-105 transition-transform"
                          style={{ backgroundColor: item.bg }}
                        >
                          <span>{item.emoji}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-1">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: Ảnh chân dung y bác sĩ mẫu */}
            {avatarPickerTab === 'photos' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Chọn ảnh chân dung chất lượng cao mô phỏng bác sĩ, kỹ thuật viên hoặc điều dưỡng:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
                  {PRESET_MEDICAL_PHOTOS.map(photo => {
                    const isSelected = editingStaff.avatar === photo.url;
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => {
                          setEditingStaff({ ...editingStaff, avatar: photo.url });
                          setShowAvatarPickerModal(false);
                        }}
                        className={`p-2.5 rounded-2xl border transition-all flex flex-col items-center gap-2 group text-center ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-xs'
                        }`}
                      >
                        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 group-hover:scale-105 transition-transform shadow-xs bg-slate-100 dark:bg-slate-800">
                          <img 
                            src={photo.url} 
                            alt={photo.name} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.onerror = null;
                              target.src = createEmojiSvgDataUri('👩‍⚕️', '#4f46e5');
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          {photo.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: Tải ảnh từ máy tính */}
            {avatarPickerTab === 'upload' && (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-indigo-200 dark:border-indigo-800/60 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-2xl p-6 text-center bg-indigo-50/30 dark:bg-indigo-950/20 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer relative">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Nhấn để chọn ảnh chân dung từ máy tính
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Hỗ trợ định dạng PNG, JPG, JPEG, WebP (Tự động nén chuẩn)
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      if (e.target.files?.[0]) {
                        handleAvatarFileUpload(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                {/* Preview if uploaded */}
                {editingStaff.avatar && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 shadow-xs">
                        <img src={editingStaff.avatar} alt="Xem trước" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Ảnh đại diện đang được chọn</p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Đã tối ưu kích thước tự động</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAvatarPickerModal(false)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors"
                    >
                      Dùng Ảnh Này
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3.5 border-t border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setEditingStaff({ ...editingStaff, avatar: '' });
                  setShowAvatarPickerModal(false);
                }}
                className="px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg font-medium transition-colors"
              >
                Khôi phục mặc định
              </button>
              <button
                type="button"
                onClick={() => setShowAvatarPickerModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: View Work History Timeline Modal (For all users) */}
      {historyViewingStaff && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <History className="w-5 h-5" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Diễn Biến Lịch Sử Công Tác</h3>
              </div>
              <button
                onClick={() => setHistoryViewingStaff(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Header in Modal */}
            <div className="bg-indigo-50/70 dark:bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 px-2 py-0.5 bg-white dark:bg-slate-800 rounded border border-indigo-100 dark:border-indigo-800">
                    {historyViewingStaff.title}
                  </span>
                  <h4 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">{historyViewingStaff.fullName}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{historyViewingStaff.departmentSection}</p>
                </div>
                <div className="text-right">
                  {getEmploymentStatusBadge(historyViewingStaff.currentStatus)}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
                    Vào làm: <strong>{historyViewingStaff.joinDate ? formatDateVN(historyViewingStaff.joinDate) : '---'}</strong> • <strong>{historyViewingStaff.experienceYears} năm công tác</strong>
                  </p>
                </div>
              </div>

              {/* Personal Details Row */}
              <div className="pt-2 border-t border-indigo-100/80 dark:border-indigo-900/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Giới tính: </span>
                  <strong className="text-slate-800 dark:text-slate-200">{historyViewingStaff.gender || '---'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Ngày sinh: </span>
                  <strong className="text-slate-800 dark:text-slate-200">{historyViewingStaff.dob ? formatDateVN(historyViewingStaff.dob) : '---'}</strong>
                </div>
                <div className="truncate" title={historyViewingStaff.phone}>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">SĐT: </span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono">{normalizeVietnamesePhone(historyViewingStaff.phone) || '---'}</strong>
                </div>
                <div className="truncate" title={historyViewingStaff.email}>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Email: </span>
                  <strong className="text-slate-800 dark:text-slate-200">{historyViewingStaff.email || '---'}</strong>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="py-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">Mốc Thời Gian & Trạng Thái Làm Việc</h4>

              {(!historyViewingStaff.statusHistory || historyViewingStaff.statusHistory.length === 0) ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic text-center py-6">Chưa có dữ liệu diễn biến công tác.</p>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-200 dark:before:bg-indigo-900/80">
                  {historyViewingStaff.statusHistory.map((hItem, idx) => (
                    <div key={hItem.id || idx} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-950 flex items-center justify-center"></div>

                      <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                          <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                            📅 {formatDateVN(hItem.startDate)} ➔ {hItem.endDate === 'Hiện tại' ? 'Hiện tại' : formatDateVN(hItem.endDate)}
                          </span>
                          {getEmploymentStatusBadge(hItem.status)}
                        </div>

                        <div className="text-xs space-y-1">
                          <p className="font-bold text-indigo-950 dark:text-indigo-200">
                            {hItem.positionOrTitle || historyViewingStaff.title} - {hItem.departmentSection}
                          </p>
                          {hItem.room && (
                            <p className="text-slate-600 dark:text-slate-300 font-medium">
                              🏢 Phòng trực thuộc: <strong>{hItem.room}</strong>
                            </p>
                          )}
                          {hItem.note && (
                            <p className="text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-900/80 p-2 rounded border border-slate-100 dark:border-slate-700 text-[11px] mt-1">
                              💬 {hItem.note}
                            </p>
                          )}
                          {hItem.updatedBy && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-right pt-1">
                              Cập nhật bởi: {hItem.updatedBy}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setHistoryViewingStaff(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2.5: BẢNG THÔNG TIN CHI TIẾT NHÂN VIÊN & PHÂN QUYỀN RBAC */}
      {selectedDetailStaff && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 dark:from-slate-800/80 dark:via-indigo-950/30 dark:to-slate-800/80 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-black text-xl flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-none border-2 border-white dark:border-slate-800">
                      {selectedDetailStaff.avatar ? (
                        <img 
                          src={selectedDetailStaff.avatar} 
                          alt={selectedDetailStaff.fullName} 
                          className="w-full h-full rounded-2xl object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        selectedDetailStaff.fullName.charAt(0)
                      )}
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" title="Trạng thái hoạt động"></span>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 rounded-md">
                        {selectedDetailStaff.title}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        #{selectedDetailStaff.userId}
                      </span>
                      {getEmploymentStatusBadge(selectedDetailStaff.currentStatus)}
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                        selectedDetailStaff.role === 'Admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                        selectedDetailStaff.role === 'Manager' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                        selectedDetailStaff.role === 'Doctor' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        Quyền: {selectedDetailStaff.role}
                      </span>
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1.5 flex items-center gap-2">
                      <span>{selectedDetailStaff.fullName}</span>
                    </h2>

                    <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{selectedDetailStaff.departmentSection}</span>
                      {selectedDetailStaff.room && (
                        <span className="text-slate-400 dark:text-slate-500">• Phòng: <strong className="text-slate-700 dark:text-slate-300">{selectedDetailStaff.room}</strong></span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Top Action Buttons (Chỉnh sửa & Phân quyền) */}
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                  {canManageStaffTarget(actorAccess, 'edit', selectedDetailStaff, rooms) && (
                    <button
                      onClick={handleEditFromDetail}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs"
                      title="Chỉnh sửa toàn bộ thông tin nhân viên"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Sửa thông tin</span>
                    </button>
                  )}

                  {(canManageStaffTarget(actorAccess, 'rbac', selectedDetailStaff, rooms) || actorAccess.isDepartmentWide) && (
                    <button
                      onClick={() => setDetailModalTab('permissions')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                        detailModalTab === 'permissions' 
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs' 
                          : 'bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                      }`}
                      title="Phân quyền truy cập RBAC cho nhân viên"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Phân quyền</span>
                    </button>
                  )}

                  <button
                    onClick={() => setSelectedDetailStaff(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1"
                    title="Đóng bảng chi tiết"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200/70 dark:border-slate-800/80 overflow-x-auto">
                <button
                  onClick={() => setDetailModalTab('profile')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    detailModalTab === 'profile'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Hồ Sơ & Chuyên Môn</span>
                </button>

                <button
                  onClick={() => setDetailModalTab('permissions')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    detailModalTab === 'permissions'
                      ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>Phân Quyền & Tài Khoản RBAC</span>
                </button>

                <button
                  onClick={() => setDetailModalTab('history')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    detailModalTab === 'history'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Lịch Sử Công Tác ({selectedDetailStaff.statusHistory?.length || 0})</span>
                </button>

                <button
                  onClick={() => setDetailModalTab('certs')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    detailModalTab === 'certs'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Chứng Chỉ & CCHN ({selectedDetailStaff.certificates?.length || 0})</span>
                </button>
              </div>
            </div>

            {/* Modal Body with Scrollable Area */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {/* TAB 1: HỒ SƠ CHI TIẾT */}
              {detailModalTab === 'profile' && (
                <div className="space-y-6">
                  {/* Quick Stat Highlights */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Thâm Niên</span>
                      <p className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {selectedDetailStaff.experienceYears} năm
                      </p>
                      <span className="text-[10px] text-slate-500">
                        Từ {selectedDetailStaff.joinDate ? formatDateVN(selectedDetailStaff.joinDate) : '---'}
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ca trực tháng</span>
                      <p className="text-base font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                        {selectedDetailStaff.totalShiftsThisMonth} ca
                      </p>
                      <span className="text-[10px] text-slate-500">Đã hoàn thành</span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phép năm còn</span>
                      <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {selectedDetailStaff.leaveBalanceDays} ngày
                      </p>
                      <span className="text-[10px] text-slate-500">Chưa sử dụng</span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Chứng chỉ CCHN</span>
                      <p className="text-base font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
                        {selectedDetailStaff.certificates?.length || 0} văn bằng
                      </p>
                      <span className="text-[10px] text-slate-500">Đã kiểm chuẩn</span>
                    </div>
                  </div>

                  {/* 2-Column Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Card 1: Thông tin nhân thân & liên hệ */}
                    <div className="bg-white dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <h4 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-700/80">
                        <UserCheck className="w-4 h-4 text-indigo-500" />
                        <span>Thông Tin Cá Nhân & Liên Hệ</span>
                      </h4>

                      <div className="space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Họ và tên:</span>
                          <strong className="text-slate-900 dark:text-white font-bold">{selectedDetailStaff.fullName}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Giới tính:</span>
                          <strong className="text-slate-800 dark:text-slate-200">{selectedDetailStaff.gender || '---'}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Ngày sinh:</span>
                          <strong className="text-slate-800 dark:text-slate-200">{selectedDetailStaff.dob ? formatDateVN(selectedDetailStaff.dob) : '---'}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-600" /> Số điện thoại:
                          </span>
                          <strong className="text-slate-900 dark:text-slate-100 font-mono">
                            {selectedDetailStaff.phone ? (
                              <a href={`tel:${selectedDetailStaff.phone}`} className="hover:text-blue-600 underline">
                                {normalizeVietnamesePhone(selectedDetailStaff.phone)}
                              </a>
                            ) : '---'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-indigo-500" /> Email:
                          </span>
                          <strong className="text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={selectedDetailStaff.email}>
                            {selectedDetailStaff.email || '---'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Mã nhân viên:</span>
                          <strong className="text-slate-800 dark:text-slate-200 font-mono">{selectedDetailStaff.userId}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Đơn vị công tác & phân công */}
                    <div className="bg-white dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <h4 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-700/80">
                        <Briefcase className="w-4 h-4 text-blue-500" />
                        <span>Vị Trí Công Tác & Phân Công</span>
                      </h4>

                      <div className="space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Bộ phận:</span>
                          <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{selectedDetailStaff.departmentSection}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Phòng trực thuộc:</span>
                          <strong className="text-slate-800 dark:text-slate-200">{selectedDetailStaff.room || 'Phòng làm việc chung'}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Chức vụ chuyên môn:</span>
                          <strong className="text-slate-800 dark:text-slate-200">{selectedDetailStaff.title}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Vai trò RBAC:</span>
                          <span className="px-2 py-0.5 font-bold rounded text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                            {selectedDetailStaff.role}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Ngày vào làm:</span>
                          <strong className="text-slate-800 dark:text-slate-200">{selectedDetailStaff.joinDate ? formatDateVN(selectedDetailStaff.joinDate) : '---'}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Trạng thái công tác:</span>
                          {getEmploymentStatusBadge(selectedDetailStaff.currentStatus)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Chuyên môn & bằng cấp */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <h4 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5 pb-2 border-b border-slate-200/80 dark:border-slate-700">
                      <Award className="w-4 h-4 text-amber-500" />
                      <span>Trình Độ Chuyên Môn & Học Vị</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 uppercase text-[10px] font-bold block">Trình độ chuyên môn:</span>
                        <p className="text-slate-900 dark:text-white font-medium mt-1 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          {selectedDetailStaff.educationLevel && (
                            <span className="inline-block mr-1.5 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-100 dark:border-indigo-800 text-[11px] font-bold">
                              {selectedDetailStaff.educationLevel}
                            </span>
                          )}
                          {selectedDetailStaff.specialty || 'Chưa cập nhật chuyên môn'}
                        </p>
                      </div>

                      <div>
                        <span className="text-slate-400 uppercase text-[10px] font-bold block">Bằng cấp & Học vị:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {selectedDetailStaff.degrees && selectedDetailStaff.degrees.length > 0 ? (
                            selectedDetailStaff.degrees.map((deg, idx) => (
                              <span key={idx} className="px-2.5 py-1 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-100 dark:border-indigo-900 font-semibold text-xs">
                                🎓 {deg}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 italic">Chưa có văn bằng bổ sung</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick CTAs in Tab */}
                  {(canManageStaffTarget(actorAccess, 'edit', selectedDetailStaff, rooms) ||
                    canManageStaffTarget(actorAccess, 'rbac', selectedDetailStaff, rooms)) && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900">
                      <div className="text-xs">
                        <span className="font-bold text-indigo-900 dark:text-indigo-200">Cần chỉnh sửa thông tin hoặc phân quyền tài khoản?</span>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">Nhấp nút bên phải để thực hiện trong phạm vi quyền hạn</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageStaffTarget(actorAccess, 'edit', selectedDetailStaff, rooms) && (
                          <button
                            onClick={handleEditFromDetail}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Sửa toàn bộ thông tin</span>
                          </button>
                        )}
                        {canManageStaffTarget(actorAccess, 'rbac', selectedDetailStaff, rooms) && (
                          <button
                            onClick={() => setDetailModalTab('permissions')}
                            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Phân quyền RBAC</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PHÂN QUYỀN & TÀI KHOẢN RBAC */}
              {detailModalTab === 'permissions' && (() => {
                const canModifyThisRbac = canManageStaffTarget(actorAccess, 'rbac', selectedDetailStaff, rooms);
                const targetOriginalTier = resolveUserManagementTier(
                  allUsers.find(u => u.id === selectedDetailStaff.userId || u.name.trim().toLowerCase() === selectedDetailStaff.fullName.trim().toLowerCase()),
                  selectedDetailStaff,
                  departments,
                  rooms
                );
                const effectiveDefaults = DEFAULT_TIER_PERMISSIONS[assignedTier];

                return (
                  <div className="space-y-6">
                    {/* Alert Success */}
                    {permissionSuccessMsg && (
                      <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-150">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{permissionSuccessMsg}</span>
                      </div>
                    )}

                    {/* Guard Notice when read-only */}
                    {!canModifyThisRbac && (
                      <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-800 dark:text-amber-200 flex items-center gap-2.5 text-xs font-semibold">
                        <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          Chế độ chỉ xem: Bạn không có quyền điều chỉnh phân quyền RBAC hoặc tài khoản này thuộc cấp Admin hệ thống.
                        </span>
                      </div>
                    )}

                    {/* Account Summary Banner */}
                    <div className="p-4 bg-purple-50/60 dark:bg-purple-950/30 rounded-2xl border border-purple-100 dark:border-purple-900/60 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 tracking-wider">Tài khoản & Cấp bậc hiện tại</span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 flex flex-wrap items-center gap-2">
                          <span>{selectedDetailStaff.fullName}</span>
                          <span className="font-mono text-xs font-normal text-slate-500">({selectedDetailStaff.email || `${selectedDetailStaff.userId.toLowerCase()}@hospital.vn`})</span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                          <span>Cấp bậc: <strong className="text-purple-700 dark:text-purple-300">{MANAGEMENT_TIER_META[targetOriginalTier].label}</strong></span>
                          <span>• Vai trò: <strong className="text-slate-700 dark:text-slate-200">{selectedDetailStaff.role}</strong></span>
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${MANAGEMENT_TIER_META[assignedTier].badgeClass}`}>
                        {MANAGEMENT_TIER_META[assignedTier].scopeSummary}
                      </span>
                    </div>

                    {/* 5-Tier Management Level Cards */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
                        1. Chọn Cấp Bậc Quản Lý & Phạm Vi Quyền Hạn (5 Cấp):
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {MANAGEMENT_TIER_ORDER.map(tierKey => {
                          const meta = MANAGEMENT_TIER_META[tierKey];
                          const isTierSelected = assignedTier === tierKey;
                          const isDisabledTier = !canModifyThisRbac || (tierKey === 'admin' && !actorAccess.isSystemAdmin);

                          return (
                            <div
                              key={tierKey}
                              onClick={() => {
                                if (isDisabledTier) return;
                                setAssignedTier(tierKey);
                                setAssignedRole(meta.defaultRole);
                                if (tierKey !== targetOriginalTier) {
                                  setAssignedOverrides({});
                                }
                              }}
                              className={`p-3.5 rounded-2xl border transition-all ${
                                isDisabledTier
                                  ? 'opacity-55 cursor-not-allowed bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                                  : isTierSelected
                                  ? 'bg-purple-50/80 border-purple-500 dark:bg-purple-950/40 dark:border-purple-500 ring-2 ring-purple-500/20 shadow-sm cursor-pointer'
                                  : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-purple-300 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${meta.badgeClass}`}>
                                  {meta.shortLabel}
                                </span>
                                <input
                                  type="radio"
                                  name="managementTierDetail"
                                  disabled={isDisabledTier}
                                  checked={isTierSelected}
                                  onChange={() => {}}
                                  className="text-purple-600 focus:ring-purple-500"
                                />
                              </div>
                              <h5 className="text-xs font-bold text-slate-900 dark:text-white mt-2">{meta.label}</h5>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                {meta.description}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Scope Selectors for section_head / room_head */}
                    {assignedTier === 'section_head' && (
                      <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-900 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-indigo-600" />
                            <span>Phạm Vi Bộ Phận Quản Lý (Trưởng bộ phận):</span>
                          </h5>
                          <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold">
                            Đã chọn {assignedManagedDepts.length} bộ phận
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {departments
                            .filter(d => d.name && d.name !== 'Chưa phân bộ phận')
                            .map(dept => {
                              const checked = assignedManagedDepts.includes(dept.name);
                              return (
                                <label
                                  key={dept.id}
                                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                                    checked
                                      ? 'bg-white dark:bg-slate-900 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                                      : 'bg-white/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                  } ${!canModifyThisRbac ? 'opacity-60 pointer-events-none' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={!canModifyThisRbac}
                                    checked={checked}
                                    onChange={() => {
                                      setAssignedManagedDepts(prev =>
                                        prev.includes(dept.name)
                                          ? prev.filter(x => x !== dept.name)
                                          : [...prev, dept.name]
                                      );
                                    }}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="truncate">{dept.name}</span>
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {assignedTier === 'room_head' && (
                      <div className="p-4 bg-teal-50/60 dark:bg-teal-950/30 rounded-2xl border border-teal-200 dark:border-teal-900 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                            <Grid className="w-4 h-4 text-teal-600" />
                            <span>Phạm Vi Phòng Chuyên Môn Quản Lý (Trưởng phòng):</span>
                          </h5>
                          <span className="text-[11px] text-teal-700 dark:text-teal-300 font-semibold">
                            Đã chọn {assignedManagedRooms.length} phòng
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                          {rooms.map(rm => {
                            const checked = assignedManagedRooms.includes(rm.name);
                            return (
                              <label
                                key={rm.id}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                                  checked
                                    ? 'bg-white dark:bg-slate-900 border-teal-500 text-teal-700 dark:text-teal-300 shadow-2xs'
                                    : 'bg-white/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                } ${!canModifyThisRbac ? 'opacity-60 pointer-events-none' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={!canModifyThisRbac}
                                  checked={checked}
                                  onChange={() => {
                                    setAssignedManagedRooms(prev =>
                                      prev.includes(rm.name)
                                        ? prev.filter(x => x !== rm.name)
                                        : [...prev, rm.name]
                                    );
                                  }}
                                  className="rounded text-teal-600 focus:ring-teal-500"
                                />
                                <div className="min-w-0">
                                  <div className="truncate">{rm.name}</div>
                                  <div className="text-[10px] font-normal text-slate-500 truncate">{rm.departmentSection} • {rm.code}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Granular Permission Overrides */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                            2. Tùy Chỉnh Quyền Hạn Chi Tiết (Ghi đè theo cá nhân):
                          </h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Điều chỉnh từng quyền chỉnh sửa nhân sự, chứng chỉ, thiết bị theo đúng nhiệm vụ thực tế.
                          </p>
                        </div>
                        {canModifyThisRbac && Object.keys(assignedOverrides).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAssignedOverrides({})}
                            className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Khôi phục mặc định cấp bậc
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(
                          [
                            { id: 'staff', title: 'Nhân sự & Chứng chỉ' },
                            { id: 'equipment', title: 'Thiết bị & An toàn' },
                            { id: 'system', title: 'Phạm vi & Hệ thống' },
                          ] as const
                        ).map(grp => (
                          <div key={grp.id} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                            <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase pb-1 border-b border-slate-100 dark:border-slate-800">
                              {grp.title}
                            </div>
                            <div className="space-y-1.5">
                              {PERMISSION_FIELD_LABELS.filter(f => f.group === grp.id).map(field => {
                                const defaultVal = Boolean(effectiveDefaults[field.key]);
                                const currentVal =
                                  assignedOverrides[field.key] !== undefined
                                    ? Boolean(assignedOverrides[field.key])
                                    : defaultVal;
                                const isAdminOnlyLocked = Boolean(field.adminOnly) && !actorAccess.isSystemAdmin;
                                const isDisabled = !canModifyThisRbac || isAdminOnlyLocked;

                                return (
                                  <label
                                    key={field.key}
                                    className={`flex items-start gap-2 text-[11px] leading-snug ${
                                      isDisabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={isDisabled}
                                      checked={currentVal}
                                      onChange={e => {
                                        const nextBool = e.target.checked;
                                        setAssignedOverrides(prev => {
                                          const copy = { ...prev };
                                          if (nextBool === defaultVal) {
                                            delete copy[field.key];
                                          } else {
                                            copy[field.key] = nextBool;
                                          }
                                          return copy;
                                        });
                                      }}
                                      className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                                      {field.label}
                                      {field.adminOnly && (
                                        <span className="ml-1 text-[10px] text-purple-600 dark:text-purple-400 font-bold">(Admin)</span>
                                      )}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Additional Role Attributes */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Chức danh hiển thị:
                        </label>
                        <input
                          type="text"
                          disabled={!canModifyThisRbac}
                          value={assignedTitle}
                          onChange={e => setAssignedTitle(e.target.value)}
                          placeholder="VD: Trưởng khoa, Trưởng bộ phận, KTV trưởng..."
                          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium disabled:opacity-60"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Bộ phận công tác:
                        </label>
                        <select
                          disabled={!canModifyThisRbac}
                          value={assignedDept}
                          onChange={e => {
                            const nextDept = e.target.value;
                            setAssignedDept(nextDept);
                            const nextDeptRooms = getRoomsForDepartment(nextDept);
                            if (assignedRoom && !nextDeptRooms.includes(assignedRoom)) {
                              setAssignedRoom('');
                            }
                          }}
                          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium disabled:opacity-60"
                        >
                          <option value="">-- Chọn bộ phận ({allDepartments.length}) --</option>
                          {assignedDept && !allDepartments.includes(assignedDept) && (
                            <option value={assignedDept}>{assignedDept}</option>
                          )}
                          {allDepartments.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Phòng làm việc trực thuộc:
                        </label>
                        {(() => {
                          const filteredRooms = assignedDept
                            ? rooms.filter(r => r.departmentSection === assignedDept)
                            : rooms;
                          return (
                            <select
                              disabled={!canModifyThisRbac}
                              value={assignedRoom}
                              onChange={e => setAssignedRoom(e.target.value)}
                              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium disabled:opacity-60"
                            >
                              <option value="">
                                {assignedDept && filteredRooms.length === 0
                                  ? `-- Bộ phận chưa có phòng trực thuộc --`
                                  : `-- Phòng chung bộ phận (${filteredRooms.length}) --`}
                              </option>
                              {assignedRoom && !filteredRooms.some(r => r.name === assignedRoom) && (
                                <option value={assignedRoom}>{assignedRoom}</option>
                              )}
                              {filteredRooms.map(r => (
                                <option key={r.id} value={r.name}>{r.name} ({r.code})</option>
                              ))}
                            </select>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Action Save Button */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                      <span className="text-xs text-slate-500">
                        * Thay đổi cấp bậc, phạm vi quản lý và quyền chi tiết sẽ đồng bộ trực tiếp vào hồ sơ nhân sự & tài khoản RBAC.
                      </span>
                      {canModifyThisRbac && (
                        <button
                          type="button"
                          onClick={handleSavePermissions}
                          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-purple-200 dark:shadow-none"
                        >
                          <Check className="w-4 h-4" />
                          <span>Lưu Phân Quyền Nhân Viên</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* TAB 3: LỊCH SỬ CÔNG TÁC */}
              {detailModalTab === 'history' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Diễn Biến Quá Trình Công Tác & Thuyên Chuyển
                    </h4>
                    <span className="text-xs text-slate-500">
                      Tổng {selectedDetailStaff.statusHistory?.length || 0} mốc ghi nhận
                    </span>
                  </div>

                  {(!selectedDetailStaff.statusHistory || selectedDetailStaff.statusHistory.length === 0) ? (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <History className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
                      <p className="text-xs">Chưa có dữ liệu lịch sử công tác trước đó.</p>
                      <p className="text-[11px] text-slate-500">Nhân viên hiện đang giữ trạng thái: {selectedDetailStaff.currentStatus || 'Đang làm việc'}</p>
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-200 dark:before:bg-indigo-900">
                      {selectedDetailStaff.statusHistory.map((hItem, idx) => (
                        <div key={hItem.id || idx} className="relative">
                          <div className="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-950 flex items-center justify-center"></div>

                          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                              <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                                📅 {formatDateVN(hItem.startDate)} ➔ {hItem.endDate === 'Hiện tại' ? 'Hiện tại' : formatDateVN(hItem.endDate)}
                              </span>
                              {getEmploymentStatusBadge(hItem.status)}
                            </div>

                            <p className="font-bold text-indigo-950 dark:text-indigo-200 text-xs">
                              {hItem.positionOrTitle || selectedDetailStaff.title} - {hItem.departmentSection}
                            </p>
                            {hItem.room && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                🏢 Phòng: <strong>{hItem.room}</strong>
                              </p>
                            )}
                            {hItem.note && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                                💬 {hItem.note}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CHỨNG CHỈ & BẰNG CẤP */}
              {detailModalTab === 'certs' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Chứng Chỉ Hành Nghề (CCHN) & Chứng Chỉ CME
                    </h4>
                    <span className="text-xs text-slate-500">
                      {selectedDetailStaff.certificates?.length || 0} chứng chỉ
                    </span>
                  </div>

                  {(!selectedDetailStaff.certificates || selectedDetailStaff.certificates.length === 0) ? (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <Award className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
                      <p className="text-xs">Chưa có chứng chỉ nào được tải lên cho cán bộ này.</p>
                      {canManageStaffTarget(actorAccess, 'edit', selectedDetailStaff, rooms) && (
                        <button
                          onClick={handleEditFromDetail}
                          className="text-xs text-indigo-600 font-semibold hover:underline"
                        >
                          Bấm vào đây để cập nhật chứng chỉ trong form sửa
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {selectedDetailStaff.certificates.map((cert, idx) => (
                        <div key={cert.id ? `${cert.id}-${idx}` : idx} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                                #{cert.code}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                cert.status === 'Còn hiệu lực' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                                cert.status === 'Sắp hết hạn' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                                'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              }`}>
                                {cert.status}
                              </span>
                            </div>
                            <h5 className="font-bold text-slate-900 dark:text-white text-xs">{cert.name}</h5>
                            <p className="text-[11px] text-slate-500">Cấp bởi: {cert.issuedBy}</p>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-3">
                              <span>Ngày cấp: <strong>{formatDateVN(cert.issuedDate)}</strong></span>
                              <span>Hạn dùng: <strong>{cert.expiryDate ? formatDateVN(cert.expiryDate) : 'Vô thời hạn'}</strong></span>
                            </div>
                          </div>
                          {cert.fileUrl && (
                            <a
                              href={cert.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 shrink-0"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Xem tệp</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              {canManageStaffTarget(actorAccess, 'edit', selectedDetailStaff, rooms) ? (
                <button
                  onClick={handleEditFromDetail}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Chỉnh sửa thông tin nhân viên</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <Lock className="w-3.5 h-3.5" /> Hồ sơ chỉ xem
                </span>
              )}

              <div className="flex items-center gap-2">
                {canManageStaffTarget(actorAccess, 'rbac', selectedDetailStaff, rooms) && (
                  detailModalTab !== 'permissions' ? (
                    <button
                      onClick={() => setDetailModalTab('permissions')}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Phân quyền nhân viên</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSavePermissions}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Lưu phân quyền</span>
                    </button>
                  )
                )}

                <button
                  onClick={() => setSelectedDetailStaff(null)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave Modal */}
      {showLeaveModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowLeaveModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Đăng Ký Lịch Nghỉ / Đi Học
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Bổ sung đơn trực tiếp lên lịch đăng ký nghỉ của khoa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreateLeaveRequest} className="space-y-4 text-xs">
              {isStrictLeaveAdmin && activeProfiles.length > 0 ? (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cán bộ đăng ký nghỉ (Quyền Admin):
                  </label>
                  <SearchableCombobox
                    value={leaveApplicantId}
                    onChange={setLeaveApplicantId}
                    options={leaveStaffOptions}
                    placeholder="Chọn cán bộ trong danh sách..."
                    emptyOptionLabel={`-- Mặc định (${currentUser.name}) --`}
                    inputClassName="!text-xs !py-2"
                  />
                </div>
              ) : (
                <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Cán bộ đăng ký nghỉ:
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                    {currentStaffProfile?.fullName || currentUser.name}
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      {' '}· {currentStaffProfile?.title || currentUser.title || 'Nhân viên'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Chỉ Admin mới có quyền tạo đăng ký nghỉ cho người khác trong khoa.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Loại nghỉ phép:</label>
                <select
                  value={leaveType}
                  onChange={e => setLeaveType(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-800 dark:text-slate-100"
                >
                  <option value="Phép năm">Nghỉ phép năm</option>
                  <option value="Học tập">Đi học CME / Tập huấn</option>
                  <option value="Nghỉ ốm">Nghỉ ốm / Điều trị</option>
                  <option value="Nghỉ thai sản">Nghỉ thai sản</option>
                  <option value="Nghỉ không lương">Nghỉ không lương</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Từ ngày:</label>
                    <input
                      type="date"
                      required
                      value={leaveStart}
                      onChange={e => {
                        const nextStart = e.target.value;
                        setLeaveStart(nextStart);
                        if (!leaveEnd || nextStart > leaveEnd) {
                          setLeaveEnd(nextStart);
                        }
                      }}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-800 dark:text-slate-100 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Đến ngày:</label>
                    <input
                      type="date"
                      required
                      min={leaveStart || undefined}
                      value={leaveEnd}
                      onChange={e => setLeaveEnd(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-800 dark:text-slate-100 tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 text-[11px]">
                  <span className="text-slate-600 dark:text-slate-300">Tổng thời gian đăng ký:</span>
                  <strong className="text-indigo-700 dark:text-indigo-300 tabular-nums">{computedLeaveDays} ngày</strong>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Lý do nghỉ phép:</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ghi rõ lý do xin nghỉ hoặc nội dung học tập..."
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Người trực thay / Bàn giao ca <span className="font-normal text-slate-400">(Không bắt buộc)</span>:
                </label>
                <SearchableCombobox
                  value={substituteUser}
                  onChange={setSubstituteUser}
                  options={leaveSubstituteOptions}
                  placeholder="Tìm đồng nghiệp trực thay hoặc bỏ trống..."
                  emptyOptionLabel="-- Bỏ trống (Chưa chỉ định người trực thay) --"
                  inputClassName="!text-xs !py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-xs cursor-pointer"
                >
                  Xác Nhận Đăng Ký
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Thêm / Chỉnh Sửa Chứng Chỉ */}
      {showCertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {editingCert ? 'Chỉnh Sửa Chứng Chỉ Chuyên Môn' : 'Thêm Mới Chứng Chỉ Chuyên Môn'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cập nhật thông tin chứng chỉ hành nghề, an toàn bức xạ & đào tạo chuyên môn
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCertModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCert} className="p-6 space-y-4 overflow-y-auto text-xs">
              {/* Nhân viên sở hữu chứng chỉ */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cán Bộ / Nhân Viên Sở Hữu <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={certStaffUserId}
                  onChange={e => setCertStaffUserId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                >
                  <option value="">-- Chọn cán bộ / nhân viên --</option>
                  {(!editingCert ? activeProfiles : profiles)
                    .filter(p => canManageStaffTarget(actorAccess, 'cert', p, rooms))
                    .map((p, idx) => (
                      <option key={`${p.userId}-${idx}`} value={p.userId}>
                        {p.fullName} ({p.title} - {p.departmentSection})
                      </option>
                    ))}
                </select>
              </div>

              {/* Tên chứng chỉ */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên Chứng Chỉ / Giấy Phép <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="cert-name-presets"
                  placeholder="VD: Chứng chỉ Hành Nghề Khám Chữa Bệnh CĐHA..."
                  value={certName}
                  onChange={e => setCertName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                />
                <datalist id="cert-name-presets">
                  <option value="Chứng chỉ Hành Nghề Khám Chữa Bệnh CĐHA" />
                  <option value="Chứng chỉ An Toàn Bức Xạ Hạt Nhân & Phòng Rạ" />
                  <option value="Chứng chỉ Quản Lý Chất Lượng Phòng Xét Nghiệm ISO 15189:2022" />
                  <option value="Chứng chỉ Chụp & Đọc Phim MRI 3.0T Nâng Cao" />
                  <option value="Chứng chỉ Thực Hành Siêu Âm Tim Mạch Doppler" />
                  <option value="Chứng chỉ Siêu Âm Tổng Quát & Mạch Máu" />
                  <option value="Chứng chỉ Kỹ Thuật Viên X-quang & CT Scanner" />
                  <option value="Chứng chỉ An Toàn Tiêm Thuốc Cản Quang Đường Tĩnh Mạch" />
                </datalist>
                {/* Gợi ý chọn nhanh */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] text-slate-400 font-bold mr-0.5">Gợi ý nhanh:</span>
                  {[
                    'CCHN Khám Chữa Bệnh CĐHA',
                    'An Toàn Bức Xạ',
                    'ISO 15189:2022',
                    'Siêu Âm Tim Mạch',
                    'MRI Nâng Cao'
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        if (preset === 'CCHN Khám Chữa Bệnh CĐHA') setCertName('Chứng chỉ Hành Nghề Khám Chữa Bệnh CĐHA');
                        else if (preset === 'An Toàn Bức Xạ') setCertName('Chứng chỉ An Toàn Bức Xạ Hạt Nhân & Phòng Rạ');
                        else if (preset === 'ISO 15189:2022') setCertName('Chứng chỉ Quản Lý Chất Lượng Phòng Xét Nghiệm ISO 15189:2022');
                        else if (preset === 'Siêu Âm Tim Mạch') setCertName('Chứng chỉ Thực Hành Siêu Âm Tim Mạch Doppler');
                        else if (preset === 'MRI Nâng Cao') setCertName('Chứng chỉ Chụp & Đọc Phim MRI 3.0T Nâng Cao');
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mã số chứng chỉ & Cơ quan cấp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Mã Số Chứng Chỉ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: CCHN-001882/BYT"
                    value={certCode}
                    onChange={e => setCertCode(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cơ Quan Cấp <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="cert-issuedby-presets"
                    placeholder="VD: Bộ Y Tế, Sở Y Tế..."
                    value={certIssuedBy}
                    onChange={e => setCertIssuedBy(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                  />
                  <datalist id="cert-issuedby-presets">
                    <option value="Bộ Y Tế" />
                    <option value="Sở Y Tế TP. Hà Nội" />
                    <option value="Sở Y Tế TP. Hồ Chí Minh" />
                    <option value="Sở Khoa Học & Công Nghệ" />
                    <option value="Viện Tim Mạch Quốc Gia" />
                    <option value="Hội Điện Quang & Y Học Hạt Nhân Việt Nam" />
                    <option value="Viện Công Nhận Chất Lượng BoA" />
                  </datalist>
                </div>
              </div>

              {/* Ngày cấp, Hạn hiệu lực & Trạng thái */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ngày Cấp <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={certIssuedDate}
                    onChange={e => setCertIssuedDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Hạn Hiệu Lực <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={certExpiryDate}
                    onChange={e => handleExpiryDateChange(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Trạng Thái:</label>
                    <span className="text-[10px] text-indigo-600 font-medium">(Tự động tính)</span>
                  </div>
                  <select
                    value={certStatus}
                    onChange={e => setCertStatus(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                  >
                    <option value="Còn hiệu lực">🟢 Còn hiệu lực</option>
                    <option value="Sắp hết hạn">🟡 Sắp hết hạn (≤ 6 tháng)</option>
                    <option value="Hết hiệu lực">🔴 Hết hiệu lực</option>
                  </select>
                </div>
              </div>

              {/* Đường dẫn tệp scan hoặc ghi chú hồ sơ */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Đường Dẫn Tệp Scan / Ghi Chú Hồ Sơ (Tùy chọn):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="VD: CCHN_PhamDucThanh_2022.pdf hoặc Tủ hồ sơ A-03"
                    value={certFileUrl}
                    onChange={e => setCertFileUrl(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 pl-9"
                  />
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCertModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingCert ? 'Lưu Cập Nhật' : 'Lưu Chứng Chỉ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Xác Nhận Xóa Chứng Chỉ */}
      {deleteConfirmCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Xác Nhận Xóa Chứng Chỉ</h3>
                <p className="text-xs text-slate-500">Hành động này sẽ xóa chứng chỉ khỏi hồ sơ</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs space-y-1.5">
              <div>
                <span className="text-slate-400 font-medium">Tên chứng chỉ:</span>
                <p className="font-bold text-slate-800 text-sm">{deleteConfirmCert.certName}</p>
              </div>
              <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/60">
                <span>Mã số: <strong className="font-mono text-slate-800">{deleteConfirmCert.certCode}</strong></span>
                <span>Cán bộ: <strong className="text-indigo-600">{deleteConfirmCert.staffName}</strong></span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Bạn có chắc chắn muốn xóa vĩnh viễn chứng chỉ này không? Dữ liệu đã xóa sẽ không thể phục hồi.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmCert(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-all text-xs"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCert}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-all shadow-sm text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xác Nhận Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Thêm Nhân Viên Mới */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Thêm Nhân Viên / Cán Bộ Mới
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Khởi tạo hồ sơ nhân sự, phân phòng làm việc và cấp chứng chỉ ban đầu
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateNewStaff} className="p-6 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Họ và tên */}
                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Họ và Tên Nhân Viên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: BS.CKI Nguyễn Văn An..."
                    value={newStaffForm.fullName}
                    onChange={e => setNewStaffForm({ ...newStaffForm, fullName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 dark:text-white"
                  />
                </div>

                {/* Mã nhân viên */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mã Nhân Viên (ID)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: NV-1001"
                    value={newStaffForm.userId}
                    onChange={e => setNewStaffForm({ ...newStaffForm, userId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800 dark:text-white"
                  />
                </div>

                {/* Chức danh */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Chức Danh <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newStaffForm.title?.trim() || 'Nhân viên'}
                    onChange={e => setNewStaffForm({ ...newStaffForm, title: e.target.value as CLSTitle })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-white"
                  >
                    <option value="Trưởng khoa">Trưởng khoa</option>
                    <option value="Phó khoa">Phó khoa</option>
                    <option value="Điều dưỡng trưởng">Điều dưỡng trưởng</option>
                    <option value="Nhân viên">Nhân viên</option>
                  </select>
                </div>

                {/* Vai trò tài khoản */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Vai Trò Phân Quyền
                  </label>
                  <select
                    value={newStaffForm.role}
                    onChange={e => setNewStaffForm({ ...newStaffForm, role: e.target.value as UserRole })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-white"
                  >
                    <option value="Staff">Staff (Nhân viên)</option>
                    <option value="Doctor">Doctor (Bác sĩ)</option>
                    <option value="Manager">Manager (Quản lý)</option>
                    {actorAccess.isSystemAdmin && (
                      <option value="Admin">Admin (Quản trị viên)</option>
                    )}
                  </select>
                </div>

                {/* Bộ phận */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bộ Phận (Từ Quản lý Phòng / Bộ phận) <span className="text-red-500">*</span>
                  </label>
                  {(() => {
                    const deptChoices = actorAccess.isDepartmentWide
                      ? allDepartments
                      : selectableDepartmentsForActor.map(d => d.name).filter(n => n && n !== 'Chưa phân bộ phận');
                    const allowedRoomNames = new Set(selectableRoomsForActor.map(r => r.name));
                    return (
                      <select
                        value={newStaffForm.departmentSection}
                        onChange={e => {
                          const nextDept = e.target.value;
                          const nextDeptRooms = getRoomsForDepartment(nextDept).filter(
                            rName => actorAccess.isDepartmentWide || allowedRoomNames.has(rName)
                          );
                          setNewStaffForm({
                            ...newStaffForm,
                            departmentSection: nextDept,
                            room: nextDeptRooms.includes(newStaffForm.room) ? newStaffForm.room : (nextDeptRooms[0] || '')
                          });
                        }}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-white"
                      >
                        <option value="">-- Chọn bộ phận ({deptChoices.length}) --</option>
                        {deptChoices.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    );
                  })()}
                </div>

                {/* Phòng làm việc trực thuộc bộ phận đã chọn */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phòng Làm Việc Cụ Thể <span className="text-red-500">*</span>
                  </label>
                  {(() => {
                    const allowedRoomNames = new Set(selectableRoomsForActor.map(r => r.name));
                    const deptRooms = getRoomsForDepartment(newStaffForm.departmentSection).filter(
                      rName => actorAccess.isDepartmentWide || allowedRoomNames.has(rName)
                    );
                    return (
                      <select
                        value={newStaffForm.room}
                        onChange={e => setNewStaffForm({ ...newStaffForm, room: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-white"
                      >
                        <option value="">
                          {newStaffForm.departmentSection && deptRooms.length === 0
                            ? `-- Bộ phận chưa có phòng trực thuộc trong phạm vi --`
                            : `-- Chưa phân phòng (${deptRooms.length}) --`}
                        </option>
                        {deptRooms.map(room => (
                          <option key={room} value={room}>{room}</option>
                        ))}
                      </select>
                    );
                  })()}
                </div>

                {/* Trạng thái công tác */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Trạng Thái Làm Việc
                  </label>
                  <select
                    value={newStaffForm.currentStatus}
                    onChange={e => setNewStaffForm({ ...newStaffForm, currentStatus: e.target.value as EmploymentStatus })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-white"
                  >
                    <option value="Đang làm việc">Đang làm việc</option>
                    <option value="Đang thử việc">Đang thử việc</option>
                    <option value="Nghỉ không lương">Nghỉ không lương</option>
                    <option value="Nghỉ thai sản">Nghỉ thai sản</option>
                    <option value="Đã nghỉ việc">Đã nghỉ việc</option>
                  </select>
                </div>

                {/* Giới tính */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Giới Tính
                  </label>
                  <select
                    value={newStaffForm.gender}
                    onChange={e => setNewStaffForm({ ...newStaffForm, gender: e.target.value as 'Nam' | 'Nữ' | 'Khác' })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-white"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>

                {/* Ngày sinh */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ngày Sinh
                  </label>
                  <input
                    type="date"
                    value={newStaffForm.dob}
                    onChange={e => setNewStaffForm({ ...newStaffForm, dob: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-white"
                  />
                </div>

                {/* Số điện thoại */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Số Điện Thoại
                  </label>
                  <input
                    type="tel"
                    placeholder="VD: 0912345678"
                    value={newStaffForm.phone}
                    onChange={e => setNewStaffForm({ ...newStaffForm, phone: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="VD: an.nguyen@hospital.vn"
                    value={newStaffForm.email}
                    onChange={e => setNewStaffForm({ ...newStaffForm, email: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                  />
                </div>

                {/* Trình độ chuyên môn (ô nhập + menu thả xuống chọn bậc) */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Trình Độ Chuyên Môn
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Chẩn đoán hình ảnh kỹ thuật cao, X-Quang can thiệp, Siêu âm tim mạch..."
                    value={newStaffForm.specialty}
                    onChange={e => setNewStaffForm({ ...newStaffForm, specialty: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bậc Trình Độ
                  </label>
                  <select
                    value={newStaffForm.educationLevel}
                    onChange={e => setNewStaffForm({ ...newStaffForm, educationLevel: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 dark:text-white"
                  >
                    <option value="">-- Chọn trình độ --</option>
                    <option value="Trên Đại học">Trên Đại học</option>
                    <option value="Đại học">Đại học</option>
                    <option value="Cao đẳng">Cao đẳng</option>
                    <option value="Trung cấp">Trung cấp</option>
                  </select>
                </div>

                {/* Ngày vào làm */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300">
                      Ngày Vào Làm
                    </label>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">dd/mm/yyyy · mm/yyyy · yyyy</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="dd/mm/yyyy, mm/yyyy hoặc yyyy"
                      value={newStaffForm.joinDate}
                      onChange={e => {
                        const raw = e.target.value;
                        setNewStaffForm({
                          ...newStaffForm,
                          joinDate: raw,
                          experienceYears: calculateYearsOfService(raw, newStaffForm.experienceYears)
                        });
                      }}
                      onBlur={() => {
                        const normalized = normalizeFlexibleDateVN(newStaffForm.joinDate);
                        if (normalized !== newStaffForm.joinDate) {
                          setNewStaffForm({
                            ...newStaffForm,
                            joinDate: normalized,
                            experienceYears: calculateYearsOfService(normalized, newStaffForm.experienceYears)
                          });
                        }
                      }}
                      className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      title="Chọn ngày từ lịch"
                      onClick={() => {
                        const picker = newJoinDatePickerRef.current;
                        if (!picker) return;
                        if (typeof picker.showPicker === 'function') {
                          picker.showPicker();
                        } else {
                          picker.click();
                        }
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 rounded-lg transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                    <input
                      ref={newJoinDatePickerRef}
                      type="date"
                      tabIndex={-1}
                      aria-hidden="true"
                      value={toInputDateFormat(newStaffForm.joinDate)}
                      onChange={e => {
                        if (!e.target.value) return;
                        const d = formatDateVN(e.target.value, '');
                        setNewStaffForm({
                          ...newStaffForm,
                          joinDate: d,
                          experienceYears: calculateYearsOfService(d, newStaffForm.experienceYears)
                        });
                      }}
                      className="sr-only"
                    />
                  </div>
                </div>

                {/* Số CCHN nếu có */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Số Chứng Chỉ Hành Nghề (CCHN)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 012345/BYT-CCHN (Tùy chọn)"
                    value={newStaffForm.certCode}
                    onChange={e => setNewStaffForm({ ...newStaffForm, certCode: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu Hồ Sơ Nhân Viên</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nhập Danh Sách Từ File Excel */}
      {showImportExcelModal && (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Nhập Danh Sách Nhân Viên Từ File Excel (.xlsx)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tự động tạo hồ sơ cán bộ, phân công phòng ban và khởi tạo chứng chỉ
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportExcelModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template Download Banner */}
            <div className="bg-emerald-50/80 dark:bg-emerald-950/30 p-4 border-b border-emerald-100 dark:border-emerald-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Bạn chưa có file mẫu chuẩn?</span>
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  Tải ngay file mẫu Excel đã được định dạng sẵn các cột thông tin và danh mục phòng ban từ Quản lý phòng ban.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadExcelTemplate}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải File Mẫu (.xlsx)</span>
              </button>
            </div>

            {/* Body: Step 1 Upload or Step 2 Preview */}
            <div className="p-6 overflow-y-auto flex-1">
              {excelImportStep === 'upload' && (
                <div className="space-y-4">
                  <div
                    onDragOver={handleExcelDragOver}
                    onDragEnter={handleExcelDragEnter}
                    onDragLeave={handleExcelDragLeave}
                    onDrop={handleExcelDrop}
                    onClick={() => excelFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer select-none relative ${
                      isDraggingExcel
                        ? 'border-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/50 ring-4 ring-emerald-500/20 scale-[1.01]'
                        : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      ref={excelFileInputRef}
                      type="file"
                      id="staff-excel-file-input"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleExcelFileUpload}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-all duration-200 ${
                        isDraggingExcel
                          ? 'bg-emerald-600 text-white scale-110 shadow-lg shadow-emerald-600/30'
                          : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                      }`}>
                        <FileUp className={`w-7 h-7 ${isDraggingExcel ? 'animate-bounce' : ''}`} />
                      </div>
                      <div>
                        <span className={`text-sm font-bold transition-colors ${
                          isDraggingExcel
                            ? 'text-emerald-600 dark:text-emerald-400 text-base'
                            : 'text-slate-800 dark:text-slate-100 hover:text-emerald-600'
                        }`}>
                          {isDraggingExcel ? '✨ Thả tệp Excel vào đây để tải lên ngay!' : 'Nhấn để chọn tệp Excel hoặc kéo thả vào đây'}
                        </span>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Hỗ trợ định dạng: .xlsx, .xls, .csv (dung lượng tối đa 10MB)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          excelFileInputRef.current?.click();
                        }}
                        className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all pointer-events-auto"
                      >
                        Chọn tệp từ máy tính
                      </button>
                    </div>
                  </div>

                  {isParsingExcel && (
                    <div className="flex items-center justify-center gap-2 p-4 text-xs font-semibold text-emerald-600 animate-pulse">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Đang phân tích cấu trúc dữ liệu Excel...</span>
                    </div>
                  )}

                  {/* Column guideline */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                    <p className="font-bold text-slate-800 dark:text-white">Các cột dữ liệu được hệ thống tự động nhận diện:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>• Họ và tên (Bắt buộc)</span>
                      <span>• Chức danh (Bác sĩ, KTV...)</span>
                      <span>• Bộ phận</span>
                      <span>• Phòng làm việc</span>
                      <span>• Số điện thoại (chuẩn 10 số)</span>
                      <span>• Email liên hệ</span>
                      <span>• Giới tính & Ngày sinh (dd/mm/yyyy)</span>
                      <span>• Ngày vào làm (dd/mm/yyyy)</span>
                      <span>• Chuyên môn & Số năm công tác</span>
                      <span>• Số CCHN hành nghề</span>
                    </div>
                  </div>
                </div>
              )}

              {excelImportStep === 'preview' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Xem Trước Dữ Liệu Nhân Sự ({parsedExcelStaff.length} bản ghi)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Từ tệp: <strong>{excelFileName}</strong> • {parsedExcelStaff.filter(r => r.isValid).length} hợp lệ, {parsedExcelStaff.filter(r => !r.isValid).length} lỗi
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setExcelImportStep('upload');
                        setParsedExcelStaff([]);
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Chọn lại tệp khác
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl max-h-80">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold uppercase tracking-wider text-[10px] sticky top-0 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">Mã NV</th>
                          <th className="p-2.5">Họ & Tên</th>
                          <th className="p-2.5">Chức Danh</th>
                          <th className="p-2.5">Bộ Phận</th>
                          <th className="p-2.5">Phòng Làm Việc</th>
                          <th className="p-2.5">SĐT (10 số) / Email</th>
                          <th className="p-2.5 whitespace-nowrap">Ngày Sinh & Vào Làm (dd/mm/yyyy)</th>
                          <th className="p-2.5">Số CCHN</th>
                          <th className="p-2.5 text-center">Trạng Thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {parsedExcelStaff.map((row, idx) => (
                          <tr key={idx} className={row.isValid ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'bg-rose-50/50 dark:bg-rose-950/20'}>
                            <td className="p-2.5 text-[11px] font-mono text-slate-400">{idx + 1}</td>
                            <td className="p-2.5 font-mono font-medium">{row.userId}</td>
                            <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                              {row.fullName}
                              <div className="text-[10px] text-slate-400 font-normal">{row.gender}</div>
                            </td>
                            <td className="p-2.5">{row.title}</td>
                            <td className="p-2.5 font-medium text-indigo-600 dark:text-indigo-400">{row.departmentSection}</td>
                            <td className="p-2.5">{row.room || '---'}</td>
                            <td className="p-2.5 text-[11px]">
                              <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {row.phone || '---'}
                              </div>
                              <div className="text-slate-400 text-[10px]">{row.email || '---'}</div>
                            </td>
                            <td className="p-2.5 text-[11px] whitespace-nowrap">
                              <div><span className="text-slate-400">Sinh:</span> <strong className="text-slate-800 dark:text-slate-200 font-semibold">{row.dob || '---'}</strong></div>
                              <div><span className="text-slate-400">Vào:</span> <strong className="text-slate-800 dark:text-slate-200 font-semibold">{row.joinDate || '---'}</strong></div>
                            </td>
                            <td className="p-2.5 font-mono text-[11px]">{row.certCode || '---'}</td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check className="w-3 h-3" /> Hợp lệ
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  {row.errorReason}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportExcelModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xs"
              >
                Đóng
              </button>
              {excelImportStep === 'preview' && (
                <button
                  type="button"
                  onClick={handleConfirmImportExcel}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all shadow-sm text-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Xác Nhận Nhập {parsedExcelStaff.filter(r => r.isValid).length} Cán Bộ Vào Hệ Thống</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác Nhận Xóa Nhân Viên */}
      {deleteConfirmStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Xác Nhận Xóa Hồ Sơ Nhân Viên</h3>
                <p className="text-xs text-slate-500">Hành động này sẽ xóa cán bộ khỏi danh sách nhân sự</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs space-y-1.5">
              <div>
                <span className="text-slate-400 font-medium">Họ và tên cán bộ:</span>
                <p className="font-bold text-slate-800 dark:text-white text-sm">{deleteConfirmStaff.fullName}</p>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700">
                <span>Mã NV: <strong className="font-mono text-slate-800 dark:text-white">{deleteConfirmStaff.userId}</strong></span>
                <span>Chức danh: <strong className="text-indigo-600 dark:text-indigo-400">{deleteConfirmStaff.title}</strong></span>
              </div>
              <div className="text-slate-500 text-[11px]">
                Bộ phận: {deleteConfirmStaff.departmentSection} {deleteConfirmStaff.room ? `• ${deleteConfirmStaff.room}` : ''}
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Bạn có chắc chắn muốn xóa hồ sơ nhân viên này không? Các ca trực và lịch sử công tác liên quan cũng sẽ không còn hiển thị.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmStaff(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xs"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStaff}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-all shadow-sm text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xác Nhận Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
