# TIREDWOOD, фермерская косметика, слот h (голова): 9 шапок. Координаты игры (см. cos_lib.py), макушка y = 1.58.
# Blender -b --factory-startup --python art/farm/scripts/cos_h.py -- [farmcap straw ...]
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cos_stage import *  # noqa

CLOTH, GLOSS, METAL = 0, 1, 2
SEG = 30


def hsh(x, y, z, k=0):
    return (math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.3) * 43758.5453) % 1.0


def shade(c, k):
    r, g, b = (c >> 16) & 255, (c >> 8) & 255, c & 255
    f = lambda v: max(0, min(255, int(v * k)))
    return (f(r) << 16) | (f(g) << 8) | f(b)


def coil(c1, c2, row0=0):
    """Соломенная тесьма витками: ряды через один, сектора чуть светлее/темнее."""
    return lambda j, i: shade(c1 if (j + row0) % 2 else c2, 0.94 if i % 2 else 1.0)


def spec(objects, **kw):
    d = dict(objects=objects)
    d.update(kw)
    return d


# ------------------------------------------------------------ соломенные шляпы (простая и золотая)

def straw_body(P, c1, c2, rim, seg=SEG, brim_rows=6, crown_rows=7, y0=1.335):
    """Тулья и широкие поля из тесьмы витками, с лёгкой волной по краю."""
    crown = [(0.392, y0), (0.389, y0 + 0.08), (0.379, y0 + 0.16), (0.357, y0 + 0.235), (0.318, y0 + 0.292),
             (0.235, y0 + 0.33), (0.12, y0 + 0.345), (0.0, y0 + 0.348)]
    if crown_rows < 7:
        crown = crown[:2] + crown[3:]
    P.add(lathe(crown, seg, fcol=coil(c1, c2)))
    R1 = 0.68
    ytop = lambda r: y0 - 0.002 - 0.055 * ((r - 0.4) / (R1 - 0.4)) ** 1.5
    top = [(0.4 + (R1 - 0.4) * (1 - k / brim_rows), 0) for k in range(brim_rows + 1)]
    loop = [(r, ytop(r)) for r, _ in top]
    loop += [(0.4, y0 - 0.02), (0.55, ytop(0.55) - 0.018), (R1, ytop(R1) - 0.016), (R1 + 0.011, ytop(R1) - 0.006), loop[0]]
    nrow = len(loop) - 1

    def bc(j, i):
        if j == 0 or j >= nrow - 2:
            return rim
        if j > brim_rows:
            return shade(c2, 0.85)
        return coil(c1, c2)(j, i)
    brim = weld(lathe(loop, seg, fcol=bc))
    brim.warp(lambda p: (p.x, p.y + 0.014 * ((math.hypot(p.x, p.z) - 0.4) / (R1 - 0.4)) ** 2 * math.sin(3 * phiOf(p.x, p.z) + 0.6), p.z))
    P.add(brim)
    return y0


def h_straw():
    P = Part()
    y0 = straw_body(P, 0xeccb72, 0xd6aa4e, 0xbf9142)
    red, red_d = 0xc8402f, 0xa8332a
    rib = [(0.389, y0 + 0.004), (0.398, y0 + 0.01), (0.396, y0 + 0.068), (0.387, y0 + 0.074)]
    P.add(lathe(rib, SEG), red)
    # бант на правом боку: две петли, узел, два хвостика
    side = PI / 2 + 0.3
    M = T(0.4 * math.sin(side), y0 + 0.04, 0.4 * math.cos(side)) @ RY(side)
    for s in (-1, 1):
        P.add(sphere(0.05, 0.03, 0.013, 6, 4).tf(RZ(s * 0.25)).move(s * 0.046, 0.004, 0.013).tf(M), red)
        P.add(slab([(-0.015, 0), (0.015, 0), (0.013, -0.085), (0.0, -0.074), (-0.013, -0.085)], 0.006)
              .tf(RZ(s * 0.3)).move(s * 0.012, -0.01, 0.017).tf(M), red_d)
    P.add(sphere(0.02, 0.024, 0.015, 6, 4).move(0, 0, 0.022).tf(M), red_d)
    # две соломинки торчат из-под ленты спереди-справа
    for k, (a, lean, ln) in enumerate([(side + 0.45, 0.42, 0.17), (side + 0.6, 0.75, 0.13)]):
        p0 = Vector((0.397 * math.sin(a), y0 + 0.045, 0.397 * math.cos(a)))
        out = Vector((math.sin(a), 0, math.cos(a)))
        p1 = p0 + (Vector((0, 1, 0)) * math.cos(lean) + out * math.sin(lean)) * ln
        P.add(tube([p0 - out * 0.012, (p0 + p1) / 2, p1], 0.0065, 3, 5), 0xf4dc8c if k else 0xe6c56c)
    return spec([('h_straw', P, (0, 1.42, 0))])


