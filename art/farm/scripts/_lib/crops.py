# All 19 crops x 4 stages (stage0 sprout, stage1 growing, stage2 almost, stage3 ripe). Needs farmlib in globals.
# Crop helpers (needs farmlib in globals)
SOIL = 0.12  # crop origin height above bed origin (soil level inside the 0.15 m frame)


CROP_SCALE = 1.45  # crops are authored for a 1 m bed; level.md: bed 1.6 x 1.6 (inner 1.46)


ROWS = (-1 / 3, 0.0, 1 / 3)


GRID9 = [(x, y) for y in ROWS for x in (-0.3, 0.0, 0.3)]


GRID6 = [(x, y) for y in ROWS for x in (-0.2, 0.2)]


HEX7 = [(-0.24, -1 / 3), (0.24, -1 / 3), (-0.3, 0.0), (0.0, 0.0), (0.3, 0.0), (-0.24, 1 / 3), (0.24, 1 / 3)]


def quad_pos(i, gap):
    return ((-0.5 if i % 2 == 0 else 0.5) * gap, (0.5 if i < 2 else -0.5) * gap)


G = dict(leaf=0x5cb547, dark=0x3d8a37, light=0x9fd85e, yellow=0xb9d94f, stem=0x6aa83e)


def jit(rng, pts, a=0.035):
    return [(x + rng.uniform(-a, a), y + rng.uniform(-a, a)) for x, y in pts]


def stem_curve(p0, p1, sway=0.0, n=4, rng=None, lean=(0, 0)):
    p0 = Vector(p0); p1 = Vector(p1)
    pts = []
    for i in range(n + 1):
        t = i / (n - 0 if n else 1)
        p = p0.lerp(p1, t)
        p.x += math.sin(t * math.pi) * sway + lean[0] * t * t
        p.y += math.sin(t * math.pi) * sway * 0.5 + lean[1] * t * t
        pts.append(p)
    return pts


def sprout(B, x, y, rng, h=0.04, ll=0.035, lw=0.026, col=0x7ccb4f, stem_col=0x9ccf6a, shape='heart', n=2,
           pitch=25, tilt=None):
    yaw0 = rng.random() * TAU
    top = (x + rng.uniform(-0.005, 0.005), y + rng.uniform(-0.005, 0.005), h)
    B.tube([(x, y, -0.02), (x, y, h * 0.5), top], [0.0045, 0.004, 0.0035], segs=5, cap0=False,
           col=stem_col, mat='farm_plant')
    for k in range(n):
        B.leaf(top, yaw0 + TAU * k / n, math.radians(pitch + rng.uniform(-8, 8)), ll * rng.uniform(0.85, 1.1), lw,
               bend=-0.35, curl=0.35, fold=0.05, nu=3, nv=1, shape=shape, col=col,
               col_base=mixc(col, stem_col, 0.5), col_tip=mixc(col, 0xe6ff9a, 0.25))


def rosette(B, x, y, rng, n=5, L=(0.08, 0.12), W=0.05, pitch=(65, 30), bend=-0.7, col=0x5cb547, col_base=None,
            col_tip=None, shape='oval', nu=4, nv=1, curl=0.3, fold=0.12, z=0.0, wave=0.0, yaw0=None, rib=None):
    yaw0 = rng.random() * TAU if yaw0 is None else yaw0
    for k in range(n):
        t = k / max(1, n - 1)
        yaw = yaw0 + k * 2.39996
        p = math.radians(lerp(pitch[0], pitch[1], t) + rng.uniform(-6, 6))
        l = lerp(L[0], L[1], t) * rng.uniform(0.9, 1.08)
        B.leaf((x, y, z), yaw, p, l, W * rng.uniform(0.9, 1.1), bend=bend * rng.uniform(0.8, 1.2), curl=curl,
               fold=fold, nu=nu, nv=nv, shape=shape, col=jitter(col, 0.06, rng), col_base=col_base, col_tip=col_tip,
               wave=wave, rib=rib)


def bulb(B, c, r, sz=1.0, col_top=0xe8364f, col_bot=0xfff0f2, mat='farm_gloss', segs=12, rings=8, tail=0.0,
         tail_col=None, split=0.35):
    c = Vector(c)
    def cf(co, n):
        t = (co.z - (c.z - r * sz)) / (2 * r * sz)
        return mixc(col_bot, col_top, smooth01((t - split) * 3 + 0.5))
    B.sphere(c, r, scale=(1, 1, sz), segs=segs, rings=rings, col=cf, mat=mat)
    if tail > 0:
        B.tube([c - Vector((0, 0, r * sz * 0.7)), c - Vector((0, 0, r * sz + tail * 0.5)), c - Vector((0, 0, r * sz + tail))],
               [r * 0.35, r * 0.15, 0.0], segs=6, cap0=False, col=tail_col or col_bot, mat=mat)


def soil_mound(B, x, y, r, h=0.012, col=0x6a4129):
    B.sphere((x, y, 0.0), r, scale=(1, 1, h / r), segs=10, rings=4, col=col, mat='farm_soft')


def crop_finalize(cid, stages, yaw=-20, pitch=34, margin=0.78, look_z=None, beds=True, gap=1.85, budget=None):
    for i, o in enumerate(stages):
        o.name = f'stage{i}'
        o.data.name = f'{cid}_stage{i}'
        o.data.transform(Matrix.Scale(CROP_SCALE, 4))
        o.data.update()
        if budget:
            fit_tris(o, budget[i])
    save_blend(f'crop_{cid}')
    to_origin(stages)
    bpy.context.view_layer.update()
    export_glb(stages, f'{GLB_DIR}/crop_{cid}.glb')
    extra = []
    if beds:
        bd = append_from('bed', ['bed_dug', 'bed_frame'])
        for i in range(len(stages)):
            qx, qy = quad_pos(i, gap)
            for b in bd:
                extra.append(dup(b, (qx, qy, 0)))
        for b in bd:
            bpy.data.objects.remove(b, do_unlink=True)
    for i, o in enumerate(stages):
        qx, qy = quad_pos(i, gap)
        o.location = (qx, qy, SOIL if beds else 0)
        o['farm_export_at_origin'] = True
    preview(stages + extra, f'{PNG_DIR}/crop_{cid}.png', yaw=yaw, pitch=pitch, margin=margin, look_z=look_z)
    save_blend(f'crop_{cid}')
    tt = {o.name: tris(o) for o in stages}
    print('FINAL', cid, tt, 'total', sum(tt.values()))
    return tt


def crop_test(cid, stages, yaw=-20, pitch=34, margin=0.78, look_z=None, gap=1.85, size=512):
    for i, o in enumerate(stages):
        qx, qy = quad_pos(i, gap)
        o.location = (qx, qy, 0)
        o.scale = (CROP_SCALE,) * 3
    preview(stages, f'{SCR}/t_{cid}.png', yaw=yaw, pitch=pitch, margin=margin, look_z=look_z, size=size)
    print('TEST', cid, {o.name: tris(o) for o in stages})


def build_radish():
    rng = random.Random(101)
    pos = jit(rng, HEX7, 0.025)
    out = []
    # stage0: sprouts
    B = Builder(1)
    for (x, y) in pos:
        sprout(B, x, y, rng, h=0.035, ll=0.032, lw=0.03, col=0x86cf55, shape='heart')
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    # stage1: small rosettes, hint of pink at soil
    B = Builder(2)
    for (x, y) in pos:
        rosette(B, x, y, rng, n=4, L=(0.06, 0.085), W=0.045, pitch=(70, 45), bend=-0.8, col=0x62bb48,
                col_base=0xb4486a, shape='oval', nu=4, nv=1)
        bulb(B, (x, y, 0.004), 0.013, sz=0.8, segs=8, rings=5)
    out.append(B.build('s1', ground_ao=(0.03, 0.75)))
    # stage2
    B = Builder(3)
    for (x, y) in pos:
        rosette(B, x, y, rng, n=5, L=(0.09, 0.13), W=0.06, pitch=(72, 38), bend=-0.9, col=0x58b445,
                col_base=0xc04a6e, shape='oval', nu=4, nv=1, wave=0.08)
        bulb(B, (x, y, 0.012), 0.026, sz=0.95, segs=10, rings=6)
    out.append(B.build('s2', ground_ao=(0.03, 0.75)))
    # stage3: ripe — big red bulbs pushing out of the soil
    B = Builder(4)
    for (x, y) in pos:
        r = rng.uniform(0.042, 0.05)
        bulb(B, (x, y, r * 0.5), r, sz=0.92, segs=12, rings=7, tail=0.05, split=0.22)
        rosette(B, x, y, rng, n=6, L=(0.13, 0.19), W=0.075, pitch=(80, 45), bend=-1.1, col=0x55b244,
                col_base=0xc8506f, col_tip=0x7fcf55, shape='oval', nu=4, nv=1, wave=0.08, z=r * 1.25)
    out.append(B.build('s3', ground_ao=(0.03, 0.75)))
    return out


# lettuce, onion, carrot, dill, microgreens, wheat
POS5 = [(-0.24, -1 / 3), (0.24, -1 / 3), (0.0, 0.0), (-0.24, 1 / 3), (0.24, 1 / 3)]


# ---------------------------------------------------------------- onion
def onion_bulb(B, x, y, r, rng, z=0.0):
    prof = [(0.0, -r * 0.85), (r * 0.45, -r * 0.78), (r * 0.85, -r * 0.42), (r, 0.0), (r * 0.88, r * 0.45),
            (r * 0.52, r * 0.85), (r * 0.2, r * 1.15), (r * 0.12, r * 1.35), (0.0, r * 1.4)]
    c = Vector((x, y, z))
    ph = rng.random() * TAU
    def cf(co, n):
        lc = co - c
        a = math.atan2(lc.y, lc.x) + ph
        s = 0.5 + 0.5 * math.sin(a * 7)
        t = (lc.z + r) / (2.4 * r)
        base = mixc(0xf1c27a, 0xd99045, t * 0.7)
        base = mixc(base, 0xb96f35, s * 0.35)
        if lc.z < -r * 0.6:
            base = mixc(base, 0xf7e2b5, 0.6)
        return base
    B.lathe(prof, segs=10, c=(x, y, z), col=cf, mat='farm_gloss', close_top=False, close_bot=False)


def onion_leaves(B, x, y, rng, n, H, r0=0.008, top_z=0.0):
    yaw0 = rng.random() * TAU
    for k in range(n):
        yaw = yaw0 + k * TAU / n + rng.uniform(-0.3, 0.3)
        h = H * rng.uniform(0.75, 1.05)
        lean = rng.uniform(0.15, 0.35) * h
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        p0 = Vector((x, y, top_z - 0.01))
        p1 = p0 + Vector((0, 0, h * 0.55)) + d * lean * 0.25
        p2 = p0 + Vector((0, 0, h)) + d * lean
        B.tube([p0, p1, p2], [r0, r0 * 0.8, 0.0], segs=5, cap0=False, col=0x6cbf54, mat='farm_plant',
               vcolfn=lambda t: mixc(0xcfe6a0, mixc(0x5fb84b, 0x8fd468, 0.3), min(1, t * 3)))


def build_onion():
    rng = random.Random(303)
    pos = jit(rng, HEX7, 0.025)
    out = []
    B = Builder(1)
    for (x, y) in pos:
        onion_leaves(B, x, y, rng, 2, 0.06, r0=0.004)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    B = Builder(2)
    for (x, y) in pos:
        onion_leaves(B, x, y, rng, 3, 0.14, r0=0.006)
    out.append(B.build('s1', ground_ao=(0.03, 0.75)))
    B = Builder(3)
    for (x, y) in pos:
        onion_bulb(B, x, y, 0.022, rng, z=0.0)
        onion_leaves(B, x, y, rng, 4, 0.22, r0=0.007, top_z=0.03)
    out.append(B.build('s2', ground_ao=(0.03, 0.75)))
    B = Builder(4)
    for (x, y) in pos:
        r = rng.uniform(0.043, 0.05)
        onion_bulb(B, x, y, r, rng, z=r * 0.55)
        onion_leaves(B, x, y, rng, 4, 0.26, r0=0.009, top_z=r * 2.0)
    out.append(B.build('s3', ground_ao=(0.03, 0.75)))
    return out


# ---------------------------------------------------------------- carrot
def frilly(u):
    return (math.sin(math.pi * min(1, u * 0.95 + 0.03)) ** 0.7) * (0.45 + 0.55 * abs(math.sin(u * 13)))


