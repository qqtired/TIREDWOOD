# kit_buildings — постройки «Подземелья»: altar, cursed_chest, chest_column, healing_spring, brazier, brazier_tipped.
# Анимации: altar_charge, chest_open, spring_refill, brazier_tip.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_b.py').read())

KID = 'kit_buildings'
clean_scene()
random.seed(7)


def polar(r, a, z=0.0):
    return Vector((r * math.cos(a), r * math.sin(a), z))


# ================================================================ altar — Алтарь света
altar = Prop('altar')
A = altar.root


def wobble(k):
    def f(p):
        rr = math.hypot(p.x, p.y)
        if rr > 0.5:
            n = noise.noise(Vector((p.x * 1.3, p.y * 1.3, k))) * 0.035
            s = (rr + n) / rr
            return Vector((p.x * s, p.y * s, p.z))
        return p
    return f


# нижняя круглая плита Ø 4 м
A.lathe('stone_floor', [(2.0, 0.0), (2.0, 0.15), (1.95, 0.22), (1.40, 0.22)], seg=36, fn=wobble(0.3))
# верхний ярус Ø 2,6 м с латунным кольцом
A.lathe('stone_floor', [(1.40, 0.22), (1.31, 0.22), (1.31, 0.37), (1.26, 0.42), (0.0, 0.42)], seg=28, fn=wobble(1.7))
A.lathe('brass', [(1.305, 0.27), (1.33, 0.285), (1.33, 0.33), (1.305, 0.345)], seg=28)
# центральный камень алтаря (как на концепте) с плитой сверху
A.box('stone_wall', (0, 0.05, 0.42 + 0.33), (1.15, 0.78, 0.66), bev=0.05, segs=1, taper=(0.94, 0.94))
A.box('stone_floor', (0, 0.05, 1.08 + 0.07), (1.34, 0.94, 0.14), bev=0.035, segs=1)
A.box('stone_wall', (0, 0.05, 0.42 + 0.06), (1.32, 0.92, 0.12), bev=0.03, segs=1)
# свечи по углам
for sx, sy, h in ((-0.56, -0.3, 0.26), (0.55, 0.38, 0.2)):
    A.cyl('mush_cap', (sx, sy, 1.22), 0.065, h, seg=8, bev=0.012)
    A.drip((sx + 0.05, sy - 0.03, 1.22 + h * 0.8), h * 0.6, 0.016, key='mush_cap', seg=5)
    A.flame((sx, sy, 1.22 + h + 0.01), 0.16, 0.038, seed=sx * 3, tongues=0, seg=5)
# камни-обломки по краю
for i, (a, rr, s) in enumerate(((0.35, 2.05, 0.26), (1.9, 2.1, 0.2), (2.7, 2.0, 0.3), (4.1, 2.1, 0.22), (5.3, 2.0, 0.24))):
    p = polar(rr, a)
    A.rock('stone_wall', (p.x, p.y, 0.0), (s * 1.2, s, s * 0.8), seed=i + 0.3, sub=1, rough=0.25)

# швы плит нижнего яруса и кольцевой шов
for k in range(8):
    ang = -math.pi / 2 - (k + 0.5) * (TAU / 8)
    c = polar(1.7, ang, 0.222)
    A.box('stone_dark', c, (0.6, 0.035, 0.012), rot=(0, 0, ang))
