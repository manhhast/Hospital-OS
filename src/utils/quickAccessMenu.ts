export const DEFAULT_PINNED_MENU_IDS = ['dashboard', 'reports', 'tasks'];

const STORAGE_KEY_PREFIX = 'cls_workhub_quick_access_pins_v1_';

export const getQuickAccessStorageKey = (userId?: string | null): string =>
  `${STORAGE_KEY_PREFIX}${String(userId || 'default').trim() || 'default'}`;

export const sanitizePinnedMenuIds = (
  ids: unknown,
  allowedIds: ReadonlySet<string>
): string[] => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id) || !allowedIds.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
};

export const loadPinnedMenuIds = (
  userId: string | undefined | null,
  allowedIds: ReadonlySet<string>
): string[] => {
  try {
    const raw = localStorage.getItem(getQuickAccessStorageKey(userId));
    if (raw === null) {
      return DEFAULT_PINNED_MENU_IDS.filter((id) => allowedIds.has(id));
    }
    return sanitizePinnedMenuIds(JSON.parse(raw), allowedIds);
  } catch {
    return DEFAULT_PINNED_MENU_IDS.filter((id) => allowedIds.has(id));
  }
};

export const savePinnedMenuIds = (
  userId: string | undefined | null,
  ids: string[]
): void => {
  try {
    localStorage.setItem(getQuickAccessStorageKey(userId), JSON.stringify(ids));
  } catch {
    // ignore storage quota errors
  }
};

export const togglePinnedMenuId = (currentIds: string[], targetId: string): string[] => {
  if (currentIds.includes(targetId)) {
    return currentIds.filter((id) => id !== targetId);
  }
  return [...currentIds, targetId];
};

export const movePinnedMenuId = (
  currentIds: string[],
  targetId: string,
  direction: 'up' | 'down'
): string[] => {
  const idx = currentIds.indexOf(targetId);
  if (idx < 0) return currentIds;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= currentIds.length) return currentIds;
  const next = [...currentIds];
  [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  return next;
};
