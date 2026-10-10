# Farm square props: well (+crank, rope, bucket, weathervane), trough, order board, farm notice board, campfire, plaza gate, signpost.
# Sizes follow docs/farm/level/layout.json. Game forward (yaw 0) is -Z = Blender +Y; boards are turned to face it with rot_mesh_z.
glow_mat('farm_glow_fire', 0xffa040, 2.2, rough=0.5, coat=0.0)
glow_mat('farm_glow_ember', 0xff7a30, 0.9, rough=0.6, coat=0.0)
PAPER = (0xfff4dc, 0xfff8e8, 0xfff2d6)

def cream(co):
    return mixc(0xfbefd6, 0xf1dfbc, 0.5 + noise.noise(co * 7) * 0.5)

# ================================================================ WELL
def build_well():
    rng = random.Random(2001)
    B = Builder(1)
    R0, R1, HB = 1.0, 0.76, 0.8          # stone ring outer / inner radius, height
    rows, nst = 5, 13

    def bulge(a, z):
        row = z / (HB / rows)
        fr = row - int(row)
        off = (int(row) % 2) * 0.5
        fa = ((a / TAU) * nst + off) % 1.0
        return smooth01(min(min(fr, 1 - fr) * 2, min(fa, 1 - fa) * 2) * 3.5)

    def sid(a, z):
        row = min(rows - 1, int(z / (HB / rows)))
        return row, int(((a / TAU) * nst + (row % 2) * 0.5) % nst)

    prof = [(R0 * 0.99, -0.02)] + [(R0, HB * i / 10) for i in range(1, 10)] + [(R0 * 0.99, HB)]
    def cf(co, n):
        a = math.atan2(co.y, co.x) % TAU
        z = max(0, min(HB - 1e-4, co.z))
        row, col = sid(a, z)
        rr = random.Random(row * 31 + col)
        base = mixc(0xcbc3b4, 0xa59d90, rr.random())
        base = mixc(base, 0xdccaa6, rr.random() * 0.35)
        return mixc(mulc(base, 0.6), base, bulge(a, z))
    B.lathe(prof, segs=52, c=(0, 0, 0), col=cf, mat='farm_soft', rmod=lambda a, t, r, z: 1.0 + 0.03 * bulge(a, max(0, min(HB - 1e-4, z))),
            close_top=False, close_bot=False)
    B.lathe([(R1, HB), (R1, 0.3)], segs=20, c=(0, 0, 0), col=lambda co, n: mixc(0x403b36, 0x8a8278, (co.z - 0.3) / (HB - 0.3)),
            mat='farm_soft', close_top=False, close_bot=False)
    B.sphere((0, 0, 0.46), 1.0, scale=(R1 * 0.99, R1 * 0.99, 0.004), segs=24, rings=3, col=0x3f7f9a, mat='farm_water')
    # rim cap stones
    ncap = 14
    for k in range(ncap):
        a = TAU * (k + 0.5) / ncap
        rm = (R0 + R1) / 2
        B.rbox((math.cos(a) * rm, math.sin(a) * rm, HB + 0.05), (TAU * rm / ncap * 0.95, R0 - R1 + 0.1, 0.11), r=0.035, rseg=1,
               nx=1, rot=(0, 0, a + math.pi / 2), colfn=lambda co, k=k: mixc(0xd6cfc3, 0xb5ad9f, random.Random(k).random()), end_r=0.0)
    # posts on the rim, braces
    PX = 0.88
    for sx in (-1, 1):
        vpost(B, sx * PX, 0.0, HB - 0.05, 2.32, 0.14, seed=sx + 3, col=WOOD_D)
        B.rbox((sx * (PX - 0.1), 0.0, 1.86), (0.44, 0.075, 0.075), r=0.02, rseg=1, nx=2, rot=(0, -math.radians(55) * sx, 0),
               colfn=wood_fn(WOOD_D, seed=sx + 8), end_r=0.015)
    plank_x(B, (0, 0, 2.3), (2.0, 0.11, 0.11), seed=11, col=WOOD_D)
    for sy in (-1, 1):
        plank_x(B, (0, sy * 0.4, 2.08), (2.0, 0.075, 0.075), seed=12 + sy, col=WOOD_D)
    # gable roof inside the 2.3 m box: eaves at y=+-1.1, ridge 2.64
    gable_roof(B, 0.0, 2.2, 0.0, 1.06, 1.94, 2.62, 3, rng, thick=0.05)
    for sx in (-1, 1):
        x = sx * 1.0
        vs = [B.bm.verts.new(v) for v in ((x, -0.92, 2.0), (x, 0.92, 2.0), (x, 0.0, 2.58))]
        f = B.bm.faces.new(vs if sx > 0 else list(reversed(vs)))
        B.paint([f], WOOD, 'farm_soft', smooth=False)
    # winch axle (separate crank turns at +X end)
    B.cyl((-0.82, 0, 1.55), (0.82, 0, 1.55), 0.08, segs=12, col=WOOD, mat='farm_soft')
    B.cyl((-0.3, 0, 1.55), (0.3, 0, 1.55), 0.095, segs=12, col=0xd8bf8a, mat='farm_soft')
    for i in range(7):
        B.torus((-0.27 + i * 0.09, 0, 1.55), 0.095, 0.013, segs=10, rsegs=3, rot=(0, math.pi / 2, 0), col=0xc8ad78, mat='farm_soft')
    # flower pots at the foot (cosy)
    for (a, c) in ((2.4, 0xff7aa8),):
        px, py = math.cos(a) * 1.18, math.sin(a) * 1.18
        B.lathe([(0.0, 0.0), (0.1, 0.0), (0.13, 0.17), (0.115, 0.17), (0.0, 0.15)], segs=12, c=(px, py, 0), col=0xc8653e, mat='farm_soft')
        rosette(B, px, py, rng, n=4, L=(0.08, 0.11), W=0.05, pitch=(70, 40), bend=-0.6, col=0x55b244, z=0.15, nu=3)
        for k in range(3):
            flower5(B, Vector((px + math.cos(k * 2.1) * 0.05, py + math.sin(k * 2.1) * 0.05, 0.25 + 0.02 * k)), 0.035, rng, col=c,
                    centre=0xf2b01e, pitch=30)
    well = B.build('well', ground_ao=(0.12, 0.65), ao=dict(samples=18, dist=0.5, strength=0.5))

    # crank: origin on the axle end (+X), turns around X
    B = Builder(2)
    B.cyl((0.0, 0, 0), (0.14, 0, 0), 0.032, segs=8, col=0x6b6f73, mat='farm_metal')
    B.cyl((0.12, 0, 0), (0.12, 0, -0.3), 0.026, segs=8, col=0x6b6f73, mat='farm_metal')
    B.cyl((0.12, 0, -0.3), (0.32, 0, -0.3), 0.034, segs=10, col=WOOD_D, mat='farm_soft')
    crank = B.build('well_crank', ground_ao=None)
    # rope: 1 m from origin down; scale Z in the game to lower the bucket
    B = Builder(3)
    rope(B, [(0, 0, 0), (0, 0, -0.5), (0, 0, -1.0)], r=0.015)
    rope_o = B.build('well_rope', ground_ao=None)
    # bucket: origin at the handle top (hangs from the rope end)
    B = Builder(4)
    H = 0.27
    bprof = [(0.14, -H - 0.18), (0.155, -H - 0.08), (0.17, -0.2), (0.165, -0.19), (0.15, -0.19), (0.14, -H - 0.14), (0.0, -H - 0.14)]
    B.lathe(bprof, segs=16, col=lambda co, n: wood_fn(0xc4844c, seed=5, axis='z')(co), mat='farm_soft', close_top=False, close_bot=True)
    for z, r in ((-H - 0.13, 0.147), (-0.24, 0.167)):
        B.torus((0, 0, z), r, 0.009, segs=16, rsegs=4, col=0x6b6f73, mat='farm_metal', scale=(1, 1, 1.4))
    B.sphere((0, 0, -0.23), 1.0, scale=(0.155, 0.155, 0.004), segs=14, rings=3, col=0x5aa0bc, mat='farm_water')
    hp = [(-0.165, 0, -0.21)] + [(-math.cos(a) * 0.165, 0, -0.21 + math.sin(a) * 0.2) for a in [i * math.pi / 8 for i in range(1, 8)]] + [(0.165, 0, -0.21)]
    B.tube(hp, 0.007, segs=5, cap0=False, cap1=False, col=0x6b6f73, mat='farm_metal')
    bucket = B.build('well_bucket', ground_ao=None)
    # weathervane: origin at the foot of the rod (sits on the ridge, z=2.66), spins around Z
    vane = build_vane()
    return [well, crank, rope_o, bucket, vane]

