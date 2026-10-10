// Модели своих лодок и пирса-стоянки (client/assets/ownboats/, PROVENANCE там же). Чтобы не тратить отрисовки, каждая
// лодка склеивается по материалу в три куска: непрозрачное (краска, мягкое, металл, экран — цвет в вершинах), стекло
// и свечение; все лодки рисуются инстансами по типу и LOD — на площади с восемью лодками у стоянки это ≤ 9 отрисовок.
// Якорь и трос — свои инстансы (видны, когда якорь идёт вниз). Пирс — три отрисовки: настил с поручнями, фонари
// и таблички мест (один канвас-атлас на 10 табличек: номер, ник хозяина или «свободно»).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BOATS, type BoatId } from '../../shared/fishboat.ts';
import { OB_WORLD_MAX, PARK, PARK_COUNT } from '../../shared/ownboat.ts';

const url = (f: string): string => new URL(`../assets/ownboats/${f}`, import.meta.url).href;
const BOAT_URLS: Record<BoatId, [string, string]> = {
  volzhanka: [url('volzhanka.glb'), url('volzhanka_lod1.glb')],
  albakor: [url('albakor.glb'), url('albakor_lod1.glb')],
  northsilver: [url('northsilver.glb'), url('northsilver_lod1.glb')],
};
const PIER_URL = url('boat-pier.glb');
export const BOAT_PICS: Record<BoatId, string> = { volzhanka: url('volzhanka.jpg'), albakor: url('albakor.jpg'), northsilver: url('northsilver.jpg') };

/** Части лодки по материалу */
const P_OPAQUE = 0;
const P_GLASS = 1;
const P_GLOW = 2;

/** Общие материалы лодок и пирса: цвет — в вершинах (из GLB, умноженный на цвет материала) */
const MATS: THREE.Material[] = [
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.12 }),
  new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, roughness: 0.06, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ vertexColors: true }),
];

function partOf(mat: THREE.Material): number {
  const n = mat.name;
  return n === 'fb_glass' ? P_GLASS : n === 'fb_glow' ? P_GLOW : P_OPAQUE;
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

/** Сетка GLB → в осях корня (matrix), только позиция, нормаль и цвет (цвет вершин × цвет материала) */
function bake(mesh: THREE.Mesh, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = g.getAttribute('color');
  const tint = (mesh.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1);
  const n = pos.count;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const C = new Float32Array(n * 3);
  _m3.getNormalMatrix(matrix);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    P.set([_v.x, _v.y, _v.z], i * 3);
    if (nor) _n.fromBufferAttribute(nor, i).applyMatrix3(_m3).normalize();
    else _n.set(0, 1, 0);
    N.set([_n.x, _n.y, _n.z], i * 3);
    const r = col ? col.getX(i) : 1;
    const gg = col ? col.getY(i) : 1;
    const b = col ? col.getZ(i) : 1;
    C.set([r * tint.r, gg * tint.g, b * tint.b], i * 3);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (g.index) out.setIndex(Array.from(g.index.array as ArrayLike<number>));
  else out.setIndex(Array.from({ length: n }, (_, i) => i));
  return out;
}

/** Склеить по частям: [непрозрачное, стекло, свечение] (пустая часть — null) */
function mergeParts(list: Array<[number, THREE.BufferGeometry]>): Array<THREE.BufferGeometry | null> {
  const out: Array<THREE.BufferGeometry | null> = [];
  for (let p = 0; p < 3; p++) {
    const gs = list.filter(([k]) => k === p).map(([, g]) => g);
    out.push(gs.length ? mergeGeometries(gs, false) : null);
  }
  return out;
}

function underNamed(o: THREE.Object3D, names: readonly string[]): boolean {
  for (let a: THREE.Object3D | null = o; a; a = a.parent) if (names.includes(a.name)) return true;
  return false;
}

interface BoatGeo {
  /** [LOD][часть] */
  parts: Array<Array<THREE.BufferGeometry | null>>;
  anchor: THREE.BufferGeometry | null;
  /** Где якорь и трос в осях лодки */
  anchorAt: THREE.Vector3;
  ropeAt: THREE.Vector3;
}

async function loadBoat(id: BoatId): Promise<BoatGeo> {
  const loader = new GLTFLoader();
  const [lod0, lod1] = await Promise.all(BOAT_URLS[id].map((u) => loader.loadAsync(u)));
  const geo: BoatGeo = { parts: [], anchor: null, anchorAt: new THREE.Vector3(0, 0.64, BOATS.find((b) => b.id === id)!.bowZ), ropeAt: new THREE.Vector3() };
  geo.ropeAt.copy(geo.anchorAt).setY(geo.anchorAt.y + 0.02);
  for (const [li, gltf] of [lod0, lod1].entries()) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const list: Array<[number, THREE.BufferGeometry]> = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (underNamed(m, ['anchor_rope'])) return;
      if (underNamed(m, ['anchor'])) {
        if (li === 0 && !geo.anchor) {
          // якорь — в своих осях (от скобы)
          const a = root.getObjectByName('anchor')!;
          geo.anchorAt.setFromMatrixPosition(a.matrixWorld);
          const inv = new THREE.Matrix4().copy(a.matrixWorld).invert().multiply(m.matrixWorld);
          geo.anchor = bake(m, inv);
        }
        return;
      }
      list.push([partOf(m.material as THREE.Material), bake(m, m.matrixWorld)]);
    });
    const rope = root.getObjectByName('anchor_rope');
    if (rope) geo.ropeAt.setFromMatrixPosition(rope.matrixWorld);
    geo.parts.push(mergeParts(list));
  }
  return geo;
}

