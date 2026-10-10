# s:mushroom — мини-гриб «Опёнок»: светло-коричневая шляпка, белая ножка, глазки под шляпкой, лапки-пенёчки (§12.3).
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep, bump, win, blink, ease

FID = 'pet-mushroom'
STEM = C('#fbf3e2')
STEM_D = C('#eadbbd')
CAP_C = C('#8f4f22')
CAP_M = C('#d4913f')
CAP_R = C('#efc883')
GILL = C('#f2dcae')
GILL_D = C('#dcc08a')
SCALE = C('#8a4f22')
RING = C('#f7eedb')
BARK = C('#8b5a32')
BARK_L = C('#c99a62')
BLACK = C('#1a1820')
WHITE = C('#ffffff')
BLUSH = C('#ff94a4')
PUFF = C('#f6edd2')

CAP_TOP = [(0.0, 0.305), (0.05, 0.3), (0.095, 0.282), (0.125, 0.256), (0.142, 0.226)]
PUFF_K = 0.1  # облачко спор в покое крошечное и спрятано в шляпке; на чихе кость масштабирует его ×10


def cap_z(r):
    for (r0, z0), (r1, z1) in zip(CAP_TOP, CAP_TOP[1:]):
        if r <= r1:
            return z0 + (r - r0) / (r1 - r0) * (z1 - z0)
    return CAP_TOP[-1][1]


def stem_r(z):
    prof = [(0.05, 0.012), (0.066, 0.025), (0.072, 0.05), (0.07, 0.1), (0.064, 0.15), (0.058, 0.19)]
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z <= z1:
            return r0 + (z - z0) / (z1 - z0) * (r1 - r0)
    return 0.058


def cap_col(co):
    r = math.hypot(co.x, co.y)
    if co.z < 0.205:
        a = math.atan2(co.y, co.x)
        g = 0.5 + 0.5 * math.cos(a * 30)
        return mix(GILL, GILL_D, g * sstep(0.06, 0.12, r))
    c = mix(CAP_C, CAP_M, sstep(0.01, 0.075, r))
    return mix(c, CAP_R, sstep(0.11, 0.145, r))


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_gloss'], q)
    m.lathe([(0.001, 0.012), (0.05, 0.012), (0.066, 0.025), (0.072, 0.05), (0.07, 0.1), (0.064, 0.15), (0.058, 0.19),
             (0.05, 0.205), (0.001, 0.208)], seg=22, color=lambda co: mix(STEM_D, STEM, sstep(0.02, 0.09, co.z)),
            bone='body')
    m.lathe([(0.001, 0.305), (0.05, 0.3), (0.095, 0.282), (0.125, 0.256), (0.142, 0.226), (0.146, 0.207),
             (0.136, 0.193), (0.11, 0.19), (0.07, 0.196), (0.04, 0.2), (0.001, 0.202)], seg=24, color=cap_col,
            bone='cap')
    rnd = random.Random(7)
    for i in range(11 if q > 0.7 else 6):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.025, 0.115)
        x, y = r * math.cos(a), r * math.sin(a)
        z = cap_z(r)
        tilt = math.degrees(math.atan2(r, 1.0)) * 1.3
        m.sphere(0.008 + 0.004 * rnd.random(), loc=(x, y, z - 0.001), scale=(1, 0.8, 0.28),
                 rot=(0, tilt, math.degrees(a)), seg=8, ring=4, color=SCALE, bone='cap')
    # юбочка-колечко
    m.torus(0.07, 0.011, loc=(0, 0, 0.088), scale=(1, 1, 0.55), seg=24, rseg=6,
            deform=lambda co: (co.x, co.y, co.z - 0.004 * (math.hypot(co.x, co.y) > 0.07)), color=RING, bone='body')
    # глазки, блики, румянец
    for s in (-1, 1):
        ez = 0.147
        ex = 0.023 * s
        ey = math.sqrt(max(0.0, stem_r(ez) ** 2 - ex * ex)) - 0.002
        yaw = -math.degrees(math.atan2(ex, ey))
        m.sphere(0.0145, loc=(ex, ey, ez), scale=(0.85, 0.55, 1.2), rot=(0, 0, yaw), seg=12, ring=8, color=BLACK,
                 bone='eyes')
        m.sphere(0.0045, loc=(ex - 0.004, ey + 0.008, ez + 0.007), seg=8, ring=6, color=WHITE, bone='eyes')
        bz = 0.126
        bx = 0.043 * s
        by = math.sqrt(max(0.0, stem_r(bz) ** 2 - bx * bx)) - 0.001
        m.disc(0.012, loc=(bx, by, bz), rot=(-90, 0, -math.degrees(math.atan2(bx, by))), scale=(1, 0.65, 1), seg=10,
               thick=0.008, color=BLUSH, bone="body")
    # лапки-пенёчки
    for s, side in ((-1, 'L'), (1, 'R')):
        m.lathe([(0.001, 0.0), (0.03, 0.0), (0.033, 0.006), (0.029, 0.018), (0.026, 0.03), (0.02, 0.034), (0.001, 0.035)],
                seg=12, loc=(0.036 * s, 0.012, 0.0),
                color=lambda co: BARK_L if co.z > 0.031 else mix(BARK, BARK_L, 0.25 * (math.sin(math.atan2(co.y - 0.012, co.x) * 9) > 0.3)),
                bone='foot.' + side)
    # облачко спор (для чиха)
    rnd = random.Random(3)
    for i in range(6 if q > 0.7 else 4):
        a = i / 6 * 2 * math.pi
        r = 0.022 + 0.008 * rnd.random()
        m.sphere(r * PUFF_K, loc=(0.03 * math.cos(a) * PUFF_K, 0.012 * math.sin(a) * PUFF_K, 0.25 + 0.018 * math.sin(a * 2) * PUFF_K),
                 seg=10, ring=6, color=PUFF, bone='puff')
    return m


