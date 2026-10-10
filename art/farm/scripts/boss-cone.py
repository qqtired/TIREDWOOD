# Шишка-ворчунья (design-v11 §11, §16.5): ~200 треуг., моргающие сердитые глазки. Древо бросает её на фазах 2–3,
# игрок подбирает (E или проходом). Анимации: idle (ворчит и моргает), land (шлёп-подпрыг), pickup (пуф перед исчезновением).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep, bump, win, blink, ease

FID = 'boss-cone'
BROWN = C('#9a6034')
TIP = C('#d29a5c')
DARK = C('#5a361c')
WHITE = C('#fbf7ee')
BLACK = C('#17141a')
H = 0.2


def build(q=1.0):
    """Шишка: кольца чешуек вперемешку — выступы (светлые кончики) и впадины (тёмные), соседние ряды со сдвигом."""
    m = K.Mesh(FID, ['farm_gloss'], q)
    bm = m.bm
    SEG = 8
    rings = [(0.045, 0.012, 0), (0.07, 0.034, 1), (0.062, 0.056, 0), (0.084, 0.08, 1), (0.068, 0.102, 0),
             (0.076, 0.124, 1), (0.055, 0.144, 0), (0.054, 0.162, 1), (0.03, 0.18, 0)]
    vb = bm.verts.new((0, 0, 0.0))
    vt = bm.verts.new((0, 0, 0.198))
    rows = []
    outs = 0
    for (r, z, out) in rings:
        off = 0.5 * (outs % 2) if out else 0.25 + 0.5 * (outs % 2)
        if out:
            outs += 1
        rows.append([bm.verts.new((r * math.cos(2 * math.pi * (j + off) / SEG), r * math.sin(2 * math.pi * (j + off) / SEG), z))
                     for j in range(SEG)])
    for j in range(SEG):
        k = (j + 1) % SEG
        bm.faces.new((rows[0][k], rows[0][j], vb))
        bm.faces.new((rows[-1][j], rows[-1][k], vt))
    for a_, b_ in zip(rows, rows[1:]):
        for j in range(SEG):
            k = (j + 1) % SEG
            bm.faces.new((a_[j], a_[k], b_[k], b_[j]))
    tips = {v for r_, (rr, z, out) in zip(rows, rings) if out for v in r_}
    verts = [v for r_ in rows for v in r_] + [vb, vt]
    m._finish(verts, lambda co: TIP if any((v.co - co).length < 1e-6 for v in tips) else
              (DARK if co.z < 0.15 else BROWN), 'farm_gloss', 'body')
    for s in (-1, 1):
        m.sphere(0.022, loc=(0.03 * s, 0.072, 0.11), scale=(0.9, 0.5, 1.1), seg=5, ring=3, color=WHITE, bone='eyes')
        m.sphere(0.011, loc=(0.028 * s, 0.083, 0.106), scale=(1, 0.5, 1.1), seg=4, ring=3, color=BLACK, bone='eyes')
        m.tube([(0.012 * s, 0.085, 0.138), (0.05 * s, 0.074, 0.15)], 0.006, seg=3, color=DARK, bone='eyes')
    return m


BONES = [('root', (0, 0, 0), None, False), ('body', (0, 0, 0.0), 'root'), ('eyes', (0, 0.075, 0.115), 'body')]
S2 = 2 * math.pi


def idle(t, f):
    e = min(blink(t, 0.3, 0.05), blink(t, 0.42, 0.05), blink(t, 0.8, 0.05))
    gr = math.sin(S2 * 6 * t) * win(t, 0.5, 0.7, 0.04)
    return {'body': {'rot': (0, 4 * math.sin(S2 * t) + 3 * gr, 0), 'sc': (1, 1, 1 + 0.03 * math.sin(S2 * 2 * t))},
            'eyes': {'sc': (1, 1, 0.8 * e)}}


def land(t, f):
    sq = bump(t, 0.0, 0.25)
    u = (t - 0.18) / 0.4
    hop = math.sin(math.pi * u) if 0 < u < 1 else 0.0
    sq2 = bump(t, 0.56, 0.75)
    dizzy = win(t, 0.6, 1.0, 0.08)
    return {'root': {'loc': (0, 0, 0.08 * hop), 'rot': (0, 0, 40 * ease(u) if u > 0 else 0)},
            'body': {'sc': (1 + 0.2 * (sq + sq2), 1 + 0.2 * (sq + sq2), 1 - 0.3 * (sq + sq2) + 0.1 * hop),
                     'rot': (10 * math.sin(S2 * 3 * t) * dizzy, 10 * math.cos(S2 * 3 * t) * dizzy, 0)},
            'eyes': {'sc': (1, 1, 0.15 + 0.85 * sstep(0.3, 0.5, t))}}


def pickup(t, f):
    s = 1 + 0.35 * bump(t, 0.0, 0.5)
    k = 1 - ease(sstep(0.45, 1.0, t))
    return {'root': {'loc': (0, 0, 0.25 * ease(t))}, 'body': {'sc': (s * max(0.001, k),) * 3, 'rot': (0, 0, 360 * ease(t))},
            'eyes': {'sc': (1, 1, 0.3)}}


ANIMS = [('idle', 60, idle), ('land', 24, land), ('pickup', 15, pickup)]


def main():
    K.reset()
    arm = K.armature(FID + '_rig', BONES)
    ob = build().object(arm)
    acts = [K.bake(arm, n, fr, fn) for n, fr, fn in ANIMS]
    K.report(FID, [ob], arm, acts)
    K.save_blend(FID)
    K.export_glb(FID, [arm, ob])
    st = K.stage()
    K.frame_cam((-0.1, -0.1, 0.0), (0.1, 0.1, 0.2))
    K.use_action(arm, acts[0], 0)
    K.render(f'{K.REN_DIR}/{FID}.png')
    K.remove(st)
    K.save_blend(FID)


if __name__ == '__main__':
    main()
