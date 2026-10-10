# TIREDWOOD farm — landscape decor (grass, wild flowers, bushes, stones, hay, pumpkins, barrels, log seats...).
# Background Blender, run from the repo root:
#   Blender -b --factory-startup --python art/farm/scripts/decor_models.py -- grass flowers bushes props [preview]
# Output: client/assets/farm/models/decor_<set>.glb (+ art/farm/renders/decor_<set>.png with "preview").
# One node per kind, origin at the base, vertex colours only. In the game (client/farm/decor/) every node becomes one
# InstancedMesh (plants, wind in the vertex shader) or goes into one static merge (props).
# Budgets (task): tuft / flower 30–150 tris, bush 300–800, stone 100–300.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, '_lib')
exec(open(os.path.join(LIB, 'farmlib.py')).read(), globals())
# farmlib writes to the main farm checkout; decor goes to the checkout this script lives in
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
GLB_DIR = ROOT + '/client/assets/farm/models'
PNG_DIR = ROOT + '/art/farm/renders'
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = 'preview' in ARGS

# ---------------------------------------------------------------- helpers

def blade_w(u):
    return (1 - u) ** 0.75


def petal_head(B, n, r_in, r_out, col_in, col_mid, col_tip, petal_w=0.9, cup=0.0, dome=0.004, round_tip=True):
    """Flat flower head facing +Z at the origin: yellow fan in the middle and n petals (2 tris each)."""
    bm = B.bm
    c = bm.verts.new((0, 0, dome))
    ring = []
    for k in range(n):
        a = TAU * k / n
        ring.append(bm.verts.new((math.cos(a) * r_in, math.sin(a) * r_in, dome * 0.4)))
    faces = []
    vcol = {c: col_in}
    for v in ring:
        vcol[v] = mixc(col_in, col_mid, 0.35)
    for k in range(n):
        faces.append(bm.faces.new((c, ring[k], ring[(k + 1) % n])))
    for k in range(n):
        a0 = TAU * k / n
        a1 = TAU * (k + 1) / n
        am = (a0 + a1) / 2
        half = (a1 - a0) / 2 * petal_w
        z = cup * r_out
        if round_tip:
            p0 = bm.verts.new((math.cos(am - half * 0.6) * r_out, math.sin(am - half * 0.6) * r_out, z))
            p1 = bm.verts.new((math.cos(am + half * 0.6) * r_out, math.sin(am + half * 0.6) * r_out, z))
            vcol[p0] = col_tip
            vcol[p1] = col_tip
            # petal from the two ring verts it sits on (shared with the fan)
            faces.append(bm.faces.new((ring[k], p0, p1, ring[(k + 1) % n])))
        else:
            p = bm.verts.new((math.cos(am) * r_out, math.sin(am) * r_out, z))
            vcol[p] = col_tip
            faces.append(bm.faces.new((ring[k], p, ring[(k + 1) % n])))
    bm.normal_update()
    if sum(f.normal.z for f in faces) < 0:
        for f in faces:
            f.normal_flip()
        bm.normal_update()
    # ring verts colour: inner disc colour on the fan, petal base colour on the petals is the same vertex —
    # paint per loop instead so the petals start white and the disc stays yellow
    idx = B.mi('farm_plant')
    for i, f in enumerate(faces):
        f.material_index = idx
        f.smooth = True
        petal = i >= n
        for lp in f.loops:
            v = lp.vert
            if v is c:
                col = col_in
            elif v in ring:
                col = col_mid if petal else mixc(col_in, col_mid, 0.25)
            else:
                col = vcol[v]
            lp[B.col] = lin(col)
    return faces


def place(B, faces, pos, tilt=0.0, tilt_dir=0.0, yaw=0.0, scale=1.0):
    M = (Matrix.Translation(Vector(pos)) @ Matrix.Rotation(tilt_dir, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'Y')
         @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Diagonal((scale, scale, scale, 1)))
    B.transform(faces, M)


def stem(B, p0, p1, r=0.0035, sway=0.02, rng=None, col=0x5f9a3c, n=2):
    pts = stem_curve(p0, p1, sway=sway, n=n)
    B.tube(pts, [r * (1 - 0.2 * i / (len(pts) - 1)) for i in range(len(pts))], segs=3, cap0=False, cap1=False, col=col, mat='farm_plant')
    return pts


