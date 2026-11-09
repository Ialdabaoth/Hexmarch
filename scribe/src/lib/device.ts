// Saving a campaign on this device (SCRIBE.md section 1, step 7). The apps hand each other the campaign and play by
// links (below); this device's IndexedDB is only a cache, shared by the three apps because they share one site
// (idb-keyval's "keyval-store" database, as the Companion uses it). Scribe writes:
//   scribe-campaign:<id>  its record of the campaign: module, lockfile, services, published (e9-scribe-campaign/1)
//   state:<id>            the first state file, the one every app reads and writes for that campaign (STATE_FORMAT.md)
//   invitations           the creator's Referee invitation is added to the Companion's list (below)
//   play:<id>             play the Companion sent back by link, for Publish
// A state file already there has been played with, so it is replaced only when the referee says so.

import type { Built } from './campaign';
import type { RootChoice } from './rules';
import { checkUpload, envelope, pointer, publishParts, snapshot, type Envelope, type UploadReport, type Pointer, type Services, type Snapshot } from '../../../engine';

export const SCRIBE_FORMAT = 'e9-scribe-campaign';

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

// Apps talk by links (WORKFLOWS.md, Heph 2026-11-09): the apps hand each other data in e9-mail/1 envelopes after
// "#m=" in a link; this device's storage is only a cache.
//   campaign  Scribe -> Companion: {record, state?}, the saved record (with services and published once it has
//             them) and, when Scribe has just written it, the state file to start play from
//   update    Companion -> Scribe: {state, knowledge, receipts}, the parts Publish needs, as the Companion has them
export function campaignMessage(record: SavedCampaign, state?: unknown, now = new Date()): Envelope {
  return envelope({ campaign: record.id, kind: 'campaign', from: { role: 'referee' }, to: 'referee', body: { record, ...(state ? { state } : {}) } }, now);
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

export async function publishOnDevice(id: string, services: Services, now = new Date()): Promise<{ pointer: Pointer; snapshot: Snapshot; record: SavedCampaign }> {
  const rec = await savedCampaign(id);
  if (!rec) throw new Error('Save the campaign on this device first (step 7).');
  // the same parts the Companion's Update campaign publishes: state, each party member's knowledge, receipts
  const { state, knowledge, receipts } = await playFor(id);
  const snap = snapshot(
    { campaign: id, ruleset: rec.ruleset, site: rec.site, module: rec.manifest as Record<string, unknown>, lock: rec.lock, state, knowledge },
    rec.published ?? null,
    receipts,
    now
  );
  const ptr = pointer(id, String(rec.manifest.title ?? id), services, now);
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