/** Поза лодки для отрисовки: где, курс, крен и дифферент (нос вверх на ходу), якорь 0…1 (0 — поднят) */
export interface FleetPose {
  kind: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  anchor: number;
}

/** Ближе — полная модель, дальше — LOD1, ещё дальше лодку не рисуем (её съедает дымка) */
const LOD_NEAR = 60;
const DRAW_FAR = 450;
/** Глубина, на которую уходит якорь (под водой его не видно), м */
const ANCHOR_DEPTH = 3.5;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _mb = new THREE.Matrix4();
const _ml = new THREE.Matrix4();

/** Все лодки на воде: инстансы по типу, LOD и части. Пока модели грузятся — не рисуем ничего. */
export class BoatFleet {
  private readonly group = new THREE.Group();
  /** [тип][LOD][часть] */
  private readonly meshes: Array<Array<Array<THREE.InstancedMesh | null>>> = [];
  private readonly anchors: Array<THREE.InstancedMesh | null> = [];
  private rope: THREE.InstancedMesh | null = null;
  private readonly geos: Array<BoatGeo | null> = BOATS.map(() => null);
  private loading = false;
  ready = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'ownboats';
    scene.add(this.group);
  }

  /** Загрузить модели (один раз, когда флаг ISLE включён) */
  load(): void {
    if (this.loading) return;
    this.loading = true;
    BOATS.forEach((b, t) => {
      const go = (): Promise<void> => loadBoat(b.id).then((g) => this.build(t, g));
      go().catch(() => new Promise((r) => setTimeout(r, 800)).then(go)).catch((e) => console.warn('лодка не загрузилась', b.id, e));
    });
  }

  private build(t: number, g: BoatGeo): void {
    this.geos[t] = g;
    const lods: Array<Array<THREE.InstancedMesh | null>> = [];
    for (const parts of g.parts) {
      lods.push(parts.map((geo, p) => {
        if (!geo) return null;
        const m = new THREE.InstancedMesh(geo, MATS[p], OB_WORLD_MAX);
        m.count = 0;
        m.visible = false;
        m.frustumCulled = false;
        m.renderOrder = p === P_GLASS ? 2 : 0;
        this.group.add(m);
        return m;
      }));
    }
    this.meshes[t] = lods;
    if (g.anchor) {
      const a = new THREE.InstancedMesh(g.anchor, MATS[P_OPAQUE], OB_WORLD_MAX);
      a.count = 0;
      a.visible = false;
      a.frustumCulled = false;
      this.group.add(a);
      this.anchors[t] = a;
    }
    if (!this.rope) {
      // трос: тонкий цилиндр 1 м вниз от ролика, растягиваем по глубине
      const rg = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true).translate(0, -0.5, 0);
      const c = new Float32Array(rg.getAttribute('position').count * 3).fill(0.82);
      rg.setAttribute('color', new THREE.BufferAttribute(c, 3));
      this.rope = new THREE.InstancedMesh(rg, MATS[P_OPAQUE], OB_WORLD_MAX);
      this.rope.count = 0;
      this.rope.visible = false;
      this.rope.frustumCulled = false;
      this.group.add(this.rope);
    }
    this.ready = this.geos.every((x) => x);
  }

  /** Расставить лодки этого кадра */
  draw(list: readonly FleetPose[], cam: THREE.Vector3): void {
    for (const lods of this.meshes) for (const parts of lods ?? []) for (const m of parts) if (m) m.count = 0;
    for (const a of this.anchors) if (a) a.count = 0;
    if (this.rope) this.rope.count = 0;
    for (const b of list) {
      const lods = this.meshes[b.kind];
      const g = this.geos[b.kind];
      if (!lods || !g) continue;
      const d = Math.hypot(b.x - cam.x, b.z - cam.z);
      if (d > DRAW_FAR) continue;
      _e.set(b.pitch, b.yaw, b.roll);
      _q.setFromEuler(_e);
      _p.set(b.x, b.y, b.z);
      _mb.compose(_p, _q, _s);
      const parts = lods[d < LOD_NEAR ? 0 : 1] ?? lods[0];
      for (const m of parts) {
        if (!m) continue;
        m.setMatrixAt(m.count++, _mb);
      }
      // якорь: висит под роликом, на якоре — уходит в воду, трос тянется за ним
      const a = this.anchors[b.kind];
      if (a && d < LOD_NEAR * 2) {
        const depth = b.anchor * ANCHOR_DEPTH;
        _ml.makeTranslation(g.anchorAt.x, g.anchorAt.y - depth, g.anchorAt.z).premultiply(_mb);
        a.setMatrixAt(a.count++, _ml);
        if (this.rope && depth > 0.05) {
          _ml.makeScale(1, depth + 0.02, 1).setPosition(g.ropeAt).premultiply(_mb);
          this.rope.setMatrixAt(this.rope.count++, _ml);
        }
      }
    }
    for (const lods of this.meshes) {
      for (const parts of lods ?? []) {
        for (const m of parts) {
          if (!m) continue;
          m.visible = m.count > 0;
          if (m.count) m.instanceMatrix.needsUpdate = true;
        }
      }
    }
    for (const a of this.anchors) {
      if (!a) continue;
      a.visible = a.count > 0;
      if (a.count) a.instanceMatrix.needsUpdate = true;
    }
    if (this.rope) {
      this.rope.visible = this.rope.count > 0;
      if (this.rope.count) this.rope.instanceMatrix.needsUpdate = true;
    }
  }

  get drawn(): number {
    let n = 0;
    for (const lods of this.meshes) for (const parts of lods ?? []) for (const m of parts) if (m?.visible) n++;
    return n;
  }
}

