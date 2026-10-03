// Рыбалка 2.0, общие правила: 30 видов (одна мифическая, 5 дождевых), старые ключи альбома на месте; вываживание —
// детерминизм, целые числа, 5 с в зоне до улова, зона и кнопка; трудность растёт с категорией; доход обычного игрока
// по модели (test/fishbot.ts) — в коридоре вокруг одной константы; сундук 3 % и его полосы; дождь ×1,5.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  REEL_BAR, REEL_FILL_TICKS, REEL_MAX_TICKS, REEL_P_MAX, REEL_P_START, heldAt, reelRun, reelStart, reelStep, type Reel, type ReelStyle,
} from '../shared/fishreel.ts';
import {
  CHEST_BANDS, CHEST_PER_10K, COIN_PER_POINT, COLLECTION, COLLECTION_SIZE, FISH_OTHER_PRICE_SCALE, FISH_POINTS_PER_MIN, FISH_TARGET_PER_MIN, JUNK_PER_10K,
  LEGACY_IDS, RAIN_DEN, RAIN_NUM, RULE, SP_BOOT, SP_BOTTLE, SP_CHEST, T_COMMON, T_EPIC, T_LEGEND, T_MYTH, T_RARE, biteShare,
  collectionCount, fishPrice2, fmtKg, isCollected, mskDayNum, priceRange, rollCatch2, rollChest, rollWeight,
} from '../shared/fishrules.ts';
import { makeRng } from '../shared/math.ts';
import { EXPERT, TYPICAL, fishIncome, meanChest, playReel, reelStats } from './fishbot.ts';

const sp = (id: string): number => FISH.findIndex((f) => f.id === id);
const rule = (s: number) => RULE[s]!;
const OLD_IDS = ['hamsa', 'goby', 'scad', 'redmullet', 'mullet', 'mackerel', 'garfish', 'scorpion', 'flounder', 'bluefish', 'gurnard', 'dogfish', 'ray', 'sturgeon'];

// ------------------------------------------------------------ виды

test('коллекция:32вида,2мифических,8уникальныхevent-only; старые ключи на месте, золотая рыбка — старая находка', () => {
  assert.equal(COLLECTION.length, 32);
  assert.equal(COLLECTION_SIZE, 32);
  const ids = COLLECTION.map((s) => FISH[s].id);
  assert.equal(new Set(ids).size, 32);
  for (const id of OLD_IDS) assert.ok(ids.includes(id), `старый вид ${id} — в коллекции`);
  assert.deepEqual(LEGACY_IDS, ['goldfish']);
  assert.ok(!isCollected(sp('goldfish')) && !isCollected(SP_BOOT) && !isCollected(SP_CHEST), 'хлам и сундук — не из 30');
  const byTier = [0, 0, 0, 0, 0];
  for (const s of COLLECTION) byTier[rule(s).tier]++;
  assert.deepEqual(byTier, [10, 9, 6, 5, 2], '10обычных,9редких,6эпических,5легендарных,2мифических');
  assert.equal(FISH[COLLECTION.find((s) => rule(s).tier === T_MYTH)!].id, 'whiteshark');
  const rain = COLLECTION.filter((s) => rule(s).rain);
  assert.equal(rain.length, 8);
  // журнал — по категориям; у каждой рыбы — манера словами, ценность растёт с весом
  for (let i = 1; i < COLLECTION.length; i++) assert.ok(rule(COLLECTION[i]).tier >= rule(COLLECTION[i - 1]).tier);
  for (const s of COLLECTION) {
    const r = rule(s);
    assert.ok(r.note.length > 3 && r.val[0] > 0 && r.val[1] > r.val[0] && r.bite > 0, FISH[s].id);
    // новые виды старой рыбалке не клюют
    if (!OLD_IDS.includes(FISH[s].id)) assert.equal(FISH[s].w, 0, FISH[s].id);
  }
  assert.equal(collectionCount({ goby: [100, 1], goldfish: [300, 1], boot: [900, 2], whiteshark: [400_000, 1] }), 2);
});

