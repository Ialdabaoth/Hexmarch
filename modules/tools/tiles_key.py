# Knock the painted ground out of a merged pointy-top tile, leaving the feature art as an icon.
# usage: python3 -I tiles_key.py <packs dir> <out dir> <pack/name> ...
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter
def key(p, tol=34, soft=22):
    im = Image.open(p).convert('RGBA'); W, H = im.size; a = np.asarray(im).astype(float)
    m = 12; mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).polygon([(W/2, m), (W-m, H*.25+m/2), (W-m, H*.75-m/2), (W/2, H-m), (m, H*.75-m/2), (m, H*.25+m/2)], fill=255)
    mk = np.asarray(mask) > 0
    rgb = a[..., :3]
    # ground colour: a vertical gradient fitted to the clean ring just inside the hex edge
    inner = Image.new('L', (W, H), 0); m2 = 34
    ImageDraw.Draw(inner).polygon([(W/2, m2), (W-m2, H*.25+m2/2), (W-m2, H*.75-m2/2), (W/2, H-m2), (m2, H*.75-m2/2), (m2, H*.25+m2/2)], fill=255)
    ring = mk & ~(np.asarray(inner) > 0)
    ys, xs = np.nonzero(ring); c = rgb[ys, xs]; l = c.mean(-1)
    sel = l > np.percentile(l, 35); ys, c = ys[sel], c[sel]
    A_ = np.stack([np.ones_like(ys), ys, ys ** 2], 1).astype(float)
    coef = np.linalg.lstsq(A_, c, rcond=None)[0]
    yy = np.arange(H)[:, None].astype(float); bg = np.concatenate([np.ones_like(yy), yy, yy ** 2], 1) @ coef
    d = np.sqrt(((rgb - bg[:, None, :]) ** 2).sum(-1))
    out = np.clip((d - tol) / soft, 0, 1)
    out[~mk] = 0
    al = Image.fromarray((out * 255).astype('uint8')).filter(ImageFilter.MedianFilter(3))
    im.putalpha(al)
    return im.crop(im.getbbox())
if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]; os.makedirs(dst, exist_ok=True)
    for f in sys.argv[3:]:
        key(os.path.join(src, f + '.png')).save(os.path.join(dst, f.split('/')[-1] + '.png'))
