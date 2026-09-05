import React, { useState } from 'react';
import { Settings, Save, RefreshCw, Key, Folder, Database, Mail, Shield, AlertTriangle, FileSpreadsheet, Link, Sun, Moon, Monitor, Palette } from 'lucide-react';
import { AppSettings } from '../../types/hospital';
import { storageService } from '../../services/storageService';

interface SettingsViewProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onConfirmAction: (title: string, message: string, onConfirm: () => void, isDanger?: boolean) => void;
  themeMode?: 'light' | 'dark' | 'system';
  onChangeThemeMode?: (mode: 'light' | 'dark' | 'system') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onShowToast,
  onConfirmAction,
  themeMode = 'system',
  onChangeThemeMode
}) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const s = storageService.getSettings();
    if (!s.googleSheetUrl) {
      s.googleSheetUrl = localStorage.getItem('google_sheet_url') || 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
    }
    if (!s.reportGoogleSheetId) {
      s.reportGoogleSheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    }
    return s;
  });

  // Helper functions for auto-extracting & bi-directional matching between URL and ID
  const extractIdFromUrlOrText = (input: string): string => {
    if (!input) return '';
    const sheetMatch = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (sheetMatch && sheetMatch[1]) return sheetMatch[1];
    
    const driveFolderMatch = input.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (driveFolderMatch && driveFolderMatch[1]) return driveFolderMatch[1];

    if (!input.includes('/') && !input.includes('http')) {
      return input.trim();
    }
    return input.trim();
  };

  const buildSpreadsheetUrlFromId = (idOrUrl: string): string => {
    const clean = idOrUrl.trim();
    if (!clean) return '';
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    return `https://docs.google.com/spreadsheets/d/${clean}/edit?usp=sharing`;
  };

  const handleReportUrlChange = (val: string) => {
    if (val.startsWith('http://') || val.startsWith('https://') || val.includes('/d/')) {
      const extractedId = extractIdFromUrlOrText(val);
      setSettings({
        ...settings,
        googleSheetUrl: val,
        reportGoogleSheetId: extractedId
      });
    } else {
      // User typed an ID into the URL field directly
      const cleanId = val.trim();
      const generatedUrl = buildSpreadsheetUrlFromId(cleanId);
      setSettings({
        ...settings,
        googleSheetUrl: generatedUrl,
        reportGoogleSheetId: cleanId
      });
    }
  };

  const handleReportIdChange = (val: string) => {
    if (val.startsWith('http://') || val.startsWith('https://') || val.includes('/d/')) {
      // User pasted a full URL into the ID field
      const extractedId = extractIdFromUrlOrText(val);
      setSettings({
        ...settings,
        reportGoogleSheetId: extractedId,
        googleSheetUrl: val
      });
    } else {
      // User typed or pasted a raw ID
      const cleanId = val.trim();
      const generatedUrl = buildSpreadsheetUrlFromId(cleanId);
      setSettings({
        ...settings,
        reportGoogleSheetId: cleanId,
        googleSheetUrl: generatedUrl
      });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    storageService.saveSettings(settings);
    if (settings.googleSheetUrl) {
      localStorage.setItem('google_sheet_url', settings.googleSheetUrl);
    }
    onShowToast('Cấu hình đã lưu', 'Đã cập nhật các tham số hệ thống và phân tách rõ 2 Google Sheets thành công', 'success');
  };

  const handleResetDatabase = () => {
    onConfirmAction(
      'Khôi phục dữ liệu mặc định',
      'CẢNH BÁO: Thao tác này sẽ xóa toàn bộ thay đổi và đặt lại dữ liệu mẫu Bệnh viện ban đầu. Bạn có chắc chắn không?',
      () => {
        storageService.resetToDefault();
        setSettings(storageService.getSettings());
        onShowToast('Đã khôi phục', 'Dữ liệu đã được đặt lại về mặc định', 'warning');
      },
      true
    );
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200 max-w-4xl">
      <form onSubmit={handleSave} className="space-y-6">
        {/* THEME SELECTOR CARD */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-2" /> 
              Chủ Đề Giao Diện & Trải Nghiệm Visual UI
            </h3>
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-full border border-indigo-300/60">
              Đồng bộ hệ thống
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tùy chỉnh phong cách giao diện hiển thị cho toàn bộ ứng dụng Bệnh viện. Hỗ trợ tự động chuyển đổi theo hệ điều hành.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Light Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('light')}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                themeMode === 'light'
                  ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                  <Sun className="w-5 h-5" />
                </div>
                {themeMode === 'light' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-600 text-white rounded-md">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Giao diện Sáng</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Tone nền sáng rạng rỡ, thích hợp ban ngày & phòng khám nhiều ánh sáng</p>
              </div>
            </button>

            {/* Dark Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('dark')}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                themeMode === 'dark'
                  ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-slate-900 text-indigo-400 dark:bg-slate-950 dark:text-indigo-400 border border-slate-700">
                  <Moon className="w-5 h-5" />
                </div>
                {themeMode === 'dark' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-600 text-white rounded-md">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Giao diện Tối</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Dịu mắt, bảo vệ thị lực ca trực đêm & phòng chẩn đoán hình ảnh tối</p>
              </div>
            </button>

            {/* System Card */}
            <button
              type="button"
              onClick={() => onChangeThemeMode?.('system')}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                themeMode === 'system'
                  ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Monitor className="w-5 h-5" />
                </div>
                {themeMode === 'system' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-600 text-white rounded-md">
                    Đang chọn
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Theo Hệ Thống</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Tự động đồng bộ với chế độ Sáng/Tối của hệ điều hành thiết bị</p>
              </div>
            </button>
          </div>
        </div>
        {/* SHEET 1: GOOGLE SHEET BÁO CÁO SỐ CA */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-emerald-200/80 dark:border-emerald-900/50 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 mr-2" /> 
              1. Google Sheets Báo Cáo & Thống Kê Số Ca
            </h3>
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-full border border-emerald-300/60">
              Lấy dữ liệu số ca
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Trang tính Google Sheets này dùng riêng để <strong className="text-slate-700 dark:text-slate-200">đọc dữ liệu giao ban số ca thực tế</strong> cho menu <strong className="text-slate-700 dark:text-slate-200">"Báo cáo & Thống kê"</strong>. Các tab (Tháng 1, Tháng 2, Tháng 3,...) chứa thống kê lượt ca Bảo hiểm (BH) & Nhân dân (ND) theo ngày, tuần (1-52) và cả năm.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                <Link className="w-3.5 h-3.5 text-emerald-600" />
                Đường dẫn Google Sheets (URL Báo cáo số ca giao ban Khoa CLS):
              </label>
              <input
                type="text"
                value={settings.googleSheetUrl || ''}
                onChange={(e) => handleReportUrlChange(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs.../edit"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Dán URL hoặc ID trang tính Báo cáo số ca (Tự động khớp ô ID bên dưới).</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Google Sheet ID Báo Cáo (Trích xuất tự động):
              </label>
              <input
                type="text"
                value={settings.reportGoogleSheetId || ''}
                onChange={(e) => handleReportIdChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-emerald-700 dark:text-emerald-400 font-bold"
                placeholder="Nhập ID hoặc dán URL (Tự động khớp với ô URL ở trên)"
              />
              <p className="text-[11px] text-slate-400 mt-1">Chỉ cần nhập ID hoặc dán URL vào đây, ô URL ở trên sẽ tự động tạo khớp tương ứng.</p>
            </div>
          </div>
        </div>

        {/* SHEET 2: GOOGLE SHEET LƯU ID TỆP TẢI LÊN & CHỈ MỤC HỆ THỐNG */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-blue-200/80 dark:border-blue-900/50 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <Database className="w-5 h-5 text-blue-600 mr-2" /> 
              2. Google Sheets Cơ Sở Dữ Liệu Lưu ID Tệp Tải Lên
            </h3>
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded-full border border-blue-300/60">
              Lưu chỉ mục tệp & Hồ sơ
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Trang tính Google Sheets này hoạt động như một <strong className="text-slate-700 dark:text-slate-200">Cơ sở dữ liệu Chỉ mục (File Index Database)</strong> để lưu trữ ID tệp PDF/Docx tải lên Google Drive, danh mục tài liệu SOP, liên kết chia sẻ và dữ liệu sao lưu của hệ thống.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Google Sheet Database ID (Lưu chỉ mục ID tệp tải lên):
              </label>
              <input
                type="text"
                value={settings.googleSheetId}
                onChange={(e) => {
                  const val = e.target.value;
                  const cleanId = extractIdFromUrlOrText(val);
                  setSettings({ ...settings, googleSheetId: cleanId });
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-blue-700 dark:text-blue-400 font-bold"
                placeholder="Ví dụ: 1Spreadsheet_DB_CLS_WorkHub_Key"
              />
              <p className="text-[11px] text-slate-400 mt-1">Mã ID hoặc URL trang tính lưu bảng chỉ mục tệp (tự động lọc lấy ID sạch).</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Tên Bảng Tính / CSDL Tệp Mặc Định:</label>
              <input
                type="text"
                value={settings.googleSheetName || 'CLS_WorkHub_FileIndex_Database'}
                onChange={(e) => setSettings({ ...settings, googleSheetName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">Tên tab/trang tính lưu thông tin tệp.</p>
            </div>
          </div>
        </div>

        {/* Telegram & Drive Config */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
            <Key className="w-5 h-5 text-blue-600 mr-2" /> Kết nối Google Drive & Telegram Bot
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Telegram Bot Token</label>
              <input
                type="text"
                value={settings.telegramBotToken}
                onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Default Telegram Chat ID</label>
              <input
                type="text"
                value={settings.defaultTelegramChatId}
                onChange={(e) => setSettings({ ...settings, defaultTelegramChatId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Google Drive Folder ID (Lưu trữ Hồ sơ SOP / Văn bản)</label>
              <input
                type="text"
                value={settings.googleDriveFolderId}
                onChange={(e) => {
                  const cleanFolderId = extractIdFromUrlOrText(e.target.value);
                  setSettings({ ...settings, googleDriveFolderId: cleanFolderId });
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100"
                placeholder="Nhập Folder ID hoặc dán liên kết Google Drive Folder"
              />
              <p className="text-[11px] text-slate-400 mt-1">Dán ID hoặc URL thư mục Google Drive (tự động trích xuất Folder ID).</p>
            </div>
          </div>
        </div>

        {/* Performance & Execution */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
            <Database className="w-5 h-5 text-emerald-600 mr-2" /> Tối ưu Hiệu năng & CacheService / LockService
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Cache TTL (Phút)</label>
              <input
                type="number"
                value={settings.cacheTtlMinutes}
                onChange={(e) => setSettings({ ...settings, cacheTtlMinutes: parseInt(e.target.value) || 10 })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Lock Timeout (Mili giây)</label>
              <input
                type="number"
                value={settings.lockTimeoutMs}
                onChange={(e) => setSettings({ ...settings, lockTimeoutMs: parseInt(e.target.value) || 30000 })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.debugMode}
                  onChange={(e) => setSettings({ ...settings, debugMode: e.target.checked })}
                  className="rounded-md border-slate-300"
                />
                <span className="font-bold text-slate-700 dark:text-slate-200">Bật Chế độ Debug Mode</span>
              </label>
            </div>
          </div>
        </div>

        {/* Save & Reset Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleResetDatabase}
            className="flex items-center space-x-2 px-4 py-2.5 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100 rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset Database Mẫu</span>
          </button>

          <button
            type="submit"
            className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-md transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Lưu cấu hình hệ thống</span>
          </button>
        </div>
      </form>
    </div>
  );
};
