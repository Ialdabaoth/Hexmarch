// Draws the 3D dice over the app: they tumble in, bounce and settle on the
// values already rolled. The roll itself is decided before this runs.
import {
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture
} from 'three';
import { shape, type DieKind, type Shape, type ShownDie } from './shapes';

const STYLES: Record<'die' | 'tens', { body: string; ink: string }> = {
  die: { body: '#9b3524', ink: '#fdf3dc' },
  tens: { body: '#2b2118', ink: '#e0b55a' }
};

// The player's dice colours (Settings): the body and the numbers. The percentile
// tens die keeps its own colours.
export function setDiceColors(body: string, ink: string) {
  const hex = /^#[0-9a-f]{6}$/i;
  if (!hex.test(body) || !hex.test(ink)) return;
  if (body.toLowerCase() === STYLES.die.body && ink.toLowerCase() === STYLES.die.ink) return;
  STYLES.die = { body: body.toLowerCase(), ink: ink.toLowerCase() };
  for (const [key, t] of textures) {
    if (key.startsWith('tens:') || key.startsWith('tint-')) continue;
    t.dispose();
    textures.delete(key);
  }
}

// Bonus damage dice wear their damage type's colours; any other bonus die is bone.
const TINTS: Record<string, { body: string; ink: string }> = {
  fire: { body: '#d9531e', ink: '#fff4d6' },
  cold: { body: '#9fd8f2', ink: '#0d2c45' },
  lightning: { body: '#f4c430', ink: '#2a1f00' },
  thunder: { body: '#4b2a86', ink: '#f1eaff' },
  poison: { body: '#3f7d2a', ink: '#effbe6' },
  acid: { body: '#a8d64b', ink: '#1d2a05' },
  radiant: { body: '#f6e7b0', ink: '#7a5200' },
  aetheric: { body: '#1f6f8b', ink: '#e8fbff' },
  psychic: { body: '#c23a7a', ink: '#fff0f7' },
  metal: { body: '#9aa1a8', ink: '#16191c' },
  petrification: { body: '#7c746b', ink: '#f7f4ef' },
  bonus: { body: '#ece4d4', ink: '#2b2118' }
};

const SIZE = 0.95; // circumradius of a die, in table units
const ROLL_MS = 1400;
const STAGGER_MS = 70;
const LINGER_MS = 1800;
const FADE_MS = 400;

let renderer: WebGLRenderer | null = null;
let scene: Scene;
let camera: PerspectiveCamera;
let current: Throw | null = null;

const textures = new Map<string, Texture>();
const geometries = new Map<DieKind, BufferGeometry>();

function faceTexture(kind: DieKind, faceIndex: number, tint?: string): Texture {
  const key = `${tint ? `tint-${tint}:` : ''}${kind}:${faceIndex}`;
  let t = textures.get(key);
  if (t) return t;
  const face = shape(kind).faces[faceIndex];
  const style = tint ? TINTS[tint.split(' ')[0]] ?? TINTS.bonus : STYLES[kind === 'tens' ? 'tens' : 'die'];
  const px = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  g.fillStyle = style.body;
  g.fillRect(0, 0, px, px);
  g.fillStyle = style.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const l of face.labels) {
    g.save();
    g.translate(l.u * px, (1 - l.v) * px);
    g.rotate(l.angle);
    g.font = `700 ${Math.round(l.size * px)}px Georgia, 'Times New Roman', serif`;
    // "6." and "9." mark which way up they go.
    const dot = l.text.endsWith('.');
    const text = dot ? l.text.slice(0, -1) : l.text;
    g.fillText(text, 0, 0);
    if (dot) g.fillRect(-l.size * px * 0.25, l.size * px * 0.42, l.size * px * 0.5, Math.max(2, l.size * px * 0.08));
    g.restore();
  }
  t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  textures.set(key, t);
  return t;
}

function geometry(kind: DieKind): BufferGeometry {
  let geo = geometries.get(kind);
  if (geo) return geo;
  const s = shape(kind);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  geo = new BufferGeometry();
  let start = 0;
  s.faces.forEach((f, i) => {
    // Fan of triangles from the first corner.
    for (let k = 1; k < f.corners.length - 1; k++) {
      for (const j of [0, k, k + 1]) {
        pos.push(...s.vertices[f.corners[j]].map((x) => x * SIZE));
        nor.push(...f.normal);
        uv.push(...f.uvs[j]);
      }
    }
    const count = (f.corners.length - 2) * 3;
    geo!.addGroup(start, count, i);
    start += count;
  });
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometries.set(kind, geo);
  return geo;
}

