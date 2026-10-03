// Пейнтбол в новой обёртке: награды жетонами, наряды в составе, AFK, выстрел от третьего лица.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RIG_PB, cameraRig } from '../shared/aim.ts';
import { HITBOX_CY, PHASE_END, PHASE_PLAY, TICK_RATE } from '../shared/constants.ts';
import { PB_AFK_TICKS, type PbReward } from '../shared/economy.ts';
import type { GameEvent, RosterEntry, ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT, itemOf, type Outfit } from '../shared/outfit.ts';
import { BTN_FIRE, type Input } from '../shared/sim.ts';
import { Game, type GameHooks, type Player, type Sink } from '../server/paintball/game.ts';

function sink(): Sink & { msgs: ServerMsg[] } {
  const msgs: ServerMsg[] = [];
  return { msgs, sendBinary() {}, sendJson(m) { msgs.push(m); }, close() {} };
}

function untilPhase(game: Game, phase: number, limit = 20 * TICK_RATE): void {
  for (let i = 0; i < limit && game.phase !== phase; i++) game.step();
  assert.equal(game.phase, phase);
}

test('награда за раунд: минута боя — жетоны; зашёл за 30 с до конца — ничего', () => {
  const rewards: Array<{ p: Player; r: PbReward; won: boolean; mvp: boolean }> = [];
  const hooks: GameHooks = { roundEnd: (p, r, won, mvp) => rewards.push({ p, r, won, mvp }) };
  const game = new Game(hooks);
  const a = sink();
  const pa = game.addHuman({ pid: 11, nick: 'Боцман', outfit: DEFAULT_OUTFIT }, a)!;
  game.botsPerTeam = 0;
  game.balanceBots();
  untilPhase(game, PHASE_PLAY);
  for (let i = 0; i < 31 * TICK_RATE; i++) game.step();
  const b = sink();
  const pb = game.addHuman({ pid: 12, nick: 'Юнга', outfit: DEFAULT_OUTFIT }, b)!;
  for (let i = 0; i < 30 * TICK_RATE; i++) game.step();
  game.phaseEnd = game.tick + 1;
  game.step();
  assert.equal(game.phase, PHASE_END);
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].p, pa);
  assert.ok(rewards[0].r.total >= 10);
  assert.ok(a.msgs.some((m) => m.t === 'pbReward'));
  assert.ok(!b.msgs.some((m) => m.t === 'pbReward'), 'опоздавший без награды');
  assert.equal(pb.pid, 12);
});

test('в составе у людей их наряд, у ботов — бесплатные вещи', () => {
  const game = new Game();
  const outfit: Outfit = { c: 3, c2: 4, p: 'stripes', e: 'glasses', h: 'tophat', a: 'chain' };
  const s = sink();
  const p = game.addHuman({ pid: 5, nick: 'Модник', outfit }, s)!;
  game.botsPerTeam = 2;
  game.balanceBots();
  const roster: RosterEntry[] = game.roster();
  assert.deepEqual(roster.find((r) => r.id === p.id)!.o, outfit);
  const bots = roster.filter((r) => r.bot);
  assert.ok(bots.length >= 3);
  for (const r of bots) for (const slot of ['p', 'e', 'h', 'a'] as const) assert.equal(itemOf(slot, r.o[slot])?.tier, 'free');
});

test('AFK: 90 с без нажатий — один вызов, чтобы отправить на набережную', () => {
  const afk: Player[] = [];
  const game = new Game({ afk: (p) => afk.push(p) });
  const p = game.addHuman({ pid: 1, nick: 'Соня', outfit: DEFAULT_OUTFIT }, sink())!;
  game.botsPerTeam = 0;
  game.balanceBots();
  for (let i = 0; i < PB_AFK_TICKS - 10; i++) game.step();
  assert.equal(afk.length, 0);
  for (let i = 0; i < 200; i++) game.step();
  assert.deepEqual(afk, [p]);
});

test('выстрел от третьего лица: центр экрана на противнике — попадание', () => {
  const game = new Game();
  const sa = sink();
  const A = game.addHuman({ pid: 1, nick: 'Стрелок', outfit: DEFAULT_OUTFIT }, sa)!;
  const B = game.addHuman({ pid: 2, nick: 'Мишень', outfit: DEFAULT_OUTFIT }, sink())!;
  assert.notEqual(A.team, B.team);
  game.botsPerTeam = 0;
  game.balanceBots();
  untilPhase(game, PHASE_PLAY);
  A.state.x = -10;
  A.state.z = -6;
  A.state.vx = A.state.vz = 0;
  B.state.x = -10;
  B.state.z = -18;
  B.state.vx = B.state.vz = 0;
  game.step();
  // подбираем взгляд так, чтобы луч камеры (над правым плечом) проходил через центр хитбокса B
  let yaw = 0;
  let pitch = 0;
  const cam = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < 8; k++) {
    cameraRig(A.state.x, A.state.y, A.state.z, yaw, pitch, RIG_PB, 1, game.world, cam);
    const dx = B.state.x - cam.x;
    const dy = B.state.y + HITBOX_CY - cam.y;
    const dz = B.state.z - cam.z;
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  sa.msgs.length = 0;
  for (let i = 0; i < 30; i++) {
    const inp: Input = { seq: 1000 + i, buttons: BTN_FIRE, yaw: Math.fround(yaw), pitch: Math.fround(pitch), viewTick: game.tick };
    game.onInputs(A, [inp], 1);
    game.step();
  }
  const events = sa.msgs.filter((m): m is Extract<ServerMsg, { t: 'ev' }> => m.t === 'ev').flatMap((m) => m.e as GameEvent[]);
  assert.ok(events.some((e) => e[0] === 'hit' && e[1] === A.id && e[2] === B.id), 'есть попадание по мишени');
});
