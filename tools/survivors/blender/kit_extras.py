# kit_extras — предложения владельцу (level.md §5): lantern_post (фонарь-маяк), powder_keg (пороховая бочка),
# mushroom_trampoline (гриб-батут), bear_trap (капкан, челюсти — части), bell_frame (колокол-магнит),
# forgotten_forge (забытая кузня), mine_lift (шахтный лифт).
# Анимации: trampoline_bounce, trap_snap, bell_ring, lift_ride, keg_fuse.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_b.py').read())

KID = 'kit_extras'
clean_scene()


def polar(r, a, z=0.0):
    return Vector((r * math.cos(a), r * math.sin(a), z))


# ================================================================ lantern_post — фонарь-маяк, чугунный столб 2,4 м
lp = Prop('lantern_post')
L = lp.root
L.lathe('iron', [(0.26, 0.0), (0.26, 0.12), (0.2, 0.16), (0.16, 0.3), (0.11, 0.36), (0.0, 0.36)], seg=8, phase=math.pi / 8)
L.lathe('iron', [(0.075, 0.36), (0.06, 1.3), (0.05, 1.9), (0.045, 1.95)], seg=8)
for z in (0.55, 1.4, 1.95):
    L.lathe('iron', [(0.06, z - 0.03), (0.085, z - 0.015), (0.085, z + 0.015), (0.06, z + 0.03)], seg=8)
L.lathe('iron', [(0.045, 1.95), (0.16, 1.98), (0.16, 2.0), (0.0, 2.0)], seg=8)
for k in range(4):
    a = k * math.pi / 2 + math.pi / 4
    L.tube('iron', [polar(0.04, a, 1.75), polar(0.13, a, 1.86), polar(0.15, a, 1.98)], 0.012, seg=4,
           caps=('flat', 'flat'))
# поперечина для лестницы фонарщика
L.box('iron', (0, 0, 1.72), (0.5, 0.03, 0.03))
glass = lp.sub('glass', (0, 0, 2.17))
lant = make_lantern(glass_part=glass)
L.merge(lant, c=(0, 0, 2.0), scale=1.35)
# стекло построено у начала координат — сдвинуть/масштабировать так же, как каркас
for v in glass.bm.verts:
    v.co = Vector((0, 0, 2.0)) + v.co * 1.35
L.lathe('brass', [(0.0, 2.6), (0.03, 2.61), (0.0, 2.72)], seg=6)

# ================================================================ powder_keg — пороховая бочка
pk = Prop('powder_keg')
K = pk.root
H, R = 0.8, 0.3
K.lathe('paint_red', [(R * 0.84, 0.0), (R * 0.96, H * 0.25), (R, H * 0.5), (R * 0.96, H * 0.75), (R * 0.84, H),
                      (R * 0.8, H)], seg=12, orient='out')
K.lathe('wood_dark', [(R * 0.8, H), (R * 0.8, H - 0.02), (0.0, H - 0.02)], seg=12, orient='up')
for z, w in ((0.06, 0.03), (H * 0.5, 0.09), (H - 0.06, 0.03)):
    rr = R * (0.84 + 0.16 * math.sin(math.pi * z / H)) + 0.006
    K.lathe('iron', [(rr, z - w), (rr + 0.008, z - w + 0.01), (rr + 0.008, z + w - 0.01), (rr, z + w)], seg=12, orient='out')
K.cyl('wood_dark', (0.08, -0.05, H - 0.02), 0.035, 0.05, seg=6)
K.tube('stone_dark', [(0.08, -0.05, H + 0.02), (0.1, -0.08, H + 0.12), (0.18, -0.12, H + 0.17), (0.25, -0.12, H + 0.12)],
       0.012, seg=4, caps=('flat', 'flat'))
spark = pk.sub('spark', (0.255, -0.12, H + 0.12))
spark.ellipsoid('glow_fire', (0.255, -0.12, H + 0.12), 0.035, seg=6, rings=3)
for k in range(3):
    spark.box('glow_fire', (0.255, -0.12, H + 0.12), (0.14, 0.012, 0.012), rot=(k * 0.9, k * 1.1, k * 1.05))


def keg_fuse(f):
    return {'powder_keg_spark': {'scale': 0.8 + 0.35 * abs(math.sin(f * 1.7)), 'rot': (0, 0, f * 0.6)}}


