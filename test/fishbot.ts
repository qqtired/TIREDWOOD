// Модель игрока на шкале вываживания (рыбалка 2.0) — для тестов и расчёта дохода. Игрок видит рыбу с запаздыванием
// (реакция, каждый раз чуть разная) и неточно, решает «держать или отпустить» не каждый тик, иногда отвлекается
// (кнопка остаётся как была), свою зону чувствует: хочет, чтобы середина зоны шла к рыбе со скоростью по расстоянию,
// с упреждением по скорости рыбы. «Обычный» — реакция ~230 мс, «опытный» — ~150 мс, внимательнее и точнее.
// Леска провисла (зона лежит на дне дольше 0,7 с): «обычный» подматывает, увидев надпись (через свою реакцию),
// «опытный» не даёт зоне залежаться и касается кнопки заранее. Натяжение лески (зона прижата к верху дольше 0,7 с) —
// так же, только отпускает кнопку; «обычный» после первого предупреждения за вываживание уже знает и отпускает заранее.
import { TICK_RATE } from '../shared/constants.ts';
import { CAST_TICKS, FISH, WAIT_MAX, WAIT_MIN } from '../shared/fishing.ts';
import { REEL_BAR, REEL_GRADES, SLACK_TICKS, TAUT_TICKS, reelGrade, reelStart, reelStep, type ReelGrade, type ReelStyle } from '../shared/fishreel.ts';
import {
  CHEST_BANDS, CHEST_PER_10K, COLLECTION, CONSOLATION_TICKS, POSEIDON_COINS, RULE, SP_BOOT, SP_CHEST, biteShare, fishPrice2, junkPer10k, poseidonShare, reelStyleFor,
} from '../shared/fishrules.ts';
import { fishCatchXp, fishLostXp, type FishCastMods } from '../shared/fishprogress.ts';
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
  /** Зона пролежала на дне столько тиков — коснуться кнопки (подмотать) */
  slackTap: number;
  /** Зону держат прижатой к верху столько тиков — отпустить кнопку (ослабить леску); после первого натяжения — tautLearn */
  tautTap: number;
  tautLearn: number;
}

export const TYPICAL: Skill = {
  delay: 14, jitter: 4, period: 5, noise: 3000, lead: 8, k: 14, vmax: 1500, lapseEvery: 240, lapse: 24, slackTap: SLACK_TICKS + 14, tautTap: TAUT_TICKS + 14, tautLearn: 30,
};
export const EXPERT: Skill = { delay: 9, jitter: 2, period: 3, noise: 1500, lead: 12, k: 12, vmax: 2200, lapseEvery: 900, lapse: 12, slackTap: 24, tautTap: 24, tautLearn: 24 };
/** «Без рук»: ни одного нажатия за всё вываживание (проверка, что так рыбу не вытащить) */
export const AFK: Skill = {
  delay: 0, jitter: 0, period: 1, noise: 0, lead: 0, k: 1, vmax: 0, lapseEvery: 1, lapse: 1_000_000, slackTap: Number.POSITIVE_INFINITY, tautTap: Number.POSITIVE_INFINITY,
  tautLearn: Number.POSITIVE_INFINITY,
};

export interface Play {
  caught: boolean;
  /** Ошибки: сколько раз рыба выходила из зоны (по ним оценка) */
  err: number;
  ticks: number;
  /** Переключения кнопки: номера тиков, с которых она нажата / отпущена */
  toggles: number[];
}

/** Сыграть одно вываживание: манера рыбы, сид сервера, умение; rngSeed — случайности самого игрока; drunk — водка. */
export function playReel(style: ReelStyle, seed: number, skill: Skill, rngSeed = seed ^ 0x5bd1e995, drunk = false): Play {
  const r = reelStart(style, seed, drunk);
  const me = makeRng(rngSeed);
  const hist: number[] = [];
  const toggles: number[] = [];
  let held = false;
  let away = 0;
  let tautTap = skill.tautTap;
  while (r.done === 0) {
    if (r.taut > TAUT_TICKS) tautTap = skill.tautLearn;
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
      // леска провисла (или вот-вот): коснуться кнопки, даже если рыба внизу; натянута — отпустить, даже если рыба вверху
      const h = (r.zv < want || r.rest >= skill.slackTap) && r.taut < tautTap;
      if (h !== held) {
        held = h;
        toggles.push(r.t);
      }
    }
    reelStep(r, held);
  }
  return { caught: r.done === 1, err: r.err, ticks: r.t, toggles };
}

