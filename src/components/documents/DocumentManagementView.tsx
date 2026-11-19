import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FolderOpen, Upload, Search, Eye, Download, Trash2,
  FileText, Image as ImageIcon, Music, Video, Archive, FileSpreadsheet,
  AlertTriangle, CheckCircle2, History, X, Tag, ExternalLink, RefreshCw,
  Check, HardDrive, ShieldCheck, Globe, Lock, LogOut
} from 'lucide-react';
import { DocumentItem, DocType, DocExtension, DocVersion } from '../../types/hospital';
import { storageService } from '../../services/storageService';
import { setCachedFileUrl } from '../../services/fileStorageCache';
import {
  googleDriveService,
  isValidGoogleDriveId,
  type GoogleDriveAuthState
} from '../../services/googleDriveService';
import { GoogleSignInButton } from '../common/GoogleSignInButton';
import { DriveSyncDiagnosticModal } from './DriveSyncDiagnosticModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';

interface DocumentManagementViewProps {
  documents: DocumentItem[];
  onDocumentsUpdated: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onConfirmAction: (title: string, message: string, onConfirm: () => void, isDanger?: boolean) => void;
  isUploadOpen: boolean;
  onCloseUploadModal: () => void;
  onOpenUploadModal?: () => void;
}

export const DocumentManagementView: React.FC<DocumentManagementViewProps> = ({
  documents,
  onDocumentsUpdated,
  onShowToast,
  onConfirmAction,
  isUploadOpen,
  onCloseUploadModal,
  onOpenUploadModal
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedExtension, setSelectedExtension] = useState<string>('ALL');

  // Modals
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [versionDoc, setVersionDoc] = useState<DocumentItem | null>(null);
  const [localUploadOpen, setLocalUploadOpen] = useState(false);

  // Google Drive Auth State
  const [driveAuth, setDriveAuth] = useState<GoogleDriveAuthState>(() => googleDriveService.getState());
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<DocumentItem | null>(null);
  const [isDeletingDocId, setIsDeletingDocId] = useState<string | null>(null);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);

  // Form State
  const [newDocData, setNewDocData] = useState({
    title: '',
    docType: 'Quy trình SOP' as DocType,
    fileExtension: 'PDF' as DocExtension,
    expirationDate: '',
    tags: 'Cấp cứu, Pháp lý',
    note: ''
  });

  // Google Drive Diagnostics Modal
  const [isDriveDiagOpen, setIsDriveDiagOpen] = useState(false);

  useEffect(() => {
    return googleDriveService.subscribe(() => {
      setDriveAuth(googleDriveService.getState());
    });
  }, []);

  const currentUser = storageService.getCurrentUser();
  const settings = storageService.getSettings();
  const rawFolderId = (settings.googleDriveFolderId || '').trim();
  const hasValidFolder = isValidGoogleDriveId(rawFolderId);
  const driveFolderUrl = hasValidFolder
    ? `https://drive.google.com/drive/folders/${rawFolderId}`
    : 'https://drive.google.com/drive/my-drive';
  const showUploadModal = isUploadOpen || localUploadOpen;
  const hasWriteSession = driveAuth.isSignedIn && driveAuth.hasAccessToken;
  const realDriveCount = useMemo(
    () => documents.filter((d) => isValidGoogleDriveId(d.driveFileId)).length,
    [documents]
  );

  const handleGoogleSignIn = async (): Promise<boolean> => {
    const res = await googleDriveService.signInWithGoogle();
    if (res.success) {
      onShowToast(
        'Đã đăng nhập Google',
        `Kết nối thành công tài khoản ${res.email || 'Google'}. Bạn đã có quyền tải lên và xóa tài liệu trên Google Drive.`,
        'success'
      );
      return true;
    }
    if (res.message) {
      onShowToast('Chưa hoàn tất đăng nhập Google', res.message, 'warning');
    }
    return false;
  };

  const handleGoogleSignOut = async () => {
    await googleDriveService.signOutGoogle();
    onShowToast(
      'Đã đăng xuất Google',
      'Hệ thống giữ quyền xem trước & tải về cho mọi người; cần đăng nhập lại khi tải lên hoặc xóa.',
      'info'
    );
  };

  const handleCloseModal = () => {
    if (isUploadingToDrive) return;
    setLocalUploadOpen(false);
    setSelectedFile(null);
    setFilePreview(null);
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onCloseUploadModal();
  };

  const handleOpenUpload = () => {
    if (onOpenUploadModal) {
      onOpenUploadModal();
    } else {
      setLocalUploadOpen(true);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const processSelectedFile = (file: File) => {
    setSelectedFile(file);

    const lastDotIndex = file.name.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? file.name.substring(0, lastDotIndex) : file.name;
    const rawExt = lastDotIndex > 0 ? file.name.substring(lastDotIndex + 1).toUpperCase() : '';

    let matchedExt: DocExtension = 'PDF';
    if (rawExt === 'PDF') matchedExt = 'PDF';
    else if (['DOC', 'DOCX'].includes(rawExt)) matchedExt = 'DOCX';
    else if (['XLS', 'XLSX', 'CSV'].includes(rawExt)) matchedExt = 'XLSX';
    else if (['PPT', 'PPTX'].includes(rawExt)) matchedExt = 'PPTX';
    else if (['PNG'].includes(rawExt)) matchedExt = 'PNG';
    else if (['JPG', 'JPEG', 'WEBP', 'SVG'].includes(rawExt)) matchedExt = 'JPG';
    else if (['ZIP'].includes(rawExt)) matchedExt = 'ZIP';
    else if (['RAR', '7Z', 'TAR'].includes(rawExt)) matchedExt = 'RAR';
    else if (['MP4', 'MOV', 'AVI', 'MKV', 'WEBM'].includes(rawExt)) matchedExt = 'MP4';
    else if (['MP3', 'WAV', 'M4A', 'OGG', 'AAC'].includes(rawExt)) matchedExt = 'MP3';

    let detectedType: DocType = newDocData.docType || 'Quy trình SOP';
    const lowerName = file.name.toLowerCase();
    if (lowerName.includes('sop') || lowerName.includes('quy trinh') || lowerName.includes('quy trình')) {
      detectedType = 'Quy trình SOP';
    } else if (lowerName.includes('bệnh án') || lowerName.includes('benh an') || lowerName.includes('hồ sơ') || lowerName.includes('bệnh nhân')) {
      detectedType = 'Hồ sơ bệnh án';
    } else if (lowerName.includes('kiểm chuẩn') || lowerName.includes('kiem chuan') || lowerName.includes('kiểm định') || lowerName.includes('hiệu chuẩn')) {
      detectedType = 'Phiếu kiểm chuẩn';
    } else if (lowerName.includes('chứng nhận') || lowerName.includes('chung nhan') || lowerName.includes('giấy phép') || lowerName.includes('cchn')) {
      detectedType = 'Giấy chứng nhận';
    } else if (lowerName.includes('báo cáo') || lowerName.includes('bao cao') || lowerName.includes('iso')) {
      detectedType = 'Báo cáo ISO';
    } else if (lowerName.includes('hợp đồng') || lowerName.includes('hop dong') || lowerName.includes('bảo trì')) {
      detectedType = 'Hợp đồng bảo trì';
    }

    setNewDocData(prev => ({
      ...prev,
      title: baseName,
      fileExtension: matchedExt,
      docType: detectedType
    }));

    // Read local preview for images/PDF in this browser session
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview((e.target?.result as string) || null);
      };
      reader.onerror = () => {
        try {
          setFilePreview(URL.createObjectURL(file));
        } catch {
          setFilePreview(null);
        }
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        doc.owner.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = selectedType === 'ALL' ||
        doc.docType === selectedType ||
        doc.docType.toLowerCase().includes(selectedType.toLowerCase());

      const matchesExt = selectedExtension === 'ALL' || doc.fileExtension === selectedExtension;

      return matchesSearch && matchesType && matchesExt;
    });
  }, [documents, searchQuery, selectedType, selectedExtension]);

  const getExtensionIcon = (ext: DocExtension) => {
    switch (ext) {
      case 'PDF': return <FileText className="w-8 h-8 text-rose-500" />;
      case 'DOCX': return <FileText className="w-8 h-8 text-blue-500" />;
      case 'XLSX': return <FileSpreadsheet className="w-8 h-8 text-emerald-500" />;
      case 'PPTX': return <FileText className="w-8 h-8 text-orange-500" />;
      case 'PNG':
      case 'JPG': return <ImageIcon className="w-8 h-8 text-purple-500" />;
      case 'MP3': return <Music className="w-8 h-8 text-amber-500" />;
      case 'MP4': return <Video className="w-8 h-8 text-indigo-500" />;
      case 'ZIP':
      case 'RAR': return <Archive className="w-8 h-8 text-slate-500" />;
      default: return <FileText className="w-8 h-8 text-slate-400" />;
    }
  };

  // Upload New Document to Google Drive (Requires Google Auth)
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleDriveService.hasActiveWriteSession()) {
      onShowToast(
        'Yêu cầu đăng nhập Google',
        'Vui lòng đăng nhập tài khoản Google trước khi tải hồ sơ lên Google Drive.',
        'warning'
      );
      return;
    }

    if (!selectedFile) {
      onShowToast('Chưa chọn tệp', 'Vui lòng chọn tệp tài liệu từ máy tính để tải lên Google Drive.', 'error');
      return;
    }

    if (!newDocData.title.trim()) {
      onShowToast('Lỗi', 'Vui lòng nhập tên tài liệu', 'error');
      return;
    }

    const finalTitle = newDocData.title.toLowerCase().endsWith(`.${newDocData.fileExtension.toLowerCase()}`)
      ? newDocData.title.trim()
      : `${newDocData.title.trim()}.${newDocData.fileExtension.toLowerCase()}`;

    setIsUploadingToDrive(true);
    try {
      const uploadResult = await googleDriveService.uploadFileToDrive({
        file: selectedFile,
        targetFileName: finalTitle,
        description: newDocData.note || `${newDocData.docType} - ${currentUser.name}`,
        configuredFolderId: rawFolderId
      });

      const newDocId = `DOC-${Date.now().toString().slice(-6)}`;
      if (filePreview) {
        setCachedFileUrl(newDocId, filePreview);
      }

      const createdDoc: DocumentItem = {
        id: newDocId,
        title: finalTitle,
        docType: newDocData.docType,
        fileExtension: newDocData.fileExtension,
        fileSize: uploadResult.sizeBytes,
        driveFileId: uploadResult.driveFileId,
        driveUrl: uploadResult.driveUrl,
        rawFileData: undefined,
        isUserUploaded: true,
        uploadDate: new Date().toISOString().split('T')[0],
        expirationDate: newDocData.expirationDate || null,
        isExpired: newDocData.expirationDate ? newDocData.expirationDate < new Date().toISOString().split('T')[0] : false,
        version: 'v1.0',
        syncStatus: 'synced',
        lastSyncedAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
        checksum: uploadResult.checksum,
        driveFolderId: uploadResult.folderUsed || undefined,
        versionHistory: [
          {
            version: 'v1.0',
            updatedAt: new Date().toISOString().split('T')[0],
            updatedBy: driveAuth.userEmail || currentUser.name,
            note: `Tải lên Google Drive (${selectedFile.name})`,
            fileUrl: uploadResult.driveUrl
          }
        ],
        tags: newDocData.tags.split(',').map(t => t.trim()).filter(Boolean),
        owner: currentUser.name,
        note: newDocData.note
      };

      storageService.saveDocument(createdDoc);
      onDocumentsUpdated();

      if (uploadResult.shareWarning) {
        onShowToast(
          'Đã tải lên Google Drive (Lưu ý phân quyền)',
          uploadResult.shareWarning,
          'warning'
        );
      } else {
        onShowToast(
          'Tải lên Google Drive thành công',
          `Đã lưu "${createdDoc.title}" lên Google Drive; mọi nhân viên đều có thể xem trước & tải về.`,
          'success'
        );
      }

      setLocalUploadOpen(false);
      setSelectedFile(null);
      setFilePreview(null);
      setNewDocData({
        title: '',
        docType: 'Quy trình SOP',
        fileExtension: 'PDF',
        expirationDate: '',
        tags: 'Cấp cứu, Pháp lý',
        note: ''
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      onCloseUploadModal();
    } catch (err) {
      onShowToast(
        'Lỗi tải lên Google Drive',
        err instanceof Error ? err.message : 'Không thể tải tệp lên Google Drive. Vui lòng thử lại.',
        'error'
      );
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // Download open to ALL users without Google Login
  const handleDownloadDoc = async (doc: DocumentItem) => {
    try {
      const outcome = await googleDriveService.downloadDocument(doc);
      if (outcome.method === 'metadata_fallback') {
        onShowToast(
          'Đã tải phiếu thông tin hồ sơ',
          `"${doc.title}" là hồ sơ mẫu chưa có tệp nhị phân trên Google Drive; đã tải bản tóm tắt thông tin.`,
          'info'
        );
      } else {
        onShowToast('Đang tải xuống', `Đang tải "${doc.title}" về máy tính...`, 'success');
      }
    } catch (err) {
      onShowToast(
        'Không thể tải xuống',
        err instanceof Error ? err.message : 'Vui lòng mở trực tiếp trên Google Drive để tải tệp.',
        'error'
      );
    }
  };

  // Trigger explicit confirmation dialog after verifying Google account login
  const triggerConfirmedDelete = (doc: DocumentItem) => {
    const isRealDrive = isValidGoogleDriveId(doc.driveFileId);
    onConfirmAction(
      'Xóa tài liệu trên Google Drive',
      isRealDrive
        ? `Bạn có chắc chắn muốn xóa tài liệu "${doc.title}"? Thao tác này sẽ xóa tệp trên Google Drive (${driveAuth.userEmail || 'Tài khoản Google'}) và gỡ khỏi danh mục hệ thống.`
        : `Bạn có chắc chắn muốn xóa hồ sơ "${doc.title}" khỏi danh mục hệ thống?`,
      async () => {
        setIsDeletingDocId(doc.id);
        try {
          const res = await googleDriveService.deleteFileFromDrive(doc.driveFileId);
          storageService.deleteDocument(doc.id);
          onDocumentsUpdated();
          onShowToast('Đã xóa tài liệu', res.note, 'warning');
        } catch (err) {
          onShowToast(
            'Không thể xóa tài liệu trên Google Drive',
            err instanceof Error ? err.message : 'Xóa tệp trên Google Drive thất bại.',
            'error'
          );
        } finally {
          setIsDeletingDocId(null);
        }
      },
      true
    );
  };

  const handleRequestDeleteDoc = (doc: DocumentItem) => {
    if (!googleDriveService.hasActiveWriteSession()) {
      onShowToast(
        'Yêu cầu đăng nhập Google',
        'Để xóa tài liệu lưu trên Google Drive, bạn cần đăng nhập tài khoản Google trước.',
        'warning'
      );
      setPendingDeleteDoc(doc);
      return;
    }
    triggerConfirmedDelete(doc);
  };

  // Add new version to existing document
  const handleAddVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionDoc) return;

    const currentVerNumber = parseFloat(versionDoc.version.replace('v', '')) || 1.0;
    const nextVer = `v${(currentVerNumber + 0.1).toFixed(1)}`;

    const newHistoryItem: DocVersion = {
      version: nextVer,
      updatedAt: new Date().toISOString().split('T')[0],
      updatedBy: currentUser.name,
      note: 'Cập nhật phiên bản mới',
      fileUrl: versionDoc.driveUrl || '#'
    };

    const updatedDoc: DocumentItem = {
      ...versionDoc,
      version: nextVer,
      versionHistory: [newHistoryItem, ...versionDoc.versionHistory]
    };

    storageService.saveDocument(updatedDoc);
    onDocumentsUpdated();
    onShowToast('Đã cập nhật', `Đã tăng phiên bản lên ${nextVer}`, 'success');
    setVersionDoc(null);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">

      {/* ===================== GOOGLE DRIVE STATUS & ACCESS POLICY BAR ===================== */}
      <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-emerald-50/80 dark:from-slate-900 dark:via-indigo-950/40 dark:to-slate-900 rounded-3xl p-4 sm:p-5 border border-blue-200/80 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">

        {/* Left: Drive Connection Info */}
        <div className="flex items-start sm:items-center space-x-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-md border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0">
            <svg className="w-7 h-7" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.25z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100">
                Kho Hồ Sơ & Quy Trình trên Google Drive
              </span>
              {hasWriteSession ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Google: {driveAuth.userEmail}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Chế độ Xem & Tải công khai</span>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                {documents.length} tài liệu ({realDriveCount} tệp trên Drive)
              </span>
              <span>•</span>
              <span className="text-blue-700 dark:text-blue-400 font-semibold">
                Mọi người có thể Xem trước &amp; Tải về · Cần đăng nhập Google để Tải lên hoặc Xóa
              </span>
            </p>
          </div>
        </div>

        {/* Right: Google Auth + Actions */}
        <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-2">
          {hasWriteSession ? (
            <button
              type="button"
              onClick={() => void handleGoogleSignOut()}
              className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors"
              title="Đăng xuất tài khoản Google"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất Google</span>
            </button>
          ) : (
            <GoogleSignInButton
              compact
              loading={driveAuth.isSigningIn}
              onClick={() => void handleGoogleSignIn()}
              label="Đăng nhập Google"
            />
          )}

          {/* Diagnostic Test Button */}
          <button
            onClick={() => setIsDriveDiagOpen(true)}
            className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl text-xs flex items-center gap-2 transition-all border border-indigo-200 dark:border-indigo-800 shadow-2xs hover:shadow-xs"
            title="Kiểm tra kết nối Google Drive"
          >
            <HardDrive className="w-4 h-4 text-indigo-500" />
            <span>Kiểm tra kết nối Drive</span>
          </button>

          {/* Open Folder URL */}
          <a
            href={driveFolderUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
            title="Mở thư mục lưu trữ trên Google Drive trong tab mới"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm tên hồ sơ, từ khóa, người tạo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          <div className="flex items-center space-x-3 overflow-x-auto text-xs">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <option value="ALL">Tất cả loại tài liệu</option>
              <option value="Quy trình SOP">Quy trình SOP</option>
              <option value="Hồ sơ bệnh án">Hồ sơ bệnh án</option>
              <option value="Phiếu kiểm chuẩn">Phiếu kiểm chuẩn</option>
              <option value="Giấy chứng nhận">Giấy chứng nhận</option>
              <option value="Báo cáo ISO">Báo cáo ISO</option>
              <option value="Hợp đồng bảo trì">Hợp đồng bảo trì</option>
              <option value="Khác">Khác</option>
            </select>

            <select
              value={selectedExtension}
              onChange={(e) => setSelectedExtension(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <option value="ALL">Tất cả định dạng</option>
              <option value="PDF">PDF</option>
              <option value="DOCX">DOCX</option>
              <option value="XLSX">XLSX</option>
              <option value="PPTX">PPTX</option>
              <option value="PNG">PNG Image</option>
              <option value="JPG">JPG Image</option>
              <option value="MP4">MP4 Video</option>
              <option value="MP3">MP3 Audio</option>
              <option value="ZIP">ZIP / RAR</option>
            </select>

            <button
              type="button"
              onClick={handleOpenUpload}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-xl flex items-center gap-1.5 shrink-0 transition-all shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Tải hồ sơ lên Drive</span>
            </button>
          </div>
        </div>
      </div>

      {/* Documents Grid View */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredDocs.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-700 dark:text-slate-300">Không có hồ sơ nào</h4>
            <p className="text-xs text-slate-400 mt-1">Hãy tải tài liệu đầu tiên lên hệ thống Google Drive.</p>
            <button
              type="button"
              onClick={handleOpenUpload}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Tải hồ sơ lên Google Drive ngay</span>
            </button>
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isRealDrive = isValidGoogleDriveId(doc.driveFileId);
            const isDeleting = isDeletingDocId === doc.id;
            return (
              <div
                key={doc.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 relative group"
              >
                {/* Top info */}
                <div>
                  <div className="flex items-start justify-between">
                    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      {getExtensionIcon(doc.fileExtension)}
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-[10px] font-bold rounded-md">
                          {doc.version}
                        </span>
                        {doc.isExpired && (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-md">
                            Hết hạn
                          </span>
                        )}
                      </div>
                      {isRealDrive ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                          <Check className="w-2.5 h-2.5 text-emerald-500 stroke-[3]" />
                          Google Drive
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          Mẫu hệ thống
                        </span>
                      )}
                    </div>
                  </div>

                  <h4
                    onClick={() => setPreviewDoc(doc)}
                    className="font-bold text-sm text-slate-800 dark:text-slate-100 mt-3 line-clamp-2 break-all hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                    title={doc.title}
                  >
                    {doc.title}
                  </h4>

                  <p className="text-xs text-slate-400 mt-1">{doc.docType} | {(doc.fileSize / (1024 * 1024)).toFixed(1)} MB</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {doc.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] rounded-md flex items-center">
                        <Tag className="w-2.5 h-2.5 mr-1 text-slate-400" /> {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="truncate max-w-[85px]" title={doc.owner}>{doc.owner}</span>

                  <div className="flex items-center space-x-1">
                    {/* Open Read: Preview */}
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="p-1.5 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="Xem trước tài liệu"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Open Read: Direct Download without Google Login */}
                    <button
                      type="button"
                      onClick={() => void handleDownloadDoc(doc)}
                      className="p-1.5 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="Tải tài liệu về máy (không cần đăng nhập Google)"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {isRealDrive && (
                      <a
                        href={googleDriveService.getViewUrl(doc)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Mở tệp trực tiếp trên Google Drive"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setVersionDoc(doc)}
                      className="p-1.5 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="Lịch sử phiên bản"
                    >
                      <History className="w-4 h-4" />
                    </button>

                    {/* Delete: Requires Google Account Sign-In */}
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleRequestDeleteDoc(doc)}
                      className="p-1.5 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                      title={hasWriteSession ? 'Xóa tài liệu trên Google Drive' : 'Cần đăng nhập Google để xóa tài liệu'}
                    >
                      {isDeleting ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* UPLOAD MODAL (GATED BY GOOGLE SIGN-IN) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Tải hồ sơ lên Google Drive</h3>
                  <p className="text-[11px] text-slate-500">Lưu trữ an toàn trên Google Drive Khoa Cận Lâm Sàng</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Google Auth Gate Banner */}
            {!hasWriteSession ? (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-amber-900 dark:text-amber-200">
                      Cần đăng nhập tài khoản Google để tải tài liệu lên Google Drive
                    </p>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                      Sau khi tải lên thành công, tất cả nhân viên khác trong hệ thống có thể <strong>xem trước và tải về</strong> mà không cần đăng nhập Google.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <GoogleSignInButton
                    loading={driveAuth.isSigningIn}
                    onClick={() => void handleGoogleSignIn()}
                    label="Đăng nhập Google để Tải lên"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-800 dark:text-emerald-200 truncate">
                    Đang kết nối Google: <strong>{driveAuth.userEmail}</strong>
                  </span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0 ml-2">
                  Sẵn sàng tải lên
                </span>
              </div>
            )}

            <form onSubmit={(e) => void handleUploadSubmit(e)} className="space-y-4 text-xs">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip,.rar,.mp4,.mp3,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*,video/*,audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    processSelectedFile(file);
                  }
                }}
              />

              {/* Dropzone Area */}
              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      processSelectedFile(file);
                    }
                  }}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center space-y-3 cursor-pointer transition-all duration-200 ${
                    isDragging
                      ? 'border-blue-500 bg-blue-100/70 dark:bg-blue-900/40 ring-4 ring-blue-500/20 scale-[1.01]'
                      : 'border-blue-200 hover:border-blue-500 bg-blue-50/50 hover:bg-blue-50/80 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
                    <Upload className={`w-6 h-6 transition-transform duration-200 ${isDragging ? 'scale-125 -translate-y-1' : ''}`} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      Kéo thả file vào đây hoặc <span className="text-blue-600 dark:text-blue-400 underline">bấm chọn tệp</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Hỗ trợ: PDF, DOCX, XLSX, PPTX, PNG, JPG, ZIP, MP4, MP3
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-xl text-xs transition-all shadow-xs inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn tệp từ máy tính</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl p-4 transition-all">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {filePreview && selectedFile.type.startsWith('image/') ? (
                        <img
                          src={filePreview}
                          alt="Preview"
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-xl object-cover border border-emerald-200 shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
                          {getExtensionIcon(newDocData.fileExtension)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Đã chọn tệp
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {formatFileSize(selectedFile.size)}
                          </span>
                        </div>
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-xs truncate mt-0.5" title={selectedFile.name}>
                          {selectedFile.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold transition-colors"
                      >
                        Đổi tệp
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setFilePreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="p-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                        title="Gỡ bỏ tệp"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Tên hồ sơ / tài liệu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Quy trình báo động đỏ Code Red..."
                  value={newDocData.title}
                  onChange={(e) => setNewDocData({ ...newDocData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Loại tài liệu</label>
                  <select
                    value={newDocData.docType}
                    onChange={(e) => setNewDocData({ ...newDocData, docType: e.target.value as DocType })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="Quy trình SOP">Quy trình SOP</option>
                    <option value="Hồ sơ bệnh án">Hồ sơ bệnh án</option>
                    <option value="Phiếu kiểm chuẩn">Phiếu kiểm chuẩn</option>
                    <option value="Giấy chứng nhận">Giấy chứng nhận</option>
                    <option value="Báo cáo ISO">Báo cáo ISO</option>
                    <option value="Hợp đồng bảo trì">Hợp đồng bảo trì</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Định dạng tệp</label>
                  <select
                    value={newDocData.fileExtension}
                    onChange={(e) => setNewDocData({ ...newDocData, fileExtension: e.target.value as DocExtension })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="PDF">PDF</option>
                    <option value="DOCX">DOCX (Word)</option>
                    <option value="XLSX">XLSX (Excel)</option>
                    <option value="PPTX">PPTX (PowerPoint)</option>
                    <option value="PNG">PNG Image</option>
                    <option value="JPG">JPG Image</option>
                    <option value="MP4">MP4 Video</option>
                    <option value="MP3">MP3 Audio</option>
                    <option value="ZIP">ZIP / RAR Archive</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Ngày hết hạn (Nếu có)</label>
                  <input
                    type="date"
                    value={newDocData.expirationDate}
                    onChange={(e) => setNewDocData({ ...newDocData, expirationDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Từ khóa / Nhãn</label>
                  <input
                    type="text"
                    placeholder="VD: Cấp cứu, Quy chuẩn, CLS..."
                    value={newDocData.tags}
                    onChange={(e) => setNewDocData({ ...newDocData, tags: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Ghi chú bổ sung</label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú tóm tắt về nội dung tài liệu..."
                  value={newDocData.note}
                  onChange={(e) => setNewDocData({ ...newDocData, note: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isUploadingToDrive}
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!hasWriteSession || !selectedFile || isUploadingToDrive}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  {isUploadingToDrive ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang tải lên Drive...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Tải lên Google Drive</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GOOGLE AUTH GATE MODAL WHEN DELETING WITHOUT GOOGLE LOGIN */}
      {pendingDeleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Cần đăng nhập Google để Xóa tài liệu
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Bảo vệ dữ liệu Google Drive trước khi xóa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteDoc(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Để xóa tài liệu <strong className="text-slate-800 dark:text-slate-100">"{pendingDeleteDoc.title}"</strong> khỏi Google Drive, bạn cần đăng nhập bằng tài khoản Google có quyền quản lý tệp.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPendingDeleteDoc(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Hủy
              </button>
              <GoogleSignInButton
                loading={driveAuth.isSigningIn}
                onClick={() => {
                  const target = pendingDeleteDoc;
                  void handleGoogleSignIn().then((ok) => {
                    if (ok) {
                      setPendingDeleteDoc(null);
                      triggerConfirmedDelete(target);
                    }
                  });
                }}
                label="Đăng nhập Google & Tiếp tục"
              />
            </div>
          </div>
        </div>
      )}

      {/* ENHANCED DOCUMENT PREVIEW MODAL */}
      <DocumentPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onShowToast={onShowToast}
        onOpenVersionModal={(d) => setVersionDoc(d)}
        onDocumentsUpdated={onDocumentsUpdated}
      />

      {/* GOOGLE DRIVE CONNECTION & DIAGNOSTICS MODAL */}
      <DriveSyncDiagnosticModal
        isOpen={isDriveDiagOpen}
        onClose={() => setIsDriveDiagOpen(false)}
        documents={documents}
        onDocumentsUpdated={onDocumentsUpdated}
        onShowToast={onShowToast}
      />

      {/* VERSION HISTORY MODAL */}
      {versionDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Lịch sử phiên bản {versionDoc.title}</h3>
              <button onClick={() => setVersionDoc(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {versionDoc.versionHistory.map((ver, idx) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{ver.version}</span>
                    <p className="text-slate-600 dark:text-slate-300 mt-0.5">{ver.note}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Bởi {ver.updatedBy} lúc {ver.updatedAt}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddVersion}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl transition-colors"
            >
              + Tạo phiên bản mới ({(parseFloat(versionDoc.version.replace('v', '')) + 0.1).toFixed(1)})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
