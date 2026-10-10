# s:beetle — жук «Клёпа»: круглая бронзово-зелёная бронзовка, на спинке точки-заклёпки, усы-антенны (§12.3).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep, bump, win, blink, ease

FID = 'pet-beetle'
GREEN = C('#3fb25e')
GREEN_D = C('#23804a')
BRONZE = C('#c28a36')
COPPER = C('#b8742e')
UNDER = C('#6b4a24')
LEG = C('#4a3a26')
BLACK = C('#16151c')
WHITE = C('#ffffff')
WING = C('#e9dcc0')
RIVET = C('#f0c060')
BLUSH = C('#ff8aa0')

ELY_C = 0.105


def shell_col(co):
    # зелёный в центре спинки, к краям — бронза
    edge = sstep(0.06, 0.105, abs(co.x)) * 0.6 + sstep(0.11, 0.06, co.z) * 0.5
    return mix(GREEN, BRONZE, edge)


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_shell'], q)
    # брюшко снизу
    m.sphere(0.095, loc=(0, -0.02, 0.058), scale=(0.98, 1.15, 0.36), seg=14, ring=6, color=UNDER, bone='body')
    # надкрылья — две половинки круглого купола, шов посередине
    EZ = 0.06
    for s, side in ((-1, 'L'), (1, 'R')):
        def ely(co, s=s):
            # половинка общего купола: внутренняя сторона — плоская стенка по шву
            z = co.z if co.z > 0 else co.z * 0.3
            x = max(co.x, 0.0) if s > 0 else min(co.x, 0.0)
            return (x + 0.0025 * s, co.y, z)
        m.sphere(0.112, loc=(0, -0.022, EZ), scale=(0.95, 1.0, 0.98), seg=20, ring=10, deform=ely,
                 color=shell_col, bone='ely.' + side)
        # заклёпки: два ряда по спинке
        for (dx, dy) in ((0.028, 0.03), (0.032, -0.022), (0.028, -0.072), (0.066, 0.008), (0.062, -0.048)):
            x, y = dx * s, dy - 0.022
            lx = x / 0.106
            ly = (y + 0.022) / 0.112
            zz = 0.112 * 0.98 * math.sqrt(max(0.0, 1 - lx * lx - ly * ly))
            if q > 0.7 or dx < 0.05:
                m.sphere(0.0085, loc=(x, y, EZ + zz - 0.002), scale=(1, 1, 0.55), seg=6, ring=4, color=RIVET,
                         bone='ely.' + side)
        # крылья под надкрыльями (видны, когда раскрыт)
        m.sphere(0.07, loc=(0.03 * s, -0.045, 0.125), scale=(0.42, 1.0, 0.06), seg=12, ring=5,
                 deform=lambda co: (co.x, co.y * (1.1 if co.y < 0 else 0.9), co.z), color=WING, bone='wing.' + side)
    # переднеспинка — полукупол перед надкрыльями
    m.sphere(0.07, loc=(0, 0.072, 0.058), scale=(1.12, 0.72, 1.0),
             deform=lambda co: (co.x, co.y, co.z if co.z > 0 else co.z * 0.3), seg=14, ring=8,
             color=lambda co: mix(GREEN_D, COPPER, sstep(0.05, 0.08, abs(co.x)) * 0.5), bone='body')
    # голова
    HC = (0, 0.118, 0.06)
    m.sphere(0.045, loc=HC, scale=(1.1, 0.9, 0.9), seg=14, ring=8, color=GREEN_D, bone='head')
    for s, side in ((-1, 'L'), (1, 'R')):
        ex, ey, ez = 0.025 * s, 0.152, 0.07
        m.sphere(0.0175, loc=(ex, ey, ez), scale=(0.9, 0.6, 1.15), rot=(0, 0, -28 * s), seg=12, ring=8, color=BLACK,
                 bone='head')
        m.sphere(0.0052, loc=(ex - 0.004, ey + 0.009, ez + 0.007), seg=8, ring=6, color=WHITE, bone='head')
        m.disc(0.011, loc=(0.04 * s, 0.14, 0.05), rot=(-90, 0, -50 * s), scale=(1, 0.6, 1), seg=10, thick=0.008,
               color=BLUSH, bone='head')
        # усы-антенны с булавой
        b = 'ant.' + side
        pts = [(0.014 * s, 0.15, 0.09), (0.022 * s, 0.168, 0.12), (0.034 * s, 0.184, 0.145), (0.05 * s, 0.198, 0.158)]
        m.tube(pts, [0.006, 0.0054, 0.0048, 0.0042], seg=6, color=LEG, bone=b)
        m.sphere(0.0125, loc=(0.055 * s, 0.204, 0.163), scale=(1, 0.8, 1.2), rot=(25, 0, -30 * s), seg=10, ring=6,
                 color=BRONZE, bone=b)
    # ножки — короткие и крепкие: бедро вбок, голень вниз; передние — отдельная кость (чистит усы)
    for s in (-1, 1):
        for y, b in ((0.08, 'leg.F'), (0.0, 'leg.' + ('L' if s < 0 else 'R')), (-0.07, 'leg.' + ('L' if s < 0 else 'R'))):
            fy = y + (0.025 if y > 0.05 else (-0.02 if y < -0.05 else 0.0))
            pts = [(0.05 * s, y, 0.05), (0.082 * s, y + (fy - y) * 0.5, 0.05), (0.096 * s, fy, 0.024), (0.1 * s, fy, 0.007)]
            m.tube(pts, [0.0115, 0.0105, 0.009, 0.008], seg=5, color=LEG, bone=b)
            m.sphere(0.0095, loc=(0.101 * s, fy + 0.004, 0.006), scale=(1, 1.3, 0.7), seg=6, ring=4, color=LEG, bone=b)
    return m


