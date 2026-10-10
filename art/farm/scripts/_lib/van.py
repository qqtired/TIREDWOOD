# Van-shop «Фургон»: old cream van with a terracotta stripe. Nose to game -Z (Blender +Y), serving hatch on the west (-X).
# Footprint fits the 2 x 4.5 m stand box (layout.json objects.van). Wheels are separate (spin), attach points in extras.
CREAM = 0xf3e2c0
CREAM_D = 0xe0c9a0
TERRA = 0xc8553d
TERRA_D = 0xa8432f
TIRE = 0x3a3436
CHROME = 0xc9ccd0
GLASS = 0x9cc4d6

VAN_SECTIONS = [
    # y, half-width, z bottom, z top, corner radius
    (-2.12, 0.84, 0.62, 2.12, 0.2),
    (-2.08, 0.9, 0.56, 2.22, 0.28),
    (-1.95, 0.92, 0.54, 2.28, 0.32),
    (-1.0, 0.92, 0.54, 2.3, 0.32),
    (0.2, 0.92, 0.54, 2.3, 0.32),
    (1.2, 0.92, 0.54, 2.28, 0.32),
    (1.5, 0.92, 0.54, 2.18, 0.32),
    (1.82, 0.9, 0.54, 1.62, 0.3),
    (2.05, 0.87, 0.55, 1.3, 0.28),
    (2.2, 0.8, 0.6, 1.08, 0.22),
]
WHEELS = [(-0.8, -1.3), (0.8, -1.3), (-0.8, 1.4), (0.8, 1.4)]
WR = 0.36
HATCH = (-1.45, 0.85, 1.12, 1.98)   # y0, y1, z0, z1 on the -X side

def van_section_ring(y, hw, zb, zt, r, rseg=3):
    hz = (zt - zb) / 2
    zc = (zb + zt) / 2
    return [Vector((yy, y, zz + zc)) for (yy, zz) in _rr_ring(hw, hz, r, rseg)]

def van_body(B, rng, hatch_open):
    rings = []
    vcol = {}
    for (y, hw, zb, zt, r) in VAN_SECTIONS:
        ring = [B.bm.verts.new(p) for p in van_section_ring(y, hw, zb, zt, r)]
        rings.append(ring)
    faces = []
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for k in range(n):
            k1 = (k + 1) % n
            faces.append(B.bm.faces.new((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k])))
    faces.append(B.bm.faces.new(list(reversed(rings[0]))))
    faces.append(B.bm.faces.new(rings[-1]))
    B.bm.normal_update()
    B._orient_out(faces, Vector((0, 0, 1.4)))
    # cut loops: stripe band, hatch rectangle, a few extra along the length for smooth shading
    hy0, hy1, hz0, hz1 = HATCH
    cuts = [((0, 0, z), (0, 0, 1)) for z in (0.92, 0.96, 1.2, 1.24, hz0, hz1, 0.72)]
    cuts += [((0, y, 0), (0, 1, 0)) for y in (hy0, hy1, -1.6, -0.4, 0.5, 1.0)]
    for co, no in cuts:
        geom = list(B.bm.verts) + list(B.bm.edges) + list(B.bm.faces)
        bmesh.ops.bisect_plane(B.bm, geom=geom, plane_co=co, plane_no=no)
    B.bm.normal_update()
    if hatch_open:
        kill = [f for f in B.bm.faces if f.normal.x < -0.9 and hy0 < f.calc_center_median().y < hy1 and hz0 < f.calc_center_median().z < hz1]
        bmesh.ops.delete(B.bm, geom=kill, context='FACES')
    allf = list(B.bm.faces)
    # colour per face (face-corner colours) so the stripe edges stay crisp
    cream = lambda co, nrm: mixc(CREAM, 0xfff4dc, max(0, nrm.z) * 0.5)
    for fc in allf:
        z = fc.calc_center_median().z
        if 0.96 < z < 1.2:
            c = TERRA
        elif 1.2 <= z < 1.24 or 0.92 < z <= 0.96:
            c = CREAM_D
        elif z < 0.72:
            c = mixc(CREAM_D, 0xc9b088, 0.4)
        else:
            c = cream
        B.paint([fc], c, 'farm_gloss')
    B.protect(allf)  # keep the terracotta stripe loops when fitting the budget
    return allf

