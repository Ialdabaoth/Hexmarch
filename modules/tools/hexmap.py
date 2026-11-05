"""Hexcrawl maps (SVG) from real terrain: SRTM elevation + Natural Earth county borders.

Usage: python3 -I hexmap.py <datadir> <outdir> <regions.json> [region keys...]

A region has either "county" (Natural Earth name, e.g. "Meath") or "bbox" [minlon, minlat, maxlon, maxlat].
Optional per region: hex_mi (default 3), agg (DEM arc-seconds per cell, default 15), px (pixels per km),
river_km2 (catchment needed to draw a river), forest, bog_east_of, hill_rel (local maps: metres above the
map's median that count as hills), rivers [[label, lat, lon]], patches [[lat, lon, radius_mi, terrain]], overrides [[hex, terrain]], sites [[name, lat, lon, kind, note?]].
Writes <key>.svg and <key>-distances.md (site-to-site miles, hexes, and hours on foot at 3 mph).
"""
import sys, os, json, gzip, math, heapq, random
import numpy as np
from shapely.geometry import shape, Polygon, box
from shapely.prepared import prep
from shapely.ops import unary_union

D, OUT, RJ = sys.argv[1], sys.argv[2], sys.argv[3]
ONLY = sys.argv[4:]
os.makedirs(OUT, exist_ok=True)
REGIONS = json.load(open(RJ))
# DEM mosaic: SRTM 1-arc-second tiles (skadi .hgt.gz names), set by HEXDEM="lat0,lat1,lon0,lon1" (tile SW corners, inclusive).
_dl = [int(v) for v in os.environ.get("HEXDEM", "52,53,-8,-7").split(",")]
DEM_LATS = list(range(_dl[1], _dl[0] - 1, -1)); DEM_LONS = list(range(_dl[2], _dl[3] + 1))
LAT_TOP = DEM_LATS[0] + 1; LON_LEFT = DEM_LONS[0]
def tile_name(lat, lon): return f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}{'E' if lon >= 0 else 'W'}{abs(lon):03d}"

_dem_cache = {}
def dem_for(agg):
    """Mosaic of the HEXDEM tiles at `agg` arc-seconds."""
    if agg in _dem_cache: return _dem_cache[agg]
    def load(t):
        a = np.frombuffer(gzip.open(f"{D}/{t}.hgt.gz").read(), ">i2").reshape(3601, 3601)[:-1, :-1].astype(np.float32)
        a[a < -1000] = 0
        n = 3600 // agg
        return a.reshape(n, agg, n, agg).mean(axis=(1, 3))
    dem = np.vstack([np.hstack([load(tile_name(la, lo)) for lo in DEM_LONS]) for la in DEM_LATS])
    _dem_cache[agg] = dem
    return dem

def drainage(dem, r0, r1, c0, c1, cell):
    """Priority-flood drainage on a window; returns parent index and catchment (km2) per cell."""
    sub = dem[r0:r1, c0:c1]
    NR, NC = sub.shape
    flat = sub.ravel()
    parent = np.full(NR * NC, -1, np.int64)
    seen = np.zeros(NR * NC, bool)
    pq, order = [], []
    for r in range(NR):
        for c in range(NC):
            if r in (0, NR - 1) or c in (0, NC - 1) or flat[r * NC + c] <= 0:
                i = r * NC + c; seen[i] = True; heapq.heappush(pq, (float(flat[i]), i))
    nb = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    while pq:
        e, i = heapq.heappop(pq)
        order.append(i)
        r, c = divmod(i, NC)
        for dr, dc in nb:
            rr, cc = r + dr, c + dc
            if 0 <= rr < NR and 0 <= cc < NC:
                j = rr * NC + cc
                if not seen[j]:
                    seen[j] = True; parent[j] = i
                    heapq.heappush(pq, (max(float(flat[j]), e), j))
    lat_rows = LAT_TOP - (np.arange(r0, r1) + .5) * cell
    acc = np.repeat((cell * 111.32) * (cell * 111.32 * np.cos(np.radians(lat_rows))), NC).astype(np.float64)
    for i in reversed(order):
        p = parent[i]
        if p >= 0 and flat[i] > 0: acc[p] += acc[i]
    return sub, flat, parent, acc, NC

