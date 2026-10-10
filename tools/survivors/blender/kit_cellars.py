# kit_cellars — Старые погреба: колонны со срезом свода, бочки, стеллажи, ящики, бочка-великан,
# световой колодец с лестницей, кирпичная арка перехода.
# Запуск в Blender: exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/kit_cellars.py').read())
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_a.py').read())

KIT = 'kit_cellars'
clean_scene()
save_as(ROOT + '/docs/survivors/blender/%s.blend' % KIT)
COLL = get_coll(KIT)
OBJS = []


def put(name, g, sharp=40.0, parent=None, loc=(0, 0, 0)):
    ob = make_obj(name, g, COLL, sharp, parent=parent, loc=loc)
    if parent is None:
        OBJS.append(ob)
    return ob


def block(sx, sy, sz, key='stone_wall', bevel=0.035, z0=0.0):
    return box(sx, sy, sz, key, bevel=bevel, z0=z0)


# ------------------------------------------------------------ brick_pillar: колонна со «срезом свода», h 3,2
def brick_pillar(seed, arms=(0, 1, 2, 3), debris=0):
    g = Geo()
    R = rng(seed)
    W = 1.02
    g.add(block(W + 0.26, W + 0.26, 0.3, 'stone_floor', 0.05, z0=-0.02))           # цоколь
    z = 0.28
    ch = 0.27
    k = 0
    while z < 2.25:
        h = min(ch, 2.25 - z)
        wob = R.uniform(-0.025, 0.025)
        rot = R.uniform(-0.03, 0.03)
        if k % 2 == 0:
            b = block(W + wob, W - wob, h - 0.012, 'stone_wall', 0.035, z0=z)
            b.xf(T((0, 0, 0), (0, 0, rot)))
            g.add(b)
        else:   # два кирпича — вертикальный шов чередуется
            for s in (-1, 1):
                b = block(W / 2 - 0.012, W + wob, h - 0.012, 'stone_wall', 0.035, z0=z)
                b.xf(T((s * W / 4, 0, 0), (0, 0, rot)))
                g.add(b)
        z += h
        k += 1
    g.add(block(W + 0.18, W + 0.18, 0.2, 'stone_floor', 0.04, z0=2.25))             # капитель
    g.add(block(W + 0.02, W + 0.02, 0.75, 'stone_wall', 0.03, z0=2.45))             # пята свода
    # рукава свода: расширяются вверх, срез на 3,2
    # пята свода расширяется вверх (паруса) и срезана на 3,2 — тёмная восьмиугольная крышка
    hx = 0.88 if (0 in arms or 2 in arms) else 0.56
    hy = 0.88 if (1 in arms or 3 in arms) else 0.56
    pts = []
    ch = 0.28
    for (sx, sy) in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
        pts.append(Vector((sx * 0.5, sy * 0.5, 2.44)))
        pts.append(Vector((sx * hx, sy * (hy - ch), 3.2)))
        pts.append(Vector((sx * (hx - ch), sy * hy, 3.2)))
        pts.append(Vector((sx * (0.5 + (hx - 0.5) * 0.72), sy * (0.5 + (hy - ch - 0.5) * 0.72), 2.98)))
        pts.append(Vector((sx * (0.5 + (hx - ch - 0.5) * 0.72), sy * (0.5 + (hy - 0.5) * 0.72), 2.98)))
    g.add(hull(pts, 'stone_wall', 0.035, 1, False))
    dark_top(g, 3.15, 0.8)
    for j in range(debris):
        a = R.uniform(0, TAU)
        d = R.uniform(0.9, 1.25)
        b = block(0.26, 0.13, 0.09, 'stone_wall' if j % 2 else 'stone_floor', 0.02)
        b.xf(T((math.cos(a) * d, math.sin(a) * d, 0.04), (R.uniform(-0.2, 0.2), R.uniform(-0.2, 0.2), R.uniform(0, TAU))))
        g.add(b)
    return g