# ---------------------------------------------------------------- dill
def dill_frond(B, base, yaw, pitch, L, W, rng, col=0x6fbf55):
    B.leaf(base, yaw, pitch, L, W, bend=-0.8, curl=0.1, fold=0.2, nu=7, nv=1,
           wfn=lambda u: (math.sin(math.pi * min(1, u + 0.05)) ** 0.8) * (0.35 + 0.65 * abs(math.sin(u * 16))),
           col=jitter(col, 0.06, rng), col_base=0x8ccd62, col_tip=0x9edc72, rib=0x8fcf65)


# ---------------------------------------------------------------- microgreens
def micro_sprout(B, x, y, h, rng, leaf=0.02, stem_col=0xe9f0c8, leaf_col=0x7ccf4f, z=0.0):
    yaw = rng.random() * TAU
    lean = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 1)).normalized()
    top = Vector((x, y, z)) + lean * h
    B.tube([(x, y, z - 0.01), top], 0.0022, segs=3, cap0=False, cap1=False, col=stem_col, mat='farm_plant')
    for k in range(2):
        B.leaf(top, yaw + math.pi * k, math.radians(rng.uniform(15, 35)), leaf * rng.uniform(0.85, 1.15), leaf * 0.85,
               bend=-0.3, curl=0.3, fold=0.0, nu=2, nv=1, shape='round', col=jitter(leaf_col, 0.07, rng),
               col_base=mixc(leaf_col, stem_col, 0.4), rib=leaf_col)


# ---------------------------------------------------------------- pinnate fronds (carrot, dill)
def pinnate(B, base, yaw, pitch, L, rng, pairs=3, lw=0.03, ll=0.4, bend=-0.9, col=0x4fae45, stalk=0x7cbf52, thin=False,
            r=0.003):
    base = Vector(base)
    h = Vector((math.cos(yaw), math.sin(yaw), 0))
    Z = Vector((0, 0, 1))
    n = 4
    pts = [base.copy()]
    dirs = []
    p = base.copy()
    for i in range(n):
        a = pitch + bend * (i / n)
        d = h * math.cos(a) + Z * math.sin(a)
        dirs.append(d)
        p = p + d * (L / n)
        pts.append(p.copy())
    B.tube(pts, [r, r * 0.9, r * 0.8, r * 0.7, r * 0.5], segs=3, cap0=False, cap1=False, col=stalk, mat='farm_plant')
    path = lambda t: pts[0].lerp(pts[-1], t) if False else _along(pts, t)
    for k in range(pairs):
        t = 0.4 + 0.5 * k / max(1, pairs - 1)
        q = _along(pts, t)
        a = pitch + bend * t
        for s in (-1, 1):
            B.leaf(q, yaw + s * 1.0, a + 0.15, L * ll * (1.15 - 0.4 * t), lw, bend=-0.4, curl=0.15, fold=0.2,
                   nu=2 if thin else 3, nv=1, wfn=frilly if not thin else (lambda u: math.sin(math.pi * min(1, u * 0.9 + 0.05)) ** 0.8),
                   col=jitter(col, 0.06, rng), col_base=mixc(col, stalk, 0.4), col_tip=mixc(col, 0xc8f08a, 0.25), rib=col)
    B.leaf(pts[-1], yaw, pitch + bend, L * ll * 0.8, lw, bend=-0.3, curl=0.15, fold=0.2, nu=2 if thin else 3, nv=1,
           wfn=frilly if not thin else None, shape='lance', col=col, col_tip=mixc(col, 0xc8f08a, 0.25), rib=col)


def _along(pts, t):
    n = len(pts) - 1
    f = t * n
    i = min(n - 1, int(f))
    return pts[i].lerp(pts[i + 1], f - i)


def carrot_top(B, x, y, rng, n, L, W, z=0.0):
    yaw0 = rng.random() * TAU
    for k in range(n):
        yaw = yaw0 + k * TAU / n + rng.uniform(-0.25, 0.25)
        pinnate(B, (x, y, z - 0.005), yaw, math.radians(rng.uniform(68, 80)), L * rng.uniform(0.85, 1.1), rng, pairs=2,
                lw=W, ll=0.45, bend=-1.1, col=0x4aa944, stalk=0x86c45a, r=0.0035)


def umbel(B, top, r, rng, col=0xf0d34a):
    top = Vector(top)
    n = 5
    ends = []
    for k in range(n):
        a = TAU * k / n + rng.uniform(-0.15, 0.15)
        e = top + Vector((math.cos(a) * r, math.sin(a) * r, r * 0.45))
        B.tube([top, e], 0.0025, segs=3, cap0=False, cap1=False, col=0x8cc55a, mat='farm_plant')
        ends.append(e)
    for e in ends + [top + Vector((0, 0, r * 0.62))]:
        B.sphere(e + Vector((0, 0, 0.006)), r * 0.36, scale=(1, 1, 0.55), segs=6, rings=3,
                 col=lambda co, nn: mixc(col, 0xfff2a0, max(0, nn.z) * 0.5), mat='farm_plant')


def build_dill():
    rng = random.Random(505)
    out = []
    pos4 = jit(rng, [(-0.22, -0.2), (0.24, -0.22), (-0.2, 0.24), (0.22, 0.2)], 0.03)
    B = Builder(1)
    for (x, y) in jit(rng, HEX7, 0.03):
        sprout(B, x, y, rng, h=0.04, ll=0.05, lw=0.01, col=0x82c95b, shape='lance', n=2, pitch=50)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    for si, (H, nf, fl, um) in enumerate([(0.14, 3, 0.12, 0), (0.28, 3, 0.18, 0), (0.46, 3, 0.22, 1)]):
        B = Builder(2 + si)
        for (x, y) in pos4:
            h = H * rng.uniform(0.9, 1.1)
            lean = (rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04))
            pts = stem_curve((x, y, -0.02), (x, y, h), sway=0.01, n=3, lean=lean)
            B.tube(pts, [0.008, 0.007, 0.006, 0.005], segs=5, cap0=False, col=0x7fbf55, mat='farm_plant')
            for k in range(nf):
                t = 0.15 + 0.55 * k / max(1, nf - 1)
                p = _along([Vector(q) for q in pts], t)
                pinnate(B, p, rng.random() * TAU, math.radians(rng.uniform(35, 55)), fl * (1.1 - 0.4 * t), rng, pairs=3,
                        lw=0.012, ll=0.5, bend=-0.8, col=0x6cbf55, stalk=0x86c45a, thin=True, r=0.0025)
            if um:
                umbel(B, pts[-1], 0.05, rng)
            else:
                pinnate(B, pts[-1], rng.random() * TAU, math.radians(75), fl * 0.6, rng, pairs=2, lw=0.012, ll=0.5,
                        bend=-0.6, col=0x6cbf55, stalk=0x86c45a, thin=True, r=0.0025)
        out.append(B.build(f's{si+1}', ground_ao=(0.03, 0.75)))
    return out


def build_carrot():
    rng = random.Random(404)
    pos = jit(rng, GRID6, 0.03)
    out = []
    B = Builder(1)
    for (x, y) in jit(rng, HEX7, 0.025):
        sprout(B, x, y, rng, h=0.035, ll=0.045, lw=0.012, col=0x78c752, shape='lance')
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    def top(B, x, y, n, L, W, z=0.0):
        yaw0 = rng.random() * TAU
        for k in range(n):
            yaw = yaw0 + k * TAU / n + rng.uniform(-0.25, 0.25)
            pinnate(B, (x, y, z - 0.005), yaw, math.radians(rng.uniform(70, 80)), L * rng.uniform(0.88, 1.1), rng,
                    pairs=2, lw=W, ll=0.48, bend=-1.1, col=0x4aa944, stalk=0x86c45a, r=0.004, thin=True)
    B = Builder(2)
    for (x, y) in pos:
        top(B, x, y, 3, 0.13, 0.04)
    out.append(B.build('s1', ground_ao=(0.03, 0.75)))
    B = Builder(3)
    for (x, y) in pos:
        carrot_root(B, x, y, 0.02, 0.012, rng)
        top(B, x, y, 4, 0.2, 0.05, z=0.018)
    out.append(B.build('s2', ground_ao=(0.03, 0.75)))
    B = Builder(4)
    for (x, y) in pos:
        carrot_root(B, x, y, rng.uniform(0.036, 0.04), 0.045, rng)
        top(B, x, y, 4, 0.26, 0.06, z=0.05)
    out.append(B.build('s3', ground_ao=(0.03, 0.75)))
    return out


def carrot_root(B, x, y, r, show, rng):
    prof = [(0.0, -0.1), (r * 0.35, -0.07), (r * 0.8, -0.02), (r, show * 0.6), (r * 0.85, show), (r * 0.4, show + r * 0.25), (0.0, show + r * 0.3)]
    c = Vector((x, y, 0))
    def cf(co, n):
        lc = co - c
        ring = 0.5 + 0.5 * math.sin(lc.z * 160)
        col = mixc(0xf98a2a, 0xe8681a, ring * 0.35)
        if lc.z > show * 0.95:
            col = mixc(col, 0x7aa83a, 0.6)
        return col
    B.lathe(prof, segs=8, c=(x, y, 0), col=cf, mat='farm_gloss')


def lettuce_head(B, x, y, rng, n_in, n_out, L_in, L_out, W_in, W_out, core=0.0):
    yaw0 = rng.random() * TAU
    for k in range(n_out):
        yaw = yaw0 + k * TAU / n_out + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(yaw), math.sin(yaw), 0)) * 0.012
        B.leaf((x + d.x, y + d.y, 0.0), yaw, math.radians(rng.uniform(50, 62)), L_out * rng.uniform(0.92, 1.06), W_out,
               bend=-1.25, curl=0.55, fold=0.0, nu=5, nv=2, shape='spoon', udist='tip', col=jitter(0x5cb847, 0.05, rng),
               col_base=0xd4eea0, col_tip=0x4aa83e, wave=0.05, rib=0xe6f6c4)
    for k in range(n_in):
        yaw = yaw0 + 0.5 + k * TAU / n_in + rng.uniform(-0.15, 0.15)
        d = Vector((math.cos(yaw), math.sin(yaw), 0)) * 0.006
        B.leaf((x + d.x, y + d.y, 0.0), yaw, math.radians(rng.uniform(78, 86)), L_in * rng.uniform(0.92, 1.04), W_in,
               bend=-2.1, curl=0.6, fold=0.0, nu=5, nv=2, shape='spoon', udist='tip', col=jitter(0xa4dc62, 0.04, rng),
               col_base=0xeaf8b8, col_tip=0x8ed25a, wave=0.03, rib=0xf2fbd8)
    if core > 0:
        B.sphere((x, y, core * 0.85), core, scale=(1, 1, 0.85), segs=8, rings=5, col=0xc4ea84, mat='farm_plant')


def build_lettuce():
    rng = random.Random(202)
    pos = jit(rng, POS5, 0.03)
    out = []
    B = Builder(1)
    for (x, y) in jit(rng, HEX7, 0.03):
        sprout(B, x, y, rng, h=0.03, ll=0.04, lw=0.036, col=0x9ad65e, shape='round')
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    for si, (ni, no, li, lo, wi, wo, core) in enumerate([(2, 4, 0.06, 0.09, 0.07, 0.08, 0.0),
                                                         (3, 5, 0.09, 0.13, 0.095, 0.11, 0.025),
                                                         (4, 6, 0.12, 0.18, 0.12, 0.15, 0.045)]):
        B = Builder(2 + si)
        for (x, y) in pos:
            lettuce_head(B, x, y, rng, ni, no, li, lo, wi, wo, core=core)
        out.append(B.build(f's{si+1}', ground_ao=(0.03, 0.75)))
    return out


def tray(B, ry, rng, soil=0x5a3622):
    B.rbox((0, ry, 0.03), (0.84, 0.2, 0.06), r=0.012, rseg=1, nx=3, colfn=wood_fn(0xd09a5e, seed=ry * 10), end_r=0.01)
    B.box((0, ry, 0.062), (0.8, 0.16, 0.004), col=soil, mat='farm_soft')


