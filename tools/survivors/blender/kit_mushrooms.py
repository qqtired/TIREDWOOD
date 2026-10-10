# kit_mushrooms — Грибная пещера: грибы-великаны, кучки, дождевики, корни, гриб Ведьмина круга, Гриб-Патриарх.
# Запуск в Blender: exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/kit_mushrooms.py').read())
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_a.py').read())

KIT = 'kit_mushrooms'
clean_scene()
save_as(ROOT + '/docs/survivors/blender/%s.blend' % KIT)
COLL = get_coll(KIT)
OBJS = []


def put(name, g, sharp=50.0, parent=None):
    ob = make_obj(name, g, COLL, sharp, parent=parent)
    if parent is None:
        OBJS.append(ob)
    return ob


CAPTOP = [(0.0, 1.0), (0.3, 0.99), (0.58, 0.9), (0.8, 0.7), (0.95, 0.42), (1.0, 0.14)]


def capz(u):
    """Высота верха шляпки (доля th) на относительном радиусе u."""
    for (u0, z0), (u1, z1) in zip(CAPTOP[:-1], CAPTOP[1:]):
        if u <= u1:
            return z0 + (z1 - z0) * (u - u0) / (u1 - u0)
    return CAPTOP[-1][1]


def shroomlet(h, cap_r, seed, glow=False, lean=0.2, seg=7):
    g = Geo()
    g.add(cyl(cap_r * 0.28, h * 0.95, seg - 1, 'mush_stem', top=False, r2=cap_r * 0.22))
    cap = [(cap_r * 0.25, h * 0.9), (cap_r, h * 0.84), (cap_r * 1.02, h * 0.91), (cap_r * 0.75, h * 1.07),
           (0, h * 1.13)]
    g.add(lathe(cap, seg, ['glow_fire' if glow else 'mush_stem', 'mush_cap', 'mush_cap', 'mush_cap'], smooth=True))
    R = rng(seed)
    g.xf(T((0, 0, 0), (R.uniform(-lean, lean), R.uniform(-lean, lean), R.uniform(0, TAU))))
    return g


def cap_geo(R, zb, th, seg, seed, droop=0.0, wave=0.05, gills=True, top_key='mush_cap', under='glow_fire',
            stem_r=0.3, bump=0.04, center_key='stone_floor', lobes=0, lobe_k=0.035):
    """Шляпка: снизу пластинки (светятся), край, верх к оси. zb — уровень края снизу."""
    prof = [(stem_r * 1.05, zb + th * 0.28), (R * 0.45, zb + th * 0.16), (R * 0.78, zb + th * 0.06),
            (R * 0.96, zb - droop), (R * 1.0, zb + th * 0.14 - droop * 0.6), (R * 0.95, zb + th * 0.42 - droop * 0.2),
            (R * 0.8, zb + th * 0.7), (R * 0.58, zb + th * 0.9), (R * 0.3, zb + th * 0.99), (0, zb + th)]
    keys = [under, under, under, 'glow_fire', top_key, top_key, top_key, top_key, center_key]

    def rf(p, a, i):
        if p.length < 1e-6:
            return p
        k = 1 + wave * nang(a, 2.2, seed) + (lobe_k * abs(math.sin(a * lobes / 2)) if lobes and i >= 2 else 0.0)
        z = p.z
        if lobes and 4 <= i <= 7:
            z += 0.012 * R * math.cos(a * lobes)
        if i in (3, 4):
            z += droop * 0.5 * nang(a, 2.6, seed + 3)
        if gills and i in (1, 2):
            z += 0.02 * R * math.sin(a * 40)
        if 5 <= i <= 8:
            z += bump * R * nang(a, 2.0, seed + 7, i * 0.6)
        return Vector((p.x * k, p.y * k, z))
    return lathe(prof, seg, keys, rfn=rf, smooth=True)


