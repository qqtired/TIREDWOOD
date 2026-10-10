# Back-yard items (compost heap, beehive + bees) and hand tools (rake, watering can, trowel, bag) with level tiers.

# ================================================================ COMPOST (1.2 x 1.0 m, level.md §4)
def build_compost():
    """design-v11 §16.6: slatted wooden box with a lid (propped open a little), 1.2 x 1.0 m, ~1.5k tris.
    Front = -Y. Steam (game Points) rises from the slat gaps and the lid opening: attach points in compost.py."""
    rng = random.Random(3001)
    B = Builder(301)
    W, D, H = 1.2, 1.0, 0.62
    for sx in (-1, 1):
        for sy in (-1, 1):
            vpost(B, sx * (W / 2 - 0.045), sy * (D / 2 - 0.045), -0.02, H + 0.04, 0.09, seed=sx * 3 + sy, col=WOOD_D)
    # dark inside, visible through the gaps between the slats
    B.box((0, 0, H / 2), (W - 0.1, D - 0.1, H - 0.04), col=0x3a2416, mat='farm_soft')
    zs = [0.07 + i * 0.145 for i in range(4)]
    for side, (axis, L, off) in enumerate((('x', W, -(D / 2 - 0.035)), ('x', W, D / 2 - 0.035), ('y', D, W / 2 - 0.035), ('y', D, -(W / 2 - 0.035)))):
        for i, z in enumerate(zs):
            c = jitter(WOOD if (i + side) % 2 else mixc(WOOD, WOOD_L, 0.35), 0.05, rng)
            if axis == 'x':
                B.rbox((0, off, z + 0.055), (L - 0.12, 0.035, 0.11), r=0.012, rseg=1, nx=2, colfn=wood_fn(c, seed=side * 10 + i), end_r=0.0)
            else:
                B.rbox((off, 0, z + 0.055), (L - 0.12, 0.035, 0.11), r=0.012, rseg=1, nx=2, rot=(0, 0, math.pi / 2),
                       colfn=wood_fn(c, seed=side * 10 + i), end_r=0.0)
    # compost surface just under the rim: lumpy, with scraps
    def top(u, v):
        x = (u - 0.5) * (W - 0.1); y = (v - 0.5) * (D - 0.1)
        e = math.sin(math.pi * u) * math.sin(math.pi * v)
        return Vector((x, y, H - 0.06 + 0.07 * e + noise.noise(Vector((x * 6, y * 6, 1))) * 0.025))
    B.grid(top, 6, 5, mat='farm_soft', colfn=lambda u, v: mixc(0x4a2e1a, 0x6e4a2c, 0.5 + noise.noise(Vector((u * 7, v * 7, 2))) * 0.5))
    for i, (x, y) in enumerate(((-0.3, -0.12), (0.22, 0.05), (-0.05, 0.2), (0.32, -0.2))):
        z = H - 0.06 + 0.07 * math.cos(x / W * math.pi) * math.cos(y / D * math.pi) + 0.012
        if i % 2 == 0:
            B.leaf((x, y, z), rng.random() * TAU, math.radians(8), 0.13, 0.07, bend=-0.2, curl=0.3, nu=3, nv=1, shape='oval',
                   col=rng.choice([0x8fb04a, 0xc8a040]))
        else:
            B.tube([(x, y, z), (x + 0.1, y + 0.03, z + 0.01)], [0.02, 0.012], segs=5, col=0xf28a26, mat='farm_gloss')
    sprout(B, 0.08, -0.08, rng, h=H + 0.03, ll=0.08, lw=0.055, col=0x7ccb4f, shape='heart')
    # lid: three planks + two battens, hinged at the back, swung open ~70 degrees (underside faces the front)
    m = B.mark()
    for k in (-1, 0, 1):
        B.rbox((0, k * 0.33, 0.025), (W + 0.06, 0.32, 0.04), r=0.012, rseg=1, nx=3, colfn=wood_fn(jitter(WOOD_L, 0.05, rng), seed=40 + k), end_r=0.01)
    for sx in (-1, 1):
        B.rbox((sx * 0.42, 0, 0.06), (D + 0.02, 0.07, 0.03), r=0.01, rseg=1, nx=2, rot=(0, 0, math.pi / 2), colfn=wood_fn(WOOD_D, seed=44 + sx), end_r=0.008)
    B.transform(B.since(m), Matrix.Translation((0, D / 2 + 0.02, H + 0.04)) @ Matrix.Rotation(math.radians(-70), 4, 'X') @ Matrix.Translation((0, -D / 2 - 0.02, 0)))
    for sx in (-1, 1):
        B.tube([(sx * 0.56, D / 2 - 0.02, H + 0.02), (sx * 0.56, D / 2 - 0.3, H + 0.62)], 0.006, segs=3, cap0=False, cap1=False, col=0xd8bf8a, mat='farm_soft')
    # a few fallen leaves at the foot
    for k in range(3):
        a = rng.uniform(-0.5, 0.5)
        B.leaf((rng.uniform(-0.55, 0.55), -D / 2 - 0.12 - rng.random() * 0.1, 0.01), rng.random() * TAU, math.radians(4), 0.1, 0.06,
               bend=0.0, curl=0.2, nu=3, nv=1, shape='oval', col=rng.choice([0xd89a3a, 0xc8a040, 0x9ab04a]))
    return B.build('compost', ground_ao=(0.08, 0.65), ao=dict(samples=12, dist=0.3, strength=0.45))


