# s:firefly — светлячок в банке «Огонёк»: стеклянная банка с пробкой, внутри тёплый янтарный светлячок.
# Свет — только яркость материала farm_glow (без лампы). design-v11 §12.3.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep, bump, win, blink, ease
from mathutils import Vector

FID = 'pet-firefly'
CORK = C('#c99559')
CORK_D = C('#a8763f')
TWINE = C('#e8cc8e')
MOSS = C('#6dbb4f')
MOSS_D = C('#4f9a3c')
FLY = C('#3b2f45')
FLY_T = C('#7a4630')
WHITE = C('#ffffff')
BLACK = C('#16151c')
FLY_C = 0.13


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_soft', 'farm_glass', 'farm_glow'], q)
    # банка (одна стенка, прозрачная)
    m.lathe([(0.001, 0.002), (0.07, 0.0), (0.088, 0.008), (0.096, 0.03), (0.098, 0.12), (0.096, 0.188), (0.086, 0.22),
             (0.067, 0.236), (0.06, 0.246), (0.066, 0.254), (0.068, 0.262), (0.062, 0.27)], seg=28, mat='farm_glass',
            bone='jar')
    # мох и травинки на дне
    m.sphere(0.074, loc=(0, 0, 0.01), scale=(1, 1, 0.3), seg=16, ring=6,
             color=lambda co: mix(MOSS_D, MOSS, sstep(0.01, 0.03, co.z)), bone='jar')
    for i, (a, h) in enumerate(((0.4, 0.05), (2.4, 0.04), (4.2, 0.055))):
        x, y = 0.04 * math.cos(a), 0.04 * math.sin(a)
        m.tube([(x, y, 0.024), (x * 1.08, y * 1.08, 0.024 + h * 0.45), (x * 1.3 + 0.006, y * 1.3, 0.024 + h * 0.8), (x * 1.55 + 0.014, y * 1.5, 0.024 + h)],
               [0.0042, 0.0034, 0.0024, 0.001], seg=5, color=MOSS, bone='jar')
    # пробка
    m.lathe([(0.001, 0.0), (0.056, 0.0), (0.06, 0.028), (0.065, 0.048), (0.061, 0.056), (0.001, 0.058)], seg=20,
            loc=(0, 0, 0.245), color=lambda co: mix(CORK, CORK_D, sstep(0.295, 0.302, co.z) * 0.6 + 0.2 * (math.sin(co.z * 900) > 0.6)),
            bone='cork')
    # бечёвка с бантиком
    m.torus(0.066, 0.0045, loc=(0, 0, 0.252), seg=28, rseg=6, color=TWINE, bone='jar')
    for s in (-1, 1):
        m.torus(0.014, 0.0035, loc=(0.014 * s, 0.072, 0.256), rot=(90, 0, 0), scale=(1.0, 0.7, 1), seg=12, rseg=5,
                color=TWINE, bone='jar')
        m.tube([(0.003 * s, 0.071, 0.25), (0.01 * s, 0.075, 0.232), (0.014 * s, 0.075, 0.214)], 0.0035, seg=5,
               color=TWINE, bone='jar')
    m.sphere(0.0055, loc=(0, 0.072, 0.252), seg=8, ring=6, color=TWINE, bone='jar')
    # светлячок: голова с большими глазами, грудка, светящееся брюшко, крылышки, усики
    o = Vector((0, 0, FLY_C))
    FS = 1.3
    m.sphere(0.019 * FS, loc=o + FS * Vector((0, 0.02, 0.004)), seg=14, ring=10, color=FLY, bone='fly')
    for s in (-1, 1):
        m.sphere(0.0085 * FS, loc=o + FS * Vector((0.0085 * s, 0.034, 0.009)), scale=(1, 0.7, 1.1), seg=10, ring=8, color=WHITE,
                 bone='fly')
        m.sphere(0.0052 * FS, loc=o + FS * Vector((0.0088 * s, 0.0395, 0.009)), scale=(1, 0.6, 1.15), seg=8, ring=6, color=BLACK,
                 bone='fly')
        m.tube([o + FS * Vector((0.006 * s, 0.03, 0.02)), o + FS * Vector((0.012 * s, 0.042, 0.034)), o + FS * Vector((0.02 * s, 0.05, 0.04))],
               [0.0026, 0.0024, 0.002], seg=4, color=FLY, bone='fly')
        m.sphere(0.0048, loc=o + FS * Vector((0.021 * s, 0.051, 0.041)), seg=6, ring=4, color=FLY, bone='fly')
        m.sphere(0.022 * FS, loc=o + FS * Vector((0.016 * s, -0.012, 0.016)), scale=(0.5, 1.0, 0.1), rot=(12, 0, 22 * s), seg=10,
                 ring=5, mat='farm_glass', bone='wing.' + ('L' if s < 0 else 'R'))
    m.sphere(0.0135 * FS, loc=o + FS * Vector((0, 0.002, 0.0)), seg=10, ring=8, color=FLY_T, bone='fly')
    m.sphere(0.026 * FS, loc=o + FS * Vector((0, -0.03, -0.004)), scale=(0.95, 1.25, 0.9), seg=14, ring=10, mat='farm_glow',
             bone='fly')
    return m


