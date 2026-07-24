/** OS-aware keybindings with per-platform remaps in localStorage. */

import { storageGet, storageSet } from './storage';

export type PlatformId = 'mac' | 'windows' | 'linux';

export type KeyActionId =
  | 'deleteSelected'
  | 'deselect'
  | 'bringForward'
  | 'pushBackward'
  | 'bringToFront'
  | 'sendToBack'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeUp'
  | 'nudgeDown'
  | 'nudgeLeftLarge'
  | 'nudgeRightLarge'
  | 'nudgeUpLarge'
  | 'nudgeDownLarge'
  | 'duplicate'
  | 'undo'
  | 'download'
  | 'openShortcuts'
  | 'selectAll'
  | 'copy'
  | 'paste';

/** Action id → list of chord strings (e.g. "mod+s", "backspace"). */
export type BindingMap = Record<KeyActionId, string[]>;

export type PlatformBindingsStore = Partial<Record<PlatformId, BindingMap>>;

export const STORAGE_KEY = 'pixelMockup.keybindings.v1';
const LEGACY_STORAGE_KEY = 'mockupStudio.keybindings.v1';

export const ACTION_LABELS: Record<KeyActionId, string> = {
  deleteSelected: 'Delete selected',
  deselect: 'Deselect',
  bringForward: 'Bring forward',
  pushBackward: 'Push backward',
  bringToFront: 'Bring to front',
  sendToBack: 'Send to back',
  nudgeLeft: 'Nudge left',
  nudgeRight: 'Nudge right',
  nudgeUp: 'Nudge up',
  nudgeDown: 'Nudge down',
  nudgeLeftLarge: 'Nudge left (10px)',
  nudgeRightLarge: 'Nudge right (10px)',
  nudgeUpLarge: 'Nudge up (10px)',
  nudgeDownLarge: 'Nudge down (10px)',
  duplicate: 'Duplicate selected',
  undo: 'Undo',
  download: 'Download mockup',
  openShortcuts: 'Open shortcuts settings',
  selectAll: 'Select all',
  copy: 'Copy',
  paste: 'Paste',
};

/** Display order in the settings panel. */
export const ACTION_ORDER: KeyActionId[] = [
  'selectAll',
  'copy',
  'paste',
  'deleteSelected',
  'deselect',
  'duplicate',
  'bringForward',
  'pushBackward',
  'bringToFront',
  'sendToBack',
  'nudgeLeft',
  'nudgeRight',
  'nudgeUp',
  'nudgeDown',
  'nudgeLeftLarge',
  'nudgeRightLarge',
  'nudgeUpLarge',
  'nudgeDownLarge',
  'undo',
  'download',
  'openShortcuts',
];

const SHARED_DEFAULTS: BindingMap = {
  deleteSelected: ['delete', 'backspace'],
  deselect: ['escape'],
  bringForward: [']'],
  pushBackward: ['['],
  bringToFront: ['mod+]'],
  sendToBack: ['mod+['],
  nudgeLeft: ['arrowleft'],
  nudgeRight: ['arrowright'],
  nudgeUp: ['arrowup'],
  nudgeDown: ['arrowdown'],
  nudgeLeftLarge: ['shift+arrowleft'],
  nudgeRightLarge: ['shift+arrowright'],
  nudgeUpLarge: ['shift+arrowup'],
  nudgeDownLarge: ['shift+arrowdown'],
  duplicate: ['mod+d'],
  undo: ['mod+z'],
  download: ['mod+shift+s'],
  openShortcuts: ['mod+/', 'shift+/', '?'],
  selectAll: ['mod+a'],
  copy: ['mod+c'],
  paste: ['mod+v'],
};

export function detectPlatform(): PlatformId {
  if (typeof navigator === 'undefined') return 'linux';
  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string };
    }
  ).userAgentData;
  const p = (uaData?.platform || navigator.platform || '').toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (p.includes('mac') || ua.includes('mac os')) return 'mac';
  if (p.includes('win') || ua.includes('windows')) return 'windows';
  return 'linux';
}

export function platformDisplayName(platform: PlatformId): string {
  if (platform === 'mac') return 'macOS';
  if (platform === 'windows') return 'Windows';
  return 'Linux';
}

export function isMacPlatform(platform: PlatformId = detectPlatform()): boolean {
  return platform === 'mac';
}

export function defaultBindingsFor(_platform: PlatformId): BindingMap {
  // Mod is abstracted; same chord strings on every OS.
  return structuredClone(SHARED_DEFAULTS);
}

function cloneBindings(map: BindingMap): BindingMap {
  const out = {} as BindingMap;
  for (const id of ACTION_ORDER) {
    out[id] = [...(map[id] ?? [])];
  }
  return out;
}

