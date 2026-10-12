import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SkillGame } from '../server/skilltest/game.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { makeSkillMap } from '../shared/skillmap.ts';
import { SKILL_COURSE, SKILL_SECTIONS } from '../shared/skilltest.ts';
import { CollisionWorld } from '../shared/world.ts';

test('accepted cloud tower has eighteen connected sections rising to 185 metres', () => {
  const map = makeSkillMap();
  assert.equal(map.gallery.y, 185);
  assert.equal(SKILL_COURSE, 'cloud-tower-185-v2');
  assert.equal(SKILL_SECTIONS.length, 18);
  assert.deepEqual(map.checkpoints.map(c => c.y), [0, 8, 20, 30, 42, 52, 60, 70, 82, 90, 101, 110, 120, 132, 142, 150, 163, 175]);
  const world = new CollisionWorld(map);
  for (const [i, c] of map.checkpoints.entries()) {
    assert.equal(world.groundBelow(c.px, c.y + .05, c.pz), c.y, `checkpoint ${i} is supported`);
    assert.ok(c.kill < c.y - 3);
  }
});

test('each climber starts independently; joining and retrying never resets a friend', () => {
  const game = new SkillGame();
  const join = (pid: number) => game.addHuman({ pid, nick: `Climber${pid}`, outfit: DEFAULT_OUTFIT }, { sendJson: () => {} })!;
  const a = join(1);
  assert.equal(game.race.phase, 'none');
  assert.equal(a.progress.startedAt, null);
  const start = game.map.start;
  Object.assign(a.state, { x: start.x1 + 1, y: start.y, z: (start.z0 + start.z1) / 2 });
  game.checkProgress(a, 10);
  assert.equal(a.progress.startedAt, 10);
  const b = join(2);
  assert.equal(b.progress.startedAt, null);
  game.tick = 100;
  game.use(b, 2);
  assert.equal(a.progress.startedAt, 10);
  assert.equal(game.race.phase, 'none');
});

test('full climb requires each checkpoint and a bell; recovery keeps the running timer', () => {
  const game = new SkillGame();
  const p = game.addHuman({ pid: 1, nick: 'Climber1', outfit: DEFAULT_OUTFIT }, { sendJson: () => {} })!;
  p.progress.startedAt = 1;
  const atCheckpoint = (i: number) => {
    const c = game.map.checkpoints[i];
    Object.assign(p.state, { x: c.px, y: c.y, z: c.pz, grounded: 1 });
    game.checkProgress(p, 200 + i);
  };
  atCheckpoint(3);
  assert.equal(p.progress.checkpoint, 0, 'higher floor alone cannot skip sections');
  const bell = game.map.bell;
  Object.assign(p.state, { x: (bell.x0 + bell.x1) / 2, y: game.map.gallery.y + .8, z: (bell.z0 + bell.z1) / 2, grounded: 0 });
  game.checkProgress(p, 250);
  assert.equal(p.progress.finishedAt, null, 'bell without the course is not a finish');
  for (let i = 1; i < game.map.checkpoints.length; i++) atCheckpoint(i);
  assert.equal(p.progress.checkpoint, game.map.checkpoints.length - 1);
  p.state.y = game.map.checkpoints[p.progress.checkpoint].kill - 1;
  game.checkProgress(p, 300);
  assert.equal(p.progress.startedAt, 1);
  assert.equal(p.progress.falls, 1);
  assert.equal(p.state.y, game.map.checkpoints.at(-1)!.y);
  Object.assign(p.state, { x: (bell.x0 + bell.x1) / 2, y: game.map.gallery.y + .8, z: (bell.z0 + bell.z1) / 2, grounded: 0 });
  game.checkProgress(p, 400);
  assert.equal(p.progress.finishedAt, 400);
});
