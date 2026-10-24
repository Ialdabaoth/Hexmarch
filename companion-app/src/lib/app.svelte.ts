import { Character, freshState, type LiveState } from './character';
import type { SheetData } from './sheet';
import type { LogEntry } from './checks';
import { postToDiscord, isWebhookUrl } from './discord';
import { loadLive, loadLog, loadSettings, loadSheets, saveLive, saveLog, saveSettings, saveSheets, type Settings } from './storage';

export type View =
  | { name: 'list' }
  | { name: 'build' }
  | { name: 'sheet'; id: string }
  | { name: 'dice' }
  | { name: 'settings' }
  | { name: 'render'; id: string; mode: RenderMode };

export type RenderMode = 'postcard' | 'page';

class AppState {
  // Sheets are the permanent record and live holds current HP and effects.
  // Characters are recomputed from both on every change.
  sheets = $state<SheetData[]>([]);
  live = $state<Record<string, LiveState>>({});
  characters: Character[] = $derived(this.sheets.map((s) => new Character(s, this.live[s.id] ?? freshState())));
  log = $state<LogEntry[]>([]);
  settings = $state<Settings>({ webhookUrl: '', autoPost: false, activeId: '', rules: 'mm' });
  view = $state<View>({ name: 'list' });
  toast = $state('');
  loaded = $state(false);
  lastRoll = $state<LogEntry | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  async load() {
    try {
      [this.sheets, this.live, this.log, this.settings] = await Promise.all([loadSheets(), loadLive(), loadLog(), loadSettings()]);
    } catch (e) {
      // Private browsing or an embedded preview can block storage; run without saving.
      console.warn('Storage unavailable', e);
      this.notify("This browser won't let the app save. Export characters to keep them.");
    }
    for (const s of this.sheets) this.live[s.id] ??= freshState();
    this.loaded = true;
  }

  character(id: string): Character | undefined {
    return this.characters.find((c) => c.id === id);
  }

  async persist() {
    try {
      await Promise.all([saveSheets(this.sheets), saveLive(this.live)]);
    } catch (e) {
      console.warn('Could not save', e);
    }
  }

  async add(sheet: SheetData) {
    this.sheets.unshift(sheet);
    this.live[sheet.id] = freshState();
    await this.persist();
  }

  // Imported sheets replace any sheet with the same id.
  async upsert(list: SheetData[]) {
    for (const s of list) {
      this.live[s.id] ??= freshState();
      const i = this.sheets.findIndex((x) => x.id === s.id);
      if (i >= 0) this.sheets[i] = s;
      else this.sheets.unshift(s);
    }
    await this.persist();
  }

  async remove(id: string) {
    this.sheets = this.sheets.filter((s) => s.id !== id);
    delete this.live[id];
    await this.persist();
  }

  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    await saveSettings(this.settings).catch((e) => console.warn("Could not save", e));
  }

  get canPost(): boolean {
    return isWebhookUrl(this.settings.webhookUrl);
  }

  async record(entry: LogEntry) {
    this.lastRoll = entry;
    this.log.unshift(entry);
    await saveLog(this.log).catch((e) => console.warn("Could not save", e));
    if (this.settings.autoPost && this.canPost) await this.post(entry);
  }

  async post(entry: LogEntry) {
    try {
      await postToDiscord(this.settings.webhookUrl, entry);
      this.notify('Posted to Discord');
    } catch (e) {
      this.notify(`Couldn't post to Discord: ${(e as Error).message}`);
    }
  }

  async clearLog() {
    this.log = [];
    await saveLog(this.log).catch((e) => console.warn("Could not save", e));
  }

  notify(message: string) {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3000);
  }
}

export const app = new AppState();
