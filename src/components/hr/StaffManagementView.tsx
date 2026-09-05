import React, { useState, useEffect } from 'react';
import { 
  Users, Award, Calendar, BookOpen, CheckCircle2, Clock, AlertCircle, 
  Search, Check, X, Edit3, Building2, Grid, Layers, History, Plus, Briefcase, ChevronRight, UserCheck, Phone, Mail,
  Trash2, AlertTriangle, ShieldCheck, Filter, FileText
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { 
  StaffProfile, LeaveRequest, TrainingCourse, EmploymentStatus, WorkStatusHistoryItem, CLSTitle, UserRole,
  MedicalCertificate
} from '../../types/hospital';

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
  const [leaveType, setLeaveType] = useState<'Phép năm' | 'Nghỉ ốm' | 'Nghỉ thai sản' | 'Học tập' | 'Nghỉ không lương'>('Phép năm');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [substituteUser, setSubstituteUser] = useState('ThS. BS. Nguyễn Hoài Nam');

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

  // View Work History Modal (for any user)
  const [historyViewingStaff, setHistoryViewingStaff] = useState<StaffProfile | null>(null);

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

  const currentUser = storageService.getCurrentUser();
  const isAdmin = currentUser.role === 'Admin' || currentUser.title?.includes('Trưởng khoa');

  // Helper function to calculate years of service automatically based on join date
  const calculateYearsOfService = (joinDateStr?: string, defaultYears: number = 0): number => {
    if (!joinDateStr) return defaultYears;
    const join = new Date(joinDateStr);
    if (isNaN(join.getTime())) return defaultYears;
    const now = new Date();
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
    };
    loadData();
    return storageService.subscribe(loadData);
  }, []);

  const handleApproveLeave = (id: string, status: 'Đã phê duyệt' | 'Từ chối') => {
    storageService.updateLeaveStatus(id, status, storageService.getCurrentUser().name);
  };

  const handleCreateLeaveRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const currUser = storageService.getCurrentUser();
    const newReq: LeaveRequest = {
      id: `LR-${Date.now()}`,
      userId: currUser.id,
      userName: currUser.name,
      userRole: currUser.title || 'Nhân viên',
      leaveType,
      startDate: leaveStart,
      endDate: leaveEnd,
      totalDays: 2,
      reason: leaveReason,
      substituteUserName: substituteUser,
      status: 'Chờ duyệt',
      createdAt: new Date().toLocaleString('vi-VN')
    };

    storageService.saveLeaveRequest(newReq);
    setShowLeaveModal(false);
    setLeaveReason('');
    alert('Đã gửi đơn xin nghỉ phép thành công. Trưởng khoa sẽ xét duyệt!');
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
    setEditingCert(null);
    setCertStaffUserId(preselectedStaffUserId || profiles[0]?.userId || '');
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

    const updatedCerts = (targetProfile.certificates || []).filter(c => c.id !== deleteConfirmCert.certId);
    const updatedProfile: StaffProfile = {
      ...targetProfile,
      certificates: updatedCerts
    };

    storageService.saveStaffProfile(updatedProfile);
    setProfiles(prev => prev.map(p => p.userId === updatedProfile.userId ? updatedProfile : p));
    setDeleteConfirmCert(null);
  };

  const handleSaveCert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!certStaffUserId) {
      alert('Vui lòng chọn cán bộ / nhân viên sở hữu chứng chỉ!');
      return;
    }
    if (!certName.trim()) {
      alert('Vui lòng nhập tên chứng chỉ!');
      return;
    }
    if (!certCode.trim()) {
      alert('Vui lòng nhập mã số chứng chỉ!');
      return;
    }
    if (!certIssuedBy.trim()) {
      alert('Vui lòng nhập cơ quan cấp!');
      return;
    }

    const targetProfile = profiles.find(p => p.userId === certStaffUserId);
    if (!targetProfile) {
      alert('Không tìm thấy thông tin cán bộ được chọn!');
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
        id: `CERT-${Date.now()}`,
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

  // Extract unique departments & rooms for dropdown suggestions and filter
  const existingDepartments = Array.from(
    new Set(profiles.map(p => p.departmentSection).filter(Boolean))
  );
  const existingRooms = Array.from(
    new Set(profiles.map(p => p.room).filter(Boolean) as string[])
  );

  const allDepartmentsAndRooms = Array.from(
    new Set([
      ...existingDepartments,
      ...existingRooms
    ])
  );

  // Filter staff profiles
  const filteredProfiles = profiles.filter(p => {
    const matchSearch = p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.specialty.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.departmentSection.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.room && p.room.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchDept = selectedDepartmentFilter === 'all' ||
      p.departmentSection === selectedDepartmentFilter ||
      p.room === selectedDepartmentFilter;

    return matchSearch && matchDept;
  });

  // Group profiles by Department / Room when in 'grouped' view mode
  const groupedProfiles = filteredProfiles.reduce<Record<string, StaffProfile[]>>((acc, profile) => {
    const key = profile.departmentSection || 'Chưa phân bộ phận';
    if (!acc[key]) acc[key] = [];
    acc[key].push(profile);
    return acc;
  }, {});

  // Save edited profile (Admin action)
  const handleSaveProfileEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    storageService.saveStaffProfile(editingStaff);
    
    // Also sync back to user list if name/role/title/department changed
    const users = storageService.getUsers();
    const userIdx = users.findIndex(u => u.id === editingStaff.userId);
    if (userIdx >= 0) {
      const targetUser = users[userIdx];
      storageService.saveUser({
        ...targetUser,
        name: editingStaff.fullName,
        title: editingStaff.title as CLSTitle,
        role: editingStaff.role as UserRole,
        department: editingStaff.departmentSection,
        room: editingStaff.room
      });
    }

    setEditingStaff(null);
    alert(`Đã cập nhật thông tin cán bộ ${editingStaff.fullName} thành công!`);
  };

  // Add history item to editingStaff
  const handleAddHistoryItem = () => {
    if (!editingStaff || !histStartDate) {
      alert('Vui lòng nhập từ ngày bắt đầu!');
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
        <div className="flex items-center gap-2">
          {isAdmin && (
            <span className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs font-bold flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Quyền Admin: Có thể chỉnh sửa thông tin nhân viên
            </span>
          )}
          <button
            onClick={() => setShowLeaveModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-semibold text-sm transition-all shadow-sm shadow-indigo-200"
          >
            <Calendar className="w-4 h-4" /> Tạo Đơn Xin Nghỉ Phép
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Dòng 1: Thanh Menu / Tabs Chuyên Mục */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
            {/* 1. Lịch Nghỉ Phép (Far Left) */}
            <button
              onClick={() => setActiveTab('leave')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'leave' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/80'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Lịch Nghỉ Phép</span>
              {leaveRequests.filter(l => l.status === 'Chờ duyệt').length > 0 && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
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
              placeholder={activeTab === 'profiles' ? "Tìm tên cán bộ, mã NV, chuyên môn, phòng ban..." : "Tìm kiếm thông tin theo từ khóa..."}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Controls bên phải: Department filter & layout switcher */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {activeTab === 'profiles' && (
              <>
                {/* Department/Room Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <select
                    value={selectedDepartmentFilter}
                    onChange={e => setSelectedDepartmentFilter(e.target.value)}
                    className="bg-transparent outline-none font-medium text-slate-700 dark:text-slate-200 cursor-pointer text-xs"
                  >
                    <option value="all" className="dark:bg-slate-900">Tất cả Phòng / Bộ phận</option>
                    {allDepartmentsAndRooms.map(dept => (
                      <option key={dept} value={dept} className="dark:bg-slate-900">{dept}</option>
                    ))}
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
              </>
            )}

            {(searchTerm || selectedDepartmentFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedDepartmentFilter('all');
                }}
                className="px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/30 rounded-xl transition-colors shrink-0"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>

        {/* Tab 1 (Far Left): Leave Requests Management */}
        {activeTab === 'leave' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Danh Sách Đơn Xin Nghỉ Phép & Phê Duyệt</h3>
                <p className="text-xs text-slate-500">Quản lý các loại đơn xin nghỉ phép năm, nghỉ ốm, thai sản và tập huấn chuyên môn.</p>
              </div>
              <button
                onClick={() => setShowLeaveModal(true)}
                className="px-3.5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Gửi Đơn Xin Phép
              </button>
            </div>

            <div className="space-y-3">
              {leaveRequests.map(leave => (
                <div key={leave.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{leave.userName}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">{leave.userRole}</span>
                      <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">{leave.leaveType}</span>
                    </div>
                    <p className="text-xs text-slate-600">Lý do: <strong>{leave.reason}</strong></p>
                    <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 mt-1">
                      <span>Thời gian: <strong className="text-slate-800">{leave.startDate} đến {leave.endDate} ({leave.totalDays} ngày)</strong></span>
                      {leave.substituteUserName && <span>Người trực thay: <strong className="text-slate-800">{leave.substituteUserName}</strong></span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {leave.status === 'Chờ duyệt' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApproveLeave(leave.id, 'Đã phê duyệt')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Duyệt Phép
                        </button>
                        <button
                          onClick={() => handleApproveLeave(leave.id, 'Từ chối')}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> Từ Chối
                        </button>
                      </div>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        leave.status === 'Đã phê duyệt' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {leave.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Staff Profiles (with Filter by Room/Dept, Admin Edit, Status Badges & Career History) */}
        {activeTab === 'profiles' && (
          <div className="p-6 space-y-6">
            {/* View Mode 1: GRID VIEW */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProfiles.map(staff => (
                  <div key={staff.userId} className="bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all p-5 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      {/* Top row: Title, Name, Status Badge & Admin Edit */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded uppercase">
                            {staff.title}
                          </span>
                          <h3 className="text-base font-bold text-slate-900 mt-1">{staff.fullName}</h3>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Admin Edit Button */}
                          {isAdmin && (
                            <button
                              onClick={() => setEditingStaff({
                                ...staff,
                                experienceYears: staff.joinDate ? calculateYearsOfService(staff.joinDate, staff.experienceYears) : staff.experienceYears
                              })}
                              title="Chỉnh sửa thông tin cán bộ (Dành cho Admin)"
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-all text-xs font-semibold flex items-center gap-1 border border-indigo-200"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Sửa</span>
                            </button>
                          )}
                          <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                            {staff.experienceYears} năm công tác
                          </span>
                        </div>
                      </div>

                      {/* Current Status Badge & Room */}
                      <div className="flex items-center justify-between">
                        {getEmploymentStatusBadge(staff.currentStatus)}
                        {staff.room && (
                          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            🏢 {staff.room}
                          </span>
                        )}
                      </div>

                      {/* Department Section */}
                      <p className="text-xs text-indigo-900 font-semibold bg-indigo-50/60 p-2 rounded-lg border border-indigo-100 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        {staff.departmentSection}
                      </p>

                      {/* Personal Info Details: Gender, DOB, Phone, Email */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/90 p-2.5 rounded-lg border border-slate-200/80">
                        <div className="text-slate-600 flex items-center gap-1">
                          <span className="font-semibold text-slate-500">Giới tính:</span>
                          <strong className="text-slate-900 font-bold">{staff.gender || '---'}</strong>
                        </div>
                        <div className="text-slate-600 flex items-center gap-1">
                          <span className="font-semibold text-slate-500">Ngày sinh:</span>
                          <strong className="text-slate-900 font-bold">{staff.dob || '---'}</strong>
                        </div>
                        <div className="text-slate-600 flex items-center gap-1.5 col-span-2 sm:col-span-1 truncate" title={staff.phone}>
                          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                          <strong className="text-slate-800 font-semibold truncate">{staff.phone || 'Chưa có SĐT'}</strong>
                        </div>
                        <div className="text-slate-600 flex items-center gap-1.5 col-span-2 sm:col-span-1 truncate" title={staff.email}>
                          <Mail className="w-3 h-3 text-indigo-600 shrink-0" />
                          <strong className="text-slate-800 font-semibold truncate">{staff.email || 'Chưa có Email'}</strong>
                        </div>
                      </div>

                      {/* Join Date & Service Years Info */}
                      <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-medium">
                        <span className="text-slate-600">📅 Ngày vào làm: <strong className="text-slate-900">{staff.joinDate || 'Chưa cập nhật'}</strong></span>
                        <span className="text-slate-600">⏱️ Công tác: <strong className="text-indigo-600">{staff.experienceYears} năm</strong></span>
                      </div>

                      {/* Specialty & Degrees */}
                      <div className="space-y-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Chuyên môn chính:</span>
                          <p className="text-slate-800 font-medium mt-0.5">{staff.specialty}</p>
                        </div>
                        <div className="pt-2 border-t border-slate-200/60">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Bằng cấp & Học vị:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {staff.degrees.map((deg, idx) => (
                              <span key={idx} className="bg-white px-2 py-0.5 rounded border border-slate-200 text-[11px] text-slate-700 font-medium">
                                {deg}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions & Stats */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>Ca trực tháng này: <strong className="text-slate-900">{staff.totalShiftsThisMonth} ca</strong></span>
                        <span>Phép còn: <strong className="text-indigo-600">{staff.leaveBalanceDays} ngày</strong></span>
                      </div>

                      {/* Career History Button */}
                      <button
                        onClick={() => setHistoryViewingStaff(staff)}
                        className="w-full py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 border border-slate-200"
                      >
                        <History className="w-3.5 h-3.5 text-indigo-600" /> Xem Lịch Sử Công Tác ({staff.statusHistory?.length || 0})
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
                  <div key={deptName} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    {/* Section Header */}
                    <div className="bg-slate-100/80 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        <h3 className="font-bold text-slate-900 text-sm">{deptName}</h3>
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-xs font-extrabold">
                          {deptStaffList.length} nhân sự
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                        <span>Đang làm việc: <strong className="text-emerald-600">{deptStaffList.filter(s => s.currentStatus === 'Đang làm việc').length}</strong></span>
                        <span>Đang thử việc: <strong className="text-blue-600">{deptStaffList.filter(s => s.currentStatus === 'Đang thử việc').length}</strong></span>
                        <span>Nghỉ thai sản/không lương: <strong className="text-purple-600">{deptStaffList.filter(s => s.currentStatus === 'Nghỉ thai sản' || s.currentStatus === 'Nghỉ không lương').length}</strong></span>
                      </div>
                    </div>

                    {/* Staff List Table inside Department */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-600">
                        <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
                          <tr>
                            <th className="p-3 whitespace-nowrap">Họ & Tên</th>
                            <th className="p-3 whitespace-nowrap">Thông Tin Cá Nhân & Liên Hệ</th>
                            <th className="p-3 whitespace-nowrap">Chức danh / Vai trò</th>
                            <th className="p-3 whitespace-nowrap">Phòng làm việc</th>
                            <th className="p-3 whitespace-nowrap">Trạng thái</th>
                            <th className="p-3 whitespace-nowrap">Chuyên môn</th>
                            <th className="p-3 whitespace-nowrap">Ngày vào làm</th>
                            <th className="p-3 whitespace-nowrap">Số năm công tác</th>
                            <th className="p-3 text-right whitespace-nowrap min-w-[150px]">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {deptStaffList.map(staff => (
                            <tr key={staff.userId} className="hover:bg-slate-50/80">
                              <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span>{staff.fullName}</span>
                                </div>
                              </td>
                              <td className="p-3 text-slate-700">
                                <div className="space-y-0.5 text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-800">{staff.gender || '---'}</span>
                                    {staff.dob && <span className="text-slate-400">• {staff.dob}</span>}
                                  </div>
                                  {(staff.phone || staff.email) && (
                                    <div className="flex items-center gap-2 text-slate-500 text-[10px]">
                                      {staff.phone && <span className="flex items-center gap-1 text-slate-700"><Phone className="w-2.5 h-2.5 text-emerald-600" />{staff.phone}</span>}
                                      {staff.email && <span className="flex items-center gap-1 text-slate-600"><Mail className="w-2.5 h-2.5 text-indigo-500" />{staff.email}</span>}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                                  {staff.title} ({staff.role})
                                </span>
                              </td>
                              <td className="p-3 text-slate-700 font-medium whitespace-nowrap">
                                {staff.room || 'Phòng chung khoa'}
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                {getEmploymentStatusBadge(staff.currentStatus)}
                              </td>
                              <td className="p-3 text-slate-700 max-w-xs truncate" title={staff.specialty}>
                                {staff.specialty}
                              </td>
                              <td className="p-3 font-medium text-slate-700 whitespace-nowrap">
                                {staff.joinDate || '---'}
                              </td>
                              <td className="p-3 font-medium text-slate-900 whitespace-nowrap">
                                {staff.experienceYears} năm
                              </td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                  <button
                                    onClick={() => setHistoryViewingStaff(staff)}
                                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 border border-slate-200 shrink-0"
                                  >
                                    <History className="w-3.5 h-3.5 text-indigo-600" /> Lịch sử
                                  </button>
                                  {isAdmin && (
                                    <button
                                      onClick={() => setEditingStaff({
                                        ...staff,
                                        experienceYears: staff.joinDate ? calculateYearsOfService(staff.joinDate, staff.experienceYears) : staff.experienceYears
                                      })}
                                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 border border-indigo-200 shrink-0"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" /> Sửa
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
                <button
                  onClick={() => handleOpenAddCert()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Mới Chứng Chỉ</span>
                </button>
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
              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
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
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {displayedCertificates.length > 0 ? (
                      displayedCertificates.map(cert => (
                        <tr key={cert.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{cert.staffName}</div>
                            <div className="text-[11px] text-slate-500">{cert.staffTitle} • {cert.staffDept}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
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
                          <td className="p-3 text-slate-600 whitespace-nowrap">{cert.issuedDate}</td>
                          <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                            <span className={cert.status === 'Hết hiệu lực' ? 'text-red-600 font-bold' : cert.status === 'Sắp hết hạn' ? 'text-amber-600 font-bold' : 'text-slate-900'}>
                              {cert.expiryDate}
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
                            <button
                              onClick={() => handleOpenAddCert()}
                              className="mt-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" /> Thêm Mới Chứng Chỉ
                            </button>
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
            <h3 className="text-base font-bold text-slate-900">Lịch Đào Tạo Liên Tục CME & Tập Huấn Chất Lượng ISO 15189</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {trainingCourses.map(course => (
                <div key={course.id} className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase">
                      {course.category}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {course.status}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">{course.title}</h4>
                  <p className="text-xs text-slate-600">Giảng viên: <strong>{course.trainer}</strong></p>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Địa điểm:</span>
                      <span className="font-medium text-slate-800">{course.location}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Thời gian:</span>
                      <span className="font-medium text-slate-800">{course.startDate} đến {course.endDate}</span>
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

      {/* MODAL 1: Admin Edit Staff Profile Modal */}
      {editingStaff && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2 text-indigo-600">
                <Edit3 className="w-5 h-5" />
                <h3 className="text-lg font-bold text-slate-900">Chỉnh Sửa Thông Tin Cán Bộ (Admin)</h3>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfileEdit} className="space-y-4 text-xs">
              {/* Row 1: Full name & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ và Tên Cán Bộ:</label>
                  <input
                    type="text"
                    required
                    value={editingStaff.fullName}
                    onChange={e => setEditingStaff({ ...editingStaff, fullName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chức Danh Chuyên Môn:</label>
                  <select
                    value={editingStaff.title}
                    onChange={e => setEditingStaff({ ...editingStaff, title: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    <option value="Trưởng khoa">Trưởng khoa</option>
                    <option value="Phó khoa">Phó khoa</option>
                    <option value="Điều dưỡng trưởng">Điều dưỡng trưởng</option>
                    <option value="Kỹ thuật viên">Kỹ thuật viên</option>
                    <option value="Bác sĩ">Bác sĩ</option>
                    <option value="Nhân viên hành chính">Nhân viên hành chính</option>
                  </select>
                </div>
              </div>

              {/* Personal Info & Contact Block */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" /> Thông Tin Cá Nhân & Liên Hệ
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Giới Tính:</label>
                    <select
                      value={editingStaff.gender || 'Nam'}
                      onChange={e => setEditingStaff({ ...editingStaff, gender: e.target.value as 'Nam' | 'Nữ' | 'Khác' })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                    >
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Ngày Sinh:</label>
                    <input
                      type="date"
                      value={editingStaff.dob || ''}
                      onChange={e => setEditingStaff({ ...editingStaff, dob: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Số Điện Thoại:</label>
                    <input
                      type="tel"
                      placeholder="e.g. 0912 345 678"
                      value={editingStaff.phone || ''}
                      onChange={e => setEditingStaff({ ...editingStaff, phone: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email Liên Hệ:</label>
                    <input
                      type="email"
                      placeholder="e.g. canbo@benhvien.vn"
                      value={editingStaff.email || ''}
                      onChange={e => setEditingStaff({ ...editingStaff, email: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Role & Current Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phân Quyền Hệ Thống:</label>
                  <select
                    value={editingStaff.role}
                    onChange={e => setEditingStaff({ ...editingStaff, role: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    <option value="Admin">Admin (Quản trị viên khoa)</option>
                    <option value="Manager">Manager (Quản lý chuyên môn)</option>
                    <option value="Doctor">Doctor (Bác sĩ)</option>
                    <option value="Staff">Staff (Kỹ thuật viên / Nhân viên)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trạng Thái Làm Việc Hiện Tại:</label>
                  <select
                    value={editingStaff.currentStatus || 'Đang làm việc'}
                    onChange={e => setEditingStaff({ ...editingStaff, currentStatus: e.target.value as EmploymentStatus })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-700"
                  >
                    <option value="Đang làm việc">🟢 Đang làm việc</option>
                    <option value="Đang thử việc">🔵 Đang thử việc</option>
                    <option value="Nghỉ không lương">🟠 Nghỉ không lương</option>
                    <option value="Nghỉ thai sản">🟣 Nghỉ thai sản</option>
                    <option value="Đã nghỉ việc">⚪ Đã nghỉ việc</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Department Section & Room */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Bộ Phận / Khoa:</label>
                    <span className="text-[10px] text-slate-400 font-medium">Chọn từ danh sách hoặc nhập mới</span>
                  </div>
                  <input
                    type="text"
                    required
                    list="existing-dept-datalist"
                    placeholder="Chọn từ danh sách hoặc nhập tên bộ phận mới..."
                    value={editingStaff.departmentSection}
                    onChange={e => setEditingStaff({ ...editingStaff, departmentSection: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                  />
                  <datalist id="existing-dept-datalist">
                    {existingDepartments.map(dept => (
                      <option key={dept} value={dept} />
                    ))}
                  </datalist>

                  {/* Suggestion dropdown/chips */}
                  {existingDepartments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="text-[10px] text-slate-400 font-bold mr-0.5">Danh sách hiện có:</span>
                      {existingDepartments.map(dept => (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => setEditingStaff({ ...editingStaff, departmentSection: dept })}
                          className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${
                            editingStaff.departmentSection === dept
                              ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 font-medium'
                          }`}
                        >
                          {dept}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Phòng Làm Việc Trực Thuộc:</label>
                    <span className="text-[10px] text-slate-400 font-medium">Chọn từ danh sách hoặc nhập mới</span>
                  </div>
                  <input
                    type="text"
                    list="existing-room-datalist"
                    placeholder="Chọn từ danh sách hoặc nhập tên phòng mới..."
                    value={editingStaff.room || ''}
                    onChange={e => setEditingStaff({ ...editingStaff, room: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                  />
                  <datalist id="existing-room-datalist">
                    {existingRooms.map(r => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>

                  {/* Suggestion dropdown/chips */}
                  {existingRooms.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="text-[10px] text-slate-400 font-bold mr-0.5">Danh sách phòng:</span>
                      {existingRooms.map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setEditingStaff({ ...editingStaff, room: r })}
                          className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${
                            editingStaff.room === r
                              ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 font-medium'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 4: Specialty & Join Date & Service Years */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Chuyên Môn Chính:</label>
                  <input
                    type="text"
                    required
                    value={editingStaff.specialty}
                    onChange={e => setEditingStaff({ ...editingStaff, specialty: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ngày Vào Làm:</label>
                  <input
                    type="date"
                    value={editingStaff.joinDate || ''}
                    onChange={e => {
                      const newJoinDate = e.target.value;
                      const calculatedYears = calculateYearsOfService(newJoinDate, editingStaff.experienceYears);
                      setEditingStaff({
                        ...editingStaff,
                        joinDate: newJoinDate,
                        experienceYears: calculatedYears
                      });
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Số Năm Công Tác:</label>
                    <span className="text-[10px] text-indigo-600 font-semibold">(Tự động tính)</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={editingStaff.experienceYears}
                    onChange={e => setEditingStaff({ ...editingStaff, experienceYears: parseInt(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  />
                </div>
              </div>

              {/* Section: Status History Timeline Management inside Edit Modal */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-600" />
                    <h4 className="font-bold text-slate-900">Diễn Biến Lịch Sử Công Tác & Trạng Thái</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddHistoryForm(!showAddHistoryForm)}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm Mốc Lịch Sử
                  </button>
                </div>

                {/* Subform to add a new history entry */}
                {showAddHistoryForm && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-indigo-200 space-y-3">
                    <h5 className="font-bold text-indigo-900 text-[11px] uppercase">Thêm mốc lịch sử công tác mới</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Từ ngày:</label>
                        <input
                          type="date"
                          value={histStartDate}
                          onChange={e => setHistStartDate(e.target.value)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Đến ngày:</label>
                        <input
                          type="text"
                          placeholder="YYYY-MM-DD hoặc Hiện tại"
                          value={histEndDate}
                          onChange={e => setHistEndDate(e.target.value)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Trạng thái làm việc:</label>
                        <select
                          value={histStatus}
                          onChange={e => setHistStatus(e.target.value as EmploymentStatus)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                        >
                          <option value="Đang làm việc">Đang làm việc</option>
                          <option value="Đang thử việc">Đang thử việc</option>
                          <option value="Nghỉ không lương">Nghỉ không lương</option>
                          <option value="Nghỉ thai sản">Nghỉ thai sản</option>
                          <option value="Đã nghỉ việc">Đã nghỉ việc</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Phòng / Bộ phận:</label>
                        <input
                          type="text"
                          list="existing-dept-datalist"
                          placeholder={editingStaff.departmentSection}
                          value={histDept}
                          onChange={e => setHistDept(e.target.value)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Ghi chú / Quyết định:</label>
                        <input
                          type="text"
                          placeholder="Lý do chuyển đổi, số quyết định..."
                          value={histNote}
                          onChange={e => setHistNote(e.target.value)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddHistoryForm(false)}
                        className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleAddHistoryItem}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
                      >
                        Lưu Mốc Lịch Sử
                      </button>
                    </div>
                  </div>
                )}

                {/* Render existing history list */}
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {editingStaff.statusHistory?.map((item) => (
                    <div key={item.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{item.startDate} ➔ {item.endDate}</span>
                          {getEmploymentStatusBadge(item.status)}
                        </div>
                        <p className="text-slate-600">
                          {item.positionOrTitle || editingStaff.title} - {item.departmentSection} {item.room ? `(${item.room})` : ''}
                        </p>
                        {item.note && <p className="text-[11px] text-slate-500 italic">📝 {item.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-all"
                >
                  Hủy Thao Tác
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
                >
                  Lưu Thay Đổi (Admin)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: View Work History Timeline Modal (For all users) */}
      {historyViewingStaff && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 text-indigo-600">
                <History className="w-5 h-5" />
                <h3 className="text-lg font-bold text-slate-900">Diễn Biến Lịch Sử Công Tác</h3>
              </div>
              <button
                onClick={() => setHistoryViewingStaff(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Header in Modal */}
            <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-600 px-2 py-0.5 bg-white rounded border border-indigo-100">
                    {historyViewingStaff.title}
                  </span>
                  <h4 className="font-bold text-slate-900 text-base mt-0.5">{historyViewingStaff.fullName}</h4>
                  <p className="text-xs text-slate-600 font-medium">{historyViewingStaff.departmentSection}</p>
                </div>
                <div className="text-right">
                  {getEmploymentStatusBadge(historyViewingStaff.currentStatus)}
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Vào làm: <strong>{historyViewingStaff.joinDate || '---'}</strong> • <strong>{historyViewingStaff.experienceYears} năm công tác</strong>
                  </p>
                </div>
              </div>

              {/* Personal Details Row */}
              <div className="pt-2 border-t border-indigo-100/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-medium">Giới tính: </span>
                  <strong className="text-slate-800">{historyViewingStaff.gender || '---'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Ngày sinh: </span>
                  <strong className="text-slate-800">{historyViewingStaff.dob || '---'}</strong>
                </div>
                <div className="truncate" title={historyViewingStaff.phone}>
                  <span className="text-slate-500 font-medium">SĐT: </span>
                  <strong className="text-slate-800">{historyViewingStaff.phone || '---'}</strong>
                </div>
                <div className="truncate" title={historyViewingStaff.email}>
                  <span className="text-slate-500 font-medium">Email: </span>
                  <strong className="text-slate-800">{historyViewingStaff.email || '---'}</strong>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="py-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Mốc Thời Gian & Trạng Thái Làm Việc</h4>

              {(!historyViewingStaff.statusHistory || historyViewingStaff.statusHistory.length === 0) ? (
                <p className="text-xs text-slate-500 italic text-center py-6">Chưa có dữ liệu diễn biến công tác.</p>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-200">
                  {historyViewingStaff.statusHistory.map((hItem, idx) => (
                    <div key={hItem.id || idx} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-600 ring-4 ring-indigo-100 flex items-center justify-center"></div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 hover:border-indigo-300 transition-all shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                          <span className="font-extrabold text-slate-900 text-xs">
                            📅 {hItem.startDate} ➔ {hItem.endDate || 'Hiện tại'}
                          </span>
                          {getEmploymentStatusBadge(hItem.status)}
                        </div>

                        <div className="text-xs space-y-1">
                          <p className="font-bold text-indigo-950">
                            {hItem.positionOrTitle || historyViewingStaff.title} - {hItem.departmentSection}
                          </p>
                          {hItem.room && (
                            <p className="text-slate-600 font-medium">
                              🏢 Phòng trực thuộc: <strong>{hItem.room}</strong>
                            </p>
                          )}
                          {hItem.note && (
                            <p className="text-slate-600 italic bg-white p-2 rounded border border-slate-100 text-[11px] mt-1">
                              💬 {hItem.note}
                            </p>
                          )}
                          {hItem.updatedBy && (
                            <p className="text-[10px] text-slate-400 text-right pt-1">
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

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setHistoryViewingStaff(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">📝 Tạo Đơn Xin Nghỉ Phép / Đi Học</h3>
            
            <form onSubmit={handleCreateLeaveRequest} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loại nghỉ phép:</label>
                <select
                  value={leaveType}
                  onChange={e => setLeaveType(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                >
                  <option value="Phép năm">Nghỉ phép năm</option>
                  <option value="Học tập">Đi học CME / Tập huấn</option>
                  <option value="Nghỉ ốm">Nghỉ ốm / Điều trị</option>
                  <option value="Nghỉ thai sản">Nghỉ thai sản</option>
                  <option value="Nghỉ không lương">Nghỉ không lương</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Từ ngày:</label>
                  <input
                    type="date"
                    required
                    value={leaveStart}
                    onChange={e => setLeaveStart(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Đến ngày:</label>
                  <input
                    type="date"
                    required
                    value={leaveEnd}
                    onChange={e => setLeaveEnd(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lý do nghỉ phép:</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ghi rõ lý do xin nghỉ phép..."
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Người trực thay / Bàn giao ca:</label>
                <input
                  type="text"
                  required
                  value={substituteUser}
                  onChange={e => setSubstituteUser(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                >
                  Gửi Đơn Duyệt
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
                  {profiles.map(p => (
                    <option key={p.userId} value={p.userId}>
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
    </div>
  );
};
