// Катер «Портовой регаты»: корпус Kenney (GLB) и детали кодом — сиденья, руль, подвесной мотор с винтом, номера на
// бортах; за рулём — желейка игрока или бота. Качается на зыби, задирает нос на разгоне, кренится в повороте и сильнее
// в заносе, в прыжке с трамплина — на высоте из физики. hop — желейка «запрыгивает» в катер дугой (0,6 с).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WATER_Y } from '../../shared/constants.ts';
import { PALETTE, type Outfit } from '../../shared/outfit.ts';
import { E_ALIVE } from '../../shared/protocol.ts';
import { Avatar, DRIVE_TURN, DRIVE_WHEEL, type AvatarPose } from '../render/avatar.ts';

export const SPORT_BOAT = { beam: 1.92, length: 4.68, seatX: 0.35, seatY: 0.42, seatZ: 0.64 } as const;
/** Прыжок желейки в катер и из катера, с; высота дуги — от расстояния */
export const HOP_S = 0.6;

/** Лёгкая зыбь в бухте (только картинка: море в игре плоское, волны — в шейдере): подъём, дифферент и крен. */
export function rgSwell(x: number, z: number, t: number, out: { y: number; pitch: number; roll: number }): { y: number; pitch: number; roll: number } {
  const a = x * 0.05 + t * 1.1;
  const b = z * 0.07 - t * 0.8;
  out.y = Math.sin(a) * 0.05 + Math.sin(b) * 0.035;
  out.pitch = Math.cos(a) * 0.018;
  out.roll = Math.cos(b) * 0.024;
  return out;
}

/** Точка дуги прыжка из a в b на доле k (0…1): выше всего в середине. */
export function hopArc(ax: number, ay: number, az: number, bx: number, by: number, bz: number, k: number, out: THREE.Vector3): THREE.Vector3 {
  const e = k * k * (3 - 2 * k);
  const d = Math.hypot(bx - ax, bz - az);
  const h = Math.min(9, 1.2 + d * 0.16);
  return out.set(ax + (bx - ax) * e, ay + (by - ay) * e + 4 * h * k * (1 - k), az + (bz - az) * e);
}

const assetUrl = new URL('../assets/boats/kenney-speed-a.glb', import.meta.url).href;
let asset: Promise<THREE.Group> | null = null;
function sourceBoat(): Promise<THREE.Group> {
  if (asset) return asset;
  const load = () => new GLTFLoader().loadAsync(assetUrl).then((g) => g.scene);
  // один повтор на общий запрос; следующие катера после окончательной ошибки попробуют снова
  const pending = load().catch(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    return load();
  });
  asset = pending;
  void pending.catch(() => {
    if (asset === pending) asset = null;
  });
  return pending;
}

let teak: THREE.CanvasTexture | null = null;
function teakTexture(): THREE.CanvasTexture {
  if (teak) return teak;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#927358';
  g.fillRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = x % 32 ? '#a48364' : '#94765c';
    g.fillRect(x + 1, 0, 14, 256);
    g.fillStyle = '#293b3e';
    g.fillRect(x, 0, 2, 256);
  }
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = `rgba(236,213,167,${0.025 + (i % 4) * 0.012})`;
    g.beginPath();
    const x = (i * 37) % 128;
    g.moveTo(x, i % 256);
    g.lineTo(x + 0.5, (i % 256) + 15);
    g.stroke();
  }
  teak = new THREE.CanvasTexture(c);
  teak.colorSpace = THREE.SRGBColorSpace;
  teak.wrapS = teak.wrapT = THREE.RepeatWrapping;
  teak.repeat.set(1, 2);
  return teak;
}

function numberTexture(number: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4f0dc';
  x.beginPath();
  x.roundRect(4, 7, 248, 114, 20);
  x.fill();
  x.strokeStyle = '#213e50';
  x.lineWidth = 5;
  x.stroke();
  x.fillStyle = '#203f50';
  x.font = '900 86px Rubik,system-ui,sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(String(number).padStart(2, '0'), 128, 67);
  return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace });
}

function pipe(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(8, points.length * 5), radius, 6, false), material);
}

