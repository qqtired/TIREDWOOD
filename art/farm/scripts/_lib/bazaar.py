# Bazaar: Семечкин's seed stall-cart and Дядюшка Гриб's porcini kiosk (design-v11 §16.3, level.md objects).
# Both: front (customers) = Blender +Y = game -Z at yaw 0; the NPC stands behind (Blender -Y).
# Needs props_common, crops (flower5, pumpkin_body, ...) and carts (solid_wheel, sack, crate_box, lantern).

def seed_sack(B, c, r, h, seeds, rng):
    """Open burlap sack with a rolled rim, filled with seeds of colour `seeds`."""
    c = Vector(c)
    prof = [(0.0, 0.0), (r * 0.85, 0.0), (r, h * 0.2), (r * 1.02, h * 0.7), (r * 0.94, h * 0.92), (r * 1.06, h),
            (r * 1.1, h * 1.04), (r * 0.98, h * 1.0)]
    B.lathe(prof, segs=10, c=c, col=lambda co, n: mixc(0xcdb48a, 0xe6d2a8, 0.5 + noise.noise(co * 14) * 0.5), mat='farm_cloth',
            close_top=False, rmod=lambda a, t, rr, z: 1.0 + 0.05 * math.sin(a * 3 + c.x * 7))
    def warp(co):
        return co + Vector((0, 0, noise.noise(co * 25) * 0.008))
    B.sphere(c + Vector((0, 0, h * 0.94)), 1.0, scale=(r * 0.98, r * 0.98, r * 0.3), segs=10, rings=3, warp=warp,
             col=lambda co, n: mixc(seeds, mixc(seeds, 0xffffff, 0.3), 0.5 + noise.noise(co * 40) * 0.5), mat='farm_soft')


def seed_packet(B, c, col, rz=0.0, tilt=0.25):
    """Paper seed packet: cream envelope with a coloured picture patch (no text)."""
    c = Vector(c)
    m = B.mark()
    B.rbox((0, 0, 0.07), (0.1, 0.012, 0.14), r=0.004, rseg=1, nx=1, colfn=lambda co: 0xfbefd6, end_r=0.003)
    B.box((0, -0.008, 0.075), (0.07, 0.004, 0.07), col=col, mat='farm_soft')
    B.transform(B.since(m), Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(-tilt, 4, 'X'))


def sunflower_sign(B, c, R, rng):
    """Round sunflower sign facing +Y with a painted seed sack in the middle (no text)."""
    c = Vector(c)
    m = B.mark()
    B.sphere((0, 0, 0), R, scale=(1, 1, 0.12), segs=16, rings=3, col=lambda co, n: mixc(0x8a5a2c, 0xa8703a, 0.5 + noise.noise(co * 9) * 0.5),
             mat='farm_soft')
    n = 14
    for k in range(n):
        a = TAU * k / n
        B.leaf((math.cos(a) * R * 0.92, math.sin(a) * R * 0.92, 0.0), a, math.radians(4), R * 0.55, R * 0.3, bend=0.1, curl=0.25,
               fold=0.1, nu=3, nv=1, shape='lance', col=0xffc928, col_base=0xf2a81e, col_tip=0xffe070)
    # the sack picture: cream disc + brown sack silhouette + tie
    B.sphere((0, 0, R * 0.13), R * 0.66, scale=(1, 1, 0.05), segs=14, rings=2, col=0xfbefd6, mat='farm_soft')
    B.sphere((0, -R * 0.1, R * 0.17), 1.0, scale=(R * 0.34, R * 0.36, R * 0.03), segs=10, rings=2, col=0xc49a5c, mat='farm_soft')
    B.sphere((0, R * 0.3, R * 0.17), 1.0, scale=(R * 0.14, R * 0.1, R * 0.03), segs=8, rings=2, col=0xc49a5c, mat='farm_soft')
    B.box((0, R * 0.2, R * 0.19), (R * 0.22, R * 0.05, R * 0.02), col=0x7a4a22, mat='farm_soft')
    for (dx, dy) in ((-0.08, -0.1), (0.07, -0.16), (0.0, -0.02)):
        B.sphere((dx * R * 2, dy * R * 2, R * 0.2), R * 0.045, scale=(0.7, 1, 0.4), segs=5, rings=2, col=0x3a2a1e, mat='farm_soft')
    B.transform(B.since(m), Matrix.Translation(c) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))


