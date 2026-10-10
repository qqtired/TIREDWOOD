# kit_common — общие пропы «Подземелья»: скалы, гряды, сталагмиты, завалы, кромка провала, факелы, мелкий декор.
# Запуск в Blender: exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/kit_common.py').read())
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_a.py').read())

KIT = 'kit_common'
clean_scene()
save_as(ROOT + '/docs/survivors/blender/%s.blend' % KIT)
COLL = get_coll(KIT)
OBJS = []


def put(name, g, sharp=40.0):
    ob = make_obj(name, g, COLL, sharp)
    OBJS.append(ob)
    return ob


# ------------------------------------------------------------ rock_mass: опорная скала, срез на 3 м
def rock_mass(seed, R0, H=3.0, n_but=12, n_skirt=12, seg=40):
    g = Geo()

    def Rth(a):
        return R0 * (1 + 0.15 * nang(a, 1.0, seed) + 0.07 * nang(a, 2.4, seed + 5.0))

    #        r-доля, z
    prof = [(1.17, -0.25), (1.09, 0.16), (0.92, 0.45), (0.9, 1.1), (0.88, 1.75), (0.86, 2.4), (0.84, 2.86),
            (0.81, H), (0.74, H), (0.5, H), (0.0, H)]
    keys = ['stone_floor', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall',
            'stone_wall', 'stone_dark', 'stone_dark']

    def rf(p, a, i):
        if p.length < 1e-6:
            return p
        fr = prof[i][0]
        r = Rth(a) * fr
        if 1 <= i <= 7:
            r += 0.05 * R0 * nang(a, 2.6, seed + i * 1.7) + 0.07 * R0 * nang(a, 7.0, seed + 11.0)
        z = p.z
        if 2 <= i <= 5:
            z += 0.2 * nang(a, 1.9, seed + i * 3.1)
        return Vector((math.cos(a) * r, math.sin(a) * r, z))
    core = lathe(prof, seg, keys, rfn=rf, smooth=True)
    core.f = [(i_, k_, k_ != 'stone_wall') for i_, k_, s_ in core.f]   # стены гранёные, крышка гладкая
    g.add(core)
    R = rng(seed * 101 + 7)
    # контрфорсы — крупные глыбы по стенам
    for k in range(n_but):
        a = TAU * (k + R.uniform(-0.25, 0.25)) / n_but
        rr = Rth(a) * R.uniform(0.86, 0.95)
        h = R.uniform(2.3, 2.95) if k % 4 else R.uniform(1.4, 2.0)
        s = (R.uniform(3.2, 4.6), R.uniform(2.6, 3.4), h)
        b = rock(s, seed * 31 + k, 'stone_wall', n=14, bevel=0.11, sink=0.1, smooth=True)
        b.xf(T((math.cos(a) * rr, math.sin(a) * rr, 0), (0, 0, a + math.pi / 2 + R.uniform(-0.3, 0.3))))
        dark_top(b, 2.45)
        g.add(b)
    # светлая кромка — камни у подножия
    for k in range(n_skirt):
        a = TAU * (k + R.uniform(-0.4, 0.4)) / n_skirt
        rr = Rth(a) * R.uniform(1.08, 1.2)
        s = R.uniform(0.45, 1.05)
        b = rock((s * 1.3, s, s * 0.7), seed * 57 + k, 'stone_floor', n=9, bevel=0.14, sink=0.25, smooth=True)
        b.xf(T((math.cos(a) * rr, math.sin(a) * rr, 0), (0, 0, R.uniform(0, TAU))))
        g.add(b)
    return g