def wheat_stalk(B, x, y, h, rng, ripe, ear=True, ear_len=0.07):
    lean = (rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06))
    top = Vector((x + lean[0], y + lean[1], h))
    mid = Vector((x + lean[0] * 0.3, y + lean[1] * 0.3, h * 0.55))
    if ripe:
        sc, ec, lc = 0xe0b048, 0xf3c457, 0xd6a845
    else:
        sc, ec, lc = 0x74b84a, 0x9fd05c, 0x63ae45
    B.tube([(x, y, -0.02), mid, top], [0.009, 0.008, 0.007], segs=3, cap0=False, cap1=False, col=sc, mat='farm_plant')
    if rng.random() < 0.6:
        B.leaf(Vector((x, y, h * 0.2)), rng.random() * TAU, math.radians(rng.uniform(35, 55)), h * 0.5, 0.032,
               bend=-1.1, curl=0.15, fold=0.15, nu=3, nv=1, shape='strap', col=lc, col_base=mulc(lc, 0.9),
               col_tip=mixc(lc, 0xffffff, 0.15))
    d = (top - mid).normalized()
    if ripe and (lean[0] or lean[1]):
        d = (d + Vector((lean[0], lean[1], 0)).normalized() * 0.55).normalized()
    p1 = top + d * ear_len
    pts = [top.lerp(p1, t) for t in (0, 0.25, 0.6, 1.0)]
    B.tube(pts, [0.011, 0.022, 0.019, 0.0], segs=5, cap0=True, col=ec, mat='farm_plant',
           vcolfn=lambda t: mixc(ec, mixc(ec, 0xfff6c8, 0.35), abs(math.sin(t * 14)) * 0.7))


def build_wheat():
    rng = random.Random(707)
    out = []
    clumps = jit(rng, HEX7, 0.04)
    B = Builder(1)
    for (cx, cy) in jit(rng, [(x, y) for y in ROWS for x in (-0.3, 0.0, 0.3)], 0.04):
        for k in range(4):
            x, y = cx + rng.uniform(-0.04, 0.04), cy + rng.uniform(-0.04, 0.04)
            B.leaf((x, y, 0.0), rng.random() * TAU, math.radians(rng.uniform(65, 82)), rng.uniform(0.06, 0.09), 0.018,
                   bend=-0.6, curl=0.1, fold=0.1, nu=3, nv=1, shape='strap', col=jitter(0x7cc955, 0.08, rng),
                   col_base=0x5ea842, col_tip=0xa8e070)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    B = Builder(2)
    for (cx, cy) in jit(rng, [(x, y) for y in ROWS for x in (-0.3, 0.0, 0.3)], 0.04):
        for k in range(5):
            x, y = cx + rng.uniform(-0.045, 0.045), cy + rng.uniform(-0.045, 0.045)
            B.leaf((x, y, 0.0), rng.random() * TAU, math.radians(rng.uniform(68, 84)), rng.uniform(0.17, 0.23), 0.028,
                   bend=-1.0, curl=0.1, fold=0.12, nu=4, nv=1, shape='strap', col=jitter(0x6fc04d, 0.08, rng),
                   col_base=0x529d3c, col_tip=0x9ad868)
    out.append(B.build('s1', ground_ao=(0.03, 0.75)))
    for si, ripe in ((2, False), (3, True)):
        B = Builder(si + 10)
        for (cx, cy) in clumps:
            for k in range(4):
                x, y = cx + rng.uniform(-0.055, 0.055), cy + rng.uniform(-0.055, 0.055)
                h = rng.uniform(0.4, 0.5) if ripe else rng.uniform(0.3, 0.38)
                wheat_stalk(B, x, y, h, rng, ripe, ear_len=0.12 if ripe else 0.09)
        out.append(B.build(f's{si}', ground_ao=(0.03, 0.75)))
    return out


# pumpkin, sunflower, strawberry, chili, giant mushroom
def lobed(u):
    # pumpkin / squash leaf: wide, with 3 soft lobes
    base = math.sqrt(max(0.0, 1 - ((u - 0.45) / 0.55) ** 2))
    return base * (0.8 + 0.2 * math.cos(u * TAU * 1.5))


def big_leaf(B, base, yaw, pitch, L, W, rng, col=0x4fae43, petiole=0.0, pet_col=0x7fbf55, bend=-0.9, curl=0.35,
             nu=5, nv=2, wfn=lobed, shape=None, rib=None, col_base=None, col_tip=None):
    base = Vector(base)
    if petiole > 0:
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch)))
        p1 = base + d * petiole + Vector((0, 0, petiole * 0.25))
        B.tube([base, base.lerp(p1, 0.5) + Vector((0, 0, petiole * 0.12)), p1], [0.007, 0.006, 0.005], segs=4,
               cap0=False, cap1=False, col=pet_col, mat='farm_plant')
        base = p1
        pitch = pitch * 0.4
    B.leaf(base, yaw, pitch, L, W, bend=bend, curl=curl, fold=0.1, nu=nu, nv=nv, wfn=wfn if shape is None else None,
           shape=shape or 'oval', udist='both', col=jitter(col, 0.05, rng), col_base=col_base or mixc(col, 0xb8e07a, 0.5),
           col_tip=col_tip or mulc(col, 0.92), rib=rib or mixc(col, 0xd8f0a8, 0.5))


def tendril(B, p, rng, r=0.03, turns=2.0, col=0x8cc860):
    p = Vector(p)
    pts = []
    a0 = rng.random() * TAU
    for i in range(10):
        t = i / 9
        a = a0 + t * TAU * turns
        rr = r * (1 - t * 0.6)
        pts.append(p + Vector((math.cos(a) * rr + t * 0.04, math.sin(a) * rr, t * 0.05)))
    B.tube(pts, 0.0025, segs=3, cap0=False, cap1=False, col=col, mat='farm_plant')


def flower5(B, c, r, rng, col=0xffd23f, centre=0xf29a1e, n=5, up=(0, 0, 1), pitch=20, petal_shape='round'):
    c = Vector(c)
    yaw0 = rng.random() * TAU
    for k in range(n):
        B.leaf(c, yaw0 + TAU * k / n, math.radians(pitch), r, r * 0.8, bend=-0.2, curl=0.3, fold=0.0, nu=3, nv=1,
               shape=petal_shape, blunt=True, col=col, col_base=mixc(col, centre, 0.5), col_tip=mixc(col, 0xffffff, 0.2),
               rib=col)
    B.sphere(c + Vector((0, 0, r * 0.12)), r * 0.28, scale=(1, 1, 0.6), segs=8, rings=4, col=centre, mat='farm_plant')


def vine(B, pts, r=0.012):
    B.tube(pts, [r] * (len(pts) - 1) + [r * 0.6], segs=6, cap0=False, col=0x6aa83e, mat='farm_plant',
           vcolfn=lambda t: mixc(0x5a9a38, 0x8cc65a, t))


def build_pumpkin():
    rng = random.Random(808)
    out = []
    B = Builder(1)
    for (x, y) in [(-0.2, -0.15), (0.18, -0.12), (0.0, 0.2)]:
        sprout(B, x, y, rng, h=0.05, ll=0.07, lw=0.05, col=0x6fc34e, shape='oval')
        big_leaf(B, (x, y, 0.05), rng.random() * TAU, math.radians(55), 0.04, 0.04, rng, col=0x55b046, nu=3, nv=1)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    # s1: young vine with 4 leaves
    B = Builder(2)
    vpts = [(-0.05, 0.02, 0.01), (0.1, 0.0, 0.03), (0.25, -0.08, 0.02)]
    vine(B, vpts, 0.009)
    for i, (p, yaw) in enumerate([((-0.05, 0.02, 0.01), 2.2), ((0.0, 0.02, 0.02), 0.8), ((0.12, 0.0, 0.03), 4.2), ((0.22, -0.06, 0.02), 1.4)]):
        big_leaf(B, p, yaw, math.radians(60), 0.13, 0.15, rng, petiole=0.07)
    flower5(B, (0.27, -0.09, 0.05), 0.03, rng, pitch=40)
    out.append(B.build('s1', ground_ao=(0.03, 0.75)))
    # s2: bigger vine, green pumpkin, flowers
    B = Builder(3)
    vpts = [(-0.3, 0.2, 0.01), (-0.1, 0.1, 0.03), (0.1, 0.05, 0.03), (0.3, -0.12, 0.02)]
    vine(B, vpts, 0.012)
    for p, yaw in [((-0.3, 0.2, 0.01), 2.4), ((-0.2, 0.15, 0.02), 1.0), ((-0.05, 0.1, 0.03), 3.6), ((0.1, 0.05, 0.03), 0.4),
                   ((0.22, -0.05, 0.03), 4.6), ((0.3, -0.12, 0.02), 1.9)]:
        big_leaf(B, p, yaw, math.radians(58), 0.17, 0.2, rng, petiole=0.09)
    pumpkin_body(B, (0.05, -0.08, 0.0), 0.1, 0.14, rng, col=0xe9a03c, green=0.55, segs=18)
    flower5(B, (-0.22, -0.1, 0.06), 0.04, rng, pitch=40)
    tendril(B, (0.3, -0.12, 0.02), rng)
    out.append(B.build('s2', ground_ao=(0.03, 0.75)))
    # s3: ripe — big ribbed pumpkin
    B = Builder(4)
    vpts = [(-0.38, 0.28, 0.01), (-0.2, 0.2, 0.03), (0.05, 0.22, 0.03), (0.3, 0.12, 0.02), (0.38, -0.15, 0.02)]
    vine(B, vpts, 0.014)
    for p, yaw in [((-0.38, 0.28, 0.01), 2.3), ((-0.25, 0.22, 0.02), 1.2), ((-0.08, 0.22, 0.03), 0.4),
                   ((0.12, 0.2, 0.03), 2.0), ((0.3, 0.12, 0.02), 0.9), ((0.38, -0.12, 0.02), 4.9)]:
        big_leaf(B, p, yaw, math.radians(58), 0.19, 0.22, rng, petiole=0.1)
    pumpkin_body(B, (0.0, -0.08, 0.0), 0.22, 0.28, rng, col=0xf28a26, segs=24)
    tendril(B, (-0.2, 0.2, 0.03), rng)
    tendril(B, (0.38, -0.15, 0.02), rng)
    out.append(B.build('s3', ground_ao=(0.04, 0.7)))
    return out


def sunflower(B, x, y, h, rng, stage, face):
    lean = (rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03))
    pts = stem_curve((x, y, -0.02), (x + lean[0], y + lean[1], h), sway=0.015, n=5, lean=(0, 0))
    r0 = 0.014 + h * 0.012
    B.tube(pts, [r0, r0 * 0.95, r0 * 0.9, r0 * 0.85, r0 * 0.8, r0 * 0.75], segs=7, cap0=False, cap1=(stage < 2),
           col=0x5fa83e, mat='farm_plant', vcolfn=lambda t: mixc(0x4f9433, 0x79b84c, t))
    nleaf = {1: 4, 2: 6, 3: 6}[stage]
    for k in range(nleaf):
        t = 0.15 + 0.75 * k / max(1, nleaf - 1)
        p = _along([Vector(q) for q in pts], t * (0.85 if stage > 1 else 1.0))
        L = (0.2 if stage > 1 else 0.11) * (1.15 - 0.45 * t)
        big_leaf(B, p, rng.random() * TAU if k else 1.0, math.radians(35), L, L * 0.9, rng, petiole=L * 0.35,
                 wfn=None, shape='heart', col=0x4fa83e, bend=-0.8, curl=0.3, nu=4, nv=2)
    top = Vector(pts[-1])
    if stage == 2:
        # closed green bud nodding
        B.sphere(top + Vector((0, -0.02, 0.02)), 0.06, scale=(1, 1, 0.7), segs=10, rings=6, rot=(0.5, 0, 0),
                 col=lambda co, n: mixc(0x4f9a36, 0x8fc65a, max(0, n.z)), mat='farm_plant')
        for k in range(8):
            a = TAU * k / 8
            B.leaf(top + Vector((math.cos(a) * 0.03, math.sin(a) * 0.03 - 0.02, 0.03)), a, math.radians(50), 0.05, 0.03,
                   bend=-0.3, curl=0.3, nu=2, nv=1, shape='lance', col=0x5aa83e, col_tip=0xd8c040 if k % 2 else 0x5aa83e)
    elif stage == 3:
        sunflower_head(B, top + Vector(face).normalized() * 0.02, 0.17, rng, face=face)


def build_sunflower():
    rng = random.Random(909)
    out = []
    P2 = [(-0.2, 0.06), (0.22, -0.08)]
    B = Builder(1)
    for (x, y) in [(-0.2, 0.06), (0.22, -0.08), (0.0, 0.3)]:
        sprout(B, x, y, rng, h=0.07, ll=0.06, lw=0.045, col=0x6dc24c, shape='oval', pitch=30)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    for si, H in ((1, 0.32), (2, 0.85), (3, 1.25)):
        B = Builder(1 + si)
        for j, (x, y) in enumerate(P2):
            h = H * (1.0 if j == 0 else 0.85)
            face = (0.25 if j == 0 else -0.2, -1, 0.3)
            sunflower(B, x, y, h, rng, si, face)
        out.append(B.build(f's{si}', ground_ao=(0.04, 0.75)))
    return out


