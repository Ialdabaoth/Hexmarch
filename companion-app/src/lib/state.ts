// The campaign state file (hexmarch-campaign-state/1, modules/STATE_FORMAT.md): one small versioned file
// holding the parties (each with its start, clock, session and place on the map), what everyone knows, and
// who is playing in which party. The Companion keeps one per campaign on the device ("" is This device); later the
// referee's Update campaign commits it to the campaign repo as campaign/state.json and players read it.
import { isAtlasAddress } from './atlas';
import type { PartyAt } from './storage';

export const STATE_FORMAT = 'hexmarch-campaign-state';
export const STATE_VERSION = 1;

export interface StateCharacter {
  id: string;
  name: string;
  // Who plays them; '' until players join by invite.
  player: string;
  // The party they travel with (StateParty.id); null while in none.
  party: string | null;
}

export interface Revealed {
  // 100-ft hex addresses (world:CCRR:CCRR) everyone knows.
  hexes: string[];
  // Place slugs from the module's sites everyone knows.
  places: string[];
}

// The rules the campaign plays with: a ruleset id and the rules module that provides it.
export interface StateRules {
  ruleset: string;
  // The module's id ("e9-core", "mm-core"), its option ("e9", or '' for the module's own rules) and
  // version; module '' when the ruleset comes from a file of the referee's own.
  module: string;
  option: string;
  version: string;
}

// Where a party began (Heph 2026-11-10): one of its modules' start positions ({module, id}), or a place and time
// the referee picked ({module, site, date, hour}; site '' to place it on the map). null is read as placed by hand.
export interface PartyStart {
  module: string;
  id?: string;
  site?: string;
  date?: string;
  hour?: number;
}

export interface Clock {
  // The party's starting day, YYYY-MM-DD in the setting's own years (Materia Mundi: AD + 2085).
  start: string;
  // Hours of game time since midnight of the start day.
  hours: number;
}

export interface Session {
  // The last session opened; 0 before the first.
  number: number;
  open: boolean;
}

// One party in the campaign (Heph 2026-11-10: the referee makes parties in the Atlas; each has its own start,
// clock and sessions; invitations are to a party). What a party knows is what its members know.
export interface StateParty {
  id: string;
  name: string;
  start: PartyStart | null;
  clock: Clock;
  session: Session;
  // Where it stands on a module's Atlas map; null until placed.
  at: PartyAt | null;
}

export interface CampaignState {
  format: typeof STATE_FORMAT;
  version: typeof STATE_VERSION;
  // The campaign file's id; '' for This device.
  campaign: string;
  // Goes up by one with every change, so two copies can be told apart.
  revision: number;
  updated: string;
  rules: StateRules | null;
  parties: StateParty[];
  // The party the referee last worked with; '' when there is none.
  active: string;
  // What everyone knows, by module id.
  revealed: Record<string, Revealed>;
  characters: StateCharacter[];
}

export class StateError extends Error {}

// Beyond the Pale opens on 1 May 1422, 08:00.
export const DEFAULT_START = '3507-05-01';
const DATE = /^\d{1,5}-\d{2}-\d{2}$/;
export const PARTY_ID = /^[a-z0-9-]{1,40}$/;

export function blankState(campaign: string, now = new Date()): CampaignState {
  return { format: STATE_FORMAT, version: STATE_VERSION, campaign, revision: 0, updated: now.toISOString(), rules: null, parties: [], active: '', revealed: {}, characters: [] };
}

export function blankParty(id: string, name: string, start: PartyStart | null = null, clock: Clock = { start: DEFAULT_START, hours: 8 }): StateParty {
  return { id, name, start, clock: { ...clock }, session: { number: 0, open: false }, at: null };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const hours = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function readPartyAt(p: unknown): PartyAt | null {
  const o = p as Partial<PartyAt> | null;
  if (!o || typeof o !== 'object') return null;
  if (typeof o.base !== 'string' || typeof o.module !== 'string' || !isAtlasAddress(o.hex)) return null;
  const map = typeof o.map === 'string' ? o.map : 'atlas';
  return { base: o.base, module: o.module, map, hex: o.hex as string, label: typeof o.label === 'string' ? o.label : (o.hex as string).slice(6), hours: hours(o.hours, 0) };
}

function readStart(v: unknown): PartyStart | null {
  const o = v as Partial<PartyStart> | null;
  if (!o || typeof o !== 'object' || typeof o.module !== 'string' || !o.module) return null;
  const out: PartyStart = { module: o.module };
  if (typeof o.id === 'string' && o.id) out.id = o.id;
  if (typeof o.site === 'string') out.site = o.site;
  if (typeof o.date === 'string' && DATE.test(o.date)) out.date = o.date;
  if (typeof o.hour === 'number' && Number.isFinite(o.hour) && o.hour >= 0 && o.hour < 24) out.hour = o.hour;
  return out;
}

// One party from a state file or an Atlas message; null when it has no usable id.
export function readParty(v: unknown): StateParty | null {
  const o = v as Partial<StateParty> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !PARTY_ID.test(o.id)) return null;
  const base = blankParty(o.id, str(o.name).trim() || o.id);
  return {
    ...base,
    start: readStart(o.start),
    clock: { start: typeof o.clock?.start === 'string' && DATE.test(o.clock.start) ? o.clock.start : base.clock.start, hours: hours(o.clock?.hours, base.clock.hours) },
    session: { number: Math.floor(hours(o.session?.number, 0)), open: o.session?.open === true },
    at: readPartyAt(o.at)
  };
}

