// Набор C мобов «Крепости» (улитка-плевун, бобёр-подрывник, сова-лекарь, броненосец): части окрашены, бюджет,
// конечные позы во всех состояниях вида, существующие виды, 2–3 варианта на вид, ступни в опоре не скользят.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ZS_ATTACK, ZS_BARREL, ZS_CLIMB, ZS_PLANT, ZS_SPIT, ZS_WALK } from '../shared/fort.ts';
import { Z_ARMORED, Z_KINDS, Z_MEDIC, Z_SAPPER, Z_SPITTER, ZK } from '../shared/fortkinds.ts';
import { BONES, newPose, pickVariant, type MobAnim } from '../client/fort/mobs/kit.ts';
import { MOBS_C } from '../client/fort/mobs/set-c.ts';

const SPECIAL: Record<number, number[]> = {
  [Z_SPITTER]: [ZS_SPIT],
  [Z_SAPPER]: [ZS_PLANT, ZS_BARREL],
  [Z_MEDIC]: [],
  [Z_ARMORED]: [],
};
const anim = (o: Partial<MobAnim>): MobAnim => ({ t: 1, gait: 0.3, speed: 2, st: ZS_WALK, stT: 0.5, hit: 0, die: 0, seed: 0.4, rage: false, ...o });

test('набор C: четыре вида, у каждого 2–3 варианта, части окрашены, бюджет 6 частей и ~1500 треугольников', () => {
  for (const kind of [Z_SPITTER, Z_SAPPER, Z_MEDIC, Z_ARMORED]) {
    const n = MOBS_C.filter((d) => d.kinds.includes(kind)).length;
    assert.ok(n >= 2 && n <= 3, `${ZK[kind].name}: вариантов ${n}`);
    for (const seed of [0, 0.37, 0.99]) assert.ok(pickVariant(MOBS_C, kind, seed), 'вариант находится по seed');
  }
  assert.equal(new Set(MOBS_C.map((d) => d.id)).size, MOBS_C.length, 'id уникальны');
  for (const d of MOBS_C) {
    assert.ok(d.kinds.length > 0 && d.kinds.every((k) => Number.isInteger(k) && k >= 0 && k < Z_KINDS), `${d.id}: виды`);
    assert.ok(d.parts.length >= 1 && d.parts.length <= 6, `${d.id}: частей ${d.parts.length}`);
    let tris = 0;
    for (const p of d.parts) {
      assert.ok((BONES as readonly string[]).includes(p.bone), `${d.id}: кость ${p.bone}`);
      const pos = p.geo.getAttribute('position');
      const col = p.geo.getAttribute('color');
      assert.ok(col && col.count === pos.count && col.itemSize === 3, `${d.id}: у части нет цвета вершин`);
      assert.ok(p.geo.getAttribute('normal'), `${d.id}: нормали`);
      tris += (p.geo.index ? p.geo.index.count : pos.count) / 3;
    }
    assert.ok(tris <= 1500, `${d.id}: треугольников ${tris}`);
    assert.ok(d.parts.some((p) => p.glow), `${d.id}: светящиеся глаза`);
    const k = ZK[d.kinds[0]];
    assert.ok(Math.abs(d.height - (k.hcy + k.hry)) < 0.15, `${d.id}: рост ${d.height} под хитбокс ${k.hcy + k.hry}`);
  }
});

test('набор C: позы во всех состояниях вида, при ударе и гибели — конечные матрицы, к концу гибели почти пропал', () => {
  const pose = newPose();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const d of MOBS_C) {
    const states = [ZS_WALK, ZS_ATTACK, ZS_CLIMB, ...SPECIAL[d.kinds[0]]];
    for (const st of states) for (const stT of [0, 0.3, 0.8, 1.25, 3.1]) for (const die of [0, 0.2, 0.55, 1]) for (const hit of [0, 0.6, 1]) {
      for (const [speed, seed] of [[0, 0], [2.2, 0.5], [5.4, 0.999]]) {
        d.pose(anim({ st, stT, die, hit, speed, seed, gait: (stT * 0.7) % 1, t: stT + 2 }), pose);
        for (const b of BONES) assert.ok(pose[b].elements.every(Number.isFinite), `${d.id} st=${st} die=${die}: ${b}`);
      }
    }
    // в покое стоит на земле и ростом с хитбокс; к концу гибели ушёл в землю или сжался
    const extent = (die: number) => {
      d.pose(anim({ speed: 0, die }), pose);
      box.makeEmpty();
      for (const p of d.parts) {
        p.geo.computeBoundingBox();
        box.union(tmp.copy(p.geo.boundingBox!).applyMatrix4(pose[p.bone]));
      }
      return box;
    };
    const rest = extent(0);
    const top = rest.max.y;
    assert.ok(Math.abs(rest.min.y) < 0.06, `${d.id}: ноги на земле (${rest.min.y.toFixed(3)})`);
    assert.ok(top > d.height * 0.88 && top < d.height * 1.16, `${d.id}: макушка ${top.toFixed(2)} при росте ${d.height}`);
    const gone = extent(1).max.y;
    assert.ok(gone < top * 0.45, `${d.id}: к концу гибели не пропал (макушка ${gone.toFixed(2)} из ${top.toFixed(2)})`);
  }
});

test('набор C: ступни в опоре стоят в мире (не скользят) на любом росте особи', () => {
  const pose = newPose();
  const sole = new THREE.Vector3();
  const cases: Array<[string, 'legL', number, number, number, readonly [number, number, number]]> = [
    ['sapper-beaver', 'legL', 4.6, 1, 0.35, [0, 0, 0.05]],
    ['armored-armadillo', 'legL', 1.8, 1, 0.6, [0, -0.6, 0.07]],
    ['medic-owl', 'legL', 2, 2, 0.45, [-0.12, 0, 0.1]],
  ];
  for (const [id, bone, speed, cycles, duty, at] of cases) {
    const d = MOBS_C.find((m) => m.id === id)!;
    for (const seed of [0.02, 0.98]) {
      let dist = 0;
      let prev = NaN;
      for (let i = 0; i < 240; i++) {
        dist += speed / 120;
        const gait = (dist / 1.25) % 1;
        d.pose(anim({ gait, speed, seed, t: i / 120 }), pose);
        sole.set(at[0], at[1], at[2]).applyMatrix4(pose[bone]);
        const ph = (gait * cycles) % 1;
        const z = sole.z + dist;
        if (ph > 0.01 && ph < duty - 0.01 && Number.isFinite(prev)) assert.ok(Math.abs(z - prev) < 0.003, `${id}: ступня едет на ${(z - prev).toFixed(4)} м за кадр`);
        prev = ph > 0.01 && ph < duty - 0.01 ? z : NaN;
      }
    }
  }
});
