// Messages from an embedded module viewer (mm-viewer/1, modules/MODULE_FORMAT.md section 5).
// The viewer is another site's page, so everything it sends is checked before use.

export interface ViewerView {
  type: 'mm-viewer';
  event: 'view';
  module: string;
  hash: string;
  map: string;
}

export interface ViewerHex {
  type: 'mm-viewer';
  event: 'hex';
  module: string;
  hash: string;
  map: string;
  hex: string;
  scale: string;
  terrain: string | null;
  // Readable terrain, such as "forest (double travel time)".
  terrainName?: string | null;
  sites: { slug: string; name: string; href: string }[];
}

const MAP = /^[a-z0-9-]{1,80}$/;
const HEX = /^\d{4}$/;
const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;

export function isViewerMessage(d: unknown): d is ViewerView | ViewerHex {
  const m = d as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || m.type !== 'mm-viewer' || !str(m.module) || !str(m.hash) || !str(m.map) || !MAP.test(m.map)) return false;
  if (m.event === 'view') return true;
  if (m.event !== 'hex' || !str(m.hex) || !HEX.test(m.hex) || !str(m.scale) || !(m.terrain === null || str(m.terrain))) return false;
  if (m.terrainName !== undefined && m.terrainName !== null && !str(m.terrainName)) return false;
  return Array.isArray(m.sites) && m.sites.length <= 50 && m.sites.every((s) => s && str(s.slug) && str(s.name) && str(s.href));
}
