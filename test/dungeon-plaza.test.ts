// «Подземелье» на площади (client/lobby/plaza/dungeon.ts): строки доски рекордов, время мм:сс, состав модели входа и
// расстановка скалы и доски (общие твёрдые предметы shared/plaza2.ts — их видят сервер и браузер одинаково).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import type { DgRec } from '../shared/dungeon/api.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { DUNGEON_BOARD, DUNGEON_ROCK, plazaSolids } from '../shared/plaza2.ts';
import { BOARD_ROWS, boardRows, recTime } from '../client/lobby/plaza/dungeon.ts';

const rec = (nick: string, waves: number, ms: number): DgRec => ({ nick, waves, ms, at: 0 });

test('время рекорда: мм:сс, секунды отбрасываются вниз, мусор — нули', () => {
  assert.equal(recTime(0), '00:00');
  assert.equal(recTime(59_999), '00:59');
  assert.equal(recTime(60_000), '01:00');
  assert.equal(recTime(332_400), '05:32');
  assert.equal(recTime(6_005_000), '100:05');
  assert.equal(recTime(-5), '00:00');
  assert.equal(recTime(Number.NaN), '00:00');
});

test('строки доски: топ-5, место, волны и время; рекорд игрока помечен без учёта регистра', () => {
  const list = [rec('Аня', 14, 600_000), rec('Боря', 12.9, 541_000), rec('Вика', 9, 300_000), rec('Гоша', 7, 200_000), rec('Даша', 5, 90_000), rec('Лишний', 4, 80_000)];
  const rows = boardRows(list, ' боря ');
  assert.equal(rows.length, BOARD_ROWS);
  assert.deepEqual(rows[0], { rank: 1, nick: 'Аня', waves: '14', time: '10:00', mine: false });
  assert.deepEqual(rows[1], { rank: 2, nick: 'Боря', waves: '12', time: '09:01', mine: true });
  assert.equal(rows.filter((r) => r.mine).length, 1);
  assert.deepEqual(boardRows([]), []);
  assert.ok(boardRows(list).every((r) => !r.mine), 'без ника подсветки нет');
});

test('модель входа: узлы, вывеска и лицо доски с развёрткой, клип моргания глаз', () => {
  const buf = fs.readFileSync(new URL('../client/assets/dungeon/plaza/plaza_entrance.glb', import.meta.url));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as {
    nodes: Array<{ name: string }>; animations: Array<{ name: string }>; meshes: Array<{ name: string; primitives: Array<{ attributes: Record<string, number> }> }>;
  };
  const names = json.nodes.map((n) => n.name);
  for (const n of ['plaza_cave_entrance', 'plaza_cave_entrance_eyes', 'plaza_cave_entrance_sign', 'plaza_records_board', 'board_face']) assert.ok(names.includes(n), `узел ${n}`);
  assert.ok(json.animations.some((a) => a.name === 'cave_eyes_blink'));
  for (const m of ['plaza_cave_entrance_sign', 'board_face']) {
    const mesh = json.meshes.find((x) => x.name === m)!;
    assert.ok(mesh.primitives[0].attributes.TEXCOORD_0 !== undefined, `${m}: есть развёртка под холст`);
  }
});

test('расстановка: зев смотрит на точку появления, твёрдые предметы режима есть и не закрывают тропу к аквапарку', () => {
  const lobby = buildLobby();
  const toSpawn = Math.atan2(lobby.spawn.x - DUNGEON_ROCK.x, lobby.spawn.z - DUNGEON_ROCK.z);
  assert.ok(Math.abs(toSpawn - DUNGEON_ROCK.yaw) < 0.05, `yaw скалы ${DUNGEON_ROCK.yaw} против ${toSpawn}`);
  const solids = plazaSolids().filter((s) => s.mode === 'dungeon');
  assert.equal(solids.length, 6, 'три бокса скалы, два столбика и плита доски');
  assert.equal(lobby.plazaModeBoxes.dungeon.length, solids.length);
  // тропа «точка появления → аквапарк» идёт по z 6…8 севернее скалы: ничто не заходит на полосу z < 8,1 (запас 0,1 м)
  for (const s of solids) assert.ok(s.z - s.hz >= 8.1, `предмет (${s.x}; ${s.z}) выходит на тропу`);
  // доска стоит лицом на север и не касается скалы (зазор ≥ 0,5 м по x) и фонаря (−14; 16)
  const board = solids.filter((s) => s.x > DUNGEON_BOARD.x - 1.6 && s.x < DUNGEON_BOARD.x + 1.6 && s.z > 13 && s.z < 15);
  assert.equal(board.length, 3);
  const rock = solids.filter((s) => !board.includes(s));
  for (const b of board) for (const r of rock) {
    const dx = Math.max(Math.abs(b.x - r.x) - b.hx - r.hx, 0);
    const dz = Math.max(Math.abs(b.z - r.z) - b.hz - r.hz, 0);
    assert.ok(Math.hypot(dx, dz) >= 0.5, 'доска вплотную к скале');
  }
  // у зева можно встать: точка «E» (−14,6; 10,5) в 1 м и дальше от любого твёрдого предмета
  for (const s of solids) {
    const d = Math.hypot(Math.max(Math.abs(-14.6 - s.x) - s.hx, 0), Math.max(Math.abs(10.5 - s.z) - s.hz, 0));
    assert.ok(d >= 0.5, `точка E у предмета (${s.x}; ${s.z})`);
  }
});