A.lathe('stone_dark', [(1.44, 0.222), (1.47, 0.226), (1.5, 0.222)], seg=28)
A.lathe('stone_dark', [(1.9, 0.218), (1.93, 0.222), (1.96, 0.212)], seg=36)
# 8 гнёзд и 8 рун: руна 1 спереди (−Y), дальше по часовой при виде сверху
GLYPHS = [
    [(0, 0, 0.30, 0), (-0.06, 0.08, 0.14, 0.7), (0.06, 0.08, 0.14, -0.7)],          # стрела вверх
    [(0, 0, 0.30, 0), (0.07, 0.07, 0.15, -0.9), (0.07, -0.02, 0.15, -0.9)],        # ᚠ
    [(0, 0, 0.30, 0.6), (0, 0, 0.30, -0.6)],                                         # X
    [(-0.06, 0.06, 0.17, -0.8), (0.06, 0.06, 0.17, 0.8), (-0.06, -0.06, 0.17, 0.8), (0.06, -0.06, 0.17, -0.8)],  # ромб
    [(0, -0.05, 0.2, 0), (-0.05, 0.08, 0.15, 0.6), (0.05, 0.08, 0.15, -0.6)],        # Y
    [(0, 0, 0.30, 0), (0, 0.04, 0.2, math.pi / 2), (0.08, -0.1, 0.1, 0)],            # крест с крюком
    [(0, -0.09, 0.24, math.pi / 2), (-0.06, 0.02, 0.24, -0.5), (0.06, 0.02, 0.24, 0.5)],  # треугольник
    [(0, 0, 0.30, 0), (-0.06, 0.09, 0.15, -0.7), (0.06, 0.09, 0.15, 0.7)],           # ᛉ
]
RUNE_R = 1.66
SOCK_Z = 0.22 + 0.06
for k in range(8):
    ang = -math.pi / 2 - k * (TAU / 8)
    c = polar(RUNE_R, ang)
    radial = Vector((math.cos(ang), math.sin(ang), 0))
    tang = Vector((-math.sin(ang), math.cos(ang), 0))
    # гнездо: тёмная плитка, утопленная в плиту
    A.box('stone_dark', (c.x, c.y, 0.22 + 0.03), (0.5, 0.42, 0.06), rot=(0, 0, ang + math.pi / 2), bev=0.02)
    rune = altar.sub('rune_%d' % (k + 1), (c.x, c.y, SOCK_Z))
    for (ot, orr, ln, a2) in GLYPHS[k]:
        # «верх» знака смотрит наружу
        cc = c + tang * ot + radial * orr + Vector((0, 0, SOCK_Z + 0.02))
        rune.box('glow_fire', cc, (0.05, ln, 0.04), rot=(0, 0, ang - math.pi / 2 + a2))
# сердце алтаря — солнечный знак наверху: загорается, когда алтарь готов
core = altar.sub('core', (0, 0.05, 1.22))
core.lathe('glow_fire', [(0, 1.22), (0.17, 1.22), (0.15, 1.25), (0.0, 1.26)], seg=12, c=(0, 0.05, 0))
for i in range(8):
    a = i * TAU / 8 + math.pi / 8
    p = Vector((0, 0.05, 1.235)) + polar(0.27, a)
    core.box('glow_fire', p, (0.15, 0.045, 0.025), rot=(0, 0, a))


def altar_charge(f):
    d = {}
    for k in range(8):
        t0 = 6 + k * 10
        up = ramp(f, t0, t0 + 6)
        pop = env(f, t0 + 3, t0 + 6, t0 + 6, t0 + 10)
        d['altar_rune_%d' % (k + 1)] = {'loc': (0, 0, -0.07 * (1 - up) + 0.02 * pop), 'scale': 0.7 + 0.3 * up + 0.15 * pop}
    lit = ramp(f, 86, 90)
    pulse = env(f, 88, 92, 92, 100)
    d['altar_core'] = {'loc': (0, 0, -0.04 * (1 - lit) + 0.03 * pulse), 'scale': 0.6 + 0.4 * lit + 0.35 * pulse,
                       'rot': (0, 0, 0.6 * lit)}
    return d


# ================================================================ cursed_chest — Проклятый сундук
chest = Prop('cursed_chest')
C = chest.root
BX, BY, BZ = 0.66, 0.43, 0.58
C.box('wood_dark', (0, 0, BZ / 2), (BX * 2, BY * 2, BZ), bev=0.025)
# доски — неглубокие пояса по передней и боковым стенкам
for z in (0.15, 0.36):
    C.box('wood', (0, -BY - 0.004, z), (BX * 2 - 0.16, 0.02, 0.17))
    C.box('wood', (0, BY + 0.004, z), (BX * 2 - 0.16, 0.02, 0.17))
# железные уголки и пояса
for sx in (-1, 1):
    for sy in (-1, 1):
        C.box('iron', (sx * (BX - 0.03), sy * (BY - 0.03), BZ / 2), (0.1, 0.1, BZ + 0.02), bev=0.012)
    C.box('iron', (sx * 0.36, -BY - 0.012, BZ / 2), (0.09, 0.03, BZ), bev=0.008)
    C.box('iron', (sx * 0.36, BY + 0.012, BZ / 2), (0.09, 0.03, BZ), bev=0.008)
C.box('iron', (0, 0, 0.035), (BX * 2 + 0.04, BY * 2 + 0.04, 0.07), bev=0.015)
# заклёпки
for sx in (-1, 1):
    C.ellipsoid('brass', (sx * 0.36, -BY - 0.03, 0.45), 0.018, seg=6, rings=3)
