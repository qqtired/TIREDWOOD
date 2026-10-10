# shaman — элита Грибной шаман (~1,9 м): борода-грибница, мантия, посох с сиреневым кристаллом.
# Части: body, head, cap, arm_l, arm_r, staff, crystal.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'shaman'
clean_scene()


def hem(p):
    if p.z < 0.06:
        a = math.atan2(p.y, p.x)
        p.z = 0.012 + 0.075 * (0.5 + 0.5 * math.sin(a * 9 + 0.7)) ** 2
    return p


# ---- мантия
body = Part('body', (0, 0.0, 0.9))
body.tube('robe', [(0, 0.03, 0.02), (0, 0.02, 0.40), (0, 0.0, 0.85), (0, 0.0, 1.15), (0, 0.0, 1.31), (0, -0.01, 1.42)],
          [(0.44, 0.40), (0.36, 0.32), (0.27, 0.23), (0.26, 0.21), (0.30, 0.21), (0.13, 0.11)], seg=18, n=9,
          up=(0, -1, 0), caps=('flat', 'round'), cap_k=0.6, fn=hem)
body.ellipsoid('wood', (0.22, -0.15, 0.80), (0.08, 0.06, 0.09), seg=8, rings=5)
body.splat((0.15, -0.22, 1.20), 0.12, 0.014, seg=10, rings=2, seed=0.9)
body.splat((-0.25, -0.25, 0.55), 0.13, 0.014, seg=10, rings=2, seed=1.7)
body.drip((0.18, -0.25, 1.12), 0.20, 0.03, seg=6)
body.drip((-0.27, -0.25, 0.50), 0.16, 0.028, seg=6)
# маленькие грибы на подоле
for (x, y, z, s) in [(0.36, -0.12, 0.20, 1.0), (0.30, 0.18, 0.32, 0.8), (-0.38, 0.05, 0.16, 0.9)]:
    nx, ny = x / math.hypot(x, y), y / math.hypot(x, y)
    base = Vector((x, y, z))
    tip = base + Vector((nx * 0.05 * s, ny * 0.05 * s, 0.07 * s))
    body.tube('cream', [base, tip], [0.022 * s, 0.018 * s], seg=5, caps=('none', 'none'))
    body.lathe('cap', [(0, 0.045 * s), (0.04 * s, 0.035 * s), (0.065 * s, 0.0), (0, -0.005)], seg=8, c=tip)
    body.drip(tip + Vector((0.05 * s * nx, 0.05 * s * ny, 0.0)), 0.04 * s, 0.012 * s, seg=5)

# ---- голова и борода-грибница
head = Part('head', (0, -0.03, 1.40))
head.ellipsoid('cream', (0, -0.07, 1.49), (0.12, 0.12, 0.15), seg=12, rings=8)
head.tube('cream', [(0, -0.17, 1.52), (0, -0.24, 1.47), (0, -0.27, 1.41)], [0.035, 0.026, 0.014], seg=6,
          caps=('none', 'round'), cap_steps=1)
for sx in (-1, 1):
    head.ellipsoid('eye', (sx * 0.055, -0.175, 1.535), (0.032, 0.02, 0.022), seg=8, rings=4, rot=(0, sx * -0.25, 0))
head.ellipsoid('cream', (0, -0.15, 1.30), (0.12, 0.07, 0.14), seg=10, rings=6)
for i, (x, y, zb, ln, w) in enumerate([(-0.09, -0.16, 1.36, 0.42, 0.035), (-0.05, -0.20, 1.33, 0.52, 0.04),
                                       (0.0, -0.21, 1.32, 0.58, 0.042), (0.05, -0.20, 1.33, 0.50, 0.04),
                                       (0.09, -0.16, 1.36, 0.40, 0.035), (-0.03, -0.17, 1.30, 0.62, 0.03),
                                       (0.03, -0.17, 1.30, 0.60, 0.03)]):
    wig = 0.03 * math.sin(i * 2.1)
    head.tube('cream', [(x, y, zb), (x * 1.15 + wig, y - 0.03, zb - ln * 0.35), (x * 1.1 - wig, y - 0.02, zb - ln * 0.7),
                        (x * 0.9 + wig * 0.5, y + 0.01, zb - ln)], [w, w * 0.8, w * 0.55, w * 0.2], seg=5,
              caps=('none', 'round'), cap_steps=1)

# ---- шляпка
cap = Part('cap', (0, -0.03, 1.60))
cprof = [(0, 0.36), (0.07, 0.32), (0.18, 0.23), (0.29, 0.13), (0.38, 0.055), (0.43, 0.012), (0.42, -0.02),
         (0.32, -0.03), (0.13, 0.0), (0, 0.02)]