def basal_leaves(B, rng, n, L, W, col=0x4f8f38, tip=0x86bf55, shape='lance', pitch=(30, 55)):
    for k in range(n):
        a = rng.random() * TAU
        B.leaf((rng.uniform(-0.01, 0.01), rng.uniform(-0.01, 0.01), 0.0), a, math.radians(rng.uniform(*pitch)),
               L * rng.uniform(0.8, 1.15), W, bend=-0.9, curl=0.2, fold=0.1, nu=2, nv=1, shape=shape, col=col, col_tip=tip,
               col_base=mulc(col, 0.8))


WARM_STONE = 0xd4b892

def rock(B, c, s, rng, col=WARM_STONE, moss=0.0, segs=8, rings=5, rough=0.18):
    """Stone like props_common.stone(), plus moss on top and a darker foot."""
    c = Vector(c)
    sx, sy, sz = s
    off = Vector((rng.random() * 10, rng.random() * 10, rng.random() * 10))
    def warp(co):
        lc = co - c
        return co + lc.normalized() * (noise.noise(lc * (3.5 / max(sx, sy)) + off) * rough + noise.noise(lc * 9 + off) * 0.06) * min(sx, sy, sz)
    tint = jitter(col, 0.06, rng)
    mossc = 0x7f9a46
    def cf(co, n):
        lc = co - c
        k = max(0.0, n.z)
        base = mixc(mulc(tint, 0.78), mixc(tint, 0xffffff, 0.18), k * 0.9)
        m = moss * smooth01((n.z - 0.35) * 2.2 + noise.noise(lc * 4 + off) * 0.6)
        return mixc(base, mossc, m)
    return B.sphere(c, 1.0, scale=(sx, sy, sz), segs=segs, rings=rings, rot=(0, 0, rng.random() * 3), mat='farm_soft',
                    warp=warp, col=cf)


# ---------------------------------------------------------------- grass

def build_tuft():
    """Lawn tuft ~0.25 m: 11 upright blades from a tight base. ~66 tris."""
    rng = random.Random(9101)
    B = Builder(9101)
    for k in range(11):
        a = TAU * k / 11 + rng.uniform(-0.3, 0.3)
        r = rng.uniform(0.0, 0.07)
        L = rng.uniform(0.12, 0.27)
        B.leaf((math.cos(a) * r, math.sin(a) * r, -0.01), a + rng.uniform(-0.5, 0.5), math.radians(rng.uniform(66, 86)), L,
               rng.uniform(0.05, 0.07), bend=-rng.uniform(0.4, 0.9), curl=0.1, fold=0.22, nu=2, nv=1, wfn=blade_w,
               col=0x64a243, col_base=0x4a8238, col_tip=0x94c860)
    return B.build('tuft', ground_ao=None)


def build_fuzz():
    """Tiny lawn tuft ~0.1 m for the dense near-field carpet: 6 blades, one segment each. ~12 tris."""
    rng = random.Random(9104)
    B = Builder(9104)
    for k in range(6):
        a = TAU * k / 6 + rng.uniform(-0.4, 0.4)
        r = rng.uniform(0.0, 0.06)
        B.leaf((math.cos(a) * r, math.sin(a) * r, -0.01), a + rng.uniform(-0.6, 0.6), math.radians(rng.uniform(55, 80)),
               rng.uniform(0.07, 0.14), rng.uniform(0.035, 0.05), bend=-0.3, curl=0.1, fold=0.2, nu=1, nv=1, wfn=blade_w,
               col=0x6aa445, col_base=0x5a9640, col_tip=0xa2cf6a)
    return B.build('fuzz', ground_ao=None)


