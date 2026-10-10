# plaza_entrance — вход в «Подземелье» на солнечной площади: plaza_cave_entrance и plaza_records_board.
# Скала светлого тёплого камня (стиль площади, концепт 7-entrance), темнота только внутри зева.
# Зев смотрит вперёд (−Y). Порог зева поднят на 0,45 м (три ступени с площади), внутри ступени и наклонные
# рельсы уходят вниз в темноту — всё выше z=0, пол площади ничего не перекрывает.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_b.py').read())

KID = 'plaza_entrance'
clean_scene()

cave = Prop('plaza_cave_entrance', sharp=34.0)
R = cave.root

YF, YB = -2.75, -2.15   # перед и зад арки
ZT = 0.45               # порог
ZS = ZT + 1.2           # пята арки
RI, RO = 1.3, 1.85      # радиусы арки (проём 2,6 × 2,5 м)

# ---------------------------------------------------------------- тоннель (внутри тёмный)
ST = [(-2.2, 1.3, ZS), (-1.3, 1.27, 1.55), (-0.4, 1.2, 1.32), (0.4, 1.12, 1.02), (1.1, 1.05, 0.72)]
INNER_MATS = ['stone_dark', 'void', 'void', 'void']


def tunnel_ring(y, w, zs, grow=0.0, n=9):
    pts = [Vector((-(w + grow), y, 0.0)), Vector((-(w + grow), y, zs))]
    for i in range(1, n):
        a = math.pi - math.pi * i / n
        pts.append(Vector(((w + grow) * math.cos(a), y, zs + (w + grow) * 0.92 * math.sin(a))))
    pts += [Vector(((w + grow), y, zs)), Vector(((w + grow), y, 0.0))]
    return pts


def orient(faces, inward):
    for f in faces:
        f.normal_update()
        c = f.calc_center_median()
        ax = Vector((0, c.y, 0.9))
        d = (ax - c)
        if (f.normal.dot(d) < 0) == inward:
            f.normal_flip()


bm = R.bm
inner = [[bm.verts.new(p) for p in tunnel_ring(y, w, zs)] for (y, w, zs) in ST]
outer = [[bm.verts.new(p) for p in tunnel_ring(y, w, zs, grow=0.35)] for (y, w, zs) in ST]
for i in range(len(ST) - 1):
    fs = R._loft([inner[i], inner[i + 1]], INNER_MATS[i], closed=False, recalc=False)
    orient(fs, True)
    fs = R._loft([outer[i], outer[i + 1]], 'plaza_stone_warm', closed=False, recalc=False)
    orient(fs, False)
fs = R._loft([inner[0], outer[0]], 'plaza_stone_warm', closed=False, recalc=False)
for f in fs:
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
back_c = bm.verts.new(Vector((0, ST[-1][0], 0.6)))
fs = R._loft([inner[-1], [back_c]], 'void', closed=False, recalc=False)
for f in fs:
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
back_o = bm.verts.new(Vector((0, ST[-1][0] + 0.02, 0.6)))
fs = R._loft([outer[-1], [back_o]], 'plaza_stone_warm', closed=False, recalc=False)
for f in fs:
    f.normal_update()
    if f.normal.y < 0:
        f.normal_flip()

# ---------------------------------------------------------------- порог, ступени, наклон с рельсами
for sx in (-1, 1):
    R.box('plaza_stone_warm', (sx * 1.68, (YF + YB) / 2 - 0.02, ZT / 2), (0.75, 0.72, ZT), bev=0.03)  # цоколь под пятами арки
R.box('plaza_stone', (0, -2.97, ZT / 2), (3.3, 0.46, ZT), bev=0.035)                                # площадка снаружи
R.box('stone_wall', (0, -2.27, ZT / 2 - 0.005), (2.62, 0.96, ZT - 0.01), bev=0.02)                     # порог под аркой — в тени
R.box('plaza_stone', (0, -3.35, 0.15), (3.3, 0.3, 0.3), bev=0.03)                                  # ступень 2
R.box('plaza_stone_warm', (0, -3.65, 0.075), (3.4, 0.3, 0.15), bev=0.03)                           # ступень 1
# внутри: левая половина — ступени вниз, правая — наклон с рельсами
R.box('stone_dark', (-0.6, -1.5, 0.3 / 2 + 0.0), (1.3, 0.6, 0.3), bev=0.02)
R.box('void', (-0.6, -0.9, 0.15 / 2), (1.3, 0.6, 0.15), bev=0.02)
R.box('void', (0, 0.35, 0.01), (2.3, 1.6, 0.02))
R.hexa('void', [(0.05, -1.8, 0.0), (1.27, -1.8, 0.0), (1.27, 0.6, 0.0), (0.05, 0.6, 0.0),
                      (0.05, -1.8, ZT), (1.27, -1.8, ZT), (1.27, 0.6, 0.02), (0.05, 0.6, 0.02)])
