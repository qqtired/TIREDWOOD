// Карта «Старая крепость» (режим «Крепость», выпуск 6): каменная крепость на мысу у моря. X — восток, Z — юг,
// «север» = −Z: оттуда по трём дорогам идут зомби. Всё твёрдое — боксы (как у «Причала»); материалы — общие:
// 'deck' — земля (её рисует сам мир крепости), 'brick' — каменная кладка, 'concrete' — светлый камень (бруствер,
// ступени, постамент), 'wood' — ворота и ящики. Ворота — отдельный бокс: пали — его убирают (CollisionWorld.setEnabled).
import { Builder } from './maps/builder.ts';
import type { GameMap, SpawnPoint } from './maps/types.ts';

/** Высота стен (верх хода по стене), бруствер снаружи: высота и толщина, зубцы на нём */
export const WALL_H = 3.4;
export const PARAPET_H = 0.8;
export const PARAPET_T = 0.4;
export const MERLON_H = 0.4;

/** Наружные грани стен: квадрат крепости */
export const FORT = { x0: -18, x1: 18, z0: -16, z1: 14 };
/** Двор — внутри стен (вместе с проездом под воротами) */
export const INSIDE = { x0: -15, x1: 15, z0: -15.5, z1: 11 };
/** Ворота: проём (x), створки — от наружной грани стены вглубь, высота проёма */
export const GATE = { x0: -2.5, x1: 2.5, face: -16, z1: -15.5, h: 3.0 };
/** «Горло» перед воротами между воротными башнями — до сюда (север) */
export const THROAT_Z = -18.5;
/** Терраса цитадели (на ней появляются игроки) */
export const TERRACE = { x0: -10, x1: 10, z0: 5, z1: 11, h: 2.2 };
/** Постамент кристалла; кристалл висит над ним */
export const PEDESTAL = { x0: -1.3, x1: 1.3, z0: 1.3, z1: 3.9, h: 1.0 };
export const CRYSTAL = { x: 0, y: 2.55, z: 2.6 };

export type FortStationKind = 'bell' | 'gate' | 'crystal' | 'turret' | 'jam' | 'shop';

/** Стойка лавки: E рядом с ней. arg — номер краскомёта или жёлоба */
export interface FortStation {
  id: number;
  kind: FortStationKind;
  x: number;
  y: number;
  z: number;
  r: number;
  arg: number;
}

/** Где стоят краскомёты: верх воротных башен у края «горла» — оттуда видно ворота и дорогу */
export const TURRET_SPOTS: ReadonlyArray<{ x: number; y: number; z: number }> = [
  { x: -3.4, y: WALL_H, z: -17.4 },
  { x: 3.4, y: WALL_H, z: -17.4 },
];
/** Ствол краскомёта над верхом башни */
export const TURRET_MUZZLE = 1.4;

/** Жёлоба на северной стене и куда из них ложится лужа варенья (на дорогу перед стеной) */
export const CHUTES: ReadonlyArray<{ x: number; z: number; px: number; pz: number }> = [
  { x: -10.5, z: -14.6, px: -10.5, pz: -20.6 },
  { x: 0, z: -14.6, px: 0, pz: -20.4 },
  { x: 10.5, z: -14.6, px: 10.5, pz: -20.6 },
];

/** Дорога: от конца (там появляются зомби) к воротам; точки — для рисования, зомби идут по полю расстояний */
export interface FortRoad {
  pts: ReadonlyArray<readonly [number, number]>;
}

export const ROADS: readonly FortRoad[] = [
  { pts: [[-62, -40], [-44, -35], [-28, -29], [-12, -22.5], [0, -19.6]] },
  { pts: [[0, -82], [-1.5, -60], [1, -40], [0, -19.6]] },
  { pts: [[62, -44], [44, -38], [28, -30], [12, -22.5], [0, -19.6]] },
];

