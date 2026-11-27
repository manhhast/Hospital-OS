import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  FolderOpen,
  MessageSquare,
  Settings,
  Activity,
  ChevronRight,
  ChevronDown,
  Wrench,
  Building2,
  BarChart3,
  FileCheck,
  Sparkles,
  SlidersHorizontal,
  History,
  UserCheck,
  Users,
  Bell,
  Network,
  Code2,
  Bot,
  Pin,
  PinOff,
  Plus,
  Check,
  ArrowUp,
  ArrowDown,
  RotateCcw
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { User } from '../../types/hospital';
import { CONFIG_MODULE_IDS } from '../settings/SystemConfigHubView';
import { resolveEffectiveUserAccess } from '../../utils/rbac';
import {
  DEFAULT_PINNED_MENU_IDS,
  QUICK_ACCESS_PINS_CHANGED_EVENT,
  loadPinnedMenuIds,
  movePinnedMenuId,
  savePinnedMenuIds,
  togglePinnedMenuId
} from '../../utils/quickAccessMenu';

interface SidebarProps {
  activeModule: string;
  onSelectModule: (module: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: string | null;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  collapsed,
  onToggleCollapse
}) => {
  const [currentUser, setCurrentUser] = useState<User>(storageService.getCurrentUser());

  const [pendingSyncDiscrepancies, setPendingSyncDiscrepancies] = useState<number>(() => {
    return storageService.getSyncHistory().reduce(
      (sum, entry) =>
        sum +
        (entry.discrepancies || []).filter(
          (d) => !d.resolutionStatus || d.resolutionStatus === 'pending'
        ).length,
      0
    );
  });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    quickAccess: true,
    executive: false,
    paraclinical: false,
    operations: false,
    system: false
  });
  const [isEditingPins, setIsEditingPins] = useState(false);

  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setCurrentUser(storageService.getCurrentUser());
      const count = storageService.getSyncHistory().reduce(
        (sum, entry) =>
          sum +
          (entry.discrepancies || []).filter(
            (d) => !d.resolutionStatus || d.resolutionStatus === 'pending'
          ).length,
        0
      );
      setPendingSyncDiscrepancies(count);
    });
    return () => unsubscribe();
  }, []);

  const actorAccess = resolveEffectiveUserAccess(
    currentUser,
    storageService.getStaffProfiles(),
    storageService.getDepartments(),
    storageService.getRooms()
  );
  const isAdmin = actorAccess.isSystemAdmin;
  const canOpenConfigHub = isAdmin || actorAccess.permissions.canConfigureRBAC;
  const isConfigActive = CONFIG_MODULE_IDS.includes(activeModule as typeof CONFIG_MODULE_IDS[number]);

  // Auto-expand the system group if user lands on a config module
  useEffect(() => {
    if (isConfigActive) {
      setOpenGroups((prev) => ({ ...prev, system: true }));
    }
  }, [isConfigActive]);

  const navGroups: NavGroup[] = [
    {
      id: 'executive',
      label: 'Điều hành & Thống kê',
      icon: BarChart3,
      items: [
        { id: 'dashboard', label: 'Tổng quan Hệ thống', icon: LayoutDashboard },
        { id: 'reports', label: 'Báo cáo & Thống kê', icon: BarChart3 },
        {
          id: 'sync-history',
          label: 'Lịch sử Đồng bộ',
          icon: History,
          count: pendingSyncDiscrepancies > 0 ? `${pendingSyncDiscrepancies}` : null
        },
        { id: 'ai-ecosystem', label: 'Trợ lý AI Điều hành', icon: Sparkles }
      ]
    },
    {
      id: 'paraclinical',
      label: 'Quản lý Cận lâm sàng',
      icon: Building2,
      items: [
        { id: 'equipment', label: 'Máy móc & Thiết bị', icon: Wrench },
        { id: 'rooms', label: 'Phòng / Bộ phận', icon: Building2 },
        { id: 'documents', label: 'Hồ sơ & Quy trình ISO', icon: FolderOpen }
      ]
    },
    {
      id: 'operations',
      label: 'Nhân sự & Công tác',
      icon: UserCheck,
      items: [
        { id: 'tasks', label: 'Công việc & Kế hoạch', icon: CheckSquare },
        { id: 'schedule', label: 'Lịch trực & Ca công tác', icon: Calendar },
        { id: 'hr', label: 'Nhân sự & Đào tạo', icon: UserCheck },
        { id: 'meetings', label: 'Cuộc họp & Hội chẩn', icon: FileCheck },
        { id: 'discussion', label: 'Trao đổi Nội bộ', icon: MessageSquare }
      ]
    }
  ];

  const allSystemItems: NavItem[] = [
    { id: 'settings', label: 'Cấu hình Hệ thống', icon: Settings },
    { id: 'telegram', label: 'Cài đặt Telegram Bot', icon: Bot },
    { id: 'users', label: 'Phân quyền Hệ thống', icon: Users },
    { id: 'notifications', label: 'Thông báo Nội bộ', icon: Bell },
    { id: 'integration', label: 'Cổng API HIS/LIS/PACS', icon: Network },
    { id: 'audit', label: 'Lịch sử Audit Log', icon: History },
    { id: 'gas-architecture', label: 'Kiến trúc GAS Code', icon: Code2 }
  ];

  const visibleSystemItems = isAdmin
    ? allSystemItems
    : allSystemItems.filter((item) => item.id === 'users' && actorAccess.permissions.canConfigureRBAC);

  const pinnableSections = useMemo(() => {
    const baseSections = navGroups.map((g) => ({
      id: g.id,
      label: g.label,
      items: g.items
    }));
    if (canOpenConfigHub && visibleSystemItems.length > 0) {
      baseSections.push({
        id: 'system',
        label: 'Quản trị Hệ thống',
        items: visibleSystemItems
      });
    }
    return baseSections;
  }, [navGroups, canOpenConfigHub, visibleSystemItems]);

  const allowedItemMap = useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const sec of pinnableSections) {
      for (const item of sec.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [pinnableSections]);

  const allowedIdSet = useMemo(() => new Set(allowedItemMap.keys()), [allowedItemMap]);

  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    loadPinnedMenuIds(currentUser.id, allowedIdSet)
  );

  // Sync pinned menu items when active user, permissions, or server preferences change
  useEffect(() => {
    setPinnedIds(loadPinnedMenuIds(currentUser.id, allowedIdSet));
    setIsEditingPins(false);
  }, [currentUser.id, canOpenConfigHub, isAdmin, allowedIdSet]);

  useEffect(() => {
    const onPinsChanged = () => {
      setPinnedIds(loadPinnedMenuIds(currentUser.id, allowedIdSet));
    };
    window.addEventListener(QUICK_ACCESS_PINS_CHANGED_EVENT, onPinsChanged);
    return () => window.removeEventListener(QUICK_ACCESS_PINS_CHANGED_EVENT, onPinsChanged);
  }, [currentUser.id, allowedIdSet]);

  const updatePinnedIds = (updater: (prev: string[]) => string[]) => {
    setPinnedIds((prev) => {
      const next = updater(prev).filter((id) => allowedIdSet.has(id));
      savePinnedMenuIds(currentUser.id, next);
      return next;
    });
  };

  const handleTogglePin = (itemId: string) => {
    updatePinnedIds((prev) => togglePinnedMenuId(prev, itemId));
  };

  const handleMovePin = (itemId: string, direction: 'up' | 'down') => {
    updatePinnedIds((prev) => movePinnedMenuId(prev, itemId, direction));
  };

  const handleResetPins = () => {
    updatePinnedIds(() => DEFAULT_PINNED_MENU_IDS.filter((id) => allowedIdSet.has(id)));
  };

  const pinnedItems = useMemo(
    () =>
      pinnedIds
        .map((id) => allowedItemMap.get(id))
        .filter((item): item is NavItem => Boolean(item)),
    [pinnedIds, allowedItemMap]
  );

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isQuickAccessOpen = openGroups.quickAccess !== false;

  return (
    <aside
      className={`relative flex flex-col h-screen bg-[#0F355B] dark:bg-[#0D1628] text-slate-100 dark:text-slate-200 border-r border-[#0B2A4A] dark:border-slate-800 transition-all duration-200 z-40 select-none shrink-0 shadow-xs ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* HIS Brand Header */}
      <div className="flex items-center h-16 px-3.5 border-b border-white/12 dark:border-slate-800 bg-[#0B2A4A] dark:bg-[#09101E] shrink-0">
        <button
          type="button"
          onClick={() => onSelectModule('dashboard')}
          className="flex items-center gap-2.5 overflow-hidden text-left w-full cursor-pointer"
          title="Về Tổng quan Hệ thống HIS"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1976D2] text-white border border-sky-300/30 shrink-0 shadow-xs">
            <Activity className="w-4 h-4 stroke-[2.5]" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-white tracking-tight leading-tight whitespace-nowrap truncate">
                Hospital HIS · CLS
              </div>
              <div className="text-[11px] text-sky-200/90 font-medium truncate">
                BVĐK Sông Thương
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Multi-Level Functional Menu Tree */}
      <nav
        aria-label="Menu chức năng HIS"
        className="flex-1 px-2.5 py-3 space-y-2.5 overflow-y-auto overflow-x-hidden custom-scrollbar"
      >
        {/* Pinned Quick Access Menu (Top) */}
        <div className="pb-2.5 border-b border-white/15 dark:border-slate-800 space-y-1">
          {!collapsed ? (
            <div className="flex items-center justify-between gap-1 px-1.5">
              <button
                type="button"
                onClick={() => toggleGroup('quickAccess')}
                className="flex items-center gap-1.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200/95 hover:text-white transition-colors cursor-pointer min-w-0"
              >
                <Pin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="truncate">Truy cập nhanh</span>
                {isQuickAccessOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-75" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-75" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsEditingPins((prev) => !prev);
                  if (!isQuickAccessOpen) {
                    setOpenGroups((prev) => ({ ...prev, quickAccess: true }));
                  }
                }}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer shrink-0 ${
                  isEditingPins
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-white/10 text-sky-100 hover:bg-white/20 hover:text-white'
                }`}
                title={isEditingPins ? 'Hoàn tất ghim menu' : 'Chọn & ghim menu con truy cập nhanh'}
              >
                {isEditingPins ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Xong</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <span>Ghim</span>
                  </>
                )}
              </button>
            </div>
          ) : null}

          {/* Collapsed Icon Rail: Quick Access Pinned Items */}
          {collapsed && pinnedItems.length > 0 && (
            <div className="space-y-0.5 pb-1">
              {pinnedItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <div key={`pin-rail-${item.id}`} className="relative group">
                    <button
                      type="button"
                      onClick={() => onSelectModule(item.id)}
                      className={`w-full flex items-center justify-center px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-white text-[#155A9C] dark:bg-[#1976D2] dark:text-white font-bold shadow-xs border border-white/90 dark:border-sky-400/40'
                          : 'text-amber-100/95 hover:bg-white/12 dark:hover:bg-slate-800/80 hover:text-white border border-transparent'
                      }`}
                      title={`Truy cập nhanh: ${item.label}`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-[#1976D2] dark:text-white' : 'text-amber-300'
                        }`}
                      />
                    </button>
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-[#0B2A4A] dark:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-md border border-white/15 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 flex items-center gap-2">
                      <Pin className="w-3 h-3 text-amber-300" />
                      <span>{item.label}</span>
                      {item.count && (
                        <span className="bg-amber-400 text-slate-900 px-1 rounded text-[10px] font-mono tabular-nums">
                          {item.count}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Expanded Sidebar: Pinned Quick Access Items */}
          {!collapsed && isQuickAccessOpen && (
            <div className="space-y-1">
              {pinnedItems.length === 0 ? (
                <div className="px-2.5 py-2 rounded-lg border border-dashed border-white/15 bg-white/5 text-[11px] text-sky-200/75 flex items-center justify-between gap-2">
                  <span>Chưa ghim menu nào</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingPins(true)}
                    className="text-amber-300 hover:text-amber-200 font-semibold cursor-pointer shrink-0"
                  >
                    + Chọn ngay
                  </button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {pinnedItems.map((item, idx) => {
                    const Icon = item.icon;
                    const isActive = activeModule === item.id;
                    return (
                      <div key={`pin-${item.id}`} className="relative group flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onSelectModule(item.id)}
                          className={`flex-1 min-w-0 flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap ${
                            isActive
                              ? 'bg-white text-[#155A9C] dark:bg-[#1976D2] dark:text-white font-bold shadow-xs border border-white/90 dark:border-sky-400/40'
                              : 'bg-white/[0.06] text-sky-50 dark:text-slate-200 font-medium hover:bg-white/14 dark:hover:bg-slate-800/80 hover:text-white border border-white/[0.06]'
                          }`}
                          title={item.label}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isActive
                                  ? 'text-[#1976D2] dark:text-white'
                                  : 'text-amber-300 group-hover:text-amber-200'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.count && (
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded tabular-nums shrink-0 ml-1 ${
                                isActive
                                  ? 'bg-[#1976D2] text-white dark:bg-white dark:text-[#155A9C]'
                                  : 'bg-amber-400/20 text-amber-200 border border-amber-300/35'
                              }`}
                            >
                              {item.count}
                            </span>
                          )}
                        </button>

                        {isEditingPins ? (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMovePin(item.id, 'up')}
                              disabled={idx === 0}
                              className="p-1 rounded text-sky-200 hover:text-white hover:bg-white/15 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                              title="Đưa lên trên"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMovePin(item.id, 'down')}
                              disabled={idx === pinnedItems.length - 1}
                              className="p-1 rounded text-sky-200 hover:text-white hover:bg-white/15 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                              title="Đưa xuống dưới"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTogglePin(item.id)}
                              className="p-1 rounded text-rose-300 hover:text-rose-200 hover:bg-rose-500/20 cursor-pointer"
                              title="Bỏ ghim"
                            >
                              <PinOff className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleTogglePin(item.id)}
                            className="p-1 rounded text-sky-300/60 hover:text-rose-200 hover:bg-white/12 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shrink-0"
                            title={`Bỏ ghim "${item.label}" khỏi Truy cập nhanh`}
                          >
                            <PinOff className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Inline Submenu Pin Selector */}
              {isEditingPins && (
                <div className="mt-1.5 rounded-lg border border-white/15 bg-[#09233E] dark:bg-slate-900/95 p-2 space-y-2 shadow-inner">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/10">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                      Chọn menu con để ghim
                    </span>
                    <button
                      type="button"
                      onClick={handleResetPins}
                      className="inline-flex items-center gap-1 text-[10px] text-sky-300 hover:text-white cursor-pointer"
                      title="Khôi phục danh sách mặc định"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Mặc định</span>
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto pr-0.5 space-y-2 custom-scrollbar">
                    {pinnableSections.map((sec) => (
                      <div key={`pick-sec-${sec.id}`} className="space-y-0.5">
                        <div className="text-[10px] font-semibold text-sky-300/80 px-1 truncate">
                          {sec.label}
                        </div>
                        {sec.items.map((item) => {
                          const ItemIcon = item.icon;
                          const isPinned = pinnedIds.includes(item.id);
                          return (
                            <button
                              key={`pick-${item.id}`}
                              type="button"
                              onClick={() => handleTogglePin(item.id)}
                              className={`w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                                isPinned
                                  ? 'bg-amber-400/15 text-amber-100 font-semibold'
                                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <ItemIcon
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isPinned ? 'text-amber-300' : 'text-sky-300/80'
                                  }`}
                                />
                                <span className="truncate">{item.label}</span>
                              </span>
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                  isPinned
                                    ? 'bg-amber-400 border-amber-300 text-slate-950'
                                    : 'border-white/25 bg-white/5 text-transparent'
                                }`}
                              >
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Standard Collapsible Functional Groups */}
        {navGroups.map((group) => {
          const isGroupOpen = openGroups[group.id] !== false;
          const GroupIcon = group.icon;

          return (
            <div key={group.id} className="space-y-0.5">
              {/* Group Parent Row (Level 1) */}
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-200/85 hover:text-white transition-colors cursor-pointer rounded-md"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <GroupIcon className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                    <span className="truncate">{group.label}</span>
                  </span>
                  {isGroupOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  )}
                </button>
              ) : (
                <div className="my-1.5 border-t border-white/15 first:hidden" />
              )}

              {/* Child Items (Level 2) */}
              {(collapsed || isGroupOpen) && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeModule === item.id;
                    const isPinned = pinnedIds.includes(item.id);

                    return (
                      <div key={item.id} className="relative group flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onSelectModule(item.id)}
                          className={`flex-1 min-w-0 flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap relative ${
                            isActive
                              ? 'bg-white text-[#155A9C] dark:bg-[#1976D2] dark:text-white font-bold shadow-xs border border-white/90 dark:border-sky-400/40'
                              : 'text-sky-50/90 dark:text-slate-200 font-medium hover:bg-white/12 dark:hover:bg-slate-800/80 hover:text-white border border-transparent'
                          }`}
                          title={item.label}
                        >
                          <div className={`flex items-center min-w-0 ${collapsed ? 'justify-center w-full' : 'gap-2.5'}`}>
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive
                                  ? 'text-[#1976D2] dark:text-white'
                                  : 'text-sky-300/90 dark:text-slate-400 group-hover:text-white'
                              }`}
                            />
                            {!collapsed && <span className="truncate">{item.label}</span>}
                          </div>

                          {!collapsed && item.count && (
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded tabular-nums shrink-0 ml-1 ${
                                isActive
                                  ? 'bg-[#1976D2] text-white dark:bg-white dark:text-[#155A9C]'
                                  : 'bg-amber-400/20 text-amber-200 border border-amber-300/35'
                              }`}
                            >
                              {item.count}
                            </span>
                          )}
                        </button>

                        {!collapsed && (
                          <button
                            type="button"
                            onClick={() => handleTogglePin(item.id)}
                            className={`p-1 rounded transition-opacity cursor-pointer shrink-0 ${
                              isPinned
                                ? 'text-amber-300 hover:bg-white/15 opacity-90 hover:opacity-100'
                                : 'text-sky-300/75 hover:text-amber-200 hover:bg-white/15 opacity-0 group-hover:opacity-100 focus:opacity-100'
                            }`}
                            title={isPinned ? `Bỏ ghim "${item.label}"` : `Ghim "${item.label}" lên Truy cập nhanh`}
                          >
                            <Pin className={`w-3 h-3 ${isPinned ? 'fill-amber-300' : ''}`} />
                          </button>
                        )}

                        {collapsed && (
                          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-[#0B2A4A] dark:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-md border border-white/15 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 flex items-center gap-2">
                            <span>{item.label}</span>
                            {item.count && (
                              <span className="bg-amber-400 text-slate-900 px-1 rounded text-[10px] font-mono tabular-nums">
                                {item.count}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Level-1 + Level-2 System Administration Tree (RBAC protected) */}
        {canOpenConfigHub && (
          <div className="pt-2.5 mt-2 border-t border-white/12 dark:border-slate-800 space-y-0.5">
            {!collapsed ? (
              <button
                type="button"
                onClick={() => toggleGroup('system')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors cursor-pointer ${
                  isConfigActive
                    ? 'text-white bg-white/12'
                    : 'text-sky-200/85 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                  <span className="truncate">Quản trị Hệ thống</span>
                </span>
                {openGroups.system ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-80" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-80" />
                )}
              </button>
            ) : null}

            {collapsed ? (
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onSelectModule(isConfigActive ? activeModule : (isAdmin ? 'settings' : 'users'))}
                  className={`w-full flex items-center justify-center px-2.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    isConfigActive
                      ? 'bg-white text-[#155A9C] dark:bg-[#1976D2] dark:text-white shadow-xs'
                      : 'text-sky-200/90 hover:bg-white/12 hover:text-white'
                  }`}
                  title="Quản trị Hệ thống"
                >
                  <SlidersHorizontal className="w-4 h-4 shrink-0" />
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-[#0B2A4A] dark:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-md border border-white/15 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                  Quản trị Hệ thống
                </div>
              </div>
            ) : (
              openGroups.system && (
                <div className="space-y-0.5 pl-1.5">
                  {visibleSystemItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeModule === item.id;
                    const isPinned = pinnedIds.includes(item.id);
                    return (
                      <div key={item.id} className="group flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onSelectModule(item.id)}
                          className={`flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap ${
                            isActive
                              ? 'bg-white text-[#155A9C] dark:bg-[#1976D2] dark:text-white font-bold shadow-xs border border-white/90 dark:border-sky-400/40'
                              : 'text-sky-50/90 dark:text-slate-200 font-medium hover:bg-white/12 dark:hover:bg-slate-800/80 hover:text-white border border-transparent'
                          }`}
                          title={item.label}
                        >
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-[#1976D2] dark:text-white' : 'text-sky-300/90 dark:text-slate-400'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePin(item.id)}
                          className={`p-1 rounded transition-opacity cursor-pointer shrink-0 ${
                            isPinned
                              ? 'text-amber-300 hover:bg-white/15 opacity-90 hover:opacity-100'
                              : 'text-sky-300/75 hover:text-amber-200 hover:bg-white/15 opacity-0 group-hover:opacity-100 focus:opacity-100'
                          }`}
                          title={isPinned ? `Bỏ ghim "${item.label}"` : `Ghim "${item.label}" lên Truy cập nhanh`}
                        >
                          <Pin className={`w-3 h-3 ${isPinned ? 'fill-amber-300' : ''}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}
      </nav>

      {/* Sidebar Collapse Toggle */}
      <div className="p-2.5 border-t border-white/12 dark:border-slate-800 bg-[#0B2A4A]/65 dark:bg-[#09101E]/65 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-2 text-sky-100/90 hover:text-white hover:bg-white/12 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap text-xs font-medium"
          title={collapsed ? 'Mở rộng menu điều hướng' : 'Thu gọn menu điều hướng'}
        >
          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
          {!collapsed && <span className="ml-2">Thu gọn menu</span>}
        </button>
      </div>
    </aside>
  );
};
