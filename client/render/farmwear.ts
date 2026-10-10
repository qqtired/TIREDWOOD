// Вещи фермы из Blender (client/assets/farm/models/cos_<слот>_<вещь>.glb, art/farm/MODELS.md «Косметика»): маленький
// синхронный разбор glb (позиции, нормали, вершинный цвет — текстур нет) и общие на всех геометрии. Шапки и аксессуары
// отдаются в outfit3d.wearOf как обычный Wear: пока файл грузится, у вещи нет сеток, после загрузки Wear дополняется
// на месте и растёт farmWearVersion — желейки перестраивают наряд. Детали верха и низа, манжеты и перчатки на варежках
// берёт outfitfarm.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// цикл с outfit3d.ts безопасен: bodyR берётся только при разборе файла, после загрузки модулей
import { bodyR, type Wear } from './outfit3d.ts';

type Geo = THREE.BufferGeometry;

// ------------------------------------------------------------ glb

/** Узел верхнего уровня: сетки поддерева, склеенные по имени материала, в осях узла */
export type GlbRoots = Map<string, Map<string, Geo>>;

function readAccessor(j: GltfJson, bin: DataView, i: number): { arr: Float32Array | Uint32Array; size: number; count: number } {
  const a = j.accessors[i];
  const v = j.bufferViews[a.bufferView];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] ?? 1;
  const bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType] ?? 4;
  const stride = v.byteStride || size * bytes;
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const isIndex = a.componentType === 5125 || (a.componentType === 5123 && !a.normalized && size === 1) || (a.componentType === 5121 && !a.normalized && size === 1);
  const arr = isIndex ? new Uint32Array(a.count * size) : new Float32Array(a.count * size);
  for (let n = 0; n < a.count; n++) {
    for (let k = 0; k < size; k++) {
      const o = base + n * stride + k * bytes;
      let x: number;
      switch (a.componentType) {
        case 5126: x = bin.getFloat32(o, true); break;
        case 5125: x = bin.getUint32(o, true); break;
        case 5123: x = bin.getUint16(o, true); if (a.normalized) x /= 65535; break;
        case 5121: x = bin.getUint8(o); if (a.normalized) x /= 255; break;
        case 5122: x = bin.getInt16(o, true); if (a.normalized) x = Math.max(-1, x / 32767); break;
        default: x = bin.getInt8(o); if (a.normalized) x = Math.max(-1, x / 127);
      }
      arr[n * size + k] = x;
    }
  }
  return { arr, size, count: a.count };
}

