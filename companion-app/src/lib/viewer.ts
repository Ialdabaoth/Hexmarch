// Messages from an embedded module viewer (mm-viewer/1, modules/MODULE_FORMAT.md section 5).
// The viewer is another site's page, so everything it sends is checked before use.

export interface ViewerView {
  type: 'mm-viewer';
  event: 'view';
  module: string;
  hash: string;
  map: string;
  // The page's name and scale, e.g. "Atlas page 12" and "hex 0105".
  title?: string;
  small?: string;
}

// A page picked in the atlas frame (?mode=atlas), for the app to show in its map frame.
export interface ViewerSelect {
  type: 'mm-viewer';
  event: 'select';
  module: string;
  hash: string;
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
// A viewer link: #world, #atlas-7, #p-key--site, #world:0706.
const HASH = /^(#[a-z0-9:-]*)?$/;
const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;

// The map's controls, for an app that draws them below the frame (?tools=host).
export interface ViewerTools {
  type: 'mm-viewer';
  event: 'tools';
  module: string;
  hash?: string;
  lang: string;
  langs: { value: string; label: string }[];
  edges: boolean;
  // Zoom in percent.
  zoom: number;
}

// What's in view on the map, relayed to the key frame (?mode=key), which draws it.
export interface ViewerKey {
  type: 'mm-viewer';
  event: 'key';
  module: string;
  hash: string;
  terrain: unknown[];
  places: unknown[];
  creatures: unknown[];
}

export type ViewerMessage = ViewerView | ViewerSelect | ViewerHex | ViewerTools | ViewerKey;

export function isViewerMessage(d: unknown): d is ViewerMessage {
  const m = d as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || m.type !== 'mm-viewer' || !str(m.module)) return false;
  if (m.event === 'tools') {
    return str(m.lang, 20) && typeof m.edges === 'boolean' && typeof m.zoom === 'number' && Number.isFinite(m.zoom) &&
      Array.isArray(m.langs) && m.langs.length <= 20 && m.langs.every((l) => l && str(l.value, 20) && str(l.label, 60));
  }
  if (!str(m.hash) || !HASH.test(m.hash)) return false;
  if (m.event === 'select') return true;
  if (m.event === 'key') {
    const list = (v: unknown, max: number) => Array.isArray(v) && v.length <= max;
    return list(m.terrain, 20) && list(m.places, 200) && list(m.creatures, 500);
  }
  if (!str(m.map) || !MAP.test(m.map)) return false;
  if (m.event === 'view') return (m.title === undefined || str(m.title)) && (m.small === undefined || str(m.small));
  if (m.event !== 'hex' || !str(m.hex) || !HEX.test(m.hex) || !str(m.scale) || !(m.terrain === null || str(m.terrain))) return false;
  if (m.terrainName !== undefined && m.terrainName !== null && !str(m.terrainName)) return false;
  return Array.isArray(m.sites) && m.sites.length <= 50 && m.sites.every((s) => s && str(s.slug) && str(s.name) && str(s.href));
}