function setup(): boolean {
  if (renderer) return true;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  const el = renderer.domElement;
  el.className = 'dice3d no-print';
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '25',
    display: 'none',
    transition: `opacity ${FADE_MS}ms`
  });
  el.setAttribute('aria-hidden', 'true');
  el.addEventListener('pointerdown', () => current?.skip());
  document.body.appendChild(el);

  scene = new Scene();
  camera = new PerspectiveCamera(22, 1, 0.1, 400);
  scene.add(new HemisphereLight(0xfff6e6, 0x3a2a1c, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  scene.add(sun);
  const table = new Mesh(new PlaneGeometry(60, 60), new ShadowMaterial({ opacity: 0.22 }));
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);
  return true;
}

const UP = new Vector3(0, 1, 0);

// Orientation that leaves `face` on top with its number reading up the screen.
function restingOrientation(s: Shape, face: number): Quaternion {
  const up = new Vector3(...s.up.get(face)!);
  const q = new Quaternion().setFromUnitVectors(up, UP);
  const textUp = s.textUp.get(face);
  let yaw = Math.random() * Math.PI * 2;
  if (textUp) {
    const t = new Vector3(...textUp).applyQuaternion(q);
    // Turning about UP adds to atan2(x, z); straight up the screen is atan2(0, -1) = π.
    yaw = Math.PI - Math.atan2(t.x, t.z);
  }
  return new Quaternion().setFromAxisAngle(UP, yaw).multiply(q);
}

interface Flight {
  mesh: Mesh;
  materials: MeshStandardMaterial[];
  points: Vector3[];
  kept: boolean;
  // Bonus dice pulse in their colour so they stand out from the base dice.
  glow: boolean;
  from: Vector3;
  to: Vector3;
  axis: Vector3;
  spin: number;
  rest: Quaternion;
  delay: number;
  height: number;
}

// Height above the table over a throw: a drop then two smaller bounces.
function bounce(p: number, h: number): number {
  const parts = [
    [0.34, h, true],
    [0.24, h * 0.32, false],
    [0.16, h * 0.1, false],
    [0.26, 0, false]
  ] as const;
  let t = p;
  for (const [d, peak, falling] of parts) {
    if (t <= d) {
      const x = t / d;
      return falling ? peak * (1 - x * x) : peak * 4 * x * (1 - x);
    }
    t -= d;
  }
  return 0;
}

class Throw {
  flights: Flight[] = [];
  start = performance.now();
  landed = false;
  done = false;
  private resolveLanded!: () => void;
  landedPromise = new Promise<void>((r) => (this.resolveLanded = r));
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;

