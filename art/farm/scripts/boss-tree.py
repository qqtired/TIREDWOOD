# Босс «Древо разлома» (design-v11 §11, §16.5): старое ворчливое Древо 8,5 м с лицом в коре — моховые брови,
# нос-сучок, рот-дупло, ветки-руки. Без шипов и красных глаз — смешное, а не страшное.
# Скелет: ствол 3 кости, 4 ветки по 3, лицо 6 (брови, веки, рот, нос) + корни и root.
# Фазы: кора и мох — цвет в вершинах светлый, оттенок даёт цвет материала (tree_bark / tree_moss, игра плавно
# ведёт его от серого к живому по полосе «Цветение»); почки, листва, цветы — отдельные сетки-слои на том же скелете.
import sys, os, math, random, json, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import charkit as K
from charkit import C, mix, sstep, bump, win, ease, blink
from mathutils import Vector

FID = 'boss-tree'
S2 = 2 * math.pi

# оттенки фаз (линейный RGB): серое → почки → листва → цветёт → полное цветение
BARK_TINT = [(0.3, 0.29, 0.27), (0.32, 0.26, 0.2), (0.36, 0.23, 0.13), (0.38, 0.23, 0.12), (0.4, 0.24, 0.12)]
MOSS_TINT = [(0.34, 0.37, 0.31), (0.33, 0.45, 0.22), (0.27, 0.55, 0.15), (0.28, 0.6, 0.15), (0.3, 0.66, 0.16)]

K.MATS.update({
    'tree_bark': dict(rough=0.78, coat=0.0, coat_r=0.3),
    'tree_moss': dict(rough=0.85, coat=0.0, coat_r=0.3),
    'tree_face': dict(rough=0.25, coat=0.5, coat_r=0.08),
    'tree_leaves': dict(rough=0.55, coat=0.15, coat_r=0.3),
    'tree_blossom': dict(rough=0.45, coat=0.2, coat_r=0.2),
})

TRUNK = [(1.22, 0.0), (1.0, 0.25), (0.9, 0.7), (0.86, 1.5), (0.84, 2.4), (0.83, 3.2), (0.85, 3.9), (0.82, 4.6),
         (0.74, 5.2), (0.6, 5.65), (0.38, 5.95), (0.001, 6.05)]
TRUNK_PTS = K.catmull(TRUNK, 22)

ARM_L = [(-0.62, 0.0, 2.3), (-1.45, 0.05, 2.5), (-2.15, 0.12, 2.85), (-2.55, 0.18, 3.4)]
ARM_R = [(-x, y, z) for (x, y, z) in ARM_L]
ARM_RAD = [0.36, 0.27, 0.19, 0.12]
TOP_L = [(-0.2, -0.05, 5.35), (-0.85, -0.15, 6.25), (-1.45, -0.2, 7.05), (-1.7, -0.15, 7.85)]
TOP_R = [(0.2, -0.05, 5.35), (0.78, -0.1, 6.35), (1.3, -0.05, 7.2), (1.4, 0.02, 8.05)]
TOP_RAD = [0.34, 0.25, 0.16, 0.08]
TWIGS = {
    'armL': [((-2.55, 0.18, 3.4), (-2.7, 0.38, 3.95)), ((-2.55, 0.18, 3.4), (-3.08, 0.15, 3.75)),
             ((-2.55, 0.18, 3.4), (-2.8, -0.12, 3.88))],
    'topL': [((-1.7, -0.15, 7.85), (-1.45, 0.05, 8.4)), ((-1.7, -0.15, 7.85), (-2.15, -0.25, 8.2)),
             ((-0.85, -0.15, 6.25), (-1.55, 0.1, 6.55)), ((-1.45, -0.2, 7.05), (-0.95, 0.0, 7.75)),
             ((-1.2, -0.18, 6.7), (-1.5, -0.6, 7.2))],
    'topR': [((1.4, 0.02, 8.05), (1.15, 0.15, 8.55)), ((1.4, 0.02, 8.05), (1.85, -0.05, 8.35)),
             ((0.78, -0.1, 6.35), (1.5, 0.05, 6.7)), ((1.3, -0.05, 7.2), (0.8, 0.05, 7.9)),
             ((1.05, -0.08, 6.8), (1.25, -0.55, 7.35))],
}
TWIGS['armR'] = [((-a[0], a[1], a[2]), (-b[0], b[1], b[2])) for a, b in TWIGS['armL']]

EYE_Z = 4.2
EYE_X = 0.32
FACE_Y = 0.79
MOUTH_C = (0, 0.8, 3.3)
NOSE_C = (0, 0.9, 3.86)


def trunk_r(z):
    pts = TRUNK_PTS
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        if z <= b[1]:
            return a[0] + (z - a[1]) / max(1e-6, b[1] - a[1]) * (b[0] - a[0])
    return 0.0


def face_mask(co):
    a = math.atan2(co.x, co.y)
    return (1 - sstep(0.5, 0.85, abs(a))) * sstep(2.95, 3.25, co.z) * (1 - sstep(4.55, 4.85, co.z))


