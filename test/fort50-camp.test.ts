import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FT_BREAK, FT_WAVE, type FortEvent } from '../shared/fort.ts';
import {
  CAMP_BURN_TICKS, CAMP_CHEST_SUPPLIES, CAMP_GUARDS, CAMP_HOME_R, CAMP_LEASH, CAMP_SPOTS,
  CATA_FIRST, CATA_FLIGHT, CATA_PLAYER_DMG, CATA_WINDUP, USE_CAMP_BURN, USE_CAMP_STOP, WALL_DMG, WALL_SECTIONS,
  campGuards, f50Force, wallOuterPoint,
} from '../shared/fort50.ts';
import { WALL_H } from '../shared/fortmap.ts';
import { supplyGold, waveDmgMul } from '../shared/fortwaves.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FortGame, type FortPlayer } from '../server/fort/game.ts';

function setup(count = 1, fort50 = true) {
  const messages: ServerMsg[] = [], events: FortEvent[] = [];
  const sink = { sendBinary() {}, sendJson(m: ServerMsg) { messages.push(m); }, close() {} };
  const g = new FortGame({ fort50 });
  const players = Array.from({ length: count }, (_, i) => g.addHuman({ pid: i + 1, nick: `Tester${i + 7}`, outfit: DEFAULT_OUTFIT }, sink)!);
  const event = g.event.bind(g);
  g.event = (e) => { events.push(e); event(e); };
  g.debug = true;
  return { g, p: players[0], players, messages, events, sink };
}

function wave(g: FortGame, w: number): void {
  g.jumpTo(w); g.phaseEnd = g.tick + 1; g.step();
  assert.equal(g.phase, FT_WAVE);
}
function campTicks(g: FortGame, n: number): void {
  for (let i = 0; i < n; i++) { g.tick++; g.camp.step(); g.walls.flush(); }
}
function atCamp(g: FortGame, p: FortPlayer): void {
  const camp = g.walls.state().camp!;
  Object.assign(p.state, { x: camp.x, y: 0, z: camp.z });
}

test('лагерь: стадии 20/21/22, слабейший западный участок, стражи вне счёта волны, смена главы', () => {
  const { g, p, events } = setup();
  for (const w of [20, 21, 22]) {
    wave(g, w);
    const camp = g.walls.state().camp!;
    assert(camp);
    assert.equal(camp.placed, 20);
    assert.equal(camp.until, 30);
    assert.equal(camp.side, -1);
    assert.deepEqual([camp.x, camp.z], CAMP_SPOTS[0]);
    assert.equal(camp.stage, w - 19);
    assert.equal(camp.guards, campGuards(1));
    const guards = g.horde.zombies.filter((z) => z.alive && z.guard);
    assert.deepEqual(guards.map((z) => z.kind), CAMP_GUARDS.slice(0, campGuards(1)));
    for (const z of guards) {
      assert.equal(z.tier, 0);
      assert.equal(z.maxHp, g.horde.hpFor(z.kind, 0));
      assert(Math.abs(Math.hypot(z.x - camp.x, z.z - camp.z) - CAMP_HOME_R) < 0.01);
    }
  }
  const sec = WALL_SECTIONS.findIndex((s) => s.id === 'w2');
  g.walls.setPercent(sec, 60);
  g.walls.setPercent(1, 1); // восточная стена слабее, но вне стороны лагеря
  const hp = g.walls.hp[sec], gate = g.gate;
  campTicks(g, CATA_FIRST);
  const shot = events.find((e) => e[0] === 'cata');
  assert(shot && shot[0] === 'cata');
  assert.equal(shot[1], sec);
  assert.equal(shot[2], g.tick + CATA_WINDUP);
  assert.equal(shot[3], shot[2] + CATA_FLIGHT);
  const point = wallOuterPoint(sec, 0.3);
  assert.deepEqual(shot.slice(4), [point.x, WALL_H * 0.7, point.z]);
  const [x, y, z] = WALL_SECTIONS[sec].stack;
  Object.assign(p.state, { x, y, z });
  campTicks(g, CATA_WINDUP + CATA_FLIGHT);
  assert(Math.abs(hp - g.walls.hp[sec] - WALL_DMG.catapult * waveDmgMul(f50Force(22))) < 1e-7);
  assert.equal(g.gate, gate);
  assert.equal(p.hp, 100 - CATA_PLAYER_DMG);
  assert(events.some((e) => e[0] === 'catahit' && e[1] === sec));

  // Пустой план, но живые стражи: публичный шаг игры должен завершить волну.
  g.horde.startWave({ ...g.plan!, spawns: [], boats: [], boss: -1, kraken: false }, g.tick);
  assert(g.horde.alive > 0);
  assert.equal(g.horde.left, 0);
  assert.equal(g.horde.pending, 0);
  assert(g.horde.cleared);
  g.step();
  assert.equal(g.phase, FT_BREAK);
  assert(g.walls.state().camp);
  wave(g, 30);
  g.horde.startWave({ ...g.plan!, spawns: [], boats: [], boss: -1, kraken: false }, g.tick);
  g.step();
  assert.equal(g.walls.state().camp, null);
  assert(!g.horde.zombies.some((z) => z.alive && z.guard));
  assert(events.some((e) => e[0] === 'camp' && e[1] === 3));
  wave(g, 31);
  assert.equal(g.walls.state().camp?.side, 1);
  g.newGame();
  assert.equal(g.walls.state().camp, null);
});

