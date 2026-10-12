// Камера набережной. Обычно — за спиной (колесо мыши — ближе/дальше), сидя — облёт вокруг желейки мышью,
// у автомата — от первого лица на барабаны, за столом дурака — из-за спины сверху на стол, в примерочной — спереди,
// как из зеркала. Между режимами — плавный переход.
import * as THREE from 'three';
import { PIVOT_Y, RIG_LOBBY, cameraRig, type RigParams } from '../../shared/aim.ts';
import { clamp, damp } from '../../shared/math.ts';
import { PIRATE_SHOULDER } from '../../shared/pirates.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { narrowFov } from '../render/renderer.ts';

export type CamMode = 'walk' | 'sit' | 'slot' | 'mirror' | 'table' | 'boat';

/** Колесо: от 2 до 6 м за спиной */
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 6;
/** У автомата можно оглядеться, но экран остаётся перед игроком. */
export const SLOT_LOOK_YAW = Math.PI / 6;
export const SLOT_LOOK_PITCH = 0.28;
/** Переход между режимами, с; в катер регаты и из него — пролётом подольше */
const BLEND_S = 0.5;
const BOAT_BLEND_S = 0.6;
/**
 * В примерочной: камера в 1,65 м перед желейкой, перед выступающим прилавком, чуть сверху и широко,
 * чтобы влезла целиком с шапкой; сама желейка — левее центра (панель справа).
 */
const MIRROR_DIST = 1.65;
const MIRROR_EYE = 1.2;
const MIRROR_LOOK = 0.72;
const MIRROR_SHIFT = 0.72;

/** Камера над правым плечом в набеге пиратов: прицел в центре экрана, желейка левее (shared/pirates.ts aimOrigin считает тот же луч) */
const RIG_SHOULDER: RigParams = { ...RIG_LOBBY, side: PIRATE_SHOULDER };
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();

export class LobbyCamera {
  private zoom = RIG_LOBBY.back;
  private zoomTo = RIG_LOBBY.back;
  /** Сколько от опоры до камеры сейчас: к стене подъезжаем сразу, обратно — плавно */
  private dist = -1;
  /** Насколько камера сдвинута на плечо: 0 — по центру, 1 — набег (плавно) */
  private shoulder = 0;
  private mode: CamMode | null = null;
  private blend = 1;
  /** Переход — из катера регаты (тоже пролётом 0,6 с) */
  private leftBoat = false;
  private readonly fromPos = new THREE.Vector3();
  private readonly fromQuat = new THREE.Quaternion();
  private fromFov = 60;
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();

  /** Новый вход: первый кадр — сразу на место, без перехода. */
  reset(): void {
    this.mode = null;
    this.dist = -1;
  }

