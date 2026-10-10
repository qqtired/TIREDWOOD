# mobkit.py — общие помощники для мобов «Подземелья» (TIREDWOOD).
# Запуск внутри Blender: exec(open('<repo>/tools/survivors/blender/<id>.py').read()),
# каждый скрипт модели сам подключает этот файл.
#
# Модель = пустой корень <id> (z=0) + жёсткие части-меши (<=8) с origin в суставе.
# Анимации — ключи на трансформациях частей, каждое действие кладётся в NLA-дорожку
# с именем <id>_<action>; экспорт glTF в режиме NLA_TRACKS склеивает дорожки одного имени
# в одну анимацию узлов.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler, noise
from mathutils.bvhtree import BVHTree

ROOT = '/Users/tired/Desktop/game-opus-survivors'
FPS = 24
TAU = math.tau
REST_FRAME = -20
MODEL_SCALE = 1.0  # скрипт модели может задать после exec(mobkit): вся геометрия и смещения в клипах умножаются


# ---------------------------------------------------------------- цвета / материалы
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h, a=1.0):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (_lin(r), _lin(g), _lin(b), a)


# общий набор: ключ -> (базовый цвет sRGB, roughness, metallic, emission sRGB, emission strength[, coat])
MATS = {
    'jam':      ('#5a1f78', 0.15, 0.0, None, 0.0, 0.6),    # варенье: тёмное глянцевое, лёгкий лак
    'jam_gel':  ('#62287f', 0.10, 0.0, '#3f1060', 0.2, 0.7),  # «желе»: слизень, мешки жабы
    'eye':      ('#dcc2ff', 0.40, 0.0, '#b57bff', 2.6),    # glow_jam: глаза, кристалл (умеренное свечение)
    'fur':      ('#3a3034', 0.85, 0.0, None, 0.0),         # тёмно-бурая шерсть с холодным оттенком
    'moss':     ('#7a9440', 0.90, 0.0, None, 0.0),         # мох (Бочар)
    'cap_light': ('#a07a58', 0.50, 0.0, None, 0.0),        # светлая карамельная кайма шляпок
    'stone':    ('#57525a', 0.70, 0.0, None, 0.0),         # тёмный камень: бронеплитки личинки (как у босса)
    'flesh':    ('#9c6f7b', 0.55, 0.0, None, 0.0),         # уши, хвост, лапки
    'membrane': ('#2b2c3b', 0.60, 0.0, None, 0.0),         # перепонки крыльев
    'chitin':   ('#1c2636', 0.30, 0.0, None, 0.0),         # хитин жука
    'iron':     ('#6e7887', 0.42, 0.35, None, 0.0),        # щит, обручи (без env-карты металл темнеет — держим metallic низким)
    'cap':      ('#6f4630', 0.50, 0.0, None, 0.0),         # коричневая шляпка
    'cream':    ('#d8cbb3', 0.60, 0.0, None, 0.0),         # кремовая ножка, пластинки, клыки
    'toad':     ('#3b5747', 0.45, 0.0, None, 0.0),         # тёмная холодная жабья кожа
    'troll':    ('#566659', 0.70, 0.0, None, 0.0),         # серо-зелёная кожа тролля
    'wood':     ('#4b3123', 0.70, 0.0, None, 0.0),         # бочки, посох
    'robe':     ('#342d44', 0.80, 0.0, None, 0.0),         # мантия шамана
    'horn':     ('#25201d', 0.40, 0.0, None, 0.0),         # когти, жвала
}


def mat(key):
    name = 'mob_' + key
    m = bpy.data.materials.get(name)
    if m:
        return m
    base, rough, metal, eh, es = MATS[key][:5]
    coat = MATS[key][5] if len(MATS[key]) > 5 else 0.0
    m = bpy.data.materials.new(name)
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
    if coat:
        cw_ = bsdf.inputs.get('Coat Weight')
        if cw_:
            cw_.default_value = coat
            bsdf.inputs['Coat Roughness'].default_value = 0.06
    m.diffuse_color = hexc(base)
    m.roughness = rough
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
                 bpy.data.cameras, bpy.data.lights, bpy.data.curves, bpy.data.node_groups):
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


