import assert from 'node:assert/strict';
import test from 'node:test';
import { pauseBuild, PAUSE_BUILDINGS } from '../client/dungeon/pause-data.ts';
import { D } from '../shared/dungeon/data.ts';

test('pause shows owned levels, actual catalyst progress and remaining independent slots', () => {
  const frame = {
    weapons: [
      { id: 'lantern', name: 'Фонарь', icon: '', lv: 6, max: 7 },
      { id: 'embers_evo', name: 'Жаровой залп', icon: '', lv: 7, max: 1, evo: true },
    ],
    passives: [{ id: 'might', name: 'Фитиль', icon: '', lv: 2, max: 5, val: 'Урон +20 %' }],
    weaponSlots: 5, passiveSlots: 5, temper: 3,
  };
  const before = pauseBuild(frame);
  assert.equal(before.weaponFree, 3);
  assert.equal(before.passiveFree, 4);
  assert.equal(before.weapons[0].level, 'Ур. 6 / 7');
  assert.equal(before.weapons[0].state, 'waiting');
  assert.match(before.weapons[0].synergy, /Фонарь 7.*Фитиль 1.*Негасимый фонарь/);
  assert.match(before.weapons[0].detail, /оружие до 7/);
  assert.deepEqual(before.weapons[0].recipe.map(({ id, level, met }) => ({ id, level, met })), [
    { id: 'lantern', level: 7, met: false }, { id: 'might', level: 1, met: true }, { id: 'lantern_evo', level: 0, met: false },
  ]);
  assert.equal(before.weapons[1].level, 'Эволюция');
  assert.equal(before.weapons[1].state, 'evolved');
  assert.equal(before.weapons[1].detail, 'Получено');
  assert.equal(before.temper, 'Закалка 3 / 15 · урон +6 %');
  frame.weapons[0].lv = 7;
  assert.equal(pauseBuild(frame).weapons[0].state, 'ready');
  assert.equal(pauseBuild(frame).weapons[0].recipe[0].met, true);
  frame.passives = [];
  const missing = pauseBuild(frame).weapons[0];
  assert.equal(missing.state, 'waiting');
  assert.match(missing.detail, /Фитиль/);
  assert.equal(missing.recipe[1].met, false);
});

test('passive inspection shows the same concrete recipe and recognises a level-one evolved item', () => {
  const build = pauseBuild({
    weapons: [{ id: 'spark_evo', name: 'Грозовая друза', icon: '', lv: 1, max: 1, evo: true }],
    passives: [{ id: 'magnet', name: 'Подкова', icon: '', lv: 3, max: 5, val: 'Подбор +75 %' }],
    weaponSlots: 5, passiveSlots: 5,
  });
  assert.deepEqual(build.passives[0].recipe, build.weapons[0].recipe);
  assert.deepEqual(build.passives[0].recipe.map(part => [part.kind, part.id, part.level, part.met]), [
    ['weapon', 'spark', 7, true], ['passive', 'magnet', 1, true], ['evo', 'spark_evo', 0, true],
  ]);
  assert.match(build.passives[0].description, /Подбор \+75 %.*опыт \+12 %/);
});

test('all current buildings and both ordinary chest types have a pause guide entry', () => {
  assert.deepEqual(PAUSE_BUILDINGS.map((entry) => entry.id).sort(), D.interactables.map((entry) => entry.id).sort());
  assert.equal(new Set(PAUSE_BUILDINGS.map((entry) => entry.id)).size, PAUSE_BUILDINGS.length);
  for (const entry of PAUSE_BUILDINGS) for (const field of ['short', 'action', 'cost', 'result'] as const) assert.ok(entry[field].length > 0, `${entry.id}.${field}`);
  const forge = PAUSE_BUILDINGS.find((entry) => entry.id === 'forge')!;
  assert.match(forge.action, /3 с.*ударов/);
  assert.match(forge.cost, /Весь опыт.*полполосы/);
  assert.match(forge.result, /\+1 уровень.*Закалка/);
  assert.match(PAUSE_BUILDINGS.find((entry) => entry.id === 'powderKegs')!.text, /тебя/);
});
