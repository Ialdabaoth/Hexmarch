#!/usr/bin/env python3
"""Checks src/rules/wiki-links.json against a clone of the SRD wiki.

    git clone https://github.com/Ialdabaoth/MateriaMundiRPG.wiki.git /tmp/wiki
    python3 scripts/check-wiki-links.py /tmp/wiki

The wiki is edited by hand, so run this after big wiki edits: it lists links whose
page or heading no longer exists. It never changes the wiki.
"""
import glob, json, os, re, sys

def slug(h):
    h = h.strip().lower()
    h = re.sub(r'[^\w\- ]', '', h)
    return h.replace(' ', '-')

wiki = sys.argv[1] if len(sys.argv) > 1 else '/tmp/wiki'
pages = {}
for f in glob.glob(os.path.join(wiki, '*.md')):
    name = os.path.basename(f)[:-3]
    anchors, seen = set(), {}
    for line in open(f, encoding='utf-8'):
        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            s = slug(m.group(2))
            if s in seen:
                seen[s] += 1
                s = f'{s}-{seen[s]}'
            else:
                seen[s] = 0
            anchors.add(s)
        anchors.update(re.findall(r'<a (?:name|id)="([^"]+)"', line))
    pages[name] = anchors

links = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'src', 'rules', 'wiki-links.json')))
bad = 0
for ref, target in links.items():
    page, _, anchor = target.partition('#')
    if page not in pages or (anchor and anchor not in pages[page]):
        print(f'{ref}: {target} not found')
        bad += 1
print(f'{len(links)} links, {bad} broken')
sys.exit(1 if bad else 0)
