// Модели павильонов новой набережной (флаг PLAZA3, WP9): загрузка GLB из client/assets/plaza3 с кэшем и разбор на части —
// неподвижное (static_* и флажки), живые узлы (live_*), пустышки (anchor_*), места предметов и лампочек. Текстур в файлах нет
// (CSP игры не пускает blob:), цвет — в вершинах, материалы — по семейству (p3_matte / p3_gloss / p3_glow / p3_foliage):
// в игре на семейство один общий материал, так склейка квартала — 2–3 отрисовки. Ошибка файла — null: вместо павильона
// остаётся коробка блокаута (tech-foundation §8, риск 11), игра не падает.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { baseName, propOf } from './pavdata.ts';

/** Адрес файла: Vite собирает шаблон new URL в список файлов папки (как client/boat/models.ts); в тестах под node — file: URL, модуль не падает */
export function assetUrl(file: string): string {
  const name = file.replace(/\.glb$/, '');
  return new URL(`../../assets/plaza3/${name}.glb`, import.meta.url).href;
}

/** Семейство материала: листва без ветра — то же, что матовое (одна отрисовка) */
export type Family = 'matte' | 'gloss' | 'glow';

export function familyOf(material: THREE.Material): Family {
  const n = material.name;
  if (n.startsWith('p3_glow')) return 'glow';
  if (n.startsWith('p3_gloss')) return 'gloss';
  return 'matte';
}

/** Сетка узла в осях файла: геометрия, семейство, матрица относительно корня файла */
export interface Part {
  geo: THREE.BufferGeometry;
  family: Family;
  matrix: THREE.Matrix4;
}

/** Пустышка: матрица относительно корня файла и userData из Blender */
export interface Anchor {
  matrix: THREE.Matrix4;
  data: Record<string, unknown>;
}

export interface PavModel {
  file: string;
  /** Узлы верхнего уровня по исходному имени → их сетки (static_*, live_*, у библиотек — детали) */
  nodes: Map<string, Part[]>;
  /** Узлы live_* целиком (для своих сеток с поворотом вокруг точки подвеса) */
  lives: Map<string, THREE.Object3D>;
  anchors: Map<string, Anchor>;
  /** Места предметов: деталь и матрица относительно корня файла */
  props: Array<{ name: string; matrix: THREE.Matrix4 }>;
  /** Лампочки: точки относительно корня файла */
  bulbs: THREE.Vector3[];
}

const cache = new Map<string, Promise<PavModel | null>>();

/** Загрузить и разобрать GLB (кэш на всю игру); один повтор через полсекунды, потом — null */
export function loadPav(file: string): Promise<PavModel | null> {
  let p = cache.get(file);
  if (p) return p;
  const url = assetUrl(file);
  const get = (): Promise<GLTF> => (url ? new GLTFLoader().loadAsync(url) : Promise.reject(new Error(`нет файла ${file}`)));
  p = get()
    .catch(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      return get();
    })
    .then((gltf) => parse(file, gltf))
    .catch((e: unknown) => {
      console.warn('[набережная] павильон', file, e);
      return null;
    });
  cache.set(file, p);
  return p;
}

/** Исходное имя узла (GLTFLoader вырезает из name точки; исходное — в userData.name) */
function rawName(o: THREE.Object3D): string {
  return typeof o.userData.name === 'string' ? o.userData.name : o.name;
}

function parse(file: string, gltf: GLTF): PavModel {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const model: PavModel = { file, nodes: new Map(), lives: new Map(), anchors: new Map(), props: [], bulbs: [] };
  for (const top of root.children) {
    const name = rawName(top);
    const parts: Part[] = [];
    top.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (mats.length === 1) parts.push({ geo: mesh.geometry, family: familyOf(mats[0]), matrix: mesh.matrixWorld.clone() });
        return;
      }
      const n = rawName(o);
      if (o === top || !n.startsWith('anchor_')) return;
      const prop = propOf(n);
      if (prop) model.props.push({ name: prop, matrix: o.matrixWorld.clone() });
      else if (n.startsWith('anchor_bulbs')) model.bulbs.push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
      else model.anchors.set(baseName(n), { matrix: o.matrixWorld.clone(), data: { ...o.userData } });
    });
    model.nodes.set(name, parts);
    if (name.startsWith('live_')) model.lives.set(name, top);
  }
  return model;
}

/**
 * Сетка в мире для склейки: позиция и нормаль в мировых осях, цвет — float RGB (как у paint() в render/kit.ts), без UV.
 * Одинаковый набор атрибутов у всех частей — склеиваются без потерь.
 */
export function worldGeometry(geo: THREE.BufferGeometry, world: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = geo.getAttribute('position');
  g.setAttribute('position', pos.clone());
  const nrm = geo.getAttribute('normal');
  if (nrm) g.setAttribute('normal', nrm.clone());
  const n = pos.count;
  const col = geo.getAttribute('color');
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = col ? col.getX(i) : 1;
    c[i * 3 + 1] = col ? col.getY(i) : 1;
    c[i * 3 + 2] = col ? col.getZ(i) : 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (geo.index) g.setIndex(geo.index.clone());
  else g.setIndex(Array.from({ length: n }, (_, i) => i));
  if (!nrm) g.computeVertexNormals();
  g.applyMatrix4(world);
  // зеркальная матрица (отрицательный масштаб) выворачивает грани — вернуть обход
  if (world.determinant() < 0) {
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  return g;
}
