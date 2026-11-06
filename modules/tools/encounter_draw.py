"""E9 Atlas: draw Encounter maps (ENCOUNTER_FORMAT.md) from a small plan file.

    python3 -I encounter_draw.py modules/<module>/encounter-maps [map-id ...]

Each map has a plan at encounter-maps/<id>/plan.json, written by hand in squares (5 ft unless the plan
says otherwise). The tool draws the picture in the E9 ink style to encounter-maps/<id>/map.jpg and writes
the map file encounter-maps/<id>.json (format e9-encounter-map/1) with that picture as its one layer and the
plan's areas, links and notes. Drawings are original and CC0 like the rest of the tools: no hex tiles and
no traced art (Heph 2026-11-05: Encounter maps are feel-alikes with their own identity).

Plan keys (all coordinates in squares, [x, y] from the top-left, y down):
  title, size [w, h], ft (square size, default 5), px (pixels per square, default 40), seed
  style   "cave" (rock everywhere, floor carved out, rough walls) | "outdoor" (ground everywhere)
  ground  outdoor ground colour: grass | bog | forest | heath | ravine
  floor   carved or open shapes: {"rect": [x,y,w,h]} | {"blob": [cx,cy,rx,ry]} | {"path": [[x,y],...], "w": 2}
          add "built": true for straight masonry walls inside a cave plan
  rock    outdoor only: shapes drawn as cliff/rock (hatched), e.g. ravine walls; a path with "soft": "left"|"right"
          is a terrace cliff: hard inked face on the other side, that side blurred into the ledge ("fade" in squares)
  water   shapes drawn as water (pools, streams)
  road    shapes drawn as a beaten path
  mounds  shapes drawn as raised ground (barrows, hummocks)
  trees   [{"in": shape, "n": count, "kind": "oak"|"pine"|"scrub"|"reed", "r": radius}] scattered, seeded
  marks   [{"t": kind, "at": [x,y], ...}] kinds: num, letter, cave (mouth, optional "size"), label (optional "rot" degrees, "size", \n for lines), pit, secret, door, locked, stairs,
          fire, tent, web, bones, bed, table, chest, well, oak, sac, stake, garden, dotted, window
  areas, links, notes   copied into the map file
"""
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from shapely.geometry import Point, Polygon, LineString, box
from shapely.ops import unary_union
from shapely import affinity

FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
FONT_I = '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf'
INK = (36, 28, 21)
PAPER = (238, 228, 200)
ROCK = (92, 82, 70)
GROUND = {'grass': (163, 172, 112), 'bog': (132, 128, 88), 'forest': (128, 138, 92), 'heath': (150, 136, 98), 'ravine': (120, 128, 90)}
WATER = (112, 146, 150)
ROAD = (196, 176, 132)
CANOPY = {'oak': (84, 106, 58), 'pine': (60, 86, 62), 'scrub': (112, 122, 70), 'reed': (150, 150, 92)}


def font(path, size):
    try: return ImageFont.truetype(path, size)
    except OSError: return ImageFont.load_default()


class Noise:
    """Smooth 2D noise from a few seeded sine waves: the same plan always draws the same walls."""
    def __init__(self, rng, n=6, scale=1.0):
        # two octaves: broad bulges plus small knobs, so walls read as natural rock
        self.w = [(rng.uniform(.3, .9) / scale, rng.uniform(0, 2 * math.pi), rng.uniform(0, 2 * math.pi), rng.uniform(.6, 1)) for _ in range(n)] + \
                 [(rng.uniform(1.6, 3.2) / scale, rng.uniform(0, 2 * math.pi), rng.uniform(0, 2 * math.pi), rng.uniform(.2, .35)) for _ in range(n)]
    def __call__(self, x, y):
        s = sum(a * math.sin(f * (x * math.cos(th) + y * math.sin(th)) + ph) for f, th, ph, a in self.w)
        return s / sum(a for *_, a in self.w)


def shape(s, rough=0.0, nz=None):
    if 'rect' in s:
        x, y, w, h = s['rect']; g = box(x, y, x + w, y + h)
    elif 'blob' in s:
        cx, cy, rx, ry = s['blob']; g = affinity.scale(Point(cx, cy).buffer(1, 48), rx, ry)
    elif 'poly' in s:
        g = Polygon(s['poly'], [s['hole']] if s.get('hole') else None)
    elif 'path' in s:
        g = LineString(s['path']).buffer(s.get('w', 2) / 2, cap_style=1, join_style=1)
    else:
        raise ValueError(f'unknown shape {s}')
    if rough and not s.get('built'):
        g = roughen(g, rough, nz)
    return g


