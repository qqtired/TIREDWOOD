import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeSkillMap } from '../shared/skillmap.ts';
import { SkillBot, SkillRouteBot } from './skillbot.ts';
import { moverAt } from '../shared/skillphysics.ts';
import { copyState, makeEvents, makeInput, makeState } from '../shared/sim.ts';

test('185 metre tower: every mandatory and alternate transition is reachable with real physics', () => {
  const map = makeSkillMap(), bot = new SkillBot(map);
  const failed: string[] = [];
  for (const l of map.links) if (!bot.check(l).ok) failed.push(l.name);
  assert.deepEqual(failed, []);
});

test('complete 185 metre route can be climbed continuously with every hazard active', ctx => {
  const map = makeSkillMap(), bot = new SkillRouteBot(map), c = map.checkpoints[0];
  let state = Object.assign(makeState(), { x: c.px, y: c.y, z: c.pz, grounded: 1 }), t = 0;
  const events = makeEvents();
  for (let sec = 0; sec < 18; sec++) {
    const route = map.links.filter(l => !l.alt && l.name.startsWith(`${sec + 1}:`));
    let result: ReturnType<SkillRouteBot['run']> | undefined;
    // Человек ждёт на безопасном флажке; состояние ни разу не переставляется и время не отматывается.
    for (let attempt = 0; attempt < 12; attempt++) {
      bot.steps = 0; bot.budget = 120_000;
      result = bot.run(route, state, t, 840);
      if (result.ok) break;
      const wait = 60;
      state = copyState(makeState(), state);
      for (let i = 0; i < wait; i++, t++) bot.dyn.step(state, { ...makeInput(), viewTick: t }, t - 1, events);
    }
    assert.ok(result?.ok, `section ${sec + 1}: ${result?.failed}, t=${t}, steps=${bot.steps}`);
    state = result.state; t = result.end;
  }
  assert.ok(t > 150 * 60, `full climb should be substantial: ${t / 60} seconds`);
  ctx.diagnostic(`complete climb ${(t / 60).toFixed(2)} seconds; 18 sections, no reset, all hazards active`);
});

test('moving decks never sweep through the tower, a static deck or another moving deck', () => {
  const map = makeSkillMap(), pos = { x: 0, y: 0, z: 0 }, other = { x: 0, y: 0, z: 0 };
  const errors = new Set<string>();
  const overlap = (a: number[], b: number[]) => a[0] < b[3] - .001 && a[3] > b[0] + .001 && a[1] < b[4] - .001 && a[4] > b[1] + .001 && a[2] < b[5] - .001 && a[5] > b[2] + .001;
  for (let t = 0; t < 5040; t += 2) for (const [i, m] of map.movers.entries()) {
    moverAt(m, t, pos);
    const shapes = [[pos.x - m.w / 2, pos.y - m.h, pos.z - m.d / 2, pos.x + m.w / 2, pos.y, pos.z + m.d / 2], ...(m.bodies ?? []).map(b => [pos.x + b.min[0], pos.y + b.min[1], pos.z + b.min[2], pos.x + b.max[0], pos.y + b.max[1], pos.z + b.max[2]])];
    for (const p of map.pads) {
      const a = map.boxes[p.box];
      if (shapes.some(b => overlap(b, [...a.min, ...a.max]))) errors.add(`mover ${i} section ${m.sec + 1} / ${p.look} box ${p.box}`);
    }
    for (let j = i + 1; j < map.movers.length; j++) {
      const n = map.movers[j]; moverAt(n, t, other);
      if (shapes.some(b => overlap(b, [other.x - n.w / 2, other.y - n.h, other.z - n.d / 2, other.x + n.w / 2, other.y + .89, other.z + n.d / 2]))) errors.add(`movers ${i}/${j}`);
    }
  }
  assert.deepEqual([...errors], []);
});
