import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, X, FileText, CheckSquare, Wrench, Building2, User, Clock, 
  Users, Sparkles, ArrowRight, ExternalLink, Copy, Check, CornerDownLeft,
  ChevronRight, Command, SlidersHorizontal, Trash2, History, Layers, ShieldCheck
} from 'lucide-react';
import { medicalSearchEngine, SearchResultItem, SearchCategory, removeVietnameseTones } from '../../services/searchService';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (module: string, targetId?: string, extraData?: any) => void;
  initialQuery?: string;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  initialQuery = ''
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cls_recent_searches');
      return saved ? JSON.parse(saved) : ['SOP', 'ISO 15189', 'MRI 3.0 Tesla', 'MSCT 128', 'Kiểm chuẩn'];
    } catch {
      return ['SOP', 'ISO 15189', 'MRI 3.0 Tesla', 'MSCT 128', 'Kiểm chuẩn'];
    }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);

  // Sync initial query when opened
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialQuery]);

  // Execute Search
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return medicalSearchEngine.search(query, activeCategory, 50);
  }, [query, activeCategory]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults, activeCategory]);

  // Save to recent searches
  const saveRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    const updated = [trimmed, ...recentSearches.filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
    setRecentSearches(updated);
    try {
      localStorage.setItem('cls_recent_searches', JSON.stringify(updated));
    } catch (e) {
      // Ignore
    }
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('cls_recent_searches');
  };

  const removeRecentSearchItem = (e: React.MouseEvent, item: string) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s !== item);
    setRecentSearches(updated);
    localStorage.setItem('cls_recent_searches', JSON.stringify(updated));
  };

  // Handle Item Selection & Navigation
  const handleSelectItem = (item: SearchResultItem) => {
    saveRecentSearch(query || item.title);
    onClose();
    onNavigate(item.moduleTarget, item.targetId, item.metadata);
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (searchResults.length > 0 ? (prev + 1) % searchResults.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (searchResults.length > 0 ? (prev - 1 + searchResults.length) % searchResults.length : 0));
      } else if (e.key === 'Enter') {
        if (searchResults.length > 0 && searchResults[selectedIndex]) {
          e.preventDefault();
          handleSelectItem(searchResults[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (resultListRef.current && searchResults.length > 0) {
      const activeEl = resultListRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, searchResults]);

  if (!isOpen) return null;

  const activeResult = searchResults[selectedIndex] || searchResults[0];

  // Helper: Highlight matching text
  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight || !text) return text;
    const normText = removeVietnameseTones(text);
    const normHighlight = removeVietnameseTones(highlight);
    const index = normText.indexOf(normHighlight);

    if (index === -1) return text;

    const before = text.substring(0, index);
    const match = text.substring(index, index + highlight.length);
    const after = text.substring(index + highlight.length);

    return (
      <>
        {before}
        <span className="bg-amber-200 dark:bg-amber-900/60 text-slate-900 dark:text-amber-200 font-bold px-0.5 rounded">
          {match}
        </span>
        {after}
      </>
    );
  };

  const getCategoryIcon = (cat: SearchCategory) => {
    switch (cat) {
      case 'documents': return <FileText className="w-4 h-4 text-emerald-500" />;
      case 'tasks': return <CheckSquare className="w-4 h-4 text-blue-500" />;
      case 'equipment': return <Wrench className="w-4 h-4 text-indigo-500" />;
      case 'rooms': return <Building2 className="w-4 h-4 text-teal-500" />;
      case 'staff': return <User className="w-4 h-4 text-purple-500" />;
      case 'shifts': return <Clock className="w-4 h-4 text-rose-500" />;
      case 'meetings': return <Users className="w-4 h-4 text-amber-500" />;
      case 'navigation': return <Layers className="w-4 h-4 text-slate-500" />;
      default: return <Search className="w-4 h-4 text-blue-500" />;
    }
  };

  const categories: Array<{ id: SearchCategory; label: string; count?: number }> = [
    { id: 'all', label: 'Tất cả' },
    { id: 'documents', label: '📄 SOP & Hồ sơ' },
    { id: 'tasks', label: '📋 Công việc' },
    { id: 'equipment', label: '🔬 Máy móc' },
    { id: 'rooms', label: '🏥 Phòng ban' },
    { id: 'staff', label: '👨‍⚕️ Nhân sự' },
    { id: 'shifts', label: '⏱️ Lịch trực' },
    { id: 'meetings', label: '👥 Hội chẩn' },
    { id: 'navigation', label: '⚡ Phân hệ' }
  ];

  const popularKeywords = [
    'SOP', 'SOP-CLS-01', 'ISO 15189', 'MRI 3.0 Tesla', 'MSCT 128 Dải', 
    'Xét nghiệm máu', 'Cobas 6000', 'P-101-CT', 'P-102-MRI', 'Kiểm chuẩn', 'Bảo trì'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 md:pt-20 px-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90">
          <Search className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm quy trình SOP, hồ sơ ISO, công việc, máy móc, phòng ban, bác sĩ..."
            className="w-full bg-transparent text-base md:text-lg font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg mr-2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-slate-200 dark:border-slate-700">
            <span className="hidden sm:inline text-[11px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-md">
              ESC để đóng
            </span>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Filters Bar */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 overflow-x-auto custom-scrollbar text-xs font-semibold">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Main Content Area: Split View with Results on Left and Preview on Right */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[350px]">
          {/* Left Column: Results or Suggestions */}
          <div 
            ref={resultListRef}
            className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar border-r border-slate-100 dark:border-slate-800/80"
          >
            {query.trim() === '' ? (
              <div className="p-4 space-y-5">
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" /> Lịch sử tìm kiếm gần đây
                      </span>
                      <button
                        onClick={clearRecentSearches}
                        className="text-rose-500 hover:underline text-[11px] font-normal flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Xóa lịch sử
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((term, i) => (
                        <span
                          key={i}
                          onClick={() => setQuery(term)}
                          className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl text-xs font-medium cursor-pointer transition-all border border-slate-200/60 dark:border-slate-700/60"
                        >
                          <History className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
                          {term}
                          <button
                            onClick={(e) => removeRecentSearchItem(e, term)}
                            className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Popular Keywords / Suggestions */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Từ khóa gợi ý & Quy chuẩn Y tế
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {popularKeywords.map((kw, i) => (
                      <button
                        key={i}
                        onClick={() => setQuery(kw)}
                        className="px-3 py-1.5 bg-blue-50/70 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-semibold transition-colors border border-blue-200/50 dark:border-blue-800/50"
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Help Guide */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    💡 Mẹo tìm kiếm nhanh với thuật toán AI & Chuẩn Y khoa:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Hỗ trợ gõ <strong>tiếng Việt không dấu</strong> (ví dụ: <code>xet nghiem</code>, <code>chan doan hinh anh</code>).</li>
                    <li>Tìm kiếm theo <strong>mã hiệu chuẩn</strong>: <code>SOP-CLS-01</code>, <code>TSK-1001</code>, <code>P-101</code>.</li>
                    <li>Sử dụng các phím <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">↓</kbd> để di chuyển và <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Enter</kbd> để mở ngay.</li>
                  </ul>
                </div>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Search className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
                <h3 className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                  Không tìm thấy kết quả nào cho "{query}"
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Hãy thử tìm bằng từ khóa chung hơn, kiểm tra mã số hoặc chọn danh mục khác.
                </p>
              </div>
            ) : (
              searchResults.map((item, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <div
                    key={item.id}
                    data-index={idx}
                    onClick={() => handleSelectItem(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`p-3 rounded-xl cursor-pointer transition-all flex items-start gap-3 border ${
                      isSelected
                        ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5">
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${item.categoryColor}`}>
                          {item.categoryLabel}
                        </span>
                        {item.badge && (
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                            item.badge.variant === 'emerald' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                            item.badge.variant === 'rose' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                            item.badge.variant === 'amber' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                            item.badge.variant === 'purple' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' :
                            'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          }`}>
                            {item.badge.text}
                          </span>
                        )}
                        {item.code && (
                          <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
                            #{item.code}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {renderHighlightedText(item.title, query)}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {item.subtitle}
                      </p>
                    </div>
                    <ChevronRight className={`w-4 h-4 mt-2 shrink-0 transition-transform ${isSelected ? 'text-blue-600 translate-x-1' : 'text-slate-300 dark:text-slate-600'}`} />
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Active Item Detail & Actions Preview (Hidden on small screens) */}
          <div className="hidden md:flex flex-col w-80 bg-slate-50/60 dark:bg-slate-950/40 p-4 space-y-4 overflow-y-auto custom-scrollbar">
            {activeResult ? (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${activeResult.categoryColor}`}>
                      {activeResult.categoryLabel}
                    </span>
                    {activeResult.code && (
                      <button
                        onClick={() => handleCopy(activeResult.code!, activeResult.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        title="Sao chép mã"
                      >
                        {copiedId === activeResult.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {activeResult.code}
                      </button>
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug">
                      {activeResult.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {activeResult.subtitle}
                    </p>
                  </div>

                  {activeResult.description && (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {activeResult.description}
                    </div>
                  )}

                  {activeResult.tags && activeResult.tags.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Từ khóa & Thẻ:</div>
                      <div className="flex flex-wrap gap-1">
                        {activeResult.tags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium rounded-md">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => handleSelectItem(activeResult)}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowRight className="w-4 h-4" /> Chuyển đến phân hệ này
                  </button>
                  {activeResult.actionUrl && (
                    <a
                      href={activeResult.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-4 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-blue-500" /> Mở liên kết tài liệu
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-4">
                <Search className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">Chọn một kết quả để xem trước thông tin chi tiết</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Shortcut Navigation Bar */}
        <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-2xs font-mono text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-2xs font-mono text-[10px]">↓</kbd>
              <span className="hidden sm:inline">Di chuyển</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-2xs font-mono text-[10px]">↵</kbd>
              <span className="hidden sm:inline">Chọn & Mở</span>
            </span>
          </div>
          <div className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-3.5 h-3.5" /> Công cụ Tìm kiếm Đa tầng Cận Lâm Sàng
          </div>
        </div>
      </div>
    </div>
  );
};
