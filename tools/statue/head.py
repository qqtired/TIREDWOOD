"""Голова статуи по фото: форма из точек MediaPipe и силуэта, текстура проецируется с фото.

Пространство головы: метры, начало — середина между зрачками, X — к левому плечу модели
(на фото вправо), Y — вверх, Z — вперёд (к фотографу). Фото считаем ортографическим.
Поверхность — замкнутая «звёздная» r(φ, θ) вокруг центра черепа C: лицо — по точкам MediaPipe,
остальное — суперэллипсы по высоте (ширина из силуэта на фото, глубина из типового профиля головы).
"""
from dataclasses import dataclass
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import CloughTocher2DInterpolator, PchipInterpolator

HERE = Path(__file__).parent
W = H = 1024
IPD = 0.065  # межзрачковое расстояние взрослого мужчины, м

# Сетка поверхности: долгота φ (0 — вперёд, +π/2 — влево по модели) и широта θ
N_PHI = 200
N_THETA = 100


@dataclass
class Photo:
    rgb: np.ndarray  # H×W×3, 0…1
    fg: np.ndarray  # не фон (голова и плечи)
    s: float  # метров на пиксель
    u0: float
    v0: float
    pts: np.ndarray  # 478×3 точки лица в пространстве головы
    tess: list
    oval: list

    def to_px(self, X, Y):
        return X / self.s + self.u0, -Y / self.s + self.v0

    def to_head(self, u, v):
        return (u - self.u0) * self.s, -(v - self.v0) * self.s


def load_photo() -> Photo:
    rgb = np.asarray(Image.open(HERE / 'photo.webp').convert('RGB'), np.float32) / 255
    d = json.loads((HERE / 'landmarks.json').read_text())
    P = np.array(d['pts'])
    u, v, z = P[:, 0] * W, P[:, 1] * H, P[:, 2] * W
    s = IPD / np.hypot(u[468] - u[473], v[468] - v[473])
    u0, v0 = (u[468] + u[473]) / 2, (v[468] + v[473]) / 2
    pts = np.stack([(u - u0) * s, -(v - v0) * s, -z * s], 1)
    # фон: светлый и почти серый, связан с краем кадра
    mx, mn = rgb.max(2), rgb.min(2)
    bg = (mn > 200 / 255) & (mx - mn < 28 / 255)
    lab, _ = ndi.label(bg)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border))
    fg = ndi.binary_fill_holes(ndi.binary_opening(fg, iterations=2))
    return Photo(rgb, fg, s, u0, v0, pts, d['tess'], d['oval'])


def oval_loop(oval: list) -> list:
    """Рёбра овала лица → замкнутый обход вершин."""
    nxt = {}
    for a, b in oval:
        nxt.setdefault(a, []).append(b)
        nxt.setdefault(b, []).append(a)
    start = oval[0][0]
    loop = [start]
    prev = None
    cur = start
    while True:
        cand = [n for n in nxt[cur] if n != prev]
        n = cand[0]
        if n == start:
            break
        loop.append(n)
        prev, cur = cur, n
    return loop


# ---------------------------------------------------------------- профиль черепа

