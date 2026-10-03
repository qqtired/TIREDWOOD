// Директор волн «Крепости»: из номера волны, числа защитников и зерна — состав (типы, ступени, дороги, время выхода),
// десант, босс, событие, нормировка HP под нагрузку arsenal и карточка волны для игроков. Чистая функция: тот же
// вход — та же волна, поэтому подкрепление при входе новых защитников — разница двух планов (horde.raiseDefenders).
// Волны 1–14 — ручные (знакомство с врагами), дальше — взвешенный выбор с «темой» волны. Числа — fortwaves.ts.
import {
  BOSS_CYCLE, Z_ARMORED, Z_BLOATER, Z_BOSS, Z_BRUTE, Z_CLIMBER, Z_FLYER, Z_KINDS, Z_KRAKEN, Z_MEDIC, Z_RUNNER, Z_SAPPER, Z_SHIELD,
  Z_SPITTER, Z_WALKER, ZK,
} from '../../shared/fortkinds.ts';
import {
  ARMOR_BUDGET, EV_FOG, EV_GOLD, EV_METEORS, EV_NONE, EV_SUPPLY, EVENT_CHANCE, SHIELD_BUDGET, TIER_CHAMP, TIER_ELITE, TIER_HP, TIER_NORMAL,
  bodyCap, bossHp, bossNumber, bossTier, boatCountFor, champShare, crewSize, defenders, eliteShare, eventAllowed, isBossWave, isSeaWaveFor, teamEarlyBoost,
  isFinalWave, isSuperWave, releaseTicks, shieldHp, superTier, teamCountMul, teamPressure, waveDmgMul, waveHpPerDefender, wavePoints,
} from '../../shared/fortwaves.ts';
import type { FortWaveCard } from '../../shared/fort.ts';
import { hash32, makeRng } from '../../shared/math.ts';

/** Один враг волны: когда (тиков от начала волны), какой, с какой дороги, какой ступени */
export interface PlanSpawn {
  at: number;
  kind: number;
  road: number;
  tier: number;
}

/** Лодка десанта: когда выходит (тиков от начала), полоса (−1 — к западному причалу, 1 — к восточному), экипаж */
export interface PlanBoat {
  at: number;
  lane: number;
  crew: number[];
  tiers: number[];
}

export interface WavePlan {
  w: number;
  defenders: number;
  /** Наземные и летучие — по времени выхода */
  spawns: PlanSpawn[];
  boats: PlanBoat[];
  /** Босс (тип) или −1; его круг и HP */
  boss: number;
  bossTier: number;
  bossHp: number;
  /** Супер-волна с Кракеном */
  kraken: boolean;
  event: number;
  /** HP врага = база типа × hpScale × ступень; урон врагов × dmgMul */
  hpScale: number;
  dmgMul: number;
  roads: number[];
  card: FortWaveCard;
}

/** Что уже умеет игра: директор зовёт только их (пункты плана включают остальное по мере готовности) */
export interface DirectorFeatures {
  kinds: ReadonlySet<number>;
  /** Боссы по кругу (по номеру босс-волны: 7 — первый, 14 — второй …); пустой — Барон */
  bosses: readonly number[];
  sea: boolean;
  kraken: boolean;
  events: boolean;
}

export const FEATURES: DirectorFeatures = {
  kinds: new Set([Z_WALKER, Z_RUNNER, Z_BRUTE, Z_CLIMBER, Z_BLOATER, Z_FLYER, Z_SHIELD, Z_SPITTER, Z_SAPPER, Z_MEDIC, Z_ARMORED]),
  // шесть по кругу (BOSS_CYCLE) от простого к сложному: 7 Барон · 14 Таран · 21 Валун · 28 Король-Тыква · 35 Ткачиха · 42 Леший · 49 Барон II …
  bosses: BOSS_CYCLE,
  sea: true,
  kraken: true,
  events: true,
};

/** Всё включено — для тестов расписания и симуляции */
export const ALL_FEATURES: DirectorFeatures = {
  kinds: new Set([Z_WALKER, Z_RUNNER, Z_BRUTE, Z_CLIMBER, Z_BLOATER, Z_FLYER, Z_SHIELD, Z_SPITTER, Z_SAPPER, Z_MEDIC, Z_ARMORED]),
  bosses: BOSS_CYCLE,
  sea: true,
  kraken: true,
  events: true,
};

