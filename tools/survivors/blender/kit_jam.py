# kit_jam — Варенные жилы: jam_vat_a/b (бродильные чаны), jam_cauldron (Котёл Барона с помостом и трубами),
# jam_rock_a/b, jam_puddle_rim (кромка лужи r=1 м под масштаб), jam_beams (ворота перехода с потёками).
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_b.py').read())

KID = 'kit_jam'
clean_scene()


def polar(r, a, z=0.0):
    return Vector((r * math.cos(a), r * math.sin(a), z))


def bubbles(P, c, R, n, z, seed=0.0, rmin=0.06, rmax=0.16):
    for i in range(n):
        a = i * 2.39996 + seed
        rr = R * math.sqrt((i + 0.5) / n)
        s = rmin + (rmax - rmin) * (0.5 + 0.5 * noise.noise(Vector((i * 0.7, seed, 0.3))))
        P.dome('glow_jam' if i % 2 == 0 else 'jam', (c[0] + rr * math.cos(a), c[1] + rr * math.sin(a), z), (s, s, s * 0.7),
               seg=7, rings=2)


def jam_surface(P, c, r, z, seg=20, seed=0.0):
    prof = []
    for i, u in enumerate((0.0, 0.45, 0.8, 1.0)):
        prof.append((r * u, z + 0.02 * (1 - u)))
    P.lathe('jam', prof, seg=seg, c=c,
            fn=lambda p: p + Vector((0, 0, 0.025 * noise.noise(Vector((p.x * 2, p.y * 2, seed))))))


# ================================================================ jam_vat_a — деревянный чан
va = Prop('jam_vat_a')
A = va.root
RB, RT, H = 1.12, 1.0, 1.3
A.lathe('wood', [(RB, 0.0), (RB + 0.02, 0.35), (RB - 0.04, H * 0.75), (RT, H), (RT - 0.08, H), (RT - 0.1, H - 0.2)],
        seg=20)
for z, rr in ((0.12, RB + 0.03), (0.62, RB + 0.0), (H - 0.12, RT + 0.03)):
    A.lathe('iron', [(rr, z - 0.05), (rr + 0.015, z - 0.04), (rr + 0.015, z + 0.04), (rr, z + 0.05)], seg=20)
jam_surface(A, (0, 0, 0), RT - 0.09, H - 0.1, seed=1.0)
bubbles(A, (0, 0), 0.6, 5, H - 0.08, seed=0.4)
for i, (a, ln) in enumerate(((-1.4, 0.7), (-1.9, 1.05), (-0.9, 0.5), (0.6, 0.85), (2.4, 0.6))):
    p = polar(RT + 0.015, a, H)
    lean = polar(0.12, a, 0)
    A.drip(p, ln, 0.045, key='jam', seg=6, lean=lean)
A.puddle(polar(1.45, -1.7), 0.55, th=0.03, seg=12, seed=2.0, stretch=(1.2, 0.8))
A.puddle(polar(1.25, 0.6), 0.3, th=0.025, seg=10, seed=3.0)
A.ellipsoid('glow_jam', polar(1.5, -1.6, 0.025), (0.08, 0.06, 0.025), seg=6, rings=3)
# весло в чане
A.tube('wood_dark', [(0.25, 0.2, H - 0.3), (0.55, 0.45, H + 0.5), (0.75, 0.6, H + 1.0)], 0.035, seg=6, caps=('flat', 'round'))
A.box('wood_dark', (0.18, 0.15, H - 0.2), (0.2, 0.05, 0.35), rot=(0.4, 0, 0.8), bev=0.01)
# ступенька-подставка
A.box('wood_dark', (-1.0, 0.75, 0.22), (0.7, 0.45, 0.44), rot=(0, 0, 0.6), bev=0.03)

