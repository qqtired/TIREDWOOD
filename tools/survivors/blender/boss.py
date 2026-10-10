"""Подземелье — босс «Старый Повидл» (boss): пещерный червь с каменной головой и светящимися сегментами варенья.

Строит модель, скелет-цепь, действия, превью, .blend и GLB. Запуск внутри Blender (MCP):

    exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/boss.py').read(), {'STAGE': 'all'})

STAGE: 'build' — модель + анимации; 'all' — плюс превью, .blend и GLB.
ВНИМАНИЕ: скрипт очищает текущий файл Blender. Запускать в пустом файле.

Оси: метры, z=0 — пол пещеры, морда смотрит по -Y Blender (= +Z three.js). Начало координат — точка на полу
под головой. В позе покоя (bind) червь лежит прямо вдоль +Y; в анимациях он выходит из норы в точке (0, 3.4, 0):
всё, что ниже z=0, в игре скрыто полом.

Как устроены анимации: на каждый кадр задаётся осевая линия тела (путь «черепахой» из норы или волна ползания),
кости-сегменты раскладываются вдоль неё, челюсти — четыре каменные губы на шарнирах.
"""
import bpy, bmesh, math, os, json, struct, random
from mathutils import Vector, Matrix, Quaternion, Euler, noise

STAGE = globals().get('STAGE', 'all')
import sys
if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 1:
    STAGE = sys.argv[sys.argv.index('--') + 1]
ROOT = '/Users/tired/Desktop/game-opus-survivors'
MID = 'boss'
FPS = 24
SHARP_DEG = 33.0

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
    return a + (b - a) * t


def kf(f, keys):
    if f <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            u = (f - f0) / (f1 - f0)
            u = 0.5 - 0.5 * math.cos(math.pi * u)
            return v0 + (v1 - v0) * u
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
    sc.frame_end = 72
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


# Камень холоднее и темнее пола пещеры (#9C7B5B), чтобы червь не сливался с полом.
# Тело между плитами — тёмное глянцевое варенье; светится только glow_jam (палитра брифа): швы, трещины, глаза.
MAT_DEFS = [
    ('boss_stone',      '#6f6d6a', 0.86, 0.0, None, 0, False),
    ('boss_stone_dark', '#4b4947', 0.9, 0.0, None, 0, False),
    ('boss_jam',        '#4a1a63', 0.2, 0.0, None, 0, False),
    ('glow_jam',        '#b57bff', 0.3, 0.0, '#b57bff', 0.8, False),
    ('boss_mouth',      '#421540', 0.35, 0.0, None, 0, False),
    ('boss_throat',     '#16061a', 0.6, 0.0, '#2c0b38', 0.5, True),
    ('boss_teeth',      '#e3d8bf', 0.5, 0.0, None, 0, False),
    ('boss_drip',       '#2e0e42', 0.12, 0.0, '#8c55d9', 0.15, False),
]
MI = {d[0]: i for i, d in enumerate(MAT_DEFS)}

# ---------------------------------------------------------------- размеры и кости
L_HEAD = 3.5                      # голова: от шеи (s=3.5) до кончика пасти (s=0)
NSEG = 11
SEG = 1.15
LTOT = L_HEAD + NSEG * SEG        # 16.15 м
Y0, Z0 = -2.0, 1.85               # кончик пасти в позе покоя
HC = Vector((0, -0.15, Z0))       # центр головы в позе покоя
HA, HB, HCZ = 2.0, 1.85, 1.75     # полуоси головы (ширина 4 м)
BODY = ['body_%02d' % k for k in range(1, NSEG + 1)]   # body_01 у головы … body_11 хвост
JAWS = [('jaw_u', 0.0), ('jaw_l', 90.0), ('jaw_d', 180.0), ('jaw_r', -90.0)]
ORDER = ['root'] + list(reversed(BODY)) + ['head'] + [j for j, _ in JAWS]
PARENT = {'root': None, 'head': 'body_01'}
for k in range(1, NSEG + 1):
    PARENT['body_%02d' % k] = 'root' if k == NSEG else 'body_%02d' % (k + 1)
for j, _ in JAWS:
    PARENT[j] = 'head'
GI = {n: i for i, n in enumerate(ORDER)}


def srange(n):
    """(s у головы, s у хвоста) для кости-сегмента."""
    if n == 'head':
        return 0.0, L_HEAD
    k = int(n[5:])
    return L_HEAD + (k - 1) * SEG, L_HEAD + k * SEG


def R_of(s):
    return kf(s, [(2.2, 1.62), (3.5, 1.64), (6.0, 1.56), (9.0, 1.37), (12.0, 1.12), (14.6, 0.84), (LTOT, 0.42)])


def bind_C(s):
    return Vector((0, Y0 + s, Z0))


def hdir(a, b):
    return Vector((math.sin(a) * math.sin(b), -math.cos(a), math.sin(a) * math.cos(b)))


def hsurf(a_deg, b_deg, off=0.0):
    d = hdir(math.radians(a_deg), math.radians(b_deg))
    p = HC + Vector((HA * d.x, HB * d.y, HCZ * d.z))
    n = Vector((d.x / HA, d.y / HB, d.z / HCZ)).normalized()
    return p + n * off, n


def jaw_hinge(bc):
    return hsurf(75.0, bc, -0.1)[0], hsurf(42.0, bc, -0.15)[0]


# ---------------------------------------------------------------- геометрия
BM = None
DL = None


def commit(t, mat, wfn, M=None, recalc=False):
    if M is not None:
        bmesh.ops.transform(t, matrix=M, verts=t.verts)
    if recalc:
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
    vmap = {}
    for v in t.verts:
        nv = BM.verts.new(v.co)
        for n, w in wfn(nv.co).items():
            if w > 1e-4:
                nv[DL][GI[n]] = w
        vmap[v] = nv
    for f in t.faces:
        try:
            nf = BM.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            continue
        nf.material_index = MI[mat(f.calc_center_median()) if callable(mat) else mat]
        nf.smooth = True
    t.free()


def rigid(name):
    return lambda co: {name: 1.0}


def lathe_t(profile, segs, sx=1.0, sy=1.0, phase=0.0):
    t = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-7:
            rings.append([t.verts.new((0, 0, z))])
        else:
            rings.append([t.verts.new((r * math.cos(2 * math.pi * i / segs + phase) * sx,
                                       r * math.sin(2 * math.pi * i / segs + phase) * sy, z)) for i in range(segs)])
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
    return t


