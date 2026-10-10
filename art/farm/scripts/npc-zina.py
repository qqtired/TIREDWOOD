# Тётя Зина — румяная вишнёвая желейка в косынке в горошек, с блокнотом; видна по пояс в окошке Фургона
# (design-v11 §16.4). Срез тела на 0,55 м от пола фургона, начало координат — пол (рост как у всех желеек).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
import npckit as N
from charkit import C, mix, sstep, bump, win, ease
from npckit import S2, hand_to, lerp3
from mathutils import Vector, Matrix, Euler

FID = 'npc-zina'
BODY = C('#c8304c')
SCARF = C('#fff6ea')
DOT = C('#d8344f')
NOTE = C('#3f8f86')
PAPER = C('#fbf8ef')
RING = C('#9a9a9a')
PENCIL = C('#f2c230')
WOOD = C('#e8c99a')
LEAD = C('#3a3434')
BRASS = C('#e2b24a')
HANDLE = C('#8a5530')
CUT = 0.55

HAND = N.HAND_REST
HL_REST = (-HAND[0], HAND[1], HAND[2])
NOTE_C = (HL_REST[0] + 0.1, HL_REST[1] + 0.08, HL_REST[2] + 0.1)
NOTE_ROT = 120
R_NOTE = Euler((math.radians(NOTE_ROT), 0, 0)).to_matrix()
HINGE = tuple(Vector(NOTE_C) + R_NOTE @ Vector((0, 0.0, 0.1)))
IDLE_L = (-0.28, 0.5, 0.82)
IDLE_R = (0.24, 0.46, 0.76)


