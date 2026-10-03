# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = ["mediapipe==0.10.14", "numpy", "pillow"]
# ///
"""Точки лица на фото (MediaPipe Face Landmarker, 478 точек) → landmarks.json для head.py.

    uv run tools/statue/landmarks.py путь/к/face_landmarker.task

Модель (3,7 МБ) — с сайта MediaPipe:
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
mediapipe нужен именно 0.10.14: версии 1.x на macOS падают на старте (нет Metal-сервиса даже
с CPU-делегатом). Запускать один раз на фото — результат лежит рядом и попадает в сборку.
"""
import json
from pathlib import Path
import sys

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.vision.face_landmarker import FaceLandmarksConnections as C
from PIL import Image

HERE = Path(__file__).resolve().parent


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    opts = vision.FaceLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=sys.argv[1], delegate=mpt.BaseOptions.Delegate.CPU),
        output_facial_transformation_matrixes=True,
        num_faces=1,
    )
    rgb = np.ascontiguousarray(np.asarray(Image.open(HERE / 'photo.webp').convert('RGB')))
    res = vision.FaceLandmarker.create_from_options(opts).detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not res.face_landmarks:
        sys.exit('лицо на фото не найдено')
    pts = [[p.x, p.y, p.z] for p in res.face_landmarks[0]]
    json.dump({
        'pts': pts,
        'matrix': np.asarray(res.facial_transformation_matrixes[0]).tolist(),
        'tess': [(c.start, c.end) for c in C.FACE_LANDMARKS_TESSELATION],
        'oval': [(c.start, c.end) for c in C.FACE_LANDMARKS_FACE_OVAL],
    }, open(HERE / 'landmarks.json', 'w'))
    print(f'точек: {len(pts)} → landmarks.json')


if __name__ == '__main__':
    main()