BONES = [
    ('root', (0, 0, 0), None, False),
    ('jar', (0, 0, 0.0), 'root'),
    ('cork', (0, 0, 0.255), 'jar'),
    ('fly', (0, 0, FLY_C), 'jar'),
    ('wing.L', (-0.006, -0.002, FLY_C + 0.016), 'fly'),
    ('wing.R', (0.006, -0.002, FLY_C + 0.016), 'fly'),
]
S2 = 2 * math.pi


def wings(t, k=30, a=38):
    w = a * math.sin(S2 * k * t)
    return {'wing.L': {'rot': (0, 10 + w, 0)}, 'wing.R': {'rot': (0, -10 - w, 0)}}


def idle(t, f):
    a = S2 * 2 * t
    d = {
        'jar': {'rot': (1.2 * math.sin(S2 * 2 * t), 2.2 * math.sin(S2 * t), 0)},
        'fly': {'loc': (0.042 * math.cos(a), 0.042 * math.sin(a), 0.025 * math.sin(S2 * 3 * t)),
                'rot': (6 * math.sin(S2 * 3 * t), 0, math.degrees(a)),
                'sc': 1 + 0.05 * math.sin(S2 * 6 * t)},
        'cork': {'rot': (0, 0, 0)},
    }
    d.update(wings(t, 36))
    return d


def hop(t, f):
    pre = bump(t, 0.0, 0.18)
    u = (t - 0.14) / 0.66
    air = math.sin(math.pi * u) if 0 < u < 1 else 0.0
    land = bump(t, 0.78, 1.0)
    d = {
        'root': {'loc': (0, 0, 0.075 * air)},
        'jar': {'sc': (1 + 0.06 * (pre + land), 1 + 0.06 * (pre + land), 1 - 0.1 * (pre + land) + 0.05 * air),
                'rot': (-7 * air, 0, 0)},
        'cork': {'loc': (0, 0, 0.012 * bump(t, 0.8, 0.95))},
        'fly': {'loc': (0, 0, -0.03 * math.sin(math.pi * max(0.0, min(1.0, (t - 0.2) / 0.6))) + 0.02 * land),
                'rot': (10 * air, 0, 0)},
    }
    d.update(wings(t, 12))
    return d


# happy: пробка вылетает, светлячок делает круг над хозяином (центр круга — 1,4 м впереди, 1,95 м над землёй)
CIRC_C = Vector((0, 1.4, 1.95 - FLY_C))
CIRC_R = 0.55
TOP = Vector((0, 0, 0.2))


def bez(p0, p1, p2, p3, u):
    v = 1 - u
    return p0 * v ** 3 + p1 * 3 * v * v * u + p2 * 3 * v * u * u + p3 * u ** 3