# монеты внутри (видно, когда крышка открыта)
C.dome('brass', (0, 0, BZ - 0.04), (BX - 0.12, BY - 0.1, 0.13), seg=12, rings=2)
# сиреневый свет из щели и потёки варенья
C.box('glow_jam', (0, -BY + 0.02, BZ + 0.005), (BX * 2 - 0.2, 0.03, 0.02))
for x, ln in ((-0.42, 0.3), (-0.12, 0.42), (0.2, 0.22), (0.52, 0.34)):
    C.drip((x, -BY - 0.022, BZ - 0.01), ln, 0.022, key='jam', seg=5)
C.puddle((0.0, -BY - 0.32, 0.0), 0.36, th=0.025, seg=12, seed=1.2, stretch=(1.6, 0.8))
C.puddle((-0.55, -BY - 0.2, 0.0), 0.14, th=0.02, seg=8, seed=3.1)
C.ellipsoid('glow_jam', (0.12, -BY - 0.3, 0.02), (0.06, 0.05, 0.02), seg=6, rings=3)
C.ellipsoid('glow_jam', (-0.2, -BY - 0.38, 0.018), (0.04, 0.04, 0.018), seg=6, rings=3)

# крышка: полуцилиндр, петля сзади сверху
lid = chest.sub('lid', (0, BY, BZ))
arc = [(BY * math.cos(t), 0.3 * math.sin(t) + BZ) for t in [math.pi * i / 8 for i in range(9)]]
lid.prism('wood_dark', arc, -BX, BX)
arc2 = [(1.04 * BY * math.cos(t), 0.3 * 1.08 * math.sin(t) + BZ) for t in [math.pi * i / 8 for i in range(9)]]
for x0 in (-BX - 0.01, -0.405, 0.315, BX - 0.09 + 0.01):
    lid.prism('iron', arc2, x0, x0 + 0.09)
lid.box('wood', (0, 0, BZ + 0.3 + 0.004), (BX * 2 - 0.2, 0.18, 0.02), bev=0.006)
lid.box('brass', (0, -BY - 0.02, BZ + 0.08), (0.18, 0.03, 0.17), bev=0.012)

# цепи: от земли сзади-сбоку через крышку к замку спереди
lock_pt = Vector((0, -BY - 0.06, 0.6))
for side, sx in (('l', -1), ('r', 1)):
    joint = (sx * 0.3, 0.0, BZ + 0.33)
    ch = chest.sub('chain_' + side, joint)
    pts = [(sx * 0.95, 0.55, 0.02), (sx * 0.8, 0.42, 0.25), (sx * 0.62, 0.3, 0.62), (sx * 0.45, 0.12, 0.86),
           (sx * 0.3, -0.1, 0.9), (sx * 0.18, -0.36, 0.8), (sx * 0.06, -BY - 0.05, 0.66), lock_pt]
    ch.chain('jam', pts, L=0.19, W=0.11, wire=0.024, smooth_n=24, seg=5)
    # хвост цепи на полу
    ch.chain('jam', [(sx * 0.95, 0.55, 0.025), (sx * 1.1, 0.3, 0.025), (sx * 1.1, 0.0, 0.025)],
             L=0.19, W=0.11, wire=0.024, smooth_n=8, twist=0.3, seg=5)
# замок: латунный корпус, железная дужка, светящаяся скважина
lock = chest.sub('lock', (0, -BY - 0.07, 0.62))
lock.torus('iron', (0, -BY - 0.07, 0.56), 0.075, 0.018, seg=10, mseg=4, rot=(math.pi / 2, 0, 0))
lock.box('brass', (0, -BY - 0.075, 0.43), (0.24, 0.08, 0.2), bev=0.03, segs=2)
lock.box('glow_jam', (0, -BY - 0.12, 0.44), (0.04, 0.012, 0.08))
lock.ellipsoid('glow_jam', (0, -BY - 0.118, 0.49), (0.03, 0.01, 0.03), seg=6, rings=3)


