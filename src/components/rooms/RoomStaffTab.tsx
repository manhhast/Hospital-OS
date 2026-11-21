import React, { useState, useMemo } from 'react';
import { 
  Users, Plus, UserPlus, ArrowRightLeft, UserMinus, Shield, Phone, Mail, 
  Search, CheckCircle2, UserCheck, Star, Award, ChevronRight, X
} from 'lucide-react';
import { ParaclinicalRoom, StaffProfile } from '../../types/hospital';
import { filterActiveStaffProfiles } from '../../utils/staffStatus';

interface RoomStaffTabProps {
  room: ParaclinicalRoom;
  allStaff: StaffProfile[];
  allRooms: ParaclinicalRoom[];
  canManage?: boolean;
  scopeHint?: string;
  onAssignStaff: (userId: string, targetRoomName: string, departmentSection?: string) => void;
  onRemoveStaff: (userId: string) => void;
  onSetManager: (managerName: string) => void;
}

export const RoomStaffTab: React.FC<RoomStaffTabProps> = ({
  room,
  allStaff,
  allRooms,
  canManage = false,
  scopeHint,
  onAssignStaff,
  onRemoveStaff,
  onSetManager
}) => {
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [transferStaffUser, setTransferStaffUser] = useState<StaffProfile | null>(null);
  const [confirmRemoveStaff, setConfirmRemoveStaff] = useState<StaffProfile | null>(null);
  const [selectedTargetRoom, setSelectedTargetRoom] = useState<string>('');
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);

  const activeStaff = useMemo(() => filterActiveStaffProfiles(allStaff), [allStaff]);

  // Filter active staff currently assigned to this room
  const assignedStaff = activeStaff.filter(s => s.room === room.name);

  // Available active staff to assign (not already in this room)
  const availableStaff = activeStaff.filter(s => s.room !== room.name).filter(s => 
    s.fullName.toLowerCase().includes(staffSearchTerm.toLowerCase()) ||
    (s.specialty && s.specialty.toLowerCase().includes(staffSearchTerm.toLowerCase())) ||
    (s.title && s.title.toLowerCase().includes(staffSearchTerm.toLowerCase())) ||
    (s.room && s.room.toLowerCase().includes(staffSearchTerm.toLowerCase()))
  );

  const handleBulkAssign = () => {
    if (selectedStaffIds.length === 0) return;
    selectedStaffIds.forEach(id => {
      onAssignStaff(id, room.name, room.departmentSection);
    });
    setSelectedStaffIds([]);
    setShowAssignModal(false);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferStaffUser || !selectedTargetRoom) return;
    const targetRoomObj = allRooms.find(r => r.name === selectedTargetRoom);
    onAssignStaff(transferStaffUser.userId, selectedTargetRoom, targetRoomObj?.departmentSection);
    setTransferStaffUser(null);
    setSelectedTargetRoom('');
  };

  const toggleStaffSelection = (userId: string) => {
    setSelectedStaffIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F4F7FB] dark:bg-slate-800/40 p-4 rounded-xl border border-[#DFE7F0] dark:border-slate-800">
        <div>
          <h3 className="font-bold text-[#263445] dark:text-white text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-[#1976D2] dark:text-blue-400" />
            <span>Nhân Sự Công Tác Tại Phòng / Bộ Phận</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#EAF4FF] dark:bg-blue-950 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/20 dark:border-blue-800">
              {assignedStaff.length} người
            </span>
          </h3>
          <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">
            Dữ liệu nhân sự được liên kết trực tiếp với module <strong>Nhân Sự & Đào Tạo</strong>. Mọi thay đổi điều chuyển sẽ cập nhật hồ sơ công tác.
          </p>
        </div>
        {canManage ? (
          <button
            onClick={() => {
              setSelectedStaffIds([]);
              setStaffSearchTerm('');
              setShowAssignModal(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0"
          >
            <UserPlus className="w-4 h-4" /> Gán / Điều Chuyển Nhân Sự Vào Phòng
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-[#718096] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700 text-xs font-semibold shrink-0">
            <Shield className="w-3.5 h-3.5 text-[#718096]" />
            {scopeHint || 'Chỉ xem'}
          </span>
        )}
      </div>

      {/* Staff List Grid */}
      {assignedStaff.length === 0 ? (
        <div className="p-8 text-center bg-[#F4F7FB] dark:bg-slate-800/20 rounded-xl border-2 border-dashed border-[#DFE7F0] dark:border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[#EAF4FF] dark:bg-blue-950/60 text-[#1976D2] flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-[#263445] dark:text-slate-200 text-sm">Chưa có nhân viên nào được phân công tại phòng này</h4>
          <p className="text-xs text-[#718096] dark:text-slate-400 max-w-md mx-auto">
            {canManage
              ? 'Nhấn vào nút "Gán / Điều Chuyển Nhân Sự Vào Phòng" ở trên để bổ sung Bác sĩ, Kỹ thuật viên hoặc Điều dưỡng từ danh sách hồ sơ nhân sự của Khoa.'
              : 'Bạn chỉ có quyền xem danh sách nhân sự tại phòng này.'}
          </p>
          {canManage && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-bold transition-all shadow-xs"
            >
              <UserPlus className="w-4 h-4" /> Chọn nhân viên ngay
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {assignedStaff.map(staff => {
            const isManager = room.managerInCharge === staff.fullName;
            const isDeputy = room.deputyManager === staff.fullName;

            return (
              <div
                key={staff.userId}
                className={`p-3.5 rounded-xl border transition-all relative ${
                  isManager
                    ? 'bg-[#EAF4FF]/60 dark:bg-blue-950/30 border-[#1976D2]/40 dark:border-blue-800'
                    : 'bg-white dark:bg-slate-900 border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2]/30 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1976D2] text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                      {staff.fullName.split(' ').pop()?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-bold text-[#263445] dark:text-white text-sm">
                          {staff.fullName}
                        </h4>
                        {isManager && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Trưởng Phòng
                          </span>
                        )}
                        {isDeputy && !isManager && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF4FF] dark:bg-blue-950 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/20 dark:border-blue-800">
                            KTV Trưởng
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#1976D2] dark:text-blue-400 font-semibold mt-0.5">
                        {staff.title || 'Cán bộ'} • {staff.specialty || 'Chuyên môn Cận lâm sàng'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Contact & Status Details */}
                <div className="mt-3 pt-2.5 border-t border-[#DFE7F0] dark:border-slate-800 grid grid-cols-2 gap-2 text-[11px] text-[#718096] dark:text-slate-400">
                  <div className="flex items-center space-x-1.5 truncate">
                    <Phone className="w-3.5 h-3.5 text-[#718096] shrink-0" />
                    <span className="truncate">{staff.phone || 'Chưa cập nhật'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-[#718096] shrink-0" />
                    <span className="truncate">{staff.email || 'Chưa cập nhật'}</span>
                  </div>
                </div>

                {/* Card Action Controls */}
                {canManage && (
                  <div className="mt-2.5 pt-2.5 border-t border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1">
                      {!isManager && (
                        <button
                          onClick={() => onSetManager(staff.fullName)}
                          title="Chỉ định làm Trưởng phòng phụ trách"
                          className="px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors"
                        >
                          Đặt làm Trưởng phòng
                        </button>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => {
                          setTransferStaffUser(staff);
                          setSelectedTargetRoom('');
                        }}
                        title="Điều chuyển nhân viên này sang phòng khác"
                        className="p-1.5 text-[#718096] dark:text-slate-400 hover:text-[#1976D2] dark:hover:text-blue-400 hover:bg-[#EAF4FF] dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-medium"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Điều chuyển
                      </button>
                      <button
                        onClick={() => setConfirmRemoveStaff(staff)}
                        title="Gỡ khỏi phòng này (về Chưa phân phòng)"
                        className="p-1.5 text-[#718096] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Assign Multiple Staff to Room */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-3.5 border-b border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-[#F4F7FB] dark:bg-slate-800/50">
              <div>
                <h3 className="font-bold text-[#263445] dark:text-white text-base">
                  Gán Nhân Sự Vào Phòng: {room.name}
                </h3>
                <p className="text-xs text-[#718096] dark:text-slate-400">
                  Chọn một hoặc nhiều cán bộ từ danh mục Nhân Sự của Khoa để điều chuyển vào phòng này.
                </p>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1.5 rounded-lg text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-[#DFE7F0] dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo họ tên, chức danh, chuyên môn, phòng hiện tại..."
                  value={staffSearchTerm}
                  onChange={e => setStaffSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-xs text-[#263445] dark:text-white outline-none focus:ring-2 focus:ring-[#1976D2]"
                />
              </div>
            </div>

            <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar flex-1">
              {availableStaff.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#718096]">
                  Không tìm thấy nhân viên phù hợp hoặc tất cả nhân sự đã thuộc phòng này.
                </div>
              ) : (
                availableStaff.map(staff => {
                  const isSelected = selectedStaffIds.includes(staff.userId);
                  return (
                    <div
                      key={staff.userId}
                      onClick={() => toggleStaffSelection(staff.userId)}
                      className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#EAF4FF] dark:bg-blue-950/40 border-[#1976D2]'
                          : 'bg-white dark:bg-slate-900 border-[#DFE7F0] dark:border-slate-800 hover:border-[#1976D2]/40 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // handled by parent div click
                          className="w-4 h-4 text-[#1976D2] rounded border-[#DFE7F0] focus:ring-[#1976D2]"
                        />
                        <div className="truncate">
                          <h5 className="font-bold text-[#263445] dark:text-white text-xs truncate">
                            {staff.fullName}
                          </h5>
                          <p className="text-[11px] text-[#718096] dark:text-slate-400 truncate">
                            {staff.title || 'Cán bộ'} • {staff.specialty}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F7FB] dark:bg-slate-800 text-[#718096] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700">
                          {staff.room ? `Hiện tại: ${staff.room}` : 'Chưa phân phòng'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-[#F4F7FB] dark:bg-slate-800/50">
              <span className="text-xs text-[#718096] dark:text-slate-400 font-medium">
                Đã chọn: <strong className="text-[#1976D2] dark:text-blue-400">{selectedStaffIds.length}</strong> nhân sự
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-3.5 py-1.5 text-xs text-[#718096] dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-medium"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={selectedStaffIds.length === 0}
                  onClick={handleBulkAssign}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#1976D2] hover:bg-[#155A9C] disabled:opacity-50 rounded-lg transition-all shadow-xs"
                >
                  Gán Vào Phòng Này ({selectedStaffIds.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Transfer Staff to Another Room */}
      {transferStaffUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-[#F4F7FB] dark:bg-slate-800/50">
              <h3 className="font-bold text-[#263445] dark:text-white text-sm flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#1976D2]" />
                Điều Chuyển Phòng Công Tác
              </h3>
              <button
                onClick={() => setTransferStaffUser(null)}
                className="p-1 rounded-lg text-[#718096] hover:text-[#263445]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-[#718096] dark:text-slate-400">Nhân sự điều chuyển:</p>
                <h4 className="font-bold text-[#263445] dark:text-white text-sm mt-0.5">
                  {transferStaffUser.fullName} ({transferStaffUser.title || 'Cán bộ'})
                </h4>
                <p className="text-[11px] text-[#718096]">Phòng hiện tại: {room.name}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                  Chọn Phòng / Bộ Phận Đích <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedTargetRoom}
                  onChange={e => setSelectedTargetRoom(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none"
                >
                  <option value="">-- Chọn phòng tiếp nhận --</option>
                  {allRooms.filter(r => r.name !== room.name).map(r => (
                    <option key={r.id} value={r.name}>
                      {r.name} ({r.code} - {r.departmentSection})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-[#DFE7F0] dark:border-slate-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setTransferStaffUser(null)}
                  className="px-3.5 py-1.5 text-xs text-[#718096] dark:text-slate-300 hover:bg-[#F4F7FB] border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!selectedTargetRoom}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#1976D2] hover:bg-[#155A9C] disabled:opacity-50 rounded-lg transition-all"
                >
                  Xác Nhận Điều Chuyển
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Confirm Remove Staff From Room */}
      {confirmRemoveStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-bold text-[#263445] dark:text-white text-sm">
              Xác nhận gỡ nhân sự khỏi phòng
            </h3>
            <p className="text-xs text-[#718096] dark:text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn gỡ nhân viên <strong className="text-[#263445] dark:text-white">"{confirmRemoveStaff.fullName}"</strong> khỏi phòng <strong className="text-[#263445] dark:text-white">"{room.name}"</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveStaff(null)}
                className="px-3.5 py-1.5 text-xs text-[#718096] dark:text-slate-300 hover:bg-[#F4F7FB] dark:hover:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-medium"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemoveStaff(confirmRemoveStaff.userId);
                  setConfirmRemoveStaff(null);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Xác nhận gỡ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
