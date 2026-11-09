#!/usr/bin/env python3
"""Change notes and version numbers for the apps (Heph 2026-11-09: no more hand-numbered versions).

A PR never edits a version number or a CHANGELOG.md. It adds one change note per app it changes:
<app folder>/changes/<short-name>.md, whose text is the changelog entry. Two PRs add two different
files, so they never collide.

The version is worked out, not written by hand: the version in the app's version file (the last
release) plus one patch for each change note. The notes are numbered in the order they reached main,
so whichever PR merges first gets the lower number.

usage: python3 -I scripts/changes.py version <app>     print the app's version (e.g. 0.5.18)
       python3 -I scripts/changes.py list               every app, its version and its notes in order
       python3 -I scripts/changes.py stamp              write the versions and CHANGELOG.md entries into the
                                                        working tree (the site workflow does this before it
                                                        builds; never commit the result by hand)
       python3 -I scripts/changes.py check [<ref>]      fail if this tree numbers a version or a CHANGELOG.md
                                                        entry by hand, compared with <ref> (default origin/main)
       python3 -I scripts/changes.py release <app>      fold the app's notes into CHANGELOG.md, write the
                                                        version and delete the notes (a release PR)
       python3 -I scripts/changes.py minor <app>        release, then start the next minor (0.5.18 -> 0.6.0)
apps: companion, atlas, scribe, e9-core
"""
import os, re, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = '<!-- changes.py: new entries go below this line -->'
# where each app keeps its version: (kind, file); 'json' = the first "version" field, 'lock' = the first two
APPS = {
    'companion': {'dir': 'companion-app', 'files': [('json', 'package.json'), ('lock', 'package-lock.json')], 'style': 'line'},
    'atlas': {'dir': 'modules/tools', 'files': [('text', 'ATLAS_VERSION')], 'style': 'line'},
    'scribe': {'dir': 'scribe', 'files': [('text', 'VERSION')], 'style': 'line'},
    'e9-core': {'dir': 'modules/e9-core', 'files': [('json', 'module.json')], 'style': 'heading'},
}
VER = re.compile(r'("version"\s*:\s*")(\d+\.\d+\.\d+)(")')


def path(app, name): return os.path.join(REPO, APPS[app]['dir'], name)


def base(app):
    kind, name = APPS[app]['files'][0]
    text = open(path(app, name)).read()
    return text.strip() if kind == 'text' else VER.search(text).group(2)