# ------------------------------------------------------------ rock_ridge: гряда 6/10/14 м
def rock_ridge(L, seed, W=2.0, H=2.0):
    g = Geo()
    R = rng(seed)
    bend = R.uniform(-0.45, 0.45)

    def spine(t):  # t в -1..1
        return Vector((t * (L / 2 - 0.9), bend * math.sin(t * math.pi * 0.9) + 0.15 * nz(t * 2, seed), 0))
    core = rock((L - 0.6, W * 0.8, H * 0.7), seed + 1, 'stone_wall', n=26, bevel=0.06, sink=0.1, jitter=0.12,
                smooth=True)
    core.map(lambda p: p + Vector((0, bend * math.sin(p.x / (L / 2) * math.pi * 0.9), 0)))
    g.add(core)
    nb = max(4, int(round(L / 1.45)))
    for k in range(nb):
        t = -1 + 2 * (k + 0.5) / nb
        c = spine(t + R.uniform(-0.05, 0.05))
        hh = H * (0.78 + 0.22 * math.cos(t * 1.3)) * R.uniform(0.85, 1.05)
        s = (R.uniform(1.7, 2.5), W * R.uniform(0.85, 1.05), hh)
        b = rock(s, seed * 13 + k, 'stone_wall', n=18, bevel=0.11, sink=0.1, smooth=True)
        b.xf(T((c.x, c.y + R.uniform(-0.25, 0.25), 0), (0, 0, R.uniform(-0.5, 0.5))))
        g.add(b)
    dark_top(g, H * 0.55, nz_min=0.7)
    ns = int(L / 1.1)
    for k in range(ns):
        side = 1 if k % 2 else -1
        t = -1 + 2 * (k + R.uniform(0.1, 0.9)) / ns
        c = spine(t)
        s = R.uniform(0.3, 0.7)
        b = rock((s * 1.2, s, s * 0.7), seed * 77 + k, 'stone_floor', n=9, bevel=0.14, sink=0.25, smooth=True)
        b.xf(T((c.x, c.y + side * W * R.uniform(0.55, 0.75), 0), (0, 0, R.uniform(0, TAU))))
        g.add(b)
    for end in (-1, 1):
        c = spine(end * 1.08)
        s = R.uniform(0.45, 0.7)
        b = rock((s, s * 1.1, s * 0.7), seed * 91 + end, 'stone_floor', n=9, bevel=0.14, sink=0.25, smooth=True)
        b.xf(T((c.x + end * 0.4, c.y, 0)))
        g.add(b)
    return g


# ------------------------------------------------------------ stalagmite
STAL = [(1.3, -0.08), (1.12, 0.03), (0.9, 0.12), (0.7, 0.27), (0.52, 0.44), (0.37, 0.6), (0.23, 0.76),
        (0.11, 0.9), (0.0, 1.0)]


def stal_geo(H, Rb, seed, seg=10, lean=0.12, cut=None):
    prof = [(r * Rb, z * H) for r, z in STAL]
    keys = ['stone_floor'] + ['stone_wall'] * 5 + ['stone_floor', 'stone_floor']
    if cut is not None:
        prof = [p for p in prof if p[1] < cut * H - 0.05]
        rcut = prof[-1][0] * 0.82
        prof += [(rcut, cut * H), (rcut * 0.6, cut * H - 0.03), (0, cut * H - 0.06)]
        keys = (['stone_floor'] + ['stone_wall'] * 10)[:len(prof) - 3] + ['stone_wall', 'stone_dark', 'stone_dark']
    la = rng(seed).uniform(0, TAU)

    def rf(p, a, i):
        t = max(p.z, 0) / H
        k = 1 + 0.17 * nang(a, 1.4, seed, t * 2.5)
        off = lean * H * t * t
        z = p.z
        if cut is not None and i >= len(prof) - 3 and p.length > 1e-6:
            z += 0.08 * nang(a, 2.0, seed + 9)
        return Vector((p.x * k + math.cos(la) * off, p.y * k + math.sin(la) * off, z))
    return lathe(prof, seg, keys[:len(prof) - 1], rfn=rf, smooth=True)


