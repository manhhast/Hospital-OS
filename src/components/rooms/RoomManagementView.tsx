import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2, Users, Wrench, AlertTriangle, Plus, Search, Edit3, Trash2,
  Layers, Activity, ChevronDown, ChevronRight, FolderTree, ChevronsUpDown
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { DepartmentUnit, ParaclinicalRoom, StaffProfile, EquipmentItem } from '../../types/hospital';
import { RoomModal } from './RoomModal';
import { DepartmentModal } from './DepartmentModal';
import { isEquipmentInRoom } from '../../utils/roomDisplay';
import { RoomStaffTab } from './RoomStaffTab';
import { RoomEquipmentTab } from './RoomEquipmentTab';
import { filterActiveStaffDisplayName, filterActiveStaffProfiles, getInactiveStaffMatchers } from '../../utils/staffStatus';
import {
  resolveEffectiveUserAccess,
  canManageRoomTarget,
  filterSelectableDepartmentsForActor,
  isRoomInAccessScope,
  isDepartmentInAccessScope,
} from '../../utils/rbac';

export const RoomManagementView: React.FC = () => {
  const [departments, setDepartments] = useState<DepartmentUnit[]>([]);
  const [rooms, setRooms] = useState<ParaclinicalRoom[]>([]);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);

  // Active workspace selection: either a Level 2 Room or a Level 1 Department overview
  const [selectedRoom, setSelectedRoom] = useState<ParaclinicalRoom | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentUnit | null>(null);
  const [expandedDeptIds, setExpandedDeptIds] = useState<Record<string, boolean>>({});

  // Search & sub-tab states
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'staff' | 'equipment'>('overview');

  // Room Modals state (Level 2)
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ParaclinicalRoom | null>(null);
  const [defaultRoomDeptSection, setDefaultRoomDeptSection] = useState<string | undefined>(undefined);
  const [deleteModalRoom, setDeleteModalRoom] = useState<ParaclinicalRoom | null>(null);
  const [transferTargetRoom, setTransferTargetRoom] = useState<string>('');

  // Department Modals state (Level 1)
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentUnit | null>(null);
  const [deleteModalDept, setDeleteModalDept] = useState<DepartmentUnit | null>(null);
  const [deptDeleteMode, setDeptDeleteMode] = useState<'transfer' | 'unassign' | 'delete_rooms'>('transfer');
  const [deptTransferTarget, setDeptTransferTarget] = useState<string>('');

  // RBAC Access Control
  const currentUser = storageService.getCurrentUser();
  const actorAccess = useMemo(
    () => resolveEffectiveUserAccess(currentUser, staffList, departments, rooms),
    [currentUser, staffList, departments, rooms]
  );
  const canManageDepartments = canManageRoomTarget(actorAccess, 'manage_departments', undefined, rooms);
  const canCreateAnyRoom = useMemo(() => {
    if (actorAccess.isDepartmentWide && actorAccess.permissions.canManageRoomsDepartments) return true;
    if (actorAccess.tier === 'section_head' && actorAccess.permissions.canManageRoomsDepartments) {
      return actorAccess.allowedDepartments.length > 0;
    }
    return false;
  }, [actorAccess]);
  const selectableDepartments = useMemo(
    () => filterSelectableDepartmentsForActor(actorAccess, departments),
    [actorAccess, departments]
  );

  useEffect(() => {
    const loadAllData = () => {
      const d = storageService.getDepartments();
      const r = storageService.getRooms();
      const s = storageService.getStaffProfiles();
      const e = storageService.getEquipment();

      setDepartments(d);
      setRooms(r);
      setStaffList(s);
      setEquipmentList(e);

      // Auto-expand any newly seen departments on initial load
      setExpandedDeptIds(prev => {
        const next = { ...prev };
        d.forEach(dept => {
          if (next[dept.id] === undefined) {
            next[dept.id] = true;
          }
        });
        if (next['__UNASSIGNED__'] === undefined) {
          next['__UNASSIGNED__'] = true;
        }
        return next;
      });

      // Keep active selections synced
      setSelectedDepartment(prevDept => {
        if (!prevDept) return null;
        return d.find(item => item.id === prevDept.id) || null;
      });

      if (r.length > 0) {
        setSelectedRoom(prev => {
          if (prev) {
            const found = r.find(item => item.id === prev.id);
            if (found) return found;
          }
          return r[0];
        });
      } else {
        setSelectedRoom(null);
      }
    };

    loadAllData();
    return storageService.subscribe(loadAllData);
  }, []);

  const activeStaffList = useMemo(
    () => filterActiveStaffProfiles(staffList),
    [staffList]
  );
  const inactiveStaffMatchers = useMemo(
    () => getInactiveStaffMatchers(staffList),
    [staffList]
  );

  // Filtered hierarchy groups
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const knownDeptNames = useMemo(() => new Set(departments.map(d => d.name)), [departments]);

  const orphanRooms = useMemo(
    () => rooms.filter(r => !knownDeptNames.has(r.departmentSection)),
    [rooms, knownDeptNames]
  );

  const filteredDepartmentGroups = useMemo(() => {
    return departments
      .map(dept => {
        const deptRooms = rooms.filter(r => r.departmentSection === dept.name);
        const activeDeptMgr = filterActiveStaffDisplayName(dept.managerName, inactiveStaffMatchers.names);
        const deptMatches =
          !normalizedSearch ||
          dept.name.toLowerCase().includes(normalizedSearch) ||
          dept.code.toLowerCase().includes(normalizedSearch) ||
          (activeDeptMgr && activeDeptMgr.toLowerCase().includes(normalizedSearch));

        const matchingRooms = deptMatches
          ? deptRooms
          : deptRooms.filter(r => {
              const activeRoomMgr = filterActiveStaffDisplayName(r.managerInCharge, inactiveStaffMatchers.names);
              return (
                r.name.toLowerCase().includes(normalizedSearch) ||
                r.code.toLowerCase().includes(normalizedSearch) ||
                activeRoomMgr.toLowerCase().includes(normalizedSearch) ||
                (r.primaryEquipment || '').toLowerCase().includes(normalizedSearch)
              );
            });

        const isVisible = !normalizedSearch || deptMatches || matchingRooms.length > 0;
        return {
          dept,
          rooms: matchingRooms,
          totalRoomsInDept: deptRooms.length,
          isVisible
        };
      })
      .filter(group => group.isVisible);
  }, [departments, rooms, normalizedSearch, inactiveStaffMatchers]);

  const filteredOrphanRooms = useMemo(() => {
    if (!normalizedSearch) return orphanRooms;
    return orphanRooms.filter(r => {
      const activeRoomMgr = filterActiveStaffDisplayName(r.managerInCharge, inactiveStaffMatchers.names);
      return (
        r.name.toLowerCase().includes(normalizedSearch) ||
        r.code.toLowerCase().includes(normalizedSearch) ||
        (r.departmentSection && r.departmentSection.toLowerCase().includes(normalizedSearch)) ||
        activeRoomMgr.toLowerCase().includes(normalizedSearch) ||
        (r.primaryEquipment || '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [orphanRooms, normalizedSearch, inactiveStaffMatchers]);

  // High-level KPI stats
  const totalDepartments = departments.length;
  const totalRooms = rooms.length;
  const activeRooms = rooms.filter(r => r.status === 'Đang hoạt động').length;
  const totalCasesToday = rooms.reduce((acc, r) => acc + (r.currentDayCases || 0), 0);
  const avgUtilization =
    rooms.length > 0
      ? Math.round(rooms.reduce((acc, r) => acc + (r.utilizationRate || 0), 0) / rooms.length)
      : 0;

  // Staff & Equipment for active Room
  const selectedRoomStaff = selectedRoom
    ? activeStaffList.filter(s => s.room === selectedRoom.name)
    : [];
  const selectedRoomEquipment = selectedRoom
    ? equipmentList.filter(e => isEquipmentInRoom(e.room, selectedRoom))
    : [];

  // Toggle expand/collapse
  const toggleDeptExpand = (deptId: string) => {
    setExpandedDeptIds(prev => ({ ...prev, [deptId]: !prev[deptId] }));
  };

  const allExpanded = departments.length > 0 && departments.every(d => expandedDeptIds[d.id]);
  const handleToggleExpandAll = () => {
    const targetState = !allExpanded;
    const next: Record<string, boolean> = { __UNASSIGNED__: targetState };
    departments.forEach(d => {
      next[d.id] = targetState;
    });
    setExpandedDeptIds(next);
  };

  // Department (Level 1) Handlers
  const handleSaveDepartment = (dept: DepartmentUnit) => {
    if (!canManageDepartments) return;
    const saved = storageService.saveDepartment(dept);
    setExpandedDeptIds(prev => ({ ...prev, [saved.id]: true }));
    setSelectedDepartment(saved);
    setSelectedRoom(null);
  };

  const openDeleteDeptModal = (dept: DepartmentUnit) => {
    if (!canManageDepartments) return;
    const otherDepts = departments.filter(d => d.id !== dept.id);
    setDeptDeleteMode(otherDepts.length > 0 ? 'transfer' : 'unassign');
    setDeptTransferTarget(otherDepts[0]?.name || '');
    setDeleteModalDept(dept);
  };

  const handleConfirmDeleteDepartment = () => {
    if (!deleteModalDept || !canManageDepartments) return;
    storageService.deleteDepartment(deleteModalDept.id, {
      mode: deptDeleteMode,
      targetDepartmentName: deptTransferTarget
    });
    if (selectedDepartment?.id === deleteModalDept.id) {
      setSelectedDepartment(null);
    }
    setDeleteModalDept(null);
    setDeptTransferTarget('');
  };

  // Room (Level 2) Handlers
  const openAddRoomForDept = (deptName?: string) => {
    const targetDept =
      deptName ||
      (selectedDepartment && canManageRoomTarget(actorAccess, 'create_room', { departmentName: selectedDepartment.name }, rooms)
        ? selectedDepartment.name
        : selectableDepartments[0]?.name || departments[0]?.name);
    if (!canManageRoomTarget(actorAccess, 'create_room', { departmentName: targetDept }, rooms)) return;
    setEditingRoom(null);
    setDefaultRoomDeptSection(targetDept);
    setIsRoomModalOpen(true);
  };

  const handleSaveRoom = (roomData: Partial<ParaclinicalRoom>) => {
    const isUpdate = Boolean(editingRoom?.id || roomData.id);
    const allowed = isUpdate
      ? canManageRoomTarget(actorAccess, 'edit_room', { room: roomData as ParaclinicalRoom }, rooms)
      : canManageRoomTarget(actorAccess, 'create_room', { departmentName: roomData.departmentSection }, rooms);
    if (!allowed) return;
    const saved = storageService.saveRoom(roomData as ParaclinicalRoom);
    const parentDept = departments.find(d => d.name === saved.departmentSection);
    if (parentDept) {
      setExpandedDeptIds(prev => ({ ...prev, [parentDept.id]: true }));
    }
    setSelectedDepartment(null);
    setSelectedRoom(saved);
  };

  const handleDeleteRoom = () => {
    if (!deleteModalRoom) return;
    if (!canManageRoomTarget(actorAccess, 'delete_room', { room: deleteModalRoom }, rooms)) return;
    storageService.deleteRoom(deleteModalRoom.id, transferTargetRoom || undefined);
    setDeleteModalRoom(null);
    setTransferTargetRoom('');
  };

  const handleAssignStaff = (userId: string, targetRoomName: string, departmentSection?: string) => {
    if (!selectedRoom) return;
    if (!canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms)) return;
    storageService.assignStaffToRoom(userId, targetRoomName, departmentSection);
  };

  const handleRemoveStaff = (userId: string) => {
    if (!selectedRoom) return;
    if (!canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms)) return;
    storageService.removeStaffFromRoom(userId);
  };

  const handleSetManager = (managerName: string) => {
    if (!selectedRoom) return;
    if (!canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms)) return;
    const updated = { ...selectedRoom, managerInCharge: managerName };
    storageService.saveRoom(updated);
  };

  const handleAssignEquipment = (equipmentId: string, targetRoomName: string) => {
    if (!selectedRoom) return;
    if (!canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms)) return;
    storageService.assignEquipmentToRoom(equipmentId, targetRoomName);
  };

  const handleRemoveEquipment = (equipmentId: string) => {
    if (!selectedRoom) return;
    if (!canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms)) return;
    storageService.removeEquipmentFromRoom(equipmentId);
  };

  const renderRoomTreeItem = (room: ParaclinicalRoom) => {
    const isSelected = !selectedDepartment && selectedRoom?.id === room.id;
    const roomStaffCount = activeStaffList.filter(s => s.room === room.name).length;
    const roomEqCount = equipmentList.filter(e => isEquipmentInRoom(e.room, room)).length;

    return (
      <div
        key={room.id}
        onClick={() => {
          setSelectedDepartment(null);
          setSelectedRoom(room);
        }}
        className={`group p-3 rounded-xl border transition-all cursor-pointer ${
          isSelected
            ? 'bg-blue-50/90 dark:bg-blue-950/50 border-blue-500 shadow-sm ring-1 ring-blue-500/30'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded uppercase tracking-wider">
                Cấp 2
              </span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-mono">
                {room.code}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  room.status === 'Đang hoạt động'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                }`}
              >
                {room.status}
              </span>
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs mt-1.5 leading-snug">
              {room.name}
            </h4>
          </div>

          {(canManageRoomTarget(actorAccess, 'edit_room', { room }, rooms) ||
            canManageRoomTarget(actorAccess, 'delete_room', { room }, rooms)) && (
            <div
              className="flex items-center gap-0.5 shrink-0"
              onClick={e => e.stopPropagation()}
            >
              {canManageRoomTarget(actorAccess, 'edit_room', { room }, rooms) && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoom(room);
                    setDefaultRoomDeptSection(room.departmentSection);
                    setIsRoomModalOpen(true);
                  }}
                  title="Đổi tên / Sửa phòng"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              {canManageRoomTarget(actorAccess, 'delete_room', { room }, rooms) && (
                <button
                  type="button"
                  onClick={() => setDeleteModalRoom(room)}
                  title="Xóa phòng"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center space-x-2.5">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-500" /> {roomStaffCount} NS
            </span>
            <span className="flex items-center gap-1">
              <Wrench className="w-3 h-3 text-indigo-500" /> {roomEqCount} Máy
            </span>
          </div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {room.currentDayCases}/{room.maxCapacityCasesPerDay} ca
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
            <FolderTree className="w-4 h-4" /> Cơ Cấu Phân Cấp: Bộ Phận (Cấp 1) → Phòng Trực Thuộc (Cấp 2)
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Quản Lý Bộ Phận, Phòng Chuyên Môn & Nguồn Lực
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
            Tổ chức khoa theo 2 cấp rõ ràng: <strong>Bộ phận (Cấp 1)</strong> quản lý danh sách các <strong>Phòng trực thuộc (Cấp 2)</strong>, điều phối nhân sự và thiết bị y tế theo từng phòng.
          </p>
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{actorAccess.shortTierLabel}</span>
            <span className="text-slate-400">•</span>
            <span>Phạm vi quản lý: {actorAccess.scopeLabel}</span>
          </div>
        </div>

        {(canManageDepartments || canCreateAnyRoom) && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canManageDepartments && (
              <button
                type="button"
                onClick={() => {
                  setEditingDept(null);
                  setIsDeptModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" /> Thêm Bộ Phận (Cấp 1)
              </button>
            )}
            {canCreateAnyRoom && (
              <button
                type="button"
                onClick={() => openAddRoomForDept()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-blue-600/20"
              >
                <Plus className="w-4 h-4" /> Thêm Phòng (Cấp 2)
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bộ phận (Cấp 1)</p>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {totalDepartments} <span className="text-xs text-slate-400 font-normal">bộ phận</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Phòng trực thuộc (Cấp 2)</p>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {totalRooms}{' '}
              <span className="text-xs text-emerald-500 font-bold font-mono">({activeRooms} hoạt động)</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Nhân sự toàn Khoa</p>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {activeStaffList.length} <span className="text-xs text-slate-400 font-normal">hồ sơ</span>
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
              {totalCasesToday}{' '}
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">({avgUtilization}%)</span>
            </h3>
          </div>
        </div>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 2-Level Hierarchy Tree (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Tree Header & Search */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <FolderTree className="w-4 h-4 text-indigo-500" />
                Cây Cơ Cấu Bộ Phận & Phòng
              </h3>
              <button
                type="button"
                onClick={handleToggleExpandAll}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 transition-colors"
              >
                <ChevronsUpDown className="w-3 h-3" />
                {allExpanded ? 'Thu gọn' : 'Mở rộng tất cả'}
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên bộ phận, mã phòng, tên phòng..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Hierarchical List */}
          <div className="space-y-3 max-h-[calc(100vh-340px)] overflow-y-auto custom-scrollbar pr-1">
            {filteredDepartmentGroups.length === 0 && filteredOrphanRooms.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400 space-y-2">
                <p>Không tìm thấy Bộ phận hoặc Phòng phù hợp.</p>
                {canManageDepartments && departments.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDept(null);
                      setIsDeptModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tạo Bộ Phận Đầu Tiên
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredDepartmentGroups.map(({ dept, rooms: deptRooms, totalRoomsInDept }) => {
                  const isExpanded = normalizedSearch ? true : !!expandedDeptIds[dept.id];
                  const isDeptSelected = selectedDepartment?.id === dept.id;

                  return (
                    <div
                      key={dept.id}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isDeptSelected
                          ? 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-700 shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm'
                      }`}
                    >
                      {/* LEVEL 1 HEADER: Bộ Phận */}
                      <div
                        onClick={() => {
                          setSelectedDepartment(dept);
                          setExpandedDeptIds(prev => ({ ...prev, [dept.id]: true }));
                        }}
                        className="p-3.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              toggleDeptExpand(dept.id);
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 shrink-0"
                            title={isExpanded ? 'Thu gọn danh sách phòng' : 'Mở rộng danh sách phòng'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded uppercase tracking-wider border border-indigo-200/70 dark:border-indigo-800">
                                Cấp 1
                              </span>
                              <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                                {dept.code}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {totalRoomsInDept} phòng
                              </span>
                            </div>
                            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm mt-1 truncate">
                              {dept.name}
                            </h3>
                          </div>
                        </div>

                        {/* Scoped Actions for Level 1 Bộ phận */}
                        {(canManageDepartments ||
                          canManageRoomTarget(actorAccess, 'create_room', { departmentName: dept.name }, rooms)) && (
                          <div
                            className="flex items-center gap-0.5 shrink-0"
                            onClick={e => e.stopPropagation()}
                          >
                            {canManageRoomTarget(actorAccess, 'create_room', { departmentName: dept.name }, rooms) && (
                              <button
                                type="button"
                                onClick={() => openAddRoomForDept(dept.name)}
                                title={`Thêm phòng (Cấp 2) vào bộ phận ${dept.name}`}
                                className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                            {canManageDepartments && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDept(dept);
                                    setIsDeptModalOpen(true);
                                  }}
                                  title="Đổi tên / Sửa bộ phận"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDeleteDeptModal(dept)}
                                  title="Xóa bộ phận"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* LEVEL 2 CHILDREN: Phòng thuộc Bộ Phận */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 bg-slate-50/70 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/80">
                          <div className="ml-3 pl-3 border-l-2 border-indigo-200 dark:border-indigo-800/70 space-y-2 pt-2">
                            {deptRooms.length === 0 ? (
                              <div className="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 text-center space-y-1.5">
                                <p className="text-[11px] text-slate-400">
                                  Chưa có phòng trực thuộc trong bộ phận này
                                </p>
                                {canManageRoomTarget(actorAccess, 'create_room', { departmentName: dept.name }, rooms) && (
                                  <button
                                    type="button"
                                    onClick={() => openAddRoomForDept(dept.name)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg transition-colors"
                                  >
                                    <Plus className="w-3 h-3" /> Thêm phòng vào bộ phận
                                  </button>
                                )}
                              </div>
                            ) : (
                              deptRooms.map(room => renderRoomTreeItem(room))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Orphaned Rooms Fallback Group (if any room doesn't belong to a named Level 1 dept) */}
                {filteredOrphanRooms.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleDeptExpand('__UNASSIGNED__')}
                      className="p-3.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                    >
                      <div className="flex items-center gap-2">
                        {expandedDeptIds['__UNASSIGNED__'] ? (
                          <ChevronDown className="w-4 h-4 text-amber-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-amber-500" />
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-extrabold px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded uppercase">
                              Chưa phân bộ phận
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {filteredOrphanRooms.length} phòng
                            </span>
                          </div>
                          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-1">
                            Các phòng chưa gắn Bộ phận (Cấp 1)
                          </h3>
                        </div>
                      </div>
                    </div>

                    {(normalizedSearch || expandedDeptIds['__UNASSIGNED__']) && (
                      <div className="px-3 pb-3 pt-1 bg-slate-50/70 dark:bg-slate-950/40 border-t border-amber-100 dark:border-amber-900/40">
                        <div className="ml-3 pl-3 border-l-2 border-amber-200 dark:border-amber-800 space-y-2 pt-2">
                          {filteredOrphanRooms.map(room => renderRoomTreeItem(room))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Active Department (Level 1) or Active Room (Level 2) Workspace (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {selectedDepartment ? (
            /* LEVEL 1 DEPARTMENT WORKSPACE */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded text-xs font-extrabold uppercase">
                      Cấp 1 • Bộ Phận
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-xs font-mono font-bold">
                      {selectedDepartment.code}
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
                    {selectedDepartment.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(() => {
                      const activeDeptMgr = filterActiveStaffDisplayName(
                        selectedDepartment.managerName,
                        inactiveStaffMatchers.names
                      );
                      return activeDeptMgr ? (
                        <>
                          Phụ trách bộ phận:{' '}
                          <strong className="text-slate-800 dark:text-slate-200">{activeDeptMgr}</strong>
                        </>
                      ) : (
                        'Chưa chỉ định người phụ trách bộ phận'
                      );
                    })()}
                  </p>
                </div>

                {(canManageDepartments ||
                  canManageRoomTarget(actorAccess, 'create_room', { departmentName: selectedDepartment.name }, rooms)) && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {canManageRoomTarget(actorAccess, 'create_room', { departmentName: selectedDepartment.name }, rooms) && (
                      <button
                        type="button"
                        onClick={() => openAddRoomForDept(selectedDepartment.name)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Thêm Phòng (Cấp 2)
                      </button>
                    )}
                    {canManageDepartments && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDept(selectedDepartment);
                            setIsDeptModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-indigo-500" /> Đổi Tên / Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteDeptModal(selectedDepartment)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Xóa Bộ Phận
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {selectedDepartment.description && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-slate-900 dark:text-white block mb-1">Chức năng chuyên môn:</span>
                  {selectedDepartment.description}
                </div>
              )}

              {/* Child Rooms List inside Selected Department */}
              {(() => {
                const deptRooms = rooms.filter(r => r.departmentSection === selectedDepartment.name);
                const deptStaffCount = activeStaffList.filter(s => s.departmentSection === selectedDepartment.name).length;

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        Danh Sách Phòng Trực Thuộc (Cấp 2) — {deptRooms.length} phòng • {deptStaffCount} nhân sự
                      </h3>
                    </div>

                    {deptRooms.length === 0 ? (
                      <div className="p-10 text-center bg-slate-50/70 dark:bg-slate-800/30 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                        <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Bộ phận <strong>"{selectedDepartment.name}"</strong> hiện chưa có phòng trực thuộc nào.
                        </p>
                        {canManageRoomTarget(actorAccess, 'create_room', { departmentName: selectedDepartment.name }, rooms) && (
                          <button
                            type="button"
                            onClick={() => openAddRoomForDept(selectedDepartment.name)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            <Plus className="w-4 h-4" /> Tạo Phòng Đầu Tiên Cho Bộ Phận Này
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {deptRooms.map(room => {
                          const rStaffCount = activeStaffList.filter(s => s.room === room.name).length;
                          const rEqCount = equipmentList.filter(
                            e => e.room === room.name || e.room.toLowerCase().includes(room.code.toLowerCase())
                          ).length;

                          return (
                            <div
                              key={room.id}
                              onClick={() => {
                                setSelectedDepartment(null);
                                setSelectedRoom(room);
                              }}
                              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer space-y-2.5 shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded font-mono">
                                      {room.code}
                                    </span>
                                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                      {room.status}
                                    </span>
                                  </div>
                                  <h4 className="font-bold text-slate-900 dark:text-white text-sm mt-1">
                                    {room.name}
                                  </h4>
                                </div>
                                {(canManageRoomTarget(actorAccess, 'edit_room', { room }, rooms) ||
                                  canManageRoomTarget(actorAccess, 'delete_room', { room }, rooms)) && (
                                  <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                    {canManageRoomTarget(actorAccess, 'edit_room', { room }, rooms) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingRoom(room);
                                          setDefaultRoomDeptSection(room.departmentSection);
                                          setIsRoomModalOpen(true);
                                        }}
                                        title="Đổi tên / Sửa phòng"
                                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/60"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {canManageRoomTarget(actorAccess, 'delete_room', { room }, rooms) && (
                                      <button
                                        type="button"
                                        onClick={() => setDeleteModalRoom(room)}
                                        title="Xóa phòng"
                                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Phụ trách:{' '}
                                <strong className="text-slate-700 dark:text-slate-200">
                                  {filterActiveStaffDisplayName(room.managerInCharge, inactiveStaffMatchers.names) || 'Chưa chỉ định'}
                                </strong>
                              </p>

                              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                <span>{rStaffCount} Nhân sự • {rEqCount} Thiết bị</span>
                                <span className="text-blue-600 dark:text-blue-400 font-bold">Mở chi tiết →</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : selectedRoom ? (
            /* LEVEL 2 ROOM WORKSPACE */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
              {/* Room Detailed Header */}
              <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded text-[10px] font-extrabold uppercase">
                      Cấp 2 • Phòng
                    </span>
                    <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-xs font-bold font-mono uppercase">
                      {selectedRoom.code}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Thuộc Bộ phận (Cấp 1):{' '}
                      <strong className="text-indigo-600 dark:text-indigo-400">
                        {selectedRoom.departmentSection}
                      </strong>
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
                    {selectedRoom.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Vị trí: {selectedRoom.floor} • Trưởng phòng:{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {filterActiveStaffDisplayName(selectedRoom.managerInCharge, inactiveStaffMatchers.names) || 'Chưa chỉ định'}
                    </strong>
                    {filterActiveStaffDisplayName(selectedRoom.deputyManager, inactiveStaffMatchers.names) && (
                      <span>
                        {' '}
                        • Phó phụ trách:{' '}
                        <strong>
                          {filterActiveStaffDisplayName(selectedRoom.deputyManager, inactiveStaffMatchers.names)}
                        </strong>
                      </span>
                    )}
                    {selectedRoom.primaryEquipment && selectedRoom.primaryEquipment !== 'Chưa gán máy chính' && (
                      <span>
                        {' '}
                        • Máy chính: <strong className="text-blue-600 dark:text-blue-400">{selectedRoom.primaryEquipment}</strong>
                      </span>
                    )}
                  </p>
                </div>

                {/* Top Action Buttons for Selected Room (Scoped RBAC) */}
                {(canManageRoomTarget(actorAccess, 'edit_room', { room: selectedRoom }, rooms) ||
                  canManageRoomTarget(actorAccess, 'delete_room', { room: selectedRoom }, rooms)) && (
                  <div className="flex items-center gap-2 shrink-0">
                    {canManageRoomTarget(actorAccess, 'edit_room', { room: selectedRoom }, rooms) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRoom(selectedRoom);
                          setDefaultRoomDeptSection(selectedRoom.departmentSection);
                          setIsRoomModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all"
                        title="Chỉnh sửa hoặc đổi tên phòng"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-blue-500" /> Đổi Tên / Sửa
                      </button>
                    )}

                    {canManageRoomTarget(actorAccess, 'delete_room', { room: selectedRoom }, rooms) && (
                      <button
                        type="button"
                        onClick={() => setDeleteModalRoom(selectedRoom)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-all"
                        title="Xóa phòng này"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Xóa Phòng
                      </button>
                    )}
                  </div>
                )}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <h5 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5 text-blue-600">
                        <Users className="w-4 h-4" /> Cơ Cấu Nhân Sự ({selectedRoomStaff.length})
                      </h5>
                      {selectedRoomStaff.length === 0 ? (
                        <p className="text-xs text-slate-400">Chưa có nhân viên nào phân công tại phòng này.</p>
                      ) : (
                        <div className="space-y-1.5 pt-1">
                          {selectedRoomStaff.slice(0, 4).map((s, idx) => (
                            <div key={`${s.userId}-${idx}`} className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">{s.fullName}</span>
                              <span className="text-[11px] text-slate-500">{s.title || 'Nhân viên'}</span>
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
                          {selectedRoomEquipment.slice(0, 4).map((eq, idx) => (
                            <div key={`${eq.id}-${idx}`} className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                                {eq.name}
                              </span>
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
                  allStaff={activeStaffList}
                  allRooms={rooms}
                  canManage={canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms)}
                  scopeHint={!canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms) ? 'Ngoài phạm vi phòng/bộ phận bạn quản lý' : undefined}
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
                  canManage={canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms)}
                  scopeHint={!canManageRoomTarget(actorAccess, 'manage_room_resources', { room: selectedRoom }, rooms) ? 'Ngoài phạm vi phòng/bộ phận bạn quản lý' : undefined}
                  onAssignEquipment={handleAssignEquipment}
                  onRemoveEquipment={handleRemoveEquipment}
                />
              )}
            </div>
          ) : (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-sm">
              Vui lòng chọn một Bộ phận (Cấp 1) hoặc Phòng trực thuộc (Cấp 2) ở cây danh sách bên trái để xem chi tiết.
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Add / Edit Level 1 Bộ Phận */}
      <DepartmentModal
        isOpen={isDeptModalOpen}
        onClose={() => {
          setIsDeptModalOpen(false);
          setEditingDept(null);
        }}
        onSave={handleSaveDepartment}
        initialDepartment={editingDept}
        existingDepartments={departments}
        staffList={activeStaffList}
      />

      {/* MODAL 2: Add / Edit Level 2 Phòng */}
      <RoomModal
        isOpen={isRoomModalOpen}
        onClose={() => {
          setIsRoomModalOpen(false);
          setEditingRoom(null);
        }}
        onSave={handleSaveRoom}
        initialRoom={editingRoom}
        departments={selectableDepartments.length > 0 ? selectableDepartments : departments}
        defaultDepartmentSection={defaultRoomDeptSection}
        staffList={activeStaffList}
        equipmentList={equipmentList}
      />

      {/* MODAL 3: Safe Level 1 Department Deletion */}
      {deleteModalDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Xác Nhận Xóa Bộ Phận (Cấp 1)
                </h3>
                <p className="text-xs text-slate-500">Thao tác sẽ gỡ bộ phận khỏi cơ cấu phân cấp</p>
              </div>
            </div>

            {(() => {
              const childRoomsCount = rooms.filter(r => r.departmentSection === deleteModalDept.name).length;
              const childStaffCount = activeStaffList.filter(s => s.departmentSection === deleteModalDept.name).length;
              const otherDepts = departments.filter(d => d.id !== deleteModalDept.id);

              return (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Bạn đang chuẩn bị xóa Bộ phận <strong>"{deleteModalDept.name}"</strong> ({deleteModalDept.code}).
                    {childRoomsCount > 0 && (
                      <span>
                        {' '}
                        Hiện có <strong>{childRoomsCount} phòng (Cấp 2)</strong> và{' '}
                        <strong>{childStaffCount} nhân sự</strong> trực thuộc bộ phận này.
                      </span>
                    )}
                  </p>

                  {childRoomsCount > 0 && (
                    <div className="space-y-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                      <label className="block font-bold text-slate-700 dark:text-slate-200">
                        Xử lý các Phòng (Cấp 2) trực thuộc:
                      </label>

                      {otherDepts.length > 0 && (
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="deptDeleteMode"
                            checked={deptDeleteMode === 'transfer'}
                            onChange={() => setDeptDeleteMode('transfer')}
                            className="mt-0.5"
                          />
                          <div className="flex-1 space-y-1.5">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Chuyển sang Bộ phận khác:
                            </span>
                            {deptDeleteMode === 'transfer' && (
                              <select
                                value={deptTransferTarget}
                                onChange={e => setDeptTransferTarget(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white outline-none"
                              >
                                {otherDepts.map(d => (
                                  <option key={d.id} value={d.name}>
                                    {d.name} ({d.code})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </label>
                      )}

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="deptDeleteMode"
                          checked={deptDeleteMode === 'unassign'}
                          onChange={() => setDeptDeleteMode('unassign')}
                        />
                        <span className="text-slate-700 dark:text-slate-300">
                          Giữ lại phòng ở nhóm "Chưa phân bộ phận"
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-rose-600 dark:text-rose-400">
                        <input
                          type="radio"
                          name="deptDeleteMode"
                          checked={deptDeleteMode === 'delete_rooms'}
                          onChange={() => setDeptDeleteMode('delete_rooms')}
                        />
                        <span className="font-semibold">Xóa luôn toàn bộ phòng trực thuộc bộ phận này</span>
                      </label>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeleteModalDept(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDepartment}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-md shadow-rose-600/20"
              >
                Xóa Bộ Phận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Safe Level 2 Room Deletion with Transfer Option */}
      {deleteModalRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Xác Nhận Xóa Phòng (Cấp 2)
                </h3>
                <p className="text-xs text-slate-500">Thao tác này sẽ xóa vĩnh viễn cấu hình phòng</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Bạn đang chuẩn bị xóa phòng <strong>"{deleteModalRoom.name}"</strong> ({deleteModalRoom.code}) thuộc Bộ phận{' '}
              <strong>{deleteModalRoom.departmentSection}</strong>.
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
                {rooms
                  .filter(r => r.id !== deleteModalRoom.id)
                  .map(r => (
                    <option key={r.id} value={r.name}>
                      {r.name} ({r.code} - {r.departmentSection})
                    </option>
                  ))}
              </select>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeleteModalRoom(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
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
