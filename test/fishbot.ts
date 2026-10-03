// Модель игрока на шкале вываживания (рыбалка 2.0) — для тестов и расчёта дохода. Игрок видит рыбу с запаздыванием
// (реакция, каждый раз чуть разная) и неточно, решает «держать или отпустить» не каждый тик, иногда отвлекается
// (кнопка остаётся как была), свою зону чувствует: хочет, чтобы середина зоны шла к рыбе со скоростью по расстоянию,
// с упреждением по скорости рыбы. «Обычный» — реакция ~230 мс, «опытный» — ~150 мс, внимательнее и точнее.
import { TICK_RATE } from '../shared/constants.ts';
import { CAST_TICKS, FISH, WAIT_MAX, WAIT_MIN } from '../shared/fishing.ts';
import { REEL_BAR, reelStart, reelStep, type ReelStyle } from '../shared/fishreel.ts';
import {
  CHEST_BANDS, CHEST_PER_10K, COLLECTION, JUNK_PER_10K, RULE, SP_BOOT, SP_CHEST, biteShare, fishPrice2, reelStyleFor,
} from '../shared/fishrules.ts';
import { fishCatchXp, type FishCastMods } from '../shared/fishprogress.ts';
import { makeRng } from '../shared/math.ts';

export interface Skill {
  /** Реакция, тики: видит рыбу такой, какой она была столько тиков назад (± jitter) */
  delay: number;
  jitter: number;
  /** Решает раз в столько тиков */
  period: number;
  /** Ошибка глаза: ± столько единиц шкалы */
  noise: number;
  /** Упреждение: на столько тиков вперёд по скорости рыбы */
  lead: number;
  /** Желаемая скорость зоны: расстояние / k (единиц за тик), не больше vmax */
  k: number;
  vmax: number;
  /** Отвлёкся: раз в столько тиков в среднем, на lapse тиков (± половина) */
  lapseEvery: number;
  lapse: number;
}

export const TYPICAL: Skill = { delay: 14, jitter: 4, period: 5, noise: 3000, lead: 8, k: 14, vmax: 1500, lapseEvery: 240, lapse: 24 };
export const EXPERT: Skill = { delay: 9, jitter: 2, period: 3, noise: 1500, lead: 12, k: 12, vmax: 2200, lapseEvery: 900, lapse: 12 };

export interface Play {
  caught: boolean;
  perfect: boolean;
  ticks: number;
  /** Переключения кнопки: номера тиков, с которых она нажата / отпущена */
  toggles: number[];
}

/** Сыграть одно вываживание: манера рыбы, сид сервера, умение; rngSeed — случайности самого игрока. */
export function playReel(style: ReelStyle, seed: number, skill: Skill, rngSeed = seed ^ 0x5bd1e995): Play {
  const r = reelStart(style, seed);
  const me = makeRng(rngSeed);
  const hist: number[] = [];
  const toggles: number[] = [];
  let held = false;
  let away = 0;
  while (r.done === 0) {
    hist.push(r.f);
    if (away > 0) away--;
    else if (me() * skill.lapseEvery < 1) away = Math.round(skill.lapse * (0.5 + me()));
    else if (r.t % skill.period === 0) {
      const d = skill.delay + Math.round((me() * 2 - 1) * skill.jitter);
      const i = Math.max(0, hist.length - 1 - d);
      const j = Math.max(0, i - 4);
      const vel = (hist[i] - hist[j]) / Math.max(1, i - j);
      const seen = hist[i] + vel * skill.lead + (me() * 2 - 1) * skill.noise;
      const err = Math.min(REEL_BAR, Math.max(0, seen)) - (r.z + r.zone / 2);
      const want = Math.max(-skill.vmax, Math.min(skill.vmax, err / skill.k));
      const h = r.zv < want;
      if (h !== held) {
        held = h;
        toggles.push(r.t);
      }
    }
    reelStep(r, held);
  }
  return { caught: r.done === 1, perfect: r.perfect, ticks: r.t, toggles };
}

export interface ReelStats {
  p: number;
  failure: number;
  ticks: number;
  caughtTicks: number;
  /** Perfect landed reels / all attempts; disjoint from failed reels. */
  perfectP: number;
  /** Sum time for successful and failed attempts / successes, not just mean fight duration. */
  costTicks: number;
}

/** Доля поимок/срывов, идеальные поимки и реальная ожидаемая цена успеха по n одинаковым сидам. */
export function reelStats(style: ReelStyle, skill: Skill, n: number, seed0 = 1): ReelStats {
  let caught = 0;
  let ticks = 0;
  let ct = 0;
  let perfect = 0;
  for (let i = 0; i < n; i++) {
    const r = playReel(style, (seed0 + i * 2654435761) | 0, skill);
    if (r.caught) {
      caught++;
      ct += r.ticks;
      if (r.perfect) perfect++;
    }
    ticks += r.ticks;
  }
  return { p: caught / n, failure: 1 - caught / n, ticks: ticks / n, caughtTicks: caught ? ct / caught : 0, perfectP: perfect / n, costTicks: caught ? ticks / caught : Infinity };
}