def fly_path(t):
    if t < 0.1:
        return Vector((0, 0, 0.01 * math.sin(S2 * 4 * t)))
    if t < 0.2:
        return TOP * ease((t - 0.1) / 0.1)
    start = CIRC_C + Vector((CIRC_R, 0, 0))
    if t < 0.32:
        u = ease((t - 0.2) / 0.12)
        return bez(TOP, TOP + Vector((0, 0.2, 0.9)), start + Vector((0.2, -0.6, 0)), start, u)
    if t < 0.72:
        ph = S2 * (t - 0.32) / 0.4
        return CIRC_C + Vector((CIRC_R * math.cos(ph), CIRC_R * math.sin(ph), 0.1 * math.sin(2 * ph)))
    if t < 0.84:
        u = ease((t - 0.72) / 0.12)
        return bez(start, start + Vector((0.2, -0.6, 0)), TOP + Vector((0, 0.3, 0.8)), TOP, u)
    if t < 0.92:
        return TOP * (1 - ease((t - 0.84) / 0.08))
    return Vector((0, 0, 0))


_yaw = {'prev': None}


def happy(t, f):
    p = fly_path(t)
    d1 = fly_path(min(1.0, t + 0.004)) - fly_path(max(0.0, t - 0.004))
    yaw = math.degrees(math.atan2(-d1.x, d1.y)) if d1.xy.length > 1e-4 else (_yaw['prev'] or 0.0)
    if f == 0:
        _yaw['prev'] = None
    if _yaw['prev'] is not None:
        while yaw - _yaw['prev'] > 180:
            yaw -= 360
        while yaw - _yaw['prev'] < -180:
            yaw += 360
    if t < 0.12 or t > 0.9:
        yaw = 0.0 if t < 0.12 else yaw * (1 - ease((t - 0.9) / 0.06))
    _yaw['prev'] = yaw
    out = win(t, 0.18, 0.86, 0.05)
    # пробка: хлоп — кувырок — легла на горлышко набок — в конце защёлкивается обратно
    up = (t - 0.08) / 0.22
    cz = 0.2 * math.sin(math.pi * up) if 0 < up < 1 else 0.0
    spin = 720 * ease(up)
    ajar = sstep(0.27, 0.31, t) * (1 - sstep(0.93, 0.97, t))
    snap = bump(t, 0.93, 0.99)
    pre = bump(t, 0.0, 0.09)
    cheer = bump(t, 0.92, 1.0)
    d = {
        'jar': {'sc': (1 + 0.06 * pre, 1 + 0.06 * pre, 1 - 0.1 * pre + 0.04 * cheer), 'rot': (5 * out, 0, 0)},
        'cork': {'loc': (0.034 * ajar, 0, cz + 0.006 * ajar + 0.03 * snap), 'rot': (spin, 32 * ajar, 0)},
        'fly': {'loc': tuple(p), 'rot': (0, 0, yaw), 'sc': 1 + 0.9 * out},
        'root': {'loc': (0, 0, 0.04 * math.sin(math.pi * max(0.0, min(1.0, (t - 0.93) / 0.07))))},
    }
    d.update(wings(t, 48))
    return d


def sit(t, f):
    d = {
        'fly': {'loc': (0, 0.0, -0.088), 'rot': (0, 0, 20 * math.sin(S2 * t)), 'sc': 0.95 + 0.04 * math.sin(S2 * 2 * t)},
        'jar': {'sc': (1, 1, 1 + 0.005 * math.sin(S2 * t))},
    }
    d.update({'wing.L': {'rot': (0, -4, 0)}, 'wing.R': {'rot': (0, 4, 0)}})
    return d


ANIMS = [('idle', 90, idle), ('follow', 18, hop), ('happy', 108, happy), ('sit', 60, sit)]


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
    K.frame_cam((-0.11, -0.11, 0.0), (0.11, 0.11, 0.31))
    K.use_action(arm, acts[0], 0)
    K.render(f'{K.REN_DIR}/{FID}.png')
    K.frame_cam((-0.7, -0.2, 0.0), (0.7, 2.0, 2.2), view=(1.0, 0.25, 0.3))
    K.strip(f'{K.REN_DIR}/{FID}_happy.png', arm, acts[2], (6, 30, 52, 92))
    K.remove(st)
    lod.hide_render = False
    K.save_blend(FID)


if __name__ == '__main__':
    main()
