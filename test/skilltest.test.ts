// «Выше облаков» — Небесная каланча: карта, награды и рекорды, забег компании (сбор, старт, места, итоги, ещё забег),
// точки и падения, возвращение, детерминизм подвижного и ловушки (мешок, таран, ветер, гриб, сбор забега).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Client } from '../server/hub.ts';
import { SkillGame, type SkillPlayer } from '../server/skilltest/game.ts';
import { SkillRoom } from '../server/skilltest/room.ts';
import { DT } from '../shared/constants.ts';
import { emptyStats } from '../shared/economy.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { makeSkillMap } from '../shared/skillmap.ts';
import { SKILL_KNOCK_RAM, SKILL_KNOCK_SACK, SKILL_KNOCK_TICKS, SKILL_WIND_GROUND, SkillDynamics, makeSackPose, sackAt } from '../shared/skillphysics.ts';
import {
  SKILL_AFTER_FIRST_TICKS, SKILL_AGAIN_TICKS, SKILL_CAPACITY, SKILL_COURSE, SKILL_GATHER_TICKS, SKILL_GOLD_TICKS, SKILL_REJOIN_TICKS,
  SKILL_RESULTS_TICKS, SKILL_SECTIONS, SKILL_SILVER_TICKS, applySkillFinish, skillClock, skillMedal, skillTime, type SkillServerMsg,
} from '../shared/skilltest.ts';
import { ramState, windState } from '../shared/skilltraps.ts';
import { BTN_FORWARD, BTN_JUMP, copyState, makeEvents, makeInput, makeState, statesEqual } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

type Box = { msgs: SkillServerMsg[] };
const join = (game: SkillGame, pid: number, nick: string, box: Box = { msgs: [] }): SkillPlayer =>
  game.addHuman({ pid, nick, outfit: DEFAULT_OUTFIT }, { sendJson: (m) => box.msgs.push(m) })!;
const steps = (game: SkillGame, n: number): void => { for (let i = 0; i < n; i++) game.step(); };
const last = <T extends SkillServerMsg['t']>(box: Box, t: T): Extract<SkillServerMsg, { t: T }> | undefined =>
  box.msgs.filter((m): m is Extract<SkillServerMsg, { t: T }> => m.t === t).at(-1);
/** Встать прямо в колокол: следующий шаг засчитает подъём. */
const ring = (p: SkillPlayer): void => { Object.assign(p.state, { x: 0, y: 66.2, z: 0, vx: 0, vy: 0, vz: 0, grounded: 0 }); };
const stand = (game: SkillGame, p: SkillPlayer, i: number): void => {
  const c = game.map.checkpoints[i];
  Object.assign(p.state, { x: c.px, y: c.y, z: c.pz, vx: 0, vy: 0, vz: 0, grounded: 1 });
};

test('sky tower: ten sections, grounded checkpoints over solid decks, bell above the gallery, new course id', () => {
  const map = makeSkillMap(), world = new CollisionWorld(map);
  assert.equal(SKILL_COURSE, 'sky-tower-v1');
  assert.equal(map.checkpoints.length, SKILL_SECTIONS.length);
  assert.equal(SKILL_SECTIONS.length, 10);
  for (const [i, c] of map.checkpoints.entries()) {
    assert.equal(world.groundBelow(c.px, c.y + 0.1, c.pz), c.y, `checkpoint ${i} stands on its deck`);
    assert.ok(c.kill < c.y - 3, `checkpoint ${i} kill plane is below`);
    if (i > 0) assert.ok(c.y >= map.checkpoints[i - 1].y, 'the climb never goes down between flags');
  }
  assert.ok(map.bell.y0 > map.gallery.y && map.bell.y0 - map.gallery.y < 2.6, 'the bell hangs one jump above the gallery');
  assert.ok(map.bell.y0 - map.checkpoints[0].y > 60, 'a real tower: more than 60 m of climb');
  assert.ok(map.boxes.length < 200 && map.movers.length <= 12 && map.steps.length <= 40);
});