def stem_geo(H, rb, rt, seed, lean=(0.0, 0.0), seg=12, n=8, flare=1.7):
    pts = []
    radii = []
    for i in range(n):
        t = i / (n - 1)
        x = lean[0] * t * t * H
        y = lean[1] * t * t * H
        pts.append((x, y, -0.15 + t * (H + 0.15)))
        r = rt + (rb - rt) * (1 - t) ** 1.6
        if t < 0.18:
            r *= 1 + (flare - 1) * (1 - t / 0.18) ** 2
        r *= 1 + 0.06 * math.sin(t * 9 + seed)
        radii.append(r)

    def rf(p, a, i):
        k = 1 + 0.08 * nang(a, 1.4, seed, i * 0.3)
        c = Vector(pts[i])
        return c + (p - c) * k
    return tube(pts, radii, seg, 'mush_stem', caps=(None, 'flat'), rfn=rf), Vector(pts[-1])


def moss_ring(r, n, seed, h=0.1):
    g = Geo()
    R = rng(seed)
    for k in range(n):
        a = TAU * k / n + R.uniform(-0.4, 0.4)
        rr = r * R.uniform(0.9, 1.2)
        g.add(blob(R.uniform(0.25, 0.45) * r ** 0.5, h, 'moss', seg=8, rings=2, seed=seed + k, wob=0.35, sink=0.03)
              .xf(T((math.cos(a) * rr, math.sin(a) * rr, 0))))
    return g


# ------------------------------------------------------------ mushroom_big
def mushroom_big(seed, H=2.8, R=1.6, sr=0.32, lean=(0.0, 0.0), droop=0.06, kids=(), shelves=0, seg=28):
    g = Geo()
    st, top = stem_geo(H - 0.35, sr * 1.25, sr, seed, lean, seg=14, n=8)
    g.add(st)
    th = 0.5 + 0.12 * R
    cap = cap_geo(R, 0.0, th, seg, seed, droop=droop, stem_r=sr, lobes=(7 if seed % 2 else 0))
    cap.xf(T((top.x, top.y, H - th)))
    g.add(cap)
    # юбка-кольцо на ножке
    zr = (H - 0.35) * 0.72
    ring = lathe([(sr * 0.95, 0.0), (sr * 1.45, -0.16), (sr * 1.55, -0.1), (sr * 1.02, 0.06)], 14, 'mush_stem')
    ring.xf(T((lean[0] * 0.52 * (H - 0.35), lean[1] * 0.52 * (H - 0.35), zr)))
    g.add(ring)
    # пятна на шляпке
    Rr = rng(seed)
    for k in range(6):
        a = Rr.uniform(0, TAU)
        d = R * Rr.uniform(0.15, 0.7)
        zz = H - th + th * capz(d / R)
        s = blob(R * Rr.uniform(0.07, 0.12), 0.04, 'stone_floor', seg=7, rings=1, seed=seed + k, wob=0.3, z0=-0.005)
        nrm = Vector((math.cos(a) * d / R, math.sin(a) * d / R, 1.6)).normalized()
        q = Vector((0, 0, 1)).rotation_difference(nrm).to_euler()
        s.xf(T((top.x + math.cos(a) * d, top.y + math.sin(a) * d, zz), q))
        g.add(s)
    for k in range(shelves):   # трутовики на ножке
        a = Rr.uniform(0, TAU)
        z = (H - 0.35) * Rr.uniform(0.2, 0.5)
        sh = lathe([(0.0, -0.03), (0.28, -0.02), (0.32, 0.03), (0.0, 0.08)], 8, ['glow_fire', 'mush_cap', 'mush_cap'])
        sh.xf(T((0, 0, 0), (0, 0, 0), (1.0, 0.7, 1.0)))
        sh.xf(T((math.cos(a) * (sr * 1.1 + 0.15), math.sin(a) * (sr * 1.1 + 0.15), z), (0, 0, a)))
        g.add(sh)
    for (h2, r2, a, d, gl) in kids:
        k2 = Geo()
        s2, t2 = stem_geo(h2 - 0.15, r2 * 0.28, r2 * 0.2, seed + 9, (0.06, -0.04), seg=8, n=5, flare=1.4)
        k2.add(s2)
        c2 = cap_geo(r2, 0.0, 0.32 * r2 + 0.1, 14, seed + 11, droop=0.02, stem_r=r2 * 0.2, under='glow_fire' if gl else 'mush_stem')
        c2.xf(T((t2.x, t2.y, h2 - (0.32 * r2 + 0.1))))
        k2.add(c2)
        k2.xf(T((math.cos(a) * d, math.sin(a) * d, 0), (0, 0, a)))
        g.add(k2)
    g.add(moss_ring(sr * 2.2, 4, seed))
    for k in range(3):
        a = Rr.uniform(0, TAU)
        g.add(shroomlet(Rr.uniform(0.15, 0.3), Rr.uniform(0.06, 0.1), seed + 20 + k, glow=k == 0)
              .xf(T((math.cos(a) * sr * 2.3, math.sin(a) * sr * 2.3, 0))))
    return g


