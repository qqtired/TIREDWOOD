// Набор E (mobs-e): шлюпка с крабами, краб-абордажник, щупальце и Кракен — цвета и бюджет, конечные позы во всех
// состояниях своего вида (масштаб костей не меньше 0,02), щупальце дотягивается до булавы, крабов в лодке столько,
// сколько экипажа, к концу гибели всё под водой (в земле), экипаж — особый вариант ZF_CREW.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BONES, newPose, pickVariant, type MobAnim, type MobDef } from '../client/fort/mobs/kit.ts';
import { CREW_A, CREW_B, CREW_C, SEA_BOAT, crewGroups } from '../client/fort/mobs/sea-boat.ts';
import { CREW_CRABS } from '../client/fort/mobs/crew-crab.ts';
import { KRAKEN_TENTACLE } from '../client/fort/mobs/kraken-tentacle.ts';
import { MOBS_E } from '../client/fort/mobs/set-e.ts';
import {
  KF_BOSS, KF_SUPER, ZK, ZS_ATTACK, ZS_BOAT, ZS_BOAT_LAND, ZS_BOAT_LEAVE, ZS_BOSS_OPEN, ZS_CLIMB, ZS_DROP, ZS_HOP,
  ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_TENT_IDLE, ZS_TENT_REST, ZS_TENT_SLAM, ZS_TOP, ZS_WALK, Z_BOAT, Z_CLIMBER, Z_KINDS,
  Z_KRAKEN, Z_TENTACLE, Z_WALKER,
} from '../shared/fort.ts';
import { ZF_CREW } from '../shared/fortnet.ts';

const STATES: Record<number, number[]> = {
  [Z_BOAT]: [ZS_BOAT, ZS_BOAT_LAND, ZS_BOAT_LEAVE],
  [Z_WALKER]: [ZS_WALK, ZS_ATTACK, ZS_CLIMB, ZS_TOP, ZS_DROP, ZS_HOP],
  [Z_CLIMBER]: [ZS_WALK, ZS_ATTACK, ZS_CLIMB, ZS_TOP, ZS_DROP, ZS_HOP],
  [Z_TENTACLE]: [ZS_TENT_IDLE, ZS_TENT_SLAM, ZS_TENT_REST, ZS_KRAKEN_DIVE, ZS_ATTACK],
  [Z_KRAKEN]: [ZS_WALK, ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_BOSS_OPEN, ZS_ATTACK],
};

/** Где бывает булава у крепости (относительно корня щупальца, в осях модели): покой, замах, стена, берег, терраса,
 *  у самого корня, глубоко под водой (вырастает) */
const TIPS: ReadonlyArray<readonly [number, number, number]> = [
  [0.7, 9.65, 3.5], [0.3, 14.1, -1], [-2, 8.1, 16.7], [1, 4.7, 9], [3, 8, 20.5], [0, 0, 0], [0, -10, 2],
];

function tris(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

type TestAnim = MobAnim & { stage?: number; tipX?: number; tipY?: number; tipZ?: number; wind?: number; water?: number };

function anim(o: Partial<TestAnim> = {}): TestAnim {
  return { t: 6, gait: 0.37, speed: 2.4, st: 0, stT: 1, hit: 0, die: 0, seed: 0.61, rage: false, ...o };
}

const _s = new THREE.Vector3();

/** Конечные матрицы, кость не улетела, масштаб по каждой оси не меньше 0,02 (договор: нормали инстансов) */
function checkPose(d: MobDef, a: MobAnim, what: string): void {
  const pose = newPose();
  d.pose(a, pose);
  for (const p of d.parts) {
    const m = pose[p.bone];
    const e = m.elements;
    assert.ok(e.every(Number.isFinite), `${d.id} ${what}: не число`);
    assert.ok(Math.abs(e[12]) < 40 && Math.abs(e[13]) < 40 && Math.abs(e[14]) < 40, `${d.id} ${what}: кость улетела`);
    _s.setFromMatrixScale(m);
    assert.ok(Math.min(_s.x, _s.y, _s.z) >= 0.0199, `${d.id} ${what}: масштаб ${p.bone} ${_s.x.toFixed(3)} ${_s.y.toFixed(3)} ${_s.z.toFixed(3)}`);
    assert.ok(m.determinant() > 0, `${d.id} ${what}: зеркало у ${p.bone}`);
  }
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
  for (const d of MOBS_E) {
    const states = new Set(d.kinds.flatMap((k) => STATES[k] ?? [ZS_WALK]));
    for (const st of states) for (const stT of [0, 0.3, 1.35, 1.5, 4]) for (const die of [0, 0.5, 1]) for (const hit of [0, 1]) for (const rage of [false, true]) {
      checkPose(d, anim({ st, stT, die, hit, rage, t: 0.2 + stT * 3 }), `st=${st} stT=${stT} die=${die} hit=${hit}`);
    }
  }
  // необязательные поля договора: экипаж в лодке, отсчёт состояния, уровень воды
  for (const d of MOBS_E) for (const stage of [0, 1, 4, 9]) for (const wind of [0, 0.4, 3]) {
    checkPose(d, anim({ st: d.kinds.includes(Z_BOAT) ? ZS_BOAT_LAND : ZS_KRAKEN_DIVE, stage, wind, water: 1.7 }), `stage=${stage} wind=${wind}`);
  }
});