# ================================================================ jam_vat_b — каменный чан, переливается
vb = Prop('jam_vat_b')
B = vb.root
NB = 11
for i in range(NB):
    a = TAU * i / NB
    c = polar(1.0, a)
    h = 0.85 + 0.08 * math.sin(i * 2.1)
    B.box('stone_wall' if i % 2 else 'stone_floor', (c.x, c.y, h / 2), (0.62, 0.38, h), rot=(0, 0, a + math.pi / 2),
          bev=0.05, taper=(0.95, 0.9))
B.lathe('stone_dark', [(0.82, 0.8), (0.0, 0.8)], seg=16)
jam_surface(B, (0, 0, 0), 0.86, 0.8, seg=16, seed=4.0)
bubbles(B, (0, 0), 0.55, 4, 0.82, seed=1.7)
# перелив через край спереди и река-лужа
for x, ln in ((-0.15, 0.8), (0.12, 0.85), (0.35, 0.7)):
    B.drip((x, -1.2, 0.9), ln, 0.06, key='jam', seg=6, lean=(0, -0.08, 0))
B.tube('jam', [(0, -0.9, 0.86), (0, -1.15, 0.9), (0, -1.25, 0.55), (0.05, -1.3, 0.1)], [(0.22, 0.05)] * 4, seg=6,
       caps=('round', 'round'), up=(0, -1, 0))
B.puddle((0.1, -1.75, 0), 0.7, th=0.035, seg=14, seed=5.0, stretch=(1.1, 0.75))
B.puddle((-0.6, -2.25, 0), 0.3, th=0.025, seg=10, seed=6.0)
B.ellipsoid('glow_jam', (0.3, -1.8, 0.03), (0.1, 0.07, 0.03), seg=6, rings=3)
B.ellipsoid('glow_jam', (-0.2, -1.6, 0.03), (0.06, 0.05, 0.025), seg=6, rings=3)
B.drip((0.9, 0.5, 0.9), 0.5, 0.04, key='jam', seg=6, lean=(0.06, 0.03, 0))

# ================================================================ jam_cauldron — Котёл Барона
cz = Prop('jam_cauldron')
C = cz.root
oct8 = math.pi / 8
# помост — восьмигранник в два яруса
C.lathe('stone_wall', [(3.5, 0.0), (3.5, 0.24), (3.42, 0.3), (2.9, 0.3)], seg=8, phase=oct8)
C.lathe('stone_floor', [(2.9, 0.3), (2.85, 0.3), (2.85, 0.55), (2.78, 0.6), (0.0, 0.6)], seg=8, phase=oct8)
# ступени спереди
C.box('stone_floor', (0, -3.42, 0.075), (1.9, 0.42, 0.15), bev=0.03)
C.box('stone_floor', (0, -2.82, 0.375), (1.7, 0.42, 0.15), bev=0.03)
# котёл
Z0 = 0.6
prof = [(0.0, Z0 + 0.35), (0.7, Z0 + 0.38), (1.35, Z0 + 0.6), (1.75, Z0 + 1.05), (1.88, Z0 + 1.55), (1.82, Z0 + 2.0),
        (1.72, Z0 + 2.2), (1.9, Z0 + 2.32), (1.92, Z0 + 2.42), (1.78, Z0 + 2.44), (1.62, Z0 + 2.3)]
C.lathe('iron', prof, seg=24)
for z, rr in ((Z0 + 1.0, 1.72), (Z0 + 1.85, 1.86)):
    C.lathe('brass', [(rr, z - 0.07), (rr + 0.03, z - 0.05), (rr + 0.03, z + 0.05), (rr, z + 0.07)], seg=24)
for i in range(4):
    a = oct8 + i * math.pi / 2
    d = polar(1, a)
    C.tube('iron', [d * 1.05 + Vector((0, 0, Z0 + 0.55)), d * 1.4 + Vector((0, 0, Z0 + 0.25)), d * 1.45 + Vector((0, 0, Z0))],
           [0.14, 0.12, 0.16], seg=6, caps=('flat', 'flat'))
    C.box('iron', d * 1.47 + Vector((0, 0, Z0 + 0.04)), (0.36, 0.36, 0.08), rot=(0, 0, a), bev=0.02)
