"""Тело статуи: полевая форма ММ-14, поза «отдаёт честь».

Пространство тела: метры, подошвы на y = 0, лицом к +Z, X — к левому плечу модели.
Форма — поле расстояний (SDF) из простых тел: китель (срезы по высоте), рукава и штанины
(конусы со скруглением), кисти, берцы, воротник-стойка, погоны, карманы. Поверхность —
marching cubes. Голова (head.py) ставится сверху: её начало (середина между зрачками)
переносится в HEAD_ORIGIN.
"""
from dataclasses import dataclass, field

import numpy as np

# Голова: середина между зрачками в пространстве тела (рост с причёской ~1,78 м).
# Голова чуть крупнее натуры (как у памятников — лицо лучше читается издали): масштаб вокруг шеи.
HEAD_ORIGIN = np.array([0.0, 1.6556, 0.063])
HEAD_SCALE = 1.05
HEAD_PIVOT = np.array([0.0, -0.155, -0.078])  # точка шеи на уровне воротника, в пространстве головы


def head_to_body(p):
    """Точка из пространства головы — в пространство тела (с увеличением головы)."""
    return HEAD_ORIGIN + HEAD_PIVOT + (np.asarray(p) - HEAD_PIVOT) * HEAD_SCALE


def body_to_head(p):
    return HEAD_PIVOT + (np.asarray(p) - HEAD_ORIGIN - HEAD_PIVOT) / HEAD_SCALE

# ---------------------------------------------------------------- примитивы (p: (..., 3))


def dot(a, b):
    return (a * b).sum(-1)


def length(a):
    return np.sqrt(dot(a, a))


def normalize(v):
    v = np.asarray(v, np.float64)
    return v / np.linalg.norm(v)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def round_cone(p, a, b, r1, r2):
    """Конус со скруглёнными концами (точное расстояние, И. Квилез)."""
    a = np.asarray(a, np.float64)
    b = np.asarray(b, np.float64)
    ba = b - a
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = p - a
    y = pa @ ba
    z = y - l2
    x2 = dot(pa * l2 - y[..., None] * ba, pa * l2 - y[..., None] * ba)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d1 = np.sqrt(x2 + z2) * il2 - r2
    d2 = np.sqrt(x2 + y2) * il2 - r1
    d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d1, np.where(np.sign(y) * a2 * y2 < k, d2, d3))


def ellipsoid(p, c, r):
    q = (p - c) / r
    k0 = length(q)
    k1 = length(q / r)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def frame(z_axis, x_hint):
    """Ортонормированный базис (строки x, y, z): z — вдоль z_axis, x — ближе к x_hint."""
    z = normalize(z_axis)
    x = normalize(np.asarray(x_hint, np.float64) - z * (np.dot(x_hint, z)))
    y = np.cross(z, x)
    return np.stack([x, y, z])


def round_rect_slab(p, center, axes, hx, hz, r, hy):
    """Плита: скруглённый в плане прямоугольник (hx × hz, радиус r) толщиной 2·hy."""
    q = (p - center) @ axes.T
    qx = np.abs(q[..., 0]) - (hx - r)
    qz = np.abs(q[..., 2]) - (hz - r)
    d2 = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qz, 0) ** 2) + np.minimum(np.maximum(qx, qz), 0) - r
    return smax(d2, np.abs(q[..., 1]) - hy, 0.004)


def round_box(p, center, axes, half, r):
    q = (p - center) @ axes.T
    q = np.abs(q) - (np.asarray(half) - r)
    out = length(np.maximum(q, 0.0))
    inside = np.minimum(np.max(q, axis=-1), 0.0)
    return out + inside - r


# ---------------------------------------------------------------- поза