# ------------------------------------------------------------ mushroom_cluster
def cluster(seed, items, base=None):
    g = Geo()
    R = rng(seed)
    for k, (h, r, x, y, gl) in enumerate(items):
        g.add(shroomlet(h, r, seed + k, glow=gl, lean=0.25).xf(T((x, y, base or 0.0))))
    g.add(blob(0.45, 0.06, 'moss', seg=9, rings=2, seed=seed, wob=0.35, sink=0.03))
    return g


# ------------------------------------------------------------ puffball
def puff(r, h, seed, seg=18, rings=9, burst=False):
    prof = []
    for i in range(rings + 1):
        t = i / rings
        ang = -math.pi / 2 + t * math.pi
        rr = r * math.cos(ang) * (1 + 0.12 * math.sin(t * math.pi))
        z = h / 2 + h / 2 * math.sin(ang)
        prof.append((max(rr, 0.0), z))
    prof[0] = (r * 0.55, -0.05)
    if burst:
        prof = prof[:-2] + [(r * 0.42, h * 0.93), (r * 0.36, h * 0.82), (0, h * 0.62)]
    keys = []
    for i in range(len(prof) - 1):
        zc = (prof[i][1] + prof[i + 1][1]) / 2
        keys.append('mush_stem' if zc < h * 0.45 else 'mush_cap')
    if burst:
        keys[-1] = 'stone_dark'
        keys[-2] = 'stone_dark'
        keys[-3] = 'mush_stem'

    def rf(p, a, i):
        if p.length < 1e-6:
            return p
        k = 1 + 0.06 * nang(a, 3.0, seed, i * 0.7) + 0.04 * nang(a, 7.0, seed + 3, i)
        return Vector((p.x * k, p.y * k, p.z + 0.02 * h * nang(a, 4.0, seed + 5, i)))
    return lathe(prof, seg, keys, rfn=rf, smooth=True)


def puffball(seed, burst=False):
    g = Geo()
    R = rng(seed)
    g.add(puff(0.95, 1.15, seed, burst=burst))
    for k, (r, h, a, d) in enumerate([(0.38, 0.5, 0.6, 1.15), (0.26, 0.34, 2.3, 1.05), (0.18, 0.22, 4.4, 1.0)]):
        if burst and k == 2:
            continue
        g.add(puff(r, h, seed + k + 1, seg=12, rings=6).xf(T((math.cos(a) * d, math.sin(a) * d, 0))))
    g.add(moss_ring(1.0, 5, seed, 0.08))
    if burst:   # споры вокруг — мелкие светлые крошки
        for k in range(5):
            a = R.uniform(0, TAU)
            d = R.uniform(1.0, 1.4)
            g.add(blob(R.uniform(0.08, 0.14), 0.02, 'mush_cap', seg=6, rings=1, seed=seed + 30 + k, z0=0.015)
                  .xf(T((math.cos(a) * d, math.sin(a) * d, 0))))
    return g


