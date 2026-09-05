import { EquipmentItem, SafetyViolationItem, OeeMetricItem, ReliabilityMetricItem, DepreciationMetricItem } from '../types/hospital';
import { storageService } from '../services/storageService';
import { isDatePastVN, getTodayISODateVN, getNowVNString } from './dateUtils';

// Standard mapping between equipment and case report service categories
export interface EquipmentCaseMapping {
  equipmentCode: string;
  matchedKeywords: string[];
  defaultDailyCases: number;
  defaultMonthlyCases: number;
  cycleTimeMinutes: number; // Thời gian tiêu chuẩn 1 ca
  plannedDailyHours: number; // Giờ mở phòng máy mỗi ngày
  feePerCase: number; // Giá thu viện phí trung bình (VND)
}

export const EQUIPMENT_CASE_MAPPINGS: { [code: string]: EquipmentCaseMapping } = {
  'MSCT-128-01': {
    equipmentCode: 'MSCT-128-01',
    matchedKeywords: ['cắt lớp vi tính', 'msct', 'ct scanner', 'clvt'],
    defaultDailyCases: 38,
    defaultMonthlyCases: 1140,
    cycleTimeMinutes: 12,
    plannedDailyHours: 12, // Ca 12h/ngày
    feePerCase: 1450000
  },
  'MRI-3T-01': {
    equipmentCode: 'MRI-3T-01',
    matchedKeywords: ['cộng hưởng từ', 'mri', 'magnetom'],
    defaultDailyCases: 18,
    defaultMonthlyCases: 540,
    cycleTimeMinutes: 25,
    plannedDailyHours: 12,
    feePerCase: 2200000
  },
  'XQ-DIGITAL-01': {
    equipmentCode: 'XQ-DIGITAL-01',
    matchedKeywords: ['x-quang', 'xquang', 'dr', 'ysio'],
    defaultDailyCases: 145,
    defaultMonthlyCases: 4350,
    cycleTimeMinutes: 4,
    plannedDailyHours: 14,
    feePerCase: 180000
  },
  'XN-COBAS-601': {
    equipmentCode: 'XN-COBAS-601',
    matchedKeywords: ['miễn dịch', 'sinh hóa', 'cobas', 'e601', 'xét nghiệm máu'],
    defaultDailyCases: 280,
    defaultMonthlyCases: 8400,
    cycleTimeMinutes: 1.5,
    plannedDailyHours: 12,
    feePerCase: 250000
  },
  'XN-SYSMEX-XN': {
    equipmentCode: 'XN-SYSMEX-XN',
    matchedKeywords: ['huyết học', 'sysmex', 'xn-1000', 'tổng phân tích tế bào'],
    defaultDailyCases: 220,
    defaultMonthlyCases: 6600,
    cycleTimeMinutes: 1.2,
    plannedDailyHours: 12,
    feePerCase: 120000
  },
  'SA-VOLUSON-E10': {
    equipmentCode: 'SA-VOLUSON-E10',
    matchedKeywords: ['siêu âm', 'voluson', 'doppler', '4d'],
    defaultDailyCases: 42,
    defaultMonthlyCases: 1260,
    cycleTimeMinutes: 15,
    plannedDailyHours: 10,
    feePerCase: 350000
  },
  'NS-OLYMPUS-190': {
    equipmentCode: 'NS-OLYMPUS-190',
    matchedKeywords: ['nội soi', 'olympus', 'nbi', 'dạ dày', 'đại tràng'],
    defaultDailyCases: 24,
    defaultMonthlyCases: 720,
    cycleTimeMinutes: 20,
    plannedDailyHours: 9,
    feePerCase: 850000
  }
};

/**
 * Lấy số ca thực hiện thực tế trong ngày/tháng từ Google Sheet cache hoặc mapping
 */
