# Blend tiles: a base colour "bleeds out" across the edge into a neighbouring hex of a lower colour (Heph 2026-11-05).
# usage: python3 -I tiles_blend.py <icons dir> <masks dir>
# Masks (alpha, 238x206 flat-top hex): edge.png = the N edge, corner.png = the NW-N vertex. Each is rotated by
# 60-degree steps clockwise: edge k = 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW; vertex k lies between edges k-1 and k (see
# hexmap.py BLEED) and multiplied into the source colour's own textured hex. Writes bleed-<colour>-e<k>.png and -c<k>.png,
# plus bg-blue.png (the grey texture recoloured as water) for sea hexes.
import sys, os
import numpy as np
from PIL import Image, ImageFilter
ICONS, MASKS = sys.argv[1:3]
RANK = ['blue', 'brown', 'green', 'grey']
def bg(c): return Image.open(os.path.join(ICONS, f'bg-{c}.png')).convert('RGBA')
# water: the grey tile's texture mapped onto a blue ramp
g = bg('grey'); a = np.asarray(g).astype(float); L = a[..., :3].mean(-1, keepdims=True)
lo, hi = np.array([92, 146, 168]), np.array([172, 210, 222])
t = (L - L.min()) / max(1, L.max() - L.min())
Image.fromarray(np.concatenate([lo + (hi - lo) * t, a[..., 3:]], -1).astype('uint8')).save(os.path.join(ICONS, 'bg-blue.png'))
edge, corner = (Image.open(os.path.join(MASKS, n)).getchannel('A') for n in ('edge.png', 'corner.png'))
# "-x" twins without the painted hex rim, for the viewer's Hex Edges box: the texture zoomed past its rim, keeping the hex's own alpha
RIMLESS = 1.12
def rimless(im):
    W, H = im.size; z = im.resize((round(W * RIMLESS), round(H * RIMLESS)), Image.LANCZOS)
    P = PAD; l, t = (z.width - W) // 2 - P, (z.height - H) // 2 - P; out = z.crop((l, t, l + W + 2 * P, t + H + 2 * P))
    a = Image.new('L', out.size, 0); a.paste(im.getchannel('A'), (P, P))
    out.putalpha(a.filter(ImageFilter.MaxFilter(2 * P - 1))); return out  # alpha grown past the hex so neighbours overlap: no seams
PAD = 4  # the twins carry this margin; hexmap.py icon_defs gives them a viewBox that hides it again
for c in RANK:
    rimless(bg(c)).save(os.path.join(ICONS, f'bg-{c}-x.png'), optimize=True)
for c in RANK:  # every colour, blue too: each side of a border bleeds into the other (Heph 2026-11-05 experiment)
    for sfx, src in (('', bg(c)), ('-x', rimless(bg(c)))):
        sa = np.asarray(src.getchannel('A')).astype(float)
        for kind, m in (('e', edge), ('c', corner)):
            for k in range(6):
                r = m.rotate(-60 * k, resample=Image.BICUBIC, center=(m.width / 2, m.height / 2))
                ra = np.asarray(r).astype(float)
                if sfx: ra = np.pad(ra, PAD, mode='edge')  # the -x twin's margin
                out = src.copy(); out.putalpha(Image.fromarray((ra * sa / 255).astype('uint8')))
                out.save(os.path.join(ICONS, f'bleed-{c}-{kind}{k}{sfx}.png'), optimize=True)
print('blend tiles written to', ICONS)
