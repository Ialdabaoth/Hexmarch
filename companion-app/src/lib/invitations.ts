// Invitations (Heph 2026-11-09): how this device sits in each campaign it knows. There are two kinds, Referee and
// Player; a player's names the one character they play. One person may hold several, and the campaign switcher lists
// every one, so the same campaign shows once for each invitation. Picking one picks the mode: referee mode shows
// everything, as the Companion always has; player mode shows your character and their followers, your party, the NPCs
// your character knows, and the map as your character knows it.
//
// Kept in the app's IndexedDB (idb-keyval's default store) under "invitations": an array of Invitation. Scribe
// writes the creator's Referee invitation there when it saves a campaign (url "scribe:<id>").
import { get, set } from 'idb-keyval';
import type { KnowledgeEntry } from './sheet';

export type Role = 'referee' | 'player';
export type Mode = Role;

export interface Invitation {
  id: string;
  // The campaign's link, as the campaigns record keys it.
  url: string;
  role: Role;
  // A player's character (its sheet id); unset until the player picks or makes one.
  character?: string;
  // The campaign's name, for the switcher before the campaign has been read.
  name?: string;
  added: string;
}

// What an invitation link carries: ?campaign=<link>&as=player&character=<id> (as and character optional).
export interface Invite {
  url: string;
  role: Role;
  character?: string;
}

export function readInvite(search: string): Invite | null {
  const q = new URLSearchParams(search);
  const url = q.get('campaign')?.trim();
  if (!url) return null;
  const role: Role = q.get('as') === 'player' ? 'player' : 'referee';
  const character = role === 'player' ? q.get('character')?.trim() || undefined : undefined;
  return { url, role, ...(character ? { character } : {}) };
}

export function inviteLink(base: string, i: Invite): string {
  const q = new URLSearchParams({ campaign: i.url });
  if (i.role === 'player') q.set('as', 'player');
  if (i.role === 'player' && i.character) q.set('character', i.character);
  return `${base}?${q}`;
}

const same = (s: Invitation, i: Invite) => s.url === i.url && s.role === i.role && (s.role === 'referee' || (s.character ?? '') === (i.character ?? ''));

// Adds an invitation, or finds the same one already there. A player invitation without a character matches a player
// invitation that has none yet, rather than making a second empty one.
export function addInvitation(list: Invitation[], i: Invite, now = new Date()): { invitations: Invitation[]; invitation: Invitation } {
  const found = list.find((s) => same(s, i));
  if (found) return { invitations: list, invitation: found };
  const seat: Invitation = { id: newId(), url: i.url, role: i.role, ...(i.character ? { character: i.character } : {}), added: now.toISOString() };
  return { invitations: [...list, seat], invitation: seat };
}

// Every campaign opened before invitations existed was opened as its referee (the Companion has always been in referee mode).
export function withRefereeInvitations(list: Invitation[], urls: string[], now = new Date()): Invitation[] {
  let out = list;
  for (const url of urls) if (!out.some((s) => s.url === url)) out = addInvitation(out, { url, role: 'referee' }, now).invitations;
  return out;
}

export function bindCharacter(list: Invitation[], invitationId: string, character: string): Invitation[] {
  return list.map((s) => (s.id === invitationId ? { ...s, character } : s));
}

export function invitationLabel(s: Invitation, campaign: string, character?: string): string {
  return s.role === 'referee' ? `${campaign} · Referee` : `${campaign} · ${character ? `Playing ${character}` : '(Roll a character)'}`;
}

// The NPCs and creatures a character has heard of or met: its knowledge entries that name a creature, one per
// creature, with the name the character knows it by. A meeting outranks hearsay.
export interface KnownCreature {
  id: string;
  name: string;
  met: boolean;
  how?: string;
}

export function knownCreatures(knowledge: KnowledgeEntry[]): KnownCreature[] {
  const by = new Map<string, KnownCreature>();
  for (const e of knowledge) {
    if (!e.creature) continue;
    const o = by.get(e.creature);
    const met = !e.rumour;
    if (!o) by.set(e.creature, { id: e.creature, name: e.name || e.creature, met, ...(e.how ? { how: e.how } : {}) });
    else {
      if (e.name && (met || !o.met)) o.name = e.name;
      if (met && !o.met) {
        o.met = true;
        if (e.how) o.how = e.how;
      }
    }
  }
  return [...by.values()].sort((a, b) => Number(b.met) - Number(a.met) || a.name.localeCompare(b.name));
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `invitation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function loadInvitations(): Promise<Invitation[]> {
  const raw = (await get<Invitation[]>('invitations')) ?? [];
  return raw.filter((s) => s && typeof s.id === 'string' && typeof s.url === 'string' && (s.role === 'referee' || s.role === 'player'));
}

export async function saveInvitations(list: Invitation[]) {
  await set('invitations', JSON.parse(JSON.stringify(list)));
}