def trunk_w(co):
    z = co.z
    w3 = sstep(2.6, 3.4, z)
    w1 = 1 - sstep(1.0, 2.0, z)
    return {'trunk1': w1, 'trunk2': max(0.0, 1 - w1 - w3), 'trunk3': w3}


def arm_w(side):
    def f(co):
        ax = abs(co.x)
        w3 = sstep(1.95, 2.3, ax)
        w1 = 1 - sstep(1.2, 1.6, ax)
        return {f'arm{side}1': w1, f'arm{side}2': max(0.0, 1 - w1 - w3), f'arm{side}3': w3}
    return f


def top_w(side):
    def f(co):
        z = co.z
        w1 = 1 - sstep(5.9, 6.6, z)
        w3 = sstep(6.9, 7.5, z)
        return {f'top{side}1': w1, f'top{side}2': max(0.0, 1 - w1 - w3), f'top{side}3': w3}
    return f


def branch_w(name):
    return {'armL': arm_w('L'), 'armR': arm_w('R'), 'topL': top_w('L'), 'topR': top_w('R')}[name]


def bark_col(co):
    a = math.atan2(co.x, co.y)
    g = math.sin(a * 9 + co.z * 0.9 + 0.6 * math.sin(co.z * 2.1))
    v = 0.86 - 0.3 * sstep(0.3, 1.0, -g) + 0.08 * sstep(0.5, 1.0, g)
    v -= 0.12 * (1 - sstep(0.0, 0.6, co.z))
    return (v, v * 0.98, v * 0.95, 1.0)


def bark_line(co):
    g = math.sin(co.x * 7 + co.y * 5 + co.z * 6)
    v = 0.84 - 0.22 * sstep(0.4, 1.0, g)
    return (v, v * 0.98, v * 0.95, 1.0)


def moss_col(co):
    v = 0.86 + 0.14 * math.sin(co.x * 23 + co.z * 17) * math.cos(co.y * 19)
    return (v * 0.95, v, v * 0.85, 1.0)


def build_base(q=1.0):
    m = K.Mesh(FID, ['tree_bark', 'tree_moss', 'tree_face'], q)

    def ridges(co):
        a = math.atan2(co.x, co.y)
        amp = 0.045 * (1 - face_mask(co)) * (1 - sstep(5.6, 6.0, co.z))
        k = 1 + amp * math.sin(a * 9 + co.z * 0.9 + 0.6 * math.sin(co.z * 2.1))
        lean = 0.12 * math.sin(co.z / 6.0 * math.pi)
        return (co.x * k + lean, co.y * k - 0.05 * math.sin(co.z * 0.8), co.z)
    m.lathe(TRUNK_PTS, seg=30, deform=ridges, color=bark_col, mat='tree_bark', bone=trunk_w)
    # корни (кость roots: «разворачиваются» при появлении)
    rnd = random.Random(4)
    for i, a in enumerate((0.55, 1.55, 2.6, 3.6, 4.6, 5.6)):
        a += rnd.uniform(-0.15, 0.15)
        L = rnd.uniform(1.9, 2.4)
        pts, rads = [], []
        for j in range(6):
            u = j / 5
            r = 0.75 + (L - 0.75) * u
            z = 0.55 * (1 - u) ** 1.6 - 0.12 * u
            pts.append((r * math.sin(a + 0.15 * u), r * math.cos(a + 0.15 * u), z))
            rads.append(0.34 * (1 - u) + 0.06 * u)
        m.tube(pts, rads, seg=8, color=bark_line, mat='tree_bark', bone='roots')
    # ветки-руки и верхние ветки
    for name, pts, rads, nseg in (('armL', ARM_L, ARM_RAD, 12), ('armR', ARM_R, ARM_RAD, 12), ('topL', TOP_L, TOP_RAD, 10),
                                  ('topR', TOP_R, TOP_RAD, 10)):
        m.tube(pts, rads, seg=nseg, color=bark_line, mat='tree_bark', bone=branch_w(name))
        for a, b in TWIGS[name]:
            mid = tuple((a[i] + b[i]) / 2 + (0.08 if i == 2 else 0) for i in range(3))
            m.tube([a, mid, b], [0.075, 0.05, 0.022], seg=6, color=bark_line, mat='tree_bark', bone=branch_w(name))
    # лицо: глаза, веки, брови, нос, рот-дупло
    for s, side in ((-1, 'L'), (1, 'R')):
        ex = EYE_X * s
        m.sphere(0.235, loc=(ex, FACE_Y, EYE_Z), scale=(1, 0.45, 1.2), seg=16, ring=10, color=C('#fbf7ee'), mat='tree_face',
                 bone='trunk3')
        m.sphere(0.115, loc=(ex - 0.012 * s, FACE_Y + 0.095, EYE_Z - 0.03), scale=(1, 0.45, 1.15), seg=12, ring=8,
                 color=C('#17141a'), mat='tree_face', bone='trunk3')
        m.sphere(0.036, loc=(ex - 0.012 * s - 0.045, FACE_Y + 0.14, EYE_Z + 0.02), seg=8, ring=6, color=C('#ffffff'),
                 mat='tree_face', bone='trunk3')
        # верхнее веко (кора): покой — прикрыто наполовину (ворчит), sc z 2 — закрыто, 0.35 — распахнуто
        m.sphere(0.275, loc=(ex, FACE_Y + 0.02, EYE_Z), scale=(1.08, 0.5, 1.03), seg=16, ring=8,
                 deform=lambda co: (co.x, co.y, max(co.z, 0.0)), color=bark_line, mat='tree_bark', bone='lid.' + side)
        for j in range(4):
            u = j / 3
            x = (0.1 + 0.42 * u) * s
            z = 4.47 + 0.16 * u - 0.05 * u * u
            y = trunk_r(z) + 0.02 - 0.12 * u * u
            m.sphere(0.11 - 0.025 * u, loc=(x, y, z), scale=(1.25, 0.8, 0.82), rot=(0, (-18 - 10 * u) * s, 0), seg=10,
                     ring=7, deform=lambda co: (co.x, co.y, co.z * (1 + 0.15 * math.sin(co.x * 60))), color=moss_col,
                     mat='tree_moss', bone='brow.' + side)
    m.sphere(0.21, loc=NOSE_C, scale=(0.85, 0.95, 1.08), rot=(18, 0, 0), seg=12, ring=9,
             deform=lambda co: (co.x * (1 + 0.1 * math.sin(co.z * 40)), co.y, co.z * (1 + 0.08 * math.sin(co.x * 50))),
             color=bark_line, mat='tree_bark', bone='nose')
    m.torus(0.26, 0.085, loc=MOUTH_C, rot=(90, 0, 0), scale=(1.25, 0.85, 1.0), seg=22, rseg=8, color=bark_line,
            mat='tree_bark', bone='mouth')
    m.sphere(0.28, loc=(MOUTH_C[0], MOUTH_C[1] - 0.05, MOUTH_C[2]), scale=(1.22, 0.32, 0.78), seg=16, ring=7,
             color=lambda co: C('#5a3324') if co.z < MOUTH_C[2] - 0.12 else C('#24160f'), mat='tree_face', bone='mouth')
    # мох на стволе
    for (a, z, r) in ((-1.9, 0.6, 0.32), (2.4, 0.4, 0.28), (1.2, 2.2, 0.22), (-1.1, 5.1, 0.26), (0.9, 5.35, 0.22),
                      (3.0, 3.4, 0.3)):
        rr = trunk_r(z)
        p = (rr * math.sin(a), rr * math.cos(a), z)
        m.sphere(r, loc=p, scale=(1, 1, 0.55), rot=(0, 0, -math.degrees(a)), seg=10, ring=6,
                 deform=lambda co: (co.x * (1 + 0.2 * math.sin(co.y * 30)), co.y, co.z), color=moss_col, mat='tree_moss',
                 bone=lambda co, w=trunk_w(Vector(p)): w)
    return m