/** Неподвижные детали одного материала — одной сеткой. */
function batchStatic(parent: THREE.Object3D): void {
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  for (const object of [...parent.children]) {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) continue;
    let group = groups.get(object.material);
    if (!group) {
      group = [];
      groups.set(object.material, group);
    }
    group.push(object);
  }
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(parts, false);
    if (!geometry) {
      for (const p of parts) p.dispose();
      continue;
    }
    for (const mesh of meshes) {
      parent.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const p of parts) p.dispose();
    const batch = new THREE.Mesh(geometry, material);
    batch.castShadow = batch.receiveShadow = true;
    parent.add(batch);
  }
}

const _seat = new THREE.Vector3();

/** Видимый корпус — из модели Kenney; руль, мотор и винт двигаются отдельно. */
export class BoatModel {
  readonly root = new THREE.Group();
  readonly rider: Avatar;
  readonly ready: Promise<void>;
  /** Где сиденье в мире (после update) */
  readonly seat = new THREE.Vector3();
  private readonly accent: THREE.MeshPhysicalMaterial;
  private readonly engine = new THREE.Group();
  private readonly propeller = new THREE.Group();
  private readonly wheel = new THREE.Group();
  private readonly number: THREE.CanvasTexture;
  private readonly riderPose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE };
  private readonly mats = new Set<THREE.Material>();
  private readonly swell = { y: 0, pitch: 0, roll: 0 };
  private disposed = false;
  private loaded = false;
  private roll = 0;
  private pitch = 0;
  private prevSpeed = 0;
  private spin = 0;
  /** Прыжок в катер: откуда и сколько прошло (−1 — сидит) */
  private readonly hopFrom = new THREE.Vector3();
  private hopT = -1;

  /** id — номер катера (на бортах id + 1), riderId — номер игрока в снимке (голос), у бота — voice = false. */
  constructor(scene: THREE.Scene, id: number, riderId: number, voice: boolean, outfit: Outfit, name: string) {
    this.root.name = `regatta-boat-${id}`;
    scene.add(this.root);
    this.accent = new THREE.MeshPhysicalMaterial({ color: PALETTE[outfit.c] ?? 0x287a92, roughness: 0.24, metalness: 0.09, clearcoat: 0.85, clearcoatRoughness: 0.2 });
    const ivory = new THREE.MeshPhysicalMaterial({ color: 0xf0eddf, roughness: 0.35, metalness: 0.025, clearcoat: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x182f3b, roughness: 0.53, metalness: 0.08 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x202b30, roughness: 0.86 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xbdc8c5, roughness: 0.25, metalness: 0.83 });
    const leather = new THREE.MeshStandardMaterial({ color: 0xe5e4d9, roughness: 0.68 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9dc5ca, metalness: 0.04, roughness: 0.12, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 });
    const timber = new THREE.MeshStandardMaterial({ map: teakTexture(), roughness: 0.92 });
    for (const m of [this.accent, ivory, dark, rubber, chrome, leather, glass, timber]) this.mats.add(m);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    };
    // открытый кокпит ниже бортов: два отдельных сиденья со спинками
    mesh(new THREE.BoxGeometry(1.28, 0.045, 1.58), timber, 0, 0.385, 0.38);
    for (const side of [-1, 1]) {
      mesh(new THREE.SphereGeometry(1, 18, 12).scale(0.29, 0.105, 0.34), leather, side * 0.35, 0.48, 0.61);
      const back = mesh(new THREE.SphereGeometry(1, 18, 12).scale(0.3, 0.34, 0.1), leather, side * 0.35, 0.75, 0.96);
      back.rotation.x = -0.12;
      mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.24, 10), chrome, side * 0.35, 0.28, 0.61);
      // привальный брус — по скуле от кормы вокруг носа
      this.root.add(pipe([new THREE.Vector3(side * 0.88, 0.39, 1.79), new THREE.Vector3(side * 0.96, 0.37, 0.72), new THREE.Vector3(side * 0.89, 0.42, -0.55), new THREE.Vector3(side * 0.62, 0.47, -1.53), new THREE.Vector3(side * 0.07, 0.43, -2.2)], 0.047, this.accent));
      const fender = mesh(new THREE.CapsuleGeometry(0.085, 0.43, 4, 8), rubber, side * 0.96, 0.29, 0.73);
      fender.rotation.x = Math.PI / 2;
      for (const z of [-1.3, 1.49]) {
        mesh(new THREE.BoxGeometry(0.19, 0.035, 0.065), chrome, side * (z < 0 ? 0.56 : 0.78), 0.53, z);
        mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.07, 6), chrome, side * (z < 0 ? 0.56 : 0.78), 0.48, z);
      }
      mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), chrome, side * 0.82, 0.42, -0.68);
      mesh(new THREE.SphereGeometry(0.034, 10, 6), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xe26651 : 0x72c99c }), side * 0.82, 0.455, -0.68);
    }
    // рамка ветрового стекла — по вершинам стекла модели
    for (const side of [-1, 1]) {
      this.root.add(pipe([new THREE.Vector3(side * 0.444, 0.656, -0.232), new THREE.Vector3(side * 0.195, 0.656, -0.715), new THREE.Vector3(0, 0.656, -0.846)], 0.016, chrome));
      this.root.add(pipe([new THREE.Vector3(side * 0.592, 0.407, -0.52), new THREE.Vector3(side * 0.259, 0.407, -1.163), new THREE.Vector3(0, 0.407, -1.339)], 0.015, chrome));
      this.root.add(pipe([new THREE.Vector3(side * 0.444, 0.656, -0.232), new THREE.Vector3(side * 0.592, 0.407, -0.52)], 0.018, chrome));
    }
    const dash = mesh(new THREE.BoxGeometry(1.08, 0.14, 0.22), dark, 0, 0.64, -0.21);
    dash.rotation.x = 0.15;
    for (const x of [-0.1, 0.06, 0.21]) {
      const radius = x === 0.06 ? 0.059 : 0.045;
      const gauge = mesh(new THREE.CircleGeometry(radius, 16), dark, x, 0.716, -0.2);
      gauge.rotation.x = -Math.PI / 2;
      const bezel = mesh(new THREE.RingGeometry(radius * 0.83, radius, 16), chrome, x, 0.718, -0.2);
      bezel.rotation.x = -Math.PI / 2;
    }
    // руль — там, где варежки водителя (как в карте)
    this.wheel.position.set(SPORT_BOAT.seatX, SPORT_BOAT.seatY + DRIVE_WHEEL.y, SPORT_BOAT.seatZ + DRIVE_WHEEL.z);
    this.wheel.rotation.x = DRIVE_WHEEL.tilt;
    this.root.add(pipe([new THREE.Vector3(SPORT_BOAT.seatX, 0.61, -0.25), new THREE.Vector3(SPORT_BOAT.seatX, SPORT_BOAT.seatY + DRIVE_WHEEL.y, SPORT_BOAT.seatZ + DRIVE_WHEEL.z)], 0.042, dark));
    mesh(new THREE.TorusGeometry(DRIVE_WHEEL.r, 0.025, 8, 24), rubber, 0, 0, 0, this.wheel);
    for (let i = 0; i < 3; i++) {
      const spoke = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 6), chrome, 0, 0, 0, this.wheel);
      spoke.rotation.z = (i * Math.PI * 2) / 3;
      spoke.position.set(-Math.sin(spoke.rotation.z) * 0.09, Math.cos(spoke.rotation.z) * 0.09, 0);
    }
    mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12).rotateX(Math.PI / 2), dark, 0, 0, 0, this.wheel);
    this.root.add(this.wheel);
    // подвесной мотор: обтекатель, рёбра, нога и трёхлопастный винт
    this.engine.position.set(0, 0.23, 2.02);
    this.root.add(this.engine);
    mesh(new THREE.SphereGeometry(1, 18, 12).scale(0.31, 0.42, 0.3), dark, 0, 0.55, 0.08, this.engine);
    mesh(new THREE.SphereGeometry(1, 18, 10).scale(0.29, 0.11, 0.29), this.accent, 0, 0.91, 0.08, this.engine);
    for (const side of [-1, 1]) for (let y = 0.46; y < 0.71; y += 0.07) mesh(new THREE.BoxGeometry(0.02, 0.02, 0.28), rubber, side * 0.303, y, 0.08, this.engine);
    mesh(new THREE.CylinderGeometry(0.095, 0.13, 0.69, 10), chrome, 0, -0.1, 0.05, this.engine);
    mesh(new THREE.SphereGeometry(1, 10, 8).scale(0.14, 0.14, 0.28), dark, 0, -0.42, 0.11, this.engine);
    this.propeller.position.set(0, -0.43, 0.37);
    this.engine.add(this.propeller);
    for (let i = 0; i < 3; i++) {
      const blade = mesh(new THREE.SphereGeometry(1, 10, 6).scale(0.08, 0.23, 0.028), chrome, 0, 0.15, 0, this.propeller);
      blade.rotation.z = (i * Math.PI * 2) / 3;
      blade.position.set(-Math.sin(blade.rotation.z) * 0.15, Math.cos(blade.rotation.z) * 0.15, 0);
    }
    this.number = numberTexture(id + 1);
    const numberMat = new THREE.MeshStandardMaterial({ map: this.number, roughness: 0.55, side: THREE.DoubleSide });
    this.mats.add(numberMat);
    for (const side of [-1, 1]) {
      const badge = mesh(new THREE.PlaneGeometry(0.52, 0.25), numberMat, side * 0.96, 0.32, 1.24);
      badge.rotation.y = (side * Math.PI) / 2;
    }
    const bowBadge = mesh(new THREE.PlaneGeometry(0.42, 0.21), numberMat, 0, 0.455, -1.56);
    bowBadge.rotation.x = -Math.PI / 2;
    batchStatic(this.root);
    batchStatic(this.engine);
    batchStatic(this.wheel);
    batchStatic(this.propeller);
    this.rider = new Avatar(riderId, { voice });
    this.rider.driving = true;
    this.rider.addTo(scene);
    this.rider.setOutfit(outfit);
    this.rider.setInfo(name, null, false);
    this.ready = sourceBoat()
      .then((source) => {
        if (this.disposed) return;
        const hull = source.clone(true);
        hull.name = 'kenney-authored-hull';
        hull.rotation.y = Math.PI;
        hull.scale.set(1.075, 0.83, 1.31);
        hull.position.y = -0.34;
        hull.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.geometry = o.geometry.clone();
          const colors = o.geometry.getAttribute('color');
          const mask = o.geometry.getAttribute('_boat_paint');
          if (colors && mask) {
            const pearl = new THREE.Color(0xeae8dc);
            for (let i = 0; i < colors.count; i++) {
              if (mask.getX(i) > 0.5) {
                const k = 0.88 + Math.min(0.12, colors.getY(i) * 0.45);
                colors.setXYZ(i, pearl.r * k, pearl.g * k, pearl.b * k);
              }
            }
          }
          const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.31, metalness: 0.035, clearcoat: 0.75, clearcoatRoughness: 0.23 });
          const solid: number[] = [];
          const glazing: number[] = [];
          const index = o.geometry.index;
          if (index && colors) {
            for (let i = 0; i < index.count; i += 3) {
              const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
              const list = ids.every((k) => colors.getZ(k) > 0.8 && colors.getY(k) > 0.5 && colors.getX(k) < 0.85) ? glazing : solid;
              list.push(...ids);
            }
            o.geometry.setIndex([...solid, ...glazing]);
            o.geometry.clearGroups();
            o.geometry.addGroup(0, solid.length, 0);
            o.geometry.addGroup(solid.length, glazing.length, 1);
            o.material = [m, glass];
          } else o.material = m;
          this.mats.add(m);
          o.castShadow = true;
          o.receiveShadow = true;
        });
        this.root.add(hull);
        this.loaded = true;
      })
      .catch(() => {
        this.loaded = false;
      });
  }

  outfit(outfit: Outfit, name: string, level: number): void {
    this.accent.color.setHex(PALETTE[outfit.c] ?? 0x287a92);
    this.rider.setOutfit(outfit);
    this.rider.setInfo(name, null, false, level);
  }

  /** Желейка прыгает в катер из точки (x, y, z). */
  hop(x: number, y: number, z: number): void {
    this.hopFrom.set(x, y, z);
    this.hopT = 0;
  }

  get hopping(): boolean {
    return this.hopT >= 0;
  }

  /**
   * Кадр. y — высота над водой (трамплин), drift — занос (−1 вправо, 1 влево, 0 — нет), t — время зыби, с.
   * showRider = false — за рулём никого (желейка ещё не прыгнула или уже спрыгнула).
   */
  update(x: number, z: number, y: number, hx: number, hz: number, steer: number, speed: number, drift: number, t: number, dt: number, camera: THREE.Vector3, local: boolean, showRider = true): void {
    const sw = rgSwell(x, z, t, this.swell);
    const yaw = Math.atan2(-hx, -hz);
    const v = Math.min(1, speed / 20);
    const acc = dt > 0 ? THREE.MathUtils.clamp((speed - this.prevSpeed) / dt, -12, 12) : 0;
    this.prevSpeed = speed;
    const blend = 1 - Math.exp(-dt * 6);
    const air = y > 0.05;
    // крен: в повороте — внутрь, в заносе — сильно наружу корма (катер «ложится»); в воздухе зыбь не качает
    const rollTo = (air ? 0 : sw.roll * 0.72) + steer * v * 0.16 + drift * 0.3 * v;
    // дифферент: нос вверх на ходу и на разгоне, вниз при торможении; в прыжке — чуть носом вверх
    const pitchTo = (air ? 0.12 : sw.pitch * 0.75) + v * 0.06 + acc * 0.012;
    this.roll += (rollTo - this.roll) * blend;
    this.pitch += (pitchTo - this.pitch) * blend;
    this.root.position.set(x, WATER_Y + (air ? 0 : sw.y) + 0.03 * v + y, z);
    this.root.rotation.set(this.pitch, yaw, this.roll, 'YXZ');
    this.root.updateMatrixWorld(true);
    this.engine.rotation.y = -steer * 0.3;
    this.engine.rotation.x = -v * 0.09;
    this.spin += dt * (18 + speed * 2.1);
    this.propeller.rotation.z = this.spin;
    this.wheel.rotation.z = steer * DRIVE_TURN;
    this.seat.set(SPORT_BOAT.seatX, SPORT_BOAT.seatY, SPORT_BOAT.seatZ).applyMatrix4(this.root.matrixWorld);
    const r = this.rider;
    if (!showRider) {
      r.update(null, dt, t, { groundBelow: () => -100 }, camera, local);
      return;
    }
    r.steer = steer;
    let flip = 0;
    if (this.hopT >= 0) {
      // прыжок: дуга от точки на площади к сиденью, сальто, руки — не на руле
      this.hopT += dt;
      const k = Math.min(1, this.hopT / HOP_S);
      hopArc(this.hopFrom.x, this.hopFrom.y, this.hopFrom.z, this.seat.x, this.seat.y, this.seat.z, k, _seat);
      flip = -Math.PI * 2 * k * k * (3 - 2 * k);
      r.driving = k >= 1;
      if (k >= 1) this.hopT = -1;
    } else {
      _seat.copy(this.seat);
      r.driving = true;
    }
    Object.assign(this.riderPose, { x: _seat.x, y: _seat.y, z: _seat.z, yaw });
    r.update(this.riderPose, dt, t, { groundBelow: () => -100 }, camera, local);
    if (flip !== 0) r.root.rotation.set(flip, yaw, 0, 'YXZ');
    else r.root.rotation.set(this.pitch, yaw, this.roll, 'YXZ');
  }

  debug(): { assetLoaded: boolean; beam: number; length: number } {
    return { assetLoaded: this.loaded, beam: SPORT_BOAT.beam, length: SPORT_BOAT.length };
  }

  dispose(scene: THREE.Scene): void {
    this.disposed = true;
    scene.remove(this.root);
    this.rider.dispose(scene);
    const geometries = new Set<THREE.BufferGeometry>();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.mats.add(m);
      }
    });
    for (const g of geometries) g.dispose();
    for (const m of this.mats) m.dispose();
    this.number.dispose();
  }
}
