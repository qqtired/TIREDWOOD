# Location decor (design-v11 §16.3, level.md): tree pedestal states, lantern post + garland, trees, bush, sunflower,
# haystack, telescope, bench, fence / railing segments, big gate. Needs props_common, crops, carts (lantern, hay).
STONE_T0, STONE_T1 = 0xcdbfa6, 0xe2d6c0
BRASS = 0xd8a640
MOSS = 0x7ea44e


# ---------------------------------------------------------------- tree pedestal (boss) 4 x 4 x 0.3 + stump states
def build_plinth():
    rng = random.Random(5001)
    B = Builder(501)
    B.rbox((0, 0, 0.12), (4.0, 4.0, 0.24), r=0.06, rseg=1, nx=3, colfn=lambda co: mixc(0xb8aa90, 0xcabda4, 0.5 + noise.noise(co * 2) * 0.5),
           end_r=0.06)
    n = 5
    t = 4.0 / n
    for i in range(n):
        for j in range(n):
            x = -2 + t * (i + 0.5); y = -2 + t * (j + 0.5)
            c = mixc(STONE_T0, STONE_T1, rng.random())
            if (i in (0, n - 1) or j in (0, n - 1)) and rng.random() < 0.4:
                c = mixc(c, MOSS, 0.35)
            B.rbox((x, y, 0.27), (t - 0.05, t - 0.05, 0.06 + rng.uniform(0, 0.015)), r=0.02, rseg=1, nx=1,
                   colfn=lambda co, c=c: c, end_r=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            stone(B, (sx * 1.8, sy * 1.8, 0.36), (0.18, 0.18, 0.12), rng, col=0xc8b89c)
    return B.build('boss_plinth', ground_ao=(0.1, 0.7))


def stump_body(B, rng, H=0.85, R=0.5, arc=TAU, rot=0.0, gap_dark=False):
    def rmod(a, t, r, z):
        flare = (1 - t) ** 3 * 0.45 * (0.6 + 0.4 * math.cos(a * 5 + 0.7))
        return 1.0 + flare + noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, z * 3))) * 0.06
    prof = [(R * 1.05, 0.0), (R, 0.15), (R * 0.95, 0.45), (R * 0.97, H - 0.06), (R * 0.9, H)]
    bark = lambda co, n: mixc(0x6e4628, 0x9a6a40, 0.4 + noise.noise(Vector((math.atan2(co.y, co.x) * 6, co.z * 4, 0))) * 0.4)
    fs = B.lathe(prof, segs=14, c=(0, 0, -0.02), col=bark, mat='farm_soft', rmod=rmod, close_top=False, close_bot=False,
                 rot=(0, 0, rot), arc=arc)
    return fs


def stump_top(B, H, R, rng):
    def top(u, v):
        a = u * TAU
        rr = R * 0.9 * (0.04 + 0.96 * v)
        return Vector((math.cos(a) * rr, math.sin(a) * rr, H - 0.02 + (1 - v) * 0.015))
    def cf(u, v):
        ring = abs(math.sin(v * 14 + noise.noise(Vector((u * 5, v, 0))) * 0.6))
        c = mixc(0xd8b080, 0xb88a5c, ring * 0.7)
        return mixc(0x8a6038, c, smooth01(v * 1.3)) if v > 0.9 else c
    fs = B.grid(top, 14, 3, mat='farm_soft', orient=None, colfn=cf, wrap_v=False)
    for f in fs:
        if f.normal.z < 0:
            f.normal_flip()


def stump_sign(B):
    """Little blank plate on a stake in front of the stump (game draws the text)."""
    vpost(B, 0.0, -0.95, -0.04, 0.55, 0.05, seed=9, col=WOOD_D)
    B.rbox((0.0, -0.99, 0.48), (0.44, 0.03, 0.22), r=0.012, rseg=1, nx=2, colfn=wood_fn(WOOD_L, seed=91), end_r=0.01)


