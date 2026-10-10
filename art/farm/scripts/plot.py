# Plot 6 x 10 m: wattle fence 0.45 m, wicket 1.2 m (separate leaf), name sign 1.1 x 0.55, owner pennant. level.md §4
# Budget design-v11 §16.2: whole plot ~1500 tris (20 plots, merged static).
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
reset()

PW, PL = 6.0, 10.0
GX = 0.65
WICKER = 0xc9a066
WICKER_D = 0xa47a44
STAKE = 0x8a5a34

def band(B, pts, h, th, cols):
    """Woven band: rectangular section h x th following pts (soft-shaded), per-point colours."""
    rings = []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]; c = pts[min(len(pts) - 1, i + 1)]
        T = Vector((c.x - a.x, c.y - a.y, 0)).normalized()
        N = Vector((-T.y, T.x, 0))
        Z = Vector((0, 0, 1))
        rings.append([B.bm.verts.new(p + N * sn * th / 2 + Z * sz * h / 2) for (sn, sz) in ((1, -1), (1, 1), (-1, 1), (-1, -1))])
    faces = []
    vcol = {}
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(4):
            faces.append(B.bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k])))
    faces.append(B.bm.faces.new(list(reversed(rings[0]))))
    faces.append(B.bm.faces.new(rings[-1]))
    for i, r in enumerate(rings):
        for v in r:
            vcol[v] = cols[i]
    B.bm.normal_update()
    B.paint(faces, cols[0], 'farm_soft', smooth=True, vcol=vcol)
    return faces

def wattle_run(B, p0, p1, rng, h=0.45, bands=(0.14, 0.325), step=1.2, end_stakes=(True, True), seed=0):
    p0 = Vector((p0[0], p0[1], 0.0)); p1 = Vector((p1[0], p1[1], 0.0))
    d = p1 - p0
    L = d.length
    t = d.normalized()
    nrm = Vector((-t.y, t.x, 0))
    n = max(1, round(L / step))
    for i in range(n + 1):
        if (i == 0 and not end_stakes[0]) or (i == n and not end_stakes[1]):
            continue
        p = p0 + t * (L * i / n)
        hh = h + 0.08 + rng.uniform(-0.02, 0.02)
        B.tube([(p.x, p.y, -0.03), (p.x, p.y, hh)], [0.03, 0.026], segs=5, cap0=False, cap1=True, col=STAKE,
               mat='farm_soft', vcolfn=lambda tt: mixc(mulc(STAKE, 0.8), mixc(STAKE, 0xd8a070, 0.3), tt))
    for bi, z in enumerate(bands):
        pts = []
        m = n * 2
        for j in range(m + 1):
            s = j / m
            phase = (j + bi) % 2
            off = (0.032 if phase else -0.032) * (0 if j in (0, m) else 1)
            pts.append(p0 + t * (L * s) + nrm * off + Vector((0, 0, z + rng.uniform(-0.006, 0.006))))
        tint = jitter(WICKER if bi % 2 == 0 else mixc(WICKER, WICKER_D, 0.4), 0.04, rng)
        band(B, pts, 0.18, 0.045, [mixc(tint, mulc(tint, 0.74), ((j + bi) % 2) * 0.85) for j in range(m + 1)])

def build_fence():
    rng = random.Random(51)
    B = Builder(51)
    hx, hy = PW / 2, PL / 2
    # front (gate side, y = -hy) in two runs
    wattle_run(B, (-hx, -hy), (-GX - 0.06, -hy), rng, end_stakes=(True, False))
    wattle_run(B, (GX + 0.06, -hy), (hx, -hy), rng, end_stakes=(False, True))
    wattle_run(B, (hx, -hy), (hx, hy), rng, end_stakes=(False, True))
    wattle_run(B, (hx, hy), (-hx, hy), rng, end_stakes=(False, True))
    wattle_run(B, (-hx, hy), (-hx, -hy), rng, end_stakes=(False, False))
    # gate posts
    for sx in (-1, 1):
        vpost(B, sx * GX, -hy, -0.03, 1.15, 0.13, seed=sx + 60, col=WOOD_D)
        B.sphere((sx * GX, -hy, 1.17), 0.075, scale=(1, 1, 0.75), segs=8, rings=5, col=0xe7b874, mat='farm_gloss')
    # flag pole on the right post (pennant hangs at 2.0 m)
    B.cyl((GX + 0.05, -hy, 1.1), (GX + 0.05, -hy, 2.25), 0.018, segs=6, col=0x8a6a48, mat='farm_soft')
    B.sphere((GX + 0.05, -hy, 2.27), 0.03, segs=8, rings=5, col=0xe7b874, mat='farm_gloss')
    # number plate on the left post (front face, -Y)
    B.rbox((-GX, -hy - 0.075, 0.86), (0.2, 0.018, 0.14), r=0.008, rseg=1, nx=2,
           colfn=lambda co: mixc(0xfbefd6, 0xefdcb8, 0.5 + noise.noise(co * 9) * 0.5), end_r=0.006)
    return B.build('plot_fence', ground_ao=(0.08, 0.65))