BONES = [
    ('root', (0, 0, 0), None, False),
    ('body', (0, 0, 0.012), 'root'),
    ('cap', (0, 0, 0.19), 'body'),
    ('eyes', (0, 0.06, 0.147), 'body'),
    ('foot.L', (-0.036, 0.012, 0.035), 'root'),
    ('foot.R', (0.036, 0.012, 0.035), 'root'),
    ('puff', (0, 0, 0.25), 'body'),
]
S2 = 2 * math.pi
HIDE = {'puff': {'sc': 1.0}}


def idle(t, f):
    sway = math.sin(S2 * t)
    wind = win(t, 0.5, 0.63, 0.04)
    ach = bump(t, 0.61, 0.72)
    e = min(blink(t, 0.3), 1 - 0.5 * wind - 0.5 * ach)
    k = (t - 0.62) / 0.24
    puff = 0.0 if not (0 < k < 1) else 1.0
    grow = 1 + 9 * (sstep(0.0, 0.2, k) * (1 - sstep(0.6, 1.0, k))) if puff else 1.0
    return {
        'body': {'rot': (12 * wind - 18 * ach, 4 * sway, 0),
                 'sc': (1 + 0.03 * ach, 1 + 0.03 * ach, 1 - 0.05 * ach + 0.03 * wind)},
        'cap': {'rot': (-12 * ach, 3 * math.sin(S2 * t - 0.6), 0), 'loc': (0, 0, 0.01 * wind + 0.022 * ach)},
        'eyes': {'sc': (1, 1, e)},
        'puff': {'sc': grow, 'loc': (0, 0.06 + 0.16 * ease(k), 0.01 + 0.06 * ease(k)) if puff else (0, 0, 0)},
    }


def waddle(t, f):
    p = S2 * t
    return {
        'root': {'loc': (0, 0, 0.006 * abs(math.sin(p)))},
        'body': {'rot': (-4, 9 * math.sin(p), 0)},
        'cap': {'rot': (0, 5 * math.sin(p - 0.7), 0), 'loc': (0, 0, 0.005 * abs(math.sin(p - 0.5)))},
        'foot.L': {'loc': (0, 0.006 * math.cos(p), 0.018 * max(0.0, math.sin(p)))},
        'foot.R': {'loc': (0, -0.006 * math.cos(p), 0.018 * max(0.0, -math.sin(p)))},
        'puff': HIDE['puff'],
    }


def happy(t, f):
    u = (t - 0.15) / 0.55
    air = math.sin(math.pi * u) if 0 < u < 1 else 0.0
    u2 = (t - 0.3) / 0.45
    capj = math.sin(math.pi * u2) if 0 < u2 < 1 else 0.0
    sq = bump(t, 0.0, 0.17) + bump(t, 0.68, 0.86)
    return {
        'root': {'loc': (0, 0, 0.13 * air), 'rot': (0, 0, 360 * ease(u))},
        'body': {'sc': (1 + 0.06 * sq, 1 + 0.06 * sq, 1 - 0.12 * sq + 0.06 * air)},
        'cap': {'loc': (0, 0, 0.05 * capj), 'rot': (0, 0, -60 * capj)},
        'eyes': {'sc': (1, 1, 1 - 0.55 * win(t, 0.15, 0.85))},
        'foot.L': {'loc': (0, 0, 0.01 * air)}, 'foot.R': {'loc': (0, 0, 0.01 * air)},
        'puff': HIDE['puff'],
    }


def sit(t, f):
    e = min(blink(t, 0.4, 0.1), blink(t, 0.5, 0.1))
    return {
        'body': {'loc': (0, 0, -0.016), 'rot': (0, 2.5 * math.sin(S2 * t), 0), 'sc': (1, 1, 1 + 0.012 * math.sin(S2 * 2 * t))},
        'foot.L': {'sc': (1.1, 1.1, 0.5)}, 'foot.R': {'sc': (1.1, 1.1, 0.5)},
        'cap': {'rot': (4, 0, 0)},
        'eyes': {'sc': (1, 1, 0.75 * e)},
        'puff': HIDE['puff'],
    }


ANIMS = [('idle', 120, idle), ('follow', 21, waddle), ('happy', 45, happy), ('sit', 60, sit)]


def main():
    K.reset()
    arm = K.armature(FID + '_rig', BONES)
    ob = build(1.0).object(arm)
    lod = build(0.52, FID + '_lod1').object(arm)
    acts = [K.bake(arm, n, fr, fn) for n, fr, fn in ANIMS]
    K.report(FID, [ob, lod], arm, acts)
    K.save_blend(FID)
    K.export_glb(FID, [arm, ob, lod])
    lod.hide_render = True
    st = K.stage()
    K.frame_cam((-0.15, -0.15, 0.0), (0.15, 0.15, 0.31))
    K.use_action(arm, acts[0], 0)
    K.render(f'{K.REN_DIR}/{FID}.png')
    K.frame_cam((-0.18, -0.18, 0.0), (0.18, 0.3, 0.38))
    K.strip(f'{K.REN_DIR}/{FID}_idle.png', arm, acts[0], (64, 74, 78, 88))
    K.strip(f'{K.REN_DIR}/{FID}_happy.png', arm, acts[2], (4, 16, 24, 34))
    K.remove(st)
    lod.hide_render = False
    K.save_blend(FID)


if __name__ == '__main__':
    main()