def h_goldstraw():
    P = Part()
    Mt = Part()
    seg = 26
    y0 = straw_body(P, 0xefb43c, 0xcc8c20, 0xa8741c, seg=seg, brim_rows=4, crown_rows=6)
    rib = [(0.389, y0 + 0.006), (0.396, y0 + 0.012), (0.394, y0 + 0.072), (0.386, y0 + 0.078)]
    P.add(lathe(rib, seg), 0xb5781e)
    # лента из колосьев: колоски внахлёст по ленте спереди и по бокам (золото)
    gold = 0xd9a93a
    for k in range(5):
        a = PI - 1.55 + k * 0.78
        M = T(0.404 * math.sin(a), y0 + 0.042, 0.404 * math.cos(a)) @ RY(a) @ RZ(-PI / 2 + 0.1) @ T(0, -0.05, 0)
        for g in range(3):
            for s in (-1, 1):
                Mt.add(sphere(0.0125, 0.024, 0.0095, 4, 3).tf(RZ(-s * 0.4)).move(s * 0.0105, g * 0.028, 0.008).tf(M), gold)
        Mt.add(sphere(0.011, 0.024, 0.009, 4, 3).move(0, 0.088, 0.008).tf(M), gold)
    return spec([('h_goldstraw', P, (0, 1.42, 0)), ('h_goldstraw_metal', Mt, (0, 1.42, 0))])


# ------------------------------------------------------------ шляпа-подсолнух

def sunflower(P, M, r=1.0):
    petal = [(0, 0), (0.016, 0.022), (0.014, 0.05), (0.0, 0.068), (-0.014, 0.05), (-0.016, 0.022)]
    for k in range(13):
        a = k * TAU / 13
        P.add(slab(petal, 0.005, bend=4.0, center=(0, 0.03)).move(0, 0.03, 0).tf(RX(0.18)).tf(RZ(a)).tf(S(r)).tf(M),
              0xf3b62a if k % 2 else 0xe9a51f)

    def seeds(x, y, z):
        return 0x4a2c16 if hsh(x, y, z) > 0.5 else 0x6b4220
    P.add(sphere(0.045, 0.045, 0.018, 10, 5).move(0, 0, 0.012).tf(S(r)).tf(M), seeds)


def h_sunhat():
    P = Part()
    y0 = 1.36
    ochre, ochre_d, ochre_l = 0xcf9a3e, 0xb9842f, 0xdcab52
    crown = [(0.392, y0), (0.392, y0 + 0.06), (0.382, y0 + 0.13), (0.352, y0 + 0.2), (0.29, y0 + 0.248),
             (0.17, y0 + 0.27), (0.0, y0 + 0.275)]
    P.add(lathe(crown, SEG, fcol=lambda j, i: ochre_l if j == 1 else ochre))
    top = [(0.62, y0 - 0.095), (0.555, y0 - 0.06), (0.49, y0 - 0.03), (0.44, y0 - 0.012), (0.398, y0)]
    loop = top + [(0.398, y0 - 0.016), (0.47, y0 - 0.04), (0.555, y0 - 0.077), (0.62, y0 - 0.112), (0.632, y0 - 0.104), top[0]]
    brim = weld(lathe(loop, SEG, fcol=lambda j, i: ochre_d if j in (0, 2, 8, 9) else ochre))
    brim.warp(lambda p: (p.x, p.y + 0.012 * ((math.hypot(p.x, p.z) - 0.4) / 0.22) ** 2 * math.sin(2 * phiOf(p.x, p.z) + 1.0), p.z))
    P.add(brim)
    # крупный подсолнух сбоку (правый бок, ближе к лицу) и два листа за ним
    a = PI / 2 + 0.5
    M = T(0.385 * math.sin(a), y0 + 0.095, 0.385 * math.cos(a)) @ RY(a) @ RX(-0.15) @ T(0, 0, 0.035)
    leaf = [(0, 0), (0.02, 0.03), (0.018, 0.06), (0, 0.085), (-0.018, 0.06), (-0.02, 0.03)]
    for s in (-1, 1):
        P.add(slab(leaf, 0.005, bend=3.0, center=(0, 0.04)).tf(S(1.6)).tf(RZ(PI + s * 0.95)).move(0, 0, -0.016).tf(M), 0x5f8f34)
    sunflower(P, M, 1.85)
    return spec([('h_sunhat', P, (0, 1.42, 0))])


