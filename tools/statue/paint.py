"""Краска тела: камуфляж ММ-14, нашивки, пуговицы, строчки, кожа кистей, берцы. Цвета — с фото (sRGB 0…1).

Камуфляж — объёмный пиксельный узор: шум считается в центре «вокселя» 4,5 мм, поэтому на ткани
получаются квадратные пиксели, как у настоящей ММ-14, и нет швов развёртки.
"""
import numpy as np

from body import (FLAG, FLAPS, HEM_Y, NAME_TAPE, PLACKET, POCKETS, VELCRO_CHEST, normalize, smoothstep)
from head import value_noise


def rgb(*c):
    return np.array(c, np.float64) / 255


# Палитра ММ-14 по фото (кластеры k-means по кителю)
TAN = rgb(196, 184, 162)
KHAKI = rgb(160, 152, 128)
OLIVE = rgb(112, 106, 84)
DARK = rgb(70, 64, 50)
VELCRO = rgb(111, 107, 81)
FLAG_TOP = rgb(100, 100, 82)
FLAG_BOT = rgb(156, 155, 125)
TAPE = rgb(140, 138, 116)
BORDER = rgb(88, 86, 66)
BUTTON = rgb(92, 92, 82)
CHEVRON_BG = rgb(104, 100, 80)
CHEVRON = rgb(22, 22, 20)
SKIN = rgb(233, 197, 185)
LEATHER = rgb(42, 36, 33)
SOLE = rgb(30, 28, 27)
LACE = rgb(26, 24, 23)

PIX = 0.0045  # пиксель ММ-14 на фото ~4,5 мм
SCALES = (0.038, 0.024, 0.013)  # пятна оливы, светлого, тёмного


def fbm(p, scale, seed):
    return 0.6 * value_noise(p, scale, seed) + 0.3 * value_noise(p, scale / 2.1, seed + 17) + 0.1 * value_noise(p, scale / 4.3, seed + 31)


_thr = None


def thresholds():
    """Пороги слоёв по доле площади, как на фото (k-means по кителю): олива с тёмным ~45 %,
    светлый ~28 %, хаки ~27 %. Светлый перекрывается оливой, поэтому его маска шире."""
    global _thr
    if _thr is None:
        rng = np.random.default_rng(5)
        q = rng.uniform([-0.5, 0, -0.2], [0.3, 1.7, 0.3], (200000, 3))
        a, b, c = (fbm(q, s, k + 1) for k, s in enumerate(SCALES))
        _thr = (np.quantile(a, 0.58), np.quantile(b, 0.47), np.quantile(c, 0.84))
    return _thr


def camo(p):
    q = (np.floor(p / PIX) + 0.5) * PIX
    ta, tb, tc = thresholds()
    a, b, c = (fbm(q, s, k + 1) for k, s in enumerate(SCALES))
    col = np.tile(KHAKI, (len(p), 1))
    col[b > tb] = TAN
    olive = a > ta
    col[olive] = OLIVE
    dark = (c > tc) & ((a > ta - 0.04) | (c > tc + 0.05))
    col[dark] = DARK
    # ткань: мелкая неровность и чуть разный оттенок пикселей
    weave = value_noise(p, 0.0012, 41)
    return col * (0.95 + 0.08 * weave[:, None])


def rect_mask(x, y, r, edge=0.0007):
    x0, x1, y0, y1 = r
    return smoothstep(x0 - edge, x0 + edge, x) * (1 - smoothstep(x1 - edge, x1 + edge, x)) * smoothstep(y0 - edge, y0 + edge, y) * (1 - smoothstep(y1 - edge, y1 + edge, y))


def rect_line(x, y, r, inset, w=0.0007):
    """Тонкая строчка по контуру прямоугольника, отступ inset внутрь."""
    x0, x1, y0, y1 = r
    inner = (x0 + inset, x1 - inset, y0 + inset, y1 - inset)
    a = rect_mask(x, y, (inner[0] - w, inner[1] + w, inner[2] - w, inner[3] + w), 0.0004)
    b = rect_mask(x, y, (inner[0] + w, inner[1] - w, inner[2] + w, inner[3] - w), 0.0004)
    return np.clip(a - b, 0, 1)