function readRules(r: unknown): StateRules | null {
  const o = r as Partial<StateRules> | null;
  if (!o || typeof o !== 'object' || typeof o.ruleset !== 'string' || !o.ruleset) return null;
  return { ruleset: o.ruleset, module: str(o.module), option: str(o.option), version: str(o.version) };
}

// Reads a state file (imported, or saved on the device), filling anything missing with defaults.
export function readState(d: unknown, campaign: string): CampaignState {
  const s = d as Partial<CampaignState> | null;
  if (!s || typeof s !== 'object' || s.format !== STATE_FORMAT) throw new StateError("That isn't a campaign state file");
  if (typeof s.version !== 'number' || s.version > STATE_VERSION) throw new StateError('That state file was written by a newer app. Update the app to read it.');
  if (typeof s.campaign === 'string' && s.campaign !== campaign) {
    throw new StateError(`That state file belongs to another campaign (${s.campaign || 'This device'})`);
  }
  const base = blankState(campaign);
  const revealed: Record<string, Revealed> = {};
  for (const [id, r] of Object.entries((s.revealed as Record<string, Partial<Revealed>>) ?? {})) {
    if (!/^[a-z0-9-]{1,80}$/.test(id) || !r || typeof r !== 'object') continue;
    revealed[id] = { hexes: strings(r.hexes).filter(isAtlasAddress), places: strings(r.places) };
  }
  const parties: StateParty[] = [];
  for (const p of Array.isArray(s.parties) ? s.parties : []) {
    const r = readParty(p);
    if (r && !parties.some((x) => x.id === r.id)) parties.push(r);
  }
  const ids = new Set(parties.map((p) => p.id));
  const chars = Array.isArray(s.characters) ? s.characters : [];
  return {
    ...base,
    revision: Math.max(0, Math.floor(hours(s.revision, 0))),
    updated: typeof s.updated === 'string' ? s.updated : base.updated,
    rules: readRules(s.rules),
    parties,
    active: typeof s.active === 'string' && ids.has(s.active) ? s.active : (parties[0]?.id ?? ''),
    revealed,
    characters: chars.flatMap((c) =>
      c && typeof c === 'object' && typeof c.id === 'string'
        ? [{ id: c.id, name: str(c.name), player: str(c.player), party: typeof c.party === 'string' && ids.has(c.party) ? c.party : null }]
        : []
    )
  };
}

// Every change goes through here: a new copy, one revision on.
function bump(s: CampaignState, change: Partial<CampaignState>, now = new Date()): CampaignState {
  return { ...s, ...change, revision: s.revision + 1, updated: now.toISOString() };
}

// A party by id, or the active one.
export function partyOf(s: CampaignState, id: string = s.active): StateParty | null {
  return s.parties.find((p) => p.id === id) ?? null;
}

function withParty(s: CampaignState, id: string, f: (p: StateParty) => StateParty, now: Date): CampaignState {
  const p = partyOf(s, id);
  if (!p) return s;
  const next = f(p);
  return next === p ? s : bump(s, { parties: s.parties.map((x) => (x.id === id ? next : x)) }, now);
}

// A new party (the Atlas's party creator) becomes the active one; an id already taken changes nothing.
export function addParty(s: CampaignState, party: StateParty, now = new Date()): CampaignState {
  if (partyOf(s, party.id)) return s;
  return bump(s, { parties: [...s.parties, party], active: party.id }, now);
}

export function setActive(s: CampaignState, id: string, now = new Date()): CampaignState {
  return id === s.active || !partyOf(s, id) ? s : bump(s, { active: id }, now);
}