def stalagmite(H, Rb, seed, kids=(), cut=None, stones=3):
    g = stal_geo(H, Rb, seed, cut=cut)
    R = rng(seed + 3)
    for j, (h2, r2, ang, d) in enumerate(kids):
        k = stal_geo(h2, r2, seed + 10 + j, seg=8, lean=0.2)
        k.xf(T((math.cos(ang) * d, math.sin(ang) * d, 0)))
        g.add(k)
    for j in range(stones):
        a = R.uniform(0, TAU)
        d = Rb * R.uniform(1.25, 1.6)
        s = R.uniform(0.18, 0.35)
        b = rock((s * 1.3, s, s * 0.7), seed * 5 + j, 'stone_floor', n=8, bevel=0.15, sink=0.25, smooth=True)
        b.xf(T((math.cos(a) * d, math.sin(a) * d, 0), (0, 0, R.uniform(0, TAU))))
        g.add(b)
    if cut is not None:   # обломок верхушки рядом
        a = R.uniform(0, TAU)
        tip = stal_geo(H * (1 - cut) + 0.2, Rb * 0.42, seed + 40, seg=8, lean=0.0)
        tip.xf(T((math.cos(a) * Rb * 1.9, math.sin(a) * Rb * 1.9, 0.18), (math.pi / 2 - 0.15, 0, a)))
        g.add(tip)
    return g


# ------------------------------------------------------------ rubble: завал
def rubble(seed, Rr=1.6, h=0.95, n=15, planks=0):
    g = Geo()
    R = rng(seed)
    keys = ['stone_wall', 'stone_wall', 'stone_floor', 'stone_dark']
    # основа завала — пологий холм, камни лежат на его поверхности (высота — лучом по холму)
    from mathutils.bvhtree import BVHTree
    hm0 = h * 0.62
    mound = rock((1.55 * Rr, 1.3 * Rr, hm0 * 1.12), seed, 'stone_wall', n=16, bevel=0.1, sink=0.12, jitter=0.15,
                 smooth=True)
    bvh = BVHTree.FromPolygons([tuple(p) for p in mound.v], [f[0] for f in mound.f])

    def surf(x, y):
        hit = bvh.ray_cast(Vector((x, y, 10.0)), Vector((0, 0, -1)))
        return hit[0].z if hit[0] is not None else 0.0
    g.add(dark_top(mound, hm0 * 0.8, 0.85))
    for k in range(n):
        u = math.sqrt(R.uniform(0.02, 1))
        a = R.uniform(0, TAU)
        r = u * Rr * 0.95
        x, y = math.cos(a) * r, math.sin(a) * r * 0.9
        s = R.uniform(0.4, 0.85) * (1.2 - 0.5 * u)
        b = rock((s * R.uniform(1.0, 1.5), s, s * R.uniform(0.6, 0.85)), seed * 17 + k, keys[k % 4], n=10,
                 bevel=0.13, sink=0.25, smooth=True)
        b.xf(T((x, y, max(0.0, surf(x, y) - s * 0.12)),
               (R.uniform(-0.3, 0.3), R.uniform(-0.3, 0.3), R.uniform(0, TAU))))
        g.add(b)
    for k in range(planks):
        a = TAU * k / max(planks, 1) + R.uniform(-0.4, 0.4)
        L = R.uniform(1.5, 2.0)
        p = box(L, 0.22, 0.06, 'wood_dark', bevel=0.015)
        d_in = 0.15
        d_out = d_in + L * 0.95
        z_in = surf(math.cos(a) * d_in, math.sin(a) * d_in) + 0.05
        tilt = math.atan2(z_in, d_out - d_in)
        dm = (d_in + d_out) / 2
        # внутренний конец на холме, внешний на земле
        p.xf(T((math.cos(a) * dm, math.sin(a) * dm, z_in / 2 + 0.03), (0, tilt, a)))
        g.add(p)
    return g


