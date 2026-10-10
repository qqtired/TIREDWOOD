# kit_mine — Старая шахта: timber_support_a/b, ore_pile_a/b, rail_straight_4m, rail_curve, rail_buffer,
# minecart (+ minecart_broken), kopyor (копёр с колесом и кромкой ствола), ore_heap, hanging_lamp.
#
# Рельсы: колея 0,6 м, верх головки 0,165 м над полом, шпалы через 0,8 м (первая на 0,4 м от начала).
#   rail_straight_4m — от y=+2 до y=−2 (origin в центре), стыкуется без шва.
#   rail_curve — 90°, радиус оси 4 м: начало в origin, едет на −Y, конец в (4; −4) и едет на +X.
#   rail_buffer — рельсы от y=+1,2 (стык) до упора на y≈−0,5.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_b.py').read())

KID = 'kit_mine'
clean_scene()


def polar(r, a, z=0.0):
    return Vector((r * math.cos(a), r * math.sin(a), z))


def plank_fn(sd):
    return lambda p: p + Vector((0, 0, 0.01 * noise.noise(p * 3 + Vector((sd, 0, 0)))))


# ================================================================ timber_support_a/b — крепь
def timber(P, broken=False, sd=0.0):
    H = 2.7
    lean = 0.06 if broken else 0.0
    P.box('stone_wall', (0, 0, 0.1), (0.5, 0.45, 0.2), bev=0.04, taper=(0.85, 0.85))
    P.box('wood', (0, 0, 0.2 + H / 2), (0.26, 0.26, H), rot=(lean, 0, 0), bev=0.025, segs=1, fn=plank_fn(sd))
    top = Vector((0, -math.sin(lean) * H, 0.2 + H * math.cos(lean)))
    P.box('wood_dark', top + Vector((0.35, 0, 0.14)), (1.5, 0.3, 0.26), bev=0.03, fn=plank_fn(sd + 1))
    # подкос
    a0 = Vector((0.13, top.y * 0.6, 1.75))
    a1 = top + Vector((0.9, 0, 0.02))
    m = (a0 + a1) / 2
    d = a1 - a0
    ang = math.atan2(d.z, d.x)
    if broken:
        P.box('wood', (a0 + m) / 2, (d.length * 0.5, 0.16, 0.16), rot=(0, -ang, 0), bev=0.02)
        P.box('wood', (1.05, 0.35, 0.08), (0.9, 0.16, 0.16), rot=(0.1, 0.0, 0.6), bev=0.02)
    else:
        P.box('wood', m, (d.length + 0.1, 0.16, 0.16), rot=(0, -ang, 0), bev=0.02)
    # клинья и железные скобы
    P.box('wood_dark', top + Vector((-0.17, 0, -0.06)), (0.08, 0.28, 0.3), rot=(0, 0.25, 0))
    for z in (0.6, 2.0):
        P.box('iron', (0, -0.135 - math.sin(lean) * z, z), (0.3, 0.02, 0.07))
    P.box('iron', top + Vector((0.2, -0.155, 0.12)), (0.4, 0.02, 0.06))
    # крюк для лампы
    P.tube('iron', [top + Vector((0.85, 0, 0.0)), top + Vector((0.85, 0, -0.18)), top + Vector((0.92, 0, -0.24)),
                    top + Vector((0.95, 0, -0.17))], 0.012, seg=4, caps=('flat', 'flat'))
    if broken:
        for i in range(3):
            P.box('wood', (0.5 + 0.3 * i, -0.45 - 0.1 * i, 0.05), (0.7, 0.14, 0.1), rot=(0, 0, 0.3 + i * 0.7), bev=0.015)
        P.rock('stone_wall', (-0.4, -0.35, 0), (0.22, 0.18, 0.15), seed=sd, sub=1)


ta = Prop('timber_support_a')
timber(ta.root, False, 0.3)
tb = Prop('timber_support_b')
timber(tb.root, True, 2.1)


