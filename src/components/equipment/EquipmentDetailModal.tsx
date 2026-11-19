import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Wrench, ShieldCheck, AlertTriangle, CheckCircle2, Clock, 
  Calendar, User, MapPin, FileText, Cpu, Zap, Award, AlertCircle, 
  Plus, History, Printer, Check, Edit3, Save, Trash2, RotateCcw, AlertOctagon, Lock
} from 'lucide-react';
import { EquipmentItem, EquipmentStatus, MaintenanceLog, RepairLog, ParaclinicalRoom, StaffProfile, DepartmentUnit } from '../../types/hospital';
import { storageService } from '../../services/storageService';
import { formatDateVN, formatDateTimeVN, getTodayISODateVN, getNowVNString, isDatePastVN, addMonthsToISODate } from '../../utils/dateUtils';
import { formatRoomStorageValue, resolveRoomDisplay } from '../../utils/roomDisplay';
import { SearchableCombobox, ComboboxOption } from '../common/SearchableCombobox';
import { filterActiveStaffDisplayName, filterActiveStaffProfiles, getInactiveStaffMatchers } from '../../utils/staffStatus';
import {
  MANAGEMENT_TIER_META,
  resolveEffectiveUserAccess,
  canManageEquipmentTarget,
  filterSelectableRoomsForActor,
} from '../../utils/rbac';

interface EquipmentDetailModalProps {
  equipment: EquipmentItem;
  onClose: () => void;
  onUpdate: () => void;
  onDelete?: (equipmentId: string) => void;
  initialEdit?: boolean;
}