def silhouette_halfwidths(ph: Photo):
    """Полуширина головы влево/вправо на каждой высоте Y (без ушей) и выступ ушей."""
    rows = np.arange(H)
    left = np.full(H, np.nan)
    right = np.full(H, np.nan)
    for v in range(30, 700):
        xs = np.where(ph.fg[v])[0]
        if len(xs):
            left[v], right[v] = xs.min(), xs.max()
    # уши: строки, где контур выпирает; кость под ними — линейно между строками над и под ухом
    ear_top, ear_bot = 332, 466
    skull_l, skull_r = left.copy(), right.copy()
    for arr in (skull_l, skull_r):
        a, b = arr[ear_top - 2], arr[ear_bot + 2]
        t = (rows[ear_top:ear_bot] - (ear_top - 2)) / (ear_bot + 2 - (ear_top - 2))
        arr[ear_top:ear_bot] = a + (b - a) * t
    ear_l = np.clip(skull_l - left, 0, None)
    ear_r = np.clip(right - skull_r, 0, None)
    ear_l[:ear_top] = ear_l[ear_bot:] = 0
    ear_r[:ear_top] = ear_r[ear_bot:] = 0
    # ниже воротника — ширина шеи
    neck_v = 560
    skull_l[neck_v:] = skull_l[neck_v]
    skull_r[neck_v:] = skull_r[neck_v]
    top_v = int(np.where(~np.isnan(left))[0][0])
    # в пространство головы
    Y = -(rows - ph.v0) * ph.s
    aR = -(skull_l - ph.u0) * ph.s  # сторона X < 0 (правая у модели, на фото слева)
    aL = (skull_r - ph.u0) * ph.s
    eR = ear_l * ph.s
    eL = ear_r * ph.s
    ok = rows >= top_v
    aR = ndi.gaussian_filter1d(np.nan_to_num(aR, nan=0.0), 2.0)
    aL = ndi.gaussian_filter1d(np.nan_to_num(aL, nan=0.0), 2.0)
    aR[~ok] = 0
    aL[~ok] = 0
    y_top = -(top_v - ph.v0) * ph.s
    return Y[::-1].copy(), aR[::-1].copy(), aL[::-1].copy(), eR[::-1].copy(), eL[::-1].copy(), y_top


class Skull:
    """Срезы по высоте: суперэллипс с полушириной из силуэта и глубиной из профиля."""

    def __init__(self, ph: Photo):
        self.Y, self.aR, self.aL, self.eR, self.eL, self.y_top = silhouette_halfwidths(ph)
        z9 = ph.pts[9, 2]  # переносица (глабелла)
        # профиль спереди и сзади по средней линии (Y, Z), Z отсчитан от глабеллы
        front = [(-0.22, -0.035), (-0.17, -0.045), (-0.13, -0.045), (-0.118, -0.032), (-0.108, -0.012), (-0.095, -0.006),
                 (-0.06, 0.0), (-0.02, 0.004), (0.016, 0.0), (0.05, -0.007), (0.066, -0.006), (0.085, -0.010),
                 (0.10, -0.018), (0.115, -0.032)]
        back = [(-0.22, -0.142), (-0.15, -0.142), (-0.11, -0.150), (-0.08, -0.165), (-0.05, -0.183), (-0.02, -0.196),
                (0.01, -0.203), (0.04, -0.204), (0.07, -0.196), (0.095, -0.178), (0.115, -0.150)]
        fy, fz = zip(*front)
        by, bz = zip(*back)
        self.zf = PchipInterpolator(fy, np.array(fz) + z9, extrapolate=True)
        self.zb = PchipInterpolator(by, np.array(bz) + z9, extrapolate=True)
        self.y_round = 0.098  # выше — купол: глубина сжимается вместе с шириной
        self.y_bottom = -0.21
        self.n = 2.35

    def a(self, y, side):
        arr = self.aL if side > 0 else self.aR
        return np.interp(y, self.Y, arr)

    def F(self, p):
        """< 0 внутри."""
        x, y, z = p[..., 0], p[..., 1], p[..., 2]
        yc = np.minimum(y, self.y_round)
        zf, zb = self.zf(yc), self.zb(yc)
        zc = (zf + zb) / 2
        d = (zf - zb) / 2
        a = np.where(x >= 0, np.interp(y, self.Y, self.aL), np.interp(y, self.Y, self.aR))
        ar = np.where(x >= 0, np.interp(self.y_round, self.Y, self.aL), np.interp(self.y_round, self.Y, self.aR))
        top = y > self.y_round
        d = np.where(top, d * np.clip(a / np.maximum(ar, 1e-6), 0, 1), d)
        a = np.maximum(a, 1e-5)
        d = np.maximum(d, 1e-5)
        f = (np.abs(x) / a) ** self.n + (np.abs(z - zc) / d) ** self.n - 1
        f = np.where((y > self.y_top) | (y < self.y_bottom), 1.0, f)
        return f


