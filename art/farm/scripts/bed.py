# Bed 1.6 x 1.6 m: frame + soil states (empty / dug / wet / turf for locked) + lock stake + ripe rim. level.md §4
# Budget design-v11 §16.2: frame + one soil state <= 800 tris (160 beds, InstancedMesh).
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
reset()
BS = 1.6          # outer size
FT = 0.07         # frame plank thickness
FH = 0.15         # frame height
IN = BS / 2 - FT  # inner half size (0.73)
SOIL_TOP = 0.12   # mean soil level (crop origin)

def build_frame():
    B = Builder(31)
    for k in range(4):
        rz = k * math.pi / 2
        M = Matrix.Rotation(rz, 4, 'Z')
        c = M @ Vector((0, -(BS / 2 - FT / 2), FH / 2 - 0.01))
        fs = B.rbox((0, 0, 0), (BS - 0.06, FT, FH + 0.02), r=0.016, rseg=1, nx=2, colfn=wood_fn(WOOD, seed=k), end_r=0.012)
        B.transform(fs, Matrix.Translation(c) @ M)
    for k in range(4):
        sx = 1 if k in (0, 3) else -1
        sy = 1 if k < 2 else -1
        x, y = sx * (BS / 2 - 0.045), sy * (BS / 2 - 0.045)
        B.rbox((x, y, 0.085), (0.19, 0.095, 0.095), r=0.022, rseg=1, nx=1, rot=UP, colfn=wood_fn(WOOD_D, seed=k + 9), end_r=0.025)
    return B.build('bed_frame', ground_ao=(0.06, 0.6))

def height(state, x, y, seed):
    ex = 1 - (abs(x) / IN) ** 5
    ey = 1 - (abs(y) / IN) ** 5
    e = smooth01(max(0.0, min(ex, ey)) * 2.6)
    rr = 0.0
    if state in ('dug', 'wet'):
        ph = (y / (2 * IN) + 0.5) * 3
        rr = abs(math.sin(ph * math.pi)) ** 0.8
        h = SOIL_TOP - 0.012 + (0.035 * rr - 0.012) * e
    elif state == 'turf':
        h = SOIL_TOP + 0.012 * e
    else:
        h = SOIL_TOP - 0.01 + 0.006 * e
    n = noise.noise(Vector((x * 6 + seed, y * 6, seed))) * 0.01 + noise.noise(Vector((x * 22, y * 22 + seed, 1))) * 0.006
    h += n * (0.3 + e)
    return h, e, rr

def build_soil(state, seed, budget):
    B = Builder(seed)
    rng = random.Random(seed)
    nu, nv = (11, 16) if state in ('dug', 'wet') else (9, 9)
    def fn(u, v):
        x = (u - 0.5) * 2 * IN
        y = (v - 0.5) * 2 * IN
        if u in (0, 1) or v in (0, 1):
            return Vector((x * 1.01, y * 1.01, 0.03))
        h, e, rr = height(state, x, y, seed)
        return Vector((x, y, h))
    pal = {
        'empty': (0x8a5d3d, 0xa8774f, 0x6e4a30),
        'dug': (0x5b3520, 0x8d5b38, 0x4a2a18),
        'wet': (0x41271a, 0x63402a, 0x31200f),
        'turf': (0x4a8a3a, 0x6fa84c, 0x3d7232),
    }[state]
    def colfn(u, v):
        x = (u - 0.5) * 2 * IN; y = (v - 0.5) * 2 * IN
        h, e, rr = height(state, x, y, seed)
        n = noise.noise(Vector((x * 11, y * 11, 3 + seed)))
        if state in ('empty', 'turf'):
            c = mixc(pal[0], pal[1], 0.5 + n * 0.5)
        else:
            c = mixc(pal[0], pal[1], rr * 0.85 + n * 0.2)
        if e < 0.5:
            c = mixc(c, pal[2], (0.5 - e))
        return c
    matn = 'farm_wet' if state == 'wet' else ('farm_plant' if state == 'turf' else 'farm_soft')
    B.grid(fn, nu, nv, mat=matn, colfn=colfn)
    if state in ('dug', 'wet'):
        for i in range(9):
            x = rng.uniform(-0.62, 0.62); y = rng.uniform(-0.62, 0.62)
            h, e, rr = height(state, x, y, seed)
            r = rng.uniform(0.014, 0.026)
            B.sphere((x, y, h + r * 0.2), r, scale=(1.2, 1.0, 0.75), segs=5, rings=3, rot=(0, 0, rng.random() * 3),
                     col=jitter(pal[1] if state == 'dug' else pal[0], 0.12, rng), mat=matn)
    if state == 'empty':
        for i in range(4):
            x, y = rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6)
            h, e, rr = height(state, x, y, seed)
            r = rng.uniform(0.02, 0.032)
            B.sphere((x, y, h + r * 0.15), r, scale=(1.25, 1, 0.6), segs=5, rings=3, rot=(0, 0, rng.random() * 3),
                     col=jitter(0xbdb3a3, 0.08, rng), mat='farm_soft')
        for i in range(4):
            x, y = rng.uniform(-0.62, 0.62), rng.uniform(-0.62, 0.62)
            if abs(x) < 0.5 and abs(y) < 0.5:
                x = math.copysign(0.6, x)
            h, e, rr = height(state, x, y, seed)
            fs0 = B.mark()
            grass_tuft(B, x, y, rng, 3, 0.1)
            B.transform(B.since(fs0), Matrix.Translation((0, 0, h - 0.005)))
    if state == 'turf':
        for i in range(6):
            x, y = rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6)
            h, e, rr = height(state, x, y, seed)
            fs0 = B.mark()
            grass_tuft(B, x, y, rng, 3, 0.12, col=0x62a848)
            B.transform(B.since(fs0), Matrix.Translation((0, 0, h - 0.005)))
        for i in range(3):
            x, y = rng.uniform(-0.55, 0.55), rng.uniform(-0.55, 0.55)
            h, e, rr = height(state, x, y, seed)
            flower5(B, Vector((x, y, h + 0.015)), 0.024, rng, col=rng.choice([0xffffff, 0xffe37a, 0xffb8d0]), centre=0xf2b01e, pitch=25)
    name = {'empty': 'bed_empty', 'dug': 'bed_dug', 'wet': 'bed_wet', 'turf': 'bed_turf'}[state]
    ob = B.build(name, ground_ao=None)
    fit_tris(ob, budget - (60 if state == 'wet' else 0))
    if state == 'wet':
        # puddles in the furrows, built after decimation so they keep their shape
        P = Builder(seed + 50)
        for (px, sx) in [(-0.3, 0.24), (0.32, 0.18), (0.02, 0.14)]:
            py = rng.choice([-IN / 3, IN / 3])
            h, e, rr = height(state, px, py, seed)
            P.sphere((px, py, h + 0.008), 1.0, scale=(sx, 0.07, 0.004), segs=10, rings=2, col=0x667a86, mat='farm_water')
        ob = join([ob, P.build('_puddles', ground_ao=None)], name)
        ob.data.color_attributes.active_color = ob.data.color_attributes['Col']
    return ob

