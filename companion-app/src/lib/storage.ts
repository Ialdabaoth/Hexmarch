import { get, set } from 'idb-keyval';
import { readSheet, writeSheet, type SheetData } from './sheet';
import type { LiveState } from './character';
import type { LogEntry } from './checks';
import { prefersReducedMotion } from './dice3d';

export interface Settings {
  webhookUrl: string;
  autoPost: boolean;
  // The character shown on the home screen.
  activeId: string;
  // Rules picked last time in the character builder.
  rules: string;
  // Show rolls on tumbling 3D dice. Starts off for people who ask for less motion.
  dice3d: boolean;
  // The campaign file's link, or '' for "This device".
  campaign: string;
}

export const DEFAULT_SETTINGS: Settings = { webhookUrl: '', autoPost: false, activeId: '', rules: 'mm', dice3d: !prefersReducedMotion(), campaign: '' };

// Saved sheets go through the same checks as imported files, so a sheet the
// app can't read is skipped instead of breaking the whole list. Skipped sheets
// (say, from a campaign whose files are gone) are kept as they were and saved back.
let unreadable: unknown[] = [];

export async function loadSheets(): Promise<SheetData[]> {
  const raw = (await get<unknown[]>('sheets')) ?? [];
  unreadable = [];
  return raw.flatMap((r) => {
    try {
      return [readSheet(r)];
    } catch (e) {
      console.warn('Skipping unreadable character sheet', e);
      unreadable.push(r);
      return [];
    }
  });
}

export function unreadableSheets(): unknown[] {
  return unreadable;
}

export async function saveSheets(list: SheetData[]): Promise<void> {
  // Svelte state proxies can't be cloned into IndexedDB, so store plain JSON.
  const ids = new Set(list.map((s) => s.id));
  const kept = unreadable.filter((r) => !ids.has((r as { id?: string })?.id ?? ''));
  await set('sheets', JSON.parse(JSON.stringify([...list.map(writeSheet), ...kept])));
}

// Current HP and temporary effects, by character id. Kept on the device only.
export async function loadLive(): Promise<Record<string, LiveState>> {
  return (await get<Record<string, LiveState>>('live')) ?? {};
}

export async function saveLive(live: Record<string, LiveState>): Promise<void> {
  await set('live', JSON.parse(JSON.stringify(live)));
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await get<Settings>('settings')) ?? {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await set('settings', { ...s });
}

export async function loadLog(): Promise<LogEntry[]> {
  return (await get<LogEntry[]>('log')) ?? [];
}

export async function saveLog(log: LogEntry[]): Promise<void> {
  await set('log', JSON.parse(JSON.stringify(log.slice(0, 200))));
}

// Ask the browser not to evict our data (Safari clears unused sites otherwise).
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
}