def surface_patch(B, side, y0, y1, z0, z1, col, mat, inset=0.0, out=0.015, nu=2, nv=2, x_override=None):
    """A thin patch following the body side (x = +-hw) — windows, hatch. side -1 = -X."""
    def fn(u, v):
        y = lerp(y0, y1, u)
        z = lerp(z0, z1, v)
        hw = body_half_width(y, z)
        x = x_override if x_override is not None else side * (hw + out)
        return Vector((x, y, z))
    fs = B.grid(fn, nu, nv, col=col, mat=mat, orient=None)
    if sum(f.normal.x for f in fs) * side < 0:
        for f in fs:
            f.normal_flip()
        B.bm.normal_update()
    for f in fs:
        f.smooth = False
    return fs

def body_half_width(y, z):
    # side is vertical between corner radii; approximate with section interpolation
    secs = VAN_SECTIONS
    for i in range(len(secs) - 1):
        if secs[i][0] <= y <= secs[i + 1][0]:
            t = (y - secs[i][0]) / (secs[i + 1][0] - secs[i][0])
            return lerp(secs[i][1], secs[i + 1][1], t)
    return secs[-1][1]

SLOPE_N = Vector((0, 0.56, 0.32)).normalized()

def slope_pt(x, y, off=0.016):
    zs = 2.18 + (y - 1.5) / 0.32 * (1.62 - 2.18)
    return Vector((x, y, zs)) + SLOPE_N * off

def windshield(B):
    def fn(u, v):
        return slope_pt(lerp(-0.62, 0.62, u), lerp(1.54, 1.79, v))
    fs = B.grid(fn, 3, 2, col=GLASS, mat='farm_gloss', orient=None,
                colfn=lambda u, v: mixc(GLASS, 0xe4f2f8, max(0, 0.6 - abs(u - 0.3)) * 0.9))
    if sum(f.normal.z + f.normal.y for f in fs) < 0:
        for f in fs:
            f.normal_flip()
        B.bm.normal_update()
    for f in fs:
        f.smooth = False
    # frame
    for y in (1.535, 1.795):
        B.tube([slope_pt(-0.64, y, 0.01), slope_pt(0.64, y, 0.01)], 0.022, segs=5, col=CREAM_D, mat='farm_gloss')
    for x in (-0.64, 0.0, 0.64):
        B.tube([slope_pt(x, 1.535, 0.01), slope_pt(x, 1.795, 0.01)], 0.018, segs=5, col=CREAM_D, mat='farm_gloss')

def wheel_arch(B, x, y):
    side = 1 if x > 0 else -1
    pts = []
    for k in range(9):
        a = math.pi * k / 8
        pts.append(Vector((x + side * 0.12, y + math.cos(a) * (WR + 0.08), WR + math.sin(a) * (WR + 0.08))))
    B.tube(pts, 0.05, segs=6, col=CREAM_D, mat='farm_gloss', prof=[1, 1, 0.6, 0.6, 0.6, 1])

def build_wheel():
    B = Builder(80)
    prof = [(0.0, -0.11), (0.2, -0.11), (0.3, -0.115), (0.35, -0.09), (WR, -0.04), (WR, 0.04), (0.35, 0.09), (0.3, 0.115), (0.2, 0.11), (0.0, 0.11)]
    def cf(co, n):
        r = math.hypot(co.x, co.y)
        if r < 0.15:
            return CHROME
        if r < 0.24:
            return CREAM
        return TIRE
    fs = B.lathe(prof, segs=20, c=(0, 0, 0), col=cf, mat='farm_soft')
    B.paint(fs, cf, 'farm_soft')
    # hub caps (both sides)
    for s in (-1, 1):
        B.sphere((0, 0, s * 0.11), 0.12, scale=(1, 1, 0.25), segs=12, rings=4, col=CHROME, mat='farm_metal')
    w = B.build('van_wheel', ground_ao=None)
    # axle along X: rotate so lathe axis Z -> X
    w.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y'))
    return w

