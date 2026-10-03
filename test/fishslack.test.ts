// «Леска провисла» (fisheco): отпустил кнопку надолго — зона уходит под шкалу и рыбу у дна не держит; пролежала там
// дольше 0,7 с — надпись «подматывай», улов не идёт. Раньше зона в покое лежала внизу и сама вываживала рыбу, которая
// держится у дна: мифическую белую акулу ловили, вообще не трогая кнопку (и касаясь её вслепую).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods } from '../shared/fishprogress.ts';
import { SLACK_TICKS, reelPulling, reelSlack, reelStart, reelStep, type Reel, type ReelStyle } from '../shared/fishreel.ts';
import { COLLECTION, RULE, reelStyleFor } from '../shared/fishrules.ts';
import { AFK, playReel } from './fishbot.ts';

/** Рыба стоит на месте у дна (15 % шкалы), зона 30 % */
const still: ReelStyle = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 0, hi: 30, roam: 2, zone: 30, drain: 10 };

/** Играет по-честному: держит середину зоны на рыбе */
const track = (r: Reel): boolean => r.z + Math.trunc(r.zone / 2) < r.f;

test('леска провисла: без рук и касаясь кнопки вслепую раз в треть секунды не вытащить ни одной рыбы — ни на ур. 0, ни на ур. 10 с лучшими снастями', () => {
  for (const sp of COLLECTION) {
    const zone = RULE[sp]!.zone;
    for (const top of [false, true]) {
      const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[top ? 10 : 0], ...(top ? { rod: 3 as const, lure: 3 as const, questsDone: 10 } : {}) }, 0, zone);
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

test('леска провисла: короткий отпуск не наказывается; зона целиком под шкалой дольше 0,7 с — надпись, улов тает; нажал — снова натянута', () => {
  const r = reelStart(still, 7);
  for (let i = 0; i < 60; i++) reelStep(r, track(r));
  assert.ok(reelPulling(r), 'рыба в зоне — тянет');
  // отпустил на треть секунды: зона опустилась, но рыба ещё в ней — тянет, надписи нет
  for (let i = 0; i < 20; i++) {
    reelStep(r, false);
    assert.ok(!reelSlack(r), `тик ${i}: короткий отпуск — не провисла`);
  }
  assert.ok(reelPulling(r), 'после короткого отпуска всё ещё тянет');
  // отпустил надолго: зона целиком ушла под шкалу (от дна под шкалой ещё отскакивает) — пролежала там 0,7 с подряд,
  // и только тогда «леска провисла»
  let under = -1;
  for (let i = 0; i < 400 && !reelSlack(r); i++) {
    reelStep(r, false);
    if (r.rest === 1) under = r.t;
    if (r.rest > 0) assert.ok(r.z + r.zone <= 0, 'считается только время целиком под шкалой');
  }
  assert.ok(under > 0, 'зона ушла под шкалу');
  assert.ok(reelSlack(r));
  assert.equal(r.t - under, SLACK_TICKS, 'надпись — ровно через 0,7 с под шкалой подряд');
  const p = r.p;
  reelStep(r, false);
  assert.ok(r.p < p && !r.perfect && !reelPulling(r), 'провисла — улов тает, «идеально» уже не будет');
  // нажал — леска снова натянута, зона идёт вверх
  reelStep(r, true);
  assert.ok(!reelSlack(r) && r.rest === 0 && r.zv > 0);
});

test('леска провисла: кто держит зону на рыбе у дна — вытаскивает её, как раньше (300 тиков, «идеально»)', () => {
  const r = reelStart(still, 42);
  while (r.done === 0) reelStep(r, track(r));
  assert.equal(r.done, 1);
  assert.equal(r.t, 300);
  assert.ok(r.perfect);
});