def build_tuft_tall():
    """Meadow grass ~0.75 m with a seed head. ~70 tris."""
    rng = random.Random(9102)
    B = Builder(9102)
    for k in range(5):
        a = TAU * k / 5 + rng.uniform(-0.4, 0.4)
        r = rng.uniform(0.0, 0.06)
        B.leaf((math.cos(a) * r, math.sin(a) * r, -0.01), a + rng.uniform(-0.4, 0.4), math.radians(rng.uniform(66, 84)),
               rng.uniform(0.42, 0.7), rng.uniform(0.034, 0.046), bend=-rng.uniform(0.6, 1.2), curl=0.08, fold=0.2, nu=3, nv=1,
               wfn=blade_w, col=0x6aa043, col_base=0x3f7a30, col_tip=0xb4d27a)
    for k in range(1):
        a = rng.random() * TAU
        top = Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, rng.uniform(0.7, 0.85)))
        B.tube([Vector((0, 0, -0.01)), top * 0.5 + Vector((0, 0, 0.02)), top], [0.004, 0.0035, 0.003], segs=3, cap0=False, cap1=False,
               col=0x9db35a, mat='farm_plant')
        B.leaf(top - Vector((0, 0, 0.01)), a, math.radians(80), 0.13, 0.03, bend=-0.4, curl=0.3, fold=0.0, nu=2, nv=1,
               shape='ellipse', col=0xd9c27a, col_base=0xb8a85a, col_tip=0xf0dc9a)
    return B.build('tuft_tall', ground_ao=None)


def build_clover():
    """Clover patch Ø ~0.35 m: trefoils and two pink-white heads. ~130 tris."""
    rng = random.Random(9103)
    B = Builder(9103)
    for k in range(4):
        a = TAU * k / 4 + rng.uniform(-0.3, 0.3)
        r = rng.uniform(0.04, 0.12)
        p = Vector((math.cos(a) * r, math.sin(a) * r, rng.uniform(0.05, 0.1)))
        y0 = rng.random() * TAU
        for j in range(3):
            B.leaf(p, y0 + TAU * j / 3, math.radians(rng.uniform(5, 20)), 0.06, 0.055, bend=-0.2, curl=0.25, fold=0.1, nu=2,
                   nv=1, shape='heart', col=0x3f8f3a, col_base=0x6fae4f, col_tip=0x4c9a40, rib=0xa8d488)
    for k in range(2):
        a = rng.random() * TAU
        top = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, rng.uniform(0.13, 0.17)))
        B.tube([Vector((0, 0, 0.0)), top], 0.003, segs=3, cap0=False, cap1=False, col=0x7aa858, mat='farm_plant')
        B.sphere(top, 0.03, scale=(1, 1, 0.85), segs=6, rings=3, mat='farm_plant',
                 col=lambda co, n: mixc(0xf6e8f0, 0xe58ab8, smooth01(0.5 - n.z * 0.6)))
    return B.build('clover', ground_ao=None)


# ---------------------------------------------------------------- wild flowers

def build_daisy():
    """Four daisies ~0.3 m, big stylised heads. ~130 tris."""
    rng = random.Random(9201)
    B = Builder(9201)
    basal_leaves(B, rng, 2, 0.12, 0.04, col=0x4f8f38)
    for k in range(4):
        a = TAU * k / 4 + rng.uniform(-0.4, 0.4)
        top = Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, rng.uniform(0.13, 0.22)))
        stem(B, (0, 0, -0.01), top, r=0.0045, n=1)
        m = B.mark()
        petal_head(B, 8, 0.024, 0.074, 0xf5bf24, 0xfffdf4, 0xfff8f0, petal_w=0.82, cup=0.12)
        place(B, B.since(m), top, tilt=rng.uniform(0.15, 0.45), tilt_dir=a, scale=rng.uniform(0.85, 1.1))
    return B.build('daisy', ground_ao=None)