def build_stump(state):
    """state: 'sleep' (old stump with moss and mushrooms), 'cracked' (split open, roots unfolding — the Tree grows here),
    'bloom' (stump covered in flowers after the bloom)."""
    rng = random.Random(5002)
    B = Builder(510)
    H, R = 0.85, 0.5
    if state == 'cracked':
        for k, sx in enumerate((-1, 1)):
            m = B.mark()
            stump_body(B, rng, H=H, R=R, arc=TAU * 0.46, rot=(0 if sx > 0 else math.pi) - TAU * 0.23)
            B.transform(B.since(m), Matrix.Translation((sx * 0.14, 0, 0)) @ Matrix.Rotation(sx * -0.12, 4, 'Y'))
        B.box((0, 0, 0.3), (0.3, 0.9, 0.62), col=0x2e1a10, mat='farm_soft')
        for k in range(6):
            a = TAU * k / 6 + 0.3
            d = Vector((math.cos(a), math.sin(a), 0))
            p0 = Vector((0, 0, 0.25))
            B.tube([p0, p0 + d * 0.7 + Vector((0, 0, 0.05)), p0 + d * 1.3 + Vector((0, 0, -0.2)), p0 + d * 1.6 + Vector((0, 0, -0.3))],
                   [0.1, 0.075, 0.045, 0.01], segs=6, cap0=False, col=0x7a5030, mat='farm_soft')
        for k in range(5):
            a = rng.random() * TAU
            stone(B, (math.cos(a) * 0.9, math.sin(a) * 0.9, 0.04), (0.09, 0.07, 0.05), rng, col=0x8a6a48)
    else:
        stump_body(B, rng, H=H, R=R)
        stump_top(B, H, R, rng)
        # moss on the north side, two small mushrooms
        for k in range(4):
            a = math.pi / 2 + rng.uniform(-0.8, 0.8)
            z = rng.uniform(0.2, 0.7)
            B.sphere((math.cos(a) * R * 0.98, math.sin(a) * R * 0.98, z), 0.11, scale=(1, 1, 0.6), segs=6, rings=4, col=MOSS, mat='farm_plant')
        for (a, s) in ((-0.5, 0.07), (-0.2, 0.05)):
            x, y = math.cos(a) * 0.68, math.sin(a) * 0.68
            B.cyl((x, y, -0.01), (x, y, s * 1.3), s * 0.35, segs=6, col=0xf6ead0, mat='farm_soft')
            B.sphere((x, y, s * 1.3), s, scale=(1, 1, 0.6), segs=8, rings=4, col=0xd8462e, mat='farm_gloss')
        if state == 'bloom':
            cols = [0xffffff, 0xffb8d0, 0xffe37a, 0xf6a0c8, 0xfff2a8]
            for k in range(9):
                a = rng.random() * TAU
                rr = rng.uniform(0.1, R * 0.8)
                flower5(B, Vector((math.cos(a) * rr, math.sin(a) * rr, H + 0.01)), rng.uniform(0.05, 0.08), rng, col=cols[k % 5],
                        centre=0xf2b01e, pitch=25)
            for k in range(8):
                a = TAU * k / 8 + rng.random() * 0.4
                p = Vector((math.cos(a) * (R + 0.2), math.sin(a) * (R + 0.2), 0.02))
                flower5(B, p, rng.uniform(0.06, 0.09), rng, col=cols[(k + 2) % 5], centre=0xf2b01e, pitch=30)
                B.leaf(p, a, math.radians(30), 0.14, 0.06, bend=-0.5, curl=0.3, nu=3, nv=1, shape='lance', col=0x5cb547)
            sprout(B, 0.0, 0.05, rng, h=H + 0.12, ll=0.12, lw=0.08, col=0x6cc44a, shape='heart')
    stump_sign(B)
    return B.build({'sleep': 'boss_stump', 'cracked': 'boss_stump_cracked', 'bloom': 'boss_stump_bloom'}[state],
                   ground_ao=(0.1, 0.65), ao=dict(samples=10, dist=0.35, strength=0.4))


# ---------------------------------------------------------------- lantern post, garland
def build_lantern_post():
    """2.8 m lamp post: stone foot, wooden post, curled bracket, hanging warm lantern (glow). ~500 tris."""
    rng = random.Random(5101)
    B = Builder(520)
    stone(B, (0, 0, 0.08), (0.18, 0.18, 0.12), rng, col=0xc8b89c)
    vpost(B, 0, 0, 0.05, 2.6, 0.12, seed=3, col=WOOD_D)
    B.sphere((0, 0, 2.63), 0.07, scale=(1, 1, 0.7), segs=8, rings=4, col=0xe7b874, mat='farm_gloss')
    pts = [(0, 0, 2.35), (0.25, 0, 2.5), (0.45, 0, 2.45), (0.5, 0, 2.35)]
    B.tube(pts, 0.018, segs=5, col=0x3a3a3e, mat='farm_metal')
    B.tube([(0, 0, 2.1), (0.2, 0, 2.38)], 0.012, segs=4, col=0x3a3a3e, mat='farm_metal')
    lantern(B, (0.5, 0, 2.18), 0.13)
    return B.build('lantern_post', ground_ao=(0.08, 0.7))