test('medals, tokens once per tier, clean badge once, first climb of the Moscow day, records in ms', () => {
  assert.equal(skillMedal(SKILL_GOLD_TICKS), 3);
  assert.equal(skillMedal(SKILL_GOLD_TICKS + 1), 2);
  assert.equal(skillMedal(SKILL_SILVER_TICKS), 2);
  assert.equal(skillMedal(SKILL_SILVER_TICKS + 1), 1);
  assert.equal(skillTime(108 * 60 + 15), '1:48.25');
  assert.equal(skillClock(108 * 60 + 59), '1:48');
  const st = emptyStats();
  const a = applySkillFinish(st, 250 * 60, 3, 100); // бронза с падениями
  assert.deepEqual([a.medal, a.tokens, a.clean, a.daily, a.newBest, a.medalUp], [1, 20 + 10, false, true, true, true]);
  assert.deepEqual([st.skRuns, st.skBest, st.skMedal, st.skClean, st.skDay], [1, 250000, 1, 0, 100]);
  const b = applySkillFinish(st, 100 * 60, 0, 100); // золото без падений в тот же день: серебро + золото + значок
  assert.equal(b.tokens, 40 + 80 + 30);
  assert.deepEqual([b.medal, b.clean, b.daily, b.newBest], [3, true, false, true]);
  const c = applySkillFinish(st, 110 * 60, 0, 100); // то же золото снова — ничего, рекорд прежний
  assert.deepEqual([c.tokens, c.newBest, c.best, c.medalUp], [0, false, 100000, false]);
  const d = applySkillFinish(st, 300 * 60, 5, 101); // новый день — только бонус дня, медаль не понижается
  assert.deepEqual([d.tokens, d.medal, st.skMedal, st.skRuns], [10, 1, 3, 4]);
});

test('company race: gather on the roof, locked start, places, first bell to all with chat line, results, again', () => {
  const game = new SkillGame();
  const chat: string[] = [];
  const rewards: Array<[number, number, number]> = [];
  game.onChat = (t) => chat.push(t);
  game.onFinish = (p, ticks, _falls, place) => { rewards.push([p.pid, ticks, place]); return null; };
  const ba: Box = { msgs: [] }, bb: Box = { msgs: [] };
  const a = join(game, 1, 'Vasya', ba);
  assert.equal(game.race.phase, 'pre');
  steps(game, 30);
  const b = join(game, 2, 'Petya', bb);
  assert.ok(game.race.racers.has(1) && game.race.racers.has(2));
  assert.notEqual(a.slot, b.slot);
  assert.ok(Math.hypot(a.state.x - b.state.x, a.state.z - b.state.z) > 1.5, 'own slots on the start roof');
  // на сборе кнопки не действуют
  const x0 = a.state.x;
  game.onInputs(a, Array.from({ length: 20 }, (_, i) => ({ ...makeInput(), seq: i + 1, buttons: BTN_FORWARD | BTN_JUMP, yaw: a.yaw, viewTick: game.tick })), 20);
  steps(game, 20);
  assert.equal(a.state.x, x0);
  assert.equal(a.progress.startedAt, null);
  steps(game, SKILL_GATHER_TICKS);
  assert.equal(game.race.phase, 'run');
  assert.equal(a.progress.startedAt, game.race.start);
  assert.equal(b.progress.startedAt, game.race.start);
  steps(game, 600);
  ring(a);
  steps(game, 1);
  assert.equal(last(ba, 'skill_finish')?.place, 1);
  assert.equal(last(bb, 'skill_bell')?.first, true, 'everyone in the room hears the first bell');
  assert.equal(last(bb, 'skill_bell')?.nick, 'Vasya');
  assert.match(chat[0], /^Vasya первым позвонил в колокол — 0:1\d!$/);
  assert.equal(game.race.phase, 'run', 'others still climb');
  steps(game, 120);
  ring(b);
  steps(game, 1);
  assert.equal(last(bb, 'skill_finish')?.place, 2);
  assert.equal(last(ba, 'skill_bell')?.first, false);
  assert.match(chat[1], /^Petya позвонил в колокол — 0:1\d$/);
  assert.deepEqual(rewards.map((r) => [r[0], r[2]]), [[1, 1], [2, 2]]);
  steps(game, 1);
  assert.equal(game.race.phase, 'done', 'everyone rang — results right away');
  const rows = last(ba, 'skill_state')!.race.rows;
  assert.deepEqual(rows.map((r) => [r.nick, r.place]), [['Vasya', 1], ['Petya', 2]]);
  steps(game, SKILL_RESULTS_TICKS + 1);
  assert.equal(game.race.phase, 'none');
  game.use(a, 2);
  assert.equal(game.race.phase, 'pre');
  assert.equal(game.race.phaseEnd, game.tick + SKILL_AGAIN_TICKS);
  assert.ok(game.race.racers.has(1) && game.race.racers.has(2), 'both finished — both on the start again');
  assert.equal(a.progress.finishedAt, null);
});