def directions(n_phi=N_PHI, n_theta=N_THETA):
    phi = np.linspace(-np.pi, np.pi, n_phi, endpoint=False) + np.pi / n_phi
    theta = np.linspace(-np.pi / 2, np.pi / 2, n_theta + 2)[1:-1]
    TH, PH = np.meshgrid(theta, phi, indexing='ij')
    d = np.stack([np.cos(TH) * np.sin(PH), np.sin(TH), np.cos(TH) * np.cos(PH)], -1)
    return phi, theta, d


def ray_skull(skull: Skull, C, d, r_max=0.3, iters=40):
    """Радиус пересечения луча из C с поверхностью черепа (бисекция)."""
    lo = np.full(d.shape[:-1], 0.005)
    hi = np.full(d.shape[:-1], r_max)
    for _ in range(iters):
        mid = (lo + hi) / 2
        inside = skull.F(C + d * mid[..., None]) < 0
        lo = np.where(inside, mid, lo)
        hi = np.where(inside, hi, mid)
    return (lo + hi) / 2


def inside_polygon(x, y, px, py):
    """Точки (x, y) внутри многоугольника (px, py) — чётность пересечений луча."""
    inside = np.zeros(x.shape, bool)
    n = len(px)
    for i in range(n):
        x0, y0, x1, y1 = px[i], py[i], px[(i + 1) % n], py[(i + 1) % n]
        cross = ((y0 > y) != (y1 > y)) & (x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-300) + x0)
        inside ^= cross
    return inside


def to_sph(p, C):
    q = p - C
    r = np.linalg.norm(q, axis=-1)
    return np.arctan2(q[..., 0], q[..., 2]), np.arcsin(q[..., 1] / r), r


# внутренний контур губ: при закрытом рте верхняя и нижняя губа совпадают на фото, но не по глубине
INNER_LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 95, 88, 178, 87, 14, 317, 402, 318, 324]


@dataclass
class HeadShape:
    C: np.ndarray
    phi: np.ndarray
    theta: np.ndarray
    r: np.ndarray  # n_theta × n_phi
    face: np.ndarray  # маска «лицо из MediaPipe»
    ear: np.ndarray  # маска ушей


