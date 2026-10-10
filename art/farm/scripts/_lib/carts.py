# Carts: plaza cart behind the plaza wicket (low detail, part of the <= 2k plaza set) and the farm cart «В город»
# (design-v11 §16.3, ~2k). Cart length along Blender +Y = game -Z (yaw 0); shafts point forward (+Y), axle along X.
HAY0, HAY1 = 0xd9b45a, 0xf2d27c


def solid_wheel(B, x, y, R, w, rng):
    B.cyl((x - w / 2, y, R), (x + w / 2, y, R), R, segs=12, col=lambda co, n: mixc(0x9a6234, 0xc08048, 0.5 + noise.noise(co * 6) * 0.5),
          mat='farm_soft')
    B.cyl((x - w / 2 - 0.03, y, R), (x + w / 2 + 0.03, y, R), R * 0.2, segs=8, col=0x6b4a2a, mat='farm_soft')


def spoked_wheel(B, x, y, R, w, n=8):
    c = Vector((x, y, R))
    B.torus(c, R - 0.035, 0.04, segs=16, rsegs=4, rot=(0, math.pi / 2, 0), col=0x8a5a32, mat='farm_soft', scale=(1, 1, 1))
    B.torus(c, R - 0.002, 0.012, segs=16, rsegs=3, rot=(0, math.pi / 2, 0), col=0x5e6266, mat='farm_metal')
    for k in range(n):
        a = TAU * k / n
        d = Vector((0, math.cos(a), math.sin(a)))
        B.tube([c + d * 0.07, c + d * (R - 0.06)], [0.02, 0.015], segs=4, cap0=False, cap1=False, col=0xb07a44, mat='farm_soft')
    B.cyl(c - Vector((w / 2 + 0.04, 0, 0)), c + Vector((w / 2 + 0.04, 0, 0)), 0.075, segs=8, col=0x6b4a2a, mat='farm_soft')


def hay(B, c, s, rng, tufts=0):
    c = Vector(c)
    off = Vector((rng.random() * 9, rng.random() * 9, 0))
    def warp(co):
        lc = co - c
        return co + lc.normalized() * (noise.noise(lc * 4 + off) * 0.06 + noise.noise(lc * 11 + off) * 0.02)
    B.sphere(c, 1.0, scale=s, segs=12, rings=6, mat='farm_soft', warp=warp,
             col=lambda co, n: mixc(HAY0, HAY1, smooth01(0.35 + max(0, n.z) * 0.5 + noise.noise((co - c) * 9 + off) * 0.25)))
    for k in range(tufts):
        a = rng.random() * TAU
        z = rng.uniform(-0.1, 0.6)
        d = Vector((math.cos(a) * math.sqrt(1 - z * z), math.sin(a) * math.sqrt(1 - z * z), z))
        p = c + Vector((d.x * s[0], d.y * s[1], d.z * s[2])) * 0.95
        B.leaf(p, a, math.radians(10 + 50 * max(0, z)), 0.16, 0.025, bend=-0.2, curl=0.1, nu=2, nv=1, shape='lance',
               col=HAY1, col_tip=0xf8e4a0)


def mini_pumpkin(B, c, R, rng):
    pumpkin_body(B, Vector(c), R, R * 1.5, rng, segs=10, ribs=6)


