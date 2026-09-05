import React, { useState, useEffect } from 'react';
import { Building2, X, AlertTriangle, Layers, UserCheck, ShieldCheck } from 'lucide-react';
import { ParaclinicalRoom, StaffProfile } from '../../types/hospital';

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (roomData: Partial<ParaclinicalRoom>, isEdit: boolean) => void;
  initialRoom?: ParaclinicalRoom | null;
  staffList: StaffProfile[];
}

export const RoomModal: React.FC<RoomModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialRoom,
  staffList
}) => {
  const isEdit = !!initialRoom;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [departmentSection, setDepartmentSection] = useState('Chẩn đoán hình ảnh');
  const [floor, setFloor] = useState('Tầng 1 - Khu Cận Lâm Sàng');
  const [managerInCharge, setManagerInCharge] = useState('');
  const [deputyManager, setDeputyManager] = useState('');
  const [primaryEquipment, setPrimaryEquipment] = useState('');
  const [phoneExtension, setPhoneExtension] = useState('');
  const [maxCapacityCasesPerDay, setMaxCapacityCasesPerDay] = useState(40);
  const [status, setStatus] = useState<'Đang hoạt động' | 'Bảo trì' | 'Quá tải' | 'Tạm nghỉ' | 'Tạm ngưng'>('Đang hoạt động');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (initialRoom) {
      setCode(initialRoom.code || '');
      setName(initialRoom.name || '');
      setDepartmentSection(initialRoom.departmentSection || 'Chẩn đoán hình ảnh');
      setFloor(initialRoom.floor || 'Tầng 1 - Khu Cận Lâm Sàng');
      setManagerInCharge(initialRoom.managerInCharge || (staffList[0]?.fullName || ''));
      setDeputyManager(initialRoom.deputyManager || '');
      setPrimaryEquipment(initialRoom.primaryEquipment || '');
      setPhoneExtension(initialRoom.phoneExtension || '');
      setMaxCapacityCasesPerDay(initialRoom.maxCapacityCasesPerDay || 40);
      setStatus(initialRoom.status || 'Đang hoạt động');
      setDescription(initialRoom.description || '');
    } else {
      setCode(`P-${Math.floor(100 + Math.random() * 900)}-CLS`);
      setName('');
      setDepartmentSection('Chẩn đoán hình ảnh');
      setFloor('Tầng 1 - Khu Cận Lâm Sàng');
      setManagerInCharge(staffList[0]?.fullName || '');
      setDeputyManager('');
      setPrimaryEquipment('');
      setPhoneExtension('');
      setMaxCapacityCasesPerDay(40);
      setStatus('Đang hoạt động');
      setDescription('');
    }
  }, [initialRoom, staffList, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      alert('Vui lòng nhập đầy đủ Mã phòng và Tên phòng/bộ phận');
      return;
    }

    onSave({
      id: initialRoom?.id || `RM-${Date.now()}`,
      code: code.trim(),
      name: name.trim(),
      departmentSection,
      floor,
      managerInCharge: managerInCharge || staffList[0]?.fullName || 'Chưa chỉ định',
      deputyManager: deputyManager.trim() || undefined,
      primaryEquipment: primaryEquipment.trim() || 'Chưa gán máy chính',
      phoneExtension: phoneExtension.trim() || undefined,
      maxCapacityCasesPerDay: Number(maxCapacityCasesPerDay) || 40,
      currentDayCases: initialRoom?.currentDayCases || 0,
      utilizationRate: initialRoom?.utilizationRate || 0,
      status,
      description: description.trim() || undefined
    }, isEdit);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {isEdit ? 'Chỉnh Sửa / Đổi Tên Phòng - Bộ Phận' : 'Thêm Phòng / Bộ Phận Trực Thuộc Mới'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEdit ? 'Hệ thống sẽ tự động đồng bộ tên phòng mới đến nhân sự và thiết bị liên quan' : 'Tạo mới đơn vị phòng máy hoặc bộ phận chuyên môn trực thuộc Khoa CLS'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {isEdit && initialRoom && initialRoom.name !== name && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-start space-x-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>Lưu ý đồng bộ:</strong> Đổi tên phòng từ <em>"{initialRoom.name}"</em> sang <em>"{name}"</em> sẽ tự động cập nhật lại vị trí công tác cho toàn bộ nhân sự và vị trí đặt máy móc thuộc phòng này!
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Room Code */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mã Phòng / Bộ Phận <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="VD: P-101-CT, P-LAB-01..."
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Department Section Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Phân Loại Bộ Phận <span className="text-rose-500">*</span>
              </label>
              <select
                value={departmentSection}
                onChange={e => setDepartmentSection(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="Chẩn đoán hình ảnh">Chẩn đoán hình ảnh (CT/MRI/X-quang)</option>
                <option value="Xét nghiệm">Xét nghiệm (Sinh hóa/Huyết học/Vi sinh)</option>
                <option value="Thăm dò chức năng">Thăm dò chức năng (Siêu âm/Nội soi/Điện tim)</option>
                <option value="Hành chính Khoa">Hành chính & Quản trị Khoa</option>
                <option value="Khác">Khác / Tiệt trùng & Hậu cần</option>
              </select>
            </div>
          </div>

          {/* Full Room Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Tên Đầy Đủ Phòng / Bộ Phận <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Phòng Chụp Cắt Lớp Vi Tính Somatom Go.Top 128 Dải"
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Floor / Location */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Vị Trí Tòa Nhà & Tầng
              </label>
              <input
                type="text"
                value={floor}
                onChange={e => setFloor(e.target.value)}
                placeholder="VD: Tầng 1 - Khu Cận Lâm Sàng"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Trạng Thái Hoạt Động
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
            {/* Manager In Charge */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Trưởng Phòng / Bác Sĩ Phụ Trách
              </label>
              <select
                value={managerInCharge}
                onChange={e => setManagerInCharge(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">-- Chọn bác sĩ / người phụ trách --</option>
                {staffList.map(s => (
                  <option key={s.userId} value={s.fullName}>
                    {s.fullName} ({s.title || 'Nhân viên'})
                  </option>
                ))}
              </select>
            </div>

            {/* Deputy / Lead Tech */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Kỹ Thuật Viên Trưởng / Phó Phụ Trách
              </label>
              <input
                type="text"
                value={deputyManager}
                onChange={e => setDeputyManager(e.target.value)}
                placeholder="VD: KTV. Vũ Văn Hải"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Equipment */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tên Hệ Thống / Máy Móc Chính
              </label>
              <input
                type="text"
                value={primaryEquipment}
                onChange={e => setPrimaryEquipment(e.target.value)}
                placeholder="VD: Somatom Go.Top 128 Dải"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Max Daily Capacity */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Công Suất Thiết Kế Tối Đa (Ca/Ngày)
              </label>
              <input
                type="number"
                min={1}
                max={2000}
                value={maxCapacityCasesPerDay}
                onChange={e => setMaxCapacityCasesPerDay(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Description & Specialties */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Mô Tả Chức Năng, Phạm Vi Chuyên Môn & Ghi Chú
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ghi chú quy trình kỹ thuật, tiếp nhận bệnh nhân, nội quy sử dụng phòng..."
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-xl transition-all shadow-md shadow-blue-600/20"
            >
              {isEdit ? 'Lưu Thay Đổi' : 'Tạo Phòng Mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