def sphere_t(segs=12, rings=8):
    prof = [(math.sin(math.pi * i / rings), -math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0], prof[-1] = (0.0, -1.0), (0.0, 1.0)
    return lathe_t(prof, segs)


def axis_m(p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    z = (p1 - p0).normalized()
    ref = Vector((0, -1, 0)) if abs(z.y) < 0.9 else Vector((1, 0, 0))
    x = (ref - z * ref.dot(z)).normalized()
    y = z.cross(x)
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = p0
    return M


def slab(surf, u0, u1, v0, v1, nu, nv, t_out, t_in, bulge, namp, seed, mat, wfn):
    """Каменная плита на поверхности surf(u, v) -> (точка, нормаль): подушка с рваным краем."""
    t = bmesh.new()
    outer, inner = [], []
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    rr = random.Random(int(seed * 1000))
    tu, tv = rr.uniform(-1, 1) * t_out * 0.6, rr.uniform(-1, 1) * t_out * 0.6
    du, dv = (u1 - u0) / nu, (v1 - v0) / nv
    for j in range(nv + 1):
        for i in range(nu + 1):
            edge = i in (0, nu) or j in (0, nv)
            corner = i in (0, nu) and j in (0, nv)
            # рваный контур: узлы сетки сдвинуты случайно (край сильнее)
            jit = 0.24 if edge else 0.14
            u = u0 + du * (i + rr.uniform(-jit, jit))
            v = v0 + dv * (j + rr.uniform(-jit, jit))
            # скол: угол или кусок края срезан вниз и внутрь
            chip = 0.0
            if corner and rr.random() < 0.65:
                chip = rr.uniform(0.45, 0.9)
            elif edge and rr.random() < 0.3:
                chip = rr.uniform(0.3, 0.7)
            if chip:
                u += (0.5 * (u0 + u1) - u) * 0.18 * chip
                v += (0.5 * (v0 + v1) - v) * 0.18 * chip
            p, n = surf(u, v)
            # фаска: край низкий, первый внутренний ряд — уже почти полная высота
            pill = min(1.0, min(i, nu - i)) * min(1.0, min(j, nv - j))
            pill = 0.82 * pill + 0.18 * (math.sin(math.pi * i / nu) * math.sin(math.pi * j / nv))
            nz = noise.noise(p * 1.25 + off) + 0.45 * noise.noise(p * 3.1 + off)
            slope = tu * (i / nu - 0.5) + tv * (j / nv - 0.5)
            h = t_out * (0.18 + 0.82 * pill) + bulge * pill * 0.3 + namp * 1.35 * nz + slope * pill
            h *= (1.0 - 0.75 * chip)
            outer.append(t.verts.new(p + n * h))
            inner.append(t.verts.new(p - n * t_in))

    def ix(i, j):
        return j * (nu + 1) + i
    for j in range(nv):
        for i in range(nu):
            t.faces.new((outer[ix(i, j)], outer[ix(i + 1, j)], outer[ix(i + 1, j + 1)], outer[ix(i, j + 1)]))
            t.faces.new((inner[ix(i, j)], inner[ix(i, j + 1)], inner[ix(i + 1, j + 1)], inner[ix(i + 1, j)]))
    border = [(i, 0) for i in range(nu)] + [(nu, j) for j in range(nv)] + \
             [(i, nv) for i in range(nu, 0, -1)] + [(0, j) for j in range(nv, 0, -1)]
    for k in range(len(border)):
        a, b = ix(*border[k]), ix(*border[(k + 1) % len(border)])
        t.faces.new((outer[a], inner[a], inner[b], outer[b]))
    commit(t, mat, wfn, recalc=True)


def seam(pts, nrms, w, h, mat, wfn):
    """Тонкий светящийся шов-трещина: плоская полоска вдоль ломаной на поверхности."""
    t = bmesh.new()
    rings = []
    n = len(pts)
    for i, (p, nr) in enumerate(zip(pts, nrms)):
        tan = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = nr.cross(tan).normalized()
        taper = 0.35 if i in (0, n - 1) else 1.0
        rings.append([t.verts.new(p + side * (w * taper)), t.verts.new(p + nr * h),
                      t.verts.new(p - side * (w * taper)), t.verts.new(p - nr * h * 0.5)])
    for A, B in zip(rings, rings[1:]):
        for k in range(4):
            t.faces.new((A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]))
    t.faces.new(rings[0])
    t.faces.new(list(reversed(rings[-1])))
    commit(t, mat, wfn, recalc=True)


def partition(rnd, lo, hi, n, gap):
    """Случайное деление [lo, hi] на n кусков разной ширины с зазором gap между ними."""
    w = [rnd.uniform(0.55, 1.7) for _ in range(n)]
    tot = sum(w)
    out, x = [], lo
    for wi in w:
        x1 = x + (hi - lo) * wi / tot
        out.append((x + gap / 2, x1 - gap / 2))
        x = x1
    return out


def body_surf(phi_deg, s):
    ph = math.radians(phi_deg)
    n = Vector((math.sin(ph), 0, math.cos(ph)))
    return bind_C(s) + n * R_of(s), n


def head_surf(a_deg, b_deg):
    return hsurf(a_deg, b_deg)


TOWARD_HEAD = {'head': None, 'body_01': 'head'}
TOWARD_TAIL = {'head': 'body_01', BODY[-1]: None}
for _k in range(2, NSEG + 1):
    TOWARD_HEAD['body_%02d' % _k] = 'body_%02d' % (_k - 1)
for _k in range(1, NSEG):
    TOWARD_TAIL['body_%02d' % _k] = 'body_%02d' % (_k + 1)


def tube_w(s):
    """Веса трубы тела по s: у каждого сустава плавное смешивание соседних костей (±0.45 м)."""
    n0 = 'head' if s <= L_HEAD else BODY[min(NSEG - 1, int((s - L_HEAD) // SEG))]
    a, b = srange(n0)
    W = 0.45
    if s - a < W and TOWARD_HEAD[n0]:
        w = 0.5 * (1 - (s - a) / W)
        return {n0: 1 - w, TOWARD_HEAD[n0]: w}
    if b - s < W and TOWARD_TAIL[n0]:
        w = 0.5 * (1 - (b - s) / W)
        return {n0: 1 - w, TOWARD_TAIL[n0]: w}
    return {n0: 1.0}


def jaw_blend(beta_deg):
    ws = {}
    for j, bc in JAWS:
        d = math.radians(beta_deg - bc)
        ws[j] = max(0.0, math.cos(d)) ** 2
    tot = sum(ws.values())
    return {j: w / tot for j, w in ws.items()}


def beta_of(co):
    return math.degrees(math.atan2(co.x - HC.x, co.z - HC.z))


def build_mesh():
    global BM, DL
    BM = bmesh.new()
    DL = BM.verts.layers.deform.verify()
    rnd = random.Random(7)

    # --- труба тела: тёмное глянцевое варенье под плитами; на стыках сегментов — тонкий светящийся шов
    SEGS = 22
    t = bmesh.new()
    rings = []
    BW = 0.045
    joints = [L_HEAD + k * SEG for k in range(NSEG)]
    grid = [2.3 + i * 0.33 for i in range(int((LTOT - 0.25 - 2.3) / 0.33) + 1)] + [LTOT - 0.12]
    grid = [g for g in grid if all(abs(g - j) > BW + 0.06 for j in joints)]
    s_list = sorted(grid + [j - BW for j in joints] + [j + BW for j in joints])
    for s in s_list:
        c = bind_C(s)
        r = R_of(s) - 0.02
        rings.append([t.verts.new(c + Vector((math.sin(2 * math.pi * i / SEGS) * r, 0,
                                              math.cos(2 * math.pi * i / SEGS) * r))) for i in range(SEGS)])
    tip = t.verts.new(bind_C(LTOT + 0.1))
    for A, B in zip(rings, rings[1:]):
        for i in range(SEGS):
            t.faces.new((A[i], A[(i + 1) % SEGS], B[(i + 1) % SEGS], B[i]))
    for i in range(SEGS):
        t.faces.new((rings[-1][i], rings[-1][(i + 1) % SEGS], tip))
    commit(t, lambda c: 'glow_jam' if min(abs(c.y - Y0 - j) for j in joints) < BW else 'boss_jam',
           lambda co: tube_w(co.y - Y0), recalc=False)

    # --- голова: ядро (эллипсоид с дырой пасти), глотка, губа, зубы
    Mh = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()   # локальная Z → -Y (вперёд), Y → +Z
    Mh.translation = HC
    prof = []
    for i in range(15):
        a = math.radians(180 - (180 - 40) * i / 14)
        prof.append((0.0 if i == 0 else math.sin(a), HB * math.cos(a)))

    def core_w(co):
        a = math.degrees(math.acos(clamp(-(co.y - HC.y) / HB, -1, 1)))
        wj = 1 - sstep(41, 62, a)
        out = {'head': 1 - wj}
        for j, w in jaw_blend(beta_of(co)).items():
            out[j] = wj * w
        return out
    commit(lathe_t(prof, 24, HA, HCZ), 'boss_jam', core_w, Mh)
    # глотка: от кромки внутрь (нормали внутрь)
    a40 = math.radians(40)
    zr, rr = HB * math.cos(a40), math.sin(a40)
    tprof = [(rr * 0.97, zr - 0.02), (rr * 0.84, zr - 0.35), (rr * 0.62, zr - 0.85), (rr * 0.34, zr - 1.4),
             (0.0, zr - 1.75)]

    def throat_w(co):
        depth = (co.y - (HC.y - zr))
        wh = sstep(0.05, 0.7, depth)
        out = {'head': wh}
        for j, w in jaw_blend(beta_of(co)).items():
            out[j] = (1 - wh) * w
        return out
    commit(lathe_t(tprof, 24, HA, HCZ), 'boss_throat', throat_w, Mh)
    # губа-валик по кромке пасти
    NR, NV = 32, 6
    t = bmesh.new()
    rg = []
    for i in range(NR):
        b = 360.0 * i / NR
        p, n = hsurf(41.5, b)
        radial = Vector((math.sin(math.radians(b)), 0, math.cos(math.radians(b))))
        fwd = Vector((0, -1, 0))
        ring = []
        for k in range(NV):
            th = 2 * math.pi * k / NV
            ring.append(t.verts.new(p + (radial * math.cos(th) + fwd * math.sin(th)) * 0.17 - radial * 0.06))
        rg.append(ring)
    for i in range(NR):
        A, B = rg[i], rg[(i + 1) % NR]
        for k in range(NV):
            t.faces.new((A[k], B[k], B[(k + 1) % NV], A[(k + 1) % NV]))
    commit(t, 'boss_mouth', lambda co: jaw_blend(beta_of(co)), recalc=True)

    def tooth(base, d, length, r, w, segs=6):
        prof = [(0.0, -0.06), (r, 0.0), (r * 0.72, length * 0.45), (r * 0.3, length * 0.82), (0.0, length)]
        commit(lathe_t(prof, segs), 'boss_teeth', w, axis_m(base, base + d))
    for i in range(16):
        b = 360.0 * (i + 0.5) / 16
        p, n = hsurf(43.0, b)
        radial = Vector((math.sin(math.radians(b)), 0, math.cos(math.radians(b))))
        d = (-radial * 0.78 + Vector((0, -1, 0)) * 0.5).normalized()
        big = 1.0 + 0.25 * abs(math.cos(math.radians(b)))
        jw = max(jaw_blend(b).items(), key=lambda kv: kv[1])[0]
        tooth(p - radial * 0.08, d, 0.5 * big * rnd.uniform(0.9, 1.1), 0.16 * big, rigid(jw))
    for i in range(12):
        b = 360.0 * i / 12
        radial = Vector((math.sin(math.radians(b)), 0, math.cos(math.radians(b))))
        p = HC + Vector((0, -(zr - 0.5), 0)) + Vector((radial.x * HA, 0, radial.z * HCZ)) * (rr * 0.8)
        d = (-radial * 0.9 + Vector((0, -1, 0)) * 0.25).normalized()
        tooth(p, d, 0.34 * rnd.uniform(0.9, 1.1), 0.11, rigid('head'))

    def stone():
        return 'boss_stone' if rnd.random() < 0.6 else 'boss_stone_dark'

    def head_seam(pairs, w=0.032, h=0.03):
        pts, nrms = [], []
        for a, b in pairs:
            p, n = hsurf(a, b, -0.01)
            pts.append(p)
            nrms.append(n)
        seam(pts, nrms, w, h, 'glow_jam', rigid('head'))

    def lin(x0, x1, n):
        return [x0 + (x1 - x0) * i / (n - 1) for i in range(n)]

    # --- губы-челюсти (4 каменные плиты вокруг пасти) и трещины между ними
    for j, bc in JAWS:
        slab(head_surf, 46.0, 71.0, bc - 41, bc + 41, 4, 6, 0.16, 0.16, 0.16, 0.05,
             rnd.random() * 10, stone(), rigid(j))
        head_seam([(a, bc + 45) for a in lin(47, 71, 4)])

    # --- глаза: две пары в щели за губами (светятся)
    for a, b, r in ((76.0, 30.0, 0.25), (79.0, 58.0, 0.18)):
        for sgn in (-1, 1):
            p, n = hsurf(a, sgn * b, 0.04)
            M = Matrix.Translation(p) @ Matrix.Diagonal((r, r, r, 1))
            commit(sphere_t(12, 8), 'glow_jam', rigid('head'), M)

    # --- бронеплиты головы: два пояса из плит разной ширины, часть плит расколота надвое
    rows = [(83.0, 107.0, -160.0, 160.0, rnd.randint(6, 8)), (110.0, 136.0, -152.0, 152.0, rnd.randint(5, 7))]
    for a0, a1, b0, b1, n in rows:
        cuts = partition(rnd, b0, b1, n, 5.0)
        for k, (bb0, bb1) in enumerate(cuts):
            aa0, aa1 = a0 + rnd.uniform(-1.5, 1.5), a1 + rnd.uniform(-1.5, 1.5)
            nb = max(3, int(round((bb1 - bb0) / 11)))
            if rnd.random() < 0.3:
                am = lerp(aa0, aa1, rnd.uniform(0.4, 0.6))
                for x0, x1 in ((aa0, am - 1.5), (am + 1.5, aa1)):
                    slab(head_surf, x0, x1, bb0, bb1, 3, nb, 0.2 * rnd.uniform(0.8, 1.2), 0.18, 0.16, 0.07,
                         rnd.random() * 10, stone(), rigid('head'))
                head_seam([(am, b) for b in lin(bb0 + 1, bb1 - 1, 3)])
            else:
                slab(head_surf, aa0, aa1, bb0, bb1, 4, nb, 0.2 * rnd.uniform(0.8, 1.25), 0.18, 0.2, 0.07,
                     rnd.random() * 10, stone(), rigid('head'))
            if k < len(cuts) - 1:
                bg = 0.5 * (bb1 + cuts[k + 1][0])
                head_seam([(a, bg) for a in lin(a0 + 1, a1 - 1, 3)])
        head_seam([(a0 - 1.8, b) for b in lin(b0, b1, 30)])
    head_seam([(137.5, b) for b in lin(-150, 150, 26)])

    # --- бронеплиты тела: кольцо из 3–6 плит разной ширины, часть расколота поперёк; низ — открытое варенье
    for k in range(1, NSEG + 1):
        n = 'body_%02d' % k
        a, b = srange(n)
        rot = rnd.uniform(-12, 12)
        sc = clamp(R_of((a + b) / 2) / 1.6, 0.45, 1.0)
        cuts = partition(rnd, -155 + rot, 155 + rot, rnd.randint(3, 6), rnd.uniform(4.5, 7.0))
        sw = rigid(n)
        for c_i, (p0, p1) in enumerate(cuts):
            th = rnd.uniform(0.8, 1.3)
            s0, s1 = a + rnd.uniform(0.03, 0.16), b - rnd.uniform(0.03, 0.16)
            nu = max(3, int(round((p1 - p0) / 14)))
            args = ((0.13 * sc + 0.03) * th, 0.14 * sc, 0.12 * sc * th, 0.07 * sc)
            if rnd.random() < 0.3 and (p1 - p0) > 35:
                sm = lerp(s0, s1, rnd.uniform(0.4, 0.6))
                for x0, x1 in ((s0, sm - 0.05), (sm + 0.05, s1)):
                    slab(body_surf, p0, p1, x0, x1, nu, 3, *args, rnd.random() * 10, stone(), sw)
                pts = [body_surf(ph, sm)[0] for ph in lin(p0 + 2, p1 - 2, 3)]
                seam(pts, [body_surf(ph, sm)[1] for ph in lin(p0 + 2, p1 - 2, 3)], 0.03 * sc + 0.008, 0.025,
                     'glow_jam', sw)
            else:
                slab(body_surf, p0, p1, s0, s1, nu, 4, *args, rnd.random() * 10, stone(), sw)
            if c_i < len(cuts) - 1:
                pg = 0.5 * (p1 + cuts[c_i + 1][0])
                ss = lin(a + 0.04, b - 0.04, 3)
                seam([body_surf(pg, x)[0] for x in ss], [body_surf(pg, x)[1] for x in ss], 0.03 * sc + 0.008, 0.025,
                     'glow_jam', sw)

    # --- капли и пятна варенья (тёмные, со слабым свечением)
    def drip(top, length, r, w, segs=8):
        prof = [(0.0, -length - r), (r * 0.75, -length - r * 0.65), (r, -length), (r * 0.72, -length + r * 0.8),
                (r * 0.42, -length * 0.45), (r * 0.55, -0.05), (r * 0.8, 0.08), (0.0, 0.12)]
        commit(lathe_t(prof, segs), 'boss_drip', w, Matrix.Translation(top))
    for b, ln in ((160, 0.5), (180, 0.75), (203, 0.42)):
        p, n = hsurf(48.0, b, 0.05)
        drip(p, ln, 0.1, rigid('jaw_d'))
    for b in (-100, 96):
        p, n = hsurf(108.0, b, 0.05)
        drip(p, 0.45, 0.09, rigid('head'))
    for k, phi in ((2, 152), (4, -150), (6, 150), (8, -152), (10, 150)):
        n = 'body_%02d' % k
        a, b = srange(n)
        p, nn = body_surf(phi, (a + b) / 2)
        drip(p + nn * 0.05, 0.35, 0.08, rigid(n))

    def splat(c, nrm, rx, ry, w):
        M = axis_m(c, c + nrm) @ Matrix.Diagonal((rx, ry, 0.05, 1))
        commit(sphere_t(10, 5), 'boss_jam', w, M)
    for a, b in ((92, -12), (97, 40), (120, -60)):
        p, n = hsurf(a, b, 0.3)
        splat(p, n, 0.32, 0.24, rigid('head'))
    for k, phi in ((1, 8), (3, -60), (5, 20), (7, 60), (9, -10)):
        n = 'body_%02d' % k
        a, b = srange(n)
        sc = R_of((a + b) / 2) / 1.6
        p, nn = body_surf(phi, (a + b) / 2)
        splat(p + nn * (0.24 * sc + 0.02), nn, 0.3 * sc, 0.22 * sc, rigid(n))

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

def bone_ends_bind(n):
    if n == 'root':
        return Vector((0, 0, 0)), Vector((0, 0, 1.0))
    if n in BODY or n == 'head':
        sa, sb = srange(n)
        return bind_C(sb), bind_C(sa)
    bc = dict(JAWS)[n]
    return jaw_hinge(bc)


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
    for n in ORDER:
        eb = ad.edit_bones.new(n)
        h, t = bone_ends_bind(n)
        eb.head, eb.tail = h, t
        if n in BODY or n == 'head':
            eb.align_roll(Vector((0, 0, 1)))
        elif n == 'root':
            eb.align_roll(Vector((0, -1, 0)))
        else:
            bc = math.radians(dict(JAWS)[n])
            eb.align_roll(Vector((math.sin(bc), 0, math.cos(bc))))
        if PARENT[n]:
            eb.parent = ad.edit_bones[PARENT[n]]
            eb.use_connect = False
        eb.use_deform = n != 'root'
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


# ---------------------------------------------------------------- осевая линия и позы
HOLE = Vector((0, 3.4, 0))
O_IDLE = 18.0
PATH_DS = 0.1


def frame3(p_base, p_tip, up):
    y = (p_tip - p_base).normalized()
    z = up - y * up.dot(y)
    if z.length < 1e-6:
        z = y.orthogonal()
    z.normalize()
    x = y.cross(z)
    return Matrix((x, y, z)).transposed()


class Curve:
    """Ломаная от кончика пасти (s=0) к хвосту, с вектором «спины» в каждой точке."""

    def __init__(self, pts, ups, ds, s0=0.0):
        self.pts, self.ups, self.ds, self.s0 = pts, ups, ds, s0

    def at(self, s):
        s = s - self.s0
        f = s / self.ds
        i = int(math.floor(f))
        if i < 0:
            return self.pts[0] + (self.pts[0] - self.pts[1]).normalized() * (-s), self.ups[0]
        if i >= len(self.pts) - 1:
            d = (self.pts[-1] - self.pts[-2]).normalized()
            return self.pts[-1] + d * (s - (len(self.pts) - 1) * self.ds), self.ups[-1]
        u = f - i
        return self.pts[i].lerp(self.pts[i + 1], u), self.ups[i].lerp(self.ups[i + 1], u)


def path_curve(P):
    """Путь «черепахой» из-под земли через нору; голова на длине пути P['o'].

    P: o — где кончик пасти на пути, tilt — наклон столба вперёд (град), curl — изгиб дуги (1 = покой),
    neck — доп. кивок головы вниз (град), sway/sph — покачивание вбок, yaw — поворот головы (град),
    roll — крен (град на весь путь), lie — изгиб у самой норы (град, для «упал на землю»).
    """
    tilt = math.radians(P.get('tilt', 25.0))
    T = Vector((0, -math.sin(tilt), math.cos(tilt)))
    U = Vector((0, math.cos(tilt), math.sin(tilt)))
    anchor = HOLE - T * 8.0
    o = P['o']
    K1 = math.radians(76) / 2.8 * P.get('curl', 1.0)
    neck = math.radians(P.get('neck', 0.0))
    yaw = math.radians(P.get('yaw', 0.0))
    sway, sph = P.get('sway', 0.0), P.get('sph', 0.0)
    roll = math.radians(P.get('roll', 0.0))
    lie = math.radians(P.get('lie', 0.0))
    pmin = o - LTOT - 1.0
    T0, U0 = T.copy(), U.copy()
    seq = []
    p = math.floor(pmin / PATH_DS) * PATH_DS
    while p < 0:
        seq.append((p, anchor + T0 * p, U0.copy()))
        p += PATH_DS
    p = 0.0
    pos = anchor.copy()
    while p <= o + 2 * PATH_DS:
        if p >= pmin - PATH_DS:
            seq.append((p, pos.copy(), U.copy()))
        pos, T, U = _turtle_step(pos, T, U, p, PATH_DS, K1, neck, o, yaw, sway, sph, roll, lie)
        p += PATH_DS
    seq.reverse()                       # от головы к хвосту: s = o - p растёт
    return Curve([x[1] for x in seq], [x[2] for x in seq], PATH_DS, o - seq[0][0])


def _turtle_step(pos, T, U, p, ds, K1, neck, o, yaw, sway, sph, roll, lie):
    pos = pos + T * ds
    kp = K1 * (sstep(11.2, 11.9, p) - sstep(13.8, 14.5, p))
    kp += lie / 2.2 * (sstep(7.6, 8.2, p) - sstep(9.6, 10.4, p))
    pn = o - L_HEAD
    kp += neck / 0.8 * (sstep(pn - 0.9, pn - 0.6, p) - sstep(pn - 0.2, pn + 0.1, p))
    ky = sway * math.sin(sph - 0.35 * (p - 9.0)) * sstep(8.4, 10.0, p)
    ky += yaw / 0.8 * (sstep(pn - 0.9, pn - 0.6, p) - sstep(pn - 0.2, pn + 0.1, p))
    S = T.cross(U)
    if kp:
        R = Matrix.Rotation(-kp * ds, 3, S)
        T, U = R @ T, R @ U
    if ky:
        R = Matrix.Rotation(ky * ds, 3, U)
        T = R @ T
    if roll:
        R = Matrix.Rotation(roll / 18.0 * ds * sstep(8.0, 10.0, p), 3, T)
        U = R @ U
    T.normalize()
    U = (U - T * U.dot(T)).normalized()
    return pos, T, U


def crawl_curve(f, N):
    """Ползание волной на месте: тело лежит вдоль +Y, хвост уходит под землю."""
    ph = 2 * math.pi * f / N
    lam = 8.0
    k = 2 * math.pi / lam
    raw = []
    y = Y0
    while y <= Y0 + LTOT + 3.0:
        s = y - Y0
        A = 1.05 * sstep(1.0, 6.5, s)
        x = A * math.sin(k * s - ph) - 0.12 * math.sin(-ph) * (1 - sstep(0, 3, s))
        zc = kf(s, [(0, 1.78), (3.5, 1.62), (6.0, 1.5), (9.0, 1.32), (12.0, 1.08)])
        zc -= 2.6 * sstep(11.0, 16.5, s)
        zc += 0.18 * math.sin(k * 0.5 * s - ph + 1.0) * sstep(4, 8, s)
        raw.append(Vector((x, y, zc)))
        y += 0.05
    # равномерно по длине дуги
    pts = [raw[0]]
    acc = 0.0
    nxt = PATH_DS
    for a, b in zip(raw, raw[1:]):
        d = (b - a).length
        while acc + d >= nxt:
            u = (nxt - acc) / d
            pts.append(a.lerp(b, u))
            nxt += PATH_DS
        acc += d
    ups = []
    up = Vector((0, 0, 1))
    for i in range(len(pts)):
        tan = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = (up - tan * up.dot(tan)).normalized()
        ups.append(up.copy())
    return Curve(pts, ups, PATH_DS)


# ---------------------------------------------------------------- позы → кости
class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.rel = {n: (self.rest[PARENT[n]].inverted() @ self.rest[n]) if PARENT[n] else self.rest[n].copy()
                    for n in ORDER}
        bindc = Curve([bind_C(i * PATH_DS) for i in range(int(LTOT / PATH_DS) + 3)],
                      [Vector((0, 0, 1))] * (int(LTOT / PATH_DS) + 3), PATH_DS)
        self.fbind = {n: self.chain_frame(bindc, n)[1] for n in BODY + ['head']}
        self.jaw_axis = {}
        for j, bc in JAWS:
            b = math.radians(bc)
            a = math.radians(75.0)
            ax = Vector((HA * math.sin(a) * math.cos(b), 0, -HCZ * math.sin(a) * math.sin(b))).normalized()
            Rr = self.rest[j].to_3x3()
            axl = (Rr.inverted() @ ax).normalized()
            # знак: открытие отодвигает кончик губы от оси пасти
            tail = Vector((0, arm.data.bones[j].length, 0))
            q = Quaternion(axl, math.radians(20))
            p_open = self.rest[j] @ (q @ tail)
            p_rest = self.rest[j] @ tail
            rad = lambda p: Vector((p.x - HC.x, 0, p.z - HC.z)).length
            self.jaw_axis[j] = axl if rad(p_open) > rad(p_rest) else -axl

    def chain_frame(self, curve, n):
        sa, sb = srange(n)
        pb, ub = curve.at(sb)
        pa, ua = curve.at(sa)
        return pb, frame3(pb, pa, (ub + ua).normalized())

    def pose(self, curve, jaw_deg=0.0, scales=None, jaw_extra=None):
        M = {'root': self.rest['root'].copy()}
        for n in list(reversed(BODY)) + ['head']:
            p, F = self.chain_frame(curve, n)
            R = F @ self.fbind[n].transposed() @ self.rest[n].to_3x3()
            s = (scales or {}).get(n, 1.0)
            Mn = R.to_4x4() @ Matrix.Diagonal((s, s, s, 1))
            Mn.translation = p
            M[n] = Mn
        basis = {}
        for n in list(reversed(BODY)) + ['head']:
            basis[n] = (self.rel[n].inverted() @ M[PARENT[n]].inverted() @ M[n])
        for j, _ in JAWS:
            ang = jaw_deg + (jaw_extra or {}).get(j, 0.0)
            q = Quaternion(self.jaw_axis[j], math.radians(ang))
            basis[j] = q.to_matrix().to_4x4()
            M[j] = M['head'] @ self.rel[j] @ basis[j]
        return basis, M

    def head_low(self, M):
        """Самая низкая точка головы (по осям эллипсоида) и центр головы."""
        Mh = M['head'] @ self.rest['head'].inverted()
        c = Mh @ HC
        R = Mh.to_3x3()
        ext = math.sqrt((R[2][0] * HA) ** 2 + (R[2][1] * HB) ** 2 + (R[2][2] * HCZ) ** 2)
        return c.z - ext, c


def bake(rig, name, N, fn, loop=False):
    arm = rig.arm
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    info = {'head_low': [], 'head_c': []}
    for f in range(N + 1):
        curve, jaw, scales, jex = fn(f)
        basis, M = rig.pose(curve, jaw, scales, jex)
        lo, c = rig.head_low(M)
        info['head_low'].append(round(lo, 2))
        info['head_c'].append(tuple(round(x, 2) for x in c))
        for n, B in basis.items():
            loc, q, sc = B.decompose()
            if n in prev and prev[n].dot(q) < 0:
                q = -q
            prev[n] = q
            pb = arm.pose.bones[n]
            pb.location, pb.rotation_quaternion, pb.scale = loc, q, sc
            pb.keyframe_insert('location', frame=f, group=n)
            pb.keyframe_insert('rotation_quaternion', frame=f, group=n)
            pb.keyframe_insert('scale', frame=f, group=n)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = N
    try:
        act.use_cyclic = loop
    except Exception:
        pass
    return act, info


# --- параметры действий ------------------------------------------------------

def idle_P(f):
    ph = 2 * math.pi * f / 72
    return dict(o=O_IDLE + 0.18 * math.sin(2 * ph), curl=1.0 + 0.05 * math.sin(2 * ph + 0.6),
                neck=12.0 + 4.0 * math.sin(ph + 0.5), sway=0.04, sph=ph, yaw=7.0 * math.sin(ph - 1.2), tilt=14.0)


def idle_jaw(f):
    return 5.0 + 5.0 * (0.5 - 0.5 * math.cos(4 * math.pi * f / 72))


def breathe(f, N, amp=0.025, cycles=2):
    ph = 2 * math.pi * cycles * f / N
    return {n: 1.0 + amp * math.sin(ph - 0.45 * k) for k, n in enumerate(BODY)}


def act_idle(f):
    return path_curve(idle_P(f)), idle_jaw(f), breathe(f, 72), None


def act_move(f):
    N = 48
    ph = 2 * math.pi * f / N
    return crawl_curve(f, N), 6.0 + 4.0 * (0.5 - 0.5 * math.cos(2 * ph)), breathe(f, N, 0.02, 2), None


def mix_P(a, b, u):
    keys = set(a) | set(b)
    return {k: lerp(a.get(k, b.get(k, 0.0)), b.get(k, a.get(k, 0.0)), u) for k in keys}


def tracks_P(f, tracks, base0, base1, N):
    """tracks: {параметр: [(кадр, значение)]}; значения None = взять из базы (idle на 0 и N)."""
    P = mix_P(base0, base1, f / N)
    for k, keys in tracks.items():
        ks = [(fr, (base0[k] if v == 'i0' else base1[k] if v == 'i1' else v)) for fr, v in keys]
        P[k] = kf(f, ks)
    return P


I0 = idle_P(0)


def act_emerge(f):
    N = 48
    P = tracks_P(f, {
        'o': [(0, 6.3), (5, 7.2), (22, O_IDLE + 1.5), (31, O_IDLE + 0.5), (40, O_IDLE - 0.15), (N, 'i1')],
        'curl': [(0, 0.15), (16, 0.45), (26, 0.85), (36, 1.08), (N, 'i1')],
        'neck': [(0, -25), (18, -22), (28, -8), (38, 5), (N, 'i1')],
        'yaw': [(0, 0), (N, 'i1')],
        'sway': [(0, 0), (N, 'i1')],
    }, I0, I0, N)
    P['yaw'] += 6.0 * math.sin(f * 1.3) * (sstep(14, 20, f) - sstep(30, 38, f))
    jaw = kf(f, [(0, 0), (12, 0), (22, 38), (32, 30), (42, 8), (N, idle_jaw(0))])
    return path_curve(P), jaw, breathe(f, N, 0.03, 3), None


def act_burrow(f):
    N = 40
    P = tracks_P(f, {
        'o': [(0, 'i0'), (9, O_IDLE + 0.9), (15, O_IDLE + 0.6), (N, 5.6)],
        'curl': [(0, 'i0'), (9, 0.8), (17, 1.25), (N, 0.4)],
        'neck': [(0, 'i0'), (9, -18), (17, 22), (N, 10)],
        'yaw': [(0, 'i0'), (9, -6), (N, 0)],
        'sway': [(0, 'i0'), (N, 0)],
    }, I0, I0, N)
    jaw = kf(f, [(0, idle_jaw(0)), (8, 26), (16, 6), (N, 0)])
    return path_curve(P), jaw, breathe(f, N, 0.03, 2), None


SLAM_IMPACT = 22


def slam_P(f, tilt_hit):
    N = 48
    return tracks_P(f, {
        'o': [(0, 'i0'), (14, O_IDLE + 1.2), (17, O_IDLE + 1.3), (SLAM_IMPACT, O_IDLE + 1.6), (30, O_IDLE + 1.5),
              (N, 'i1')],
        'tilt': [(0, 'i0'), (14, 10.0), (17, 8.0), (SLAM_IMPACT, tilt_hit), (25, tilt_hit - 1.5), (30, tilt_hit - 1.0),
                 (N, 'i1')],
        'curl': [(0, 'i0'), (14, 0.7), (17, 0.68), (SLAM_IMPACT, 1.25), (30, 1.22), (N, 'i1')],
        'neck': [(0, 'i0'), (14, -24), (17, -26), (SLAM_IMPACT, 30), (30, 26), (N, 'i1')],
        'yaw': [(0, 'i0'), (14, 0), (30, 0), (N, 'i1')],
        'sway': [(0, 'i0'), (14, 0), (30, 0), (N, 'i1')],
    }, I0, I0, N)


def act_slam(f, tilt_hit=55.0):
    N = 48
    jaw = kf(f, [(0, idle_jaw(0)), (14, 24), (19, 30), (SLAM_IMPACT, 4), (30, 6), (N, idle_jaw(0))])
    return path_curve(slam_P(f, tilt_hit)), jaw, breathe(f, N, 0.03, 2), None


SPIT_FRAME = 15


def act_spit(f):
    N = 36
    P = tracks_P(f, {
        'o': [(0, 'i0'), (11, O_IDLE - 0.5), (SPIT_FRAME, O_IDLE + 1.0), (21, O_IDLE + 0.6), (N, 'i1')],
        'curl': [(0, 'i0'), (11, 0.78), (SPIT_FRAME, 1.12), (21, 1.06), (N, 'i1')],
        'neck': [(0, 'i0'), (11, -24), (SPIT_FRAME, 6), (21, 4), (N, 'i1')],
        'yaw': [(0, 'i0'), (11, 0), (21, 0), (N, 'i1')],
        'sway': [(0, 'i0'), (11, 0), (21, 0), (N, 'i1')],
    }, I0, I0, N)
    jaw = kf(f, [(0, idle_jaw(0)), (10, 14), (SPIT_FRAME, 46), (19, 34), (27, 10), (N, idle_jaw(0))])
    # «глоток»: вздутие бежит от хвоста к голове перед плевком
    sc = {}
    for k, n in enumerate(BODY):
        peak = SPIT_FRAME - 1.0 - k * 0.9
        sc[n] = 1.0 + 0.13 * math.exp(-((f - peak) / 2.2) ** 2)
    return path_curve(P), jaw, sc, None


def act_roar(f):
    N = 60
    P = tracks_P(f, {
        'o': [(0, 'i0'), (12, O_IDLE + 0.8), (46, O_IDLE + 0.7), (N, 'i1')],
        'curl': [(0, 'i0'), (12, 0.66), (46, 0.7), (N, 'i1')],
        'neck': [(0, 'i0'), (12, -30), (46, -26), (N, 'i1')],
        'yaw': [(0, 'i0'), (12, 0), (46, 0), (N, 'i1')],
        'sway': [(0, 'i0'), (12, 0.0), (46, 0.0), (N, 'i1')],
    }, I0, I0, N)
    env = sstep(10, 15, f) - sstep(42, 48, f)
    P['yaw'] += 7.0 * math.sin(f * 1.7) * env
    P['neck'] += 3.0 * math.sin(f * 2.3) * env
    jaw = kf(f, [(0, idle_jaw(0)), (12, 52), (44, 48), (52, 14), (N, idle_jaw(0))])
    jex = {'jaw_d': 8.0 * env}
    return path_curve(P), jaw, breathe(f, N, 0.04, 6), jex


def death_P(f, neck_end):
    N = 72
    P = tracks_P(f, {
        'o': [(0, 'i0'), (26, O_IDLE + 0.6), (58, O_IDLE - 0.4), (N, O_IDLE - 1.0)],
        'curl': [(0, 'i0'), (26, 0.8), (54, 0.0), (N, 0.0)],
        'tilt': [(0, 'i0'), (26, 20.0), (52, 83.0), (56, 79.0), (60, 82.0), (N, 82.0)],
        'neck': [(0, 'i0'), (8, -20), (26, -14), (54, neck_end), (N, neck_end)],
        'yaw': [(0, 'i0'), (N, 0)],
        'sway': [(0, 'i0'), (8, 0.09), (26, 0.09), (40, 0.0), (N, 0)],
        'roll': [(0, 0), (40, 0), (N, 26)],
    }, I0, I0, N)
    P['sph'] = f * 0.55
    return P


def act_death(f, neck_end=8.0):
    N = 72
    jaw = kf(f, [(0, idle_jaw(0)), (8, 44), (26, 40), (52, 30), (N, 26)])
    sc = breathe(f, N, 0.05 * (1 - sstep(30, 60, f)), 7)
    return path_curve(death_P(f, neck_end)), jaw, sc, None


def solve(fn, target, lo, hi, it=18):
    """Бисекция: fn монотонна по параметру; ищет значение, где fn(x) == target."""
    flo = fn(lo) - target
    for _ in range(it):
        mid = (lo + hi) / 2
        fm = fn(mid) - target
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return (lo + hi) / 2


def build_actions(rig):
    acts, infos = [], {}
    # подбор: голова касается пола в кадре удара; в смерти голова ложится на пол
    # нора под таким Y, чтобы центр головы в покое стоял над началом координат
    cs = [rig.head_low(rig.pose(path_curve(idle_P(f)), 0)[1])[1] for f in (0, 18, 36, 54)]
    HOLE.y -= sum(c.y for c in cs) / 4
    HOLE.x -= sum(c.x for c in cs) / 4
    global I0
    I0 = idle_P(0)
    tilt_hit = solve(lambda t: rig.head_low(rig.pose(path_curve(slam_P(SLAM_IMPACT, t)), 0)[1])[0], 0.05, 15.0, 85.0)
    neck_end = solve(lambda nk: rig.head_low(rig.pose(path_curve(death_P(72, nk)), 0)[1])[0], -0.12, -30.0, 60.0)
    specs = [
        ('boss_idle', 72, act_idle, True),
        ('boss_move', 48, act_move, True),
        ('boss_emerge', 48, act_emerge, False),
        ('boss_burrow', 40, act_burrow, False),
        ('boss_slam', 48, lambda f: act_slam(f, tilt_hit), False),
        ('boss_spit', 36, act_spit, False),
        ('boss_roar', 60, act_roar, False),
        ('boss_death', 72, lambda f: act_death(f, neck_end), False),
    ]
    for name, N, fn, loop in specs:
        act, info = bake(rig, name, N, fn, loop)
        acts.append((name, act))
        infos[name] = info
    infos['_solved'] = dict(tilt_hit=round(tilt_hit, 2), neck_end=round(neck_end, 2), hole=tuple(round(x, 2) for x in HOLE),
                           idle_head=tuple(round(x, 2) for x in rig.head_low(rig.pose(path_curve(idle_P(0)), 0)[1])[1]))
    rig.arm.animation_data.action = bpy.data.actions['boss_idle']
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
    s = 80
    me.from_pydata([(-s, -s, -0.002), (s, -s, -0.002), (s, s, -0.002), (-s, s, -0.002)], [], [(0, 1, 2, 3)])
    me.materials.append(fm)
    coll.objects.link(bpy.data.objects.new('preview_floor', me))
    # нора — тёмное пятно на полу
    hm = make_mat('preview_hole', '#2a1c14', 1.0)
    t = bmesh.new()
    bmesh.ops.create_circle(t, cap_ends=True, segments=32, radius=2.3)
    hme = bpy.data.meshes.new('preview_hole')
    t.to_mesh(hme)
    t.free()
    hme.materials.append(hm)
    ho = bpy.data.objects.new('preview_hole', hme)
    ho.location = (HOLE.x, HOLE.y - 0.6, 0.004)
    ho.scale = (1.0, 1.25, 1.0)
    coll.objects.link(ho)
    ld = bpy.data.lights.new('preview_sun', 'SUN')
    ld.energy = 3.4
    ld.color = (1.0, 0.80, 0.58)
    ld.angle = math.radians(6)
    o = bpy.data.objects.new('preview_sun', ld)
    o.rotation_euler = (math.radians(42), math.radians(-18), math.radians(-35))
    coll.objects.link(o)
    ld = bpy.data.lights.new('preview_torch', 'POINT')
    ld.energy = 14000
    ld.color = (1.0, 0.62, 0.32)
    ld.shadow_soft_size = 1.0
    o = bpy.data.objects.new('preview_torch', ld)
    o.location = (-9, -15, 12)
    coll.objects.link(o)
    ld = bpy.data.lights.new('preview_jamlight', 'POINT')
    ld.energy = 0
    ld.color = (0.75, 0.45, 1.0)
    ld.shadow_soft_size = 1.5
    o = bpy.data.objects.new('preview_jamlight', ld)
    o.location = (6, 6, 5)
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
    cam.data.clip_start = 0.1
    cam.data.clip_end = 400


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


POSES = [('boss_idle', 0), ('boss_move', 12), ('boss_emerge', 18), ('boss_slam', 15), ('boss_slam', SLAM_IMPACT),
         ('boss_roar', 26)]


def previews(arm):
    d = ROOT + '/docs/survivors/models/previews/'
    os.makedirs(d, exist_ok=True)
    cam = preview_rig(arm)
    show(arm, 'boss_idle', 0)
    aim(cam, (0, 1.6, 3.4), 32, 12, 25.0)
    render_to(d + MID + '-3q.png')
    aim(cam, (0, 1.6, 2.2), 0, 55, 26.0)
    render_to(d + MID + '-top.png')
    tmp = []
    hole = bpy.data.objects.get('preview_hole')
    for i, (a, f) in enumerate(POSES):
        show(arm, a, f)
        if hole:
            hole.hide_render = a == 'boss_move'
        if a == 'boss_move':
            aim(cam, (0, 5.5, 1.0), 40, 34, 26.0)
        else:
            aim(cam, (0, 0.0, 3.2), 38, 22, 27.0)
        p = bpy.app.tempdir + 'boss_pose_%d.png' % i
        render_to(p, (512, 512), 24)
        tmp.append(p)
    compose(tmp, d + MID + '-poses.png', 3, 2, 512)
    if hole:
        hole.hide_render = False
    show(arm, 'boss_idle', 0)


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
        pb.scale = Vector((1, 1, 1))
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
    arm.animation_data.action = bpy.data.actions['boss_idle']
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
        make_mat(*d)
    me = build_mesh()
    arm, ob = build_rig(me)
    rig = Rig(arm)
    acts, infos = build_actions(rig)
    sc.frame_start, sc.frame_end = 0, 72
    sc.frame_set(0)
    res = dict(tris=tri_count(me), verts=len(me.vertices), bones=len(arm.data.bones),
               actions=[(n, int(a.frame_range[1] - a.frame_range[0])) for n, a in acts],
               solved=infos['_solved'],
               head_low_min={k: min(v['head_low']) for k, v in infos.items() if k != '_solved'},
               dims_bind=tuple(round(x, 2) for x in ob.dimensions))
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
