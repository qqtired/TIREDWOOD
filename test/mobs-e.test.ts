// Набор E (mobs-e): шлюпка с крабами, краб-абордажник, щупальце и Кракен — цвета и бюджет, конечные позы во всех
// состояниях своего вида, крабов в лодке столько, сколько экипажа, к концу гибели всё под водой (в земле).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BONES, newPose, pickVariant, type MobAnim, type MobDef } from '../client/fort/mobs/kit.ts';
import { CREW_A, CREW_B, CREW_C, SEA_BOAT, crewGroups } from '../client/fort/mobs/sea-boat.ts';
import { CREW_CRABS, crewVariant } from '../client/fort/mobs/crew-crab.ts';
import { MOBS_E } from '../client/fort/mobs/set-e.ts';
import {
  KF_BOSS, KF_SUPER, ZK, ZS_ATTACK, ZS_BOAT, ZS_BOAT_LAND, ZS_BOAT_LEAVE, ZS_BOSS_OPEN, ZS_CLIMB, ZS_DROP, ZS_HOP,
  ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_TENT_IDLE, ZS_TENT_REST, ZS_TENT_SLAM, ZS_TOP, ZS_WALK, Z_BOAT, Z_CLIMBER, Z_KINDS,
  Z_KRAKEN, Z_TENTACLE, Z_WALKER,
} from '../shared/fort.ts';

const STATES: Record<number, number[]> = {
  [Z_BOAT]: [ZS_BOAT, ZS_BOAT_LAND, ZS_BOAT_LEAVE],
  [Z_WALKER]: [ZS_WALK, ZS_ATTACK, ZS_CLIMB, ZS_TOP, ZS_DROP, ZS_HOP],
  [Z_CLIMBER]: [ZS_WALK, ZS_ATTACK, ZS_CLIMB, ZS_TOP, ZS_DROP, ZS_HOP],
  [Z_TENTACLE]: [ZS_TENT_IDLE, ZS_TENT_SLAM, ZS_TENT_REST, ZS_ATTACK],
  [Z_KRAKEN]: [ZS_WALK, ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_BOSS_OPEN, ZS_ATTACK],
};

function tris(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

function anim(o: Partial<MobAnim> = {}): MobAnim {
  return { t: 6, gait: 0.37, speed: 2.4, st: 0, stT: 1, hit: 0, die: 0, seed: 0.61, rage: false, ...o };
}

/** Верх модели в позе: максимум y углов рамок частей после матриц костей */
function topY(def: MobDef, a: MobAnim): number {
  const pose = newPose();
  def.pose(a, pose);
  const v = new THREE.Vector3();
  let top = -Infinity;
  for (const p of def.parts) {
    p.geo.computeBoundingBox();
    const b = p.geo.boundingBox!;
    for (let k = 0; k < 8; k++) {
      v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(pose[p.bone]);
      top = Math.max(top, v.y);
    }
  }
  return top;
}

test('набор E: части в цвете, до 6 частей, бюджет треугольников, есть свечение, виды существуют', () => {
  assert.ok(MOBS_E.length >= 4);
  const ids = new Set<string>();
  for (const d of MOBS_E) {
    assert.ok(!ids.has(d.id), `${d.id}: повтор id`);
    ids.add(d.id);
    assert.ok(d.parts.length >= 1 && d.parts.length <= 6, `${d.id}: частей ${d.parts.length}`);
    for (const p of d.parts) {
      assert.ok(BONES.includes(p.bone), `${d.id}: кость ${p.bone}`);
      assert.ok(p.geo.getAttribute('color'), `${d.id}/${p.bone}: нет цветов вершин`);
      assert.ok(p.geo.getAttribute('normal'), `${d.id}/${p.bone}: нет нормалей`);
    }
    assert.ok(d.parts.some((p) => p.glow), `${d.id}: нет светящейся части (глаза, фонарь, кончик)`);
    for (const k of d.kinds) assert.ok(Number.isInteger(k) && k >= 0 && k < Z_KINDS, `${d.id}: вид ${k}`);
    const big = d.kinds.some((k) => (ZK[k].flags & (KF_BOSS | KF_SUPER)) !== 0);
    const n = d.parts.reduce((s, p) => s + tris(p.geo), 0);
    assert.ok(n <= (big ? 6000 : 1500), `${d.id}: ${n} треугольников`);
  }
});

test('позы конечны во всех состояниях вида, при ударе, ярости и гибели', () => {
  const pose = newPose();
  for (const d of MOBS_E) {
    const states = new Set(d.kinds.flatMap((k) => STATES[k] ?? [ZS_WALK]));
    for (const st of states) for (const stT of [0, 0.3, 1.35, 1.5, 4]) for (const die of [0, 0.5, 1]) for (const hit of [0, 1]) for (const rage of [false, true]) {
      d.pose(anim({ st, stT, die, hit, rage, t: 0.2 + stT * 3 }), pose);
      for (const p of d.parts) {
        const e = pose[p.bone].elements;
        assert.ok(e.every(Number.isFinite), `${d.id} st=${st} stT=${stT} die=${die}: не число`);
        assert.ok(Math.abs(e[12]) < 40 && Math.abs(e[13]) < 40 && Math.abs(e[14]) < 40, `${d.id}: кость улетела`);
      }
    }
  }
});

test('к концу гибели модель под водой или в земле', () => {
  for (const d of MOBS_E) {
    const st = d.kinds.includes(Z_BOAT) ? ZS_BOAT : d.kinds.includes(Z_TENTACLE) ? ZS_TENT_REST : ZS_WALK;
    assert.ok(topY(d, anim({ st, die: 0 })) > 0.5, `${d.id}: живая модель над водой`);
    assert.ok(topY(d, anim({ st, die: 1 })) < 0.05, `${d.id}: после гибели верх ${topY(d, anim({ st, die: 1 })).toFixed(2)}`);
  }
});

test('лодка: крабов столько, сколько экипажа; каждый прыжок убирает ровно одного', () => {
  const count = (m: number) => (m & CREW_A ? 1 : 0) + (m & CREW_B ? 2 : 0) + (m & CREW_C ? 3 : 0);
  for (let c = 0; c <= 8; c++) assert.equal(count(crewGroups(c)), Math.min(6, c));
  const pose = newPose();
  const shown = (stage: number, st = ZS_BOAT) => {
    SEA_BOAT.pose(anim({ st, stage } as Partial<MobAnim>), pose);
    return (['legL', 'legR', 'tail'] as const).map((b) => new THREE.Vector3().setFromMatrixScale(pose[b]).x > 0.5);
  };
  assert.deepEqual(shown(6), [true, true, true]);
  assert.deepEqual(shown(3), [false, false, true]);
  assert.deepEqual(shown(0), [false, false, false]);
  // пустая лодка уходит без крабов, даже если stage не пришёл
  assert.deepEqual(shown(Number.NaN, ZS_BOAT_LEAVE), [false, false, false]);
});

test('экипаж: краб по seed для ZF_CREW, обычных шаркунов и липучек не подменяет', () => {
  for (let i = 0; i < 20; i++) {
    const s = i / 20;
    assert.ok(CREW_CRABS.includes(crewVariant(s)));
    assert.equal(pickVariant(MOBS_E, Z_WALKER, s), null);
    assert.equal(pickVariant(MOBS_E, Z_CLIMBER, s), null);
  }
  assert.ok(pickVariant(MOBS_E, Z_BOAT, 0.5));
  assert.equal(pickVariant(MOBS_E, Z_KRAKEN, 0.3)?.id, 'kraken');
});