def branch_samples(name, pts, rads, count, rnd):
    """Точки на поверхности ветки (для почек и цветов): (точка, наружу, вес)."""
    out = []
    segs = list(zip(pts, pts[1:], rads, rads[1:]))
    for twig in TWIGS[name]:
        segs.append((twig[0], twig[1], 0.07, 0.025))
    for i in range(count):
        a, b, ra, rb = segs[i % len(segs)]
        u = rnd.uniform(0.25, 1.0)
        p = Vector(a).lerp(Vector(b), u)
        r = ra + (rb - ra) * u
        d = (Vector(b) - Vector(a)).normalized()
        n = d.orthogonal().normalized()
        ang = rnd.uniform(0, S2)
        n = (n * math.cos(ang) + d.cross(n) * math.sin(ang)).normalized()
        if n.z < -0.3:
            n.z = -n.z
        out.append((p + n * r * 0.85, n, branch_w(name)(p)))
    return out


CLUMPS = [
    ('topL', (-0.9, -0.15, 6.35), 0.75), ('topL', (-1.5, -0.2, 7.1), 0.85), ('topL', (-1.7, -0.12, 7.95), 0.75),
    ('topL', (-1.6, 0.1, 6.6), 0.55), ('topL', (-0.95, 0.05, 7.8), 0.65),
    ('topR', (0.8, -0.1, 6.45), 0.72), ('topR', (1.32, -0.05, 7.25), 0.85), ('topR', (1.38, 0.04, 8.1), 0.72),
    ('topR', (1.55, 0.05, 6.75), 0.55), ('topR', (0.82, 0.06, 7.95), 0.65),
    ('trunk', (0.0, -0.3, 6.9), 0.95), ('trunk', (0.0, 0.0, 8.15), 0.8),
    ('armL', (-2.75, 0.15, 3.85), 0.46), ('armR', (2.75, 0.15, 3.85), 0.46),
]


def clump_w(name, p):
    if name == 'trunk':
        return {'trunk3': 1.0}
    return branch_w(name)(Vector(p))


def leaf_col(co, c, r):
    k = sstep(-0.4, 0.8, (co.z - c[2]) / r) * 0.6 + 0.4 * sstep(-0.2, 0.8, (co.y - c[1]) / r)
    return mix(C('#3f8f3a'), C('#8fd25e'), k)


