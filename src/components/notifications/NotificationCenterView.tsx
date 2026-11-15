import React, { useMemo, useState, useEffect } from 'react';
import { Bell, Send, BellRing, Clock, Wrench, CheckCircle2 } from 'lucide-react';
import { NotificationLog, NotificationChannel, EquipmentItem, TaskItem } from '../../types/hospital';
import { storageService } from '../../services/storageService';
import {
  scanEquipmentExpirations,
  scanTaskReminders,
  formatDaysRemainingLabel,
  dispatchEquipmentReminder,
  dispatchTaskReminder,
  EquipmentExpirationAlert,
  TaskReminderAlert
} from '../../utils/operationalAlerts';
import { formatDateVN } from '../../utils/dateUtils';

interface NotificationCenterViewProps {
  notifications: NotificationLog[];
  onNotificationsUpdated: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({
  notifications,
  onNotificationsUpdated,
  onShowToast
}) => {
  const users = storageService.getUsers();
  const defaultUser = users[0];

  const [recipient, setRecipient] = useState(defaultUser?.name || 'Ban Chủ Nhiệm Khoa CLS');
  const [targetAddress, setTargetAddress] = useState(defaultUser?.email || 'cls@hospital.vn');
  const [title, setTitle] = useState('Nhắc nhở rà soát thời hạn kiểm chuẩn thiết bị & công việc tuần');
  const [content, setContent] = useState(
    'Đề nghị các bộ phận kiểm tra hạn kiểm định thiết bị, lịch bảo dưỡng định kỳ và cập nhật tiến độ đầu việc đến hạn trước 16h00 hôm nay.'
  );
  const [channel, setChannel] = useState<NotificationChannel>('Telegram');
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>(() => storageService.getEquipment());
  const [taskList, setTaskList] = useState<TaskItem[]>(() => storageService.getTasks());

  useEffect(() => {
    const syncData = () => {
      setEquipmentList(storageService.getEquipment());
      setTaskList(storageService.getTasks());
    };
    const unsubscribe = storageService.subscribe(syncData);
    return () => unsubscribe();
  }, []);

  const eqCompliance = useMemo(() => scanEquipmentExpirations(equipmentList, 30), [equipmentList]);
  const taskReminders = useMemo(() => scanTaskReminders(taskList, 3), [taskList]);

  const urgentEqAlerts = useMemo(
    () => eqCompliance.alerts.filter((a) => a.daysRemaining <= 7),
    [eqCompliance]
  );
  const urgentTaskAlerts = useMemo(
    () => taskReminders.alerts.filter((a) => a.daysRemaining <= 3),
    [taskReminders]
  );

  const resolveAddressForUser = (userName: string, targetChannel: NotificationChannel): string => {
    const u = users.find((usr) => usr.name === userName);
    if (targetChannel === 'Email') return u?.email || 'cls@hospital.vn';
    if (targetChannel === 'Telegram') return u?.telegramChatId || storageService.getSettings().defaultTelegramChatId || '@cls_alert_bot';
    return 'Hệ thống CLS WorkHub';
  };

  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      onShowToast('Thiếu thông tin', 'Vui lòng nhập tiêu đề và nội dung thông báo', 'error');
      return;
    }

    storageService.sendNotification({
      recipient,
      targetAddress,
      title,
      content,
      channel,
      status: 'Đã gửi'
    });

