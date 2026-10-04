// Причёсанные шансы рыбалки (04.10, владелец): база мифической +0,4 п. п., божественной +0,2 п. п. (у новичка в ясную
// погоду, доли всех поклёвок); каждый бонус — уровень (до 15-го), удочка, пиво, эль, пиво владыки, дождь, сезон —
// поднимает категории от редкой до божественной, блесна и водка — эпическую и выше (с божественной); дождь ×1,5 к ясной
// погоде, сезон — ещё ×2 к дождю; потолок — сверху вниз. Перебор: места × ясно/дождь/сезон × уровни 0–15 × удочки ×
// блёсны × напитки.
//
// Что держит перебор. Редкие и выше делят не больше 95 % рыбы (обычным пол 5 % — COMMON_FLOOR: пикарель ловится у
// всех). Когда их набирается больше, поднять одну категорию можно только за счёт другой. Потолок сверху вниз отдаёт место
// старшим: срезается нижняя оставшаяся категория (сначала обычные до пола, потом редкие…). Поэтому от любого бонуса не
// уменьшаются: шанс «эта категория или выше» у каждой категории, каждая категория выше нижней оставшейся, ожидаемые
// жетоны и опыт за поклёвку. Пока потолка нет — не уменьшается ни одна категория.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  FISH_XP_LEVELS, drinkOf, emptyFishProgress, fishCastMods, fishCatchXp, levelOdds, rodOdds, type FishCastMods, type FishGear, type FishProgress, type FishRod,
} from '../shared/fishprogress.ts';
import {
  CHEST_BANDS, COLLECTION, COMMON_FLOOR, DIVINE_BASE, MYTH_ADD, RAIN_MUL, RULE, SEASON_MUL, T_COMMON, T_DIVINE, T_EPIC, T_LEGEND, T_MYTH, T_RARE,
  biteShare, fishPrice2, junkPer10k, rollCatch2, tierOdds, tierRank,
} from '../shared/fishrules.ts';
import { ALE, BEER, LORD, LURES, VODKA } from '../shared/fishshop.ts';
import { makeRng } from '../shared/math.ts';

type Zone = 'pier' | 'barkas';
type Weather = 0 | 1 | 2;
const ZONES: readonly Zone[] = ['pier', 'barkas'];
const WEATHERS: readonly Weather[] = [0, 1, 2];
const WNAME = ['ясно', 'дождь', 'сезон'];
const LEVEL_TOP = 15;
const GEAR = [0, 1, 2, 3, 4] as const;
/** Ранги 1…5 (редкая … божественная) → номер категории в tierOdds */
const RANK_T = [T_COMMON, T_RARE, T_EPIC, T_LEGEND, T_MYTH, T_DIVINE];
const EPS = 1e-12;

/** Снимок заброса. Уровни выше таблицы опыта — тот же снимок с подставленным уровнем и его множителем шанса. */
function cast(zone: Zone, level: number, rod: number, lure: number, drink: number): FishCastMods {
  const now = 1_000_000;
  const p: FishProgress = {
    ...emptyFishProgress(), xp: FISH_XP_LEVELS[Math.min(level, FISH_XP_LEVELS.length - 1)], questsDone: [0, 1, 5, 10, 15][rod], rod: rod as FishRod, lure: lure as FishGear,
  };
  if (drink === 1) p.beerUntil = now + 1;
  if (drink === 2) p.aleUntil = now + 1;
  if (drink === 3) p.lordUntil = now + 1;
  if (drink === 4) p.vodkaUntil = now + 1;
  const m = fishCastMods(p, now, zone);
  assert.equal(m.drink, drink);
  return m.level === level ? m : { ...m, level, rareMultiplier: levelOdds(level) * rodOdds(rod) * (drinkOf(drink)?.rare ?? 1) };
}

const odds = (m: FishCastMods, w: Weather): number[] => tierOdds(w > 0, m, w === 2);
/** Доли рыбы по рангам 0…5 (без хлама и сундука) */
function ranks(p: readonly number[]): number[] {
  const fish = 1 - p[5] - p[6];
  return RANK_T.map((t) => p[t] / fish);
}
/** Шанс «ранг k или выше» среди рыбы, k = 1…5 */
const atLeast = (r: readonly number[], k: number): number => r.slice(k).reduce((a, b) => a + b, 0);
/** Нижняя оставшаяся категория под потолком (обычным — только пол); 0 — потолка нет */
const floorOf = (r: readonly number[]): number => (r[0] > COMMON_FLOOR + 1e-12 ? 0 : r.findIndex((x, k) => k > 0 && x > EPS));

