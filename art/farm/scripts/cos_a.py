# TIREDWOOD, фермерская косметика, слот a (аксессуар): 6 вещей. Координаты игры (см. cos_lib.py).
# Blender -b --factory-startup --python art/farm/scripts/cos_a.py -- [greengloves apron ...]
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cos_stage import *  # noqa
from cos_h import hsh, shade, coil, spec, sunflower  # noqa

CLOTH, GLOSS, METAL = 0, 1, 2
# варежки в превью (в игре их ставит сцена): чуть в стороны и вперёд
HOLD = {'L': (-0.46, 0.72, -0.36), 'R': (0.46, 0.72, -0.36)}
# перчатки: варежки перед животом, как в смехе (avatar.ts ACT_LAUGH: +-0.27, 0.66, -0.45), чуть шире
FRONT_HANDS = {'L': (-0.33, 0.68, -0.5), 'R': (0.33, 0.68, -0.5)}


# ------------------------------------------------------------ перчатки «Зелёные пальцы»

def glove(side):
    """Перчатка на варежку (сфера 0.1 x 0.092 x 0.088): начало — центр варежки, манжета смотрит к телу."""
    P = Part()
    green, cuffc, band = 0x5aa046, 0x3f7a35, 0xd8e6b0

    def dirt(x, y, z):
        h = hsh(round(x, 3), round(y, 3), round(z, 3), 3)
        return 0x7d5a38 if h > 0.93 or (h > 0.84 and y < -0.04) else green
    P.add(sphere(0.113, 0.104, 0.1, 14, 10), dirt)
    P.add(sphere(0.036, 0.05, 0.036, 8, 6).tf(RZ(-0.5)).move(-0.005, 0.07, -0.062), green)
    cuff = lathe([(0.083, -0.012), (0.098, 0.0), (0.104, 0.026), (0.1, 0.044), (0.088, 0.05)], 16,
                 fcol=lambda j, i: band if j == 2 else cuffc)
    P.add(cuff.tf(RZ(PI / 2)).move(-0.075, 0, 0), None)
    if side == 'L':
        P = mirror_x(P)
    return P


def mirror_x(P):
    Q = Part()
    Q.v = [Vector((-p.x, p.y, p.z)) for p in P.v]
    Q.f = [list(reversed(f)) for f in P.f]
    Q.c, Q.m = list(P.c), list(P.m)
    return Q


def at(P, p):
    P.v = [v + Vector(p) for v in P.v]
    return P


def a_greengloves():
    H2 = MITTEN_POSE
    return spec([('a_greengloves_R', at(glove('R'), H2['R']), H2['R']), ('a_greengloves_L', at(glove('L'), H2['L']), H2['L'])],
                on_mitten=True, views=(FRONT, (-0.62, 1.0, 0.36)))


# ------------------------------------------------------------ фартук «Торгаш»