  /** Колесо мыши (deltaY события). */
  zoomBy(deltaY: number): void {
    this.zoomTo = clamp(this.zoomTo * Math.exp(deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX);
  }

  /** За спиной (walk) или облёт сидящего (sit): опора над ногами, взгляд — куда смотрит мышь. */
  follow(cam: THREE.PerspectiveCamera, dt: number, mode: 'walk' | 'sit', x: number, y: number, z: number, yaw: number, pitch: number, world: CollisionWorld, fov: number, shoulder = 0): void {
    if (mode !== this.mode) this.dist = -1;
    this.zoom = damp(this.zoom, this.zoomTo, 12, dt);
    this.shoulder = damp(this.shoulder, shoulder, 5, dt);
    if (Math.abs(this.shoulder - shoulder) < 0.002) this.shoulder = shoulder;
    const d = cameraRig(x, y, z, yaw, pitch, RIG_SHOULDER, this.shoulder, world, this.pos, this.zoom);
    if (this.dist < 0 || d < this.dist) this.dist = d;
    else this.dist = damp(this.dist, d, 5, dt);
    if (d > 1e-6 && this.dist < d) {
      // то же направление, но ближе к опоре
      const k = this.dist / d;
      const oy = y + PIVOT_Y;
      this.pos.set(x + (this.pos.x - x) * k, oy + (this.pos.y - oy) * k, z + (this.pos.z - z) * k);
    }
    this.quat.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
    this.apply(cam, mode, dt, fov);
  }

  /** Неподвижная камера: из (px, py, pz) на (tx, ty, tz) — у автомата ('slot') и за столом дурака ('table'). */
  fixed(cam: THREE.PerspectiveCamera, dt: number, px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov: number, mode: 'slot' | 'table' = 'slot'): void {
    this.pos.set(px, py, pz);
    this.lookFrom(tx, ty, tz);
    this.apply(cam, mode, dt, fov);
  }

  /** Автомат: глаза желейки, барабаны по центру; шляпу скрывает Avatar.slotView. */
  slot(cam: THREE.PerspectiveCamera, dt: number, x: number, y: number, z: number, machineX: number, frontZ: number, lookYaw = 0, lookPitch = 0): void {
    this.pos.set(x, y + 1.17, z);
    const yaw = Math.atan2(x - machineX, z - frontZ);
    const pitch = Math.atan2(0.11, Math.hypot(x - machineX, z - frontZ));
    this.quat.setFromEuler(_e.set(pitch + clamp(lookPitch, -SLOT_LOOK_PITCH, SLOT_LOOK_PITCH), yaw + clamp(lookYaw, -SLOT_LOOK_YAW, SLOT_LOOK_YAW), 0, 'YXZ'));
    this.apply(cam, 'slot', dt, 70);
  }

  /** Катер регаты: камера погони из (px, py, pz) на (tx, ty, tz) — её считает регата (client/lobby/regatta.ts). */
  chase(cam: THREE.PerspectiveCamera, dt: number, px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov: number): void {
    this.pos.set(px, py, pz);
    this.lookFrom(tx, ty, tz);
    this.apply(cam, 'boat', dt, fov);
  }

  /** Примерочная: перед желейкой (x, y, z), которая смотрит по faceYaw, — как отражение в зеркале. */
  mirror(cam: THREE.PerspectiveCamera, dt: number, x: number, y: number, z: number, faceYaw: number, fov: number, height = 1.58, footerFraction = 124 / 900): void {
    const fx = -Math.sin(faceYaw);
    const fz = -Math.cos(faceYaw);
    const lookY = Math.max(MIRROR_LOOK, height / 2);
    this.pos.set(x + fx * MIRROR_DIST, y + Math.max(MIRROR_EYE, lookY + 0.1), z + fz * MIRROR_DIST);
    // смотрим правее желейки (вправо от камеры — это (fz, −fx)), чтобы она стояла слева от панели
    this.lookFrom(x + fz * MIRROR_SHIFT, y + lookY, z - fx * MIRROR_SHIFT);
    // Наряд целиком, плюс реальное место под стрелки и на низком окне; камера остаётся перед прилавком.
    const footer = clamp(footerFraction, 0, 0.35);
    const bodyFraction = 1 - footer;
    const fitFov = THREE.MathUtils.radToDeg(2 * Math.atan((height / 2 + 0.4) / (MIRROR_DIST * 0.9 * bodyFraction)));
    // Запас только снизу: слегка опускаем взгляд, сохраняя крупный показ наряда.
    _e.setFromQuaternion(this.quat, 'YXZ');
    _e.x -= Math.atan(footer * 0.5 * Math.tan(THREE.MathUtils.degToRad(Math.max(fov, fitFov)) / 2));
    this.quat.setFromEuler(_e);
    this.apply(cam, 'mirror', dt, Math.max(fov, fitFov));
  }

  private lookFrom(tx: number, ty: number, tz: number): void {
    _m.lookAt(this.pos, _look.set(tx, ty, tz), _up);
    this.quat.setFromRotationMatrix(_m);
  }

  private apply(cam: THREE.PerspectiveCamera, mode: CamMode, dt: number, fovIn: number): void {
    const fov = narrowFov(fovIn, cam.aspect);
    if (mode !== this.mode) {
      // первый кадр после входа — сразу, смена режима — плавно от того, что было на экране
      this.blend = this.mode === null ? 1 : 0;
      this.leftBoat = this.mode === 'boat';
      this.mode = mode;
      this.fromPos.copy(cam.position);
      this.fromQuat.copy(cam.quaternion);
      this.fromFov = cam.fov;
    }
    this.blend = Math.min(1, this.blend + dt / (mode === 'boat' || this.leftBoat ? BOAT_BLEND_S : BLEND_S));
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    cam.position.lerpVectors(this.fromPos, this.pos, k);
    cam.quaternion.slerpQuaternions(this.fromQuat, this.quat, k);
    const f = this.fromFov + (fov - this.fromFov) * k;
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }
}
