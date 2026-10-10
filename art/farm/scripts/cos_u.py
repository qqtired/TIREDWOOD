# TIREDWOOD, фермерская косметика, слот u (верх): слой ткани (PNG из cos_layers.mjs) + жёсткие детали.
# Второй проход: полоса от подола 0.27 (17 %) до линии под лицом (0.885), бока 69 %, спина 79 %; у курток распах
# с бортами и лацканами, воротник за лицом по бокам; у футболок подол с подгибкой; манжеты рукавов на варежках.
# Накидка «Листопад» — отдельная мягкая сетка. Blender -b --factory-startup --python art/farm/scripts/cos_u.py -- [names]
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cos_stage import *  # noqa
from cos_h import hsh, shade, spec  # noqa

CLOTH, GLOSS, METAL = 0, 1, 2
U_BOT = 0.711  # верх слота l (для cos_l.py)
UB = 0.27      # подол u
META = json.load(open(TEX_DIR + '/cos_layers.json'))['layers']


def layer(key):
    m = META[key]
    glow = TEX_DIR + '/' + m['glow'] if 'glow' in m else None
    return [(TEX_DIR + '/' + m['png'], m['roughness'], glow)]


def dphi(phi):
    return abs(((phi % TAU) + TAU) % TAU - PI)


def topU(phi):
    """Тот же край у шеи, что в cos_layers.mjs (topU)."""
    d = dphi(phi)
    return 0.885 + 0.195 * smooth(0.55, 1.4, d) + 0.17 * smooth(1.4, 2.8, d)


def openJ(y):
    return 0.03 + 0.1 * smooth(0.3, 0.885, y)


def edge_phi(y, side, extra=0.0, open_fn=openJ):
    """Угол края распаха на высоте y: side = +1 — левый борт (phi > pi), -1 — правый."""
    return PI + side * (open_fn(y) + extra) / bodyR(y)


def profile_band(P, col, yfn, prof, phi0=0.0, phi1=TAU, nu=40, closed=True, fcol=None, mat=CLOTH):
    """Кольцо/дуга по телу с профилем prof = [(dy, off), ...] снизу вверх от высоты yfn(phi)."""
    nv = len(prof) - 1

    def fn(u, v):
        phi = phi0 + (phi1 - phi0) * u
        k = v * nv
        i = min(int(k), nv - 1)
        w = k - i
        return onBody(phi, yfn(phi) + lerp(prof[i][0], prof[i + 1][0], w), lerp(prof[i][1], prof[i + 1][1], w))
    P.add(grid(fn, nu, nv, closed_u=closed, fcol=fcol), col, mat)


HEM = [(-0.004, 0.002), (0.0, 0.012), (0.018, 0.014), (0.034, 0.008), (0.038, 0.002)]   # подгибка подола
RIB = [(-0.03, 0.002), (-0.026, 0.009), (0.004, 0.01), (0.012, 0.004)]                   # резинка горловины


def hem(P, col, gap=None, open_fn=openJ, fcol=None, nu=38):
    if gap is None:
        profile_band(P, col, lambda phi: UB, HEM, nu=nu, fcol=fcol)
    else:
        a = (open_fn(UB) + gap) / bodyR(UB)
        profile_band(P, col, lambda phi: UB, HEM, PI + a, 3 * PI - a, nu, closed=False, fcol=fcol)


def borders(P, col, width=0.032, thick=0.009, open_fn=openJ, y1=None, mat=CLOTH):
    """Борта вдоль распаха (снаружи от края) от подола до ворота."""
    y1 = y1 or 0.86
    for side in (-1, 1):
        pts = []
        for k in range(13):
            y = UB + 0.004 + (y1 - UB - 0.004) * k / 12
            pts.append((edge_phi(y, side, width / 2 - 0.004, open_fn), y, 0.003))
        P.add(strap(pts, 0, width, thick, 12, smooth_path=False), col, mat)


def lapels(P, col, depth=0.16, width=0.075):
    """Лацканы: треугольные отвороты у ворота, лежат на груди наружу от распаха."""
    for side in (-1, 1):
        def fn(u, v):
            y = lerp(0.885 - depth, 0.878, u)
            s = openJ(y) + 0.004 + v * width * u ** 0.8
            return onBody(PI + side * s / bodyR(y), y, 0.014 + 0.008 * v)
        P.add(grid(fn, 5, 2, flip=side < 0), col)


