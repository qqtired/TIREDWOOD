# Семечкин — бойкая тыквенно-оранжевая желейка в кепке-восьмиклинке и круглых очках, зелёный фартук с десятком
# кармашков (из каждого торчит пакетик семян), в руке пакетик, в другой — кулёк для шелухи (design-v11 §16.4).
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
import npckit as N
from charkit import C, mix, sstep, bump, win, ease
from npckit import S2, hand_to, lerp3

FID = 'npc-semechkin'
BODY = C('#f68a2e')
CAP = C('#8b7a5e')
CAP_D = C('#6e604a')
APRON = C('#56a64a')
APRON_D = C('#3f8a3a')
TIE = C('#4a9440')
FRAME = C('#5a3a24')
PAPER = C('#f3ede0')
PAPER_L = C('#c9c2b4')
HUSK = C('#2a2626')
PACKETS = ['#e8463c', '#f4c430', '#8e5bd8', '#ff7fb0', '#ffffff', '#6fcf5a', '#ff9a3c', '#e8463c', '#f4c430', '#c04ad0']

HAND = N.HAND_REST
IDLE_L = (-0.45, 0.36, 0.66)     # где левая варежка держит кулёк
CONE_OFF = (0.0, 0.06, 0.07)     # кулёк относительно центра варежки
HUSK_REST = (-HAND[0] + CONE_OFF[0], HAND[1] + CONE_OFF[1], HAND[2] + CONE_OFF[2] + 0.035)
MOUTH_FRONT = (0.0, 0.52, 0.975)