// A party moves (or is taken off the map). Travel time the Atlas adds to the party also passes on its
// clock; resetting the Atlas's running time doesn't turn the clock back. Its members learn the hex they arrive in
// through the Atlas's knowledge message, not here.
export function moveParty(s: CampaignState, id: string, at: PartyAt | null, now = new Date()): CampaignState {
  return withParty(s, id, (p) => {
    if (!at) return p.at ? { ...p, at: null } : p;
    const before = p.at && p.at.module === at.module ? p.at.hours ?? 0 : 0;
    const passed = Math.max(0, (at.hours ?? 0) - before);
    const same = p.at && p.at.module === at.module && p.at.base === at.base && p.at.hex === at.hex && (p.at.hours ?? 0) === (at.hours ?? 0);
    return same ? p : { ...p, at: { ...at }, clock: { ...p.clock, hours: p.clock.hours + passed } };
  }, now);
}

export function passTime(s: CampaignState, id: string, h: number, now = new Date()): CampaignState {
  if (!Number.isFinite(h) || h === 0) return s;
  return withParty(s, id, (p) => ({ ...p, clock: { ...p.clock, hours: Math.max(0, p.clock.hours + h) } }), now);
}

export function setStart(s: CampaignState, id: string, start: string, now = new Date()): CampaignState {
  if (!DATE.test(start)) return s;
  return withParty(s, id, (p) => (start === p.clock.start ? p : { ...p, clock: { ...p.clock, start } }), now);
}

export function openSession(s: CampaignState, id: string, now = new Date()): CampaignState {
  return withParty(s, id, (p) => (p.session.open ? p : { ...p, session: { number: p.session.number + 1, open: true } }), now);
}

export function closeSession(s: CampaignState, id: string, now = new Date()): CampaignState {
  return withParty(s, id, (p) => (p.session.open ? { ...p, session: { ...p.session, open: false } } : p), now);
}

// The character list as the referee's device knows it; players and parties named in the file are kept. A
// character new to the list joins `party` (the active one unless said otherwise).
export function withCharacters(s: CampaignState, list: { id: string; name: string; party?: string | null }[], now = new Date()): CampaignState {
  const next = list.map((c) => {
    const had = s.characters.find((x) => x.id === c.id);
    const party = c.party !== undefined && (c.party === null || partyOf(s, c.party)) ? c.party : had ? had.party : s.active || null;
    return { id: c.id, name: c.name, player: had?.player ?? '', party };
  });
  const same = next.length === s.characters.length && next.every((c, i) => c.id === s.characters[i].id && c.name === s.characters[i].name && c.party === s.characters[i].party);
  return same ? s : bump(s, { characters: next }, now);
}

// Moves a character to another party (null for none).
export function inParty(s: CampaignState, id: string, party: string | null, now = new Date()): CampaignState {
  const c = s.characters.find((x) => x.id === id);
  if (!c || c.party === party || (party && !partyOf(s, party))) return s;
  return bump(s, { characters: s.characters.map((x) => (x.id === id ? { ...x, party } : x)) }, now);
}

// Who plays a character in the party list (an approved join request names its player).
export function withPlayer(s: CampaignState, id: string, player: string, now = new Date()): CampaignState {
  const c = s.characters.find((x) => x.id === id);
  if (!c || c.player === player) return s;
  return bump(s, { characters: s.characters.map((x) => (x.id === id ? { ...x, player } : x)) }, now);
}

// Records which rules (and which version of their module) the campaign is played with.
export function withRules(s: CampaignState, rules: StateRules | null, now = new Date()): CampaignState {
  const a = s.rules, b = rules;
  if (a === b || (a && b && a.ruleset === b.ruleset && a.module === b.module && a.option === b.option && a.version === b.version)) return s;
  return bump(s, { rules: b ? { ...b } : null }, now);
}

export function rulesLabel(r: StateRules | null): string {
  if (!r) return 'not recorded yet';
  if (!r.module) return `${r.ruleset} (the campaign's own rules file)`;
  return `${r.ruleset} · ${r.module}${r.option ? ` › ${r.option}` : ''} ${r.version}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "1 May 3507, 08:00 (day 1)". Months and days run as in the Gregorian calendar.
export function clockLabel(clock: Clock): string {
  const [y, m, d] = clock.start.split('-').map(Number);
  const day = Math.floor(clock.hours / 24);
  const at = new Date(Date.UTC(2000, m - 1, d + day));
  // Count the years separately so the setting's far-future years don't trouble the Date maths.
  const year = y + (at.getUTCFullYear() - 2000);
  const h = clock.hours - day * 24;
  const hh = String(Math.floor(h)).padStart(2, '0');
  const mm = String(Math.round((h % 1) * 60) % 60).padStart(2, '0');
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${year}, ${hh}:${mm} (day ${day + 1})`;
}

// The file as written out: plain JSON, field order as in the spec.
export function writeState(s: CampaignState): CampaignState {
  return JSON.parse(JSON.stringify(s));
}