cap.lathe('cap', cprof, seg=20, c=(0, -0.03, 1.58))
cap.paint('cream', [((0, -0.03, 1.58), 0.6)], only=['cap'], wobble=0.0, test=lambda p: p.z < 1.58 + 0.0)
cap.paint('cap_light', [((0, -0.03, 1.58), 0.6)], only=['cap'], wobble=0.0, test=lambda p: math.hypot(p.x, p.y + 0.03) > 0.31)
for i, (a, rr) in enumerate([(30, 0.20), (150, 0.24), (260, 0.30), (-20, 0.33), (95, 0.12)]):
    t = math.radians(a)
    x, y = rr * math.cos(t), -0.03 + rr * math.sin(t)
    cap.splat((x, y, 1.58 + profile_z(cprof, rr)), 0.055, 0.006, seg=8, rings=2, key='cream', seed=i)
cap.splat((0.05, -0.03, 1.58 + 0.36), 0.16, 0.02, seg=12, rings=2, seed=8.1)
cap.splat((-0.2, -0.22, 1.58 + 0.16), 0.13, 0.016, seg=10, rings=2, seed=9.3)
for (a, ln) in [(-70, 0.14), (-115, 0.10), (200, 0.12), (20, 0.09)]:
    t = math.radians(a)
    cap.drip((0.425 * math.cos(t), -0.03 + 0.425 * math.sin(t), 1.58 + 0.01), ln, 0.026, seg=6)
cap.transform(rot=(0.1, 0, 0), pivot=(0, -0.03, 1.60))

# ---- руки
arms = {}
for nm, sx, hand in (('arm_l', 1, (0.44, -0.30, 0.98)), ('arm_r', -1, (-0.40, -0.24, 1.04))):
    a = Part(nm, (sx * 0.25, -0.02, 1.30))
    mid = (sx * 0.36, -0.12, 1.15)
    a.tube('robe', [(sx * 0.24, -0.01, 1.33), mid, (hand[0] * 0.97, hand[1] * 0.92, hand[2] + 0.08)],
           [0.085, 0.095, 0.13], seg=10, caps=('round', 'none'))
    a.ellipsoid('cream', hand, (0.05, 0.055, 0.07), seg=8, rings=5)
    a.drip((sx * 0.40, -0.24, 1.06), 0.12, 0.022, seg=5)
    arms[nm] = a

# ---- посох и кристалл
st = Part('staff', (-0.41, -0.25, 1.04))
st.tube('wood', [(-0.43, -0.26, 0.02), (-0.41, -0.24, 0.55), (-0.43, -0.27, 1.10), (-0.40, -0.25, 1.55),
                 (-0.43, -0.27, 1.88)], [0.03, 0.034, 0.036, 0.034, 0.04], seg=7, n=8, caps=('round', 'none'),
        cap_steps=1)
for k in range(3):
    t = TAU * k / 3 + 0.4
    ox, oy = math.cos(t) * 0.075, math.sin(t) * 0.075
    st.tube('wood', [(-0.43, -0.27, 1.86), (-0.43 + ox, -0.27 + oy, 1.98), (-0.43 + ox * 0.5, -0.27 + oy * 0.5, 2.10)],
            [0.026, 0.02, 0.008], seg=5, caps=('none', 'round'), cap_steps=1)
st.drip((-0.40, -0.30, 1.80), 0.14, 0.02, seg=5)
cr = Part('crystal', (-0.43, -0.27, 1.99))
cr.lathe('eye', [(0, -0.09), (0.055, -0.01), (0.045, 0.05), (0, 0.15)], seg=6, c=(-0.43, -0.27, 1.99), hard=True)

root, P = build_parts(MID, [(body, None), (head, 'body'), (cap, 'head'), (arms['arm_l'], 'body'), (arms['arm_r'], 'body'),
                            (st, 'arm_r'), (cr, 'staff')])


def walk(f):
    N = 32
    return {
        'body': {'loc': (0, 0, 0.02 * cw(f, N / 2)), 'rot': (0.02, 0.04 * sw(f, N), 0.05 * sw(f, N, 0.2))},
        'head': {'rot': (0.04 * sw(f, N / 2, 0.2), 0, -0.04 * sw(f, N, 0.2))},
        'cap': {'rot': (0.04 * sw(f, N / 2, 0.05), -0.05 * sw(f, N, 0.1), 0)},
        'arm_l': {'rot': (0.18 * sw(f, N, 0.5), 0, 0.05 * sw(f, N))},
        'arm_r': {'rot': (0.16 * sw(f, N), 0, 0)},
        'staff': {'rot': (-0.1 * sw(f, N), 0, 0)},
        'crystal': {'rot': (0, 0, TAU * f / N), 'scale': 1 + 0.08 * sw(f, N / 2)},
    }


