// Короткое приветствие морской желейки в середине поездки «Ласточки».
// Только визуальный эффект: без коллизии, урона, влияния на катер или сетевых сообщений.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import type { BoatStatus } from '../../shared/messages.ts';
import { KrakenCue, krakenFrame } from './krakentiming.ts';

export type KrakenQuality = 'high' | 'medium' | 'low';
export interface KrakenViewer {
  x: number;
  z: number;
  riding?: boolean;
  /** Если есть камера, скрытый за экраном эффект не обновляет инстансы. */
  camera?: THREE.Camera;
}
export interface KrakenOptions {
  quality?: KrakenQuality;
  /** Шина звука принадлежит сцене; вызывается максимум один раз за наблюдаемую поездку. */
  onScare?: (position: { x: number; y: number; z: number }) => void;
}

const ARMS = 8;
const MAX_SEGMENTS = ARMS * 8;
const MAX_DROPS = 24;
const FAR_SQ = 100 * 100;
const SOUND_SQ = 27 * 27;
const UP = new THREE.Vector3(0, 1, 0);

export class Kraken {
  private readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly arms: THREE.InstancedMesh;
  private readonly suckers: THREE.InstancedMesh;
  private readonly drops: THREE.InstancedMesh;
  private readonly rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly cue = new KrakenCue();
  private readonly onScare: KrakenOptions['onScare'];
  private quality: KrakenQuality;
  private readonly dummy = new THREE.Object3D();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  private readonly bound = new THREE.Sphere(new THREE.Vector3(), 8);
  private disposed = false;
  private age = -1;