def surf_rocks(P, n, R, Ry, zf, sd, mats=('stone_wall', 'stone_floor', 'stone_dark'), smin=0.12, smax=0.26):
    """Камни, рассыпанные по поверхности холма: zf(u) — высота на доле радиуса u."""
    for i in range(n):
        a = i * 2.39996 + sd
        u = math.sqrt((i + 0.5) / n) * 0.93
        s = smin + (smax - smin) * (0.5 + 0.5 * noise.noise(Vector((i * 0.37, sd, 0.5))))
        z = zf(u)
        P.rock(mats[i % len(mats)], (R * u * math.cos(a), Ry * u * math.sin(a), z - s * 0.35), (s * 1.25, s, s * 0.8),
               seed=sd + i * 0.37, sub=1, floor=0.0, rough=0.28)


# ================================================================ ore_pile_a/b — рудные кучи с блёстками
def ore_pile(P, R=1.1, H=0.8, sd=0.0, pick=False):
    P.rock('stone_wall', (0, 0, 0), (R, R * 0.85, H), seed=sd, sub=2, rough=0.18, squash_top=0.3)
    surf_rocks(P, 6 if R > 1 else 5, R, R * 0.85, lambda u: H * 0.72 * math.sqrt(max(0.0, 1 - u * u)), sd + 0.5)
    for i in range(5):
        a = i * 1.26 + sd
        rr = R * (0.75 + 0.2 * (i % 2))
        s = 0.2 + 0.08 * (i % 3)
        P.rock('stone_dark' if i % 3 == 0 else 'stone_wall', polar(rr, a), (s * 1.2, s, s * 0.9), seed=sd + i, sub=1)
    for i in range(4):
        a = i * 1.3 + 0.4 + sd
        rr = R * (0.25 + 0.12 * i)
        z = H * (0.95 - 0.16 * i)
        P.rock('brass', polar(rr, a, z * 0.8), (0.12, 0.1, 0.09), seed=sd * 2 + i, sub=0, rough=0.35, floor=None)
    for i in range(4):
        a = i * 1.7 + 1.0 + sd
        rr = R * (0.2 + 0.18 * i)
        P.crystal(polar(rr, a, H * (0.8 - 0.15 * i)), 0.16, 0.04, tilt=(0.4 * math.cos(a), 0.4 * math.sin(a)), seg=4,
                  seed=a)
    if pick:
        P.tube('wood', [(0.2, -0.1, 0.5), (0.45, -0.35, 1.05), (0.6, -0.5, 1.4)], 0.035, seg=6, caps=('flat', 'round'))
        P.tube('iron', [(0.05, 0.15, 0.55), (0.2, -0.1, 0.55), (0.36, -0.33, 0.44), (0.45, -0.5, 0.26)],
               [(0.03, 0.05), (0.05, 0.06), (0.035, 0.04), (0.01, 0.01)], seg=4, caps=('flat', 'flat'))


oa = Prop('ore_pile_a', sharp=32)
ore_pile(oa.root, 1.1, 0.8, 0.0)
ob = Prop('ore_pile_b', sharp=32)
ore_pile(ob.root, 0.8, 0.62, 3.0, pick=True)

# ================================================================ рельсы
rs = Prop('rail_straight_4m')
rs.root.merge(make_rails([(0, 2.0, 0), (0, -2.0, 0)], step=0.8))
# костыли на шпалах
for y in (1.6, 0.8, -0.8, -1.6):
    for sx in (-1, 1):
        rs.root.box('iron', (sx * 0.36, y, 0.1), (0.04, 0.05, 0.04))

rc = Prop('rail_curve')
RCR = 4.0
pts = [(RCR - RCR * math.cos(t), -RCR * math.sin(t), 0) for t in [(math.pi / 2) * i / 11 for i in range(12)]]
rc.root.merge(make_rails(pts, step=0.8, flange=False))

