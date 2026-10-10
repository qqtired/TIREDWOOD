# cooper — элита Бочар: тролль ~2,6 м с бочкой на плечах и бочкой-молотом.
# Части: body, head, barrel, arm_l, arm_r, hammer, leg_l, leg_r.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'cooper'
clean_scene()


def barrel(part, c, half, r, rot, seg=20, hoops=(-0.72, 0.0, 0.72), key='wood'):
    """Бочка вдоль локальной Z (rot поворачивает): доски — чередование радиуса, обручи 'iron'."""
    prof = [(0, -half), (r * 0.80, -half), (r * 0.86, -half * 0.97), (r * 0.94, -half * 0.6), (r, 0),
            (r * 0.94, half * 0.6), (r * 0.86, half * 0.97), (r * 0.80, half), (0, half)]
    part.lathe(key, prof, seg=seg, c=c, rot=rot, hard=True, afn=lambda j: 0.94 if j % 2 else 1.0)
    for h in hoops:
        z = h * half
        rr = r * (1 - 0.06 * (z / half) ** 2 * 2.2) + 0.004
        w = 0.04 * (r / 0.32)
        part.lathe('iron', [(rr - 0.012, z - w), (rr + 0.022, z), (rr - 0.012, z + w)], seg=seg, c=c, rot=rot, hard=True)


def flat_bottom(k):
    return lambda v: Vector((v.x, v.y, max(v.z, k)))


# ---- тело: мягкие объёмы — живот, плечи, горб под бочкой
body = Part('body', (0, 0.05, 1.0))
body.tube('troll', [(0, 0.06, 0.92), (0, 0.0, 1.28), (0, -0.04, 1.62), (0, 0.03, 1.93), (0, 0.10, 2.10)],
          [(0.44, 0.37), (0.54, 0.46), (0.58, 0.45), (0.62, 0.42), (0.40, 0.30)], seg=18, n=8, up=(0, -1, 0),
          caps=('none', 'round'), cap_k=0.7)
body.ellipsoid('troll', (0, -0.24, 1.30), (0.46, 0.34, 0.42), seg=14, rings=8)
for sx in (-1, 1):
    body.ellipsoid('troll', (sx * 0.46, 0.02, 1.98), (0.30, 0.30, 0.24), seg=12, rings=6)
body.ellipsoid('troll', (0, 0.22, 1.86), (0.42, 0.25, 0.30), seg=10, rings=5)
body.tube('robe', [(0, 0.05, 1.04), (0, 0.05, 0.86), (0, 0.05, 0.66)], [(0.50, 0.44), (0.55, 0.49), (0.58, 0.52)],
          seg=20, caps=('none', 'none'))
for sx in (-1, 1):
    body.splat((sx * 0.50, 0.0, 2.24), 0.22, 0.035, key='moss', seg=14, rings=3, seed=10 + sx, wob=0.45)
body.splat((0.25, -0.50, 1.45), 0.16, 0.02, seg=12, rings=3, seed=0.6)
body.splat((-0.30, -0.42, 1.78), 0.13, 0.018, seg=12, rings=2, seed=1.6)
body.drip((0.34, -0.50, 1.36), 0.22, 0.04)

# ---- голова: тяжёлая челюсть, клыки вверх, нависшие брови, нос-картофелина
head = Part('head', (0, -0.20, 1.98))
head.ellipsoid('troll', (0, -0.42, 2.05), (0.24, 0.24, 0.24), seg=12, rings=8)
head.ellipsoid('troll', (0, -0.54, 1.89), (0.25, 0.19, 0.13), seg=12, rings=6)
head.ellipsoid('troll', (0, -0.685, 2.01), (0.085, 0.09, 0.10), seg=8, rings=5)
head.ellipsoid('troll', (0, -0.62, 2.145), (0.22, 0.09, 0.06), seg=8, rings=4)
for sx in (-1, 1):
    head.ellipsoid('troll', (sx * 0.28, -0.36, 2.10), (0.15, 0.035, 0.07), seg=6, rings=4, rot=(0, sx * 0.3, sx * -0.45))
    head.ellipsoid('eye', (sx * 0.10, -0.645, 2.085), 0.04, seg=8, rings=4)
    head.tube('cream', [(sx * 0.12, -0.655, 1.90), (sx * 0.135, -0.69, 1.99), (sx * 0.16, -0.70, 2.07)],
              [0.045, 0.03, 0.007], seg=6, caps=('none', 'round'), cap_steps=1)
head.splat((0.05, -0.42, 2.29), 0.12, 0.016, seg=12, rings=2, seed=3.0)

# ---- бочка на плечах (поперёк, ось X), доски и обручи, мох и варенье сверху
bar = Part('barrel', (0, 0.12, 2.18))
barrel(bar, (0, 0.14, 2.34), 0.66, 0.34, (0, math.pi / 2, 0), seg=20)
bar.splat((0.12, 0.10, 2.68), 0.20, 0.025, seg=14, rings=3, seed=4.1)
bar.splat((-0.40, 0.20, 2.64), 0.19, 0.035, key='moss', seg=14, rings=3, seed=5.2, wob=0.45)
bar.drip((0.10, -0.16, 2.42), 0.26, 0.045)
bar.drip((-0.36, -0.14, 2.38), 0.20, 0.04)

