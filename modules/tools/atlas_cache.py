#!/usr/bin/env python3
"""E9 Atlas tile cache (ATLAS_FORMAT.md "Tile cache", Atlas 0.4.9): cut a built atlas into small pieces the browser loads near the view.

    python3 -I modules/tools/atlas_cache.py <out>/atlas

Reads <atlas>/map.json and its March PNGs and writes <atlas>/cache/:
  overview.png     one pixel per League over the whole region (the Region and March views; Heph: at most ~100k hexes)
  f/<march>.png    one pixel per Field, one file per March (the League view)
  u/<i>_<j>.png    one pixel per Furlong, one file per League (the Field view)
  h/<i>_<j>.png    one pixel per 100-ft hex, one file per League (the Furlong view)
Each pixel is a palette index: 0 = nothing, k = terrain type k (map.json terrain.types, from 1). A tile holds only the hexes
its March or League owns (nearest centre, ATLAS_FORMAT.md), so neighbouring tiles never disagree.
The March PNGs stay the source of truth; the cache is rebuilt whenever one of them changes (cache/sources.json keeps their hashes).
map.json gains a "cache" block that says where the pieces are and how big each is.
"""
import hashlib, json, os, sys
import numpy as np
from PIL import Image

OVERVIEW_MAX = 100_000  # Heph 2026-11-06: the default view stays under about 100k hexes
LEAGUE, FIELD, FURLONG, MARCH = 150, 25, 5, 1200
# tile rectangles, in each level's own (i, j) grid, around the owning hex: (columns either side, rows above, rows below)
H_TILE = (100, 76, 76)      # 100-ft hexes of a League: 201 x 153
U_TILE = (21, 17, 17)       # Furlongs of a League: 43 x 35


def nearest(C, R, N):
    """Which (i, j) hex of spacing N owns lattice hex (C, R): nearest centre, ties to higher i then j (as atlas_convert.py)."""
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


def groups(i, j):
    """The distinct (i, j) pairs, as an n x 2 array, and which one each element is (np.unique on one packed int64 key: far faster than axis=0)."""
    k, inv = np.unique((i.astype(np.int64) + (1 << 30)) << 32 | (j.astype(np.int64) + (1 << 30)), return_inverse=True)
    return np.stack([(k >> 32) - (1 << 30), (k & 0xFFFFFFFF) - (1 << 30)], 1), inv.ravel()


