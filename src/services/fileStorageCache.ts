// Bộ nhớ đệm lưu trữ tệp tin tải lên (PDF, DOCX, XLSX, Images)
// Đảm bảo tệp tải lên hiển thị chính xác 100% trong phiên làm việc mà không bị giới hạn bởi localStorage

const MAX_MEMORY_FILE_CACHE = 25;
export const fileDataCache = new Map<string, string>();

function setBoundedMemoryCache(docId: string, dataUrl: string): void {
  if (fileDataCache.has(docId)) {
    fileDataCache.delete(docId);
  }
  fileDataCache.set(docId, dataUrl);
  while (fileDataCache.size > MAX_MEMORY_FILE_CACHE) {
    const oldestKey = fileDataCache.keys().next().value;
    if (oldestKey === undefined) break;
    fileDataCache.delete(oldestKey);
  }
}

export const getCachedFileUrl = (docId: string, fallbackUrl?: string): string => {
  if (fileDataCache.has(docId)) {
    const val = fileDataCache.get(docId)!;
    fileDataCache.delete(docId);
    fileDataCache.set(docId, val);
    return val;
  }
  try {
    const sessionData = sessionStorage.getItem(`file_cache_${docId}`);
    if (sessionData) {
      setBoundedMemoryCache(docId, sessionData);
      return sessionData;
    }
  } catch {
    // Ignore storage errors
  }
  return fallbackUrl || '';
};

export const setCachedFileUrl = (docId: string, dataUrl: string): void => {
  if (!docId || !dataUrl) return;
  setBoundedMemoryCache(docId, dataUrl);
  try {
    sessionStorage.setItem(`file_cache_${docId}`, dataUrl);
  } catch {
    // If sessionStorage quota exceeded, bounded memory cache still holds recent files
  }
};
