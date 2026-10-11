// Ферма: карта для движения (боксы из планировки docs/farm/level/layout.json → shared/farmlayout.ts) и геометрия
// участков: где грядки в мире, места E у NPC, порядок выдачи участков. Общая для сервера (проверка расстояний) и
// клиента (рисование, подсказки). Оси как на площади: x — восток, z — юг.
import { FARM_LAYOUT } from './farmlayout.ts';
import { pick } from './layout.ts';
import { A, xfP, xfSpot } from './plaza3/xf.ts';
import { P3 } from './plaza3/layout.ts';
import type { GameMap, MapBox } from './maps/types.ts';

export const FARM_BOUNDS = FARM_LAYOUT.bounds;
/** Твёрдые боксы, включаемые событием (Фургон, ствол Древа): по умолчанию выключены */
export type FarmToggle = 'van' | 'boss';

/**
 * Карта фермы для CollisionWorld: земля, стены и все твёрдые боксы планировки. Боксы событий (toggle) — только если
 * включены; сервер и клиент обязаны строить её с одинаковыми toggles.
 */
export function buildFarmMap(on: readonly FarmToggle[] = []): GameMap {
  const b = FARM_BOUNDS;
  const boxes: MapBox[] = [{ min: [b.minX - 1, -0.6, b.minZ - 1], max: [b.maxX + 1, 0, b.maxZ + 1], mat: 'concrete', color: 0x7da455 }];
  for (const box of FARM_LAYOUT.boxes) {
    const toggle = (box as { toggle?: string }).toggle;
    if (toggle && !on.includes(toggle as FarmToggle)) continue;
    const wall = box.id.startsWith('wall');
    boxes.push({ min: [...box.min] as [number, number, number], max: [...box.max] as [number, number, number], mat: wall ? 'invisible' : 'wood', color: 0x8a6a48 });
  }
  return {
    name: 'Ферма', boxes, trampolines: [], pickups: [], deco: [], bounds: { ...b },
    spawns: FARM_LAYOUT.spawns.map((s) => ({ x: s.x, y: 0, z: s.z, yaw: s.yaw, team: 0 as const })),
  };
}

/** Номера боксов событий в карте buildFarmMap(['van', 'boss']) (0 — земля) */
const TOGGLE_BOXES: Record<FarmToggle, number[]> = { van: [], boss: [] };
FARM_LAYOUT.boxes.forEach((box, i) => {
  const toggle = (box as { toggle?: string }).toggle as FarmToggle | undefined;
  if (toggle) TOGGLE_BOXES[toggle].push(i + 1);
});

/**
 * Фургон приехал, Древо проснулось — его боксы твёрдые. Мир построен из buildFarmMap(['van', 'boss']); сервер и клиент
 * переключают одинаково (сервер — по своему времени, клиент — по farmVan / farmBoss).
 */
export function setFarmToggle(world: { setEnabled(i: number, on: boolean): void }, toggle: FarmToggle, on: boolean): void {
  for (const i of TOGGLE_BOXES[toggle]) world.setEnabled(i, on);
}

export interface FarmPlotGeo {
  /** Номер участка с 0 (на табличке — n = номер + 1) */
  i: number;
  x: number;
  z: number;
  yaw: number;
  gate: { x: number; z: number };
  use: { x: number; z: number; yaw: number; r: number };
  sign: { x: number; z: number; yaw: number };
}

export const FARM_PLOTS_GEO: readonly FarmPlotGeo[] = FARM_LAYOUT.plots.map((p, i) => ({
  i, x: p.x, z: p.z, yaw: p.yaw, gate: { ...p.gate }, use: { ...p.use }, sign: { ...p.sign },
}));