# ------------------------------------------------------------ barrel
def barrel_prof(r=0.29, h=0.9, full=True):
    e = r * 0.86
    pts = [(0, 0), (e, 0)]
    if full:
        pts.append((e * 1.03, h * 0.06))
    pts += [(r * 0.97, h * 0.075), (r * 1.0, h * 0.165), (r * 0.965, h * 0.18), (r * 1.03, h * 0.5),
            (r * 0.965, h * 0.82), (r * 1.0, h * 0.835), (r * 0.97, h * 0.925)]
    if full:
        pts.append((e * 1.03, h * 0.94))
    pts += [(e, h), (e * 0.9, h)]
    if full:
        pts.append((e * 0.88, h * 0.975))
        pts.append((0, h * 0.975))
    else:
        pts.append((0, h * 0.985))
    keys = []
    for (r0, z0), (r1, z1) in zip(pts[:-1], pts[1:]):
        zc = (z0 + z1) / 2 / h
        if r1 < 1e-6 or r0 < 1e-6 or (z0 == z1 == h) or (z1 < z0 and z1 > h * 0.9):
            keys.append('wood_dark')
        elif 0.07 < zc < 0.175 or 0.825 < zc < 0.93:
            keys.append('iron')
        else:
            keys.append('wood')
    return pts, keys


def barrel_geo(r=0.29, h=0.9, seg=14, full=True):
    pts, keys = barrel_prof(r, h, full)
    return lathe(pts, seg, keys, smooth=False, phase=math.pi / seg)


def barrel_stack(seed, top_stand=False, jam=False):
    g = Geo()
    R = rng(seed)
    r, h = 0.28, 0.86
    rows = [(-2 * r - 0.01, r), (0, r), (2 * r + 0.01, r), (-r, r + r * 1.74), (r, r + r * 1.74)]
    for i, (x, z) in enumerate(rows):
        b = barrel_geo(r, h, 12, full=False)
        b.xf(T((x, h / 2 + R.uniform(-0.05, 0.05), z), (math.pi / 2, 0, 0)))   # ось вдоль Y, крышка к −Y
        g.add(b)
    if top_stand:
        b = barrel_geo(r, h, 12, full=False)
        b.xf(T((0, 0, r + r * 1.74 * 2 - r * 0.85), (0, 0, 0.3)))
        g.add(b)
    else:
        b = barrel_geo(r, h, 12, full=False)
        b.xf(T((0, 0, r + r * 1.74 * 2), (math.pi / 2, 0, 0.0)))
        b.xf(T((0, h / 2, 0)))
        g.add(b)
    # g сейчас вытянута в −Y от y=0: сдвинем к центру
    g.xf(T((0, -h / 2, 0)))
    for x in (-3 * r - 0.06, 3 * r + 0.06):   # клинья
        for y in (-h * 0.3, h * 0.3):
            wdg = hull([Vector(p) for p in [(0, -0.07, 0), (0, 0.07, 0), (-0.14 * (1 if x > 0 else -1), -0.07, 0),
                                              (-0.14 * (1 if x > 0 else -1), 0.07, 0), (0, -0.07, 0.14), (0, 0.07, 0.14)]],
                       'wood_dark', 0.0, 1, False)
            wdg.xf(T((x, y, 0)))
            g.add(wdg)
    if jam:   # потёк варенья из нижней бочки и лужица
        g.add(blob(0.22, 0.025, 'jam', seg=10, rings=2, seed=seed, wob=0.35, z0=0.012).xf(T((0.35, -h / 2 - 0.25, 0))))
        g.add(tube([(0.32, -h / 2 + 0.02, 0.36), (0.33, -h / 2 - 0.04, 0.2), (0.35, -h / 2 - 0.12, 0.03)],
                   [0.035, 0.03, 0.04], 5, 'jam', caps=(None, 'point')))
    return g