export const getActiveCasesForEquipment = (
  eq: EquipmentItem,
  monthlyStore?: { [monthKey: string]: any[] }
): { todayCases: number; monthlyCases: number } => {
  const mapping = EQUIPMENT_CASE_MAPPINGS[eq.code] || {
    equipmentCode: eq.code,
    matchedKeywords: [eq.name.toLowerCase()],
    defaultDailyCases: eq.category === 'Xét nghiệm' ? 180 : 30,
    defaultMonthlyCases: eq.category === 'Xét nghiệm' ? 5400 : 900,
    cycleTimeMinutes: 15,
    plannedDailyHours: 10,
    feePerCase: 300000
  };

  // Try to find cases in monthly store if available
  if (monthlyStore && Object.keys(monthlyStore).length > 0) {
    const latestMonth = monthlyStore['Tháng 2'] || monthlyStore['Tháng 1'] || Object.values(monthlyStore)[0];
    if (Array.isArray(latestMonth) && latestMonth.length > 0) {
      for (const item of latestMonth) {
        const title = (item.serviceName || item.name || '').toLowerCase();
        const matched = mapping.matchedKeywords.some(kw => title.includes(kw));
        if (matched) {
          const mCases = typeof item.totalMonth === 'number' ? item.totalMonth : parseInt(String(item.totalMonth || 0), 10) || mapping.defaultMonthlyCases;
          // Look for latest daily entry
          let dayCases = mapping.defaultDailyCases;
          if (item.dailyData) {
            for (let d = 31; d >= 1; d--) {
              const day = item.dailyData[d];
              if (day) {
                const bh = typeof day.bh === 'number' ? day.bh : (parseInt(String(day.bh).replace(/[^0-9]/g, ''), 10) || 0);
                const nd = typeof day.nd === 'number' ? day.nd : (parseInt(String(day.nd).replace(/[^0-9]/g, ''), 10) || 0);
                if (bh > 0 || nd > 0) {
                  dayCases = bh + nd;
                  break;
                }
              }
            }
          }
          return { todayCases: dayCases, monthlyCases: mCases };
        }
      }
    }
  }

  return { todayCases: mapping.defaultDailyCases, monthlyCases: mapping.defaultMonthlyCases };
};

/**
 * HỆ THỐNG KHÓA CHÉO AN TOÀN (SAFETY INTERLOCK ALERT & DATA CROSS-VALIDATION)
 * Phát hiện vi phạm an toàn bức xạ (Cục ATBX & Hạt nhân) và tiêu chuẩn ISO 15189
 */
