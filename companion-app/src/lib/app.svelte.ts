import { Character, freshState, type LiveState } from './character';
import { importFile, mergeKnowledge, type KnowledgeEntry, type SheetData } from './sheet';
import type { LogEntry } from './checks';
import { postToDiscord, isWebhookUrl } from './discord';
import {
  DEFAULT_SETTINGS, loadLive, loadLog, loadModuleList, loadSettings, loadSheets, saveLive, saveLog, saveModuleList, saveSettings, saveSheets,
  unreadableSheets, loadStateFile, saveStateFile, type PartyAt, type Settings
} from './storage';
import {
  StateError, blankState, closeSession, moveParty, openSession, passTime, readState, setStart, withCharacters, withRules, writeState, type CampaignState, type StateRules
} from './state';
import { loadRepo, type SavedModule } from './modules';
import {
  absorbCustom, activateCampaign, blankLocal, campaignRulesId, isScribeLink, openCampaignLink, loadCampaigns, loadFallbacks, loadLocal, registerCampaign, saveCampaigns,
  saveLocal, type CampaignCache
} from './campaign';
import { CORE_RULES } from '../rules/core-modules';
import { addInvitation, bindCharacter, invitationLabel, loadInvitations, readInvite, saveInvitations, withRefereeInvitations, type Invite, type Mode, type Invitation } from './invitations';
import { hasEquipment, registerEquipment, type EquipmentFileData } from '../equipment/equipment';
import { preloadDice, showDice } from './dice3d';
import { portraitFromFile } from './portrait';
import { artUrl, makeArt, missingFrom, readArt, type ArtFile } from './art';
import { CACHE_PREFIX, cachedId, deletePortrait, isInline, loadPortraits, portraitId, portraitSrc, savePortrait } from './portraits';

export type View =
  | { name: 'list' }
  | { name: 'build' }
  | { name: 'sheet'; id: string; section?: string }
  | { name: 'campaign' }
  | { name: 'rules' }
  | { name: 'inbox' }
  | { name: 'settings' }
  | { name: 'equipment' }
  | { name: 'render'; id: string; mode: RenderMode };

export type RenderMode = 'postcard' | 'page';

class AppState {
  // Sheets are the permanent record and live holds current HP and effects.
  // Characters are recomputed from both on every change.
  sheets = $state<SheetData[]>([]);
  live = $state<Record<string, LiveState>>({});
  characters: Character[] = $derived(this.sheets.map((s) => new Character(s, this.live[s.id] ?? freshState())));
  // Where this device sits in each campaign it knows: one seat per invitation (lib/invitations.ts).
  invitations = $state<Invitation[]>([]);
  // The characters on the home screen. Referee mode: everyone but the referee's full-sheet NPCs. Player mode:
  // your own character only (its followers are on its card).
  party: Character[] = $derived(
    this.mode === 'player' ? this.characters.filter((c) => c.id === this.invitation?.character) : this.characters.filter((c) => c.data.owner !== 'referee')
  );
  log = $state<LogEntry[]>([]);
  settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  view = $state<View>({ name: 'list' });
  toast = $state('');
  loaded = $state(false);
  lastRoll = $state<LogEntry | null>(null);
  // How many 3D dice the last roll threw; the result keeps a slot for each to rest in.
  rolledDice = $state(0);
  // Cached portrait pictures by id (see portraits.ts).
  portraits = $state<Record<string, string>>({});
  // Campaigns this device has opened, by link, and its own custom equipment file.
  campaigns = $state<Record<string, CampaignCache>>({});
  local = $state<EquipmentFileData>(blankLocal());
  // Module repositories added on this device (maps and adventures, mm-module/1).
  modules = $state<SavedModule[]>([]);
  // Saved characters the app can't read (kept, not shown).
  unreadable = $state(0);
  // The active campaign's state file: party, clock, reveals, session, characters (lib/state.ts).
  state = $state<CampaignState>(blankState(''));
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  get campaign(): CampaignCache | null {
    return this.campaigns[this.settings.campaign] ?? null;
  }

  // The seat in use; null for "This device", which is the referee's own table.
  get invitation(): Invitation | null {
    return (this.campaign && this.invitations.find((s) => s.id === this.settings.invitation && s.url === this.settings.campaign)) || null;
  }

  // Player mode or referee mode, set by the seat picked in the campaign switcher (Heph 2026-11-09).
  get mode(): Mode {
    return this.invitation?.role === 'player' ? 'player' : 'referee';
  }