export const EquipmentDetailModal: React.FC<EquipmentDetailModalProps> = ({
  equipment,
  onClose,
  onUpdate,
  onDelete,
  initialEdit = false
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'maintenance' | 'repairs' | 'docs'>('profile');
  
  // Independent edit modes for Tab 1 (profile) and Tab 4 (docs)
  const [isEditingProfile, setIsEditingProfile] = useState(initialEdit);
  const [isEditingDocs, setIsEditingDocs] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveErrorMsg, setSaveErrorMsg] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmDeleteLog, setConfirmDeleteLog] = useState<{ type: 'maint' | 'repair'; id: string } | null>(null);
  const [roomsList, setRoomsList] = useState<ParaclinicalRoom[]>(() => storageService.getRooms());
  const [departmentsList, setDepartmentsList] = useState<DepartmentUnit[]>(() => storageService.getDepartments());
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>(() => storageService.getStaffProfiles());
  const [allUsers, setAllUsers] = useState(() => storageService.getUsers());

  useEffect(() => {
    return storageService.subscribe(() => {
      setRoomsList(storageService.getRooms());
      setDepartmentsList(storageService.getDepartments());
      setStaffProfiles(storageService.getStaffProfiles());
      setAllUsers(storageService.getUsers());
    });
  }, []);

  const currentUser = storageService.getCurrentUser();
  const actorAccess = useMemo(
    () => resolveEffectiveUserAccess(currentUser, staffProfiles, departmentsList, roomsList),
    [currentUser, staffProfiles, departmentsList, roomsList, allUsers]
  );

  const canEditEq = canManageEquipmentTarget(actorAccess, 'edit', equipment, roomsList, departmentsList);
  const canDeleteEq = canManageEquipmentTarget(actorAccess, 'delete', equipment, roomsList, departmentsList);
  const canMaintEq = canManageEquipmentTarget(actorAccess, 'maintenance', equipment, roomsList, departmentsList);
  const canRepairManageEq = canManageEquipmentTarget(actorAccess, 'repair_manage', equipment, roomsList, departmentsList);
  const canReportIssueEq = canManageEquipmentTarget(actorAccess, 'report_issue', equipment, roomsList, departmentsList);

  useEffect(() => {
    if (!canEditEq) {
      setIsEditingProfile(false);
      setIsEditingDocs(false);
    }
  }, [canEditEq]);

  const activeStaffProfiles = useMemo(
    () => filterActiveStaffProfiles(staffProfiles),
    [staffProfiles]
  );

  const inactiveStaff = useMemo(
    () => getInactiveStaffMatchers(staffProfiles),
    [staffProfiles]
  );

  const staffOptions: ComboboxOption[] = useMemo(
    () =>
      activeStaffProfiles.map((s) => ({
        value: s.fullName,
        label: s.fullName,
        badge: s.title || 'Nhân viên',
        subLabel: [s.departmentSection, s.room].filter(Boolean).join(' • ')
      })),
    [activeStaffProfiles]
  );

  // Tab 1: Profile form state
  const [editCode, setEditCode] = useState(equipment.code || '');
  const [editName, setEditName] = useState(equipment.name || '');
  const [editCategory, setEditCategory] = useState<EquipmentItem['category']>(equipment.category || 'Chẩn đoán hình ảnh');
  const [editModel, setEditModel] = useState(equipment.model || '');
  const [editManufacturer, setEditManufacturer] = useState(equipment.manufacturer || '');
  const [editOriginCountry, setEditOriginCountry] = useState(equipment.originCountry || '');
  const [editYearOfManufacture, setEditYearOfManufacture] = useState<number | string>(equipment.yearOfManufacture || '');
  const [editSerialNumber, setEditSerialNumber] = useState(equipment.serialNumber || '');
  const [editRoom, setEditRoom] = useState(() => {
    const initialRooms = storageService.getRooms();
    const resolved = resolveRoomDisplay(equipment.room, initialRooms);
    if (!equipment.room || equipment.room === 'Chưa phân phòng' || equipment.room === 'Kho thiết bị / Chưa phân phòng') {
      return '';
    }
    return resolved.matchedRoom ? formatRoomStorageValue(resolved.matchedRoom) : (equipment.room || '').trim();
  });
  const [editAssignedTechnician, setEditAssignedTechnician] = useState(() =>
    filterActiveStaffDisplayName(
      equipment.assignedTechnician,
      getInactiveStaffMatchers(storageService.getStaffProfiles()).names
    )
  );
  const [editManagerInCharge, setEditManagerInCharge] = useState(() =>
    filterActiveStaffDisplayName(
      equipment.managerInCharge,
      getInactiveStaffMatchers(storageService.getStaffProfiles()).names
    )
  );
  const [editInstallationDate, setEditInstallationDate] = useState(equipment.installationDate || '');
  const [editPurchaseDate, setEditPurchaseDate] = useState(equipment.purchaseDate || '');
  const [editPurchasePrice, setEditPurchasePrice] = useState<string>(equipment.purchasePrice ? String(equipment.purchasePrice) : '');
  const [editSupplier, setEditSupplier] = useState(equipment.supplier || '');
  const [editWarrantyExpiry, setEditWarrantyExpiry] = useState(equipment.warrantyExpiry || '');
  const [editMaintenanceIntervalMonths, setEditMaintenanceIntervalMonths] = useState<number>(equipment.maintenanceIntervalMonths || 3);
  const [editPowerSupply, setEditPowerSupply] = useState(equipment.powerSupply || '');
  const [editSpecifications, setEditSpecifications] = useState(equipment.specifications || '');

  // Tab 4: Phần 2 — Giấy phép, Kiểm định, Kiểm xạ, Bảo dưỡng & Ghi chú
  const defaultDurations = storageService.getEquipmentDurationDefaults();
  // 2.1 Giấy phép
  const [editOperatingPermitNumber, setEditOperatingPermitNumber] = useState(equipment.operatingPermitNumber || '');
  const [editOperatingPermitIssueDate, setEditOperatingPermitIssueDate] = useState(equipment.operatingPermitIssueDate || '');
  const [editOperatingPermitDurationMonths, setEditOperatingPermitDurationMonths] = useState<number>(
    equipment.operatingPermitDurationMonths || defaultDurations.permitMonths
  );
  const [editOperatingPermitExpiry, setEditOperatingPermitExpiry] = useState(equipment.operatingPermitExpiry || '');

  // 2.2 Kiểm định
  const [editCalibrationNumber, setEditCalibrationNumber] = useState(equipment.calibrationNumber || '');
  const [editCalibrationIssuedBy, setEditCalibrationIssuedBy] = useState(equipment.calibrationIssuedBy || '');
  const [editCalibrationDate, setEditCalibrationDate] = useState(equipment.calibrationDate || '');
  const [editCalibrationIntervalMonths, setEditCalibrationIntervalMonths] = useState<number>(
    equipment.calibrationIntervalMonths || defaultDurations.calibrationMonths
  );
  const [editCalibrationExpiry, setEditCalibrationExpiry] = useState(equipment.calibrationExpiry || '');

  // 2.3 Kiểm xạ
  const [editRadiationLicenseNumber, setEditRadiationLicenseNumber] = useState(equipment.radiationLicenseNumber || '');
  const [editRadiationLicenseIssuedBy, setEditRadiationLicenseIssuedBy] = useState(equipment.radiationLicenseIssuedBy || '');
  const [editRadiationLicenseExpiry, setEditRadiationLicenseExpiry] = useState(equipment.radiationLicenseExpiry || '');
  const [editRadiationSurveyDate, setEditRadiationSurveyDate] = useState(equipment.radiationSurveyDate || '');
  const [editRadiationSurveyIntervalMonths, setEditRadiationSurveyIntervalMonths] = useState<number>(
    equipment.radiationSurveyIntervalMonths || defaultDurations.radiationSurveyMonths
  );
  const [editRadiationSurveyExpiry, setEditRadiationSurveyExpiry] = useState(equipment.radiationSurveyExpiry || '');

  // 2.4 Bảo dưỡng
  const [editLastMaintenanceDate, setEditLastMaintenanceDate] = useState(equipment.lastMaintenanceDate || '');
  const [editNextMaintenanceDate, setEditNextMaintenanceDate] = useState(equipment.nextMaintenanceDate || '');

  // 2.5 Ghi chú
  const [editNotes, setEditNotes] = useState(equipment.notes || '');

  // Quick Status change
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<EquipmentStatus>(equipment.status || 'Hoạt động tốt');

  // Tab 2: Maintenance Add & Edit State
  const [showAddMaint, setShowAddMaint] = useState(false);
  const [editingMaintLog, setEditingMaintLog] = useState<MaintenanceLog | null>(null);
  const [maintType, setMaintType] = useState<'Định kỳ' | 'Đột xuất' | 'Hiệu chuẩn' | 'Sửa chữa'>('Định kỳ');
  const [maintDate, setMaintDate] = useState(getTodayISODateVN());
  const [maintPerformer, setMaintPerformer] = useState(storageService.getCurrentUser().name);
  const [maintResult, setMaintResult] = useState<'Đạt' | 'Cần theo dõi' | 'Không đạt'>('Đạt');
  const [maintNotes, setMaintNotes] = useState('');
  const [maintCost, setMaintCost] = useState('');
  const [maintNextDue, setMaintNextDue] = useState(
    new Date(Date.now() + (equipment.maintenanceIntervalMonths || 3) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  // Tab 3: Repair Add & Edit State
  const [showAddRepair, setShowAddRepair] = useState(false);
  const [editingRepairLog, setEditingRepairLog] = useState<RepairLog | null>(null);
  const [repairDesc, setRepairDesc] = useState('');
  const [repairParts, setRepairParts] = useState('');
  const [repairCost, setRepairCost] = useState('');
  const [repairTechnician, setRepairTechnician] = useState('Kỹ sư Hãng / KTV Phụ trách');
  const [repairStatus, setRepairStatus] = useState<'Đang xử lý' | 'Đang chờ linh kiện' | 'Đã khôi phục'>('Đang xử lý');

  // Reset form when equipment prop changes
  useEffect(() => {
    setEditCode(equipment.code || '');
    setEditName(equipment.name || '');
    setEditCategory(equipment.category || 'Chẩn đoán hình ảnh');
    setEditModel(equipment.model || '');
    setEditManufacturer(equipment.manufacturer || '');
    setEditOriginCountry(equipment.originCountry || '');
    setEditYearOfManufacture(equipment.yearOfManufacture || '');
    setEditSerialNumber(equipment.serialNumber || '');
    const latestRooms = storageService.getRooms();
    const resolvedRoom = resolveRoomDisplay(equipment.room, latestRooms);
    const normalizedRoom =
      !equipment.room || equipment.room === 'Chưa phân phòng' || equipment.room === 'Kho thiết bị / Chưa phân phòng'
        ? ''
        : resolvedRoom.matchedRoom
        ? formatRoomStorageValue(resolvedRoom.matchedRoom)
        : (equipment.room || '').trim();
    setEditRoom(normalizedRoom);
    setEditAssignedTechnician(
      filterActiveStaffDisplayName(equipment.assignedTechnician, inactiveStaff.names)
    );
    setEditManagerInCharge(
      filterActiveStaffDisplayName(equipment.managerInCharge, inactiveStaff.names)
    );
    setEditInstallationDate(equipment.installationDate || '');
    setEditPurchaseDate(equipment.purchaseDate || '');
    setEditPurchasePrice(equipment.purchasePrice ? String(equipment.purchasePrice) : '');
    setEditSupplier(equipment.supplier || '');
    setEditWarrantyExpiry(equipment.warrantyExpiry || '');
    setEditMaintenanceIntervalMonths(equipment.maintenanceIntervalMonths || 3);
    setEditPowerSupply(equipment.powerSupply || '');
    setEditSpecifications(equipment.specifications || '');

    const latestDefaults = storageService.getEquipmentDurationDefaults();
    setEditOperatingPermitNumber(equipment.operatingPermitNumber || '');
    setEditOperatingPermitIssueDate(equipment.operatingPermitIssueDate || '');
    setEditOperatingPermitDurationMonths(equipment.operatingPermitDurationMonths || latestDefaults.permitMonths);
    setEditOperatingPermitExpiry(equipment.operatingPermitExpiry || '');
    setEditRadiationLicenseNumber(equipment.radiationLicenseNumber || '');
    setEditRadiationLicenseIssuedBy(equipment.radiationLicenseIssuedBy || '');
    setEditRadiationLicenseExpiry(equipment.radiationLicenseExpiry || '');
    setEditRadiationSurveyDate(equipment.radiationSurveyDate || '');
    setEditRadiationSurveyIntervalMonths(equipment.radiationSurveyIntervalMonths || latestDefaults.radiationSurveyMonths);
    setEditRadiationSurveyExpiry(equipment.radiationSurveyExpiry || '');
    setEditCalibrationNumber(equipment.calibrationNumber || '');
    setEditCalibrationIssuedBy(equipment.calibrationIssuedBy || '');
    setEditCalibrationDate(equipment.calibrationDate || '');
    setEditCalibrationIntervalMonths(equipment.calibrationIntervalMonths || latestDefaults.calibrationMonths);
    setEditCalibrationExpiry(equipment.calibrationExpiry || '');
    setEditLastMaintenanceDate(equipment.lastMaintenanceDate || '');
    setEditNextMaintenanceDate(equipment.nextMaintenanceDate || '');
    setEditNotes(equipment.notes || '');

    setCurrentStatus(equipment.status || 'Hoạt động tốt');
  }, [equipment]);

  const showNotification = (msg: string) => {
    setSaveErrorMsg('');
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  const showErrorNotice = (msg: string) => {
    setSaveSuccessMsg('');
    setSaveErrorMsg(msg);
    setTimeout(() => setSaveErrorMsg(''), 4500);
  };

  const handleSaveStatus = (newStatus: EquipmentStatus) => {
    if (!canEditEq) {
      showErrorNotice('Bạn không có quyền thay đổi trạng thái thiết bị ngoài phạm vi quản lý.');
      setIsChangingStatus(false);
      return;
    }
    const updated: EquipmentItem = {
      ...equipment,
      status: newStatus
    };
    storageService.saveEquipment(updated);
    setCurrentStatus(newStatus);
    setIsChangingStatus(false);
    showNotification('Đã cập nhật trạng thái thiết bị!');
    onUpdate();
  };

  // --- SAVE TAB 1: PROFILE ---
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditEq) {
      showErrorNotice('Bạn không có quyền chỉnh sửa lý lịch thiết bị ngoài phạm vi quản lý.');
      return;
    }
    if (!editName.trim() || !editCode.trim()) {
      showErrorNotice('Vui lòng nhập đầy đủ Mã thiết bị và Tên thiết bị.');
      return;
    }
    const targetRoomVal = editRoom.trim() || 'Chưa phân phòng';
    if (
      !actorAccess.isDepartmentWide &&
      !canManageEquipmentTarget(actorAccess, 'edit', { category: editCategory, room: targetRoomVal }, roomsList, departmentsList)
    ) {
      showErrorNotice('Không thể chuyển thiết bị sang phòng/bộ phận ngoài phạm vi quản lý của bạn.');
      return;
    }

    const updatedItem: EquipmentItem = {
      ...equipment,
      code: editCode.trim(),
      name: editName.trim(),
      category: editCategory,
      model: editModel.trim(),
      manufacturer: editManufacturer.trim(),
      originCountry: editOriginCountry.trim() || undefined,
      yearOfManufacture: editYearOfManufacture ? Number(editYearOfManufacture) : undefined,
      serialNumber: editSerialNumber.trim(),
      room: editRoom.trim() || 'Chưa phân phòng',
      assignedTechnician: editAssignedTechnician.trim(),
      managerInCharge: editManagerInCharge.trim() || undefined,
      installationDate: editInstallationDate || equipment.installationDate,
      purchaseDate: editPurchaseDate || undefined,
      purchasePrice: editPurchasePrice ? parseInt(editPurchasePrice) : undefined,
      supplier: editSupplier.trim() || undefined,
      warrantyExpiry: editWarrantyExpiry || undefined,
      maintenanceIntervalMonths: Number(editMaintenanceIntervalMonths) || 3,
      powerSupply: editPowerSupply.trim() || undefined,
      specifications: editSpecifications.trim() || undefined
    };

    storageService.saveEquipment(updatedItem);
    setIsEditingProfile(false);
    showNotification('Đã lưu cập nhật Lý Lịch & Hồ Sơ Máy thành công!');
    onUpdate();
  };

  const handleCancelProfile = () => {
    setEditCode(equipment.code || '');
    setEditName(equipment.name || '');
    setEditCategory(equipment.category || 'Chẩn đoán hình ảnh');
    setEditModel(equipment.model || '');
    setEditManufacturer(equipment.manufacturer || '');
    setEditOriginCountry(equipment.originCountry || '');
    setEditYearOfManufacture(equipment.yearOfManufacture || '');
    setEditSerialNumber(equipment.serialNumber || '');
    const resolvedRoom = resolveRoomDisplay(equipment.room, roomsList);
    const normalizedRoom =
      !equipment.room || equipment.room === 'Chưa phân phòng' || equipment.room === 'Kho thiết bị / Chưa phân phòng'
        ? ''
        : resolvedRoom.matchedRoom
        ? formatRoomStorageValue(resolvedRoom.matchedRoom)
        : (equipment.room || '').trim();
    setEditRoom(normalizedRoom);
    setEditAssignedTechnician(
      filterActiveStaffDisplayName(equipment.assignedTechnician, inactiveStaff.names)
    );
    setEditManagerInCharge(
      filterActiveStaffDisplayName(equipment.managerInCharge, inactiveStaff.names)
    );
    setEditInstallationDate(equipment.installationDate || '');
    setEditPurchaseDate(equipment.purchaseDate || '');
    setEditPurchasePrice(equipment.purchasePrice ? String(equipment.purchasePrice) : '');
    setEditSupplier(equipment.supplier || '');
    setEditWarrantyExpiry(equipment.warrantyExpiry || '');
    setEditMaintenanceIntervalMonths(equipment.maintenanceIntervalMonths || 3);
    setEditPowerSupply(equipment.powerSupply || '');
    setEditSpecifications(equipment.specifications || '');
    setIsEditingProfile(false);
  };

  // --- SAVE TAB 4: PHẦN 2 (GIẤY PHÉP, KIỂM ĐỊNH, KIỂM XẠ, BẢO DƯỠNG & GHI CHÚ) ---
  const handleSaveDocs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditEq) {
      showErrorNotice('Bạn không có quyền chỉnh sửa giấy phép, kiểm định thiết bị này.');
      return;
    }
    const updatedItem: EquipmentItem = {
      ...equipment,
      operatingPermitNumber: editOperatingPermitNumber.trim() || undefined,
      operatingPermitIssueDate: editOperatingPermitIssueDate || undefined,
      operatingPermitDurationMonths: Number(editOperatingPermitDurationMonths) || undefined,
      operatingPermitExpiry: editOperatingPermitExpiry || undefined,
      radiationLicenseNumber: editRadiationLicenseNumber.trim() || undefined,
      radiationLicenseIssuedBy: editRadiationLicenseIssuedBy.trim() || undefined,
      radiationLicenseExpiry: editRadiationLicenseExpiry || editRadiationSurveyExpiry || undefined,
      radiationSurveyDate: editRadiationSurveyDate || undefined,
      radiationSurveyIntervalMonths: Number(editRadiationSurveyIntervalMonths) || undefined,
      radiationSurveyExpiry: editRadiationSurveyExpiry || undefined,
      calibrationNumber: editCalibrationNumber.trim() || undefined,
      calibrationIssuedBy: editCalibrationIssuedBy.trim() || undefined,
      calibrationDate: editCalibrationDate || undefined,
      calibrationIntervalMonths: Number(editCalibrationIntervalMonths) || undefined,
      calibrationExpiry: editCalibrationExpiry || undefined,
      maintenanceIntervalMonths: Number(editMaintenanceIntervalMonths) || 3,
      lastMaintenanceDate: editLastMaintenanceDate || equipment.lastMaintenanceDate,
      nextMaintenanceDate: editNextMaintenanceDate || equipment.nextMaintenanceDate,
      notes: editNotes.trim() || undefined
    };

    storageService.saveEquipment(updatedItem);
    setIsEditingDocs(false);
    showNotification('Đã lưu cập nhật Giấy Phép, Kiểm Định, Kiểm Xạ, Bảo Dưỡng & Ghi Chú!');
    onUpdate();
  };

  const handleCancelDocs = () => {
    const latestDefaults = storageService.getEquipmentDurationDefaults();
    setEditOperatingPermitNumber(equipment.operatingPermitNumber || '');
    setEditOperatingPermitIssueDate(equipment.operatingPermitIssueDate || '');
    setEditOperatingPermitDurationMonths(equipment.operatingPermitDurationMonths || latestDefaults.permitMonths);
    setEditOperatingPermitExpiry(equipment.operatingPermitExpiry || '');
    setEditRadiationLicenseNumber(equipment.radiationLicenseNumber || '');
    setEditRadiationLicenseIssuedBy(equipment.radiationLicenseIssuedBy || '');
    setEditRadiationLicenseExpiry(equipment.radiationLicenseExpiry || '');
    setEditRadiationSurveyDate(equipment.radiationSurveyDate || '');
    setEditRadiationSurveyIntervalMonths(equipment.radiationSurveyIntervalMonths || latestDefaults.radiationSurveyMonths);
    setEditRadiationSurveyExpiry(equipment.radiationSurveyExpiry || '');
    setEditCalibrationNumber(equipment.calibrationNumber || '');
    setEditCalibrationIssuedBy(equipment.calibrationIssuedBy || '');
    setEditCalibrationDate(equipment.calibrationDate || '');
    setEditCalibrationIntervalMonths(equipment.calibrationIntervalMonths || latestDefaults.calibrationMonths);
    setEditCalibrationExpiry(equipment.calibrationExpiry || '');
    setEditMaintenanceIntervalMonths(equipment.maintenanceIntervalMonths || 3);
    setEditLastMaintenanceDate(equipment.lastMaintenanceDate || '');
    setEditNextMaintenanceDate(equipment.nextMaintenanceDate || '');
    setEditNotes(equipment.notes || '');
    setIsEditingDocs(false);
  };

  // --- TAB 2: MAINTENANCE ADD, EDIT, DELETE ---
  const handleAddMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMaintEq) {
      showErrorNotice('Bạn không có quyền ghi nhật ký bảo trì thiết bị này.');
      return;
    }
    const log: MaintenanceLog = {
      id: `MNT-${Date.now()}`,
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      date: maintDate,
      type: maintType,
      performedBy: maintPerformer,
      result: maintResult,
      notes: maintNotes || 'Đã kiểm tra dải đo, hiệu chuẩn thông số vận hành và kiểm tra hệ thống bảo hộ an toàn.',
      nextDueDate: maintNextDue,
      cost: maintCost ? parseInt(maintCost) : undefined
    };
    storageService.addMaintenanceLog(equipment.id, log);
    setShowAddMaint(false);
    setMaintNotes('');
    setMaintCost('');
    showNotification('Đã lưu thêm biên bản bảo trì mới!');
    onUpdate();
  };

  const handleStartEditMaint = (log: MaintenanceLog) => {
    if (!canMaintEq) return;
    setEditingMaintLog(log);
    setMaintType(log.type);
    setMaintDate(log.date);
    setMaintPerformer(log.performedBy);
    setMaintResult(log.result);
    setMaintNotes(log.notes);
    setMaintCost(log.cost ? String(log.cost) : '');
    setMaintNextDue(log.nextDueDate || '');
  };

  const handleSaveEditMaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaintLog || !canMaintEq) return;
    const updated: MaintenanceLog = {
      ...editingMaintLog,
      type: maintType,
      date: maintDate,
      performedBy: maintPerformer,
      result: maintResult,
      notes: maintNotes,
      cost: maintCost ? parseInt(maintCost) : undefined,
      nextDueDate: maintNextDue
    };
    storageService.updateMaintenanceLog(equipment.id, updated);
    setEditingMaintLog(null);
    showNotification('Đã cập nhật chỉnh sửa nhật ký bảo trì!');
    onUpdate();
  };

  const handleDeleteMaintenance = (logId: string) => {
    if (!canMaintEq) {
      showErrorNotice('Bạn không có quyền xóa nhật ký bảo trì thiết bị này.');
      return;
    }
    setConfirmDeleteLog({ type: 'maint', id: logId });
  };

  // --- TAB 3: REPAIR ADD, EDIT, DELETE ---
  const handleAddRepair = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repairDesc || !canReportIssueEq) return;
    const log: RepairLog = {
      id: `RPR-${Date.now()}`,
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      issueDescription: repairDesc,
      reportedBy: storageService.getCurrentUser().name,
      reportedAt: getNowVNString(),
      replacedParts: repairParts || undefined,
      cost: repairCost ? parseInt(repairCost) : undefined,
      status: 'Đang xử lý',
      technician: repairTechnician
    };
    storageService.addRepairLog(equipment.id, log);
    setShowAddRepair(false);
    setRepairDesc('');
    setRepairParts('');
    setRepairCost('');
    showNotification('Đã ghi nhận báo cáo sự cố & lưu vào nhật ký!');
    onUpdate();
  };

  const handleStartEditRepair = (log: RepairLog) => {
    if (!canRepairManageEq) return;
    setEditingRepairLog(log);
    setRepairDesc(log.issueDescription);
    setRepairParts(log.replacedParts || '');
    setRepairCost(log.cost ? String(log.cost) : '');
    setRepairTechnician(log.technician || '');
    setRepairStatus(log.status);
  };

  const handleSaveEditRepair = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRepairLog || !canRepairManageEq) return;
    const updated: RepairLog = {
      ...editingRepairLog,
      issueDescription: repairDesc,
      replacedParts: repairParts || undefined,
      cost: repairCost ? parseInt(repairCost) : undefined,
      technician: repairTechnician,
      status: repairStatus
    };
    storageService.updateRepairLog(equipment.id, updated);
    setEditingRepairLog(null);
    showNotification('Đã cập nhật chỉnh sửa nhật ký sự cố!');
    onUpdate();
  };

  const handleDeleteRepair = (logId: string) => {
    if (!canRepairManageEq) {
      showErrorNotice('Bạn không có quyền xóa bản ghi sự cố thiết bị này.');
      return;
    }
    setConfirmDeleteLog({ type: 'repair', id: logId });
  };

  const handleConfirmDeleteLog = () => {
    if (!confirmDeleteLog) return;
    if (confirmDeleteLog.type === 'maint' && canMaintEq) {
      storageService.deleteMaintenanceLog(equipment.id, confirmDeleteLog.id);
      showNotification('Đã xóa dòng nhật ký bảo trì!');
      onUpdate();
    } else if (confirmDeleteLog.type === 'repair' && canRepairManageEq) {
      storageService.deleteRepairLog(equipment.id, confirmDeleteLog.id);
      showNotification('Đã xóa dòng nhật ký sự cố!');
      onUpdate();
    }
    setConfirmDeleteLog(null);
  };

  const getStatusBadge = (status: EquipmentStatus) => {
    switch (status) {
      case 'Hoạt động tốt':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Hoạt động tốt
          </span>
        );
      case 'Cần bảo trì':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Cần bảo trì
          </span>
        );
      case 'Sự cố hỏng hóc':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            Sự cố hỏng hóc
          </span>
        );
      case 'Đang hiệu chuẩn':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 animate-pulse" />
            Đang hiệu chuẩn
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            Tạm ngưng
          </span>
        );
    }
  };

  const headerRoomDisplay = useMemo(
    () => resolveRoomDisplay(equipment.room, roomsList),
    [equipment.room, roomsList]
  );

  const selectableRooms = useMemo(
    () => (actorAccess.isDepartmentWide ? roomsList : filterSelectableRoomsForActor(actorAccess, roomsList)),
    [actorAccess, roomsList]
  );

  const roomOptions: ComboboxOption[] = useMemo(() => {
    const opts: ComboboxOption[] = selectableRooms.map((r) => {
      const full = formatRoomStorageValue(r);
      return {
        value: full,
        label: r.name,
        badge: r.code || undefined,
        closedLabel: full,
        subLabel: [r.departmentSection, r.floor, r.status].filter(Boolean).join(' • ')
      };
    });
    const current = editRoom.trim();
    if (
      current &&
      current !== 'Chưa phân phòng' &&
      !opts.some((opt) => opt.value.toLowerCase() === current.toLowerCase())
    ) {
      opts.unshift({
        value: current,
        label: current,
        badge: 'Hiện tại',
        closedLabel: current,
        subLabel: 'Vị trí phòng đang lưu trước đó'
      });
    }
    return opts;
  }, [selectableRooms, editRoom]);

  const isNextMaintenanceOverdue = isDatePastVN(equipment.nextMaintenanceDate);
  const radExpirySummary = equipment.radiationSurveyExpiry || equipment.radiationLicenseExpiry;
  const isRadiationOverdue = radExpirySummary ? isDatePastVN(radExpirySummary) : false;
  const isCalibrationOverdue = equipment.calibrationExpiry ? isDatePastVN(equipment.calibrationExpiry) : false;

  return (
    <div id="equipment-detail-modal-backdrop" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div 
        id="equipment-detail-modal-container" 
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header Bar */}
        <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-500/20 shrink-0 mt-0.5">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 uppercase tracking-wider">
                  {equipment.code}
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {equipment.category}
                </span>
                {getStatusBadge(currentStatus)}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                {equipment.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Hãng SX: <strong className="text-slate-700 dark:text-slate-200">{equipment.manufacturer}</strong> ({equipment.originCountry || 'Chính hãng'})</span>
                <span>•</span>
                <span>Model: <strong className="text-slate-700 dark:text-slate-200">{equipment.model}</strong></span>
                <span>•</span>
                <span>Số Serial: <strong className="text-slate-700 dark:text-slate-200">{equipment.serialNumber}</strong></span>
              </p>
            </div>
          </div>

          {/* Header Quick Actions & Status */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap justify-end">
            {saveSuccessMsg && (
              <span className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1 border border-emerald-300 dark:border-emerald-800 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                {saveSuccessMsg}
              </span>
            )}
            {saveErrorMsg && (
              <span className="px-3 py-1.5 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-bold flex items-center gap-1 border border-rose-300 dark:border-rose-800 animate-in fade-in">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                {saveErrorMsg}
              </span>
            )}

            {canEditEq && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsChangingStatus(!isChangingStatus)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 shadow-xs hover:shadow-sm"
                >
                  <span>Đổi trạng thái</span>
                </button>
                {isChangingStatus && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-30">
                    {(['Hoạt động tốt', 'Cần bảo trì', 'Sự cố hỏng hóc', 'Đang hiệu chuẩn', 'Tạm ngưng'] as EquipmentStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleSaveStatus(st)}
                        className={`w-full px-3 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                          currentStatus === st ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{st}</span>
                        {currentStatus === st && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canDeleteEq && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="p-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl border border-rose-200 dark:border-rose-900/60 transition-all shadow-xs"
                title="Xóa thiết bị này khỏi danh sách"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="p-2.5 text-slate-700 hover:text-indigo-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 transition-all shadow-xs"
              title="In phiếu lý lịch máy"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 transition-all shadow-xs"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Highlights Summary Grid */}
        <div className="p-4 sm:px-6 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-xs">
            <span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium flex items-center gap-1">
              <MapPin className="w-3 h-3 text-indigo-500" /> Vị trí phòng máy
            </span>
            <div className="mt-1 flex items-center gap-1.5 min-w-0" title={headerRoomDisplay.fullLabel}>
              {headerRoomDisplay.code && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                  {headerRoomDisplay.code}
                </span>
              )}
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                {headerRoomDisplay.name}
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-xs">
            <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold flex items-center gap-1">
              <Calendar className="w-3 h-3 text-amber-500" /> Lịch Bảo Dưỡng
            </span>
            <p className={`text-xs font-bold mt-1 ${isNextMaintenanceOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
              {formatDateVN(equipment.nextMaintenanceDate)} {isNextMaintenanceOverdue && '⚠️ Quá hạn'}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-xs">
            <span className="text-[11px] text-sky-700 dark:text-sky-300 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-sky-500" /> Hạn Kiểm Định
            </span>
            <p className={`text-xs font-bold mt-1 ${isCalibrationOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
              {equipment.calibrationExpiry ? formatDateVN(equipment.calibrationExpiry) : 'Định kỳ hàng năm'} {isCalibrationOverdue && '⚠️ Quá hạn'}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-xs">
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1">
              <Award className="w-3 h-3 text-amber-500" /> Hạn Cấp Phép & Kiểm Xạ
            </span>
            <p className={`text-xs font-bold mt-1 ${isRadiationOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
              {radExpirySummary ? `KX: ${formatDateVN(radExpirySummary)}` : (equipment.operatingPermitExpiry ? `GP: ${formatDateVN(equipment.operatingPermitExpiry)}` : 'Đang cập nhật')} {isRadiationOverdue && '⚠️ Quá hạn'}
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Always Accessible & Highly Visible) */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar p-1.5 bg-slate-200/80 dark:bg-slate-800/90 rounded-2xl border border-slate-300/80 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'profile'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.02]'
                  : 'bg-white/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs'
              }`}
            >
              <FileText className={`w-4 h-4 ${activeTab === 'profile' ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
              <span>Phần 1: Lý Lịch &amp; Thông Tin Cố Định</span>
              {isEditingProfile && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'profile' ? 'bg-amber-300 text-amber-950' : 'bg-amber-100 text-amber-800'}`}>
                  Đang sửa
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'docs'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.02]'
                  : 'bg-white/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs'
              }`}
            >
              <Award className={`w-4 h-4 ${activeTab === 'docs' ? 'text-white' : 'text-sky-600 dark:text-sky-400'}`} />
              <span>Phần 2: Giấy Phép, Kiểm Định, Kiểm Xạ &amp; Bảo Dưỡng</span>
              {isEditingDocs && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'docs' ? 'bg-amber-300 text-amber-950' : 'bg-amber-100 text-amber-800'}`}>
                  Đang sửa
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('maintenance')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'maintenance'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.02]'
                  : 'bg-white/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs'
              }`}
            >
              <History className={`w-4 h-4 ${activeTab === 'maintenance' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Nhật Ký Bảo Trì &amp; Hiệu Chuẩn</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                activeTab === 'maintenance' 
                  ? 'bg-white/30 text-white' 
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
              }`}>
                {equipment.maintenanceHistory?.length || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('repairs')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'repairs'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.02]'
                  : 'bg-white/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs'
              }`}
            >
              <AlertTriangle className={`w-4 h-4 ${activeTab === 'repairs' ? 'text-white' : 'text-rose-500 dark:text-rose-400'}`} />
              <span>Nhật Ký Sự Cố &amp; Sửa Chữa</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                activeTab === 'repairs' 
                  ? 'bg-white/30 text-white' 
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
              }`}>
                {equipment.repairHistory?.length || 0}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Content Body (Scrollable) */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">

          {/* =========================================================================
              TAB 1: LÝ LỊCH & HỒ SƠ MÁY (CHO PHÉP CHỈNH SỬA TOÀN BỘ LÝ LỊCH)
              ========================================================================= */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/80 dark:bg-indigo-950/40 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 shadow-xs">
                <div className="flex items-center gap-2.5 text-xs text-indigo-950 dark:text-indigo-200">
                  <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>
                    Hồ sơ lý lịch kỹ thuật gốc của máy. Áp dụng quyền <strong>Chỉnh Sửa Hồ Sơ</strong> để cập nhật thông tin thiết bị.
                  </span>
                </div>
                {canEditEq ? (
                  !isEditingProfile ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md hover:shadow-lg shadow-indigo-600/20 active:scale-95 shrink-0"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Chỉnh Sửa Lý Lịch & Hồ Sơ Máy</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCancelProfile}
                        className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 shadow-xs"
                      >
                        Hủy bỏ
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/25 active:scale-95"
                      >
                        <Save className="w-4 h-4" />
                        <span>Lưu Hồ Sơ Máy</span>
                      </button>
                    </div>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold shrink-0">
                    <Lock className="w-3.5 h-3.5" /> Chế độ chỉ xem (ngoài phạm vi)
                  </span>
                )}
              </div>

              {isEditingProfile ? (
                /* FORM CHỈNH SỬA LÝ LỊCH & HỒ SƠ */
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  {/* Block 1: Thông tin quản lý & xuất xứ */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      1. Thông Tin Quản Lý & Xuất Xứ Thiết Bị
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mã thiết bị nội bộ (*):</label>
                        <input
                          type="text"
                          required
                          value={editCode}
                          onChange={e => setEditCode(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên máy chính thức (*):</label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bộ phận chuyên môn (*):</label>
                        <select
                          value={editCategory}
                          onChange={e => setEditCategory(e.target.value as any)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                        >
                          <option value="Chẩn đoán hình ảnh">Chẩn đoán hình ảnh</option>
                          <option value="Xét nghiệm">Xét nghiệm</option>
                          <option value="Siêu âm">Siêu âm màu</option>
                          <option value="Nội soi">Nội soi can thiệp</option>
                          <option value="Khác">Khác</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hãng sản xuất:</label>
                        <input
                          type="text"
                          value={editManufacturer}
                          onChange={e => setEditManufacturer(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nước sản xuất:</label>
                        <input
                          type="text"
                          value={editOriginCountry}
                          onChange={e => setEditOriginCountry(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Năm sản xuất:</label>
                        <input
                          type="number"
                          value={editYearOfManufacture}
                          onChange={e => setEditYearOfManufacture(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Model / Ký hiệu:</label>
                        <input
                          type="text"
                          value={editModel}
                          onChange={e => setEditModel(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số Serial máy (S/N):</label>
                        <input
                          type="text"
                          value={editSerialNumber}
                          onChange={e => setEditSerialNumber(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Đơn vị cung ứng / Đại diện hãng:</label>
                        <input
                          type="text"
                          value={editSupplier}
                          onChange={e => setEditSupplier(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Block 2: Vị trí phòng máy, bàn giao & nhân sự */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      2. Vị Trí Lắp Đặt, Nhân Sự & Thời Gian Tiếp Nhận
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Vị trí phòng máy (*):</label>
                        <SearchableCombobox
                          value={editRoom}
                          onChange={setEditRoom}
                          options={roomOptions}
                          badgePosition="left"
                          placeholder="Chọn phòng trong danh sách..."
                          emptyOptionLabel="-- Bỏ trống (Chưa phân phòng) --"
                          noResultsLabel="Không tìm thấy phòng phù hợp"
                          inputClassName="!bg-white dark:!bg-slate-900 !border-slate-200 dark:!border-slate-700 !text-xs !py-2.5 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bác sĩ / Cán bộ quản lý:</label>
                        <SearchableCombobox
                          value={editManagerInCharge}
                          onChange={setEditManagerInCharge}
                          options={staffOptions}
                          placeholder="Chọn bác sĩ / cán bộ quản lý..."
                          emptyOptionLabel="-- Bỏ trống (Chưa chỉ định) --"
                          noResultsLabel="Không tìm thấy nhân viên đang công tác"
                          inputClassName="!bg-white dark:!bg-slate-900 !border-slate-200 dark:!border-slate-700 !text-xs !py-2.5 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kỹ thuật viên vận hành chính:</label>
                        <SearchableCombobox
                          value={editAssignedTechnician}
                          onChange={setEditAssignedTechnician}
                          options={staffOptions}
                          placeholder="Chọn kỹ thuật viên vận hành..."
                          emptyOptionLabel="-- Bỏ trống (Chưa phân công) --"
                          noResultsLabel="Không tìm thấy nhân viên đang công tác"
                          inputClassName="!bg-white dark:!bg-slate-900 !border-slate-200 dark:!border-slate-700 !text-xs !py-2.5 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày ghi thêm / Nhập hồ sơ:</label>
                        <input
                          type="date"
                          value={editPurchaseDate}
                          onChange={e => setEditPurchaseDate(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày nghiệm thu & bàn giao:</label>
                        <input
                          type="date"
                          value={editInstallationDate}
                          onChange={e => setEditInstallationDate(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hạn bảo hành chính hãng:</label>
                        <input
                          type="date"
                          value={editWarrantyExpiry}
                          onChange={e => setEditWarrantyExpiry(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nguyên giá đầu tư (VNĐ):</label>
                        <input
                          type="number"
                          value={editPurchasePrice}
                          onChange={e => setEditPurchasePrice(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Yêu cầu nguồn điện & Công suất:</label>
                        <input
                          type="text"
                          value={editPowerSupply}
                          onChange={e => setEditPowerSupply(e.target.value)}
                          placeholder="220V - 50Hz / 3 pha / UPS"
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Block 3: Đặc tính kỹ thuật */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      3. Đặc Tính Kỹ Thuật, Cấu Hình Đầu Dò & Ứng Dụng Lâm Sàng
                    </h3>
                    <textarea
                      rows={3}
                      value={editSpecifications}
                      onChange={e => setEditSpecifications(e.target.value)}
                      placeholder="Mô tả cấu hình công nghệ, đầu dò, số dãy lát cắt, công suất phát tia, ứng dụng chuyên khoa..."
                      className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelProfile}
                      className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold"
                    >
                      Hủy bỏ chỉnh sửa
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>Lưu Hồ Sơ Lý Lịch Máy</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* VIEW CHẾ ĐỘ XEM LÝ LỊCH & HỒ SƠ */
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      1. Thông Tin Quản Lý & Xuất Xứ Thiết Bị
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-4 text-xs">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Mã thiết bị nội bộ:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.code}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Tên máy chính thức:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.name}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Bộ phận chuyên môn:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.category}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Hãng sản xuất:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.manufacturer}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Nước sản xuất:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.originCountry || 'CHLB Đức'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Năm sản xuất:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.yearOfManufacture || '2023'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Model / Ký hiệu mã:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.model}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Số Serial máy (S/N):</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">{equipment.serialNumber}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Đơn vị cung cấp / Đại diện:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.supplier || 'Đại diện hãng phân phối chính thức'}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      2. Ngày Ghi Thêm, Tiếp Nhận & Nhân Sự Quản Lý
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-4 text-xs">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Ngày ghi thêm / Nhập hồ sơ:</span>
                        <p className="font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                          {formatDateVN(equipment.purchaseDate || equipment.installationDate)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Ngày nghiệm thu & đưa vào sử dụng:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{formatDateVN(equipment.installationDate)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Thời hạn bảo hành chính hãng:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {equipment.warrantyExpiry ? formatDateVN(equipment.warrantyExpiry) : '36 tháng kể từ ngày bàn giao'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Vị trí phòng đặt máy:</span>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {headerRoomDisplay.code && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                              {headerRoomDisplay.code}
                            </span>
                          )}
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {headerRoomDisplay.name}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Bác sĩ / Cán bộ quản lý:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {filterActiveStaffDisplayName(equipment.managerInCharge, inactiveStaff.names) || 'Chưa chỉ định'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Kỹ thuật viên vận hành chính:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {filterActiveStaffDisplayName(equipment.assignedTechnician, inactiveStaff.names) || 'Chưa phân công'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Nguyên giá đầu tư / mua sắm:</span>
                        <p className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                          {equipment.purchasePrice ? `${equipment.purchasePrice.toLocaleString('vi-VN')} VNĐ` : 'Theo đề án bệnh viện'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      3. Lý Lịch & Thông Số Kỹ Thuật Chi Tiết
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700/80 space-y-3 text-xs">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Yêu cầu nguồn điện & Công suất:</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{equipment.powerSupply || '220V - 50Hz / UPS lưu điện chuyên dụng'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Mô tả đặc tính kỹ thuật & Ứng dụng lâm sàng:</span>
                        <p className="font-medium text-slate-700 dark:text-slate-300 leading-relaxed mt-1 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                          {equipment.specifications || 'Thiết bị công nghệ cao phục vụ chẩn đoán và điều trị tại khoa Cận Lâm Sàng.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 2: NHẬT KÝ BẢO TRÌ & HIỆU CHUẨN (GHI THÊM, LƯU, SỬA DÒNG, XÓA DÒNG)
              ========================================================================= */}
          {activeTab === 'maintenance' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/80 dark:bg-indigo-950/40 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 shadow-xs">
                <div>
                  <h4 className="font-bold text-indigo-950 dark:text-indigo-200 text-sm">Lịch Bảo Dưỡng & Hiệu Chuẩn Định Kỳ</h4>
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-0.5">
                    Chu kỳ quy định: <strong className="font-bold">{equipment.maintenanceIntervalMonths} tháng/lần</strong>. Hạn tiếp theo: <strong className="font-bold">{formatDateVN(equipment.nextMaintenanceDate)}</strong>
                  </p>
                </div>
                {canMaintEq ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMaintLog(null);
                      setShowAddMaint(!showAddMaint);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-md hover:shadow-lg shadow-indigo-600/20 active:scale-95 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{showAddMaint ? 'Đóng Form' : '+ Ghi Thêm Nhật Ký Bảo Trì'}</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold shrink-0">
                    <Lock className="w-3.5 h-3.5" /> Chỉ xem nhật ký bảo trì
                  </span>
                )}
              </div>

              {/* Form Ghi Thêm Hoặc Sửa Dòng Nhật Ký Bảo Trì */}
              {(showAddMaint || editingMaintLog) && (
                <form 
                  onSubmit={editingMaintLog ? handleSaveEditMaint : handleAddMaintenance} 
                  className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-700 shadow-md space-y-3 text-xs animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      {editingMaintLog ? <Edit3 className="w-4 h-4 text-amber-600" /> : <Plus className="w-4 h-4 text-indigo-600" />}
                      <span>{editingMaintLog ? 'Hiệu Chỉnh / Sửa Dòng Nhật Ký Bảo Trì' : 'Ghi Nhận Đợt Bảo Trì / Hiệu Chuẩn Mới'}</span>
                    </h5>
                    {editingMaintLog && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                        Sửa khi ghi sai hoặc có thay đổi
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Loại công việc:</label>
                      <select
                        value={maintType}
                        onChange={e => setMaintType(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      >
                        <option value="Định kỳ">Bảo trì Định kỳ</option>
                        <option value="Hiệu chuẩn">Hiệu chuẩn ISO 15189</option>
                        <option value="Đột xuất">Bảo trì Đột xuất</option>
                        <option value="Sửa chữa">Sửa chữa linh kiện</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày thực hiện:</label>
                      <input
                        type="date"
                        required
                        value={maintDate}
                        onChange={e => setMaintDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Người / Đơn vị thực hiện:</label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: Kỹ sư Siemens Medical"
                        value={maintPerformer}
                        onChange={e => setMaintPerformer(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kết quả nghiệm thu:</label>
                      <select
                        value={maintResult}
                        onChange={e => setMaintResult(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      >
                        <option value="Đạt">Đạt tiêu chuẩn</option>
                        <option value="Cần theo dõi">Cần theo dõi thêm</option>
                        <option value="Không đạt">Không đạt yêu cầu</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hạn đợt bảo dưỡng kế tiếp:</label>
                      <input
                        type="date"
                        required
                        value={maintNextDue}
                        onChange={e => setMaintNextDue(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Chi phí dịch vụ (VNĐ):</label>
                      <input
                        type="number"
                        placeholder="Ví dụ: 12000000"
                        value={maintCost}
                        onChange={e => setMaintCost(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nội dung kỹ thuật & Ghi chú kiểm tra:</label>
                    <textarea
                      rows={2}
                      placeholder="Ghi rõ chi tiết hạng mục đã kiểm tra, căn chỉnh..."
                      value={maintNotes}
                      onChange={e => setMaintNotes(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMaint(false);
                        setEditingMaintLog(null);
                      }}
                      className="px-4 py-2 bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-xl font-bold border border-slate-300 dark:border-slate-600 shadow-xs"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md shadow-indigo-600/25 flex items-center gap-2 active:scale-95"
                    >
                      <Save className="w-4 h-4" />
                      <span>{editingMaintLog ? 'Lưu Thay Đổi Nhật Ký' : 'Lưu Vào Nhật Ký Bảo Trì'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Maintenance History List with Edit and Delete options */}
              <div className="space-y-3">
                {(!equipment.maintenanceHistory || equipment.maintenanceHistory.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Chưa có nhật ký bảo trì hoặc hiệu chuẩn nào được lưu lại.</p>
                  </div>
                ) : (
                  equipment.maintenanceHistory.map((m) => (
                    <div key={m.id} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {m.type}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">Ngày thực hiện: {formatDateVN(m.date)}</span>
                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                            m.result === 'Đạt' 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                          }`}>
                            {m.result}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 dark:text-slate-400">
                            Thực hiện: <strong className="text-slate-700 dark:text-slate-200">{m.performedBy}</strong>
                          </span>
                          {canMaintEq && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEditMaint(m)}
                                className="px-2.5 py-1 bg-white dark:bg-slate-800 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg border border-slate-200 dark:border-slate-700 font-bold transition-all flex items-center gap-1 shadow-xs"
                                title="Sửa dòng nhật ký bảo trì này khi ghi sai"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Sửa</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMaintenance(m.id)}
                                className="px-2.5 py-1 bg-white dark:bg-slate-800 text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg border border-slate-200 dark:border-slate-700 font-bold transition-all flex items-center gap-1 shadow-xs"
                                title="Xóa dòng nhật ký bảo trì này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Xóa</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        {m.notes}
                      </p>
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                        <span>Hạn đợt tới: <strong className="text-slate-600 dark:text-slate-300">{formatDateVN(m.nextDueDate, 'Chưa ấn định')}</strong></span>
                        {m.cost && <span>Chi phí: <strong className="text-slate-700 dark:text-slate-300">{m.cost.toLocaleString('vi-VN')} VNĐ</strong></span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 3: NHẬT KÝ SỰ CỐ & SỬA CHỮA (GHI THÊM, LƯU, SỬA DÒNG, XÓA DÒNG)
              ========================================================================= */}
          {activeTab === 'repairs' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-50/80 dark:bg-rose-950/40 p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 shadow-xs">
                <div>
                  <h4 className="font-bold text-rose-950 dark:text-rose-200 text-sm">Nhật Ký Ghi Nhận Sự Cố & Thay Thế Linh Kiện</h4>
                  <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">
                    Theo dõi lịch sử hỏng hóc, sửa chữa khẩn cấp và thời gian khôi phục hoạt động của thiết bị.
                  </p>
                </div>
                {canReportIssueEq && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRepairLog(null);
                      setShowAddRepair(!showAddRepair);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-all shadow-md hover:shadow-lg shadow-rose-600/20 active:scale-95 shrink-0"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>{showAddRepair ? 'Đóng Form' : '+ Ghi Thêm Báo Cáo Sự Cố'}</span>
                  </button>
                )}
              </div>

              {/* Form Ghi Thêm Hoặc Sửa Dòng Sự Cố */}
              {(showAddRepair || editingRepairLog) && (
                <form 
                  onSubmit={editingRepairLog ? handleSaveEditRepair : handleAddRepair} 
                  className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-rose-200 dark:border-rose-700 shadow-md space-y-3 text-xs animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      {editingRepairLog ? <Edit3 className="w-4 h-4 text-amber-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
                      <span>{editingRepairLog ? 'Cập Nhật / Sửa Dòng Nhật Ký Sự Cố' : '🚨 Ghi Nhận Báo Cáo Sự Cố Mới'}</span>
                    </h5>
                    {editingRepairLog && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                        Sửa khi ghi sai hoặc có thay đổi
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mô tả sự cố & biểu hiện lỗi:</label>
                    <textarea
                      rows={2}
                      required
                      placeholder="Ví dụ: Báo lỗi mã E-401 trên màn hình điều khiển, mất tín hiệu cảm biến..."
                      value={repairDesc}
                      onChange={e => setRepairDesc(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Linh kiện cần thay (nếu có):</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Cảm biến nhiệt, Bo mạch điều khiển"
                        value={repairParts}
                        onChange={e => setRepairParts(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kỹ sư / Đơn vị tiếp nhận:</label>
                      <input
                        type="text"
                        value={repairTechnician}
                        onChange={e => setRepairTechnician(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Dự toán chi phí (VNĐ):</label>
                      <input
                        type="number"
                        placeholder="Ví dụ: 8500000"
                        value={repairCost}
                        onChange={e => setRepairCost(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-semibold"
                      />
                    </div>
                  </div>

                  {editingRepairLog && (
                    <div className="pt-1">
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Trạng thái xử lý sự cố:</label>
                      <div className="flex items-center gap-3">
                        {(['Đang xử lý', 'Đang chờ linh kiện', 'Đã khôi phục'] as const).map(st => (
                          <label key={st} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="repairStatus"
                              checked={repairStatus === st}
                              onChange={() => setRepairStatus(st)}
                            />
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{st}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddRepair(false);
                        setEditingRepairLog(null);
                      }}
                      className="px-4 py-2 bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-xl font-bold border border-slate-300 dark:border-slate-600 shadow-xs"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 shadow-md shadow-rose-600/25 flex items-center gap-2 active:scale-95"
                    >
                      <Save className="w-4 h-4" />
                      <span>{editingRepairLog ? 'Lưu Thay Đổi Sự Cố' : 'Lưu Vào Nhật Ký Sự Cố'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Repair History List with Edit and Delete options */}
              <div className="space-y-3">
                {(!equipment.repairHistory || equipment.repairHistory.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Không có báo cáo sự cố nào được ghi nhận cho thiết bị này. Máy vận hành an toàn.</p>
                  </div>
                ) : (
                  equipment.repairHistory.map((r) => (
                    <div key={r.id} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs hover:border-rose-200 dark:hover:border-rose-800 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            Sự cố
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">Báo lúc: {formatDateTimeVN(r.reportedAt)}</span>
                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                            r.status === 'Đã khôi phục' 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300' 
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                          }`}>
                            {r.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 dark:text-slate-400">
                            Người báo: <strong className="text-slate-700 dark:text-slate-200">{r.reportedBy}</strong>
                          </span>
                          {canRepairManageEq && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEditRepair(r)}
                                className="px-2.5 py-1 bg-white dark:bg-slate-800 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg border border-slate-200 dark:border-slate-700 font-bold transition-all flex items-center gap-1 shadow-xs"
                                title="Sửa dòng sự cố này khi ghi sai hoặc cập nhật trạng thái"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Sửa</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRepair(r.id)}
                                className="px-2.5 py-1 bg-white dark:bg-slate-800 text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg border border-slate-200 dark:border-slate-700 font-bold transition-all flex items-center gap-1 shadow-xs"
                                title="Xóa dòng sự cố này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Xóa</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        {r.issueDescription}
                      </p>
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                        <span>Linh kiện: <strong className="text-slate-700 dark:text-slate-300">{r.replacedParts || 'Chưa thay linh kiện'}</strong></span>
                        <span>Kỹ sư xử lý: <strong className="text-slate-700 dark:text-slate-300">{r.technician || 'Kỹ sư chuyên trách'}</strong></span>
                        {r.cost && <span>Chi phí: <strong className="text-rose-600 dark:text-rose-400">{r.cost.toLocaleString('vi-VN')} VNĐ</strong></span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 4: PHẦN 2 — GIẤY PHÉP, KIỂM ĐỊNH, KIỂM XẠ, BẢO DƯỠNG & GHI CHÚ
              ========================================================================= */}
          {activeTab === 'docs' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/80 dark:bg-emerald-950/40 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 shadow-xs">
                <div className="flex items-center gap-2.5 text-xs text-emerald-950 dark:text-emerald-200">
                  <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    <strong>Phần 2:</strong> Thông tin Giấy phép lưu hành BYT, Kiểm định ISO, Kiểm xạ ATBX, Chu kỳ bảo dưỡng thiết bị &amp; Ghi chú theo dõi.
                  </span>
                </div>
                {canEditEq ? (
                  !isEditingDocs ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingDocs(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-md hover:shadow-lg shadow-emerald-600/20 active:scale-95 shrink-0 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Chỉnh Sửa Phần 2 (Giấy Phép, Kiểm Định, Bảo Dưỡng)</span>
                    </button>
                  ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCancelDocs}
                      className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 shadow-xs cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDocs}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/25 active:scale-95 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>Lưu Thông Tin Phần 2</span>
                    </button>
                  </div>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold shrink-0">
                    <Lock className="w-3.5 h-3.5" /> Chế độ chỉ xem (ngoài phạm vi)
                  </span>
                )}
              </div>

              {isEditingDocs ? (
                /* FORM CHỈNH SỬA PHẦN 2 — 4 MỤC NHỎ RÕ RÀNG + TỰ ĐỘNG TÍNH NGÀY HẾT HẠN */
                <form onSubmit={handleSaveDocs} className="space-y-4 text-xs">
                  {/* 1. GIẤY PHÉP */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        1. Giấy Phép
                      </h3>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Nhập Ngày cấp để tự tính Ngày hết hạn (hoặc nhập thủ công)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số giấy phép:</label>
                        <input
                          type="text"
                          value={editOperatingPermitNumber}
                          onChange={e => setEditOperatingPermitNumber(e.target.value)}
                          placeholder="VD: GPHĐ-BYT/2026"
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày cấp:</label>
                        <input
                          type="date"
                          value={editOperatingPermitIssueDate}
                          onChange={e => {
                            const val = e.target.value;
                            setEditOperatingPermitIssueDate(val);
                            if (val && editOperatingPermitDurationMonths > 0) {
                              setEditOperatingPermitExpiry(addMonthsToISODate(val, editOperatingPermitDurationMonths));
                            }
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời hạn (tháng):</label>
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={editOperatingPermitDurationMonths}
                          onChange={e => {
                            const months = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setEditOperatingPermitDurationMonths(months);
                            if (editOperatingPermitIssueDate) {
                              setEditOperatingPermitExpiry(addMonthsToISODate(editOperatingPermitIssueDate, months));
                            }
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày hết hạn:</label>
                        <input
                          type="date"
                          value={editOperatingPermitExpiry}
                          onChange={e => setEditOperatingPermitExpiry(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. KIỂM ĐỊNH */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        2. Kiểm Định
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editCalibrationNumber}
                          onChange={e => setEditCalibrationNumber(e.target.value)}
                          placeholder="Số chứng chỉ KĐ"
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-sky-500 font-semibold w-44"
                        />
                        <input
                          type="text"
                          value={editCalibrationIssuedBy}
                          onChange={e => setEditCalibrationIssuedBy(e.target.value)}
                          placeholder="Đơn vị kiểm định (VMI/Quatest)"
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-sky-500 font-semibold w-52"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày kiểm định:</label>
                        <input
                          type="date"
                          value={editCalibrationDate}
                          onChange={e => {
                            const val = e.target.value;
                            setEditCalibrationDate(val);
                            if (val && editCalibrationIntervalMonths > 0) {
                              setEditCalibrationExpiry(addMonthsToISODate(val, editCalibrationIntervalMonths));
                            }
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời hạn (tháng):</label>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={editCalibrationIntervalMonths}
                          onChange={e => {
                            const months = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setEditCalibrationIntervalMonths(months);
                            if (editCalibrationDate) {
                              setEditCalibrationExpiry(addMonthsToISODate(editCalibrationDate, months));
                            }
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày hết hạn:</label>
                        <input
                          type="date"
                          value={editCalibrationExpiry}
                          onChange={e => setEditCalibrationExpiry(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. KIỂM XẠ */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        3. Kiểm Xạ
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editRadiationLicenseNumber}
                          onChange={e => setEditRadiationLicenseNumber(e.target.value)}
                          placeholder="Số GP ATBX (nếu có)"
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-amber-500 font-semibold w-44"
                        />
                        <input
                          type="text"
                          value={editRadiationLicenseIssuedBy}
                          onChange={e => setEditRadiationLicenseIssuedBy(e.target.value)}
                          placeholder="Đơn vị cấp ATBX"
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-amber-500 font-semibold w-48"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày kiểm xạ:</label>
                        <input
                          type="date"
                          value={editRadiationSurveyDate}
                          onChange={e => {
                            const val = e.target.value;
                            setEditRadiationSurveyDate(val);
                            if (val && editRadiationSurveyIntervalMonths > 0) {
                              const nextExpiry = addMonthsToISODate(val, editRadiationSurveyIntervalMonths);
                              setEditRadiationSurveyExpiry(nextExpiry);
                              setEditRadiationLicenseExpiry(nextExpiry);
                            }
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời hạn (tháng):</label>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={editRadiationSurveyIntervalMonths}
                          onChange={e => {
                            const months = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setEditRadiationSurveyIntervalMonths(months);
                            if (editRadiationSurveyDate) {
                              const nextExpiry = addMonthsToISODate(editRadiationSurveyDate, months);
                              setEditRadiationSurveyExpiry(nextExpiry);
                              setEditRadiationLicenseExpiry(nextExpiry);
                            }
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày hết hạn:</label>
                        <input
                          type="date"
                          value={editRadiationSurveyExpiry || editRadiationLicenseExpiry}
                          onChange={e => {
                            setEditRadiationSurveyExpiry(e.target.value);
                            setEditRadiationLicenseExpiry(e.target.value);
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-semibold text-amber-700 dark:text-amber-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. BẢO DƯỠNG */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        4. Bảo Dưỡng
                      </h3>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Tự động tính hạn kế tiếp từ Ngày bảo dưỡng + Thời hạn</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày bảo dưỡng:</label>
                        <input
                          type="date"
                          value={editLastMaintenanceDate}
                          onChange={e => {
                            const val = e.target.value;
                            setEditLastMaintenanceDate(val);
                            if (val && editMaintenanceIntervalMonths > 0) {
                              setEditNextMaintenanceDate(addMonthsToISODate(val, editMaintenanceIntervalMonths));
                            }
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời hạn (tháng):</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={editMaintenanceIntervalMonths}
                          onChange={e => {
                            const months = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setEditMaintenanceIntervalMonths(months);
                            if (editLastMaintenanceDate) {
                              setEditNextMaintenanceDate(addMonthsToISODate(editLastMaintenanceDate, months));
                            }
                          }}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày hết hạn:</label>
                        <input
                          type="date"
                          value={editNextMaintenanceDate}
                          onChange={e => setEditNextMaintenanceDate(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 5. GHI CHÚ */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      5. Ghi Chú Thiết Bị
                    </h3>
                    <textarea
                      rows={3}
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Nhập ghi chú theo dõi gia hạn giấy phép, lịch kiểm xạ phòng máy, lưu ý bảo trì / linh kiện cần thay thế..."
                      className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelDocs}
                      className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>Lưu Thông Tin Phần 2</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* VIEW CHẾ ĐỘ XEM PHẦN 2 — 4 MỤC NHỎ RÕ RÀNG */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. Giấy phép */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                          🏛️ 1. Giấy Phép
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          equipment.operatingPermitExpiry && isDatePastVN(equipment.operatingPermitExpiry)
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {equipment.operatingPermitExpiry && isDatePastVN(equipment.operatingPermitExpiry) ? 'Hết hạn' : 'Hợp lệ'}
                        </span>
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-slate-300 pt-1">
                        <p>Số giấy phép: <strong className="text-slate-800 dark:text-slate-100">{equipment.operatingPermitNumber || 'GPHĐ-BYT/2023-TTBYT'}</strong></p>
                        <p>Ngày cấp: <strong className="text-slate-800 dark:text-slate-100">{formatDateVN(equipment.operatingPermitIssueDate, 'Chưa ghi nhận')}</strong></p>
                        <p>Thời hạn: <strong className="text-indigo-700 dark:text-indigo-300">{equipment.operatingPermitDurationMonths ? `${equipment.operatingPermitDurationMonths} tháng` : 'Theo giấy phép'}</strong></p>
                        <p>Ngày hết hạn: <strong className={`font-bold ${equipment.operatingPermitExpiry && isDatePastVN(equipment.operatingPermitExpiry) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>{formatDateVN(equipment.operatingPermitExpiry, 'Chưa ấn định')}</strong></p>
                      </div>
                    </div>

                    {/* 2. Kiểm định */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                          🔬 2. Kiểm Định
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCalibrationOverdue
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {isCalibrationOverdue ? 'Quá hạn KĐ' : 'Còn hiệu lực'}
                        </span>
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-slate-300 pt-1">
                        <p>Số CC / Đơn vị KĐ: <strong className="text-slate-800 dark:text-slate-100">{equipment.calibrationNumber || 'KD-ISO'} ({equipment.calibrationIssuedBy || 'Quatest / VMI'})</strong></p>
                        <p>Ngày kiểm định: <strong className="text-slate-800 dark:text-slate-100">{formatDateVN(equipment.calibrationDate, 'Chưa ghi nhận')}</strong></p>
                        <p>Thời hạn: <strong className="text-sky-700 dark:text-sky-300">{equipment.calibrationIntervalMonths ? `${equipment.calibrationIntervalMonths} tháng` : '12 tháng'}</strong></p>
                        <p>Ngày hết hạn: <strong className={`font-bold ${isCalibrationOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>{formatDateVN(equipment.calibrationExpiry, 'Định kỳ hàng năm')} {isCalibrationOverdue && '⚠️ Quá hạn'}</strong></p>
                      </div>
                    </div>

                    {/* 3. Kiểm xạ */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                          ☢️ 3. Kiểm Xạ
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isRadiationOverdue
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {radExpirySummary ? (isRadiationOverdue ? 'Hết hạn' : 'Đang hiệu lực') : 'Không áp dụng'}
                        </span>
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-slate-300 pt-1">
                        <p>Số giấy phép ATBX: <strong className="text-slate-800 dark:text-slate-100">{equipment.radiationLicenseNumber || 'Chưa cấp / Không áp dụng'}</strong></p>
                        <p>Ngày kiểm xạ: <strong className="text-slate-800 dark:text-slate-100">{formatDateVN(equipment.radiationSurveyDate, 'Chưa ghi nhận')}</strong></p>
                        <p>Thời hạn: <strong className="text-amber-700 dark:text-amber-300">{equipment.radiationSurveyIntervalMonths ? `${equipment.radiationSurveyIntervalMonths} tháng` : '12 tháng'}</strong></p>
                        <p>Ngày hết hạn: <strong className={`font-bold ${isRadiationOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>{formatDateVN(radExpirySummary, 'Không yêu cầu')} {isRadiationOverdue && '⚠️ Quá hạn'}</strong></p>
                      </div>
                    </div>

                    {/* 4. Bảo dưỡng */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                          🛠️ 4. Bảo Dưỡng
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isNextMaintenanceOverdue
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        }`}>
                          {equipment.maintenanceIntervalMonths} tháng / lần
                        </span>
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-slate-300 pt-1">
                        <p>Ngày bảo dưỡng: <strong className="text-slate-800 dark:text-slate-100">{formatDateVN(equipment.lastMaintenanceDate, 'Chưa ghi nhận')}</strong></p>
                        <p>Thời hạn: <strong className="text-emerald-700 dark:text-emerald-300">{equipment.maintenanceIntervalMonths} tháng</strong></p>
                        <p>Ngày hết hạn: <strong className={`font-bold ${isNextMaintenanceOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>{formatDateVN(equipment.nextMaintenanceDate)} {isNextMaintenanceOverdue && '⚠️ Quá hạn'}</strong></p>
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveTab('maintenance')}
                            className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                          >
                            Xem chi tiết nhật ký bảo trì ({equipment.maintenanceHistory?.length || 0} lần) →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ghi chú thiết bị */}
                  <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/80 dark:border-amber-800/60 space-y-1.5 text-xs">
                    <span className="font-bold text-amber-950 dark:text-amber-200 text-sm flex items-center gap-1.5">
                      📝 Ghi Chú Thiết Bị
                    </span>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                      {equipment.notes || 'Chưa có ghi chú bổ sung cho thiết bị này. Bấm "Chỉnh Sửa Phần 2" để thêm ghi chú.'}
                    </p>
                  </div>

                  {/* Standard SOP Documents */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      📑 Tài Liệu Kỹ Thuật &amp; Quy Trình SOP
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span>SOP Vận hành chuẩn thiết bị ({equipment.code})</span>
                        <button type="button" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Tải file PDF</button>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span>Biên bản bàn giao &amp; hồ sơ CO/CQ gốc</span>
                        <button type="button" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Xem lưu trữ</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions contextual to current Tab */}
        <div className="p-4 sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Mã thiết bị: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{equipment.code}</span> • Lần cập nhật cuối: {formatDateVN(equipment.lastMaintenanceDate)}
          </div>
          <div className="flex items-center gap-2.5 justify-end flex-wrap">
            {canEditEq && activeTab === 'profile' && !isEditingProfile && (
              <button
                type="button"
                onClick={() => setIsEditingProfile(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md hover:shadow-lg shadow-indigo-600/20 active:scale-95"
              >
                <Edit3 className="w-4 h-4" />
                <span>Chỉnh Sửa Lý Lịch Máy</span>
              </button>
            )}

            {canEditEq && activeTab === 'profile' && isEditingProfile && (
              <>
                <button
                  type="button"
                  onClick={handleCancelProfile}
                  className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-indigo-600/25 active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu Hồ Sơ Máy</span>
                </button>
              </>
            )}

            {canEditEq && activeTab === 'docs' && !isEditingDocs && (
              <button
                type="button"
                onClick={() => setIsEditingDocs(true)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md hover:shadow-lg shadow-sky-600/20 active:scale-95"
              >
                <Edit3 className="w-4 h-4" />
                <span>Chỉnh Sửa Giấy Phép & Kiểm Định</span>
              </button>
            )}

            {canEditEq && activeTab === 'docs' && isEditingDocs && (
              <>
                <button
                  type="button"
                  onClick={handleCancelDocs}
                  className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleSaveDocs}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-sky-600/25 active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu Giấy Phép & Kiểm Định</span>
                </button>
              </>
            )}

            {canMaintEq && activeTab === 'maintenance' && (
              <button
                type="button"
                onClick={() => {
                  setEditingMaintLog(null);
                  setShowAddMaint(true);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md hover:shadow-lg shadow-indigo-600/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Nhật Ký Bảo Trì</span>
              </button>
            )}

            {canReportIssueEq && activeTab === 'repairs' && (
              <button
                type="button"
                onClick={() => {
                  setEditingRepairLog(null);
                  setShowAddRepair(true);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md hover:shadow-lg shadow-rose-600/20 active:scale-95"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Báo Cáo Sự Cố Mới</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold transition-all border border-slate-300 dark:border-slate-700 shadow-xs"
            >
              Đóng Cửa Sổ
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRM DELETE LOG DIALOG IN MODAL */}
      {confirmDeleteLog && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 rounded-2xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {confirmDeleteLog.type === 'maint' ? 'Xác Nhận Xóa Nhật Ký Bảo Trì' : 'Xác Nhận Xóa Bản Ghi Sự Cố'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {confirmDeleteLog.type === 'maint'
                    ? 'Bạn có chắc chắn muốn xóa dòng nhật ký bảo trì này?'
                    : 'Bạn có chắc chắn muốn xóa bản ghi sự cố này?'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteLog(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-xs transition-all"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLog}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-rose-600/20 active:scale-95 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác Nhận Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE DIALOG IN MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 rounded-2xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Xác Nhận Xóa Thiết Bị</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Xóa toàn bộ hồ sơ thiết bị khỏi hệ thống.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Mã thiết bị:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{equipment.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Tên thiết bị:</span>
                <span className="font-bold text-slate-900 dark:text-white text-right">{equipment.name}</span>
              </div>
            </div>

            <p className="text-xs text-rose-600 dark:text-rose-400">
              ⚠️ Cảnh báo: Thao tác này sẽ xóa vĩnh viễn thiết bị cùng toàn bộ lịch sử bảo dưỡng và biên bản sửa chữa.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-xs transition-all"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDelete) {
                    onDelete(equipment.id);
                  } else {
                    storageService.deleteEquipment(equipment.id);
                    onUpdate();
                    onClose();
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-rose-600/20 active:scale-95 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác Nhận Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
