# larva — Личинка, свита босса Старого Повидла (~0,6 м). Части: seg_1 (корпус), head, seg_2, seg_3, tail.
# Сегменты: мягкое тёмное варенье, сверху каменные бронеплитки; голова — плитка как у босса.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'larva'
clean_scene()


def dome(k=-0.15):
    return lambda v: Vector((v.x, v.y, max(v.z, k)))


def segment(part, y, r, z):
    """Мягкое ядро из варенья + каменная плитка сверху."""
    part.ellipsoid('jam', (0, y, z), (r * 1.02, r * 1.0, r * 0.86), seg=10, rings=5)
    part.ellipsoid('stone', (0, y, z + r * 0.3), (r * 1.12, r * 0.74, r * 0.64), seg=10, rings=5, unit_fn=dome(-0.2))


s1 = Part('seg_1', (0, -0.06, 0.07))
segment(s1, -0.06, 0.075, 0.068)

head = Part('head', (0, -0.115, 0.072))
head.ellipsoid('jam', (0, -0.18, 0.06), (0.06, 0.07, 0.045), seg=8, rings=5)
head.ellipsoid('stone', (0, -0.185, 0.085), (0.078, 0.085, 0.058), seg=10, rings=5, unit_fn=dome(-0.25))
head.ellipsoid('stone', (0, -0.235, 0.112), (0.05, 0.03, 0.02), seg=6, rings=3)
for sx in (-1, 1):
    head.ellipsoid('eye', (sx * 0.038, -0.248, 0.088), 0.017, seg=6, rings=4)
    head.tube('horn', [(sx * 0.03, -0.245, 0.05), (sx * 0.028, -0.285, 0.045), (sx * 0.01, -0.305, 0.04)],
              [0.012, 0.008, 0.003], seg=5, caps=('none', 'round'), cap_steps=1)
head.drip((0.0, -0.25, 0.05), 0.03, 0.009, seg=6)

s2 = Part('seg_2', (0, 0.0, 0.066))
segment(s2, 0.035, 0.07, 0.063)
s2.bead((0.035, -0.008, 0.112), 0.011, seg=6, rings=4)
s2.bead((-0.04, 0.078, 0.10), 0.009, seg=6, rings=4)

s3 = Part('seg_3', (0, 0.085, 0.06))
segment(s3, 0.115, 0.06, 0.056)

tail = Part('tail', (0, 0.155, 0.05))
tail.tube('jam', [(0, 0.15, 0.05), (0, 0.21, 0.04), (0, 0.27, 0.026), (0, 0.30, 0.02)], [0.048, 0.034, 0.016, 0.008],
          seg=8, caps=('round', 'round'), cap_steps=1)
tail.ellipsoid('stone', (0, 0.185, 0.068), (0.05, 0.04, 0.03), seg=8, rings=4, unit_fn=dome(-0.2))

root, P = build_parts(MID, [(s1, None), (head, 'seg_1'), (s2, 'seg_1'), (s3, 'seg_2'), (tail, 'seg_3')])


def walk(f):
    # юркое извивание: волна вдоль тела, голова держит курс
    N = 16
    return {
        'seg_1': {'loc': (0.012 * sw(f, N), 0, 0.004 * cw(f, N / 2)), 'rot': (0, 0, 0.18 * sw(f, N))},
        'head': {'rot': (0.05 * sw(f, N / 2), 0, -0.22 * sw(f, N, 0.05))},
        'seg_2': {'rot': (0, 0, -0.32 * sw(f, N, -0.12))},
        'seg_3': {'rot': (0, 0, -0.34 * sw(f, N, -0.24))},
        'tail': {'rot': (0, 0, -0.38 * sw(f, N, -0.36))},
    }


def attack(f):
    # подобраться и броситься с укусом (укус на 6-м кадре = 0,25 с)
    coil = env(f, 0, 3, 3, 5)
    strike = env(f, 3, 6, 7, 12)
    return {
        'seg_1': {'loc': (0, 0.04 * coil - 0.14 * strike, 0.01 * strike), 'rot': (-0.15 * coil + 0.05 * strike, 0, 0)},
        'head': {'rot': (-0.45 * coil + 0.3 * strike, 0, 0), 'scale': 1 + 0.12 * strike},
        'seg_2': {'rot': (0.1 * coil, 0, 0.25 * coil)},
        'seg_3': {'rot': (0.15 * coil - 0.1 * strike, 0, -0.35 * coil)},
        'tail': {'rot': (0.2 * coil, 0, 0.3 * coil)},
    }


def hit(f):
    k = env(f, 0, 2, 2, 8)
    return {
        'seg_1': {'loc': (0, 0.05 * k, 0.01 * k), 'rot': (-0.2 * k, 0, 0.15 * k),
                  'scale': (1 + 0.1 * k, 1 - 0.08 * k, 1 - 0.08 * k)},
        'head': {'rot': (-0.35 * k, 0, 0.2 * k)},
        'seg_2': {'rot': (0, 0, -0.3 * k)},
        'seg_3': {'rot': (0, 0, -0.3 * k)},
        'tail': {'rot': (0.3 * k, 0, -0.3 * k)},
    }


def death(f):
    curl = ramp(f, 0, 8)
    pop = env(f, 8, 11, 11, 13)
    gone = ramp(f, 11, 24)
    twitch = env(f, 2, 4, 6, 9) * math.sin(f * 2.4)
    s = (1 + 0.25 * pop) * (1 - 0.95 * gone)
    return {
        'seg_1': {'loc': (0, 0, -0.04 * gone), 'rot': (0, 0.6 * curl, 0.3 * curl + 0.1 * twitch),
                  'scale': (s * (1 + 0.4 * gone), s * (1 + 0.4 * gone), s * (1 - 0.5 * gone))},
        'head': {'rot': (0.3 * curl, 0, -0.6 * curl)},
        'seg_2': {'rot': (0, 0, 0.6 * curl - 0.15 * twitch)},
        'seg_3': {'rot': (0, 0, 0.7 * curl + 0.15 * twitch)},
        'tail': {'rot': (0, 0, 0.8 * curl)},
    }


def emerge(f):
    # вылезает из-под пола головой вперёд за 0,5 с, лёгкий перелёт в конце
    t = ramp(f, 0, 10)
    over = env(f, 8, 10, 10, 12)
    return {
        'seg_1': {'loc': (0, 0.06 * (1 - t), -0.24 * (1 - t) + 0.02 * over), 'rot': (-1.0 * (1 - t), 0, 0)},
        'head': {'rot': (-0.3 * (1 - t) + 0.15 * over, 0, 0)},
        'seg_2': {'rot': (0.5 * (1 - t), 0, 0.1 * over)},
        'seg_3': {'rot': (0.5 * (1 - t), 0, -0.15 * over)},
        'tail': {'rot': (0.4 * (1 - t), 0, 0.2 * over)},
    }


acts = [bake(MID, P, 'walk', 16, walk), bake(MID, P, 'attack', 12, attack), bake(MID, P, 'hit', 8, hit),
        bake(MID, P, 'death', 24, death), bake(MID, P, 'emerge', 12, emerge)]
print(finish(MID, root, P, acts))
