# Print League pages: one 3-mile (March) hex that holds a point of interest, divided into half-mile hexes.
# 1 in = 1/2 mile; the page shows the whole league plus about half a mile of each neighbour, veiled.
# usage: HEXTILES=... python3 -I league_pages.py <module.json> <march-index.json> <world-grid.json> <outdir>
import json, math, re, sys, os, subprocess, html, unicodedata
MJ, AIDX, AGRID, OUT = sys.argv[1:5]
MOD = json.load(open(MJ)); A = MOD['regions']; os.makedirs(OUT, exist_ok=True)
TITLE = os.environ.get('MODTITLE', MOD.get('short', MOD['title'])); VER = os.environ.get('MODVER', 'dev')
EXP = MOD.get('league', MOD.get('exploration', {})); OVR = EXP.get('overrides', {})
DPI = 96; MX, MY, MW, MH = 24, 24, 840, 768; LX = MX + MW + 14; LW = 1056 - 24 - LX
HMI = .5; MI_PX = DPI / HMI                          # 192 px per mile
MI_KM = 1.524                                        # the game mile is exactly 5000 feet
WMI = MOD['atlas']['hex_mi']                         # the March hex, 3 miles flat to flat
AP = WMI / 2 * MI_PX; RAD = AP * 2 / math.sqrt(3)   # league outline on the page: apothem and corner radius (px)
def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")
COUNTY = {b['region']: (b['county'], b['id'], b['detail']) for b in MOD['books']}
DET = {v[2]: k for k, v in COUNTY.items()}
def inside(bb, lat, lon): return bb[0] <= lon <= bb[2] and bb[1] <= lat <= bb[3]
def km(a, b): return math.hypot((a[1] - b[1]) * 111.32 * math.cos(math.radians(a[0])), (a[0] - b[0]) * 111.32)
def mi(a, b): return km(a, b) / MI_KM
# every site we know, once; county maps first so their names lead
allsites = []
for key in list(COUNTY) + list(DET):
    for st in A[key]['sites']:
        if any(s[0] == st[0] and mi(s[1:3], st[1:3]) < 1 or mi(s[1:3], st[1:3]) < .15 for s in allsites): continue
        allsites.append(list(st[:5]) + [""] * (5 - len(st[:5])) + [key])
# the March grid: each site belongs to the 3-mile hex whose centre is nearest
AG = json.load(open(AGRID)); AI = json.load(open(AIDX))
WH = {f"{h['col']+1:02d}{h['row']+1:02d}": h for h in AG['hexes']}
def march_hex(lat, lon): return min(WH, key=lambda k: km((lat, lon), (WH[k]['lat'], WH[k]['lon'])))
def host(lat, lon, key):
    own = COUNTY[key][2] if key in COUNTY else key
    det = own if inside(A[own]['bbox'], lat, lon) else next((d for d in DET if inside(A[d]['bbox'], lat, lon)), None)
    return det, (DET.get(det) if det else DET.get(key, key))
def nbrs(hid):  # flat-top, odd columns shifted down
    c, r = int(hid[:2]) - 1, int(hid[2:]) - 1; o = c % 2
    d = {'N': (c, r - 1), 'S': (c, r + 1), 'NE': (c + 1, r - 1 + o), 'SE': (c + 1, r + o), 'NW': (c - 1, r - 1 + o), 'SW': (c - 1, r + o)}
    return {k: f'{a+1:02d}{b+1:02d}' for k, (a, b) in d.items() if a >= 0 and b >= 0}
