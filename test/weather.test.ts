// Погода на набережной: сначала ясно, дождь — изредка и на несколько минут, по очереди; режимы для разработки;
// входящему — в приветствии, при смене — всем на набережной.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeRng } from '../shared/math.ts';
import { CLEAR_TICKS, RAIN_TICKS, Weather, weatherMode } from '../server/lobby/weather.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { allOf, lastOf, login, setupHub, steps } from './kit.ts';

test('погода: сначала ясно, дальше ясно и дождь по очереди, каждый — в своих сроках', () => {
  const w = new Weather(makeRng(5));
  assert.equal(w.rain, false);
  assert.ok(w.until >= CLEAR_TICKS[0] && w.until < CLEAR_TICKS[1], `первый дождь не раньше 15 минут: ${w.until}`);
  assert.equal(w.step(w.until - 1), false);
  let tick = w.until;
  let rains = 0;
  for (let i = 0; i < 400; i++) {
    const was: boolean = w.rain;
    assert.equal(w.step(tick), true);
    assert.equal(w.rain, !was);
    const span = w.until - tick;
    const [a, b] = w.rain ? RAIN_TICKS : CLEAR_TICKS;
    assert.ok(span >= a && span < b, `${w.rain ? 'дождь' : 'ясно'}: ${span / TICK_RATE} с`);
    assert.equal(w.step(w.until - 1), false, 'до срока погода не меняется');
    if (w.rain) rains++;
    tick = w.until;
  }
  assert.equal(rains, 200);
});

test('погода для разработки: всегда дождь, всегда ясно, по 45 с; неизвестное — как в игре', () => {
  const rain = new Weather(Math.random, 'rain');
  const clear = new Weather(Math.random, 'clear');
  for (let t = 0; t < 4 * CLEAR_TICKS[1]; t += 997) {
    assert.equal(rain.step(t), false);
    assert.equal(clear.step(t), false);
  }
  assert.equal(rain.rain, true);
  assert.equal(clear.rain, false);
  const cycle = new Weather(Math.random, 'cycle');
  assert.equal(cycle.until, 45 * TICK_RATE);
  assert.equal(cycle.step(45 * TICK_RATE), true);
  assert.equal(cycle.rain, true);
  assert.equal(cycle.until, 90 * TICK_RATE);
  assert.equal(weatherMode('cycle'), 'cycle');
  assert.equal(weatherMode('snow'), 'auto');
  assert.equal(weatherMode(undefined), 'auto');
});

test('погода на набережной: в приветствии, при смене — всем на набережной, новому — уже с дождём', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Зонтик');
  const b = login(hub, 'Галоша');
  assert.equal(lastOf(a.s, 'lobby')?.rain, 0);
  const w = hub.lobby.weather;
  w.until = hub.lobby.tick + 2;
  steps(hub, 3);
  assert.deepEqual(allOf(a.s, 'weather'), [{ t: 'weather', rain: 1 }]);
  assert.deepEqual(allOf(b.s, 'weather'), [{ t: 'weather', rain: 1 }]);
  const c = login(hub, 'Плащ');
  assert.equal(lastOf(c.s, 'lobby')?.rain, 1);
  assert.equal(allOf(c.s, 'weather').length, 0);
  // кончился — тоже всем
  w.until = hub.lobby.tick + 1;
  steps(hub, 2);
  assert.deepEqual(lastOf(c.s, 'weather'), { t: 'weather', rain: 0 });
  assert.equal(allOf(a.s, 'weather').length, 2);
});
