# Общий набор для персонажей фермы (питомцы, NPC, свин, Древо): сборка сетки из мягких примитивов в один bmesh
# (цвет в вершинах, материал по граням, веса костей), простой скелет «все кости вверх», запекание анимаций
# по кадрам в отдельные Actions + NLA, экспорт glb (+Y вверх) и превью (Cycles, тень на прозрачной земле).
# Персонаж смотрит в +Y Blender = −Z three.js (как желейка в avatar.ts). Основание — z = 0.
import bpy, bmesh, math, os, sys, time
from mathutils import Vector, Matrix, Euler, Quaternion

ROOT = '/Users/tired/Desktop/game-opus-farm'
BLEND_DIR = ROOT + '/art/farm/blend'
GLB_DIR = ROOT + '/client/assets/farm/models'
REN_DIR = ROOT + '/art/farm/renders'
FPS = 30
TMP = '/private/tmp/claude-501/-Users-tired-Desktop/81444081-32d2-4271-a743-359fa2861087/scratchpad/chars/render'
os.makedirs(TMP, exist_ok=True)

rad = math.radians


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def C(h, a=1.0):
    """#rrggbb (sRGB) -> линейный RGBA для атрибута цвета."""
    h = h.lstrip('#')
    return (lin(int(h[0:2], 16) / 255), lin(int(h[2:4], 16) / 255), lin(int(h[4:6], 16) / 255), a)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


def sstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def bump(t, a, b):
    """0 вне [a,b], плавный горб 0→1→0 внутри."""
    if t <= a or t >= b:
        return 0.0
    u = (t - a) / (b - a)
    return math.sin(math.pi * u) ** 2


def win(t, a, b, fade=0.08):
    """Окно 0→1 (держит)→0 на [a,b] с плавными краями fade."""
    return sstep(a, a + fade, t) * (1 - sstep(b - fade, b, t))


def blink(t, at, dur=0.06):
    """Масштаб века: 1 открыт, ~0.1 закрыт около момента at (доли цикла)."""
    d = abs(t - at)
    if d > dur:
        return 1.0
    return 0.1 + 0.9 * (d / dur) ** 2


# ------------------------------------------------------------ сцена и материалы

def reset():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions, bpy.data.cameras,
                 bpy.data.lights, bpy.data.images, bpy.data.curves):
        for d in list(coll):
            coll.remove(d)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    try:
        bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
    except Exception:
        pass


# Общие материалы — те же имена и настройки, что у грядок (art/farm/MODELS.md), плюс желе и стекло/свет.
MATS = {
    'farm_jelly': dict(rough=0.32, coat=1.0, coat_r=0.08),
    'farm_gloss': dict(rough=0.26, coat=0.35, coat_r=0.12),
    'farm_soft': dict(rough=0.68, coat=0.0, coat_r=0.12),
    'farm_fluff': dict(rough=0.48, coat=0.2, coat_r=0.25),
    'farm_metal': dict(rough=0.34, metal=0.75, coat_r=0.12),
    'farm_shell': dict(rough=0.22, metal=0.55, coat=0.6, coat_r=0.08),
    'farm_glass': dict(rough=0.05, coat=0.5, coat_r=0.05, alpha=0.2, vc=False, color='#eef9ff'),
    'farm_glow': dict(rough=0.4, emit='#ff9a1c', emit_s=1.8, vc=False, color='#ffb84d'),
}


def material(name, **over):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    spec = dict(MATS.get(name, {}))
    spec.update(over)
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    inp = lambda k: next(s for s in b.inputs if s.identifier == k)
    if spec.get('vc', True):
        ca = nt.nodes.new('ShaderNodeVertexColor')
        ca.layer_name = 'Col'
        nt.links.new(ca.outputs[0], inp('Base Color'))
    else:
        inp('Base Color').default_value = C(spec['color'])
    inp('Roughness').default_value = spec.get('rough', 0.5)
    inp('Metallic').default_value = spec.get('metal', 0.0)
    inp('Coat Weight').default_value = spec.get('coat', 0.0)
    inp('Coat Roughness').default_value = spec.get('coat_r', 0.12)
    if 'emit' in spec:
        inp('Emission Color').default_value = C(spec['emit'])
        inp('Emission Strength').default_value = spec['emit_s']
    if 'alpha' in spec:
        inp('Alpha').default_value = spec['alpha']
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
        try:
            m.use_backface_culling = True
        except Exception:
            pass
    return m


# ------------------------------------------------------------ сетка