export function loadStore(): PlatformBindingsStore {
  try {
    const raw = storageGet(STORAGE_KEY, LEGACY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PlatformBindingsStore;
  } catch {
    return {};
  }
}

export function saveStore(store: PlatformBindingsStore): void {
  storageSet(STORAGE_KEY, JSON.stringify(store));
}

export function loadBindingsForPlatform(platform: PlatformId): BindingMap {
  const store = loadStore();
  const saved = store[platform];
  if (!saved) return defaultBindingsFor(platform);
  // Merge with defaults so new actions appear after updates
  const defaults = defaultBindingsFor(platform);
  const merged = cloneBindings(defaults);
  for (const id of ACTION_ORDER) {
    if (Array.isArray(saved[id])) merged[id] = [...saved[id]];
  }
  return merged;
}

export function saveBindingsForPlatform(
  platform: PlatformId,
  bindings: BindingMap,
): void {
  const store = loadStore();
  store[platform] = cloneBindings(bindings);
  saveStore(store);
}

export function resetBindingsForPlatform(platform: PlatformId): BindingMap {
  const defaults = defaultBindingsFor(platform);
  saveBindingsForPlatform(platform, defaults);
  return defaults;
}

/** Normalize a KeyboardEvent into a chord string like "mod+shift+s". */
export function eventToChord(
  e: KeyboardEvent,
  platform: PlatformId = detectPlatform(),
): string {
  const parts: string[] = [];
  const mac = isMacPlatform(platform);
  const modPressed = mac ? e.metaKey : e.ctrlKey;

  // On Mac, ignore ctrl for "mod"; on Win/Linux ignore meta for "mod"
  if (modPressed) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  // If the other modifier is held (ctrl on mac / meta on win), include it explicitly
  if (mac && e.ctrlKey) parts.push('ctrl');
  if (!mac && e.metaKey) parts.push('meta');

  const key = normalizeKey(e.key);
  if (key && key !== 'shift' && key !== 'control' && key !== 'meta' && key !== 'alt') {
    parts.push(key);
  }

  return parts.join('+');
}

function normalizeKey(key: string): string {
  const k = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  if (k === ' ') return 'space';
  if (k === 'esc') return 'escape';
  if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') {
    return k;
  }
  if (k === 'backspace' || k === 'delete' || k === 'escape' || k === 'enter' || k === 'tab') {
    return k;
  }
  // Bracket keys
  if (key === ']' || key === '[') return key;
  if (key === '/') return '/';
  if (key === '?') return '?';
  // Letter/digit
  if (/^[a-z0-9]$/i.test(key)) return key.toLowerCase();
  return k;
}

/** Format chord for UI (⌘S vs Ctrl+S). */
export function formatChordForDisplay(
  chord: string,
  platform: PlatformId = detectPlatform(),
): string {
  const mac = isMacPlatform(platform);
  const parts = chord.split('+').filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p === 'mod') out.push(mac ? '⌘' : 'Ctrl');
    else if (p === 'shift') out.push(mac ? '⇧' : 'Shift');
    else if (p === 'alt') out.push(mac ? '⌥' : 'Alt');
    else if (p === 'ctrl') out.push('Ctrl');
    else if (p === 'meta') out.push('⌘');
    else if (p === 'arrowleft') out.push('←');
    else if (p === 'arrowright') out.push('→');
    else if (p === 'arrowup') out.push('↑');
    else if (p === 'arrowdown') out.push('↓');
    else if (p === 'escape') out.push('Esc');
    else if (p === 'backspace') out.push(mac ? '⌫' : 'Backspace');
    else if (p === 'delete') out.push(mac ? '⌦' : 'Delete');
    else if (p === ' ') out.push('Space');
    else out.push(p.length === 1 ? p.toUpperCase() : p);
  }
  return mac ? out.join('') : out.join('+');
}

export function formatBindingsForDisplay(
  chords: string[],
  platform: PlatformId = detectPlatform(),
): string {
  return chords.map((c) => formatChordForDisplay(c, platform)).join(' / ');
}

export function findActionForEvent(
  e: KeyboardEvent,
  bindings: BindingMap,
  platform: PlatformId = detectPlatform(),
): KeyActionId | null {
  const chord = eventToChord(e, platform);
  if (!chord) return null;

  for (const id of ACTION_ORDER) {
    const list = bindings[id] ?? [];
    if (list.includes(chord)) return id;
  }
  return null;
}

/** Assign chord to action; steals from any other action on this map. */
export function assignChord(
  bindings: BindingMap,
  actionId: KeyActionId,
  chord: string,
): BindingMap {
  const next = cloneBindings(bindings);
  for (const id of ACTION_ORDER) {
    next[id] = (next[id] ?? []).filter((c) => c !== chord);
  }
  if (!next[actionId].includes(chord)) {
    next[actionId] = [...next[actionId], chord];
  }
  return next;
}

export function clearChords(bindings: BindingMap, actionId: KeyActionId): BindingMap {
  const next = cloneBindings(bindings);
  next[actionId] = [];
  return next;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
