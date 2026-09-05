/**
 * Clinical Analytics, Visual Triage Alerts & Contextual Benchmarking
 * For Clinical Workflow Optimization (CLS WorkHub 4.0)
 */

import { CaseReportItem } from '../types/caseReport';

export type TriageSeverity = 'SURGE_CRITICAL' | 'SURGE_MODERATE' | 'NORMAL' | 'DROP_MODERATE' | 'DROP_CRITICAL';

export interface ClinicalTriageResult {
  itemId: string;
  itemName: string;
  category: string;
  todayCount: number;
  todayBH: number;
  todayND: number;
  mean: number;             // μ (Average 30 days / month)
  stdDev: number;           // σ (Standard Deviation)
  zScore: number;           // Z = (X - μ) / σ
  diffVsMean: number;       // X - μ
  pctDiffVsMean: number;    // ((X - μ) / μ) * 100%
  severity: TriageSeverity;
  alertTitle: string;
  alertBadgeClass: string;
  alertColor: string;
  contextualReason: string;
  recommendations: string[];
  historical30Days: { day: number; count: number; bh: number; nd: number }[];
}

// Default Key Clinical Technical Indicators (10-15 services pre-pinned)
export const DEFAULT_PINNED_SERVICE_NAMES = [
  'Siêu âm tim',
  'Siêu âm mạch',
  'Siêu âm tổng quát',
  'Siêu âm thai 4D và đầu dò AD',
  'Nội soi dạ dày',
  'Nội soi đại tràng',
  'Điện tim',
  'Lưu huyết não',
  'Chụp CT Scanner sọ não có cản quang',
  'Chụp MRI Cột sống / Sọ não',
  'Khí máu động mạch',
  'Troponin T hs'
];

const PINNED_STORAGE_KEY = 'cls_pinned_clinical_services_v1';

/**
 * Get list of pinned service names or IDs from localStorage
 */
export function getPinnedServiceNames(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_PINNED_SERVICE_NAMES;
}

/**
 * Save list of pinned service names to localStorage
 */
export function savePinnedServiceNames(names: string[]): void {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(names));
  } catch (e) {
    console.error('Failed to save pinned services', e);
  }
}

/**
 * Preset groups for Fast Pinning
 */
export const FAST_PIN_PRESETS = [
  {
    id: 'core_all',
    title: '⭐ Bộ Chỉ Số Trọng Điểm Chuẩn Toàn Khoa (12 kỹ thuật)',
    description: 'Bao gồm các kỹ thuật mũi nhọn chủ lực của Siêu âm, Nội soi, Điện tim, CT/MRI',
    services: DEFAULT_PINNED_SERVICE_NAMES
  },
  {
    id: 'imaging_high_tech',
    title: '🔬 Chẩn Đoán Hình Ảnh Kỹ Thuật Cao (CT / MRI / Siêu âm Tim mạch)',
    description: 'Theo dõi tải trọng máy chụp cắt lớp vi tính, cộng hưởng từ và siêu âm Doppler tim mạch',
    services: [
      'Siêu âm tim',
      'Siêu âm mạch',
      'Chụp CT Scanner sọ não có cản quang',
      'Chụp MRI Cột sống / Sọ não',
      'Siêu âm thai 4D và đầu dò AD',
      'Nội soi dạ dày'
    ]
  },
  {
    id: 'emergency_critical',
    title: '🚨 Chỉ Số Cấp Cứu & Can Thiệp Khẩn (Troponin, Khí Máu, CT Cấp Cứu)',
    description: 'Phát hiện nhanh quá tải từ Khoa Cấp cứu & Hồi sức tích cực (ICU)',
    services: [
      'Khí máu động mạch',
      'Troponin T hs',
      'Điện tim',
      'Siêu âm tim',
      'Chụp CT Scanner sọ não có cản quang',
      'Nội soi dạ dày'
    ]
  },
  {
    id: 'functional_endoscopy',
    title: '🫀 Thăm Dò Chức Năng & Nội Soi Tiêu Hóa',
    description: 'Tập trung giám sát phòng điện tim, lưu huyết não và các dàn nội soi mềm',
    services: [
      'Điện tim',
      'Lưu huyết não',
      'Nội soi dạ dày',
      'Nội soi đại tràng',
      'Siêu âm tổng quát'
    ]
  }
];

/**
 * Calculate standard deviation and clinical triage status for an item on a specific day
 */
