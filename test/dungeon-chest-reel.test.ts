// Сундук «Подземелья»: лента барабана крутится только из своих вещей героя — того, что сундук и может улучшить (Х-25).
import assert from 'node:assert/strict';
import test from 'node:test';
import { SimRun, chestPool } from '../client/dungeon/simview.ts';
import { openChest } from '../shared/dungeon/progress.ts';
import { createRun } from '../shared/dungeon/sim.ts';

test('лента сундука: ровно свои оружия и пассивки героя, чужих вещей нет', () => {
  const sim = createRun(7);
  sim.passives.push({ id: 'magnet', lv: 2 });
  const pool = chestPool(sim);
  assert.deepEqual(
    pool.map((x) => `${x.kind}:${x.id}`).sort(),
    [...sim.weapons.map((w) => `weapon:${w.id}`), ...sim.passives.map((p) => `passive:${p.id}`)].sort(),
  );
  assert.ok(pool.length < 6, 'не вся библиотека оружия и пассивок');
});

test('сундук в окне: всё, что выпало, есть в ленте', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const run = new SimRun(seed);
    run.sim.passives.push({ id: 'magnet', lv: 1 });
    openChest(run.sim, 'big');
    const chest = run.view().chest;
    assert.ok(chest?.pool?.length);
    const ids = new Set(chest.pool.map((x) => x.id));
    for (const it of chest.items) if (it.id && !it.evo) assert.ok(ids.has(it.id), `выпавшее ${it.id} есть в ленте (seed ${seed})`);
    for (const x of chest.pool) assert.ok(run.sim.weapons.some((w) => w.id === x.id) || run.sim.passives.some((p) => p.id === x.id), `${x.id} — своя вещь`);
  }
});
