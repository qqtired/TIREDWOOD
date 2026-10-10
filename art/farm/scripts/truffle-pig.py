# Трюфельный свин: розовый в тёмных пятнах, пятачок, уши-лопухи (design-v11 §16.6).
# Анимации: dig (роет), sniff (нюхает), happy (радость с хрюком), sleep (спит, «zzz» — спрайтом в игре),
# wag (виляет хвостиком при хозяине), walk (переходит к новой ямке).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep, bump, win, blink, ease

FID = 'truffle-pig'
PINK = C('#f7b2bf')
PINK_L = C('#ffd2db')
PINK_D = C('#ec93a6')
SPOT = C('#5d3d42')
SNOUT = C('#ff9db1')
NOSTRIL = C('#a8435a')
HOOF = C('#6b4a4a')
BLACK = C('#1b1a22')
WHITE = C('#ffffff')
BLUSH = C('#ff7f98')

BODY_C = (0, -0.05, 0.3)
HEAD_C = (0, 0.29, 0.36)
HR = 0.19
SPOTS = [((0.25, -0.1, 0.36), 0.16), ((-0.04, -0.22, 0.53), 0.13), ((-0.22, -0.3, 0.3), 0.14), ((-0.23, 0.1, 0.42), 0.12),
         ((0.085, 0.43, 0.44), 0.075), ((0.12, -0.42, 0.22), 0.1)]


def spotty(base):
    def f(co):
        c = base(co) if callable(base) else base
        k = 0.0
        for p, r in SPOTS:
            d = math.dist(co, p)
            k = max(k, 1 - sstep(r * 0.62, r, d))
        return mix(c, SPOT, k)
    return f


def head_y(x, z):
    v = HR * HR - x * x - ((z - HEAD_C[2]) / 0.92) ** 2
    return HEAD_C[1] + 0.9 * math.sqrt(max(0.0, v))


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_gloss'], q)
    m.sphere(0.27, loc=BODY_C, scale=(0.95, 1.32, 0.8), seg=20, ring=12,
             color=spotty(lambda co: mix(PINK, PINK_L, (1 - sstep(0.14, 0.26, co.z)) * 0.6)), bone='body')
    m.sphere(HR, loc=HEAD_C, scale=(1.0, 0.9, 0.92), seg=18, ring=12,
             color=spotty(lambda co: mix(PINK, PINK_L, (1 - sstep(0.24, 0.36, co.z)) * 0.4)), bone='head')
    sz = 0.31
    sy = head_y(0, sz) - 0.02
    m.lathe([(0.001, 0.0), (0.055, 0.0), (0.074, 0.012), (0.078, 0.035), (0.072, 0.056), (0.055, 0.064), (0.001, 0.065)],
            seg=16, loc=(0, sy, sz), rot=(-90, 0, 0), scale=(1.15, 0.9, 1), color=SNOUT, bone='head')
    for s in (-1, 1):
        m.sphere(0.015, loc=(0.027 * s, sy + 0.064, sz + 0.002), scale=(0.75, 0.4, 1.25), seg=8, ring=6, color=NOSTRIL,
                 bone='head')
    for s in (-1, 1):
        ex, ez = 0.075 * s, 0.42
        ey = head_y(ex, ez) - 0.006
        yaw = -math.degrees(math.atan2(ex, ey - HEAD_C[1]))
        m.sphere(0.028, loc=(ex, ey, ez), scale=(0.85, 0.55, 1.15), rot=(0, 0, yaw), seg=12, ring=8, color=BLACK,
                 bone='eyes')
        m.sphere(0.009, loc=(ex - 0.008, ey + 0.015, ez + 0.013), seg=8, ring=6, color=WHITE, bone='eyes')
        bx, bz = 0.125 * s, 0.31
        by = head_y(bx, bz) - 0.004
        m.disc(0.028, loc=(bx, by, bz), rot=(-90, 0, -math.degrees(math.atan2(bx, by - HEAD_C[1]))), scale=(1, 0.65, 1),
               seg=12, thick=0.012, color=BLUSH, bone='head')

    # уши-лопухи: большие, свисают вперёд на лоб
    def ear_def(co):
        y = co.y + 0.12
        t = y / 0.24
        return (co.x * (1 - 0.28 * t * t) * (0.8 + 0.4 * t), y, co.z - 0.08 * t * t)
    for s, side in ((-1, 'L'), (1, 'R')):
        col = SPOT if s > 0 else mix(PINK_D, PINK, 0.4)
        m.sphere(0.12, loc=(0.1 * s, 0.22, 0.51), scale=(0.64, 1.0, 0.15), rot=(-34, 0, -32 * s), seg=12, ring=8,
                 deform=ear_def, color=col, bone='ear.' + side)
    for s in (-1, 1):
        for y, side in ((0.15, 'F'), (-0.26, 'B')):
            b = 'leg.' + side + ('L' if s < 0 else 'R')
            m.lathe([(0.001, 0.0), (0.055, 0.0), (0.066, 0.012), (0.068, 0.04), (0.07, 0.09), (0.062, 0.13), (0.001, 0.145)],
                    seg=9, loc=(0.14 * s, y, 0.0), color=lambda co: HOOF if co.z < 0.03 else (SPOT if s > 0 and y < 0 else PINK),
                    bone=b)
    pts = []
    for i in range(14):
        a = i / 13 * 2.6 * math.pi
        pts.append((0.03 * math.cos(a), -0.395 - 0.06 * i / 13, 0.37 + 0.03 * math.sin(a) + 0.03 * i / 13))
    m.tube(pts, [0.013 - 0.006 * i / 13 for i in range(14)], seg=6, color=PINK_D, bone='tail')
    return m


