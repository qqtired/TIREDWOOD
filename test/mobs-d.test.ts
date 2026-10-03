// Набор D (боссы на суше): у частей есть цвета, бюджет соблюдён, позы во всех состояниях конечные, виды существуют,
// модель в покое не шире круга вида (иначе «влезает» в стены и ворота) и выше кольца «в голову».
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { MOBS_D } from '../client/fort/mobs/set-d.ts';
import { newPose, type MobAnim } from '../client/fort/mobs/kit.ts';
import { ZK, Z_BOSS, Z_GOLEM, Z_KINDS, Z_RAM, ZS_ATTACK, ZS_BOSS_APPROACH, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE,
  ZS_CHARGE, ZS_CHARGE_WARN, ZS_QUAKE, ZS_STOMP, ZS_THROW, ZS_WALK } from '../shared/fort.ts';

/** Вой Тарана (ZS_HOWL = 31 — в ветке fort) */
const ZS_HOWL = 31;
const STATES: Record<number, number[]> = {
  [Z_BOSS]: [ZS_WALK, ZS_ATTACK, ZS_BOSS_GATE, ZS_BOSS_BOMB, ZS_BOSS_PULSE, ZS_BOSS_OPEN, ZS_BOSS_APPROACH],
  [Z_RAM]: [ZS_WALK, ZS_ATTACK, ZS_CHARGE_WARN, ZS_CHARGE, ZS_BOSS_OPEN, ZS_STOMP, ZS_HOWL, ZS_BOSS_APPROACH],
  [Z_GOLEM]: [ZS_WALK, ZS_ATTACK, ZS_THROW, ZS_QUAKE, ZS_BOSS_OPEN, ZS_BOSS_APPROACH],
};

function anim(over: Partial<MobAnim>): MobAnim {
  return { t: 3.3, gait: 0.3, speed: 2.4, st: ZS_WALK, stT: 0.5, hit: 0, die: 0, seed: 0.42, rage: false, ...over };
}

test('mobs-d: три босса, по одному на вид, цвета и бюджет', () => {
  assert.deepEqual(MOBS_D.map((d) => d.kinds).flat().sort(), [Z_BOSS, Z_RAM, Z_GOLEM].sort());
  const ids = new Set<string>();
  for (const def of MOBS_D) {
    assert.ok(!ids.has(def.id), `id ${def.id} повторяется`);
    ids.add(def.id);
    for (const k of def.kinds) assert.ok(k >= 0 && k < Z_KINDS && ZK[k], `${def.id}: вид ${k} существует`);
    assert.ok(def.parts.length >= 1 && def.parts.length <= 6, `${def.id}: частей ${def.parts.length}`);
    const bones = new Set(def.parts.map((p) => p.bone));
    assert.equal(bones.size, def.parts.length, `${def.id}: у каждой части своя кость`);
    let tris = 0;
    for (const p of def.parts) {
      for (const attr of ['position', 'normal', 'color']) assert.ok(p.geo.getAttribute(attr), `${def.id}/${p.bone}: есть ${attr}`);
      tris += (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count) / 3;
    }
    assert.ok(tris <= 6000, `${def.id}: треугольников ${tris}`);
    assert.ok(def.parts.some((p) => p.glow), `${def.id}: светящиеся глаза`);
  }
});

test('mobs-d: позы во всех состояниях вида, ярость, удар и гибель — конечные матрицы', () => {
  const pose = newPose();
  for (const def of MOBS_D) {
    const states = STATES[def.kinds[0]];
    for (const st of states) {
      for (const stT of [0, 0.31, 0.7, 1.1, 1.62, 1.8, 2.4, 3.2, 6]) {
        for (const extra of [{}, { rage: true }, { hit: 0.7 }, { die: 0.35 }, { die: 1 }, { speed: 0 }, { speed: 15 }, { speed: -2 }]) {
          def.pose(anim({ st, stT, t: 5 + stT, gait: (stT * 0.37) % 1, ...extra }), pose);
          for (const p of def.parts) {
            const m = pose[p.bone].elements;
            assert.ok(m.every(Number.isFinite), `${def.id} st=${st} T=${stT} ${JSON.stringify(extra)} ${p.bone}`);
            assert.ok(Math.abs(new THREE.Matrix4().fromArray(m).determinant()) > 0, `${def.id} st=${st} ${p.bone}: не вырождена`);
          }
        }
      }
    }
  }
});

test('mobs-d: в покое модель в круге вида, глаза выше кольца «в голову»', () => {
  const pose = newPose();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const def of MOBS_D) {
    const k = ZK[def.kinds[0]];
    def.pose(anim({ speed: 0, stT: 0.4, t: 0.4 }), pose);
    let reach = 0;
    let top = 0;
    let glowLow = Infinity;
    for (const p of def.parts) {
      const pos = p.geo.getAttribute('position');
      const m = pose[p.bone];
      box.makeEmpty();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        reach = Math.max(reach, Math.hypot(v.x, v.z));
        top = Math.max(top, v.y);
        box.expandByPoint(v);
      }
      // глаза — светящаяся часть на голове (у Барона и Тарана — отдельная кость, у Валуна — вместе с ядром)
      if (p.glow && box.max.y > k.headY) glowLow = Math.min(glowLow, box.max.y);
    }
    assert.ok(reach <= k.r + 0.2, `${def.id}: в покое шире круга вида (${reach.toFixed(2)} > ${k.r})`);
    assert.ok(top >= k.headY && top <= k.hcy + k.hry + 0.9, `${def.id}: рост ${top.toFixed(2)}`);
    assert.ok(glowLow > k.headY, `${def.id}: глаза выше кольца «в голову»`);
  }
});