def build_lock():
    """Stake with a padlock and a blank plate (level text) for a closed bed. Front = -Y."""
    B = Builder(41)
    vpost(B, 0, 0, -0.05, 0.62, 0.06, seed=3, col=WOOD_D)
    B.rbox((0, -0.035, 0.5), (0.26, 0.02, 0.15), r=0.01, rseg=1, nx=2, colfn=lambda co: mixc(0xfbefd6, 0xefdcb8, 0.5 + noise.noise(co * 9) * 0.5), end_r=0.008)
    # padlock: body + shackle
    B.rbox((0, -0.05, 0.33), (0.1, 0.035, 0.085), r=0.014, rseg=2, nx=1, colfn=lambda co: 0xe0b040, mat='farm_gold', end_r=0.012)
    B.tube([(-0.03, -0.05, 0.37)] + [(-math.cos(a) * 0.03, -0.05, 0.37 + math.sin(a) * 0.035) for a in (0.6, 1.2, 1.9, 2.5)] + [(0.03, -0.05, 0.37)],
           0.007, segs=5, cap0=False, cap1=False, col=0x9aa0a6, mat='farm_metal')
    B.sphere((0, -0.07, 0.325), 0.01, scale=(0.7, 0.4, 1.2), segs=6, rings=4, col=0x5a4a20, mat='farm_soft')
    return B.build('bed_lock', ground_ao=None)

glow_mat('farm_glow_gold', 0xffa82a, 0.8, rough=0.3, coat=0.3)

def build_ripe_rim():
    """Warm golden glow band on top of the frame (ripe highlight; sparkles are game Points)."""
    B = Builder(42)
    c = BS / 2 - FT / 2
    k = 0.06
    pts = [(c, -c, 0), (c, c, 0), (-c, c, 0), (-c, -c, 0)]
    loop = []
    for i in range(4):
        a = Vector(pts[i]); b = Vector(pts[(i + 1) % 4])
        loop += [a.lerp(b, k), a.lerp(b, 1 - k)]
    loop.append(loop[0])
    loop = [Vector((p.x, p.y, FH + 0.016)) for p in loop]
    B.tube(loop, 0.02, segs=4, cap0=False, cap1=False, col=0xffb52e, mat='farm_glow_gold')
    return B.build('bed_ripe_rim', ground_ao=None)

frame = build_frame()
soils = [build_soil('empty', 3, 380), build_soil('dug', 5, 420), build_soil('wet', 5, 440), build_soil('turf', 7, 440)]
lock = build_lock()
rim = build_ripe_rim()
objs = [frame] + soils + [lock, rim]
fit_all(objs, {'bed_frame': 360, 'bed_lock': 240})
report(objs)

to_origin(objs)
export_glb(objs, f'{GLB_DIR}/bed.glb')
for o in objs:
    o['farm_export_at_origin'] = True
save_blend('bed')
ex = []
for i, st in enumerate(soils):
    qx, qy = ((-0.95 if i % 2 == 0 else 0.95), (0.95 if i < 2 else -0.95))
    ex.append(dup(frame, (qx, qy, 0)))
    ex.append(dup(st, (qx, qy, 0)))
ex.append(dup(lock, (0.95 - 0.62, -0.95 - 0.86, 0)))
ex.append(dup(rim, (-0.95, 0.95, 0)))
for o in objs:
    o.location = (0, 0, -60)
preview(ex, f'{PNG_DIR}/bed.png', yaw=-18, pitch=42, margin=0.72)
for e in ex:
    bpy.data.objects.remove(e, do_unlink=True)
for o in objs:
    o.location = (0, 0, 0)
spread(objs, 0.3)
save_blend('bed')
print('FINAL bed', {o.name: tris(o) for o in objs})