_counties = None
def county(name):
    global _counties
    if _counties is None:
        adm = json.load(open(os.environ.get("HEXADMIN", f"{D}/ne_10m_admin_1_states_provinces.geojson")))
        _counties = {f["properties"]["name"].replace(" County", ""): shape(f["geometry"]) for f in adm["features"] if f["properties"].get("admin") == "Ireland"}
    return _counties[name]

TERRAIN = {"grass": ("#dfe8b5", "Grassland / pasture"), "forest": ("#9cc28a", "Forest"), "woods": ("#bcd69e", "Light woods / scrub"), "bog": ("#c9b98f", "Bog"),
           "hills": ("#d9c08c", "Hills"), "mount": ("#b49a78", "Mountains")}
SIDES = {"numen": ("#e9c75c", "Seelie: numen sworn to a holy place", "#9a7412"), "pagan": ("#a77cc4", "Unseelie: the unsworn pagan host", "#5b2f7a"), "torn": ("#7fb7c9", "Undecided: courted by both", "#256a80")}
ICONS = {"castle": "♜", "town": "■", "abbey": "✝", "tomb": "◉", "hill": "▲", "cave": "●", "ruin": "⌂", "grove": "♠", "camp": "⛺", "lair": "✱", "mist": "≋", "dead": "☠"}

TILES = os.environ.get("HEXTILES")  # folder of outline-free icon PNGs (maps/tiles/icons); unset = text symbols
OUTSIDE_FULL = os.environ.get("HEXFADE") is None  # Heph 2026-11-04: hexes beyond the county border render fully; HEXFADE=1 restores the fade
T_ICON = {"forest": "forest", "woods": "trees", "hills": "hills", "mount": "mountains", "bog": "swamp"}
T_BG = {"grass": "bg-green", "forest": "bg-green", "woods": "bg-green", "hills": "bg-green", "mount": "bg-brown", "bog": "bg-grey"}  # Heph 2026-11-04
S_ICON = {"castle": "keep", "town": "village", "tomb": "stones", "hill": "hills", "cave": "cave", "ruin": "ruins", "grove": "great-tree", "camp": "community", "lair": "hole", "mist": "fog", "dead": "graveyard"}  # Heph 2026-11-05: great tree for groves
SITE_ICONS = json.loads(os.environ.get("HEXSITEICONS") or "{}")  # per-site icon overrides {site name: icon}, from module.json "site_icons"
def site_icon(name, kind): return SITE_ICONS.get(name) or S_ICON.get(kind)
def icon_aspect(n):  # height / width of an icon file, so tall icons are drawn at full width
    from PIL import Image
    f = os.path.join(TILES, n + ".png") if TILES else ""
    if not os.path.exists(f): return .87
    W, H = Image.open(f).size
    return max(.87, H / W)
def icon_defs():
    import base64
    from PIL import Image
    out = []
    for n in sorted(set(T_ICON.values()) | set(S_ICON.values()) | set(SITE_ICONS.values()) | set(T_BG.values())):
        f = os.path.join(TILES, n + ".png")
        if not os.path.exists(f): continue
        W, H = Image.open(f).size
        b = base64.b64encode(open(f, "rb").read()).decode()
        out.append(f'<symbol id="i-{n}" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet"><image width="{W}" height="{H}" href="data:image/png;base64,{b}"/></symbol>')
    return "".join(out)

MI_KM = 1.524  # the game mile is exactly 5000 feet (Heph 2026-11-04)

def slug(t):
    import unicodedata, re
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")