def build_worm():
    """Little pink worm peeking out (origin at the hole, grows up +Z, faces -Y). ~120 tris."""
    B = Builder(305)
    pts = [(0, 0, -0.02), (0, 0, 0.03), (0, -0.006, 0.06), (0, -0.02, 0.085), (0, -0.04, 0.095)]
    B.tube(pts, [0.016, 0.016, 0.015, 0.014, 0.013], segs=6, cap0=False, cap1=False, col=0xf29a9a, mat='farm_gloss',
           vcolfn=lambda t: mixc(0xf29a9a, 0xe07a84, abs(math.sin(t * 14)) * 0.6))
    B.sphere((0, -0.048, 0.096), 0.016, segs=6, rings=4, col=0xf6a8a4, mat='farm_gloss')
    for sx in (-1, 1):
        B.sphere((sx * 0.007, -0.061, 0.103), 0.0045, segs=4, rings=3, col=0x2a1a14, mat='farm_gloss')
    return B.build('compost_worm', ground_ao=None)


def build_spot_peg():
    """«Место» marker for a not-yet-built compost / hive: a peg with a blank tag (game draws the icon). Front -Y."""
    B = Builder(306)
    vpost(B, 0, 0, -0.06, 0.42, 0.05, seed=5, col=WOOD_D)
    B.tube([(0, -0.03, 0.36), (0.02, -0.035, 0.3)], 0.004, segs=3, cap0=False, cap1=False, col=0xd8bf8a, mat='farm_soft')
    B.rbox((0.02, -0.04, 0.24), (0.16, 0.012, 0.11), r=0.008, rseg=1, nx=1, colfn=lambda co: 0xfbefd6, end_r=0.006)
    return B.build('spot_peg', ground_ao=(0.05, 0.7))


