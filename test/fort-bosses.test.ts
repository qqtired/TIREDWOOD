// «Крепость»: боссы — Таран (рывок по дорожке, топот, вой), Валун (камни, землетрясение), ярость на 50 % у всех.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import {
  BOSS_PAUSE, GOLEM_HOME_Z, HOWL_TICKS, QUAKE_DMG, QUAKE_R, RAM_CRYSTAL_DMG, RAM_GATE_DMG, RAM_HIT, RAM_HOME_Z, RAM_LANE,
  ROCK_DMG, ROCK_FLIGHT_TICKS, ROCK_GATE_DMG, STOMP_DMG, STOMP_R,
} from '../shared/fortkinds.ts';
import { GATE, PEDESTAL, THROAT_Z, WALL_H } from '../shared/fortmap.ts';
import { BARON_IN_Z } from '../server/fort/bosses.ts';
import { ZF_RAGE, type ZombieSnap } from '../shared/fortnet.ts';
import { BTN_JUMP, makeInput } from '../shared/sim.ts';
import { FortGame } from '../server/fort/game.ts';
import type { FortEvent } from '../shared/fort.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';

function setup(n = 1) {
  const game = new FortGame();
  const events: FortEvent[] = [];
  const sink = { sendJson: (m: { t: string; e?: FortEvent[] }) => { if (m.t === 'fev' && m.e) events.push(...m.e); }, sendBinary() {}, close() {} };
  const players = Array.from({ length: n }, (_, i) => game.addHuman({ pid: i + 1, nick: `Защ${i}`, outfit: DEFAULT_OUTFIT }, sink as never)!);
  game.phase = F.FT_WAVE;
  return { game, players, events };
}

function steps(game: FortGame, n: number): void {
  for (let i = 0; i < n; i++) game.step();
}

/** Шагать, пока условие не выполнится (не дольше max тиков) */
function until(game: FortGame, ok: () => boolean, max = 2000): number {
  let i = 0;
  for (; i < max && !ok(); i++) game.step();
  assert.ok(ok(), `не дождались за ${max} тиков`);
  return i;
}

test('Таран: дорожка рывка за полное предупреждение, удар в ворота, задевает стоящего на дорожке один раз', () => {
  const { game, players, events } = setup();
  const p = players[0];
  Object.assign(p.state, { x: 0.4, y: 0, z: -27, grounded: 1 });
  const ram = game.horde.spawn(F.Z_RAM, 1)!;
  Object.assign(ram, { x: 0, z: RAM_HOME_Z, state: F.ZS_WALK, t: 1 });
  game.step();
  assert.equal(ram.state, F.ZS_CHARGE_WARN);
  assert.ok(ram.toZ < GATE.face && ram.toZ > GATE.face - 3, 'дорожка ведёт к воротам');
  steps(game, 1);
  const warn = events.find((e) => e[0] === 'warn' && e[2] === F.ZS_CHARGE_WARN);
  assert.ok(warn && warn[6] === RAM_LANE, 'метка — дорожка');
  const gate = game.gate;
  steps(game, F.BOSS_WARN_TICKS - 2);
  assert.equal(ram.state, F.ZS_CHARGE_WARN, 'полное предупреждение');
  assert.equal(ram.z, RAM_HOME_Z, 'до конца метки стоит');
  until(game, () => ram.state === F.ZS_CHARGE, 5);
  until(game, () => ram.state !== F.ZS_CHARGE, 200);
  assert.equal(game.gate, gate - RAM_GATE_DMG, 'удар в ворота');
  assert.equal(p.hp, 100 - RAM_HIT, 'на дорожке — задело один раз');
  assert.equal(ram.state, F.ZS_BOSS_OPEN);
  assert.equal(ram.t, F.BOSS_OPEN_TICKS, 'после удара открыт');
});

test('Таран: своих на дорожке разбрасывает в стороны', () => {
  const { game } = setup();
  const ram = game.horde.spawn(F.Z_RAM, 1)!;
  Object.assign(ram, { x: 0, z: RAM_HOME_Z, state: F.ZS_CHARGE, fromX: 0, fromZ: RAM_HOME_Z, toX: 0, toY: 1.5, toZ: -18.2, chase: -1, t: 64 });
  const w = game.horde.spawn(F.Z_BRUTE, 1)!;
  Object.assign(w, { x: 0.3, z: -26 });
  until(game, () => ram.z > -24);
  assert.ok(Math.abs(w.x) > RAM_LANE, `отброшен с дорожки: x = ${w.x}`);
});

