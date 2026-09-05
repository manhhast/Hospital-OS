import React, { useState, useEffect } from 'react';
import { 
  Code2, Download, Copy, Check, Layers, Server, Database, 
  FileCode, Terminal, ShieldCheck, Cpu, ArrowRight, CheckCircle2, FileText, Lock
} from 'lucide-react';
import { gasFilesList } from '../../services/gasCodeRepository';
import { GASFileCode, User } from '../../types/hospital';
import { storageService } from '../../services/storageService';

interface GASArchitectureViewProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const GASArchitectureView: React.FC<GASArchitectureViewProps> = ({ onShowToast }) => {
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());
  const [selectedFile, setSelectedFile] = useState<GASFileCode>(gasFilesList[0]);
  const [copied, setCopied] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'backend' | 'frontend'>('all');

  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setCurrentUser(storageService.getCurrentUser());
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = currentUser?.role === 'Admin';

  const filteredFiles = gasFilesList.filter(f => filterType === 'all' || f.type === filterType);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    onShowToast('Đã sao chép', `Mã nguồn file ${selectedFile.filename} đã lưu vào Clipboard`, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = (file: GASFileCode) => {
    const element = document.createElement("a");
    const blob = new Blob([file.code], { type: 'text/plain' });
    element.href = URL.createObjectURL(blob);
    element.download = file.filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    onShowToast('Đã tải file', `Đã tải xuống file mã nguồn ${file.filename}`, 'success');
  };

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 shadow-xs text-center space-y-4 max-w-xl mx-auto my-12 animate-in fade-in duration-200">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Quyền truy cập bị hạn chế</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Thư viện Kiến trúc Mã nguồn Google Apps Script (GAS Code) chỉ dành riêng cho Quản trị viên hệ thống (<span className="font-bold text-purple-600">Admin</span>).
          <br />Vui lòng chuyển đổi vai trò sang Admin ở góc trên bên phải thanh Header để xem toàn bộ mã nguồn backend/frontend.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">

      {/* Top Banner / System Overview */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="px-2.5 py-1 bg-blue-600 text-white text-[10px] font-extrabold uppercase rounded-md tracking-wider">
              Google Apps Script Enterprise Architecture
            </span>
            <h2 className="text-xl font-bold tracking-tight mt-2">Kiến trúc Hệ thống Hospital OS (4-Layer Pattern)</h2>
            <p className="text-slate-300 text-xs mt-1">
              Mô hình chuẩn Doanh nghiệp: Presentation Layer &rarr; Service Layer &rarr; Repository Layer &rarr; Google Services (Spreadsheet, Drive, Gmail, Telegram)
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleCopyCode}
              className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-md"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Đã copy!' : 'Copy Code File Này'}</span>
            </button>
            <button
              onClick={() => handleDownloadFile(selectedFile)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs border border-slate-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Tải file .gs / .js</span>
            </button>
          </div>
        </div>

        {/* Visual Architecture Diagram */}
        <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-4 gap-3 text-center text-xs">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700 space-y-1">
            <div className="font-bold text-blue-400 uppercase text-[10px]">1. Presentation Layer</div>
            <p className="text-[11px] text-slate-300">index.html, style.css, app.js, task.js, document.js, api.js</p>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700 space-y-1">
            <div className="font-bold text-emerald-400 uppercase text-[10px]">2. Service Layer</div>
            <p className="text-[11px] text-slate-300">TaskService, DocumentService, NotificationService, Dashboard</p>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700 space-y-1">
            <div className="font-bold text-amber-400 uppercase text-[10px]">3. Repository Layer</div>
            <p className="text-[11px] text-slate-300">Repository.gs (CacheService, LockService, Batch Operations)</p>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700 space-y-1">
            <div className="font-bold text-purple-400 uppercase text-[10px]">4. Google Services</div>
            <p className="text-[11px] text-slate-300">Spreadsheet DB, Google Drive, Gmail, Telegram Bot API</p>
          </div>
        </div>
      </div>

      {/* Code Inspector Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left File Tree Selector (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-xs uppercase text-slate-500 tracking-wider">Danh sách File Mã Nguồn ({gasFilesList.length})</h3>

            <div className="flex items-center space-x-1 text-[11px]">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2 py-0.5 rounded-md ${filterType === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'}`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setFilterType('backend')}
                className={`px-2 py-0.5 rounded-md ${filterType === 'backend' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'}`}
              >
                Backend
              </button>
              <button
                onClick={() => setFilterType('frontend')}
                className={`px-2 py-0.5 rounded-md ${filterType === 'frontend' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'}`}
              >
                Frontend
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
            {filteredFiles.map((f) => {
              const isSelected = selectedFile.filename === f.filename;
              return (
                <button
                  key={f.filename}
                  onClick={() => setSelectedFile(f)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <FileCode className={`w-4 h-4 shrink-0 ${f.type === 'backend' ? 'text-amber-500' : 'text-emerald-500'}`} />
                    <span className="truncate font-mono">{f.filename}</span>
                  </div>

                  <span className={`px-1.5 py-0.2 text-[9px] font-bold uppercase rounded-md shrink-0 ${
                    f.type === 'backend' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}>
                    {f.type}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Code Viewer & Description (8 cols) */}
        <div className="lg:col-span-8 bg-slate-950 rounded-2xl border border-slate-800 p-5 text-slate-200 shadow-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] text-blue-400 font-mono uppercase tracking-widest">{selectedFile.type.toUpperCase()} MODULE</span>
                <h3 className="text-base font-bold text-white font-mono">{selectedFile.filename}</h3>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopyCode}
                  className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                  title="Sao chép"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDownloadFile(selectedFile)}
                  className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                  title="Tải xuống"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400 my-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
              💡 {selectedFile.description}
            </p>

            {/* Syntax Highlight Code Area */}
            <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto max-h-[500px] custom-scrollbar border border-slate-800">
              <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
                <code>{selectedFile.code}</code>
              </pre>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Tuân thủ SOLID | DRY | Clean Code | Try-Catch | CacheService & LockService</span>
            <span>File size: {selectedFile.code.length} bytes</span>
          </div>
        </div>
      </div>
    </div>
  );
};