def _M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (Matrix.Translation(Vector(loc)) @ Euler([rad(a) for a in rot], 'XYZ').to_matrix().to_4x4()
            @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0)))


def catmull(points, div):
    """Как THREE.SplineCurve(points).getPoints(div)."""
    n = len(points)
    out = []
    for d in range(div + 1):
        t = d / div
        p = (n - 1) * t
        ip = int(math.floor(p))
        w = p - ip
        p0 = points[ip if ip == 0 else ip - 1]
        p1 = points[ip]
        p2 = points[n - 1 if ip > n - 2 else ip + 1]
        p3 = points[n - 1 if ip > n - 3 else ip + 2]
        res = []
        for k in range(2):
            v0 = (p2[k] - p0[k]) * 0.5
            v1 = (p3[k] - p1[k]) * 0.5
            t2 = w * w
            t3 = w * t2
            res.append((2 * p1[k] - 2 * p2[k] + v0 + v1) * t3 + (-3 * p1[k] + 3 * p2[k] - 2 * v0 - v1) * t2 + v0 * w + p1[k])
        out.append((res[0], res[1]))
    return out


# Профиль тела желейки (client/render/outfit3d.ts, PROFILE): r, высота. Рост 1,58, ширина 1,05.
JELLY_PROFILE = [(0.001, 0.0), (0.3, 0.0), (0.43, 0.07), (0.505, 0.25), (0.525, 0.55), (0.51, 0.84),
                 (0.46, 1.09), (0.37, 1.31), (0.23, 1.49), (0.001, 1.58)]
JELLY_PTS = catmull(JELLY_PROFILE, 28)
BODY_H = 1.58


def jelly_r(z):
    pts = JELLY_PTS
    if z <= 0:
        return 0.3
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        if z <= b[1] and b[1] > a[1]:
            return a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0])
    return 0.0


