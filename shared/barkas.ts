// Баркас «Альбатрос» в море к юго-западу от маяка: общее для сервера и клиента. Где стоит, твёрдые боксы палубы,
// фальшборта и надстроек (рисует их сам клиент — боксы невидимые), места рыбалки на борту, матросы, Саня с прилавком,
// калитка к лодке Семёна (shared/ferry.ts), куда высаживают с лодки и где возрождают упавших за борт.
// Оси: X — восток, Z — юг. Нос — на запад, корма — к острову. Корпус строго по осям: коллизия — только AABB.
import type { MapBox, Vec3 } from './maps/types.ts';

/** Середина и корпус: нос x −74, корма (транец) x −46, борта z 64,5 и 71,5 */
export const BARKAS = { x: -60, z: 68, bow: -74.2, stern: -46, half: 3.5 } as const;
/** Палуба — на высоте пирса (y = 0): посадка на место рыбалки ставит на y = 0 без правок. Бак (нос) выше на ступень. */
export const BARKAS_DECK_Y = 0;
export const BARKAS_BAK_Y = 0.45;
/** Фальшборт: высота над палубой (перепрыгнуть можно — и за борт), толщина */
export const BARKAS_RAIL_H = 0.95;
export const BARKAS_RAIL_T = 0.16;
/** Днище коробки корпуса: ниже уровня, где тонут (DROWN_Y), — под палубу не пролезть */
const HULL_Y = -1.6;

/** Обвод палубы (x, полуширина): к носу сужается. Клиент рисует борт по нему, коллизия — ступеньками внутри. */
export const BARKAS_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [-74.2, 0.15], [-73.5, 1.05], [-73, 1.6], [-72, 2.35], [-71, 2.85], [-70, 3.17], [-69, 3.38], [-68, 3.5], [-46, 3.5],
];

/** Полуширина палубы в точке x (по обводу, линейно между точками) */
export function barkasHalf(x: number): number {
  const P = BARKAS_PROFILE;
  if (x <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (x <= P[i][0]) {
      const k = (x - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
      return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k;
    }
  }
  return P[P.length - 1][1];
}

/** Участки палубы для коллизии (от носа к корме): x0…x1, полуширина (не шире обвода), верх. Бак — до x −68. */
export const BARKAS_DECKS: ReadonlyArray<{ x0: number; x1: number; hb: number; y: number }> = [
  { x0: -73.5, x1: -73, hb: 1.05, y: BARKAS_BAK_Y },
  { x0: -73, x1: -72, hb: 1.6, y: BARKAS_BAK_Y },
  { x0: -72, x1: -71, hb: 2.35, y: BARKAS_BAK_Y },
  { x0: -71, x1: -70, hb: 2.85, y: BARKAS_BAK_Y },
  { x0: -70, x1: -69, hb: 3.17, y: BARKAS_BAK_Y },
  { x0: -69, x1: -68, hb: 3.38, y: BARKAS_BAK_Y },
  { x0: -68, x1: -46, hb: 3.5, y: BARKAS_DECK_Y },
];

/** Рубка (ходовая): глухой короб, крыша на 2,5 м — не запрыгнуть. На крыше сидит баянист. */
export const BARKAS_HOUSE = { x0: -68, x1: -64, z0: 66, z1: 70, h: 2.5 } as const;
/**
 * Рулетка (ставит `fisheco`): середина и размер площадки под тентом за рубкой — в дождь там сухо.
 * w — вдоль корабля (X), d — поперёк (Z).
 */
export const BARKAS_ROULETTE = { x: -62.25, z: 68, w: 3.5, d: 4 } as const;
/** Тент над рулеткой: четыре стойки по углам, полотно на высоте h */
export const BARKAS_AWNING = { x0: -63.9, x1: -60.6, z0: 65.7, z1: 70.3, h: 2.45, post: 0.06 } as const;
/** Трюмный люк — на нём Толик чинит сеть; верх 0,5 м: на него можно шагнуть */
export const BARKAS_HATCH = { x0: -57.6, x1: -55, z0: 66.8, z1: 69.2, h: 0.5 } as const;
/** Барабан с сетью за люком: ось вдоль Z, на стойках */
export const BARKAS_DRUM = { x: -53.3, z: 68, r: 0.6, len: 2.1, y: 0.8 } as const;
/** Брашпиль на баке (якорная лебёдка) */
export const BARKAS_WINDLASS = { x0: -72.1, x1: -71, z0: 67.4, z1: 68.6, h: 0.55 } as const;
/** Калитка в транце (проём в фальшборте) — к лодке «Удалая» */
export const BARKAS_GATE = { z0: 67.2, z1: 68.8 } as const;
/** Колокол вызова лодки — на северном столбике калитки */
export const BARKAS_BELL = { x: -46.32, z: 66.98, y: 1.45 } as const;
/** Ножки жёлтой А-рамы над транцем */
export const BARKAS_AFRAME = { x: -46.48, z0: 64.86, z1: 71.14, h: 4.6 } as const;
/** Рында на передней стенке рубки (бьёт боцман) */
export const BARKAS_RYNDA = { x: -68.2, z: 67.1, y: 2.05 } as const;
/** Штабель рыбных ящиков в северном углу у кормы */
export const BARKAS_CRATES = { x0: -48.5, x1: -47.05, z0: 64.66, z1: 65.6, h: 0.86 } as const;

/**
 * Матросы: боцман Михалыч на баке у рынды (дотягивается до её шкертика), рыбак Толик на люке, баянист Витёк на крыше
 * рубки (сидит на ящике).
 */
export const BARKAS_CREW = {
  mikhalych: { x: -68.8, y: BARKAS_BAK_Y, z: 66.75, yaw: -1.2 },
  tolik: { x: -55.2, y: 0, z: 68.3, yaw: -Math.PI / 2 },
  vityok: { x: -65.6, y: BARKAS_HOUSE.h + 0.12, z: 68.2, yaw: -1.35 },
} as const;

/** Саня — брат Семёна: за прилавком из ящиков со льдом в углу у кормы, лицом к палубе */
export const SANYA = { x: -46.95, y: 0, z: 70.55, yaw: 0.93 } as const;
/** Где встаёт посетитель (лицом к Сане через прилавок) */
export const SANYA_USE = { x: -48.9, y: 0, z: 70.4, yaw: -Math.PI / 2, r: 1.4 } as const;
/** Прилавок Сани и он сам — твёрдые */
export const SANYA_STALL = { x0: -48.3, x1: -47.5, z0: 69.7, z1: 71.34, h: 0.92 } as const;
/** Отправить к Семёну на пирс — 250 жетонов (Саня свистит знакомому катеру) */
export const SANYA_PRICE = 250;

/** Точка у калитки: лодка у борта — E, сесть; нет — E, позвонить в колокол (лодка придёт за тобой) */
export const BARKAS_BOARD = { x: -47.4, z: 68, yaw: -Math.PI / 2, r: 1.4 } as const;
/** Куда высаживают с лодки и возрождают упавших за борт: у кормы, лицом к палубе (на запад). Сетка 2 × 3. */
export const BARKAS_LANDING = { x: -49.9, z: 68, yaw: Math.PI / 2 } as const;
export const BARKAS_LANDING_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-49.4, 67], [-49.4, 68], [-49.4, 69], [-50.4, 67], [-50.4, 68], [-50.4, 69],
];