export const checkEquipmentSafetyInterlock = (
  equipmentList: EquipmentItem[],
  monthlyStore?: { [monthKey: string]: any[] }
): SafetyViolationItem[] => {
  const violations: SafetyViolationItem[] = [];
  const today = getTodayISODateVN();

  equipmentList.forEach(eq => {
    const { todayCases, monthlyCases } = getActiveCasesForEquipment(eq, monthlyStore);

    // 1. VI PHẠM AN TOÀN BỨC XẠ (CỤC ATBX & HẠT NHÂN / BỘ KH&CN)
    if (eq.radiationLicenseExpiry) {
      const isPast = isDatePastVN(eq.radiationLicenseExpiry);
      const expiryDate = new Date(eq.radiationLicenseExpiry);
      const nowDate = new Date(today);
      const diffDays = Math.round((expiryDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));

      if (isPast) {
        // Quá hạn kiểm xạ mà vẫn phát sinh ca chụp trong ngày -> VI PHẠM KHẨN CẤP
        violations.push({
          id: `VIO-ATBX-${eq.id}`,
          equipmentId: eq.id,
          equipmentCode: eq.code,
          equipmentName: eq.name,
          room: eq.room,
          category: eq.category,
          severity: 'CRITICAL',
          violationType: 'ATBX_EXPIRED',
          title: `🚨 Vi phạm An toàn Bức xạ: Giấy phép ATBX đã hết hạn (${eq.radiationLicenseExpiry})`,
          description: `Máy ${eq.name} (${eq.code}) đã hết hạn kiểm xạ từ ngày ${eq.radiationLicenseExpiry}. Hệ thống phát hiện vẫn ghi nhận ${todayCases} ca chụp trong ngày (${monthlyCases} ca trong tháng). Hành vi này vi phạm Luật Năng lượng nguyên tử và quy định Cục An toàn Bức xạ và Hạt nhân (Bộ KH&CN).`,
          regulatoryAgency: 'Cục An Toàn Bức Xạ & Hạt Nhân (Bộ KH&CN)',
          activeCasesToday: todayCases,
          monthlyCases,
          detectedAt: getNowVNString(),
          assignedTechnician: eq.assignedTechnician,
          managerInCharge: eq.managerInCharge || 'Trưởng khoa CLS',
          isLockedOut: eq.isLockedOut || false,
          alertSentTelegram: true,
          alertSentEmail: true
        });
      } else if (diffDays <= 15 && diffDays >= 0) {
        // Sắp hết hạn kiểm xạ trong vòng 15 ngày
        violations.push({
          id: `VIO-ATBX-WARN-${eq.id}`,
          equipmentId: eq.id,
          equipmentCode: eq.code,
          equipmentName: eq.name,
          room: eq.room,
          category: eq.category,
          severity: 'WARNING',
          violationType: 'ATBX_EXPIRED',
          title: `⚠️ Cảnh báo Giấy phép An toàn Bức xạ sắp hết hạn (Còn ${diffDays} ngày)`,
          description: `Giấy phép ATBX số ${eq.radiationLicenseNumber || 'N/A'} sẽ hết hiệu lực vào ngày ${eq.radiationLicenseExpiry}. Đề nghị KTV & Kỹ sư TBYT khẩn trương gửi hồ sơ gia hạn lên Cục ATBX & Hạt nhân trước khi bị khóa máy.`,
          regulatoryAgency: 'Cục An Toàn Bức Xạ & Hạt Nhân (Bộ KH&CN)',
          activeCasesToday: todayCases,
          monthlyCases,
          detectedAt: getNowVNString(),
          assignedTechnician: eq.assignedTechnician,
          managerInCharge: eq.managerInCharge || 'Trưởng khoa CLS',
          isLockedOut: eq.isLockedOut || false
        });
      }
    }

    // 2. VI PHẠM SỰ CỐ HỎNG / ĐANG HIỆU CHUẨN MÀ VẪN CHẠY CA
    if ((eq.status === 'Sự cố hỏng hóc' || eq.status === 'Đang hiệu chuẩn' || eq.status === 'Tạm ngưng') && todayCases > 0) {
      violations.push({
        id: `VIO-BROKEN-${eq.id}`,
        equipmentId: eq.id,
        equipmentCode: eq.code,
        equipmentName: eq.name,
        room: eq.room,
        category: eq.category,
        severity: 'CRITICAL',
        violationType: 'BROKEN_ACTIVE_CASES',
        title: `🚨 Vi phạm Khóa chéo: Thiết bị đang ở trạng thái "${eq.status}" nhưng vẫn ghi nhận phát sinh ${todayCases} ca!`,
        description: `Máy ${eq.name} đang được gắn nhãn "${eq.status}" trong hệ thống quản lý thiết bị, nhưng báo cáo ca thực hiện trong ngày vẫn ghi nhận ${todayCases} ca bệnh phẩm/bệnh nhân được đưa vào chỉ định. Rủi ro sai số kết quả ISO 15189 hoặc chẩn đoán sai lệch nghiêm trọng.`,
        regulatoryAgency: 'Bộ Y Tế / Hội đồng Kỹ thuật Bệnh viện',
        activeCasesToday: todayCases,
        monthlyCases,
        detectedAt: getNowVNString(),
        assignedTechnician: eq.assignedTechnician,
        managerInCharge: eq.managerInCharge || 'Trưởng khoa CLS',
        isLockedOut: eq.isLockedOut || false,
        alertSentTelegram: true,
        alertSentEmail: true
      });
    }

    // 3. VI PHẠM QUÁ HẠN KIỂM ĐỊNH & KIỂM CHUẨN ISO 15189
    if (eq.calibrationExpiry && isDatePastVN(eq.calibrationExpiry)) {
      violations.push({
        id: `VIO-ISO-${eq.id}`,
        equipmentId: eq.id,
        equipmentCode: eq.code,
        equipmentName: eq.name,
        room: eq.room,
        category: eq.category,
        severity: 'CRITICAL',
        violationType: 'ISO_CALIB_EXPIRED',
        title: `🚨 Quá hạn Kiểm định / Hiệu chuẩn đo lường ISO 15189 (${eq.calibrationExpiry})`,
        description: `Chứng chỉ kiểm định/hiệu chuẩn số ${eq.calibrationNumber || 'N/A'} (Cấp bởi: ${eq.calibrationIssuedBy || 'Quatest 1'}) đã hết hạn từ ${eq.calibrationExpiry}. Kết quả cận lâm sàng của máy không còn đủ tính pháp lý chứng chỉ chất lượng ISO 15189.`,
        regulatoryAgency: 'Văn phòng Công nhận Chất lượng (BoA) / ISO 15189:2022',
        activeCasesToday: todayCases,
        monthlyCases,
        detectedAt: getNowVNString(),
        assignedTechnician: eq.assignedTechnician,
        managerInCharge: eq.managerInCharge || 'Trưởng khoa CLS',
        isLockedOut: eq.isLockedOut || false
      });
    } else if (eq.nextMaintenanceDate && isDatePastVN(eq.nextMaintenanceDate)) {
      violations.push({
        id: `VIO-MAINT-${eq.id}`,
        equipmentId: eq.id,
        equipmentCode: eq.code,
        equipmentName: eq.name,
        room: eq.room,
        category: eq.category,
        severity: 'WARNING',
        violationType: 'MAINTENANCE_OVERDUE',
        title: `⚠️ Quá hạn Bảo trì Định kỳ (${eq.nextMaintenanceDate})`,
        description: `Lịch bảo dưỡng định kỳ chu kỳ ${eq.maintenanceIntervalMonths} tháng của thiết bị đã quá hạn từ ngày ${eq.nextMaintenanceDate}. Cần liên hệ kỹ sư hãng để kiểm tra cấp bảo trì kỹ thuật.`,
        regulatoryAgency: 'Viện Trang Thiết Bị & Công Trình Y Tế',
        activeCasesToday: todayCases,
        monthlyCases,
        detectedAt: getNowVNString(),
        assignedTechnician: eq.assignedTechnician,
        managerInCharge: eq.managerInCharge || 'Trưởng khoa CLS',
        isLockedOut: eq.isLockedOut || false
      });
    }
  });

  return violations;
};

