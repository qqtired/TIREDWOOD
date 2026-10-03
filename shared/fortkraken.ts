// Супер-босс «Крепости» — Кракен (волны 25, 50, 75 …): числа и геометрия боя, общие для сервера (server/fort/kraken.ts)
// и клиента (метки, подсказки, отрисовка). Голова живёт в бухте за обрывом, четыре щупальца — каждое на своей полосе
// вдоль морской стены. В снимке щупальце — его конец-булава (то, во что стреляют): корень всегда в воде на своей полосе
// (tentacleRoot), рука идёт от корня к булаве. Номер щупальца (полоса) — в стадии записи.
import { WATER_Y } from './constants.ts';
import { WALL_H } from './fortmap.ts';

// ------------------------------------------------------------ щупальца

/** Щупалец у Кракена; полосы (x) вдоль морской стены: углы с башнями у моря и края террасы */
export const TENT_COUNT = 4;
export const TENT_LANES: readonly number[] = [-16.5, -5.5, 5.5, 16.5];
/** Корень щупальца — в воде за обрывом */
export const TENT_ROOT_Z = 29;
/** Булава в покое — над кромкой берега, покачивается */
export const TENT_IDLE_Y = 5;
export const TENT_IDLE_Z = 25.5;
/** Замах: булава взмывает и отходит назад */
export const TENT_WIND_Y = 9.5;
export const TENT_WIND_Z = 30;
/** Удар: метка держится столько тиков (с самим взмахом в конце), взмах — последние тики, радиус, урон (× урон волны) */
export const TENT_WARN_TICKS = 96;
export const TENT_SWING_TICKS = 14;
export const TENT_SLAM_R = 2.6;
export const TENT_DMG = 30;
/** После удара булава лежит на месте удара — окно: урон полный (в ярости короче) */
export const TENT_REST_TICKS = 180;
export const TENT_REST_RAGE = 120;
/** Очередь ударов: следующее щупальце — через столько тиков; в ярости — парами реже, но вдвое больше рук сразу */
export const TENT_GAP = 120;
export const TENT_GAP_RAGE = 150;
/** Вырастает из воды (неуязвимо) за столько тиков; при появлении — по очереди с этим шагом */
export const TENT_RISE_TICKS = 70;
export const TENT_RISE_STEP = 28;
/** Кого бьёт: людей не дальше этого от своей полосы по x и в полосе z — южная часть террасы, морская стена, берег, причал */
export const TENT_ZONE_X = 7;
export const TENT_ZONE_Z0 = 8.5;
export const TENT_ZONE_Z1 = 28;
/** Людей рядом нет — бьёт по очереди ход морской стены и берег (причал) напротив своей полосы */
export const SEA_WALK_Z = 12.3;
export const SHORE_HIT_Z = 20;

// ------------------------------------------------------------ голова

/** Где голова всплывает в бухте: середина, восток, запад */
export const KRAKEN_SPOTS: ReadonlyArray<{ readonly x: number; readonly z: number }> = [
  { x: 0, z: 38 }, { x: 20, z: 41 }, { x: -20, z: 41 },
];
/** Ноги хитбокса головы: над водой (купол на 2,5 м), открыта (глаза над водой), на глубине (не видно) */
export const KRAKEN_LURK_Y = WATER_Y - 1.7;
export const KRAKEN_OPEN_Y = WATER_Y - 0.5;
export const KRAKEN_DEEP_Y = WATER_Y - 12;
/** Поднимается из бухты в начале боя, тиков */
export const KRAKEN_RISE_TICKS = 200;
/** Нырок (неуязвим): столько тиков под водой, всплывает в другом месте; в ярости — быстрее */
export const KRAKEN_DIVE_TICKS = 150;
export const KRAKEN_DIVE_RAGE = 110;
/** Ныряет в другое место раз в столько тиков: пока щупальца живы, без них, в ярости */
export const KRAKEN_LURK_TICKS = 25 * 60;
export const KRAKEN_LURK_BARE = 8 * 60;
export const KRAKEN_LURK_RAGE = 18 * 60;
/** Срубили последнее щупальце — голова оглушена и открыта столько тиков (в ярости — короче) */
export const KRAKEN_OPEN_TICKS = 8 * 60;
export const KRAKEN_OPEN_RAGE = 6 * 60;
/** Плевок вареньем: метка (тиков, с полётом в конце), полёт, перезарядка, радиус, урон людям и кристаллу, дальность */
export const KRAKEN_SPIT_TICKS = 90;
export const KRAKEN_SPIT_FLIGHT = 40;
export const KRAKEN_SPIT_EVERY = 330;
export const KRAKEN_SPIT_R = 2.4;
export const KRAKEN_SPIT_DMG = 22;
export const KRAKEN_SPIT_CRYSTAL = 60;
export const KRAKEN_SPIT_RANGE = 75;
/** В ярости второй плевок — через столько тиков после первого */
export const KRAKEN_SPIT_DOUBLE = 24;
/** Радиус кругов на воде: где всплывёт голова, где вынырнет щупальце */
export const KRAKEN_DIVE_R = 5;

/** Перезарядка плевка: с командой чаще (каждого — примерно так же часто), в ярости и на кругах II/III — чаще */
export function krakenSpitEvery(humans: number, rage: boolean, tier: number): number {
  const n = Math.max(1, Math.min(6, Math.floor(humans) || 1));
  return Math.round(KRAKEN_SPIT_EVERY / (1 + 0.15 * (n - 1)) * (rage ? 0.75 : 1) / (1 + 0.15 * Math.min(3, Math.max(0, tier))));
}

/** Шаг очереди ударов щупалец: на кругах II/III — чаще (метка держится полное время) */
export function tentacleGap(rage: boolean, tier: number): number {
  return Math.round((rage ? TENT_GAP_RAGE : TENT_GAP) / (1 + 0.12 * Math.min(3, Math.max(0, tier))));
}

/** Корень щупальца номер i — в воде на своей полосе (для отрисовки руки и подсказок) */
export function tentacleRoot(i: number, out: { x: number; y: number; z: number }): void {
  out.x = TENT_LANES[((i % TENT_COUNT) + TENT_COUNT) % TENT_COUNT];
  out.y = WATER_Y - 0.4;
  out.z = TENT_ROOT_Z;
}

/** Ход морской стены — высота (для меток по умолчанию) */
export const SEA_WALK_Y = WALL_H;