test('вес: в границах вида, тяжёлые реже; вес для доски — «850 г», «12,4 кг», «1 234 кг»', () => {
  const rng = makeRng(5);
  for (const s of [...COLLECTION, SP_BOOT, SP_BOTTLE, SP_CHEST]) {
    const f = FISH[s];
    let light = 0;
    for (let i = 0; i < 400; i++) {
      const g = rollWeight(s, rng);
      assert.ok(Number.isInteger(g) && g >= f.g[0] && g <= f.g[1], `${f.id}: ${g}`);
      if (g < (f.g[0] + f.g[1]) / 2) light++;
    }
    assert.ok(light > 240, `${f.id}: лёгких больше`);
  }
  assert.equal(fmtKg(850), '850 г');
  assert.equal(fmtKg(12_400), '12,4 кг');
  assert.equal(fmtKg(1_234_000), '1\u00a0234 кг', 'разряды — неразрывным пробелом');
  // календарный день по Москве: полночь — в 21:00 UTC
  assert.equal(mskDayNum(Date.UTC(2026, 9, 2, 21, 0)) - mskDayNum(Date.UTC(2026, 9, 2, 20, 59)), 1);
  assert.equal(mskDayNum(Date.UTC(2026, 9, 2, 3, 0)), mskDayNum(Date.UTC(2026, 9, 2, 20, 0)));
});

// ------------------------------------------------------------ вываживание

const still: ReelStyle = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 0, hi: 30, roam: 2, zone: 30, drain: 10 };

function snapshot(r: Reel): number[] {
  return [r.t, r.f, r.fv, r.ft, r.mode, r.timer, r.z, r.zv, r.p, r.done, r.rng];
}

test('вываживание: рыба всё время в зоне — от 25 % до 100 % ровно 300 тиков (5 с)', () => {
  assert.equal(REEL_FILL_TICKS, 300);
  assert.equal(REEL_P_START * 4, REEL_P_MAX, 'начало — 25 %');
  const r = reelStart(still, 42);
  while (r.done === 0) reelStep(r, false);
  assert.equal(r.done, 1);
  assert.equal(r.t, 300);
});

test('вываживание: держишь — зона вверх (прилипает к верху), отпустил — падает и отскакивает от дна; рыба вне зоны — прогресс падает', () => {
  const r = reelStart({ ...still, drain: 1 }, 1);
  for (let i = 0; i < 40; i++) reelStep(r, true);
  assert.ok(r.z > 10_000 && r.zv > 0, `зона пошла вверх: ${r.z}`);
  const p0 = r.p;
  for (let i = 0; i < 200; i++) reelStep(r, true);
  assert.equal(r.z, REEL_BAR - r.zone, 'держишь — у верха');
  assert.equal(r.zv, 0);
  assert.ok(!r.inZone && r.p < p0, 'рыба внизу, зона наверху — прогресс падает');
  let bounced = false;
  for (let i = 0; i < 200 && r.done === 0; i++) {
    const before = r.zv;
    reelStep(r, false);
    if (before < 0 && r.zv > 0) bounced = true;
  }
  assert.ok(bounced, 'от дна отскочила');
  assert.ok(r.inZone, 'снова на рыбе');
  // сопротивление побольше — сорвалась
  const q = reelStart(still, 1);
  while (q.done === 0) reelStep(q, true);
  assert.equal(q.done, -1);
  assert.equal(q.p, 0);
});

test('вываживание: один сид и одни нажатия — один итог бит в бит, только целые числа; повтор по нажатиям — тот же итог', () => {
  for (const s of COLLECTION) {
    const style = rule(s).style;
    const seed = (s * 2654435761) | 0;
    const a = playReel(style, seed, TYPICAL);
    const b = playReel(style, seed, TYPICAL);
    assert.deepEqual(a, b, FISH[s].id);
    // повтор: кусками, как приходит на сервер, — то же, что за раз
    const whole = reelStart(style, seed);
    reelRun(whole, a.toggles, REEL_MAX_TICKS + 1);
    const part = reelStart(style, seed);
    let k = 0;
    for (let u = 0; part.done === 0 && u <= REEL_MAX_TICKS + 15; u += 15) {
      k = reelRun(part, a.toggles, u, k);
      for (const v of snapshot(part)) assert.ok(Number.isInteger(v), `${FISH[s].id}: только целые`);
    }
    assert.deepEqual(snapshot(part), snapshot(whole), FISH[s].id);
    assert.equal(whole.done === 1, a.caught, FISH[s].id);
    assert.equal(whole.t, a.ticks);
  }
  // другой сид — рыба ходит иначе
  const x = reelStart(rule(sp('tuna')).style, 1);
  const y = reelStart(rule(sp('tuna')).style, 2);
  const fx: number[] = [];
  const fy: number[] = [];
  for (let i = 0; i < 300; i++) {
    reelStep(x, false);
    reelStep(y, false);
    fx.push(x.f);
    fy.push(y.f);
  }
  assert.notDeepEqual(fx, fy);
  // нажатия: держит, если переключений до тика нечётно
  assert.equal(heldAt([10, 20, 30], 9), false);
  assert.equal(heldAt([10, 20, 30], 10), true);
  assert.equal(heldAt([10, 20, 30], 20), false);
  assert.equal(heldAt([10, 20, 30], 99), true);
});