def collar(P, col, start=0.42, rise=0.06, fall=0.075, n=30, stand=False, fcol=None):
    """Воротник по краю у шеи от угла start (от лица) через спину: отложной (подъём и отворот) или стойка."""
    def fn(u, v):
        phi = PI + start + u * (TAU - 2 * start)
        y0 = topU(phi)
        d = dphi(phi)
        r = rise * (0.75 + 0.25 * smooth(start, 1.4, d))
        if stand:
            prof = [(y0 - 0.006, 0.003), (y0 + r * 0.5, 0.018), (y0 + r, 0.012)]
        else:
            fl = fall * (0.8 + 0.4 * smooth(start + 0.5, start, d))
            prof = [(y0 - 0.006, 0.003), (y0 + r, 0.02), (y0 + r - fl, 0.036)]
        k = v * 2
        i = min(int(k), 1)
        w = k - i
        return onBody(phi, lerp(prof[i][0], prof[i + 1][0], w), lerp(prof[i][1], prof[i + 1][1], w))
    P.add(grid(fn, n, 2, fcol=fcol), col)


def buttons(P, phi, ys, col, r=0.01, off=0.004, mat=CLOTH):
    for y in ys:
        P.add(put(cyl(r, r, 0.007, 8).tf(RX(PI / 2)), phi, y, off + 0.0035), col, mat)


def cuffs(spec_objects, name, col, band=None, ribbed=False):
    """Манжеты рукавов на варежках: короткий рукав-обрубок с внутренней стороны варежки, к телу.
    Начало узла — центр варежки (как у перчаток); у R рукав смотрит в -X, у L — в +X."""
    for side in ('R', 'L'):
        P = Part()
        prof = [(0.086, 0.04), (0.108, 0.055), (0.113, 0.1), (0.11, 0.135), (0.09, 0.155), (0.0, 0.162)]
        g = lathe(prof, 12, fcol=lambda j, i: (band if (band is not None and j == 0) else
                                               shade(col, 0.92) if (ribbed and i % 2) else col))
        P.add(g.tf(RZ(PI / 2)))
        if side == 'L':
            P.v = [Vector((-p.x, p.y, p.z)) for p in P.v]
            P.f = [list(reversed(f)) for f in P.f]
        pos = MITTEN_POSE[side]
        P.v = [v + Vector(pos) for v in P.v]
        spec_objects.append(('u_%s_cuff_%s' % (name, side), P, pos))


# ------------------------------------------------------------ футболки

def tee(name, col, rib_col, pocket=False):
    P = Part()
    profile_band(P, rib_col, topU, RIB, nu=44, fcol=lambda i, j: shade(rib_col, 0.94) if i % 2 else rib_col)
    hem(P, shade(col, 0.95), fcol=lambda i, j: shade(col, 0.9) if j in (1, 2) else shade(col, 0.97))
    if pocket:
        phc, yc = PI + 0.42, 0.765
        P.add(patch(phc, yc, 0.13, 0.13, 0.004, 0.008, 0, 5, 4), shade(col, 1.05))
        P.add(patch(phc, yc + 0.057, 0.134, 0.016, 0.013, 0.003, 0, 5, 1), shade(col, 0.85))
        blob = [(0.026 * math.cos(a) * (1 + 0.25 * math.sin(3 * a + 1)), 0.018 * math.sin(a) * (1 + 0.2 * math.cos(2 * a))) for a in [TAU * k / 10 for k in range(10)]]
        P.add(put(slab(blob, 0.002), phc + 0.01, yc - 0.02, 0.013), 0x6a4a2c)
        P.add(put(sphere(0.008, 0.006, 0.002, 6, 4), phc - 0.07, yc - 0.035, 0.014), 0x6a4a2c)
    objs = [('u_' + name, P, (0, 0.7, 0))]
    cuffs(objs, name, col, band=rib_col)
    return objs