# ------------------------------------------------------------ wine_rack: 7 м, глубина 1 м, h 2,1
def wine_rack(seed, barrels_low=False, gaps=0.0):
    g = Geo()
    R = rng(seed)
    L, D, H = 7.0, 1.0, 2.1
    nb = 7
    for i in range(nb + 1):
        x = -L / 2 + i * L / nb
        for y in (-D / 2 + 0.05, D / 2 - 0.05):
            g.add(box(0.1, 0.1, H - 0.05, 'wood_dark', z0=0.0).xf(T((x, y, 0))))
    shelves = [0.08, 0.62, 1.12, 1.6]
    for z in shelves:
        g.add(box(L + 0.1, D - 0.02, 0.05, 'wood', z0=z - 0.05))
    g.add(box(L + 0.3, D + 0.12, 0.07, 'wood', bevel=0.02, z0=H - 0.05))         # верхняя доска
    g.add(box(L, 0.04, H - 0.15, 'wood_dark', z0=0.05))                          # перегородка в середине
    for x in (-L / 2 - 0.02, L / 2 + 0.02):
        g.add(box(0.04, D - 0.1, H - 0.2, 'wood_dark', z0=0.08).xf(T((x, 0, 0))))
    # бутылки: торчат горлышком наружу, грубо — 4-гранные конусы
    neck = cyl(0.045, 0.16, 4, 'iron', top=True, r2=0.022, cap_key='wood')
    levels = shelves[1:] if barrels_low else shelves[:3] + []
    for zi, z in enumerate((shelves[1:] if barrels_low else shelves[:3])):
        for i in range(nb):
            x0 = -L / 2 + i * L / nb
            for side in (-1, 1):
                if R.random() < gaps:
                    continue
                n = 3
                for j in range(n):
                    x = x0 + (j + 0.5 + R.uniform(-0.12, 0.12)) * (L / nb) / n
                    zz = z + 0.07 + R.uniform(-0.01, 0.02)
                    b = neck.copy()
                    b.xf(T((x, side * (D / 2 - 0.12), zz), (side * -math.pi / 2, 0, 0)))
                    g.add(b)
    if barrels_low:
        for i in range(nb):
            x = -L / 2 + (i + 0.5) * L / nb
            b = barrel_geo(0.21, 0.82, 8, full=False)
            b.xf(T((x, 0.41, 0.24), (math.pi / 2, 0, 0)))
            g.add(b)
    # на верхней доске: пара стоячих бутылок и ящичек
    tb = lathe([(0, 0), (0.05, 0), (0.05, 0.2), (0.02, 0.27), (0.02, 0.33), (0, 0.33)], 5,
               ['iron', 'iron', 'iron', 'iron', 'wood'], smooth=False)
    for x in (R.uniform(-3, -2), R.uniform(0.5, 1.5), R.uniform(2.6, 3.2)):
        g.add(tb.copy().xf(T((x, R.uniform(-0.25, 0.25), H + 0.02))))
    g.add(box(0.5, 0.4, 0.3, 'wood', bevel=0.02, z0=H + 0.02).xf(T((-0.6, 0.1, 0), (0, 0, 0.2))))
    return g


# ------------------------------------------------------------ crate_stack
def crate(s, key='wood', frame='wood_dark', h=None):
    g = Geo()
    h = h or s
    g.add(box(s - 0.04, s - 0.04, h - 0.04, key, z0=0.02))
    t = 0.07
    for x in (-1, 1):
        for y in (-1, 1):
            g.add(box(t, t, h, frame).xf(T((x * (s - t) / 2, y * (s - t) / 2, h / 2))))
    for z in (t / 2, h - t / 2):
        for y in (-1, 1):
            g.add(box(s - 2 * t, t, t, frame).xf(T((0, y * (s - t) / 2, z))))
        for x in (-1, 1):
            g.add(box(t, s - 2 * t, t, frame).xf(T((x * (s - t) / 2, 0, z))))
    # диагональ на передней грани
    dl = math.hypot(s - 2 * t, h - 2 * t)
    g.add(box(dl, 0.04, t * 0.8, frame).xf(T((0, -s / 2 + 0.01, h / 2), (0, -math.atan2(h - 2 * t, s - 2 * t), 0))))
    return g


def crate_stack(seed, kind=0):
    g = Geo()
    R = rng(seed)
    if kind == 0:
        g.add(crate(0.8).xf(T((-0.42, 0, 0), (0, 0, R.uniform(-0.08, 0.08)))))
        g.add(crate(0.75).xf(T((0.43, 0.05, 0), (0, 0, R.uniform(-0.1, 0.1)))))
        g.add(crate(0.72).xf(T((0.0, 0.02, 0.8), (0, 0, 0.25))))
    else:
        g.add(crate(1.0, h=0.9).xf(T((0, 0, 0), (0, 0, 0.1))))
        g.add(crate(0.62).xf(T((0.1, -0.05, 0.9), (0, 0, -0.3))))
        lid = box(0.8, 0.6, 0.05, 'wood', bevel=0.01)
        lid.xf(T((-0.75, 0.1, 0.38), (0, 1.15, 0.2)))
        g.add(lid)
    return g


