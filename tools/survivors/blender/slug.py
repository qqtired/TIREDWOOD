# slug — слизень-повидло (~1,2 м). Части: body, head, stalk_l, stalk_r, tail.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'slug'
clean_scene()


def flat(z0, k=0.25):
    def fn(p):
        if p.z < z0:
            p.z = max(0.004, z0 + (p.z - z0) * k)
        return p
    return fn


body = Part('body', (0, 0.05, 0.16))
body.tube('jam_gel', [(0, -0.30, 0.17), (0, -0.12, 0.225), (0, 0.08, 0.245), (0, 0.28, 0.185), (0, 0.42, 0.12)],
          [(0.22, 0.17), (0.26, 0.225), (0.265, 0.235), (0.22, 0.17), (0.15, 0.10)], seg=16, n=7, fn=flat(0.06),
          caps=('none', 'none'))
body.ellipsoid('flesh', (0, 0.06, 0.035), (0.31, 0.50, 0.05), seg=14, rings=5, unit_fn=lambda v: Vector((v.x, v.y, max(v.z, -0.5))))
for (x, y, z, r) in [(0.10, -0.12, 0.44, 0.05), (-0.12, -0.02, 0.45, 0.045), (0.05, 0.12, 0.47, 0.05),
                     (-0.06, 0.25, 0.38, 0.04), (0.16, 0.24, 0.34, 0.035), (-0.18, -0.16, 0.38, 0.035)]:
    body.bead((x, y, z), r, key='jam', seg=8, rings=4)
body.drip((0.24, 0.0, 0.18), 0.10, 0.03, key='jam_gel', seg=6)

head = Part('head', (0, -0.24, 0.16))
head.tube('jam_gel', [(0, -0.20, 0.17), (0, -0.36, 0.165), (0, -0.50, 0.13), (0, -0.565, 0.095)],
          [(0.215, 0.165), (0.19, 0.15), (0.145, 0.115), (0.075, 0.06)], seg=14, n=5, fn=flat(0.05),
          caps=('none', 'round'))
head.ellipsoid('flesh', (0, -0.36, 0.03), (0.24, 0.24, 0.04), seg=12, rings=4, unit_fn=lambda v: Vector((v.x, v.y, max(v.z, -0.5))))
head.ellipsoid('horn', (0, -0.585, 0.07), (0.07, 0.02, 0.014), seg=6, rings=3)
head.drip((0.05, -0.58, 0.075), 0.04, 0.02, key='jam_gel', seg=6)
head.drip((0.17, -0.40, 0.20), 0.10, 0.026, key='jam_gel', seg=6)

stalks = []
for nm, sx in (('stalk_l', 1), ('stalk_r', -1)):
    j = (sx * 0.075, -0.42, 0.25)
    s = Part(nm, j)
    s.tube('jam_gel', [(sx * 0.07, -0.41, 0.23), (sx * 0.095, -0.46, 0.38), (sx * 0.12, -0.50, 0.50)],
           [0.035, 0.024, 0.018], seg=6, caps=('none', 'none'))
    s.ellipsoid('eye', (sx * 0.12, -0.505, 0.525), 0.05, seg=8, rings=5)
    stalks.append(s)

tail = Part('tail', (0, 0.40, 0.11))
tail.tube('jam_gel', [(0, 0.38, 0.125), (0, 0.50, 0.075), (0, 0.62, 0.03)], [(0.16, 0.11), (0.11, 0.065), (0.04, 0.025)],
          seg=12, n=4, fn=flat(0.03), caps=('none', 'round'), cap_steps=1)
tail.ellipsoid('flesh', (0, 0.53, 0.03), (0.17, 0.15, 0.03), seg=10, rings=4)
tail.bead((0.03, 0.47, 0.17), 0.035, key='jam')

root, P = build_parts(MID, [(body, None), (head, 'body'), (stalks[0], 'head'), (stalks[1], 'head'), (tail, 'body')])


def walk(f):
    N = 24
    w = sw(f, N)
    return {
        'body': {'scale': (1 - 0.03 * w, 1 + 0.06 * w, 1 - 0.05 * w), 'loc': (0, 0, 0)},
        'head': {'loc': (0, -0.04 * sw(f, N, 0.15), 0), 'rot': (0.05 * sw(f, N, 0.2), 0, 0.06 * sw(f, N / 2 * 2, 0.4))},
        'tail': {'loc': (0, 0.035 * sw(f, N, -0.2), 0), 'rot': (0, 0, 0.12 * sw(f, N, -0.1))},
        'stalk_l': {'rot': (0.15 * sw(f, N, 0.3), 0.12 * sw(f, N, 0.1), 0)},
        'stalk_r': {'rot': (0.15 * sw(f, N, 0.55), -0.12 * sw(f, N, 0.35), 0)},
    }


def attack(f):
    rear = env(f, 0, 8, 8, 11)
    slam = env(f, 8, 11, 12, 18)
    return {
        'body': {'loc': (0, -0.10 * slam, 0), 'scale': (1 + 0.05 * slam, 1 - 0.06 * rear + 0.08 * slam, 1 + 0.08 * rear - 0.1 * slam)},
        'head': {'rot': (-0.65 * rear + 0.2 * slam, 0, 0), 'scale': (1 + 0.12 * slam, 1, 1 - 0.1 * slam)},
        'stalk_l': {'rot': (-0.4 * rear + 0.5 * slam, 0, 0)},
        'stalk_r': {'rot': (-0.4 * rear + 0.5 * slam, 0, 0)},
        'tail': {'rot': (0.15 * rear, 0, 0)},
    }


def hit(f):
    k = env(f, 0, 1, 1, 10)
    wob = math.sin(f * 1.6) * k
    return {
        'body': {'scale': (1 + 0.1 * wob, 1 - 0.06 * wob, 1 - 0.12 * wob), 'loc': (0, 0.05 * k, 0)},
        'head': {'rot': (-0.15 * k, 0, 0.1 * wob)},
        'stalk_l': {'rot': (0.5 * k, 0.2 * wob, 0)},
        'stalk_r': {'rot': (0.5 * k, -0.2 * wob, 0)},
        'tail': {'rot': (0, 0, 0.15 * wob)},
    }


def death(f):
    swell = env(f, 0, 10, 10, 13)
    pud = ramp(f, 11, 18)
    gone = ramp(f, 18, 36)
    sxy = (1 + 0.18 * swell + 0.6 * pud) * (1 - 0.95 * gone)
    sz = (1 + 0.22 * swell - 0.85 * pud) * (1 - 0.9 * gone)
    return {
        'body': {'scale': (sxy, sxy, sz), 'loc': (0, 0, -0.12 * pud)},
        'head': {'rot': (0.2 * pud, 0, 0), 'scale': 1 - 0.4 * pud},
        'stalk_l': {'rot': (0.6 * ramp(f, 4, 14), 0.4 * pud, 0), 'scale': 1 - 0.8 * pud},
        'stalk_r': {'rot': (0.6 * ramp(f, 4, 14), -0.4 * pud, 0), 'scale': 1 - 0.8 * pud},
        'tail': {'scale': 1 - 0.5 * pud},
    }


acts = [bake(MID, P, 'walk', 24, walk), bake(MID, P, 'attack', 18, attack), bake(MID, P, 'hit', 10, hit),
        bake(MID, P, 'death', 36, death)]
print(finish(MID, root, P, acts))
