# bat — летучая мышь (размах ~1 м, тело на высоте ~1,2 м, origin корня на полу).
# Части: body, head, wing_l, wing_r, wingtip_l, wingtip_r.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'bat'
clean_scene()
H = 1.2

body = Part('body', (0, 0.0, H))
body.ellipsoid('fur', (0, 0.03, H - 0.01), (0.085, 0.135, 0.085), seg=10, rings=6,
               unit_fn=lambda v: Vector((v.x * (1 - 0.25 * max(v.y, 0)), v.y, v.z * (1 - 0.2 * max(v.y, 0)))))
for sx in (-1, 1):
    body.tube('flesh', [(sx * 0.035, 0.10, H - 0.05), (sx * 0.05, 0.17, H - 0.10), (sx * 0.05, 0.20, H - 0.15)],
              [0.016, 0.012, 0.01], seg=5, caps=('none', 'round'), cap_steps=1)
body.splat((0.02, 0.03, H + 0.09), 0.07, 0.01, seg=10, rings=2, seed=0.3)
body.drip((0.05, 0.05, H - 0.07), 0.08, 0.016, seg=5)

head = Part('head', (0, -0.09, H + 0.03))
head.ellipsoid('fur', (0, -0.15, H + 0.045), (0.075, 0.07, 0.068), seg=10, rings=6)
head.ellipsoid('fur', (0, -0.21, H + 0.025), (0.038, 0.04, 0.03), seg=8, rings=4)
for sx in (-1, 1):
    head.ellipsoid('flesh', (sx * 0.055, -0.13, H + 0.14), (0.04, 0.012, 0.085), seg=6, rings=4,
                   rot=(0.15, sx * 0.25, sx * -0.35))
    head.ellipsoid('eye', (sx * 0.035, -0.205, H + 0.07), 0.024, seg=6, rings=4)


def inner_pos(sx):
    def pos(u, v):
        x = 0.07 + 0.22 * u
        yl = -0.03 - 0.02 * u
        yt = lerp(0.15, 0.22, u) - 0.075 * math.sin(math.pi * u)
        z = H + 0.03 + 0.03 * math.sin(math.pi * u) - 0.015 * v
        return Vector((sx * x, lerp(yl, yt, v), z))
    return pos


def tip_pos(sx):
    def pos(u, v):
        x = 0.29 + 0.23 * u
        yl = lerp(-0.05, 0.04, u * u)
        yt = lerp(0.22, 0.04, u) - 0.095 * abs(math.sin(2 * math.pi * u)) * (1 - u * 0.3)
        z = H + 0.03 - 0.02 * u - 0.012 * v
        return Vector((sx * x, lerp(yl, yt, v), z))
    return pos


wings = []
for sx, nm, tn in ((1, 'wing_l', 'wingtip_l'), (-1, 'wing_r', 'wingtip_r')):
    w = Part(nm, (sx * 0.07, -0.03, H + 0.03))
    w.sheet('membrane', 6, 3, inner_pos(sx), lambda u, v: Vector((0, 0, -0.012)))
    w.tube('fur', [(sx * 0.06, -0.03, H + 0.03), (sx * 0.18, -0.045, H + 0.06), (sx * 0.29, -0.05, H + 0.035)],
           [0.024, 0.018, 0.016], seg=5, caps=('round', 'round'), cap_steps=1)
    w.splat((sx * 0.19, 0.06, H + 0.07), 0.06, 0.006, seg=10, rings=2, seed=1.1 + sx)
    t = Part(tn, (sx * 0.29, -0.05, H + 0.035))
    t.sheet('membrane', 6, 3, tip_pos(sx), lambda u, v: Vector((0, 0, -0.012)))
    t.tube('fur', [(sx * 0.29, -0.05, H + 0.035), (sx * 0.42, -0.03, H + 0.02), (sx * 0.53, 0.04, H + 0.0)],
           [0.015, 0.01, 0.005], seg=5, caps=('round', 'round'), cap_steps=1)
    for fu in (0.5, 0.0):
        t.tube('fur', [(sx * 0.30, -0.045, H + 0.03), tip_pos(sx)(fu, 0.97) + Vector((0, 0, 0.004))], [0.009, 0.005], seg=4, caps=('none', 'none'))
    t.ellipsoid('horn', (sx * 0.29, -0.065, H + 0.05), (0.012, 0.025, 0.012), seg=5, rings=3, rot=(0.6, 0, 0))
    t.splat((sx * 0.38, 0.06, H + 0.03), 0.05, 0.005, seg=8, rings=2, seed=2.7 + sx)
    wings.append((w, t))

