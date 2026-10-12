// Разбор statue.bin — модели статуи, которую собирает tools/statue/build.py (формат описан в tools/statue/export.py).
// Без three.js: разбор проверяется тестом в Node.

export interface StatueMeshData {
  /** xyz в метрах */
  position: Float32Array;
  /** xyz + 0, нормированные int8 */
  normal: Int8Array;
  /** uv, нормированные uint16 (v снизу вверх, как ждёт three.js) */
  uv: Uint16Array;
  index: Uint16Array | Uint32Array;
}

interface MeshInfo {
  name: string;
  vertices: number;
  indices: number;
  min: [number, number, number];
  max: [number, number, number];
  pos: number;
  nor: number;
  uv: number;
  idx: number;
  idx32: boolean;
}

export function decodeStatue(buf: ArrayBuffer): Map<string, StatueMeshData> {
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'STAT') throw new Error('statue.bin: не тот файл');
  const version = view.getUint32(4, true);
  if (version !== 1) throw new Error(`statue.bin: версия ${version}`);
  const jsonLen = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, jsonLen))) as { meshes: MeshInfo[] };
  const data = (12 + jsonLen + 3) & ~3;
  const out = new Map<string, StatueMeshData>();
  for (const m of header.meshes) {
    const q = new Int16Array(buf, data + m.pos, m.vertices * 3);
    const position = new Float32Array(m.vertices * 3);
    for (let i = 0; i < q.length; i++) {
      const k = i % 3;
      position[i] = m.min[k] + ((q[i] + 32767) / 65534) * (m.max[k] - m.min[k]);
    }
    out.set(m.name, {
      position,
      normal: new Int8Array(buf, data + m.nor, m.vertices * 4),
      uv: new Uint16Array(buf, data + m.uv, m.vertices * 2),
      index: m.idx32 ? new Uint32Array(buf, data + m.idx, m.indices) : new Uint16Array(buf, data + m.idx, m.indices),
    });
  }
  return out;
}