# ------------------------------------------------------------ венец из листьев

def oak(L=0.2):
    out = []
    n = 8
    for k in range(n + 1):
        t = k / n
        w = 0.054 * math.sin(PI * t) ** 0.7 * (1 + 0.3 * math.cos(t * 4 * PI)) + 0.003
        out.append((w, L * t))
    left = [(-x, y) for (x, y) in reversed(out[1:-1])]
    return out + left


def maple(R=0.095):
    lobes = [PI / 2, PI / 2 - 0.85, PI / 2 + 0.85, PI / 2 - 1.75, PI / 2 + 1.75]
    pts = []
    n = 20
    for k in range(n):
        a = -PI / 2 + TAU * k / n
        m = max(max(0.0, math.cos(a - lb)) ** 10 * (1.0 if j < 3 else 0.7) for j, lb in enumerate(lobes))
        r = R * (0.42 + 0.58 * m)
        if abs(a + PI / 2) < 0.2:
            r = R * 0.18
        pts.append((r * math.cos(a), r * math.sin(a) + R * 0.75))
    return pts


def h_leafcrown():
    P = Part()
    yR = 1.4
    R = bodyR(yR) + 0.034
    twig = [(R * math.sin(TAU * k / 28), yR + 0.008 * math.sin(5 * TAU * k / 28), R * math.cos(TAU * k / 28)) for k in range(28)]
    P.add(tube(twig, 0.013, 28, 4, closed=True, smooth_path=False), 0x7a5232)
    cols_oak = [0x9c9a38, 0xb98a2c, 0x8a8f34]
    cols_maple = [0xd2552a, 0xe39a2c, 0xc8442a]
    random.seed(7)
    n = 10
    for k in range(n):
        a = TAU * k / n + 0.15
        isoak = k % 2 == 0
        shape = oak() if isoak else maple()
        col = cols_oak[(k // 2) % 3] if isoak else cols_maple[(k // 2) % 3]
        g = slab(shape, 0.007, bend=1.6, center=(0, 0.08 if isoak else 0.071))
        g.warp(lambda p: (p.x, p.y, p.z + 0.7 * p.y * p.y))  # кончик отгибается наружу
        tilt = 0.4 + 0.12 * random.random()
        spin = (random.random() - 0.5) * 0.6
        M = T(R * math.sin(a), yR - 0.015, R * math.cos(a)) @ RY(a) @ RX(tilt) @ RZ(spin)
        P.add(g.tf(M), col)
    # гроздья ягод между листьями (спереди и по бокам)
    for a in (PI - 0.3, PI + 0.95, PI - 1.25, 0.4):
        M = T(R * math.sin(a), yR + 0.01, R * math.cos(a)) @ RY(a)
        for j, (dx, dy) in enumerate([(-0.021, 0.0), (0.021, 0.005), (0.0, 0.03)]):
            P.add(sphere(0.02, seg=6, rings=4).move(dx, dy, 0.03).tf(M), 0xc0283a if j != 2 else 0xd8423a, GLOSS)
    return spec([('h_leafcrown', P, (0, 1.4, 0))])


# ------------------------------------------------------------ панама «Исследователь»

def h_explorer():
    P = Part()
    Mt = Part()
    seg = 28
    y0 = 1.355
    beige, beige_d = 0xd9c69a, 0xc4af82
    crown = [(0.388, y0), (0.388, y0 + 0.09), (0.374, y0 + 0.17), (0.346, y0 + 0.232), (0.29, y0 + 0.27), (0.0, y0 + 0.29)]
    P.add(lathe(crown, seg), beige)
    top = [(0.625, y0 - 0.058), (0.52, y0 - 0.026), (0.44, y0 - 0.008), (0.392, y0)]
    loop = top + [(0.392, y0 - 0.016), (0.5, y0 - 0.04), (0.625, y0 - 0.074), (0.633, y0 - 0.066), top[0]]
    P.add(weld(lathe(loop, seg, fcol=lambda j, i: beige_d if j in (0, 6, 7) else beige)))
    band = [(0.385, y0 + 0.07), (0.392, y0 + 0.075), (0.392, y0 + 0.118), (0.384, y0 + 0.123)]
    P.add(lathe(band, seg), 0x6b7444)
    # свёрнутая сетка от комаров лежит на полях вокруг тульи
    yr = y0 + 0.012
    P.add(ring(0.433, 0.036, yr + 0.018, seg, 6),
          lambda x, y, z: 0x5a5d47 if (int(phiOf(x, z) / (TAU / seg)) + int((y - yr) / 0.016 + 10)) % 2 else 0x8d8e72)
    # лупа-значок на ленте спереди справа
    a = PI - 0.4
    M = T(0.396 * math.sin(a), y0 + 0.1, 0.396 * math.cos(a)) @ RY(a) @ S(1.6)
    Mt.add(ring(0.028, 0.006, 0, 14, 4).tf(RX(PI / 2)).move(0, 0, 0.008).tf(M), 0xc99a46)
    P.add(cyl(0.025, 0.025, 0.005, 12).tf(RX(PI / 2)).move(0, 0, 0.008).tf(M), 0xcfe6ea, GLOSS)
    Mt.add(cyl(0.006, 0.006, 0.04, 6).move(0, -0.05, 0.008).tf(RZ(0.6)).tf(M), 0x8a5a32)
    return spec([('h_explorer', P, (0, 1.45, 0)), ('h_explorer_metal', Mt, (0, 1.45, 0))])


# ------------------------------------------------------------ колпак «Ночной дозор»

def h_nightcap():
    P = Part()
    blue, cream = 0x4d64a8, 0xf0e6cf
    yF, yB = 1.315, 1.255
    P.add(domeCap(0.03, yF, yB, 24, 8), lambda x, y, z: blue if int((y - 1.2) / 0.075) % 2 else cream)
    P.add(cuff(capEdgeY(yF, yB), 0.03, 0.07, 32, 0.022, fcol=lambda i, j: cream if i % 2 else 0xe2d5b8))
    # хвост колпака: вверх, перегиб и вниз на правый бок за спину; полосы по длине
    path = [(0, 1.53, 0.0), (0.015, 1.64, 0.02), (0.07, 1.74, 0.06), (0.17, 1.775, 0.11),
            (0.27, 1.72, 0.16), (0.32, 1.62, 0.19), (0.33, 1.53, 0.2)]
    seg, sides = 16, 10
    tail = tube(path, lambda t: 0.215 * (1 - t) ** 1.3 + 0.017, seg, sides, caps='end')
    cols = [(blue if (i // 2) % 2 else cream) for i in range(seg) for _ in range(sides)]
    cols += [blue] * (len(tail.f) - len(cols))
    P.add(tail, cols)
    # помпон-месяц на кончике
    tip = Vector(path[-1])
    arc = []
    for k in range(10):
        a = 0.6 + k / 9 * (TAU - 1.2)
        arc.append((0.06 * math.cos(a), 0.06 * math.sin(a), 0))
    moon = tube(arc, lambda t: 0.007 + 0.027 * math.sin(PI * t) ** 0.8, 12, 8)
    P.add(moon.tf(RZ(-PI / 2 - 0.4)).tf(RY(PI / 2)).move(tip.x + 0.012, tip.y - 0.07, tip.z), 0xf4d985, GLOSS)
    return spec([('h_nightcap', P, (0, 1.45, 0))])


# ------------------------------------------------------------ шляпа «Старый садовник»

def h_oldgardener():
    P = Part()
    Mt = Part()
    seg = 28
    y0 = 1.372
    felt, felt_l, felt_d = 0x6f6248, 0x7b6d50, 0x645840

    def worn(x, y, z):
        h = hsh(round(x, 2), round(y, 2), round(z, 2))
        return felt_l if h > 0.88 else felt_d if h < 0.08 else felt
    crown = [(0.372, y0), (0.372, y0 + 0.07), (0.362, y0 + 0.145), (0.34, y0 + 0.2), (0.29, y0 + 0.24),
             (0.17, y0 + 0.262), (0.0, y0 + 0.268)]
    cg = lathe(crown, seg)

    def pinch(p):
        x, y, z = p.x, p.y, p.z
        k = smooth(y0 + 0.12, y0 + 0.26, y)
        y -= 0.075 * math.exp(-(x / 0.11) ** 2) * k * (0.6 + 0.4 * smooth(-0.3, 0.2, -z))
        if z < 0:  # передние защипы
            x *= 1 - 0.2 * smooth(y0 + 0.08, y0 + 0.24, p.y) * smooth(0.0, 0.3, -z)
        return (x * 0.97, y, z * 1.04)
    cg.warp(pinch)
    P.add(cg, worn)
    top = [(0.585, y0 - 0.016), (0.5, y0 - 0.008), (0.42, y0 - 0.003), (0.375, y0)]
    loop = top + [(0.375, y0 - 0.016), (0.48, y0 - 0.022), (0.585, y0 - 0.032), (0.594, y0 - 0.024), top[0]]
    bg = weld(lathe(loop, seg))

    def brimw(p):
        r = math.hypot(p.x, p.z)
        phi = phiOf(p.x, p.z)
        k = smooth(0.4, 0.59, r)
        dy = 0.035 * math.cos(phi) * k + 0.03 * math.sin(phi) ** 2 * k * k  # спереди вниз, сзади и с боков вверх
        return (p.x * 0.97, p.y + dy, p.z * 1.04)
    bg.warp(brimw)
    P.add(bg, lambda x, y, z: 0x5f533c if math.hypot(x / 0.97, z / 1.04) > 0.58 else worn(x, y, z))
    band = [(0.37, y0 + 0.003), (0.377, y0 + 0.008), (0.375, y0 + 0.06), (0.367, y0 + 0.064)]
    bd = lathe(band, seg)
    bd.warp(lambda p: (p.x * 0.97, p.y, p.z * 1.04))
    P.add(bd, 0x3f3426)
    # пёрышко за лентой слева, чуть сзади
    a = -1.25
    M = T(0.372 * 0.97 * math.sin(a), y0 + 0.03, 0.372 * 1.04 * math.cos(a)) @ RY(a) @ RZ(0.45) @ RX(0.18)
    fe = []
    for k in range(9):
        t = k / 8
        fe.append((0.026 * math.sin(PI * t) ** 0.6 + 0.001, 0.27 * t))
    fe += [(-x * 0.8, y) for (x, y) in reversed(fe[1:-1])]
    feather = slab(fe, 0.004, bend=1.0, center=(0, 0.135))
    fcols = []
    for k in range(len(feather.f)):
        q = feather.f[k]
        yy = sum(feather.v[i].y for i in q) / len(q)
        fcols.append(0xe9dcc0 if int(yy / 0.034) % 2 else 0xa2703c)
    P.add(feather.move(0, 0, 0.012).tf(M), fcols)
    P.add(tube([(0, -0.02, 0.012), (0, 0.13, 0.015), (0, 0.27, 0.012)], 0.0028, 3, 4).tf(M), 0x5a4030)
    # карандаш за лентой справа спереди
    a = PI / 2 + 0.55
    M = T(0.375 * 0.97 * math.sin(a), y0 + 0.034, 0.375 * 1.04 * math.cos(a)) @ RY(a) @ RZ(-1.15) @ T(0, 0, 0.014) @ S(1.25)
    P.add(cyl(0.008, 0.008, 0.11, 6, top=False, bot=False).tf(M), 0xe9b23a)
    P.add(cyl(0.0, 0.008, 0.022, 6, bot=False).move(0, 0.066, 0).tf(M), 0xe8c9a0)
    P.add(cyl(0.0, 0.0028, 0.0078, 6, bot=False).move(0, 0.0735, 0).tf(M), 0x333333)
    P.add(cyl(0.008, 0.008, 0.016, 6).move(0, -0.063, 0).tf(M), 0xe48d9c)
    Mt.add(cyl(0.0086, 0.0086, 0.012, 6, top=False, bot=False).move(0, -0.053, 0).tf(M), 0xbfc4c8)
    return spec([('h_oldgardener', P, (0, 1.48, 0)), ('h_oldgardener_metal', Mt, (0, 1.48, 0))])


# ------------------------------------------------------------ шапка со свиными ушами

def h_pigears():
    P = Part()
    pink, pink_d, inner = 0xf2a2b4, 0xe58fa3, 0xfbd3da
    yF, yB = 1.315, 1.245
    P.add(domeCap(0.035, yF, yB, 26, 9, fcol=lambda i, j: pink if i % 2 else 0xeb98ab))
    P.add(cuff(capEdgeY(yF, yB), 0.035, 0.075, 32, 0.022, fcol=lambda i, j: pink_d if i % 2 else 0xf0a0b2))
    # ушки-лопушки: вверх-наружу, кончик падает вперёд и вниз; внутри светлее
    ear = [(0, 0), (0.065, 0.012), (0.08, 0.065), (0.052, 0.13), (0.0, 0.175), (-0.052, 0.13), (-0.08, 0.065), (-0.065, 0.012)]
    for s in (-1, 1):
        g = slab(ear, 0.016, bend=2.0, center=(0, 0.06))
        cols = [inner if (k % 3 == 0) else 0xe98ea4 for k in range(len(g.f))]
        g.warp(lambda p: (p.x, p.y - 3.0 * max(0, p.y - 0.04) ** 2, p.z + 3.2 * max(0, p.y - 0.04) ** 2))
        B = onBody(PI + s * 1.15, 1.47, 0.03)
        M = T(B.x, B.y, B.z) @ RY(PI + s * 0.4) @ RZ(-s * 1.0) @ RX(0.05)
        P.add(g.tf(M), cols)
    # пятачок на лбу
    sn = cyl(0.085, 0.085, 0.05, 16).tf(S(1, 1, 0.72)).tf(RX(PI / 2))
    put(sn, PI, 1.425, 0.035 + 0.022)
    P.add(sn, 0xf08aa0)
    for s in (-1, 1):
        P.add(put(sphere(0.014, 0.022, 0.008, 6, 4).move(s * 0.03, 0, 0), PI, 1.425, 0.035 + 0.022 + 0.05), 0x9e4a62)
    return spec([('h_pigears', P, (0, 1.42, 0))])


# ------------------------------------------------------------ кепка фермера

def h_farmcap():
    P = Part()
    green, mesh_d, mesh_l = 0x4f8f3e, 0x41713a, 0x5f8f4c
    yF, yB = 1.345, 1.28
    t = 0.028
    a0 = 1.05
    P.add(domeCap(t, yF, yB, 10, 8, PI - a0, PI + a0), green)
    P.add(domeCap(t, yF, yB, 22, 9, PI + a0, PI - a0 + TAU, fcol=lambda i, j: mesh_d if (i + j) % 2 else mesh_l))

    def bill(u, v):
        s = u * 2 - 1
        phi = PI - s * 1.02
        A = onBody(phi, yF - 0.004, t + 0.002)
        rt = 0.4 + 0.205 * math.cos(s * PI / 2) ** 0.75
        Tt = Vector((rt * math.sin(phi), yF - 0.045 + 0.02 * s * s, rt * math.cos(phi)))
        p = A.lerp(Tt, v)
        p.y -= 0.03 * v * v * (1 - 0.85 * s * s)
        return p
    P.add(thick_grid(bill, 10, 3, 0.016, flip=False, top=0x4a8738, bottom=0x2f5a26, side=0x3f7330))
    P.add(sphere(0.03, 0.017, 0.03, 10, 5).move(0, H + t + 0.006, 0), green)
    # вышитый росток спереди: стебелёк, два листика, комочек земли
    M = frameAt(PI, 1.475, t + 0.004) @ S(1.9)
    P.add(tube([(0, -0.035, 0), (0.002, -0.01, 0.002), (-0.002, 0.012, 0.002)], 0.0045, 3, 4).tf(M), 0xd8f0a6)
    lf = [(0, 0), (0.016, 0.006), (0.024, 0.018), (0.018, 0.03), (0.004, 0.026), (-0.004, 0.012)]
    for s in (-1, 1):
        g = slab([(s * x, y) for (x, y) in (lf if s > 0 else list(reversed(lf)))], 0.003, center=(s * 0.012, 0.016))
        P.add(g.tf(RZ(s * 0.2)).move(s * 0.002, 0.004, 0.003).tf(M), 0xc6ea86)
    P.add(sphere(0.024, 0.007, 0.004, 8, 4).move(0, -0.04, 0.002).tf(M), 0x9a6a3c)
    P.add(patch(0, 1.3, 0.13, 0.028, t + 0.004, 0.006, 0, 4, 1), 0x2c2f2a)
    return spec([('h_farmcap', P, (0, 1.45, 0))])


TABLE = {
    'farmcap': h_farmcap, 'straw': h_straw, 'sunhat': h_sunhat, 'goldstraw': h_goldstraw, 'leafcrown': h_leafcrown,
    'explorer': h_explorer, 'nightcap': h_nightcap, 'oldgardener': h_oldgardener, 'pigears': h_pigears,
}

if __name__ == '__main__':
    run('h', TABLE, cli_names(TABLE), os.path.abspath(__file__))