test('Таран: после рывка — топот (в прыжке цел), пятится домой, потом вой и стая шустриков', () => {
  for (const jump of [false, true]) {
    const { game, players, events } = setup();
    const p = players[0];
    const ram = game.horde.spawn(F.Z_RAM, 1)!;
    Object.assign(ram, { x: 0, z: -18.2, state: F.ZS_BOSS_OPEN, t: 1 });
    Object.assign(p.state, { x: 0, y: WALL_H, z: -14.6, grounded: 1 });
    game.step();
    assert.equal(ram.state, F.ZS_STOMP);
    assert.ok(Math.hypot(p.state.x - ram.x, p.state.z - ram.z) < STOMP_R, 'над воротами — в круге топота');
    const input = makeInput();
    const wind = ram.t;
    for (let i = 0; i < wind; i++) {
      // прыжок за 20 тиков до удара
      input.seq = i + 1;
      input.buttons = jump && i === wind - 20 ? BTN_JUMP : 0;
      game.onInputs(p, [input], 1);
      game.step();
    }
    assert.equal(p.hp, jump ? 100 : 100 - STOMP_DMG, jump ? 'перепрыгнул' : 'топот достал');
    assert.equal(ram.state, F.ZS_WALK);
    const before = game.horde.alive;
    until(game, () => ram.state === F.ZS_HOWL, 1200);
    assert.ok(Math.abs(ram.z - RAM_HOME_Z) < 0.5, 'вернулся на разбег');
    steps(game, 2);
    assert.ok(events.some((e) => e[0] === 'warn' && e[2] === F.ZS_HOWL), 'вой слышен заранее');
    steps(game, HOWL_TICKS);
    assert.equal(game.horde.alive, before + 3, 'стая шустриков на одного');
    assert.equal(ram.state, F.ZS_WALK);
    assert.ok(ram.t > 0 && ram.t < BOSS_PAUSE, 'потом пауза до следующей атаки');
  }
});

test('Таран: ворота пали — рывок к кристаллу; ярость — два рывка подряд', () => {
  const { game } = setup();
  game.hitGate(99999);
  const ram = game.horde.spawn(F.Z_RAM, 1)!;
  Object.assign(ram, { x: 0, z: RAM_HOME_Z, state: F.ZS_WALK, t: 1, hp: ram.maxHp * 0.45 });
  game.step();
  assert.equal(ram.stage, 2, 'ярость');
  assert.equal(ram.state, F.ZS_CHARGE_WARN);
  assert.ok(ram.toZ > GATE.face && ram.toZ < PEDESTAL.z0, 'дорожка во двор к кристаллу');
  const crystal = game.crystal;
  until(game, () => ram.state === F.ZS_WALK);
  assert.equal(game.crystal, crystal - RAM_CRYSTAL_DMG);
  until(game, () => ram.state === F.ZS_CHARGE_WARN, 1500);
  assert.ok(Math.abs(ram.z - RAM_HOME_Z) < 0.5, 'второй рывок — с разбега');
  until(game, () => ram.state === F.ZS_BOSS_OPEN, 400);
  assert.equal(game.crystal, crystal - 2 * RAM_CRYSTAL_DMG, 'два рывка подряд');
});

test('Валун: камень в человека — метка на месте, бросок виден, ушёл — мимо, остался — попало', () => {
  for (const dodge of [false, true]) {
    const { game, players, events } = setup();
    const p = players[0];
    Object.assign(p.state, { x: 6, y: WALL_H, z: -14.6, grounded: 1 });
    const g = game.horde.spawn(F.Z_GOLEM, 1)!;
    Object.assign(g, { x: 0, z: GOLEM_HOME_Z, state: F.ZS_WALK, t: 1, attackIndex: 1 });
    game.step();
    assert.equal(g.state, F.ZS_THROW);
    assert.ok(Math.abs(g.toX - 6) < 1e-9 && Math.abs(g.toZ + 14.6) < 1e-9, 'метка там, где стоял');
    until(game, () => g.t <= ROCK_FLIGHT_TICKS - 2, 200);
    assert.ok(events.some((e) => e[0] === 'throw' && e[8] === F.ZS_THROW), 'камень полетел');
    if (dodge) p.state.x = 11;
    until(game, () => g.state !== F.ZS_THROW, 200);
    assert.equal(p.hp, dodge ? 100 : 100 - ROCK_DMG);
    assert.equal(g.state, F.ZS_BOSS_OPEN);
  }
});