def apron_half(z):
    return 1.15 - 0.5 * sstep(0.6, 0.72, z)


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_jelly', 'farm_soft'], q)
    N.body(m, BODY, seg=32)
    N.eyes(m)
    mouth_at = N.mouth(m)
    N.blush(m, BODY)
    N.mittens(m, BODY)
    rj = K.jelly_r
    # кепка-восьмиклинка: пухлая тулья из 8 клиньев, пуговка, короткий козырёк; чуть набекрень вперёд
    Z0 = 1.31

    def cap_col(co):
        a = math.atan2(co.x, co.y)
        seam = 1 - sstep(0.0, 0.16, abs(math.sin(4 * a)))
        return mix(CAP, CAP_D, 0.75 * seam)
    m.lathe([(0.001, 0.03), (0.34, 0.0), (rj(Z0) + 0.02, 0.0), (0.43, 0.055), (0.458, 0.12), (0.442, 0.19), (0.375, 0.27),
             (0.245, 0.33), (0.001, 0.352)], seg=32, loc=(0, 0.012, Z0), rot=(-6, 0, 0), color=cap_col, mat='farm_soft',
            bone='hat')
    m.sphere(0.032, loc=(0, 0.05, Z0 + 0.352), scale=(1, 1, 0.5), seg=10, ring=6, color=CAP_D, mat='farm_soft', bone='hat')
    m.sphere(0.21, loc=(0, 0.35, Z0 + 0.03), scale=(1.0, 0.85, 0.075), rot=(-14, 0, 0), seg=20, ring=8,
             deform=lambda co: (co.x, max(co.y, 0.0), co.z), color=CAP_D, mat='farm_soft', bone='hat')
    # круглые очки: оправы, перемычка, дужки
    for s in (-1, 1):
        m.torus(0.128, 0.011, loc=(0.13 * s, 0.49, N.EYES_Z), rot=(90, 0, 0), seg=20, rseg=6, color=FRAME,
                mat='farm_jelly', bone='head')
        m.tube([(0.258 * s, 0.49, N.EYES_Z + 0.02), (0.33 * s, 0.36, N.EYES_Z + 0.04), (0.385 * s, 0.18, N.EYES_Z + 0.05)],
               0.009, seg=5, color=FRAME, mat='farm_jelly', bone='head')
    # фартук с нагрудником
    m.shell(rj, 0.26, 0.9, lambda z: -apron_half(z), apron_half, off=0.012, thick=0.012, nz=11, na=14, color=APRON,
            mat='farm_soft', bone=N.jelly_w)
    # лямка вокруг шеи и завязки на поясе с бантом сзади
    def strap(z0, a0, side):
        pts = []
        for i in range(9):
            u = i / 8
            a = (a0 + (math.pi - a0) * u) * side
            z = z0 + (1.27 - z0) * math.sin(u * math.pi / 2)
            r = rj(z) + 0.022
            pts.append((r * math.sin(a), r * math.cos(a), z))
        return pts
    left = strap(0.88, apron_half(0.88), -1)
    right = strap(0.88, apron_half(0.88), 1)
    m.tube(left + list(reversed(right))[1:], 0.016, seg=6, cap=False, color=APRON_D, mat='farm_soft', bone=N.jelly_w)
    zw = 0.64
    aw = apron_half(zw)
    waist = []
    for i in range(17):
        a = aw + (2 * math.pi - 2 * aw) * i / 16
        r = rj(zw) + 0.02
        waist.append((r * math.sin(a), r * math.cos(a), zw))
    m.tube(waist, 0.016, seg=6, cap=False, color=TIE, mat='farm_soft', bone=N.jelly_w)
    by = -(rj(zw) + 0.03)
    for s in (-1, 1):
        m.torus(0.05, 0.014, loc=(0.05 * s, by, zw + 0.01), rot=(90, 0, 0), scale=(1.0, 0.6, 1), seg=12, rseg=5,
                color=TIE, mat='farm_soft', bone='body')
        m.tube([(0.01 * s, by, zw), (0.04 * s, by - 0.01, zw - 0.08), (0.06 * s, by - 0.01, zw - 0.15)], [0.015, 0.014, 0.01],
               seg=5, color=TIE, mat='farm_soft', bone='body')
    m.sphere(0.022, loc=(0, by - 0.005, zw), seg=8, ring=6, color=TIE, mat='farm_soft', bone='body')
    # десять кармашков с пакетиками семян
    rnd = random.Random(11)
    pockets = [(-0.27, 0.76), (0.27, 0.76), (-0.8, 0.5), (-0.27, 0.5), (0.27, 0.5), (0.8, 0.5),
               (-0.8, 0.33), (-0.27, 0.33), (0.27, 0.33), (0.8, 0.33)]
    for i, (a, zc) in enumerate(pockets):
        r = rj(zc)
        da = 0.062 / (r + 0.03)
        m.shell(rj, zc - 0.055, zc + 0.035, a - da, a + da, off=0.026, thick=0.014, nz=2, na=3, color=APRON_D,
                mat='farm_soft', bone=N.jelly_w)
        pc = C(PACKETS[i])
        rr = r + 0.036
        tilt = rnd.uniform(-12, 12)
        m.box((0.07, 0.01, 0.11), loc=(rr * math.sin(a), rr * math.cos(a), zc + 0.065), rot=(0, tilt, -math.degrees(a)),
              color=lambda co, pc=pc, zc=zc: pc if co.z > zc + 0.075 else mix(pc, C('#ffffff'), 0.55), mat='farm_soft',
              bone=N.jelly_w)
    # в правой варежке — пакетик с подсолнухом
    hr = (HAND[0], HAND[1], HAND[2])
    pk = (hr[0], hr[1] + 0.07, hr[2] + 0.1)
    m.box((0.12, 0.022, 0.16), loc=pk, bevel=0.006, bseg=1,
          color=lambda co: C('#e8463c') if co.z < pk[2] + 0.055 else C('#f6efe2'), mat='farm_soft', bone='prop.R')
    m.disc(0.032, loc=(pk[0], pk[1] + 0.0125, pk[2] - 0.01), rot=(-90, 0, 0), seg=12, thick=0.003, color=C('#ffc928'),
           mat='farm_soft', bone='prop.R')
    m.disc(0.013, loc=(pk[0], pk[1] + 0.0145, pk[2] - 0.01), rot=(-90, 0, 0), seg=10, thick=0.003, color=C('#6b3d1e'),
           mat='farm_soft', bone='prop.R')
    # в левой — бумажный кулёк, в нём шелуха
    hl = (-HAND[0] + CONE_OFF[0], HAND[1] + CONE_OFF[1], HAND[2] + CONE_OFF[2])
    m.lathe([(0.001, -0.13), (0.03, -0.08), (0.062, -0.0), (0.08, 0.045), (0.072, 0.05), (0.04, 0.032), (0.001, 0.028)],
            seg=14, loc=hl, rot=(0, 0, 0),
            color=lambda co: HUSK if co.z > hl[2] + 0.03 and math.hypot(co.x - hl[0], co.y - hl[1]) < 0.07 else
            (PAPER_L if (math.sin((co.z - hl[2]) * 140) > 0.75) else PAPER), mat='farm_soft', bone='prop.L')
    # шелушинка (летит изо рта в кулёк)
    m.sphere(0.017, loc=HUSK_REST, scale=(0.6, 1.0, 0.35), seg=8, ring=5,
             color=lambda co: C('#e8e2d6') if abs(co.x - HUSK_REST[0]) < 0.003 else HUSK, mat='farm_soft', bone='husk')
    return m, mouth_at


