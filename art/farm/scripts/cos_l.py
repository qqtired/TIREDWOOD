# TIREDWOOD, фермерская косметика, слот l (низ, «как штаны» на нижней половине): слой ткани (PNG из cos_layers.mjs)
# + мелкие детали <= 600 треуг. Blender -b --factory-startup --python art/farm/scripts/cos_l.py -- [names]
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cos_stage import *  # noqa
from cos_h import hsh, shade, spec  # noqa
from cos_u import layer, buttons, U_BOT  # noqa

CLOTH, GLOSS, METAL = 0, 1, 2
ORANGE = 0xe08a2a


def loopstrap(P, pts, col, width, thick, off, closed=True, mat=CLOTH):
    P.add(strap([(a, b, off) for (a, b) in pts], 0, width, thick, closed=closed, smooth_path=False), col, mat)


def l_jeans():
    P = Part()
    Mt = Part()
    denim = 0x37557f
    # шлёвки на «поясе»
    for ph in (0.38, -0.38, 1.3, -1.3, PI - 0.62, PI + 0.62):
        P.add(strap([(ph, 0.648, 0.004), (ph, 0.724, 0.004)], 0, 0.017, 0.007, 2), shade(denim, 0.92))
    # два задних кармана со строчкой-дугой
    for s in (-1, 1):
        ph, yc = s * 0.36, 0.5
        shape = lambda a, b: (0.5 + (a - 0.5) * (0.82 + 0.18 * b), b)
        P.add(patch(ph, yc, 0.15, 0.15, 0.003, 0.007, 0, 4, 3, shape=shape), 0x3b5a86)
        arc = [(ph + (k / 6 - 0.5) * 0.11 / bodyR(yc), yc + 0.02 - 0.03 * math.sin(PI * k / 6)) for k in range(7)]
        loopstrap(P, arc, ORANGE, 0.004, 0.003, 0.0112, closed=False)
        top = [(ph + (k / 2 - 0.5) * 0.15 / bodyR(yc), yc + 0.066) for k in range(3)]
        loopstrap(P, top, ORANGE, 0.004, 0.003, 0.0112, closed=False)
        for k in (-1, 1):
            Mt.add(put(cyl(0.006, 0.006, 0.004, 6).tf(RX(PI / 2)), ph + k * 0.072 / bodyR(yc), yc + 0.07, 0.0115), 0xb8743a)
    Mt.add(put(cyl(0.014, 0.014, 0.008, 10).tf(RX(PI / 2)), PI, 0.684, 0.008), 0xb8743a)
    return spec([('l_jeans', P, (0, 0.5, 0)), ('l_jeans_metal', Mt, (0, 0.5, 0))], layers=layer('l:jeans'))


def l_boots():
    P = Part()
    rub, rub_l = 0x2c5a3a, 0x3d6e4a
    # рант по низу и отворот по верху голенища
    P.add(cuff(lambda phi: 0.014, 0.004, 0.05, 32, 0.016), 0x24482f, GLOSS)
    P.add(cuff(lambda phi: 0.345, 0.003, 0.06, 32, 0.022, fcol=lambda i, j: rub_l if j in (1, 2) else rub), None, GLOSS)
    # петелька сзади
    P.add(strap([(0.0, 0.38, 0.03), (0.0, 0.44, 0.032), (0.0, 0.47, 0.024)], 0, 0.024, 0.008, 4), 0x24482f, GLOSS)
    return spec([('l_boots', P, (0, 0.2, 0))], layers=layer('l:boots'))


def l_overalls():
    P = Part()
    Mt = Part()
    denim = 0x4a6e9e
    # лямки: от углов нагрудника через «плечи» назад и крест-накрест к поясу
    for s in (-1, 1):
        a0 = PI + s * 0.29
        R = [(PI - 0.29, 0.845), (PI - 0.62, 0.98), (PI - 1.25, 1.06), (1.0, 1.06), (0.4, 0.93), (-0.25, 0.72)]
        path = [(a if s < 0 else TAU - a, y) for (a, y) in R]
        P.add(strap(path, 0.004, 0.05, 0.008, 20), shade(denim, 0.95))
        # пряжка на углу нагрудника и пуговица на боку
        F = frameAt(a0, 0.835, 0.012)
        Mt.add(strap([(a0 - 0.035, 0.81, 0.013), (a0 + 0.035, 0.81, 0.013), (a0 + 0.035, 0.86, 0.013), (a0 - 0.035, 0.86, 0.013)],
                      0, 0.008, 0.005, closed=True, smooth_path=False), 0xc0c6ca)
        Mt.add(put(cyl(0.011, 0.011, 0.006, 8).tf(RX(PI / 2)), a0, 0.81, 0.012), 0xc0c6ca)
        Mt.add(put(cyl(0.012, 0.012, 0.006, 8).tf(RX(PI / 2)), PI + s * 1.25, 0.6, 0.006), 0xc0c6ca)
    # карман на нагруднике
    P.add(patch(PI, 0.79, 0.15, 0.08, 0.003, 0.007, 0, 4, 2), shade(denim, 1.06))
    loopstrap(P, [(PI + (k / 2 - 0.5) * 0.15 / bodyR(0.83), 0.828) for k in range(3)], ORANGE, 0.004, 0.003, 0.0112, closed=False)
    return spec([('l_overalls', P, (0, 0.6, 0)), ('l_overalls_metal', Mt, (0, 0.6, 0))], layers=layer('l:overalls'))


