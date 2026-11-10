// Saving a campaign on this device (SCRIBE.md section 1, step 7). The apps hand each other the campaign and play by
// links (below); this device's IndexedDB is only a cache, shared by the three apps because they share one site
// (idb-keyval's "keyval-store" database, as the Companion uses it). Scribe writes:
//   scribe-campaign:<id>  its record of the campaign: module, lockfile, services, published (hexmarch-scribe-campaign/1)
//   state:<id>            the first state file, the one every app reads and writes for that campaign (STATE_FORMAT.md)
//   invitations           the creator's Referee invitation is added to the Companion's list (below)
//   play:<id>             play the Companion sent back by link, for Publish
// A state file already there has been played with, so it is replaced only when the referee says so.

import type { Built } from './campaign';
import type { RootChoice } from './rules';
import { checkUpload, envelope, pointer, publishParts, snapshot, upload, type Envelope, type UploadReport, type Pointer, type Services, type Snapshot } from '../../../engine';

export const SCRIBE_FORMAT = 'hexmarch-scribe-campaign';

export function scribeRecord(built: Built, root: RootChoice, site: string, now = new Date()) {
  return {
    format: SCRIBE_FORMAT,
    version: 1,
    id: String(built.manifest.id),
    site: new URL(site.replace(/\/?$/, '/'), location.href).href,
    ruleset: root.ruleset,
    manifest: built.manifest,
    lock: built.lock,
    saved: now.toISOString()
  };
}

export const campaignLink = (id: string) => `scribe:${id}`;

function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const rq = indexedDB.open('keyval-store');
    rq.onupgradeneeded = () => rq.result.createObjectStore('keyval');
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => no(rq.error);
  });
}