def build_gate_leaf():
    """Wicket door, origin at the left hinge (x=-0.59), bottom. Closed = spans to x=+0.59. Front -Y."""
    rng = random.Random(52)
    B = Builder(52)
    W, H = 1.14, 0.56
    n = 7
    for i in range(n):
        x = 0.06 + (W - 0.1) * (i + 0.5) / n
        h = H * (0.9 + 0.1 * math.sin(math.pi * (i + 0.5) / n))
        fs = B.rbox((0, 0, 0), (h, 0.075, 0.03), r=0.01, rseg=1, nx=2,
                    colfn=lambda co, i=i: mixc(0xf3e6cf, 0xe2cfae, 0.5 + noise.noise(co * 9 + Vector((i, 0, 0))) * 0.5), end_r=0.0)
        B.transform(fs, Matrix.Translation((x, 0, 0.06 + h / 2)) @ Euler(UP).to_matrix().to_4x4())
        B.sphere((x, 0, 0.06 + h), 0.0375, scale=(1, 0.4, 0.9), segs=8, rings=4, col=0xf3e6cf, mat='farm_soft')
    for z in (0.18, 0.48):
        plank_x(B, (W / 2, 0.035, z), (W, 0.035, 0.06), seed=int(z * 10), col=WOOD)
    a = math.atan2(0.3, W - 0.12)
    B.rbox((W / 2, 0.035, 0.33), (math.hypot(W - 0.12, 0.3), 0.03, 0.05), r=0.012, rseg=1, nx=3, rot=(0, -a, 0),
           colfn=wood_fn(WOOD, seed=9), end_r=0.01)
    for z in (0.18, 0.48):
        B.rbox((0.07, 0.056, z), (0.14, 0.008, 0.04), r=0.003, rseg=1, nx=1, colfn=lambda co: 0x5e6266, mat='farm_metal', end_r=0.002)
    return B.build('plot_gate', ground_ao=None)

def build_sign():
    """1.1 x 0.55 board, bottom at 1.0 m, faces -Y (towards the well). Origin at the foot, between the legs."""
    B = Builder(53)
    W, H, Z0 = 1.1, 0.55, 1.0
    ZC = Z0 + H / 2
    for sx in (-1, 1):
        vpost(B, sx * (W / 2 - 0.08), 0.03, -0.03, Z0 + H + 0.12, 0.1, seed=sx + 70, col=WOOD_D)
        B.sphere((sx * (W / 2 - 0.08), 0.03, Z0 + H + 0.13), 0.05, scale=(1, 1, 0.75), segs=10, rings=6, col=0xe7b874, mat='farm_gloss')
    B.rbox((0, -0.025, ZC), (W, 0.04, H), r=0.016, rseg=2, nx=5, colfn=wood_fn(WOOD, seed=71), end_r=0.012)
    # text panel (raised 2.2 cm): the game draws nick / level / plot number here; tint for free / own states
    B.rbox((0, -0.05, ZC), (W - 0.1, 0.018, H - 0.1), r=0.008, rseg=1, nx=4,
           colfn=lambda co: mixc(0xfbefd6, 0xf1dfbc, 0.5 + noise.noise(co * 7) * 0.5), end_r=0.006)
    B.rbox((0, -0.025, Z0 + H + 0.03), (W + 0.08, 0.075, 0.035), r=0.012, rseg=2, nx=5, colfn=wood_fn(WOOD_L, seed=72), end_r=0.01)
    # little sprout ornament
    top = Z0 + H + 0.05
    B.tube([(0.0, -0.025, top), (0.0, -0.025, top + 0.07), (0.012, -0.025, top + 0.12)], [0.01, 0.009, 0.007], segs=6,
           col=0x5ea83f, mat='farm_plant')
    for yaw, pz in ((0.0, 0.11), (math.pi, 0.09)):
        B.leaf((0.006, -0.025, top + pz), yaw, math.radians(35), 0.1, 0.06, bend=-0.5, curl=0.3, fold=0.15, nu=5, nv=2,
               shape='oval', col=0x72c14a, col_base=0x4f9a35, col_tip=0x9edb62)
    for px in (-(W / 2 - 0.035), W / 2 - 0.035):
        B.sphere((px, -0.06, ZC), 0.012, segs=8, rings=5, col=0x6b6f73, mat='farm_metal')
    return B.build('plot_sign', ground_ao=(0.08, 0.6))

