// Store adapters: where Publish puts campaign.json and snapshot.json, so the referee no longer uploads them by hand
// (Integration sprint 0.6.X; WORKFLOWS.md "Services and adapters", job Store). Free services only.
//
//   manual       the referee downloads both files and uploads them to a static folder (the old way, kept as fallback)
//   github       the referee's own public GitHub repo, written through the GitHub API with a fine-grained token that
//                may only change that one repo; players read the files from raw.githubusercontent.com (no Pages setup)
//   apps-script  the referee's own Google Apps Script web app (script below), which keeps the files in a Drive folder
//                of theirs and serves them back; no Google Cloud project or OAuth client (WORKFLOWS.md, Heph 2026-11-08)
//
// The referee half signs in (a token or the script's key); the player half only ever fetches URLs. The secret is
// kept apart from the campaign record (key "publish-secret:<id>") so it never travels in links between apps.

import { PublishError, type Services } from './publish';

export type StoreKind = 'manual' | 'github' | 'apps-script';

export interface GithubStore {
  kind: 'github';
  owner: string;
  repo: string;
  branch: string;
  // A folder inside the repo, '' for its root; one repo can hold several campaigns.
  dir: string;
}
export interface AppsScriptStore {
  kind: 'apps-script';
  // The web app's /exec address.
  url: string;
}
export interface ManualStore {
  kind: 'manual';
  folder: string;
}
export type Store = ManualStore | GithubStore | AppsScriptStore;

const FILES = ['campaign.json', 'snapshot.json'] as const;
export type FileName = (typeof FILES)[number];

const slug = (s: string) => /^[A-Za-z0-9._-]+$/.test(s);

// "owner/repo" or a github.com address, plus an optional folder.
export function githubStore(repo: string, dir = '', branch = 'main'): GithubStore {
  const m = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '').split('/');
  if (m.length !== 2 || !slug(m[0]) || !slug(m[1])) throw new PublishError('Give the repository as owner/name, for example heph/kells-1422.');
  const d = dir.trim().replace(/^\/+|\/+$/g, '');
  if (d && !d.split('/').every(slug)) throw new PublishError('The folder may hold only letters, numbers, dots, dashes and underscores.');
  const b = branch.trim() || 'main';
  if (!/^[A-Za-z0-9._/-]+$/.test(b)) throw new PublishError("That branch name won't work.");
  return { kind: 'github', owner: m[0], repo: m[1], branch: b, dir: d };
}

export function appsScriptStore(url: string): AppsScriptStore {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new PublishError("That isn't a web address.");
  }
  if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || !/\/exec$/.test(u.pathname))
    throw new PublishError('Use the web app address Apps Script gives you when you deploy: https://script.google.com/macros/s/…/exec');
  return { kind: 'apps-script', url: u.origin + u.pathname };
}

// Where players read each file.
export function fileUrl(store: Store, name: FileName): string {
  switch (store.kind) {
    case 'manual':
      return new URL(name, store.folder.replace(/\/?$/, '/')).href;
    case 'github':
      return `https://raw.githubusercontent.com/${store.owner}/${store.repo}/${store.branch}/${store.dir ? store.dir + '/' : ''}${name}`;
    case 'apps-script':
      return `${store.url}?file=${name}`;
  }
}

// The addresses the pointer and invitations carry. `folder` stays for the Manual adapter and as a label.
export function servicesFor(store: Store, post = ''): Services & { store: Store } {
  const p = post.trim();
  if (p && !/^https:\/\//.test(p)) throw new PublishError('The post URL must be a web address (https).');
  const read = fileUrl(store, 'snapshot.json');
  return { folder: read.replace(/snapshot\.json$/, ''), read, post: p, pointer: fileUrl(store, 'campaign.json'), store };
}



const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export const fileText = (data: unknown) => JSON.stringify(data, null, 1) + '\n';

async function failure(res: Response, what: string): Promise<PublishError> {
  let detail = '';
  try {
    detail = ((await res.json()) as { message?: string; error?: string }).message ?? '';
  } catch {
    // not JSON
  }
  if (res.status === 401) return new PublishError(`${what}: the token was refused. Make a new one (it may have expired).`);
  if (res.status === 403 || res.status === 404)
    return new PublishError(`${what}: GitHub said ${res.status}${detail ? ` (${detail})` : ''}. Check the repository name, and that the token may change its contents.`);
  return new PublishError(`${what}: GitHub said ${res.status}${detail ? ` (${detail})` : ''}.`);
}

// Writes both files in one commit's worth of calls (one call per file: the Contents API).
async function githubPut(store: GithubStore, token: string, files: Record<FileName, unknown>, message: string, f: typeof fetch): Promise<void> {
  const headers = { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  for (const name of FILES) {
    const path = `${store.dir ? store.dir + '/' : ''}${name}`;
    const api = `https://api.github.com/repos/${store.owner}/${store.repo}/contents/${path}`;
    const had = await f(`${api}?ref=${encodeURIComponent(store.branch)}`, { headers, cache: 'no-store' });
    if (!had.ok && had.status !== 404) throw await failure(had, `Reading ${name}`);
    const sha = had.ok ? ((await had.json()) as { sha?: string }).sha : undefined;
    const res = await f(api, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: b64(fileText(files[name])), branch: store.branch, ...(sha ? { sha } : {}) })
    });
    if (!res.ok) throw await failure(res, `Writing ${name}`);
  }
}