def roughen(g, amp, nz):
    def ring(coords):
        out = []
        for x, y in coords:
            out.append((x + amp * nz[0](x, y), y + amp * nz[1](x, y)))
        return out
    g = g.segmentize(0.25)
    polys = getattr(g, 'geoms', [g])
    res = [Polygon(ring(p.exterior.coords), [ring(i.coords) for i in p.interiors]).buffer(0) for p in polys]
    return unary_union(res)


def union(lst, rough=0.0, nz=None):
    return unary_union([shape(s, rough, nz) for s in lst]) if lst else Polygon()


def polys(g):
    if g.is_empty: return []
    return [p for p in getattr(g, 'geoms', [g]) if p.geom_type == 'Polygon']


def draw_poly(d, g, P, fill=None, outline=None, width=1):
    for p in polys(g):
        ext = [(x * P, y * P) for x, y in p.exterior.coords]
        if fill is not None: d.polygon(ext, fill=fill)
        for i in p.interiors:
            if fill is not None: d.polygon([(x * P, y * P) for x, y in i.coords], fill=(0, 0, 0, 0) if len(fill) == 4 else None)
        if outline is not None:
            d.line(ext, fill=outline, width=width, joint='curve')
            for i in p.interiors: d.line([(x * P, y * P) for x, y in i.coords], fill=outline, width=width, joint='curve')


def mask_of(g, W, H, P, grow=0):
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for p in polys(g.buffer(grow) if grow else g):
        d.polygon([(x * P, y * P) for x, y in p.exterior.coords], fill=255)
        for i in p.interiors: d.polygon([(x * P, y * P) for x, y in i.coords], fill=0)
    return m