def build_poppy():
    """Two poppies and a bud ~0.45 m. ~140 tris."""
    rng = random.Random(9202)
    B = Builder(9202)
    basal_leaves(B, rng, 2, 0.13, 0.05, col=0x5a9440, shape='oval')
    for k in range(2):
        a = TAU * k / 2 + rng.uniform(-0.5, 0.5)
        top = Vector((math.cos(a) * 0.07, math.sin(a) * 0.07, rng.uniform(0.24, 0.34)))
        stem(B, (0, 0, -0.01), top, r=0.0045, col=0x6f9f48)
        m = B.mark()
        y0 = rng.random() * TAU
        for j in range(4):
            B.leaf((0, 0, 0.0), y0 + TAU * j / 4, math.radians(40), 0.088, 0.115, bend=0.25, curl=-0.25, fold=0.0, nu=2, nv=1,
                   shape='round', col=0xe8322a, col_base=0x4a1414, col_tip=0xff6a3e, rib=0xd42a24)
        B.sphere((0, 0, 0.014), 0.016, scale=(1, 1, 0.8), segs=5, rings=3, col=0x3b4a26, mat='farm_plant')
        place(B, B.since(m), top, tilt=rng.uniform(0.1, 0.4), tilt_dir=a)
    bud = Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0.22))
    pts = stem(B, (0, 0, -0.01), bud, r=0.003, col=0x6f9f48)
    B.sphere(bud + Vector((0.01, 0, -0.01)), 0.014, scale=(1, 1, 1.4), segs=5, rings=3, col=0x7aa04a, mat='farm_plant')
    return B.build('poppy', ground_ao=None)


def build_cornflower():
    """Four cornflowers ~0.4 m. ~110 tris."""
    rng = random.Random(9203)
    B = Builder(9203)
    basal_leaves(B, rng, 3, 0.14, 0.018, col=0x6f9a5a, tip=0x9cbf86)
    for k in range(4):
        a = TAU * k / 4 + rng.uniform(-0.4, 0.4)
        top = Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, rng.uniform(0.18, 0.28)))
        stem(B, (0, 0, -0.01), top, r=0.0045, col=0x7a9e66, n=1)
        m = B.mark()
        petal_head(B, 8, 0.018, 0.066, 0x3a2f7a, 0x3b63d6, 0x7fa6ff, petal_w=1.0, cup=0.35, round_tip=False)
        place(B, B.since(m), top, tilt=rng.uniform(0.1, 0.35), tilt_dir=a, scale=rng.uniform(0.9, 1.1))
    return B.build('cornflower', ground_ao=None)


def build_lavender():
    """Lavender for planters and borders, 6 spikes ~0.45 m. ~130 tris."""
    rng = random.Random(9204)
    B = Builder(9204)
    basal_leaves(B, rng, 3, 0.11, 0.014, col=0x7d9c78, tip=0xa9c0a2, pitch=(45, 70))
    for k in range(6):
        a = TAU * k / 6 + rng.uniform(-0.3, 0.3)
        top = Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, rng.uniform(0.34, 0.46)))
        stem(B, (0, 0, -0.01), top, r=0.0028, col=0x88a37c, sway=0.0, n=1)
        d = top.normalized()
        B.sphere(top + d * 0.035, 0.022, scale=(1, 1, 3.0), segs=5, rings=3, rot=(0, math.atan2(top.x, top.z) * 0.6, 0),
                 mat='farm_plant', col=lambda co, n: mixc(0x6e4fb8, 0xb08ce8, smooth01(0.5 + n.z * 0.5)))
    return B.build('lavender', ground_ao=None)


def build_marigold():
    """Marigolds (orange pompoms) for planters, ~0.3 m. ~130 tris."""
    rng = random.Random(9205)
    B = Builder(9205)
    basal_leaves(B, rng, 3, 0.1, 0.04, col=0x3f7f34, tip=0x6aa64a, shape='oval', pitch=(20, 45))
    for k in range(3):
        a = TAU * k / 3 + rng.uniform(-0.4, 0.4)
        top = Vector((math.cos(a) * 0.07, math.sin(a) * 0.07, rng.uniform(0.2, 0.28)))
        stem(B, (0, 0, -0.01), top, r=0.0035, col=0x4f8a3a, n=1)
        off = Vector((rng.random() * 9, 0, 0))
        B.sphere(top, 0.044, scale=(1, 1, 0.75), segs=6, rings=3, mat='farm_plant',
                 warp=lambda co, top=top, off=off: co + (co - top).normalized() * noise.noise((co - top) * 60 + off) * 0.008,
                 col=lambda co, n: mixc(0xd8641a, 0xffb02a, smooth01(0.4 + n.z * 0.6)))
    return B.build('marigold', ground_ao=None)


# ---------------------------------------------------------------- bushes