ROOSTER = [(0.17, 0.205), (0.125, 0.235), (0.12, 0.262), (0.128, 0.292), (0.104, 0.283), (0.094, 0.312), (0.07, 0.288),
           (0.05, 0.302), (0.042, 0.262), (0.02, 0.215), (-0.04, 0.175), (-0.1, 0.19), (-0.15, 0.27), (-0.19, 0.3),
           (-0.18, 0.24), (-0.215, 0.255), (-0.2, 0.18), (-0.23, 0.17), (-0.19, 0.11), (-0.13, 0.05), (-0.04, 0.025),
           (0.04, 0.04), (0.09, 0.09), (0.105, 0.14), (0.12, 0.165), (0.128, 0.19)]

def build_vane():
    B = Builder(5)
    B.cyl((0, 0, -0.02), (0, 0, 0.3), 0.012, segs=6, col=0x4a4f55, mat='farm_metal')
    B.sphere((0, 0, 0.0), 0.03, segs=8, rings=5, col=0x4a4f55, mat='farm_metal')
    # arrow
    B.cyl((-0.22, 0, 0.17), (0.22, 0, 0.17), 0.008, segs=5, col=0x4a4f55, mat='farm_metal')
    tip = [B.bm.verts.new(v) for v in ((0.27, 0, 0.17), (0.2, 0, 0.21), (0.2, 0, 0.13))]
    ft = B.bm.faces.new(tip)
    tail = [B.bm.verts.new(v) for v in ((-0.18, 0, 0.17), (-0.25, 0, 0.23), (-0.27, 0, 0.17), (-0.25, 0, 0.11))]
    ftl = B.bm.faces.new(tail)
    B.paint([ft, ftl], 0x4a4f55, 'farm_metal', smooth=False)
    for f in (ft, ftl):
        r = bmesh.ops.extrude_face_region(B.bm, geom=[f])
        vv = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(B.bm, verts=vv, vec=(0, 0.012, 0))
    # rooster silhouette, extruded 2.4 cm, painted red-gold (soft weathered copper look)
    z0 = 0.3
    vs = [B.bm.verts.new((x * 1.25, -0.012, z0 + z * 1.25 - 0.03)) for x, z in ROOSTER]
    f = B.bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(B.bm, geom=[f])
    vv = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(B.bm, verts=vv, vec=(0, 0.024, 0))
    B.bm.normal_update()
    faces = list({ff for v in vs + vv for ff in v.link_faces})
    B.paint(faces, lambda co, n: mixc(0xd8572e, 0xf0b040, smooth01((co.z - z0) / 0.35) * 0.6), 'farm_gold', smooth=False)
    bmesh.ops.recalc_face_normals(B.bm, faces=B.bm.faces[:])
    return B.build('well_vane', ground_ao=None)