def build_garland(L=6.0, sag=0.5, n=10):
    """Bazaar garland: rope with warm bulbs and little pennants, origin at the left end, spans +X by L, sags by `sag`.
    Pennants: red / cream / green / orange (no blue-yellow)."""
    B = Builder(521)
    pts = [Vector((L * i / 16, 0, -sag * 4 * (i / 16) * (1 - i / 16))) for i in range(17)]
    B.tube(pts, 0.008, segs=3, cap0=False, cap1=False, col=0x6b5a48, mat='farm_soft')
    def at(t):
        return Vector((L * t, 0, -sag * 4 * t * (1 - t)))
    for k in range(n):
        t = (k + 0.5) / n
        p = at(t)
        B.sphere(p + Vector((0, 0, -0.07)), 0.045, scale=(1, 1, 1.2), segs=6, rings=4, col=0xffd27a, mat='farm_glow_lamp')
        B.cyl(p + Vector((0, 0, -0.02)), p + Vector((0, 0, 0.0)), 0.02, segs=5, col=0x3a3a3e, mat='farm_metal')
    flags = [0xd84a3a, 0xfbefd6, 0x5fae4a, 0xf28a26]
    for k in range(n - 1):
        t = (k + 1) / n
        p = at(t)
        vs = [B.bm.verts.new(q) for q in (p + Vector((-0.09, 0, -0.005)), p + Vector((0.09, 0, -0.005)), p + Vector((0, 0, -0.2)))]
        f = B.bm.faces.new(vs)
        B.paint([f], flags[k % 4], 'farm_cloth', smooth=False)
    return B.build('garland', ground_ao=None)


def build_garland_pole():
    B = Builder(522)
    vpost(B, 0, 0, -0.02, 3.2, 0.1, seed=6, col=WOOD_D)
    B.sphere((0, 0, 3.22), 0.06, scale=(1, 1, 0.7), segs=8, rings=4, col=0xe7b874, mat='farm_gloss')
    return B.build('garland_pole', ground_ao=(0.06, 0.7))


# ---------------------------------------------------------------- trees and plants (InstancedMesh per kind)
def build_tree_apple():
    """Apple tree ~4 m, round crown with red apples. ~1.5k."""
    rng = random.Random(5201)
    B = Builder(530)
    tp = trunk(B, (0, 0, -0.05), (0.05, 0.0, 1.7), 0.17, 0.1, rng, col=0x7a5232, roots=4, root_len=0.5, segs=8, n=4)
    for k in range(3):
        a = TAU * k / 3 + 0.4
        branch(B, _along(tp, 0.75), Vector((math.cos(a), math.sin(a), 0.9)), 0.9, 0.07, rng, col=0x7a5232)
    blobs = round_crown(B, rng, Vector((0.05, 0, 2.75)), 1.25, 0x2f8a3c, 0x8ad45a, seed=60, segs=14, rings=9)
    for (q, d) in crown_points(blobs, rng, 12, zr=(-0.6, 0.5), gap=0.35):
        B.sphere(q + d * 0.03, 0.09, segs=6, rings=4, col=jitter(0xe23a3a, 0.05, rng), mat='farm_gloss')
    return B.build('tree_apple', ground_ao=(0.2, 0.7))


