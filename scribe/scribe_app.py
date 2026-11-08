#!/usr/bin/env python3
"""Write the E9 Scribe app into <site>/scribe/ (Scribe 0.1.0, Heph 2026-11-08: its own app at /scribe/ from day one).

usage: python3 -I scribe/scribe_app.py <site dir>
  e.g. python3 -I scribe/scribe_app.py companion-app/dist

Writes index.html (version stamped from scribe/VERSION), its own install manifest and its icons, so Scribe installs
as a separate app from the Companion and the Atlas (start and scope are its own folder; the app id defaults to the start URL).
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE)
site = os.path.abspath(sys.argv[1]); out = os.path.join(site, 'scribe')
VERSION = open(os.path.join(HERE, 'VERSION')).read().strip()
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w').write(open(os.path.join(HERE, 'index.html')).read().replace('{{SCRIBE}}', VERSION))
ICONS = os.path.join(REPO, 'icons')  # icons/scribe.svg and its PNG renders (icons/README.md)
shutil.copy(os.path.join(ICONS, 'scribe.svg'), os.path.join(out, 'icon.svg'))
shutil.copy(os.path.join(ICONS, 'png', 'scribe-180.png'), os.path.join(out, 'apple-touch-icon.png'))
for n in (192, 512): shutil.copy(os.path.join(ICONS, 'png', f'scribe-{n}.png'), os.path.join(out, f'icon-{n}.png'))
# name "⬢ Scribe", short_name plain "Scribe" (Heph 2026-11-08; the same pattern as the Atlas and the Companion)
json.dump({'name': '⬢ Scribe', 'short_name': 'Scribe', 'description': 'The E9 module and campaign editor.',
           'start_url': './', 'scope': './', 'display': 'standalone', 'theme_color': '#2b2118', 'background_color': '#f4ecdc',
           'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
                     {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]},
          open(os.path.join(out, 'manifest.webmanifest'), 'w'), ensure_ascii=False, indent=1)
print(f'E9 Scribe {VERSION} -> {out}/index.html')
