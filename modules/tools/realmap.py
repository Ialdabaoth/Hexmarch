"""Real-world terrain for the E9 Atlas, pushed back to about 1420 (Heph 2026-11-05: the first step of every new campaign module).

Used by atlas_convert.py --real. For each 100-ft hex it reads real data at that spot and applies period rules:
  - land cover: ESA WorldCover 2021, 10 m (esa-worldcover.s3.eu-central-1.amazonaws.com, CC BY 4.0), cached in modules/.cache/worldcover
  - elevation and slope: SRTM 1 arc-second, about 30 m (already cached by build.py in modules/.cache/geo)
  - settlements: the module's own sites (castles, towns, abbeys...) stand in for medieval clearance
Period rules (RULES below, all tunable per module in module.json atlas.real):
  open water stays water (sea where WorldCover has no data, i.e. offshore; lake/river inland); wetland, moss and bare
  ground (mostly cut-over peat in Ireland) are bog, as is flat, low, wet-looking ground in the bog belt; high or steep
  ground is hills, very high ground mountains; modern towns go back to farmland; modern forest and scrub stay wooded;
  open farmland far from any settlement reverts to forest or light woods, more of it the further from people.
Per-module tweaks go in module.json atlas.real: any RULES key, plus modern_water [[lat, lon, radius_mi]] for reservoirs.
Rivers still come from the elevation data (hexmap.py) until OpenStreetMap is reachable from the build.
"""
import gzip, math, os, urllib.request
import numpy as np

WC_URL = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{t}_Map.tif'
RULES = dict(hills_m=200, hills_slope=9, mount_m=450, bog_slope=1.2, bog_max_m=130, bog_east_of=-6.75,
             clear_mi=2.0, wild_mi=6.0, wild_forest=.55)

def _wc_name(lat, lon):  # WorldCover tiles are 3 x 3 degrees, named by their SW corner
    la, lo = math.floor(lat / 3) * 3, math.floor(lon / 3) * 3
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}", la, lo

