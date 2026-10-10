# s:piglet — поросёнок «Желудь»: розовый, ушки-лопушки, на шее ленточка с жёлудем (design-v11 §12.3).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep, bump, win, blink, ease

FID = 'pet-piglet'
PINK = C('#ffb4c2')
PINK_L = C('#ffd3dc')
PINK_D = C('#f593a8')
SNOUT = C('#ff9cb1')
NOSTRIL = C('#b44a62')
HOOF = C('#d9798f')
BLACK = C('#1b1a22')
WHITE = C('#ffffff')
BLUSH = C('#ff7f98')
RIBBON = C('#4fae5c')
RIBBON_D = C('#3c8f49')
NUT = C('#c98b40')
CAP = C('#6e4524')

BODY_C = (0, -0.035, 0.135)
HEAD_C = (0, 0.1, 0.195)
HR = 0.105


def body_col(co):
    belly = 1 - sstep(0.06, 0.13, co.z)
    return mix(PINK, PINK_L, belly * 0.6)


def head_y(x, z):
    v = HR * HR - (x / 1.0) ** 2 - ((z - HEAD_C[2]) / 0.95) ** 2
    return HEAD_C[1] + 0.92 * math.sqrt(max(0.0, v))


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_gloss'], q)
    m.sphere(0.13, loc=BODY_C, scale=(0.95, 1.18, 0.86), seg=18, ring=12, color=body_col, bone='body')
    m.sphere(HR, loc=HEAD_C, scale=(1.0, 0.92, 0.95), seg=18, ring=12,
             color=lambda co: mix(PINK, PINK_L, (1 - sstep(0.12, 0.2, co.z)) * 0.4), bone='head')
    # пятачок
    sz = 0.168
    sy = head_y(0, sz) - 0.012
    m.lathe([(0.001, 0.0), (0.03, 0.0), (0.041, 0.006), (0.044, 0.02), (0.04, 0.031), (0.03, 0.035), (0.001, 0.036)],
            seg=16, loc=(0, sy, sz), rot=(-90, 0, 0), scale=(1.12, 0.92, 1), color=SNOUT, bone='head')
    for s in (-1, 1):
        m.sphere(0.0085, loc=(0.015 * s, sy + 0.0355, sz + 0.001), scale=(0.75, 0.4, 1.25), seg=8, ring=6,
                 color=NOSTRIL, bone='head')
    # глаза, блики, румянец
    for s in (-1, 1):
        ex, ez = 0.043 * s, 0.226
        ey = head_y(ex, ez) - 0.004
        yaw = -math.degrees(math.atan2(ex, ey - HEAD_C[1]))
        m.sphere(0.017, loc=(ex, ey, ez), scale=(0.85, 0.55, 1.15), rot=(0, 0, yaw), seg=12, ring=8, color=BLACK,
                 bone='eyes')
        m.sphere(0.0052, loc=(ex - 0.005, ey + 0.009, ez + 0.008), seg=8, ring=6, color=WHITE, bone='eyes')
        bx, bz = 0.072 * s, 0.17
        by = head_y(bx, bz) - 0.002
        m.disc(0.017, loc=(bx, by, bz), rot=(-90, 0, -math.degrees(math.atan2(bx, by - HEAD_C[1]))), scale=(1, 0.7, 1),
               seg=12, thick=0.009, color=BLUSH, bone='head')
    # ушки-лопушки: свисают вперёд
    def ear_def(co):
        y = co.y + 0.05
        t = y / 0.1
        return (co.x * (1 - 0.3 * t * t) * (0.8 + 0.4 * t), y, co.z - 0.03 * t * t)
    for s, side in ((-1, 'L'), (1, 'R')):
        m.sphere(0.05, loc=(0.056 * s, 0.078, 0.276), scale=(0.62, 1.0, 0.2), rot=(-26, 0, -42 * s), seg=10, ring=7,
                 deform=ear_def, color=lambda co: mix(PINK_D, PINK, 0.35), bone='ear.' + side)
    # ножки с копытцами
    for s in (-1, 1):
        for y, side in ((0.07, 'F'), (-0.13, 'B')):
            b = 'leg.' + side + ('L' if s < 0 else 'R')
            m.lathe([(0.001, 0.0), (0.024, 0.0), (0.029, 0.006), (0.03, 0.02), (0.031, 0.045), (0.026, 0.065), (0.001, 0.07)],
                    seg=9, loc=(0.062 * s, y, 0.0), color=lambda co: HOOF if co.z < 0.017 else PINK, bone=b)
    # хвостик-пружинка
    pts = []
    for i in range(14):
        a = i / 13 * 2.6 * math.pi
        pts.append((0.017 * math.cos(a), -0.175 - 0.035 * i / 13, 0.15 + 0.017 * math.sin(a) + 0.015 * i / 13))
    m.tube(pts, [0.0075 - 0.003 * i / 13 for i in range(14)], seg=6, color=PINK_D, bone='tail')
    # ленточка на шее с жёлудем
    m.torus(0.094, 0.0115, loc=(0, 0.062, 0.16), rot=(-70, 0, 0), scale=(1.04, 1.0, 0.7), seg=20, rseg=6,
            color=RIBBON, bone='body')
    for s in (-1, 1):  # бантик
        m.sphere(0.022, loc=(0.021 * s, 0.098, 0.076), scale=(1.0, 0.45, 0.62), rot=(-20, 0, 18 * s), seg=10, ring=6,
                 color=RIBBON_D, bone='body')
    m.sphere(0.009, loc=(0, 0.101, 0.076), seg=8, ring=6, color=RIBBON_D, bone='body')
    m.sphere(0.02, loc=(0, 0.106, 0.042), scale=(1, 1, 1.25), seg=12, ring=8,
             deform=lambda co: (co.x * (1 - 0.35 * max(0.0, -co.z / 0.02)), co.y * (1 - 0.35 * max(0.0, -co.z / 0.02)), co.z),
             color=NUT, bone='acorn')
    m.sphere(0.022, loc=(0, 0.106, 0.058), scale=(1, 1, 0.55), seg=12, ring=6, color=CAP, bone='acorn')
    m.tube([(0, 0.106, 0.068), (0, 0.104, 0.076)], 0.003, seg=5, color=CAP, bone='acorn')
    return m