def u_workshirt():
    return spec(tee('workshirt', 0x8b8f5a, 0x7a7e4e, pocket=True), layers=layer('u:workshirt'))


def u_sprout():
    return spec(tee('sprout', 0xf2efe6, 0xe2ddd0), layers=layer('u:sprout'))


# ------------------------------------------------------------ куртки

def u_plaid():
    P = Part()
    edge = 0x8e2c26
    borders(P, edge)
    lapels(P, 0x9a3028)
    collar(P, edge)
    buttons(P, edge_phi(0.5, -1, 0.016), (0.4, 0.52, 0.64, 0.76), 0xe8dcc0, 0.009, 0.012)
    for s in (-1, 1):
        ph = PI + s * 0.58
        P.add(patch(ph, 0.72, 0.12, 0.042, 0.004, 0.007, 0, 4, 1), 0x7a2a22)
        buttons(P, ph, (0.71,), 0xe8dcc0, 0.007, 0.012)
    hem(P, 0x7f2822, gap=0.0)
    objs = [('u_plaid', P, (0, 0.7, 0))]
    cuffs(objs, 'plaid', 0xa8322a, band=0x7f2822)
    return spec(objs, layers=layer('u:plaid'))


def u_windbreaker():
    P = Part()
    Mt = Part()
    olive = 0x6b7a3a
    borders(P, shade(olive, 0.9), 0.026)
    for side in (-1, 1):  # зубцы молнии по краю каждого борта
        pts = [(edge_phi(UB + 0.004 + (0.86 - UB) * k / 6, side, 0.002), UB + 0.004 + (0.86 - UB) * k / 6, 0.004) for k in range(7)]
        Mt.add(strap(pts, 0, 0.007, 0.007, 6, smooth_path=False), 0xb8bec2)
    Mt.add(put(slab([(-0.008, 0), (0.008, 0), (0.006, -0.032), (-0.006, -0.032)], 0.004), edge_phi(0.55, -1, 0.003), 0.55, 0.012), 0xb8bec2)
    collar(P, shade(olive, 0.92), start=0.4, rise=0.05, stand=True)

    def hood(u, v):
        phi = -1.0 + 2.0 * u
        y0 = topU(phi) + 0.02
        depth = 0.25 * math.sin(PI * u) ** 0.5
        return onBody(phi, y0 - v * depth, 0.016 + 0.065 * math.sin(PI * v) ** 0.7 * math.sin(PI * u) ** 0.4)
    P.add(grid(hood, 12, 5, flip=True), lambda x, y, z: shade(olive, 0.9 if y > 1.15 else 1.0))
    for s in (-1, 1):  # шнурки капюшона у концов стойки
        ph = PI + s * 0.45
        y0 = topU(ph)
        P.add(tube([onBody(ph, y0 + 0.01, 0.022), onBody(ph + s * 0.02, y0 - 0.06, 0.024), onBody(ph + s * 0.01, y0 - 0.1, 0.022)], 0.0045, 4, 4), 0xe8e0c8)
        Mt.add(put(cyl(0.0065, 0.0065, 0.02, 6), ph + s * 0.01, y0 - 0.11, 0.022), 0x9aa0a4)
    # кармашек справа с секатором
    phc, yc = PI - 0.62, 0.6
    P.add(patch(phc, yc, 0.12, 0.11, 0.004, 0.008, 0, 5, 4), shade(olive, 1.08))
    F = frameAt(phc, yc + 0.035, 0.02) @ RZ(0.25)
    for s in (-1, 1):
        P.add(tube([(s * 0.012, -0.03, 0), (s * 0.016, 0.0, 0.002), (s * 0.01, 0.03, 0.002)], 0.0075, 4, 6).tf(F), 0xd2402f)
    Mt.add(slab([(-0.004, 0.03), (0.01, 0.034), (0.006, 0.075), (0.0, 0.085), (-0.008, 0.06)], 0.004).tf(F), 0xc8ced2)
    Mt.add(slab([(-0.01, 0.03), (0.004, 0.032), (0.002, 0.07), (-0.01, 0.058)], 0.004).move(0, 0, 0.005).tf(F), 0xa8aeb2)
    Mt.add(cyl(0.006, 0.006, 0.014, 8).tf(RX(PI / 2)).move(0, 0.032, 0.004).tf(F), 0x7a8084)
    hem(P, shade(olive, 0.82), gap=0.0, fcol=lambda i, j: shade(olive, 0.78) if i % 2 else shade(olive, 0.84), nu=28)
    objs = [('u_windbreaker', P, (0, 0.7, 0)), ('u_windbreaker_metal', Mt, (0, 0.7, 0))]
    cuffs(objs, 'windbreaker', olive, band=shade(olive, 0.8), ribbed=True)
    return spec(objs, layers=layer('u:windbreaker'))


