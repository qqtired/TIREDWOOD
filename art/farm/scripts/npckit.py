# Жители фермы — желейки как в игре: тело по профилю client/render/outfit3d.ts (рост 1,58, ширина 1,05),
# глаза как в avatar.ts (белки r 0,105 на ±0,13, высота 1,17), рот и румянец как look v2 (рот на 0,985),
# варежки r 0,1 (1 : 0,92 : 0,88). Лицом в +Y Blender = −Z three.js.
import math
from mathutils import Vector, Quaternion
import charkit as K
from charkit import C, mix, sstep, bump, win, blink, ease

WHITE = C('#ffffff')
PUPIL = C('#111318')
INK = C('#3a1418')
MOUTH_IN = C('#5a1822')
TONGUE = C('#ff7a8e')
EYES_Z = 1.17
EYES_Y = 0.4
MOUTH_Z = 0.985
HAND_REST = (0.62, 0.1, 0.6)
S2 = 2 * math.pi


def jelly_w(co):
    """Веса тела: низ — body, середина — chest, верх (лицо, шапка) — head."""
    z = co.z
    wb = 1 - sstep(0.3, 0.72, z)
    wh = sstep(0.86, 1.22, z)
    return {'body': wb, 'chest': max(0.0, 1 - wb - wh), 'head': wh}


def body(m, color, cut=None, seg=32):
    pts = list(K.JELLY_PTS)
    if cut is not None:
        pts = [(0.001, cut), (K.jelly_r(cut), cut)] + [(r, z) for (r, z) in pts if z > cut + 0.012]
    dark = tuple(c * 0.82 for c in color[:3]) + (1.0,)
    m.lathe(pts, seg=seg, color=lambda co: mix(dark, color, sstep(0.0, 0.35, co.z)), mat='farm_jelly', bone=jelly_w)


def eyes(m, seg=16, ring=12, pseg=12, pring=10):
    for s, side in ((-1, 'L'), (1, 'R')):
        b = 'eye.' + side
        m.sphere(0.105, loc=(0.13 * s, EYES_Y, EYES_Z), scale=(1, 0.55, 1.15), seg=seg, ring=ring, color=WHITE,
                 mat='farm_jelly', bone=b)
        m.sphere(0.052, loc=(0.125 * s, EYES_Y + 0.045, EYES_Z + 0.005), scale=(1, 0.5, 1.2), seg=pseg, ring=pring,
                 color=PUPIL, mat='farm_jelly', bone=b)
        m.sphere(0.014, loc=(0.125 * s - 0.016, EYES_Y + 0.07, EYES_Z + 0.03), seg=8, ring=6, color=WHITE,
                 mat='farm_jelly', bone=b)


def surf(z, x, inset=0.0):
    r = K.jelly_r(z)
    return math.sqrt(max(0.0, r * r - x * x)) - inset


def mouth(m, z=MOUTH_Z, w=0.07, k=4.0, seg=16, ring=10):
    """Улыбка (всегда видна) + открытый рот-«D» на кости mouth: в покое сжат в линию улыбки (масштаб по z)."""
    pts = []
    for i in range(9):
        x = -w + 2 * w * i / 8
        pts.append((x, surf(z + k * x * x, x, 0.004), z + k * x * x))
    m.tube(pts, [0.006, 0.009, 0.011, 0.012, 0.012, 0.012, 0.011, 0.009, 0.006], seg=6, color=INK, mat='farm_jelly',
           bone='head')

    def d(co):
        x, y, zz = co.x, co.y, co.z
        if zz > 0:
            zz *= 0.12
        return (x, y, zz + k * x * x)
    y0 = surf(z, 0, 0.018)
    m.sphere(w * 0.96, loc=(0, y0, z), scale=(1, 0.32, 0.62), seg=seg, ring=ring, deform=d,
             color=lambda co: TONGUE if (co.z < z - 0.024 and abs(co.x) < 0.05) else MOUTH_IN, mat='farm_jelly',
             bone='mouth')
    return (0, y0, z)


def blush(m, color, z=1.012, x=0.195, amt=0.5):
    pink = C('#ff6987')
    c = mix(color, pink, amt)
    # «таблетка» наполовину в теле: край — линия пересечения под углом, без соприкасающихся плоскостей
    dr = (K.jelly_r(z + 0.01) - K.jelly_r(z - 0.01)) / 0.02
    for s in (-1, 1):
        y = surf(z, x * s, 0.0)
        r = math.hypot(x, y)
        n = Vector((x * s / r, y / r, -dr)).normalized()
        p = Vector((x * s, y, z)) - n * 0.004
        m.disc(0.058, loc=p, rot=align_rot(n), scale=(1, 0.62, 1), seg=14, thick=0.016, color=c, mat='farm_jelly',
               bone='head')


