#!/usr/bin/env python3
"""Write the E9 Atlas app: one page at <site>/atlas/ that loads any module the site lists (Atlas 0.3.0, Heph 2026-11-06).

usage: python3 -I modules/tools/atlas_app.py <site dir>
  e.g. python3 -I modules/tools/atlas_app.py companion-app/dist

The app reads <site>/mm.json for the module list and each module's module.json; a module whose manifest
has "atlas_map" (build.py writes it when the module has an E9 Atlas map) can be loaded with ?module=<id>.
Build the modules into <site>/modules/<id>/ with build.py and copy mm.json to <site>/mm.json.
"""
import json, os, sys

TOOLS = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(os.path.dirname(TOOLS))
site = os.path.abspath(sys.argv[1])
ATLAS = open(TOOLS + '/ATLAS_VERSION').read().strip()
PATREON = json.load(open(os.path.join(REPO, 'links.json'))).get('patreon', '')  # shared with the E9 Companion; empty hides the link
CARD = open(TOOLS + '/creature_card.html').read() + open(TOOLS + '/encounter_view.html').read() + open(TOOLS + '/vtt_export.html').read() + open(TOOLS + '/vtt_bridge.html').read()  # index card and encounter map viewer
html = open(TOOLS + '/atlas.html').read().replace('{{ATLAS}}', ATLAS).replace('<!--CARD-->', CARD).replace('{{PATREON}}', json.dumps(PATREON))
os.makedirs(site + '/atlas', exist_ok=True)
open(site + '/atlas/index.html', 'w').write(html)
print(f'E9 Atlas {ATLAS} -> {site}/atlas/index.html')