root, P = build_parts(MID, [(body, None), (head, 'body'), (wings[0][0], 'body'), (wings[1][0], 'body'),
                            (wings[0][1], 'wing_l'), (wings[1][1], 'wing_r')])


def fly(f):
    N = 12
    s = sw(f, N)
    return {
        'body': {'loc': (0, 0, -0.05 * sw(f, N, 0.25)), 'rot': (0.06 * sw(f, N, 0.1), 0, 0)},
        'head': {'rot': (-0.08 * sw(f, N, 0.1), 0, 0)},
        'wing_l': {'rot': (0, 0.75 * s, 0.05 * cw(f, N))},
        'wing_r': {'rot': (0, -0.75 * s, -0.05 * cw(f, N))},
        'wingtip_l': {'rot': (0, 0.55 * sw(f, N, -0.12), 0)},
        'wingtip_r': {'rot': (0, -0.55 * sw(f, N, -0.12), 0)},
    }


def attack(f):
    # пике-укус: подтянуть крылья, нырнуть вперёд-вниз, вернуться
    dive = env(f, 2, 7, 8, 16)
    bite = env(f, 6, 8, 8, 11)
    flap = sw(f, 8)
    return {
        'body': {'loc': (0, -0.35 * dive, -0.45 * dive), 'rot': (0.5 * dive, 0, 0)},
        'head': {'rot': (-0.3 * dive + 0.35 * bite, 0, 0)},
        'wing_l': {'rot': (0, -0.5 * dive + 0.5 * flap * (1 - dive), 0.5 * dive)},
        'wing_r': {'rot': (0, 0.5 * dive - 0.5 * flap * (1 - dive), -0.5 * dive)},
        'wingtip_l': {'rot': (0, -0.6 * dive, 0.4 * dive)},
        'wingtip_r': {'rot': (0, 0.6 * dive, -0.4 * dive)},
    }


def hit(f):
    k = env(f, 0, 2, 2, 8)
    return {
        'body': {'loc': (0, 0.12 * k, 0.08 * k), 'rot': (-0.5 * k, 0.3 * k, 0)},
        'head': {'rot': (-0.3 * k, 0, 0)},
        'wing_l': {'rot': (0, -0.6 * k, 0)},
        'wing_r': {'rot': (0, 0.6 * k, 0)},
        'wingtip_l': {'rot': (0, -0.5 * k, 0)},
        'wingtip_r': {'rot': (0, 0.5 * k, 0)},
    }


def death(f):
    fall = ramp(f, 2, 14)
    fold = ramp(f, 0, 8)
    gone = ramp(f, 16, 30)
    drop = (min(1.0, max(0.0, (f - 2) / 12.0))) ** 2
    bounce = 0.05 * math.sin(math.pi * min(1.0, max(0.0, (f - 14) / 4.0)))
    s = (1 + 0.2 * env(f, 14, 16, 16, 18)) * (1 - 0.95 * gone)
    return {
        'body': {'loc': (0, 0.1 * fall, -(H - 0.07) * drop + bounce), 'rot': (0.4 * fall, 1.2 * fall, 2.2 * fall),
                 'scale': (s * (1 + 0.5 * gone), s * (1 + 0.5 * gone), s * (1 - 0.5 * gone))},
        'head': {'rot': (0.4 * fold, 0, 0)},
        'wing_l': {'rot': (0, -1.0 * fold, 0.6 * fold)},
        'wing_r': {'rot': (0, 1.0 * fold, -0.6 * fold)},
        'wingtip_l': {'rot': (0, -1.3 * fold, 0.5 * fold)},
        'wingtip_r': {'rot': (0, 1.3 * fold, -0.5 * fold)},
    }


acts = [bake(MID, P, 'fly', 12, fly), bake(MID, P, 'attack', 16, attack), bake(MID, P, 'hit', 8, hit),
        bake(MID, P, 'death', 30, death)]
print(finish(MID, root, P, acts))
