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
print(f'{NAME} Launcher -> {site}/index.html ({", ".join(f"{k.title()} {v}" for k, v in versions.items())})')