BONES = [
    ('root', (0, 0, 0), None, False),
    ('body', (0, 0, 0.05), 'root'),
    ('head', (0, 0.1, 0.06), 'body'),
    ('ant.L', (-0.014, 0.15, 0.09), 'head'),
    ('ant.R', (0.014, 0.15, 0.09), 'head'),
    ('ely.L', (-0.003, 0.05, 0.164), 'body'),
    ('ely.R', (0.003, 0.05, 0.164), 'body'),
    ('wing.L', (-0.02, 0.02, 0.128), 'body'),
    ('wing.R', (0.02, 0.02, 0.128), 'body'),
    ('leg.F', (0, 0.08, 0.05), 'body'),
    ('leg.L', (-0.05, -0.035, 0.05), 'body'),
    ('leg.R', (0.05, -0.035, 0.05), 'body'),
]
S2 = 2 * math.pi


def idle(t, f):
    cl = win(t, 0.1, 0.62, 0.08)
    rub = math.sin(S2 * 9 * t) * cl
    look = bump(t, 0.68, 0.95)
    br = math.sin(S2 * 2 * t) * 0.012
    return {
        'body': {'sc': (1 + br / 2, 1, 1 + br), 'rot': (-4 * cl, 0, 0)},
        'head': {'rot': (-10 * cl, 0, 16 * look - 6 * rub * cl)},
        'leg.F': {'rot': (62 * cl, 0, 0), 'loc': (0, 0.012 * cl, 0.028 * cl + 0.006 * rub)},
        'ant.L': {'rot': (-36 * cl + 8 * rub, 0, -10 * cl)},
        'ant.R': {'rot': (-36 * cl - 8 * rub, 0, 10 * cl)},
        'ely.L': {'rot': (0, 2 * bump(t, 0.75, 0.85), 0)},
        'ely.R': {'rot': (0, -2 * bump(t, 0.75, 0.85), 0)},
    }


def scurry(t, f):
    p = S2 * 2 * t
    a = math.sin(p)
    return {
        'root': {'loc': (0, 0, 0.005 * abs(math.cos(p)))},
        'body': {'rot': (0, 3 * a, 0)},
        'head': {'rot': (0, 0, 4 * a)},
        'leg.L': {'rot': (0, 0, 26 * a), 'loc': (0, 0, 0.008 * max(0.0, math.cos(p)))},
        'leg.R': {'rot': (0, 0, 26 * a), 'loc': (0, 0, 0.008 * max(0.0, -math.cos(p)))},
        'leg.F': {'rot': (14 * math.sin(p + 1.5), 0, 0)},
        'ant.L': {'rot': (10 * math.sin(p + 0.8), 0, 0)},
        'ant.R': {'rot': (10 * math.sin(p + 1.2), 0, 0)},
    }