# ---- руки: дельта, бицепс, мощное предплечье, кулак с большим пальцем
arms = {}
for nm, sx in (('arm_l', 1), ('arm_r', -1)):
    a = Part(nm, (sx * 0.60, -0.02, 1.95))
    a.ellipsoid('troll', (sx * 0.66, -0.02, 1.90), (0.24, 0.24, 0.22), seg=12, rings=6)
    a.tube('troll', [(sx * 0.66, -0.04, 1.85), (sx * 0.75, -0.09, 1.62), (sx * 0.79, -0.14, 1.44)], [0.2, 0.19, 0.15],
           seg=12, caps=('none', 'none'))
    a.tube('troll', [(sx * 0.79, -0.14, 1.44), (sx * 0.82, -0.21, 1.24), (sx * 0.83, -0.27, 1.06)], [0.15, 0.21, 0.15],
           seg=12, caps=('none', 'none'))
    a.ellipsoid('troll', (sx * 0.84, -0.33, 0.90), (0.21, 0.22, 0.20), seg=10, rings=6)
    a.ellipsoid('troll', (sx * 0.71, -0.42, 0.96), (0.075, 0.07, 0.08), seg=6, rings=4)
    a.splat((sx * 0.84, -0.30, 1.30), 0.1, 0.014, seg=10, rings=2, seed=6 + sx)
    arms[nm] = a
arms['arm_l'].splat((0.68, 0.0, 2.13), 0.13, 0.03, key='moss', seg=10, rings=2, seed=12.5, wob=0.45)

# ---- бочка-молот в правой руке
ham = Part('hammer', (-0.83, -0.32, 0.92))
ham.tube('wood', [(-0.83, -0.10, 1.00), (-0.84, -0.55, 0.70), (-0.85, -0.98, 0.42)], [0.075, 0.065, 0.07], seg=8,
         caps=('round', 'none'), cap_steps=1)
barrel(ham, (-0.85, -1.02, 0.40), 0.30, 0.25, (0, math.pi / 2, 0), seg=16, hoops=(-0.7, 0.7))
ham.splat((-0.85, -1.0, 0.66), 0.14, 0.02, seg=14, rings=3, seed=7.7)

# ---- ноги: бедро, икра, широкая стопа
legs = {}
for nm, sx in (('leg_l', 1), ('leg_r', -1)):
    lg = Part(nm, (sx * 0.30, 0.05, 0.95))
    lg.tube('troll', [(sx * 0.30, 0.05, 1.0), (sx * 0.36, 0.0, 0.75), (sx * 0.37, -0.03, 0.52)], [0.25, 0.23, 0.18],
            seg=12, caps=('none', 'none'))
    lg.tube('troll', [(sx * 0.37, -0.03, 0.52), (sx * 0.38, 0.0, 0.32), (sx * 0.38, 0.0, 0.13)], [0.18, 0.195, 0.15],
            seg=12, caps=('none', 'none'))
    lg.ellipsoid('troll', (sx * 0.39, -0.10, 0.09), (0.19, 0.28, 0.10), seg=12, rings=6, unit_fn=flat_bottom(-0.85))
    legs[nm] = lg

root, P = build_parts(MID, [(body, None), (head, 'body'), (bar, 'body'), (arms['arm_l'], 'body'), (arms['arm_r'], 'body'),
                            (ham, 'arm_r'), (legs['leg_l'], 'body'), (legs['leg_r'], 'body')])


def walk(f):
    N = 32
    st = abs(sw(f, N))
    return {
        'body': {'loc': (0, 0, -0.05 * (1 - st)), 'rot': (0.05, 0.06 * sw(f, N), 0.06 * sw(f, N, 0.25))},
        'head': {'rot': (0.05 * sw(f, N / 2, 0.15), 0, -0.05 * sw(f, N, 0.25))},
        'barrel': {'loc': (0, 0, 0.03 * sw(f, N / 2, -0.15)), 'rot': (0, 0.04 * sw(f, N, -0.1), 0)},
        'arm_l': {'rot': (0.28 * sw(f, N, 0.5), 0, 0.05)},
        'arm_r': {'rot': (0.22 * sw(f, N), 0, -0.05)},
        'hammer': {'rot': (-0.1 * sw(f, N, -0.1), 0, 0)},
        'leg_l': {'rot': (0.38 * sw(f, N), 0, 0), 'loc': (0, 0, 0.07 * max(0.0, -cw(f, N, 0.25)))},
        'leg_r': {'rot': (0.38 * sw(f, N, 0.5), 0, 0), 'loc': (0, 0, 0.07 * max(0.0, -cw(f, N, 0.75)))},
    }


