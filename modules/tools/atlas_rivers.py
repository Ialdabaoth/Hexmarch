#!/usr/bin/env python3
"""Hexmarch Atlas traced rivers (ATLAS_FORMAT.md "Rivers"): lay a module's own river courses over its built map.

    python3 -I modules/tools/atlas_rivers.py <module.json> <out>/atlas

atlas_convert.py takes the rivers from the world map's drainage, about 900 ft between points, which can miss a real bend
(the Bóinn at Trim runs on the wrong side of the castle). module.json atlas.rivers lists traced courses:
    {"name": "An Bhóinn", "via": [[53.556, -6.790], [53.555, -6.786], ...], "class": 3}
Each course replaces the stretch of the generated river it lies along: the river nearest both of its ends (one with the
same name first), from the point nearest its first end to the point nearest its last. A course whose ends are both more than
RANGE from any river is added as a river of its own ("class" 1 to 5, default 2). "name" picks the river by name first, and names an unnamed one.
Writes map.json "rivers". Run after atlas_convert.py (and the cache) and before atlas_roads.py, whose crossings read the rivers.
It touches no picture, so a traced course never redraws a map.
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dymaxion import Face

RANGE = 3 * 5000  # feet: how far a traced end may lie from the river it splices into


def main(modp, adir):
    MOD = json.load(open(modp, encoding='utf-8')); A = MOD['atlas']; traced = A.get('rivers') or []
    if not traced: return 0
    if not isinstance(traced, list): sys.exit('module.json atlas.rivers: a list of {name?, class?, via: [[lat, lon], ...]}')
    mp = os.path.join(adir, 'map.json'); J = json.load(open(mp, encoding='utf-8')); rivers = J.get('rivers') or []
    face = Face(*A['centroid'][1:3])
    for n, t in enumerate(traced):
        nm = t.get('name') if isinstance(t, dict) else None; label = f'module.json atlas.rivers {nm or n}'
        via = t.get('via') if isinstance(t, dict) else None
        if not (isinstance(via, list) and len(via) >= 2 and all(isinstance(v, list) and len(v) == 2 and all(isinstance(q, (int, float)) for q in v) for v in via)):
            sys.exit(f'{label}: "via" is a list of at least two [lat, lon] points')
        cls = t.get('class')
        if cls is not None and cls not in (1, 2, 3, 4, 5): sys.exit(f'{label}: "class" is 1 to 5')
        pts = [[int(round(c)) for c in face.forward(la, lo)] for la, lo in via]
        def near(p, rv):  # (squared distance, index) of the river point nearest p
            return min(((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2, k) for k, q in enumerate(rv['points']))
        best = None
        for r, rv in enumerate(rivers):
            if len(rv.get('points') or []) < 2: continue
            (da, ia), (db, ib) = near(pts[0], rv), near(pts[-1], rv)
            if max(da, db) > RANGE ** 2: continue
            score = (0 if nm and rv.get('name') == nm else 1, da + db)
            if best is None or score < best[0]: best = (score, r, ia, ib)
        if best is None:
            rivers.append(dict(**({'name': nm} if nm else {}), **{'class': cls or 2}, points=pts)); print(f'{label}: added as a river of its own'); continue
        _, r, ia, ib = best; rv = rivers[r]; seg = pts
        if ia > ib: ia, ib, seg = ib, ia, pts[::-1]
        rv['points'] = rv['points'][:ia] + seg + rv['points'][ib + 1:]
        if nm and not rv.get('name'): rv['name'] = nm
        if cls: rv['class'] = cls
        print(f'{label}: spliced into river {rv.get("name", r)} in place of {ib - ia + 1} points')
    J['rivers'] = rivers
    json.dump(J, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2]))