def harmonic_fill(val, known, free, iters=1500):
    """Гладко продолжить val из known в free (усреднение соседей, φ по кругу); остальное — 0."""
    v = np.where(known, val, 0.0)
    for _ in range(iters):
        avg = (np.roll(v, 1, 1) + np.roll(v, -1, 1) + np.vstack([v[:1], v[:-1]]) + np.vstack([v[1:], v[-1:]])) / 4
        v = np.where(free, avg, v)
    return v


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def build_shape(ph: Photo) -> HeadShape:
    skull = Skull(ph)
    z9 = ph.pts[9, 2]
    C = np.array([0.0, 0.009, z9 - 0.098])
    phi, theta, d = directions()
    r_sk = ray_skull(skull, C, d)
    # сгладить аналитический череп (стыки срезов, купол)
    r_sk = ndi.gaussian_filter(r_sk, (1.5, 1.5), mode=('nearest', 'wrap'))

    # лицо: r по точкам MediaPipe (без внутреннего контура губ), гладкая интерполяция в (φ, θ)
    keep = np.ones(len(ph.pts), bool)
    keep[INNER_LIPS] = False
    fp = ph.pts[keep]
    fphi, fth, fr = to_sph(fp, C)
    interp = CloughTocher2DInterpolator(np.stack([fphi, fth], 1), fr)
    PH, TH = np.meshgrid(phi, theta)
    r_face = interp(PH, TH)
    loop = oval_loop(ph.oval)
    ophi, oth, _ = to_sph(ph.pts[loop], C)
    face = inside_polygon(PH, TH, ophi, oth) & ~np.isnan(r_face)
    face = ndi.binary_erosion(face, iterations=1)

    # разница «лицо − череп» продолжается наружу гармонически и гаснет к краю полосы ~4 см
    delta = np.where(face, r_face - r_sk, 0.0)
    dist = ndi.distance_transform_edt(~face)
    cell = (2 * np.pi / N_PHI) * 0.095
    band = 0.04 / cell
    free = (~face) & (dist < band)
    ext = harmonic_fill(delta, face, free)
    r = np.where(face, r_face, r_sk + ext)

    # уши: овал с завитком сзади и чашей внутри; высота выступа — по силуэту ушей на фото
    P = C + d * r[..., None]
    X, Y, Z = P[..., 0], P[..., 1], P[..., 2]
    ear = np.zeros_like(r)
    for sign, e_arr in ((-1, skull.eR), (1, skull.eL)):
        ys = skull.Y[e_arr > 0.0015]
        y_hi, y_lo = ys.max(), ys.min()
        yc = (y_hi + y_lo) / 2
        ay = (y_hi - y_lo) / 2 + 0.002
        zc = -0.091
        tilt = np.radians(16)  # верх уха отклонён назад
        dy, dz = Y - yc, Z - zc
        ly = dy * np.cos(tilt) - dz * np.sin(tilt)
        lz = dy * np.sin(tilt) + dz * np.cos(tilt)
        az = 0.0175 * (0.72 + 0.28 * smoothstep(-0.6 * ay, 0.3 * ay, ly))  # мочка уже
        rho = np.sqrt((ly / ay) ** 2 + (lz / az) ** 2)
        e_max = np.interp(np.clip(Y, y_lo, y_hi), skull.Y, e_arr)
        e_max = np.maximum(ndi.gaussian_filter(e_max, 2.0), 0.004)
        h = np.clip(e_max * 1.35 + 0.003, 0.005, 0.022)
        rise = 0.3 + 0.7 * smoothstep(0.7, -0.75, lz / az)  # от переднего края к завитку
        edge = 1 - smoothstep(0.86, 1.0, rho)
        bowl = 0.5 * (1 - smoothstep(0.0, 0.5, np.sqrt(((ly + 0.15 * ay) / (0.55 * ay)) ** 2 + ((lz - 0.1 * az) / (0.55 * az)) ** 2)))
        side = (X * sign) > 0.03
        ear += np.where(side, h * rise * edge * (1 - bowl), 0.0)
    ear = ndi.gaussian_filter(ear, (0.6, 0.6), mode=('nearest', 'wrap'))
    r = r + ear
    return HeadShape(C, phi, theta, r, face, ear > 0.002)


def mesh(shape: HeadShape):
    """Сетка-«глобус»: столбцы по φ с повтором шва (для развёртки), полюса отдельными вершинами."""
    phi, theta, r = shape.phi, shape.theta, shape.r
    nt, npf = r.shape
    phi_c = np.concatenate([phi, phi[:1] + 2 * np.pi])
    r_c = np.concatenate([r, r[:, :1]], 1)
    TH, PH = np.meshgrid(theta, phi_c, indexing='ij')
    d = np.stack([np.cos(TH) * np.sin(PH), np.sin(TH), np.cos(TH) * np.cos(PH)], -1)
    pos = shape.C + d * r_c[..., None]
    uv = np.stack([(PH + np.pi) / (2 * np.pi), (TH + np.pi / 2) / np.pi], -1)
    pos = pos.reshape(-1, 3)
    uv = uv.reshape(-1, 2)
    cols = npf + 1
    idx = []
    for j in range(nt - 1):
        a = j * cols + np.arange(npf)
        b = a + 1
        c = a + cols
        dd = c + 1
        idx.append(np.stack([a, b, c], 1))
        idx.append(np.stack([b, dd, c], 1))
    # полюса
    south = len(pos)
    north = south + 1
    ring0 = pos[:npf]
    ringN = pos[(nt - 1) * cols:(nt - 1) * cols + npf]
    pos = np.vstack([pos, ring0.mean(0) - [0, 0.001, 0], ringN.mean(0) + [0, 0.0005, 0]])
    uv = np.vstack([uv, [0.5, 0.0], [0.5, 1.0]])
    a = np.arange(npf)
    idx.append(np.stack([np.full(npf, south), a + 1, a], 1))
    top = (nt - 1) * cols + a
    idx.append(np.stack([np.full(npf, north), top, top + 1], 1))
    idx = np.vstack(idx).astype(np.int64)
    nor = vertex_normals(pos, idx)
    # нормали шва одинаковые с обеих сторон
    for j in range(nt):
        i0, i1 = j * cols, j * cols + npf
        n = nor[i0] + nor[i1]
        nor[i0] = nor[i1] = n / np.linalg.norm(n)
    return pos, nor, uv, idx


