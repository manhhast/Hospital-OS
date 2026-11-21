import React, { useState, useEffect } from 'react';
import { 
  Network, Server, Cpu, RefreshCw, Send, CheckCircle2, AlertTriangle, 
  Terminal, ShieldCheck, Database, Code2, Zap, ArrowRight, Activity
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { IntegrationEndpoint, IntegrationPayloadSample } from '../../types/hospital';

export const IntegrationHubView: React.FC = () => {
  const [endpoints, setEndpoints] = useState<IntegrationEndpoint[]>([]);
  const [payloads, setPayloads] = useState<IntegrationPayloadSample[]>([]);
  const [selectedPayload, setSelectedPayload] = useState<IntegrationPayloadSample | null>(null);

  // Simulation State
  const [simSystem, setSimSystem] = useState<'HIS' | 'LIS' | 'PACS'>('HIS');
  const [simJson, setSimJson] = useState(`{
  "orderId": "HIS-2026-TEST-99",
  "patientId": "BN-10293",
  "patientName": "Trần Văn B",
  "modality": "CT",
  "procedure": "CT-128-BRAIN",
  "priority": "URGENT"
}`);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    const loadData = () => {
      setEndpoints(storageService.getIntegrationEndpoints());
      const pList = storageService.getIntegrationPayloads();
      setPayloads(pList);
      if (pList.length > 0 && !selectedPayload) {
        setSelectedPayload(pList[0]);
      }
    };
    loadData();
    return storageService.subscribe(loadData);
  }, []);

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const newSample: IntegrationPayloadSample = {
        id: `PAY-${Date.now()}`,
        system: `${simSystem} -> CLS WorkHub`,
        eventType: `SIMULATION_${simSystem}_TEST`,
        direction: 'INBOUND',
        timestamp: new Date().toLocaleString('vi-VN'),
        status: 'SUCCESS',
        payloadJson: simJson
      };

      storageService.addIntegrationPayload(newSample);
      setSelectedPayload(newSample);
      setIsSimulating(false);
      alert(`Đã gửi thành công gói tin API giả lập từ hệ thống ${simSystem}!`);
    }, 800);
  };

  return (
    <div className="space-y-4 w-full pb-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-xs transition-colors">
        <div>
          <div className="flex items-center gap-2 text-[#1976D2] dark:text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Network className="w-4 h-4" /> TRUNG TÂM TÍCH HỢP & CỔNG KẾT NỐI API (HIS / LIS / PACS)
          </div>
          <h1 className="text-lg font-bold text-[#263445] dark:text-white">Kiến Trúc Module Hóa & Cổng Giao Tiếp Hệ Thống Y Tế</h1>
          <p className="text-xs text-[#718096] dark:text-slate-400 mt-0.5">
            Mở rộng kết nối hai chiều chuẩn hóa HL7, FHIR R4, REST API và DICOM Web không cần sửa đổi kiến trúc lõi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> HIS / LIS / PACS Gateway Ready
          </span>
        </div>
      </div>

      {/* Endpoints Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {endpoints.map(ep => (
          <div key={ep.id} className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-xs space-y-2.5 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#263445] dark:text-white text-sm">{ep.systemName}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#EAF4FF] dark:bg-blue-950/80 text-[#155A9C] dark:text-blue-300 border border-[#1976D2]/25 dark:border-blue-900/60">
                {ep.protocol}
              </span>
            </div>
            <div className="text-xs text-[#718096] dark:text-slate-400 font-mono truncate">{ep.endpointUrl}</div>
            <div className="flex items-center justify-between pt-2 border-t border-[#DFE7F0] dark:border-slate-800 text-[11px]">
              <span className="text-[#718096] dark:text-slate-500">Độ trễ (Latency):</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{ep.latencyMs} ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#718096] dark:text-slate-500">Gói tin hôm nay:</span>
              <span className="font-bold text-[#263445] dark:text-slate-200">{ep.totalRequestsToday.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Payload Viewer & Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Side: Payload History (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-xs p-4 space-y-3 transition-colors">
          <h3 className="font-bold text-[#263445] dark:text-white text-sm flex items-center justify-between">
            <span>Nhật Ký Gói Tin Giao Tiếp Real-time</span>
            <span className="text-xs font-normal text-[#718096] dark:text-slate-400">{payloads.length} tin nhắn</span>
          </h3>

          <div className="space-y-2.5">
            {payloads.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedPayload(p)}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  selectedPayload?.id === p.id
                    ? 'bg-[#EAF4FF] dark:bg-blue-950/70 border-[#1976D2] dark:border-blue-500 shadow-xs'
                    : 'bg-white dark:bg-slate-800/80 border-[#DFE7F0] dark:border-slate-700/80 hover:bg-[#EAF4FF]/40 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#263445] dark:text-white text-xs">{p.system}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-[#718096] dark:text-slate-300 mt-1 font-mono font-medium">{p.eventType}</p>
                <span className="text-[10px] text-[#718096] dark:text-slate-500 block mt-1">{p.timestamp}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Payload Detail Inspector & Simulator (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Selected Payload Inspector */}
          <div className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-xl p-4 shadow-md border border-slate-800 space-y-3 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs text-slate-300">Chi Tiết Payload API</span>
              </div>
              {selectedPayload && (
                <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  {selectedPayload.system}
                </span>
              )}
            </div>

            {selectedPayload ? (
              <pre className="p-3.5 bg-slate-950 dark:bg-black/90 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto border border-slate-800 max-h-64">
                {selectedPayload.payloadJson}
              </pre>
            ) : (
              <p className="text-xs text-slate-500 py-8 text-center">Chọn gói tin để kiểm tra.</p>
            )}
          </div>

          {/* Interactive API Simulator Form */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-xs p-4 space-y-3.5 transition-colors">
            <h3 className="font-bold text-[#263445] dark:text-white text-sm flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#1976D2] dark:text-blue-400" /> Trình Giả Lập Gửi Nhận Gói Tin API (HIS / LIS / PACS Simulator)
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <label className="font-semibold text-[#263445] dark:text-slate-300">Hệ thống gửi:</label>
                {(['HIS', 'LIS', 'PACS'] as const).map(sys => (
                  <label key={sys} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="simSystem"
                      checked={simSystem === sys}
                      onChange={() => setSimSystem(sys)}
                      className="text-[#1976D2] focus:ring-[#1976D2]"
                    />
                    <span className="font-bold text-[#263445] dark:text-slate-200">{sys}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block font-semibold text-[#263445] dark:text-slate-300 mb-1">Cấu trúc Gói tin JSON / HL7 String:</label>
                <textarea
                  rows={5}
                  value={simJson}
                  onChange={e => setSimJson(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-[#1976D2] text-[#263445] dark:text-slate-100 transition-colors"
                />
              </div>

              <button
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="w-full py-2.5 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSimulating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Đang Phân Tích & Xử Lý Gói Tin...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Gửi Gói Tin Giả Lập Vào Cổng API
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