def build_trough():
    B = Builder(6)
    L, W, H = 1.8, 0.6, 0.55
    t = 0.055
    for sx in (-1, 1):
        B.rbox((sx * (L / 2 - 0.22), 0, 0.07), (0.14, W + 0.06, 0.14), r=0.03, rseg=2, nx=2, colfn=wood_fn(WOOD_D, seed=sx), end_r=0.025)
    B.rbox((0, 0, 0.17), (L - 0.02, W - 0.02, t), r=0.015, rseg=1, nx=5, colfn=wood_fn(WOOD, seed=2), end_r=0.012)
    for sy in (-1, 1):
        B.rbox((0, sy * (W / 2 - t / 2), 0.17 + (H - 0.17) / 2), (L - 0.02, t, H - 0.16), r=0.018, rseg=2, nx=6,
               rot=(sy * math.radians(6), 0, 0), colfn=wood_fn(WOOD, seed=3 + sy), end_r=0.014)
        B.rbox((0, sy * (W / 2 - 0.01), H - 0.015), (L, 0.08, 0.035), r=0.014, rseg=2, nx=6, colfn=wood_fn(WOOD_L, seed=6 + sy), end_r=0.012)
    for sx in (-1, 1):
        B.rbox((sx * (L / 2 - t / 2 - 0.01), 0, 0.17 + (H - 0.17) / 2), (t, W - 0.02, H - 0.14), r=0.016, rseg=2, nx=2,
               colfn=wood_fn(WOOD_D, seed=9 + sx, axis='y'), end_r=0.012)
    for sx in (-0.45, 0.45):
        B.rbox((sx, 0, 0.17 + (H - 0.17) / 2), (0.04, W + 0.03, H - 0.1), r=0.008, rseg=1, nx=1, colfn=lambda co: 0x6e7276,
               mat='farm_metal', end_r=0.006)
    B.box((0, 0, H - 0.08), (L - 2 * t - 0.04, W - 0.1, 0.01), col=0x4f9ab8, mat='farm_water')
    return B.build('trough', ground_ao=(0.08, 0.65), ao=dict(samples=16, dist=0.35, strength=0.5))

