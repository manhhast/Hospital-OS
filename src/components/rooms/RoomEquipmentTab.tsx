import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wrench, Plus, ArrowRightLeft, ShieldAlert, CheckCircle2, AlertCircle, 
  Search, X, Calendar, Activity, Cpu, Layers, HardDrive, Eye
} from 'lucide-react';
import { ParaclinicalRoom, EquipmentItem, StaffProfile } from '../../types/hospital';
import { storageService } from '../../services/storageService';
import { EquipmentDetailModal } from '../equipment/EquipmentDetailModal';
import { filterActiveStaffDisplayName, getInactiveStaffMatchers } from '../../utils/staffStatus';

interface RoomEquipmentTabProps {
  room: ParaclinicalRoom;
  allEquipment: EquipmentItem[];
  allRooms: ParaclinicalRoom[];
  canManage?: boolean;
  scopeHint?: string;
  onAssignEquipment: (equipmentId: string, targetRoomName: string) => void;
  onRemoveEquipment: (equipmentId: string) => void;
}

export const RoomEquipmentTab: React.FC<RoomEquipmentTabProps> = ({
  room,
  allEquipment,
  allRooms,
  canManage = false,
  scopeHint,
  onAssignEquipment,
  onRemoveEquipment
}) => {
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [transferItem, setTransferItem] = useState<EquipmentItem | null>(null);
  const [confirmRemoveEq, setConfirmRemoveEq] = useState<EquipmentItem | null>(null);
  const [selectedTargetRoom, setSelectedTargetRoom] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [detailEquipment, setDetailEquipment] = useState<EquipmentItem | null>(null);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>(() => storageService.getStaffProfiles());

  useEffect(() => {
    return storageService.subscribe(() => {
      setStaffProfiles(storageService.getStaffProfiles());
    });
  }, []);

  const inactiveStaff = useMemo(
    () => getInactiveStaffMatchers(staffProfiles),
    [staffProfiles]
  );

  // Equipment located in this room (exact match or includes room name)
  const roomEquipment = allEquipment.filter(e => 
    e.room === room.name || e.room.toLowerCase().includes(room.code.toLowerCase())
  );

  // Equipment available to assign (located in other rooms or warehouse)
  const availableEquipment = allEquipment.filter(e => 
    e.room !== room.name && !e.room.toLowerCase().includes(room.code.toLowerCase())
  ).filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBulkAssign = () => {
    if (selectedEquipmentIds.length === 0) return;
    selectedEquipmentIds.forEach(id => {
      onAssignEquipment(id, room.name);
    });
    setSelectedEquipmentIds([]);
    setShowAssignModal(false);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferItem || !selectedTargetRoom) return;
    onAssignEquipment(transferItem.id, selectedTargetRoom);
    setTransferItem(null);
    setSelectedTargetRoom('');
  };

  const toggleSelection = (id: string) => {
    setSelectedEquipmentIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Hoạt động tốt':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Hoạt động tốt
          </span>
        );
      case 'Cần bảo trì':
      case 'Đang hiệu chuẩn':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-3 h-3 text-amber-500" /> {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300">
            <ShieldAlert className="w-3 h-3 text-rose-500" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F4F7FB] dark:bg-slate-800/40 p-4 rounded-xl border border-[#DFE7F0] dark:border-slate-800">
        <div>
          <h3 className="font-bold text-[#263445] dark:text-white text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[#1976D2] dark:text-blue-400" />
            <span>Thiết Bị & Máy Móc Trực Thuộc Phòng</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#EAF4FF] dark:bg-blue-950 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/20 dark:border-blue-800">
              {roomEquipment.length} hệ thống
            </span>
          </h3>
          <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">
            Dữ liệu máy móc đồng bộ trực tiếp với module <strong>Quản Lý Máy Móc</strong>. Điều chuyển máy sẽ tự động cập nhật vị trí và nhật ký vận hành.
          </p>
        </div>
        {canManage ? (
          <button
            onClick={() => {
              setSelectedEquipmentIds([]);
              setSearchTerm('');
              setShowAssignModal(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" /> Gán / Chuyển Máy Móc Vào Phòng Này
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-[#718096] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700 text-xs font-semibold shrink-0">
            <ShieldAlert className="w-3.5 h-3.5 text-[#718096]" />
            {scopeHint || 'Chỉ xem'}
          </span>
        )}
      </div>

      {/* Equipment List Grid */}
      {roomEquipment.length === 0 ? (
        <div className="p-8 text-center bg-[#F4F7FB] dark:bg-slate-800/20 rounded-xl border-2 border-dashed border-[#DFE7F0] dark:border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[#EAF4FF] dark:bg-blue-950/60 text-[#1976D2] flex items-center justify-center mx-auto">
            <HardDrive className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-[#263445] dark:text-slate-200 text-sm">Chưa có thiết bị nào được bố trí tại phòng này</h4>
          <p className="text-xs text-[#718096] dark:text-slate-400 max-w-md mx-auto">
            {canManage
              ? 'Nhấn vào nút "Gán / Chuyển Máy Móc Vào Phòng Này" để phân bổ máy CT, MRI, X-quang, máy xét nghiệm hoặc máy siêu âm từ danh mục thiết bị toàn khoa.'
              : 'Bạn chỉ có quyền xem danh sách thiết bị tại phòng này.'}
          </p>
          {canManage && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-bold transition-all shadow-xs"
            >
              <Plus className="w-4 h-4" /> Phân bổ thiết bị ngay
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {roomEquipment.map(eq => (
            <div
              key={eq.id}
              className="p-3.5 bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl hover:border-[#1976D2]/30 dark:hover:border-slate-700 transition-all shadow-xs"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-[#EAF4FF] dark:bg-blue-950 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/20 dark:border-blue-800 rounded uppercase tracking-wider">
                      {eq.code}
                    </span>
                    <button
                      onClick={() => setDetailEquipment(eq)}
                      className="font-bold text-[#263445] dark:text-white hover:text-[#1976D2] dark:hover:text-blue-400 text-sm text-left transition-colors hover:underline"
                      title="Nhấn để xem lý lịch máy, người quản lý, hạn kiểm định & nhật ký"
                    >
                      {eq.name}
                    </button>
                    {getStatusBadge(eq.status)}
                  </div>
                  <p className="text-xs text-[#718096] dark:text-slate-400 font-medium">
                    Model: <strong className="text-[#263445] dark:text-slate-300">{eq.model}</strong> • Hãng: {eq.manufacturer} • SN: {eq.serialNumber}
                  </p>
                  {eq.specifications && (
                    <p className="text-[11px] text-[#718096] dark:text-slate-400 line-clamp-1 italic">
                      {eq.specifications}
                    </p>
                  )}
                </div>

                {/* Right Metadata & Action Buttons */}
                <div className="flex items-center space-x-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#DFE7F0] dark:border-slate-800">
                  <div className="text-right hidden lg:block mr-2">
                    <p className="text-[11px] text-[#718096]">Người Quản Lý / KTV:</p>
                    <p className="text-xs font-bold text-[#263445] dark:text-slate-200">
                      {filterActiveStaffDisplayName(eq.managerInCharge, inactiveStaff.names) ||
                        filterActiveStaffDisplayName(eq.assignedTechnician, inactiveStaff.names) ||
                        'Chưa gán'}
                    </p>
                  </div>

                  <button
                    onClick={() => setDetailEquipment(eq)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#EAF4FF] dark:bg-blue-950/70 hover:bg-[#1976D2]/15 dark:hover:bg-blue-900/60 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/20 dark:border-blue-800 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> Hồ sơ
                  </button>

                  {canManage && (
                    <>
                      <button
                        onClick={() => {
                          setTransferItem(eq);
                          setSelectedTargetRoom('');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#F4F7FB] dark:bg-slate-800 hover:bg-[#EAF4FF] dark:hover:bg-slate-700 text-[#263445] dark:text-slate-200 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Điều chuyển
                      </button>

                      <button
                        onClick={() => setConfirmRemoveEq(eq)}
                        title="Chuyển về Kho thiết bị"
                        className="p-1.5 text-[#718096] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL 1: Assign Equipment to Room */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-3.5 border-b border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-[#F4F7FB] dark:bg-slate-800/50">
              <div>
                <h3 className="font-bold text-[#263445] dark:text-white text-base">
                  Gán Thiết Bị Vào Phòng: {room.name}
                </h3>
                <p className="text-xs text-[#718096] dark:text-slate-400">
                  Chọn thiết bị từ kho hoặc các phòng khác để điều chuyển vị trí sang phòng này.
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
                  placeholder="Tìm theo tên máy, mã máy, model, phân loại..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-xs text-[#263445] dark:text-white outline-none focus:ring-2 focus:ring-[#1976D2]"
                />
              </div>
            </div>

            <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar flex-1">
              {availableEquipment.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#718096]">
                  Không tìm thấy thiết bị phù hợp hoặc tất cả máy móc đã thuộc phòng này.
                </div>
              ) : (
                availableEquipment.map(eq => {
                  const isSelected = selectedEquipmentIds.includes(eq.id);
                  return (
                    <div
                      key={eq.id}
                      onClick={() => toggleSelection(eq.id)}
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
                          onChange={() => {}}
                          className="w-4 h-4 text-[#1976D2] rounded border-[#DFE7F0] focus:ring-[#1976D2]"
                        />
                        <div className="truncate">
                          <h5 className="font-bold text-[#263445] dark:text-white text-xs truncate">
                            {eq.name}
                          </h5>
                          <p className="text-[11px] text-[#718096] dark:text-slate-400 truncate">
                            {eq.code} • Model: {eq.model} • Hãng: {eq.manufacturer}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F7FB] dark:bg-slate-800 text-[#718096] dark:text-slate-300 border border-[#DFE7F0] dark:border-slate-700">
                          {eq.room ? `Hiện tại: ${eq.room}` : 'Kho thiết bị'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-[#F4F7FB] dark:bg-slate-800/50">
              <span className="text-xs text-[#718096] dark:text-slate-400 font-medium">
                Đã chọn: <strong className="text-[#1976D2] dark:text-blue-400">{selectedEquipmentIds.length}</strong> thiết bị
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
                  disabled={selectedEquipmentIds.length === 0}
                  onClick={handleBulkAssign}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#1976D2] hover:bg-[#155A9C] disabled:opacity-50 rounded-lg transition-all shadow-xs"
                >
                  Gán Vào Phòng Này ({selectedEquipmentIds.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Transfer Equipment to Another Room */}
      {transferItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-[#F4F7FB] dark:bg-slate-800/50">
              <h3 className="font-bold text-[#263445] dark:text-white text-sm flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#1976D2]" />
                Điều Chuyển Vị Trí Thiết Bị
              </h3>
              <button
                onClick={() => setTransferItem(null)}
                className="p-1 rounded-lg text-[#718096] hover:text-[#263445]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-[#718096] dark:text-slate-400">Thiết bị điều chuyển:</p>
                <h4 className="font-bold text-[#263445] dark:text-white text-sm mt-0.5">
                  {transferItem.name} ({transferItem.code})
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
                  <option value="">-- Chọn phòng tiếp nhận thiết bị --</option>
                  <option value="Kho thiết bị / Chưa phân phòng">📦 Kho thiết bị / Chưa phân phòng</option>
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
                  onClick={() => setTransferItem(null)}
                  className="px-3.5 py-1.5 text-xs text-[#718096] dark:text-slate-300 hover:bg-[#F4F7FB] border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!selectedTargetRoom}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#1976D2] hover:bg-[#155A9C] disabled:opacity-50 rounded-lg transition-all"
                >
                  Xác Nhận Chuyển Phòng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Equipment Dossier / Detail Modal */}
      {detailEquipment && (
        <EquipmentDetailModal
          equipment={detailEquipment}
          onClose={() => setDetailEquipment(null)}
          onUpdate={() => {
            const updated = storageService.getEquipment().find(e => e.id === detailEquipment.id);
            if (updated) setDetailEquipment(updated);
          }}
        />
      )}

      {/* MODAL 3: Confirm Remove Equipment to Warehouse */}
      {confirmRemoveEq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-bold text-[#263445] dark:text-white text-sm">
              Xác nhận chuyển máy về Kho thiết bị
            </h3>
            <p className="text-xs text-[#718096] dark:text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn chuyển thiết bị <strong className="text-[#263445] dark:text-white">"{confirmRemoveEq.name}"</strong> về Kho thiết bị / Chưa phân phòng?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveEq(null)}
                className="px-3.5 py-1.5 text-xs text-[#718096] dark:text-slate-300 hover:bg-[#F4F7FB] dark:hover:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-medium"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemoveEquipment(confirmRemoveEq.id);
                  setConfirmRemoveEq(null);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Xác nhận chuyển
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
