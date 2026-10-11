// Земля новой набережной (флаг PLAZA3): вместо ровной заливки блокаута — спокойные текстуры. Картинки нарисованы Codex
// image_gen (client/assets/plaza3/ground, промпты и обработка — PROVENANCE.md там же): светлые плиты площади и
// променадов, песчаник настила и стенки, гравий бульвара и аллей, газон, песок пляжа, роза ветров в центре площади.
// Сетку земли строит plaza3/world.ts (один меш, цвет в вершинах); здесь её треугольники раскладываются по поверхностям
// (по цвету блокаута) на меши по картинке. Развёртка — в мировых метрах (повтор TEX.tile м: рисунок не растягивается на
// больших многоугольниках; стенка — вдоль края и по высоте), цвет вершин — оттенок к карте (одна картинка на несколько
// поверхностей, среднее сведено к цвету поверхности). Материал — тот же мокнущий MeshStandard с цветом вершин и картой,
// что у всей статики (plaza3/perf.ts даёт ей белую карту 1×1), — программа общая, новых нет; отрисовок +5 (меш на
// картинку). Мип-уровни и анизотропия — вдали рисунок не рябит.
import * as THREE from 'three';
import { P3 } from '../../../shared/plaza3/layout.ts';

type Wet = (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial;

/** Картинка: файл (.jpg), метров на один повтор (0 — одна картинка на круг), средний цвет картинки (sRGB) */
interface GroundTex {
  file: string;
  tile: number;
  avg: number;
}

export const TEX = {
  /** 4×4 светлых плиты по 0,9 м */
  plaza: { file: 'plaza-slabs', tile: 3.6, avg: 0xeeddc4 },
  /** 3×6 плит песчаника 1,1×0,55 м */
  deck: { file: 'deck-slabs', tile: 3.3, avg: 0xeacba4 },
  gravel: { file: 'gravel', tile: 2.4, avg: 0xe7bd85 },
  lawn: { file: 'lawn', tile: 4, avg: 0x73a43e },
  sand: { file: 'sand', tile: 6, avg: 0xf5ce8e },
  /** роза ветров — одна картинка на круг rose из layout.json */
  rose: { file: 'rose', tile: 0, avg: 0xd1af8e },
} as const satisfies Record<string, GroundTex>;
export type TexId = keyof typeof TEX;

/**
 * Поверхности: цвет блокаута из plaza3/world.ts (ключ: STONE, DECK, STREET, FIELD, PATCH, PATH) → картинка и цвет,
 * к которому сводится её среднее (близко к прежней заливке, чуть теплее). Неизвестный цвет остаётся как был.
 */
export const SURFACES: ReadonlyArray<{ what: string; key: number; tex: TexId; color: number }> = [
  { what: 'настил суши', key: 0xd2c3aa, tex: 'deck', color: 0xd9c4a3 },
  { what: 'стенка набережной', key: 0x7d776e, tex: 'deck', color: 0x8f8372 },
  { what: 'улица к городу', key: 0xa6a8a0, tex: 'deck', color: 0xaca697 },
  { what: 'поле фермы', key: 0x8c9a4e, tex: 'lawn', color: 0x93a052 },
  { what: 'площадь', key: 0xe9e0cc, tex: 'plaza', color: 0xebdec6 },
  { what: 'роза ветров', key: 0xc9784e, tex: 'rose', color: 0xd1af8e },
  { what: 'песок пляжа', key: 0xe6d29a, tex: 'sand', color: 0xe9d39e },
  { what: 'газон', key: 0x76a046, tex: 'lawn', color: 0x78a346 },
  { what: 'гравий у скал', key: 0xb9ad98, tex: 'gravel', color: 0xbcae95 },
  { what: 'грунтовка к ферме', key: 0x9a7a52, tex: 'gravel', color: 0xa07e55 },
  { what: 'променад', key: 0xe4d9c2, tex: 'plaza', color: 0xe3d5bb },
  { what: 'аллея', key: 0xdacdb2, tex: 'gravel', color: 0xdbc8a5 },
  { what: 'бульвар', key: 0xc4ad84, tex: 'gravel', color: 0xcdb085 },
];

/** Развёртка точки (м) на поверхности с нормалью n: пол — по x и z, стенка — вдоль края и по высоте; tile в метрах */
export function worldUv(x: number, y: number, z: number, nx: number, ny: number, nz: number, tile: number): [number, number] {
  if (Math.abs(ny) >= 0.5) return [x / tile, -z / tile];
  const len = Math.hypot(nx, nz) || 1;
  return [(x * -nz + z * nx) / len / tile, y / tile];
}

/** Круг розы ветров (layout.json ground, kind rose) — картинка ложится на него целиком */
const ROSE = P3.ground.find((g) => g.kind === 'rose')?.circle ?? { x: 0, z: 0, r: 1 };
export function roseUv(x: number, z: number): [number, number] {
  return [(x - ROSE.x) / (2 * ROSE.r) + 0.5, 0.5 - (z - ROSE.z) / (2 * ROSE.r)];
}

/** Оттенок (линейный множитель к карте): среднее картинки → цвет поверхности */
function tintOf(tex: GroundTex, color: number): THREE.Color {
  const a = new THREE.Color(tex.avg);
  const c = new THREE.Color(color);
  return new THREE.Color(c.r / a.r, c.g / a.g, c.b / a.b);
}

const KEYS = SURFACES.map((s) => ({ ...s, c: new THREE.Color(s.key), tint: tintOf(TEX[s.tex], s.color) }));
function surfaceAt(r: number, g: number, b: number): (typeof KEYS)[number] | null {
  for (const s of KEYS) if (Math.abs(s.c.r - r) < 2e-3 && Math.abs(s.c.g - g) < 2e-3 && Math.abs(s.c.b - b) < 2e-3) return s;
  return null;
}

// ------------------------------------------------------------ картинки

const url = (file: string): string => new URL(`../../assets/plaza3/ground/${file}.jpg`, import.meta.url).href;

interface Loaded {
  /** null — ещё грузится: у материалов заглушка среднего цвета */
  tex: THREE.Texture | null;
  mats: THREE.MeshStandardMaterial[];
  stub: THREE.DataTexture;
}
const loaded = new Map<TexId, Loaded>();

/** Карта материалу: сразу заглушка 1×1 среднего цвета (не чёрная земля до загрузки), по загрузке — картинка */
function bind(id: TexId, m: THREE.MeshStandardMaterial): void {
  let l = loaded.get(id);
  if (!l) {
    const t = TEX[id];
    const stub = new THREE.DataTexture(new Uint8Array([(t.avg >> 16) & 255, (t.avg >> 8) & 255, t.avg & 255, 255]), 1, 1);
    stub.colorSpace = THREE.SRGBColorSpace;
    stub.name = `p3-ground-${id}-stub`;
    stub.needsUpdate = true;
    const entry: Loaded = { tex: null, mats: [], stub };
    l = entry;
    loaded.set(id, entry);
    if (typeof document !== 'undefined') {
      new THREE.TextureLoader().load(url(t.file), (tex) => {
        tex.name = `p3-ground-${id}`;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = t.tile > 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        // анизотропия — до предела видеокарты (three сам ограничит): плиты под углом остаются чёткими, без ряби
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        entry.tex = tex;
        // смена карты — только значение в той же программе (карта у материала была и до этого)
        for (const mm of entry.mats) mm.map = tex;
      });
    }
  }
  l.mats.push(m);
  m.map = l.tex ?? l.stub;
}

// ------------------------------------------------------------ раскладка

interface Bucket {
  id: TexId;
  src: THREE.Material;
  p: number[];
  n: number[];
  c: number[];
  uv: number[];
}

/**
 * Земля plaza3 в текстурах: каждый меш с именем plaza3-ground… под root делится по поверхностям на меши по картинке
 * (plaza3-ground-<картинка>) с теми же высотами, тенями и сдвигом глубины; треугольники неизвестного цвета остаются в
 * исходном меше, а пустой исходный меш убирается. Возвращает новые меши.
 */
export function dressPlaza3Ground(root: THREE.Object3D, wet: Wet): THREE.Mesh[] {
  const sources: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && /^plaza3-ground(?!-)/.test(m.name)) sources.push(m);
  });
  const out: THREE.Mesh[] = [];
  for (const mesh of sources) out.push(...dressMesh(mesh, wet));
  return out;
}

