// Referee maps: square maps on plain xy cells, and hex maps described by HexJSON.
// Positions are kept in map units (pixels of the drawing) so one token model fits both.

export const SQUARE_CELL = 40;
// Circumradius of a hex, in map units.
export const HEX_RADIUS = 30;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;

export type MapKind = 'square' | 'hex';
export type HexLayout = 'odd-r' | 'even-r' | 'odd-q' | 'even-q';

export interface HexJson {
  layout: HexLayout;
  hexes: Record<string, { q: number; r: number; [key: string]: unknown }>;
  boundaries?: Record<string, unknown>;
}

export interface Token {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface GameMap {
  id: string;
  name: string;
  kind: MapKind;
  // Square maps: size in cells.
  cols: number;
  rows: number;
  // Hex maps: the parsed HexJSON.
  hexjson?: HexJson;
  // A https URL or an image data URL, or '' for none.
  background: string;
  drawGrid: boolean;
  snap: boolean;
  tokens: Token[];
}

export interface Point {
  x: number;
  y: number;
}

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LAYOUTS: HexLayout[] = ['odd-r', 'even-r', 'odd-q', 'even-q'];

// Parses HexJSON text or an already-parsed object. Throws with a readable message
// when the file is not usable, so the referee can see what to fix.
export function parseHexJson(input: string | unknown): HexJson {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new Error('That file is not valid JSON.');
    }
  }
  if (typeof data !== 'object' || data === null) throw new Error('HexJSON must be an object.');
  const { layout, hexes, boundaries } = data as Record<string, unknown>;
  if (typeof layout !== 'string' || !LAYOUTS.includes(layout as HexLayout)) {
    throw new Error(`HexJSON layout must be one of ${LAYOUTS.join(', ')}.`);
  }
  if (typeof hexes !== 'object' || hexes === null) throw new Error('HexJSON needs a "hexes" object.');
  const entries = Object.entries(hexes as Record<string, unknown>);
  if (entries.length === 0) throw new Error('The HexJSON map has no hexes.');
  for (const [key, hex] of entries) {
    const h = hex as { q?: unknown; r?: unknown };
    if (!Number.isInteger(h?.q) || !Number.isInteger(h?.r)) {
      throw new Error(`Hex "${key}" needs whole-number q and r.`);
    }
  }
  return {
    layout: layout as HexLayout,
    hexes: hexes as HexJson['hexes'],
    ...(boundaries && typeof boundaries === 'object' ? { boundaries: boundaries as Record<string, unknown> } : {}),
  };
}

// Only https links and image data URLs are shown as backgrounds.
export function isAllowedBackground(src: string): boolean {
  return src === '' || src.startsWith('https://') || src.startsWith('data:image/');
}

const mod2 = (n: number) => ((n % 2) + 2) % 2;

// Pointy-topped layouts are the odd-r/even-r pair, flat-topped are odd-q/even-q.
export function isPointy(layout: HexLayout): boolean {
  return layout === 'odd-r' || layout === 'even-r';
}

// Centre of a hex in map units. "odd" layouts shift the odd rows (or columns) right
// (or up), "even" layouts shift the even ones.
export function hexCentre(q: number, r: number, layout: HexLayout): Point {
  const shifted = (n: number) => (mod2(n) === (layout.startsWith('odd') ? 1 : 0) ? 0.5 : 0);
  if (isPointy(layout)) {
    return { x: HEX_WIDTH * (q + shifted(r)), y: 1.5 * HEX_RADIUS * r };
  }
  return { x: 1.5 * HEX_RADIUS * q, y: HEX_WIDTH * (r + shifted(q)) };
}

export interface HexCentre extends Point {
  key: string;
  q: number;
  r: number;
}

export function hexCentres(hj: HexJson): HexCentre[] {
  return Object.entries(hj.hexes).map(([key, h]) => ({ key, q: h.q, r: h.r, ...hexCentre(h.q, h.r, hj.layout) }));
}

// The six corners of a hex, as an SVG points string.
export function hexPoints(cx: number, cy: number, pointy: boolean): string {
  const start = pointy ? 30 : 0;
  const corners: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((start + 60 * i) * Math.PI) / 180;
    corners.push(`${(cx + HEX_RADIUS * Math.cos(angle)).toFixed(2)},${(cy + HEX_RADIUS * Math.sin(angle)).toFixed(2)}`);
  }
  return corners.join(' ');
}

// The area a map is drawn in: the square's cells, or the hexes plus a margin.
export function viewOf(map: GameMap): View {
  if (map.kind === 'square') return { x: 0, y: 0, w: map.cols * SQUARE_CELL, h: map.rows * SQUARE_CELL };
  const centres = hexCentres(map.hexjson!);
  const pad = HEX_RADIUS;
  const xs = centres.map((c) => c.x);
  const ys = centres.map((c) => c.y);
  const x0 = Math.min(...xs) - HEX_WIDTH / 2 - pad / 2;
  const y0 = Math.min(...ys) - HEX_RADIUS - pad / 2;
  return { x: x0, y: y0, w: Math.max(...xs) - x0 + HEX_WIDTH / 2 + pad / 2, h: Math.max(...ys) - y0 + HEX_RADIUS + pad / 2 };
}

// Where a token dropped at p lands when snap is on: the centre of its square cell,
// or the centre of the nearest hex.
export function snapPoint(map: GameMap, p: Point): Point {
  if (map.kind === 'square') {
    return { x: (Math.floor(p.x / SQUARE_CELL) + 0.5) * SQUARE_CELL, y: (Math.floor(p.y / SQUARE_CELL) + 0.5) * SQUARE_CELL };
  }
  let best = { x: p.x, y: p.y };
  let bestD = Infinity;
  for (const c of hexCentres(map.hexjson!)) {
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: c.x, y: c.y };
    }
  }
  return best;
}

export function newMap(partial: Pick<GameMap, 'name' | 'kind'> & Partial<GameMap>): GameMap {
  return {
    id: crypto.randomUUID(),
    cols: 24,
    rows: 18,
    background: '',
    drawGrid: true,
    snap: true,
    tokens: [],
    ...partial,
  };
}