def striped_awning(B, x0, x1, y_back, y_front, z_back, z_front, cols, stripes=8, valance=0.16):
    def fn(u, v):
        return Vector((lerp(x0, x1, u), lerp(y_back, y_front, v), lerp(z_back, z_front, v) - math.sin(v * math.pi) * 0.04))
    fs = B.grid(fn, stripes * 2, 2, mat='farm_cloth', orient=None, col=cols[0])
    for f in fs:
        cu = (f.calc_center_median().x - x0) / (x1 - x0)
        c = cols[int(cu * stripes) % 2]
        for lp in f.loops:
            lp[B.col] = lin(c)
        if f.normal.z < 0:
            f.normal_flip()
    sw = (x1 - x0) / stripes
    for i in range(stripes):
        xa, xb = x0 + i * sw, x0 + (i + 1) * sw
        def vf(u, v, xa=xa, xb=xb):
            return Vector((lerp(xa, xb, u), y_front, z_front - v * (valance * 0.6 + valance * 0.4 * math.sin(u * math.pi))))
        g = B.grid(vf, 3, 1, col=cols[i % 2], mat='farm_cloth', orient=None)
        for f in g:
            if f.normal.y < 0:
                f.normal_flip()


def build_seed_stall():
    """Семечкин: stall-cart 3 x 1.8 m, striped awning (green / cream), open seed sacks and packets on the counter,
    sunflower sign at 3.2 m. Front = +Y (counter to the customers)."""
    rng = random.Random(4001)
    B = Builder(401)
    # cart body on two wheels
    zb, zt = 0.32, 0.98
    B.rbox((0, 0.3, (zb + zt) / 2), (2.5, 0.78, zt - zb), r=0.03, rseg=1, nx=4, colfn=wood_fn(0xc98448, seed=1), end_r=0.025)
    B.box((0, 0.3 + 0.392, 0.62), (2.3, 0.012, 0.16), col=0x5fae4a, mat='farm_soft')
    for sx in (-1, 1):
        B.box((sx * 0.62, 0.3 + 0.392, 0.62), (0.12, 0.014, 0.4), col=0xfbefd6, mat='farm_soft')
    B.rbox((0, 0.32, zt + 0.03), (2.7, 0.95, 0.06), r=0.015, rseg=1, nx=4, colfn=wood_fn(WOOD_L, seed=2), end_r=0.012)
    for sx in (-1, 1):
        solid_wheel(B, sx * 1.3, 0.3, 0.38, 0.08, rng)
    for sy in (-1, 1):
        B.rbox((-1.18, 0.3 + sy * 0.3, 0.16), (0.32, 0.08, 0.08), r=0.02, rseg=1, nx=1, rot=UP, colfn=wood_fn(WOOD_D, seed=7 + sy), end_r=0.015)
    # awning posts: front posts stand on the counter, back posts on the ground
    for sx in (-1, 1):
        vpost(B, sx * 1.28, 0.7, zt + 0.06, 2.3, 0.07, seed=20 + sx, col=WOOD_D)
        vpost(B, sx * 1.28, -0.78, -0.02, 2.5, 0.09, seed=24 + sx, col=WOOD_D)
        B.tube([(sx * 1.28, -0.78, 2.46), (sx * 1.28, 0.7, 2.26)], 0.03, segs=5, col=WOOD_D, mat='farm_soft')
    striped_awning(B, -1.42, 1.42, -0.9, 1.0, 2.55, 2.27, (0x5fae4a, 0xfbf0dc), stripes=8)
    # counter goods: open sacks of seeds + a tray of packets
    for (x, r, h, seeds) in ((-0.95, 0.17, 0.3, 0x3a2a1e), (-0.55, 0.15, 0.26, 0xf0e2b8), (0.55, 0.16, 0.28, 0xe2b64a),
                             (0.95, 0.15, 0.25, 0x8a5a2c)):
        seed_sack(B, (x, 0.2, zt + 0.06), r, h, seeds, rng)
    B.rbox((0.0, 0.55, zt + 0.08), (0.62, 0.3, 0.05), r=0.01, rseg=1, nx=2, colfn=wood_fn(WOOD, seed=5), end_r=0.008)
    pics = [0xe8364f, 0xf28a26, 0x7ccf4f, 0xffc928, 0xc66bd8, 0xf06a8a]
    for k in range(6):
        seed_packet(B, (-0.25 + k * 0.1, 0.56, zt + 0.1), pics[k], rz=rng.uniform(-0.1, 0.1))
    # sunflower sign on a pole at the back
    B.tube([(0, -0.8, 2.5), (0, -0.8, 2.92)], 0.035, segs=6, col=WOOD_D, mat='farm_soft')
    sunflower_sign(B, (0, -0.76, 3.2), 0.34, rng)
    # sacks on the ground and a pumpkin by the wheel
    for (x, y, rz) in ((-1.55, 0.75, 0.3), (1.55, 0.8, -0.4)):
        sack(B, (x, y, 0.0), rng, rz)
    pumpkin_body(B, Vector((1.0, 0.95, 0.0)), 0.17, 0.24, rng, segs=10, ribs=6)
    return B.build('seed_stall', ground_ao=(0.1, 0.7), ao=dict(samples=10, dist=0.4, strength=0.4))