# ---------------------------------------------------------------- strawberry
def trifoliate(B, base, yaw, pitch, L, rng, col=0x4ea845):
    base = Vector(base)
    d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch)))
    p1 = base + d * L
    B.tube([base, base.lerp(p1, 0.5) + Vector((0, 0, L * 0.1)), p1], [0.004, 0.0035, 0.003], segs=3, cap0=False,
           cap1=False, col=0x8ac25a, mat='farm_plant')
    for s in (-0.9, 0.0, 0.9):
        B.leaf(p1, yaw + s, math.radians(15 if s == 0 else 5), L * 0.5 * (1.0 if s == 0 else 0.85), L * 0.42, bend=-0.5,
               curl=0.35, fold=0.18, nu=3, nv=1, shape='oval', col=jitter(col, 0.05, rng), col_base=0x7cc455,
               col_tip=mulc(col, 0.9), rib=0x8fd468, wave=0.05)


def build_strawberry():
    rng = random.Random(1010)
    out = []
    pos = jit(rng, [(-0.22, -0.2), (0.22, -0.22), (-0.2, 0.22), (0.24, 0.2)], 0.02)
    B = Builder(1)
    for (x, y) in jit(rng, HEX7, 0.03):
        sprout(B, x, y, rng, h=0.03, ll=0.035, lw=0.03, col=0x74c64e, shape='round', n=3)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    for si in (1, 2, 3):
        B = Builder(1 + si)
        for (x, y) in pos:
            straw_bush(B, x, y, rng, si)
        out.append(B.build(f's{si}', ground_ao=(0.03, 0.75)))
    return out


# ---------------------------------------------------------------- chili
def chili_pod(B, p, d, L, r, col=0xe0261e):
    p = Vector(p); d = Vector(d).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    pts = [p + d * L * t + side * math.sin(t * math.pi) * L * 0.12 for t in (0, 0.2, 0.45, 0.7, 0.88, 1.0)]
    B.tube(pts, [r * 0.8, r, r * 0.95, r * 0.75, r * 0.45, 0.0], segs=6, cap0=True, col=col, mat='farm_gloss',
           vcolfn=lambda t: mixc(mulc(col, 0.85), mixc(col, 0xff7a5a, 0.2), t))
    B.sphere(p - d * 0.004, r * 0.9, scale=(1, 1, 0.5), segs=6, rings=3, col=0x4f8a2e, mat='farm_plant')
    B.tube([p - d * 0.004, p - d * 0.02 + Vector((0, 0, 0.012))], 0.0025, segs=3, cap0=False, col=0x5a9a38, mat='farm_plant')


def build_chili():
    rng = random.Random(1111)
    out = []
    pos = [(-0.2, 0.08), (0.22, -0.1)]
    B = Builder(1)
    for (x, y) in [(-0.2, 0.08), (0.22, -0.1), (0.0, 0.3), (0.05, -0.3)]:
        sprout(B, x, y, rng, h=0.05, ll=0.045, lw=0.024, col=0x5fb84a, shape='oval', pitch=30)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    for si, H in ((1, 0.22), (2, 0.38), (3, 0.46)):
        B = Builder(1 + si)
        for j, (x, y) in enumerate(pos):
            chili_bush(B, x, y, H * (1.0 if j == 0 else 0.9), rng, si)
        out.append(B.build(f's{si}', ground_ao=(0.04, 0.75)))
    return out


# ---------------------------------------------------------------- mushrooms
def mushroom(B, x, y, h, capR, rng, cap_col=0xb8622e, cap_hi=0xdd9a5a, stem_col=0xf4e7cf, gill=0xe8cfa8, tilt=0.0,
             spots=0, spot_col=0xfff4e0, segs=16, cap_flat=0.55, mat_cap='farm_gloss', stem_r=None, glow=None):
    c = Vector((x, y, 0))
    sr = stem_r or capR * 0.36
    # stem: bulbous base, slight taper
    sprof = [(0.0, -0.02), (sr * 1.15, -0.015), (sr * 1.25, h * 0.12), (sr * 1.05, h * 0.45), (sr * 0.92, h * 0.85), (sr * 0.9, h * 0.98)]
    B.lathe(sprof, segs=max(8, segs // 2 + 2), c=(x, y, 0), col=lambda co, n: mixc(mulc(stem_col, 0.88), stem_col, min(1, (co.z) / max(h, 0.01) * 2)),
            mat='farm_soft', close_top=False, close_bot=False)
    # cap
    ch = capR * cap_flat
    cprof = [(0.0, h + ch), (capR * 0.45, h + ch * 0.93), (capR * 0.8, h + ch * 0.68), (capR * 0.98, h + ch * 0.3),
             (capR, h + ch * 0.08), (capR * 0.9, h - ch * 0.05), (capR * 0.55, h - ch * 0.02), (sr * 0.9, h), (0.0, h + 0.002)]
    cc = Vector((x, y, h))
    sp = []
    rngs = random.Random(int(x * 1000 + y * 777))
    for i in range(spots):
        a = rngs.random() * TAU
        rr = rngs.uniform(0.15, 0.8)
        sp.append((a, rr))
    def cf(co, n):
        lc = co - cc
        if lc.z < ch * 0.06 and n.z < 0.2:
            return gill
        t = lc.z / max(ch, 0.001)
        col = mixc(cap_col, cap_hi, smooth01(t * 0.9))
        return col
    fs = B.lathe(cprof, segs=segs, c=(x, y, 0), col=cf, mat=mat_cap)
    if tilt:
        B.transform(fs, Matrix.Translation(cc) @ Matrix.Rotation(tilt, 4, Vector((1, 0.3, 0)).normalized()) @ Matrix.Translation(-cc))
    # spots as small flattened spheres on the cap surface
    for (a, rr) in sp:
        r = capR * rr
        zz = h + ch * (1 - (rr) ** 2) ** 0.8
        p = Vector((x + math.cos(a) * r, y + math.sin(a) * r, zz))
        nrm = Vector((math.cos(a) * rr, math.sin(a) * rr, 1.0)).normalized()
        sr2 = capR * rngs.uniform(0.09, 0.14)
        q = Vector((0, 0, 1)).rotation_difference(nrm)
        fs2 = B.sphere(p, sr2, scale=(1, 1, 0.3), segs=8, rings=4, col=spot_col, mat='farm_gloss' if glow is None else glow)
        B.transform(fs2, Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Translation(-p))
        if tilt:
            B.transform(fs2, Matrix.Translation(cc) @ Matrix.Rotation(tilt, 4, Vector((1, 0.3, 0)).normalized()) @ Matrix.Translation(-cc))


def grass_tuft(B, x, y, rng, n=4, h=0.08, col=0x6dbb4a):
    for k in range(n):
        B.leaf((x + rng.uniform(-0.02, 0.02), y + rng.uniform(-0.02, 0.02), 0.0), rng.random() * TAU,
               math.radians(rng.uniform(60, 80)), h * rng.uniform(0.7, 1.1), 0.02, bend=-0.9, curl=0.15, fold=0.1,
               nu=3, nv=1, shape='strap', col=jitter(col, 0.08, rng), col_base=mulc(col, 0.8), col_tip=mixc(col, 0xd8f090, 0.4))


# crystal flower, moon lotus, star flower, mythic mushroom
glow_mat('farm_glow_star', 0xffe6a0, 0.55, rough=0.3, coat=0.3)


glow_mat('farm_glow_myth', 0xffc9e6, 0.4, rough=0.3, coat=0.3)


glow_mat('farm_glow_life', 0xe9ffb0, 0.35, rough=0.25, coat=0.4)


def leafy_base(B, x, y, rng, n, L, W, col=0x52a84a, pitch=(50, 25), shape='lance'):
    rosette(B, x, y, rng, n=n, L=L, W=W, pitch=pitch, bend=-0.8, col=col, col_base=mixc(col, 0xb8e07a, 0.4),
            col_tip=mulc(col, 0.9), shape=shape, nu=4, nv=1, curl=0.3, fold=0.15)


def rock(B, x, y, r, rng, col=0xb8b2a8):
    B.sphere((x, y, r * 0.2), r, scale=(1.2, 1.0, 0.65), segs=8, rings=5, rot=(0, 0, rng.random() * 3),
             col=lambda co, n: mixc(mulc(col, 0.85), mixc(col, 0xffffff, 0.15), max(0, n.z)), mat='farm_soft',
             warp=lambda co: co + Vector((noise.noise(co * 20) * r * 0.15, 0, noise.noise(co * 17 + Vector((3, 3, 3))) * r * 0.15)))


def lily_pad(B, x, y, z, r, rng, col=0x4aae7a):
    a0 = rng.random() * TAU
    # circular pad with a notch: built as leaf with very round shape, flat
    B.leaf((x - math.cos(a0) * r, y - math.sin(a0) * r, z), a0, 0.0, 2 * r, 2 * r, bend=0.0, curl=0.1, fold=-0.03,
           nu=5, nv=3, shape='ellipse', udist='both', col=jitter(col, 0.05, rng), col_base=mixc(col, 0x2f7a5a, 0.4),
           col_tip=mixc(col, 0x9fe0a0, 0.3), rib=mixc(col, 0xbfeec0, 0.4))


def lotus_flower(B, c, R, rng, open_=1.0, glow='farm_pearl'):
    c = Vector(c)
    yaw0 = rng.random() * TAU
    layers = [(8, 1.0, lerp(0.35, 1.05, open_)), (7, 0.82, lerp(0.25, 0.78, open_)), (6, 0.62, lerp(0.15, 0.45, open_))]
    for li, (n, s, tilt) in enumerate(layers):
        for k in range(n):
            a = yaw0 + TAU * k / n + li * 0.4
            pitch = math.pi / 2 - tilt
            col = mixc(0xf5f0ff, 0xd8c8ff, 0.3 + li * 0.15)
            B.leaf(c + Vector((math.cos(a), math.sin(a), 0)) * R * 0.08, a, pitch, R * s, R * s * 0.55,
                   bend=0.25 * open_, curl=0.55, fold=0.0, nu=4, nv=1, shape='petal', col=col,
                   col_base=mixc(col, 0xfff4d0, 0.5), col_tip=mixc(0xd2b8f5, 0xf3a8d8, 0.3), rib=col, mat=glow)
    if open_ > 0.5:
        B.sphere(c + Vector((0, 0, R * 0.15)), R * 0.2, scale=(1, 1, 0.55), segs=10, rings=5,
                 col=lambda co, n: mixc(0xe8d070, 0xfff0a8, max(0, n.z)), mat=glow)


# ---------------------------------------------------------------- star flower
def star_petal_w(u):
    return max(0.0, 1 - u) ** 0.9 * min(1, u * 3.5 + 0.3)


def star_flower_head(B, c, R, rng, face=(0, -0.3, 1), open_=1.0, n=5):
    c = Vector(c)
    f = Vector(face).normalized()
    q = Vector((0, 0, 1)).rotation_difference(f)
    for k in range(n):
        a = TAU * k / n
        dl = Vector((math.cos(a), math.sin(a), lerp(2.5, 0.25, open_))).normalized()
        dw = q @ dl
        B.leaf(c, math.atan2(dw.y, dw.x), math.asin(max(-1, min(1, dw.z))), R, R * 0.75, bend=-0.15 * open_, curl=0.2,
               fold=0.12, nu=3, nv=2, wfn=star_petal_w, col=0xfff3c2, col_base=0xffd65a, col_tip=0xfffbe8, rib=0xffe58a,
               mat='farm_glow_star')
    B.sphere(c + f * R * 0.05, R * 0.22, scale=(1, 1, 0.7), segs=10, rings=6, rot=q.to_euler(),
             col=lambda co, nn: mixc(0xffc844, 0xfff1a8, 0.5), mat='farm_glow_star')


def sparkle(B, p, s):
    p = Vector(p)
    # 4-point star: two crossed flat diamonds
    for ax in ((1, 0, 0), (0, 1, 0)):
        a = Vector(ax)
        vs = [B.bm.verts.new(p + Vector((0, 0, s))), B.bm.verts.new(p + a * s * 0.35),
              B.bm.verts.new(p - Vector((0, 0, s))), B.bm.verts.new(p - a * s * 0.35)]
        f = B.bm.faces.new(vs)
        B.paint([f], 0xfff6c8, 'farm_glow_star', smooth=False)
        vs2 = [B.bm.verts.new(p + a * s), B.bm.verts.new(p + Vector((0, 0, s * 0.35))), B.bm.verts.new(p - a * s),
               B.bm.verts.new(p - Vector((0, 0, s * 0.35)))]
        f2 = B.bm.faces.new(vs2)
        B.paint([f2], 0xfff6c8, 'farm_glow_star', smooth=False)


def build_mythic_mushroom():
    rng = random.Random(1616)
    out = []
    B = Builder(1)
    for (x, y, s) in [(-0.1, 0.05, 1.0), (0.12, -0.08, 0.8), (0.0, 0.2, 0.7)]:
        myth_mush(B, x, y, 0.03 * s, 0.025 * s, rng, spots=0)
    grass_tuft(B, -0.25, -0.18, rng, 3, 0.06, col=0x5fae6a)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    B = Builder(2)
    myth_mush(B, 0.0, 0.03, 0.12, 0.07, rng, spots=4)
    myth_mush(B, 0.16, -0.12, 0.06, 0.04, rng, tilt=0.15, spots=0)
    myth_mush(B, -0.14, -0.1, 0.05, 0.035, rng, tilt=-0.1, spots=0)
    grass_tuft(B, -0.26, 0.18, rng, 4, 0.08, col=0x5fae6a)
    out.append(B.build('s1', ground_ao=(0.03, 0.75)))
    B = Builder(3)
    myth_mush(B, 0.0, 0.03, 0.3, 0.16, rng, spots=6)
    myth_mush(B, 0.22, -0.16, 0.1, 0.06, rng, tilt=0.18, spots=2)
    myth_mush(B, -0.22, -0.14, 0.08, 0.05, rng, tilt=-0.15, spots=0)
    grass_tuft(B, -0.28, 0.2, rng, 4, 0.09, col=0x5fae6a)
    grass_tuft(B, 0.26, 0.22, rng, 3, 0.08, col=0x5fae6a)
    out.append(B.build('s2', ground_ao=(0.04, 0.72)))
    B = Builder(4)
    myth_mush(B, 0.0, 0.04, 0.55, 0.27, rng, spots=9)
    myth_mush(B, 0.26, -0.2, 0.18, 0.1, rng, tilt=0.2, spots=4)
    myth_mush(B, -0.27, -0.16, 0.13, 0.075, rng, tilt=-0.18, spots=2)
    for (x, y) in [(0.12, -0.3), (-0.1, -0.32), (0.32, 0.05)]:
        myth_mush(B, x, y, 0.04, 0.025, rng, spots=0)
    grass_tuft(B, -0.32, 0.22, rng, 4, 0.1, col=0x5fae6a)
    grass_tuft(B, 0.3, 0.26, rng, 4, 0.09, col=0x5fae6a)
    out.append(B.build('s3', ground_ao=(0.05, 0.7)))
    return out


# tree of life, golden apple, dragon fruit
def trunk(B, base, top, r0, r1, rng, col=0x8a5a32, segs=8, n=5, sway=0.04, roots=0, root_len=0.12):
    pts = stem_curve(base, top, sway=sway, n=n, lean=(rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02)))
    radii = [lerp(r0, r1, (i / n) ** 0.7) for i in range(n + 1)]
    radii[0] = r0 * 1.25
    B.tube(pts, radii, segs=segs, cap0=False, cap1=True, col=col, mat='farm_soft',
           vcolfn=lambda t: mixc(mulc(col, 0.8), mixc(col, 0xd8a070, 0.25), t))
    for k in range(roots):
        a = TAU * k / roots + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector(base) + Vector((0, 0, r0 * 1.6))
        p1 = Vector(base) + d * root_len * 0.5 + Vector((0, 0, r0 * 0.5))
        p2 = Vector(base) + d * root_len + Vector((0, 0, -0.02))
        B.tube([p0, p1, p2], [r0 * 0.55, r0 * 0.4, r0 * 0.15], segs=5, cap0=False, cap1=True, col=col, mat='farm_soft',
               vcolfn=lambda t: mulc(col, 0.85))
    return [Vector(p) for p in pts]