# ================================================================ BEEHIVE (0.7 x 0.7 footprint) + bees
HONEY = 0xf2b33a
def build_hive():
    rng = random.Random(3002)
    B = Builder(302)
    # stand
    for sx in (-1, 1):
        for sy in (-1, 1):
            vpost(B, sx * 0.24, sy * 0.24, -0.02, 0.3, 0.06, seed=sx * 2 + sy, col=WOOD_D)
    B.rbox((0, 0, 0.31), (0.62, 0.62, 0.04), r=0.012, rseg=1, nx=3, colfn=wood_fn(WOOD, seed=3), end_r=0.01)
    # two boxes (honey + cream), each with a lip
    z = 0.33
    for i, (h, c) in enumerate(((0.26, HONEY), (0.2, 0xf6e6c4))):
        B.rbox((0, 0, z + h / 2), (0.52, 0.52, h), r=0.02, rseg=2, nx=3, colfn=lambda co, c=c: mixc(c, mulc(c, 0.9), 0.5 + noise.noise(co * 8) * 0.5), end_r=0.018)
        B.rbox((0, 0, z + h - 0.01), (0.56, 0.56, 0.03), r=0.012, rseg=1, nx=3, colfn=lambda co, c=c: mulc(c, 0.92), end_r=0.01)
        # hand holds
        for sx in (-1, 1):
            B.box((sx * 0.262, 0, z + h * 0.6), (0.012, 0.16, 0.03), col=mulc(c, 0.7), mat='farm_soft')
        z += h
    # roof
    rr = random.Random(5)
    gable_roof(B, 0.0, 0.66, 0.0, 0.36, z + 0.02, z + 0.2, 1, rr, thick=0.03)
    for sx in (-1, 1):
        x = sx * 0.29
        vs = [B.bm.verts.new(v) for v in ((x, -0.3, z + 0.04), (x, 0.3, z + 0.04), (x, 0.0, z + 0.19))]
        f = B.bm.faces.new(vs if sx > 0 else list(reversed(vs)))
        B.paint([f], 0xf6e6c4, 'farm_soft', smooth=False)
    # entrance slot + landing board (front = -Y), honey drip
    B.box((0, -0.262, 0.37), (0.24, 0.012, 0.035), col=0x3a2616, mat='farm_soft')
    B.rbox((0, -0.3, 0.345), (0.3, 0.09, 0.02), r=0.008, rseg=1, nx=2, colfn=wood_fn(WOOD_L, seed=7), end_r=0.006)
    B.tube([(0.1, -0.264, 0.56), (0.1, -0.268, 0.5), (0.105, -0.268, 0.47)], [0.012, 0.01, 0.0], segs=6, cap0=True,
           col=0xf0a020, mat='farm_gloss')
    B.sphere((0.1, -0.262, 0.565), 0.022, scale=(1.3, 0.5, 0.6), segs=8, rings=4, col=0xf0a020, mat='farm_gloss')
    # painted flower on the honey box
    m = B.mark()
    flower5(B, Vector((0, 0, 0)), 0.05, rng, col=0xfff4e6, centre=0xf2b01e, pitch=4)
    B.transform(B.since(m), Matrix.Translation((-0.1, -0.263, 0.5)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    # flowers around (lavender + daisies)
    for k in range(9):
        a = TAU * k / 9 + 0.2
        r = rng.uniform(0.42, 0.52)
        x, y = math.cos(a) * r, math.sin(a) * r
        if y < -0.3 and abs(x) < 0.2:
            continue
        if k % 2 == 0:
            for j in range(4):
                b = Vector((x + rng.uniform(-0.04, 0.04), y + rng.uniform(-0.04, 0.04), 0.0))
                t = b + Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), rng.uniform(0.22, 0.3)))
                B.tube([b, t], 0.004, segs=3, cap0=False, cap1=False, col=0x7aa860, mat='farm_plant')
                B.tube([t - (t - b).normalized() * 0.08, t], [0.016, 0.0], segs=5, cap0=True, col=0x9a7ad8, mat='farm_plant',
                       vcolfn=lambda tt: mixc(0x8a6ac8, 0xb8a0ee, tt))
        else:
            rosette(B, x, y, rng, n=4, L=(0.06, 0.09), W=0.04, pitch=(60, 35), bend=-0.6, col=0x55b244, nu=3)
            for j in range(2):
                h = rng.uniform(0.12, 0.18)
                t = Vector((x + rng.uniform(-0.03, 0.03), y + rng.uniform(-0.03, 0.03), h))
                B.tube([(x, y, 0.0), t], 0.004, segs=3, cap0=False, cap1=False, col=0x7aa860, mat='farm_plant')
                flower5(B, t, 0.03, rng, col=rng.choice([0xffffff, 0xffe37a, 0xffb8d0]), centre=0xf2b01e, pitch=25, n=6)
    return B.build('hive', ground_ao=(0.08, 0.65), ao=dict(samples=12, dist=0.25, strength=0.45))

