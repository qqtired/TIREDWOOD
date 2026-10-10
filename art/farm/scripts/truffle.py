# Трюфель на земле (~150 треуг.): тёмный бугристый шарик; анимация pop — «выпрыгивает» при находке (§16.6).
# Анимация объекта (без скелета): в игре до 3 штук возле свина.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep, bump, ease

FID = 'truffle'
DARK = C('#3a2618')
VEIN = C('#94704f')


def build(q=1.0):
    m = K.Mesh(FID, ['farm_soft'], q)

    def lumps(co):
        k = 1 + 0.1 * math.sin(co.x * 130 + 0.5) * math.sin(co.y * 120 + 1) * math.sin(co.z * 125 + 2) + 0.05 * math.sin(co.x * 260) * math.sin(co.y * 250)
        return (co.x * k, co.y * k, co.z * k * 0.88)
    m.sphere(0.05, loc=(0, 0, 0.04), seg=11, ring=8, deform=lumps,
             color=lambda co: mix(DARK, VEIN, 0.7 * sstep(0.55, 1.0, math.sin(co.x * 170 + co.z * 110 + co.y * 60))), bone='root')
    return m


def pop(t, f):
    u = ease(min(1.0, t / 0.35))
    s = 0.15 + 0.85 * u + 0.18 * bump(t, 0.3, 0.6) - 0.06 * bump(t, 0.6, 0.85)
    z = 0.14 * math.sin(math.pi * min(1.0, t / 0.55)) + 0.03 * (math.sin(math.pi * (t - 0.55) / 0.25) if 0.55 < t < 0.8 else 0)
    return {'loc': (0, 0, z), 'rot': (0, 0, 120 * ease(min(1.0, t / 0.6))), 'sc': (s, s, s * (1 - 0.15 * bump(t, 0.52, 0.66)))}


def main():
    K.reset()
    ob = build().object()
    act = K.bake_object(ob, 'pop', 18, pop)
    K.report(FID, [ob], None, [act])
    K.save_blend(FID)
    K.export_glb(FID, [ob])
    st = K.stage()
    K.frame_cam((-0.07, -0.07, 0.0), (0.07, 0.07, 0.09))
    K.render(f'{K.REN_DIR}/{FID}.png', size=512)
    K.remove(st)


if __name__ == '__main__':
    main()
