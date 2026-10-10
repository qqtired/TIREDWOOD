"""Подземелье — герой «Фонарщик» (hero).

Строит в Blender модель со скелетом и действиями, рендерит превью, сохраняет .blend и экспортирует GLB.
Запуск внутри Blender (MCP execute_blender_code):

    exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/hero.py').read(), {'STAGE': 'all'})

STAGE: 'build' — модель + анимации; 'all' — плюс превью, .blend и GLB.
ВНИМАНИЕ: скрипт очищает текущий файл Blender (объекты, меши, материалы, действия). Запускать в пустом файле.

Оси: метры, стоит на z=0, смотрит по -Y Blender (= +Z three.js после glTF). Правая рука героя — сторона -X.
"""
import bpy, bmesh, math, os, json, struct
from mathutils import Vector, Matrix, Quaternion, Euler

STAGE = globals().get('STAGE', 'all')
ROOT = '/Users/tired/Desktop/game-opus-survivors'
MID = 'hero'
FPS = 24
SHARP_DEG = 42.0

# ---------------------------------------------------------------- утилиты

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def sstep(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    if isinstance(a, (tuple, list)):
        return tuple(x + (y - x) * t for x, y in zip(a, b))
    return a + (b - a) * t


def kf(f, keys):
    """Ключи [(кадр, значение)], косинусная интерполяция между ключами."""
    if f <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            u = (f - f0) / (f1 - f0)
            u = 0.5 - 0.5 * math.cos(math.pi * u)
            return lerp(v0, v1, u)
    return keys[-1][1]


def clean_scene():
    sc = bpy.context.scene
    for s in list(bpy.data.scenes):
        if s != sc:
            bpy.data.scenes.remove(s)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.collections, bpy.data.meshes, bpy.data.materials, bpy.data.actions,
                 bpy.data.armatures, bpy.data.cameras, bpy.data.lights, bpy.data.curves, bpy.data.node_groups):
        for d in list(coll):
            try:
                coll.remove(d)
            except Exception:
                pass
    for im in list(bpy.data.images):
        if im.type not in ('RENDER_RESULT', 'COMPOSITING'):
            bpy.data.images.remove(im)
    try:
        bpy.data.orphans_purge(do_recursive=True)
    except Exception:
        pass
    sc.render.fps = FPS
    sc.render.fps_base = 1.0
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    sc.frame_start = 0
    sc.frame_end = 48
    return sc


def make_mat(name, col, rough, metal=0.0, emit=None, estr=0.0, double=False):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')

    def inp(*ids):
        for s in b.inputs:
            if s.identifier in ids or s.name in ids:
                return s
        return None
    inp('Base Color').default_value = (*srgb(col), 1.0)
    inp('Roughness').default_value = rough
    inp('Metallic').default_value = metal
    if emit:
        inp('Emission Color', 'Emission').default_value = (*srgb(emit), 1.0)
        inp('Emission Strength').default_value = estr
    m.diffuse_color = (*srgb(col), 1.0)
    m.roughness = rough
    m.use_backface_culling = not double
    return m


# ---------------------------------------------------------------- материалы
MAT_DEFS = [
    # имя,            цвет,     шерох., металл, эмиссия, сила, двусторонний
    ('hero_skin',    '#dc9c78', 0.62, 0.0, None, 0, False),
    ('hero_hair',    '#3d2617', 0.8, 0.0, None, 0, False),
    ('hero_helmet',  '#93794f', 0.42, 0.45, None, 0, False),
    ('hero_brass',   '#cf9d41', 0.32, 0.6, None, 0, False),
    ('hero_iron',    '#625b54', 0.45, 0.55, None, 0, False),
    ('hero_apron',   '#80482a', 0.72, 0.0, None, 0, True),
    ('hero_leather', '#4e2f1c', 0.68, 0.0, None, 0, False),
    ('hero_shirt',   '#dccdb0', 0.9, 0.0, None, 0, False),
    ('hero_pants',   '#535e37', 0.85, 0.0, None, 0, False),
    ('hero_glow',    '#ffd98f', 0.3, 0.0, '#ffb04a', 6.0, False),
]
MI = {d[0]: i for i, d in enumerate(MAT_DEFS)}

# ---------------------------------------------------------------- скелет
LX, LY = -0.365, -0.175       # ось цепи и фонаря (в правой руке)
GZ = 0.70                     # точка хвата цепи (низ кулака)
NL = 4                        # звеньев цепи = костей цепи
LINK = 0.06
LT = GZ - NL * LINK           # верх фонаря, 0.46
LS = 1.35                     # масштаб фонаря
LANT = 0.316 * LS             # длина фонаря (кольцо → шип)
CHAIN = ['chain_%d' % i for i in range(NL)] + ['lantern']


def mirror(p):
    return (-p[0], p[1], p[2])


BONES = [
    ('root', (0, 0, 0), (0, 0, 0.2), None),
    ('hips', (0, 0, 0.60), (0, 0, 0.74), 'root'),
    ('spine', (0, 0, 0.74), (0, 0, 0.92), 'hips'),
    ('chest', (0, 0, 0.92), (0, 0, 1.12), 'spine'),
    ('head', (0, 0, 1.12), (0, 0, 1.46), 'chest'),
    ('upper_arm_r', (-0.25, 0.0, 1.04), (-0.33, 0.03, 0.84), 'chest'),
    ('forearm_r', (-0.33, 0.03, 0.84), (-0.36, -0.12, 0.765), 'upper_arm_r'),
    ('hand_r', (-0.36, -0.12, 0.765), (-0.365, -0.205, 0.745), 'forearm_r'),
    ('upper_arm_l', (0.25, 0.0, 1.04), (0.33, 0.03, 0.83), 'chest'),
    ('forearm_l', (0.33, 0.03, 0.83), (0.365, 0.0, 0.645), 'upper_arm_l'),
    ('hand_l', (0.365, 0.0, 0.645), (0.375, -0.01, 0.56), 'forearm_l'),
    ('thigh_r', (-0.12, 0, 0.62), (-0.13, -0.01, 0.36), 'hips'),
    ('shin_r', (-0.13, -0.01, 0.36), (-0.13, 0.01, 0.10), 'thigh_r'),
    ('foot_r', (-0.13, 0.01, 0.10), (-0.13, -0.15, 0.035), 'shin_r'),
    ('thigh_l', (0.12, 0, 0.62), (0.13, -0.01, 0.36), 'hips'),
    ('shin_l', (0.13, -0.01, 0.36), (0.13, 0.01, 0.10), 'thigh_l'),
    ('foot_l', (0.13, 0.01, 0.10), (0.13, -0.15, 0.035), 'shin_l'),
]
_par = 'hand_r'
for i in range(NL):
    BONES.append(('chain_%d' % i, (LX, LY, GZ - i * LINK), (LX, LY, GZ - (i + 1) * LINK), _par))
    _par = 'chain_%d' % i
BONES.append(('lantern', (LX, LY, LT), (LX, LY, LT - LANT), _par))
ORDER = [b[0] for b in BONES]
BIND = {b[0]: (Vector(b[1]), Vector(b[2])) for b in BONES}
GI = {n: i for i, n in enumerate(ORDER)}

# ---------------------------------------------------------------- геометрия
BM = None
DL = None


def seg_dist(p, a, b):
    ab = b - a
    t = clamp((p - a).dot(ab) / max(ab.length_squared, 1e-9))
    return (a + ab * t - p).length


def near(names, power=6):
    def f(co):
        ws = {n: 1.0 / (seg_dist(co, *BIND[n]) + 0.01) ** power for n in names}
        tot = sum(ws.values())
        ws = {n: w / tot for n, w in ws.items() if w / tot > 0.03}
        tot = sum(ws.values())
        return {n: w / tot for n, w in ws.items()}
    return f


