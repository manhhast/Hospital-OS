import React, { useState, useMemo, useRef } from 'react';
import { 
  FolderOpen, Upload, Search, Filter, Eye, Download, Edit3, Trash2, 
  FileText, Image as ImageIcon, Music, Video, Archive, FileSpreadsheet, 
  AlertTriangle, CheckCircle2, History, X, Tag, ExternalLink, RefreshCw,
  Plus, Check
} from 'lucide-react';
import { DocumentItem, DocType, DocExtension, DocVersion } from '../../types/hospital';
import { storageService } from '../../services/storageService';

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
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [versionDoc, setVersionDoc] = useState<DocumentItem | null>(null);
  const [localUploadOpen, setLocalUploadOpen] = useState(false);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Form State
  const [newDocData, setNewDocData] = useState({
    title: '',
    docType: 'Quy trình SOP' as DocType,
    fileExtension: 'PDF' as DocExtension,
    expirationDate: '',
    tags: 'Cấp cứu, Pháp lý',
    note: ''
  });

  const currentUser = storageService.getCurrentUser();
  const showUploadModal = isUploadOpen || localUploadOpen;

  const handleCloseModal = () => {
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
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const processSelectedFile = (file: File) => {
    setSelectedFile(file);

    // Extract title & extension
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

    // Auto-detect docType if matching keywords
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

    // Read image preview if applicable
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview(e.target?.result as string);
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

  // Extension Icon Resolver
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

  // Upload New Document
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocData.title.trim()) {
      onShowToast('Lỗi', 'Vui lòng nhập tên tài liệu', 'error');
      return;
    }

    const fileUrl = filePreview || (selectedFile ? URL.createObjectURL(selectedFile) : 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
    const actualSize = selectedFile ? selectedFile.size : Math.floor(1000000 + Math.random() * 8000000);

    const createdDoc: DocumentItem = {
      id: `DOC-${Math.floor(2000 + Math.random() * 8000)}`,
      title: newDocData.title.toLowerCase().endsWith(`.${newDocData.fileExtension.toLowerCase()}`) 
        ? newDocData.title 
        : `${newDocData.title}.${newDocData.fileExtension.toLowerCase()}`,
      docType: newDocData.docType,
      fileExtension: newDocData.fileExtension,
      fileSize: actualSize,
      driveFileId: `drive_${Math.random().toString(36).substr(2, 9)}`,
      driveUrl: fileUrl,
      uploadDate: new Date().toISOString().split('T')[0],
      expirationDate: newDocData.expirationDate || null,
      isExpired: newDocData.expirationDate ? newDocData.expirationDate < new Date().toISOString().split('T')[0] : false,
      version: 'v1.0',
      versionHistory: [
        {
          version: 'v1.0',
          updatedAt: new Date().toISOString().split('T')[0],
          updatedBy: currentUser.name,
          note: selectedFile ? `Tải lên tệp gốc: ${selectedFile.name}` : 'Bản tải lên ban đầu',
          fileUrl: fileUrl
        }
      ],
      tags: newDocData.tags.split(',').map(t => t.trim()).filter(Boolean),
      owner: currentUser.name,
      note: newDocData.note
    };

    storageService.saveDocument(createdDoc);
    onDocumentsUpdated();
    onShowToast('Thành công', `Đã tải lên hồ sơ "${createdDoc.title}" vào Google Drive`, 'success');
    handleCloseModal();
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
      fileUrl: '#'
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
          filteredDocs.map((doc) => (
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
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-[10px] font-bold rounded-md">
                      {doc.version}
                    </span>
                    {doc.isExpired && (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-md">
                        Hết hạn
                      </span>
                    )}
                  </div>
                </div>

                <h4 
                  onClick={() => setPreviewDoc(doc)}
                  className="font-bold text-sm text-slate-800 dark:text-slate-100 mt-3 line-clamp-2 break-all hover:text-blue-600 cursor-pointer"
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
                <span>{doc.owner}</span>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="p-1.5 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    title="Xem trước"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setVersionDoc(doc)}
                    className="p-1.5 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    title="Lịch sử phiên bản"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      onConfirmAction(
                        'Xóa tài liệu',
                        `Bạn có chắc chắn muốn xóa tài liệu "${doc.title}"?`,
                        () => {
                          storageService.deleteDocument(doc.id);
                          onDocumentsUpdated();
                          onShowToast('Đã xóa', 'Đã xóa tài liệu khỏi hệ thống', 'warning');
                        },
                        true
                      );
                    }}
                    className="p-1.5 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* UPLOAD MODAL */}
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
                  <p className="text-[11px] text-slate-500">Lưu trữ và đồng bộ hồ sơ số hóa khoa Cận Lâm Sàng</p>
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

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              {/* Real Hidden File Input */}
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
                /* Selected File Card */
                <div className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl p-4 transition-all">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {filePreview ? (
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
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>Tải lên Drive</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-xs font-mono text-slate-400">{previewDoc.id}</span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{previewDoc.title}</h3>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Content Preview Player / Frame */}
            <div className="bg-slate-950 rounded-2xl p-6 text-white min-h-[260px] flex items-center justify-center">
              {previewDoc.fileExtension === 'MP4' ? (
                <video controls className="w-full max-h-72 rounded-xl">
                  <source src={previewDoc.driveUrl} type="video/mp4" />
                  Trình duyệt không hỗ trợ phát Video.
                </video>
              ) : previewDoc.fileExtension === 'MP3' ? (
                <audio controls className="w-full">
                  <source src={previewDoc.driveUrl} type="audio/mpeg" />
                </audio>
              ) : previewDoc.fileExtension === 'PNG' || previewDoc.fileExtension === 'JPG' ? (
                <img 
                  src={previewDoc.driveUrl} 
                  alt={previewDoc.title} 
                  referrerPolicy="no-referrer"
                  className="max-h-80 max-w-full rounded-xl object-contain shadow-md" 
                />
              ) : (
                <div className="text-center space-y-3">
                  <FileText className="w-16 h-16 text-blue-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">Xem trước tài liệu {previewDoc.fileExtension}</p>
                  <a
                    href={previewDoc.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700"
                  >
                    <span>Mở tệp trên Google Drive</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1 text-xs">
              <p><span className="font-semibold">Chủ sở hữu:</span> {previewDoc.owner}</p>
              <p><span className="font-semibold">Phiên bản hiện tại:</span> {previewDoc.version}</p>
              <p><span className="font-semibold">Ghi chú:</span> {previewDoc.note || 'Không có ghi chú'}</p>
            </div>
          </div>
        </div>
      )}

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
              + Tạo phiên bản mới ({parseFloat(versionDoc.version.replace('v', '')) + 0.1})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