export async function idbGet(key: string): Promise<unknown> {
  const d = await db();
  return new Promise((ok, no) => {
    const r = d.transaction('keyval').objectStore('keyval').get(key);
    r.onsuccess = () => { d.close(); ok(r.result); };
    r.onerror = () => { d.close(); no(r.error); };
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const d = await db();
  return new Promise((ok, no) => {
    const t = d.transaction('keyval', 'readwrite');
    t.objectStore('keyval').put(JSON.parse(JSON.stringify(value)), key);
    t.oncomplete = () => { d.close(); ok(); };
    t.onerror = () => { d.close(); no(t.error); };
  });
}

// Invitations (SCRIBE.md step 7 "Ready", Heph 2026-11-09): the Companion keeps every invitation on this device
// under "invitations", a list of {id, url, role: "referee" | "player", character?, name?, added}, one entry per
// campaign and role in its campaign switcher. A ready campaign gets a Referee invitation for whoever made it.
export interface Invitation {
  id: string;
  url: string;
  role: 'referee' | 'player';
  character?: string;
  name?: string;
  added: string;
}

export function withRefereeInvitation(list: unknown, url: string, name: string, now = new Date(), newId = () => crypto.randomUUID()): Invitation[] {
  const all = Array.isArray(list) ? (list as Invitation[]) : [];
  if (all.some((i) => i && i.url === url && i.role === 'referee')) return all;
  return [...all, { id: newId(), url, role: 'referee', name, added: now.toISOString() }];
}

// Saves the campaign and the creator's Referee invitation; asks before replacing a state file that is already
// on this device. Returns the campaign's link, and the state file when Scribe wrote one (the Companion starts from it).
export interface Saved {
  link: string;
  wroteState: boolean;
}
export async function saveOnDevice(built: Built, root: RootChoice, site: string, replaceState: (revision: number) => boolean): Promise<Saved> {
  const rec = scribeRecord(built, root, site);
  const link = campaignLink(rec.id);
  const kept = await savedCampaign(rec.id); // keep services and published from an earlier save
  await idbSet(`scribe-campaign:${rec.id}`, kept ? { ...kept, ...rec } : rec);
  const had = (await idbGet(`state:${rec.id}`)) as { revision?: number } | undefined;
  const wroteState = !had || replaceState(Number(had.revision) || 0);
  if (wroteState) await idbSet(`state:${rec.id}`, built.state);
  await idbSet('invitations', withRefereeInvitation(await idbGet('invitations'), link, String(built.manifest.title ?? rec.id)));
  return { link, wroteState };
}

// Apps talk by links (WORKFLOWS.md, Heph 2026-11-09): the apps hand each other data in hexmarch-mail/1 envelopes after
// "#m=" in a link; this device's storage is only a cache.
//   campaign  Scribe -> Companion: {record, state?}, the saved record (with services and published once it has
//             them) and, when Scribe has just written it, the state file to start play from
//   update    Companion -> Scribe: {state, knowledge, receipts}, the parts Publish needs, as the Companion has them
// `invite` (from the Atlas's party builder): the Companion opens Invite a player for that party.
export function campaignMessage(record: SavedCampaign, state?: unknown, invite?: { party: string }, now = new Date()): Envelope {
  return envelope({ campaign: record.id, kind: 'campaign', from: { role: 'referee' }, to: 'referee', body: { record, ...(state ? { state } : {}), ...(invite ? { invite } : {}) } }, now);
}

export interface Play {
  state: Record<string, unknown>;
  knowledge: Record<string, unknown>;
  receipts: string[];
  at: string;
}
const revisionOf = (s: unknown) => Number((s as { revision?: number } | null)?.revision) || 0;

// Applies an "update" envelope: keeps it as play:<id> unless play already there is newer. Each envelope is applied
// once (the ids go under "applied", shared with the Companion). Returns what happened, for the page to say.
export type UpdateResult = { status: 'applied' | 'older' | 'repeat'; campaign: string; revision: number; title?: string };
export async function applyUpdate(e: Envelope): Promise<UpdateResult> {
  if (e.kind !== 'update') throw new Error(`Scribe can't use a "${e.kind}" message.`);
  const b = e.body as Partial<Play>;
  if (!b.state || typeof b.state !== 'object') throw new Error('That update has no play state in it.');
  const rec = await savedCampaign(e.campaign);
  const base = { campaign: e.campaign, revision: revisionOf(b.state), ...(rec ? { title: String(rec.manifest.title ?? e.campaign) } : {}) };
  const applied = ((await idbGet('applied')) as string[] | undefined) ?? [];
  if (applied.includes(e.id)) return { ...base, status: 'repeat' };
  const had = (await idbGet(`play:${e.campaign}`)) as Play | undefined;
  const newer = !had || revisionOf(b.state) >= revisionOf(had.state);
  if (newer) await idbSet(`play:${e.campaign}`, { state: b.state, knowledge: b.knowledge ?? {}, receipts: Array.isArray(b.receipts) ? b.receipts : [], at: e.sent });
  await idbSet('applied', [...applied, e.id].slice(-500));
  return { ...base, status: newer ? 'applied' : 'older' };
}

// What Publish publishes: the play the Companion last sent by link, or what this device's storage holds when that
// is newer (the three apps still share one site's storage in alpha).
export async function playFor(id: string, get = idbGet): Promise<Omit<Play, 'at'>> {
  const sent = (await get(`play:${id}`)) as Play | undefined;
  const here = await publishParts(id, get);
  return sent && revisionOf(sent.state) >= revisionOf(here.state) ? { state: sent.state, knowledge: sent.knowledge, receipts: sent.receipts } : here;
}

// Steps 8 and 9, Services and Publish (SCRIBE.md section 5). The campaign must be saved on this device first.
// Publish reads the play state as it is now (the Companion and the Atlas may have moved it on since Scribe wrote it),
// with each party member's knowledge and the answered join requests, exactly as the Companion's Update campaign does,
// counts the revision on from the last publish, and records both on Scribe's record, which unlocks Invite in the
// Companion. Until an adapter can upload, the referee uploads the two files into the folder themselves.
export interface SavedCampaign extends ReturnType<typeof scribeRecord> {
  services?: Services;
  published?: { revision: number; at: string };
}

export async function savedCampaign(id: string): Promise<SavedCampaign | null> {
  const r = (await idbGet(`scribe-campaign:${id}`)) as SavedCampaign | undefined;
  return r && r.format === SCRIBE_FORMAT ? r : null;
}

// `deliver` puts the two files where players read them (an adapter's upload) before anything is recorded, so a
// failed upload leaves the campaign as it was.
export async function publishOnDevice(
  id: string,
  services: Services,
  now = new Date(),
  deliver?: (files: { pointer: Pointer; snapshot: Snapshot }) => Promise<unknown>
): Promise<{ pointer: Pointer; snapshot: Snapshot; record: SavedCampaign }> {
  const rec = await savedCampaign(id);
  if (!rec) throw new Error('Save the campaign on this device first.');
  // the same parts the Companion's Update campaign publishes: state, each party member's knowledge, receipts
  const { state, knowledge, receipts } = await playFor(id);
  const snap = snapshot(
    { campaign: id, ruleset: rec.ruleset, site: rec.site, module: rec.manifest as Record<string, unknown>, lock: rec.lock, state, knowledge },
    rec.published ?? null,
    receipts,
    now
  );
  const ptr = pointer(id, String(rec.manifest.title ?? id), services, now);
  if (deliver) await deliver({ pointer: ptr, snapshot: snap });
  const record: SavedCampaign = { ...rec, services, published: { revision: snap.revision, at: snap.published } };
  await idbSet(`scribe-campaign:${id}`, record);
  await idbSet(`published:${id}`, { pointer: ptr, snapshot: snap }); // what the Test button compares the folder with
  return { pointer: ptr, snapshot: snap, record };
}

// The Test button in step 8: is the folder serving what the last publish (here or in the Companion) produced?
export async function testUpload(id: string, services: Services): Promise<UploadReport | null> {
  const last = (await idbGet(`published:${id}`)) as { pointer: Pointer; snapshot: Snapshot } | undefined;
  return last ? checkUpload(services, last) : null;
}

// The adapter's secret (a GitHub token, or the Apps Script's key) stays on this device under its own key, never on
// the campaign record, which travels to the Companion in links. The Companion's Update campaign may read it too.
export const secretKey = (id: string) => `publish-secret:${id}`;
export async function publishSecret(id: string): Promise<string> {
  const v = await idbGet(secretKey(id));
  return typeof v === 'string' ? v : '';
}
export const savePublishSecret = (id: string, secret: string) => idbSet(secretKey(id), secret.trim());

// The embedded Atlas (Preview in Atlas) moves parties on Scribe's own copy of the play state: it is kept as
// play:<id>, with the knowledge and receipts Publish would send, so Publish sees it even across browser profiles.
export async function savePlayState(id: string, state: Record<string, unknown>, now = new Date()): Promise<void> {
  const p = await playFor(id);
  await idbSet(`play:${id}`, { ...p, state, at: now.toISOString() });
}

// Publishing again without the page (Heph 2026-11-10: Scribe is the only publisher; after the first, deliberate
// Publish, what players need is published by itself): for an Update link from the Companion and for parties changed
// in the embedded Atlas. Uses the campaign's own adapter and the key kept on this device; never My Own Host, which
// can't upload. The answer is what Scribe shows, and what goes back to the Companion as a 'published' message.
export type PublishResult = { ok: true; revision: number; at: string } | { ok: false; error: string; firstPublish?: true };
export async function publishAgain(id: string, now = new Date(), f: typeof fetch = fetch): Promise<PublishResult> {
  const rec = await savedCampaign(id);
  if (!rec) return { ok: false, error: "Scribe on this device doesn't have this campaign. Build it in Scribe first." };
  if (!rec.published || !rec.services) return { ok: false, firstPublish: true, error: 'Publish the campaign once in Scribe first.' };
  const store = rec.services.store;
  if (!store || store.kind === 'manual') return { ok: false, error: 'This campaign lives on your own host, so publish it from Scribe and upload the files by hand.' };
  const secret = await publishSecret(id);
  try {
    const out = await publishOnDevice(id, rec.services, now, (x) =>
      upload(store, secret, { 'campaign.json': x.pointer, 'snapshot.json': x.snapshot }, `Publish ${String(rec.manifest.title ?? id)}, revision ${x.snapshot.revision}`, f)
    );
    return { ok: true, revision: out.record.published!.revision, at: out.record.published!.at };
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) };
  }
}

export function publishedMessage(id: string, re: string, result: PublishResult, now = new Date()): Envelope {
  return envelope({ campaign: id, kind: 'published', from: { role: 'referee' }, to: 'referee', re, body: { ...result } }, now);
}

// Where to return after an Update link: only an address on Scribe's own site (the apps share one), never elsewhere.
export function backUrl(back: unknown, here: string): string | null {
  if (typeof back !== 'string') return null;
  try {
    const u = new URL(back, here);
    return u.origin === new URL(here).origin ? u.href : null;
  } catch {
    return null;
  }
}