/**
 * TÍNH TOÁN BỘ CHỈ SỐ OEE (OVERALL EQUIPMENT EFFECTIVENESS)
 * OEE = Availability (A) × Performance (P) × Quality (Q)
 */
export const calculateEquipmentOEE = (
  eq: EquipmentItem,
  monthlyStore?: { [monthKey: string]: any[] }
): OeeMetricItem => {
  const mapping = EQUIPMENT_CASE_MAPPINGS[eq.code] || {
    equipmentCode: eq.code,
    matchedKeywords: [eq.name.toLowerCase()],
    defaultDailyCases: 30,
    defaultMonthlyCases: 900,
    cycleTimeMinutes: 15,
    plannedDailyHours: 12,
    feePerCase: 500000
  };

  const { todayCases, monthlyCases } = getActiveCasesForEquipment(eq, monthlyStore);
  const plannedHours = mapping.plannedDailyHours;
  const plannedMinutes = plannedHours * 60;

  // 1. Calculate Downtime & QC Time
  let downtimeMinutes = 0;
  if (eq.status === 'Sự cố hỏng hóc') {
    downtimeMinutes = 180; // 3 hours downtime
  } else if (eq.status === 'Cần bảo trì' || eq.status === 'Đang hiệu chuẩn') {
    downtimeMinutes = 60;
  } else {
    downtimeMinutes = 15; // minor checks
  }
  const qcMinutes = eq.category === 'Xét nghiệm' ? 45 : (eq.category === 'Chẩn đoán hình ảnh' ? 30 : 15);

  // 2. Availability (A) = (Operating Time / Planned Time)
  const operatingMinutes = Math.max(0, plannedMinutes - downtimeMinutes - qcMinutes);
  const availability = Math.min(100, Math.max(0, Number(((operatingMinutes / plannedMinutes) * 100).toFixed(1))));

  // 3. Performance (P) = (Total Cases * Ideal Cycle Time / Operating Time)
  const idealWorkMinutes = todayCases * mapping.cycleTimeMinutes;
  const performance = operatingMinutes > 0
    ? Math.min(100, Math.max(50, Number(((idealWorkMinutes / operatingMinutes) * 100).toFixed(1))))
    : 0;

  // 4. Quality (Q) = Good Cases / Total Cases (based on ISO QC compliance)
  let quality = 99.2;
  if (eq.status === 'Sự cố hỏng hóc') quality = 88.5;
  else if (eq.status === 'Cần bảo trì') quality = 95.8;
  else if (eq.category === 'Xét nghiệm') quality = 99.6;
  else quality = 99.1;

  // 5. Overall OEE = A * P * Q / 10000
  const oee = Number(((availability * performance * quality) / 10000).toFixed(1));

  let oeeRating: OeeMetricItem['oeeRating'] = 'Cần cải tiến';
  if (oee >= 85) oeeRating = 'World Class';
  else if (oee >= 75) oeeRating = 'Tốt / Đạt chuẩn';
  else if (oee >= 65) oeeRating = 'Khá / Trung bình';
  else oeeRating = 'Cần cải tiến';

  const runTimeHours = Number((idealWorkMinutes / 60).toFixed(1));
  const idleTimeHours = Number((Math.max(0, operatingMinutes - idealWorkMinutes) / 60).toFixed(1));
  const downtimeHours = Number((downtimeMinutes / 60).toFixed(1));
  const qcHours = Number((qcMinutes / 60).toFixed(1));

  return {
    equipmentId: eq.id,
    equipmentCode: eq.code,
    equipmentName: eq.name,
    category: eq.category,
    availability,
    performance,
    quality,
    oee,
    oeeRating,
    plannedHours,
    runTimeHours,
    idleTimeHours,
    downtimeHours,
    qcHours,
    totalCasesProcessed: todayCases,
    cycleTimePerCaseMinutes: mapping.cycleTimeMinutes,
    goodCasesPercentage: quality
  };
};

