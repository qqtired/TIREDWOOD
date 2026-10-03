import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Race, type Kart } from '../server/race/race.ts';
import { KartBot, type BotView } from '../server/race/bot.ts';
import { gatePhase, MV_GATE, collide, makeHit, makeCap, moverCap } from '../shared/hazards.ts';
import { ITEM_SHIELD, ITEM_PULSE, ITEM_CLEAN, ITEM_PAINT, ITEM_JAM, RC_GRID, makeKartState, makeKartEvents, placeOnGrid, respawn, stepKart } from '../shared/kart.ts';
import { decodeKartSnapshot, makeKartHeader, KM_SHIELD, type KartSnap } from '../shared/kartnet.ts';
import { buildRing } from '../shared/maps/ring.ts';
import { landHas } from '../shared/maps/ringland.ts';
import { buildRaceCourse, isRaceTrackId } from '../shared/racecourse.ts';
import { locateAny, makeLoc, NO_GROUND, type Track } from '../shared/track.ts';
import { BTN_FIRE, BTN_RELOAD, makeInput } from '../shared/sim.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { fakeSink } from './kit.ts';

const tr = buildRaceCourse('foundry').track;

test('course IDs are exact, default port is byte-for-byte legacy, foundry fits all network budgets', () => {
  assert.deepEqual(buildRaceCourse(), buildRing());
  assert.ok(isRaceTrackId('port') && isRaceTrackId('foundry'));
  for (const v of ['2', 2, {}, null, 'PORT', 'foundry ']) assert.equal(isRaceTrackId(v), false);
  assert.throws(() => buildRaceCourse('forged' as never));
  assert.ok(tr.length > 1300 && tr.length < 1500);
  assert.ok(tr.n < 65536 && tr.cpSeg.length < 256 && tr.crates.length <= 32);
  assert.ok([...tr.px, ...tr.pz].every((v) => Number.isFinite(v) && Math.abs(v) < 255));
  assert.ok(tr.len.every((n) => n > 0 && n <= 2.01));
  assert.deepEqual(buildRaceCourse('foundry').track, tr);
});

test('foundry checkpoints, grid, crates and dry road sit on navigable ground', () => {
  const { land } = buildRaceCourse('foundry');
  for (let i = 0; i < tr.n; i++) {
    if (!tr.gap[i]) {
      const next = (i + 1) % tr.n;
      assert.ok(landHas(land, (tr.px[i] + tr.px[next]) / 2, (tr.pz[i] + tr.pz[next]) / 2), `road segment ${i}`);
    }
  }
  for (const g of tr.grid) assert.notEqual(locateAny(tr, g.x, g.z, makeLoc()).ground, NO_GROUND);
  for (const cr of tr.crates) {
    const lc = locateAny(tr, cr.x, cr.z, makeLoc());
    assert.notEqual(lc.ground, NO_GROUND);
    assert.ok(Math.abs(lc.lat) < lc.hw - 0.75);
  }
  for (let cp = 0; cp < tr.cpSeg.length; cp++) {
    const k = makeKartState(); k.cp = cp; k.lap = 2;
    respawn(k, tr);
    assert.equal(k.lap, 2); assert.equal(k.cp, cp); assert.equal(k.grounded, 1);
    for (let rt = 0; rt < 600; rt += 15) {
      const body = { x: k.x, z: k.z, vx: 0, vz: 0 };
      collide(tr.hz, body, rt, 0.75, makeHit());
      assert.deepEqual([body.x, body.z], [k.x, k.z], `respawn checkpoint ${cp}, tick ${rt}`);
    }
  }
});

function crossing(track: Track, cp: number, forward: boolean) {
  const k = makeKartState(), ev = makeKartEvents(), input = makeInput();
  const seg = track.cpSeg[cp];
  const sign = forward ? 1 : -1;
  k.x = track.px[seg] - track.tx[seg] * 0.05 * sign;
  k.z = track.pz[seg] - track.tz[seg] * 0.05 * sign;
  k.y = track.h[seg]; k.seg = seg;
  k.hx = track.tx[seg] * sign; k.hz = track.tz[seg] * sign;
  k.vx = k.hx * 10; k.vz = k.hz * 10;
  k.cp = (cp - 1 + track.cpSeg.length) % track.cpSeg.length; k.lap = 1;
  stepKart(k, input, track, ev, true);
  return { k, ev };
}

test('foundry requires forward crossings in order, refuses reverse crossings and a finish shortcut', () => {
  for (let cp = 0; cp < tr.cpSeg.length; cp++) {
    assert.equal(crossing(tr, cp, true).ev.cp, true, `forward cp ${cp}`);
    assert.equal(crossing(tr, cp, false).ev.cp, false, `reverse cp ${cp}`);
  }
  const k = makeKartState(), ev = makeKartEvents(), input = makeInput();
  k.x = tr.px[0] - 0.05; k.z = tr.pz[0]; k.seg = 0; k.hx = 1; k.hz = 0; k.vx = 10;
  k.cp = 1; k.lap = 2;
  stepKart(k, input, tr, ev, true);
  assert.equal(ev.lap, false); assert.equal(k.cp, 1); assert.equal(k.lap, 2);
  k.cp = 0; k.x = tr.px[tr.cpSeg[2]]; k.z = tr.pz[tr.cpSeg[2]]; k.seg = tr.cpSeg[2];
  k.vx = 0; k.vz = 0;
  for (let i = 0; i < 10; i++) stepKart(k, input, tr, ev, true);
  assert.equal(k.cp, 0, 'teleporting beyond a missed checkpoint never catches it up');
});

