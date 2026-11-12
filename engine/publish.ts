// Publishing a campaign for its players (data repo modules/SCRIBE.md section 5; WORKFLOWS.md "Invitations").
// Two plain JSON files, written by Scribe's Publish step and again by every "Update campaign" in the Companion:
//   campaign.json  the campaign pointer (hexmarch-campaign-pointer/1): where the campaign lives now; invite links name it
//   snapshot.json  the player snapshot (hexmarch-snapshot/1), at the pointer's read URL: everything a player's app reads

import { canonical } from './hash';

export const POINTER_FORMAT = 'hexmarch-campaign-pointer';
export const SNAPSHOT_FORMAT = 'hexmarch-snapshot';

export interface Services {
  // A folder on a static host the referee uploads to (the Manual adapter, PROPOSALS.md P1), ending in "/".
  folder: string;
  // Where players read the snapshot, and where they send requests ('' until the referee has one).
  read: string;
  post: string;
  // Who a request posted to a Discord channel mentions, so Discord itself notifies them (Heph 2026-11-12: "Discord
  // doing the waking"): '<@user id>' or '<@&role id>', or none.
  ping?: string;
  // The pointer's own address: what invite links name.
  pointer: string;
  // Where Publish puts the files (adapters.ts); none means the referee uploads them into `folder` by hand.
  store?: import('./adapters').Store;
}

export interface Pointer {
  format: typeof POINTER_FORMAT;
  version: 1;
  campaign: string;
  title: string;
  read: string;
  post: string;
  ping?: string;
  adapters: { store: string; mail: string };
  updated: string;
}

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: 1;
  campaign: string;
  revision: number;
  published: string;
  ruleset: string;
  site: string;
  module: Record<string, unknown>;
  lock: unknown;
  state: Record<string, unknown>;
  receipts: string[];
  private: Record<string, unknown>;
}

export class PublishError extends Error {}

// A Discord mention from what the referee typed: a user id, a role id written @&id, or a mention copied from
// Discord (<@id>, <@!id>, <@&id>). '' for nothing; null when it isn't one.
export function readPing(s: unknown): string | null {
  const t = typeof s === 'string' ? s.trim() : '';
  if (!t) return '';
  if (t === '@here') return '@here'; // everyone in the channel who is online (never @everyone)
  const m = /^<?@?(!|&)?(\d{15,21})>?$/.exec(t);
  return m ? `<@${m[1] === '&' ? '&' : ''}${m[2]}>` : null;
}

const https = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

// The Manual adapter's addresses from the folder the referee uploads to: <folder>snapshot.json and <folder>campaign.json.
export function staticServices(folder: string, post = ''): Services {
  const f = folder.trim().replace(/\/?$/, '/');
  if (!https(f)) throw new PublishError('The folder must be a web address (https) you can upload files to.');
  const p = post.trim();
  if (p && !https(p)) throw new PublishError('The post URL must be a web address (https).');
  return { folder: f, read: new URL('snapshot.json', f).href, post: p, pointer: new URL('campaign.json', f).href };
}

export function pointer(campaign: string, title: string, s: Services, now = new Date()): Pointer {
  return {
    format: POINTER_FORMAT,
    version: 1,
    campaign,
    title,
    read: s.read,
    post: s.post,
    ...(s.ping ? { ping: s.ping } : {}),
    adapters: { store: s.store && s.store.kind !== 'manual' ? s.store.kind : 'static', mail: s.post ? 'post' : 'manual' },
    updated: now.toISOString()
  };
}

