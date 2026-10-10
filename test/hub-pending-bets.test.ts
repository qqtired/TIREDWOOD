// Регрессия внешнего цикла: он вызывает step только пока hub.active, как server/main.ts.
// Прямые тики комнаты скрывают остановку выплат после ухода последнего игрока.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { ROULETTE_SPOT } from '../shared/fishplaces.ts';
import { RAT_OPEN_MAX_MS, RAT_RUN_MS, RAT_USE } from '../shared/ratrace.ts';
import { ROULETTE_OPEN_MS, ROULETTE_SPIN_MS } from '../shared/roulette.ts';
import { SMOKE, login, placeAt } from './kit.ts';

function setup(t: TestContext, mode: 'roulette' | 'ratrace') {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-pending-bets-'));
  const clock = { now: Date.UTC(2026, 9, 10, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({
    store, profiles, now: () => clock.now, log: () => {}, weather: 'clear', smokeToken: SMOKE, build: 'test',
    fish2: mode === 'roulette', roulette: mode === 'roulette', ratrace: mode === 'ratrace',
  });
  const advance = (ms: number): void => {
    const end = clock.now + ms;
    while (clock.now < end) {
      clock.now = Math.min(end, clock.now + Math.round(1000 / TICK_RATE));
      if (hub.active) hub.step();
    }
  };
  const player = (n: number) => {
    const who = login(hub, `Tester${n}`, undefined, `10.0.7.${n}`);
    who.c.profile!.tokens = 2000;
    return who;
  };
  return { hub, advance, player };
}

function expectSleeping(hub: Hub, advance: (ms: number) => void): void {
  assert.equal(hub.active, false, 'после расчёта пустой сервер возвращается в сон');
  const tick = hub.tick;
  advance(60_000);
  assert.equal(hub.tick, tick, 'без игроков и незавершённых ставок цикл не тикает');
}

const fish = (price: number) => ({ n: 0, f: 'tuna', g: 30_000, p: price, m: 0 });

for (const count of [1, 2]) {
  const leaving = count === 1 ? 'последнего игрока' : 'обоих игроков';
  test(`внешний цикл: рулетка завершает вращение после ухода ${leaving}`, t => {
    const { hub, advance, player } = setup(t, 'roulette');
    const who = Array.from({ length: count }, (_, i) => player(i + 7));
    const table = hub.lobby.roulette!;
    table.spin = () => 1; // Красное: первая ставка выигрывает 120 × 2, вторая проигрывает.
    who.forEach((w, i) => {
      w.c.profile!.fishing.bag = [fish(i === 0 ? 120 : 50)];
      placeAt(hub, w.c, ROULETTE_SPOT.x + 1, ROULETTE_SPOT.z + (i ? -1 : 1), ROULETTE_SPOT.y);
    });
    who.forEach((w, i) => hub.onJson(w.c, { t: 'roulette', a: 'bet', c: i === 0 ? 'red' : 'black' }));
    assert.equal(table.view().phase, 'spin');
    assert.deepEqual(who.map(w => w.c.profile!.rouletteEscrow?.amount), count === 1 ? [120] : [120, 50]);
    who.forEach(w => hub.disconnect(w.c));
    assert.equal(hub.lobby.humans, 0);

    advance(ROULETTE_SPIN_MS + 100);
    assert.equal(table.view().phase, 'idle', 'внешний active не должен остановить расчёт');
    assert.deepEqual(who.map(w => w.c.profile!.tokens), count === 1 ? [2240] : [2240, 2000]);
    who.forEach(w => assert.equal(w.c.profile!.rouletteEscrow, null));
    assert.equal(table.history().length, count, 'каждая ставка рассчитана один раз');
    expectSleeping(hub, advance);

    const back = login(hub, 'Tester7', who[0].key);
    advance(ROULETTE_SPIN_MS + 100);
    assert.equal(back.c.profile!.tokens, 2240, 'возобновление цикла не повторяет выплату');
    assert.equal(table.history().length, count);
  });

  test(`внешний цикл: крысиные бега завершаются после ухода ${leaving}`, t => {
    const { hub, advance, player } = setup(t, 'ratrace');
    const who = Array.from({ length: count }, (_, i) => player(i + 7));
    const track = hub.lobby.ratrace!;
    track.rand = () => 0; // Первый билет всегда выбирает крысу №0.
    const winnerTokens = 1900 + 100 * track.view().odds[0];
    who.forEach((w, i) => {
      placeAt(hub, w.c, RAT_USE.x, RAT_USE.z - 0.9);
      hub.onJson(w.c, { t: 'rat', a: 'bet', rat: i, amount: i === 0 ? 100 : 40, race: track.view().race });
    });
    assert.equal(track.view().phase, 'open');
    assert.deepEqual(who.map(w => w.c.profile!.ratEscrow?.amount), count === 1 ? [100] : [100, 40]);
    // Одиночный игрок уходит во время приёма ставок, двое — уже во время забега.
    if (count === 2) {
      advance(track.view().left + 100);
      assert.equal(track.view().phase, 'run');
    }
    who.forEach(w => hub.disconnect(w.c));
    assert.equal(hub.lobby.humans, 0);

    advance(RAT_OPEN_MAX_MS + RAT_RUN_MS + 100);
    assert.equal(track.view().phase, 'idle', 'внешний active не должен остановить расчёт');
    assert.equal(track.view().race, 2, 'рассчитан ровно один забег');
    assert.equal(track.view().last!.order[0], 0);
    assert.deepEqual(who.map(w => w.c.profile!.tokens), count === 1 ? [winnerTokens] : [winnerTokens, 1960]);
    who.forEach(w => assert.equal(w.c.profile!.ratEscrow, null));
    expectSleeping(hub, advance);

    const back = login(hub, 'Tester7', who[0].key);
    advance(RAT_RUN_MS + 100);
    assert.equal(back.c.profile!.tokens, winnerTokens, 'возобновление цикла не повторяет выплату');
    assert.equal(track.view().race, 2);
  });
}

test('внешний цикл: рулетка закрывает приём ставок, когда оба игрока ушли до вращения', t => {
  const { hub, advance, player } = setup(t, 'roulette');
  const a = player(7), b = player(8);
  const table = hub.lobby.roulette!;
  table.spin = () => 1;
  for (const w of [a, b]) {
    w.c.profile!.fishing.bag = [fish(120)];
    placeAt(hub, w.c, ROULETTE_SPOT.x + 1, ROULETTE_SPOT.z + 1, ROULETTE_SPOT.y);
  }
  hub.onJson(a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(table.view().phase, 'open', 'второй игрок у стола ещё не поставил');
  hub.disconnect(a.c);
  hub.disconnect(b.c);
  assert.equal(hub.lobby.humans, 0);

  advance(ROULETTE_OPEN_MS + ROULETTE_SPIN_MS + 100);
  assert.equal(table.view().phase, 'idle', 'приём и вращение завершаются без игроков');
  assert.equal(a.c.profile!.tokens, 2240);
  assert.equal(a.c.profile!.rouletteEscrow, null);
  assert.equal(b.c.profile!.tokens, 2000, 'игрок без ставки ничего не получает и не теряет');
  assert.deepEqual(b.c.profile!.fishing.bag, [fish(120)]);
  assert.equal(table.history().length, 1);
  expectSleeping(hub, advance);
});