export function calculateClinicalTriage(
  item: any,
  selectedDay: number,
  allMonthItems: any[],
  activeDaysCount: number = 28
): ClinicalTriageResult {
  const dailyData = item.dailyData || {};
  const currentDayData = dailyData[selectedDay] || { bh: 0, nd: 0 };
  
  const todayBH = typeof currentDayData.bh === 'number' ? currentDayData.bh : 0;
  const todayND = typeof currentDayData.nd === 'number' ? currentDayData.nd : 0;
  const todayCount = todayBH + todayND;

  // Extract 30-day (or active days) historical series
  const historical30Days: { day: number; count: number; bh: number; nd: number }[] = [];
  const counts: number[] = [];

  for (let d = 1; d <= 31; d++) {
    const entry = dailyData[d];
    if (entry && (entry.bh !== 'LT' && entry.nd !== 'LT')) {
      const bh = typeof entry.bh === 'number' ? entry.bh : (parseInt(String(entry.bh).replace(/[^0-9]/g, ''), 10) || 0);
      const nd = typeof entry.nd === 'number' ? entry.nd : (parseInt(String(entry.nd).replace(/[^0-9]/g, ''), 10) || 0);
      const total = bh + nd;
      historical30Days.push({ day: d, count: total, bh, nd });
      counts.push(total);
    }
  }

  // Calculate Mean (μ)
  const validDays = counts.length > 0 ? counts.length : (activeDaysCount || 1);
  const sum = counts.reduce((a, b) => a + b, 0);
  const mean = validDays > 0 ? sum / validDays : 0;

  // Calculate Sample Standard Deviation (σ)
  let variance = 0;
  if (counts.length > 1) {
    const sumSquareDiff = counts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
    variance = sumSquareDiff / (counts.length - 1);
  }
  const stdDev = Math.sqrt(variance);

  // Calculate Z-Score: (Today - Mean) / StdDev
  let zScore = 0;
  if (stdDev > 0.001) {
    zScore = (todayCount - mean) / stdDev;
  } else if (todayCount > mean && mean > 0) {
    zScore = ((todayCount - mean) / mean) * 2; // approximation when variance is minimal
  } else if (todayCount < mean && mean > 0) {
    zScore = ((todayCount - mean) / mean) * 2;
  }

  const diffVsMean = todayCount - mean;
  const pctDiffVsMean = mean > 0 ? (diffVsMean / mean) * 100 : (todayCount > 0 ? 100 : 0);

  // Determine Triage Severity Zone
  let severity: TriageSeverity = 'NORMAL';
  let alertTitle = 'Ổn định trong ngưỡng chuẩn';
  let alertBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
  let alertColor = '#10b981';

  if (todayCount === 0 && mean >= 5) {
    severity = 'DROP_CRITICAL';
    alertTitle = '🚨 Sụt giảm 100% (Không phát sinh ca)';
    alertBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800 animate-pulse';
    alertColor = '#e11d48';
  } else if (zScore >= 2.0 || pctDiffVsMean >= 45) {
    severity = 'SURGE_CRITICAL';
    alertTitle = `🚨 Đột biến Tăng Cao (+${pctDiffVsMean.toFixed(0)}%, Z=${zScore.toFixed(1)})`;
    alertBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800 font-black';
    alertColor = '#dc2626';
  } else if (zScore >= 1.2 || pctDiffVsMean >= 25) {
    severity = 'SURGE_MODERATE';
    alertTitle = `⚠️ Biến động Tăng (+${pctDiffVsMean.toFixed(0)}%, Z=${zScore.toFixed(1)})`;
    alertBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800 font-bold';
    alertColor = '#d97706';
  } else if (zScore <= -2.0 || pctDiffVsMean <= -45) {
    severity = 'DROP_CRITICAL';
    alertTitle = `📉 Sụt giảm Bất thường (${pctDiffVsMean.toFixed(0)}%, Z=${zScore.toFixed(1)})`;
    alertBadgeClass = 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-200 dark:border-indigo-800 font-black';
    alertColor = '#4f46e5';
  } else if (zScore <= -1.2 || pctDiffVsMean <= -25) {
    severity = 'DROP_MODERATE';
    alertTitle = `ℹ️ Biến động Giảm (${pctDiffVsMean.toFixed(0)}%, Z=${zScore.toFixed(1)})`;
    alertBadgeClass = 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/80 dark:text-sky-200 dark:border-sky-800';
    alertColor = '#0284c7';
  }

  // Generate Medical Contextual Reason
  const contextualReason = generateContextualMedicalReason(
    item.name,
    item.category,
    severity,
    todayCount,
    mean,
    pctDiffVsMean,
    todayBH,
    todayND
  );

  // Generate Recommendations
  const recommendations = generateClinicalRecommendations(
    item.name,
    item.category,
    severity,
    todayCount,
    mean
  );

  return {
    itemId: item.id || `srv-${item.name}`,
    itemName: item.name,
    category: item.category,
    todayCount,
    todayBH,
    todayND,
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    zScore: Number(zScore.toFixed(2)),
    diffVsMean: Number(diffVsMean.toFixed(1)),
    pctDiffVsMean: Number(pctDiffVsMean.toFixed(1)),
    severity,
    alertTitle,
    alertBadgeClass,
    alertColor,
    contextualReason,
    recommendations,
    historical30Days
  };
}

/**
 * Generate Contextual Medical Explanation for variance
 */
