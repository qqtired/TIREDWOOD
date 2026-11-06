import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLIMB_FLAGS, makeClimbMap } from '../shared/skillclimb.ts';
import type { SkillLink, SkillRect } from '../shared/skillmap.ts';
import { moverAt } from '../shared/skillphysics.ts';
import { SKILL_CLIMB_GOLD_TICKS, SKILL_CLIMB_SECTIONS, SKILL_CLIMB_SILVER_TICKS } from '../shared/skilltest.ts';
import { copyState, makeEvents, makeInput, makeState } from '../shared/sim.ts';
import { SkillBot, SkillRouteBot } from './skillbot.ts';

// «Город вверх» (sky-climb-v1): длинная трасса вверх серпантином, 28 флагов + колокол. Бриф — docs/skyclimb/brief.md.

const secOf = (l: SkillLink): number => Number(l.name.split(':')[0]) - 1;
const isRect = (t: SkillLink['to']): t is SkillRect => 'x0' in t;

test('city climb: 28 flags in order up to the bell, about 300 m high and over a kilometre of path', () => {
  const map = makeClimbMap();
  assert.equal(map.checkpoints.length, CLIMB_FLAGS);
  assert.equal(SKILL_CLIMB_SECTIONS.length, CLIMB_FLAGS);
  for (const [i, c] of map.checkpoints.entries()) {
    assert.equal(c.sec, i);
    assert.equal(c.kill, c.y - 6, `flag ${i}: fall 6 m below the flag returns to it`);
    assert.ok(map.links.some(l => !l.alt && secOf(l) === i), `section ${i} has a route`);
    if (i > 0) assert.ok(c.y > map.checkpoints[i - 1].y, `flag ${i} is above flag ${i - 1}`);
  }
  assert.ok(map.bell.y0 > 290 && map.bell.y0 < 320, `bell at ${map.bell.y0} m`);
  // путь по горизонтали — по переходам основного маршрута
  let len = 0, prev: [number, number] = [map.checkpoints[0].px, map.checkpoints[0].pz];
  for (const l of map.links.filter(l => !l.alt && l.from === undefined && isRect(l.to))) {
    const r = l.to as SkillRect, p: [number, number] = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  assert.ok(len > 900, `horizontal path ${len.toFixed(0)} m`);
  assert.ok(map.links.at(-1)?.to && 'bell' in map.links.at(-1)!.to, 'the route ends in the bell');
});

test('city climb: every transition (main and shortcut) is passable with real physics, no dash', () => {
  const map = makeClimbMap(), bot = new SkillBot(map);
  const failed = map.links.filter(l => !bot.check(l).ok).map(l => l.name);
  assert.deepEqual(failed, []);
});

test('city climb: every jump really needs the jump (walking off the edge does not make it)', () => {
  const map = makeClimbMap(), bot = new SkillBot(map);
  const walkable = map.links.filter(l => l.how === 'jump' && (l.at ?? [0]).some(t0 => bot.attempt(l, t0, -1) > 0)).map(l => l.name);
  assert.deepEqual(walkable, []);
  assert.ok(map.links.filter(l => l.how === 'jump').length > 120);
});

test('city climb: at least three shortcuts in different places, none skips a flag', () => {
  const map = makeClimbMap();
  const alts = map.links.filter(l => l.alt);
  assert.ok(new Set(alts.map(secOf)).size >= 3, `shortcut sections: ${[...new Set(alts.map(secOf))]}`);
  const B = map.boxes;
  for (const l of alts) {
    const sec = secOf(l), to = l.to;
    assert.ok(isRect(to), l.name);
    // цель срезки — опора того же участка (не флаг): флаги берутся только по порядку
    const pad = map.pads.find(p => { const b = B[p.box]; return b.max[1] === to.y && b.min[0] === to.x0 && b.max[0] === to.x1 && b.min[2] === to.z0 && b.max[2] === to.z1; });
    assert.ok(pad, `${l.name}: target is a pad`);
    assert.equal(pad.sec, sec, `${l.name}: stays inside section ${sec}`);
    assert.equal(pad.cp, undefined, `${l.name}: does not land on a flag`);
    assert.ok(map.links.some(m => !m.alt && m.to === to), `${l.name}: rejoins the main route`);
  }
});

test('city climb: nothing of another section within 6 m under any surface, no low ceilings, no overlaps', () => {
  const map = makeClimbMap(), B = map.boxes;
  const surf = [...map.pads.map(p => ({ b: p.box, sec: p.sec, n: p.look as string })), ...map.steps.map(s => ({ b: s.box, sec: s.sec, n: 'step' })), ...map.clouds.map(c => ({ b: c.box, sec: c.sec, n: 'cloud' }))];
  const errors: string[] = [];
  for (const a of surf) for (const o of surf) {
    if (a === o) continue;
    const p = B[a.b], q = B[o.b];
    const plan = p.min[0] < q.max[0] - .05 && p.max[0] > q.min[0] + .05 && p.min[2] < q.max[2] - .05 && p.max[2] > q.min[2] + .05;
    if (!plan) continue;
    const solid = p.min[1] < q.max[1] - .001 && p.max[1] > q.min[1] + .001;
    if (solid && !(a.n === 'disc' && o.n === 'disc') && a.b < o.b) errors.push(`overlap ${a.n}#${a.b} / ${o.n}#${o.b}`);
    const ceiling = q.min[1] - p.max[1];
    if (ceiling > .01 && ceiling < 1.75) errors.push(`low ceiling ${ceiling.toFixed(2)} over ${a.n}#${a.b}`);
    // ниже на 6 м — только своё (или опора вплотную под самой площадкой)
    if (o.sec !== a.sec && q.max[1] < p.max[1] && q.max[1] > p.max[1] - 6 && q.max[1] < p.min[1] - .02) errors.push(`section ${o.sec} ${o.n}#${o.b} under section ${a.sec} ${a.n}#${a.b}`);
  }
  assert.deepEqual(errors, []);
});

test('city climb: moving platforms never sweep through a surface or each other', () => {
  const map = makeClimbMap(), B = map.boxes, pos = { x: 0, y: 0, z: 0 }, other = { x: 0, y: 0, z: 0 };
  const surf = [...map.pads.map(p => p.box), ...map.steps.map(s => s.box), ...map.clouds.map(c => c.box)];
  const ov = (a: number[], b: number[]) => a[0] < b[3] - .001 && a[3] > b[0] + .001 && a[1] < b[4] - .001 && a[4] > b[1] + .001 && a[2] < b[5] - .001 && a[5] > b[2] + .001;
  const errors = new Set<string>();
  for (let t = 0; t < 4800; t += 3) for (const [i, m] of map.movers.entries()) {
    moverAt(m, t, pos);
    const shapes = [[pos.x - m.w / 2, pos.y - m.h, pos.z - m.d / 2, pos.x + m.w / 2, pos.y, pos.z + m.d / 2],
      ...(m.bodies ?? []).map(b => [pos.x + b.min[0], pos.y + b.min[1], pos.z + b.min[2], pos.x + b.max[0], pos.y + b.max[1], pos.z + b.max[2]])];
    for (const s of surf) if (shapes.some(b => ov(b, [...B[s].min, ...B[s].max]))) errors.add(`mover ${i} (${m.look}) / box ${s}`);
    for (let j = i + 1; j < map.movers.length; j++) {
      const n = map.movers[j];
      moverAt(n, t, other);
      if (shapes.some(b => ov(b, [other.x - n.w / 2, other.y - n.h, other.z - n.d / 2, other.x + n.w / 2, other.y + .89, other.z + n.d / 2]))) errors.add(`movers ${i}/${j}`);
    }
  }
  assert.deepEqual([...errors], []);
});

test('city climb: the whole route with every hazard active takes the bot 6–8 minutes; medals follow it', ctx => {
  const map = makeClimbMap(), bot = new SkillRouteBot(map), c = map.checkpoints[0];
  let state = Object.assign(makeState(), { x: c.px, y: c.y, z: c.pz - 3, grounded: 1 }), t = 0;
  const events = makeEvents(), per: string[] = [];
  for (let sec = 0; sec < CLIMB_FLAGS; sec++) {
    const route = map.links.filter(l => !l.alt && secOf(l) === sec);
    const begin = t;
    let result: ReturnType<SkillRouteBot['run']> | undefined;
    // Не вышло — постоять на месте секунду и снова; состояние не переставляется, время не отматывается.
    for (let attempt = 0; attempt < 16; attempt++) {
      bot.steps = 0; bot.budget = 400_000;
      result = bot.run(route, state, t, 1400);
      if (result.ok) break;
      state = copyState(makeState(), state);
      for (let i = 0; i < 60; i++, t++) bot.dyn.step(state, { ...makeInput(), viewTick: t }, t - 1, events);
    }
    assert.ok(result?.ok, `section ${sec}: ${result?.failed}, t=${t}`);
    state = result.state; t = result.end;
    per.push(`${sec}:${((t - begin) / 60).toFixed(1)}`);
  }
  const min = t / 3600;
  ctx.diagnostic(`bot ${min.toFixed(2)} min; sections ${per.join(' ')}`);
  assert.ok(min >= 6 && min <= 8, `bot climb ${min.toFixed(2)} min`);
  // золото ≈ 1,6 × бот, серебро ≈ 2,6 × бот, до минуты
  assert.ok(Math.abs(SKILL_CLIMB_GOLD_TICKS - 1.6 * t) <= 60 * 60, `gold ${SKILL_CLIMB_GOLD_TICKS / 3600} min vs bot ×1.6 ${(1.6 * min).toFixed(1)}`);
  assert.ok(Math.abs(SKILL_CLIMB_SILVER_TICKS - 2.6 * t) <= 60 * 60, `silver ${SKILL_CLIMB_SILVER_TICKS / 3600} min vs bot ×2.6 ${(2.6 * min).toFixed(1)}`);
});
