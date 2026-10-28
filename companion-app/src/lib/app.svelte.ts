import { Character, freshState, type LiveState } from './character';
import type { SheetData } from './sheet';
import type { LogEntry } from './checks';
import { postToDiscord, isWebhookUrl } from './discord';
import { DEFAULT_SETTINGS, loadLive, loadLog, loadSettings, loadSheets, saveLive, saveLog, saveSettings, saveSheets, type Settings } from './storage';
import { preloadDice, showDice } from './dice3d';
import { portraitFromFile } from './portrait';
import { CACHE_PREFIX, cachedId, deletePortrait, isInline, loadPortraits, portraitId, portraitSrc, savePortrait } from './portraits';

export type View =
  | { name: 'list' }
  | { name: 'build' }
  | { name: 'sheet'; id: string; section?: string }
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
  settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  view = $state<View>({ name: 'list' });
  toast = $state('');
  loaded = $state(false);
  lastRoll = $state<LogEntry | null>(null);
  // Cached portrait pictures by id (see portraits.ts).
  portraits = $state<Record<string, string>>({});
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
    try {
      this.portraits = await loadPortraits();
    } catch (e) {
      console.warn('Portraits unavailable', e);
    }
    this.loaded = true;
    if (await this.cacheInlinePortraits(this.sheets)) await this.persist();
    if (this.settings.dice3d) preloadDice();
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
    await this.cacheInlinePortraits(list);
    for (const s of list) {
      this.live[s.id] ??= freshState();
      const i = this.sheets.findIndex((x) => x.id === s.id);
      if (i >= 0) this.sheets[i] = s;
      else this.sheets.unshift(s);
    }
    await this.persist();
    await this.prunePortraits();
  }

  async remove(id: string) {
    this.sheets = this.sheets.filter((s) => s.id !== id);
    delete this.live[id];
    await this.persist();
    await this.prunePortraits();
  }

  portraitSrc(p: string): string {
    return portraitSrc(p, this.portraits);
  }

  // A picture from the device goes into the cache; the sheet keeps a link to it.
  async setPortraitFile(sheet: SheetData, file: File) {
    sheet.portrait = await this.cachePortrait(await portraitFromFile(file));
    await this.persist();
    await this.prunePortraits();
  }

  // A web link (or '' to remove the portrait). Web pictures aren't cached.
  async setPortrait(sheet: SheetData, url: string) {
    sheet.portrait = url.trim();
    await this.persist();
    await this.prunePortraits();
  }

  // Returns the cache link, or the picture itself if this browser won't store it.
  private async cachePortrait(dataUrl: string): Promise<string> {
    const id = await portraitId(dataUrl);
    try {
      await savePortrait(id, dataUrl);
    } catch (e) {
      console.warn('Could not cache portrait', e);
      return dataUrl;
    }
    this.portraits[id] = dataUrl;
    return CACHE_PREFIX + id;
  }

  // Older and imported sheets carry their pictures inline; move them into the cache.
  private async cacheInlinePortraits(list: SheetData[]): Promise<boolean> {
    let changed = false;
    for (const s of list) {
      if (!isInline(s.portrait)) continue;
      const link = await this.cachePortrait(s.portrait);
      if (link !== s.portrait) {
        s.portrait = link;
        changed = true;
      }
    }
    return changed;
  }

  // Drops cached pictures no character uses any more.
  private async prunePortraits() {
    const used = new Set(this.sheets.map((s) => cachedId(s.portrait)));
    for (const id of Object.keys(this.portraits)) {
      if (used.has(id)) continue;
      delete this.portraits[id];
      await deletePortrait(id).catch((e) => console.warn('Could not delete portrait', e));
    }
  }

  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    await saveSettings(this.settings).catch((e) => console.warn("Could not save", e));
  }

  get canPost(): boolean {
    return isWebhookUrl(this.settings.webhookUrl);
  }

  // The result shows once the dice have landed, so the dice don't give it away.
  async record(entry: LogEntry) {
    if (this.settings.dice3d) {
      this.lastRoll = null;
      await showDice(entry);
    }
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