RANK = ['castle', 'town', 'abbey', 'tomb', 'ruin', 'cave', 'lair', 'grove', 'hill', 'mist', 'dead', 'camp']
leagues = {}
for st in allsites: leagues.setdefault(march_hex(st[1], st[2]), []).append(st)
R = {}; meta = []
hw, hh = (MW / 2 / MI_PX + .6), (MH / 2 / MI_PX + .6)            # miles each way, plus a margin
for hid, mem in leagues.items():
    h = WH[hid]; lat, lon = h['lat'], h['lon']
    mem.sort(key=lambda s: (RANK.index(s[3]) if s[3] in RANK else 99, s[0]))
    det, ck = host(lat, lon, mem[0][5])
    src = A[det] if det else A[ck]
    dl = hh * MI_KM / 111.32; dn = hw * MI_KM / (111.32 * math.cos(math.radians(lat)))
    bb = [lon - dn, lat - dl, lon + dn, lat + dl]
    key = 'l-' + hid
    par = [[WH[x]['lat'], WH[x]['lon'], WH[x]['t']] for x in [hid] + list(nbrs(hid).values()) if x in WH]
    r = dict(bbox=[round(v, 6) for v in bb], anchor=[lat, lon], hex_mi=HMI, agg=3, px=round(MI_PX / MI_KM, 4), master=True, title=mem[0][0], subtitle='',
             sites=[s[:5] for s in allsites if inside(bb, s[1], s[2])], rivers=[], parents=par)
    for kk in ('river_km2', 'forest', 'bog_east_of', 'bog_sd', 'hill_rel', 'patches', 'bog_north_of'):
        if kk in src: r[kk] = src[kk]
    r.setdefault('hill_rel', 60); r.setdefault('river_km2', 20)
    if not det: r.update(OVR.get(COUNTY[ck][0], {}))
    R[key] = r
    meta.append(dict(key=key, hex=hid, lead=mem[0][0], members=[s[0] for s in mem], county=COUNTY[ck][0], book=COUNTY[ck][1], lat=round(lat, 6), lon=round(lon, 6), terrain=h['t']))
json.dump(R, open(OUT + '/league-regions.json', 'w'), ensure_ascii=False)
subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hexmap.py'), os.environ.get('HEXGEO', 'geo'), OUT, OUT + '/league-regions.json'], check=True, stdout=subprocess.DEVNULL)
site_pg = {n: v['page'] for v in AI.values() for n in v['sites']}
march_of = {}
for v in AI.values():
    for n in v['sites']: march_of[n] = v['page']
SI = {"castle": "keep", "town": "village", "tomb": "stones", "hill": "hills", "cave": "cave", "ruin": "ruins", "grove": "trees", "camp": "community", "lair": "hole", "mist": "fog", "dead": "graveyard"}
T = [('Grassland', 'bg-green', None), ('Forest', 'bg-green', 'forest'), ('Light woods', 'bg-green', 'trees'), ('Bog', 'bg-grey', 'swamp'), ('Hills', 'bg-green', 'hills'), ('Mountains', 'bg-brown', 'mountains')]
TN = {'grass': 'grassland', 'forest': 'forest', 'woods': 'light woods', 'bog': 'bog', 'hills': 'hills', 'mount': 'mountains', 'sea': 'sea'}
def esc(t): return html.escape(t, quote=True)
def wrap(t, n):
    out, line = [], ''
    for w in t.split():
        if len(line) + len(w) + 1 > n and line: out.append(line); line = w
        else: line = (line + ' ' + w).strip()
    return out + [line]
