import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, Wrench, AlertTriangle, CheckCircle2, 
  Plus, Search, ShieldAlert, ArrowRightLeft, Edit3, Trash2, Layers, HardDrive,
  BarChart3, UserCheck, Star, Activity, Phone, FileText, ChevronRight, XCircle,
  HelpCircle, RefreshCw
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { ParaclinicalRoom, StaffProfile, EquipmentItem } from '../../types/hospital';
import { RoomModal } from './RoomModal';
import { RoomStaffTab } from './RoomStaffTab';
import { RoomEquipmentTab } from './RoomEquipmentTab';

export const RoomManagementView: React.FC = () => {
  const [rooms, setRooms] = useState<ParaclinicalRoom[]>([]);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ParaclinicalRoom | null>(null);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('all');
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'staff' | 'equipment'>('overview');

  // Modals state
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ParaclinicalRoom | null>(null);
  const [deleteModalRoom, setDeleteModalRoom] = useState<ParaclinicalRoom | null>(null);
  const [transferTargetRoom, setTransferTargetRoom] = useState<string>('');

  useEffect(() => {
    const loadAllData = () => {
      const r = storageService.getRooms();
      const s = storageService.getStaffProfiles();
      const e = storageService.getEquipment();
      setRooms(r);
      setStaffList(s);
      setEquipmentList(e);

      // Keep selectedRoom reference up to date
      if (r.length > 0) {
        setSelectedRoom(prev => {
          if (!prev) return r[0];
          const found = r.find(item => item.id === prev.id);
          return found || r[0];
        });
      } else {
        setSelectedRoom(null);
      }
    };

    loadAllData();
    return storageService.subscribe(loadAllData);
  }, []);

  // Department tabs list
  const departmentSections = ['all', 'Chẩn đoán hình ảnh', 'Xét nghiệm', 'Thăm dò chức năng', 'Hành chính Khoa'];

  // Filtered rooms
  const filteredRooms = rooms.filter(room => {
    const matchDept = selectedDepartmentFilter === 'all' || room.departmentSection === selectedDepartmentFilter;
    const matchSearch = room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        room.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        room.managerInCharge.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        room.primaryEquipment.toLowerCase().includes(searchTerm.toLowerCase());
    return matchDept && matchSearch;
  });

  // Calculate high-level stats
  const totalRooms = rooms.length;
  const activeRooms = rooms.filter(r => r.status === 'Đang hoạt động').length;
  const totalCasesToday = rooms.reduce((acc, r) => acc + (r.currentDayCases || 0), 0);
  const avgUtilization = rooms.length > 0 
    ? Math.round(rooms.reduce((acc, r) => acc + (r.utilizationRate || 0), 0) / rooms.length) 
    : 0;

  // Staff and Equipment counts for the selected room
  const selectedRoomStaff = selectedRoom 
    ? staffList.filter(s => s.room === selectedRoom.name) 
    : [];
  const selectedRoomEquipment = selectedRoom 
    ? equipmentList.filter(e => e.room === selectedRoom.name || e.room.toLowerCase().includes(selectedRoom.code.toLowerCase())) 
    : [];

  // Handlers
  const handleSaveRoom = (roomData: Partial<ParaclinicalRoom>, isEdit: boolean) => {
    const saved = storageService.saveRoom(roomData as ParaclinicalRoom);
    setSelectedRoom(saved);
  };

  const handleDeleteRoom = () => {
    if (!deleteModalRoom) return;
    storageService.deleteRoom(deleteModalRoom.id, transferTargetRoom || undefined);
    setDeleteModalRoom(null);
    setTransferTargetRoom('');
  };

  const handleAssignStaff = (userId: string, targetRoomName: string, departmentSection?: string) => {
    storageService.assignStaffToRoom(userId, targetRoomName, departmentSection);
  };

  const handleRemoveStaff = (userId: string) => {
    storageService.removeStaffFromRoom(userId);
  };

  const handleSetManager = (managerName: string) => {
    if (!selectedRoom) return;
    const updated = { ...selectedRoom, managerInCharge: managerName };
    storageService.saveRoom(updated);
  };

  const handleAssignEquipment = (equipmentId: string, targetRoomName: string) => {
    storageService.assignEquipmentToRoom(equipmentId, targetRoomName);
  };

  const handleRemoveEquipment = (equipmentId: string) => {
    storageService.removeEquipmentFromRoom(equipmentId);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
            <Building2 className="w-4 h-4" /> Danh Sách Phòng / Bộ Phận Trực Thuộc Khoa & Quản Lý Nguồn Lực
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Cơ Cấu Phòng Ban, Nhân Sự & Máy Móc Cận Lâm Sàng
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
            Quản lý danh sách phòng, bộ phận chuyên môn; điều phối nhân viên trực thuộc từ hồ sơ <strong>Nhân Sự & Đào Tạo</strong>; gán và quản lý thiết bị y tế từ <strong>Quản Lý Máy Móc</strong>; cập nhật và chỉnh sửa thông tin phòng ban linh hoạt.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              setEditingRoom(null);
              setIsRoomModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" /> Thêm Phòng / Bộ Phận Mới
          </button>
        </div>
      </div>

      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tổng số Phòng / Bộ phận</p>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {totalRooms} <span className="text-xs text-emerald-500 font-bold font-mono">({activeRooms} hoạt động)</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Nhân sự toàn Khoa</p>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {staffList.length} <span className="text-xs text-slate-400 font-normal">hồ sơ</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tổng máy móc thiết bị</p>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {equipmentList.length} <span className="text-xs text-slate-400 font-normal">hệ thống</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tổng ca bệnh hôm nay</p>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {totalCasesToday} <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">({avgUtilization}%)</span>
            </h3>
          </div>
        </div>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Department Filter & Room List (4.5 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Department Filter Tabs */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-500" />
                Bộ Phận Trực Thuộc
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full">
                {rooms.length} phòng
              </span>
            </div>

            {/* Department Pill Filter */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {departmentSections.map(dept => {
                const count = dept === 'all' 
                  ? rooms.length 
                  : rooms.filter(r => r.departmentSection === dept).length;
                const isSelected = selectedDepartmentFilter === dept;

                return (
                  <button
                    key={dept}
                    onClick={() => setSelectedDepartmentFilter(dept)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{dept === 'all' ? 'Tất cả' : dept}</span>
                    <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative pt-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 mt-1 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã phòng, tên phòng, phụ trách..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Rooms Scrollable List */}
          <div className="space-y-3 max-h-[calc(100vh-380px)] overflow-y-auto custom-scrollbar pr-1">
            {filteredRooms.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                Không tìm thấy phòng nào phù hợp với điều kiện tìm kiếm.
              </div>
            ) : (
              filteredRooms.map(room => {
                const isSelected = selectedRoom?.id === room.id;
                const roomStaffCount = staffList.filter(s => s.room === room.name).length;
                const roomEqCount = equipmentList.filter(e => e.room === room.name || e.room.toLowerCase().includes(room.code.toLowerCase())).length;

                return (
                  <div
                    key={room.id}
                    onClick={() => setSelectedRoom(room)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/30'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-extrabold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded uppercase tracking-wider">
                            {room.code}
                          </span>
                          <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold truncate max-w-[140px]">
                            {room.departmentSection}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm mt-1 leading-snug">
                          {room.name}
                        </h4>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        room.status === 'Đang hoạt động' 
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      }`}>
                        {room.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                      Phụ trách: <strong className="text-slate-700 dark:text-slate-300">{room.managerInCharge}</strong>
                    </p>

                    {/* Resources Count & Utilization */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center space-x-3">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-blue-500" /> {roomStaffCount} NS
                        </span>
                        <span className="flex items-center gap-1">
                          <Wrench className="w-3.5 h-3.5 text-indigo-500" /> {roomEqCount} Máy
                        </span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {room.currentDayCases}/{room.maxCapacityCasesPerDay} ca ({room.utilizationRate}%)
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Room Workspace (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {selectedRoom ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
              {/* Room Detailed Header */}
              <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded text-xs font-bold uppercase">
                      {selectedRoom.code}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Bộ phận: <strong className="text-slate-700 dark:text-slate-300">{selectedRoom.departmentSection}</strong>
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
                    {selectedRoom.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Vị trí: {selectedRoom.floor} • Trưởng phòng: <strong className="text-slate-800 dark:text-slate-200">{selectedRoom.managerInCharge}</strong>
                    {selectedRoom.deputyManager && <span> • KTV Trưởng: <strong>{selectedRoom.deputyManager}</strong></span>}
                  </p>
                </div>

                {/* Top Action Buttons for Selected Room */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditingRoom(selectedRoom);
                      setIsRoomModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all"
                    title="Chỉnh sửa hoặc đổi tên phòng/bộ phận"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-500" /> Đổi Tên / Sửa
                  </button>

                  <button
                    onClick={() => setDeleteModalRoom(selectedRoom)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-all"
                    title="Xóa phòng này"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa Phòng
                  </button>
                </div>
              </div>

              {/* Navigation Sub-Tabs */}
              <div className="flex items-center space-x-1 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
                <button
                  onClick={() => setActiveSubTab('overview')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeSubTab === 'overview'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Building2 className="w-4 h-4" /> Tổng Quan & Công Suất
                </button>

                <button
                  onClick={() => setActiveSubTab('staff')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeSubTab === 'staff'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Users className="w-4 h-4" /> Nhân Sự Trực Thuộc ({selectedRoomStaff.length})
                </button>

                <button
                  onClick={() => setActiveSubTab('equipment')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeSubTab === 'equipment'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Wrench className="w-4 h-4" /> Thiết Bị & Máy Móc ({selectedRoomEquipment.length})
                </button>
              </div>

              {/* SUB-TAB 1: Overview & Capacity */}
              {activeSubTab === 'overview' && (
                <div className="space-y-6 animate-fade-in">
                  {/* Utilization Metrics Block */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                          Tải Công Suất Vận Hành Trong Ngày
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Hệ số sử dụng máy móc & kíp trực theo công suất thiết kế
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                          {selectedRoom.currentDayCases} / {selectedRoom.maxCapacityCasesPerDay} ca
                        </span>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">
                          ({selectedRoom.utilizationRate}%)
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          selectedRoom.utilizationRate > 85 
                            ? 'bg-amber-500' 
                            : selectedRoom.utilizationRate > 100 
                            ? 'bg-rose-500' 
                            : 'bg-blue-600 dark:bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(selectedRoom.utilizationRate, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Room Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <h5 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5 text-blue-600">
                        <Users className="w-4 h-4" /> Cơ Cấu Nhân Sự ({selectedRoomStaff.length})
                      </h5>
                      {selectedRoomStaff.length === 0 ? (
                        <p className="text-xs text-slate-400">Chưa có nhân viên nào phân công tại phòng này.</p>
                      ) : (
                        <div className="space-y-1.5 pt-1">
                          {selectedRoomStaff.slice(0, 4).map(s => (
                            <div key={s.userId} className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">{s.fullName}</span>
                              <span className="text-[11px] text-slate-500">{s.title || 'Cán bộ'}</span>
                            </div>
                          ))}
                          {selectedRoomStaff.length > 4 && (
                            <button
                              onClick={() => setActiveSubTab('staff')}
                              className="text-xs text-blue-600 font-bold hover:underline"
                            >
                              + Xem thêm {selectedRoomStaff.length - 4} nhân sự khác
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <h5 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5 text-indigo-600">
                        <Wrench className="w-4 h-4" /> Hệ Thống Máy Móc ({selectedRoomEquipment.length})
                      </h5>
                      {selectedRoomEquipment.length === 0 ? (
                        <p className="text-xs text-slate-400">Chưa có máy móc nào gán cho phòng này.</p>
                      ) : (
                        <div className="space-y-1.5 pt-1">
                          {selectedRoomEquipment.slice(0, 4).map(eq => (
                            <div key={eq.id} className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{eq.name}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                {eq.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedRoom.description && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <h6 className="font-bold text-slate-900 dark:text-white">Mô tả & Quy trình chuyên môn:</h6>
                      <p>{selectedRoom.description}</p>
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 2: Staff Management in Room */}
              {activeSubTab === 'staff' && (
                <RoomStaffTab
                  room={selectedRoom}
                  allStaff={staffList}
                  allRooms={rooms}
                  onAssignStaff={handleAssignStaff}
                  onRemoveStaff={handleRemoveStaff}
                  onSetManager={handleSetManager}
                />
              )}

              {/* SUB-TAB 3: Equipment in Room */}
              {activeSubTab === 'equipment' && (
                <RoomEquipmentTab
                  room={selectedRoom}
                  allEquipment={equipmentList}
                  allRooms={rooms}
                  onAssignEquipment={handleAssignEquipment}
                  onRemoveEquipment={handleRemoveEquipment}
                />
              )}
            </div>
          ) : (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
              Vui lòng chọn một phòng từ danh sách bên trái để xem chi tiết hoặc quản lý nhân sự & thiết bị.
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Add / Edit Room */}
      <RoomModal
        isOpen={isRoomModalOpen}
        onClose={() => {
          setIsRoomModalOpen(false);
          setEditingRoom(null);
        }}
        onSave={handleSaveRoom}
        initialRoom={editingRoom}
        staffList={staffList}
      />

      {/* MODAL: Safe Room Deletion with Transfer Option */}
      {deleteModalRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Xác Nhận Xóa Phòng / Bộ Phận
                </h3>
                <p className="text-xs text-slate-500">Thao tác này sẽ xóa vĩnh viễn cấu hình phòng</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Bạn đang chuẩn bị xóa phòng <strong>"{deleteModalRoom.name}"</strong> ({deleteModalRoom.code}).
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Điều chuyển nhân sự và máy móc hiện tại sang phòng:
              </label>
              <select
                value={transferTargetRoom}
                onChange={e => setTransferTargetRoom(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">-- Chuyển về trạng thái Chưa phân phòng --</option>
                {rooms.filter(r => r.id !== deleteModalRoom.id).map(r => (
                  <option key={r.id} value={r.name}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeleteModalRoom(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDeleteRoom}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-md shadow-rose-600/20"
              >
                Xóa Phòng Ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
