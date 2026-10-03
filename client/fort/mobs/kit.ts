// Мобы «Крепости» — общий договор моделей. Модели рисуют помощники (каждый в своём файле), крепость вставляет их
// в орду. Модель — набор жёстких частей, каждая висит на «кости». Поза — матрицы костей относительно корня:
// корень стоит ногами на y = 0 и смотрит по +Z, единицы — метры. Орду рисует MobRenderer инстансами
// (одна часть одной модели = один InstancedMesh), превью и стенд — обычной группой (buildPreview).
// Договор только расширяем: не переименовывай и не меняй смысл полей — по нему пишут три помощника сразу.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BONES = ['body', 'head', 'armL', 'armR', 'legL', 'legR', 'tail', 'wingL', 'wingR', 'prop', 'extra'] as const;
export type BoneName = (typeof BONES)[number];

/** Часть модели: геометрия с цветами вершин (атрибут color), в осях своей кости (точка подвеса — начало координат) */
export interface MobPart {
  bone: BoneName;
  geo: THREE.BufferGeometry;
  /** Светится сама: глаза, фитиль, ядро босса — не темнеет в тени */
  glow?: boolean;
}

/** Всё, из чего строится поза моба в кадре */
export interface MobAnim {
  /** Секунды с появления: дыхание, моргание, покачивание */
  t: number;
  /** Фаза шага 0…1, растёт с пройденным путём (рендерер сам интегрирует скорость) */
  gait: number;
  /** Скорость по земле сейчас, м/с */
  speed: number;
  /** Состояние с сервера — ZS_* из shared/fort.ts */
  st: number;
  /** Секунд в этом состоянии */
  stT: number;
  /** 1 → 0 после попадания: вздрогнуть, отшатнуться */
  hit: number;
  /** 0 — жив, дальше до 1 — анимация гибели (упал, лопнул, рассыпался) */
  die: number;
  /** 0…1, постоянное для особи: разброс роста, походки, мелочей */
  seed: number;
  /** В ярости (ZF_RAGE): босс или элита разозлены */
  rage: boolean;
}

export type MobPose = Record<BoneName, THREE.Matrix4>;

export interface MobDef {
  /** Латиницей, уникально: 'walker-mushroom' */
  id: string;
  /** Как зовут на русском: «Грибник» */
  name: string;
  /** Какие виды врагов (Z_* из shared/fortkinds.ts) рисует эта модель */
  kinds: number[];
  /** Доля среди вариантов одного вида (выбор по seed); по умолчанию 1 */
  weight?: number;
  /** Рост, м — сверяется с хитбоксом вида на стенде */
  height: number;
  parts: MobPart[];
  /**
   * Заполняет матрицы костей (относительно корня) для этой позы. Кости, на которых нет частей, можно не трогать.
   * Вызывается каждый кадр для каждой особи — без выделений памяти (бери заранее созданные векторы).
   */
  pose(a: MobAnim, out: MobPose): void;
}

export function newPose(): MobPose {
  const p = {} as MobPose;
  for (const b of BONES) p[b] = new THREE.Matrix4();
  return p;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Поставить кость: перенос, поворот (порядок YXZ, радианы), масштаб — без выделений памяти */
export function setBone(m: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(s, s, s);
  return m.compose(_p, _q, _s);
}

/** То же с разным масштабом по осям (сжаться при прыжке, раздуться перед взрывом) */
export function setBoneS(m: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return m.compose(_p, _q, _s);
}

/** Покрасить геометрию одним цветом (атрибут color) — для сборки частей из примитивов */
export function colored(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Склеить окрашенные куски в одну часть (у всех должны быть position, normal, color и не быть индекса или быть у всех) */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of list) {
    g.deleteAttribute('uv');
    g.deleteAttribute('uv1');
  }
  const out = mergeGeometries(list, false);
  if (!out) throw new Error('mobs: не склеилось — у кусков разные атрибуты');
  return out;
}

/** Вариант вида по seed с учётом weight; null — для вида нет модели (крепость рисует как раньше) */
export function pickVariant(defs: readonly MobDef[], kind: number, seed: number): MobDef | null {
  let total = 0;
  for (const d of defs) if (d.kinds.includes(kind)) total += d.weight ?? 1;
  if (total <= 0) return null;
  let r = seed * total;
  for (const d of defs) {
    if (!d.kinds.includes(kind)) continue;
    r -= d.weight ?? 1;
    if (r < 0) return d;
  }
  return null;
}

/** Общий материал моделей: цвета вершин, мягкий блеск игрушки */
export function mobMaterial(glow = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, emissive: glow ? 0xffffff : 0x000000, emissiveIntensity: glow ? 0.55 : 0 });
}

/** Превью одной особи обычной группой (стенд, превью, отладка). update — каждый кадр. */
export function buildPreview(def: MobDef): { group: THREE.Group; update(a: MobAnim): void } {
  const group = new THREE.Group();
  const pose = newPose();
  const meshes: Array<{ mesh: THREE.Mesh; bone: BoneName }> = [];
  for (const part of def.parts) {
    const mesh = new THREE.Mesh(part.geo, mobMaterial(part.glow));
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    meshes.push({ mesh, bone: part.bone });
  }
  return {
    group,
    update(a: MobAnim) {
      def.pose(a, pose);
      for (const { mesh, bone } of meshes) {
        mesh.matrix.copy(pose[bone]);
        mesh.matrixWorldNeedsUpdate = true;
      }
    },
  };
}
