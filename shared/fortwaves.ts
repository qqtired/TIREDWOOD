// Волны «Крепости» до 300: расписание (боссы, супер-боссы, десант, события), бюджет тел, нормировка HP под нагрузку
// arsenal L(w), урон, пределы, передышки и жетоны. Чистые функции: их считают сервер (директор, game.ts), клиент
// (карточка волны, подсказки) и тесты. Числа и их смысл — docs/superpowers/plans/2026-10-03-fort-waves.md, §4.
import { TICK_RATE } from './constants.ts';

/** Последняя волна: отбили — победа */
export const FORT_LAST_WAVE = 300;

// ------------------------------------------------------------ расписание

/** Супер-босс — каждая 25-я волна */
export function isSuperWave(w: number): boolean {
  return w > 0 && w % 25 === 0;
}

/** Босс — каждая 7-я волна, кроме супер-волн (175-я — супер) */
export function isBossWave(w: number): boolean {
  return w > 0 && w % 7 === 0 && !isSuperWave(w);
}

/** Какой по счёту босс на волне w (1 — на 7-й); 0 — не босс-волна */
export function bossNumber(w: number): number {
  if (!isBossWave(w)) return 0;
  return Math.floor(w / 7) - Math.floor(w / 175);
}

/** Вид босса по кругу: 0 — Барон Варенья, 1 — Таран, 2 — Валун */
export function bossArchetype(w: number): number {
  const n = bossNumber(w);
  return n > 0 ? (n - 1) % 3 : 0;
}

/** Круг босса: 0 — первые три, 1 — II (28, 35, 42), … */
export function bossTier(w: number): number {
  const n = bossNumber(w);
  return n > 0 ? Math.floor((n - 1) / 3) : 0;
}

/** Круг супер-босса: 0 — Кракен на 25-й, 1 — Кракен II на 50-й, … */
export function superTier(w: number): number {
  return isSuperWave(w) ? w / 25 - 1 : 0;
}

/** Десант с моря: с 10-й волны — каждая 3-я (10, 13, 16 …) и все супер-волны */
export function isSeaWave(w: number): boolean {
  return isSuperWave(w) || (w >= 10 && (w - 10) % 3 === 0);
}

export function boatCount(w: number): number {
  if (!isSeaWave(w)) return 0;
  return w >= 35 ? 3 : w >= 20 ? 2 : 1;
}

/** Абордажников в лодке */
export function crewSize(w: number): number {
  return w >= 60 ? 8 : w >= 30 ? 6 : 4;
}

// ------------------------------------------------------------ нагрузка (сведено с arsenal)

/**
 * Цель arsenal: L(w) = (HP волны на защитника / время выхода) относительно 1-й волны. Между точками — по логарифму.
 * Сила защитника у них растёт медленнее (w10 ×6,4 · w50 ×48 · w300 ×361) — разница и есть растущий вызов.
 */
const LOAD: ReadonlyArray<readonly [number, number]> = [[1, 1], [10, 10], [30, 55], [50, 160], [80, 400], [100, 590], [200, 1600], [300, 2400]];

export function waveLoad(w: number): number {
  return logInterp(LOAD, w);
}

/** Сила одного защитника у arsenal (средняя прокачка) — для симуляции и подсказок; не влияет на правила */
export const ARSENAL_POWER: ReadonlyArray<readonly [number, number]> = [[1, 1], [5, 3.6], [10, 6.4], [20, 12], [30, 22], [50, 48], [80, 94], [100, 129], [200, 276], [300, 361]];

export function arsenalPower(w: number): number {
  return logInterp(ARSENAL_POWER, w);
}

function logInterp(a: ReadonlyArray<readonly [number, number]>, w: number): number {
  if (w <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) {
    if (w > a[i][0]) continue;
    const [w0, v0] = a[i - 1];
    const [w1, v1] = a[i];
    const t = (w - w0) / (w1 - w0);
    return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * t);
  }
  return a[a.length - 1][1];
}

/** Время выхода волны, с: за него выпускают всех (2–4 импульса) */
export function releaseSeconds(w: number): number {
  return 12 + Math.min(18, 0.6 * (Math.max(1, w) - 1));
}

export function releaseTicks(w: number): number {
  return Math.round(releaseSeconds(w) * TICK_RATE);
}

/** Бюджет тел в очках на одного (шаркун = 1 очко) */
export function wavePoints(w: number): number {
  w = Math.max(1, w);
  if (w <= 10) return 16 + 4 * (w - 1);
  if (w <= 50) return 52 + 1.5 * (w - 10);
  return 112 + (w - 50);
}

/** HP в секунду выхода на одного защитника на 1-й волне: 16 шаркунов по 60 HP за 12 с */
export const LOAD_HP_PER_S = 80;

/** Сколько HP волна несёт на одного защитника (без боссов и лодок) */
export function waveHpPerDefender(w: number): number {
  return LOAD_HP_PER_S * waveLoad(w) * releaseSeconds(w);
}

/** Множитель HP «как если бы волна была из одних шаркунов»: броня, щиты, боссы, метеоры считаются от него */
export function waveHpMul(w: number): number {
  return waveHpPerDefender(w) / (wavePoints(w) * 60);
}