/** Точка, где липучка лезет: на наружной грани стены, нормаль наружу */
export interface ClimbPoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

export const CLIMBS: readonly ClimbPoint[] = [
  { x: -12.5, z: FORT.z0, nx: 0, nz: -1 },
  { x: 12.5, z: FORT.z0, nx: 0, nz: -1 },
  { x: FORT.x0, z: -7, nx: -1, nz: 0 },
  { x: FORT.x0, z: 4, nx: -1, nz: 0 },
  { x: FORT.x1, z: -7, nx: 1, nz: 0 },
  { x: FORT.x1, z: 4, nx: 1, nz: 0 },
  // морская (южная) стена — для абордажников: спрыгивают во двор сбоку от террасы
  { x: -12.5, z: FORT.z1, nx: 0, nz: 1 },
  { x: 12.5, z: FORT.z1, nx: 0, nz: 1 },
];
/** Точки лазанья абордажников на морской стене: запад и восток */
export const CLIMB_SEA_W = 6;
export const CLIMB_SEA_E = 7;

/** Толщина стены (ход по стене): липучка перелезает бруствер, встаёт на ход и спрыгивает во двор */
export const WALL_T = 3;

export interface FortMap extends GameMap {
  /** Номер бокса створок ворот в boxes */
  gateBox: number;
  stations: FortStation[];
}

const STONE = 0xcbbfa6;
const STONE_DARK = 0xb3a68c;
const TRIM = 0xdfd5bf;
const WOOD = 0x8a5a34;