# ================================================================ BOARDS (authored facing -Y, turned to +Y at the end)
def board_frame(B, W, H, zc, depth=0.05, col=WOOD, seed=0, fy=-0.05):
    B.rbox((0, fy, zc), (W, depth, H), r=0.015, rseg=2, nx=6, colfn=wood_fn(col, seed=seed), end_r=0.012)
    for sz in (-1, 1):
        B.rbox((0, fy - 0.03, zc + sz * (H / 2 - 0.03)), (W + 0.04, 0.035, 0.07), r=0.014, rseg=2, nx=6,
               colfn=wood_fn(WOOD_D, seed=seed + sz), end_r=0.012)
    for sx in (-1, 1):
        B.rbox((sx * (W / 2 - 0.02), fy - 0.03, zc), (H - 0.02, 0.035, 0.07), r=0.014, rseg=2, nx=3, rot=UP,
               colfn=wood_fn(WOOD_D, seed=seed + 5 + sx), end_r=0.012)

def build_order_board():
    """2 m between post centres (layout: orders), posts 2.4 m. Three blank order notes for the game to fill."""
    rng = random.Random(2003)
    B = Builder(7)
    W, H, ZC = 1.76, 1.0, 1.25
    for sx in (-1, 1):
        vpost(B, sx * 1.0, 0.0, -0.02, 2.2, 0.16, seed=sx, col=WOOD_D)
        B.sphere((sx * 1.0, 0, 2.2), 0.09, scale=(1, 1, 0.7), segs=10, rings=6, col=0xe7b874, mat='farm_gloss')
    board_frame(B, W, H, ZC, col=0xd9a666, seed=2)
    B.rbox((0, -0.07, ZC + H / 2 + 0.17), (0.9, 0.045, 0.22), r=0.016, rseg=2, nx=4, colfn=wood_fn(WOOD_L, seed=7), end_r=0.014)
    for i, x in enumerate((-0.55, 0.0, 0.55)):
        paper(B, (x, -0.087, ZC - 0.02), 0.42, 0.55, rot_z=[0.04, -0.02, 0.05][i], col=PAPER[i], pin=[0xe84a3a, 0x3a8fe8, 0x4fb84a][i])
    gable_roof(B, 0.0, 2.3, -0.02, 0.34, 2.06, 2.36, 2, rng, thick=0.038)
    # shelf with three veg as a picture-hint of "orders"
    B.rbox((0, -0.13, ZC - H / 2 - 0.07), (W * 0.8, 0.17, 0.035), r=0.012, rseg=1, nx=4, colfn=wood_fn(WOOD_L, seed=9), end_r=0.01)
    for x, c in ((-0.5, 0xe8364f), (-0.35, 0xf28a26), (0.45, 0xffc928)):
        B.sphere((x, -0.14, ZC - H / 2 - 0.02), 0.042, segs=10, rings=6, col=c, mat='farm_gloss')
    ob = B.build('order_board', ground_ao=(0.1, 0.65), ao=dict(samples=14, dist=0.3, strength=0.45))
    rot_mesh_z(ob)
    return ob

