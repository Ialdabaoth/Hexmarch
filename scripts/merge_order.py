#!/usr/bin/env python3
"""The "merge order" check on pull requests (Heph 2026-11-09), run by .github/workflows/merge-order.yml.

A PR waits (status "pending", so it can't merge, and auto-merge holds it) while
  - its description says "Merge after #N" or "Depends on #N" and #N isn't merged yet, or
  - an older open PR (lower number, not a draft) changes the same app, unless that older PR itself says
    "Merge after #<this one>", or this PR's description has a line "Merge order: any".
Otherwise the check is green. It runs when a PR is opened, edited or pushed to, and for every open PR when
main changes or a PR closes, so a waiting PR turns green the moment its predecessor merges.

usage (in the workflow): GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name python3 -I scripts/merge_order.py [<pr number>]
"""
import json, os, re, sys, urllib.error, urllib.request

API = 'https://api.github.com/repos/' + os.environ['GITHUB_REPOSITORY']
CONTEXT = 'merge order'
# the app or module a path belongs to (CONTRIBUTING.md "How work is organised")
APPS = {'companion-app/': 'Companion', 'modules/tools/': 'Atlas', 'scribe/': 'Scribe', 'engine/': 'the engine',
        'modules/e9-core/': 'e9-core', 'vtt/': 'the VTT bridges', 'icons/': 'the icons'}
AFTER = re.compile(r'(?:merge\s+after|depends\s+on)\s*:?\s*((?:#\d+[\s,]*(?:and\s*)?)+)', re.I)
ANY = re.compile(r'^\s*merge\s+order\s*:\s*any\b', re.I | re.M)


def call(url, data=None):
    req = urllib.request.Request(url if url.startswith('https:') else API + url, method='POST' if data else 'GET',
                                 data=json.dumps(data).encode() if data else None,
                                 headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
                                          'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(req) as r: return json.load(r)


def pages(url):
    out, page = [], 1
    while True:
        got = call(f'{url}{"&" if "?" in url else "?"}per_page=100&page={page}')
        out += got; page += 1
        if len(got) < 100: return out


def after(pr): return {int(n) for m in AFTER.findall(pr.get('body') or '') for n in re.findall(r'\d+', m)}


def apps(pr):
    return {name for f in pages(f'/pulls/{pr["number"]}/files') for prefix, name in APPS.items() if f['filename'].startswith(prefix)}


def waits(pr, open_prs):
    out = []
    for n in sorted(after(pr)):
        try: o = open_prs.get(n) or call(f'/pulls/{n}')
        except urllib.error.HTTPError: continue  # an issue, not a PR
        if o.get('merged_at'): continue
        out.append(f'#{n} closed unmerged (edit the "Merge after" line)' if o['state'] == 'closed' else f'#{n}')
    if not ANY.search(pr.get('body') or ''):
        mine = apps(pr)
        for n, o in sorted(open_prs.items()):
            if n >= pr['number'] or o['draft'] or pr['number'] in after(o) or f'#{n}' in out: continue
            shared = mine & apps(o)
            if shared: out.append(f'#{n} (also changes {", ".join(sorted(shared))})')
    return out


def main(argv):
    open_prs = {p['number']: p for p in pages('/pulls?state=open')}
    targets = [int(argv[0])] if argv else sorted(open_prs)
    for n in targets:
        pr = open_prs.get(n)
        if not pr: continue
        w = waits(pr, open_prs)
        state, text = ('pending', 'Waiting for ' + ', '.join(w) + ' to merge') if w else ('success', 'Nothing to wait for')
        call(f'/statuses/{pr["head"]["sha"]}', {'state': state, 'context': CONTEXT, 'description': text[:140]})
        print(f'#{n}: {state}: {text}')


if __name__ == '__main__':
    main(sys.argv[1:])
