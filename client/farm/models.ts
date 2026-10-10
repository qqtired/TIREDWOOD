// Модели фермы (client/assets/farm/models/*.glb, Blender): загрузка с кэшем, общие материалы по имени семейства
// (farm_soft, farm_plant, farm_gloss…) и разбор на части «узел → сетки». Текстур в моделях нет — цвет в вершинах,
// поэтому всё склеивается и рисуется инстансами без лишних шейдеров. CSP: файлы — свои ассеты сборки (не data:).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const URLS = import.meta.glob('../assets/farm/models/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function modelUrl(name: string): string {
  return URLS[`../assets/farm/models/${name}.glb`] ?? '';
}

/** Часть узла: сетка, общий материал и положение относительно корня модели */
export interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  matrix: THREE.Matrix4;
}

export interface FarmModel {
  name: string;
  gltf: GLTF;
  /** Узлы верхнего уровня по имени (bed_frame, stage2…) → их сетки */
  nodes: Map<string, Part[]>;
}

/** Материалы по имени семейства: одна программа на семейство, общая для всех моделей */
const MATS = new Map<string, THREE.Material>();

function sharedMaterial(src: THREE.Material): THREE.Material {
  const name = src.name || 'farm_soft';
  let m = MATS.get(name);
  if (m) return m;
  const s = src as THREE.MeshStandardMaterial;
  if (name.startsWith('farm_glow')) {
    // светящееся (лампы, угли, золотой ободок спелой грядки) — без освещения, цвет из вершин
    m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  } else {
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: Math.max(0.35, s.roughness ?? 0.7),
      metalness: Math.min(0.5, s.metalness ?? 0),
      side: s.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
  }
  m.name = name;
  MATS.set(name, m);
  return m;
}

const cache = new Map<string, Promise<FarmModel>>();

/** Загрузить модель по имени файла без .glb (кэш на всю игру; ошибка — пустая модель, ферма не падает) */
export function loadModel(name: string): Promise<FarmModel> {
  let p = cache.get(name);
  if (p) return p;
  const url = modelUrl(name);
  p = (url ? new GLTFLoader().loadAsync(url) : Promise.reject(new Error(`нет модели ${name}`)))
    .then((gltf) => parse(name, gltf))
    .catch((e) => {
      console.warn('[ферма] модель', name, e);
      return { name, gltf: { scene: new THREE.Group(), animations: [] } as unknown as GLTF, nodes: new Map() };
    });
  cache.set(name, p);
  return p;
}

function parse(name: string, gltf: GLTF): FarmModel {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const nodes = new Map<string, Part[]>();
  for (const node of root.children) {
    const parts: Part[] = [];
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.length === 1 ? sharedMaterial(mats[0]) : mats.map(sharedMaterial);
      if (mats.length === 1) parts.push({ geo: mesh.geometry, mat: mesh.material as THREE.Material, matrix: mesh.matrixWorld.clone() });
    });
    nodes.set(node.name, parts);
  }
  // у моделей со скелетом (жители) материалы тоже общие, а их сцена используется целиком
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh && !Array.isArray(mesh.material)) mesh.material = sharedMaterial(mesh.material);
  });
  return { name, gltf, nodes };
}

/** Все материалы фермы (для «рисованного» вида и прогрева) */
export function farmMaterials(): THREE.Material[] {
  return [...MATS.values()];
}

// ------------------------------------------------------------ склейка неподвижного

/** Позиция, нормаль и цвет (RGBA float) — одинаковый набор у всех частей, чтобы склеить */
function uniform(geo: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = geo.getAttribute('position');
  g.setAttribute('position', pos.clone());
  const nrm = geo.getAttribute('normal');
  if (nrm) g.setAttribute('normal', nrm.clone());
  const n = pos.count;
  const col = geo.getAttribute('color');
  const c = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    c[i * 4] = col ? col.getX(i) : 1;
    c[i * 4 + 1] = col ? col.getY(i) : 1;
    c[i * 4 + 2] = col ? col.getZ(i) : 1;
    c[i * 4 + 3] = col && col.itemSize === 4 ? col.getW(i) : 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 4));
  if (geo.index) g.setIndex(geo.index.clone());
  else g.setIndex(Array.from({ length: n }, (_, i) => i));
  if (!nrm) g.computeVertexNormals();
  g.applyMatrix4(m);
  return g;
}

/**
 * Копилка неподвижного: части в мировом положении по материалам; build() склеивает каждое семейство в одну сетку —
 * вся постройка фермы рисуется несколькими отрисовками.
 */
export class StaticBatch {
  private readonly buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly tmp = new THREE.Matrix4();

  add(parts: readonly Part[] | undefined, world: THREE.Matrix4): void {
    if (!parts) return;
    for (const p of parts) {
      const list = this.buckets.get(p.mat) ?? [];
      list.push(uniform(p.geo, this.tmp.multiplyMatrices(world, p.matrix)));
      this.buckets.set(p.mat, list);
    }
  }

  build(shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.buckets) {
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = shadows && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

// ------------------------------------------------------------ инстансы

/** Один узел модели, нарисованный много раз: по InstancedMesh на каждую его сетку */
export class PartInstances {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly parts: readonly Part[];
  private n = 0;
  private readonly tmp = new THREE.Matrix4();

  readonly capacity: number;

  constructor(parts: readonly Part[] | undefined, capacity: number, shadows = false) {
    this.capacity = capacity;
    this.parts = parts ?? [];
    for (const p of this.parts) {
      const mesh = new THREE.InstancedMesh(p.geo, p.mat, capacity);
      mesh.count = 0;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
    }
  }

  begin(): void {
    this.n = 0;
  }

  push(world: THREE.Matrix4): void {
    if (this.n >= this.capacity) return;
    for (let i = 0; i < this.parts.length; i++) this.meshes[i].setMatrixAt(this.n, this.tmp.multiplyMatrices(world, this.parts[i].matrix));
    this.n++;
  }

  end(): void {
    for (const m of this.meshes) {
      m.count = this.n;
      m.visible = this.n > 0;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  addTo(parent: THREE.Object3D): void {
    for (const m of this.meshes) parent.add(m);
  }
}
