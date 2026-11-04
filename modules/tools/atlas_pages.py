# Print atlas: a 24-mile hex grid over the 3-mile master map; one 11x8.5in page per 24-mile hex.
# usage: python3 -I atlas_pages.py <master.svg> <master-grid.json> <out.html>
import json, math, re, sys, html, os
TITLE = os.environ.get('MODTITLE', 'Season 1 · Leinster, 1422'); VER = os.environ.get('MODVER', 'dev')
svg_path, grid_path, out = sys.argv[1:4]
G = json.load(open(grid_path)); S = open(svg_path).read()
DPI = 96; MX, MY, MW, MH = 24, 24, 840, 768          # map frame: 8.75 x 8 in inside the 0.25 in border
LX = MX + MW + 14; LW = 1056 - 24 - LX                # legend column
inner = S[S.index('>') + 1:S.rindex('</svg>')]
inner = re.sub(r'</?a\b[^>]*>', '', inner)  # print has no links
inner = inner.replace('<rect width="100%" height="100%" fill="#f4efe1"/>', f'<rect x="-2000" y="-2000" width="{G["W"]+4000:.0f}" height="{G["H"]+4000:.0f}" fill="#f4efe1"/>')
hp, wp = G['hex_px'], G['w_px']
H0 = next(h for h in G['hexes'] if h['col'] == 0 and h['row'] == 0)['px']
def small_center(c, r): return H0[0] + c * wp, H0[1] + r * hp + (hp / 2 if c % 2 else 0)
AP = 4 * hp; RAD = AP * 2 / math.sqrt(3)                # big hex: 24 mi flat-to-flat
def corners(cx, cy, k=1.0): return [(cx + RAD * k * math.cos(math.radians(a)), cy + RAD * k * math.sin(math.radians(a))) for a in range(0, 360, 60)]
def inhex(x, y, cx, cy):
    dx, dy = abs(x - cx), abs(y - cy)
    return dy <= AP and dx <= RAD and (dx * math.sqrt(3) + dy) <= 2 * AP + 1e-6