class Mesh:
    """Один bmesh на модель: части добавляются примитивами, у каждой — цвет, материал, кость (или функция весов)."""

    def __init__(self, name, mats, q=1.0):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.dl = self.bm.verts.layers.deform.verify()
        self.groups = []
        self.mats = list(mats)
        self.q = q

    def n(self, base, lo=4):
        return max(lo, int(round(base * self.q)))

    def gi(self, name):
        if name not in self.groups:
            self.groups.append(name)
        return self.groups.index(name)

    def _finish(self, verts, color, mat, bone, smooth=True, flip=False):
        faces = set()
        for v in verts:
            faces.update(v.link_faces)
        mi = self.mats.index(mat)
        for f in faces:
            f.material_index = mi
            f.smooth = smooth
            for l in f.loops:
                l[self.col] = color(l.vert.co) if callable(color) else color
        for v in verts:
            w = bone(v.co) if callable(bone) else {bone: 1.0}
            tot = sum(max(0.0, x) for x in w.values()) or 1.0
            for k, val in w.items():
                if val > 1e-4:
                    v[self.dl][self.gi(k)] = val / tot
        bmesh.ops.recalc_face_normals(self.bm, faces=list(faces))
        if flip:
            bmesh.ops.reverse_faces(self.bm, faces=list(faces))
        return verts

    def _place(self, verts, loc, rot, scale, deform, post=None):
        M = _M(loc, rot, scale)
        for v in verts:
            co = v.co.copy()
            if deform:
                co = Vector(deform(co))
            co = M @ co
            if post:
                co = Vector(post(co))
            v.co = co

    def sphere(self, r=1.0, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), seg=16, ring=10, deform=None, post=None,
               color=(1, 1, 1, 1), mat=None, bone='root', **kw):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=self.n(seg, 5), v_segments=self.n(ring, 3), radius=r)
        verts = res['verts']
        self._place(verts, loc, rot, scale, deform, post)
        return self._finish(verts, color, mat or self.mats[0], bone, **kw)

    def lathe(self, prof, seg=24, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), deform=None, post=None,
              color=(1, 1, 1, 1), mat=None, bone='root', start=0.0, **kw):
        seg = self.n(seg, 5)
        bm = self.bm
        rings = []
        for (r, z) in prof:
            if r < 0.002:
                rings.append([bm.verts.new((0, 0, z))])
            else:
                rings.append([bm.verts.new((r * math.cos(start + 2 * math.pi * i / seg),
                                            r * math.sin(start + 2 * math.pi * i / seg), z)) for i in range(seg)])
        for a, b in zip(rings, rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            for i in range(seg):
                j = (i + 1) % seg
                if len(a) == 1:
                    bm.faces.new((a[0], b[j], b[i]))
                elif len(b) == 1:
                    bm.faces.new((a[i], a[j], b[0]))
                else:
                    bm.faces.new((a[i], a[j], b[j], b[i]))
        verts = [v for r_ in rings for v in r_]
        self._place(verts, loc, rot, scale, deform, post)
        return self._finish(verts, color, mat or self.mats[0], bone, **kw)

    def tube(self, pts, radii, seg=8, cap=True, color=(1, 1, 1, 1), mat=None, bone='root', post=None, cap_k=0.7,
             **kw):
        seg = self.n(seg, 4)
        bm = self.bm
        pts = [Vector(p) for p in pts]
        if not isinstance(radii, (list, tuple)):
            radii = [radii] * len(pts)
        n = len(pts)
        T = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
        up = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
        N = (up - T[0] * up.dot(T[0])).normalized()
        rings = []
        for i in range(n):
            N = (N - T[i] * N.dot(T[i])).normalized()
            B = T[i].cross(N)
            rings.append([bm.verts.new(pts[i] + (N * math.cos(2 * math.pi * k / seg) + B * math.sin(2 * math.pi * k / seg)) * radii[i])
                          for k in range(seg)])
        for a, b in zip(rings, rings[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                bm.faces.new((a[i], a[j], b[j], b[i]))
        verts = [v for r_ in rings for v in r_]
        if cap:
            p0 = bm.verts.new(pts[0] - T[0] * radii[0] * cap_k)
            p1 = bm.verts.new(pts[-1] + T[-1] * radii[-1] * cap_k)
            for i in range(seg):
                j = (i + 1) % seg
                bm.faces.new((rings[0][j], rings[0][i], p0))
                bm.faces.new((rings[-1][i], rings[-1][j], p1))
            verts += [p0, p1]
        if post:
            for v in verts:
                v.co = Vector(post(v.co.copy()))
        return self._finish(verts, color, mat or self.mats[0], bone, **kw)

    def torus(self, R=0.1, r=0.02, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), seg=24, rseg=8, arc=1.0,
              deform=None, post=None, color=(1, 1, 1, 1), mat=None, bone='root', **kw):
        seg = self.n(seg, 6)
        rseg = self.n(rseg, 4)
        bm = self.bm
        closed = arc >= 0.999
        cnt = seg if closed else seg + 1
        rings = []
        for i in range(cnt):
            a = 2 * math.pi * arc * i / seg
            c = Vector((math.cos(a), math.sin(a), 0))
            rings.append([bm.verts.new(c * (R + r * math.cos(2 * math.pi * k / rseg)) + Vector((0, 0, r * math.sin(2 * math.pi * k / rseg))))
                          for k in range(rseg)])
        pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
        for a, b in pairs:
            for k in range(rseg):
                l = (k + 1) % rseg
                bm.faces.new((a[k], a[l], b[l], b[k]))
        verts = [v for r_ in rings for v in r_]
        if not closed:
            for ring, sgn in ((rings[0], -1), (rings[-1], 1)):
                cen = sum((v.co for v in ring), Vector()) / len(ring)
                p = bm.verts.new(cen)
                for k in range(rseg):
                    l = (k + 1) % rseg
                    bm.faces.new((ring[k], ring[l], p))
                verts.append(p)
        self._place(verts, loc, rot, scale, deform, post)
        return self._finish(verts, color, mat or self.mats[0], bone, **kw)

    def box(self, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, bseg=2, deform=None, post=None,
            color=(1, 1, 1, 1), mat=None, bone='root', **kw):
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = res['verts']
        for v in verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            out = bmesh.ops.bevel(self.bm, geom=verts + edges, offset=bevel, segments=max(1, self.n(bseg, 1)),
                                  affect='EDGES', profile=0.5)
            verts = list({v for f in out['faces'] for v in f.verts} | set(verts))
            verts = [v for v in verts if v.is_valid]
        self._place(verts, loc, rot, scale=(1, 1, 1), deform=deform, post=post)
        return self._finish(verts, color, mat or self.mats[0], bone, **kw)

    def shell(self, rfn, z0, z1, a0, a1, off=0.02, thick=0.014, nz=8, na=12, full=False, color=(1, 1, 1, 1),
              mat=None, bone='root', **kw):
        """Оболочка по телу (фартук, жилет, карман): rfn(z) — радиус тела, углы от +Y к +X (рад, числа или
        функции z). Толщина thick — замкнутая пластинка, видна с обеих сторон."""
        bm = self.bm
        A0 = a0 if callable(a0) else (lambda z, v=a0: v)
        A1 = a1 if callable(a1) else (lambda z, v=a1: v)
        nz_ = self.n(nz, 2)
        na_ = self.n(na, 3)
        outer, inner = [], []
        for i in range(nz_ + 1):
            z = z0 + (z1 - z0) * i / nz_
            r = rfn(z)
            ro, ri = [], []
            cnt = na_ if full else na_ + 1
            for j in range(cnt):
                a = 2 * math.pi * j / na_ if full else A0(z) + (A1(z) - A0(z)) * j / na_
                sa, ca = math.sin(a), math.cos(a)
                ro.append(bm.verts.new(((r + off + thick) * sa, (r + off + thick) * ca, z)))
                ri.append(bm.verts.new(((r + off) * sa, (r + off) * ca, z)))
            outer.append(ro)
            inner.append(ri)

        def grid(rows, flip):
            for i in range(len(rows) - 1):
                n = len(rows[i])
                for j in (range(n) if full else range(n - 1)):
                    k = (j + 1) % n
                    qd = (rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j])
                    bm.faces.new(qd[::-1] if flip else qd)
        grid(outer, False)
        grid(inner, True)
        for row in (0, nz_):
            n = len(outer[row])
            for j in (range(n) if full else range(n - 1)):
                k = (j + 1) % n
                bm.faces.new((outer[row][j], outer[row][k], inner[row][k], inner[row][j]))
        if not full:
            for col in (0, -1):
                for i in range(nz_):
                    bm.faces.new((outer[i][col], outer[i + 1][col], inner[i + 1][col], inner[i][col]))
        verts = [v for r_ in outer + inner for v in r_]
        return self._finish(verts, color, mat or self.mats[0], bone, **kw)

    def hood(self, rfn, zb, ztop, off=0.022, seg=24, rings=8, color=(1, 1, 1, 1), mat=None, bone='root', **kw):
        """Колпак по телу (косынка): нижний край на высоте zb(a) (a — угол от +Y к +X), верх — полюс на ztop."""
        bm = self.bm
        seg = self.n(seg, 6)
        rings = self.n(rings, 3)
        grid = []
        for i in range(rings):
            row = []
            for j in range(seg):
                a = 2 * math.pi * j / seg
                aa = a if a <= math.pi else a - 2 * math.pi
                z0 = zb(aa)
                u = i / rings
                z = z0 + (ztop - z0) * (1 - (1 - u) ** 1.3)
                r = rfn(z) + off
                row.append(bm.verts.new((r * math.sin(a), r * math.cos(a), z)))
            grid.append(row)
        top = bm.verts.new((0, 0, ztop + off * 0.6))
        for i in range(rings - 1):
            for j in range(seg):
                k = (j + 1) % seg
                bm.faces.new((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]))
        for j in range(seg):
            bm.faces.new((grid[-1][j], grid[-1][(j + 1) % seg], top))
        verts = [v for r_ in grid for v in r_] + [top]
        return self._finish(verts, color, mat or self.mats[0], bone, **kw)

    def disc(self, r=0.05, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), seg=12, thick=0.004, **kw):
        """Плоская «таблетка» (румянец, пуговица) — сплющенная сфера."""
        return self.sphere(r, loc=loc, rot=rot, scale=(scale[0], scale[1], thick / r), seg=seg, ring=4, **kw)

    def object(self, arm=None):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for mn in self.mats:
            me.materials.append(material(mn))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        for g in self.groups:
            ob.vertex_groups.new(name=g)
        try:
            me.color_attributes.active_color = me.color_attributes['Col']
            me.color_attributes.render_color_index = 0
        except Exception:
            pass
        if arm is not None:
            ob.parent = arm
            mod = ob.modifiers.new('Armature', 'ARMATURE')
            mod.object = arm
        return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ------------------------------------------------------------ скелет и анимация

