// Bộ nhớ đệm lưu trữ tệp tin tải lên (PDF, DOCX, XLSX, Images)
// Đảm bảo tệp tải lên hiển thị chính xác 100% trong phiên làm việc mà không bị giới hạn bởi localStorage

export const fileDataCache = new Map<string, string>();

export const getCachedFileUrl = (docId: string, fallbackUrl?: string): string => {
  if (fileDataCache.has(docId)) {
    return fileDataCache.get(docId)!;
  }
  try {
    const sessionData = sessionStorage.getItem(`file_cache_${docId}`);
    if (sessionData) {
      fileDataCache.set(docId, sessionData);
      return sessionData;
    }
  } catch (e) {
    // Ignore storage errors
  }
  return fallbackUrl || '';
};

export const setCachedFileUrl = (docId: string, dataUrl: string): void => {
  if (!docId || !dataUrl) return;
  fileDataCache.set(docId, dataUrl);
  try {
    sessionStorage.setItem(`file_cache_${docId}`, dataUrl);
  } catch (e) {
    // If sessionStorage quota exceeded, memory cache still holds the data
  }
};
