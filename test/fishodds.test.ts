// Шансы рыбалки (патч 04.10): дождь — редкие, эпические, легендарные и мифические ×1,5 к ясной погоде; сезон рыбалки —
// эпические…божественная ×3 от базы (редкие — как в дождь); уровень — +2,5 % за уровень от базы; водка — эпические…
// мифические ×2; пиво подводного владыки — ×1,4 всем от редких; божественная — база мифических / 2,5. Панель «Шансы
// сейчас» складывает ровно те же множители, что бросок сервера. Ещё: сельдяной король тяжелее белой акулы, гренландская
// акула в дождь — и с баркаса, кальмар — везде и в любую погоду; напитки не складываются (действует последний).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  FISH_XP_LEVELS, activeDrink, emptyFishProgress, fishCastMods, fishCatchXp, levelOdds, normalizeFishProgress, rodOdds,
  type FishCastMods, type FishProgress,
} from '../shared/fishprogress.ts';
import {
  DIVINE_RATIO, RAIN_MUL, RULE, SEASON_MUL, T_COMMON, T_DIVINE, T_EPIC, T_LEGEND, T_MYTH, T_RARE, basePrice, biteShare,
  reelStyleFor, rollCatch2, rollWeight, tierOdds, tierOddsParts, tierRank,
} from '../shared/fishrules.ts';
import { LORD, LURES, VODKA } from '../shared/fishshop.ts';
import { makeRng } from '../shared/math.ts';
import { lastOf, login, placeAt, setupHub } from './kit.ts';
import { FISH_NPC_USE } from '../shared/fishplaces.ts';

const sp = (id: string): number => FISH.findIndex((f) => f.id === id);
const near = (a: number, b: number, msg: string, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);
/** Доля категории среди поклёвок рыбы (без хлама и сундука — их доля от уровня своя) */
const fishOf = (odds: number[], t: number) => odds[t] / (1 - odds[5] - odds[6]);
const TOP = [T_RARE, T_EPIC, T_LEGEND, T_MYTH] as const;
const at = (zone: 'pier' | 'barkas', level = 0, extra: Partial<FishProgress> = {}): FishCastMods =>
  fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], ...extra }, 0, zone);

test('дождь: редкие, эпические, легендарные и мифические — ровно ×1,5 к ясной погоде у пристани и на баркасе (раньше легенды и мифик в дождь редели)', () => {
  assert.equal(RAIN_MUL, 1.5);
  for (const zone of ['pier', 'barkas'] as const) {
    for (const mods of [at(zone), at(zone, 5, { questsDone: 5, rod: 2, lure: 2 }), at(zone, 3, { beerUntil: 1e15 })]) {
      const clear = tierOdds(false, mods), rain = tierOdds(true, mods);
      for (const t of TOP) near(rain[t] / clear[t], RAIN_MUL, `${zone} ур. ${mods.level}: категория ${t}`);
      near(rain[T_DIVINE], clear[T_DIVINE], `${zone}: божественной дождь не прибавляет`);
      assert.ok(rain[T_COMMON] < clear[T_COMMON], 'обычных в дождь меньше — им остаток');
      near(rain.reduce((a, b) => a + b, 0), 1, 'сумма');
    }
  }
});

test('сезон рыбалки: эпические, легендарные, мифические и божественная — ×3 от базы, редкие — ×1,5; сезон — сам дождь', () => {
  assert.equal(SEASON_MUL, 3);
  for (const zone of ['pier', 'barkas'] as const) {
    const mods = at(zone);
    const clear = tierOdds(false, mods), season = tierOdds(false, mods, true);
    near(season[T_RARE] / clear[T_RARE], RAIN_MUL, `${zone}: редкие`);
    for (const t of [T_EPIC, T_LEGEND, T_MYTH, T_DIVINE]) near(season[t] / clear[t], SEASON_MUL, `${zone}: категория ${t}`);
    assert.deepEqual(tierOdds(true, mods, true), season, 'сезон и дождь вместе — тот же сезон');
    // виды дождя клюют и в сезон
    for (const s of [sp('greenlandshark'), sp('picarel')]) assert.ok(biteShare(s, false, mods, true) > 0 || !RULE[s]!.zones.includes(zone));
  }
});

