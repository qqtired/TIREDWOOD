# envkit_a.py — помощники пропов окружения «Подземелья» (набор A: common, cellars, mushrooms, grotto).
# Запуск внутри Blender: каждый kit_<имя>.py делает exec(open(<этот файл>).read()).
# Геометрия копится в Geo (списки вершин и граней с ключом материала), объект собирается make_obj.
# Единицы — метры, проп стоит на z=0, origin в основании, «вперёд» — −Y.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, Euler, noise

ROOT = '/Users/tired/Desktop/game-opus-survivors'
TAU = math.tau


# ---------------------------------------------------------------- палитра брифа
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h, a=1.0):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (_lin(r), _lin(g), _lin(b), a)


# имя -> (цвет, roughness, metallic, эмиссия, сила эмиссии)
PAL = {
    'stone_floor':  ('#9C7B5B', 0.92, 0.0, None, 0.0),
    'stone_wall':   ('#5A4334', 0.92, 0.0, None, 0.0),
    'stone_dark':   ('#3A2C25', 0.95, 0.0, None, 0.0),
    'wood':         ('#7A5232', 0.80, 0.0, None, 0.0),
    'wood_dark':    ('#4E3322', 0.85, 0.0, None, 0.0),
    'iron':         ('#4A4A50', 0.45, 0.70, None, 0.0),
    'brass':        ('#B8893A', 0.35, 0.75, None, 0.0),
    'moss':         ('#5E7A3A', 0.95, 0.0, None, 0.0),
    'mush_cap':     ('#E8D3B0', 0.70, 0.0, None, 0.0),
    'mush_stem':    ('#D9C6A5', 0.75, 0.0, None, 0.0),
    'jam':          ('#6B2A8C', 0.15, 0.0, None, 0.0),
    'glow_fire':    ('#FF9A3C', 0.50, 0.0, '#FF9A3C', 2.5),
    'glow_crystal': ('#3FD6C6', 0.20, 0.0, '#3FD6C6', 1.4),
    'glow_jam':     ('#B57BFF', 0.30, 0.0, '#B57BFF', 2.0),
}