// ------------------------------------------------------------ доход

/**
 * Модель рыбака для расчёта дохода (на одну поклёвку): заброс CAST_TICKS, ожидание поклёвки — в среднем середина
 * WAIT_MIN…WAIT_MAX, подсекает через REACT_S; P_HOOK — доля поклёвок, которые он подсёк (остальные — рано дёрнул
 * или прозевал); вываживание — по модели игрока выше; после улова AFTER_CATCH_S — посмотрел карточку, снова закинул;
 * сорвалась / не подсёк — AFTER_LOST_S.
 */
export const REACT_S = 0.4;
export const P_HOOK = 0.92;
export const AFTER_CATCH_S = 1.5;
export const AFTER_LOST_S = 1;

export interface Income {
  /** Очков ценности в минуту (без сундуков) */
  points: number;
  /** Жетонов в минуту за рыбу (без сундуков) */
  coins: number;
  /** Жетонов в минуту из сундуков (сверх дохода) */
  chest: number;
  /** Рыб в минуту */
  fish: number;
  /** Секунд на поклёвку в среднем */
  perBite: number;
  /** Доля пойманных среди подсечённых рыб */
  landed: number;
  /** Fish-skill XP/min; ideal catch XP is computed from actual replay ticks. */
  xp: number;
}

/** Средняя цена вида по распределению веса (как в rollWeight: u², 400 точек) */
function meanPrice(sp: number, mods?: Readonly<FishCastMods>): { coins: number; points: number } {
  const f = FISH[sp];
  const r = RULE[sp]!;
  let coins = 0;
  let points = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const raw = f.g[0] + (f.g[1] - f.g[0]) * u * u;
    const g = raw >= 1000 ? Math.round(raw / 10) * 10 : Math.round(raw);
    coins += fishPrice2(sp, g, 0, mods);
    const k = f.g[1] > f.g[0] ? (g - f.g[0]) / (f.g[1] - f.g[0]) : 0;
    points += r.val[0] + (r.val[1] - r.val[0]) * k;
  }
  return { coins: coins / N, points: points / N };
}

/** Средний сундук: точно по полосам CHEST_BANDS */
export function meanChest(): number {
  const total = CHEST_BANDS.reduce((s, b) => s + b[2], 0);
  return CHEST_BANDS.reduce((s, [lo, hi, w]) => s + ((lo + hi) / 2) * (w / total), 0);
}

/** Доход рыбака умения skill в ясную погоду или в дождь: n вываживаний на вид. */
export function fishIncome(skill: Skill, rain: boolean, n = 300, mods?: Readonly<FishCastMods>): Income {
  const fishShare = 1 - (CHEST_PER_10K + JUNK_PER_10K) / 10_000;
  let fight = 0;
  let after = 0;
  let points = 0;
  let coins = 0;
  let fish = 0;
  let hooked = 0;
  let xp = 0;
  for (const sp of COLLECTION) {
    const share = biteShare(sp, rain, mods) * fishShare;
    if (share === 0) continue;
    const s = reelStats(reelStyleFor(sp, mods), skill, n, 11 + sp * 7919);
    const m = meanPrice(sp, mods);
    fight += share * (s.ticks / TICK_RATE);
    after += share * (s.p * AFTER_CATCH_S + (1 - s.p) * AFTER_LOST_S);
    points += share * s.p * m.points;
    coins += share * s.p * m.coins;
    fish += share * s.p;
    hooked += share;
    xp += share * (s.p * fishCatchXp(sp) + s.perfectP * (fishCatchXp(sp, true) - fishCatchXp(sp)));
  }
  let chest = 0;
  for (const [sp, share] of [[SP_CHEST, CHEST_PER_10K / 10_000], [SP_BOOT, JUNK_PER_10K / 10_000]] as const) {
    const s = reelStats(reelStyleFor(sp, mods), skill, Math.min(n, 100), 5);
    fight += share * (s.ticks / TICK_RATE);
    after += share * (s.p * AFTER_CATCH_S + (1 - s.p) * AFTER_LOST_S);
    if (sp === SP_CHEST) chest = share * s.p * meanChest();
  }
  const wait = (CAST_TICKS + (WAIT_MIN + WAIT_MAX) / (2 * (mods?.biteSpeed ?? 1))) / TICK_RATE + REACT_S;
  const perBite = wait + P_HOOK * (fight + after) + (1 - P_HOOK) * AFTER_LOST_S;
  const k = (60 * P_HOOK) / perBite;
  return { points: points * k, coins: coins * k, chest: chest * k, fish: fish * k, perBite, landed: fish / hooked, xp: xp * k };
}