test('трудность по категориям растёт по реальной стоимости успеха; опытный справляется быстрее', () => {
  let previousTypical = 0, previousExpert = 0;
  for (const tier of [T_COMMON, T_RARE, T_EPIC, T_LEGEND, T_MYTH]) {
    const species = COLLECTION.filter(sp => rule(sp).tier === tier);
    let typical = 0, expert = 0;
    for (const sp of species) {
      const a = reelStats(rule(sp).style, TYPICAL, 600, 3);
      const b = reelStats(rule(sp).style, EXPERT, 600, 4);
      assert.ok(a.p > 0 && b.p > 0, FISH[sp].id);
      assert.ok(b.costTicks < a.costTicks, FISH[sp].id);
      typical += a.costTicks / species.length;
      expert += b.costTicks / species.length;
    }
    assert.ok(typical > previousTypical && expert > previousExpert);
    previousTypical = typical; previousExpert = expert;
  }
});

// ------------------------------------------------------------ экономика

test('доход: измеренный исходный +50% ±5% послеevent-common; очки FISH_POINTS_PER_MIN ±3%', (t) => {
  assert.equal(COIN_PER_POINT, 13.5 / 13.7, 'старый курс заморожен для +75 % обычным');
  assert.equal(FISH_TARGET_PER_MIN, 20.2);
  const clear = fishIncome(TYPICAL, false);
  const rain = fishIncome(TYPICAL, true);
  const pro = fishIncome(EXPERT, false);
  t.diagnostic(`обычный: ${clear.coins.toFixed(2)} 🪙/мин (очков ${clear.points.toFixed(2)}), в дождь ${rain.coins.toFixed(2)}, опытный ${pro.coins.toFixed(2)}, сундуки +${clear.chest.toFixed(2)}`);
  assert.ok(Math.abs(clear.points / FISH_POINTS_PER_MIN - 1) < 0.03, `очков в минуту ${clear.points.toFixed(2)} — поправь FISH_POINTS_PER_MIN`);
  assert.ok(Math.abs(clear.coins / FISH_TARGET_PER_MIN - 1) < 0.05, `жетонов в минуту ${clear.coins.toFixed(2)}`);
  assert.ok(clear.coins >= 20 && clear.coins <= 21.21);
  // в дождь заметно выгоднее, опытный зарабатывает больше, но не в разы
  assert.ok(rain.coins > clear.coins * 1.15 && rain.coins < clear.coins * 1.6, `дождь: ${rain.coins}`);
  assert.ok(pro.coins > clear.coins && pro.coins < clear.coins * 1.6, `опытный: ${pro.coins}`);
  // сундуки — сверху: 3 % поклёвок по ~57 🪙
  assert.ok(Math.abs(meanChest() - 57.4) < 0.1);
  assert.ok(clear.chest > 3 && clear.chest < 6, `сундуки: ${clear.chest}`);
});

test('цены: обычные от исходной целой цены +75 %, остальные откалиброваны; дождевые ×1,5, хлам даром, сундук без множителей', () => {
  const mean: number[][] = [[], [], [], [], []];
  for (const s of COLLECTION) {
    const r = rule(s);
    const f = FISH[s];
    const k = r.rain ? RAIN_NUM / RAIN_DEN : 1;
    const [lo, hi] = priceRange(s);
    const want = (v: number) => r.tier === T_COMMON
      ? Math.round(Math.round(Math.max(1, Math.round(v * COIN_PER_POINT)) * 1.75) * k)
      : Math.max(1, Math.round(v * COIN_PER_POINT * k * FISH_OTHER_PRICE_SCALE));
    assert.equal(lo, want(r.val[0]), f.id);
    assert.equal(hi, want(r.val[1]), f.id);
    assert.ok(hi > lo);
    assert.ok(fishPrice2(s, Math.round((f.g[0] + f.g[1]) / 2)) >= lo && fishPrice2(s, Math.round((f.g[0] + f.g[1]) / 2)) <= hi);
    mean[r.tier].push((lo + hi) / 2);
  }
  const avg = mean.map((a) => a.reduce((x, y) => x + y, 0) / a.length);
  for (let i = 1; i < avg.length; i++) assert.ok(avg[i] > avg[i - 1], `категория ${i} дороже: ${avg}`);
  assert.equal(fishPrice2(SP_BOOT, 900), 0);
  assert.equal(fishPrice2(SP_BOTTLE, 400), 0);
  assert.equal(fishPrice2(SP_CHEST, 5000, 137), 137);
  assert.equal(fishPrice2(sp('goldfish'), 300), 0, 'золотая рыбка в рыбалке 2.0 не продаётся');
});

