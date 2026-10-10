# envkit_b.py — общие помощники наборов окружения «Подземелья», набор B
# (kit_buildings, plaza_entrance, kit_jam, kit_mine, kit_extras).
# Запуск внутри Blender: exec(open('<repo>/tools/survivors/blender/<kit>.py').read()),
# каждый скрипт набора сам подключает этот файл.
#
# Набор = один .blend и один GLB. Внутри каждый проп — корень с именем <id> (или <id>_<вариант>),
# origin в основании (z=0), вперёд по −Y. Подвижные части — дочерние объекты <id>_<часть> с origin в оси.
# Пропы раскладываются сеткой без пересечений. Анимации — ключи на частях, каждое действие — NLA-дорожка
# с именем действия; экспорт glTF (NLA_TRACKS) склеивает дорожки одного имени в одну анимацию.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, Euler, noise
from mathutils.bvhtree import BVHTree

ROOT = '/Users/tired/Desktop/game-opus-survivors'
FPS = 24
TAU = math.tau


# ---------------------------------------------------------------- цвета / материалы
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h, a=1.0):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (_lin(r), _lin(g), _lin(b), a)


# имя -> (базовый цвет, roughness, metallic, эмиссия (цвет) или None, сила эмиссии)
# Палитра брифа — имена ровно оттуда. Свечение — только glow_*.
PAL = {
    'stone_floor':  ('#9C7B5B', 0.88, 0.0, None, 0.0),
    'stone_wall':   ('#5A4334', 0.92, 0.0, None, 0.0),
    'stone_dark':   ('#3A2C25', 0.95, 0.0, None, 0.0),
    'wood':         ('#7A5232', 0.78, 0.0, None, 0.0),
    'wood_dark':    ('#4E3322', 0.82, 0.0, None, 0.0),
    'iron':         ('#4A4A50', 0.45, 0.75, None, 0.0),
    'brass':        ('#B8893A', 0.35, 0.85, None, 0.0),
    'moss':         ('#5E7A3A', 0.95, 0.0, None, 0.0),
    'mush_cap':     ('#E8D3B0', 0.60, 0.0, None, 0.0),
    'mush_stem':    ('#D9C6A5', 0.65, 0.0, None, 0.0),
    'jam':          ('#6B2A8C', 0.15, 0.0, None, 0.0),
    'glow_fire':    ('#FF9A3C', 0.50, 0.0, '#FF9A3C', 1.3),
    'glow_crystal': ('#3FD6C6', 0.20, 0.0, '#3FD6C6', 0.9),
    'glow_jam':     ('#B57BFF', 0.30, 0.0, '#B57BFF', 1.2),
    # сверх палитры (в отчёте): светлый камень солнечной площади, «ничто» в глубине зева, красная краска бочки,
    # лицевая плоскость доски рекордов (игра кладёт туда холст с текстом)
    'plaza_stone':      ('#D8C29C', 0.85, 0.0, None, 0.0),
    'plaza_stone_warm': ('#C4A47C', 0.88, 0.0, None, 0.0),
    'void':             ('#120D0B', 1.00, 0.0, None, 0.0),
    'paint_red':        ('#A3352B', 0.60, 0.0, None, 0.0),
    'board_face':       ('#E6D7B8', 0.80, 0.0, None, 0.0),
}


def mat(key):
    m = bpy.data.materials.get(key)
    if m:
        return m
    base, rough, metal, eh, es = PAL[key]
    m = bpy.data.materials.new(key)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = hexc(base)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if eh:
        sock = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
        sock.default_value = hexc(eh)
        bsdf.inputs['Emission Strength'].default_value = es
    m.diffuse_color = hexc(base)
    return m


# ---------------------------------------------------------------- сцена
def clean_scene():
    sc = bpy.context.scene
    for s in list(bpy.data.scenes):
        if s != sc:
            bpy.data.scenes.remove(s)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.collections, bpy.data.meshes, bpy.data.materials, bpy.data.actions,
                 bpy.data.cameras, bpy.data.lights, bpy.data.curves, bpy.data.node_groups, bpy.data.worlds):
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
    sc.frame_set(0)
    return sc


def get_coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


# ---------------------------------------------------------------- геометрия
def _cr(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)


def resample(vals, n):
    m = len(vals)
    if n is None or n == m or m < 3:
        if n and m == 2 and n > 2:
            return [vals[0] + (vals[1] - vals[0]) * (k / (n - 1)) for k in range(n)]
        return list(vals)
    out = []
    for k in range(n):
        u = k * (m - 1) / (n - 1)
        i = min(int(u), m - 2)
        t = u - i
        out.append(_cr(vals[max(i - 1, 0)], vals[i], vals[i + 1], vals[min(i + 2, m - 1)], t))
    return out


def arc_sample(pts, step, smooth_n=None):
    """Точки вдоль ломаной (сглаженной Catmull-Rom) через равные расстояния step. -> [(p, tangent)]"""
    P = [Vector(p) for p in pts]
    if smooth_n:
        P = resample(P, smooth_n)
    L = [0.0]
    for a, b in zip(P[:-1], P[1:]):
        L.append(L[-1] + (b - a).length)
    out = []
    d = step * 0.5
    i = 0
    while d <= L[-1] - step * 0.4:
        while i < len(P) - 2 and L[i + 1] < d:
            i += 1
        seg = L[i + 1] - L[i]
        t = 0 if seg < 1e-9 else (d - L[i]) / seg
        p = P[i].lerp(P[i + 1], t)
        tg = (P[i + 1] - P[i]).normalized()
        out.append((p, tg))
        d += step
    return out


def V(*a):
    if len(a) == 1:
        return Vector(a[0])
    return Vector(a)


def rot_m(rot):
    return Euler(rot).to_matrix().to_4x4()