for sx in (-1, 1):
    C.torus('iron', (sx * 1.98, 0, Z0 + 1.95), 0.28, 0.05, seg=12, mseg=4, rot=(math.pi / 2, 0, math.pi / 2))
# огонь под котлом
for i in range(3):
    a = i * TAU / 3 + 0.4
    p = polar(0.75, a, Z0)
    C.cyl('wood_dark', p + polar(-0.45, a + 1.2, 0.08), 0.08, 0.95, seg=6, rot=(0, math.pi / 2, a + 1.2))
for i in range(6):
    a = i * TAU / 6
    C.ellipsoid('glow_fire' if i % 2 else 'stone_dark', polar(0.95, a, Z0 + 0.05), (0.14, 0.11, 0.08), seg=5, rings=3)
for i in range(4):
    a = i * TAU / 4 + 0.3
    C.flame(polar(1.25 if i % 2 else 1.1, a, Z0), 0.55, 0.2, seed=i * 1.3, tongues=1, seg=6)
for i in range(4):
    a = 3 * math.pi / 8 + i * math.pi / 2
    C.flame(polar(1.75, a, Z0), 0.5, 0.16, seed=i * 2.1 + 0.5, tongues=1, seg=6)
    C.ellipsoid('glow_fire', polar(1.85, a + 0.15, Z0 + 0.04), (0.12, 0.1, 0.06), seg=5, rings=3)
    C.ellipsoid('stone_dark', polar(1.9, a - 0.2, Z0 + 0.04), (0.12, 0.1, 0.07), seg=5, rings=3)
# варенье внутри, пузыри, переливы через край
jam_surface(C, (0, 0, 0), 1.66, Z0 + 2.25, seg=24, seed=7.0)
bubbles(C, (0, 0), 1.25, 9, Z0 + 2.26, seed=2.2, rmin=0.1, rmax=0.26)
for i, (a, ln) in enumerate(((-1.3, 0.55), (-1.75, 0.35), (-0.6, 0.7), (0.4, 0.4), (1.6, 0.6), (2.6, 0.45), (3.6, 0.65),
                             (-2.4, 0.3))):
    p = polar(1.95, a, Z0 + 2.38)
    C.drip(p, ln, 0.075, key='jam', seg=6, lean=polar(-0.04, a))
    C.splat(polar(1.9, a, Z0 + 2.05), 0.16, th=0.03, seg=8, rings=2, key='jam', seed=i * 0.9, stretch=(0.7, 1.4))
C.splat(polar(1.7, -1.3, Z0 + 1.0), 0.35, th=0.03, seg=10, rings=2, key='jam', seed=1.0)
C.splat(polar(1.8, 1.6, Z0 + 1.3), 0.3, th=0.03, seg=10, rings=2, key='jam', seed=2.0)
# мешалка
C.tube('wood', [(0.4, -0.3, Z0 + 1.6), (0.9, -0.9, Z0 + 3.0), (1.15, -1.25, Z0 + 3.9)], 0.06, seg=6,
       caps=('flat', 'round'))
