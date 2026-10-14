import assert from 'node:assert/strict';
import test from 'node:test';
import { MOB_KINDS, type MobKind } from '../shared/dungeon/data.ts';
import { startWave, stepDirector } from '../shared/dungeon/director.ts';
import { createRun } from '../shared/dungeon/sim.ts';

const newcomers: MobKind[] = ['hookclaw', 'wickmole', 'railhopper'];

test('waves 11–13 introduce new roles gradually alongside old enemies and actually spawn them', () => {
  for (const [wave, expected] of [[11, ['hookclaw']], [12, ['hookclaw', 'wickmole']], [13, ['wickmole', 'railhopper']]] as const) {
    const sim = createRun(7);
    sim.noFx = true;
    startWave(sim, wave);
    assert.deepEqual(newcomers.filter(k => sim.wave.pend[MOB_KINDS.indexOf(k)] > 0), expected);
    assert.ok(sim.wave.pend[MOB_KINDS.indexOf('rat')] > 0, 'old enemies stay in the mix');
    for (let t = 0; t < 360; t++) {
      sim.t = t;
      stepDirector(sim);
    }
    for (const kind of expected) assert.ok(sim.mobs.some(m => m.k === kind), `wave ${wave} spawns ${kind}`);
    assert.ok(sim.mobs.some(m => m.k === 'rat'));
    const elites = sim.wave.ev.filter(e => e.type === 'elite');
    assert.equal(elites.length, 1, 'the new elite replaces an existing elite slot');
    assert.equal(elites[0].mob === 'chainwarden', wave === 13);
    if (wave === 13) assert.ok(sim.mobs.some(m => m.k === 'chainwarden'), 'first warden enters on wave 13');
  }
});

test('waves through the first boss keep newcomers out of their roster and events', () => {
  for (const wave of [9, 10]) {
    const sim = createRun(7);
    startWave(sim, wave);
    for (const kind of [...newcomers, 'chainwarden'] as MobKind[]) {
      assert.equal(sim.wave.pend[MOB_KINDS.indexOf(kind)], 0);
      assert.ok(sim.wave.ev.every(e => e.mob !== kind));
    }
  }
});