def arrival():
    """Each change note's place in the order it reached main: the first-parent history, oldest first."""
    try:
        out = subprocess.run(['git', '-C', REPO, 'log', '--first-parent', '--reverse', '--diff-filter=A', '--name-only',
                              '--format=', '--'] + [APPS[a]['dir'] + '/changes' for a in APPS],
                             capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return {}
    order = {}
    for line in out.splitlines():
        if line.strip() and line not in order: order[line] = len(order)
    return order


def notes(app, order=None):
    """The app's change notes, oldest first (notes git doesn't know yet come last, by name)."""
    d = path(app, 'changes')
    if not os.path.isdir(d): return []
    order = arrival() if order is None else order
    names = sorted(n for n in os.listdir(d) if n.endswith('.md') and n != 'README.md')
    rel = APPS[app]['dir'] + '/changes/'
    return sorted(names, key=lambda n: (order.get(rel + n, len(order)), n))


def bump(v, n=0, minor=False):
    a, b, c = (int(x) for x in v.split('.'))
    return f'{a}.{b + 1}.0' if minor else f'{a}.{b}.{c + n}'


def numbered(app, order=None):
    v0 = base(app)
    return [(bump(v0, i + 1), n, open(os.path.join(path(app, 'changes'), n)).read().strip()) for i, n in enumerate(notes(app, order))]


def version(app, order=None):
    return bump(base(app), len(notes(app, order)))


def write_version(app, v):
    for kind, name in APPS[app]['files']:
        p = path(app, name)
        if kind == 'text':
            open(p, 'w').write(v + '\n')
        else:
            text = open(p).read()
            open(p, 'w').write(VER.sub(lambda m: m.group(1) + v + m.group(3), text, count=2 if kind == 'lock' else 1))


def entry(app, v, text):
    if APPS[app]['style'] == 'heading': return f'\n## {v}\n\n{text}\n'
    return f'- {v}: ' + '\n  '.join(text.splitlines()) + '\n'


def write_changelog(app, items):
    p = path(app, 'CHANGELOG.md')
    text = open(p).read()
    if MARK not in text: sys.exit(f'{p}: no "{MARK}" line to put the entries under')
    new = ''.join(entry(app, v, t) for v, _, t in reversed(items))  # newest first, like the rest of the file
    open(p, 'w').write(text.replace(MARK + '\n', MARK + '\n' + new, 1))


def stamp(app, order):
    items, v = numbered(app, order), version(app, order)
    write_version(app, v)
    if items: write_changelog(app, items)
    return items, v


def check(ref):
    """Fail a PR that numbers a version or a changelog entry by hand (a release PR, which also deletes notes, is fine)."""
    def at_ref(rel):
        r = subprocess.run(['git', '-C', REPO, 'show', f'{ref}:{rel}'], capture_output=True, text=True)
        return r.stdout if r.returncode == 0 else None
    def ls_ref(rel):
        r = subprocess.run(['git', '-C', REPO, 'ls-tree', '--name-only', f'{ref}:{rel}'], capture_output=True, text=True)
        return [n for n in r.stdout.split() if n.endswith('.md') and n != 'README.md']
    bad = []
    for a, c in APPS.items():
        released = len(ls_ref(c['dir'] + '/changes')) > len(notes(a))
        kind, name = c['files'][0]
        old = at_ref(f"{c['dir']}/{name}")
        if old is None or released: continue
        was = old.strip() if kind == 'text' else VER.search(old).group(2)
        if was != base(a) and base(a) != bump(was, minor=True):
            bad.append(f"{c['dir']}/{name}: the version changed by hand ({was} -> {base(a)}); add a note in {c['dir']}/changes/ instead")
        old_log = at_ref(f"{c['dir']}/CHANGELOG.md") or ''
        head = re.compile(r'^(- \d+\.\d+\.\d+:|## \d+\.\d+\.\d+\s*$)', re.M)
        added = set(head.findall(open(path(a, 'CHANGELOG.md')).read())) - set(head.findall(old_log))
        if added:
            bad.append(f"{c['dir']}/CHANGELOG.md: numbered entries added by hand ({', '.join(sorted(added))}); put the text in a note in {c['dir']}/changes/ instead")
    for b in bad: print('::error::' + b)
    if bad: sys.exit(1)
    print('versions and changelogs: no hand-numbered changes')


def main(argv):
    cmd, app = (argv + [None, None])[:2]
    if cmd in ('version', 'release', 'minor') and app not in APPS: sys.exit(__doc__)
    order = arrival()
    if cmd == 'version':
        print(version(app, order))
    elif cmd == 'list':
        for a in APPS:
            print(f'{a} {version(a, order)} (released {base(a)})')
            for v, n, _ in numbered(a, order): print(f'  {v}  {APPS[a]["dir"]}/changes/{n}')
    elif cmd == 'stamp':
        for a in APPS:
            print(a, stamp(a, order)[1])
    elif cmd == 'check':
        check(app or 'origin/main')
    elif cmd in ('release', 'minor'):
        items, _ = stamp(app, order)
        for _, n, _ in items: os.remove(os.path.join(path(app, 'changes'), n))
        if cmd == 'minor': write_version(app, bump(base(app), minor=True))
        print(f'{app} {base(app)}: {len(items)} notes folded into {APPS[app]["dir"]}/CHANGELOG.md')
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