def build_notice_board():
    """Farm board: 2.4 m between posts, 2.6 m tall; big blank panel for the plot map and the neighbour list."""
    rng = random.Random(2004)
    B = Builder(8)
    W, H, ZC = 2.2, 1.25, 1.35
    for sx in (-1, 1):
        vpost(B, sx * 1.2, 0.0, -0.02, 2.4, 0.16, seed=sx, col=WOOD_D)
        B.sphere((sx * 1.2, 0, 2.4), 0.09, scale=(1, 1, 0.7), segs=10, rings=6, col=0xe7b874, mat='farm_gloss')
    board_frame(B, W, H, ZC, seed=3)
    B.rbox((0, -0.088, ZC - 0.03), (1.75, 0.018, 0.98), r=0.008, rseg=1, nx=4, colfn=cream, end_r=0.006)
    for (x, z) in ((-0.84, 0.45), (0.84, 0.45), (-0.84, -0.45), (0.84, -0.45)):
        B.sphere((x, -0.1, ZC - 0.03 + z), 0.015, segs=8, rings=5, col=0xe84a3a, mat='farm_gloss')
    for (x, z, rz, c) in ((-1.0, 0.3, 0.08, 0xfff8e8), (1.0, -0.25, -0.06, 0xfff0d6)):
        paper(B, (x, -0.087, ZC + z), 0.14, 0.2, rot_z=rz, col=c, pin=0x3a8fe8)
    B.rbox((0, -0.07, ZC + H / 2 + 0.2), (1.2, 0.045, 0.25), r=0.016, rseg=2, nx=5, colfn=wood_fn(WOOD_L, seed=8), end_r=0.014)
    gable_roof(B, 0.0, 2.75, -0.02, 0.38, 2.26, 2.6, 3, rng, thick=0.04)
    # flower box
    B.rbox((0, -0.13, 0.5), (1.4, 0.2, 0.18), r=0.02, rseg=2, nx=5, colfn=wood_fn(WOOD, seed=10), end_r=0.016)
    B.box((0, -0.13, 0.59), (1.34, 0.16, 0.01), col=0x5a3622, mat='farm_soft')
    for i in range(8):
        x = -0.6 + i * (1.2 / 7)
        rosette(B, x, -0.13, rng, n=4, L=(0.07, 0.1), W=0.04, pitch=(70, 40), bend=-0.6, col=0x55b244, z=0.59, nu=3)
        c = [0xff7aa8, 0xffd23f, 0xffffff, 0xff9a4a][i % 4]
        flower5(B, Vector((x, -0.13, 0.69 + 0.02 * (i % 2))), 0.034, rng, col=c, centre=0xf2b01e, pitch=30)
    ob = B.build('notice_board', ground_ao=(0.1, 0.65), ao=dict(samples=14, dist=0.3, strength=0.45))
    rot_mesh_z(ob)
    return ob

# ================================================================ CAMPFIRE
def log(B, p0, p1, r, rng, col=0x8a5a34, end=0xe0b47a):
    p0 = Vector(p0); p1 = Vector(p1)
    d = p1 - p0
    L = d.length
    q = Vector((1, 0, 0)).rotation_difference(d.normalized())
    fs = B.rbox((0, 0, 0), (L, 2 * r, 2 * r), r=r * 0.95, rseg=3, nx=max(2, int(L / 0.25)),
                colfn=lambda co: mixc(mulc(col, 0.8), col, 0.5 + noise.noise(Vector((co.x * 3, co.y * 25, co.z * 25))) * 0.6),
                end_r=r * 0.15)
    B.transform(fs, Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4())
    dn = d.normalized()
    for f in fs:
        if abs(f.normal.dot(dn)) > 0.9:
            for lp in f.loops:
                ref = p0 if (lp.vert.co - p0).length < (lp.vert.co - p1).length else p1
                rr = (lp.vert.co - ref).length / r
                lp[B.col] = lin(mixc(end, mulc(end, 0.75), abs(math.sin(rr * 9)) * 0.6))
    return fs

