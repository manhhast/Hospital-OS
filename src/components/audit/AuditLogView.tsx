import React, { useState } from 'react';
import { History, Eye, ShieldAlert, Monitor, Terminal, X, Code } from 'lucide-react';
import { AuditLogItem } from '../../types/hospital';
import { storageService } from '../../services/storageService';

export const AuditLogView: React.FC = () => {
  const auditLogs = storageService.getAuditLogs();
  const [inspectLog, setInspectLog] = useState<AuditLogItem | null>(null);

  return (
    <div className="space-y-4 w-full pb-8 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-[#DFE7F0] dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#263445] dark:text-slate-100 flex items-center">
            <History className="w-5 h-5 text-[#1976D2] mr-2" /> Lịch sử Nhật ký Hệ thống (Audit Trail Log)
          </h3>
          <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">Ghi lại minh bạch: Ai thực hiện, Hành động gì, Lúc nào, IP Address, Thiết bị và So sánh dữ liệu cũ/mới</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#263445] dark:text-slate-200">
            <thead className="bg-[#F4F7FB] dark:bg-slate-800 text-[#718096] font-bold uppercase text-[10px] border-b border-[#DFE7F0] dark:border-slate-800">
              <tr>
                <th className="p-3">Thời gian</th>
                <th className="p-3">Người thực hiện</th>
                <th className="p-3">Hành động</th>
                <th className="p-3">Module</th>
                <th className="p-3">IP & Thiết bị</th>
                <th className="p-3 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFE7F0] dark:divide-slate-800">
              {auditLogs.map((log, idx) => (
                <tr key={`${log.id}-${idx}`} className="hover:bg-[#EAF4FF]/40 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-mono text-[#718096]">{log.timestamp}</td>
                  <td className="p-3">
                    <div className="font-bold text-[#263445] dark:text-slate-100">{log.userName}</div>
                    <div className="text-[10px] text-[#718096]">{log.userEmail} ({log.userRole})</div>
                  </td>
                  <td className="p-3 font-semibold text-[#1976D2] dark:text-blue-400">{log.action}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-[#EAF4FF] dark:bg-slate-800 text-[#155A9C] dark:text-slate-300 font-bold rounded-md border border-[#1976D2]/20 dark:border-slate-700">
                      {log.module}
                    </span>
                  </td>
                  <td className="p-3 text-[#718096] text-[11px]">
                    <div>{log.ipAddress}</div>
                    <div className="text-[10px] truncate max-w-[150px]">{log.device}</div>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setInspectLog(log)}
                      className="px-2.5 py-1 bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#155A9C] dark:text-slate-200 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-xs font-semibold transition-colors"
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
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-[#DFE7F0] dark:border-slate-800 max-w-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-[#263445] dark:text-slate-100">Chi tiết Audit Diff: {inspectLog.action}</h3>
              <button onClick={() => setInspectLog(null)} className="text-[#718096] hover:text-[#263445] p-1 rounded-lg hover:bg-[#F4F7FB]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-slate-950 text-slate-300 p-4 rounded-lg space-y-1">
                <span className="text-rose-400 font-bold uppercase text-[10px]">Dữ liệu cũ (Old Data):</span>
                <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] mt-2">
                  {inspectLog.oldData ? JSON.stringify(JSON.parse(inspectLog.oldData), null, 2) : 'Không có (Tạo mới)'}
                </pre>
              </div>

              <div className="bg-slate-950 text-slate-300 p-4 rounded-lg space-y-1">
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
