# Print POI pages: 1 in = 1/2 mile hexes, about 2 miles each way, same 11x8.5 in layout as the atlas.
# usage: HEXTILES=... python3 -I poi_pages.py <regions.json> <atlas-index.json> <atlas-grid.json> <outdir>
import json, math, re, sys, os, subprocess, html, unicodedata
MJ, AIDX, AGRID, OUT = sys.argv[1:5]
MOD = json.load(open(MJ)); A = MOD['regions']; os.makedirs(OUT, exist_ok=True)
TITLE = os.environ.get('MODTITLE', MOD.get('short', MOD['title'])); VER = os.environ.get('MODVER', 'dev')
EXP = MOD.get('exploration', {}); CLUSTER = EXP.get('cluster_mi', 1.2); OVR = EXP.get('overrides', {})
DPI = 96; MX, MY, MW, MH = 24, 24, 840, 768; LX = MX + MW + 14; LW = 1056 - 24 - LX
HMI = .5; MI_PX = DPI / HMI                          # 192 px per mile
KMI = 1.609344
def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")
COUNTY = {b['region']: (b['county'], b['id'], b['detail']) for b in MOD['books']}
DET = {v[2]: k for k, v in COUNTY.items()}
def inside(bb, lat, lon): return bb[0] <= lon <= bb[2] and bb[1] <= lat <= bb[3]
def mi(a, b):
    return math.hypot((a[1] - b[1]) * 111.32 * math.cos(math.radians(a[0])), (a[0] - b[0]) * 111.32) / KMI
# every site we know, once; county maps first so their names lead
allsites = []
for key in list(COUNTY) + list(DET):
    for st in A[key]['sites']:
        if any(s[0] == st[0] and mi(s[1:3], st[1:3]) < 1 or mi(s[1:3], st[1:3]) < .15 for s in allsites): continue
        allsites.append(list(st[:5]) + [""] * (5 - len(st[:5])) + [key])
# clusters: sites within 1.2 mi share a page
clusters = []
for st in allsites:
    for c in clusters:
        if mi(c['c'], st[1:3]) < CLUSTER: c['m'].append(st); c['c'] = (sum(s[1] for s in c['m']) / len(c['m']), sum(s[2] for s in c['m']) / len(c['m'])); break
    else: clusters.append(dict(m=[st], c=(st[1], st[2])))
def host(lat, lon, key):
    own = COUNTY[key][2] if key in COUNTY else key
    det = own if inside(A[own]['bbox'], lat, lon) else next((d for d in DET if inside(A[d]['bbox'], lat, lon)), None)
    ck = DET.get(det) if det else key
    return det, ck
R = {}; meta = []
for c in clusters:
    lat, lon = c['c']; lead = c['m'][0]
    det, ck = host(lat, lon, lead[5])
    src = A[det] if det else A[ck]
    hw, hh = (MW / 2 / MI_PX + .6), (MH / 2 / MI_PX + .6)          # miles each way, plus a margin
    dl = hh * KMI / 111.32; dn = hw * KMI / (111.32 * math.cos(math.radians(lat)))
    bb = [lon - dn, lat - dl, lon + dn, lat + dl]
    key = 'p-' + slug(lead[0].split(' (')[0])
    sites = [s[:5] for s in allsites if inside(bb, s[1], s[2])]
    r = dict(bbox=[round(v, 5) for v in bb], hex_mi=HMI, agg=3, px=round(MI_PX / KMI, 4), master=True, title=lead[0], subtitle='',
             sites=sites, rivers=[])
    for kk in ('river_km2', 'forest', 'bog_east_of', 'bog_sd', 'hill_rel', 'patches', 'bog_north_of'):
        if kk in src: r[kk] = src[kk]
    r.setdefault('hill_rel', 60); r.setdefault('river_km2', 20)
    if not det: r.update(OVR.get(COUNTY[ck][0], {}))
    R[key] = r
    meta.append(dict(key=key, lead=lead[0], members=[s[0] for s in c['m']], county=COUNTY[ck][0], book=COUNTY[ck][1], lat=round(lat, 5), lon=round(lon, 5)))