  // The window's title (Heph 2026-11-09): the invitation in use as the switcher names it, or "My Characters"
  // outside a campaign. The installed app shows it after its own name: "⬢ Companion - Kells 1422 · Playing Holly".
  get title(): string {
    const inv = this.invitation, c = this.campaign;
    if (!inv || !c) return c ? c.campaign.name : 'My Characters';
    return invitationLabel(inv, c.campaign.name, inv.character ? this.character(inv.character)?.name : undefined);
  }

  // Player mode: the character this seat plays, once picked.
  get me(): Character | undefined {
    const id = this.mode === 'player' ? this.invitation?.character : undefined;
    return id ? this.character(id) : undefined;
  }

  // The active campaign's id; '' for "This device".
  // Inbox items not yet opened: invitations, players' updates, sent-back notes.
  // Shared campaigns (sign-in) fill the inbox; until then nothing arrives.
  get unread(): number {
    return 0;
  }

  get campaignId(): string {
    return this.campaign?.campaign.id ?? '';
  }

  async load() {
    try {
      // Equipment and campaign rulesets first: sheets are read against them.
      this.settings = await loadSettings();
      await this.loadEquipment();
      [this.sheets, this.live, this.log] = await Promise.all([loadSheets(), loadLive(), loadLog()]);
      this.unreadable = unreadableSheets().length;
    } catch (e) {
      // Private browsing or an embedded preview can block storage; run without saving.
      console.warn('Storage unavailable', e);
      this.notify("This browser won't let the app save. Export characters to keep them.");
    }
    for (const s of this.sheets) this.live[s.id] ??= freshState();
    try {
      this.modules = await loadModuleList();
    } catch (e) {
      console.warn('Modules unavailable', e);
    }
    try {
      this.portraits = await loadPortraits();
    } catch (e) {
      console.warn('Portraits unavailable', e);
    }
    await this.loadState();
    this.loaded = true;
    // The E9 Atlas in another tab of this site saves party moves into the same file (Atlas 0.5.11): read it again on coming back.
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.refreshState(); });
    if (await this.cacheInlinePortraits(this.sheets)) await this.persist();
    if (this.settings.dice3d) preloadDice();
    await this.openAsked();
    void this.refreshCampaign();
  }

  private async loadEquipment() {
    try {
      this.local = await loadLocal();
      registerEquipment($state.snapshot(this.local));
    } catch (e) {
      console.warn('Custom equipment unavailable', e);
    }
    this.campaigns = await loadCampaigns();
    for (const c of Object.values(this.campaigns)) {
      try {
        registerCampaign(c);
      } catch (e) {
        console.warn(`Campaign ${c.url} unreadable`, e);
      }
    }
    // Stand-ins for other campaigns' entries that came with imported characters.
    for (const f of Object.values(await loadFallbacks())) {
      if (!hasEquipment(f.id)) {
        try {
          registerEquipment(f);
        } catch (e) {
          console.warn(e);
        }
      }
    }
    // Campaigns opened before invitations existed were opened as their referee.
    try {
      const loaded = await loadInvitations();
      this.invitations = withRefereeInvitations(loaded, Object.keys(this.campaigns));
      if (this.invitations.length !== loaded.length) await saveInvitations(this.invitations);
    } catch (e) {
      console.warn('Invitations unavailable', e);
    }
    if (this.settings.campaign && !this.invitation) {
      const s = this.invitations.find((x) => x.url === this.settings.campaign && x.role === 'referee') ?? this.invitations.find((x) => x.url === this.settings.campaign);
      if (s) this.settings = { ...this.settings, invitation: s.id };
    }
    activateCampaign(this.campaign);
  }

  // The state file of the campaign now in use. A party placed before 0.5.5 was kept in the
  // settings, for every campaign at once; it moves into This device's state.
  private async loadState() {
    const id = this.campaignId;
    let s = blankState(id);
    try {
      const saved = await loadStateFile(id);
      if (saved) s = readState(saved, id);
    } catch (e) {
      console.warn('Campaign state unreadable; starting a fresh one', e);
    }
    this.state = s;
    await this.saveState(withRules(s, this.stateRules()));
    if (this.settings.partyAt) {
      const old = this.settings.partyAt;
      if (!id && !s.party) await this.saveState(moveParty(s, old));
      await this.updateSettings({ partyAt: null });
    }
  }

  // Takes the saved state file when it is newer than the one in memory (another tab, such as the Atlas, changed it).
  async refreshState() {
    const id = this.campaignId;
    try {
      const saved = await loadStateFile(id);
      if (!saved) return;
      const s = readState(saved, id);
      if (s.revision > this.state.revision) this.state = s;
    } catch (e) {
      console.warn('Campaign state unreadable', e);
    }
    // The Atlas on its own (Atlas 0.5.17) writes what the party saw into the sheets on this device: take that knowledge.
    try {
      for (const f of await loadSheets()) {
        const s = this.sheets.find((x) => x.id === f.id);
        if (s && JSON.stringify(f.knowledge) !== JSON.stringify(s.knowledge)) s.knowledge = f.knowledge;
      }
    } catch (e) {
      console.warn('Character sheets unreadable', e);
    }
  }

  // Knowledge from the Atlas (party travel, the referee's fog brush): added to each named character's sheet.
  async addKnowledge(ids: string[], add: unknown[], remove: string[]) {
    let changed = false;
    for (const s of this.sheets) {
      if (!ids.includes(s.id)) continue;
      s.knowledge = mergeKnowledge($state.snapshot(s.knowledge) as KnowledgeEntry[], add as KnowledgeEntry[], remove);
      changed = true;
    }
    if (changed) await this.persist();
  }

  // The rules this campaign plays with: the campaign file's ruleset, or the builder's for This device.
  stateRules(): StateRules {
    const ruleset = this.campaign ? campaignRulesId(this.campaign) : this.settings.rules;
    const core = CORE_RULES[ruleset];
    return core ? { ruleset, module: core.module, option: core.option, version: core.version } : { ruleset, module: '', option: '', version: '' };
  }

  private async saveState(next: CampaignState) {
    if (next === this.state) return;
    this.state = next;
    await saveStateFile(next.campaign, writeState(next)).catch((e) => console.warn('Could not save the campaign state', e));
  }

  async setParty(party: PartyAt | null) {
    await this.saveState(moveParty($state.snapshot(this.state) as CampaignState, party));
  }

  async passTime(hours: number) {
    await this.saveState(passTime($state.snapshot(this.state) as CampaignState, hours));
  }

  async setStartDate(start: string) {
    await this.saveState(setStart($state.snapshot(this.state) as CampaignState, start));
  }

  async openSession() {
    await this.saveState(openSession($state.snapshot(this.state) as CampaignState));
  }

  async closeSession() {
    await this.saveState(closeSession($state.snapshot(this.state) as CampaignState));
  }

  // The state file as it would be shared: the party list brought up to date first.
  async exportState(): Promise<CampaignState> {
    const s = withRules($state.snapshot(this.state) as CampaignState, this.stateRules());
    await this.saveState(withCharacters(s, this.party.map((c) => ({ id: c.id, name: c.name }))));
    return writeState($state.snapshot(this.state) as CampaignState);
  }

  // Replaces this campaign's state with a file (say, one the referee shared). Throws with a message.
  async importState(data: unknown) {
    const s = readState(data, this.campaignId);
    if (s.revision < this.state.revision && !confirm(`That file is older than this device's copy (change ${s.revision}, this device has ${this.state.revision}). Use it anyway?`)) {
      throw new StateError('Kept the state on this device');
    }
    this.state = s;
    await saveStateFile(s.campaign, writeState(s));
  }

  // Views read catalogs through characters, so new characters make them redraw.
  private equipmentChanged() {
    this.sheets = [...this.sheets];
  }

  async saveModules(list: SavedModule[]) {
    this.modules = list;
    await saveModuleList($state.snapshot(list));
  }

  // Adds every module a repository publishes. Re-adding a repository replaces its
  // modules, so updates arrive with a fresh fetch. Throws with a message for the reader.
  async addModuleRepo(address: string): Promise<SavedModule[]> {
    const { modules } = await loadRepo(address);
    await this.saveModules([...this.modules.filter((m) => !modules.some((n) => n.base === m.base)), ...modules]);
    return modules;
  }

  // Opens a campaign by an invitation (its link, as referee unless it says player) and takes that seat. Throws
  // with a message for the player.
  async useCampaign(url: string, role: Invite['role'] = 'referee', character?: string) {
    const c = await openCampaignLink(url.trim());
    const seat = await this.takeInvitation({ url: c.url, role, ...(character ? { character } : {}) });
    await this.adoptCampaign(c, seat.id);
    if (seat.role === 'player' && seat.character) await this.claim(seat.character);
    this.notify(`${role === 'player' ? 'Playing in' : 'Running'} ${c.campaign.name}`);
  }

  private async takeInvitation(i: Invite): Promise<Invitation> {
    const { invitations, invitation: seat } = addInvitation($state.snapshot(this.invitations) as Invitation[], i);
    if (invitations !== this.invitations) {
      this.invitations = invitations;
      await saveInvitations(invitations);
    }
    return seat;
  }

  // Switches to a seat taken before (the campaign switcher), fetching its campaign again when possible.
  async chooseInvitation(id: string) {
    const seat = this.invitations.find((s) => s.id === id);
    if (!seat) return this.leaveCampaign();
    try {
      await this.adoptCampaign(await openCampaignLink(seat.url), seat.id);
    } catch (e) {
      const c = this.campaigns[seat.url];
      if (!c) throw e;
      await this.updateSettings({ campaign: seat.url, invitation: seat.id });
      activateCampaign(c);
      this.equipmentChanged();
      this.notify(`Using the saved copy of ${c.campaign.name}`);
    }
  }

  // Fetches the campaign in use again (Settings › Check for changes), keeping the seat.
  async checkCampaign() {
    if (!this.campaign) return;
    await this.adoptCampaign(await openCampaignLink(this.settings.campaign), this.settings.invitation);
    this.notify(`${this.campaign.campaign.name} is up to date`);
  }

  async leaveCampaign() {
    await this.updateSettings({ campaign: '', invitation: '' });
    activateCampaign(null);
    this.equipmentChanged();
  }

  // Player mode: the character this seat plays (picked on the home screen, or the first one made there).
  async playAs(id: string) {
    const seat = this.invitation;
    if (!seat || seat.role !== 'player') return;
    this.invitations = bindCharacter($state.snapshot(this.invitations) as Invitation[], seat.id, id);
    await saveInvitations(this.invitations);
    await this.updateSettings({ activeId: id });
    await this.claim(id);
  }

  // A character played in a campaign belongs to it (its sheet's campaign), so it reads that campaign's equipment.
  private async claim(id: string) {
    const s = this.sheets.find((x) => x.id === id);
    if (!s || (s.campaign ?? '') === this.campaignId) return;
    s.campaign = this.campaignId || undefined;
    await this.persist();
  }

  // Drops one seat; the campaign goes too once no seat uses it.
  async forgetInvitation(id: string) {
    const seat = this.invitations.find((s) => s.id === id);
    if (!seat) return;
    if (this.settings.invitation === id) await this.leaveCampaign();
    this.invitations = this.invitations.filter((s) => s.id !== id);
    await saveInvitations(this.invitations);
    if (!this.invitations.some((s) => s.url === seat.url)) await this.forgetCampaign(seat.url);
  }

  async forgetCampaign(url: string) {
    if (this.settings.campaign === url) await this.leaveCampaign();
    const { [url]: _, ...rest } = this.campaigns;
    this.campaigns = rest;
    await saveCampaigns(this.campaigns);
  }

  // Referee mode: every character in the party has met (or heard of) a creature, as a knowledge entry on each sheet.
  async partyKnows(creature: string, name: string, rumour: boolean) {
    const entry = { creature, name, ...(this.state.session.number ? { session: this.state.session.number } : {}), ...(rumour ? { rumour: true } : {}) };
    await this.addKnowledge(this.party.map((c) => c.id), [entry], []);
    this.notify(`${rumour ? 'The party has heard of' : 'The party has met'} ${name}`);
  }

  private async adoptCampaign(c: CampaignCache, seat: string) {
    registerCampaign(c);
    this.campaigns = { ...this.campaigns, [c.url]: c };
    await saveCampaigns(this.campaigns);
    await this.updateSettings({ campaign: c.url, invitation: seat });
    activateCampaign(c);
    await this.rereadSheets();
    this.equipmentChanged();
    void this.syncArt().catch((e) => console.warn('Campaign art not read', e));
    // a campaign made in Scribe brings its modules' site, for Campaign › Maps and Modules
    const site = c.scribe?.site;
    if (site && !this.modules.some((m) => m.base === site)) void this.addModuleRepo(site).catch((e) => console.warn('Campaign modules not read', e));
  }

  // A link may be an invitation: the campaign to open, and the seat (E9 Scribe's "Open in the Companion":
  // ?campaign=scribe:<id>; a player's: ?campaign=<link>&as=player&character=<id>). The address is cleared
  // afterwards, so reloading doesn't switch campaigns again.
  private async openAsked() {
    if (typeof location === 'undefined') return;
    const invite = readInvite(location.search);
    const q = new URLSearchParams(location.search);
    if (!q.has('campaign')) return;
    for (const k of ['campaign', 'as', 'character']) q.delete(k);
    history.replaceState(history.state, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    if (!invite) return;
    try {
      const here = this.invitation;
      const same = here && here.url === invite.url && here.role === invite.role && (invite.role === 'referee' || !invite.character || here.character === invite.character);
      if (!same || !this.campaign) await this.useCampaign(invite.url, invite.role, invite.character);
    } catch (e) {
      this.notify((e as Error).message);
    }
  }

  // The referee may have changed the campaign's files; pick that up quietly.
  private async refreshCampaign() {
    const url = this.settings.campaign;
    if (!url || (!navigator.onLine && !isScribeLink(url))) return;
    try {
      const c = await openCampaignLink(url);
      if (this.settings.campaign === url) await this.adoptCampaign(c, this.settings.invitation);
    } catch (e) {
      console.warn('Campaign not refreshed', e);
    }
  }

  // Characters that couldn't be read may be readable once a campaign's ruleset is known.
  private async rereadSheets() {
    if (!this.unreadable) return;
    const sheets = await loadSheets();
    this.unreadable = unreadableSheets().length;
    for (const s of sheets) {
      if (this.sheets.some((x) => x.id === s.id)) continue;
      this.sheets.push(s);
      this.live[s.id] ??= freshState();
    }
  }

  async saveLocal(file: EquipmentFileData) {
    const plain = JSON.parse(JSON.stringify(file)) as EquipmentFileData;
    registerEquipment(plain);
    this.local = plain;
    await saveLocal(plain);
    this.equipmentChanged();
  }

  // A file of characters: their custom entries first, so the sheets can use them.
  async importCharacters(data: unknown): Promise<SheetData[]> {
    const local = await absorbCustom(data, JSON.parse(JSON.stringify(this.local)));
    if (local) await this.saveLocal(local);
    const imported = importFile(data, (id) => this.sheets.find((s) => s.id === id));
    await this.upsert(imported);
    return imported;
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
    // A player seat with no character yet plays the first one made in it.
    if (this.mode === 'player' && !this.invitation?.character && sheet.owner !== 'referee') await this.playAs(sheet.id);
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
    if (this.missingArt.length) void this.syncArt().catch((e) => console.warn('Campaign art not read', e));
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

  // Cached picture ids characters use, and those this device doesn't have
  // (as after importing a character made on another device).
  get usedArt(): string[] {
    return [...new Set(this.sheets.map((s) => cachedId(s.portrait)).filter((id): id is string => !!id))];
  }

  get missingArt(): string[] {
    return this.usedArt.filter((id) => !this.portraits[id]);
  }

  // The art file for this device's characters, to save or put in the campaign's repository.
  artFile(): ArtFile {
    return makeArt(Object.fromEntries(this.usedArt.filter((id) => this.portraits[id]).map((id) => [id, this.portraits[id]])));
  }

  // Fills in missing portraits from an art file. Returns how many arrived.
  async addArt(data: unknown): Promise<number> {
    const found = missingFrom(readArt(data), this.missingArt, this.portraits);
    for (const [id, pic] of Object.entries(found)) {
      await savePortrait(id, pic).catch((e) => console.warn('Could not cache portrait', e));
      this.portraits[id] = pic;
    }
    return Object.keys(found).length;
  }

  // Fills in missing portraits from the campaign's art file in its repository.
  // Quietly does nothing when there's no campaign or it has no art file yet.
  async syncArt(): Promise<number> {
    const c = this.campaign;
    if (!c || isScribeLink(c.url) || !this.missingArt.length) return 0;  // a campaign from Scribe has no art file yet
    const res = await fetch(artUrl(c.url, c.campaign.art), { cache: 'no-cache' });
    if (!res.ok) return 0;
    return this.addArt(await res.json());
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
    const was = this.campaignId;
    this.settings = { ...this.settings, ...patch };
    await saveSettings(this.settings).catch((e) => console.warn("Could not save", e));
    if (this.loaded && this.campaignId !== was) await this.loadState();
  }

  get diceColors() {
    return { body: this.settings.diceColor, ink: this.settings.diceInk };
  }

  get canPost(): boolean {
    return isWebhookUrl(this.settings.webhookUrl);
  }

  // The result shows once the dice have landed, so the dice don't give it away.
  async record(entry: LogEntry) {
    this.rolledDice = 0;
    if (this.settings.dice3d) {
      this.lastRoll = null;
      this.rolledDice = await showDice(entry, this.diceColors);
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
