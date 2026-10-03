// Башни крепости (client/fort/turrets): модели всех типов и ступеней, уровни → облик, анимации без NaN, выстрелы из дула.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TOWERS, TOWER_MAX_LEVEL, TW_BALLISTA, TW_BRAZIER, TW_CANNON, TW_TAR } from '../shared/fortarsenal.ts';
import { TOWER_SPOTS } from '../shared/fortmap.ts';
import { STAGES, buildModel, stageOf, starsOf } from '../client/fort/turrets/models.ts';
import { TURRET_SCALE, Turrets3D } from '../client/fort/turrets/turrets3d.ts';

const TYPES = [TW_BALLISTA, TW_CANNON, TW_TAR, TW_BRAZIER];

function tris(g: THREE.BufferGeometry | null | undefined): number {
  if (!g) return 0;
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

test('уровни 1…10 дают четыре ступени облика и звёзды 1–3 внутри ступени', () => {
  const stages = [];
  const stars = [];
  for (let lv = 1; lv <= TOWER_MAX_LEVEL; lv++) {
    stages.push(stageOf(lv));
    stars.push(starsOf(lv));
  }
  assert.deepEqual(stages, [0, 0, 0, 1, 1, 1, 2, 2, 2, 3]);
  assert.deepEqual(stars, [1, 2, 3, 1, 2, 3, 1, 2, 3, 3]);
  assert.equal(TOWERS.length, TYPES.length);
});

test('модели: у всех деталей цвет и металл в вершинах, конечные координаты, разумный размер и бюджет треугольников', () => {
  for (const type of TYPES) {
    let prev = 0;
    for (let stage = 0; stage < STAGES; stage++) {
      const m = buildModel(type, stage, 8);
      const parts = [m.base, m.turn, m.gun, m.arm, m.wheel, m.tarTop, m.jaw, m.bellows].filter((p) => p !== null);
      let total = 0;
      const box = new THREE.Box3();
      for (const p of parts) {
        const g = p.geo;
        for (const a of ['position', 'normal', 'color', 'aMat']) assert.ok(g.getAttribute(a), `${TOWERS[type].name} ${stage}: нет ${a}`);
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) assert.ok(Number.isFinite((pos.array as Float32Array)[i]));
        g.computeBoundingBox();
        box.union(g.boundingBox!);
        total += tris(g) * (p === m.arm ? m.bows.length * 2 : p === m.wheel ? 2 : 1);
      }
      // одна башня — не больше 10,5 тысячи треугольников (все восемь мест на 10-м уровне — до 85 тысяч)
      assert.ok(total < 10500, `${TOWERS[type].name} ступень ${stage}: ${total} треугольников`);
      // растёт вместе со ступенью (деталей больше), но не в разы
      if (stage > 0) assert.ok(total >= prev * 0.9, `${TOWERS[type].name}: ступень ${stage} беднее предыдущей`);
      prev = total;
      // стоит на ходу стены и не шире прохода; флагшток — выше зубцов, но не мачта
      assert.ok(m.flag.y > 1.5 && m.flag.y < 3, `${TOWERS[type].name} ${stage}: флаг на ${m.flag.y}`);
      assert.ok(m.turnY >= 0 && m.turnY < 1.2);
      assert.ok(m.shadowR > 0.5 && m.shadowR < 1.3);
      assert.ok(box.min.y > -0.6, `${TOWERS[type].name} ${stage}: ниже хода стены ${box.min.y}`);
    }
  }
});

