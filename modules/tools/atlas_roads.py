#!/usr/bin/env python3
"""E9 Atlas roads (ATLAS_FORMAT.md "Roads", Atlas 0.4.18): lay a module's roads over its built map.

    python3 -I modules/tools/atlas_roads.py <module.json> <out>/atlas

module.json atlas.roads lists each road as a name, a class and the places it runs through:
    {"name": "Slí Mór", "class": "roman", "via": ["Teamhair", "Uisneach", [53.27, -9.05]]}
A via point is a site name (any site in the module) or [lat, lon]. Each leg between two via points follows the cheapest
way on foot over the Field (half-mile) terrain in the tile cache, using the map's travel multipliers: no leg crosses sea
or a lake, and the cheap ground (grass before bog and mountain) wins. The path is then straightened wherever a straight
line stays on passable ground, and given a seeded sway (SWAY): no road of 1422 Ireland ran ruler-straight, so each
wanders gently from side to side, trails most and the great roads least, pinned at its via points and never onto ground
with no way on foot. Where a road meets a river, a crossing is written: a bridge on a roman road, a ford on the
others, unless the road says "crossing": "bridge" or "ford". Writes map.json "roads" and "crossings" (points in feet).
Run after atlas_cache.py: it reads cache/f/<march>.png.
"""
import heapq, json, math, os, sys
import numpy as np
from PIL import Image
from shapely.geometry import LineString
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dymaxion import Face

CW = 100 * math.sqrt(3) / 2
CLASSES = ('roman', 'local', 'trail')
FIELD = 25
STEP = FIELD * 100  # feet between neighbouring Field centres
TOL = 600           # feet a straightened road may stray from the cheapest path
SWAY = {'roman': 150, 'local': 200, 'trail': 260}  # feet of side-to-side wander (Heph 2026-11-07: "give the roads a little sway")
SWAY_STEP = 400     # feet between the points of a swayed road


