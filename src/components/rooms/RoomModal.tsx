import React, { useState, useEffect, useMemo } from 'react';
import { Building2, X, AlertTriangle } from 'lucide-react';
import { DepartmentUnit, EquipmentItem, ParaclinicalRoom, StaffProfile } from '../../types/hospital';
import { SearchableCombobox, ComboboxOption } from '../common/SearchableCombobox';
import { filterActiveStaffDisplayName, filterActiveStaffProfiles, getInactiveStaffMatchers } from '../../utils/staffStatus';

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (roomData: Partial<ParaclinicalRoom>, isEdit: boolean) => void;
  initialRoom?: ParaclinicalRoom | null;
  departments: DepartmentUnit[];
  defaultDepartmentSection?: string;
  staffList: StaffProfile[];
  equipmentList?: EquipmentItem[];
}

const normalizeNullablePlaceholder = (val?: string): string => {
  const trimmed = (val || '').trim();
  if (!trimmed || trimmed === 'Chưa chỉ định' || trimmed === 'Chưa gán máy chính') {
    return '';
  }
  return trimmed;
};

export const RoomModal: React.FC<RoomModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialRoom,
  departments,
  defaultDepartmentSection,
  staffList,
  equipmentList = []
}) => {
  const isEdit = !!initialRoom;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [departmentSection, setDepartmentSection] = useState('');
  const [floor, setFloor] = useState('Tầng 1 - Khu Cận Lâm Sàng');
  const [managerInCharge, setManagerInCharge] = useState('');
  const [deputyManager, setDeputyManager] = useState('');
  const [primaryEquipment, setPrimaryEquipment] = useState('');
  const [phoneExtension, setPhoneExtension] = useState('');
  const [maxCapacityCasesPerDay, setMaxCapacityCasesPerDay] = useState(40);
  const [status, setStatus] = useState<'Đang hoạt động' | 'Bảo trì' | 'Quá tải' | 'Tạm nghỉ' | 'Tạm ngưng'>('Đang hoạt động');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const activeStaffList = useMemo(
    () => filterActiveStaffProfiles(staffList),
    [staffList]
  );
  const inactiveStaffMatchers = useMemo(
    () => getInactiveStaffMatchers(staffList),
    [staffList]
  );

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    const fallbackDept = defaultDepartmentSection || departments[0]?.name || 'Chưa phân bộ phận';
    if (initialRoom) {
      setCode(initialRoom.code || '');
      setName(initialRoom.name || '');
      setDepartmentSection(initialRoom.departmentSection || fallbackDept);
      setFloor(initialRoom.floor || 'Tầng 1 - Khu Cận Lâm Sàng');
      setManagerInCharge(
        filterActiveStaffDisplayName(
          normalizeNullablePlaceholder(initialRoom.managerInCharge),
          inactiveStaffMatchers.names
        )
      );
      setDeputyManager(
        filterActiveStaffDisplayName(
          normalizeNullablePlaceholder(initialRoom.deputyManager),
          inactiveStaffMatchers.names
        )
      );
      setPrimaryEquipment(normalizeNullablePlaceholder(initialRoom.primaryEquipment));
      setPhoneExtension(initialRoom.phoneExtension || '');
      setMaxCapacityCasesPerDay(initialRoom.maxCapacityCasesPerDay || 40);
      setStatus(initialRoom.status || 'Đang hoạt động');
      setDescription(initialRoom.description || '');
    } else {
      setCode(`P-${Math.floor(100 + Math.random() * 900)}-CLS`);
      setName('');
      setDepartmentSection(fallbackDept);
      setFloor('Tầng 1 - Khu Cận Lâm Sàng');
      setManagerInCharge('');
      setDeputyManager('');
      setPrimaryEquipment('');
      setPhoneExtension('');
      setMaxCapacityCasesPerDay(40);
      setStatus('Đang hoạt động');
      setDescription('');
    }
  }, [initialRoom, departments, defaultDepartmentSection, isOpen, inactiveStaffMatchers]);

  const staffOptions: ComboboxOption[] = useMemo(
    () =>
      activeStaffList.map(s => ({
        value: s.fullName,
        label: s.fullName,
        badge: s.title || 'Nhân viên',
        subLabel: [s.departmentSection, s.room].filter(Boolean).join(' • ')
      })),
    [activeStaffList]
  );

  const equipmentOptions: ComboboxOption[] = useMemo(
    () =>
      equipmentList.map(eq => ({
        value: eq.name,
        label: eq.name,
        badge: eq.code || eq.category,
        subLabel: [eq.model, eq.room, eq.status].filter(Boolean).join(' • ')
      })),
    [equipmentList]
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ Mã phòng và Tên phòng.');
      return;
    }

    onSave({
      id: initialRoom?.id || `RM-${Date.now()}`,
      code: code.trim(),
      name: name.trim(),
      departmentSection: departmentSection || departments[0]?.name || 'Chưa phân bộ phận',
      floor,
      managerInCharge: managerInCharge.trim(),
      deputyManager: deputyManager.trim() || '',
      primaryEquipment: primaryEquipment.trim(),
      phoneExtension: phoneExtension.trim() || '',
      maxCapacityCasesPerDay: Number(maxCapacityCasesPerDay) || 40,
      currentDayCases: initialRoom?.currentDayCases || 0,
      utilizationRate: initialRoom?.utilizationRate || 0,
      status,
      description: description.trim() || ''
    }, isEdit);
    onClose();
  };

  const deptNames = departments.map(d => d.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-[#F4F7FB] dark:bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[#EAF4FF] dark:bg-blue-950 text-[#1976D2] dark:text-blue-400 border border-[#1976D2]/20 dark:border-blue-800">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#263445] dark:text-white">
                  {isEdit ? 'Chỉnh Sửa / Đổi Tên Phòng' : 'Thêm Phòng Trực Thuộc Mới'}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-[#EAF4FF] dark:bg-blue-950 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/25 dark:border-blue-800">
                  Cấp 2
                </span>
              </div>
              <p className="text-xs text-[#718096] dark:text-slate-400">
                {isEdit ? 'Hệ thống sẽ tự động đồng bộ tên phòng mới đến nhân sự và thiết bị liên quan' : 'Tạo mới đơn vị Phòng (Cấp 2) trực thuộc một Bộ phận (Cấp 1)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {isEdit && initialRoom && initialRoom.name !== name && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg flex items-start space-x-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>Lưu ý đồng bộ:</strong> Đổi tên phòng từ <em>"{initialRoom.name}"</em> sang <em>"{name}"</em> sẽ tự động cập nhật lại vị trí công tác cho toàn bộ nhân sự và vị trí đặt máy móc thuộc phòng này!
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Room Code */}
            <div>
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Mã Phòng <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="VD: P-101-CT, P-LAB-01..."
                className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none"
              />
            </div>

            {/* Parent Department Section (Level 1) */}
            <div>
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Thuộc Bộ Phận (Cấp 1) <span className="text-rose-500">*</span>
              </label>
              <select
                value={departmentSection}
                onChange={e => setDepartmentSection(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none"
              >
                {departmentSection && !deptNames.includes(departmentSection) && (
                  <option value={departmentSection}>{departmentSection}</option>
                )}
                {departments.map(dept => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
                {departments.length === 0 && (
                  <option value="Chưa phân bộ phận">Chưa phân bộ phận</option>
                )}
              </select>
            </div>
          </div>

          {/* Full Room Name */}
          <div>
            <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
              Tên Đầy Đủ Phòng (Cấp 2) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Phòng Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải"
              className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Floor / Location */}
            <div>
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Vị Trí Tòa Nhà & Tầng
              </label>
              <input
                type="text"
                value={floor}
                onChange={e => setFloor(e.target.value)}
                placeholder="VD: Tầng 1 - Khu Cận Lâm Sàng"
                className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Trạng Thái Hoạt Động
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none"
              >
                <option value="Đang hoạt động">🟢 Đang hoạt động</option>
                <option value="Bảo trì">🟠 Bảo trì / Hiệu chuẩn</option>
                <option value="Quá tải">🔴 Quá tải công suất</option>
                <option value="Tạm nghỉ">⚪ Tạm nghỉ / Vệ sinh</option>
                <option value="Tạm ngưng">⚫ Tạm ngưng hoạt động</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Manager In Charge - Searchable Combobox & Nullable */}
            <div>
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Trưởng Phòng / Bác Sĩ Phụ Trách
              </label>
              <SearchableCombobox
                value={managerInCharge}
                onChange={setManagerInCharge}
                options={staffOptions}
                placeholder="Gõ tên để tìm nhanh hoặc bỏ trống..."
                emptyOptionLabel="-- Bỏ trống (Chưa chỉ định) --"
                noResultsLabel="Không tìm thấy nhân viên phù hợp"
              />
            </div>

            {/* Deputy / Lead Tech - Searchable Combobox & Nullable */}
            <div>
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Kỹ Thuật Viên Trưởng / Phó Phụ Trách
              </label>
              <SearchableCombobox
                value={deputyManager}
                onChange={setDeputyManager}
                options={staffOptions}
                placeholder="Gõ tên nhân viên để tìm nhanh hoặc bỏ trống..."
                emptyOptionLabel="-- Bỏ trống (Không chỉ định) --"
                noResultsLabel="Không tìm thấy nhân viên phù hợp"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Equipment - Searchable Combobox from Equipment Catalog & Nullable */}
            <div>
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Tên Hệ Thống / Máy Móc Chính
              </label>
              <SearchableCombobox
                value={primaryEquipment}
                onChange={setPrimaryEquipment}
                options={equipmentOptions}
                placeholder="Gõ tên hoặc mã máy để tìm nhanh..."
                emptyOptionLabel="-- Bỏ trống (Chưa gán máy chính) --"
                noResultsLabel="Không tìm thấy máy móc trong danh mục"
              />
            </div>

            {/* Max Daily Capacity */}
            <div>
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Công Suất Thiết Kế Tối Đa (Ca/Ngày)
              </label>
              <input
                type="number"
                min={1}
                max={2000}
                value={maxCapacityCasesPerDay}
                onChange={e => setMaxCapacityCasesPerDay(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none"
              />
            </div>
          </div>

          {/* Description & Specialties */}
          <div>
            <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
              Mô Tả Chức Năng, Phạm Vi Chuyên Môn & Ghi Chú
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ghi chú quy trình kỹ thuật, tiếp nhận bệnh nhân, nội quy sử dụng phòng..."
              className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#DFE7F0] dark:border-slate-800 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#718096] dark:text-slate-300 hover:bg-[#F4F7FB] dark:hover:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-[#1976D2] hover:bg-[#155A9C] rounded-lg transition-all shadow-xs"
            >
              {isEdit ? 'Lưu Thay Đổi' : 'Tạo Phòng Mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