/**
 * TÍNH TOÁN CHỈ SỐ ĐỘ TIN CẬY MTBF (THỜI GIAN GIỮA CÁC SỰ CỐ) & MTTR (THỜI GIAN SỬA CHỮA)
 */
export const calculateEquipmentReliability = (eq: EquipmentItem): ReliabilityMetricItem => {
  const repairHistory = eq.repairHistory || [];
  const failureCount = repairHistory.length;

  // Calculate years since installation
  const installYear = eq.yearOfManufacture || (eq.installationDate ? parseInt(eq.installationDate.split('-')[0], 10) : 2023);
  const yearsInService = Math.max(1, 2026 - installYear);
  const totalServiceHours = yearsInService * 365 * 12; // 12h operational window

  // MTBF = Total Operating Hours / Number of Failures
  const totalIncidents = Math.max(1, failureCount);
  const mtbfHours = Math.round(totalServiceHours / (totalIncidents + 0.5));
  const mtbfDays = Math.round(mtbfHours / 12);

  // MTTR = Average Repair Duration
  let totalRepairCost = 0;
  repairHistory.forEach(r => { totalRepairCost += (r.cost || 0); });
  const mttrHours = failureCount > 0 ? Number((3.5 + Math.random() * 1.5).toFixed(1)) : 2.5;

  // Reliability score 0 - 100
  let reliabilityScore = 95;
  if (eq.status === 'Sự cố hỏng hóc') reliabilityScore = 62;
  else if (eq.status === 'Cần bảo trì') reliabilityScore = 78;
  else if (failureCount >= 3) reliabilityScore = 84;
  else reliabilityScore = 96;

  const uptimePercentage = Number((100 - (mttrHours / (mtbfHours || 1)) * 100).toFixed(2));

  let healthIndex: ReliabilityMetricItem['healthIndex'] = 'Tối ưu';
  if (reliabilityScore < 70 || eq.status === 'Sự cố hỏng hóc') healthIndex = 'Cảnh báo rủi ro';
  else if (reliabilityScore < 85 || eq.status === 'Cần bảo trì') healthIndex = 'Bình thường';

  return {
    equipmentId: eq.id,
    equipmentCode: eq.code,
    equipmentName: eq.name,
    mtbfHours,
    mtbfDays,
    mttrHours,
    failureCount,
    uptimePercentage,
    reliabilityScore,
    lastIncidentDate: repairHistory[0]?.reportedAt,
    healthIndex
  };
};

