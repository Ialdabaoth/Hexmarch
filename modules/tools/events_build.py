"""A module's events and procedures, gathered for the Atlas (EVENTS_FORMAT.md section 2).

Every *.json file in the module folder, at any depth, with a top-level "events" block is merged, in path order
(case-sensitive, "/" before letters). Triggers and tables are keyed by id: a duplicate is reported and the first file
keeps it. Macros with the same vocabulary name must list the same values. At most one calendar. procedures/<ruleset>.json
files (format hexmarch-procedures/1) are published as they are. build.py writes the result to <out>/events.json:
{"format": "hexmarch-events/1", "events": {...}, "procedures": {"<file>": {...}}, "report": ["<file>: ..."]}
"""
import json, os

SKIP = {'atlas', 'geo', 'encounter-maps', 'bestiary', 'procedures', 'node_modules'}  # folders that never hold events blocks


def files(mdir):
    out = []
    for d, dirs, fs in os.walk(mdir):
        dirs[:] = sorted(x for x in dirs if x not in SKIP and not x.startswith('.'))
        for f in fs:
            if f.endswith('.json') and f != 'module.json': out.append(os.path.relpath(os.path.join(d, f), mdir).replace(os.sep, '/'))
    return sorted(out)


def gather(mdir):
    ev, where, report = {'triggers': [], 'tables': {}, 'macros': {}}, {}, []
    for rel in files(mdir):
        try:
            with open(os.path.join(mdir, rel), encoding='utf-8') as fh:
                if '"events"' not in fh.read(): continue  # most files are map data: skip them unread
            j = json.load(open(os.path.join(mdir, rel), encoding='utf-8'))
        except (ValueError, OSError) as e:
            report.append(f'{rel}: not read ({e})'); continue
        b = j.get('events') if isinstance(j, dict) else None
        if not isinstance(b, dict): continue
        for t in b.get('triggers') or []:
            if not isinstance(t, dict) or not t.get('id'): report.append(f'{rel}: a trigger without an id'); continue
            k = 'trigger ' + t['id']
            if k in where: report.append(f'{rel}: trigger "{t["id"]}" already defined in {where[k]}'); continue
            where[k] = rel; ev['triggers'].append(t)
        for tid, t in (b.get('tables') or {}).items():
            k = 'table ' + tid
            if k in where: report.append(f'{rel}: table "{tid}" already defined in {where[k]}'); continue
            where[k] = rel; ev['tables'][tid] = dict(t, id=tid) if isinstance(t, dict) else t
        for name, vals in (b.get('macros') or {}).items():
            if name in ev['macros'] and ev['macros'][name] != vals: report.append(f'{rel}: macro "{name}" lists other values than {where["macro " + name]}'); continue
            where.setdefault('macro ' + name, rel); ev['macros'][name] = vals
        if 'calendar' in b:
            if 'calendar' in ev: report.append(f'{rel}: a second calendar (the one in {where["calendar"]} is kept)')
            else: ev['calendar'] = b['calendar']; where['calendar'] = rel
    procs = {}
    pdir = os.path.join(mdir, 'procedures')
    for f in sorted(os.listdir(pdir)) if os.path.isdir(pdir) else []:
        if not f.endswith('.json'): continue
        try: p = json.load(open(os.path.join(pdir, f), encoding='utf-8'))
        except ValueError as e: report.append(f'procedures/{f}: not read ({e})'); continue
        if not isinstance(p, dict) or p.get('format') != 'hexmarch-procedures/1' or not isinstance(p.get('rules'), list):
            report.append(f'procedures/{f}: not a hexmarch-procedures/1 file with a "rules" list'); continue
        procs[f[:-5]] = p
    if not ev['triggers'] and not ev['tables'] and not procs and 'calendar' not in ev and not ev['macros']: return None
    return {'format': 'hexmarch-events/1', 'events': ev, 'procedures': procs, 'report': report}


def rules_procedures(repo):
    """The rules modules' procedures (modules/*-core/procedures/*.json), built into the Atlas page."""
    out, mods = [], os.path.join(repo, 'modules')
    for m in sorted(os.listdir(mods)) if os.path.isdir(mods) else []:
        pdir = os.path.join(mods, m, 'procedures')
        if not m.endswith('-core') or not os.path.isdir(pdir): continue
        for f in sorted(os.listdir(pdir)):
            if f.endswith('.json'):
                p = json.load(open(os.path.join(pdir, f), encoding='utf-8'))
                if isinstance(p, dict) and p.get('format') == 'hexmarch-procedures/1': out.append(dict(p, source=f'{m}/procedures/{f}'))
    return out


def rules_movement(repo):
    """Each ruleset's movement data (rules.json "movement" of its core rules module), built into the Atlas page: {ruleset: movement}."""
    out, mods = {}, os.path.join(repo, 'modules')
    for m in sorted(os.listdir(mods)) if os.path.isdir(mods) else []:
        d = os.path.join(mods, m)
        if not m.endswith('-core') or not os.path.exists(os.path.join(d, 'module.json')): continue
        man = json.load(open(os.path.join(d, 'module.json'), encoding='utf-8'))
        for rs, f in [(man.get('ruleset'), man.get('rules'))] + [(o.get('ruleset'), o.get('rules')) for o in man.get('options') or [] if isinstance(o, dict)]:
            p = os.path.join(d, f) if rs and isinstance(f, str) else ''
            if p and os.path.isfile(p):
                mv = json.load(open(p, encoding='utf-8')).get('movement')
                if isinstance(mv, dict): out[rs] = mv
    return out