@dataclass
class Pose:
    temple: np.ndarray  # точка у правого виска, куда приходят кончики пальцев
    S_L: np.ndarray = field(default_factory=lambda: np.array([0.172, 1.415, -0.025]))
    E_L: np.ndarray = field(default_factory=lambda: np.array([0.205, 1.10, -0.040]))
    W_L: np.ndarray = field(default_factory=lambda: np.array([0.208, 0.855, -0.012]))
    S_R: np.ndarray = field(default_factory=lambda: np.array([-0.172, 1.415, -0.025]))
    hip: float = 0.088
    knee: np.ndarray = field(default_factory=lambda: np.array([0.090, 0.49, 0.012]))
    ankle: np.ndarray = field(default_factory=lambda: np.array([0.070, 0.10, -0.030]))
    toe_out: float = np.radians(22)  # носки врозь

    def __post_init__(self):
        upper, fore, hand = 0.322, 0.257, 0.185
        u = normalize([-0.85, 0.12, 0.50])  # плечо отведено в сторону и чуть вперёд
        self.E_R = self.S_R + upper * u
        t = self.temple
        self.W_R = self.E_R + (t - self.E_R) * (fore / np.linalg.norm(t - self.E_R))
        self.hand_len = hand
        # правая кисть: от запястья к виску, ладонь вниз, большой палец вперёд
        d = normalize(t - self.W_R)
        width = normalize(np.cross(d, [0, 1, 0]))
        if width[2] < 0:
            width = -width
        self.R_axes = frame(d, width)  # x — к большому пальцу, y — тыльная сторона, z — к пальцам
        if self.R_axes[1][1] < 0:
            self.R_axes[1] = -self.R_axes[1]
        # левая: вниз вдоль шва, ладонь к бедру
        dl = normalize([0.0, -1.0, 0.03])
        self.L_axes = frame(dl, [0, 0, 1])
        if self.L_axes[1][0] < 0:
            self.L_axes[1] = -self.L_axes[1]


def make_pose(head_pts) -> Pose:
    """head_pts — точки MediaPipe в пространстве головы; палец — у наружного края правой брови."""
    brow = head_to_body(head_pts[70])
    temple = brow + np.array([-0.012, 0.006, -0.016])
    return Pose(temple=temple)


# ---------------------------------------------------------------- китель (срезы)

# y, полуширина, перед, спина, показатель суперэллипса
TORSO = np.array([
    [0.775, 0.184, 0.112, -0.126, 2.2],
    [0.830, 0.180, 0.108, -0.126, 2.2],
    [0.900, 0.174, 0.103, -0.122, 2.2],
    [0.980, 0.165, 0.099, -0.115, 2.15],
    [1.060, 0.160, 0.100, -0.110, 2.15],
    [1.140, 0.163, 0.107, -0.111, 2.2],
    [1.220, 0.170, 0.117, -0.116, 2.25],
    [1.300, 0.176, 0.123, -0.120, 2.3],
    [1.370, 0.180, 0.119, -0.121, 2.4],
    [1.420, 0.175, 0.110, -0.114, 2.5],
    [1.455, 0.152, 0.093, -0.102, 2.4],
    [1.480, 0.124, 0.070, -0.091, 2.3],
    [1.500, 0.096, 0.050, -0.085, 2.2],
    [1.515, 0.076, 0.041, -0.080, 2.0],
    [1.535, 0.060, 0.031, -0.075, 2.0],
])
HEM_Y = 0.775
# Воротник-стойка по фото: спереди вырез до 1,52, уже на ~45° от середины стойка поднимается почти
# до челюсти (1,56) и так идёт вокруг шеи. Сзади эллипс глубже, чтобы затылок шеи не проходил насквозь.
COLLAR = dict(zc=-0.02, ai=0.069, bi=0.062, t=0.0085, y0=1.476, y_front=1.521, y_side=1.561, y_back=1.565)