/** Урон врагов по игрокам, воротам и кристаллу */
export function waveDmgMul(w: number): number {
  return Math.min(4, 1 + 0.025 * (Math.max(1, w) - 1));
}

// ------------------------------------------------------------ команда

export function defenders(humans: number): number {
  return Math.max(1, Math.min(6, Math.floor(humans) || 1));
}

/** Тел больше: n(1+0,025(n−1))/(1+0,08(n−1)) — как в выпуске 6 */
export function teamCountMul(humans: number): number {
  const n = defenders(humans);
  return n * (1 + 0.025 * (n - 1)) / (1 + 0.08 * (n - 1));
}

/** Обычные чуть толще: до ×1,4 на шестерых */
export function teamHpMul(humans: number): number {
  return 1 + 0.08 * (defenders(humans) - 1);
}

/** Давление на защитника растёт с командой (координация): ×(1+0,025(n−1)) */
export function teamPressure(humans: number): number {
  return 1 + 0.025 * (defenders(humans) - 1);
}

/** Боссы — почти как суммарный урон команды */
export function bossTeamMul(humans: number): number {
  return 1 + 1.1 * (defenders(humans) - 1);
}

/** Тел за волну не больше: 60 / 120 / 160 на 1 / 4 / 6 защитников; живых одновременно — FORT_MAX_ALIVE */
export function bodyCap(humans: number): number {
  return 60 + 20 * (defenders(humans) - 1);
}

// ------------------------------------------------------------ элита

export const TIER_NORMAL = 0;
export const TIER_ELITE = 1;
export const TIER_CHAMP = 2;
/** HP и «цена» в очках бюджета: элита ×2,5, чемпион ×6. Урон и скорость — чуть выше. */
export const TIER_HP: readonly number[] = [1, 2.5, 6];
export const TIER_DMG: readonly number[] = [1, 1.25, 1.5];
export const TIER_SPEED: readonly number[] = [1, 1.08, 1.0];

export function eliteShare(w: number): number {
  return Math.max(0, Math.min(0.4, 0.015 * (w - 17)));
}

export function champShare(w: number): number {
  return Math.max(0, Math.min(0.12, 0.005 * (w - 29)));
}

// ------------------------------------------------------------ броня и щиты

/** Броня Чугунка: попадание в тело слабее на столько (растёт с волной), но не меньше 30 % проходит */
export function armorFor(w: number): number {
  return 12 * waveHpMul(w);
}

export const ARMOR_MIN_PASS = 0.3;

/** Щит щитоносца: прочность на волне w */
export function shieldHp(w: number, humans: number): number {
  return 200 * waveHpMul(w) * teamHpMul(humans);
}

// ------------------------------------------------------------ боссы

export const BOSS_BASE_HP = 2200;

export function bossHp(w: number, humans: number): number {
  return BOSS_BASE_HP * waveHpMul(w) * bossTeamMul(humans) * (1 + 0.35 * bossTier(w));
}

/** Кракен: каждое щупальце и голова */
export const TENTACLE_BASE_HP = 1200;
export const KRAKEN_HEAD_BASE_HP = 3000;

export function krakenHp(base: number, w: number, humans: number): number {
  return base * waveHpMul(w) * (1 + 1.0 * (defenders(humans) - 1)) * (1 + 0.35 * superTier(w));
}

// ------------------------------------------------------------ передышка

/** Передышка после отбитой волны w: 15 с, после босса 20 с, перед супер-боссом 30 с */
export function breakSecondsAfter(w: number): number {
  if (isSuperWave(w + 1)) return 30;
  if (isBossWave(w) || isSuperWave(w)) return 20;
  return 15;
}

/** «Вызвать волну раньше»: все ударили в колокол — волна через 3 с и +10 % золота за неё всем */
export const EARLY_BONUS = 0.1;

// ------------------------------------------------------------ события

export const EV_NONE = 0;
export const EV_METEORS = 1;
export const EV_SUPPLY = 2;
export const EV_GOLD = 3;
export const EV_FOG = 4;
export const EV_COUNT = 5;

/** События — с 12-й волны, не на волнах с боссом и не чаще раза в 3 волны */
export const EVENT_FROM = 12;
export const EVENT_GAP = 3;
export const EVENT_CHANCE = 0.35;

export function eventAllowed(w: number, lastEventWave: number): boolean {
  return w >= EVENT_FROM && !isBossWave(w) && !isSuperWave(w) && w - lastEventWave >= EVENT_GAP;
}

// ------------------------------------------------------------ жетоны 🪙 (≈10–11 в минуту боя)

/** За отбитую волну с участием: 6 + ⌊w/10⌋ (до 14), за босса +8, за супер-босса +25 */
export function waveTokens(w: number): number {
  return Math.min(14, 6 + Math.floor(w / 10)) + (isBossWave(w) ? 8 : 0) + (isSuperWave(w) ? 25 : 0);
}

/** За сбитых: 1 за каждые 10, не больше 40 за забег */
export function killTokens(kills: number): number {
  return Math.min(40, Math.floor(Math.max(0, kills) / 10));
}

export const FT_TOK_MVP = 10;
export const FT_TOK_RECORD = 15;
export const FT_TOK_WIN = 100;
