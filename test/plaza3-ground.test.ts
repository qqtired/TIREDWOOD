// Земля новой набережной в текстурах (PLAZA3, client/lobby/plaza3/ground.ts): каждая заливка блокаута — со своей картинкой,
// развёртка в метрах (на полу и на стенке), картинки и их происхождение на месте. Без WebGL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { SURFACES, TEX, dressPlaza3Ground, roseUv, worldUv } from '../client/lobby/plaza3/ground.ts';
import { P3 } from '../shared/plaza3/layout.ts';

const ROOT = new URL('../', import.meta.url);

test('у каждого цвета земли блокаута (plaza3/world.ts) есть поверхность с картинкой', () => {
  const src = fs.readFileSync(new URL('client/lobby/plaza3/world.ts', ROOT), 'utf8');
  // цвета земли — константы от STONE до первой функции (flat)
  const block = src.slice(src.indexOf('const STONE'), src.indexOf('function flat'));
  const colors = [...block.matchAll(/0x([0-9a-f]{6})/gi)].map((m) => parseInt(m[1], 16));
  assert.ok(colors.length >= 13, `цветов в world.ts: ${colors.length}`);
  const keys = new Set(SURFACES.map((s) => s.key));
  for (const c of colors) assert.ok(keys.has(c), `нет поверхности для 0x${c.toString(16)}`);
  assert.equal(keys.size, SURFACES.length, 'ключи не повторяются');
});

test('развёртка в метрах: пол — по x и z, стенка — вдоль края и по высоте, повтор без растяжки', () => {
  assert.deepEqual(worldUv(7.2, 0, -3.6, 0, 1, 0, 3.6), [2, 1]);
  // стенка вдоль x (нормаль по z): u растёт вдоль края, v — по высоте
  const [u0, v0] = worldUv(0, -3.2, 22, 0, 0, 1, 3.3);
  const [u1, v1] = worldUv(3.3, 0, 22, 0, 0, 1, 3.3);
  assert.ok(Math.abs(Math.abs(u1 - u0) - 1) < 1e-9, 'метр вдоль стенки — 1/tile');
  assert.ok(Math.abs(v1 - v0 - 3.2 / 3.3) < 1e-9);
  const rose = P3.ground.find((g) => g.kind === 'rose')!.circle!;
  assert.deepEqual(roseUv(rose.x, rose.z), [0.5, 0.5]);
  assert.deepEqual(roseUv(rose.x + rose.r, rose.z), [1, 0.5]);
});

test('меш земли делится по картинкам, неизвестное остаётся как было', () => {
  const parts = [0xd2c3aa, 0xe9e0cc, 0x123456].map((hex, i) => {
    const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(i * 3, 0, 0).toNonIndexed();
    const c = new THREE.Color(hex);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count).fill(0).flatMap(() => [c.r, c.g, c.b]), 3));
    g.deleteAttribute('uv');
    return g;
  });
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arrs = parts.map((p) => p.getAttribute(name).array as Float32Array);
    const all = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrs) all.set(a, (o += a.length) - a.length);
    merged.setAttribute(name, new THREE.BufferAttribute(all, 3));
  }
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true }));
  mesh.name = 'plaza3-ground';
  group.add(mesh);
  const made = dressPlaza3Ground(group, (m) => m);
  assert.deepEqual(made.map((m) => m.name).sort(), ['plaza3-ground-deck', 'plaza3-ground-plaza']);
  for (const m of made) {
    assert.equal(m.geometry.getAttribute('uv').count, 6);
    const mat = m.material as THREE.MeshStandardMaterial;
    assert.ok(mat.map && mat.vertexColors, 'карта (пока заглушка) и цвет вершин — как у остальной статики');
  }
  assert.equal(mesh.parent, group, 'неизвестный цвет остался в исходном меше');
  assert.equal(mesh.geometry.getAttribute('position').count, 6);
});

test('картинки на месте, у каждой — строка в PROVENANCE.md', () => {
  const dir = new URL('client/assets/plaza3/ground/', ROOT);
  const prov = fs.readFileSync(new URL('PROVENANCE.md', dir), 'utf8');
  for (const t of Object.values(TEX)) {
    assert.ok(fs.statSync(new URL(`${t.file}.jpg`, dir)).size > 20_000, t.file);
    assert.ok(prov.includes(`${t.file}.jpg`), `${t.file}.jpg в PROVENANCE.md`);
  }
});
