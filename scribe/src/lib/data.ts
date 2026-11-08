// Reads a published module site (mm.json plus each module's built module.json, MODULE_FORMAT.md) for step 2.

export interface SiteModule {
  id: string;
  path: string;
  raw: Record<string, unknown>; // the built manifest, with `version` set to the plain version
  title: string;
  version: string;
  books: { id: string; title: string }[];
  sites: { slug: string; name: string }[];
}

// The built manifest's `version` is a display stamp ("v0.4.11+abc1234 · 2026-11-08"); `semver` (Atlas 0.5.12)
// is the plain one. Older builds have only the stamp, so take the version out of it.
export function plainVersion(m: Record<string, unknown>): string {
  if (typeof m.semver === 'string') return m.semver;
  const v = String(m.version ?? '').replace(/^v/, '');
  return v.split(/[+\s]/)[0];
}

export function siteModule(path: string, m: Record<string, unknown>): SiteModule {
  const version = plainVersion(m);
  return {
    id: String(m.id),
    path,
    raw: { ...m, version },
    title: String(m.title ?? m.id),
    version,
    books: Array.isArray(m.books) ? (m.books as { id: string; title: string }[]).map((b) => ({ id: b.id, title: b.title })) : [],
    sites: Array.isArray(m.sites) ? (m.sites as { slug: string; name: string }[]).map((s) => ({ slug: s.slug, name: s.name })) : []
  };
}

export async function loadSite(base: string, fetcher: typeof fetch = fetch): Promise<SiteModule[]> {
  const root = base.endsWith('/') ? base : base + '/';
  const get = async (url: string) => {
    const r = await fetcher(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Could not read ${url} (${r.status}).`);
    return r.json();
  };
  const repo = await get(root + 'mm.json');
  const out: SiteModule[] = [];
  for (const e of repo.modules ?? []) {
    const path = String(e.path ?? e.id).replace(/^\.\//, '').replace(/\/?$/, '/');
    try {
      out.push(siteModule(path, await get(`${root}${path}module.json`)));
    } catch {
      // a module that fails to load is left out of the list; the others still show
    }
  }
  return out;
}
