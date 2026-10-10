# beetle — жук-щитоносец (~1,4 м). Части: body, shield, leg_fl/fr/ml/mr/bl/br.
# Панцирь из трёх пластин (переднеспинка + два надкрылья) с заклёпками, низкая посадка,
# выпуклый щит с кромкой.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'beetle'
clean_scene()


def flat_bottom(k=-0.45):
    return lambda v: Vector((v.x, v.y, max(v.z, k)))


body = Part('body', (0, 0.05, 0.36))
# переднеспинка
body.ellipsoid('chitin', (0, -0.22, 0.40), (0.40, 0.26, 0.24), seg=16, rings=8, unit_fn=flat_bottom(-0.5))
# надкрылья: два купола, между ними естественный шов
for sx in (-1, 1):
    body.ellipsoid('chitin', (sx * 0.2, 0.24, 0.39), (0.245, 0.47, 0.30), seg=12, rings=7, rot=(0, 0, -sx * 0.06),
                   unit_fn=flat_bottom(-0.5))
# голова на переднем краю, глаза выглядывают над щитом
body.ellipsoid('chitin', (0, -0.43, 0.50), (0.17, 0.12, 0.10), seg=10, rings=5)
for sx in (-1, 1):
    body.ellipsoid('eye', (sx * 0.095, -0.50, 0.545), (0.048, 0.04, 0.042), seg=7, rings=4)
    body.ellipsoid('horn', (sx * 0.06, -0.47, 0.615), (0.022, 0.055, 0.022), seg=6, rings=3, rot=(-0.6, 0, sx * 0.3))
# заклёпки по пластинам
for (x, y, z) in [(-0.22, -0.02, 0.62), (0.0, -0.02, 0.66), (0.22, -0.02, 0.62),
                  (0.37, 0.16, 0.62), (0.33, 0.50, 0.52),
                  (-0.37, 0.16, 0.62), (-0.33, 0.50, 0.52)]:
    body.stud((x, y, z), 0.026)
# варенье
body.splat((0.18, 0.12, 0.70), 0.2, 0.02, seg=14, rings=3, seed=0.7)
body.splat((-0.22, 0.38, 0.62), 0.15, 0.016, seg=12, rings=2, seed=1.9)
body.splat((-0.1, -0.24, 0.64), 0.12, 0.014, seg=12, rings=2, seed=2.8)
body.bead((0.16, 0.1, 0.72), 0.04, seg=7, rings=4)
body.bead((-0.24, 0.36, 0.64), 0.032, seg=6, rings=4)
body.drip((0.43, 0.14, 0.42), 0.12, 0.03, seg=6)
body.drip((-0.42, 0.38, 0.38), 0.10, 0.026, seg=6)

# ---- выпуклый щит на петле спереди
shield = Part('shield', (0, -0.46, 0.32))


def sh_pos(u, v):
    uu = u * 2 - 1
    w = 0.44 * (0.45 + 0.55 * (1 - (1 - v) ** 2))
    x = uu * w
    z = 0.06 + 0.52 * v
    e = max(abs(uu), abs(2 * v - 1))
    rim = smooth((e - 0.7) / 0.22)
    y = -0.55 + 0.10 * v - 0.11 * (1 - uu * uu) - 0.05 * math.sin(math.pi * v) - 0.03 * rim
    return Vector((x, y, z))


shield.sheet('iron', 8, 7, sh_pos, lambda u, v: Vector((0, 0.05, 0)))
for (u, v) in [(0.1, 0.9), (0.9, 0.9), (0.22, 0.3), (0.78, 0.3)]:
    shield.stud(sh_pos(u, v) + Vector((0, -0.03, 0)), 0.024)
shield.splat(sh_pos(0.62, 0.62) + Vector((0, -0.03, 0)), 0.15, 0.014, seg=14, rings=3, seed=3.3)
shield.drip(sh_pos(0.7, 0.72) + Vector((0, -0.012, 0)), 0.16, 0.03)

# ---- шесть коротких толстых лап
legs = []
for nm, sx, y0, dy in (('leg_fl', 1, -0.24, -0.14), ('leg_fr', -1, -0.24, -0.14), ('leg_ml', 1, 0.06, 0.0),
                       ('leg_mr', -1, 0.06, 0.0), ('leg_bl', 1, 0.34, 0.14), ('leg_br', -1, 0.34, 0.14)):
    j = (sx * 0.27, y0, 0.25)
    lg = Part(nm, j)
    lg.tube('chitin', [j, (sx * 0.43, y0 + dy * 0.5, 0.29), (sx * 0.50, y0 + dy * 0.85, 0.12), (sx * 0.52, y0 + dy, 0.02)],
            [0.085, 0.078, 0.055, 0.04], seg=6, n=4, caps=('round', 'round'), cap_steps=1)
    legs.append(lg)

