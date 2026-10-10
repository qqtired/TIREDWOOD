# spitter — плевун, жаба (~1 м) с мешками-щеками из варенья.
# Части: body, head, jaw, sac, leg_fl, leg_fr, leg_bl, leg_br.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'spitter'
clean_scene()


def flat(z0, k=0.3):
    def fn(p):
        if p.z < z0:
            p.z = z0 + (p.z - z0) * k
        return p
    return fn


body = Part('body', (0, 0.08, 0.30))
body.tube('toad', [(0, -0.20, 0.40), (0, 0.0, 0.38), (0, 0.20, 0.31), (0, 0.36, 0.22)],
          [(0.30, 0.24), (0.35, 0.27), (0.33, 0.23), (0.20, 0.14)], seg=14, n=6, fn=flat(0.12), cap_k=0.7)
body.splat((0.10, 0.10, 0.65), 0.17, 0.018, seg=12, rings=2, seed=0.4)
body.splat((-0.16, 0.25, 0.52), 0.12, 0.015, seg=10, rings=2, seed=1.4)
body.ellipsoid('flesh', (0, -0.14, 0.21), (0.27, 0.19, 0.15), seg=10, rings=5)
body.bead((0.08, 0.08, 0.66), 0.04, seg=8, rings=4)
body.bead((-0.2, 0.0, 0.6), 0.035, seg=8, rings=4)

head = Part('head', (0, -0.22, 0.45))
head.ellipsoid('toad', (0, -0.38, 0.47), (0.30, 0.22, 0.15), seg=14, rings=7, unit_fn=lambda v: Vector((v.x, v.y, v.z if v.z > 0 else v.z * 0.6)))
for sx in (-1, 1):
    head.ellipsoid('toad', (sx * 0.16, -0.40, 0.585), (0.09, 0.085, 0.075), seg=8, rings=5)
    head.ellipsoid('eye', (sx * 0.17, -0.445, 0.615), 0.066, seg=8, rings=5)
head.splat((0.0, -0.3, 0.62), 0.09, 0.012, seg=10, rings=2, seed=2.2)

jaw = Part('jaw', (0, -0.24, 0.40))
jaw.ellipsoid('toad', (0, -0.40, 0.385), (0.27, 0.20, 0.07), seg=12, rings=5)
jaw.ellipsoid('jam', (0, -0.42, 0.43), (0.15, 0.13, 0.03), seg=8, rings=4)

sac = Part('sac', (0, -0.44, 0.36))
for sx in (-1, 1):
    sac.ellipsoid('jam_gel', (sx * 0.215, -0.49, 0.34), (0.20, 0.18, 0.17), seg=12, rings=7)
    sac.drip((sx * 0.26, -0.60, 0.25), 0.11, 0.03, key='jam', seg=6)
sac.bead((0.27, -0.52, 0.45), 0.035, key='jam', seg=8, rings=4)

legs = []
for nm, sx in (('leg_fl', 1), ('leg_fr', -1)):
    lg = Part(nm, (sx * 0.25, -0.18, 0.26))
    lg.tube('toad', [(sx * 0.25, -0.18, 0.28), (sx * 0.31, -0.28, 0.14), (sx * 0.33, -0.36, 0.04)], [0.08, 0.06, 0.045],
            seg=7, caps=('round', 'none'))
    lg.ellipsoid('toad', (sx * 0.34, -0.40, 0.025), (0.09, 0.10, 0.025), seg=8, rings=4)
    legs.append(lg)
for nm, sx in (('leg_bl', 1), ('leg_br', -1)):
    lg = Part(nm, (sx * 0.28, 0.20, 0.24))
    lg.ellipsoid('toad', (sx * 0.34, 0.15, 0.22), (0.13, 0.24, 0.15), seg=8, rings=5, rot=(0.35, 0, sx * 0.15))
    lg.tube('toad', [(sx * 0.40, 0.04, 0.11), (sx * 0.42, -0.12, 0.04)], [0.055, 0.045], seg=7, caps=('round', 'none'))
    lg.ellipsoid('toad', (sx * 0.43, -0.14, 0.025), (0.10, 0.16, 0.025), seg=8, rings=4)
    legs.append(lg)

root, P = build_parts(MID, [(body, None), (head, 'body'), (jaw, 'head'), (sac, 'head')] + [(l, 'body') for l in legs])


