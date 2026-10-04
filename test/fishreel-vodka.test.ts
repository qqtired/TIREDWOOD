// Водка на шкале (04.10, владелец): зона −20 % (было −50 %); отпустил кнопку — зона ещё 0,1 с едет по инерции; икота —
// раз в 5–10 с зону толкает вверх. Это часть общей модели (shared/fishreel.ts): одинаково от сида у клиента и сервера.
// Моргание шкалы, покачивание и «двоится» — только на экране (client/lobby/fishgame.ts), модель не меняют.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { emptyFishProgress, fishCastMods } from '../shared/fishprogress.ts';
import {
  DRUNK_LAG, HIC_EVERY, HIC_FIRST, HIC_KICK, REEL_MAX_TICKS, reelGrade, reelRun, reelStart, reelStep, type ReelStyle,
} from '../shared/fishreel.ts';
import { RULE, SP_BOOT, reelStyleFor } from '../shared/fishrules.ts';
import { VODKA } from '../shared/fishshop.ts';
import { EXPERT, playReel } from './fishbot.ts';
import { catchWith, fisher, sloppy } from './fishreelkit.ts';

const sp = (id: string): number => FISH.findIndex((f) => f.id === id);
const vodka = fishCastMods({ ...emptyFishProgress(), vodkaUntil: 1e15 }, 0);

test('водка: зона −20 % (было −50 %) — у рыбы; у хлама зона та же', () => {
  assert.equal(VODKA.zone, 0.8);
  assert.equal(vodka.drink, 4);
  assert.equal(vodka.zoneMul, 0.8);
  for (const id of ['hamsa', 'tuna', 'kalmar']) {
    const plain = reelStyleFor(sp(id)).zone;
    assert.ok(Math.abs(reelStyleFor(sp(id), vodka).zone - plain * 0.8) < 1e-9, id);
  }
  assert.equal(reelStyleFor(SP_BOOT, vodka).zone, reelStyleFor(SP_BOOT).zone);
});

/** Рыба стоит в середине, зона 20 % — следим только за зоной */
const still: ReelStyle = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 50, hi: 50, roam: 2, zone: 20, drain: 1 };

test('водка: отпустил кнопку — зона ещё 0,1 с (6 тиков) едет по инерции с той же скоростью, потом как обычно', () => {
  assert.equal(DRUNK_LAG, 6);
  const drunk = reelStart(still, 9, true);
  const sober = reelStart(still, 9);
  assert.ok(drunk.hic >= HIC_FIRST && drunk.hic <= HIC_FIRST + HIC_EVERY, `первая икота через 2–7 с: ${drunk.hic}`);
  // держит 30 тиков — одинаково; отпустил — у трезвого зона сразу тормозит, у пьяного 6 тиков едет с той же скоростью
  for (let t = 0; t < 30; t++) {
    reelStep(drunk, true);
    reelStep(sober, true);
  }
  assert.deepEqual([drunk.z, drunk.zv], [sober.z, sober.zv]);
  const v = drunk.zv;
  const z0 = drunk.z;
  for (let i = 0; i < DRUNK_LAG; i++) {
    reelStep(drunk, false);
    reelStep(sober, false);
    assert.equal(drunk.zv, v, `тик ${i}: по инерции`);
    assert.ok(sober.zv < v, 'трезвый тормозит сразу');
  }
  assert.equal(drunk.z, z0 + DRUNK_LAG * v, 'пьяный проехал 0,1 с с той же скоростью');
  assert.ok(drunk.z > sober.z, `пьяный уехал дальше: ${drunk.z} против ${sober.z}`);
  reelStep(drunk, false);
  assert.ok(drunk.zv < v, 'через 0,1 с — тормозит, как обычно');
  // нажал снова раньше 0,1 с — снова держит сразу (задержки на нажатие нет)
  const again = reelStart(still, 9, true);
  for (let t = 0; t < 30; t++) reelStep(again, true);
  reelStep(again, false);
  const w = again.zv;
  reelStep(again, true);
  assert.ok(again.zv > w, 'нажал — зона сразу идёт вверх');
});

