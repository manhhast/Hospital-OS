import { storageService } from './storageService';
import type { AssistantMemoryItem } from '../types/hospital';
import {
  getKnownReportYears,
  REPORT_MONTHS,
  reportArchiveService,
  type ArchivedCaseReportItem,
  type DailyCaseCount
} from './reportArchiveService';
import { isValidServiceName } from '../utils/caseReportParser';
import { filterActiveStaffProfiles, getInactiveStaffMatchers } from '../utils/staffStatus';

export interface LiveCaseDaySummary {
  year: number;
  monthKey: string;
  monthNumber: number;
  day: number;
  dateIso: string; // YYYY-MM-DD
  dateLabel: string; // DD/MM/YYYY
  dayOfWeek: string;
  totalCases: number;
  bhytCases: number;
  nhanDanCases: number;
  byCategory: Array<{
    category: string;
    total: number;
    bh: number;
    nd: number;
  }>;
  topServices: Array<{
    category: string;
    name: string;
    total: number;
    bh: number;
    nd: number;
  }>;
  services?: Array<{
    category: string;
    name: string;
    total: number;
    bh: number;
    nd: number;
  }>;
}

export interface LiveMonthSummary {
  year: number;
  monthKey: string;
  monthNumber: number;
  totalCases: number;
  bhytCases: number;
  nhanDanCases: number;
  recordedDaysCount: number;
  servicesCount: number;
  byCategory: Array<{
    category: string;
    total: number;
    bh: number;
    nd: number;
  }>;
}