def build_leaves(q=1.0):
    m = K.Mesh(FID + '_leaves', ['tree_leaves'], q)
    for name, c, r in CLUMPS:
        w = clump_w(name, c)

        def lump(co, r=r):
            k = 1 + 0.13 * math.sin(co.x / r * 5.0 + 1) * math.sin(co.y / r * 4.6) * math.sin(co.z / r * 5.3 + 2)
            return (co.x * k, co.y * k, co.z * k * 0.85)
        m.sphere(r, loc=c, seg=12, ring=8, deform=lump, color=lambda co, c=c, r=r: leaf_col(co, c, r),
                 bone=lambda co, w=w: w)
    return m


def build_buds(q=1.0):
    m = K.Mesh(FID + '_buds', ['tree_leaves'], q)
    rnd = random.Random(9)
    for name, pts, rads, cnt in (('armL', ARM_L, ARM_RAD, 8), ('armR', ARM_R, ARM_RAD, 8), ('topL', TOP_L, TOP_RAD, 12),
                                 ('topR', TOP_R, TOP_RAD, 12)):
        for p, n, w in branch_samples(name, pts, rads, cnt, rnd):
            rot = tuple(math.degrees(a) for a in Vector((0, 0, 1)).rotation_difference(n).to_euler('XYZ'))
            m.sphere(0.075, loc=p + n * 0.04, scale=(0.75, 0.75, 1.35), rot=rot, seg=6, ring=4,
                     color=lambda co, p=p: mix(C('#9fd45a'), C('#e8f59a'), 0.5), bone=lambda co, w=w: w)
    return m


def blossom(m, p, n, w, size, rnd, petal):
    rot = tuple(math.degrees(a) for a in Vector((0, 0, 1)).rotation_difference(n).to_euler('XYZ'))
    spin = rnd.uniform(0, 72)

    def petals(co):
        a = math.atan2(co.y, co.x) + math.radians(spin)
        k = 0.62 + 0.38 * abs(math.cos(2.5 * a))
        return (co.x * k, co.y * k, co.z)
    m.sphere(size, loc=p, scale=(1, 1, 0.22), rot=rot, seg=10, ring=3, deform=petals, color=petal, bone=lambda co: w)
    m.sphere(size * 0.32, loc=p + n * size * 0.16, scale=(1, 1, 0.6), rot=rot, seg=5, ring=3, color=C('#ffd34a'),
             bone=lambda co: w)


def flower_points(rnd, count):
    out = []
    for i in range(count):
        name, c, r = CLUMPS[i % len(CLUMPS)]
        while True:
            v = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
            if v.z > -0.2 and v.y > -0.6:
                break
        out.append((Vector(c) + v * r * 0.97, v, clump_w(name, c)))
    return out


def build_flowers(q, name, seed, count, petal_cols):
    m = K.Mesh(FID + name, ['tree_blossom'], q)
    rnd = random.Random(seed)
    for i, (p, n, w) in enumerate(flower_points(rnd, count)):
        blossom(m, p, n, w, rnd.uniform(0.17, 0.25), rnd, C(petal_cols[i % len(petal_cols)]))
    return m


BONES = [
    ('root', (0, 0, 0), None, False, 0.5),
    ('trunk1', (0, 0, 0.0), 'root', True, 0.5),
    ('trunk2', (0, 0, 1.8), 'trunk1', True, 0.5),
    ('trunk3', (0, 0, 3.1), 'trunk2', True, 0.5),
    ('roots', (0, 0, 0.2), 'trunk1', True, 0.3),
    ('armL1', ARM_L[0], 'trunk2'), ('armL2', ARM_L[1], 'armL1'), ('armL3', ARM_L[2], 'armL2'),
    ('armR1', ARM_R[0], 'trunk2'), ('armR2', ARM_R[1], 'armR1'), ('armR3', ARM_R[2], 'armR2'),
    ('topL1', TOP_L[0], 'trunk3'), ('topL2', TOP_L[1], 'topL1'), ('topL3', TOP_L[2], 'topL2'),
    ('topR1', TOP_R[0], 'trunk3'), ('topR2', TOP_R[1], 'topR1'), ('topR3', TOP_R[2], 'topR2'),
    ('brow.L', (-0.32, 0.86, 4.55), 'trunk3'), ('brow.R', (0.32, 0.86, 4.55), 'trunk3'),
    ('lid.L', (-EYE_X, FACE_Y + 0.02, EYE_Z + 0.285), 'trunk3'), ('lid.R', (EYE_X, FACE_Y + 0.02, EYE_Z + 0.285), 'trunk3'),
    ('mouth', MOUTH_C, 'trunk3'),
    ('nose', (0, 0.84, 3.98), 'trunk3'),
]

# ---------------------------------------------------------------- позы

