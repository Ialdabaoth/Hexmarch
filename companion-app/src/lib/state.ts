// The campaign state file (e9-campaign-state/1, modules/STATE_FORMAT.md): one small versioned file
// holding where the party stands, the game clock, what the party has found, the current session and
// who is playing. The Companion keeps one per campaign on the device ("" is This device); later the
// referee's Update campaign commits it to the campaign repo as campaign/state.json and players read it.
import { isAtlasAddress } from './atlas';
import type { PartyAt } from './storage';

export const STATE_FORMAT = 'e9-campaign-state';
export const STATE_VERSION = 1;

export interface StateCharacter {
  id: string;
  name: string;
  // Who plays them; '' until players join by invite.
  player: string;
}

export interface Revealed {
  // 100-ft hex addresses (world:CCRR:CCRR) the party has seen.
  hexes: string[];
  // Place slugs from the module's sites the party has found.
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

export interface CampaignState {
  format: typeof STATE_FORMAT;
  version: typeof STATE_VERSION;
  // The campaign file's id; '' for This device.
  campaign: string;
  // Goes up by one with every change, so two copies can be told apart.
  revision: number;
  updated: string;
  rules: StateRules | null;
  clock: {
    // The game's starting day, YYYY-MM-DD in the setting's own years (Materia Mundi: AD + 2085).
    start: string;
    // Hours of game time since midnight of the start day.
    hours: number;
  };
  party: PartyAt | null;
  // By module id.
  revealed: Record<string, Revealed>;
  session: {
    // The last session opened; 0 before the first.
    number: number;
    open: boolean;
  };
  characters: StateCharacter[];
}

export class StateError extends Error {}

// Beyond the Pale opens on 1 May 1422, 08:00.
export const DEFAULT_START = '3507-05-01';
const DATE = /^\d{1,5}-\d{2}-\d{2}$/;

export function blankState(campaign: string, now = new Date()): CampaignState {
  return {
    format: STATE_FORMAT, version: STATE_VERSION, campaign, revision: 0, updated: now.toISOString(), rules: null,
    clock: { start: DEFAULT_START, hours: 8 }, party: null, revealed: {}, session: { number: 0, open: false }, characters: []
  };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const hours = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function readParty(p: unknown): PartyAt | null {
  const o = p as Partial<PartyAt> | null;
  if (!o || typeof o !== 'object') return null;
  if (typeof o.base !== 'string' || typeof o.module !== 'string' || typeof o.hex !== 'string' || !o.hex) return null;
  const map = typeof o.map === 'string' ? o.map : 'atlas';
  return { base: o.base, module: o.module, map, hex: o.hex, label: typeof o.label === 'string' ? o.label : o.hex.slice(6), hours: hours(o.hours, 0) };
}

function readRules(r: unknown): StateRules | null {
  const o = r as Partial<StateRules> | null;
  if (!o || typeof o !== 'object' || typeof o.ruleset !== 'string' || !o.ruleset) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return { ruleset: o.ruleset, module: str(o.module), option: str(o.option), version: str(o.version) };
}

// Reads a state file (imported, or saved on the device), filling anything missing with defaults.
export function readState(d: unknown, campaign: string): CampaignState {
  const s = d as Partial<CampaignState> | null;
  if (!s || typeof s !== 'object' || s.format !== STATE_FORMAT) throw new StateError("That isn't an E9 campaign state file");
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
  const chars = Array.isArray(s.characters) ? s.characters : [];
  return {
    ...base,
    revision: Math.max(0, Math.floor(hours(s.revision, 0))),
    updated: typeof s.updated === 'string' ? s.updated : base.updated,
    rules: readRules(s.rules),
    clock: {
      start: typeof s.clock?.start === 'string' && DATE.test(s.clock.start) ? s.clock.start : base.clock.start,
      hours: hours(s.clock?.hours, base.clock.hours)
    },
    party: readParty(s.party),
    revealed,
    session: { number: Math.floor(hours(s.session?.number, 0)), open: s.session?.open === true },
    characters: chars.flatMap((c) =>
      c && typeof c === 'object' && typeof c.id === 'string' ? [{ id: c.id, name: typeof c.name === 'string' ? c.name : '', player: typeof c.player === 'string' ? c.player : '' }] : []
    )
  };
}

// Every change goes through here: a new copy, one revision on.
function bump(s: CampaignState, change: Partial<CampaignState>, now = new Date()): CampaignState {
  return { ...s, ...change, revision: s.revision + 1, updated: now.toISOString() };
}

// The party moves (or is taken off the map). Travel time the Atlas adds to the party also passes on
// the clock; resetting the Atlas's running time doesn't turn the clock back. The hex the party
// arrives in counts as revealed.
export function moveParty(s: CampaignState, party: PartyAt | null, now = new Date()): CampaignState {
  if (!party) return s.party ? bump(s, { party: null }, now) : s;
  const before = s.party && s.party.module === party.module ? s.party.hours ?? 0 : 0;
  const passed = Math.max(0, (party.hours ?? 0) - before);
  const same = s.party && s.party.module === party.module && s.party.base === party.base && s.party.hex === party.hex && (s.party.hours ?? 0) === (party.hours ?? 0);
  if (same) return s;
  let revealed = s.revealed;
  if (isAtlasAddress(party.hex)) {
    const r = s.revealed[party.module] ?? { hexes: [], places: [] };
    if (!r.hexes.includes(party.hex)) revealed = { ...s.revealed, [party.module]: { ...r, hexes: [...r.hexes, party.hex] } };
  }
  return bump(s, { party: { ...party }, clock: { ...s.clock, hours: s.clock.hours + passed }, revealed }, now);
}

export function passTime(s: CampaignState, h: number, now = new Date()): CampaignState {
  if (!Number.isFinite(h) || h === 0) return s;
  return bump(s, { clock: { ...s.clock, hours: Math.max(0, s.clock.hours + h) } }, now);
}

export function setStart(s: CampaignState, start: string, now = new Date()): CampaignState {
  if (!DATE.test(start) || start === s.clock.start) return s;
  return bump(s, { clock: { ...s.clock, start } }, now);
}

export function openSession(s: CampaignState, now = new Date()): CampaignState {
  return s.session.open ? s : bump(s, { session: { number: s.session.number + 1, open: true } }, now);
}

export function closeSession(s: CampaignState, now = new Date()): CampaignState {
  return s.session.open ? bump(s, { session: { ...s.session, open: false } }, now) : s;
}

// The party list as the referee's device knows it; players named in the file are kept.
export function withCharacters(s: CampaignState, list: { id: string; name: string }[], now = new Date()): CampaignState {
  const next = list.map((c) => ({ id: c.id, name: c.name, player: s.characters.find((x) => x.id === c.id)?.player ?? '' }));
  const same = next.length === s.characters.length && next.every((c, i) => c.id === s.characters[i].id && c.name === s.characters[i].name);
  return same ? s : bump(s, { characters: next }, now);
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
export function clockLabel(s: CampaignState): string {
  const [y, m, d] = s.clock.start.split('-').map(Number);
  const day = Math.floor(s.clock.hours / 24);
  const at = new Date(Date.UTC(2000, m - 1, d + day));
  // Count the years separately so the setting's far-future years don't trouble the Date maths.
  const year = y + (at.getUTCFullYear() - 2000);
  const h = s.clock.hours - day * 24;
  const hh = String(Math.floor(h)).padStart(2, '0');
  const mm = String(Math.round((h % 1) * 60) % 60).padStart(2, '0');
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${year}, ${hh}:${mm} (day ${day + 1})`;
}

// The file as written out: plain JSON, field order as in the spec.
export function writeState(s: CampaignState): CampaignState {
  return JSON.parse(JSON.stringify(s));
}