maxc = max(h['col'] for h in G['hexes']); maxr = max(h['row'] for h in G['hexes'])
big = {}
for i in range(-1, maxc // 8 + 2):
    for j in range(-1, maxr // 8 + 2):
        cx, cy = small_center(8 * i, 8 * j + 4 * (i % 2))
        if any(h['inside'] and inhex(h['px'][0], h['px'][1], cx, cy) for h in G['hexes']): big[(i, j)] = (cx, cy)
i0 = min(i for i, j in big); j0 = min(j for i, j in big)
bid = {k: f'{k[0]-i0+1:02d}{k[1]-j0+1:02d}' for k in big}
order = sorted(big, key=lambda k: (big[k][1], big[k][0]))
page = {k: n + 1 for n, k in enumerate(order)}
def nbrs(i, j):  # flat-top, odd big columns shifted down by half a hex
    o = i % 2
    return {'N': (i, j - 1), 'S': (i, j + 1), 'NE': (i + 1, j - 1 + o), 'SE': (i + 1, j + o), 'NW': (i - 1, j - 1 + o), 'SW': (i - 1, j + o)}
DIRV = {'N': (0, -1), 'S': (0, 1), 'NE': (.866, -.5), 'SE': (.866, .5), 'NW': (-.866, -.5), 'SW': (-.866, .5)}
def site_page(st):
    x, y = st['px']; return min(big, key=lambda k: (big[k][0] - x) ** 2 + (big[k][1] - y) ** 2)
T = [('grass', 'Grassland', 'bg-green', None), ('forest', 'Forest', 'bg-green', 'forest'), ('woods', 'Light woods', 'bg-green', 'trees'),
     ('bog', 'Bog', 'bg-grey', 'swamp'), ('hills', 'Hills', 'bg-green', 'hills'), ('mount', 'Mountains', 'bg-brown', 'mountains')]
T = list(T)
SI = {"castle": "keep", "town": "village", "tomb": "stones", "hill": "hills", "cave": "cave", "ruin": "ruins", "grove": "trees", "camp": "community", "lair": "hole", "mist": "fog", "dead": "graveyard"}
def esc(t): return html.escape(t, quote=True)
def wrap(t, n):
    out, line = [], ''
    for w in t.split():
        if len(line) + len(w) + 1 > n and line: out.append(line); line = w
        else: line = (line + ' ' + w).strip()
    return out + [line]
xs = [v[0] for v in big.values()]; ys = [v[1] for v in big.values()]
LOC_W = LW; sc = (LOC_W - 10) / (max(xs) - min(xs) + 2 * RAD)
pages = []
for k in order:
    cx, cy = big[k]; i, j = k
    vb = f'{cx - MW/2:.1f} {cy - MH/2:.1f} {MW} {MH}'
    hexpts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in corners(cx, cy))
    veil = f'M{cx-MW:.1f},{cy-MH:.1f} h{2*MW} v{2*MH} h{-2*MW} Z M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in corners(cx, cy)) + ' Z'
    nb = ''
    for d, nk in nbrs(i, j).items():
        if nk not in big: continue
        vx, vy = DIRV[d]; dist = AP * 1.0 + 16
        tx, ty = cx + vx * dist, cy + vy * dist
        tx = min(max(tx, cx - MW/2 + 34), cx + MW/2 - 34); ty = min(max(ty, cy - MH/2 + 14), cy + MH/2 - 6)
        nb += (f'<text x="{tx:.1f}" y="{ty:.1f}" text-anchor="middle" font-size="12" font-weight="bold" fill="#7a2e2e" stroke="#f4efe1" stroke-width="3.5" paint-order="stroke">'
               f'{d} · p. {page[nk]}</text>')
    o = [f'<svg class="pg" xmlns="http://www.w3.org/2000/svg" width="1056" height="816" viewBox="0 0 1056 816" font-family="Georgia, serif">',
         '<rect width="1056" height="816" fill="#fff"/>',
         f'<svg x="{MX}" y="{MY}" width="{MW}" height="{MH}" viewBox="{vb}"><use href="#master"/>',
         f'<path d="{veil}" fill="#f4efe1" fill-opacity=".6" fill-rule="evenodd"/>',
         f'<polygon points="{hexpts}" fill="none" stroke="#7a2e2e" stroke-width="3" stroke-dasharray="12 6"/>', nb, '</svg>',
         f'<rect x="{MX}" y="{MY}" width="{MW}" height="{MH}" fill="none" stroke="#2b2418" stroke-width="1.2"/>']
    y = MY + 14
    o.append(f'<text x="{LX}" y="{y}" font-size="11" letter-spacing=".08em" fill="#5b5040">{esc(TITLE.upper())}</text>'); y += 30
    o.append(f'<text x="{LX}" y="{y}" font-size="24" font-weight="bold" fill="#2b2418">Hex {bid[k]}</text>'); y += 16
    o.append(f'<text x="{LX}" y="{y}" font-size="11" fill="#5b5040">Atlas page {page[k]} of {len(order)}</text>'); y += 14
    # locator
    lh = (max(ys) - min(ys) + 2 * AP) * sc; ly0 = y
    for kk, (bx, by) in big.items():
        px_, py_ = LX + 5 + (bx - min(xs) + RAD) * sc, ly0 + (by - min(ys) + AP) * sc
        pts = ' '.join(f'{LX + 5 + (x - min(xs) + RAD) * sc:.1f},{ly0 + (yy - min(ys) + AP) * sc:.1f}' for x, yy in corners(bx, by, .97))
        on = kk == k
        o.append(f'<polygon points="{pts}" fill="{"#7a2e2e" if on else "#dfe6cc"}" stroke="#8a7f66" stroke-width=".6"/>'
                 f'<text x="{px_:.1f}" y="{py_+3:.1f}" text-anchor="middle" font-size="7.5" fill="{"#fff" if on else "#5b5040"}">{page[kk]}</text>')
    y = ly0 + lh + 18
    o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Scale</text>'); y += 12
    o.append(f'<line x1="{LX}" y1="{y}" x2="{LX+96}" y2="{y}" stroke="#2b2418" stroke-width="3"/><text x="{LX+100}" y="{y+3}" font-size="9">3 mi</text>'); y += 14
    o.append(f'<text x="{LX}" y="{y}" font-size="9" fill="#5b5040">1 hex = 1 league = 3 miles,</text>'); y += 11
    o.append(f'<text x="{LX}" y="{y}" font-size="9" fill="#5b5040">about an hour on foot</text>'); y += 18
    o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Terrain</text>'); y += 6
    for _, lab, bg, ic in T:
        o.append(f'<use href="#i-{bg}" x="{LX}" y="{y}" width="20" height="17"/>' + (f'<use href="#i-{ic}" x="{LX+3}" y="{y+2}" width="14" height="13"/>' if ic else '') +
                 f'<text x="{LX+26}" y="{y+12}" font-size="10">{lab}</text>'); y += 19
    o.append(f'<line x1="{LX}" y1="{y+6}" x2="{LX+20}" y2="{y+6}" stroke="#3f7fa8" stroke-width="3"/><text x="{LX+26}" y="{y+10}" font-size="10">River</text>'); y += 16
    o.append(f'<line x1="{LX}" y1="{y+6}" x2="{LX+20}" y2="{y+6}" stroke="#7a2e2e" stroke-width="2" stroke-dasharray="5 3"/><text x="{LX+26}" y="{y+10}" font-size="10">County border</text>'); y += 26
    mine = sorted((s for s in G['sites'] if site_page(s) == k), key=lambda s: s['hex'])
    if mine:
        o.append(f'<text x="{LX}" y="{y}" font-size="11" font-weight="bold" fill="#2b2418">Sites on this page</text>'); y += 14
        for s in mine:
            lines = wrap(s['name'], 19)
            o.append(f'<text x="{LX}" y="{y}" font-size="9" font-weight="bold">{s["hex"]}</text>')
            ic = SI.get(s['kind'])
            o.append(f'<use href="#i-{ic}" x="{LX+24}" y="{y-9}" width="13" height="11"/>' if ic else f'<text x="{LX+30}" y="{y}" text-anchor="middle" font-size="10">✝</text>')
            for n, ln in enumerate(lines): o.append(f'<text x="{LX+40}" y="{y + n*11}" font-size="9.5">{esc(ln)}</text>')
            y += 11 * len(lines) + 3
    o.append(f'<text x="{LX}" y="{MY+MH-2}" font-size="8" fill="#8a7f66">Hex numbers are the season grid (CCRR). {esc(VER)}</text>')
    o.append('</svg>')
    pages.append(''.join(o))
doc = ('<!doctype html><meta charset="utf-8"><title>Season 1 Print Atlas</title><style>@page{size:11in 8.5in;margin:0}html,body{margin:0;background:#fff}'
       'svg.pg{display:block;width:11in;height:8.5in;break-after:page}</style>'
       f'<svg width="0" height="0" style="position:absolute"><defs><g id="master">{inner}</g></defs></svg>' + ''.join(pages))
open(out, 'w').write(doc)
json.dump({bid[k]: dict(page=page[k], center_px=[round(v, 1) for v in big[k]], radius_px=round(RAD, 1), neighbors={d: page[nk] for d, nk in nbrs(*k).items() if nk in big}, sites=[s['name'] for s in G['sites'] if site_page(s) == k]) for k in order}, open(out.replace('.html', '-index.json'), 'w'), ensure_ascii=False, indent=1)
print(len(order), 'pages', len(doc) / 1e6, 'MB')
