import React, { useState } from 'react';
import { 
  ShieldAlert, AlertTriangle, Send, Lock, Unlock, CheckCircle2, 
  Clock, FileWarning, Bell, User, MapPin, Eye, ExternalLink, Printer, Check, Copy, RefreshCw, Sparkles
} from 'lucide-react';
import { EquipmentItem, SafetyViolationItem } from '../../types/hospital';
import { 
  checkEquipmentSafetyInterlock, 
  dispatchSafetyInterlockAlert, 
  toggleSafetyLockout 
} from '../../utils/equipmentAnalytics';
import { formatDateVN, formatDateTimeVN, getNowVNString } from '../../utils/dateUtils';
import { storageService } from '../../services/storageService';

interface SafetyInterlockTabProps {
  equipmentList: EquipmentItem[];
  onOpenDetailModal: (equipment: EquipmentItem) => void;
  onRefresh: () => void;
}

export const SafetyInterlockTab: React.FC<SafetyInterlockTabProps> = ({
  equipmentList,
  onOpenDetailModal,
  onRefresh
}) => {
  const [selectedViolationForAlert, setSelectedViolationForAlert] = useState<SafetyViolationItem | null>(null);
  const [alertRecipient, setAlertRecipient] = useState('TS. BS. Phạm Đức Thành (Trưởng khoa) & KTV. Vũ Văn Hải');
  const [customTelegramId, setCustomTelegramId] = useState('@cls_alert_bot (Nhóm Chỉ đạo Trưởng khoa)');
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [alertSuccessInfo, setAlertSuccessInfo] = useState<{ telegramMsg: string; timestamp: string } | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');

  // Calculate real-time cross-validation violations
  const violations = checkEquipmentSafetyInterlock(equipmentList);
  const criticalCount = violations.filter(v => v.severity === 'CRITICAL').length;
  const warningCount = violations.filter(v => v.severity === 'WARNING').length;

  const filteredViolations = violations.filter(v => {
    if (filterSeverity === 'ALL') return true;
    return v.severity === filterSeverity;
  });

  const handleSendTelegramAlert = (violation: SafetyViolationItem) => {
    setIsSendingAlert(true);
    setTimeout(() => {
      const res = dispatchSafetyInterlockAlert(violation, alertRecipient);
      setIsSendingAlert(false);
      setAlertSuccessInfo({
        telegramMsg: res.telegramMessage,
        timestamp: res.timestamp
      });
      onRefresh();
    }, 600);
  };

  const handleToggleLockout = (equipmentId: string, currentLockout?: boolean, reason?: string) => {
    toggleSafetyLockout(equipmentId, !currentLockout, reason);
    onRefresh();
  };

  const handleCopyTelegramText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      {/* Top Banner: Cross-Validation Overview */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white rounded-2xl p-6 shadow-lg border border-rose-800/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Hệ Thống Khóa Chéo An Toàn (Safety Interlock)
              </span>
              <span className="text-xs text-slate-400">ISO 15189 & Cục An Toàn Bức Xạ</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Ràng Buộc Dữ Liệu & Kiểm Soát Vi Phạm Hoạt Động (Data Cross-Validation)
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Tự động đối soát trạng thái kiểm định, kiểm xạ, giấy phép hoạt động với số lượng ca thực hiện thực tế trong ngày. Khi phát hiện máy lỗi hoặc quá hạn mà vẫn ghi nhận ca, hệ thống lập tức kích hoạt khóa chéo an toàn và phát cảnh báo khẩn cấp tới Ban Chủ Nhiệm Khoa.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-rose-900/60 border border-rose-700/60 p-4 rounded-xl text-center min-w-[130px]">
              <div className="text-2xl font-black text-rose-300">{criticalCount}</div>
              <div className="text-[11px] font-semibold text-rose-200 uppercase tracking-wider mt-0.5">Vi Phạm Khẩn Cấp</div>
            </div>
            <div className="bg-amber-900/60 border border-amber-700/60 p-4 rounded-xl text-center min-w-[130px]">
              <div className="text-2xl font-black text-amber-300">{warningCount}</div>
              <div className="text-[11px] font-semibold text-amber-200 uppercase tracking-wider mt-0.5">Cảnh Báo Sắp Hạn</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Chips & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Lọc mức độ:</span>
          <button
            onClick={() => setFilterSeverity('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterSeverity === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Tất cả ({violations.length})
          </button>
          <button
            onClick={() => setFilterSeverity('CRITICAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterSeverity === 'CRITICAL'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            Khẩn cấp / Đỏ ({criticalCount})
          </button>
          <button
            onClick={() => setFilterSeverity('WARNING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterSeverity === 'WARNING'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            Cảnh báo / Vàng ({warningCount})
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <span>Kiểm tra tự động lúc: <strong>{getNowVNString()}</strong></span>
        </div>
      </div>

      {/* Violations List */}
      {filteredViolations.length === 0 ? (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-8 rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
            Tất Cả Thiết Bị Đạt Chuẩn An Toàn Bức Xạ & Kiểm Chuẩn ISO 15189!
          </h3>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-xl mx-auto">
            Không phát hiện trường hợp máy hỏng hoặc hết hạn kiểm xạ/kiểm định mà vẫn có phát sinh ca chụp hoặc xét nghiệm trong ngày. Hệ thống khóa chéo đang bảo vệ an toàn tối đa.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredViolations.map(violation => {
            const isCritical = violation.severity === 'CRITICAL';
            const matchedEquipment = equipmentList.find(e => e.id === violation.equipmentId);
            const isLocked = matchedEquipment?.isLockedOut || false;

            return (
              <div 
                key={violation.id}
                className={`p-5 rounded-2xl border transition-all shadow-sm ${
                  isCritical 
                    ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 ring-1 ring-rose-500/20' 
                    : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left content */}
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                        isCritical 
                          ? 'bg-rose-600 text-white shadow-xs' 
                          : 'bg-amber-500 text-white shadow-xs'
                      }`}>
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {isCritical ? '🚨 KHÓA CHÉO AN TOÀN - KHẨN CẤP' : '⚠️ CẢNH BÁO PHÁP LÝ'}
                      </span>
                      <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {violation.equipmentCode}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> {violation.room}
                      </span>
                      {isLocked && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-900 text-white flex items-center gap-1 shadow-xs">
                          <Lock className="w-3 h-3 text-amber-400" /> ĐÃ KHÓA AN TOÀN (LOTO)
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {violation.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {violation.description}
                      </p>
                    </div>

                    {/* Data Cross-Validation Counters */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Ca Phát Sinh Hôm Nay</div>
                        <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">
                          {violation.activeCasesToday} <span className="text-xs font-normal text-slate-500">ca ghi nhận</span>
                        </div>
                      </div>

                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Cơ Quan Giám Sát</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                          {violation.regulatoryAgency}
                        </div>
                      </div>

                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Phụ Trách & Chỉ Đạo</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 truncate">
                          {violation.assignedTechnician} &bull; {violation.managerInCharge}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 lg:w-64 pt-2 lg:pt-0">
                    <button
                      onClick={() => setSelectedViolationForAlert(violation)}
                      className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>Gửi Cảnh Báo Khẩn Telegram/Email</span>
                    </button>

                    <button
                      onClick={() => handleToggleLockout(violation.equipmentId, isLocked, violation.title)}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 border ${
                        isLocked
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 border-slate-900 shadow-sm'
                      }`}
                    >
                      {isLocked ? (
                        <>
                          <Unlock className="w-4 h-4 text-emerald-600" />
                          <span>Mở Khóa Vận Hành Lại</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-amber-400" />
                          <span>Khóa Khẩn Cấp (LOTO)</span>
                        </>
                      )}
                    </button>

                    {matchedEquipment && (
                      <button
                        onClick={() => onOpenDetailModal(matchedEquipment)}
                        className="w-full py-2 px-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Xem Toàn Bộ Lý Lịch Máy</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Telegram / Email Alert Dispatch Modal */}
      {selectedViolationForAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-rose-600 to-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Phát Cảnh Báo Khẩn Qua Telegram Bot & Email</h3>
                  <p className="text-xs text-white/80 mt-0.5">Quy trình xử lý sự cố An toàn Bức xạ & Kiểm chuẩn ISO 15189</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedViolationForAlert(null);
                  setAlertSuccessInfo(null);
                }}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {alertSuccessInfo ? (
                <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-emerald-900 dark:text-emerald-100 text-sm">
                        Đã Phát Cảnh Báo Thành Công Qua Telegram & Email!
                      </h4>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Gửi lúc: {alertSuccessInfo.timestamp} &bull; Đã lưu vào Nhật ký Kiểm toán (Audit Log).
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed border border-slate-800">
                    {alertSuccessInfo.telegramMsg}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => handleCopyTelegramText(alertSuccessInfo.telegramMsg)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      {copiedMsg ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedMsg ? 'Đã sao chép!' : 'Sao chép thông điệp'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedViolationForAlert(null);
                        setAlertSuccessInfo(null);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Người nhận thông báo khẩn cấp:
                      </label>
                      <input
                        type="text"
                        value={alertRecipient}
                        onChange={e => setAlertRecipient(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Kênh Telegram Bot / Kênh Ban Chủ Nhiệm:
                      </label>
                      <input
                        type="text"
                        value={customTelegramId}
                        onChange={e => setCustomTelegramId(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Message Preview */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Nội dung thông điệp gửi tự động qua Telegram:
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">Format Markdown v2</span>
                    </div>

                    <div className="p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed border border-slate-800 max-h-64 overflow-y-auto">
                      {`🚨 [CẢNH BÁO KHẨN - AN TOÀN BỨC XẠ & ISO 15189]
━━━━━━━━━━━━━━━━━━━━━━━
📍 Thiết bị: ${selectedViolationForAlert.equipmentName} (${selectedViolationForAlert.equipmentCode})
🏥 Phòng: ${selectedViolationForAlert.room}
⚠️ Mức độ: ${selectedViolationForAlert.severity === 'CRITICAL' ? '🔴 KHẨN CẤP / VI PHẠM PHÁP LÝ' : '🟡 CẢNH BÁO'}
📋 Cơ quan giám sát: ${selectedViolationForAlert.regulatoryAgency}

🔎 Chi tiết vi phạm:
${selectedViolationForAlert.description}

📊 Số ca đang phát sinh:
- Hôm nay: ${selectedViolationForAlert.activeCasesToday} ca
- Tháng này: ${selectedViolationForAlert.monthlyCases} ca

👤 Người phụ trách: ${selectedViolationForAlert.assignedTechnician}
👨‍⚕️ Trưởng khoa chỉ đạo: ${selectedViolationForAlert.managerInCharge}

🛑 Khuyến nghị hành động ngay:
1. Kích hoạt chế độ Khóa khẩn cấp (Safety Lockout Tagout - LOTO).
2. Tạm dừng phân bổ chỉ định bệnh nhân sang phòng máy này.
3. Liên hệ ngay Cục ATBX & Hạt nhân / Đơn vị kiểm định để gia hạn.
━━━━━━━━━━━━━━━━━━━━━━━
⏰ Gửi lúc: ${getNowVNString()} | Hệ thống CLS WorkHub 4.0`}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      onClick={() => setSelectedViolationForAlert(null)}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      onClick={() => handleSendTelegramAlert(selectedViolationForAlert)}
                      disabled={isSendingAlert}
                      className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/30 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isSendingAlert ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang gửi cảnh báo...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Xác Nhận & Gửi Cảnh Báo Khẩn</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