def branch(B, p0, d, L, r0, rng, col=0x8a5a32, up=0.4):
    p0 = Vector(p0); d = Vector(d).normalized()
    p1 = p0 + d * L * 0.5 + Vector((0, 0, L * up * 0.3))
    p2 = p0 + d * L + Vector((0, 0, L * up))
    B.tube([p0, p1, p2], [r0, r0 * 0.75, r0 * 0.5], segs=6, cap0=False, cap1=True, col=col, mat='farm_soft')
    return p2


def canopy_blob(B, c, r, rng, col0=0x3f9a3e, col1=0x8fd45a, sq=0.85, segs=14, rings=9, seed=0):
    c = Vector(c)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    def warp(co):
        lc = co - c
        n1 = noise.noise(lc * (3.2 / r) + off)
        n2 = noise.noise(lc * (7.5 / r) + off * 2)
        return co + lc.normalized() * r * (n1 * 0.12 + n2 * 0.05)
    def cf(co, n):
        lc = co - c
        t = (lc.z / r) * 0.5 + 0.5
        k = noise.noise(lc * (6 / r) + off)
        col = mixc(col0, col1, smooth01(t * 0.85 + k * 0.35 + max(0, n.z) * 0.2))
        return col
    fs = B.sphere(c, r, scale=(1, 1, sq), segs=segs, rings=rings, col=cf, mat='farm_plant', warp=warp)
    B.paint(fs, cf, 'farm_plant')
    return fs


def leaf_cluster(B, p, rng, n=3, L=0.06, col=0x52b046):
    for k in range(n):
        B.leaf(p, rng.random() * TAU, math.radians(rng.uniform(20, 50)), L * rng.uniform(0.85, 1.1), L * 0.5,
               bend=-0.5, curl=0.3, fold=0.1, nu=3, nv=1, shape='oval', col=jitter(col, 0.06, rng),
               col_tip=mixc(col, 0xb8e880, 0.3))


def blossom(B, p, r, rng, col=0xfff0f4, centre=0xf5c64a):
    flower5(B, p, r, rng, col=col, centre=centre, pitch=30)


def fruit_ball(B, p, r, col, mat='farm_gloss', hang=True, leaf=True, rng=None, segs=10):
    p = Vector(p)
    if hang:
        B.tube([p + Vector((0, 0, r * 1.7)), p + Vector((0.004, 0, r * 0.85))], 0.003, segs=3, cap0=False, cap1=False,
               col=0x6b4a2a, mat='farm_soft')
    prof = [(0.0, -r * 0.92), (r * 0.55, -r * 0.85), (r * 0.95, -r * 0.4), (r, 0.05 * r), (r * 0.85, r * 0.6), (r * 0.4, r * 0.88),
            (r * 0.12, r * 0.78), (0.0, r * 0.72)]
    B.lathe(prof, segs=segs, c=p, col=lambda co, n: mixc(mulc(col, 0.82), mixc(col, 0xffffff, 0.25), max(0, n.z * 0.7 + n.x * 0.3)), mat=mat)
    if leaf and rng:
        B.leaf(p + Vector((0.004, 0, r * 0.95)), rng.random() * TAU, math.radians(25), r * 1.3, r * 0.6, bend=-0.4, curl=0.3,
               nu=3, nv=1, shape='oval', col=0x4fae44)


def sapling(B, x, y, h, rng, col=0x6aa83e, nleaf=3, leaf_col=0x5cb84a, L=0.05):
    pts = stem_curve((x, y, -0.02), (x, y, h), sway=0.008, n=3)
    B.tube(pts, [0.008, 0.007, 0.006, 0.005], segs=5, cap0=False, col=0x8a6a40, mat='farm_soft',
           vcolfn=lambda t: mixc(0x7a5a34, 0x8ab05a, t))
    for k in range(nleaf):
        t = 0.55 + 0.45 * k / max(1, nleaf - 1)
        p = _along([Vector(q) for q in pts], t)
        B.leaf(p, rng.random() * TAU, math.radians(35), L * rng.uniform(0.9, 1.1), L * 0.55, bend=-0.5, curl=0.35,
               fold=0.1, nu=3, nv=1, shape='oval', col=jitter(leaf_col, 0.05, rng), col_tip=mixc(leaf_col, 0xc8f090, 0.3))


def on_canopy(blobs, rng, n, out_k=0.92, zmin=-0.5):
    pts = []
    for i in range(n):
        p, r = blobs[(i % (len(blobs) - 1)) + 1] if len(blobs) > 1 else blobs[0]
        a = rng.random() * TAU
        z = rng.uniform(zmin, 0.35)
        d = Vector((math.cos(a) * math.sqrt(1 - z * z), math.sin(a) * math.sqrt(1 - z * z), z))
        pts.append((p + d * r * out_k, d))
    return pts


# ---------------------------------------------------------------- dragon fruit (pitaya cactus on a post)
TRI = [1.0, 0.45, 1.0, 0.45, 1.0, 0.45]


def pitaya(B, p, r, rng, d=(0, 0, -1)):
    p = Vector(p)
    prof = [(0.0, -r * 1.2), (r * 0.6, -r * 1.05), (r * 0.95, -r * 0.5), (r, r * 0.1), (r * 0.8, r * 0.75), (r * 0.35, r * 1.05), (0.0, r * 1.1)]
    B.lathe(prof, segs=10, c=p, col=lambda co, n: mixc(0xd8306e, 0xff6aa2, max(0, n.z * 0.5 + 0.5) * 0.6), mat='farm_gloss')
    # bracts (scales)
    for k in range(9):
        a = TAU * k / 9 + (0.3 if k % 2 else 0)
        z = (-0.4 if k % 2 else 0.35) * r
        q = p + Vector((math.cos(a) * r * 0.9, math.sin(a) * r * 0.9, z))
        B.leaf(q, a, math.radians(55), r * 0.55, r * 0.35, bend=-0.4, curl=0.3, nu=2, nv=1, shape='lance',
               col=0xe8407a, col_base=0xe03a74, col_tip=0x9ccf4a, rib=0xf06090)


def post(B, H):
    B.rbox((0, 0, H / 2 - 0.02), (H + 0.02, 0.07, 0.07), r=0.015, rseg=2, nx=4, rot=(0, -math.pi / 2, 0),
           colfn=wood_fn(0xa26a3c, seed=4, axis='x'), end_r=0.02)


# overrides after first review
# ---- microgreens: a dense sprout carpet in each tray + individual sprouts on top
def sprout_carpet(B, ry, h, col0, col1, seed):
    def fn(u, v):
        x = -0.37 + 0.74 * u
        y = ry - 0.062 + 0.124 * v
        e = (math.sin(math.pi * u) ** 0.25) * (math.sin(math.pi * v) ** 0.35)
        z = 0.062 + h * e * (0.8 + 0.2 * noise.noise(Vector((x * 30, y * 30, seed))))
        return Vector((x, y, z))
    B.grid(fn, 12, 3, mat='farm_plant',
           colfn=lambda u, v: mixc(col0, col1, 0.5 + 0.5 * noise.noise(Vector((u * 9, v * 5, seed)))))


def build_microgreens():
    rng = random.Random(606)
    out = []
    def field(n_per_row, h, leaf, purple=0.0, carpet=0.0):
        B = Builder(int(h * 1000) + 3)
        for ry in ROWS:
            tray(B, ry, rng)
            if carpet:
                sprout_carpet(B, ry, carpet, 0x5aa83e, 0x9ade62, ry * 10)
            for i in range(n_per_row):
                x = -0.37 + 0.74 * (i + rng.uniform(0.1, 0.9)) / n_per_row
                y = ry + rng.uniform(-0.065, 0.065)
                pc = rng.random() < purple
                micro_sprout(B, x, y, h * rng.uniform(0.8, 1.15), rng, leaf=leaf, z=0.064,
                             stem_col=0xc84f86 if pc else 0xe6efc4,
                             leaf_col=0x6aa64a if pc else rng.choice([0x7ccf4f, 0x8fd85a, 0x6cc248, 0x9ade62]))
        return B
    B = Builder(9)
    for ry in ROWS:
        tray(B, ry, rng)
        for i in range(10):
            x = rng.uniform(-0.38, 0.38); y = ry + rng.uniform(-0.06, 0.06)
            B.sphere((x, y, 0.066), 0.008, scale=(1, 1, 0.6), segs=5, rings=3, col=0xe5edc0, mat='farm_plant')
    out.append(B.build('s0', ground_ao=(0.02, 0.8)))
    out.append(field(14, 0.04, 0.02, 0.15).build('s1', ground_ao=(0.02, 0.8)))
    out.append(field(14, 0.06, 0.028, 0.2, carpet=0.03).build('s2', ground_ao=(0.02, 0.8)))
    out.append(field(13, 0.085, 0.038, 0.25, carpet=0.055).build('s3', ground_ao=(0.02, 0.8)))
    return out


