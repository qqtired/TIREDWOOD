// Погода на набережной: сначала ясно, дождь — изредка и на несколько минут, по очереди; режимы для разработки;
// входящему — в приветствии, при смене — всем на набережной.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeRng } from '../shared/math.ts';
import { CLEAR_TICKS, RAIN_TICKS, Weather, weatherMode } from '../server/lobby/weather.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { landDist, rainAt, rainEvent, rainPlan, rainStrikes, seedOf, stormRumbles, stormStrikes, strikeClear, STRIKE_CLEAR, type RainEvent } from '../shared/weather.ts';
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
  assert.equal(weatherMode('storm'), 'storm');
  assert.equal(weatherMode('snow'), 'auto');
  assert.equal(weatherMode(undefined), 'auto');
  // гроза для разработки: дождь сразу, конечный, всегда с грозой; потом ясно — и снова
  let ms = 1000;
  const storm = new Weather(makeRng(3), 'storm', 0, () => ms);
  assert.equal(storm.rain, true);
  const wx = storm.wire!;
  assert.equal(wx.k, 2);
  assert.ok(wx.dur > 0 && rainPlan(rainEvent(wx)).storm, 'гроза почти сразу');
  assert.ok(rainPlan(rainEvent(wx)).storm!.from < 30);
  ms += 10_000;
  assert.equal(storm.wire!.el, 10 * TICK_RATE, 'сколько идёт — по часам');
  assert.equal(storm.step(storm.until), true);
  assert.equal(storm.rain, false);
  assert.equal(storm.wire, null);
  assert.equal(storm.step(storm.until), true);
  assert.equal(storm.rain, true);
});

test('событие дождя: бубен — всегда гроза, обычный — примерно в половине; длительность прежняя', () => {
  const drum = new Weather(makeRng(9), 'auto', 0, () => 0);
  assert.equal(drum.startRain(5), true);
  const w = drum.wire!;
  assert.equal(w.k, 1);
  assert.ok(w.dur >= RAIN_TICKS[0] && w.dur < RAIN_TICKS[1], 'время дождя для рыбалки не сокращено');
  assert.equal(w.dur, drum.until - 5);
  assert.ok(rainPlan(rainEvent(w)).storm, 'бубен — всегда с грозой');
  let storms = 0;
  let rainbows = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const p = rainPlan({ dur: 360, seed: seed * 7919, k: 0 });
    if (p.storm) storms++;
    if (p.rainbow) rainbows++;
  }
  assert.ok(storms > 140 && storms < 260, `гроза в ${storms} из 400`);
  assert.ok(rainbows > 140 && rainbows < 260, `радуга в ${rainbows} из 400`);
});

test('кривая дождя: тот же сид — та же погода; тучи, морось, дождь, стихает; молнии только на пике и только в море', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const ev: RainEvent = { dur: 288 + (seed * 37) % 192, seed: seed * 104729, k: seed % 3 === 0 ? 1 : 0 };
    const p = rainPlan(ev);
    // детерминизм: тот же сид — те же числа
    assert.deepEqual(rainPlan({ ...ev }), p);
    assert.deepEqual(rainStrikes({ ...ev }), rainStrikes(ev));
    for (let t = 0; t <= ev.dur; t += 3.7) assert.deepEqual(rainAt(ev, p, t), rainAt({ ...ev }, rainPlan(ev), t));
    // прогрессия: начинается и кончается тихо, в середине — дождь
    assert.ok(rainAt(ev, p, 1).rain < 0.05, 'сначала — только тучи');
    assert.ok(rainAt(ev, p, p.gather * 0.5).overcast > 0.2, 'тучи собираются');
    assert.ok(rainAt(ev, p, (p.gather + p.drizzle) / 2).rain < 0.4, 'потом морось');
    assert.ok(rainAt(ev, p, p.build + 5).rain > 0.35, 'потом дождь');
    assert.ok(rainAt(ev, p, ev.dur - 1).rain < 0.1, 'к концу стихает');
    for (let t = 0; t <= ev.dur; t += 1.3) {
      const s = rainAt(ev, p, t);
      assert.ok(s.rain >= 0 && s.rain <= 1 && s.overcast >= 0 && s.overcast <= 1);
    }
    let last = -1;
    for (const s of rainStrikes(ev, p)) {
      assert.ok(s.t > last, 'по порядку');
      last = s.t;
      if (s.far) continue;
      assert.ok(p.storm && s.t >= p.storm.from && s.t <= p.storm.to, 'разряды — только на пике');
      assert.ok(strikeClear(s.x, s.z), `в море, не у людей: ${s.x.toFixed(0)}, ${s.z.toFixed(0)}`);
      assert.ok(landDist(s.x, s.z) >= STRIKE_CLEAR, 'не по суше');
    }
    if (!p.storm) assert.equal(rainStrikes(ev, p).length, 0, 'без грозы — без молний');
  }
  // суша, отмель у мостков, аквапарк и баркас — не цели
  for (const [x, z] of [[0, 0], [10, -40], [-15, 25], [-19, 43], [-60, 68], [-50, 20], [-60, 600]]) assert.equal(strikeClear(x, z), false, `${x}, ${z}`);
  assert.equal(strikeClear(-40, 240), true);
  // шторм маяка: удары чаще, на всё время шторма; перед ним — далёкие раскаты всё громче
  const st = stormStrikes(seedOf('storm:1'), 180);
  assert.deepEqual(st, stormStrikes(seedOf('storm:1'), 180));
  assert.ok(st.length >= 10);
  for (let i = 1; i < st.length; i++) assert.ok(st[i].t - st[i - 1].t >= 6 && st[i].t - st[i - 1].t <= 15);
  for (const s of st) if (!s.far) assert.ok(strikeClear(s.x, s.z));
  const r = stormRumbles(seedOf('storm:1'), 60);
  assert.ok(r.every((s) => s.far && s.t < 60) && r[2].power > r[0].power);
});

test('погода на набережной: в приветствии, при смене — всем на набережной, новому — уже с дождём', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Зонтик');
  const b = login(hub, 'Галоша');
  assert.equal(lastOf(a.s, 'lobby')?.rain, 0);
  const w = hub.lobby.weather;
  w.until = hub.lobby.tick + 2;
  steps(hub, 3);
  const [on] = allOf(a.s, 'weather');
  assert.equal(allOf(a.s, 'weather').length, 1);
  assert.equal(on.rain, 1);
  assert.ok(on.wx && on.wx.el >= 0 && on.wx.dur >= RAIN_TICKS[0] && on.wx.k === 0, 'сам дождь — одним сообщением');
  assert.deepEqual(allOf(b.s, 'weather'), [on]);
  const c = login(hub, 'Плащ');
  assert.equal(lastOf(c.s, 'lobby')?.rain, 1);
  assert.equal(lastOf(c.s, 'lobby')?.wx?.seed, on.wx.seed, 'входящему — тот же дождь');
  assert.equal(allOf(c.s, 'weather').length, 0);
  // кончился — тоже всем
  w.until = hub.lobby.tick + 1;
  steps(hub, 2);
  assert.deepEqual(lastOf(c.s, 'weather'), { t: 'weather', rain: 0 });
  assert.equal(allOf(a.s, 'weather').length, 2);
});