type Mix = ReadonlyArray<readonly [number, number]>;

/** Ручные волны 1–14: новый тип в первой своей волне — около 30 % бюджета */
const HAND: ReadonlyArray<{ title: string; mix: Mix; roads: readonly number[] }> = [
  { title: 'Первые гости', mix: [[Z_WALKER, 1]], roads: [1] },
  { title: 'Шустрики', mix: [[Z_WALKER, 0.6], [Z_RUNNER, 0.4]], roads: [1, 0] },
  { title: 'Липучки', mix: [[Z_WALKER, 0.5], [Z_RUNNER, 0.2], [Z_CLIMBER, 0.3]], roads: [1, 2] },
  { title: 'Бугай', mix: [[Z_WALKER, 0.45], [Z_RUNNER, 0.15], [Z_CLIMBER, 0.15], [Z_BRUTE, 0.25]], roads: [0, 1, 2] },
  { title: 'Крылатки', mix: [[Z_WALKER, 0.4], [Z_RUNNER, 0.15], [Z_CLIMBER, 0.15], [Z_FLYER, 0.3]], roads: [2, 1] },
  { title: 'Стена щитов', mix: [[Z_WALKER, 0.35], [Z_RUNNER, 0.1], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.15], [Z_SHIELD, 0.3]], roads: [1, 0] },
  { title: 'Барон Варенья', mix: [[Z_WALKER, 0.4], [Z_RUNNER, 0.2], [Z_CLIMBER, 0.15], [Z_FLYER, 0.15], [Z_SHIELD, 0.1]], roads: [0, 2] },
  { title: 'Пузыри', mix: [[Z_WALKER, 0.3], [Z_RUNNER, 0.1], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.1], [Z_FLYER, 0.1], [Z_BLOATER, 0.3]], roads: [1, 2, 0] },
  { title: 'Плевальщики', mix: [[Z_WALKER, 0.3], [Z_RUNNER, 0.1], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.1], [Z_BLOATER, 0.1], [Z_SPITTER, 0.3]], roads: [0, 1] },
  { title: 'Щиты и бугаи', mix: [[Z_WALKER, 0.35], [Z_RUNNER, 0.15], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.15], [Z_FLYER, 0.1], [Z_SHIELD, 0.15]], roads: [1, 2] },
  { title: 'Подрывники', mix: [[Z_WALKER, 0.3], [Z_RUNNER, 0.1], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.1], [Z_SHIELD, 0.1], [Z_SAPPER, 0.3]], roads: [0, 1, 2] },
  { title: 'Натиск', mix: [[Z_WALKER, 0.3], [Z_RUNNER, 0.15], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.15], [Z_FLYER, 0.1], [Z_BLOATER, 0.1], [Z_SPITTER, 0.1]], roads: [2, 0] },
  { title: 'Лекари', mix: [[Z_WALKER, 0.3], [Z_RUNNER, 0.1], [Z_BRUTE, 0.15], [Z_SHIELD, 0.15], [Z_MEDIC, 0.3]], roads: [1, 0] },
  { title: 'Таран', mix: [[Z_WALKER, 0.35], [Z_RUNNER, 0.25], [Z_CLIMBER, 0.15], [Z_FLYER, 0.15], [Z_SAPPER, 0.1]], roads: [0, 1, 2] },
];

/** Веса выбора с 15-й волны и пределы на одного защитника (на команду — до ×3) */
const WEIGHT: readonly number[] = kindTable({ [Z_WALKER]: 30, [Z_RUNNER]: 14, [Z_CLIMBER]: 12, [Z_BRUTE]: 9, [Z_BLOATER]: 8, [Z_FLYER]: 8,
  [Z_SHIELD]: 9, [Z_SPITTER]: 7, [Z_SAPPER]: 6, [Z_MEDIC]: 5, [Z_ARMORED]: 8 });
