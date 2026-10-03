// «Крепость»: десант с моря — лодка плывёт к берегу, экипаж прыгает на берег и лезет через морскую стену во двор;
// потопленная лодка топит экипаж (награда — тем, кто топил); пустая лодка уходит без награды.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import { BOAT_LANE_X, HOP_EVERY, fortBounty } from '../shared/fortkinds.ts';
import { CLIMB_SEA_E, CLIMB_SEA_W, insideFort } from '../shared/fortmap.ts';
import { FortGame } from '../server/fort/game.ts';
import { planWave, type WavePlan } from '../server/fort/director.ts';
import type { Zombie } from '../server/fort/horde.ts';
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

function until(game: FortGame, ok: () => boolean, max = 3000): number {
  let i = 0;
  for (; i < max && !ok(); i++) game.step();
  assert.ok(ok(), `не дождались за ${max} тиков`);
  return i;
}

/** Морская волна только с лодкой (без северной орды), чтобы следить за десантом */
function seaOnly(w = 10): WavePlan {
  const plan = planWave(w, 1, 5);
  return { ...plan, spawns: [], boss: -1 };
}

function boatOf(game: FortGame): Zombie | undefined {
  return game.horde.zombies.find((z) => z.alive && z.kind === F.Z_BOAT);
}

test('лодка: выходит в море, ~25 с до берега, экипаж по одному прыгает и лезет через морскую стену во двор', () => {
  const { game, events } = setup();
  const plan = seaOnly();
  assert.equal(plan.boats.length, 1);
  const crew = plan.boats[0].crew.length;
  game.horde.startWave(plan, game.tick);
  assert.equal(game.horde.left, 1 + crew, 'в «осталось» — лодка и экипаж');
  until(game, () => !!boatOf(game));
  const boat = boatOf(game)!;
  assert.ok(boat.z > 100, 'далеко в море');
  assert.ok(Math.abs(Math.abs(boat.x) - BOAT_LANE_X) < 1.5, 'против точки лазанья');
  assert.equal(boat.stage, crew, 'экипаж виден в снимке');
  assert.equal(game.horde.left, 1 + crew);
  const sail = until(game, () => boat.state === F.ZS_BOAT_LAND) / 60;
  assert.ok(sail > 20 && sail < 30, `плывёт ${sail.toFixed(1)} с`);
  game.step();
  assert.ok(events.some((e) => e[0] === 'boat' && e[1] === 1), 'высадка');
  until(game, () => boat.cargo.length === 0, crew * HOP_EVERY + 60);
  const men = game.horde.zombies.filter((z) => z.alive && z.crew);
  assert.equal(men.length, crew);
  for (const m of men) assert.equal(m.climb, boat.x < 0 ? CLIMB_SEA_W : CLIMB_SEA_E);
  assert.equal(game.horde.left, 1 + crew, 'вышли на берег — всё ещё в «осталось»');
  const m = men[0];
  until(game, () => m.state === F.ZS_CLIMB, 1500);
  until(game, () => insideFort(m.x, m.z) && m.y === 0 && m.state === F.ZS_WALK, 1500);
  assert.ok(Math.abs(m.x) > 10, 'спрыгнул сбоку от террасы');
  until(game, () => !boat.alive, 600);
  assert.equal(game.horde.left, crew, 'пустая лодка ушла без награды');
});

test('лодку потопили до берега — экипаж тонет, награда тем, кто топил', () => {
  const { game, players, events } = setup();
  const plan = seaOnly();
  const crew = plan.boats[0].crew;
  game.horde.startWave(plan, game.tick);
  until(game, () => !!boatOf(game));
  const boat = boatOf(game)!;
  const pts = players[0].pts;
  game.horde.damage(boat, 1e7, players[0].id, false, boat.x, boat.y, boat.z);
  assert.equal(boat.alive, false);
  assert.equal(game.horde.cargo, 0);
  assert.equal(game.horde.left, 0, 'и лодка, и экипаж — сбиты');
  let want = fortBounty(F.Z_BOAT, 0, game.wave, false);
  crew.forEach((k, i) => { want += fortBounty(k, plan.boats[0].tiers[i], game.wave, true); });
  assert.equal(players[0].pts - pts, want);
  game.step();
  game.step();
  assert.ok(events.some((e) => e[0] === 'boat' && e[1] === 0 && e[2] === players[0].id), 'потоплена');
  assert.ok(events.some((e) => e[0] === 'zdie' && e[6] === F.Z_BOAT));
});

test('у берега нет мест в орде — экипаж ждёт в лодке, место освободилось — прыгает', () => {
  const { game } = setup();
  const plan = seaOnly();
  game.horde.startWave(plan, game.tick);
  until(game, () => !!boatOf(game));
  const boat = boatOf(game)!;
  const fill: Zombie[] = [];
  for (let z = game.horde.spawn(F.Z_WALKER, 1); z; z = game.horde.spawn(F.Z_WALKER, 1)) fill.push(z);
  assert.equal(game.horde.alive, F.FORT_MAX_ALIVE);
  for (const z of fill) Object.assign(z, { x: 40, z: -60 });
  until(game, () => boat.state === F.ZS_BOAT_LAND);
  game.horde.damage(fill[0], 1e7, 0, false, 0, 0, 0);
  game.horde.damage(fill[1], 1e7, 0, false, 0, 0, 0);
  const n = boat.cargo.length;
  until(game, () => boat.cargo.length < n, HOP_EVERY * 3);
  steps(game, HOP_EVERY * 3);
  assert.equal(boat.cargo.length, n - 2, 'прыгнули ровно двое — на свободные места');
  assert.equal(game.horde.alive, F.FORT_MAX_ALIVE);
});

function steps(game: FortGame, n: number): void {
  for (let i = 0; i < n; i++) game.step();
}
