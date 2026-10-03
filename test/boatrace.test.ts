import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoatRace } from '../server/boatrace/game.ts';
import { BoatBot } from '../server/boatrace/bot.ts';
import { boatRaceEnabled } from '../server/boatrace/room.ts';
import { BR_GRID_TICKS, BR_LAPS, BR_MAX, boatRaceReward, makeBoatEvents, makeBoatState, type BoatRaceResultRow, type BoatRaceReward } from '../shared/boatrace.ts';
import { makeBoatCourse } from '../shared/boatracemap.ts';
import { boatGateCrossing, boatWave, collideBoats, placeBoat, recoverBoat, stepBoat } from '../shared/boatracephysics.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { decodeInputs, encodeInputs } from '../shared/protocol.ts';
import { BTN_FORWARD, BTN_RELOAD, BTN_USE, makeInput, type Input } from '../shared/sim.ts';
import { BoatPredictor } from '../client/boatrace/predict.ts';
const info = { pid: 1, nick: 'BoatPilot', outfit: DEFAULT_OUTFIT }, sink = { sendJson() {} };

test('BOATRACE flag defaults to dev only', () => { assert.equal(boatRaceEnabled(undefined, false), false); assert.equal(boatRaceEnabled(undefined, true), true); assert.equal(boatRaceEnabled('0', true), false); assert.equal(boatRaceEnabled('1', false), true); });
test('capacity six, duplicate profile rejected, empty launch closes without bots', () => {
  const race = new BoatRace(); race.start(); assert.equal(race.closed, true); assert.equal(race.racers.size, 0);
  const r = new BoatRace(); for (let i = 1; i <= BR_MAX; i++) assert.ok(r.addHuman({ ...info, pid: i }, sink));
  assert.equal(r.addHuman({ ...info, pid: 7 }, sink), null); assert.equal(r.addHuman(info, sink), null); r.start(); assert.equal(r.racers.size, BR_MAX);
});
test('solo launch fills three bounded bots and countdown ignores acceleration', () => {
  const r = new BoatRace(), p = r.addHuman(info, sink)!; r.start(); const x = p.state.x, z = p.state.z;
  for (let i = 1; i < BR_GRID_TICKS; i++) { r.onInputs(p, [{ ...makeInput(), seq: i, buttons: BTN_FORWARD }], 1); r.step(); }
  assert.equal(r.racers.size, 4); assert.equal(p.state.x, x); assert.equal(p.state.z, z); assert.equal(p.state.lap, 0);
});
test('wrong-order, backwards and outside-width gate crossings are rejected', () => {
  const c = makeBoatCourse(), ev = makeBoatEvents(), s = makeBoatState(); s.lap = 1;
  for (const [index, backwards, lateral] of [[3, 0, 0], [1, 1, 0], [1, 0, 12]]) {
    const g = c.gates[index], sign = backwards ? -1 : 1;
    s.x = g.x + g.hx * sign * 0.1 - g.hz * lateral; s.z = g.z + g.hz * sign * 0.1 + g.hx * lateral; s.vx = g.hx * sign * 10; s.vz = g.hz * sign * 10;
    boatGateCrossing(s, c, g.x - g.hx * sign * 0.1 - g.hz * lateral, g.z - g.hz * sign * 0.1 + g.hx * lateral, ev); assert.equal(s.cp, 0); assert.equal(s.lap, 1);
  }
});
test('recovery preserves ordered progress, clears velocity, grants temporary collision protection', () => {
  const c = makeBoatCourse(), s = makeBoatState(); s.lap = 2; s.cp = 3; s.vx = 20; s.boost = 40;
  recoverBoat(s, c); assert.equal(s.cp, 3); assert.equal(s.lap, 2); assert.equal(s.respawns, 1); assert.equal(s.ghost, 120); assert.equal(s.vx, 0); assert.equal(s.boost, 0);
  s.x = 1000; stepBoat(s, makeInput(), c, makeBoatEvents(), true); assert.equal(s.respawns, 2); assert.ok(Math.abs(s.x) < 150);
});
test('buoys deflect hulls and cannot produce NaN; pair contact is symmetric and ghost-safe', () => {
  const c = makeBoatCourse(), s = makeBoatState(), buoy = c.buoys[0], ev = makeBoatEvents(); s.x = buoy.x; s.z = buoy.z; s.vx = -8;
  stepBoat(s, makeInput(), c, ev, true); assert.ok(Number.isFinite(s.x + s.z + s.vx + s.vz)); assert.ok(Math.hypot(s.x - buoy.x, s.z - buoy.z) >= 1.599);
  const a = makeBoatState(), b = makeBoatState(); a.x = -0.5; b.x = 0.5; a.vx = 8; b.vx = -8;
  assert.equal(collideBoats(a, b), true); assert.equal(a.x + b.x, 0); assert.equal(a.vx + b.vx, 0);
  a.ghost = 10; a.x = b.x; assert.equal(collideBoats(a, b), false);
});
test('nitro is one-use and shared prediction reproduces boat water drag exactly', () => {
  const c = makeBoatCourse(), s = makeBoatState(); placeBoat(s, c, 0); s.nitro = 1;
  const predictor = new BoatPredictor(c); predictor.accept(0, s, true);
  for (let i = 1; i <= 180; i++) { const inp = { ...makeInput(), seq: i, buttons: BTN_FORWARD | (i === 1 ? BTN_USE : 0) }; stepBoat(s, inp, c, makeBoatEvents(), true); predictor.step(inp, true); assert.deepEqual(predictor.state, s); }
  assert.equal(s.nitro, 0); assert.equal(s.boost, 0); const before = predictor.corrections; predictor.accept(180, s, false); assert.equal(predictor.corrections, before);
});
test('waves remain bounded across world phases and locations', () => {
  for (const t of [0, 13, 240, 10000, 500000]) for (const x of [-150, 0, 160]) { const w = boatWave(x, 70, t); assert.ok(Math.abs(w.y) <= 0.28); assert.ok(Math.abs(w.pitch) <= 0.0351); assert.ok(Math.abs(w.roll) <= 0.0451); }
});
test('server input budget prevents accelerated clients, unfinished/idle departures earn no reward', () => {
  const rewards: Array<BoatRaceReward | null> = [], r = new BoatRace({ result: (_p, _row, reward) => rewards.push(reward) }, { minBoats: 1 }); const p = r.addHuman(info, sink)!; r.start();
  for (let i = 0; i < BR_GRID_TICKS; i++) r.step();
  const beforeRt = p.state.rt, beforeX = p.state.x;
  const list = Array.from({ length: 100 }, (_, i) => ({ ...makeInput(), seq: i + 1, buttons: BTN_FORWARD })); r.onInputs(p, list, list.length); r.step(); assert.equal(p.state.rt - beforeRt, 2); assert.ok(Math.abs(p.state.x - beforeX) < 1); assert.ok(p.inputs.ack <= 78); // newest 24, at most two funded physics steps
  r.removePlayer(p.id); r.removePlayer(p.id); assert.deepEqual(rewards, [null]); assert.equal(r.closed, true);
  assert.equal(boatRaceReward(1, 60 * 10000).total, boatRaceReward(1, 180 * 60).total);
});
test('continuous wire inputs complete three laps at different world-wave phases, payout is once', () => {
  for (const wavePhase of [0, 137, 1901]) {
    const paid: Array<{ row: BoatRaceResultRow; reward: BoatRaceReward | null }> = [];
    const race = new BoatRace({ result: (_p, row, reward) => paid.push({ row, reward }) }, { minBoats: 1, wavePhase });
    const p = race.addHuman(info, sink)!, pilot = new BoatBot(race.course, 21); race.start(); let seq = 0, previous = 0, crossings = 0;
    for (let n = 0; n < 15000 && !p.state.done; n++) {
      const input = pilot.input(p.state, ++seq), decoded: Input[] = [];
      assert.equal(decodeInputs(encodeInputs([input], 0, 1, 3), decoded), 1); race.onInputs(p, decoded, 1); race.step();
      assert.equal(p.state.respawns, 0); if (p.state.cp !== previous) { assert.equal(p.state.cp, (previous + 1) % race.course.gates.length); previous = p.state.cp; crossings++; }
    }
    assert.equal(p.state.done, 1); assert.equal(p.state.lap, BR_LAPS); assert.equal(crossings, BR_LAPS * race.course.gates.length); assert.equal(paid.length, 1); assert.ok(paid[0].reward!.total >= 12); assert.ok(paid[0].row.bestLap > 0);
    race.removePlayer(p.id); for (let n = 0; n < 700; n++) race.step(); assert.equal(paid.length, 1);
  }
});
test('repeated held recovery is not a teleport loop', () => {
  const c = makeBoatCourse(), s = makeBoatState(); placeBoat(s, c, 0);
  for (let i = 0; i < 300; i++) stepBoat(s, { ...makeInput(), buttons: BTN_RELOAD }, c, makeBoatEvents(), true);
  assert.equal(s.respawns, 1);
});
test('one real human can finish against three colliding button-only bots', () => {
  const paid: Array<BoatRaceReward | null> = [], race = new BoatRace({ result: (_p, _row, reward) => paid.push(reward) });
  const p = race.addHuman(info, sink)!, pilot = new BoatBot(race.course, 21); race.start();
  for (let i = 1; i < 14000 && !p.state.done; i++) { const decoded: Input[] = []; decodeInputs(encodeInputs([pilot.input(p.state, i)], 0, 1, 1), decoded); race.onInputs(p, decoded, 1); race.step(); }
  assert.equal(p.state.done, 1); assert.equal(paid.length, 1); assert.ok(paid[0]); assert.equal(race.racers.size, 4);
  assert.ok([...race.racers.values()].every(r => Number.isFinite(r.state.x + r.state.z) && r.state.respawns <= 2));
});
test('all six human profiles can finish one collision-enabled race with one result each', () => {
  const results: BoatRaceResultRow[] = [], race = new BoatRace({ result: (_p, row) => results.push(row) }, { minBoats: 1 });
  const pilots = Array.from({ length: 6 }, (_, i) => ({ p: race.addHuman({ ...info, pid: i + 1 }, sink)!, bot: new BoatBot(race.course, 19 + i % 3) })); race.start();
  for (let n = 1; n < 12000 && race.phase !== 'results'; n++) { for (const { p, bot } of pilots) { const decoded: Input[] = []; decodeInputs(encodeInputs([bot.input(p.state, n)], 0, 1, 1), decoded); race.onInputs(p, decoded, 1); } race.step(); }
  assert.equal(results.length, 6); assert.deepEqual(results.map(r => r.pos).sort(), [1, 2, 3, 4, 5, 6]); assert.ok(results.every(r => r.finished && r.respawns === 0));
});