C.box('wood', (0.3, -0.22, Z0 + 1.9), (0.4, 0.08, 0.6), rot=(0.5, 0, 0.6), bev=0.02)
# журавль с мешалкой над котлом
C.box('wood_dark', (2.45, 1.75, 0.6 + 2.0), (0.28, 0.28, 4.0), bev=0.03)
C.box('wood_dark', (2.45, 1.75, 0.6 + 0.12), (0.6, 0.6, 0.24), bev=0.03)
C.box('wood', (1.2, 0.85, 4.55), (3.3, 0.22, 0.22), rot=(0, 0, math.atan2(1.75, 2.45)), bev=0.03)
C.box('wood_dark', (2.0, 1.43, 3.9), (0.14, 0.14, 1.4), rot=(0.4, -0.55, 0), bev=0.02)
C.chain('iron', [(0.25, 0.18, 4.45), (0.2, 0.12, 3.6), (0.12, 0.05, 3.0)], L=0.14, W=0.08, wire=0.016, seg=5)
C.tube('wood', [(0.12, 0.05, 3.05), (0.05, 0.0, 2.4), (-0.05, -0.05, 1.7)], 0.07, seg=6, caps=('round', 'flat'))
C.box('iron', (0.12, 0.05, 3.05), (0.18, 0.18, 0.08))
# светящиеся трещины-жилы на помосте
for i, a in enumerate((0.5, 1.4, 2.5, 3.3, 4.5, 5.6)):
    p0 = polar(2.05, a, 0.602)
    p1 = polar(2.5, a + 0.12, 0.602)
    p2 = polar(2.82, a - 0.05, 0.602)
    for q0, q1 in ((p0, p1), (p1, p2)):
        m = (q0 + q1) / 2
        C.box('glow_jam', m, ((q1 - q0).length + 0.04, 0.05, 0.012), rot=(0, 0, math.atan2(q1.y - q0.y, q1.x - q0.x)))
# манометр на боку котла
C.cyl('brass', polar(1.86, -0.9, Z0 + 1.45), 0.13, 0.08, seg=10, rot=(math.pi / 2, 0, -0.9 + math.pi / 2))
# трубы: из котла через край помоста вниз в землю, латунные фланцы и вентили
PIPES = [(-0.4, 2.4, 1.0), (0.9, 2.3, 0.9), (2.6, 2.2, 1.1), (3.7, 2.3, 0.8)]
for i, (a, r_end, zz) in enumerate(PIPES):
    d = polar(1, a)
    pts = [d * 1.7 + Vector((0, 0, Z0 + zz)), d * 2.3 + Vector((0, 0, Z0 + zz + 0.15)), d * 3.0 + Vector((0, 0, Z0 + zz)),
           d * 3.6 + Vector((0, 0, 0.9)), d * 3.75 + Vector((0, 0, 0.3)), d * 3.8 + Vector((0, 0, -0.05))]
    C.tube('iron', pts, 0.13, seg=8, n=9, caps=('flat', 'flat'))
    for k, t in ((0, 1.85), (1, 3.3)):
        q = d * t + Vector((0, 0, Z0 + zz + (0.06 if k == 0 else -0.15)))
        C.lathe('brass', [(0.0, -0.06), (0.19, -0.06), (0.19, 0.06), (0.0, 0.06)], seg=8, c=q,
                rot=(math.pi / 2, 0, a - math.pi / 2))
    if i % 2 == 0:
        q = d * 2.3 + Vector((0, 0, Z0 + zz + 0.35))
        C.cyl('brass', d * 2.3 + Vector((0, 0, Z0 + zz + 0.1)), 0.04, 0.26, seg=6)
        C.torus('brass', q, 0.17, 0.025, seg=10, mseg=4)
        for k in range(2):
            C.box('brass', q, (0.34, 0.03, 0.03), rot=(0, 0, a + k * math.pi / 2))
    C.puddle(d * 4.25, 0.6, th=0.035, seg=12, seed=i * 1.7, stretch=(1.2, 0.8))
    C.ellipsoid('glow_jam', d * 4.3 + Vector((0, 0, 0.03)), (0.1, 0.08, 0.03), seg=6, rings=3)
# перила сзади помоста
for i in range(5):
    a = math.pi / 2 + (i - 2) * 0.42
    C.box('wood_dark', polar(3.15, a, 0.6 + 0.45), (0.1, 0.1, 0.9), bev=0.015)