# ================================================================ mushroom_trampoline — гриб-батут Ø 2,5 м
mt = Prop('mushroom_trampoline')
M = mt.root
M.lathe('mush_stem', [(0.62, 0.0), (0.55, 0.12), (0.42, 0.35), (0.4, 0.6), (0.46, 0.78), (0.5, 0.86)], seg=12, orient='out')
for i, (a, s) in enumerate(((0.4, 0.28), (2.1, 0.22), (3.4, 0.32), (4.8, 0.2))):
    p = polar(1.25, a)
    M.lathe('mush_stem', [(s * 0.3, 0.0), (s * 0.22, s * 0.8), (0.0, s * 0.9)], seg=6, c=p)
    M.dome('mush_cap', p + Vector((0, 0, s * 0.75)), (s * 0.6, s * 0.6, s * 0.4), seg=8, rings=2)
    M.lathe('glow_fire', [(s * 0.58, s * 0.75), (s * 0.2, s * 0.68), (0.0, s * 0.66)], seg=8, c=p)
M.puddle((0, 0, 0), 1.0, th=0.04, seg=16, key='moss', seed=1.1, wob=0.3)
for k in range(5):
    a = k * TAU / 5 + 0.3
    M.tube('mush_stem', [polar(0.5, a, 0.1), polar(0.8, a + 0.15, 0.04), polar(1.05, a + 0.1, 0.0)], [0.08, 0.05, 0.03],
           seg=5, caps=('flat', 'round'), cap_steps=1)
cap = mt.sub('cap', (0, 0, 0.86))
CR, CZ = 1.25, 0.86
cap.lathe('mush_cap', [(CR * 0.95, CZ + 0.12), (CR, CZ + 0.2), (CR * 0.92, CZ + 0.38), (CR * 0.65, CZ + 0.56),
                       (CR * 0.3, CZ + 0.64), (0.0, CZ + 0.66)], seg=20)
cap.lathe('glow_fire', [(0.48, CZ + 0.02), (CR * 0.6, CZ + 0.07), (CR * 0.95, CZ + 0.12)], seg=20, orient='down')
cap.lathe('mush_stem', [(0.0, CZ + 0.0), (0.48, CZ + 0.02)], seg=20, orient='down')
for i in range(7):
    a = i * 2.39996 + 0.4
    rr = 0.25 + 0.75 * math.sqrt((i + 0.5) / 7)
    z = CZ + 0.66 - 0.5 * (rr / CR) ** 2 * 0.95
    s = 0.2 - 0.012 * i
    cap.splat((rr * math.cos(a), rr * math.sin(a), z + 0.3), s, th=0.03, seg=9, rings=2, key='stone_floor', seed=i * 1.3)


def trampoline_bounce(f):
    sq = env(f, 0, 3, 3, 7)
    over = env(f, 6, 9, 9, 16)
    return {'mushroom_trampoline_cap': {'scale': (1 + 0.14 * sq - 0.05 * over, 1 + 0.14 * sq - 0.05 * over,
                                                  1 - 0.4 * sq + 0.15 * over), 'loc': (0, 0, -0.1 * sq + 0.04 * over)}}


# ================================================================ bear_trap — капкан: основание + 2 челюсти (взведён = раскрыт)
bt = Prop('bear_trap')
T = bt.root
T.torus('iron', (0, 0, 0.025), 0.3, 0.018, seg=12, mseg=3)
T.box('iron', (0, 0, 0.012), (0.66, 0.06, 0.024))
T.cyl('brass', (0, 0, 0.0), 0.09, 0.03, seg=8)
T.link('iron', (0.42, 0.0, 0.02), (1, 0, 0), (0, 0, 1), 0.12, 0.07, 0.012, seg=5, mseg=3)
for side, sy in (('jaw_a', -1), ('jaw_b', 1)):
    jw = bt.sub(side, (0, 0, 0.03))
    pts = [Vector((0.3 * math.cos(t), sy * 0.3 * math.sin(t), 0.03)) for t in [math.pi * i / 6 for i in range(7)]]
    jw.tube('iron', pts, [(0.016, 0.014)] * len(pts), seg=4, caps=('flat', 'flat'))
    for i in range(1, 6):
        t = math.pi * i / 6
        b = Vector((0.3 * math.cos(t), sy * 0.3 * math.sin(t), 0.03))
        d = -Vector((math.cos(t), sy * math.sin(t), 0))
        tip = b + d * 0.09
        tg = Vector((-math.sin(t), sy * math.cos(t), 0)) * 0.03
        vs = [jw.bm.verts.new(b - tg), jw.bm.verts.new(b + tg), jw.bm.verts.new(tip + Vector((0, 0, 0.012))),
              jw.bm.verts.new(b + Vector((0, 0, 0.02)))]
        mid = (b + tip) / 2 + Vector((0, 0, -0.01))
        for fv in ((vs[0], vs[1], vs[2]), (vs[1], vs[3], vs[2]), (vs[3], vs[0], vs[2])):
            fc = jw.bm.faces.new(fv)
            fc.material_index = jw.mi('iron')
            fc.normal_update()
            if fc.normal.dot(fc.calc_center_median() - mid) < 0:
                fc.normal_flip()