def a_apron():
    P = Part()
    canvas, hem, pocket = 0xdccca6, 0xb59e74, 0xcfbb90
    p0, p1, y0 = PI - 0.95, PI + 0.95, 0.2
    top = lambda phi: 0.5 + 0.36 * smooth(0.62, 0.38, abs(phi - PI))
    off = lambda t: 0.034 + 0.014 * (1 - t)
    P.add(panel(p0, p1, y0, top, off, 18, 6, fcol=lambda i, j: shade(canvas, (0.96 if i % 3 == 0 else 1.0) * (1.03 if j > 3 else 1.0))))
    # подгибка по краю
    edge = []
    for k in range(11):
        edge.append((p0 + (p1 - p0) * k / 10, y0 + 0.004, off(0) + 0.002))
    for k in range(1, 5):
        edge.append((p1, y0 + (top(p1) - y0) * k / 4, off(k / 4) + 0.002))
    for k in range(1, 15):
        ph = p1 + (p0 - p1) * k / 14
        edge.append((ph, top(ph) - 0.004, off(1) + 0.002))
    for k in range(1, 4):
        edge.append((p0, top(p0) + (y0 - top(p0)) * k / 4, off(1 - k / 4) + 0.002))
    P.add(strap(edge, 0, 0.022, 0.008, closed=True, smooth_path=False), hem)
    # лямка через «шею» и завязки на спине с бантом
    neck = [(PI - 0.36, 0.85), (PI - 0.75, 0.93), (PI / 2, 0.99), (0.6, 1.02), (0.0, 1.03), (-0.6, 1.02),
            (-PI / 2, 0.99), (-PI + 0.75, 0.93), (-PI + 0.36, 0.85)]
    P.add(strap(neck, 0.03, 0.03, 0.008, 22), hem)
    for s in (-1, 1):
        tie = [(PI + s * 0.94, 0.5), (PI + s * 1.5, 0.51), (PI + s * 2.3, 0.52), (s * 0.07 + (0 if s < 0 else 0), 0.53)]
        if s > 0:
            tie = [(a - TAU if a > PI else a, y) for (a, y) in tie]
        P.add(strap(tie, 0.03, 0.026, 0.007, 14), hem)
    M = frameAt(0, 0.53, 0.04)
    for s in (-1, 1):
        P.add(sphere(0.055, 0.03, 0.014, 6, 4).tf(RZ(s * 0.3)).move(s * 0.05, 0.01, 0.0).tf(M), hem)
        P.add(slab([(-0.013, 0), (0.013, 0), (0.012, -0.11), (0, -0.1), (-0.012, -0.11)], 0.006).tf(RZ(s * 0.25)).move(s * 0.012, -0.012, 0.004).tf(M), hem)
    P.add(sphere(0.02, 0.02, 0.016, 6, 4).move(0, 0, 0.01).tf(M), shade(hem, 0.9))
    # два больших кармана (одна накладка со строчкой посередине)
    P.add(patch(PI, 0.37, 0.56, 0.17, off(0.3) + 0.004, 0.012, 0, 8, 3), pocket)
    P.add(strap([(PI, 0.29, off(0.3) + 0.018), (PI, 0.45, off(0.3) + 0.018)], 0, 0.006, 0.003, 4), hem)
    P.add(strap([(PI - 0.58, 0.448, off(0.3) + 0.018), (PI + 0.58, 0.448, off(0.3) + 0.018)], 0, 0.012, 0.004, 10), hem)
    # морковка из правого кармана
    M = frameAt(PI - 0.32, 0.47, off(0.3) + 0.03) @ RZ(0.15)
    P.add(cyl(0.032, 0.0, 0.16, 8, top=True, bot=False).move(0, 0.0, 0).tf(M), 0xee7d22)
    for k, a in enumerate((-0.45, 0.0, 0.45)):
        P.add(slab([(-0.008, 0), (0.008, 0), (0.012, 0.05), (0.0, 0.085), (-0.012, 0.05)], 0.005).tf(RZ(a)).move(0, 0.078, 0).tf(M),
              0x5f9a34 if k != 1 else 0x4c8a2c)
    return spec([('a_apron', P, (0, 0.6, 0))])


# ------------------------------------------------------------ будильник «Тик-так»