rbf = Prop('rail_buffer')
RB = rbf.root
RB.merge(make_rails([(0, 1.2, 0), (0, -0.45, 0)], step=0.8))
RB.box('wood_dark', (0, -0.5, 0.42), (1.2, 0.26, 0.26), bev=0.03)
RB.box('wood', (0, -0.38, 0.42), (0.9, 0.06, 0.2), bev=0.01)
RB.box('iron', (0, -0.345, 0.42), (0.7, 0.02, 0.12))
for sx in (-1, 1):
    RB.box('wood_dark', (sx * 0.5, -0.55, 0.28), (0.2, 0.2, 0.56), bev=0.025)
    RB.box('wood', (sx * 0.5, -0.95, 0.3), (0.14, 0.14, 0.95), rot=(-0.85, 0, 0))
RB.rock('stone_wall', (0, -1.1, 0), (0.9, 0.45, 0.5), seed=1.2, sub=1, rough=0.25)
RB.rock('stone_dark', (0.7, -1.3, 0), (0.3, 0.25, 0.25), seed=2.2, sub=0)

# ================================================================ minecart / minecart_broken
mc = Prop('minecart')
af = mc.sub('axle_f', (0, -0.33, 0.17))
ab = mc.sub('axle_b', (0, 0.33, 0.17))
mc.root.merge(make_minecart(ore=True, seed=0.5, axles=(af, ab)))

mb = Prop('minecart_broken')
MB = mb.root
MB.merge(make_minecart(broken=True, ore=True, seed=1.7), c=(0, 0, -0.02), rot=(0.13, -0.11, 0.25))
# отлетевшее колесо и доска, рассыпанная руда
MB.lathe('iron', [(0.0, -0.035), (0.15, -0.035), (0.15, 0.015), (0.185, 0.025), (0.185, 0.045), (0.05, 0.045), (0.0, 0.03)],
         seg=12, c=(-0.75, -0.6, 0.035), rot=(0.08, 0, 0))
MB.box('wood', (0.75, -0.35, 0.03), (0.06, 0.6, 0.06), rot=(0, 0, 0.5), bev=0.01)
MB.box('wood', (0.65, 0.5, 0.03), (0.05, 0.4, 0.2), rot=(math.pi / 2 - 0.1, 0, -0.3), bev=0.01)
for i in range(5):
    a = -1.2 + i * 0.35
    MB.rock('stone_wall' if i % 2 else 'stone_dark', polar(0.75 + 0.1 * i, a), (0.14, 0.12, 0.1), seed=i * 1.3, sub=0)
MB.rock('brass', polar(0.95, -0.9), (0.07, 0.06, 0.06), seed=5.5, sub=1)

# ================================================================ kopyor — копёр над стволом
kp = Prop('kopyor')
KP = kp.root
SH = 1.2      # половина проёма ствола
# кромка ствола: деревянный венец, внутренние стенки уходят вниз в темноту
for k in range(4):
    a = k * math.pi / 2
    d = polar(1, a)
    t = polar(1, a + math.pi / 2)
    KP.box('wood_dark', d * (SH + 0.18) + Vector((0, 0, 0.13)), (0.36, 2 * SH + 0.72, 0.26), rot=(0, 0, a), bev=0.03)
bm = KP.bm
for k in range(4):
    a = k * math.pi / 2
    c0 = polar(SH * math.sqrt(2), a + math.pi / 4)
    c1 = polar(SH * math.sqrt(2), a + 3 * math.pi / 4)
    for (z0, z1, key) in ((0.0, -0.6, 'stone_dark'), (-0.6, -2.4, 'void')):
        f = KP.quad(key, [(c0.x, c0.y, z1), (c1.x, c1.y, z1), (c1.x, c1.y, z0), (c0.x, c0.y, z0)])
        f.normal_update()
        if f.normal.dot(Vector((0, 0, 0)) - f.calc_center_median()) < 0:
            f.normal_flip()