const CAP: readonly number[] = kindTable({ [Z_WALKER]: 999, [Z_RUNNER]: 999, [Z_CLIMBER]: 16, [Z_BRUTE]: 10, [Z_BLOATER]: 10, [Z_FLYER]: 10,
  [Z_SHIELD]: 12, [Z_SPITTER]: 6, [Z_SAPPER]: 6, [Z_MEDIC]: 4, [Z_ARMORED]: 10 });
/** Тема волны: тип с весом ×3 и её название */
const THEME: Readonly<Record<number, string>> = {
  [Z_RUNNER]: 'Шустрая', [Z_CLIMBER]: 'Через стены', [Z_BRUTE]: 'Тяжёлая', [Z_BLOATER]: 'Пузырчатая', [Z_FLYER]: 'Налёт',
  [Z_SHIELD]: 'Стена щитов', [Z_SPITTER]: 'Обстрел', [Z_SAPPER]: 'Подрыв', [Z_MEDIC]: 'Лазарет', [Z_ARMORED]: 'Чугунная',
};
/** Тяжёлые — не в первых 40 % выхода: сначала мелочь, громилы подходят, когда на стенах уже жарко */
const HEAVY = new Set([Z_BRUTE, Z_ARMORED]);
const EVENTS = [EV_METEORS, EV_SUPPLY, EV_GOLD, EV_FOG];

function kindTable(v: Record<number, number>): number[] {
  return Array.from({ length: Z_KINDS }, (_, k) => v[k] ?? 0);
}

/** Последнее событие забега — чтобы не шли подряд */
export interface LastEvent {
  wave: number;
  kind: number;
}

/**
 * План волны w для humans защитников. seed — зерно игры (одинаковое для всех волн одной игры); last — последнее
 * событие. Тот же вход — тот же план.
 */