def rigid(name):
    return lambda co: {name: 1.0}


def commit(t, mat, wfn, M=None, recalc=False):
    if M is not None:
        bmesh.ops.transform(t, matrix=M, verts=t.verts)
    if recalc:
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
    vmap = {}
    for v in t.verts:
        nv = BM.verts.new(v.co)
        for n, w in wfn(nv.co).items():
            nv[DL][GI[n]] = w
        vmap[v] = nv
    for f in t.faces:
        try:
            nf = BM.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            continue
        nf.material_index = MI[mat]
        nf.smooth = True
    t.free()


def lathe_t(profile, segs, sx=1.0, sy=1.0, phase=0.0, cap0=False, cap1=False, fn=None):
    """Тело вращения вокруг Z: profile [(r, z)] снизу вверх; r=0 — полюс."""
    t = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-7:
            rings.append([t.verts.new((0, 0, z))])
        else:
            ring = []
            for i in range(segs):
                a = 2 * math.pi * i / segs + phase
                co = Vector((r * math.cos(a) * sx, r * math.sin(a) * sy, z))
                if fn:
                    co = fn(co)
                ring.append(t.verts.new(co))
            rings.append(ring)
    for A, B in zip(rings, rings[1:]):
        if len(A) == 1 and len(B) == 1:
            continue
        if len(A) == 1:
            for i in range(segs):
                t.faces.new((A[0], B[(i + 1) % segs], B[i]))
        elif len(B) == 1:
            for i in range(segs):
                t.faces.new((A[i], A[(i + 1) % segs], B[0]))
        else:
            for i in range(segs):
                t.faces.new((A[i], A[(i + 1) % segs], B[(i + 1) % segs], B[i]))
    if cap0 and len(rings[0]) > 1:
        t.faces.new(list(reversed(rings[0])))
    if cap1 and len(rings[-1]) > 1:
        t.faces.new(rings[-1])
    return t


def sphere_t(segs=12, rings=8):
    prof = [(math.sin(math.pi * i / rings), -math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0] = (0.0, -1.0)
    prof[-1] = (0.0, 1.0)
    return lathe_t(prof, segs)


def torus_t(R, r, su, sv, sz=1.0):
    t = bmesh.new()
    g = []
    for i in range(su):
        a = 2 * math.pi * i / su
        row = []
        for j in range(sv):
            b = 2 * math.pi * j / sv
            rr = R + r * math.cos(b)
            row.append(t.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b) * sz)))
        g.append(row)
    for i in range(su):
        for j in range(sv):
            t.faces.new((g[i][j], g[(i + 1) % su][j], g[(i + 1) % su][(j + 1) % sv], g[i][(j + 1) % sv]))
    return t


def box_t(sx, sy, sz, bevel=0.0):
    t = bmesh.new()
    bmesh.ops.create_cube(t, size=1.0)
    bmesh.ops.scale(t, vec=(sx, sy, sz), verts=t.verts)
    if bevel > 0:
        try:
            bmesh.ops.bevel(t, geom=list(t.edges), offset=bevel, segments=2, profile=0.5, affect='EDGES')
        except TypeError:
            bmesh.ops.bevel(t, geom=list(t.edges), offset=bevel, segments=2, profile=0.5, vertex_only=False)
    return t


def tube_t(pts, rx, ry, segs, normal_fn, caps=True):
    t = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        nr = normal_fn(p)
        side = tan.cross(nr)
        if side.length < 1e-6:
            side = tan.orthogonal()
        side.normalize()
        nr = side.cross(tan).normalized()
        rings.append([t.verts.new(p + side * (math.cos(2 * math.pi * k / segs) * rx) +
                                  nr * (math.sin(2 * math.pi * k / segs) * ry)) for k in range(segs)])
    for A, B in zip(rings, rings[1:]):
        for k in range(segs):
            t.faces.new((A[k], A[(k + 1) % segs], B[(k + 1) % segs], B[k]))
    if caps:
        t.faces.new(rings[0])
        t.faces.new(list(reversed(rings[-1])))
    return t


