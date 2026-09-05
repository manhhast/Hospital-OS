import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Hash, Send, Paperclip, Users, Search, 
  MoreVertical, CheckCircle2, UserCheck, ShieldAlert, Sparkles, Smile,
  Pin, Star, Share2, Plus, Eye, Image as ImageIcon, FileText, FileSpreadsheet,
  Film, Music, Archive, AlertCircle, Edit2, Trash2, X, Download, UserPlus,
  Check, ChevronDown, Filter, Calendar, CheckSquare, FolderOpen, AtSign,
  RefreshCw, Layers, ExternalLink, ThumbsUp, Heart, AlertTriangle, Zap,
  Bell, Stethoscope, Microscope, HeartHandshake, Building2, Monitor, Cpu, Radio, Activity,
  FileArchive, MessageCircle, Info, Lock
} from 'lucide-react';
import { 
  ChatChannelMessage, ChatGroupChannel, DepartmentAnnouncement, User, 
  TaskItem, DocumentItem, ShiftDuty, MessageType, ShareCardData, AnnouncementCategory 
} from '../../types/hospital';
import { storageService } from '../../services/storageService';

export const DiscussionView: React.FC = () => {
  // Navigation & View Mode
  const [navSection, setNavSection] = useState<'chat' | 'announcements' | 'saved' | 'search' | 'backup'>('chat');
  
  // Storage Data States
  const [messages, setMessages] = useState<ChatChannelMessage[]>([]);
  const [channels, setChannels] = useState<ChatGroupChannel[]>([]);
  const [announcements, setAnnouncements] = useState<DepartmentAnnouncement[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());
  const [tasks, setTasks] = useState<TaskItem[]>(storageService.getTasks());
  const [documents, setDocuments] = useState<DocumentItem[]>(storageService.getDocuments());
  const [shifts, setShifts] = useState<ShiftDuty[]>(storageService.getShifts());

  // Active Chat Target State
  const [chatType, setChatType] = useState<'group' | 'dm'>('group');
  const [activeChannelId, setActiveChannelId] = useState<string>('toan-khoa');
  const [activeDmUserId, setActiveDmUserId] = useState<string>('');
  
  // Composer & Inputs
  const [inputText, setInputText] = useState<string>('');
  const [selectedMsgType, setSelectedMsgType] = useState<MessageType>('text');
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [showStickerPicker, setShowStickerPicker] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showMentionMenu, setShowMentionMenu] = useState<boolean>(false);
  const [mentionQuery, setMentionQuery] = useState<string>('');
  
  // File Upload State Simulation
  const [attachedFile, setAttachedFile] = useState<{ url: string; name: string; size: string; type: MessageType } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Modals & Panels
  const [showCreateGroupModal, setShowCreateGroupModal] = useState<boolean>(false);
  const [showManageMembersModal, setShowManageMembersModal] = useState<boolean>(false);
  const [showNewAnnouncementModal, setShowNewAnnouncementModal] = useState<boolean>(false);
  const [showThreadDrawer, setShowThreadDrawer] = useState<boolean>(false);
  const [activeThreadMessage, setActiveThreadMessage] = useState<ChatChannelMessage | null>(null);
  const [threadReplyInput, setThreadReplyInput] = useState<string>('');
  
  // Edit Message State
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [announcementCategory, setAnnouncementCategory] = useState<string>('Tất cả');
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);

  // New Group Form State
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupDesc, setNewGroupDesc] = useState<string>('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);

  // New Announcement Form State
  const [newAnncTitle, setNewAnncTitle] = useState<string>('');
  const [newAnncContent, setNewAnncContent] = useState<string>('');
  const [newAnncCategory, setNewAnncCategory] = useState<AnnouncementCategory>('Toàn khoa');
  const [newAnncUrgent, setNewAnncUrgent] = useState<boolean>(false);

  // Auto-scroll anchor
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load all initial data from storageService
  const loadData = () => {
    setMessages(storageService.getChatMessages());
    setChannels(storageService.getChannels());
    setAnnouncements(storageService.getAnnouncements());
    setUsers(storageService.getUsers());
    setCurrentUser(storageService.getCurrentUser());
    setTasks(storageService.getTasks());
    setDocuments(storageService.getDocuments());
    setShifts(storageService.getShifts());
  };

  useEffect(() => {
    loadData();
    const unsubscribe = storageService.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChannelId, activeDmUserId]);

  // Available Emojis & Medical Stickers
  const emojis = ['😄', '👍', '❤️', '🏥', '🚨', '📋', '🔬', '💊', '🔥', '🎉', '💯', '🙏', '🤝', '⚡', '💡', '✅'];
  const medicalStickers = [
    { label: 'Xe Cấp Cứu', symbol: '🚑', color: 'bg-red-100 dark:bg-red-950 text-red-600' },
    { label: 'Bác Sĩ', symbol: '🩺', color: 'bg-blue-100 dark:bg-blue-950 text-blue-600' },
    { label: 'Kính Hiển Vi', symbol: '🔬', color: 'bg-purple-100 dark:bg-purple-950 text-purple-600' },
    { label: 'Mẫu Xét Nghiệm', symbol: '🧪', color: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600' },
    { label: 'Quy Trình ISO', symbol: '📜', color: 'bg-amber-100 dark:bg-amber-950 text-amber-600' },
    { label: 'Phim X-Quang', symbol: '🩻', color: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-600' },
    { label: 'Khẩn Cấp', symbol: '⚡', color: 'bg-rose-100 dark:bg-rose-950 text-rose-600' },
    { label: 'Hoàn Thành', symbol: '✅', color: 'bg-green-100 dark:bg-green-950 text-green-600' }
  ];

  // User presence dictionary
  const getUserPresence = (userId: string) => {
    if (userId === 'USR-001' || userId === 'USR-004') return { status: 'Online', color: 'bg-emerald-500', label: 'Trực tuyến' };
    if (userId === 'USR-002') return { status: 'Busy', color: 'bg-rose-500', label: 'Đang đọc phim CT' };
    if (userId === 'USR-003') return { status: 'Away', color: 'bg-amber-500', label: 'Vắng mặt' };
    if (userId === 'USR-005') return { status: 'In Meeting', color: 'bg-purple-500', label: 'Đang họp khoa' };
    return { status: 'Offline', color: 'bg-slate-400', label: 'Ngoại tuyến' };
  };

  // Get Active Conversation Title and Meta
  const activeChannel = channels.find(c => c.id === activeChannelId);
  const activeDmUser = users.find(u => u.id === activeDmUserId);

  const getFilteredMessages = () => {
    if (chatType === 'group') {
      return messages.filter(m => m.channelId === activeChannelId);
    } else {
      return messages.filter(m => 
        (m.senderId === currentUser.id && m.dmUserId === activeDmUserId) ||
        (m.senderId === activeDmUserId && m.dmUserId === currentUser.id)
      );
    }
  };

  const activeMessages = getFilteredMessages();
  const pinnedMessages = activeMessages.filter(m => m.isPinned);

  // Send Message Handler
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachedFile) return;

    if (chatType === 'group') {
      storageService.sendChatMessage({
        channelId: activeChannelId,
        channelName: activeChannel?.name || 'Kênh Trao đổi',
        content: inputText.trim(),
        msgType: attachedFile ? attachedFile.type : selectedMsgType,
        fileUrl: attachedFile?.url,
        fileName: attachedFile?.name,
        fileSize: attachedFile?.size,
        isUrgent
      });
    } else {
      storageService.sendChatMessage({
        dmUserId: activeDmUserId,
        dmUserName: activeDmUser?.name || 'Thành viên',
        content: inputText.trim(),
        msgType: attachedFile ? attachedFile.type : selectedMsgType,
        fileUrl: attachedFile?.url,
        fileName: attachedFile?.name,
        fileSize: attachedFile?.size,
        isUrgent
      });
    }

    setInputText('');
    setAttachedFile(null);
    setSelectedMsgType('text');
    setIsUrgent(false);
    setShowEmojiPicker(false);
    setShowStickerPicker(false);
  };

  // File Upload Handler Simulation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    let type: MessageType = 'doc';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExt || '')) type = 'image';
    else if (['pdf'].includes(fileExt || '')) type = 'pdf';
    else if (['xls', 'xlsx'].includes(fileExt || '')) type = 'excel';
    else if (['zip', 'rar'].includes(fileExt || '')) type = 'zip';
    else if (['mp4', 'mov', 'avi'].includes(fileExt || '')) type = 'video';
    else if (['mp3', 'wav'].includes(fileExt || '')) type = 'audio';

    setAttachedFile({
      url: URL.createObjectURL(file),
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      type
    });
  };

  // Send Sticker
  const handleSendSticker = (stickerSymbol: string, stickerLabel: string) => {
    if (chatType === 'group') {
      storageService.sendChatMessage({
        channelId: activeChannelId,
        channelName: activeChannel?.name,
        content: `[Sticker Y Khoa: ${stickerLabel}]`,
        msgType: 'sticker',
        fileUrl: stickerSymbol,
        fileName: stickerLabel
      });
    } else {
      storageService.sendChatMessage({
        dmUserId: activeDmUserId,
        dmUserName: activeDmUser?.name,
        content: `[Sticker Y Khoa: ${stickerLabel}]`,
        msgType: 'sticker',
        fileUrl: stickerSymbol,
        fileName: stickerLabel
      });
    }
    setShowStickerPicker(false);
  };

  // Share Card Handler (Task, Doc, Schedule)
  const handleShareCard = (cardData: ShareCardData) => {
    if (chatType === 'group') {
      storageService.sendChatMessage({
        channelId: activeChannelId,
        channelName: activeChannel?.name,
        content: `Đã chia sẻ: ${cardData.title}`,
        msgType: 'share_card',
        shareCard: cardData
      });
    } else {
      storageService.sendChatMessage({
        dmUserId: activeDmUserId,
        dmUserName: activeDmUser?.name,
        content: `Đã chia sẻ: ${cardData.title}`,
        msgType: 'share_card',
        shareCard: cardData
      });
    }
    setShowShareModal(false);
  };

  // Create New Group Channel
  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const newChannel: ChatGroupChannel = {
      id: `group-${Date.now().toString().slice(-6)}`,
      name: newGroupName.trim(),
      type: 'group',
      description: newGroupDesc.trim() || 'Kênh thảo luận chuyên môn mới',
      members: Array.from(new Set([currentUser.id, ...newGroupMembers])),
      admins: [currentUser.id],
      isCustom: true,
      createdAt: new Date().toISOString().split('T')[0],
      createdBy: currentUser.name
    };

    storageService.saveChannel(newChannel);
    setActiveChannelId(newChannel.id);
    setChatType('group');
    setShowCreateGroupModal(false);
    setNewGroupName('');
    setNewGroupDesc('');
    setNewGroupMembers([]);
  };

  // Create Announcement
  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnncTitle.trim() || !newAnncContent.trim()) return;

    const newAnnc: DepartmentAnnouncement = {
      id: `ANC-${Date.now().toString().slice(-6)}`,
      title: newAnncTitle.trim(),
      content: newAnncContent.trim(),
      category: newAnncCategory,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: currentUser.title || currentUser.role,
      createdAt: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
      isUrgent: newAnncUrgent,
      reactions: [],
      comments: []
    };

    storageService.saveAnnouncement(newAnnc);
    setShowNewAnnouncementModal(false);
    setNewAnncTitle('');
    setNewAnncContent('');
    setNewAnncUrgent(false);
  };

  // Mention Handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    const lastWord = val.split(' ').pop();
    if (lastWord && lastWord.startsWith('@')) {
      setShowMentionMenu(true);
      setMentionQuery(lastWord.slice(1).toLowerCase());
    } else {
      setShowMentionMenu(false);
    }
  };

  const handleSelectMention = (user: User) => {
    const words = inputText.split(' ');
    words.pop();
    setInputText(`${words.join(' ')} @${user.name} `);
    setShowMentionMenu(false);
  };

  // Submit Thread Reply
  const handleAddThreadReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadMessage || !threadReplyInput.trim()) return;

    storageService.addThreadReply(activeThreadMessage.id, threadReplyInput.trim());
    setThreadReplyInput('');
    // refresh activeThreadMessage
    const updatedMsgs = storageService.getChatMessages();
    const updatedTarget = updatedMsgs.find(m => m.id === activeThreadMessage.id);
    if (updatedTarget) setActiveThreadMessage(updatedTarget);
  };

  // Edit Message Submit
  const handleSaveEditMessage = (msgId: string) => {
    if (!editText.trim()) return;
    storageService.editChatMessage(msgId, editText.trim());
    setEditingMessageId(null);
    setEditText('');
  };

  // Backup / Export Chat History
  const handleExportChatHistory = () => {
    const chatData = JSON.stringify({ messages, channels, announcements }, null, 2);
    const blob = new Blob([chatData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CLS_WorkHub_ChatHistory_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  // Search filter across messages
  const searchedMessages = searchQuery.trim() 
    ? messages.filter(m => 
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.fileName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="h-[calc(100vh-100px)] flex bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden select-none">
      
      {/* 1. LEFT MS TEAMS MAIN NAVIGATION RAIL */}
      <div className="w-16 bg-[#2f3142] dark:bg-slate-950 text-slate-300 flex flex-col items-center py-4 space-y-5 border-r border-slate-800 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-[#464eb8] flex items-center justify-center text-white font-extrabold text-lg shadow-md mb-2">
          <Activity className="w-6 h-6" />
        </div>

        <button 
          onClick={() => setNavSection('chat')}
          className={`relative p-2.5 rounded-xl transition-all flex flex-col items-center group ${
            navSection === 'chat' ? 'bg-[#464eb8] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Trò chuyện & Nhóm (Teams Chat)"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Teams</span>
          {messages.some(m => m.isUnread) && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-slate-900"></span>
          )}
        </button>

        <button 
          onClick={() => setNavSection('announcements')}
          className={`p-2.5 rounded-xl transition-all flex flex-col items-center group ${
            navSection === 'announcements' ? 'bg-[#464eb8] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Thông báo Toàn khoa"
        >
          <Bell className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Thông báo</span>
        </button>

        <button 
          onClick={() => setNavSection('saved')}
          className={`p-2.5 rounded-xl transition-all flex flex-col items-center group ${
            navSection === 'saved' ? 'bg-[#464eb8] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Tin nhắn Ghim & Đã lưu"
        >
          <Star className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Đã lưu</span>
        </button>

        <button 
          onClick={() => setNavSection('search')}
          className={`p-2.5 rounded-xl transition-all flex flex-col items-center group ${
            navSection === 'search' ? 'bg-[#464eb8] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Tìm kiếm nâng cao"
        >
          <Search className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Tìm kiếm</span>
        </button>

        <div className="flex-1"></div>

        <button 
          onClick={() => setNavSection('backup')}
          className={`p-2.5 rounded-xl transition-all flex flex-col items-center group ${
            navSection === 'backup' ? 'bg-[#464eb8] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Sao lưu & Đồng bộ Sheet"
        >
          <Archive className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Lưu trữ</span>
        </button>
      </div>

      {/* 2. SECONDARY SIDEBAR: CHANNELS & DIRECT MESSAGES */}
      <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col shrink-0">
        
        {/* Header Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
              <span>Communication Center</span>
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">Khoa Cận Lâm Sàng MS Teams</p>
          </div>

          <button 
            onClick={() => setShowCreateGroupModal(true)}
            className="p-1.5 bg-[#464eb8] hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center space-x-1 shadow-sm"
            title="Tạo nhóm chat mới"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[11px]">Tạo Nhóm</span>
          </button>
        </div>

        {/* Filter Input */}
        <div className="px-3 py-2 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text"
              placeholder="Lọc kênh hoặc nhân sự..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#464eb8] text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Channel & DM List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
          
          {/* Group Channels Section */}
          <div>
            <div className="px-3 pb-1.5 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Nhóm Trao Đổi Khoa ({channels.length})</span>
            </div>

            <div className="space-y-0.5">
              {channels
                .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(ch => {
                  const isActive = chatType === 'group' && activeChannelId === ch.id;
                  const unreadCount = messages.filter(m => m.channelId === ch.id && m.isUnread).length;

                  return (
                    <button
                      key={ch.id}
                      onClick={() => {
                        setChatType('group');
                        setActiveChannelId(ch.id);
                        setNavSection('chat');
                        storageService.markMessagesAsRead(ch.id);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#464eb8] text-white shadow-sm font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <Hash className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-indigo-500'}`} />
                        <span className="truncate">{ch.name}</span>
                      </div>

                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-extrabold rounded-full shrink-0">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div>
            <div className="px-3 pb-1.5 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Trò Chuyện Cá Nhân ({users.length - 1})</span>
            </div>

            <div className="space-y-0.5">
              {users
                .filter(u => u.id !== currentUser.id)
                .filter(u => !searchQuery || u.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(u => {
                  const isActive = chatType === 'dm' && activeDmUserId === u.id;
                  const presence = getUserPresence(u.id);
                  const unreadCount = messages.filter(m => m.senderId === u.id && m.dmUserId === currentUser.id && !m.isRead).length;

                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        setChatType('dm');
                        setActiveDmUserId(u.id);
                        setNavSection('chat');
                        storageService.markMessagesAsRead(u.id);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#464eb8] text-white shadow-sm font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <img src={u.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-slate-900 ${presence.color}`}></span>
                        </div>
                        <div className="truncate text-left">
                          <p className="truncate">{u.name}</p>
                          <p className={`text-[10px] truncate ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {u.title || u.role}
                          </p>
                        </div>
                      </div>

                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-extrabold rounded-full shrink-0">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

        </div>
      </div>

      {/* 3. MAIN CHAT THREAD / ANNOUNCEMENTS / VIEWS DISPLAY */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
        
        {/* VIEW MODE 1: TEAMS CHAT VIEW */}
        {navSection === 'chat' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* Active Header Bar */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
              <div className="flex items-center space-x-3">
                {chatType === 'group' ? (
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-950 text-[#464eb8] dark:text-indigo-300 rounded-xl">
                    <Hash className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="relative">
                    <img src={activeDmUser?.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${getUserPresence(activeDmUserId).color}`}></span>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                    <span>{chatType === 'group' ? activeChannel?.name : activeDmUser?.name}</span>
                    {chatType === 'group' && (
                      <span className="text-[10px] px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-[#464eb8] dark:text-indigo-300 rounded-full font-bold">
                        {activeChannel?.members.length || 0} thành viên
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium truncate max-w-lg">
                    {chatType === 'group' ? activeChannel?.description : `${activeDmUser?.title} - ${getUserPresence(activeDmUserId).label}`}
                  </p>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => setShowShareModal(true)}
                  className="px-2.5 py-1.5 bg-indigo-50 dark:bg-slate-800 hover:bg-indigo-100 text-[#464eb8] dark:text-indigo-300 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 border border-indigo-200/50 dark:border-slate-700"
                  title="Chia sẻ Công việc / Tài liệu / Lịch trực"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Chia sẻ thẻ</span>
                </button>

                {chatType === 'group' && (
                  <button 
                    onClick={() => setShowManageMembersModal(true)}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                    title="Quản lý thành viên nhóm"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                )}

                <button 
                  onClick={handleExportChatHistory}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                  title="Tải xuống nhật ký Chat JSON"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Pinned Messages Bar (If any exist) */}
            {pinnedMessages.length > 0 && (
              <div className="px-4 py-2 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
                <div className="flex items-center space-x-2 truncate">
                  <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="font-bold shrink-0">Tin ghim:</span>
                  <span className="truncate italic">"{pinnedMessages[0].content}"</span>
                </div>
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0 ml-2">
                  ({pinnedMessages.length} ghim)
                </span>
              </div>
            )}

            {/* Message Feed Canvas */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
              {activeMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                  <MessageSquare className="w-12 h-12 stroke-[1.5] text-slate-300 dark:text-slate-700 mb-3" />
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Chưa có tin nhắn nào trong cuộc trao đổi này</p>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Hãy gửi tin nhắn, đính kèm tài liệu SOP, hình ảnh X-Quang/CT hoặc chia sẻ thẻ công việc để bắt đầu!
                  </p>
                </div>
              ) : (
                activeMessages.map((msg) => {
                  const isMe = msg.senderId === currentUser.id;
                  const isPinned = msg.isPinned;
                  const isSaved = msg.isSaved;

                  return (
                    <div 
                      key={msg.id} 
                      className={`group relative flex items-start space-x-3 transition-all p-2 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        isMe ? 'flex-row-reverse space-x-reverse' : ''
                      }`}
                    >
                      {/* Avatar */}
                      <img 
                        src={msg.avatar || 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150'} 
                        alt="" 
                        className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs mt-1" 
                      />

                      {/* Main Message Box */}
                      <div className={`max-w-xl space-y-1 ${isMe ? 'items-end text-right' : ''}`}>
                        
                        {/* Header Info */}
                        <div className={`flex items-center space-x-2 text-[11px] ${isMe ? 'flex-row-reverse space-x-reverse' : ''}`}>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100">{msg.senderName}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium rounded">
                            {msg.senderRole}
                          </span>
                          <span className="text-slate-400 text-[10px]">{msg.timestamp}</span>
                          {msg.isUrgent && (
                            <span className="px-1.5 py-0.2 bg-rose-500 text-white font-extrabold text-[9px] rounded uppercase animate-pulse">
                              🚨 KHẨN
                            </span>
                          )}
                          {isPinned && <Pin className="w-3 h-3 text-amber-500" title="Đã ghim" />}
                          {isSaved && <Star className="w-3 h-3 text-indigo-500 fill-indigo-500" title="Đã lưu" />}
                        </div>

                        {/* Content Body Bubble */}
                        <div className={`relative p-3 rounded-2xl text-xs sm:text-sm leading-relaxed transition-all shadow-2xs ${
                          isMe 
                            ? 'bg-[#464eb8] text-white rounded-tr-none' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/80 dark:border-slate-700/80'
                        }`}>
                          
                          {/* Text message */}
                          {msg.content && (
                            <p className="whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                          )}

                          {/* Image Attachment */}
                          {msg.msgType === 'image' && msg.fileUrl && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700">
                              <img 
                                src={msg.fileUrl} 
                                alt={msg.fileName} 
                                onClick={() => setPreviewImageModal(msg.fileUrl || null)}
                                className="max-h-60 w-full object-cover cursor-pointer hover:scale-102 transition-transform" 
                              />
                              <p className="p-1.5 text-[10px] opacity-80 flex items-center justify-between">
                                <span>📷 {msg.fileName} ({msg.fileSize})</span>
                                <span className="underline cursor-pointer">Xem phóng to</span>
                              </p>
                            </div>
                          )}

                          {/* PDF & Document Cards */}
                          {(msg.msgType === 'pdf' || msg.msgType === 'doc' || msg.msgType === 'excel' || msg.msgType === 'zip') && (
                            <div className="mt-2 p-2.5 rounded-xl bg-white/10 dark:bg-slate-900/40 border border-white/20 dark:border-slate-700 flex items-center justify-between space-x-3">
                              <div className="flex items-center space-x-2 min-w-0">
                                {msg.msgType === 'pdf' && <FileText className="w-6 h-6 text-red-400 shrink-0" />}
                                {msg.msgType === 'excel' && <FileSpreadsheet className="w-6 h-6 text-emerald-400 shrink-0" />}
                                {msg.msgType === 'doc' && <FileText className="w-6 h-6 text-blue-400 shrink-0" />}
                                {msg.msgType === 'zip' && <FileArchive className="w-6 h-6 text-amber-400 shrink-0" />}
                                <div className="truncate">
                                  <p className="font-bold text-xs truncate">{msg.fileName || 'Tài liệu đính kèm'}</p>
                                  <p className="text-[10px] opacity-75">{msg.fileSize || 'FILE'}</p>
                                </div>
                              </div>
                              <a 
                                href={msg.fileUrl || '#'} 
                                target="_blank" 
                                rel="noreferrer"
                                className="px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded text-[10px] font-bold shrink-0 hover:bg-slate-200"
                              >
                                Tải xuống
                              </a>
                            </div>
                          )}

                          {/* Sticker Attachment */}
                          {msg.msgType === 'sticker' && (
                            <div className="text-4xl py-2 animate-bounce">
                              {msg.fileUrl}
                            </div>
                          )}

                          {/* Share Card Render */}
                          {msg.msgType === 'share_card' && msg.shareCard && (
                            <div className="mt-2 p-3 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-indigo-200 dark:border-indigo-900 shadow-sm">
                              <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100 dark:border-slate-800">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#464eb8] flex items-center space-x-1">
                                  {msg.shareCard.type === 'task' && <CheckSquare className="w-3 h-3" />}
                                  {msg.shareCard.type === 'document' && <FolderOpen className="w-3 h-3" />}
                                  {msg.shareCard.type === 'schedule' && <Calendar className="w-3 h-3" />}
                                  <span>THẺ CHIA SẺ {msg.shareCard.type.toUpperCase()}</span>
                                </span>
                                {msg.shareCard.badge && (
                                  <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-[#464eb8] dark:text-indigo-300 font-bold text-[9px] rounded">
                                    {msg.shareCard.badge}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">{msg.shareCard.title}</h4>
                              {msg.shareCard.subtitle && (
                                <p className="text-[11px] text-slate-500 mt-0.5">{msg.shareCard.subtitle}</p>
                              )}
                            </div>
                          )}

                          {/* Reactions List on Message */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2 pt-1 border-t border-white/20 dark:border-slate-700/60">
                              {msg.reactions.map((r, i) => (
                                <button
                                  key={i}
                                  onClick={() => storageService.addMessageReaction(msg.id, r.emoji)}
                                  className="px-1.5 py-0.5 bg-white/20 dark:bg-slate-900/60 rounded-full text-[10px] font-bold flex items-center space-x-1 hover:bg-white/40"
                                >
                                  <span>{r.emoji}</span>
                                  <span>{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Read Receipts */}
                          <div className={`mt-1 text-[9px] opacity-70 flex items-center justify-end space-x-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                            <span>{msg.isRead ? 'Đã xem' : 'Đã gửi'}</span>
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          </div>

                        </div>

                        {/* Thread Replies Button */}
                        <div className="flex items-center space-x-2 text-[10px] text-slate-400 pt-0.5">
                          <button 
                            onClick={() => {
                              setActiveThreadMessage(msg);
                              setShowThreadDrawer(true);
                            }}
                            className="hover:text-[#464eb8] dark:hover:text-indigo-300 font-bold flex items-center space-x-1"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>{msg.replies?.length ? `${msg.replies.length} phản hồi` : 'Trả lời theo luồng'}</span>
                          </button>
                        </div>

                      </div>

                      {/* HOVER QUICK ACTION TOOLBAR */}
                      <div className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-md flex items-center space-x-1 z-10 ${
                        isMe ? 'left-2' : 'right-2'
                      }`}>
                        {['👍', '❤️', '✅', '🚨'].map(emoji => (
                          <button 
                            key={emoji}
                            onClick={() => storageService.addMessageReaction(msg.id, emoji)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-xs"
                          >
                            {emoji}
                          </button>
                        ))}
                        <button 
                          onClick={() => storageService.togglePinMessage(msg.id)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-amber-500"
                          title="Ghim tin nhắn"
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => storageService.toggleSaveMessage(msg.id)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-indigo-500"
                          title="Lưu tin nhắn"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                        {isMe && (
                          <button 
                            onClick={() => storageService.deleteChatMessage(msg.id)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-rose-500"
                            title="Xóa tin nhắn"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attached File Preview Bar before Send */}
            {attachedFile && (
              <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/40 border-t border-indigo-100 dark:border-indigo-900 flex items-center justify-between text-xs text-[#464eb8] dark:text-indigo-300 shrink-0">
                <div className="flex items-center space-x-2 truncate">
                  <Paperclip className="w-4 h-4 shrink-0" />
                  <span className="font-bold truncate">{attachedFile.name}</span>
                  <span className="text-[10px] opacity-75">({attachedFile.size})</span>
                </div>
                <button onClick={() => setAttachedFile(null)} className="p-1 hover:bg-indigo-100 rounded">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Mention Suggestions Popup */}
            {showMentionMenu && (
              <div className="px-4 py-2 bg-slate-900 text-white text-xs border-t border-slate-800 flex items-center space-x-2 shrink-0">
                <AtSign className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-bold text-slate-400">Nhắc đến cán bộ:</span>
                <div className="flex flex-wrap gap-1">
                  {users
                    .filter(u => u.name.toLowerCase().includes(mentionQuery))
                    .slice(0, 4)
                    .map(u => (
                      <button 
                        key={u.id}
                        onClick={() => handleSelectMention(u)}
                        className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 rounded text-[11px] font-bold"
                      >
                        @{u.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Rich Composer Bar */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col space-y-2 shrink-0">
              
              {/* Composer Toolbar */}
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <div className="flex items-center space-x-1">
                  
                  {/* File Upload Trigger */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-all"
                    title="Đính kèm tệp (Ảnh, PDF, Word, Excel, ZIP)"
                  >
                    <Paperclip className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </button>

                  {/* Emoji Picker Popover Toggle */}
                  <div className="relative">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowEmojiPicker(!showEmojiPicker);
                        setShowStickerPicker(false);
                      }}
                      className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-all text-amber-500"
                      title="Biểu cảm Emoji"
                    >
                      <Smile className="w-4 h-4" />
                    </button>

                    {showEmojiPicker && (
                      <div className="absolute bottom-10 left-0 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl grid grid-cols-4 gap-1 z-30">
                        {emojis.map(e => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => {
                              setInputText(prev => prev + e);
                              setShowEmojiPicker(false);
                            }}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-base"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sticker Picker Toggle */}
                  <div className="relative">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowStickerPicker(!showStickerPicker);
                        setShowEmojiPicker(false);
                      }}
                      className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-all text-[#464eb8] font-bold text-xs"
                      title="Nhãn dán Sticker Y Khoa"
                    >
                      Sticker
                    </button>

                    {showStickerPicker && (
                      <div className="absolute bottom-10 left-0 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl w-64 grid grid-cols-2 gap-2 z-30">
                        {medicalStickers.map((st, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSendSticker(st.symbol, st.label)}
                            className={`p-2 rounded-xl text-left flex items-center space-x-2 transition-all hover:scale-102 ${st.color}`}
                          >
                            <span className="text-xl">{st.symbol}</span>
                            <span className="text-[10px] font-bold truncate">{st.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Share Card Trigger */}
                  <button 
                    type="button" 
                    onClick={() => setShowShareModal(true)}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-all text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center space-x-1"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Chia sẻ thẻ</span>
                  </button>

                  {/* Urgent Flag Toggle */}
                  <button 
                    type="button" 
                    onClick={() => setIsUrgent(!isUrgent)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition-all ${
                      isUrgent ? 'bg-rose-500 text-white shadow-xs animate-pulse' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    🚨 Đánh dấu KHẨN
                  </button>
                </div>

                <span className="text-[10px] text-slate-400">Ấn Enter để gửi, Shift+Enter để xuống dòng</span>
              </div>

              {/* Text Input Row */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder={`Gửi tin nhắn trao đổi trong ${chatType === 'group' ? '#' + activeChannel?.name : '@' + activeDmUser?.name}... (Nhập @ để nhắc tên)`}
                  className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#464eb8] text-slate-800 dark:text-slate-100"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() && !attachedFile}
                  className="px-5 py-2.5 bg-[#464eb8] hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Gửi</span>
                </button>
              </div>

            </form>

          </div>
        )}

        {/* VIEW MODE 2: DEPARTMENT ANNOUNCEMENTS (THÔNG BÁO) */}
        {navSection === 'announcements' && (
          <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 space-y-6 custom-scrollbar">
            
            {/* Announcement Banner */}
            <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-md">
              <div>
                <div className="flex items-center space-x-2 text-indigo-300 font-bold text-xs uppercase tracking-wider mb-1">
                  <Bell className="w-4 h-4" />
                  <span>Bảng Thông Báo Nội Bộ Khoa</span>
                </div>
                <h2 className="text-xl font-extrabold">Thông Báo & Chỉ Đạo Ban Chủ Nhiệm Khoa</h2>
                <p className="text-xs text-indigo-200 mt-1 max-w-2xl">
                  Truyền đạt chỉ thị khẩn cấp, lịch trực, thông báo họp giao ban và quy trình chuyên môn ISO 15189.
                </p>
              </div>

              <button 
                onClick={() => setShowNewAnnouncementModal(true)}
                className="px-4 py-2.5 bg-white text-indigo-900 hover:bg-indigo-50 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Đăng Thông Báo Mới</span>
              </button>
            </div>

            {/* Announcement Category Filter Tabs */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-2 custom-scrollbar">
              {['Tất cả', 'Thông báo khẩn', 'Lịch họp', 'Đổi lịch trực', 'Công việc', 'Toàn khoa'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setAnnouncementCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    announcementCategory === cat
                      ? 'bg-[#464eb8] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Announcements List */}
            <div className="space-y-4">
              {announcements
                .filter(a => announcementCategory === 'Tất cả' || a.category === announcementCategory)
                .map((anc) => (
                  <div 
                    key={anc.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      anc.isUrgent 
                        ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900' 
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            anc.isUrgent ? 'bg-rose-600 text-white' : 'bg-indigo-100 dark:bg-indigo-950 text-[#464eb8] dark:text-indigo-300'
                          }`}>
                            {anc.category}
                          </span>
                          <span className="text-xs text-slate-400">{anc.createdAt}</span>
                        </div>

                        <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">{anc.title}</h3>
                        <p className="text-xs text-slate-500 font-bold">Người đăng: {anc.senderName} ({anc.senderRole})</p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {anc.content}
                    </p>

                    {/* Reactions & Comments Footer */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center space-x-2">
                        {anc.reactions?.map((r, i) => (
                          <span key={i} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full font-bold text-[10px]">
                            {r.emoji} {r.count}
                          </span>
                        ))}
                      </div>

                      <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                        {anc.comments?.length || 0} Ý kiến trao đổi
                      </span>
                    </div>

                  </div>
                ))}
            </div>

          </div>
        )}

        {/* VIEW MODE 3: PINNED & SAVED MESSAGES (ĐÃ LƯU) */}
        {navSection === 'saved' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-4 custom-scrollbar">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <Star className="w-5 h-5 text-indigo-600" />
              <span>Tin Nhắn Đã Lưu & Ghim Quan Trọng</span>
            </h2>

            <div className="space-y-3">
              {messages.filter(m => m.isSaved || m.isPinned).length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Chưa có tin nhắn nào được đánh dấu lưu hoặc ghim.
                </div>
              ) : (
                messages.filter(m => m.isSaved || m.isPinned).map(m => (
                  <div key={m.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{m.senderName} ({m.senderRole})</span>
                      <span className="text-slate-400 text-[10px]">{m.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* VIEW MODE 4: ADVANCED SEARCH */}
        {navSection === 'search' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-4 custom-scrollbar">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <Search className="w-5 h-5 text-[#464eb8]" />
              <span>Tìm Kiếm Nâng Cao Trong Hệ Thống Chat</span>
            </h2>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input 
                type="text" 
                placeholder="Nhập từ khóa tìm kiếm (Tên cán bộ, file SOP, nội dung chỉ đạo...)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase">Kết quả tìm kiếm ({searchedMessages.length})</p>
              {searchedMessages.map(m => (
                <div key={m.id} className="p-3 bg-white dark:bg-slate-800 border rounded-xl text-xs">
                  <div className="font-bold text-slate-900 dark:text-slate-100">{m.senderName} - <span className="text-slate-400 font-normal">{m.timestamp}</span></div>
                  <p className="text-slate-600 dark:text-slate-300 mt-1">{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW MODE 5: BACKUP & STORAGE SYNC */}
        {navSection === 'backup' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <Archive className="w-5 h-5 text-emerald-600" />
              <span>Sao Lưu & Đồng Bộ Dữ Liệu Communication Center</span>
            </h2>

            <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-900 dark:text-emerald-200 space-y-3">
              <h3 className="font-extrabold text-sm">Tình Trạng Lưu Trữ & Security Audit Log</h3>
              <p>Mọi dữ liệu tin nhắn, tệp đính kèm SOP và thẻ công việc đều được mã hóa lưu trữ local và có cấu trúc tương thích chuẩn Google Sheet API & Firestore.</p>
              
              <div className="pt-2 flex items-center space-x-3">
                <button 
                  onClick={handleExportChatHistory}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs"
                >
                  Xuất File JSON Sao Lưu Toàn Khoa
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: SHARE CARD (Task, Document, Schedule) */}
      {showShareModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Chia Sẻ Thẻ Vào Cuộc Thảo Luận</h3>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              <p className="text-xs font-bold text-slate-500 uppercase">Công Việc Hiện Tại</p>
              {tasks.slice(0, 3).map(t => (
                <button 
                  key={t.id}
                  onClick={() => handleShareCard({ type: 'task', id: t.id, title: t.title, subtitle: `Người phụ trách: ${t.assignee}`, badge: t.priority })}
                  className="w-full text-left p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-800 text-xs font-bold"
                >
                  📌 [Công việc] {t.title}
                </button>
              ))}

              <p className="text-xs font-bold text-slate-500 uppercase pt-2">Hồ Sơ & Tài Liệu ISO</p>
              {documents.slice(0, 3).map(d => (
                <button 
                  key={d.id}
                  onClick={() => handleShareCard({ type: 'document', id: d.id, title: d.title, subtitle: `Mã SOP: ${d.code}`, badge: d.version })}
                  className="w-full text-left p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-800 text-xs font-bold"
                >
                  📄 [Tài liệu] {d.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE NEW GROUP CHANNEL */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreateGroup} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Tạo Nhóm Thảo Luận Mới</h3>
              <button type="button" onClick={() => setShowCreateGroupModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Tên Nhóm / Kênh *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="Ví dụ: Nhóm Nghiên Cứu Đề Tài ISO, Nhóm Máy Siêu Âm 4D..." 
                  value={newGroupName} 
                  onChange={(e) => setNewGroupName(e.target.value)} 
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl mt-1 text-xs" 
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Mô tả nhóm</label>
                <input 
                  type="text" 
                  placeholder="Nội dung thảo luận chính..." 
                  value={newGroupDesc} 
                  onChange={(e) => setNewGroupDesc(e.target.value)} 
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl mt-1 text-xs" 
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Chọn thành viên tham gia</label>
                <div className="mt-1 max-h-36 overflow-y-auto space-y-1 p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  {users.map(u => (
                    <label key={u.id} className="flex items-center space-x-2 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newGroupMembers.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) setNewGroupMembers([...newGroupMembers, u.id]);
                          else setNewGroupMembers(newGroupMembers.filter(id => id !== u.id));
                        }}
                      />
                      <span>{u.name} ({u.title || u.role})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button type="button" onClick={() => setShowCreateGroupModal(false)} className="px-3 py-2 text-xs font-bold text-slate-500">Hủy</button>
              <button type="submit" className="px-4 py-2 bg-[#464eb8] text-white text-xs font-bold rounded-xl shadow-xs">Tạo Nhóm</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: NEW ANNOUNCEMENT */}
      {showNewAnnouncementModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreateAnnouncement} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Đăng Thông Báo Nội Bộ Khoa</h3>
              <button type="button" onClick={() => setShowNewAnnouncementModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Danh mục thông báo</label>
                <select 
                  value={newAnncCategory} 
                  onChange={(e) => setNewAnncCategory(e.target.value as AnnouncementCategory)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl mt-1 text-xs"
                >
                  <option value="Toàn khoa">Toàn khoa</option>
                  <option value="Thông báo khẩn">Thông báo khẩn</option>
                  <option value="Lịch họp">Lịch họp</option>
                  <option value="Đổi lịch trực">Đổi lịch trực</option>
                  <option value="Công việc">Công việc</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Tiêu đề thông báo *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="Nhập tiêu đề thông báo..." 
                  value={newAnncTitle} 
                  onChange={(e) => setNewAnncTitle(e.target.value)} 
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl mt-1 text-xs" 
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Nội dung chi tiết *</label>
                <textarea 
                  rows={4} 
                  required 
                  placeholder="Nội dung truyền đạt..." 
                  value={newAnncContent} 
                  onChange={(e) => setNewAnncContent(e.target.value)} 
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl mt-1 text-xs" 
                />
              </div>

              <label className="flex items-center space-x-2 font-bold text-rose-600 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={newAnncUrgent} 
                  onChange={(e) => setNewAnncUrgent(e.target.checked)} 
                />
                <span>🚨 Đánh dấu Thông Báo Khẩn Cấp</span>
              </label>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button type="button" onClick={() => setShowNewAnnouncementModal(false)} className="px-3 py-2 text-xs font-bold text-slate-500">Hủy</button>
              <button type="submit" className="px-4 py-2 bg-[#464eb8] text-white text-xs font-bold rounded-xl shadow-xs">Đăng Thông Báo</button>
            </div>
          </form>
        </div>
      )}

      {/* DRAWER: THREAD REPLY DRAWER */}
      {showThreadDrawer && activeThreadMessage && (
        <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-extrabold text-xs text-slate-900 dark:text-slate-100">Luồng Thảo Luận Chi Tiết</h3>
            <button onClick={() => setShowThreadDrawer(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>

          <div className="p-3 border-b bg-white dark:bg-slate-800/60 text-xs space-y-1">
            <span className="font-bold text-slate-900 dark:text-slate-100">{activeThreadMessage.senderName}:</span>
            <p className="text-slate-600 dark:text-slate-300">{activeThreadMessage.content}</p>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-2 custom-scrollbar text-xs">
            {activeThreadMessage.replies?.map(r => (
              <div key={r.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span>{r.senderName}</span>
                  <span>{r.timestamp}</span>
                </div>
                <p className="text-slate-800 dark:text-slate-200">{r.content}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddThreadReply} className="p-3 border-t bg-white dark:bg-slate-800 flex items-center space-x-2">
            <input 
              type="text" 
              placeholder="Trả lời tin nhắn..." 
              value={threadReplyInput} 
              onChange={(e) => setThreadReplyInput(e.target.value)} 
              className="flex-1 p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs" 
            />
            <button type="submit" className="p-2 bg-[#464eb8] text-white rounded-lg"><Send className="w-3.5 h-3.5" /></button>
          </form>
        </div>
      )}

      {/* IMAGE PREVIEW LIGHTBOX MODAL */}
      {previewImageModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6" onClick={() => setPreviewImageModal(null)}>
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl">
            <img src={previewImageModal} alt="" className="max-w-full max-h-[85vh] object-contain" />
            <button onClick={() => setPreviewImageModal(null)} className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-full"><X className="w-5 h-5" /></button>
          </div>
        </div>
      )}

    </div>
  );
};