def arms(l1=(0, 0), l2=(0, 0), l3=(0, 0), r1=(0, 0), r2=(0, 0), r3=(0, 0)):
    """Каждая пара — (подъём, мах вперёд) в градусах, одинаково для обеих рук: + подъём — вверх, + мах — вперёд."""
    L = lambda v: (0, v[0], -v[1])
    R = lambda v: (0, -v[0], v[1])
    return {'armL1': {'rot': L(l1)}, 'armL2': {'rot': L(l2)}, 'armL3': {'rot': L(l3)},
            'armR1': {'rot': R(r1)}, 'armR2': {'rot': R(r2)}, 'armR3': {'rot': R(r3)}}


CROSSED = dict(l1=(-26, 58), l2=(-22, 70), l3=(-34, 26), r1=(-20, 58), r2=(-18, 70), r3=(-34, 26))
OPEN = dict(l1=(-8, 0), l2=(-6, 0), l3=(0, 0), r1=(-8, 0), r2=(-6, 0), r3=(0, 0))
UP = dict(l1=(34, -12), l2=(14, -8), l3=(8, 0), r1=(34, -12), r2=(14, -8), r3=(8, 0))


def blend(a, b, k):
    out = {}
    for key in a:
        out[key] = tuple(a[key][i] + (b[key][i] - a[key][i]) * k for i in range(len(a[key])))
    return out


def face(lids=1.0, brow=0.0, frown=1.0, mouth=(0.7, 0.45), nose=(0, 0, 0)):
    """lids: 1 — прикрыты (ворчит), 2 — закрыты, 0.35 — распахнуты; brow — подъём бровей (м); frown 1 — насуплены."""
    return {
        'lid.L': {'sc': (1, 1, lids)}, 'lid.R': {'sc': (1, 1, lids)},
        'brow.L': {'loc': (0, 0, brow), 'rot': (0, 14 * frown, 0)},
        'brow.R': {'loc': (0, 0, brow), 'rot': (0, -14 * frown, 0)},
        'mouth': {'sc': (mouth[0], 1, mouth[1])},
        'nose': {'rot': nose},
    }


def wind(t, a=1.0):
    w = math.sin(S2 * t)
    return {'topL1': {'rot': (2 * a * w, 3 * a * w, 0)}, 'topL2': {'rot': (0, 3 * a * math.sin(S2 * t - 0.7), 0)},
            'topL3': {'rot': (0, 4 * a * math.sin(S2 * t - 1.4), 0)},
            'topR1': {'rot': (-2 * a * w, 3 * a * w, 0)}, 'topR2': {'rot': (0, 3 * a * math.sin(S2 * t - 0.9), 0)},
            'topR3': {'rot': (0, 4 * a * math.sin(S2 * t - 1.6), 0)}}


def merge(*ds):
    out = {}
    for d in ds:
        for b, v in d.items():
            o = out.setdefault(b, {})
            for k, val in v.items():
                if k == 'sc':
                    vv = val if isinstance(val, (tuple, list)) else (val,) * 3
                    pv = o.get('sc', (1, 1, 1))
                    o['sc'] = tuple(pv[i] * vv[i] for i in range(3))
                else:
                    pv = o.get(k, (0, 0, 0))
                    o[k] = tuple(pv[i] + val[i] for i in range(3))
    return out


def idle(t, f):
    sway = math.sin(S2 * t)
    gr = math.sin(S2 * 6 * t) * win(t, 0.2, 0.45, 0.05) + math.sin(S2 * 5 * t) * win(t, 0.6, 0.8, 0.05)
    lift = bump(t, 0.85, 0.97)
    return merge(
        arms(**blend(CROSSED, CROSSED, 0)),
        {'trunk2': {'rot': (0, 1.2 * sway, 0)}, 'trunk3': {'rot': (1.0 * math.sin(S2 * t + 1), 1.2 * sway, 0)},
         'armL2': {'rot': (0, 0, 2 * sway)}, 'armR2': {'rot': (0, 0, 2 * sway)}},
        face(lids=1.0 - 0.3 * lift, brow=0.04 * lift + 0.015 * gr, frown=1 - 0.4 * lift,
             mouth=(0.68 + 0.05 * abs(gr), 0.4 + 0.14 * abs(gr))),
        {'brow.L': {'rot': (0, 4 * math.sin(S2 * 3 * t), 0)}, 'brow.R': {'rot': (0, 4 * math.sin(S2 * 3 * t + 1.5), 0)}},
        wind(t, 0.8))


def emerge(t, f):
    rise = ease(min(1.0, t / 0.62))
    over = bump(t, 0.55, 0.75)
    z = -8.2 * (1 - rise) + 0.25 * over
    roots = sstep(0.5, 0.82, t) + 0.12 * bump(t, 0.78, 0.92)
    wake = sstep(0.72, 0.86, t)
    shake = math.sin(S2 * 9 * t) * win(t, 0.05, 0.6, 0.06)
    k = sstep(0.6, 0.95, t)
    ar = blend(blend(UP, OPEN, sstep(0.3, 0.6, t)), CROSSED, k)
    return merge(
        {'root': {'loc': (0, 0, z), 'rot': (0, 2.5 * shake, 0)},
         'trunk1': {'sc': (1 - 0.06 * over, 1 - 0.06 * over, 1 + 0.08 * over)},
         'roots': {'sc': (0.15 + 0.85 * roots, 0.15 + 0.85 * roots, 0.3 + 0.7 * roots)}},
        arms(**ar),
        face(lids=2.0 - 1.0 * wake + 0.4 * bump(t, 0.9, 0.96), brow=-0.02 * (1 - wake), frown=wake,
             mouth=(0.7, 0.45 + 0.4 * bump(t, 0.82, 0.98))),
        wind(t, 1.5 * (1 - k)))


