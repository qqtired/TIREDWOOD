// Крысиные бега: кот-зритель (client/lobby/critterbrain.ts, поход «visit») на настоящей коллизии набережной с понтоном —
// с любого места своего расписания доходит до понтона, запрыгивает на угловой столбик и сидит, глядя на крыс; когда
// забег кончился — спрыгивает, уходит тем же путём и возвращается к своим делам. По пути — только по твёрдому (не по воде).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { CRITTERS } from '../shared/maps/critters.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { RAT_CENTER, RAT_DECK, RAT_PEN } from '../shared/ratrace.ts';
import { CollisionWorld } from '../shared/world.ts';
import { CritterBrain, brainWorld, type CritterVisit } from '../client/lobby/critterbrain.ts';
import { RAT_CAT_APPROACH, RAT_CAT_SEAT } from '../client/lobby/ratrace3d.ts';

const world = new CollisionWorld(buildLobby());
const bw = brainWorld(world);
const CAT = CRITTERS.findIndex((c) => c.id === 0);

test('кот у крысиных бегов: дошёл, запрыгнул на столбик, смотрит; после забега ушёл к своим делам — из любой точки расписания', () => {
  assert.equal(CRITTERS[CAT].kind, 'cat');
  // столбик — над углом бортика арены, путь — по набережной и понтону
  assert.ok(Math.abs(RAT_CAT_SEAT.x - (RAT_PEN.x1 + RAT_PEN.t / 2)) < 1e-9 && RAT_CAT_SEAT.y > RAT_PEN.h);
  for (const p of RAT_CAT_APPROACH) assert.ok(bw.floor(p.x, p.z, 0) !== null, `под точкой пути (${p.x}; ${p.z}) твёрдо`);
  const last = RAT_CAT_APPROACH[RAT_CAT_APPROACH.length - 1];
  assert.ok(last.x > RAT_DECK.x0 && last.x < RAT_DECK.x1 && last.z > RAT_DECK.z0 && last.z < RAT_DECK.z1, 'последняя точка — на понтоне');
  for (const start of [0, 900, 2100, 3300, 4500]) {
    const brain = new CritterBrain(CRITTERS, bw);
    const visit: CritterVisit = { path: RAT_CAT_APPROACH, seat: RAT_CAT_SEAT, look: { x: RAT_CENTER.x, z: RAT_CENTER.z } };
    const cam = { x: -6, z: 18 };
    let tick = start * 7, now = 0, perched = -1;
    const dt = 1 / 30;
    for (let i = 0; i < 30 * 40; i++) {
      tick += TICK_RATE * dt; now += dt;
      brain.setVisit(CAT, visit);
      brain.update(tick, now, dt, cam, []);
      const m = brain.minds[CAT];
      // в походе — только над твёрдым (не над водой у края понтона)
      if (m.mode === 'visit' && !m.hop) assert.ok(bw.floor(m.pose.x, m.pose.z, m.pose.y + 0.3) !== null, `${start}: кот над водой в (${m.pose.x.toFixed(2)}; ${m.pose.z.toFixed(2)})`);
      if (m.mode === 'perch') { perched = now; break; }
    }
    assert.ok(perched > 0, `${start}: кот дошёл и сел на столбик`);
    const m = brain.minds[CAT];
    assert.ok(Math.hypot(m.pose.x - RAT_CAT_SEAT.x, m.pose.z - RAT_CAT_SEAT.z) < 1e-6 && Math.abs(m.pose.y - RAT_CAT_SEAT.y) < 1e-6);
    assert.equal(m.pose.action, 'sit');
    // смотрит на крыс: взгляд поворачивается к точке
    visit.look.x = RAT_CENTER.x - 1.5; visit.look.z = RAT_CENTER.z + 0.6;
    for (let i = 0; i < 60; i++) { tick += TICK_RATE * dt; now += dt; brain.setVisit(CAT, visit); brain.update(tick, now, dt, cam, []); }
    assert.ok(m.pose.look > 0.8, `${start}: смотрит на арену`);
    // забег кончился: уходит и через путь возвращается к расписанию
    brain.setVisit(CAT, null);
    let back = false;
    for (let i = 0; i < 30 * 60; i++) {
      tick += TICK_RATE * dt; now += dt;
      brain.update(tick, now, dt, cam, []);
      if (brain.minds[CAT].mode === 'sched') { back = true; break; }
    }
    assert.ok(back, `${start}: вернулся к своим делам`);
  }
});