test('щупальце дотягивается до булавы: конечные позы, центр булавы — в точке tip', () => {
  const pose = newPose();
  const c = new THREE.Vector3();
  const club = KRAKEN_TENTACLE.parts.find((p) => p.bone === 'tail' && !p.glow)!;
  club.geo.computeBoundingBox();
  const mid = (club.geo.boundingBox!.min.y + club.geo.boundingBox!.max.y) / 2;
  for (const [tipX, tipY, tipZ] of TIPS) for (const st of STATES[Z_TENTACLE]) for (const stT of [0, 0.7, 1.45, 1.7, 3]) for (const die of [0, 0.5, 1]) for (const hit of [0, 1]) {
    const a = anim({ st, stT, die, hit, tipX, tipY, tipZ, t: 2 + stT, rage: hit > 0 });
    checkPose(KRAKEN_TENTACLE, a, `tip=${tipX},${tipY},${tipZ} st=${st} stT=${stT} die=${die}`);
    if (die > 0 || hit > 0 || Math.hypot(tipX, tipY, tipZ) < 3) continue;
    KRAKEN_TENTACLE.pose(a, pose);
    c.set(0, mid, 0).applyMatrix4(pose.tail);
    assert.ok(c.distanceTo(new THREE.Vector3(tipX, tipY, tipZ)) < 0.9, `булава мимо: tip=${tipX},${tipY},${tipZ} st=${st} → ${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}`);
  }
});

test('к концу гибели модель под водой или в земле', () => {
  const cases: Array<[MobDef, Partial<TestAnim>]> = MOBS_E.map((d) => [d, { st: d.kinds.includes(Z_BOAT) ? ZS_BOAT : d.kinds.includes(Z_TENTACLE) ? ZS_TENT_REST : ZS_WALK }]);
  for (const [tipX, tipY, tipZ] of TIPS.slice(0, 5)) cases.push([KRAKEN_TENTACLE, { st: ZS_TENT_REST, tipX, tipY, tipZ }]);
  for (const [d, o] of cases) {
    assert.ok(topY(d, anim({ ...o, die: 0 })) > 0.5, `${d.id}: живая модель над водой`);
    const top = topY(d, anim({ ...o, die: 1 }));
    assert.ok(top < 0.05, `${d.id} ${JSON.stringify(o)}: после гибели верх ${top.toFixed(2)}`);
  }
});

test('лодка: крабов столько, сколько экипажа; каждый прыжок убирает ровно одного', () => {
  const count = (m: number) => (m & CREW_A ? 1 : 0) + (m & CREW_B ? 2 : 0) + (m & CREW_C ? 3 : 0);
  for (let c = 0; c <= 8; c++) assert.equal(count(crewGroups(c)), Math.min(6, c));
  const pose = newPose();
  const shown = (stage: number, st = ZS_BOAT) => {
    SEA_BOAT.pose(anim({ st, stage }), pose);
    return (['legL', 'legR', 'tail'] as const).map((b) => new THREE.Vector3().setFromMatrixScale(pose[b]).x > 0.5);
  };
  assert.deepEqual(shown(6), [true, true, true]);
  assert.deepEqual(shown(3), [false, false, true]);
  assert.deepEqual(shown(0), [false, false, false]);
  // пустая лодка уходит без крабов, даже если stage не пришёл
  assert.deepEqual(shown(Number.NaN, ZS_BOAT_LEAVE), [false, false, false]);
});

test('экипаж: крабы — особый вариант ZF_CREW, обычных шаркунов и липучек не подменяют', () => {
  for (const d of CREW_CRABS) {
    assert.equal(d.when, ZF_CREW, `${d.id}: when`);
    assert.ok((d.weight ?? 1) > 0, `${d.id}: вес`);
    assert.deepEqual([...d.kinds].sort(), [Z_WALKER, Z_CLIMBER].sort());
  }
  // выбор по признакам — в договоре mobs-a (pickVariant с flags); в старом kit.ts его нет — тогда только проверка полей
  const pick = pickVariant as (defs: readonly MobDef[], kind: number, seed: number, flags?: number) => MobDef | null;
  const flagged = pick([{ ...CREW_CRABS[0], kinds: [Z_WALKER] }], Z_WALKER, 0.5, 0) === null;
  if (flagged) {
    for (let i = 0; i < 20; i++) {
      const s = i / 20;
      assert.equal(pick(MOBS_E, Z_WALKER, s, 0), null);
      assert.equal(pick(MOBS_E, Z_CLIMBER, s, 0), null);
      assert.ok(CREW_CRABS.includes(pick(MOBS_E, Z_WALKER, s, ZF_CREW) as never));
    }
  }
  assert.ok(pickVariant(MOBS_E, Z_BOAT, 0.5));
  assert.equal(pickVariant(MOBS_E, Z_KRAKEN, 0.3)?.id, 'kraken');
});
