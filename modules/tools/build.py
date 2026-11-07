#!/usr/bin/env python3
"""Build one module: web viewer, E9 Atlas map and app manifest from the same maps (print PDFs only with --pdf).

usage: python3 -I modules/tools/build.py <module dir> <out dir> [--pdf]
  e.g. python3 -I modules/tools/build.py modules/isle-of-mists dist/modules/isle-of-mists

Writes <out>/index.html (viewer), <out>/module.json (manifest for the companion app),
<out>/maps/*.svg, and with --pdf <out>/print/{atlas,leagues}.pdf. See modules/MODULE_FORMAT.md.
Print PDFs are off by default until the print process is settled (Heph 2026-11-07); --pdf still makes them (needs Playwright).
Creatures (CREATURES_FORMAT.md): every *.json with an "encounters" block merges into <out>/encounters.json,
bestiary/<ruleset>.json files are copied, and the viewers get a resolved list of who lives at which site.
"""
import datetime, json, os, re, shutil, subprocess, sys, unicodedata, urllib.request

TOOLS = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(TOOLS)
mdir, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]); PDF = '--pdf' in sys.argv
MOD = json.load(open(os.path.join(mdir, 'module.json')))
work = os.path.join(out, '_work'); os.makedirs(work, exist_ok=True); os.makedirs(out + '/maps', exist_ok=True)
PY = [sys.executable, '-I']
MI_KM = 1.524  # the game mile is exactly 5000 feet

def slug(t):
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')

# terrain data: SRTM tiles are fetched once into modules/.cache/geo
geo = os.path.join(ROOT, '.cache', 'geo'); os.makedirs(geo, exist_ok=True)
la0, la1, lo0, lo1 = MOD['dem']
for la in range(la0, la1 + 1):
    for lo in range(lo0, lo1 + 1):
        t = f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"
        f = os.path.join(geo, t + '.hgt.gz')
        if not os.path.exists(f):
            print('fetching', t); urllib.request.urlretrieve(f'https://s3.amazonaws.com/elevation-tiles-prod/skadi/{t[:3]}/{t}.hgt.gz', f)
try: sha = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True, cwd=ROOT).stdout.strip()
except Exception: sha = ''
ATLAS = open(TOOLS + '/ATLAS_VERSION').read().strip()  # the E9 Atlas app and tools (Heph 2026-11-05); patch per PR, separate from each module's version
VER = f"v{MOD['version']}" + (f"+{os.environ.get('GITHUB_SHA', sha)[:7]}" if (os.environ.get('GITHUB_SHA') or sha) else '') + ' · ' + datetime.date.today().isoformat()
ENV = dict(os.environ, HEXDEM=','.join(map(str, MOD['dem'])), HEXADMIN=os.path.normpath(os.path.join(mdir, MOD['admin'])),
           HEXTILES=os.path.join(ROOT, 'assets', 'tiles', 'icons'), HEXGEO=geo, MODVER=VER, MODATLAS=ATLAS, MODTITLE=MOD.get('short', MOD['title']),
           HEXSITEICONS=json.dumps(MOD.get('site_icons', {}), ensure_ascii=False), HEXDUMP='1')
def run(*a): subprocess.run(list(a), check=True, env=ENV, stdout=subprocess.DEVNULL)

# 1. the world map: every book's county sites on one 3-mile grid, at print scale (1 in per hex)
R = MOD['regions']; HX = MOD['atlas']['hex_mi']
sites, seen, home = [], set(), {}
for b in MOD['books']:
    for st in R[b['region']]['sites']:
        if st[0] in seen: continue
        seen.add(st[0]); sites.append(st); home[st[0]] = b
