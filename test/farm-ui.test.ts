// Интерфейс фермы на ките: чистая логика без DOM — пояс семян, подсказка E, плашка Древа, форматы времени.
// Разметка и окна проверяются снимками (docs: отчёт задачи 6); здесь — то, что решает, что именно показать.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyFarm, type FarmProgress } from '../shared/farm.ts';
import { CROPS, RAKE_BEDS, WELL_SETS } from '../shared/farmdata.ts';
import type { FarmBedView } from '../shared/farmnet.ts';
import type { FarmBossView } from '../shared/farmsys.ts';
import { BELT_SLOTS, accusative, beltCrops, beltStart, beltStep, plantCost, rakeTargets } from '../client/farm/ui/belt-model.ts';
import { clockHour, fmtLeft, fmtMin, mskHour, plural } from '../client/farm/ui/fmt.ts';
import { bedPrompt, canHelpBed, helpPrompt, troughPrompt, usePrompt } from '../client/farm/ui/prompt-model.ts';
import { PHASE_NAMES, bloomShare, contribLine, treeEvent, treeLine } from '../client/farm/ui/tree-model.ts';

const NOW = Date.UTC(2026, 9, 11, 9, 0, 0);

function farmAt(level: number): FarmProgress {
  const f = emptyFarm(NOW);
  // опыт, с которого начинается уровень level (shared/farm.ts farmLevel)
  f.xp = level > 1 ? [0, 0, 200, 500, 900, 1500, 2300, 3300, 4500, 6000, 8000, 10500, 13500][level] ?? 0 : 0;
  return f;
}

// ------------------------------------------------------------ пояс семян

test('пояс: открытые культуры и ближайшие закрытые, не больше девяти ячеек в окне', () => {
  const list = beltCrops(1);
  assert.ok(list.length >= 2);
  assert.ok(list.every((c) => c.level <= 2), 'видно только следующий уровень');
  assert.ok(list.some((c) => c.level === 2), 'следующая культура — силуэтом с «ур. N»');
  const all = beltCrops(99);
  assert.equal(all.length, CROPS.length);
  assert.ok(all.length > BELT_SLOTS, 'культур больше девяти — окно едет');
});

test('пояс: окно из девяти ячеек всегда держит выбранную и не прыгает', () => {
  assert.equal(beltStart(0, 4, 19), 0, 'выбор внутри окна — окно стоит');
  assert.equal(beltStart(0, 9, 19), 1, 'вышли вправо — сдвиг ровно на шаг');
  assert.equal(beltStart(5, 2, 19), 2, 'вышли влево');
  assert.equal(beltStart(0, 18, 19), 10, 'в конце списка окно упирается в край');
  assert.equal(beltStart(3, 0, 5), 0, 'культур меньше девяти — окно с нуля');
});

test('пояс: колесо идёт по кругу', () => {
  assert.equal(beltStep(0, 1, 5), 1);
  assert.equal(beltStep(4, 1, 5), 0);
  assert.equal(beltStep(0, -1, 5), 4);
  assert.equal(beltStep(0, 1, 0), 0);
});

test('пояс: «Посадить тыкву», «Собрать шляпку гриба» — винительный падеж', () => {
  assert.equal(accusative('Тыква'), 'тыкву');
  assert.equal(accusative('Редис'), 'редис');
  assert.equal(accusative('Клубника'), 'клубнику');
  assert.equal(accusative('Шляпка гриба'), 'шляпку гриба');
  assert.equal(accusative('Пучок укропа'), 'пучок укропа');
  assert.equal(accusative('Лист салата'), 'лист салата');
  assert.equal(accusative('Мифическая шляпка'), 'мифическую шляпку');
  assert.equal(accusative('Древо жизни'), 'древо жизни');
});

