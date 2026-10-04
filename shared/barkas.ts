// Баркас «Альбатрос» на якоре далеко в море к юго-западу от маяка — на уровне дальнего края «Портовой регаты»
// (её дальняя прямая — z 119, shared/regattacourse.ts): общее для сервера и клиента. Где стоит, твёрдые боксы палубы,
// фальшборта и надстроек (рисует их сам клиент — боксы невидимые), места рыбалки на борту, матросы, Саня с прилавком,
// калитка к лодке Семёна (shared/ferry.ts), куда высаживают с лодки и где возрождают упавших за борт.
// Оси: X — восток, Z — юг. Нос — на запад, корма — к острову. Корпус строго по осям: коллизия — только AABB.
// Всё на борту задано от середины (BX, BZ): переставить баркас — поменять две цифры. Дальше z ≈ 124 его не ставить:
// позиции в снимке — int16 / 256, то есть до ±128 м (shared/protocol.ts), а с палубы ещё прыгают за борт.
import type { MapBox, Vec3 } from './maps/types.ts';

/** Середина корпуса (точка отсчёта всего на борту) */
const BX = -60;
const BZ = 118;
/**
 * Середина и корпус 33,2 м (удлинён на 5 м: между тентом рулетки и местами рыбалки): нос x −76,7, корма (транец)
 * x −43,5, борта z 114,5 и 121,5
 */
export const BARKAS = { x: BX, z: BZ, bow: BX - 16.7, stern: BX + 16.5, half: 3.5 } as const;
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
  [BX - 16.7, 0.15], [BX - 16, 1.05], [BX - 15.5, 1.6], [BX - 14.5, 2.35], [BX - 13.5, 2.85], [BX - 12.5, 3.17], [BX - 11.5, 3.38],
  [BX - 10.5, 3.5], [BX + 16.5, 3.5],
];
/** Где кончается бак (нос выше на ступень) и начинается главная палуба */
export const BARKAS_BAK_X = BX - 10.5;

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

/** Участки палубы для коллизии (от носа к корме): x0…x1, полуширина (не шире обвода), верх. Бак — до BARKAS_BAK_X. */
export const BARKAS_DECKS: ReadonlyArray<{ x0: number; x1: number; hb: number; y: number }> = [
  { x0: BX - 16, x1: BX - 15.5, hb: 1.05, y: BARKAS_BAK_Y },
  { x0: BX - 15.5, x1: BX - 14.5, hb: 1.6, y: BARKAS_BAK_Y },
  { x0: BX - 14.5, x1: BX - 13.5, hb: 2.35, y: BARKAS_BAK_Y },
  { x0: BX - 13.5, x1: BX - 12.5, hb: 2.85, y: BARKAS_BAK_Y },
  { x0: BX - 12.5, x1: BX - 11.5, hb: 3.17, y: BARKAS_BAK_Y },
  { x0: BX - 11.5, x1: BX - 10.5, hb: 3.38, y: BARKAS_BAK_Y },
  { x0: BX - 10.5, x1: BX + 16.5, hb: 3.5, y: BARKAS_DECK_Y },
];

/**
 * Рубка (ходовая): глухой короб, крыша на 2,5 м — не запрыгнуть. Вдоль её бортов — узкие проходы (1,34 м) на бак, к
 * брашпилю и музыкальному автомату (shared/jukebox.ts): их ничем не загораживаем.
 */
export const BARKAS_HOUSE = { x0: BX - 10.5, x1: BX - 6.5, z0: BZ - 2, z1: BZ + 2, h: 2.5 } as const;
/**
 * Рулетка (ставит `fisheco`): середина и размер площадки под тентом за рубкой — в дождь там сухо.
 * w — вдоль корабля (X), d — поперёк (Z).
 */