def vertex_normals(pos, idx):
    v0, v1, v2 = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    nor = np.zeros_like(pos)
    for k in range(3):
        np.add.at(nor, idx[:, k], fn)
    return nor / np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-12)


def soft_normals(nor, n_theta, n_phi, sigma=8.0, keep=0.35):
    """Нормали для света в игре. Тени лица (глазницы, под носом) уже есть на фото — если свет сцены
    затеняет их ещё раз, лицо выходит с чёрными глазницами. Поэтому поле нормалей размываем по
    сетке-«глобусу» (σ в ячейках, ~3 мм каждая): свет даёт только крупную форму головы,
    а настоящих нормалей подмешиваем долю keep. Порядок вершин — как в mesh()."""
    cols = n_phi + 1
    g = nor[:n_theta * cols].reshape(n_theta, cols, 3)[:, :n_phi]
    s = ndi.gaussian_filter(g, (sigma, sigma, 0), mode=('nearest', 'wrap', 'nearest'))
    s /= np.maximum(np.linalg.norm(s, axis=-1, keepdims=True), 1e-12)
    b = keep * g + (1 - keep) * s
    b /= np.maximum(np.linalg.norm(b, axis=-1, keepdims=True), 1e-12)
    out = nor.copy()
    out[:n_theta * cols] = np.concatenate([b, b[:, :1]], 1).reshape(-1, 3)
    return out


# ---------------------------------------------------------------- текстура

TEX_W, TEX_H = 2048, 1024
SKIN = np.array([228, 192, 182]) / 255  # кожа щёк/шеи на фото (sRGB)
SKIN_NECK = np.array([214, 180, 168]) / 255
HAIR = np.array([52, 44, 41]) / 255
HAIR_FADE = np.array([112, 100, 96]) / 255


def head_pixels(ph: Photo) -> np.ndarray:
    """Пиксели головы на фото: кожа и волосы, без формы и фона."""
    rgb = ph.rgb
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    skin = (r - b > 0.12) & (r > 0.45) & (r >= g)
    dark = (r + g + b) / 3 < 0.42
    v = np.arange(H)[:, None]
    hair = dark & (v < 470)
    m = ph.fg & (skin | hair) & (v < 700)
    m = ndi.binary_opening(m, iterations=2)
    lab, n = ndi.label(m)
    keep = lab == lab[400, 512]
    keep = ndi.binary_fill_holes(keep)
    # над линией воротника — всё, что не фон
    return keep & ph.fg


def extend_colors(rgb, mask, iters=6):
    """Залить всё вне маски цветом ближайшего пикселя маски (чтобы на краях не налипал фон)."""
    _, (ii, jj) = ndi.distance_transform_edt(~mask, return_indices=True)
    out = rgb[ii, jj]
    # смягчить залитое
    soft = np.stack([ndi.gaussian_filter(out[..., c], 3) for c in range(3)], -1)
    return np.where(mask[..., None], rgb, soft)


