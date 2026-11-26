import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getQuickAccessStorageKey,
  movePinnedMenuId,
  sanitizePinnedMenuIds,
  togglePinnedMenuId,
} from '../src/utils/quickAccessMenu';

describe('Sidebar Quick Access Pinning (quickAccessMenu.ts)', () => {
  it('sanitizes pinned IDs against RBAC allowed set and deduplicates them', () => {
    const allowed = new Set(['dashboard', 'reports', 'tasks', 'hr']);
    assert.deepEqual(
      sanitizePinnedMenuIds(['dashboard', 'settings', 'tasks', 'dashboard', 'hr', 123], allowed),
      ['dashboard', 'tasks', 'hr']
    );
  });

  it('toggles pinned menu IDs cleanly without duplicates', () => {
    let pins = ['dashboard', 'reports'];
    pins = togglePinnedMenuId(pins, 'hr');
    assert.deepEqual(pins, ['dashboard', 'reports', 'hr']);
    pins = togglePinnedMenuId(pins, 'reports');
    assert.deepEqual(pins, ['dashboard', 'hr']);
  });

  it('reorders pinned menu items up and down safely at boundaries', () => {
    const start = ['dashboard', 'reports', 'tasks'];
    assert.deepEqual(movePinnedMenuId(start, 'dashboard', 'up'), start);
    assert.deepEqual(movePinnedMenuId(start, 'tasks', 'down'), start);
    assert.deepEqual(movePinnedMenuId(start, 'reports', 'up'), ['reports', 'dashboard', 'tasks']);
    assert.deepEqual(movePinnedMenuId(start, 'reports', 'down'), ['dashboard', 'tasks', 'reports']);
  });

  it('scopes storage keys per user ID', () => {
    assert.notEqual(getQuickAccessStorageKey('USR-01'), getQuickAccessStorageKey('USR-ADMIN'));
    assert.ok(getQuickAccessStorageKey('').endsWith('default'));
  });
});