test('сундук: 3 % поклёвок, 25–200 🪙, крупное реже, 200 — джекпот; хлам 4,5 %', () => {
  const rng = makeRng(11);
  const N = 400_000;
  let chests = 0;
  let junk = 0;
  for (let i = 0; i < N; i++) {
    const c = rollCatch2(false, rng);
    if (c.sp === SP_CHEST) {
      chests++;
      assert.ok(Number.isInteger(c.coins) && c.coins >= 25 && c.coins <= 200);
    } else {
      assert.equal(c.coins, 0);
      if (c.sp === SP_BOOT || c.sp === SP_BOTTLE) junk++;
    }
  }
  assert.ok(Math.abs(chests / N - CHEST_PER_10K / 10_000) < 0.002, `сундуков ${chests / N}`);
  assert.ok(Math.abs(junk / N - JUNK_PER_10K / 10_000) < 0.002, `хлама ${junk / N}`);
  // полосы: 25–50 — часто, 51–100 — средне, 101–150 — редко, 151–199 — очень редко, 200 — крайне редко
  const bands = CHEST_BANDS.map(() => 0);
  const M = 200_000;
  for (let i = 0; i < M; i++) {
    const v = rollChest(rng);
    bands[CHEST_BANDS.findIndex(([lo, hi]) => v >= lo && v <= hi)]++;
  }
  const total = CHEST_BANDS.reduce((s, b) => s + b[2], 0);
  CHEST_BANDS.forEach(([lo, hi, w], i) => {
    assert.ok(Math.abs(bands[i] / M - w / total) < 0.005, `${lo}–${hi}: ${bands[i] / M}`);
    if (i > 0) assert.ok(bands[i] < bands[i - 1] / 2.5, 'каждая полоса заметно реже прошлой');
  });
  assert.deepEqual(CHEST_BANDS.map(([lo, hi]) => [lo, hi]), [[25, 50], [51, 100], [101, 150], [151, 199], [200, 200]]);
  assert.ok(bands[4] > 0 && bands[4] / M < 0.01, 'джекпот 200 бывает, но крайне редко');
});

test('event-only: только в событие; common/rare/epic чаще обычныхrare, новыеLegend/Myth намеренноредки', () => {
  const rain = COLLECTION.filter((s) => rule(s).rain);
  const rares = COLLECTION.filter((s) => rule(s).tier === T_RARE && !rule(s).rain);
  const maxRare = Math.max(...rares.map((s) => biteShare(s, true)));
  for (const s of rain) {
    assert.equal(biteShare(s, false), 0, FISH[s].id);
    if (rule(s).tier <= T_EPIC) assert.ok(biteShare(s, true) > maxRare, `${FISH[s].id} клюёт чаще обычных редких`);
    else assert.ok(biteShare(s, true) < maxRare, `${FISH[s].id}: новаяeventлегенда/миф намеренноредки`);
  }
  const rng = makeRng(3);
  const seen = new Map<number, number>();
  const N = 200_000;
  for (let i = 0; i < N; i++) {
    const c = rollCatch2(false, rng);
    assert.ok(!rule(c.sp).rain, 'в ясную погоду дождевые не клюют');
    const d = rollCatch2(true, rng);
    seen.set(d.sp, (seen.get(d.sp) ?? 0) + 1);
  }
  const fishShare = 1 - (CHEST_PER_10K + JUNK_PER_10K) / 10_000;
  for (const s of COLLECTION) {
    assert.ok(Math.abs((seen.get(s) ?? 0) / N - biteShare(s, true) * fishShare) < 0.003, FISH[s].id);
  }
  // сумма долей — 1 и в ясную погоду, и в дождь; эпические в дождь не вытесняют легендарных совсем
  for (const r of [false, true]) assert.ok(Math.abs(COLLECTION.reduce((x, s) => x + biteShare(s, r), 0) - 1) < 1e-9);
  assert.ok(biteShare(sp('sturgeon'), true) > 0.005);
});