def armature(name, bones):
    """bones: (имя, голова (x,y,z), родитель|None[, деформирует=True]). Все кости смотрят вверх (+Z), крен 0:
    поворот и сдвиг в анимации задаются прямо в осях мира относительно родителя."""
    ad = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, ad)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in bones:
        n, h, p = b[0], b[1], b[2]
        deform = b[3] if len(b) > 3 else True
        L = b[4] if len(b) > 4 else 0.08
        eb = ad.edit_bones.new(n)
        eb.head = h
        eb.tail = (h[0], h[1], h[2] + L)
        eb.roll = 0.0
        eb.use_deform = deform
        if p:
            eb.parent = ad.edit_bones[p]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    arm.data.display_type = 'STICK'
    return arm


def bake(arm, name, n, fn, nla=True):
    """Анимация name длиной n кадров (0..n включительно; для цикла fn(0)=fn(1)). fn(t, f) -> {кость: {loc, rot, sc}}:
    loc — сдвиг в осях мира (м), rot — градусы XYZ в осях мира вокруг головы кости, sc — масштаб по осям мира.
    Ключ ставится каждой кости в каждом кадре: в игре ни одна кость не «залипает» с прошлой анимации."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    R = arm.data.bones[0].matrix_local.to_3x3()
    Ri = R.inverted()
    prev = {}
    for f in range(0, n + 1):
        t = f / n
        pose = fn(t, f)
        for pb in arm.pose.bones:
            d = pose.get(pb.name, {})
            loc = Vector(d.get('loc', (0, 0, 0)))
            rot = d.get('rot', (0, 0, 0))
            sc = d.get('sc', (1, 1, 1))
            if not isinstance(sc, (tuple, list)):
                sc = (sc, sc, sc)
            pb.location = Ri @ loc
            q = (Ri @ Euler([rad(a) for a in rot], 'XYZ').to_matrix() @ R).to_quaternion()
            if pb.name in prev and prev[pb.name].dot(q) < 0:
                q.negate()
            prev[pb.name] = q.copy()
            pb.rotation_quaternion = q
            S = Ri @ Matrix.Diagonal(Vector(sc)) @ R
            pb.scale = (abs(S[0][0]), abs(S[1][1]), abs(S[2][2]))
            pb.keyframe_insert('location', frame=f, group=pb.name)
            pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
            pb.keyframe_insert('scale', frame=f, group=pb.name)
    if nla:
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        try:
            if act.slots:
                st.action_slot = act.slots[0]
        except Exception:
            pass
        tr.mute = True
        ad.action = None
    return act


def bake_object(ob, name, n, fn):
    """Анимация объекта без скелета (трюфель, шишка): fn(t,f) -> {loc, rot, sc} от исходного положения."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad = ob.animation_data or ob.animation_data_create()
    ad.action = act
    ob.rotation_mode = 'XYZ'
    for f in range(0, n + 1):
        d = fn(f / n, f)
        ob.location = d.get('loc', (0, 0, 0))
        ob.rotation_euler = [rad(a) for a in d.get('rot', (0, 0, 0))]
        sc = d.get('sc', (1, 1, 1))
        ob.scale = sc if isinstance(sc, (tuple, list)) else (sc, sc, sc)
        ob.keyframe_insert('location', frame=f)
        ob.keyframe_insert('rotation_euler', frame=f)
        ob.keyframe_insert('scale', frame=f)
    tr = ad.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    try:
        if act.slots:
            st.action_slot = act.slots[0]
    except Exception:
        pass
    tr.mute = True
    ad.action = None
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    ob.scale = (1, 1, 1)
    return act