    onNotificationsUpdated();
    onShowToast('Đã gửi thông báo', `Đã phát thông báo qua kênh ${channel} tới ${recipient}`, 'success');
  };

  const handleLoadEquipmentTemplate = (alert: EquipmentExpirationAlert) => {
    const matched = users.find((u) => u.name === alert.assignedTechnician) || defaultUser;
    const targetName = matched?.name || alert.assignedTechnician;
    setRecipient(targetName);
    setTargetAddress(resolveAddressForUser(targetName, channel));
    setTitle(
      `[${alert.daysRemaining < 0 ? 'QUÁ HẠN' : 'CẢNH BÁO HẠN'}] ${alert.trackLabel} - ${alert.equipmentName} (${alert.equipmentCode})`
    );
    setContent(
      `Thiết bị ${alert.equipmentName} (${alert.equipmentCode}) tại ${alert.room} có mốc "${alert.trackLabel}" hết hạn ngày ${alert.expiryDateVN} (${formatDaysRemainingLabel(alert.daysRemaining)}). Đề nghị ${alert.assignedTechnician} phối hợp ${alert.managerInCharge} hoàn tất gia hạn / kiểm chuẩn.`
    );
    onShowToast('Đã nạp mẫu thiết bị', `Đã điền nội dung cảnh báo ${alert.equipmentCode}`, 'info');
  };

  const handleLoadTaskTemplate = (item: TaskReminderAlert) => {
    const matched = users.find((u) => u.name === item.task.assignee) || defaultUser;
    const targetName = matched?.name || item.task.assignee;
    setRecipient(targetName);
    setTargetAddress(resolveAddressForUser(targetName, channel));
    setTitle(`[NHẮC VIỆC - ${formatDaysRemainingLabel(item.daysRemaining).toUpperCase()}] ${item.task.title}`);
    setContent(
      `Công việc #${item.task.id} (${item.task.taskType}, ưu tiên: ${item.task.priority}) giao cho ${item.task.assignee} có hạn hoàn thành ${formatDateVN(item.task.dueDate)} (${formatDaysRemainingLabel(item.daysRemaining)}). Trạng thái hiện tại: ${item.task.status}. Vui lòng cập nhật tiến độ.`
    );
    onShowToast('Đã nạp mẫu nhắc việc', `Đã điền thông tin nhắc việc #${item.task.id}`, 'info');
  };

  const handleBatchAutoDispatch = () => {
    if (urgentEqAlerts.length === 0 && urgentTaskAlerts.length === 0) {
      onShowToast('Không có mục khẩn cấp', 'Hiện không có thiết bị ≤7 ngày hoặc công việc ≤3 ngày cần nhắc tự động', 'info');
      return;
    }

    urgentEqAlerts.forEach((alert) => dispatchEquipmentReminder(alert, channel));
    urgentTaskAlerts.forEach((item) => dispatchTaskReminder(item.task, item.daysRemaining, channel));
    onNotificationsUpdated();

    onShowToast(
      'Đã phát nhắc nhở tự động',
      `Đã gửi ${urgentEqAlerts.length} cảnh báo thiết bị và ${urgentTaskAlerts.length} nhắc việc qua ${channel}`,
      'success'
    );
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Auto-Detected Equipment & Task Reminder Queue */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 rounded-xl">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Hàng đợi Cảnh báo Thiết bị & Nhắc việc tự động
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Phát hiện <strong className="text-rose-600 tabular-nums">{eqCompliance.alerts.length}</strong> mốc thiết bị ≤30 ngày và{' '}
                <strong className="text-amber-600 tabular-nums">{taskReminders.alerts.length}</strong> công việc cần nhắc (≤3 ngày)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBatchAutoDispatch}
            className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <BellRing className="w-4 h-4" />
            <span>
              Phát nhắc khẩn ({urgentEqAlerts.length + urgentTaskAlerts.length}) qua {channel}
            </span>
          </button>
        </div>

        {eqCompliance.alerts.length === 0 && taskReminders.alerts.length === 0 ? (
          <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 rounded-xl flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Tất cả thiết bị và công việc đều đang trong ngưỡng an toàn, chưa có cảnh báo cần phát.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Column 1: Equipment alerts */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Wrench className="w-3.5 h-3.5 text-rose-600" />
                <span>Thời hạn thiết bị (≤30 ngày / Quá hạn)</span>
              </div>
              {eqCompliance.alerts.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  Không có thiết bị sắp hết hạn trong 30 ngày tới.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {eqCompliance.alerts.slice(0, 6).map((alert) => (
                    <div
                      key={alert.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded tabular-nums ${
                              alert.daysRemaining < 0
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {formatDaysRemainingLabel(alert.daysRemaining)}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">{alert.equipmentCode}</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                          {alert.trackLabel} &bull; {alert.equipmentName}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          Hạn: {alert.expiryDateVN} &bull; {alert.assignedTechnician}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoadEquipmentTemplate(alert)}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-blue-600 dark:text-blue-400 text-[11px] font-semibold rounded-lg shrink-0 cursor-pointer"
                      >
                        Nạp mẫu
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Column 2: Task reminders */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Công việc quá hạn & đến hạn ≤3 ngày</span>
              </div>
              {taskReminders.alerts.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  Không có công việc quá hạn hoặc đến hạn trong 3 ngày tới.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {taskReminders.alerts.slice(0, 6).map((item) => (
                    <div
                      key={item.task.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded tabular-nums ${
                              item.daysRemaining < 0
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {formatDaysRemainingLabel(item.daysRemaining)}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">{item.task.id}</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                          {item.task.title}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          Phụ trách: {item.task.assignee} &bull; Hạn: {formatDateVN(item.task.dueDate)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoadTaskTemplate(item)}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-blue-600 dark:text-blue-400 text-[11px] font-semibold rounded-lg shrink-0 cursor-pointer"
                      >
                        Nạp mẫu
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Send Notification Box */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Bell className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Gửi thông báo đa kênh (Email / Telegram / In-App)</h3>
        </div>

        <form onSubmit={handleSendNotification} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Người nhận</label>
              <select
                value={recipient}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setRecipient(nextName);
                  setTargetAddress(resolveAddressForUser(nextName, channel));
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name} ({u.title || u.role})
                  </option>
                ))}
                {!users.some((u) => u.name === recipient) && (
                  <option value={recipient}>{recipient}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Kênh thông báo</label>
              <select
                value={channel}
                onChange={(e) => {
                  const nextChannel = e.target.value as NotificationChannel;
                  setChannel(nextChannel);
                  setTargetAddress(resolveAddressForUser(recipient, nextChannel));
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
              >
                <option value="Telegram">Telegram Bot</option>
                <option value="Email">Gmail Email</option>
                <option value="In-App">In-App Toast</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Địa chỉ nhận (Email/ChatID)</label>
              <input
                type="text"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Tiêu đề thông báo</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Nội dung chi tiết</label>
            <textarea
              rows={3}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
            ></textarea>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Phát thông báo ngay</span>
            </button>
          </div>
        </form>
      </div>

      {/* Notification Logs History Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Lịch sử phát thông báo</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
            <thead className="bg-slate-50 dark:bg-slate-800 uppercase font-bold text-[10px] text-slate-400">
              <tr>
                <th className="p-3">Mã</th>
                <th className="p-3">Người nhận</th>
                <th className="p-3">Kênh</th>
                <th className="p-3">Tiêu đề</th>
                <th className="p-3">Thời gian</th>
                <th className="p-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.map((log, idx) => (
                <tr key={`${log.id}-${idx}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="p-3 font-mono text-slate-400">{log.id}</td>
                  <td className="p-3 font-medium">{log.recipient}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold rounded-md">
                      {log.channel}
                    </span>
                  </td>
                  <td className="p-3">{log.title}</td>
                  <td className="p-3 text-slate-400 tabular-nums">{log.sentAt}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold rounded-md">
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