test('пояс: грабли берут выбранную и ближайшие пустые грядки, не больше запаса', () => {
  const pos = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 1 }, { x: 5, z: 5 }];
  assert.deepEqual(rakeTargets([false, false, false, false, false], 3, 0, pos), [0, 1, 3]);
  assert.deepEqual(rakeTargets([false, true, false, false, false], 3, 0, pos), [0, 3, 2], 'занятую пропускаем');
  assert.deepEqual(rakeTargets([false, false], 1, 0, pos), [0], 'без граблей — одна');
  assert.deepEqual(rakeTargets([false], 3, 7, pos), [], 'нет такой грядки');
  assert.ok(RAKE_BEDS.length >= 2);
});

test('пояс: цена — первая посадка новой культуры даром, для одной грядки', () => {
  assert.equal(plantCost(10, 1, true), 0);
  assert.equal(plantCost(10, 3, true), 20);
  assert.equal(plantCost(10, 3, false), 30);
});

// ------------------------------------------------------------ подсказка E

test('подсказка: закрытая грядка называет уровень, пустая отдаёт пояс', () => {
  const f = farmAt(1);
  const locked = bedPrompt(f, 3, NOW, 6);
  assert.notEqual(locked, 'belt');
  if (locked !== 'belt') {
    assert.equal(locked.keys.length, 0, 'серая подсказка без клавиши');
    assert.match(locked.text, /ур\. 6/);
  }
  assert.equal(bedPrompt(f, 0, NOW, 1), 'belt');
});

test('подсказка: растёт без воды — «Полить» с «было → станет», без воды в лейке — серая', () => {
  const f = farmAt(1);
  f.beds[0] = { crop: 'radish', plantedAt: NOW, ripeAt: NOW + 10 * 60_000, watered: false, helpers: [] };
  f.water = 500;
  const p = bedPrompt(f, 0, NOW, 1);
  assert.notEqual(p, 'belt');
  if (p === 'belt') return;
  assert.deepEqual(p.keys, ['E']);
  assert.match(p.text, /^Полить редис/);
  assert.equal(p.strong, '10:00 → 8:00', 'полив срезает 20 % оставшегося');
  f.water = 0;
  const dry = bedPrompt(f, 0, NOW, 1);
  assert.ok(dry !== 'belt' && dry.keys.length === 0);
  f.water = 500;
  f.beds[0].watered = true;
  const done = bedPrompt(f, 0, NOW, 1);
  assert.ok(done !== 'belt' && done.keys.length === 0 && done.text === 'Полито');
});

test('подсказка: спелая — «Собрать» с опытом и сумкой, сумка полна — серая', () => {
  const f = farmAt(1);
  f.beds[0] = { crop: 'radish', plantedAt: NOW - 100_000, ripeAt: NOW - 1, watered: false, helpers: [] };
  const p = bedPrompt(f, 0, NOW, 1);
  assert.ok(p !== 'belt');
  assert.deepEqual(p.keys, ['E']);
  assert.match(p.text, /^Собрать /);
  assert.ok(p.pills?.some((x) => /^\+\d+ опыта$/.test(x.text)));
  f.bag = { radish: 9999 };
  const full = bedPrompt(f, 0, NOW, 1);
  assert.ok(full !== 'belt' && full.keys.length === 0 && full.text === 'Сумка полна');
});

