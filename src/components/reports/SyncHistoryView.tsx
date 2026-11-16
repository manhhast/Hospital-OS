import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  CloudOff,
  Database,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { reportArchiveService } from '../../services/reportArchiveService';
import { firebaseSyncService, type FirebaseCloudState } from '../../services/firebaseSyncService';
import { runThreeDaySmartSync } from '../../services/googleSheetReportService';
import type {
  SyncHistoryDiscrepancyItem,
  SyncHistoryEntry,
  SyncHistoryStatus
} from '../../types/hospital';

interface SyncHistoryViewProps {
  onOpenRangeAudit?: (startDate?: string, endDate?: string, year?: number) => void;
  onShowToast?: (
    title: string,
    message: string,
    type?: 'success' | 'error' | 'warning' | 'info'
  ) => void;
  compact?: boolean;
}

export const SyncHistoryView: React.FC<SyncHistoryViewProps> = ({
  onOpenRangeAudit,
  onShowToast,
  compact = false
}) => {
  const [entries, setEntries] = useState<SyncHistoryEntry[]>(() =>
    storageService.getSyncHistory()
  );
  const [cloudState, setCloudState] = useState<FirebaseCloudState>(() =>
    firebaseSyncService.getState()
  );
  const [filterStatus, setFilterStatus] = useState<'all' | SyncHistoryStatus>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const initial = storageService.getSyncHistory();
    const map: Record<string, boolean> = {};
    initial.slice(0, 2).forEach((e) => {
      map[e.id] = true;
    });
    initial.forEach((e) => {
      if (e.status === 'discrepancy_alert') map[e.id] = true;
    });
    return map;
  });
  const [isRunningThreeDay, setIsRunningThreeDay] = useState<boolean>(false);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);

  useEffect(() => {
    const unsubStorage = storageService.subscribe(() => {
      setEntries(storageService.getSyncHistory());
    });
    const unsubFirebase = firebaseSyncService.subscribe(() => {
      setCloudState(firebaseSyncService.getState());
    });
    return () => {
      unsubStorage();
      unsubFirebase();
    };
  }, []);

  const stats = useMemo(() => {
    let totalAutoWritten = 0;
    let totalPendingDiscrepancies = 0;
    let totalRunsWithAlert = 0;

    for (const entry of entries) {
      totalAutoWritten += entry.autoWrittenCount || 0;
      const pendingInEntry = (entry.discrepancies || []).filter(
        (d) => !d.resolutionStatus || d.resolutionStatus === 'pending'
      ).length;
      totalPendingDiscrepancies += pendingInEntry;
      if (pendingInEntry > 0 || entry.status === 'discrepancy_alert') {
        totalRunsWithAlert += 1;
      }
    }

    return {
      totalRuns: entries.length,
      totalAutoWritten,
      totalPendingDiscrepancies,
      totalRunsWithAlert
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filterStatus !== 'all' && entry.status !== filterStatus) return false;
      if (!q) return true;
      if (
        entry.summary.toLowerCase().includes(q) ||
        entry.dateRangeLabel.toLowerCase().includes(q) ||
        entry.displayTime.toLowerCase().includes(q) ||
        entry.performedBy.toLowerCase().includes(q)
      ) {
        return true;
      }
      const matchDisc = (entry.discrepancies || []).some(
        (d) =>
          d.serviceName.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.dateLabel.toLowerCase().includes(q)
      );
      const matchAuto = (entry.autoWrittenSamples || []).some(
        (s) =>
          s.serviceName.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.dateLabel.toLowerCase().includes(q)
      );
      return matchDisc || matchAuto;
    });
  }, [entries, filterStatus, searchTerm]);

  const handleRunThreeDayNow = async () => {
    setIsRunningThreeDay(true);
    try {
      const outcome = await runThreeDaySmartSync('manual_3d');
      if (!outcome.ran && outcome.reason === 'no_sheet_configured') {
        onShowToast?.(
          'Chưa cấu hình Google Sheet',
          'Vui lòng vào Menu Cấu Hình → Cấu Hình Hệ Thống để gắn ID/URL Google Sheet cho năm báo cáo.',
          'warning'
        );
        return;
      }

      if (outcome.entry) {
        setExpandedIds((prev) => ({ ...prev, [outcome.entry!.id]: true }));
      }

      if (outcome.alertDiscrepancies.length > 0) {
        onShowToast?.(
          'Phát hiện sai lệch 3 ngày gần nhất',
          `Có ${outcome.alertDiscrepancies.length} mục sai lệch giữa Firebase và Google Sheet (đã giữ nguyên dữ liệu và lưu vào Lịch sử đồng bộ).`,
          'warning'
        );
      } else if (outcome.autoWrittenCount > 0) {
        onShowToast?.(
          'Đồng bộ 3 ngày gần nhất thành công',
          `Đã tự động ghi ${outcome.autoWrittenCount} ô mới từ Google Sheet vào Firebase.`,
          'success'
        );
      } else if (outcome.reason === 'sheet_unreachable') {
        onShowToast?.(
          'Không đọc được tab Google Sheet',
          'Kiểm tra lại kết nối hoặc cấu hình Google Sheet 3 ngày gần nhất.',
          'error'
        );
      } else {
        onShowToast?.(
          'Dữ liệu 3 ngày gần nhất khớp hoàn toàn',
          'Không phát hiện sai lệch giữa Firebase và Google Sheet.',
          'info'
        );
      }
    } finally {
      setIsRunningThreeDay(false);
    }
  };

  const handleResolveDiscrepancy = async (
    entryId: string,
    disc: SyncHistoryDiscrepancyItem,
    action: 'updated_from_sheet' | 'kept_system'
  ) => {
    const opKey = `${entryId}__${disc.id}`;
    setResolvingKey(opKey);
    try {
      if (action === 'updated_from_sheet') {
        const updatedMonthItems = reportArchiveService.applyAuditDiscrepanciesForMonth(
          disc.year,
          disc.monthKey,
          [
            {
              id: disc.id,
              year: disc.year,
              monthKey: disc.monthKey,
              day: disc.day,
              dateLabel: disc.dateLabel,
              category: disc.category,
              serviceName: disc.serviceName,
              type: disc.type,
              systemValue: { bh: disc.systemBh, nd: disc.systemNd },
              sheetValue: { bh: disc.sheetBh, nd: disc.sheetNd },
              isManualLocked: Boolean(disc.isManualLocked)
            }
          ]
        );
        const fbRes = await firebaseSyncService.forceSaveReportMonthToCloud(
          disc.year,
          disc.monthKey,
          updatedMonthItems
        );
        storageService.updateSyncHistoryDiscrepancyStatus(entryId, disc.id, 'updated_from_sheet');
        onShowToast?.(
          'Đã cập nhật theo Google Sheet',
          `${disc.serviceName} (${disc.dateLabel}): BH ${disc.sheetBh}, ND ${disc.sheetNd}. ${
            fbRes.savedOnFirebase ? 'Đã lưu cố định lên Firebase Cloud.' : 'Đã lưu cục bộ.'
          }`,
          'success'
        );
      } else {
        storageService.updateSyncHistoryDiscrepancyStatus(entryId, disc.id, 'kept_system');
        onShowToast?.(
          'Đã giữ nguyên dữ liệu Firebase',
          `Giữ nguyên ${disc.serviceName} (${disc.dateLabel}): BH ${disc.systemBh}, ND ${disc.systemNd}.`,
          'info'
        );
      }
    } catch (err) {
      onShowToast?.(
        'Lỗi xử lý sai lệch',
        err instanceof Error ? err.message : String(err),
        'error'
      );
    } finally {
      setResolvingKey(null);
    }
  };

  const triggerLabel = (trigger: SyncHistoryEntry['trigger']) => {
    if (trigger === 'startup_3d_auto') {
      return {
        text: 'Tự động khi khởi động (3 ngày gần nhất)',
        cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
      };
    }
    if (trigger === 'manual_3d') {
      return {
        text: 'Kiểm tra thủ công (3 ngày gần nhất)',
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
      };
    }
    return {
      text: 'Rà soát số liệu (tùy chọn nhiều ngày)',
      cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
    };
  };

  const statusBadge = (entry: SyncHistoryEntry) => {
    const pendingCount = (entry.discrepancies || []).filter(
      (d) => !d.resolutionStatus || d.resolutionStatus === 'pending'
    ).length;

    if (entry.status === 'error') {
      return {
        text: 'Lỗi kết nối / đọc Sheet',
        cls: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-800',
        Icon: AlertTriangle
      };
    }
    if (pendingCount > 0 || entry.status === 'discrepancy_alert') {
      return {
        text: `Cảnh báo ${pendingCount || entry.discrepancyCount} sai lệch`,
        cls: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800',
        Icon: AlertTriangle
      };
    }
    if (entry.autoWrittenCount > 0 || entry.updatedFromSheetCount > 0) {
      return {
        text: `Đã ghi Firebase (${entry.autoWrittenCount + entry.updatedFromSheetCount} ô)`,
        cls: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800',
        Icon: CheckCircle2
      };
    }
    return {
      text: 'Khớp hoàn toàn',
      cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      Icon: ShieldCheck
    };
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`${compact ? 'text-base' : 'text-lg'} font-extrabold text-slate-900 dark:text-white`}>
                Lịch Sử Đồng Bộ &amp; Rà Soát Số Liệu
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Ghi nhận tự động khi khởi động (rà soát <strong>3 ngày gần nhất</strong>: tự điền ô trống lên Firebase, cảnh báo nếu sai lệch hoặc Sheet thiếu) và toàn bộ lịch sử <strong>Rà soát số liệu</strong> thủ công.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleRunThreeDayNow()}
              disabled={isRunningThreeDay}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningThreeDay ? 'animate-spin' : ''}`} />
              <span>{isRunningThreeDay ? 'Đang kiểm tra 3 ngày...' : 'Kiểm tra 3 ngày gần nhất'}</span>
            </button>

            {onOpenRangeAudit && (
              <button
                type="button"
                onClick={() => onOpenRangeAudit()}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Rà soát nhiều ngày hơn</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-300 dark:border-slate-700">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              Tổng lượt kiểm tra
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
              {stats.totalRuns}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800">
            <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Đã tự động ghi Firebase
            </div>
            <div className="text-xl font-black text-emerald-800 dark:text-emerald-200 mt-1 tabular-nums">
              {stats.totalAutoWritten} <span className="text-xs font-bold">ô</span>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              stats.totalPendingDiscrepancies > 0
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700'
            }`}
          >
            <div
              className={`text-[11px] font-bold flex items-center gap-1.5 ${
                stats.totalPendingDiscrepancies > 0
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Sai lệch chờ xử lý
            </div>
            <div
              className={`text-xl font-black mt-1 tabular-nums ${
                stats.totalPendingDiscrepancies > 0
                  ? 'text-amber-900 dark:text-amber-200'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {stats.totalPendingDiscrepancies} <span className="text-xs font-bold">mục</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              {cloudState.status === 'synced' ? (
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <CloudOff className="w-3.5 h-3.5 text-amber-600" />
              )}
              Đồng bộ Lịch sử lên Cloud
            </div>
            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100 mt-1.5 truncate">
              {cloudState.status === 'synced'
                ? `Đã bật (${cloudState.userEmail})`
                : 'Đang lưu cục bộ (chưa đăng nhập Firebase)'}
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
          {(
            [
              { id: 'all', label: 'Tất cả' },
              { id: 'discrepancy_alert', label: 'Có sai lệch' },
              { id: 'success', label: 'Đã ghi / Cập nhật' },
              { id: 'no_change', label: 'Khớp hoàn toàn' },
              { id: 'error', label: 'Lỗi đọc Sheet' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kỹ thuật, ngày hoặc nội dung..."
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl outline-none text-slate-800 dark:text-slate-100 w-full md:w-64"
          />
        </div>
      </div>

      {/* History Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 p-10 text-center space-y-2 shadow-sm">
          <History className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Chưa có bản ghi lịch sử đồng bộ phù hợp
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mỗi lần khởi động ứng dụng kiểm tra 3 ngày gần nhất hoặc khi bạn dùng nút Rà soát số liệu, kết quả sẽ được lưu tự động tại đây và đồng bộ lên Firebase.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const isExpanded = Boolean(expandedIds[entry.id]);
            const trg = triggerLabel(entry.trigger);
            const st = statusBadge(entry);
            const StatusIcon = st.Icon;
            const discrepancies = entry.discrepancies || [];
            const autoSamples = entry.autoWrittenSamples || [];
            const pendingCount = discrepancies.filter(
              (d) => !d.resolutionStatus || d.resolutionStatus === 'pending'
            ).length;

            return (
              <div
                key={entry.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 shadow-sm overflow-hidden"
              >
                {/* Row Summary Header */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedIds((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))
                  }
                  className="w-full p-4 text-left flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">
                        {entry.displayTime}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${trg.cls}`}>
                        {trg.text}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-bold tabular-nums">
                        Khoảng: {entry.dateRangeLabel}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 ${st.cls}`}>
                        <StatusIcon className="w-3 h-3" />
                        {st.text}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                      {entry.summary}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Người thực hiện: <strong>{entry.performedBy}</strong></span>
                      <span>Đã rà soát: <strong>{entry.checkedCellsCount.toLocaleString('vi-VN')}</strong> ô</span>
                      <span className={entry.savedOnFirebase ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                        {entry.firebaseNote || (entry.savedOnFirebase ? 'Đã lưu Firebase' : 'Lưu cục bộ')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {(discrepancies.length > 0 || autoSamples.length > 0) && (
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        {isExpanded ? 'Thu gọn chi tiết' : `Xem chi tiết (${discrepancies.length + autoSamples.length})`}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-slate-300 dark:border-slate-700 space-y-4 bg-slate-50/70 dark:bg-slate-950/30">
                    {/* Discrepancy Items Table */}
                    {discrepancies.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-xs font-extrabold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>
                              Chi tiết sai lệch phát hiện ({discrepancies.length} mục
                              {pendingCount > 0 ? ` · ${pendingCount} mục đang chờ xác nhận` : ' · Đã xử lý xong'})
                            </span>
                          </h4>
                          {onOpenRangeAudit && entry.startDate && entry.endDate && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenRangeAudit(
                                  entry.startDate,
                                  entry.endDate,
                                  parseInt(entry.startDate.slice(0, 4), 10)
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Search className="w-3 h-3" />
                              <span>Mở Rà soát số liệu khoảng này</span>
                            </button>
                          )}
                        </div>

                        <div className="overflow-x-auto border-[1.5px] border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 shadow-2xs">
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold border-b-2 border-slate-300 dark:border-slate-600">
                              <tr>
                                <th className="p-2.5 border-r border-slate-300 dark:border-slate-600">Ngày</th>
                                <th className="p-2.5 border-r border-slate-300 dark:border-slate-600">Kỹ thuật / Bộ phận</th>
                                <th className="p-2.5 border-r border-slate-300 dark:border-slate-600">Trên Firebase</th>
                                <th className="p-2.5 border-r border-slate-300 dark:border-slate-600">Trên Google Sheet</th>
                                <th className="p-2.5 border-r border-slate-300 dark:border-slate-600">Tình trạng</th>
                                <th className="p-2.5 text-right">Quyết định cập nhật</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-300 dark:divide-slate-700">
                              {discrepancies.map((disc) => {
                                const isPending = !disc.resolutionStatus || disc.resolutionStatus === 'pending';
                                const isBusy = resolvingKey === `${entry.id}__${disc.id}`;
                                const typeInfo =
                                  disc.type === 'cleared_on_sheet'
                                    ? {
                                        label: 'Firebase có · Sheet trống',
                                        cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                                      }
                                    : disc.type === 'value_changed'
                                      ? {
                                          label: 'Khác số liệu',
                                          cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                                        }
                                      : {
                                          label: 'Sheet bổ sung',
                                          cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                                        };

                                return (
                                  <tr key={disc.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                                    <td className="p-2.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap tabular-nums border-r border-slate-300 dark:border-slate-700">
                                      {disc.dateLabel}
                                    </td>
                                    <td className="p-2.5 border-r border-slate-300 dark:border-slate-700">
                                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                                        {disc.serviceName}
                                      </div>
                                      <div className="text-[10px] text-slate-500">{disc.category}</div>
                                    </td>
                                    <td className="p-2.5 tabular-nums whitespace-nowrap font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-300 dark:border-slate-700">
                                      BH: {disc.systemBh} · ND: {disc.systemNd}
                                      {disc.isManualLocked && (
                                        <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[10px] font-bold">
                                          <Lock className="w-2.5 h-2.5" />
                                          Sửa tay
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2.5 tabular-nums whitespace-nowrap font-bold text-blue-700 dark:text-blue-300 border-r border-slate-300 dark:border-slate-700">
                                      BH: {disc.sheetBh} · ND: {disc.sheetNd}
                                    </td>
                                    <td className="p-2.5 whitespace-nowrap border-r border-slate-300 dark:border-slate-700">
                                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${typeInfo.cls}`}>
                                        {typeInfo.label}
                                      </span>
                                    </td>
                                    <td className="p-2.5 text-right whitespace-nowrap">
                                      {isPending ? (
                                        <div className="inline-flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() =>
                                              void handleResolveDiscrepancy(
                                                entry.id,
                                                disc,
                                                'updated_from_sheet'
                                              )
                                            }
                                            className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                                            title="Ghi đè giá trị Google Sheet vào Firebase"
                                          >
                                            <RotateCcw className="w-3 h-3" />
                                            Cập nhật theo Sheet
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() =>
                                              void handleResolveDiscrepancy(
                                                entry.id,
                                                disc,
                                                'kept_system'
                                              )
                                            }
                                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                                            title="Giữ nguyên số liệu đang có trên Firebase"
                                          >
                                            <Check className="w-3 h-3" />
                                            Giữ Firebase
                                          </button>
                                        </div>
                                      ) : disc.resolutionStatus === 'updated_from_sheet' ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                          <CheckCircle2 className="w-3 h-3" />
                                          Đã cập nhật Sheet
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                          <ShieldCheck className="w-3 h-3" />
                                          Đã giữ Firebase
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Auto-Written Items Summary */}
                    {autoSamples.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            Dữ liệu trống trên Firebase đã tự động nạp từ Google Sheet ({entry.autoWrittenCount} ô
                            {entry.autoWrittenCount > autoSamples.length ? `, hiển thị ${autoSamples.length} ô đầu` : ''})
                          </span>
                        </h4>
                        <div className="overflow-x-auto border-[1.5px] border-emerald-300 dark:border-emerald-800 rounded-xl bg-white dark:bg-slate-900 max-h-56 overflow-y-auto">
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead className="sticky top-0 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-bold border-b-2 border-emerald-300 dark:border-emerald-800">
                              <tr>
                                <th className="p-2 border-r border-emerald-200 dark:border-emerald-800">Ngày</th>
                                <th className="p-2 border-r border-emerald-200 dark:border-emerald-800">Kỹ thuật</th>
                                <th className="p-2 border-r border-emerald-200 dark:border-emerald-800">Bộ phận</th>
                                <th className="p-2 text-right">Đã ghi lên Firebase</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-300 dark:divide-slate-700">
                              {autoSamples.map((s, idx) => (
                                <tr key={`${s.dateLabel}-${s.serviceName}-${idx}`}>
                                  <td className="p-2 font-bold text-slate-800 dark:text-slate-100 tabular-nums whitespace-nowrap border-r border-slate-200 dark:border-slate-700">
                                    {s.dateLabel}
                                  </td>
                                  <td className="p-2 font-semibold text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700">
                                    {s.serviceName}
                                  </td>
                                  <td className="p-2 text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">{s.category}</td>
                                  <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-300 tabular-nums whitespace-nowrap">
                                    BH: {s.bh} · ND: {s.nd}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {discrepancies.length === 0 && autoSamples.length === 0 && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                        Không có sai lệch hay ô dữ liệu cần ghi bổ sung trong lượt kiểm tra này.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