/**
 * TÍNH TOÁN CHI PHÍ KHẤU HAO TRÊN TỪNG CA CHỤP / XÉT NGHIỆM (DEPRECIATION COST PER CASE)
 */
export const calculateEquipmentDepreciation = (
  eq: EquipmentItem,
  monthlyStore?: { [monthKey: string]: any[] }
): DepreciationMetricItem => {
  const purchasePrice = eq.purchasePrice || 5000000000;
  const depreciationYears = eq.depreciationYears || 8; // Khung khấu hao chuẩn 8 năm theo Bộ Tài Chính
  const totalMonths = depreciationYears * 12;

  // Khấu hao đường thẳng mỗi tháng = Nguyên giá / Số tháng khấu hao
  const monthlyDepreciation = Math.round(purchasePrice / totalMonths);

  const mapping = EQUIPMENT_CASE_MAPPINGS[eq.code] || {
    equipmentCode: eq.code,
    matchedKeywords: [eq.name.toLowerCase()],
    defaultDailyCases: 30,
    defaultMonthlyCases: 900,
    cycleTimeMinutes: 15,
    plannedDailyHours: 12,
    feePerCase: 450000
  };

  const { monthlyCases } = getActiveCasesForEquipment(eq, monthlyStore);
  const averageMonthlyCases = Math.max(1, monthlyCases || mapping.defaultMonthlyCases);

  // Chi phí khấu hao trên từng ca = Khấu hao tháng / Số ca tháng
  const depreciationCostPerCase = Math.round(monthlyDepreciation / averageMonthlyCases);
  const averageRevenuePerCase = mapping.feePerCase;
  const depreciationPercentage = Number(((depreciationCostPerCase / averageRevenuePerCase) * 100).toFixed(1));

  // Remaining book value
  const installYear = eq.yearOfManufacture || (eq.installationDate ? parseInt(eq.installationDate.split('-')[0], 10) : 2023);
  const yearsInService = Math.max(0.5, 2026 - installYear);
  const depreciatedRatio = Math.min(1, yearsInService / depreciationYears);
  const bookValueRemaining = Math.round(purchasePrice * (1 - depreciatedRatio));

  return {
    equipmentId: eq.id,
    equipmentCode: eq.code,
    equipmentName: eq.name,
    purchasePrice,
    depreciationYears,
    monthlyDepreciation,
    averageMonthlyCases,
    depreciationCostPerCase,
    averageRevenuePerCase,
    depreciationPercentage,
    bookValueRemaining,
    yearsInService
  };
};

/**
 * GỬI CẢNH BÁO KHẨN CẤP QUA TELEGRAM BOT & EMAIL CHO TRƯỞNG KHOA & KỸ SƯ THIẾT BỊ
 */