def build_bush_round():
    """Round bush ~0.9 m, two greens. ~420 tris."""
    rng = random.Random(9301)
    B = Builder(9301)
    for i, (x, y, r) in enumerate(((0, 0, 0.48), (0.36, 0.14, 0.34), (-0.32, -0.16, 0.33))):
        canopy_blob(B, (x, y, r * 0.82), r, rng, col0=0x2c7a36, col1=0x8fcf5a, segs=10, rings=6, seed=91 + i)
    for k in range(5):
        a = rng.random() * TAU
        p = (math.cos(a) * 0.42, math.sin(a) * 0.36, rng.uniform(0.35, 0.75))
        leaf_cluster(B, p, rng, n=3, L=0.11, col=0x5fae46)
    return B.build('bush_round', ground_ao=(0.18, 0.62))


def build_bush_bloom():
    """Flowering bush ~1 m along the paths: pink, white and lilac blossoms. ~740 tris."""
    rng = random.Random(9302)
    B = Builder(9302)
    for i, (x, y, r) in enumerate(((0, 0, 0.5), (0.38, 0.12, 0.36), (-0.36, -0.12, 0.36))):
        canopy_blob(B, (x, y, r * 0.86), r, rng, col0=0x2f7a3a, col1=0x86c85a, segs=10, rings=7, seed=97 + i)
    cols = [0xf7a6c8, 0xffffff, 0xf48fb8, 0xd8b4f0, 0xffd6e6]
    for k in range(20):
        a = rng.random() * TAU
        z = rng.uniform(0.3, 0.92)
        rr = 0.5 * math.sqrt(max(0.1, 1 - ((z - 0.45) / 0.55) ** 2)) + 0.05
        p = Vector((math.cos(a) * rr * 1.25, math.sin(a) * rr, z))
        c = rng.choice(cols)
        B.sphere(p, 0.055, scale=(1, 1, 0.7), segs=5, rings=3, mat='farm_plant',
                 col=lambda co, n, c=c: mixc(mulc(c, 0.85), mixc(c, 0xffffff, 0.35), smooth01(0.5 + n.z * 0.5)))
    return B.build('bush_bloom', ground_ao=(0.18, 0.62))


def build_bush_low():
    """Low wide shrub ~0.55 m for fences and corners. ~330 tris."""
    rng = random.Random(9303)
    B = Builder(9303)
    for i, (x, y, r, sq) in enumerate(((0, 0, 0.5, 0.6), (0.48, 0.08, 0.36, 0.7), (-0.46, -0.06, 0.34, 0.7))):
        canopy_blob(B, (x, y, r * 0.5), r, rng, col0=0x3a7a2e, col1=0x9ccf62, sq=sq, segs=10, rings=6, seed=103 + i)
    return B.build('bush_low', ground_ao=(0.14, 0.6))


# ---------------------------------------------------------------- props

def build_stone_s():
    rng = random.Random(9401)
    B = Builder(9401)
    rock(B, (0, 0, 0.06), (0.17, 0.13, 0.11), rng, moss=0.55)
    rock(B, (0.2, 0.09, 0.03), (0.08, 0.07, 0.055), rng, col=0xd2c6b0)
    return B.build('stone_s', ground_ao=(0.06, 0.6))


def build_stone_m():
    rng = random.Random(9402)
    B = Builder(9402)
    rock(B, (0, 0, 0.12), (0.34, 0.26, 0.2), rng, moss=0.45, segs=10, rings=6)
    rock(B, (0.36, -0.12, 0.04), (0.1, 0.09, 0.07), rng, col=0xcfc2ac)
    return B.build('stone_m', ground_ao=(0.1, 0.6))


def build_boulder():
    rng = random.Random(9403)
    B = Builder(9403)
    rock(B, (0, 0, 0.42), (0.75, 0.6, 0.55), rng, moss=0.6, segs=12, rings=8, rough=0.2)
    rock(B, (0.7, 0.35, 0.16), (0.3, 0.26, 0.2), rng, moss=0.3, segs=8, rings=5)
    return B.build('boulder', ground_ao=(0.2, 0.55))