interface GltfJson {
  scenes: { nodes: number[] }[];
  scene?: number;
  nodes: { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  materials?: { name?: string }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; normalized?: boolean; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
}

/** Разбор glb без загрузчика: узлы сцены → сетки поддерева в осях узла, по материалам. Цвет — RGB из COLOR_0. */
export function parseGlb(buf: ArrayBufferLike | Uint8Array): GlbRoots {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('не glb');
  let off = 12;
  let json: GltfJson | null = null;
  let bin: DataView | null = null;
  while (off < dv.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(u8.subarray(off + 8, off + 8 + len))) as GltfJson;
    else if (type === 0x004e4942) bin = new DataView(u8.buffer, u8.byteOffset + off + 8, len);
    off += 8 + len;
  }
  if (!json || !bin) throw new Error('glb без данных');
  const j = json;
  const b = bin;
  const out: GlbRoots = new Map();
  const local = (n: GltfJson['nodes'][number]): THREE.Matrix4 => {
    if (n.matrix) return new THREE.Matrix4().fromArray(n.matrix);
    const t = n.translation ?? [0, 0, 0];
    const r = n.rotation ?? [0, 0, 0, 1];
    const s = n.scale ?? [1, 1, 1];
    return new THREE.Matrix4().compose(new THREE.Vector3(t[0], t[1], t[2]), new THREE.Quaternion(r[0], r[1], r[2], r[3]), new THREE.Vector3(s[0], s[1], s[2]));
  };
  for (const rootIdx of j.scenes[j.scene ?? 0].nodes) {
    const byMat = new Map<string, Geo[]>();
    const walk = (i: number, m: THREE.Matrix4): void => {
      const n = j.nodes[i];
      if (n.mesh !== undefined) {
        for (const p of j.meshes[n.mesh].primitives) {
          const g = new THREE.BufferGeometry();
          const pos = readAccessor(j, b, p.attributes.POSITION);
          g.setAttribute('position', new THREE.BufferAttribute(pos.arr as Float32Array, 3));
          if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', new THREE.BufferAttribute(readAccessor(j, b, p.attributes.NORMAL).arr as Float32Array, 3));
          const c = new Float32Array(pos.count * 3).fill(1);
          if (p.attributes.COLOR_0 !== undefined) {
            const src = readAccessor(j, b, p.attributes.COLOR_0);
            for (let v = 0; v < pos.count; v++) for (let k = 0; k < 3; k++) c[v * 3 + k] = src.arr[v * src.size + k];
          }
          g.setAttribute('color', new THREE.BufferAttribute(c, 3));
          const idx = p.indices !== undefined ? readAccessor(j, b, p.indices).arr : Uint32Array.from({ length: pos.count }, (_, k) => k);
          g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
          if (!g.getAttribute('normal')) g.computeVertexNormals();
          g.applyMatrix4(m);
          const name = (p.material !== undefined ? j.materials?.[p.material]?.name : '') || 'cos_cloth';
          const list = byMat.get(name) ?? [];
          list.push(g);
          byMat.set(name, list);
        }
      }
      for (const c of n.children ?? []) walk(c, m.clone().multiply(local(j.nodes[c])));
    };
    // начало — в origin узла (точка крепления), поэтому собственное положение корня не берём
    walk(rootIdx, new THREE.Matrix4());
    const merged = new Map<string, Geo>();
    for (const [mat, list] of byMat) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (g) merged.set(mat, g);
    }
    out.set(j.nodes[rootIdx].name ?? '', merged);
  }
  return out;
}

// ------------------------------------------------------------ вещи

export type FarmSlot = 'h' | 'a' | 'u' | 'l';

/** Вещи фермы в glb и высота крепления (art/farm/MODELS.md); у шапок и аксессуаров — то, что берёт outfit3d */
const ANCHOR: Record<string, number> = {
  'h:farmcap': 1.45, 'h:straw': 1.42, 'h:sunhat': 1.42, 'h:goldstraw': 1.42, 'h:leafcrown': 1.4, 'h:explorer': 1.45,
  'h:nightcap': 1.45, 'h:oldgardener': 1.48, 'h:pigears': 1.42,
  'a:apron': 0.6, 'a:alarm': 0.6, 'a:canpack': 0.86, 'a:bee': 1.0, 'a:greengloves': 0.6, 'a:basket': 0.6,
  'u:workshirt': 0.7, 'u:sprout': 0.7, 'u:plaid': 0.7, 'u:windbreaker': 0.7, 'u:leafcape': 1.05, 'u:stargardener': 0.7,
  'u:sweater': 0.7, 'u:treevest': 0.7,
  'l:jeans': 0.5, 'l:boots': 0.2, 'l:overalls': 0.6, 'l:patched': 0.4, 'l:sneakers': 0.15,
};
/** Медь (будильник, лейка) — не золото: остаётся в обычной части со своим цветом */
const COPPER = new Set(['a:alarm', 'a:canpack']);
/** Пчёлка сидит на правом плече: φ = 1,42, y = 1,0, на 0,058 над телом (зеркало насеста питомца) */
const BEE = { phi: 1.42, off: 0.058 };

/** Вещь фермы: тело (как Wear) и сетки на варежках (перчатки, манжеты, корзинка) */
export interface FarmPiece {
  wear: Wear;
  /** Сетки у варежек в осях варежки: R, L */
  hands: [Geo | null, Geo | null];
  /** Блестящая часть (ягоды, стекло, резина) — для деталей верха и низа; у шапок она в wear.geo */
  gloss: Geo | null;
  loaded: boolean;
}

const pieces = new Map<string, FarmPiece>();
const loading = new Set<string>();
/** Растёт, когда догрузилась вещь: желейки перестраивают наряд */
export let farmWearVersion = 0;

