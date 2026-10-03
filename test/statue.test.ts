// Статуя у мостков к маяку: модель читается, статуя твёрдая и не мешает пройти к маяку.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeStatue } from '../client/lobby/statueFormat.ts';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { STATUE, buildLobby } from '../shared/maps/lobby.ts';
import { CollisionWorld, makeRayHit } from '../shared/world.ts';

const lobby = buildLobby();
const lw = new CollisionWorld(lobby);

function freeSpot(x: number, z: number): boolean {
  return !lw.overlaps(x - PLAYER_HALF, 0.01, z - PLAYER_HALF, x + PLAYER_HALF, PLAYER_HEIGHT, z + PLAYER_HALF);
}

test('модель статуи: голова и тело, индексы в пределах, рост и ширина как у человека', () => {
  const file = readFileSync(new URL('../client/assets/statue/statue.bin', import.meta.url));
  const meshes = decodeStatue(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  assert.deepEqual([...meshes.keys()], ['head', 'body']);
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [name, m] of meshes) {
    const n = m.position.length / 3;
    assert.ok(n > 5000, `${name}: вершин ${n}`);
    assert.equal(m.normal.length, n * 4, `${name}: нормали`);
    assert.equal(m.uv.length, n * 2, `${name}: развёртка`);
    assert.equal(m.index.length % 3, 0, `${name}: треугольники`);
    let maxIdx = 0;
    for (const i of m.index) if (i > maxIdx) maxIdx = i;
    assert.ok(maxIdx < n, `${name}: индекс ${maxIdx} < ${n}`);
    // треугольники смотрят наружу: иначе three.js отсекает лицевую сторону и видно изнанку
    let volume = 0;
    const p = m.position;
    for (let t = 0; t < m.index.length; t += 3) {
      const a = m.index[t] * 3;
      const b = m.index[t + 1] * 3;
      const c = m.index[t + 2] * 3;
      volume += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    assert.ok(volume > 0, `${name}: сетка вывернута (объём ${volume / 6})`);
    for (let i = 0; i < n; i++) {
      const x = m.position[i * 3];
      const y = m.position[i * 3 + 1];
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${name}: вершина ${i}`);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  assert.ok(Math.abs(minY) < 0.01, `подошвы на земле: ${minY}`);
  assert.ok(maxY > 1.75 && maxY < 1.9, `рост ${maxY}`);
  // правая рука отведена в сторону (честь), левая вдоль тела
  assert.ok(minX < -0.45 && minX > -0.6, `локоть правой руки: ${minX}`);
  assert.ok(maxX > 0.2 && maxX < 0.3, `левая рука: ${maxX}`);
});

test('статуя у мостков: твёрдая, проход на мостки и дорога от точки появления свободны', () => {
  assert.ok(!freeSpot(STATUE.x, STATUE.z), 'сквозь статую не пройти');
  assert.ok(lw.groundBelow(STATUE.x, 2.5, STATUE.z) < 0.5 || lw.overlaps(STATUE.x - 0.1, 2.4, STATUE.z - 0.1, STATUE.x + 0.1, 2.5, STATUE.z + 0.1), 'наверх не запрыгнуть');
  // проход на мостки (x −21…−17) у края набережной
  for (const x of [-20.2, -19, -17.8]) for (const z of [19.5, 21, 23]) assert.ok(freeSpot(x, z), `проход ${x},${z}`);
  // от точки появления к мосткам — прямая дорога на высоте желейки
  const hit = makeRayHit();
  const { x, z } = lobby.spawn;
  const tx = -19;
  const tz = 21;
  const len = Math.hypot(tx - x, tz - z);
  assert.ok(!lw.raycast(x, 1, z, (tx - x) / len, 0, (tz - z) / len, len, hit, false), 'дорога к маяку свободна');
  // вокруг постамента можно обойти
  for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
    const sx = STATUE.x + dx;
    const sz = STATUE.z + dz;
    if (sx < -29.2 || sz > 21.2) continue; // у самого края воды не ходим
    assert.ok(freeSpot(sx, sz), `обход ${sx},${sz}`);
  }
});