world = dict(MOD['world'], hex_mi=HX, px=round(96 / (HX * MI_KM), 4), master=True, title=MOD['title'], subtitle='', sites=sites)
json.dump({'world': world}, open(work + '/world.json', 'w'), ensure_ascii=False)
run(*PY, TOOLS + '/hexmap.py', geo, work, work + '/world.json')
# atlas.land = "island": the E9 Atlas covers every county on the island (Heph 2026-11-06, all of Ireland), while the print maps
# stay on the books' counties; this second, unprinted run only gives atlas_convert.py its Marches and the island's rivers
if MOD['atlas'].get('land') == 'island':
    json.dump({'island': dict(world, counties='*', sites=[])}, open(work + '/island.json', 'w'), ensure_ascii=False)
    run(*PY, TOOLS + '/hexmap.py', geo, work, work + '/island.json')
# 2. March pages (the print atlas: one 24-mile hex per page), 3. League pages (one 3-mile hex per page)
run(*PY, TOOLS + '/atlas_pages.py', work + '/world.svg', work + '/world-grid.json', work + '/atlas.html')
run(*PY, TOOLS + '/league_pages.py', os.path.join(mdir, 'module.json'), work + '/atlas-index.json', work + '/world-grid.json', work + '/league')
# E9 Atlas format (ATLAS_FORMAT.md): the same terrain as one map JSON + one PNG per March, for the dynamic renderer
if 'centroid' in MOD['atlas']:
    run(*PY, TOOLS + '/atlas_convert.py', os.path.join(mdir, 'module.json'), work, out + '/atlas')
    run(*PY, TOOLS + '/atlas_cache.py', out + '/atlas')  # the pieces the Atlas loads around the view (rebuilt when a March PNG changes)
    run(*PY, TOOLS + '/atlas_roads.py', os.path.join(mdir, 'module.json'), out + '/atlas')  # module.json atlas.roads, laid over the Field terrain in the cache
    # the dynamic renderer (preview): atlas/index.html draws every level from map.json + the March PNGs, with the shared tiles
    AJ = json.load(open(out + '/atlas/map.json')); os.makedirs(out + '/atlas/tiles', exist_ok=True)
    TD = os.path.join(ROOT, 'assets', 'tiles', 'icons')
    want = {t['icon'] for t in AJ['terrain']['types'] if t.get('icon')} | {p['icon'] for p in AJ['pois'] if p.get('icon')}
    want |= {t['tile'] for t in AJ['terrain']['types']}
    for n in sorted(want | {n + '-x' for n in want if n.startswith('bg-')}):  # full RGBA, as drawn
        if os.path.exists(f'{TD}/{n}.png'): shutil.copy(f'{TD}/{n}.png', f'{out}/atlas/tiles/{n}.png')
    # blends: not the 96 bleed tiles (4 MB) but Heph's edge and corner masks, rotated, as 8-bit greyscale (Heph 2026-11-05);
    # the renderer multiplies each into the colour's own tile on the phone, exactly as tiles_blend.py does
    from PIL import Image
    MD = os.path.join(ROOT, 'assets', 'tiles', 'masks')
    for kind, f in (('e', 'edge.png'), ('c', 'corner.png')):
        m = Image.open(os.path.join(MD, f)).getchannel('A')
        for k in range(6):
            r = m.rotate(-60 * k, resample=Image.BICUBIC, center=(m.width / 2, m.height / 2))
            r.save(f'{out}/atlas/tiles/mask-{kind}{k}.png', optimize=True)
            x = Image.new('L', (r.width + 8, r.height + 8)); x.paste(r, (4, 4))  # the -x twins' 4 px margin, edge pixels repeated
            for p_ in range(4):
                x.paste(r.crop((0, 0, r.width, 1)), (4, p_)); x.paste(r.crop((0, r.height - 1, r.width, r.height)), (4, r.height + 4 + p_))
            for p_ in range(4):
                x.paste(x.crop((4, 0, 5, x.height)), (p_, 0)); x.paste(x.crop((r.width + 3, 0, r.width + 4, x.height)), (r.width + 4 + p_, 0))
            x.save(f'{out}/atlas/tiles/mask-{kind}{k}-x.png', optimize=True)
    # the app itself lives once at <site>/atlas/ (atlas_app.py, Atlas 0.3.0); this old address forwards there, keeping the #link
    open(out + '/atlas/index.html', 'w').write(f'<!doctype html><meta charset="utf-8"><title>{MOD["title"]} · E9 Atlas</title><meta name="robots" content="noindex">'
        f'<script>location.replace("../../../atlas/?module={MOD["id"]}" + location.hash)</script><p>The E9 Atlas moved to <a href="../../../atlas/?module={MOD["id"]}">its own page</a>.</p>')