KP.quad('void', [(-SH, -SH, -2.4), (SH, -SH, -2.4), (SH, SH, -2.4), (-SH, SH, -2.4)])
for i in range(10):
    a = i * TAU / 10 + 0.2
    s = 0.3 + 0.1 * (i % 3)
    KP.rock('stone_wall', polar(2.15 + 0.15 * (i % 2), a), (s * 1.3, s, s * 0.8), seed=i * 0.77, sub=1)
# башня: 4 ноги от углов 3,2 м к верху 1,4 м на 6 м
HT = 6.2
B0, B1 = 1.75, 0.75
legs = []
for sx in (-1, 1):
    for sy in (-1, 1):
        p0 = Vector((sx * B0, sy * B0, 0.0))
        p1 = Vector((sx * B1, sy * B1, HT))
        legs.append((p0, p1))
        d = p1 - p0
        KP.tube('wood', [p0, p1], [(0.15, 0.15)] * 2, seg=4, phase=math.pi / 4, caps=('flat', 'flat'))
        KP.box('stone_wall', p0 + Vector((0, 0, 0.12)), (0.5, 0.5, 0.24), bev=0.04)


def at(sx, sy, z):
    t = z / HT
    b = B0 + (B1 - B0) * t
    return Vector((sx * b, sy * b, z))


# пояса и раскосы на четырёх гранях
for z in (2.1, 4.2, HT - 0.1):
    for (s0, s1) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
        q0, q1 = at(*s0, z), at(*s1, z)
        KP.tube('wood_dark', [q0, q1], [(0.09, 0.11)] * 2, seg=4, phase=math.pi / 4, caps=('flat', 'flat'))
for (s0, s1) in (((-1, -1), (1, -1)), ((1, 1), (-1, 1)), ((1, -1), (1, 1)), ((-1, 1), (-1, -1))):
    for (za, zb) in ((0.3, 2.1), (2.1, 4.2)):
        KP.tube('wood_dark', [at(*s0, za), at(*s1, zb)], 0.06, seg=4, phase=math.pi / 4, caps=('flat', 'flat'))
# задние подкосы к лебёдке
for sx in (-1, 1):
    KP.tube('wood', [Vector((sx * 0.8, 0.8, HT - 0.4)), Vector((sx * 1.1, 4.6, 0.0))], [(0.12, 0.12)] * 2, seg=4,
            phase=math.pi / 4, caps=('flat', 'flat'))
    KP.box('stone_wall', (sx * 1.1, 4.6, 0.1), (0.45, 0.45, 0.2), bev=0.04)
# верхняя площадка с перилами
for i in range(6):
    KP.box('wood', (-0.95 + 0.38 * i, 0, HT + 0.05), (0.34, 2.0, 0.06), bev=0.01)
for sx in (-1, 1):
    for sy in (-1, 1):
        KP.box('wood_dark', (sx * 1.0, sy * 0.95, HT + 0.4), (0.07, 0.07, 0.7))
    KP.box('wood_dark', (sx * 1.0, 0, HT + 0.72), (0.06, 1.95, 0.06))
KP.box('wood_dark', (0, 0.95, HT + 0.72), (2.0, 0.06, 0.06))
# опоры колеса
WZ = HT + 0.95
for sx in (-1, 1):
    KP.box('wood_dark', (sx * 0.32, 0.0, HT + 0.5), (0.14, 0.4, 0.95), bev=0.02)
    KP.cyl('brass', (sx * 0.4, 0, WZ), 0.09, 0.08, seg=8, rot=(0, sx * math.pi / 2, 0))
# канат: с колеса вниз в ствол и назад к лебёдке
KP.tube('iron', [(0, -0.95, WZ), (0, -0.95, 1.6)], 0.022, seg=4, caps=('flat', 'flat'))
KP.tube('iron', [(0, 0.95, WZ + 0.1), (0, 4.0, 0.8)], 0.022, seg=4, caps=('flat', 'flat'))
# клеть в стволе (видна верхушка)
KP.box('iron', (0, -0.95, 1.55), (0.1, 0.1, 0.1))
for sx in (-1, 1):
    for sy in (-1, 1):
        KP.box('wood_dark', (sx * 0.55, -0.95 + sy * 0.45, 0.85), (0.08, 0.08, 1.4))
