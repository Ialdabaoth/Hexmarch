#!/usr/bin/env python3
"""Convert a module's current maps to the E9 Atlas format (modules/ATLAS_FORMAT.md): one map JSON + one PNG per March.

usage: python3 -I atlas_convert.py <module.json> <work dir> <out dir>
  <work dir> is build.py's _work folder after a run with HEXDUMP=1 (world-atlas.json, league/l-*-atlas.json).
Terrain for each 100-ft hex comes from the half-mile League page hex under it where a page exists, otherwise from the
3-mile world hex under it, with seeded 100-ft detail on top (see MIX). Rivers come from the world map's drainage, sites become points of interest, counties become regions.
"""
import glob, json, math, os, re, sys, unicodedata
import numpy as np
from PIL import Image
from shapely.geometry import shape
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dymaxion import Face

MODP, WORK, OUT = sys.argv[1:4]  # optional --real: terrain from real-world data (realmap.py)
MOD = json.load(open(MODP)); MDIR = os.path.dirname(os.path.abspath(MODP))
A = MOD['atlas']
CW = 100 * math.sqrt(3) / 2  # feet between lattice columns
MI_KM = 1.524
LABEL = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ'  # 00-99, then A0..Z9 without I, O, Q

def label(n):
    return f'{n:02d}' if n < 100 else LABEL[10 + (n - 100) // 10] + str(n % 10)

def slug(t):
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')

def hex_round(px, py, s):
    """Nearest flat-top odd-q hex (col, row) to a point, with hex (0, 0) centred at the origin, py pointing down."""
    q = (2 / 3 * px) / s; r = (-1 / 3 * px + math.sqrt(3) / 3 * py) / s
    x, z = q, r; y = -x - z
    rx, ry, rz = np.round(x), np.round(y), np.round(z)
    dx, dy, dz = abs(rx - x), abs(ry - y), abs(rz - z)
    fx = (dx > dy) & (dx > dz); fz = ~fx & (dz >= dy)
    rx = np.where(fx, -ry - rz, rx); rz = np.where(fz, -rx - ry, rz)
    col = rx.astype(np.int64); return col, (rz + (col - (col & 1)) // 2).astype(np.int64)

def nearest(C, R, N):
    """Which (i, j) hex of spacing N (March 1200, League 150, Field 25) owns lattice hex (C, R): nearest centre, ties to higher i then j."""
    off = N // 2; i0 = np.floor_divide(C, N)
    best = None
    for di in (-1, 0, 1, 2):
        i = i0 + di; Cc = N * i; j0 = np.floor_divide(R - off * (i & 1), N)
        for dj in (-1, 0, 1, 2):
            j = j0 + dj; Rc = N * j + off * (i & 1)
            d = 3 * (C - Cc) ** 2 + (2 * (R - Rc) + (C & 1) - (Cc & 1)) ** 2
            if best is None: best = [d, i, j]; continue
            take = (d < best[0]) | ((d == best[0]) & ((i > best[1]) | ((i == best[1]) & (j > best[2]))))
            best = [np.where(take, d, best[0]), np.where(take, i, best[1]), np.where(take, j, best[2])]
    return best[1], best[2]

def centre(i, j, N): return N * i, N * j + (N // 2) * (i & 1)
def ft(C, R): return C * CW, (R + 0.5 * (C & 1)) * 100

face = Face(*A['centroid'][1:3])

# source grids: the 3-mile world map and the half-mile League pages
class Grid:
    def __init__(self, d):
        self.d = d; self.s = d['s']; self.T = np.full((d['ncol'] + 2, d['nrow'] + 2), -1, np.int16)
        for c, r, t, _ in d['hexes']: self.T[c, r] = TID[t]
    def look(self, lat, lon):
        d = self.d; px = lon * d['kx'] - d['X0']; py = d['Y0'] - lat * d['ky']
        c, r = hex_round(px, py, self.s); ok = (c >= 0) & (r >= 0) & (c < d['ncol']) & (r < d['nrow'])
        return np.where(ok, self.T[np.clip(c, 0, d['ncol']), np.clip(r, 0, d['nrow'])], -1)

TYPES = [  # colour, id, name, tile, icon, travel (time multiplier, grass = 1; null = no travel on foot; module.json atlas.travel.terrain overrides)
    ('#dfe8b5', 'grass', 'Grassland', 'bg-green', None, 1), ('#bcd69e', 'woods', 'Light woods', 'bg-green', 'trees', 1),
    ('#9cc28a', 'forest', 'Forest', 'bg-green', 'forest', 1.5), ('#d9c08c', 'hills', 'Hills', 'bg-green', 'hills', 1.5),
    ('#b49a78', 'mount', 'Mountains', 'bg-brown', 'mountains', 2), ('#c9b98f', 'bog', 'Bog', 'bg-grey', 'swamp', 2),
    ('#b9d3e0', 'sea', 'Sea', 'bg-blue', None, None), ('#a3c8dc', 'lake', 'Lake or river', 'bg-blue', None, None)]
# travel (Heph 2026-11-06, ATLAS_FORMAT.md "Travel"): module.json atlas.travel may set the pace, each terrain's time multiplier and the roads'
_tv = MOD['atlas'].get('travel') or {}
TRAVEL = {'pace': {'mi_per_hour': 3, 'hours_per_day': 8, **_tv.get('pace', {})}, 'roads': {'roman': 0.5, 'local': 0.75, 'trail': 1, **_tv.get('roads', {})}}
for k, tv in _tv.get('terrain', {}).items():
    if k not in [t[1] for t in TYPES]: sys.exit(f'module.json atlas.travel.terrain: no terrain type {k!r} (types: {", ".join(t[1] for t in TYPES)})')
    if tv is not None and not (isinstance(tv, (int, float)) and tv > 0): sys.exit(f'module.json atlas.travel.terrain.{k}: a positive number, or null for no travel on foot')
    TYPES = [t[:5] + (tv,) if t[1] == k else t for t in TYPES]
TID = {t[1]: k + 1 for k, t in enumerate(TYPES)}  # palette index; 0 = none
PAL = [0, 0, 0] + [int(t[0][k:k + 2], 16) for t in TYPES for k in (1, 3, 5)]

world = Grid(json.load(open(f'{WORK}/world-atlas.json')))
pages = [Grid(json.load(open(p))) for p in sorted(glob.glob(f'{WORK}/league/l-*-atlas.json'))]
for g in pages: g.cx, g.cy = (float(v) for v in face.forward(*g.d['anchor']))
PAGE_R = 1.75 * 5000  # a League page's own 3-mile hex reaches 1.73 miles from its centre

# 100-ft detail (Heph 2026-11-05: "get the 100ft-level maps working"): the source maps stop at half-mile hexes, so each
# 100-ft hex gets seeded, repeatable detail from value noise on the global lattice (the same hex always gets the same
# answer, across March borders too). Borders between parent hexes are domain-warped so they wander instead of following
# the old hex edges, and each terrain becomes a natural mix (glades in forest, copses in grassland, pools in bog...).
SEED = int.from_bytes(MOD['id'].encode()[:8].ljust(8, b'\0'), 'little') & 0xFFFFFFFF
def _hash(i, j, s):
    h = (i.astype(np.uint64) * np.uint64(0x9E3779B1) ^ j.astype(np.uint64) * np.uint64(0x85EBCA77) ^ np.uint64((SEED + s * 0x27D4EB2F) & 0xFFFFFFFF)) & np.uint64(0xFFFFFFFF)
    h ^= h >> np.uint64(15); h = (h * np.uint64(0x2C1B3C6D)) & np.uint64(0xFFFFFFFF); h ^= h >> np.uint64(12)
    h = (h * np.uint64(0x297A2D39)) & np.uint64(0xFFFFFFFF); h ^= h >> np.uint64(15)
    return h.astype(np.float64) / 4294967296.0
def vnoise(x, y, L, s):  # smooth value noise, cell size L feet
    fx, fy = x / L, y / L; i, j = np.floor(fx), np.floor(fy); u, v = fx - i, fy - j
    u, v = u * u * (3 - 2 * u), v * v * (3 - 2 * v); i, j = i.astype(np.int64), j.astype(np.int64)
    return (_hash(i, j, s) * (1 - u) + _hash(i + 1, j, s) * u) * (1 - v) + (_hash(i, j + 1, s) * (1 - u) + _hash(i + 1, j + 1, s) * u) * v
def fbm(x, y, s, L=1500):
    return .5 * vnoise(x, y, L, s) + .3 * vnoise(x, y, L / 2.6, s + 7) + .2 * vnoise(x, y, L / 7, s + 13)
_q = np.random.default_rng(1).uniform(-3e6, 3e6, (2, 400000)); QS = np.quantile(fbm(_q[0], _q[1], 1), np.linspace(0, 1, 101))
def uni(f): return np.interp(f, QS, np.linspace(0, 1, 101))  # fbm -> about uniform 0..1, so the shares below are true shares
WARP = 900  # feet: how far a border may wander from the source map's hex edge
MIX = {  # parent terrain -> [(share, child)], read in order on a 0..1 noise; the parent keeps the rest
    'grass': [(.07, 'woods'), (.02, 'forest')], 'woods': [(.18, 'grass'), (.17, 'forest')],
    'forest': [(.05, 'grass'), (.13, 'woods')], 'hills': [(.18, 'grass'), (.08, 'woods')],
    'mount': [(.25, 'hills')], 'bog': [(.12, 'grass'), (.08, 'woods')], 'sea': [], 'lake': []}

REAL = None
if '--real' in sys.argv:  # real-world land cover and elevation pushed back to about 1420 (realmap.py) instead of the old hex maps
    import realmap; REAL = realmap.Real(os.path.dirname(MDIR), MOD, face, TID, fbm, uni)

def terrain(C, R):
    x, y = ft(C, R)
    if REAL: lat, lon = face.inverse(x, y); return REAL(C, R, x, y, lat, lon)
    wx, wy = x + (fbm(x, y, 2) - .5) * 2 * WARP, y + (fbm(x, y, 3) - .5) * 2 * WARP
    lat, lon = face.inverse(wx, wy)
    t = world.look(lat, lon); best = np.full(C.shape, PAGE_R ** 2)
    for g in pages:
        d2 = (wx - g.cx) ** 2 + (wy - g.cy) ** 2; near = d2 < best
        if not near.any(): continue
        tt = g.look(lat[near], lon[near]); sel = np.flatnonzero(near)[tt >= 0]
        t.flat[sel] = tt[tt >= 0]; best.flat[sel] = d2.flat[sel]
    t = np.maximum(t, 0).astype(np.uint8); out = t.copy()
    u = uni(fbm(x, y, 4, 700))  # the mix noise: patches a few hundred feet across
    for pt, mix in MIX.items():
        on = t == TID[pt]; lo = 0.0
        for share, child in mix:  # rare children at the high end of the noise, so they come in patches, not speckle
            out[on & (u >= 1 - lo - share) & (u < 1 - lo)] = TID[child]; lo += share
    return out

# label origins: the region's top-left March and League, from the module's fixed extent so addresses never shift
lo0, la0, lo1, la1 = A['extent']
edge = np.concatenate([np.linspace(0, 1, 200)] * 4)
elat = np.concatenate([np.full(200, la1), np.full(200, la0), la0 + (la1 - la0) * np.linspace(0, 1, 200), la0 + (la1 - la0) * np.linspace(0, 1, 200)])
elon = np.concatenate([lo0 + (lo1 - lo0) * np.linspace(0, 1, 200)] * 2 + [np.full(200, lo0), np.full(200, lo1)])
ex, ey = face.forward(elat, elon); eC, eR = hex_round(ex, ey, 100 / math.sqrt(3))
mi, mj = nearest(eC, eR, 1200); li, lj = nearest(eC, eR, 150)
M0, L0 = (int(mi.min()), int(mj.min())), (int(li.min()), int(lj.min()))

# which Marches: every one that holds a 3-mile world hex inside the module's counties
wd = world.d; ins = [(c, r) for c, r, t, i in wd['hexes'] if i]
wx = np.array([wd['X0'] + c * wd['w'] for c, r in ins]); wy = np.array([wd['Y0'] - r * wd['h'] - (wd['h'] / 2 if c % 2 else 0) for c, r in ins])
hx, hy = face.forward(wy / wd['ky'], wx / wd['kx']); hC, hR = hex_round(hx, hy, 100 / math.sqrt(3))
marches = sorted(set(zip(*(a.tolist() for a in nearest(hC, hR, 1200)))))

os.makedirs(f'{OUT}/terrain', exist_ok=True)
xs, ys = np.meshgrid(np.arange(1600), np.arange(1200))
IMG, OWN, CNT, MASTER = {}, {}, {150: {}, 25: {}}, set()
def master(path):
    """A March PNG from the module (modules/<id>/atlas/terrain/<march>.png), read by colour as ATLAS_FORMAT.md says."""
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(np.int64); key = a[..., 0] << 16 | a[..., 1] << 8 | a[..., 2]
    out = np.zeros(key.shape, np.uint8)
    for k, t in enumerate(TYPES): out[key == int(t[0][1:], 16)] = k + 1
    return out
for (i, j) in marches:  # pass 1: each March's own hexes, and terrain counts per League and Field (which can straddle Marches)
    Cm, Rm = centre(i, j, 1200); C = Cm - 800 + xs; R = Rm - 600 + ys
    ni, nj = nearest(C, R, 1200); own = (ni == i) & (nj == j)
    mp = f"{MDIR}/atlas/terrain/{label(i - M0[0]) + label(j - M0[1])}.png"
    if os.path.exists(mp): img = master(mp); MASTER.add((i, j))  # the module's own painted map wins over anything generated
    else: img = np.zeros((1200, 1600), np.uint8); img[own] = terrain(C[own], R[own])
    IMG[i, j], OWN[i, j] = img, own
    for N in CNT:
        ui, uj = nearest(C[own], R[own], N); t = img[own].astype(np.int64)
        keys, inv = np.unique(np.stack([ui, uj], 1), axis=0, return_inverse=True)
        cnt = np.bincount(inv.ravel() * 256 + t, minlength=len(keys) * 256).reshape(-1, 256)
        for k, c in zip(map(tuple, keys.tolist()), cnt): CNT[N][k] = CNT[N].get(k, 0) + c
def top(c):  # most common terrain, not counting "none"
    c = c.copy(); c[0] = 0; return int(c.argmax()) if c.any() else 0
MJ = []
for (i, j) in marches:  # pass 2: summaries in the dead corners, then save
    Cm, Rm = centre(i, j, 1200); img, own = IMG[i, j], OWN[i, j]
    for N, (bx, by, bw, bh, du, dv) in ((150, (2, 2, 11, 9, 5, 4)), (25, (1533, 1149, 65, 49, 32, 24))):
        if (i, j) in MASTER: break  # a master keeps its own (perhaps hand-painted) summaries
        img[0, 0] = top(np.bincount(img[own], minlength=256))
        ci, cj = (int(v) for v in nearest(np.array(Cm), np.array(Rm), N))
        for v in range(bh):
            for u in range(bw):
                k = (ci - du + u, cj - dv + v); kc = centre(*k, N)
                mine = tuple(int(q) for q in nearest(np.array(kc[0]), np.array(kc[1]), 1200)) == (i, j)
                img[by + v, bx + u] = top(CNT[N][k]) if mine and k in CNT[N] else 0
    mid = label(i - M0[0]) + label(j - M0[1])
    im = Image.fromarray(img, 'P'); im.putpalette(PAL); im.save(f'{OUT}/terrain/{mid}.png', optimize=True)
    MJ.append(dict(id=mid, i=i, j=j, png=f'terrain/{mid}.png'))
    print('March', mid, (i, j), f'{os.path.getsize(f"{OUT}/terrain/{mid}.png") // 1024} KB')

def to_ft(lat, lon):
    x, y = face.forward(lat, lon); return np.round(x).astype(int), np.round(y).astype(int)

# rivers: the world map's drainage chains, named from the module's river labels
rivers = []
for rv in wd['rivers']:
    p = np.array(rv['points']); x, y = to_ft(p[:, 1], p[:, 0])
    rivers.append(dict(name=None, **{'class': int(min(5, max(1, round(rv['width']))))}, points=np.stack([x, y], 1).tolist()))
labels = {}
for reg in MOD['regions'].values():
    for nm, la, lo in reg.get('rivers', []): labels.setdefault(nm, (la, lo))
for nm, (la, lo) in labels.items():
    x, y = to_ft(la, lo); best = None
    for k, rv in enumerate(rivers):
        if rv['name']: continue
        d = min((px - x) ** 2 + (py - y) ** 2 for px, py in rv['points'])
        if d < (3 * 5000) ** 2 and (best is None or d < best[0]): best = (d, k)
    if best: rivers[best[1]]['name'] = nm
for rv in rivers:
    if rv['name'] is None: del rv['name']

# regions: the module's counties
adm = json.load(open(os.path.normpath(os.path.join(MDIR, MOD['admin']))))
cty = {f['properties']['name'].replace(' County', ''): shape(f['geometry']) for f in adm['features'] if f['properties'].get('admin') == 'Ireland'}
regions = []
for b in MOD['books']:
    reg = MOD['regions'][b['region']]; g = cty[b['county']].simplify(.003)
    ring = max(getattr(g, 'geoms', [g]), key=lambda q: q.area).exterior.coords
    x, y = to_ft(np.array([c[1] for c in ring]), np.array([c[0] for c in ring])); lp = g.representative_point()
    regions.append(dict(name=reg['title'], kind='county', label=[int(v) for v in to_ft(lp.y, lp.x)], outline=np.stack([x, y], 1).tolist()))

# points of interest: every site in the module, each one whole 100-ft lattice hex (Heph 2026-11-06: a PoI is always a 100-ft hex, no offsets)
S_ICON = {'castle': 'keep', 'town': 'village', 'abbey': 'church', 'tomb': 'stones', 'hill': 'hills', 'cave': 'cave', 'ruin': 'ruins', 'grove': 'great-tree', 'camp': 'community', 'lair': 'hole', 'mist': 'fog', 'dead': 'graveyard'}  # keep in step with hexmap.py
book_of = {}
for b in MOD['books']:
    for k in (b['region'], b.get('detail')):
        if k: book_of.setdefault(k, b['id'])
pois, seen = [], set()
keep = set(marches)
for k, reg in MOD['regions'].items():
    for st in reg.get('sites', []):
        if st[0] in seen: continue
        x, y = face.forward(st[1], st[2]); C, R = hex_round(x, y, 100 / math.sqrt(3))
        if tuple(int(v) for v in nearest(C, R, 1200)) not in keep: continue
        seen.add(st[0])
        p = dict(id=slug(st[0]), name=st[0], kind=st[3], icon=MOD.get('site_icons', {}).get(st[0]) or S_ICON.get(st[3]), hex=[int(C), int(R)])
        if k in book_of: p['book'] = book_of[k]
        if len(st) > 4 and st[4]: p['note'] = st[4]
        if MOD.get('site_encounters', {}).get(st[0]): p['encounter'] = MOD['site_encounters'][st[0]]  # Encounter-map pointers (ENCOUNTER_FORMAT.md section 4)
        pois.append(p)

la, lo = A['centroid'][1:3]
J = {'format': 'e9-atlas/1', 'id': MOD['id'], 'title': MOD['title'], 'names': MOD.get('names', {}),
     'origin': {'projection': 'dymaxion', 'centroid': {'name': A['centroid'][0], 'lat': la, 'lon': lo}, 'x_ft': 0, 'y_ft': 0},
     'labels': {'march': list(M0), 'league': list(L0)},
     'terrain': {'types': [dict(color=c, id=t, name=n, tile=tl, **({'icon': ic} if ic else {}), travel=tv) for c, t, n, tl, ic, tv in TYPES], 'marches': MJ, 'overrides': {}},
     'travel': TRAVEL, 'rivers': rivers, 'roads': [], 'crossings': [], 'regions': regions, 'pois': pois}
json.dump(J, open(f'{OUT}/map.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f"E9 Atlas map: {len(MJ)} Marches, {len(rivers)} rivers, {len(regions)} regions, {len(pois)} POIs, map.json {os.path.getsize(OUT + '/map.json') // 1024} KB -> {OUT}")