def use_action(holder, act, frame):
    ad = holder.animation_data or holder.animation_data_create()
    ad.action = act
    try:
        if act and act.slots:
            ad.action_slot = act.slots[0]
    except Exception:
        pass
    bpy.context.scene.frame_set(frame)


def clear_action(holder):
    if holder.animation_data:
        holder.animation_data.action = None
    if holder.type == 'ARMATURE':
        for pb in holder.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.scale = (1, 1, 1)
    bpy.context.scene.frame_set(0)


# ------------------------------------------------------------ экспорт

def save_blend(fid):
    os.makedirs(BLEND_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=f'{BLEND_DIR}/{fid}.blend', compress=True)


def export_glb(fid, objs, animations=True):
    os.makedirs(GLB_DIR, exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(False)
        if o.animation_data:
            o.animation_data.action = None
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.context.scene.frame_set(0)
    path = f'{GLB_DIR}/{fid}.glb'
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=animations, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_frame_step=1, export_skins=True, export_morph=True, export_vertex_color='MATERIAL',
        export_texcoords=False, export_normals=True, export_materials='EXPORT', export_cameras=False,
        export_lights=False, export_leaf_bone=False, export_def_bones=False, export_optimize_animation_size=True,
        export_reset_pose_bones=True, export_rest_position_armature=True, export_anim_slide_to_zero=True,
        export_extras=False)
    print('GLB', path, os.path.getsize(path))
    return path