export function isFarmWear(id: string): boolean {
  return Object.hasOwn(ANCHOR, id);
}

function piece(id: string): FarmPiece {
  let p = pieces.get(id);
  if (!p) {
    p = { wear: { geo: null, metal: null, y: ANCHOR[id] ?? 0 }, hands: [null, null], gloss: null, loaded: false };
    pieces.set(id, p);
  }
  return p;
}

function merge(list: (Geo | undefined)[]): Geo | null {
  const ok = list.filter((g): g is Geo => !!g);
  if (!ok.length) return null;
  const g = ok.length === 1 ? ok[0] : mergeGeometries(ok, false);
  g?.computeBoundingSphere();
  return g ?? null;
}

function bare(g: Geo | null): Geo | null {
  if (g?.getAttribute('color')) g.deleteAttribute('color');
  return g;
}

/** Заполнить вещь из разобранного glb (на месте: тот же объект Wear, что уже отдан желейкам) */
export function fillFarmWear(id: string, roots: GlbRoots): FarmPiece {
  const p = piece(id);
  const [slot, key] = id.split(':');
  const base = `${slot}_${key}`;
  const body = roots.get(base);
  const metalNode = roots.get(`${base}_metal`);
  const all = new Map<string, Geo>();
  for (const m of [body, metalNode]) for (const [k, g] of m ?? []) all.set(k, merge([all.get(k), g])!);
  const cloth = all.get('cos_cloth');
  const gloss = all.get('cos_gloss');
  let metal = all.get('cos_metal') ?? null;
  if (id === 'a:bee') {
    // вершины — от лапок; узел крепления — на оси тела, на высоте плеча
    const r = bodyR(1.0) + BEE.off;
    for (const g of [cloth, gloss, metal]) g?.translate(r * Math.sin(BEE.phi), 0, r * Math.cos(BEE.phi));
  }
  if (slot === 'h' || slot === 'a') {
    const copper = COPPER.has(id);
    p.wear.geo = merge([cloth, gloss, copper ? metal ?? undefined : undefined]);
    p.wear.metal = copper ? null : bare(metal);
  } else {
    p.wear.geo = cloth ?? null;
    p.gloss = gloss ?? null;
    p.wear.metal = metal;
  }
  // перчатки, корзинка и манжеты рукавов — на варежках
  const hand = (side: 'R' | 'L'): Geo | null => {
    const node = roots.get(`${base}_${side}`) ?? roots.get(`${base}_cuff_${side}`);
    return node ? merge([...node.values()]) : null;
  };
  p.hands = [hand('R'), hand('L')];
  if (id === 'a:basket') {
    p.hands = [p.wear.geo, null];
    p.wear.geo = null;
  }
  p.loaded = true;
  farmWearVersion++;
  return p;
}

const urlOf = (id: string): URL => {
  const [slot, key] = id.split(':');
  return new URL(`../assets/farm/models/cos_${slot}_${key}.glb`, import.meta.url);
};

function load(id: string): void {
  if (loading.has(id) || typeof window === 'undefined' || typeof fetch !== 'function') return;
  loading.add(id);
  fetch(urlOf(id).href)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => { fillFarmWear(id, parseGlb(b)); })
    .catch((e) => console.warn('[ферма] вещь', id, e));
}

/** Вещь фермы (с загрузкой при первом спросе); null — не вещь фермы */
export function farmPiece(id: string): FarmPiece | null {
  if (!isFarmWear(id)) return null;
  const p = piece(id);
  if (!p.loaded) load(id);
  return p;
}

/** Для outfit3d.wearOf: шапка или аксессуар фермы (пока грузится — без сеток), иначе null */
export function farmWearOf(slot: 'h' | 'a' | 'e', key: string): Wear | null {
  return slot === 'e' ? null : farmPiece(`${slot}:${key}`)?.wear ?? null;
}

/** Синхронно загрузить все вещи (проверки в node): read — чтение файла по его file:// URL */
export function loadFarmWearSync(read: (url: URL) => Uint8Array): void {
  for (const id of Object.keys(ANCHOR)) {
    if (!piece(id).loaded) fillFarmWear(id, parseGlb(read(urlOf(id))));
  }
}