class Part:
    """Жёсткая часть: копит геометрию в bmesh в координатах пропа (origin пропа = (0,0,0) в основании).
    joint — где будет origin этой части (ось вращения / основание)."""

    def __init__(self, name, joint=(0, 0, 0), sharp=40.0):
        self.name = name
        self.joint = Vector(joint)
        self.bm = bmesh.new()
        self.mats = []
        self.sharp = sharp
        self.uv = None  # (origin, u_axis, v_axis, w, h) для плоскости-холста

    def mi(self, key):
        if key not in self.mats:
            self.mats.append(key)
        return self.mats.index(key)

    def _done(self, before, key, smooth=True):
        idx = self.mi(key)
        new = [f for f in self.bm.faces if f not in before]
        for f in new:
            f.material_index = idx
            f.smooth = smooth
        return new

    # --- ядро: соединить кольца вершин
    def _loft(self, rings, key, closed=True, recalc=True, smooth=True):
        bm = self.bm
        idx = self.mi(key)
        faces = []
        for a, b in zip(rings[:-1], rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                n = len(b)
                for k in range(n):
                    faces.append(bm.faces.new((a[0], b[k], b[(k + 1) % n])))
            elif len(b) == 1:
                n = len(a)
                for k in range(n):
                    faces.append(bm.faces.new((a[k], a[(k + 1) % n], b[0])))
            else:
                n = len(a)
                rng = range(n) if closed else range(n - 1)
                for k in rng:
                    faces.append(bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k])))
        for f in faces:
            f.material_index = idx
            f.smooth = smooth
        if recalc and faces:
            bmesh.ops.recalc_face_normals(bm, faces=faces)
        return faces

    def _ring(self, c, S, N, rx, ry, seg, phase=0.0, fn=None):
        if rx < 1e-6 and ry < 1e-6:
            return [self.bm.verts.new(c)]
        out = []
        for k in range(seg):
            a = TAU * (k / seg) + phase
            p = c + S * (math.cos(a) * rx) + N * (math.sin(a) * ry)
            if fn:
                p = fn(p)
            out.append(self.bm.verts.new(p))
        return out

    def tube(self, key, pts, radii, seg=8, n=None, up=(0, 0, 1), caps=('round', 'round'),
             cap_k=0.9, cap_steps=2, fn=None, phase=None):
        """Труба по сплайну Catmull-Rom; radii — число или (rx, ry) на каждую точку. caps: round/flat/none."""
        P = resample([Vector(p) for p in pts], n)
        if isinstance(radii, (int, float)):
            radii = [radii] * len(pts)
        R = [Vector((r, r)) if isinstance(r, (int, float)) else Vector(r) for r in radii]
        R = resample(R, n)
        m = len(P)
        T = []
        for i in range(m):
            a = P[max(i - 1, 0)]
            b = P[min(i + 1, m - 1)]
            T.append((b - a).normalized())
        upv = Vector(up)
        N = upv - T[0] * upv.dot(T[0])
        if N.length < 1e-4:
            alt = Vector((0, -1, 0)) if abs(T[0].y) < 0.9 else Vector((1, 0, 0))
            N = alt - T[0] * alt.dot(T[0])
        N.normalize()
        frames = []
        for i in range(m):
            if i > 0:
                N = T[i - 1].rotation_difference(T[i]) @ N
                N = (N - T[i] * N.dot(T[i])).normalized()
            S = T[i].cross(N).normalized()
            frames.append((S, N))
        ph = (math.pi / seg) if phase is None else phase
        specs = []
        S0, N0 = frames[0]
        r0 = (R[0].x + R[0].y) * 0.5
        if caps[0] == 'round' and r0 > 1e-5:
            specs.append((P[0] - T[0] * r0 * cap_k, S0, N0, 0, 0))
            for s in range(cap_steps - 1, 0, -1):
                th = (math.pi / 2) * s / cap_steps
                specs.append((P[0] - T[0] * r0 * cap_k * math.sin(th), S0, N0, R[0].x * math.cos(th), R[0].y * math.cos(th)))
        elif caps[0] == 'flat' and r0 > 1e-5:
            specs.append((P[0], S0, N0, 0, 0))
        for i in range(m):
            S, Nn = frames[i]
            specs.append((P[i], S, Nn, max(R[i].x, 0), max(R[i].y, 0)))
        S1, N1 = frames[-1]
        r1 = (R[-1].x + R[-1].y) * 0.5
        if caps[1] == 'round' and r1 > 1e-5:
            for s in range(1, cap_steps):
                th = (math.pi / 2) * s / cap_steps
                specs.append((P[-1] + T[-1] * r1 * cap_k * math.sin(th), S1, N1, R[-1].x * math.cos(th), R[-1].y * math.cos(th)))
            specs.append((P[-1] + T[-1] * r1 * cap_k, S1, N1, 0, 0))
        elif caps[1] == 'flat' and r1 > 1e-5:
            specs.append((P[-1], S1, N1, 0, 0))
        rings = [self._ring(c, S, Nn, rx, ry, seg, ph, fn) for (c, S, Nn, rx, ry) in specs]
        return self._loft(rings, key)

    def ellipsoid(self, key, c, r, seg=10, rings=6, rot=(0, 0, 0), fn=None, unit_fn=None, floor=None):
        c = Vector(c)
        if isinstance(r, (int, float)):
            r = (r, r, r)
        M = Euler(rot).to_matrix()
        rl = []
        for k in range(rings + 1):
            phi = math.pi * k / rings
            z = math.cos(phi)
            s = math.sin(phi)
            ring = []
            cnt = 1 if k in (0, rings) else seg
            for j in range(cnt):
                a = TAU * j / seg
                v = Vector((s * math.cos(a), s * math.sin(a), z))
                if unit_fn:
                    v = unit_fn(v)
                v = Vector((v.x * r[0], v.y * r[1], v.z * r[2]))
                p = c + M @ v
                if fn:
                    p = fn(p)
                if floor is not None and p.z < floor:
                    p.z = floor
                ring.append(self.bm.verts.new(p))
            rl.append(ring)
        return self._loft(rl, key)

    def dome(self, key, c, r, seg=10, rings=4, rot=(0, 0, 0), fn=None):
        """Полусфера (верх эллипсоида) с плоским низом-полюсом."""
        c = Vector(c)
        if isinstance(r, (int, float)):
            r = (r, r, r)
        M = Euler(rot).to_matrix()
        rl = []
        for k in range(rings + 1):
            phi = (math.pi / 2) * k / rings
            z = math.cos(phi)
            s = math.sin(phi)
            cnt = 1 if k == 0 else seg
            ring = []
            for j in range(cnt):
                a = TAU * j / seg
                v = Vector((s * math.cos(a) * r[0], s * math.sin(a) * r[1], z * r[2]))
                p = c + M @ v
                if fn:
                    p = fn(p)
                ring.append(self.bm.verts.new(p))
            rl.append(ring)
        rl.append([self.bm.verts.new(c)])
        return self._loft(rl, key)

    def lathe(self, key, profile, seg=16, c=(0, 0, 0), sx=1.0, sy=1.0, rot=(0, 0, 0), fn=None, smooth=True,
              phase=0.0, orient=None):
        """Тело вращения вокруг локальной Z: profile = [(r, z)...], r=0 даёт полюс.
        orient — для открытых оболочек: 'up' / 'down' (нормали по локальной Z), 'out' / 'in' (от оси / к оси)."""
        c = Vector(c)
        M = Euler(rot).to_matrix()
        rl = []
        for (r, z) in profile:
            ring = []
            cnt = 1 if r < 1e-6 else seg
            for j in range(cnt):
                a = TAU * j / seg + phase
                v = Vector((r * math.cos(a) * sx, r * math.sin(a) * sy, z))
                p = c + M @ v
                if fn:
                    p = fn(p)
                ring.append(self.bm.verts.new(p))
            rl.append(ring)
        faces = self._loft(rl, key, smooth=smooth)
        if orient:
            ax = M @ Vector((0, 0, 1))
            for f in faces:
                f.normal_update()
                n = f.normal
                if orient in ('up', 'down'):
                    want = n.dot(ax) >= 0 if orient == 'up' else n.dot(ax) <= 0
                else:
                    q = f.calc_center_median() - c
                    rad = q - ax * q.dot(ax)
                    want = n.dot(rad) >= 0 if orient == 'out' else n.dot(rad) <= 0
                if not want:
                    f.normal_flip()
        return faces

    def cyl(self, key, c, r, h, seg=12, rot=(0, 0, 0), r2=None, bev=0.0, fn=None):
        """Цилиндр (или усечённый конус r -> r2) от c вверх по локальной Z на h, с фаской bev."""
        r2 = r if r2 is None else r2
        if bev > 0:
            prof = [(0, 0), (r - bev, 0), (r, bev), (r2, h - bev), (r2 - bev, h), (0, h)]
        else:
            prof = [(0, 0), (r, 0), (r2, h), (0, h)]
        return self.lathe(key, prof, seg=seg, c=c, rot=rot, fn=fn)

    def box(self, key, c, size, rot=(0, 0, 0), bev=0.0, segs=1, taper=None, fn=None, smooth=True):
        """Брусок с центром c, размер size, поворот rot, фаска bev. taper=(kx,ky) сужает верх."""
        bm = self.bm
        before = set(bm.faces)
        r = bmesh.ops.create_cube(bm, size=1.0)
        verts = r['verts']
        for v in verts:
            p = v.co.copy()
            if taper and p.z > 0:
                p.x *= taper[0]
                p.y *= taper[1]
            p = Vector((p.x * size[0], p.y * size[1], p.z * size[2]))
            p = Vector(c) + Euler(rot).to_matrix() @ p
            if fn:
                p = fn(p)
            v.co = p
        if bev > 0:
            edges = list({e for v in verts for e in v.link_edges})
            try:
                bmesh.ops.bevel(bm, geom=verts + edges, offset=bev, segments=segs, profile=0.5, affect='EDGES',
                                clamp_overlap=True)
            except TypeError:
                bmesh.ops.bevel(bm, geom=verts + edges, offset=bev, segments=segs, profile=0.5, vertex_only=False,
                                clamp_overlap=True)
        return self._done(before, key, smooth)

    def rock(self, key, c, size, seed=0.0, sub=2, rough=0.22, rot=(0, 0, 0), floor=0.0, squash_top=None):
        """Камень: икосфера с шумом. sub=1 — 80 граней, 2 — 320, 3 — 1280 (в Blender 5 subdivisions=1 — икосаэдр).
        floor — срез низа (None — без среза)."""
        bm = self.bm
        before = set(bm.faces)
        try:
            r = bmesh.ops.create_icosphere(bm, subdivisions=sub + 1, radius=1.0)
        except TypeError:
            r = bmesh.ops.create_icosphere(bm, subdivisions=sub + 1, diameter=1.0)
        off = Vector((seed * 1.71, seed * 3.13, seed * 0.93))
        M = Euler(rot).to_matrix()
        c = Vector(c)
        for v in r['verts']:
            n = v.co.normalized()
            d = 1 + rough * noise.noise(n * 1.3 + off) + rough * 0.45 * noise.noise(n * 3.1 + off * 1.7)
            p = n * d
            if squash_top is not None and p.z > squash_top:
                p.z = squash_top + (p.z - squash_top) * 0.35
            p = Vector((p.x * size[0], p.y * size[1], p.z * size[2]))
            p = c + M @ p
            if floor is not None and p.z < floor:
                p.z = floor
            v.co = p
        # грани, целиком лежащие на срезе (дно), не видны — удалить
        if floor is not None:
            dead = [f for f in r.get('faces', []) or [f for f in bm.faces if f not in before]
                    if f.is_valid and all(v.co.z <= floor + 1e-5 for v in f.verts)]
            if dead:
                bmesh.ops.delete(bm, geom=dead, context='FACES')
        return self._done(before, key)

    def torus(self, key, c, R, r, seg=10, mseg=4, rot=(0, 0, 0), sx=1.0, sy=1.0):
        c = Vector(c)
        M = Euler(rot).to_matrix()
        bm = self.bm
        rings = []
        for i in range(seg):
            a = TAU * i / seg
            d = Vector((math.cos(a), math.sin(a), 0))
            cc = Vector((math.cos(a) * R * sx, math.sin(a) * R * sy, 0))
            ring = []
            for j in range(mseg):
                b = TAU * j / mseg + math.pi / mseg
                p = cc + d * (math.cos(b) * r) + Vector((0, 0, math.sin(b) * r))
                ring.append(bm.verts.new(c + M @ p))
            rings.append(ring)
        rings.append(rings[0])
        return self._loft(rings, key)

    def link(self, key, c, T, B, L, W, wire, seg=6, mseg=3):
        """Звено цепи: вытянутое кольцо в плоскости (T, B), длина L по T, ширина W."""
        bm = self.bm
        T = Vector(T).normalized()
        B = Vector(B).normalized()
        Nn = T.cross(B).normalized()
        c = Vector(c)
        rings = []
        for i in range(seg):
            a = TAU * i / seg
            cc = c + T * (math.cos(a) * (L * 0.5 - wire)) + B * (math.sin(a) * (W * 0.5 - wire))
            d = (T * math.cos(a) + B * math.sin(a)).normalized()
            ring = []
            for j in range(mseg):
                b = TAU * j / mseg
                ring.append(bm.verts.new(cc + d * (math.cos(b) * wire) + Nn * (math.sin(b) * wire)))
            rings.append(ring)
        rings.append(rings[0])
        return self._loft(rings, key)

    def chain(self, key, pts, L=0.14, W=0.085, wire=0.018, smooth_n=None, seg=6, mseg=3, twist=0.0):
        """Цепь вдоль ломаной: звенья чередуются на 90°. Возвращает число звеньев."""
        smp = arc_sample(pts, L * 0.74, smooth_n)
        up = Vector((0, 0, 1))
        for i, (p, tg) in enumerate(smp):
            ref = up if abs(tg.dot(up)) < 0.9 else Vector((1, 0, 0))
            B = (ref - tg * ref.dot(tg)).normalized()
            ang = (math.pi / 2) * (i % 2) + twist
            B = (B * math.cos(ang) + tg.cross(B) * math.sin(ang)).normalized()
            self.link(key, p, tg, B, L, W, wire, seg, mseg)
        return len(smp)

    def prism(self, key, prof, x0, x1, c=(0, 0, 0), rot=(0, 0, 0), smooth=True):
        """Профиль (y, z) — замкнутый многоугольник — вытянуть по X от x0 до x1."""
        bm = self.bm
        before = set(bm.faces)
        M = Euler(rot).to_matrix()
        c = Vector(c)
        a = [bm.verts.new(c + M @ Vector((x0, y, z))) for (y, z) in prof]
        b = [bm.verts.new(c + M @ Vector((x1, y, z))) for (y, z) in prof]
        n = len(prof)
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
        bm.faces.new(a)
        bm.faces.new(list(reversed(b)))
        new = self._done(before, key, smooth)
        bmesh.ops.recalc_face_normals(bm, faces=new)
        return new

    def slab(self, key, poly, z0, z1, bev=0.0, smooth=True):
        """Плита по многоугольнику poly [(x,y)...] (выпуклому) от z0 до z1, фаска bev по верхней кромке."""
        bm = self.bm
        before = set(bm.faces)
        n = len(poly)
        lo = [bm.verts.new((x, y, z0)) for (x, y) in poly]
        if bev > 0:
            cx = sum(p[0] for p in poly) / n
            cy = sum(p[1] for p in poly) / n
            mid = [bm.verts.new((x, y, z1 - bev)) for (x, y) in poly]
            top = []
            for (x, y) in poly:
                d = Vector((cx - x, cy - y))
                k = bev / max(d.length, 1e-6)
                top.append(bm.verts.new((x + d.x * k, y + d.y * k, z1)))
            rows = [lo, mid, top]
        else:
            rows = [lo, [bm.verts.new((x, y, z1)) for (x, y) in poly]]
        for ra, rb in zip(rows[:-1], rows[1:]):
            for k in range(n):
                bm.faces.new((ra[k], ra[(k + 1) % n], rb[(k + 1) % n], rb[k]))
        bm.faces.new(rows[-1])
        bm.faces.new(list(reversed(lo)))
        new = self._done(before, key, smooth)
        bmesh.ops.recalc_face_normals(bm, faces=new)
        return new

    def quad(self, key, corners, uv=False):
        """Плоский четырёхугольник (corners — 4 точки против часовой, если смотреть на лицевую сторону)."""
        bm = self.bm
        vs = [bm.verts.new(Vector(p)) for p in corners]
        f = bm.faces.new(vs)
        f.material_index = self.mi(key)
        f.smooth = False
        return f

    def flame(self, c, h, r, seed=0.0, key='glow_fire', seg=6, tongues=2):
        """Пламя: изогнутый язык-капля (труба по кривой, острый кончик) + боковые языки, отклонённые наружу."""
        c = Vector(c)

        def tongue(base, hh, rr, lean, curl, sd):
            up = Vector((0, 0, 1))
            pts = [base + up * (-0.02 * hh),
                   base + up * (0.22 * hh) + lean * (0.15 * rr),
                   base + up * (0.5 * hh) + lean * (0.35 * rr) + curl * (0.25 * rr),
                   base + up * (0.76 * hh) + lean * (0.3 * rr) - curl * (0.2 * rr),
                   base + up * hh + lean * (0.45 * rr) + curl * (0.35 * rr)]
            self.tube(key, pts, [rr * 0.65, rr, rr * 0.72, rr * 0.32, 0.0], seg=seg, n=6, caps=('round', 'none'),
                      cap_steps=1, phase=sd)

        a0 = seed * 2.3
        lean0 = Vector((math.cos(a0), math.sin(a0), 0))
        curl0 = Vector((-math.sin(a0), math.cos(a0), 0))
        tongue(c, h, r, lean0 * 0.4, curl0, seed)
        for i in range(tongues):
            a = TAU * (i + 0.5) / max(tongues, 1) + seed * 2.1
            d = Vector((math.cos(a), math.sin(a), 0))
            cc = c + d * (r * 0.62)
            tongue(cc, h * (0.68 - 0.1 * i), r * 0.55, d * 1.3, Vector((-d.y, d.x, 0)), seed + i)

    def drip(self, top, length, r, key='jam', seg=6, lean=(0, 0, 0)):
        """Капля/потёк, свисающая вниз от точки top."""
        top = Vector(top)
        ln = Vector(lean)
        pts = [top + Vector((0, 0, r * 0.8)), top - Vector((0, 0, length * 0.55)) + ln * 0.5,
               top - Vector((0, 0, length)) + ln]
        return self.tube(key, pts, [r * 1.1, r * 0.72, r * 0.95], seg=seg, up=(0, 1, 0), cap_steps=1, cap_k=1.0)

    def puddle(self, c, R, th=0.03, seg=12, key='jam', wob=0.35, seed=0.0, stretch=(1.0, 1.0)):
        """Лужица на полу: плоский купол с волнистым краем."""
        c = Vector(c)
        seg = max(seg, 14)
        rl = []
        for i, (u, h) in enumerate(((0, th), (0.55, th * 0.85), (1.0, th * 0.25), (1.06, 0.0))):
            if u == 0:
                rl.append([self.bm.verts.new(c + Vector((0, 0, h)))])
                continue
            ring = []
            for j in range(seg):
                a = TAU * j / seg
                rr = R * u * (1.0 + wob * noise.noise(Vector((math.cos(a) * 2.1 + seed, math.sin(a) * 2.1, seed))))
                ring.append(self.bm.verts.new(c + Vector((math.cos(a) * rr * stretch[0], math.sin(a) * rr * stretch[1], h))))
            rl.append(ring)
        return self._loft(rl, key)

    def splat(self, c, R, th=0.012, seg=10, rings=2, key='jam', wob=0.3, seed=0.0, stretch=(1.0, 1.0)):
        """Пятно, облегающее уже построенную поверхность части."""
        self.bm.normal_update()
        tree = BVHTree.FromBMesh(self.bm)
        c = Vector(c)
        hit = tree.find_nearest(c)
        if hit[0] is None:
            return []
        c0, n0 = hit[0], hit[1].normalized()
        t1 = n0.orthogonal().normalized()
        t2 = n0.cross(t1).normalized()
        rl = []
        for i in range(rings + 1):
            u = i / rings
            ring = []
            cnt = 1 if i == 0 else seg
            for j in range(cnt):
                a = TAU * j / seg
                rr = R * u * (1.0 + wob * noise.noise(Vector((math.cos(a) * 1.7 + seed, math.sin(a) * 1.7, seed * 0.7))))
                p = c0 + t1 * (math.cos(a) * rr * stretch[0]) + t2 * (math.sin(a) * rr * stretch[1])
                h = tree.find_nearest(p)
                q, n = (h[0], h[1].normalized()) if h[0] is not None else (p, n0)
                off = th * max(0.0, 1.0 - u * u) ** 0.6 + 0.004
                ring.append(self.bm.verts.new(q + n * off))
            rl.append(ring)
        faces = self._loft(rl, key, recalc=False)
        for f in faces:
            f.normal_update()
            if f.normal.dot(n0) < 0:
                f.normal_flip()
        return faces

    def crystal(self, c, h, r, tilt=(0, 0), key='glow_crystal', seg=6, seed=0.0):
        """Кристалл: шестигранная призма с острой верхушкой."""
        prof = [(0, -0.05 * h), (r, 0), (r * 1.05, h * 0.68), (0, h)]
        return self.lathe(key, prof, seg=seg, c=c, rot=(tilt[0], tilt[1], seed), smooth=False)

    def hexa(self, key, corners, bev=0.0, segs=1, smooth=True):
        """Шестигранник по 8 углам: 0-3 низ/перед, 4-7 верх/зад (как у куба: 0..3 одно основание по кругу,
        4..7 противоположное в том же порядке)."""
        bm = self.bm
        before = set(bm.faces)
        vs = [bm.verts.new(Vector(p)) for p in corners]
        a, b = vs[:4], vs[4:]
        fs = [bm.faces.new(a), bm.faces.new(list(reversed(b)))]
        for k in range(4):
            fs.append(bm.faces.new((a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4])))
        bmesh.ops.recalc_face_normals(bm, faces=fs)
        if bev > 0:
            edges = list({e for v in vs for e in v.link_edges})
            try:
                bmesh.ops.bevel(bm, geom=vs + edges, offset=bev, segments=segs, profile=0.5, affect='EDGES',
                                clamp_overlap=True)
            except TypeError:
                bmesh.ops.bevel(bm, geom=vs + edges, offset=bev, segments=segs, profile=0.5, vertex_only=False,
                                clamp_overlap=True)
        return self._done(before, key, smooth)

    def merge(self, src, c=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
        """Влить геометрию другой части (построенной у начала координат) с поворотом и сдвигом."""
        s = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
        M = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        vm = {}
        for v in src.bm.verts:
            vm[v] = self.bm.verts.new(M @ v.co)
        for f in src.bm.faces:
            try:
                nf = self.bm.faces.new([vm[v] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = self.mi(src.mats[f.material_index])
            nf.smooth = f.smooth
        src.bm.free()

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def bounds(self):
        if not self.bm.verts:
            return None
        xs = [v.co for v in self.bm.verts]
        lo = Vector((min(p.x for p in xs), min(p.y for p in xs), min(p.z for p in xs)))
        hi = Vector((max(p.x for p in xs), max(p.y for p in xs), max(p.z for p in xs)))
        return lo, hi


# ---------------------------------------------------------------- общие сборки (строятся у начала координат)
def make_rails(path, gauge=0.6, step=0.8, rail_key='iron', sl_key='wood_dark', sl_bev=0.012, flange=True):
    """Рельсы вдоль пути path [(x, y, z)...] (z — верх грунта). Шпалы через step, первая — на step/2 от начала."""
    P = Part('tmp_rails')
    pts = [Vector(p) for p in path]
    m = len(pts)
    for side in (-1, 1):
        rp = []
        for i in range(m):
            a = pts[max(i - 1, 0)]
            b = pts[min(i + 1, m - 1)]
            t = (b - a)
            t.z = 0
            t.normalize()
            nrm = Vector((-t.y, t.x, 0))
            rp.append(pts[i] + nrm * (side * gauge * 0.5) + Vector((0, 0, 0.08 + 0.035)))
        P.tube(rail_key, rp, [(0.03, 0.05)] * m, seg=4, phase=math.pi / 4, caps=('flat', 'flat'))
        if flange:
            P.tube(rail_key, [p - Vector((0, 0, 0.03)) for p in rp], [(0.055, 0.012)] * m, seg=4, phase=math.pi / 4,
                   caps=('flat', 'flat'))
    for p, tg in arc_sample(pts, step):
        ang = math.atan2(tg.y, tg.x) + math.pi / 2
        P.box(sl_key, (p.x, p.y, p.z + 0.04), (gauge + 0.46, 0.2, 0.08), rot=(0, 0, ang), bev=sl_bev)
    return P


def make_minecart(broken=False, ore=True, seed=0.0, axles=None):
    """Вагонетка у начала координат: длина по Y 1,1 м, ширина 0,8 м, колея 0,6 м, верх 0,86 м.
    axles=(перед, зад) — части, куда положить оси с колёсами (ось вращения X на z=0.17, y=∓0.33)."""
    P = Part('tmp_cart')
    L, W = 1.1, 0.78
    z0 = 0.30
    P.box('wood_dark', (0, 0, z0 + 0.03), (W - 0.1, L - 0.1, 0.06), bev=0.01)
    for side in (-1, 1):
        for k, zc in enumerate((z0 + 0.15, z0 + 0.41)):
            if broken and side == 1 and k == 1:
                continue
            P.box('wood', (side * (W / 2 - 0.05 + 0.03 * k), 0, zc), (0.05, L - 0.06 + 0.05 * k, 0.24),
                  rot=(0, side * 0.12, 0), bev=0.012)
            P.box('wood', (0, side * (L / 2 - 0.04 + 0.03 * k), zc), (W - 0.12 + 0.05 * k, 0.05, 0.24),
                  rot=(-side * 0.1, 0, 0), bev=0.012)
        if broken and side == 1:
            P.box('wood', (W / 2 + 0.01, 0.2, z0 + 0.5), (0.05, 0.45, 0.2), rot=(0.25, 0.12, 0.05), bev=0.012)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('iron', (sx * (W / 2 - 0.0), sy * (L / 2 - 0.0), z0 + 0.28), (0.07, 0.07, 0.56),
                  rot=(-sy * 0.1, sx * 0.12, 0))
    for sy in (-1, 1):
        P.box('iron', (0, sy * (L / 2 + 0.03), z0 + 0.55), (W + 0.12, 0.05, 0.05))
    for sx in (-1, 1):
        if not (broken and sx == 1):
            P.box('iron', (sx * (W / 2 + 0.05), 0, z0 + 0.55), (0.05, L + 0.1, 0.05))
        P.box('iron', (sx * 0.24, 0, z0 - 0.03), (0.07, L - 0.08, 0.08))
    P.box('iron', (0, -L / 2 - 0.08, z0 + 0.06), (0.1, 0.12, 0.06))
    P.torus('iron', (0, -L / 2 - 0.15, z0 + 0.06), 0.05, 0.014, seg=6, mseg=3)
    for sy in (-1, 1):
        AX = P if not axles else (axles[0] if sy < 0 else axles[1])
        AX.cyl('iron', (-0.37, sy * 0.33, 0.17), 0.028, 0.74, seg=6, rot=(0, math.pi / 2, 0))
        for sx in (-1, 1):
            if broken and sx == -1 and sy == -1:
                continue
            prof = [(0.0, -0.035), (0.15, -0.035), (0.15, 0.015), (0.185, 0.025), (0.185, 0.045), (0.05, 0.045),
                    (0.0, 0.03)]
            AX.lathe('iron', prof, seg=12, c=(sx * 0.3, sy * 0.33, 0.17), rot=(0, sx * math.pi / 2, 0))
    if ore:
        for i in range(5):
            a = i * 1.3 + seed
            P.rock('stone_wall', (0.18 * math.cos(a), 0.28 * math.sin(a), z0 + 0.45), (0.2, 0.18, 0.16), seed=i + seed,
                   sub=1, floor=None)
        for i in range(3):
            a = i * 2.2 + 0.5 + seed
            P.rock('brass', (0.16 * math.cos(a), 0.2 * math.sin(a), z0 + 0.58), (0.07, 0.06, 0.05), seed=i * 3.3,
                   sub=0, rough=0.3, floor=None)
        P.crystal((0.05, 0.1, z0 + 0.55), 0.14, 0.035, tilt=(0.3, -0.2), seg=5)
    return P


def make_lantern(glass_key='glow_fire', glass_part=None):
    """Масляный фонарь: низ на z=0, кольцо подвеса сверху на z≈0.46."""
    P = Part('tmp_lantern')
    G = glass_part or P
    P.box('brass', (0, 0, 0.025), (0.2, 0.2, 0.05), bev=0.01)
    G.lathe(glass_key, [(0, 0.05), (0.085, 0.05), (0.095, 0.17), (0.085, 0.29), (0, 0.29)], seg=4, phase=math.pi / 4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('brass', (sx * 0.075, sy * 0.075, 0.17), (0.022, 0.022, 0.25))
    P.lathe('brass', [(0, 0.28), (0.14, 0.28), (0.13, 0.31), (0.035, 0.41), (0, 0.42)], seg=4, phase=math.pi / 4)
    P.torus('brass', (0, 0, 0.45), 0.035, 0.01, seg=6, mseg=3, rot=(math.pi / 2, 0, 0))
    return P


def make_barrel(h=0.9, r=0.33, key='wood', hoop='iron', seg=14, lid_key='wood_dark'):
    P = Part('tmp_barrel')
    r0 = r * 0.84
    P.lathe(key, [(r0, 0.0), (r * 0.95, h * 0.22), (r, h * 0.5), (r * 0.95, h * 0.78), (r0, h), (r0 - 0.03, h)], seg=seg,
            orient='out')
    P.lathe(lid_key, [(r0 - 0.03, h), (r0 - 0.03, h - 0.03), (0, h - 0.03)], seg=seg, orient='up')
    for z in (0.1, 0.32, 0.68, 0.9):
        zz = h * z
        rr = r * (0.84 + 0.16 * math.sin(math.pi * z)) + 0.008
        P.lathe(hoop, [(rr, zz - 0.025), (rr + 0.008, zz - 0.02), (rr + 0.008, zz + 0.02), (rr, zz + 0.025)], seg=seg,
                orient='out')
    return P


# ---------------------------------------------------------------- пропы
class Prop:
    """Проп: корневая часть <id> (origin (0,0,0) в основании) + дочерние части."""

    def __init__(self, pid, sharp=40.0):
        self.pid = pid
        self.root = Part(pid, (0, 0, 0), sharp)
        self.parts = [(self.root, None)]
        self.obj = None
        self.objs = {}

    def sub(self, name, joint, parent=None, exact=False, sharp=40.0):
        nm = name if exact else '%s_%s' % (self.pid, name)
        p = Part(nm, joint, sharp)
        self.parts.append((p, parent.name if isinstance(parent, Part) else (parent or self.pid)))
        return p

    def tris(self):
        return sum(p.tris() for p, _ in self.parts)

    def bounds(self):
        lo = Vector((1e9, 1e9, 1e9))
        hi = -lo
        for p, _ in self.parts:
            b = p.bounds()
            if b:
                lo = Vector(map(min, lo, b[0]))
                hi = Vector(map(max, hi, b[1]))
        return lo, hi


def _mesh_from_part(part):
    bm = part.bm
    for v in bm.verts:
        v.co -= part.joint
    bm.normal_update()
    th = math.radians(part.sharp)
    for e in bm.edges:
        lf = e.link_faces
        if len(lf) == 2 and lf[0].normal.angle(lf[1].normal, 0) > th:
            e.smooth = False
        elif len(lf) == 2 and lf[0].material_index != lf[1].material_index:
            e.smooth = False
    me = bpy.data.meshes.new(part.name)
    bm.to_mesh(me)
    bm.free()
    for key in part.mats:
        me.materials.append(mat(key))
    if part.uv:
        o, ua, va, w, h = part.uv
        uvl = me.uv_layers.new(name='UVMap')
        for loop in me.loops:
            p = me.vertices[loop.vertex_index].co + part.joint - Vector(o)
            uvl.data[loop.index].uv = (p.dot(Vector(ua)) / w, p.dot(Vector(va)) / h)
    return me


def build_prop(prop, at=(0, 0, 0), coll=None):
    coll = coll or get_coll('kit')
    objs = {}
    joints = {}
    for part, parent in prop.parts:
        if part is prop.root and not part.bm.faces:
            part.bm.free()
            ob = bpy.data.objects.new(part.name, None)
            ob.empty_display_size = 0.3
        else:
            ob = bpy.data.objects.new(part.name, _mesh_from_part(part))
        coll.objects.link(ob)
        if parent:
            ob.parent = objs[parent]
            ob.location = part.joint - joints[parent]
        else:
            ob.location = Vector(at) + part.joint
        ob['rest'] = list(ob.location)
        objs[part.name] = ob
        joints[part.name] = part.joint
    prop.obj = objs[prop.pid]
    prop.objs = objs
    return objs


def layout(props, row_w=24.0, gap=1.2):
    """Раскладка сеткой: ряды вдоль +X, следующий ряд по +Y. Возвращает {pid: (x, y)}."""
    pos = {}
    x = 0.0
    y = 0.0
    row_h = 0.0
    for pr in props:
        lo, hi = pr.bounds()
        w = hi.x - lo.x
        d = hi.y - lo.y
        if x > 0 and x + w > row_w:
            x = 0.0
            y += row_h + gap
            row_h = 0.0
        pos[pr.pid] = (x - lo.x, y - lo.y, 0.0)
        x += w + gap
        row_h = max(row_h, d)
    return pos


def build_kit(props, row_w=24.0, gap=1.2):
    info = []
    for pr in props:
        lo, hi = pr.bounds()
        info.append((pr.pid, pr.tris(), lo.copy(), hi.copy(), sorted({k for p, _ in pr.parts for k in p.mats}),
                     [p.name for p, _ in pr.parts[1:]]))
    pos = layout(props, row_w, gap)
    for pr in props:
        build_prop(pr, pos[pr.pid])
    return info


# ---------------------------------------------------------------- анимация
def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ramp(f, a, b):
    if b == a:
        return 1.0 if f >= b else 0.0
    return smooth((f - a) / (b - a))


def env(f, a, b, c, d):
    return ramp(f, a, b) * (1.0 - ramp(f, c, d))


def lerp(a, b, t):
    return a + (b - a) * t


def bake(objs, aname, nframes, fn, step=1):
    """fn(f) -> {obj_name: {'loc':(dx,dy,dz), 'rot':(rx,ry,rz), 'scale': s|(sx,sy,sz)}}.
    Каждый объект получает своё действие в NLA-дорожке с именем aname (дорожки молчат в сцене)."""
    frames = list(range(0, nframes + 1, step))
    if frames[-1] != nframes:
        frames.append(nframes)
    data = {f: fn(f) for f in frames}
    for pname, ob in objs.items():
        if not any(pname in data[f] for f in frames):
            continue
        rest = Vector(ob['rest'])
        ad = ob.animation_data or ob.animation_data_create()
        ad.action = None
        for f in frames:
            d = data[f].get(pname, {})
            ob.location = rest + Vector(d.get('loc', (0, 0, 0)))
            ob.rotation_euler = Euler(d.get('rot', (0, 0, 0)))
            s = d.get('scale', 1.0)
            ob.scale = (s, s, s) if isinstance(s, (int, float)) else s
            ob.keyframe_insert('location', frame=f)
            ob.keyframe_insert('rotation_euler', frame=f)
            ob.keyframe_insert('scale', frame=f)
        act = ad.action
        act.name = '%s.%s' % (aname, pname)
        tr = ad.nla_tracks.new()
        tr.name = aname
        st = tr.strips.new(aname, 0, act)
        st.extrapolation = 'NOTHING'
        tr.mute = True
        ad.action = None
        ob.location = rest
        ob.rotation_euler = (0, 0, 0)
        ob.scale = (1, 1, 1)
    return aname


def rest_pose(all_objs):
    sc = bpy.context.scene
    sc.frame_set(0)
    for ob in all_objs:
        if 'rest' in ob:
            ob.location = Vector(ob['rest'])
            ob.rotation_euler = (0, 0, 0)
            ob.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def kit_objects():
    c = bpy.data.collections.get('kit')
    return list(c.objects) if c else []


# ---------------------------------------------------------------- превью / экспорт / сохранение
def _set_engine(sc):
    for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = e
            return e
        except TypeError:
            continue
    return sc.render.engine


def _light(name, kind, energy, color, loc=(0, 0, 0), rot=(0, 0, 0), size=0.3, coll=None):
    ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'SUN':
        ld.angle = math.radians(size)
    else:
        ld.shadow_soft_size = size
    ob = bpy.data.objects.get(name) or bpy.data.objects.new(name, ld)
    if not ob.users_collection:
        (coll or get_coll('preview')).objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def preview_rig(day=False, floor_hex=None, size=60):
    coll = get_coll('preview')
    sc = bpy.context.scene
    fm = bpy.data.materials.get('preview_floor') or bpy.data.materials.new('preview_floor')
    try:
        fm.use_nodes = True
    except Exception:
        pass
    b = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = hexc(floor_hex or ('#D9C9A8' if day else '#6e5644'))
    b.inputs['Roughness'].default_value = 0.92
    if not bpy.data.objects.get('preview_floor'):
        me = bpy.data.meshes.new('preview_floor')
        s = size
        me.from_pydata([(-s, -s, -0.003), (s, -s, -0.003), (s, s, -0.003), (-s, s, -0.003)], [], [(0, 1, 2, 3)])
        me.materials.append(fm)
        ob = bpy.data.objects.new('preview_floor', me)
        coll.objects.link(ob)
    w = bpy.data.worlds.get('preview_world') or bpy.data.worlds.new('preview_world')
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next((n for n in w.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if day:
        _light('preview_sun', 'SUN', 2.8, (1.0, 0.92, 0.78), rot=(math.radians(42), math.radians(14), math.radians(-32)), size=2)
        if bg:
            bg.inputs[0].default_value = hexc('#8fb6dc')
            bg.inputs[1].default_value = 0.45
    else:
        _light('preview_sun', 'SUN', 3.2, (1.0, 0.80, 0.60), rot=(math.radians(40), math.radians(-18), math.radians(-35)), size=6)
        if bg:
            bg.inputs[0].default_value = hexc('#6a5444')
            bg.inputs[1].default_value = 1.0
    sc.world = w
    try:
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.look = 'None'
    except Exception:
        pass
    cam = bpy.data.objects.get('preview_cam')
    if not cam:
        cd = bpy.data.cameras.new('preview_cam')
        cd.lens = 50
        cam = bpy.data.objects.new('preview_cam', cd)
        coll.objects.link(cam)
    sc.camera = cam
    return cam


def aim_camera(cam, lo, hi, az_deg, el_deg, pad=1.06, aspect=None, pts=None):
    sc = bpy.context.scene
    if aspect is None:
        aspect = sc.render.resolution_x / max(sc.render.resolution_y, 1)
    c = (lo + hi) * 0.5
    az = math.radians(az_deg)
    el = math.radians(el_deg)
    d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
    q = (-d).to_track_quat('-Z', 'Y')
    Rr = q @ Vector((1, 0, 0))
    Uu = q @ Vector((0, 1, 0))
    cam.data.sensor_fit = 'HORIZONTAL'
    th = 18.0 / cam.data.lens            # tan(hfov/2) при 36-мм сенсоре
    tv = th / aspect
    if pts is None:
        pts = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    # центрировать по проекции: сдвиг цели в плоскости экрана
    xs = [(p - c).dot(Rr) for p in pts]
    ys = [(p - c).dot(Uu) for p in pts]
    c = c + Rr * ((max(xs) + min(xs)) * 0.5) + Uu * ((max(ys) + min(ys)) * 0.5)
    dist = 0.5
    for _ in range(2):
        for q0 in pts:
            p = q0 - c
            px, py, pz = p.dot(Rr), p.dot(Uu), p.dot(d)
            dist = max(dist, abs(px) * pad / th + pz, abs(py) * pad / tv + pz)
    cam.location = c + d * dist
    cam.rotation_euler = q.to_euler()
    cam.data.clip_start = 0.05
    cam.data.clip_end = 500


def render_to(path, res=(1500, 1000), samples=32):
    sc = bpy.context.scene
    _set_engine(sc)
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


def scene_points(objs, every=3):
    out = []
    for ob in objs:
        if ob.type != 'MESH':
            continue
        mw = ob.matrix_world
        vs = ob.data.vertices
        for i in range(0, len(vs), every):
            out.append(mw @ vs[i].co)
    return out


def scene_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for ob in objs:
        if ob.type != 'MESH':
            continue
        mw = ob.matrix_world
        for v in ob.data.vertices:
            p = mw @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def save_blend(kid):
    p = ROOT + '/docs/survivors/blender/%s.blend' % kid
    try:
        bpy.context.preferences.filepaths.save_version = 0   # без .blend1
    except Exception:
        pass
    os.makedirs(os.path.dirname(p), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=p)
    return p


def export_glb(kid):
    objs = kit_objects()
    rest_pose(objs)
    p = ROOT + '/docs/survivors/models/%s.glb' % kid
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    has_uv = any(o.type == 'MESH' and len(o.data.uv_layers) for o in objs)
    kw = dict(filepath=p, export_format='GLB', use_selection=True, export_cameras=False, export_lights=False,
              export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
              export_texcoords=has_uv, export_normals=True, export_apply=True, export_yup=True,
              export_extras=False, export_frame_range=False, export_skins=False, export_morph=False,
              export_current_frame=False, export_optimize_animation_size=True, export_materials='EXPORT',
              export_attributes=False, export_colors=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = {k: v for k, v in kw.items() if k in props or k == 'filepath'}
    bpy.ops.export_scene.gltf(**kw)
    return p


def report(kid, info, actions):
    lines = ['%s: props=%d tris=%d' % (kid, len(info), sum(i[1] for i in info))]
    for pid, tris, lo, hi, mats, subs in info:
        sz = hi - lo
        lines.append('  %-26s tris=%5d size=%.2fx%.2fx%.2f mats=%s parts=%s' % (
            pid, tris, sz.x, sz.y, sz.z, ','.join(mats), ','.join(s.replace(pid + '_', '') for s in subs) or '-'))
    lines.append('  actions: ' + (', '.join(actions) or '-'))
    return '\n'.join(lines)


def script_args():
    import sys
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def debug_views(props, ddir, day=False, floor_hex=None, az=28, el=38, res=(800, 560), only=None):
    """Крупные виды каждого пропа (для проверки) — в ddir/<pid>.png."""
    os.makedirs(ddir, exist_ok=True)
    cam = preview_rig(day, floor_hex)
    for pr in props:
        if only and pr.pid not in only:
            continue
        obs = [o for o in kit_objects() if o == pr.obj or pr.obj in _ancestors(o)]
        lo, hi = scene_bounds(obs)
        lo.z = 0.0
        aim_camera(cam, lo, hi, az, el, pad=1.04, aspect=res[0] / res[1], pts=scene_points(obs, 2))
        render_to('%s/%s.png' % (ddir, pr.pid), res, samples=16)


def _ancestors(o):
    out = []
    p = o.parent
    while p:
        out.append(p)
        p = p.parent
    return out


def finish(kid, info, actions, views=(('', 0, 58),), day=False, floor_hex=None, res=(1500, 1000), props=None,
           debug_dir=None, export=True):
    objs = kit_objects()
    rest_pose(objs)
    sc = bpy.context.scene
    sc.frame_start = 0
    sc.frame_end = 48
    out = report(kid, info, actions)
    cam = preview_rig(day, floor_hex)
    lo, hi = scene_bounds(objs)
    lo.z = 0.0
    d = ROOT + '/docs/survivors/models/previews/'
    os.makedirs(d, exist_ok=True)
    for suffix, az, el in views:
        aim_camera(cam, lo, hi, az, el, aspect=res[0] / res[1], pts=scene_points(objs, 3))
        render_to(d + kid + suffix + '.png', res)
    if debug_dir and props:
        debug_views(props, debug_dir, day, floor_hex)
    rest_pose(objs)
    if export:
        save_blend(kid)
        export_glb(kid)
    rest_pose(objs)
    print(out)
    return out