for i in range(4):
    a0 = math.pi / 2 + (i - 2) * 0.42
    a1 = a0 + 0.42
    p0, p1 = polar(3.15, a0, 1.4), polar(3.15, a1, 1.4)
    m = (p0 + p1) / 2
    C.box('wood', m, ((p1 - p0).length + 0.1, 0.08, 0.08), rot=(0, 0, math.atan2(p1.y - p0.y, p1.x - p0.x)), bev=0.01)
# бочонки и камни вокруг
C.merge(make_barrel(h=0.8, r=0.3, seg=10), c=(-2.35, 1.2, 0.6))
C.merge(make_barrel(h=0.8, r=0.3, seg=10), c=(-1.85, 1.75, 0.6))
for i, (a, rr, s) in enumerate(((0.2, 3.7, 0.35), (1.3, 3.75, 0.3), (2.2, 3.7, 0.4), (4.1, 3.75, 0.3), (5.3, 3.7, 0.35))):
    C.rock('stone_wall', polar(rr, a), (s * 1.2, s, s * 0.8), seed=i * 1.9, sub=1)

# ================================================================ jam_rock_a / jam_rock_b
ra = Prop('jam_rock_a', sharp=34)
RA = ra.root
RA.rock('stone_wall', (0, 0, 0), (0.75, 0.62, 1.55), seed=3.3, sub=2, rough=0.26)
RA.rock('stone_wall', (0.55, -0.35, 0), (0.42, 0.38, 0.55), seed=5.1, sub=1)
for (x, y, z, r, sd) in ((0.05, -0.15, 1.45, 0.32, 1.0), (-0.3, -0.4, 0.9, 0.22, 2.0)):
    RA.splat((x, y, z), r, th=0.04, seg=10, rings=2, key='jam', seed=sd)
RA.splat((0.25, -0.45, 1.1), 0.12, th=0.025, seg=8, rings=2, key='glow_jam', seed=4.0, stretch=(0.5, 1.6))
for (x, y, z, ln) in ((-0.15, -0.55, 1.2, 0.5), (0.2, -0.52, 1.0, 0.65), (-0.45, -0.38, 0.75, 0.4)):
    RA.drip((x, y, z), ln, 0.04, key='jam', seg=6, lean=(0, -0.05, 0))
RA.puddle((0.0, -0.85, 0), 0.45, th=0.03, seg=12, seed=1.5, stretch=(1.3, 0.8))
RA.ellipsoid('glow_jam', (0.15, -0.9, 0.025), (0.07, 0.05, 0.022), seg=6, rings=3)

rb = Prop('jam_rock_b', sharp=34)
RBp = rb.root
RBp.rock('stone_wall', (0, 0, 0), (1.15, 0.85, 0.7), seed=7.7, sub=2, rough=0.24)
RBp.rock('stone_dark', (-0.85, 0.45, 0), (0.4, 0.35, 0.35), seed=8.8, sub=1)
RBp.splat((0.1, 0.0, 0.7), 0.45, th=0.045, seg=12, rings=2, key='jam', seed=3.0)
RBp.splat((0.45, -0.3, 0.55), 0.1, th=0.03, seg=8, rings=2, key='glow_jam', seed=5.0, stretch=(1.8, 0.5))
for (x, y, z, ln) in ((0.3, -0.62, 0.5, 0.4), (-0.25, -0.65, 0.48, 0.35), (0.85, -0.3, 0.4, 0.3)):
    RBp.drip((x, y, z), ln, 0.045, key='jam', seg=6, lean=(0, -0.04, 0))
RBp.puddle((0.1, -1.0, 0), 0.5, th=0.03, seg=12, seed=2.5, stretch=(1.4, 0.7))

