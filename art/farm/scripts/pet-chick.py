# s:chick — цыплёнок «Пик»: пушистый жёлтый комочек, оранжевые клюв и лапки, хохолок (design-v11 §12.3).
# Запуск: Blender -b --python art/farm/scripts/pet-chick.py
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep, bump, win, blink, ease

FID = 'pet-chick'
YEL = C('#ffd23c')
YEL_TOP = C('#ffe27a')
YEL_LOW = C('#ffbd2a')
CREAM = C('#fff1b0')
ORANGE = C('#ff9a2e')
ORANGE_D = C('#ee7a1e')
BLACK = C('#1b1a22')
WHITE = C('#ffffff')
PINK = C('#ff8e9e')

BCY = 0.14   # центр тела
BR = 0.125


def body_col(co):
    k = sstep(0.06, 0.25, co.z)
    c = mix(YEL_LOW, YEL_TOP, k)
    belly = sstep(0.02, 0.1, co.y) * (1 - sstep(0.12, 0.17, co.z))
    return mix(c, CREAM, belly * 0.55)


def surf_y(x, z):
    v = BR * BR - x * x - ((z - BCY) / 0.94) ** 2
    return 0.96 * math.sqrt(max(0.0, v))


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_fluff'], q)
    # тело-комочек
    m.sphere(BR, loc=(0, 0, BCY), scale=(1, 0.96, 0.94), seg=24, ring=16, color=body_col, bone='body')
    # глаза-бусинки с бликом и румянец
    for s, side in ((-1, 'L'), (1, 'R')):
        ex, ez = 0.048 * s, 0.172
        ey = surf_y(ex, ez) - 0.003
        yaw = -math.degrees(math.atan2(ex, ey))
        m.sphere(0.021, loc=(ex, ey, ez), scale=(0.85, 0.55, 1.15), rot=(0, 0, yaw), seg=12, ring=8, color=BLACK,
                 mat='farm_fluff', bone='eye.' + side)
        m.sphere(0.0062, loc=(ex - 0.006, ey + 0.011, ez + 0.009), seg=8, ring=6, color=WHITE, mat='farm_fluff',
                 bone='eye.' + side)
        if q > 0.7:
            m.sphere(0.0035, loc=(ex + 0.006, ey + 0.012, ez - 0.008), seg=6, ring=4, color=WHITE, mat='farm_fluff',
                     bone='eye.' + side)
        bx, bz = 0.079 * s, 0.143
        by = surf_y(bx, bz) - 0.001
        m.disc(0.018, loc=(bx, by, bz), rot=(-90, 0, -math.degrees(math.atan2(bx, by))), scale=(1, 0.7, 1),
               seg=12, thick=0.009, color=PINK, mat='farm_fluff', bone='body')

    # клюв: верх (тело) и низ (кость beak — открывается на «пи!»)
    def beak_def(k):
        def f(co):
            t = max(0.0, co.y / 0.03)
            return (co.x * (1 - 0.62 * t), co.y, co.z * (1 - 0.45 * t) + (0.004 * t if k else 0))
        return f
    m.sphere(0.03, loc=(0, 0.113, 0.152), scale=(0.95, 1.0, 0.5), seg=12, ring=8, deform=beak_def(1), color=ORANGE,
             mat='farm_fluff', bone='body')
    m.sphere(0.024, loc=(0, 0.112, 0.139), scale=(0.85, 0.95, 0.42), seg=12, ring=6, deform=beak_def(0),
             color=ORANGE_D, mat='farm_fluff', bone='beak')

    # хохолок — три пёрышка
    crest = [
        ((0, 0.02, 0.244), [(0, 0.03, 0.28), (0, 0.05, 0.3), (0, 0.072, 0.298)], 0.015),
        ((-0.008, 0.004, 0.246), [(-0.018, -0.002, 0.276), (-0.03, 0.006, 0.288), (-0.038, 0.022, 0.284)], 0.012),
        ((0.008, 0.004, 0.246), [(0.018, -0.002, 0.276), (0.03, 0.006, 0.288), (0.038, 0.022, 0.284)], 0.012),
        ((0, -0.014, 0.243), [(0, -0.024, 0.268), (0, -0.018, 0.282), (0, -0.004, 0.284)], 0.011),
    ]
    for base, rest, r0 in crest:
        pts = [base] + rest
        m.tube(pts, [r0, r0 * 0.85, r0 * 0.6, r0 * 0.22], seg=8, color=lambda co: mix(YEL, C('#ffb22a'), sstep(0.27, 0.30, co.z)),
               bone='crest')

    # крылышки-капельки
    def wing_def(s):
        def f(co):
            t = max(0.0, -co.y / 0.055)
            return (co.x, co.y * (1 + 0.15 * t), co.z * (1 - 0.55 * t) - 0.012 * t * t)
        return f
    for s, side in ((-1, 'L'), (1, 'R')):
        m.sphere(0.056, loc=(0.116 * s, -0.008, 0.132), scale=(0.3, 1.0, 0.72), rot=(18, 0, -8 * s), seg=14, ring=8,
                 deform=wing_def(s), color=lambda co: mix(C('#ffc935'), C('#ffad28'), sstep(0.10, 0.07, co.z)),
                 bone='wing.' + side)

    # хвостик-пёрышки
    for dx, dz in ((0, 0.0), (-0.016, -0.008), (0.016, -0.008)):
        m.tube([(dx, -0.1, 0.125 + dz), (dx * 1.4, -0.13, 0.142 + dz), (dx * 1.8, -0.15, 0.165 + dz)],
               [0.016, 0.011, 0.003], seg=7, color=YEL_LOW, bone='tail')

    # лапки: ножка и три пальца + задний
    for s, side in ((-1, 'L'), (1, 'R')):
        x = 0.042 * s
        b = 'leg.' + side
        m.tube([(x, 0.012, 0.05), (x, 0.016, 0.026), (x, 0.02, 0.01)], [0.0095, 0.0085, 0.0085], seg=8, color=ORANGE,
               mat='farm_fluff', bone=b)
        for a in (-32, 0, 32):
            ang = math.radians(a)
            ex, ey = x + math.sin(ang) * 0.034, 0.02 + math.cos(ang) * 0.034
            m.tube([(x, 0.02, 0.009), ((x + ex) / 2, (0.02 + ey) / 2, 0.008), (ex, ey, 0.007)], [0.0075, 0.007, 0.0058],
                   seg=6, color=ORANGE, mat='farm_fluff', bone=b)
        m.tube([(x, 0.02, 0.009), (x, 0.002, 0.007)], [0.007, 0.0055], seg=6, color=ORANGE, mat='farm_fluff', bone=b)
    return m