export interface ReelStats {
  p: number;
  failure: number;
  ticks: number;
  caughtTicks: number;
  /** Поимки с оценкой g / все попытки (в сумме — p) */
  gradeP: number[];
  /** Sum time for successful and failed attempts / successes, not just mean fight duration. */
  costTicks: number;
  /** Сорвалась после CONSOLATION_TICKS борьбы (утешительный опыт эпических и выше) / все попытки */
  lostLongP: number;
}

/** Доля поимок/срывов, оценки поимок и реальная ожидаемая цена успеха по n одинаковым сидам; drunk — водка. */
export function reelStats(style: ReelStyle, skill: Skill, n: number, seed0 = 1, drunk = false): ReelStats {
  let caught = 0;
  let ticks = 0;
  let ct = 0;
  const grades = REEL_GRADES.map(() => 0);
  let lostLong = 0;
  for (let i = 0; i < n; i++) {
    const seed = (seed0 + i * 2654435761) | 0;
    const r = playReel(style, seed, skill, seed ^ 0x5bd1e995, drunk);
    if (r.caught) {
      caught++;
      ct += r.ticks;
      grades[reelGrade(r.err)]++;
    } else if (r.ticks >= CONSOLATION_TICKS) lostLong++;
    ticks += r.ticks;
  }
  return {
    p: caught / n, failure: 1 - caught / n, ticks: ticks / n, caughtTicks: caught ? ct / caught : 0, gradeP: grades.map((g) => g / n),
    costTicks: caught ? ticks / caught : Infinity, lostLongP: lostLong / n,
  };
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

/** Средний сундук без клада Посейдона: точно по полосам CHEST_BANDS */
export function meanBands(): number {
  const total = CHEST_BANDS.reduce((s, b) => s + b[2], 0);
  return CHEST_BANDS.reduce((s, [lo, hi, w]) => s + ((lo + hi) / 2) * (w / total), 0);
}

/** Средний сундук: 1…3 % по уровню — клад Посейдона, остальные — по полосам. */
export function meanChest(level = 0): number {
  const share = poseidonShare(level);
  return (1 - share) * meanBands() + share * POSEIDON_COINS;
}

/** Доход рыбака умения skill в ясную погоду или в дождь: n вываживаний на вид (хлам — по уровню, опыт в дождь ×1,15). */
export function fishIncome(skill: Skill, rain: boolean, n = 300, mods?: Readonly<FishCastMods>): Income {
  const junk = junkPer10k(mods?.level);
  const fishShare = 1 - (CHEST_PER_10K + junk) / 10_000;
  let fight = 0;
  let after = 0;
  let points = 0;
  let coins = 0;
  let fish = 0;
  let hooked = 0;
  let xp = 0;
  const drunk = mods?.drink === 4;
  for (const sp of COLLECTION) {
    const share = biteShare(sp, rain, mods) * fishShare;
    if (share === 0) continue;
    const s = reelStats(reelStyleFor(sp, mods), skill, n, 11 + sp * 7919, drunk);
    const m = meanPrice(sp, mods);
    fight += share * (s.ticks / TICK_RATE);
    after += share * (s.p * AFTER_CATCH_S + (1 - s.p) * AFTER_LOST_S);
    points += share * s.p * m.points;
    coins += share * s.p * m.coins;
    fish += share * s.p;
    hooked += share;
    const caught = s.gradeP.reduce((sum, p, g) => sum + p * fishCatchXp(sp, g as ReelGrade, mods, rain), 0);
    xp += share * (caught + s.lostLongP * fishLostXp(sp, CONSOLATION_TICKS, mods, rain));
  }
  let chest = 0;
  for (const [sp, share] of [[SP_CHEST, CHEST_PER_10K / 10_000], [SP_BOOT, junk / 10_000]] as const) {
    const s = reelStats(reelStyleFor(sp, mods), skill, Math.min(n, 100), 5, drunk);
    fight += share * (s.ticks / TICK_RATE);
    after += share * (s.p * AFTER_CATCH_S + (1 - s.p) * AFTER_LOST_S);
    if (sp === SP_CHEST) chest = share * s.p * meanChest(mods?.level);
  }
  const wait = (CAST_TICKS + (WAIT_MIN + WAIT_MAX) / (2 * (mods?.biteSpeed ?? 1))) / TICK_RATE + REACT_S;
  const perBite = wait + P_HOOK * (fight + after) + (1 - P_HOOK) * AFTER_LOST_S;
  const k = (60 * P_HOOK) / perBite;
  return { points: points * k, coins: coins * k, chest: chest * k, fish: fish * k, perBite, landed: fish / hooked, xp: xp * k };
}