# ------------------------------------------------------------ pit_rim: кромка провала, номинально r=3 м
def pit_rim(seed=4, R0=3.0, seg=28):
    prof = [(4.35, -0.03), (3.95, 0.05), (3.6, 0.15), (3.3, 0.2), (3.08, 0.12), (2.97, -0.1), (2.9, -0.6),
            (2.8, -1.4), (2.7, -2.4)]
    prof = [(r * R0 / 3.0, z) for r, z in prof]
    keys = ['stone_floor', 'stone_floor', 'stone_floor', 'stone_wall', 'stone_wall', 'stone_dark', 'stone_dark',
            'stone_dark']

    def rf(p, a, i):
        k = 1 + 0.05 * nang(a, 1.5, seed) + 0.025 * nang(a, 4.0, seed + 2)
        z = p.z + (0.05 * nang(a, 3.0, seed + 5) if 1 <= i <= 4 else 0)
        return Vector((p.x * k, p.y * k, z))
    # обход «тело слева»: сверху снаружи внутрь, затем вниз по стенке — тело снаружи
    g = lathe(prof, seg, keys, rfn=rf, smooth=True)
    R = rng(seed)
    for k in range(8):
        a = TAU * (k + R.uniform(-0.3, 0.3)) / 8
        rr = R0 * 1.12 * (1 + 0.05 * nang(a, 1.5, seed))
        s = R.uniform(0.4, 0.9)
        b = rock((s * 1.4, s, s * 0.6), seed * 23 + k, 'stone_wall' if k % 3 else 'stone_floor', n=8,
                 bevel=0.14, sink=0.3, smooth=True)
        b.xf(T((math.cos(a) * rr, math.sin(a) * rr, 0.12), (0, 0, a + math.pi / 2)))
        dark_top(b, 0.35, 0.8)
        g.add(b)
    return g


# ------------------------------------------------------------ torch_stand: на треноге и настенный
def torch_floor():
    g = Geo()
    for k in range(3):
        a = TAU * k / 3 + 0.3
        g.add(tube([(math.cos(a) * 0.36, math.sin(a) * 0.36, 0.0), (math.cos(a) * 0.12, math.sin(a) * 0.12, 0.55),
                    (0, 0, 0.95)], [0.03, 0.03, 0.03], 4, 'iron', caps=('flat', None), smooth=False))
        g.add(box(0.12, 0.12, 0.04, 'iron', z0=0.0).xf(T((math.cos(a) * 0.36, math.sin(a) * 0.36, 0), (0, 0, a))))
    g.add(cyl(0.035, 0.6, 6, 'iron', top=False, z0=0.9))
    bowl = [(0, 1.44), (0.1, 1.46), (0.2, 1.6), (0.215, 1.64), (0.18, 1.645), (0.0, 1.58)]
    g.add(lathe(bowl, 8, ['iron', 'iron', 'brass', 'brass', 'wood_dark'], smooth=False))
    g.add(flame(0.55, 0.15, 6).xf(T((0, 0, 1.58))))
    g.add(flame(0.32, 0.09, 5).xf(T((0.08, -0.05, 1.6), (0.25, 0.2, 0))))
    return g


def torch_wall(h=1.85):
    g = Geo()
    g.add(box(0.2, 0.04, 0.34, 'iron', bevel=0.01).xf(T((0, -0.02, h))))
    g.add(box(0.05, 0.22, 0.05, 'iron').xf(T((0, -0.13, h - 0.08))))
    g.add(lathe([(0.075, -0.03), (0.075, 0.03), (0.055, 0.03), (0.055, -0.03)], 6, 'iron', smooth=False)
          .xf(T((0, -0.25, h - 0.08))))
    tilt = 0.32
    stick = cyl(0.035, 0.55, 6, 'wood_dark', top=False, bottom=True, z0=-0.22, r2=0.04)
    head = cyl(0.06, 0.16, 6, 'wood', top=True, z0=0.33, r2=0.065)
    t = stick.add(head)
    t.xf(T((0, -0.25, h - 0.08), (tilt, 0, 0)))
    g.add(t)
    top = T((0, -0.25, h - 0.08), (tilt, 0, 0)) @ Vector((0, 0, 0.49))
    g.add(flame(0.42, 0.12, 6).xf(T(top, (0.05, 0, 0))))
    return g


