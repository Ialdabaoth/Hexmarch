# Blend tiles: a base colour "bleeds out" across the edge into a neighbouring hex of a lower colour (Heph 2026-11-05).
# usage: python3 -I tiles_blend.py <icons dir> <masks dir>
# Masks (alpha, 238x206 flat-top hex): edge.png = the N edge, corner.png = the NW-N vertex. Each is rotated by
# 60-degree steps clockwise: edge k = 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW; vertex k lies between edges k-1 and k (see
# hexmap.py BLEED) and multiplied into the source colour's own textured hex. Writes bleed-<colour>-e<k>.png and -c<k>.png,
# plus bg-blue.png (the grey texture recoloured as water) for sea hexes.
import sys, os
import numpy as np
from PIL import Image
ICONS, MASKS = sys.argv[1:3]
RANK = ['blue', 'brown', 'green', 'grey']          # a colour bleeds into every colour before it in this list
def bg(c): return Image.open(os.path.join(ICONS, f'bg-{c}.png')).convert('RGBA')
# water: the grey tile's texture mapped onto a blue ramp
g = bg('grey'); a = np.asarray(g).astype(float); L = a[..., :3].mean(-1, keepdims=True)
lo, hi = np.array([92, 146, 168]), np.array([172, 210, 222])
t = (L - L.min()) / max(1, L.max() - L.min())
Image.fromarray(np.concatenate([lo + (hi - lo) * t, a[..., 3:]], -1).astype('uint8')).save(os.path.join(ICONS, 'bg-blue.png'))
edge, corner = (Image.open(os.path.join(MASKS, n)).getchannel('A') for n in ('edge.png', 'corner.png'))
for c in RANK[1:]:
    src = bg(c); sa = np.asarray(src.getchannel('A')).astype(float)
    for kind, m in (('e', edge), ('c', corner)):
        for k in range(6):
            r = m.rotate(-60 * k, resample=Image.BICUBIC, center=(m.width / 2, m.height / 2))
            out = src.copy(); out.putalpha(Image.fromarray((np.asarray(r).astype(float) * sa / 255).astype('uint8')))
            out.save(os.path.join(ICONS, f'bleed-{c}-{kind}{k}.png'), optimize=True)
print('blend tiles written to', ICONS)