function generateContextualMedicalReason(
  name: string,
  category: string,
  severity: TriageSeverity,
  today: number,
  mean: number,
  pct: number,
  bh: number,
  nd: number
): string {
  const lowerName = name.toLowerCase();
  const bhRatio = today > 0 ? (bh / today) * 100 : 0;

  if (severity === 'SURGE_CRITICAL' || severity === 'SURGE_MODERATE') {
    if (lowerName.includes('tim') || lowerName.includes('mạch') || lowerName.includes('troponin')) {
      return `Số ca tăng đột biến ${pct > 0 ? `+${pct.toFixed(0)}%` : ''} do phòng khám Chuyên khoa Tim mạch chuyển sang kết hợp bệnh nhân cấp cứu hội chẩn tim mạch tăng cao. (Tỷ lệ BHYT: ${bhRatio.toFixed(0)}%).`;
    }
    if (lowerName.includes('thai') || lowerName.includes('4d') || lowerName.includes('phụ sản')) {
      return `Gia tăng lượng sản phụ khám dịch vụ theo lịch hẹn định kỳ và các đợt khám thai tuần chẵn. (Viện phí / Dịch vụ chiếm ${((nd / (today || 1)) * 100).toFixed(0)}%).`;
    }
    if (lowerName.includes('ct') || lowerName.includes('mri') || lowerName.includes('cắt lớp')) {
      return `Chỉ định chụp Kỹ thuật cao tăng mạnh do các khoa Ngoại thần kinh, Chấn thương chỉnh hình và Cấp cứu điều trị bệnh nhân nặng.`;
    }
    if (lowerName.includes('nội soi') || lowerName.includes('dạ dày') || lowerName.includes('đại tràng')) {
      return `Bệnh nhân khám chuyên khoa Tiêu hóa ngoại trú tăng cao kết hợp số ca can thiệp cầm máu và polyp theo lịch chỉ định.`;
    }
    if (lowerName.includes('khí máu') || lowerName.includes('men tim') || lowerName.includes('cấp cứu')) {
      return `Khoa Cấp cứu & Hồi sức tích cực (ICU) tiếp nhận ca bệnh nặng hô hấp/tim mạch chuyển biến cần theo dõi liên tục.`;
    }
    return `Số ca thực hiện tăng đột biến +${pct.toFixed(0)}% so với trung bình ${mean.toFixed(1)} ca/ngày do cao điểm khám bệnh đầu tuần và chuyển tuyến.`;
  }

  if (severity === 'DROP_CRITICAL' || severity === 'DROP_MODERATE') {
    if (today === 0) {
      return `Không ghi nhận ca thực hiện trong ngày. Cần kiểm tra ngay tình trạng thiết bị (bảo trì/sự cố bóng phát/đầu dò) hoặc thiếu vật tư tiêu hao.`;
    }
    return `Số ca sụt giảm ${pct.toFixed(0)}% so với mức trung bình ${mean.toFixed(1)} ca/ngày. Nguyên nhân có thể do bảo trì ca máy định kỳ hoặc phòng khám chuyển dời lịch hẹn.`;
  }

  return `Lưu lượng thực hiện duy trì ổn định quanh mức trung bình chuẩn (${mean.toFixed(1)} ca/ngày, biến động trong giới hạn cho phép ±1.2σ).`;
}

/**
 * Generate action recommendations for managers
 */
function generateClinicalRecommendations(
  name: string,
  category: string,
  severity: TriageSeverity,
  today: number,
  mean: number
): string[] {
  if (severity === 'SURGE_CRITICAL') {
    return [
      'Điều phối bổ sung 01 KTV / Bác sĩ tăng cường phòng thực hiện để giảm ùn tắc chờ đợi.',
      'Kiểm tra cơ số vật tư tiêu hao (gel, film, thuốc cản quang, bơm tiêm) đảm bảo không đứt gãy.',
      'Ưu tiên giải quyết ca cấp cứu & BHYT nội trú trước 11h30 trưa.'
    ];
  }
  if (severity === 'SURGE_MODERATE') {
    return [
      'Theo dõi tiến độ trả kết quả trên hệ thống PACS/LIS đảm bảo đúng cam kết thời gian (TAT).',
      'Sẵn sàng phương án kích hoạt bàn máy phụ nếu lượng bệnh nhân tiếp tục tăng.'
    ];
  }
  if (severity === 'DROP_CRITICAL') {
    return [
      'Xác nhận với Kỹ sư Thiết bị y tế về tình trạng máy móc (báo hỏng, bảo dưỡng, hiệu chuẩn).',
      'Kiểm tra với Khoa Dược / Vật tư xem có tình trạng tạm hết hóa chất / thuốc thử hay không.',
      'Đối soát với phòng tiếp đón xem có sai sót nhập liệu trên hệ thống HIS/LIS.'
    ];
  }
  return [
    'Quy trình vận hành ổn định, tiếp tục giám sát chỉ số kiểm soát chất lượng (QC) thường quy.'
  ];
}