def crate(B, c, s=(0.42, 0.3, 0.22), produce=None, rng=None, rz=0.0, col=0xd6a468):
    c = Vector(c)
    M = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z')
    m = B.mark()
    sx, sy, sz = s
    for zz in (0.03, sz - 0.05):
        for yy in (-sy / 2 + 0.01, sy / 2 - 0.01):
            B.box((0, yy, zz + 0.02), (sx, 0.02, 0.06), col=jitter(col, 0.06, rng or random), mat='farm_soft')
    for xx in (-sx / 2 + 0.012, sx / 2 - 0.012):
        B.box((xx, 0, sz / 2), (0.024, sy - 0.02, sz), col=mulc(col, 0.88), mat='farm_soft')
    B.box((0, 0, 0.012), (sx - 0.02, sy - 0.02, 0.012), col=mulc(col, 0.8), mat='farm_soft')
    B.transform(B.since(m), M)
    if produce and rng:
        kind, colr = produce
        nx, ny = 3, 2
        for i in range(nx):
            for j in range(ny):
                p = M @ Vector(((i - (nx - 1) / 2) * sx / nx * 0.95, (j - (ny - 1) / 2) * sy / ny * 0.95, sz - 0.04 + rng.uniform(0, 0.025)))
                if kind == 'ball':
                    B.sphere(p, sx / nx * 0.45, segs=6, rings=4, col=jitter(colr, 0.06, rng), mat='farm_gloss')
                elif kind == 'carrot':
                    q = p + Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), 0.02))
                    B.tube([p, q + Vector((0.09, 0, 0.0))], [0.025, 0.0], segs=5, cap0=True, col=colr, mat='farm_gloss')
                elif kind == 'leaf':
                    B.sphere(p, sx / nx * 0.5, scale=(1, 1, 0.7), segs=6, rings=4, col=jitter(colr, 0.06, rng), mat='farm_plant')

def awning(B, y0, y1, z, depth, drop, stripes=8, open_=True):
    """Striped awning on the -X side. Terracotta / cream stripes, scalloped edge."""
    if not open_:
        # rolled awning: a striped cylinder under the roof edge
        sw0 = (y1 - y0) / stripes
        B.cyl((-0.98, y0 - 0.05, z + 0.02), (-0.98, y1 + 0.05, z + 0.02), 0.075, segs=10, mat='farm_cloth',
              col=lambda co, n: TERRA if int((co.y - y0) / sw0) % 2 == 0 else 0xfbf0dc)
        for e in (y0 - 0.06, y1 + 0.06):
            B.sphere((-0.98, e, z + 0.02), 0.03, segs=6, rings=4, col=CHROME, mat='farm_metal')
        return
    sw = (y1 - y0) / stripes
    def fn(u, v):
        y = lerp(y0, y1, u)
        x = -0.95 - v * depth
        zz = z - v * drop - math.sin(v * math.pi) * 0.03
        return Vector((x, y, zz))
    def colfn(u, v):
        i = int(u * stripes - 1e-6)
        return TERRA if i % 2 == 0 else 0xfbf0dc
    nu = stripes * 2
    fs = B.grid(fn, nu, 3, mat='farm_cloth', colfn=colfn, orient=None)
    # hard stripe edges: duplicate colours per face based on face centre
    for f in fs:
        cu = (f.calc_center_median().y - y0) / (y1 - y0)
        c = TERRA if int(cu * stripes) % 2 == 0 else 0xfbf0dc
        for lp in f.loops:
            lp[B.col] = lin(c)
    # scalloped valance
    for i in range(stripes):
        ya, yb = y0 + i * sw, y0 + (i + 1) * sw
        def vf(u, v, ya=ya, yb=yb):
            y = lerp(ya, yb, u)
            x = -0.95 - depth
            dz = 0.12 * (1 - v) + 0.05 * math.sin(u * math.pi) * (1 - v) * 0
            zz = z - drop - v * (0.1 + 0.05 * math.sin(u * math.pi))
            return Vector((x, y, zz))
        c = TERRA if i % 2 == 0 else 0xfbf0dc
        B.grid(vf, 3, 1, col=c, mat='farm_cloth', orient=None)
    # support arms
    for y in (y0 + 0.05, y1 - 0.05):
        B.tube([(-0.95, y, z - 0.35), (-0.95 - depth, y, z - drop - 0.01)], 0.015, segs=5, col=0x8a6a48, mat='farm_metal')