test('press has a full second of warning, blocks only when down, always leaves a kart-wide bypass', () => {
  for (const gate of tr.hz.movers.filter((m) => m.kind === MV_GATE)) {
    let amber = 0;
    for (let t = 0; t < gate.period; t++) {
      const phase = gatePhase(gate, t);
      if (phase === 1) amber++;
      const body = { x: gate.cx, z: gate.cz, vx: -gate.uz * 10, vz: gate.ux * 10 };
      collide({ pads: [], slicks: [], decks: [], solids: [], movers: [gate] }, body, t, 0.75, makeHit());
      assert.equal(body.x !== gate.cx || body.z !== gate.cz, phase === 2);
      const cap = moverCap(gate, t, makeCap());
      assert.ok(Object.values(cap).every(Number.isFinite));
    }
    assert.equal(amber, 60);
    const lc = locateAny(tr, gate.cx, gate.cz, makeLoc());
    assert.ok(lc.hw + Math.abs(lc.lat) - gate.h - gate.r > 3, 'safe side always remains open');
  }
});

test('easy, normal and hard bots finish all 3 foundry laps within race limit without falls or resets', () => {
  const seconds: number[] = [];
  const view: BotView = { racing: true, place: 1, karts: 1, ahead: Infinity, behind: Infinity, painted: false };
  for (const skill of ['easy', 'normal', 'hard'] as const) {
    const k = makeKartState(), ev = makeKartEvents(), input = makeInput();
    placeOnGrid(k, tr, 0);
    const bot = new KartBot(tr, skill, 101);
    let t = 0;
    for (; t < 18000 && !k.done; t++) {
      bot.update(k, view, t, input); stepKart(k, input, tr, ev, true);
      assert.equal(ev.splash || ev.respawn, false, `${skill} tick ${t}`);
    }
    assert.equal(k.done, 1, `${skill} did not finish: lap ${k.lap}, cp ${k.cp}`);
    seconds.push(t / 60);
  }
  assert.ok(seconds[0] > seconds[1] && seconds[1] > seconds[2]);
});

function setup(count = 2, roll = () => 0.5) {
  const race = new Race({}, { track: 'foundry', seed: 9, minKarts: count, roll });
  const sinks = Array.from({ length: count }, fakeSink);
  const karts = sinks.map((s, i) => race.addHuman({ pid: 500 + i, nick: `Kart ${i}`, outfit: DEFAULT_OUTFIT }, s)!);
  race.start(); while (race.phase === RC_GRID) race.step();
  karts.forEach((k, i) => put(race, k, -90 + 8 * i, 125));
  return { race, karts, sinks };
}
function put(race: Race, k: Kart, x: number, z: number) {
  const lc = locateAny(race.track, x, z, makeLoc());
  Object.assign(k.state, { x, z, y: lc.ground, seg: lc.seg, grounded: 1, hx: 1, hz: 0, vx: 0, vy: 0, vz: 0, ghostT: 0, prevButtons: 0 });
}
function use(race: Race, k: Kart, item: number) {
  const input = makeInput(); input.seq = k.inq.ack + 1; input.buttons = BTN_FIRE;
  k.state.item = item; k.state.itemT = 0; k.state.prevButtons = 0;
  race.onInputs(k, [input], 1); race.step();
}

test('new bonus pool is foundry-only and each new item can be picked from a real crate', () => {
  for (const item of [ITEM_SHIELD, ITEM_PULSE, ITEM_CLEAN]) {
    const { race, karts } = setup(1, () => (item - 1 + 0.1) / 6);
    const c = race.track.crates[0]; put(race, karts[0], c.x, c.z);
    race.step();
    assert.equal(karts[0].state.item, item); assert.ok(karts[0].state.itemT > 0);
    assert.ok(race.crateBack[0] > race.tick);
  }
  assert.equal(new Race({}, {}).trackId, 'port');
});

test('shield blocks one pulse only and is included in snapshots without corrupting boost bits', () => {
  const { race, karts: [a, b], sinks } = setup();
  use(race, b, ITEM_SHIELD);
  while (race.tick % 2) race.step();
  const snaps: KartSnap[] = [];
  const data = sinks[1].bins.at(-1)!;
  decodeKartSnapshot(new Uint8Array(data).buffer, makeKartHeader(), makeKartState(), snaps, []);
  assert.ok(snaps.find((s) => s.id === b.id)!.misc & KM_SHIELD);
  assert.equal((snaps.find((s) => s.id === b.id)!.misc >> 2) & 3, 0);
  use(race, a, ITEM_PULSE);
  assert.equal(b.state.slowT, 0); assert.equal(b.shieldT, 0);
  use(race, a, ITEM_PULSE);
  assert.ok(b.state.slowT > 0); assert.equal(a.state.item, 0);
  race.step();
  assert.ok(sinks[0].msgs.some((m) => m.t === 'rev' && m.e.some((e) => e[0] === 'shield' && e[1] === b.id)));
});