# ------------------------------------------------------------ floor_decal_kit: мелочи ниже 0,4 м
def d_pebbles(seed, keys=('stone_floor', 'stone_wall'), n=5, big=0.28, pn=7):
    g = Geo()
    R = rng(seed)
    for k in range(n):
        a = R.uniform(0, TAU)
        d = R.uniform(0, 0.7)
        s = R.uniform(0.08, big)
        b = rock((s * 1.3, s, s * 0.6), seed * 11 + k, keys[k % len(keys)], n=pn, bevel=0.15, sink=0.2,
                 smooth=True)
        b.xf(T((math.cos(a) * d, math.sin(a) * d, 0), (0, 0, R.uniform(0, TAU))))
        g.add(b)
    return g


def d_slabs(seed=3):
    g = Geo()
    R = rng(seed)
    for k, (x, y, w, d) in enumerate([(0, 0, 0.9, 0.7), (0.85, 0.15, 0.6, 0.55), (0.25, 0.72, 0.7, 0.5)]):
        pts = []
        for j in range(5):
            a = TAU * j / 5 + R.uniform(-0.25, 0.25)
            pts.append(Vector((math.cos(a) * w / 2, math.sin(a) * d / 2, 0)))
        pts += [p + Vector((0, 0, 0.06)) for p in pts]
        pts = [p + Vector((0, 0, -0.025)) for p in pts]
        sl = hull(pts, 'stone_floor', 0.02, 1, True)
        sl.recolor(lambda c, n, k_: 'stone_wall' if n.z < 0.5 else k_)
        sl.xf(T((x, y, 0), (R.uniform(-0.04, 0.04), R.uniform(-0.04, 0.04), R.uniform(0, 1))))
        g.add(sl)
    return g


def d_crack(seed=5):
    """Тёмная трещина-полоса на 2 см над полом, ветвится."""
    g = Geo()
    R = rng(seed)

    def strip(p0, ang, n, w):
        pts = [Vector(p0)]
        for _ in range(n):
            ang += R.uniform(-0.6, 0.6)
            pts.append(pts[-1] + Vector((math.cos(ang), math.sin(ang), 0)) * R.uniform(0.18, 0.3))
        prev = None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            s = Vector((-t.y, t.x, 0)) * w * (1 - i / (len(pts) + 0.5))
            a = g.vert(p + s + Vector((0, 0, 0.02)))
            b = g.vert(p - s + Vector((0, 0, 0.02)))
            if prev:
                g.face((prev[1], b, a, prev[0]), 'stone_dark', False)
            prev = (a, b)
        return pts
    main = strip((-0.9, 0, 0), 0.1, 8, 0.05)
    strip(main[3], 1.2, 4, 0.03)
    strip(main[5], -1.1, 3, 0.025)
    # нормали вверх
    g.f = [(i if g.center_normal(i)[1].z > 0 else i[::-1], k, s) for i, k, s in g.f]
    return g


def d_bottle(seed=6):
    g = Geo()
    prof = [(0, 0), (0.055, 0.0), (0.06, 0.02), (0.06, 0.2), (0.045, 0.24), (0.02, 0.27), (0.02, 0.33),
            (0.0, 0.335)]
    b = lathe(prof, 8, ['iron'] * 5 + ['wood', 'wood'], smooth=True)
    b.xf(T((0, 0, 0.058), (math.pi / 2, 0, 0.6)))
    g.add(b)
    # ещё одна, отбитое горлышко рядом
    b2 = lathe(prof[:5] + [(0.03, 0.25), (0.0, 0.25)], 8, ['iron'] * 6, smooth=True)
    b2.xf(T((0.25, 0.22, 0.0), (0, 0, 0)))
    g.add(b2)
    return g