export interface LiveHospitalContextSnapshot {
  generatedAt: string;
  currentDateIso: string;
  currentUser: {
    name: string;
    role: string;
    title?: string;
    department?: string;
  };
  caseReports: {
    activeYear: number;
    knownYears: number[];
    yearlyTotals: Array<{
      year: number;
      totalCases: number;
      bhytCases: number;
      nhanDanCases: number;
      monthsWithData: number;
    }>;
    monthlyTotals: LiveMonthSummary[];
    recentRecordedDays: LiveCaseDaySummary[]; // newest first, up to 15 recorded days
    latestRecordedDay: LiveCaseDaySummary | null;
    previousRecordedDay: LiveCaseDaySummary | null;
    topServicesActiveYear: Array<{
      category: string;
      name: string;
      total: number;
      bh: number;
      nd: number;
    }>;
    weekdayAverages: Array<{
      dayOfWeek: string;
      avgTotal: number;
      sampleDays: number;
    }>;
  };
  equipment: {
    totalCount: number;
    statusCounts: Record<string, number>;
    alertItems: Array<{
      code: string;
      name: string;
      room: string;
      severity: 'CRITICAL' | 'WARNING';
      reason: string;
    }>;
    items: Array<{
      id: string;
      code: string;
      name: string;
      category: string;
      model: string;
      room: string;
      status: string;
      assignedTechnician: string;
      managerInCharge?: string;
      lastMaintenanceDate: string;
      nextMaintenanceDate: string;
      calibrationExpiry?: string;
      radiationSurveyExpiry?: string;
      operatingPermitExpiry?: string;
      isLockedOut?: boolean;
      lockoutReason?: string;
      unresolvedRepairs: number;
    }>;
  };
  rooms: {
    departmentsCount: number;
    departments: Array<{ code: string; name: string; managerName?: string }>;
    roomsCount: number;
    items: Array<{
      code: string;
      name: string;
      departmentSection: string;
      floor: string;
      status: string;
      managerInCharge: string;
      deputyManager?: string;
      primaryEquipment: string;
      currentDayCases: number;
      maxCapacityCasesPerDay: number;
      utilizationRate: number;
    }>;
  };
  staff: {
    totalCount: number;
    activeCount?: number;
    items: Array<{
      userId?: string;
      fullName: string;
      title: string;
      departmentSection: string;
      room?: string;
      specialty: string;
      phone?: string;
      currentStatus?: string;
    }>;
    leaveRequests?: Array<{
      id: string;
      userId?: string;
      userName: string;
      userRole?: string;
      departmentSection?: string;
      room?: string;
      leaveType: string;
      startDate: string;
      endDate: string;
      totalDays: number;
      reason: string;
      substituteUserName?: string;
      status: string;
      approvedBy?: string;
      createdAt?: string;
    }>;
    pendingLeaveRequests: Array<{
      userName: string;
      leaveType: string;
      startDate: string;
      endDate: string;
      totalDays: number;
      reason: string;
      status: string;
    }>;
    expiringCertificates: Array<{
      staffName: string;
      certName: string;
      expiryDate: string;
      status: string;
    }>;
  };
  shifts: {
    todayAndUpcoming: Array<{
      date: string;
      title: string;
      workType?: string;
      assignedUserId?: string;
      assignedUserName?: string;
      room?: string;
      machine?: string;
      startTime?: string;
      endTime?: string;
      status?: string;
      hasPendingSwap?: boolean;
    }>;
    pendingSwapCount: number;
  };
  tasks: {
    totalCount: number;
    byStatus: Record<string, number>;
    overdueCount: number;
    activeItems: Array<{
      id: string;
      title: string;
      description?: string;
      status: string;
      priority: string;
      dueDate: string;
      assignee: string;
      taskType: string;
      level: string;
    }>;
  };
  meetings: {
    items: Array<{
      title: string;
      category: string;
      date: string;
      time: string;
      location: string;
      chairperson: string;
      status: string;
      summary?: string;
    }>;
    weeklyPlans: Array<{
      title: string;
      date?: string;
      dayOfWeek?: string;
      time?: string;
      location?: string;
      chairperson?: string;
      status?: string;
    }>;
    recentAnnouncements: Array<{
      title: string;
      category: string;
      senderName: string;
      createdAt: string;
      isUrgent: boolean;
      content: string;
    }>;
  };
  documents: {
    totalCount: number;
    expiredCount: number;
    items: Array<{
      code?: string;
      title: string;
      docType: string;
      version: string;
      uploadDate: string;
      expirationDate: string | null;
      isExpired: boolean;
      owner: string;
      note: string;
    }>;
  };
  syncHistory: {
    totalEntries: number;
    pendingDiscrepanciesCount: number;
    recentRuns: Array<{
      displayTime: string;
      trigger: string;
      dateRangeLabel: string;
      status: string;
      discrepancyCount: number;
      autoWrittenCount: number;
      summary: string;
    }>;
    pendingDiscrepancies: Array<{
      dateLabel: string;
      category: string;
      serviceName: string;
      systemBh: number | string;
      systemNd: number | string;
      sheetBh: number | string;
      sheetNd: number | string;
    }>;
  };
  assistantMemory?: {
    webSearchEnabled: boolean;
    memories: AssistantMemoryItem[];
  };
  settings?: {
    reportSheetYear?: number;
    googleSheetUrl?: string;
    reportGoogleSheetId?: string;
    reportGoogleSheetsByYear?: Record<string, { url: string; sheetId: string; updatedAt?: string }>;
  };
}

const WEEKDAY_NAMES_VI = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy'
];