def cart_body(B, rng, L=3.0, W=1.6, hi=False):
    R = 0.45
    zb = R + 0.08
    wy = -0.25
    # bed + side boards + front/back boards
    B.rbox((0, 0, zb), (L - 0.4, W - 0.2, 0.08), r=0.02, rseg=1, nx=4 if hi else 2, rot=(0, 0, math.pi / 2),
           colfn=wood_fn(WOOD, seed=1, axis='y'), end_r=0.015)
    for sx in (-1, 1):
        B.rbox((sx * (W / 2 - 0.1), 0, zb + 0.2), (L - 0.4, 0.05, 0.28), r=0.015, rseg=1, nx=4 if hi else 2, rot=(0, 0, math.pi / 2),
               colfn=wood_fn(mixc(WOOD, WOOD_L, 0.3), seed=2 + sx, axis='y'), end_r=0.012)
    for sy in (-1, 1):
        B.rbox((0, sy * (L / 2 - 0.2), zb + 0.17), (W - 0.2, 0.05, 0.22), r=0.015, rseg=1, nx=2,
               colfn=wood_fn(WOOD_D, seed=5 + sy), end_r=0.012)
    if hi:
        for sx in (-1, 1):
            for k in range(4):
                y = lerp(-(L / 2 - 0.25), L / 2 - 0.25, k / 3)
                B.rbox((sx * (W / 2 - 0.07), y, zb + 0.18), (0.4, 0.06, 0.06), r=0.012, rseg=1, nx=1, rot=UP,
                       colfn=wood_fn(WOOD_D, seed=10 + k), end_r=0.01)
    # axle + wheels
    B.cyl((-(W / 2 + 0.05), wy, R), (W / 2 + 0.05, wy, R), 0.04, segs=6, col=0x6b4a2a, mat='farm_soft')
    for sx in (-1, 1):
        if hi:
            spoked_wheel(B, sx * (W / 2 + 0.02), wy, R, 0.08)
        else:
            solid_wheel(B, sx * (W / 2 + 0.02), wy, R, 0.08, rng)
    # shafts (оглобли) forward, crossbar, and a prop leg so the cart stands level
    for sx in (-1, 1):
        pts = [(sx * 0.42, L / 2 - 0.5, zb - 0.02), (sx * 0.36, L / 2 + 0.4, zb - 0.06), (sx * 0.3, L / 2 + 1.35, zb - 0.16)]
        B.tube(pts, [0.035, 0.03, 0.026], segs=6 if hi else 4, col=WOOD_D, mat='farm_soft')
    B.tube([(-0.32, L / 2 + 1.2, zb - 0.15), (0.32, L / 2 + 1.2, zb - 0.15)], 0.024, segs=5 if hi else 4, col=WOOD_D, mat='farm_soft')
    B.tube([(0, L / 2 + 0.7, zb - 0.1), (0, L / 2 + 0.75, 0.0)], [0.03, 0.025], segs=5 if hi else 4, cap0=False, col=WOOD_D, mat='farm_soft')
    return zb


def build_cart(kind):
    """kind: 'plaza' (behind the plaza wicket: hay, pumpkins, bucket of sunflowers; ~500 tris) or
    'town' (farm cart «В город»: spoked wheels, hay, sacks, crate, lantern; ~2k)."""
    rng = random.Random(77 if kind == 'plaza' else 78)
    B = Builder(70 if kind == 'plaza' else 71)
    hi = kind == 'town'
    zb = cart_body(B, rng, hi=hi)
    if kind == 'plaza':
        hay(B, (0.0, -0.25, zb + 0.32), (0.62, 1.05, 0.42), rng)
        for (x, y, r) in ((0.35, 0.75, 0.16), (-0.3, 0.9, 0.13), (0.05, 0.95, 0.12)):
            mini_pumpkin(B, (x, y, zb + 0.04), r, rng)
        # bucket of sunflowers at the back corner
        bx, by = -0.4, -1.05
        B.cyl((bx, by, zb + 0.04), (bx, by, zb + 0.3), 0.13, r1=0.15, segs=8, col=0x9aa3ab, mat='farm_metal')
        for k, (dx, dy, h) in enumerate(((0.0, 0.0, 0.55), (0.06, 0.05, 0.42))):
            top = Vector((bx + dx, by + dy, zb + 0.3 + h))
            B.tube([(bx + dx * 0.3, by + dy * 0.3, zb + 0.25), top], 0.012, segs=3, cap0=False, cap1=False, col=0x5a9a38, mat='farm_plant')
            flower5(B, top, 0.09, rng, col=0xffc928, centre=0x7a4a22, n=8, pitch=70, petal_shape='lance')
    else:
        hay(B, (0.15, -0.35, zb + 0.34), (0.55, 0.85, 0.42), rng, tufts=10)
        for (x, y, rz) in ((-0.38, 0.65, 0.2), (-0.34, 0.25, -0.3)):
            sack(B, (x, y, zb + 0.04), rng, rz)
        crate_box(B, (0.33, 0.85, zb + 0.04), rng)
        # lantern on a pole at the front
        B.tube([(0.62, 1.25, zb + 0.1), (0.62, 1.25, zb + 1.25), (0.5, 1.25, zb + 1.35)], 0.02, segs=5, col=WOOD_D, mat='farm_soft')
        lantern(B, (0.5, 1.25, zb + 1.18), 0.1)
    return B.build('plaza_cart' if kind == 'plaza' else 'cart_town', ground_ao=(0.1, 0.7), ao=dict(samples=10, dist=0.35, strength=0.4))


