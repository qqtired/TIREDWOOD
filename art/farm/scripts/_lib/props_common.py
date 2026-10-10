# shared prop helpers
UP = (0, -math.pi / 2, 0)      # rbox length X -> Z (vertical post)
ALONG_Y = (0, 0, math.pi / 2)  # rbox length X -> Y
WOOD = 0xc98448
WOOD_D = 0x9c5b2c
WOOD_L = 0xe2b47c
ROOF = 0xc8553d     # warm terracotta red shingles
ROOF_D = 0xa8432f
STONE = 0xbdb6aa

def vpost(B, x, y, z0, z1, w, seed=0, col=WOOD_D, r=None, end_r=None):
    h = z1 - z0
    B.rbox((x, y, (z0 + z1) / 2), (h, w, w), r=r or w * 0.22, rseg=2, nx=max(2, int(h / 0.35)), rot=UP,
           colfn=wood_fn(col, seed=seed), end_r=end_r if end_r is not None else w * 0.2)

def plank_x(B, c, size, seed=0, col=WOOD, r=None, nx=None, rot_z=0.0, rot_x=0.0, end_r=None):
    nx = nx or max(2, int(size[0] / 0.3))
    B.rbox(c, size, r=r or min(size[1], size[2]) * 0.3, rseg=2, nx=nx, rot=(rot_x, 0, rot_z),
           colfn=wood_fn(col, seed=seed), end_r=end_r if end_r is not None else min(size[1], size[2]) * 0.25)

def stone(B, c, s, rng, col=STONE, flat=0.7):
    c = Vector(c)
    sx, sy, sz = s
    off = Vector((rng.random() * 10, rng.random() * 10, rng.random() * 10))
    def warp(co):
        lc = co - c
        return co + lc.normalized() * noise.noise(lc * 9 + off) * min(sx, sy, sz) * 0.18
    tint = jitter(col, 0.07, rng)
    B.sphere(c, 1.0, scale=(sx, sy, sz), segs=8, rings=5, rot=(0, 0, rng.random() * 3), mat='farm_soft', warp=warp,
             col=lambda co, n: mixc(mulc(tint, 0.82), mixc(tint, 0xffffff, 0.2), max(0, n.z) * 0.9))

def shingle_roof(B, x0, x1, y_eave, z_eave, y_ridge, z_ridge, rows, rng, col=ROOF, col_d=ROOF_D, thick=0.035,
                 overhang=0.06):
    """One roof slope from eave (y_eave, z_eave) up to ridge; shingle rows as overlapping rounded planks."""
    for i in range(rows):
        t0 = i / rows
        t1 = (i + 1.25) / rows
        ya, za = lerp(y_eave, y_ridge, t0), lerp(z_eave, z_ridge, t0)
        yb, zb = lerp(y_eave, y_ridge, min(1, t1)), lerp(z_eave, z_ridge, min(1, t1))
        cy, cz = (ya + yb) / 2, (za + zb) / 2
        L = math.hypot(yb - ya, zb - za)
        ang = math.atan2(zb - za, yb - ya)
        c = jitter(mixc(col, col_d, (i % 2) * 0.5), 0.04, rng)
        B.rbox((0, 0, 0), (x1 - x0 + overhang * 2, L, thick), r=thick * 0.4, rseg=1, nx=max(3, int((x1 - x0) / 0.25)),
               colfn=lambda co, c=c: mixc(c, mulc(c, 0.85), 0.5 + noise.noise(co * 7) * 0.5), end_r=thick * 0.3)
        # rotate around X by ang then move
        fs = B._last_faces if hasattr(B, '_last_faces') else None

def roof_slab(B, cx, x_len, ya, za, yb, zb, thick, col, rng, nx=None, seed=0):
    """Rounded slab spanning in X, from (ya,za) to (yb,zb) in YZ."""
    cy, cz = (ya + yb) / 2, (za + zb) / 2
    L = math.hypot(yb - ya, zb - za)
    ang = math.atan2(zb - za, yb - ya)
    nx = nx or max(2, int(x_len / 0.5))
    fs = B.rbox((0, 0, 0), (x_len, L, thick), r=thick * 0.45, rseg=1, nx=nx,
                colfn=lambda co: mixc(col, mulc(col, 0.86), 0.5 + noise.noise(co * 6 + Vector((seed, 0, 0))) * 0.5),
                end_r=thick * 0.35)
    B.transform(fs, Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(ang, 4, 'X'))
    return fs

def gable_roof(B, cx, x_len, cy, half_w, z_eave, z_ridge, rows, rng, col=ROOF, col_d=ROOF_D, thick=0.04):
    """Two slopes of overlapping shingle rows meeting at a ridge above cy."""
    for side in (-1, 1):
        for i in range(rows):
            t0 = i / rows
            t1 = min(1.0, (i + 1.35) / rows)
            ya, za = cy + side * half_w * (1 - t0), lerp(z_eave, z_ridge, t0)
            yb, zb = cy + side * half_w * (1 - t1), lerp(z_eave, z_ridge, t1)
            c = jitter(col if i % 2 == 0 else col_d, 0.03, rng)
            # lift each row slightly so rows overlap like shingles
            lift = thick * 0.6
            if side < 0:
                roof_slab(B, cx, x_len, ya, za + lift * (rows - i) * 0.0, yb, zb, thick, c, rng, seed=i)
            else:
                roof_slab(B, cx, x_len, yb, zb, ya, za, thick, c, rng, seed=i + 10)
    # ridge cap
    B.rbox((cx, cy, z_ridge + thick * 0.4), (x_len + 0.04, thick * 2.2, thick * 1.6), r=thick * 0.7, rseg=2,
           nx=max(2, int(x_len / 0.5)), colfn=lambda co: mixc(col_d, mulc(col_d, 0.85), 0.5 + noise.noise(co * 6) * 0.5),
           end_r=thick * 0.5)

def rope(B, pts, r=0.012, col=0xd8bf8a):
    B.tube(pts, r, segs=5, cap0=False, cap1=False, col=col, mat='farm_soft',
           vcolfn=lambda t: mixc(col, mulc(col, 0.85), abs(math.sin(t * 40))))

def paper(B, c, w, h, rot_z=0.0, col=0xfff6e2, tilt=0.0, pin=0xe84a3a, y_face=-1):
    """Paper note on a vertical board facing -Y; slightly curled; pushpin."""
    c = Vector(c)
    def fn(u, v):
        x = (u - 0.5) * w
        z = (v - 0.5) * h
        y = -0.004 - 0.008 * ((u - 0.5) * 2) ** 2 - 0.01 * max(0, v - 0.7) ** 2 * 3
        p = Vector((x, y, z))
        p = Matrix.Rotation(rot_z, 3, 'Y') @ p
        return c + p
    fs = B.grid(fn, 3, 3, col=col, mat='farm_soft', orient=None,
                colfn=lambda u, v: mixc(col, mulc(col, 0.92), abs(u - 0.5) + max(0, 0.2 - v)))
    if sum(f.normal.y for f in fs) > 0:
        for f in fs:
            f.normal_flip()
        B.bm.normal_update()
    # make it face -Y
    B.sphere(c + Matrix.Rotation(rot_z, 3, 'Y') @ Vector((0, -0.012, h * 0.4)), 0.014, scale=(1, 0.8, 1), segs=8, rings=5,
             col=pin, mat='farm_gloss')