def a_alarm():
    P = Part()
    Mt = Part()
    copper, copper_d = 0xc8763c, 0xa65f2e
    ystrap = lambda phi: 0.8 + 0.25 * math.cos(phi + PI / 2)  # выше всего на левом плече (phi = -pi/2)
    loop = [(TAU * k / 40, ystrap(TAU * k / 40)) for k in range(40)]
    P.add(strap(loop, 0.03, 0.036, 0.008, closed=True, smooth_path=False), 0x7a4a2a)
    phc = PI - 0.62
    yc = ystrap(phc) - 0.14
    F = frameAt(phc, yc, 0.035) @ S(1.25)
    # корпус, ободок, циферблат, звонки, молоточек, ножки, ушко
    Mt.add(cyl(0.085, 0.085, 0.045, 20).tf(RX(PI / 2)).move(0, 0, 0.0225).tf(F), copper)
    Mt.add(ring(0.083, 0.009, 0, 20, 4).tf(RX(PI / 2)).move(0, 0, 0.047).tf(F), copper_d)
    P.add(cyl(0.077, 0.077, 0.004, 20, bot=False).tf(RX(PI / 2)).move(0, 0, 0.046).tf(F), 0xf6eed8, GLOSS)
    for k in range(12):
        a = TAU * k / 12
        ln = 0.014 if k % 3 == 0 else 0.007
        P.add(slab([(-0.003, 0), (0.003, 0), (0.003, ln), (-0.003, ln)], 0.002).move(0, 0.062 - ln, 0.049).tf(RZ(a)).tf(F), 0x3a2a20)
    for s in (-1, 1):
        Mt.add(lathe([(0.0, 0.0), (0.03, 0.0), (0.042, -0.012), (0.044, -0.022)], 12, flip=True).move(0, 0.022, 0)
               .tf(RZ(-s * 0.55)).move(s * 0.05, 0.085, 0.022).tf(F), copper)
        Mt.add(sphere(0.012, seg=6, rings=4).move(s * 0.055, -0.086, 0.02).tf(F), copper_d)
    Mt.add(cyl(0.004, 0.004, 0.05, 6).move(0, 0.112, 0.022).tf(F), copper_d)
    Mt.add(sphere(0.009, seg=6, rings=4).move(0, 0.138, 0.022).tf(F), copper_d)
    Mt.add(ring(0.016, 0.004, 0, 10, 4).tf(RX(PI / 2)).move(0, 0.1, 0.008).tf(F), copper_d)
    # стрелки — отдельные узлы с центром в оси циферблата (крутятся вокруг своей +Z)
    hour = Part()
    hour.add(slab([(-0.006, -0.008), (0.006, -0.008), (0.004, 0.036), (0, 0.044), (-0.004, 0.036)], 0.003), 0x2a2420)
    mn = Part()
    mn.add(slab([(-0.004, -0.01), (0.004, -0.01), (0.003, 0.058), (0, 0.066), (-0.003, 0.058)], 0.003), 0x2a2420)
    mn.add(cyl(0.008, 0.008, 0.005, 8).tf(RX(PI / 2)), 0x2a2420)
    Fh = F @ T(0, 0, 0.051)
    Fm = F @ T(0, 0, 0.055)
    hour_f = Fh @ RZ(-TAU * 10 / 12)
    min_f = Fm @ RZ(-TAU * 2 / 12)
    return spec([('a_alarm', P, (0, 0.6, 0)), ('a_alarm_metal', Mt, (0, 0.6, 0))],
                locals=[('a_alarm_hour', hour, hour_f, 'a_alarm'), ('a_alarm_min', mn, min_f, 'a_alarm')],
                note={'clock_center': tuple(round(c, 4) for c in F.translation), 'phi': phc, 'y': yc})


# ------------------------------------------------------------ корзинка гостинцев

def a_basket():
    """Начало — центр правой варежки; корзинка висит под ней, чуть наружу (+X) и вперёд."""
    P = Part()
    ox, oz = 0.06, -0.035
    wick1, wick2 = 0xc9954e, 0xa9763a
    prof = [(0.0, -0.31), (0.095, -0.31), (0.122, -0.29), (0.135, -0.24), (0.142, -0.2), (0.146, -0.165)]
    P.add(lathe(prof, 20, fcol=lambda j, i: shade(wick1 if (j + i) % 2 else wick2, 1.0 if j else 0.85)).move(ox, 0, oz))
    P.add(ring(0.147, 0.011, -0.163, 20, 4).move(ox, 0, oz), shade(wick2, 0.9))
    handle = [(ox - 0.135, -0.16, oz), (ox - 0.11, -0.02, oz), (ox - 0.04, 0.066, oz), (ox + 0.04, 0.066, oz), (ox + 0.11, -0.02, oz), (ox + 0.135, -0.16, oz)]
    P.add(tube(handle, 0.012, 14, 5), wick2)
    # клетчатая салфетка на задней половине, под ней бугор пирожка
    def nap(u, v):
        x = (u - 0.5) * 0.3
        z = -0.01 + v * 0.17
        r = math.hypot(x, z)
        y = -0.15 + 0.045 * math.exp(-((x + 0.01) ** 2 + (z - 0.06) ** 2) / 0.004)
        if r > 0.13:
            y -= (r - 0.13) * 1.6
        return (x + ox, y, z + oz)
    P.add(grid(nap, 8, 6, flip=True, fcol=lambda i, j: 0xd23a34 if (i + j) % 2 else 0xf4efe6))
    # пирожок выглядывает краем, два яблока спереди
    P.add(ring(0.05, 0.016, -0.15, 12, 5).tf(S(1, 0.8, 1)).move(ox - 0.04, 0.0, oz - 0.012), 0xd99a4a)
    for k, (dx, dz, c) in enumerate([(-0.035, -0.07, 0xd23a30), (0.055, -0.055, 0xa8c040)]):
        P.add(sphere(0.046, 0.042, 0.046, 10, 7).move(ox + dx, -0.135, oz + dz), c, GLOSS)
        P.add(tube([(ox + dx, -0.098, oz + dz), (ox + dx + 0.006, -0.08, oz + dz)], 0.004, 2, 4), 0x5a3a20)
        if k == 0:
            P.add(slab([(0, 0), (0.012, 0.01), (0.008, 0.03), (0, 0.036), (-0.008, 0.02)], 0.003).tf(RZ(-1.1)).move(ox + dx + 0.008, -0.088, oz + dz), 0x5f9a34)
    return spec([('a_basket', at(P, MITTEN_POSE['R']), MITTEN_POSE['R'])], on_mitten=True, views=(FRONT, (1.0, 0.25, 0.3)))


