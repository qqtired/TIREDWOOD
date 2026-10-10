# TIREDWOOD, фермерская косметика: общие помощники для Blender.
# Координаты ИГРЫ (как в client/render/outfit3d.ts): Y вверх, лицо в -Z, +X — правая сторона желейки,
# phi = 0 — спина (+Z), phi = pi — лицо. В Blender переводим (x, y, z) -> (x, -z, y): лицо смотрит в +Y.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = '/Users/tired/Desktop/game-opus-farm'
H = 1.58
PI = math.pi
TAU = 2 * math.pi
PROFILE = [(0.001, 0.0), (0.3, 0.0), (0.43, 0.07), (0.505, 0.25), (0.525, 0.55), (0.51, 0.84),
           (0.46, 1.09), (0.37, 1.31), (0.23, 1.49), (0.001, H)]


def _cr(t, p0, p1, p2, p3):
    v0 = (p2 - p0) * 0.5
    v1 = (p3 - p1) * 0.5
    t2 = t * t
    t3 = t * t2
    return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1


def body_profile(n=28):
    """THREE.SplineCurve(PROFILE).getPoints(28) — точно как bodyProfile()."""
    P = PROFILE
    L = len(P)
    out = []
    for i in range(n + 1):
        t = i / n
        p = (L - 1) * t
        ip = int(math.floor(p))
        w = p - ip
        a = P[ip if ip == 0 else ip - 1]
        b = P[ip]
        c = P[L - 1 if ip > L - 2 else ip + 1]
        d = P[L - 1 if ip > L - 3 else ip + 2]
        out.append((_cr(w, a[0], b[0], c[0], d[0]), _cr(w, a[1], b[1], c[1], d[1])))
    return out


PTS = body_profile()


def bodyR(y):
    if y <= 0:
        return 0.3
    for i in range(1, len(PTS)):
        a, b = PTS[i - 1], PTS[i]
        if y <= b[1] and b[1] > a[1]:
            return a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])
    return 0.0


def onBody(phi, y, off=0.0):
    r = bodyR(y) + off
    return Vector((r * math.sin(phi), y, r * math.cos(phi)))


def bodyNormal(phi, y):
    dr = (bodyR(y + 0.004) - bodyR(y - 0.004)) / 0.008
    return Vector((math.sin(phi), -dr, math.cos(phi))).normalized()


def frameAt(phi, y, off=0.0, spin=0.0):
    """Система на теле: +Z наружу, +Y вверх по телу, +X — вправо для того, кто смотрит снаружи."""
    z = bodyNormal(phi, y)
    up = Vector((0, 1, 0))
    yy = (up - z * z.dot(up)).normalized()
    x = yy.cross(z)
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = x[i], yy[i], z[i]
    if spin:
        m = m @ Matrix.Rotation(spin, 4, 'Z')
    m.translation = onBody(phi, y, off)
    return m


def phiOf(x, z):
    return (math.atan2(x, z) + TAU) % TAU


lerp = lambda a, b, t: a + (b - a) * t


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------ матрицы (в координатах игры)

def T(x, y, z):
    return Matrix.Translation((x, y, z))


def RX(a):
    return Matrix.Rotation(a, 4, 'X')


def RY(a):
    return Matrix.Rotation(a, 4, 'Y')


def RZ(a):
    return Matrix.Rotation(a, 4, 'Z')


def S(x, y=None, z=None):
    if y is None:
        y = z = x
    m = Matrix.Identity(4)
    m[0][0], m[1][1], m[2][2] = x, y, z
    return m


# ------------------------------------------------------------ геометрия: (verts, faces), обход против часовой снаружи

class G:
    def __init__(self, v=None, f=None, fc=None):
        self.v = [Vector(p) for p in (v or [])]
        self.f = [list(x) for x in (f or [])]
        self.fc = fc  # цвет на грань (необязательно)

    def tf(self, m):
        self.v = [(m @ p.to_4d()).to_3d() for p in self.v]
        if m.to_3x3().determinant() < 0:
            self.f = [list(reversed(x)) for x in self.f]
        return self

    def move(self, x, y, z):
        return self.tf(T(x, y, z))

    def warp(self, fn):
        self.v = [Vector(fn(p)) for p in self.v]
        return self

    def tris(self):
        return sum(len(x) - 2 for x in self.f)


