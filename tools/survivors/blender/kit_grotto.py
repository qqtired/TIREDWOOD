# kit_grotto — Кристальный грот: друзы S/M/L, Поющая друза, островок озера, кристальные «клыки» перехода.
# Запуск в фоне: tools/survivors/blender/bg.sh tools/survivors/blender/kit_grotto.py
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_a.py').read())

KIT = 'kit_grotto'
clean_scene()
save_as(ROOT + '/docs/survivors/blender/%s.blend' % KIT)
COLL = get_coll(KIT)
OBJS = []


def put(name, g, sharp=40.0, parent=None):
    ob = make_obj(name, g, COLL, sharp, parent=parent)
    if parent is None:
        OBJS.append(ob)
    return ob


def xtal(h, r, axis, pos, seg=6, tip=0.3, taper=0.85, sink=0.25, key='glow_crystal'):
    """Кристалл с осью axis (вектор), основание в pos."""
    g = crystal(h, r, key=key, seg=seg, tip=tip, taper=taper, sink=sink)
    q = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()).to_euler()
    g.xf(T(pos, q))
    return g


def spray(seed, n, R, hmax, hmin, rmax, tilt=0.55, center=(0, 0, 0), zbase=0.0, seg=6, start_tall=True):
    """Пучок кристаллов: в центре высокие и прямые, к краю ниже и наклонены наружу."""
    g = Geo()
    Rr = rng(seed)
    c0 = Vector(center)
    for k in range(n):
        u = 0.0 if (k == 0 and start_tall) else math.sqrt(Rr.uniform(0.05, 1.0))
        a = Rr.uniform(0, TAU)
        p = c0 + Vector((math.cos(a) * u * R, math.sin(a) * u * R, zbase))
        h = hmax - (hmax - hmin) * u ** 0.8
        h *= Rr.uniform(0.85, 1.1)
        r = rmax * (h / hmax) ** 0.8 * Rr.uniform(0.85, 1.1)
        t = tilt * u + Rr.uniform(0.0, 0.15)
        ax = (math.sin(t) * math.cos(a + Rr.uniform(-0.3, 0.3)), math.sin(t) * math.sin(a + Rr.uniform(-0.3, 0.3)),
              math.cos(t))
        g.add(xtal(h, r, ax, p, seg=seg, tip=Rr.uniform(0.22, 0.35)))
    return g


# ------------------------------------------------------------ crystal_cluster S / M / L
def cluster(seed, size):
    g = Geo()
    R = rng(seed)
    if size == 'S':
        g.add(rock((1.1, 0.9, 0.45), seed, 'stone_wall', n=10, bevel=0.14, sink=0.3, smooth=True))
        g.add(spray(seed, 5, 0.35, 1.25, 0.45, 0.13, tilt=0.6, zbase=0.15))
    elif size == 'M':
        for j, (x, y, s) in enumerate([(0, 0, 1.5), (0.6, -0.3, 0.9)]):
            b = rock((s, s * 0.85, s * 0.42), seed + j, 'stone_wall', n=12, bevel=0.13, sink=0.3, smooth=True)
            g.add(dark_top(b, 0.3, 0.8).xf(T((x, y, 0), (0, 0, R.uniform(0, TAU)))))
        g.add(spray(seed, 9, 0.6, 1.85, 0.5, 0.2, tilt=0.6, zbase=0.2))
        g.add(spray(seed + 5, 3, 0.25, 0.7, 0.35, 0.1, tilt=0.5, center=(0.65, -0.35, 0), zbase=0.15))
    else:
        for j, (x, y, s) in enumerate([(0, 0, 2.2), (0.95, 0.5, 1.2), (-0.8, -0.7, 1.1)]):
            b = rock((s, s * 0.8, s * 0.42), seed + j, 'stone_wall', n=14, bevel=0.12, sink=0.3, smooth=True)
            g.add(dark_top(b, 0.35, 0.8).xf(T((x, y, 0), (0, 0, R.uniform(0, TAU)))))
        g.add(spray(seed, 14, 0.85, 2.45, 0.6, 0.3, tilt=0.65, zbase=0.3))
        g.add(spray(seed + 7, 4, 0.3, 1.0, 0.45, 0.14, tilt=0.55, center=(0.95, 0.5, 0), zbase=0.2))
        g.add(spray(seed + 9, 4, 0.3, 0.8, 0.35, 0.12, tilt=0.55, center=(-0.8, -0.7, 0), zbase=0.2))
    for k in range(4 if size != 'S' else 2):   # осколки у подножия
        a = R.uniform(0, TAU)
        d = {'S': 0.75, 'M': 1.15, 'L': 1.6}[size] * R.uniform(0.9, 1.15)
        g.add(xtal(R.uniform(0.18, 0.32), 0.05, (R.uniform(-0.5, 0.5), R.uniform(-0.5, 0.5), 1), (math.cos(a) * d, math.sin(a) * d, 0), seg=5))
    return g