def build_tree_cypress():
    """Tall slim cypress ~6 m (viewpoint). ~700."""
    rng = random.Random(5202)
    B = Builder(531)
    trunk(B, (0, 0, -0.05), (0, 0, 0.9), 0.14, 0.1, rng, col=0x6e4a2c, segs=6, n=2)
    prof = [(0.0, 0.5), (0.45, 0.65), (0.72, 1.1), (0.84, 1.8), (0.88, 2.6), (0.8, 3.4), (0.66, 4.2), (0.46, 5.0), (0.24, 5.6), (0.08, 6.0), (0.0, 6.1)]
    fs = B.lathe(prof, segs=16, c=(0, 0, 0), mat='farm_plant',
                 col=lambda co, n: mixc(0x2c6a3a, 0x5aa04a, smooth01(0.3 + max(0, n.x * 0.3 + n.z * 0.4) + noise.noise(co * 2) * 0.3)))
    B.displace(fs, 0.1, 1.8, seed=4)
    return B.build('tree_cypress', ground_ao=(0.2, 0.7))


def build_tree_linden():
    """Big linden ~6.5 m with a wide round crown (apiary, road). ~1.5k."""
    rng = random.Random(5203)
    B = Builder(532)
    tp = trunk(B, (0, 0, -0.05), (0.0, 0.05, 2.4), 0.26, 0.15, rng, col=0x6e5038, roots=5, root_len=0.8, segs=8, n=4)
    for k in range(4):
        a = TAU * k / 4 + 0.2
        branch(B, _along(tp, 0.7), Vector((math.cos(a), math.sin(a), 0.8)), 1.3, 0.1, rng, col=0x6e5038)
    blobs = [(Vector((0, 0.05, 4.2)), 1.9)]
    for k in range(4):
        a = TAU * k / 4 + 0.6
        blobs.append((Vector((math.cos(a) * 1.3, math.sin(a) * 1.3, 3.7)), 1.2))
    for i, (p, r) in enumerate(blobs):
        canopy_blob(B, p, r, rng, col0=0x3a8a3a, col1=0xa6d860, seed=70 + i, segs=14 if i == 0 else 10, rings=9 if i == 0 else 7)
    return B.build('tree_linden', ground_ao=(0.2, 0.7))


def build_bush():
    """Round garden bush ~1 m with a few flowers (wedges between plots). ~450."""
    rng = random.Random(5204)
    B = Builder(533)
    for i, (x, y, r) in enumerate(((0, 0, 0.5), (0.42, 0.1, 0.36), (-0.38, -0.12, 0.34))):
        canopy_blob(B, (x, y, r * 0.8), r, rng, col0=0x2f8a3c, col1=0x92d45a, seed=80 + i, segs=10, rings=6)
    for k in range(5):
        a = rng.random() * TAU
        B.sphere((math.cos(a) * 0.45, math.sin(a) * 0.38, 0.55 + rng.uniform(-0.15, 0.25)), 0.05, segs=5, rings=3,
                 col=rng.choice([0xffffff, 0xffb8d0, 0xffe37a]), mat='farm_plant')
    return B.build('bush', ground_ao=(0.15, 0.7))


def build_sunflower_decor():
    """Single tall sunflower ~1.9 m for rows / the field behind the apiary. ~320."""
    rng = random.Random(5205)
    B = Builder(534)
    pts = stem_curve((0, 0, -0.02), (0.05, 0.06, 1.75), sway=0.04, n=3)
    B.tube(pts, [0.03, 0.026, 0.022, 0.02], segs=5, cap0=False, col=0x5a9a38, mat='farm_plant')
    for t, yaw in ((0.35, 0.3), (0.6, 3.4)):
        B.leaf(_along([Vector(q) for q in pts], t), yaw, math.radians(25), 0.32, 0.22, bend=-0.7, curl=0.3, nu=3, nv=1, shape='heart',
               col=0x4f9a38, col_tip=0x7cc04a)
    m = B.mark()
    B.sphere((0, 0, 0), 0.16, scale=(1, 1, 0.3), segs=10, rings=3, col=0x5a3418, mat='farm_soft')
    for k in range(14):
        a = TAU * k / 14
        B.leaf((math.cos(a) * 0.15, math.sin(a) * 0.15, 0.0), a, math.radians(6), 0.15, 0.065, bend=0.1, curl=0.25, nu=2, nv=1,
               shape='lance', col=0xffc928, col_base=0xf2a81e, col_tip=0xffe070)
    B.transform(B.since(m), Matrix.Translation(Vector(pts[-1]) + Vector((0, 0.06, 0.02))) @ Matrix.Rotation(-math.radians(65), 4, 'X'))
    return B.build('sunflower_decor', ground_ao=(0.1, 0.7))