def build_bee():
    """Bee 6 cm long (cartoon scale), ~150 tris (v11 §16.6), origin at the body centre, flies along +Y (game -Z).
    Stripes are face colours on lathe rows, so they stay crisp. Wings are a separate object."""
    B = Builder(303)
    DARK, GOLD = 0x3a2a1e, 0xffc21f
    prof = [(0.0, -0.034), (0.008, -0.03), (0.016, -0.02), (0.02, -0.008), (0.021, 0.002), (0.019, 0.012), (0.012, 0.02),
            (0.0, 0.023)]
    fs = B.lathe(prof, segs=8, c=(0, -0.004, 0), col=GOLD, mat='farm_gloss', rot=(-math.pi / 2, 0, 0))
    bands = [(-0.03, DARK), (-0.02, GOLD), (-0.008, DARK), (0.002, GOLD), (0.012, DARK), (1.0, GOLD)]
    for fc in fs:
        y = fc.calc_center_median().y + 0.004
        B.paint([fc], next(c for (lim, c) in bands if y < lim), 'farm_gloss')
    B.sphere((0, 0.03, 0.004), 0.014, segs=6, rings=4, col=DARK, mat='farm_gloss')
    for sx in (-1, 1):
        B.tube([(sx * 0.005, 0.038, 0.014), (sx * 0.016, 0.056, 0.032)], 0.0016, segs=3, cap0=False, cap1=False,
               col=DARK, mat='farm_soft')
    B.tube([(0, -0.036, 0), (0, -0.044, -0.002)], [0.003, 0.0], segs=3, cap0=False, col=DARK, mat='farm_soft')
    bee = B.build('bee', ground_ao=None)
    B = Builder(304)
    for sx in (-1, 1):
        B.leaf((sx * 0.004, 0.0, 0.018), (0 if sx > 0 else math.pi) + sx * 0.35, math.radians(25), 0.036, 0.024, bend=-0.1,
               curl=0.0, fold=0.0, nu=3, nv=1, shape='ellipse', col=0xf4fbff, col_base=0xdcecf4, col_tip=0xffffff, rib=0xe8f2f8,
               mat='farm_cloth')
    wings = B.build('bee_wings', ground_ao=None)
    return bee, wings

# ================================================================ TOOLS (origin at the grip; tool points along +Y / up +Z)
# Tiers follow design-v11 §16.7. Object names = <id>_<tier>: rake_1..3, can_1..3 + can_gold, shovel_1..3 + shovel_gold.
TIN, IRON, STEEL, BRASS, COPPER, GOLD = 0xa8b0b6, 0x8a9096, 0xb8c0c6, 0xd8a640, 0xc8783e, 0xf0c040
RAKE = {
    1: dict(head=0xc8945c, head_mat='farm_soft', handle=0xb98a58, handle_mat='farm_soft', band=None, knob=0x8a6a48),
    2: dict(head=IRON, head_mat='farm_metal', handle=0xc8945c, handle_mat='farm_soft', band=None, knob=0xb8743e),
    3: dict(head=STEEL, head_mat='farm_metal', handle=0x9a4e26, handle_mat='farm_gloss', band=BRASS, knob=BRASS),
}

def build_rake(tier):
    t = RAKE[tier]
    B = Builder(310 + tier)
    # handle along -Z from the grip (origin), head at the bottom: 1.25 m total, grip 0.35 m from the top
    B.tube([(0, 0, 0.35), (0, 0, -0.9)], 0.018, segs=8, col=t['handle'], mat=t['handle_mat'],
           vcolfn=lambda tt: mixc(t['handle'], mulc(t['handle'], 0.85), abs(math.sin(tt * 30)) * 0.3))
    B.sphere((0, 0, 0.36), 0.024, segs=8, rings=5, col=t['knob'], mat='farm_gold' if t['band'] else 'farm_gloss')
    if tier == 1:
        # wooden head with chunky wooden pegs
        B.rbox((0, 0, -0.95), (0.42, 0.05, 0.05), r=0.014, rseg=1, nx=3, colfn=wood_fn(t['head'], seed=3), end_r=0.012)
        for i in range(7):
            x = lerp(-0.18, 0.18, i / 6)
            B.tube([(x, 0, -0.97), (x, 0.01, -1.06)], [0.011, 0.007], segs=5, cap0=False, col=mulc(t['head'], 0.9), mat='farm_soft')
    else:
        B.cyl((0, 0, -0.88), (0, 0, -0.96), 0.024, segs=8, col=t['band'] or t['head'], mat='farm_gold' if t['band'] else t['head_mat'])
        B.rbox((0, 0, -0.97), (0.42, 0.035, 0.035), r=0.01, rseg=1, nx=3, colfn=lambda co: t['head'], mat=t['head_mat'], end_r=0.008)
        for i in range(9):
            x = lerp(-0.19, 0.19, i / 8)
            B.tube([(x, 0, -0.98), (x, 0.02, -1.06), (x, 0.05, -1.1)], [0.007, 0.006, 0.002], segs=4, cap0=False, col=t['head'], mat=t['head_mat'])
    if t['band']:
        # brass binding: end caps on the head + a ring on the lacquered handle
        for sx in (-1, 1):
            B.cyl((sx * 0.2, 0, -0.97), (sx * 0.225, 0, -0.97), 0.026, segs=8, col=BRASS, mat='farm_gold')
        B.torus((0, 0, 0.1), 0.021, 0.006, segs=10, rsegs=4, col=BRASS, mat='farm_gold')
    return B.build(f'rake_{tier}', ground_ao=None)