def build_campfire():
    """Stone ring fits the 1.4 x 1.4 x 0.6 solid box. Flame and embers are separate (animate, glow)."""
    rng = random.Random(2005)
    B = Builder(9)
    B.sphere((0, 0, 0.0), 1.0, scale=(0.5, 0.5, 0.035), segs=16, rings=4,
             col=lambda co, n: mixc(0x4a4440, 0x8a8078, noise.noise(co * 10) * 0.5 + 0.5), mat='farm_soft')
    for k in range(12):
        a = TAU * k / 12 + rng.uniform(-0.08, 0.08)
        r = 0.58 + rng.uniform(-0.02, 0.02)
        stone(B, (math.cos(a) * r, math.sin(a) * r, 0.07), (0.13, 0.11, 0.1), rng)
    for k in range(5):
        a = TAU * k / 5 + 0.3
        log(B, (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.03), (math.cos(a) * 0.04, math.sin(a) * 0.04, 0.5), 0.05, rng)
    log(B, (-0.34, -0.14, 0.06), (0.32, 0.07, 0.05), 0.055, rng)
    fire = B.build('campfire', ground_ao=(0.06, 0.7), ao=dict(samples=14, dist=0.25, strength=0.5))
    B = Builder(10)
    for k in range(10):
        a = rng.random() * TAU; r = rng.uniform(0.0, 0.25)
        B.sphere((math.cos(a) * r, math.sin(a) * r, 0.03), rng.uniform(0.028, 0.045), scale=(1.2, 1, 0.6), segs=6, rings=4,
                 col=mixc(0xff8a3a, 0xffd070, rng.random()), mat='farm_glow_ember')
    embers = B.build('campfire_embers', ground_ao=None)
    B = Builder(11)
    def flame(c, r, h, col0, col1, tw=0.0):
        prof = [(0.0, 0.0), (r * 0.7, h * 0.05), (r, h * 0.2), (r * 0.85, h * 0.45), (r * 0.5, h * 0.72), (r * 0.18, h * 0.92), (0.0, h)]
        B.lathe(prof, segs=10, c=c, col=lambda co, n: mixc(col0, col1, (co.z - c[2]) / h), mat='farm_glow_fire',
                rmod=lambda a, t, rr, z: 1 + 0.18 * math.sin(a * 3 + t * 5 + tw) * t)
    flame((0, 0, 0.04), 0.22, 0.6, 0xffb030, 0xff6a20)
    for k in range(3):
        a = TAU * k / 3 + 0.5
        flame((math.cos(a) * 0.11, math.sin(a) * 0.11, 0.04), 0.11, 0.36, 0xffd060, 0xff8a30, tw=k)
    flame((0, 0, 0.06), 0.11, 0.42, 0xfff0a0, 0xffc050, tw=2)
    fl = B.build('campfire_flame', ground_ao=None)
    # seat log 1.8 x 0.45, top at 0.45 (layout: campfire.logs), long axis X
    B = Builder(12)
    log(B, (-0.9, 0, 0.2), (0.9, 0, 0.2), 0.2, rng, col=0x8e5c36)
    B.rbox((0, 0, 0.405), (1.6, 0.3, 0.05), r=0.018, rseg=2, nx=6, colfn=wood_fn(0xc89058, seed=3), end_r=0.014)
    B.tube([(0.35, -0.15, 0.24), (0.4, -0.28, 0.3)], [0.035, 0.026], segs=6, cap0=False, col=0x8e5c36, mat='farm_soft')
    B.sphere((-0.5, 0.0, 0.43), 1.0, scale=(0.14, 0.09, 0.02), segs=8, rings=4, col=0x6aa848, mat='farm_plant')
    seat = B.build('campfire_seat', ground_ao=(0.08, 0.6), ao=dict(samples=12, dist=0.25, strength=0.45))
    return [fire, fl, embers, seat]

# ================================================================ PLAZA GATE (faces +Z local = plaza = Blender -Y)
def picket(B, x, y, z0, h, w=0.09, t=0.035, col=0xf3e6cf, seed=0):
    fs = B.rbox((0, 0, 0), (h, w, t), r=0.012, rseg=2, nx=3,
                colfn=lambda co: mixc(col, mulc(col, 0.9), 0.5 + noise.noise(co * 9 + Vector((seed, 0, 0))) * 0.5), end_r=0.0)
    B.transform(fs, Matrix.Translation((x, y, z0 + h / 2)) @ Euler(UP).to_matrix().to_4x4())
    B.sphere((x, y, z0 + h), w * 0.5, scale=(1, t / w, 1.0), segs=8, rings=4, col=col, mat='farm_soft')