test('уровень: +2,5 % за уровень от базы — редкие, эпические, легендарные, мифические и божественная (на 10-м ×1,25); панель показывает это множителем', () => {
  const base = tierOdds(false, at('pier'));
  for (let level = 0; level <= 10; level++) {
    const mods = at('pier', level);
    assert.equal(levelOdds(level), 1 + 0.025 * level);
    near(mods.rareMultiplier, 1 + 0.025 * level, `ур. ${level}`);
    near(mods.zoneScale, 1 + 0.025 * level, `ур. ${level}: зелёная зона`);
    const odds = tierOdds(false, mods);
    for (const t of [...TOP, T_DIVINE]) {
      near(fishOf(odds, t) / fishOf(base, t), 1 + 0.025 * level, `ур. ${level}: категория ${t}`, 1e-9);
      const parts = tierOddsParts(tierRank(t), false, mods);
      near(parts.bonus, 1 + 0.025 * level, `ур. ${level}: множитель на панели`);
      near(parts.now, odds[t], `ур. ${level}: итог на панели — тот же, что у броска`);
      near(parts.now, parts.base * parts.weather * parts.bonus, `ур. ${level}: база × погода × бонусы`);
    }
  }
});

test('водка рыбацкая: 100 жетонов, 10 минут; эпические, легендарные и мифические ×2 (редкие и божественная — нет), зона −20 % (04.10, было −50 %), рывки ×1,2, опыт за эпик…мифик ×2', () => {
  assert.deepEqual([VODKA.price, VODKA.ms, VODKA.top, VODKA.topXp, VODKA.zone, VODKA.jerk, VODKA.income, VODKA.rare], [100, 600_000, 2, 2, 0.8, 1.2, 1, 1]);
  const plain = at('pier', 4);
  const vodka = at('pier', 4, { vodkaUntil: 1e15 });
  assert.equal(vodka.drink, 4);
  assert.equal(vodka.incomeScale, 1, 'цену водка не меняет');
  near(vodka.rareMultiplier, plain.rareMultiplier, 'редкие — как без водки');
  const a = tierOdds(false, plain), b = tierOdds(false, vodka);
  near(b[T_RARE], a[T_RARE], 'редкие');
  for (const t of [T_EPIC, T_LEGEND, T_MYTH]) near(b[t] / a[t], 2, `категория ${t}`);
  near(b[T_DIVINE], a[T_DIVINE], 'божественная — без водки');
  for (const t of [T_EPIC, T_MYTH]) near(tierOddsParts(t, false, vodka).bonus, plain.rareMultiplier * 2, 'панель: ×2 в бонусах');
  // шкала: зона ×0,8, рывки ×1,2 — у рыбы; хлам и сундук как были
  for (const id of ['tuna', 'hamsa', 'kalmar']) {
    const s0 = reelStyleFor(sp(id), plain), s1 = reelStyleFor(sp(id), vodka);
    near(s1.zone, s0.zone * 0.8, `${id}: зона`);
    near(s1.dartSpd, s0.dartSpd * 1.2, `${id}: рывки`, 1e-6);
    near(s1.drain, s0.drain, `${id}: сопротивление то же`);
  }
  // опыт: эпические…мифические ×2, остальные — как были
  for (const id of ['bluefish', 'tuna', 'whiteshark']) {
    const x0 = fishCatchXp(sp(id), undefined, plain), x1 = fishCatchXp(sp(id), undefined, vodka);
    assert.ok(Math.abs(x1 - 2 * x0) <= 1, `${id}: ${x0} → ${x1}`);
  }
  for (const id of ['hamsa', 'mullet', 'kalmar']) assert.equal(fishCatchXp(sp(id), undefined, vodka), fishCatchXp(sp(id), undefined, plain), id);
});