def centre(i, j, N): return N * i, N * j + (N // 2) * (i & 1)


def main(adir):
    J = json.load(open(os.path.join(adir, 'map.json'), encoding='utf-8'))
    types = J['terrain']['types']; marches = J['terrain']['marches']; nt = len(types) + 1
    pal = [0, 0, 0] + [int(t['color'][k:k + 2], 16) for t in types for k in (1, 3, 5)]
    srcs = {m['id']: hashlib.sha256(open(os.path.join(adir, m['png']), 'rb').read()).hexdigest() for m in marches}
    cdir = os.path.join(adir, 'cache'); sfile = os.path.join(cdir, 'sources.json')
    try: old = json.load(open(sfile))
    except (OSError, ValueError): old = None
    if old and old.get('sources') == srcs and os.path.isfile(os.path.join(cdir, 'overview.png')):  # nothing changed: put the block back (atlas_convert.py rewrites map.json)
        for m in marches: m['t'] = old['t'].get(m['id'], 0)
        J['cache'] = old['cache']; json.dump(J, open(os.path.join(adir, 'map.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(f'atlas cache: {len(marches)} Marches unchanged, cache kept'); return 0

    def read(path):  # palette index per pixel; an RGB picture is read by colour
        im = Image.open(path)
        if im.mode == 'P' and im.getpalette()[:len(pal)] == pal: return np.asarray(im).astype(np.uint8)
        a = np.asarray(im.convert('RGB')).astype(np.int64); key = a[..., 0] << 16 | a[..., 1] << 8 | a[..., 2]; out = np.zeros(key.shape, np.uint8)
        for k, t in enumerate(types): out[key == int(t['color'][1:], 16)] = k + 1
        return out

    def save(a, path):
        im = Image.fromarray(a.astype(np.uint8), 'P'); im.putpalette(pal); im.save(path, optimize=True)

    for sub in ('f', 'u', 'h'): os.makedirs(os.path.join(cdir, sub), exist_ok=True)
    xs, ys = np.meshgrid(np.arange(1600), np.arange(1200))
    LG, HT, UK, UC = {}, {}, [], []  # League summaries, 100-ft tiles, Furlong keys and terrain counts
    for m in marches:
        i, j = m['i'], m['j']; img = read(os.path.join(adir, m['png'])); m['t'] = int(img[0, 0])  # the March's own summary
        Cm, Rm = centre(i, j, MARCH); C = Cm - 800 + xs; R = Rm - 600 + ys
        mi, mj = nearest(C, R, MARCH); own = (mi == i) & (mj == j)
        # League summaries (the 11 x 9 block at 2, 2) and Field summaries (65 x 49 at 1533, 1149), exactly as the browser reads them
        Li, Lj = (int(v) for v in nearest(np.array(Cm), np.array(Rm), LEAGUE)); Fi, Fj = (int(v) for v in nearest(np.array(Cm), np.array(Rm), FIELD))
        for v in range(9):
            for u in range(11):
                k = (Li - 5 + u, Lj - 4 + v); kc = centre(*k, LEAGUE)
                if tuple(int(q) for q in nearest(np.array(kc[0]), np.array(kc[1]), MARCH)) == (i, j) and img[2 + v, 2 + u]: LG[k] = int(img[2 + v, 2 + u])
        f = img[1149:1149 + 49, 1533:1533 + 65].copy()
        fi, fj = np.meshgrid(np.arange(Fi - 32, Fi + 33), np.arange(Fj - 24, Fj + 25)); fc, fr = centre(fi, fj, FIELD)
        f[~np.equal(np.stack(nearest(fc, fr, MARCH)), np.array([i, j])[:, None, None]).all(0)] = 0
        save(f, os.path.join(cdir, 'f', m['id'] + '.png'))
        # 100-ft hexes into their League's tile, and terrain counts per Furlong
        Co, Ro, t = C[own], R[own], img[own]
        li, lj = nearest(Co, Ro, LEAGUE); keys, inv = groups(li, lj)
        order = np.argsort(inv, kind='stable'); cuts = np.searchsorted(inv[order], np.arange(len(keys) + 1))
        for n, (a, b) in enumerate(keys.tolist()):
            sel = order[cuts[n]:cuts[n + 1]]; Cl, Rl = centre(a, b, LEAGUE)
            tile = HT.get((a, b))
            if tile is None: tile = HT[a, b] = np.zeros((H_TILE[1] + H_TILE[2] + 1, 2 * H_TILE[0] + 1), np.uint8)
            u, v = Co[sel] - Cl + H_TILE[0], Ro[sel] - Rl + H_TILE[1]
            assert u.min() >= 0 and v.min() >= 0 and u.max() < tile.shape[1] and v.max() < tile.shape[0], f'League {a},{b}: a 100-ft hex outside its tile'
            tile[v, u] = t[sel]
        ui, uj = nearest(Co, Ro, FURLONG); keys, inv = groups(ui, uj)
        UK.append(keys); UC.append(np.bincount(inv * nt + t, minlength=len(keys) * nt).reshape(-1, nt).astype(np.uint16))
        print(f"atlas cache: March {m['id']}: {len(HT)} League tiles so far")

    # Furlongs: most common terrain among their 100-ft hexes (ties to the lower type), merged across March borders
    K = np.concatenate(UK); Cn = np.concatenate(UC); order = np.lexsort((K[:, 1], K[:, 0])); K, Cn = K[order], Cn[order]
    first = np.r_[True, (K[1:] != K[:-1]).any(1)]; idx = np.flatnonzero(first)
    K = K[idx]; Cn = np.add.reduceat(Cn, idx, axis=0); Cn[:, 0] = 0
    top = np.where(Cn.any(1), Cn.argmax(1), 0).astype(np.uint8)
    uc, ur = centre(K[:, 0], K[:, 1], FURLONG); li, lj = nearest(uc, ur, LEAGUE)
    UT = {}
    for (a, b), (ui, uj), tt in zip(np.stack([li, lj], 1).tolist(), K.tolist(), top.tolist()):
        if not tt: continue
        tile = UT.get((a, b))
        if tile is None: tile = UT[a, b] = np.zeros((U_TILE[1] + U_TILE[2] + 1, 2 * U_TILE[0] + 1), np.uint8)
        Cl, Rl = centre(a, b, LEAGUE); u, v = ui - Cl // FURLONG + U_TILE[0], uj - Rl // FURLONG + U_TILE[1]
        assert 0 <= u < tile.shape[1] and 0 <= v < tile.shape[0], f'League {a},{b}: Furlong {ui},{uj} outside its tile'
        tile[v, u] = tt
    for (a, b), tile in HT.items(): save(tile, os.path.join(cdir, 'h', f'{a}_{b}.png'))
    for (a, b), tile in UT.items(): save(tile, os.path.join(cdir, 'u', f'{a}_{b}.png'))

    # the overview: every League's summary in one picture
    ks = np.array(list(LG)); i0, j0 = (int(v) for v in ks.min(0)); w, h = (int(v) for v in ks.max(0) - ks.min(0) + 1)
    ov = np.zeros((h, w), np.uint8)
    for (a, b), t in LG.items(): ov[b - j0, a - i0] = t
    save(ov, os.path.join(cdir, 'overview.png'))
    if w * h > OVERVIEW_MAX: print(f'atlas cache: warning: the overview is {w} x {h} = {w * h} Leagues, more than {OVERVIEW_MAX}')

    J['cache'] = {'format': 'e9-atlas-cache/1', 'overview': {'png': 'cache/overview.png', 'i0': i0, 'j0': j0, 'w': w, 'h': h},
                  'fields': {'dir': 'cache/f/', 'w': 65, 'h': 49, 'du': 32, 'dv': 24},
                  'furlongs': {'dir': 'cache/u/', 'w': 2 * U_TILE[0] + 1, 'h': U_TILE[1] + U_TILE[2] + 1, 'du': U_TILE[0], 'dv': U_TILE[1], 'leagues': sorted([list(k) for k in UT])},
                  'hexes': {'dir': 'cache/h/', 'w': 2 * H_TILE[0] + 1, 'h': H_TILE[1] + H_TILE[2] + 1, 'du': H_TILE[0], 'dv': H_TILE[1], 'leagues': sorted([list(k) for k in HT])}}
    json.dump(J, open(os.path.join(adir, 'map.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'sources': srcs, 't': {m['id']: m['t'] for m in marches}, 'cache': J['cache']}, open(sfile, 'w'))
    kb = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(cdir) for f in fs) // 1024
    print(f'atlas cache: overview {w} x {h} ({len(LG)} Leagues), {len(marches)} Field tiles, {len(UT)} Furlong tiles, {len(HT)} 100-ft tiles, {kb} KB -> {cdir}')
    return 0


if __name__ == '__main__':
    sys.exit(main(os.path.abspath(sys.argv[1])))