  constructor(scene: THREE.Scene, opts: KrakenOptions = {}) {
    this.onScare = opts.onScare;
    this.quality = opts.quality ?? 'high';
    this.root.name = 'boat-kraken';
    this.root.visible = false;
    scene.add(this.root);
    this.root.add(this.body);

    const skin = new THREE.MeshStandardMaterial({ color: 0x258f98, roughness: 0.36, metalness: 0.04 });
    const mint = new THREE.MeshStandardMaterial({ color: 0xace5cd, roughness: 0.65 });
    const white = new THREE.MeshStandardMaterial({ color: 0xfff5d8, roughness: 0.4 });
    const ink = new THREE.MeshStandardMaterial({ color: 0x17333e, roughness: 0.48 });
    const round = new THREE.SphereGeometry(1, 16, 12);
    const segment = new THREE.SphereGeometry(1, 8, 6);
    const head = new THREE.Mesh(round, skin);
    head.scale.set(1.65, 1.75, 1.45);
    this.body.add(head);
    const muzzle = new THREE.Mesh(round, mint);
    muzzle.position.set(0, -0.52, 1.05);
    muzzle.scale.set(0.94, 0.57, 0.42);
    this.body.add(muzzle);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(round, white);
      eye.position.set(side * 0.65, 0.4, 1.22);
      eye.scale.set(0.42, 0.54, 0.27);
      this.body.add(eye);
      const pupil = new THREE.Mesh(round, ink);
      pupil.position.set(side * 0.61, 0.39, 1.45);
      pupil.scale.set(0.19, 0.29, 0.105);
      this.body.add(pupil);
      const glint = new THREE.Mesh(segment, white);
      glint.position.set(side * 0.61 - 0.045, 0.49, 1.55);
      glint.scale.setScalar(0.055);
      this.body.add(glint);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.05, 5, 14, Math.PI), ink);
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.48, 1.45);
    this.body.add(smile);

    this.arms = new THREE.InstancedMesh(segment, skin, MAX_SEGMENTS);
    this.suckers = new THREE.InstancedMesh(segment, mint, MAX_SEGMENTS);
    const foam = new THREE.MeshBasicMaterial({ color: 0xd9f9ef, transparent: true, opacity: 0.62, depthWrite: false });
    this.drops = new THREE.InstancedMesh(segment, foam, MAX_DROPS);
    for (const mesh of [this.arms, this.suckers, this.drops]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Собственный общий bounding sphere проверяется до обновления; исключаем устаревшие bounds инстансов.
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    const ringGeometry = new THREE.RingGeometry(0.87, 1, 40);
    for (let i = 0; i < 3; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xb9e9dc, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.018 + i * 0.004;
      this.rings.push(ring);
      this.root.add(ring);
    }
    this.setQuality(this.quality);
  }

  setQuality(quality: KrakenQuality): void {
    this.quality = quality;
    const segments = quality === 'low' ? 4 : quality === 'medium' ? 6 : 8;
    this.arms.count = ARMS * segments;
    this.suckers.count = this.arms.count;
    this.drops.count = quality === 'low' ? 8 : quality === 'medium' ? 16 : MAX_DROPS;
    this.rings[2].visible = quality !== 'low';
  }

  update(renderTick: number, boat: BoatStatus, viewer: KrakenViewer): void {
    if (this.disposed) return;
    const frame = krakenFrame(renderTick, boat);
    const distanceSq = frame ? (frame.x - viewer.x) ** 2 + (frame.z - viewer.z) ** 2 : Infinity;
    const audible = !!frame && distanceSq <= (viewer.riding ? 40 * 40 : SOUND_SQ);
    if (this.cue.update(renderTick, boat, audible) && frame) this.onScare?.({ x: frame.x, y: WATER_Y + 1, z: frame.z });
    if (!frame || distanceSq > FAR_SQ) { this.root.visible = false; this.age = -1; return; }
    if (viewer.camera) {
      viewer.camera.updateMatrixWorld();
      this.projection.multiplyMatrices(viewer.camera.projectionMatrix, viewer.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projection);
      this.bound.center.set(frame.x, WATER_Y + 1, frame.z);
      if (!this.frustum.intersectsSphere(this.bound)) { this.root.visible = false; return; }
    }
    this.root.visible = true;
    this.age = frame.age;
    this.root.position.set(frame.x, WATER_Y, frame.z);
    this.root.rotation.y = frame.yaw;
    const age = frame.age, emerge = frame.emerge;
    this.body.position.y = -3.9 + emerge * 5.05;
    this.body.rotation.z = Math.sin(age * 1.55) * 0.065 * emerge;
    this.body.scale.set(1 + Math.sin(age * 3.1) * 0.035, 1 + Math.cos(age * 3.1) * 0.025, 1);

    const n = this.arms.count / ARMS;
    for (let arm = 0; arm < ARMS; arm++) {
      const angle = (arm / ARMS) * Math.PI * 2 + 0.18;
      for (let j = 0; j < n; j++) {
        this.armPoint(angle, j / n, age, emerge, this.a);
        this.armPoint(angle, (j + 1) / n, age, emerge, this.b);
        this.direction.subVectors(this.b, this.a);
        const length = this.direction.length();
        const radius = 0.37 * (1 - (j / n) * 0.78);
        this.dummy.position.copy(this.a).add(this.b).multiplyScalar(0.5);
        this.dummy.quaternion.setFromUnitVectors(UP, this.direction.normalize());
        this.dummy.scale.set(radius, length * 0.7 + radius * 0.15, radius);
        this.dummy.updateMatrix();
        const index = arm * n + j;
        this.arms.setMatrixAt(index, this.dummy.matrix);
        this.dummy.position.y += radius * 0.75;
        this.dummy.quaternion.identity();
        this.dummy.scale.set(radius * 0.62, radius * 0.3, radius * 0.62);
        this.dummy.updateMatrix();
        this.suckers.setMatrixAt(index, this.dummy.matrix);
      }
    }
    this.arms.instanceMatrix.needsUpdate = true;
    this.suckers.instanceMatrix.needsUpdate = true;

    // Два коротких всплеска: выход и погружение. Все капли переиспользуются, без накопления частиц.
    const burst = age < 3 ? age - 0.2 : age - 4.2;
    this.drops.visible = burst >= 0 && burst < 1.5;
    if (this.drops.visible) {
      for (let i = 0; i < this.drops.count; i++) {
        const angle = i * 2.399963, speed = 1.3 + (i % 5) * 0.2;
        const radius = 2.1 + burst * speed;
        this.dummy.position.set(Math.cos(angle) * radius, Math.max(-0.2, 0.1 + (2.1 + (i % 4) * 0.28) * burst - 2.4 * burst * burst), Math.sin(angle) * radius);
        this.dummy.quaternion.identity();
        const size = 0.045 + (i % 3) * 0.018;
        this.dummy.scale.set(size, size * 1.7, size);
        this.dummy.updateMatrix();
        this.drops.setMatrixAt(i, this.dummy.matrix);
      }
      this.drops.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < this.rings.length; i++) {
      const k = (age * 0.42 + i / 3) % 1;
      this.rings[i].scale.setScalar(2 + k * 4.5);
      this.rings[i].material.opacity = (1 - k) * 0.22 * emerge;
    }
  }

  private armPoint(angle: number, t: number, age: number, emerge: number, out: THREE.Vector3): void {
    const bend = angle + Math.sin(t * Math.PI * 1.5 + age * 1.6 + angle) * 0.15 * t;
    const radius = 1.2 + t * 3.6;
    const crest = Math.sin(t * Math.PI) * (2.25 + Math.sin(angle * 2 + age * 1.4) * 0.48);
    out.set(Math.cos(bend) * radius, -1.5 + emerge * (1.65 + crest + Math.sin(t * 4 + age * 2 + angle) * 0.11), Math.sin(bend) * radius);
  }

  reset(): void { this.root.visible = false; this.age = -1; this.cue.reset(); }

  debug(): { visible: boolean; age: number; x: number; z: number; segments: number; particles: number } {
    return { visible: this.root.visible, age: this.age, x: this.root.position.x, z: this.root.position.z, segments: this.arms.count, particles: this.drops.count };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