def attack(f):
    # замах 0-12, удар 12-16 (касание земли на 16-м кадре = 0,67 с), возврат к 28
    wind = env(f, 0, 12, 12, 15)
    slam = env(f, 12, 16, 19, 28)
    return {
        'body': {'loc': (0, -0.12 * slam, -0.10 * slam), 'rot': (-0.18 * wind + 0.32 * slam, 0, 0.12 * wind)},
        'head': {'rot': (-0.15 * wind + 0.1 * slam, 0, 0)},
        'barrel': {'loc': (0, 0, 0.06 * env(f, 15, 17, 17, 22)), 'rot': (0.1 * slam, 0, 0)},
        'arm_r': {'rot': (-2.7 * wind - 1.0 * slam, 0.25 * wind, -0.15 * wind)},
        'hammer': {'rot': (-0.5 * wind + 0.45 * slam, 0, 0)},
        'arm_l': {'rot': (0.4 * wind - 0.3 * slam, 0, 0.25 * wind)},
        'leg_l': {'rot': (-0.3 * slam, 0, 0)},
        'leg_r': {'rot': (0.25 * slam, 0, 0)},
    }


def charge(f):
    # цикл тарана: корпус вперёд, бочка-молот выставлена вперёд, быстрый тяжёлый бег
    N = 16
    st = abs(sw(f, N))
    return {
        'body': {'loc': (0, -0.05, -0.1 + 0.06 * st), 'rot': (0.38, 0.05 * sw(f, N), 0.05 * sw(f, N, 0.25))},
        'head': {'rot': (-0.25, 0, 0)},
        'barrel': {'loc': (0, 0, 0.05 * sw(f, N / 2, -0.2)), 'rot': (-0.1, 0.05 * sw(f, N, -0.1), 0)},
        'arm_l': {'rot': (0.55 + 0.3 * sw(f, N, 0.5), 0, 0.15)},
        'arm_r': {'rot': (-0.9 + 0.08 * sw(f, N), 0, -0.1)},
        'hammer': {'rot': (-0.7, 0, 0)},
        'leg_l': {'rot': (0.65 * sw(f, N) - 0.3, 0, 0), 'loc': (0, 0, 0.1 * max(0.0, -cw(f, N, 0.25)))},
        'leg_r': {'rot': (0.65 * sw(f, N, 0.5) - 0.3, 0, 0), 'loc': (0, 0, 0.1 * max(0.0, -cw(f, N, 0.75)))},
    }


def hit(f):
    k = env(f, 0, 3, 4, 12)
    return {
        'body': {'loc': (0, 0.10 * k, 0), 'rot': (-0.16 * k, 0, 0.08 * k)},
        'head': {'rot': (-0.3 * k, 0, 0.15 * k)},
        'barrel': {'loc': (0, 0.04 * k, 0.05 * k), 'rot': (0.12 * k, 0, 0)},
        'arm_l': {'rot': (0.3 * k, 0, 0.2 * k)},
        'arm_r': {'rot': (0.25 * k, 0, -0.2 * k)},
    }


def death(f):
    sway = env(f, 0, 4, 8, 12) * math.sin(f * 0.9)
    knees = ramp(f, 10, 20)
    fall = ramp(f, 20, 32)
    gone = ramp(f, 32, 48)
    s = (1 + 0.1 * env(f, 30, 33, 33, 36)) * (1 - 0.95 * gone)
    return {
        'body': {'loc': (0, -0.55 * fall, -0.42 * knees - 0.55 * fall - 0.3 * gone),
                 'rot': (0.12 * knees + 1.25 * fall, 0, 0.12 * sway),
                 'scale': (s * (1 + 0.3 * gone), s * (1 + 0.3 * gone), s * (1 - 0.4 * gone))},
        'head': {'rot': (0.3 * knees - 0.4 * fall, 0, 0.2 * sway)},
        'barrel': {'loc': (0.0, -0.2 * fall, 0.25 * env(f, 26, 32, 32, 40)), 'rot': (0.0, 0.5 * fall, 0),
                   'scale': 1 + 0.25 * env(f, 30, 34, 34, 40)},
        'arm_l': {'rot': (-0.4 * knees - 0.9 * fall, 0, 0.3 * fall)},
        'arm_r': {'rot': (-0.3 * knees - 0.8 * fall, 0, -0.3 * fall)},
        'hammer': {'rot': (0.6 * knees, 0, 0.4 * fall)},
        'leg_l': {'rot': (-1.2 * knees + 0.5 * fall, 0, 0)},
        'leg_r': {'rot': (-1.1 * knees + 0.5 * fall, 0, 0)},
    }


acts = [bake(MID, P, 'walk', 32, walk), bake(MID, P, 'attack', 28, attack), bake(MID, P, 'charge', 16, charge),
        bake(MID, P, 'hit', 12, hit), bake(MID, P, 'death', 48, death)]
print(finish(MID, root, P, acts))
