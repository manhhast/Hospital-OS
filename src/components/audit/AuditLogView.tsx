import React, { useState } from 'react';
import { History, Eye, ShieldAlert, Monitor, Terminal, X, Code } from 'lucide-react';
import { AuditLogItem } from '../../types/hospital';
import { storageService } from '../../services/storageService';

export const AuditLogView: React.FC = () => {
  const auditLogs = storageService.getAuditLogs();
  const [inspectLog, setInspectLog] = useState<AuditLogItem | null>(null);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
            <History className="w-5 h-5 text-blue-600 mr-2" /> Lịch sử Nhật ký Hệ thống (Audit Trail Log)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Ghi lại minh bạch: Ai thực hiện, Hành động gì, Lúc nào, IP Address, Thiết bị và So sánh dữ liệu cũ/mới</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3.5">Thời gian</th>
                <th className="p-3.5">Người thực hiện</th>
                <th className="p-3.5">Hành động</th>
                <th className="p-3.5">Module</th>
                <th className="p-3.5">IP & Thiết bị</th>
                <th className="p-3.5 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="p-3.5 font-mono text-slate-400">{log.timestamp}</td>
                  <td className="p-3.5">
                    <div className="font-bold text-slate-800 dark:text-slate-100">{log.userName}</div>
                    <div className="text-[10px] text-slate-400">{log.userEmail} ({log.userRole})</div>
                  </td>
                  <td className="p-3.5 font-semibold text-blue-600 dark:text-blue-400">{log.action}</td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-md">
                      {log.module}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-400 text-[11px]">
                    <div>{log.ipAddress}</div>
                    <div className="text-[10px] truncate max-w-[150px]">{log.device}</div>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => setInspectLog(log)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                    >
                      So sánh Data
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON DIFF INSPECTOR MODAL */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Chi tiết Audit Diff: {inspectLog.action}</h3>
              <button onClick={() => setInspectLog(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-slate-950 text-slate-300 p-4 rounded-xl space-y-1">
                <span className="text-rose-400 font-bold uppercase text-[10px]">Dữ liệu cũ (Old Data):</span>
                <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] mt-2">
                  {inspectLog.oldData ? JSON.stringify(JSON.parse(inspectLog.oldData), null, 2) : 'Không có (Tạo mới)'}
                </pre>
              </div>

              <div className="bg-slate-950 text-slate-300 p-4 rounded-xl space-y-1">
                <span className="text-emerald-400 font-bold uppercase text-[10px]">Dữ liệu mới (New Data):</span>
                <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] mt-2">
                  {inspectLog.newData ? JSON.stringify(JSON.parse(inspectLog.newData), null, 2) : 'Không có (Đã xóa)'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
