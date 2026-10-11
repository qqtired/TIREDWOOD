// Форма данных новой набережной (plaza3): docs/plaza3/level/layout.json → tools/plaza3/layout.mjs → shared/plaza3/layout.ts.
// Метры; x — восток, z — юг (север = −Z); yaw = 0 смотрит на −Z, поворот — как rotation.y в three.js.
// Решение целиком и правила для левел-дизайнера — docs/plaza3/tech-foundation.md (§1.3 данные, §7 геометрия).
import type { Material, Vec3 } from '../maps/types.ts';

/** Четверть оборота: rot·90° вокруг старого центра группы (cx, cz) — как rotation.y, yaw растёт на rot·π/2 */
export type Rot = 0 | 1 | 2 | 3;

/** Жёсткий перенос старой сборки режима: поворот (если rot ≠ 0 — вокруг (cx, cz)), затем сдвиг на (dx, dz) */
export interface Xf {
  dx: number;
  dz: number;
  rot: Rot;
  cx?: number;
  cz?: number;
}

/** Группы, которые переезжают целиком (§1.4): у каждой — свой якорь в layout.json */
export type Plaza3Group =
  | 'slots' | 'billiards' | 'tables' | 'jukebox' | 'fishBoards' | 'regatta' | 'boat' | 'rat' | 'plane' | 'hide' | 'aqua' | 'wheel'
  | 'dungeon';

/** Точка E: где встаёт игрок, куда смотрит, радиус подсветки */
export interface P3Use {
  x: number;
  z: number;
  yaw: number;
  r: number;
}

export interface P3Spot {
  x: number;
  z: number;
  yaw: number;
}

export interface P3Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Литералы buildLobby(), которые зависят от площади (§1.5 п. 1): в старой раскладке — те же числа в shared/maps/lobby.ts */
export interface Plaza3Lobby {
  spawn: P3Spot;
  pbGate: P3Use;
  kiosk: P3Use;
  mirror: P3Spot;
  /** Доска почёта (прямоугольник на земле); «Последние входы» — с обратной (северной) стороны */
  honorBoard: P3Rect;
  honor: P3Use;
  kboard: P3Use;
  lamps: Array<[number, number]>;
  bollardsWest: { x: number; zs: number[] };
  bollardsSouth: { z: number; xs: number[] };
  gateSpawn: P3Spot;
  garageSpawn: P3Spot;
  skillSpawn: P3Spot;
  lighthouse: { x: number; z: number };
  zones: { arcade: P3Rect; warehouse: P3Rect; garage: P3Rect; cafe: P3Rect; terrace: P3Rect; kiosk: P3Rect };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Твёрдое новой площади (AABB): павильоны, парапеты, стены; mat не 'invisible' — бокс рисует и клиент (серый блокаут) */
export interface P3Collider {
  id: string;
  min: Vec3;
  max: Vec3;
  mat?: Material;
  color?: number;
}

export interface Plaza3Layout {
  version: number;
  /** Скелет WP0: plaza3 побитно совпадает со старой площадью (test/plaza3-map.test.ts). Левел-дизайн (WP1) ставит false */
  skeleton: boolean;
  /** true — строить старую статику (настил, павильоны plaza2), пока нет блокаута новой суши (WP2 ставит false) */
  legacyStatic: boolean;
  /** Центральная площадь: от неё до любого входа ≤ 50 м (5–6 с бега) */
  center: { x: number; z: number };
  anchors: Record<Plaza3Group, Xf>;
  lobby: Plaza3Lobby;
  colliders: P3Collider[];
  /** Аркадные автоматы (WP12): точки 'arcade' — №113 и дальше, arg = номер в этом списке */
  arcade: P3Use[];
}