def build_van(open_):
    rng = random.Random(90 if open_ else 91)
    B = Builder(81 if open_ else 82)
    van_body(B, rng, open_)
    windshield(B)
    # side cab windows
    for s in (-1, 1):
        surface_patch(B, s, 1.25, 1.62, 1.45, 2.0, GLASS, 'farm_gloss', nu=2, nv=2)
    # rear windows (two small)
    for x in (-0.42, 0.42):
        def fn(u, v, x=x):
            return Vector((x + lerp(-0.26, 0.26, u), -2.1 - 0.016, lerp(1.55, 1.98, v)))
        fs = B.grid(fn, 1, 1, col=GLASS, mat='farm_gloss', orient=None)
        for f in fs:
            if f.normal.y > 0:
                f.normal_flip()
            f.smooth = False
    # headlights, grill, bumpers
    for x in (-0.55, 0.55):
        B.cyl((x, 2.17, 0.9), (x, 2.235, 0.9), 0.12, segs=12, col=CHROME, mat='farm_metal')
        B.sphere((x, 2.235, 0.9), 0.095, scale=(1, 0.45, 1), segs=10, rings=5, col=0xfff6d8, mat='farm_gloss')
    for z in (0.76, 0.84, 0.92, 1.0):
        B.cyl((-0.3, 2.2, z), (0.3, 2.2, z), 0.018, segs=4, col=CHROME, mat='farm_metal')
    for y, w in ((2.24, 1.7), (-2.16, 1.75)):
        B.rbox((0, y, 0.62), (w, 0.1, 0.12), r=0.045, rseg=1, nx=2, colfn=lambda co: CHROME, mat='farm_metal', end_r=0.04)
    for x in (-0.78, 0.78):
        B.sphere((x, -2.14, 0.95), 0.06, scale=(1, 0.5, 1.3), segs=8, rings=4, col=0xd83a2a, mat='farm_gloss')
    for x, y in WHEELS:
        wheel_arch(B, x, y)
    # underbody shadow plate
    B.box((0, 0, 0.5), (1.7, 4.0, 0.06), col=0x3a3230, mat='farm_soft')
    # door outline on +X side and handle
    B.tube([(0.935, 1.15, 0.7), (0.935, 1.15, 2.05), (0.935, 1.62, 2.05)], 0.012, segs=4, col=CREAM_D, mat='farm_gloss')
    B.cyl((0.93, 0.95, 1.35), (0.96, 1.05, 1.35), 0.018, segs=6, col=CHROME, mat='farm_metal')
    # roof rack with a crate of pumpkins
    for y in (-1.6, -0.1):
        B.tube([(-0.7, y, 2.31), (-0.7, y, 2.4), (0.7, y, 2.4), (0.7, y, 2.31)], 0.018, segs=5, col=0x6b6f73, mat='farm_metal')
    for x in (-0.7, 0.7):
        B.cyl((x, -1.75, 2.4), (x, 0.05, 2.4), 0.018, segs=5, col=0x6b6f73, mat='farm_metal')
    crate(B, (0.1, -0.85, 2.42), s=(0.6, 0.45, 0.24), produce=('ball', 0xf28a26), rng=rng, rz=0.15)
    # emblem on the +X side: sunflower disc (no text)
    m = B.mark()
    B.sphere((0, 0, 0), 0.16, scale=(1, 1, 0.12), segs=12, rings=3, col=0xfbf0dc, mat='farm_gloss')
    flower5(B, Vector((0, 0, 0.025)), 0.08, rng, col=0xffc928, centre=0x7a4a22, n=8, pitch=5, petal_shape='lance')
    B.transform(B.since(m), Matrix.Translation((0.94, -0.6, 1.6)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    hy0, hy1, hz0, hz1 = HATCH
    if open_:
        # opening: dark interior back wall, shelves with jars and veg
        def fn(u, v):
            return Vector((-0.55, lerp(hy0, hy1, u), lerp(hz0, hz1, v)))
        fs = B.grid(fn, 2, 2, mat='farm_soft', orient=None, colfn=lambda u, v: mixc(0x6a4128, 0x8a5a36, v))
        for f in fs:
            if f.normal.x > 0:
                f.normal_flip()
            f.smooth = False
        # opening jambs (inner sides)
        for y in (hy0, hy1):
            B.box((-0.75, y, (hz0 + hz1) / 2), (0.42, 0.03, hz1 - hz0), col=0x7a4c2e, mat='farm_soft')
        B.box((-0.75, (hy0 + hy1) / 2, hz1), (0.42, hy1 - hy0, 0.03), col=0x7a4c2e, mat='farm_soft')
        B.box((-0.75, (hy0 + hy1) / 2, hz0), (0.42, hy1 - hy0, 0.03), col=0x7a4c2e, mat='farm_soft')
        for z in (1.42, 1.72):
            B.box((-0.66, (hy0 + hy1) / 2, z), (0.22, hy1 - hy0 - 0.06, 0.025), col=0xc8945c, mat='farm_soft')
            for i in range(7):
                y = lerp(hy0 + 0.15, hy1 - 0.15, i / 6)
                if i % 3 == 0:
                    B.lathe([(0.0, 0.0), (0.045, 0.0), (0.05, 0.1), (0.035, 0.12), (0.0, 0.12)], segs=6, c=(-0.66, y, z + 0.012),
                            col=[0xf2b33a, 0xe8564a, 0x9acb5a][i % 3], mat='farm_gloss')
                    B.cyl((-0.66, y, z + 0.13), (-0.66, y, z + 0.155), 0.04, segs=6, col=0xfbf0dc, mat='farm_cloth')
                else:
                    B.sphere((-0.66, y, z + 0.06), 0.05, segs=6, rings=4, col=[0xf28a26, 0xe8364f, 0x6fbf4a, 0xffc928][i % 4], mat='farm_gloss')
        # counter shelf
        B.rbox((-1.1, (hy0 + hy1) / 2, hz0 - 0.02), (hy1 - hy0 + 0.2, 0.36, 0.05), r=0.015, rseg=1, nx=4, rot=(0, 0, math.pi / 2),
               colfn=wood_fn(0xd09a5e, seed=4), end_r=0.012)
        for y in (hy0 + 0.05, hy1 - 0.05):
            B.tube([(-0.93, y, hz0 - 0.32), (-1.22, y, hz0 - 0.05)], 0.014, segs=5, col=0x6b6f73, mat='farm_metal')
        crate(B, (-1.08, hy0 + 0.35, hz0 + 0.005), s=(0.3, 0.42, 0.16), produce=('ball', 0xe8364f), rng=rng, rz=math.pi / 2)
        crate(B, (-1.08, hy1 - 0.4, hz0 + 0.005), s=(0.3, 0.42, 0.16), produce=('leaf', 0x7ccf4f), rng=rng, rz=math.pi / 2)
        m = B.mark()
        awning(B, hy0 - 0.2, hy1 + 0.2, 2.24, 1.05, 0.38, stripes=8, open_=True)
        B.protect(B.since(m))
        # crates on the ground and a chalk A-frame
        crate(B, (-1.35, hy0 + 0.1, 0.0), s=(0.48, 0.34, 0.26), produce=('ball', 0xf28a26), rng=rng, rz=0.2)
        crate(B, (-1.35, hy1 + 0.25, 0.0), s=(0.48, 0.34, 0.26), produce=('leaf', 0x6fbf4a), rng=rng, rz=-0.15)
        B.sphere((-1.62, hy1 - 0.15, 0.17), 0.17, scale=(1, 1, 0.8), segs=10, rings=6, col=0xf28a26, mat='farm_gloss')
    else:
        # closed hatch: panel outline + latch; awning rolled
        y0, y1, z0, z1 = hy0, hy1, hz0, hz1
        B.tube([(-0.935, y0, z0), (-0.935, y1, z0), (-0.935, y1, z1), (-0.935, y0, z1), (-0.935, y0, z0)], 0.014, segs=4,
               cap0=False, cap1=False, col=CREAM_D, mat='farm_gloss')
        B.cyl((-0.93, (y0 + y1) / 2 - 0.08, z0 + 0.08), (-0.97, (y0 + y1) / 2 + 0.08, z0 + 0.08), 0.02, segs=6, col=CHROME, mat='farm_metal')
        m = B.mark()
        awning(B, hy0 - 0.2, hy1 + 0.2, 2.24, 1.0, 0.4, open_=False)
        B.protect(B.since(m))
        # little closed tag (blank) hanging from the latch
        B.rbox((-0.95, (y0 + y1) / 2, z0 + 0.32), (0.3, 0.015, 0.16), r=0.006, rseg=1, nx=2, rot=(0, 0, math.pi / 2),
               colfn=lambda co: 0xfbefd6, end_r=0.004)
    return B.build('van_open' if open_ else 'van_closed', ground_ao=(0.1, 0.7), ao=dict(samples=14, dist=0.45, strength=0.45))

def build_away_sign():
    """Chalkboard «домик» (A-frame with a little roof) on the empty van stand; arrival time is drawn by the game on the slates."""
    rng = random.Random(95)
    B = Builder(85)
    H, W = 0.95, 0.62
    ang = math.radians(14)
    for s in (-1, 1):
        m = B.mark()
        B.rbox((0, 0, H / 2), (W, 0.035, H), r=0.012, rseg=1, nx=3, colfn=wood_fn(WOOD, seed=s), end_r=0.01)
        B.rbox((0, -0.024, H / 2 + 0.02), (W - 0.1, 0.012, H - 0.22), r=0.006, rseg=1, nx=2,
               colfn=lambda co: mixc(0x3a4442, 0x4a5552, 0.5 + noise.noise(co * 6) * 0.5), end_r=0.004)
        M = Matrix.Translation((0, -H * math.sin(ang), 0)) @ Matrix.Rotation(-ang, 4, 'X')
        if s > 0:
            M = Matrix.Rotation(math.pi, 4, 'Z') @ M
        B.transform(B.since(m), M)
    # little roof on top — the «домик»
    top = H * math.cos(ang)
    gable_roof(B, 0.0, W + 0.12, 0.0, 0.2, top - 0.02, top + 0.16, 1, rng, thick=0.03)
    B.sphere((0, 0, top + 0.2), 0.03, segs=8, rings=5, col=0xe7b874, mat='farm_gloss')
    # chalk tray
    B.box((0, -0.19, 0.2), (W - 0.1, 0.06, 0.02), col=WOOD_D, mat='farm_soft')
    B.cyl((-0.1, -0.19, 0.215), (0.0, -0.19, 0.215), 0.008, segs=6, col=0xfbfbf5, mat='farm_soft')
    return B.build('van_away_sign', ground_ao=(0.05, 0.7))