def trap_snap(f):
    c = ramp(f, 0, 3)
    sh = env(f, 3, 4, 4, 8)
    return {'bear_trap_jaw_a': {'rot': (-1.45 * c + 0.1 * sh, 0, 0)},
            'bear_trap_jaw_b': {'rot': (1.45 * c - 0.1 * sh, 0, 0)}}


# ================================================================ bell_frame — колокол-магнит под навесом
bf = Prop('bell_frame')
F = bf.root
FH = 2.9
F.lathe('stone_floor', [(1.35, 0.0), (1.35, 0.14), (1.28, 0.2), (0.0, 0.2)], seg=8, phase=math.pi / 8)
for sx in (-1, 1):
    F.box('wood_dark', (sx * 0.95, 0, 0.2 + FH / 2), (0.24, 0.24, FH), bev=0.025)
    F.box('wood', (sx * 0.72, 0, FH - 0.2), (0.12, 0.12, 0.7), rot=(0, sx * 0.75, 0), bev=0.015)
    F.box('wood_dark', (sx * 0.95, 0, 0.32), (0.4, 0.4, 0.24), bev=0.03)
F.box('wood', (0, 0, FH + 0.25), (2.4, 0.28, 0.24), bev=0.03)
F.prism('wood_dark', [(-0.8, 0.0), (0.8, 0.0), (0.0, 0.48)], -1.45, 1.45, c=(0, 0, FH + 0.37))
F.prism('wood', [(-0.72, 0.0), (0.72, 0.0), (0.0, 0.43)], -1.3, 1.3, c=(0, 0, FH + 0.33))
bell = bf.sub('bell', (0, 0, FH + 0.13))
BZ = FH + 0.13
bell.lathe('brass', [(0.0, BZ - 0.02), (0.14, BZ - 0.04), (0.22, BZ - 0.18), (0.25, BZ - 0.45), (0.3, BZ - 0.68),
                     (0.4, BZ - 0.8), (0.42, BZ - 0.86), (0.36, BZ - 0.84), (0.25, BZ - 0.72), (0.2, BZ - 0.45),
                     (0.0, BZ - 0.42)], seg=16)
bell.box('iron', (0, 0, BZ + 0.02), (0.08, 0.3, 0.08))
bell.tube('iron', [(0, 0, BZ - 0.42), (0, 0, BZ - 0.75)], 0.02, seg=5, caps=('flat', 'round'))
bell.ellipsoid('iron', (0, 0, BZ - 0.78), 0.06, seg=6, rings=3)
bell.tube('wood', [(0, 0, BZ - 0.8), (0.05, -0.05, BZ - 1.4), (0.1, -0.1, 0.9)], 0.02, seg=4, caps=('flat', 'round'))


def bell_ring(f):
    k = math.sin(TAU * f / 24) * (1 - f / 48)
    return {'bell_frame_bell': {'rot': (0.45 * k, 0, 0)}}


# ================================================================ forgotten_forge — забытая кузня
fg = Prop('forgotten_forge')
G = fg.root
# горн: каменный короб с углями
G.box('stone_wall', (0, 0.35, 0.45), (1.7, 1.2, 0.9), bev=0.06, segs=2,
      fn=lambda p: p + Vector((noise.noise(p * 2.0) * 0.04, 0, 0)))
G.box('stone_floor', (0, 0.35, 0.93), (1.8, 1.3, 0.1), bev=0.03)
G.box('stone_dark', (0, 0.3, 0.985), (1.2, 0.8, 0.02))
for i in range(9):
    a = i * 2.39996
    rr = 0.4 * math.sqrt((i + 0.5) / 9)
    G.ellipsoid('glow_fire' if i % 3 else 'stone_dark', (rr * math.cos(a) * 1.3, 0.3 + rr * math.sin(a), 1.02),
                (0.12, 0.1, 0.06), seg=5, rings=3, rot=(0, 0, a))
