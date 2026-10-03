// Сборщик карт из боксов. Карты пейнтбола центрально-симметричны: sym() ставит бокс
// и его пару, повёрнутую на 180°. Набережная строится без зеркала (mirror = false).

import type { Deco, Material, MapBox, Pickup, SpawnPoint, Trampoline, Vec3 } from './types.ts';

// Контейнеры: приглушённые «портовые» цвета, чтобы яркие желейки на их фоне читались
const CONTAINER_COLORS = [0x9a4a3a, 0x3f6f8f, 0x4c7a5a, 0xc07a3a, 0xb89a4a, 0x7a8288, 0xcfc8b8, 0x35507a, 0x8a5a7a, 0x5a8a8a];

const CONTAINER_W = 2.44;
const CONTAINER_H = 2.6;

export class Builder {
  boxes: MapBox[] = [];
  spawns: SpawnPoint[] = [];
  trampolines: Trampoline[] = [];
  pickups: Pickup[] = [];
  deco: Deco[] = [];
  private colorIdx = 0;

  /** Ставить ли пару, повёрнутую на 180° вокруг центра (карты пейнтбола). */
  readonly mirror: boolean;

  constructor(mirror = true) {
    this.mirror = mirror;
  }

  box(min: Vec3, max: Vec3, mat: Material, color: number, extra: Partial<MapBox> = {}): void {
    this.boxes.push({ min, max, mat, color, ...extra });
  }

  /** Бокс и его пара, повёрнутая на 180° вокруг центра. */
  sym(min: Vec3, max: Vec3, mat: Material, color: number, extra: Partial<MapBox> = {}): void {
    this.box(min, max, mat, color, extra);
    if (this.mirror) this.box([-max[0], min[1], -max[2]], [-min[0], max[1], -min[2]], mat, color, extra);
  }

  nextContainerColor(): number {
    const c = CONTAINER_COLORS[this.colorIdx % CONTAINER_COLORS.length];
    this.colorIdx += 3;
    return c;
  }

  /** Морской контейнер: центр по X/Z, вдоль оси, длина 6 или 12 м, ярус 0/1. */
  container(cx: number, cz: number, along: 'x' | 'z', len: number, level: number, symmetric = true, color?: number): void {
    const c = color ?? this.nextContainerColor();
    const hw = CONTAINER_W / 2;
    const hl = len / 2;
    const y0 = level * CONTAINER_H;
    const min: Vec3 = along === 'x' ? [cx - hl, y0, cz - hw] : [cx - hw, y0, cz - hl];
    const max: Vec3 = along === 'x' ? [cx + hl, y0 + CONTAINER_H, cz + hw] : [cx + hw, y0 + CONTAINER_H, cz + hl];
    const variant = this.boxes.length % 7;
    if (symmetric) this.sym(min, max, 'container', c, { variant });
    else this.box(min, max, 'container', c, { variant });
  }

  /** Деревянный ящик (кубик) с опорой на y. */
  crate(cx: number, y: number, cz: number, size: number, symmetric = true): void {
    const h = size / 2;
    const tone = [0xc89a62, 0xb88a55, 0xd4a871][this.boxes.length % 3];
    const variant = this.boxes.length % 5;
    const min: Vec3 = [cx - h, y, cz - h];
    const max: Vec3 = [cx + h, y + size, cz + h];
    if (symmetric) this.sym(min, max, 'wood', tone, { variant });
    else this.box(min, max, 'wood', tone, { variant });
  }

  /** Бетонный блок-отбойник. */
  barrier(cx: number, cz: number, along: 'x' | 'z', len: number, height = 1.1, symmetric = true): void {
    const hl = len / 2;
    const hw = 0.32;
    const min: Vec3 = along === 'x' ? [cx - hl, 0, cz - hw] : [cx - hw, 0, cz - hl];
    const max: Vec3 = along === 'x' ? [cx + hl, height, cz + hw] : [cx + hw, height, cz + hl];
    if (symmetric) this.sym(min, max, 'concrete', 0xb9b3a6);
    else this.box(min, max, 'concrete', 0xb9b3a6);
  }

  /**
   * Лестница: ступени — сплошные блоки до пола (без пустот под ними),
   * dir — куда подниматься (+x, -x, +z, -z).
   */
  stairs(x0: number, z0: number, dir: '+x' | '-x' | '+z' | '-z', width: number, rise: number, steps: number, run: number): void {
    const stepH = rise / steps;
    for (let i = 0; i < steps; i++) {
      const top = stepH * (i + 1);
      const a = run * i;
      const b = run * (i + 1);
      let min: Vec3;
      let max: Vec3;
      switch (dir) {
        case '+z':
          min = [x0 - width / 2, 0, z0 + a];
          max = [x0 + width / 2, top, z0 + b];
          break;
        case '-z':
          min = [x0 - width / 2, 0, z0 - b];
          max = [x0 + width / 2, top, z0 - a];
          break;
        case '+x':
          min = [x0 + a, 0, z0 - width / 2];
          max = [x0 + b, top, z0 + width / 2];
          break;
        default:
          min = [x0 - b, 0, z0 - width / 2];
          max = [x0 - a, top, z0 + width / 2];
      }
      this.sym(min, max, 'metal', 0x5b6670);
    }
  }

  trampoline(x: number, z: number): void {
    const r = 1.15;
    const top = 0.42;
    for (const [px, pz] of this.mirror ? [[x, z], [-x, -z]] : [[x, z]]) {
      this.box([px - r, 0, pz - r], [px + r, top, pz + r], 'tramp', 0x2b2f36, { tramp: true });
      this.trampolines.push({ x: px, z: pz, top, r });
    }
  }

  /** Кнехт у края (0.5 м — можно перешагнуть). */
  bollard(x: number, z: number): void {
    const r = 0.22;
    this.sym([x - r, 0, z - r], [x + r, 0.5, z + r], 'invisible', 0);
    this.deco.push({ kind: 'bollard', x, z });
    if (this.mirror) this.deco.push({ kind: 'bollard', x: -x, z: -z });
  }

  /** Фонарный столб; плафон смотрит к центру пирса. */
  lamp(x: number, z: number): void {
    const r = 0.14;
    this.sym([x - r, 0, z - r], [x + r, 5.2, z + r], 'invisible', 0);
    const yaw = x < 0 ? -Math.PI / 2 : Math.PI / 2;
    this.deco.push({ kind: 'lamp', x, z, yaw });
    if (this.mirror) this.deco.push({ kind: 'lamp', x: -x, z: -z, yaw: yaw + Math.PI });
  }

  /** Бочка (0.95 м): можно запрыгнуть. */
  barrel(x: number, z: number, color: number): void {
    const r = 0.34;
    this.sym([x - r, 0, z - r], [x + r, 0.95, z + r], 'invisible', 0);
    this.deco.push({ kind: 'barrel', x, z, color });
    if (this.mirror) this.deco.push({ kind: 'barrel', x: -x, z: -z, color });
  }

  spawn(x: number, z: number, yaw: number): void {
    this.spawns.push({ x, y: 0, z, yaw, team: 0 });
    if (this.mirror) this.spawns.push({ x: -x, y: 0, z: -z, yaw: yaw + Math.PI, team: 1 });
  }

  pickup(x: number, y: number, z: number, symmetric = true): void {
    this.pickups.push({ x, y, z });
    if (this.mirror && symmetric && (x !== 0 || z !== 0)) this.pickups.push({ x: -x, y, z: -z });
  }
}