root, P = build_parts(MID, [(body, None), (shield, 'body')] + [(l, 'body') for l in legs])

A_LEGS = ('leg_fl', 'leg_mr', 'leg_bl')


def leg_side(nm):
    return 1 if nm.endswith('l') else -1


def walk(f):
    N = 16
    d = {'body': {'loc': (0, 0, 0.012 * cw(f, N / 2)), 'rot': (0, 0.025 * sw(f, N / 2), 0.03 * sw(f, N))},
         'shield': {'rot': (0.03 * sw(f, N / 2, 0.2), 0, 0)}}
    for nm in ('leg_fl', 'leg_fr', 'leg_ml', 'leg_mr', 'leg_bl', 'leg_br'):
        ph = 0.0 if nm in A_LEGS else 0.5
        s = leg_side(nm)
        d[nm] = {'rot': (0, 0, s * 0.32 * cw(f, N, ph)), 'loc': (0, 0, 0.05 * max(0.0, sw(f, N, ph)))}
    return d


def attack(f):
    back = env(f, 0, 5, 5, 8)
    jab = env(f, 5, 8, 9, 16)
    d = {'body': {'loc': (0, 0.05 * back - 0.16 * jab, 0), 'rot': (-0.06 * back + 0.08 * jab, 0, 0)},
         'shield': {'rot': (-0.25 * back + 0.35 * jab, 0, 0)}}
    for nm in ('leg_fl', 'leg_fr', 'leg_ml', 'leg_mr', 'leg_bl', 'leg_br'):
        d[nm] = {'rot': (0, 0, leg_side(nm) * (0.15 * back - 0.2 * jab))}
    return d


def shield_bash(f):
    rear = env(f, 0, 9, 9, 13)
    bash = env(f, 9, 13, 15, 24)
    d = {'body': {'loc': (0, 0.10 * rear - 0.38 * bash, 0.05 * rear - 0.02 * bash),
                  'rot': (-0.22 * rear + 0.12 * bash, 0, 0)},
         'shield': {'rot': (-0.55 * rear + 0.5 * bash, 0, 0), 'scale': 1 + 0.06 * bash}}
    for nm in ('leg_fl', 'leg_fr', 'leg_ml', 'leg_mr', 'leg_bl', 'leg_br'):
        front = nm in ('leg_fl', 'leg_fr')
        d[nm] = {'rot': (0, 0, leg_side(nm) * (0.25 * rear - 0.35 * bash) * (1.4 if front else 1.0)),
                 'loc': (0, 0, (0.06 if front else 0.0) * rear)}
    return d


def hit(f):
    k = env(f, 0, 2, 3, 10)
    d = {'body': {'loc': (0, 0.07 * k, 0.02 * k), 'rot': (-0.12 * k, 0.08 * k, 0)},
         'shield': {'rot': (-0.3 * k, 0, 0.08 * k)}}
    for nm in ('leg_fl', 'leg_fr', 'leg_ml', 'leg_mr', 'leg_bl', 'leg_br'):
        d[nm] = {'rot': (0, 0.25 * k * leg_side(nm), 0)}
    return d


def death(f):
    flip = ramp(f, 0, 12)
    hop = math.sin(math.pi * min(1.0, f / 12.0))
    gone = ramp(f, 18, 36)
    twitch = env(f, 10, 13, 18, 24) * math.sin(f * 2.3)
    s = (1 + 0.15 * env(f, 12, 16, 16, 19)) * (1 - 0.95 * gone)
    d = {'body': {'loc': (0, 0, 0.35 * hop + 0.12 * flip - 0.45 * gone), 'rot': (0, math.pi * flip, 0),
                  'scale': (s * (1 + 0.3 * gone), s * (1 + 0.3 * gone), s * (1 - 0.5 * gone))},
         'shield': {'rot': (-0.6 * flip, 0, 0.2 * flip)}}
    for nm in ('leg_fl', 'leg_fr', 'leg_ml', 'leg_mr', 'leg_bl', 'leg_br'):
        s2 = leg_side(nm)
        d[nm] = {'rot': (0, -s2 * (0.7 * flip + 0.25 * twitch), 0.2 * twitch)}
    return d


acts = [bake(MID, P, 'walk', 16, walk), bake(MID, P, 'attack', 16, attack), bake(MID, P, 'shield_bash', 24, shield_bash),
        bake(MID, P, 'hit', 10, hit), bake(MID, P, 'death', 36, death)]
print(finish(MID, root, P, acts))