BONES = [
    ('root', (0, 0, 0), None, False),
    ('body', (0, -0.05, 0.26), 'root'),
    ('head', (0, 0.18, 0.34), 'body'),
    ('eyes', (0, 0.43, 0.42), 'head'),
    ('ear.L', (-0.09, 0.2, 0.52), 'head'),
    ('ear.R', (0.09, 0.2, 0.52), 'head'),
    ('tail', (0, -0.39, 0.37), 'body'),
    ('leg.FL', (-0.14, 0.15, 0.14), 'root'),
    ('leg.FR', (0.14, 0.15, 0.14), 'root'),
    ('leg.BL', (-0.14, -0.26, 0.14), 'root'),
    ('leg.BR', (0.14, -0.26, 0.14), 'root'),
]
S2 = 2 * math.pi
LEGS = ('leg.FL', 'leg.FR', 'leg.BL', 'leg.BR')


def tail(t, k=2, a=1.0):
    return {'rot': (14 * a * math.sin(S2 * k * t), 0, 26 * a * math.sin(S2 * k * t + 1.2)),
            'sc': (1, 1 + 0.2 * a * math.sin(S2 * k * t), 1)}


def breath(t, k=1, a=0.012):
    v = math.sin(S2 * k * t) * a
    return (1 + v / 2, 1, 1 + v)


def dig(t, f):
    p = S2 * 2 * t
    e = blink(t, 0.62)
    scrape = math.sin(p)
    d = {
        'body': {'rot': (-6 + 2 * math.sin(p), 2.5 * math.sin(p / 2), 0), 'sc': breath(t, 2)},
        'head': {'rot': (-32 + 6 * math.sin(2 * p), 0, 5 * math.sin(p / 2)), 'loc': (0, 0.025 * math.sin(2 * p), -0.02)},
        'ear.L': {'rot': (-14 + 10 * math.sin(2 * p + 0.6), 0, 0)},
        'ear.R': {'rot': (-14 + 10 * math.sin(2 * p + 0.9), 0, 0)},
        'tail': tail(t, 4, 0.7),
        'eyes': {'sc': (1, 1, 0.75 * e)},
        'leg.FL': {'rot': (-5 + 28 * scrape, 0, 0), 'loc': (0, 0, 0.03 * max(0.0, math.cos(p)))},
        'leg.FR': {'rot': (-5 - 28 * scrape, 0, 0), 'loc': (0, 0, 0.03 * max(0.0, -math.cos(p)))},
    }
    return d


def sniff(t, f):
    look = math.sin(S2 * t)
    sn = math.sin(S2 * 14 * t) * win(t, 0.05, 0.95, 0.1) * (0.5 + 0.5 * math.sin(S2 * 3 * t))
    e = blink(t, 0.4)
    return {
        'body': {'sc': breath(t, 2), 'rot': (-3, 0, 4 * look)},
        'head': {'rot': (-16 + 3 * sn, 0, 22 * look), 'loc': (0, 0.008 * sn, -0.01)},
        'ear.L': {'rot': (-6 + 4 * math.sin(S2 * 3 * t), 0, 0)},
        'ear.R': {'rot': (-6 + 4 * math.sin(S2 * 3 * t + 0.7), 0, 0)},
        'tail': tail(t, 3, 0.5),
        'eyes': {'sc': (1, 1, e)},
    }