# ------------------------------------------------------------ crystal_druse: Поющая друза, r 2,6
def druse(seed=31):
    g = Geo()
    R = rng(seed)
    # постамент — низкая скала со срезом
    prof = [(2.75, -0.2), (2.6, 0.15), (2.35, 0.55), (2.1, 0.8), (1.9, 0.86), (1.2, 0.9), (0.0, 0.92)]
    keys = ['stone_floor', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_dark', 'stone_dark']

    def rf(p, a, i):
        if p.length < 1e-6:
            return p
        k = 1 + 0.1 * nang(a, 1.2, seed) + 0.05 * nang(a, 3.0, seed + 2)
        return Vector((p.x * k, p.y * k, p.z + (0.08 * nang(a, 2.0, seed + i) if 1 <= i <= 3 else 0)))
    g.add(lathe(prof, 36, keys, rfn=rf, smooth=True))
    for k in range(9):   # глыбы вокруг
        a = TAU * k / 9 + R.uniform(-0.2, 0.2)
        d = 2.45 * R.uniform(0.95, 1.08)
        s = R.uniform(0.8, 1.4)
        b = rock((s * 1.4, s, s * R.uniform(0.6, 0.95)), seed * 3 + k, 'stone_wall', n=12, bevel=0.12, sink=0.2,
                 smooth=True)
        g.add(dark_top(b, 0.55, 0.8).xf(T((math.cos(a) * d, math.sin(a) * d, 0), (0, 0, a + math.pi / 2))))
    for k in range(10):   # светлая кромка
        a = TAU * (k + 0.5) / 10 + R.uniform(-0.2, 0.2)
        d = 3.05 * R.uniform(0.95, 1.1)
        s = R.uniform(0.3, 0.55)
        g.add(rock((s * 1.3, s, s * 0.6), seed * 7 + k, 'stone_floor', n=8, bevel=0.15, sink=0.25, smooth=True)
              .xf(T((math.cos(a) * d, math.sin(a) * d, 0), (0, 0, R.uniform(0, TAU)))))
    # главный кристалл и свита
    g.add(xtal(4.3, 0.72, (0.06, -0.04, 1), (0, 0, 0.7), seg=8, tip=0.26, taper=0.9))
    for k, (h, r, a, d, t) in enumerate([(3.1, 0.5, 0.4, 0.75, 0.32), (2.7, 0.45, 2.0, 0.8, 0.38),
                                         (3.3, 0.5, 3.4, 0.7, 0.3), (2.4, 0.42, 4.8, 0.85, 0.42),
                                         (2.0, 0.36, 5.7, 1.1, 0.5)]):
        ax = (math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t))
        g.add(xtal(h, r, ax, (math.cos(a) * d, math.sin(a) * d, 0.75), seg=7, tip=0.28))
    g.add(spray(seed + 1, 14, 1.7, 1.4, 0.4, 0.2, tilt=0.9, zbase=0.75, start_tall=False))
    # кристаллы, проросшие в глыбах
    for k in range(9):
        a = TAU * k / 9 + 0.35
        d = 2.5
        h = R.uniform(0.5, 1.1)
        t = R.uniform(0.4, 0.8)
        ax = (math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t))
        g.add(xtal(h, 0.11 + h * 0.08, ax, (math.cos(a) * d, math.sin(a) * d, R.uniform(0.3, 0.7)), seg=6))
    return g