test('Валун: камень в ворота; землетрясение по стене — в прыжке цел', () => {
  const { game } = setup();
  const g = game.horde.spawn(F.Z_GOLEM, 1)!;
  Object.assign(g, { x: 0, z: GOLEM_HOME_Z, state: F.ZS_WALK, t: 1, attackIndex: 0 });
  const gate = game.gate;
  game.step();
  assert.equal(g.state, F.ZS_THROW);
  until(game, () => g.state === F.ZS_BOSS_OPEN, 200);
  assert.equal(game.gate, gate - ROCK_GATE_DMG);
  for (const jump of [false, true]) {
    const s = setup();
    const p = s.players[0];
    Object.assign(p.state, { x: 3, y: WALL_H, z: -14.6, grounded: 1 });
    const q = s.game.horde.spawn(F.Z_GOLEM, 1)!;
    Object.assign(q, { x: 0, z: GOLEM_HOME_Z, state: F.ZS_WALK, t: 1, attackIndex: 2 });
    s.game.step();
    assert.equal(q.state, F.ZS_QUAKE);
    assert.ok(Math.hypot(p.state.x - q.toX, p.state.z - q.toZ) < QUAKE_R);
    const input = makeInput();
    const wind = q.t;
    for (let i = 0; i < wind; i++) {
      input.seq = i + 1;
      input.buttons = jump && i === wind - 20 ? BTN_JUMP : 0;
      s.game.onInputs(p, [input], 1);
      s.game.step();
    }
    assert.equal(p.hp, jump ? 100 : 100 - QUAKE_DMG);
  }
});

test('Валун в ярости бросает два камня подряд, потом открыт', () => {
  const { game, players } = setup();
  Object.assign(players[0].state, { x: -5, y: WALL_H, z: -14.6, grounded: 1 });
  const g = game.horde.spawn(F.Z_GOLEM, 1)!;
  Object.assign(g, { x: 0, z: GOLEM_HOME_Z, state: F.ZS_WALK, t: 1, attackIndex: 0, hp: g.maxHp * 0.3 });
  const gate = game.gate;
  game.step();
  assert.equal(g.stage, 2);
  assert.equal(g.state, F.ZS_THROW);
  until(game, () => game.gate < gate, 200);
  assert.equal(g.state, F.ZS_THROW, 'сразу второй камень');
  assert.ok(Math.abs(g.toX + 5) < 1e-9, 'второй — в человека');
  until(game, () => g.state !== F.ZS_THROW, 200);
  assert.equal(players[0].hp, 100 - ROCK_DMG);
  assert.equal(g.state, F.ZS_BOSS_OPEN);
});

test('боссы: броня у всех троих, ярость видна в снимке, радиус дорожки — в метке', () => {
  const { game, players } = setup();
  for (const kind of [F.Z_BOSS, F.Z_RAM, F.Z_GOLEM]) {
    const b = game.horde.spawn(kind, 1)!;
    const hp = b.hp;
    game.horde.damage(b, 100, players[0].id, false, b.x, 2, b.z);
    assert.ok(Math.abs(hp - b.hp - 100 * F.BOSS_ARMOR) < 1e-9, `${F.ZK[kind].name}: броня вне окна`);
    b.alive = false;
    game.horde.alive--;
  }
  const ram = game.horde.spawn(F.Z_RAM, 1)!;
  Object.assign(ram, { x: 0, z: RAM_HOME_Z, state: F.ZS_WALK, t: 1, hp: ram.maxHp * 0.4 });
  game.step();
  const snaps: ZombieSnap[] = [];
  const n = game.horde.snap(snaps);
  const s = snaps.slice(0, n).find((z) => z.id === ram.id)!;
  assert.ok((s.flags ?? 0) & ZF_RAGE, 'ярость в снимке');
  assert.equal(s.state, F.ZS_CHARGE_WARN);
  assert.equal(s.r, RAM_LANE);
});