// The state file as players may see it. Everything in it is shared today (parties with their clocks and places, revealed = common knowledge,
// characters); a `private` part and any referee audiences are dropped, so later additions stay off the snapshot.
export function publicState(state: Record<string, unknown>): Record<string, unknown> {
  const { private: _p, referee: _r, ...rest } = state as Record<string, unknown> & { private?: unknown; referee?: unknown };
  const revealed = rest.revealed as Record<string, unknown> | undefined;
  if (revealed && typeof revealed === 'object') rest.revealed = Object.fromEntries(Object.entries(revealed).filter(([k]) => !k.startsWith('ref:')));
  // the party as players see it: who is in it and who plays them, nothing from the sheets themselves
  if (Array.isArray(rest.characters))
    rest.characters = (rest.characters as Record<string, unknown>[])
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => ({ id: c.id, name: typeof c.name === 'string' ? c.name : '', player: typeof c.player === 'string' ? c.player : '' }));
  return rest;
}

// What only one player may read: each character's knowledge part (CHARACTER_FORMAT.md "Knowledge"), addressed to
// that character's player as private[recipient].characters[id].knowledge. Until device keys exist the recipient is
// the character id the invitation names; with keys, each recipient's part is encrypted to them (P3 section 4).
export function privateParts(knowledge: Record<string, unknown>): Record<string, { characters: Record<string, { knowledge: unknown }> }> {
  return Object.fromEntries(Object.entries(knowledge).map(([id, k]) => [id, { characters: { [id]: { knowledge: k } } }]));
}

export function snapshot(
  c: { campaign: string; ruleset: string; site: string; module: Record<string, unknown>; lock: unknown; state: Record<string, unknown>; knowledge?: Record<string, unknown> },
  previous: { revision?: number } | null = null,
  receipts: string[] = [],
  now = new Date()
): Snapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    campaign: c.campaign,
    revision: (previous?.revision ?? 0) + 1,
    published: now.toISOString(),
    ruleset: c.ruleset,
    site: c.site,
    module: c.module,
    lock: c.lock,
    state: publicState(c.state),
    receipts,
    private: privateParts(c.knowledge ?? {})
  };
}

// Reading them back (a player's Companion): anything missing or newer is refused with a message for the reader.
export function readPointer(d: unknown): Pointer {
  const p = d as Partial<Pointer> | null;
  if (!p || typeof p !== 'object' || p.format !== POINTER_FORMAT) throw new PublishError("That link isn't a Hexmarch campaign.");
  if (typeof p.version !== 'number' || p.version > 1) throw new PublishError('That campaign was published by a newer app. Update the app to open it.');
  if (typeof p.campaign !== 'string' || !p.campaign || typeof p.read !== 'string' || !https(p.read)) throw new PublishError('That campaign link has no snapshot address.');
  return { format: POINTER_FORMAT, version: 1, campaign: p.campaign, title: typeof p.title === 'string' ? p.title : p.campaign, read: p.read, post: typeof p.post === 'string' ? p.post : '', ...(readPing(p.ping) ? { ping: readPing(p.ping) as string } : {}), adapters: { store: p.adapters?.store ?? 'static', mail: p.adapters?.mail ?? 'manual' }, updated: typeof p.updated === 'string' ? p.updated : '' };
}

export function readSnapshot(d: unknown, campaign: string): Snapshot {
  const s = d as Partial<Snapshot> | null;
  if (!s || typeof s !== 'object' || s.format !== SNAPSHOT_FORMAT) throw new PublishError("That isn't a Hexmarch campaign snapshot.");
  if (typeof s.version !== 'number' || s.version > 1) throw new PublishError('That snapshot was published by a newer app. Update the app to read it.');
  if (s.campaign !== campaign) throw new PublishError(`That snapshot belongs to another campaign (${s.campaign}).`);
  if (!s.module || typeof s.module !== 'object' || !s.state || typeof s.state !== 'object') throw new PublishError('That snapshot has no campaign in it.');
  return { ...(s as Snapshot), revision: Number(s.revision) || 0, receipts: Array.isArray(s.receipts) ? s.receipts : [], private: s.private && typeof s.private === 'object' ? s.private : {} };
}

