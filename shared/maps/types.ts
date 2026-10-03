// Общие типы карт: всё, что сталкивается, — параллелепипеды (AABB).

export type Vec3 = [number, number, number];

export type Material = 'deck' | 'concrete' | 'container' | 'wood' | 'metal' | 'brick' | 'tramp' | 'invisible';

export interface MapBox {
  min: Vec3;
  max: Vec3;
  mat: Material;
  color: number;
  /** trampoline — верх подбрасывает */
  tramp?: boolean;
  /** Смещение текстуры контейнера/ящика, чтобы соседние выглядели по-разному */
  variant?: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  team: 0 | 1;
}

export interface Trampoline {
  x: number;
  z: number;
  top: number;
  r: number;
}

export interface Pickup {
  x: number;
  y: number;
  z: number;
}

/** Только для красоты: сервер их не видит. */
export type Deco =
  | { kind: 'bollard'; x: number; z: number }
  | { kind: 'lamp'; x: number; z: number; yaw: number }
  | { kind: 'crane'; x: number; z: number; yaw: number; scale: number }
  | { kind: 'piling'; x: number; z: number }
  | { kind: 'rope'; x: number; z: number; yaw: number }
  | { kind: 'barrel'; x: number; z: number; color: number }
  | { kind: 'buoy'; x: number; z: number; color: number }
  | { kind: 'boat'; x: number; z: number; yaw: number; color: number };

export interface GameMap {
  name: string;
  boxes: MapBox[];
  spawns: SpawnPoint[];
  trampolines: Trampoline[];
  pickups: Pickup[];
  /** Пейнтбол: где лежит снайперская AWP (нет — на карте её нет) */
  awp?: Pickup;
  deco: Deco[];
  /** Граница пирса по X/Z (для навигации и камеры) */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}