def attack(f):
    # тычок посохом с вспышкой кристалла (удар на 13-м кадре)
    up = env(f, 0, 8, 8, 11)
    hitk = env(f, 10, 13, 15, 24)
    return {
        'body': {'loc': (0, -0.08 * hitk, 0), 'rot': (-0.08 * up + 0.15 * hitk, 0, -0.15 * up + 0.1 * hitk)},
        'head': {'rot': (-0.1 * up + 0.1 * hitk, 0, 0)},
        'cap': {'rot': (-0.08 * up + 0.12 * hitk, 0, 0)},
        'arm_r': {'rot': (-0.9 * up - 1.0 * hitk, 0, -0.2 * up)},
        'staff': {'rot': (0.5 * up - 0.2 * hitk, 0, 0)},
        'crystal': {'scale': 1 + 0.7 * env(f, 11, 13, 14, 19)},
        'arm_l': {'rot': (0.3 * up - 0.2 * hitk, 0, 0.2 * up)},
    }


def cast(f):
    # посох вверх, левая ладонь вверх, кристалл пульсирует; срабатывание на 24-м кадре (1,0 с)
    raise_ = env(f, 0, 10, 26, 36)
    pulse = raise_ * (0.5 + 0.5 * math.sin(f * 0.9))
    burst = env(f, 22, 24, 25, 30)
    return {
        'body': {'loc': (0, 0.02 * raise_, 0.03 * raise_), 'rot': (-0.1 * raise_, 0, 0)},
        'head': {'rot': (-0.2 * raise_, 0, 0)},
        'cap': {'rot': (-0.1 * raise_ + 0.05 * math.sin(f * 0.7) * raise_, 0, 0)},
        'arm_r': {'rot': (-1.2 * raise_, 0, -0.35 * raise_)},
        'staff': {'rot': (1.12 * raise_, 0, 0.3 * raise_)},
        'arm_l': {'rot': (-1.3 * raise_, 0, 0.5 * raise_)},
        'crystal': {'rot': (0, 0, 0.5 * f), 'scale': 1 + 0.35 * pulse + 0.8 * burst},
    }


def hit(f):
    k = env(f, 0, 3, 4, 12)
    return {
        'body': {'loc': (0, 0.06 * k, 0), 'rot': (-0.15 * k, 0, 0.08 * k)},
        'head': {'rot': (-0.25 * k, 0, 0.1 * k)},
        'cap': {'rot': (-0.2 * k, 0.1 * k, 0), 'scale': (1 + 0.08 * k, 1 + 0.08 * k, 1 - 0.12 * k)},
        'arm_l': {'rot': (0.4 * k, 0, 0.2 * k)},
        'arm_r': {'rot': (0.25 * k, 0, 0)},
    }


def death(f):
    wob = env(f, 0, 4, 8, 12) * math.sin(f * 1.1)
    sag = ramp(f, 8, 28)
    gone = ramp(f, 28, 48)
    s = 1 - 0.95 * gone
    return {
        'body': {'loc': (0, 0, -0.55 * sag - 0.2 * gone), 'rot': (0.1 * sag, 0, 0.1 * wob),
                 'scale': (s * (1 + 0.25 * sag), s * (1 + 0.25 * sag), s * (1 - 0.55 * sag))},
        'head': {'rot': (0.5 * sag, 0, 0.2 * wob)},
        'cap': {'loc': (0.15 * ramp(f, 14, 26), -0.1 * ramp(f, 14, 26), -0.1 * ramp(f, 14, 26)),
                'rot': (0.6 * ramp(f, 14, 26), 0.5 * ramp(f, 14, 26), 0)},
        'arm_l': {'rot': (0.2 * sag, 0, 0.6 * sag)},
        'arm_r': {'rot': (0.2 * sag, 0, -0.5 * sag)},
        'staff': {'rot': (0, -1.2 * ramp(f, 10, 24), 0)},
        'crystal': {'scale': max(0.02, 1 + 0.6 * env(f, 4, 10, 10, 14) - ramp(f, 14, 24))},
    }


acts = [bake(MID, P, 'walk', 32, walk), bake(MID, P, 'attack', 24, attack), bake(MID, P, 'cast', 36, cast),
        bake(MID, P, 'hit', 12, hit), bake(MID, P, 'death', 48, death)]
print(finish(MID, root, P, acts))