# ------------------------------------------------------------ пчёлка на плече

BEE_PHI, BEE_Y, BEE_OFF = 1.42, 1.0, 0.058


def a_bee():
    """Начало — лапки пчёлки (насест на правом плече: phi = 1.42, y = 1.0, +0.03 над телом)."""
    P = Part()
    k = 1.95
    yel, brn = 0xf2c230, 0x3a2a1a

    def stripes(x, y, z):
        return brn if int((z / k + 0.1) / 0.017) % 2 else yel
    P.add(sphere(0.036, 0.032, 0.046, 12, 8).tf(RX(-0.25)).move(0, 0.042, 0.022).tf(S(k)), stripes)
    th = sphere(0.032, 0.03, 0.03, 12, 8).move(0, 0.048, -0.022)
    th.warp(lambda p: tuple(c * (1 + 0.08 * math.sin(p.x * 170) * math.sin(p.y * 190 + p.z * 150)) for c in p))
    P.add(th.tf(S(k)), 0xd9a12a)
    P.add(sphere(0.025, 0.024, 0.024, 10, 7).move(0, 0.056, -0.056).tf(S(k)), 0x3a2c1e)
    for s in (-1, 1):
        P.add(sphere(0.009, 0.011, 0.007, 6, 4).move(s * 0.013, 0.062, -0.074).tf(S(k)), 0x101114, GLOSS)
        P.add(tube([(s * 0.008, 0.074, -0.064), (s * 0.016, 0.098, -0.072), (s * 0.026, 0.108, -0.082)], 0.0018, 3, 4).tf(S(k)), brn)
        P.add(sphere(0.005, seg=6, rings=4).move(s * 0.026, 0.108, -0.082).tf(S(k)), brn)
        for j, dz in enumerate((-0.04, -0.02, 0.0)):
            P.add(tube([(s * 0.012, 0.032, dz), (s * 0.024, 0.016, dz - 0.004), (s * 0.02, 0.0, dz - 0.008)], 0.0028, 2, 4).tf(S(k)), brn)
    P.add(cyl(0.0, 0.007, 0.018, 6, bot=False).tf(RX(PI / 2 + 0.3)).move(0, 0.036, 0.072).tf(S(k)), brn)
    B = onBody(BEE_PHI, BEE_Y, BEE_OFF)
    base = T(B.x, B.y, B.z) @ RY(-0.28) @ RZ(-0.22)  # чуть наружу — по склону плеча
    wings = []
    for s in (-1, 1):
        w = Part()
        w.add(slab([(0, 0), (0.02, -0.008), (0.046, -0.004), (0.056, 0.012), (0.04, 0.024), (0.014, 0.014)], 0.002, center=(0.028, 0.006)).tf(S(k)),
              0xe6f1f6, GLOSS)
        if s < 0:
            w = mirror_x(w)
        root = base @ S(1) @ T(s * 0.014 * k, 0.074 * k, -0.02 * k) @ RZ(s * 0.5) @ RY(s * 0.3)
        wings.append(('a_bee_wing_' + ('L' if s < 0 else 'R'), w, root, 'a_bee'))
    # всю пчёлку: лицом вперёд (-Z) и чуть наружу
    Q = Part()
    Q.add(G(P.v, P.f).tf(base), list(P.c), 0)
    Q.m = list(P.m)
    return spec([('a_bee', Q, (B.x, B.y, B.z))], locals=wings)