def build_grib_kiosk():
    """Дядюшка Гриб: porcini kiosk 3 x 1.8 m (cream stem walls, velvet brown cap with a sponge underside), window +Y
    with a counter, abacus, baskets. Returns (kiosk, scales) — scales: beam with two pans, origin on the pivot (rocks)."""
    rng = random.Random(4002)
    B = Builder(402)
    SX, SY = 1.22, 0.86
    sc = Matrix.Diagonal((SX, SY, 1.0, 1.0))
    wz0, wz1, ww = 1.0, 1.7, 1.1
    def stem_col(co, n):
        a = math.atan2(co.y, co.x)
        return mixc(0xecd2a4, 0xfbe6c0, 0.45 + noise.noise(Vector((a * 4, co.z * 2, 0))) * 0.35 + max(0, n.z) * 0.2)
    def inner_col(co, n):
        return mixc(0x8a5a36, 0xa8744a, 0.5 + noise.noise(co * 4) * 0.5) if co.z > 0.05 else 0x6a4428
    # outer stem wall and an inner shell (floor, walls, ceiling, normals inward): the window is a real opening,
    # so the NPC standing inside is visible
    shell = B.bm.faces.layers.int.new('shell')
    B.lathe([(0.97, 0.0), (1.02, 0.35), (1.0, 1.2), (0.94, 2.05), (0.0, 2.05)], segs=20, c=(0, 0, 0), col=stem_col, mat='farm_soft',
            close_bot=False)
    for f_ in B.bm.faces:
        f_[shell] = 1
    m = B.mark()
    B.lathe([(0.0, 0.02), (0.93, 0.02), (0.95, 0.4), (0.94, 1.2), (0.89, 1.98), (0.0, 1.98)], segs=20, c=(0, 0, 0), col=inner_col,
            mat='farm_soft')
    for f_ in B.since(m):
        f_[shell] = 2
        f_.normal_flip()
    B.transform(list(B.bm.faces), sc)
    for co_, no_ in (((ww / 2, 0, 0), (1, 0, 0)), ((-ww / 2, 0, 0), (1, 0, 0)), ((0, 0, wz0), (0, 0, 1)), ((0, 0, wz1), (0, 0, 1))):
        bmesh.ops.bisect_plane(B.bm, geom=list(B.bm.verts) + list(B.bm.edges) + list(B.bm.faces), plane_co=co_, plane_no=no_)
    kill = []
    for f_ in B.bm.faces:
        c_ = f_.calc_center_median()
        if c_.y > 0.3 and abs(c_.x) < ww / 2 and wz0 < c_.z < wz1:
            kill.append(f_)
    bmesh.ops.delete(B.bm, geom=kill, context='FACES')
    B.bm.normal_update()
    B.paint([f_ for f_ in B.bm.faces if f_[shell] == 1], stem_col, 'farm_soft')
    B.paint([f_ for f_ in B.bm.faces if f_[shell] == 2], inner_col, 'farm_soft')
    B.protect(list(B.bm.faces))
    B.bm.faces.layers.int.remove(shell)
    # inside: a back shelf with jars, seen through the window
    B.box((0, -SY * 0.8, 1.35), (0.9, 0.2, 0.03), col=0xc8945c, mat='farm_soft')
    for k, c_ in enumerate((0xf2b33a, 0xe8564a, 0x9acb5a, 0xf28a26)):
        B.lathe([(0.0, 0.0), (0.05, 0.0), (0.055, 0.11), (0.04, 0.13), (0.0, 0.13)], segs=6, c=(-0.3 + k * 0.2, -SY * 0.8, 1.365), col=c_, mat='farm_gloss')
    # cap: sponge underside + velvet dome
    m = B.mark()
    B.lathe([(0.8, 2.02), (1.2, 2.05), (1.3, 2.12)], segs=24, c=(0, 0, 0), col=lambda co, n: mixc(0xd9c470, 0xeadb94, 0.5 + noise.noise(co * 6) * 0.5),
            mat='farm_soft', close_top=False, close_bot=False)
    B.lathe([(1.3, 2.12), (1.27, 2.36), (1.06, 2.66), (0.66, 2.86), (0.0, 2.93)], segs=24, c=(0, 0, 0), mat='farm_soft',
            col=lambda co, n: mixc(0x7a4826, 0xb27646, smooth01(0.35 + noise.noise(co * 3) * 0.3 + max(0, 1 - co.z + 2.2) * 0.25)))
    B.transform(B.since(m), Matrix.Diagonal((SX * 1.08, SY * 1.18, 1.0, 1.0)))
    # window (front, +Y): frame, open shutters, counter
    yw = SY * 1.0 + 0.012
    for (cx, cz, sx, sz) in ((0, wz1 + 0.04, ww + 0.16, 0.08), (0, wz0 - 0.03, ww + 0.16, 0.06), (-ww / 2 - 0.05, (wz0 + wz1) / 2, 0.08, wz1 - wz0 + 0.1),
                             (ww / 2 + 0.05, (wz0 + wz1) / 2, 0.08, wz1 - wz0 + 0.1)):
        B.rbox((cx, yw - 0.02 + (0.0 if abs(cx) < 0.1 else -0.06), cz), (sx, 0.06, sz), r=0.012, rseg=1, nx=2, colfn=wood_fn(WOOD, seed=int(cx * 10) + 30), end_r=0.01)
    for sx in (-1, 1):
        m = B.mark()
        B.rbox((sx * 0.2, 0, 0), (0.4, 0.03, wz1 - wz0), r=0.01, rseg=1, nx=2, colfn=wood_fn(0x9c5b2c, seed=40 + sx), end_r=0.008)
        B.box((sx * 0.2, 0.018, 0), (0.3, 0.006, 0.08), col=0xe7b874, mat='farm_soft')
        B.transform(B.since(m), Matrix.Translation((sx * (ww / 2 + 0.1), yw - 0.08, (wz0 + wz1) / 2)) @ Matrix.Rotation(sx * -1.0, 4, 'Z'))
    B.rbox((0, yw + 0.12, wz0 - 0.05), (ww + 0.4, 0.34, 0.05), r=0.012, rseg=1, nx=3, colfn=wood_fn(WOOD_L, seed=44), end_r=0.01)
    for sx in (-1, 1):
        B.tube([(sx * 0.5, yw - 0.02, wz0 - 0.35), (sx * 0.5, yw + 0.24, wz0 - 0.07)], 0.014, segs=4, col=WOOD_D, mat='farm_soft')
    # abacus on the counter
    ax, ay, az = 0.38, yw + 0.14, wz0 - 0.02
    for (cx, cz, sx_, sz_) in ((0, 0.0, 0.32, 0.02), (0, 0.22, 0.32, 0.02), (-0.15, 0.11, 0.02, 0.24), (0.15, 0.11, 0.02, 0.24)):
        B.box((ax + cx, ay, az + cz), (sx_, 0.025, sz_), col=0x7a4a22, mat='farm_soft')
    for row, zz in enumerate((0.05, 0.11, 0.17)):
        B.cyl((ax - 0.14, ay, az + zz), (ax + 0.14, ay, az + zz), 0.004, segs=3, caps=False, col=0x5e6266, mat='farm_metal')
        for k in range(4):
            x = ax - 0.1 + k * 0.035 + (0.08 if k >= 2 + row % 2 else 0)
            B.cyl((x - 0.012, ay, az + zz), (x + 0.012, ay, az + zz), 0.017, segs=6, col=[0xe8364f, 0xffc928, 0x5fae4a][row], mat='farm_gloss')
    # scale base (pillar) on the counter; beam + pans are a separate object
    sxp, syp = -0.36, yw + 0.13
    B.cyl((sxp, syp, wz0 - 0.025), (sxp, syp, wz0 + 0.0), 0.08, segs=10, col=BRASS, mat='farm_gold')
    B.tube([(sxp, syp, wz0), (sxp, syp, wz0 + 0.3)], 0.012, segs=6, col=BRASS, mat='farm_gold')
    # lantern on a bracket by the window
    B.tube([(ww / 2 + 0.22, SY * 0.8, 1.95), (ww / 2 + 0.22, SY * 0.8 + 0.3, 1.95), (ww / 2 + 0.22, SY * 0.8 + 0.3, 1.85)], 0.012, segs=4,
           cap0=False, col=0x3a3a3e, mat='farm_metal')
    lantern(B, (ww / 2 + 0.22, SY * 0.8 + 0.3, 1.74), 0.09)
    # side door (-X)
    m = B.mark()
    B.rbox((0, 0, 0.85), (0.06, 0.62, 1.6), r=0.02, rseg=1, nx=3, colfn=wood_fn(0x9c5b2c, seed=50, axis='y'), end_r=0.02)
    B.sphere((0.04, -0.2, 0.85), 0.03, segs=6, rings=4, col=BRASS, mat='farm_gold')
    B.transform(B.since(m), Matrix.Translation((-SX * 0.97 - 0.02, 0, 0)))
    # baskets with produce at the foot, little mushrooms
    for (x, y, rr, goods) in ((0.95, 0.85, 0.2, 0xe8364f), (-0.95, 0.9, 0.17, 0xf28a26), (1.3, 0.35, 0.16, 0xc8945c)):
        basket(B, (x, y, 0.0), rr, goods, rng)
    for (x, y, s) in ((-1.1, 0.5, 0.09), (-1.2, 0.35, 0.06)):
        B.cyl((x, y, -0.01), (x, y, s * 1.2), s * 0.35, segs=6, col=0xf6ead0, mat='farm_soft')
        B.sphere((x, y, s * 1.2), s, scale=(1, 1, 0.6), segs=8, rings=4, col=0x8a5530, mat='farm_soft')
    kiosk = B.build('grib_kiosk', ground_ao=(0.12, 0.7), ao=dict(samples=10, dist=0.4, strength=0.4))
    # scales: beam + chains + two pans (origin = pivot)
    S = Builder(403)
    S.tube([(-0.2, 0, 0), (0.2, 0, 0)], 0.008, segs=5, col=BRASS, mat='farm_gold')
    S.sphere((0, 0, 0), 0.02, segs=6, rings=4, col=BRASS, mat='farm_gold')
    for sx in (-1, 1):
        for k in range(3):
            a = TAU * k / 3
            S.tube([(sx * 0.2, 0, 0), (sx * 0.2 + math.cos(a) * 0.07, math.sin(a) * 0.07, -0.16)], 0.0025, segs=3, cap0=False, cap1=False,
                   col=BRASS, mat='farm_gold')
        S.lathe([(0.0, -0.18), (0.06, -0.175), (0.085, -0.155), (0.08, -0.15), (0.0, -0.16)], segs=10, c=(sx * 0.2, 0, 0), col=BRASS,
                mat='farm_gold')
    scales = S.build('grib_scales', ground_ao=None)
    return kiosk, scales, Vector((sxp, syp, wz0 + 0.3))


def basket(B, c, r, goods, rng):
    c = Vector(c)
    prof = [(0.0, 0.0), (r * 0.75, 0.0), (r, r * 0.7), (r * 1.06, r * 0.78), (r * 0.98, r * 0.76)]
    B.lathe(prof, segs=10, c=c, mat='farm_soft', close_top=False,
            col=lambda co, n: mixc(0xb8864a, 0xd8a868, abs(math.sin((co.z - c.z) * 80 + math.atan2(co.y - c.y, co.x - c.x) * 3))))
    for k in range(4):
        a = TAU * k / 4 + rng.random()
        B.sphere(c + Vector((math.cos(a) * r * 0.45, math.sin(a) * r * 0.45, r * 0.72)), r * 0.32, segs=6, rings=4,
                 col=jitter(goods, 0.06, rng), mat='farm_gloss')
    B.tube([c + Vector((-r * 0.9, 0, r * 0.75)), c + Vector((0, 0, r * 1.6)), c + Vector((r * 0.9, 0, r * 0.75))], r * 0.05, segs=4,
           cap0=False, cap1=False, col=0xb8864a, mat='farm_soft')


BRASS = 0xd8a640
