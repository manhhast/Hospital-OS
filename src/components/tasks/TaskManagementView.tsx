import React, { useState, useMemo } from 'react';
import { 
  Plus, Search, Filter, Download, Upload, Trash2, CheckCircle2, 
  Copy, Edit2, Calendar as CalendarIcon, LayoutList, Kanban, 
  MoreVertical, FileSpreadsheet, FileText, RefreshCw, X, ArrowUpDown, 
  AlertCircle, ChevronLeft, ChevronRight, Eye, Paperclip, Send, BellRing, Clock, AlertTriangle
} from 'lucide-react';
import { exportObjectsToXlsxFile, readSpreadsheetFileToObjects } from '../../utils/excelWorkbook';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TaskItem, TaskPriority, TaskStatus, TaskType, TaskRecurrence, User } from '../../types/hospital';
import { storageService } from '../../services/storageService';
import { formatDateVN, getTodayISODateVN } from '../../utils/dateUtils';
import {
  scanTaskReminders,
  getDaysDiffFromTodayVN,
  formatDaysRemainingLabel,
  dispatchTaskReminder
} from '../../utils/operationalAlerts';

interface TaskManagementViewProps {
  tasks: TaskItem[];
  onTasksUpdated: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onConfirmAction: (title: string, message: string, onConfirm: () => void, isDanger?: boolean) => void;
  isCreateOpen: boolean;
  onCloseCreateModal: () => void;
}