test('подсказка: корыто, соседская грядка, общие места', () => {
  const f = farmAt(3);
  f.water = 0;
  const t = troughPrompt(f, 1000, NOW);
  assert.deepEqual(t.keys, ['E']);
  assert.ok(t.pills?.[0].text.includes(`из ${WELL_SETS}`));
  f.water = 1000;
  assert.equal(troughPrompt(f, 1000, NOW).keys.length, 0, 'лейка полная — серая');

  const bed: FarmBedView = { c: 'radish', p: NOW - 1000, r: NOW + 120_000, w: false, h: 0 };
  assert.ok(canHelpBed(bed, NOW));
  assert.ok(!canHelpBed({ ...bed, r: NOW + 5_000 }, NOW), 'до созревания меньше 20 с');
  assert.ok(!canHelpBed({ ...bed, h: 3 }, NOW), 'уже помогли трое');
  assert.ok(!canHelpBed({ ...bed, c: null }, NOW));
  f.water = 500;
  const h = helpPrompt(f, 'Паша', 2, bed, NOW);
  assert.deepEqual(h.keys, ['E']);
  assert.match(h.whose?.text ?? '', /Паша · участок 3/);
  f.water = 0;
  assert.equal(helpPrompt(f, 'Паша', 2, bed, NOW).keys.length, 0);
  f.xp = 0;
  assert.match(helpPrompt(f, 'Паша', 2, bed, NOW).note ?? '', /с ур\./);

  assert.equal(usePrompt('grib', f, NOW)?.text, 'Дядюшка Гриб');
  assert.equal(usePrompt('troughN', f, NOW), null);
  assert.ok(usePrompt('van', f, NOW)?.pills?.length);
});

// ------------------------------------------------------------ Древо

function boss(over: Partial<FarmBossView>): FarmBossView {
  return { st: 'awake', start: NOW - 1000, end: NOW + 3_600_000, hp: 10_000, bloom: 6_200, phase: 3, n: 5, top: [], mine: 800, place: 3, cones: [], ...over };
}

test('Древо: плашка «просыпается» с полосой до начала и «цветёт» с фазой и вкладом', () => {
  assert.equal(treeEvent(null, NOW), null);
  assert.equal(treeEvent(boss({ st: 'sleep' }), NOW), null);
  const soon = treeEvent(boss({ st: 'soon', start: NOW + 60_000, bloom: 0 }), NOW)!;
  assert.equal(soon.kind, 'soon');
  assert.equal(soon.timer, '1:00');
  assert.ok(soon.v > 0.7 && soon.v < 0.9, 'за минуту до начала полоса почти полная');
  assert.deepEqual(soon.marks, []);
  const on = treeEvent(boss({}), NOW)!;
  assert.equal(on.kind, 'awake');
  assert.equal(on.pct, 62);
  assert.equal(on.phaseName, 'Щекотно');
  assert.equal(on.contrib, 'ты 3-й, вклад 13 %');
  assert.deepEqual(on.marks, [0.25, 0.5, 0.75], 'отметки фаз на полосе');
  assert.equal(on.timer, `до ${clockHour(mskHour(NOW + 3_600_000))}`);
});

test('Древо: доля цветения, фазы и строка вклада', () => {
  assert.equal(bloomShare({ bloom: 5000, hp: 10_000 }), 0.5);
  assert.equal(bloomShare({ bloom: 99_999, hp: 10_000 }), 1);
  assert.equal(bloomShare({ bloom: 0, hp: 0 }), 0);
  assert.equal(PHASE_NAMES.length, 4);
  assert.equal(contribLine({ bloom: 1000, mine: 0, place: 0 }), 'собирай урожай — помогай Древу');
  const l = treeLine(boss({}), NOW, NOW + 1, '19:00');
  assert.equal(l.sleeping, false);
  assert.equal(treeLine(null, NOW, NOW + 7_200_000, '19:00').sleeping, true);
});

// ------------------------------------------------------------ форматы

test('форматы: остаток времени, минуты, склонение', () => {
  assert.equal(fmtLeft(0), '0:00');
  assert.equal(fmtLeft(61_000), '1:01');
  assert.equal(fmtLeft(3_600_000 + 120_000), '1 ч 2 мин');
  assert.equal(fmtMin(45), '45 мин');
  assert.equal(fmtMin(120), '2 ч');
  assert.equal(fmtMin(125), '2 ч 5 мин');
  assert.equal(plural(1, 'грядка', 'грядки', 'грядок'), 'грядка');
  assert.equal(plural(3, 'грядка', 'грядки', 'грядок'), 'грядки');
  assert.equal(plural(11, 'грядка', 'грядки', 'грядок'), 'грядок');
  assert.equal(clockHour(24), '00:00');
  assert.equal(clockHour(7), '07:00');
});