function dressMesh(mesh: THREE.Mesh, wet: Wet): THREE.Mesh[] {
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  if (!pos || !nor || !col || !mesh.parent) return [];
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const matAt = (v: number): THREE.Material => {
    if (!Array.isArray(mesh.material)) return mesh.material;
    const g = geo.groups.find((q) => v >= q.start && v < q.start + q.count);
    return mats[g?.materialIndex ?? 0];
  };
  const buckets = new Map<string, Bucket>();
  const rest: number[] = [];
  for (let v = 0; v + 2 < pos.count; v += 3) {
    const s = surfaceAt(col.getX(v), col.getY(v), col.getZ(v));
    if (!s) {
      rest.push(v);
      continue;
    }
    const src = matAt(v);
    const key = `${s.tex}|${src.uuid}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { id: s.tex, src, p: [], n: [], c: [], uv: [] }));
    const tile = TEX[s.tex].tile;
    for (let k = v; k < v + 3; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const z = pos.getZ(k);
      b.p.push(x, y, z);
      b.n.push(nor.getX(k), nor.getY(k), nor.getZ(k));
      b.c.push(s.tint.r, s.tint.g, s.tint.b);
      b.uv.push(...(tile > 0 ? worldUv(x, y, z, nor.getX(k), nor.getY(k), nor.getZ(k), tile) : roseUv(x, z)));
    }
  }
  if (!buckets.size) return [];
  const made: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const s = b.src as THREE.MeshStandardMaterial;
    const m = wet(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: s.roughness ?? 0.9,
        metalness: s.metalness ?? 0,
        side: s.side,
        polygonOffset: s.polygonOffset,
        polygonOffsetFactor: s.polygonOffsetFactor,
        polygonOffsetUnits: s.polygonOffsetUnits,
        depthWrite: s.depthWrite,
      }),
    );
    m.name = `p3_ground_${b.id}`;
    bind(b.id, m);
    const out = new THREE.Mesh(g, m);
    out.name = `plaza3-ground-${b.id}`;
    out.castShadow = mesh.castShadow;
    out.receiveShadow = mesh.receiveShadow;
    out.renderOrder = mesh.renderOrder;
    mesh.matrix.decompose(out.position, out.quaternion, out.scale);
    out.matrixAutoUpdate = false;
    out.updateMatrix();
    mesh.parent.add(out);
    made.push(out);
  }
  if (!rest.length) mesh.removeFromParent();
  else {
    // неизвестные поверхности — как были, своим материалом
    const keep = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color'] as const) {
      const a = geo.getAttribute(name);
      const arr = new Float32Array(rest.length * 3 * a.itemSize);
      rest.forEach((v, i) => {
        for (let k = 0; k < 3; k++) for (let q = 0; q < a.itemSize; q++) arr[(i * 3 + k) * a.itemSize + q] = a.getComponent(v + k, q);
      });
      keep.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    mesh.geometry = keep;
    if (Array.isArray(mesh.material)) mesh.material = matAt(rest[0]);
  }
  return made;
}