# ------------------------------------------------------------ giant_barrel: лежит, ось по Y, кран к −Y
def giant_barrel(seed=7):
    g = Geo()
    R = rng(seed)
    r, L = 1.8, 5.4
    zc = 0.42 + r
    seg = 56
    e = r * 0.88
    pts = [(0, 0.05), (e * 0.86, 0.05), (e * 0.9, 0.0), (e, 0.0), (e * 1.03, L * 0.025)]
    hoops = [0.08, 0.27, 0.73, 0.92]
    zs = [0.05, 0.085, 0.115, 0.2, 0.255, 0.285, 0.38, 0.5, 0.62, 0.715, 0.745, 0.8, 0.885, 0.915, 0.95]

    def rad(t):
        return e * 1.03 + (r - e * 1.03) * math.sin(math.pi * t)
    keys = ['wood_dark', 'wood_dark', 'wood_dark', 'wood']
    for t in zs:
        pts.append((rad(t), t * L))
    pts += [(e * 1.03, L * 0.975), (e, L), (e * 0.9, L), (e * 0.86, L - 0.05), (0, L - 0.05)]
    for (r0, z0), (r1, z1) in zip(pts[4:-1], pts[5:]):
        tc = (z0 + z1) / 2 / L
        keys.append('iron' if any(abs(tc - hh) < 0.022 for hh in hoops) else 'wood')
    keys = keys[:len(pts) - 1]
    keys[-1] = 'wood_dark'
    keys[-2] = 'wood_dark'
    keys[-3] = 'wood'

    def rf(p, a, i):
        if p.length < 1e-6 or not (4 <= i <= len(pts) - 5):
            return p
        k = 1.0 - (0.012 if (int(round(a / TAU * seg)) % 2) else 0.0)
        t = p.z / L
        if any(abs(t - hh) < 0.03 for hh in hoops):
            k = 1.012
        return Vector((p.x * k, p.y * k, p.z))
    body = lathe(pts, seg, keys, rfn=rf, smooth=False)
    body.xf(T((0, L / 2, zc), (math.pi / 2, 0, 0)))    # z лафета -> −Y
    g.add(body)
    # доски передней крышки
    for i in range(-2, 3):
        x = i * 0.62
        hw = math.sqrt(max(0.0, (e * 0.84) ** 2 - x * x))
        pl = box(0.56, 0.05, 2 * hw - 0.1, 'wood', bevel=0.015)
        pl.xf(T((x, -L / 2 - 0.02, zc)))
        g.add(pl)
    # кран
    tap = lathe([(0, 0), (0.09, 0), (0.09, 0.12), (0.06, 0.16), (0.06, 0.42), (0.075, 0.45), (0.075, 0.5),
                 (0, 0.5)], 8, 'brass', smooth=True)
    tap.xf(T((0.0, -L / 2 - 0.03, zc - r * 0.55), (math.pi / 2, 0, 0)))
    g.add(tap)
    sp = cyl(0.05, 0.22, 8, 'brass', top=True, z0=-0.22)
    sp.xf(T((0, -L / 2 - 0.47, zc - r * 0.55)))
    g.add(sp)
    g.add(box(0.36, 0.06, 0.06, 'brass', bevel=0.015).xf(T((0, -L / 2 - 0.4, zc - r * 0.55 + 0.1))))
    # варенье из крана
    g.add(tube([(0, -L / 2 - 0.47, zc - r * 0.55 - 0.2), (0.0, -L / 2 - 0.48, 0.6), (0.02, -L / 2 - 0.5, 0.05)],
               [0.04, 0.035, 0.05], 6, 'jam', caps=(None, 'flat')))
    g.add(blob(0.5, 0.04, 'jam', seg=12, rings=2, seed=3, wob=0.3, z0=0.015).xf(T((0.05, -L / 2 - 0.6, 0))))
    # лафеты
    for y in (-L * 0.3, L * 0.3):
        g.add(block(r * 1.9, 0.5, 0.3, 'wood_dark', 0.03, z0=0.0).xf(T((0, y, 0))))
        for s in (-1, 1):
            pts2 = []
            for yy in (-0.22, 0.22):
                pts2 += [Vector((s * 0.55, yy, 0.28)), Vector((s * 1.75, yy, 0.28)), Vector((s * 1.75, yy, 1.25)),
                         Vector((s * 1.45, yy, 0.98)), Vector((s * 1.0, yy, 0.6))]
            g.add(hull(pts2, 'wood_dark', 0.03, 1, False).xf(T((0, y, 0))))
    # люк сверху и лестница сбоку
    g.add(box(0.9, 0.8, 0.07, 'wood_dark', bevel=0.015).xf(T((0, 0.6, zc + r + 0.0))))
    for x in (-0.3, 0.3):
        g.add(box(0.12, 0.1, 0.05, 'brass').xf(T((x, 0.95, zc + r + 0.04))))
    lad = Geo()
    for x in (-0.3, 0.3):
        lad.add(box(0.08, 0.08, 3.6, 'wood').xf(T((x, 0, 1.8))))
    for k in range(7):
        lad.add(box(0.6, 0.06, 0.06, 'wood').xf(T((0, 0, 0.4 + k * 0.48))))
    lad.xf(T((r + 0.55, -0.6, 0), (0, -0.33, 0)))
    g.add(lad)
    return g