def build_pennant():
    """Owner pennant: white so the game can tint it with the owner colour. Origin = attach point on the pole."""
    B = Builder(54)
    def fn(u, v):
        # u along the flag (0 at pole), v across (0 top .. 1 bottom); triangular pennant with a soft wave
        L = 0.62
        w = 0.32 * (1 - u * 0.92)
        x = u * L
        z = -v * w + (0.32 - w) * 0.5 * 0 - u * 0.04
        y = math.sin(u * 5.0) * 0.035 * u
        return Vector((x, y, z))
    B.grid(fn, 6, 2, col=0xffffff, mat='farm_cloth', orient=None,
           colfn=lambda u, v: mixc(0xffffff, 0xe8e8e8, abs(math.sin(u * 5))))
    B.cyl((0, 0, 0.02), (0, 0, -0.34), 0.012, segs=6, col=0xd8d8d8, mat='farm_cloth')
    return B.build('plot_pennant', ground_ao=None)

def build_chest():
    """Ящик «Хозяйство» (design-v11 §16.2, ~800 tris with the lid): wooden chest with iron bands, sprout badge.
    Front = -Y. Lid is a separate object, origin on the hinge (back top edge): rotate about X to open."""
    B = Builder(55)
    W, D, H = 0.8, 0.5, 0.42
    B.rbox((0, 0, H / 2 + 0.04), (W, D, H), r=0.03, rseg=1, nx=3, colfn=wood_fn(mixc(WOOD, WOOD_L, 0.2), seed=81), end_r=0.025)
    for sx in (-1, 1):
        B.box((sx * (W / 2 - 0.12), -D / 2 - 0.006, H / 2 + 0.04), (0.05, 0.012, H - 0.02), col=0x6b6f73, mat='farm_metal')
        B.box((sx * (W / 2 + 0.006), 0, H / 2 + 0.04), (0.012, D - 0.1, 0.05), col=0x6b6f73, mat='farm_metal')
        for sy in (-1, 1):
            B.box((sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), 0.02), (0.08, 0.08, 0.05), col=WOOD_D, mat='farm_soft')
    # latch plate + round sprout badge (no text)
    B.rbox((0, -D / 2 - 0.01, H - 0.02), (0.1, 0.012, 0.09), r=0.008, rseg=1, nx=1, colfn=lambda co: 0xe0b040, mat='farm_gold', end_r=0.006)
    B.sphere((0, -D / 2 - 0.004, H * 0.45), 0.075, scale=(1, 0.12, 1), segs=10, rings=3, col=0xfbefd6, mat='farm_gloss')
    rr = random.Random(3)
    for yaw in (0.6, 2.5):
        B.leaf((0, -D / 2 - 0.016, H * 0.42), yaw, 0.0, 0.05, 0.03, bend=0, curl=0.2, fold=0, nu=2, nv=1, shape='oval', col=0x5ea83f)
    chest = B.build('plot_chest', ground_ao=(0.06, 0.7))
    L = Builder(56)
    # curved lid, built with the hinge at the origin (lid extends to -Y)
    def fn(u, v):
        x = (u - 0.5) * (W + 0.04)
        a = v * math.pi
        y = -D / 2 - 0.02 + math.cos(a) * (D / 2 + 0.02)
        z = math.sin(a) * 0.12
        return Vector((x, y, z))
    fs = L.grid(fn, 3, 6, mat='farm_soft', orient=None, colfn=lambda u, v: mixc(WOOD, WOOD_L, 0.3 + 0.4 * abs(math.sin(v * 9))))
    for f_ in fs:
        if (f_.calc_center_median() - Vector((0, -D / 2, 0))).dot(f_.normal) < 0:
            f_.normal_flip()
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.02)
        ring = [Vector((x, -D / 2 - 0.02 + math.cos(k / 6 * math.pi) * (D / 2 + 0.02), math.sin(k / 6 * math.pi) * 0.12)) for k in range(7)]
        vs = [L.bm.verts.new(p) for p in ring]
        f_ = L.bm.faces.new(vs if sx < 0 else list(reversed(vs)))
        L.paint([f_], WOOD_D, 'farm_soft')
    for sx in (-1, 1):
        pts = [Vector((sx * (W / 2 - 0.12), -D / 2 - 0.02 + math.cos(k / 6 * math.pi) * (D / 2 + 0.03), math.sin(k / 6 * math.pi) * 0.13)) for k in range(7)]
        L.tube(pts, 0.012, segs=4, cap0=False, cap1=False, col=0x6b6f73, mat='farm_metal')
    lid = L.build('plot_chest_lid', ground_ao=None)
    return chest, lid