// Apps Script answers a POST with a redirect to googleusercontent.com, which fetch follows. A text/plain body keeps
// the browser from sending a preflight request, which Apps Script can't answer.
async function appsScriptPut(store: AppsScriptStore, key: string, files: Record<FileName, unknown>, f: typeof fetch): Promise<void> {
  let res: Response;
  try {
    res = await f(store.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'publish', key: key.trim(), files: Object.fromEntries(FILES.map((n) => [n, fileText(files[n])])) })
    });
  } catch {
    throw new PublishError("Couldn't reach your Apps Script. Check that it is deployed with access for Anyone.");
  }
  let out: { ok?: boolean; error?: string } = {};
  try {
    out = await res.json();
  } catch {
    throw new PublishError("Your Apps Script answered, but not as Hexmarch's script does. Deploy the script Scribe gives you, with access for Anyone.");
  }
  if (!out.ok) throw new PublishError(out.error === 'key' ? "Your Apps Script didn't accept the key. Copy the key from the script's KEY line again." : `Your Apps Script said: ${out.error ?? 'no'}`);
}

// Puts both files where players read them. Returns false for the Manual adapter, whose files the referee uploads.
export async function upload(store: Store, secret: string, files: Record<FileName, unknown>, message = 'Publish campaign', f: typeof fetch = fetch): Promise<boolean> {
  if (store.kind === 'manual') return false;
  if (!secret.trim()) throw new PublishError(store.kind === 'github' ? 'Paste your GitHub token first.' : "Paste your script's key first.");
  if (store.kind === 'github') await githubPut(store, secret, files, message, f);
  else await appsScriptPut(store, secret, files, f);
  return true;
}

// A fresh key for a new Apps Script: the referee pastes it into the script's KEY line.
export function newKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

// The referee's Apps Script (Code.gs). Deployed as a web app, executing as the referee, with access for Anyone.
// GET ?file=campaign.json|snapshot.json serves a published file; POST {action:'publish', key, files} replaces them.
// Files live in the Drive folder "Hexmarch campaigns/<script id>". A later version adds join requests (the post URL).
export function appsScriptCode(key: string): string {
  return `// Hexmarch publisher: keeps your campaign's published files in your Google Drive and serves them to players.
// Licence CC BY 4.0. Deploy > New deployment > Web app: Execute as Me, Who has access: Anyone.
const KEY = '${key}';
const FILES = ['campaign.json', 'snapshot.json'];

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('folder');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const top = DriveApp.getFoldersByName('Hexmarch campaigns');
  const parent = top.hasNext() ? top.next() : DriveApp.createFolder('Hexmarch campaigns');
  const f = parent.createFolder(ScriptApp.getScriptId());
  props.setProperty('folder', f.getId());
  return f;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const name = e && e.parameter && e.parameter.file;
  if (FILES.indexOf(name) < 0) return json_({ ok: true, app: 'hexmarch-publisher', version: 1 });
  const it = folder_().getFilesByName(name);
  if (!it.hasNext()) return json_({ ok: false, error: 'missing' });
  return ContentService.createTextOutput(it.next().getBlob().getDataAsString('UTF-8')).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: 'not JSON' }); }
  if (body.key !== KEY) return json_({ ok: false, error: 'key' });
  if (body.action !== 'publish') return json_({ ok: false, error: 'unknown action' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const f = folder_();
    FILES.forEach(function (name) {
      const text = body.files && body.files[name];
      if (typeof text !== 'string') return;
      const it = f.getFilesByName(name);
      if (it.hasNext()) it.next().setContent(text);
      else f.createFile(name, text, 'application/json');
    });
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
`;
}