// ------------------------------------------------------------ пирс-стоянка

/** Табличка места: номер, чья лодка (или свободно), моя ли */
export interface PlateInfo {
  nick: string;
  mine: boolean;
}

const COLS = 5;
const ROWS = 2;
const CW = 300;
const CH = 210;

/** Пирс за домом Семёна: настил, фонари, таблички мест (канвас) */
export class PierModel {
  readonly group = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly tex: THREE.CanvasTexture;
  private readonly plateMat: THREE.MeshStandardMaterial;
  private loading = false;
  private key = '';

  constructor(scene: THREE.Scene) {
    this.group.name = 'boat-pier';
    this.group.position.set(PARK.x, PARK.y, PARK.z);
    this.group.visible = false;
    scene.add(this.group);
    this.canvas.width = CW * COLS;
    this.canvas.height = CH * ROWS;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.plateMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.plates(Array.from({ length: PARK_COUNT }, () => null));
  }

  set visible(on: boolean) {
    this.group.visible = on;
    if (on) this.load();
  }

  private load(): void {
    if (this.loading) return;
    this.loading = true;
    const go = (): Promise<void> => new GLTFLoader().loadAsync(PIER_URL).then((g) => this.build(g.scene));
    go().catch(() => new Promise((r) => setTimeout(r, 800)).then(go)).catch((e) => console.warn('пирс не загрузился', e));
  }

