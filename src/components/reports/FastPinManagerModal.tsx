import React, { useState } from 'react';
import { 
  X, Pin, Search, Check, Sparkles, RefreshCw, Trash2, Layers, Filter, CheckCircle2, BookmarkCheck
} from 'lucide-react';
import { FAST_PIN_PRESETS, DEFAULT_PINNED_SERVICE_NAMES } from '../../utils/clinicalAnalytics';
import { CaseReportItem } from '../../types/caseReport';

interface FastPinManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  allServices: CaseReportItem[];
  pinnedNames: string[];
  onSavePinnedNames: (names: string[]) => void;
}

export const FastPinManagerModal: React.FC<FastPinManagerModalProps> = ({
  isOpen,
  onClose,
  allServices,
  pinnedNames,
  onSavePinnedNames
}) => {
  if (!isOpen) return null;

  const [selectedNames, setSelectedNames] = useState<string[]>(pinnedNames);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');

  // Extract unique categories
  const categories = ['Tất cả', ...Array.from(new Set(allServices.map(s => s.category))).filter(Boolean)];

  // Filtered services list
  const filteredServices = allServices.filter(item => {
    if (!item.name) return false;
    const matchesCat = selectedCategory === 'Tất cả' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const togglePin = (name: string) => {
    if (selectedNames.includes(name)) {
      setSelectedNames(prev => prev.filter(n => n !== name));
    } else {
      setSelectedNames(prev => [...prev, name]);
    }
  };

  const applyPreset = (presetServices: string[]) => {
    setSelectedNames(presetServices);
  };

  const handleSave = () => {
    onSavePinnedNames(selectedNames);
    onClose();
  };

  const handleResetDefault = () => {
    setSelectedNames(DEFAULT_PINNED_SERVICE_NAMES);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 dark:from-indigo-900 dark:via-indigo-950 dark:to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
              <Pin className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-wide">
                QUẢN LÝ DANH MỤC CHỈ SỐ GHIM (FAST PINNING)
              </h3>
              <p className="text-xs text-indigo-200 font-medium">
                Ghim 10-15 kỹ thuật trọng điểm lên đầu bảng báo cáo để theo dõi tức thời
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-slate-800 dark:text-slate-100 flex-1">
          
          {/* Preset Packages */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Gói Chỉ Số Thiết Lập Sẵn (1-Click Presets):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FAST_PIN_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.services)}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {preset.title}
                    </h5>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                      {preset.services.length} mục
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Current Pinned Counter & Quick Clear */}
          <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-2xl border border-indigo-200 dark:border-indigo-800">
            <div className="flex items-center gap-2">
              <BookmarkCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <span className="text-xs font-black text-indigo-950 dark:text-indigo-200">
                  Đã chọn {selectedNames.length} chỉ số trọng điểm
                </span>
                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 block">
                  (Khuyến nghị ghim 8-15 chỉ số mũi nhọn của khoa để hiển thị tối ưu)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetDefault}
                className="px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Mặc định
              </button>
              <button
                onClick={() => setSelectedNames([])}
                className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Bỏ chọn hết
              </button>
            </div>
          </div>

          {/* Search and Category Filter */}
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm kỹ thuật / dịch vụ..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              {categories.slice(0, 5).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Services Checklist */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredServices.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Không tìm thấy kỹ thuật nào khớp với từ khóa tìm kiếm.
              </div>
            ) : (
              filteredServices.map(item => {
                const isPinned = selectedNames.includes(item.name);
                return (
                  <div
                    key={item.id || item.name}
                    onClick={() => togglePin(item.name)}
                    className={`p-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${
                      isPinned ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                        isPinned 
                          ? 'bg-indigo-600 border-indigo-600 text-white' 
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}>
                        {isPinned && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>

                      <div>
                        <h6 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {item.name}
                        </h6>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                        isPinned 
                          ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                      <span>{isPinned ? 'Đã ghim' : 'Ghim'}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Hủy Bỏ
          </button>

          <button
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Lưu Danh Sách Ghim ({selectedNames.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