test('results close 30 s after the first bell; a stuck racer is listed without a place', () => {
  const game = new SkillGame();
  const a = join(game, 1, 'Fast'), b = join(game, 2, 'Slow');
  steps(game, SKILL_GATHER_TICKS + 1);
  ring(a);
  steps(game, 1);
  assert.equal(game.race.phase, 'run');
  steps(game, SKILL_AFTER_FIRST_TICKS - 2);
  assert.equal(game.race.phase, 'run');
  steps(game, 3);
  assert.equal(game.race.phase, 'done');
  assert.deepEqual(game.race.rows.map((r) => [r.pid, r.place, r.ticks > 0]), [[1, 1, true], [2, 0, false]]);
  assert.equal(b.progress.finishedAt, null, 'the slow one may keep climbing on his own');
});

test('joining mid-race climbs on its own clock: record and medal count, no place; gather can be stretched by loading', () => {
  const game = new SkillGame();
  const rewards: number[] = [];
  game.onFinish = (_p, _t, _f, place) => { rewards.push(place); return null; };
  join(game, 1, 'Racer');
  steps(game, SKILL_GATHER_TICKS + 1);
  const box: Box = { msgs: [] };
  const c = join(game, 3, 'Late', box);
  assert.equal(game.race.racers.has(3), false);
  assert.equal(c.progress.racer, false);
  assert.equal(c.progress.startedAt, null, 'own timer starts on leaving the roof');
  stand(game, c, 1);
  steps(game, 1);
  assert.notEqual(c.progress.startedAt, null);
  assert.equal(c.progress.checkpoint, 1);
  ring(c);
  steps(game, 1);
  assert.deepEqual(rewards, [0]);
  assert.equal(last(box, 'skill_finish')?.place, 0);
  // экран загрузки держит сбор: prestart — живой объект забега
  const room = new SkillRoom({ outfitOf: () => DEFAULT_OUTFIT });
  const client = { profile: { id: 9, nick: 'Loader', level: 1, stats: emptyStats() }, pid: 9, nick: 'Loader', sink: { sendJson() {} } } as unknown as Client;
  assert.equal(room.join(client), true);
  const pre = room.prestart!;
  assert.equal(pre.phase, 'pre');
  for (let i = 0; i < SKILL_GATHER_TICKS + 60; i++) { pre.phaseEnd++; room.step(); }
  assert.equal(room.game.race.phase, 'pre', 'still waiting for the loading friend');
  assert.equal(room.status().phase, 'pre');
  steps(room.game, SKILL_GATHER_TICKS + 1);
  assert.equal(room.prestart, null);
});

test('flags count only with feet on the deck; a fall returns to the last flag, keeps the timer and drops stale inputs', () => {
  const game = new SkillGame();
  const p = join(game, 1, 'Pilot');
  steps(game, SKILL_GATHER_TICKS + 1);
  const c3 = game.map.checkpoints[3];
  Object.assign(p.state, { x: c3.px, y: c3.y + 2, z: c3.pz, grounded: 0 });
  game.checkProgress(p, game.tick);
  assert.equal(p.progress.checkpoint, 0, 'in the air above the flag does not count');
  Object.assign(p.state, { x: c3.px, y: c3.y - 1.5, z: c3.pz, grounded: 1 });
  game.checkProgress(p, game.tick);
  assert.equal(p.progress.checkpoint, 0, 'under the deck does not count');
  stand(game, p, 3);
  game.checkProgress(p, game.tick);
  assert.equal(p.progress.checkpoint, 3);
  const started = p.progress.startedAt;
  game.onInputs(p, [{ ...makeInput(), seq: 5, buttons: BTN_FORWARD }], 1);
  p.state.y = c3.kill - 0.5;
  game.checkProgress(p, game.tick);
  assert.deepEqual([p.state.x, p.state.y, p.state.z], [c3.px, c3.y, c3.pz]);
  assert.equal(p.progress.falls, 1);
  assert.equal(p.progress.startedAt, started);
  assert.equal(p.input.ack, 5);
  assert.equal(p.input.length, 0);
  // R — к точке без падения, N — заново и вне забега
  steps(game, 61);
  game.use(p, 1);
  assert.equal(p.progress.falls, 2, 'R in the middle of a climb is a fall');
  steps(game, 61);
  game.use(p, 0);
  assert.equal(p.progress.checkpoint, 0);
  assert.equal(p.progress.startedAt, null);
  assert.equal(game.race.racers.has(1), false);
});