// What a snapshot needs from the referee's device, read the same way by every app that publishes (Scribe's Publish,
// the Companion's Update campaign), so publishing from either never drops a part. The apps share one site and so
// one IndexedDB (idb-keyval's store); `get` reads a key from it.
//   state:<id>  the campaign state file as it stands now
//   sheets      the Companion's character sheets: each party member's `knowledge` goes to their player alone
//   mail        the Companion's requests: the join requests the referee has answered become the receipts
export async function publishParts(id: string, get: (key: string) => Promise<unknown>): Promise<{ state: Record<string, unknown>; knowledge: Record<string, unknown>; receipts: string[] }> {
  const state = ((await get(`state:${id}`)) ?? {}) as Record<string, unknown>;
  const party = Array.isArray(state.characters) ? (state.characters as { id?: unknown }[]).map((c) => c?.id).filter((x): x is string => typeof x === 'string') : [];
  const sheets = (await get('sheets')) as { id?: unknown; knowledge?: unknown }[] | undefined;
  const knowledge: Record<string, unknown> = {};
  for (const s of Array.isArray(sheets) ? sheets : []) if (s && typeof s.id === 'string' && party.includes(s.id)) knowledge[s.id] = Array.isArray(s.knowledge) ? s.knowledge : [];
  const mail = (await get('mail')) as { box?: string; answer?: unknown; envelope?: { id?: unknown; kind?: string; campaign?: string } }[] | undefined;
  const receipts = (Array.isArray(mail) ? mail : [])
    .filter((m) => m && m.box === 'in' && m.answer && m.envelope?.kind === 'join' && m.envelope.campaign === id && typeof m.envelope.id === 'string')
    .map((m) => m.envelope!.id as string);
  return { state, knowledge, receipts };
}

// Did the upload land? (Heph 2026-11-09: a Test button beside the folder.) Fetches campaign.json and snapshot.json from
// the folder, bypassing the cache, and compares each with the file the last publish produced. Every app that publishes
// keeps that pair on the device as "published:<id>" so any of them can test it.
export type UploadCheck = 'matches' | 'missing' | 'older' | 'different' | 'unreadable';

export interface UploadReport {
  pointer: UploadCheck;
  snapshot: UploadCheck;
  // The revision found in the folder's snapshot, when it could be read.
  found?: number;
}

export async function checkUpload(
  services: Pick<Services, 'pointer' | 'read'>,
  expected: { pointer: Pointer; snapshot: Snapshot },
  fetcher: typeof fetch = fetch
): Promise<UploadReport> {
  const get = async (url: string): Promise<{ status: 'ok'; data: unknown } | { status: 'missing' | 'unreadable' }> => {
    let res: Response;
    try {
      res = await fetcher(url, { cache: 'no-cache' });
    } catch {
      return { status: 'unreadable' }; // offline, or the host doesn't let other sites read it (CORS)
    }
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'unreadable' };
    try {
      const data = await res.json();
      // the referee's Apps Script answers 200 with {ok: false, error: 'missing'} before the first publish
      if (data && (data as { ok?: unknown }).ok === false && (data as { error?: unknown }).error === 'missing') return { status: 'missing' };
      return { status: 'ok', data };
    } catch {
      return { status: 'unreadable' };
    }
  };
  const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
  const [p, s] = await Promise.all([get(services.pointer), get(services.read)]);
  const pointerCheck: UploadCheck = p.status !== 'ok' ? p.status : same(p.data, expected.pointer) ? 'matches' : 'different';
  if (s.status !== 'ok') return { pointer: pointerCheck, snapshot: s.status };
  const found = Number((s.data as { revision?: unknown })?.revision);
  const snapshotCheck: UploadCheck = same(s.data, expected.snapshot) ? 'matches' : Number.isFinite(found) && found < expected.snapshot.revision ? 'older' : 'different';
  return { pointer: pointerCheck, snapshot: snapshotCheck, ...(Number.isFinite(found) ? { found } : {}) };
}