KP.box('wood_dark', (0, -0.95, 1.55), (1.2, 1.0, 0.08), bev=0.01)
# лебёдка
KP.box('wood_dark', (0, 4.25, 0.45), (1.6, 0.9, 0.12), bev=0.02)
for sx in (-1, 1):
    KP.box('wood_dark', (sx * 0.7, 4.25, 0.3), (0.14, 0.8, 0.6), bev=0.02)
KP.cyl('iron', (-0.62, 4.25, 0.85), 0.32, 1.24, seg=12, rot=(0, math.pi / 2, 0), bev=0.03)
KP.cyl('wood', (-0.55, 4.25, 0.85), 0.25, 1.1, seg=12, rot=(0, math.pi / 2, 0))
KP.torus('iron', (0.75, 4.25, 0.85), 0.42, 0.04, seg=12, mseg=4, rot=(0, math.pi / 2, 0))
for k in range(3):
    KP.box('iron', (0.75, 4.25, 0.85), (0.04, 0.82, 0.05), rot=(k * math.pi / 3, 0, 0))
# лампа на ноге копра
KP.merge(make_lantern(), c=(-1.45, -1.62, 2.55))
KP.tube('iron', [(-1.3, -1.48, 3.2), (-1.45, -1.62, 3.1), (-1.45, -1.62, 3.0)], 0.015, seg=4, caps=('flat', 'flat'))
# колесо — отдельная часть, origin на оси (крутится вокруг X)
wh = kp.sub('wheel', (0, 0, WZ))
wh.torus('iron', (0, 0, WZ), 0.95, 0.06, seg=24, mseg=4, rot=(0, math.pi / 2, 0))
wh.torus('iron', (0, 0, WZ), 0.82, 0.035, seg=24, mseg=3, rot=(0, math.pi / 2, 0))
for k in range(4):
    wh.box('iron', (0, 0, WZ), (0.05, 0.05, 1.66), rot=(k * math.pi / 4, 0, 0))
wh.cyl('brass', (-0.12, 0, WZ), 0.13, 0.24, seg=10, rot=(0, math.pi / 2, 0))


def kopyor_spin(f):
    return {'kopyor_wheel': {'rot': (TAU * f / 48, 0, 0)}}


# ================================================================ ore_heap — рудный отвал
oh = Prop('ore_heap', sharp=32)
OH = oh.root


def heap_fn(p):
    n = noise.noise(Vector((p.x * 0.7, p.y * 0.7, 0.3))) * 0.25 + noise.noise(Vector((p.x * 2, p.y * 2, 1.1))) * 0.08
    return Vector((p.x, p.y, max(0.0, p.z + n * (p.z / 2.3) * 1.0)))


OH.lathe('stone_wall', [(3.1, 0.0), (2.7, 0.35), (2.1, 1.0), (1.4, 1.75), (0.7, 2.15), (0.0, 2.3)], seg=24,
         sx=1.0, sy=0.85, fn=heap_fn)
for i in range(4):
    a = i * 1.6 + 0.3
    OH.rock('stone_wall' if i % 2 else 'stone_dark', polar(1.7 + 0.4 * (i % 2), a, 0.2), (0.7, 0.55, 0.8),
            seed=i * 2.3, sub=1, rough=0.22)
HPROF = [(3.1, 0.0), (2.7, 0.35), (2.1, 1.0), (1.4, 1.75), (0.7, 2.15), (0.0, 2.3)]


def heap_z(u):
    r = u * 3.1
    for (r0, z0), (r1, z1) in zip(HPROF[:-1], HPROF[1:]):
        if r1 <= r <= r0:
            return z1 + (z0 - z1) * (r - r1) / (r0 - r1)
    return 0.0


