// «Т-идеи» крепости, клиентская логика без DOM (client/fort/ideas/logic.ts): разбор fideas, строки окна ремёсел,
// голосование за карточку, замедление, слабое место в прицеле.
import assert from 'node:assert/strict';
import test from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { CRAFT_MASON, CRAFT_NONE, CRAFT_RIFLE, RACK, SLOW_RATE, TRAMP_SPOTS, USE_CRAFT } from '../shared/fortideas.ts';
import { Z_BRUTE, Z_WALKER } from '../shared/fortkinds.ts';
import { WEAK_SPOTS, weakSpotWorld } from '../shared/fortweak.ts';
import {
  aimWeak, craftRows, digitCard, mobScale, nearRack, nearTramp, readIdeas, slowAmount, slowTimeScale, voteView, type WeakAim,
} from '../client/fort/ideas/logic.ts';

test('fideas: разбор терпит лишнее и недостающее', () => {
  assert.equal(readIdeas(null).ideas, false);
  const s = readIdeas({
    t: 'fideas', ideas: true, elite: true, crafts: [[3, CRAFT_MASON], [4, 99], [5, CRAFT_RIFLE]], full: true, tramps: 5,
    taken: ['pierce', 'нет-такой', 'eye'], vote: { ids: ['tar', 'bounty', 'mag'], votes: [1, 0, 2], mine: 1, end: 900 },
  });
  assert.deepEqual([...s.crafts], [[3, CRAFT_MASON], [5, CRAFT_RIFLE]]);
  assert.deepEqual(s.taken, ['pierce', 'eye']);
  assert.equal(s.tramps, 5);
  assert.equal(s.vote?.mine, 1);
  assert.equal(readIdeas({ t: 'fideas', ideas: true, elite: false, crafts: [], full: false, tramps: 0, taken: [], vote: { ids: [], votes: [], mine: -1, end: 0 } }).vote, null);
});

test('окно ремёсел: в передышке берут, в волну заперто, своё отмечено', () => {
  const calm = craftRows(CRAFT_MASON, true);
  assert.equal(calm.length, 5);
  assert.equal(calm[0].tag, 'Надето');
  assert.ok(calm.every((r) => !r.locked));
  const fight = craftRows(CRAFT_MASON, false);
  assert.equal(fight[0].locked, false);
  assert.ok(fight.slice(1).every((r) => r.locked && r.reason));
  assert.equal(calm[4].id, USE_CRAFT + CRAFT_NONE);
});

test('вешалка и батуты: рядом ли', () => {
  assert.ok(nearRack(RACK.x + 1, 0, RACK.z));
  assert.ok(!nearRack(RACK.x + 6, 0, RACK.z));
  assert.ok(!nearRack(RACK.x, 2.2, RACK.z));
  assert.equal(nearTramp(TRAMP_SPOTS[2].x + 0.5, 0, TRAMP_SPOTS[2].z), 2);
  assert.equal(nearTramp(0, 0, 0), -1);
});

test('голосование: лидер, свой выбор, время', () => {
  const v = voteView({ ids: ['pierce', 'stones', 'goldtowers'], votes: [2, 2, 0], mine: 1, end: 15 * TICK_RATE }, 5 * TICK_RATE);
  assert.equal(v.sec, 10);
  assert.equal(v.total, 4);
  assert.deepEqual(v.cards.map((c) => c.lead), [true, true, false]);
  assert.equal(v.cards[1].mine, true);
  assert.equal(v.cards[2].def.gold, true);
  assert.equal(digitCard('Digit2', 3), 1);
  assert.equal(digitCard('Digit4', 3), -1);
  assert.equal(digitCard('KeyE', 3), -1);
});

test('замедление: вход и выход плавные, темп по доле', () => {
  assert.equal(slowAmount(0, 1), 0);
  assert.ok(slowAmount(1.4, 0.05) < 1 && slowAmount(1.4, 0.05) > 0);
  assert.equal(slowAmount(1, 1), 1);
  assert.ok(slowAmount(0.05, 1) < 1);
  assert.equal(slowTimeScale(0), 1);
  assert.ok(Math.abs(slowTimeScale(1) - SLOW_RATE) < 1e-9);
});

test('слабое место в прицеле: сзади в бочонок — да, спереди сквозь тело — нет, мимо — нет', () => {
  const out: WeakAim = { t: 0, x: 0, y: 0, z: 0, r: 0 };
  const spot = [0, 0, 0, 0];
  // Бугай стоит в (0, 0, −10), лицом на юг (+z: yaw π — лицо в (−sin, −cos) = (0, +1)), бочонок — позади, у севера
  assert.ok(weakSpotWorld(Z_BRUTE, 0, 0, -10, Math.PI, 1, spot));
  // смотрим с севера на спину: из (0, 1.5, −20) вдоль +z
  assert.ok(aimWeak(Z_BRUTE, 0, 0, -10, Math.PI, 1, 0, spot[1], -20, 0, 0, 1, 70, out));
  assert.ok(Math.abs(out.y - spot[1]) < 1e-9);
  // тот же бугай, взгляд спереди (с юга): бочонок за телом
  assert.ok(!aimWeak(Z_BRUTE, 0, 0, -10, Math.PI, 1, 0, spot[1], 0, 0, 0, -1, 70, out));
  // мимо
  assert.ok(!aimWeak(Z_BRUTE, 0, 0, -10, Math.PI, 1, 5, spot[1], -20, 0, 0, 1, 70, out));
  // у обычного шаркуна слабого места нет
  assert.ok(WEAK_SPOTS[Z_WALKER] === undefined);
  assert.ok(!aimWeak(Z_WALKER, 0, 0, -10, Math.PI, 1, 0, 1.5, -20, 0, 0, 1, 70, out));
});

test('рост по ступени: только при elite в fideas', () => {
  assert.equal(mobScale(false, 2), 1);
  assert.equal(mobScale(true, 0), 1);
  assert.equal(mobScale(true, 1), 1.25);
  assert.equal(mobScale(true, 2), 1.5);
});
