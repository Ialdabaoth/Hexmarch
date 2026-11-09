// The one envelope every request travels in (data repo modules/WORKFLOWS.md "One envelope", working name hexmarch-mail/1).
// Adapters move envelopes and never read the body: the Manual adapter as a file the player sends and the referee
// opens, a post URL as the body of one POST. Kinds so far:
//   join       player -> referee: a seat's character, asking to join (WORKFLOWS.md "Joining")
//   sent-back  referee -> player: a request returned with a note; the seat stays open
//   campaign   Scribe -> Companion: a campaign's definition (Scribe's record) and the referee's seat
//   update     Companion -> Scribe: what play changed (state, each party member's knowledge, receipts)
// Approval needs no envelope of its own: the request's id appears in the next snapshot's `receipts`, and the
// character in its state's `characters`.

export const MAIL_FORMAT = 'hexmarch-mail';
export const MAIL_KINDS = ['join', 'sent-back', 'campaign', 'update'] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

export interface Envelope {
  format: typeof MAIL_FORMAT;
  version: 1;
  id: string;
  campaign: string;
  kind: MailKind;
  // Who sent it: the referee, or a player by the character their invitation plays and the name they gave.
  from: { role: 'referee' | 'player'; character?: string; name?: string };
  // Who it is for: "referee", or a player's character id.
  to: string;
  // For a reply, the request it answers.
  re?: string;
  body: Record<string, unknown>;
  sent: string;
}

export class MailError extends Error {}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function envelope(e: Omit<Envelope, 'format' | 'version' | 'id' | 'sent'> & { id?: string }, now = new Date()): Envelope {
  return { format: MAIL_FORMAT, version: 1, id: e.id ?? newId(), campaign: e.campaign, kind: e.kind, from: e.from, to: e.to, ...(e.re ? { re: e.re } : {}), body: e.body, sent: now.toISOString() };
}

export function readEnvelope(d: unknown): Envelope {
  const e = d as Partial<Envelope> | null;
  if (!e || typeof e !== 'object' || e.format !== MAIL_FORMAT) throw new MailError("That isn't a message from a Hexmarch app.");
  if (typeof e.version !== 'number' || e.version > 1) throw new MailError('That message was sent by a newer app. Update the app to read it.');
  if (!MAIL_KINDS.includes(e.kind as MailKind)) throw new MailError(`This app can't read a "${String(e.kind)}" message yet.`);
  if (typeof e.id !== 'string' || !e.id || typeof e.campaign !== 'string' || !e.campaign) throw new MailError('That message has no id or campaign.');
  const from = e.from && typeof e.from === 'object' ? e.from : { role: 'player' as const };
  return {
    format: MAIL_FORMAT,
    version: 1,
    id: e.id,
    campaign: e.campaign,
    kind: e.kind as MailKind,
    from: { role: from.role === 'referee' ? 'referee' : 'player', ...(typeof from.character === 'string' ? { character: from.character } : {}), ...(typeof from.name === 'string' ? { name: from.name } : {}) },
    to: typeof e.to === 'string' ? e.to : 'referee',
    ...(typeof e.re === 'string' ? { re: e.re } : {}),
    body: e.body && typeof e.body === 'object' ? e.body : {},
    sent: typeof e.sent === 'string' ? e.sent : ''
  };
}

// Where a request stands, as the player's app sees it: Sent until the referee's next snapshot lists it as received,
// Live once its character is in that snapshot's party list, Sent back when a reply came.
export type RequestStatus = 'sent' | 'received' | 'live' | 'sent-back';

export function requestStatus(e: Pick<Envelope, 'id' | 'from'>, snapshot: { receipts?: string[]; state?: { characters?: unknown } } | null, sentBack = false): RequestStatus {
  const chars = Array.isArray(snapshot?.state?.characters) ? (snapshot!.state!.characters as { id?: unknown }[]) : [];
  if (e.from.character && chars.some((c) => c?.id === e.from.character)) return 'live';
  if (sentBack) return 'sent-back';
  return snapshot?.receipts?.includes(e.id) ? 'received' : 'sent';
}

// ---- Messages as links (WORKFLOWS.md "The Link adapter" and "Apps talk by links") ---------------------------
// The envelope rides in the link's fragment, after "#m=": JSON, deflated (CompressionStream "deflate-raw"), in
// base64url. The fragment never reaches a server. Links between the apps may be long (browsers take about 2 MB);
// a link sent through email or chat stays under LINK_LIMIT bytes, and anything bigger goes by URL or file.

export const LINK_LIMIT = 4096;
export const LINK_KEY = 'm';

const toB64url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeMessage(e: Envelope): Promise<string> {
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(e)), new CompressionStream('deflate-raw')));
}

export async function decodeMessage(data: string): Promise<Envelope> {
  let text: string;
  try {
    text = new TextDecoder().decode(await pipe(fromB64url(data), new DecompressionStream('deflate-raw')));
  } catch {
    throw new MailError("That link is cut short or isn't a message from a Hexmarch app.");
  }
  return readEnvelope(JSON.parse(text));
}

// <app>#m=<data>: appUrl is the other app's address ("https://…/Hexmarch/scribe/"); any fragment it had is replaced.
export async function messageLink(appUrl: string, e: Envelope): Promise<string> {
  return `${appUrl.replace(/#.*$/, '')}#${LINK_KEY}=${await encodeMessage(e)}`;
}

// The message in a page's fragment (location.hash), or null when it carries none.
export async function readMessageHash(hash: string): Promise<Envelope | null> {
  const data = new URLSearchParams(hash.replace(/^#/, '')).get(LINK_KEY);
  return data ? decodeMessage(data) : null;
}
