// Гоночная адаптация собственного корпуса «Волжанка» из принятого ProductLab.
// Корпус, настоящий кокпит, мотор и руль — GLB; анимация следует физике регаты.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WATER_Y } from '../../shared/constants.ts';
import { PALETTE, type Outfit } from '../../shared/outfit.ts';
import { E_ALIVE } from '../../shared/protocol.ts';
import { Avatar, DRIVE_SQUASH, DRIVE_TURN, DRIVE_WHEEL, type AvatarPose } from '../render/avatar.ts';

export const SPORT_BOAT = { beam: 1.9, length: 4.7, seatX: 0.3516, seatY: 0.49, seatZ: 0.4912 } as const;
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


const assetUrl = new URL('../assets/ownboats/volzhanka.glb', import.meta.url).href;
let asset: Promise<THREE.Group> | null = null;
function sourceBoat(): Promise<THREE.Group> {
  if (!asset) {
    asset = new GLTFLoader().loadAsync(assetUrl).then(g => g.scene);
    void asset.catch(() => { asset = null; });
  }
  return asset;
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


const _seat = new THREE.Vector3();

export class BoatModel {
  readonly root = new THREE.Group();
  readonly rider: Avatar;
  readonly ready: Promise<void>;
  readonly seat = new THREE.Vector3();
  private engine: THREE.Object3D = new THREE.Group();
  private propeller: THREE.Object3D = new THREE.Group();
  private wheel: THREE.Object3D = new THREE.Group();
  private wheelBase = 0;
  private readonly number: THREE.CanvasTexture;
  private readonly paints: Array<{ color: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; original: Float32Array }> = [];
  private tint = new THREE.Color();
  private readonly riderPose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE };
  private readonly mats = new Set<THREE.Material>();
  private readonly swell = { y: 0, pitch: 0, roll: 0 };
  private disposed = false;
  private loaded = false;
  private roll = 0;
  private pitch = 0;
  private prevSpeed = 0;
  private spin = 0;
  private readonly hopFrom = new THREE.Vector3();
  private hopT = -1;

  constructor(scene: THREE.Scene, id: number, riderId: number, voice: boolean, outfit: Outfit, name: string) {
    this.root.name = 'regatta-boat-' + id;
    scene.add(this.root);
    this.tint.setHex(PALETTE[outfit.c] ?? 0xbd514d);
    this.number = numberTexture(id + 1);
    const badgeMat = new THREE.MeshStandardMaterial({ map: this.number, roughness: .55, side: THREE.DoubleSide });
    this.mats.add(badgeMat);
    for (const side of [-1, 1]) {
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(.58, .3), badgeMat);
      badge.position.set(side * .96, .3, .86); badge.rotation.y = side * Math.PI / 2;
      this.root.add(badge);
    }
    this.rider = new Avatar(riderId, { voice });
    this.rider.driving = true;
    this.rider.addTo(scene);
    this.rider.setOutfit(outfit);
    this.rider.setInfo(name, null, false);
    this.ready = sourceBoat().then(source => {
      if (this.disposed) return;
      const hull = source.clone(true);
      hull.name = 'tiredwood-authored-sport-hull';
      hull.scale.set(.9, 1, .95);
      // Fishing equipment is not part of the racing boat; the complete authored
      // cockpit/body remains, avoiding overlapping procedural seats and windscreens.
      for (const name of ['anchor', 'anchor_rope', 'rods', 'echosounder_screen']) hull.getObjectByName(name)?.removeFromParent();
      hull.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry = o.geometry.clone();
        const sourceMat = o.material as THREE.MeshStandardMaterial;
        const m = sourceMat.clone();
        if (m.name === 'fb_paint') {
          m.roughness = .31; m.metalness = .12;
          const color = o.geometry.getAttribute('color');
          if (color) this.paints.push({ color, original: Float32Array.from({ length: color.count * 3 }, (_, i) => i % 3 === 0 ? color.getX(i / 3) : i % 3 === 1 ? color.getY(Math.floor(i / 3)) : color.getZ(Math.floor(i / 3))) });
        }
        o.material = m; this.mats.add(m); o.castShadow = o.receiveShadow = true;
      });
      this.engine = hull.getObjectByName('motor') ?? this.engine;
      this.propeller = hull.getObjectByName('propeller') ?? this.propeller;
      this.wheel = hull.getObjectByName('steering_wheel') ?? this.wheel;
      // The authored fishing helm is too low for the existing driving jelly.
      // Fit that real wheel to the established mitten pose, with a visible column.
      this.root.add(this.wheel);
      this.wheel.position.set(SPORT_BOAT.seatX, SPORT_BOAT.seatY + DRIVE_WHEEL.y * DRIVE_SQUASH.y, SPORT_BOAT.seatZ + DRIVE_WHEEL.z * DRIVE_SQUASH.xz);
      this.wheel.rotation.set(DRIVE_WHEEL.tilt, 0, 0);
      this.wheel.scale.setScalar(DRIVE_WHEEL.r * DRIVE_SQUASH.xz / .176);
      this.wheelBase = 0;
      const bottom = new THREE.Vector3(SPORT_BOAT.seatX, .65, -.05), axis = this.wheel.position.clone().sub(bottom);
      const columnMat = new THREE.MeshStandardMaterial({ color: 0x343e43, roughness: .52, metalness: .3 });
      this.mats.add(columnMat);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, axis.length(), 8), columnMat);
      column.position.copy(bottom).addScaledVector(axis, .5);
      column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
      this.root.add(column);
      this.root.add(hull); this.paint(); this.loaded = true;
    });
  }

  private paint(): void {
    for (const { color, original } of this.paints) {
      for (let i = 0; i < color.count; i++) {
        const r = original[i * 3], g = original[i * 3 + 1], b = original[i * 3 + 2];
        // Only the original warm hull livery changes; cream decks stay cream.
        if (r > g * 1.3 && r > b * 1.5) color.setXYZ(i, this.tint.r * .9, this.tint.g * .9, this.tint.b * .9);
      }
      color.needsUpdate = true;
    }
  }
  outfit(outfit: Outfit, name: string, level: number): void {
    this.tint.setHex(PALETTE[outfit.c] ?? 0xbd514d); this.paint();
    this.rider.setOutfit(outfit); this.rider.setInfo(name, null, false, level);
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
    const rollTo = (air ? 0 : sw.roll * 0.72) + steer * v * 0.12 + drift * 0.17 * v;
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
    this.wheel.rotation.z = this.wheelBase + steer * DRIVE_TURN;
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


  debug(): { assetLoaded: boolean; beam: number; length: number } { return { assetLoaded: this.loaded, beam: SPORT_BOAT.beam, length: SPORT_BOAT.length }; }
  dispose(scene: THREE.Scene): void {
    this.disposed = true; scene.remove(this.root); this.rider.dispose(scene);
    this.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    this.number.dispose();
  }
}