test('Turrets3D: вход посреди игры без анимаций, постройка и улучшение с анимацией, смена облика на подскоке', () => {
  const scene = new THREE.Scene();
  const t3 = new Turrets3D(scene, 'high');
  const types = [0, 1, 2, 3, -1, -1, -1, -1];
  const levels = [1, 5, 10, 3, 0, 0, 0, 0];
  t3.setAll(types, levels);
  assert.deepEqual(t3.info.shown, types);
  for (const s of t3.spots) assert.equal(s.build, -1, 'первый снимок — уже стоят, без постройки');
  t3.update(1 / 60, new THREE.Vector3(0, 6, 0));
  // постройка на пустом месте
  types[4] = TW_CANNON;
  levels[4] = 1;
  t3.setAll(types, levels);
  assert.ok(t3.spots[4].build >= 0, 'новая башня вырастает');
  // улучшение 3 → 4: ступень меняется не сразу, а в верхней точке подскока
  levels[3] = 4;
  t3.setAll(types, levels);
  assert.ok(t3.spots[3].up >= 0);
  assert.equal(t3.spots[3].shownStage, 0);
  for (let i = 0; i < 90; i++) t3.update(1 / 60, new THREE.Vector3(0, 6, 0));
  assert.equal(t3.spots[3].shownStage, 1);
  assert.equal(t3.spots[3].up, -1);
  assert.equal(t3.spots[4].build, -1);
  // снос — уходит в стену, место пустеет
  types[0] = -1;
  t3.setAll(types, levels);
  for (let i = 0; i < 60; i++) t3.update(1 / 60, null);
  assert.equal(t3.info.shown[0], -1);
  t3.reset();
  assert.deepEqual(t3.info.shown, [-1, -1, -1, -1, -1, -1, -1, -1]);
  t3.dispose();
});

test('Turrets3D: выстрелы всех типов на всех ступенях — из дула перед башней, матрицы конечны, частиц в пределах', () => {
  const scene = new THREE.Scene();
  const t3 = new Turrets3D(scene, 'high');
  const out = new THREE.Vector3();
  const cam = new THREE.Vector3(0, 6, 0);
  const zombie = new THREE.Vector3();
  const where = (zid: number, o: THREE.Vector3): boolean => {
    if (zid !== 7) return false;
    o.copy(zombie);
    return true;
  };
  for (const lv of [1, 4, 7, 10]) {
    const types = TOWER_SPOTS.map((_, i) => TYPES[i % 4]);
    t3.reset();
    t3.setAll(types, types.map(() => lv));
    for (let k = 0; k < 240; k++) {
      const i = k % TOWER_SPOTS.length;
      const s = TOWER_SPOTS[i];
      // цель — перед местом, у подножия стены, чуть вбок
      const tx = s.x + s.nx * 9 - s.nz * ((k % 5) - 2);
      const tz = s.z + s.nz * 9 + s.nx * ((k % 5) - 2);
      zombie.set(tx, 0, tz);
      if (k % 7 === 0) {
        const brazier = types[i] === TW_BRAZIER;
        t3.fire(i, brazier ? NaN : tx, brazier ? NaN : 1, brazier ? NaN : tz, out, 7);
        assert.ok(Number.isFinite(out.x + out.y + out.z));
        const dx = out.x - s.x;
        const dz = out.z - s.z;
        assert.ok(Math.hypot(dx, dz) < 2.2 * TURRET_SCALE, `дуло далеко от места: ${Math.hypot(dx, dz)}`);
        assert.ok(out.y > s.y && out.y < s.y + 2.4 * TURRET_SCALE, `дуло на высоте ${out.y - s.y}`);
        // снаряд вылетает наружу, а не во двор
        assert.ok(dx * s.nx + dz * s.nz > -0.2, `${TOWERS[types[i]].name}: дуло смотрит внутрь`);
      }
      t3.update(1 / 60, cam, where);
    }
    for (const o of scene.children) {
      if (!(o instanceof THREE.InstancedMesh) || !o.visible) continue;
      assert.ok(o.count <= o.instanceMatrix.count, 'не больше, чем места в инстансах');
      const a = o.instanceMatrix.array as Float32Array;
      for (let j = 0; j < o.count * 16; j++) assert.ok(Number.isFinite(a[j]), `NaN в матрице ${o.geometry.type}`);
    }
    assert.ok(t3.info.particles <= 120 + 160 + 72);
    // вызовов отрисовки на все восемь мест — не больше полусотни
    assert.ok(t3.info.draws <= 50, `вызовов ${t3.info.draws}`);
  }
  t3.dispose();
});