def make(key, R):
    HEX_MI = R.get("hex_mi", 3.0); agg = R.get("agg", 15); cell = agg / 3600.0
    dem = dem_for(agg)
    if "counties" in R:
        cps = [county(c) for c in R["counties"]]; poly = unary_union(cps); has_border = True
    elif "county" in R:
        cps = None; poly = county(R["county"]); has_border = True
    else:
        cps = None; poly = box(*R["bbox"]); has_border = False
    prepped = prep(poly)
    lat0 = poly.centroid.y
    kx = 111.32 * math.cos(math.radians(lat0)); ky = 111.32
    minx, miny, maxx, maxy = poly.bounds
    s = HEX_MI * MI_KM / math.sqrt(3)  # side (km); flat-to-flat = HEX_MI
    w, h = 1.5 * s, math.sqrt(3) * s
    pad = s if has_border else 0
    X0, Y0 = minx * kx - pad, maxy * ky + pad
    ncol = int(((maxx - minx) * kx + 2 * pad) / w) + (2 if has_border else 1)
    nrow = int(((maxy - miny) * ky + 2 * pad) / h) + (2 if has_border else 1)
    if "anchor" in R:  # [lat, lon]: put a hex centre (in an even column) exactly here, e.g. a League's 3-mile hex centre
        alat, alon = R["anchor"]; ax, ay = alon * kx, alat * ky
        cc = math.ceil((ax - minx * kx) / w); cc += cc % 2; rc = math.ceil((maxy * ky - ay) / h)
        X0, Y0 = ax - cc * w, ay + rc * h; ncol, nrow = 2 * cc + 1, 2 * rc + 1
    def center(col, row): return X0 + col * w, Y0 - row * h - (h / 2 if col % 2 else 0)
    def to_ll(x, y): return x / kx, y / ky
    # drainage window
    m = .3 if has_border else .15
    r0 = max(0, int((LAT_TOP - (maxy + m)) / cell)); r1 = min(dem.shape[0], int((LAT_TOP - (miny - m)) / cell))
    c0 = max(0, int(((minx - m) - LON_LEFT) / cell)); c1 = min(dem.shape[1], int(((maxx + m) - LON_LEFT) / cell))
    sub, flat, parent, acc, SNC = drainage(dem, r0, r1, c0, c1, cell)
    median = float(np.median(dem[int((LAT_TOP - maxy) / cell):int((LAT_TOP - miny) / cell), int((minx - LON_LEFT) / cell):int((maxx - LON_LEFT) / cell)]))
    random.seed(key)
    # smooth value noise so forest and bog come in patches, not salt-and-pepper
    NG = 3.0 * s
    grid = {}
    def g(i, j):
        if (i, j) not in grid: grid[(i, j)] = random.random()
        return grid[(i, j)]
    def noise(x, y):
        fx, fy = x / NG, y / NG; i, j = math.floor(fx), math.floor(fy); u, v = fx - i, fy - j
        u, v = u * u * (3 - 2 * u), v * v * (3 - 2 * v)
        return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v
    hexes = []
    for col in range(ncol):
        for row in range(nrow):
            x, y = center(col, row)
            corners = [(x + s * math.cos(math.radians(a)), y + s * math.sin(math.radians(a))) for a in range(0, 360, 60)]
            hp = Polygon([to_ll(*p) for p in corners])
            inside = prepped.intersects(hp)
            lons = [p[0] for p in hp.exterior.coords]; lats = [p[1] for p in hp.exterior.coords]
            a0 = max(0, int((LAT_TOP - max(lats)) / cell)); a1 = int((LAT_TOP - min(lats)) / cell) + 1
            b0 = max(0, int((min(lons) - LON_LEFT) / cell)); b1 = int((max(lons) - LON_LEFT) / cell) + 1
            cells = dem[a0:a1, b0:b1]
            if cells.size == 0: continue
            mean, mx, sd = float(cells.mean()), float(cells.max()), float(cells.std())
            lon, lat = to_ll(x, y)
            rel = R.get("hill_rel")
            if mean <= 1: t = "sea"
            elif mx > 480 and mean > 250: t = "mount"
            elif rel is not None and (mean - median > rel or mx - median > rel * 1.6): t = "hills"
            elif rel is None and (mean > 210 or (sd > 38 and mx > 290) or (mx > 240 and sd > 25 and mean > 140)): t = "hills"
            elif sd < R.get("bog_sd", 4.5) and mean < 120 and lon < R.get("bog_east_of", -6.75) and lat > R.get("bog_north_of", -90): t = "bog"
            else:
                pf = R.get("forest", .35) + (0.15 if sd > 12 else 0) + (0.1 if lon < -7.0 else 0)
                nz = noise(x, y)
                # density (Heph 2026-11-04): old oak survives in patch cores and on steep valley sides; flat lowland
                # woods and the fringes of each patch are open woodland and scrub
                if nz < pf: t = "forest" if (nz < pf - .12 or sd > 12) else "woods"
                else: t = "woods" if nz < pf + .05 else "grass"
            hexes.append(dict(col=col, row=row, x=x, y=y, corners=corners, inside=inside, t=t, lon=lon, lat=lat, mean=mean, sd=sd, nz=noise(x, y)))
    # League maps follow their March hexes: parents [[lat, lon, terrain]] are the 3-mile hexes on the page. Each half-mile
    # hex belongs to the nearest parent, and in each parent the best-suited share of hexes takes the parent's terrain.
    PAR = R.get("parents", [])
    if PAR:
        groups = {}
        for hx in hexes:
            k = min(range(len(PAR)), key=lambda i: ((hx["lon"] - PAR[i][1]) * kx) ** 2 + ((hx["lat"] - PAR[i][0]) * ky) ** 2)
            groups.setdefault(k, []).append(hx)
        score = {"hills": lambda q: q["mean"] + 2 * q["sd"], "mount": lambda q: q["mean"] + 2 * q["sd"], "bog": lambda q: -q["sd"] - q["mean"] / 50,
                 "forest": lambda q: -q["nz"] + q["sd"] / 40, "woods": lambda q: -q["nz"], "grass": lambda q: q["nz"] - q["sd"] / 40}
        for k, grp in groups.items():
            pt = PAR[k][2]
            if pt not in score: continue
            land = [q for q in grp if q["t"] != "sea"]; want = round(R.get("parent_share", .6) * len(land))
            have = [q for q in land if q["t"] == pt]
            for q in sorted((q for q in land if q["t"] != pt), key=score[pt], reverse=True)[:max(0, want - len(have))]: q["t"] = pt
    for plat, plon, rad, terr in R.get("patches", []):  # [[lat, lon, radius_miles, terrain]] named regions
        for hx in hexes:
            if hx["inside"] and math.hypot((hx["lon"] - plon) * kx, (hx["lat"] - plat) * ky) / MI_KM <= rad: hx["t"] = terr
    for o_ in R.get("overrides", []):  # [[hex_id, terrain]] hand edits
        for hx in hexes:
            if f'{hx["col"]+1:02d}{hx["row"]+1:02d}' == o_[0]: hx["t"] = o_[1]
    PX = R.get("px", 22.0)
    sc = max(.45, s * PX / 61.0)  # font scale relative to the county maps
    X1 = X0 + ncol * w + s; Y1 = Y0 - nrow * h - h
    Wpx = (X1 - X0) * PX + 40; Hpx = (Y0 - Y1) * PX + 40
    LEG = 320
    def P(x, y): return 20 + (x - X0) * PX, 20 + (Y0 - y) * PX
    def PLL(lon, lat): return P(lon * kx, lat * ky)
    geoms = list(poly.geoms) if poly.geom_type == "MultiPolygon" else [poly]
    clip = " ".join("M" + " L".join(f"{PLL(*pt)[0]:.1f},{PLL(*pt)[1]:.1f}" for pt in g.exterior.coords) + "Z" for g in geoms)
    H = max(Hpx, 720)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{Wpx+LEG:.0f}" height="{H:.0f}" viewBox="0 0 {Wpx+LEG:.0f} {H:.0f}" font-family="Georgia, serif">',
         '<rect width="100%" height="100%" fill="#f4efe1"/>', f'<defs><clipPath id="land"><path d="{clip}"/></clipPath>{icon_defs() if TILES else ""}</defs>']
    TOP = []  # terrain icons, drawn above rivers (Heph 2026-11-04)
    for hx in hexes:
        pts = " ".join(f"{P(*c)[0]:.1f},{P(*c)[1]:.1f}" for c in hx["corners"])
        fill, op = ("#b9d3e0", 1) if hx["t"] == "sea" else (TERRAIN[hx["t"]][0], 1 if (hx["inside"] or OUTSIDE_FULL) else .35)
        cx, cy = P(hx["x"], hx["y"])
        if TILES and hx["t"] in T_BG:
            bw, bh = 2 * s * PX, h * PX
            o.append(f'<use href="#i-{T_BG[hx["t"]]}" x="{cx-bw/2:.1f}" y="{cy-bh/2:.1f}" width="{bw:.1f}" height="{bh:.1f}" opacity="{op}"/>')
            fill, op = "none", 1
        o.append(f'<polygon points="{pts}" fill="{fill}" fill-opacity="{op}" stroke="#8a7f66" stroke-width="{0.6*min(1,sc):.2f}"/>')
        if hx["inside"] or OUTSIDE_FULL:
            sym = {"forest": "♣", "woods": "♧", "hills": "⌒", "mount": "▲", "bog": "≈"}.get(hx["t"])
            if TILES and hx["t"] in T_ICON:
                iw, ih = 2 * s * PX * .78, h * PX * .78
                TOP.append(f'<use href="#i-{T_ICON[hx["t"]]}" x="{cx-iw/2:.1f}" y="{cy-ih/2+2*sc:.1f}" width="{iw:.1f}" height="{ih:.1f}" opacity=".9"/>')
            elif sym: o.append(f'<text x="{cx:.1f}" y="{cy+6*sc:.1f}" text-anchor="middle" font-size="{17*sc:.1f}" fill="#5b5040" fill-opacity=".55">{sym}</text>')
            o.append(f'<text x="{cx:.1f}" y="{cy-h*PX/2+11*sc:.1f}" text-anchor="middle" font-size="{max(6,8*sc):.1f}" fill="#6b604c">{hx["col"]+1:02d}{hx["row"]+1:02d}</text>')
    POW = R.get("powers", [])  # [[name, lat, lon, radius_mi, side]]; side in SIDES or R["sides"]
    SD = {k: tuple(v) for k, v in R["sides"].items()} if "sides" in R else SIDES
    if POW:
        owner = {}
        for hx in hexes:
            if not hx["inside"]: continue
            best = None
            for i, (pn, pla, plo, prad, pside) in enumerate(POW):
                dd = math.hypot((hx["lon"] - plo) * kx, (hx["lat"] - pla) * ky) / MI_KM / prad
                if dd <= 1 and (best is None or dd < best[0]): best = (dd, i)
            if best: owner[(hx["col"], hx["row"])] = best[1]
        for hx in hexes:
            k = owner.get((hx["col"], hx["row"]))
            if k is None: continue
            pts = " ".join(f"{P(*c)[0]:.1f},{P(*c)[1]:.1f}" for c in hx["corners"])
            o.append(f'<polygon points="{pts}" fill="{SD[POW[k][4]][0]}" fill-opacity=".5" stroke="none"/>')
        def nb(c, r, d):  # flat-top odd-q (odd columns shifted down): directions by edge angle
            odd = c & 1
            dirs = {30: (1, -1 + odd), 90: (0, -1), 150: (-1, -1 + odd), 210: (-1, odd), 270: (0, 1), 330: (1, odd)}
            dc, dr = dirs[d]; return c + dc, r + dr
        for hx in hexes:
            k = owner.get((hx["col"], hx["row"]))
            if k is None: continue
            for d in (30, 90, 150, 210, 270, 330):
                k2 = owner.get(nb(hx["col"], hx["row"], d))
                if k2 == k: continue
                a1, a2 = math.radians(d - 30), math.radians(d + 30)
                p1 = P(hx["x"] + s * math.cos(a1), hx["y"] + s * math.sin(a1)); p2 = P(hx["x"] + s * math.cos(a2), hx["y"] + s * math.sin(a2))
                o.append(f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="{SD[POW[k][4]][2]}" stroke-width="2.4" stroke-linecap="round"/>')
        for pn, pla, plo, prad, pside in POW:
            x, y = PLL(plo, pla)
            o.append(f'<text x="{x:.1f}" y="{y+22:.1f}" text-anchor="middle" font-size="12.5" font-style="italic" font-weight="bold" fill="{SD[pside][2]}" stroke="#f4efe1" stroke-width="3.5" paint-order="stroke">{pn}</text>')
    thr = R.get("river_km2", 120)
    segs = []
    SNR = sub.shape[0]
    for i in range(SNR * SNC):
        a = acc[i]
        if a < thr or parent[i] < 0 or flat[i] <= 0: continue
        r, c = divmod(i, SNC); pr, pc = divmod(int(parent[i]), SNC)
        la, lo = LAT_TOP - (r0 + r + .5) * cell, LON_LEFT + (c0 + c + .5) * cell
        pla, plo = LAT_TOP - (r0 + pr + .5) * cell, LON_LEFT + (c0 + pc + .5) * cell
        x1, y1 = PLL(lo, la); x2, y2 = PLL(plo, pla)
        wdt = min(4.5, 0.8 + 2 * math.log10(a / thr + 1))
        segs.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#3f7fa8" stroke-width="{wdt:.2f}" stroke-linecap="round"/>')
    if OUTSIDE_FULL: o.append('<g>' + "".join(segs) + '</g>')
    else:
        if has_border: o.append('<g opacity=".35">' + "".join(segs) + '</g>')
        o.append('<g clip-path="url(#land)">' + "".join(segs) + '</g>')
    o.extend(TOP)
    if has_border:
        bgeoms = [gg for cp in cps for gg in (cp.geoms if cp.geom_type == "MultiPolygon" else [cp])] if cps else geoms
        for g in bgeoms:
            d = "M" + " L".join(f"{PLL(*pt)[0]:.1f},{PLL(*pt)[1]:.1f}" for pt in g.exterior.coords) + "Z"
            o.append(f'<path d="{d}" fill="none" stroke="#7a2e2e" stroke-width="2.2" stroke-dasharray="7 4"/>')
    for name, lat, lon in R.get("rivers", []):
        x, y = PLL(lon, lat)
        o.append(f'<text x="{x:.1f}" y="{y:.1f}" font-size="12" font-style="italic" fill="#245b80" stroke="#f4efe1" stroke-width="3" paint-order="stroke">{name}</text>')
    def hex_of(lon, lat):
        best = min(hexes, key=lambda hx: (hx["lon"] - lon) ** 2 * (kx / ky) ** 2 + (hx["lat"] - lat) ** 2)
        return f'{best["col"]+1:02d}{best["row"]+1:02d}', best
    keyed = []
    # Site layout (Heph 2026-11-04): bump crowded icons apart, then place each label where it hits no icon or label.
    items = []
    for st in R["sites"]:
        name, lat, lon, kind = st[:4]
        x, y = PLL(lon, lat)
        tile = bool(TILES and site_icon(name, kind))
        iw = max(26, min(46, 2 * s * PX * .55)) if tile else 16
        items.append(dict(st=st, name=name, lat=lat, lon=lon, kind=kind, x=x, y=y, tile=tile, iw=iw, ih=iw * icon_aspect(site_icon(name, kind)) if tile else 16))
    for _ in range(60):  # icon repulsion: keep centres at least ~one icon apart
        moved = False
        for i, A in enumerate(items):
            for B in items[i + 1:]:
                need = (A["iw"] + B["iw"]) / 2 * .95
                dx, dy = B["x"] - A["x"], B["y"] - A["y"]; d = math.hypot(dx, dy)
                if d < need:
                    if d < .01: dx, dy, d = 1.0, 0.0, 1.0
                    push = (need - d) / 2 + .2
                    A["x"] -= dx / d * push; A["y"] -= dy / d * push; B["x"] += dx / d * push; B["y"] += dy / d * push; moved = True
        if not moved: break
    FS = 11.5
    def tw(t): return len(t) * FS * .56 + 4
    def hit(r1, r2): return not (r1[2] <= r2[0] or r2[2] <= r1[0] or r1[3] <= r2[1] or r2[3] <= r1[1])
    boxes = [(it["x"] - it["iw"] / 2, it["y"] - it["ih"] / 2, it["x"] + it["iw"] / 2, it["y"] + it["ih"] / 2) for it in items]
    for it in items:
        x, y, hw, hh, W_, Hh = it["x"], it["y"], it["iw"] / 2, it["ih"] / 2, tw(it["name"]), FS + 2
        cands = [(x + hw + 2, y - Hh / 2), (x - hw - 2 - W_, y - Hh / 2), (x - W_ / 2, y - hh - Hh - 1), (x - W_ / 2, y + hh + 1),
                 (x + hw + 2, y - hh - Hh + 2), (x + hw + 2, y + hh - 2), (x - hw - 2 - W_, y - hh - Hh + 2), (x - hw - 2 - W_, y + hh - 2)]
        best = None
        for k_, (bx, by) in enumerate(cands):
            r = (bx, by, bx + W_, by + Hh)
            score = sum(hit(r, q) for q in boxes) * 10 + k_ * .1 + (100 if bx < 2 or by < 2 or bx + W_ > Wpx else 0)
            if best is None or score < best[0]: best = (score, r)
        boxes.append(best[1]); it["lab"] = best[1]
    LINKS = R.get("links", {})  # {site name: href}; for the campaign page
    for ins in R.get("insets", []):  # [[href, label, [lon0, lat0, lon1, lat1]]]: outline of a detail map
        href, lab, bb = ins
        (ax, ay), (bx_, by_) = PLL(bb[0], bb[3]), PLL(bb[2], bb[1])
        o.append(f'<a href="{href}" class="inset"><rect x="{ax:.1f}" y="{ay:.1f}" width="{bx_-ax:.1f}" height="{by_-ay:.1f}" fill="#fff" fill-opacity=".08" stroke="#7a2e2e" stroke-width="2.5" stroke-dasharray="10 5" rx="6"/>'
                 f'<text x="{ax+6:.1f}" y="{by_-6:.1f}" font-size="13" font-style="italic" font-weight="bold" fill="#7a2e2e" stroke="#f4efe1" stroke-width="3.5" paint-order="stroke">{lab}</text></a>')
    for it in items:
        x, y, kind, name = it["x"], it["y"], it["kind"], it["name"]
        lk = LINKS.get(name)
        o.append((f'<a href="{lk}">' if lk else "") + f'<g class="site" data-site="{slug(name)}" data-x="{x:.1f}" data-y="{y:.1f}">')
        col = "#7a2e2e" if kind in ("castle", "town") else "#2b2b2b"
        if it["tile"]:
            o.append(f'<use href="#i-{site_icon(name, kind)}" x="{x-it["iw"]/2:.1f}" y="{y-it["ih"]/2:.1f}" width="{it["iw"]:.1f}" height="{it["ih"]:.1f}"/>')
        else: o.append(f'<text x="{x:.1f}" y="{y+5:.1f}" text-anchor="middle" font-size="15" fill="{col}">{ICONS[kind]}</text>')
        r = it["lab"]
        o.append(f'<text x="{r[0]+2:.1f}" y="{r[3]-3:.1f}" font-size="{FS}" font-weight="bold" fill="#2b2418" stroke="#f4efe1" stroke-width="3" paint-order="stroke">{name}</text>')
        o.append("</g>" + ("</a>" if lk else ""))
        hid, hx = hex_of(it["lon"], it["lat"])  # key by true position, not the bumped one
        st = it["st"]
        keyed.append(dict(hex=hid, name=name, kind=kind, lat=it["lat"], lon=it["lon"], col=hx["col"], row=hx["row"], note=st[4] if len(st) > 4 else ""))
    if R.get("master"):  # print atlas: map only, plus a geometry dump for the page builder
        o.append("</svg>"); open(f"{OUT}/{key}.svg", "w").write("\n".join(o))
        G = dict(W=Wpx, H=H, hex_px=h * PX, w_px=w * PX, hexes=[dict(col=hx["col"], row=hx["row"], px=[round(v, 2) for v in P(hx["x"], hx["y"])], inside=hx["inside"], t=hx["t"], lat=round(hx["lat"], 6), lon=round(hx["lon"], 6)) for hx in hexes],
                 sites=[dict(name=k["name"], kind=k["kind"], hex=k["hex"], px=[round(it["x"], 2), round(it["y"], 2)]) for k, it in zip(keyed, items)])
        json.dump(G, open(f"{OUT}/{key}-grid.json", "w"), ensure_ascii=False)
        return keyed
    lx = Wpx + 10; ly = 40
    o.append(f'<text x="{lx}" y="{ly}" font-size="22" font-weight="bold" fill="#2b2418">{R["title"]}</text>')
    o.append(f'<text x="{lx}" y="{ly+20}" font-size="12" fill="#5b5040">{R["subtitle"]}</text>')
    walk = HEX_MI / 3.0 * 60
    o.append(f'<text x="{lx}" y="{ly+38}" font-size="12" fill="#5b5040">1 hex = {HEX_MI:g} mile{"s" if HEX_MI != 1 else ""} (about {walk:.0f} minutes on foot)</text>')
    # scale bar: 1 mile per tick
    sbm = 5 if HEX_MI >= 1 else 2
    o.append(f'<line x1="{lx}" y1="{ly+52}" x2="{lx+sbm*MI_KM*PX:.1f}" y2="{ly+52}" stroke="#2b2418" stroke-width="3"/><text x="{lx}" y="{ly+66}" font-size="11">{sbm} miles</text>')
    ly += 90
    for k, (fill, lab) in TERRAIN.items():
        if TILES and k in T_BG:
            o.append(f'<use href="#i-{T_BG[k]}" x="{lx-2}" y="{ly-15}" width="23" height="20"/>')
            if k in T_ICON: o.append(f'<use href="#i-{T_ICON[k]}" x="{lx+1}" y="{ly-13}" width="17" height="15"/>')
            o.append(f'<text x="{lx+26}" y="{ly}" font-size="12">{lab}</text>'); ly += 22; continue
        o.append(f'<rect x="{lx}" y="{ly-12}" width="18" height="14" fill="{fill}" stroke="#8a7f66"/><text x="{lx+26}" y="{ly}" font-size="12">{lab}</text>'); ly += 20
    o.append(f'<line x1="{lx}" y1="{ly-5}" x2="{lx+18}" y2="{ly-5}" stroke="#3f7fa8" stroke-width="3"/><text x="{lx+26}" y="{ly}" font-size="12">River</text>'); ly += 20
    if has_border:
        o.append(f'<line x1="{lx}" y1="{ly-5}" x2="{lx+18}" y2="{ly-5}" stroke="#7a2e2e" stroke-width="2" stroke-dasharray="5 3"/><text x="{lx+26}" y="{ly}" font-size="12">County border</text>'); ly += 20
    if POW:
        ly += 10
        for side, (fill, lab, edge) in SD.items():
            names = [p_[0] for p_ in POW if p_[4] == side]
            if not names: continue
            o.append(f'<rect x="{lx}" y="{ly-12}" width="18" height="14" fill="{fill}" fill-opacity=".6" stroke="{edge}" stroke-width="2"/><text x="{lx+26}" y="{ly}" font-size="13" font-weight="bold">{lab}</text>'); ly += 18
            for n_ in names:
                o.append(f'<text x="{lx+26}" y="{ly}" font-size="11">{n_}</text>'); ly += 14
            ly += 6
        o.append(f'<text x="{lx}" y="{ly}" font-size="11.5" font-style="italic">{R.get("unshaded", "Unshaded: mortal land (Crown, Church and Gaelic lords)")}</text>'); ly += 16
    ly += 10
    o.append(f'<text x="{lx}" y="{ly}" font-size="14" font-weight="bold">Sites</text>'); ly += 18
    for k in sorted(keyed, key=lambda k: k["hex"]):
        kd = k["kind"]
        o.append(f'<text x="{lx}" y="{ly}" font-size="11" font-weight="bold">{k["hex"]}</text>')
        if TILES and site_icon(k["name"], kd): o.append(f'<use href="#i-{site_icon(k["name"], kd)}" x="{lx+30}" y="{ly-12}" width="18" height="16"/>')
        else: o.append(f'<text x="{lx+39}" y="{ly}" text-anchor="middle" font-size="12">{ICONS[kd]}</text>')
        o.append(f'<text x="{lx+52}" y="{ly}" font-size="11">{k["name"]}</text>'); ly += 18
    o.append("</svg>")
    open(f"{OUT}/{key}.svg", "w").write("\n".join(o))
    # distances
    def miles(a, b):
        dx = (a["lon"] - b["lon"]) * kx; dy = (a["lat"] - b["lat"]) * ky
        return math.hypot(dx, dy) / MI_KM
    def hexdist(a, b):  # flat-top, odd columns shifted down
        def cube(c, r):
            x = c
            z = r - (c - (c & 1)) // 2
            return x, -x - z, z
        ax, ay, az = cube(a["col"], a["row"]); bx, by, bz = cube(b["col"], b["row"])
        return max(abs(ax - bx), abs(ay - by), abs(az - bz))
    lines = [f"# {R['title']}: distances between sites", "", f"Straight-line miles, hex steps at {HEX_MI:g} mi/hex, and hours on foot at 3 mph by road or open ground (double for bog, hills, forest or light woods; in woods a Survival roll finds a path at normal speed, Easy in light woods, Hard in forest).", "",
             "| From | To | Miles | Hexes | Hours on foot |", "| --- | --- | --- | --- | --- |"]
    for i, a in enumerate(keyed):
        for b in keyed[i + 1:]:
            mi = miles(a, b)
            lines.append(f"| {a['name']} ({a['hex']}) | {b['name']} ({b['hex']}) | {mi:.1f} | {hexdist(a, b)} | {mi/3:.1f} |")
    open(f"{OUT}/{key}-distances.md", "w").write("\n".join(lines) + "\n")
    counts = {}
    for hx in hexes:
        if hx["inside"]: counts[hx["t"]] = counts.get(hx["t"], 0) + 1
    print(key, ncol, "x", nrow, counts, flush=True)
    return keyed

summary = {}
for key, R in REGIONS.items():
    if ONLY and key not in ONLY: continue
    summary[key] = [{k: v for k, v in s.items() if k in ("hex", "name", "lat", "lon", "note")} for s in make(key, R)]
old = {}
p = f"{OUT}/sites-by-hex.json"
if os.path.exists(p): old = json.load(open(p))
old.update(summary)
json.dump(old, open(p, "w"), ensure_ascii=False, indent=1)
