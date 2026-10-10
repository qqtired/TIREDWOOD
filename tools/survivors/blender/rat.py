# rat — погребная крыса (~1,0 м с хвостом). Части: body, head, leg_fl/fr/bl/br, tail_1, tail_2.
# Геометрия задана в «старом» масштабе 0,74 м и увеличена MODEL_SCALE.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

MID = 'rat'
MODEL_SCALE = 1.35
clean_scene()

# ---- тело: сутулая спина, тяжёлый круп
body = Part('body', (0, 0.0, 0.13))
body.tube('fur', [(0, -0.14, 0.122), (0, -0.075, 0.138), (0, 0.0, 0.152), (0, 0.07, 0.150), (0, 0.12, 0.128),
                  (0, 0.155, 0.105)],
          [(0.055, 0.052), (0.074, 0.072), (0.086, 0.086), (0.092, 0.084), (0.078, 0.07), (0.044, 0.042)],
          seg=12, n=8, cap_k=0.8)
body.splat((0.012, -0.02, 0.24), 0.075, 0.012, seg=12, seed=1.0, stretch=(0.85, 1.25))
body.splat((-0.04, 0.085, 0.228), 0.05, 0.01, seg=10, seed=2.3)
body.splat((0.075, 0.06, 0.18), 0.04, 0.008, seg=10, rings=2, seed=3.1)
body.bead((0.01, -0.03, 0.246), 0.017, seg=7, rings=4)
body.bead((-0.045, 0.09, 0.232), 0.014, seg=6, rings=4)
body.drip((0.088, 0.04, 0.165), 0.06, 0.012)

# ---- голова: череп + вытянутая морда, уши с розовой серединой
head = Part('head', (0, -0.11, 0.15))
head.ellipsoid('fur', (0, -0.15, 0.158), (0.058, 0.068, 0.054), seg=10, rings=6)
head.tube('fur', [(0, -0.17, 0.152), (0, -0.225, 0.137), (0, -0.272, 0.118), (0, -0.298, 0.106)],
          [(0.047, 0.042), (0.036, 0.032), (0.024, 0.021), (0.013, 0.012)], seg=10, n=5,
          caps=('none', 'round'), cap_steps=1)
for sx in (-1, 1):
    head.ellipsoid('fur', (sx * 0.05, -0.128, 0.208), (0.036, 0.011, 0.04), seg=8, rings=5, rot=(0.25, sx * 0.35, sx * 0.35))
    head.ellipsoid('flesh', (sx * 0.049, -0.137, 0.207), (0.026, 0.006, 0.029), seg=8, rings=4, rot=(0.25, sx * 0.35, sx * 0.35))
    head.ellipsoid('eye', (sx * 0.036, -0.2, 0.168), 0.017, seg=8, rings=5)
    head.ellipsoid('cream', (sx * 0.006, -0.288, 0.093), (0.005, 0.004, 0.012), seg=4, rings=3)
head.ellipsoid('flesh', (0, -0.305, 0.107), (0.015, 0.012, 0.012), seg=6, rings=4)
head.splat((0.0, -0.16, 0.212), 0.03, 0.006, seg=10, rings=2, seed=4.2)

# ---- лапы: плечо/бедро + голень + розовая кисть
legs = []
for nm, sx, fy in (('leg_fl', 1, -1), ('leg_fr', -1, -1), ('leg_bl', 1, 1), ('leg_br', -1, 1)):
    if fy < 0:
        lg = Part(nm, (sx * 0.055, -0.08, 0.105))
        lg.ellipsoid('fur', (sx * 0.06, -0.085, 0.10), (0.032, 0.038, 0.042), seg=7, rings=4)
        lg.tube('fur', [(sx * 0.064, -0.09, 0.07), (sx * 0.068, -0.10, 0.035), (sx * 0.068, -0.108, 0.014)],
                [0.019, 0.015, 0.012], seg=6, caps=('none', 'none'))
        lg.ellipsoid('flesh', (sx * 0.068, -0.122, 0.009), (0.022, 0.032, 0.009), seg=7, rings=4)
    else:
        lg = Part(nm, (sx * 0.06, 0.075, 0.11))
        lg.ellipsoid('fur', (sx * 0.066, 0.075, 0.102), (0.04, 0.058, 0.056), seg=8, rings=5)
        lg.tube('fur', [(sx * 0.072, 0.11, 0.07), (sx * 0.074, 0.10, 0.02)], [0.018, 0.014], seg=6,
                caps=('none', 'none'))
        lg.ellipsoid('flesh', (sx * 0.074, 0.07, 0.009), (0.022, 0.045, 0.009), seg=7, rings=4)
    legs.append(lg)

