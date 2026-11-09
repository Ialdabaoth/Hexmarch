// The Atlas, embedded in Campaign › Maps (Atlas 0.5.6; modules/ATLAS_FORMAT.md "Party marker").
// The Atlas is the same app for every module: <site>/atlas/?module=<id>#<address>. It tells the
// page around it where it is and where the party stands; everything it sends is checked first.

// A 100-ft hex address: world:<League CCRR>:<hex CCRR>; each label is 00-99, then A0-Z9 without I, O, Q.
const ADDR = /^world:([0-9A-HJ-NPR-Z][0-9]){2}:([0-9A-HJ-NPR-Z][0-9]){2}$/;
// What the Atlas may report as its view: #world, #march:CCRR, #world:CCRR, #field:… or a full address.
const VIEW = /^#((world|march|field)(:[0-9A-Za-z]{4}){0,2})?$/;

export interface AtlasView { type: 'e9-atlas'; event: 'view'; module: string; hash: string }
export interface AtlasParty { type: 'e9-atlas'; event: 'party'; module: string; hex: string | null; hours: number }
// Knowledge to add to (or hexes to remove from) some characters: party travel and the referee's fog brush (Atlas 0.5.15).
export interface AtlasKnowledge { type: 'e9-atlas'; event: 'knowledge'; module: string; ids: string[]; add: unknown[]; remove: string[] }
export type AtlasMessage = AtlasView | AtlasParty | AtlasKnowledge;

// The Atlas ships with the app (<app>/atlas/) and loads the module from its own site (?site=<base>).
export function atlasUrl(base: string, id: string, app: string = appAtlas()): string {
  return `${app}?module=${encodeURIComponent(id)}&site=${encodeURIComponent(base)}`;
}

function appAtlas(): string {
  const root = typeof location === 'undefined' ? 'https://example.invalid/' : location.href;
  return new URL(`${import.meta.env.BASE_URL}atlas/`, root).href;
}

export const isAtlasAddress = (h: unknown): h is string => typeof h === 'string' && ADDR.test(h);

export function isAtlasMessage(d: unknown): d is AtlasMessage {
  const m = d as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || m.type !== 'e9-atlas' || typeof m.module !== 'string' || !/^[a-z0-9-]{1,80}$/.test(m.module)) return false;
  if (m.event === 'view') return typeof m.hash === 'string' && VIEW.test(m.hash);
  if (m.event === 'knowledge') {
    const strs = (v: unknown, n: number) => Array.isArray(v) && v.length <= n && v.every((x) => typeof x === 'string' && x.length <= 200);
    return strs(m.ids, 200) && Array.isArray(m.add) && m.add.length <= 5000 && strs(m.remove, 5000);
  }
  if (m.event === 'party') return (m.hex === null || isAtlasAddress(m.hex)) && typeof m.hours === 'number' && Number.isFinite(m.hours) && m.hours >= 0;
  return false;
}