def build_haystack():
    """Haystack ~2 x 2 x 1.8 m with straw tufts and a pitchfork. ~700."""
    rng = random.Random(5206)
    B = Builder(535)
    off = Vector((1.0, 2.0, 3.0))
    def warp(co):
        return co + Vector((co.x, co.y, 0)).normalized() * (noise.noise(co * 1.5 + off) * 0.09 + noise.noise(co * 5 + off) * 0.03)
    prof = [(0.0, 0.0), (0.92, 0.0), (1.0, 0.35), (0.95, 0.9), (0.72, 1.35), (0.38, 1.7), (0.0, 1.82)]
    fs = B.lathe(prof, segs=14, c=(0, 0, 0), mat='farm_soft',
                 col=lambda co, n: mixc(HAY0, HAY1, smooth01(0.3 + max(0, n.z) * 0.5 + noise.noise(co * 4) * 0.3)))
    for f in fs:
        for v in f.verts:
            v.co = warp(v.co)
    B.bm.normal_update()
    for k in range(14):
        a = rng.random() * TAU
        z = rng.uniform(0.2, 1.6)
        rr = 1.0 * math.sqrt(max(0.05, 1 - (z / 1.82) ** 2)) * 0.95
        B.leaf((math.cos(a) * rr, math.sin(a) * rr, z), a, math.radians(15 + z * 20), 0.28, 0.04, bend=-0.3, curl=0.1, nu=2, nv=1,
               shape='lance', col=HAY1, col_tip=0xf8e4a0)
    hb = Vector((0.85, -0.5, 0.0)); ht = Vector((1.1, -0.65, 1.55))
    B.tube([hb + Vector((0, 0, 0.25)), ht], 0.02, segs=5, col=0xc8945c, mat='farm_soft')
    for k in (-0.07, 0.0, 0.07):
        B.tube([hb + Vector((0, k, 0.25)), hb + Vector((-0.02, k, 0.02))], [0.009, 0.004], segs=3, cap0=False, col=0x6b6f73, mat='farm_metal')
    return B.build('haystack', ground_ao=(0.15, 0.7))


# ---------------------------------------------------------------- viewpoint and fences
def build_telescope():
    """Brass telescope on a wooden tripod, 1.4 m, eyepiece towards -Y, looks +Y (out to sea). ~450."""
    rng = random.Random(5301)
    B = Builder(540)
    top = Vector((0, 0, 1.15))
    for k in range(3):
        a = TAU * k / 3 + 0.5
        B.tube([top, Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.0))], [0.025, 0.02], segs=5, cap0=False, col=0x9c5b2c, mat='farm_soft')
    B.sphere(top, 0.05, segs=8, rings=4, col=0x6b4a2a, mat='farm_soft')
    d = Vector((0, 1, 0.22)).normalized()
    p0 = top + Vector((0, 0, 0.08)) - d * 0.35
    B.tube([p0, p0 + d * 0.3], 0.035, segs=10, col=BRASS, mat='farm_gold')
    B.tube([p0 + d * 0.3, p0 + d * 0.62], 0.045, segs=10, col=0x7a3a24, mat='farm_gloss')
    B.tube([p0 + d * 0.62, p0 + d * 0.8], 0.055, segs=10, cap1=True, col=BRASS, mat='farm_gold')
    B.cyl(p0 - d * 0.06, p0, 0.02, segs=8, col=0x3a2a1e, mat='farm_soft')
    return B.build('telescope', ground_ao=(0.06, 0.7))


def build_bench():
    """Wooden park bench 1.6 m, seat faces -Y (sit looking -Y). ~500."""
    B = Builder(541)
    for sx in (-1, 1):
        x = sx * 0.65
        B.rbox((x, -0.15, 0.22), (0.44, 0.07, 0.07), r=0.015, rseg=1, nx=1, rot=UP, colfn=wood_fn(WOOD_D, seed=1 + sx), end_r=0.012)
        B.rbox((x, 0.15, 0.42), (0.86, 0.07, 0.07), r=0.015, rseg=1, nx=2, rot=UP, colfn=wood_fn(WOOD_D, seed=3 + sx), end_r=0.012)
        B.rbox((x, 0.0, 0.42), (0.4, 0.07, 0.06), r=0.015, rseg=1, nx=1, rot=(0, 0, math.pi / 2), colfn=wood_fn(WOOD_D, seed=5 + sx), end_r=0.012)
    for k, y in enumerate((-0.16, -0.05, 0.06)):
        B.rbox((0, y, 0.46), (1.6, 0.1, 0.035), r=0.012, rseg=1, nx=3, colfn=wood_fn(mixc(WOOD, WOOD_L, 0.3), seed=10 + k), end_r=0.01)
    for k, z in enumerate((0.62, 0.76)):
        B.rbox((0, 0.17, z), (1.6, 0.03, 0.1), r=0.012, rseg=1, nx=3, rot=(-0.15, 0, 0), colfn=wood_fn(mixc(WOOD, WOOD_L, 0.3), seed=20 + k), end_r=0.01)
    return B.build('bench', ground_ao=(0.08, 0.7))