# ------------------------------------------------------------ превью

BG = '#e4f6dc'


def stage(catcher=True):
    """Камера, солнце, заполняющий свет, тень на прозрачной земле. Возвращает объекты сцены превью."""
    sc = bpy.context.scene
    try:
        sc.render.engine = 'CYCLES'
    except TypeError:
        pass
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('GPU off', e)
    sc.cycles.samples = 32
    sc.cycles.use_denoising = True
    try:
        sc.cycles.use_adaptive_sampling = True
    except Exception:
        pass
    sc.render.film_transparent = True
    try:
        sc.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    w = bpy.data.worlds.get('W') or bpy.data.worlds.new('W')
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bgn = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bgn.inputs[0].default_value = (0.78, 0.86, 0.95, 1)
    bgn.inputs[1].default_value = 1.15
    out = []
    cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 55
    sun = bpy.data.objects.new('PreviewSun', bpy.data.lights.new('PreviewSun', 'SUN'))
    sun.data.energy = 2.6
    sun.data.angle = rad(12)
    sun.rotation_euler = (rad(34), rad(-14), rad(-32))
    sc.collection.objects.link(sun)
    fill = bpy.data.objects.new('PreviewFill', bpy.data.lights.new('PreviewFill', 'AREA'))
    fill.data.energy = 120
    fill.data.size = 4
    fill.location = (-3, 2.5, 2.2)
    fill.rotation_euler = (Vector((3, -2.5, -1.4))).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(fill)
    out += [cam, sun, fill]
    if catcher:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
        me = bpy.data.meshes.new('PreviewGround')
        bm.to_mesh(me)
        bm.free()
        g = bpy.data.objects.new('PreviewGround', me)
        sc.collection.objects.link(g)
        try:
            g.is_shadow_catcher = True
        except Exception:
            pass
        out.append(g)
    return out


def frame_cam(lo, hi, view=(0.48, 1.0, 0.4), fill=0.86):
    """Камера смотрит на коробку lo..hi с направления view (от цели к глазу)."""
    cam = bpy.context.scene.camera
    lo, hi = Vector(lo), Vector(hi)
    c = (lo + hi) / 2
    r = (hi - lo).length / 2
    d = Vector(view).normalized()
    fov = 2 * math.atan(18 / cam.data.lens)
    dist = r / math.sin(fov / 2) / fill
    cam.location = c + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = 0.01
    cam.data.clip_end = dist * 4


def _composite(src, dst, bg=BG):
    import numpy as np
    img = bpy.data.images.load(src, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    bgc = np.array([int(bg[1:3], 16), int(bg[3:5], 16), int(bg[5:7], 16)], dtype=np.float32) / 255
    a = px[:, :, 3:4]
    rgb = px[:, :, :3] * a + bgc * (1 - a)
    bpy.data.images.remove(img)
    return rgb


def _save_rgb(rgb, dst):
    import numpy as np
    h, w = rgb.shape[:2]
    out = bpy.data.images.new('out', w, h, alpha=False)
    full = np.ones((h, w, 4), dtype=np.float32)
    full[:, :, :3] = rgb
    out.pixels.foreach_set(full.ravel())
    out.filepath_raw = dst
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)


def render(dst, size=512, samples=32):
    sc = bpy.context.scene
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.cycles.samples = samples
    tmp = f'{TMP}/r_{int(time.time() * 1000)}.png'
    sc.render.filepath = tmp
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    rgb = _composite(tmp, dst)
    _save_rgb(rgb, dst)
    print('PNG', dst, round(time.time() - t0, 1), 's')


def strip(dst, holder, act, frames, size=256, samples=20):
    """3–4 кадра анимации в одну полосу PNG."""
    import numpy as np
    sc = bpy.context.scene
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.cycles.samples = samples
    tiles = []
    for f in frames:
        use_action(holder, act, f)
        tmp = f'{TMP}/s_{int(time.time() * 1000)}.png'
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        tiles.append(_composite(tmp, None))
    clear_action(holder)
    _save_rgb(np.concatenate(tiles, axis=1), dst)
    print('STRIP', dst)


def remove(objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)


def report(fid, meshes, arm=None, acts=()):
    t = {m.name: tris(m) for m in meshes}
    nb = len(arm.data.bones) if arm else 0
    print('REPORT', fid, 'tris', t, 'bones', nb, 'anims', [(a.name, int(a.frame_range[1])) for a in acts])