export const BARKAS_ROULETTE = { x: BX - 4.75, z: BZ, w: 3.5, d: 4 } as const;
/** Тент над рулеткой: четыре стойки по углам, полотно на высоте h */
export const BARKAS_AWNING = { x0: BX - 6.4, x1: BX - 3.1, z0: BZ - 2.3, z1: BZ + 2.3, h: 2.45, post: 0.06 } as const;
/** Трюмный люк — на нём Толик чинит сеть; верх 0,5 м: на него можно шагнуть */
export const BARKAS_HATCH = { x0: BX + 4.9, x1: BX + 7.5, z0: BZ - 1.2, z1: BZ + 1.2, h: 0.5 } as const;
/** Барабан с сетью за люком: ось вдоль Z, на стойках */
export const BARKAS_DRUM = { x: BX + 9.2, z: BZ, r: 0.6, len: 2.1, y: 0.8 } as const;
/** Брашпиль на баке (якорная лебёдка) */
export const BARKAS_WINDLASS = { x0: BX - 14.6, x1: BX - 13.5, z0: BZ - 0.6, z1: BZ + 0.6, h: 0.55 } as const;
/** Калитка в транце (проём в фальшборте) — к лодке «Удалая» */
export const BARKAS_GATE = { z0: BZ - 0.8, z1: BZ + 0.8 } as const;
/** Колокол вызова лодки — на северном столбике калитки */
export const BARKAS_BELL = { x: BX + 16.18, z: BZ - 1.02, y: 1.45 } as const;
/** Ножки жёлтой А-рамы над транцем */
export const BARKAS_AFRAME = { x: BX + 16.02, z0: BZ - 3.14, z1: BZ + 3.14, h: 4.6 } as const;
/** Рында на передней стенке рубки (бьёт боцман) */
export const BARKAS_RYNDA = { x: BX - 10.7, z: BZ - 0.9, y: 2.05 } as const;
/** Штабель рыбных ящиков в северном углу у кормы */
export const BARKAS_CRATES = { x0: BX + 14, x1: BX + 15.45, z0: BZ - 3.34, z1: BZ - 2.4, h: 0.86 } as const;

/**
 * Матросы: боцман Михалыч на баке у рынды (дотягивается до её шкертика), рыбак Толик на люке, матрос Витёк — на палубе
 * в северном углу у кормы, между последним местом рыбалки и ящиками с рыбой (тупичок: не проход, до мест рыбалки и
 * высадки — больше 1,5 м). Стоит, курит, драит палубу шваброй, смотрит в море; yaw — куда смотрит, когда просто стоит.
 * Матрос Колян рыбачит у северного борта за тентом рулетки — на своём месте в ряду мест рыбалки (не занимает
 * место игрока): удочка над планширем, иногда тащит рыбу (client/lobby/barkas/angler.ts).
 */
export const BARKAS_CREW = {
  mikhalych: { x: BX - 11.3, y: BARKAS_BAK_Y, z: BZ - 1.25, yaw: -1.2 },
  tolik: { x: BX + 7.3, y: 0, z: BZ + 0.3, yaw: -Math.PI / 2 },
  vityok: { x: BX + 12.35, y: 0, z: BZ - 2.8, yaw: 2.64 },
  kolyan: { x: BX - 1.7, y: 0, z: BZ - 2.55, yaw: 0 },
} as const;
/** Полуширина тела матроса Витька (твёрдый столбик; поворачивается он на месте) */
export const VITYOK_HALF = 0.36;
/** Полуширина тела Коляна (стоит у борта с удочкой) */
export const KOLYAN_HALF = 0.34;

/** Саня — брат Семёна: за прилавком из ящиков со льдом в углу у кормы, лицом к палубе */
export const SANYA = { x: BX + 15.55, y: 0, z: BZ + 2.55, yaw: 0.93 } as const;
/** Где встаёт посетитель (лицом к Сане через прилавок) */
export const SANYA_USE = { x: BX + 13.6, y: 0, z: BZ + 2.4, yaw: -Math.PI / 2, r: 1.4 } as const;
/** Прилавок Сани и он сам — твёрдые */
export const SANYA_STALL = { x0: BX + 14.2, x1: BX + 15, z0: BZ + 1.7, z1: BZ + 3.34, h: 0.92 } as const;
/** Отправить к Семёну на пирс — 250 жетонов (Саня свистит знакомому катеру) */
export const SANYA_PRICE = 250;