def build_stump():
    """Tree stump Ø 0.6 m with roots, rings on the cut and two mushrooms. ~240 tris."""
    rng = random.Random(9404)
    B = Builder(9404)
    bark = 0x7a5232
    prof = [(0.34, -0.02), (0.29, 0.08), (0.26, 0.26), (0.265, 0.36), (0.24, 0.4), (0.16, 0.405), (0.08, 0.41), (0, 0.41)]
    def cf(co, n):
        r = math.hypot(co.x, co.y)
        if co.z > 0.39 and r < 0.245:
            k = 0.5 + 0.5 * math.sin(r * 70)
            return mixc(0xd8ad74, 0xb8844e, k * 0.7 if r > 0.02 else 0.9)
        return mixc(mulc(bark, 0.8), mixc(bark, 0xa07a54, 0.5), 0.5 + noise.noise(co * Vector((14, 14, 3))) * 0.5)
    B.lathe(prof, segs=10, col=cf, mat='farm_soft',
            rmod=lambda a, t, r, z: 1 + 0.06 * math.sin(a * 5 + 1) * (1 - t))
    for k in range(4):
        a = TAU * k / 4 + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        B.tube([d * 0.18 + Vector((0, 0, 0.16)), d * 0.38 + Vector((0, 0, 0.04)), d * 0.52 + Vector((0, 0, -0.03))],
               [0.08, 0.05, 0.02], segs=4, cap0=False, col=bark, mat='farm_soft')
    for k, (x, y, h) in enumerate(((0.27, 0.06, 0.1), (0.29, -0.06, 0.06))):
        B.tube([Vector((x, y, 0.0)), Vector((x + 0.02, y, h))], 0.012, segs=4, cap0=False, col=0xf2e6cc, mat='farm_soft')
        B.sphere((x + 0.02, y, h), 0.035 - k * 0.008, scale=(1, 1, 0.55), segs=6, rings=3, mat='farm_soft',
                 col=lambda co, n: mixc(0xc0502c, 0xe07a40, max(0, n.z)))
    return B.build('stump', ground_ao=(0.1, 0.65))