BONES = [
    ('root', (0, 0, 0), None, False),
    ('body', (0, -0.03, 0.12), 'root'),
    ('head', (0, 0.06, 0.17), 'body'),
    ('eyes', (0, 0.18, 0.226), 'head'),
    ('ear.L', (-0.05, 0.09, 0.285), 'head'),
    ('ear.R', (0.05, 0.09, 0.285), 'head'),
    ('acorn', (0, 0.102, 0.074), 'body'),
    ('tail', (0, -0.17, 0.15), 'body'),
    ('leg.FL', (-0.062, 0.07, 0.07), 'root'),
    ('leg.FR', (0.062, 0.07, 0.07), 'root'),
    ('leg.BL', (-0.062, -0.13, 0.07), 'root'),
    ('leg.BR', (0.062, -0.13, 0.07), 'root'),
]
S2 = 2 * math.pi


def spring(t, k=4, a=1.0):
    return {'rot': (14 * a * math.sin(S2 * k * t), 0, 24 * a * math.sin(S2 * k * t + 1.2)),
            'sc': (1, 1 + 0.25 * a * math.sin(S2 * k * t), 1)}


def idle(t, f):
    sn = win(t, 0.08, 0.55, 0.08)
    tw = math.sin(S2 * 22 * t) * sn
    look = bump(t, 0.62, 0.9)
    e = blink(t, 0.7)
    br = math.sin(S2 * 2 * t) * 0.012
    return {
        'body': {'sc': (1 + br / 2, 1, 1 - br / 2 + br)},
        'head': {'rot': (-24 * sn + 3 * tw, 0, 14 * look), 'loc': (0, 0.006 * tw, 0)},
        'ear.L': {'rot': (-10 * sn + 6 * math.sin(S2 * 4 * t), 0, 0)},
        'ear.R': {'rot': (-10 * sn + 6 * math.sin(S2 * 4 * t + 0.6), 0, 0)},
        'tail': spring(t, 6, 0.8),
        'eyes': {'sc': (1, 1, e)},
        'acorn': {'rot': (8 * sn, 0, 6 * math.sin(S2 * 2 * t))},
    }


