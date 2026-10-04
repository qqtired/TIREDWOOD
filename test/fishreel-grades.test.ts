// Оценка вываживания (04.10, владелец): ошибка — рыба вышла из зоны (по одной за выход); 0 — «Идеально» ×2,5,
// 1 — «Хорошо» ×1,5, 2–3 — «Сойдёт» ×1,25, 4–9 — «Обычное вываживание» ×1, 10 и больше — «Ну ты и червь» ×0,5 —
// множитель к прежнему опыту за улов. Ошибки считает сервер, повторяя то же вываживание, что сыграл клиент.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { fishCatchXp, fishLostXp } from '../shared/fishprogress.ts';
import {
  GRADE_PLAIN, REEL_GRADES, REEL_MAX_TICKS, gradeXp, reelGrade, reelRun, reelStart, reelStep, zoneCovers, type ReelStyle,
} from '../shared/fishreel.ts';
import { CONSOLATION_TICKS, RULE, reelStyleFor } from '../shared/fishrules.ts';
import { TYPICAL, playReel } from './fishbot.ts';
import { catchWith, fisher, sloppy } from './fishreelkit.ts';

const sp = (id: string): number => FISH.findIndex((f) => f.id === id);

test('оценки по числу ошибок: 0, 1, 2, 3, 4, 7, 8, 9, 10 — как сказал владелец (8–9 — «Обычное вываживание»)', () => {
  const cases: Array<[number, string, number]> = [
    [0, 'Идеально', 2.5], [1, 'Хорошо', 1.5], [2, 'Сойдёт', 1.25], [3, 'Сойдёт', 1.25], [4, 'Обычное вываживание', 1],
    [7, 'Обычное вываживание', 1], [8, 'Обычное вываживание', 1], [9, 'Обычное вываживание', 1], [10, 'Ну ты и червь', 0.5],
    [37, 'Ну ты и червь', 0.5],
  ];
  for (const [err, name, xp] of cases) {
    const g = reelGrade(err);
    assert.equal(REEL_GRADES[g].name, name, `${err} ошибок`);
    assert.equal(gradeXp(g), xp, `${err} ошибок`);
  }
  assert.equal(REEL_GRADES.length, 5);
  assert.equal(reelGrade(-1), 0, 'кривое число — без ошибок');
  assert.equal(reelGrade(Number.NaN), 0);
  assert.equal(GRADE_PLAIN, reelGrade(5));
  assert.equal(gradeXp(99), 1, 'неизвестная оценка — ×1');
});

test('опыт за улов = прежняя формула × множитель оценки, одно округление; утешение за сорвавшуюся — без оценки', () => {
  // ставрида: 17 → ×0,4 = 6,8; тунец (легенда): 34 × 5 = 170 → ×0,4 = 68
  const hamsa = sp('hamsa'), tuna = sp('tuna');
  assert.deepEqual([0, 1, 2, 3, 4].map((g) => fishCatchXp(hamsa, g as 0)), [17, 10, 9, 7, 3]);
  assert.deepEqual([0, 1, 2, 3, 4].map((g) => fishCatchXp(tuna, g as 0)), [170, 102, 85, 68, 34]);
  assert.equal(fishCatchXp(tuna), fishCatchXp(tuna, GRADE_PLAIN), 'без оценки — ×1');
  assert.equal(fishCatchXp(sp('boot'), 0), 0, 'хлам опыта не даёт и с оценкой');
  assert.equal(fishLostXp(tuna, CONSOLATION_TICKS), Math.max(1, Math.round(68 * 0.25)), 'утешение — от ×1');
  // множители перемножаются: баркас, дождь и водка — те же, что и раньше
  const mods = { zone: 'barkas' as const, drink: 4 as const };
  const plain = fishCatchXp(sp('mako'), GRADE_PLAIN, mods, true);
  assert.ok(Math.abs(fishCatchXp(sp('mako'), 0, mods, true) - plain * 2.5) <= 1);
  assert.ok(Math.abs(fishCatchXp(sp('mako'), 4, mods, true) - plain * 0.5) <= 1);
});

/** Рыба стоит на 15 % шкалы, зона 30 % (лежит на дне — накрывает 0…30 %) */
const still: ReelStyle = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 15, hi: 15, roam: 2, zone: 30, drain: 1 };

test('ошибка — каждый выход рыбы из зоны: долго вне зоны — всё равно одна; вернулась и снова вышла — вторая', () => {
  const r = reelStart(still, 5);
  // держит, пока зона не уйдёт выше рыбы, — первая ошибка; ещё держит (рыба далеко внизу) — не прибавляется
  while (r.inZone) reelStep(r, true);
  assert.equal(r.err, 1);
  for (let i = 0; i < 40; i++) reelStep(r, true);
  assert.equal(r.err, 1, 'долго вне зоны — одна ошибка');
  // отпустил — зона падает и накрывает рыбу; снова держит — снова вышла
  while (!r.inZone) reelStep(r, false);
  assert.equal(r.err, 1, 'вернулась в зону — без ошибки');
  while (r.inZone) reelStep(r, true);
  assert.equal(r.err, 2);
  // счёт сходится с переходами «в зоне → вне» на каждом тике
  const q = reelStart(still, 5);
  let exits = 0;
  for (let t = 0; t < 600 && q.done === 0; t++) {
    const was = zoneCovers(q);
    reelStep(q, t % 90 < 40);
    if (was && !q.inZone) exits++;
  }
  assert.equal(q.err, exits);
});

test('ошибки клиента и повтора сервера (кусками, как приходят сообщения) совпадают у каждого вида', () => {
  for (const id of ['scad', 'bluefish', 'tuna', 'mako', 'kalmar']) {
    const style = reelStyleFor(sp(id));
    for (const seed of [3, 77, 1001]) {
      const play = playReel(style, seed, TYPICAL);
      const server = reelStart(style, seed);
      let k = 0;
      for (let u = 15; server.done === 0 && u < REEL_MAX_TICKS + 15; u += 15) k = reelRun(server, play.toggles, Math.min(u, play.ticks), k);
      assert.deepEqual([server.done === 1, server.err, server.t], [play.caught, play.err, play.ticks], `${id}, сид ${seed}`);
    }
  }
});

// ------------------------------------------------------------ сервер: улов с оценкой

test('сервер: оценка и опыт — по ошибкам того же вываживания (gr, er в fishLand), опыт в профиле — тот же', () => {
  for (const [min, max] of [[0, 0], [2, 3], [10, 99]] as const) {
    const e = fisher({ sp: sp('bluefish'), g: 2000, coins: 0 });
    const xp0 = e.a.c.profile!.fishing.xp;
    const { play, land } = catchWith(e, sloppy(min, max));
    assert.ok(land, `улов засчитан (${play.err} ошибок)`);
    assert.equal(land.er, play.err);
    assert.equal(land.gr, reelGrade(play.err));
    assert.equal(land.xp, fishCatchXp(sp('bluefish'), reelGrade(play.err)));
    assert.equal(e.a.c.profile!.fishing.xp, xp0 + land.xp!);
    assert.ok(!('perfect' in land), 'прежнего «perfect» больше нет');
  }
});

test('сервер: сундук и хлам — без оценки (опыта за них нет)', () => {
  const e = fisher({ sp: sp('boot'), g: 900, coins: 0 });
  const { land } = catchWith(e, sloppy(0, 99));
  assert.ok(land);
  assert.equal(land.gr, undefined);
  assert.equal(land.er, undefined);
  assert.equal(RULE[sp('boot')]!.tier, 5);
});