/**
 * Места рыбалки от обшивки внутрь, м: желейка (радиус до 0,53) и руки с удочкой (до 0,95 м вперёд, ниже планширя)
 * целиком на палубе, не в фальшборте (его толщина 0,16); удочка — над планширем, поплавок — в 6,5–9,5 м, в море.
 */
export const BARKAS_SPOT_IN = 1.15;
/**
 * Места рыбалки на борту: по четыре вдоль каждого борта, шаг 2,5 м (западная пара — 2,2 м: дальше от стола рулетки
 * под тентом). Северные смотрят на остров — их видно с пирса.
 */
export const BARKAS_FISH_SPOTS: ReadonlyArray<{ x: number; z: number; yaw: number; zone: 'barkas' }> = [-59.2, -57, -54.5, -52].flatMap((x) => [
  { x, z: BARKAS.z - BARKAS.half + BARKAS_SPOT_IN, yaw: 0, zone: 'barkas' as const },
  { x, z: BARKAS.z + BARKAS.half - BARKAS_SPOT_IN, yaw: Math.PI, zone: 'barkas' as const },
]);

/** Вода вокруг баркаса: упал здесь — матросы вытаскивают на палубу (с острова сюда не доплыть: невидимые стены). */
export function barkasWater(x: number, z: number): boolean {
  return x > -96 && x < -30 && z > 50 && z < 92;
}

/** Точка высадки k (0…5) */
export function barkasLanding(k: number): readonly [number, number] {
  return BARKAS_LANDING_SPOTS[((k % BARKAS_LANDING_SPOTS.length) + BARKAS_LANDING_SPOTS.length) % BARKAS_LANDING_SPOTS.length];
}

type Box = { min: Vec3; max: Vec3 };
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({ min: [x0, y0, z0], max: [x1, y1, z1] });

/**
 * Твёрдое баркаса: палуба ступеньками, фальшборт (на баке — «толстый», до обвода следующего участка, чтобы ступеньки
 * не оставляли щелей), транец с калиткой, рубка, стойки тента, люк, барабан, брашпиль, прилавок, тела матросов и Сани,
 * столбик колокола, ножки А-рамы. Всё невидимое: рисует client/lobby/barkas.
 */