def build_bale_round():
    """Round hay bale Ø 1.2 × 1.1 m lying along X, spiral on the ends. ~290 tris."""
    B = Builder(9405)
    R, Lh = 0.6, 0.55
    prof = [(0, -Lh), (0.2, -Lh), (0.4, -Lh + 0.005), (0.54, -Lh + 0.02), (0.6, -Lh + 0.09), (0.605, -0.2),
            (0.605, 0.2), (0.6, Lh - 0.09), (0.54, Lh - 0.02), (0.4, Lh - 0.005), (0.2, Lh), (0, Lh)]
    off = Vector((3.0, 1.0, 2.0))
    def cf(co, n):
        r = math.hypot(co.x, co.y)
        a = math.atan2(co.y, co.x)
        if abs(co.z) > Lh - 0.03:
            s = 0.5 + 0.5 * math.sin(r * 45 - a)
            return mixc(0xc99a46, 0xf0d488, s * 0.8 + noise.noise(co * 6 + off) * 0.2)
        k = 0.5 + 0.5 * noise.noise(Vector((a * 3, co.z * 14, 0)) + off)
        return mixc(0xd6aa52, 0xf2d68c, k)
    fs = B.lathe(prof, segs=16, col=cf, mat='farm_soft',
                 rmod=lambda a, t, r, z: 1 + 0.025 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, z * 3))))
    # lie on its side along X, sunk 3 cm into the ground (no gap under a round body)
    B.transform(fs, Matrix.Translation((0, 0, R - 0.03)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    return B.build('bale_round', ground_ao=(0.12, 0.65))


def build_bale_block():
    """Square straw bale 0.95 × 0.5 × 0.42 m with two twine bands. ~200 tris."""
    B = Builder(9406)
    def cf(co):
        k = 0.5 + 0.5 * noise.noise(Vector((co.x * 3, co.y * 25, co.z * 25)))
        c = mixc(0xd9b25c, 0xf3db92, k)
        if abs(abs(co.x) - 0.24) < 0.035 and abs(co.z) < 0.2 + 0.01:
            c = mixc(c, 0x8a6a3a, 0.75)
        return c
    B.rbox((0, 0, 0.21), (0.95, 0.5, 0.42), r=0.06, rseg=1, nx=8, colfn=cf, mat='farm_soft', end_r=0.05)
    return B.build('bale_block', ground_ao=(0.08, 0.7))


def build_pumpkin():
    """Ribbed pumpkin Ø 0.6 m with a stem and a leaf. ~230 tris."""
    rng = random.Random(9407)
    B = Builder(9407)
    prof = [(0, 0.03), (0.17, 0.0), (0.27, 0.06), (0.3, 0.16), (0.27, 0.27), (0.16, 0.33), (0, 0.3)]
    def rib(a, t, r, z):
        return 1 - 0.09 * (0.5 - 0.5 * math.cos(a * 8))
    def cf(co, n):
        a = math.atan2(co.y, co.x)
        valley = 0.5 - 0.5 * math.cos(a * 8)
        c = mixc(0xf39a34, 0xc8641c, valley * 0.8)
        return mixc(c, 0xb4581a, smooth01((co.z - 0.24) * 12) * 0.5)
    B.lathe(prof, segs=16, col=cf, mat='farm_soft', rmod=rib)
    B.tube([Vector((0, 0, 0.29)), Vector((0.02, 0, 0.36)), Vector((0.05, 0.0, 0.39))], [0.028, 0.024, 0.02], segs=5, cap0=False,
           col=0x7a8a3a, mat='farm_soft')
    B.leaf((0.04, 0.02, 0.3), 0.6, math.radians(15), 0.16, 0.14, bend=-0.4, curl=0.3, fold=0.1, nu=2, nv=1, shape='heart',
           col=0x4f8f38, col_tip=0x6aa848, mat='farm_soft')
    return B.build('pumpkin', ground_ao=(0.08, 0.6))


def build_barrel():
    """Water barrel 0.7 m: staves, two iron hoops, water on top. ~260 tris."""
    B = Builder(9408)
    prof = [(0, 0.0), (0.24, 0.0), (0.255, 0.05), (0.265, 0.1), (0.27, 0.14), (0.285, 0.25), (0.29, 0.35), (0.285, 0.45),
            (0.27, 0.56), (0.265, 0.6), (0.255, 0.65), (0.245, 0.7), (0.215, 0.7), (0.215, 0.64), (0, 0.64)]
    def cf(co, n):
        r = math.hypot(co.x, co.y)
        if co.z > 0.635 and r < 0.214:
            return mixc(0x3e6f86, 0x6fa2b4, r / 0.214)
        if (0.095 < co.z < 0.15) or (0.55 < co.z < 0.61):
            return 0x4b4642
        a = math.atan2(co.y, co.x)
        k = 0.5 + 0.5 * math.cos(a * 6)
        return mixc(0xa5683a, 0xc98a52, k * 0.7 + noise.noise(co * Vector((4, 4, 30))) * 0.2)
    B.lathe(prof, segs=12, col=cf, mat='farm_soft')
    return B.build('barrel', ground_ao=(0.08, 0.65))


def build_log_seat():
    """Log bench 1.6 m, seat height 0.4. ~110 tris."""
    rng = random.Random(9409)
    B = Builder(9409)
    pts = [Vector((-0.8, 0, 0.2)), Vector((-0.27, 0.01, 0.205)), Vector((0.27, -0.01, 0.2)), Vector((0.8, 0, 0.195))]
    def vc(t):
        return mixc(0x7a5232, 0x94683e, 0.5 + 0.5 * math.sin(t * 23))
    B.tube(pts, [0.21, 0.2, 0.2, 0.19], segs=9, col=0x7a5232, mat='farm_soft', vcolfn=vc)
    # light cut ends
    for f in B.bm.faces:
        if len(f.verts) > 4:
            for lp in f.loops:
                lp[B.col] = lin(0xdcb27a)
    B.tube([Vector((0.25, 0.12, 0.3)), Vector((0.33, 0.24, 0.36))], [0.04, 0.03], segs=4, cap0=False, col=0x7a5232, mat='farm_soft')
    return B.build('log_seat', ground_ao=(0.06, 0.7))


def build_woodpile():
    """Stack of split firewood 1.1 × 0.5 × 0.6 m between two stakes. ~230 tris."""
    rng = random.Random(9410)
    B = Builder(9410)
    rows = [(0.09, 5), (0.25, 4), (0.4, 3), (0.53, 2)]
    for z, n in rows:
        for k in range(n):
            x = (k - (n - 1) / 2) * 0.2 + rng.uniform(-0.02, 0.02)
            r = rng.uniform(0.075, 0.09)
            y = rng.uniform(-0.03, 0.03)
            fs = B.tube([Vector((x, y - 0.25, z)), Vector((x, y + 0.25, z))], r, segs=5, col=0x6e4a2c, mat='farm_soft')
            for f in fs:
                if len(f.verts) > 4:
                    for lp in f.loops:
                        lp[B.col] = lin(jitter(0xe0b47e, 0.06, rng))
    for x in (-0.58, 0.58):
        B.box((x, 0, 0.33), (0.06, 0.06, 0.66), col=0x5a3a22, mat='farm_soft')
    return B.build('woodpile', ground_ao=(0.08, 0.65))


def build_planks():
    """Duckboard 1.1 × 0.9 m at the troughs (wet spot). ~100 tris."""
    rng = random.Random(9411)
    B = Builder(9411)
    for k in range(6):
        y = (k - 2.5) * 0.15
        B.box((rng.uniform(-0.02, 0.02), y, 0.045), (1.1, 0.12, 0.03), col=jitter(0xb88a56, 0.08, rng), mat='farm_soft')
    for x in (-0.42, 0.42):
        B.box((x, 0, 0.015), (0.08, 0.9, 0.03), col=0x7a5a3a, mat='farm_soft')
    return B.build('planks', ground_ao=None)


def build_planter():
    """Wooden planter box 1.3 × 0.45 × 0.32 m with soil (flowers are separate). ~110 tris."""
    rng = random.Random(9412)
    B = Builder(9412)
    w, d, h = 1.3, 0.45, 0.32
    t = 0.04
    for s in (-1, 1):
        B.box((0, s * (d / 2 - t / 2), h / 2), (w, t, h), col=0xb07a48, mat='farm_soft')
        B.box((s * (w / 2 - t / 2), 0, h / 2), (t, d - 2 * t, h), col=0xa06c3e, mat='farm_soft')
    B.box((0, 0, h - 0.06), (w - 2 * t, d - 2 * t, 0.02), col=0x5a3f2a, mat='farm_soft')
    for sx in (-1, 1):
        for sy in (-1, 1):
            B.box((sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), h / 2 + 0.01), (0.06, 0.06, h + 0.02), col=0x8a5a34, mat='farm_soft')
    return B.build('planter', ground_ao=(0.08, 0.6))


SETS = {
    'grass': [build_tuft, build_tuft_tall, build_clover, build_fuzz],
    'flowers': [build_daisy, build_poppy, build_cornflower, build_lavender, build_marigold],
    'bushes': [build_bush_round, build_bush_bloom, build_bush_low],
    'props': [build_stone_s, build_stone_m, build_boulder, build_stump, build_bale_round, build_bale_block, build_pumpkin,
              build_barrel, build_log_seat, build_woodpile, build_planks, build_planter],
}
LIMITS = {'fuzz': 30, 'tuft': 150, 'tuft_tall': 150, 'clover': 150, 'daisy': 150, 'poppy': 150, 'cornflower': 150, 'lavender': 150,
          'marigold': 150, 'bush_round': 800, 'bush_bloom': 800, 'bush_low': 800, 'stone_s': 300, 'stone_m': 300,
          'boulder': 300, 'stump': 300, 'bale_round': 320, 'bale_block': 240, 'pumpkin': 260, 'barrel': 300,
          'log_seat': 160, 'woodpile': 260, 'planks': 120, 'planter': 140}

for name in [a for a in ARGS if a in SETS]:
    reset()
    objs = [f() for f in SETS[name]]
    fit_all(objs, LIMITS)
    report(objs)
    to_origin(objs)
    bpy.context.view_layer.update()
    export_glb(objs, f'{GLB_DIR}/decor_{name}.glb')
    if PREVIEW:
        spread(objs, 0.25)
        preview(objs, f'{PNG_DIR}/decor_{name}.png', yaw=-25, pitch=22, margin=0.85)
    print('DECOR', name, {o.name: tris(o) for o in objs})