def sack(B, c, rng, rz=0.0):
    c = Vector(c)
    prof = [(0.0, 0.0), (0.16, 0.01), (0.2, 0.12), (0.19, 0.3), (0.12, 0.4), (0.05, 0.44), (0.07, 0.5), (0.0, 0.52)]
    B.lathe(prof, segs=8, c=c, col=lambda co, n: mixc(0xcdb48a, 0xe6d2a8, 0.5 + noise.noise(co * 12) * 0.5), mat='farm_cloth',
            rmod=lambda a, t, r, z: 1.0 + 0.08 * math.cos(a * 2 + rz))
    B.torus(c + Vector((0, 0, 0.44)), 0.055, 0.012, segs=8, rsegs=3, col=0x9a7a52, mat='farm_soft')


def crate_box(B, c, rng, s=(0.42, 0.34, 0.26)):
    c = Vector(c)
    sx, sy, sz = s
    for zz in (0.06, sz - 0.06):
        for yy in (-sy / 2 + 0.012, sy / 2 - 0.012):
            B.box(c + Vector((0, yy, zz)), (sx, 0.024, 0.09), col=jitter(0xd6a468, 0.05, rng), mat='farm_soft')
    for xx in (-sx / 2 + 0.012, sx / 2 - 0.012):
        B.box(c + Vector((xx, 0, sz / 2)), (0.024, sy - 0.02, sz), col=0xc0905a, mat='farm_soft')
    for i in range(3):
        for j in range(2):
            p = c + Vector(((i - 1) * sx / 3.2, (j - 0.5) * sy / 2.2, sz - 0.02))
            B.sphere(p, 0.06, segs=6, rings=4, col=jitter(0xe8364f if (i + j) % 2 else 0xf28a26, 0.06, rng), mat='farm_gloss')


def lantern(B, c, s):
    """Small warm lantern: metal cap and frame, glowing glass (farm_glow_fire tinted warm)."""
    c = Vector(c)
    B.cyl(c + Vector((0, 0, -s * 0.6)), c + Vector((0, 0, s * 0.6)), s * 0.45, segs=6, col=0xffd27a, mat='farm_glow_lamp')
    B.cyl(c + Vector((0, 0, s * 0.6)), c + Vector((0, 0, s * 0.95)), s * 0.6, r1=s * 0.12, segs=6, col=0x3a3a3e, mat='farm_metal')
    B.cyl(c + Vector((0, 0, -s * 0.75)), c + Vector((0, 0, -s * 0.6)), s * 0.55, segs=6, col=0x3a3a3e, mat='farm_metal')
    B.torus(c + Vector((0, 0, s * 1.05)), s * 0.14, s * 0.03, segs=6, rsegs=3, rot=(math.pi / 2, 0, 0), col=0x3a3a3e, mat='farm_metal')


glow_mat('farm_glow_lamp', 0xffc46a, 1.6, rough=0.4, coat=0.2)
