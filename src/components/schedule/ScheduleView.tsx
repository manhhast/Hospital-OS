import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Clock, Users, Plus, Filter, Search,
  ChevronLeft, ChevronRight, MapPin, Building, Building2, Copy, RefreshCw,
  Printer, Download, ArrowRightLeft, Check, X, CheckCircle2,
  AlertCircle, ShieldCheck, FileSpreadsheet, CalendarCheck2, Monitor,
  Trash2, Edit3, Tag, Sparkles, Layers, ListPlus, SlidersHorizontal,
  Forward, RotateCcw, Info, GripVertical, Briefcase, ShieldAlert
} from 'lucide-react';
import { ShiftDuty, WeeklyMeeting, User, WorkType, ScheduleColor, ShiftSwapRequest, WorkTaskRow } from '../../types/hospital';
import { storageService } from '../../services/storageService';

export const ScheduleView: React.FC = () => {
  const [shifts, setShifts] = useState<ShiftDuty[]>([]);
  const [meetings, setMeetings] = useState<WeeklyMeeting[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workTaskRows, setWorkTaskRows] = useState<WorkTaskRow[]>([]);
  const currentUser = storageService.getCurrentUser();

  // View state: Day | Week | Month | Timeline
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'timeline'>('week');
  const [weekSubView, setWeekSubView] = useState<'table' | 'cards'>('table');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const allShifts = storageService.getShifts();
    if (allShifts && allShifts.length > 0) {
      const dates = allShifts.map(s => s.date).filter(Boolean).sort();
      if (dates.length > 0) return dates[dates.length - 1];
    }
    return new Date().toISOString().split('T')[0];
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterRoom, setFilterRoom] = useState<string>('Tất cả');
  const [filterMachine, setFilterMachine] = useState<string>('Tất cả');
  const [filterRole, setFilterRole] = useState<string>('Tất cả');
  const [filterWorkType, setFilterWorkType] = useState<string>('Tất cả');

  // Drag & Drop State
  const [draggedUser, setDraggedUser] = useState<User | null>(null);
  const [draggedShift, setDraggedShift] = useState<ShiftDuty | null>(null);
  const [activeDropCellKey, setActiveDropCellKey] = useState<string | null>(null);
  const [isTrashOver, setIsTrashOver] = useState<boolean>(false);
  const [dragToast, setDragToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isStaffPopupOpen, setIsStaffPopupOpen] = useState<boolean>(false);
  const [popupFilterRoom, setPopupFilterRoom] = useState<string>('Tất cả');

  // 5 phòng/bộ phận trực thuộc Khoa Cận Lâm Sàng đồng bộ từ Google Sheet (như trong Báo cáo & Thống kê)
  const syncedRooms = React.useMemo(() => [
    'Phòng Xét nghiệm',
    'Phòng Siêu âm',
    'Phòng Nội soi',
    'Phòng X-quang KTS',
    'Phòng Điện tim & LHN'
  ], []);

  // Helper function to match room/department with selected room filter
  const isRoomMatching = (itemRoom: string, selectedFilterRoom: string): boolean => {
    if (!selectedFilterRoom || selectedFilterRoom === 'Tất cả') return true;
    const item = (itemRoom || '').toLowerCase();
    const filter = selectedFilterRoom.toLowerCase();

    if (item.includes(filter) || filter.includes(item)) return true;

    if (filter.includes('xét nghiệm')) {
      return item.includes('xét nghiệm') || item.includes('sinh hóa') || item.includes('huyết học') || item.includes('vi sinh') || item.includes('lab');
    }
    if (filter.includes('siêu âm')) {
      return item.includes('siêu âm');
    }
    if (filter.includes('nội soi')) {
      return item.includes('nội soi');
    }
    if (filter.includes('x-quang') || filter.includes('x quang')) {
      return item.includes('x-quang') || item.includes('x quang') || item.includes('xquang') || item.includes('msct') || item.includes('mri') || item.includes('ct');
    }
    if (filter.includes('điện tim')) {
      return item.includes('điện tim') || item.includes('lhn') || item.includes('lưu huyết não') || item.includes('ecg');
    }

    return false;
  };

  // Filtered staff list for bottom floating popup drawer
  const filteredPopupUsers = users.filter(u => {
    if (popupFilterRoom === 'Tất cả') return true;
    return isRoomMatching(u.department || '', popupFilterRoom) || isRoomMatching(u.room || '', popupFilterRoom);
  });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setDragToast({ message: msg, type });
    setTimeout(() => {
      setDragToast(prev => prev?.message === msg ? null : prev);
    }, 3500);
  };

  // Modals
  const [showShiftModal, setShowShiftModal] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<ShiftDuty | null>(null);
  
  const [showSwapModal, setShowSwapModal] = useState<boolean>(false);
  const [swapTargetShift, setSwapTargetShift] = useState<ShiftDuty | null>(null);
  const [swapTargetUserId, setSwapTargetUserId] = useState<string>('');
  const [swapReason, setSwapReason] = useState<string>('');

  const [showSwapApprovalDrawer, setShowSwapApprovalDrawer] = useState<boolean>(false);

  // Task Row Management Modal State
  const [showTaskRowModal, setShowTaskRowModal] = useState<boolean>(false);
  const [editingTaskRow, setEditingTaskRow] = useState<WorkTaskRow | null>(null);
  const [taskRowFormData, setTaskRowFormData] = useState<{
    name: string;
    workType: WorkType;
    room: string;
    machine: string;
    defaultTime: string;
    color: ScheduleColor;
    notes: string;
  }>({
    name: '',
    workType: 'Làm việc',
    room: 'Phòng Xét nghiệm Sinh hóa',
    machine: 'Cobas 8000 (Roche)',
    defaultTime: '07:00 - 15:00',
    color: 'Xanh',
    notes: ''
  });

  // Form State for Shift Creation/Edit
  const [formData, setFormData] = useState<{
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    assignedUserId: string;
    room: string;
    machine: string;
    department: string;
    workType: WorkType;
    priority: 'Khẩn cấp' | 'Cao' | 'Trung bình' | 'Thấp';
    color: ScheduleColor;
    notes: string;
    recurrence: 'Không' | 'Hàng ngày' | 'Hàng tuần' | 'Hàng tháng';
    taskRowId?: string;
  }>({
    title: '',
    date: selectedDate,
    startTime: '07:00',
    endTime: '15:00',
    assignedUserId: '',
    room: 'Phòng Xét nghiệm Sinh hóa',
    machine: 'Cobas 8000 (Roche)',
    department: 'Khoa Cận Lâm Sàng - Xét nghiệm',
    workType: 'Ca trực',
    priority: 'Cao',
    color: 'Đỏ',
    notes: '',
    recurrence: 'Không'
  });

  const loadData = () => {
    setShifts(storageService.getShifts());
    setMeetings(storageService.getMeetings());
    setUsers(storageService.getUsers());
    setWorkTaskRows(storageService.getWorkTaskRows());
  };

  useEffect(() => {
    loadData();
    const unsubscribe = storageService.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  // Helper date calculations
  const getDatesOfWeek = (baseDateStr: string) => {
    const base = new Date(baseDateStr);
    const day = base.getDay();
    const diff = base.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(base.setDate(diff));

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday);
      nextDay.setDate(monday.getDate() + i);
      weekDays.push(nextDay.toISOString().split('T')[0]);
    }
    return weekDays;
  };

  const currentWeekDays = getDatesOfWeek(selectedDate);

  // Navigate Date
  const handlePrevDate = () => {
    const curr = new Date(selectedDate);
    if (viewMode === 'day') curr.setDate(curr.getDate() - 1);
    else if (viewMode === 'week') curr.setDate(curr.getDate() - 7);
    else if (viewMode === 'month') curr.setMonth(curr.getMonth() - 1);
    else curr.setDate(curr.getDate() - 1);
    setSelectedDate(curr.toISOString().split('T')[0]);
  };

  const handleNextDate = () => {
    const curr = new Date(selectedDate);
    if (viewMode === 'day') curr.setDate(curr.getDate() + 1);
    else if (viewMode === 'week') curr.setDate(curr.getDate() + 7);
    else if (viewMode === 'month') curr.setMonth(curr.getMonth() + 1);
    else curr.setDate(curr.getDate() + 1);
    setSelectedDate(curr.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate('2026-07-26');
  };

  // Color mapper according to rules:
  // Đỏ = Ca trực | Xanh = Làm việc | Cam = Họp | Tím = Đào tạo | Xám = Nghỉ
  const getColorClasses = (color?: ScheduleColor, workType?: WorkType) => {
    const finalType = workType || (color === 'Đỏ' ? 'Ca trực' : color === 'Xanh' ? 'Làm việc' : color === 'Cam' ? 'Họp' : color === 'Tím' ? 'Đào tạo' : 'Nghỉ');
    
    switch (finalType) {
      case 'Ca trực':
        return 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 tag-red';
      case 'Làm việc':
        return 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 tag-blue';
      case 'Họp':
        return 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 tag-orange';
      case 'Đào tạo':
        return 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200 tag-purple';
      case 'Nghỉ':
      default:
        return 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-300 tag-gray';
    }
  };

  const getBadgeColor = (type?: WorkType) => {
    switch (type) {
      case 'Ca trực': return 'bg-rose-600 text-white';
      case 'Làm việc': return 'bg-emerald-600 text-white';
      case 'Họp': return 'bg-amber-500 text-white';
      case 'Đào tạo': return 'bg-purple-600 text-white';
      case 'Nghỉ': return 'bg-slate-500 text-white';
      default: return 'bg-indigo-600 text-white';
    }
  };

  // Filtering shifts
  const filteredShifts = shifts.filter(s => {
    const name = (s.assignedUserName || s.userName || '').toLowerCase();
    const title = (s.title || s.shiftName || '').toLowerCase();
    const room = (s.room || s.roomLocation || '').toLowerCase();
    const machine = (s.machine || '').toLowerCase();
    const search = searchTerm.toLowerCase();

    const matchSearch = !search || name.includes(search) || title.includes(search) || room.includes(search) || machine.includes(search);
    const matchRoom = isRoomMatching(room, filterRoom);
    const matchMachine = filterMachine === 'Tất cả' || machine.includes(filterMachine.toLowerCase());
    const matchRole = filterRole === 'Tất cả' || (filterRole === 'Bác sĩ' && (s.assignedRole?.includes('Bác sĩ') || s.userTitle?.includes('Bác sĩ') || s.assignedRole?.includes('Phó khoa') || s.assignedRole?.includes('Trưởng khoa'))) || (filterRole === 'Kỹ thuật viên' && (s.assignedRole?.includes('Kỹ thuật viên') || s.assignedRole?.includes('KTV')));
    const matchWorkType = filterWorkType === 'Tất cả' || s.workType === filterWorkType;

    return matchSearch && matchRoom && matchMachine && matchRole && matchWorkType;
  });

  // Calculate top statistics
  const todayShifts = shifts.filter(s => s.date === '2026-07-26');
  const tomorrowShifts = shifts.filter(s => s.date === '2026-07-27');
  const pendingSwapRequests = shifts.filter(s => s.swapRequest && s.swapRequest.status === 'Chờ duyệt');

  // Handle Shift Creation/Edit
  const handleOpenCreateModal = (dateStr?: string) => {
    setEditingShift(null);
    setFormData({
      title: 'Phân Công Nhiệm Vụ Cận Lâm Sàng',
      date: dateStr || selectedDate,
      startTime: '07:00',
      endTime: '15:00',
      assignedUserId: users[0]?.id || '',
      room: 'Phòng Xét nghiệm Sinh hóa',
      machine: 'Cobas 8000 (Roche)',
      department: 'Khoa Cận Lâm Sàng - Xét nghiệm',
      workType: 'Làm việc',
      priority: 'Cao',
      color: 'Xanh',
      notes: 'Trực máy chuyên môn & xử lý mẫu bệnh phẩm khẩn',
      recurrence: 'Không'
    });
    setShowShiftModal(true);
  };

  const handleOpenCreateModalForTaskRow = (dateStr: string, row: WorkTaskRow) => {
    setEditingShift(null);
    setFormData({
      title: `${row.name}`,
      date: dateStr,
      startTime: row.defaultTime ? row.defaultTime.split('-')[0]?.trim() || '07:00' : '07:00',
      endTime: row.defaultTime ? row.defaultTime.split('-')[1]?.trim() || '15:00' : '15:00',
      assignedUserId: users[0]?.id || '',
      room: row.room || 'Phòng Xét nghiệm Sinh hóa',
      machine: row.machine || '',
      department: 'Khoa Cận Lâm Sàng',
      workType: row.workType || 'Làm việc',
      priority: 'Cao',
      color: row.color || 'Xanh',
      notes: row.notes || '',
      recurrence: 'Không',
      taskRowId: row.id
    });
    setShowShiftModal(true);
  };

  const handleOpenEditModal = (shift: ShiftDuty) => {
    setEditingShift(shift);
    setFormData({
      title: shift.title || shift.shiftName || 'Ca làm việc',
      date: shift.date,
      startTime: shift.startTime || '07:00',
      endTime: shift.endTime || '15:00',
      assignedUserId: shift.assignedUserId || shift.userId || users[0]?.id || '',
      room: shift.room || shift.roomLocation || 'Phòng Xét nghiệm Sinh hóa',
      machine: shift.machine || '',
      department: shift.department || 'Khoa Cận Lâm Sàng',
      workType: shift.workType || 'Ca trực',
      priority: shift.priority || 'Cao',
      color: shift.color || 'Đỏ',
      notes: shift.notes || '',
      recurrence: shift.recurrence || 'Không',
      taskRowId: shift.taskRowId
    });
    setShowShiftModal(true);
  };

  const handleSaveShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const assignedUser = users.find(u => u.id === formData.assignedUserId);

    const savedShift: ShiftDuty = {
      id: editingShift ? editingShift.id : `SFT-${Date.now().toString().slice(-6)}`,
      title: formData.title,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      shiftName: `${formData.title} (${formData.startTime} - ${formData.endTime})`,
      shiftType: formData.workType,
      shiftTime: `${formData.startTime} - ${formData.endTime}`,
      roleInShift: `${assignedUser?.title || assignedUser?.role || 'KTV'} - Phụ trách chuyên môn`,
      assignedUserId: formData.assignedUserId,
      assignedUserName: assignedUser?.name || 'Chưa phân công',
      assignedRole: assignedUser?.title || assignedUser?.role || 'Nhân viên',
      userId: formData.assignedUserId,
      userName: assignedUser?.name || 'Chưa phân công',
      userTitle: assignedUser?.title || assignedUser?.role || 'Nhân viên',
      phone: assignedUser?.phone || '',
      room: formData.room,
      roomLocation: formData.room,
      machine: formData.machine,
      department: formData.department,
      workType: formData.workType,
      priority: formData.priority,
      color: formData.color,
      status: 'Đã phân công',
      notes: formData.notes,
      recurrence: formData.recurrence,
      taskRowId: formData.taskRowId
    };

    storageService.saveShift(savedShift);
    setShowShiftModal(false);
  };

  const handleDeleteShift = (shiftId: string) => {
    const s = shifts.find(sh => sh.id === shiftId);
    const name = s ? (s.assignedUserName || s.userName) : '';
    storageService.deleteShift(shiftId);
    showToast(`🗑️ Đã xóa phân công ${name ? `của ${name}` : ''} thành công!`, 'success');
  };

  const handleCopyShift = (shift: ShiftDuty) => {
    const copied = storageService.duplicateShift(shift.id);
    if (copied) {
      alert(`Đã sao chép phân công thành công: ${copied.title}`);
    }
  };

  // Shift Swap Logic
  const handleOpenSwapModal = (shift: ShiftDuty) => {
    setSwapTargetShift(shift);
    setSwapTargetUserId('');
    setSwapReason('');
    setShowSwapModal(true);
  };

  const handleSendSwapRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!swapTargetShift || !swapTargetUserId) return;

    const ok = storageService.requestShiftSwap(swapTargetShift.id, swapTargetUserId, swapReason || 'Do công tác đột xuất');
    if (ok) {
      alert('Đã gửi yêu cầu đổi ca thành công tới Trưởng khoa phê duyệt!');
      setShowSwapModal(false);
    }
  };

  const handleApproveSwap = (shiftId: string) => {
    storageService.approveShiftSwap(shiftId);
  };

  const handleRejectSwap = (shiftId: string) => {
    storageService.rejectShiftSwap(shiftId);
  };

  // Drag & Drop Assignment Handlers
  const handleDragStartUser = (e: React.DragEvent, user: User) => {
    e.dataTransfer.setData('type', 'user');
    e.dataTransfer.setData('userId', user.id);
    e.dataTransfer.setData('text/plain', user.id);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggedUser(user);
    setDraggedShift(null);
    setIsStaffPopupOpen(true);
  };

  const handleDragStartShift = (e: React.DragEvent, shift: ShiftDuty) => {
    e.dataTransfer.setData('type', 'shift');
    e.dataTransfer.setData('shiftId', shift.id);
    e.dataTransfer.setData('text/plain', shift.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedShift(shift);
    setDraggedUser(null);
    setIsStaffPopupOpen(true);
  };

  const handleDragEnd = () => {
    setDraggedUser(null);
    setDraggedShift(null);
    setActiveDropCellKey(null);
    setIsTrashOver(false);
  };

  const handleDragOverCell = (e: React.DragEvent, cellKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedShift ? 'move' : 'copy';
    if (activeDropCellKey !== cellKey) {
      setActiveDropCellKey(cellKey);
    }
  };

  const handleDragLeaveCell = (e: React.DragEvent, cellKey: string) => {
    if (activeDropCellKey === cellKey) {
      setActiveDropCellKey(null);
    }
  };

  const handleDropToDeleteShift = (e: React.DragEvent) => {
    e.preventDefault();
    setIsTrashOver(false);
    setActiveDropCellKey(null);
    const type = e.dataTransfer.getData('type');
    const shiftId = e.dataTransfer.getData('shiftId') || e.dataTransfer.getData('text/plain');

    if (type === 'shift' || shiftId) {
      const shiftToDelete = shifts.find(s => s.id === shiftId) || draggedShift;
      if (shiftToDelete) {
        const userName = shiftToDelete.assignedUserName || shiftToDelete.userName || 'nhân sự';
        storageService.deleteShift(shiftToDelete.id);
        showToast(`🗑️ Đã xóa ca phân công của ${userName} khỏi lịch làm việc!`, 'success');
      }
    }
    setDraggedUser(null);
    setDraggedShift(null);
  };

  const handleDropUserOnDate = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    setActiveDropCellKey(null);
    const type = e.dataTransfer.getData('type');
    const userId = e.dataTransfer.getData('userId');
    const shiftId = e.dataTransfer.getData('shiftId');

    const dayShifts = shifts.filter(s => s.date === targetDate);

    if (type === 'shift' || (shiftId && !userId)) {
      const idToMove = shiftId || e.dataTransfer.getData('text/plain');
      const existingShift = shifts.find(s => s.id === idToMove);
      if (existingShift) {
        const personName = existingShift.assignedUserName || existingShift.userName;
        const personId = existingShift.assignedUserId || existingShift.userId;

        const isAlreadyInDate = dayShifts.some(s => s.id !== existingShift.id && (s.assignedUserId === personId || s.userId === personId || s.assignedUserName === personName || s.userName === personName));

        if (isAlreadyInDate) {
          showToast(`⚠️ ${personName} đã có ca trực trong ngày ${targetDate} rồi!`, 'error');
          setDraggedUser(null);
          setDraggedShift(null);
          return;
        }

        const updatedShift: ShiftDuty = {
          ...existingShift,
          date: targetDate
        };
        storageService.saveShift(updatedShift);
        showToast(`Đã di chuyển ca của ${personName} sang ngày ${targetDate}`, 'success');
      }
    } else {
      const uId = userId || e.dataTransfer.getData('text/plain');
      if (!uId) return;

      const assignedUser = users.find(u => u.id === uId);
      if (!assignedUser) return;

      const isAlreadyInDate = dayShifts.some(s => s.assignedUserId === assignedUser.id || s.userId === assignedUser.id || s.assignedUserName === assignedUser.name || s.userName === assignedUser.name);

      if (isAlreadyInDate) {
        showToast(`⚠️ ${assignedUser.name} đã được phân công trong ngày ${targetDate} rồi!`, 'error');
        setDraggedUser(null);
        setDraggedShift(null);
        return;
      }

      const quickShift: ShiftDuty = {
        id: `SFT-${Date.now().toString().slice(-6)}`,
        title: `Phân công - ${assignedUser.name}`,
        date: targetDate,
        startTime: '07:00',
        endTime: '15:00',
        shiftName: 'Ca Sáng (07:00 - 15:00)',
        shiftType: 'Ca Sáng',
        shiftTime: '07:00 - 15:00',
        roleInShift: `${assignedUser.title || assignedUser.role} - Trực Cận Lâm Sàng`,
        assignedUserId: assignedUser.id,
        assignedUserName: assignedUser.name,
        assignedRole: assignedUser.title || assignedUser.role,
        userId: assignedUser.id,
        userName: assignedUser.name,
        userTitle: assignedUser.title || assignedUser.role,
        phone: assignedUser.phone,
        room: assignedUser.room || 'Phòng Xét nghiệm Sinh hóa',
        roomLocation: assignedUser.room || 'Phòng Xét nghiệm Sinh hóa',
        department: 'Khoa Cận Lâm Sàng',
        workType: 'Làm việc',
        priority: 'Cao',
        color: 'Xanh',
        status: 'Đã phân công',
        notes: 'Trưởng khoa kéo thả phân công trực tiếp'
      };

      storageService.saveShift(quickShift);
      showToast(`Đã phân công ${assignedUser.name} vào ngày ${targetDate}`, 'success');
    }

    setDraggedUser(null);
    setDraggedShift(null);
  };

  const handleDropUserOnTaskRowCell = (e: React.DragEvent, targetDate: string, taskRow: WorkTaskRow) => {
    e.preventDefault();
    setActiveDropCellKey(null);
    const type = e.dataTransfer.getData('type');
    const userId = e.dataTransfer.getData('userId');
    const shiftId = e.dataTransfer.getData('shiftId');

    const cellShifts = shifts.filter(s => 
      s.date === targetDate && (s.taskRowId === taskRow.id || (s.title && s.title.includes(taskRow.name)))
    );

    if (type === 'shift' || (shiftId && !userId)) {
      const idToMove = shiftId || e.dataTransfer.getData('text/plain');
      const existingShift = shifts.find(s => s.id === idToMove);
      if (existingShift) {
        const personName = existingShift.assignedUserName || existingShift.userName;
        const personId = existingShift.assignedUserId || existingShift.userId;

        const isAlreadyInCell = cellShifts.some(s => s.id !== existingShift.id && (s.assignedUserId === personId || s.userId === personId || s.assignedUserName === personName || s.userName === personName));

        if (isAlreadyInCell) {
          showToast(`⚠️ ${personName} đã có tên trong ô "${taskRow.name}" ngày ${targetDate} rồi!`, 'error');
          setDraggedUser(null);
          setDraggedShift(null);
          return;
        }

        const updatedShift: ShiftDuty = {
          ...existingShift,
          date: targetDate,
          taskRowId: taskRow.id,
          title: `${taskRow.name} - ${personName}`,
          room: taskRow.room || existingShift.room,
          roomLocation: taskRow.room || existingShift.roomLocation,
          machine: taskRow.machine || existingShift.machine,
          workType: taskRow.workType || existingShift.workType,
          color: taskRow.color || existingShift.color
        };
        storageService.saveShift(updatedShift);
        showToast(`Đã chuyển ca của ${personName} tới "${taskRow.name}" ngày ${targetDate}`, 'success');
      }
    } else {
      const uId = userId || e.dataTransfer.getData('text/plain');
      if (!uId) return;

      const assignedUser = users.find(u => u.id === uId);
      if (!assignedUser) return;

      const isAlreadyInCell = cellShifts.some(s => s.assignedUserId === assignedUser.id || s.userId === assignedUser.id || s.assignedUserName === assignedUser.name || s.userName === assignedUser.name);

      if (isAlreadyInCell) {
        showToast(`⚠️ ${assignedUser.name} đã được phân công trong ô "${taskRow.name}" ngày ${targetDate} rồi!`, 'error');
        setDraggedUser(null);
        setDraggedShift(null);
        return;
      }

      const quickShift: ShiftDuty = {
        id: `SFT-${Date.now().toString().slice(-6)}`,
        title: `${taskRow.name} - ${assignedUser.name}`,
        date: targetDate,
        startTime: taskRow.defaultTime ? taskRow.defaultTime.split('-')[0]?.trim() || '07:00' : '07:00',
        endTime: taskRow.defaultTime ? taskRow.defaultTime.split('-')[1]?.trim() || '15:00' : '15:00',
        shiftName: taskRow.name,
        shiftType: taskRow.workType,
        shiftTime: taskRow.defaultTime || '07:00 - 15:00',
        roleInShift: `${assignedUser.title || assignedUser.role} - ${taskRow.name}`,
        assignedUserId: assignedUser.id,
        assignedUserName: assignedUser.name,
        assignedRole: assignedUser.title || assignedUser.role,
        userId: assignedUser.id,
        userName: assignedUser.name,
        userTitle: assignedUser.title || assignedUser.role,
        phone: assignedUser.phone,
        room: taskRow.room || assignedUser.room || 'Phòng Xét nghiệm Sinh hóa',
        roomLocation: taskRow.room || assignedUser.room || 'Phòng Xét nghiệm Sinh hóa',
        machine: taskRow.machine || '',
        department: 'Khoa Cận Lâm Sàng',
        workType: taskRow.workType || 'Làm việc',
        priority: 'Cao',
        color: taskRow.color || 'Xanh',
        status: 'Đã phân công',
        notes: `Phân công công việc: ${taskRow.name}`,
        taskRowId: taskRow.id
      };

      storageService.saveShift(quickShift);
      showToast(`Đã phân công ${assignedUser.name} vào "${taskRow.name}" ngày ${targetDate}`, 'success');
    }

    setDraggedUser(null);
    setDraggedShift(null);
  };

  // Task Row Management Logic
  const handleOpenCreateTaskRowModal = (rowToEdit?: WorkTaskRow, defaultWorkType?: WorkType) => {
    if (rowToEdit) {
      setEditingTaskRow(rowToEdit);
      setTaskRowFormData({
        name: rowToEdit.name,
        workType: rowToEdit.workType,
        room: rowToEdit.room || 'Phòng Xét nghiệm Sinh hóa',
        machine: rowToEdit.machine || '',
        defaultTime: rowToEdit.defaultTime || '07:00 - 15:00',
        color: rowToEdit.color || 'Xanh',
        notes: rowToEdit.notes || ''
      });
    } else {
      setEditingTaskRow(null);
      const isDuty = defaultWorkType === 'Ca trực';
      setTaskRowFormData({
        name: `${workTaskRows.length + 1}. `,
        workType: defaultWorkType || 'Làm việc',
        room: isDuty ? 'Phòng Trực Khoa Cận Lâm Sàng' : 'Phòng Xét nghiệm Sinh hóa',
        machine: '',
        defaultTime: isDuty ? '17:00 - 07:00' : '07:00 - 15:00',
        color: isDuty ? 'Đỏ' : 'Xanh',
        notes: ''
      });
    }
    setShowTaskRowModal(true);
  };

  const handleSaveTaskRowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskRowFormData.name.trim()) {
      alert('Vui lòng nhập tên công việc!');
      return;
    }

    const rowToSave: WorkTaskRow = {
      id: editingTaskRow ? editingTaskRow.id : `TRow-${Date.now().toString().slice(-6)}`,
      name: taskRowFormData.name.trim(),
      workType: taskRowFormData.workType,
      room: taskRowFormData.room,
      machine: taskRowFormData.machine,
      defaultTime: taskRowFormData.defaultTime,
      color: taskRowFormData.color,
      notes: taskRowFormData.notes,
      createdAt: editingTaskRow?.createdAt || new Date().toISOString()
    };

    storageService.saveWorkTaskRow(rowToSave);
    setShowTaskRowModal(false);
  };

  const handleDeleteTaskRow = (rowId: string, rowName: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa công việc "${rowName}"?\n\nLưu ý quan trọng: Sau khi xóa, khi tạo lịch tuần sau công việc này sẽ KHÔNG còn hiển thị nữa!`)) {
      storageService.deleteWorkTaskRow(rowId);
    }
  };

  const handleResetTaskRows = () => {
    if (window.confirm('Bạn có muốn khôi phục danh mục công việc hàng tuần về mẫu chuẩn ban đầu của Khoa Cận Lâm Sàng?')) {
      storageService.resetWorkTaskRows();
    }
  };

  const handleCopyWeeklyScheduleToNextWeek = () => {
    const mondayStr = currentWeekDays[0];
    if (window.confirm(`Bạn có muốn khởi tạo Lịch Làm Việc Tuần Sau dựa trên danh mục công việc hiện tại?\n\n• Tất cả công việc (tùy chỉnh tên) còn giữ lại sẽ được TỰ ĐỘNG CHUYỂN SANG TUẦN SAU.\n• Các công việc đã XÓA tuần này sẽ KHÔNG hiển thị ở tuần sau.`)) {
      const res = storageService.copyWeeklyScheduleToNextWeek(mondayStr);
      setSelectedDate(res.newWeekMonday);
      alert(`Đã khởi tạo Lịch Làm Việc Tuần Sau (${res.newWeekMonday}) thành công!\nĐã chuyển ${res.createdCount} phân công ca từ danh mục công việc.`);
    }
  };

  // Export iCalendar (.ics file)
  const handleExportICS = () => {
    let icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//CLS WorkHub//Work Schedule//VI\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\nX-WR-CALNAME:Lich_Lam_Viec_Khoa_CLS\n`;

    shifts.forEach(s => {
      const dateClean = s.date.replace(/-/g, '');
      const startClean = (s.startTime || '07:00').replace(':', '') + '00';
      const endClean = (s.endTime || '15:00').replace(':', '') + '00';

      icsContent += `BEGIN:VEVENT\nSUMMARY:${s.title || s.shiftName || 'Ca làm việc Khoa CLS'}\nDESCRIPTION:${s.notes || ''} - Phụ trách: ${s.assignedUserName || s.userName}\nLOCATION:${s.room || s.roomLocation || 'Khoa CLS'}\nDTSTART:${dateClean}T${startClean}\nDTEND:${dateClean}T${endClean}\nSTATUS:CONFIRMED\nEND:VEVENT\n`;
    });

    icsContent += `END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Lich_Lam_Viec_Khoa_CLS.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Excel / CSV
  const handleExportExcel = () => {
    let csv = 'Mã Ca,Tên Công Việc,Ngày,Thời Gian,Phụ Trách,Chức Danh,Phòng,Máy,Loại Công Việc,Mức Ưu Tiên,Trạng Thái\n';
    filteredShifts.forEach(s => {
      csv += `"${s.id}","${s.title || s.shiftName || ''}","${s.date}","${s.startTime || ''}-${s.endTime || ''}","${s.assignedUserName || s.userName || ''}","${s.assignedRole || s.userTitle || ''}","${s.room || ''}","${s.machine || ''}","${s.workType || 'Ca trực'}","${s.priority || 'Trung bình'}","${s.status || 'Đã phân công'}"\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Lich_Lam_Viec_Khoa_CLS_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200">
      
      {/* SECTION 1: Header Banner & Sync Toolbar */}
      <div className="flex flex-col gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs print:hidden">
        <div className="w-full space-y-1">
          <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider mb-1">
            <CalendarCheck2 className="w-4 h-4" />
            <span>Phân Công Lịch Làm Việc Tuần & Quản Lý Danh Mục Công Việc</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Lịch Làm Việc Tuần - Khoa Cận Lâm Sàng
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tùy chỉnh tên công việc theo hàng, kéo thả phân công nhân sự, tự động chuyển danh mục công việc sang tuần sau trừ công việc đã xóa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          {pendingSwapRequests.length > 0 && (
            <button
              onClick={() => setShowSwapApprovalDrawer(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-1.5 animate-pulse"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Duyệt Đổi Ca ({pendingSwapRequests.length})</span>
            </button>
          )}

          <button
            onClick={() => handleOpenCreateTaskRowModal()}
            className="px-3.5 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-bold rounded-xl border border-indigo-200 dark:border-indigo-800 transition-all flex items-center space-x-1.5"
          >
            <ListPlus className="w-4 h-4" />
            <span>Thêm Hàng Công Việc</span>
          </button>

          <button
            onClick={() => setIsStaffPopupOpen(!isStaffPopupOpen)}
            title="Bật/Tắt thanh nhân sự kéo thả phía dưới màn hình"
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 ${
              isStaffPopupOpen 
                ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400' 
                : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Kéo Thả Nhân Sự {isStaffPopupOpen ? '(Đang hiện)' : '(Bấm mở)'}</span>
          </button>

          <button
            onClick={handleCopyWeeklyScheduleToNextWeek}
            title="Tự động khởi tạo lịch tuần sau kề thừa danh mục công việc hiện tại (loại bỏ công việc đã xóa)"
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-1.5"
          >
            <Forward className="w-4 h-4" />
            <span>Tạo Lịch Tuần Sau</span>
          </button>

          <button
            onClick={handleExportICS}
            title="Đồng bộ Google Calendar & Outlook (.ics)"
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center space-x-1.5"
          >
            <CalendarIcon className="w-4 h-4 text-blue-600" />
            <span>Xuất Calendar</span>
          </button>

          <button
            onClick={handleExportExcel}
            title="Xuất file Excel / CSV"
            className="px-3.5 py-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-semibold rounded-xl border border-emerald-200 dark:border-emerald-800 transition-all flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Xuất Excel</span>
          </button>

          <button
            onClick={handlePrint}
            title="In lịch làm việc"
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>In Lịch</span>
          </button>
        </div>
      </div>

      {/* SECTION 4: View Toggles & Multi-Dimensional Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 print:hidden">
        
        {/* Row 1: View Modes & Date Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          
          {/* View Mode Buttons */}
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'day' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Ngày (Day)
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'week' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Lịch Làm Việc Tuần
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'month' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Tháng (Month)
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'timeline' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Timeline Máy & Phòng
            </button>
          </div>

          {/* Date Picker & Prev/Next */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevDate}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleToday}
              className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg hover:bg-slate-200"
            >
              Hôm nay
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200"
            />

            <button
              onClick={handleNextDate}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Row 2: Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên NV, máy, phòng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
            >
              <option value="Tất cả">-- Tất cả phòng làm việc (Đồng bộ Sheet) --</option>
              {syncedRooms.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterMachine}
              onChange={(e) => setFilterMachine(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
            >
              <option value="Tất cả">-- Tất cả thiết bị máy --</option>
              <option value="Cobas">Cobas 8000 (Roche)</option>
              <option value="Sysmex">Sysmex XN-1000</option>
              <option value="Somatom">Somatom 128 (Siemens)</option>
              <option value="Signa">Signa Pioneer 3.0T (GE)</option>
              <option value="Vivid">Vivid E95 4D (GE)</option>
            </select>
          </div>

          <div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
            >
              <option value="Tất cả">-- Tất cả chức danh --</option>
              <option value="Bác sĩ">Bác sĩ chuyên khoa</option>
              <option value="Kỹ thuật viên">Kỹ thuật viên (KTV)</option>
            </select>
          </div>

          <div>
            <select
              value={filterWorkType}
              onChange={(e) => setFilterWorkType(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
            >
              <option value="Tất cả">-- Tất cả loại công việc --</option>
              <option value="Ca trực">Ca trực (🔴)</option>
              <option value="Làm việc">Làm việc chuyên môn (🟢)</option>
              <option value="Họp">Họp giao ban (🟠)</option>
              <option value="Đào tạo">Đào tạo (🟣)</option>
              <option value="Nghỉ">Nghỉ phép (⚪)</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 5: Main Calendar View Displays */}

      {/* WEEK VIEW (Calendar & Work Task Matrix View) */}
      {viewMode === 'week' && (
        <div className="space-y-4">
          
          {/* Week Sub-view Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs print:hidden">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Chế độ hiển thị tuần:</span>
              <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setWeekSubView('table')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 ${
                    weekSubView === 'table' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Ma Trận Danh Mục Công Việc (Hàng Tuần)</span>
                </button>
                <button
                  onClick={() => setWeekSubView('cards')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 ${
                    weekSubView === 'cards' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600'
                  }`}
                >
                  <CalendarCheck2 className="w-3.5 h-3.5" />
                  <span>Thẻ Lịch Theo Ngày</span>
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleResetTaskRows}
                title="Khôi phục danh mục công việc chuẩn ban đầu"
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center space-x-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục mẫu</span>
              </button>
            </div>
          </div>

          {/* MODE A: Task Category Rows Matrix View (2 Separate Tables: Work Assignments Top, Duty Shifts Bottom) */}
          {weekSubView === 'table' && (() => {
            const assignmentTaskRows = workTaskRows.filter(r => r.workType !== 'Ca trực');
            const dutyTaskRows = workTaskRows.filter(r => r.workType === 'Ca trực');

            const renderTaskRowTable = (rows: WorkTaskRow[], isDutyTable: boolean) => (
              <div 
                onClick={() => !isStaffPopupOpen && setIsStaffPopupOpen(true)}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
              >
                {/* Table Header Banner */}
                <div className={`p-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  isDutyTable 
                    ? 'bg-rose-50/90 dark:bg-rose-950/50 border-rose-200/80 dark:border-rose-800/80' 
                    : 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-800/80'
                }`}>
                  <div className="flex items-center space-x-2.5">
                    <div className={`w-8 h-8 rounded-xl text-white flex items-center justify-center font-bold shadow-xs shrink-0 ${
                      isDutyTable ? 'bg-rose-600' : 'bg-emerald-600'
                    }`}>
                      {isDutyTable ? <Clock className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{isDutyTable ? '2. LỊCH TRỰC KHOA & CẤP CỨU TRONG TUẦN' : '1. LỊCH PHÂN CÔNG CÔNG TÁC TRONG TUẦN'}</span>
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full border ${
                          isDutyTable 
                            ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-700' 
                            : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700'
                        }`}>
                          {rows.length} {isDutyTable ? 'ca trực' : 'danh mục công việc'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {isDutyTable 
                          ? 'Kíp trực 24/7, Trực Cấp cứu khẩn, Trực vận hành hệ thống đêm & Ngày nghỉ' 
                          : 'Vận hành chuyên môn, Phòng xét nghiệm / CĐHA, Kiểm chuẩn ISO 15189, Họp & Đào tạo'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenCreateTaskRowModal(undefined, isDutyTable ? 'Ca trực' : 'Làm việc')}
                    className={`px-3 py-1.5 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 shrink-0 ${
                      isDutyTable ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isDutyTable ? 'Thêm Hàng Ca Trực' : 'Thêm Hàng Công Việc'}</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-xs font-bold border-b border-slate-200 dark:border-slate-700">
                        <th className="p-3 w-[280px] border-r border-slate-200 dark:border-slate-700">
                          <span className="uppercase tracking-wider">{isDutyTable ? 'DANH MỤC CA TRỰC' : 'DANH MỤC CÔNG VIỆC'}</span>
                        </th>
                        {currentWeekDays.map((dateStr) => {
                          const d = new Date(dateStr);
                          const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                          const isToday = dateStr === '2026-07-26';
                          return (
                            <th
                              key={dateStr}
                              className={`p-3 text-center border-r last:border-r-0 border-slate-200 dark:border-slate-700 ${
                                isToday ? 'bg-indigo-100/70 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300' : ''
                              }`}
                            >
                              <p className="uppercase text-[11px] font-bold">{dayNames[d.getDay()]}</p>
                              <p className="text-sm font-extrabold">{d.getDate()}/{d.getMonth() + 1}</p>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            {isDutyTable 
                              ? 'Chưa có danh mục ca trực nào. Bấm "+ Thêm Hàng Ca Trực" để tạo!' 
                              : 'Chưa có danh mục phân công công tác nào. Bấm "+ Thêm Hàng Công Việc" để tạo!'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            
                            {/* Task Row Title & Actions */}
                            <td className="p-3 border-r border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 align-top space-y-1.5">
                              <div className="flex items-start justify-between gap-1">
                                <h4 className="font-bold text-slate-900 dark:text-slate-100 leading-snug">
                                  {row.name}
                                </h4>
                                <div className="flex items-center space-x-1 shrink-0">
                                  <button
                                    onClick={() => handleOpenCreateTaskRowModal(row)}
                                    title="Chỉnh sửa tên công việc & thuộc tính hàng"
                                    className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTaskRow(row.id, row.name)}
                                    title="Xóa công việc (Nếu xóa, khi tạo lịch tuần sau sẽ KHÔNG hiển thị nữa)"
                                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                                <span className={`px-1.5 py-0.5 font-bold rounded ${getBadgeColor(row.workType)}`}>
                                  {row.workType}
                                </span>
                                {row.room && (
                                  <span className="px-1.5 py-0.5 bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-mono truncate max-w-[130px]">
                                    📍 {row.room}
                                  </span>
                                )}
                              </div>

                              {row.defaultTime && (
                                <p className="text-[10px] text-slate-500 font-mono">
                                  ⏱️ {row.defaultTime}
                                </p>
                              )}
                            </td>

                            {/* Weekday columns for this task row */}
                            {currentWeekDays.map((dateStr) => {
                              const cellKey = `${dateStr}-${row.id}`;
                              const isTargetOver = activeDropCellKey === cellKey;
                              const cellShifts = filteredShifts.filter(s => 
                                s.date === dateStr && (s.taskRowId === row.id || (s.title && s.title.includes(row.name)))
                              );

                              return (
                                <td
                                  key={dateStr}
                                  onDragOver={(e) => handleDragOverCell(e, cellKey)}
                                  onDragLeave={(e) => handleDragLeaveCell(e, cellKey)}
                                  onDrop={(e) => handleDropUserOnTaskRowCell(e, dateStr, row)}
                                  className={`p-2 border-r last:border-r-0 border-slate-200 dark:border-slate-800 align-top space-y-1.5 min-w-[145px] transition-all relative ${
                                    isTargetOver ? 'bg-indigo-100/90 dark:bg-indigo-950/90 ring-2 ring-indigo-500 ring-inset border-indigo-400' : 'hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10'
                                  }`}
                                >
                                  {isTargetOver && (
                                    <div className="p-1.5 bg-indigo-600 text-white text-[10px] font-extrabold rounded-lg text-center animate-bounce shadow-md">
                                      ✨ Thả nhân sự vào đây
                                    </div>
                                  )}

                                  {cellShifts.map(shift => {
                                    const isShiftDragged = draggedShift?.id === shift.id;
                                    return (
                                      <div
                                        key={shift.id}
                                        draggable
                                        onDragStart={(e) => handleDragStartShift(e, shift)}
                                        onDragEnd={handleDragEnd}
                                        className={`p-2 rounded-xl border text-xs shadow-2xs space-y-1 relative group transition-all cursor-grab active:cursor-grabbing ${
                                          isShiftDragged ? 'opacity-40 border-dashed border-indigo-500 scale-95' : getColorClasses(shift.color, shift.workType)
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-1">
                                          <span className="font-bold text-slate-900 dark:text-slate-100 leading-tight whitespace-normal break-words">
                                            {shift.assignedUserName || shift.userName || 'Chưa phân công'}
                                          </span>
                                          <span className="text-[9px] font-mono opacity-80 shrink-0">
                                            {shift.startTime || '07:00'}
                                          </span>
                                        </div>

                                        <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight whitespace-normal break-words">
                                          {shift.assignedRole || shift.userTitle || 'KTV'}
                                        </p>

                                        {shift.swapRequest && (
                                          <span className="text-[9px] font-bold text-amber-600 block">
                                            🔄 Đổi ca: {shift.swapRequest.status}
                                          </span>
                                        )}

                                        {/* Quick action overlay */}
                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-0.5 bg-white/90 dark:bg-slate-900/90 p-0.5 rounded-md shadow-xs border border-slate-200 dark:border-slate-700">
                                          <button
                                            onClick={() => handleOpenEditModal(shift)}
                                            title="Chỉnh sửa phân công"
                                            className="p-0.5 hover:text-indigo-600"
                                          >
                                            <Edit3 className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteShift(shift.id)}
                                            title="Xóa phân công"
                                            className="p-0.5 hover:text-rose-600"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  <button
                                    onClick={() => handleOpenCreateModalForTaskRow(dateStr, row)}
                                    className="w-full py-1 border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-lg text-[10px] text-slate-400 hover:text-indigo-600 transition-all flex items-center justify-center space-x-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Phân công</span>
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );

            return (
              <div className="space-y-6">
                {/* BẢNG 1: LỊCH PHÂN CÔNG CÔNG TÁC TRONG TUẦN */}
                {renderTaskRowTable(assignmentTaskRows, false)}

                {/* BẢNG 2: LỊCH TRỰC KHOA & CẤP CỨU TRONG TUẦN */}
                {renderTaskRowTable(dutyTaskRows, true)}
              </div>
            );
          })()}

          {/* MODE B: Traditional 7-Column Day Cards View */}
          {weekSubView === 'cards' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto">
              <div className="grid grid-cols-7 min-w-[800px] border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                {currentWeekDays.map((dateStr) => {
                  const d = new Date(dateStr);
                  const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                  const isToday = dateStr === '2026-07-26';

                  return (
                    <div
                      key={dateStr}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropUserOnDate(e, dateStr)}
                      className={`p-3 text-center border-r last:border-r-0 border-slate-200 dark:border-slate-800 ${
                        isToday ? 'bg-indigo-50/80 dark:bg-indigo-950/60' : ''
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-500 uppercase">{dayNames[d.getDay()]}</p>
                      <p className={`text-base font-extrabold mt-0.5 ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {d.getDate()}/{d.getMonth() + 1}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-7 min-w-[800px] min-h-[450px] divide-x divide-slate-200 dark:divide-slate-800">
                {currentWeekDays.map((dateStr) => {
                  const dayShifts = filteredShifts.filter(s => s.date === dateStr);
                  const isToday = dateStr === '2026-07-26';
                  const cellKey = dateStr;
                  const isTargetOver = activeDropCellKey === cellKey;

                  return (
                    <div
                      key={dateStr}
                      onDragOver={(e) => handleDragOverCell(e, cellKey)}
                      onDragLeave={(e) => handleDragLeaveCell(e, cellKey)}
                      onDrop={(e) => handleDropUserOnDate(e, dateStr)}
                      className={`p-2 space-y-2 transition-all relative ${
                        isTargetOver ? 'bg-indigo-100/90 dark:bg-indigo-950/80 ring-2 ring-indigo-500 ring-inset' : isToday ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      {isTargetOver && (
                        <div className="p-1.5 bg-indigo-600 text-white text-[10px] font-extrabold rounded-lg text-center animate-bounce shadow-md">
                          ✨ Thả nhân sự vào đây
                        </div>
                      )}

                      {dayShifts.map(shift => {
                        const isShiftDragged = draggedShift?.id === shift.id;
                        return (
                          <div
                            key={shift.id}
                            draggable
                            onDragStart={(e) => handleDragStartShift(e, shift)}
                            onDragEnd={handleDragEnd}
                            className={`p-2.5 rounded-xl border text-xs shadow-2xs space-y-1.5 relative group transition-all cursor-grab active:cursor-grabbing ${
                              isShiftDragged ? 'opacity-40 border-dashed border-indigo-500 scale-95' : getColorClasses(shift.color, shift.workType)
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${getBadgeColor(shift.workType)}`}>
                                {shift.workType || 'Ca trực'}
                              </span>
                              <span className="text-[10px] font-mono opacity-80">
                                {shift.startTime || '07:00'} - {shift.endTime || '15:00'}
                              </span>
                            </div>

                            <h4 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">
                              {shift.title || shift.shiftName}
                            </h4>

                            <div className="flex items-start space-x-1.5 pt-0.5">
                              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                                {(shift.assignedUserName || shift.userName || 'KTV').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-semibold text-slate-900 dark:text-slate-100 leading-tight whitespace-normal break-words">{shift.assignedUserName || shift.userName}</span>
                            </div>

                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              📍 {shift.room || shift.roomLocation}
                            </p>

                            {shift.machine && shift.machine !== 'N/A' && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                🖥️ {shift.machine}
                              </p>
                            )}

                            {shift.swapRequest && (
                              <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded font-bold ${
                                  shift.swapRequest.status === 'Chờ duyệt' ? 'bg-amber-100 text-amber-800' :
                                  shift.swapRequest.status === 'Đã duyệt' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  Đổi ca: {shift.swapRequest.status}
                                </span>
                              </div>
                            )}

                            {/* Hover Action buttons */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 bg-white/90 dark:bg-slate-900/90 p-1 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
                              <button
                                onClick={() => handleOpenEditModal(shift)}
                                title="Sửa ca"
                                className="p-1 hover:text-indigo-600"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCopyShift(shift)}
                                title="Sao chép ca"
                                className="p-1 hover:text-emerald-600"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenSwapModal(shift)}
                                title="Đổi người trực"
                                className="p-1 hover:text-amber-600"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteShift(shift.id)}
                                title="Xóa ca"
                                className="p-1 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      <button
                        onClick={() => handleOpenCreateModal(dateStr)}
                        className="w-full py-1.5 border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl text-[11px] text-slate-400 hover:text-indigo-600 transition-all flex items-center justify-center space-x-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Thêm Ca</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DAY VIEW */}
      {viewMode === 'day' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Chi Tiết Lịch Phân Công Ngày {selectedDate}
              </h3>
              <p className="text-xs text-slate-500">Danh sách các ca phân công, trực máy, họp và đào tạo trong ngày</p>
            </div>
            <button
              onClick={() => handleOpenCreateModal(selectedDate)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Phân Công Trong Ngày</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredShifts.filter(s => s.date === selectedDate).length === 0 ? (
              <div className="col-span-2 p-8 text-center text-slate-400 italic">
                Chưa có lịch phân công cho ngày này. Bấm <strong>"+ Phân Công Trong Ngày"</strong> để thêm mới!
              </div>
            ) : (
              filteredShifts.filter(s => s.date === selectedDate).map(shift => (
                <div key={shift.id} className={`p-4 rounded-2xl border shadow-xs space-y-2 relative ${getColorClasses(shift.color, shift.workType)}`}>
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${getBadgeColor(shift.workType)}`}>
                      {shift.workType || 'Ca trực'}
                    </span>
                    <span className="text-xs font-mono font-bold">
                      ⏱️ {shift.startTime || '07:00'} - {shift.endTime || '15:00'}
                    </span>
                  </div>

                  <h4 className="text-sm font-extrabold">{shift.title || shift.shiftName}</h4>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <p>👤 <strong>{shift.assignedUserName || shift.userName}</strong> ({shift.assignedRole || shift.userTitle})</p>
                    <p>📍 <strong>{shift.room || shift.roomLocation}</strong></p>
                    {shift.machine && <p colSpan={2}>🖥️ Thiết bị: <strong>{shift.machine}</strong></p>}
                  </div>

                  {shift.notes && <p className="text-xs italic text-slate-600 dark:text-slate-400">📝 {shift.notes}</p>}

                  <div className="pt-2 flex items-center justify-end space-x-2">
                    <button onClick={() => handleOpenEditModal(shift)} className="px-2.5 py-1 bg-white dark:bg-slate-800 border rounded-lg text-xs font-bold hover:text-indigo-600">
                      Sửa
                    </button>
                    <button onClick={() => handleDeleteShift(shift.id)} className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg text-xs font-bold hover:bg-rose-200">
                      Xóa
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Tổng Quan Lịch Làm Việc Tháng {selectedDate.slice(0, 7)}
            </h3>
            <span className="text-xs font-bold text-slate-500">Hiển thị lịch phân công theo tháng</span>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => (
              <div key={d} className="p-2 text-center text-xs font-bold text-slate-400">{d}</div>
            ))}

            {Array.from({ length: 31 }, (_, i) => {
              const dayNum = i + 1;
              const dateStr = `2026-07-${dayNum < 10 ? '0' + dayNum : dayNum}`;
              const dayShifts = filteredShifts.filter(s => s.date === dateStr);
              const isToday = dateStr === '2026-07-26';

              return (
                <div
                  key={dateStr}
                  onClick={() => { setSelectedDate(dateStr); setViewMode('day'); }}
                  className={`min-h-[85px] p-1.5 border rounded-xl hover:border-indigo-400 transition-all cursor-pointer ${
                    isToday ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-300' : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <p className={`text-xs font-bold text-right ${isToday ? 'text-indigo-600 font-extrabold' : 'text-slate-600'}`}>{dayNum}</p>
                  <div className="space-y-1 mt-1">
                    {dayShifts.slice(0, 2).map(s => (
                      <div key={s.id} className={`text-[10px] p-1 rounded font-semibold truncate ${getColorClasses(s.color, s.workType)}`}>
                        {s.assignedUserName || s.userName}
                      </div>
                    ))}
                    {dayShifts.length > 2 && (
                      <p className="text-[9px] text-slate-400 font-bold text-center">+{dayShifts.length - 2} ca nữa</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TIMELINE VIEW */}
      {viewMode === 'timeline' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 overflow-x-auto">
          <div className="flex items-center justify-between pb-3 border-b mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Dòng Thời Gian Phân Công Máy & Phòng Làm Việc ({selectedDate})
            </h3>
            <span className="text-xs text-slate-500 font-mono">07:00 - 23:00</span>
          </div>

          <div className="min-w-[750px] space-y-3">
            {['Phòng Xét nghiệm Sinh hóa', 'Phòng CĐHA - Máy CT 128 lát', 'Phòng CĐHA - Máy MRI 3.0T', 'Phòng Xét nghiệm Vi sinh', 'Phòng Siêu âm 02'].map(room => {
              const roomShifts = filteredShifts.filter(s => (s.room || s.roomLocation || '').includes(room) || room.includes(s.room || ''));

              return (
                <div key={room} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">🏢 {room}</p>
                  <div className="flex items-center space-x-2">
                    {roomShifts.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">Trống lịch vận hành</span>
                    ) : (
                      roomShifts.map(s => (
                        <div key={s.id} className={`px-3 py-2 rounded-lg border text-xs shadow-2xs font-bold ${getColorClasses(s.color, s.workType)}`}>
                          <p>{s.assignedUserName || s.userName}</p>
                          <p className="text-[10px] text-slate-500">{s.startTime || '07:00'} - {s.endTime || '15:00'} ({s.workType})</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 6: Bottom Summary Roster Panels */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
        
        {/* Card 1: Hôm nay ai trực / làm việc */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-indigo-200/80 dark:border-indigo-900/60 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
              Hôm Nay (26/07)
            </span>
            <span className="text-xs font-extrabold px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 rounded-md">
              {todayShifts.length} Ca
            </span>
          </div>
          <div className="mt-3 space-y-2 max-h-36 overflow-y-auto pr-1">
            {todayShifts.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa có ca phân công hôm nay</p>
            ) : (
              todayShifts.map(s => (
                <div key={s.id} className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-xl">
                  <div className="truncate pr-2">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{s.assignedUserName || s.userName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{s.title || s.shiftName}</p>
                  </div>
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded shrink-0 ${getBadgeColor(s.workType)}`}>
                    {s.workType || 'Ca trực'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card 2: Ngày mai ai trực / làm việc */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              Ngày Mai (27/07)
            </span>
            <span className="text-xs font-extrabold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md">
              {tomorrowShifts.length} Ca
            </span>
          </div>
          <div className="mt-3 space-y-2 max-h-36 overflow-y-auto pr-1">
            {tomorrowShifts.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa phân công ca ngày mai</p>
            ) : (
              tomorrowShifts.map(s => (
                <div key={s.id} className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-xl">
                  <div className="truncate pr-2">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{s.assignedUserName || s.userName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{s.title || s.shiftName}</p>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    {s.room || s.roomLocation}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card 3: Thống kê danh mục công việc */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-emerald-200/80 dark:border-emerald-900/60 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              Danh Mục Công Việc
            </span>
            <span className="text-xs font-extrabold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-md">
              {workTaskRows.length} Hàng
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>📋 Tổng công việc tuần: <strong className="text-slate-800 dark:text-slate-200">{workTaskRows.length} danh mục</strong></p>
            <p>🔄 Kế thừa tuần sau: <strong className="text-emerald-600 dark:text-emerald-400">Tự động duy trì</strong></p>
            <p>🗑️ Đã xóa: <strong className="text-rose-500">Tự loại bỏ tuần sau</strong></p>
          </div>
        </div>

        {/* Card 4: Màu Quy Định Legend */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-indigo-500" />
              Quy Định Loại Công Việc
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Đỏ: Ca trực
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Xanh: Làm việc
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Cam: Họp
            </span>
            <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Tím: Đào tạo
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span> Xám: Nghỉ
            </span>
          </div>
        </div>
      </div>

      {/* MODAL 1: Task Row Customization Modal */}
      {showTaskRowModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <ListPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingTaskRow ? 'Tùy Chỉnh Tên Hàng Công Việc' : 'Thêm Hàng Công Việc Mới'}
                </h3>
              </div>
              <button onClick={() => setShowTaskRowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTaskRowSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên Công Việc / Danh Mục Hàng Tuần *
                </label>
                <input
                  type="text"
                  required
                  value={taskRowFormData.name}
                  onChange={(e) => setTaskRowFormData({ ...taskRowFormData, name: e.target.value })}
                  placeholder="VD: 1. Trực Vận Hành Máy Sinh Hóa Cobas 8000"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Tên công việc này sẽ hiển thị ở cột bên trái của lịch làm việc hàng tuần.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Loại công việc</label>
                  <select
                    value={taskRowFormData.workType}
                    onChange={(e) => setTaskRowFormData({ ...taskRowFormData, workType: e.target.value as WorkType })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  >
                    <option value="Ca trực">Ca trực (🔴)</option>
                    <option value="Làm việc">Làm việc (🟢)</option>
                    <option value="Họp">Họp giao ban (🟠)</option>
                    <option value="Đào tạo">Đào tạo (🟣)</option>
                    <option value="Nghỉ">Nghỉ (⚪)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Màu sắc mặc định</label>
                  <select
                    value={taskRowFormData.color}
                    onChange={(e) => setTaskRowFormData({ ...taskRowFormData, color: e.target.value as ScheduleColor })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  >
                    <option value="Xanh">Xanh (Làm việc)</option>
                    <option value="Đỏ">Đỏ (Ca trực)</option>
                    <option value="Cam">Cam (Họp)</option>
                    <option value="Tím">Tím (Đào tạo)</option>
                    <option value="Xám">Xám (Nghỉ)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phòng / Bộ phận phụ trách</label>
                  <select
                    value={taskRowFormData.room}
                    onChange={(e) => setTaskRowFormData({ ...taskRowFormData, room: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {syncedRooms.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Khung giờ mặc định</label>
                  <input
                    type="text"
                    value={taskRowFormData.defaultTime}
                    onChange={(e) => setTaskRowFormData({ ...taskRowFormData, defaultTime: e.target.value })}
                    placeholder="VD: 07:00 - 15:00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ghi chú / Lưu ý quy trình</label>
                <textarea
                  rows={2}
                  value={taskRowFormData.notes}
                  onChange={(e) => setTaskRowFormData({ ...taskRowFormData, notes: e.target.value })}
                  placeholder="Ghi chú yêu cầu kỹ thuật hoặc quy chuẩn..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold resize-none"
                />
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 flex items-start space-x-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Danh mục công việc này sẽ được giữ nguyên cho các tuần kế tiếp khi tạo lịch tuần mới. Nếu quý vị xóa công việc này, tuần sau công việc đó sẽ không xuất hiện nữa.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTaskRowModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Lưu Danh Mục Công Việc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create / Edit Shift Modal */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingShift ? 'Chỉnh Sửa Phân Công Ca Làm Việc' : 'Tạo Phân Công Ca Làm Việc Mới'}
              </h3>
              <button onClick={() => setShowShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShiftSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tên Công Việc / Ca Làm Việc</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="VD: Trực Vận Hành Hệ Thống Xét Nghiệm Sinh Hóa"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Người phụ trách</label>
                  <select
                    required
                    value={formData.assignedUserId}
                    onChange={(e) => setFormData({ ...formData, assignedUserId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  >
                    <option value="">-- Chọn Nhân viên --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.title || u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ngày làm việc</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Giờ bắt đầu</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Giờ kết thúc</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Loại công việc</label>
                  <select
                    value={formData.workType}
                    onChange={(e) => setFormData({ ...formData, workType: e.target.value as WorkType })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  >
                    <option value="Ca trực">Ca trực (🔴)</option>
                    <option value="Làm việc">Làm việc (🟢)</option>
                    <option value="Họp">Họp giao ban (🟠)</option>
                    <option value="Đào tạo">Đào tạo (🟣)</option>
                    <option value="Nghỉ">Nghỉ (⚪)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Hàng công việc liên kết</label>
                  <select
                    value={formData.taskRowId || ''}
                    onChange={(e) => setFormData({ ...formData, taskRowId: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  >
                    <option value="">-- Chọn danh mục công việc --</option>
                    {workTaskRows.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phòng làm việc (Đồng bộ Sheet)</label>
                  <select
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {syncedRooms.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Máy / Thiết bị</label>
                  <input
                    type="text"
                    value={formData.machine}
                    onChange={(e) => setFormData({ ...formData, machine: e.target.value })}
                    placeholder="VD: Cobas 8000"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ghi chú phân công</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ghi chú yêu cầu nhiệm vụ..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Lưu Phân Công Ca
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Shift Swap Request Modal */}
      {showSwapModal && swapTargetShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Yêu Cầu Đổi Ca Trực</h3>
              </div>
              <button onClick={() => setShowSwapModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendSwapRequest} className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 text-xs">
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  {swapTargetShift.title || swapTargetShift.shiftName}
                </p>
                <p className="text-amber-700 dark:text-amber-300 text-[11px] mt-0.5">
                  Ngày: {swapTargetShift.date} ({swapTargetShift.startTime || '07:00'} - {swapTargetShift.endTime || '15:00'})
                </p>
                <p className="text-slate-500 text-[11px]">
                  Người trực hiện tại: <strong>{swapTargetShift.assignedUserName || swapTargetShift.userName}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn người tiếp nhận ca trực thay *
                </label>
                <select
                  required
                  value={swapTargetUserId}
                  onChange={(e) => setSwapTargetUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Chọn nhân viên thay thế --</option>
                  {users.filter(u => u.id !== (swapTargetShift.assignedUserId || swapTargetShift.userId)).map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.title || u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Lý do xin đổi ca</label>
                <textarea
                  rows={2}
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  placeholder="Nhập lý do đổi ca (VD: Đi công tác đột xuất, bận việc gia đình...)"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSwapModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Gửi Đổi Ca
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER: Shift Swap Approval Drawer for Trưởng Khoa */}
      {showSwapApprovalDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md h-full p-6 border-l border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Phê Duyệt Đổi Ca Trực Khoa
                </h3>
              </div>
              <button onClick={() => setShowSwapApprovalDrawer(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {pendingSwapRequests.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-8">
                  Không có yêu cầu đổi ca nào đang chờ phê duyệt.
                </p>
              ) : (
                pendingSwapRequests.map(s => {
                  const req = s.swapRequest;
                  if (!req) return null;

                  return (
                    <div key={s.id} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{req.shiftTitle}</span>
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">Chờ duyệt</span>
                      </div>

                      <p className="text-slate-500 text-[11px]">🗓️ Ngày: {req.shiftDate}</p>

                      <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                        <p>👤 Người xin đổi: <strong>{req.requesterName}</strong></p>
                        <p>➡️ Chuyển sang cho: <strong className="text-emerald-600 dark:text-emerald-400">{req.targetUserName}</strong></p>
                        <p className="text-[11px] text-slate-500 italic">💬 Lý do: "{req.reason}"</p>
                      </div>

                      <div className="flex items-center justify-end space-x-2 pt-1">
                        <button
                          onClick={() => handleRejectSwap(s.id)}
                          className="px-3 py-1.5 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-100 rounded-xl font-bold text-xs"
                        >
                          Từ Chối
                        </button>
                        <button
                          onClick={() => handleApproveSwap(s.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-xs"
                        >
                          Chấp Nhận Đổi Ca
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Popup: Staff Drag & Drop Drawer */}
      {isStaffPopupOpen && (
        <div 
          onDragOver={(e) => {
            if (draggedShift) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (!isTrashOver) setIsTrashOver(true);
            }
          }}
          onDragLeave={() => setIsTrashOver(false)}
          onDrop={(e) => {
            if (draggedShift) {
              handleDropToDeleteShift(e);
            }
          }}
          className={`fixed bottom-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 max-w-5xl w-[calc(100%-1.5rem)] sm:w-full p-3.5 rounded-2xl border-2 shadow-2xl transition-all print:hidden backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200 ${
            draggedShift && isTrashOver 
              ? 'bg-rose-100/95 dark:bg-rose-950/95 border-rose-500 ring-4 ring-rose-400' 
              : draggedShift 
              ? 'bg-amber-50/95 dark:bg-amber-950/95 border-amber-400 dark:border-amber-700'
              : 'bg-white/95 dark:bg-slate-900/95 border-indigo-500/90 dark:border-indigo-600'
          }`}
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2.5 mb-2.5 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 text-indigo-900 dark:text-indigo-200 text-xs font-extrabold">
              {draggedShift ? (
                <>
                  <Trash2 className="w-4 h-4 text-rose-600 animate-bounce" />
                  <span className="text-rose-700 dark:text-rose-300 font-bold">THẢ CA LÀM VIỆC VÀO ĐÂY ĐỂ HỦY / XÓA PHÂN CÔNG</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                  <span className="uppercase tracking-wider">DANH SÁCH NHÂN SỰ KÉO THẢ PHÂN CÔNG</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800 shrink-0">
                    {filteredPopupUsers.length} / {users.length} cán bộ
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {/* Dropdown Menu Chọn Phòng / Bộ Phận */}
              <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 hidden sm:inline">Phòng / Bộ phận:</span>
                <select
                  value={popupFilterRoom}
                  onChange={(e) => setPopupFilterRoom(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer max-w-[240px] truncate"
                  title="Chọn phòng / bộ phận để lọc danh sách nhân sự kéo thả"
                >
                  <option value="Tất cả">-- Tất cả Phòng / Bộ phận --</option>
                  {syncedRooms.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hidden lg:inline">
                {draggedShift ? '🗑️ Nhả chuột để xóa ca' : '💡 Nhấp giữ & kéo thẻ tên vào các ô trong bảng'}
              </span>
              <button
                onClick={() => setIsStaffPopupOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center space-x-1"
                title="Thu gọn popup danh sách nhân sự"
              >
                <X className="w-4 h-4" />
                <span className="text-[10px] font-bold pr-1">Đóng</span>
              </button>
            </div>
          </div>

          {/* Draggable Staff List */}
          <div className="flex items-center space-x-2.5 overflow-x-auto pb-1.5 pt-1 scrollbar-thin">
            {filteredPopupUsers.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 italic px-2">
                Không tìm thấy nhân sự nào thuộc phòng/bộ phận "{popupFilterRoom}".
              </p>
            ) : (
              filteredPopupUsers.map(u => {
                const isBeingDragged = draggedUser?.id === u.id;
                return (
                  <div
                    key={u.id}
                    draggable
                    onDragStart={(e) => handleDragStartUser(e, u)}
                    onDragEnd={handleDragEnd}
                    title={`Nhấn giữ & kéo ${u.name} vào ô công việc hoặc ngày lịch để phân công`}
                    className={`px-3 py-2 bg-slate-50 dark:bg-slate-800/90 border rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-2xs cursor-grab active:cursor-grabbing hover:border-indigo-500 hover:bg-indigo-50/60 hover:shadow-md transition-all shrink-0 flex items-center space-x-2 select-none ${
                      isBeingDragged ? 'ring-2 ring-indigo-500 border-indigo-500 scale-95 opacity-50 bg-indigo-100 dark:bg-indigo-950' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-indigo-400 shrink-0 opacity-60" />
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 shadow-xs">
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-tight">{u.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{u.title || u.role}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Floating Trigger Button when Popup is Closed */}
      {!isStaffPopupOpen && (
        <button
          onClick={() => setIsStaffPopupOpen(true)}
          className="fixed bottom-5 right-5 z-40 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-full shadow-2xl font-bold text-xs flex items-center space-x-2 transition-all print:hidden border-2 border-white dark:border-slate-800 animate-bounce"
          title="Mở popup danh sách nhân sự để kéo thả phân công"
        >
          <Users className="w-4 h-4" />
          <span>Kéo Thả Nhân Sự ({users.length})</span>
        </button>
      )}

      {/* Floating Drag-To-Delete Trash Zone */}
      {draggedShift && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!isTrashOver) setIsTrashOver(true);
          }}
          onDragLeave={() => setIsTrashOver(false)}
          onDrop={handleDropToDeleteShift}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl border-2 transition-all flex items-center space-x-3 cursor-pointer print:hidden animate-in fade-in zoom-in-95 duration-200 ${
            isTrashOver
              ? 'bg-rose-600 border-white text-white scale-110 shadow-rose-600/50 ring-4 ring-rose-400'
              : 'bg-rose-950/90 border-rose-500 text-rose-100 backdrop-blur-md shadow-rose-950/50'
          }`}
        >
          <Trash2 className={`w-5 h-5 ${isTrashOver ? 'animate-bounce text-white' : 'text-rose-400'}`} />
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide">
              {isTrashOver ? 'THẢ RA ĐỂ XÓA PHÂN CÔNG NÀY!' : 'THÙNG RÁC: KÉO RA ĐÂY ĐỂ XÓA TÊN KHỎI BẢNG'}
            </p>
            <p className="text-[10px] opacity-90">
              Đang kéo ca của: <strong>{draggedShift.assignedUserName || draggedShift.userName}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Drag & Drop Toast Feedback */}
      {dragToast && (
        <div className={`fixed bottom-6 right-6 z-50 text-white px-4 py-3 rounded-2xl shadow-2xl border flex items-center space-x-2.5 text-xs font-bold animate-in slide-in-from-bottom duration-300 print:hidden ${
          dragToast.type === 'error' 
            ? 'bg-rose-950/95 border-rose-500 text-rose-100 shadow-rose-950/50' 
            : 'bg-slate-900/95 border-emerald-500 text-white shadow-slate-950/50'
        }`}>
          {dragToast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{dragToast.message}</span>
        </div>
      )}

    </div>
  );
};
