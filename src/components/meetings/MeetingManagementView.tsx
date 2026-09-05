import React, { useState, useEffect } from 'react';
import { 
  Users, Calendar, Clock, FileText, CheckCircle2, Plus, ArrowRight, 
  Send, ListTodo, AlertCircle, Bookmark, MessageSquare
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { MeetingItem, MeetingMinutes, MeetingActionItem, TaskItem } from '../../types/hospital';

export const MeetingManagementView: React.FC = () => {
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingItem | null>(null);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMinutesModal, setShowMinutesModal] = useState(false);

  // Form states for meeting minutes
  const [minutesSummary, setMinutesSummary] = useState('');
  const [discussionInput, setDiscussionInput] = useState('');
  const [conclusionsInput, setConclusionsInput] = useState('');
  const [actionTitle, setActionTitle] = useState('');
  const [actionAssignee, setActionAssignee] = useState('ThS. BS. Nguyễn Hoài Nam');
  const [actionDueDate, setActionDueDate] = useState('');
  const [actionList, setActionList] = useState<MeetingActionItem[]>([]);

  useEffect(() => {
    const loadData = () => {
      const list = storageService.getMeetingItems();
      setMeetings(list);
      if (list.length > 0 && !selectedMeeting) {
        setSelectedMeeting(list[0]);
      }
    };
    loadData();
    return storageService.subscribe(loadData);
  }, []);

  const handleAddActionItem = () => {
    if (!actionTitle) return;
    const item: MeetingActionItem = {
      id: `ACT-${Date.now()}`,
      taskTitle: actionTitle,
      assigneeName: actionAssignee,
      dueDate: actionDueDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority: 'Cao',
      status: 'Chưa giao'
    };
    setActionList([...actionList, item]);
    setActionTitle('');
  };

  const handleSaveMinutes = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeeting) return;

    const minutes: MeetingMinutes = {
      id: `MIN-${Date.now()}`,
      summary: minutesSummary || 'Biên bản ghi nhận đầy đủ các nội dung thảo luận và kết luận chỉ đạo của Chủ trì.',
      keyDiscussions: discussionInput ? discussionInput.split('\n') : ['Thảo luận chuyên môn và kế hoạch bảo trì.'],
      conclusions: conclusionsInput ? conclusionsInput.split('\n') : ['Chủ trì thống nhất phê duyệt các nội dung báo cáo.'],
      actionItems: actionList,
      recordedBy: storageService.getCurrentUser().name,
      approvedBy: selectedMeeting.chairperson
    };

    storageService.saveMeetingMinutes(selectedMeeting.id, minutes);
    setShowMinutesModal(false);
    alert('Đã lưu biên bản cuộc họp thành công!');
  };

  // Convert Meeting Action Item directly to TaskManager task!
  const handleConvertToTask = (meeting: MeetingItem, action: MeetingActionItem) => {
    const nowStr = new Date().toLocaleString('vi-VN');
    const newTask: TaskItem = {
      id: `TSK-MTG-${Date.now()}`,
      title: action.taskTitle,
      description: `[Nhiệm vụ được giao từ cuộc họp: ${meeting.title}]\n\nChủ trì kết luận giao việc cho ${action.assigneeName}.`,
      dueDate: action.dueDate,
      createdDate: nowStr,
      updatedDate: nowStr,
      creator: meeting.chairperson,
      assignee: action.assigneeName,
      assigneeEmail: `${action.assigneeName.toLowerCase().replace(/[^a-z]/g, '')}@benhvien.vn`,
      telegramChatId: '',
      taskType: 'Hành chính',
      priority: action.priority,
      status: 'Chờ xử lý',
      level: 'Khoa Cận Lâm Sàng',
      recurrence: 'Không',
      recurrenceCount: 0,
      notes: `Tự động tạo từ biên bản cuộc họp ID ${meeting.id}`,
      attachments: [],
      tags: ['Họp giao ban', 'Nhiệm vụ chỉ đạo'],
      reporter: meeting.chairperson
    };

    storageService.saveTask(newTask);

    // Update status in meeting minutes
    if (meeting.minutes) {
      const updatedActionItems = meeting.minutes.actionItems.map(act => 
        act.id === action.id ? { ...act, status: 'Đã giao thành task' as const, createdTaskId: newTask.id } : act
      );
      meeting.minutes.actionItems = updatedActionItems;
      storageService.saveMeetingItem(meeting);
    }

    alert(`Đã tự động chuyển kết luận thành Task: "${action.taskTitle}" và giao cho ${action.assigneeName}!`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-sm font-semibold mb-1">
            <Users className="w-4 h-4" /> QUẢN LÝ CUỘC HỌP & GIAO VIỆC SAU HỌP
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Lịch Họp Giao Ban, Lập Biên Bản & Giao Nhiệm Vụ</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi các buổi giao ban tuần, hội chẩn ca bệnh khó, ghi biên bản cuộc họp và tự động chuyển kết luận thành Task cho nhân viên.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-semibold text-sm transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" /> Lên Lịch Họp Mới
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Meetings List (4 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="font-bold text-slate-900 dark:text-slate-200 text-sm px-1">Danh Sách Cuộc Họp khoa</h3>
          {meetings.map(m => (
            <div
              key={m.id}
              onClick={() => setSelectedMeeting(m)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                selectedMeeting?.id === m.id
                  ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-500 shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded uppercase">
                  {m.category}
                </span>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  m.status === 'Đã hoàn thành' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                }`}>
                  {m.status}
                </span>
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm mt-2">{m.title}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{m.date} ({m.time}) • {m.location}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Chủ trì: <strong className="text-slate-700 dark:text-slate-300">{m.chairperson}</strong></p>
            </div>
          ))}
        </div>

        {/* Right Side: Meeting Detail, Minutes & Action Task Converter (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
          {selectedMeeting ? (
            <>
              <div className="border-b border-slate-100 dark:border-slate-800 pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{selectedMeeting.category}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Chủ trì: <strong className="text-slate-800 dark:text-slate-200">{selectedMeeting.chairperson}</strong></span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedMeeting.title}</h2>
                <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span>📅 Ngày: <strong>{selectedMeeting.date}</strong></span>
                  <span>⏰ Giờ: <strong>{selectedMeeting.time}</strong></span>
                  <span>📍 Địa điểm: <strong>{selectedMeeting.location}</strong></span>
                </div>
              </div>

              {/* Agenda */}
              <div className="space-y-1">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Nội dung cuộc họp (Agenda):</h4>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line border border-slate-100 dark:border-slate-800">
                  {selectedMeeting.agenda}
                </div>
              </div>

              {/* Meeting Minutes & Conclusions Section */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Biên Bản Cuộc Họp & Giao Việc
                  </h3>
                  {!selectedMeeting.minutes && (
                    <button
                      onClick={() => {
                        setMinutesSummary('');
                        setActionList([]);
                        setShowMinutesModal(true);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all"
                    >
                      + Lập Biên Bản Họp
                    </button>
                  )}
                </div>

                {selectedMeeting.minutes ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                    <div>
                      <h4 className="font-bold text-xs uppercase text-indigo-700 dark:text-indigo-400 mb-1">Thảo luận chính:</h4>
                      <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-300 space-y-1">
                        {selectedMeeting.minutes.keyDiscussions.map((disc, idx) => (
                          <li key={idx}>{disc}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                      <h4 className="font-bold text-xs uppercase text-indigo-700 dark:text-indigo-400 mb-1">Kết luận chỉ đạo của Chủ trì:</h4>
                      <ul className="list-disc list-inside text-xs text-slate-800 dark:text-slate-200 font-medium space-y-1">
                        {selectedMeeting.minutes.conclusions.map((conc, idx) => (
                          <li key={idx}>{conc}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Action Items -> Task Converter Box */}
                    <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                      <h4 className="font-bold text-xs uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <ListTodo className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Nhiệm vụ giao cho nhân sự sau họp:
                      </h4>
                      <div className="space-y-2">
                        {selectedMeeting.minutes.actionItems.map(action => (
                          <div key={action.id} className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{action.taskTitle}</p>
                              <p className="text-slate-500 dark:text-slate-400 text-[11px]">Người phụ trách: <strong className="text-slate-800 dark:text-slate-200">{action.assigneeName}</strong> • Hạn hoàn thành: {action.dueDate}</p>
                            </div>
                            {action.status === 'Đã giao thành task' ? (
                              <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold text-[11px] border border-emerald-200 dark:border-emerald-800/60 self-start sm:self-auto">
                                ✓ Đã chuyển thành Task
                              </span>
                            ) : (
                              <button
                                onClick={() => handleConvertToTask(selectedMeeting, action)}
                                className="px-3 py-1.5 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg font-semibold text-xs transition-all flex items-center gap-1 self-start sm:self-auto shadow-sm"
                              >
                                🚀 Giao Thành Task
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Chưa có biên bản cuộc họp. Bấm nút bên trên để ghi nhận biên bản và giao việc.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500">Chọn cuộc họp để xem thông tin chi tiết.</div>
          )}
        </div>
      </div>

      {/* Minutes Modal */}
      {showMinutesModal && selectedMeeting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">📝 Lập Biên Bản Cuộc Họp & Giao Nhiệm Vụ</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cuộc họp: <strong className="text-slate-800 dark:text-slate-200">{selectedMeeting.title}</strong></p>

            <form onSubmit={handleSaveMinutes} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nội dung thảo luận chính (mỗi dòng 1 ý):</label>
                <textarea
                  rows={2}
                  required
                  placeholder="KTV báo cáo tình trạng máy MSCT..."
                  value={discussionInput}
                  onChange={e => setDiscussionInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kết luận chỉ đạo của Chủ trì (mỗi dòng 1 ý):</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Thống nhất xin gia hạn giấy phép an toàn bức xạ..."
                  value={conclusionsInput}
                  onChange={e => setConclusionsInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Action Item Creator Inside Modal */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block font-bold text-slate-800 dark:text-slate-200">Giao việc cho nhân sự sau họp:</label>
                <input
                  type="text"
                  placeholder="Tên công việc..."
                  value={actionTitle}
                  onChange={e => setActionTitle(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Người phụ trách..."
                    value={actionAssignee}
                    onChange={e => setActionAssignee(e.target.value)}
                    className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddActionItem}
                    className="p-2 bg-slate-900 dark:bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all"
                  >
                    + Thêm Nhiệm Vụ
                  </button>
                </div>

                {actionList.length > 0 && (
                  <div className="pt-2 space-y-1">
                    {actionList.map((a, i) => (
                      <div key={i} className="text-[11px] bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 font-medium text-slate-800 dark:text-slate-200">
                        • {a.taskTitle} (Giao: {a.assigneeName})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMinutesModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all shadow-sm"
                >
                  Lưu Biên Bản Họp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
