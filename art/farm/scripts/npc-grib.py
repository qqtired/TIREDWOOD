# Дядюшка Гриб — пожилая шоколадная желейка: огромная бархатная шляпка-боровик вместо шапки, пышные седые усы,
# жилетка с цепочкой часов, карандаш за шляпкой. Ворчливо-добрый (design-v11 §16.4).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
import npckit as N
from charkit import C, mix, sstep, bump, win, ease
from npckit import S2, hand_to, lerp3

FID = 'npc-grib'
BODY = C('#7b4a2c')
CAP_T = C('#80512a')
CAP_R = C('#b07a40')
PORES = C('#ead69a')
PORES_D = C('#d8bf7c')
HAIR = C('#efebe4')
HAIR_D = C('#d6d0c6')
VEST = C('#8c3340')
VEST_D = C('#6e2632')
GOLD = C('#e2b24a')
PENCIL = C('#f2c230')
WOOD = C('#e8c99a')
LEAD = C('#3a3434')
ERASER = C('#ff8fa0')
FERRULE = C('#c8c4bc')
WICKER = C('#c8955a')
WICKER_D = C('#a8763e')

HAND = N.HAND_REST
MOUTH_Z = 0.915


def vest_gap(z):
    return 0.15 + 0.38 * sstep(0.52, 0.98, z)