export const TaskManagementView: React.FC<TaskManagementViewProps> = ({
  tasks,
  onTasksUpdated,
  onShowToast,
  onConfirmAction,
  isCreateOpen,
  onCloseCreateModal
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [deadlineFilter, setDeadlineFilter] = useState<'ALL' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON'>('ALL');
  const [reminderTick, setReminderTick] = useState(0);
  const [sortBy, setSortBy] = useState<'dueDate' | 'createdDate' | 'priority'>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Multi-select & Pagination
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Modals state
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null);

  // Users list for assignment
  const users = storageService.getUsers();
  const currentUser = storageService.getCurrentUser();

  // Form State for Create / Edit
  const [formData, setFormData] = useState<Partial<TaskItem>>({
    title: '',
    description: '',
    dueDate: getTodayISODateVN(),
    assignee: users[0]?.name || '',
    assigneeEmail: users[0]?.email || '',
    telegramChatId: users[0]?.telegramChatId || '',
    taskType: 'Xét nghiệm khẩn',
    priority: 'Trung bình',
    status: 'Chờ xử lý',
    level: 'Bộ phận Xét nghiệm',
    recurrence: 'Không',
    recurrenceCount: 0,
    notes: ''
  });

  const taskReminderSummary = useMemo(() => scanTaskReminders(tasks, 7), [tasks, reminderTick]);
  const reminderByTaskId = useMemo(() => {
    const map = new Map<string, typeof taskReminderSummary.alerts[number]>();
    taskReminderSummary.alerts.forEach((a) => map.set(a.task.id, a));
    return map;
  }, [taskReminderSummary]);

  // Filter & Search Logic
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchesSearch = 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.assignee.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = selectedStatus === 'ALL' || t.status === selectedStatus;
      const matchesPriority = selectedPriority === 'ALL' || t.priority === selectedPriority;
      const matchesType = selectedType === 'ALL' || t.taskType === selectedType;

      let matchesDeadline = true;
      if (deadlineFilter !== 'ALL') {
        const isDone = t.status === 'Đã hoàn thành' || t.status === 'Hủy';
        const days = getDaysDiffFromTodayVN(t.dueDate);
        if (isDone || days === null) {
          matchesDeadline = false;
        } else if (deadlineFilter === 'OVERDUE') {
          matchesDeadline = days < 0;
        } else if (deadlineFilter === 'DUE_TODAY') {
          matchesDeadline = days === 0;
        } else if (deadlineFilter === 'DUE_SOON') {
          matchesDeadline = days >= 0 && days <= 3;
        }
      }

      return matchesSearch && matchesStatus && matchesPriority && matchesType && matchesDeadline;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'dueDate') {
        comparison = a.dueDate.localeCompare(b.dueDate);
      } else if (sortBy === 'createdDate') {
        comparison = a.createdDate.localeCompare(b.createdDate);
      } else if (sortBy === 'priority') {
        const priorityOrder: Record<TaskPriority, number> = { 'Khẩn cấp': 4, 'Cao': 3, 'Trung bình': 2, 'Thấp': 1 };
        comparison = priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [tasks, searchQuery, selectedStatus, selectedPriority, selectedType, deadlineFilter, sortBy, sortOrder]);

  // Paginated data
  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage]);

  // Handle Multi-select
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedTaskIds(paginatedTasks.map(t => t.id));
    } else {
      setSelectedTaskIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedTaskIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Quick Complete Toggle
  const handleToggleComplete = (task: TaskItem) => {
    const newStatus: TaskStatus = task.status === 'Đã hoàn thành' ? 'Chờ xử lý' : 'Đã hoàn thành';
    storageService.saveTask({ ...task, status: newStatus });
    onTasksUpdated();
    onShowToast('Cập nhật trạng thái', `Công việc ${task.id} đã chuyển sang "${newStatus}"`, 'success');
  };

  // Bulk Complete
  const handleBulkComplete = () => {
    onConfirmAction(
      'Xác nhận hoàn thành hàng loạt',
      `Bạn có chắc chắn muốn chuyển ${selectedTaskIds.length} công việc đã chọn sang trạng thái "Đã hoàn thành"?`,
      () => {
        const count = storageService.bulkCompleteTasks(selectedTaskIds);
        setSelectedTaskIds([]);
        onTasksUpdated();
        onShowToast('Thành công', `Đã hoàn thành ${count} công việc`, 'success');
      }
    );
  };

  // Bulk Delete
  const handleBulkDelete = () => {
    onConfirmAction(
      'Xác nhận xóa hàng loạt',
      `CẢNH BÁO: Bạn có chắc muốn xóa ${selectedTaskIds.length} công việc đã chọn? Hành động này không thể hoàn tác!`,
      () => {
        const count = storageService.bulkDeleteTasks(selectedTaskIds);
        setSelectedTaskIds([]);
        onTasksUpdated();
        onShowToast('Đã xóa', `Đã xóa thành công ${count} công việc`, 'warning');
      },
      true
    );
  };

  // Duplicate Task
  const handleDuplicate = (task: TaskItem) => {
    const duplicated = storageService.duplicateTask(task.id);
    if (duplicated) {
      onTasksUpdated();
      onShowToast('Đã nhân bản', `Đã tạo bản sao "${duplicated.id}"`, 'success');
    }
  };

  const handleSendSingleReminder = (task: TaskItem) => {
    const days = getDaysDiffFromTodayVN(task.dueDate) ?? 0;
    dispatchTaskReminder(task, days, 'Telegram');
    setReminderTick((t) => t + 1);
    onShowToast(
      'Đã gửi nhắc việc',
      `Đã phát nhắc nhở "${task.title}" tới ${task.assignee} (${formatDaysRemainingLabel(days)})`,
      'success'
    );
  };

  const handleBatchRemindUrgentTasks = () => {
    const urgent = taskReminderSummary.alerts.filter((a) => a.daysRemaining <= 3);
    if (urgent.length === 0) {
      onShowToast('Không có việc cần nhắc', 'Hiện không có công việc quá hạn hoặc đến hạn trong 3 ngày tới.', 'info');
      return;
    }
    urgent.forEach((a) => dispatchTaskReminder(a.task, a.daysRemaining, 'Telegram'));
    setReminderTick((t) => t + 1);
    onShowToast(
      'Đã phát nhắc việc hàng loạt',
      `Đã gửi ${urgent.length} thông báo nhắc việc (quá hạn & hạn ≤ 3 ngày) tới cán bộ phụ trách.`,
      'success'
    );
  };

  // Save / Update Task Form
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.dueDate) {
      onShowToast('Lỗi', 'Vui lòng nhập đầy đủ tiêu đề và ngày hạn', 'error');
      return;
    }

    const taskToSave: TaskItem = {
      id: editingTask ? editingTask.id : '',
      title: formData.title || '',
      description: formData.description || '',
      dueDate: formData.dueDate || '',
      createdDate: editingTask ? editingTask.createdDate : new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
      updatedDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
      creator: editingTask ? editingTask.creator : currentUser.name,
      assignee: formData.assignee || currentUser.name,
      assigneeEmail: formData.assigneeEmail || currentUser.email,
      telegramChatId: formData.telegramChatId || '',
      taskType: (formData.taskType as TaskType) || 'Hội chẩn',
      priority: (formData.priority as TaskPriority) || 'Trung bình',
      status: (formData.status as TaskStatus) || 'Chờ xử lý',
      level: formData.level || 'Chung',
      recurrence: (formData.recurrence as TaskRecurrence) || 'Không',
      recurrenceCount: formData.recurrenceCount || 0,
      notes: formData.notes || '',
      attachments: editingTask ? editingTask.attachments : []
    };

    storageService.saveTask(taskToSave);
    onTasksUpdated();
    onShowToast('Thành công', editingTask ? 'Đã cập nhật công việc' : 'Đã tạo công việc mới', 'success');
    setEditingTask(null);
    onCloseCreateModal();
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = async () => {
    try {
      const exportData = filteredTasks.map(t => ({
        'Mã Task': t.id,
        'Tiêu đề': t.title,
        'Mô tả': t.description,
        'Ngày hạn': t.dueDate,
        'Người phụ trách': t.assignee,
        'Email': t.assigneeEmail,
        'Loại': t.taskType,
        'Độ ưu tiên': t.priority,
        'Trạng thái': t.status,
        'Bộ phận': t.level,
        'Lặp': t.recurrence,
        'Ghi chú': t.notes
      }));

      await exportObjectsToXlsxFile(exportData, {
        sheetName: 'Tasks',
        fileName: `Hospital_OS_Tasks_${new Date().toISOString().split('T')[0]}.xlsx`
      });
      onShowToast('Xuất File Excel', 'Đã tải xuống file danh sách công việc thành công', 'success');
    } catch (err: any) {
      onShowToast('Lỗi Xuất File', err?.message || 'Không thể tạo tệp Excel', 'error');
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text("HOSPITAL OS - DANH SÁCH CÔNG VIỆC BỆNH VIỆN", 14, 15);
    
    const tableRows = filteredTasks.map(t => [
      t.id, t.title.slice(0, 30), t.assignee, t.dueDate, t.priority, t.status
    ]);

    autoTable(doc, {
      head: [['Mã', 'Tiêu đề', 'Phụ trách', 'Ngày hạn', 'Ưu tiên', 'Trạng thái']],
      body: tableRows,
      startY: 20
    });

    doc.save(`Hospital_OS_Tasks_${new Date().toISOString().split('T')[0]}.pdf`);
    onShowToast('Xuất File PDF', 'Đã tải xuống báo cáo PDF thành công', 'success');
  };

  // Import Excel File
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const json: any[] = await readSpreadsheetFileToObjects(file);

      let count = 0;
      json.forEach(row => {
        if (row['Tiêu đề'] || row['title']) {
          const newTask: TaskItem = {
            id: `TSK-IMP-${Math.floor(1000 + Math.random() * 9000)}`,
            title: String(row['Tiêu đề'] || row['title']),
            description: String(row['Mô tả'] || row['description'] || ''),
            dueDate: String(row['Ngày hạn'] || row['dueDate'] || new Date().toISOString().split('T')[0]),
            createdDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
            updatedDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
            creator: currentUser.name,
            assignee: String(row['Người phụ trách'] || row['assignee'] || currentUser.name),
            assigneeEmail: String(row['Email'] || currentUser.email),
            telegramChatId: '',
            taskType: (row['Loại'] || 'Hội chẩn') as TaskType,
            priority: (row['Độ ưu tiên'] || 'Trung bình') as TaskPriority,
            status: (row['Trạng thái'] || 'Chờ xử lý') as TaskStatus,
            level: 'Khoa Ngoại',
            recurrence: 'Không',
            recurrenceCount: 0,
            notes: 'Imported from Excel',
            attachments: []
          };
          storageService.saveTask(newTask);
          count++;
        }
      });

      onTasksUpdated();
      onShowToast('Import thành công', `Đã nhập thành công ${count} công việc từ Excel`, 'success');
    } catch (err: any) {
      onShowToast('Lỗi Import', err?.message || 'File Excel không đúng định dạng', 'error');
    }
  };

  // Helper Badge Renderers
  const getPriorityBadge = (p: TaskPriority) => {
    switch (p) {
      case 'Khẩn cấp': return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold';
      case 'Cao': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
      case 'Trung bình': return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
      case 'Thấp': return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const getStatusBadge = (s: TaskStatus) => {
    switch (s) {
      case 'Đã hoàn thành': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
      case 'Đang thực hiện': return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
      case 'Chờ xử lý': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
      case 'Hủy': return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300';
    }
  };

  const urgentReminderCount =
    taskReminderSummary.overdueCount + taskReminderSummary.dueTodayCount + taskReminderSummary.dueSoon3DaysCount;

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-200">
      {/* Task Deadline & Reminder Escalation Strip */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 pr-2.5 border-r border-[#DFE7F0] dark:border-slate-800">
            <BellRing className={`w-4 h-4 ${urgentReminderCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}`} />
            <span className="text-xs font-bold text-[#263445] dark:text-slate-100 uppercase tracking-wider">
              Theo dõi hạn &amp; Nhắc việc
            </span>
          </div>

          <button
            type="button"
            onClick={() => { setDeadlineFilter('ALL'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer tabular-nums border ${
              deadlineFilter === 'ALL'
                ? 'bg-[#155A9C] text-white border-[#155A9C] dark:bg-[#1976D2] dark:border-[#1976D2]'
                : 'bg-[#F4F7FB] text-[#718096] border-[#DFE7F0] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:bg-[#EAF4FF] hover:text-[#155A9C]'
            }`}
          >
            Tất cả ({tasks.length})
          </button>

          <button
            type="button"
            onClick={() => { setDeadlineFilter(deadlineFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 tabular-nums border ${
              deadlineFilter === 'OVERDUE'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Quá hạn ({taskReminderSummary.overdueCount})</span>
          </button>

          <button
            type="button"
            onClick={() => { setDeadlineFilter(deadlineFilter === 'DUE_TODAY' ? 'ALL' : 'DUE_TODAY'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 tabular-nums border ${
              deadlineFilter === 'DUE_TODAY'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Hạn hôm nay ({taskReminderSummary.dueTodayCount})</span>
          </button>

          <button
            type="button"
            onClick={() => { setDeadlineFilter(deadlineFilter === 'DUE_SOON' ? 'ALL' : 'DUE_SOON'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 tabular-nums border ${
              deadlineFilter === 'DUE_SOON'
                ? 'bg-[#1976D2] text-white border-[#1976D2]'
                : 'bg-[#EAF4FF] text-[#155A9C] border-[#1976D2]/25 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60 hover:bg-[#EAF4FF]/80'
            }`}
          >
            <span>Sắp hạn ≤ 3 ngày ({taskReminderSummary.dueTodayCount + taskReminderSummary.dueSoon3DaysCount})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleBatchRemindUrgentTasks}
          className="px-3.5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 tabular-nums shadow-2xs"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Nhắc việc quá hạn &amp; sắp hạn ({urgentReminderCount})</span>
        </button>
      </div>

      {/* Search, Filter & Actions Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* View Mode Toggle & Search */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-[#F4F7FB] dark:bg-slate-800 p-1 rounded-lg border border-[#DFE7F0] dark:border-slate-700">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === 'table' ? 'bg-white dark:bg-slate-700 text-[#1976D2] dark:text-blue-400 shadow-2xs' : 'text-[#718096] hover:text-[#263445]'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Bảng (Table)</span>
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === 'kanban' ? 'bg-white dark:bg-slate-700 text-[#1976D2] dark:text-blue-400 shadow-2xs' : 'text-[#718096] hover:text-[#263445]'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Kanban Board</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#718096]" />
              <input
                type="text"
                placeholder="Tìm tiêu đề, mã task, người phụ trách..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
              />
            </div>
          </div>

          {/* Export & Import Action Buttons */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <label className="cursor-pointer flex items-center space-x-1 px-3 py-1.5 bg-[#F4F7FB] hover:bg-[#EAF4FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#263445] hover:text-[#155A9C] dark:text-slate-200 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-xs font-semibold transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Excel</span>
              <input type="file" accept=".xlsx, .csv" onChange={handleImportExcel} className="hidden" />
            </label>

            <button
              onClick={handleExportExcel}
              className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>

            <button
              onClick={handleExportPDF}
              className="flex items-center space-x-1 px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60 hover:bg-rose-100 rounded-lg text-xs font-semibold transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Xuất PDF</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center space-x-2.5 overflow-x-auto pb-0.5 text-xs">
          <span className="font-semibold text-[#718096] shrink-0 flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1" /> Lọc:
          </span>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2.5 py-1.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-200 focus:outline-none focus:border-[#1976D2]"
          >
            <option value="ALL">Tất cả Trạng thái</option>
            <option value="Chờ xử lý">Chờ xử lý</option>
            <option value="Đang thực hiện">Đang thực hiện</option>
            <option value="Đã hoàn thành">Đã hoàn thành</option>
            <option value="Hủy">Hủy</option>
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-2.5 py-1.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-200 focus:outline-none focus:border-[#1976D2]"
          >
            <option value="ALL">Tất cả Độ ưu tiên</option>
            <option value="Khẩn cấp">Khẩn cấp</option>
            <option value="Cao">Cao</option>
            <option value="Trung bình">Trung bình</option>
            <option value="Thấp">Thấp</option>
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-2.5 py-1.5 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-200 focus:outline-none focus:border-[#1976D2]"
          >
            <option value="ALL">Tất cả Loại công việc</option>
            <option value="Xét nghiệm khẩn">Xét nghiệm khẩn</option>
            <option value="Chẩn đoán hình ảnh">Chẩn đoán hình ảnh</option>
            <option value="Bảo trì thiết bị">Bảo trì thiết bị</option>
            <option value="Kiểm chuẩn ISO">Kiểm chuẩn ISO</option>
            <option value="Hội chẩn">Hội chẩn</option>
            <option value="Đào tạo">Đào tạo</option>
            <option value="Hành chính">Hành chính</option>
            <option value="Khác">Khác</option>
          </select>
        </div>
      </div>

      {/* Bulk Operations Toolbar */}
      {selectedTaskIds.length > 0 && (
        <div className="bg-[#EAF4FF] dark:bg-blue-950/50 border border-[#1976D2]/30 dark:border-blue-800 rounded-xl p-3 flex items-center justify-between animate-in slide-in-from-top-2">
          <div className="flex items-center space-x-2 text-xs text-[#155A9C] dark:text-blue-200 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-[#1976D2]" />
            <span>Đã chọn {selectedTaskIds.length} công việc</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleBulkComplete}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Hoàn thành hàng loạt
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Xóa hàng loạt
            </button>
          </div>
        </div>
      )}

      {/* VIEW 1: TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#DFE7F0] dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#263445] dark:text-slate-200">
              <thead className="bg-[#F4F7FB] dark:bg-slate-800/80 text-[#263445] dark:text-slate-300 uppercase font-bold text-[11px] border-b border-[#DFE7F0] dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 w-10">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={selectedTaskIds.length === paginatedTasks.length && paginatedTasks.length > 0}
                      className="rounded border-[#DFE7F0]"
                    />
                  </th>
                  <th className="py-2.5 px-3">Mã & Tiêu đề</th>
                  <th className="py-2.5 px-3">Loại</th>
                  <th className="py-2.5 px-3">Người phụ trách</th>
                  <th className="py-2.5 px-3">Ngày hạn</th>
                  <th className="py-2.5 px-3">Ưu tiên</th>
                  <th className="py-2.5 px-3">Trạng thái</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#DFE7F0]/70 dark:divide-slate-800">
                {paginatedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-[#718096]">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      Không tìm thấy công việc nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  paginatedTasks.map((task) => {
                    const isSelected = selectedTaskIds.includes(task.id);
                    return (
                      <tr 
                        key={task.id} 
                        className={`hover:bg-[#EAF4FF]/70 dark:hover:bg-slate-800/50 transition-colors ${isSelected ? 'bg-[#EAF4FF] dark:bg-blue-950/20' : ''}`}
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectOne(task.id)}
                            className="rounded border-[#DFE7F0]"
                          />
                        </td>
                        <td className="py-2.5 px-3 max-w-xs">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-[10px] text-[#718096] bg-[#F4F7FB] border border-[#DFE7F0] dark:border-slate-700 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {task.id}
                            </span>
                            {task.recurrence !== 'Không' && (
                              <span className="text-[10px] bg-[#EAF4FF] text-[#155A9C] dark:bg-blue-950/60 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold">
                                {task.recurrence}
                              </span>
                            )}
                          </div>
                          <h4 
                            onClick={() => setDetailTask(task)}
                            className="font-semibold text-[#263445] dark:text-slate-100 hover:text-[#1976D2] dark:hover:text-blue-400 cursor-pointer line-clamp-1 mt-0.5"
                          >
                            {task.title}
                          </h4>
                        </td>

                        <td className="py-2.5 px-3 font-medium text-[#263445] dark:text-slate-200">{task.taskType}</td>

                        <td className="py-2.5 px-3">
                          <div className="font-medium text-[#263445] dark:text-slate-200">{task.assignee}</div>
                          <div className="text-[10px] text-[#718096]">{task.level}</div>
                        </td>

                        <td className="py-2.5 px-3 font-medium tabular-nums">
                          {(() => {
                            const isDone = task.status === 'Đã hoàn thành' || task.status === 'Hủy';
                            const days = getDaysDiffFromTodayVN(task.dueDate);
                            const rInfo = reminderByTaskId.get(task.id);
                            return (
                              <div className="space-y-0.5">
                                <span className={!isDone && days !== null && days < 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-[#263445] dark:text-slate-200'}>
                                  {formatDateVN(task.dueDate)}
                                </span>
                                {!isDone && days !== null && days <= 7 && (
                                  <div className={`text-[10px] font-bold ${
                                    days < 0 ? 'text-rose-600 dark:text-rose-400' :
                                    days === 0 ? 'text-amber-600 dark:text-amber-400' :
                                    'text-[#1976D2] dark:text-blue-400'
                                  }`}>
                                    {formatDaysRemainingLabel(days)}
                                  </div>
                                )}
                                {rInfo?.lastRemindedAt && (
                                  <div className="text-[10px] text-[#718096]" title={`Đã nhắc ${rInfo.reminderCount} lần`}>
                                    Đã nhắc ({rInfo.reminderCount})
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${getPriorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                        </td>

                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => handleToggleComplete(task)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-transform active:scale-95 ${getStatusBadge(task.status)}`}
                          >
                            {task.status}
                          </button>
                        </td>

                        <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                          {task.status !== 'Đã hoàn thành' && task.status !== 'Hủy' && (
                            <button
                              onClick={() => handleSendSingleReminder(task)}
                              className="p-1.5 text-[#718096] hover:text-[#1976D2] hover:bg-[#EAF4FF] dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                              title="Gửi nhắc việc qua Telegram / In-App"
                            >
                              <BellRing className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setDetailTask(task)}
                            className="p-1.5 text-[#718096] hover:text-[#1976D2] hover:bg-[#EAF4FF] dark:hover:bg-slate-800 rounded-md transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingTask(task);
                              setFormData(task);
                            }}
                            className="p-1.5 text-[#718096] hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-md transition-colors"
                            title="Sửa nhanh"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDuplicate(task)}
                            className="p-1.5 text-[#718096] hover:text-[#155A9C] hover:bg-[#EAF4FF] dark:hover:bg-slate-800 rounded-md transition-colors"
                            title="Nhân bản"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              onConfirmAction(
                                'Xóa công việc',
                                `Bạn có chắc chắn muốn xóa "${task.title}"?`,
                                () => {
                                  storageService.deleteTask(task.id);
                                  onTasksUpdated();
                                  onShowToast('Đã xóa', 'Công việc đã được xóa', 'warning');
                                },
                                true
                              );
                            }}
                            className="p-1.5 text-[#718096] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-md transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="py-2.5 px-3.5 bg-[#F4F7FB] dark:bg-slate-800/60 border-t border-[#DFE7F0] dark:border-slate-800 flex items-center justify-between text-xs text-[#718096]">
            <span>Hiển thị {paginatedTasks.length} trên tổng số {filteredTasks.length} công việc</span>

            <div className="flex items-center space-x-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded-md border border-[#DFE7F0] dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 hover:bg-[#EAF4FF] dark:hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-[#263445] dark:text-slate-300">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded-md border border-[#DFE7F0] dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 hover:bg-[#EAF4FF] dark:hover:bg-slate-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: NOTION / TRELLO KANBAN BOARD */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {(['Chờ xử lý', 'Đang thực hiện', 'Đã hoàn thành', 'Hủy'] as TaskStatus[]).map((colStatus) => {
            const columnTasks = filteredTasks.filter(t => t.status === colStatus);

            return (
              <div key={colStatus} className="bg-[#F4F7FB] dark:bg-slate-800/40 rounded-xl p-3.5 border border-[#DFE7F0] dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-[#DFE7F0] dark:border-slate-700">
                  <span className="font-bold text-xs text-[#263445] dark:text-slate-200 uppercase tracking-wider flex items-center">
                    <span className="w-2 h-2 rounded-full mr-2 bg-[#1976D2]"></span>
                    {colStatus}
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-[#DFE7F0] dark:bg-slate-700 dark:border-slate-600 text-[#263445] dark:text-slate-300 text-xs font-bold rounded-md">
                    {columnTasks.length}
                  </span>
                </div>

                <div className="space-y-2.5 min-h-[300px]">
                  {columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-[#DFE7F0] dark:border-slate-800 shadow-2xs hover:border-[#1976D2]/60 transition-all space-y-2 cursor-pointer"
                      onClick={() => setDetailTask(task)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#718096]">{task.id}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${getPriorityBadge(task.priority)}`}>
                          {task.priority}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-[#263445] dark:text-slate-100 line-clamp-2">
                        {task.title}
                      </h4>

                      <p className="text-[11px] text-[#718096] line-clamp-2">{task.description}</p>

                      <div className="pt-2 border-t border-[#DFE7F0]/70 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#718096]">
                        <span className="font-medium text-[#263445] dark:text-slate-300">{task.assignee}</span>
                        <span>{task.dueDate}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT TASK MODAL */}
      {(isCreateOpen || editingTask) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-[#DFE7F0] dark:border-slate-800 max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-[#263445] dark:text-slate-100">
                {editingTask ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'}
              </h3>
              <button 
                onClick={() => {
                  setEditingTask(null);
                  onCloseCreateModal();
                }}
                className="text-[#718096] hover:text-[#263445] p-1 rounded-md hover:bg-[#F4F7FB]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">
                  Tiêu đề công việc <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Hội chẩn ca bệnh tim bẩm sinh Khoa Cấp Cứu..."
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Loại công việc</label>
                  <select
                    value={formData.taskType}
                    onChange={(e) => setFormData({ ...formData, taskType: e.target.value as TaskType })}
                    className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
                  >
                    <option value="Xét nghiệm khẩn">Xét nghiệm khẩn</option>
                    <option value="Chẩn đoán hình ảnh">Chẩn đoán hình ảnh</option>
                    <option value="Bảo trì thiết bị">Bảo trì thiết bị</option>
                    <option value="Kiểm chuẩn ISO">Kiểm chuẩn ISO</option>
                    <option value="Hội chẩn">Hội chẩn</option>
                    <option value="Đào tạo">Đào tạo</option>
                    <option value="Hành chính">Hành chính</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">
                    Ngày hết hạn <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate || ''}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Người phụ trách</label>
                  <select
                    value={formData.assignee}
                    onChange={(e) => {
                      const selectedUser = users.find(u => u.name === e.target.value);
                      setFormData({
                        ...formData,
                        assignee: e.target.value,
                        assigneeEmail: selectedUser?.email || '',
                        telegramChatId: selectedUser?.telegramChatId || ''
                      });
                    }}
                    className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Mức độ ưu tiên</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                    className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
                  >
                    <option value="Khẩn cấp">Khẩn cấp</option>
                    <option value="Cao">Cao</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Thấp">Thấp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Trạng thái</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                    className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
                  >
                    <option value="Chờ xử lý">Chờ xử lý</option>
                    <option value="Đang thực hiện">Đang thực hiện</option>
                    <option value="Đã hoàn thành">Đã hoàn thành</option>
                    <option value="Hủy">Hủy</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Lặp lại định kỳ</label>
                  <select
                    value={formData.recurrence}
                    onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as TaskRecurrence })}
                    className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
                  >
                    <option value="Không">Không lặp lại</option>
                    <option value="Hàng ngày">Hàng ngày</option>
                    <option value="Hàng tuần">Hàng tuần</option>
                    <option value="Hàng tháng">Hàng tháng</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#263445] dark:text-slate-200 mb-1">Mô tả công việc</label>
                <textarea
                  rows={3}
                  placeholder="Nhập thông tin chi tiết ca bệnh, yêu cầu chuẩn bị..."
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F4F7FB] dark:bg-slate-800 border border-[#DFE7F0] dark:border-slate-700 rounded-lg text-[#263445] dark:text-slate-100 focus:outline-none focus:border-[#1976D2]"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-[#DFE7F0] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTask(null);
                    onCloseCreateModal();
                  }}
                  className="px-4 py-2 text-[#263445] dark:text-slate-300 font-medium hover:bg-[#F4F7FB] border border-[#DFE7F0] dark:border-slate-700 dark:hover:bg-slate-800 rounded-lg"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white font-semibold rounded-lg shadow-2xs transition-colors"
                >
                  {editingTask ? 'Cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK DETAIL DRAWER MODAL */}
      {detailTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-[#DFE7F0] dark:border-slate-800 max-w-xl w-full p-5 space-y-4">
            <div className="flex items-start justify-between border-b border-[#DFE7F0] dark:border-slate-800 pb-3">
              <div>
                <span className="text-xs font-mono text-[#718096]">{detailTask.id}</span>
                <h3 className="text-base font-bold text-[#263445] dark:text-slate-100 mt-0.5">{detailTask.title}</h3>
              </div>
              <button onClick={() => setDetailTask(null)} className="text-[#718096] hover:text-[#263445] p-1 rounded-md hover:bg-[#F4F7FB]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-[#F4F7FB] dark:bg-slate-800/60 border border-[#DFE7F0] dark:border-slate-700 rounded-lg space-y-2 text-xs text-[#263445] dark:text-slate-200">
              <p><span className="font-semibold">Mô tả:</span> {detailTask.description || 'Không có mô tả'}</p>
              <p><span className="font-semibold">Người phụ trách:</span> {detailTask.assignee} ({detailTask.assigneeEmail})</p>
              <p><span className="font-semibold">Ngày hạn:</span> {detailTask.dueDate}</p>
              <p><span className="font-semibold">Ghi chú:</span> {detailTask.notes || 'Không có'}</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#DFE7F0] dark:border-slate-800">
              {detailTask.status !== 'Đã hoàn thành' && detailTask.status !== 'Hủy' && (
                <button
                  onClick={() => handleSendSingleReminder(detailTask)}
                  className="px-4 py-2 bg-[#1976D2] hover:bg-[#155A9C] text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Gửi nhắc việc ngay</span>
                </button>
              )}
              <button
                onClick={() => {
                  setEditingTask(detailTask);
                  setFormData(detailTask);
                  setDetailTask(null);
                }}
                className="px-4 py-2 bg-amber-500 text-white font-semibold rounded-lg text-xs hover:bg-amber-600"
              >
                Chỉnh sửa
              </button>
              <button
                onClick={() => setDetailTask(null)}
                className="px-4 py-2 bg-[#F4F7FB] hover:bg-[#EAF4FF] border border-[#DFE7F0] dark:border-slate-700 dark:bg-slate-800 text-[#263445] dark:text-slate-200 font-semibold rounded-lg text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