# ================================================================ jam_puddle_rim — кромка лужи, r = 1 м (масштабировать)
pr = Prop('jam_puddle_rim')
PR = pr.root
bm = PR.bm
rings = []
SEG = 32
for j, (dr, dz) in enumerate(((-0.07, 0.012), (-0.02, 0.05), (0.04, 0.045), (0.09, 0.0))):
    ring = []
    for i in range(SEG):
        a = TAU * i / SEG
        w = 1.0 + 0.05 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, 0.5)))
        bump = 1.0 + 0.5 * max(0, noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, 1.5))))
        ring.append(bm.verts.new(((w + dr) * math.cos(a), (w + dr) * math.sin(a), dz * bump)))
    rings.append(ring)
fs = PR._loft(rings, 'jam', recalc=False)
for f in fs:
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
for i in range(7):
    a = i * 0.9 + 0.3
    PR.dome('jam', polar(1.02 + 0.03 * (i % 2), a, 0.0), (0.07, 0.06, 0.06), seg=6, rings=2)
for i in range(3):
    a = i * 2.2 + 1.0
    PR.ellipsoid('glow_jam', polar(0.98, a, 0.04), (0.04, 0.035, 0.02), seg=6, rings=2)
for i in range(2):
    a = i * 3.0 + 0.8
    PR.rock('stone_wall', polar(1.12, a), (0.12, 0.1, 0.08), seed=i * 4.1, sub=0)

# ================================================================ jam_beams — ворота перехода с потёками
gb = Prop('jam_beams')
G = gb.root
GW, GH = 2.7, 3.2
for sx in (-1, 1):
    G.box('wood_dark', (sx * GW, 0, GH / 2), (0.3, 0.3, GH), bev=0.03, fn=lambda p: p + Vector((0, 0, 0)))
    G.box('wood_dark', (sx * (GW - 0.55), 0, GH - 0.45), (0.16, 0.16, 1.2), rot=(0, sx * 0.8, 0), bev=0.02)
    G.rock('stone_wall', (sx * GW, 0, 0), (0.35, 0.3, 0.25), seed=sx * 2.2, sub=1)
G.box('wood', (0, 0, GH + 0.12), (GW * 2 + 0.6, 0.32, 0.32), bev=0.03,
      fn=lambda p: p + Vector((0, 0, -0.04 * math.cos(p.x * 0.6))))
G.splat((-0.8, 0, GH + 0.3), 0.5, th=0.05, seg=10, rings=2, key='jam', seed=1.0, stretch=(1.6, 0.6))
G.splat((1.3, 0, GH + 0.3), 0.4, th=0.05, seg=10, rings=2, key='jam', seed=2.0, stretch=(1.5, 0.6))
G.splat((GW, -0.15, GH - 0.3), 0.25, th=0.04, seg=8, rings=2, key='jam', seed=3.0)
for i, (x, ln) in enumerate(((-1.25, 0.9), (-0.85, 1.5), (-0.45, 0.6), (0.95, 1.2), (1.35, 0.7), (1.7, 1.8), (2.55, 1.1),
                             (-2.5, 0.8))):
    G.drip((x, -0.17 if i % 2 else 0.17, GH), ln, 0.05 if ln > 1 else 0.04, key='jam', seg=6)
    if i in (1, 3, 5):
        G.ellipsoid('glow_jam', (x, -0.17 if i % 2 else 0.17, GH - ln - 0.02), (0.055, 0.055, 0.07), seg=6, rings=3)
for x in (-0.85, 1.7):
    G.puddle((x, 0.0, 0), 0.35, th=0.025, seg=10, seed=x)
G.puddle((GW + 0.1, -0.35, 0), 0.4, th=0.03, seg=10, seed=4.0)

props = [va, vb, cz, ra, rb, pr, gb]
info = build_kit(props, row_w=16.0, gap=1.4)
acts = []
ARGS = script_args()
finish(KID, info, acts, props=props, debug_dir=('/private/tmp/claude-501/-Users-tired-Desktop/185f8636-5e7b-49ee-b06d-79b2e9d6d697/scratchpad/dbg/' + KID) if 'dbg' in ARGS else None)