# ------------------------------------------------------------ рюкзак-лейка

def a_canpack():
    P = Part()
    Mt = Part()
    copper, copper_d, copper_l = 0xc8763c, 0xa65f2e, 0xd9935a
    C0 = Vector((0, 0.86, bodyR(0.86) + 0.035 + 0.145))
    can = lathe([(0.0, -0.2), (0.17, -0.2), (0.195, -0.175), (0.203, -0.06), (0.2, 0.075), (0.19, 0.15),
                 (0.163, 0.188), (0.105, 0.203), (0.0, 0.207)], 20,
                fcol=lambda j, i: copper_l if j in (2, 5) else copper_d if j == 0 else copper)
    Mt.add(can.tf(S(1, 1, 0.72)).move(*C0))
    Mt.add(ring(0.198, 0.009, 0.0, 20, 4).tf(S(1, 1, 0.72)).move(C0.x, C0.y - 0.11, C0.z), copper_d)
    Mt.add(tube([(-0.13, 0.17, 0), (-0.095, 0.31, 0), (0.095, 0.31, 0), (0.13, 0.17, 0)], 0.019, 10, 6).move(*C0), copper_d)
    # носик: от правого бока снизу вверх, мимо головы, над правым плечом; на конце — сеточка-«розетка»
    sp = [(0.16, 0.74, 0.7), (0.28, 0.95, 0.64), (0.36, 1.15, 0.5), (0.4, 1.3, 0.36)]
    Mt.add(tube(sp, lambda t: 0.042 - 0.018 * t, 12, 8), copper)
    tip = Vector(sp[-1])
    d = (tip - Vector(sp[-2])).normalized()
    q = Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()
    Mt.add(cyl(0.066, 0.026, 0.06, 12, top=False, bot=False).move(0, 0.035, 0).tf(q).move(*tip), copper_d)
    P.add(cyl(0.066, 0.066, 0.006, 12, bot=False).move(0, 0.066, 0).tf(q).move(*tip),
          lambda x, y, z: 0x5a3a24 if hsh(round(x, 3), round(y, 3), round(z, 3)) > 0.6 else 0xb8783e)
    # лямки: через плечи на перёд, вниз и под «рукой» назад к низу рюкзака; на груди — перемычка с пряжкой
    leather = 0x7a4a2a
    for s in (-1, 1):
        path = [(s * 0.3, 1.0), (s * 0.9, 1.13), (s * 1.6, 1.1), (s * 2.25, 0.93), (s * 2.36, 0.74), (s * 2.0, 0.58),
                (s * 1.2, 0.57), (s * 0.4, 0.68)]
        P.add(strap(path, 0.024, 0.044, 0.008, 24), leather)
    P.add(strap([(PI - 0.8, 0.8), (PI, 0.795), (PI + 0.8, 0.8)], 0.033, 0.03, 0.007, 10), shade(leather, 1.12))
    Mt.add(put(cyl(0.03, 0.03, 0.008, 4).tf(RY(PI / 4)).tf(S(1.2, 1, 0.8)).tf(RX(PI / 2)), PI, 0.797, 0.042), 0xd2b062)
    for x in (-0.14, 0.14):
        Mt.add(sphere(0.014, seg=6, rings=4).move(C0.x + x, C0.y + 0.14, C0.z + 0.1), 0xd2b062)
    return spec([('a_canpack', P, (0, 0.86, 0)), ('a_canpack_metal', Mt, (0, 0.86, 0))])


TABLE = {
    'greengloves': a_greengloves, 'apron': a_apron, 'alarm': a_alarm, 'basket': a_basket, 'bee': a_bee, 'canpack': a_canpack,
}

if __name__ == '__main__':
    run('a', TABLE, cli_names(TABLE), os.path.abspath(__file__))