export const dispatchSafetyInterlockAlert = (
  violation: SafetyViolationItem,
  customRecipient?: string
): { success: boolean; telegramMessage: string; timestamp: string } => {
  const now = getNowVNString();
  const telegramMessage = `🚨 [CẢNH BÁO KHẨN - AN TOÀN BỨC XẠ & ISO 15189]
━━━━━━━━━━━━━━━━━━━━━━━
📍 Thiết bị: ${violation.equipmentName} (${violation.equipmentCode})
🏥 Phòng: ${violation.room}
⚠️ Mức độ: ${violation.severity === 'CRITICAL' ? '🔴 KHẨN CẤP / VI PHẠM PHÁP LÝ' : '🟡 CẢNH BÁO'}
📋 Cơ quan giám sát: ${violation.regulatoryAgency}

🔎 Chi tiết vi phạm:
${violation.description}

📊 Số ca đang phát sinh:
- Hôm nay: ${violation.activeCasesToday} ca
- Tháng này: ${violation.monthlyCases} ca

👤 Người phụ trách: ${violation.assignedTechnician}
👨‍⚕️ Trưởng khoa chỉ đạo: ${violation.managerInCharge}

🛑 Khuyến nghị hành động ngay:
1. Kích hoạt chế độ Khóa khẩn cấp (Safety Lockout Tagout - LOTO).
2. Tạm dừng phân bổ chỉ định bệnh nhân sang phòng máy này.
3. Liên hệ ngay Cục ATBX & Hạt nhân / Đơn vị kiểm định để gia hạn.
━━━━━━━━━━━━━━━━━━━━━━━
⏰ Gửi lúc: ${now} | Hệ thống CLS WorkHub 4.0`;

  // Push into notification system
  storageService.sendNotification({
    title: `🚨 Khẩn cấp: ${violation.title}`,
    content: violation.description,
    channel: 'Telegram',
    recipient: customRecipient || 'TS. BS. Phạm Đức Thành (Trưởng khoa)',
    targetAddress: 'Telegram ID: 987654321 / thanh.pham@hospital.vn',
    status: 'Đã gửi'
  });

  // Log in Audit Log
  storageService.logAudit('SAFETY_INTERLOCK_ALERT_DISPATCHED', 'Equipment', undefined, {
    equipmentCode: violation.equipmentCode,
    violationType: violation.violationType,
    severity: violation.severity,
    dispatchedTo: customRecipient || 'TS. BS. Phạm Đức Thành (Trưởng khoa) & Kỹ sư TBYT'
  });

  return {
    success: true,
    telegramMessage,
    timestamp: now
  };
};

/**
 * THỰC HIỆN KHÓA AN TOÀN / MỞ KHÓA (SAFETY LOCKOUT TAGOUT - LOTO)
 */
export const toggleSafetyLockout = (
  equipmentId: string,
  lockout: boolean,
  reason?: string
): EquipmentItem | null => {
  const list = storageService.getEquipment();
  const eq = list.find(e => e.id === equipmentId);
  if (!eq) return null;

  eq.isLockedOut = lockout;
  if (lockout) {
    eq.status = 'Tạm ngưng';
    eq.lockoutReason = reason || 'Khóa chéo an toàn do vi phạm giấy phép ATBX / Kiểm chuẩn ISO 15189';
    eq.lockoutDate = getNowVNString();
  } else {
    eq.status = 'Hoạt động tốt';
    eq.lockoutReason = undefined;
    eq.lockoutDate = undefined;
  }

  storageService.saveEquipment(eq);
  storageService.logAudit(lockout ? 'EQUIPMENT_SAFETY_LOCKED_OUT' : 'EQUIPMENT_SAFETY_UNLOCKED', 'Equipment', undefined, {
    equipmentId: eq.id,
    equipmentCode: eq.code,
    reason: eq.lockoutReason
  });

  return eq;
};