def depth_map(pos, idx, ph: Photo):
    """Глубина головы (наибольший Z) в пикселях фото — для проверки, видна ли точка с фотоаппарата."""
    import moderngl
    ctx = moderngl.create_standalone_context()
    u, v = ph.to_px(pos[:, 0], pos[:, 1])
    ndc = np.stack([u / W * 2 - 1, 1 - v / H * 2, np.zeros_like(u)], 1)
    zmin, zmax = pos[:, 2].min(), pos[:, 2].max()
    ndc[:, 2] = -((pos[:, 2] - zmin) / (zmax - zmin) * 2 - 1) * 0.999  # ближе к камере — меньше
    prog = ctx.program(
        vertex_shader='#version 330\nin vec3 p; in float z; out float vz; void main(){ vz = z; gl_Position = vec4(p, 1.0); }',
        fragment_shader='#version 330\nin float vz; out vec4 f; void main(){ f = vec4(vz, 0.0, 0.0, 1.0); }')
    data = np.hstack([ndc, pos[:, 2:3]]).astype('f4')
    vbo = ctx.buffer(data.tobytes())
    ibo = ctx.buffer(idx.astype('i4').tobytes())
    vao = ctx.vertex_array(prog, [(vbo, '3f 1f', 'p', 'z')], ibo)
    tex = ctx.texture((W, H), 4, dtype='f4')
    fbo = ctx.framebuffer([tex], ctx.depth_renderbuffer((W, H)))
    fbo.use()
    ctx.enable(moderngl.DEPTH_TEST)
    fbo.clear(-10.0, 0, 0, 1, depth=1.0)
    vao.render()
    z = np.frombuffer(tex.read(), 'f4').reshape(H, W, 4)[..., 0]
    return z[::-1].copy()  # строка 0 — верх фото


def sample(img, u, v, order=1):
    """Билинейная выборка img[v, u] (пиксельные координаты)."""
    if img.ndim == 2:
        return ndi.map_coordinates(img, [v, u], order=order, mode='nearest')
    return np.stack([ndi.map_coordinates(img[..., c], [v, u], order=order, mode='nearest') for c in range(img.shape[2])], -1)


def value_noise(p, scale, seed=0):
    """Объёмный шум 0…1 (трилинейный по решётке со случайными узлами)."""
    rng = np.random.default_rng(seed)
    perm = rng.random(1 << 16).astype(np.float32)
    q = p / scale
    i = np.floor(q).astype(np.int64)
    f = q - i
    f = f * f * (3 - 2 * f)

    def h(dx, dy, dz):
        k = ((i[..., 0] + dx) * 73856093 ^ (i[..., 1] + dy) * 19349663 ^ (i[..., 2] + dz) * 83492791) & 0xFFFF
        return perm[k]
    x0 = h(0, 0, 0) * (1 - f[..., 0]) + h(1, 0, 0) * f[..., 0]
    x1 = h(0, 1, 0) * (1 - f[..., 0]) + h(1, 1, 0) * f[..., 0]
    x2 = h(0, 0, 1) * (1 - f[..., 0]) + h(1, 0, 1) * f[..., 0]
    x3 = h(0, 1, 1) * (1 - f[..., 0]) + h(1, 1, 1) * f[..., 0]
    y0 = x0 * (1 - f[..., 1]) + x1 * f[..., 1]
    y1 = x2 * (1 - f[..., 1]) + x3 * f[..., 1]
    return y0 * (1 - f[..., 2]) + y1 * f[..., 2]


def surface_at(shape: HeadShape, phi, theta):
    """Точка поверхности и нормаль для массивов (φ, θ) — бикубическая выборка r с переносом по φ."""
    nt, npf = shape.r.shape
    dphi = 2 * np.pi / npf
    ci = (phi - shape.phi[0]) / dphi
    cj = (theta - shape.theta[0]) / (shape.theta[1] - shape.theta[0])
    pad = 4
    rp = np.concatenate([shape.r[:, -pad:], shape.r, shape.r[:, :pad]], 1)
    rr = ndi.map_coordinates(rp, [cj, ci + pad], order=3, mode='nearest')

    def P(ph_, th_, r_):
        return shape.C + np.stack([np.cos(th_) * np.sin(ph_), np.sin(th_), np.cos(th_) * np.cos(ph_)], -1) * r_[..., None]
    p = P(phi, theta, rr)
    e = 1e-3
    rphi = ndi.map_coordinates(rp, [cj, ci + pad + e / dphi], order=3, mode='nearest')
    rth = ndi.map_coordinates(rp, [cj + e / (shape.theta[1] - shape.theta[0]), ci + pad], order=3, mode='nearest')
    tp = P(phi + e, theta, rphi) - p
    tt = P(phi, theta + e, rth) - p
    n = np.cross(tp, tt)
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-12)
    return p, n


