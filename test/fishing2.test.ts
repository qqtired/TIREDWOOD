// Рыбалка 2.0, общие правила: 52 вида (32 у пристани, 19 на баркасе, 12 только в дождь; божественный кальмар — везде),
// старые ключи альбома на месте;
// вываживание — детерминизм, целые числа, 5 с в зоне до улова, зона и кнопка; ценнее — злее, уровень помогает; доход
// обычного игрока по модели (test/fishbot.ts) — в коридоре вокруг одной константы; сундук 3 % и его полосы; дождь ×1,5.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  BOUNCE_FULL, REEL_BAR, REEL_FILL_TICKS, REEL_MAX_TICKS, REEL_P_MAX, REEL_P_START, SLACK_TICKS, heldAt, reelPulling, reelRun, reelSlack, reelStart, reelStep,
  type Reel, type ReelStyle,
} from '../shared/fishreel.ts';
import {
  BARKAS_INCOME, CHEST_BANDS, CHEST_PER_10K, COIN_PER_POINT, COLLECTION, COLLECTION_SIZE, FISH_OTHER_PRICE_SCALE, FISH_POINTS_PER_MIN, FISH_TARGET_PER_MIN,
  JUNK_PER_10K, LEGACY_IDS, RAIN_DEN, RAIN_NUM, RULE, SP_BOOT, SP_BOTTLE, SP_CHEST, T_COMMON, T_DIVINE, T_EPIC, T_MYTH, T_RARE, biteShare,
  collectionCount, fishPrice2, fmtKg, isCollected, mskDayNum, priceRange, reelStyleFor, rollCatch2, rollChest, rollWeight, tierRank, zoneSpecies,
} from '../shared/fishrules.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods, type FishCastMods, type FishGear, type FishRod } from '../shared/fishprogress.ts';
import type { FishZone } from '../shared/fishplaces.ts';
import { BARKAS_LEVEL } from '../shared/fishshop.ts';
import { makeRng } from '../shared/math.ts';
import { EXPERT, TYPICAL, fishIncome, meanBands, meanChest, playReel, reelStats, type Skill } from './fishbot.ts';

const sp = (id: string): number => FISH.findIndex((f) => f.id === id);
const rule = (s: number) => RULE[s]!;
const OLD_IDS = ['hamsa', 'goby', 'scad', 'redmullet', 'mullet', 'mackerel', 'garfish', 'scorpion', 'flounder', 'bluefish', 'gurnard', 'dogfish', 'ray', 'sturgeon'];

// ------------------------------------------------------------ виды