# ------------------------------------------------------------ root_ridge
def root_ridge(L, seed):
    g = Geo()
    R = rng(seed)
    n = max(12, int(L / 0.38))
    pts = []
    radii = []
    for i in range(n):
        t = i / (n - 1)
        x = -L / 2 + t * L
        y = 0.45 * math.sin(t * math.pi * 1.6 + seed) + 0.15 * nz(t * 3, seed)
        arch = math.sin(t * math.pi)
        z = -0.35 + 1.0 * arch ** 0.6 + 0.18 * math.sin(t * math.pi * 3 + seed)
        pts.append((x, y, z))
        radii.append(0.58 * (0.55 + 0.45 * arch ** 0.5) * (1 + 0.08 * math.sin(t * 11 + seed)))

    def rf(p, a, i):
        c = Vector(pts[i])
        k = 1 + 0.12 * nang(a, 1.3, seed, i * 0.25)
        return c + (p - c) * k
    main = tube(pts, radii, 10, 'wood_dark', caps=('point', 'point'), rfn=rf)
    g.add(main)
    # отростки
    for k in range(int(L / 1.6)):
        i = R.randrange(2, n - 2)
        c = Vector(pts[i])
        side = 1 if k % 2 else -1
        a = side * R.uniform(0.9, 2.2)
        d = Vector((math.cos(a) * 0.35, math.sin(a), 0)).normalized()
        q = [c, c + d * 0.6 + Vector((0, 0, -0.15)), c + d * 1.1 + Vector((0, 0, -0.5)), c + d * 1.4 + Vector((0, 0, -0.95))]
        g.add(tube(q, [radii[i] * 0.6, radii[i] * 0.52, radii[i] * 0.42, radii[i] * 0.32], 6, 'wood_dark', caps=(None, 'flat')))
    # мох сверху пятнами
    def mossify(c, nn, kk):
        if kk == 'wood_dark' and nn.z > 0.5:
            return 'moss'
        return kk
    g.recolor(mossify)
    for k in range(4):
        i = R.randrange(3, n - 3)
        c = Vector(pts[i])
        g.add(shroomlet(R.uniform(0.18, 0.32), R.uniform(0.07, 0.11), seed + k, glow=k % 2 == 0)
              .xf(T((c.x, c.y, c.z + radii[i] * 0.85))))
    for k in range(6):
        i = R.randrange(0, n)
        c = Vector(pts[i])
        side = 1 if k % 2 else -1
        s = R.uniform(0.25, 0.45)
        g.add(rock((s * 1.3, s, s * 0.6), seed * 7 + k, 'stone_wall', n=8, bevel=0.15, sink=0.25, smooth=True)
              .xf(T((c.x, c.y + side * (radii[i] + 0.3), 0))))
    return g


# ------------------------------------------------------------ ring_mushroom: гриб Ведьмина круга
def ring_mushroom(seed=61):
    g = Geo()
    H, R, sr = 1.7, 0.85, 0.17
    st, top = stem_geo(H - 0.2, sr * 1.2, sr, seed, (0.05, 0.02), seg=10, n=6, flare=1.5)
    g.add(st)
    th = 0.5
    cap = cap_geo(R, 0.0, th, 18, seed, droop=0.04, stem_r=sr, bump=0.02)
    cap.xf(T((top.x, top.y, H - th)))
    g.add(cap)
    Rr = rng(seed)
    for k in range(7):   # светящиеся пятна на шляпке — видно сверху
        a = TAU * k / 7 + Rr.uniform(-0.3, 0.3)
        d = R * (0.25 if k == 0 else Rr.uniform(0.45, 0.7))
        if k == 0:
            a, d = 0, 0
        zz = H - th + th * capz(d / R)
        s = blob(R * (0.2 if k == 0 else Rr.uniform(0.1, 0.15)), 0.04, 'glow_fire', seg=8, rings=1, seed=seed + k,
                 wob=0.25, z0=-0.025)
        nrm = Vector((math.cos(a) * d / R, math.sin(a) * d / R, 1.6)).normalized()
        q = Vector((0, 0, 1)).rotation_difference(nrm).to_euler()
        s.xf(T((top.x + math.cos(a) * d, top.y + math.sin(a) * d, zz), q))
        g.add(s)
    for k, (h, r, a, d) in enumerate([(0.55, 0.22, 1.0, 0.55), (0.35, 0.14, 2.6, 0.5), (0.25, 0.1, 4.6, 0.45)]):
        g.add(shroomlet(h, r, seed + 10 + k, glow=True, lean=0.25, seg=7).xf(T((math.cos(a) * d, math.sin(a) * d, 0))))
    g.add(moss_ring(0.45, 3, seed, 0.07))
    return g