# ------------------------------------------------------------ well_stairs: световой колодец
def mosaic():
    g = Geo()
    seg = 64
    # поле и кольца — тонкая вставка над полом (1,5–4,5 см)
    g.add(lathe([(4.42, 0.015), (0.0, 0.015)], seg, 'stone_floor', smooth=False))
    g.add(lathe([(5.0, 0.0), (5.0, 0.03), (4.72, 0.03), (4.72, 0.0)], seg, 'stone_dark', smooth=False))
    g.add(lathe([(4.6, 0.02), (4.6, 0.035), (4.42, 0.035), (4.42, 0.02)], seg, 'brass', smooth=False))
    # плитки по кольцу
    for k in range(48):
        a = TAU * (k + 0.5) / 48
        t = box(0.2, 0.32, 0.016, 'stone_wall' if k % 2 else 'stone_dark')
        t.xf(T((math.cos(a) * 4.0, math.sin(a) * 4.0, 0.026), (0, 0, a)))
        g.add(t)
    # роза ветров: 4 длинных и 4 коротких луча, двухцветные с ребром
    for k in range(8):
        a = k * math.pi / 4
        Lr = 4.25 if k % 2 == 0 else 2.7
        w = 0.62 if k % 2 == 0 else 0.42
        d = Vector((math.cos(a), math.sin(a), 0))
        n = Vector((-d.y, d.x, 0))
        tip = d * Lr + Vector((0, 0, 0.034))
        base = Vector((0, 0, 0.07))
        l = d * (w * 0.9) + n * w * 0.55 + Vector((0, 0, 0.034))
        rr = d * (w * 0.9) - n * w * 0.55 + Vector((0, 0, 0.034))
        ridge_mid = d * (w * 0.9) + Vector((0, 0, 0.075))
        kl, kr = ('brass', 'stone_dark') if k % 2 == 0 else ('stone_wall', 'brass')
        i0 = g.vert(base)
        i1 = g.vert(ridge_mid)
        i2 = g.vert(tip)
        i3 = g.vert(l)
        i4 = g.vert(rr)
        i5 = g.vert(Vector((0, 0, 0.034)) + n * 0.01)
        g.face((i3, i1, i2), kl, False)
        g.face((i1, i4, i2), kr, False)
        g.face((i0, i1, i3), kl, False)
        g.face((i0, i4, i1), kr, False)
    g.f = [(i if g.center_normal(i)[1].z > 0 else i[::-1], k, s) for i, k, s in g.f]
    g.add(lathe([(0.62, 0.04), (0.62, 0.085), (0.45, 0.09), (0.0, 0.1)], 16, ['stone_dark', 'stone_dark', 'brass'],
                smooth=False))
    return g


