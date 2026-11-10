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
for f in ('sw.js', 'launcher.svg'): shutil.copy(os.path.join(HERE, f), os.path.join(site, f))
print(f'{NAME} Launcher -> {site}/index.html ({", ".join(f"{k.title()} {v}" for k, v in versions.items())})')