def chest_open(f):
    d = {}
    shake = env(f, 0, 3, 8, 11)
    burst = ramp(f, 10, 18)
    gone = ramp(f, 14, 21)
    for side, sx in (('l', -1), ('r', 1)):
        j = 0.06 * shake * math.sin(f * 2.3 + sx)
        d['cursed_chest_chain_' + side] = {
            'loc': (sx * 0.7 * burst, -0.1 * burst, 0.35 * math.sin(math.pi * burst) - 0.2 * gone),
            'rot': (0.3 * burst + j, sx * 0.9 * burst, sx * 0.4 * burst),
            'scale': max(0.001, 1.0 - gone)}
    fall = ramp(f, 10, 19)
    lgone = ramp(f, 19, 26)
    d['cursed_chest_lock'] = {'loc': (0.05 * shake * math.sin(f * 3.1), -0.25 * fall, -0.5 * fall),
                              'rot': (0.0, 0.0, 1.2 * fall + 0.15 * shake * math.sin(f * 2.7)),
                              'scale': max(0.001, 1.0 - lgone)}
    op = ramp(f, 16, 27)
    over = env(f, 25, 28, 28, 33)
    d['cursed_chest_lid'] = {'rot': (-1.85 * op + 0.12 * over + 0.03 * shake * math.sin(f * 4.0), 0, 0)}
    return d


# ================================================================ chest_column — колонна колоннады
col = Prop('chest_column')
K = col.root
K.box('stone_floor', (0, 0, 0.17), (0.95, 0.95, 0.34), bev=0.04)
K.box('stone_wall', (0, 0, 0.38), (0.78, 0.78, 0.08), bev=0.02)


def chip(p):
    n = noise.noise(Vector((p.x * 4, p.y * 4, p.z * 2.5))) * 0.025
    return Vector((p.x * (1 + n), p.y * (1 + n), p.z))


K.lathe('stone_wall', [(0.31, 0.42), (0.33, 0.9), (0.31, 1.6), (0.28, 2.3)], seg=8, fn=chip, phase=math.pi / 8)
K.box('stone_floor', (0, 0, 2.38), (0.74, 0.74, 0.16), bev=0.03)
K.box('stone_floor', (0, 0, 2.52), (0.86, 0.86, 0.12), bev=0.03)
# чаша с сиреневым огнём — колоннаду видно издалека
K.lathe('iron', [(0.12, 2.58), (0.26, 2.66), (0.3, 2.78), (0.25, 2.79), (0.0, 2.7)], seg=8)
K.flame((0, 0, 2.7), 0.42, 0.17, seed=0.7, key='glow_jam', seg=6, tongues=2)
# руна и потёки
K.box('glow_jam', (0, -0.335, 1.55), (0.06, 0.03, 0.26))
K.box('glow_jam', (0, -0.33, 1.6), (0.17, 0.03, 0.05), rot=(0, 0.6, 0))
K.drip((0.2, -0.36, 2.46), 0.5, 0.03, key='jam', seg=6)
K.drip((-0.28, -0.3, 2.46), 0.3, 0.025, key='jam', seg=6)
K.rock('stone_wall', (0.62, 0.35, 0), (0.22, 0.18, 0.16), seed=2.2, sub=1)

# ================================================================ healing_spring — Целебный родник
spr = Prop('healing_spring')
S = spr.root
# основание и чаша
S.lathe('stone_floor', [(1.95, 0.0), (1.95, 0.06), (1.85, 0.1), (1.6, 0.1)], seg=32, fn=wobble(2.2))
S.lathe('stone_wall', [(1.33, 0.52), (1.22, 0.45), (0.9, 0.24), (0.55, 0.1), (0.0, 0.08)], seg=24, orient='up')
# кольцо камней
NB = 10
for i in range(NB):
    a = TAU * (i + 0.5) / NB + 0.1
    if abs(((a - math.pi / 2 + math.pi) % TAU) - math.pi) < 0.35:
        continue  # сзади стоит камень с носиком
    c = polar(1.55, a)
    h = 0.5 + 0.12 * noise.noise(Vector((i * 0.7, 0.3, 0)))
    sd = i * 1.37

    def jit(p, sd=sd):
        n = Vector((noise.noise(p * 2.2 + Vector((sd, 0, 0))), noise.noise(p * 2.2 + Vector((0, sd, 1))),
                    noise.noise(p * 2.2 + Vector((1, 0, sd)))))
        return p + Vector((n.x * 0.09, n.y * 0.09, (n.z * 0.07) if p.z > 0.1 else 0))

    S.box('stone_floor' if i % 3 else 'stone_wall', (c.x, c.y, h / 2), (1.0, 0.56, h), rot=(0, 0, a + math.pi / 2),
          bev=0.12, segs=2, taper=(0.86, 0.8), fn=jit)