# 4. PDFs
if PDF:
    os.makedirs(out + '/print', exist_ok=True)
    for src, dst in ((work + '/atlas.html', 'atlas.pdf'), (work + '/league/leagues.html', 'leagues.pdf')):
        run('node', TOOLS + '/pdf.js', src, 'none'); shutil.move(src.replace('.html', '.pdf'), out + '/print/' + dst)

# 5. web: the same SVGs, one shared icon set, plus the manifest
AI = json.load(open(work + '/atlas-index.json')); PI = json.load(open(work + '/league/league-index.json')); G = json.load(open(work + '/world-grid.json'))
syms = {}
def web_svg(src, dst, links=None, overlay=''):
    s = open(src).read()
    if overlay: s = s[:s.rindex('</svg>')] + overlay + '</svg>'
    for sym in re.findall(r'<symbol .*?</symbol>', s, flags=re.S): syms[re.search(r'id="([^"]+)"', sym).group(1)] = sym
    s = re.sub(r'<symbol .*?</symbol>', '', s, flags=re.S)
    if links:
        s = re.sub(r'(<g class="site" data-site="([^"]+)".*?</g>)', lambda m: f'<a href="{links[m.group(2)]}">{m.group(1)}</a>' if m.group(2) in links else m.group(1), s, flags=re.S)
    open(dst, 'w').write(s)
expl_of = {}
for p in PI:
    for n in p['members']: expl_of[n] = p
    for s_ in p['sites']: expl_of.setdefault(s_['name'], p)
page_of = {n: v['page'] for v in AI.values() for n in v['sites']}
wsite = {s_['name']: s_ for s_ in G['sites']}
web_svg(work + '/world.svg', out + '/maps/world.svg', {slug(n): f"#{p['key']}--{slug(n)}" for n, p in expl_of.items()})
for p in PI: web_svg(f"{work}/league/{p['key']}.svg", f"{out}/maps/{p['key']}.svg", overlay=p['overlay'])
allsrc = {st[0]: st for k in R for st in R[k].get('sites', [])}
SITES = []
for n, p in sorted(expl_of.items(), key=lambda kv: kv[0]):
    st = allsrc.get(n, [n, p['lat'], p['lon'], 'ruin'])
    b = home.get(n) or next(x for x in MOD['books'] if x['id'] == p['book'])
    w = wsite.get(n)
    SITES.append(dict(slug=slug(n), name=n, kind=st[3], book=b['id'], county=b['county'], lat=st[1], lon=st[2], note=st[4] if len(st) > 4 else '',
                      world_hex=w['hex'] if w else None, world_px=w['px'] if w else None, march_page=page_of.get(n), league=p['key'], league_hex=p['hex'], league_page=p['page']))
# links from before the League pages (version 0.1): #p-<lead site> opens that site's League
ALIASES = {}
for s_ in SITES:
    for k in {'p-' + s_['slug'], 'p-' + slug(s_['name'].split(' (')[0])}: ALIASES.setdefault(k, s_['league'])
