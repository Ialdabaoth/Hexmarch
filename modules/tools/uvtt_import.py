#!/usr/bin/env python3
"""E9 Atlas: import a Universal VTT file (.uvtt / .dd2vtt / .df2vtt) as an Encounter map (ENCOUNTER_FORMAT.md section 7).

    python3 -I modules/tools/uvtt_import.py <file.uvtt> modules/<module>/encounter-maps [--id <map-id>] [--title "..."] [--ft 5]

Writes encounter-maps/<id>/map.<png|jpg|webp> (the embedded picture, bytes unchanged) and encounter-maps/<id>.json:
size and pixels per square from "resolution", walls from "line_of_sight" and "objects_line_of_sight", doors from
"portals", lights and environment as they are. Points are moved by "map_origin" so the map starts at square 0, 0.
A file that E9 exported carries an "e9" block; its title, grid, areas, links, anchor, secret and locked doors,
licence and credit come back too. Anything else (areas, links, scenes, the site_encounters pointer) is the module
author's to add. The licence is left empty for a file from elsewhere: set it before publishing.
Run encounter_check.py on the module afterwards.
"""
import argparse, base64, json, math, os, re, sys


def compact(m):
    txt = json.dumps(m, ensure_ascii=False, indent=1)
    return re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2]', txt)  # one [x, y] point per line, not three


def colour(c):
    """Universal VTT colours are ARGB hex ("ffeccd8b"); E9 keeps "#rrggbb"."""
    c = str(c or '').lstrip('#').lower()
    return '#' + (c[-6:] if re.fullmatch(r'[0-9a-f]{6}|[0-9a-f]{8}', c) else 'ffffff')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('file'); ap.add_argument('out', help='the module\'s encounter-maps folder')
    ap.add_argument('--id'); ap.add_argument('--title'); ap.add_argument('--ft', type=float)
    a = ap.parse_args()
    u = json.load(open(a.file, encoding='utf-8')); e9 = u.get('e9') or {}
    mid = a.id or e9.get('id') or re.sub(r'[^a-z0-9]+', '-', os.path.splitext(os.path.basename(a.file))[0].lower()).strip('-')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', mid): sys.exit(f'map id {mid!r}: use lower-case letters, digits and hyphens')
    res = u['resolution']; ox, oy = res.get('map_origin', {}).get('x', 0), res.get('map_origin', {}).get('y', 0)
    r2 = lambda v: round(v, 2)
    P = lambda p: [r2(p['x'] - ox), r2(p['y'] - oy)]
    # the picture, saved as it came
    raw = base64.b64decode(u['image'])
    ext = 'png' if raw[:8] == b'\x89PNG\r\n\x1a\n' else 'jpg' if raw[:3] == b'\xff\xd8\xff' else 'webp' if raw[8:12] == b'WEBP' else None
    if not ext: sys.exit('the embedded image is not PNG, JPEG or WebP')
    os.makedirs(os.path.join(a.out, mid), exist_ok=True)
    src = f'{mid}/map.{ext}'; open(os.path.join(a.out, src), 'wb').write(raw)
    # doors: an E9 export's own list keeps secret and locked; otherwise one closed door per portal
    if e9.get('doors') is not None and len(e9['doors']) == len(u.get('portals', [])):
        doors = e9['doors']
    else:
        doors = [{'at': [P(b) for b in pt['bounds']], 'closed': bool(pt.get('closed', True)), 'secret': False} for pt in u.get('portals', []) if len(pt.get('bounds', [])) == 2]
    env = u.get('environment') or {}
    m = {'format': 'e9-encounter-map/1', 'id': mid, 'title': a.title or e9.get('title') or mid.replace('-', ' ').capitalize(),
         'size': [res['map_size']['x'], res['map_size']['y']],
         'grid': dict(e9.get('grid') or {'ft': 5, 'show': True}, **({'ft': a.ft} if a.ft else {})),
         'layers': [{'src': src, 'at': [0, 0], 'px': res['pixels_per_grid']}], 'ground': 'none'}
    for k in ('anchor', 'areas', 'links'):
        if e9.get(k): m[k] = e9[k]
    walls = [[P(p) for p in ln] for ln in u.get('line_of_sight', []) + u.get('objects_line_of_sight', []) if len(ln) >= 2]
    m.update({'walls': walls, 'doors': doors,
              'lights': [{'at': P(l['position']), 'range': l.get('range', 1), 'colour': colour(l.get('color')), 'intensity': l.get('intensity', 1)} for l in u.get('lights', [])],
              'environment': {'ambient': colour(env.get('ambient_light')), 'baked': bool(env.get('baked_lighting'))},
              'licence': e9.get('licence', ''), 'credit': e9.get('credit', '')})
    open(os.path.join(a.out, mid + '.json'), 'w', encoding='utf-8').write(compact(m))
    print(f"{mid}: {m['size'][0]}x{m['size'][1]} squares at {res['pixels_per_grid']} px, {len(walls)} walls, {len(doors)} doors, {len(m['lights'])} lights -> {a.out}/{mid}.json")
    if not m['licence']: print(f'{mid}: no licence given; set "licence" and "credit" before publishing')


if __name__ == '__main__':
    main()
