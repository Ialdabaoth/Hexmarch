import { get, set } from 'idb-keyval';
import { readSheet, writeSheet, type SheetData } from './sheet';
import type { LiveState } from './character';
import type { LogEntry } from './checks';
import { DEFAULT_DICE_COLOR, DEFAULT_DICE_INK, prefersReducedMotion } from './dice3d';
import type { GameMap } from './maps';
import type { SavedModule } from './modules';
import type { Creature } from '../bestiary/creature';

export interface Settings {
  webhookUrl: string;
  autoPost: boolean;
  // The character shown on the home screen.
  activeId: string;
  // Rules picked last time in the character builder.
  rules: string;
  // Show rolls on tumbling 3D dice. Starts off for people who ask for less motion.
  dice3d: boolean;
  // Colours of the 3D dice and their numbers, as #rrggbb.
  diceColor: string;
  diceInk: string;
  // The campaign file's link, or '' for "This device".
  campaign: string;
  // Where the party stood before Companion 0.5.5. It now lives in the campaign state file
  // (lib/state.ts); a value left here is moved into This device's state on load and cleared.
  partyAt: PartyAt | null;
}

// Where the party stands on a module's E9 Atlas map: the module (its site and id) and the 100-ft
// hex (map "atlas", hex "world:CCRR:CCRR"). Parties placed before Companion 0.5.2 have map "world"
// or a League page key and a 3-mile hex "CCRR"; the Atlas moves them to the new grid (lib/atlas.ts).
export interface PartyAt {
  base: string;
  module: string;
  map: string;
  hex: string;
  // A short name for the hex, for showing without opening the map.
  label: string;
  // Travel time the Atlas has added up since the party was placed.
  hours?: number;
}

export const DEFAULT_SETTINGS: Settings = { webhookUrl: '', autoPost: false, activeId: '', rules: 'mm', dice3d: !prefersReducedMotion(), diceColor: DEFAULT_DICE_COLOR, diceInk: DEFAULT_DICE_INK, campaign: '', partyAt: null };

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

// Referee maps, kept on the device with their tokens.
export async function loadMaps(): Promise<GameMap[]> {
  return (await get<GameMap[]>('maps')) ?? [];
}

export async function saveMaps(maps: GameMap[]): Promise<void> {
  await set('maps', JSON.parse(JSON.stringify(maps)));
}

// Module repositories the referee has added, with each module's manifest as last fetched.
export async function loadModuleList(): Promise<SavedModule[]> {
  return (await get<SavedModule[]>('modules')) ?? [];
}

export async function saveModuleList(list: SavedModule[]): Promise<void> {
  await set('modules', JSON.parse(JSON.stringify(list)));
}

// The referee's creatures, one list per campaign ("" is This device).
export async function loadCreatures(campaign: string): Promise<Creature[]> {
  return (await get<Creature[]>(`creatures:${campaign}`)) ?? [];
}

export async function saveCreatures(campaign: string, list: Creature[]): Promise<void> {
  await set(`creatures:${campaign}`, JSON.parse(JSON.stringify(list)));
}

// The campaign state file (lib/state.ts), one per campaign ("" is This device), as last saved.
export async function loadStateFile(campaign: string): Promise<unknown> {
  return await get(`state:${campaign}`);
}

export async function saveStateFile(campaign: string, data: unknown): Promise<void> {
  await set(`state:${campaign}`, JSON.parse(JSON.stringify(data)));
}