def build_fence_segment():
    """Rustic farm fence module 2.4 m along +X (origin at the left post foot); repeat by instancing. ~150."""
    B = Builder(542)
    for x in (0.0, 2.4):
        B.tube([(x, 0, -0.05), (x, 0, 1.1)], [0.06, 0.05], segs=5, cap0=False, col=WOOD_D, mat='farm_soft')
    for z in (0.45, 0.85):
        B.tube([(0.0, 0, z), (1.2, 0.01, z + 0.02), (2.4, 0, z)], 0.035, segs=4, cap0=True, cap1=True, col=WOOD, mat='farm_soft')
    return B.build('fence_segment', ground_ao=(0.08, 0.7))


def build_railing_segment():
    """White painted cliff railing module 2.4 m along +X (origin at the left post foot). ~150."""
    B = Builder(543)
    W0, W1 = 0xf4efe6, 0xffffff
    for x in (0.0, 2.4):
        B.rbox((x, 0, 0.5), (1.04, 0.08, 0.08), r=0.015, rseg=1, nx=1, rot=UP, colfn=lambda co: W0, mat='farm_gloss', end_r=0.015)
    B.rbox((1.2, 0, 1.0), (2.5, 0.1, 0.05), r=0.015, rseg=1, nx=2, colfn=lambda co: W1, mat='farm_gloss', end_r=0.012)
    B.rbox((1.2, 0, 0.5), (2.4, 0.04, 0.04), r=0.01, rseg=1, nx=2, colfn=lambda co: W0, mat='farm_gloss', end_r=0.008)
    return B.build('railing_segment', ground_ao=(0.06, 0.7))


def build_gate_big():
    """Wide farm gate 3.2 m (west gate to town / van gate in the east): two cream-and-green painted leaves, closed,
    sunflower knobs on the posts. Faces -Y. ~800."""
    rng = random.Random(5302)
    B = Builder(544)
    for sx in (-1, 1):
        vpost(B, sx * 1.7, 0, -0.05, 2.0, 0.18, seed=40 + sx, col=WOOD_D)
        B.sphere((sx * 1.7, 0, 2.04), 0.12, scale=(1, 1, 0.75), segs=10, rings=5, col=0xe7b874, mat='farm_gloss')
    for sx in (-1, 1):
        x0, x1 = sx * 0.04, sx * 1.6
        xm = (x0 + x1) / 2
        for z in (0.35, 1.25):
            B.rbox((xm, 0, z), (1.56, 0.06, 0.12), r=0.015, rseg=1, nx=3, colfn=lambda co: 0x5fae4a, mat='farm_gloss', end_r=0.012)
        for k in range(6):
            x = lerp(x0, x1, (k + 0.5) / 6)
            h = 1.35 + 0.18 * math.sin(math.pi * (k + 0.5) / 6)
            B.rbox((x, 0.045, h / 2 + 0.1), (h, 0.03, 0.1), r=0.012, rseg=1, nx=2, rot=UP, colfn=lambda co: 0xfbefd6, mat='farm_gloss', end_r=0.03)
        a = math.atan2(0.9, 1.5) * (-sx)
        B.rbox((xm, -0.045, 0.8), (math.hypot(1.5, 0.9), 0.04, 0.1), r=0.012, rseg=1, nx=3, rot=(0, a, 0), colfn=lambda co: 0x5fae4a,
               mat='farm_gloss', end_r=0.01)
    return B.build('gate_big', ground_ao=(0.08, 0.7))
