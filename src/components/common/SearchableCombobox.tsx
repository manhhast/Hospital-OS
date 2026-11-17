import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { removeVietnameseTones } from '../../services/searchService';

export interface ComboboxOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
}

interface SearchableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyOptionLabel?: string;
  noResultsLabel?: string;
  className?: string;
  inputClassName?: string;
}

export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Nhập để tìm nhanh hoặc bỏ trống...',
  emptyOptionLabel = '-- Bỏ trống (Chưa chỉ định) --',
  noResultsLabel = 'Không tìm thấy kết quả phù hợp',
  className = '',
  inputClassName = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => options.find(opt => opt.value === value),
    [options, value]
  );

  // Sync display when external value changes and dropdown is closed
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [value, isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const q = removeVietnameseTones(searchQuery);
    if (!q) return options;
    return options.filter(opt => {
      const hay = removeVietnameseTones(
        `${opt.label} ${opt.subLabel || ''} ${opt.badge || ''} ${opt.value}`
      );
      return hay.includes(q);
    });
  }, [options, searchQuery]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, isOpen]);

  const handleSelectOption = (nextValue: string) => {
    onChange(nextValue);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!isOpen) setIsOpen(true);
    if (val === '' && value !== '') {
      onChange('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery('');
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setHighlightedIndex(prev =>
        filteredOptions.length > 0 ? Math.min(prev + 1, filteredOptions.length - 1) : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) {
        setHighlightedIndex(prev => Math.max(prev - 1, 0));
      }
      return;
    }

    if (e.key === 'Enter' && isOpen) {
      e.preventDefault();
      if (filteredOptions.length > 0 && filteredOptions[highlightedIndex]) {
        handleSelectOption(filteredOptions[highlightedIndex].value);
      } else if (searchQuery.trim() === '') {
        handleSelectOption('');
      }
    }
  };

  const displayValue = isOpen
    ? searchQuery
    : selectedOption
    ? selectedOption.badge
      ? `${selectedOption.label} (${selectedOption.badge})`
      : selectedOption.label
    : value;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={
            isOpen && value
              ? `Đang chọn: ${value} — gõ để tìm khác...`
              : placeholder
          }
          autoComplete="off"
          className={`w-full pl-8 pr-14 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${inputClassName}`}
        />

        <div className="absolute right-2 flex items-center gap-1">
          {(value || searchQuery) && (
            <button
              type="button"
              onClick={handleClear}
              title="Xóa chọn (Bỏ trống)"
              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
                setSearchQuery('');
              } else {
                setIsOpen(true);
                inputRef.current?.focus();
              }
            }}
            aria-label="Mở danh sách"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800/80">
            {/* Option to leave blank */}
            <button
              type="button"
              onClick={() => handleSelectOption('')}
              className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                value === ''
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium'
              }`}
            >
              <span>{emptyOptionLabel}</span>
              {value === '' && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="px-3.5 py-4 text-center text-xs text-slate-400">
                {noResultsLabel}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={`${opt.value}-${idx}`}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelectOption(opt.value)}
                    className={`w-full px-3.5 py-2 text-left transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        : isHighlighted
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                        <span className="truncate">{opt.label}</span>
                        {opt.badge && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.subLabel && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {opt.subLabel}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