test('пиво подводного владыки работает: редкие, эпические, легендарные, мифические (и божественная) ×1,4 — в ясную погоду и в дождь; в сезон — до потолка; бросок сервера — так же', () => {
  assert.equal(LORD.rare, 1.4);
  const plain = at('pier');
  const lord = at('pier', 0, { lordUntil: 1e15 });
  assert.equal(lord.drink, 3);
  near(lord.rareMultiplier, 1.4, 'множитель');
  near(lord.incomeScale, LORD.income, 'цена');
  for (const rain of [false, true]) {
    const a = tierOdds(rain, plain), b = tierOdds(rain, lord);
    for (const t of [...TOP, T_DIVINE]) near(b[t] / a[t], 1.4, `дождь ${rain}: категория ${t}`);
  }
  // сезон: эпик…божественная ×3 уже забирают почти всех обычных (остаётся ~12 %), пиво сверху упирается в потолок —
  // обычных не остаётся, остальные делят всё в прежних пропорциях; панель показывает то же самое
  const s0 = tierOdds(false, plain, true), s1 = tierOdds(false, lord, true);
  assert.ok(s0[T_COMMON] > 0 && s0[T_COMMON] < 0.2, `сезон: обычных ${s0[T_COMMON]}`);
  assert.equal(s1[T_COMMON], 0, 'сезон с пивом владыки: потолок');
  for (const t of [...TOP, T_DIVINE]) {
    assert.ok(s1[t] > s0[t], `сезон: категория ${t} чаще с пивом`);
    near(tierOddsParts(tierRank(t), false, lord, true).now, s1[t], `сезон: панель = бросок, ${t}`);
  }
  near(s1[T_EPIC] / s1[T_RARE], s0[T_EPIC] / s0[T_RARE], 'потолок не меняет пропорций');
  // сам бросок: 300 тыс. поклёвок с пивом и без — доли категорий как в таблице
  const N = 300_000;
  const count = (mods: FishCastMods) => {
    const rng = makeRng(77);
    const n: Record<number, number> = {};
    for (let i = 0; i < N; i++) {
      const c = rollCatch2(false, rng, mods);
      const t = RULE[c.sp]!.tier;
      n[t] = (n[t] ?? 0) + 1;
    }
    return n;
  };
  const a = count(plain), b = count(lord);
  const odds = tierOdds(false, lord);
  for (const t of [T_RARE, T_EPIC, T_LEGEND]) {
    near(b[t] / N, odds[t], `бросок, категория ${t}`, 0.004);
    assert.ok(Math.abs(b[t] / a[t] - 1.4) < 0.08, `бросок: категория ${t} ×${(b[t] / a[t]).toFixed(3)}`);
  }
  assert.ok(Math.abs(b[T_MYTH] / a[T_MYTH] - 1.4) < 0.2, `бросок: мифические ×${(b[T_MYTH] / a[T_MYTH]).toFixed(3)}`);
});

test('божественная: база — мифические / 2,5 у каждого места; удочка, блесна и пиво её поднимают; сумма шансов — 1 при любом наборе', () => {
  assert.equal(DIVINE_RATIO, 2.5);
  for (const zone of ['pier', 'barkas'] as const) {
    const odds = tierOdds(false, at(zone));
    near(odds[T_DIVINE], odds[T_MYTH] / 2.5, `${zone}: база`);
  }
  // всё сразу: 10-й уровень, легендарная удочка, платиновая блесна, водка или пиво владыки, дождь или сезон
  for (const zone of ['pier', 'barkas'] as const) for (const drink of [{}, { vodkaUntil: 1e15 }, { lordUntil: 1e15 }, { aleUntil: 1e15 }]) {
    for (const [rain, season] of [[false, false], [true, false], [false, true]] as const) {
      const mods = at(zone, 10, { questsDone: 15, rod: 4, lure: 4, ...drink });
      const odds = tierOdds(rain, mods, season);
      near(odds.reduce((x, y) => x + y, 0), 1, `${zone} сумма`);
      assert.ok(odds.every((v) => v >= 0), `${zone}: без отрицательных`);
      for (const t of [...TOP, T_DIVINE]) {
        const p = tierOddsParts(tierRank(t), rain, mods, season);
        near(p.now, odds[t], `${zone} ${t}: панель = бросок`);
      }
    }
  }
  const lure = at('pier', 0, { lure: 4 });
  assert.equal(LURES[3].epic, 1.15);
  near(tierOdds(false, lure)[T_DIVINE] / tierOdds(false, at('pier'))[T_DIVINE], 1.15, 'платиновая блесна');
  near(at('pier', 0, { questsDone: 15, rod: 4 }).rareMultiplier, rodOdds(4), 'легендарная удочка ×1,2');
  assert.equal(rodOdds(4), 1.2);
});

test('кальмар клюёт везде и в любую погоду, до 2,5 т, дороже и опытнее мификов; гренландская акула в дождь — и у пристани, и с баркаса', () => {
  const k = sp('kalmar');
  assert.equal(RULE[k]!.tier, T_DIVINE);
  assert.equal(FISH[k].name, 'Дальневосточный кальмар');
  assert.equal(FISH[k].acc, 'дальневосточного кальмара');
  assert.equal(FISH[k].shape, 'squid');
  assert.equal(FISH[k].g[1], 2_500_000);
  for (const zone of ['pier', 'barkas'] as const) for (const [rain, season] of [[false, false], [true, false], [false, true]] as const) {
    assert.ok(biteShare(k, rain, at(zone), season) > 0, `${zone}, дождь ${rain}, сезон ${season}`);
  }
  // цена — пропорционально редкости: в 2,5 раза реже белой акулы — и в 2,5 раза дороже её (той же доли веса)
  const mid = (s: number) => basePrice(s, Math.round((FISH[s].g[0] + FISH[s].g[1]) / 2));
  assert.ok(Math.abs(mid(k) / mid(sp('whiteshark')) - DIVINE_RATIO) < 0.02, `×${mid(k) / mid(sp('whiteshark'))}`);
  assert.deepEqual(RULE[k]!.val, [500, 1000]);
  for (const m of ['whiteshark', 'greenlandshark', 'oarfish']) {
    assert.ok(mid(k) > mid(sp(m)) * 1.4, `дороже ${m} (у гренландской — с надбавкой дождя ×1,5)`);
    assert.ok(fishCatchXp(k) > fishCatchXp(sp(m)) * 2, `опыта больше, чем за ${m}: ${fishCatchXp(k)} и ${fishCatchXp(sp(m))}`);
  }
  const g = sp('greenlandshark');
  for (const zone of ['pier', 'barkas'] as const) {
    assert.equal(biteShare(g, false, at(zone)), 0, `${zone}: в ясную — нет`);
    assert.ok(biteShare(g, true, at(zone)) > 0, `${zone}: в дождь — клюёт`);
  }
});