function parseNumericCount(val: number | string | undefined): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val || val === 'LT') return 0;
  const parsed = parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getTodayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetweenDates(fromIso: string, toIso: string): number | null {
  if (!fromIso || !toIso) return null;
  const t1 = Date.parse(fromIso);
  const t2 = Date.parse(toIso);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

function formatDayOfWeek(year: number, monthNum: number, day: number): string {
  const dt = new Date(year, monthNum - 1, day);
  return WEEKDAY_NAMES_VI[dt.getDay()] || '';
}

function getCaseCountPair(dc?: DailyCaseCount): { bh: number; nd: number; total: number } {
  const bh = parseNumericCount(dc?.bh);
  const nd = parseNumericCount(dc?.nd);
  return { bh, nd, total: bh + nd };
}

export function buildLiveHospitalContext(): LiveHospitalContextSnapshot {
  const todayIso = getTodayIsoLocal();
  const settings = storageService.getSettings();
  const currentUser = storageService.getCurrentUser();

  // 1. Aggregate Google Sheet Case Reports across all known years
  const knownYears = getKnownReportYears(settings);
  const activeYear = settings.reportSheetYear || new Date().getFullYear();

  const yearlyTotals: LiveHospitalContextSnapshot['caseReports']['yearlyTotals'] = [];
  const monthlyTotals: LiveMonthSummary[] = [];
  const allRecordedDays: LiveCaseDaySummary[] = [];
  const serviceTotalsActiveYear = new Map<
    string,
    { category: string; name: string; total: number; bh: number; nd: number }
  >();
  const weekdayBuckets = new Map<string, { sum: number; count: number }>();

  for (const year of knownYears) {
    const yearStore = reportArchiveService.loadYearArchiveSync(year);
    let yTotal = 0;
    let yBh = 0;
    let yNd = 0;
    let monthsWithData = 0;

    REPORT_MONTHS.forEach((monthKey, idx) => {
      const monthNumber = idx + 1;
      const items: ArchivedCaseReportItem[] = Array.isArray(yearStore[monthKey]) ? yearStore[monthKey] : [];
      if (items.length === 0) return;

      let mTotal = 0;
      let mBh = 0;
      let mNd = 0;
      const catMapMonth = new Map<string, { total: number; bh: number; nd: number }>();
      const dayMap = new Map<
        number,
        {
          total: number;
          bh: number;
          nd: number;
          byCat: Map<string, { total: number; bh: number; nd: number }>;
          services: Array<{ category: string; name: string; total: number; bh: number; nd: number }>;
        }
      >();

      for (const item of items) {
        if (!item?.name || !isValidServiceName(item.name)) continue;
        const cat = item.category || 'Khác';
        const dailyData = item.dailyData || {};

        for (let day = 1; day <= 31; day++) {
          const { bh, nd, total } = getCaseCountPair(dailyData[day]);
          if (total <= 0) continue;

          mTotal += total;
          mBh += bh;
          mNd += nd;

          const mc = catMapMonth.get(cat) || { total: 0, bh: 0, nd: 0 };
          mc.total += total;
          mc.bh += bh;
          mc.nd += nd;
          catMapMonth.set(cat, mc);

          if (year === activeYear) {
            const sKey = `${cat}|||${item.name}`;
            const curS = serviceTotalsActiveYear.get(sKey) || {
              category: cat,
              name: item.name,
              total: 0,
              bh: 0,
              nd: 0
            };
            curS.total += total;
            curS.bh += bh;
            curS.nd += nd;
            serviceTotalsActiveYear.set(sKey, curS);
          }

          let dayAcc = dayMap.get(day);
          if (!dayAcc) {
            dayAcc = { total: 0, bh: 0, nd: 0, byCat: new Map(), services: [] };
            dayMap.set(day, dayAcc);
          }
          dayAcc.total += total;
          dayAcc.bh += bh;
          dayAcc.nd += nd;

          const dc = dayAcc.byCat.get(cat) || { total: 0, bh: 0, nd: 0 };
          dc.total += total;
          dc.bh += bh;
          dc.nd += nd;
          dayAcc.byCat.set(cat, dc);

          dayAcc.services.push({ category: cat, name: item.name, total, bh, nd });
        }
      }

      if (mTotal > 0) {
        monthsWithData += 1;
        yTotal += mTotal;
        yBh += mBh;
        yNd += mNd;

        monthlyTotals.push({
          year,
          monthKey,
          monthNumber,
          totalCases: mTotal,
          bhytCases: mBh,
          nhanDanCases: mNd,
          recordedDaysCount: dayMap.size,
          servicesCount: items.length,
          byCategory: Array.from(catMapMonth.entries())
            .map(([category, v]) => ({ category, ...v }))
            .sort((a, b) => b.total - a.total)
        });

        dayMap.forEach((acc, day) => {
          const padM = String(monthNumber).padStart(2, '0');
          const padD = String(day).padStart(2, '0');
          const dateIso = `${year}-${padM}-${padD}`;
          const dateLabel = `${padD}/${padM}/${year}`;
          const dow = formatDayOfWeek(year, monthNumber, day);

          if (year === activeYear && dow) {
            const wb = weekdayBuckets.get(dow) || { sum: 0, count: 0 };
            wb.sum += acc.total;
            wb.count += 1;
            weekdayBuckets.set(dow, wb);
          }

          const sortedServices = [...acc.services].sort((a, b) => b.total - a.total);
          allRecordedDays.push({
            year,
            monthKey,
            monthNumber,
            day,
            dateIso,
            dateLabel,
            dayOfWeek: dow,
            totalCases: acc.total,
            bhytCases: acc.bh,
            nhanDanCases: acc.nd,
            byCategory: Array.from(acc.byCat.entries())
              .map(([category, v]) => ({ category, ...v }))
              .sort((a, b) => b.total - a.total),
            topServices: sortedServices.slice(0, 8),
            services: sortedServices
          });
        });
      }
    });

    if (yTotal > 0 || year === activeYear) {
      yearlyTotals.push({
        year,
        totalCases: yTotal,
        bhytCases: yBh,
        nhanDanCases: yNd,
        monthsWithData
      });
    }
  }

  allRecordedDays.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const recentRecordedDays = allRecordedDays.slice(0, 60);
  const latestRecordedDay = recentRecordedDays[0] || null;
  const previousRecordedDay = recentRecordedDays[1] || null;

  const weekdayAverages = WEEKDAY_NAMES_VI.map(dow => {
    const b = weekdayBuckets.get(dow);
    return {
      dayOfWeek: dow,
      avgTotal: b && b.count > 0 ? Math.round(b.sum / b.count) : 0,
      sampleDays: b?.count || 0
    };
  });

  // 2. Equipment & Alerts
  const rawEquipment = storageService.getEquipment();
  const eqStatusCounts: Record<string, number> = {};
  const eqAlerts: LiveHospitalContextSnapshot['equipment']['alertItems'] = [];

  const equipmentItems = rawEquipment.map(eq => {
    eqStatusCounts[eq.status] = (eqStatusCounts[eq.status] || 0) + 1;
    const unresolvedRepairs = (eq.repairHistory || []).filter(r => r.status !== 'Đã khôi phục').length;

    if (eq.isLockedOut || eq.status === 'Sự cố hỏng hóc') {
      eqAlerts.push({
        code: eq.code,
        name: eq.name,
        room: eq.room,
        severity: 'CRITICAL',
        reason: eq.isLockedOut
          ? `Đang khóa an toàn: ${eq.lockoutReason || 'Chưa rõ nguyên nhân'}`
          : `Đang gặp sự cố hỏng hóc (${unresolvedRepairs} phiếu sửa chưa xong)`
      });
    } else if (eq.status === 'Cần bảo trì' || eq.status === 'Đang hiệu chuẩn') {
      eqAlerts.push({
        code: eq.code,
        name: eq.name,
        room: eq.room,
        severity: 'WARNING',
        reason: `Trạng thái hiện tại: ${eq.status}`
      });
    }

    const checkDateAlert = (dateStr: string | undefined, label: string) => {
      if (!dateStr) return;
      const diff = daysBetweenDates(todayIso, dateStr);
      if (diff !== null && diff <= 30) {
        eqAlerts.push({
          code: eq.code,
          name: eq.name,
          room: eq.room,
          severity: diff < 0 ? 'CRITICAL' : 'WARNING',
          reason:
            diff < 0
              ? `${label} đã quá hạn ${Math.abs(diff)} ngày (${dateStr})`
              : `${label} sắp đến hạn sau ${diff} ngày (${dateStr})`
        });
      }
    };

    checkDateAlert(eq.nextMaintenanceDate, 'Bảo trì định kỳ');
    checkDateAlert(eq.calibrationExpiry, 'Hiệu chuẩn ISO');
    checkDateAlert(eq.radiationSurveyExpiry, 'Kiểm xạ ATBX');
    checkDateAlert(eq.operatingPermitExpiry, 'Giấy phép vận hành');

    return {
      id: eq.id,
      code: eq.code,
      name: eq.name,
      category: eq.category,
      model: eq.model,
      room: eq.room,
      status: eq.status,
      assignedTechnician: eq.assignedTechnician,
      managerInCharge: eq.managerInCharge,
      lastMaintenanceDate: eq.lastMaintenanceDate,
      nextMaintenanceDate: eq.nextMaintenanceDate,
      calibrationExpiry: eq.calibrationExpiry,
      radiationSurveyExpiry: eq.radiationSurveyExpiry,
      operatingPermitExpiry: eq.operatingPermitExpiry,
      isLockedOut: eq.isLockedOut,
      lockoutReason: eq.lockoutReason,
      unresolvedRepairs
    };
  });

  // 3. Departments & Rooms
  const departments = storageService.getDepartments();
  const rooms = storageService.getRooms();

  // 4. Staff & Leave & Certificates
  const staffProfiles = storageService.getStaffProfiles();
  const inactiveStaff = getInactiveStaffMatchers(staffProfiles);
  const activeStaffProfiles = filterActiveStaffProfiles(staffProfiles);
  const profileByUserId = new Map(staffProfiles.map(s => [s.userId, s]));
  const profileByName = new Map(
    staffProfiles.map(s => [(s.fullName || '').trim().toLowerCase(), s])
  );

  const rawLeaveRequests = storageService.getLeaveRequests();
  const leaveRequests = rawLeaveRequests
    .filter(
      l =>
        !inactiveStaff.ids.has(l.userId) &&
        !inactiveStaff.names.has((l.userName || '').trim().toLowerCase())
    )
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  const expiringCertificates: LiveHospitalContextSnapshot['staff']['expiringCertificates'] = [];

  staffProfiles.forEach(s => {
    (s.certificates || []).forEach(c => {
      if (c.status !== 'Còn hiệu lực') {
        expiringCertificates.push({
          staffName: s.fullName,
          certName: c.name,
          expiryDate: c.expiryDate,
          status: c.status
        });
      }
    });
  });

  // 5. Shifts (from -14 days to +21 days so current week / last week / next 3 weeks are all covered)
  const rawShifts = storageService.getShifts();
  const upcomingShifts = rawShifts
    .filter(s => {
      const diff = daysBetweenDates(todayIso, s.date);
      return diff !== null && diff >= -14 && diff <= 21;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 150);
  const pendingSwapCount = rawShifts.filter(s => s.swapRequest?.status === 'Chờ duyệt').length;

  // 6. Tasks
  const rawTasks = storageService.getTasks();
  const taskByStatus: Record<string, number> = {};
  let overdueCount = 0;
  rawTasks.forEach(t => {
    taskByStatus[t.status] = (taskByStatus[t.status] || 0) + 1;
    if (
      t.status !== 'Đã hoàn thành' &&
      t.status !== 'Hủy' &&
      t.dueDate &&
      t.dueDate < todayIso
    ) {
      overdueCount += 1;
    }
  });
  const activeTaskItems = rawTasks
    .filter(t => t.status !== 'Hủy')
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 60)
    .map(t => ({
      id: t.id,
      title: t.title,
      description: t.description ? t.description.slice(0, 160) : undefined,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      assignee: t.assignee,
      taskType: t.taskType,
      level: t.level
    }));

  // 7. Meetings & Announcements
  const meetingItems = storageService.getMeetingItems();
  const weeklyMeetings = storageService.getMeetings();
  const announcements = storageService.getAnnouncements();

  // 8. Documents / SOPs
  const docs = storageService.getDocuments();
  const expiredDocsCount = docs.filter(d => d.isExpired).length;

  // 9. Sync History
  const syncHistory = storageService.getSyncHistory();
  const pendingDiscrepancies: LiveHospitalContextSnapshot['syncHistory']['pendingDiscrepancies'] = [];
  syncHistory.forEach(entry => {
    (entry.discrepancies || []).forEach(d => {
      if (!d.resolutionStatus || d.resolutionStatus === 'pending') {
        pendingDiscrepancies.push({
          dateLabel: d.dateLabel,
          category: d.category,
          serviceName: d.serviceName,
          systemBh: d.systemBh,
          systemNd: d.systemNd,
          sheetBh: d.sheetBh,
          sheetNd: d.sheetNd
        });
      }
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    currentDateIso: todayIso,
    currentUser: {
      name: currentUser.name,
      role: currentUser.role,
      title: currentUser.title,
      department: currentUser.department
    },
    caseReports: {
      activeYear,
      knownYears,
      yearlyTotals,
      monthlyTotals,
      recentRecordedDays,
      latestRecordedDay,
      previousRecordedDay,
      topServicesActiveYear: Array.from(serviceTotalsActiveYear.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 15),
      weekdayAverages
    },
    equipment: {
      totalCount: equipmentItems.length,
      statusCounts: eqStatusCounts,
      alertItems: eqAlerts.slice(0, 25),
      items: equipmentItems.slice(0, 60)
    },
    rooms: {
      departmentsCount: departments.length,
      departments: departments.map(d => ({
        code: d.code,
        name: d.name,
        managerName: d.managerName
      })),
      roomsCount: rooms.length,
      items: rooms.slice(0, 60).map(r => ({
        code: r.code,
        name: r.name,
        departmentSection: r.departmentSection,
        floor: r.floor,
        status: r.status,
        managerInCharge: r.managerInCharge || '',
        deputyManager: r.deputyManager || '',
        primaryEquipment: r.primaryEquipment || '',
        currentDayCases: r.currentDayCases,
        maxCapacityCasesPerDay: r.maxCapacityCasesPerDay,
        utilizationRate: r.utilizationRate
      }))
    },
    staff: {
      totalCount: staffProfiles.length,
      activeCount: activeStaffProfiles.length,
      items: staffProfiles.slice(0, 100).map(s => ({
        userId: s.userId,
        fullName: s.fullName,
        title: s.title,
        departmentSection: s.departmentSection,
        room: s.room,
        specialty: s.specialty,
        phone: s.phone,
        currentStatus: s.currentStatus
      })),
      leaveRequests: leaveRequests.slice(0, 150).map(l => {
        const matchedProfile =
          profileByUserId.get(l.userId) ||
          profileByName.get((l.userName || '').trim().toLowerCase());
        return {
          id: l.id,
          userId: l.userId,
          userName: l.userName,
          userRole: l.userRole,
          departmentSection: matchedProfile?.departmentSection || '',
          room: matchedProfile?.room || '',
          leaveType: l.leaveType,
          startDate: l.startDate,
          endDate: l.endDate,
          totalDays: l.totalDays,
          reason: l.reason,
          substituteUserName: l.substituteUserName,
          status: l.status,
          approvedBy: l.approvedBy,
          createdAt: l.createdAt
        };
      }),
      pendingLeaveRequests: leaveRequests
        .filter(l => l.status === 'Chờ duyệt')
        .slice(0, 30)
        .map(l => ({
          userName: l.userName,
          leaveType: l.leaveType,
          startDate: l.startDate,
          endDate: l.endDate,
          totalDays: l.totalDays,
          reason: l.reason,
          status: l.status
        })),
      expiringCertificates: expiringCertificates.slice(0, 25)
    },
    shifts: {
      todayAndUpcoming: upcomingShifts.map(s => ({
        date: s.date,
        title: s.title || s.shiftName || 'Ca làm việc',
        workType: s.workType,
        assignedUserId: s.assignedUserId || s.userId,
        assignedUserName: s.assignedUserName || s.userName,
        room: s.room || s.roomLocation,
        machine: s.machine,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        hasPendingSwap: s.swapRequest?.status === 'Chờ duyệt'
      })),
      pendingSwapCount
    },
    tasks: {
      totalCount: rawTasks.length,
      byStatus: taskByStatus,
      overdueCount,
      activeItems: activeTaskItems
    },
    meetings: {
      items: meetingItems.slice(0, 15).map(m => ({
        title: m.title,
        category: m.category,
        date: m.date,
        time: m.time,
        location: m.location,
        chairperson: m.chairperson,
        status: m.status,
        summary: m.minutes?.summary
      })),
      weeklyPlans: weeklyMeetings.slice(0, 15).map(w => ({
        title: w.title,
        date: w.date,
        dayOfWeek: w.dayOfWeek,
        time: w.time,
        location: w.location,
        chairperson: w.chairperson,
        status: w.status
      })),
      recentAnnouncements: announcements.slice(0, 10).map(a => ({
        title: a.title,
        category: a.category,
        senderName: a.senderName,
        createdAt: a.createdAt,
        isUrgent: a.isUrgent,
        content: a.content.slice(0, 280)
      }))
    },
    documents: {
      totalCount: docs.length,
      expiredCount: expiredDocsCount,
      items: docs.slice(0, 40).map(d => ({
        code: d.code,
        title: d.title,
        docType: d.docType,
        version: d.version,
        uploadDate: d.uploadDate,
        expirationDate: d.expirationDate,
        isExpired: d.isExpired,
        owner: d.owner,
        note: (d.note || '').slice(0, 200)
      }))
    },
    syncHistory: {
      totalEntries: syncHistory.length,
      pendingDiscrepanciesCount: pendingDiscrepancies.length,
      recentRuns: syncHistory.slice(0, 5).map(e => ({
        displayTime: e.displayTime,
        trigger: e.trigger,
        dateRangeLabel: e.dateRangeLabel,
        status: e.status,
        discrepancyCount: e.discrepancyCount,
        autoWrittenCount: e.autoWrittenCount,
        summary: e.summary
      })),
      pendingDiscrepancies: pendingDiscrepancies.slice(0, 20)
    },
    assistantMemory: {
      webSearchEnabled: storageService.getSettings().aiWebSearchEnabled !== false,
      memories: storageService.getAssistantMemories().slice(0, 60)
    },
    settings: {
      reportSheetYear: settings.reportSheetYear,
      googleSheetUrl: settings.googleSheetUrl || '',
      reportGoogleSheetId: settings.reportGoogleSheetId || '',
      reportGoogleSheetsByYear: settings.reportGoogleSheetsByYear || {}
    }
  };
}

let syncDebounceTimer: number | null = null;
let lastSyncPayloadHash = '';

export async function syncLiveContextToServer(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const liveContext = buildLiveHospitalContext();
    const settings = storageService.getSettings();
    const botToken = (settings.telegramBotToken || '').trim();
    const defaultChatId = (settings.defaultTelegramChatId || '').trim();
    const enabled = settings.telegramQaEnabled !== false && botToken.length > 10;

    const payload = {
      liveContext,
      telegramConfig: {
        botToken,
        defaultChatId,
        enabled
      }
    };

    const quickSignature = JSON.stringify({
      d: liveContext.currentDateIso,
      y: liveContext.caseReports.yearlyTotals,
      m: liveContext.caseReports.monthlyTotals.length,
      eq: liveContext.equipment.totalCount,
      rm: liveContext.rooms.roomsCount,
      st: liveContext.staff.totalCount,
      lr: (liveContext.staff.leaveRequests || []).map(l => `${l.id}:${l.status}:${l.startDate}`).slice(0, 30).join(','),
      tk: liveContext.tasks.totalCount,
      sh: liveContext.shifts.todayAndUpcoming.length,
      doc: liveContext.documents.totalCount,
      sy: liveContext.syncHistory.pendingDiscrepanciesCount,
      mem: (liveContext.assistantMemory?.memories || []).map(m => m.id).join(','),
      web: liveContext.assistantMemory?.webSearchEnabled !== false,
      gs: `${settings.reportSheetYear || ''}:${settings.googleSheetUrl || ''}:${settings.reportGoogleSheetId || ''}:${Object.entries(settings.reportGoogleSheetsByYear || {}).map(([y, c]) => `${y}=${c?.sheetId || c?.url || ''}`).join(',')}`,
      tg: botToken ? `${botToken.slice(-6)}_${enabled}_${defaultChatId}` : 'none'
    });

    if (!force && quickSignature === lastSyncPayloadHash) {
      return true;
    }

    const res = await fetch('/api/assistant/sync-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      lastSyncPayloadHash = quickSignature;
      try {
        const json = await res.json();
        const tgMemories = Array.isArray(json?.telegramLearnedMemories)
          ? json.telegramLearnedMemories
          : [];
        if (tgMemories.length > 0) {
          const existingSet = new Set(
            storageService.getAssistantMemories().map((m) => m.content.trim().toLowerCase())
          );
          for (const tm of tgMemories) {
            const clean = String(tm?.content || '').trim();
            if (clean && !existingSet.has(clean.toLowerCase())) {
              existingSet.add(clean.toLowerCase());
              storageService.addAssistantMemory({
                content: clean,
                category: tm.category || 'fact',
                source: 'telegram'
              });
            }
          }
        }
      } catch {
        // ignore parse edge cases
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function scheduleLiveContextSync(delayMs = 800): void {
  if (typeof window === 'undefined') return;
  if (syncDebounceTimer !== null) {
    window.clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = window.setTimeout(() => {
    syncDebounceTimer = null;
    void syncLiveContextToServer(false);
  }, delayMs);
}