G.flame((0.05, 0.3, 1.0), 0.32, 0.12, seed=0.5, tongues=1, seg=5)
# вытяжка и труба
G.box('stone_wall', (0, 0.85, 1.6), (1.4, 0.3, 1.3), bev=0.04)
G.hexa('stone_floor', [(-0.8, 0.2, 2.25), (0.8, 0.2, 2.25), (0.8, 1.0, 2.25), (-0.8, 1.0, 2.25),
                       (-0.35, 0.55, 2.75), (0.35, 0.55, 2.75), (0.35, 0.9, 2.75), (-0.35, 0.9, 2.75)], bev=0.03)
G.box('stone_wall', (0, 0.72, 3.15), (0.6, 0.5, 0.8), bev=0.04)
G.box('stone_dark', (0, 0.72, 3.56), (0.42, 0.32, 0.03))
# мехи
G.hexa('wood_dark', [(0.9, 0.0, 0.62), (1.6, -0.05, 0.62), (1.6, 0.75, 0.62), (0.9, 0.7, 0.62),
                     (0.9, 0.05, 0.78), (1.6, 0.0, 0.92), (1.6, 0.7, 0.92), (0.9, 0.65, 0.78)], bev=0.02)
G.box('wood', (1.25, 0.35, 0.5), (0.7, 0.55, 0.06), bev=0.01)
G.tube('iron', [(0.92, 0.35, 0.7), (0.75, 0.35, 0.72)], 0.04, seg=6, caps=('flat', 'flat'))
for sx in (-1, 1):
    G.box('wood_dark', (1.25, 0.35 + sx * 0.25, 0.25), (0.08, 0.08, 0.5))
# наковальня на колоде
G.cyl('wood', (-0.3, -1.0, 0.0), 0.32, 0.5, seg=10, bev=0.02)
G.lathe('wood_dark', [(0.28, 0.5), (0.25, 0.505), (0.0, 0.505)], seg=10, c=(-0.3, -1.0, 0))
G.box('iron', (-0.3, -1.0, 0.6), (0.22, 0.34, 0.2), bev=0.02)
G.box('iron', (-0.3, -1.0, 0.75), (0.28, 0.6, 0.12), bev=0.02)
G.hexa('iron', [(-0.42, -0.7, 0.69), (-0.18, -0.7, 0.69), (-0.18, -0.7, 0.81), (-0.42, -0.7, 0.81),
                (-0.3, -0.42, 0.74), (-0.3, -0.42, 0.74), (-0.3, -0.42, 0.8), (-0.3, -0.42, 0.8)])
# молот и клещи
G.tube('wood', [(-0.2, -1.12, 0.83), (0.2, -1.35, 0.83)], 0.02, seg=5, caps=('flat', 'flat'))
G.box('iron', (-0.22, -1.1, 0.85), (0.08, 0.16, 0.08), rot=(0, 0, -0.5))
G.tube('iron', [(0.55, -0.35, 0.02), (0.85, -0.6, 0.02), (1.05, -0.75, 0.03)], 0.014, seg=4, caps=('flat', 'flat'))
G.tube('iron', [(0.55, -0.35, 0.02), (0.82, -0.66, 0.02), (1.0, -0.86, 0.03)], 0.014, seg=4, caps=('flat', 'flat'))
# бочка-кадка с водой для закалки
G.merge(make_barrel(h=0.55, r=0.32, seg=12, lid_key='stone_dark'), c=(-1.25, -0.4, 0))
G.rock('stone_wall', (1.3, -0.9, 0), (0.25, 0.2, 0.18), seed=1.1, sub=1)
G.rock('stone_dark', (-1.2, 0.8, 0), (0.3, 0.25, 0.2), seed=2.1, sub=1)


# ================================================================ mine_lift — шахтный лифт: рама, колесо, клеть
ml = Prop('mine_lift')
Lf = ml.root
LH = 4.2
# площадка и кромка шахты
Lf.box('wood_dark', (0, 0, 0.08), (2.6, 2.6, 0.16), bev=0.03)
for sx in (-1, 1):
    for sy in (-1, 1):
        Lf.box('wood', (sx * 1.1, sy * 1.1, 0.16 + LH / 2), (0.24, 0.24, LH), bev=0.025)
        Lf.box('wood_dark', (sx * 1.1, sy * 0.55, 2.4), (0.12, 1.0, 0.12), rot=(sy * 0.9, 0, 0), bev=0.015)