def spark_hit(t, f):
    hit = bump(t, 0.0, 0.45)
    shiver = math.sin(S2 * 14 * t) * win(t, 0.02, 0.5, 0.05)
    return merge(
        arms(**CROSSED),
        {'armL2': {'rot': (0, 6 * hit, 4 * shiver)}, 'armR2': {'rot': (0, -6 * hit, -4 * shiver)},
         'trunk3': {'rot': (3 * hit, 1.5 * shiver, 0)}, 'trunk2': {'sc': (1 + 0.02 * hit, 1 + 0.02 * hit, 1 - 0.02 * hit)}},
        face(lids=1.0 - 0.6 * hit, brow=0.08 * hit, frown=1 - hit, mouth=(0.7 - 0.15 * hit, 0.45 + 0.4 * hit)),
        wind(t, 0.5))


def sneeze(t, f):
    pre = sstep(0.05, 0.55, t) * (1 - sstep(0.56, 0.62, t))
    snap = bump(t, 0.55, 0.72)
    rec = win(t, 0.7, 1.0, 0.06)
    shake = math.sin(S2 * 10 * t) * rec * 0.5
    ar = blend(CROSSED, OPEN, sstep(0.5, 0.58, t) * (1 - sstep(0.8, 1.0, t)))
    return merge(
        arms(**ar),
        {'trunk3': {'rot': (7 * pre - 12 * snap, 1.5 * shake, 0)}, 'trunk2': {'rot': (2 * pre - 4 * snap, 0, 0)},
         'armL1': {'rot': (0, 20 * snap, 0)}, 'armR1': {'rot': (0, -20 * snap, 0)}},
        face(lids=1.0 + 1.0 * pre + 0.8 * snap * (1 - pre), brow=0.06 * pre - 0.03 * snap, frown=1 - pre,
             mouth=(0.7 + 0.25 * pre, 0.45 + 0.75 * pre + 0.3 * snap), nose=(6 * pre * math.sin(S2 * 8 * t), 0, 0)),
        wind(t, 0.8 + 2.5 * snap))


def throw(t, f):
    # правая рука-ветка: замах назад-вверх → бросок вперёд (шишка вылетает на кадре 27 из кончика armR3) → назад
    wind_up = sstep(0.05, 0.35, t) * (1 - sstep(0.38, 0.46, t))
    fling = sstep(0.38, 0.46, t) * (1 - sstep(0.6, 0.95, t))
    back = sstep(0.0, 0.12, t) * (1 - sstep(0.85, 1.0, t))
    r = blend(CROSSED, OPEN, back)
    r['r1'] = tuple(r['r1'][i] + (55, -40)[i] * wind_up + (35, 50)[i] * fling for i in range(2))
    r['r2'] = tuple(r['r2'][i] + (20, -25)[i] * wind_up + (10, 35)[i] * fling for i in range(2))
    r['r3'] = tuple(r['r3'][i] + (15, -20)[i] * wind_up + (0, 40)[i] * fling for i in range(2))
    return merge(
        arms(**r),
        {'trunk2': {'rot': (0, 0, -6 * wind_up + 8 * fling)}, 'trunk3': {'rot': (-4 * fling, 0, -5 * wind_up + 6 * fling)}},
        face(lids=1.1 - 0.5 * fling, brow=0.02, frown=1.0, mouth=(0.75, 0.45 + 0.4 * fling)),
        wind(t, 1.0))


def giggle(t, f):
    w = math.sin(S2 * 4 * t)
    ar = blend(CROSSED, OPEN, 0.35)
    return merge(
        arms(**ar),
        {'trunk2': {'rot': (0, 3 * w, 0), 'sc': (1, 1, 1 + 0.015 * abs(w))}, 'trunk3': {'rot': (2 * abs(w), 3 * w, 0)},
         'armL2': {'rot': (0, 0, -10 * abs(w))}, 'armR2': {'rot': (0, 0, 10 * abs(w))},
         'armL3': {'rot': (0, 8 * w, 0)}, 'armR3': {'rot': (0, -8 * w, 0)}},
        face(lids=1.45, brow=0.07, frown=-0.6, mouth=(0.8, 0.5 + 0.35 * abs(math.sin(S2 * 8 * t)))),
        wind(t, 1.5))