def M(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    base, rough, metal, em, es = PAL[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = hexc(base)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if em:
        sock = b.inputs.get('Emission Color') or b.inputs.get('Emission')
        sock.default_value = hexc(em)
        b.inputs['Emission Strength'].default_value = es
    m.diffuse_color = hexc(base)
    try:
        m.use_backface_culling = True   # в glTF уйдёт как односторонний — так и в игре
    except Exception:
        pass
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
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    sc.frame_start = 0
    sc.frame_end = 0
    sc.frame_set(0)
    return sc


def get_coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def save_as(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        bpy.context.preferences.filepaths.save_version = 0   # без .blend1
    except Exception:
        pass
    bpy.ops.wm.save_as_mainfile(filepath=path)
    return path


# ---------------------------------------------------------------- шум и матрицы
def nz(x, y=0.0, z=0.0):
    return noise.noise(Vector((x, y, z)))


def nang(a, freq=1.0, seed=0.0, z=0.0):
    """Периодический шум по углу a (радианы): шаг по окружности радиуса freq."""
    return noise.noise(Vector((math.cos(a) * freq + seed * 7.13, math.sin(a) * freq - seed * 3.71, z + seed * 1.9)))


def T(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    S = Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    return Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ S


def rng(seed):
    return random.Random(seed)


# ---------------------------------------------------------------- геометрия
class Geo:
    def __init__(self):
        self.v = []
        self.f = []   # (индексы, ключ материала, smooth)

    def vert(self, p):
        self.v.append(Vector(p))
        return len(self.v) - 1

    def face(self, idx, key, smooth=True):
        self.f.append((tuple(idx), key, smooth))

    def add(self, g, Mx=None):
        off = len(self.v)
        for p in g.v:
            self.v.append((Mx @ p) if Mx is not None else p.copy())
        flip = Mx is not None and Mx.to_3x3().determinant() < 0
        for idx, k, s in g.f:
            idx = tuple(i + off for i in idx)
            if flip:
                idx = idx[::-1]
            self.f.append((idx, k, s))
        return self

    def xf(self, Mx):
        self.v = [Mx @ p for p in self.v]
        if Mx.to_3x3().determinant() < 0:
            self.f = [(i[::-1], k, s) for i, k, s in self.f]
        return self

    def copy(self):
        g = Geo()
        g.v = [p.copy() for p in self.v]
        g.f = list(self.f)
        return g

    def map(self, fn):
        self.v = [Vector(fn(p)) for p in self.v]
        return self

    def center_normal(self, idx):
        ps = [self.v[i] for i in idx]
        c = sum(ps, Vector()) / len(ps)
        n = Vector()
        for a, b in zip(ps, ps[1:] + ps[:1]):
            n.x += (a.y - b.y) * (a.z + b.z)
            n.y += (a.z - b.z) * (a.x + b.x)
            n.z += (a.x - b.x) * (a.y + b.y)
        if n.length > 1e-12:
            n.normalize()
        return c, n

    def recolor(self, fn):
        out = []
        for idx, k, s in self.f:
            c, n = self.center_normal(idx)
            out.append((idx, fn(c, n, k), s))
        self.f = out
        return self

    def set_key(self, key):
        self.f = [(i, key, s) for i, k, s in self.f]
        return self

    def set_smooth(self, s):
        self.f = [(i, k, s) for i, k, _ in self.f]
        return self

    def tris(self):
        return sum(len(i) - 2 for i, _, _ in self.f)

    def bounds(self):
        lo = Vector((min(p.x for p in self.v), min(p.y for p in self.v), min(p.z for p in self.v)))
        hi = Vector((max(p.x for p in self.v), max(p.y for p in self.v), max(p.z for p in self.v)))
        return lo, hi


def geo_from_bm(bm, keys, smooth=True):
    g = Geo()
    bm.verts.index_update()
    g.v = [v.co.copy() for v in bm.verts]
    for f in bm.faces:
        g.f.append((tuple(v.index for v in f.verts), keys[min(f.material_index, len(keys) - 1)], smooth))
    return g


def bm_from_geo(g):
    keys = []
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in g.v]
    for idx, k, s in g.f:
        if k not in keys:
            keys.append(k)
        try:
            f = bm.faces.new([vs[i] for i in idx])
        except ValueError:
            continue
        f.material_index = keys.index(k)
        f.smooth = s
    return bm, keys


def _bevel(bm, offset, segments=1, edges=None):
    geom = list(bm.verts) + (edges if edges is not None else list(bm.edges))
    try:
        bmesh.ops.bevel(bm, geom=geom, offset=offset, offset_type='OFFSET', segments=segments, profile=0.5,
                        affect='EDGES', clamp_overlap=True)
    except TypeError:
        bmesh.ops.bevel(bm, geom=geom, offset=offset, offset_type='OFFSET', segments=segments, profile=0.5,
                        vertex_only=False, clamp_overlap=True)


def lathe(profile, seg, key, rfn=None, phase=0.0, smooth=True, sx=1.0, sy=1.0):
    """Тело вращения вокруг Z. profile=[(r,z)] обходить так, чтобы тело было слева (r вправо, z вверх):
    снаружи снизу вверх, крышка — к оси. r=0 — полюс. key — строка или список на каждую полосу.
    rfn(p, a, i) -> Vector — деформация (a — угол, i — номер кольца)."""
    g = Geo()
    rings = []
    for i, (r, z) in enumerate(profile):
        if r < 1e-6:
            p = Vector((0, 0, z))
            if rfn:
                p = Vector(rfn(p, 0.0, i))
            rings.append([g.vert(p)])
            continue
        ring = []
        for k in range(seg):
            a = TAU * k / seg + phase
            p = Vector((r * math.cos(a) * sx, r * math.sin(a) * sy, z))
            if rfn:
                p = Vector(rfn(p, a, i))
            ring.append(g.vert(p))
        rings.append(ring)
    for i, (a, b) in enumerate(zip(rings[:-1], rings[1:])):
        k_ = key[i] if isinstance(key, (list, tuple)) else key
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for k in range(seg):
                g.face((a[0], b[(k + 1) % seg], b[k]), k_, smooth)
        elif len(b) == 1:
            for k in range(seg):
                g.face((a[k], a[(k + 1) % seg], b[0]), k_, smooth)
        else:
            for k in range(seg):
                g.face((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]), k_, smooth)
    return g


def cyl(r, h, seg, key, top=True, bottom=False, r2=None, z0=0.0, smooth=True, cap_key=None):
    r2 = r if r2 is None else r2
    prof = []
    keys = []
    if bottom:
        prof.append((0, z0))
        keys.append(cap_key or key)
    prof += [(r, z0), (r2, z0 + h)]
    keys.append(key)
    if top:
        prof.append((0, z0 + h))
        keys.append(cap_key or key)
    return lathe(prof, seg, keys, smooth=smooth)


def box(sx, sy, sz, key, bevel=0.0, bseg=1, z0=None, smooth=False):
    """Коробка с центром в нуле (или дном на z0), с фаской."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    if bevel > 0:
        _bevel(bm, min(bevel, 0.49 * min(sx, sy, sz)), bseg)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    g = geo_from_bm(bm, [key], smooth)
    bm.free()
    if z0 is not None:
        g.xf(T((0, 0, z0 + sz / 2)))
    return g


def hull(points, key, bevel=0.0, bseg=1, smooth=False):
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    junk = list(dict.fromkeys(e for e in res.get('geom_interior', []) + res.get('geom_unused', []) if isinstance(e, bmesh.types.BMVert)))
    if junk:
        bmesh.ops.delete(bm, geom=junk, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel > 0:
        _bevel(bm, bevel, bseg)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    g = geo_from_bm(bm, [key], smooth)
    bm.free()
    return g


def rock(size, seed, key='stone_wall', n=18, bevel=0.12, bseg=1, sink=0.12, top_clip=None, jitter=0.22,
         smooth=False):
    """Глыба: выпуклая оболочка точек на сплюснутой сфере + фаска. size=(x,y,z) — полные габариты.
    Низ уходит под пол на sink*z. top_clip — доля высоты, выше которой срез (плоская крышка)."""
    R = rng(seed)
    sx, sy, sz = size
    pts = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(max(0, 1 - z * z))
        a = ga * i + R.uniform(-0.4, 0.4)
        k = 1.0 - R.uniform(0, jitter)
        p = Vector((math.cos(a) * r * k, math.sin(a) * r * k, z * k))
        pts.append(p)
    lo = min(p.z for p in pts)
    hi = max(p.z for p in pts)
    out = []
    for p in pts:
        u = (p.z - lo) / (hi - lo)
        z = (-sink + u * (1 + sink)) * sz
        if top_clip is not None:
            z = min(z, top_clip * sz)
        out.append(Vector((p.x * sx / 2, p.y * sy / 2, z)))
    b = bevel * min(sx, sy, sz)
    return hull(out, key, b, bseg, smooth)


def dark_top(g, zmin, nz_min=0.72, key='stone_dark', only=None):
    """Тёмная крышка: грани, глядящие вверх, выше zmin."""
    def fn(c, n, k):
        if (only is None or k in only) and n.z > nz_min and c.z > zmin:
            return key
        return k
    return g.recolor(fn)


def tube(pts, radii, seg, key, caps=('flat', 'point'), smooth=True, rfn=None, tip=0.3):
    """Труба по точкам (без сплайна). caps: 'flat' | 'point' | None."""
    P = [Vector(p) for p in pts]
    m = len(P)
    if isinstance(radii, (int, float)):
        radii = [radii] * m
    Tn = []
    for i in range(m):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, m - 1)]
        Tn.append((b - a).normalized())
    up = Vector((0, 0, 1))
    N = up - Tn[0] * up.dot(Tn[0])
    if N.length < 1e-4:
        N = Vector((1, 0, 0)) - Tn[0] * Tn[0].x
    N.normalize()
    g = Geo()
    rings = []
    for i in range(m):
        if i > 0:
            N = Tn[i - 1].rotation_difference(Tn[i]) @ N
            N = (N - Tn[i] * N.dot(Tn[i])).normalized()
        S = Tn[i].cross(N).normalized()
        ring = []
        for k in range(seg):
            a = TAU * k / seg
            p = P[i] + (S * math.cos(a) + N * math.sin(a)) * radii[i]
            if rfn:
                p = Vector(rfn(p, a, i))
            ring.append(g.vert(p))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for k in range(seg):
            g.face((a[k], b[k], b[(k + 1) % seg], a[(k + 1) % seg]), key, smooth)
    if caps[0] == 'flat':
        c = g.vert(P[0])
        for k in range(seg):
            g.face((c, rings[0][k], rings[0][(k + 1) % seg]), key, smooth)
    if caps[1] in ('flat', 'point'):
        e = P[-1] + (Tn[-1] * radii[-1] * tip if caps[1] == 'point' else Vector())
        c = g.vert(e)
        for k in range(seg):
            g.face((rings[-1][k], c, rings[-1][(k + 1) % seg]), key, smooth)
    # проверка направления: нормаль первой боковой грани должна смотреть от оси
    if g.f:
        idx = g.f[0][0]
        c, n = g.center_normal(idx)
        if n.dot(c - P[0]) < 0 and n.dot(c - P[1]) < 0:
            g.f = [(i[::-1], k, s) for i, k, s in g.f]
    return g


def flame(h=0.45, r=0.13, seg=6, key='glow_fire'):
    prof = [(0, -0.02), (r * 0.8, 0.0), (r, h * 0.22), (r * 0.75, h * 0.5), (r * 0.35, h * 0.8), (0, h)]
    return lathe(prof, seg, key, smooth=True)


def crystal(h, r, key='glow_crystal', seg=6, tip=0.32, taper=0.85, sink=0.25, phase=None, lean=(0, 0, 0)):
    """Гранёный кристалл: шестигранная призма с острием. Стоит на z=0, уходит вниз на sink*h."""
    ph = (rng(int(h * 1000 + r * 777)).uniform(0, 1) if phase is None else phase)
    prof = [(0, -sink * h), (r * 0.95, -sink * h), (r, 0.0), (r * taper, h * (1 - tip)), (0, h)]
    g = lathe(prof, seg, key, smooth=False, phase=ph)
    g.xf(T((0, 0, 0), lean))
    return g


def disc(r, key, seg=12, z=0.02, rfn=None):
    g = Geo()
    c = g.vert((0, 0, z))
    ring = []
    for k in range(seg):
        a = TAU * k / seg
        rr = r if rfn is None else rfn(a)
        ring.append(g.vert((math.cos(a) * rr, math.sin(a) * rr, z)))
    for k in range(seg):
        g.face((c, ring[k], ring[(k + 1) % seg]), key, True)
    return g


def blob(r, h, key, seg=10, rings=3, seed=0.0, wob=0.25, z0=0.0, sink=0.0):
    """Плоская капля/кочка: купол по контуру с шумом (лужица варенья, мох)."""
    prof = []
    for i in range(rings + 1):
        t = i / rings
        prof.append((r * math.cos(t * math.pi / 2), z0 + h * math.sin(t * math.pi / 2)))
    prof = [(r * 1.02, z0 - sink)] + prof
    prof[-1] = (0, prof[-1][1])

    def rf(p, a, i):
        k = 1 + wob * nang(a, 1.3, seed)
        return Vector((p.x * k, p.y * k, p.z))
    return lathe(prof, seg, key, rfn=rf, smooth=True)


# ---------------------------------------------------------------- объекты
def make_obj(name, g, coll=None, sharp_deg=40.0, parent=None, loc=(0, 0, 0)):
    keys = []
    for _, k, _ in g.f:
        if k not in keys:
            keys.append(k)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in g.v]
    for idx, k, s in g.f:
        if len(set(idx)) < 3:
            continue
        try:
            f = bm.faces.new([vs[i] for i in idx])
        except ValueError:
            continue
        f.material_index = keys.index(k)
        f.smooth = s
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for k in keys:
        me.materials.append(M(k))
    try:
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    except Exception:
        try:
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(sharp_deg)
        except Exception:
            pass
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    return ob


def obj_tris(ob, rec=True):
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons) if ob.type == 'MESH' else 0
    if rec:
        for c in ob.children:
            n += obj_tris(c)
    return n


def obj_bbox(ob, world=True, rec=True):
    """Габариты пропа вместе с детьми: в мире или относительно origin корня."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    obs = [ob] + (list(ob.children_recursive) if rec else [])
    inv = ob.matrix_world.inverted()
    for o in obs:
        if o.type != 'MESH':
            continue
        mw = o.matrix_world if world else inv @ o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def layout(objs, row_w=40.0, gap=1.5):
    """Раскладка сеткой: слева направо рядами, ряды уходят к +Y (от камеры)."""
    bpy.context.view_layer.update()
    x = 0.0
    y = 0.0
    row_d = 0.0
    for ob in objs:
        lo, hi = obj_bbox(ob, world=False)
        w = hi.x - lo.x
        d = hi.y - lo.y
        if x > 0 and x + w > row_w:
            x = 0.0
            y += row_d + gap
            row_d = 0.0
        ob.location = (x - lo.x, y - lo.y, 0.0)
        x += w + gap
        row_d = max(row_d, d)
    bpy.context.view_layer.update()
    # центрируем всю раскладку в нуле
    lo = Vector((1e9, 1e9, 0))
    hi = -lo
    for ob in objs:
        a, b = obj_bbox(ob)
        lo = Vector(map(min, lo, a))
        hi = Vector(map(max, hi, b))
    c = (lo + hi) / 2
    for ob in objs:
        ob.location.x -= c.x
        ob.location.y -= c.y
    bpy.context.view_layer.update()


def kit_report(kit, objs):
    lines = ['%s' % kit]
    tot = 0
    for ob in objs:
        lo, hi = obj_bbox(ob, world=False)
        t = obj_tris(ob)
        tot += t
        mats = []
        for o in [ob] + list(ob.children_recursive):
            if o.type == 'MESH':
                for m in o.data.materials:
                    if m and m.name not in mats:
                        mats.append(m.name)
        kids = ', '.join('%s(%d)' % (c.name, obj_tris(c, False)) for c in ob.children_recursive)
        if kids:
            kids = '%s(%d), ' % (ob.name, obj_tris(ob, False)) + kids
        lines.append('  %-26s tris=%5d size=%.2f x %.2f x %.2f  z[%.2f..%.2f]  %s%s' % (
            ob.name, t, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.z, hi.z, ','.join(mats),
            ('  parts: ' + kids) if kids else ''))
    lines.append('  TOTAL tris=%d' % tot)
    return '\n'.join(lines)


# ---------------------------------------------------------------- превью
def set_engine(sc):
    for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = e
            return e
        except TypeError:
            continue
    return sc.render.engine


def world_color(hexs='#2a1d16', strength=1.0):
    w = bpy.data.worlds.get('env_world') or bpy.data.worlds.new('env_world')
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next((n for n in w.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg:
        bg.inputs[0].default_value = hexc(hexs)
        bg.inputs[1].default_value = strength
    bpy.context.scene.world = w
    return w


def floor_plane(name, size, hexs, coll, z=-0.004, rough=0.95, noise_amt=0.0):
    fm = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        fm.use_nodes = True
    except Exception:
        pass
    nt = fm.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = hexc(hexs)
    b.inputs['Roughness'].default_value = rough
    if noise_amt > 0:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 0.35
        try:
            tex.inputs['Detail'].default_value = 6
        except Exception:
            pass
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        e = ramp.color_ramp.elements
        c0 = hexc(hexs)
        e[0].color = tuple(x * (1 - noise_amt) for x in c0[:3]) + (1,)
        e[1].color = tuple(min(1, x * (1 + noise_amt * 0.8)) for x in c0[:3]) + (1,)
        e[0].position = 0.3
        e[1].position = 0.7
        nt.links.new(tex.outputs[0], ramp.inputs[0])
        nt.links.new(ramp.outputs[0], b.inputs['Base Color'])
    if isinstance(size, (int, float)):
        size = (size, size)
    sx, sy = size[0] / 2, size[1] / 2
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-sx, -sy, z), (sx, -sy, z), (sx, sy, z), (-sx, sy, z)], [], [(0, 1, 2, 3)])
    me.materials.append(fm)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def add_light(name, kind, loc, energy, hexs, coll, size=0.3, rot=(0, 0, 0)):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = hexc(hexs)[:3]
    try:
        ld.shadow_soft_size = size
    except Exception:
        pass
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = rot
    coll.objects.link(ob)
    return ob


def camera_at(name, coll, target, el_deg, dist, az_deg=0.0, lens=None, fov_v_deg=None, res=(1600, 900)):
    cd = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    ob = bpy.data.objects.get(name)
    if not ob:
        ob = bpy.data.objects.new(name, cd)
        coll.objects.link(ob)
    if fov_v_deg is not None:
        cd.sensor_fit = 'VERTICAL'
        cd.angle_y = math.radians(fov_v_deg)
    elif lens:
        cd.lens = lens
    el = math.radians(el_deg)
    az = math.radians(az_deg)
    d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
    t = Vector(target)
    ob.location = t + d * dist
    ob.rotation_euler = (t - ob.location).to_track_quat('-Z', 'Y').to_euler()
    cd.clip_start = 0.1
    cd.clip_end = 400
    bpy.context.scene.camera = ob
    return ob


def fit_dist(cam, lo, hi, el_deg, az_deg=0.0, res=(1600, 900), pad=1.05):
    """Подбор расстояния, чтобы рамка lo..hi целиком попала в кадр."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    c = (lo + hi) / 2
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    dist = 5.0
    for _ in range(60):
        camera_at(cam.name, None, c, el_deg, dist, az_deg)
        bpy.context.view_layer.update()
        ok = True
        for p in corners:
            v = world_to_camera_view(sc, cam, p)
            m = (pad - 1) / 2
            if not (m <= v.x <= 1 - m and m <= v.y <= 1 - m) or v.z <= 0:
                ok = False
                break
        if ok:
            break
        dist *= 1.08
    return dist


def render_to(path, res=(1600, 900), samples=32):
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
    try:
        sc.view_settings.view_transform = 'Standard'
    except Exception:
        try:
            sc.view_settings.view_transform = 'Filmic'
        except Exception:
            pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def kit_preview(kit, objs, path, res=(1600, 900), el=60.0):
    coll = get_coll('preview_rig')
    sc = bpy.context.scene
    world_color('#2c1f17', 0.7)
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for ob in objs:
        a, b = obj_bbox(ob)
        lo = Vector(map(min, lo, a))
        hi = Vector(map(max, hi, b))
    lo.z = 0.0
    size = max(hi.x - lo.x, hi.y - lo.y) + 12
    floor_plane('preview_floor', size * 3.0, '#4d4038', coll, noise_amt=0.25)
    span = max(hi.x - lo.x, hi.y - lo.y)
    add_light('preview_sun', 'SUN', (0, 0, 10), 3.0, '#fff1e2', coll, rot=(math.radians(38), math.radians(-14), math.radians(-30)))
    add_light('preview_fill', 'SUN', (0, 0, 10), 0.5, '#7fa0b0', coll, rot=(math.radians(60), math.radians(25), math.radians(150)))
    c = (lo + hi) / 2
    for i, (fx, fy) in enumerate([(-0.3, -0.35), (0.3, -0.3), (0.0, 0.35)]):
        add_light('preview_warm%d' % i, 'POINT', (c.x + fx * span, c.y + fy * span, 3.0 + 0.2 * span), 2 * span * span, '#ffbb80',
                  coll, size=1.5)
    cam = camera_at('preview_cam', coll, c, el, 30.0, 0.0, lens=50)
    fit_dist(cam, lo, hi, el, 0.0, res, pad=1.06)
    render_to(path, res)
    return path


def export_kit(objs, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for ob in objs:
        ob.select_set(True)
        for c in ob.children_recursive:
            c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_cameras=False, export_lights=False,
              export_animations=False, export_texcoords=False, export_normals=True, export_apply=True,
              export_yup=True, export_extras=False, export_skins=False, export_morph=False,
              export_materials='EXPORT')
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = {k: v for k, v in kw.items() if k in props or k == 'filepath'}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(**kw)
    return path


def finish_kit(kit, objs, preview=True):
    """Раскладка уже сделана. Превью, сохранение .blend, экспорт GLB, отчёт."""
    rep = kit_report(kit, objs)
    if preview:
        kit_preview(kit, objs, ROOT + '/docs/survivors/models/previews/%s.png' % kit)
    save_as(ROOT + '/docs/survivors/blender/%s.blend' % kit)
    export_kit(objs, ROOT + '/docs/survivors/models/%s.glb' % kit)
    return rep
