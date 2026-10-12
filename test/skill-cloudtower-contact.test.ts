import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { makeSkillMap } from '../shared/skillmap.ts';
import { SkillDynamics, moverAt } from '../shared/skillphysics.ts';
import { makeEvents, makeInput, makeState } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

test('a platform entering a standing player from the side pushes their whole body out', () => {
  const map = makeSkillMap();
  const m = map.movers.find(m => m.look === 'cart')!;
  m.dx = 6; m.dy = 0; m.dz = 0;
  m.sched = { rest: 0, go: 60, stay: 0, back: 60, phase: 0 };
  const dyn = new SkillDynamics(map, new CollisionWorld(map));
  const a = moverAt(m, 15, { x: 0, y: 0, z: 0 });
  const b = moverAt(m, 16, { x: 0, y: 0, z: 0 });
  const s = Object.assign(makeState(), { x: a.x + m.w / 2 + PLAYER_HALF + .001, y: a.y - .2, z: a.z, grounded: 0 });
  dyn.before(s, { ...makeInput(), viewTick: 16 }, 15);
  assert.ok(s.x >= b.x + m.w / 2 + PLAYER_HALF - .001, `platform penetrates body: ${s.x}`);
});

test('a descending platform above the player does not pass through their head', () => {
  const map = makeSkillMap();
  const m = map.movers.find(m => m.look === 'basket')!;
  const dyn = new SkillDynamics(map, new CollisionWorld(map));
  const a = moverAt(m, 540, { x: 0, y: 0, z: 0 });
  const b = moverAt(m, 541, { x: 0, y: 0, z: 0 });
  const s = Object.assign(makeState(), { x: a.x, y: a.y - m.h - PLAYER_HEIGHT - .001, z: a.z, grounded: 0 });
  dyn.before(s, { ...makeInput(), viewTick: 541 }, 540);
  assert.ok(s.y + PLAYER_HEIGHT <= b.y - m.h + .001, 'descending floor went through head');
});

test('every moving deck carries a still rider through a complete cycle without body penetration', () => {
  const map = makeSkillMap(), world = new CollisionWorld(map), dyn = new SkillDynamics(map, world);
  for (const m of map.movers) {
    if (m.bounce) continue;
    const p = moverAt(m, 0, { x: 0, y: 0, z: 0 });
    const s = Object.assign(makeState(), { x: p.x, y: p.y, z: p.z, grounded: 1, fireCd: 1e6 });
    for (let t = 1; t <= 840; t++) {
      dyn.step(s, { ...makeInput(), viewTick: t }, t - 1, makeEvents());
      const at = moverAt(m, t, p);
      assert.ok(Math.abs(s.y - at.y) < .01 && Math.hypot(s.x - at.x, s.z - at.z) < .02, `section ${m.sec + 1} lost rider at ${t}`);
    }
  }
});

test('a reforming cloud never appears inside any part of a jelly body', () => {
  const map = makeSkillMap(), world = new CollisionWorld(map), dyn = new SkillDynamics(map, world), c = map.clouds[0];
  const x = (c.rect.x0 + c.rect.x1) / 2, z = (c.rect.z0 + c.rect.z1) / 2;
  for (const px of [x, c.rect.x0 - PLAYER_HALF + .03]) {
    const s = Object.assign(makeState(), { x: px, y: c.rect.y - .3, z });
    dyn.before(s, { ...makeInput(), viewTick: c.phase + 5 }, c.phase + 4);
    assert.equal(world.maxY[c.box], -1e6, 'support stays ghosted until body clears it');
  }
});

test('carousel waiting corners stay still while the round centre carries its rider', () => {
  const map = makeSkillMap(), world = new CollisionWorld(map), dyn = new SkillDynamics(map, world), d = map.carousels![0].disc;
  const corner = Object.assign(makeState(), { x: d.cx + 1.35, y: d.top, z: d.cz + 1.35, grounded: 1, fireCd: 1e6 });
  const x = corner.x, z = corner.z;
  for (let t = 1; t <= 300; t++) dyn.step(corner, { ...makeInput(), viewTick: t }, t - 1, makeEvents());
  assert.ok(Math.abs(corner.x - x) < .001 && Math.abs(corner.z - z) < .001 && corner.grounded === 1);
  const center = Object.assign(makeState(), { x: d.cx + 1, y: d.top, z: d.cz, grounded: 1, fireCd: 1e6 });
  for (let t = 1; t <= 180; t++) dyn.step(center, { ...makeInput(), viewTick: t }, t - 1, makeEvents());
  assert.ok(Math.abs(Math.hypot(center.x - d.cx, center.z - d.cz) - 1) < .001 && center.z > d.cz + .8, 'round centre really carries its rider');
});