# ---- хвост
t1 = Part('tail_1', (0, 0.15, 0.10))
t1.tube('flesh', [(0, 0.135, 0.105), (0, 0.20, 0.085), (0.018, 0.27, 0.062)], [0.026, 0.019, 0.013], seg=7, n=5,
        caps=('none', 'round'), cap_steps=1)
t2 = Part('tail_2', (0.018, 0.27, 0.062))
t2.tube('flesh', [(0.018, 0.265, 0.063), (0.05, 0.34, 0.045), (0.03, 0.42, 0.03)], [0.013, 0.008, 0.004], seg=6, n=5,
        caps=('round', 'round'), cap_steps=1)

root, P = build_parts(MID, [(body, None), (head, 'body')] + [(l, 'body') for l in legs] +
                      [(t1, 'body'), (t2, 'tail_1')])


# ---- анимации (24 fps), смещения в «старом» масштабе — bake умножит на MODEL_SCALE
def walk(f):
    N = 12
    d = {
        'body': {'loc': (0, 0, 0.007 * cw(f, N / 2)), 'rot': (0.03 * sw(f, N / 2), 0.05 * sw(f, N), 0.04 * sw(f, N, 0.25))},
        'head': {'rot': (0.07 * sw(f, N / 2, 0.25), 0, -0.05 * sw(f, N, 0.25))},
        'tail_1': {'rot': (0, 0, 0.28 * sw(f, N, 0.1))},
        'tail_2': {'rot': (0.05 * sw(f, N / 2), 0, 0.4 * sw(f, N, -0.05))},
    }
    for nm, ph in (('leg_fl', 0.0), ('leg_br', 0.0), ('leg_fr', 0.5), ('leg_bl', 0.5)):
        d[nm] = {'rot': (0.65 * sw(f, N, ph), 0, 0), 'loc': (0, 0, 0.012 * max(0.0, cw(f, N, ph)))}
    return d


def attack(f):
    crouch = env(f, 0, 4, 4, 7)
    lunge = env(f, 4, 7, 8, 14)
    return {
        'body': {'loc': (0, 0.035 * crouch - 0.09 * lunge, -0.015 * crouch + 0.01 * lunge),
                 'rot': (-0.12 * crouch + 0.1 * lunge, 0, 0)},
        'head': {'rot': (-0.35 * crouch + 0.45 * lunge, 0, 0)},
        'leg_fl': {'rot': (-0.5 * lunge + 0.2 * crouch, 0, 0)},
        'leg_fr': {'rot': (-0.5 * lunge + 0.2 * crouch, 0, 0)},
        'leg_bl': {'rot': (0.6 * lunge - 0.3 * crouch, 0, 0)},
        'leg_br': {'rot': (0.6 * lunge - 0.3 * crouch, 0, 0)},
        'tail_1': {'rot': (0.25 * lunge, 0, 0.2 * crouch)},
        'tail_2': {'rot': (0.3 * lunge, 0, -0.3 * crouch)},
    }


def hit(f):
    k = env(f, 0, 2, 3, 8)
    return {
        'body': {'loc': (0, 0.05 * k, 0.01 * k), 'rot': (-0.3 * k, 0, 0.15 * k),
                 'scale': (1 + 0.12 * k, 1 - 0.12 * k, 1 - 0.1 * k)},
        'head': {'rot': (-0.35 * k, 0, 0.2 * k)},
        'tail_1': {'rot': (0.4 * k, 0, 0)},
    }


def death(f):
    flip = ramp(f, 0, 9)
    hop = math.sin(math.pi * min(1.0, f / 9.0))
    swell = env(f, 9, 14, 14, 18)
    gone = ramp(f, 14, 30)
    s = (1 + 0.25 * swell) * (1 - 0.96 * gone)
    return {
        'body': {'loc': (0, 0.02 * flip, 0.06 * hop - 0.05 * flip - 0.06 * gone),
                 'rot': (0, 1.5 * flip, 0.3 * flip),
                 'scale': (s * (1 + 0.5 * gone), s * (1 + 0.3 * gone), s * (1 - 0.4 * gone))},
        'head': {'rot': (-0.4 * flip, 0, 0.3 * flip)},
        'leg_fl': {'rot': (-0.9 * flip, 0, 0)},
        'leg_fr': {'rot': (-0.7 * flip, 0, 0)},
        'leg_bl': {'rot': (0.8 * flip, 0, 0)},
        'leg_br': {'rot': (0.9 * flip, 0, 0)},
        'tail_1': {'rot': (0, 0, 0.6 * flip)},
        'tail_2': {'rot': (0, 0, 0.8 * flip)},
    }


acts = [bake(MID, P, 'walk', 12, walk), bake(MID, P, 'attack', 14, attack), bake(MID, P, 'hit', 8, hit),
        bake(MID, P, 'death', 30, death)]
print(finish(MID, root, P, acts))