def hex_round(px, py, s):  # as atlas_convert.py: nearest flat-top odd-q hex to a point
    q = (2 / 3 * px) / s; r = (-1 / 3 * px + math.sqrt(3) / 3 * py) / s
    x, z = q, r; y = -x - z
    rx, ry, rz = np.round(x), np.round(y), np.round(z)
    dx, dy, dz = abs(rx - x), abs(ry - y), abs(rz - z)
    fx = (dx > dy) & (dx > dz); fz = ~fx & (dz >= dy)
    rx = np.where(fx, -ry - rz, rx); rz = np.where(fz, -rx - ry, rz)
    col = rx.astype(np.int64); return col, (rz + (col - (col & 1)) // 2).astype(np.int64)


def nearest(C, R, N):  # as atlas_convert.py
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
def ft(C, R): return C * CW, (R + 0.5 * (C & 1)) * 100
def field_at(x, y): return hex_round(np.asarray(x, float) / FIELD, np.asarray(y, float) / FIELD, 100 / math.sqrt(3))  # as atlas.html hexAt(x, y, 25)
def field_ft(i, j): return ft(*centre(i, j, FIELD))
def nbrs(i, j):
    o = i & 1
    return ((i, j - 1), (i + 1, j - 1 + o), (i + 1, j + o), (i, j + 1), (i - 1, j + o), (i - 1, j - 1 + o))
def hexdist(a, b, c, d):
    z1 = b - (a - (a & 1)) // 2; z2 = d - (c - (c & 1)) // 2; dx = a - c; dz = z1 - z2
    return max(abs(dx), abs(dz), abs(dx + dz))


def smooth(pts, k=8):  # the line as the Atlas draws it (atlas.html curve): moving average +-2, ends pinned, centripetal Catmull-Rom, k points per piece
    n = len(pts); p = []
    for q in range(n):
        if q in (0, n - 1): p.append((float(pts[q][0]), float(pts[q][1]))); continue
        a = pts[max(0, q - 2):min(n, q + 3)]; p.append((sum(v[0] for v in a) / len(a), sum(v[1] for v in a) / len(a)))
    out = [p[0]]
    for q in range(n - 1):
        A, B, C, E = p[max(0, q - 1)], p[q], p[q + 1], p[min(n - 1, q + 2)]
        if q == 0: A = (2 * B[0] - C[0], 2 * B[1] - C[1])
        if q + 2 > n - 1: E = (2 * C[0] - B[0], 2 * C[1] - B[1])
        t = lambda u, v: max(1e-6, math.hypot(v[0] - u[0], v[1] - u[1]) ** .5); t1, t2, t3 = t(A, B), t(B, C), t(C, E)
        m1 = [(C[i] - B[i]) / t2 - (C[i] - A[i]) / (t1 + t2) + (B[i] - A[i]) / t1 for i in (0, 1)]
        m2 = [(C[i] - B[i]) / t2 - (E[i] - B[i]) / (t2 + t3) + (E[i] - C[i]) / t3 for i in (0, 1)]
        c1 = (B[0] + m1[0] * t2 / 3, B[1] + m1[1] * t2 / 3); c2 = (C[0] - m2[0] * t2 / 3, C[1] - m2[1] * t2 / 3)
        for s in range(1, k + 1):
            u = s / k; w = ((1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3)
            out.append(tuple(w[0] * B[i] + w[1] * c1[i] + w[2] * c2[i] + w[3] * C[i] for i in (0, 1)))
    return out
RIVER_FT = [0, 15, 30, 60, 120, 200]  # a river's true width by class, as atlas.html draws it


def main(modp, adir):
    MOD = json.load(open(modp, encoding='utf-8')); A = MOD['atlas']; roads_in = A.get('roads') or []
    J = json.load(open(os.path.join(adir, 'map.json'), encoding='utf-8'))
    if not roads_in:
        J['roads'], J['crossings'] = [], []
        json.dump(J, open(os.path.join(adir, 'map.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); return 0
    face = Face(*A['centroid'][1:3])
    sites = {st[0]: (st[1], st[2]) for reg in MOD['regions'].values() for st in reg.get('sites', [])}

    # the Field terrain, from the tile cache: one cost per Field (inf = no way on foot, or off the map)
    types = J['terrain']['types']; CA = J['cache']['fields']
    cost_of = np.array([math.inf] + [math.inf if t.get('travel') is None else float(t['travel']) for t in types])
    key = {int(t['color'][1:], 16): k + 1 for k, t in enumerate(types)}
    tiles = []
    for m in J['terrain']['marches']:
        Cm, Rm = centre(m['i'], m['j'], 1200); fi, fj = (int(v) for v in nearest(np.array(Cm), np.array(Rm), FIELD))
        a = np.asarray(Image.open(os.path.join(adir, CA['dir'], m['id'] + '.png')).convert('RGB')).astype(np.int64)
        k = a[..., 0] << 16 | a[..., 1] << 8 | a[..., 2]; t = np.zeros(k.shape, np.int64)
        for c, v in key.items(): t[k == c] = v
        tiles.append((fi - CA['du'], fj - CA['dv'], t))
    I0 = min(x for x, _, _ in tiles); J0 = min(y for _, y, _ in tiles)
    I1 = max(x + t.shape[1] for x, _, t in tiles); J1 = max(y + t.shape[0] for _, y, t in tiles)
    COST = np.full((I1 - I0, J1 - J0), math.inf)
    for x, y, t in tiles:
        sub = COST[x - I0:x - I0 + t.shape[1], y - J0:y - J0 + t.shape[0]]; c = cost_of[t.T]; own = t.T > 0
        sub[own] = c[own]
    minc = float(np.min(COST[np.isfinite(COST)]))
    def cost(i, j):
        u, v = i - I0, j - J0
        return COST[u, v] if 0 <= u < COST.shape[0] and 0 <= v < COST.shape[1] else math.inf

    def where(v, rname):
        if isinstance(v, str):
            if v not in sites: sys.exit(f'module.json atlas.roads {rname!r}: no site named {v!r}')
            la, lo = sites[v]; x, y = face.forward(la, lo); C, R = hex_round(x, y, 100 / math.sqrt(3)); return ft(int(C), int(R))  # the place's own 100-ft hex
        if isinstance(v, list) and len(v) == 2 and all(isinstance(q, (int, float)) for q in v):
            x, y = face.forward(v[0], v[1]); return float(x), float(y)
        sys.exit(f'module.json atlas.roads {rname!r}: a via point is a site name or [lat, lon], not {v!r}')

    def path(a, b, rname):  # A* over Fields from the Field under point a to the one under point b
        s = tuple(int(q) for q in field_at(*a)); g = tuple(int(q) for q in field_at(*b))
        if s == g: return [a, b]
        best = {s: 0.0}; prev = {}; todo = [(0.0, 0.0, s)]
        while todo:
            _, d, n = heapq.heappop(todo)
            if n == g: break
            if d > best.get(n, math.inf): continue
            cn = cost(*n) if n != s else minc  # a road may start or end in a Field that is mostly water (a harbour town)
            for m in nbrs(*n):
                cm = cost(*m) if m != g else minc
                if not math.isfinite(cm): continue
                nd = d + (cn + cm) / 2
                if nd < best.get(m, math.inf):
                    best[m] = nd; prev[m] = n; heapq.heappush(todo, (nd + hexdist(*m, *g) * minc, nd, m))
        if g not in prev: sys.exit(f'module.json atlas.roads {rname!r}: no way on foot between {a} and {b} (sea or lake all round?)')
        out = [g]
        while out[-1] != s: out.append(prev[out[-1]])
        return [a] + [field_ft(*f) for f in reversed(out[1:-1])] + [b]

    def clear(p, q):  # a straight line from p to q stays on ground with a way on foot (its end Fields excepted)
        n = max(1, int(math.hypot(q[0] - p[0], q[1] - p[1]) // 400))
        xs = np.linspace(p[0], q[0], n + 1); ys = np.linspace(p[1], q[1], n + 1); fi, fj = field_at(xs, ys)
        ends = {tuple(int(v) for v in field_at(*p)), tuple(int(v) for v in field_at(*q))}
        return all(math.isfinite(cost(int(i), int(j))) or (int(i), int(j)) in ends for i, j in zip(fi, fj))

    def sway(pts, amp, seed):  # resample every SWAY_STEP feet and push each point sideways along two slow seeded waves
        out = [pts[0]]
        for p, q in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(q[0] - p[0], q[1] - p[1]) // SWAY_STEP))
            out += [(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n) for k in range(1, n + 1)]
        if len(out) < 3: return out
        rng = np.random.default_rng(seed); w = [(rng.uniform(2600, 4200), rng.uniform(0, 2 * math.pi), .65), (rng.uniform(5500, 9000), rng.uniform(0, 2 * math.pi), .35)]
        d = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(np.array(out), axis=0).T))]); L = d[-1]; res = [out[0]]
        for k in range(1, len(out) - 1):
            tx, ty = out[k + 1][0] - out[k - 1][0], out[k + 1][1] - out[k - 1][1]; tl = math.hypot(tx, ty) or 1
            pin = min(1.0, d[k] / 1500, (L - d[k]) / 1500)  # no sway at the via points: the road still reaches its places
            off = amp * pin * sum(a * math.sin(2 * math.pi * d[k] / lam + ph) for lam, ph, a in w)
            x, y = out[k][0] - ty / tl * off, out[k][1] + tx / tl * off
            res.append((x, y) if math.isfinite(cost(*(int(v) for v in field_at(x, y)))) else out[k])
        return list(LineString(res + [out[-1]]).simplify(60).coords)  # drop points the eye can't see, keeping map.json small

    def straighten(pts):  # Douglas-Peucker, but a shortcut must stay on passable ground
        if len(pts) < 3: return pts
        (ax, ay), (bx, by) = pts[0], pts[-1]; L = math.hypot(bx - ax, by - ay) or 1
        d = [abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L for x, y in pts[1:-1]]; k = int(np.argmax(d)) + 1
        if d[k - 1] <= TOL and clear(pts[0], pts[-1]): return [pts[0], pts[-1]]
        return straighten(pts[:k + 1])[:-1] + straighten(pts[k:])

    roads, crossings, seen = [], [], set()
    rivers = [(rv.get('name'), rv.get('class', 1), LineString(smooth(rv['points']))) for rv in J.get('rivers', []) if len(rv['points']) > 1]
    for rd in roads_in:
        rname = rd.get('name') or '(unnamed)'
        if rd.get('class') not in CLASSES: sys.exit(f'module.json atlas.roads {rname!r}: class is roman, local or trail, not {rd.get("class")!r}')
        if rd.get('crossing') not in (None, 'bridge', 'ford'): sys.exit(f'module.json atlas.roads {rname!r}: crossing is bridge or ford')
        via = rd.get('via') or []
        if len(via) < 2: sys.exit(f'module.json atlas.roads {rname!r}: via needs at least two points')
        P = [where(v, rname) for v in via]; pts = [P[0]]
        for k, (a, b) in enumerate(zip(P, P[1:])):
            seed = int.from_bytes(f'{rname}/{k}'.encode('utf-8'), 'little') % (2 ** 32)
            pts += sway(straighten(path(a, b, rname)), SWAY[rd['class']], seed)[1:]
        pts = [[int(round(x)), int(round(y))] for x, y in pts]
        r = {'name': rd['name'], 'class': rd['class'], 'points': pts} if rd.get('name') else {'class': rd['class'], 'points': pts}
        roads.append(r)
        line = LineString(smooth(pts)) if len(pts) > 1 else None
        kind = rd.get('crossing') or ('bridge' if rd['class'] == 'roman' else 'ford')
        for rvn, rcl, rl in rivers:
            if line is None: continue
            x = line.intersection(rl)
            for g in getattr(x, 'geoms', [x]):
                if g.is_empty or g.geom_type != 'Point': continue
                C, R = (int(v) for v in hex_round(g.x, g.y, 100 / math.sqrt(3)))
                if (C, R) in seen: continue
                d = line.project(g); a, b = line.interpolate(max(0, d - 50)), line.interpolate(d + 50)  # the road's heading there
                seen.add((C, R)); c = {'hex': [C, R], 'at': [int(round(g.x)), int(round(g.y))], 'angle': round(math.degrees(math.atan2(b.y - a.y, b.x - a.x))),
                                       'span': int(RIVER_FT[min(5, max(1, int(rcl)))] * 1.4 + 20), 'kind': kind, 'road': rd.get('name')}
                if rvn: c['river'] = rvn
                if c['road'] is None: del c['road']
                crossings.append(c)
    J['roads'], J['crossings'] = roads, crossings
    json.dump(J, open(os.path.join(adir, 'map.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    mi = sum(math.hypot(q[0] - p[0], q[1] - p[1]) for r in roads for p, q in zip(r['points'], r['points'][1:])) / 5000
    print(f'atlas roads: {len(roads)} roads, {mi:.0f} mi, {len(crossings)} crossings ({sum(c["kind"] == "bridge" for c in crossings)} bridges)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], os.path.abspath(sys.argv[2])))