  private build(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const list: Array<[number, THREE.BufferGeometry]> = [];
    const plates: THREE.BufferGeometry[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      if (mat.name === 'fb_number') {
        const name = m.name.match(/slip_no_(\d+)/) ? m.name : m.parent?.name ?? '';
        const i = Number(name.match(/(\d+)$/)?.[1] ?? 0) - 1;
        if (i < 0) return;
        const g = bake(m, m.matrixWorld);
        plates.push(plateUv(g, i));
        return;
      }
      list.push([partOf(mat), bake(m, m.matrixWorld)]);
    });
    mergeParts(list).forEach((g, p) => {
      if (!g) return;
      const mesh = new THREE.Mesh(g, MATS[p]);
      mesh.receiveShadow = p === P_OPAQUE;
      this.group.add(mesh);
    });
    if (plates.length) {
      const g = mergeGeometries(plates, false);
      if (g) {
        g.deleteAttribute('color');
        this.group.add(new THREE.Mesh(g, this.plateMat));
      }
    }
  }

  /** Таблички: номер места, ник хозяина лодки (своя — тёплым) или «свободно» */
  plates(list: ReadonlyArray<PlateInfo | null>): void {
    const key = list.map((p) => (p ? `${p.nick}|${p.mine}` : '-')).join(',');
    if (key === this.key) return;
    this.key = key;
    const c = this.canvas.getContext('2d');
    if (!c) return;
    for (let i = 0; i < PARK_COUNT; i++) {
      const x = (i % COLS) * CW;
      const y = Math.floor(i / COLS) * CH;
      const p = list[i] ?? null;
      c.fillStyle = p ? (p.mine ? '#ffe2a8' : '#efe6d4') : '#cfe8cf';
      c.fillRect(x, y, CW, CH);
      c.strokeStyle = 'rgba(40,30,20,0.55)';
      c.lineWidth = 8;
      c.strokeRect(x + 6, y + 6, CW - 12, CH - 12);
      c.fillStyle = '#2d2219';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '800 96px system-ui, sans-serif';
      c.fillText(String(i + 1), x + CW / 2, y + 78);
      c.font = '600 38px system-ui, sans-serif';
      let label = p ? p.nick : 'свободно';
      while (label.length > 3 && c.measureText(label).width > CW - 30) label = label.slice(0, -2) + '…';
      c.fillStyle = p ? '#2d2219' : '#2f6b34';
      c.fillText(label, x + CW / 2, y + 160);
    }
    this.tex.needsUpdate = true;
  }
}

/** UV таблички места i в атласе: читается с мостика (западные — лицом на запад, восточные — на восток) */
function plateUv(g: THREE.BufferGeometry, i: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  const hw = Math.max(1e-3, (bb.max.x - bb.min.x) / 2);
  const hd = Math.max(1e-3, (bb.max.z - bb.min.z) / 2);
  const west = cx < 0;
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const uv = new Float32Array(pos.count * 2);
  for (let k = 0; k < pos.count; k++) {
    const dx = (pos.getX(k) - cx) / hw;
    const dz = (pos.getZ(k) - cz) / hd;
    const u = west ? (1 - dz) / 2 : (1 + dz) / 2;
    const v = west ? (1 - dx) / 2 : (1 + dx) / 2;
    uv[k * 2] = (col + u) / COLS;
    uv[k * 2 + 1] = 1 - (row + 1 - v) / ROWS;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
