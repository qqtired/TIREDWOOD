// Предметы двора на экране: по одной InstancedMesh на вид, общая для предметов двора и прячущихся (та же модель,
// материал, масштаб и тень — по картинке не отличить). Кто двигается — переваливается с боку на бок; стоящий —
// неподвижен, как настоящий. Кляксы — капли краски на поверхности модели; подсветка — только у своей цели.
import * as THREE from 'three';
import { HIDE_KIND, HIDE_KINDS, type HideKind } from '../../shared/hideprops.ts';
import { propGeometry } from './models.ts';

/** Предмет в кадре: позиция и поворот (радианы) уже интерполированы; speed — м/с (для переваливания). */
export interface PropView { id: number; kind: HideKind; x: number; y: number; z: number; yaw: number; stains: number; speed: number }

export const PAINT_COLOR = 0xff3d9a;
const BLOBS = 3 * 12;

interface Spot { p: THREE.Vector3; n: THREE.Vector3 }

export class HideProps {
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.03 });
  private readonly scene: THREE.Scene;
  private readonly meshes = new Map<HideKind, THREE.InstancedMesh>();
  private readonly used = new Map<HideKind, number>();
  private readonly blobs: THREE.InstancedMesh;
  private readonly outline: THREE.LineSegments;
  private readonly spots = new Map<HideKind, Spot[]>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private sig = NaN;
  /** Где сейчас нарисован предмет id (для эффектов попадания) */
  readonly where = new Map<number, PropView>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (const k of HIDE_KINDS) this.grow(k, 24);
    const blobGeo = new THREE.SphereGeometry(1, 10, 7).scale(1, 1, 0.32);
    this.blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshStandardMaterial({ color: PAINT_COLOR, roughness: 0.28, metalness: 0 }), BLOBS);
    this.blobs.frustumCulled = false;
    this.blobs.castShadow = false;
    this.blobs.count = 0;
    scene.add(this.blobs);
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, depthTest: false }));
    this.outline.renderOrder = 5;
    this.outline.visible = false;
    scene.add(this.outline);
  }

  private grow(kind: HideKind, cap: number): THREE.InstancedMesh {
    const old = this.meshes.get(kind);
    if (old) { this.scene.remove(old); old.dispose(); }
    const mesh = new THREE.InstancedMesh(propGeometry(kind), this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    this.meshes.set(kind, mesh);
    return mesh;
  }

  /** Точки на поверхности модели для клякс: лучи к оси на трёх высотах с трёх сторон. */
  private spotsOf(kind: HideKind): Spot[] {
    let list = this.spots.get(kind);
    if (list) return list;
    list = [];
    const f = HIDE_KIND[kind];
    const probe = new THREE.Mesh(propGeometry(kind), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    probe.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    for (const [a, k] of [[0.5, 0.48], [2.8, 0.7], [4.4, 0.3]] as const) {
      const y = f.h * k, dir = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
      ray.set(new THREE.Vector3(Math.sin(a) * 3, y, Math.cos(a) * 3), dir);
      const hit = ray.intersectObject(probe)[0];
      if (hit?.face) list.push({ p: hit.point.clone(), n: hit.face.normal.clone().setY(0).normalize() });
      else list.push({ p: new THREE.Vector3(Math.sin(a) * f.w * 0.8, y, Math.cos(a) * f.d * 0.8), n: dir.clone().negate() });
    }
    this.spots.set(kind, list);
    return list;
  }

  /**
   * Кадр: расставить все предметы. target — id, на который смотрит свой прячущийся (подсветка), 0 — нет.
   * Возвращает true, если что-то сдвинулось — тогда тени надо пересчитать в этом же кадре.
   */
  update(list: readonly PropView[], t: number, target: number): boolean {
    for (const k of HIDE_KINDS) this.used.set(k, 0);
    let sig = list.length, blobs = 0;
    this.where.clear();
    this.outline.visible = false;
    for (const b of list) {
      this.where.set(b.id, b);
      let mesh = this.meshes.get(b.kind)!;
      const i = this.used.get(b.kind)!;
      if (i >= mesh.instanceMatrix.count) mesh = this.grow(b.kind, mesh.instanceMatrix.count * 2);
      this.used.set(b.kind, i + 1);
      // переваливается, пока едет; стоит — как вкопанный
      const go = Math.min(1, b.speed / 3);
      const ph = t * 13 + b.id * 1.7;
      const hop = go > 0.05 ? Math.abs(Math.sin(ph)) * 0.05 * go : 0;
      const tilt = go > 0.05 ? Math.sin(ph) * 0.08 * go : 0;
      this.e.set(0, b.yaw, tilt);
      this.q.setFromEuler(this.e);
      this.v.set(b.x, b.y + hop, b.z);
      this.m.compose(this.v, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
      sig += b.x * 3.1 + b.y * 7.7 + b.z * 1.3 + b.yaw * 0.37 + hop * 11 + tilt * 5 + i * 0.001;
      if (b.stains > 0 && blobs < BLOBS) {
        const spots = this.spotsOf(b.kind), size = HIDE_KIND[b.kind].size;
        for (let k = 0; k < Math.min(3, b.stains) && blobs < BLOBS; k++) {
          const sp = spots[k];
          const r = (0.075 + size * 0.03) * (1 + ((b.id * 7 + k * 3) % 5) * 0.08);
          const p = this.v.copy(sp.p).applyMatrix4(this.m);
          const n = sp.n.clone().applyQuaternion(this.q);
          const q = new THREE.Quaternion().setFromUnitVectors(this.zAxis, n);
          this.blobs.setMatrixAt(blobs++, new THREE.Matrix4().compose(p.addScaledVector(n, 0.012), q, new THREE.Vector3(r, r, r)));
        }
      }
      if (b.id === target) {
        const f = HIDE_KIND[b.kind];
        this.outline.visible = true;
        this.outline.position.set(b.x, b.y, b.z);
        this.outline.rotation.set(0, b.yaw, 0);
        this.outline.scale.set(f.w * 2 + 0.06, f.h + 0.04, f.d * 2 + 0.06);
        (this.outline.material as THREE.LineBasicMaterial).opacity = 0.65 + Math.sin(t * 6) * 0.25;
      }
    }
    for (const [k, mesh] of this.meshes) {
      const n = this.used.get(k)!;
      mesh.count = n;
      if (n) mesh.instanceMatrix.needsUpdate = true;
    }
    this.blobs.count = blobs;
    if (blobs) this.blobs.instanceMatrix.needsUpdate = true;
    const changed = sig !== this.sig;
    this.sig = sig;
    return changed;
  }

  clear(): void {
    for (const mesh of this.meshes.values()) mesh.count = 0;
    this.blobs.count = 0;
    this.outline.visible = false;
    this.where.clear();
    this.sig = NaN;
  }
}
