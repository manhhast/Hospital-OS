import React, { useState, useEffect } from 'react';
import { 
  Wrench, Activity, AlertTriangle, ShieldCheck, Calendar, Clock, 
  Search, Plus, FileText, CheckCircle2, AlertCircle, RefreshCw, Filter, Layers, 
  LayoutList, LayoutGrid, Eye, User, MapPin, Check, Info, ArrowUpRight, X, Trash2,
  Gauge, DollarSign, ShieldAlert, Lock, Unlock
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { EquipmentItem, MaintenanceLog, RepairLog, EquipmentStatus } from '../../types/hospital';
import { EquipmentDetailModal } from './EquipmentDetailModal';
import { SafetyInterlockTab } from './SafetyInterlockTab';
import { OeeReliabilityTab } from './OeeReliabilityTab';
import { DepreciationUtilizationTab } from './DepreciationUtilizationTab';
import { formatDateVN, formatDateTimeVN, getTodayISODateVN, getNowVNString, isDatePastVN } from '../../utils/dateUtils';
import { checkEquipmentSafetyInterlock, calculateEquipmentOEE, calculateEquipmentDepreciation } from '../../utils/equipmentAnalytics';

export const EquipmentManagementView: React.FC = () => {
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'list' | 'interlock' | 'oee' | 'utilization' | 'maintenance' | 'repairs'>('list');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list'); // Default to LIST as requested
  
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

  // Form states for Add Equipment
  const [newEqCode, setNewEqCode] = useState('');
  const [newEqName, setNewEqName] = useState('');
  const [newEqCategory, setNewEqCategory] = useState<'Chẩn đoán hình ảnh' | 'Xét nghiệm' | 'Nội soi' | 'Siêu âm' | 'Khác'>('Chẩn đoán hình ảnh');
  const [newEqModel, setNewEqModel] = useState('');
  const [newEqManufacturer, setNewEqManufacturer] = useState('');
  const [newEqOrigin, setNewEqOrigin] = useState('CHLB Đức');
  const [newEqSerial, setNewEqSerial] = useState('');
  const [newEqRoom, setNewEqRoom] = useState('');
  const [newEqTech, setNewEqTech] = useState('');
  const [newEqManager, setNewEqManager] = useState('');
  const [newEqPurchaseDate, setNewEqPurchaseDate] = useState(getTodayISODateVN());
  const [newEqInstallDate, setNewEqInstallDate] = useState(getTodayISODateVN());
  const [newEqInterval, setNewEqInterval] = useState(3);
  const [newEqPrice, setNewEqPrice] = useState('');
  const [newEqSupplier, setNewEqSupplier] = useState('');
  const [newEqRadLicense, setNewEqRadLicense] = useState('');
  const [newEqRadExpiry, setNewEqRadExpiry] = useState('');
  const [newEqCalibExpiry, setNewEqCalibExpiry] = useState('');
  const [newEqCalibAgency, setNewEqCalibAgency] = useState('');
  const [newEqSpecs, setNewEqSpecs] = useState('');

  // Form states for Quick Modals
  const [newRepairDesc, setNewRepairDesc] = useState('');
  const [newRepairCost, setNewRepairCost] = useState('');
  const [newMaintType, setNewMaintType] = useState<'Định kỳ' | 'Đột xuất' | 'Hiệu chuẩn' | 'Sửa chữa'>('Định kỳ');
  const [newMaintNotes, setNewMaintNotes] = useState('');

  const refreshData = () => {
    const list = storageService.getEquipment();
    setEquipmentList(list);
    if (detailEquipment) {
      const refreshedItem = list.find(e => e.id === detailEquipment.id);
      if (refreshedItem) setDetailEquipment(refreshedItem);
    }
  };

  useEffect(() => {
    refreshData();
    return storageService.subscribe(refreshData);
  }, []);

  // Filtered equipment
  const filteredList = equipmentList.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.room.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.assignedTechnician && item.assignedTechnician.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (item.managerInCharge && item.managerInCharge.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Analytics counters
  const totalEquipment = equipmentList.length;
  const activeCount = equipmentList.filter(e => e.status === 'Hoạt động tốt').length;
  const maintenanceNeededCount = equipmentList.filter(e => e.status === 'Cần bảo trì' || e.status === 'Đang hiệu chuẩn').length;
  const brokenCount = equipmentList.filter(e => e.status === 'Sự cố hỏng hóc').length;
  const safetyViolations = checkEquipmentSafetyInterlock(equipmentList);
  const criticalViolationsCount = safetyViolations.filter(v => v.severity === 'CRITICAL').length;

  const handleCreateEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEqName || !newEqCode) return;

    const nextMaint = new Date(Date.now() + newEqInterval * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const item: EquipmentItem = {
      id: `EQ-${Date.now().toString().slice(-6)}`,
      code: newEqCode,
      name: newEqName,
      category: newEqCategory,
      model: newEqModel || 'Standard Series',
      manufacturer: newEqManufacturer || 'Hãng Y Tế Chính Hãng',
      originCountry: newEqOrigin,
      yearOfManufacture: new Date().getFullYear(),
      serialNumber: newEqSerial || `SN-${Math.floor(Math.random() * 900000 + 100000)}`,
      room: newEqRoom || 'Phòng Cận Lâm Sàng',
      assignedTechnician: newEqTech || storageService.getCurrentUser().name,
      managerInCharge: newEqManager || 'Ban Chủ Nhiệm Khoa',
      status: 'Hoạt động tốt',
      purchaseDate: newEqPurchaseDate,
      installationDate: newEqInstallDate,
      purchasePrice: newEqPrice ? parseInt(newEqPrice) : undefined,
      supplier: newEqSupplier,
      maintenanceIntervalMonths: newEqInterval,
      lastMaintenanceDate: newEqInstallDate,
      nextMaintenanceDate: nextMaint,
      radiationLicenseExpiry: newEqRadExpiry || undefined,
      radiationLicenseNumber: newEqRadLicense || undefined,
      calibrationExpiry: newEqCalibExpiry || undefined,
      calibrationIssuedBy: newEqCalibAgency || undefined,
      specifications: newEqSpecs || 'Thiết bị y tế phục vụ công tác chẩn đoán và điều trị tại khoa Cận Lâm Sàng.',
      maintenanceHistory: [
        {
          id: `MNT-${Date.now()}`,
          equipmentId: `EQ-${Date.now().toString().slice(-6)}`,
          equipmentName: newEqName,
          date: newEqInstallDate,
          type: 'Hiệu chuẩn',
          performedBy: 'Hội đồng nghiệm thu kỹ thuật bàn giao',
          result: 'Đạt',
          notes: 'Nghiệm thu lắp đặt ban đầu, kiểm chuẩn an toàn điện & thông số kỹ thuật xuất xưởng.',
          nextDueDate: nextMaint
        }
      ],
      repairHistory: []
    };

    storageService.saveEquipment(item);
    setShowAddModal(false);
    // Reset form
    setNewEqCode('');
    setNewEqName('');
    setNewEqModel('');
    setNewEqManufacturer('');
    setNewEqSerial('');
    setNewEqRoom('');
    setNewEqTech('');
    setNewEqManager('');
    setNewEqPrice('');
    setNewEqSupplier('');
    setNewEqRadLicense('');
    setNewEqRadExpiry('');
    setNewEqCalibExpiry('');
    setNewEqCalibAgency('');
    setNewEqSpecs('');
    refreshData();
    // Auto open detail modal for the new machine
    setDetailEquipment(item);
  };

  const handleAddRepairLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-sm font-semibold mb-1">
            <Wrench className="w-4 h-4" /> QUẢN LÝ MÁY MÓC & THIẾT BỊ CẬN LÂM SÀNG
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Danh Mục Thiết Bị, Máy Chụp & Xét Nghiệm</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý hồ sơ lý lịch máy, người phụ trách, thời hạn kiểm định/cấp phép ATBX và toàn bộ nhật ký bảo dưỡng - sửa chữa.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg shadow-indigo-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Thêm Thiết Bị Mới
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tổng Số Máy</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{totalEquipment}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Toàn khoa CLS</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Đang Vận Hành Tốt</p>
            <h3 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{activeCount}</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{Math.round((activeCount / (totalEquipment || 1)) * 100)}% công suất</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Đến Hạn Bảo Trì / HC</p>
            <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">{maintenanceNeededCount}</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Cần theo dõi sát</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Sự Cố Hỏng Hóc</p>
            <h3 className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">{brokenCount}</h3>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{brokenCount > 0 ? 'Cần xử lý khẩn' : 'An toàn'}</p>
          </div>
          <div className="p-3 bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs & Search Filter Divided Into Two Rows */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Dòng 1: Thanh Menu / Tabs Chuyên Mục */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-2xl border border-slate-300/80 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'list' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.01]' 
                  : 'bg-white/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs'
              }`}
            >
              <Wrench className={`w-3.5 h-3.5 ${activeTab === 'list' ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
              <span>Danh Sách Máy</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'list' ? 'bg-white/30 text-white' : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
              }`}>
                {equipmentList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('interlock')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'interlock' 
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 scale-[1.01]' 
                  : 'bg-white/80 dark:bg-slate-800/60 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 shadow-xs'
              }`}
            >
              <ShieldAlert className={`w-3.5 h-3.5 ${activeTab === 'interlock' ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`} />
              <span>Khóa Chéo An Toàn (LOTO)</span>
              {safetyViolations.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeTab === 'interlock' ? 'bg-white text-rose-700' : 'bg-rose-600 text-white animate-pulse'
                }`}>
                  {safetyViolations.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('oee')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'oee' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.01]' 
                  : 'bg-white/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs'
              }`}
            >
              <Gauge className={`w-3.5 h-3.5 ${activeTab === 'oee' ? 'text-white' : 'text-sky-600 dark:text-sky-400'}`} />
              <span>Hiệu Suất OEE & MTBF</span>
            </button>

            <button
              onClick={() => setActiveTab('utilization')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'utilization' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.01]' 
                  : 'bg-white/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs'
              }`}
            >
              <DollarSign className={`w-3.5 h-3.5 ${activeTab === 'utilization' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Khấu Hao & Công Suất Phòng</span>
            </button>

            <button
              onClick={() => setActiveTab('maintenance')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'maintenance' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.01]' 
                  : 'bg-white/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs'
              }`}
            >
              <Calendar className={`w-3.5 h-3.5 ${activeTab === 'maintenance' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Lịch Bảo Trì & KĐ</span>
            </button>

            <button
              onClick={() => setActiveTab('repairs')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'repairs' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-[1.01]' 
                  : 'bg-white/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs'
              }`}
            >
              <FileText className={`w-3.5 h-3.5 ${activeTab === 'repairs' ? 'text-white' : 'text-amber-500 dark:text-amber-400'}`} />
              <span>Nhật Ký Sửa Chữa</span>
            </button>
          </div>

          {/* View Mode Toggle for main tab */}
          {activeTab === 'list' && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 self-end sm:self-auto shrink-0">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'list'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Hiển thị dạng danh sách (List view)"
              >
                <LayoutList className="w-4 h-4" />
                <span className="text-[11px]">Dạng Bảng List</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'grid'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Hiển thị dạng thẻ lưới (Grid view)"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="text-[11px]">Dạng Thẻ</span>
              </button>
            </div>
          )}
        </div>

        {/* Dòng 2: Thanh Tìm Kiếm và Bộ Lọc */}
        <div className="p-3 md:px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Ô Tìm Kiếm */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm tên máy, mã thiết bị, vị trí phòng, người quản lý..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
          </div>

          {/* Bộ Lọc Theo Danh Mục & Trạng Thái */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0 font-medium mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lọc theo:</span>
            </div>

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
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
              className="flex-1 sm:flex-none px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="Hoạt động tốt">Hoạt động tốt</option>
              <option value="Cần bảo trì">Cần bảo trì</option>
              <option value="Sự cố hỏng hóc">Sự cố hỏng hóc</option>
              <option value="Đang hiệu chuẩn">Đang hiệu chuẩn</option>
            </select>

            {(searchTerm || selectedCategory !== 'all' || selectedStatus !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('all');
                  setSelectedStatus('all');
                }}
                className="px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/30 rounded-xl transition-colors shrink-0"
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
              <div className="overflow-x-auto rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300 border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
                    <tr>
                      <th className="py-3.5 px-4 border-r border-slate-200 dark:border-slate-700/80">
                        <div className="leading-tight">Mã &amp; Tên<br/>Thiết Bị</div>
                      </th>
                      <th className="py-3.5 px-3 border-r border-slate-200 dark:border-slate-700/80">Phòng &amp; Bộ Phận</th>
                      <th className="py-3.5 px-3 border-r border-slate-200 dark:border-slate-700/80">Model / Hãng SX</th>
                      <th className="py-3 px-3 border-r border-slate-200 dark:border-slate-700/80">
                        <div className="leading-tight">Người<br/>Quản Lý</div>
                      </th>
                      <th className="py-3 px-3 border-r border-slate-200 dark:border-slate-700/80">
                        <div className="leading-tight">Lịch<br/>Bảo Dưỡng</div>
                      </th>
                      <th className="py-3 px-3 border-r border-slate-200 dark:border-slate-700/80">
                        <div className="leading-tight">Kiểm Định<br/>&amp; Kiểm Xạ</div>
                      </th>
                      <th className="py-3 px-3 border-r border-slate-200 dark:border-slate-700/80">
                        <div className="leading-tight">Thời Hạn<br/>Cấp Phép</div>
                      </th>
                      <th className="py-3 px-1 text-center w-12 whitespace-nowrap">
                        <div className="leading-tight text-[10px]">Thao<br/>Tác</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-[2px] divide-slate-300 dark:divide-slate-700 bg-white dark:bg-slate-900">
                    {filteredList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 dark:text-slate-500">
                          Không tìm thấy thiết bị nào phù hợp với điều kiện tìm kiếm.
                        </td>
                      </tr>
                    ) : (
                      filteredList.map(item => {
                        const isOverdueMaint = isDatePastVN(item.nextMaintenanceDate);
                        const isOverdueRad = item.radiationLicenseExpiry ? isDatePastVN(item.radiationLicenseExpiry) : false;
                        const isOverduePermit = item.operatingPermitExpiry ? isDatePastVN(item.operatingPermitExpiry) : false;
                        const isOverdueCalib = item.calibrationExpiry ? isDatePastVN(item.calibrationExpiry) : false;
                        const oee = calculateEquipmentOEE(item);

                        return (
                          <tr 
                            key={item.id} 
                            className={`hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 transition-colors group even:bg-slate-50/70 dark:even:bg-slate-800/40 border-b-[3px] border-slate-300 dark:border-slate-700 ${
                              item.isLockedOut ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                            }`}
                          >
                            {/* Mã & Tên máy (Mã ở trên, Tên máy ở dưới) */}
                            <td className="py-4 px-4 border-r-2 border-slate-200 dark:border-slate-700/80">
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
                                    className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors flex items-start gap-1 group-hover:underline text-xs leading-snug"
                                    title="Nhấn để xem toàn bộ hồ sơ lý lịch máy, người quản lý, hạn kiểm định và nhật ký"
                                  >
                                    <span>{item.name}</span>
                                    <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                                  </button>
                                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                    S/N: {item.serialNumber} • Ngày nhập: {formatDateVN(item.purchaseDate || item.installationDate)}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Vị trí phòng & bộ phận */}
                            <td className="py-4 px-3 border-r-2 border-slate-200 dark:border-slate-700/80">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{item.room}</div>
                              <span className="inline-block mt-0.5 px-2 py-0.2 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {item.category}
                              </span>
                            </td>

                            {/* Model & Hãng */}
                            <td className="py-4 px-3 border-r-2 border-slate-200 dark:border-slate-700/80">
                              <div className="font-medium text-slate-800 dark:text-slate-200">{item.model}</div>
                              <div className="text-[11px] text-slate-400 dark:text-slate-500">{item.manufacturer} ({item.originCountry || 'Chính hãng'})</div>
                            </td>

                            {/* Người quản lý & KTV */}
                            <td className="py-4 px-3 border-r-2 border-slate-200 dark:border-slate-700/80">
                              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-start gap-1 leading-snug">
                                <User className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                <span className="break-words">
                                  {item.managerInCharge || 'Chủ nhiệm khoa'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug break-words">
                                KTV: {item.assignedTechnician}
                              </div>
                            </td>

                            {/* Lịch Bảo Dưỡng */}
                            <td className="py-4 px-3 border-r-2 border-slate-200 dark:border-slate-700/80">
                              <div className="space-y-0.5">
                                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                  Lịch BD:
                                </div>
                                <div className={`text-xs font-bold ${isOverdueMaint ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                  {formatDateVN(item.nextMaintenanceDate)}
                                </div>
                              </div>
                              {isOverdueMaint ? (
                                <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/60">
                                  ⚠️ Quá hạn
                                </span>
                              ) : (
                                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                  CK {item.maintenanceIntervalMonths}T
                                </div>
                              )}
                            </td>

                            {/* Cột 6: Kiểm Định & Kiểm Xạ */}
                            <td className="py-4 px-3 border-r-2 border-slate-200 dark:border-slate-700/80">
                              <div className="space-y-1.5">
                                {/* Hạn Kiểm Định */}
                                <div className="space-y-0.5">
                                  <div className="text-[11px] font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1">
                                    <span>🔬 Hạn KĐ:</span>
                                  </div>
                                  <div className={`text-xs font-bold ${isOverdueCalib ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                    {formatDateVN(item.calibrationExpiry, 'Hàng năm')}
                                  </div>
                                  {isOverdueCalib && (
                                    <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/60">
                                      ⚠️ Quá hạn
                                    </span>
                                  )}
                                </div>

                                {/* Hạn Kiểm Xạ */}
                                <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
                                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                    <span>☢️ Hạn KX:</span>
                                  </div>
                                  <div className="text-xs font-bold">
                                    {item.radiationLicenseExpiry ? (
                                      <span className={isOverdueRad ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}>
                                        {formatDateVN(item.radiationLicenseExpiry)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal italic">K.áp dụng</span>
                                    )}
                                  </div>
                                  {item.radiationLicenseExpiry && isOverdueRad && (
                                    <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/60">
                                      ⚠️ Quá hạn KX
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Cột 7: Thời Hạn Cấp Phép */}
                            <td className="py-4 px-3 border-r-2 border-slate-200 dark:border-slate-700/80">
                              <div className="space-y-1">
                                <div className="space-y-0.5">
                                  <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                    <span>📋 Hạn GP:</span>
                                  </div>
                                  <div className={`text-xs font-bold ${isOverduePermit ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                    {formatDateVN(item.operatingPermitExpiry || item.radiationLicenseExpiry, 'Theo chuẩn BYT')}
                                  </div>
                                </div>
                                {item.operatingPermitNumber && (
                                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[120px]" title={item.operatingPermitNumber}>
                                    {item.operatingPermitNumber}
                                  </div>
                                )}
                                <div>
                                  {isOverduePermit ? (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/60">
                                      ⚠️ Quá hạn GP
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
                            </td>

                            {/* Thao tác (Dạng 1 cột biểu tượng thu gọn kèm Tooltip khi rê chuột) */}
                            <td className="py-2.5 px-1 align-middle text-center w-12">
                              <div className="flex flex-col items-center justify-center gap-1.5">
                                {/* Hồ Sơ Máy */}
                                <div className="relative group/tip">
                                  <button
                                    onClick={() => setDetailEquipment(item)}
                                    className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white dark:bg-indigo-950/60 dark:hover:bg-indigo-600 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 transition-all shadow-2xs hover:shadow-xs active:scale-90"
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

                                {/* Báo Sự Cố */}
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

                                {/* Xóa Thiết Bị */}
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
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredList.map(item => {
                  const oee = calculateEquipmentOEE(item);
                  return (
                    <div 
                      key={item.id} 
                      className={`bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:shadow-lg transition-all p-5 flex flex-col justify-between space-y-4 shadow-sm ${
                        item.isLockedOut ? 'ring-2 ring-rose-500 bg-rose-50/20 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider border border-slate-300 dark:border-slate-700">
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
                              <h3 className="text-base font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors line-clamp-2">
                                {item.name}
                              </h3>
                            </button>
                          </div>
                          {getStatusBadge(item.status)}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {item.manufacturer} ({item.originCountry || 'Đức'}) • Model: {item.model}
                        </p>

                        <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex justify-between">
                            <span className="text-slate-400 dark:text-slate-500">Vị trí phòng:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{item.room}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 dark:text-slate-500">Người quản lý:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{item.managerInCharge || item.assignedTechnician}</span>
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
                            {item.radiationLicenseExpiry ? (
                              <span className={`font-bold ${isDatePastVN(item.radiationLicenseExpiry) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                {formatDateVN(item.radiationLicenseExpiry)} {isDatePastVN(item.radiationLicenseExpiry) && '⚠️ Quá hạn'}
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

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                        <button
                          onClick={() => setDetailEquipment(item)}
                          className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold text-center transition-all inline-flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Xem Toàn Bộ Hồ Sơ Máy</span>
                        </button>
                        <div className="grid grid-cols-2 gap-2">
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
                        </div>
                      </div>
                    </div>
                  );
                })}
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
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Lịch Trình Bảo Trì Định Kỳ & Kiểm Định Máy Móc</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Nhấn vào tên máy để xem toàn bộ lịch sử biên bản bảo trì kỹ thuật.</p>
              </div>
            </div>
            <div className="overflow-x-auto border-2 border-slate-300 dark:border-slate-700 rounded-xl">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b-2 border-slate-300 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Mã & Tên Thiết Bị</th>
                    <th className="p-3">Vị Trí Phòng</th>
                    <th className="p-3">Chu Kỳ BD</th>
                    <th className="p-3">Lần Bảo Trì Cuối</th>
                    <th className="p-3">Lịch BD (Bảo Dưỡng Kế Tiếp)</th>
                    <th className="p-3">Trạng Thái</th>
                    <th className="p-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-300 dark:divide-slate-700 bg-white dark:bg-slate-900">
                  {equipmentList.map(item => {
                    const isOverdue = isDatePastVN(item.nextMaintenanceDate);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3">
                          <button
                            onClick={() => setDetailEquipment(item)}
                            className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors block"
                          >
                            {item.name}
                          </button>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">{item.code} - {item.model}</div>
                        </td>
                        <td className="p-3 font-medium text-slate-700 dark:text-slate-300">{item.room}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{item.maintenanceIntervalMonths} tháng/lần</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{formatDateVN(item.lastMaintenanceDate)}</td>
                        <td className="p-3">
                          <span className={`font-bold ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-200'}`}>
                            {formatDateVN(item.nextMaintenanceDate)} {isOverdue && '⚠️ Quá hạn'}
                          </span>
                        </td>
                        <td className="p-3">{getStatusBadge(item.status)}</td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => setDetailEquipment(item)}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-md font-semibold text-xs"
                          >
                            Lý lịch máy
                          </button>
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setShowMaintenanceModal(true);
                            }}
                            className="px-3 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-md font-semibold text-xs transition-all"
                          >
                            Cập nhật bảo trì
                          </button>
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
          <div className="p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Nhật Ký Ghi Nhận Sự Cố & Chi Phí Sửa Chữa Toàn Bộ Thiết Bị</h3>
            <div className="space-y-3">
              {equipmentList.flatMap(e => (e.repairHistory || [])).length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl">Chưa có sự cố hư hỏng nào được ghi nhận.</p>
              ) : (
                equipmentList.flatMap(e => (e.repairHistory || [])).map(repair => (
                  <div key={repair.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Sự cố</span>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">{repair.equipmentName}</h4>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{repair.issueDescription}</p>
                      <div className="flex flex-wrap gap-3 text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                        <span>Báo bởi: <strong className="text-slate-700 dark:text-slate-300">{repair.reportedBy}</strong></span>
                        <span>Thời gian: {formatDateTimeVN(repair.reportedAt)}</span>
                        {repair.replacedParts && <span>Linh kiện thay: <strong className="text-slate-700 dark:text-slate-300">{repair.replacedParts}</strong></span>}
                      </div>
                    </div>
                    <div className="text-right flex flex-col md:items-end justify-center">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">Chi phí: {repair.cost ? `${repair.cost.toLocaleString('vi-VN')} VNĐ` : 'Chưa có'}</span>
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 mt-1 inline-block">
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Wrench className="w-5 h-5" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Thêm Thiết Bị Mới Vào Hệ Thống</h3>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEquipment} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mã thiết bị (*):</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: CT-128-02, XN-ROCHE-02"
                    value={newEqCode}
                    onChange={e => setNewEqCode(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bộ phận chuyên môn (*):</label>
                  <select
                    value={newEqCategory}
                    onChange={e => setNewEqCategory(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Chẩn đoán hình ảnh">Chẩn đoán hình ảnh (CT / MRI / X-Quang)</option>
                    <option value="Xét nghiệm">Xét nghiệm (Hóa sinh / Huyết học / Vi sinh)</option>
                    <option value="Siêu âm">Siêu âm màu / Thăm dò chức năng</option>
                    <option value="Nội soi">Nội soi tiêu hóa can thiệp</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên thiết bị y tế (*):</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Máy Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải"
                    value={newEqName}
                    onChange={e => setNewEqName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hãng sản xuất:</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Siemens Healthineers, Roche, GE"
                    value={newEqManufacturer}
                    onChange={e => setNewEqManufacturer(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nước sản xuất / Xuất xứ:</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: CHLB Đức, Nhật Bản, Thụy Sĩ, Mỹ"
                    value={newEqOrigin}
                    onChange={e => setNewEqOrigin(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Model máy:</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Somatom Go.Top 128, Lumina 3.0T"
                    value={newEqModel}
                    onChange={e => setNewEqModel(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số Serial máy (S/N):</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: SN-CT128-2025-998"
                    value={newEqSerial}
                    onChange={e => setNewEqSerial(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Vị trí phòng đặt máy:</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Phòng MSCT 128 Dải - Tầng 1"
                    value={newEqRoom}
                    onChange={e => setNewEqRoom(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bác sĩ / Người quản lý phụ trách:</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: TS. BS. Phạm Đức Thành"
                    value={newEqManager}
                    onChange={e => setNewEqManager(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">KTV vận hành chính:</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: KTV. Vũ Văn Hải"
                    value={newEqTech}
                    onChange={e => setNewEqTech(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày ghi thêm / Nhập thiết bị:</label>
                  <input
                    type="date"
                    value={newEqPurchaseDate}
                    onChange={e => setNewEqPurchaseDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Chu kỳ bảo dưỡng (tháng):</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={newEqInterval}
                    onChange={e => setNewEqInterval(parseInt(e.target.value) || 3)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hạn Giấy phép An toàn Bức xạ (nếu có):</label>
                  <input
                    type="date"
                    value={newEqRadExpiry}
                    onChange={e => setNewEqRadExpiry(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hạn kiểm định / Hiệu chuẩn ISO:</label>
                  <input
                    type="date"
                    value={newEqCalibExpiry}
                    onChange={e => setNewEqCalibExpiry(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Lý lịch máy & Mô tả thông số kỹ thuật:</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả công nghệ đầu dò, số dãy lát cắt, công suất đo, quy chuẩn an toàn..."
                  value={newEqSpecs}
                  onChange={e => setNewEqSpecs(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-sm"
                >
                  Lưu Thiết Bị Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repair Report Modal */}
      {showRepairModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">🚨 Ghi Nhận Báo Báo Sự Cố Thiết Bị</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Thiết bị: <strong className="text-slate-800 dark:text-slate-200">{selectedItem.name}</strong> ({selectedItem.code})</p>
            
            <form onSubmit={handleAddRepairLog} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mô tả sự cố chi tiết:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ví dụ: Báo lỗi cảnh báo áp lực dầu tản nhiệt bóng X-quang..."
                  value={newRepairDesc}
                  onChange={e => setNewRepairDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Dự toán chi phí sửa chữa (VNĐ):</label>
                <input
                  type="number"
                  placeholder="Ví dụ: 8500000"
                  value={newRepairCost}
                  onChange={e => setNewRepairCost(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRepairModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 dark:bg-red-500 text-white rounded-xl font-semibold hover:bg-red-700 dark:hover:bg-red-600 transition-all shadow-sm"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">🔧 Cập Nhật Lịch Bảo Trì / Kiểm Định</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Thiết bị: <strong className="text-slate-800 dark:text-slate-200">{selectedItem.name}</strong></p>

            <form onSubmit={handleAddMaintenanceLog} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Loại bảo trì:</label>
                <select
                  value={newMaintType}
                  onChange={e => setNewMaintType(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Định kỳ">Bảo trì Định kỳ</option>
                  <option value="Hiệu chuẩn">Hiệu chuẩn ISO</option>
                  <option value="Đột xuất">Bảo trì Đột xuất</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ghi chú & Kết quả nghiệm thu:</label>
                <textarea
                  rows={3}
                  placeholder="Ghi chú nội dung kiểm tra..."
                  value={newMaintNotes}
                  onChange={e => setNewMaintNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all shadow-sm"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 rounded-2xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Xác Nhận Xóa Thiết Bị</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Hành động này không thể hoàn tác sau khi thực hiện.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Mã thiết bị:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{deleteTarget.code}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 shrink-0">Tên thiết bị:</span>
                <span className="font-bold text-slate-900 dark:text-white text-right">{deleteTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Vị trí phòng:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{deleteTarget.room}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Model / Xuất xứ:</span>
                <span className="text-slate-700 dark:text-slate-300">{deleteTarget.model} ({deleteTarget.originCountry || 'Chính hãng'})</span>
              </div>
            </div>

            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
              ⚠️ <strong>Cảnh báo:</strong> Khi xóa, toàn bộ thông tin lý lịch máy móc, dữ liệu lịch bảo dưỡng định kỳ và các biên bản sự cố liên quan sẽ bị xóa hoàn toàn khỏi danh sách hệ thống.
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-xs transition-all active:scale-95"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={() => handleDeleteEquipment(deleteTarget.id)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-rose-600/20 active:scale-95 inline-flex items-center gap-1.5"
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