test('поджог: три секунды снаружи, сундук каждому, сожжённый лагерь не возрождается в главе', () => {
  const { g, p, players, messages, events } = setup(2);
  wave(g, 20);
  atCamp(g, p);
  const before = players.map((q) => q.run.arsenal.gold);
  g.use(p, USE_CAMP_BURN);
  assert.deepEqual(g.walls.state().camp?.burn, [p.id, g.tick + CAMP_BURN_TICKS]);
  campTicks(g, CAMP_BURN_TICKS - 1);
  assert.equal(g.walls.state().camp?.burnt, false);
  campTicks(g, 1);
  const gold = CAMP_CHEST_SUPPLIES * supplyGold(f50Force(20));
  assert.equal(g.walls.state().camp?.burnt, true);
  assert.equal(g.walls.state().camp?.by, p.id);
  assert.equal(g.walls.state().camp?.burn, undefined);
  players.forEach((q, i) => assert.equal(q.run.arsenal.gold - before[i], gold));
  assert(events.some((e) => e[0] === 'camp' && e[1] === 2 && e[2] === p.id && e[3] === gold));
  assert(g.horde.zombies.some((z) => z.alive && z.guard), 'сожжённый лагерь сохраняет стражей до конца главы');
  campTicks(g, 6);
  assert(messages.some((m) => m.t === 'f50' && m.camp?.burnt));
  wave(g, 21);
  assert.equal(g.walls.state().camp?.burnt, true);
  assert.equal(g.walls.state().camp?.guards, 0, '/wave убрал стражей; сожжённый лагерь их не пополняет');
  wave(g, 31); wave(g, 20);
  assert.equal(g.walls.state().camp, null, 'уже сожжённый placed не ставится заново');
});

test('канал поджога: занятость, отказ со стены, сброс движения/стрельбы/урона/смерти/отпускания/выхода', () => {
  for (const reason of ['move', 'fire', 'hurt', 'dead', 'stop', 'leave']) {
    const { g, p, players, messages, events } = setup(2);
    wave(g, 20);
    atCamp(g, p); atCamp(g, players[1]);
    p.state.y = WALL_H;
    g.use(p, USE_CAMP_BURN);
    assert(messages.some((m) => m.t === 'toast' && m.text === 'Лагерь поджигают снаружи — выйди за стены'));
    p.state.y = 0;
    g.use(p, USE_CAMP_BURN); g.use(players[1], USE_CAMP_BURN);
    assert(messages.some((m) => m.t === 'toast' && m.text === 'Уже поджигают'));
    const gold = p.run.arsenal.gold;
    if (reason === 'move') p.state.x += 0.51;
    if (reason === 'fire') p.firingUntil = g.tick + 10;
    if (reason === 'hurt') g.hitPlayer(0, p.id, 1);
    if (reason === 'dead') p.alive = false;
    if (reason === 'stop') g.use(p, USE_CAMP_STOP);
    if (reason === 'leave') g.removePlayer(p.id);
    campTicks(g, CAMP_BURN_TICKS);
    assert.equal(g.walls.state().camp?.burn, undefined, reason);
    assert.equal(g.walls.state().camp?.burnt, false, reason);
    assert.equal(p.run.arsenal.gold, gold, reason);
    assert(events.some((e) => e[0] === 'camp' && e[1] === 5 && e[2] === p.id), reason);
  }
});

test('катапульта: поджог отменяет замах, летящий камень долетает и повторяется при позднем входе', () => {
  for (const flying of [false, true]) {
    const { g, p, messages, events, sink } = setup();
    wave(g, 22);
    campTicks(g, CATA_FIRST + (flying ? CATA_WINDUP : 0));
    const shot = events.find((e) => e[0] === 'cata')!;
    assert(shot);
    g.command(p, '/camp burn');
    assert.equal(g.walls.state().camp?.by, 0);
    messages.length = 0;
    g.addHuman({ pid: 9, nick: 'Tester9', outfit: DEFAULT_OUTFIT }, sink);
    assert(messages.some((m) => m.t === 'f50' && m.camp?.burnt));
    assert.equal(messages.some((m) => m.t === 'fev' && m.e.some((e) => e[0] === 'cata')), flying);
    campTicks(g, CATA_WINDUP + CATA_FLIGHT);
    assert.equal(events.some((e) => e[0] === 'catahit'), flying);
  }
});

test('стражи: преследуют снаружи, возвращаются домой, не идут к воротам', () => {
  const { g, p } = setup();
  wave(g, 20);
  const camp = g.walls.state().camp!;
  const guard = g.horde.zombies.find((z) => z.alive && z.guard)!;
  const home = { x: guard.x, z: guard.z };
  Object.assign(p.state, { x: home.x + 1, y: 0, z: home.z });
  g.targets = () => [{ id: p.id, x: p.state.x, y: p.state.y, z: p.state.z, air: false }];
  g.tick++; g.horde.step();
  assert(p.hp < 100);
  Object.assign(p.state, { x: camp.x - CAMP_LEASH - 1, y: 0, z: camp.z });
  guard.x -= 2;
  for (let i = 0; i < 240; i++) { g.tick++; g.horde.stepGround(guard, true); }
  assert(Math.hypot(guard.x - home.x, guard.z - home.z) < 0.3);
  assert.equal(guard.chase, 0);
});

test('без Ф50 лагерь и действия отключены', () => {
  const { g, p, messages, events } = setup(1, false);
  wave(g, 22);
  g.command(p, '/camp'); g.use(p, USE_CAMP_BURN);
  assert.equal(g.walls.state().camp, null);
  assert(!g.horde.zombies.some((z) => z.guard));
  assert(!messages.some((m) => m.t === 'f50'));
  assert(!events.some((e) => e[0] === 'camp' || e[0] === 'cata'));
});