test('rejoin within ten minutes restores the flag on a solo clock; later — a fresh climb with a new gather', () => {
  const game = new SkillGame();
  const p = join(game, 1, 'Pilot');
  steps(game, SKILL_GATHER_TICKS + 1);
  stand(game, p, 4);
  steps(game, 1);
  assert.equal(p.progress.checkpoint, 4);
  game.removePlayer(p.id);
  assert.equal(game.race.phase, 'none');
  steps(game, 100);
  const back = join(game, 1, 'Pilot');
  assert.equal(back.progress.checkpoint, 4);
  assert.equal(back.progress.racer, false);
  assert.equal(game.race.phase, 'none');
  const c4 = game.map.checkpoints[4];
  assert.deepEqual([back.state.x, back.state.y, back.state.z], [c4.px, c4.y, c4.pz]);
  game.removePlayer(back.id);
  steps(game, SKILL_REJOIN_TICKS + 1);
  const fresh = join(game, 1, 'Pilot');
  assert.equal(fresh.progress.checkpoint, 0);
  assert.equal(game.race.phase, 'pre');
});

test('capacity five, no duplicate profile; input spam cannot speed up the server clock', () => {
  const game = new SkillGame();
  for (let i = 1; i <= SKILL_CAPACITY; i++) assert.ok(join(game, i, `P${i}`));
  assert.equal(join(game, 99, 'Sixth'), null);
  assert.equal(game.addHuman({ pid: 1, nick: 'Again', outfit: DEFAULT_OUTFIT }, { sendJson() {} }), null);
  steps(game, SKILL_GATHER_TICKS + 1);
  const p = [...game.players.values()][0];
  const inputs = Array.from({ length: 100 }, (_, i) => ({ seq: i + 1, buttons: BTN_FORWARD, yaw: p.yaw, pitch: 0, viewTick: 999999 }));
  game.onInputs(p, inputs, inputs.length);
  game.step();
  assert.ok(p.input.ack <= 2);
  assert.equal(p.prevTick, game.tick);
});

test('dev checkpoint command works only on a --dev server', () => {
  const room = new SkillRoom({ outfitOf: () => DEFAULT_OUTFIT });
  const client = { profile: { id: 5, nick: 'Tester7', level: 1, stats: emptyStats() }, pid: 5, nick: 'Tester7', sink: { sendJson() {} } } as unknown as Client;
  room.join(client);
  room.command(client, '/cp 5');
  assert.equal(room.playerOf(client)!.progress.checkpoint, 0);
});

test('shared moving world replays bit-identically: two simulations with the same inputs over the wheel and clouds', () => {
  const ma = makeSkillMap(), mb = makeSkillMap();
  const a = new SkillDynamics(ma, new CollisionWorld(ma)), b = new SkillDynamics(mb, new CollisionWorld(mb));
  for (const start of [1, 2, 4, 6, 8]) {
    const c = ma.checkpoints[start];
    const sa = Object.assign(makeState(), { x: c.px, y: c.y, z: c.pz, grounded: 1 }), sb = copyState(makeState(), sa);
    const ea = makeEvents(), eb = makeEvents();
    let seed = 12345 + start;
    for (let t = 1; t <= 900; t++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const inp = { ...makeInput(), seq: t, viewTick: 1000 + t * 0.75, buttons: seed % 7 === 0 ? BTN_JUMP | BTN_FORWARD : BTN_FORWARD, yaw: c.yaw + ((seed >> 8) % 100) / 60 - 0.8 };
      a.step(sa, inp, t === 1 ? NaN : 1000 + (t - 1) * 0.75, ea);
      b.step(sb, inp, t === 1 ? NaN : 1000 + (t - 1) * 0.75, eb);
      assert.ok(statesEqual(sa, sb), `diverged at ${t} from flag ${start}`);
    }
  }
});

test('a swinging sack knocks the jelly off along the swing and grants a short immunity', () => {
  const map = makeSkillMap(), dyn = new SkillDynamics(map, new CollisionWorld(map));
  const k = map.sacks[0];
  const pose = makeSackPose();
  let tb = 0, best = Infinity;
  for (let t = 0; t < k.period; t++) { const a = Math.abs(sackAt(k, t, pose).a); if (a < best) { best = a; tb = t; } }
  const p = sackAt(k, tb, pose);
  const s = Object.assign(makeState(), { x: p.x, y: p.y - 0.8, z: p.z, grounded: 1 });
  dyn.after(s, { ...makeInput(), viewTick: tb }, makeEvents());
  assert.equal(dyn.knock, SKILL_KNOCK_SACK);
  assert.equal(s.fireCd, SKILL_KNOCK_TICKS);
  assert.equal(s.grounded, 0);
  assert.ok(Math.abs(Math.abs(s.vz) - 12.5) < 1e-9 && s.vx === 0, 'pushed along the swing axis');
  assert.ok(s.vy >= 6);
  const vz = s.vz;
  dyn.after(s, { ...makeInput(), viewTick: tb + 1 }, makeEvents());
  assert.equal(s.vz, vz, 'no second hit while tumbling');
});

