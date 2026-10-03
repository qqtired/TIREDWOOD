"""Сетка тела из SDF и запекание её текстуры: marching cubes → упрощение → развёртка xatlas →
растеризация развёртки на видеокарте (позиции и нормали в каждом текселе) → краска + затенение (AO).
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.measure import marching_cubes

LO = np.array([-0.53, -0.004, -0.20])
HI = np.array([0.30, 1.73, 0.32])


def sdf_grid(fn, step, lo=LO, hi=HI, chunk=12):
    xs = np.arange(lo[0], hi[0], step)
    ys = np.arange(lo[1], hi[1], step)
    zs = np.arange(lo[2], hi[2], step)
    vol = np.zeros((len(xs), len(ys), len(zs)), np.float32)
    X, Z = np.meshgrid(xs, zs, indexing='ij')
    for j0 in range(0, len(ys), chunk):
        yy = ys[j0:j0 + chunk]
        p = np.stack(np.broadcast_arrays(X[:, None, :], yy[None, :, None], Z[:, None, :]), -1)
        vol[:, j0:j0 + chunk, :] = fn(p)
    return vol


def signed_volume(verts, faces):
    """Объём замкнутой сетки: > 0, если треугольники обходят против часовой снаружи (как ждёт three.js)."""
    a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    return float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6)


def extract(fn, step, target_faces):
    import fast_simplification
    vol = sdf_grid(fn, step)
    verts, faces, _, _ = marching_cubes(vol, 0.0, spacing=(step, step, step))
    verts = verts + LO
    faces = faces.astype(np.int64)
    ratio = 1 - target_faces / len(faces)
    if ratio > 0:
        verts, faces = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int32), target_reduction=ratio)
    verts, faces = np.asarray(verts, np.float64), np.asarray(faces, np.int64)
    # вывернутую сетку three.js отсекает как «изнанку»: снаружи видна внутренняя сторона спины
    if signed_volume(verts, faces) < 0:
        faces = faces[:, [0, 2, 1]]
    return verts, faces


def sdf_normals(fn, p, e=0.0008):
    g = np.zeros_like(p)
    for k in range(3):
        d = np.zeros(3)
        d[k] = e
        g[:, k] = fn(p + d) - fn(p - d)
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-12)


def unwrap(verts, faces, resolution, padding=4):
    import xatlas
    atlas = xatlas.Atlas()
    atlas.add_mesh(verts.astype(np.float32), faces.astype(np.uint32))
    co = xatlas.ChartOptions()
    co.max_iterations = 2
    po = xatlas.PackOptions()
    po.resolution = resolution
    po.padding = padding
    po.bilinear = True
    po.rotate_charts = True
    atlas.generate(co, po)
    vmap, idx, uv = atlas[0]
    return vmap.astype(np.int64), idx.astype(np.int64), uv.astype(np.float64)


def raster_uv(uv, idx, attrs, size):
    """Растеризация треугольников в развёртке: для каждого текселя — интерполированные атрибуты (N×3 каждый)."""
    import moderngl
    ctx = moderngl.create_standalone_context()
    n_attr = len(attrs)
    outs = ', '.join(f'out vec3 a{i}' for i in range(n_attr))
    vs = '#version 330\nin vec2 uv;\n' + ''.join(f'in vec3 i{i};\nout vec3 v{i};\n' for i in range(n_attr)) + \
        'void main(){ gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);' + ''.join(f' v{i} = i{i};' for i in range(n_attr)) + ' }'
    fs = '#version 330\n' + ''.join(f'in vec3 v{i};\nlayout(location={i}) out vec4 o{i};\n' for i in range(n_attr)) + \
        'void main(){' + ''.join(f' o{i} = vec4(v{i}, 1.0);' for i in range(n_attr)) + ' }'
    prog = ctx.program(vertex_shader=vs, fragment_shader=fs)
    data = np.hstack([uv] + list(attrs)).astype('f4')
    vbo = ctx.buffer(data.tobytes())
    ibo = ctx.buffer(idx.astype('i4').tobytes())
    fmt = '2f ' + ' '.join(['3f'] * n_attr)
    vao = ctx.vertex_array(prog, [(vbo, fmt, 'uv', *[f'i{i}' for i in range(n_attr)])], ibo)
    texs = [ctx.texture((size, size), 4, dtype='f4') for _ in range(n_attr)]
    fbo = ctx.framebuffer(texs)
    fbo.use()
    fbo.clear(0, 0, 0, 0)
    vao.render()
    res = [np.frombuffer(t.read(), 'f4').reshape(size, size, 4)[::-1].copy() for t in texs]
    return res  # строка 0 — верх картинки (v = 1)


def dilate(img, mask, px=8):
    """Залить пустые тексели вокруг островов цветом ближайшего заполненного (против швов на мипах)."""
    _, (ii, jj) = ndi.distance_transform_edt(~mask, return_indices=True)
    return np.where(mask[..., None], img, img[ii, jj])


def ambient_occlusion(fn, p, n, steps=(0.006, 0.014, 0.028, 0.05), weights=(0.45, 0.3, 0.2, 0.1), chunk=400000):
    """Затенение в складках по полю расстояний (приём И. Квилеза)."""
    ao = np.zeros(len(p))
    for i0 in range(0, len(p), chunk):
        pp, nn = p[i0:i0 + chunk], n[i0:i0 + chunk]
        occ = np.zeros(len(pp))
        for h, w in zip(steps, weights):
            d = fn(pp + nn * h)
            occ += w * np.clip((h - d) / h, 0, 1)
        ao[i0:i0 + chunk] = occ
    return np.clip(1 - 0.85 * ao, 0.25, 1)