def grate(R0=3.0, z=7.2):
    g = Geo()
    g.add(lathe([(R0 + 0.25, -0.12), (R0 + 0.25, 0.12), (R0 - 0.05, 0.12), (R0 - 0.05, -0.12), (R0 + 0.25, -0.12)],
                40, ['iron', 'brass', 'iron', 'iron'], smooth=False))
    for k in range(-5, 6):
        x = k * R0 / 5.5
        hw = math.sqrt(max(0.0, R0 * R0 - x * x))
        g.add(box(0.07, 2 * hw, 0.07, 'iron').xf(T((x, 0, 0.04))))
        g.add(box(2 * hw, 0.07, 0.07, 'iron').xf(T((0, x, -0.04))))
    # рама: четыре бревна вокруг
    for a in range(4):
        b = box(2 * R0 + 1.4, 0.38, 0.38, 'wood_dark', bevel=0.04)
        b.xf(T((0, R0 + 0.45, 0.3), (0, 0, 0)))
        b.xf(T((0, 0, 0), (0, 0, a * math.pi / 2)))
        g.add(b)
    g.xf(T((0, 0, z)))
    return g


def well_stairs():
    g = Geo()
    W = 3.2
    x0 = -5.8
    n = 10
    run = 0.55
    rise = 0.3
    for i in range(n):
        hgt = (i + 1) * rise
        st = block(run + 0.04, W, hgt, 'stone_floor' if i % 2 == 0 else 'stone_wall', 0.03, z0=0.0)
        st.xf(T((x0 - run * (i + 0.5), 0, 0)))
        g.add(st)
    xt = x0 - run * n
    g.add(block(2.6, W, 3.0, 'stone_wall', 0.03, z0=0.0).xf(T((xt - 1.3, 0, 0))))     # площадка, срез
    # боковые стенки-парапеты, кладка участками
    for s in (-1, 1):
        y = s * (W / 2 + 0.25)
        segs = 5
        for j in range(segs):
            xa = x0 + 0.2 - j * (run * n + 2.6 - 0.2) / segs
            xb = x0 + 0.2 - (j + 1) * (run * n + 2.6 - 0.2) / segs

            def top(x):
                return min(3.2, max(0.0, (x0 - x) / run * rise) + 0.85)
            pts = []
            for yy in (y - 0.25, y + 0.25):
                pts += [Vector((xa, yy, 0)), Vector((xb, yy, 0)), Vector((xa, yy, top(xa))), Vector((xb, yy, top(xb)))]
            g.add(hull(pts, 'stone_wall', 0.035, 1, False))
        # тумба у подножия с фонарём
        g.add(block(0.75, 0.75, 1.15, 'stone_floor', 0.04, z0=0.0).xf(T((x0 + 0.45, y, 0))))
        lan = Geo()
        lan.add(box(0.26, 0.26, 0.05, 'iron').xf(T((0, 0, 0.03))))
        lan.add(cyl(0.09, 0.26, 6, 'glow_fire', top=False, z0=0.05))
        for cx in (-1, 1):
            for cy in (-1, 1):
                lan.add(box(0.03, 0.03, 0.3, 'iron').xf(T((cx * 0.11, cy * 0.11, 0.2))))
        lan.add(lathe([(0.17, 0.33), (0.0, 0.46)], 4, 'brass', smooth=False, phase=math.pi / 4))
        lan.xf(T((x0 + 0.45, y, 1.15)))
        g.add(lan)
    dark_top(g, 2.95, 0.8)
    # скала, в которую уходит лестница: срез на 3 м
    R = rng(5)
    for j, (x, y, sx, sy) in enumerate([(-14.3, 0.0, 2.6, 6.4), (-12.0, -3.4, 3.4, 2.6), (-12.2, 3.4, 3.4, 2.6),
                                        (-9.2, -2.9, 2.6, 1.6), (-9.0, 2.9, 2.6, 1.6)]):
        hh = 3.0 if j < 3 else 2.2
        b = rock((sx, sy, hh + 0.4), 70 + j, 'stone_wall', n=18, bevel=0.08, sink=0.08, top_clip=hh / (hh + 0.4) * 0.97,
                 smooth=True)
        b.xf(T((x, y, 0), (0, 0, R.uniform(-0.2, 0.2))))
        dark_top(b, 1.8, 0.8)
        g.add(b)
    return g