# ------------------------------------------------------------ lake_island: z=0 — уровень воды
def lake_island(seed=41):
    g = Geo()
    R = rng(seed)
    prof = [(3.7, -0.7), (3.4, -0.08), (3.15, 0.12), (2.7, 0.35), (2.0, 0.55), (1.0, 0.68), (0.0, 0.72)]
    keys = ['stone_dark', 'stone_floor', 'stone_floor', 'stone_wall', 'stone_wall', 'stone_wall']

    def rf(p, a, i):
        if p.length < 1e-6:
            return p
        k = 1 + 0.16 * nang(a, 1.1, seed) + 0.06 * nang(a, 2.8, seed + 2)
        return Vector((p.x * k, p.y * k, p.z + (0.06 * nang(a, 2.5, seed + i) if 2 <= i <= 5 else 0)))
    isl = lathe(prof, 32, keys, rfn=rf, smooth=True)

    def mossy(c, n, k):
        if k == 'stone_floor' and n.z > 0.8 and nz(c.x * 0.6, c.y * 0.6, seed) > 0.15:
            return 'moss'
        return k
    g.add(isl)
    # прибрежные глыбы
    for k in range(9):
        a = TAU * k / 9 + R.uniform(-0.25, 0.25)
        d = 3.3 * (1 + 0.16 * nang(a, 1.1, seed)) * R.uniform(0.92, 1.02)
        s = R.uniform(0.7, 1.3)
        b = rock((s * 1.4, s, s * R.uniform(0.6, 0.9)), seed * 5 + k, 'stone_wall', n=12, bevel=0.12, sink=0.35,
                 smooth=True)
        g.add(dark_top(b, 0.35, 0.8).xf(T((math.cos(a) * d, math.sin(a) * d, -0.15), (0, 0, a + math.pi / 2))))
    # кристаллы в центре и по краям
    g.add(spray(seed, 11, 0.8, 2.3, 0.6, 0.28, tilt=0.6, zbase=0.6))
    for k in range(4):
        a = R.uniform(0, TAU)
        d = R.uniform(1.6, 2.4)
        g.add(spray(seed + 10 + k, 3, 0.25, 0.8, 0.35, 0.12, tilt=0.5,
                    center=(math.cos(a) * d, math.sin(a) * d, 0), zbase=0.45))
    for k in range(7):
        a = R.uniform(0, TAU)
        d = R.uniform(0.9, 2.3)
        g.add(blob(R.uniform(0.35, 0.6), 0.08, 'moss', seg=8, rings=2, seed=seed + k, wob=0.35)
              .xf(T((math.cos(a) * d, math.sin(a) * d, 0.62 - 0.05 * d))))
    return g


# ------------------------------------------------------------ crystal_fangs: ворота перехода (без коллизии)
def fangs(seed=51, road=6.4):
    g = Geo()
    R = rng(seed)
    for s in (-1, 1):
        x0 = s * (road / 2 + 0.9)
        b = rock((2.0, 2.6, 0.7), seed + (1 if s > 0 else 2), 'stone_wall', n=12, bevel=0.12, sink=0.3, smooth=True)
        g.add(dark_top(b, 0.35, 0.8).xf(T((x0, 0, 0), (0, 0, R.uniform(-0.3, 0.3)))))
        # клыки наклонены к дороге
        for k, (h, r, y, t, dx) in enumerate([(3.0, 0.32, -0.6, 0.42, 0.2), (2.5, 0.28, 0.55, 0.5, 0.1),
                                              (1.8, 0.22, 0.05, 0.6, 0.45), (1.3, 0.17, -1.05, 0.55, 0.35)]):
            ax = (-s * math.sin(t), R.uniform(-0.15, 0.15), math.cos(t))
            g.add(xtal(h, r, ax, (x0 - s * dx, y, 0.25), seg=6, tip=0.36, taper=0.8))
        for k in range(4):
            a = R.uniform(0, TAU)
            g.add(xtal(R.uniform(0.3, 0.6), 0.08, (R.uniform(-0.5, 0.5), R.uniform(-0.5, 0.5), 1),
                       (x0 + math.cos(a) * 1.2, math.sin(a) * 1.4, 0), seg=5))
    return g


# ------------------------------------------------------------ сборка
put('crystal_cluster_s', cluster(11, 'S'))
put('crystal_cluster_m', cluster(12, 'M'))
put('crystal_cluster_l', cluster(13, 'L'))
put('crystal_druse', druse())
put('lake_island', lake_island())
put('crystal_fangs', fangs())

layout(OBJS, row_w=22.0, gap=1.6)
print(kit_report(KIT, OBJS))

if globals().get("FINISH", True):
    print(finish_kit(KIT, OBJS))
