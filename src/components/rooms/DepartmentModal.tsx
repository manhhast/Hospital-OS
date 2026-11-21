import React, { useState, useEffect, useMemo } from 'react';
import { Layers, X, AlertTriangle } from 'lucide-react';
import { DepartmentUnit, StaffProfile } from '../../types/hospital';
import { filterActiveStaffDisplayName, filterActiveStaffProfiles, getInactiveStaffMatchers } from '../../utils/staffStatus';

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dept: DepartmentUnit, isEdit: boolean) => void;
  initialDepartment?: DepartmentUnit | null;
  existingDepartments: DepartmentUnit[];
  staffList: StaffProfile[];
}

export const DepartmentModal: React.FC<DepartmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialDepartment,
  existingDepartments,
  staffList
}) => {
  const isEdit = !!initialDepartment;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [managerName, setManagerName] = useState('');
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
    if (initialDepartment) {
      setCode(initialDepartment.code || '');
      setName(initialDepartment.name || '');
      setManagerName(
        filterActiveStaffDisplayName(initialDepartment.managerName, inactiveStaffMatchers.names)
      );
      setDescription(initialDepartment.description || '');
    } else {
      const nextNum = existingDepartments.length + 1;
      setCode(`BP-${String(nextNum).padStart(2, '0')}`);
      setName('');
      setManagerName('');
      setDescription('');
    }
  }, [initialDepartment, existingDepartments.length, isOpen, inactiveStaffMatchers]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim();

    if (!trimmedName || !trimmedCode) {
      setErrorMsg('Vui lòng nhập đầy đủ Mã bộ phận và Tên bộ phận.');
      return;
    }

    const isDuplicateName = existingDepartments.some(
      d => d.id !== initialDepartment?.id && d.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicateName) {
      setErrorMsg(`Bộ phận "${trimmedName}" đã tồn tại. Vui lòng chọn tên khác.`);
      return;
    }

    onSave(
      {
        id: initialDepartment?.id || `DEPT-${Date.now()}`,
        code: trimmedCode,
        name: trimmedName,
        managerName: managerName.trim() || undefined,
        description: description.trim() || undefined,
        createdAt: initialDepartment?.createdAt || new Date().toISOString().split('T')[0]
      },
      isEdit
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-[#DFE7F0] dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-[#F4F7FB] dark:bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[#EAF4FF] dark:bg-blue-950 text-[#1976D2] dark:text-blue-400 border border-[#1976D2]/20 dark:border-blue-800">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#263445] dark:text-white">
                  {isEdit ? 'Đổi Tên / Sửa Bộ Phận' : 'Thêm Bộ Phận Mới'}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-[#EAF4FF] dark:bg-blue-950 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/25 dark:border-blue-800">
                  Cấp 1
                </span>
              </div>
              <p className="text-xs text-[#718096] dark:text-slate-400">
                {isEdit
                  ? 'Đổi tên bộ phận sẽ tự động cập nhật cho tất cả Phòng (Cấp 2) & Nhân sự trực thuộc'
                  : 'Tạo Bộ phận chuyên môn (Cấp 1) làm đơn vị cha để quản lý các Phòng trực thuộc (Cấp 2)'}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {isEdit && initialDepartment && initialDepartment.name !== name.trim() && name.trim() !== '' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg flex items-start space-x-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>Lưu ý đồng bộ:</strong> Đổi tên bộ phận từ <em>"{initialDepartment.name}"</em> sang <em>"{name.trim()}"</em> sẽ tự động cập nhật cho toàn bộ phòng (Cấp 2) và hồ sơ nhân sự thuộc bộ phận này.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Mã Bộ Phận <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="VD: BP-CDHA"
                className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
                Tên Bộ Phận (Cấp 1) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="VD: Chẩn đoán hình ảnh, Sinh hóa - Huyết học..."
                className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
              Phụ Trách Bộ Phận
            </label>
            <select
              value={managerName}
              onChange={e => setManagerName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none"
            >
              <option value="">-- Chọn người phụ trách bộ phận (tùy chọn) --</option>
              {activeStaffList.map(s => (
                <option key={s.userId} value={s.fullName}>
                  {s.fullName} ({s.title || 'Nhân viên'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#263445] dark:text-slate-300 mb-1">
              Mô Tả Chức Năng Bộ Phận
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Mô tả chức năng chuyên môn của bộ phận..."
              className="w-full px-3 py-2 text-sm bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-white focus:ring-2 focus:ring-[#1976D2] outline-none resize-none"
            />
          </div>

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
              {isEdit ? 'Lưu Thay Đổi' : 'Tạo Bộ Phận Mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