def walk(f):
    # прыжок на месте (перемещение даёт игра): присед 0-5, полёт 5-12, приземление 12-16
    crouch = env(f, 0, 4, 4, 6) + env(f, 12, 15, 15, 20) * 0.7
    air = env(f, 5, 8, 9, 13)
    return {
        'body': {'loc': (0, 0, -0.04 * crouch + 0.14 * air), 'rot': (-0.12 * air + 0.06 * crouch, 0, 0)},
        'head': {'rot': (0.08 * air - 0.05 * crouch, 0, 0)},
        'sac': {'scale': (1 + 0.06 * crouch - 0.04 * air, 1, 1 - 0.06 * crouch + 0.06 * air)},
        'leg_fl': {'rot': (-0.45 * air, 0, 0)},
        'leg_fr': {'rot': (-0.45 * air, 0, 0)},
        'leg_bl': {'rot': (0.55 * air, 0, 0), 'loc': (0, 0.06 * air, -0.1 * air)},
        'leg_br': {'rot': (0.55 * air, 0, 0), 'loc': (0, 0.06 * air, -0.1 * air)},
    }


def attack(f):
    back = env(f, 0, 4, 4, 6)
    lunge = env(f, 5, 7, 8, 14)
    return {
        'body': {'loc': (0, 0.03 * back - 0.1 * lunge, 0), 'rot': (-0.05 * back + 0.12 * lunge, 0, 0)},
        'head': {'rot': (-0.15 * back + 0.1 * lunge, 0, 0)},
        'jaw': {'rot': (0.55 * env(f, 3, 6, 6, 8), 0, 0)},
        'sac': {'scale': 1 + 0.1 * lunge},
        'leg_fl': {'rot': (-0.3 * lunge, 0, 0)},
        'leg_fr': {'rot': (-0.3 * lunge, 0, 0)},
    }


def spit(f):
    # надув 0-10, плевок на 12-м кадре (0,5 с), отдача и возврат к 24
    inflate = ramp(f, 0, 10) * (1 - ramp(f, 11, 13))
    shot = env(f, 11, 12, 13, 18)
    tilt = env(f, 2, 10, 10, 13)
    return {
        'body': {'loc': (0, 0.04 * shot, 0.02 * tilt), 'rot': (-0.1 * tilt + 0.06 * shot, 0, 0)},
        'head': {'rot': (-0.3 * tilt + 0.25 * shot, 0, 0)},
        'jaw': {'rot': (0.65 * env(f, 10, 12, 14, 18), 0, 0)},
        'sac': {'scale': (1 + 0.45 * inflate - 0.25 * shot, 1 + 0.35 * inflate - 0.2 * shot, 1 + 0.4 * inflate - 0.2 * shot)},
        'leg_fl': {'rot': (0.15 * shot, 0, 0)},
        'leg_fr': {'rot': (0.15 * shot, 0, 0)},
    }


def hit(f):
    k = env(f, 0, 2, 3, 10)
    return {
        'body': {'loc': (0, 0.06 * k, 0), 'rot': (-0.15 * k, 0, 0.1 * k), 'scale': (1 + 0.06 * k, 1, 1 - 0.08 * k)},
        'head': {'rot': (-0.2 * k, 0, 0)},
        'sac': {'scale': (1 + 0.15 * k, 1, 1 - 0.15 * k)},
    }


def death(f):
    swell = ramp(f, 0, 10)
    burst = ramp(f, 10, 13)
    gone = ramp(f, 14, 36)
    s = (1 + 0.1 * env(f, 8, 11, 11, 14)) * (1 - 0.95 * gone)
    return {
        'body': {'loc': (0, 0, -0.2 * gone), 'rot': (0.1 * gone, 0, 0.15 * ramp(f, 6, 14)),
                 'scale': (s * (1 + 0.4 * gone), s * (1 + 0.3 * gone), s * (1 - 0.5 * gone))},
        'head': {'rot': (0.25 * ramp(f, 10, 18), 0, 0)},
        'jaw': {'rot': (0.5 * env(f, 4, 10, 14, 22), 0, 0)},
        'sac': {'scale': max(0.02, (1 + 0.7 * swell) * (1 - 0.98 * burst))},
        'leg_fl': {'rot': (0, 0.5 * gone, 0)},
        'leg_fr': {'rot': (0, -0.5 * gone, 0)},
    }


acts = [bake(MID, P, 'walk', 20, walk), bake(MID, P, 'attack', 14, attack), bake(MID, P, 'spit', 24, spit),
        bake(MID, P, 'hit', 10, hit), bake(MID, P, 'death', 36, death)]
print(finish(MID, root, P, acts))
