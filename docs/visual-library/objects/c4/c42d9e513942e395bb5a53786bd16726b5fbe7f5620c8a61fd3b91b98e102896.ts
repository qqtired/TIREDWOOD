// Камера Небесной каланчи: за спиной, дальше, чем на набережной (видно, куда прыгаешь), колесо — 3,5…10 м.
// Взгляд — ровно туда, куда смотрит мышь (viewDir): так и пробел, и W/S совпадают с экраном. К стене камера
// подъезжает сразу, обратно — плавно; по высоте чуть отстаёт, чтобы прыжки не дёргали картинку.
import * as THREE from 'three';
import { PIVOT_Y, RIG_LOBBY, cameraRig } from '../../shared/aim.ts';
import { clamp, damp, viewDir } from '../../shared/math.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { narrowFov } from '../render/renderer.ts';

export const SKY_ZOOM_MIN = 3.5;
export const SKY_ZOOM_MAX = 10;
export const SKY_ZOOM = 6;

export class SkillCamera {
  private zoom = SKY_ZOOM;
  private zoomTo = SKY_ZOOM;
  private dist = -1;
  private eyeY = NaN;
  private readonly pos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  reset(): void {
    this.dist = -1;
    this.eyeY = NaN;
  }

  zoomBy(deltaY: number): void {
    this.zoomTo = clamp(this.zoomTo * Math.exp(deltaY * 0.0012), SKY_ZOOM_MIN, SKY_ZOOM_MAX);
  }

  follow(cam: THREE.PerspectiveCamera, dt: number, x: number, y: number, z: number, yaw: number, pitch: number, world: CollisionWorld, vfov: number): void {
    this.zoom = damp(this.zoom, this.zoomTo, 12, dt);
    // по высоте — мягко (прыжок не трясёт мир), но не отставать больше чем на 1,5 м
    if (!Number.isFinite(this.eyeY) || Math.abs(this.eyeY - y) > 6) this.eyeY = y;
    else this.eyeY = clamp(damp(this.eyeY, y, 10, dt), y - 1.5, y + 1.5);
    const py = this.eyeY;
    const d = cameraRig(x, py, z, yaw, pitch, RIG_LOBBY, 0, world, this.pos, this.zoom);
    if (this.dist < 0 || d < this.dist) this.dist = d;
    else this.dist = damp(this.dist, d, 5, dt);
    if (d > 1e-6 && this.dist < d) {
      const k = this.dist / d;
      const oy = py + PIVOT_Y;
      this.pos.set(x + (this.pos.x - x) * k, oy + (this.pos.y - oy) * k, z + (this.pos.z - z) * k);
    }
    cam.position.copy(this.pos);
    viewDir(yaw, pitch, this.dir);
    cam.lookAt(this.look.copy(this.dir).add(cam.position));
    const f = narrowFov(vfov, cam.aspect);
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }
}

/** Обзор из настроек — по горизонтали для 16:9; камере нужен вертикальный. */
export function skyVfov(h: number): number {
  return (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(h) / 2) / (16 / 9)) * 180) / Math.PI;
}