def stache_pts(s):
    pts = [(0.055, 1.022, 0.068), (0.145, 1.012, 0.074), (0.235, 1.032, 0.062), (0.3, 1.075, 0.042)]
    out = []
    for x, z, r in pts:
        y = N.surf(z, x, 0.0) + 0.012
        out.append(((x * s, y, z), r))
    return out


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_jelly', 'farm_soft', 'farm_metal'], q)
    rj = K.jelly_r
    N.body(m, BODY, seg=30)
    N.eyes(m, seg=14, ring=10)
    mouth_at = N.mouth(m, z=MOUTH_Z, w=0.062)
    N.blush(m, BODY, z=1.005, amt=0.4)
    N.mittens(m, BODY)

    # шляпка-боровик: бархатный верх, светлая губчатая изнанка
    def cap_col(co):
        r = math.hypot(co.x, co.y)
        if co.z < 1.392 + 0.001 and r < 0.61:
            dots = 0.5 + 0.5 * math.cos(math.atan2(co.y, co.x) * 40) * math.cos(r * 90)
            return mix(PORES, PORES_D, 0.5 * dots)
        return mix(CAP_T, CAP_R, sstep(0.38, 0.63, r))
    m.lathe([(0.001, 1.4), (0.3, 1.388), (0.52, 1.35), (0.6, 1.338), (0.642, 1.36), (0.655, 1.41), (0.625, 1.5),
             (0.555, 1.6), (0.43, 1.695), (0.25, 1.77), (0.001, 1.795)], seg=30, color=cap_col, mat='farm_soft',
            bone='hat')
    # карандаш за шляпкой (справа)
    a, b = (0.33, 0.24, 1.25), (0.5, -0.1, 1.37)
    m.tube([a, b], 0.017, seg=6, cap=False, color=PENCIL, mat='farm_soft', bone='hat')
    d = tuple(b[i] - a[i] for i in range(3))
    L = math.sqrt(sum(x * x for x in d))
    u = tuple(x / L for x in d)
    tip = tuple(a[i] - u[i] * 0.05 for i in range(3))
    m.tube([a, tip], [0.017, 0.003], seg=6, cap=False, color=lambda co: LEAD if math.dist(co, tip) < 0.016 else WOOD,
           mat='farm_soft', bone='hat')
    e1 = tuple(b[i] + u[i] * 0.025 for i in range(3))
    e2 = tuple(b[i] + u[i] * 0.05 for i in range(3))
    m.tube([b, e1], 0.018, seg=8, cap=False, color=FERRULE, mat='farm_soft', bone='hat')
    m.tube([e1, e2], 0.017, seg=8, color=ERASER, mat='farm_soft', bone='hat')
    # пышные седые усы и кустистые брови
    for s in (-1, 1):
        for (p, r) in stache_pts(s):
            m.sphere(r, loc=p, scale=(1.15, 0.62, 0.78), rot=(0, -12 * s if abs(p[0]) > 0.2 else 0, 0), seg=10, ring=7,
                     color=lambda co: mix(HAIR, HAIR_D, sstep(1.04, 0.96, co.z) * 0.6), mat='farm_jelly', bone='stache')
        for i, (x, z, r) in enumerate(((0.07, 1.305, 0.032), (0.14, 1.318, 0.036), (0.21, 1.305, 0.03))):
            y = N.surf(z, x, 0.0) + 0.03
            m.sphere(r, loc=(x * s, y, z), scale=(1.2, 0.7, 0.75), seg=8, ring=5, color=HAIR, mat='farm_jelly',
                     bone='brows')
    # жилетка с V-вырезом, пуговицы, цепочка часов
    m.shell(rj, 0.36, 0.98, vest_gap, lambda z: 2 * math.pi - vest_gap(z), off=0.014, thick=0.014, nz=9, na=20,
            color=lambda co: VEST_D if co.z < 0.39 or co.z > 0.955 else VEST, mat='farm_soft', bone=N.jelly_w)
    for z in (0.5, 0.62, 0.74):
        a_ = vest_gap(z) + 0.075
        r = rj(z) + 0.03
        m.disc(0.024, loc=(r * math.sin(a_), r * math.cos(a_), z), rot=(-90, 0, -math.degrees(a_)), seg=10,
               thick=0.008, color=GOLD, mat='farm_metal', bone=N.jelly_w)
    pts = []
    for i in range(13):
        uu = i / 12
        a_ = (vest_gap(0.62) + 0.075) * (1 - uu) + (-0.78) * uu
        z = 0.62 - 0.11 * math.sin(math.pi * uu)
        r = rj(z) + 0.034
        pts.append((r * math.sin(a_), r * math.cos(a_), z))
    m.tube(pts, 0.0065, seg=5, color=GOLD, mat='farm_metal', bone=N.jelly_w)
    a_ = -0.84
    r = rj(0.6) + 0.03
    m.disc(0.036, loc=(r * math.sin(a_), r * math.cos(a_), 0.6), rot=(-90, 0, -math.degrees(a_)), seg=12, thick=0.012,
           color=GOLD, mat='farm_metal', bone=N.jelly_w)
    m.shell(rj, 0.54, 0.585, -0.98, -0.68, off=0.03, thick=0.006, nz=1, na=4, color=VEST_D, mat='farm_soft',
            bone=N.jelly_w)
    # корзинка с овощами (на весы) — в левой варежке, видна только в weigh
    hl = (-HAND[0], HAND[1], HAND[2])
    bc = (hl[0], hl[1] + 0.02, hl[2] - 0.2)
    m.lathe([(0.001, -0.06), (0.09, -0.06), (0.12, -0.02), (0.135, 0.04), (0.128, 0.05), (0.11, 0.0), (0.001, -0.02)],
            seg=14, loc=bc, color=lambda co: WICKER_D if math.sin(co.z * 160) > 0.5 else WICKER, mat='farm_soft',
            bone='prop.L')
    m.torus(0.12, 0.011, loc=(bc[0], bc[1], bc[2] + 0.04), rot=(90, 0, 90), arc=0.5, seg=14, rseg=5, color=WICKER_D,
            mat='farm_soft', bone='prop.L')
    m.sphere(0.04, loc=(bc[0] - 0.04, bc[1] + 0.02, bc[2] + 0.04), seg=10, ring=7, color=C('#e2364f'), mat='farm_soft',
             bone='prop.L')
    m.sphere(0.045, loc=(bc[0] + 0.045, bc[1] - 0.02, bc[2] + 0.035), scale=(1.2, 1, 0.85), seg=10, ring=7,
             color=C('#d9a75e'), mat='farm_soft', bone='prop.L')
    m.tube([(bc[0] + 0.0, bc[1] + 0.05, bc[2] + 0.02), (bc[0] - 0.02, bc[1] + 0.08, bc[2] + 0.09)], [0.022, 0.004], seg=8,
           color=C('#ff8a2a'), mat='farm_soft', bone='prop.L')
    for dx in (-0.012, 0.0, 0.012):
        m.tube([(bc[0] - 0.02, bc[1] + 0.08, bc[2] + 0.09), (bc[0] - 0.03 + dx * 2, bc[1] + 0.1, bc[2] + 0.15)],
               [0.006, 0.002], seg=4, color=C('#5cb84a'), mat='farm_soft', bone='prop.L')
    # монетка в правой варежке и столбик монет в левой — для pay
    hr = HAND
    m.lathe([(0.001, -0.007), (0.042, -0.007), (0.046, 0.0), (0.042, 0.007), (0.001, 0.007)], seg=14,
            loc=(hr[0], hr[1] + 0.1, hr[2] + 0.04), rot=(-80, 0, 0), color=GOLD, mat='farm_metal', bone='prop.R')
    for i in range(4):
        m.lathe([(0.001, -0.007), (0.042, -0.007), (0.046, 0.0), (0.042, 0.007), (0.001, 0.007)], seg=10,
                loc=(hl[0] + 0.005 * (i % 2), hl[1] + 0.06, hl[2] + 0.085 + 0.015 * i), color=GOLD, mat='farm_metal',
                bone='coins')
    return m, mouth_at