def make_bones(mouth_at):
    return N.bones([
        ('hat', (0, 0, 1.31), 'head'),
        ('prop.R', HAND, 'hand.R'),
        ('prop.L', (-HAND[0], HAND[1], HAND[2]), 'hand.L'),
        ('husk', HUSK_REST, 'root'),
    ], mouth_at)


def husk_at(hl_off, inside=True):
    """Положение шелушинки в кулке при сдвиге левой варежки hl_off."""
    return hl_off


def idle(t, f):
    d = N.base(t)
    hl = hand_to('L', IDLE_L)
    hr = (0, 0, 0)
    pr = (0, 0, 0)
    mo = 0.06
    hk = hl  # шелушинка лежит в кулке
    head = (0, 0, 0)
    for c0 in (0.04, 0.54):
        u = (t - c0) / 0.4
        if not (0 <= u <= 1):
            continue
        k = win(u, 0.0, 0.78, 0.2)
        hr = hand_to('R', lerp3(HAND, (0.22, 0.6, 0.97), k))
        pr = (-48 * k, 0, 26 * k)
        mo = 0.06 + 0.55 * (bump(u, 0.24, 0.36) + bump(u, 0.38, 0.5))
        k2 = win(u, 0.46, 0.92, 0.12)
        hl = hand_to('L', lerp3(IDLE_L, (-0.36, 0.46, 0.76), k2))
        head = (-4 * k, 0, -8 * k)
        # шелуха: изо рта дугой в кулёк
        v = (u - 0.56) / 0.2
        cone_top = (IDLE_L[0] + CONE_OFF[0], IDLE_L[1] + CONE_OFF[1], IDLE_L[2] + CONE_OFF[2] + 0.035)
        cone_top = lerp3(cone_top, (-0.36 + CONE_OFF[0], 0.46 + CONE_OFF[1], 0.76 + CONE_OFF[2] + 0.035), k2)
        if 0 < v < 1:
            p = lerp3(MOUTH_FRONT, cone_top, ease(v))
            p = (p[0], p[1] + 0.06 * math.sin(math.pi * v), p[2] + 0.12 * math.sin(math.pi * v))
            hk = tuple(p[i] - HUSK_REST[i] for i in range(3))
        else:
            hk = tuple(cone_top[i] - HUSK_REST[i] for i in range(3))
    out = N.merge(d, {
        'hand.L': {'loc': hl}, 'hand.R': {'loc': hr}, 'prop.R': {'rot': pr},
        'head': {'rot': head}, 'husk': {'loc': hk, 'rot': (0, 0, 720 * t)},
    })
    out['mouth'] = {'sc': (0.9, 1, mo)}
    return out


def greet(t, f):
    k = win(t, 0.0, 1.0, 0.2)
    w = math.sin(S2 * 4 * t) * k
    d = N.base(t, blinks=(0.9,))
    hr = hand_to('R', lerp3(HAND, (0.56, 0.3, 1.42), k))
    out = N.merge(d, N.happy_eyes(0.7 * k), {
        'hand.R': {'loc': (hr[0] + 0.07 * w, hr[1], hr[2] + 0.03 * abs(w))},
        'prop.R': {'rot': (0, 0, 28 * w)},
        'hand.L': {'loc': hand_to('L', IDLE_L)},
        'chest': {'rot': (0, 4 * k, 0)},
        'head': {'rot': (0, 3 * k, -6 * k)},
        'body': {'sc': (1, 1, 1 + 0.02 * math.sin(S2 * 4 * t) * k)},
        'husk': {'loc': hand_to('L', IDLE_L)},
    })
    out['mouth'] = {'sc': (0.9, 1, 0.06 + 0.6 * win(t, 0.15, 0.7, 0.1))}
    return out


