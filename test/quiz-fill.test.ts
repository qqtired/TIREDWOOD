// «Ракушка» 1.1, C6: заливка «Крокодила» считается у всех одинаково по маске мазков (client/lobby/quiz/ui/fill.ts);
// E1 + E3: праздник по переходу снимка и пятно света под главным (client/lobby/quiz/cues.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FillGrid, GW, fillLayer, itemsOf, type InkItem } from '../client/lobby/quiz/ui/fill.ts';
import { QZ_CROC, type QzBoard } from '../shared/quiz/types.ts';
import { spotSlot, stageCue } from '../client/lobby/quiz/cues.ts';

/** Квадрат 200..400 × 200..400 тонкой линией (толщина 0 — 4 px) */
const box: InkItem = { k: 's', id: 1, c: 0, w: 0, pts: [200, 200, 400, 200, 400, 400, 200, 400, 200, 200] };
const at = (layer: Uint8Array, x: number, y: number): number => layer[(y >> 1) * GW + (x >> 1)];

test('заливка внутри квадрата не выходит за линию', () => {
  const layer = fillLayer([box, { k: 'f', id: 2, c: 3, x: 300, y: 300 }]);
  assert.equal(at(layer, 300, 300), 4, 'внутри — цвет 3');
  assert.equal(at(layer, 210, 390), 4, 'у самого угла внутри');
  assert.equal(at(layer, 100, 100), 0, 'снаружи не залито');
  assert.equal(at(layer, 500, 300), 0, 'справа снаружи не залито');
  // заливка заходит под линию на клетку (без белой каймы), но не насквозь
  assert.equal(at(layer, 197, 300), 0, 'за линией слева пусто');
});

test('у всех одинаково: тот же рисунок — тот же слой, пачками или целиком', () => {
  const fill: InkItem = { k: 'f', id: 2, c: 5, x: 300, y: 300 };
  const a = fillLayer([box, fill]);
  // живой рисунок: мазок приходит кусками, потом заливка
  const g = new FillGrid();
  g.reset();
  const pts = box.k === 's' ? box.pts : [];
  g.stroke(0, 0, pts.slice(0, 4), 0);
  g.stroke(0, 0, pts.slice(0, 8), 4);
  g.stroke(0, 0, pts, 8);
  g.flood(5, 300, 300);
  assert.deepEqual(g.fill, a);
  // по письму qzInk (как полный рисунок с сервера)
  assert.deepEqual(fillLayer(itemsOf([['s', 1, 0, 0, ...pts.slice(0, 6)], ['s', 1, 0, 0, ...pts.slice(6)], ['f', 2, 5, 300, 300]])), a);
});

test('разрыв в линии — заливка утекает; клик по линии ничего не красит', () => {
  const open: InkItem = { k: 's', id: 1, c: 0, w: 0, pts: [200, 200, 400, 200, 400, 400, 200, 400, 200, 260] };
  assert.equal(at(fillLayer([open, { k: 'f', id: 2, c: 1, x: 300, y: 300 }]), 100, 100), 2, 'через разрыв залито снаружи');
  const g = new FillGrid();
  g.build([box]);
  assert.equal(g.flood(1, 300, 200), 0, 'клик по линии — ноль клеток');
});

test('отмена заливки и ластик', () => {
  const items: InkItem[] = [box, { k: 'f', id: 2, c: 2, x: 300, y: 300 }];
  // отмена ['u', 2] — слоя заливки нет
  const undone = fillLayer(itemsOf([['s', 1, 0, 0, ...(box.k === 's' ? box.pts : [])], ['f', 2, 2, 300, 300], ['u', 2]]));
  assert.equal(undone.some((v) => v !== 0), false);
  // ластик после заливки стирает её под собой; новая заливка после ластика снова красит
  const eraser: InkItem = { k: 's', id: 3, c: QZ_CROC.ERASER, w: 1, pts: [300, 300] };
  const erased = fillLayer([...items, eraser]);
  assert.equal(at(erased, 300, 300), 0);
  assert.equal(at(erased, 380, 380), 3);
  assert.equal(at(fillLayer([...items, eraser, { k: 'f', id: 4, c: 6, x: 300, y: 300 }]), 300, 300), 7);
});

// E1 + E3 (client/lobby/quiz/cues.ts): праздник — по переходу снимка, один раз; пятно — под главным

test('праздник по переходу снимка: «Все угадали» — хлопают один раз; пятно под рисующим', () => {
  const base = { rev: 1, now: 0, phase: 'game', endsAt: 0, mode: 'croc', count: 3, seated: 3, vote: null, riddle: null, results: null, evening: [], noTokens: false, zat: null } as unknown as QzBoard;
  const croc = (step: string, last: unknown = null): QzBoard => ({ ...base, croc: { step, drawer: { slot: 5, nick: 'Петя' }, drawing: 2, last } } as unknown as QzBoard);
  const draw = croc('draw'), reveal = croc('reveal', { end: 'all', word: 'кит', drawer: { slot: 5, nick: 'Петя' }, guessed: 2 });
  assert.equal(spotSlot(draw), 5);
  assert.equal(spotSlot(reveal), 0);
  assert.deepEqual(stageCue(draw, reveal), { applause: true, party: 4 });
  assert.equal(stageCue(reveal, { ...reveal, rev: 2 }), null, 'тот же итог в следующем снимке — без повтора');
  assert.equal(stageCue(null, reveal), null, 'вошёл посреди итога — не хлопаем');
});