def make_bones(mouth_at):
    return N.bones([
        ('hat', (0, 0, 1.36), 'head'),
        ('stache', (0, 0.5, 1.02), 'head'),
        ('brows', (0, 0.44, 1.31), 'head'),
        ('prop.L', (-HAND[0], HAND[1], HAND[2]), 'hand.L'),
        ('prop.R', HAND, 'hand.R'),
        ('coins', (-HAND[0], HAND[1], HAND[2]), 'hand.L'),
    ], mouth_at)


KIND = {'eye.L': {'sc': (1, 1, 0.84)}, 'eye.R': {'sc': (1, 1, 0.84)}}
HIDE_ALL = N.hidden('prop.L', 'prop.R', 'coins')


def idle(t, f):
    d = N.merge(N.base(t, blinks=(0.3, 0.88)), KIND, HIDE_ALL)
    u = (t - 0.04) / 0.4
    hr = (0, 0, 0)
    st = (0, 0, 0)
    if 0 <= u <= 1:
        k = win(u, 0.0, 1.0, 0.2)
        slide = bump(u, 0.18, 0.5) + bump(u, 0.5, 0.82)
        p = lerp3((0.1, 0.6, 1.0), (0.36, 0.53, 1.04), slide)
        hr = hand_to('R', lerp3(HAND, p, k))
        st = (0, -3 * slide, -5 * slide * k)
    v = (t - 0.5) / 0.44
    hl = (0, 0, 0)
    head = (0, 0, 0)
    if 0 <= v <= 1:
        k = win(v, 0.0, 1.0, 0.2)
        click = sum(bump(v, c, c + 0.07) for c in (0.25, 0.36, 0.47, 0.62, 0.7))
        p = (-0.24 + 0.05 * click, 0.62, 0.86 - 0.015 * click)
        hl = hand_to('L', lerp3((-HAND[0], HAND[1], HAND[2]), p, k))
        head = (-9 * k, 0, 6 * k)
    out = N.merge(d, {'hand.R': {'loc': hr}, 'hand.L': {'loc': hl}, 'stache': {'rot': st}, 'head': {'rot': head}})
    out['mouth'] = {'sc': (0.9, 1, 0.06)}
    return out


def weigh(t, f):
    d = N.merge(N.base(t, blinks=(0.55,)), KIND, N.hidden('prop.R', 'coins'))
    show = win(t, 0.0, 1.0, 0.05)
    up = sstep(0.05, 0.32, t) * (1 - sstep(0.72, 0.96, t))
    hlp = lerp3((-HAND[0], HAND[1], HAND[2]), (-0.24, 0.74, 1.1), up)
    hold = win(t, 0.35, 0.72, 0.05)
    tap = bump(t, 0.44, 0.5) + bump(t, 0.52, 0.58)
    hrp = lerp3(HAND, (-0.02, 0.7, 1.0 + 0.04 * tap), win(t, 0.36, 0.66, 0.08))
    nod = bump(t, 0.6, 0.66) + bump(t, 0.66, 0.72)
    out = N.merge(d, {
        'prop.L': {'sc': max(0.001, show)},
        'hand.L': {'loc': hand_to('L', hlp)},
        'hand.R': {'loc': hand_to('R', hrp)},
        'chest': {'rot': (-6 * hold, 0, 3 * hold)},
        'head': {'rot': (-12 * hold - 8 * nod, 0, 10 * hold)},
        'brows': {'loc': (0, 0, -0.012 * hold)},
    })
    out['mouth'] = {'sc': (0.9, 1, 0.06 + 0.25 * nod)}
    return out