# задний камень с носиком
S.box('stone_wall', (0, 1.6, 0.7), (0.9, 0.6, 1.4), bev=0.08, segs=2, taper=(0.8, 0.8),
      fn=lambda p: p + Vector((noise.noise(p * 2.5) * 0.06, 0, 0)))
S.box('stone_floor', (0, 1.6, 1.44), (0.95, 0.66, 0.12), bev=0.04)
S.box('stone_floor', (0, 1.18, 1.0), (0.24, 0.62, 0.16), bev=0.03)
S.box('stone_dark', (0, 1.08, 1.085), (0.12, 0.42, 0.02))
# мох, кремовые цветы, кристаллы
for (x, y, z, r) in ((0.0, 1.62, 1.5, 0.28), (-1.4, 0.7, 0.55, 0.25), (1.35, -0.6, 0.55, 0.22), (-0.9, -1.25, 0.5, 0.2),
                     (1.0, 1.2, 0.55, 0.22)):
    S.splat((x, y, z), r, th=0.035, seg=8, rings=2, key='moss', seed=x + y)
for (x, y, z) in ((-1.42, 0.72, 0.6), (1.36, -0.58, 0.6), (-0.3, 1.66, 1.53), (0.95, 1.22, 0.6)):
    for j in range(3):
        a = j * 2.1 + x
        S.ellipsoid('mush_cap', (x + 0.07 * math.cos(a), y + 0.07 * math.sin(a), z + 0.02), (0.035, 0.035, 0.015),
                    seg=5, rings=2)
for (x, y, s, t) in ((1.85, 0.6, 0.42, (0.25, -0.3)), (1.9, 0.25, 0.26, (-0.2, 0.35)), (-1.8, -0.8, 0.36, (0.3, 0.2)),
                     (-1.95, -0.45, 0.22, (-0.3, -0.2)), (0.6, 1.95, 0.3, (-0.35, 0.1))):
    S.crystal((x, y, 0.0), s, s * 0.22, tilt=t, seed=x)
for i, (a, rr, s) in enumerate(((0.9, 2.15, 0.2), (2.4, 2.1, 0.17), (3.6, 2.15, 0.22), (5.5, 2.1, 0.18))):
    p = polar(rr, a)
    S.rock('stone_wall', (p.x, p.y, 0), (s * 1.2, s, s * 0.8), seed=i * 2.1, sub=1)
# вода — отдельная часть: origin в центре зеркала полной чаши, двигается по Z
WZ = 0.47
water = spr.sub('water', (0, 0, WZ))
water.lathe('glow_crystal', [(0, WZ + 0.012), (0.5, WZ + 0.008), (0.95, WZ + 0.003), (1.27, WZ)], seg=24)
# струя из носика
stream = spr.sub('stream', (0, 0.9, 1.0))
stream.tube('glow_crystal', [(0, 0.9, 1.0), (0, 0.84, 0.86), (0, 0.8, 0.62), (0, 0.78, WZ - 0.02)],
            [(0.06, 0.03), (0.05, 0.035), (0.045, 0.04), (0.08, 0.06)], seg=6, caps=('flat', 'round'), cap_steps=1)


def spring_refill(f):
    t = ramp(f, 0, 44)
    z = lerp(0.10, WZ, t)
    s = (0.55 + (z - 0.08) / (WZ - 0.08) * 0.72) / 1.27
    flow = env(f, 0, 3, 42, 48)
    return {
        'healing_spring_water': {'loc': (0, 0, z - WZ), 'scale': (s, s, 1.0)},
        'healing_spring_stream': {'scale': (1 + 0.5 * flow, 1 + 0.5 * flow, (1.0 - z) / (1.0 - WZ))},
    }


# ================================================================ brazier — жаровня целая (опрокидывается)
br = Prop('brazier')   # корень — пустышка в основании; тело — дочернее, origin на ребре опрокидывания
PIV = Vector((0.44, 0.0, 0.0))
body = br.sub('body', PIV)
for i in range(3):
    a = math.pi / 2 + i * TAU / 3
    d = Vector((math.cos(a), math.sin(a), 0))
    pts = [d * 0.17 + Vector((0, 0, 0.74)), d * 0.34 + Vector((0, 0, 0.46)), d * 0.43 + Vector((0, 0, 0.12)),
           d * 0.45 + Vector((0, 0, 0.03))]
    body.tube('iron', pts, [0.035, 0.03, 0.032, 0.035], seg=6, n=5, caps=('flat', 'flat'))
    body.box('iron', d * 0.47 + Vector((0, 0, 0.02)), (0.12, 0.12, 0.04), rot=(0, 0, a))
