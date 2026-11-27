import React, { useState } from 'react';
import { 
  X, ExternalLink, Download, Printer, Copy, Check, ZoomIn, ZoomOut, 
  Maximize2, Minimize2, RotateCw, Sliders, Sun, Moon, HardDrive, 
  FileText, FileSpreadsheet, Image as ImageIcon, Music, Video, 
  History, ShieldCheck, CheckCircle2, Search, Globe
} from 'lucide-react';
import { DocumentItem } from '../../types/hospital';
import { 
  SAMPLE_SOP_DETAILS, SAMPLE_EQA_SPREADSHEET
} from './documentPreviewContent';
import { storageService } from '../../services/storageService';
import { getCachedFileUrl } from '../../services/fileStorageCache';
import { googleDriveService, isValidGoogleDriveId } from '../../services/googleDriveService';
import { postgresSyncService } from '../../services/postgresSyncService';

interface DocumentPreviewModalProps {
  doc: DocumentItem | null;
  onClose: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onOpenVersionModal?: (doc: DocumentItem) => void;
  onDocumentsUpdated?: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  doc,
  onClose,
  onShowToast,
  onOpenVersionModal
}) => {
  if (!doc) return null;

  return (
    <DocumentPreviewModalContent
      key={doc.id}
      doc={doc}
      onClose={onClose}
      onShowToast={onShowToast}
      onOpenVersionModal={onOpenVersionModal}
    />
  );
};

interface DocumentPreviewModalContentProps {
  doc: DocumentItem;
  onClose: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onOpenVersionModal?: (doc: DocumentItem) => void;
}