export function buildFort(): FortMap {
  const b = new Builder(false);
  const H = WALL_H;
  const P = H + PARAPET_H;

  // --- земля и границы: игроки не уходят за край карты и в море
  b.box([-80, -0.6, -96], [80, 0, 24], 'deck', 0x7da552);
  b.box([-67, -6, -87], [67, 30, -86], 'invisible', 0);
  b.box([-67, -6, 23.5], [67, 30, 24.5], 'invisible', 0);
  b.box([-67, -6, -86], [-66, 30, 23.5], 'invisible', 0);
  b.box([66, -6, -86], [67, 30, 23.5], 'invisible', 0);

  // --- стены и башни (без наложений: у совпадающих верхов не мерцает)
  b.box([-21, 0, -19], [-15, H, -13], 'brick', STONE);
  b.box([15, 0, -19], [21, H, -13], 'brick', STONE);
  b.box([-15, 0, -16], [GATE.x0, H, -13], 'brick', STONE);
  b.box([GATE.x1, 0, -16], [15, H, -13], 'brick', STONE);
  b.box([GATE.x0, GATE.h, -16], [GATE.x1, H, -13], 'brick', STONE_DARK);
  b.box([-6, 0, THROAT_Z], [GATE.x0, H, -16], 'brick', STONE);
  b.box([GATE.x1, 0, THROAT_Z], [6, H, -16], 'brick', STONE);
  b.box([-18, 0, -13], [-15, H, 11], 'brick', STONE);
  b.box([15, 0, -13], [18, H, 11], 'brick', STONE);
  b.box([-18, 0, 11], [18, H, 14], 'brick', STONE);

  // --- ворота: отдельный бокс (пали — убираем)
  const gateBox = b.boxes.length;
  b.box([GATE.x0, 0, GATE.face], [GATE.x1, GATE.h, GATE.z1], 'wood', WOOD);

  // --- бруствер снаружи; над воротами и вдоль «горла» его нет — оттуда бьют вниз по тем, кто ломится в ворота
  const parapet = (x0: number, z0: number, x1: number, z1: number, along: 'x' | 'z'): void => {
    b.box([x0, H, z0], [x1, P, z1], 'concrete', TRIM);
    // зубцы через метр
    const len = along === 'x' ? x1 - x0 : z1 - z0;
    const n = Math.floor(len / 2);
    const pad = (len - n * 2 + 1) / 2;
    for (let i = 0; i < n; i++) {
      const a = pad + i * 2;
      if (along === 'x') b.box([x0 + a, P, z0], [Math.min(x1, x0 + a + 1), P + MERLON_H, z1], 'concrete', TRIM);
      else b.box([x0, P, z0 + a], [x1, P + MERLON_H, Math.min(z1, z0 + a + 1)], 'concrete', TRIM);
    }
  };
  const T = PARAPET_T;
  // бастионы
  parapet(-21, -19, -15, -19 + T, 'x');
  parapet(-21, -19 + T, -21 + T, -13, 'z');
  parapet(-15 - T, -19 + T, -15, -16, 'z');
  parapet(-21 + T, -13 - T, -18, -13, 'x');
  parapet(15, -19, 21, -19 + T, 'x');
  parapet(21 - T, -19 + T, 21, -13, 'z');
  parapet(15, -19 + T, 15 + T, -16, 'z');
  parapet(18, -13 - T, 21 - T, -13, 'x');
  // северная стена между бастионами и воротными башнями
  parapet(-15, -16, -6, -16 + T, 'x');
  parapet(6, -16, 15, -16 + T, 'x');
  // воротные башни: спереди и снаружи
  parapet(-6, THROAT_Z, GATE.x0, THROAT_Z + T, 'x');
  parapet(-6, THROAT_Z + T, -6 + T, -16, 'z');
  parapet(GATE.x1, THROAT_Z, 6, THROAT_Z + T, 'x');
  parapet(6 - T, THROAT_Z + T, 6, -16, 'z');
  // запад, восток, юг (к морю)
  // Two 2.4 m parapet openings meet the exterior rescue stair landings.
  for (const [x0, x1] of [[-18, -18 + T], [18 - T, 18]]) {
    parapet(x0, -13, x1, -2.2, 'z');
    parapet(x0, .2, x1, 11, 'z');
  }
  // Exterior stairs: 8 low stone steps (0.425 m), accessible from both open flanks.
  // Shared map boxes are the rendered masonry and the authoritative collision.
  for (const side of [-1, 1]) {
    const cx = side * 21.4;
    for (let i = 0; i < 8; i++) {
      const z1 = 7 - i;
      b.box([cx - 1.2, 0, z1 - 1], [cx + 1.2, H * (i + 1) / 8, z1], 'concrete', STONE_DARK);
    }
    b.box([Math.min(side * 17.6, cx - 1.2), 0, -2.2], [Math.max(side * 17.6, cx + 1.2), H, 0], 'concrete', TRIM);
    // Solid outside handrail at landing; open toward the wall and stair run.
    const outer = side * 22.6;
    b.box([outer - .1, H, -2.2], [outer + .1, H + .65, 0], 'concrete', TRIM);
  }
  parapet(-18, 14 - T, 18, 14, 'x');

  // --- лестницы со двора на северную стену: 7 ступеней, верхняя — вровень с ходом по стене
  for (const cx of [-9, 9]) {
    const run = 0.62;
    for (let i = 0; i < 7; i++) {
      const top = (H * (i + 1)) / 7;
      const za = -13 + (6 - i) * run;
      b.box([cx - 1.1, 0, za], [cx + 1.1, top, za + run], 'concrete', STONE_DARK);
    }
  }

  // --- цитадель: терраса у южной стены, две лестницы спереди, низкий бортик (у лестниц — проходы)
  const R = TERRACE;
  b.box([R.x0, 0, R.z0], [R.x1, R.h, R.z1], 'brick', STONE);
  for (const cx of [-7.5, 7.5]) {
    const run = 0.88;
    for (let i = 0; i < 5; i++) {
      const top = (R.h * (i + 1)) / 5;
      const za = R.z0 - 5 * run + i * run;
      b.box([cx - 1, 0, za], [cx + 1, top, za + run], 'concrete', STONE_DARK);
    }
  }
  const rail = R.h + 0.6;
  b.box([R.x0, R.h, R.z0], [-8.5, rail, R.z0 + 0.3], 'concrete', TRIM);
  b.box([-6.5, R.h, R.z0], [6.5, rail, R.z0 + 0.3], 'concrete', TRIM);
  b.box([8.5, R.h, R.z0], [R.x1, rail, R.z0 + 0.3], 'concrete', TRIM);
  b.box([R.x0, R.h, R.z0 + 0.3], [R.x0 + 0.3, rail, R.z1], 'concrete', TRIM);
  b.box([R.x1 - 0.3, R.h, R.z0 + 0.3], [R.x1, rail, R.z1], 'concrete', TRIM);

  // --- постамент кристалла
  const D = PEDESTAL;
  b.box([D.x0, 0, D.z0], [D.x1, D.h, D.z1], 'concrete', TRIM);

  // --- двор: колодец, ящики, телега, стог (укрытия; путь от ворот к кристаллу свободен)
  b.box([-9.4, 0, -2.4], [-7.6, 0.9, -0.6], 'concrete', STONE_DARK);
  b.crate(8.8, 0, -4, 1.2, false);
  b.crate(10.1, 0, -3.9, 1.0, false);
  b.crate(9.2, 1.2, -4, 1.0, false);
  b.box([-13.2, 0, 2.6], [-11.2, 1.1, 6.2], 'wood', 0x9a6b42);
  b.box([11, 0, 1.5], [13.2, 1.5, 4.5], 'wood', 0xd9b45a);

  // --- стойки лавки
  const stations: FortStation[] = [];
  const st = (kind: FortStationKind, x: number, y: number, z: number, r: number, arg: number): void => {
    stations.push({ id: stations.length, kind, x, y, z, r, arg });
  };
  // колокол — в углу террасы (не за спиной у тех, кто появляется), кристалл — у края террасы над ним
  st('bell', -8.2, R.h, 9.4, 1.6, 0);
  st('gate', 0, 0, -11.6, 2.4, 0);
  st('crystal', 0, R.h, 5.8, 1.4, 0);
  TURRET_SPOTS.forEach((t, i) => st('turret', t.x, t.y, t.z, 1.5, i));
  CHUTES.forEach((c, i) => st('jam', c.x, H, c.z, 1.4, i));
  st('shop', 8, R.h, 9.3, 2.4, 0);

  // --- игроки появляются на террасе лицом к воротам
  const spawns: SpawnPoint[] = [[-6, 7.2], [-3.6, 7.9], [-1.2, 7.2], [1.2, 7.9], [3.6, 7.2], [6, 7.9]].map(([x, z]) => ({ x, y: R.h, z, yaw: 0, team: 0 }));

  // --- декор у моря (сервер его не видит)
  b.deco.push({ kind: 'buoy', x: -30, z: 40, color: 0xe0492f });
  b.deco.push({ kind: 'buoy', x: 26, z: 46, color: 0xf2c230 });
  b.deco.push({ kind: 'boat', x: 44, z: 60, yaw: 0.8, color: 0xe8e2d4 });

  return {
    name: 'Старая крепость',
    boxes: b.boxes,
    spawns,
    trampolines: [],
    pickups: [],
    deco: b.deco,
    bounds: { minX: -66, maxX: 66, minZ: -86, maxZ: 23.5 },
    gateBox,
    stations,
  };
}

/** Внутри стен (во дворе, на террасе, в проезде под воротами) */
export function insideFort(x: number, z: number): boolean {
  return x > INSIDE.x0 && x < INSIDE.x1 && z > INSIDE.z0 && z < INSIDE.z1;
}

/** Внизу за стенами (на лугу, в «горле» перед воротами); на стенах и башнях — не «за стенами» */
export function outsideFort(x: number, y: number, z: number): boolean {
  return y < 2 && !insideFort(x, z);
}