def happy(t, f):
    pre = bump(t, 0.0, 0.2)
    u = (t - 0.18) / 0.32
    air = math.sin(math.pi * u) if 0 < u < 1 else 0.0
    land = bump(t, 0.48, 0.66)
    grunt = math.sin(S2 * 16 * t) * win(t, 0.5, 0.9, 0.05)
    hop2 = math.sin(math.pi * (t - 0.62) / 0.22) if 0.62 < t < 0.84 else 0.0
    d = {
        'root': {'loc': (0, 0, 0.14 * air + 0.06 * hop2)},
        'body': {'sc': (1 + 0.05 * (pre + land), 1, 1 - 0.1 * (pre + land) + 0.06 * air), 'rot': (6 * air, 0, 0)},
        'head': {'rot': (16 * win(t, 0.45, 0.95) + 3 * grunt, 0, 0)},
        'ear.L': {'rot': (-35 * air + 18 * land, 0, 0)},
        'ear.R': {'rot': (-35 * air + 18 * land, 0, 0)},
        'tail': tail(t, 8, 1.2),
        'eyes': {'sc': (1, 1, 1 - 0.6 * win(t, 0.15, 0.95))},
    }
    for L in LEGS:
        d[L] = {'rot': ((22 if 'F' in L else -22) * air, 0, 0)}
    return d


def sleep(t, f):
    br = math.sin(S2 * t)
    tw = bump(t, 0.7, 0.76)
    d = {
        'root': {'loc': (0, 0, 0)},
        'body': {'loc': (0, 0, -0.075), 'sc': (1 + 0.012 * br, 1, 1 + 0.03 * br), 'rot': (0, 3, 0)},
        'head': {'rot': (-10, 0, 6), 'loc': (0, 0.0, -0.05 - 0.004 * br)},
        'ear.L': {'rot': (-20, 0, 0)},
        'ear.R': {'rot': (-20 + 20 * tw, 0, -10 * tw)},
        'eyes': {'sc': (1, 1, 0.08)},
        'tail': {'rot': (-20, 0, 0), 'sc': (1, 0.8, 1)},
    }
    for L in LEGS:
        d[L] = {'sc': (1, 1, 0.3), 'loc': (0, 0, -0.075)}
    return d


def wag(t, f):
    p = S2 * 3 * t
    e = blink(t, 0.5)
    return {
        'body': {'rot': (0, 0, 4 * math.sin(p)), 'sc': breath(t, 1)},
        'head': {'rot': (12 + 2 * math.sin(S2 * 2 * t), 0, 6 * math.sin(S2 * t)), 'loc': (0, 0, 0.01)},
        'ear.L': {'rot': (12 + 4 * math.sin(p), 0, 0)},
        'ear.R': {'rot': (12 + 4 * math.sin(p + 0.5), 0, 0)},
        'tail': {'rot': (10, 0, 38 * math.sin(p)), 'sc': (1, 1.1, 1)},
        'eyes': {'sc': (1, 1, e)},
    }


def walk(t, f):
    p = S2 * t
    a, b = math.sin(p), -math.sin(p)
    la = 0.03 * max(0.0, math.cos(p))
    lb = 0.03 * max(0.0, -math.cos(p))
    return {
        'root': {'loc': (0, 0, 0.012 * abs(math.sin(p)))},
        'body': {'rot': (0, 3 * math.sin(p), 2 * math.sin(p))},
        'head': {'rot': (-6 + 4 * math.cos(2 * p), 0, 3 * math.sin(p))},
        'ear.L': {'rot': (12 * math.sin(2 * p - 1.0), 0, 0)},
        'ear.R': {'rot': (12 * math.sin(2 * p - 1.3), 0, 0)},
        'leg.FL': {'rot': (24 * a, 0, 0), 'loc': (0, 0, la)}, 'leg.BR': {'rot': (24 * a, 0, 0), 'loc': (0, 0, la)},
        'leg.FR': {'rot': (24 * b, 0, 0), 'loc': (0, 0, lb)}, 'leg.BL': {'rot': (24 * b, 0, 0), 'loc': (0, 0, lb)},
        'tail': tail(t, 2, 0.8),
    }


ANIMS = [('dig', 48, dig), ('sniff', 75, sniff), ('happy', 60, happy), ('sleep', 120, sleep), ('wag', 30, wag),
         ('walk', 27, walk)]


def main():
    K.reset()
    arm = K.armature(FID + '_rig', BONES)
    ob = build(1.0).object(arm)
    acts = [K.bake(arm, n, fr, fn) for n, fr, fn in ANIMS]
    K.report(FID, [ob], arm, acts)
    K.save_blend(FID)
    K.export_glb(FID, [arm, ob])
    st = K.stage()
    K.frame_cam((-0.3, -0.45, 0.0), (0.3, 0.5, 0.6))
    K.use_action(arm, acts[4], 0)
    K.render(f'{K.REN_DIR}/{FID}.png')
    K.strip(f'{K.REN_DIR}/{FID}_dig.png', arm, acts[0], (0, 12, 24, 36))
    K.strip(f'{K.REN_DIR}/{FID}_sleep.png', arm, acts[3], (0, 30, 60, 90))
    K.strip(f'{K.REN_DIR}/{FID}_happy.png', arm, acts[2], (6, 20, 34, 46))
    K.remove(st)
    K.save_blend(FID)


if __name__ == '__main__':
    main()