/** Точка у калитки: лодка у борта — E, сесть; нет — E, позвонить в колокол (лодка придёт за тобой) */
export const BARKAS_BOARD = { x: BX + 15.1, z: BZ, yaw: -Math.PI / 2, r: 1.4 } as const;
/** Куда высаживают с лодки и возрождают упавших за борт: у кормы, лицом к палубе (на запад). Сетка 2 × 3. */
export const BARKAS_LANDING = { x: BX + 12.6, z: BZ, yaw: Math.PI / 2 } as const;
export const BARKAS_LANDING_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [BX + 13.1, BZ - 1], [BX + 13.1, BZ], [BX + 13.1, BZ + 1], [BX + 12.1, BZ - 1], [BX + 12.1, BZ], [BX + 12.1, BZ + 1],
];

/**
 * Места рыбалки от обшивки внутрь, м: желейка (радиус до 0,53) и руки с удочкой (до 0,95 м вперёд, ниже планширя)
 * целиком на палубе, не в фальшборте (его толщина 0,16); удочка — над планширем, поплавок — в 6,5–9,5 м, в море.
 */
export const BARKAS_SPOT_IN = 1.15;
/**
 * Места рыбалки на борту: по пять вдоль каждого борта, шаг 2,5 м (у люка — 2,2). Первые восемь — прежние (пары с
 * x +3,3 … +10,5 от середины, номера мест не меняются), последние два — новая пара у тента рулетки (x +0,8). Северные
 * смотрят на остров. Ещё западнее у северного борта (x −1,7) рыбачит матрос Колян — его место не для игроков.
 */
const spotPair = (x: number) => [
  { x, z: BZ - BARKAS.half + BARKAS_SPOT_IN, yaw: 0, zone: 'barkas' as const },
  { x, z: BZ + BARKAS.half - BARKAS_SPOT_IN, yaw: Math.PI, zone: 'barkas' as const },
];
export const BARKAS_FISH_SPOTS: ReadonlyArray<{ x: number; z: number; yaw: number; zone: 'barkas' }> = [
  ...[BX + 3.3, BX + 5.5, BX + 8, BX + 10.5].flatMap(spotPair),
  ...spotPair(BX + 0.8),
];
/** Сколько мест баркаса было до удлинения: они идут подряд за местами острова, новые — в самом конце FISH_SPOTS */
export const BARKAS_FISH_FIRST = 8;

/** Вода вокруг баркаса: упал здесь — матросы вытаскивают на палубу (с острова сюда не доплыть: невидимые стены). */
export function barkasWater(x: number, z: number): boolean {
  return x > BX - 36 && x < BX + 30 && z > BZ - 18 && z < BZ + 24;
}

/** Точка высадки k (0…5) */
export function barkasLanding(k: number): readonly [number, number] {
  return BARKAS_LANDING_SPOTS[((k % BARKAS_LANDING_SPOTS.length) + BARKAS_LANDING_SPOTS.length) % BARKAS_LANDING_SPOTS.length];
}

type Box = { min: Vec3; max: Vec3 };
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({ min: [x0, y0, z0], max: [x1, y1, z1] });

/**
 * Твёрдое баркаса: палуба ступеньками, фальшборт (на баке — «толстый», до обвода следующего участка, чтобы ступеньки
 * не оставляли щелей), транец с калиткой, рубка, стойки тента, люк, барабан, брашпиль, прилавок, тела матросов (боцман,
 * Толик, Витёк, Колян) и Сани,
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
  const V = BARKAS_CREW.vityok;
  out.push(bx(V.x - VITYOK_HALF, V.y, V.z - VITYOK_HALF, V.x + VITYOK_HALF, V.y + 1.75, V.z + VITYOK_HALF));
  const N = BARKAS_CREW.kolyan;
  out.push(bx(N.x - KOLYAN_HALF, N.y, N.z - KOLYAN_HALF, N.x + KOLYAN_HALF, N.y + 1.75, N.z + KOLYAN_HALF));
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