def torso_sd(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    T = TORSO
    a = np.interp(y, T[:, 0], T[:, 1])
    zf = np.interp(y, T[:, 0], T[:, 2])
    zb = np.interp(y, T[:, 0], T[:, 3])
    n = np.interp(y, T[:, 0], T[:, 4])
    zc = (zf + zb) / 2
    d = (zf - zb) / 2
    q = (np.abs(x / a) ** n + np.abs((z - zc) / d) ** n) ** (1 / n)
    sd = (q - 1) * np.minimum(a, d) * 0.92
    sd = smax(sd, HEM_Y - y, 0.006)
    sd = np.maximum(sd, y - T[-1, 0])
    return sd


def ellipse2d(x, z, a, b):
    """Приближённое расстояние до эллипса (отрицательное внутри)."""
    q = np.sqrt((x / a) ** 2 + (z / b) ** 2)
    return (q - 1) * min(a, b)


def collar_sd(p):
    c = COLLAR
    x, y, z = p[..., 0], p[..., 1], p[..., 2] - c['zc']
    outer = ellipse2d(x, z, c['ai'] + c['t'], c['bi'] + c['t'])
    inner = ellipse2d(x, z, c['ai'], c['bi'])
    ring = np.maximum(outer, -inner)
    ang = np.arctan2(np.abs(x) / (c['ai'] + c['t']), z / (c['bi'] + c['t']))  # 0 — перёд, π — спина
    y_top = c['y_front'] + (c['y_side'] - c['y_front']) * smoothstep(0.6, 0.95, ang) + (c['y_back'] - c['y_side']) * smoothstep(1.6, 3.0, ang)
    sd = smax(ring, y - y_top, 0.004)
    return np.maximum(sd, c['y0'] - y)


# ---------------------------------------------------------------- накладные детали (выпуклости ткани)


def front_patch(p, x0, x1, y0, y1, soft=0.0025, front=True):
    """Маска прямоугольника на груди/спине, видимого спереди (по x, y), 0…1."""
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    m = smoothstep(x0 - soft, x0 + soft, x) * (1 - smoothstep(x1 - soft, x1 + soft, x))
    m = m * smoothstep(y0 - soft, y0 + soft, y) * (1 - smoothstep(y1 - soft, y1 + soft, y))
    return m * (smoothstep(0.0, 0.03, z) if front else smoothstep(0.0, 0.03, -z))


# Карманы, клапаны, липучки, нашивки (x0, x1, y0, y1) — по фото, чуть ниже для естественных пропорций
POCKETS = [(-0.168, -0.052, 1.240, 1.372), (0.052, 0.168, 1.240, 1.372)]
FLAPS = [(-0.171, -0.049, 1.343, 1.389), (0.049, 0.171, 1.343, 1.389)]
VELCRO_CHEST = (-0.160, -0.050, 1.393, 1.414)
NAME_TAPE = (0.054, 0.164, 1.393, 1.414)
FLAG = (0.084, 0.136, 1.419, 1.444)
PLACKET = (-0.021, 0.021, HEM_Y, 1.49)


@dataclass
class Body:
    pose: Pose

    # ---------------- части
    def arm_sd(self, p, S, E, W):
        upper = round_cone(p, S, E, 0.057, 0.047)
        fore = round_cone(p, E, W, 0.046, 0.039)
        d = smin(upper, fore, 0.03)
        fd = normalize(W - E)
        cuff = round_cone(p, W - fd * 0.022, W + fd * 0.004, 0.0415, 0.0415)
        return smin(d, cuff, 0.006)

    # пальцы: сдвиг поперёк ладони (к большому пальцу +), длина от костяшек, радиус у основания и у кончика
    FINGERS = ((0.0285, 0.078, 0.0092, 0.0074), (0.0095, 0.086, 0.0094, 0.0076), (-0.0095, 0.081, 0.0091, 0.0073), (-0.0275, 0.066, 0.0084, 0.0068))
    KNUCKLE = 0.098  # от запястья до костяшек

    def hand_sd(self, p, W, axes):
        x_ax, y_ax, z_ax = axes
        palm = round_box(p, W + z_ax * 0.052, axes, (0.040, 0.0125, 0.050), 0.0115)
        d = palm
        for off, ln, r0, r1 in self.FINGERS:
            base = W + z_ax * (self.KNUCKLE - 0.006) + x_ax * off
            tip = base + z_ax * ln + x_ax * (off * 0.08) - y_ax * 0.002
            d = smin(d, round_cone(p, base, tip, r0, r1), 0.006)
        thumb = round_cone(p, W + z_ax * 0.032 + x_ax * 0.034 - y_ax * 0.005, W + z_ax * 0.102 + x_ax * 0.041 - y_ax * 0.003, 0.0112, 0.0088)
        d = smin(d, thumb, 0.010)
        wrist = round_cone(p, W - z_ax * 0.02, W + z_ax * 0.02, 0.025, 0.027)
        return smin(d, wrist, 0.01)

    def leg_sd(self, p, s):
        P = self.pose
        H = np.array([s * P.hip, 0.90, -0.005])
        K = P.knee * [s, 1, 1]
        A = P.ankle * [s, 1, 1]
        thigh = round_cone(p, H, K, 0.089, 0.069)
        shin = round_cone(p, K, A + [0, 0.1, 0], 0.067, 0.058)
        d = smin(thigh, shin, 0.03)
        # заправлено в берцы: напуск над голенищем
        blouse = round_cone(p, A + [0, 0.10, 0], A + [0, 0.15, 0], 0.066, 0.062)
        return smin(d, blouse, 0.02)

    def boot_parts(self, p, s):
        P = self.pose
        A = P.ankle * [s, 1, 1]
        fd = np.array([s * np.sin(P.toe_out), 0.0, np.cos(P.toe_out)])
        side = normalize([fd[2], 0.0, -fd[0]])
        axes = np.stack([side, [0, 1, 0], fd])
        base = np.array([A[0], 0.0, A[2]])
        shaft = round_cone(p, base + [0, 0.05, 0], base + [0, 0.215, 0], 0.053, 0.058)
        heel = ellipsoid(p, base + [0, 0.062, 0] - fd * 0.014, np.array([0.049, 0.048, 0.06]))
        instep = ellipsoid(p, base + [0, 0.066, 0] + fd * 0.055, np.array([0.05, 0.048, 0.085]))
        toe = ellipsoid(p, base + [0, 0.047, 0] + fd * 0.135, np.array([0.048, 0.031, 0.068]))
        upper = smin(smin(smin(shaft, heel, 0.03), instep, 0.035), toe, 0.04)
        upper = np.maximum(upper, 0.02 - p[..., 1])
        sole = round_rect_slab(p, base + [0, 0.0125, 0] + fd * 0.062, axes, 0.054, 0.150, 0.046, 0.0125)
        return upper, sole

    @staticmethod
    def strap_mask(p, s):
        """Погон: полоса на плече от воротника к плечу (вид сверху), 0…1."""
        a = np.array([s * 0.086, -0.017])
        b = np.array([s * 0.195, -0.022])
        d = b - a
        L = np.linalg.norm(d)
        d /= L
        q = np.stack([p[..., 0], p[..., 2]], -1) - a
        t = q @ d
        w = np.abs(q @ np.array([-d[1], d[0]]))
        m = smoothstep(-0.004, 0.0, t) * (1 - smoothstep(L, L + 0.004, t)) * (1 - smoothstep(0.0225, 0.0255, w))
        return m * smoothstep(1.40, 1.43, p[..., 1])

    @staticmethod
    def disc_mask(p, c, n, r):
        """Пуговица: диск радиуса r вокруг точки c, если смотреть по нормали n."""
        n = normalize(n)
        q = p - np.asarray(c)
        along = q @ n
        rad = length(q - along[..., None] * n)
        return (1 - smoothstep(r - 0.0015, r + 0.0005, rad)) * (1 - smoothstep(0.012, 0.03, np.abs(along)))

    # ---------------- всё вместе
    def parts(self, p):
        P = self.pose
        jacket = torso_sd(p)
        # накладные детали кителя
        bump = 0.0025 * front_patch(p, *PLACKET)
        for r in POCKETS:
            bump = bump + 0.003 * front_patch(p, *r)
        for r in FLAPS:
            bump = np.maximum(bump, 0.0062 * front_patch(p, *r, soft=0.0018))
        bump = bump + 0.0013 * (front_patch(p, *VELCRO_CHEST) + front_patch(p, *NAME_TAPE) + front_patch(p, *FLAG))
        jacket = jacket - bump
        arms_k = 0.035 * smoothstep(1.25, 1.36, p[..., 1])  # плечо сливается с кителем, ниже рука просто прилегает
        arm_l = self.arm_sd(p, P.S_L, P.E_L, P.W_L)
        arm_r = self.arm_sd(p, P.S_R, P.E_R, P.W_R)
        h = np.maximum(arms_k, 1e-4)
        def ksmin(a, b):
            hh = np.maximum(h - np.abs(a - b), 0.0) / h
            return np.minimum(a, b) - hh * hh * h * 0.25
        cloth = ksmin(jacket, arm_l)
        cloth = smin(cloth, arm_r, 0.035)
        cloth = smin(cloth, collar_sd(p), 0.004)
        strap = self.strap_mask(p, -1) + self.strap_mask(p, 1)
        cloth = cloth - 0.0058 * strap
        btn = np.zeros(p.shape[:-1])
        for c, n in self.button_spots():
            btn = np.maximum(btn, self.disc_mask(p, c, n, 0.0075))
        cloth = cloth - 0.0032 * btn
        pelvis = ellipsoid(p, np.array([0.0, 0.84, -0.008]), np.array([0.168, 0.09, 0.118]))
        legs = smin(self.leg_sd(p, -1), self.leg_sd(p, 1), 0.035)
        trousers = smin(legs, pelvis, 0.04)
        # накладные карманы брюк по бокам бёдер
        for s in (-1, 1):
            x, y, z = p[..., 0], p[..., 1], p[..., 2]
            m = smoothstep(0.10, 0.12, s * x) * smoothstep(0.49, 0.495, y) * (1 - smoothstep(0.665, 0.67, y))
            m = m * smoothstep(-0.075, -0.07, z) * (1 - smoothstep(0.07, 0.075, z))
            fl = smoothstep(0.10, 0.12, s * x) * smoothstep(0.618, 0.622, y) * (1 - smoothstep(0.675, 0.68, y))
            fl = fl * smoothstep(-0.078, -0.073, z) * (1 - smoothstep(0.073, 0.078, z))
            trousers = trousers - 0.004 * m - 0.004 * fl
        cloth = np.minimum(cloth, trousers)
        cloth = cloth - 0.0016 * (fold_noise(p) - 0.5)
        hands = np.minimum(self.hand_sd(p, P.W_R, P.R_axes), self.hand_sd(p, P.W_L, P.L_axes))
        boots, soles = [], []
        for s in (-1, 1):
            u, so = self.boot_parts(p, s)
            boots.append(u)
            soles.append(so)
        boot = np.minimum(*boots)
        sole = np.minimum(*soles)
        return dict(cloth=cloth, hands=hands, boot=boot, sole=sole, trousers=trousers)

    def button_spots(self):
        spots = []
        for (x0, x1, y0, y1) in FLAPS:
            x = (x0 + x1) / 2
            z = float(torso_front_z(x, 1.356)) + 0.0062
            spots.append(([x, 1.356, z], [0, 0.05, 1]))
        for s in (-1, 1):
            spots.append(([s * 0.101, 1.53, -0.0175], [0.0, 1.0, 0.0]))
        return spots

    def sd(self, p):
        d = self.parts(p)
        out = np.minimum(d['cloth'], d['hands'])
        out = smin(out, d['boot'], 0.012)
        out = np.minimum(out, d['sole'])
        return out


def fold_noise(p):
    """Мягкие складки ткани: низкочастотный шум, вытянутый по вертикали."""
    from head import value_noise
    q = p * np.array([1.0, 0.45, 1.0])
    return 0.65 * value_noise(q, 0.035, 91) + 0.35 * value_noise(q, 0.016, 92)


def torso_front_z(x, y):
    """z передней поверхности кителя в точке (x, y) — для пуговиц."""
    zs = np.linspace(0.0, 0.2, 400)
    p = np.stack([np.full_like(zs, x), np.full_like(zs, y), zs], -1)
    d = torso_sd(p)
    i = np.argmax(d > 0)
    return zs[i]