# ---- pumpkin: deeper ribs
def pumpkin_body(B, c, R, H, rng, col=0xf28a26, ribs=8, segs=24, green=0.0):
    c = Vector(c)
    prof = [(0.0, 0.0), (R * 0.45, H * 0.02), (R * 0.85, H * 0.15), (R, H * 0.42), (R * 0.93, H * 0.72),
            (R * 0.65, H * 0.93), (R * 0.25, H * 0.98), (0.0, H * 0.86)]
    rm = lambda a, t, r, z: 1.0 - 0.13 * (abs(math.cos(a * ribs / 2)) ** 0.5) * math.sin(math.pi * min(1, t * 1.1))
    def cf(co, n):
        lc = co - c
        a = math.atan2(lc.y, lc.x)
        g = abs(math.cos(a * ribs / 2)) ** 0.5
        base = mixc(mixc(col, 0xffb050, 0.25), mulc(col, 0.78), g)
        base = mixc(base, mixc(col, 0xffd27a, 0.4), max(0, n.z) * 0.25)
        if green > 0:
            base = mixc(base, 0x8fbf4a, green * (0.6 + 0.4 * g))
        return base
    B.lathe(prof, segs=segs, c=c, col=cf, mat='farm_gloss', rmod=rm)
    top = c + Vector((0, 0, H * 0.86))
    B.tube([top - Vector((0, 0, 0.01)), top + Vector((0.01, 0, H * 0.14)), top + Vector((0.045, 0.01, H * 0.2))],
           [R * 0.1, R * 0.08, R * 0.065], segs=6, col=0x7e8a3e, mat='farm_soft',
           vcolfn=lambda t: mixc(0x6d7a32, 0xa5a35a, t), prof=[1, 0.8, 1, 0.8, 1, 0.8])


# ---- sunflower: two rings of petals
def sunflower_head(B, c, R, rng, face=(0, -1, 0.35), petals=22, bloom=1.0):
    c = Vector(c)
    f = Vector(face).normalized()
    q = Vector((0, 0, 1)).rotation_difference(f)
    M = Matrix.Translation(c) @ q.to_matrix().to_4x4()
    Mi = M.inverted()
    disc = [(0.0, R * 0.14), (R * 0.35, R * 0.12), (R * 0.6, R * 0.06), (R * 0.66, 0.0), (R * 0.58, -R * 0.12),
            (R * 0.3, -R * 0.2), (0.0, -R * 0.22)]
    def cf(co, n):
        lc = Mi @ co
        rr = math.hypot(lc.x, lc.y) / R
        if lc.z > -R * 0.01:
            return mixc(0x3e2210, 0x9a6428, smooth01(rr * 1.5) * 0.85) if rr < 0.64 else 0x6e4a1e
        return 0x6aa640
    fs = B.lathe(disc, segs=16, c=(0, 0, 0), col=0x6e4a1e, mat='farm_soft')
    B.transform(fs, M)
    B.paint(fs, cf, 'farm_soft')
    for k in range(petals):
        a = TAU * k / petals
        layer = k % 2
        ring = 0.6 if layer == 0 else 0.55
        P = M @ Vector((math.cos(a) * R * ring, math.sin(a) * R * ring, -R * 0.03 * layer))
        dir_local = Vector((math.cos(a), math.sin(a), 0.2 - 0.25 * layer))
        dirw = (q.to_matrix() @ dir_local).normalized()
        B.leaf(P, math.atan2(dirw.y, dirw.x), math.asin(max(-1, min(1, dirw.z))), R * (0.62 if layer == 0 else 0.55), R * 0.3,
               bend=-0.2, curl=0.3, fold=0.12, nu=3, nv=1, shape='lance', col=jitter(0xffc21f if layer else 0xffd03a, 0.03, rng),
               col_base=0xf0901a, col_tip=0xffe27a, rib=0xffd648)
    for k in range(8):
        a = TAU * k / 8
        P = M @ Vector((math.cos(a) * R * 0.4, math.sin(a) * R * 0.4, -R * 0.16))
        dirw = (q.to_matrix() @ Vector((math.cos(a), math.sin(a), -0.6))).normalized()
        B.leaf(P, math.atan2(dirw.y, dirw.x), math.asin(dirw.z), R * 0.3, R * 0.2, bend=0.3, curl=0.2, nu=2, nv=1,
               shape='lance', col=0x5aa83e)


# ---- strawberry: lighter
def straw_bush(B, x, y, rng, stage):
    nl = {1: 3, 2: 4, 3: 4}[stage]
    L = {1: 0.08, 2: 0.12, 3: 0.14}[stage]
    yaw0 = rng.random() * TAU
    for k in range(nl):
        trifoliate(B, (x, y, 0.0), yaw0 + k * TAU / nl + rng.uniform(-0.2, 0.2), math.radians(rng.uniform(50, 68)),
                   L * rng.uniform(0.9, 1.1), rng)
    if stage == 2:
        a = yaw0 + 0.7
        p = Vector((x + math.cos(a) * 0.07, y + math.sin(a) * 0.07, 0.07))
        B.tube([(x, y, 0.0), p], 0.003, segs=3, cap0=False, cap1=False, col=0x8ac25a, mat='farm_plant')
        flower5(B, p, 0.024, rng, col=0xfff9ee, centre=0xf6c33a, pitch=25)
        berry(B, (x + 0.06, y - 0.05, 0.035), 0.02, rng, ripe=0.15)
    if stage == 3:
        for k in range(3):
            a = yaw0 + 0.4 + k * TAU / 3
            p = Vector((x + math.cos(a) * 0.1, y + math.sin(a) * 0.1, 0.04))
            B.tube([(x, y, 0.02), (x + math.cos(a) * 0.06, y + math.sin(a) * 0.06, 0.08), p + Vector((0, 0, 0.03))], 0.003,
                   segs=3, cap0=False, cap1=False, col=0x8ac25a, mat='farm_plant')
            berry(B, p, rng.uniform(0.028, 0.032), rng)


def berry(B, c, r, rng, ripe=1.0):
    c = Vector(c)
    prof = [(0.0, -r * 1.25), (r * 0.5, -r * 1.0), (r * 0.9, -r * 0.4), (r, 0.1 * r), (r * 0.7, r * 0.5), (0.0, r * 0.55)]
    red = mixc(0xf2f0c0, 0xe8263a, ripe)
    def cf(co, n):
        lc = co - c
        seed = (int((math.atan2(lc.y, lc.x) + 4) * 3.2) + int(lc.z / r * 3 + 9)) % 2
        base = mixc(red, mixc(red, 0xffa0a0, 0.4), max(0, n.z) * 0.3)
        return mixc(base, 0xf5d870, 0.35 if seed and ripe > 0.5 else 0.0)
    B.lathe(prof, segs=8, c=c, col=cf, mat='farm_gloss')
    for k in range(4):
        a = TAU * k / 4 + rng.random()
        B.leaf(c + Vector((0, 0, r * 0.5)), a, math.radians(10), r * 0.75, r * 0.4, bend=-0.3, curl=0.2, nu=2, nv=1,
               shape='lance', col=0x58b040)


# ---- chili: fewer leaves
def chili_bush(B, x, y, H, rng, stage):
    trunk_ = stem_curve((x, y, -0.02), (x, y, H * 0.45), sway=0.01, n=3)
    B.tube(trunk_, [0.011, 0.01, 0.009, 0.008], segs=5, cap0=False, col=0x5f9a3a, mat='farm_plant')
    top = Vector(trunk_[-1])
    nb = 4 if stage >= 2 else 3
    tips = []
    for k in range(nb):
        a = TAU * k / nb + rng.uniform(-0.3, 0.3)
        e = top + Vector((math.cos(a) * H * 0.35, math.sin(a) * H * 0.35, H * rng.uniform(0.35, 0.5)))
        m = top.lerp(e, 0.5) + Vector((0, 0, H * 0.06))
        B.tube([top, m, e], [0.007, 0.006, 0.004], segs=4, cap0=False, col=0x67a640, mat='farm_plant')
        tips.append((top, m, e, a))
    for (t0, m, e, a) in tips:
        for j, p in enumerate((m, e)):
            for s in (-1, 1):
                B.leaf(p, a + s * 1.2 + rng.uniform(-0.3, 0.3), math.radians(rng.uniform(10, 35)),
                       H * rng.uniform(0.2, 0.26), H * 0.12, bend=-0.6, curl=0.3, fold=0.1, nu=3, nv=1, shape='oval',
                       col=jitter(0x3f9a3c, 0.06, rng), col_base=0x6cb84a, col_tip=0x3a8a36, rib=0x7cc860)
        B.leaf(e, a, math.radians(60), H * 0.18, H * 0.1, bend=-0.6, curl=0.3, nu=3, nv=1, shape='oval', col=0x4aa442)
    if stage == 1:
        return
    pods = []
    for (t0, m, e, a) in tips:
        pods.append((m, a))
        if stage == 3:
            pods.append((e, a + 0.8))
    for i, (p, a) in enumerate(pods):
        d = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, -1))
        if stage == 2:
            if i % 2 == 0:
                flower5(B, p + Vector((0, 0, -0.01)), 0.018, rng, col=0xfffaf0, centre=0xe6d86a, pitch=-10)
            else:
                chili_pod(B, p, d, 0.06, 0.01, col=0x6cb440)
        else:
            col = 0xe0261e if i % 4 else 0xf26a1b
            chili_pod(B, p, d, rng.uniform(0.1, 0.12), 0.014, col=col)


# ---- giant mushroom colours
def build_giant_mushroom():
    rng = random.Random(1212)
    out = []
    kw = dict(cap_col=0x8f4a24, cap_hi=0xc8783a, stem_col=0xf3e2c4, gill=0xe8cfa0)
    B = Builder(1)
    for (x, y, s) in [(-0.12, 0.05, 1.0), (0.1, -0.08, 0.8), (0.02, 0.18, 0.7), (0.22, 0.14, 0.6)]:
        mushroom(B, x, y, 0.03 * s, 0.026 * s, rng, segs=10, **kw)
    grass_tuft(B, -0.25, -0.2, rng, 3, 0.06)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    B = Builder(2)
    for (x, y, s) in [(-0.08, 0.02, 1.0), (0.14, -0.1, 0.75), (0.05, 0.2, 0.6)]:
        mushroom(B, x, y, 0.1 * s, 0.08 * s, rng, segs=12, tilt=rng.uniform(-0.1, 0.1), **kw)
    grass_tuft(B, -0.25, -0.2, rng, 4, 0.08)
    grass_tuft(B, 0.28, 0.2, rng, 3, 0.07)
    out.append(B.build('s1', ground_ao=(0.03, 0.75)))
    B = Builder(3)
    mushroom(B, 0.0, 0.02, 0.24, 0.19, rng, segs=16, **kw)
    mushroom(B, 0.22, -0.15, 0.09, 0.07, rng, segs=12, tilt=0.15, **kw)
    mushroom(B, -0.2, -0.12, 0.07, 0.055, rng, segs=10, tilt=-0.12, **kw)
    grass_tuft(B, -0.28, 0.2, rng, 4, 0.09)
    grass_tuft(B, 0.25, 0.22, rng, 3, 0.08)
    out.append(B.build('s2', ground_ao=(0.04, 0.72)))
    B = Builder(4)
    mushroom(B, 0.0, 0.03, 0.42, 0.34, rng, segs=20, cap_flat=0.5, **kw)
    mushroom(B, 0.28, -0.22, 0.13, 0.1, rng, segs=14, tilt=0.18, **kw)
    mushroom(B, -0.26, -0.2, 0.1, 0.08, rng, segs=12, tilt=-0.15, **kw)
    grass_tuft(B, -0.32, 0.22, rng, 4, 0.1)
    grass_tuft(B, 0.3, 0.25, rng, 4, 0.09)
    grass_tuft(B, 0.1, -0.34, rng, 3, 0.08)
    out.append(B.build('s3', ground_ao=(0.05, 0.7)))
    return out