CAN = {
    1: dict(body=0x6aa85a, body_mat='farm_gloss', trim=TIN, trim_mat='farm_metal', s=1.0, band=None),
    2: dict(body=COPPER, body_mat='farm_metal', trim=0xa0582a, trim_mat='farm_metal', s=1.12, band=None),
    3: dict(body=0x3f8f86, body_mat='farm_gloss', trim=BRASS, trim_mat='farm_gold', s=1.22, band=0xfbefd6),
    'gold': dict(body=GOLD, body_mat='farm_gold', trim=0xfff0b0, trim_mat='farm_gold', s=1.12, band=None),
}

def build_can(tier):
    t = CAN[tier]
    s = t['s']
    B = Builder(320 + (tier if isinstance(tier, int) else 9))
    # body: origin at the top handle grip; body hangs below, spout forward (+Y)
    cz = -0.17
    prof = [(0.0, -0.13), (0.1, -0.13), (0.125, -0.11), (0.13, 0.0), (0.125, 0.08), (0.1, 0.11), (0.06, 0.12), (0.0, 0.12)]
    B.lathe(prof, segs=16, c=(0, -0.02, cz), col=lambda co, n: mixc(t['body'], mixc(t['body'], 0xffffff, 0.25), max(0, n.z)), mat=t['body_mat'])
    for z in (cz - 0.1, cz + 0.06):
        B.torus((0, -0.02, z), 0.13, 0.008, segs=16, rsegs=4, col=t['trim'], mat=t['trim_mat'])
    if t['band']:
        # painted pattern: cream band with little dots
        B.torus((0, -0.02, cz - 0.02), 0.131, 0.018, segs=16, rsegs=4, col=t['band'], mat='farm_gloss', scale=(1, 1, 1.4))
        for k in range(8):
            a = TAU * k / 8
            B.sphere((math.cos(a) * 0.15, -0.02 + math.sin(a) * 0.15, cz - 0.02), 0.009, segs=5, rings=3, col=0xe8564a, mat='farm_gloss')
    # spout and rose
    sp = [Vector((0, 0.08, cz - 0.06)), Vector((0, 0.18, cz + 0.02)), Vector((0, 0.27, cz + 0.12))]
    B.tube(sp, [0.022, 0.016, 0.013], segs=8, cap0=False, cap1=False, col=t['trim'] if t['band'] else t['body'],
           mat=t['trim_mat'] if t['band'] else t['body_mat'])
    B.lathe([(0.013, 0.0), (0.03, 0.03), (0.04, 0.05), (0.0, 0.055)], segs=10, c=sp[-1], rot=(-math.radians(55), 0, 0),
            col=t['trim'], mat=t['trim_mat'])
    # top handle (grip at origin) and back handle
    hp = [Vector((0, -0.12, cz + 0.1)), Vector((0, -0.08, -0.005)), Vector((0, 0.0, 0.0)), Vector((0, 0.07, cz + 0.12))]
    B.tube(hp, 0.012, segs=6, col=t['trim'], mat=t['trim_mat'])
    bp = [Vector((0, -0.14, cz + 0.08)), Vector((0, -0.2, cz)), Vector((0, -0.14, cz - 0.08))]
    B.tube(bp, 0.011, segs=6, col=t['trim'], mat=t['trim_mat'])
    if tier == 'gold':
        m = B.mark()
        for yaw in (0.5, 2.6):
            B.leaf((0, 0, 0), yaw, 0.0, 0.06, 0.035, bend=0, curl=0, fold=0, nu=3, nv=1, shape='oval', col=0xfff8d8, mat='farm_soft')
        B.transform(B.since(m), Matrix.Translation((0.133, -0.02, cz)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    ob = B.build(f'can_{tier}', ground_ao=None)
    # bigger cans: scale about the grip (origin), so the hand attach stays put
    ob.data.transform(Matrix.Scale(s, 4))
    return ob

SHOVEL = {
    1: dict(blade=0xd8a868, blade_mat='farm_soft', handle=0xb98a58, handle_mat='farm_soft', ferrule=0x8a6a48, carved=False),
    2: dict(blade=STEEL, blade_mat='farm_metal', handle=0xc8945c, handle_mat='farm_soft', ferrule=IRON, carved=False),
    3: dict(blade=0x5e626a, blade_mat='farm_metal', handle=0x8a4a24, handle_mat='farm_gloss', ferrule=BRASS, carved=True),
    'gold': dict(blade=GOLD, blade_mat='farm_gold', handle=0xa86a34, handle_mat='farm_gloss', ferrule=0xfff0b0, carved=True),
}

def build_shovel(tier):
    """Hand trowel («лопатка»). Origin = grip, blade forward (+Y) and slightly down."""
    t = SHOVEL[tier]
    B = Builder(330 + (tier if isinstance(tier, int) else 9))
    fm = 'farm_gold' if t['ferrule'] in (BRASS, 0xfff0b0) else ('farm_soft' if tier == 1 else 'farm_metal')
    if t['carved']:
        # carved handle: bulges and grooves
        pts = [(0, -0.075 + 0.0215 * i, 0) for i in range(8)]
        B.tube(pts, [0.016, 0.02, 0.015, 0.02, 0.015, 0.02, 0.017, 0.016], segs=8, col=t['handle'], mat=t['handle_mat'])
    else:
        B.tube([(0, -0.07, 0), (0, 0.0, 0.0), (0, 0.07, 0)], [0.017, 0.019, 0.016], segs=8, col=t['handle'], mat=t['handle_mat'])
    B.sphere((0, -0.078, 0), 0.018, segs=8, rings=5, col=t['ferrule'], mat=fm)
    B.cyl((0, 0.07, 0), (0, 0.09, 0), 0.017, segs=8, col=t['ferrule'], mat=fm)
    B.tube([(0, 0.09, 0), (0, 0.12, -0.01), (0, 0.14, -0.02)], 0.006 if tier != 1 else 0.012, segs=5, cap0=False, cap1=False,
           col=t['blade'], mat=t['blade_mat'])
    B.leaf((0, 0.135, -0.02), math.pi / 2, math.radians(-8), 0.17, 0.08, bend=0.05, curl=0.7, fold=0.0, nu=5, nv=2,
           shape='oval', col=t['blade'], col_base=mulc(t['blade'], 0.9), col_tip=mixc(t['blade'], 0xffffff, 0.2),
           rib=t['blade'], mat=t['blade_mat'])
    return B.build(f'shovel_{tier}', ground_ao=None)

def build_bucket():
    """Well bucket carried by hand («ведро»): wooden staves, two iron hoops, bail handle. Origin = grip, ~300 tris."""
    B = Builder(339)
    cz = -0.3
    prof = [(0.0, 0.0), (0.1, 0.0), (0.12, 0.2), (0.11, 0.2), (0.092, 0.03), (0.0, 0.03)]
    def cf(co, n):
        a = math.atan2(co.y, co.x)
        s = (a / TAU * 12) % 1.0
        return mulc(0xc8945c, 0.82) if min(s, 1 - s) < 0.1 else mixc(0xc8945c, 0xe0b07a, 0.5 + noise.noise(Vector((a * 3, co.z * 9, 0))) * 0.5)
    B.lathe(prof, segs=12, c=(0, 0, cz - 0.2), col=cf, mat='farm_soft', close_top=False, close_bot=True)
    B.sphere((0, 0, cz - 0.03), 1.0, scale=(0.1, 0.1, 0.004), segs=10, rings=2, col=0x6aa8c0, mat='farm_water')
    for z, r in ((cz - 0.16, 0.106), (cz - 0.04, 0.118)):
        B.torus((0, 0, z), r, 0.006, segs=12, rsegs=3, col=IRON, mat='farm_metal')
    hp = [(-0.12, 0, cz - 0.02)] + [(-math.cos(a) * 0.12, 0, cz - 0.02 + math.sin(a) * 0.3) for a in (0.5, 1.0, math.pi / 2, 2.14, 2.64)] + [(0.12, 0, cz - 0.02)]
    B.tube(hp, 0.006, segs=4, cap0=False, cap1=False, col=IRON, mat='farm_metal')
    B.cyl((-0.035, 0, cz + 0.28), (0.035, 0, cz + 0.28), 0.014, segs=6, col=0xb98a58, mat='farm_soft')
    return B.build('bucket', ground_ao=None)

BAG = {1: (0xd8c29a, 0x9a7a52, 1.0), 2: (0x7aa86a, 0x8a5a34, 1.08), 3: (0x9a6234, 0x6a4024, 1.16), 4: (0x8a4a2a, 0xe0b040, 1.25)}

def build_bag(tier):
    body, trim, s = BAG[tier]
    B = Builder(340 + tier)
    rng = random.Random(9 + tier)
    # satchel: origin at the strap top (shoulder); bag hangs ~0.5 m below
    cz = -0.55 * s
    w, d, h = 0.3 * s, 0.12 * s, 0.24 * s
    B.rbox((0, 0, cz), (w, d, h), r=0.04 * s, rseg=3, nx=3, colfn=lambda co: mixc(body, mulc(body, 0.9), 0.5 + noise.noise(co * 20) * 0.5),
           mat='farm_cloth', end_r=0.035 * s)
    # flap over the front (-Y)
    def fn(u, v):
        x = lerp(-w / 2 - 0.005, w / 2 + 0.005, u)
        if v < 0.5:
            return Vector((x, lerp(d / 2, -d / 2, v * 2) * 1.04, cz + h / 2 + 0.012 + math.sin(v * math.pi) * 0.015))
        return Vector((x, -d / 2 - 0.012, cz + h / 2 - (v - 0.5) * 2 * h * 0.55))
    B.grid(fn, 4, 4, col=mulc(body, 0.93), mat='farm_cloth', orient=None)
    # buckle / patch
    B.rbox((0, -d / 2 - 0.018, cz + h / 2 - h * 0.5), (0.05 * s, 0.01, 0.04 * s), r=0.005, rseg=1, nx=1,
           colfn=lambda co: trim, mat='farm_gold' if tier == 4 else 'farm_metal', end_r=0.004)
    if tier >= 2:
        m = B.mark()
        B.leaf((0, 0, 0), 0.6, 0.0, 0.06 * s, 0.035 * s, bend=0, curl=0, fold=0, nu=3, nv=1, shape='oval', col=0xfff4dc, mat='farm_soft')
        B.transform(B.since(m), Matrix.Translation((-0.07 * s, -d / 2 - 0.016, cz + h * 0.1)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
    # strap (to the origin)
    st = [Vector((-w / 2 + 0.02, 0, cz + h / 2 - 0.02)), Vector((-w / 2 - 0.02, 0, cz + h)), Vector((-0.06, 0, -0.06)),
          Vector((0, 0, 0)), Vector((0.06, 0, -0.06)), Vector((w / 2 + 0.02, 0, cz + h)), Vector((w / 2 - 0.02, 0, cz + h / 2 - 0.02))]
    B.tube(st, 0.012 * s, segs=4, cap0=False, cap1=False, col=trim, mat='farm_cloth', prof=[1.6, 0.5, 1.6, 0.5])
    # seeds peeking out (tier 3+)
    if tier >= 3:
        for k in range(3):
            B.sphere((-0.06 + k * 0.05, 0.02, cz + h / 2 + 0.02), 0.02, scale=(1, 1, 0.7), segs=7, rings=4,
                     col=[0xf28a26, 0x7ccf4f, 0xe8364f][k], mat='farm_gloss')
    return B.build(f'bag_{tier}', ground_ao=None)