def mittens(m, color, rest=HAND_REST, seg=13, ring=9):
    for s, side in ((-1, 'L'), (1, 'R')):
        c = Vector((rest[0] * s, rest[1], rest[2]))
        b = 'hand.' + side
        m.sphere(0.1, loc=c, scale=(1, 0.88, 0.92), seg=seg, ring=ring, color=color, mat='farm_jelly', bone=b)
        m.sphere(0.042, loc=c + Vector((-0.074 * s, 0.03, 0.035)), scale=(1, 1, 1.25), rot=(0, 25 * s, 0), seg=8, ring=6,
                 color=color, mat='farm_jelly', bone=b)


def align_rot(n):
    """Градусы XYZ, поворачивающие ось +Z в направление n."""
    q = Vector((0, 0, 1)).rotation_difference(Vector(n).normalized())
    e = q.to_euler('XYZ')
    return tuple(math.degrees(a) for a in e)


def bones(extra, mouth_at, hand=HAND_REST):
    return [
        ('root', (0, 0, 0), None, False),
        ('body', (0, 0, 0.0), 'root'),
        ('chest', (0, 0, 0.62), 'body'),
        ('head', (0, 0, 1.0), 'chest'),
        ('eye.L', (-0.13, EYES_Y, EYES_Z), 'head'),
        ('eye.R', (0.13, EYES_Y, EYES_Z), 'head'),
        ('mouth', mouth_at, 'head'),
        ('hand.L', (-hand[0], hand[1], hand[2]), 'root'),
        ('hand.R', (hand[0], hand[1], hand[2]), 'root'),
    ] + extra


def hand_to(side, target, hand=HAND_REST):
    """Сдвиг кости варежки, чтобы её центр оказался в точке target (мир)."""
    s = -1 if side == 'L' else 1
    return (target[0] - hand[0] * s, target[1] - hand[1], target[2] - hand[2])


def lerp3(a, b, k):
    return tuple(a[i] + (b[i] - a[i]) * k for i in range(3))


def base(t, blinks=(0.37, 0.83), breath=1):
    """Дыхание, лёгкое покачивание и моргание — подложка для любой анимации (циклична по t)."""
    br = math.sin(S2 * breath * t)
    e = 1.0
    for b in blinks:
        e = min(e, blink(t, b, 0.035))
    return {
        'body': {'sc': (1 - 0.006 * br, 1 - 0.006 * br, 1 + 0.012 * br)},
        'chest': {'rot': (0, 1.2 * math.sin(S2 * t), 0)},
        'head': {'rot': (0.8 * math.sin(S2 * t + 1.0), 0, 0)},
        'eye.L': {'sc': (1, 1, e)},
        'eye.R': {'sc': (1, 1, e)},
        'mouth': {'sc': (0.9, 1, 0.06)},
    }


def merge(*ds):
    """Склейка поз: rot и loc складываются, sc перемножается."""
    out = {}
    for d in ds:
        for b, v in d.items():
            o = out.setdefault(b, {})
            for k, val in v.items():
                if k == 'sc':
                    vv = val if isinstance(val, (tuple, list)) else (val, val, val)
                    pv = o.get('sc', (1, 1, 1))
                    pv = pv if isinstance(pv, (tuple, list)) else (pv, pv, pv)
                    o['sc'] = tuple(pv[i] * vv[i] for i in range(3))
                else:
                    pv = o.get(k, (0, 0, 0))
                    o[k] = tuple(pv[i] + val[i] for i in range(3))
    return out


def talk_mouth(t, speed=7, a=1.0):
    """Открытие рта во время речи: 0.06 (закрыт) … ~0.9."""
    v = 0.5 + 0.5 * math.sin(S2 * speed * t) * math.sin(S2 * speed * 0.37 * t + 0.6)
    return 0.06 + 0.84 * a * abs(v)


def happy_eyes(k):
    return {'eye.L': {'sc': (1, 1, 1 - 0.55 * k)}, 'eye.R': {'sc': (1, 1, 1 - 0.55 * k)}}


def hidden(*names):
    return {n: {'sc': 0.001} for n in names}


def render_set(fid, arm, acts, lo=(-0.75, -0.6, 0.0), hi=(0.75, 0.6, 1.62), frames=None):
    st = K.stage()
    K.frame_cam(lo, hi, fill=0.9)
    K.use_action(arm, acts[0], 0)
    K.render(f'{K.REN_DIR}/{fid}.png')
    for a in acts[1:]:
        fr = (frames or {}).get(a.name)
        if fr:
            K.strip(f'{K.REN_DIR}/{fid}_{a.name}.png', arm, a, fr)
    K.remove(st)