def u_stargardener():
    P = Part()
    Mt = Part()
    edge = 0x2a4230
    borders(P, edge)
    lapels(P, 0x2c462f)
    collar(P, edge)
    for y in (0.4, 0.52, 0.64, 0.76):
        Mt.add(put(cyl(0.0095, 0.0095, 0.007, 8).tf(RX(PI / 2)), edge_phi(y, -1, 0.016), y, 0.0125), 0xd9a43a)
    hem(P, 0x263b29, gap=0.0)
    objs = [('u_stargardener', P, (0, 0.7, 0)), ('u_stargardener_metal', Mt, (0, 0.7, 0))]
    cuffs(objs, 'stargardener', 0x2f4a32, band=0x263b29)
    return spec(objs, layers=layer('u:stargardener'))


def u_sweater():
    P = Part()
    oat = 0xe2d1a8

    def fn(u, v):
        phi = u * TAU
        d = dphi(phi)
        h = 0.06 + 0.05 * smooth(0.5, 1.6, d)
        prof = [(-0.004, 0.004), (0.006, 0.028), (h * 0.5, 0.042), (h - 0.008, 0.03), (h, 0.008)]
        k = v * 4
        i = min(int(k), 3)
        w = k - i
        return onBody(phi, topU(phi) + lerp(prof[i][0], prof[i + 1][0], w), lerp(prof[i][1], prof[i + 1][1], w))
    P.add(grid(fn, 40, 4, closed_u=True, fcol=lambda i, j: oat if i % 2 else 0xd2bf94))
    profile_band(P, oat, lambda phi: UB, [(-0.004, 0.003), (0.004, 0.016), (0.04, 0.018), (0.05, 0.006)], nu=40,
                 fcol=lambda i, j: oat if i % 2 else 0xd2bf94)
    objs = [('u_sweater', P, (0, 0.7, 0))]
    cuffs(objs, 'sweater', oat, ribbed=True)
    return spec(objs, layers=layer('u:sweater'))


def u_treevest():
    P = Part()
    openV = lambda y: 0.05 + max(0.0, y - 0.55) * 0.42
    borders(P, 0x4a3220, 0.03, 0.01, open_fn=openV, y1=0.875)
    shapes = [(0, 0), (0.035, 0.025), (0.045, 0.07), (0.03, 0.11), (0.0, 0.14), (-0.03, 0.11), (-0.045, 0.07), (-0.035, 0.025)]
    for s in (-1, 1):
        for j, (dp, dy, spin, c) in enumerate([(-0.25, 0.0, -0.9, 0x6f8a3a), (0.05, 0.02, -0.25, 0x8a9a3a),
                                                (0.3, -0.01, 0.45, 0x5f7a32), (0.0, -0.06, 0.0, 0x9aa848)]):
            ph = s * (PI / 2 + dp)
            F = frameAt(ph, topU(ph) - 0.035 + dy, 0.018 + 0.006 * j) @ RZ(PI + spin * s)
            g = slab(shapes, 0.006, bend=1.0, center=(0, 0.07))
            P.add(g.tf(F), [shade(c, 0.85) if k % 3 == 2 else c for k in range(len(g.f))])
    for y in (0.42, 0.55, 0.68):
        ph = edge_phi(y, -1, 0.034, openV)
        F = frameAt(ph, y, 0.004)
        P.add(sphere(0.013, 0.016, 0.011, 8, 5).move(0, -0.004, 0.012).tf(F), 0xb07a3a, GLOSS)
        P.add(lathe([(0.0, 0.0), (0.0145, -0.002), (0.015, -0.009), (0.0, -0.011)], 8, flip=True).tf(RX(PI)).move(0, 0.011, 0.012).tf(F),
              lambda x, y_, z: 0x5a3a22 if hsh(round(x, 3), round(y_, 3), round(z, 3)) > 0.5 else 0x6b4a2a)
        P.add(cyl(0.002, 0.002, 0.008, 4).move(0, 0.02, 0.012).tf(F), 0x5a3a22)
    return spec([('u_treevest', P, (0, 0.7, 0))], layers=layer('u:treevest'))