fence = build_fence()
gate = build_gate_leaf()
sign = build_sign()
pennant = build_pennant()
chest, lid = build_chest()
attach(chest, 'attach_lid', (0.0, 0.25, 0.46))
objs = [fence, gate, sign, pennant, chest, lid]
fit_all(objs, {'plot_fence': 1000, 'plot_gate': 220, 'plot_sign': 260, 'plot_chest': 600, 'plot_chest_lid': 200})
report(objs)
save_blend('plot')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/plot.glb')
for o in objs:
    o['farm_export_at_origin'] = True
bd = append_from('bed', ['bed_frame', 'bed_dug', 'bed_wet', 'bed_empty', 'bed_turf', 'bed_lock'])
bm_ = {b.name.replace('_pv_', ''): b for b in bd}
extra = []
states = ['bed_dug', 'bed_wet', 'bed_dug', 'bed_empty', 'bed_turf', 'bed_turf', 'bed_turf', 'bed_turf']
beds_xy = [(2, -4), (-2, -4), (2, -2), (-2, -2), (2, 0), (-2, 0), (2, 2), (-2, 2)]
for (x, y), st in zip(beds_xy, states):
    extra.append(dup(bm_['bed_frame'], (x, y, 0)))
    extra.append(dup(bm_[st], (x, y, 0)))
    if st == 'bed_turf':
        extra.append(dup(bm_['bed_lock'], (x - 0.62, y - 0.85, 0)))
for b in bd:
    bpy.data.objects.remove(b, do_unlink=True)
extra.append(dup(fence, (0, 0, 0)))
extra.append(dup(gate, (-0.59, -5.0, 0)))
extra.append(dup(sign, (-1.3, -5.4, 0)))
extra.append(dup(pennant, (0.7, -5.0, 2.0)))
extra.append(dup(chest, (1.0, -4.3, 0)))
extra.append(dup(lid, (1.0, -4.3 + 0.25, 0.46)))
for o in objs:
    o.location = (0, 0, -60)
preview(extra, f'{PNG_DIR}/plot.png', yaw=-24, pitch=40, margin=0.9, look_z=0.0)
preview([extra[-5], extra[-2]], f'{SCR}/plot_detail.png', yaw=-35, pitch=22, margin=1.3)
for e in extra:
    bpy.data.objects.remove(e, do_unlink=True)
for o in objs:
    o.location = (0, 0, 0)
spread(objs, 0.5)
for o in objs:
    o.location.y -= 8.0
save_blend('plot')
print('FINAL plot', {o.name: tris(o) for o in objs})