# ------------------------------------------------------------ mushroom_patriarch: шляпка Ø14 м на 6 м
def patriarch_stem(seed=71):
    g = Geo()
    prof = [(3.1, -0.3), (2.6, 0.08), (2.0, 0.5), (1.65, 1.1), (1.45, 2.0), (1.35, 3.0), (1.32, 3.9), (1.38, 4.6),
            (1.5, 5.1), (1.7, 5.45), (0.0, 5.5)]

    def rf(p, a, i):
        if p.length < 1e-6:
            return p
        k = 1 + 0.1 * nang(a, 1.6, seed, i * 0.35) + (0.12 * max(0, nang(a, 2.5, seed + 4)) if i <= 2 else 0)
        tw = 0.05 * i
        x, y = p.x * k, p.y * k
        return Vector((x * math.cos(tw) - y * math.sin(tw), x * math.sin(tw) + y * math.cos(tw), p.z))
    g.add(lathe(prof, 32, 'mush_stem', rfn=rf, smooth=True))
    # кольцо-юбка

    def rw(p, a, i):
        return Vector((p.x, p.y, p.z - (0.12 * (1 + nang(a, 3.0, seed + 2)) if i in (1, 2) else 0)))
    ring = lathe([(1.33, 4.12), (2.05, 3.8), (2.15, 3.95), (1.36, 4.32)], 32, 'mush_stem', rfn=rw)
    g.add(ring)
    R = rng(seed)
    # корни-контрфорсы из грибницы
    for k in range(7):
        a = TAU * k / 7 + R.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), 0))
        q = [d * 1.6 + Vector((0, 0, 1.0)), d * 2.6 + Vector((0, 0, 0.4)), d * 3.3 + Vector((0, 0, 0.0)),
             d * 3.8 + Vector((0, 0, -0.5))]
        g.add(tube(q, [0.6, 0.5, 0.4, 0.32], 8, 'mush_stem', caps=(None, 'flat')))
    # трутовики на ножке
    for k in range(5):
        a = R.uniform(0, TAU)
        z = R.uniform(1.4, 3.6)
        rr = 1.45 + 0.05
        sh = lathe([(0.0, -0.05), (0.5, -0.03), (0.58, 0.05), (0.0, 0.14)], 10, ['glow_fire', 'mush_cap', 'mush_cap'])
        sh.xf(T((0, 0, 0), (0, 0, 0), (1.0, 0.65, 1.0)))
        sh.xf(T((math.cos(a) * rr, math.sin(a) * rr, z), (0, 0, a)))
        g.add(sh)
    # мох, камни, грибная мелочь у подножия
    g.add(moss_ring(3.4, 8, seed, 0.12))
    for k in range(6):
        a = R.uniform(0, TAU)
        dd = R.uniform(3.2, 4.4)
        s = R.uniform(0.4, 0.8)
        g.add(rock((s * 1.3, s, s * 0.7), seed * 9 + k, 'stone_wall', n=10, bevel=0.14, sink=0.25, smooth=True)
              .xf(T((math.cos(a) * dd, math.sin(a) * dd, 0))))
    for k in range(10):
        a = R.uniform(0, TAU)
        dd = R.uniform(2.4, 4.0)
        g.add(shroomlet(R.uniform(0.2, 0.55), R.uniform(0.08, 0.2), seed + 40 + k, glow=k % 3 == 0, seg=8)
              .xf(T((math.cos(a) * dd, math.sin(a) * dd, 0))))
    return g


