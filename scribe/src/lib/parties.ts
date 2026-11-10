// Scribe hosts the Atlas for Preview in Atlas (Heph 2026-11-10: an embedded map, as in the Companion's Campaign ›
// Maps, instead of a link away). Scribe owns the state file while it does: the Atlas sends party moves, new parties
// and the party switch, Scribe applies them to its own copy (kept as play:<id>, which Publish reads) and sends the
// state back. The rules mirror the Companion's lib/state.ts (addParty, setActive, moveParty) and lib/atlas.ts
// (isAtlasMessage); both could move into the engine later.

export type State = Record<string, unknown> & { revision?: number; parties?: Party[]; active?: string };
export type Party = Record<string, unknown> & { id: string; at?: At | null; clock?: { start: string; hours: number } };
export interface At { base: string; module: string; map: string; hex: string; label: string; hours?: number }

const PARTY_ID = /^[a-z0-9-]{1,40}$/;
const ADDR = /^world:([0-9A-HJ-NPR-Z][0-9]){2}:([0-9A-HJ-NPR-Z][0-9]){2}$/;

export type AtlasEvent =
  | { event: 'view'; module: string; hash: string }
  | { event: 'party'; module: string; party: string; hex: string | null; hours: number }
  | { event: 'party-new'; module: string; party: Party }
  | { event: 'active'; module: string; party: string }
  // The Atlas's party builder asks for an invitation to a party (Heph 2026-11-10: Scribe sets up the campaign and
  // hands it to the Atlas, the Atlas builds the party, and the party builder hands to the Companion per invite).
  | { event: 'invite'; module: string; party: string };

// Only what Scribe uses, checked as the Companion checks it; anything else (knowledge, unknown events) is null.
export function atlasEvent(d: unknown): AtlasEvent | null {
  const m = d as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || m.type !== 'hexmarch-atlas' || typeof m.module !== 'string' || !/^[a-z0-9-]{1,80}$/.test(m.module)) return null;
  const id = (v: unknown): v is string => typeof v === 'string' && PARTY_ID.test(v);
  if (m.event === 'view' && typeof m.hash === 'string') return { event: 'view', module: m.module, hash: m.hash };
  if (m.event === 'party' && id(m.party) && (m.hex === null || (typeof m.hex === 'string' && ADDR.test(m.hex))) && typeof m.hours === 'number' && Number.isFinite(m.hours) && m.hours >= 0)
    return { event: 'party', module: m.module, party: m.party, hex: m.hex as string | null, hours: m.hours };
  if (m.event === 'party-new' && m.party && typeof m.party === 'object' && id((m.party as Party).id) && typeof (m.party as Party).name === 'string')
    return { event: 'party-new', module: m.module, party: m.party as Party };
  if (m.event === 'active' && id(m.party)) return { event: 'active', module: m.module, party: m.party };
  if (m.event === 'invite' && id(m.party)) return { event: 'invite', module: m.module, party: m.party };
  return null;
}

const parties = (s: State): Party[] => (Array.isArray(s.parties) ? s.parties : []);
const bump = (s: State, change: Partial<State>, now: Date): State => ({ ...s, ...change, revision: (Number(s.revision) || 0) + 1, updated: now.toISOString() });

// Applies one Atlas event; returns the same object when nothing changed.
export function applyAtlas(s: State, e: AtlasEvent, base: string, now = new Date()): State {
  const list = parties(s);
  if (e.event === 'party-new') return list.some((p) => p.id === e.party.id) ? s : bump(s, { parties: [...list, structuredClone(e.party)], active: e.party.id }, now);
  if (e.event === 'active') return e.party === s.active || !list.some((p) => p.id === e.party) ? s : bump(s, { active: e.party }, now);
  if (e.event !== 'party') return s; // view and invite change nothing
  const p = list.find((x) => x.id === e.party);
  if (!p) return s;
  let next: Party = p;
  if (e.hex === null) {
    if (p.at && p.at.base === base && p.at.module === e.module) next = { ...p, at: null };
  } else {
    const at: At = { base, module: e.module, map: 'atlas', hex: e.hex, label: e.hex.slice(6), hours: e.hours };
    const before = p.at && p.at.module === at.module ? (p.at.hours ?? 0) : 0;
    const passed = Math.max(0, e.hours - before);
    const same = p.at && p.at.base === base && p.at.module === at.module && p.at.hex === at.hex && (p.at.hours ?? 0) === e.hours;
    const clock = p.clock ?? { start: '3507-05-01', hours: 8 };
    if (!same) next = { ...p, at, clock: { ...clock, hours: clock.hours + passed } };
  }
  return next === p ? s : bump(s, { parties: list.map((x) => (x.id === p.id ? next : x)) }, now);
}