def blend(col, mask, c):
    m = np.clip(mask, 0, 1)[:, None]
    return col * (1 - m) + np.asarray(c) * m


def patch(col, x, y, r, fill, border=BORDER, bw=0.0018, front=None):
    m = rect_mask(x, y, r)
    if front is not None:
        m = m * front
    inner = (r[0] + bw, r[1] - bw, r[2] + bw, r[3] - bw)
    col = blend(col, m, border)
    col = blend(col, rect_mask(x, y, inner) * (front if front is not None else 1), fill)
    return col


def chevron_mask(x, y, r):
    """Одна галочка остриём вверх в прямоугольнике r."""
    x0, x1, y0, y1 = r
    cx = (x0 + x1) / 2
    w = (x1 - x0)
    h = (y1 - y0)
    u = (x - cx) / (w * 0.36)
    v = (y - (y0 + h * 0.30)) / (h * 0.42)
    # две полосы: v ≈ 1 − |u|·k, толщина ~0.22
    dist = np.abs(v - (1 - np.abs(u) * 0.95))
    return (dist < 0.30).astype(np.float64) * (np.abs(u) < 1.0) * (v > -0.15)


def colors(body, p, n, parts):
    """Цвет в точках p (N×3) с нормалями n; parts — словарь SDF частей тела в этих точках."""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    which = np.argmin(np.stack([np.abs(parts['cloth']), np.abs(parts['hands']) - 0.0015, np.abs(parts['boot']), np.abs(parts['sole']) - 0.001]), 0)
    col = camo(p)
    front = smoothstep(0.15, 0.4, n[:, 2]) * (z > 0.02)

    # китель спереди: планка, карманы, клапаны, нашивки
    col = blend(col, (rect_line(x, y, PLACKET, 0.0) * front) * 0.55, BORDER)
    for r in POCKETS:
        col = blend(col, rect_line(x, y, r, 0.0025) * front * 0.6, BORDER)
    for r in FLAPS:
        col = blend(col, rect_line(x, y, r, 0.0022) * front * 0.6, BORDER)
        shadow = rect_mask(x, y, (r[0], r[1], r[2] - 0.004, r[2])) * front
        col = col * (1 - 0.35 * shadow[:, None])
    col = patch(col, x, y, VELCRO_CHEST, VELCRO * (0.95 + 0.1 * value_noise(p, 0.0006, 51)[:, None]), front=front)
    col = patch(col, x, y, NAME_TAPE, TAPE, front=front)
    fl = rect_mask(x, y, FLAG) * front
    col = blend(col, fl, BORDER)
    mid = (FLAG[2] + FLAG[3]) / 2
    col = blend(col, rect_mask(x, y, (FLAG[0] + 0.0018, FLAG[1] - 0.0018, mid, FLAG[3] - 0.0018)) * front, FLAG_TOP)
    col = blend(col, rect_mask(x, y, (FLAG[0] + 0.0018, FLAG[1] - 0.0018, FLAG[2] + 0.0018, mid)) * front, FLAG_BOT)

    # воротник: строчка по верху, клапан с шевроном
    collar_zone = (y > 1.47) & (np.abs(x) < 0.09)
    cr = (0.012, 0.046, 1.483, 1.514)
    cfront = smoothstep(0.3, 0.6, n[:, 2]) * collar_zone
    col = patch(col, x, y, cr, CHEVRON_BG, front=cfront)
    col = blend(col, chevron_mask(x, y, (cr[0] + 0.004, cr[1] - 0.004, cr[2] + 0.004, cr[3] - 0.004)) * cfront, CHEVRON)

    # пуговицы: клапаны карманов и погоны
    for c, nn in body.button_spots():
        c = np.asarray(c)
        nn = normalize(nn)
        q = p - c
        along = q @ nn
        rad = np.linalg.norm(q - along[:, None] * nn, axis=1)
        m = (1 - smoothstep(0.0068, 0.0078, rad)) * (np.abs(along) < 0.012)
        col = blend(col, m, BUTTON)
        holes = (np.abs(rad - 0.0022) < 0.0009) * m
        col = col * (1 - 0.35 * holes[:, None])

    # погоны: строчка по краю
    for s in (-1, 1):
        sm = body.strap_mask(p, s)
        edge = np.clip(sm * (1 - sm) * 4, 0, 1)
        col = blend(col, edge * 0.8, BORDER)

    # липучки на рукавах (снаружи плеча): у опущенной левой руки — сбоку, у поднятой правой — сверху
    P = body.pose
    for S, E, outward in ((P.S_L, P.E_L, np.array([1.0, 0.0, 0.0])), (P.S_R, P.E_R, np.array([0.0, 1.0, 0.25]))):
        ax = normalize(E - S)
        out = normalize(outward - ax * (outward @ ax))
        side = np.cross(ax, out)
        q = p - S
        t = q @ ax
        sd = q @ side
        facing = smoothstep(0.35, 0.7, n @ out)
        m = rect_mask(t, sd, (0.07, 0.165, -0.04, 0.04)) * facing
        col = blend(col, m, BORDER)
        m2 = rect_mask(t, sd, (0.072, 0.163, -0.038, 0.038)) * facing
        col = blend(col, m2, VELCRO * 1.08)

    # подол, манжеты — строчки
    hem = (np.abs(y - (HEM_Y + 0.012)) < 0.0008) & (which == 0) & (y < 0.82)
    col = blend(col, hem * 0.5, BORDER)

    # кисти
    sk = which == 1
    if sk.any():
        tone = SKIN * (0.94 + 0.08 * value_noise(p[sk], 0.006, 61)[:, None])
        col[sk] = tone
        col = hand_detail(body, p, n, col, sk)
    # берцы: кожа, шнуровка спереди, подошва
    bt = which == 2
    if bt.any():
        q = p[bt]
        lc = LEATHER * (0.9 + 0.2 * value_noise(q, 0.004, 71)[:, None])
        col[bt] = lc
    so = which == 3
    if so.any():
        col[so] = SOLE
    lace = laces(body, p, n) * bt
    col = blend(col, lace, LACE * 0.6)
    return col


