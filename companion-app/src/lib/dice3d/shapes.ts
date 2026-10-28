// Polyhedra for the 3D dice, as plain numbers so they can be tested without WebGL.
// Each face says which way is "up" for its number, and which value it shows.

export type Vec = [number, number, number];

export interface Face {
  // Corner indices, counter-clockwise seen from outside.
  corners: number[];
  normal: Vec;
  // The value read when this face is on top (for a d4, the corner on top).
  value: number;
  // Labels drawn on the face's texture, in face texture coordinates (0..1, v up).
  labels: { text: string; u: number; v: number; angle: number; size: number }[];
  // Texture coordinates of each corner, matching `corners`.
  uvs: [number, number][];
}

export interface Shape {
  sides: number;
  vertices: Vec[];
  faces: Face[];
  // Direction that points straight up when each value has been rolled, by value.
  up: Map<number, Vec>;
  // Direction the number on the top face reads upward, by value (null for a d4).
  textUp: Map<number, Vec | null>;
}

const PHI = (1 + Math.sqrt(5)) / 2;

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec) => Math.sqrt(dot(a, a));
export const norm = (a: Vec): Vec => scale(a, 1 / len(a));

function signs(...base: number[][]): Vec[] {
  const out: Vec[] = [];
  for (const b of base) {
    for (const sx of b[0] ? [1, -1] : [1])
      for (const sy of b[1] ? [1, -1] : [1])
        for (const sz of b[2] ? [1, -1] : [1]) out.push([b[0] * sx, b[1] * sy, b[2] * sz]);
  }
  return out;
}

// Oriented as the dual of DODECA, so each one gives the face directions of the other.
const ICOSA = signs([0, PHI, 1], [PHI, 1, 0], [1, 0, PHI]);
const DODECA = signs([1, 1, 1], [0, 1 / PHI, PHI], [1 / PHI, PHI, 0], [PHI, 0, 1 / PHI]);
const OCTA = signs([1, 0, 0], [0, 1, 0], [0, 0, 1]);
const CUBE = signs([1, 1, 1]);
const TETRA: Vec[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];

// The corners on the face with this outward normal, in counter-clockwise order.
function cornersFor(vertices: Vec[], normal: Vec): number[] {
  const n = norm(normal);
  const best = Math.max(...vertices.map((v) => dot(v, n)));
  const ids = vertices.map((v, i) => (dot(v, n) > best - 1e-6 ? i : -1)).filter((i) => i >= 0);
  const c = scale(ids.reduce((acc, i) => add(acc, vertices[i]), [0, 0, 0] as Vec), 1 / ids.length);
  const x = norm(sub(vertices[ids[0]], c));
  const y = cross(n, x);
  const angle = (i: number) => {
    const d = sub(vertices[i], c);
    return Math.atan2(dot(d, y), dot(d, x));
  };
  return ids.sort((a, b) => angle(a) - angle(b));
}

// Values for opposite faces add up to sides + 1, like real dice.
function pairedValues(normals: Vec[], sides: number): number[] {
  const values = new Array<number>(normals.length).fill(0);
  let next = 1;
  normals.forEach((n, i) => {
    if (values[i]) return;
    const opposite = normals.findIndex((m, j) => j !== i && !values[j] && dot(norm(m), norm(n)) < -0.999);
    values[i] = next;
    if (opposite >= 0) values[opposite] = sides + 1 - next;
    next++;
  });
  return values;
}

type Labeler = (face: { corners: number[]; normal: Vec; value: number }, frame: Frame) => Face['labels'];

interface Frame {
  center: Vec;
  right: Vec;
  up: Vec;
  size: number;
  uv: (p: Vec) => [number, number];
}

// A flat 2D frame on the face: `up` is the way its number reads.
function frameFor(vertices: Vec[], corners: number[], normal: Vec, upPoint: Vec): Frame {
  const center = scale(corners.reduce((acc, i) => add(acc, vertices[i]), [0, 0, 0] as Vec), 1 / corners.length);
  const toward = sub(upPoint, center);
  const up = norm(sub(toward, scale(normal, dot(toward, normal))));
  const right = cross(up, normal);
  const size = 2 * Math.max(...corners.map((i) => len(sub(vertices[i], center)))) * 1.04;
  const uv = (p: Vec): [number, number] => {
    const d = sub(p, center);
    return [0.5 + dot(d, right) / size, 0.5 + dot(d, up) / size];
  };
  return { center, right, up, size, uv };
}

function underline(text: string, sides: number) {
  return sides >= 8 && (text === '6' || text === '9') ? `${text}.` : text;
}

function build(
  sides: number,
  vertices: Vec[],
  faces: { corners: number[]; normal: Vec; value: number; upPoint: Vec }[],
  labeler: Labeler,
  d4 = false
): Shape {
  const r = Math.max(...vertices.map(len));
  const vs = vertices.map((v) => scale(v, 1 / r));
  const up = new Map<number, Vec>();
  const textUp = new Map<number, Vec | null>();
  const out: Face[] = faces.map((f) => {
    const frame = frameFor(vs, f.corners, f.normal, scale(f.upPoint, 1 / r));
    if (!d4) {
      up.set(f.value, f.normal);
      textUp.set(f.value, frame.up);
    }
    return {
      corners: f.corners,
      normal: f.normal,
      value: f.value,
      labels: labeler(f, frame).map((l) => ({ ...l, text: underline(l.text, sides) })),
      uvs: f.corners.map((i) => frame.uv(vs[i]))
    };
  });
  if (d4) {
    vs.forEach((v, i) => {
      up.set(i + 1, norm(v));
      textUp.set(i + 1, null);
    });
  }
  return { sides, vertices: vs, faces: out, up, textUp };
}