def V(*a):
    if len(a) == 1:
        return Vector(a[0])
    return Vector(a)


class Part:
    """Жёсткая часть модели: копит геометрию в bmesh в координатах модели."""

    def __init__(self, name, joint=(0, 0, 0)):
        self.name = name
        self.joint = Vector(joint)
        self.bm = bmesh.new()
        self.mats = []
        self.hard = set()

    def mi(self, key):
        if key not in self.mats:
            self.mats.append(key)
        return self.mats.index(key)

    # --- ядро: соединить кольца вершин (кольцо = список из seg вершин или 1 вершины-полюса)
    def _loft(self, rings, key, closed=True, hard=False, recalc=True):
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
                for k in range(n):
                    faces.append(bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k])))
        for f in faces:
            f.material_index = idx
            f.smooth = True
        if recalc and faces:
            bmesh.ops.recalc_face_normals(bm, faces=faces)
        if hard:
            self.hard.update(faces)
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
             cap_k=0.9, cap_steps=2, fn=None, hard=False, phase=None):
        """Труба по сплайну Catmull-Rom; radii — число или (rx, ry) на каждую точку.
        rx — поперёк (side), ry — по направлению up."""
        P = resample([Vector(p) for p in pts], n)
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
        cs0, cs1 = cap_steps if isinstance(cap_steps, (tuple, list)) else (cap_steps, cap_steps)
        specs = []  # (center, S, N, rx, ry)
        # начало
        S0, N0 = frames[0]
        r0 = (R[0].x + R[0].y) * 0.5
        if caps[0] == 'round' and r0 > 1e-5:
            specs.append((P[0] - T[0] * r0 * cap_k, S0, N0, 0, 0))
            for s in range(cs0 - 1, 0, -1):
                th = (math.pi / 2) * s / cs0
                specs.append((P[0] - T[0] * r0 * cap_k * math.sin(th), S0, N0, R[0].x * math.cos(th), R[0].y * math.cos(th)))
        elif caps[0] == 'flat' and r0 > 1e-5:
            specs.append((P[0], S0, N0, 0, 0))
        for i in range(m):
            S, Nn = frames[i]
            specs.append((P[i], S, Nn, max(R[i].x, 0), max(R[i].y, 0)))
        S1, N1 = frames[-1]
        r1 = (R[-1].x + R[-1].y) * 0.5
        if caps[1] == 'round' and r1 > 1e-5:
            for s in range(1, cs1):
                th = (math.pi / 2) * s / cs1
                specs.append((P[-1] + T[-1] * r1 * cap_k * math.sin(th), S1, N1, R[-1].x * math.cos(th), R[-1].y * math.cos(th)))
            specs.append((P[-1] + T[-1] * r1 * cap_k, S1, N1, 0, 0))
        elif caps[1] == 'flat' and r1 > 1e-5:
            specs.append((P[-1], S1, N1, 0, 0))
        rings = [self._ring(c, S, Nn, rx, ry, seg, ph, fn) for (c, S, Nn, rx, ry) in specs]
        return self._loft(rings, key, hard=hard)

    def ellipsoid(self, key, c, r, seg=10, rings=6, rot=(0, 0, 0), fn=None, unit_fn=None, hard=False):
        """Эллипсоид: центр c, радиусы r=(rx,ry,rz), поворот rot (Euler XYZ, рад).
        unit_fn(v)->v деформирует единичную сферу до масштаба."""
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
                a = TAU * j / seg + (math.pi / seg if k % 2 else 0) * 0
                v = Vector((s * math.cos(a), s * math.sin(a), z))
                if unit_fn:
                    v = unit_fn(v)
                v = Vector((v.x * r[0], v.y * r[1], v.z * r[2]))
                p = c + M @ v
                if fn:
                    p = fn(p)
                ring.append(self.bm.verts.new(p))
            rl.append(ring)
        return self._loft(rl, key, hard=hard)

    def lathe(self, key, profile, seg=16, c=(0, 0, 0), sx=1.0, sy=1.0, rot=(0, 0, 0), fn=None, hard=False, afn=None):
        """Тело вращения вокруг локальной Z: profile = [(r, z)...], r=0 даёт полюс."""
        c = Vector(c)
        M = Euler(rot).to_matrix()
        rl = []
        for (r, z) in profile:
            ring = []
            cnt = 1 if r < 1e-6 else seg
            for j in range(cnt):
                a = TAU * j / seg
                rk = r * (afn(j) if afn else 1.0)
                v = Vector((rk * math.cos(a) * sx, rk * math.sin(a) * sy, z))
                p = c + M @ v
                if fn:
                    p = fn(p)
                ring.append(self.bm.verts.new(p))
            rl.append(ring)
        return self._loft(rl, key, hard=hard)

    def sheet(self, key, nu, nv, pos, off, hard=True):
        """Пластина с толщиной: pos(u,v)->Vector лицевой поверхности (u,v в [0,1]),
        off(u,v)->Vector смещение тыльной стороны. Замкнутая, нормали наружу."""
        bm = self.bm
        F = [[bm.verts.new(pos(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        B = [[bm.verts.new(F[i][j].co + off(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        faces = []
        for i in range(nu):
            for j in range(nv):
                faces.append(bm.faces.new((F[i][j], F[i + 1][j], F[i + 1][j + 1], F[i][j + 1])))
                faces.append(bm.faces.new((B[i][j], B[i][j + 1], B[i + 1][j + 1], B[i + 1][j])))
        border = [(i, 0) for i in range(nu)] + [(nu, j) for j in range(nv)] + \
                 [(i, nv) for i in range(nu, 0, -1)] + [(0, j) for j in range(nv, 0, -1)]
        for k in range(len(border)):
            a = border[k]
            b = border[(k + 1) % len(border)]
            faces.append(bm.faces.new((F[a[0]][a[1]], F[b[0]][b[1]], B[b[0]][b[1]], B[a[0]][a[1]])))
        idx = self.mi(key)
        for f in faces:
            f.material_index = idx
            f.smooth = True
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        if hard:
            self.hard.update(faces)
        return faces

    def drip(self, top, length, r, key='jam', seg=7, lean=(0, 0, 0)):
        """Капля варенья, свисающая вниз от точки top."""
        top = Vector(top)
        ln = Vector(lean)
        L = max(length, r * 1.6)
        pts = [top + Vector((0, 0, r * 0.6)), top - Vector((0, 0, L * 0.38)) + ln * 0.4,
               top - Vector((0, 0, L * 0.72)) + ln * 0.75, top - Vector((0, 0, L)) + ln]
        return self.tube(key, pts, [r * 1.45, r * 0.95, r * 0.88, r * 1.08], seg=max(seg, 6), up=(0, 1, 0),
                         cap_steps=(1, 2), cap_k=1.0)

    def splat(self, c, R, th=0.012, seg=14, rings=3, key='jam', wob=0.36, seed=0.0, stretch=(1.0, 1.0)):
        """Лужица варенья, облегающая уже построенную поверхность части (купол толщиной th)."""
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
                rr = R * u * (1.0 + wob * noise.noise(Vector((math.cos(a) * 1.7 + seed, math.sin(a) * 1.7, seed * 0.7)))
                              + 0.45 * wob * noise.noise(Vector((math.cos(a) * 4.3 - seed, math.sin(a) * 4.3, seed * 1.9))))
                p = c0 + t1 * (math.cos(a) * rr * stretch[0]) + t2 * (math.sin(a) * rr * stretch[1])
                h = tree.find_nearest(p)
                q, n = (h[0], h[1].normalized()) if h[0] is not None else (p, n0)
                off = th * max(0.0, 1.0 - u * u) ** 0.5 + 0.0018
                ring.append(self.bm.verts.new(q + n * off))
            rl.append(ring)
        faces = self._loft(rl, key, recalc=False)
        for f in faces:
            f.normal_update()
            if f.normal.dot(n0) < 0:
                f.normal_flip()
        return faces

    def stud(self, c, r, key='iron', seg=6, rings=3, sink=0.35):
        """Заклёпка/бусина, посаженная на ближайшую точку уже построенной поверхности."""
        self.bm.normal_update()
        tree = BVHTree.FromBMesh(self.bm)
        h = tree.find_nearest(Vector(c))
        if h[0] is None:
            return []
        n = h[1].normalized()
        return self.ellipsoid(key, h[0] + n * r * (1 - sink), r, seg=seg, rings=rings)

    def bead(self, c, r, key='jam', seg=6, rings=4):
        return self.ellipsoid(key, c, r, seg=seg, rings=rings)

    # --- окраска пятнами: грани с центром в «пятне» получают материал
    def paint(self, key, spots, only=None, wobble=0.35, freq=9.0, test=None):
        idx = self.mi(key)
        only_idx = None if only is None else {self.mats.index(k) for k in only if k in self.mats}
        cnt = 0
        for f in self.bm.faces:
            if only_idx is not None and f.material_index not in only_idx:
                continue
            p = f.calc_center_median()
            if test and not test(p):
                continue
            w = 1.0 + wobble * noise.noise(p * freq)
            for (c, rad) in spots:
                if (p - Vector(c)).length < rad * w:
                    f.material_index = idx
                    cnt += 1
                    break
        return cnt

    def puff(self, key, d):
        """Приподнять «лужицы» варенья: вершины, у которых все грани этого материала."""
        idx = self.mi(key)
        self.bm.normal_update()
        moves = []
        for v in self.bm.verts:
            if v.link_faces and all(f.material_index == idx for f in v.link_faces):
                if len(v.link_faces) >= 3:
                    moves.append((v, v.normal.copy()))
        for v, n in moves:
            v.co += n * d

    def transform(self, rot=(0, 0, 0), pivot=(0, 0, 0), verts=None, move=(0, 0, 0)):
        M = Euler(rot).to_matrix()
        pv = Vector(pivot)
        mv = Vector(move)
        for v in (verts if verts is not None else self.bm.verts):
            v.co = pv + M @ (v.co - pv) + mv

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)


def profile_z(profile, r):
    """z верхней поверхности профиля lathe (первые точки от полюса к краю) на радиусе r."""
    best = profile[0][1]
    for (r0, z0), (r1, z1) in zip(profile[:-1], profile[1:]):
        if r1 <= r0:
            break
        if r0 <= r <= r1:
            return z0 + (z1 - z0) * (r - r0) / (r1 - r0)
        best = z1
    return best


def solo(track, frame):
    """Для просмотра: включить одну дорожку и встать на кадр."""
    for ob in bpy.data.objects:
        ad = ob.animation_data
        if ad:
            for t in ad.nla_tracks:
                t.mute = (t.name != track)
            ob.update_tag()
    bpy.context.scene.frame_set(frame)


def unsolo_save():
    for ob in bpy.data.objects:
        ad = ob.animation_data
        if ad:
            for t in ad.nla_tracks:
                t.mute = True
        if 'rest' in ob:
            ob.location = Vector(ob['rest'])
            ob.rotation_euler = (0, 0, 0)
            ob.scale = (1, 1, 1)
    bpy.context.scene.frame_set(0)
    bpy.ops.wm.save_mainfile()


def build_parts(mid, specs, coll=None):
    """specs: [(Part, parent_name|None)] в порядке иерархии. Возвращает (root, {name: obj})."""
    coll = coll or get_coll('model_' + mid)
    root = bpy.data.objects.new(mid, None)
    root.empty_display_size = 0.25
    coll.objects.link(root)
    objs = {}
    joints = {}
    for part, parent in specs:
        bm = part.bm
        if MODEL_SCALE != 1.0:
            for v in bm.verts:
                v.co *= MODEL_SCALE
            part.joint = part.joint * MODEL_SCALE
        for v in bm.verts:
            v.co -= part.joint
        bm.normal_update()
        for e in bm.edges:
            lf = e.link_faces
            if len(lf) == 2 and lf[0] in part.hard and lf[1] in part.hard:
                if lf[0].normal.angle(lf[1].normal, 0) > math.radians(38):
                    e.smooth = False
        me = bpy.data.meshes.new(part.name)
        bm.to_mesh(me)
        bm.free()
        for key in part.mats:
            me.materials.append(mat(key))
        ob = bpy.data.objects.new(part.name, me)
        coll.objects.link(ob)
        if parent:
            ob.parent = objs[parent]
            ob.location = part.joint - joints[parent]
        else:
            ob.parent = root
            ob.location = part.joint
        ob['rest'] = list(ob.location)
        objs[part.name] = ob
        joints[part.name] = part.joint
    return root, objs


# ---------------------------------------------------------------- анимация
def sw(f, n, ph=0.0):
    return math.sin(TAU * (f / n + ph))


def cw(f, n, ph=0.0):
    return math.cos(TAU * (f / n + ph))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ramp(f, a, b):
    if b == a:
        return 1.0 if f >= b else 0.0
    return smooth((f - a) / (b - a))


def env(f, a, b, c, d):
    """0 до a, растёт к 1 до b, держит до c, спадает к 0 к d."""
    return ramp(f, a, b) * (1.0 - ramp(f, c, d))


def lerp(a, b, t):
    return a + (b - a) * t


def bake(mid, objs, aname, nframes, fn, step=1):
    """fn(f) -> {part: {'loc':(dx,dy,dz), 'rot':(rx,ry,rz), 'scale': s|(sx,sy,sz)}}"""
    full = '%s_%s' % (mid, aname)
    frames = list(range(0, nframes + 1, step))
    if frames[-1] != nframes:
        frames.append(nframes)
    data = {f: fn(f) for f in frames}
    for pname, ob in objs.items():
        # ключуем все части в каждом действии (неподвижные — постоянной позой покоя),
        # чтобы при смене клипов в игре ничего не «залипало»
        rest = Vector(ob['rest'])
        ad = ob.animation_data or ob.animation_data_create()
        ad.action = None
        for f in frames:
            d = data[f].get(pname, {})
            ob.location = rest + Vector(d.get('loc', (0, 0, 0))) * MODEL_SCALE
            ob.rotation_euler = Euler(d.get('rot', (0, 0, 0)))
            s = d.get('scale', 1.0)
            ob.scale = (s, s, s) if isinstance(s, (int, float)) else s
            ob.keyframe_insert('location', frame=f)
            ob.keyframe_insert('rotation_euler', frame=f)
            ob.keyframe_insert('scale', frame=f)
        act = ad.action
        act.name = '%s.%s' % (full, pname)
        tr = ad.nla_tracks.new()
        tr.name = full
        st = tr.strips.new(full, 0, act)
        st.extrapolation = 'NOTHING'
        tr.mute = True  # дорожки молчат в сцене: поза покоя = свойства объекта; экспорт сам включает по одной
        ad.action = None
        ob.location = rest
        ob.rotation_euler = (0, 0, 0)
        ob.scale = (1, 1, 1)
    return full


def rest_pose(objs):
    sc = bpy.context.scene
    sc.frame_set(0)
    for ob in objs.values():
        ob.location = Vector(ob['rest'])
        ob.rotation_euler = (0, 0, 0)
        ob.scale = (1, 1, 1)
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- проверки
def tri_count(objs):
    return sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs.values())


def world_bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for ob in objs.values():
        mw = ob.matrix_world
        for v in ob.data.vertices:
            p = mw @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def report(mid, objs, actions):
    bpy.context.view_layer.update()
    lo, hi = world_bbox(objs)
    lines = ['%s: tris=%d parts=%d' % (mid, tri_count(objs), len(objs))]
    for n, ob in objs.items():
        lines.append('  %-8s tris=%4d mats=%s parent=%s loc=%s' % (
            n, sum(len(p.vertices) - 2 for p in ob.data.polygons), [m.name for m in ob.data.materials],
            ob.parent.name if ob.parent else None, tuple(round(x, 3) for x in ob.location)))
    lines.append('  bbox lo=%s hi=%s size=%s' % (tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi),
                                                tuple(round(x, 3) for x in (hi - lo))))
    lines.append('  actions: ' + ', '.join(actions))
    return '\n'.join(lines)


# ---------------------------------------------------------------- превью / экспорт / сохранение
def _set_engine(sc):
    for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = e
            return e
        except TypeError:
            continue
    return sc.render.engine


def preview_rig(mid):
    coll = get_coll('preview')
    sc = bpy.context.scene
    # пол — тёплый светлый камень, как в игре
    fm = bpy.data.materials.get('preview_floor')
    if not fm:
        fm = bpy.data.materials.new('preview_floor')
        try:
            fm.use_nodes = True
        except Exception:
            pass
        b = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = hexc('#b48f68')
        b.inputs['Roughness'].default_value = 0.9
    if not bpy.data.objects.get('preview_floor'):
        me = bpy.data.meshes.new('preview_floor')
        s = 40
        me.from_pydata([(-s, -s, -0.002), (s, -s, -0.002), (s, s, -0.002), (-s, s, -0.002)], [], [(0, 1, 2, 3)])
        me.materials.append(fm)
        ob = bpy.data.objects.new('preview_floor', me)
        coll.objects.link(ob)
    if not bpy.data.objects.get('preview_sun'):
        ld = bpy.data.lights.new('preview_sun', 'SUN')
        ld.energy = 3.2
        ld.color = (1.0, 0.80, 0.58)
        ld.angle = math.radians(6)
        ob = bpy.data.objects.new('preview_sun', ld)
        ob.rotation_euler = (math.radians(42), math.radians(-18), math.radians(-35))
        coll.objects.link(ob)
    if not bpy.data.objects.get('preview_torch'):
        ld = bpy.data.lights.new('preview_torch', 'POINT')
        ld.energy = 120
        ld.color = (1.0, 0.62, 0.32)
        ld.shadow_soft_size = 0.3
        ob = bpy.data.objects.new('preview_torch', ld)
        ob.location = (-2.5, -2.0, 2.6)
        coll.objects.link(ob)
    w = bpy.data.worlds.get('preview_world') or bpy.data.worlds.new('preview_world')
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next((n for n in w.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg:
        bg.inputs[0].default_value = hexc('#3a2a20')
        bg.inputs[1].default_value = 0.9
    sc.world = w
    if not bpy.data.objects.get('preview_cam'):
        cd = bpy.data.cameras.new('preview_cam')
        cd.lens = 50
        ob = bpy.data.objects.new('preview_cam', cd)
        coll.objects.link(ob)
    return bpy.data.objects['preview_cam']


def aim_camera(cam, lo, hi, az_deg, el_deg, pad=1.12):
    c = (lo + hi) * 0.5
    rad = (hi - lo).length * 0.5
    fov = 2 * math.atan(18.0 / cam.data.lens)
    dist = rad / math.sin(fov / 2) * pad
    az = math.radians(az_deg)
    el = math.radians(el_deg)
    d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
    cam.location = c + d * dist
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = 0.05
    cam.data.clip_end = 200


def render_to(path, res=(640, 640)):
    sc = bpy.context.scene
    _set_engine(sc)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.film_transparent = False
    try:
        sc.eevee.taa_render_samples = 24
    except Exception:
        pass
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def previews(mid, objs):
    rest_pose(objs)
    cam = preview_rig(mid)
    bpy.context.scene.camera = cam
    lo, hi = world_bbox(objs)
    if lo.z < 0.3:
        lo.z = 0.0
    d = ROOT + '/docs/survivors/models/previews/'
    os.makedirs(d, exist_ok=True)
    aim_camera(cam, lo, hi, 38, 20)
    render_to(d + mid + '-3q.png')
    aim_camera(cam, lo, hi, 12, 55)
    render_to(d + mid + '-top.png')


def save_blend(mid):
    p = ROOT + '/docs/survivors/blender/%s.blend' % mid
    os.makedirs(os.path.dirname(p), exist_ok=True)
    try:
        bpy.context.preferences.filepaths.save_version = 0  # без .blend1
    except Exception:
        pass
    bpy.ops.wm.save_as_mainfile(filepath=p)
    return p


def export_glb(mid, root, objs):
    rest_pose(objs)
    p = ROOT + '/docs/survivors/models/%s.glb' % mid
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    root.select_set(True)
    for o in objs.values():
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    kw = dict(filepath=p, export_format='GLB', use_selection=True, export_cameras=False, export_lights=False,
              export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
              export_texcoords=False, export_normals=True, export_apply=True, export_yup=True,
              export_extras=False, export_frame_range=False, export_skins=False, export_morph=False,
              export_current_frame=False, export_optimize_animation_size=True,
              export_optimize_animation_keep_anim_object=True, export_materials='EXPORT')
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = {k: v for k, v in kw.items() if k in props or k == 'filepath'}
    bpy.ops.export_scene.gltf(**kw)
    return p


def script_args():
    a = sys.argv
    return a[a.index('--') + 1:] if '--' in a else []


def pose_sheet(mid, objs, actions, path, cols=5, size=200):
    """Контактный лист поз: строка на действие, cols кадров от начала до конца."""
    import numpy as np
    sc = bpy.context.scene
    cam = preview_rig(mid)
    sc.camera = cam
    rest_pose(objs)
    lo, hi = world_bbox(objs)
    lo.z = 0.0
    c = (lo + hi) * 0.5
    e = (hi - lo) * 0.5 * 1.2
    aim_camera(cam, c - e, c + e, 38, 28)
    tmp = os.path.join(os.path.dirname(path), '_sheet_tmp.png')
    rows = []
    for act in actions:
        n = 0
        for ob in objs.values():
            ad = ob.animation_data
            if ad:
                for t in ad.nla_tracks:
                    if t.name == act:
                        n = max(n, int(t.strips[0].frame_end))
        row = []
        for kf in range(cols):
            solo(act, round(n * kf / (cols - 1)))
            render_to(tmp, (size, size))
            im = bpy.data.images.load(tmp, check_existing=False)
            px = np.array(im.pixels[:], dtype=np.float32).reshape(size, size, 4)
            bpy.data.images.remove(im)
            row.append(px)
        rows.append(np.concatenate(row, axis=1))
    sheet = np.concatenate(rows[::-1], axis=0)
    out = bpy.data.images.new('pose_sheet', size * cols, size * len(actions), alpha=True)
    out.pixels = sheet.ravel()
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    for ob in objs.values():
        ad = ob.animation_data
        if ad:
            for t in ad.nla_tracks:
                t.mute = True
    rest_pose(objs)


def finish(mid, root, objs, actions, do_previews=True):
    rest_pose(objs)
    sc = bpy.context.scene
    sc.frame_start = 0
    sc.frame_end = 48
    out = report(mid, objs, actions)
    if do_previews:
        previews(mid, objs)
    rest_pose(objs)
    save_blend(mid)
    export_glb(mid, root, objs)
    rest_pose(objs)
    args = script_args()
    if 'sheet' in args:
        pose_sheet(mid, objs, actions, args[args.index('sheet') + 1] + '/%s-sheet.png' % mid)
    return out
