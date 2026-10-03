# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = ["numpy", "scipy", "pillow", "scikit-image", "fast-simplification", "xatlas", "moderngl"]
# ///
"""Сборка статуи: модель и текстуры → client/assets/statue/.

    uv run tools/statue/build.py

Нужен landmarks.json (его делает landmarks.py). Идёт ~2 минуты, нужен OpenGL (moderngl) для запекания.
"""
from pathlib import Path
import sys
import time

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import bake  # noqa: E402
import body as B  # noqa: E402
import head as H  # noqa: E402
import paint  # noqa: E402
from export import write_statue  # noqa: E402

OUT = HERE.parent.parent / 'client' / 'assets' / 'statue'
BODY_STEP = 0.004  # шаг сетки marching cubes, м
BODY_FACES = 46000
BODY_TEX = 2048


def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    ph = H.load_photo()
    shape = H.build_shape(ph)
    hpos, hnor, huv, hidx = H.mesh(shape)
    head_tex, _ = H.bake_texture(ph, shape, hpos, hidx)
    hnor = H.soft_normals(hnor, *shape.r.shape)
    print(f'голова: {len(hpos)} вершин, {len(hidx)} треугольников ({time.time() - t0:.0f} с)')

    pose = B.make_pose(ph.pts)
    body = B.Body(pose)
    verts, faces = bake.extract(body.sd, BODY_STEP, BODY_FACES)
    nor = bake.sdf_normals(body.sd, verts)
    vmap, idx, uv = bake.unwrap(verts, faces, BODY_TEX)
    pos2, nor2 = verts[vmap], nor[vmap]
    pos_t, nor_t = bake.raster_uv(uv, idx, [pos2, nor2], BODY_TEX)
    mask = pos_t[..., 3] > 0.5
    p = pos_t[mask][:, :3].astype(np.float64)
    n = nor_t[mask][:, :3].astype(np.float64)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    col = paint.colors(body, p, n, body.parts(p))
    hsd = H.head_sdf(shape, B.body_to_head, B.HEAD_SCALE)
    col *= bake.ambient_occlusion(lambda q: np.minimum(body.sd(q), hsd(q)), p, n)[:, None]
    img = np.zeros((BODY_TEX, BODY_TEX, 3))
    img[mask] = col
    img = bake.dilate(img, mask)
    body_tex = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8))
    print(f'тело: {len(pos2)} вершин, {len(idx)} треугольников ({time.time() - t0:.0f} с)')

    head_tex.save(OUT / 'head.webp', quality=90, method=6)
    body_tex.save(OUT / 'body.webp', quality=88, method=6)
    size = write_statue(OUT / 'statue.bin', [
        ('head', B.head_to_body(hpos), hnor, huv, hidx),
        ('body', pos2, nor2, uv, idx),
    ])
    for f in ('statue.bin', 'head.webp', 'body.webp'):
        print(f'{f}: {(OUT / f).stat().st_size / 1024:.0f} КБ')
    print(f'готово за {time.time() - t0:.0f} с, statue.bin {size / 1024:.0f} КБ')


if __name__ == '__main__':
    main()
