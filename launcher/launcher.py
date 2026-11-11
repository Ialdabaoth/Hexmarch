#!/usr/bin/env python3
"""Put the Hexmarch Launcher at the site's root (Heph 2026-11-10): links to the three apps, the campaigns this device
holds, and backup, restore and reset of what the apps keep in the browser. The apps sit beside it in companion/,
atlas/ and scribe/.

usage: python3 -I launcher/launcher.py <site dir>     (after scripts/changes.py stamp, so the versions are current)
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE)
site = os.path.abspath(sys.argv[1])
read = lambda *p: open(os.path.join(REPO, *p), encoding='utf-8').read()
NAME = json.loads(read('site.json')).get('name', 'Hexmarch')
versions = {
    'COMPANION': json.loads(read('companion-app', 'package.json'))['version'],
    'ATLAS': read('modules', 'tools', 'ATLAS_VERSION').strip(),
    'SCRIBE': read('scribe', 'VERSION').strip(),
}
html = read('launcher', 'index.html').replace('{{NAME}}', NAME)
for k, v in versions.items(): html = html.replace('{{' + k + '}}', v)
os.makedirs(site, exist_ok=True)
open(os.path.join(site, 'index.html'), 'w', encoding='utf-8').write(html)
shutil.copy(os.path.join(HERE, 'sw.js'), os.path.join(site, 'sw.js'))
# Heph 2026-11-10: the die that was the Companion's icon is now the Launcher's (icons/launcher.svg)
shutil.copy(os.path.join(REPO, 'icons', 'launcher.svg'), os.path.join(site, 'launcher.svg'))
shutil.copy(os.path.join(REPO, 'icons', 'png', 'launcher-180.png'), os.path.join(site, 'apple-touch-icon.png'))
for n in (192, 512): shutil.copy(os.path.join(REPO, 'icons', 'png', f'launcher-{n}.png'), os.path.join(site, f'launcher-{n}.png'))
# Installable too (Heph 2026-11-11), as "⬢ Hexmarch". Its scope is the page itself, not the folder: a scope of the whole
# site would cover companion/, atlas/ and scribe/, and phones would then call those "already installed" (the Companion
# had that scope before it moved).
json.dump({'name': f'⬢ {NAME}', 'short_name': NAME, 'description': 'Hexcrawl Campaign Manager: open the apps, switch campaigns, back up or reset this device.',
           'id': './index.html', 'start_url': './index.html', 'scope': './index.html', 'display': 'standalone',
           'launch_handler': {'client_mode': ['navigate-existing', 'auto']}, 'theme_color': '#2b2118', 'background_color': '#f4ecdc',
           'icons': [{'src': 'launcher-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': 'launcher-512.png', 'sizes': '512x512', 'type': 'image/png'},
                     {'src': 'launcher-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]},
          open(os.path.join(site, 'manifest.webmanifest'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{NAME} Launcher -> {site}/index.html ({", ".join(f"{k.title()} {v}" for k, v in versions.items())})')