def dance(t, f):
    b = math.sin(S2 * 2 * t)
    s = math.sin(S2 * t)
    return merge(
        arms(l1=(25 + 20 * b, 10), l2=(15 + 10 * math.sin(S2 * 2 * t - 0.6), 0), l3=(10 * math.sin(S2 * 2 * t - 1.2), 0),
             r1=(25 - 20 * b, 10), r2=(15 - 10 * math.sin(S2 * 2 * t - 0.6), 0), r3=(-10 * math.sin(S2 * 2 * t - 1.2), 0)),
        {'trunk1': {'sc': (1 + 0.012 * abs(b), 1 + 0.012 * abs(b), 1 - 0.02 * abs(b))},
         'trunk2': {'rot': (0, 4 * s, 0)}, 'trunk3': {'rot': (0, 5 * s, 3 * s)}},
        face(lids=1.35, brow=0.06 + 0.03 * abs(b), frown=-0.7, mouth=(0.8, 0.7)),
        wind(t * 2 % 1.0, 3.0))


def bloom_laugh(t, f):
    up = win(t, 0.0, 1.0, 0.15)
    ha = math.sin(S2 * 7 * t) * win(t, 0.15, 0.92, 0.05)
    ar = blend(CROSSED, UP, up)
    return merge(
        arms(**ar),
        {'armL2': {'rot': (0, 6 * ha, 0)}, 'armR2': {'rot': (0, -6 * ha, 0)}, 'armL3': {'rot': (0, 10 * ha, 0)},
         'armR3': {'rot': (0, -10 * ha, 0)},
         'trunk2': {'rot': (3 * up, 0, 0), 'sc': (1, 1, 1 + 0.02 * ha)}, 'trunk3': {'rot': (6 * up + 1.5 * ha, 0, 0)},
         'trunk1': {'sc': (1 + 0.03 * bump(t, 0.0, 0.15), 1 + 0.03 * bump(t, 0.0, 0.15), 1 - 0.04 * bump(t, 0.0, 0.15))}},
        face(lids=1.0 + 0.5 * up, brow=0.1 * up, frown=1 - 1.7 * up, mouth=(0.7 + 0.35 * up, 0.45 + 0.6 * up + 0.2 * ha)),
        wind(t * 3 % 1.0, 2.0 + 3 * up))


def yawn_leave(t, f):
    yawn = win(t, 0.02, 0.36, 0.1)
    wave = math.sin(S2 * 5 * t) * win(t, 0.38, 0.62, 0.05)
    sink = ease(sstep(0.64, 1.0, t))
    ar = blend(CROSSED, UP, yawn)
    ar = blend(ar, OPEN, sstep(0.3, 0.4, t) * (1 - sstep(0.62, 0.8, t)))
    ar['r1'] = tuple(ar['r1'][i] + (40, 10)[i] * win(t, 0.36, 0.64, 0.05) for i in range(2))
    ar['r3'] = tuple(ar['r3'][i] + (0, 25 * wave)[i] for i in range(2))
    if t >= 0.8:
        ar = blend(ar, dict(l1=(30, 0), l2=(10, 0), l3=(0, 0), r1=(30, 0), r2=(10, 0), r3=(0, 0)), sstep(0.8, 1.0, t))
    roots = 1 - 0.85 * sstep(0.7, 0.95, t)
    return merge(
        arms(**ar),
        {'root': {'loc': (0, 0, -8.4 * sink), 'rot': (0, 3 * math.sin(S2 * 8 * t) * sink, 0)},
         'trunk3': {'rot': (5 * yawn, 0, 0)},
         'roots': {'sc': (0.15 + 0.85 * roots, 0.15 + 0.85 * roots, 0.3 + 0.7 * roots)}},
        face(lids=1.0 + 1.0 * yawn + 0.6 * sstep(0.62, 0.75, t), brow=0.03 * yawn, frown=0.3,
             mouth=(0.7 + 0.35 * yawn, 0.45 + 0.9 * yawn)),
        wind(t, 1.0))


def shrug_leave(t, f):
    sh = win(t, 0.08, 0.52, 0.1)
    sink = ease(sstep(0.56, 1.0, t))
    shrug = dict(l1=(22, 30), l2=(10, 20), l3=(20, 0), r1=(22, 30), r2=(10, 20), r3=(20, 0))
    ar = blend(CROSSED, shrug, sh)
    roots = 1 - 0.85 * sstep(0.62, 0.92, t)
    return merge(
        arms(**ar),
        {'trunk2': {'sc': (1, 1, 1 + 0.03 * sh)}, 'trunk3': {'rot': (0, 0, 6 * math.sin(S2 * 2 * t) * sh)},
         'root': {'loc': (0, 0, -8.4 * sink)},
         'roots': {'sc': (0.15 + 0.85 * roots, 0.15 + 0.85 * roots, 0.3 + 0.7 * roots)}},
        face(lids=1.1, brow=0.08 * sh, frown=1 - 1.2 * sh, mouth=(0.6, 0.35 + 0.1 * sh)),
        wind(t, 1.0))


ANIMS = [('idle', 120, idle), ('emerge', 120, emerge), ('spark_hit', 30, spark_hit), ('sneeze', 75, sneeze),
         ('throw', 60, throw), ('giggle', 60, giggle), ('dance', 60, dance), ('bloom_laugh', 90, bloom_laugh),
         ('yawn_leave', 120, yawn_leave), ('shrug_leave', 105, shrug_leave)]

# ---------------------------------------------------------------- фазы: оттенок материалов в превью и в glb