def l_patched():
    P = Part()
    patches = [(PI - 0.38, 0.33, 0.19, 0.16, 0.2, 0x5f8f34), (PI + 0.78, 0.52, 0.16, 0.14, -0.25, 0xd2552a),
               (0.42, 0.27, 0.17, 0.17, 0.15, 0xe3b23c), (-0.95, 0.45, 0.15, 0.13, -0.1, 0x5a7ab8)]
    for (ph, y, w, h, tilt, c) in patches:
        P.add(patch(ph, y, w, h, 0.003, 0.006, tilt, 3, 3), c)
        r = bodyR(y)
        # крупные стежки поперёк края
        for k in range(8):
            t = k / 8
            per = 2 * (w + h)
            dist = t * per
            if dist < w:
                lx, ly, nx, ny = dist - w / 2, -h / 2, 0, -1
            elif dist < w + h:
                lx, ly, nx, ny = w / 2, dist - w - h / 2, 1, 0
            elif dist < 2 * w + h:
                lx, ly, nx, ny = w / 2 - (dist - w - h), h / 2, 0, 1
            else:
                lx, ly, nx, ny = -w / 2, h / 2 - (dist - 2 * w - h), -1, 0
            ca, sa = math.cos(tilt), math.sin(tilt)
            ax, ay = lx - nx * 0.012, ly - ny * 0.012
            bx, by = lx + nx * 0.012, ly + ny * 0.012
            A = (ph + (ax * ca - ay * sa) / r, y + ax * sa + ay * ca, 0.011)
            B = (ph + (bx * ca - by * sa) / r, y + bx * sa + by * ca, 0.006)
            P.add(strap([A, B], 0, 0.005, 0.004, 1, smooth_path=False), 0xf0e2c0)
    return spec([('l_patched', P, (0, 0.4, 0))], layers=layer('l:patched'))


def l_sneakers():
    P = Part()
    Mt = Part()
    white = 0xf4f2ea
    P.add(cuff(lambda phi: 0.012, 0.004, 0.065, 28, 0.018, fcol=lambda i, j: 0xd8d4c8 if j == 2 else white), None)
    # шнуровка крест-накрест спереди и люверсы
    ys = [0.13, 0.17, 0.21, 0.25]
    xs = 0.045
    for k, y in enumerate(ys):
        r = bodyR(y)
        if k < len(ys) - 1:
            y2 = ys[k + 1]
            for s in (-1, 1):
                P.add(strap([(PI + s * xs / r, y, 0.008), (PI - s * xs / bodyR(y2), y2, 0.01)], 0, 0.008, 0.004, 2), white)
    # бантик сверху
    F = frameAt(PI, 0.262, 0.012)
    for s in (-1, 1):
        P.add(sphere(0.022, 0.011, 0.005, 6, 4).tf(RZ(s * 0.4)).move(s * 0.02, 0.004, 0).tf(F), white)
        P.add(strap([(PI + s * 0.008, 0.255, 0.012), (PI + s * 0.03, 0.2, 0.016)], 0, 0.006, 0.003, 2), white)
    # нашивка-листик на внешнем боку
    for s in (-1, 1):
        ph = PI + s * 1.3
        P.add(put(cyl(0.032, 0.032, 0.004, 8).tf(RX(PI / 2)), ph, 0.17, 0.005), white)
        leaf = [(0, -0.02), (0.012, -0.006), (0.01, 0.01), (0.0, 0.022), (-0.01, 0.01), (-0.012, -0.006)]
        P.add(put(slab(leaf, 0.003).tf(RZ(0.5 * s)), ph, 0.17, 0.0085), 0x5f9a34)
    return spec([('l_sneakers', P, (0, 0.15, 0))], layers=layer('l:sneakers'))


TABLE = {'jeans': l_jeans, 'boots': l_boots, 'overalls': l_overalls, 'patched': l_patched, 'sneakers': l_sneakers}

if __name__ == '__main__':
    run('l', TABLE, cli_names(TABLE), os.path.abspath(__file__))
