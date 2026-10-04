// Края шкалы (04.10, владелец): рыба держится в 2…98 % высоты поля — лежащую на дне рыбу можно подматывать, не выпуская
// из зоны (раньше подмотка у дна сбивала «идеально»). «Натяжение лески» — зеркало «леска провисла»: зону держат
// прижатой к верху дольше 0,7 с — улов не подтягивается и тает (в чат — «Леска слишком натянута, возможен обрыв!»).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  FISH_EDGE, PUMP, REEL_BAR, TAUT_TICKS, reelPulling, reelSlack, reelStart, reelStep, reelTaut, type ReelStyle,
} from '../shared/fishreel.ts';
import { COLLECTION, RULE } from '../shared/fishrules.ts';
import { makeRng } from '../shared/math.ts';

test('рыба не опускается ниже 2 % и не поднимается выше 98 % поля — у каждого вида, при любых нажатиях', () => {
  assert.equal(FISH_EDGE, REEL_BAR / 50);
  for (const sp of COLLECTION) {
    for (const seed of [1, 99, 4242]) {
      const r = reelStart(RULE[sp]!.style, seed);
      const me = makeRng(seed);
      let held = false, lo = REEL_BAR, hi = 0;
      for (let t = 0; t < 3000 && r.done === 0; t++) {
        if (me() < 0.08) held = !held;
        reelStep(r, held);
        r.done = 0; // держим бой, чтобы рыба успела побывать у обоих краёв
        r.p = 20_000;
        lo = Math.min(lo, r.f);
        hi = Math.max(hi, r.f);
        assert.ok(r.f >= FISH_EDGE && r.f <= REEL_BAR - FISH_EDGE, `${FISH[sp].id}: ${r.f}`);
        assert.ok(r.ft >= FISH_EDGE && r.ft <= REEL_BAR - FISH_EDGE, `${FISH[sp].id}: цель ${r.ft}`);
      }
    }
  }
  // «к краю и назад» доходит до 98 % / 2 % (подплывает плавно — до сотых долей процента)
  for (const dir of [1, -1]) {
    const style: ReelStyle = { ...RULE[COLLECTION[0]]!.style, mainPattern: 'EdgeSnapback', secondaryPattern: 'EdgeSnapback', patternPeriod: 400 };
    const r = reelStart(style, 3);
    Object.assign(r, { patternTick: 0, patternCycle: 1, patternLength: 400, patternAnchor: 50_000, patternDir: dir, f: 50_000, timer: 0 });
    for (let i = 0; i < 230; i++) {
      r.done = 0;
      r.p = 20_000;
      reelStep(r, false);
    }
    const edge = dir > 0 ? REEL_BAR - FISH_EDGE : FISH_EDGE;
    assert.ok(Math.abs(r.f - edge) <= 100, `${r.f}`);
  }
});

/** Неподвижная рыба, зона 20 %; где она — ставит тест (у самого дна — 2 %, у самого верха — 98 %, зона — на ней) */
const still: ReelStyle = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 0, hi: 100, roam: 2, zone: 20, drain: 10 };
const at = (f: number, seed: number) => {
  const r = reelStart(still, seed);
  r.f = r.ft = f;
  if (f > REEL_BAR / 2) r.z = REEL_BAR - r.zone;
  return r;
};

test('рыба на дне: зона лежит на ней, подмотка раз в полсекунды рыбу из зоны не выпускает — вытащил без ошибок', () => {
  const r = at(FISH_EDGE, 8);
  let pumps = 0;
  let pump = false;
  while (r.done === 0) {
    // зона пролежала на дне полсекунды — подмотать: держать, пока не разгонится до PUMP, и отпустить
    if (!pump && r.rest >= 30) {
      pump = true;
      pumps++;
    } else if (pump && r.zv >= PUMP) pump = false;
    reelStep(r, pump);
    assert.ok(!reelSlack(r), 'подматывает вовремя — леска не провисает');
  }
  assert.equal(r.done, 1);
  assert.ok(pumps >= 5, `подматывал: ${pumps}`);
  assert.equal(r.err, 0, 'подмотка у дна рыбу из зоны не выпускает — «Идеально»');
});

test('натяжение лески: держит зону прижатой к верху — через 0,7 с улов не идёт и тает; короткое прижатие не наказывается', () => {
  const r = at(REEL_BAR - FISH_EDGE, 4);
  // зона поднимается к верху и прижимается
  let pinnedAt = -1;
  for (let i = 0; i < 400 && !reelTaut(r); i++) {
    reelStep(r, true);
    if (pinnedAt < 0 && r.z === REEL_BAR - r.zone) pinnedAt = r.t;
  }
  assert.ok(reelTaut(r));
  assert.equal(r.taut, TAUT_TICKS + 1, 'надпись и чат — ровно через 0,7 с прижатия');
  assert.equal(r.t - pinnedAt, TAUT_TICKS, 'считается с того, как зону прижали к верху');
  assert.ok(r.inZone, 'рыба у верха в зоне — но улов не идёт');
  const p = r.p;
  for (let i = 0; i < 30; i++) reelStep(r, true);
  assert.ok(r.p < p && !reelPulling(r), 'натянута — улов тает');
  assert.equal(r.err, 0, 'натяжение — не ошибка: рыба из зоны не выходила');
  // отпустил на миг (1 тик) — не ослабил; отпустил, пока зона не пошла вниз быстрее PUMP, — ослабил, рыба всё ещё в зоне
  reelStep(r, false);
  reelStep(r, true);
  assert.ok(reelTaut(r), 'отпустил на один тик — всё ещё натянута');
  while (r.zv > -PUMP) reelStep(r, false);
  assert.ok(!reelTaut(r) && r.taut === 0, 'ослабил');
  assert.ok(r.inZone && reelPulling(r) && r.err === 0, 'рыба у верха (98 %) осталась в зоне');
  const q = r.p;
  reelStep(r, true);
  assert.ok(r.p > q, 'снова тянет');
  // короткие прижатия (меньше 0,7 с) с отпусканием — без натяжения и без ошибок, рыба вытащена
  let hold = true;
  while (r.done === 0) {
    if (hold && r.taut >= 30) hold = false;
    else if (!hold && r.taut === 0) hold = true;
    reelStep(r, hold);
    assert.ok(!reelTaut(r));
  }
  assert.equal(r.done, 1);
  assert.equal(r.err, 0);
});

test('натяжение лески: кто просто держит кнопку, рыбу у верха не вытащит (как без рук — у дна)', () => {
  for (const seed of [1, 2, 3]) {
    const r = at(REEL_BAR - FISH_EDGE, seed);
    let max = 0;
    while (r.done === 0) {
      reelStep(r, true);
      max = Math.max(max, r.p);
    }
    assert.equal(r.done, -1, `сид ${seed}: держал не отпуская — сорвалась`);
    assert.ok(max < 20_000, `улов рос только до натяжения: ${max}`);
  }
});