BONES = [
    ('root', (0, 0, 0), None, False),
    ('body', (0, 0.03, 0.03), 'root'),
    ('eye.L', (-0.048, 0.105, 0.172), 'body'),
    ('eye.R', (0.048, 0.105, 0.172), 'body'),
    ('beak', (0, 0.1, 0.143), 'body'),
    ('crest', (0, 0.012, 0.245), 'body'),
    ('wing.L', (-0.11, 0.0, 0.168), 'body'),
    ('wing.R', (0.11, 0.0, 0.168), 'body'),
    ('tail', (0, -0.1, 0.125), 'body'),
    ('leg.L', (-0.042, 0.012, 0.05), 'root'),
    ('leg.R', (0.042, 0.012, 0.05), 'root'),
]

S2 = 2 * math.pi


def breathe(t, k=2, a=0.015):
    v = math.sin(S2 * k * t) * a
    return (1 - v / 2, 1 - v / 2, 1 + v)


def idle(t, f):
    p1 = bump(t, 0.06, 0.2)
    p2 = bump(t, 0.22, 0.36)
    peck = max(p1, p2)
    sh = win(t, 0.5, 0.72, 0.04)
    shake = math.sin(S2 * 7 * (t - 0.5)) * sh
    e = blink(t, 0.86)
    bs = breathe(t)
    wing = 10 * sh + 6 * peck
    return {
        'body': {'rot': (-34 * peck, 13 * shake, 4 * shake), 'sc': bs},
        'crest': {'rot': (12 * peck - 10 * math.sin(S2 * 3 * t) * 0.3, 18 * shake, 0)},
        'tail': {'rot': (0, 0, 22 * shake)},
        'wing.L': {'rot': (0, wing + 8 * shake, 0)},
        'wing.R': {'rot': (0, -wing + 8 * shake, 0)},
        'eye.L': {'sc': (1, 1, e)},
        'eye.R': {'sc': (1, 1, e)},
        'beak': {'rot': (-12 * bump(t, 0.1, 0.16) - 12 * bump(t, 0.26, 0.32), 0, 0)},
    }