export function planWave(w: number, humans: number, seed: number, last: LastEvent = { wave: -99, kind: EV_NONE },
  f: DirectorFeatures = FEATURES): WavePlan {
  w = Math.max(1, Math.floor(w));
  const n = defenders(humans);
  const rng = makeRng(hash32(seed, w * 7919 + 13));
  const superWave = isSuperWave(w);
  const kraken = superWave && f.kraken;
  let boss = -1;
  let tierOfBoss = 0;
  /** Рост HP босса — как раньше, по номеру босса (+35 % за каждые три): шесть по кругу не делают боссов тоньше */
  let hpTier = 0;
  if (isBossWave(w)) {
    // круг — по всем боссам ротации (II — когда все уже были); он в подписи и скорости
    const k = Math.max(1, f.bosses.length);
    boss = f.bosses[(bossNumber(w) - 1) % k] ?? Z_BOSS;
    tierOfBoss = Math.floor((bossNumber(w) - 1) / k);
    hpTier = bossTier(w);
  } else if (superWave && (!kraken || isFinalWave(w))) {
    // Кракена ещё нет — на супер-волне Барон кругом выше; финал — Кракен и Барон разом
    boss = Z_BOSS;
    tierOfBoss = superTier(w) + 1;
    hpTier = tierOfBoss;
  }
  const landMul = kraken ? 0.5 : boss >= 0 ? 0.6 : 1;

  // десант: экипаж — из HP волны
  const boats: PlanBoat[] = [];
  if (f.sea && isSeaWaveFor(w, n)) {
    const nb = boatCountFor(w, n);
    const size = crewSize(w);
    for (let b = 0; b < nb; b++) {
      const crew: number[] = [];
      for (let i = 0; i < size; i++) {
        const kind = i % 4 === 3 && f.kinds.has(Z_CLIMBER) ? Z_CLIMBER : Z_WALKER;
        crew.push(kind);
      }
      boats.push({ at: 0, lane: b % 2 === 0 ? (rng() < 0.5 ? -1 : 1) : -boats[b - 1].lane, crew, tiers: crew.map(() => TIER_NORMAL) });
    }
  }

  // HP одного врага — плавная кривая s0 (ожидаемая нормировка для смеси этой волны без случайной темы): шаркун
  // 20-й волны всегда толще шаркуна 19-й. Состав набираем не очками, а HP: каждый враг «тратит» свои HP из цели
  // arsenal, поэтому тяжёлая тема даёт меньше тел, шустрая — больше, а HP волны всегда в цель. В бюджете — то, что
  // команде нужно снять (budgetHp): щит и кастрюля Чугунка тоже. Щит от s0 не зависит — его считаем отдельно.
  const target = waveHpPerDefender(w) * n * teamPressure(n) * teamEarlyBoost(w, n) * landMul;
  const es = eliteShare(w);
  const cs = champShare(w);
  const s0 = enemyHpScale(w, n, f);
  const shield = shieldHp(w, n);
  const bodyOf = (kind: number, tier: number) => ZK[kind].hp * TIER_HP[tier] * s0 * (kind === Z_ARMORED ? ARMOR_BUDGET : 1);
  const fixedOf = (kind: number, tier: number) => kind === Z_SHIELD ? SHIELD_BUDGET * shield * (1 + 0.5 * tier) : 0;
  const hpOf = (kind: number, tier: number) => bodyOf(kind, tier) + fixedOf(kind, tier);
  let fixed = 0;
  const tierOf = () => {
    const u = rng();
    return u < cs ? TIER_CHAMP : u < cs + es ? TIER_ELITE : TIER_NORMAL;
  };
  const walkerHp = hpOf(Z_WALKER, TIER_NORMAL);
  let crewBodies = 0;
  for (const b of boats) crewBodies += b.crew.length;
  const cap = Math.max(1, bodyCap(n) - crewBodies - (boss >= 0 ? 1 : 0));
  const list: Array<{ kind: number; tier: number }> = [];
  let sum = 0;
  for (const b of boats) {
    for (let i = 0; i < b.tiers.length; i++) {
      b.tiers[i] = tierOf();
      sum += hpOf(b.crew[i], b.tiers[i]);
      fixed += fixedOf(b.crew[i], b.tiers[i]);
    }
  }
  const add = (kind: number, tier = tierOf()) => {
    list.push({ kind, tier });
    sum += hpOf(kind, tier);
    fixed += fixedOf(kind, tier);
  };
  /** Тема волны и новичок (их тип не срезаем) */
  let theme = -1;
  let title: string;
  let roads: number[];
  if (w <= HAND.length) {
    const hand = HAND[w - 1];
    title = hand.title;
    // 04.10: враги всегда идут со всех трёх сторон; «своя» дорога волны — первой
    roads = [hand.roads[0], ...[0, 1, 2].filter((r) => r !== hand.roads[0])];
    for (const [kind, share] of hand.mix) {
      if (kind === Z_WALKER || !f.kinds.has(kind)) continue;
      const c = Math.max(1, Math.round(share * target / hpOf(kind, TIER_NORMAL)));
      // 04.10: и в ручных волнах ступень — по eliteShare (элита с 6-й)
      for (let i = 0; i < c && list.length < cap; i++) add(kind);
    }
    while (sum < target - walkerHp * 0.5 && list.length < cap) add(Z_WALKER);
  } else {
    const pool = [...f.kinds].filter((k) => ZK[k].first <= w && WEIGHT[k] > 0);
    const themed = pool.filter((k) => THEME[k]);
    const fresh = pool.find((k) => ZK[k].first === w);
    theme = fresh ?? themed[Math.floor(rng() * themed.length)] ?? Z_WALKER;
    title = THEME[theme] ?? 'Натиск';
    const capMul = Math.min(3, teamCountMul(n));
    if (fresh !== undefined) {
      const c = Math.max(1, Math.round(0.3 * target / hpOf(fresh, TIER_NORMAL)));
      for (let i = 0; i < c && list.length < cap; i++) add(fresh);
    }
    const counts = new Array<number>(Z_KINDS).fill(0);
    for (const s of list) counts[s.kind]++;
    const live = pool.slice();
    while (sum < target - walkerHp * 0.5 && list.length < cap && live.length) {
      let total = 0;
      for (const k of live) total += WEIGHT[k] * (k === theme ? 3 : 1);
      let pick = rng() * total;
      let i = 0;
      for (; i < live.length - 1; i++) {
        pick -= WEIGHT[live[i]] * (live[i] === theme ? 3 : 1);
        if (pick < 0) break;
      }
      const k = live[i];
      const tier = tierOf();
      // не перебирать цель больше чем на полшаркуна и не выходить за пределы типа
      if (counts[k] >= CAP[k] * capMul || hpOf(k, tier) > target - sum + walkerHp * 0.5) {
        live.splice(i, 1);
        continue;
      }
      counts[k]++;
      add(k, tier);
    }
    roads = shuffle([0, 1, 2], rng);
  }

  // тел уже предел, а HP не хватает — повышаем ступени (элиты до половины, чемпионы до четверти), и только потом
  // сам множитель; остаток (меньше полшаркуна) — точной подгонкой множителя
  const promote = (from: number, to: number, limit: number) => {
    let have = list.filter((s) => s.tier === to).length;
    const order = shuffle(list.map((_, i) => i), rng);
    for (const i of order) {
      if (sum >= target - walkerHp * 0.5 || have >= limit) break;
      const s = list[i];
      if (s.tier !== from) continue;
      sum += hpOf(s.kind, to) - hpOf(s.kind, from);
      fixed += fixedOf(s.kind, to) - fixedOf(s.kind, from);
      s.tier = to;
      have++;
    }
  };
  promote(TIER_NORMAL, TIER_ELITE, Math.floor(list.length * 0.5));
  promote(TIER_ELITE, TIER_CHAMP, Math.floor(list.length * 0.25));
  // точная подгонка: тела масштабируются, щиты — нет (если щиты съели почти всю цель — тела не тоньше min(⅓ цели,
  // половины своих))
  const scaled = sum - fixed;
  const hpScale = scaled > 0 ? s0 * Math.max(target - fixed, Math.min(target / 3, scaled * 0.5)) / scaled : s0;
  const counts = new Array<number>(Z_KINDS).fill(0);
  for (const s of list) counts[s.kind]++;

  // порядок выхода: вперемешку, тяжёлые — не в первых 40 %
  shuffle(list, rng);
  const early = Math.floor(list.length * 0.4);
  for (let i = 0; i < early; i++) {
    if (!HEAVY.has(list[i].kind)) continue;
    for (let tries = 0; tries < 20; tries++) {
      const j = early + Math.floor(rng() * (list.length - early));
      if (HEAVY.has(list[j].kind)) continue;
      [list[i], list[j]] = [list[j], list[i]];
      break;
    }
  }

  // время: 2–4 импульса за время выхода; в каждом — все три дороги по очереди (первая — «своя» дорога волны)
  const span = releaseTicks(w);
  const pulses = w < 10 ? 2 : w < 40 ? 3 : 4;
  const spawns: PlanSpawn[] = list.map((s, i) => {
    const pulse = Math.min(pulses - 1, Math.floor(i * pulses / list.length));
    const start = Math.ceil(pulse * list.length / pulses);
    const end = Math.ceil((pulse + 1) * list.length / pulses);
    const within = (i - start) / Math.max(1, end - start);
    return { at: 30 + Math.floor(span * (pulse + within * 0.6) / pulses), kind: s.kind, road: roads[(i - start + pulse) % roads.length], tier: s.tier };
  });
  boats.forEach((b, i) => { b.at = Math.floor(span * 0.2) + i * 4 * 60; });

  let event = EV_NONE;
  if (f.events && eventAllowed(w, last.wave) && rng() < EVENT_CHANCE) {
    const options = EVENTS.filter((e) => e !== last.kind);
    event = options[Math.floor(rng() * options.length)];
  }

  const plan: WavePlan = {
    w, defenders: n, spawns, boats, boss, bossTier: tierOfBoss, bossHp: boss >= 0 ? bossHp(w, n, hpTier) : 0, kraken, event,
    hpScale, dmgMul: waveDmgMul(w), roads,
    // десант — сюрприз (04.10): в карточке и превью лодок нет, тревога — только когда лодки уже у берега
    card: { w, title: isFinalWave(w) ? 'Финал: Кракен и Барон' : kraken ? 'Кракен' : boss >= 0 ? ZK[boss].name : title, chips: [], boats: 0, crew: 0,
      boss: kraken ? Z_KRAKEN : boss, tier: kraken ? superTier(w) : tierOfBoss, event, roads: [...roads].sort((a, b) => a - b), fresh: [],
      elite: 0, champ: 0 },
  };
  plan.card.chips = chipsOf(counts);
  plan.card.fresh = freshKinds(w, counts, f);
  for (const s of spawns) {
    if (s.tier === TIER_ELITE) plan.card.elite++;
    else if (s.tier === TIER_CHAMP) plan.card.champ++;
  }
  return plan;
}

