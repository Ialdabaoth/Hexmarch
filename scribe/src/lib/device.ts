// Saving a campaign on this device for the Companion and the Atlas (SCRIBE.md section 1, step 7; Scribe 0.1.3).
// The three apps share one site, so they share its IndexedDB: the Companion keeps its files in idb-keyval's
// "keyval-store" database, and so does this. Scribe writes two keys there:
//   scribe-campaign:<id>  the campaign module and lockfile (format e9-scribe-campaign/1), which the Companion opens
//                         by the link "scribe:<id>" (Companion 0.5.14)
//   state:<id>            the first state file, the one every app reads and writes for that campaign (STATE_FORMAT.md)
// A state file already there has been played with, so it is replaced only when the referee says so.

import type { Built } from './campaign';
import type { RootChoice } from './rules';

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

// Saves the campaign; asks before replacing a state file that is already on this device. Returns the campaign's link.
export async function saveOnDevice(built: Built, root: RootChoice, site: string, replaceState: (revision: number) => boolean): Promise<string> {
  const rec = scribeRecord(built, root, site);
  await idbSet(`scribe-campaign:${rec.id}`, rec);
  const had = (await idbGet(`state:${rec.id}`)) as { revision?: number } | undefined;
  if (!had || replaceState(Number(had.revision) || 0)) await idbSet(`state:${rec.id}`, built.state);
  return campaignLink(rec.id);
}
