// «Леска провисла» (fisheco): отпустил кнопку надолго — зона ложится на дно; пролежала там дольше 0,7 с, а её не
// подмотали (толчок вверх от PUMP), — надпись «приподними зону», улов не подтягивается и тает. Раньше зона в покое лежала
// внизу и сама вываживала рыбу, которая держится у дна: мифическую белую акулу ловили, вообще не трогая кнопку (и касаясь
// её вслепую). 04.10 (владелец): зона больше не уходит под шкалу — от дна отскакивает по инерции, как от верха.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods } from '../shared/fishprogress.ts';
import {
  BOUNCE_FULL, BOUNCE_SOFT, PUMP, REEL_BAR, SLACK_TICKS, bounceSpeed, reelPulling, reelSlack, reelStart, reelStep, type Reel, type ReelStyle,
} from '../shared/fishreel.ts';
import { COLLECTION, RULE, reelStyleFor } from '../shared/fishrules.ts';
import { AFK, playReel } from './fishbot.ts';

/** Рыба стоит на месте у дна (15 % шкалы), зона 30 % */
const still: ReelStyle = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 0, hi: 30, roam: 2, zone: 30, drain: 10 };

/** Играет по-честному: держит середину зоны на рыбе; зона полежала на дне полсекунды — приподнимает её (подматывает) */
const track = (r: Reel): boolean => r.z + Math.trunc(r.zone / 2) < r.f || r.rest >= 30;

test('леска провисла: без рук и касаясь кнопки вслепую раз в треть секунды не вытащить ни одной рыбы — ни на ур. 0, ни на ур. 10 с лучшими снастями', () => {
  for (const sp of COLLECTION) {
    const zone = RULE[sp]!.zone;
    for (const top of [false, true]) {
      const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[top ? 10 : 0], ...(top ? { rod: 4 as const, lure: 4 as const, questsDone: 15 } : {}) }, 0, zone);
      const style = reelStyleFor(sp, mods);
      for (let i = 0; i < 12; i++) {
        for (const tap of [0, 20]) {
          const r = reelStart(style, 1000 + i * 7919 + sp);
          while (r.done === 0) reelStep(r, tap > 0 && r.t % tap === 0);
          assert.equal(r.done, -1, `${FISH[sp].id} ${top ? 'ур. 10' : 'ур. 0'}, ${tap ? 'касание раз в 20 тиков' : 'без рук'}, сид ${i}`);
        }
      }
      // модель «без рук» — ни одной нажатой кнопки и ни одной рыбы
      const afk = playReel(style, 77 + sp, AFK);
      assert.deepEqual([afk.toggles, afk.caught], [[], false], FISH[sp].id);
    }
  }
});

test('леска провисла: короткий отпуск не наказывается; зона легла на дно и 0,7 с без нажатия — надпись, улов не идёт; нажал — снова натянута', () => {
  const r = reelStart(still, 7);
  for (let i = 0; i < 60; i++) reelStep(r, track(r));
  assert.ok(reelPulling(r), 'рыба в зоне — тянет');
  // подмотал (толкнул зону вверх) и отпустил на треть секунды: зона опустилась, но рыба ещё в ней — тянет, надписи нет
  for (let i = 0; i < 10 && r.zv < PUMP; i++) reelStep(r, true);
  assert.equal(r.rest, 0, 'подмотал — счёт сброшен');
  for (let i = 0; i < 20; i++) {
    reelStep(r, false);
    assert.ok(!reelSlack(r), `тик ${i}: короткий отпуск — не провисла`);
  }
  assert.ok(reelPulling(r), 'после короткого отпуска всё ещё тянет');
  // не нажимает дальше: зона легла на дно шкалы (под него не уходит) — через 0,7 с «леска провисла»
  let lastUp = -1;
  for (let i = 0; i < 400 && !reelSlack(r); i++) {
    if (r.z > 0) lastUp = r.t;
    reelStep(r, false);
    assert.ok(r.z >= 0, 'под шкалу зона не уходит');
  }
  assert.ok(reelSlack(r));
  assert.equal(r.rest, SLACK_TICKS + 1, 'надпись — ровно через 0,7 с лежания на дне');
  assert.ok(r.t - lastUp >= SLACK_TICKS, 'считается с того, как зона легла на дно');
  assert.ok(r.inZone, 'рыба у дна в лежащей зоне — но улов не идёт');
  const p = r.p;
  for (let i = 0; i < 30; i++) reelStep(r, false);
  assert.ok(r.p < p && !r.perfect && !reelPulling(r), 'провисла — рыба в зоне не подтягивается, улов тает, «идеально» уже не будет');
  // касание в один тик зону не подматывает — леска всё ещё провисла
  reelStep(r, true);
  for (let i = 0; i < 5; i++) reelStep(r, false);
  assert.ok(reelSlack(r), 'касание вслепую — не подмотал');
  // держит — зона идёт вверх, разогналась до PUMP — леска снова натянута, улов снова идёт
  for (let i = 0; i < 10 && r.zv < PUMP; i++) reelStep(r, true);
  assert.ok(r.zv >= PUMP, 'держит — зона пошла вверх');
  assert.ok(!reelSlack(r) && r.rest === 0, 'подмотал');
  const q = r.p;
  reelStep(r, false);
  assert.ok(reelPulling(r) && r.p > q, 'рыба в зоне снова подтягивается');
});