test('сельдяной король в среднем на 10–25 % тяжелее большой белой акулы (вес как у броска: лёгкие чаще)', () => {
  const mean = (id: string) => { const f = FISH[sp(id)]; return f.g[0] + (f.g[1] - f.g[0]) / 3; };
  const k = mean('oarfish') / mean('whiteshark');
  assert.ok(k >= 1.1 && k <= 1.25, `по формуле ×${k.toFixed(3)}`);
  const rng = makeRng(5);
  let a = 0, b = 0;
  for (let i = 0; i < 40_000; i++) { a += rollWeight(sp('oarfish'), rng); b += rollWeight(sp('whiteshark'), rng); }
  assert.ok(a / b >= 1.1 && a / b <= 1.25, `броском ×${(a / b).toFixed(3)}`);
});

test('напитки не складываются — действует последний выпитый; старые сохранения без водки читаются, истёкшая снимается', () => {
  const { hub, profiles, clock } = setupHub({ fish2: true });
  const p = login(hub, 'Tester7').c.profile!;
  const now = () => clock.now;
  p.tokens = 1000;
  assert.equal(profiles.buyFishBeer(p), 'ok');
  assert.equal(activeDrink(p.fishing, now()), 1);
  assert.equal(profiles.buyFishVodka(p), 'ok');
  assert.equal(p.tokens, 1000 - 15 - 100);
  assert.equal(activeDrink(p.fishing, now()), 4, 'водка после пива — действует водка');
  assert.equal(p.fishing.beerUntil, 0, 'пиво пропало');
  assert.equal(p.fishing.vodkaUntil, now() + VODKA.ms);
  assert.equal(profiles.buyFishVodka(p), 'active', 'вторая подряд — нет');
  assert.equal(profiles.buyFishAle(p), 'ok', 'эль после водки — можно');
  assert.equal(activeDrink(p.fishing, now()), 2);
  assert.equal(p.fishing.vodkaUntil, undefined, 'водка пропала');
  assert.equal(profiles.buyFishVodka(p), 'ok');
  assert.equal(p.fishing.aleUntil, 0);
  profiles.drinkFishLord(p);
  assert.equal(activeDrink(p.fishing, now()), 3, 'пиво владыки из сундука — последнее выпитое');
  assert.equal(p.fishing.vodkaUntil, undefined);
  assert.equal(profiles.buyFishVodka(p), 'ok', 'водку поверх пива владыки — можно, и владыка пропадает');
  assert.equal(p.fishing.lordUntil, undefined);
  p.tokens = 99;
  clock.now += VODKA.ms + 1;
  assert.equal(activeDrink(p.fishing, now()), 0, 'водка кончилась');
  assert.equal(profiles.buyFishVodka(p), 'no_tokens');
  assert.equal(p.fishing.vodkaUntil, undefined, 'истёкшая снята');
  // у Семёна — тем же действием, что пиво и эль
  p.tokens = 100;
  const u = FISH_NPC_USE.semyon!;
  const me = login(hub, 'Tester8');
  me.c.profile!.tokens = 100;
  placeAt(hub, me.c, u.x, u.z, u.y);
  clock.now += 1100;
  hub.onJson(me.c, { t: 'fishNpc', npc: 'semyon', a: 'vodka' });
  assert.match(lastOf(me.s, 'fishNpc')!.message!, /Водка рыбацкая действует 10 минут/);
  assert.equal(me.c.profile!.tokens, 0);
  // старое сохранение: поля нет — и не появляется; число — читается
  const old = normalizeFishProgress({ xp: 500, questsDone: 3, rod: 1, beerUntil: 0 });
  assert.equal('vodkaUntil' in old, false);
  assert.equal(normalizeFishProgress({ ...old, vodkaUntil: 123_456 }).vodkaUntil, 123_456);
  assert.equal('vodkaUntil' in normalizeFishProgress({ ...old, vodkaUntil: -5 }), false);
});
