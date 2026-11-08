#!/usr/bin/env python3
"""Build a fantasy-world module's Atlas map into one self-contained file (Atlas 0.5.14, ATLAS_FORMAT.md "Fantasy worlds").

usage: python3 -I modules/tools/atlas_flat.py <module folder> <out file> [--assets <data repo>/modules/assets]
  e.g. python3 -I modules/tools/atlas_flat.py /mnt/project-files/mystara/module mystara.e9atlas.json

The module folder holds module.json and the painted terrain picture it names. module.json gives:
  "scales": {"unit_ft", "mile_ft", "levels": five levels coarse to fine, each {"id", "name", "hex": "64 mi" | "660 ft"},
             "paint": the level painted (the second one)}
  "atlas":  {"projection": "flat", "paint": "<png>", "terrain": [{"id", "name", "colors": ["#rrggbb", ...], "tile", "icon", "travel"}],
             "travel": {"pace": {...}, "roads": {...}}}
  "places": [{"id", "name", "kind", "icon", "rank", "hex": "<col>.<row>" at the paint level, "at": [dC, dR] optional, in bottom hexes}]
The picture has one pixel per hex of the paint level: pixel (x, y) is column x, row y, odd columns half a hex lower.
Black (#000000) is off the map; any other colour must be listed under one terrain's "colors".

The output carries the map, the module's title and credits, and the tile art it uses (as data: URLs), so the Atlas can
open it from a file on the device ("Open a map file…") with nothing on a server. That is how private modules are played.
Levels finer than the paint level are not stored: the Atlas works them out as it zooms, with seeded borders.
"""
import base64, io, json, os, re, sys

from PIL import Image

TOOLS = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(os.path.dirname(TOOLS))
args = sys.argv[1:]
assets = None
if '--assets' in args:
    k = args.index('--assets'); assets = args[k + 1]; del args[k:k + 2]
if len(args) != 2: sys.exit(__doc__)
src, out = args
for a in ([assets] if assets else []) + [os.path.join(REPO, 'modules', 'assets'), os.path.join(REPO, '.data', 'modules', 'assets'), os.path.join(os.path.dirname(REPO), 'MateriaMundiRPG', 'modules', 'assets')]:
    if a and os.path.isdir(os.path.join(a, 'tiles')): assets = a; break
else: sys.exit('No tile art found: pass --assets <data repo>/modules/assets (or keep a clone of the data repo in .data/ or beside this repo)')

MOD = json.load(open(os.path.join(src, 'module.json')))
AT = MOD.get('atlas') or {}
if AT.get('projection') != 'flat': sys.exit('module.json atlas.projection must be "flat" for this tool (real-Earth modules use build.py)')
SC = MOD.get('scales') or sys.exit('module.json needs "scales"')
UNIT, MILE = SC.get('unit_ft', 100), SC.get('mile_ft', 5000)

def size_ft(lv):
    if 'hex_ft' in lv: return float(lv['hex_ft'])
    m = re.fullmatch(r'\s*([\d.]+)\s*(mi|ft)\s*', str(lv.get('hex', '')))
    if not m: sys.exit(f'scales level {lv.get("id")!r}: "hex" must read like "8 mi" or "660 ft"')
    return float(m[1]) * (MILE if m[2] == 'mi' else 1)

levels = []
for lv in SC.get('levels', []):
    n = size_ft(lv) / UNIT
    if abs(n - round(n)) > 1e-6: sys.exit(f'scales level {lv["id"]!r}: {size_ft(lv):g} ft is not a whole number of {UNIT}-ft hexes')
    levels.append({'id': lv['id'], 'name': lv.get('name', lv['id']), 'n': int(round(n))})
if len(levels) != 5: sys.exit(f'scales.levels: the Atlas takes five levels for now (it has {len(levels)})')
if levels[-1]['n'] != 1: sys.exit('scales.levels: the last level must be the bottom hex, exactly unit_ft')
if SC.get('paint') != levels[1]['id']: sys.exit(f'scales.paint must be the second level ({levels[1]["id"]!r}) for now')
NL = levels[1]['n']

# terrain: each type's colours -> its index (1-based; 0 = off the map)
types, KEY = [], {}
for k, t in enumerate(AT.get('terrain') or sys.exit('atlas.terrain is empty')):
    cols = t.get('colors') or ([t['color']] if t.get('color') else [])
    if not cols: sys.exit(f'terrain {t.get("id")!r} has no colours')
    for c in cols:
        v = int(c.lstrip('#'), 16)
        if v in KEY: sys.exit(f'colour {c} is listed for two terrains')
        KEY[v] = k + 1
    tv = t.get('travel', 1)
    types.append({'id': t['id'], 'name': t['name'], 'color': cols[0].lower(), 'tile': t.get('tile', 'bg-green'), 'icon': t.get('icon'), 'travel': tv})

