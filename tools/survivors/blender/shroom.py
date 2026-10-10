# shroom — грибник (~1,4 м). Части: body, cap, arm_l, arm_r, leg_l, leg_r.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'shroom'
clean_scene()

# ---- тело-ножка с лицом
body = Part('body', (0, 0, 0.34))
body.tube('cream', [(0, 0.0, 0.22), (0, 0.0, 0.40), (0, 0.0, 0.60), (0, 0.01, 0.80), (0, 0.02, 0.97)],
          [(0.25, 0.22), (0.31, 0.27), (0.32, 0.28), (0.28, 0.25), (0.21, 0.19)], seg=14, n=7, up=(0, -1, 0),
          cap_k=0.6)
for sx in (-1, 1):
    body.ellipsoid('eye', (sx * 0.095, -0.232, 0.80), (0.05, 0.026, 0.032), seg=8, rings=4, rot=(0, sx * -0.3, 0))
    body.ellipsoid('cap', (sx * 0.10, -0.245, 0.858), (0.085, 0.035, 0.028), seg=6, rings=3, rot=(0.2, sx * 0.38, 0))
body.ellipsoid('horn', (0, -0.262, 0.69), (0.07, 0.02, 0.016), seg=6, rings=3, rot=(0, 0, 0))
body.splat((0.17, -0.17, 0.55), 0.10, 0.014, seg=10, rings=2, seed=1.2)
body.splat((-0.2, -0.05, 0.42), 0.08, 0.012, seg=10, rings=2, seed=2.1)
body.splat((0.05, 0.25, 0.62), 0.11, 0.014, seg=10, rings=2, seed=3.3)
body.drip((0.20, -0.17, 0.52), 0.12, 0.022, seg=6)

# ---- шляпка
cap = Part('cap', (0, 0.0, 0.95))
prof = [(0, 0.47), (0.17, 0.455), (0.33, 0.41), (0.46, 0.32), (0.55, 0.20), (0.605, 0.085), (0.62, 0.025),
        (0.60, -0.02), (0.52, -0.035), (0.37, -0.01), (0.20, 0.03), (0, 0.05)]
cap.lathe('cap', prof, seg=20, c=(0, 0, 0.95))
cap.paint('cream', [((0, 0, 0.95), 0.70)], only=['cap'], wobble=0.0, test=lambda p: p.z < 0.95 + 0.012)
cap.paint('cap_light', [((0, 0, 0.95), 0.80)], only=['cap'], wobble=0.0, test=lambda p: math.hypot(p.x, p.y) > 0.50)
# варенье: заливка сверху + подтёки по краю + ягоды
cap.splat((0.0, 0.03, 1.42), 0.30, 0.03, seg=12, rings=2, seed=0.5)
JAMS = [(-35, 0.24), (-150, 0.22), (95, 0.21), (30, 0.18), (-92, 0.2)]
for i, (a, R) in enumerate(JAMS):
    t = math.radians(a)
    cap.splat((0.42 * math.cos(t), 0.42 * math.sin(t), 0.95 + profile_z(prof, 0.42)), R, 0.022, seg=12, rings=2,
              seed=1.5 + i)
for i, (a, ln) in enumerate([(-47, 0.20), (-162, 0.17), (-110, 0.12), (88, 0.15), (30, 0.16)]):
    t = math.radians(a)
    cap.drip((0.612 * math.cos(t), 0.612 * math.sin(t), 0.95 + 0.035), ln, 0.034, seg=6)
for (x, y) in [(0.12, -0.08), (-0.3, -0.18)]:
    r = math.hypot(x, y)
    cap.bead((x, y, 0.95 + profile_z(prof, r) + 0.035), 0.045)
cap.transform(rot=(-0.12, 0, 0), pivot=(0, 0, 0.95))

# ---- руки (левая = +X, модель смотрит в −Y)
arms = []
for nm, sx in (('arm_l', 1), ('arm_r', -1)):
    a = Part(nm, (sx * 0.27, 0, 0.76))
    a.tube('cream', [(sx * 0.25, 0, 0.78), (sx * 0.37, -0.02, 0.65), (sx * 0.43, -0.05, 0.50)], [0.09, 0.08, 0.075],
           seg=8, caps=('round', 'none'))
    a.ellipsoid('cream', (sx * 0.44, -0.06, 0.44), (0.095, 0.095, 0.09), seg=8, rings=5)
    a.splat((sx * 0.40, -0.10, 0.66), 0.06, 0.01, seg=8, rings=2, seed=5 + sx)
    arms.append(a)