test('коллекция: 52 вида — 32 у пристани (8 в дождь) и 19 на баркасе (4 в дождь), 3 мифических и божественный кальмар везде; старые ключи на месте, золотая рыбка — старая находка', () => {
  assert.equal(COLLECTION.length, 52);
  assert.equal(COLLECTION_SIZE, COLLECTION.length, 'размер коллекции не зашит — считается по таблице');
  const ids = COLLECTION.map((s) => FISH[s].id);
  assert.equal(new Set(ids).size, COLLECTION.length);
  for (const id of OLD_IDS) assert.ok(ids.includes(id), `старый вид ${id} — в коллекции`);
  assert.deepEqual(LEGACY_IDS, ['goldfish']);
  assert.ok(!isCollected(sp('goldfish')) && !isCollected(SP_BOOT) && !isCollected(SP_CHEST), 'хлам и сундук — не из коллекции');
  // по рангу: обычные … мифические, божественная (T_DIVINE = 7) — шестой столбец
  const tiers = (list: readonly number[]) => {
    const byTier = [0, 0, 0, 0, 0, 0];
    for (const s of list) byTier[tierRank(rule(s).tier)]++;
    return byTier;
  };
  assert.deepEqual(tiers(COLLECTION), [14, 14, 11, 9, 3, 1], '14 обычных, 14 редких, 11 эпических, 9 легендарных, 3 мифических, 1 божественная');
  assert.deepEqual(tiers(zoneSpecies('pier')), [10, 9, 6, 5, 2, 1], 'пристань — прежние 32 и кальмар');
  assert.deepEqual(tiers(zoneSpecies('barkas')), [4, 5, 5, 4, 2, 1], 'баркас — свои 19, гренландская акула в дождь (04.10) и кальмар');
  assert.deepEqual(COLLECTION.filter((s) => rule(s).tier === T_MYTH).map((s) => FISH[s].id), ['whiteshark', 'greenlandshark', 'oarfish']);
  assert.deepEqual(COLLECTION.filter((s) => rule(s).tier === T_DIVINE).map((s) => FISH[s].id), ['kalmar']);
  assert.deepEqual(rule(sp('kalmar')).zones, ['pier', 'barkas']);
  const rain = COLLECTION.filter((s) => rule(s).rain);
  assert.equal(rain.length, 12);
  assert.equal(rain.filter((s) => rule(s).zone === 'barkas').length, 4);
  assert.deepEqual(rain.filter((s) => rule(s).zones.length > 1).map((s) => FISH[s].id), ['greenlandshark'], 'в дождь и у пристани, и с баркаса');
  // журнал — по категориям; у каждой рыбы — манера словами, ценность растёт с весом
  for (let i = 1; i < COLLECTION.length; i++) assert.ok(tierRank(rule(COLLECTION[i]).tier) >= tierRank(rule(COLLECTION[i - 1]).tier));
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

/** Держит середину зоны на рыбе; зона полежала на дне полсекунды — подматывает (иначе через 0,7 с «леска провисла») */
const track = (r: Reel): boolean => r.z + Math.trunc(r.zone / 2) < r.f || r.rest >= 30;

function snapshot(r: Reel): number[] {
  return [r.t, r.f, r.fv, r.ft, r.mode, r.timer, r.z, r.zv, r.p, r.done, r.rng];
}

test('вываживание: рыба всё время в зоне — от 25 % до 100 % ровно 300 тиков (5 с)', () => {
  assert.equal(REEL_FILL_TICKS, 300);
  assert.equal(REEL_P_START * 4, REEL_P_MAX, 'начало — 25 %');
  const r = reelStart(still, 42);
  while (r.done === 0) reelStep(r, track(r));
  assert.equal(r.done, 1);
  assert.equal(r.t, 300);
});

test('вываживание: держишь — зона вверх (прилипает к верху); отпустил с верха — о дно шкалы на полной скорости сильный отскок, удары всё слабее, потом легла на дно (под шкалу не уходит, 04.10); рыба вне зоны — прогресс падает', () => {
  const r = reelStart({ ...still, drain: 1 }, 1);
  for (let i = 0; i < 40; i++) reelStep(r, true);
  assert.ok(r.z > 10_000 && r.zv > 0, `зона пошла вверх: ${r.z}`);
  const p0 = r.p;
  for (let i = 0; i < 200; i++) reelStep(r, true);
  assert.equal(r.z, REEL_BAR - r.zone, 'держишь — у верха');
  assert.equal(r.zv, 0);
  assert.ok(!r.inZone && r.p < p0, 'рыба внизу, зона наверху — прогресс падает');
  const hits: number[] = [];
  let peak = 0;
  let under = false;
  for (let i = 0; i < 400 && r.done === 0; i++) {
    reelStep(r, false);
    if (r.hit > 0) hits.push(r.hit);
    else if (hits.length === 1) peak = Math.max(peak, r.z);
    if (r.z < 0) under = true;
  }
  assert.ok(hits[0] >= BOUNCE_FULL, `с верха — полная скорость удара: ${hits[0]}`);
  assert.ok(peak > REEL_BAR / 4, `с полной скорости — сильный отскок: до ${peak}`);
  for (let k = 1; k < hits.length; k++) assert.ok(hits[k] < hits[k - 1], `удары всё слабее: ${hits.join(', ')}`);
  assert.ok(!under && r.z === 0 && r.zv === 0, 'отскакала и легла на дно — под шкалу не уходит');
  assert.ok(r.rest > SLACK_TICKS && reelSlack(r) && !reelPulling(r), 'зона в покое рыбу у дна не тянет: леска провисла');
  // подмотал — зона снова натянута и на рыбе
  for (let i = 0; i < 240 && r.done === 0; i++) reelStep(r, track(r));
  assert.ok(r.inZone && !reelSlack(r), 'подмотал — снова на рыбе');
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

/** Снимок заброса: уровень рыбалки, удочка (заработана заданиями 1, 5, 10), блесна, место */
function castAt(zone: FishZone, level: number, rod: FishRod = 0, lure: FishGear = 0): FishCastMods {
  const questsDone = rod >= 3 ? 10 : rod >= 2 ? 5 : rod;
  const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone, rod, lure }, 0, zone);
  assert.equal(mods.rod, rod);
  return mods;
}

/** Средний успех по категориям 0…4 у видов места (модель игрока, n попыток на вид); fight — средняя длина удачного боя, с */
function tierSuccess(zone: FishZone, mods: FishCastMods, skill: Skill, n: number, seed: number): { p: number[]; fight: number[] } {
  const p = [0, 0, 0, 0, 0], fight = [0, 0, 0, 0, 0], k = [0, 0, 0, 0, 0];
  for (const s of zoneSpecies(zone)) {
    const t = rule(s).tier;
    if (t > T_MYTH) continue; // божественная — отдельно
    const st = reelStats(reelStyleFor(s, mods), skill, n, seed);
    assert.ok(st.p > 0, `${FISH[s].id}: вытащить можно`);
    p[t] += st.p;
    fight[t] += st.caughtTicks / 60;
    k[t]++;
  }
  return { p: p.map((v, t) => v / k[t]), fight: fight.map((v, t) => v / k[t]) };
}

test('трудность: ценнее — злее (успех падает, бой длиннее), море злее пристани, уровень и снасти помогают; опытный вытаскивает чаще', (t) => {
  const pct = (a: number[]) => a.map((v) => `${Math.round(v * 100)}%`).join(' / ');
  // пристань, 0-й уровень без бонусов: цель калибровки была 99 / 93 / 80 / 55 / 36 % за ~6 / 9 / 12 / 15 / 18 с; 03.10
  // зона −10 % и отскок от дна шкалы (владелец: чуть сложнее, шансы обратно не подтягивать) — 99 / 93 / 77 / 45 / 14 %
  const pier0 = tierSuccess('pier', castAt('pier', 0), TYPICAL, 200, 3);
  const pierPro = tierSuccess('pier', castAt('pier', 0), EXPERT, 200, 4);
  t.diagnostic(`пристань, ур. 0: обычный ${pct(pier0.p)}, опытный ${pct(pierPro.p)}; бой ${pier0.fight.map((v) => v.toFixed(1)).join(' / ')} с`);
  [0.99, 0.93, 0.77, 0.45, 0.14].forEach((want, tier) => assert.ok(Math.abs(pier0.p[tier] - want) < 0.08, `категория ${tier}: ${pier0.p[tier]}`));
  for (let tier = 1; tier <= T_MYTH; tier++) {
    assert.ok(pier0.p[tier] < pier0.p[tier - 1], `пристань: категория ${tier} труднее`);
    // 04.10: допуск 1 с — у мификов удачных боёв мало (2 вида × 10–20 % из 200), средняя длина шумит на ±1 с
    assert.ok(pier0.fight[tier] > pier0.fight[tier - 1] - 1, `пристань: категория ${tier} бьётся не короче`);
    assert.ok(pierPro.p[tier] >= pier0.p[tier], `опытный у пристани: категория ${tier}`);
  }
  // баркас — с BARKAS_LEVEL и первой удочкой: та же лестница, а эпические и выше злее пристани
  const entry = BARKAS_LEVEL;
  const sea = tierSuccess('barkas', castAt('barkas', entry, 1), TYPICAL, 200, 3);
  const land = tierSuccess('pier', castAt('pier', entry, 1), TYPICAL, 200, 3);
  t.diagnostic(`ур. ${entry}, удочка 1: пристань ${pct(land.p)}, баркас ${pct(sea.p)}`);
  for (let tier = 1; tier <= T_MYTH; tier++) assert.ok(sea.p[tier] < sea.p[tier - 1], `баркас: категория ${tier} труднее`);
  for (let tier = T_EPIC; tier <= T_MYTH; tier++) assert.ok(sea.p[tier] < land.p[tier] - 0.03, `баркас злее пристани: категория ${tier}`);
  // божественный кальмар (04.10) — труднее любого мифика у пристани и на баркасе, но вытащить можно
  for (const [zone, low] of [['pier', pier0], ['barkas', sea]] as const) {
    const mods = zone === 'pier' ? castAt('pier', 0) : castAt('barkas', entry, 1);
    const kal = reelStats(reelStyleFor(sp('kalmar'), mods), TYPICAL, 200, 3).p;
    t.diagnostic(`${zone}: кальмар ${Math.round(kal * 100)} %`);
    assert.ok(kal > 0 && kal < low.p[T_MYTH], `${zone}: кальмар ${kal} труднее мификов ${low.p[T_MYTH]}`);
  }
  // верх прогресса: ур. 10, третья удочка, золотая блесна — легенды и мифик вытаскиваются заметно чаще
  for (const zone of ['pier', 'barkas'] as const) {
    const low = zone === 'pier' ? pier0 : sea;
    const top = tierSuccess(zone, castAt(zone, 10, 3, 3), TYPICAL, 200, 3);
    t.diagnostic(`${zone}, ур. 10, удочка 3, золото: ${pct(top.p)}`);
    for (let tier = T_EPIC; tier <= T_MYTH; tier++) {
      assert.ok(top.p[tier] > low.p[tier] + (tier === T_EPIC ? 0.05 : 0.15), `${zone}: ур. 10 помогает, категория ${tier}`);
    }
  }
});

// ------------------------------------------------------------ экономика

test('доход новичка у пристани: FISH_TARGET_PER_MIN ±5 % (не больше −20 % к прежним 20,2); очки FISH_POINTS_PER_MIN ±3 %', (t) => {
  assert.equal(COIN_PER_POINT, 13.5 / 13.7, 'старый курс заморожен для +75 % обычным');
  assert.equal(FISH_TARGET_PER_MIN, 17.1);
  const clear = fishIncome(TYPICAL, false);
  const rain = fishIncome(TYPICAL, true);
  const pro = fishIncome(EXPERT, false);
  t.diagnostic(`обычный: ${clear.coins.toFixed(2)} 🪙/мин (очков ${clear.points.toFixed(2)}), в дождь ${rain.coins.toFixed(2)}, опытный ${pro.coins.toFixed(2)}, сундуки +${clear.chest.toFixed(2)}`);
  assert.ok(Math.abs(clear.points / FISH_POINTS_PER_MIN - 1) < 0.03, `очков в минуту ${clear.points.toFixed(2)} — поправь FISH_POINTS_PER_MIN`);
  assert.ok(Math.abs(clear.coins / FISH_TARGET_PER_MIN - 1) < 0.05, `жетонов в минуту ${clear.coins.toFixed(2)}`);
  // 03.10 зона −10 % (владелец: чуть сложнее) — новичок теряет ещё ~8 %: от выпуска 6 −15 %
  assert.ok(clear.coins >= 20.2 * 0.8 && clear.coins <= 20.2, 'новичок платит за трудность не больше 20 % дохода выпуска 6');
  // в дождь заметно выгоднее, опытный зарабатывает больше, но не в разы. 04.10: мифик и кальмар клюют чаще (владелец) —
  // их почти всегда вытаскивает опытный, поэтому его отрыв вырос с ×1,56 до ×1,69 (было «до ×1,6»)
  assert.ok(rain.coins > clear.coins * 1.15 && rain.coins < clear.coins * 1.6, `дождь: ${rain.coins}`);
  assert.ok(pro.coins > clear.coins && pro.coins < clear.coins * 1.75, `опытный: ${pro.coins}`);
  // Сундуки — 3 % поклёвок; у новичка 1 % сундуков — клад Посейдона по 1500 🪙.
  assert.ok(Math.abs(meanBands() / 57.4 - 1.25) < 0.005, `средний сундук по полосам: ${meanBands()}`);
  assert.ok(Math.abs(meanChest() - (0.99 * meanBands() + 0.01 * 1500)) < 1e-9);
  assert.ok(Math.abs(meanChest(8) - (0.98 * meanBands() + 0.02 * 1500)) < 1e-9);
  assert.ok(Math.abs(meanChest(15) - (0.97 * meanBands() + 0.03 * 1500)) < 1e-9);
  const plain = (clear.chest * 0.99 * meanBands()) / meanChest();
  t.diagnostic(`сундуки: ${plain.toFixed(2)} 🪙/мин по полосам и ${(clear.chest - plain).toFixed(2)} 🪙/мин от клада Посейдона`);
  assert.ok(plain > 4 && plain < 7, `сундуки по полосам: ${plain}`);
  assert.ok(clear.chest > 5 && clear.chest < 8, `сундуки вместе с кладом: ${clear.chest}`);
});

test('цены: обычные от исходной целой цены +75 %, остальные откалиброваны; дождевые ×1,5, баркас ×1,25, хлам даром, сундук без множителей', () => {
  const mean: Record<FishZone, number[][]> = { pier: [[], [], [], [], [], []], barkas: [[], [], [], [], [], []] };
  for (const s of COLLECTION) {
    const r = rule(s);
    const f = FISH[s];
    const k = r.rain ? RAIN_NUM / RAIN_DEN : 1;
    const [lo, hi] = priceRange(s);
    const base = (v: number) => r.tier === T_COMMON
      ? Math.round(Math.round(Math.max(1, Math.round(v * COIN_PER_POINT)) * 1.75) * k)
      : Math.max(1, Math.round(v * COIN_PER_POINT * k * FISH_OTHER_PRICE_SCALE));
    // журнал показывает цену вида там, где он ловится: у баркаса — сразу с ×1,25 (одно округление)
    const want = (v: number) => (r.zone === 'barkas' ? Math.round(base(v) * BARKAS_INCOME) : base(v));
    assert.equal(lo, want(r.val[0]), f.id);
    assert.equal(hi, want(r.val[1]), f.id);
    assert.ok(hi > lo);
    const mid = Math.round((f.g[0] + f.g[1]) / 2);
    const mods = r.zone === 'barkas' ? castAt('barkas', BARKAS_LEVEL) : undefined;
    assert.ok(fishPrice2(s, mid, 0, mods) >= lo && fishPrice2(s, mid, 0, mods) <= hi, f.id);
    mean[r.zone][tierRank(r.tier)].push((lo + hi) / 2);
  }
  for (const zone of ['pier', 'barkas'] as const) {
    // божественный кальмар записан за пристанью (ловится и с баркаса) — у баркаса его столбец пуст
    const avg = mean[zone].filter((a) => a.length).map((a) => a.reduce((x, y) => x + y, 0) / a.length);
    for (let i = 1; i < avg.length; i++) assert.ok(avg[i] > avg[i - 1], `${zone}: категория ${i} дороже: ${avg}`);
  }
  assert.equal(fishPrice2(SP_BOOT, 900), 0);
  assert.equal(fishPrice2(SP_BOTTLE, 400), 0);
  assert.equal(fishPrice2(SP_CHEST, 5000, 137), 137);
  assert.equal(fishPrice2(sp('goldfish'), 300), 0, 'золотая рыбка в рыбалке 2.0 не продаётся');
});

test('сундук: 3 % поклёвок, 31–250 🪙 (полосы ×1,25 к прежним), крупное реже, 250 — джекпот, клад Посейдона — 1500; хлам 4,5 %', () => {
  const rng = makeRng(11);
  const N = 400_000;
  let chests = 0;
  let junk = 0;
  for (let i = 0; i < N; i++) {
    const c = rollCatch2(false, rng);
    if (c.sp === SP_CHEST) {
      chests++;
      assert.ok(Number.isInteger(c.coins) && ((c.coins >= 31 && c.coins <= 250) || c.coins === 1500));
    } else {
      assert.equal(c.coins, 0);
      if (c.sp === SP_BOOT || c.sp === SP_BOTTLE) junk++;
    }
  }
  assert.ok(Math.abs(chests / N - CHEST_PER_10K / 10_000) < 0.002, `сундуков ${chests / N}`);
  assert.ok(Math.abs(junk / N - JUNK_PER_10K / 10_000) < 0.002, `хлама ${junk / N}`);
  // полосы: 31–63 — часто, 64–125 — средне, 126–188 — редко, 189–249 — очень редко, 250 — крайне редко
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
  assert.deepEqual(CHEST_BANDS.map(([lo, hi]) => [lo, hi]), [[31, 63], [64, 125], [126, 188], [189, 249], [250, 250]]);
  // все суммы — прежние ×1,25 (с округлением), веса полос те же
  const OLD = [[25, 50, 650], [51, 100, 250], [101, 150, 70], [151, 199, 25], [200, 200, 5]];
  assert.deepEqual(CHEST_BANDS.map(([lo, hi, w]) => [lo, hi, w]), OLD.map(([lo, hi, w]) => [Math.round(lo * 1.25), Math.round(hi * 1.25), w]));
  assert.ok(bands[4] > 0 && bands[4] / M < 0.01, 'джекпот 250 бывает, но крайне редко');
});

test('виды дождя: только в дождь и только у своего места; обычные, редкие и эпические клюют чаще обычных редких, легенды и мифик намеренно редки', () => {
  const fishShare = 1 - (CHEST_PER_10K + JUNK_PER_10K) / 10_000;
  for (const zone of ['pier', 'barkas'] as const) {
    const mods = castAt(zone, zone === 'barkas' ? BARKAS_LEVEL : 0);
    const mine = zoneSpecies(zone);
    const rain = mine.filter((s) => rule(s).rain);
    const rares = mine.filter((s) => rule(s).tier === T_RARE && !rule(s).rain);
    const maxRare = Math.max(...rares.map((s) => biteShare(s, true, mods)));
    for (const s of rain) {
      assert.equal(biteShare(s, false, mods), 0, FISH[s].id);
      if (rule(s).tier <= T_EPIC) assert.ok(biteShare(s, true, mods) > maxRare, `${FISH[s].id} клюёт чаще обычных редких`);
      else assert.ok(biteShare(s, true, mods) < maxRare, `${FISH[s].id}: легенда/миф дождя намеренно редки`);
    }
    for (const s of COLLECTION.filter((x) => !rule(x).zones.includes(zone))) assert.equal(biteShare(s, true, mods), 0, `${FISH[s].id} — не с ${zone}`);
    const rng = makeRng(zone === 'pier' ? 3 : 4);
    const seen = new Map<number, number>();
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      const c = rollCatch2(false, rng, mods);
      assert.ok(!rule(c.sp).rain, 'в ясную погоду дождевые не клюют');
      const d = rollCatch2(true, rng, mods);
      if (isCollected(d.sp)) assert.ok(rule(d.sp).zones.includes(zone), `${zone}: чужая рыба ${FISH[d.sp].id}`);
      seen.set(d.sp, (seen.get(d.sp) ?? 0) + 1);
    }
    for (const s of mine) assert.ok(Math.abs((seen.get(s) ?? 0) / N - biteShare(s, true, mods) * fishShare) < 0.003, FISH[s].id);
    // сумма долей своего места — 1 и в ясную погоду, и в дождь
    for (const r of [false, true]) assert.ok(Math.abs(mine.reduce((x, s) => x + biteShare(s, r, mods), 0) - 1) < 1e-9, `${zone}, дождь ${r}`);
  }
  // эпические в дождь не вытесняют легендарных совсем
  assert.ok(biteShare(sp('sturgeon'), true) > 0.005);
});