def d_shards(seed=7):
    g = Geo()
    R = rng(seed)
    for k in range(6):
        a0 = R.uniform(0, TAU)
        w = R.uniform(0.5, 1.0)
        pts = []
        for i in range(3):
            ang = a0 + i * 0.3 * w
            for rr, z in [(0.16, 0.0), (0.19, 0.07)]:
                pts.append(Vector((math.cos(ang) * rr, math.sin(ang) * rr, z)))
                pts.append(Vector((math.cos(ang) * (rr - 0.025), math.sin(ang) * (rr - 0.025), z)))
        h = hull(pts, 'stone_floor' if k % 2 else 'wood', 0.0, 1, False)
        lo, hi = h.bounds()
        c = (lo + hi) / 2
        h.xf(T((0, 0, 0)) @ T(-c))
        h.xf(T((R.uniform(-0.45, 0.45), R.uniform(-0.45, 0.45), 0.02), (R.uniform(0.9, 1.4), 0, R.uniform(0, TAU))))
        g.add(h)
    return g


def mushroomlet(h, cap_r, seed, glow=False, lean=0.2):
    g = Geo()
    st = cyl(cap_r * 0.28, h, 6, 'mush_stem', top=False, r2=cap_r * 0.22)
    g.add(st)
    cap = [(cap_r * 0.25, h * 0.92), (cap_r, h * 0.86), (cap_r * 1.02, h * 0.92), (cap_r * 0.75, h * 1.08),
           (0, h * 1.14)]
    g.add(lathe(cap, 7, ['glow_fire' if glow else 'mush_stem', 'mush_cap', 'mush_cap', 'mush_cap'], smooth=True))
    R = rng(seed)
    g.xf(T((0, 0, 0), (R.uniform(-lean, lean), R.uniform(-lean, lean), R.uniform(0, TAU))))
    return g


def d_shroomlets(seed=8):
    g = Geo()
    R = rng(seed)
    for k, (h, r) in enumerate([(0.32, 0.12), (0.22, 0.09), (0.16, 0.07), (0.25, 0.1)]):
        a = R.uniform(0, TAU)
        d = R.uniform(0.05, 0.3) if k else 0
        g.add(mushroomlet(h, r, seed + k, glow=(k % 2 == 0)).xf(T((math.cos(a) * d, math.sin(a) * d, 0))))
    g.add(blob(0.35, 0.05, 'moss', seed=seed, sink=0.02))
    return g


def d_crystal_shards(seed=9):
    g = Geo()
    R = rng(seed)
    for k, (h, r) in enumerate([(0.34, 0.06), (0.24, 0.05), (0.18, 0.04), (0.14, 0.035)]):
        a = R.uniform(0, TAU)
        d = R.uniform(0.0, 0.18) if k else 0.0
        g.add(crystal(h, r, seg=5, lean=(R.uniform(-0.5, 0.5), R.uniform(-0.5, 0.5), 0))
              .xf(T((math.cos(a) * d, math.sin(a) * d, 0))))
    g.add(d_pebbles(seed + 1, ('stone_wall', 'stone_dark'), n=3, big=0.2))
    return g


def d_sleeper(seed=10):
    g = Geo()
    g.add(box(1.9, 0.26, 0.14, 'wood_dark', bevel=0.03, z0=-0.02).xf(T((0, 0, 0), (0, 0, 0.05))))
    for x in (-0.55, 0.55):
        g.add(box(0.06, 0.06, 0.05, 'iron', bevel=0.01).xf(T((x, 0.02, 0.135), (0, 0, 0.05))))
    g.add(box(0.7, 0.2, 0.09, 'wood', bevel=0.02, z0=-0.02).xf(T((0.3, 0.42, 0), (0.02, 0, -0.35))))
    return g


