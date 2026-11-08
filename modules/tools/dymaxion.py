"""Dymaxion face projection for the E9 Atlas (see ATLAS_FORMAT.md, "Projection").

One icosahedron face is centred on the region's centroid, with one vertex due north, and points on that face go
through Robert W. Gray's exact transform (as in his dymax.c). Output is in feet on the face: x east, y south, scaled
so that distances at the centroid are true (the mile is 5000 ft). Works on numpy arrays.
"""
import math
import numpy as np

R_FT = 6371008.8 / 0.3048  # mean Earth radius in feet
GARC = 2 * math.asin(math.sqrt((5 - math.sqrt(5)) / 10))  # arc of one icosahedron edge
GT = GARC / 2
GDVE = math.sqrt((3 + math.sqrt(5)) / (5 + math.sqrt(5)))
GEL = math.sqrt(8 / (5 + math.sqrt(5)))
GS0 = math.sqrt(5 + 2 * math.sqrt(5)) / math.sqrt(15)


def _gray(x, y, z):
    """Gray's transform of unit vectors in the face frame (z = face centre, +y = a vertex) to plane units (radians of edge arc)."""
    gs = GS0 / z
    xp, yp = x * gs, y * gs
    a0 = GT + np.arctan2(2 * yp / math.sqrt(3) + GEL / 3 - GEL / 2, GDVE)
    a1 = GT + np.arctan2(xp - yp / math.sqrt(3) + GEL / 3 - GEL / 2, GDVE)
    a2 = GT + np.arctan2(GEL / 3 - xp - yp / math.sqrt(3) - GEL / 2, GDVE)
    return 0.5 * (a1 - a2), (2 * a0 - a1 - a2) / (2 * math.sqrt(3))


_e = 1e-7
K = _gray(np.array(_e), np.array(0.0), np.array(1.0))[0] / _e  # plane units per radian at the face centre (isotropic there)


class Face:
    def __init__(self, lat, lon):
        p, l = math.radians(lat), math.radians(lon)
        self.E = np.array([-math.sin(l), math.cos(l), 0.0])
        self.N = np.array([-math.sin(p) * math.cos(l), -math.sin(p) * math.sin(l), math.cos(p)])
        self.U = np.array([math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p)])

    def forward(self, lat, lon):
        """lat, lon (degrees) -> (x_ft east, y_ft south) from the centroid."""
        p, l = np.radians(np.asarray(lat, float)), np.radians(np.asarray(lon, float))
        v = np.stack([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)], -1)
        gx, gy = _gray(v @ self.E, v @ self.N, v @ self.U)
        return gx / K * R_FT, -gy / K * R_FT

    def inverse(self, x, y, iters=6):
        """(x_ft, y_ft) -> lat, lon (degrees), by Newton steps from the azimuthal guess."""
        x, y = np.asarray(x, float), np.asarray(y, float)
        def ll(a, b):  # face-frame tangent offsets (radians) -> lat, lon
            r = np.hypot(a, b); c = np.cos(r); s = np.where(r > 0, np.sin(r) / np.where(r > 0, r, 1), 1)
            v = np.outer(c, self.U).reshape(*a.shape, 3) + (s * a)[..., None] * self.E + (s * b)[..., None] * self.N
            return np.degrees(np.arcsin(np.clip(v[..., 2], -1, 1))), np.degrees(np.arctan2(v[..., 1], v[..., 0]))
        a, b = x / R_FT, -y / R_FT
        h = 1e-9
        for _ in range(iters):
            fx, fy = self.forward(*ll(a, b)); fx, fy = fx / R_FT, -fy / R_FT
            ax, ay = self.forward(*ll(a + h, b)); bx, by = self.forward(*ll(a, b + h))
            j11, j21 = (ax / R_FT - fx) / h, (-ay / R_FT - fy) / h
            j12, j22 = (bx / R_FT - fx) / h, (-by / R_FT - fy) / h
            ex, ey = x / R_FT - fx, -y / R_FT - fy; det = j11 * j22 - j12 * j21
            a, b = a + (j22 * ex - j12 * ey) / det, b + (j11 * ey - j21 * ex) / det
        return ll(a, b)


if __name__ == "__main__":  # self-checks
    f = Face(53.489, -7.561)
    # the face's north vertex lands on the triangle corner: centre-to-vertex = edge / sqrt(3)
    cv = math.acos(math.sqrt((5 + 2 * math.sqrt(5)) / 15))
    gx, gy = _gray(np.array(0.0), np.array(math.sin(cv)), np.array(math.cos(cv)))
    print("vertex", float(gx / GARC), float(gy / GARC), "want 0,", 1 / math.sqrt(3))
    for la, lo, nm in ((53.489, -7.561, "Uisneach"), (53.579, -6.611, "Tara"), (52.65, -7.25, "Kilkenny"), (55.38, -7.37, "Malin Head"), (51.42, -9.52, "Mizen Head")):
        x, y = f.forward(la, lo); bl = f.inverse(x, y)
        d = 2 * math.asin(math.sqrt(math.sin(math.radians(la - 53.489) / 2) ** 2 + math.cos(math.radians(la)) * math.cos(math.radians(53.489)) * math.sin(math.radians(lo + 7.561) / 2) ** 2)) * R_FT
        print(f"{nm:11s} x {float(x)/5000:8.2f} mi  y {float(y)/5000:8.2f} mi  scale err {(math.hypot(x, y) / d - 1) * 100 if d else 0:+.3f}%  round trip {abs(bl[0]-la)+abs(bl[1]-lo):.1e} deg")
