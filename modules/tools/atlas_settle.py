#!/usr/bin/env python3
"""Settle a module's painted March masters around people, rivers and roads (Heph 2026-11-07). Run once, then paint over.

    python3 -I atlas_settle.py <module dir> <built atlas map.json> [--dry]

Reads the rivers, roads (as atlas_roads.py routed them) and points of interest from a built map.json, and edits the
module's own March masters (<module>/atlas/terrain/*.png, one pixel per 100-ft hex) in place:

1. Towns and forts: no trees inside a radius that depends on the kind of place (SETTLE_R); forest just outside thins to
   light woods (cut-over ground). An anchored encounter map clears its own footprint. Bog, hills and water stay.
2. Rivers: no thick forest on the channel. Small streams get a ragged strip of bankside woods; big lowland rivers get a
   floodplain where open ground and light woods become wet meadow with small pools of bog (the callows), its width
   by river class; riverside forest beyond the bank is left standing.
3. Roads: thick forest along a road thins to light woods; light woods clears to grass on a seeded, patchy roll, more
   often along Roman roads than trails. Roman roads also get a one-hex verge.

Heph chose to bake the result into the masters once (2026-11-07), so his later paint always wins; re-run by hand when
roads or sites change a lot. Every decision is seeded on the global lattice, so a re-run gives the same answer.
--dry prints what would change and writes nothing. CC0 like the rest of the tools.
"""
import glob, json, math, os, sys
import numpy as np
from PIL import Image

MDIR, MAPJ = sys.argv[1], sys.argv[2]; DRY = '--dry' in sys.argv
J = json.load(open(MAPJ)); MOD = json.load(open(os.path.join(MDIR, 'module.json')))
TYPES = [t['id'] for t in J['terrain']['types']]; TID = {t: k + 1 for k, t in enumerate(TYPES)}
COL = {k + 1: tuple(int(t['color'][q:q + 2], 16) for q in (1, 3, 5)) for k, t in enumerate(J['terrain']['types'])}
G, W, F, H, M, B = (TID[t] for t in ('grass', 'woods', 'forest', 'hills', 'mount', 'bog'))
CW = 100 * math.sqrt(3) / 2
SEED = int.from_bytes(MOD['id'].encode()[:8].ljust(8, b'\0'), 'little') & 0xFFFFFFFF

# settlement radius in feet by kind (rank 1 towns are the walled ports and county towns)
SETTLE_R = {'town': 600, 'town1': 900, 'castle': 150, 'abbey': 300}
CUT_RING = 400   # feet of cut-over ground (forest -> light woods) outside the cleared radius
ROAD_CLEAR = {'roman': .8, 'local': .6, 'trail': .35}  # share of a road's light-woods stretches cleared to grass

def nearest(C, R, N):
    off = N // 2; i0 = np.floor_divide(C, N); best = None
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
def hex_round(px, py):
    s = 100 / math.sqrt(3); q = (2 / 3 * px) / s; r = (-1 / 3 * px + math.sqrt(3) / 3 * py) / s
    x, z = q, r; y = -x - z; rx, ry, rz = np.round(x), np.round(y), np.round(z)
    dx, dy, dz = abs(rx - x), abs(ry - y), abs(rz - z)
    fx = (dx > dy) & (dx > dz); fz = ~fx & (dz >= dy)
    rx = np.where(fx, -ry - rz, rx); rz = np.where(fz, -rx - ry, rz)
    col = rx.astype(np.int64); return col, (rz + (col - (col & 1)) // 2).astype(np.int64)

def _hash(i, j, s):
    i = np.asarray(i, np.int64); j = np.asarray(j, np.int64)
    h = (i.astype(np.uint64) * np.uint64(0x9E3779B1) ^ j.astype(np.uint64) * np.uint64(0x85EBCA77) ^ np.uint64((SEED + s * 0x27D4EB2F) & 0xFFFFFFFF)) & np.uint64(0xFFFFFFFF)
    h ^= h >> np.uint64(15); h = (h * np.uint64(0x2C1B3C6D)) & np.uint64(0xFFFFFFFF); h ^= h >> np.uint64(12)
    return h.astype(np.float64) / 4294967296.0
def vnoise(x, y, L, s):  # smooth value noise, cell L feet, 0..1
    gx, gy = x / L, y / L; i, j = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64); fx, fy = gx - i, gy - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = _hash(i, j, s), _hash(i + 1, j, s), _hash(i, j + 1, s), _hash(i + 1, j + 1, s)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy

def trace(lines, C0, R0):
    """Mark the hexes a set of polylines (feet) passes through, in March pixel space."""
    m = np.zeros((1200, 1600), bool)
    for pts in lines:
        p = np.asarray(pts, float)
        if len(p) < 2: continue
        seg = np.diff(p, axis=0); n = np.maximum(1, (np.hypot(*seg.T) / 25).astype(int))
        xs = np.concatenate([np.linspace(a[0], b[0], k, endpoint=False) for a, b, k in zip(p[:-1], p[1:], n)] + [p[-1:, 0]])
        ys = np.concatenate([np.linspace(a[1], b[1], k, endpoint=False) for a, b, k in zip(p[:-1], p[1:], n)] + [p[-1:, 1]])
        C, R = hex_round(xs, ys); px, py = C - C0, R - R0; ok = (px >= 0) & (px < 1600) & (py >= 0) & (py < 1200)
        m[py[ok], px[ok]] = True
    return m
def dilate(m, n):
    for _ in range(n):
        o = m.copy(); o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
        o[1:, 1:] |= m[:-1, :-1]; o[:-1, :-1] |= m[1:, 1:]; o[1:, :-1] |= m[:-1, 1:]; o[:-1, 1:] |= m[1:, :-1]; m = o
    return m
def box_mean(a, n):  # mean over an n x n window (n odd), edges padded
    r = n // 2; p = np.pad(a, r, mode='edge'); c = p.cumsum(0).cumsum(1); c = np.pad(c, ((1, 0), (1, 0)))
    return (c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]) / (n * n)
def grow(m, ft): return dilate(m, int(round(ft / 90))) if ft >= 45 else m

# places to settle, with their radius; anchored encounter maps clear their own footprint
anch = {}
for f in glob.glob(os.path.join(MDIR, 'encounter-maps', '*.json')):
    em = json.load(open(f))
    if em.get('anchor'): anch[em['id']] = max(em['size']) * em.get('grid', {}).get('ft', 5) / 2
places = []
for p in J['pois']:
    k = p.get('kind'); r = SETTLE_R.get('town1' if k == 'town' and p.get('rank') == 1 else k)
    for ptr in p.get('encounter') or []:
        if ptr['map'] in anch: r = max(r or 0, anch[ptr['map']])
    if r: places.append((p['hex'][0], p['hex'][1], r, p['name']))