def d_jam_drops(seed=11):
    g = Geo()
    R = rng(seed)
    for k, (r, x, y) in enumerate([(0.32, 0, 0), (0.16, 0.42, 0.12), (0.1, 0.6, -0.12), (0.07, -0.4, 0.25),
                                   (0.12, 0.25, -0.35)]):
        g.add(blob(r, 0.035 + r * 0.05, 'jam', seg=10, rings=2, seed=seed + k * 1.3, wob=0.3, z0=0.015)
              .xf(T((x, y, 0))))
    return g


def d_moss(seed=12):
    g = Geo()
    R = rng(seed)
    for k, (r, x, y) in enumerate([(0.42, 0, 0), (0.3, 0.45, 0.2), (0.22, -0.4, 0.3), (0.18, 0.15, -0.42)]):
        g.add(blob(r, 0.09, 'moss', seg=9, rings=2, seed=seed + k, wob=0.3, z0=0.0, sink=0.03).xf(T((x, y, 0))))
    g.add(d_pebbles(seed, ('stone_wall',), n=2, big=0.18))
    return g


def d_chain(seed=13):
    g = Geo()
    R = rng(seed)
    p = Vector((-0.6, 0, 0.03))
    ang = 0.0
    for k in range(7):
        ang += R.uniform(-0.35, 0.35)
        link = lathe([(0.045, -0.012), (0.045, 0.012), (0.03, 0.012), (0.03, -0.012)], 6, 'iron', smooth=False)
        link.xf(T((0, 0, 0), (0, 0, 0), (1.6, 1.0, 1.0)))
        link.xf(T(p, (0, 0, ang)) @ T((0, 0, 0), (math.pi / 2 if k % 2 else 0.0, 0, 0)))
        g.add(link)
        p = p + Vector((math.cos(ang), math.sin(ang), 0)) * 0.11
    return g


# ------------------------------------------------------------ сборка
for nm, seed, R0 in (('rock_mass_a', 3, 5.0), ('rock_mass_b', 8, 6.0), ('rock_mass_c', 14, 7.0)):
    put(nm, rock_mass(seed, R0, n_but=int(2 * R0 + 1), n_skirt=int(6 + 1.4 * R0), seg=36))
for L, seed in ((6, 21), (10, 22), (14, 23)):
    put('rock_ridge_%d' % L, rock_ridge(L, seed))
put('stalagmite_a', stalagmite(1.5, 0.42, 31, kids=[(0.6, 0.2, 0.8, 0.55)]))
put('stalagmite_b', stalagmite(2.2, 0.55, 32, kids=[(0.8, 0.24, 2.5, 0.7), (0.45, 0.15, 4.2, 0.6)]))
put('stalagmite_c', stalagmite(2.5, 0.5, 33, kids=[(1.7, 0.4, 1.0, 0.62)]))
put('stalagmite_d', stalagmite(2.0, 0.6, 34, cut=0.62, kids=[(0.7, 0.22, 3.6, 0.75)]))
put('rubble_a', rubble(41, 1.5, 0.95, 9))
put('rubble_b', rubble(42, 1.8, 1.0, 8, planks=3))
put('pit_rim', pit_rim())
put('torch_stand_floor', torch_floor())
put('torch_stand_wall', torch_wall())
DEC = [('pebbles', d_pebbles(51)), ('gravel', d_pebbles(52, ('stone_wall', 'stone_dark', 'stone_floor'), 6, 0.16, 6)),
       ('slabs', d_slabs()), ('crack', d_crack()), ('bottle', d_bottle()), ('shards', d_shards()),
       ('shroomlets', d_shroomlets()), ('crystal_shards', d_crystal_shards()), ('sleeper', d_sleeper()),
       ('jam_drops', d_jam_drops()), ('moss', d_moss()), ('chain', d_chain())]
for nm, g in DEC:
    put('floor_decal_kit_' + nm, g)

layout(OBJS, row_w=46.0, gap=1.6)
print(kit_report(KIT, OBJS))

if globals().get("FINISH", True):
    print(finish_kit(KIT, OBJS))