surf_rocks(OH, 20, 3.1, 3.1 * 0.85, heap_z, 4.4, smin=0.18, smax=0.36)
for i in range(16):
    a = i * 0.39 + 0.1
    rr = 2.6 + 0.4 * ((i * 7) % 3) / 2
    s = 0.18 + 0.08 * (i % 3)
    OH.rock('stone_dark' if i % 4 == 0 else 'stone_wall', Vector((rr * math.cos(a), rr * math.sin(a) * 0.85, 0)),
            (s * 1.2, s, s * 0.8), seed=i * 0.61, sub=1)
for i in range(7):
    a = i * 0.9 + 0.5
    rr = 0.5 + 0.3 * i
    z = 2.2 - 0.3 * i
    OH.rock('brass', Vector((rr * math.cos(a), rr * math.sin(a) * 0.85, z)), (0.12, 0.1, 0.09), seed=i * 4.1, sub=0,
            rough=0.35, floor=None)
for i in range(5):
    a = i * 1.25 + 1.2
    rr = 0.6 + 0.35 * i
    OH.crystal(Vector((rr * math.cos(a), rr * math.sin(a) * 0.85, 2.15 - 0.33 * i)), 0.2, 0.05,
               tilt=(0.4 * math.cos(a), 0.4 * math.sin(a)), seg=4)
# дощатый жёлоб и тачка-ящик
OH.box('wood', (-1.4, -2.5, 0.75), (0.5, 2.4, 0.06), rot=(-0.55, 0, 0.35), bev=0.01)
for sx in (-1, 1):
    OH.box('wood_dark', (-1.4 + sx * 0.24, -2.5, 0.85), (0.05, 2.4, 0.16), rot=(-0.55, 0, 0.35), bev=0.01)
OH.box('wood_dark', (-0.7, -3.6, 0.4), (0.1, 0.1, 0.8), bev=0.01)
OH.box('wood_dark', (-2.0, -1.6, 0.9), (0.1, 0.1, 1.5), bev=0.01)

# ================================================================ hanging_lamp — шахтная лампа на крюке
# origin — точка подвеса (z=0), лампа висит ниже; качается дочерняя часть body вокруг точки подвеса.
hl = Prop('hanging_lamp')
HL = hl.root
HL.tube('iron', [(0, 0, 0.0), (0, 0, -0.08), (0.04, 0, -0.12), (0.05, 0, -0.06)], 0.01, seg=4, caps=('flat', 'flat'))
body = hl.sub('body', (0, 0, -0.1))
body.torus('brass', (0, 0, -0.13), 0.04, 0.008, seg=6, mseg=3, rot=(math.pi / 2, 0, 0))
body.lathe('brass', [(0.0, -0.16), (0.05, -0.17), (0.09, -0.21), (0.085, -0.22)], seg=6)
body.lathe('glow_fire', [(0.06, -0.22), (0.07, -0.3), (0.06, -0.37)], seg=6)
body.lathe('brass', [(0.08, -0.36), (0.085, -0.4), (0.0, -0.41)], seg=6)


def lamp_swing(f):
    return {'hanging_lamp_body': {'rot': (0.12 * math.sin(TAU * f / 48), 0.05 * math.sin(TAU * f / 24), 0)}}


props = [ta, tb, oa, ob, rs, rc, rbf, mc, mb, kp, oh, hl]
info = build_kit(props, row_w=18.0, gap=1.4)
objs = {o.name: o for o in kit_objects()}
acts = [bake(objs, 'kopyor_spin', 48, kopyor_spin, step=2), bake(objs, 'lamp_swing', 48, lamp_swing, step=2)]
ARGS = script_args()
finish(KID, info, acts, props=props,
       debug_dir=('/private/tmp/claude-501/-Users-tired-Desktop/185f8636-5e7b-49ee-b06d-79b2e9d6d697/scratchpad/dbg/' + KID) if 'dbg' in ARGS else None)
