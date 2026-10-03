// Следы шин: полоса из четырёхугольников без разрывов, новый след после паузы и прыжка, кольцевой буфер.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { SKID_MAX, SkidMarks } from '../client/race/skids.ts';

/** Сколько четырёхугольников уже нарисовано (у пустых время рождения −1e6) */
function quads(sk: SkidMarks): number {
  const born = sk.geo.getAttribute('aBorn').array;
  let n = 0;
  for (let q = 0; q < SKID_MAX; q++) if (born[q * 4] > -1e5) n++;
  return n;
}

/** Вершина v четырёхугольника q: [x, y, z] */
function vert(sk: SkidMarks, q: number, v: number): number[] {
  const p = sk.geo.getAttribute('position').array;
  const o = (q * 4 + v) * 3;
  return [p[o], p[o + 1], p[o + 2]];
}

test('след шин: полоса шириной с колесо, куски стыкуются без щелей', () => {
  const sk = new SkidMarks(new THREE.Scene());
  sk.mark(1, 0, 0.1, 0, 0.5);
  sk.mark(1, 0.2, 0.1, 0, 0.5);
  assert.equal(quads(sk), 0, 'первая точка и шаг меньше 0,4 м — ещё ничего');
  sk.mark(1, 0.5, 0.1, 0, 0.5);
  sk.mark(1, 1.0, 0.1, 0.1, 0.5);
  assert.equal(quads(sk), 2);
  // поперёк хода — 17 см
  const [l0, r0] = [vert(sk, 0, 0), vert(sk, 0, 1)];
  assert.ok(Math.abs(Math.hypot(l0[0] - r0[0], l0[2] - r0[2]) - 0.17) < 1e-6);
  assert.equal(l0[1], Math.fround(0.1), 'на высоте асфальта');
  // начало второго куска — конец первого
  assert.deepEqual(vert(sk, 1, 0), vert(sk, 0, 3));
  assert.deepEqual(vert(sk, 1, 1), vert(sk, 0, 2));
});

test('след шин: колесо перестало скользить или прыгнуло — новая полоса, без перемычки', () => {
  const sk = new SkidMarks(new THREE.Scene());
  sk.mark(7, 0, 0, 0, 0.5);
  sk.mark(7, 0.5, 0, 0, 0.5);
  assert.equal(quads(sk), 1);
  sk.lift(7);
  sk.mark(7, 2, 0, 0, 0.5);
  assert.equal(quads(sk), 1, 'после паузы — только начало новой полосы');
  sk.mark(7, 2.5, 0, 0, 0.5);
  assert.equal(quads(sk), 2);
  sk.mark(7, 12, 0, 0, 0.5);
  assert.equal(quads(sk), 2, 'прыжок на 9,5 м (возврат на трассу) — не тянем полосу через полтрассы');
  sk.mark(8, 0, 0, 5, 0.5);
  sk.mark(8, 0.5, 0, 5, 0.5);
  assert.equal(quads(sk), 3, 'у каждого колеса своя полоса');
});

test('след шин: кольцевой буфер — старые куски затираются, стереть — новый заезд', () => {
  const sk = new SkidMarks(new THREE.Scene());
  for (let i = 0; i <= SKID_MAX + 10; i++) sk.mark(1, i * 0.5, 0, 0, 0.5);
  assert.equal(quads(sk), SKID_MAX);
  assert.equal(vert(sk, 0, 2)[0], (SKID_MAX + 1) * 0.5, 'первый кусок уже перезаписан новым');
  sk.update(0.016);
  sk.clear();
  assert.equal(quads(sk), 0);
});