def u_leafcape():
    """Мягкая сетка сзади: подкладка-пелеринка и три ряда осенних листьев внахлёст; спереди — шнурок с брошью-жёлудем."""
    P = Part()
    cols = [0xc8442a, 0xe08a2a, 0xc9a03a, 0x9a4a2a, 0xe3b23c, 0xb8562a]
    half = 1.95
    ytop = lambda phi: 1.0 + 0.12 * math.cos(phi / half * PI / 2) ** 2
    ybot = lambda phi: 0.66 + 0.12 * (1 - math.cos(phi / half * PI / 2))

    def base(u, v):
        phi = -half + 2 * half * u
        y = lerp(ytop(phi), ybot(phi), v)
        return onBody(phi, y, 0.012 + 0.03 * v)
    P.add(grid(base, 20, 4, flip=True), lambda x, y, z: 0x8a3e22 if y > 0.8 else 0x7a3420)
    leaf = [(0, 0), (0.06, 0.035), (0.082, 0.1), (0.06, 0.17), (0.0, 0.23), (-0.06, 0.17), (-0.082, 0.1), (-0.06, 0.035)]
    random.seed(11)
    rows = [(0.0, 9, 0.072), (0.36, 9, 0.06), (0.72, 8, 0.05)]  # доля высоты, листьев, отступ (верхний ряд — снаружи)
    for r, (t, n, off) in enumerate(rows):
        for k in range(n):
            phi = -half + 0.12 + (2 * half - 0.24) * (k + (0.5 if r % 2 else 0)) / (n - (0 if r % 2 else 1))
            if abs(phi) > half - 0.05:
                continue
            yy = lerp(ytop(phi), ybot(phi), t) + 0.02
            g = slab(leaf, 0.006, bend=0.7, center=(0, 0.1))
            spin = PI + (random.random() - 0.5) * 0.4
            F = frameAt(phi, yy - 0.1, off + 0.02 * t) @ RZ(spin) @ T(0, -0.1, 0)
            c = cols[(k * 3 + r * 2) % len(cols)]
            P.add(g.tf(F), [shade(c, 0.86) if (j % 3 == 2) else c for j in range(len(g.f))])
    # шнурок спереди под ртом и брошь-жёлудь
    yb = 0.875
    cord = [(half - 0.02, ytop(half) + 0.01, 0.03), (2.45, 0.95, 0.02), (PI, yb, 0.016), (TAU - 2.45, 0.95, 0.02), (TAU - half + 0.02, ytop(half) + 0.01, 0.03)]
    P.add(strap(cord, 0, 0.012, 0.007, 20), 0x7a4a2a)
    F = frameAt(PI, yb, 0.02)
    P.add(sphere(0.016, 0.02, 0.014, 8, 5).move(0, -0.012, 0.014).tf(F), 0xb07a3a, GLOSS)
    P.add(lathe([(0.0, 0.0), (0.017, -0.002), (0.019, -0.01), (0.0, -0.012)], 8, flip=True).tf(RX(PI)).move(0, 0.006, 0.014).tf(F), 0x6b4a2a)
    return spec([('u_leafcape', P, (0, 1.05, 0))])


TABLE = {
    'workshirt': u_workshirt, 'sprout': u_sprout, 'plaid': u_plaid, 'windbreaker': u_windbreaker, 'leafcape': u_leafcape,
    'stargardener': u_stargardener, 'sweater': u_sweater, 'treevest': u_treevest,
}

if __name__ == '__main__':
    run('u', TABLE, cli_names(TABLE), os.path.abspath(__file__))