/** Точка участка (lx, lz в его осях, +Z — к калитке) в мире */
export function plotToWorld(plot: number, lx: number, lz: number): { x: number; z: number } {
  const p = FARM_PLOTS_GEO[plot];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/** Точка мира в оси участка */
export function worldToPlot(plot: number, x: number, z: number): { lx: number; lz: number } {
  const p = FARM_PLOTS_GEO[plot];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const dx = x - p.x;
  const dz = z - p.z;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

export const FARM_BED_LOCAL = FARM_LAYOUT.plotLocal.beds;
export const FARM_BED_SIZE = FARM_LAYOUT.plotLocal.bedSize;

/** Центр грядки bed (0–7) участка plot в мире */
export function bedWorld(plot: number, bed: number): { x: number; z: number } {
  const b = FARM_BED_LOCAL[bed];
  return plotToWorld(plot, b.x, b.z);
}

/** Ближайший участок к точке: в его прямоугольнике (с запасом m) или null */
export function plotAt(x: number, z: number, m = 0.5): number | null {
  const { w, l } = FARM_LAYOUT.plot;
  for (const p of FARM_PLOTS_GEO) {
    const q = worldToPlot(p.i, x, z);
    if (Math.abs(q.lx) <= w / 2 + m && Math.abs(q.lz) <= l / 2 + m) return p.i;
  }
  return null;
}

/** Расстояние от точки до центра грядки (по горизонтали) */
export function bedDist(plot: number, bed: number, x: number, z: number): number {
  const c = bedWorld(plot, bed);
  return Math.hypot(c.x - x, c.z - z);
}

export type FarmObjectId = (typeof FARM_LAYOUT.objects)[number]['id'];

export interface FarmUse {
  id: FarmObjectId;
  x: number;
  z: number;
  yaw: number;
  r: number;
}

/** Места E у общих предметов (колодец — 4 корыта, NPC, доски, телега «В город», Фургон, пьедестал Древа) */
export const FARM_USES: readonly FarmUse[] = FARM_LAYOUT.objects.flatMap((o) => {
  const use = (o as { use?: { x: number; z: number; yaw?: number; r: number } }).use;
  return use ? [{ id: o.id, x: use.x, z: use.z, yaw: use.yaw ?? 0, r: use.r }] : [];
});

export function farmUse(id: FarmObjectId): FarmUse | undefined {
  return FARM_USES.find((u) => u.id === id);
}

/** Стоит ли игрок у места E (с запасом на сетевую погрешность) */
export function nearUse(id: FarmObjectId, x: number, z: number, slack = 1): boolean {
  const u = farmUse(id);
  return !!u && Math.hypot(u.x - x, u.z - z) <= u.r + slack;
}

/** У любого из 4 корыт колодца */
export function nearTrough(x: number, z: number, slack = 1): boolean {
  return (['troughN', 'troughE', 'troughS', 'troughW'] as const).some((id) => nearUse(id, x, z, slack));
}

/** Порядок выдачи участков новичкам: ближние к точке появления — первыми (level.md §7) */
export const FARM_PLOT_ORDER: readonly number[] = (() => {
  const s = FARM_LAYOUT.spawns;
  const cx = s.reduce((a, p) => a + p.x, 0) / s.length;
  const cz = s.reduce((a, p) => a + p.z, 0) / s.length;
  return FARM_PLOTS_GEO.map((p) => ({ i: p.i, d: Math.hypot(p.gate.x - cx, p.gate.z - cz) })).sort((a, b) => a.d - b.d).map((p) => p.i);
})();

/** Калитка фермы на площади: места и боксы (числа — плоские, не литералы планировки: в plaza3 они другие) */
export interface FarmPlazaGate {
  /** Место E у калитки */
  use: { x: number; z: number; yaw: number; r: number };
  /** Куда встать, вернувшись с фермы */
  spawnBack: { x: number; z: number; yaw: number };
  /** Телега с сеном за парапетом (y — высота земли под ней) */
  cart: { x: number; z: number; y: number };
  signpost: { x: number; z: number };
  tout: { x: number; z: number };
  /** Бокс створок (в карту площади не кладётся: створки открыты для прохода) */
  box: { min: readonly [number, number, number]; max: readonly [number, number, number] };
}

const GATE_OLD: FarmPlazaGate = FARM_LAYOUT.plazaGate.current;

/**
 * Вход на ферму с площади: место E у калитки и куда встать, вернувшись (level.md §9). plaza3: вся группа едет якорем
 * farmGate (+31,5; −11,3) — на ось бульвара за аркой «Огороды» (калитка (61,3; −23,3)), земля там на 0, не на −0,6.
 */
export const FARM_PLAZA_GATE: FarmPlazaGate = pick<FarmPlazaGate>(GATE_OLD, () => ({
  use: xfSpot(A.farmGate, GATE_OLD.use),
  spawnBack: xfSpot(A.farmGate, GATE_OLD.spawnBack),
  cart: { ...xfP(A.farmGate, GATE_OLD.cart), y: 0 },
  signpost: xfP(A.farmGate, GATE_OLD.signpost),
  tout: xfP(A.farmGate, GATE_OLD.tout),
  box: {
    min: [GATE_OLD.box.min[0] + (A.farmGate?.dx ?? 0), GATE_OLD.box.min[1], GATE_OLD.box.min[2] + (A.farmGate?.dz ?? 0)],
    max: [GATE_OLD.box.max[0] + (A.farmGate?.dx ?? 0), GATE_OLD.box.max[1], GATE_OLD.box.max[2] + (A.farmGate?.dz ?? 0)],
  },
}));

/** Ось калитки (дуга, створки): место и взгляд на ферму; на площади plaza3 — со сдвигом группы */
export const FARM_PLAZA_GATE_ANCHOR: { x: number; z: number; yaw: number } = xfSpot(A.farmGate, FARM_LAYOUT.plazaGate.anchor);

/** Прямоугольник на земле (x0 < x1, z0 < z1) */
export interface FarmRoadZone { x0: number; z0: number; x1: number; z1: number }
/**
 * Зона «прошёл калитку — на ферму» (plaza3: layout.json farmRoad.zone, сразу за створками). В старой раскладке её нет:
 * на ферму ведёт только E у калитки.
 */
export const FARM_ROAD_ZONE: FarmRoadZone | null = pick<FarmRoadZone | null>(null, () => ({ ...P3.farmRoad.zone }));

/** Игрок на земле стоит в зоне «на ферму» (высота — как у обычного круга входа: по земле или в прыжке над ней) */
export function inFarmRoadZone(x: number, y: number, z: number): boolean {
  const q = FARM_ROAD_ZONE;
  return !!q && x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && y >= -0.5 && y <= 1.5;
}