def TRS(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (Matrix.Translation(Vector(loc)) @ Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
            @ Matrix.Diagonal((*scale, 1.0)))


def axis_m(p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    z = (p1 - p0).normalized()
    ref = Vector((0, -1, 0)) if abs(z.y) < 0.9 else Vector((1, 0, 0))
    x = (ref - z * ref.dot(z)).normalized()
    y = z.cross(x)
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = p0
    return M


def ellipsoid(c, r, mat, w, segs=12, rings=8, rot=(0, 0, 0)):
    commit(sphere_t(segs, rings), mat, w, TRS(c, rot, r))


# профиль торса (r, z), сечение — эллипс sx=1, sy=0.8
T_PROF = [(0.20, 0.62), (0.225, 0.68), (0.245, 0.78), (0.252, 0.90), (0.245, 0.99), (0.225, 1.05),
          (0.18, 1.10), (0.11, 1.135), (0.0, 1.145)]
T_SY = 0.8


def rt(z):
    p = T_PROF
    if z <= p[0][1]:
        return p[0][0]
    for (r0, z0), (r1, z1) in zip(p, p[1:]):
        if z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return p[-1][0]


BELT_Z = 0.665


def apron_y(x, z):
    r = rt(max(z, BELT_Z))
    mix = lerp(0.55, 1.0, sstep(0.63, 0.70, z))
    D = T_SY * r + 0.022 + 0.05 * clamp((BELT_Z - z) / 0.3)
    return -D + (0.4 / r) * mix * x * x


def apron_hw(z):
    return kf(-z, [(-1.06, 0.13), (-0.95, 0.15), (-0.80, 0.17), (-BELT_Z, 0.195), (-0.36, 0.235)])


def build_mesh():
    global BM, DL
    BM = bmesh.new()
    DL = BM.verts.layers.deform.verify()

    # --- торс, таз
    commit(lathe_t(T_PROF, 18, 1.0, T_SY), 'hero_shirt', near(['hips', 'spine', 'chest'], 4), TRS((0, 0.01, 0)))
    commit(lathe_t([(0.0, 0.47), (0.11, 0.49), (0.185, 0.53), (0.215, 0.59), (0.226, BELT_Z + 0.01)], 16, 1.0, T_SY),
           'hero_pants', near(['hips', 'thigh_l', 'thigh_r'], 5), TRS((0, 0.01, 0)))

    for s, sd in ((-1, 'r'), (1, 'l')):
        th, sh, ft = 'thigh_' + sd, 'shin_' + sd, 'foot_' + sd
        ua, fa, hd = 'upper_arm_' + sd, 'forearm_' + sd, 'hand_' + sd
        # штанина
        commit(lathe_t([(0.10, 0.0), (0.106, 0.08), (0.101, 0.18), (0.093, 0.26), (0.087, 0.33), (0.08, 0.40)], 12),
               'hero_pants', near([th, sh], 6), axis_m((s * 0.12, 0, 0.64), (s * 0.13, 0.0, 0.24)))
        # шерстяной отворот носка
        commit(torus_t(0.079, 0.027, 12, 5), 'hero_shirt', rigid(sh), TRS((s * 0.13, 0.0, 0.245)), recalc=True)

        # сапог: тело вращения, носок вытянут вперёд
        def boot_fn(co):
            f = clamp((0.12 - co.z) / 0.12) ** 0.7
            if co.y < 0:
                co.y *= 1.0 + 1.05 * f
            return co
        commit(lathe_t([(0.0, 0.0), (0.072, 0.0), (0.088, 0.012), (0.091, 0.04), (0.084, 0.09), (0.078, 0.16),
                        (0.084, 0.232), (0.081, 0.25), (0.0, 0.252)], 12, fn=boot_fn),
               'hero_leather', near([sh, ft], 6), TRS((s * 0.13, 0.0, 0)))
        commit(torus_t(0.083, 0.011, 12, 4, 1.6), 'hero_leather', rigid(sh), TRS((s * 0.13, 0.0, 0.15)), recalc=True)
        commit(box_t(0.012, 0.034, 0.03, 0.003), 'hero_brass', rigid(sh), TRS((s * 0.218, -0.01, 0.15)), recalc=True)

        # плечо и рукав
        ellipsoid((s * 0.235, 0.0, 1.02), (0.10, 0.095, 0.095), 'hero_shirt', near(['chest', ua], 5), 10, 7)
        h, tl = BIND[ua]
        d = (tl - h).normalized()
        commit(lathe_t([(0.07, 0.0), (0.083, 0.06), (0.085, 0.14), (0.079, 0.21), (0.07, 0.235)], 10),
               'hero_shirt', near(['chest', ua, fa], 6), axis_m(h - d * 0.03, tl))
        commit(torus_t(0.073, 0.025, 10, 5), 'hero_shirt', near([ua, fa], 6),
               axis_m(tl - d * 0.025, tl + d), recalc=True)
        h2, t2 = BIND[fa]
        d2 = (t2 - h2).normalized()
        L2 = (t2 - h2).length
        commit(lathe_t([(0.056, 0.0), (0.058, 0.05), (0.052, L2)], 10), 'hero_skin', near([ua, fa, hd], 6),
               axis_m(h2, t2))
        commit(lathe_t([(0.057, 0.0), (0.08, 0.03), (0.086, 0.085), (0.072, L2 - 0.055), (0.062, L2 - 0.04)], 10),
               'hero_leather', near([fa, hd], 6), axis_m(h2 + d2 * 0.065, t2 + d2 * 0.04))
        # кулак в перчатке
        h3, t3 = BIND[hd]
        c3 = (h3 + t3) * 0.5
        M = axis_m(h3, t3)
        R = M.to_3x3()
        Mf = Matrix.Translation(c3 + R @ Vector((0, 0, -0.005))) @ R.to_4x4() @ Matrix.Diagonal((0.068, 0.062, 0.072, 1))
        commit(sphere_t(10, 6), 'hero_leather', rigid(hd), Mf)
        Mt = (Matrix.Translation(c3 + R @ Vector((0.0, 0.0, 0.0)) + Vector((-s * 0.045, -0.02, 0.025))) @
              R.to_4x4() @ Matrix.Diagonal((0.026, 0.026, 0.04, 1)))
        commit(sphere_t(8, 5), 'hero_leather', rigid(hd), Mt)

    # --- голова
    hw = rigid('head')
    HC = (0, -0.01, 1.285)
    ellipsoid(HC, (0.13, 0.125, 0.135), 'hero_skin', hw, 14, 10)
    commit(lathe_t([(0.075, 1.08), (0.07, 1.15), (0.07, 1.21)], 10), 'hero_skin', near(['chest', 'head'], 5))
    ellipsoid((0, -0.142, 1.27), (0.043, 0.042, 0.037), 'hero_skin', hw, 10, 7)          # нос
    for s in (-1, 1):
        ellipsoid((s * 0.046, -0.122, 1.315), (0.016, 0.012, 0.018), 'hero_hair', hw, 8, 5)   # глаза
        ellipsoid((s * 0.05, -0.124, 1.347), (0.033, 0.015, 0.012), 'hero_hair', hw, 8, 5, (0, s * 8, 0))  # брови
        ellipsoid((s * 0.052, -0.15, 1.236), (0.062, 0.03, 0.025), 'hero_hair', hw, 10, 6, (0, s * 24, s * -10))  # усы
        ellipsoid((s * 0.131, 0.005, 1.29), (0.022, 0.035, 0.045), 'hero_skin', hw, 8, 6)    # уши
    ellipsoid((0, -0.07, 1.178), (0.138, 0.108, 0.122), 'hero_hair', hw, 14, 8)          # борода
    ellipsoid((0, -0.115, 1.105), (0.09, 0.07, 0.07), 'hero_hair', hw, 8, 5)             # кончик бороды
    ellipsoid((0, 0.035, 1.30), (0.138, 0.115, 0.115), 'hero_hair', hw, 12, 7)           # волосы сзади

    # каска
    HSY = 1.06
    HPROF = [(0.152, 1.338), (0.205, 1.328), (0.222, 1.340), (0.214, 1.356), (0.164, 1.366), (0.162, 1.40),
             (0.152, 1.45), (0.124, 1.49), (0.08, 1.515), (0.0, 1.526)]
    commit(lathe_t(HPROF, 20, 1.0, HSY), 'hero_helmet', hw)
    commit(torus_t(0.165, 0.011, 20, 4), 'hero_brass', hw, TRS((0, 0, 1.372), scale=(1, HSY, 1)), recalc=True)
    dome = [p for p in HPROF[4:-1]]
    crest = [Vector((0, -r * HSY - 0.006, z)) for r, z in dome] + [Vector((0, 0, 1.532))] + \
            [Vector((0, r * HSY + 0.006, z)) for r, z in reversed(dome)]
    commit(tube_t(crest, 0.022, 0.008, 6, lambda p: (p - Vector((0, 0, 1.36))).normalized()), 'hero_brass', hw,
           recalc=True)
    for a in range(0, 360, 60):          # заклёпки на ободе
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        ellipsoid((0.176 * ca, 0.176 * HSY * sa, 1.372), (0.012, 0.012, 0.012), 'hero_brass', hw, 6, 4)
    # лампа на каске
    commit(lathe_t([(0.0, 0.0), (0.032, 0.0), (0.042, 0.02), (0.047, 0.055), (0.047, 0.078), (0.036, 0.084),
                    (0.0, 0.084)], 12), 'hero_brass', hw, axis_m((0, -0.135, 1.43), (0, -0.3, 1.43)))
    ellipsoid((0, -0.219, 1.43), (0.035, 0.012, 0.035), 'hero_glow', hw, 12, 6)
    # шарф
    commit(torus_t(0.135, 0.042, 16, 6), 'hero_pants', near(['chest', 'head'], 5), TRS((0, 0.0, 1.115),
           scale=(1, 0.88, 1)), recalc=True)

    # --- фартук (лист по форме торса, ниже ремня свисает)
    nx, nz = 9, 15
    t = bmesh.new()
    grid = []
    for i in range(nz):
        z = 1.06 - (1.06 - 0.36) * i / (nz - 1)
        hwz = apron_hw(z)
        row = []
        for j in range(nx):
            x = -hwz + 2 * hwz * j / (nx - 1)
            row.append(t.verts.new((x, apron_y(x, z), z)))
        grid.append(row)
    for i in range(nz - 1):
        for j in range(nx - 1):
            t.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))

    def apron_w(co):
        if co.z >= BELT_Z:
            return near(['hips', 'spine', 'chest'], 4)(co)
        wt = 0.65 * clamp((BELT_Z - co.z) / 0.3)
        sl = sstep(-0.09, 0.09, co.x)
        return {'hips': 1 - wt, 'thigh_l': wt * sl, 'thigh_r': wt * (1 - sl)}
    commit(t, 'hero_apron', apron_w)
    # карман на нагруднике
    commit(box_t(0.15, 0.014, 0.10, 0.006), 'hero_apron', near(['spine', 'chest'], 4),
           TRS((0, apron_y(0, 0.93) - 0.006, 0.93)), recalc=True)

    # лямки: от углов нагрудника через плечи крест-накрест на спину
    def strap_n(p):
        return Vector((p.x, p.y / 0.8, (p.z - 0.92) * 0.8)).normalized()
    for s in (-1, 1):
        pts = [Vector(v) for v in [(s * 0.12, apron_y(0.12, 1.05) - 0.004, 1.05), (s * 0.145, -0.14, 1.115),
                                   (s * 0.16, -0.03, 1.15), (s * 0.15, 0.10, 1.13), (s * 0.09, 0.19, 1.04),
                                   (-s * 0.04, 0.215, 0.92), (-s * 0.13, 0.205, 0.78), (-s * 0.17, 0.19, BELT_Z)]]
        commit(tube_t(pts, 0.019, 0.007, 6, strap_n), 'hero_leather', near(['spine', 'chest'], 4), recalc=True)
        ellipsoid((s * 0.12, apron_y(0.12, 1.05) - 0.01, 1.05), (0.022, 0.01, 0.022), 'hero_brass',
                  near(['chest'], 4), 8, 5)
    # ремень, пряжка, подсумки, ключ
    commit(torus_t(0.232, 0.026, 20, 4, 1.5), 'hero_leather', rigid('hips'), TRS((0, 0.01, BELT_Z),
           scale=(1, 0.84, 1)), recalc=True)
    commit(box_t(0.075, 0.022, 0.065, 0.008), 'hero_brass', rigid('hips'), TRS((0, -0.205, BELT_Z)), recalc=True)
    for s, a in ((-1, 205), (1, -25), (-1, 145)):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        p = Vector((0.245 * ca, 0.245 * 0.84 * sa + 0.01, BELT_Z - 0.045))
        commit(box_t(0.075, 0.05, 0.085, 0.012), 'hero_leather', rigid('hips'),
               TRS(p, (0, 0, a + 90)), recalc=True)
    # гаечный ключ на левом боку
    commit(box_t(0.022, 0.012, 0.15, 0.004), 'hero_iron', rigid('hips'), TRS((0.205, -0.15, 0.56), (0, 12, 0)),
           recalc=True)
    commit(torus_t(0.024, 0.009, 10, 4), 'hero_iron', rigid('hips'), TRS((0.22, -0.152, 0.47), (90, 12, 0)),
           recalc=True)

    # --- цепь и фонарь
    for i in range(NL):
        z = GZ - (i + 0.5) * LINK
        commit(torus_t(0.021, 0.0065, 8, 4), 'hero_iron', rigid('chain_%d' % i),
               TRS((LX, LY, z), (90, 0, 90 * (i % 2)), (1, 1.45, 1)), recalc=True)
    Ml = Matrix.Translation(Vector((LX, LY, LT))) @ Matrix.Diagonal((LS, LS, LS, 1))
    lw = rigid('lantern')
    commit(torus_t(0.02, 0.0065, 10, 5), 'hero_brass', lw, Ml @ TRS((0, 0, -0.016), (90, 0, 0)), recalc=True)
    commit(lathe_t([(0, -0.095), (0.075, -0.095), (0.09, -0.088), (0.088, -0.076), (0.06, -0.053), (0.03, -0.036),
                    (0.016, -0.023), (0.012, -0.01), (0, -0.01)], 16), 'hero_brass', lw, Ml)
    commit(lathe_t([(0, -0.238), (0.066, -0.238), (0.071, -0.228), (0.071, -0.103), (0.066, -0.093), (0, -0.093)],
                   8), 'hero_glow', lw, Ml)
    for k in range(8):
        a = 2 * math.pi * k / 8
        p = (0.074 * math.cos(a), 0.074 * math.sin(a))
        commit(lathe_t([(0, -0.245), (0.0065, -0.24), (0.0065, -0.092), (0, -0.088)], 4), 'hero_brass', lw,
               Ml @ TRS((p[0], p[1], 0)))
    commit(torus_t(0.074, 0.0055, 16, 4), 'hero_brass', lw, Ml @ TRS((0, 0, -0.165)), recalc=True)
    commit(lathe_t([(0, -0.316), (0.01, -0.30), (0.025, -0.276), (0.07, -0.259), (0.089, -0.25), (0.089, -0.241),
                    (0.07, -0.233), (0, -0.233)], 16), 'hero_brass', lw, Ml)

    # острые рёбра по углу (аналог auto smooth)
    lim = math.radians(SHARP_DEG)
    for e in BM.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim:
            e.smooth = False
    me = bpy.data.meshes.new(MID)
    BM.to_mesh(me)
    BM.free()
    for d in MAT_DEFS:
        me.materials.append(bpy.data.materials[d[0]])
    return me