const meanChest = (() => {
  const total = CHEST_BANDS.reduce((s, b) => s + b[2], 0);
  return CHEST_BANDS.reduce((s, [lo, hi, w]) => s + ((lo + hi) / 2) * (w / total), 0);
})();
const priceMemo = new Map<string, number>();
/** Средняя цена вида с этим напитком и местом: вес — как у броска (лёгкие чаще) */
function meanPrice(sp: number, m: FishCastMods): number {
  const key = `${sp}|${m.zone}|${m.incomeScale}`;
  let v = priceMemo.get(key);
  if (v === undefined) {
    const f = FISH[sp];
    const N = 120;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const raw = f.g[0] + (f.g[1] - f.g[0]) * u * u;
      sum += fishPrice2(sp, raw >= 1000 ? Math.round(raw / 10) * 10 : Math.round(raw), 0, m);
    }
    priceMemo.set(key, (v = sum / N));
  }
  return v;
}
/** Ожидаемые жетоны и опыт за одну поклёвку: что клюёт (рыба, сундук, хлам), без учёта того, вытащишь ли */
function perBite(m: FishCastMods, w: Weather): { coins: number; xp: number } {
  const rain = w > 0;
  const p = odds(m, w);
  const fish = 1 - p[5] - p[6];
  let coins = p[6] * meanChest;
  let xp = 0;
  for (const sp of COLLECTION) {
    const s = biteShare(sp, rain, m, w === 2) * fish;
    if (s <= 0) continue;
    coins += s * meanPrice(sp, m);
    xp += s * fishCatchXp(sp, false, m, rain);
  }
  return { coins, xp };
}

interface Case { zone: Zone; w: Weather; level: number; rod: number; lure: number; drink: number }
const tag = (c: Case): string => `${c.zone} ${WNAME[c.w]} ур.${c.level} удочка ${c.rod} блесна ${c.lure} напиток ${c.drink}`;
const memo = new Map<string, { p: number[]; r: number[]; coins: number; xp: number }>();
function look(c: Case) {
  const key = tag(c);
  let v = memo.get(key);
  if (!v) {
    const m = cast(c.zone, c.level, c.rod, c.lure, c.drink);
    const p = odds(m, c.w);
    v = { p, r: ranks(p), ...perBite(m, c.w) };
    memo.set(key, v);
  }
  return v;
}

/** Тот же набор без одного бонуса: погода слабее, уровень ниже, удочка или блесна хуже, напиток слабее или без него */
function without(c: Case): Array<[string, Case]> {
  const out: Array<[string, Case]> = [];
  if (c.w > 0) out.push([c.w === 2 ? 'сезон' : 'дождь', { ...c, w: (c.w - 1) as Weather }]);
  if (c.level > 0) out.push(['уровень', { ...c, level: c.level - 1 }]);
  if (c.rod > 0) out.push(['удочка', { ...c, rod: c.rod - 1 }]);
  if (c.lure > 0) out.push(['блесна', { ...c, lure: c.lure - 1 }], ['блесна с нуля', { ...c, lure: 0 }]);
  if (c.drink > 0) out.push(['напиток', { ...c, drink: 0 }]);
  if (c.drink === 2 || c.drink === 3) out.push(['напиток крепче', { ...c, drink: c.drink - 1 }]);
  return out;
}

function* all(): Generator<Case> {
  for (const zone of ZONES) for (const w of WEATHERS) for (let level = 0; level <= LEVEL_TOP; level++)
    for (const rod of GEAR) for (const lure of GEAR) for (const drink of GEAR) yield { zone, w, level, rod, lure, drink };
}

test('(а) любой добавленный бонус — уровень, удочка, блесна, пиво, эль, пиво владыки, водка, дождь, сезон — не уменьшает шанс «категория или выше», категории выше потолка, жетоны и опыт за поклёвку', (t) => {
  let pairs = 0, capped = 0;
  for (const c of all()) {
    const a = look(c);
    assert.ok(Math.abs(a.p.reduce((x, y) => x + y, 0) - 1) < 1e-9, `${tag(c)}: сумма`);
    assert.ok(a.p.every((x) => x >= 0), `${tag(c)}: без отрицательных`);
    // нижняя оставшаяся категория под потолком (0 — обычные ещё есть, потолка нет)
    assert.ok(a.r[0] >= COMMON_FLOOR - 1e-12, `${tag(c)}: обычных ${a.r[0]} — меньше пола`);
    const floor = floorOf(a.r);
    if (floor > 0) capped++;
    for (const [what, prev] of without(c)) {
      const b = look(prev);
      pairs++;
      const msg = `${tag(c)} против «без: ${what}»`;
      for (let k = 1; k <= 5; k++) {
        assert.ok(atLeast(a.r, k) >= atLeast(b.r, k) - EPS, `${msg}: «ранг ${k} и выше» ${atLeast(b.r, k)} → ${atLeast(a.r, k)}`);
        if (k > floor) assert.ok(a.p[RANK_T[k]] >= b.p[RANK_T[k]] - EPS, `${msg}: категория ${k} ${b.p[RANK_T[k]]} → ${a.p[RANK_T[k]]}`);
      }
      assert.ok(a.coins >= b.coins - 1e-9, `${msg}: жетоны за поклёвку ${b.coins} → ${a.coins}`);
      assert.ok(a.xp >= b.xp - 1e-9, `${msg}: опыт за поклёвку ${b.xp} → ${a.xp}`);
    }
  }
  t.diagnostic(`сочетаний ${memo.size}, пар «с бонусом / без» ${pairs}, под потолком ${capped}`);
  assert.ok(pairs > 40_000 && capped > 1000, `пар ${pairs}, под потолком ${capped}`);
});

