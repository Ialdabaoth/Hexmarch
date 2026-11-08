#!/usr/bin/env python3
"""Period lands (counties, duchies...) for a module's admin file, cut from Natural Earth's modern admin-1 regions.

usage: python3 -I admin_lands.py <lands.json> <out.geojson>
lands.json: {"source": "<ne_10m_admin_1_states_provinces.geojson>", "bbox": [minlon, minlat, maxlon, maxlat],
             "lands": [{"name": "Pommern", "from": ["Mecklenburg-Vorpommern", ...], "lon": [min, max]?, "lat": [min, max]?}, ...]}
Each land is the union of the named modern regions, cut to the bbox and to its own optional lon/lat band, so a
modern state can be split along a rough period border. A modern region may feed several lands through different
bands. Natural Earth is public domain. "source" is relative to lands.json. Written for Hansa (Heph 2026-11-06); any module can use it.
"""
import json, os, sys
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

cfg = json.load(open(sys.argv[1])); src = json.load(open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), cfg['source'])))  # relative to lands.json
by = {}
for f in src['features']: by.setdefault(f['properties']['name'], []).append(shape(f['geometry']))
B = box(*cfg['bbox']); feats = []
for L in cfg['lands']:
    missing = [n for n in L['from'] if n not in by]
    if missing: sys.exit(f"{L['name']}: no admin-1 region named {missing}")
    g = unary_union([s for n in L['from'] for s in by[n]]).intersection(B)
    lo, la = L.get('lon', [-180, 180]), L.get('lat', [-90, 90])
    g = g.intersection(box(lo[0], la[0], lo[1], la[1])).buffer(0)
    if g.is_empty: sys.exit(f"{L['name']}: empty after cutting")
    g = g.simplify(0.0005)
    feats.append({'type': 'Feature', 'properties': {'name': L['name'], 'admin': cfg.get('admin', 'module')}, 'geometry': mapping(g)})
json.dump({'type': 'FeatureCollection', 'features': feats}, open(sys.argv[2], 'w'), separators=(',', ':'))
print(f"{len(feats)} lands -> {sys.argv[2]}")