# ------------------------------------------------------------ gate_arch: кирпичная арка перехода
def gate_arch():
    g = Geo()
    R = rng(9)
    span = 6.2
    for s in (-1, 1):
        x = s * (span / 2 + 0.55)
        g.add(block(1.3, 1.45, 0.32, 'stone_floor', 0.05, z0=-0.02).xf(T((x, 0, 0))))
        z = 0.3
        k = 0
        while z < 2.8:
            h = 0.4
            if k % 2 == 0:
                g.add(block(1.08, 1.22, h - 0.012, 'stone_wall', 0.035, z0=z).xf(T((x, 0, 0), (0, 0, R.uniform(-0.03, 0.03)))))
            else:
                for t in (-1, 1):
                    g.add(block(0.53, 1.22, h - 0.012, 'stone_wall', 0.035, z0=z).xf(T((x + t * 0.27, 0, 0))))
            z += h
            k += 1
        g.add(block(1.28, 1.36, 0.24, 'stone_floor', 0.04, z0=z).xf(T((x, 0, 0))))   # импост
        # настенный факел на лицевой грани (−Y)
        tw = Geo()
        tw.add(box(0.18, 0.06, 0.3, 'iron').xf(T((0, -0.03, 0))))
        tw.add(box(0.05, 0.25, 0.05, 'iron').xf(T((0, -0.15, -0.08))))
        st = cyl(0.035, 0.5, 6, 'wood_dark', top=False, bottom=True, z0=-0.2)
        st.add(cyl(0.06, 0.15, 6, 'wood', top=True, z0=0.3))
        st.xf(T((0, -0.28, -0.08), (0.3, 0, 0)))
        tw.add(st)
        tw.add(flame(0.45, 0.12, 6).xf(T((0, -0.42, 0.36), (0.1, 0, 0))))
        tw.xf(T((x - s * 0.1, -0.73, 1.9)))
        g.add(tw)
    zi = 2.8 + 0.24
    return g, zi, span


def arch_ring(zi, span):
    g = Geo()
    rise = 1.7
    Rr = (span * span / 4 + rise * rise) / (2 * rise)
    cz = zi + rise - Rr
    a0 = math.asin((span / 2) / Rr)
    nv = 13
    th = 0.62
    for i in range(nv):
        t0 = -a0 + 2 * a0 * i / nv
        t1 = -a0 + 2 * a0 * (i + 1) / nv
        pts = []
        for y in (-0.6, 0.6):
            for t in (t0 + 0.006, t1 - 0.006):
                for rr in (Rr, Rr + th):
                    pts.append(Vector((math.sin(t) * rr, y, cz + math.cos(t) * rr)))
        key = 'stone_floor' if i in (0, nv // 2, nv - 1) else 'stone_wall'
        g.add(hull(pts, key, 0.03, 1, False))
    # кладка над аркой по бокам — две «пяты»
    return g


# ------------------------------------------------------------ сборка
put('brick_pillar_a', brick_pillar(1))
put('brick_pillar_b', brick_pillar(2, arms=(0, 2), debris=3))
put('barrel', barrel_geo(0.3, 0.92, 14, True))
put('barrel_stack_a', barrel_stack(11))
put('barrel_stack_b', barrel_stack(12, top_stand=True, jam=True))
put('wine_rack_a', wine_rack(21))
put('wine_rack_b', wine_rack(22, barrels_low=True, gaps=0.45))
put('crate_stack_a', crate_stack(31, 0))
put('crate_stack_b', crate_stack(32, 1))
put('giant_barrel', giant_barrel())
ws = put('well_stairs', well_stairs())
put('well_stairs_mosaic', mosaic(), parent=ws)
put('well_stairs_grate', grate(), parent=ws)
ga, zi, span = gate_arch()
gob = put('gate_arch', ga)
put('gate_arch_top', arch_ring(zi, span), parent=gob)

layout(OBJS, row_w=34.0, gap=1.6)
print(kit_report(KIT, OBJS))

if globals().get("FINISH", True):
    print(finish_kit(KIT, OBJS))