# ---- crystal flower
# design-v11 §16.1 crystal: candy drops on leaves -> lollipop bud -> half open -> sugar-glass petals, pink-amber
CANDY_P, CANDY_A = 0xff5f8f, 0xffa22e


def candy_drop(B, p, r, rng):
    c = mixc(CANDY_P, CANDY_A, rng.random())
    B.sphere(p, r, scale=(1, 1, 0.85), segs=8, rings=5, mat='farm_gloss',
             col=lambda co, n, c=c: mixc(c, 0xfff4e8, max(0.0, n.z) * 0.5))


def candy_bud(B, top, r):
    """Lollipop-like teardrop bud with a pink->amber swirl."""
    top = Vector(top)
    prof = [(0.0, 0.0), (r * 0.55, r * 0.15), (r * 0.95, r * 0.7), (r, r * 1.1), (r * 0.8, r * 1.55), (r * 0.4, r * 1.9),
            (0.0, r * 2.05)]
    def cf(co, n):
        lc = co - top
        a = math.atan2(lc.y, lc.x)
        s = 0.5 + 0.5 * math.sin(a * 3 + lc.z / r * 3.2)
        return mixc(mixc(CANDY_P, CANDY_A, s), 0xfff4e8, max(0.0, n.z) * 0.35)
    B.lathe(prof, segs=10, c=top, col=cf, mat='farm_gloss')


def glass_flower(B, top, R, rng, open_=1.0, n=6):
    """Sugar-glass blossom: pink petal bases, amber tips, a small amber crystal pistil."""
    top = Vector(top)
    yaw0 = rng.random() * TAU
    pitch = lerp(72, 16, open_)
    L = R * lerp(0.8, 1.0, open_)
    for k in range(n):
        B.leaf(top, yaw0 + TAU * k / n, math.radians(pitch + rng.uniform(-5, 5)), L, L * 0.62,
               bend=lerp(0.35, -0.3, open_), curl=0.45, fold=0.18, nu=4, nv=1, shape='petal',
               col=mixc(CANDY_P, CANDY_A, 0.5), col_base=CANDY_P, col_tip=0xffc24a, mat='farm_gloss')
    if open_ > 0.7:
        m = n - 1
        for k in range(m):
            B.leaf(top + Vector((0, 0, 0.004)), yaw0 + TAU * (k + 0.5) / m, math.radians(52), L * 0.6, L * 0.42,
                   bend=-0.1, curl=0.5, fold=0.2, nu=3, nv=1, shape='petal', col=0xffb070, col_base=0xff7aa0,
                   col_tip=0xffd890, mat='farm_gloss')
        for k in range(3):
            a = yaw0 + TAU * k / 3
            d = Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, 1))
            B.crystal(top, d, R * 0.42, R * 0.085, sides=5, tip=0.4, col0=0xffa860, col1=0xfff0c8, mat='farm_pearl',
                      rot=rng.random())
    else:
        candy_bud(B, top - Vector((0, 0, R * 0.05)), R * 0.32 * (1 - open_ * 0.4))


CRYSTAL_POS = [(-0.2, 0.16), (0.22, 0.08), (-0.02, -0.22)]


def build_crystal_flower():
    rng = random.Random(1313)
    out = []
    B = Builder(1)
    for (x, y) in CRYSTAL_POS:
        sprout(B, x, y, rng, h=0.055, ll=0.05, lw=0.034, col=0x63b852, shape='oval')
        candy_drop(B, (x + 0.02, y + 0.004, 0.066), 0.011, rng)
        candy_drop(B, (x - 0.018, y - 0.01, 0.062), 0.008, rng)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    for si, (H, lc, R, op) in enumerate([(0.16, 0.1, 0.08, 0.0), (0.24, 0.12, 0.11, 0.45), (0.3, 0.13, 0.15, 1.0)]):
        B = Builder(2 + si)
        for j, (x, y) in enumerate(CRYSTAL_POS):
            h = H * (1.0, 0.86, 0.93)[j]
            pts = stem_curve((x, y, -0.02), (x + 0.012, y - 0.006, h), sway=0.014, n=3)
            B.tube(pts, [0.011, 0.01, 0.009, 0.008], segs=5, cap0=False, cap1=False, col=0x5ea84a, mat='farm_plant',
                   vcolfn=lambda t: mixc(0x4f9a3e, 0x8cc060, t))
            leafy_base(B, x, y, rng, 4, (lc * 0.75, lc), lc * 0.36)
            p = _along([Vector(q) for q in pts], 0.5)
            B.leaf(p, rng.random() * TAU, math.radians(35), lc * 0.6, lc * 0.26, bend=-0.6, curl=0.3, nu=3, nv=1,
                   shape='lance', col=0x5aac4c, col_tip=0x8cc060)
            if si == 0:
                candy_bud(B, pts[-1], R * 0.32)
            else:
                glass_flower(B, pts[-1], R, rng, open_=op, n=6 if si == 2 else 5)
            if si < 2:
                candy_drop(B, p + Vector((0.03, 0.0, 0.01)), 0.01, rng)
        rock(B, -0.32, -0.26, 0.04, rng)
        out.append(B.build(f's{si+1}', ground_ao=(0.04, 0.75)))
    return out


# ---- moon lotus: lighter tub, bigger flowers
def tub(B, R=0.34, H=0.2, rng=None):
    prof = [(R * 0.86, 0.0), (R * 0.93, H * 0.25), (R, H * 0.55), (R * 0.97, H * 0.85), (R * 0.95, H), (R * 0.88, H),
            (R * 0.86, H * 0.9)]
    staves = 16
    def cf(co, n):
        a = math.atan2(co.y, co.x)
        s = (a / TAU * staves) % 1.0
        edge = min(s, 1 - s)
        base = mixc(0xb8743e, 0xd49558, 0.5 + noise.noise(Vector((a * 3, co.z * 6, 0))) * 0.5)
        if edge < 0.09:
            base = mulc(base, 0.78)
        if co.z > H * 0.93:
            base = mixc(base, 0xe6b07a, 0.4)
        return base
    B.lathe(prof, segs=20, c=(0, 0, 0), col=cf, mat='farm_soft', close_top=False, close_bot=True)
    for z, rr in ((H * 0.22, R * 0.925), (H * 0.8, R * 0.985)):
        B.torus((0, 0, z), rr, 0.011, segs=18, rsegs=3, col=0x6e6a66, mat='farm_metal', scale=(1, 1, 1.4))
    w = B.sphere((0, 0, H * 0.82), 1.0, scale=(R * 0.87, R * 0.87, 0.006), segs=16, rings=2,
             col=lambda co, n: mixc(0x4f8fa8, 0x7cc0d0, (co.x + R) / (2 * R) * 0.5 + 0.25), mat='farm_water')
    B.protect(w)  # the water disk must stay round when fitting the triangle budget


def build_moon_lotus():
    rng = random.Random(1414)
    out = []
    H = 0.2
    WZ = H * 0.82 + 0.008
    for si in range(4):
        B = Builder(1 + si)
        tub(B, H=H, rng=rng)
        pads = [(0.13, 0.09, 0.075), (-0.14, -0.06, 0.07), (0.03, -0.17, 0.065), (-0.09, 0.16, 0.06), (0.19, -0.1, 0.05)]
        npads = [1, 3, 4, 5][si]
        for (x, y, r) in pads[:npads]:
            lily_pad(B, x, y, WZ, r * (0.6 if si == 0 else 1.0), rng)
        if si == 0:
            B.tube([(0.0, 0.0, WZ - 0.02), (0.0, 0.0, WZ + 0.04)], 0.005, segs=4, cap0=False, col=0x5aa870, mat='farm_plant')
            B.sphere((0, 0, WZ + 0.05), 0.016, scale=(1, 1, 1.4), segs=8, rings=5, col=0xa8d0c0, mat='farm_plant')
        else:
            hz = [0, 0.1, 0.14, 0.13][si]
            top = Vector((-0.02, 0.0, WZ + hz))
            B.tube([(-0.02, 0.0, WZ - 0.02), (-0.025, 0.0, WZ + hz * 0.5), top], [0.007, 0.0065, 0.006], segs=5,
                   cap0=False, cap1=False, col=0x5aa870, mat='farm_plant')
            lotus_flower(B, top, [0, 0.07, 0.12, 0.2][si], rng, open_=[0, 0.0, 0.35, 1.0][si])
            if si == 3:
                t2 = Vector((0.15, 0.1, WZ + 0.08))
                B.tube([(0.15, 0.1, WZ - 0.02), t2], 0.005, segs=4, cap0=False, cap1=False, col=0x5aa870, mat='farm_plant')
                lotus_flower(B, t2, 0.08, rng, open_=0.05)
        out.append(B.build(f's{si}', ground_ao=(0.05, 0.7)))
    return out


# ---- star flower: fuller
def build_star_flower():
    rng = random.Random(1515)
    out = []
    B = Builder(1)
    for (x, y) in [(-0.12, 0.08), (0.14, -0.06), (0.02, 0.24)]:
        sprout(B, x, y, rng, h=0.05, ll=0.045, lw=0.034, col=0x5aae7a, shape='oval')
        B.sphere((x, y, 0.066), 0.012, segs=8, rings=5, col=0xfff0b0, mat='farm_glow_star')
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    plants = [(0.0, 0.04, 1.0, (0.1, -0.7, 1)), (-0.25, -0.15, 0.62, (-0.35, -0.7, 1)), (0.26, -0.16, 0.7, (0.4, -0.7, 1))]
    for si, H in ((1, 0.22), (2, 0.38), (3, 0.5)):
        B = Builder(1 + si)
        for idx, (x, y, s, face) in enumerate(plants[:1 if si == 1 else 3]):
            st = si if idx == 0 else max(1, si - 1)
            star_plant(B, x, y, H * s, rng, st, face)
        if si == 3:
            for k in range(7):
                a = TAU * k / 7 + 0.3
                sparkle(B, (math.cos(a) * 0.24, math.sin(a) * 0.2, 0.28 + 0.1 * (k % 3)), 0.026 + 0.01 * (k % 2))
        out.append(B.build(f's{si}', ground_ao=(0.03, 0.75)))
    return out


def star_plant(B, x, y, H, rng, stage, face):
    pts = stem_curve((x, y, -0.02), (x + face[0] * 0.04, y + face[1] * 0.04, H), sway=0.015, n=4)
    B.tube(pts, [0.009, 0.0085, 0.008, 0.007, 0.0065], segs=5, cap0=False, cap1=(stage < 2), col=0x4f9a6a,
           mat='farm_plant', vcolfn=lambda t: mixc(0x3f8a5e, 0x8fc8a8, t))
    leafy_base(B, x, y, rng, 5, (0.09 + 0.04 * stage, 0.13 + 0.05 * stage), 0.055 + 0.012 * stage, col=0x4aa070, shape='oval')
    for k in range(stage + 1):
        p = _along([Vector(q) for q in pts], 0.3 + 0.17 * k)
        B.leaf(p, rng.random() * TAU, math.radians(30), 0.08 + 0.025 * stage, 0.04, bend=-0.6, curl=0.3, nu=3, nv=1,
               shape='lance', col=0x52a878, col_tip=0x9fd8b8)
    top = Vector(pts[-1])
    if stage == 2:
        star_flower_head(B, top, 0.06, rng, face=face, open_=0.0)
    elif stage == 3:
        star_flower_head(B, top, 0.13, rng, face=face, open_=1.0)


# ---- mythic: lighter
def myth_mush(B, x, y, h, R, rng, tilt=0.0, spots=7):
    mushroom(B, x, y, h, R, rng, cap_col=0x9a4fb8, cap_hi=0xe58fc8, stem_col=0xf3e8f5, gill=0xffd8e8, tilt=tilt,
             spots=spots, spot_col=0xfff2fb, segs=16 if R > 0.1 else (12 if R > 0.05 else 8), cap_flat=0.62,
             glow='farm_glow_myth')
    if R > 0.08:
        B.lathe([(R * 0.3, h * 0.78), (R * 0.42, h * 0.7), (R * 0.4, h * 0.66)], segs=12, c=(x, y, 0), col=0xf6e6f6,
                mat='farm_soft', close_top=False, close_bot=False)