def hairline_y(phi):
    """Высота линии роста волос в зависимости от долготы: лоб, виски, над ушами, затылок."""
    a = np.abs(phi)
    pts_a = np.radians([0, 25, 45, 62, 80, 100, 125, 150, 180])
    pts_y = [0.062, 0.058, 0.040, 0.014, 0.006, 0.006, -0.045, -0.078, -0.088]
    return np.interp(a, pts_a, pts_y)


def push_pull(img, wt, levels=10):
    """Заполнить пиксели с малым весом цветом окрестности (пирамида «вниз-вверх»)."""
    pyr = [(img * wt[..., None], wt)]
    for _ in range(levels):
        c, w = pyr[-1]
        if min(w.shape) < 4:
            break
        h2, w2 = c.shape[0] // 2 * 2, c.shape[1] // 2 * 2
        c, w = c[:h2, :w2], w[:h2, :w2]
        cs = c[0::2, 0::2] + c[1::2, 0::2] + c[0::2, 1::2] + c[1::2, 1::2]
        ws = w[0::2, 0::2] + w[1::2, 0::2] + w[0::2, 1::2] + w[1::2, 1::2]
        pyr.append((cs, ws))
    c, w = pyr[-1]
    col = c / np.maximum(w, 1e-6)[..., None]
    for c, w in reversed(pyr[:-1]):
        up = np.repeat(np.repeat(col, 2, 0), 2, 1)
        up = np.pad(up, ((0, c.shape[0] - up.shape[0]), (0, c.shape[1] - up.shape[1]), (0, 0)), mode='edge')
        up = np.stack([ndi.gaussian_filter(up[..., k], 1.0) for k in range(3)], -1)
        own = c / np.maximum(w, 1e-6)[..., None]
        k = np.clip(w, 0, 1)[..., None]
        col = own * k + up * (1 - k)
    return col


