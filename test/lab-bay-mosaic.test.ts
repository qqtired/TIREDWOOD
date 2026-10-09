import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBayMosaic, placeBayTile, rotateBayPorts, scoreBayMosaic,
  type BayTile, type BayMosaicState,
} from '../shared/lab-bay-mosaic.ts';

const tile = (ground: 'sand' | 'water', ports = 0): BayTile => ({ name: 'Проба', ground, ports });
const empty = (): Array<BayTile | null> => Array.from({ length: 9 }, () => null);

function place(state: BayMosaicState, cell: number): BayMosaicState {
  const result = placeBayTile(state, 0, cell, 0);
  assert.equal(result.ok, true);
  return result.state;
}

test('bay mosaic: поворот по часовой переводит север/восток в восток/юг', () => {
  assert.equal(rotateBayPorts(3, 1), 6);
  assert.equal(rotateBayPorts(3, 2), 12);
  assert.equal(rotateBayPorts(3, 4), 3);
  assert.equal(rotateBayPorts(3, -1), 9);
});

test('bay mosaic: размещение сохраняет выбранную ориентацию и не меняет прежнее состояние', () => {
  const state = { ...createBayMosaic(), offers: [tile('sand', 3), tile('water', 5), tile('sand')] };
  const before = structuredClone(state);
  const result = placeBayTile(state, 0, 4, 1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.board[4], tile('sand', 6));
  assert.equal(result.state.placed, 1);
  assert.equal(result.state.offers.length, 3);
  assert.deepEqual(state, before);
});

test('bay mosaic: занятая клетка не расходует плитку и ход', () => {
  const state = place(createBayMosaic(), 4);
  const before = structuredClone(state);
  assert.deepEqual(placeBayTile(state, 0, 4, 0), { ok: false, reason: 'occupied' });
  assert.deepEqual(state, before);
});

test('bay mosaic: ввод вне поля или набора не создаёт скрытые клетки', () => {
  const state = createBayMosaic();
  for (const cell of [-1, 9, 1.5, NaN]) {
    assert.deepEqual(placeBayTile(state, 0, cell, 0), { ok: false, reason: 'invalid' });
  }
  assert.deepEqual(placeBayTile(state, 3, 0, 0), { ok: false, reason: 'invalid' });
  assert.deepEqual(placeBayTile(state, 0, 0, Infinity), { ok: false, reason: 'invalid' });
  assert.equal(state.placed, 0);
});

test('bay mosaic: считает крупнейший пляж, не все песчаные плитки и не диагональ', () => {
  const board = empty();
  board[0] = tile('sand');
  board[1] = tile('sand');
  board[4] = tile('sand');
  board[8] = tile('sand');
  assert.deepEqual(scoreBayMosaic(board), { beach: 3, boardwalk: 0, total: 3 });
});

test('bay mosaic: настил соединяется только встречными выходами обеих плиток', () => {
  const board = empty();
  board[0] = tile('sand', 2);
  board[1] = tile('water', 12);
  board[4] = tile('water', 1);
  assert.deepEqual(scoreBayMosaic(board), { beach: 1, boardwalk: 3, total: 4 });
  board[1] = tile('water', 1);
  assert.deepEqual(scoreBayMosaic(board), { beach: 1, boardwalk: 1, total: 2 });
});

test('bay mosaic: край строки не соседствует с началом следующей', () => {
  const board = empty();
  board[2] = tile('sand', 2);
  board[3] = tile('sand', 8);
  assert.deepEqual(scoreBayMosaic(board), { beach: 1, boardwalk: 1, total: 2 });
});

test('bay mosaic: шестая плитка завершает раунд, новый раунд очищает поле', () => {
  let state = createBayMosaic();
  for (let cell = 0; cell < 6; cell++) {
    assert.ok(state.offers.length >= 2, 'перед каждым ходом есть выбор');
    state = place(state, cell);
  }
  assert.equal(state.placed, 6);
  assert.deepEqual(placeBayTile(state, 0, 6, 0), { ok: false, reason: 'finished' });
  const reset = createBayMosaic();
  assert.equal(reset.placed, 0);
  assert.deepEqual(reset.board, empty());
  assert.deepEqual(scoreBayMosaic(reset.board), { beach: 0, boardwalk: 0, total: 0 });
});
