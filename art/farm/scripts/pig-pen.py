# Загончик трюфельного свина 1,8 × 1,5 м: столбики, жерди, корыто с кормом, ямка для рытья, охапка соломы
# (design-v11 §16.6, level.md §5: загон (−2; −4,05)). Статика, одна склейка.
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charkit as K
from charkit import C, mix, sstep

FID = 'pig-pen'
POST = C('#9a6a3a')
POST_T = C('#b98a52')
RAIL = C('#c08a4e')
RAIL_D = C('#a8763e')
TROUGH = C('#8f6236')
SLOP = C('#9cbf5a')
APPLE = C('#e2364f')
MUD = C('#6e4b31')
MUD_D = C('#57391f')
STRAW = C('#e8c75e')
STRAW_D = C('#cfa840')
W, D, H = 1.8, 1.5, 0.45


def build(q=1.0):
    m = K.Mesh(FID, ['farm_soft'], q)
    rnd = random.Random(5)
    posts = [(-W / 2, -D / 2), (W / 2, -D / 2), (-W / 2, D / 2), (W / 2, D / 2), (0, -D / 2), (0, D / 2)]
    for x, y in posts:
        m.lathe([(0.001, -0.02), (0.05, -0.02), (0.05, H - 0.03), (0.042, H + 0.0), (0.02, H + 0.018), (0.001, H + 0.022)],
                seg=7, loc=(x, y, 0), color=lambda co: POST_T if co.z > H - 0.02 else POST)
    for z in (0.17, 0.35):
        for (x0, y0, x1, y1) in ((-W / 2, -D / 2, 0, -D / 2), (0, -D / 2, W / 2, -D / 2), (-W / 2, D / 2, 0, D / 2),
                                 (0, D / 2, W / 2, D / 2), (-W / 2, -D / 2, -W / 2, D / 2), (W / 2, -D / 2, W / 2, D / 2)):
            L = math.hypot(x1 - x0, y1 - y0)
            ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
            c = mix(RAIL, RAIL_D, rnd.random() * 0.6)
            m.box((L + 0.02, 0.05, 0.045), loc=((x0 + x1) / 2, (y0 + y1) / 2, z + rnd.uniform(-0.01, 0.01)),
                  rot=(rnd.uniform(-1.5, 1.5), 0, ang), bevel=0.012, bseg=1, color=c)
    # корыто у задней стенки слева
    tx, ty = -0.45, -0.52
    m.box((0.56, 0.24, 0.05), loc=(tx, ty, 0.025), bevel=0.012, bseg=1, color=TROUGH)
    for (dx, dy, sx, sy) in ((0, 0.1, 0.56, 0.04), (0, -0.1, 0.56, 0.04), (0.26, 0, 0.04, 0.24), (-0.26, 0, 0.04, 0.24)):
        m.box((sx, sy, 0.15), loc=(tx + dx, ty + dy, 0.075), bevel=0.01, bseg=1, color=TROUGH)
    m.box((0.49, 0.17, 0.05), loc=(tx, ty, 0.09), bevel=0.015, bseg=1, color=SLOP)
    for i in range(3):
        m.sphere(0.03, loc=(tx - 0.12 + 0.12 * i, ty + rnd.uniform(-0.03, 0.03), 0.12), seg=6, ring=5, color=APPLE)
    # ямка, где свин роет: невысокий бугорок земли с комьями (край под углом к земле — без мерцания)
    m.sphere(0.34, loc=(0.28, 0.12, -0.012), scale=(1, 0.82, 0.12), seg=14, ring=6,
             color=lambda co: mix(MUD, MUD_D, 0.5 + 0.5 * math.sin(co.x * 40) * math.cos(co.y * 37)))
    for i in range(5):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.2, 0.36)
        m.sphere(rnd.uniform(0.025, 0.04), loc=(0.28 + r * math.cos(a), 0.12 + 0.8 * r * math.sin(a), 0.012), scale=(1, 1, 0.7),
                 seg=6, ring=4, color=MUD_D)
    # охапка соломы в правом заднем углу (там свин спит)
    m.sphere(0.32, loc=(0.5, -0.4, -0.04), scale=(1, 0.75, 0.32), seg=14, ring=6,
             deform=lambda co: (co.x, co.y, co.z * (1 + 0.18 * math.sin(co.x * 50) * math.cos(co.y * 43))),
             color=lambda co: mix(STRAW, STRAW_D, 0.5 + 0.5 * math.sin(co.x * 60 + co.y * 30)))
    for i in range(10):
        a = rnd.uniform(0, math.pi)
        x, y = 0.5 + rnd.uniform(-0.3, 0.3), -0.4 + rnd.uniform(-0.2, 0.2)
        L = rnd.uniform(0.1, 0.18)
        m.tube([(x, y, 0.045), (x + L * math.cos(a), y + L * math.sin(a), 0.03 + rnd.uniform(0, 0.03))], 0.006, seg=4,
               color=STRAW_D)
    return m


def main():
    K.reset()
    ob = build().object()
    K.report(FID, [ob])
    K.save_blend(FID)
    K.export_glb(FID, [ob], animations=False)
    st = K.stage()
    K.frame_cam((-0.95, -0.8, 0.0), (0.95, 0.8, 0.5), view=(0.55, 1.0, 0.75))
    K.render(f'{K.REN_DIR}/{FID}.png')
    K.remove(st)


if __name__ == '__main__':
    main()