def walk(amp=1.0, lift=0.012, bob=0.009, lean=6, wings=10, flap=0.0):
    def fn(t, f):
        p = S2 * t
        sl, sr = math.sin(p), -math.sin(p)
        ll = lift * max(0.0, math.cos(p))
        lr = lift * max(0.0, -math.cos(p))
        fl = (wings + flap * (0.5 + 0.5 * math.sin(S2 * 2 * t)))
        return {
            'root': {'loc': (0, 0, bob * abs(math.sin(p)))},
            'body': {'rot': (-lean, 5 * amp * math.sin(p), 3 * math.sin(p)),
                     'sc': (1 + 0.02 * math.cos(2 * p), 1 + 0.02 * math.cos(2 * p), 1 - 0.035 * math.cos(2 * p))},
            'leg.L': {'rot': (30 * amp * sl, 0, 0), 'loc': (0, 0, ll)},
            'leg.R': {'rot': (30 * amp * sr, 0, 0), 'loc': (0, 0, lr)},
            'wing.L': {'rot': (0, fl, 0)},
            'wing.R': {'rot': (0, -fl, 0)},
            'crest': {'rot': (8 * math.sin(2 * p), 0, 0)},
            'tail': {'rot': (0, 0, 10 * math.sin(p))},
        }
    return fn


def happy(t, f):
    pre = bump(t, 0.0, 0.3) if t < 0.15 else 0.0
    pre = sstep(0.0, 0.14, t) * (1 - sstep(0.14, 0.2, t))
    u = max(0.0, min(1.0, (t - 0.16) / 0.5))
    air = math.sin(math.pi * u) if 0 < u < 1 else 0.0
    land = bump(t, 0.64, 0.84)
    spin = 360 * ease(u)
    sq = 0.14 * pre + 0.12 * land
    st = 0.1 * air
    fl = 45 * air + 25 * air * math.sin(S2 * 6 * t)
    return {
        'root': {'loc': (0, 0, 0.15 * air), 'rot': (0, 0, spin)},
        'body': {'sc': (1 + sq / 2 - st / 2, 1 + sq / 2 - st / 2, 1 - sq + st), 'rot': (8 * air, 0, 0)},
        'wing.L': {'rot': (0, 15 * pre + fl, 0)},
        'wing.R': {'rot': (0, -15 * pre - fl, 0)},
        'beak': {'rot': (-28 * win(t, 0.16, 0.46, 0.05), 0, 0)},
        'eye.L': {'sc': (1, 1, 1 - 0.55 * win(t, 0.18, 0.7))},
        'eye.R': {'sc': (1, 1, 1 - 0.55 * win(t, 0.18, 0.7))},
        'crest': {'rot': (-20 * air + 14 * land, 0, 0)},
        'leg.L': {'rot': (25 * air, 0, 0), 'loc': (0, 0, 0)},
        'leg.R': {'rot': (25 * air, 0, 0)},
        'tail': {'rot': (20 * air, 0, 0)},
    }


def sit(t, f):
    bs = breathe(t, 1, 0.02)
    e = blink(t, 0.6)
    return {
        'body': {'loc': (0, 0, -0.022), 'sc': bs, 'rot': (4, 0, 0)},
        'leg.L': {'sc': (1, 1, 0.25), 'loc': (0, 0, -0.03)},
        'leg.R': {'sc': (1, 1, 0.25), 'loc': (0, 0, -0.03)},
        'wing.L': {'rot': (0, -4, 0)},
        'wing.R': {'rot': (0, 4, 0)},
        'eye.L': {'sc': (1, 1, e)},
        'eye.R': {'sc': (1, 1, e)},
        'crest': {'rot': (6 * math.sin(S2 * t), 0, 0)},
    }


ANIMS = [
    ('idle', 90, idle),
    ('follow', 16, walk()),
    ('run', 12, walk(amp=1.35, lift=0.022, bob=0.022, lean=14, wings=30, flap=40)),
    ('happy', 42, happy),
    ('sit', 60, sit),
]


def main():
    K.reset()
    arm = K.armature(FID + '_rig', BONES)
    ob = build(1.0).object(arm)
    lod = build(0.6, FID + '_lod1').object(arm)
    acts = [K.bake(arm, n, fr, fn) for n, fr, fn in ANIMS]
    K.report(FID, [ob, lod], arm, acts)
    K.save_blend(FID)
    K.export_glb(FID, [arm, ob, lod])
    lod.hide_render = True
    st = K.stage()
    K.frame_cam((-0.16, -0.16, 0.0), (0.16, 0.16, 0.31))
    K.use_action(arm, acts[0], 0)
    K.render(f'{K.REN_DIR}/{FID}.png')
    for a, frames in ((acts[0], (8, 24, 54, 62)), (acts[2], (0, 3, 6, 9)), (acts[3], (4, 18, 26, 36))):
        K.strip(f'{K.REN_DIR}/{FID}_{a.name}.png', arm, a, frames)
    K.remove(st)
    lod.hide_render = False
    K.save_blend(FID)


if __name__ == '__main__':
    main()