test('rams wind up before they strike; standing in front during the strike knocks, the rest phase is safe', () => {
  const map = makeSkillMap(), dyn = new SkillDynamics(map, new CollisionWorld(map));
  const r = map.rams[0];
  const st = { e: 0, phase: 'rest' as 'rest' | 'wind' | 'strike' | 'hold' | 'back', k: 0 };
  let hold = -1, rest = -1, wind = -1;
  for (let t = 0; t < 400 && (hold < 0 || rest < 0 || wind < 0); t++) {
    const ph = ramState(r.phase, t, st).phase;
    if (ph === 'hold' && hold < 0) hold = t;
    if (ph === 'rest' && rest < 0) rest = t;
    if (ph === 'wind' && wind < 0) wind = t;
  }
  assert.ok(wind >= 0 && hold > wind, 'a visible wind-up comes first');
  const front = () => Object.assign(makeState(), { x: r.fx + r.dx * r.stroke * 0.5, y: r.y0, z: r.fz, grounded: 1 });
  const safe = front();
  dyn.after(safe, { ...makeInput(), viewTick: rest }, makeEvents());
  assert.equal(safe.fireCd, 0);
  const hit = front();
  dyn.after(hit, { ...makeInput(), viewTick: hold }, makeEvents());
  assert.equal(dyn.knock, SKILL_KNOCK_RAM);
  assert.ok(hit.vx * r.dx > 0, 'pushed out along the ram');
});

test('wind gusts push toward the tower except behind a sail; the yellow mushroom throws high', () => {
  const map = makeSkillMap(), world = new CollisionWorld(map), dyn = new SkillDynamics(map, world);
  const wz = map.winds[0];
  let gust = -1;
  for (let t = 0; t < 400 && gust < 0; t++) if (windState(wz.phase, t) >= 1) gust = t;
  const open = Object.assign(makeState(), { x: 17, y: 21.5, z: -3.5, grounded: 1 });
  dyn.before(open, { ...makeInput(), viewTick: gust }, gust - 1);
  assert.ok(Math.abs(open.x - (17 + wz.dx * SKILL_WIND_GROUND * DT)) < 1e-9, 'pushed by the gust on the ground');
  const sh = map.shelters[0];
  const behind = Object.assign(makeState(), { x: (sh.x0 + sh.x1) / 2, y: 21.5, z: (sh.z0 + sh.z1) / 2, grounded: 1 });
  const x0 = behind.x;
  dyn.before(behind, { ...makeInput(), viewTick: gust }, gust - 1);
  assert.equal(behind.x, x0, 'calm behind the sail');
  const pad = map.pads.find((p) => p.bounce !== undefined)!;
  const b = map.boxes[pad.box];
  const s = Object.assign(makeState(), { x: (b.min[0] + b.max[0]) / 2, y: b.max[1], z: (b.min[2] + b.max[2]) / 2, grounded: 1 });
  const ev = makeEvents();
  dyn.after(s, { ...makeInput(), viewTick: 0 }, ev);
  assert.equal(s.vy, pad.bounce);
  assert.equal(ev.bounced, true);
});

test('start lock: buttons do nothing before the start tick, then the jelly runs', () => {
  const map = makeSkillMap(), dyn = new SkillDynamics(map, new CollisionWorld(map));
  const slot = map.slots[0];
  const s = Object.assign(makeState(), { x: slot.x, y: slot.y, z: slot.z, grounded: 1 });
  dyn.lockUntil = 100;
  for (let t = 90; t < 100; t++) dyn.step(s, { ...makeInput(), seq: t, viewTick: t, buttons: BTN_FORWARD | BTN_JUMP, yaw: slot.yaw }, t - 1, makeEvents());
  assert.deepEqual([s.x, s.y, s.z, s.grounded], [slot.x, slot.y, slot.z, 1]);
  for (let t = 100; t < 110; t++) dyn.step(s, { ...makeInput(), seq: t, viewTick: t, buttons: BTN_FORWARD, yaw: slot.yaw }, t - 1, makeEvents());
  assert.ok(Math.hypot(s.x - slot.x, s.z - slot.z) > 0.5);
});
