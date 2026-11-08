// The E9 Atlas, embedded in Campaign › Maps (Atlas 0.5.6; modules/ATLAS_FORMAT.md "Party marker").
// The Atlas is the same app for every module: <site>/atlas/?module=<id>#<address>. It tells the
// page around it where it is and where the party stands; everything it sends is checked first.
import type { PartyAt } from './storage';

// A 100-ft hex address: world:<League CCRR>:<hex CCRR>; each label is 00-99, then A0-Z9 without I, O, Q.
const ADDR = /^world:([0-9A-HJ-NPR-Z][0-9]){2}:([0-9A-HJ-NPR-Z][0-9]){2}$/;
// What the Atlas may report as its view: #world, #march:CCRR, #world:CCRR, #field:… or a full address.
const VIEW = /^#((world|march|field)(:[0-9A-Za-z]{4}){0,2})?$/;

export interface AtlasView { type: 'e9-atlas'; event: 'view'; module: string; hash: string }
export interface AtlasParty { type: 'e9-atlas'; event: 'party'; module: string; hex: string | null; hours: number }
export type AtlasMessage = AtlasView | AtlasParty;

export function atlasUrl(base: string, id: string): string {
  return new URL(`atlas/?module=${encodeURIComponent(id)}`, base).href;
}

export const isAtlasAddress = (h: unknown): h is string => typeof h === 'string' && ADDR.test(h);

export function isAtlasMessage(d: unknown): d is AtlasMessage {
  const m = d as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || m.type !== 'e9-atlas' || typeof m.module !== 'string' || !/^[a-z0-9-]{1,80}$/.test(m.module)) return false;
  if (m.event === 'view') return typeof m.hash === 'string' && VIEW.test(m.hash);
  if (m.event === 'party') return (m.hex === null || isAtlasAddress(m.hex)) && typeof m.hours === 'number' && Number.isFinite(m.hours) && m.hours >= 0;
  return false;
}

// Where the party stands, as the Atlas reads it. A party placed before Atlas 0.5.6 sits on the old
// viewer's grid (map "world" or a League page, hex CCRR): the Atlas reads it as #legacy:… and puts
// the party at the centre of the League that holds it, then reports the new address back.
export function partyHex(at: PartyAt): string {
  if (isAtlasAddress(at.hex)) return at.hex;
  return at.map === 'world' ? `legacy:world:${at.hex}` : `legacy:${at.map}`;
}