def build(q=1.0, name=FID):
    m = K.Mesh(name, ['farm_jelly', 'farm_soft', 'farm_metal'], q)
    rj = K.jelly_r
    N.body(m, BODY, cut=CUT, seg=24)
    N.eyes(m, seg=11, ring=8, pseg=9, pring=7)
    mouth_at = N.mouth(m, seg=10, ring=7)
    N.blush(m, BODY, amt=0.62)
    N.mittens(m, BODY, seg=10, ring=7)
    # косынка в горошек: край над бровями, по бокам опускается за глаза, сзади узел и два конца
    def zb(a):
        aa = abs(a)
        return 1.31 - 0.2 * sstep(0.5, 1.45, aa) + 0.1 * sstep(1.9, 2.8, aa)
    m.hood(rj, zb, 1.58, off=0.022, seg=24, rings=8, color=SCARF, mat='farm_soft', bone='hat')
    rim = []
    for j in range(25):
        a = 2 * math.pi * j / 24
        aa = a if a <= math.pi else a - 2 * math.pi
        z = zb(aa)
        r = rj(z) + 0.026
        rim.append((r * math.sin(a), r * math.cos(a), z))
    m.tube(rim, 0.016, seg=4, cap=False, color=SCARF, mat='farm_soft', bone='hat')
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(10):
        a = i * golden + 0.35
        aa = math.atan2(math.sin(a), math.cos(a))
        z0 = zb(aa) + 0.05
        z = z0 + (1.53 - z0) * ((i + 0.5) / 10) ** 0.7
        r = rj(z) + 0.023
        p = Vector((r * math.sin(a), r * math.cos(a), z))
        n = Vector((p.x, p.y, (z - 1.05) * 0.9)).normalized()
        m.disc(0.024, loc=p, rot=N.align_rot(n), seg=6, thick=0.01, color=DOT, mat='farm_soft', bone='hat')
    Z0 = zb(math.pi)
    ky = -(rj(Z0) + 0.035)
    m.sphere(0.045, loc=(0, ky, Z0 - 0.01), scale=(1.1, 0.8, 0.9), seg=10, ring=7, color=SCARF, mat='farm_soft',
             bone='hat')
    for s in (-1, 1):
        m.sphere(0.06, loc=(0.045 * s, ky - 0.02, Z0 - 0.09), scale=(0.55, 0.22, 1.0), rot=(-18, 18 * s, 0), seg=10,
                 ring=6, deform=lambda co: (co.x * (1 - 0.6 * max(0.0, -co.z / 0.06)), co.y, co.z), color=SCARF,
                 mat='farm_soft', bone='scarf')
    # блокнот (в левой варежке) с пружинкой и листком, который перелистывается
    nc = Vector(NOTE_C)

    def note_pt(x, y, z):
        return tuple(nc + R_NOTE @ Vector((x, y, z)))
    m.box((0.15, 0.014, 0.2), loc=NOTE_C, rot=(NOTE_ROT, 0, 0), color=lambda co: NOTE, mat='farm_soft', bone='note')
    m.box((0.138, 0.006, 0.186), loc=note_pt(0, 0.009, -0.004), rot=(NOTE_ROT, 0, 0), color=PAPER, mat='farm_soft',
          bone='note')
    m.tube([note_pt(-0.07, 0.004, 0.1), note_pt(0.07, 0.004, 0.1)], 0.008, seg=6, color=RING, mat='farm_metal',
           bone='note')
    m.box((0.136, 0.003, 0.184), loc=note_pt(0, 0.0135, -0.003), rot=(NOTE_ROT, 0, 0),
          color=lambda co: PAPER if math.sin((co.z - NOTE_C[2]) * 260) < 0.85 else C('#b9c3d0'), mat='farm_soft', bone='page')
    # карандаш (правая варежка)
    hr = Vector(HAND)
    a = hr + Vector((-0.02, 0.06, 0.07))
    b = a + Vector((0.0, 0.1, -0.12))
    m.tube([tuple(a), tuple(b)], 0.014, seg=6, cap=False, color=PENCIL, mat='farm_soft', bone='pencil')
    tip = b + (b - a).normalized() * 0.045
    m.tube([tuple(b), tuple(tip)], [0.014, 0.002], seg=6, cap=False,
           color=lambda co: LEAD if (Vector(co) - tip).length < 0.014 else WOOD, mat='farm_soft', bone='pencil')
    e = a - (b - a).normalized() * 0.03
    m.tube([tuple(a), tuple(e)], 0.015, seg=6, color=C('#ff8fa0'), mat='farm_soft', bone='pencil')
    # колокольчик (правая варежка, только в ring)
    bc = hr + Vector((0, 0.02, -0.15))
    m.lathe([(0.001, 0.065), (0.03, 0.06), (0.044, 0.03), (0.052, -0.01), (0.068, -0.045), (0.074, -0.058),
             (0.062, -0.055), (0.035, -0.035), (0.001, -0.03)], seg=16, loc=tuple(bc), color=BRASS, mat='farm_metal',
            bone='bell')
    m.sphere(0.016, loc=tuple(bc + Vector((0, 0, -0.058))), seg=8, ring=6, color=BRASS, mat='farm_metal', bone='bell')
    m.tube([tuple(bc + Vector((0, 0, 0.06))), tuple(hr + Vector((0, 0.02, 0.11)))], 0.016, seg=7, color=HANDLE,
           mat='farm_soft', bone='bell')
    m.sphere(0.026, loc=tuple(hr + Vector((0, 0.02, 0.125))), seg=8, ring=6, color=HANDLE, mat='farm_soft', bone='bell')
    return m, mouth_at


def make_bones(mouth_at):
    return N.bones([
        ('hat', (0, 0, 1.3), 'head'),
        ('scarf', (0, -0.43, 1.2), 'hat'),
        ('note', HL_REST, 'hand.L'),
        ('page', HINGE, 'note'),
        ('pencil', HAND, 'hand.R'),
        ('bell', HAND, 'hand.R'),
    ], mouth_at)


def flutter(t, k=1.0):
    return {'scarf': {'rot': (6 * k * math.sin(S2 * 2 * t), 0, 4 * k * math.sin(S2 * 3 * t + 1))}}


