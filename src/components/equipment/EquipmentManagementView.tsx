import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wrench, Activity, AlertTriangle, ShieldCheck, Calendar, Clock, 
  Search, Plus, FileText, CheckCircle2, AlertCircle, RefreshCw, Filter, Layers, 
  LayoutList, LayoutGrid, Eye, User, MapPin, Check, Info, ArrowUpRight, X, Trash2,
  Gauge, DollarSign, ShieldAlert, Lock, Unlock, Settings, Sliders, BellRing, Send, CheckSquare
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { EquipmentItem, EquipmentDurationDefaults, MaintenanceLog, RepairLog, EquipmentStatus, ParaclinicalRoom, StaffProfile, DepartmentUnit } from '../../types/hospital';
import { filterActiveStaffDisplayName, filterActiveStaffProfiles, getInactiveStaffMatchers } from '../../utils/staffStatus';
import {
  MANAGEMENT_TIER_META,
  resolveEffectiveUserAccess,
  canManageEquipmentTarget,
  filterSelectableRoomsForActor,
  isEquipmentInAccessScope,
} from '../../utils/rbac';
import { EquipmentDetailModal } from './EquipmentDetailModal';
import { SafetyInterlockTab } from './SafetyInterlockTab';
import { OeeReliabilityTab } from './OeeReliabilityTab';
import { DepreciationUtilizationTab } from './DepreciationUtilizationTab';
import { SearchableCombobox, ComboboxOption } from '../common/SearchableCombobox';
import { formatDateVN, formatDateTimeVN, getTodayISODateVN, getNowVNString, isDatePastVN, addMonthsToISODate } from '../../utils/dateUtils';
import { formatRoomStorageValue, resolveRoomDisplay } from '../../utils/roomDisplay';
import { checkEquipmentSafetyInterlock, calculateEquipmentOEE, calculateEquipmentDepreciation } from '../../utils/equipmentAnalytics';
import {
  scanEquipmentExpirations,
  formatDaysRemainingLabel,
  createTaskFromEquipmentAlert,
  dispatchEquipmentReminder,
  getEquipmentReminderInfo,
  getDaysDiffFromTodayVN,
  EquipmentExpirationAlert
} from '../../utils/operationalAlerts';