test('леска провисла: улов растёт только до провисания, потом тает (без рук не дойти до 100 %)', () => {
  const r = reelStart(still, 11);
  let max = 0;
  while (r.done === 0) {
    reelStep(r, false);
    max = Math.max(max, r.p);
  }
  assert.equal(r.done, -1, 'без рук — сорвалась (за 90 с)');
  assert.ok(max <= 10_000 + 100 * (SLACK_TICKS + 1), `улов рос только до провисания: ${max}`);
});

test('леска провисла: без рук надпись видна заранее — через 0,7 с, до срыва у каждого вида', () => {
  for (const sp of COLLECTION) {
    const r = reelStart(reelStyleFor(sp, fishCastMods(emptyFishProgress(), 0, RULE[sp]!.zone)), 4242 + sp);
    let at = -1;
    while (r.done === 0) {
      reelStep(r, false);
      if (at < 0 && reelSlack(r)) at = r.t;
    }
    assert.ok(at === SLACK_TICKS + 1 && r.t - at >= 12, `${FISH[sp].id}: надпись на ${at}, срыв на ${r.t}`);
  }
});

test('леска провисла: кто держит зону на рыбе у дна — вытаскивает её, как раньше (300 тиков, «идеально»)', () => {
  const r = reelStart(still, 42);
  while (r.done === 0) reelStep(r, track(r));
  assert.equal(r.done, 1);
  assert.equal(r.t, 300);
  assert.ok(r.perfect);
});

test('отскок от дна шкалы растёт со скоростью удара: медленно легла — не отскакивает и лежит на дне (под шкалу не уходит, 04.10), с верха — сильно (03.10, владелец)', () => {
  assert.equal(bounceSpeed(BOUNCE_SOFT - 1), 0);
  assert.equal(bounceSpeed(BOUNCE_SOFT), 0);
  assert.equal(bounceSpeed(BOUNCE_FULL), Math.trunc(BOUNCE_FULL * 3 / 4));
  assert.equal(bounceSpeed(BOUNCE_FULL * 2), BOUNCE_FULL * 3 / 2, 'быстрее полной — те же 3/4');
  let prev = 0;
  for (let v = BOUNCE_SOFT + 50; v <= BOUNCE_FULL; v += 50) {
    const e = bounceSpeed(v) / v;
    assert.ok(e > prev, `коэффициент растёт со скоростью: ${v} → ${e}`);
    prev = e;
  }
  // отпустил кнопку на высоте h (рыба далеко вверху — зона её не задевает): удар о дно и высота отскока
  const still: ReelStyle = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 90, hi: 100, roam: 2, zone: 30, drain: 1 };
  const drop = (h: number): { hit: number; peak: number; under: boolean; lying: boolean } => {
    const r = reelStart(still, 5);
    r.f = REEL_BAR;
    r.z = h;
    let hit = 0, peak = 0, under = false;
    for (let i = 0; i < 400 && r.done === 0; i++) {
      reelStep(r, false);
      if (r.hit > 0 && hit === 0) hit = r.hit;
      else if (hit > 0 && r.hit === 0 && r.zv > 0) peak = Math.max(peak, r.z);
      if (r.z < 0) under = true;
    }
    return { hit, peak, under, lying: r.z === 0 && r.zv === 0 };
  };
  const low = drop(REEL_BAR / 10), mid = drop(REEL_BAR / 4), half = drop(REEL_BAR / 2), top = drop(REEL_BAR - 30_000);
  assert.equal(low.hit, 0, 'с 10 % шкалы — медленно: не отскочила');
  for (const d of [low, mid, half, top]) assert.ok(!d.under && d.lying, 'под шкалу не уходит; в конце ложится на дно (леска провисает)');
  assert.ok(mid.hit > BOUNCE_SOFT && mid.peak > 0 && mid.peak < REEL_BAR / 50, `с четверти — едва подпрыгнула: ${mid.peak}`);
  assert.ok(half.peak > mid.peak * 5, `с середины — заметно: ${half.peak}`);
  assert.ok(top.hit >= BOUNCE_FULL && top.peak > REEL_BAR / 3, `с самого верха — полная скорость и отскок на треть шкалы и выше: ${top.peak}`);
});