# ---------------------------------------------------------------- арматура

def build_rig(me):
    sc = bpy.context.scene
    ad = bpy.data.armatures.new(MID + '_rig')
    arm = bpy.data.objects.new(MID + '_rig', ad)
    sc.collection.objects.link(arm)
    ob = bpy.data.objects.new(MID, me)
    sc.collection.objects.link(ob)
    for o in sc.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, par in BONES:
        eb = ad.edit_bones.new(name)
        eb.head, eb.tail = Vector(h), Vector(t)
        d = (Vector(t) - Vector(h)).normalized()
        eb.align_roll(Vector((0, -1, 0)) if abs(d.y) < 0.8 else Vector((0, 0, 1)))
        if par:
            eb.parent = ad.edit_bones[par]
            eb.use_connect = False
    for eb in ad.edit_bones:
        eb.use_deform = eb.name != 'root'
    bpy.ops.object.mode_set(mode='OBJECT')
    ad.display_type = 'STICK'
    for n in ORDER:
        ob.vertex_groups.new(name=n)
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return arm, ob


# ---------------------------------------------------------------- анимации
class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.par = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
        self.rel = {n: (self.rest[self.par[n]].inverted() @ self.rest[n]) if self.par[n] else self.rest[n].copy()
                    for n in ORDER}
        self.rq = {n: self.rest[n].to_quaternion() for n in ORDER}
        self.blen = {b.name: b.length for b in arm.data.bones}

    def local(self, rot, loc):
        out = {}
        for n in ORDER:
            q = Quaternion()
            l = Vector()
            if n in rot:
                e = rot[n]
                qa = Euler((math.radians(e[0]), math.radians(e[1]), math.radians(e[2])), 'XYZ').to_quaternion()
                q = self.rq[n].inverted() @ qa @ self.rq[n]
            if n in loc:
                l = self.rq[n].inverted() @ Vector(loc[n])
            out[n] = [q, l]
        return out

    def fk(self, local):
        M = {}
        for n in ORDER:
            q, l = local[n]
            B = Matrix.Translation(l) @ q.to_matrix().to_4x4()
            p = self.par[n]
            M[n] = (M[p] @ self.rel[n] @ B) if p else (self.rel[n] @ B)
        return M

    def tail(self, M, n):
        return M[n] @ Vector((0, self.blen[n], 0))

    def solve_chain(self, local, dirs):
        M = self.fk(local)
        for k, n in enumerate(CHAIN):
            M0 = M[self.par[n]] @ self.rel[n]
            R0 = M0.to_quaternion()
            y0 = R0 @ Vector((0, 1, 0))
            qw = y0.rotation_difference(dirs[k].normalized())
            qb = R0.inverted() @ qw @ R0
            local[n] = [qb, Vector()]
            M[n] = M0 @ qb.to_matrix().to_4x4()
        return M

    def grip(self, M):
        return (M['hand_r'] @ self.rel['chain_0']).translation.copy()

    def capsules(self, M):
        caps = [(M['hips'].translation.copy(), self.tail(M, 'chest'), 0.23)]
        for sd in ('r', 'l'):
            caps.append((M['thigh_' + sd].translation.copy(), self.tail(M, 'shin_' + sd), 0.1))
        caps.append((M['head'].translation.copy() + (self.tail(M, 'head') - M['head'].translation) * 0.4,
                     self.tail(M, 'head'), 0.17))
        return caps


