// Open module protocol mm-module/1 (modules/MODULE_FORMAT.md). A repository publishes
// mm.json for discovery, and each module's built manifest sits at <base><id>/module.json,
// next to its viewer at <base><id>/.

export interface RepoEntry {
  id: string;
  path: string;
}

export interface RepoFile {
  format: 'mm-repo/1';
  name: string;
  publisher?: string;
  systems?: string[];
  license?: string;
  modules: RepoEntry[];
}

export interface ModuleBook {
  id: string;
  title: string;
  county?: string;
  region?: string;
  detail?: string;
}

// Only the fields the app shows or needs. The rest of the manifest is kept as it came.
export interface ModuleManifest {
  format: 'mm-module/1';
  id: string;
  title: string;
  version: string;
  license: string;
  books?: ModuleBook[];
  [key: string]: unknown;
}

export interface SavedModule {
  // The published site's base URL, ending in "/", and the module's id within it.
  base: string;
  id: string;
  fetchedAt: number;
  manifest: ModuleManifest;
}

// A link typed by a referee: an https site (or localhost for trying a build), with or
// without the trailing slash, mm.json's own path or a query string.
export function normaliseBase(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('That is not a web address.');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Modules must be published over https.');
  }
  url.search = '';
  url.hash = '';
  let path = url.pathname.replace(/mm\.json$/, '');
  if (!path.endsWith('/')) path += '/';
  url.pathname = path;
  return url.toString();
}

export function moduleUrl(base: string, id: string): string {
  return `${base}${id}/module.json`;
}

export function viewerUrl(base: string, id: string): string {
  return `${base}${id}/`;
}

export function parseRepo(data: unknown): RepoFile {
  const r = data as Partial<RepoFile> | null;
  if (typeof data !== 'object' || data === null) throw new Error('mm.json is not an object.');
  if (r!.format !== 'mm-repo/1') throw new Error('This site is not an MM repository (mm-repo/1).');
  if (!Array.isArray(r!.modules) || r!.modules.length === 0) throw new Error('mm.json lists no modules.');
  for (const m of r!.modules) {
    if (typeof m?.id !== 'string' || !/^[a-z0-9-]+$/.test(m.id)) throw new Error(`Module id "${m?.id}" is not valid.`);
  }
  return r as RepoFile;
}

export function parseModule(data: unknown, id: string): ModuleManifest {
  const m = data as Partial<ModuleManifest> | null;
  if (typeof data !== 'object' || data === null) throw new Error('module.json is not an object.');
  if (m!.format !== 'mm-module/1') throw new Error(`${id} is not an mm-module/1 manifest.`);
  if (m!.id !== id) throw new Error(`module.json says "${m!.id}", but mm.json lists "${id}".`);
  if (typeof m!.title !== 'string' || typeof m!.version !== 'string' || typeof m!.license !== 'string') {
    throw new Error(`${id} needs a title, version and licence.`);
  }
  return m as ModuleManifest;
}

// Fetches a repository and every module it lists. `fetcher` is injectable for tests.
export async function loadRepo(
  input: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<{ base: string; repo: RepoFile; modules: SavedModule[] }> {
  const base = normaliseBase(input);
  const repo = parseRepo(await getJson(fetcher, `${base}mm.json`));
  const modules: SavedModule[] = [];
  for (const entry of repo.modules) {
    const manifest = parseModule(await getJson(fetcher, moduleUrl(base, entry.id)), entry.id);
    modules.push({ base, id: entry.id, fetchedAt: now(), manifest });
  }
  return { base, repo, modules };
}

async function getJson(fetcher: typeof fetch, url: string): Promise<unknown> {
  const res = await fetcher(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not read ${url} (${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url} is not JSON.`);
  }
}