def laces(body, p, n):
    """Шнуровка: косые полоски на передней стороне голенища."""
    P = body.pose
    out = np.zeros(len(p))
    for s in (-1, 1):
        A = P.ankle * [s, 1, 1]
        fd = np.array([s * np.sin(P.toe_out), 0.0, np.cos(P.toe_out)])
        side = normalize([fd[2], 0.0, -fd[0]])
        q = p - np.array([A[0], 0.0, A[2]])
        fwd = q @ fd
        lat = q @ side
        y = p[:, 1]
        front = (fwd > 0.03) & (y > 0.07) & (y < 0.21) & (np.abs(lat) < 0.022)
        phase = (y * 55.0 + np.abs(lat) * 40.0) % 1.0
        out = np.maximum(out, front * (phase < 0.28))
    return out.astype(np.float64)


def hand_detail(body, p, n, col, sk):
    """Пальцы: тёмные бороздки между ними, складки на суставах, ногти."""
    P = body.pose
    for W, axes in ((P.W_R, P.R_axes), (P.W_L, P.L_axes)):
        x_ax, y_ax, z_ax = axes
        q = p - W
        lx, ly, lz = q @ x_ax, q @ y_ax, q @ z_ax
        near = sk & (np.abs(lx) < 0.06) & (lz > -0.03) & (lz < 0.2)
        fingers = lz > body.KNUCKLE - 0.004
        groove = np.zeros(len(p))
        for g in (0.019, 0.0, -0.0185):
            groove = np.maximum(groove, 1 - smoothstep(0.0004, 0.0013, np.abs(lx - g)))
        col = blend(col, groove * fingers * near * 0.55, np.array([150, 105, 92]) / 255)
        # складки на средних фалангах (тыльная сторона)
        for j in (0.128, 0.152):
            crease = (1 - smoothstep(0.0005, 0.0018, np.abs(lz - j))) * (ly > 0.0) * fingers * near
            col = blend(col, crease * 0.25, np.array([170, 120, 105]) / 255)
        # ногти у кончиков
        for off, ln, r0, r1 in body.FINGERS:
            tip = body.KNUCKLE - 0.006 + ln
            nail = (lz > tip - 0.013) & (lz < tip + 0.002) & (np.abs(lx - off) < r1 * 0.75) & (ly > r1 * 0.2) & near
            col = blend(col, nail * 0.6, np.array([236, 196, 186]) / 255)
    return col