CH_L = [LINK] * NL + [LANT]
INVM = [0.0] + [4.0] * (NL - 1) + [1.0, 1.0]


def simulate(grips, caps, accel=None, wind=None, loop=False, sub=12, iters=8, damp=0.996, drag=1.4):
    n = len(grips)
    pts = [grips[0] - Vector((0, 0, sum(CH_L[:i]))) for i in range(NL + 2)]
    prv = [p.copy() for p in pts]
    dt = 1.0 / FPS / sub
    G = Vector((0, 0, -9.81))

    def step(g, cp, a, w):
        for i in range(1, NL + 2):
            p = pts[i]
            v = p - prv[i]
            acc = G + a
            if w is not None:
                acc = acc + (w - v / dt) * drag
            prv[i] = p
            pts[i] = p + v * damp + acc * dt * dt
        pts[0] = g.copy()
        prv[0] = g.copy()
        for _ in range(iters):
            for i in range(NL + 1):
                a_, b_ = pts[i], pts[i + 1]
                d = b_ - a_
                ln = max(d.length, 1e-6)
                wsum = INVM[i] + INVM[i + 1]
                corr = d * ((ln - CH_L[i]) / ln / wsum)
                pts[i] = a_ + corr * INVM[i]
                pts[i + 1] = b_ - corr * INVM[i + 1]
            for i in range(1, NL + 2):
                rad = 0.095 if i >= NL else 0.015
                p = pts[i]
                for ca, cb, cr in cp:
                    ab = cb - ca
                    tt = clamp((p - ca).dot(ab) / max(ab.length_squared, 1e-9))
                    c = ca + ab * tt
                    dv = p - c
                    rr = cr + rad
                    if dv.length < rr:
                        if dv.length < 1e-6:
                            dv = Vector((0, -1, 0))
                        p = c + dv.normalized() * rr
                floor = 0.015 if i < NL else (0.06 if i == NL else 0.02)
                if p.z < floor:
                    p = Vector((p.x, p.y, floor))
                    prv[i] = Vector((prv[i].x * 0.5 + p.x * 0.5, prv[i].y * 0.5 + p.y * 0.5, prv[i].z))
                pts[i] = p

    zero = Vector()
    for _ in range(24 * sub):
        step(grips[0], caps[0], zero, None)
    N = n - 1 if loop else n
    out = []
    cycles = 4 if loop else 1
    for c in range(cycles):
        rec = c == cycles - 1
        for f in range(N):
            if rec:
                out.append([p.copy() for p in pts])
            nf = (f + 1) % N if loop else min(f + 1, n - 1)
            a = accel(f) if accel else zero
            w = wind(f) if wind else None
            for s in range(sub):
                u = (s + 1) / sub
                step(grips[f].lerp(grips[nf], u), caps[f], a, w)
    if loop:
        out.append([p.copy() for p in pts])
    dirs = [[(fr[k + 1] - fr[k]).normalized() for k in range(NL + 1)] for fr in out]
    if loop:
        N = len(dirs) - 1
        for k in range(NL + 1):
            delta = dirs[N][k] - dirs[0][k]
            for f in range(N + 1):
                dirs[f][k] = (dirs[f][k] - delta * (f / N)).normalized()
    return dirs


LOC_BONES = ('root', 'hips')


def bake_action(rig, name, N, body, chain='sim', loop=False, accel=None, wind=None):
    arm = rig.arm
    locs = []
    for f in range(N + 1):
        rot, loc = body(f)
        locs.append(rig.local(rot, loc))
    if chain == 'sim':
        grips, caps = [], []
        for L in locs:
            M = rig.fk(L)
            grips.append(rig.grip(M))
            caps.append(rig.capsules(M))
        dirs = simulate(grips, caps, accel, wind, loop)
    else:
        dirs = [chain(f, rig, locs[f]) for f in range(N + 1)]
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    info = {}
    for f in range(N + 1):
        L = locs[f]
        M = rig.solve_chain(L, dirs[f])
        info.setdefault('lantern_min_z', 9)
        info['lantern_min_z'] = min(info['lantern_min_z'], rig.tail(M, 'lantern').z)
        info.setdefault('lant', []).append(tuple(round(x, 3) for x in rig.tail(M, 'lantern')))
        for n in ORDER:
            q, l = L[n]
            if n in prev and prev[n].dot(q) < 0:
                q = -q
            prev[n] = q
            pb = arm.pose.bones[n]
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f, group=n)
            if n in LOC_BONES:
                pb.location = l
                pb.keyframe_insert('location', frame=f, group=n)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = N
    try:
        act.use_cyclic = loop
    except Exception:
        pass
    return act, info


# --- позы -----------------------------------------------------------------

def body_idle(f):
    ph = 2 * math.pi * f / 48
    s, s2 = math.sin(ph), math.sin(2 * ph)
    rot = {
        'spine': (1.2 * s, 0, 0),
        'chest': (1.8 * s, 0, 0.8 * s),
        'head': (1.5 * s2, 0, 3.5 * s),
        'upper_arm_l': (3 * s, -1.5 * s, 0),
        'forearm_l': (-3 * s, 0, 0),
        'upper_arm_r': (-2.5 * s, 0, 0),
        'forearm_r': (-4 * s, 0, 0),
        'hand_r': (0, 0, 9 * s),
        'thigh_r': (0, 0, 0), 'thigh_l': (0, 0, 0),
    }
    loc = {'hips': (0, 0, -0.006 * (1 - math.cos(2 * ph)) / 2)}
    return rot, loc


def body_run(f):
    ph = 2 * math.pi * f / 16
    s, c = math.sin(ph), math.cos(ph)
    th_r, th_l = -38 * s, 38 * s
    sh_r = 12 + 62 * max(0.0, c) ** 1.5
    sh_l = 12 + 62 * max(0.0, -c) ** 1.5
    rot = {
        'hips': (0, 0, -6 * s),
        'spine': (8, 0, 5 * s),
        'chest': (4, 0, 5 * s),
        'head': (-9, 0, -4 * s),
        'thigh_r': (th_r, 0, 0), 'shin_r': (sh_r, 0, 0), 'foot_r': (-0.75 * (th_r + sh_r) + 6, 0, 0),
        'thigh_l': (th_l, 0, 0), 'shin_l': (sh_l, 0, 0), 'foot_l': (-0.75 * (th_l + sh_l) + 6, 0, 0),
        'upper_arm_l': (-34 * s, -10, 0), 'forearm_l': (-48 - 10 * s, 0, 0),
        'upper_arm_r': (-8 + 16 * s, 8, 0), 'forearm_r': (-8, 0, 0),
    }
    loc = {'hips': (0, 0, -0.035 + 0.022 * math.cos(2 * ph))}
    return rot, loc


def tracks_body(tracks):
    def body(f):
        rot, loc = {}, {}
        for (n, ch), keys in tracks.items():
            v = kf(f, keys)
            if ch == 'loc':
                loc[n] = v
            else:
                rot[n] = v
        return rot, loc
    return body


Z3 = (0, 0, 0)