const centered =
  (label: (v: number) => string, size: number): Labeler =>
  (f) => [{ text: label(f.value), u: 0.5, v: 0.5, angle: 0, size }];

function fromNormals(sides: number, vertices: Vec[], normals: Vec[], size: number, edgeUp = false): Shape {
  const values = pairedValues(normals, sides);
  const faces = normals.map((n, i) => {
    const normal = norm(n);
    const corners = cornersFor(vertices, normal);
    // Squares read toward an edge, other faces toward a corner.
    const upPoint = edgeUp ? scale(add(vertices[corners[0]], vertices[corners[1]]), 0.5) : vertices[corners[0]];
    return { corners, normal, value: values[i], upPoint };
  });
  const label = (v: number) => String(v);
  return build(sides, vertices, faces, centered(label, size));
}

function d4(): Shape {
  // Each face shows the number of each corner next to it; the top corner is the roll.
  const faces = TETRA.map((v, i) => {
    const normal = norm(scale(v, -1));
    const corners = cornersFor(TETRA, normal);
    return { corners, normal, value: i + 1, upPoint: TETRA[corners[0]] };
  });
  const labeler: Labeler = (f, frame) =>
    f.corners.map((ci) => {
      const [u, v] = frame.uv(scale(TETRA[ci], 1 / Math.sqrt(3)));
      const du = u - 0.5;
      const dv = v - 0.5;
      return { text: String(ci + 1), u: 0.5 + du * 0.58, v: 0.5 + dv * 0.58, angle: Math.atan2(du, dv), size: 0.2 };
    });
  return build(4, TETRA, faces, labeler, true);
}

// Pentagonal trapezohedron: kite faces meeting at a top and bottom point.
function d10(label: (v: number) => string, size: number): Shape {
  const h = 1.15;
  const c = Math.cos(Math.PI / 5);
  // Ring height that makes each kite flat.
  const e = (h * (1 - c)) / (1 + c);
  const top: Vec = [0, h, 0];
  const bottom: Vec = [0, -h, 0];
  const ring = (k: number, y: number): Vec => [Math.cos((k * Math.PI) / 5), y, Math.sin((k * Math.PI) / 5)];
  const vertices: Vec[] = [top, bottom];
  for (let k = 0; k < 10; k++) vertices.push(ring(k, k % 2 ? -e : e));
  const at = (k: number) => 2 + (((k % 10) + 10) % 10);
  const faces: { corners: number[]; normal: Vec; value: number; upPoint: Vec }[] = [];
  for (let k = 0; k < 5; k++) {
    // Upper kites: top, then even ring corners around an odd one.
    const upper = [0, at(2 * k + 2), at(2 * k + 1), at(2 * k)];
    const lower = [1, at(2 * k + 1), at(2 * k + 2), at(2 * k + 3)];
    for (const [corners, value] of [
      [upper, 2 * k],
      [lower, 9 - 2 * k]
    ] as const) {
      const [a, b, cc] = corners.map((i) => vertices[i]);
      let normal = norm(cross(sub(b, a), sub(cc, a)));
      if (dot(normal, a) < 0) normal = scale(normal, -1);
      faces.push({ corners: dot(cross(sub(b, a), sub(cc, a)), normal) > 0 ? [...corners] : [...corners].reverse(), normal, value, upPoint: vertices[corners[0]] });
    }
  }
  // Numbers sit toward the wide end of each kite.
  const labeler: Labeler = (f) => [{ text: label(f.value), u: 0.5, v: 0.4, angle: 0, size }];
  return build(10, vertices, faces, labeler);
}

// The die shown for each kind of roll. A d100 is a tens d10 plus a units d10.
export type DieKind = 4 | 6 | 8 | 10 | 12 | 20 | 'tens';

const cache = new Map<DieKind, Shape>();

export function shape(kind: DieKind): Shape {
  let s = cache.get(kind);
  if (!s) {
    s =
      kind === 4 ? d4()
      : kind === 6 ? fromNormals(6, CUBE, OCTA, 0.42, true)
      : kind === 8 ? fromNormals(8, OCTA, CUBE, 0.3)
      : kind === 10 ? d10((v) => String(v), 0.3)
      : kind === 'tens' ? d10((v) => `${v}0`, 0.24)
      : kind === 12 ? fromNormals(12, DODECA, ICOSA, 0.3)
      : fromNormals(20, ICOSA, DODECA, 0.24);
    cache.set(kind, s);
  }
  return s;
}

export interface ShownDie {
  kind: DieKind;
  // The face to land on, in the shape's own values (a d10 shows 0-9).
  face: number;
  kept: boolean;
}

// Turns rolled values into dice to show; sizes without a model are left out.
export function diceToShow(dice: { sides: number; value: number; kept: boolean }[], max = 20): ShownDie[] {
  const out: ShownDie[] = [];
  for (const d of dice) {
    if (d.sides === 100) {
      const v = d.value % 100;
      out.push({ kind: 'tens', face: Math.floor(v / 10), kept: d.kept }, { kind: 10, face: v % 10, kept: d.kept });
    } else if (d.sides === 10) {
      out.push({ kind: 10, face: d.value % 10, kept: d.kept });
    } else if ([4, 6, 8, 12, 20].includes(d.sides)) {
      out.push({ kind: d.sides as DieKind, face: d.value, kept: d.kept });
    }
  }
  return out.slice(0, max);
}