export function barkasBoxes(): Box[] {
  const out: Box[] = [];
  const { z: cz } = BARKAS;
  const D = BARKAS_DECKS;
  const T = BARKAS_RAIL_T;
  for (let i = 0; i < D.length; i++) {
    const d = D[i];
    out.push(bx(d.x0, HULL_Y, cz - d.hb, d.x1, d.y, cz + d.hb));
    // фальшборт вдоль бортов участка: снаружи — до обвода следующего (более широкого) участка
    const outer = i + 1 < D.length ? D[i + 1].hb : d.hb;
    out.push(bx(d.x0, d.y, cz - outer, d.x1, d.y + BARKAS_RAIL_H, cz - d.hb + T));
    out.push(bx(d.x0, d.y, cz + d.hb - T, d.x1, d.y + BARKAS_RAIL_H, cz + outer));
  }
  // форштевень: поперёк носа
  out.push(bx(D[0].x0 - T, BARKAS_BAK_Y, cz - D[0].hb, D[0].x0, BARKAS_BAK_Y + BARKAS_RAIL_H, cz + D[0].hb));
  // транец с калиткой
  const s = BARKAS.stern;
  out.push(bx(s - T, BARKAS_DECK_Y, cz - BARKAS.half, s, BARKAS_RAIL_H, BARKAS_GATE.z0));
  out.push(bx(s - T, BARKAS_DECK_Y, BARKAS_GATE.z1, s, BARKAS_RAIL_H, cz + BARKAS.half));
  const H = BARKAS_HOUSE;
  out.push(bx(H.x0, BARKAS_DECK_Y, H.z0, H.x1, H.h, H.z1));
  const A = BARKAS_AWNING;
  for (const x of [A.x0, A.x1]) for (const z of [A.z0, A.z1]) out.push(bx(x - A.post, 0, z - A.post, x + A.post, A.h, z + A.post));
  const K = BARKAS_HATCH;
  out.push(bx(K.x0, 0, K.z0, K.x1, K.h, K.z1));
  const R = BARKAS_DRUM;
  out.push(bx(R.x - R.r - 0.02, 0, R.z - R.len / 2, R.x + R.r + 0.02, R.y + R.r, R.z + R.len / 2));
  const W = BARKAS_WINDLASS;
  out.push(bx(W.x0, BARKAS_BAK_Y, W.z0, W.x1, BARKAS_BAK_Y + W.h, W.z1));
  const S = SANYA_STALL;
  out.push(bx(S.x0, 0, S.z0, S.x1, S.h, S.z1));
  const C = BARKAS_CRATES;
  out.push(bx(C.x0, 0, C.z0, C.x1, C.h, C.z1));
  out.push(bx(SANYA.x - 0.36, 0, SANYA.z - 0.36, SANYA.x + 0.36, 1.75, SANYA.z + 0.36));
  const M = BARKAS_CREW.mikhalych;
  out.push(bx(M.x - 0.34, M.y, M.z - 0.34, M.x + 0.34, M.y + 1.7, M.z + 0.34));
  // Толик сидит на краю люка, ноги свешены на палубу: тело и колени
  const L = BARKAS_CREW.tolik;
  out.push(bx(L.x - 0.32, 0, L.z - 0.34, L.x + 0.62, BARKAS_HATCH.h + 1.05, L.z + 0.34));
  out.push(bx(BARKAS_BELL.x - 0.07, 0, BARKAS_BELL.z - 0.07, BARKAS_BELL.x + 0.07, BARKAS_BELL.y + 0.2, BARKAS_BELL.z + 0.07));
  const F = BARKAS_AFRAME;
  for (const z of [F.z0, F.z1]) out.push(bx(F.x - 0.11, 0, z - 0.11, F.x + 0.11, F.h, z + 0.11));
  return out;
}

/**
 * Для карты укрытий от дождя (client/lobby/rain.ts): палуба (на ней брызги и мокрые доски) и то, что над головой, —
 * крыша рубки и тент над рулеткой (под ними сухо). Только клиенту; коллизия — barkasBoxes.
 */
export function barkasCover(): MapBox[] {
  const deck = 0x9a7a55;
  const out: MapBox[] = BARKAS_DECKS.map((d) => ({ min: [d.x0, HULL_Y, BARKAS.z - d.hb] as Vec3, max: [d.x1, d.y, BARKAS.z + d.hb] as Vec3, mat: 'wood' as const, color: deck }));
  const H = BARKAS_HOUSE;
  out.push({ min: [H.x0 - 0.25, H.h, H.z0 - 0.25], max: [H.x1 + 0.25, H.h + 0.12, H.z1 + 0.25], mat: 'wood', color: 0xb8433a });
  const A = BARKAS_AWNING;
  out.push({ min: [A.x0 - 0.1, A.h, A.z0 - 0.1], max: [A.x1 + 0.1, A.h + 0.05, A.z1 + 0.1], mat: 'wood', color: 0xd9cfb4 });
  return out;
}