def gate_leaf(name, side, W=0.68, H=1.2):
    """Half of the 1.4 m wicket. Origin at the hinge (bottom); side -1: left leaf, extends to +X; +1: right leaf, to -X."""
    B = Builder(20 + side)
    n = 5
    for i in range(n):
        x = -side * (0.06 + (W - 0.09) * (i + 0.5) / n)
        tcen = (i + 0.5) / n if side < 0 else 1 - (i + 0.5) / n
        h = H * (0.82 + 0.18 * tcen)
        picket(B, x, 0.0, 0.07, h, seed=i + 5 * side)
    for z in (0.32, 0.92):
        plank_x(B, (-side * W / 2, 0.035, z), (W, 0.045, 0.08), seed=int(z * 10) + side, col=WOOD)
    a = math.atan2(0.6, W - 0.1)
    B.rbox((-side * W / 2, 0.035, 0.62), (math.hypot(W - 0.1, 0.6), 0.04, 0.06), r=0.015, rseg=1, nx=4, rot=(0, a * side, 0),
           colfn=wood_fn(WOOD, seed=9), end_r=0.012)
    for z in (0.32, 0.92):
        B.rbox((-side * 0.09, 0.06, z), (0.16, 0.01, 0.05), r=0.004, rseg=1, nx=1, colfn=lambda co: 0x5e6266, mat='farm_metal', end_r=0.003)
    return B.build(name, ground_ao=None)

def sunflower_badge(B, c, R, rng):
    """Sunflower ornament on the arch board: built facing +Z, then turned to face -Y."""
    c = Vector(c)
    m = B.mark()
    B.sphere(c, R * 0.42, scale=(1, 1, 0.35), segs=12, rings=6, col=lambda co, n: mixc(0x5a3418, 0x8a5a24, noise.noise(co * 40) * 0.5 + 0.5), mat='farm_soft')
    for k in range(14):
        a = TAU * k / 14
        B.leaf(c + Vector((math.cos(a), math.sin(a), 0)) * R * 0.36, a, math.radians(4), R * 0.62, R * 0.3, bend=-0.1, curl=0.25,
               fold=0.1, nu=3, nv=1, shape='lance', col=0xffc928, col_base=0xf29a1a, col_tip=0xffe07a, rib=0xffd648)
    B.transform(B.since(m), Matrix.Translation(c) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation(-c))

