import type { ScheduledAlertRuleConfig } from '../types/hospital';

export const DEFAULT_SCHEDULED_ALERT_RULES: ScheduledAlertRuleConfig[] = [
  {
    id: 'morning_0700',
    name: 'Giao ban Sáng & Cảnh báo Đầu ngày',
    description:
      'Tổng hợp công việc cần làm hôm nay, công việc chưa hoàn thành/quá hạn, số người nghỉ, nhân sự trực, lịch họp và thiết bị sắp hết hạn.',
    enabled: true,
    timeHHmm: '07:00',
    channel: 'telegram_and_inapp',
    equipmentWarningDays: 30
  },
  {
    id: 'noon_services_1245',
    name: 'Tổng hợp Dịch vụ Kỹ thuật Ngày Hôm Trước',
    description:
      'Tự động tổng hợp số liệu dịch vụ kỹ thuật ngày hôm trước từ Google Sheet / Kho báo cáo (BHYT, Nhân dân, từng nhóm kỹ thuật) và báo qua Telegram.',
    enabled: true,
    timeHHmm: '12:45',
    channel: 'telegram_and_inapp'
  },
  {
    id: 'evening_1700',
    name: 'Báo cáo Cuối ngày & Chuẩn bị Ngày mai',
    description:
      'Tổng kết công việc trong ngày, tồn đọng bàn giao và danh sách công việc, lịch trực, nhân sự nghỉ, lịch họp, thiết bị cần chuẩn bị cho ngày mai.',
    enabled: true,
    timeHHmm: '17:00',
    channel: 'telegram_and_inapp',
    equipmentWarningDays: 30
  }
];