def trot(t, f):
    p = S2 * t
    a, b = math.sin(p), -math.sin(p)
    la = 0.016 * max(0.0, math.cos(p))
    lb = 0.016 * max(0.0, -math.cos(p))
    bounce = abs(math.sin(p))
    return {
        'root': {'loc': (0, 0, 0.014 * bounce)},
        'body': {'rot': (-3, 4 * math.sin(p), 0), 'sc': (1, 1, 1 - 0.03 * math.cos(2 * p))},
        'head': {'rot': (5 * math.cos(2 * p), 0, 0)},
        'ear.L': {'rot': (18 * math.sin(2 * p - 1.0), 0, 0)},
        'ear.R': {'rot': (18 * math.sin(2 * p - 1.3), 0, 0)},
        'leg.FL': {'rot': (28 * a, 0, 0), 'loc': (0, 0, la)},
        'leg.BR': {'rot': (28 * a, 0, 0), 'loc': (0, 0, la)},
        'leg.FR': {'rot': (28 * b, 0, 0), 'loc': (0, 0, lb)},
        'leg.BL': {'rot': (28 * b, 0, 0), 'loc': (0, 0, lb)},
        'tail': spring(t, 2, 1.0),
        'acorn': {'rot': (14 * math.sin(2 * p - 0.8), 0, 0)},
    }


def happy(t, f):
    # присел → перекатился на спину → болтает ножками и хрюкает → обратно на ноги
    roll = 180 * ease((t - 0.12) / 0.2) + 180 * ease((t - 0.76) / 0.2)
    wig = 14 * math.sin(S2 * 5 * t) * win(t, 0.34, 0.74, 0.04)
    th = math.radians(roll + wig)
    h = 0.13
    kick = win(t, 0.3, 0.76, 0.05)
    k1 = 40 * math.sin(S2 * 9 * t) * kick
    k2 = 40 * math.sin(S2 * 9 * t + math.pi) * kick
    grunt = math.sin(S2 * 10 * t) * win(t, 0.4, 0.7, 0.05)
    crouch = bump(t, 0.0, 0.16) + bump(t, 0.92, 1.0)
    happy_eyes = 1 - 0.6 * win(t, 0.3, 0.8)
    return {
        'root': {'loc': (-h * math.sin(th), 0, h - h * math.cos(th)), 'rot': (0, roll + wig, 0)},
        'body': {'sc': (1 + 0.05 * crouch, 1, 1 - 0.1 * crouch)},
        'head': {'rot': (10 * grunt + 10 * kick, 0, 0)},
        'ear.L': {'rot': (-30 * kick, 0, 0)},
        'ear.R': {'rot': (-30 * kick, 0, 0)},
        'leg.FL': {'rot': (k1, 0, 0)}, 'leg.BR': {'rot': (k1, 0, 0)},
        'leg.FR': {'rot': (k2, 0, 0)}, 'leg.BL': {'rot': (k2, 0, 0)},
        'tail': spring(t, 8, 1.0),
        'eyes': {'sc': (1, 1, happy_eyes)},
        'acorn': {'rot': (0, 25 * kick * math.sin(S2 * 5 * t), 0)},
    }


def sit(t, f):
    br = math.sin(S2 * t) * 0.02
    e = blink(t, 0.45)
    tuck = {'sc': (1, 1, 0.35), 'loc': (0, 0, -0.04)}
    return {
        'body': {'loc': (0, 0, -0.04), 'sc': (1 + br / 2, 1, 1 + br)},
        'head': {'rot': (-8, 0, 0), 'loc': (0, 0, -0.008)},
        'ear.L': {'rot': (-12, 0, 0)}, 'ear.R': {'rot': (-12, 0, 0)},
        'leg.FL': tuck, 'leg.FR': tuck, 'leg.BL': tuck, 'leg.BR': tuck,
        'eyes': {'sc': (1, 1, e)},
        'tail': spring(t, 1, 0.4),
        'acorn': {'loc': (0, 0, -0.002)},
    }


ANIMS = [('idle', 90, idle), ('follow', 18, trot), ('happy', 75, happy), ('sit', 60, sit)]


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
    K.frame_cam((-0.15, -0.22, 0.0), (0.15, 0.22, 0.3))
    K.use_action(arm, acts[0], 0)
    K.render(f'{K.REN_DIR}/{FID}.png')
    K.strip(f'{K.REN_DIR}/{FID}_happy.png', arm, acts[2], (6, 22, 38, 62))
    K.strip(f'{K.REN_DIR}/{FID}_follow.png', arm, acts[1], (0, 4, 9, 13))
    K.remove(st)
    lod.hide_render = False
    K.save_blend(FID)


if __name__ == '__main__':
    main()
