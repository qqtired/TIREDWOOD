// Бюджет отрисовки новой набережной (PLAZA3, WP13, client/lobby/plaza3/perf.ts): какие материалы приводим к общему виду,
// с какого расстояния не рисуем мелочь, где отсечение работает и что греем из спрятанного. Чистые решения, без WebGL.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { UNIT_MAX_R, canonOf, cullDistance, inArea, paintsLate, warmHidden } from '../client/lobby/plaza3/perf.ts';

test('дальность: мелочь — с 20 м, вывеска 2 м — с 45 м, катер 3 м — с 67 м, растёт с размером', () => {
  assert.equal(cullDistance(0.05), 20);
  assert.equal(cullDistance(0.5), 30);
  assert.equal(cullDistance(2), 45);
  assert.equal(cullDistance(3), 67.5);
  assert.equal(cullDistance(UNIT_MAX_R), 180);
  for (let r = 0; r < UNIT_MAX_R; r += 0.25) assert.ok(cullDistance(r + 0.25) >= cullDistance(r), `монотонно при r=${r}`);
});

test('отсекаем на суше, в порту и у мола, задник за рамкой не трогаем', () => {
  assert.ok(inArea(8, -5.6), 'спавн');
  assert.ok(inArea(-6, 14), 'порт');
  assert.ok(inArea(-68, 58), 'мол');
  assert.ok(!inArea(-490, 19), 'дальний берег');
  assert.ok(!inArea(120, 0), 'город на востоке');
  assert.ok(!inArea(0, -80), 'город на севере');
});

test('общий вид: простые стандартные, неосвещённые и точки — да; свой шейдер, желейка, ферма — нет', () => {
  assert.deepEqual(canonOf(new THREE.MeshStandardMaterial(), false), { vc: true, map: true });
  assert.deepEqual(canonOf(new THREE.MeshBasicMaterial(), false), { vc: true, map: true });
  assert.deepEqual(canonOf(new THREE.PointsMaterial(), false), { vc: true, map: false });
  assert.equal(canonOf(new THREE.MeshStandardMaterial(), true), null, 'желейка');
  assert.equal(canonOf(new THREE.MeshStandardMaterial({ name: 'farm_soft' }), false), null, 'ферма');
  const own = new THREE.MeshStandardMaterial();
  own.customProgramCacheKey = () => 'durak-card';
  assert.equal(canonOf(own, false), null, 'свой шейдер');
  const keep = new THREE.MeshBasicMaterial();
  keep.userData.p3keep = true;
  assert.equal(canonOf(keep, false), null, 'p3keep');
  assert.equal(canonOf(new THREE.MeshLambertMaterial(), false), null, 'ламберт — как есть');
  const def = new THREE.MeshStandardMaterial();
  def.defines = { STANDARD: '', USE_FOO: '' };
  assert.equal(canonOf(def, false), null, 'свои defines');
});

test('«рисованный» вид поздней модели: без своего шейдера, не желейка, не ферма и ещё не крашеное', () => {
  assert.ok(paintsLate(new THREE.MeshStandardMaterial(), false));
  assert.ok(!paintsLate(new THREE.MeshStandardMaterial(), true), 'желейка');
  assert.ok(!paintsLate(new THREE.MeshStandardMaterial({ name: 'farm_soft' }), false), 'ферма');
  const own = new THREE.MeshStandardMaterial();
  own.customProgramCacheKey = () => 'billiard-balls-v1';
  assert.ok(!paintsLate(own, false), 'свой шейдер');
  const painted = new THREE.MeshStandardMaterial();
  const key = painted.customProgramCacheKey();
  painted.customProgramCacheKey = () => key + '|look2g';
  assert.ok(!paintsLate(painted, false), 'уже крашено');
});

test('прогрев спрятанного: отдельная сетка со своим шейдером (дождь, след лодки) — да; группа события — нет', () => {
  const rain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial());
  assert.ok(warmHidden(rain));
  const event = new THREE.Group();
  event.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial()));
  assert.ok(!warmHidden(event), 'группа');
  assert.ok(!warmHidden(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial())), 'обычный материал');
});