def build_plaza_gate():
    rng = random.Random(2006)
    B = Builder(13)
    PX, PH = 0.85, 3.0
    for sx in (-1, 1):
        vpost(B, sx * PX, 0.0, -0.02, PH, 0.16, seed=sx + 30, col=WOOD_D)
        B.sphere((sx * PX, 0, PH + 0.03), 0.1, scale=(1, 1, 0.75), segs=12, rings=7, col=0xe7b874, mat='farm_gloss')
    AW = 2 * PX + 0.34
    # arched board (blank cream face for «ФЕРМА»), centre at 2.6 m
    B.rbox((0, 0, 2.48), (AW, 0.12, 0.12), r=0.035, rseg=2, nx=14, bend=lambda x: (0.0, 0.28 * (1 - (x / (AW / 2)) ** 2)),
           colfn=wood_fn(WOOD, seed=33), end_r=0.03)
    B.rbox((0, -0.005, 2.62), (1.5, 0.06, 0.36), r=0.02, rseg=2, nx=8, bend=lambda x: (0.0, 0.2 * (1 - (x / 0.75) ** 2) - 0.1),
           colfn=wood_fn(WOOD, seed=35), end_r=0.016)
    B.rbox((0, -0.04, 2.62), (1.36, 0.02, 0.26), r=0.008, rseg=1, nx=8, bend=lambda x: (0.0, 0.2 * (1 - (x / 0.75) ** 2) - 0.1),
           colfn=cream, end_r=0.006)
    B.rbox((0, 0, 2.22), (2 * PX - 0.1, 0.1, 0.09), r=0.03, rseg=2, nx=8, colfn=wood_fn(WOOD_D, seed=34), end_r=0.02)
    # painted sunflower badge on the left of the board
    sunflower_badge(B, (-0.56, -0.06, 2.7), 0.14, rng)
    # vine along the arch
    vp = []
    for i in range(11):
        t = i / 10
        x = lerp(-AW / 2 + 0.06, AW / 2 - 0.06, t)
        z = 2.48 + 0.28 * (1 - (x / (AW / 2)) ** 2) + 0.07
        vp.append(Vector((x, -0.08 + 0.03 * math.sin(t * 17), z)))
    B.tube(vp, 0.012, segs=5, cap0=True, cap1=True, col=0x5f9a3a, mat='farm_plant')
    for i, p in enumerate(vp):
        if abs(p.x) < 0.7 and i % 2:
            continue
        for s in (-1, 1):
            B.leaf(p, -math.pi / 2 + rng.uniform(-0.9, 0.9), math.radians(rng.uniform(-20, 40)), 0.09, 0.06, bend=-0.5, curl=0.3,
                   nu=3, nv=1, shape='oval', col=jitter(0x4fae44, 0.06, rng), col_tip=0x8fd468)
        if i % 3 == 0:
            flower5(B, p + Vector((0, -0.04, 0.02)), 0.045, rng, col=[0xff8ab0, 0xffffff, 0xffb8d0][i % 3], centre=0xf6c33a, pitch=-60)
    for sx in (-1, 1):
        pp = [Vector((sx * PX + 0.09 * math.sin(i * 1.3), -0.1, 0.1 + i * 0.24)) for i in range(10)]
        B.tube(pp, 0.01, segs=4, cap0=True, cap1=True, col=0x5f9a3a, mat='farm_plant')
        for i, p in enumerate(pp[1:]):
            B.leaf(p, -math.pi / 2 + rng.uniform(-0.8, 0.8), math.radians(rng.uniform(0, 40)), 0.08, 0.055, bend=-0.5, curl=0.3,
                   nu=3, nv=1, shape='oval', col=jitter(0x4fae44, 0.06, rng), col_tip=0x8fd468)
            if i % 3 == 1:
                flower5(B, p + Vector((0, -0.04, 0)), 0.04, rng, col=0xff8ab0, centre=0xf6c33a, pitch=-60)
    # pumpkins and a sheaf at the post feet
    for (x, y, r, c) in ((-1.15, -0.25, 0.16, 0xf28a26), (-1.32, 0.05, 0.11, 0xf5a43a), (1.18, -0.22, 0.13, 0xe9802a)):
        pumpkin_body(B, (x, y, 0.0), r, r * 1.2, rng, col=c, segs=14)
    gate = B.build('plaza_gate', ground_ao=(0.1, 0.65), ao=dict(samples=12, dist=0.3, strength=0.4))
    left = gate_leaf('plaza_gate_leaf_l', -1)
    right = gate_leaf('plaza_gate_leaf_r', 1)
    return [gate, left, right]

def build_signpost():
    """2.6 m post with two blank arrow boards (text in game); faces -Y (+Z local, plaza side)."""
    rng = random.Random(2007)
    B = Builder(14)
    vpost(B, 0, 0, -0.02, 2.5, 0.12, seed=50, col=WOOD_D)
    B.sphere((0, 0, 2.53), 0.08, scale=(1, 1, 0.7), segs=10, rings=6, col=0xe7b874, mat='farm_gloss')
    for (z, d, rz, col, L) in ((2.2, 1, 0.1, WOOD_L, 0.86), (1.86, 1, -0.06, WOOD, 0.74)):
        fs = B.rbox((d * (L / 2 - 0.03), -0.075, z), (L, 0.045, 0.24), r=0.014, rseg=2, nx=6, colfn=wood_fn(col, seed=z * 10),
                    taper=lambda t: 1.0 if t < 0.82 else max(0.12, 1 - ((t - 0.82) / 0.18) * 0.88), end_r=0.01)
        B.transform(fs, Matrix.Translation((0, 0, z)) @ Matrix.Rotation(rz, 4, 'Y') @ Matrix.Translation((0, 0, -z)))
    # small farm picture: a carrot hanging under the arrows
    B.tube([(0.0, -0.08, 1.62), (0.0, -0.08, 1.48), (0.0, -0.08, 1.36)], [0.035, 0.028, 0.0], segs=8, cap0=True,
           col=0xf98a2a, mat='farm_gloss')
    for k in range(3):
        B.leaf((0.0, -0.08, 1.62), math.pi / 2 + (k - 1) * 0.5, math.radians(70), 0.1, 0.03, bend=-0.3, curl=0.2, nu=3, nv=1,
               shape='lance', col=0x4fae44)
    for k in range(3):
        grass_tuft(B, rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rng, 3, 0.14)
    return B.build('signpost', ground_ao=(0.08, 0.65))