body.lathe('iron', [(0.0, 0.66), (0.17, 0.68), (0.31, 0.75), (0.41, 0.87), (0.45, 0.98), (0.41, 0.99), (0.37, 0.9),
                   (0.26, 0.8), (0.0, 0.77)], seg=14)
body.torus('iron', (0, 0, 0.975), 0.445, 0.03, seg=14, mseg=3)
for i in (0, 1):
    a = i * math.pi
    body.torus('iron', polar(0.5, a, 0.86), 0.07, 0.016, seg=6, mseg=3, rot=(math.pi / 2, 0, a + math.pi / 2))
# угли — дочерняя часть с огнём
fire = br.sub('fire', (0, 0, 0.9), parent=body)
for i in range(3):
    a = i * TAU / 3 + 0.3
    rr = 0.24 if i % 2 else 0.14
    fire.ellipsoid('stone_dark' if i % 3 == 0 else 'glow_fire', polar(rr, a, 0.88), (0.09, 0.08, 0.06), seg=5, rings=3,
                   rot=(0.3, 0.2, a))
fire.dome('glow_fire', (0, 0, 0.86), (0.36, 0.36, 0.08), seg=12, rings=2)
fire.flame((0, 0, 0.88), 0.72, 0.21, seed=1.3, tongues=2, seg=7)


def brazier_tip(f):
    t = ramp(f, 0, 12)
    bounce = env(f, 11, 14, 14, 18)
    sh = env(f, 0, 2, 2, 5)
    return {
        'brazier_body': {'rot': (0, 1.62 * t - 0.12 * bounce - 0.08 * sh, 0)},
        'brazier_fire': {'scale': max(0.12, 1 - 0.88 * ramp(f, 4, 16)), 'loc': (0, 0, -0.05 * t)},
    }


# ================================================================ brazier_tipped — опрокинутая
bt = Prop('brazier_tipped')
T = bt.root
TR = (0, 1.62, 0)  # тот же поворот, что в конце brazier_tip


def tipped(p):
    M = Euler(TR).to_matrix()
    return PIV + M @ (Vector(p) - PIV)


for i in range(3):
    a = math.pi / 2 + i * TAU / 3
    d = Vector((math.cos(a), math.sin(a), 0))
    pts = [d * 0.17 + Vector((0, 0, 0.74)), d * 0.34 + Vector((0, 0, 0.46)), d * 0.45 + Vector((0, 0, 0.03))]
    T.tube('iron', [tipped(p) for p in pts], [0.035, 0.03, 0.035], seg=5, n=4, caps=('flat', 'flat'))
T.lathe('iron', [(0.0, 0.66), (0.2, 0.69), (0.36, 0.8), (0.45, 0.98), (0.4, 0.99), (0.33, 0.86), (0.0, 0.76)], seg=12,
        fn=tipped)
for i in range(9):
    a = i * 0.7
    p = Vector((1.15 + 0.35 * math.cos(a) * (1 + i * 0.06), 0.05 + 0.3 * math.sin(a * 1.3), 0.0))
    T.ellipsoid('glow_fire' if i % 3 == 1 else 'stone_dark', (p.x, p.y, 0.035), (0.08, 0.07, 0.045), seg=5, rings=3,
                rot=(0, 0, a), floor=0.0)
T.flame((1.12, 0.05, 0.03), 0.18, 0.07, seed=2.0, tongues=0, seg=5)

props = [altar, chest, col, spr, br, bt]
info = build_kit(props, row_w=14.0, gap=1.4)
objs = {o.name: o for o in kit_objects()}
acts = [bake(objs, 'altar_charge', 100, altar_charge, step=2), bake(objs, 'chest_open', 36, chest_open),
        bake(objs, 'spring_refill', 48, spring_refill, step=2), bake(objs, 'brazier_tip', 20, brazier_tip)]
ARGS = script_args()
finish(KID, info, acts, props=props, debug_dir=('/private/tmp/claude-501/-Users-tired-Desktop/185f8636-5e7b-49ee-b06d-79b2e9d6d697/scratchpad/dbg/' + KID) if 'dbg' in ARGS else None)