def opened(k, flap):
    return {
        'ely.L': {'rot': (-14 * k, 62 * k, 0)},
        'ely.R': {'rot': (-14 * k, -62 * k, 0)},
        'wing.L': {'rot': (-(18 + 30 * flap) * k, 0, -70 * k), 'loc': (0, 0.0, 0.02 * k)},
        'wing.R': {'rot': (-(18 + 30 * flap) * k, 0, 70 * k), 'loc': (0, 0.0, 0.02 * k)},
    }


def fly(t, f):
    # короткий перелёт (одноразовый, 1,2 с): раскрыл надкрылья — взлёт — жужжит — сел
    k = win(t, 0.0, 1.0, 0.16)
    flap = math.sin(S2 * 30 * t)
    up = math.sin(math.pi * ease((t - 0.1) / 0.8)) if 0.1 < t < 0.9 else 0.0
    d = {
        'root': {'loc': (0, 0, 0.32 * up + 0.012 * flap * up), 'rot': (-14 * up, 0, 0)},
        'leg.L': {'rot': (0, 0, -20 * up)}, 'leg.R': {'rot': (0, 0, 20 * up)},
        'leg.F': {'rot': (-25 * up, 0, 0)},
        'ant.L': {'rot': (-20 * up, 0, -12 * up)}, 'ant.R': {'rot': (-20 * up, 0, 12 * up)},
        'body': {'sc': (1, 1, 1 - 0.08 * bump(t, 0.0, 0.1) - 0.1 * bump(t, 0.88, 1.0))},
    }
    d.update(opened(k, flap))
    return d


def happy(t, f):
    k = win(t, 0.05, 0.9, 0.12)
    flap = math.sin(S2 * 24 * t)
    u = (t - 0.3) / 0.35
    hop = math.sin(math.pi * u) if 0 < u < 1 else 0.0
    sq = bump(t, 0.18, 0.32) + bump(t, 0.63, 0.78)
    d = {
        'root': {'loc': (0, 0, 0.12 * hop)},
        'body': {'sc': (1 + 0.06 * sq, 1, 1 - 0.14 * sq + 0.08 * hop)},
        'head': {'rot': (12 * hop, 0, 0)},
        'ant.L': {'rot': (-15 * hop + 10 * math.sin(S2 * 6 * t) * k, 0, -18 * k)},
        'ant.R': {'rot': (-15 * hop + 10 * math.sin(S2 * 6 * t + 1) * k, 0, 18 * k)},
        'leg.F': {'rot': (30 * hop, 0, 0)},
        'leg.L': {'rot': (0, 0, -12 * hop)}, 'leg.R': {'rot': (0, 0, 12 * hop)},
    }
    d.update(opened(k, flap))
    return d


def sit(t, f):
    br = math.sin(S2 * t) * 0.015
    return {
        'body': {'loc': (0, 0, -0.03), 'sc': (1, 1, 1 + br)},
        'leg.L': {'rot': (0, 38, 0)},
        'leg.R': {'rot': (0, -38, 0)},
        'leg.F': {'rot': (-20, 0, 0)},
        'head': {'rot': (-6, 0, 0)},
        'ant.L': {'rot': (-25 + 5 * math.sin(S2 * 2 * t), 0, 0)},
        'ant.R': {'rot': (-25 + 5 * math.sin(S2 * 2 * t + 1), 0, 0)},
    }


ANIMS = [('idle', 90, idle), ('follow', 12, scurry), ('fly', 36, fly), ('happy', 45, happy), ('sit', 60, sit)]


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
    K.frame_cam((-0.14, -0.16, 0.0), (0.14, 0.24, 0.24))
    K.use_action(arm, acts[0], 0)
    K.render(f'{K.REN_DIR}/{FID}.png')
    K.frame_cam((-0.2, -0.2, 0.0), (0.2, 0.24, 0.4))
    K.strip(f'{K.REN_DIR}/{FID}_happy.png', arm, acts[3], (2, 14, 22, 40))
    K.strip(f'{K.REN_DIR}/{FID}_idle.png', arm, acts[0], (0, 20, 34, 70))
    K.remove(st)
    lod.hide_render = False
    K.save_blend(FID)


if __name__ == '__main__':
    main()