def texture(W, H, base, rng, amount=10, blur=2):
    """A flat colour with seeded speckle, so floors and ground read as paper and earth, not plastic."""
    im = Image.effect_noise((W // 4 + 1, H // 4 + 1), amount * 3).resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(blur))
    r, g, b = base
    lut = lambda c: [max(0, min(255, c + (v - 128) * amount // 64)) for v in range(256)]
    return Image.merge('RGB', [im.point(lut(r)), im.point(lut(g)), im.point(lut(b))])


def hatch(d, region, P, rng, density=2.2, length=0.45, width=2, colour=INK):
    """Short ink strokes in little bundles across a band, the old-school way to draw solid rock."""
    minx, miny, maxx, maxy = region.bounds
    n = int(region.area * density)
    from shapely.prepared import prep
    pr = prep(region)
    for _ in range(n):
        x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
        if not pr.contains(Point(x, y)): continue
        a = rng.uniform(0, math.pi); dx, dy = math.cos(a), math.sin(a)
        for k in range(rng.randint(2, 4)):
            ox, oy = -dy * k * 0.12, dx * k * 0.12
            L = length * rng.uniform(.7, 1.1)
            d.line([((x + ox - dx * L / 2) * P, (y + oy - dy * L / 2) * P), ((x + ox + dx * L / 2) * P, (y + oy + dy * L / 2) * P)], fill=colour, width=width)


def tree(d, x, y, r, kind, P, rng):
    c = CANOPY.get(kind, CANOPY['oak'])
    if kind == 'reed':
        for _ in range(5):
            a = rng.uniform(-.5, .5); d.line([(x * P, y * P), ((x + a * r) * P, (y - r * 1.6) * P)], fill=(70, 72, 40), width=2)
        return
    d.ellipse([(x - r + .15) * P, (y - r + .2) * P, (x + r + .15) * P, (y + r + .2) * P], fill=(40, 46, 30, 110))
    if kind == 'pine':
        pts = []
        for k in range(16):
            a = k * math.pi / 8; rr = r * (1 if k % 2 == 0 else .62)
            pts.append(((x + rr * math.cos(a)) * P, (y + rr * math.sin(a)) * P))
        d.polygon(pts, fill=c, outline=INK); d.ellipse([(x - .08) * P, (y - .08) * P, (x + .08) * P, (y + .08) * P], fill=INK)
        return
    for k in range(5):
        a = k * 2 * math.pi / 5 + rng.uniform(0, 1); rr = r * .45
        cx, cy = x + rr * math.cos(a), y + rr * math.sin(a); q = r * .62
        d.ellipse([(cx - q) * P, (cy - q) * P, (cx + q) * P, (cy + q) * P], fill=c, outline=INK, width=2)
    q = r * .55; d.ellipse([(x - q) * P, (y - q) * P, (x + q) * P, (y + q) * P], fill=tuple(min(255, v + 18) for v in c))


def scatter(g, n, rng, mind):
    minx, miny, maxx, maxy = g.bounds; pts = []
    from shapely.prepared import prep
    pr = prep(g); tries = 0
    while len(pts) < n and tries < n * 60:
        tries += 1; x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
        if pr.contains(Point(x, y)) and all((x - a) ** 2 + (y - b) ** 2 >= mind ** 2 for a, b in pts): pts.append((x, y))
    return pts


def text_c(d, xy, s, f, fill=INK, stroke=None):
    kw = {'stroke_width': 3, 'stroke_fill': stroke} if stroke else {}
    d.text(xy, s, font=f, fill=fill, anchor='mm', **kw)


def mark(d, m, P, rng, fonts):
    t, (x, y) = m['t'], m['at']; X, Y = x * P, y * P
    if t in ('num', 'letter'):
        r = (.55 if t == 'num' else .8) * P
        d.ellipse([X - r, Y - r, X + r, Y + r], fill=(250, 244, 226) if t == 'num' else (120, 30, 24), outline=INK, width=3)
        text_c(d, (X, Y + 1), str(m['text']), fonts['num'] if t == 'num' else fonts['letter'], fill=INK if t == 'num' else (250, 244, 226))
    elif t == 'label':
        f = fonts['big'] if m.get('big') else fonts['label']
        if m.get('size'): f = font(FONT_I, int(P * m['size']))
        lines = str(m['text']).split('\n')
        if not m.get('rot') and len(lines) == 1:
            text_c(d, (X, Y), m['text'], f, fill=INK, stroke=(244, 236, 214))
        else:
            # rotated or stacked names follow a cliff or a building, as on a hand-lettered map
            lh = f.getbbox('Hg')[3] + 4
            tw = max(int(f.getlength(l)) for l in lines) + 12
            tile = Image.new('RGBA', (tw, lh * len(lines) + 8), (0, 0, 0, 0)); td = ImageDraw.Draw(tile)
            for i, l in enumerate(lines):
                td.text((tw / 2, 4 + lh * (i + .5)), l, font=f, fill=INK, anchor='mm', stroke_width=3, stroke_fill=(244, 236, 214))
            tile = tile.rotate(m.get('rot', 0), expand=True, resample=Image.BICUBIC)
            d._image.paste(tile, (int(X - tile.width / 2), int(Y - tile.height / 2)), tile)
    elif t == 'cave':
        # a cave mouth in a cliff foot: a dark opening with a lip of ink
        rx, ry = m.get('size', [1.1, .8]); rx *= P / 2; ry *= P / 2
        d.ellipse([X - rx - 3, Y - ry - 3, X + rx + 3, Y + ry + 3], fill=(60, 52, 42))
        d.ellipse([X - rx, Y - ry, X + rx, Y + ry], fill=(22, 18, 14), outline=INK, width=3)
    elif t == 'pit':
        s = .45 * P; d.rectangle([X - s, Y - s, X + s, Y + s], outline=INK, width=3)
        d.line([X - s, Y - s, X + s, Y + s], fill=INK, width=3); d.line([X - s, Y + s, X + s, Y - s], fill=INK, width=3)
    elif t in ('door', 'locked', 'secret', 'window'):
        h = m.get('dir', 'h') == 'h'; L, T = .5 * P, .18 * P
        r = [X - L, Y - T, X + L, Y + T] if h else [X - T, Y - L, X + T, Y + L]
        if t == 'secret':
            text_c(d, (X, Y), 'S', fonts['num'], fill=(120, 30, 24), stroke=(244, 236, 214))
        elif t == 'window':
            d.rectangle(r, fill=(200, 200, 190), outline=INK, width=2)
        else:
            d.rectangle(r, fill=(150, 104, 60), outline=INK, width=3)
            if t == 'locked': d.ellipse([X - .12 * P, Y - .12 * P, X + .12 * P, Y + .12 * P], fill=INK)
    elif t == 'stairs':
        w, h = m.get('size', [2, 2]); a = m.get('dir', 'n'); x0, y0 = X - w * P / 2, Y - h * P / 2
        d.rectangle([x0, y0, x0 + w * P, y0 + h * P], fill=(226, 214, 184), outline=INK, width=3)
        n = 6
        for k in range(1, n):
            if a in ('n', 's'): yy = y0 + k * h * P / n; d.line([x0, yy, x0 + w * P, yy], fill=INK, width=2)
            else: xx = x0 + k * w * P / n; d.line([xx, y0, xx, y0 + h * P], fill=INK, width=2)
    elif t == 'fire':
        r = m.get('r', .5) * P
        d.ellipse([X - r * 1.3, Y - r * 1.3, X + r * 1.3, Y + r * 1.3], fill=(110, 100, 90), outline=INK, width=2)
        d.ellipse([X - r, Y - r, X + r, Y + r], fill=(222, 120, 40)); d.ellipse([X - r * .5, Y - r * .5, X + r * .5, Y + r * .5], fill=(250, 210, 90))
    elif t == 'tent':
        w, h = m.get('size', [3, 3]); x0, y0 = X - w * P / 2, Y - h * P / 2
        d.rounded_rectangle([x0, y0, x0 + w * P, y0 + h * P], radius=.6 * P, fill=(160, 128, 92), outline=INK, width=3)
        d.line([X, y0 + .3 * P, X, y0 + h * P - .3 * P], fill=INK, width=3)
        for k in range(1, 4): yy = y0 + k * h * P / 4; d.line([x0 + .2 * P, yy, X, yy - .25 * P, x0 + w * P - .2 * P, yy], fill=(110, 84, 58), width=2)
    elif t == 'web':
        R = m.get('r', 2) * P; c = (245, 245, 240)
        for k in range(8):
            a = k * math.pi / 4 + .2; d.line([X, Y, X + R * math.cos(a), Y + R * math.sin(a)], fill=c, width=2)
        for rr in (.3, .55, .8, 1.0):
            pts = [(X + R * rr * math.cos(k * math.pi / 4 + .2), Y + R * rr * math.sin(k * math.pi / 4 + .2)) for k in range(9)]
            d.line(pts, fill=c, width=1)
    elif t == 'bones':
        for _ in range(m.get('n', 6)):
            sp = m.get('spread', 1.2); bx, by = X + rng.uniform(-sp, sp) * P, Y + rng.uniform(-sp, sp) * P; a = rng.uniform(0, math.pi); L = .32 * P; q = .09 * P
            ends = [(bx + e * L * math.cos(a), by + e * L * math.sin(a)) for e in (-1, 1)]
            d.line(ends, fill=INK, width=int(.16 * P)); d.line(ends, fill=(236, 230, 214), width=int(.1 * P))
            for ex, ey in ends: d.ellipse([ex - q, ey - q, ex + q, ey + q], fill=(236, 230, 214), outline=INK, width=2)
    elif t == 'nest':
        r = m.get('r', .8) * P; d.ellipse([X - r, Y - r * .8, X + r, Y + r * .8], fill=(190, 166, 104), outline=INK, width=2)
        for k in range(8):
            a = rng.uniform(0, math.pi); L = r * .6; d.line([X - L * math.cos(a), Y - L * .8 * math.sin(a), X + L * math.cos(a), Y + L * .8 * math.sin(a)], fill=(140, 116, 64), width=2)
    elif t == 'rubble':
        for _ in range(m.get('n', 8)):
            x2, y2 = X + rng.uniform(-1, 1) * m.get('spread', 1) * P, Y + rng.uniform(-1, 1) * m.get('spread', 1) * P; r = rng.uniform(.1, .3) * P; k = rng.randint(5, 7)
            d.polygon([(x2 + r * rng.uniform(.7, 1.2) * math.cos(a * 2 * math.pi / k), y2 + r * rng.uniform(.7, 1.2) * math.sin(a * 2 * math.pi / k)) for a in range(k)], fill=(168, 156, 136), outline=INK)
    elif t in ('bed', 'table', 'chest'):
        w, h = m.get('size', {'bed': [2, 3], 'table': [3, 1], 'chest': [1, .6]}[t]); x0, y0 = X - w * P / 2, Y - h * P / 2
        col = {'bed': (176, 150, 112), 'table': (150, 104, 60), 'chest': (120, 80, 40)}[t]
        d.rectangle([x0, y0, x0 + w * P, y0 + h * P], fill=col, outline=INK, width=3)
        if t == 'chest': d.line([x0, Y, x0 + w * P, Y], fill=INK, width=2)
    elif t == 'fence':
        pts = [(a * P, b * P) for a, b in m['path']]
        d.line(pts, fill=(110, 76, 44), width=max(3, int(.16 * P)))
        line = LineString(m['path'])
        for k in range(int(line.length / m.get('every', 2)) + 1):
            q = line.interpolate(k * m.get('every', 2)); r = .14 * P
            d.rectangle([q.x * P - r, q.y * P - r, q.x * P + r, q.y * P + r], fill=(80, 54, 30), outline=INK)
    elif t == 'fountain':
        r = 1.6 * P; d.ellipse([X - r, Y - r, X + r, Y + r], fill=(168, 160, 146), outline=INK, width=3)
        r = 1.2 * P; d.ellipse([X - r, Y - r, X + r, Y + r], fill=WATER, outline=INK, width=2)
        r = .35 * P; d.ellipse([X - r, Y - r, X + r, Y + r], fill=(168, 160, 146), outline=INK, width=2)
    elif t == 'well':
        r = .9 * P; d.ellipse([X - r, Y - r, X + r, Y + r], fill=(150, 140, 126), outline=INK, width=3)
        r = .5 * P; d.ellipse([X - r, Y - r, X + r, Y + r], fill=(40, 50, 58), outline=INK, width=2)
    elif t == 'oak':
        R = m.get('r', 3) * P
        for k in range(10):
            a = k * math.pi / 5; d.line([X, Y, X + 1.5 * R * math.cos(a), Y + 1.5 * R * math.sin(a)], fill=(110, 86, 60), width=int(.35 * P))
        d.ellipse([X - R, Y - R, X + R, Y + R], fill=(118, 90, 62), outline=INK, width=4)
        r = R * .72; d.ellipse([X - r, Y - r, X + r, Y + r], fill=(222, 206, 170), outline=INK, width=3)
    elif t == 'sac':
        r = .7 * P; d.ellipse([X - r, Y - r * .8, X + r, Y + r * .8], fill=(240, 238, 226), outline=INK, width=3)
        for _ in range(6):
            ex, ey = X + rng.uniform(-.4, .4) * P, Y + rng.uniform(-.3, .3) * P
            d.ellipse([ex - 3, ey - 3, ex + 3, ey + 3], fill=(150, 140, 120))
    elif t == 'stake':
        for k in range(m.get('n', 1)):
            sx, sy = X + k * m.get('dx', 0) * P, Y + k * m.get('dy', 0) * P
            d.polygon([(sx, sy - .3 * P), (sx + .15 * P, sy + .2 * P), (sx - .15 * P, sy + .2 * P)], fill=(120, 88, 56), outline=INK)
    elif t == 'garden':
        w, h = m['size']; x0, y0 = X - w * P / 2, Y - h * P / 2
        d.rectangle([x0, y0, x0 + w * P, y0 + h * P], fill=(122, 98, 66), outline=INK, width=2)
        for k in range(1, int(h * 2)): yy = y0 + k * P / 2; d.line([x0 + 4, yy, x0 + w * P - 4, yy], fill=(86, 118, 60), width=3)
    elif t == 'dotted':
        R = m['r'] * P; n = int(2 * math.pi * m['r'] * 1.5)
        for k in range(n):
            a = k * 2 * math.pi / n; d.ellipse([X + R * math.cos(a) - 3, Y + R * math.sin(a) - 3, X + R * math.cos(a) + 3, Y + R * math.sin(a) + 3], fill=(120, 30, 24))
    else:
        raise ValueError(f'unknown mark {t}')


def render(plan, rng):
    w, h = plan['size']; P = plan.get('px', 40); W, H = w * P, h * P
    nz = (Noise(rng, scale=plan.get('wobble', 1.2)), Noise(rng, scale=plan.get('wobble', 1.2)))
    cave = plan.get('style', 'cave') == 'cave'
    rough = plan.get('rough', 1.4 if cave else .4)
    floor = union(plan.get('floor', []), rough if cave else 0, nz)
    frame = box(0, 0, w, h)
    if cave:
        im = texture(W, H, ROCK, rng, 14, 3)
        fm = mask_of(floor, W, H, P)
        # a dark halo in the rock and a soft shade on the floor along each wall give the caves depth
        halo = fm.filter(ImageFilter.GaussianBlur(P * .5))
        im.paste((40, 34, 28), (0, 0), halo.point(lambda v: min(150, v * 2)))
        im.paste(texture(W, H, PAPER, rng, 8, 2), (0, 0), fm)
        inner = mask_of(floor.buffer(-.35), W, H, P).filter(ImageFilter.GaussianBlur(P * .4))
        shade = Image.composite(Image.new('L', (W, H), 0), fm.point(lambda v: 70 if v else 0), inner)
        im.paste((150, 130, 100), (0, 0), shade)
    else:
        im = texture(W, H, GROUND[plan.get('ground', 'grass')], rng, 16, 4)
    d = ImageDraw.Draw(im, 'RGBA')
    # outdoor: raised ground, water and cliffs
    if not cave:
        for s in plan.get('mounds', []):
            g = shape(s, .3, nz)
            draw_poly(d, g.buffer(.4), P, fill=(70, 60, 40, 70))
            draw_poly(d, g, P, fill=(150, 156, 100), outline=INK, width=3)
            hatch(d, g.difference(g.buffer(-.9)), P, rng, 1.6, .35, 2, (60, 66, 40))
        rock = union([r for r in plan.get('rock', []) if not r.get('soft')], .6, nz)
        if not rock.is_empty:
            im.paste(texture(W, H, ROCK, rng, 14, 3), (0, 0), mask_of(rock, W, H, P))
            d = ImageDraw.Draw(im, 'RGBA')
            hatch(d, rock.difference(rock.buffer(-1.4)), P, rng, 11, .5, 2)
            draw_poly(d, rock, P, outline=INK, width=4)
        # terraced cliffs: a path of rock with one hard, inked face ("soft" names the other side, left or right of
        # the path's direction) that fades into the ledge above it
        for r in [r for r in plan.get('rock', []) if r.get('soft')]:
            g = shape(r, .6, nz); line = LineString(r['path']); w2 = r.get('w', 2) / 2 + 1.5
            # shapely's left is the screen's right, because y runs down the map
            hard = line.buffer(-w2 if r['soft'] == 'right' else w2, single_sided=True)
            face = g.intersection(hard)
            m = mask_of(g, W, H, P).filter(ImageFilter.GaussianBlur(P * r.get('fade', .6)))
            m = Image.fromarray(np.maximum(np.asarray(m), np.asarray(mask_of(face, W, H, P))))
            im.paste(texture(W, H, ROCK, rng, 14, 3), (0, 0), m)
            d = ImageDraw.Draw(im, 'RGBA')
            hatch(d, g.difference(g.buffer(-1.1)).intersection(hard), P, rng, 11, .5, 2)
            hatch(d, g.buffer(-.4), P, rng, 3, .4, 1, (60, 52, 44))
            edge = g.boundary.intersection(hard.buffer(-.05))
            for ln in getattr(edge, 'geoms', [edge]):
                if ln.geom_type == 'LineString' and ln.length > .3:
                    d.line([(x * P, y * P) for x, y in ln.coords], fill=INK, width=4, joint='curve')
        # paths, dirt and paving go over the ground and any rock they climb
        road = union(plan.get('road', []), .25, nz)
        im.paste(texture(W, H, ROAD, rng, 10, 2), (0, 0), mask_of(road, W, H, P).filter(ImageFilter.GaussianBlur(P * .15)))
        cob = union(plan.get('cobbles', []))
        if not cob.is_empty:
            im.paste(texture(W, H, (176, 168, 150), rng, 12, 1), (0, 0), mask_of(cob, W, H, P))
            d = ImageDraw.Draw(im, 'RGBA')
            for p_ in polys(union([c for c in plan['cobbles'] if not c.get('plain')])):
                x0, y0, x1, y1 = p_.bounds
                for yy in range(int(y0 * 2), int(y1 * 2) + 1):
                    for xx in range(int(x0 * 2), int(x1 * 2) + 1):
                        if p_.contains(Point(xx / 2 + .25, yy / 2 + .25)): d.rectangle([xx * P / 2 + 1, yy * P / 2 + 1, (xx + 1) * P / 2 - 1, (yy + 1) * P / 2 - 1], outline=(120, 112, 98))
        d = ImageDraw.Draw(im, 'RGBA')
        # outdoor floor: dug or built spaces (a barrow passage, a tunnel, a cellar) drawn over the ground in ink
        if not floor.is_empty:
            im.paste(texture(W, H, PAPER, rng, 8, 2), (0, 0), mask_of(floor, W, H, P))
            d = ImageDraw.Draw(im, 'RGBA')
            draw_poly(d, floor, P, outline=INK, width=4)
    water = union(plan.get('water', []), .35, nz)
    draw_poly(d, water.buffer(.15), P, fill=(70, 80, 70, 120))
    draw_poly(d, water, P, fill=WATER, outline=(44, 59, 69), width=3)
    for p in polys(water.buffer(-.5)):
        for k in range(0, len(p.exterior.coords) - 1, 6):
            x, y = p.exterior.coords[k]; d.line([(x - .3) * P, y * P, (x + .3) * P, y * P], fill=(170, 196, 198), width=2)
    # masonry: curtain walls, towers and roofed buildings (built maps such as the keep)
    STONE = (168, 160, 146)
    def building(b):
        g = shape(b); x0, y0, x1, y1 = g.bounds
        roof = {'slate': (104, 112, 122), 'thatch': (184, 154, 92), 'tile': (156, 84, 60), 'stone': STONE, 'lead': (130, 132, 128), 'wood': (150, 108, 64)}[b.get('roof', 'slate')]
        draw_poly(d, affinity.translate(g, .3, .3), P, fill=(40, 34, 28, 110))
        draw_poly(d, g, P, fill=roof, outline=INK, width=3)
        if b.get('roof', 'slate') != 'stone':
            dark = tuple(max(0, v - 30) for v in roof)
            if x1 - x0 >= y1 - y0:
                ym = (y0 + y1) / 2; d.line([x0 * P, ym * P, x1 * P, ym * P], fill=INK, width=2)
                for k in range(int((x1 - x0) * 2)): xx = (x0 + k / 2) * P; d.line([xx, y0 * P + 2, xx, ym * P - 2], fill=dark, width=1); d.line([xx, ym * P + 2, xx, y1 * P - 2], fill=dark, width=1)
            else:
                xm = (x0 + x1) / 2; d.line([xm * P, y0 * P, xm * P, y1 * P], fill=INK, width=2)
                for k in range(int((y1 - y0) * 2)): yy = (y0 + k / 2) * P; d.line([x0 * P + 2, yy, xm * P - 2, yy], fill=dark, width=1); d.line([xm * P + 2, yy, x1 * P - 2, yy], fill=dark, width=1)
    # shops and houses first, then the curtain walls and the stone blocks built into them on top, so the masonry reads clean
    for b in plan.get('buildings', []):
        if b.get('roof', 'slate') != 'stone': building(b)
    for s in plan.get('walls', []):
        g = shape(s)  # a closed wall is a ring with a hole, so fill it through a mask
        im.paste((50, 44, 36), (0, 0), mask_of(g.buffer(.25), W, H, P).point(lambda v: v * 90 // 255))
        im.paste(STONE, (0, 0), mask_of(g, W, H, P))
        d = ImageDraw.Draw(im, 'RGBA')
        draw_poly(d, g, P, outline=INK, width=3)
    for b in plan.get('buildings', []):
        if b.get('roof', 'slate') == 'stone': building(b)
    for t in plan.get('towers', []):
        g = shape(t)
        draw_poly(d, g.buffer(.3), P, fill=(40, 34, 28, 110))
        draw_poly(d, g, P, fill=STONE, outline=INK, width=4)
        draw_poly(d, g.buffer(-.7), P, fill=(140, 132, 120), outline=INK, width=2)
        ring = g.buffer(-.35).exterior
        for k in range(0, int(ring.length / .8)):
            q = ring.interpolate(k * .8); d.rectangle([(q.x - .15) * P, (q.y - .15) * P, (q.x + .15) * P, (q.y + .15) * P], fill=INK)
    # cave walls: a hatched band of rock along every wall, then a heavy ink line
    if cave:
        band = floor.buffer(.8).difference(floor).intersection(frame)
        hatch(d, band, P, rng, 12, .5, 2)
        draw_poly(d, floor, P, outline=INK, width=5)
        # loose rubble and stalagmites along the walls, seeded
        edge = floor.difference(floor.buffer(-1.1))
        for x, y in scatter(edge, int(floor.area * plan.get('rubble', .05)), rng, .8):
            r = rng.uniform(.12, .32); k = rng.randint(5, 7)
            pts = [((x + r * rng.uniform(.7, 1.2) * math.cos(a * 2 * math.pi / k)) * P, (y + r * rng.uniform(.7, 1.2) * math.sin(a * 2 * math.pi / k)) * P) for a in range(k)]
            d.polygon(pts, fill=(168, 156, 136), outline=INK)
    # grid on the floor (caves) or everywhere (outdoor)
    gmask = mask_of(floor, W, H, P) if cave else Image.new('L', (W, H), 255)
    grid = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(grid)
    gc = (90, 70, 46, 70) if cave else (40, 40, 20, 46)
    for i in range(w + 1): gd.line([i * P, 0, i * P, H], fill=gc, width=1)
    for j in range(h + 1): gd.line([0, j * P, W, j * P], fill=gc, width=1)
    im.paste(grid, (0, 0), Image.composite(grid, Image.new('RGBA', (W, H)), gmask))
    d = ImageDraw.Draw(im, 'RGBA')
    # trees and scrub, seeded, never on the floor, water or rock
    block = unary_union([floor, water, union(plan.get('road', [])), union(plan.get('walls', [])), union(plan.get('buildings', [])), union(plan.get('towers', [])), union(plan.get('cobbles', []))] + ([union(plan.get('rock', []))] if not cave else []))
    for t in plan.get('trees', []):
        g = shape(t['in']).difference(block.buffer(t.get('r', 1) * .6))
        for x, y in sorted(scatter(g, t['n'], rng, t.get('r', 1) * 1.2), key=lambda p: p[1]):
            tree(d, x, y, t.get('r', 1) * rng.uniform(.8, 1.15), t.get('kind', 'oak'), P, rng)
    fonts = {'num': font(FONT_B, int(P * .62)), 'letter': font(FONT_B, int(P * .95)), 'label': font(FONT_I, int(P * .7)), 'big': font(FONT_I, int(P * 1.1))}
    for m in sorted(plan.get('marks', []), key=lambda m: m['t'] in ('num', 'letter', 'label')):
        mark(d, m, P, rng, fonts)
    # frame, north arrow and scale
    d.rectangle([0, 0, W - 1, H - 1], outline=INK, width=6)
    # the scale bar sits on the grid: it starts on a grid line and each block is exactly one square
    sx, sy = P, H - P; n = 4 if plan.get('ft', 5) == 5 else 5
    for k in range(n): d.rectangle([sx + k * P, sy - .25 * P, sx + (k + 1) * P, sy], fill=INK if k % 2 == 0 else (244, 236, 214), outline=INK, width=2)
    text_c(d, (sx + n * P / 2, sy - .7 * P), f"{n * plan.get('ft', 5)} ft", fonts['label'], stroke=(244, 236, 214))
    ax, ay = W - P * 1.2, P * 1.6
    d.polygon([(ax, ay - P), (ax + .35 * P, ay + .3 * P), (ax, ay), (ax - .35 * P, ay + .3 * P)], fill=INK)
    text_c(d, (ax, ay + .8 * P), 'N', fonts['num'], stroke=(244, 236, 214))
    return im


def build(root, mid):
    pdir = os.path.join(root, mid); plan = json.load(open(os.path.join(pdir, 'plan.json')))
    rng = random.Random(plan.get('seed', mid))
    im = render(plan, rng)
    im.save(os.path.join(pdir, 'map.jpg'), quality=82, optimize=True, progressive=True)
    P = plan.get('px', 40)
    m = {'format': 'e9-encounter-map/1', 'id': mid, 'title': plan['title'], 'size': plan['size'],
         'grid': {'ft': plan.get('ft', 5), 'show': True},
         'layers': [{'src': f'{mid}/map.jpg', 'at': [0, 0], 'px': P}],
         'ground': 'none'}
    if plan.get('terrain'): m['terrain'] = plan['terrain']
    for k in ('anchor', 'areas', 'links', 'notes'):
        if plan.get(k): m[k] = plan[k]
    m.update({'walls': [], 'doors': [], 'lights': [], 'environment': {},
              'licence': 'CC0', 'credit': 'Drawn for Beyond the Pale with the E9 Atlas encounter tool (original layout, no traced art)'})
    json.dump(m, open(os.path.join(root, mid + '.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"{mid}: {plan['size'][0]}x{plan['size'][1]} squares, {len(plan.get('areas', {}))} areas, {os.path.getsize(os.path.join(pdir, 'map.jpg')) // 1024} KB")


if __name__ == '__main__':
    root = sys.argv[1]
    ids = sys.argv[2:] or sorted(d for d in os.listdir(root) if os.path.isfile(os.path.join(root, d, 'plan.json')))
    for mid in ids: build(root, mid)