test('(б) дождь — ×1,5 к ясной погоде у всех от редкой до божественной (со всеми бонусами игрока); под потолком — так у всех категорий выше нижней', () => {
  assert.equal(RAIN_MUL, 1.5);
  let free = 0;
  for (const c of all()) {
    if (c.w !== 1) continue;
    const rain = look(c), clear = look({ ...c, w: 0 });
    const floor = floorOf(rain.r);
    if (floor === 0) free++;
    for (let k = floor + 1; k <= 5; k++) {
      const t = RANK_T[k];
      assert.ok(Math.abs(rain.p[t] - RAIN_MUL * clear.p[t]) < 1e-12, `${tag(c)}: категория ${k} ${clear.p[t]} → ${rain.p[t]}`);
    }
  }
  assert.ok(free > 500, `без потолка в дождь: ${free}`);
});

test('(в) сезон рыбалки — ×2 к дождю со всеми бонусами: «категория или выше» ровно вдвое (до 100 %), категории выше нижней — ровно ×2; жетоны за поклёвку — заметно больше дождя у всех', (t) => {
  assert.equal(SEASON_MUL, 2);
  let worst = Infinity;
  for (const c of all()) {
    if (c.w !== 2) continue;
    const season = look(c), rain = look({ ...c, w: 1 });
    assert.deepEqual(tierOdds(true, cast(c.zone, c.level, c.rod, c.lure, c.drink), true), season.p, 'сезон и дождь вместе — тот же сезон');
    for (let k = 1; k <= 5; k++) {
      assert.ok(Math.abs(atLeast(season.r, k) - Math.min(1 - COMMON_FLOOR, SEASON_MUL * atLeast(rain.r, k))) < 1e-12, `${tag(c)}: «ранг ${k} и выше»`);
    }
    const floor = floorOf(season.r);
    for (let k = floor + 1; k <= 5; k++) {
      const t = RANK_T[k];
      assert.ok(Math.abs(season.p[t] - SEASON_MUL * rain.p[t]) < 1e-12, `${tag(c)}: категория ${k}`);
    }
    worst = Math.min(worst, season.coins / rain.coins);
  }
  t.diagnostic(`сезон к дождю по жетонам за поклёвку: хуже всего ×${worst.toFixed(3)}`);
  assert.ok(worst > 1.4, `сезон к дождю по жетонам за поклёвку — не меньше ×1,4, хуже всего ×${worst.toFixed(3)}`);
});

test('(г) база новичка (0-й уровень, без снастей, ясно): у пристани мифическая 0,99 %, божественная 0,43 %; на баркасе +0,4 и +0,2 п. п.; остальные доли — по весам видов, как были', () => {
  const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);
  assert.equal(MYTH_ADD, 0.004);
  for (const zone of ZONES) {
    const p = odds(cast(zone, 0, 0, 0, 0), 0);
    const fish = 1 - (300 + junkPer10k(0)) / 10_000;
    assert.equal(fish, 0.925);
    // по весам видов ясной погоды — как до 04.10
    const w = [0, 0, 0, 0, 0];
    for (const sp of COLLECTION) {
      const r = RULE[sp]!;
      if (r.zones.includes(zone) && !r.rain && r.tier !== T_DIVINE) w[tierRank(r.tier)] += r.bite;
    }
    const total = w.reduce((a, b) => a + b, 0);
    for (const k of [1, 2, 3]) near(p[RANK_T[k]], (fish * w[k]) / total, 1e-12, `${zone}: категория ${k} не изменилась`);
    near(p[T_MYTH], (fish * w[4]) / total + 0.004, 1e-12, `${zone}: мифическая +0,4 п. п.`);
    near(p[T_DIVINE], DIVINE_BASE[zone], 1e-12, `${zone}: божественная — явно`);
    near(p[T_DIVINE] - (fish * w[4]) / total / 2.5, 0.002, 0.00006, `${zone}: божественная +0,2 п. п. к прежней (мифическая / 2,5)`);
  }
  const pier = odds(cast('pier', 0, 0, 0, 0), 0);
  near(pier[T_MYTH] * 100, 0.99, 0.005, 'у пристани мифическая, %');
  near(pier[T_DIVINE] * 100, 0.43, 0.005, 'у пристани божественная, %');
});