def talk(t, f):
    d = N.base(t, blinks=(0.3, 0.75))
    g = math.sin(S2 * 2 * t)
    hr = hand_to('R', (0.5 + 0.05 * g, 0.36, 0.72 + 0.07 * abs(g)))
    hl = hand_to('L', (IDLE_L[0] - 0.02 * math.sin(S2 * 2 * t + 1), IDLE_L[1], IDLE_L[2] + 0.03 * abs(math.sin(S2 * 2 * t + 1))))
    out = N.merge(d, {
        'hand.R': {'loc': hr}, 'hand.L': {'loc': hl},
        'prop.R': {'rot': (-15 + 12 * g, 0, 10 * g)},
        'chest': {'rot': (3 * math.sin(S2 * 3 * t), 0, 2 * math.sin(S2 * t))},
        'head': {'rot': (3 * math.sin(S2 * 4 * t), 0, 4 * math.sin(S2 * t))},
        'husk': {'loc': hl},
    })
    out['mouth'] = {'sc': (0.9, 1, N.talk_mouth(t, 6))}
    return out


def point(t, f):
    k = win(t, 0.0, 1.0, 0.18)
    jab = bump(t, 0.34, 0.47) + bump(t, 0.55, 0.68)
    d = N.base(t, blinks=(0.9,))
    hr = hand_to('R', lerp3(HAND, (0.6, 0.8, 0.74), k))
    out = N.merge(d, {
        'hand.R': {'loc': (hr[0] + 0.02 * jab, hr[1] + 0.06 * jab, hr[2] - 0.03 * jab)},
        'prop.R': {'rot': (-72 * k, 0, -10 * k)},
        'hand.L': {'loc': hand_to('L', IDLE_L)},
        'head': {'rot': (-10 * k, 0, -18 * k)},
        'chest': {'rot': (-4 * k, 3 * k, -6 * k)},
        'husk': {'loc': hand_to('L', IDLE_L)},
    })
    out['mouth'] = {'sc': (0.9, 1, 0.06 + 0.35 * k * (0.6 + 0.4 * jab))}
    return out


def happy(t, f):
    d = N.base(t, blinks=())
    dip = win(t, 0.0, 0.17, 0.08)
    up = sstep(0.12, 0.24, t) * (1 - sstep(0.82, 1.0, t))
    pos = lerp3(HAND, (0.55, 0.32, 0.58), dip)
    pos = lerp3(pos, (0.48, 0.36, 0.98), up)
    catch = bump(t, 0.7, 0.82)
    hr = hand_to('R', (pos[0], pos[1], pos[2] - 0.05 * catch))
    u = (t - 0.22) / 0.48
    fly = math.sin(math.pi * u) if 0 < u < 1 else 0.0
    hop = math.sin(math.pi * (t - 0.74) / 0.22) if 0.74 < t < 0.96 else 0.0
    hl = hand_to('L', lerp3(IDLE_L, (-0.5, 0.3, 0.92), win(t, 0.15, 0.95, 0.15)))
    out = N.merge(d, N.happy_eyes(0.75 * win(t, 0.05, 0.98, 0.08)), {
        'hand.R': {'loc': hr},
        'prop.R': {'loc': (0, 0, 0.78 * fly), 'rot': (720 * ease(u) if u > 0 else 0, 0, 0)},
        'hand.L': {'loc': hl},
        'root': {'loc': (0, 0, 0.07 * hop)},
        'body': {'sc': (1 + 0.04 * catch, 1 + 0.04 * catch, 1 - 0.07 * catch + 0.04 * hop)},
        'head': {'rot': (8 * fly, 0, 0)},
        'husk': {'loc': hl},
    })
    out['mouth'] = {'sc': (0.9, 1, 0.06 + 0.75 * win(t, 0.2, 0.95, 0.1))}
    return out


ANIMS = [('idle', 120, idle), ('greet', 60, greet), ('talk', 90, talk), ('point', 60, point), ('happy', 48, happy)]


def main():
    K.reset()
    m, mouth_at = build(1.0)
    arm = K.armature(FID + '_rig', make_bones(mouth_at))
    ob = m.object(arm)
    acts = [K.bake(arm, n, fr, fn) for n, fr, fn in ANIMS]
    K.report(FID, [ob], arm, acts)
    K.save_blend(FID)
    K.export_glb(FID, [arm, ob])
    N.render_set(FID, arm, acts, frames={'greet': (0, 18, 30, 42), 'point': (0, 14, 24, 36), 'happy': (4, 14, 24, 34)})
    K.save_blend(FID)


if __name__ == '__main__':
    main()
