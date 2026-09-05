import React, { useState } from 'react';
import { Bell, Send, Mail, MessageSquare, CheckCircle2, XCircle, Clock, ShieldCheck, RefreshCw } from 'lucide-react';
import { NotificationLog, NotificationChannel } from '../../types/hospital';
import { storageService } from '../../services/storageService';

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
  const [recipient, setRecipient] = useState('BS. Lê Minh Cường');
  const [targetAddress, setTargetAddress] = useState('cuong.le@hospital.vn');
  const [title, setTitle] = useState('Nhắc nhở lịch phẫu thuật khẩn cấp');
  const [content, setContent] = useState('Có lịch phẫu thuật chấn thương sọ não phòng mổ số 2 lúc 14h00 hôm nay.');
  const [channel, setChannel] = useState<NotificationChannel>('Email');

  const users = storageService.getUsers();

  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) {
      onShowToast('Lỗi', 'Vui lòng nhập nội dung thông báo', 'error');
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
    onShowToast('Đã gửi thông báo', `Đã phát thông báo qua kênh ${channel} thành công`, 'success');
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
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
                  const u = users.find(usr => usr.name === e.target.value);
                  setRecipient(e.target.value);
                  if (u) {
                    setTargetAddress(channel === 'Email' ? u.email : (u.telegramChatId || '987654321'));
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                {users.map(u => (
                  <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Kênh thông báo</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as NotificationChannel)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="Email">Gmail Email</option>
                <option value="Telegram">Telegram Bot</option>
                <option value="In-App">In-App Toast</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Địa chỉ nhận (Email/ChatID)</label>
              <input
                type="text"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
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
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Nội dung chi tiết</label>
            <textarea
              rows={3}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            ></textarea>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md transition-colors"
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
              {notifications.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="p-3 font-mono text-slate-400">{log.id}</td>
                  <td className="p-3 font-medium">{log.recipient}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold rounded-md">
                      {log.channel}
                    </span>
                  </td>
                  <td className="p-3">{log.title}</td>
                  <td className="p-3 text-slate-400">{log.sentAt}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded-md">
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