test('водка: икота по сиду — раз в 5–10 с зону толкает вверх; одинаково при повторе (как у сервера)', () => {
  const a = reelStart(still, 1234, true);
  const b = reelStart(still, 1234, true);
  const hics: number[] = [];
  let next = a.hic;
  for (let t = 0; t < 3000; t++) {
    const zv = a.zv;
    const held = t % 50 < 20;
    reelStep(a, held);
    reelStep(b, held);
    a.done = b.done = 0;
    a.p = b.p = 20_000;
    if (a.hic !== next) {
      hics.push(t);
      assert.equal(t, next, 'икнул ровно в назначенный тик');
      // толчок вверх — сверх обычного ускорения (у верха зона упирается и сразу отскакивает — там толчок не виден)
      if (a.z > 0 && a.z < 100_000 - a.zone) assert.ok(a.zv - zv >= HIC_KICK - 34, `толчок: ${zv} → ${a.zv}`);
      next = a.hic;
    }
  }
  assert.deepEqual(a, b, 'повтор бит в бит');
  assert.ok(hics.length >= 5, `икот за 50 с: ${hics.length}`);
  for (let i = 1; i < hics.length; i++) {
    const gap = hics[i] - hics[i - 1];
    assert.ok(gap >= HIC_EVERY && gap <= 2 * HIC_EVERY, `между икотами 5–10 с: ${gap}`);
  }
  // трезвый не икает
  const sober = reelStart(still, 1234);
  assert.equal(sober.hic, 0);
});

test('водка: рыба ходит так же, как без неё (свой генератор икоты) — меняется только зона', () => {
  const style = { ...RULE[sp('bluefish')]!.style, lastStand: undefined };
  const toggles = [0, 40, 70, 130, 160, 220, 260, 330];
  const a = reelStart(style, 77, true), b = reelStart(style, 77);
  for (let t = 0; t < 600; t++) {
    const held = toggles.filter((x) => x <= t).length % 2 === 1;
    reelStep(a, held);
    reelStep(b, held);
    a.done = b.done = 0;
    a.p = b.p = 20_000;
    assert.equal(a.f, b.f, `тик ${t}`);
  }
});

test('водка: смешно, а не невозможно — «опытный» пьяным вытаскивает эпическую реже, но больше половины; повтор кусками совпадает', () => {
  const style = reelStyleFor(sp('bluefish'), vodka);
  let caughtDrunk = 0, caughtSober = 0;
  for (let i = 0; i < 60; i++) {
    const seed = 900 + i * 7919;
    const d = playReel(style, seed, EXPERT, seed ^ 0x5bd1e995, true);
    if (d.caught) caughtDrunk++;
    if (playReel(style, seed, EXPERT).caught) caughtSober++;
    const server = reelStart(style, seed, true);
    let k = 0;
    for (let u = 15; server.done === 0 && u < REEL_MAX_TICKS + 15; u += 15) k = reelRun(server, d.toggles, Math.min(u, d.ticks), k);
    assert.deepEqual([server.done === 1, server.err, server.t], [d.caught, d.err, d.ticks], `сид ${seed}`);
  }
  assert.ok(caughtDrunk >= 30 && caughtDrunk < caughtSober, `пьяный ${caughtDrunk}, трезвый ${caughtSober} из 60`);
});

test('сервер: с водкой повторяет вываживание пьяным — засчитывает улов и ошибки того, кто играл пьяным', () => {
  const e = fisher({ sp: sp('bluefish'), g: 2000, coins: 0 });
  e.a.c.profile!.fishing.vodkaUntil = e.clock.now + VODKA.ms;
  const { play, land, mods, style, seed } = catchWith(e, sloppy(1, 99, EXPERT));
  assert.equal(mods.drink, 4, 'заброс с водкой');
  assert.ok(land, 'улов засчитан');
  assert.equal(land.er, play.err);
  assert.equal(land.gr, reelGrade(play.err));
  // те же нажатия у трезвой модели дали бы другое вываживание — значит, сервер считал пьяным
  const sober = reelStart(style, seed);
  reelRun(sober, play.toggles, play.ticks);
  assert.notDeepEqual([sober.done, sober.err, sober.t, sober.z], [1, play.err, play.ticks, (() => {
    const d = reelStart(style, seed, true);
    reelRun(d, play.toggles, play.ticks);
    return d.z;
  })()]);
});