class Real:
    def __init__(self, root, mod, face, tid, fbm, uni):
        self.R = dict(RULES, **mod['atlas'].get('real', {})); self.face, self.TID, self.fbm, self.uni = face, tid, fbm, uni
        self.cache = os.path.join(root, '.cache'); self.wc = {}; self.dem = {}
        sites = [st for reg in mod['regions'].values() for st in reg.get('sites', []) if st[3] in ('castle', 'town', 'abbey', 'camp')]
        sx, sy = face.forward(np.array([s[1] for s in sites]), np.array([s[2] for s in sites]))
        self.sites = np.stack([sx, sy], 1) if sites else np.zeros((0, 2))

    def _wc_tile(self, name, la, lo):
        if name not in self.wc:
            import tifffile
            d = os.path.join(self.cache, 'worldcover'); os.makedirs(d, exist_ok=True); f = os.path.join(d, name + '.tif')
            if not os.path.exists(f): print('fetching WorldCover', name); urllib.request.urlretrieve(WC_URL.format(t=name), f)
            self.wc[name] = tifffile.imread(f)  # 36000 x 36000, 1/12000 degree per pixel, NW corner at (la + 3, lo)
        return self.wc[name]

    def landcover(self, lat, lon):
        """Main class over the hex: 5 x 5 WorldCover samples 20 m apart, so hedgerow trees don't speckle farmland into forest.
        Returns (class, tree share)."""
        cls = np.zeros((25,) + lat.shape, np.uint8); k = 0
        for dy in (-2, -1, 0, 1, 2):
            for dx in (-2, -1, 0, 1, 2):
                cls[k] = self._lc(lat + dy * 20 / 111320, lon + dx * 20 / (111320 * np.cos(np.radians(lat)))); k += 1
        cnt = np.stack([(cls == v).sum(0) for v in (0, 10, 20, 30, 40, 50, 60, 80, 90, 95, 100)])
        main = np.array([0, 10, 20, 30, 40, 50, 60, 80, 90, 95, 100], np.uint8)[cnt.argmax(0)]
        return main, cnt[1] / 25

    def _lc(self, lat, lon):
        out = np.zeros(lat.shape, np.uint8)
        names = {}
        for k, (la, lo) in enumerate(zip(np.floor(lat / 3) * 3, np.floor(lon / 3) * 3)): names.setdefault((la, lo), []).append(k)
        for (la, lo), ks in names.items():
            ks = np.array(ks); n, la, lo = _wc_name(la + .5, lo + .5); a = self._wc_tile(n, la, lo)
            r = np.clip(((la + 3 - lat[ks]) * 12000).astype(int), 0, 35999); c = np.clip(((lon[ks] - lo) * 12000).astype(int), 0, 35999)
            out[ks] = a[r, c]
        return out

    def _dem_tile(self, la, lo):
        if (la, lo) not in self.dem:
            f = os.path.join(self.cache, 'geo', f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}.hgt.gz")
            if not os.path.exists(f): self.dem[la, lo] = None
            else:
                a = np.frombuffer(gzip.open(f).read(), '>i2').reshape(3601, 3601).astype(np.float32); a[a < -1000] = 0
                k = 7; cs = np.pad(a, k // 2, mode='edge').cumsum(0).cumsum(1); cs = np.pad(cs, ((1, 0), (1, 0)))
                sm = (cs[k:, k:] - cs[:-k, k:] - cs[k:, :-k] + cs[:-k, :-k]) / k / k  # 7x7 (about 200 m) mean: SRTM noise would read as slope
                gy, gx = np.gradient(sm, 30.87, 30.87 * math.cos(math.radians(la + .5)))  # metres per cell
                self.dem[la, lo] = (a, np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32))
        return self.dem[la, lo]

    def elevation(self, lat, lon):
        z, sl = np.zeros(lat.shape, np.float32), np.zeros(lat.shape, np.float32)
        keys = np.stack([np.floor(lat), np.floor(lon)], 1)
        for la, lo in {tuple(k) for k in np.unique(keys, axis=0).tolist()}:
            t = self._dem_tile(int(la), int(lo)); m = (keys[:, 0] == la) & (keys[:, 1] == lo)
            if t is None or not m.any(): continue
            r = np.clip(((la + 1 - lat[m]) * 3600).round().astype(int), 0, 3600); c = np.clip(((lon[m] - lo) * 3600).round().astype(int), 0, 3600)
            z[m], sl[m] = t[0][r, c], t[1][r, c]
        return z, sl

    def __call__(self, C, R, x, y, lat, lon):
        R_, T = self.R, self.TID
        lc, tree = self.landcover(lat.ravel(), lon.ravel()); lc, tree = lc.reshape(lat.shape), tree.reshape(lat.shape); z, sl = self.elevation(lat.ravel(), lon.ravel()); z, sl = z.reshape(lat.shape), sl.reshape(lat.shape)
        d = np.full(x.shape, 1e12)  # feet to the nearest settlement
        for sx, sy in self.sites: d = np.minimum(d, np.hypot(x - sx, y - sy))
        dmi = d / 5000; wild = np.clip((dmi - R_['clear_mi']) / (R_['wild_mi'] - R_['clear_mi']), 0, 1)
        u = self.uni(self.fbm(x, y, 5, 1200))
        t = np.full(x.shape, T['grass'], np.uint8)
        farmed = np.isin(lc, (30, 40, 50))
        t[farmed & (u < wild * R_['wild_forest'])] = T['forest']
        t[farmed & (u >= wild * R_['wild_forest']) & (u < wild * (R_['wild_forest'] + .2))] = T['woods']
        t[lc == 10] = T['forest']; t[(lc == 20) | ((tree > .3) & farmed)] = T['woods']  # scrub, and farmland that is a third trees
        flat_wet = (sl < R_['bog_slope']) & (z < R_['bog_max_m']) & (z > 1) & (lon < R_['bog_east_of']) & np.isin(lc, (20, 30, 40)) & (u > .3)
        t[np.isin(lc, (60, 90, 95, 100)) | flat_wet] = T['bog']
        hi = (z > R_['hills_m']) | (sl > R_['hills_slope'])
        t[hi & ~np.isin(lc, (10,))] = T['hills']; t[hi & (lc == 10)] = T['forest']
        t[z > R_['mount_m']] = T['mount']
        t[lc == 80] = np.where(z[lc == 80] <= 1, T['sea'], T['lake']); t[lc == 0] = T['sea']  # WorldCover water at sea level is the sea
        for la, lo, rmi in R_.get('modern_water', []):  # reservoirs and other water that wasn't there in the period: back to land
            cx, cy = self.face.forward(la, lo); gone = (np.hypot(x - cx, y - cy) < rmi * 5000) & (t == T['lake']); t[gone] = T['grass']
        return t