export const EquipmentManagementView: React.FC = () => {
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [roomsList, setRoomsList] = useState<ParaclinicalRoom[]>(() => storageService.getRooms());
  const [departmentsList, setDepartmentsList] = useState<DepartmentUnit[]>(() => storageService.getDepartments());
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>(() => storageService.getStaffProfiles());
  const [allUsers, setAllUsers] = useState(() => storageService.getUsers());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'overdue' | 'within30' | 'within60'>('all');
  const [scopeOnlyFilter, setScopeOnlyFilter] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'list' | 'expirations' | 'interlock' | 'oee' | 'utilization' | 'maintenance' | 'repairs'>('list');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list'); // Default to LIST as requested
  const [reminderTick, setReminderTick] = useState(0);
  
  // Selected equipment for Full Detail Modal
  const [detailEquipment, setDetailEquipment] = useState<EquipmentItem | null>(null);

  // Selected equipment for Quick Action modals
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showRepairModal, setShowRepairModal] = useState(false);

  // Delete equipment states
  const [deleteTarget, setDeleteTarget] = useState<EquipmentItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states for Add Equipment — Phần 1: Thông tin cố định (Lý lịch, Ngày ghi thêm, Người quản lý)
  const [newEqCode, setNewEqCode] = useState('');
  const [newEqName, setNewEqName] = useState('');
  const [newEqCategory, setNewEqCategory] = useState<'Chẩn đoán hình ảnh' | 'Xét nghiệm' | 'Nội soi' | 'Siêu âm' | 'Khác'>('Chẩn đoán hình ảnh');
  const [newEqModel, setNewEqModel] = useState('');
  const [newEqManufacturer, setNewEqManufacturer] = useState('');
  const [newEqOrigin, setNewEqOrigin] = useState('CHLB Đức');
  const [newEqYear, setNewEqYear] = useState(String(new Date().getFullYear()));
  const [newEqSerial, setNewEqSerial] = useState('');
  const [newEqRoom, setNewEqRoom] = useState('');
  const [newEqTech, setNewEqTech] = useState('');
  const [newEqManager, setNewEqManager] = useState('');
  const [newEqPurchaseDate, setNewEqPurchaseDate] = useState(getTodayISODateVN());
  const [newEqInstallDate, setNewEqInstallDate] = useState(getTodayISODateVN());
  const [newEqPrice, setNewEqPrice] = useState('');
  const [newEqSupplier, setNewEqSupplier] = useState('');
  const [newEqSpecs, setNewEqSpecs] = useState('');

  // Pre-configured default durations (cài đặt trước khi nhập thiết bị)
  const [durationDefaults, setDurationDefaults] = useState<EquipmentDurationDefaults>(() =>
    storageService.getEquipmentDurationDefaults()
  );
  const [showDurationSettingsModal, setShowDurationSettingsModal] = useState(false);
  const [draftDefaults, setDraftDefaults] = useState<EquipmentDurationDefaults>(() =>
    storageService.getEquipmentDurationDefaults()
  );

  // Form states for Add Equipment — Phần 2: Giấy phép, Kiểm định, Kiểm xạ, Bảo dưỡng & Ghi chú
  // 2.1 Giấy phép
  const [newEqPermitNumber, setNewEqPermitNumber] = useState('');
  const [newEqPermitIssueDate, setNewEqPermitIssueDate] = useState('');
  const [newEqPermitDuration, setNewEqPermitDuration] = useState<number>(() => storageService.getEquipmentDurationDefaults().permitMonths);
  const [newEqPermitExpiry, setNewEqPermitExpiry] = useState('');
  const [permitExpiryManual, setPermitExpiryManual] = useState(false);

  // 2.2 Kiểm định
  const [newEqCalibNumber, setNewEqCalibNumber] = useState('');
  const [newEqCalibAgency, setNewEqCalibAgency] = useState('');
  const [newEqCalibDate, setNewEqCalibDate] = useState('');
  const [newEqCalibDuration, setNewEqCalibDuration] = useState<number>(() => storageService.getEquipmentDurationDefaults().calibrationMonths);
  const [newEqCalibExpiry, setNewEqCalibExpiry] = useState('');
  const [calibExpiryManual, setCalibExpiryManual] = useState(false);

  // 2.3 Kiểm xạ
  const [newEqRadLicense, setNewEqRadLicense] = useState('');
  const [newEqRadSurveyDate, setNewEqRadSurveyDate] = useState('');
  const [newEqRadSurveyDuration, setNewEqRadSurveyDuration] = useState<number>(() => storageService.getEquipmentDurationDefaults().radiationSurveyMonths);
  const [newEqRadSurveyExpiry, setNewEqRadSurveyExpiry] = useState('');
  const [radExpiryManual, setRadExpiryManual] = useState(false);

  // 2.4 Bảo dưỡng
  const [newEqLastMaintDate, setNewEqLastMaintDate] = useState(getTodayISODateVN());
  const [newEqInterval, setNewEqInterval] = useState<number>(() => storageService.getEquipmentDurationDefaults().maintenanceMonths);
  const [newEqNextMaintDate, setNewEqNextMaintDate] = useState(() =>
    addMonthsToISODate(getTodayISODateVN(), storageService.getEquipmentDurationDefaults().maintenanceMonths)
  );
  const [maintExpiryManual, setMaintExpiryManual] = useState(false);

  // 2.5 Ghi chú
  const [newEqNotes, setNewEqNotes] = useState('');

  // Form states for Quick Modals
  const [newRepairDesc, setNewRepairDesc] = useState('');
  const [newRepairCost, setNewRepairCost] = useState('');
  const [newMaintType, setNewMaintType] = useState<'Định kỳ' | 'Đột xuất' | 'Hiệu chuẩn' | 'Sửa chữa'>('Định kỳ');
  const [newMaintNotes, setNewMaintNotes] = useState('');

  const refreshData = () => {
    const list = storageService.getEquipment();
    setEquipmentList(list);
    setRoomsList(storageService.getRooms());
    setDepartmentsList(storageService.getDepartments());
    setStaffProfiles(storageService.getStaffProfiles());
    setAllUsers(storageService.getUsers());
    if (detailEquipment) {
      const refreshedItem = list.find(e => e.id === detailEquipment.id);
      if (refreshedItem) setDetailEquipment(refreshedItem);
    }
  };

  const currentUser = storageService.getCurrentUser();
  const actorAccess = useMemo(
    () => resolveEffectiveUserAccess(currentUser, staffProfiles, departmentsList, roomsList),
    [currentUser, staffProfiles, departmentsList, roomsList, allUsers]
  );
  const canCreateAnyEquipment = canManageEquipmentTarget(actorAccess, 'create', undefined, roomsList, departmentsList);
  const canConfigDurations = actorAccess.isDepartmentWide && actorAccess.permissions.canEditEquipment;

  const selectableRoomsForActor = useMemo(
    () => filterSelectableRoomsForActor(actorAccess, roomsList),
    [actorAccess, roomsList]
  );

  const activeStaffProfiles = useMemo(
    () => filterActiveStaffProfiles(staffProfiles),
    [staffProfiles]
  );

  const inactiveStaff = useMemo(
    () => getInactiveStaffMatchers(staffProfiles),
    [staffProfiles]
  );

  const staffComboboxOptions: ComboboxOption[] = useMemo(
    () =>
      activeStaffProfiles.map((s) => ({
        value: s.fullName,
        label: s.fullName,
        badge: s.title || 'Nhân viên',
        subLabel: [s.departmentSection, s.room].filter(Boolean).join(' • ')
      })),
    [activeStaffProfiles]
  );

  const roomOptions: ComboboxOption[] = useMemo(
    () =>
      (actorAccess.isDepartmentWide ? roomsList : selectableRoomsForActor).map((r) => {
        const full = formatRoomStorageValue(r);
        return {
          value: full,
          label: r.name,
          badge: r.code || undefined,
          closedLabel: full,
          subLabel: [r.departmentSection, r.floor, r.status].filter(Boolean).join(' • ')
        };
      }),
    [actorAccess.isDepartmentWide, roomsList, selectableRoomsForActor]
  );

  useEffect(() => {
    refreshData();
    return storageService.subscribe(refreshData);
  }, []);

  // 4-track expiration compliance scan (within 60 days + overdue)
  const compliance = useMemo(() => scanEquipmentExpirations(equipmentList, 60), [equipmentList, reminderTick]);
  const alertsByEquipmentId = useMemo(() => {
    const map = new Map<string, EquipmentExpirationAlert[]>();
    compliance.alerts.forEach((a) => {
      const list = map.get(a.equipmentId) || [];
      list.push(a);
      map.set(a.equipmentId, list);
    });
    return map;
  }, [compliance]);

  // Filtered equipment
  const filteredList = equipmentList.filter(item => {
    const resolvedRoom = resolveRoomDisplay(item.room, roomsList);
    const activeTech = filterActiveStaffDisplayName(item.assignedTechnician, inactiveStaff.names);
    const activeMgr = filterActiveStaffDisplayName(item.managerInCharge, inactiveStaff.names);
    const q = searchTerm.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(q) ||
                          item.code.toLowerCase().includes(q) ||
                          item.model.toLowerCase().includes(q) ||
                          item.room.toLowerCase().includes(q) ||
                          resolvedRoom.fullLabel.toLowerCase().includes(q) ||
                          (activeTech && activeTech.toLowerCase().includes(q)) ||
                          (activeMgr && activeMgr.toLowerCase().includes(q));
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
    let matchesDeadline = true;
    if (deadlineFilter !== 'all') {
      const eqAlerts = alertsByEquipmentId.get(item.id) || [];
      if (deadlineFilter === 'overdue') {
        matchesDeadline = eqAlerts.some(a => a.daysRemaining < 0);
      } else if (deadlineFilter === 'within30') {
        matchesDeadline = eqAlerts.some(a => a.daysRemaining <= 30);
      } else if (deadlineFilter === 'within60') {
        matchesDeadline = eqAlerts.length > 0;
      }
    }
    const matchesScope = !scopeOnlyFilter || actorAccess.isDepartmentWide || isEquipmentInAccessScope(actorAccess, item, roomsList, departmentsList);
    return matchesSearch && matchesCategory && matchesStatus && matchesDeadline && matchesScope;
  });

  // Analytics counters
  const totalEquipment = equipmentList.length;
  const activeCount = equipmentList.filter(e => e.status === 'Hoạt động tốt').length;
  const maintenanceNeededCount = equipmentList.filter(e => e.status === 'Cần bảo trì' || e.status === 'Đang hiệu chuẩn').length;
  const brokenCount = equipmentList.filter(e => e.status === 'Sự cố hỏng hóc').length;
  const safetyViolations = checkEquipmentSafetyInterlock(equipmentList);
  const criticalViolationsCount = safetyViolations.filter(v => v.severity === 'CRITICAL').length;

  const showQuickToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCreateAlertTask = (alert: EquipmentExpirationAlert) => {
    const res = createTaskFromEquipmentAlert(alert);
    setReminderTick(t => t + 1);
    if (res.created) {
      showQuickToast(`Đã tạo công việc #${res.task.id} nhắc xử lý "${alert.trackLabel}" cho ${res.task.assignee}`);
    } else {
      showQuickToast(`Đã có công việc đang mở (#${res.task.id}) cho mốc ${alert.trackLabel} của ${alert.equipmentCode}`);
    }
  };

  const handleSendAlertReminder = (alert: EquipmentExpirationAlert) => {
    dispatchEquipmentReminder(alert, 'Telegram');
    setReminderTick(t => t + 1);
    const activeRecipient = filterActiveStaffDisplayName(alert.assignedTechnician, inactiveStaff.names) || 'cán bộ phụ trách';
    showQuickToast(`Đã gửi nhắc hạn ${alert.equipmentCode} (${alert.trackLabel}) tới ${activeRecipient}`);
  };

  const handleBatchRemindExpiring = () => {
    const targets = compliance.alerts.filter(a => a.daysRemaining <= 30);
    if (targets.length === 0) {
      showQuickToast('Không có thiết bị nào quá hạn hoặc sắp hết hạn trong 30 ngày tới.');
      return;
    }
    targets.forEach(a => dispatchEquipmentReminder(a, 'Telegram'));
    setReminderTick(t => t + 1);
    showQuickToast(`Đã phát ${targets.length} cảnh báo nhắc gia hạn (≤ 30 ngày & quá hạn) qua Telegram/In-App!`);
  };

  const handleOpenAddModal = () => {
    if (!canCreateAnyEquipment) {
      showQuickToast('Bạn không có quyền thêm thiết bị mới trong phạm vi quản lý hiện tại.');
      return;
    }
    const latestDefaults = storageService.getEquipmentDurationDefaults();
    setDurationDefaults(latestDefaults);
    setDraftDefaults(latestDefaults);
    const today = getTodayISODateVN();
    setNewEqPurchaseDate(today);
    setNewEqInstallDate(today);
    setNewEqPermitDuration(latestDefaults.permitMonths);
    setNewEqCalibDuration(latestDefaults.calibrationMonths);
    setNewEqRadSurveyDuration(latestDefaults.radiationSurveyMonths);
    setNewEqInterval(latestDefaults.maintenanceMonths);
    setNewEqLastMaintDate(today);
    setNewEqNextMaintDate(addMonthsToISODate(today, latestDefaults.maintenanceMonths));
    setPermitExpiryManual(false);
    setCalibExpiryManual(false);
    setRadExpiryManual(false);
    setMaintExpiryManual(false);
    if (!actorAccess.isDepartmentWide && selectableRoomsForActor.length > 0 && !newEqRoom) {
      setNewEqRoom(formatRoomStorageValue(selectableRoomsForActor[0]));
    }
    setShowAddModal(true);
  };

  const handleSaveDurationDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfigDurations) {
      showQuickToast('Chỉ Admin hoặc Ban Chủ Nhiệm khoa mới được cấu hình thời hạn mặc định.');
      return;
    }
    const saved = storageService.saveEquipmentDurationDefaults(draftDefaults);
    setDurationDefaults(saved);
    setDraftDefaults(saved);
    // Cập nhật ngay vào form thêm mới nếu đang mở (và tính lại ngày hết hạn nếu có ngày bắt đầu)
    setNewEqPermitDuration(saved.permitMonths);
    if (newEqPermitIssueDate) {
      setNewEqPermitExpiry(addMonthsToISODate(newEqPermitIssueDate, saved.permitMonths));
      setPermitExpiryManual(false);
    }
    setNewEqCalibDuration(saved.calibrationMonths);
    if (newEqCalibDate) {
      setNewEqCalibExpiry(addMonthsToISODate(newEqCalibDate, saved.calibrationMonths));
      setCalibExpiryManual(false);
    }
    setNewEqRadSurveyDuration(saved.radiationSurveyMonths);
    if (newEqRadSurveyDate) {
      setNewEqRadSurveyExpiry(addMonthsToISODate(newEqRadSurveyDate, saved.radiationSurveyMonths));
      setRadExpiryManual(false);
    }
    setNewEqInterval(saved.maintenanceMonths);
    if (newEqLastMaintDate) {
      setNewEqNextMaintDate(addMonthsToISODate(newEqLastMaintDate, saved.maintenanceMonths));
      setMaintExpiryManual(false);
    }
    setShowDurationSettingsModal(false);
    setToastMessage('Đã lưu cài đặt thời hạn mặc định cho thiết bị mới!');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCreateEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEqName || !newEqCode) return;
    if (
      !canManageEquipmentTarget(
        actorAccess,
        'create',
        { category: newEqCategory, room: newEqRoom.trim() || 'Chưa phân phòng' },
        roomsList,
        departmentsList
      )
    ) {
      showQuickToast('Bạn không có quyền thêm thiết bị tại phòng/bộ phận ngoài phạm vi quản lý.');
      return;
    }

    const baseMaintDate = newEqLastMaintDate || newEqInstallDate || getTodayISODateVN();
    const computedNextMaint =
      newEqNextMaintDate ||
      addMonthsToISODate(baseMaintDate, newEqInterval) ||
      getTodayISODateVN();

    const computedPermitExpiry =
      newEqPermitExpiry ||
      (newEqPermitIssueDate ? addMonthsToISODate(newEqPermitIssueDate, newEqPermitDuration) : '');
    const computedCalibExpiry =
      newEqCalibExpiry ||
      (newEqCalibDate ? addMonthsToISODate(newEqCalibDate, newEqCalibDuration) : '');
    const computedRadSurveyExpiry =
      newEqRadSurveyExpiry ||
      (newEqRadSurveyDate ? addMonthsToISODate(newEqRadSurveyDate, newEqRadSurveyDuration) : '');

    const newEqId = `EQ-${Date.now().toString().slice(-6)}`;
    const item: EquipmentItem = {
      id: newEqId,
      code: newEqCode,
      name: newEqName,
      category: newEqCategory,
      model: newEqModel || 'Standard Series',
      manufacturer: newEqManufacturer || 'Hãng Y Tế Chính Hãng',
      originCountry: newEqOrigin,
      yearOfManufacture: newEqYear ? parseInt(newEqYear, 10) : new Date().getFullYear(),
      serialNumber: newEqSerial || `SN-${Math.floor(Math.random() * 900000 + 100000)}`,
      room: newEqRoom.trim() || 'Chưa phân phòng',
      assignedTechnician: newEqTech.trim(),
      managerInCharge: newEqManager.trim() || undefined,
      status: 'Hoạt động tốt',
      purchaseDate: newEqPurchaseDate,
      installationDate: newEqInstallDate || newEqPurchaseDate,
      purchasePrice: newEqPrice ? parseInt(newEqPrice) : undefined,
      supplier: newEqSupplier || undefined,
      maintenanceIntervalMonths: newEqInterval,
      lastMaintenanceDate: baseMaintDate,
      nextMaintenanceDate: computedNextMaint,
      operatingPermitNumber: newEqPermitNumber.trim() || undefined,
      operatingPermitIssueDate: newEqPermitIssueDate || undefined,
      operatingPermitDurationMonths: newEqPermitDuration || undefined,
      operatingPermitExpiry: computedPermitExpiry || undefined,
      radiationLicenseNumber: newEqRadLicense.trim() || undefined,
      radiationLicenseExpiry: computedRadSurveyExpiry || undefined,
      radiationSurveyDate: newEqRadSurveyDate || undefined,
      radiationSurveyIntervalMonths: newEqRadSurveyDuration || undefined,
      radiationSurveyExpiry: computedRadSurveyExpiry || undefined,
      calibrationNumber: newEqCalibNumber.trim() || undefined,
      calibrationDate: newEqCalibDate || undefined,
      calibrationIntervalMonths: newEqCalibDuration || undefined,
      calibrationExpiry: computedCalibExpiry || undefined,
      calibrationIssuedBy: newEqCalibAgency.trim() || undefined,
      specifications: newEqSpecs || 'Thiết bị y tế phục vụ công tác chẩn đoán và điều trị tại khoa Cận Lâm Sàng.',
      notes: newEqNotes.trim() || undefined,
      maintenanceHistory: [
        {
          id: `MNT-${Date.now()}`,
          equipmentId: newEqId,
          equipmentName: newEqName,
          date: baseMaintDate,
          type: 'Hiệu chuẩn',
          performedBy: 'Hội đồng nghiệm thu kỹ thuật bàn giao',
          result: 'Đạt',
          notes: 'Nghiệm thu lắp đặt ban đầu, kiểm chuẩn an toàn điện & thông số kỹ thuật xuất xưởng.',
          nextDueDate: computedNextMaint
        }
      ],
      repairHistory: []
    };

    storageService.saveEquipment(item);
    setShowAddModal(false);
    // Reset form
    const latestDefaults = storageService.getEquipmentDurationDefaults();
    const today = getTodayISODateVN();
    setNewEqCode('');
    setNewEqName('');
    setNewEqModel('');
    setNewEqManufacturer('');
    setNewEqYear(String(new Date().getFullYear()));
    setNewEqSerial('');
    setNewEqRoom('');
    setNewEqTech('');
    setNewEqManager('');
    setNewEqPrice('');
    setNewEqSupplier('');
    setNewEqPermitNumber('');
    setNewEqPermitIssueDate('');
    setNewEqPermitDuration(latestDefaults.permitMonths);
    setNewEqPermitExpiry('');
    setPermitExpiryManual(false);
    setNewEqRadLicense('');
    setNewEqRadSurveyDate('');
    setNewEqRadSurveyDuration(latestDefaults.radiationSurveyMonths);
    setNewEqRadSurveyExpiry('');
    setRadExpiryManual(false);
    setNewEqCalibNumber('');
    setNewEqCalibDate('');
    setNewEqCalibDuration(latestDefaults.calibrationMonths);
    setNewEqCalibExpiry('');
    setNewEqCalibAgency('');
    setCalibExpiryManual(false);
    setNewEqInterval(latestDefaults.maintenanceMonths);
    setNewEqLastMaintDate(today);
    setNewEqNextMaintDate(addMonthsToISODate(today, latestDefaults.maintenanceMonths));
    setMaintExpiryManual(false);
    setNewEqSpecs('');
    setNewEqNotes('');
    refreshData();
    // Auto open detail modal for the new machine
    setDetailEquipment(item);
  };

  const handleAddRepairLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!canManageEquipmentTarget(actorAccess, 'report_issue', selectedItem, roomsList, departmentsList)) {
      showQuickToast('Bạn không có quyền báo sự cố thiết bị này.');
      return;
    }
    const log: RepairLog = {
      id: `RPR-${Date.now()}`,
      equipmentId: selectedItem.id,
      equipmentName: selectedItem.name,
      issueDescription: newRepairDesc,
      reportedBy: storageService.getCurrentUser().name,
      reportedAt: getNowVNString(),
      cost: newRepairCost ? parseInt(newRepairCost) : undefined,
      status: 'Đang xử lý',
      technician: 'Kỹ sư tiếp nhận'
    };
    storageService.addRepairLog(selectedItem.id, log);
    setShowRepairModal(false);
    setNewRepairDesc('');
    setNewRepairCost('');
    refreshData();
  };

  const handleAddMaintenanceLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!canManageEquipmentTarget(actorAccess, 'maintenance', selectedItem, roomsList, departmentsList)) {
      showQuickToast('Bạn không có quyền ghi nhận bảo trì thiết bị ngoài phạm vi quản lý.');
      return;
    }
    const log: MaintenanceLog = {
      id: `MNT-${Date.now()}`,
      equipmentId: selectedItem.id,
      equipmentName: selectedItem.name,
      date: getTodayISODateVN(),
      type: newMaintType,
      performedBy: storageService.getCurrentUser().name,
      result: 'Đạt',
      notes: newMaintNotes || 'Đã kiểm tra dải số đo, vệ sinh công nghiệp và hiệu chỉnh phần mềm theo quy trình ISO.',
      nextDueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
    storageService.addMaintenanceLog(selectedItem.id, log);
    setShowMaintenanceModal(false);
    setNewMaintNotes('');
    refreshData();
  };

  const handleDeleteEquipment = (equipmentId: string) => {
    const targetEq = equipmentList.find(e => e.id === equipmentId) || deleteTarget;
    if (!canManageEquipmentTarget(actorAccess, 'delete', targetEq, roomsList, departmentsList)) {
      showQuickToast('Bạn không có quyền xóa thiết bị này.');
      setShowDeleteConfirm(false);
      return;
    }
    const success = storageService.deleteEquipment(equipmentId);
    if (success) {
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      if (detailEquipment?.id === equipmentId) {
        setDetailEquipment(null);
      }
      setToastMessage('Đã xóa thiết bị thành công khỏi danh sách!');
      setTimeout(() => setToastMessage(null), 3000);
      refreshData();
    }
  };

  const getStatusBadge = (status: EquipmentStatus) => {
    switch (status) {
      case 'Hoạt động tốt':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"><CheckCircle2 className="w-3.5 h-3.5" /> Hoạt động tốt</span>;
      case 'Cần bảo trì':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"><Clock className="w-3.5 h-3.5" /> Cần bảo trì</span>;
      case 'Sự cố hỏng hóc':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800/60"><AlertCircle className="w-3.5 h-3.5" /> Sự cố hỏng hóc</span>;
      case 'Đang hiệu chuẩn':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang hiệu chuẩn</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Tạm ngưng</span>;
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-[#1976D2] dark:text-sky-400 text-[11px] font-bold uppercase tracking-wider mb-0.5">
            <Wrench className="w-3.5 h-3.5" /> QUẢN LÝ MÁY MÓC &amp; THIẾT BỊ CẬN LÂM SÀNG
          </div>
          <h1 className="text-lg font-bold text-[#263445] dark:text-white leading-tight">Danh Mục Thiết Bị, Máy Chụp &amp; Xét Nghiệm</h1>
          <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">
            Quản lý hồ sơ lý lịch máy, người phụ trách, thời hạn kiểm định/cấp phép ATBX và toàn bộ nhật ký bảo dưỡng - sửa chữa.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            title={`Phạm vi quyền hạn: ${actorAccess.scopeLabel}`}
            className={`hidden lg:inline-flex px-2.5 py-1.5 rounded-lg text-xs font-bold items-center gap-1.5 border ${MANAGEMENT_TIER_META[actorAccess.tier].badgeClass}`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{actorAccess.shortTierLabel}</span>
            <span className="opacity-75 font-medium">• {actorAccess.scopeLabel}</span>
          </span>
          {canConfigDurations && (
            <button
              type="button"
              onClick={() => {
                setDraftDefaults(storageService.getEquipmentDurationDefaults());
                setShowDurationSettingsModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#263445] dark:text-slate-200 rounded-lg font-semibold text-xs border border-[#DFE7F0] dark:border-slate-700 transition-colors cursor-pointer"
              title="Cài đặt sẵn thời hạn mặc định cho Giấy phép, Kiểm định, Kiểm xạ, Bảo dưỡng trước khi nhập thiết bị"
            >
              <Sliders className="w-3.5 h-3.5 text-[#1976D2] dark:text-sky-400" />
              <span>Cài Đặt Thời Hạn</span>
            </button>
          )}
          {canCreateAnyEquipment && (
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-semibold text-xs transition-colors shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Thêm Thiết Bị Mới
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#718096] dark:text-slate-400">Tổng Số Máy</p>
            <h3 className="text-2xl font-bold text-[#263445] dark:text-white mt-0.5 tabular-nums">{totalEquipment}</h3>
            <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">Toàn khoa CLS</p>
          </div>
          <div className="p-2.5 bg-[#EAF4FF] text-[#1976D2] dark:bg-sky-950/60 dark:text-sky-400 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Đang Vận Hành Tốt</p>
            <h3 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">{activeCount}</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">{Math.round((activeCount / (totalEquipment || 1)) * 100)}% công suất</p>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Đến Hạn Bảo Trì / HC</p>
            <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-0.5 tabular-nums">{maintenanceNeededCount}</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Cần theo dõi sát</p>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-red-400">Sự Cố Hỏng Hóc</p>
            <h3 className="text-2xl font-bold text-rose-700 dark:text-red-400 mt-0.5 tabular-nums">{brokenCount}</h3>
            <p className="text-xs text-rose-600 dark:text-red-400 mt-0.5">{brokenCount > 0 ? 'Cần xử lý khẩn' : 'An toàn'}</p>
          </div>
          <div className="p-2.5 bg-rose-50 text-rose-600 dark:bg-red-950/60 dark:text-red-400 rounded-lg">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4-Track Compliance Expiration Strip */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 pr-3 border-r border-[#DFE7F0] dark:border-slate-800">
            <BellRing className={`w-4 h-4 ${compliance.overdueCount + compliance.critical7Count > 0 ? 'text-rose-600' : 'text-[#1976D2]'}`} />
            <div>
              <p className="text-xs font-bold text-[#263445] dark:text-slate-100 uppercase tracking-wider">
                Kiểm Soát Thời Hạn 4 Chu Kỳ
              </p>
              <p className="text-[11px] text-[#718096] dark:text-slate-400">
                Giấy phép &middot; Kiểm định &middot; Kiểm xạ &middot; Bảo dưỡng
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              setDeadlineFilter(deadlineFilter === 'overdue' ? 'all' : 'overdue');
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums border transition-colors cursor-pointer ${
              deadlineFilter === 'overdue' && activeTab === 'list'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60 hover:bg-rose-100'
            }`}
          >
            Quá hạn ({compliance.overdueCount})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              setDeadlineFilter(deadlineFilter === 'within30' ? 'all' : 'within30');
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums border transition-colors cursor-pointer ${
              deadlineFilter === 'within30' && activeTab === 'list'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 hover:bg-amber-100'
            }`}
          >
            Hạn ≤ 30 ngày ({compliance.overdueCount + compliance.critical7Count + compliance.warning30Count})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              setDeadlineFilter(deadlineFilter === 'within60' ? 'all' : 'within60');
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums border transition-colors cursor-pointer ${
              deadlineFilter === 'within60' && activeTab === 'list'
                ? 'bg-[#1976D2] text-white border-[#1976D2]'
                : 'bg-[#EAF4FF] text-[#155A9C] border-[#1976D2]/25 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60 hover:bg-[#EAF4FF]/80'
            }`}
          >
            Theo dõi ≤ 60 ngày ({compliance.alerts.length})
          </button>

          <span className="px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
            Đạt chuẩn: {compliance.compliantEquipmentCount}/{totalEquipment} máy
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('expirations')}
            className="px-3 py-1.5 bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#263445] dark:text-slate-100 rounded-lg text-xs font-semibold border border-[#DFE7F0] dark:border-slate-700 transition-colors cursor-pointer"
          >
            Mở bảng chi tiết hạn ({compliance.alerts.length})
          </button>
          {actorAccess.tier !== 'staff' && (
            <button
              type="button"
              onClick={handleBatchRemindExpiring}
              className="px-3 py-1.5 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Nhắc tất cả ≤ 30 ngày</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Search Filter Divided Into Two Rows */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-2xs overflow-hidden">
        {/* Dòng 1: Thanh Menu / Tabs Chuyên Mục */}
        <div className="px-3.5 py-2.5 border-b border-[#DFE7F0] dark:border-slate-800 bg-[#F4F7FB] dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar p-1 bg-white dark:bg-slate-800/80 rounded-lg border border-[#DFE7F0] dark:border-slate-700">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'list' 
                  ? 'bg-[#1976D2] text-white shadow-2xs' 
                  : 'text-[#263445] dark:text-slate-300 hover:text-[#155A9C] hover:bg-[#EAF4FF] dark:hover:bg-slate-800'
              }`}
            >
              <Wrench className={`w-3.5 h-3.5 ${activeTab === 'list' ? 'text-white' : 'text-[#1976D2] dark:text-sky-400'}`} />
              <span>Danh Sách Máy</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                activeTab === 'list' ? 'bg-white/25 text-white' : 'bg-[#EAF4FF] dark:bg-sky-950 text-[#155A9C] dark:text-sky-300'
              }`}>
                {equipmentList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('expirations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'expirations' 
                  ? 'bg-amber-600 text-white shadow-2xs' 
                  : 'text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${activeTab === 'expirations' ? 'text-white' : 'text-amber-600 dark:text-amber-400'}`} />
              <span>Cảnh Báo Thời Hạn</span>
              {compliance.alerts.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                  activeTab === 'expirations' ? 'bg-white text-amber-800' : 'bg-amber-500 text-white'
                }`}>
                  {compliance.alerts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('interlock')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'interlock' 
                  ? 'bg-rose-600 text-white shadow-2xs' 
                  : 'text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40'
              }`}
            >
              <ShieldAlert className={`w-3.5 h-3.5 ${activeTab === 'interlock' ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`} />
              <span>Khóa Chéo An Toàn (LOTO)</span>
              {safetyViolations.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'interlock' ? 'bg-white text-rose-700' : 'bg-rose-600 text-white animate-pulse'
                }`}>
                  {safetyViolations.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('oee')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'oee' 
                  ? 'bg-[#1976D2] text-white shadow-2xs' 
                  : 'text-[#263445] dark:text-slate-300 hover:text-[#155A9C] hover:bg-[#EAF4FF] dark:hover:bg-slate-800'
              }`}
            >
              <Gauge className={`w-3.5 h-3.5 ${activeTab === 'oee' ? 'text-white' : 'text-[#1976D2] dark:text-sky-400'}`} />
              <span>Hiệu Suất OEE &amp; MTBF</span>
            </button>

            <button
              onClick={() => setActiveTab('utilization')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'utilization' 
                  ? 'bg-[#1976D2] text-white shadow-2xs' 
                  : 'text-[#263445] dark:text-slate-300 hover:text-[#155A9C] hover:bg-[#EAF4FF] dark:hover:bg-slate-800'
              }`}
            >
              <DollarSign className={`w-3.5 h-3.5 ${activeTab === 'utilization' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Khấu Hao &amp; Công Suất Phòng</span>
            </button>

            <button
              onClick={() => setActiveTab('maintenance')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'maintenance' 
                  ? 'bg-[#1976D2] text-white shadow-2xs' 
                  : 'text-[#263445] dark:text-slate-300 hover:text-[#155A9C] hover:bg-[#EAF4FF] dark:hover:bg-slate-800'
              }`}
            >
              <Calendar className={`w-3.5 h-3.5 ${activeTab === 'maintenance' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Lịch Bảo Trì &amp; KĐ</span>
            </button>

            <button
              onClick={() => setActiveTab('repairs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'repairs' 
                  ? 'bg-[#1976D2] text-white shadow-2xs' 
                  : 'text-[#263445] dark:text-slate-300 hover:text-[#155A9C] hover:bg-[#EAF4FF] dark:hover:bg-slate-800'
              }`}
            >
              <FileText className={`w-3.5 h-3.5 ${activeTab === 'repairs' ? 'text-white' : 'text-amber-500 dark:text-amber-400'}`} />
              <span>Nhật Ký Sửa Chữa</span>
            </button>
          </div>

          {/* View Mode Toggle for main tab */}
          {activeTab === 'list' && (
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-[#DFE7F0] dark:border-slate-700 self-end sm:self-auto shrink-0">
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#1976D2] text-white'
                    : 'text-[#718096] hover:text-[#263445] dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Hiển thị dạng danh sách (List view)"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="text-[11px]">Dạng Bảng List</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#1976D2] text-white'
                    : 'text-[#718096] hover:text-[#263445] dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Hiển thị dạng thẻ lưới (Grid view)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="text-[11px]">Dạng Thẻ</span>
              </button>
            </div>
          )}
        </div>

        {/* Dòng 2: Thanh Tìm Kiếm và Bộ Lọc */}
        <div className="p-3 md:px-4 border-b border-[#DFE7F0] dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Ô Tìm Kiếm */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
            <input
              type="text"
              placeholder="Tìm tên máy, mã thiết bị, vị trí phòng, người quản lý..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-100 rounded-lg text-xs focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2] outline-none"
            />
          </div>

          {/* Bộ Lọc Theo Danh Mục & Trạng Thái */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 text-xs text-[#718096] shrink-0 font-medium mr-0.5">
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lọc theo:</span>
            </div>

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="flex-1 sm:flex-none px-2.5 py-1.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2] outline-none cursor-pointer"
            >
              <option value="all">Tất cả bộ phận</option>
              <option value="Chẩn đoán hình ảnh">Chẩn đoán hình ảnh</option>
              <option value="Xét nghiệm">Xét nghiệm</option>
              <option value="Siêu âm">Siêu âm</option>
              <option value="Nội soi">Nội soi</option>
            </select>

            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="flex-1 sm:flex-none px-2.5 py-1.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2] outline-none cursor-pointer"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="Hoạt động tốt">Hoạt động tốt</option>
              <option value="Cần bảo trì">Cần bảo trì</option>
              <option value="Sự cố hỏng hóc">Sự cố hỏng hóc</option>
              <option value="Đang hiệu chuẩn">Đang hiệu chuẩn</option>
            </select>

            {!actorAccess.isDepartmentWide && (actorAccess.allowedDepartments.length > 0 || actorAccess.allowedRooms.length > 0) && (
              <button
                type="button"
                onClick={() => setScopeOnlyFilter(prev => !prev)}
                title="Chỉ hiển thị thiết bị thuộc phạm vi bạn quản lý"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border shrink-0 cursor-pointer ${
                  scopeOnlyFilter
                    ? 'bg-[#1976D2] text-white border-[#1976D2]'
                    : 'bg-[#F4F7FB] dark:bg-slate-800 text-[#263445] dark:text-slate-300 border-[#DFE7F0] dark:border-slate-700 hover:bg-[#EAF4FF]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Trong phạm vi quản lý</span>
              </button>
            )}

            {(searchTerm || selectedCategory !== 'all' || selectedStatus !== 'all' || deadlineFilter !== 'all' || scopeOnlyFilter) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('all');
                  setSelectedStatus('all');
                  setDeadlineFilter('all');
                  setScopeOnlyFilter(false);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-[#718096] hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 bg-[#F4F7FB] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/30 rounded-lg transition-colors shrink-0 border border-[#DFE7F0] dark:border-slate-700"
                title="Xóa tất cả bộ lọc"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>

        {/* Tab Content 1: Main Equipment List / Table */}
        {activeTab === 'list' && (
          <div>
            {viewMode === 'list' ? (
              /* DẠNG LIST / TABLE BẢNG CHI TIẾT */
              <div className="overflow-x-auto bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs text-[#263445] dark:text-slate-300 border-collapse">
                  <thead className="bg-[#F4F7FB] dark:bg-slate-800 text-[#263445] dark:text-slate-100 font-bold uppercase tracking-wider text-[11px] border-b border-[#DFE7F0] dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3.5 border-r border-[#DFE7F0] dark:border-slate-700/80 min-w-[215px]">
                        <div className="leading-tight">Mã &amp; Tên<br/>Thiết Bị</div>
                      </th>
                      <th className="py-2.5 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 min-w-[195px]">
                        <div className="leading-tight">Phòng &amp;<br/>Bộ Phận</div>
                      </th>
                      <th className="py-2.5 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 min-w-[155px]">Model / Hãng SX</th>
                      <th className="py-2.5 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 min-w-[165px]">
                        <div className="leading-tight">Người<br/>Quản Lý</div>
                      </th>
                      <th className="py-2.5 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 min-w-[115px]">
                        <div className="leading-tight">Lịch<br/>Bảo Dưỡng</div>
                      </th>
                      <th className="py-2.5 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 min-w-[135px]">
                        <div className="leading-tight">Kiểm Định<br/>&amp; Kiểm Xạ</div>
                      </th>
                      <th className="py-2.5 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 min-w-[135px]">
                        <div className="leading-tight">Thời Hạn<br/>Cấp Phép</div>
                      </th>
                      <th className="py-2.5 px-1 text-center w-12 whitespace-nowrap">
                        <div className="leading-tight text-[10px]">Thao<br/>Tác</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFE7F0] dark:divide-slate-700 bg-white dark:bg-slate-900">
                    {filteredList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-[#718096] dark:text-slate-500">
                          Không tìm thấy thiết bị nào phù hợp với điều kiện tìm kiếm.
                        </td>
                      </tr>
                    ) : (
                      filteredList.map(item => {
                        const isOverdueMaint = isDatePastVN(item.nextMaintenanceDate);
                        const radExpiryValue = item.radiationSurveyExpiry || item.radiationLicenseExpiry;
                        const isOverdueRad = radExpiryValue ? isDatePastVN(radExpiryValue) : false;
                        const isOverduePermit = item.operatingPermitExpiry ? isDatePastVN(item.operatingPermitExpiry) : false;
                        const isOverdueCalib = item.calibrationExpiry ? isDatePastVN(item.calibrationExpiry) : false;
                        const oee = calculateEquipmentOEE(item);

                        return (
                          <tr 
                            key={item.id} 
                            className={`hover:bg-[#EAF4FF]/70 dark:hover:bg-sky-950/30 transition-colors group even:bg-[#F4F7FB]/50 dark:even:bg-slate-800/30 ${
                              item.isLockedOut ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                            }`}
                          >
                            {/* Mã & Tên máy (Mã ở trên, Tên máy ở dưới) */}
                            <td className="py-3 px-3.5 border-r border-[#DFE7F0] dark:border-slate-700/80">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono uppercase border border-slate-300 dark:border-slate-700">
                                    {item.code}
                                  </span>
                                  {item.isLockedOut ? (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-black bg-rose-600 text-white animate-pulse">
                                      <Lock className="w-2.5 h-2.5" />
                                      LOTO KHÓA
                                    </span>
                                  ) : (
                                    <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-black ${
                                      oee.oee >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                                      oee.oee >= 60 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                                      'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    }`}>
                                      OEE {oee.oee}%
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <button
                                    onClick={() => setDetailEquipment(item)}
                                    className="font-bold text-[#263445] dark:text-white hover:text-[#1976D2] dark:hover:text-sky-400 text-left transition-colors flex items-start gap-1 group-hover:underline text-xs leading-snug"
                                    title="Nhấn để xem toàn bộ hồ sơ lý lịch máy, người quản lý, hạn kiểm định và nhật ký"
                                  >
                                    <span>{item.name}</span>
                                    <ArrowUpRight className="w-3.5 h-3.5 text-[#1976D2] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                                  </button>
                                  <div className="text-[11px] text-[#718096] dark:text-slate-500 mt-0.5">
                                    S/N: {item.serialNumber} • Ngày nhập: {formatDateVN(item.purchaseDate || item.installationDate)}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Vị trí phòng & bộ phận */}
                            <td className="py-3 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 align-middle">
                              {(() => {
                                const roomDisplay = resolveRoomDisplay(item.room, roomsList);
                                return (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {roomDisplay.code && (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EAF4FF] dark:bg-sky-950/80 text-[#155A9C] dark:text-sky-300 border border-[#1976D2]/25 dark:border-sky-800 whitespace-nowrap shrink-0">
                                          {roomDisplay.code}
                                        </span>
                                      )}
                                      <span className="font-bold text-slate-800 dark:text-slate-100 leading-snug">
                                        {roomDisplay.name}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 whitespace-nowrap">
                                        {item.category}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Model & Hãng */}
                            <td className="py-3 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80">
                              <div className="font-medium text-[#263445] dark:text-slate-200">{item.model}</div>
                              <div className="text-[11px] text-[#718096] dark:text-slate-500">{item.manufacturer} ({item.originCountry || 'Chính hãng'})</div>
                            </td>

                            {/* Người quản lý & KTV */}
                            <td className="py-3 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80">
                              {(() => {
                                const activeManager = filterActiveStaffDisplayName(item.managerInCharge, inactiveStaff.names);
                                const activeTech = filterActiveStaffDisplayName(item.assignedTechnician, inactiveStaff.names);
                                return (
                                  <>
                                    <div className="font-semibold text-[#263445] dark:text-slate-200 flex items-start gap-1 leading-snug">
                                      <User className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                      <span className="break-words">
                                        {activeManager || 'Chưa chỉ định'}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-[#718096] dark:text-slate-500 mt-1 leading-snug break-words">
                                      KTV: {activeTech || 'Chưa phân công'}
                                    </div>
                                  </>
                                );
                              })()}
                            </td>

                            {/* Lịch Bảo Dưỡng */}
                            <td className="py-3 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 tabular-nums">
                              {(() => {
                                const maintDays = getDaysDiffFromTodayVN(item.nextMaintenanceDate);
                                return (
                                  <div className="space-y-0.5">
                                    <div className="text-[11px] font-bold text-[#718096] dark:text-slate-300">
                                      Lịch BD:
                                    </div>
                                    <div className={`text-xs font-bold ${isOverdueMaint ? 'text-red-600 dark:text-red-400' : maintDays !== null && maintDays <= 30 ? 'text-amber-700 dark:text-amber-400' : 'text-[#263445] dark:text-slate-200'}`}>
                                      {formatDateVN(item.nextMaintenanceDate)}
                                    </div>
                                    {maintDays !== null && maintDays <= 60 ? (
                                      <span className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                        maintDays < 0
                                          ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60'
                                          : maintDays <= 30
                                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                          : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60'
                                      }`}>
                                        {formatDaysRemainingLabel(maintDays)}
                                      </span>
                                    ) : (
                                      <div className="text-[10px] text-[#718096] dark:text-slate-500 mt-0.5">
                                        CK {item.maintenanceIntervalMonths}T
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Cột 6: Kiểm Định & Kiểm Xạ */}
                            <td className="py-3 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 tabular-nums">
                              {(() => {
                                const calibDays = getDaysDiffFromTodayVN(item.calibrationExpiry);
                                const radDays = getDaysDiffFromTodayVN(radExpiryValue);
                                return (
                                  <div className="space-y-1.5">
                                    {/* Hạn Kiểm Định */}
                                    <div className="space-y-0.5">
                                      <div className="text-[11px] font-bold text-[#155A9C] dark:text-sky-300 flex items-center gap-1">
                                        <span>🔬 Hạn KĐ:</span>
                                      </div>
                                      <div className={`text-xs font-bold ${isOverdueCalib ? 'text-red-600 dark:text-red-400' : calibDays !== null && calibDays <= 30 ? 'text-amber-700 dark:text-amber-400' : 'text-[#263445] dark:text-slate-200'}`}>
                                        {formatDateVN(item.calibrationExpiry, 'Hàng năm')}
                                      </div>
                                      {calibDays !== null && calibDays <= 60 && (
                                        <span className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                          calibDays < 0
                                            ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60'
                                            : calibDays <= 30
                                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                            : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60'
                                        }`}>
                                          {formatDaysRemainingLabel(calibDays)}
                                        </span>
                                      )}
                                    </div>

                                    {/* Hạn Kiểm Xạ */}
                                    <div className="pt-1 border-t border-[#DFE7F0] dark:border-slate-800 space-y-0.5">
                                      <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                        <span>☢️ Hạn KX:</span>
                                      </div>
                                      <div className="text-xs font-bold">
                                        {radExpiryValue ? (
                                          <span className={isOverdueRad ? 'text-red-600 dark:text-red-400' : radDays !== null && radDays <= 30 ? 'text-amber-700 dark:text-amber-400' : 'text-[#263445] dark:text-slate-200'}>
                                            {formatDateVN(radExpiryValue)}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] text-[#718096] dark:text-slate-500 font-normal italic">K.áp dụng</span>
                                        )}
                                      </div>
                                      {radExpiryValue && radDays !== null && radDays <= 60 && (
                                        <span className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                          radDays < 0
                                            ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60'
                                            : radDays <= 30
                                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                            : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60'
                                        }`}>
                                          {formatDaysRemainingLabel(radDays)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Cột 7: Thời Hạn Cấp Phép */}
                            <td className="py-3 px-3 border-r border-[#DFE7F0] dark:border-slate-700/80 tabular-nums">
                              {(() => {
                                const permitDate = item.operatingPermitExpiry || item.radiationLicenseExpiry;
                                const permitDays = getDaysDiffFromTodayVN(permitDate);
                                return (
                                  <div className="space-y-1">
                                    <div className="space-y-0.5">
                                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                        <span>📋 Hạn GP:</span>
                                      </div>
                                      <div className={`text-xs font-bold ${isOverduePermit ? 'text-red-600 dark:text-red-400' : permitDays !== null && permitDays <= 30 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {formatDateVN(permitDate, 'Theo chuẩn BYT')}
                                      </div>
                                    </div>
                                    {item.operatingPermitNumber && (
                                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[120px]" title={item.operatingPermitNumber}>
                                        {item.operatingPermitNumber}
                                      </div>
                                    )}
                                    <div>
                                      {permitDays !== null && permitDays <= 60 ? (
                                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                          permitDays < 0
                                            ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60'
                                            : permitDays <= 30
                                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                            : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60'
                                        }`}>
                                          {formatDaysRemainingLabel(permitDays)}
                                        </span>
                                      ) : item.operatingPermitExpiry ? (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                                          ✓ Còn hiệu lực
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                          Lưu hành BYT
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Thao tác (Dạng 1 cột biểu tượng thu gọn kèm Tooltip khi rê chuột) */}
                            <td className="py-2.5 px-1 align-middle text-center w-12">
                              <div className="flex flex-col items-center justify-center gap-1.5">
                                {/* Hồ Sơ Máy */}
                                <div className="relative group/tip">
                                  <button
                                    onClick={() => setDetailEquipment(item)}
                                    className="p-1.5 rounded-lg bg-[#EAF4FF] hover:bg-[#1976D2] text-[#1976D2] hover:text-white dark:bg-sky-950/60 dark:hover:bg-[#1976D2] dark:text-sky-300 border border-[#1976D2]/25 dark:border-sky-800/60 transition-colors active:scale-90 cursor-pointer"
                                    title="Hồ Sơ Máy"
                                    aria-label="Hồ Sơ Máy"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip:inline-block px-2 py-0.5 text-[11px] font-semibold text-white bg-slate-900/95 dark:bg-slate-800 rounded shadow-md whitespace-nowrap z-30">
                                    Hồ Sơ Máy
                                  </span>
                                </div>

                                {/* Ghi Bảo Trì */}
                                {canManageEquipmentTarget(actorAccess, 'maintenance', item, roomsList, departmentsList) && (
                                  <div className="relative group/tip">
                                    <button
                                      onClick={() => {
                                        setSelectedItem(item);
                                        setShowMaintenanceModal(true);
                                      }}
                                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white dark:bg-emerald-950/60 dark:hover:bg-emerald-600 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 transition-all shadow-2xs hover:shadow-xs active:scale-90"
                                      title="Ghi Bảo Trì"
                                      aria-label="Ghi Bảo Trì"
                                    >
                                      <Wrench className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip:inline-block px-2 py-0.5 text-[11px] font-semibold text-white bg-slate-900/95 dark:bg-slate-800 rounded shadow-md whitespace-nowrap z-30">
                                      Ghi Bảo Trì
                                    </span>
                                  </div>
                                )}

                                {/* Báo Sự Cố */}
                                {canManageEquipmentTarget(actorAccess, 'report_issue', item, roomsList, departmentsList) && (
                                  <div className="relative group/tip">
                                    <button
                                      onClick={() => {
                                        setSelectedItem(item);
                                        setShowRepairModal(true);
                                      }}
                                      className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-600 text-amber-600 hover:text-white dark:bg-amber-950/60 dark:hover:bg-amber-600 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 transition-all shadow-2xs hover:shadow-xs active:scale-90"
                                      title="Báo Sự Cố"
                                      aria-label="Báo Sự Cố"
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip:inline-block px-2 py-0.5 text-[11px] font-semibold text-white bg-slate-900/95 dark:bg-slate-800 rounded shadow-md whitespace-nowrap z-30">
                                      Báo Sự Cố
                                    </span>
                                  </div>
                                )}

                                {/* Xóa Thiết Bị */}
                                {canManageEquipmentTarget(actorAccess, 'delete', item, roomsList, departmentsList) && (
                                  <div className="relative group/tip">
                                    <button
                                      onClick={() => {
                                        setDeleteTarget(item);
                                        setShowDeleteConfirm(true);
                                      }}
                                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white dark:bg-rose-950/60 dark:hover:bg-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-900/60 transition-all shadow-2xs hover:shadow-xs active:scale-90"
                                      title="Xóa Thiết Bị"
                                      aria-label="Xóa Thiết Bị"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip:inline-block px-2 py-0.5 text-[11px] font-semibold text-white bg-slate-900/95 dark:bg-slate-800 rounded shadow-md whitespace-nowrap z-30">
                                      Xóa Thiết Bị
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* DẠNG GRID THẺ */
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredList.map(item => {
                  const oee = calculateEquipmentOEE(item);
                  return (
                    <div 
                      key={item.id} 
                      className={`bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-700 hover:border-[#1976D2] dark:hover:border-sky-400 hover:shadow-md transition-all p-4 flex flex-col justify-between space-y-3 shadow-2xs ${
                        item.isLockedOut ? 'ring-2 ring-rose-500 bg-rose-50/20 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F4F7FB] dark:bg-slate-800 text-[#263445] dark:text-slate-300 uppercase tracking-wider border border-[#DFE7F0] dark:border-slate-700">
                                {item.code}
                              </span>
                              {item.isLockedOut ? (
                                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-rose-600 text-white animate-pulse inline-flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" />
                                  LOTO KHÓA
                                </span>
                              ) : (
                                <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                                  oee.oee >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                                  oee.oee >= 60 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                                  'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}>
                                  OEE {oee.oee}%
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => setDetailEquipment(item)}
                              className="text-left block mt-1"
                            >
                              <h3 className="text-sm font-bold text-[#263445] dark:text-white hover:text-[#1976D2] dark:hover:text-sky-400 transition-colors line-clamp-2">
                                {item.name}
                              </h3>
                            </button>
                          </div>
                          {getStatusBadge(item.status)}
                        </div>

                        <p className="text-xs text-[#718096] dark:text-slate-400 font-medium">
                          {item.manufacturer} ({item.originCountry || 'Đức'}) • Model: {item.model}
                        </p>

                        <div className="mt-3 space-y-1.5 text-xs text-[#263445] dark:text-slate-300 bg-[#F4F7FB] dark:bg-slate-800/50 p-3 rounded-lg border border-[#DFE7F0] dark:border-slate-700">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[#718096] dark:text-slate-500 shrink-0">Vị trí phòng:</span>
                            {(() => {
                              const roomDisplay = resolveRoomDisplay(item.room, roomsList);
                              return (
                                <span className="font-semibold text-[#263445] dark:text-slate-200 text-right flex items-center justify-end gap-1.5 flex-wrap">
                                  {roomDisplay.code && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EAF4FF] dark:bg-sky-950/80 text-[#155A9C] dark:text-sky-300 border border-[#1976D2]/25 dark:border-sky-800 whitespace-nowrap">
                                      {roomDisplay.code}
                                    </span>
                                  )}
                                  <span>{roomDisplay.name}</span>
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 dark:text-slate-500">Người quản lý:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {filterActiveStaffDisplayName(item.managerInCharge, inactiveStaff.names) ||
                                filterActiveStaffDisplayName(item.assignedTechnician, inactiveStaff.names) ||
                                'Chưa chỉ định'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-600 dark:text-slate-300">Lịch Bảo Dưỡng:</span>
                            <span className={`font-bold ${isDatePastVN(item.nextMaintenanceDate) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                              {formatDateVN(item.nextMaintenanceDate)} {isDatePastVN(item.nextMaintenanceDate) && '⚠️ Quá hạn'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sky-700 dark:text-sky-400">🔬 Hạn Kiểm Định:</span>
                            <span className={`font-bold ${item.calibrationExpiry && isDatePastVN(item.calibrationExpiry) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                              {formatDateVN(item.calibrationExpiry, 'Hàng năm')} {item.calibrationExpiry && isDatePastVN(item.calibrationExpiry) && '⚠️ Quá hạn'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-amber-700 dark:text-amber-400">☢️ Hạn Kiểm Xạ:</span>
                            {(item.radiationSurveyExpiry || item.radiationLicenseExpiry) ? (
                              <span className={`font-bold ${isDatePastVN(item.radiationSurveyExpiry || item.radiationLicenseExpiry) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                {formatDateVN(item.radiationSurveyExpiry || item.radiationLicenseExpiry)} {isDatePastVN(item.radiationSurveyExpiry || item.radiationLicenseExpiry) && '⚠️ Quá hạn'}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 italic">Không áp dụng</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-700 dark:text-slate-300">📋 Hạn Cấp Phép:</span>
                            <span className={`font-bold ${item.operatingPermitExpiry && isDatePastVN(item.operatingPermitExpiry) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                              {formatDateVN(item.operatingPermitExpiry || item.radiationLicenseExpiry, 'Theo chuẩn BYT')} {item.operatingPermitExpiry && isDatePastVN(item.operatingPermitExpiry) && '⚠️ Quá hạn'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-[#DFE7F0] dark:border-slate-800 flex flex-col gap-2">
                        <button
                          onClick={() => setDetailEquipment(item)}
                          className="w-full py-2 px-3 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-semibold text-center transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem Toàn Bộ Hồ Sơ Máy</span>
                        </button>
                        {(canManageEquipmentTarget(actorAccess, 'maintenance', item, roomsList, departmentsList) ||
                          canManageEquipmentTarget(actorAccess, 'report_issue', item, roomsList, departmentsList)) && (
                          <div className={`grid gap-2 ${
                            canManageEquipmentTarget(actorAccess, 'maintenance', item, roomsList, departmentsList) &&
                            canManageEquipmentTarget(actorAccess, 'report_issue', item, roomsList, departmentsList)
                              ? 'grid-cols-2'
                              : 'grid-cols-1'
                          }`}>
                            {canManageEquipmentTarget(actorAccess, 'maintenance', item, roomsList, departmentsList) && (
                              <button
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowMaintenanceModal(true);
                                }}
                                className="py-1.5 px-2.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs font-bold text-center transition-all inline-flex items-center justify-center gap-1 shadow-2xs active:scale-95"
                                title="Ghi bảo trì"
                              >
                                <Wrench className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Ghi Bảo Trì</span>
                              </button>
                            )}
                            {canManageEquipmentTarget(actorAccess, 'report_issue', item, roomsList, departmentsList) && (
                              <button
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowRepairModal(true);
                                }}
                                className="py-1.5 px-2.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs font-bold text-center transition-all inline-flex items-center justify-center gap-1 shadow-2xs active:scale-95"
                                title="Báo sự cố"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Báo Sự Cố</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Cảnh Báo Thời Hạn Thiết Bị (60 ngày & Quá hạn) */}
        {activeTab === 'expirations' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DFE7F0] dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-[#263445] dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Danh Sách Cảnh Báo Thời Hạn Pháp Lý &amp; Bảo Dưỡng (Trong 60 Ngày &amp; Quá Hạn)</span>
                </h3>
                <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">
                  Theo dõi tập trung 4 mốc: Giấy phép hoạt động, Kiểm định ISO 15189, Kiểm xạ ATBX và Bảo dưỡng định kỳ.
                </p>
              </div>
              {actorAccess.tier !== 'staff' && (
                <button
                  type="button"
                  onClick={handleBatchRemindExpiring}
                  className="px-3.5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Gửi nhắc tất cả ≤ 30 ngày</span>
                </button>
              )}
            </div>

            {compliance.alerts.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600" />
                <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  Toàn bộ thiết bị đều còn hiệu lực trên 60 ngày!
                </h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Không có giấy phép, kiểm định, kiểm xạ hay lịch bảo dưỡng nào sắp đến hạn trong 60 ngày tới.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[#DFE7F0] dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F4F7FB] dark:bg-slate-800/80 text-[#263445] dark:text-slate-300 uppercase font-bold text-[11px] border-b border-[#DFE7F0] dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3.5">Mức Độ &amp; Còn Lại</th>
                      <th className="py-2.5 px-3.5">Thiết Bị &amp; Phòng</th>
                      <th className="py-2.5 px-3.5">Hạng Mục Thời Hạn</th>
                      <th className="py-2.5 px-3.5">Ngày Hết Hạn</th>
                      <th className="py-2.5 px-3.5">Phụ Trách</th>
                      <th className="py-2.5 px-3.5 text-right">Hành Động Nhanh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFE7F0] dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {compliance.alerts.map((al) => {
                      const eqObj = equipmentList.find((e) => e.id === al.equipmentId);
                      const rInfo = getEquipmentReminderInfo(al.id);
                      const isOverdue = al.daysRemaining < 0;
                      const isCritical = al.daysRemaining >= 0 && al.daysRemaining <= 7;
                      return (
                        <tr key={al.id} className="hover:bg-[#EAF4FF]/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3.5 tabular-nums whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                isOverdue
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900'
                                  : isCritical
                                  ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900'
                                  : al.daysRemaining <= 30
                                  ? 'bg-amber-50/60 text-amber-700 border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300'
                                  : 'bg-[#EAF4FF] text-[#155A9C] border-[#1976D2]/25 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900'
                              }`}
                            >
                              {formatDaysRemainingLabel(al.daysRemaining)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-mono text-[11px] font-bold text-[#1976D2] dark:text-sky-400">
                              {al.equipmentCode}
                            </div>
                            <div className="font-bold text-[#263445] dark:text-slate-100">{al.equipmentName}</div>
                            <div className="text-[11px] text-[#718096]">{al.room}</div>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-semibold text-[#263445] dark:text-slate-200">{al.trackLabel}</div>
                            {al.referenceNumber && (
                              <div className="text-[11px] font-mono text-[#718096]">Số HS: {al.referenceNumber}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 font-bold tabular-nums text-[#263445] dark:text-slate-100 whitespace-nowrap">
                            {al.expiryDateVN}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-medium text-[#263445] dark:text-slate-200">
                              {filterActiveStaffDisplayName(al.assignedTechnician, inactiveStaff.names) || 'Chưa phân công'}
                            </div>
                            <div className="text-[11px] text-[#718096]">
                              {filterActiveStaffDisplayName(al.managerInCharge, inactiveStaff.names) || 'Chưa chỉ định'}
                            </div>
                            {rInfo && (
                              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                                Đã nhắc {rInfo.count} lần ({rInfo.lastRemindedAt})
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {eqObj && (canManageEquipmentTarget(actorAccess, 'edit', eqObj, roomsList, departmentsList) ||
                                canManageEquipmentTarget(actorAccess, 'maintenance', eqObj, roomsList, departmentsList)) && (
                                <button
                                  type="button"
                                  onClick={() => handleCreateAlertTask(al)}
                                  className="px-2.5 py-1 bg-[#EAF4FF] hover:bg-[#1976D2] text-[#155A9C] hover:text-white dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-[#1976D2] rounded-lg text-[11px] font-semibold border border-[#1976D2]/25 dark:border-sky-800 transition-colors cursor-pointer inline-flex items-center gap-1"
                                  title="Tạo công việc xử lý & gán ngày hạn tự động"
                                >
                                  <CheckSquare className="w-3.5 h-3.5" />
                                  <span>Tạo việc</span>
                                </button>
                              )}
                              {actorAccess.tier !== 'staff' && (
                                <button
                                  type="button"
                                  onClick={() => handleSendAlertReminder(al)}
                                  className="px-2.5 py-1 bg-[#EAF4FF] hover:bg-[#1976D2] text-[#155A9C] hover:text-white dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-[#1976D2] rounded-lg text-[11px] font-semibold border border-[#1976D2]/25 dark:border-sky-800 transition-colors cursor-pointer inline-flex items-center gap-1"
                                  title="Gửi nhắc nhở qua Telegram/In-App"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Nhắc</span>
                                </button>
                              )}
                              {eqObj && (
                                <button
                                  type="button"
                                  onClick={() => setDetailEquipment(eqObj)}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                                >
                                  Hồ sơ
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Khóa Chéo An Toàn (LOTO) & Cảnh Báo An Toàn Bức Xạ */}
        {activeTab === 'interlock' && (
          <SafetyInterlockTab
            equipmentList={equipmentList}
            onOpenDetailModal={setDetailEquipment}
            onRefresh={refreshData}
          />
        )}

        {/* Tab Content: Hiệu Suất Thiết Bị Tổng Thể (OEE) & MTBF/MTTR */}
        {activeTab === 'oee' && (
          <OeeReliabilityTab
            equipmentList={equipmentList}
            onOpenDetailModal={setDetailEquipment}
          />
        )}

        {/* Tab Content: Khấu Hao & Công Suất Phòng Máy */}
        {activeTab === 'utilization' && (
          <DepreciationUtilizationTab
            equipmentList={equipmentList}
            onOpenDetailModal={setDetailEquipment}
          />
        )}

        {/* Tab Content: Maintenance Schedule & History */}
        {activeTab === 'maintenance' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#263445] dark:text-white">Lịch Trình Bảo Trì Định Kỳ &amp; Kiểm Định Máy Móc</h3>
                <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">Nhấn vào tên máy để xem toàn bộ lịch sử biên bản bảo trì kỹ thuật.</p>
              </div>
            </div>
            <div className="overflow-x-auto border border-[#DFE7F0] dark:border-slate-700 rounded-lg">
              <table className="w-full text-left text-xs text-[#263445] dark:text-slate-300">
                <thead className="bg-[#F4F7FB] dark:bg-slate-800/80 text-[#263445] dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] border-b border-[#DFE7F0] dark:border-slate-700">
                  <tr>
                    <th className="p-3">Mã &amp; Tên Thiết Bị</th>
                    <th className="p-3">Vị Trí Phòng</th>
                    <th className="p-3">Chu Kỳ BD</th>
                    <th className="p-3">Lần Bảo Trì Cuối</th>
                    <th className="p-3">Lịch BD (Bảo Dưỡng Kế Tiếp)</th>
                    <th className="p-3">Trạng Thái</th>
                    <th className="p-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFE7F0] dark:divide-slate-700 bg-white dark:bg-slate-900">
                  {equipmentList.map(item => {
                    const isOverdue = isDatePastVN(item.nextMaintenanceDate);
                    return (
                      <tr key={item.id} className="hover:bg-[#EAF4FF]/60 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3">
                          <button
                            onClick={() => setDetailEquipment(item)}
                            className="font-bold text-[#263445] dark:text-white hover:text-[#1976D2] dark:hover:text-sky-400 text-left transition-colors block cursor-pointer"
                          >
                            {item.name}
                          </button>
                          <div className="text-[11px] text-[#718096] dark:text-slate-500">{item.code} - {item.model}</div>
                        </td>
                        <td className="p-3 font-medium text-[#263445] dark:text-slate-300">{item.room}</td>
                        <td className="p-3 text-[#718096] dark:text-slate-400">{item.maintenanceIntervalMonths} tháng/lần</td>
                        <td className="p-3 text-[#718096] dark:text-slate-400">{formatDateVN(item.lastMaintenanceDate)}</td>
                        <td className="p-3">
                          <span className={`font-bold ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-[#263445] dark:text-slate-200'}`}>
                            {formatDateVN(item.nextMaintenanceDate)} {isOverdue && '⚠️ Quá hạn'}
                          </span>
                        </td>
                        <td className="p-3">{getStatusBadge(item.status)}</td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => setDetailEquipment(item)}
                            className="px-2.5 py-1 bg-[#F4F7FB] dark:bg-slate-800 hover:bg-[#EAF4FF] text-[#263445] dark:text-slate-200 border border-[#DFE7F0] dark:border-slate-700 rounded-md font-semibold text-xs cursor-pointer"
                          >
                            Lý lịch máy
                          </button>
                          {canManageEquipmentTarget(actorAccess, 'maintenance', item, roomsList, departmentsList) && (
                            <button
                              onClick={() => {
                                setSelectedItem(item);
                                setShowMaintenanceModal(true);
                              }}
                              className="px-3 py-1 bg-[#EAF4FF] text-[#155A9C] dark:bg-sky-950 dark:text-sky-300 hover:bg-[#1976D2] hover:text-white border border-[#1976D2]/25 rounded-md font-semibold text-xs transition-colors cursor-pointer"
                            >
                              Cập nhật bảo trì
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Repair Logs */}
        {activeTab === 'repairs' && (
          <div className="p-4 space-y-3.5">
            <h3 className="text-sm font-bold text-[#263445] dark:text-white">Nhật Ký Ghi Nhận Sự Cố &amp; Chi Phí Sửa Chữa Toàn Bộ Thiết Bị</h3>
            <div className="space-y-2.5">
              {equipmentList.flatMap(e => (e.repairHistory || [])).length === 0 ? (
                <p className="text-sm text-[#718096] dark:text-slate-400 py-8 text-center bg-[#F4F7FB] dark:bg-slate-800/40 rounded-lg border border-[#DFE7F0] dark:border-slate-800">Chưa có sự cố hư hỏng nào được ghi nhận.</p>
              ) : (
                equipmentList.flatMap(e => (e.repairHistory || []).map(r => ({ ...r, eqId: e.id }))).map((repair, idx) => (
                  <div key={`${repair.eqId}-${repair.id}-${idx}`} className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-700 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-red-950 dark:text-red-300">Sự cố</span>
                        <h4 className="font-bold text-[#263445] dark:text-white text-sm">{repair.equipmentName}</h4>
                      </div>
                      <p className="text-xs text-[#263445] dark:text-slate-300">{repair.issueDescription}</p>
                      <div className="flex flex-wrap gap-3 text-[11px] text-[#718096] dark:text-slate-500 mt-1.5">
                        <span>Báo bởi: <strong className="text-[#263445] dark:text-slate-300">{repair.reportedBy}</strong></span>
                        <span>Thời gian: {formatDateTimeVN(repair.reportedAt)}</span>
                        {repair.replacedParts && <span>Linh kiện thay: <strong className="text-[#263445] dark:text-slate-300">{repair.replacedParts}</strong></span>}
                      </div>
                    </div>
                    <div className="text-right flex flex-col md:items-end justify-center">
                      <span className="text-xs font-bold text-[#263445] dark:text-white">Chi phí: {repair.cost ? `${repair.cost.toLocaleString('vi-VN')} VNĐ` : 'Chưa có'}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 mt-1 inline-block">
                        {repair.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* FULL EQUIPMENT DOSSIER / DETAIL MODAL */}
      {detailEquipment && (
        <EquipmentDetailModal
          equipment={detailEquipment}
          onClose={() => setDetailEquipment(null)}
          onUpdate={refreshData}
          onDelete={handleDeleteEquipment}
        />
      )}

      {/* ADD EQUIPMENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full p-5 space-y-4 shadow-xl border border-[#DFE7F0] dark:border-slate-800 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-[#1976D2] dark:text-sky-400">
                <div className="w-9 h-9 rounded-lg bg-[#EAF4FF] dark:bg-sky-950/80 flex items-center justify-center">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#263445] dark:text-white leading-tight">Thêm Thiết Bị Mới Vào Hệ Thống</h3>
                  <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">Phân tách rõ thông tin lý lịch cố định và hồ sơ pháp lý, kiểm định, kiểm xạ, bảo dưỡng định kỳ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEquipment} className="space-y-4 text-xs">
              {/* PHẦN 1: THÔNG TIN CỐ ĐỊNH — LÝ LỊCH & THÔNG TIN THIẾT BỊ, NGÀY GHI THÊM, NGƯỜI QUẢN LÝ */}
              <div className="rounded-xl border border-[#DFE7F0] dark:border-sky-800/70 bg-[#F4F7FB]/60 dark:bg-slate-800/45">
                <div className="rounded-t-xl bg-[#EAF4FF] dark:bg-sky-950/60 px-4 py-2.5 border-b border-[#DFE7F0] dark:border-sky-800/70 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#1976D2] text-white text-[10px] font-bold uppercase tracking-wider">Phần 1</span>
                    <h4 className="text-xs font-bold text-[#155A9C] dark:text-sky-100 uppercase tracking-wide">
                      Thông Tin Cố Định: Lý Lịch Thiết Bị, Ngày Ghi Thêm &amp; Người Quản Lý
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-[#155A9C] dark:text-sky-300">Hồ sơ gốc cố định</span>
                </div>

                <div className="p-4 space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mã thiết bị (*):</label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: CT-128-02, XN-ROCHE-02"
                        value={newEqCode}
                        onChange={e => setNewEqCode(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                      />
                    </div>

                    <div className="sm:col-span-1 lg:col-span-2">
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên thiết bị y tế (*):</label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: Máy Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải"
                        value={newEqName}
                        onChange={e => setNewEqName(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bộ phận chuyên môn (*):</label>
                      <select
                        value={newEqCategory}
                        onChange={e => setNewEqCategory(e.target.value as any)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Chẩn đoán hình ảnh">Chẩn đoán hình ảnh (CT / MRI / X-Quang)</option>
                        <option value="Xét nghiệm">Xét nghiệm (Hóa sinh / Huyết học / Vi sinh)</option>
                        <option value="Siêu âm">Siêu âm màu / Thăm dò chức năng</option>
                        <option value="Nội soi">Nội soi tiêu hóa can thiệp</option>
                        <option value="Khác">Khác</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hãng sản xuất:</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Siemens Healthineers, Roche, GE"
                        value={newEqManufacturer}
                        onChange={e => setNewEqManufacturer(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nước sản xuất / Xuất xứ:</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: CHLB Đức, Nhật Bản, Thụy Sĩ, Mỹ"
                        value={newEqOrigin}
                        onChange={e => setNewEqOrigin(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Model máy:</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Somatom Go.Top 128, Lumina 3.0T"
                        value={newEqModel}
                        onChange={e => setNewEqModel(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số Serial máy (S/N):</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: SN-CT128-2025-998"
                        value={newEqSerial}
                        onChange={e => setNewEqSerial(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Năm sản xuất:</label>
                      <input
                        type="number"
                        min={1990}
                        max={2100}
                        value={newEqYear}
                        onChange={e => setNewEqYear(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Vị trí phòng đặt máy:</label>
                      <SearchableCombobox
                        value={newEqRoom}
                        onChange={setNewEqRoom}
                        options={roomOptions}
                        badgePosition="left"
                        placeholder="Chọn phòng trong danh sách..."
                        emptyOptionLabel="-- Bỏ trống (Chưa phân phòng) --"
                        noResultsLabel="Không tìm thấy phòng phù hợp"
                        inputClassName="!bg-white dark:!bg-slate-900 !border-slate-300 dark:!border-slate-700 !text-xs !py-2.5"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bác sĩ / Người quản lý phụ trách:</label>
                      <SearchableCombobox
                        value={newEqManager}
                        onChange={setNewEqManager}
                        options={staffComboboxOptions}
                        placeholder="Tìm bác sĩ / cán bộ quản lý hoặc bỏ trống..."
                        emptyOptionLabel="-- Bỏ trống (Chưa chỉ định) --"
                        noResultsLabel="Không tìm thấy nhân viên đang công tác"
                        inputClassName="!bg-white dark:!bg-slate-900 !border-slate-300 dark:!border-slate-700 !text-xs !py-2.5"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">KTV vận hành chính:</label>
                      <SearchableCombobox
                        value={newEqTech}
                        onChange={setNewEqTech}
                        options={staffComboboxOptions}
                        placeholder="Tìm kỹ thuật viên hoặc bỏ trống..."
                        emptyOptionLabel="-- Bỏ trống (Chưa phân công) --"
                        noResultsLabel="Không tìm thấy nhân viên đang công tác"
                        inputClassName="!bg-white dark:!bg-slate-900 !border-slate-300 dark:!border-slate-700 !text-xs !py-2.5"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày ghi thêm / Nhập thiết bị:</label>
                      <input
                        type="date"
                        value={newEqPurchaseDate}
                        onChange={e => setNewEqPurchaseDate(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày nghiệm thu / Lắp đặt:</label>
                      <input
                        type="date"
                        value={newEqInstallDate}
                        onChange={e => setNewEqInstallDate(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Đơn vị cung ứng / Phân phối:</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Siemens VN, Phương Đông Medical"
                        value={newEqSupplier}
                        onChange={e => setNewEqSupplier(e.target.value)}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Lý lịch máy &amp; Mô tả thông số kỹ thuật:</label>
                    <textarea
                      rows={2}
                      placeholder="Mô tả công nghệ đầu dò, số dãy lát cắt, công suất đo, quy chuẩn an toàn..."
                      value={newEqSpecs}
                      onChange={e => setNewEqSpecs(e.target.value)}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* PHẦN 2: GIẤY PHÉP, KIỂM ĐỊNH, KIỂM XẠ, BẢO DƯỠNG THIẾT BỊ & GHI CHÚ */}
              <div className="rounded-2xl border border-emerald-200/90 dark:border-emerald-800/70 bg-emerald-50/25 dark:bg-slate-800/45 overflow-hidden">
                <div className="bg-emerald-50/95 dark:bg-emerald-950/60 px-4 py-3 border-b border-emerald-200/80 dark:border-emerald-800/70 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[11px] font-black uppercase tracking-wider">Phần 2</span>
                    <h4 className="text-sm font-extrabold text-emerald-950 dark:text-emerald-100 uppercase tracking-wide">
                      Giấy Phép, Kiểm Định, Kiểm Xạ, Bảo Dưỡng &amp; Ghi Chú
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDefaults(durationDefaults);
                      setShowDurationSettingsModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold hover:bg-emerald-100/60 dark:hover:bg-emerald-950/50 transition-all cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Cài đặt mặc định thời hạn ({durationDefaults.permitMonths}/{durationDefaults.calibrationMonths}/{durationDefaults.radiationSurveyMonths}/{durationDefaults.maintenanceMonths}T)</span>
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* 2.1 GIẤY PHÉP */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        1. Giấy Phép
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Nhập Ngày cấp để tự tính Ngày hết hạn (hoặc nhập thủ công)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số giấy phép:</label>
                        <input
                          type="text"
                          placeholder="VD: GPHĐ-BYT/2026"
                          value={newEqPermitNumber}
                          onChange={e => setNewEqPermitNumber(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày cấp:</label>
                        <input
                          type="date"
                          value={newEqPermitIssueDate}
                          onChange={e => {
                            const val = e.target.value;
                            setNewEqPermitIssueDate(val);
                            if (val && newEqPermitDuration > 0) {
                              setNewEqPermitExpiry(addMonthsToISODate(val, newEqPermitDuration));
                              setPermitExpiryManual(false);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời hạn (tháng):</label>
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={newEqPermitDuration}
                          onChange={e => {
                            const months = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setNewEqPermitDuration(months);
                            if (newEqPermitIssueDate) {
                              setNewEqPermitExpiry(addMonthsToISODate(newEqPermitIssueDate, months));
                              setPermitExpiryManual(false);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          <span>Ngày hết hạn:</span>
                          {newEqPermitExpiry && (
                            <span className={`text-[10px] font-bold ${permitExpiryManual ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {permitExpiryManual ? 'Thủ công' : 'Tự động'}
                            </span>
                          )}
                        </label>
                        <input
                          type="date"
                          value={newEqPermitExpiry}
                          onChange={e => {
                            setNewEqPermitExpiry(e.target.value);
                            setPermitExpiryManual(true);
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2.2 KIỂM ĐỊNH */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                        2. Kiểm Định
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Số chứng chỉ KĐ (tùy chọn)"
                          value={newEqCalibNumber}
                          onChange={e => setNewEqCalibNumber(e.target.value)}
                          className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-sky-500 w-40"
                        />
                        <input
                          type="text"
                          placeholder="Đơn vị KĐ (Quatest...)"
                          value={newEqCalibAgency}
                          onChange={e => setNewEqCalibAgency(e.target.value)}
                          className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-sky-500 w-40"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày kiểm định:</label>
                        <input
                          type="date"
                          value={newEqCalibDate}
                          onChange={e => {
                            const val = e.target.value;
                            setNewEqCalibDate(val);
                            if (val && newEqCalibDuration > 0) {
                              setNewEqCalibExpiry(addMonthsToISODate(val, newEqCalibDuration));
                              setCalibExpiryManual(false);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời hạn (tháng):</label>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={newEqCalibDuration}
                          onChange={e => {
                            const months = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setNewEqCalibDuration(months);
                            if (newEqCalibDate) {
                              setNewEqCalibExpiry(addMonthsToISODate(newEqCalibDate, months));
                              setCalibExpiryManual(false);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          <span>Ngày hết hạn:</span>
                          {newEqCalibExpiry && (
                            <span className={`text-[10px] font-bold ${calibExpiryManual ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {calibExpiryManual ? 'Thủ công' : 'Tự động'}
                            </span>
                          )}
                        </label>
                        <input
                          type="date"
                          value={newEqCalibExpiry}
                          onChange={e => {
                            setNewEqCalibExpiry(e.target.value);
                            setCalibExpiryManual(true);
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2.3 KIỂM XẠ */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        3. Kiểm Xạ
                      </span>
                      <input
                        type="text"
                        placeholder="Số GP ATBX (nếu có: GP-ATBX-...)"
                        value={newEqRadLicense}
                        onChange={e => setNewEqRadLicense(e.target.value)}
                        className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-amber-500 w-56"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày kiểm xạ:</label>
                        <input
                          type="date"
                          value={newEqRadSurveyDate}
                          onChange={e => {
                            const val = e.target.value;
                            setNewEqRadSurveyDate(val);
                            if (val && newEqRadSurveyDuration > 0) {
                              setNewEqRadSurveyExpiry(addMonthsToISODate(val, newEqRadSurveyDuration));
                              setRadExpiryManual(false);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời hạn (tháng):</label>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={newEqRadSurveyDuration}
                          onChange={e => {
                            const months = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setNewEqRadSurveyDuration(months);
                            if (newEqRadSurveyDate) {
                              setNewEqRadSurveyExpiry(addMonthsToISODate(newEqRadSurveyDate, months));
                              setRadExpiryManual(false);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          <span>Ngày hết hạn:</span>
                          {newEqRadSurveyExpiry && (
                            <span className={`text-[10px] font-bold ${radExpiryManual ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {radExpiryManual ? 'Thủ công' : 'Tự động'}
                            </span>
                          )}
                        </label>
                        <input
                          type="date"
                          value={newEqRadSurveyExpiry}
                          onChange={e => {
                            setNewEqRadSurveyExpiry(e.target.value);
                            setRadExpiryManual(true);
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2.4 BẢO DƯỠNG */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        4. Bảo Dưỡng
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Tự động tính hạn kế tiếp từ Ngày bảo dưỡng + Thời hạn
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày bảo dưỡng:</label>
                        <input
                          type="date"
                          value={newEqLastMaintDate}
                          onChange={e => {
                            const val = e.target.value;
                            setNewEqLastMaintDate(val);
                            if (val && newEqInterval > 0) {
                              setNewEqNextMaintDate(addMonthsToISODate(val, newEqInterval));
                              setMaintExpiryManual(false);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời hạn (tháng):</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={newEqInterval}
                          onChange={e => {
                            const months = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setNewEqInterval(months);
                            if (newEqLastMaintDate) {
                              setNewEqNextMaintDate(addMonthsToISODate(newEqLastMaintDate, months));
                              setMaintExpiryManual(false);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          <span>Ngày hết hạn:</span>
                          {newEqNextMaintDate && (
                            <span className={`text-[10px] font-bold ${maintExpiryManual ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {maintExpiryManual ? 'Thủ công' : 'Tự động'}
                            </span>
                          )}
                        </label>
                        <input
                          type="date"
                          value={newEqNextMaintDate}
                          onChange={e => {
                            setNewEqNextMaintDate(e.target.value);
                            setMaintExpiryManual(true);
                          }}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2.5 GHI CHÚ */}
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">5. Ghi chú (Giấy phép, Kiểm định, Kiểm xạ, Bảo dưỡng...):</label>
                    <textarea
                      rows={2}
                      placeholder="Ghi chú thêm về tiến độ gia hạn giấy phép, lưu ý kiểm xạ phòng máy, lịch bảo dưỡng hoặc yêu cầu đặc biệt..."
                      value={newEqNotes}
                      onChange={e => setNewEqNotes(e.target.value)}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE7F0] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-[#F4F7FB] dark:bg-slate-800 text-[#263445] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-semibold hover:bg-[#EAF4FF] dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  Lưu Thiết Bị Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CÀI ĐẶT THỜI HẠN MẶC ĐỊNH TRƯỚC KHI NHẬP THIẾT BỊ */}
      {showDurationSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-[#DFE7F0] dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#EAF4FF] dark:bg-sky-950 text-[#1976D2] dark:text-sky-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#263445] dark:text-white">Cài Đặt Thời Hạn Mặc Định</h3>
                  <p className="text-[11px] text-[#718096] dark:text-slate-400">Tự động áp dụng khi nhập thiết bị mới</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDurationSettingsModal(false)}
                className="p-1.5 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDurationDefaults} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">1. Thời hạn Giấy phép</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Số tháng hiệu lực mặc định (VD: 60T = 5 năm)</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={240}
                      required
                      value={draftDefaults.permitMonths}
                      onChange={e => setDraftDefaults({ ...draftDefaults, permitMonths: parseInt(e.target.value, 10) || 1 })}
                      className="w-20 p-2 text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-600 dark:text-slate-300">tháng</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">2. Thời hạn Kiểm định</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Chu kỳ hiệu chuẩn / kiểm định (VD: 12T)</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      required
                      value={draftDefaults.calibrationMonths}
                      onChange={e => setDraftDefaults({ ...draftDefaults, calibrationMonths: parseInt(e.target.value, 10) || 1 })}
                      className="w-20 p-2 text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <span className="font-semibold text-slate-600 dark:text-slate-300">tháng</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">3. Thời hạn Kiểm xạ</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Chu kỳ đo kiểm xạ phòng máy (VD: 12T)</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      required
                      value={draftDefaults.radiationSurveyMonths}
                      onChange={e => setDraftDefaults({ ...draftDefaults, radiationSurveyMonths: parseInt(e.target.value, 10) || 1 })}
                      className="w-20 p-2 text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="font-semibold text-slate-600 dark:text-slate-300">tháng</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">4. Thời hạn Bảo dưỡng</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Chu kỳ bảo dưỡng định kỳ (VD: 3T hoặc 6T)</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      required
                      value={draftDefaults.maintenanceMonths}
                      onChange={e => setDraftDefaults({ ...draftDefaults, maintenanceMonths: parseInt(e.target.value, 10) || 1 })}
                      className="w-20 p-2 text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="font-semibold text-slate-600 dark:text-slate-300">tháng</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-[#155A9C] dark:text-sky-300 bg-[#EAF4FF] dark:bg-sky-950/30 p-2.5 rounded-lg border border-[#1976D2]/20 dark:border-sky-800/60">
                💡 Khi nhập thiết bị, chỉ cần chọn ngày bắt đầu, hệ thống sẽ tự động cộng số tháng thời hạn để ra <strong>Ngày hết hạn</strong>. Bạn vẫn có thể sửa lại Thời hạn hoặc Ngày hết hạn bất cứ lúc nào.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DFE7F0] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDurationSettingsModal(false)}
                  className="px-4 py-2 bg-[#F4F7FB] dark:bg-slate-800 text-[#263445] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-semibold hover:bg-[#EAF4FF] dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  Lưu Cài Đặt Mặc Định
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repair Report Modal */}
      {showRepairModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-[#DFE7F0] dark:border-slate-800">
            <h3 className="text-base font-bold text-[#263445] dark:text-white">🚨 Ghi Nhận Báo Sự Cố Thiết Bị</h3>
            <p className="text-xs text-[#718096] dark:text-slate-400">Thiết bị: <strong className="text-[#263445] dark:text-slate-200">{selectedItem.name}</strong> ({selectedItem.code})</p>
            
            <form onSubmit={handleAddRepairLog} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#263445] dark:text-slate-300 mb-1">Mô tả sự cố chi tiết:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ví dụ: Báo lỗi cảnh báo áp lực dầu tản nhiệt bóng X-quang..."
                  value={newRepairDesc}
                  onChange={e => setNewRepairDesc(e.target.value)}
                  className="w-full p-2.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#263445] dark:text-slate-300 mb-1">Dự toán chi phí sửa chữa (VNĐ):</label>
                <input
                  type="number"
                  placeholder="Ví dụ: 8500000"
                  value={newRepairCost}
                  onChange={e => setNewRepairCost(e.target.value)}
                  className="w-full p-2.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DFE7F0] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRepairModal(false)}
                  className="px-4 py-2 bg-[#F4F7FB] dark:bg-slate-800 text-[#263445] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-semibold hover:bg-[#EAF4FF] dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                >
                  Gửi Báo Cáo Sự Cố
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Maintenance Log Modal */}
      {showMaintenanceModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-[#DFE7F0] dark:border-slate-800">
            <h3 className="text-base font-bold text-[#263445] dark:text-white">🔧 Cập Nhật Lịch Bảo Trì / Kiểm Định</h3>
            <p className="text-xs text-[#718096] dark:text-slate-400">Thiết bị: <strong className="text-[#263445] dark:text-slate-200">{selectedItem.name}</strong></p>

            <form onSubmit={handleAddMaintenanceLog} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#263445] dark:text-slate-300 mb-1">Loại bảo trì:</label>
                <select
                  value={newMaintType}
                  onChange={e => setNewMaintType(e.target.value as any)}
                  className="w-full p-2.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2]"
                >
                  <option value="Định kỳ">Bảo trì Định kỳ</option>
                  <option value="Hiệu chuẩn">Hiệu chuẩn ISO</option>
                  <option value="Đột xuất">Bảo trì Đột xuất</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#263445] dark:text-slate-300 mb-1">Ghi chú &amp; Kết quả nghiệm thu:</label>
                <textarea
                  rows={3}
                  placeholder="Ghi chú nội dung kiểm tra..."
                  value={newMaintNotes}
                  onChange={e => setNewMaintNotes(e.target.value)}
                  className="w-full p-2.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DFE7F0] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="px-4 py-2 bg-[#F4F7FB] dark:bg-slate-800 text-[#263445] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-semibold hover:bg-[#EAF4FF] dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1976D2] text-white rounded-lg font-semibold hover:bg-[#155A9C] transition-colors shadow-xs cursor-pointer"
                >
                  Lưu Nhật Ký Bảo Trì
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA THIẾT BỊ KHỎI DANH SÁCH */}
      {showDeleteConfirm && deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-[#DFE7F0] dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#263445] dark:text-white">Xác Nhận Xóa Thiết Bị</h3>
                <p className="text-xs text-[#718096] dark:text-slate-400">Hành động này không thể hoàn tác sau khi thực hiện.</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F7FB] dark:bg-slate-800/60 border border-[#DFE7F0] dark:border-slate-700/80 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#718096] dark:text-slate-400">Mã thiết bị:</span>
                <span className="font-mono font-bold text-[#263445] dark:text-slate-200">{deleteTarget.code}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#718096] dark:text-slate-400 shrink-0">Tên thiết bị:</span>
                <span className="font-bold text-[#263445] dark:text-white text-right">{deleteTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#718096] dark:text-slate-400">Vị trí phòng:</span>
                <span className="font-medium text-[#263445] dark:text-slate-200">{deleteTarget.room}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#718096] dark:text-slate-400">Model / Xuất xứ:</span>
                <span className="text-[#263445] dark:text-slate-300">{deleteTarget.model} ({deleteTarget.originCountry || 'Chính hãng'})</span>
              </div>
            </div>

            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
              ⚠️ <strong>Cảnh báo:</strong> Khi xóa, toàn bộ thông tin lý lịch máy móc, dữ liệu lịch bảo dưỡng định kỳ và các biên bản sự cố liên quan sẽ bị xóa hoàn toàn khỏi danh sách hệ thống.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE7F0] dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 bg-[#F4F7FB] dark:bg-slate-800 hover:bg-[#EAF4FF] dark:hover:bg-slate-700 text-[#263445] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={() => handleDeleteEquipment(deleteTarget.id)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition-colors shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác Nhận Xóa Vĩnh Viễn</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST THÔNG BÁO HOÀN THÀNH THAO TÁC */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 dark:bg-emerald-950 text-white dark:text-emerald-100 px-4 py-3 rounded-2xl shadow-xl border border-slate-700 dark:border-emerald-800 flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
