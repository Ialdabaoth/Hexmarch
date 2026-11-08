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
LINKS = os.path.join(REPO, 'links.json')  # copied in from the data repo (scripts/data.sh); shared with the E9 Companion
PATREON = json.load(open(LINKS)).get('patreon', '') if os.path.exists(LINKS) else ''  # empty hides the link
# Where the Atlas finds mm.json and the modules: site.json "data.url" (the apps repo), else '' = the folder above /atlas/
SITE_JSON = os.path.join(REPO, 'site.json')
DATA = os.environ.get('E9_DATA_URL') or (json.load(open(SITE_JSON)).get('data', {}).get('url', '') if os.path.exists(SITE_JSON) else '')
CARD = open(TOOLS + '/creature_card.html').read() + open(TOOLS + '/encounter_view.html').read() + open(TOOLS + '/vtt_export.html').read() + open(TOOLS + '/vtt_bridge.html').read()  # index card and encounter map viewer
html = open(TOOLS + '/atlas.html').read().replace('{{ATLAS}}', ATLAS).replace('<!--CARD-->', CARD).replace('{{PATREON}}', json.dumps(PATREON)).replace('{{DATA}}', json.dumps(DATA))
os.makedirs(site + '/atlas', exist_ok=True)
open(site + '/atlas/index.html', 'w').write(html)
ICONS = os.path.join(REPO, 'icons')  # the Atlas's app icon (icons/atlas.svg; PNGs rendered from it)
if os.path.isdir(ICONS):
    import shutil
    shutil.copy(os.path.join(ICONS, 'atlas.svg'), site + '/atlas/icon.svg')
    shutil.copy(os.path.join(ICONS, 'png', 'atlas-180.png'), site + '/atlas/apple-touch-icon.png')
    for n in (192, 512): shutil.copy(os.path.join(ICONS, 'png', f'atlas-{n}.png'), f'{site}/atlas/icon-{n}.png')
# its own install manifest (Heph 2026-11-08, Atlas 0.5.9): without one, installing from /atlas/ found the Companion's
# manifest, whose scope covers the whole site, and installed the Companion. Scope and start are the Atlas's folder, so
# the two install as separate apps (the app id defaults to the start URL)
json.dump({'name': 'E9 Atlas', 'short_name': 'Atlas', 'description': 'Hex maps for E9 modules, from the whole region down to the 100-ft hex.',
           'start_url': './', 'scope': './', 'display': 'standalone', 'theme_color': '#2b2418', 'background_color': '#f4efe1',
           'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
                     {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]},
          open(site + '/atlas/manifest.webmanifest', 'w'), ensure_ascii=False, indent=1)
print(f'E9 Atlas {ATLAS} -> {site}/atlas/index.html')