im = Image.open(os.path.join(src, AT.get('paint', 'terrain.png'))).convert('RGB')
w, h = im.size; px = im.load(); grid = bytearray(w * h); bad = {}
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]; v = (r << 16) | (g << 8) | b
        if v == 0: continue
        if v in KEY: grid[y * w + x] = KEY[v]
        else: bad[v] = bad.get(v, 0) + 1
if bad: sys.exit('colours in the paint picture that no terrain lists: ' + ', '.join(f'#{v:06x} ({n} px)' for v, n in sorted(bad.items(), key=lambda q: -q[1])[:20]))

def centre(i, j, N): return [N * i, N * j + (N // 2) * (i & 1)]
pois = []
for p in MOD.get('places', []):
    m = re.fullmatch(r'(-?\d+)\.(-?\d+)', str(p.get('hex', '')))
    if not m: sys.exit(f'place {p.get("id")!r}: "hex" must be "<col>.<row>" at the paint level')
    C, R = centre(int(m[1]), int(m[2]), NL); dC, dR = p.get('at', [0, 0])
    q = {k: p[k] for k in ('id', 'name', 'kind', 'icon', 'rank', 'book', 'parent') if p.get(k) is not None}
    q['hex'] = [C + dC, R + dR]; q.setdefault('kind', 'place'); pois.append(q)

# tile art: the terrain tiles (and their -x twins), icons, and the blend masks (as build.py makes them)
TD, MD = os.path.join(assets, 'tiles', 'icons'), os.path.join(assets, 'tiles', 'masks')
def uri(img_or_path):
    if isinstance(img_or_path, str): data = open(img_or_path, 'rb').read()
    else: b = io.BytesIO(); img_or_path.save(b, 'PNG', optimize=True); data = b.getvalue()
    return 'data:image/png;base64,' + base64.b64encode(data).decode()
want = {t['tile'] for t in types} | {t['icon'] for t in types if t['icon']} | {p['icon'] for p in pois if p.get('icon')}
tiles, missing = {}, []
for n in sorted(want | {n + '-x' for n in want if n.startswith('bg-')}):
    f = os.path.join(TD, n + '.png')
    if os.path.exists(f): tiles[n] = uri(f)
    else: missing.append(n)
if missing: print('atlas_flat: no tile art for ' + ', '.join(missing) + ' (drawn without it)', file=sys.stderr)
for kind, f in (('e', 'edge.png'), ('c', 'corner.png')):
    m = Image.open(os.path.join(MD, f)).getchannel('A')
    for k in range(6):
        r = m.rotate(-60 * k, resample=Image.BICUBIC, center=(m.width / 2, m.height / 2)); tiles[f'mask-{kind}{k}'] = uri(r)
        x = Image.new('L', (r.width + 8, r.height + 8)); x.paste(r, (4, 4))
        for p_ in range(4):
            x.paste(r.crop((0, 0, r.width, 1)), (4, p_)); x.paste(r.crop((0, r.height - 1, r.width, r.height)), (4, r.height + 4 + p_))
        for p_ in range(4):
            x.paste(x.crop((4, 0, 5, x.height)), (p_, 0)); x.paste(x.crop((r.width + 3, 0, r.width + 4, x.height)), (r.width + 4 + p_, 0))
        tiles[f'mask-{kind}{k}-x'] = uri(x)

tv = AT.get('travel') or {}
bundle = {
    'format': 'e9-atlas-file', 'version': 1,
    'module': {k: MOD[k] for k in ('id', 'title', 'short', 'version', 'license', 'credits', 'languages', 'requires') if k in MOD},
    'map': {'title': MOD.get('short', MOD['title']), 'flat': True,
            'scales': {'unit_ft': UNIT, 'mile_ft': MILE, 'levels': levels, 'paint': SC['paint']},
            'terrain': {'types': types}, 'paint': {'w': w, 'h': h, 'data': base64.b64encode(bytes(grid)).decode()},
            'travel': {'pace': {'mi_per_hour': 3, 'hours_per_day': 8, **tv.get('pace', {})}, 'roads': {'roman': 0.5, 'local': 0.75, 'trail': 1, **tv.get('roads', {})}},
            'pois': pois, 'rivers': [], 'roads': [], 'crossings': [], 'regions': [], 'names': MOD.get('names', {}), 'legacy': {}},
    'tiles': tiles,
}
json.dump(bundle, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
land = sum(1 for v in grid if v)
print(f'atlas_flat: {MOD["id"]}: {w} x {h} {levels[1]["name"]} hexes ({land} mapped), {len(types)} terrains, {len(pois)} places, '
      f'{len(tiles)} tiles, {os.path.getsize(out) // 1024} KB -> {out}')
