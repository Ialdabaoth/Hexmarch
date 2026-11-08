// Content ids for an adventure module's places (module.json `regions[].sites`), so they can be stitched,
// excluded and patched like any other content: `<module>/site/<slug>`. A place listed in several regions
// (the same castle on the county map and the Leinster maps) is one id; its first listing is used.

import type { Entry } from './content';

// The same slug as the module build (modules/tools/build.py `slug`): accents dropped, lower case, dashes.
export function slug(text: string): string {
  return text.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function siteEntries(manifest: { id: string; regions?: unknown }): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  const regions = manifest.regions && typeof manifest.regions === 'object' ? (manifest.regions as Record<string, { sites?: unknown[] }>) : {};
  for (const [region, r] of Object.entries(regions)) {
    for (const s of r?.sites ?? []) {
      if (!Array.isArray(s) || typeof s[0] !== 'string') continue;
      const id = `${manifest.id}/site/${slug(s[0])}`;
      if (out[id]) continue;
      out[id] = { name: s[0], lat: s[1], lon: s[2], kind: s[3], ...(s[4] !== undefined ? { note: s[4] } : {}), region };
    }
  }
  return out;
}