for sy in (-1, 1):
    Lf.box('wood_dark', (0, sy * 1.1, LH + 0.1), (2.5, 0.22, 0.22), bev=0.02)
for sx in (-1, 1):
    Lf.box('wood_dark', (sx * 1.1, 0, LH + 0.1), (0.22, 2.5, 0.22), bev=0.02)
    Lf.box('wood_dark', (sx * 0.3, 0, LH + 0.45), (0.14, 0.4, 0.6), bev=0.015)
# фонарь над входом
Lf.box('iron', (0, -1.25, LH - 0.2), (0.05, 0.35, 0.05))
Lf.merge(make_lantern(), c=(0, -1.42, LH - 0.72))
# колесо (крутится вокруг X)
WZ2 = LH + 0.75
wl = ml.sub('wheel', (0, 0, WZ2))
wl.torus('iron', (0, 0, WZ2), 0.55, 0.045, seg=18, mseg=4, rot=(0, math.pi / 2, 0))
for k in range(3):
    wl.box('iron', (0, 0, WZ2), (0.04, 0.04, 1.06), rot=(k * math.pi / 3, 0, 0))
wl.cyl('brass', (-0.1, 0, WZ2), 0.09, 0.2, seg=8, rot=(0, math.pi / 2, 0))
Lf.tube('iron', [(0, 0.55, WZ2), (0, 0.55, 2.6)], 0.018, seg=4, caps=('flat', 'flat'))
# клеть — отдельная часть: едет вниз
cage = ml.sub('cage', (0, 0, 0.16))
CW, CH = 0.85, 2.2
cage.box('iron', (0, 0, 0.2), (CW * 2, CW * 2, 0.06))
cage.box('wood', (0, 0, 0.24), (CW * 2 - 0.1, CW * 2 - 0.1, 0.04))
cage.box('iron', (0, 0, 0.16 + CH), (CW * 2, CW * 2, 0.06))
for sx in (-1, 1):
    for sy in (-1, 1):
        cage.box('iron', (sx * CW, sy * CW, 0.16 + CH / 2), (0.06, 0.06, CH))
for i in range(5):
    t = -CW + (i + 1) * (2 * CW) / 6
    for sx in (-1, 1):
        cage.box('iron', (sx * CW, t, 0.16 + CH / 2), (0.025, 0.025, CH))
    cage.box('iron', (t, CW, 0.16 + CH / 2), (0.025, 0.025, CH))
for sy in (-1, 1):
    cage.box('iron', (0, sy * CW, 0.16 + CH * 0.5), (CW * 2, 0.04, 0.04))
for sx in (-1, 1):
    cage.box('iron', (sx * CW, 0, 0.16 + CH * 0.5), (0.04, CW * 2, 0.04))
cage.box('iron', (0, 0, 0.16 + CH + 0.25), (0.06, 0.06, 0.5))
cage.chain('iron', [(0, 0, 0.16 + CH + 0.5), (0, 0.3, 0.16 + CH + 0.9), (0, 0.55, 0.16 + CH + 1.1)], L=0.14, W=0.08,
           wire=0.015, seg=5)


def lift_ride(f):
    d = ramp(f, 0, 18)
    u = ramp(f, 22, 36)
    z = -2.6 * d + 2.6 * u
    return {'mine_lift_cage': {'loc': (0, 0, z)}, 'mine_lift_wheel': {'rot': (6.0 * d - 6.0 * u, 0, 0)}}


props = [lp, pk, mt, bt, bf, fg, ml]
info = build_kit(props, row_w=14.0, gap=1.4)
objs = {o.name: o for o in kit_objects()}
acts = [bake(objs, 'trampoline_bounce', 16, trampoline_bounce), bake(objs, 'trap_snap', 8, trap_snap),
        bake(objs, 'bell_ring', 48, bell_ring, step=2), bake(objs, 'lift_ride', 36, lift_ride, step=2),
        bake(objs, 'keg_fuse', 12, keg_fuse)]
ARGS = script_args()
finish(KID, info, acts, props=props,
       debug_dir=('/private/tmp/claude-501/-Users-tired-Desktop/185f8636-5e7b-49ee-b06d-79b2e9d6d697/scratchpad/dbg/' + KID) if 'dbg' in ARGS else None)