def set_tint(name, rgb):
    m = bpy.data.materials[name]
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = next(n for n in nt.nodes if n.type == 'VERTEX_COLOR')
    mixn = next((n for n in nt.nodes if n.type == 'MIX'), None)
    if rgb is None:
        if mixn:
            nt.nodes.remove(mixn)
        nt.links.new(attr.outputs[0], next(s for s in bsdf.inputs if s.identifier == 'Base Color'))
        return
    if mixn is None:
        mixn = nt.nodes.new('ShaderNodeMix')
        mixn.data_type = 'RGBA'
        mixn.blend_type = 'MULTIPLY'
        sock = lambda node, coll, ident: next(s for s in getattr(node, coll) if s.identifier == ident)
        sock(mixn, 'inputs', 'Factor_Float').default_value = 1.0
        nt.links.new(attr.outputs[0], sock(mixn, 'inputs', 'A_Color'))
        nt.links.new(sock(mixn, 'outputs', 'Result_Color'), next(s for s in bsdf.inputs if s.identifier == 'Base Color'))
    next(s for s in mixn.inputs if s.identifier == 'B_Color').default_value = (*rgb, 1.0)


def patch_glb(path):
    """В glb: цвет материала коры и мха — фаза 1 (серое); в extras — оттенки всех фаз."""
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    j = json.loads(data[20:20 + jlen])
    rest = data[20 + jlen:]
    for mat in j.get('materials', []):
        if mat['name'] == 'tree_bark':
            mat.setdefault('pbrMetallicRoughness', {})['baseColorFactor'] = [*BARK_TINT[0], 1.0]
            mat['extras'] = {'phaseTints': [list(c) for c in BARK_TINT]}
        if mat['name'] == 'tree_moss':
            mat.setdefault('pbrMetallicRoughness', {})['baseColorFactor'] = [*MOSS_TINT[0], 1.0]
            mat['extras'] = {'phaseTints': [list(c) for c in MOSS_TINT]}
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + len(rest)
    out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + rest
    with open(path, 'wb') as fh:
        fh.write(out)
    print('PATCHED', path, len(out))


def main():
    K.reset()
    arm = K.armature(FID + '_rig', BONES)
    base = build_base(1.0).object(arm)
    buds = build_buds(1.0).object(arm)
    leaves = build_leaves(1.0).object(arm)
    some = build_flowers(1.0, '_flowers_some', 21, 28, ['#ffd1dc', '#fff4f6', '#ffb6c8']).object(arm)
    full = build_flowers(1.0, '_flowers_full', 33, 40, ['#ffc2d1', '#fff0f4', '#ff9fb8', '#ffe3ea']).object(arm)
    layers = [base, buds, leaves, some, full]
    acts = [K.bake(arm, n, fr, fn) for n, fr, fn in ANIMS]
    K.report(FID, layers, arm, acts)
    for n in ('tree_bark', 'tree_moss'):
        set_tint(n, None)
    K.save_blend(FID)
    path = K.export_glb(FID, [arm] + layers)
    patch_glb(path)
    # превью: фазы (серое / почки / листва / цветёт) и главный кадр — полное цветение
    st = K.stage()
    K.frame_cam((-3.2, -2.4, 0.0), (3.2, 2.4, 8.9), view=(0.4, 1.0, 0.3), fill=0.92)
    K.use_action(arm, acts[0], 0)
    phases = [(0, []), (1, [buds]), (2, [leaves]), (3, [leaves, some]), (4, [leaves, some, full])]

    def show(ph):
        i, vis = ph
        for o in (buds, leaves, some, full):
            o.hide_render = o not in vis
        set_tint('tree_bark', BARK_TINT[i])
        set_tint('tree_moss', MOSS_TINT[i])
    show(phases[4])
    K.use_action(arm, acts[7], 40)
    K.render(f'{K.REN_DIR}/{FID}.png', samples=48)
    K.use_action(arm, acts[0], 0)
    import numpy as np
    tiles = []
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = 256
    sc.cycles.samples = 24
    for ph in phases[:4]:
        show(ph)
        tmp = f'{K.TMP}/ph_{ph[0]}.png'
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        tiles.append(K._composite(tmp, None))
    K._save_rgb(np.concatenate(tiles, axis=1), f'{K.REN_DIR}/{FID}_phases.png')
    show(phases[0])
    K.strip(f'{K.REN_DIR}/{FID}_emerge.png', arm, acts[1], (30, 70, 90, 118))
    K.strip(f'{K.REN_DIR}/{FID}_sneeze.png', arm, acts[3], (10, 38, 44, 60))
    K.strip(f'{K.REN_DIR}/{FID}_throw.png', arm, acts[4], (0, 20, 27, 40))
    show(phases[4])
    K.strip(f'{K.REN_DIR}/{FID}_bloom_laugh.png', arm, acts[7], (0, 25, 45, 70))
    K.remove(st)
    for n in ('tree_bark', 'tree_moss'):
        set_tint(n, None)
    for o in layers:
        o.hide_render = False
    K.save_blend(FID)


if __name__ == '__main__':
    main()