test('каждый бонус по отдельности (новичок у пристани, ясно, без потолка) умножает все категории от редкой до божественной; блесна и водка — эпическую и выше; уровень — до 15-го', () => {
  const base = odds(cast('pier', 0, 0, 0, 0), 0);
  const check = (m: FishCastMods, k: number, from: number, msg: string) => {
    const p = odds(m, 0);
    for (let r = 1; r <= 5; r++) {
      const want = r >= from ? k : 1;
      const fish = (1 - p[5] - p[6]) / (1 - base[5] - base[6]);
      assert.ok(Math.abs(p[RANK_T[r]] / base[RANK_T[r]] / fish - want) < 1e-9, `${msg}: ранг ${r} ×${p[RANK_T[r]] / base[RANK_T[r]] / fish}`);
    }
    assert.ok(p[T_COMMON] > 0, `${msg}: потолка нет`);
  };
  for (let level = 0; level <= LEVEL_TOP; level++) {
    assert.equal(levelOdds(level), 1 + 0.025 * level);
    check(cast('pier', level, 0, 0, 0), 1 + 0.025 * level, 1, `уровень ${level}`);
  }
  assert.equal(levelOdds(15), 1.375);
  assert.equal(levelOdds(16), 1.375, 'выше 15-го — не растёт');
  assert.equal(levelOdds(99), 1.375);
  for (const level of [10, 12, 15]) assert.equal(junkPer10k(level), 0, `хлама на ${level}-м нет`);
  for (const rod of [1, 2, 3, 4]) check(cast('pier', 0, rod, 0, 0), rodOdds(rod), 1, `удочка ${rod}`);
  for (const l of LURES) check(cast('pier', 0, 0, l.tier, 0), l.epic, 2, l.name);
  check(cast('pier', 0, 0, 0, 1), BEER.rare, 1, 'пиво');
  check(cast('pier', 0, 0, 0, 2), ALE.rare, 1, 'эль');
  check(cast('pier', 0, 0, 0, 3), LORD.rare, 1, 'пиво владыки');
  check(cast('pier', 0, 0, 0, 4), VODKA.top ?? 1, 2, 'водка');
  // опыт с водкой — ×2 за эпическую и выше, божественную тоже
  const plain = cast('pier', 4, 0, 0, 0), vodka = cast('pier', 4, 0, 0, 4);
  for (const id of ['bluefish', 'tuna', 'whiteshark', 'kalmar']) {
    const s = FISH.findIndex((f) => f.id === id);
    assert.ok(Math.abs(fishCatchXp(s, false, vodka) - 2 * fishCatchXp(s, false, plain)) <= 1, id);
  }
});

test('пол обычных: не меньше 5 % рыбы при любом снаряжении, погоде и месте — пикарель (обычная дождевая) в дождь и в сезон клюёт у всех', () => {
  assert.equal(COMMON_FLOOR, 0.05);
  const picarel = FISH.findIndex((f) => f.id === 'picarel');
  assert.ok(RULE[picarel]!.rain && RULE[picarel]!.tier === T_COMMON);
  let worst = Infinity;
  for (const c of all()) {
    const m = cast(c.zone, c.level, c.rod, c.lure, c.drink);
    const r = look(c).r;
    assert.ok(r[0] >= COMMON_FLOOR - 1e-12, `${tag(c)}: обычных ${r[0]}`);
    if (c.zone === 'pier' && c.w > 0) {
      const s = biteShare(picarel, true, m, c.w === 2);
      assert.ok(s > 0, `${tag(c)}: пикарель не клюёт`);
      worst = Math.min(worst, s);
    }
  }
  // худший случай — потолок: обычным 5 % рыбы, пикарели из них — по её весу среди обычных дождя
  assert.ok(worst > 0.01, `пикарель — не реже 1 % рыбы, хуже всего ${worst}`);
});

test('бросок сервера в сезон у прокачанного рыбака — те же доли, что в таблице (потолок сверху вниз: обычным пол 5 %, редких нет)', () => {
  const m = cast('pier', 10, 4, 4, 3);
  const p = odds(m, 2);
  assert.ok(Math.abs(p[T_COMMON] - COMMON_FLOOR * (1 - p[5] - p[6])) < 1e-12, 'обычных — пол');
  assert.equal(p[T_RARE], 0, 'редких нет — их место заняли старшие');
  const rng = makeRng(2026);
  const N = 120_000;
  const n = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) n[RULE[rollCatch2(true, rng, m, true).sp]!.tier]++;
  for (let t = 0; t < 8; t++) assert.ok(Math.abs(n[t] / N - p[t]) < 0.005, `категория ${t}: ${n[t] / N} ≠ ${p[t]}`);
});