DIRV = {'N': (0, -1), 'S': (0, 1), 'NE': (.866, -.5), 'SE': (.866, .5), 'NW': (-.866, -.5), 'SW': (-.866, .5)}
BO = {b['id']: n for n, b in enumerate(MOD['books'])}
meta.sort(key=lambda m: (BO[m['book']], m['hex']))
lpage = {m['hex']: n + 1 for n, m in enumerate(meta)}
defs, pages, symbols = [], [], {}
for n, m in enumerate(meta):
    S = open(f"{OUT}/{m['key']}.svg").read(); G = json.load(open(f"{OUT}/{m['key']}-grid.json"))
    for sym in re.findall(r'<symbol .*?</symbol>', S, flags=re.S): symbols[re.search(r'id="([^"]+)"', sym).group(1)] = sym
    inner = S[S.index('>') + 1:S.rindex('</svg>')]
    inner = re.sub(r'<symbol .*?</symbol>', '', inner, flags=re.S).replace('id="land"', f'id="land{n}"').replace('url(#land)', f'url(#land{n})')
    inner = inner.replace('<rect width="100%" height="100%" fill="#f4efe1"/>', f'<rect x="-500" y="-500" width="{G["W"]+1000:.0f}" height="{G["H"]+1000:.0f}" fill="#f4efe1"/>')
    defs.append(f'<g id="m{n}">{inner}</g>')
    c0 = min(G['hexes'], key=lambda x: (x['lat'] - m['lat']) ** 2 + (x['lon'] - m['lon']) ** 2)   # the anchored centre hex
    cx, cy = c0['px']
    cor = [(cx + RAD * math.cos(math.radians(a)), cy + RAD * math.sin(math.radians(a))) for a in range(0, 360, 60)]
    veil = f'M{cx-MW:.1f},{cy-MH:.1f} h{2*MW} v{2*MH} h{-2*MW} Z M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in cor) + ' Z'
    nb = nbw = ''
    for d, nh in nbrs(m['hex']).items():
        if nh not in WH: continue
        vx, vy = DIRV[d]; tx, ty = cx + vx * (AP + 30), cy + vy * (AP + 30)
        tx = min(max(tx, cx - MW/2 + 40), cx + MW/2 - 40); ty = min(max(ty, cy - MH/2 + 16), cy + MH/2 - 8)
        lab = f'{d} · {nh}' + (f' · L{lpage[nh]}' if nh in lpage else '')
        t_ = f'<text x="{tx:.1f}" y="{ty:.1f}" text-anchor="middle" font-size="12" font-weight="bold" fill="#7a2e2e" stroke="#f4efe1" stroke-width="3.5" paint-order="stroke">{lab}</text>'
        nb += t_; nbw += f'<a href="#l-{nh}">{t_}</a>' if nh in lpage else t_
    o = [f'<svg class="pg" xmlns="http://www.w3.org/2000/svg" width="1056" height="816" viewBox="0 0 1056 816" font-family="Georgia, serif">', '<rect width="1056" height="816" fill="#fff"/>',
         f'<svg x="{MX}" y="{MY}" width="{MW}" height="{MH}" viewBox="{cx-MW/2:.1f} {cy-MH/2:.1f} {MW} {MH}"><use href="#m{n}"/>',
         f'<path d="{veil}" fill="#f4efe1" fill-opacity=".6" fill-rule="evenodd"/>',
         f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in cor)}" fill="none" stroke="#7a2e2e" stroke-width="3" stroke-dasharray="12 6"/>', nb, '</svg>',
         f'<rect x="{MX}" y="{MY}" width="{MW}" height="{MH}" fill="none" stroke="#2b2418" stroke-width="1.2"/>']
    y = MY + 14
    o.append(f'<text x="{LX}" y="{y}" font-size="11" letter-spacing=".08em" fill="#5b5040">{m["book"]} · {m["county"].upper()}</text>'); y += 30
    o.append(f'<text x="{LX}" y="{y}" font-size="24" font-weight="bold" fill="#2b2418">League {m["hex"]}</text>'); y += 16
    mp = march_of.get(m['lead'])
    o.append(f'<text x="{LX}" y="{y}" font-size="11" fill="#5b5040">League page {n+1} of {len(meta)}</text>'); y += 13
    o.append(f'<text x="{LX}" y="{y}" font-size="10" fill="#5b5040">{TN.get(m["terrain"], m["terrain"]).capitalize()} on the March map' + (f', atlas p. {mp}' if mp else '') + '</text>'); y += 24
    o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Scale</text>'); y += 12
    o.append(f'<line x1="{LX}" y1="{y}" x2="{LX+MI_PX*.5:.0f}" y2="{y}" stroke="#2b2418" stroke-width="3"/><text x="{LX+MI_PX*.5+4:.0f}" y="{y+3}" font-size="9">½ mi</text>'); y += 14
    o.append(f'<text x="{LX}" y="{y}" font-size="9" fill="#5b5040">1 hex = ½ mile (2,500 ft),</text>'); y += 11
    o.append(f'<text x="{LX}" y="{y}" font-size="9" fill="#5b5040">about 10 minutes on foot</text>'); y += 18
    o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Terrain</text>'); y += 6
    for lab, bg, ic in T:
        o.append(f'<use href="#i-{bg}" x="{LX}" y="{y}" width="20" height="17"/>' + (f'<use href="#i-{ic}" x="{LX+3}" y="{y+2}" width="14" height="13"/>' if ic else '') + f'<text x="{LX+26}" y="{y+12}" font-size="10">{lab}</text>'); y += 19
    o.append(f'<line x1="{LX}" y1="{y+6}" x2="{LX+20}" y2="{y+6}" stroke="#3f7fa8" stroke-width="3"/><text x="{LX+26}" y="{y+10}" font-size="10">River</text>'); y += 16
    o.append(f'<line x1="{LX}" y1="{y+6}" x2="{LX+20}" y2="{y+6}" stroke="#7a2e2e" stroke-width="2" stroke-dasharray="5 3"/><text x="{LX+26}" y="{y+10}" font-size="10">League edge</text>'); y += 26
    mine = [s for s in G['sites'] if s['name'] in m['members']]
    if mine:
        o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Sites in this league</text>'); y += 14
        for s in sorted(mine, key=lambda s: s['hex']):
            lines = wrap(s['name'], 19)
            o.append(f'<text x="{LX}" y="{y}" font-size="9" font-weight="bold">{s["hex"]}</text>')
            ic = SI.get(s['kind'])
            o.append(f'<use href="#i-{ic}" x="{LX+24}" y="{y-9}" width="13" height="11"/>' if ic else f'<text x="{LX+30}" y="{y}" text-anchor="middle" font-size="10">✝</text>')
            for k_, ln in enumerate(lines): o.append(f'<text x="{LX+40}" y="{y + k_*11}" font-size="9.5">{esc(ln)}</text>')
            y += 11 * len(lines) + 3
    o.append(f'<text x="{LX}" y="{MY+MH-2}" font-size="8" fill="#8a7f66">{esc(VER)}</text><text x="{LX}" y="{MY+MH-12}" font-size="8" fill="#8a7f66">Half-mile hexes are numbered per League.</text></svg>')
    # the same veil, edge and neighbour labels for the web map, where each neighbour with a page is a link
    m['overlay'] = (f'<g class="league-edge"><path d="{veil}" fill="#f4efe1" fill-opacity=".6" fill-rule="evenodd" pointer-events="none"/>'
                    f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in cor)}" fill="none" stroke="#7a2e2e" stroke-width="3" stroke-dasharray="12 6" pointer-events="none"/>{nbw}</g>')
    pages.append(''.join(o)); m['page'] = n + 1; m['center_px'] = [round(cx, 1), round(cy, 1)]
    m['sites'] = [dict(name=s_['name'], kind=s_['kind'], hex=s_['hex'], px=s_['px']) for s_ in G['sites'] if abs(s_['px'][0] - cx) < MW / 2 and abs(s_['px'][1] - cy) < MH / 2]
doc = ('<!doctype html><meta charset="utf-8"><title>League Maps</title><style>@page{size:11in 8.5in;margin:0}html,body{margin:0;background:#fff}'
       'svg.pg{display:block;width:11in;height:8.5in;break-after:page}</style>'
       f'<svg width="0" height="0" style="position:absolute"><defs>{"".join(symbols.values())}{"".join(defs)}</defs></svg>' + ''.join(pages))
open(OUT + '/leagues.html', 'w').write(doc)
json.dump(meta, open(OUT + '/league-index.json', 'w'), ensure_ascii=False, indent=1)
print(len(meta), 'league pages', len(doc) / 1e6, 'MB')
