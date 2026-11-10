#!/usr/bin/env python3
"""Put the Hexmarch Scribe app (the name comes from site.json "name") into <site>/scribe/ (Heph 2026-11-08: its own app at /scribe/ from day one).

usage: (cd scribe && npm ci && npm run build) && python3 -I scribe/scribe_app.py <site dir>
  e.g. python3 -I scribe/scribe_app.py _site

Copies the built app (scribe/dist/, Vite + Svelte since Scribe 0.1.2) and adds its own install manifest and icons,
so Scribe installs as a separate app from the Companion and the Atlas (start and scope are its own folder; the app
id defaults to the start URL).
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE)
site = os.path.abspath(sys.argv[1]); out = os.path.join(site, 'scribe')
VERSION = open(os.path.join(HERE, 'VERSION')).read().strip()
NAME = json.load(open(os.path.join(REPO, 'site.json'))).get('name', 'Hexmarch')  # Heph 2026-11-09: apps run any OSR hexcrawl core rules, so not "E9"
DIST = os.path.join(HERE, 'dist')
if not os.path.isfile(os.path.join(DIST, 'index.html')): sys.exit('scribe/dist/ is missing: run npm ci && npm run build in scribe/ first')
shutil.copytree(DIST, out, dirs_exist_ok=True)
ICONS = os.path.join(REPO, 'icons')  # icons/scribe.svg and its PNG renders (icons/README.md)
shutil.copy(os.path.join(ICONS, 'scribe.svg'), os.path.join(out, 'icon.svg'))
shutil.copy(os.path.join(ICONS, 'png', 'scribe-180.png'), os.path.join(out, 'apple-touch-icon.png'))
for n in (192, 512): shutil.copy(os.path.join(ICONS, 'png', f'scribe-{n}.png'), os.path.join(out, f'icon-{n}.png'))
# name "⬢ Scribe", short_name plain "Scribe" (Heph 2026-11-08; the same pattern as the Atlas and the Companion)
json.dump({'name': '⬢ Scribe', 'short_name': 'Scribe', 'description': f'The {NAME} module and campaign editor.',
           'start_url': './', 'scope': './', 'display': 'standalone', 'launch_handler': {'client_mode': ['navigate-existing', 'auto']}, 'theme_color': '#2b2118', 'background_color': '#f4ecdc',
           'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
                     {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]},
          open(os.path.join(out, 'manifest.webmanifest'), 'w'), ensure_ascii=False, indent=1)
print(f'{NAME} Scribe {VERSION} -> {out}/index.html')