/**
 * Плавная кривая HP врагов: HP = база типа × enemyHpScale × ступень. Это ожидаемая нормировка волны w для смеси
 * этой волны (очки бюджета × базовые HP на очко × средняя ступень = HP волны по цели arsenal); директор держит её и
 * подгоняет HP волны телами и ступенями.
 */
export function enemyHpScale(w: number, humans: number, f: DirectorFeatures = FEATURES): number {
  w = Math.max(1, Math.floor(w));
  const n = defenders(humans);
  const tiers = 1 + 1.5 * eliteShare(w) + 5 * champShare(w);
  return waveHpPerDefender(w) * n * teamPressure(n) / (wavePoints(w) * teamCountMul(n) * hpPerPoint(w, f) * tiers);
}

/**
 * Сколько базовых HP несёт очко бюджета в смеси волны w (ручные волны — их смесь, дальше — веса без темы):
 * знаменатель плавной кривой HP. Выключенные типы уходят в шаркунов.
 */
function hpPerPoint(w: number, f: DirectorFeatures): number {
  if (w <= HAND.length) {
    let hp = 0;
    let left = 1;
    for (const [kind, share] of HAND[w - 1].mix) {
      if (kind === Z_WALKER || !f.kinds.has(kind)) continue;
      hp += share * budgetBase(kind) / ZK[kind].cost;
      left -= share;
    }
    return hp + left * ZK[Z_WALKER].hp;
  }
  let hp = 0;
  let cost = 0;
  for (const k of f.kinds) {
    if (ZK[k].first > w || !(WEIGHT[k] > 0)) continue;
    hp += WEIGHT[k] * budgetBase(k);
    cost += WEIGHT[k] * ZK[k].cost;
  }
  return cost > 0 ? hp / cost : ZK[Z_WALKER].hp;
}