def patriarch_cap(seed=71):
    g = Geo()
    R0 = 7.0
    th = 1.5
    zb = 5.35
    g.add(cap_geo(R0, zb, th, 72, seed, droop=0.35, wave=0.05, stem_r=1.6, bump=0.025, lobes=12, lobe_k=0.05))
    R = rng(seed)
    for k in range(16):   # пятна
        a = R.uniform(0, TAU)
        d = R0 * R.uniform(0.12, 0.8)
        zz = zb + th * capz(d / R0)
        s = blob(R0 * R.uniform(0.04, 0.075), 0.07, 'stone_floor', seg=8, rings=1, seed=seed + k, wob=0.3, z0=-0.01)
        nrm = Vector((math.cos(a) * d / R0 * 0.6, math.sin(a) * d / R0 * 0.6, 1.6)).normalized()
        q = Vector((0, 0, 1)).rotation_difference(nrm).to_euler()
        s.xf(T((math.cos(a) * d, math.sin(a) * d, zz), q))
        g.add(s)
    for k in range(6):   # грибочки, проросшие на шляпке
        a = R.uniform(0, TAU)
        d = R0 * R.uniform(0.2, 0.55)
        zz = zb + th * capz(d / R0) - 0.03
        g.add(shroomlet(R.uniform(0.3, 0.6), R.uniform(0.12, 0.22), seed + 60 + k, glow=k % 2 == 0, seg=8)
              .xf(T((math.cos(a) * d, math.sin(a) * d, zz))))
    # мох на шляпке
    for k in range(5):
        a = R.uniform(0, TAU)
        d = R0 * R.uniform(0.3, 0.7)
        zz = zb + th * capz(d / R0) - 0.05
        nrm = Vector((math.cos(a) * d / R0 * 0.6, math.sin(a) * d / R0 * 0.6, 1.6)).normalized()
        q = Vector((0, 0, 1)).rotation_difference(nrm).to_euler()
        g.add(blob(R.uniform(0.5, 0.9), 0.1, 'moss', seg=9, rings=2, seed=seed + 80 + k, wob=0.35).xf(
            T((math.cos(a) * d, math.sin(a) * d, zz), q)))
    return g


# ------------------------------------------------------------ сборка
put('mushroom_big_a', mushroom_big(11, 2.8, 1.6, 0.32, (0.02, 0.0), kids=[(1.25, 0.6, 0.7, 1.05, True)]))
put('mushroom_big_b', mushroom_big(12, 2.6, 1.3, 0.28, (0.12, -0.05), droop=0.1,
                                   kids=[(1.0, 0.45, 2.4, 0.8, True), (0.7, 0.32, 3.6, 0.85, False)]))
put('mushroom_big_c', mushroom_big(13, 2.8, 1.8, 0.36, (-0.04, 0.03), droop=0.18, shelves=3, seg=32))
put('mushroom_cluster_a', cluster(21, [(0.6, 0.22, 0, 0, True), (0.42, 0.16, 0.3, 0.12, False),
                                       (0.3, 0.12, -0.2, 0.22, True), (0.22, 0.09, -0.25, -0.18, False),
                                       (0.16, 0.07, 0.18, -0.25, True), (0.35, 0.13, 0.05, 0.38, False)]))
put('mushroom_cluster_b', cluster(22, [(0.45, 0.2, 0, 0, False), (0.3, 0.14, 0.26, 0.05, True),
                                       (0.2, 0.09, -0.15, 0.2, True), (0.14, 0.06, 0.1, -0.22, False)]))
put('mushroom_cluster_c', cluster(23, [(0.5, 0.18, -0.25, 0, True), (0.38, 0.15, 0.1, 0.15, True),
                                       (0.28, 0.11, 0.3, -0.1, True), (0.2, 0.08, -0.05, -0.25, True),
                                       (0.15, 0.06, 0.4, 0.25, False)]))
put('puffball_a', puffball(31))
put('puffball_b', puffball(32, burst=True))
put('root_ridge_5', root_ridge(5.0, 41))
put('root_ridge_9', root_ridge(9.0, 42))
put('ring_mushroom', ring_mushroom())
pob = put('mushroom_patriarch', patriarch_stem())
put('mushroom_patriarch_cap', patriarch_cap(), parent=pob)

layout(OBJS, row_w=30.0, gap=1.4)
print(kit_report(KIT, OBJS))

if globals().get("FINISH", True):
    print(finish_kit(KIT, OBJS))