DASH = {
    ('hips', 'loc'): [(0, Z3), (3, (0, -0.05, -0.09)), (8, (0, -0.05, -0.07)), (12, Z3)],
    ('spine', 'rot'): [(0, Z3), (3, (28, 0, 0)), (8, (24, 0, 0)), (12, Z3)],
    ('chest', 'rot'): [(0, Z3), (3, (10, 0, 0)), (8, (8, 0, 0)), (12, Z3)],
    ('head', 'rot'): [(0, Z3), (3, (-24, 0, 0)), (8, (-20, 0, 0)), (12, Z3)],
    ('thigh_r', 'rot'): [(0, Z3), (3, (-55, 0, 0)), (8, (-45, 0, 0)), (12, Z3)],
    ('shin_r', 'rot'): [(0, Z3), (3, (45, 0, 0)), (8, (38, 0, 0)), (12, Z3)],
    ('foot_r', 'rot'): [(0, Z3), (3, (12, 0, 0)), (12, Z3)],
    ('thigh_l', 'rot'): [(0, Z3), (3, (40, 0, 0)), (8, (34, 0, 0)), (12, Z3)],
    ('shin_l', 'rot'): [(0, Z3), (3, (50, 0, 0)), (8, (42, 0, 0)), (12, Z3)],
    ('foot_l', 'rot'): [(0, Z3), (3, (-22, 0, 0)), (12, Z3)],
    ('upper_arm_l', 'rot'): [(0, Z3), (3, (55, -15, 0)), (8, (45, -12, 0)), (12, Z3)],
    ('forearm_l', 'rot'): [(0, Z3), (3, (-20, 0, 0)), (12, Z3)],
    ('upper_arm_r', 'rot'): [(0, Z3), (3, (45, 12, 0)), (8, (40, 10, 0)), (12, Z3)],
    ('forearm_r', 'rot'): [(0, Z3), (3, (22, 0, 0)), (12, Z3)],
}


def dash_accel(f):
    if f < 3:
        return Vector((0, 30, 0))
    if 8 <= f < 11:
        return Vector((0, -18, 0))
    return Vector()


def dash_wind(f):
    return Vector((0, 8.0 if 2 <= f < 9 else 0.0, 0))


HIT = {
    ('hips', 'loc'): [(0, Z3), (2, (0, 0.045, -0.02)), (10, Z3)],
    ('spine', 'rot'): [(0, Z3), (2, (-14, 0, 4)), (10, Z3)],
    ('chest', 'rot'): [(0, Z3), (2, (-9, 0, 5)), (10, Z3)],
    ('head', 'rot'): [(0, Z3), (2, (-18, 0, 9)), (5, (-6, 0, 3)), (10, Z3)],
    ('upper_arm_l', 'rot'): [(0, Z3), (2, (-10, -28, 0)), (10, Z3)],
    ('forearm_l', 'rot'): [(0, Z3), (2, (-30, 0, 0)), (10, Z3)],
    ('upper_arm_r', 'rot'): [(0, Z3), (2, (-12, 18, 0)), (10, Z3)],
    ('thigh_r', 'rot'): [(0, Z3), (2, (-8, 0, 0)), (10, Z3)],
    ('shin_r', 'rot'): [(0, Z3), (2, (14, 0, 0)), (10, Z3)],
    ('thigh_l', 'rot'): [(0, Z3), (2, (-8, 0, 0)), (10, Z3)],
    ('shin_l', 'rot'): [(0, Z3), (2, (14, 0, 0)), (10, Z3)],
}


def hit_accel(f):
    return Vector((0, -22, 0)) if f < 2 else Vector()


DEATH = {
    ('root', 'rot'): [(0, Z3), (14, Z3), (27, (-86, 0, 6)), (31, (-80, 0, 6)), (36, (-88, 0, 6)), (44, (-88, 0, 6))],
    ('root', 'loc'): [(0, Z3), (14, Z3), (27, (0, 0.10, 0.20)), (36, (0, 0.10, 0.22)), (44, (0, 0.10, 0.22))],
    ('hips', 'loc'): [(0, Z3), (5, (0, 0.04, -0.01)), (14, (0, 0.06, -0.22)), (27, (0, 0.0, -0.05)), (44, (0, 0, -0.05))],
    ('spine', 'rot'): [(0, Z3), (5, (-16, 0, 6)), (14, (18, 0, -4)), (27, (-6, 0, 0)), (44, (-6, 0, 0))],
    ('chest', 'rot'): [(0, Z3), (5, (-10, 0, 4)), (14, (12, 0, 0)), (27, (-4, 0, 0)), (44, (-4, 0, 0))],
    ('head', 'rot'): [(0, Z3), (5, (-22, 0, 10)), (14, (22, 0, -6)), (27, (-18, 0, 25)), (31, (-8, 0, 30)),
                      (44, (-10, 0, 32))],
    ('thigh_r', 'rot'): [(0, Z3), (14, (-62, 6, 0)), (27, (-28, 10, 0)), (44, (-24, 12, 0))],
    ('shin_r', 'rot'): [(0, Z3), (14, (104, 0, 0)), (27, (40, 0, 0)), (44, (34, 0, 0))],
    ('foot_r', 'rot'): [(0, Z3), (14, (-40, 0, 0)), (27, (-10, 0, 0)), (44, (-12, 0, 0))],
    ('thigh_l', 'rot'): [(0, Z3), (14, (-58, -6, 0)), (27, (-12, -14, 0)), (44, (-10, -16, 0))],
    ('shin_l', 'rot'): [(0, Z3), (14, (100, 0, 0)), (27, (20, 0, 0)), (44, (16, 0, 0))],
    ('foot_l', 'rot'): [(0, Z3), (14, (-40, 0, 0)), (27, (-6, 0, 0)), (44, (-8, 0, 0))],
    ('upper_arm_l', 'rot'): [(0, Z3), (5, (-20, -40, 0)), (14, (-30, -20, 0)), (27, (-20, -80, 0)), (44, (-15, -84, 0))],
    ('forearm_l', 'rot'): [(0, Z3), (5, (-40, 0, 0)), (27, (-20, 0, 0)), (44, (-18, 0, 0))],
    ('upper_arm_r', 'rot'): [(0, Z3), (5, (-20, 40, 0)), (14, (-30, 25, 0)), (27, (-10, 75, 0)), (44, (-8, 80, 0))],
    ('forearm_r', 'rot'): [(0, Z3), (5, (10, 0, 0)), (27, (40, 0, 0)), (44, (42, 0, 0))],
}


def death_accel(f):
    if f < 4:
        return Vector((0, -18, 0))
    if 18 <= f < 26:
        return Vector((0, -6, 0))
    return Vector()


# --- удар по кругу (стартовая атака): корпус крутится на 360°, рука вытянута, фонарь летит по кругу
SWING_N = 20


def swing_turn(f):
    """угол поворота таза (градусы, против часовой сверху)."""
    return 360.0 * sstep(2.0, 16.0, f) if f < 16 else 360.0