  constructor(dice: ShownDie[]) {
    const { spots, halfDepth } = this.layout(dice.length);
    dice.forEach((d, i) => {
      const s = shape(d.kind);
      const tint = d.tint ? TINTS[d.tint.split(' ')[0]] ?? TINTS.bonus : undefined;
      const materials = s.faces.map(
        (_, fi) =>
          new MeshStandardMaterial({
            map: faceTexture(d.kind, fi, d.tint),
            roughness: 0.45,
            metalness: 0.05,
            transparent: true,
            flatShading: true,
            ...(tint ? { emissive: tint.body, emissiveIntensity: 0 } : {})
          })
      );
      const mesh = new Mesh(geometry(d.kind), materials);
      mesh.castShadow = true;
      scene.add(mesh);
      const to = spots[i];
      const from = new Vector3(to.x * 0.4 + (Math.random() - 0.5) * 3, 0, halfDepth + 3 + Math.random() * 2);
      const dir = new Vector3().subVectors(to, from).setY(0).normalize();
      const axis = new Vector3().crossVectors(UP, dir).add(new Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)).normalize();
      this.flights.push({
        mesh,
        materials,
        points: s.vertices.map((v) => new Vector3(...v).multiplyScalar(SIZE)),
        kept: d.kept,
        glow: !!tint,
        from,
        to,
        axis,
        spin: Math.PI * 2 * (2 + Math.random() * 1.5),
        rest: restingOrientation(s, d.face),
        delay: i * STAGGER_MS,
        height: 2.5 + Math.random() * 1.5
      });
    });
    this.tick = this.tick.bind(this);
    this.frame = requestAnimationFrame(this.tick);
  }

  // Spots on the table in loose rows, and a camera that fits them all.
  private layout(n: number) {
    const w = renderer!.domElement.clientWidth || window.innerWidth;
    const h = renderer!.domElement.clientHeight || window.innerHeight;
    const aspect = w / h;
    const gap = 2.3;
    const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * aspect * 1.4)) || 1));
    const rows = Math.ceil(n / cols);
    const spots: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const c = i % cols;
      spots.push(
        new Vector3(
          (c - (inRow - 1) / 2) * gap + (Math.random() - 0.5) * 0.5,
          0,
          (r - (rows - 1) / 2) * gap + (Math.random() - 0.5) * 0.5 - 0.6
        )
      );
    }
    // Always show at least a 7-unit-wide strip of table so one die isn't huge.
    const needW = Math.max(7, cols * gap + 1.5);
    const needH = Math.max(7 / Math.max(aspect, 0.5), rows * gap + 2.5);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(needH / (2 * tan), needW / (2 * tan * aspect));
    // Straight down, so settled dice show their top faces square on.
    const tilt = 0;
    camera.aspect = aspect;
    camera.position.set(0, dist * Math.cos(tilt), dist * Math.sin(tilt));
    // Looking straight down, "up" on screen is away from the player (-z).
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer!.setSize(w, h, false);
    return { spots, halfDepth: needH / 2 };
  }

  private place(f: Flight, p: number) {
    const ease = 1 - Math.pow(1 - p, 2.2);
    const q = new Quaternion().setFromAxisAngle(f.axis, f.spin * Math.pow(1 - p, 2.4)).multiply(f.rest);
    f.mesh.quaternion.copy(q);
    // Rest on the lowest corner so the die tips over its edges as it turns.
    let low = Infinity;
    for (const v of f.points) low = Math.min(low, v.clone().applyQuaternion(q).y);
    f.mesh.position.set(f.from.x + (f.to.x - f.from.x) * ease, -low + bounce(p, f.height), f.from.z + (f.to.z - f.from.z) * ease);
  }

  tick(now: number) {
    let all = true;
    for (const f of this.flights) {
      const p = this.landed ? 1 : Math.min(1, Math.max(0, (now - this.start - f.delay) / ROLL_MS));
      if (p < 1) all = false;
      this.place(f, p);
      // One slow pulse every two seconds, so tinted dice stand out without flashing.
      if (f.glow) for (const m of f.materials) m.emissiveIntensity = 0.45 + 0.45 * Math.sin(((now - this.start) * Math.PI) / 1000);
      if (p >= 1 && !f.kept) {
        const m = f.materials[0];
        const opacity = Math.max(0.35, m.opacity - 0.05);
        for (const mat of f.materials) mat.opacity = opacity;
      }
    }
    renderer!.render(scene, camera);
    if (all && !this.landed) this.land();
    if (!this.done) this.frame = requestAnimationFrame(this.tick);
  }

  private land() {
    this.landed = true;
    this.resolveLanded();
    renderer!.domElement.style.pointerEvents = 'none';
    this.hideTimer = setTimeout(() => this.hide(), LINGER_MS);
  }

  skip() {
    if (!this.landed) this.land();
  }

  hide() {
    if (current !== this) return this.stop();
    const el = renderer!.domElement;
    el.style.opacity = '0';
    setTimeout(() => {
      if (current === this) el.style.display = 'none';
      this.stop();
    }, FADE_MS);
  }

  stop() {
    this.done = true;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.hideTimer);
    this.resolveLanded();
    for (const f of this.flights) {
      scene.remove(f.mesh);
      for (const m of f.materials) m.dispose();
    }
    this.flights = [];
  }
}

// Shows the dice and resolves once they have settled (or the player taps to skip).
export function throwDice(dice: ShownDie[]): Promise<void> {
  if (!dice.length || !setup()) return Promise.resolve();
  current?.stop();
  const el = renderer!.domElement;
  el.style.display = 'block';
  el.style.opacity = '1';
  el.style.pointerEvents = 'auto';
  current = new Throw(dice);
  return current.landedPromise;
}
