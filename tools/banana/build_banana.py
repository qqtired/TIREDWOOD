"""Надувной банан на троих для «Банана за катером» (флаг BANANA, shared/banana.ts) — модель скриптом, Blender без окна.

Запуск (из корня game-opus):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/banana/build_banana.py -- \
      client/assets/banana/banana.glb tools/banana/banana.blend

Концепт — lab/banana/concept-b.webp (вариант «Б»: жёлтый банан с лицом на носу, коралловые поплавки и ручки).
Оси Blender: Y — к носу, Z — вверх, X — вправо; в GLB (Y вверх) нос уходит в −Z, как у лодок игры.
Ноль — ватерлиния под серединой банана. Места (shared/banana.ts BN_SEAT_Z = [−0,95; 0,2; 1,3] по оси игры) —
Y = 0,95; −0,2; −1,3 здесь. Верх сиденья ~0,58 над водой. Кольцо троса — узел «tow» у носа.
Без текстур: у каждой части свой материал с цветом (клиент склеивает всё в одну сетку с цветом в вершинах).
Бюджет — до 4 тыс. треугольников (предмет, AGENTS.md §7).
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_GLB = argv[0] if argv else 'banana.glb'
OUT_BLEND = argv[1] if len(argv) > 1 else ''

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ------------------------------------------------------------ материалы

PALETTE = {
    'bn_yellow': ((0.965, 0.79, 0.23), 0.28),
    'bn_yellow_dk': ((0.90, 0.66, 0.16), 0.32),
    'bn_coral': ((0.89, 0.29, 0.22), 0.3),
    'bn_handle': ((0.80, 0.18, 0.15), 0.35),
    'bn_green': ((0.38, 0.72, 0.30), 0.35),
    'bn_brown': ((0.45, 0.30, 0.17), 0.7),
    'bn_white': ((0.98, 0.97, 0.95), 0.2),
    'bn_dark': ((0.16, 0.12, 0.16), 0.25),
    'bn_cheek': ((0.96, 0.55, 0.47), 0.4),
    'bn_mouth': ((0.42, 0.13, 0.12), 0.4),
    'bn_rope': ((0.93, 0.89, 0.78), 0.8),
}


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


MATS = {}
for name, (col, rough) in PALETTE.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*[srgb_to_lin(c) for c in col], 1)
    bsdf.inputs['Roughness'].default_value = rough
    MATS[name] = m

ROOT = bpy.data.objects.new('banana', None)
scene.collection.objects.link(ROOT)


def mesh_obj(name, verts, faces, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    me.update()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(MATS[mat])
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.parent = ROOT
    return ob


def tube(name, centers, radii, mat, seg=16, cap0=True, cap1=True, squash=1.0, up=None):
    """Труба по точкам centers (Vector) с радиусами radii; концы — веер (cap). squash — сплюснуть по вертикали."""
    verts = []
    n = len(centers)
    for i, c in enumerate(centers):
        t = (centers[min(i + 1, n - 1)] - centers[max(i - 1, 0)]).normalized()
        upv = up if up is not None else Vector((0, 0, 1))
        side = t.cross(upv)
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        nrm = side.cross(t).normalized()
        r = radii[i]
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append(c + side * (math.cos(a) * r) + nrm * (math.sin(a) * r * squash))
    faces = []
    for i in range(n - 1):
        for k in range(seg):
            a = i * seg + k
            b = i * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    if cap0:
        verts.append(centers[0] - (centers[1] - centers[0]).normalized() * radii[0] * 0.25)
        ci = len(verts) - 1
        for k in range(seg):
            faces.append((ci, (k + 1) % seg, k))
    if cap1:
        verts.append(centers[-1] + (centers[-1] - centers[-2]).normalized() * radii[-1] * 0.25)
        ci = len(verts) - 1
        base = (n - 1) * seg
        for k in range(seg):
            faces.append((ci, base + k, base + (k + 1) % seg))
    return mesh_obj(name, verts, faces, mat)


def ellipsoid(name, center, radii, mat, seg=10, rings=7, rot=None):
    verts = []
    faces = []
    for j in range(1, rings):
        th = math.pi * j / rings
        for k in range(seg):
            ph = 2 * math.pi * k / seg
            v = Vector((math.sin(th) * math.cos(ph) * radii[0], math.sin(th) * math.sin(ph) * radii[1], math.cos(th) * radii[2]))
            verts.append(v)
    verts.append(Vector((0, 0, radii[2])))
    verts.append(Vector((0, 0, -radii[2])))
    top = len(verts) - 2
    bot = len(verts) - 1
    for j in range(rings - 2):
        for k in range(seg):
            a = j * seg + k
            b = j * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    for k in range(seg):
        faces.append((top, (k + 1) % seg, k))
        base = (rings - 2) * seg
        faces.append((bot, base + k, base + (k + 1) % seg))
    if rot is not None:
        verts = [rot @ v for v in verts]
    verts = [v + center for v in verts]
    return mesh_obj(name, verts, faces, mat)


def arc_torus(name, center, axis_x, axis_y, R, r, a0, a1, mat, seg=12, sides=6):
    """Дуга тора: окружность радиуса R в плоскости (axis_x, axis_y) от угла a0 до a1, трубка r."""
    ax = axis_x.normalized()
    ay = axis_y.normalized()
    n = ax.cross(ay).normalized()
    verts = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        c = center + ax * (math.cos(a) * R) + ay * (math.sin(a) * R)
        radial = (ax * math.cos(a) + ay * math.sin(a)).normalized()
        for k in range(sides):
            b = 2 * math.pi * k / sides
            verts.append(c + radial * (math.cos(b) * r) + n * (math.sin(b) * r))
    faces = []
    for i in range(seg):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    closed = abs(a1 - a0 - 2 * math.pi) < 1e-6
    if closed:
        pass
    return mesh_obj(name, verts, faces, mat)


def catmull(points, count):
    """Сглаженный путь через точки (Catmull-Rom), count точек."""
    pts = [points[0]] + points + [points[-1]]
    out = []
    segs = len(points) - 1
    for i in range(count):
        u = i / (count - 1) * segs
        s = min(int(u), segs - 1)
        t = u - s
        p0, p1, p2, p3 = pts[s], pts[s + 1], pts[s + 2], pts[s + 3]
        t2 = t * t
        t3 = t2 * t
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return out


# ------------------------------------------------------------ корпус: изогнутый банан

# ось банана в плоскости YZ: хвост (−2,3) → нос, задранный вверх
AXIS = [Vector((0, y, z)) for y, z in [(-2.32, 0.34), (-1.75, 0.27), (-0.9, 0.24), (0.0, 0.24), (0.85, 0.26), (1.45, 0.36), (1.88, 0.58), (2.12, 0.86), (2.2, 1.08)]]
N = 34
centers = catmull(AXIS, N)


def body_r(i):
    u = i / (N - 1)
    # хвост круглится, середина полная (сиденья), нос сужается к кончику
    tail = min(1.0, u / 0.11)
    tail = math.sin(tail * math.pi / 2)
    nose = 1.0 if u < 0.62 else max(0.0, 1 - (u - 0.62) / 0.38)
    r = 0.36 * (0.38 + 0.62 * tail) * (0.4 + 0.6 * nose ** 0.75)
    # лёгкие «горбики» между сиденьями: надувные секции
    r *= 1 + 0.03 * math.cos(u * math.pi * 7.5)
    return r


radii = [body_r(i) for i in range(N)]
body = tube('bn_body', centers, radii, 'bn_yellow', seg=18, squash=0.92)

# шов-полоса снизу корпуса потемнее (читается объём)
belly_c = [c + Vector((0, 0, -0.005)) for c in centers[3:22]]
# (тонкая полоска не нужна — объём даёт свет)

# зелёный кончик носа и коричневый «хвостик-плодоножка»
tip = centers[-1]
ellipsoid('bn_tip', tip + Vector((0, 0.0, 0.0)), (0.12, 0.12, 0.1), 'bn_green', seg=12, rings=7)
stem_c = [centers[0] + Vector((0, -0.02, 0.0)), centers[0] + Vector((0, -0.16, 0.05)), centers[0] + Vector((0, -0.26, 0.12))]
tube('bn_stem', stem_c, [0.07, 0.06, 0.055], 'bn_brown', seg=8)

# ------------------------------------------------------------ поплавки по бокам (коралловые)

for side in (-1, 1):
    pc = [Vector((side * 0.43, y, 0.13 + 0.02 * math.sin((y + 1.9) / 3.3 * math.pi))) for y in [-1.95 + 3.45 * i / 13 for i in range(14)]]
    pr = []
    for i in range(14):
        u = i / 13
        e = min(u, 1 - u) / 0.12
        pr.append(0.165 * (math.sin(min(1, e) * math.pi / 2) * 0.55 + 0.45))
    tube(f'bn_pontoon_{"r" if side > 0 else "l"}', pc, pr, 'bn_coral', seg=12)

# ------------------------------------------------------------ ручки перед каждым седоком

SEAT_Y = [0.95, -0.2, -1.3]


def top_at(y):
    """Верх корпуса над точкой y оси (по ближайшему кольцу)."""
    best = min(range(N), key=lambda i: abs(centers[i].y - y))
    return centers[best].z + radii[best] * 0.92


for k, sy in enumerate(SEAT_Y):
    hy = sy + 0.42
    z0 = top_at(hy) - 0.03
    arc_torus(f'bn_handle_{k}', Vector((0, hy, z0)), Vector((1, 0, 0)), Vector((0, 0, 1)), 0.15, 0.024, 0.0, math.pi, 'bn_handle', seg=12, sides=6)
    # накладки у основания ручки
    for sx in (-0.15, 0.15):
        ellipsoid(f'bn_patch_{k}_{"r" if sx > 0 else "l"}', Vector((sx, hy, z0 + 0.005)), (0.05, 0.06, 0.018), 'bn_handle', seg=6, rings=4)

# ------------------------------------------------------------ лицо на носу (с обеих сторон, как в концепте «Б»)

FACE_I = int(N * 0.80)
fc = centers[FACE_I]
fr = radii[FACE_I]
for side in (-1, 1):
    out = Vector((side, 0, 0))
    base = fc + out * (fr * 0.86)
    # глаз: белок, зрачок, блик
    for (dy, dz) in [(0.0, 0.12)]:
        eye_c = base + Vector((0, dy, dz))
        ellipsoid(f'bn_eye_{side}', eye_c, (0.03, 0.075, 0.095), 'bn_white', seg=10, rings=6)
        ellipsoid(f'bn_pupil_{side}', eye_c + out * 0.026 + Vector((0, 0.02, -0.01)), (0.012, 0.04, 0.055), 'bn_dark', seg=8, rings=5)
        ellipsoid(f'bn_glint_{side}', eye_c + out * 0.037 + Vector((0, 0.035, 0.025)), (0.006, 0.014, 0.016), 'bn_white', seg=6, rings=4)
    # бровь
    arc_torus(f'bn_brow_{side}', base + Vector((0, 0.0, 0.2)) + out * 0.01, Vector((0, 1, 0)), Vector((0, 0, 1)), 0.07, 0.011, math.radians(55), math.radians(125), 'bn_dark', seg=6, sides=4)
    # рот-улыбка ниже и чуть к носу
    arc_torus(f'bn_mouth_{side}', base + Vector((0, 0.1, -0.02)) + out * 0.015, Vector((0, 1, 0)), Vector((0, 0, 1)), 0.075, 0.016, math.radians(200), math.radians(340), 'bn_mouth', seg=8, sides=5)
    # щека
    ellipsoid(f'bn_cheek_{side}', base + Vector((0, -0.11, -0.03)) + out * 0.004, (0.012, 0.05, 0.035), 'bn_cheek', seg=8, rings=4)

# ------------------------------------------------------------ кольцо для троса у носа (узел tow)

# кольцо — под «подбородком» носа, у нижней кромки трубы: трос идёт к корме почти горизонтально
ring_i = min(range(N), key=lambda i: abs(centers[i].y - 1.98))
ring_y = centers[ring_i].y + 0.04
ring_z = centers[ring_i].z - radii[ring_i] * 0.8
arc_torus('bn_towring', Vector((0, ring_y + 0.05, ring_z)), Vector((0, 1, 0)), Vector((0, 0, 1)), 0.055, 0.016, 0.0, 2 * math.pi, 'bn_handle', seg=10, sides=5)
tow = bpy.data.objects.new('tow', None)
scene.collection.objects.link(tow)
tow.parent = ROOT
tow.location = (0, ring_y + 0.1, ring_z)

for k, sy in enumerate(SEAT_Y):
    e = bpy.data.objects.new(f'seat_{k}', None)
    scene.collection.objects.link(e)
    e.parent = ROOT
    e.location = (0, sy, top_at(sy))

# ------------------------------------------------------------ масштаб под желеек игры

# желейка ~1 м в ширину и 1,6 м в высоту: банан длиннее и толще концепта «в лоб» (места через ~1,5 м), чтобы трое
# сидели не впритык и банан читался под ними. Узлы seat_k/tow масштабируются вместе с корнем (shared/banana.ts — те же числа).
SCALE = (1.25, 1.3, 1.2)
ROOT.scale = SCALE

# ------------------------------------------------------------ итог

tris = 0
for ob in ROOT.children:
    if ob.type == 'MESH':
        me = ob.data
        tris += sum(len(p.vertices) - 2 for p in me.polygons)
print('BANANA_TRIS', tris)
for k, sy in enumerate(SEAT_Y):
    print('SEAT', k, 'y', round(sy * SCALE[1], 3), 'top', round(top_at(sy) * SCALE[2], 3))
print('TOW', tuple(round(v * s, 3) for v, s in zip(tow.location, SCALE)))

if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

for o in bpy.context.view_layer.objects:
    o.select_set(False)
for o in [ROOT] + list(ROOT.children_recursive):
    o.select_set(True)
bpy.context.view_layer.objects.active = ROOT
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
    export_extras=True, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
    export_animations=False, export_draco_mesh_compression_enable=False)
print('EXPORTED', OUT_GLB)