json.dump(R, open(OUT + '/poi-regions.json', 'w'), ensure_ascii=False)
subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hexmap.py'), os.environ.get('HEXGEO', 'geo'), OUT, OUT + '/poi-regions.json'], check=True, stdout=subprocess.DEVNULL)
# atlas cross-reference: which 3-mile hex and page holds the lead site
AI = json.load(open(AIDX)); AG = json.load(open(AGRID))
site_hex = {s['name']: s['hex'] for s in AG['sites']}
site_pg = {n: v['page'] for v in AI.values() for n in v['sites']}
SI = {"castle": "keep", "town": "village", "tomb": "stones", "hill": "hills", "cave": "cave", "ruin": "ruins", "grove": "trees", "camp": "community", "lair": "hole", "mist": "fog", "dead": "graveyard"}
T = [('Grassland', 'bg-green', None), ('Forest', 'bg-green', 'forest'), ('Light woods', 'bg-green', 'trees'), ('Bog', 'bg-grey', 'swamp'), ('Hills', 'bg-green', 'hills'), ('Mountains', 'bg-brown', 'mountains')]
def esc(t): return html.escape(t, quote=True)
def wrap(t, n):
    out, line = [], ''
    for w in t.split():
        if len(line) + len(w) + 1 > n and line: out.append(line); line = w
        else: line = (line + ' ' + w).strip()
    return out + [line]