# ---- trees: distinct looks, visible fruit, fewer tris
def crown_points(blobs, rng, n, zr=(-0.55, 0.35), out=1.0, gap=0.12):
    """Points just outside the crown surface (fruit and blossoms sit here, visible from above-behind)."""
    pts = []
    tries = 0
    while len(pts) < n and tries < 600:
        tries += 1
        p, r = blobs[rng.randrange(len(blobs))]
        a = rng.random() * TAU
        z = rng.uniform(*zr)
        d = Vector((math.cos(a) * math.sqrt(1 - z * z), math.sin(a) * math.sqrt(1 - z * z), z))
        q = p + d * r * out
        if all((q - p2).length > r2 * 0.9 for (p2, r2) in blobs if p2 is not p):
            if all((q - o[0]).length > gap for o in pts):
                pts.append((q, d))
    return pts


def pear(B, p, r, col0, col1, mat='farm_gloss'):
    """Pear-shaped fruit hanging from a short stalk (p = fruit centre)."""
    p = Vector(p)
    prof = [(0.0, -r), (r * 0.62, -r * 0.9), (r * 0.98, -r * 0.5), (r * 0.95, -r * 0.05), (r * 0.66, r * 0.42),
            (r * 0.48, r * 0.85), (r * 0.26, r * 1.15), (0.0, r * 1.2)]
    B.lathe(prof, segs=9, c=p, col=lambda co, n: mixc(col0, col1, smooth01(0.5 + n.z * 0.5 + (co.z - p.z) / r * 0.15)),
            mat=mat)
    B.tube([p + Vector((0, 0, r * 1.12)), p + Vector((0.006, 0, r * 1.7))], 0.004, segs=3, cap0=False, cap1=True,
           col=0x6b4a2a, mat='farm_soft')


def round_crown(B, rng, cc, r, col0, col1, seed, segs=13, rings=9):
    """One round main crown + two smaller lumps; returns the blob list."""
    blobs = [(cc, r)]
    for k in range(2):
        a = TAU * k / 2 + rng.uniform(0.3, 0.9)
        blobs.append((cc + Vector((math.cos(a) * r * 0.62, math.sin(a) * r * 0.62, -r * 0.18)), r * 0.58))
    for i, (p, rr) in enumerate(blobs):
        canopy_blob(B, p, rr, rng, col0=col0, col1=col1, seed=seed + i, segs=segs if i == 0 else 10,
                    rings=rings if i == 0 else 7)
    return blobs


def tree_body(B, rng, H, trunk_r, bark, roots=0, branch_n=3, crown_r=0.3):
    tp = trunk(B, (0, 0, -0.02), (0.02, 0.0, H), trunk_r, trunk_r * 0.55, rng, col=bark, roots=roots,
               root_len=trunk_r * 6, segs=7, n=4)
    for k in range(branch_n):
        a = TAU * k / branch_n + rng.uniform(-0.3, 0.3)
        branch(B, _along(tp, 0.72), Vector((math.cos(a), math.sin(a), 0.9)), crown_r * 0.7, trunk_r * 0.5, rng, col=bark)
    return tp


def build_tree_of_life():
    """life-tree: sapling -> knee-high -> in bloom -> round crown with golden-green pear-fruit."""
    rng = random.Random(1717)
    out = []
    bark = 0x9a6a44
    c0, c1 = 0x34a868, 0xc2f07a
    B = Builder(1)
    sapling(B, 0.0, 0.0, 0.1, rng, nleaf=3, L=0.055, leaf_col=0x62c04e)
    B.sphere((0.0, 0.0, 0.112), 0.014, segs=8, rings=5, col=0xeaffb0, mat='farm_glow_life')
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    B = Builder(2)
    tp = trunk(B, (0, 0, -0.02), (0.0, 0.0, 0.26), 0.02, 0.011, rng, col=bark, roots=3, root_len=0.08, segs=6, n=4)
    blobs = round_crown(B, rng, tp[-1] + Vector((0, 0, 0.08)), 0.13, c0, c1, seed=3, segs=11, rings=7)
    for (q, d) in crown_points(blobs, rng, 2, zr=(-0.3, 0.3), gap=0.05):
        pear(B, q + d * 0.012, 0.02, 0x9ccc3c, 0xf0c838)
    out.append(B.build('s1', ground_ao=(0.04, 0.72)))
    B = Builder(3)
    tree_body(B, rng, 0.52, 0.036, bark, roots=4, crown_r=0.26)
    blobs = round_crown(B, rng, Vector((0.02, 0, 0.52 + 0.17)), 0.26, c0, c1, seed=10)
    for (q, d) in crown_points(blobs, rng, 10, zr=(-0.35, 0.75), gap=0.11):
        blossom(B, q + d * 0.008, 0.05, rng, col=0xfff4f6, centre=0xf4d35a)
    out.append(B.build('s2', ground_ao=(0.05, 0.7)))
    B = Builder(4)
    tree_body(B, rng, 0.78, 0.05, bark, roots=5, crown_r=0.36)
    blobs = round_crown(B, rng, Vector((0.02, 0, 0.78 + 0.24)), 0.36, 0x30a464, 0xc6f27e, seed=20, segs=14, rings=9)
    for (q, d) in crown_points(blobs, rng, 7, zr=(-0.6, 0.3), gap=0.14):
        pear(B, q + d * 0.03 + Vector((0, 0, -0.03)), 0.062, 0x94c83a, 0xf4c030)
    out.append(B.build('s3', ground_ao=(0.05, 0.7)))
    return out


def golden_apple(B, p, r, rng):
    """The one big gilded apple: lathe body with a dimple, stalk and a leaf."""
    p = Vector(p)
    prof = [(0.0, -r * 0.82), (r * 0.5, -r * 0.9), (r * 0.9, -r * 0.55), (r * 1.02, -r * 0.05), (r * 0.92, r * 0.5),
            (r * 0.6, r * 0.86), (r * 0.25, r * 0.82), (r * 0.08, r * 0.62), (0.0, r * 0.6)]
    B.lathe(prof, segs=14, c=p, col=lambda co, n: mixc(0xe08a10, 0xffd640, smooth01(0.45 + n.z * 0.45 + n.x * 0.2)),
            mat='farm_gold')
    B.tube([p + Vector((0, 0, r * 0.6)), p + Vector((0.01, 0, r * 1.15)), p + Vector((0.02, 0, r * 1.5))], 0.006, segs=4,
           cap0=False, cap1=True, col=0x6b4a2a, mat='farm_soft')
    B.leaf(p + Vector((0.012, 0, r * 1.0)), 0.4, math.radians(28), r * 1.1, r * 0.5, bend=-0.4, curl=0.35, nu=3, nv=1,
           shape='oval', col=0x5aa83e, col_tip=0x9ad060)


def build_golden_apple():
    """golden-apple: twig -> young tree -> apple tree in bloom -> one large gilded apple + golden leaves."""
    rng = random.Random(1818)
    out = []
    bark = 0x7a5232
    c0, c1 = 0x226a30, 0x62b044
    B = Builder(1)
    sapling(B, 0.0, 0.0, 0.12, rng, nleaf=2, L=0.055, leaf_col=0x4fae46)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    B = Builder(2)
    tp = trunk(B, (0, 0, -0.02), (0.0, 0.0, 0.32), 0.017, 0.01, rng, col=bark, segs=6, n=4)
    round_crown(B, rng, tp[-1] + Vector((0, 0, 0.06)), 0.13, c0, c1, seed=5, segs=11, rings=7)
    out.append(B.build('s1', ground_ao=(0.04, 0.72)))
    B = Builder(3)
    tree_body(B, rng, 0.56, 0.036, bark, crown_r=0.28)
    blobs = round_crown(B, rng, Vector((0.02, 0, 0.56 + 0.18)), 0.28, c0, c1, seed=30)
    for (q, d) in crown_points(blobs, rng, 11, zr=(-0.35, 0.8), gap=0.11):
        blossom(B, q + d * 0.008, 0.05, rng, col=0xffdce8, centre=0xf5c64a)
    out.append(B.build('s2', ground_ao=(0.05, 0.7)))
    B = Builder(4)
    tree_body(B, rng, 0.8, 0.052, bark, crown_r=0.38)
    cc = Vector((0.02, 0, 0.8 + 0.25))
    blobs = round_crown(B, rng, cc, 0.38, 0x226c30, 0x66b446, seed=40, segs=14, rings=9)
    # the one big golden apple hangs under the front rim of the crown (front = -Y)
    a = -math.pi / 2 - 0.35
    q = cc + Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, -0.36))
    golden_apple(B, q, 0.12, rng)
    # a few gilded leaves glint in the crown (secondary drop: golden leaf)
    for (p, d) in crown_points(blobs, rng, 4, zr=(-0.1, 0.7), gap=0.2):
        B.leaf(p + d * 0.01, math.atan2(d.y, d.x), math.radians(20), 0.09, 0.045, bend=-0.3, curl=0.3, nu=3, nv=1,
               shape='oval', col=0xf2c440, col_tip=0xffe690, mat='farm_gold')
    out.append(B.build('s3', ground_ao=(0.05, 0.7)))
    return out


# ---- dragon fruit: chunkier segmented winged stems
WING = [1.0, 0.36, 1.0, 0.36, 1.0, 0.36]


def cactus_arm(B, pts, r, col=0x6aae4a):
    pts = [Vector(p) for p in pts]
    # resample with joint constrictions
    dense = []
    for i in range(len(pts) - 1):
        for t in (0.0, 0.5):
            dense.append(pts[i].lerp(pts[i + 1], t))
    dense.append(pts[-1])
    radii = []
    for i in range(len(dense)):
        rr = r * (0.78 if i % 2 == 0 and 0 < i < len(dense) - 1 else 1.0)
        radii.append(rr)
    radii[-1] = r * 0.6
    B.tube(dense, radii, segs=6, cap0=False, cap1=True, col=col, mat='farm_gloss', prof=WING,
           vcolfn=lambda t: mixc(0x4c9a3c, 0x86c656, 0.35 + 0.35 * math.sin(t * 7) ** 2))


def build_dragon_fruit():
    rng = random.Random(1919)
    out = []
    B = Builder(1)
    for (x, y) in [(-0.06, -0.04), (0.07, 0.03)]:
        cactus_arm(B, [(x, y, -0.02), (x, y, 0.06), (x + 0.012, y, 0.11)], 0.022)
    out.append(B.build('s0', ground_ao=(0.03, 0.75)))
    B = Builder(2)
    post(B, 0.8)
    cactus_arm(B, [(0.055, -0.045, -0.02), (0.055, -0.05, 0.18), (0.045, -0.05, 0.36), (0.035, -0.045, 0.48)], 0.032)
    cactus_arm(B, [(-0.055, 0.045, -0.02), (-0.055, 0.055, 0.14), (-0.05, 0.055, 0.26)], 0.028)
    out.append(B.build('s1', ground_ao=(0.04, 0.72)))
    for si in (2, 3):
        B = Builder(1 + si)
        H = 0.9
        post(B, H)
        for rz in (0.0, math.pi / 2):
            B.rbox((0, 0, H - 0.06), (0.36, 0.05, 0.04), r=0.012, rseg=1, nx=3, rot=(0, 0, rz),
                   colfn=wood_fn(0xa26a3c, seed=rz + 2), end_r=0.012)
        cactus_arm(B, [(0.055, -0.05, -0.02), (0.055, -0.055, 0.3), (0.045, -0.055, 0.6), (0.03, -0.035, H + 0.02)], 0.034)
        ends = []
        n_arm = 5
        for k in range(n_arm):
            a = TAU * k / n_arm + 0.3
            d = Vector((math.cos(a), math.sin(a), 0))
            p0 = Vector((0.0, 0.0, H + 0.0))
            p1 = p0 + d * 0.14 + Vector((0, 0, 0.09))
            p2 = p0 + d * 0.27 + Vector((0, 0, 0.05))
            p3 = p0 + d * 0.34 + Vector((0, 0, -0.1))
            p4 = p0 + d * 0.36 + Vector((0, 0, -0.26 + 0.06 * (k % 2)))
            cactus_arm(B, [p0, p1, p2, p3, p4], 0.034)
            ends.append((p1, p2, p3, d))
        for i, (p1, p2, p3, d) in enumerate(ends):
            if si == 2:
                if i % 2 == 0:
                    c = p2 + Vector((0, 0, 0.07))
                    B.tube([p2 + Vector((0, 0, 0.02)), c], 0.012, segs=5, cap0=False, cap1=False, col=0x8fc65a, mat='farm_plant')
                    flower5(B, c, 0.075, rng, col=0xfffbef, centre=0xf2e08a, n=8, pitch=55, petal_shape='petal')
            else:
                if i != 3:
                    pitaya(B, p2 + d * 0.03 + Vector((0, 0, 0.075)), 0.062, rng)
        out.append(B.build(f's{si}', ground_ao=(0.05, 0.7)))
    return out