def pay(t, f):
    d = N.merge(N.base(t, blinks=(0.93,)), KIND, N.hidden('prop.L'))
    k = win(t, 0.0, 1.0, 0.1)
    hl = hand_to('L', lerp3((-HAND[0], HAND[1], HAND[2]), (-0.22, 0.56, 0.86), k))
    hrp = lerp3(HAND, (0.1, 0.6, 0.9), k)
    coin = 0.001
    mo = 0.06
    nod = 0.0
    for c0 in (0.1, 0.35, 0.6):
        u = (t - c0) / 0.25
        if 0 <= u <= 1:
            take = (-0.14, 0.62, 0.95)
            put = (0.2, 0.8, 0.9)
            if u < 0.3:
                hrp = lerp3(hrp, take, ease(u / 0.3))
            elif u < 0.75:
                hrp = lerp3(take, put, ease((u - 0.3) / 0.45))
            else:
                hrp = lerp3(put, (0.1, 0.6, 0.9), ease((u - 0.75) / 0.25))
            coin = 1.0 if 0.25 < u < 0.78 else 0.001
            mo = 0.06 + 0.45 * bump(u, 0.62, 0.9)
            nod = bump(u, 0.6, 0.9)
    out = N.merge(d, {
        'hand.L': {'loc': hl}, 'hand.R': {'loc': hand_to('R', hrp)},
        'prop.R': {'sc': coin}, 'coins': {'sc': max(0.001, win(t, 0.0, 1.0, 0.06))},
        'head': {'rot': (-8 * k - 6 * nod, 0, 0)},
    })
    out['mouth'] = {'sc': (0.9, 1, mo)}
    return out


def greet(t, f):
    d = N.merge(N.base(t, blinks=()), N.happy_eyes(0.55 * win(t, 0.2, 0.85)), HIDE_ALL)
    k = win(t, 0.0, 1.0, 0.18)
    lift = win(t, 0.25, 0.72, 0.1)
    hrp = lerp3(HAND, (0.44, 0.42, 1.33 + 0.12 * lift), k)
    out = N.merge(d, {
        'hand.R': {'loc': hand_to('R', hrp)},
        'hat': {'loc': (0.02 * lift, 0.02 * lift, 0.12 * lift), 'rot': (-8 * lift, -10 * lift, 0)},
        'head': {'rot': (-8 * bump(t, 0.35, 0.6), 0, 0)},
        'brows': {'loc': (0, 0, 0.02 * lift)},
        'stache': {'rot': (0, 0, 0), 'sc': (1 + 0.05 * lift, 1, 1)},
    })
    out['mouth'] = {'sc': (0.9, 1, 0.06 + 0.45 * win(t, 0.3, 0.7))}
    return out


def laugh(t, f):
    d = N.merge(N.base(t, blinks=()), N.happy_eyes(0.75), HIDE_ALL)
    sh = math.sin(S2 * 6 * t)
    out = N.merge(d, {
        'hand.L': {'loc': hand_to('L', (-0.32, 0.5, 0.52 + 0.02 * sh))},
        'hand.R': {'loc': hand_to('R', (0.32, 0.5, 0.52 - 0.02 * sh))},
        'body': {'sc': (1 - 0.012 * sh, 1 - 0.012 * sh, 1 + 0.025 * sh)},
        'chest': {'rot': (6 + 2.5 * sh, 0, 2 * math.sin(S2 * 2 * t))},
        'head': {'rot': (4, 0, 0)},
        'hat': {'loc': (0, 0, 0.02 * abs(math.sin(S2 * 6 * t + 0.6)))},
        'stache': {'rot': (6 * sh, 0, 0)},
        'brows': {'loc': (0, 0, 0.015)},
    })
    out['mouth'] = {'sc': (1.0, 1, 0.75 + 0.15 * math.sin(S2 * 12 * t))}
    return out


ANIMS = [('idle', 120, idle), ('weigh', 90, weigh), ('pay', 75, pay), ('greet', 60, greet), ('laugh', 60, laugh)]


def main():
    K.reset()
    m, mouth_at = build(1.0)
    arm = K.armature(FID + '_rig', make_bones(mouth_at))
    ob = m.object(arm)
    acts = [K.bake(arm, n, fr, fn) for n, fr, fn in ANIMS]
    K.report(FID, [ob], arm, acts)
    K.save_blend(FID)
    K.export_glb(FID, [arm, ob])
    N.render_set(FID, arm, acts, lo=(-0.75, -0.6, 0.0), hi=(0.75, 0.6, 1.8),
                 frames={'weigh': (8, 24, 45, 80), 'pay': (10, 22, 40, 55), 'greet': (0, 20, 32, 50),
                         'laugh': (0, 8, 15, 22)})
    K.save_blend(FID)


if __name__ == '__main__':
    main()