test('pulse ignores behind, distant, airborne, ghost and finished karts and removes boost on valid hit', () => {
  for (const reject of ['behind', 'far', 'high', 'ghost', 'done']) {
    const { race, karts: [a, b] } = setup();
    if (reject === 'behind') put(race, b, -98, 125);
    if (reject === 'far') put(race, b, -65, 125);
    if (reject === 'high') { b.state.y = 5; b.state.grounded = 0; }
    if (reject === 'ghost') b.state.ghostT = 50;
    if (reject === 'done') b.state.done = 1;
    use(race, a, ITEM_PULSE);
    assert.equal(b.state.slowT, 0, reject);
  }
  const { race, karts: [a, b] } = setup();
  b.state.boostT = 40; b.state.boostLvl = 3;
  use(race, a, ITEM_PULSE);
  assert.ok(b.state.slowT > 0); assert.equal(b.state.boostT, 0);
});

test('shield absorbs paint and jam once; cleaner clears real effects and nearby traps, with bounded acceleration', () => {
  const { race, karts: [a, b] } = setup();
  a.place = 2; b.place = 1;
  use(race, b, ITEM_SHIELD); use(race, a, ITEM_PAINT);
  assert.equal(b.paintT, 0); assert.equal(b.shieldT, 0);
  use(race, b, ITEM_JAM);
  assert.equal(race.traps.length, 1);
  put(race, a, race.traps[0].x, race.traps[0].z);
  use(race, a, ITEM_SHIELD);
  assert.equal(race.traps.length, 0); assert.equal(a.state.slowT, 0); assert.equal(a.shieldT, 0);
  a.paintT = 140; a.state.slowT = 100; a.state.spinT = 20;
  put(race, b, a.state.x + 2.4, a.state.z); use(race, b, ITEM_JAM);
  use(race, a, ITEM_CLEAN);
  assert.equal(a.paintT, 0); assert.equal(a.state.slowT, 0); assert.equal(a.state.spinT, 0);
  assert.ok(a.state.boostT > 0 && a.state.boostT <= 45); assert.equal(race.traps.length, 0);
});

test('shield expires, reset cannot grant checkpoints, race identity stays locked in hello and results', () => {
  const { race, karts: [a], sinks } = setup(1);
  use(race, a, ITEM_SHIELD);
  for (let i = 0; i < 180; i++) race.step();
  assert.equal(a.shieldT, 0);
  const cp = a.state.cp, lap = a.state.lap;
  const input = makeInput(); input.seq = a.inq.ack + 1; input.buttons = BTN_RELOAD;
  race.onInputs(a, [input], 1); race.step();
  assert.equal(a.state.cp, cp); assert.equal(a.state.lap, lap);
  assert.equal(race.addHuman({ pid: 999, nick: 'late', outfit: DEFAULT_OUTFIT }, fakeSink()), null);
  assert.ok(sinks[0].msgs.some((m) => m.t === 'race' && m.track === 'foundry'));
  race.phaseEnd = race.tick + 1; race.step();
  const end = sinks[0].msgs.find((m) => m.t === 'raceEnd');
  assert.ok(end && end.t === 'raceEnd');
  assert.equal(end.track, 'foundry'); assert.ok(end.results.every((r) => r.track === 'foundry'));
});

test('authoritative foundry race completes with real inputs, lap timing and course-tagged rewards', () => {
  const rows: Array<{ best: number; track?: string; time: number }> = [];
  let paid = 0;
  const race = new Race({ result: (_k, row, reward) => { rows.push(row); if (reward) paid++; } }, { track: 'foundry', seed: 15, minKarts: 4 });
  const me = race.addHuman({ pid: 17, nick: 'Pilot', outfit: DEFAULT_OUTFIT }, fakeSink())!;
  const bot = new KartBot(race.track, 'hard', 123);
  const view: BotView = { racing: true, place: 1, karts: 4, ahead: Infinity, behind: Infinity, painted: false };
  const input = makeInput();
  race.start();
  for (let t = 0; t < 19000 && !rows.length; t++) {
    view.racing = race.phase !== RC_GRID;
    view.place = me.place || 1; view.painted = me.paintT > 0;
    bot.update(me.state, view, race.tick, input); input.seq = t + 1;
    race.onInputs(me, [input], 1); race.step();
  }
  assert.equal(rows.length, 1); assert.equal(paid, 1);
  assert.equal(rows[0].track, 'foundry'); assert.ok(rows[0].best > 60000); assert.ok(rows[0].time > 180000);
});