R.merge(make_rails([(0.66, -3.1, ZT), (0.66, -1.8, ZT), (0.66, -0.6, 0.22), (0.66, 0.6, 0.02), (0.66, 1.0, 0.02)],
                   gauge=0.6, step=0.55, sl_bev=0.0))
# упор в конце рельсов
R.box('wood', (0.66, -3.12, ZT + 0.16), (0.95, 0.16, 0.16), bev=0.02)
R.box('iron', (0.66, -3.21, ZT + 0.16), (0.5, 0.02, 0.1))
for sx in (-1, 1):
    R.box('wood_dark', (0.66 + sx * 0.3, -3.02, ZT + 0.1), (0.1, 0.36, 0.1), rot=(0.5, 0, 0), bev=0.015)

# ---------------------------------------------------------------- арка из клинчатых камней
for sx in (-1, 1):
    for k, (z0, z1) in enumerate(((ZT, ZT + 0.62), (ZT + 0.62, ZS))):
        R.box('plaza_stone', (sx * (RI + RO) / 2, (YF + YB) / 2, (z0 + z1) / 2), (RO - RI - 0.02, YB - YF, z1 - z0 - 0.02),
              bev=0.035)
NV = 9
for i in range(NV):
    a0 = math.pi * i / NV + 0.012
    a1 = math.pi * (i + 1) / NV - 0.012
    ro = RO + (0.18 if i == NV // 2 else 0.0)
    yf = YF - (0.08 if i == NV // 2 else 0.0)
    cs = []
    for y in (yf, YB):
        cs += [(RI * math.cos(a0), y, ZS + RI * math.sin(a0)), (ro * math.cos(a0), y, ZS + ro * math.sin(a0)),
               (ro * math.cos(a1), y, ZS + ro * math.sin(a1)), (RI * math.cos(a1), y, ZS + RI * math.sin(a1))]
    R.hexa('plaza_stone' if i % 2 == 0 else 'plaza_stone_warm', cs, bev=0.035)

# ---------------------------------------------------------------- скала из глыб
BOULDERS = [
    # (x, y, z, sx, sy, sz, seed, mat)
    (-2.05, -1.75, 0, 0.85, 0.95, 1.75, 1, 'plaza_stone'),
    (-2.2, -0.2, 0, 0.95, 1.2, 2.3, 2, 'plaza_stone_warm'),
    (-1.85, 1.35, 0, 1.05, 1.05, 2.0, 3, 'plaza_stone'),
    (2.05, -1.7, 0, 0.85, 0.95, 1.9, 4, 'plaza_stone_warm'),
    (2.2, -0.1, 0, 1.0, 1.2, 2.2, 5, 'plaza_stone'),
    (1.8, 1.4, 0, 1.05, 1.0, 1.85, 6, 'plaza_stone_warm'),
    (-0.6, 2.05, 0, 1.2, 0.75, 2.1, 7, 'plaza_stone_warm'),
    (0.75, 2.0, 0, 1.15, 0.8, 2.4, 8, 'plaza_stone'),
    (0.0, -0.1, 2.85, 2.05, 1.95, 1.35, 9, 'plaza_stone'),
    (-0.9, 0.85, 2.9, 1.25, 1.05, 1.2, 10, 'plaza_stone_warm'),
    (0.7, 0.55, 3.1, 1.1, 1.0, 1.4, 11, 'plaza_stone'),
    (-1.6, -1.85, 2.45, 0.95, 0.65, 1.0, 12, 'plaza_stone_warm'),
    (1.65, -1.8, 2.35, 0.95, 0.65, 1.0, 13, 'plaza_stone'),
    (-0.1, -1.55, 3.45, 1.0, 0.7, 0.55, 14, 'plaza_stone_warm'),
    # мелкие глыбы у подножия — рваный силуэт
    (-2.75, -1.0, 0, 0.55, 0.6, 0.7, 15, 'plaza_stone'),
    (-2.6, 1.0, 0, 0.6, 0.55, 0.9, 16, 'plaza_stone_warm'),
    (2.75, -0.9, 0, 0.5, 0.55, 0.8, 17, 'plaza_stone_warm'),
    (2.55, 1.2, 0, 0.6, 0.6, 0.7, 18, 'plaza_stone'),
    (-1.3, 2.6, 0, 0.6, 0.5, 0.8, 19, 'plaza_stone'),
    (1.5, 2.55, 0, 0.55, 0.5, 0.65, 20, 'plaza_stone_warm'),
    # гребень
    (-0.4, 0.75, 3.5, 0.95, 0.85, 1.35, 21, 'plaza_stone'),
]
for (x, y, z, sx, sy, sz, sd, mk) in BOULDERS:
    R.rock(mk, (x, y, z), (sx, sy, sz), seed=sd * 1.37, sub=2, rough=0.3, floor=(2.85 if z > 0 else 0.0), squash_top=0.55)

# плющ и мох поверх глыб, кремовые цветы
IVY = [(-1.2, -2.0, 3.0, 0.55), (1.3, -2.1, 3.0, 0.5), (0.2, -1.4, 3.75, 0.5), (-2.4, -1.4, 1.6, 0.45),
       (2.45, -1.2, 1.4, 0.4), (-0.6, 0.6, 3.9, 0.7), (0.9, 0.3, 4.1, 0.55), (-2.6, 0.4, 0.6, 0.45),
       (2.7, 0.8, 0.5, 0.4), (-0.3, 2.6, 1.0, 0.5)]
for i, (x, y, z, r) in enumerate(IVY):
    R.splat((x, y, z), r, th=0.06, seg=10, rings=2, key='moss', seed=i * 1.9, wob=0.4)
for i, (x, y, z, r) in enumerate(IVY[:7]):
    for j in range(3):
        a = j * 2.3 + i
        R.ellipsoid('mush_cap', (x + 0.22 * math.cos(a), y + 0.12 * math.sin(a), z + 0.06), (0.05, 0.05, 0.03),
                    seg=5, rings=2)
# свисающие плети плюща по бокам арки
for sx, ln in ((-1, 1.0), (1, 0.8), (-1, 0.6)):
    x0 = sx * (RO + 0.05 + 0.1 * (ln < 0.7))
    R.tube('moss', [(x0, YF - 0.04, ZS + 0.9), (x0 + sx * 0.06, YF - 0.08, ZS + 0.9 - ln * 0.5),
                    (x0, YF - 0.07, ZS + 0.9 - ln)], [0.05, 0.04, 0.03], seg=5, n=4)

# ---------------------------------------------------------------- перемычка, вывеска, фонари
R.box('wood', (0, YF + 0.02, ZS + RO + 0.42), (3.7, 0.26, 0.28), bev=0.03,
      fn=lambda p: p + Vector((0, 0, 0.015 * math.sin(p.x * 2.1))))
for sx in (-1, 1):
    R.box('iron', (sx * 1.5, YF - 0.115, ZS + RO + 0.42), (0.1, 0.02, 0.32))
    R.ellipsoid('iron', (sx * 1.5, YF - 0.13, ZS + RO + 0.42), 0.03, seg=6, rings=3)
# вывеска: доска на перемычке, наклон назад для взгляда сверху
SIGN_ROT = -0.55
SC = Vector((0, YF - 0.14, ZS + RO + 0.8))


def srot(p):
    return SC + Euler((SIGN_ROT, 0, 0)).to_matrix() @ (Vector(p))


R.box('wood_dark', SC, (2.1, 0.08, 0.66), rot=(SIGN_ROT, 0, 0), bev=0.025)
for sx in (-1, 1):
    R.tube('iron', [srot((sx * 0.8, 0.0, 0.3)), srot((sx * 0.8, 0.12, 0.5)), (sx * 0.8, YF - 0.06, ZS + RO + 0.56)],
           0.012, seg=4, caps=('flat', 'flat'))
sign = cave.sub('sign', SC)
sw_, sh_ = 1.9, 0.5
c0 = srot((-sw_ / 2, -0.06, -sh_ / 2))
c1 = srot((sw_ / 2, -0.06, -sh_ / 2))
c2 = srot((sw_ / 2, -0.06, sh_ / 2))
c3 = srot((-sw_ / 2, -0.06, sh_ / 2))
sign.quad('board_face', [c0, c1, c2, c3])
sign.uv = (tuple(c0), tuple((c1 - c0).normalized()), tuple((c3 - c0).normalized()), sw_, sh_)
# фонари на кронштейнах
for sx in (-1, 1):
    x = sx * 2.1
    R.box('iron', (x, YF - 0.12, 2.75), (0.05, 0.62, 0.05))
    R.tube('iron', [(x, YF + 0.1, 2.45), (x, YF - 0.12, 2.6), (x, YF - 0.36, 2.74)], 0.018, seg=4, caps=('flat', 'flat'))
    R.box('iron', (x, YF + 0.2, 2.6), (0.12, 0.06, 0.4), bev=0.01)
    R.tube('iron', [(x, YF - 0.4, 2.75), (x, YF - 0.4, 2.62)], 0.008, seg=4, caps=('flat', 'flat'))
    R.merge(make_lantern(), c=(x, YF - 0.4, 2.14))

# ---------------------------------------------------------------- распахнутые створки (как на концепте)
DOOR_W, DOOR_H, PHI = 1.2, 2.0, math.radians(38)
for sx in (-1, 1):
    hinge = Vector((sx * (RI - 0.02), YF - 0.05, ZT + 0.03))
    d = Vector((sx * math.sin(PHI), -math.cos(PHI), 0))      # вдоль створки от петли
    yaw = math.atan2(d.y, d.x)
    for k in range(4):
        t = (k + 0.5) / 4
        c = hinge + d * (DOOR_W * t) + Vector((0, 0, DOOR_H / 2))
        R.box('wood' if k % 2 else 'wood_dark', c, (DOOR_W / 4 - 0.01, 0.06, DOOR_H), rot=(0, 0, yaw), bev=0.012)
    for z in (0.35, DOOR_H - 0.35):
        c = hinge + d * (DOOR_W * 0.5) + Vector((0, 0, z))
        n = Vector((-d.y, d.x, 0)) * (0.04 * (-sx))
        R.box('iron', c + n, (DOOR_W * 0.92, 0.02, 0.08), rot=(0, 0, yaw))
        R.box('iron', hinge + Vector((0, 0, z)), (0.08, 0.08, 0.14))
    ring_c = hinge + d * (DOOR_W * 0.82) + Vector((0, 0, DOOR_H * 0.5)) + Vector((-d.y, d.x, 0)) * (0.06 * (-sx))
    R.torus('iron', ring_c, 0.07, 0.012, seg=8, mseg=3, rot=(math.pi / 2, 0, yaw))

# ---------------------------------------------------------------- вагонетка, бочка, варенье
R.merge(make_minecart(ore=False), c=(2.85, -3.95, 0.39), rot=(0.0, 1.62, -1.25))
for i, (x, y) in enumerate(((2.5, -4.75), (2.9, -4.9), (3.25, -4.7), (2.25, -4.5), (2.65, -5.1))):
    R.rock('stone_wall', (x, y, 0), (0.17, 0.15, 0.12), seed=i * 2.7, sub=1)
R.rock('brass', (2.8, -4.7, 0.0), (0.08, 0.07, 0.07), seed=4.4, sub=1)
R.merge(make_barrel(h=0.95, r=0.34), c=(-2.25, -2.95, 0.0))
R.drip((-2.05, -3.18, 0.9), 0.35, 0.03, key='jam', seg=6)
R.drip((-2.3, -3.27, 0.92), 0.22, 0.025, key='jam', seg=6)
R.puddle((-2.0, -3.4, 0.0), 0.26, th=0.025, seg=10, seed=0.5)
for (x, z, ln) in ((-1.62, 1.1, 0.22), (1.6, 1.25, 0.3)):
    R.drip((x, YF - 0.03, z), ln, 0.03, key='jam', seg=6)
R.splat((-1.62, YF - 0.05, 1.15), 0.1, th=0.02, seg=8, rings=2, key='jam', seed=1.0)
R.splat((1.6, YF - 0.05, 1.3), 0.12, th=0.02, seg=8, rings=2, key='jam', seed=2.0)
R.puddle((-0.55, -2.95, ZT), 0.3, th=0.02, seg=10, seed=2.2, stretch=(1.3, 0.8))
R.puddle((0.3, -3.65, 0.3), 0.13, th=0.015, seg=8, seed=3.3)
# слабое сиреневое свечение в глубине и пара глаз
R.puddle((-0.35, 0.55, 0.02), 0.42, th=0.012, seg=10, key='glow_jam', seed=4.0, wob=0.4)
R.drip((0.9, 0.2, 1.75), 0.45, 0.025, key='glow_jam', seg=5)
eyes = cave.sub('eyes', (-0.3, 0.95, 0.42))
for sx in (-1, 1):
    eyes.ellipsoid('glow_jam', (-0.3 + sx * 0.075, 0.95, 0.42), (0.04, 0.02, 0.028), seg=6, rings=3, rot=(0, 0, 0))


def cave_eyes_blink(f):
    k = env(f, 0, 2, 3, 6) + env(f, 9, 11, 12, 15)
    return {'plaza_cave_entrance_eyes': {'scale': (1.0, 1.0, max(0.08, 1 - 0.92 * min(k, 1)))}}


# ================================================================ доска рекордов
board = Prop('plaza_records_board')
B = board.root
PW, PH, PZ = 2.4, 1.8, 1.0
for sx in (-1, 1):
    x = sx * 1.21
    B.box('plaza_stone_warm', (x, 0.08, 0.14), (0.5, 0.5, 0.28), bev=0.04)
    B.box('plaza_stone', (x, 0.08, 0.28 + 1.33), (0.32, 0.32, 2.66), bev=0.03, taper=(0.92, 0.92))
    B.box('plaza_stone_warm', (x, 0.08, 3.0), (0.44, 0.44, 0.12), bev=0.03)
    B.lathe('plaza_stone', [(0.17, 3.06), (0.15, 3.12), (0.0, 3.22)], seg=4, c=(x, 0.08, 0), phase=math.pi / 4)
# плита и рамка
B.box('plaza_stone', (0, 0.0, PZ + PH / 2), (PW, 0.16, PH), bev=0.03)
FY = -0.08 - 0.03
for (cx, cz, w, h) in ((0, PZ + 0.06, PW, 0.12), (0, PZ + PH - 0.06, PW, 0.12), (-PW / 2 + 0.06, PZ + PH / 2, 0.12, PH - 0.24),
                       (PW / 2 - 0.06, PZ + PH / 2, 0.12, PH - 0.24)):
    B.box('plaza_stone_warm', (cx, FY, cz), (w, 0.06, h), bev=0.015)
B.box('plaza_stone_warm', (0, 0.0, PZ + PH + 0.07), (PW + 0.2, 0.3, 0.14), bev=0.03)
B.prism('plaza_stone', [(-0.15, 0), (0.15, 0), (0.0, 0.22)], -PW / 2 - 0.05, PW / 2 + 0.05, c=(0, 0.0, PZ + PH + 0.14))
B.box('plaza_stone_warm', (0, -0.02, PZ - 0.08), (PW - 0.1, 0.2, 0.16), bev=0.03)
for sx in (-1, 1):
    for z in (PZ + 0.06, PZ + PH - 0.06):
        B.ellipsoid('brass', (sx * (PW / 2 - 0.06), FY - 0.035, z), (0.045, 0.02, 0.045), seg=6, rings=3)
B.ellipsoid('brass', (0, FY - 0.03, PZ + PH + 0.2), (0.11, 0.03, 0.08), seg=8, rings=3)
B.splat((-1.25, 0.1, 0.3), 0.3, th=0.04, seg=8, rings=2, key='moss', seed=1.1)
B.splat((1.2, -0.15, 0.25), 0.22, th=0.04, seg=8, rings=2, key='moss', seed=2.4)
# лицевая сторона — ровная плоскость отдельным объектом, текст рисует игра
face = board.sub('board_face', (0, FY + 0.01, PZ), exact=True)
fw, fh = PW - 0.24, PH - 0.24
fy = FY - 0.015   # 1,5 см перед камнем внутри рамки
f0 = (-fw / 2, fy, PZ + 0.12)
face.quad('board_face', [f0, (fw / 2, fy, PZ + 0.12), (fw / 2, fy, PZ + 0.12 + fh), (-fw / 2, fy, PZ + 0.12 + fh)])
face.uv = (f0, (1, 0, 0), (0, 0, 1), fw, fh)

props = [cave, board]
info = build_kit(props, row_w=12.0, gap=1.5)
objs = {o.name: o for o in kit_objects()}
acts = [bake(objs, 'cave_eyes_blink', 16, cave_eyes_blink)]
ARGS = script_args()
finish(KID, info, acts, views=(('', 25, 32), ('-top', 0, 62)), day=True, floor_hex='#C8B48F', props=props, debug_dir=('/private/tmp/claude-501/-Users-tired-Desktop/185f8636-5e7b-49ee-b06d-79b2e9d6d697/scratchpad/dbg/' + KID) if 'dbg' in ARGS else None)
