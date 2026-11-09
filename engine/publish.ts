// Publishing a campaign for its players (data repo modules/SCRIBE.md section 5; WORKFLOWS.md "Invitations").
// Two plain JSON files, written by Scribe's Publish step and again by every "Update campaign" in the Companion:
//   campaign.json  the campaign pointer (e9-campaign-pointer/1): where the campaign lives now; invite links name it
//   snapshot.json  the player snapshot (e9-snapshot/1), at the pointer's read URL: everything a player's app reads

export const POINTER_FORMAT = 'e9-campaign-pointer';
export const SNAPSHOT_FORMAT = 'e9-snapshot';

export interface Services {
  // A folder on a static host the referee uploads to (the Manual adapter, PROPOSALS.md P1), ending in "/".
  folder: string;
  // Where players read the snapshot, and where they send requests ('' until the referee has one).
  read: string;
  post: string;
  // The pointer's own address: what invite links name.
  pointer: string;
}

export interface Pointer {
  format: typeof POINTER_FORMAT;
  version: 1;
  campaign: string;
  title: string;
  read: string;
  post: string;
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
    adapters: { store: 'static', mail: s.post ? 'post' : 'manual' },
    updated: now.toISOString()
  };
}

// The state file as players may see it. Everything in it is shared today (clock, party, revealed = common knowledge,
// session, characters); a `private` part and any referee audiences are dropped, so later additions stay off the snapshot.
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
  if (!p || typeof p !== 'object' || p.format !== POINTER_FORMAT) throw new PublishError("That link isn't an E9 campaign.");
  if (typeof p.version !== 'number' || p.version > 1) throw new PublishError('That campaign was published by a newer app. Update the app to open it.');
  if (typeof p.campaign !== 'string' || !p.campaign || typeof p.read !== 'string' || !https(p.read)) throw new PublishError('That campaign link has no snapshot address.');
  return { format: POINTER_FORMAT, version: 1, campaign: p.campaign, title: typeof p.title === 'string' ? p.title : p.campaign, read: p.read, post: typeof p.post === 'string' ? p.post : '', adapters: { store: p.adapters?.store ?? 'static', mail: p.adapters?.mail ?? 'manual' }, updated: typeof p.updated === 'string' ? p.updated : '' };
}

export function readSnapshot(d: unknown, campaign: string): Snapshot {
  const s = d as Partial<Snapshot> | null;
  if (!s || typeof s !== 'object' || s.format !== SNAPSHOT_FORMAT) throw new PublishError("That isn't an E9 campaign snapshot.");
  if (typeof s.version !== 'number' || s.version > 1) throw new PublishError('That snapshot was published by a newer app. Update the app to read it.');
  if (s.campaign !== campaign) throw new PublishError(`That snapshot belongs to another campaign (${s.campaign}).`);
  if (!s.module || typeof s.module !== 'object' || !s.state || typeof s.state !== 'object') throw new PublishError('That snapshot has no campaign in it.');
  return { ...(s as Snapshot), revision: Number(s.revision) || 0, receipts: Array.isArray(s.receipts) ? s.receipts : [], private: s.private && typeof s.private === 'object' ? s.private : {} };
}