test('Барон: осаждает, переходя с места на место; ворота пали — протискивается по оси ворот во двор и бьёт оттуда', () => {
  const { game, players, events } = setup();
  const p = players[0];
  Object.assign(p.state, { x: 30, y: 0, z: 30, grounded: 1 }); // далеко, чтобы не мешал
  const b = game.horde.spawn(F.Z_BOSS, 1)!;
  Object.assign(b, { x: 0, z: -23, state: F.ZS_WALK, t: 1 });
  const xs = new Set<number>();
  for (let i = 0; i < 60 * 30; i++) {
    game.step();
    if (b.state === F.ZS_WALK && b.t > 0) xs.add(Math.round(b.x));
  }
  assert.ok(xs.size >= 2, `переходит вдоль поля: ${[...xs]}`);
  assert.ok(b.z < -20, 'пока ворота стоят — снаружи');
  game.hitGate(99999);
  const ticks = until(game, () => b.z > -12 && b.state !== F.ZS_BOSS_APPROACH, 60 * 40);
  game.step();
  assert.ok(events.some((e) => e[0] === 'breach' && e[1] === b.id), 'прорыв объявлен');
  assert.ok(ticks < 60 * 25, `дошёл за ${(ticks / 60).toFixed(1)} с`);
  assert.ok(Math.abs(b.z - BARON_IN_Z) < 0.5 && Math.abs(b.x) < 0.5, 'стоит во дворе перед кристаллом');
});

test('Барон проходит проём ворот только по оси: в толще стены |x| мал', () => {
  const { game } = setup();
  const b = game.horde.spawn(F.Z_BOSS, 1)!;
  Object.assign(b, { x: 5, z: -23, state: F.ZS_WALK, t: 1, homeX: 5 });
  game.hitGate(99999);
  let worst = 0;
  for (let i = 0; i < 60 * 30 && b.z < BARON_IN_Z - 0.3; i++) {
    game.step();
    if (b.z > THROAT_Z - 0.5 && b.z < -12.5) worst = Math.max(worst, Math.abs(b.x));
  }
  assert.ok(worst < 0.5, `в проёме смещение ${worst.toFixed(2)} м`);
});

test('Барон во дворе: волна вокруг себя по земле задевает стоящего и кристалл, прыжок спасает', () => {
  for (const jump of [false, true]) {
    const { game, players } = setup();
    const p = players[0];
    game.hitGate(99999);
    const b = game.horde.spawn(F.Z_BOSS, 1)!;
    Object.assign(b, { x: 0, z: BARON_IN_Z, state: F.ZS_WALK, t: 1, attackIndex: 1 });
    Object.assign(p.state, { x: 4, y: 0, z: BARON_IN_Z + 2, grounded: 1 });
    game.step();
    assert.equal(b.state, F.ZS_BOSS_PULSE);
    assert.ok(Math.abs(b.toZ - BARON_IN_Z) < 1e-9 && b.toY < WALL_H, 'круг — вокруг Барона на земле');
    const crystal = game.crystal;
    const input = makeInput();
    const wind = b.t;
    for (let i = 0; i < wind; i++) {
      input.seq = i + 1;
      input.buttons = jump && i === wind - 20 ? BTN_JUMP : 0;
      game.onInputs(p, [input], 1);
      game.step();
    }
    assert.equal(p.hp, jump ? 100 : 100 - F.ZK[F.Z_BOSS].hit);
    assert.equal(game.crystal, crystal - F.BOSS_CRYSTAL_DMG, 'кристаллу рядом достаётся');
  }
});

test('боссы не застревают: без людей, ворота стоят, потом падают — состояние или место меняется хотя бы раз в 6 с', () => {
  for (const kind of [F.Z_BOSS, F.Z_RAM, F.Z_GOLEM]) {
    const { game } = setup(0);
    const b = game.horde.spawn(kind, 1)!;
    let last = { x: b.x, z: b.z, st: b.state, at: 0 };
    let worst = 0;
    for (let i = 0; i < 60 * 90; i++) {
      if (i === 60 * 30) game.hitGate(99999);
      game.step();
      if (!b.alive) break;
      if (Math.hypot(b.x - last.x, b.z - last.z) > 0.2 || b.state !== last.st) last = { x: b.x, z: b.z, st: b.state, at: i };
      worst = Math.max(worst, i - last.at);
    }
    assert.ok(worst < 60 * 6, `${F.ZK[kind].name}: стоял без дела ${(worst / 60).toFixed(1)} с`);
    assert.ok(game.crystal < F.CRYSTAL_HP, `${F.ZK[kind].name}: ворота пали — достаёт кристалл`);
  }
});