SWING = {
    ('hips', 'loc'): [(0, Z3), (3, (0, 0, -0.05)), (16, (0, 0, -0.05)), (20, Z3)],
    ('spine', 'rot'): [(0, Z3), (3, (10, 0, -12)), (9, (12, 0, 6)), (16, (8, 0, 4)), (20, Z3)],
    ('chest', 'rot'): [(0, Z3), (3, (4, 0, -14)), (9, (4, 0, 8)), (16, (2, 0, 4)), (20, Z3)],
    ('head', 'rot'): [(0, Z3), (3, (-10, 0, 10)), (16, (-8, 0, -4)), (20, Z3)],
    ('upper_arm_r', 'rot'): [(0, Z3), (3, (0, 82, 0)), (16, (0, 80, 0)), (20, Z3)],
    ('forearm_r', 'rot'): [(0, Z3), (3, (55, 0, 0)), (16, (55, 0, 0)), (20, Z3)],
    ('upper_arm_l', 'rot'): [(0, Z3), (3, (-20, -55, 0)), (16, (-20, -50, 0)), (20, Z3)],
    ('forearm_l', 'rot'): [(0, Z3), (3, (-35, 0, 0)), (20, Z3)],
    ('thigh_r', 'rot'): [(0, Z3), (3, (-14, 12, 0)), (16, (-14, 12, 0)), (20, Z3)],
    ('shin_r', 'rot'): [(0, Z3), (3, (24, 0, 0)), (16, (24, 0, 0)), (20, Z3)],
    ('foot_r', 'rot'): [(0, Z3), (3, (-10, -12, 0)), (16, (-10, -12, 0)), (20, Z3)],
    ('thigh_l', 'rot'): [(0, Z3), (3, (-14, -12, 0)), (16, (-14, -12, 0)), (20, Z3)],
    ('shin_l', 'rot'): [(0, Z3), (3, (24, 0, 0)), (16, (24, 0, 0)), (20, Z3)],
    ('foot_l', 'rot'): [(0, Z3), (3, (-10, 12, 0)), (16, (-10, 12, 0)), (20, Z3)],
}
_swing_tracks = tracks_body(SWING)


def body_swing(f):
    rot, loc = _swing_tracks(f)
    rot['hips'] = (0, 0, swing_turn(f))
    return rot, loc


def chain_swing(f, rig, L):
    down = Vector((0, 0, -1))
    ang = math.radians(swing_turn(f))
    out = Vector((-1.0, 0.42, -0.22)).normalized()          # наружу вправо и с отставанием
    out = Matrix.Rotation(ang, 3, 'Z') @ out
    if f <= 3:
        d = down.slerp(out, sstep(0, 3, f)) if f > 0 else down
    elif f <= 16:
        d = out
    else:
        d = out.slerp(down, sstep(16, 20, f))
    return [d.copy() for _ in range(NL + 1)]


# --- заряжаемый удар Q: замах над головой, удар фонарём в землю перед собой
STRIKE_N = 32
STRIKE = {
    ('hips', 'loc'): [(0, Z3), (10, (0, 0.03, -0.03)), (14, (0, 0.03, -0.035)), (17, (0, -0.06, -0.13)),
                      (23, (0, -0.06, -0.12)), (32, Z3)],
    ('spine', 'rot'): [(0, Z3), (10, (-12, 0, 8)), (14, (-14, 0, 9)), (17, (30, 0, -6)), (23, (28, 0, -5)), (32, Z3)],
    ('chest', 'rot'): [(0, Z3), (10, (-8, 0, 12)), (14, (-9, 0, 13)), (17, (12, 0, -8)), (23, (10, 0, -6)), (32, Z3)],
    ('head', 'rot'): [(0, Z3), (10, (-12, 0, -6)), (14, (-12, 0, -7)), (17, (-26, 0, 4)), (23, (-24, 0, 3)), (32, Z3)],
    ('upper_arm_r', 'rot'): [(0, Z3), (5, (-90, 26, 0)), (10, (-180, 30, 0)), (14, (-184, 30, 0)), (15, (-155, 22, 0)),
                             (17, (-62, 8, 0)), (23, (-58, 8, 0)), (32, Z3)],
    ('forearm_r', 'rot'): [(0, Z3), (10, (45, 0, 0)), (14, (40, 0, 0)), (17, (50, 0, 0)), (23, (48, 0, 0)), (32, Z3)],
    ('upper_arm_l', 'rot'): [(0, Z3), (10, (-40, -20, 0)), (14, (-42, -20, 0)), (17, (30, -25, 0)), (23, (26, -22, 0)),
                             (32, Z3)],
    ('forearm_l', 'rot'): [(0, Z3), (10, (-50, 0, 0)), (17, (-25, 0, 0)), (32, Z3)],
    ('thigh_r', 'rot'): [(0, Z3), (10, (-6, 8, 0)), (17, (-48, 10, 0)), (23, (-46, 10, 0)), (32, Z3)],
    ('shin_r', 'rot'): [(0, Z3), (10, (10, 0, 0)), (17, (70, 0, 0)), (23, (66, 0, 0)), (32, Z3)],
    ('foot_r', 'rot'): [(0, Z3), (10, (-4, -8, 0)), (17, (-22, -10, 0)), (23, (-20, -10, 0)), (32, Z3)],
    ('thigh_l', 'rot'): [(0, Z3), (10, (10, -8, 0)), (17, (-8, -10, 0)), (23, (-8, -10, 0)), (32, Z3)],
    ('shin_l', 'rot'): [(0, Z3), (10, (14, 0, 0)), (17, (52, 0, 0)), (23, (50, 0, 0)), (32, Z3)],
    ('foot_l', 'rot'): [(0, Z3), (10, (-24, 8, 0)), (17, (-44, 10, 0)), (23, (-42, 10, 0)), (32, Z3)],
}
STRIKE_DIRS = [(0, (0, 0, -1)), (5, (0.05, 0.25, -0.97)), (10, (0.1, 0.55, -0.83)), (14, (0.1, 0.6, -0.8)),
               (15, (0.0, 0.35, 0.94)), (16, (0.0, -0.8, 0.6)), (17, (0.04, -0.62, -0.78)), (20, (0.04, -0.6, -0.8)),
               (23, (0.04, -0.62, -0.78)), (32, (0, 0, -1))]


def chain_strike(f, rig, L):
    keys = STRIKE_DIRS
    d = Vector(keys[-1][1])
    for (f0, a), (f1, b) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            u = (f - f0) / (f1 - f0)
            u = 0.5 - 0.5 * math.cos(math.pi * u) if f0 < 15 or f1 > 17 else u
            d = Vector(a).normalized().slerp(Vector(b).normalized(), u)
            break
    return [d.copy() for _ in range(NL + 1)]


def ground_clamp(dirs_fn):
    """Не даёт фонарю уйти под пол: если низ фонаря ниже 3 см — приподнимает направление цепи."""
    def f(fr, rig, L):
        dirs = dirs_fn(fr, rig, L)
        g = rig.grip(rig.fk(L))
        total = NL * LINK + LANT
        d = dirs[0]
        if g.z + d.z * total < 0.03:
            dz = (0.03 - g.z) / total
            h = Vector((d.x, d.y, 0))
            if h.length < 1e-6:
                h = Vector((0, -1, 0))
            h = h.normalized() * math.sqrt(max(0.0, 1 - dz * dz))
            d = Vector((h.x, h.y, dz))
            dirs = [d.copy() for _ in dirs]
        return dirs
    return f


def build_actions(rig):
    acts = []
    infos = {}

    def add(name, *a, **k):
        act, info = bake_action(rig, name, *a, **k)
        acts.append((name, act))
        infos[name] = info

    add('hero_idle', 48, body_idle, 'sim', loop=True)
    add('hero_run', 16, body_run, 'sim', loop=True, wind=lambda f: Vector((0, 2.2, 0)))
    add('hero_dash', 12, tracks_body(DASH), 'sim', accel=dash_accel, wind=dash_wind)
    add('hero_swing', SWING_N, body_swing, ground_clamp(chain_swing))
    add('hero_strike', STRIKE_N, tracks_body(STRIKE), ground_clamp(chain_strike))
    add('hero_hit', 10, tracks_body(HIT), 'sim', accel=hit_accel)
    add('hero_death', 44, tracks_body(DEATH), 'sim', accel=death_accel)
    rig.arm.animation_data.action = bpy.data.actions['hero_idle']
    return acts, infos


# ---------------------------------------------------------------- превью / экспорт

def set_engine(sc):
    for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = e
            return e
        except TypeError:
            continue
    return sc.render.engine


