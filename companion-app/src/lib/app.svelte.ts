import { Character, freshState, type LiveState } from './character';
import { importFile, mergeKnowledge, readKnowledge, type KnowledgeEntry, type SheetData } from './sheet';
import type { LogEntry } from './checks';
import { postToDiscord, isWebhookUrl } from './discord';
import {
  DEFAULT_SETTINGS, loadLive, loadLog, loadModuleList, loadSettings, loadSheets, saveLive, saveLog, saveModuleList, saveSettings, saveSheets,
  unreadableSheets, loadStateFile, saveStateFile, type PartyAt, type Settings
} from './storage';
import {
  StateError, addParty, blankState, closeSession, inParty, moveParty, openSession, partyOf, passTime, readParty, readState, setActive, setStart, withCharacters, withPlayer, withRules, writeState,
  type CampaignState, type StateParty, type StateRules
} from './state';
import { loadRepo, type SavedModule } from './modules';
import {
  NewerAppError, absorbCustom, activateCampaign, blankLocal, campaignRulesId, exportSheet, isScribeLink, openCampaignLink, loadCampaigns, loadFallbacks, loadLocal, registerCampaign, saveCampaigns,
  saveLocal, type CampaignCache
} from './campaign';
import { CORE_RULES } from '../rules/core-modules';
import { addMail, answer, joinRequest, loadMail, mailFileName, post, readMailFile, saveMail, sendBack, type MailItem } from './mail';
import { downloadJson } from './storage';
import { inviteDone, keepInvite, pendingInvite, updateForInvite } from './update';
import { readShared, withoutShared } from './share';
import { publishParts } from '../../../engine/publish';
import { envelope as mailEnvelope, messageLink, readMessageHash, type Envelope } from '../../../engine/mail';
import { readState as readStateFile } from './state';
import { get as idbGet, set as idbSet } from 'idb-keyval';
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
  // invite: the party whose invitation to show (the Atlas's party builder hands the referee here, one invite at a time)
  | { name: 'settings'; invite?: string }
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
  // The active campaign's state file: parties (each with its clock, session and place), common knowledge,
  // who is in which party (lib/state.ts).
  state = $state<CampaignState>(blankState(''));
  // Everyone playing in the campaign on this device. Referee mode: everyone but the referee's full-sheet NPCs.
  // Player mode: your own character only (its followers are on its card).
  roster: Character[] = $derived(
    this.mode === 'player' ? this.characters.filter((c) => c.id === this.invitation?.character) : this.characters.filter((c) => c.data.owner !== 'referee')
  );
  // The characters on the home screen: the roster in the party in use (Heph 2026-11-10: a campaign has parties).
  // A character the state file doesn't place in a party yet shows in every party until it joins one.
  party: Character[] = $derived(
    this.mode === 'player' || !this.state.parties.length
      ? this.roster
      : this.roster.filter((c) => {
          const e = this.state.characters.find((x) => x.id === c.id);
          return !e || e.party === null || e.party === this.partyId;
        })
  );
  log = $state<LogEntry[]>([]);
  // Requests sent and received on this device, every campaign (lib/mail.ts).
  mail = $state<MailItem[]>([]);
  // Whether this device holds Scribe's record of the campaign in use, so Scribe can publish it.
  canUpdate = $state(false);
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
  // Module repositories added on this device (maps and adventures, hexmarch-module/1).
  modules = $state<SavedModule[]>([]);
  // Saved characters the app can't read (kept, not shown).
  unreadable = $state(0);
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

  // The party in use: the one the referee last picked (state.active), or in player mode the one this seat's
  // character is in (the invitation's party until the referee's state file says otherwise).
  get partyId(): string {
    if (this.mode !== 'player') return this.state.active;
    const id = this.invitation?.character;
    return (id && this.state.characters.find((x) => x.id === id)?.party) || this.invitation?.party || '';
  }

  get currentParty(): StateParty | null {
    return partyOf(this.state, this.partyId);
  }

  // Player mode: the character this seat plays, once picked.
  get me(): Character | undefined {
    const id = this.mode === 'player' ? this.invitation?.character : undefined;
    return id ? this.character(id) : undefined;
  }

  // The active campaign's id; '' for "This device".
  // The campaign in use's messages, newest first.
  get requests(): MailItem[] {
    const id = this.campaignId;
    return id ? this.mail.filter((m) => m.envelope.campaign === id).reverse() : [];
  }

  // Inbox items waiting on you: players' requests for the referee, sent-back notes for a player.
  get unread(): number {
    return this.requests.filter((m) => m.box === 'in' && !m.answer && (this.mode === 'referee' ? m.envelope.kind === 'join' : m.envelope.to === this.me?.id)).length;
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
    // saved manifests are a cache: read each site again, keeping the saved copy when it can't be read
    void this.refreshModules();
    try {
      this.portraits = await loadPortraits();
    } catch (e) {
      console.warn('Portraits unavailable', e);
    }
    await this.loadState();
    await this.checkCanUpdate();
    this.loaded = true;
    // The Atlas in another tab of this site saves party moves into the same file (Atlas 0.5.11): read it again on coming back.
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.refreshState(); });
    if (await this.cacheInlinePortraits(this.sheets)) await this.persist();
    if (this.settings.dice3d) preloadDice();
    await this.openShared();
    await this.openAsked();
    await this.openMessage();
    this.listenForFiles();
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
    try {
      this.mail = await loadMail();
    } catch (e) {
      console.warn('Mail unavailable', e);
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

  // The state file of the campaign now in use.
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
  }

  // Takes the saved state file when it is newer than the one in memory (another tab, such as the Atlas, changed it).
  async refreshState() {
    const id = this.campaignId;
    void this.checkCanUpdate();
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

  private get snap(): CampaignState {
    return $state.snapshot(this.state) as CampaignState;
  }

  // A party move from the Atlas (its party id), or the party in use.
  async setParty(at: PartyAt | null, id = this.partyId) {
    await this.saveState(moveParty(this.snap, id, at));
  }

  async passTime(hours: number) {
    await this.saveState(passTime(this.snap, this.partyId, hours));
  }

  async setStartDate(start: string) {
    await this.saveState(setStart(this.snap, this.partyId, start));
  }

  async openSession() {
    await this.saveState(openSession(this.snap, this.partyId));
  }

  async closeSession() {
    await this.saveState(closeSession(this.snap, this.partyId));
  }

  // Referee mode: the party made in the Atlas's party creator; it becomes the one in use.
  async newParty(p: unknown) {
    const party = readParty(p);
    if (!party || this.mode !== 'referee') return;
    await this.saveState(addParty(this.snap, party));
    this.notify(`Made the party ${party.name}`);
  }

  // Referee mode: the party switcher (Home, Campaign › State, or the Atlas).
  async chooseParty(id: string) {
    if (this.mode === 'referee') await this.saveState(setActive(this.snap, id));
  }

  // Referee mode: moves a character to another party (null: none).
  async moveToParty(character: string, party: string | null) {
    if (this.mode !== 'referee') return;
    await this.exportState();
    await this.saveState(inParty(this.snap, character, party));
  }

  // The state file as it would be shared: the character list brought up to date first.
  async exportState(): Promise<CampaignState> {
    const s = withRules(this.snap, this.stateRules());
    await this.saveState(withCharacters(s, this.roster.map((c) => ({ id: c.id, name: c.name }))));
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

  // Reads every saved module site again (and `also`, the campaign's own site), so a module list saved by an older
  // install (before the module had an Atlas map, say) doesn't last. A site that can't be read keeps its saved copy.
  async refreshModules(also: string[] = []) {
    const bases = [...new Set([...also.filter(Boolean), ...this.modules.map((m) => m.base)])];
    for (const base of bases) {
      try {
        await this.addModuleRepo(base);
      } catch (e) {
        console.warn('Modules not refreshed', base, e);
      }
    }
  }

  // Opens a campaign by an invitation (its link, as referee unless it says player) and takes that seat. Throws
  // with a message for the player.
  async useCampaign(url: string, role: Invite['role'] = 'referee', character?: string, party?: string) {
    let c = await openCampaignLink(url.trim());
    // the referee opening their own published campaign by its pointer: run it from Scribe's copy on this device
    if (role === 'referee' && !isScribeLink(c.url) && (await idbGet(`scribe-campaign:${c.campaign.id}`))) c = await openCampaignLink(`scribe:${c.campaign.id}`);
    const seat = await this.takeInvitation({ url: c.url, role, ...(character ? { character } : {}), ...(role === 'player' && party ? { party } : {}) });
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
    const session = this.currentParty?.session.number ?? 0;
    const entry = { creature, name, ...(session ? { session } : {}), ...(rumour ? { rumour: true } : {}) };
    await this.addKnowledge(this.party.map((c) => c.id), [entry], []);
    this.notify(`${rumour ? 'The party has heard of' : 'The party has met'} ${name}`);
  }

  private async adoptCampaign(c: CampaignCache, seat: string) {
    registerCampaign(c);
    this.campaigns = { ...this.campaigns, [c.url]: c };
    await saveCampaigns(this.campaigns);
    await this.updateSettings({ campaign: c.url, invitation: seat });
    activateCampaign(c);
    await this.checkCanUpdate();
    await this.takeSnapshotState(c);
    await this.rereadSheets();
    this.equipmentChanged();
    void this.syncArt().catch((e) => console.warn('Campaign art not read', e));
    // a campaign made in Scribe brings its modules' site, for Campaign › Maps and Modules
    // (read again even when it is already saved, so the player's copy is the one the campaign was published with)
    const site = c.scribe?.site;
    if (site) void this.addModuleRepo(site).catch((e) => console.warn('Campaign modules not read', e));
  }

  private async keepMail(list: MailItem[]) {
    this.mail = list;
    await saveMail($state.snapshot(list) as MailItem[]);
  }

  // Player mode: sends the seat's character to the referee (WORKFLOWS.md "Joining"), by the campaign's post URL
  // when it has one, or else as a file the player passes on. Says which, for the player.
  async sendJoin(name: string): Promise<'posted' | 'saved'> {
    const me = this.me, c = this.campaign;
    if (!me || !c || this.mode !== 'player') throw new Error('Pick the character you play first');
    const e = joinRequest(c.campaign.id, me, exportSheet($state.snapshot(me.data) as typeof me.data), name.trim(), this.invitation?.party);
    let how: 'posted' | 'saved' = 'saved';
    if (c.published?.post) {
      try {
        await post(c.published.post, e);
        how = 'posted';
      } catch (err) {
        console.warn('Request not posted; saving it as a file', err);
      }
    }
    if (how === 'saved') downloadJson(mailFileName(e, me.name), e);
    // a note the referee sent back is answered by sending again
    let list = this.mail.map((m) => (m.box === 'in' && m.envelope.kind === 'sent-back' && m.envelope.to === me.id && !m.answer ? { ...m, answer: { kind: 'approved' as const, at: e.sent } } : m));
    list = addMail(list, { envelope: e, box: 'out' });
    await this.keepMail(list);
    this.notify(how === 'posted' ? `Sent ${me.name} to the referee` : `Saved ${me.name}'s request. Send that file to your referee.`);
    return how;
  }

  // A message file opened in the Inbox: a player's request (referee mode) or the referee's reply (player mode).
  // Throws with a message for the reader.
  async openMail(data: unknown): Promise<number> {
    const list = readMailFile(data);
    let mail = this.mail;
    for (const e of list) {
      if (e.campaign !== this.campaignId) throw new Error(`That message is for another campaign (${e.campaign}). Switch to it first.`);
      if (this.mode === 'referee' && e.kind !== 'join') throw new Error("That's a reply for a player. Open it on the player's device.");
      if (this.mode === 'player' && (e.kind === 'join' || e.to !== this.me?.id)) throw new Error("That message isn't for the character you play here.");
      mail = addMail(mail, { envelope: e, box: 'in' });
    }
    await this.keepMail(mail);
    return list.length;
  }

  // Referee mode: takes a join request. The character joins this campaign's party on this device, and the request
  // counts as received in the next publish.
  async approve(id: string) {
    const m = this.mail.find((x) => x.box === 'in' && x.envelope.id === id && x.envelope.kind === 'join');
    if (!m || this.mode !== 'referee') return;
    const imported = await this.importCharacters($state.snapshot(m.envelope.body.character));
    for (const s of this.sheets) if (imported.some((x) => x.id === s.id)) { s.campaign = this.campaignId || undefined; delete s.owner; }
    await this.persist();
    await this.exportState();
    const who = m.envelope.from.name;
    // the party the invitation was to, else the one in use
    const asked = m.envelope.body.party;
    const party = typeof asked === 'string' && partyOf(this.state, asked) ? asked : this.state.active || null;
    for (const x of imported) {
      if (who) await this.saveState(withPlayer(this.snap, x.id, who));
      await this.saveState(inParty(this.snap, x.id, party));
    }
    await this.keepMail(answer(this.mail, id, { kind: 'approved', at: new Date().toISOString() }));
    const names = imported.map((x) => x.name).join(', ') || 'The character';
    // the player learns of it when Scribe publishes, so the approval goes straight there and comes back
    if (this.canUpdate) {
      this.notify(`${names} joined the party. Publishing…`);
      await this.sendToScribe();
    } else this.notify(`${names} joined the party. Publish in Scribe to tell the player.`);
  }

  // Referee mode: returns a request with a note, as a file for the player; the seat stays open.
  async sendBackRequest(id: string, note: string) {
    const m = this.mail.find((x) => x.box === 'in' && x.envelope.id === id);
    if (!m || this.mode !== 'referee') return;
    const reply = sendBack(m.envelope, note.trim());
    downloadJson(mailFileName(reply, m.envelope.from.name ?? ''), reply);
    let list = answer(this.mail, id, { kind: 'sent-back', note: note.trim(), at: reply.sent });
    list = addMail(list, { envelope: reply, box: 'out' });
    await this.keepMail(list);
    this.notify('Saved the reply. Send that file to the player.');
  }

  private async checkCanUpdate() {
    const id = this.campaignId;
    try {
      const rec = id ? ((await idbGet(`scribe-campaign:${id}`)) as { services?: unknown; published?: unknown } | undefined) : undefined;
      // Scribe publishes (Heph 2026-11-10: Scribe is the only publisher); it can when it has the campaign's record
      this.canUpdate = !!rec;
      this.publishedState = await this.readPublishedState(id);
    } catch {
      this.canUpdate = false;
    }
  }

  // The state revision players last got: the state inside the snapshot Scribe published last (shared storage,
  // "published:<id>"), -1 when it has never published.
  publishedState = $state(-1);
  private async readPublishedState(id: string): Promise<number> {
    const p = id ? ((await idbGet(`published:${id}`)) as { snapshot?: { state?: { revision?: unknown } } } | undefined) : undefined;
    const r = Number(p?.snapshot?.state?.revision);
    return Number.isFinite(r) ? r : -1;
  }
  // Referee mode: something players need that Scribe hasn't published yet (a party, a move, an answer).
  get needsPublish(): boolean {
    return this.mode === 'referee' && !!this.campaign && (this.state.revision > this.publishedState || this.unpublished > 0);
  }

  // Referee mode: hands the play to Scribe, which publishes it and comes back here with a 'published' message
  // (Heph 2026-11-10: Scribe is the only publisher). `invite`: the party whose invitation to show on return.
  async sendToScribe(invite?: string) {
    location.href = await this.scribeLink(invite);
  }

  // Scribe -> Companion, after a publish this device asked for: {ok, revision, at} or {ok: false, error, firstPublish?}.
  private async receivePublished(e: Envelope) {
    if (e.campaign !== this.campaignId) {
      const seat = this.invitations.find((s) => this.campaigns[s.url]?.campaign.id === e.campaign && s.role === 'referee');
      if (seat) await this.chooseInvitation(seat.id);
      else if (await idbGet(`scribe-campaign:${e.campaign}`)) await this.useCampaign(`scribe:${e.campaign}`, 'referee');
      else throw new Error(`That message is for a campaign this device doesn't have (${e.campaign}).`);
    }
    const id = e.campaign;
    const asked = (await idbGet(`publish-asked:${id}`)) as { id?: string; invite?: string } | undefined;
    const mine = !!asked && asked.id === e.re;
    const b = e.body as { ok?: boolean; revision?: unknown; at?: unknown; error?: unknown; firstPublish?: boolean };
    if (b.ok) {
      const c = this.campaign;
      const revision = Number(b.revision) || 0, at = typeof b.at === 'string' ? b.at : e.sent;
      if (c?.published) {
        this.campaigns = { ...this.campaigns, [c.url]: { ...c, published: { ...c.published, revision, at } } };
        await saveCampaigns(this.campaigns);
      }
      await this.checkCanUpdate();
      this.notify(`Published update ${revision}. Players see it within a few minutes.`);
    } else {
      this.notify(b.firstPublish ? 'Not published yet: publish the campaign once in Scribe (its Publish step), then send again.' : `Not published: ${String(b.error ?? 'Scribe could not publish')}`);
    }
    if (mine) await idbSet(`publish-asked:${id}`, {});
    if (mine && asked.invite && partyOf(this.state, asked.invite)) {
      await this.chooseParty(asked.invite);
      this.view = { name: 'settings', invite: asked.invite };
    } else if (!b.ok) this.view = { name: 'settings' };
  }

  // The campaign's lockfile (campaign.lock.json): Scribe's record on this device, else the one the campaign came
  // with (a Scribe link from another profile), else the last snapshot read. The
  // embedded Atlas gets it so its party creator offers only the starts of the campaign's modules.
  async campaignLock(): Promise<unknown> {
    const c = this.campaign;
    if (!c) return null;
    const rec = (await idbGet(`scribe-campaign:${c.campaign.id}`)) as { lock?: unknown } | undefined;
    return rec?.lock ?? c.lock ?? c.published?.snapshot?.lock ?? null;
  }

  // Referee mode: answers (approved or sent back) made since the campaign was last published, which players
  // learn of only at the next publish.
  get unpublished(): number {
    const since = this.campaign?.published?.at ?? '';
    return this.requests.filter((m) => m.box === 'in' && m.answer && m.envelope.kind === 'join' && m.answer.at > since).length;
  }

  // The requests this device has answered, for the next snapshot's receipts.
  get receipts(): string[] {
    return this.requests.filter((m) => m.box === 'in' && m.answer && m.envelope.kind === 'join').map((m) => m.envelope.id);
  }

  // A published campaign read from its snapshot (a player's device): the shared state there (clock, party, what
  // everyone knows) replaces this device's copy when the referee's is newer.
  private async takeSnapshotState(c: CampaignCache) {
    const shared = c.published?.snapshot?.state;
    if (!shared || this.campaignId !== c.campaign.id) return;
    try {
      const s = readState(shared, c.campaign.id);
      if (s.revision > this.state.revision) {
        this.state = s;
        await saveStateFile(s.campaign, writeState(s));
      }
    } catch (e) {
      console.warn('Shared campaign state unreadable', e);
    }
    // What the character this seat plays knows, which only the referee writes (WORKFLOWS.md "Who writes what").
    const me = this.mode === 'player' ? this.invitation?.character : undefined;
    const part = me ? (c.published?.snapshot?.private?.[me] as { characters?: Record<string, { knowledge?: unknown }> } | undefined) : undefined;
    const known = part?.characters?.[me!]?.knowledge;
    const sheet = me ? this.sheets.find((x) => x.id === me) : undefined;
    if (sheet && Array.isArray(known)) {
      const next = readKnowledge(known);
      if (JSON.stringify(next) !== JSON.stringify(sheet.knowledge)) {
        sheet.knowledge = next;
        await this.persist();
      }
    }
  }

  // A link shared to the installed app from another app (manifest share_target, lib/share.ts): a message link is
  // applied like one opened in the address, an invitation is handed to openAsked.
  private async openShared() {
    if (typeof location === 'undefined') return;
    const s = readShared(location.search);
    if (!s) return;
    history.replaceState(history.state, '', location.pathname + withoutShared(location.search) + location.hash);
    if (s.kind === 'invite') return keepInvite(s.search);
    if (s.kind === 'other') return this.notify("That isn't a Hexmarch link. Share a message or an invitation link to the Companion.");
    try {
      const e = await readMessageHash(s.hash);
      if (e) await this.applyMessage(e);
    } catch (err) {
      this.notify((err as Error).message);
    }
  }

  // Message files opened with the installed app from the computer's files (manifest file_handlers, Chromium on
  // desktop): each message is applied as if its link had been opened.
  private listenForFiles() {
    type LaunchParams = { files?: readonly { name: string; getFile(): Promise<File> }[] };
    const queue = (globalThis as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }).launchQueue;
    queue?.setConsumer(async (p) => {
      for (const h of p.files ?? []) {
        try {
          let data: unknown;
          try {
            data = JSON.parse(await (await h.getFile()).text());
          } catch {
            throw new Error(`${h.name} isn't a message file`);
          }
          for (const e of readMailFile(data)) await this.applyMessage(e);
        } catch (err) {
          this.notify((err as Error).message);
        }
      }
    });
  }

  // A link may be an invitation: the campaign to open, and the seat (Scribe's "Open in the Companion":
  // ?campaign=scribe:<id>; a player's: ?campaign=<link>&as=player&character=<id>). The address is cleared
  // afterwards, so reloading doesn't switch campaigns again.
  private async openAsked() {
    if (typeof location === 'undefined') return;
    const q = new URLSearchParams(location.search);
    // the invitation in the address, or one kept across a reload into a newer app (lib/update.ts)
    const search = q.has('campaign') ? location.search : pendingInvite();
    if (q.has('campaign')) {
      keepInvite(location.search);
      for (const k of ['campaign', 'as', 'character']) q.delete(k);
      history.replaceState(history.state, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    }
    const invite = search ? readInvite(search) : null;
    if (!invite) return inviteDone();
    try {
      const here = this.invitation;
      const same = here && here.url === invite.url && here.role === invite.role && (invite.role === 'referee' || !invite.character || here.character === invite.character);
      if (!same || !this.campaign) await this.useCampaign(invite.url, invite.role, invite.character, invite.party);
      inviteDone();
    } catch (e) {
      if (e instanceof NewerAppError && (await updateForInvite())) {
        this.notify('This campaign needs a newer Companion. Updating…');
        return;
      }
      inviteDone();
      this.notify(e instanceof NewerAppError ? `${e.message} Close the app and open it again to update.` : (e as Error).message);
    }
  }

  // A message in the address (WORKFLOWS.md "Apps talk by links"): <companion>#m=<data>, from Scribe, the Atlas or a
  // player's Share. Applied once: its id is remembered, so opening the same link again changes nothing.
  private async openMessage() {
    if (typeof location === 'undefined' || !/[#&]m=/.test(location.hash)) return;
    const hash = location.hash;
    history.replaceState(history.state, '', location.pathname + location.search);
    try {
      const e = await readMessageHash(hash);
      if (e) await this.applyMessage(e);
    } catch (err) {
      this.notify((err as Error).message);
    }
  }

  async applyMessage(e: Envelope) {
    const applied = ((await idbGet('applied')) as string[] | undefined) ?? [];
    if (applied.includes(e.id)) return this.notify('Already opened that link');
    if (e.kind === 'campaign') await this.receiveCampaign(e);
    else if (e.kind === 'published') await this.receivePublished(e);
    else if (e.kind === 'join' || e.kind === 'sent-back') {
      if (e.campaign !== this.campaignId) {
        const seat = this.invitations.find((s) => this.campaigns[s.url]?.campaign.id === e.campaign && s.role === (e.kind === 'join' ? 'referee' : 'player'));
        if (!seat) throw new Error(`That message is for a campaign this device doesn't have (${e.campaign}).`);
        await this.chooseInvitation(seat.id);
      }
      await this.openMail(e);
      this.view = { name: 'inbox' };
      this.notify('Added to the Inbox');
    } else throw new Error("That link is for Scribe, not the Companion.");
    await idbSet('applied', [...applied, e.id].slice(-500));
  }

  // Scribe -> Companion: a campaign's definition and the referee's seat. The Companion keeps its own copy of
  // Scribe's record, so the campaign opens here whichever browser or profile Scribe ran in.
  private async receiveCampaign(e: Envelope) {
    const rec = e.body.record as { format?: string; id?: string } | undefined;
    if (!rec || rec.format !== 'hexmarch-scribe-campaign' || rec.id !== e.campaign) throw new Error("That link doesn't carry a campaign from Scribe.");
    await idbSet(`scribe-campaign:${rec.id}`, rec);
    if (e.body.state) {
      try {
        const incoming = readStateFile(e.body.state, rec.id);
        const had = (await idbGet(`state:${rec.id}`)) as { revision?: number } | undefined;
        if (!had || incoming.revision > (Number(had.revision) || 0)) await idbSet(`state:${rec.id}`, JSON.parse(JSON.stringify(e.body.state)));
      } catch (err) {
        console.warn('Campaign state from Scribe not read', err);
      }
    }
    if (this.settings.campaign === `scribe:${rec.id}` && this.mode === 'referee') {
      await this.checkCampaign();
      await this.refreshState();
    } else await this.useCampaign(`scribe:${rec.id}`, 'referee');
    // From the Atlas's party builder (Heph 2026-11-10: Scribe sets up the campaign, the Atlas builds the party and
    // hands to the Companion per invite): body.invite.party, the party to invite to, whose invitation opens straight away.
    const party = (e.body.invite as { party?: unknown } | undefined)?.party;
    if (typeof party === 'string' && this.state.parties.some((p) => p.id === party)) {
      await this.chooseParty(party);
      this.view = { name: 'settings', invite: party };
    }
  }

  // Companion -> Scribe: what play changed, for Scribe's Publish (the parts its Publish publishes).
  // `back`: where Scribe returns once it has published (same site only); the request's id and the party to invite to
  // are kept here, so the 'published' answer (re: that id) can land on the invitation.
  async scribeLink(invite?: string): Promise<string> {
    const id = this.campaignId;
    if (!id || this.mode !== 'referee') throw new Error('Switch to the referee seat first');
    await this.exportState();
    await this.persist();
    const parts = await publishParts(id, idbGet);
    const here = location.href.replace(/[?#].*$/, '');
    const e = mailEnvelope({ campaign: id, kind: 'update', from: { role: 'referee' }, to: 'referee', body: { ...JSON.parse(JSON.stringify(parts)), back: here } });
    await idbSet(`publish-asked:${id}`, { id: e.id, ...(invite ? { invite } : {}) });
    return messageLink(new URL('scribe/', here).href, e);
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