def idle(t, f):
    d = N.merge(N.base(t, blinks=(0.18, 0.62)), flutter(t, 0.5), N.hidden('bell'))
    flip1 = sstep(0.28, 0.4, t)
    flip2 = sstep(0.78, 0.9, t)
    page = -176 * (flip1 - flip2)
    reach = win(t, 0.22, 0.44, 0.06) + win(t, 0.74, 0.94, 0.06)
    corner = (-0.16, 0.56, 0.96)
    hr = lerp3(IDLE_R, corner, reach)
    hr = (hr[0], hr[1], hr[2] + 0.05 * (bump(t, 0.28, 0.4) + bump(t, 0.78, 0.9)))
    read = win(t, 0.4, 0.76, 0.06)
    nod = bump(t, 0.5, 0.56) + bump(t, 0.62, 0.68)
    out = N.merge(d, {
        'hand.L': {'loc': hand_to('L', IDLE_L)},
        'hand.R': {'loc': hand_to('R', hr)},
        'page': {'rot': (page, 0, 0)},
        'head': {'rot': (-10 * read - 4 * nod, 0, 4 * read)},
        'chest': {'rot': (-2 * read, 0, 0)},
    })
    out['mouth'] = {'sc': (0.9, 1, 0.06 + 0.2 * nod)}
    return out


def ring(t, f):
    d = N.merge(N.base(t, blinks=()), N.happy_eyes(0.6 * win(t, 0.1, 0.9)), flutter(t, 1.0), N.hidden('pencil'))
    k = win(t, 0.0, 1.0, 0.16)
    sh = math.sin(S2 * 5 * t) * win(t, 0.15, 0.85, 0.06)
    hr = lerp3(HAND, (0.48, 0.36, 1.32), k)
    out = N.merge(d, {
        'hand.R': {'loc': hand_to('R', (hr[0] + 0.05 * sh, hr[1], hr[2] + 0.02 * abs(sh)))},
        'bell': {'rot': (0, 32 * sh, 0)},
        'hand.L': {'loc': hand_to('L', lerp3(IDLE_L, (-0.4, 0.4, 0.72), k))},
        'body': {'sc': (1, 1, 1 + 0.02 * math.sin(S2 * 5 * t) * k)},
        'head': {'rot': (4 * k, 0, -6 * k)},
        'chest': {'rot': (0, 3 * k, 0)},
    })
    out['mouth'] = {'sc': (0.9, 1, 0.06 + 0.7 * win(t, 0.15, 0.85) * (0.75 + 0.25 * abs(sh)))}
    return out


def accept(t, f):
    d = N.merge(N.base(t, blinks=(0.9,)), flutter(t, 0.6), N.hidden('bell'))
    nod = bump(t, 0.12, 0.28) + bump(t, 0.3, 0.46)
    k = win(t, 0.4, 0.95, 0.1)
    tick = (t - 0.55) / 0.2
    off = (0, 0, 0)
    if 0 < tick < 1:
        if tick < 0.35:
            u = tick / 0.35
            off = (0.03 * u, 0, -0.035 * u)
        else:
            u = (tick - 0.35) / 0.65
            off = (0.03 + 0.07 * u, 0, -0.035 + 0.09 * u)
    elif tick >= 1:
        off = (0.1, 0, 0.055)
    target = (-0.17 + off[0], 0.6, 0.93 + off[2])
    hr = lerp3(IDLE_R, target, k)
    out = N.merge(d, N.happy_eyes(0.5 * win(t, 0.78, 1.0, 0.08)), {
        'hand.L': {'loc': hand_to('L', IDLE_L)},
        'hand.R': {'loc': hand_to('R', hr)},
        'head': {'rot': (-13 * nod - 6 * k, 0, 0)},
        'chest': {'rot': (-3 * nod, 0, 0)},
    })
    out['mouth'] = {'sc': (0.9, 1, 0.06 + 0.3 * bump(t, 0.12, 0.46))}
    return out


ANIMS = [('idle', 120, idle), ('ring', 60, ring), ('accept', 60, accept)]


def main():
    K.reset()
    m, mouth_at = build(1.0)
    arm = K.armature(FID + '_rig', make_bones(mouth_at))
    ob = m.object(arm)
    acts = [K.bake(arm, n, fr, fn) for n, fr, fn in ANIMS]
    K.report(FID, [ob], arm, acts)
    K.save_blend(FID)
    K.export_glb(FID, [arm, ob])
    N.render_set(FID, arm, acts, lo=(-0.7, -0.6, 0.55), hi=(0.7, 0.6, 1.62),
                 frames={'ring': (0, 16, 24, 34), 'accept': (8, 30, 40, 50)})
    K.save_blend(FID)


if __name__ == '__main__':
    main()
