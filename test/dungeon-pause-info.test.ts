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
  assert.equal(before.weapons[1].level, 'Эволюция');
  assert.equal(before.weapons[1].state, 'evolved');
  assert.equal(before.temper, 'Закалка 3 / 15 · урон +6 %');
  frame.weapons[0].lv = 7;
  assert.equal(pauseBuild(frame).weapons[0].state, 'ready');
  frame.passives = [];
  const missing = pauseBuild(frame).weapons[0];
  assert.equal(missing.state, 'waiting');
  assert.match(missing.detail, /Фитиль/);
});

test('all current buildings and both ordinary chest types have a pause guide entry', () => {
  assert.deepEqual(PAUSE_BUILDINGS.map((entry) => entry.id).sort(), D.interactables.map((entry) => entry.id).sort());
  assert.equal(new Set(PAUSE_BUILDINGS.map((entry) => entry.id)).size, PAUSE_BUILDINGS.length);
  assert.match(PAUSE_BUILDINGS.find((entry) => entry.id === 'forge')!.text, /весь опыт.*полполосы/);
  assert.match(PAUSE_BUILDINGS.find((entry) => entry.id === 'powderKegs')!.text, /тебя/);
});