BO = {b['id']: n for n, b in enumerate(MOD['books'])}
meta.sort(key=lambda m: (BO[m['book']], m['lead']))
defs, pages, symbols = [], [], {}
for n, m in enumerate(meta):
    S = open(f"{OUT}/{m['key']}.svg").read(); G = json.load(open(f"{OUT}/{m['key']}-grid.json"))
    for sym in re.findall(r'<symbol .*?</symbol>', S, flags=re.S): symbols[re.search(r'id="([^"]+)"', sym).group(1)] = sym
    inner = S[S.index('>') + 1:S.rindex('</svg>')]
    inner = re.sub(r'<symbol .*?</symbol>', '', inner, flags=re.S).replace('id="land"', f'id="land{n}"').replace('url(#land)', f'url(#land{n})')
    inner = inner.replace('<rect width="100%" height="100%" fill="#f4efe1"/>', f'<rect x="-500" y="-500" width="{G["W"]+1000:.0f}" height="{G["H"]+1000:.0f}" fill="#f4efe1"/>')
    defs.append(f'<g id="m{n}">{inner}</g>')
    mem = [s for s in G['sites'] if s['name'] in m['members']]
    cx = sum(s['px'][0] for s in mem) / len(mem); cy = sum(s['px'][1] for s in mem) / len(mem)
    o = [f'<svg class="pg" xmlns="http://www.w3.org/2000/svg" width="1056" height="816" viewBox="0 0 1056 816" font-family="Georgia, serif">', '<rect width="1056" height="816" fill="#fff"/>',
         f'<svg x="{MX}" y="{MY}" width="{MW}" height="{MH}" viewBox="{cx-MW/2:.1f} {cy-MH/2:.1f} {MW} {MH}"><use href="#m{n}"/></svg>',
         f'<rect x="{MX}" y="{MY}" width="{MW}" height="{MH}" fill="none" stroke="#2b2418" stroke-width="1.2"/>']
    y = MY + 14
    o.append(f'<text x="{LX}" y="{y}" font-size="11" letter-spacing=".08em" fill="#5b5040">{m["book"]} · {m["county"].upper()}</text>'); y += 26
    for ln in wrap(m['lead'], 15): o.append(f'<text x="{LX}" y="{y}" font-size="20" font-weight="bold" fill="#2b2418">{esc(ln)}</text>'); y += 22
    y -= 4; o.append(f'<text x="{LX}" y="{y}" font-size="11" fill="#5b5040">Exploration map {n+1} of {len(meta)}</text>'); y += 14
    ah = site_hex.get(m['lead']); ap = site_pg.get(m['lead'])
    if ah: o.append(f'<text x="{LX}" y="{y}" font-size="10" fill="#5b5040">Season hex {ah}' + (f', atlas page {ap}' if ap else '') + '</text>'); y += 12
    y += 14
    o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Scale</text>'); y += 12
    o.append(f'<line x1="{LX}" y1="{y}" x2="{LX+MI_PX*.5:.0f}" y2="{y}" stroke="#2b2418" stroke-width="3"/><text x="{LX+MI_PX*.5+4:.0f}" y="{y+3}" font-size="9">½ mi</text>'); y += 14
    o.append(f'<text x="{LX}" y="{y}" font-size="9" fill="#5b5040">1 hex = ½ mile,</text>'); y += 11
    o.append(f'<text x="{LX}" y="{y}" font-size="9" fill="#5b5040">about 10 minutes on foot</text>'); y += 18
    o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Terrain</text>'); y += 6
    for lab, bg, ic in T:
        o.append(f'<use href="#i-{bg}" x="{LX}" y="{y}" width="20" height="17"/>' + (f'<use href="#i-{ic}" x="{LX+3}" y="{y+2}" width="14" height="13"/>' if ic else '') + f'<text x="{LX+26}" y="{y+12}" font-size="10">{lab}</text>'); y += 19
    o.append(f'<line x1="{LX}" y1="{y+6}" x2="{LX+20}" y2="{y+6}" stroke="#3f7fa8" stroke-width="3"/><text x="{LX+26}" y="{y+10}" font-size="10">River</text>'); y += 26
    vis = [s for s in G['sites'] if abs(s['px'][0] - cx) < MW / 2 and abs(s['px'][1] - cy) < MH / 2]
    if vis:
        o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Sites on this page</text>'); y += 14
        for s in sorted(vis, key=lambda s: s['hex']):
            lines = wrap(s['name'], 19)
            o.append(f'<text x="{LX}" y="{y}" font-size="9" font-weight="bold">{s["hex"]}</text>')
            ic = SI.get(s['kind'])
            o.append(f'<use href="#i-{ic}" x="{LX+24}" y="{y-9}" width="13" height="11"/>' if ic else f'<text x="{LX+30}" y="{y}" text-anchor="middle" font-size="10">✝</text>')
            for k_, ln in enumerate(lines): o.append(f'<text x="{LX+40}" y="{y + k_*11}" font-size="9.5">{esc(ln)}</text>')
            y += 11 * len(lines) + 3
    o.append(f'<text x="{LX}" y="{MY+MH-2}" font-size="8" fill="#8a7f66">Hex numbers are local to this map. {esc(VER)}</text></svg>')
    pages.append(''.join(o)); m['page'] = n + 1; m['sites'] = [dict(name=s_['name'], kind=s_['kind'], hex=s_['hex'], px=s_['px']) for s_ in vis]; m['center_px'] = [round(cx, 1), round(cy, 1)]
doc = ('<!doctype html><meta charset="utf-8"><title>Exploration Maps</title><style>@page{size:11in 8.5in;margin:0}html,body{margin:0;background:#fff}'
       'svg.pg{display:block;width:11in;height:8.5in;break-after:page}</style>'
       f'<svg width="0" height="0" style="position:absolute"><defs>{"".join(symbols.values())}{"".join(defs)}</defs></svg>' + ''.join(pages))
open(OUT + '/poi-atlas.html', 'w').write(doc)
json.dump(meta, open(OUT + '/poi-index.json', 'w'), ensure_ascii=False, indent=1)
print(len(meta), 'POI pages', len(doc) / 1e6, 'MB')