def bake_texture(ph: Photo, shape: HeadShape, pos, idx):
    u_t = (np.arange(TEX_W) + 0.5) / TEX_W
    v_t = 1 - (np.arange(TEX_H) + 0.5) / TEX_H
    PHI = u_t[None, :] * 2 * np.pi - np.pi
    THETA = v_t[:, None] * np.pi - np.pi / 2
    PHI, THETA = np.broadcast_arrays(PHI, THETA)
    p, n = surface_at(shape, PHI, THETA)
    X, Y, Z = p[..., 0], p[..., 1], p[..., 2]

    # фото: продлённые цвета головы, видимость с фотоаппарата
    head = head_pixels(ph)
    photo = extend_colors(ph.rgb, head)
    head_in = ndi.gaussian_filter(ndi.binary_erosion(head, iterations=5).astype(np.float32), 3.0)
    zbuf = depth_map(pos, idx, ph)
    up, vp = ph.to_px(X, Y)
    col_photo = sample(photo, up, vp)
    visible = Z >= sample(zbuf, up, vp, order=0) - 0.006
    chin_y = ph.pts[152, 1]
    # шея ниже подбородка — своей краской: на фото там тень и край воротника
    neck = 1 - smoothstep(chin_y + 0.004, chin_y + 0.03, Y) * 1.0
    face_zone = smoothstep(-0.105, -0.07, Z)  # перед ушами
    # волосы и уши на фото надёжны и под острым углом; лицо — только почти анфас
    ear_m = ndi.map_coordinates(shape.ear.astype(np.float32), [(THETA - shape.theta[0]) / (shape.theta[1] - shape.theta[0]), (PHI - shape.phi[0]) / (2 * np.pi / len(shape.phi))], order=1, mode='nearest')
    loose = np.maximum(smoothstep(0.035, 0.06, Y), np.clip(ear_m * 1.5, 0, 1))
    lo = 0.22 - 0.16 * loose
    hi = 0.55 - 0.2 * loose
    w = smoothstep(lo, hi, n[..., 2]) * visible * np.clip(sample(head_in, up, vp) * 1.5 - 0.25, 0, 1)
    w = w * (1 - neck * (1 - 0.0 * face_zone))

    # продлить цвета фото по поверхности, дальше — к краске волос и кожи
    ext = push_pull(col_photo, (w > 0.6).astype(np.float32) * w)

    hy = hairline_y(PHI) + 0.004 * (value_noise(p, 0.004, 7) - 0.5)
    back = smoothstep(np.radians(70), np.radians(140), np.abs(PHI))
    fade_w = 0.010 + 0.022 * back  # на затылке и висках — плавный переход «под машинку»
    hair_amt = smoothstep(hy - 0.003, hy + fade_w, Y)
    # тёмные волосы — сверху; бока и затылок под машинку светлее (как на фото у висков)
    top = smoothstep(0.075, 0.115, Y) * 0.6 + 0.4 * np.clip(n[..., 1], 0, 1) * smoothstep(0.05, 0.1, Y)
    # пряди: на макушке вдоль Z, на боках и затылке — вдоль Y
    up_k = np.clip(n[..., 1], 0, 1)[..., None]
    q_side = p * np.array([1.0, 0.18, 1.0])
    q_top = p * np.array([1.0, 1.0, 0.25])
    streak = value_noise(q_side, 0.0009, 11) * (1 - up_k[..., 0]) + value_noise(q_top, 0.0009, 12) * up_k[..., 0]
    clump = value_noise(p, 0.005, 13)
    hair_col = HAIR_FADE + (HAIR - HAIR_FADE) * (0.3 + 0.7 * top)[..., None]
    hair_col = hair_col * (0.72 + 0.42 * streak[..., None] + 0.18 * (clump[..., None] - 0.5))
    skin_k = smoothstep(-0.02, -0.10, Y)
    skin_col = SKIN + (SKIN_NECK - SKIN) * skin_k[..., None]
    skin_col = skin_col * (0.97 + 0.06 * value_noise(p, 0.003, 3)[..., None])
    paint = skin_col + (hair_col - skin_col) * hair_amt[..., None]
    # расстояние от области фото: рядом — продлённое фото, дальше — краска (по высоте узнаётся по ext)
    far = 1 - ndi.gaussian_filter((w > 0.3).astype(np.float32), 18, mode=('nearest', 'wrap'))
    far = smoothstep(0.25, 0.85, far)
    # детали краски (пряди, поры) накладываются и рядом с фото, чтобы не было «пластика»
    detail = paint / np.maximum(skin_col + (hair_col / np.maximum(0.72 + 0.42 * streak[..., None] + 0.18 * (clump[..., None] - 0.5), 1e-3) - skin_col) * hair_amt[..., None], 1e-3)
    near = ext * (0.85 + 0.15 * detail)
    fill = near + (paint - near) * far[..., None]
    out = fill + (col_photo - fill) * w[..., None]
    img = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))
    return img, w


def head_sdf(shape: HeadShape, to_head, scale=1.0):
    """Приближённое расстояние до головы (для затенения тела); to_head — из пространства тела в пространство головы."""
    nt, npf = shape.r.shape
    dphi = 2 * np.pi / npf
    dth = shape.theta[1] - shape.theta[0]
    pad = 2
    rp = np.concatenate([shape.r[:, -pad:], shape.r, shape.r[:, :pad]], 1)

    def fn(p):
        q = to_head(p) - shape.C
        r = np.linalg.norm(q, axis=-1)
        phi = np.arctan2(q[..., 0], q[..., 2])
        th = np.arcsin(np.clip(q[..., 1] / np.maximum(r, 1e-9), -1, 1))
        rr = ndi.map_coordinates(rp, [(th - shape.theta[0]) / dth, (phi - shape.phi[0]) / dphi + pad], order=1, mode='nearest')
        return (r - rr) * 0.85 * scale
    return fn
