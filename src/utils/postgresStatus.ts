import type { UserRole } from '../types/hospital';

export interface DbStatusServerUser {
  id: string;
  name: string;
  role: string;
}

export type ParsedDbStatusResult =
  | {
      kind: 'unconfigured';
    }
  | {
      kind: 'configured';
      connected: boolean;
      bucketCount: number;
      reportArchiveCount: number;
      authenticated: boolean;
      sessionUser: DbStatusServerUser | null;
      errorMessage: string | null;
    }
  | {
      kind: 'http_error';
      errorMessage: string;
    };

export function parseDbStatusPayload(
  ok: boolean,
  httpStatus: number,
  payload: unknown
): ParsedDbStatusResult {
  if (!ok) {
    return {
      kind: 'http_error',
      errorMessage: `Máy chủ phản hồi mã lỗi HTTP ${httpStatus} khi kiểm tra PostgreSQL. Vui lòng thử kiểm tra lại.`
    };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      kind: 'http_error',
      errorMessage: 'Phản hồi trạng thái PostgreSQL không hợp lệ từ máy chủ.'
    };
  }

  const record = payload as Record<string, unknown>;
  if (record.configured === false) {
    return { kind: 'unconfigured' };
  }

  if (record.configured !== true) {
    return {
      kind: 'http_error',
      errorMessage: 'Không xác định được trạng thái cấu hình PostgreSQL từ máy chủ.'
    };
  }

  const connected = Boolean(record.connected);
  const rawSessionUser =
    record.sessionUser && typeof record.sessionUser === 'object' && !Array.isArray(record.sessionUser)
      ? (record.sessionUser as Record<string, unknown>)
      : null;

  return {
    kind: 'configured',
    connected,
    bucketCount: Number(record.bucketCount || 0),
    reportArchiveCount: Number(record.reportArchiveCount || 0),
    authenticated: Boolean(record.authenticated),
    sessionUser:
      rawSessionUser && typeof rawSessionUser.name === 'string'
        ? {
            id: String(rawSessionUser.id || ''),
            name: rawSessionUser.name,
            role: String((rawSessionUser.role as UserRole | string) || '')
          }
        : null,
    errorMessage:
      !connected && typeof record.error === 'string' && record.error.trim()
        ? record.error
        : !connected
        ? 'Không thể kết nối tới PostgreSQL.'
        : null
  };
}