# creatures (CREATURES_FORMAT.md): the fiction layer from every *.json with an "encounters" block, merged by block name,
# and each ruleset's mechanics layer; both are published as they are, and the viewers get a resolved summary per creature
def merge(a, b):
    for k, v in b.items(): a[k] = merge(a.get(k, {}), v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return a
ENC = {}
for f in sorted(os.listdir(mdir)):
    if f.endswith('.json') and f != 'module.json':
        j = json.load(open(os.path.join(mdir, f)))
        if isinstance(j, dict) and 'encounters' in j: merge(ENC, j['encounters'])
BEST = {}
bdir = os.path.join(mdir, 'bestiary')
for f in sorted(os.listdir(bdir)) if os.path.isdir(bdir) else []:
    if f.endswith('.json'): BEST[f[:-5]] = json.load(open(os.path.join(bdir, f)))
def resolve(rid, cid, depth=0):  # "blank" or another creature of this module, then replace (adjust adds numbers); bestiary refs stay unresolved here
    e = BEST[rid]['creatures'].get(cid)
    if not e or depth > 6: return None
    base = {} if e.get('from', 'blank') == 'blank' else (resolve(rid, e['from'], depth + 1) or {'from': e['from']})
    st = merge(json.loads(json.dumps(base)), e.get('replace', {}))
    def adj(t, a):
        for k, v in a.items():
            if isinstance(v, (int, float)) and isinstance(t.get(k, 0), (int, float)): t[k] = t.get(k, 0) + v
            elif isinstance(v, dict) and ('add' in v or 'remove' in v): t[k] = [x for x in t.get(k, []) if x not in v.get('remove', [])] + v.get('add', [])
            elif isinstance(v, dict): t[k] = adj(t.get(k, {}), v)
        return t
    return adj(st, e.get('adjust', {}))
site_of = {s_['slug']: s_ for s_ in SITES}
CREATURES = []
for cid, c in ENC.get('creatures', {}).items():
    w = c.get('lair') or {}
    s_ = site_of.get(w.get('site'))
    CREATURES.append(dict(id=cid, name=c.get('name', cid), kind=c.get('kind', 'monster'), **{k: c[k] for k in ('is', 'troupe', 'faction', 'description', 'wants', 'knows') if k in c},
                          site=w.get('site'), **({'room': w['room']} if w.get('room') else {}), hex=w.get('hex'), site_name=s_['name'] if s_ else None, world_hex=s_['world_hex'] if s_ else None,
                          league=s_['league'] if s_ else None, league_hex=s_['league_hex'] if s_ else None,
                          stats={r: resolve(r, cid) for r in BEST if cid in BEST[r].get('creatures', {})}))
if ENC:
    json.dump({'encounters': ENC}, open(out + '/encounters.json', 'w'), ensure_ascii=False, indent=1)
    os.makedirs(out + '/bestiary', exist_ok=True)
    for r, b in BEST.items(): json.dump(b, open(f'{out}/bestiary/{r}.json', 'w'), ensure_ascii=False, indent=1)
    if os.path.isdir(out + '/atlas'): json.dump({'creatures': CREATURES, 'scenes': ENC.get('scenes', {})}, open(out + '/atlas/creatures.json', 'w'), ensure_ascii=False)
# Encounter maps (ENCOUNTER_FORMAT.md): published as they are, one JSON per map plus its pictures
EMAPS = {}
edir = os.path.join(mdir, 'encounter-maps')
if os.path.isdir(edir):
    subprocess.run(PY + [TOOLS + '/encounter_check.py', mdir], check=True)  # stops the build on a broken map or pointer
    shutil.copytree(edir, out + '/encounter-maps', dirs_exist_ok=True, ignore=shutil.ignore_patterns('plan.json'))
    EMAPS = {f[:-5]: f'encounter-maps/{f}' for f in sorted(os.listdir(edir)) if f.endswith('.json')}
for s_ in SITES:
    if MOD.get('site_encounters', {}).get(s_['name']): s_['encounter'] = MOD['site_encounters'][s_['name']]
H0 = next(h for h in G['hexes'] if h['col'] == 0 and h['row'] == 0)
M = {'format': 'mm-module/1', 'id': MOD['id'], 'title': MOD['title'], 'short': MOD.get('short', MOD['title']), 'version': VER, 'atlas': ATLAS, 'license': MOD.get('license', 'CC0-1.0'),
     'scales': {'mile_ft': 5000, 'region_hex_mi': MOD['atlas']['page_hex_mi'], 'march_hex_mi': HX, 'league_hex_mi': MOD['league']['hex_mi'], 'field_hex_ft': 100, 'encounter_square_ft': 5},
     'books': MOD['books'],
     'world': {'map': 'maps/world.svg', 'width': round(G['W'], 1), 'height': round(G['H'], 1), 'hex_px': round(G['hex_px'], 3), 'col_px': round(G['w_px'], 3),
               'origin_px': H0['px'], 'grid': 'flat-top, odd columns shifted down, ids CCRR from 0101',
               'hexes': [{'id': f"{h['col']+1:02d}{h['row']+1:02d}", 't': h['t'], 'in': h['inside']} for h in G['hexes']]},
     'marches': [dict(page=v['page'], id=k, center_px=v['center_px'], radius_px=v['radius_px'], neighbors=v['neighbors'], sites=[slug(n) for n in v['sites']]) for k, v in sorted(AI.items(), key=lambda kv: kv[1]['page'])],
     'leagues': [dict(page=p['page'], key=p['key'], hex=p['hex'], map=f"maps/{p['key']}.svg", title=p['lead'], book=p['book'], county=p['county'], lat=p['lat'], lon=p['lon'], terrain=p['terrain'],
                      center_px=p['center_px'], sites=[dict(s_, slug=slug(s_['name'])) for s_ in p['sites']]) for p in PI],
     'sites': SITES, 'aliases': ALIASES,
     **({'encounters': 'encounters.json', 'bestiary': {r: f'bestiary/{r}.json' for r in BEST}} if ENC else {}),
     **({'encounter_maps': EMAPS} if EMAPS else {}),
     **({'atlas_map': 'atlas/map.json'} if os.path.isdir(out + '/atlas') else {}),  # the E9 Atlas app (<site>/atlas/) lists modules that have one
     'names': MOD.get('names', {}),  # label translations {name as on the map: {'en': ..., 'ga': ...}}; the viewer's Language box uses them
     'links': {'world': '#world', 'march': '#march-<page>', 'league': '#l-<march hex>', 'site': '#l-<march hex>--<slug>', 'hex': '#<map>:<hex>'},
     'print': {'atlas': 'print/atlas.pdf', 'leagues': 'print/leagues.pdf'} if PDF else {}}
json.dump(M, open(out + '/module.json', 'w'), ensure_ascii=False, indent=1)
tpl = open(TOOLS + '/viewer.html').read()
lite = {k: v for k, v in M.items() if k != 'world'}; lite['world'] = {k: v for k, v in M['world'].items() if k != 'hexes'}; lite['creatures'] = CREATURES; lite['scenes'] = ENC.get('scenes', {})
CARD = open(TOOLS + '/creature_card.html').read() + open(TOOLS + '/encounter_view.html').read() + open(TOOLS + '/vtt_export.html').read() + open(TOOLS + '/vtt_bridge.html').read()  # index card and encounter map viewer
html = tpl.replace('<!--CARD-->', CARD).replace('/*DATA*/', json.dumps(lite, ensure_ascii=False).replace('</', '<\\/')).replace('<!--SYMBOLS-->', ''.join(syms.values())).replace('{{TITLE}}', MOD['title'])
open(out + '/index.html', 'w').write(html)
# a module that changed its id leaves a page at each old address that forwards to the new one, keeping ?mode and #links
for old in MOD.get('moved_from', []):
    od = os.path.join(os.path.dirname(out), old); os.makedirs(od, exist_ok=True)
    open(os.path.join(od, 'index.html'), 'w').write(f'<!doctype html><meta charset="utf-8"><title>{MOD["title"]}</title><meta name="robots" content="noindex">'
        f'<script>location.replace("../{MOD["id"]}/" + location.search + location.hash)</script><p>This module moved to <a href="../{MOD["id"]}/">{MOD["title"]}</a>.</p>')
if os.environ.get('KEEP_WORK') is None: shutil.rmtree(work)
print(f"Atlas {ATLAS} · {MOD['id']} {VER}: {len(M['marches'])} March pages, {len(M['leagues'])} League pages, {len(SITES)} sites, {len(CREATURES)} creatures -> {out}")
