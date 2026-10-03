"""Запись statue.bin — компактный формат для client/lobby/statueFormat.ts.

0   'STAT'                       4 байта
4   uint32 версия = 1
8   uint32 N — длина JSON
12  JSON {meshes: [{name, vertices, indices, min, max, pos, nor, uv, idx, idx32}]}, нули до кратного 4
…   данные: pos int16×3 (−32767…32767 → min…max), nor int8×4, uv uint16×2 (0…65535 → 0…1),
    idx uint16 или uint32; смещения — от начала блока данных, каждое кратно 4.
"""
import json
import struct

import numpy as np


def _pad4(b: bytearray):
    while len(b) % 4:
        b.append(0)


def write_statue(path, meshes):
    """meshes: [(name, pos N×3, nor N×3, uv N×2, idx M×3)]."""
    data = bytearray()
    info = []
    for name, pos, nor, uv, idx in meshes:
        pos = np.asarray(pos, np.float64)
        lo, hi = pos.min(0), pos.max(0)
        span = np.maximum(hi - lo, 1e-9)
        q = np.round((pos - lo) / span * 65534 - 32767).astype('<i2')
        n = np.asarray(nor, np.float64)
        n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        nq = np.zeros((len(n), 4), '<i1')
        nq[:, :3] = np.round(n * 127).astype(np.int8)
        uq = np.round(np.clip(np.asarray(uv), 0, 1) * 65535).astype('<u2')
        idx = np.asarray(idx).reshape(-1)
        idx32 = len(pos) > 65535
        iq = idx.astype('<u4' if idx32 else '<u2')
        entry = dict(name=name, vertices=len(pos), indices=len(idx), min=lo.tolist(), max=hi.tolist(), idx32=idx32)
        for key, arr in (('pos', q), ('nor', nq), ('uv', uq), ('idx', iq)):
            _pad4(data)
            entry[key] = len(data)
            data += arr.tobytes()
        info.append(entry)
    head = json.dumps({'meshes': info}, separators=(',', ':')).encode()
    out = bytearray(b'STAT')
    out += struct.pack('<II', 1, len(head))
    out += head
    _pad4(out)
    out += data
    with open(path, 'wb') as f:
        f.write(out)
    return len(out)
