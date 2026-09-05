import React, { useState, useMemo } from 'react';
import { 
  Plus, Search, Filter, Download, Upload, Trash2, CheckCircle2, 
  Copy, Edit2, Calendar as CalendarIcon, LayoutList, Kanban, 
  MoreVertical, FileSpreadsheet, FileText, RefreshCw, X, ArrowUpDown, 
  AlertCircle, ChevronLeft, ChevronRight, Eye, Paperclip, Send
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TaskItem, TaskPriority, TaskStatus, TaskType, TaskRecurrence, User } from '../../types/hospital';
import { storageService } from '../../services/storageService';

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
    dueDate: new Date().toISOString().split('T')[0],
    assignee: users[0]?.name || '',
    assigneeEmail: users[0]?.email || '',
    telegramChatId: users[0]?.telegramChatId || '',
    taskType: 'Hội chẩn',
    priority: 'Trung bình',
    status: 'Chờ xử lý',
    level: 'Khoa Ngoại',
    recurrence: 'Không',
    recurrenceCount: 0,
    notes: ''
  });

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

      return matchesSearch && matchesStatus && matchesPriority && matchesType;
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
  }, [tasks, searchQuery, selectedStatus, selectedPriority, selectedType, sortBy, sortOrder]);

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
  const handleExportExcel = () => {
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

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tasks");
    XLSX.writeFile(workbook, `Hospital_OS_Tasks_${new Date().toISOString().split('T')[0]}.xlsx`);
    onShowToast('Xuất File Excel', 'Đã tải xuống file danh sách công việc thành công', 'success');
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
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        let count = 0;
        json.forEach(row => {
          if (row['Tiêu đề'] || row['title']) {
            const newTask: TaskItem = {
              id: `TSK-IMP-${Math.floor(1000 + Math.random() * 9000)}`,
              title: row['Tiêu đề'] || row['title'],
              description: row['Mô tả'] || row['description'] || '',
              dueDate: row['Ngày hạn'] || row['dueDate'] || new Date().toISOString().split('T')[0],
              createdDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
              updatedDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
              creator: currentUser.name,
              assignee: row['Người phụ trách'] || row['assignee'] || currentUser.name,
              assigneeEmail: row['Email'] || currentUser.email,
              telegramChatId: '',
              taskType: row['Loại'] || 'Hội chẩn',
              priority: row['Độ ưu tiên'] || 'Trung bình',
              status: row['Trạng thái'] || 'Chờ xử lý',
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
      } catch (err) {
        onShowToast('Lỗi Import', 'File Excel không đúng định dạng', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
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

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Search, Filter & Actions Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* View Mode Toggle & Search */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'table' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-500'
                }`}
              >
                <LayoutList className="w-4 h-4" />
                <span>Bảng (Table)</span>
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'kanban' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-500'
                }`}
              >
                <Kanban className="w-4 h-4" />
                <span>Kanban Board</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tiêu đề, mã task, bác sĩ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Export & Import Action Buttons */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <label className="cursor-pointer flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Excel</span>
              <input type="file" accept=".xlsx, .xls" onChange={handleImportExcel} className="hidden" />
            </label>

            <button
              onClick={handleExportExcel}
              className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-semibold transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>

            <button
              onClick={handleExportPDF}
              className="flex items-center space-x-1 px-3 py-1.5 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100 rounded-xl text-xs font-semibold transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Xuất PDF</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center space-x-3 overflow-x-auto pb-1 text-xs">
          <span className="font-semibold text-slate-400 shrink-0 flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1" /> Lọc:
          </span>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
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
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
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
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">Tất cả Loại công việc</option>
            <option value="Hội chẩn">Hội chẩn</option>
            <option value="Phẫu thuật">Phẫu thuật</option>
            <option value="Bảo trì thiết bị">Bảo trì thiết bị</option>
            <option value="Đào tạo">Đào tạo</option>
            <option value="Hành chính">Hành chính</option>
          </select>
        </div>
      </div>

      {/* Bulk Operations Toolbar */}
      {selectedTaskIds.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-2xl p-3 flex items-center justify-between animate-in slide-in-from-top-2">
          <div className="flex items-center space-x-2 text-xs text-blue-800 dark:text-blue-200 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase font-bold text-[11px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 w-10">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={selectedTaskIds.length === paginatedTasks.length && paginatedTasks.length > 0}
                      className="rounded-md border-slate-300"
                    />
                  </th>
                  <th className="p-3.5">Mã & Tiêu đề</th>
                  <th className="p-3.5">Loại</th>
                  <th className="p-3.5">Người phụ trách</th>
                  <th className="p-3.5">Ngày hạn</th>
                  <th className="p-3.5">Ưu tiên</th>
                  <th className="p-3.5">Trạng thái</th>
                  <th className="p-3.5 text-right">Thao tác</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
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
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}
                      >
                        <td className="p-3.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectOne(task.id)}
                            className="rounded-md border-slate-300"
                          />
                        </td>
                        <td className="p-3.5 max-w-xs">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                              {task.id}
                            </span>
                            {task.recurrence !== 'Không' && (
                              <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded-md">
                                {task.recurrence}
                              </span>
                            )}
                          </div>
                          <h4 
                            onClick={() => setDetailTask(task)}
                            className="font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer line-clamp-1 mt-0.5"
                          >
                            {task.title}
                          </h4>
                        </td>

                        <td className="p-3.5 font-medium">{task.taskType}</td>

                        <td className="p-3.5">
                          <div className="font-medium text-slate-800 dark:text-slate-200">{task.assignee}</div>
                          <div className="text-[10px] text-slate-400">{task.level}</div>
                        </td>

                        <td className="p-3.5 font-medium">
                          <span className={task.dueDate < new Date().toISOString().split('T')[0] && task.status !== 'Đã hoàn thành' ? 'text-rose-600 font-bold' : ''}>
                            {task.dueDate}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${getPriorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <button
                            onClick={() => handleToggleComplete(task)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-transform active:scale-95 ${getStatusBadge(task.status)}`}
                          >
                            {task.status}
                          </button>
                        </td>

                        <td className="p-3.5 text-right space-x-1">
                          <button
                            onClick={() => setDetailTask(task)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingTask(task);
                              setFormData(task);
                            }}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Sửa nhanh"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDuplicate(task)}
                            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
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
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
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
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>Hiển thị {paginatedTasks.length} trên tổng số {filteredTasks.length} công việc</span>

            <div className="flex items-center space-x-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: NOTION / TRELLO KANBAN BOARD */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['Chờ xử lý', 'Đang thực hiện', 'Đã hoàn thành', 'Hủy'] as TaskStatus[]).map((colStatus) => {
            const columnTasks = filteredTasks.filter(t => t.status === colStatus);

            return (
              <div key={colStatus} className="bg-slate-100/70 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center">
                    <span className="w-2 h-2 rounded-full mr-2 bg-blue-500"></span>
                    {colStatus}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-full">
                    {columnTasks.length}
                  </span>
                </div>

                <div className="space-y-3 min-h-[300px]">
                  {columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-all space-y-2.5 cursor-pointer"
                      onClick={() => setDetailTask(task)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-400">{task.id}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${getPriorityBadge(task.priority)}`}>
                          {task.priority}
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">
                        {task.title}
                      </h4>

                      <p className="text-xs text-slate-500 line-clamp-2">{task.description}</p>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                        <span className="font-medium text-slate-600 dark:text-slate-300">{task.assignee}</span>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {editingTask ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'}
              </h3>
              <button 
                onClick={() => {
                  setEditingTask(null);
                  onCloseCreateModal();
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Tiêu đề công việc <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Hội chẩn ca bệnh tim bẩm sinh Khoa Cấp Cứu..."
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Loại công việc</label>
                  <select
                    value={formData.taskType}
                    onChange={(e) => setFormData({ ...formData, taskType: e.target.value as TaskType })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                  >
                    <option value="Hội chẩn">Hội chẩn</option>
                    <option value="Phẫu thuật">Phẫu thuật</option>
                    <option value="Lịch khám">Lịch khám</option>
                    <option value="Bảo trì thiết bị">Bảo trì thiết bị</option>
                    <option value="Đào tạo">Đào tạo</option>
                    <option value="Hành chính">Hành chính</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Ngày hết hạn <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate || ''}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Người phụ trách</label>
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Mức độ ưu tiên</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                  >
                    <option value="Khẩn cấp">Khẩn cấp</option>
                    <option value="Cao">Cao</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Thấp">Thấp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Trạng thái</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                  >
                    <option value="Chờ xử lý">Chờ xử lý</option>
                    <option value="Đang thực hiện">Đang thực hiện</option>
                    <option value="Đã hoàn thành">Đã hoàn thành</option>
                    <option value="Hủy">Hủy</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Lặp lại định kỳ</label>
                  <select
                    value={formData.recurrence}
                    onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as TaskRecurrence })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                  >
                    <option value="Không">Không lặp lại</option>
                    <option value="Hàng ngày">Hàng ngày</option>
                    <option value="Hàng tuần">Hàng tuần</option>
                    <option value="Hàng tháng">Hàng tháng</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Mô tả công việc</label>
                <textarea
                  rows={3}
                  placeholder="Nhập thông tin chi tiết ca bệnh, yêu cầu chuẩn bị..."
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTask(null);
                    onCloseCreateModal();
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md transition-colors"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono text-slate-400">{detailTask.id}</span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">{detailTask.title}</h3>
              </div>
              <button onClick={() => setDetailTask(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-2 text-xs">
              <p><span className="font-semibold">Mô tả:</span> {detailTask.description || 'Không có mô tả'}</p>
              <p><span className="font-semibold">Người phụ trách:</span> {detailTask.assignee} ({detailTask.assigneeEmail})</p>
              <p><span className="font-semibold">Ngày hạn:</span> {detailTask.dueDate}</p>
              <p><span className="font-semibold">Ghi chú:</span> {detailTask.notes || 'Không có'}</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  setEditingTask(detailTask);
                  setFormData(detailTask);
                  setDetailTask(null);
                }}
                className="px-4 py-2 bg-amber-500 text-white font-semibold rounded-xl text-xs hover:bg-amber-600"
              >
                Chỉnh sửa
              </button>
              <button
                onClick={() => setDetailTask(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs"
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