def get_coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def preview_rig(arm):
    coll = get_coll('preview')
    sc = bpy.context.scene
    fm = make_mat('preview_floor', '#b48f68', 0.92)
    me = bpy.data.meshes.new('preview_floor')
    s = 40
    me.from_pydata([(-s, -s, -0.002), (s, -s, -0.002), (s, s, -0.002), (-s, s, -0.002)], [], [(0, 1, 2, 3)])
    me.materials.append(fm)
    coll.objects.link(bpy.data.objects.new('preview_floor', me))
    ld = bpy.data.lights.new('preview_sun', 'SUN')
    ld.energy = 3.4
    ld.color = (1.0, 0.80, 0.58)
    ld.angle = math.radians(6)
    o = bpy.data.objects.new('preview_sun', ld)
    o.rotation_euler = (math.radians(42), math.radians(-18), math.radians(-35))
    coll.objects.link(o)
    ld = bpy.data.lights.new('preview_torch', 'POINT')
    ld.energy = 170
    ld.color = (1.0, 0.62, 0.32)
    ld.shadow_soft_size = 0.3
    o = bpy.data.objects.new('preview_torch', ld)
    o.location = (-2.5, -2.0, 2.6)
    coll.objects.link(o)
    ld = bpy.data.lights.new('preview_lantern', 'POINT')
    ld.energy = 40
    ld.color = (1.0, 0.7, 0.35)
    ld.shadow_soft_size = 0.05
    o = bpy.data.objects.new('preview_lantern', ld)
    o.parent = arm
    o.parent_type = 'BONE'
    o.parent_bone = 'lantern'
    o.location = (0, -LANT * 0.5, 0)     # родитель-кость: смещение от хвоста кости
    coll.objects.link(o)
    w = bpy.data.worlds.get('preview_world') or bpy.data.worlds.new('preview_world')
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next((n for n in w.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg:
        bg.inputs[0].default_value = (*srgb('#3a2a20'), 1)
        bg.inputs[1].default_value = 0.9
    sc.world = w
    try:
        sc.view_settings.exposure = 0.35
    except Exception:
        pass
    cd = bpy.data.cameras.new('preview_cam')
    cd.lens = 50
    cam = bpy.data.objects.new('preview_cam', cd)
    coll.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, target, az_deg, el_deg, dist):
    az, el = math.radians(az_deg), math.radians(el_deg)
    d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = 0.05
    cam.data.clip_end = 200


def render_to(path, res=(1024, 1024), samples=32):
    sc = bpy.context.scene
    set_engine(sc)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.film_transparent = False
    try:
        sc.eevee.taa_render_samples = samples
    except Exception:
        pass
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def show(arm, action, frame):
    arm.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)


POSES = [('hero_idle', 0), ('hero_run', 4), ('hero_dash', 5), ('hero_swing', 9), ('hero_strike', 15),
         ('hero_strike', 18)]


def previews(arm):
    d = ROOT + '/docs/survivors/models/previews/'
    os.makedirs(d, exist_ok=True)
    cam = preview_rig(arm)
    show(arm, 'hero_idle', 0)
    aim(cam, (0, 0, 0.72), 35, 16, 3.3)
    render_to(d + MID + '-3q.png')
    aim(cam, (0, -0.05, 0.6), 0, 55, 3.6)
    render_to(d + MID + '-top.png')
    # позы: отдельные кадры → сетка 3×2
    tmp = []
    for i, (a, f) in enumerate(POSES):
        show(arm, a, f)
        aim(cam, (0, -0.1, 0.7), 30, 28, 4.6)
        p = bpy.app.tempdir + 'hero_pose_%d.png' % i
        render_to(p, (512, 512), 24)
        tmp.append(p)
    compose(tmp, d + MID + '-poses.png', 3, 2, 512)
    show(arm, 'hero_idle', 0)


def compose(paths, out, cols, rows, size):
    import numpy as np
    W, H = cols * size, rows * size
    canvas = np.zeros((H, W, 4), dtype=np.float32)
    for i, p in enumerate(paths):
        im = bpy.data.images.load(p)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * size
        canvas[y0:y0 + size, c * size:(c + 1) * size] = px[:size, :size]
        bpy.data.images.remove(im)
    img = bpy.data.images.new('poses_sheet', W, H, alpha=False)
    img.pixels.foreach_set(canvas.ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def export_glb(arm, ob):
    p = ROOT + '/docs/survivors/models/%s.glb' % MID
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = arm
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    kw = dict(filepath=p, export_format='GLB', use_selection=True, export_cameras=False, export_lights=False,
              export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
              export_frame_range=False, export_anim_slide_to_zero=False, export_skins=True,
              export_all_influences=False, export_def_bones=False, export_texcoords=False, export_normals=True,
              export_apply=False, export_yup=True, export_extras=False, export_morph=False,
              export_current_frame=False, export_optimize_animation_size=False, export_materials='EXPORT',
              export_vertex_color='NONE', export_rest_position_armature=True, export_bake_animation=False,
              export_anim_single_armature=True, export_reset_pose_bones=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = {k: v for k, v in kw.items() if k in props or k == 'filepath'}
    bpy.ops.export_scene.gltf(**kw)
    arm.animation_data.action = bpy.data.actions['hero_idle']
    return p


def glb_info(p):
    with open(p, 'rb') as fh:
        data = fh.read()
    magic, ver, total = struct.unpack('<4sII', data[:12])
    ln, typ = struct.unpack('<I4s', data[12:20])
    js = json.loads(data[20:20 + ln])
    anims = []
    for a in js.get('animations', []):
        tmax = 0
        for s in a['samplers']:
            acc = js['accessors'][s['input']]
            tmax = max(tmax, acc.get('max', [0])[0])
        anims.append((a['name'], round(tmax * FPS)))
    ext = [b.get('uri') for b in js.get('buffers', []) if b.get('uri')] + \
          [i.get('uri') for i in js.get('images', []) if i.get('uri')]
    return dict(bytes=len(data), magic=magic.decode(), anims=anims, nodes=len(js['nodes']),
                skins=len(js.get('skins', [])), joints=len(js['skins'][0]['joints']) if js.get('skins') else 0,
                materials=[m['name'] for m in js.get('materials', [])], external=ext,
                cameras=len(js.get('cameras', [])), lights='KHR_lights_punctual' in js.get('extensionsUsed', []))


def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def main():
    sc = clean_scene()
    for d in MAT_DEFS:
        make_mat(d[0], d[1], d[2], d[3], d[4], d[5], d[6])
    me = build_mesh()
    arm, ob = build_rig(me)
    rig = Rig(arm)
    acts, infos = build_actions(rig)
    sc.frame_start, sc.frame_end = 0, 48
    sc.frame_set(0)
    res = dict(tris=tri_count(me), verts=len(me.vertices), bones=len(arm.data.bones),
               actions=[(n, int(a.frame_range[1] - a.frame_range[0])) for n, a in acts],
               lantern_min_z={k: round(v['lantern_min_z'], 3) for k, v in infos.items()},
               dims=tuple(round(x, 3) for x in ob.dimensions))
    if STAGE == 'all':
        previews(arm)
        os.makedirs(ROOT + '/docs/survivors/blender', exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=ROOT + '/docs/survivors/blender/%s.blend' % MID)
        p = export_glb(arm, ob)
        res['glb'] = glb_info(p)
        bpy.ops.wm.save_as_mainfile(filepath=ROOT + '/docs/survivors/blender/%s.blend' % MID)
    return res, infos


RESULT, INFOS = main()
print(json.dumps(RESULT, ensure_ascii=False, indent=1))