/** Базовые HP типа в бюджете (щит — в тех же единицах: 200 на HP-множитель волны) */
function budgetBase(kind: number): number {
  return ZK[kind].hp * (kind === Z_ARMORED ? ARMOR_BUDGET : 1) + (kind === Z_SHIELD ? SHIELD_BUDGET * 200 : 0);
}

/**
 * HP врага в бюджете волны — сколько команде нужно снять: тело × hpScale × ступень (Чугунку ×1,5 — кастрюля режет
 * попадания в тело) и 70 % щита. Сумма по плану — цель arsenal (тест), и её же видит модель tools/fort-balance.
 */
export function budgetHp(kind: number, tier: number, w: number, humans: number, hpScale: number): number {
  const body = ZK[kind].hp * (TIER_HP[tier] ?? 1) * hpScale * (kind === Z_ARMORED ? ARMOR_BUDGET : 1);
  return body + (kind === Z_SHIELD ? SHIELD_BUDGET * shieldHp(w, humans) * (1 + 0.5 * tier) : 0);
}

/** Пары [тип, сколько] по убыванию числа */
function chipsOf(counts: readonly number[]): number[] {
  const pairs: Array<[number, number]> = [];
  counts.forEach((c, k) => { if (c > 0) pairs.push([k, c]); });
  pairs.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return pairs.flat();
}

/** Кого игроки встречают впервые: тип с first === w (и он в волне) */
function freshKinds(w: number, counts: readonly number[], f: DirectorFeatures): number[] {
  const out: number[] = [];
  for (let k = 0; k < Z_KINDS; k++) if (counts[k] > 0 && ZK[k].first === w && f.kinds.has(k)) out.push(k);
  return out;
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Сколько врагов каждого типа в плане (с экипажем лодок) */
export function planCounts(plan: WavePlan): number[] {
  const c = new Array<number>(Z_KINDS).fill(0);
  for (const s of plan.spawns) c[s.kind]++;
  for (const b of plan.boats) for (const k of b.crew) c[k]++;
  return c;
}
