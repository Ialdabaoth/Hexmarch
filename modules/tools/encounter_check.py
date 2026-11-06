#!/usr/bin/env python3
"""E9 Atlas: check a module's Encounter maps (ENCOUNTER_FORMAT.md) before they are published.

    python3 -I modules/tools/encounter_check.py modules/<module>

Checks every encounter-maps/<id>.json (format, size, layer files, areas, links, walls, doors, lights, spawns) and every
pointer into a map (with its entrance or spawn point) (module.json site_encounters, scene "map" fields in any *.json with an "encounters" block).
Prints one line per problem and exits 1 if there is any, so the site build stops instead of shipping a map
that a VTT export or a PoI click would trip over. build.py runs it.
"""
import json, os, sys

FORMAT = 'e9-encounter-map/1'


def main(mdir):
    edir = os.path.join(mdir, 'encounter-maps'); errs = []
    maps = {}
    if os.path.isdir(edir):
        for f in sorted(os.listdir(edir)):
            if not f.endswith('.json'): continue
            try: maps[f[:-5]] = json.load(open(os.path.join(edir, f)))
            except ValueError as ex: errs.append(f'{f}: not valid JSON ({ex})')

    def num(v): return isinstance(v, (int, float)) and not isinstance(v, bool)
    def pt(v): return isinstance(v, list) and len(v) == 2 and all(num(x) for x in v)

    for mid, m in maps.items():
        say = lambda msg: errs.append(f'encounter-maps/{mid}.json: {msg}')
        if m.get('format') != FORMAT: say(f'format is {m.get("format")!r}, expected {FORMAT!r}')
        if m.get('id') != mid: say(f'id {m.get("id")!r} does not match the file name')
        size = m.get('size')
        if not (pt(size) and size[0] > 0 and size[1] > 0): say('size must be [w, h] in squares'); size = [10 ** 6, 10 ** 6]
        w, h = size
        inside = lambda p, slack=.5: -slack <= p[0] <= w + slack and -slack <= p[1] <= h + slack
        if not num((m.get('grid') or {}).get('ft', 5)): say('grid.ft must be a number of feet')
        for k, L in enumerate(m.get('layers') or []):
            if not os.path.isfile(os.path.join(edir, L.get('src', ''))): say(f'layer {k}: picture {L.get("src")!r} is missing')
            if not (num(L.get('px', 40)) and L.get('px', 40) > 0): say(f'layer {k}: px must be a positive number')
            if L.get('show', 'all') not in ('all', 'referee', 'players'): say(f'layer {k}: show must be all, referee or players')
        for aid, a in (m.get('areas') or {}).items():
            sq = a.get('squares'); rects = sq if sq and isinstance(sq[0], list) else [sq]
            for r in rects:
                if not (isinstance(r, list) and len(r) == 4 and all(num(x) for x in r)): say(f'area {aid}: squares must be [x, y, w, h] or a list of them'); continue
                if not (inside(r[:2]) and inside([r[0] + r[2], r[1] + r[3]])): say(f'area {aid}: {r} runs off the {w}x{h} map')
        for k, L in enumerate(m.get('links') or []):
            if not pt(L.get('from')) or not inside(L['from']): say(f'link {k}: from must be a square on the map')
            to = L.get('to') or {}; tid = to.get('map', mid)
            if tid not in maps: say(f'link {k}: goes to map {tid!r}, which this module does not have')
            elif to.get('area') and to['area'] not in (maps[tid].get('areas') or {}): say(f'link {k}: map {tid!r} has no area {to["area"]!r}')
            elif to.get('entrance') and (maps[tid].get('spawns') or {}).get(to['entrance'], {}).get('kind') != 'entrance': say(f'link {k}: map {tid!r} has no entrance {to["entrance"]!r}')
        for k, wl in enumerate(m.get('walls') or []):
            if not (isinstance(wl, list) and len(wl) >= 2 and all(pt(p) and inside(p) for p in wl)): say(f'wall {k}: must be two or more [x, y] squares on the map')
        for k, d in enumerate(m.get('doors') or []):
            at = d.get('at')
            if not (isinstance(at, list) and len(at) == 2 and all(pt(p) and inside(p) for p in at)): say(f'door {k}: at must be two [x, y] ends on the map')
        for sid, sp in (m.get('spawns') or {}).items():
            if sp.get('kind') not in ('entrance', 'spawn'): say(f'spawn {sid}: kind must be entrance or spawn')
            if sp.get('area') and sp['area'] not in (m.get('areas') or {}): say(f'spawn {sid}: no area {sp["area"]!r}')
            sq = sp.get('squares')
            for r in (sq if sq and isinstance(sq[0], list) else [sq] if sq else []):
                if not (isinstance(r, list) and len(r) == 4 and all(num(x) for x in r)) or not (inside(r[:2]) and inside([r[0] + r[2], r[1] + r[3]])): say(f'spawn {sid}: squares {r} must be [x, y, w, h] on the map')
            if sp.get('facing') and sp['facing'] not in ('n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'): say(f'spawn {sid}: facing must be n, ne, e, se, s, sw, w or nw')
        for k, li in enumerate(m.get('lights') or []):
            if not (pt(li.get('at')) and inside(li['at']) and num(li.get('range')) and li['range'] > 0): say(f'light {k}: needs at [x, y] on the map and a positive range')

    def pointer(where, p):
        p = {'map': p} if isinstance(p, str) else p
        if not isinstance(p, dict) or p.get('map') not in maps: errs.append(f'{where}: points at map {p.get("map") if isinstance(p, dict) else p!r}, which this module does not have'); return
        if p.get('area') and p['area'] not in (maps[p['map']].get('areas') or {}): errs.append(f'{where}: map {p["map"]!r} has no area {p["area"]!r}')
        sp = maps[p['map']].get('spawns') or {}
        if p.get('entrance') and sp.get(p['entrance'], {}).get('kind') != 'entrance': errs.append(f'{where}: map {p["map"]!r} has no entrance {p["entrance"]!r}')
        if p.get('spawn') and p['spawn'] not in sp: errs.append(f'{where}: map {p["map"]!r} has no spawn point {p["spawn"]!r}')

    mod = json.load(open(os.path.join(mdir, 'module.json')))
    for site, ptrs in (mod.get('site_encounters') or {}).items():
        for p in ptrs: pointer(f'module.json site_encounters[{site!r}]', p)
    for f in sorted(os.listdir(mdir)):
        if not f.endswith('.json') or f == 'module.json': continue
        try: j = json.load(open(os.path.join(mdir, f)))
        except ValueError: continue
        scenes = (j.get('encounters') or {}).get('scenes') if isinstance(j, dict) else None
        for sid, s in (scenes or {}).items():
            if s.get('map'): pointer(f'{f} scene {sid!r}', s['map'])
            mp = s.get('map'); mp = mp.get('map') if isinstance(mp, dict) else mp
            for w in s.get('who') or []:
                if w.get('spawn') and w['spawn'] not in ((maps.get(mp) or {}).get('spawns') or {}): errs.append(f'{f} scene {sid!r}: {w.get("creature")} spawns at {w["spawn"]!r}, which map {mp!r} does not have')

    for e in errs: print('encounter maps:', e)
    print(f'encounter maps: {len(maps)} checked, {len(errs)} problem{"" if len(errs) == 1 else "s"}')
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main(os.path.abspath(sys.argv[1])))
