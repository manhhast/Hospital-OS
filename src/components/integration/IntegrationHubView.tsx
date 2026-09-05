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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 text-sm font-semibold mb-1">
            <Network className="w-4 h-4" /> TRUNG TÂM TÍCH HỢP & CỔNG KẾT NỐI API (HIS / LIS / PACS)
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Kiến Trúc Module Hóa & Cổng Giao Tiếp Hệ Thống Y Tế</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mở rộng kết nối hai chiều chuẩn hóa HL7, FHIR R4, REST API và DICOM Web không cần sửa đổi kiến trúc lõi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> HIS / LIS / PACS Gateway Ready
          </span>
        </div>
      </div>

      {/* Endpoints Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {endpoints.map(ep => (
          <div key={ep.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">{ep.systemName}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                {ep.protocol}
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono truncate">{ep.endpointUrl}</div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
              <span className="text-slate-400">Độ trễ (Latency):</span>
              <span className="font-bold text-emerald-600">{ep.latencyMs} ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Gói tin hôm nay:</span>
              <span className="font-bold text-slate-800">{ep.totalRequestsToday.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Payload Viewer & Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Payload History (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between">
            <span>Nhật Ký Gói Tin Giao Tiếp Real-time</span>
            <span className="text-xs font-normal text-slate-500">{payloads.length} tin nhắn</span>
          </h3>

          <div className="space-y-3">
            {payloads.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedPayload(p)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  selectedPayload?.id === p.id
                    ? 'bg-indigo-50/70 border-indigo-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">{p.system}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 font-mono font-medium">{p.eventType}</p>
                <span className="text-[10px] text-slate-400 block mt-1">{p.timestamp}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Payload Detail Inspector & Simulator (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Selected Payload Inspector */}
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-md space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs text-slate-300">Chi Tiết Payload API</span>
              </div>
              {selectedPayload && (
                <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-1 rounded">
                  {selectedPayload.system}
                </span>
              )}
            </div>

            {selectedPayload ? (
              <pre className="p-4 bg-slate-950 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto border border-slate-800 max-h-64">
                {selectedPayload.payloadJson}
              </pre>
            ) : (
              <p className="text-xs text-slate-500 py-8 text-center">Chọn gói tin để kiểm tra.</p>
            )}
          </div>

          {/* Interactive API Simulator Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-600" /> Trình Giả Lập Gửi Nhận Gói Tin API (HIS / LIS / PACS Simulator)
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <label className="font-semibold text-slate-700">Hệ thống gửi:</label>
                {(['HIS', 'LIS', 'PACS'] as const).map(sys => (
                  <label key={sys} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="simSystem"
                      checked={simSystem === sys}
                      onChange={() => setSimSystem(sys)}
                      className="text-indigo-600"
                    />
                    <span className="font-bold text-slate-800">{sys}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cấu trúc Gói tin JSON / HL7 String:</label>
                <textarea
                  rows={5}
                  value={simJson}
                  onChange={e => setSimJson(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
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