legs = []
for nm, sx in (('leg_l', 1), ('leg_r', -1)):
    lg = Part(nm, (sx * 0.13, 0, 0.30))
    lg.tube('cream', [(sx * 0.13, 0, 0.32), (sx * 0.15, -0.01, 0.17), (sx * 0.16, -0.02, 0.08)], [0.105, 0.095, 0.09],
            seg=8, caps=('none', 'none'))
    lg.ellipsoid('cream', (sx * 0.16, -0.06, 0.03), (0.115, 0.155, 0.05), seg=8, rings=4,
                 unit_fn=lambda v: Vector((v.x, v.y, max(v.z, -0.6))))
    legs.append(lg)

root, P = build_parts(MID, [(body, None), (cap, 'body')] + [(a, 'body') for a in arms] + [(l, 'body') for l in legs])


# ---- анимации
def walk(f):
    N = 24
    d = {
        'body': {'loc': (0, 0, 0.025 * abs(sw(f, N))), 'rot': (0.03 * sw(f, N / 2), 0.07 * sw(f, N), 0.05 * sw(f, N, 0.25))},
        'cap': {'rot': (0.05 * sw(f, N / 2, -0.15), -0.06 * sw(f, N, -0.12), 0), 'scale': (1 + 0.02 * sw(f, N / 2, 0.1), 1 + 0.02 * sw(f, N / 2, 0.1), 1 - 0.03 * sw(f, N / 2, 0.1))},
        'arm_l': {'rot': (0.4 * sw(f, N, 0.5), 0, 0.05 * sw(f, N))},
        'arm_r': {'rot': (0.4 * sw(f, N), 0, 0.05 * sw(f, N))},
        'leg_l': {'rot': (0.45 * sw(f, N), 0, 0), 'loc': (0, 0, 0.04 * max(0.0, -cw(f, N, 0.25)))},
        'leg_r': {'rot': (0.45 * sw(f, N, 0.5), 0, 0), 'loc': (0, 0, 0.04 * max(0.0, -cw(f, N, 0.75)))},
    }
    return d


def attack(f):
    # замах назад, затем толчок обеими руками и шляпкой вперёд
    back = env(f, 0, 7, 7, 10)
    hitk = env(f, 7, 10, 12, 20)
    return {
        'body': {'loc': (0, 0.05 * back - 0.14 * hitk, -0.02 * hitk), 'rot': (-0.14 * back + 0.3 * hitk, 0, 0)},
        'cap': {'rot': (-0.1 * back + 0.22 * hitk, 0, 0), 'scale': (1 + 0.06 * hitk, 1 + 0.06 * hitk, 1 - 0.1 * hitk)},
        'arm_l': {'rot': (0.7 * back - 1.45 * hitk, 0, 0.15 * back - 0.25 * hitk)},
        'arm_r': {'rot': (0.7 * back - 1.45 * hitk, 0, -0.15 * back + 0.25 * hitk)},
        'leg_l': {'rot': (0.15 * back - 0.3 * hitk, 0, 0)},
        'leg_r': {'rot': (-0.1 * back + 0.25 * hitk, 0, 0)},
    }


def hit(f):
    k = env(f, 0, 2, 3, 10)
    return {
        'body': {'loc': (0, 0.06 * k, 0), 'rot': (-0.2 * k, 0, 0.1 * k)},
        'cap': {'rot': (-0.15 * k, 0.1 * k, 0), 'scale': (1 + 0.1 * k, 1 + 0.1 * k, 1 - 0.18 * k)},
        'arm_l': {'rot': (0.5 * k, 0, 0.3 * k)},
        'arm_r': {'rot': (0.5 * k, 0, -0.3 * k)},
    }


def death(f):
    shake = (1 - ramp(f, 8, 12)) * ramp(f, 0, 2)
    puff = env(f, 4, 10, 10, 13)
    gone = ramp(f, 12, 36)
    s = 1 - 0.95 * gone
    return {
        'body': {'loc': (0, 0, -0.3 * gone), 'rot': (0.08 * gone, 0.12 * math.sin(f * 1.9) * shake, 0),
                 'scale': (s * (1 + 0.4 * gone), s * (1 + 0.4 * gone), s * (1 - 0.6 * gone))},
        'cap': {'loc': (0, 0, 0.12 * puff), 'scale': (1 + 0.35 * puff) * (1 - 0.7 * ramp(f, 11, 20))},
        'arm_l': {'rot': (0.3 * shake, 0, 0.9 * ramp(f, 8, 20))},
        'arm_r': {'rot': (0.3 * shake, 0, -0.9 * ramp(f, 8, 20))},
        'leg_l': {'rot': (0, 0.5 * gone, 0)},
        'leg_r': {'rot': (0, -0.5 * gone, 0)},
    }


acts = [bake(MID, P, 'walk', 24, walk), bake(MID, P, 'attack', 20, attack), bake(MID, P, 'hit', 10, hit),
        bake(MID, P, 'death', 36, death)]
print(finish(MID, root, P, acts))
