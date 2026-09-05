export interface KeyMetricsSummary {
  totalCases: number;
  averageCases: number;
  diffPercentage: number;
  bhytCount: number;
  bhytPercentage: number;
  vienPhiCount: number;
  vienPhiPercentage: number;
  emergencyCount: number;
  tatAverageMinutes: number;
}

export interface OperationalHotspot {
  area: string; // e.g. "Phòng Siêu Âm Tim - SA-02"
  serviceName: string;
  caseCount: number;
  capacityLimit: number;
  utilizationRate: number; // percentage e.g. 135%
  status: 'OVERLOAD' | 'HIGH' | 'NORMAL';
  issueDescription: string;
}

export interface EquipmentIncident {
  equipmentId: string;
  equipmentName: string;
  room: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  timestamp: string;
  description: string;
  impact: string;
  actionTaken: string;
}

export interface StaffingRecommendation {
  role: string; // e.g. "Bác sĩ Chẩn đoán hình ảnh"
  targetRoom: string; // e.g. "Phòng Siêu âm SA-02"
  shiftTime: string; // e.g. "07:30 - 11:30"
  rationale: string;
  suggestedStaffName?: string;
}

export interface MorningBriefingData {
  id: string;
  reportDate: string; // YYYY-MM-DD
  generatedAt: string; // ISO or formatted
  headline: string;
  executiveSummary: string;
  metrics: KeyMetricsSummary;
  hotspots: OperationalHotspot[];
  equipmentIssues: EquipmentIncident[];
  staffingRecommendations: StaffingRecommendation[];
  actionChecklist: string[];
  directorNotes?: string;
}

// Pillar 2: Predictive Workload & Rostering
export interface DayForecast {
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // "Thứ Hai", "Thứ Ba"...
  isWeekend: boolean;
  predictedTotal: number;
  lowerBound: number;
  upperBound: number;
  cdhaPredicted: number; // Chẩn đoán hình ảnh
  xetNghiemPredicted: number; // Xét nghiệm
  thamDoCnPredicted: number; // Thăm dò chức năng & Nội soi
  surgeRiskFactor: 'HIGH' | 'MEDIUM' | 'LOW';
  weatherOrEventContext: string;
}

export interface HourlyRosterSlot {
  timeSlot: string; // e.g. "07:30 - 09:30"
  periodName: string; // "Cao điểm sáng 1 - Lấy mẫu & Khám ngoại trú"
  expectedVolume: number; // số ca
  recommendedDoctors: number;
  recommendedTechnicians: number;
  recommendedReceivers: number;
  expectedTATMin: number;
  standardTATMin: number;
  keyDirectives: string[];
}

export interface WorkloadForecastResponse {
  forecastRange: string;
  totalPredictedWeek: number;
  peakDay: string;
  dailyForecasts: DayForecast[];
  hourlyRostering: HourlyRosterSlot[];
  departmentBreakdown: {
    cdha: number;
    xetNghiem: number;
    thamDoChucNang: number;
  };
  tatOptimizationInsights: string[];
}

// Pillar 3: ISO 15189 & SOP Copilot
export interface SOPReference {
  sopCode: string; // e.g. "SOP-CLS-XN-04"
  isoClause: string; // e.g. "ISO 15189:2022 Điều 7.3.7"
  title: string;
  category: 'XÉT NGHIỆM' | 'CĐHA' | 'NỘI SOI' | 'AN TOÀN BỨC XẠ' | 'KIỂM SOÁT NHIỄM KHUẨN' | 'QUẢN LÝ THIẾT BỊ';
  effectiveDate: string;
  downloadUrl?: string;
}

export interface ISOCopilotChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  content: string;
  references?: SOPReference[];
  actionChecklist?: string[];
  warningNote?: string;
  urgencyLevel?: 'NORMAL' | 'URGENT' | 'HIGH_RISK';
}

// Pillar 4: Predictive Maintenance AI
export interface EquipmentHealthRiskItem {
  id: string;
  name: string;
  code: string;
  model: string;
  department: string;
  room: string;
  installedYear: number;
  totalOperatingHours: number;
  cumulativeCases: number;
  daysSinceLastMaintenance: number;
  sensorTempC: number;
  sensorHumidityPct: number;
  failureProbabilityPct: number; // 0 - 100%
  healthScore: number; // 0 - 100
  riskLevel: 'CRITICAL_RISK' | 'HIGH_RISK' | 'MODERATE_RISK' | 'HEALTHY';
  criticalComponent: string; // "Bóng phát tia X-quang Varian", "Đầu dò Phased Array S5-1"...
  componentRULDays: number; // Remaining Useful Life in days
  predictedFailureWindow: string; // "7 - 14 ngày tới"
  recommendedAction: string;
  partsToOrder: string[];
  estimatedDowntimeHoursIfFailed: number;
}

export interface PredictiveMaintenanceSummary {
  totalMonitoredEquipment: number;
  criticalRiskCount: number;
  highRiskCount: number;
  healthyCount: number;
  avgDepartmentHealthScore: number;
  urgentPartsAlertsCount: number;
  equipmentList: EquipmentHealthRiskItem[];
}