def grid(fn, nu, nv, closed_u=False, flip=False, fcol=None):
    """Поверхность fn(u, v) -> точка; нормаль = du x dv (flip — наоборот); fcol(i, j) — цвет грани."""
    cu = nu if closed_u else nu + 1
    v = []
    for i in range(cu):
        for j in range(nv + 1):
            v.append(Vector(fn(i / nu, j / nv)))
    f = []
    fc = [] if fcol else None
    at = lambda i, j: (i % cu) * (nv + 1) + j
    for i in range(nu):
        for j in range(nv):
            q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]
            f.append(list(reversed(q)) if flip else q)
            if fcol:
                fc.append(fcol(i, j))
    return weld(G(v, f, fc))


def thick_grid(fn, nu, nv, d, flip=False, top=None, bottom=None, side=None, closed_u=False):
    """Лист толщиной d по поверхности fn(u, v): верх (du x dv) + низ + бортик. top/bottom/side — цвет или fcol(i, j)."""
    cu = nu if closed_u else nu + 1
    S = [[Vector(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    if closed_u:
        S[nu] = S[0]
    def nrm(i, j):
        a = S[min(i + 1, nu)][j] - S[max(i - 1, 0)][j]
        b = S[i][min(j + 1, nv)] - S[i][max(j - 1, 0)]
        n = a.cross(b)
        n = n.normalized() if n.length > 1e-12 else Vector((0, 1, 0))
        return -n if flip else n
    v, f, fc = [], [], []
    at = lambda layer, i, j: layer * cu * (nv + 1) + (i % cu) * (nv + 1) + j
    for layer, sgn in ((0, 1), (1, -1)):
        for i in range(cu):
            for j in range(nv + 1):
                v.append(S[i][j] + nrm(i, j) * (sgn * d / 2))
    pick = lambda c, i, j: c(i, j) if callable(c) else c
    for i in range(nu):
        for j in range(nv):
            q = [at(0, i, j), at(0, i + 1, j), at(0, i + 1, j + 1), at(0, i, j + 1)]
            f.append(list(reversed(q)) if flip else q)
            fc.append(pick(top, i, j))
            q = [at(1, i, j), at(1, i, j + 1), at(1, i + 1, j + 1), at(1, i + 1, j)]
            f.append(list(reversed(q)) if flip else q)
            fc.append(pick(bottom if bottom is not None else top, i, j))
    loop = [(i, 0) for i in range(nu)] + ([] if closed_u else [(nu, j) for j in range(nv)])
    loop2 = [(i, nv) for i in range(nu, 0, -1)] + ([] if closed_u else [(0, j) for j in range(nv, 0, -1)])
    edges = []
    if closed_u:
        edges = [((i, 0), (i + 1, 0)) for i in range(nu)] + [((i, nv), (i - 1, nv)) for i in range(nu, 0, -1)]
    else:
        L = loop + loop2
        edges = [(L[k], L[(k + 1) % len(L)]) for k in range(len(L))]
    sc = side if side is not None else top
    for (a, b) in edges:
        q = [at(0, *a), at(1, *a), at(1, *b), at(0, *b)]
        f.append(list(reversed(q)) if flip else q)
        fc.append(pick(sc, min(a[0], nu - 1), min(a[1], nv - 1)))
    return weld(G(v, f, fc))


def domeCap(t, yFront, yBack, seg=28, rows=10, phi0=0.0, phi1=TAU, fcol=None):
    """Шапочка по профилю тела с толщиной t (как domeCap в outfit3d.ts); phi0..phi1 — кусок по кругу."""
    full = abs(phi1 - phi0 - TAU) < 1e-6
    def fn(u, v):
        phi = phi0 + (phi1 - phi0) * u
        yBase = yBack + (yFront - yBack) * ((1 - math.cos(phi)) / 2)
        y = H + t - v * (H + t - yBase)
        r = 0 if v == 0 else bodyR(y - t) + t * v
        return (r * math.sin(phi), y, r * math.cos(phi))
    return grid(fn, seg, rows, closed_u=full, flip=True, fcol=fcol)


def capEdgeY(yFront, yBack):
    return lambda phi: yBack + (yFront - yBack) * ((1 - math.cos(phi)) / 2)


def lathe(pts, seg=32, flip=False, phi0=0.0, arc=TAU, fcol=None):
    """Тело вращения по (r, y); снаружи — справа от обхода профиля (r вправо, y вверх). r ~ 0 — полюс."""
    full = abs(arc - TAU) < 1e-6
    cols = seg if full else seg + 1
    v = []
    idx = []  # idx[j][i]
    for (r, y) in pts:
        row = []
        if r < 1e-4:
            v.append(Vector((0, y, 0)))
            row = [len(v) - 1] * cols
        else:
            for i in range(cols):
                a = phi0 + arc * i / seg
                v.append(Vector((r * math.sin(a), y, r * math.cos(a))))
                row.append(len(v) - 1)
        idx.append(row)
    f = []
    fc = [] if fcol else None
    for j in range(len(pts) - 1):
        for i in range(seg):
            i2 = (i + 1) % cols if full else i + 1
            q = [idx[j][i], idx[j][i2], idx[j + 1][i2], idx[j + 1][i]]
            qq = []
            for k in q:
                if k not in qq:
                    qq.append(k)
            if len(qq) >= 3:
                f.append(list(reversed(qq)) if flip else qq)
                if fcol:
                    fc.append(fcol(j, i))
    return G(v, f, fc)


def sphere(rx, ry=None, rz=None, seg=12, rings=8):
    ry = rx if ry is None else ry
    rz = rx if rz is None else rz
    pts = [(math.sin(PI * k / rings), -math.cos(PI * k / rings)) for k in range(rings + 1)]
    pts[0] = (0, -1)
    pts[-1] = (0, 1)
    return lathe(pts, seg).tf(S(rx, ry, rz))


def cyl(rt, rb, h, seg=12, top=True, bot=True):
    pts = []
    if bot:
        pts.append((0, -h / 2))
    pts += [(rb, -h / 2), (rt, h / 2)]
    if top:
        pts.append((0, h / 2))
    return lathe(pts, seg)


def ring(R, r, y=0.0, seg=32, sides=6):
    """Лежащий тор (в плоскости XZ) на высоте y."""
    pts = []
    for k in range(sides):
        a = -TAU * k / sides
        pts.append((R + r * math.cos(a), y + r * math.sin(a)))
    pts.append(pts[0])
    g = lathe(pts, seg)
    return weld(g)


def weld(g, eps=1e-6):
    """Склеить совпавшие вершины (замыкание профиля)."""
    key = {}
    remap = []
    nv = []
    for p in g.v:
        k = (round(p.x / eps), round(p.y / eps), round(p.z / eps))
        if k not in key:
            key[k] = len(nv)
            nv.append(p)
        remap.append(key[k])
    nf = []
    nc = [] if g.fc is not None else None
    for k, f in enumerate(g.f):
        q = []
        for i in f:
            if remap[i] not in q:
                q.append(remap[i])
        if len(q) >= 3:
            nf.append(q)
            if nc is not None:
                nc.append(g.fc[k])
    g.v, g.f, g.fc = nv, nf, nc
    return g


def _catmull_pts(points, n, closed=False):
    P = [Vector(p) for p in points]
    L = len(P)
    out = []
    segs = L if closed else L - 1
    for k in range(n + (0 if closed else 1)):
        t = k / n * segs
        i = min(int(t), segs - 1)
        w = t - i
        if closed:
            p0, p1, p2, p3 = P[(i - 1) % L], P[i % L], P[(i + 1) % L], P[(i + 2) % L]
        else:
            p0 = P[max(i - 1, 0)]
            p1 = P[i]
            p2 = P[min(i + 1, L - 1)]
            p3 = P[min(i + 2, L - 1)]
        out.append(Vector([_cr(w, p0[c], p1[c], p2[c], p3[c]) for c in range(3)]))
    return out


def tube(points, r, seg=16, sides=6, closed=False, caps=True, smooth_path=True):
    """Трубка по сплайну через points; r — число или функция r(t)."""
    C = _catmull_pts(points, seg, closed) if smooth_path else [Vector(p) for p in points]
    n = len(C)
    rf = r if callable(r) else (lambda t: r)
    Ts = []
    for i in range(n):
        if closed:
            d = C[(i + 1) % n] - C[(i - 1) % n]
        else:
            d = C[min(i + 1, n - 1)] - C[max(i - 1, 0)]
        Ts.append(d.normalized())
    # параллельный перенос рамки
    t0 = Ts[0]
    a = Vector((0, 1, 0)) if abs(t0.y) < 0.9 else Vector((1, 0, 0))
    N = t0.cross(a).normalized()
    Ns = []
    for i in range(n):
        if i > 0:
            N = (N - Ts[i] * N.dot(Ts[i])).normalized()
        Ns.append(N.copy())
    v = []
    for i in range(n):
        Ti, Ni = Ts[i], Ns[i]
        Bi = Ti.cross(Ni)
        rr = rf(i / max(1, n - 1))
        for k in range(sides):
            ang = TAU * k / sides
            v.append(C[i] + (Ni * math.cos(ang) + Bi * math.sin(ang)) * rr)
    f = []
    rows = n if closed else n - 1
    for i in range(rows):
        i2 = (i + 1) % n
        for k in range(sides):
            k2 = (k + 1) % sides
            f.append([i * sides + k, i * sides + k2, i2 * sides + k2, i2 * sides + k])
    if caps and not closed:
        for (i, sgn) in (((n - 1, 1),) if caps == 'end' else ((0, -1), (n - 1, 1))):
            c = len(v)
            v.append(C[i] + Ts[i] * sgn * rf(i / max(1, n - 1)) * 0.5)
            for k in range(sides):
                k2 = (k + 1) % sides
                tri = [i * sides + k, i * sides + k2, c]
                f.append(tri if sgn > 0 else list(reversed(tri)))
    # B = T x N, (N, B, T) правая тройка: обход k -> k+1 -> следующее кольцо даёт нормаль наружу
    return G(v, f)


def slab(outline, depth, bend=0.0, center=None):
    """Плоская фигура (контур против часовой в XY) толщиной depth; bend — прогиб краёв назад (-Z) ~ r²."""
    if center is None:
        cx = sum(p[0] for p in outline) / len(outline)
        cy = sum(p[1] for p in outline) / len(outline)
    else:
        cx, cy = center
    n = len(outline)
    v = []
    zb = lambda x, y: -bend * ((x - cx) ** 2 + (y - cy) ** 2)
    v.append(Vector((cx, cy, depth / 2 + zb(cx, cy))))
    for (x, y) in outline:
        v.append(Vector((x, y, depth / 2 + zb(x, y))))
    v.append(Vector((cx, cy, -depth / 2 + zb(cx, cy))))
    for (x, y) in outline:
        v.append(Vector((x, y, -depth / 2 + zb(x, y))))
    F0, B0 = 0, n + 1
    f = []
    for k in range(n):
        k2 = (k + 1) % n
        f.append([F0, 1 + k, 1 + k2])
        f.append([B0, B0 + 1 + k2, B0 + 1 + k])
        f.append([1 + k, B0 + 1 + k, B0 + 1 + k2, 1 + k2])
    return G(v, f)


def put(g, phi, y, off, spin=0.0):
    """Поставить вещь (её +Z — наружу) на тело."""
    return g.tf(frameAt(phi, y, off, spin))


def patch(phi, y, w, h, off, d=0.01, tilt=0.0, nx=6, ny=4, shape=None):
    """Изогнутая накладка по телу (как patch() в outfitfish.ts), с бортиком; shape(a,b)->(a,b) — искажение."""
    r = bodyR(y) + off

    def P(a, b, lift):
        if shape:
            a, b = shape(a, b)
        ax = (a - 0.5) * w
        by = (b - 0.5) * h
        lx = ax * math.cos(tilt) - by * math.sin(tilt)
        ly = ax * math.sin(tilt) + by * math.cos(tilt)
        return onBody(phi + lx / r, y + ly, off + lift)

    v, f = [], []
    for i in range(nx + 1):
        for j in range(ny + 1):
            v.append(P(i / nx, j / ny, d))
    at = lambda i, j: i * (ny + 1) + j
    for i in range(nx):
        for j in range(ny):
            f.append([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)])
    rim = [(i / nx, 0) for i in range(nx)] + [(1, j / ny) for j in range(ny)] + \
          [(i / nx, 1) for i in range(nx, 0, -1)] + [(0, j / ny) for j in range(ny, 0, -1)]
    b0 = len(v)
    for (a, b) in rim:
        v.append(P(a, b, -0.003))
        v.append(P(a, b, d))
    m = len(rim)
    for k in range(m):
        a0 = b0 + k * 2
        a1 = b0 + ((k + 1) % m) * 2
        f.append([a0, a1, a1 + 1, a0 + 1])
    return G(v, f)


def band(yfn, off, r, seg=48, sides=6, phi0=0.0, phi1=TAU, closed=True):
    """Лента-трубка по телу: высота yfn(phi), отступ off."""
    pts = []
    n = seg if closed else seg + 1
    for i in range(n):
        phi = phi0 + (phi1 - phi0) * i / seg
        pts.append(onBody(phi, yfn(phi), off))
    return tube(pts, r, seg=seg if closed else seg, sides=sides, closed=closed, smooth_path=False)


def cuff(yfn, t0, h, seg=32, bulge=0.024, fcol=None):
    """Вязаный отворот по краю шапочки: кольцо высотой h, низ по yfn(phi), толще шапки на bulge."""
    prof = [(t0, -0.004), (t0 + bulge * 0.7, 0.004), (t0 + bulge, h * 0.5), (t0 + bulge * 0.75, h - 0.004), (t0, h + 0.004)]
    def fn(u, v):
        k = v * (len(prof) - 1)
        i = min(int(k), len(prof) - 2)
        w = k - i
        off = lerp(prof[i][0], prof[i + 1][0], w)
        dy = lerp(prof[i][1], prof[i + 1][1], w)
        phi = u * TAU
        return onBody(phi, yfn(phi) + dy, off)
    return grid(fn, seg, len(prof) - 1, closed_u=True, fcol=fcol)


def shell(y0, top, off, phi0=0.0, phi1=TAU, nu=40, nv=6, closed=True):
    """Оболочка по телу: от y0 до top(phi), отступ off(t)."""
    def fn(u, t):
        phi = phi0 + (phi1 - phi0) * u
        y = y0 + t * (top(phi) - y0)
        return onBody(phi, y, off(t) if callable(off) else off)
    return grid(fn, nu, nv, closed_u=closed)


# ------------------------------------------------------------ сборка вещи

def lin(hexv):
    def c(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((hexv >> 16) & 255), c((hexv >> 8) & 255), c(hexv & 255), 1.0)


class Part:
    """Набор кусков с цветом и материалом на грань."""
    def __init__(self):
        self.v, self.f, self.c, self.m = [], [], [], []

    def add(self, g, color=None, mat=0):
        base = len(self.v)
        self.v += g.v
        for k, fc in enumerate(g.f):
            self.f.append([i + base for i in fc])
            if color is None:
                self.c.append(g.fc[k])
            elif isinstance(color, (list, tuple)):
                self.c.append(color[k])
            elif callable(color):
                cen = sum((g.v[i] for i in fc), Vector()) / len(fc)
                self.c.append(color(cen.x, cen.y, cen.z))
            else:
                self.c.append(color)
            self.m.append(mat)
        return g

    def tris(self):
        return sum(len(x) - 2 for x in self.f)


MAT_NAMES = ['cos_cloth', 'cos_gloss', 'cos_metal', 'cos_glow']


def get_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    vc.location = (-300, 200)
    nt.links.new(vc.outputs[0], bsdf.inputs['Base Color'])
    rough = {'cos_cloth': 0.62, 'cos_gloss': 0.3, 'cos_metal': 0.3, 'cos_glow': 0.5}[name]
    bsdf.inputs['Roughness'].default_value = rough
    if name == 'cos_metal':
        bsdf.inputs['Metallic'].default_value = 0.9
    if name == 'cos_gloss':
        try:
            bsdf.inputs['Coat Weight'].default_value = 0.3
            bsdf.inputs['Coat Roughness'].default_value = 0.15
        except KeyError:
            pass
    if name == 'cos_glow':
        nt.links.new(vc.outputs[0], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 0.35
    m.use_backface_culling = False
    return m


def build(name, part, anchor, coll, sharp_deg=50):
    """Объект с вершинами относительно точки крепления anchor (игровые xyz); origin в точке крепления.
    Объект *_metal целиком в материале cos_metal (как wear.metal в игре)."""
    ax, ay, az = anchor
    if name.endswith('_metal'):
        part.m = [2] * len(part.f)
    me = bpy.data.meshes.new(name)
    verts = [(p.x - ax, -(p.z - az), p.y - ay) for p in part.v]
    me.from_pydata(verts, [], part.f)
    me.update()
    used = sorted(set(part.m))
    for mi in used:
        me.materials.append(get_mat(MAT_NAMES[mi]))
    remap = {mi: k for k, mi in enumerate(used)}
    me.polygons.foreach_set('material_index', [remap[x] for x in part.m])
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cols = []
    for poly in me.polygons:
        c = lin(part.c[poly.index])
        for _ in poly.loop_indices:
            cols += c
    attr.data.foreach_set('color', cols)
    me.color_attributes.active_color = attr
    try:
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    except Exception:
        pass
    me.validate()
    ob = bpy.data.objects.new(name, me)
    ob.location = (ax, -az, ay)
    coll.objects.link(ob)
    return ob


def item_collection(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type == 'MESH':
            n += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return n


def export_glb(objs, path):
    """Экспорт выбранных: origin в точке крепления (объекты временно в 0)."""
    saved = [(o, o.location.copy()) for o in objs]
    for o in objs:
        if o.parent is None:
            o.location = (0, 0, 0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
              export_apply=True, export_animations=False, export_materials='EXPORT')
    if 'export_vertex_color' in props:
        kw['export_vertex_color'] = 'ACTIVE'
    elif 'export_colors' in props:
        kw['export_colors'] = True
    if 'export_cameras' in props:
        kw['export_cameras'] = False
    if 'export_lights' in props:
        kw['export_lights'] = False
    if 'export_extras' in props:
        kw['export_extras'] = True
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(**kw)
    for o, loc in saved:
        o.location = loc
    return os.path.getsize(path)


# ------------------------------------------------------------ ремни и панели по телу

def _smooth_phi_y(ctrl, n, closed=False):
    pts = [(p[0], p[1], 0.0) for p in ctrl]
    return [(p.x, p.y) for p in _catmull_pts(pts, n, closed)]


def strap(ctrl, off, width, thick, n=24, closed=False, smooth_path=True, caps=True):
    """Плоский ремень по телу: ctrl — точки (phi, y[, off]); прямоугольное сечение width x thick."""
    if smooth_path:
        if len(ctrl[0]) > 2:
            pts3 = [(c[0], c[1], c[2]) for c in ctrl]
            S = [(p.x, p.y, p.z) for p in _catmull_pts(pts3, n, closed)]
        else:
            S = [(a, b, off) for (a, b) in _smooth_phi_y(ctrl, n, closed)]
    else:
        S = [(c[0], c[1], c[2] if len(c) > 2 else off) for c in ctrl]
    m = len(S)
    P = [onBody(a, b, o) for (a, b, o) in S]
    N = [bodyNormal(a, b) for (a, b, o) in S]
    v, f = [], []
    for i in range(m):
        if closed:
            t = (P[(i + 1) % m] - P[(i - 1) % m]).normalized()
        else:
            t = (P[min(i + 1, m - 1)] - P[max(i - 1, 0)]).normalized()
        nn = (N[i] - t * N[i].dot(t)).normalized()
        b = nn.cross(t).normalized()
        c = P[i] + nn * (thick / 2)
        for (sb, sn) in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
            v.append(c + b * (sb * width / 2) + nn * (sn * thick / 2))
    rows = m if closed else m - 1
    for i in range(rows):
        i2 = (i + 1) % m
        for k in range(4):
            k2 = (k + 1) % 4
            f.append([i * 4 + k, i * 4 + k2, i2 * 4 + k2, i2 * 4 + k])
    if caps and not closed:
        f.append([3, 2, 1, 0])
        e = (m - 1) * 4
        f.append([e, e + 1, e + 2, e + 3])
    return G(v, f)


def panel(phi0, phi1, y0, top, off, nu=16, nv=6, fcol=None):
    """Лоскут по телу между phi0..phi1, от y0 до top(phi); off(t) или число."""
    def fn(u, t):
        phi = phi0 + (phi1 - phi0) * u
        y = y0 + t * (top(phi) - y0)
        return onBody(phi, y, off(t) if callable(off) else off)
    return grid(fn, nu, nv, fcol=fcol)


C_G2B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def build_local(name, part, frame, coll, parent=None, sharp_deg=50):
    """Объект в собственной системе frame (матрица в осях игры): вершины part — в локальных осях игры."""
    ob = build(name, part, (0, 0, 0), coll, sharp_deg)
    ob.matrix_world = C_G2B @ frame @ C_G2B.inverted()
    if parent is not None:
        bpy.context.view_layer.update()
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    return ob