const DocumentPreviewModalContent: React.FC<DocumentPreviewModalContentProps> = ({
  doc,
  onClose,
  onShowToast,
  onOpenVersionModal
}) => {
  // View state (unconditional hooks after null guard in wrapper)
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'metadata' | 'versions'>('preview');
  const [copiedLink, setCopiedLink] = useState(false);

  // Imaging Tools State (for PNG/JPG/DICOM images)
  const [rotation, setRotation] = useState<number>(0);
  const [invertColors, setInvertColors] = useState<boolean>(false);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);

  // Spreadsheet State (for XLSX)
  const [activeSheetTab, setActiveSheetTab] = useState<string>('tab-eqa-q2');
  const [sheetSearch, setSheetSearch] = useState<string>('');

  const [resolvedServerUrl, setResolvedServerUrl] = useState<string | null>(null);

  const settings = storageService.getSettings();
  const folderId = doc.driveFolderId || settings.googleDriveFolderId || 'Chưa cấu hình Folder ID';
  const hasRealDriveId = isValidGoogleDriveId(doc.driveFileId);
  const serverFileUrl =
    doc.serverFileUrl && doc.serverFileUrl.startsWith('/api/files/')
      ? doc.serverFileUrl
      : doc.driveUrl && doc.driveUrl.startsWith('/api/files/')
        ? doc.driveUrl
        : null;
  const hasServerFile = Boolean(serverFileUrl);

  React.useEffect(() => {
    let active = true;
    setResolvedServerUrl(null);
    if (!serverFileUrl) return;
    postgresSyncService
      .fetchFileAsBlobUrl(serverFileUrl)
      .then((blobUrl) => {
        if (active) setResolvedServerUrl(blobUrl);
      })
      .catch(() => {
        if (active) setResolvedServerUrl(null);
      });
    return () => {
      active = false;
    };
  }, [serverFileUrl]);

  const realFileUrl = resolvedServerUrl || getCachedFileUrl(doc.id, doc.rawFileData || '');
  const driveEmbedUrl = hasRealDriveId
    ? `https://drive.google.com/file/d/${doc.driveFileId}/preview`
    : null;
  const driveFileUrl = googleDriveService.getViewUrl(doc);
  const mediaSrcUrl = realFileUrl || (hasRealDriveId ? googleDriveService.getPublicDownloadUrl(doc) : doc.driveUrl);

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Matched SOP detailed content ONLY for predefined system SOP templates (never for user-uploaded custom files)
  const isPredefinedSop = !doc.isUserUploaded && Boolean(doc.code && SAMPLE_SOP_DETAILS[doc.code]);
  const matchedSop = isPredefinedSop ? SAMPLE_SOP_DETAILS[doc.code!] : null;

  const handleZoom = (delta: number) => {
    setZoomLevel(prev => Math.min(Math.max(50, prev + delta), 200));
  };

  const handleResetImage = () => {
    setRotation(0);
    setInvertColors(false);
    setBrightness(100);
    setContrast(100);
    setZoomLevel(100);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(driveFileUrl);
    setCopiedLink(true);
    onShowToast('Đã sao chép liên kết Drive', 'Liên kết tệp Google Drive đã được sao chép vào bộ nhớ tạm.', 'info');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    try {
      const outcome = await googleDriveService.downloadDocument(doc);
      if (outcome.method === 'metadata_fallback') {
        onShowToast(
          'Đã tải phiếu thông tin hồ sơ',
          `"${doc.title}" là hồ sơ mẫu chưa có tệp nhị phân trên Google Drive; đã tải bản tóm tắt hồ sơ.`,
          'info'
        );
      } else {
        onShowToast('Bắt đầu tải xuống', `Đang tải tệp "${doc.title}" về máy tính...`, 'success');
      }
    } catch (err) {
      onShowToast(
        'Không thể tải xuống',
        err instanceof Error ? err.message : 'Vui lòng thử mở trực tiếp trên Google Drive để tải về.',
        'error'
      );
    }
  };

  // Active spreadsheet tab data
  const currentSheet = SAMPLE_EQA_SPREADSHEET.find(s => s.id === activeSheetTab) || SAMPLE_EQA_SPREADSHEET[0];
  const filteredRows = currentSheet.rows.filter(r => 
    r.testName.toLowerCase().includes(sheetSearch.toLowerCase()) ||
    r.sampleCode.toLowerCase().includes(sheetSearch.toLowerCase()) ||
    r.technician.toLowerCase().includes(sheetSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-[#DFE7F0] dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-200 ${
        isFullscreen ? 'fixed inset-2 z-50 rounded-xl' : 'max-w-5xl w-full max-h-[94vh]'
      }`}>
        
        {/* ===================== MODAL TOP BAR ===================== */}
        <div className="p-3.5 sm:p-4 border-b border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between gap-3 bg-[#F4F7FB] dark:bg-slate-900/90 shrink-0">
          
          {/* File Info Left */}
          <div className="flex items-center space-x-3 min-w-0 pr-2">
            <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg shadow-xs border border-[#DFE7F0] dark:border-slate-700 shrink-0">
              {doc.fileExtension === 'PDF' ? <FileText className="w-5 h-5 text-rose-500" /> :
               doc.fileExtension === 'DOCX' ? <FileText className="w-5 h-5 text-[#1976D2]" /> :
               doc.fileExtension === 'XLSX' ? <FileSpreadsheet className="w-5 h-5 text-emerald-500" /> :
               doc.fileExtension === 'PNG' || doc.fileExtension === 'JPG' ? <ImageIcon className="w-5 h-5 text-purple-500" /> :
               doc.fileExtension === 'MP4' ? <Video className="w-5 h-5 text-[#1976D2]" /> :
               doc.fileExtension === 'MP3' ? <Music className="w-5 h-5 text-amber-500" /> :
               <FileText className="w-5 h-5 text-[#718096]" />}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold text-[#718096] dark:text-slate-400 bg-white dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 px-1.5 py-0.2 rounded">
                  {doc.code || doc.id}
                </span>
                <span className="px-2 py-0.2 text-[10px] font-bold rounded-md bg-[#EAF4FF] text-[#155A9C] dark:bg-blue-950 dark:text-blue-300 border border-[#1976D2]/20 dark:border-blue-800">
                  {doc.fileExtension}
                </span>
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-md bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  {doc.version}
                </span>
                {hasRealDriveId ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.2 rounded-md border border-emerald-200 dark:border-emerald-800/60">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    Lưu trên Google Drive
                  </span>
                ) : hasServerFile ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#155A9C] dark:text-blue-300 bg-[#EAF4FF] dark:bg-blue-950/60 px-2 py-0.2 rounded-md border border-[#1976D2]/25 dark:border-blue-800/60">
                    <CheckCircle2 className="w-3 h-3 text-[#1976D2]" />
                    Lưu trên Máy chủ PostgreSQL
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#718096] dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-0.2 rounded-md border border-[#DFE7F0] dark:border-slate-700">
                    Hồ sơ mẫu hệ thống
                  </span>
                )}
              </div>

              <h3 className="text-xs sm:text-sm font-bold text-[#263445] dark:text-slate-100 truncate mt-0.5" title={doc.title}>
                {doc.title}
              </h3>
            </div>
          </div>

          {/* Action Toolbar Right */}
          <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
            
            {/* Zoom Controls (For PDF, Images, Spreadsheets) */}
            <div className="hidden md:flex items-center bg-white dark:bg-slate-800 rounded-lg border border-[#DFE7F0] dark:border-slate-700 p-0.5 text-xs">
              <button
                onClick={() => handleZoom(-15)}
                className="p-1.5 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 rounded-md hover:bg-[#F4F7FB] dark:hover:bg-slate-700 transition-colors"
                title="Thu nhỏ (-15%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-[11px] font-bold text-[#263445] dark:text-slate-300">
                {zoomLevel}%
              </span>
              <button
                onClick={() => handleZoom(15)}
                className="p-1.5 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 rounded-md hover:bg-[#F4F7FB] dark:hover:bg-slate-700 transition-colors"
                title="Phóng to (+15%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="p-2 text-[#718096] dark:text-slate-300 hover:text-[#1976D2] hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="In tài liệu y tế"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Download Button (Open to all users) */}
            <button
              onClick={() => void handleDownload()}
              className="p-2 text-[#718096] dark:text-slate-300 hover:text-[#1976D2] hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Tải tệp về máy tính (không cần đăng nhập Google)"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Copy Drive Link */}
            {hasRealDriveId && (
              <button
                onClick={handleCopyLink}
                className="p-2 text-[#718096] dark:text-slate-300 hover:text-[#1976D2] hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
                title="Sao chép liên kết Google Drive"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            )}

            {/* Open directly in Google Drive */}
            {hasRealDriveId && (
              <a
                href={driveFileUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 bg-[#EAF4FF] hover:bg-[#1976D2]/15 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-[#155A9C] dark:text-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[#1976D2]/25 dark:border-blue-800"
                title="Mở tệp trực tiếp trong Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mở trên Drive</span>
              </a>
            )}

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-[#718096] dark:text-slate-300 hover:text-[#263445] hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
              title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-[#718096] hover:text-[#263445] dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors ml-1"
              title="Đóng cửa sổ xem trước (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ===================== VIEW MODE TABS ===================== */}
        <div className="px-5 border-b border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 text-xs">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('preview')}
              className={`py-2.5 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'border-[#1976D2] text-[#1976D2] dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-[#718096] hover:text-[#263445] dark:hover:text-slate-300'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Nội dung Xem trước</span>
            </button>

            <button
              onClick={() => setActiveTab('metadata')}
              className={`py-2.5 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'metadata'
                  ? 'border-[#1976D2] text-[#1976D2] dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-[#718096] hover:text-[#263445] dark:hover:text-slate-300'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Thông tin Đồng bộ Drive</span>
            </button>

            <button
              onClick={() => setActiveTab('versions')}
              className={`py-2.5 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'versions'
                  ? 'border-[#1976D2] text-[#1976D2] dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-[#718096] hover:text-[#263445] dark:hover:text-slate-300'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Lịch sử Phiên bản ({doc.versionHistory?.length || 1})</span>
            </button>
          </div>

          {/* Open Read Access Info */}
          <div className="hidden sm:flex items-center space-x-2 py-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            <Globe className="w-3.5 h-3.5" />
            <span>Mọi nhân viên đều có thể xem trước & tải về</span>
          </div>
        </div>

        {/* ===================== MAIN PREVIEW BODY ===================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[#F4F7FB] dark:bg-slate-950 flex flex-col justify-start items-center">
          
          {/* TAB 1: INTERACTIVE PREVIEW */}
          {activeTab === 'preview' && (
            <div className="w-full flex flex-col items-center">
              
              {/* ---------------- 1. REAL EMBEDDED PDF VIEWER (LOCAL OR PUBLIC GOOGLE DRIVE) ---------------- */}
              {doc.fileExtension === 'PDF' && !matchedSop && (
                <div 
                  className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 overflow-hidden flex flex-col transition-transform origin-top"
                  style={{ transform: `scale(${zoomLevel / 100})`, marginBottom: zoomLevel > 100 ? `${(zoomLevel - 100) * 4}px` : '0px' }}
                >
                  {/* Top Bar for Real PDF */}
                  <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/90 border-b border-[#DFE7F0] dark:border-slate-700 flex items-center justify-between gap-3 text-xs flex-wrap">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-bold text-[11px] rounded-md border border-rose-200 dark:border-rose-900 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> {hasRealDriveId ? 'PDF TRÊN GOOGLE DRIVE' : 'PDF'}
                      </span>
                      <span className="font-semibold text-[#263445] dark:text-slate-100 truncate max-w-xs sm:max-w-md" title={doc.title}>
                        {doc.title}
                      </span>
                      <span className="text-[#718096] font-mono text-[11px]">
                        ({formatFileSize(doc.fileSize)})
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {(realFileUrl || hasRealDriveId) && (
                        <a
                          href={realFileUrl || driveFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 bg-white dark:bg-slate-800 hover:bg-[#EAF4FF] dark:hover:bg-slate-700 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Mở tab mới
                        </a>
                      )}
                      <button
                        onClick={() => void handleDownload()}
                        className="px-3 py-1 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" /> Tải về máy
                      </button>
                    </div>
                  </div>

                  {/* Native PDF / Google Drive Embedded Viewer */}
                  <div className="w-full relative min-h-[580px] h-[72vh] bg-[#F4F7FB] dark:bg-slate-950 flex flex-col items-center justify-center">
                    {realFileUrl || driveEmbedUrl ? (
                      <div className="w-full h-full relative flex flex-col">
                        <iframe
                          src={realFileUrl || driveEmbedUrl || undefined}
                          className="w-full h-full border-0 bg-white dark:bg-slate-900 rounded-b-xl"
                          title={doc.title}
                          allow="autoplay"
                        />
                      </div>
                    ) : (
                      <div className="p-8 text-center flex flex-col items-center justify-center space-y-3">
                        <FileText className="w-14 h-14 text-[#718096]" />
                        <h4 className="text-base font-bold text-[#263445] dark:text-slate-200">
                          {doc.title}
                        </h4>
                        <p className="text-xs text-[#718096] max-w-md">
                          Hồ sơ mẫu hệ thống. Để xem trực tiếp tệp PDF thực tế cho mọi người dùng, quản trị viên có thể tải lên tệp mới lên Google Drive.
                        </p>
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => void handleDownload()}
                            className="px-4 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white text-xs font-semibold rounded-lg flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" /> Tải phiếu thông tin ({formatFileSize(doc.fileSize)})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ---------------- 2. PREDEFINED CLINICAL SOP STANDARD VIEWER ---------------- */}
              {matchedSop && (
                <div 
                  className="w-full max-w-3xl bg-white text-slate-800 shadow-xl rounded-2xl border border-slate-300/80 p-6 sm:p-10 transition-transform origin-top space-y-6"
                  style={{ transform: `scale(${zoomLevel / 100})`, marginBottom: zoomLevel > 100 ? `${(zoomLevel - 100) * 4}px` : '0px' }}
                >
                  {/* Hospital Official Letterhead */}
                  <div className="border-b-2 border-slate-800 pb-4 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                        {matchedSop.hospitalName || 'BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG'}
                      </h4>
                      <h5 className="text-[11px] font-bold text-blue-700 uppercase">
                        {matchedSop.department || 'KHOA CẬN LÂM SÀNG'}
                      </h5>
                      <p className="text-[10px] text-slate-500">
                        Hệ thống Tiêu chuẩn Quản lý Chất lượng Xét nghiệm ISO 15189:2022
                      </p>
                    </div>

                    <div className="text-right space-y-0.5 border-l border-slate-200 pl-4">
                      <div className="text-xs font-mono font-bold text-slate-800">
                        Mã hiệu: <span className="text-blue-600">{doc.code || doc.id}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Phiên bản: <strong className="text-slate-700">{doc.version}</strong>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Ngày hiệu lực: {matchedSop.effectiveDate || doc.uploadDate}
                      </div>
                    </div>
                  </div>

                  {/* SOP Document Title Banner */}
                  <div className="text-center py-2 space-y-1.5">
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase rounded-full tracking-wider border border-blue-200">
                      VĂN BẢN QUY TRÌNH CHUẨN ĐÃ PHÊ DUYỆT
                    </span>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
                      {matchedSop.title || doc.title}
                    </h2>
                    <p className="text-xs italic text-slate-500">
                      {matchedSop.revision || 'Ban hành và lưu trữ điện tử trên hệ thống Google Drive Khoa'}
                    </p>
                  </div>

                  {/* Purpose & Scope Card */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div>
                      <strong className="text-slate-900 uppercase text-[11px]">I. Mục đích:</strong>
                      <p className="text-slate-700 mt-0.5 leading-relaxed">
                        {matchedSop.purpose || 'Chuẩn hóa kỹ thuật, hạn chế sai sót và đáp ứng tiêu chuẩn kiểm soát chất lượng.'}
                      </p>
                    </div>
                    <div>
                      <strong className="text-slate-900 uppercase text-[11px]">II. Phạm vi áp dụng:</strong>
                      <p className="text-slate-700 mt-0.5 leading-relaxed">
                        {matchedSop.scope || 'Áp dụng cho toàn thể nhân viên y tế trực thuộc Khoa Cận Lâm Sàng.'}
                      </p>
                    </div>
                  </div>

                  {/* Step-by-step Sections */}
                  <div className="space-y-4 text-xs">
                    <strong className="text-slate-900 uppercase text-[11px] block border-b pb-1">
                      III. Các bước quy trình kỹ thuật & Thao tác an toàn:
                    </strong>
                    {matchedSop.sections.map((sec, sIdx) => (
                      <div key={sIdx} className="space-y-1.5 pl-2 border-l-2 border-blue-500">
                        <h6 className="font-bold text-slate-900 text-xs">{sec.title}</h6>
                        <ul className="list-disc pl-5 space-y-1 text-slate-700 text-[11px] leading-relaxed">
                          {sec.content.map((item, iIdx) => (
                            <li key={iIdx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {/* Signatories & Hospital Stamp Box */}
                  <div className="pt-6 border-t-2 border-slate-200 grid grid-cols-3 gap-4 text-center text-xs">
                    <div className="space-y-1">
                      <p className="font-bold text-slate-700">Người biên soạn</p>
                      <p className="text-[10px] text-slate-400">Điều dưỡng trưởng</p>
                      <div className="h-12 flex items-center justify-center font-serif italic text-blue-700 font-bold">
                        {doc.owner || 'Lê Thị Hương'}
                      </div>
                      <p className="font-semibold text-slate-800 text-[11px]">{doc.owner || 'CN. Lê Thị Hương'}</p>
                    </div>

                    <div className="space-y-1">
                      <p className="font-bold text-slate-700">Người kiểm tra</p>
                      <p className="text-[10px] text-slate-400">Phụ trách ISO Khoa</p>
                      <div className="h-12 flex items-center justify-center font-serif italic text-indigo-700 font-bold">
                        Nguyễn Hoài Nam
                      </div>
                      <p className="font-semibold text-slate-800 text-[11px]">ThS. BS. Nguyễn Hoài Nam</p>
                    </div>

                    <div className="space-y-1 relative">
                      <p className="font-bold text-slate-700">Trưởng khoa phê duyệt</p>
                      <p className="text-[10px] text-slate-400">Ký duyệt điện tử</p>
                      
                      {/* Approved Red Medical Stamp */}
                      <div className="h-12 flex items-center justify-center relative">
                        <div className="border-2 border-rose-600 rounded-lg px-2 py-0.5 text-[9px] font-extrabold text-rose-600 uppercase tracking-wider transform -rotate-6 bg-rose-50/70 shadow-2xs">
                          ĐÃ PHÊ DUYỆT<br/>BỆNH VIỆN SÔNG THƯƠNG
                        </div>
                      </div>
                      <p className="font-semibold text-slate-800 text-[11px]">TS. BS. Phạm Đức Thành</p>
                    </div>
                  </div>

                  {/* Document Footer */}
                  <div className="text-[10px] text-slate-400 pt-4 border-t flex items-center justify-between">
                    <span>Mã định danh Google Drive: {doc.driveFileId}</span>
                    <span>Trang 1 / 1 • Lưu trữ tại: Khoa Cận Lâm Sàng</span>
                  </div>
                </div>
              )}

              {/* ---------------- 3. WORD / DOCX VIEWER (EMBEDDED GOOGLE DRIVE PREVIEW OR CARD) ---------------- */}
              {doc.fileExtension === 'DOCX' && !matchedSop && (
                hasRealDriveId && driveEmbedUrl ? (
                  <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 overflow-hidden flex flex-col">
                    <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/90 border-b border-[#DFE7F0] dark:border-slate-700 flex items-center justify-between gap-3 text-xs flex-wrap">
                      <span className="font-bold text-[#155A9C] dark:text-blue-300">{doc.title}</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={driveFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 bg-white dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-semibold flex items-center gap-1 hover:bg-[#EAF4FF]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Mở trên Google Docs
                        </a>
                        <button
                          onClick={() => void handleDownload()}
                          className="px-3 py-1 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-semibold flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" /> Tải về
                        </button>
                      </div>
                    </div>
                    <iframe
                      src={driveEmbedUrl}
                      className="w-full min-h-[560px] h-[70vh] border-0 bg-white dark:bg-slate-900"
                      title={doc.title}
                      allow="autoplay"
                    />
                  </div>
                ) : (
                  <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 p-8 flex flex-col items-center text-center space-y-5">
                    <div className="w-16 h-16 rounded-xl bg-[#EAF4FF] dark:bg-blue-950/60 border border-[#1976D2]/25 dark:border-blue-800 flex items-center justify-center shadow-xs">
                      <FileText className="w-9 h-9 text-[#1976D2] dark:text-blue-400" />
                    </div>
                    <div className="space-y-1.5 max-w-lg">
                      <span className="px-3 py-1 bg-[#EAF4FF] dark:bg-blue-950/70 text-[#155A9C] dark:text-blue-300 text-[11px] font-bold rounded-full border border-[#1976D2]/20">
                        TÀI LIỆU MICROSOFT WORD (.DOCX)
                      </span>
                      <h3 className="text-lg font-bold text-[#263445] dark:text-slate-100 pt-1">
                        {doc.title}
                      </h3>
                      <p className="text-xs text-[#718096]">
                        Kích thước: {formatFileSize(doc.fileSize)} • Ngày tải lên: {doc.uploadDate} • Phiên bản: {doc.version}
                      </p>
                    </div>

                    <div className="p-4 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-xl border border-[#DFE7F0] dark:border-slate-700 text-xs text-[#718096] dark:text-slate-300 max-w-md w-full text-left space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[#718096]">Người phụ trách:</span>
                        <strong className="text-[#263445] dark:text-slate-200">{doc.owner}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#718096]">Loại hồ sơ:</span>
                        <strong className="text-[#263445] dark:text-slate-200">{doc.docType}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#718096]">Google Drive File ID:</span>
                        <span className="font-mono text-[10px] text-[#1976D2]">{doc.driveFileId}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => void handleDownload()}
                        className="px-5 py-2.5 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                      >
                        <Download className="w-4 h-4" /> Tải tệp DOCX về máy
                      </button>
                      {hasRealDriveId && (
                        <a
                          href={driveFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-[#EAF4FF] dark:hover:bg-slate-700 border border-[#DFE7F0] dark:border-slate-700 text-[#263445] dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-2xs"
                        >
                          <ExternalLink className="w-4 h-4" /> Mở trên Google Drive
                        </a>
                      )}
                    </div>
                  </div>
                )
              )}

              {/* ---------------- 2. EXCEL / XLSX SPREADSHEET VIEWER ---------------- */}
              {doc.fileExtension === 'XLSX' && (
                hasRealDriveId && driveEmbedUrl && !isPredefinedSop && doc.isUserUploaded ? (
                  <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 overflow-hidden flex flex-col">
                    <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/90 border-b border-[#DFE7F0] dark:border-slate-700 flex items-center justify-between gap-3 text-xs flex-wrap">
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">{doc.title}</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={driveFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 bg-white dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-semibold flex items-center gap-1 hover:bg-[#EAF4FF]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Mở trên Google Sheets
                        </a>
                        <button
                          onClick={() => void handleDownload()}
                          className="px-3 py-1 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-semibold flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" /> Tải về
                        </button>
                      </div>
                    </div>
                    <iframe
                      src={driveEmbedUrl}
                      className="w-full min-h-[560px] h-[70vh] border-0 bg-white dark:bg-slate-900"
                      title={doc.title}
                      allow="autoplay"
                    />
                  </div>
                ) : (
                <div 
                  className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 overflow-hidden flex flex-col text-xs"
                  style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                >
                  {/* Spreadsheet Header / Formula Bar */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-2 flex-1">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 px-2 py-1 bg-emerald-50 dark:bg-emerald-950 rounded border border-emerald-200 dark:border-emerald-800 text-[11px]">
                        fx
                      </span>
                      <input 
                        type="text" 
                        readOnly 
                        value={`=AVERAGE(F2:F11) => 99.4% (Tất cả chỉ số đạt chuẩn Ngoại kiểm ISO 15189)`} 
                        className="w-full px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-mono text-[11px]"
                      />
                    </div>

                    {/* Filter in sheet */}
                    <div className="relative w-48 sm:w-60">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tìm mẫu xét nghiệm..."
                        value={sheetSearch}
                        onChange={(e) => setSheetSearch(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                      />
                    </div>
                  </div>

                  {/* Spreadsheet Table Grid */}
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700 text-center w-10">#</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700">Mã Mẫu EQA</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700">Xét Nghiệm Sinh Hóa</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700">Đơn vị</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700">Khoảng chuẩn</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700">Giá trị đo</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700">Giá trị đích</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700">Z-Score</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-700 text-center">Đánh giá</th>
                          <th className="p-2">KTV phụ trách</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                        {filteredRows.map((row) => (
                          <tr key={row.rowNum} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="p-2 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-r border-slate-200 dark:border-slate-800">
                              {row.rowNum}
                            </td>
                            <td className="p-2 font-bold text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">
                              {row.sampleCode}
                            </td>
                            <td className="p-2 font-sans font-medium text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                              {row.testName}
                            </td>
                            <td className="p-2 text-slate-500 border-r border-slate-200 dark:border-slate-800">
                              {row.unit}
                            </td>
                            <td className="p-2 text-slate-500 border-r border-slate-200 dark:border-slate-800">
                              {row.referenceRange}
                            </td>
                            <td className="p-2 font-bold text-blue-600 dark:text-blue-400 border-r border-slate-200 dark:border-slate-800">
                              {row.measuredValue}
                            </td>
                            <td className="p-2 text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                              {row.targetValue}
                            </td>
                            <td className="p-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                              {row.zScore}
                            </td>
                            <td className="p-2 text-center border-r border-slate-200 dark:border-slate-800">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                {row.status}
                              </span>
                            </td>
                            <td className="p-2 font-sans text-slate-600 dark:text-slate-400">
                              {row.technician}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Sheet Tabs Bottom Bar */}
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center space-x-1">
                      {SAMPLE_EQA_SPREADSHEET.map(sheet => (
                        <button
                          key={sheet.id}
                          onClick={() => setActiveSheetTab(sheet.id)}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                            activeSheetTab === sheet.id
                              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          {sheet.name}
                        </button>
                      ))}
                    </div>

                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-2">
                      Hiển thị {filteredRows.length} / {currentSheet.rows.length} chỉ số
                    </span>
                  </div>
                </div>
                )
              )}

              {/* ---------------- 3. MEDICAL IMAGING (PNG / JPG / DICOM) ---------------- */}
              {(doc.fileExtension === 'PNG' || doc.fileExtension === 'JPG') && (
                <div className="w-full max-w-3xl flex flex-col items-center space-y-4">
                  {/* Radiology / Imaging Inspection Toolbar */}
                  <div className="p-2.5 bg-slate-900/90 text-white rounded-2xl shadow-xl flex items-center justify-between gap-3 text-xs flex-wrap w-full">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-300 text-[11px]">Công cụ CĐHA:</span>
                      
                      {/* Rotate */}
                      <button
                        onClick={() => setRotation(prev => (prev + 90) % 360)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1 transition-colors"
                        title="Xoay 90 độ"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Xoay ({rotation}°)</span>
                      </button>

                      {/* Invert Colors (X-ray Negative Mode) */}
                      <button
                        onClick={() => setInvertColors(!invertColors)}
                        className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors font-semibold ${
                          invertColors ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                        title="Chế độ âm bản phim chụp X-quang"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>{invertColors ? 'Đang bật Âm Bản' : 'Xem Âm Bản (X-Ray)'}</span>
                      </button>
                    </div>

                    {/* Brightness & Contrast Controls */}
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[10px] text-slate-400">Độ sáng:</span>
                        <input
                          type="range"
                          min="50"
                          max="150"
                          value={brightness}
                          onChange={(e) => setBrightness(Number(e.target.value))}
                          className="w-16 accent-blue-500"
                        />
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <Moon className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-[10px] text-slate-400">Tương phản:</span>
                        <input
                          type="range"
                          min="50"
                          max="200"
                          value={contrast}
                          onChange={(e) => setContrast(Number(e.target.value))}
                          className="w-16 accent-blue-500"
                        />
                      </div>

                      <button
                        onClick={handleResetImage}
                        className="text-[11px] text-slate-400 hover:text-white underline ml-1"
                      >
                        Đặt lại
                      </button>
                    </div>
                  </div>

                  {/* Medical Image Display Canvas */}
                  <div className="bg-slate-950 p-6 rounded-2xl shadow-2xl flex items-center justify-center min-h-[360px] max-h-[600px] w-full overflow-hidden relative">
                    <img
                      src={mediaSrcUrl}
                      alt={doc.title}
                      className="max-h-[500px] max-w-full rounded-xl object-contain transition-all duration-150"
                      style={{
                        transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                        filter: `${invertColors ? 'invert(1) ' : ''}brightness(${brightness}%) contrast(${contrast}%)`
                      }}
                      onError={(e) => {
                        const imgEl = e.target as HTMLImageElement;
                        if (hasRealDriveId && !imgEl.dataset.triedThumb) {
                          imgEl.dataset.triedThumb = '1';
                          imgEl.src = `https://drive.google.com/thumbnail?id=${doc.driveFileId}&sz=w1600`;
                          return;
                        }
                        imgEl.src = 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=800&auto=format&fit=crop&q=80';
                      }}
                    />

                    {/* Diagnostic watermark overlay */}
                    <div className="absolute bottom-3 left-3 text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-md backdrop-blur-xs border border-slate-800">
                      MODALITY: CR/DR • ZOOM: {zoomLevel}% • ROT: {rotation}°
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- 4. VIDEO (MP4) ---------------- */}
              {doc.fileExtension === 'MP4' && (
                <div className="w-full max-w-3xl bg-slate-950 p-6 rounded-3xl shadow-2xl flex flex-col items-center space-y-3">
                  {!realFileUrl && hasRealDriveId && driveEmbedUrl ? (
                    <iframe
                      src={driveEmbedUrl}
                      className="w-full h-[460px] rounded-2xl border-0 bg-black"
                      title={doc.title}
                      allow="autoplay"
                    />
                  ) : (
                    <video controls className="w-full max-h-[460px] rounded-2xl shadow-lg">
                      <source src={mediaSrcUrl} type="video/mp4" />
                      Trình duyệt không hỗ trợ phát Video trực tiếp.
                    </video>
                  )}
                  <p className="text-xs text-slate-400 text-center">
                    Video hướng dẫn quy trình thao tác và ghi nhận ca thực hành tại Khoa Cận Lâm Sàng
                  </p>
                </div>
              )}

              {/* ---------------- 5. AUDIO (MP3) ---------------- */}
              {doc.fileExtension === 'MP3' && (
                <div className="w-full max-w-lg bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center space-y-6 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Music className="w-10 h-10" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">{doc.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">Bản ghi âm giao ban chuyên môn / Hội chẩn ca bệnh</p>
                  </div>
                  <audio controls className="w-full">
                    <source src={mediaSrcUrl} type="audio/mpeg" />
                    Trình duyệt không hỗ trợ phát âm thanh.
                  </audio>
                </div>
              )}

              {/* ---------------- 6. ARCHIVE / OTHER ---------------- */}
              {['ZIP', 'RAR', 'PPTX'].includes(doc.fileExtension) && (
                hasRealDriveId && doc.fileExtension === 'PPTX' && driveEmbedUrl ? (
                  <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 overflow-hidden flex flex-col">
                    <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/90 border-b border-[#DFE7F0] dark:border-slate-700 flex items-center justify-between gap-3 text-xs flex-wrap">
                      <span className="font-bold text-orange-700 dark:text-orange-300">{doc.title}</span>
                      <button
                        onClick={() => void handleDownload()}
                        className="px-3 py-1 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-semibold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> Tải về
                      </button>
                    </div>
                    <iframe
                      src={driveEmbedUrl}
                      className="w-full min-h-[560px] h-[70vh] border-0 bg-white dark:bg-slate-900"
                      title={doc.title}
                      allow="autoplay"
                    />
                  </div>
                ) : (
                <div className="w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 text-center space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-[#EAF4FF] dark:bg-blue-950/60 text-[#1976D2] dark:text-blue-400 mx-auto flex items-center justify-center border border-[#1976D2]/20">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[#263445] dark:text-slate-100">{doc.title}</h4>
                    <p className="text-xs text-[#718096] mt-1">Tệp nén dữ liệu hoặc tệp trình chiếu đã được lưu trữ an toàn trên Google Drive</p>
                  </div>
                  <div className="pt-2 flex flex-col gap-2">
                    {hasRealDriveId && (
                      <a
                        href={driveFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2.5 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Mở tệp trên Google Drive</span>
                      </a>
                    )}
                    <button
                      onClick={() => void handleDownload()}
                      className="w-full py-2 bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#263445] dark:text-slate-200 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Tải tệp về máy tính</span>
                    </button>
                  </div>
                </div>
                )
              )}

            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE METADATA */}
          {activeTab === 'metadata' && (
            <div className="w-full max-w-2xl bg-white dark:bg-slate-900 p-5 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 space-y-5 text-xs">
              <div className="flex items-center space-x-3 pb-4 border-b border-[#DFE7F0] dark:border-slate-800">
                <div className="w-10 h-10 rounded-lg bg-[#EAF4FF] dark:bg-blue-950/60 text-[#1976D2] dark:text-blue-400 flex items-center justify-center font-bold border border-[#1976D2]/20">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#263445] dark:text-slate-100">
                    Chi tiết Lưu trữ & Đồng bộ Google Drive
                  </h4>
                  <p className="text-[#718096] text-[11px]">
                    Thông tin định danh và bảo mật tệp trên hạ tầng đám mây
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-[#718096] uppercase tracking-wider">Drive File ID:</span>
                  <div className="font-mono font-bold text-[#1976D2] dark:text-blue-400 break-all text-xs">
                    {doc.driveFileId || 'drive_sample_id'}
                  </div>
                </div>

                <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-[#718096] uppercase tracking-wider">Thư mục Drive:</span>
                  <div className="font-semibold text-[#263445] dark:text-slate-200 text-xs">
                    Khoa Cận Lâm Sàng - Bệnh viện Sông Thương
                  </div>
                  <div className="font-mono text-[10px] text-[#718096] break-all">
                    ID: {folderId}
                  </div>
                </div>

                <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-[#718096] uppercase tracking-wider">Mã băm Checksum (SHA-256):</span>
                  <div className="font-mono text-[#718096] dark:text-slate-300 break-all text-[11px]">
                    {doc.checksum || 'sha256_e4d909c290d0fb1ca068ffaddf22cbd0'}
                  </div>
                </div>

                <div className="p-3 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-lg border border-[#DFE7F0] dark:border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-[#718096] uppercase tracking-wider">Thời gian đồng bộ gần nhất:</span>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{doc.lastSyncedAt || doc.uploadDate || '2026-11-10 16:45'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold block">Tệp đã được bảo vệ & sao lưu đám mây</span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      Tự động phân quyền xem nội bộ theo chính sách bảo mật Google Workspace của bệnh viện.
                    </span>
                  </div>
                </div>
                {hasRealDriveId && (
                  <a
                    href={driveFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors"
                  >
                    Mở trên Drive
                  </a>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: VERSION HISTORY */}
          {activeTab === 'versions' && (
            <div className="w-full max-w-2xl bg-white dark:bg-slate-900 p-5 rounded-xl shadow-md border border-[#DFE7F0] dark:border-slate-800 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#DFE7F0] dark:border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-[#263445] dark:text-slate-100">Lịch sử Phiên bản & Nhật ký Cập nhật</h4>
                  <p className="text-[11px] text-[#718096]">Tất cả các bản soát xét đều được đánh dấu phiên bản trong danh mục hồ sơ</p>
                </div>
                {onOpenVersionModal && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenVersionModal(doc);
                    }}
                    className="px-3 py-1.5 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    + Tạo phiên bản mới
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {doc.versionHistory?.map((ver, idx) => (
                  <div 
                    key={idx}
                    className="p-3.5 bg-[#F4F7FB] dark:bg-slate-800/60 rounded-xl border border-[#DFE7F0] dark:border-slate-700/80 flex items-start justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#155A9C] dark:text-blue-400 bg-[#EAF4FF] dark:bg-blue-950 px-2 py-0.5 rounded text-[11px] border border-[#1976D2]/20">
                          {ver.version}
                        </span>
                        <span className="font-semibold text-[#263445] dark:text-slate-100">
                          {ver.note || 'Cập nhật phiên bản'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#718096]">
                        Cập nhật bởi: <strong className="text-[#263445] dark:text-slate-300">{ver.updatedBy}</strong> • Lúc: {ver.updatedAt}
                      </p>
                    </div>

                    <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-md text-[10px] font-bold">
                      {hasRealDriveId ? 'Đã lưu Drive' : 'Hồ sơ hệ thống'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ===================== MODAL FOOTER ===================== */}
        <div className="p-3.5 sm:p-4 border-t border-[#DFE7F0] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs shrink-0 flex-wrap gap-2">
          <div className="flex items-center space-x-2 text-[#718096] dark:text-slate-400">
            <span className="font-semibold">Chủ sở hữu:</span>
            <span className="text-[#263445] dark:text-slate-200 font-bold">{doc.owner}</span>
            <span>•</span>
            <span className="font-semibold">Dung lượng:</span>
            <span>{(doc.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
            <span>•</span>
            <span className="font-semibold">Hạn hiệu lực:</span>
            <span className={doc.isExpired ? 'text-rose-600 font-bold' : 'text-[#263445] dark:text-slate-300'}>
              {doc.expirationDate || 'Vô thời hạn'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => void handleDownload()}
              className="px-3 py-1.5 bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#263445] dark:text-slate-200 border border-[#DFE7F0] dark:border-slate-700 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải về</span>
            </button>

            {hasRealDriveId && (
              <a
                href={driveFileUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-1.5 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở trên Google Drive</span>
              </a>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