total = {}
for mj in J['terrain']['marches']:
    path = os.path.join(MDIR, 'atlas', 'terrain', mj['id'] + '.png')
    if not os.path.exists(path): continue
    i, j = mj['i'], mj['j']; Cm, Rm = centre(i, j, 1200); C0, R0 = Cm - 800, Rm - 600
    xs, ys = np.meshgrid(np.arange(1600), np.arange(1200)); C, R = C0 + xs, R0 + ys
    ni, nj = nearest(C, R, 1200); own = (ni == i) & (nj == j)
    own[2:11, 2:13] = False; own[1149:1198, 1533:1598] = False; own[0, 0] = False  # summary blocks in the dead corners
    X, Y = C * CW, (R + .5 * (C & 1)) * 100
    pim = Image.open(path); rgb = np.asarray(pim.convert('RGB')).astype(np.int64)
    key = rgb[..., 0] << 16 | rgb[..., 1] << 8 | rgb[..., 2]; t = np.zeros(key.shape, np.uint8)
    for k, c in COL.items(): t[key == (c[0] << 16 | c[1] << 8 | c[2])] = k
    old = t.copy()
    up = box_mean(((t == H) | (t == M)).astype(float), 15)  # share of hill and mountain within ~700 ft
    low = up < .25
    # 1. towns and forts
    for pc, pr, rad, nm in places:
        dx, dy = (pc - C0), (pr - R0)
        if not (-60 <= dx < 1660 and -60 <= dy < 1260): continue
        px, py = pc * CW, (pr + .5 * (pc & 1)) * 100
        d = np.hypot(X - px, Y - py)
        clear = own & (d <= rad); t[clear & ((t == F) | (t == W))] = G
        ring = own & (d > rad) & (d <= rad + CUT_RING); t[ring & (t == F)] = W
    # 2. rivers
    for rv in J['rivers']:
        cls = rv.get('class', 1); ch = trace([rv['points']], C0, R0)
        if not ch.any(): continue
        bank = grow(ch, 60 + 40 * cls) & own
        t[ch & own & (t == F)] = W
        u = vnoise(X, Y, 600, 31 + cls)
        if cls <= 2:  # streams: a ragged strip of bankside woods
            t[bank & (t == F)] = W; t[bank & (t == G) & (u > .55)] = W
        else:  # rivers: floodplain on low ground
            fp = grow(ch, 150 * (cls - 1)) & own & low
            t[bank & (t == F)] = W
            # wild stays wild (Heph): riverside forest is left alone past the bank; open ground and light woods on the
            # floodplain become callows, wet meadow with pools of bog, in small patches
            v = vnoise(X, Y, 800, 77 + cls)
            ww, wg = fp & (t == W), fp & (t == G)
            t[(ww | wg) & (v < .16)] = B
            t[ww & (v >= .2) & (u < .5)] = G
    # 3. roads
    for rd in J['roads']:
        cls = rd.get('class', 'local'); on = trace([rd['points']], C0, R0)
        if not on.any(): continue
        on = (grow(on, 90) if cls == 'roman' else on) & own
        t[on & (t == F)] = W
        stretch = vnoise(X, Y, 1500, 57) < ROAD_CLEAR[cls]
        t[on & (t == W) & (old != F) & stretch] = G  # woods that was light woods to begin with may clear to grass
    ch_ = own & (t != old)
    if ch_.any():
        for a, b in zip(old[ch_].tolist(), t[ch_].tolist()): total[(TYPES[a - 1], TYPES[b - 1])] = total.get((TYPES[a - 1], TYPES[b - 1]), 0) + 1
        print(mj['id'], int(ch_.sum()), 'hexes')
        if not DRY:
            pal = pim.getpalette() if pim.mode == 'P' else None
            if pal:
                idx = {}
                for k, c in COL.items():
                    for q in range(len(pal) // 3):
                        if tuple(pal[3 * q:3 * q + 3]) == c: idx[k] = q; break
                a = np.asarray(pim).copy()
                for k in np.unique(t[ch_]):
                    if int(k) not in idx: sys.exit(f'{path}: palette has no colour for {TYPES[k - 1]}')
                    a[ch_ & (t == k)] = idx[int(k)]
                out = Image.fromarray(a, 'P'); out.putpalette(pal)
                if 'transparency' in pim.info: out.info['transparency'] = pim.info['transparency']
            else:
                a = np.asarray(pim.convert('RGB')).copy()
                for k in np.unique(t[ch_]): a[ch_ & (t == k)] = COL[int(k)]
                out = Image.fromarray(a, 'RGB')
            out.save(path, optimize=True)
for k, v in sorted(total.items(), key=lambda kv: -kv[1]): print(f'{k[0]:>7} -> {k[1]:<7} {v}')
