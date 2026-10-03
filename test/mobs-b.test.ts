// Мобы «Крепости», набор B (Липучка, Пузырь, Крылатка, Щитоносец): договор kit.ts соблюдён — цвета вершин,
// бюджет, конечные матрицы во всех состояниях вида, при ударе и гибели; виды существуют; ноги не скользят.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BONES, newPose, type MobAnim, type MobDef } from '../client/fort/mobs/kit.ts';
import { MOBS_B } from '../client/fort/mobs/set-b.ts';
import { ZS_ATTACK, ZS_CLIMB, ZS_DROP, ZS_FLY_DIVE, ZS_FLY_RECOVER, ZS_FLY_WARN, ZS_TOP, ZS_WALK } from '../shared/fort.ts';
import { ZK, Z_BLOATER, Z_CLIMBER, Z_FLYER, Z_SHIELD } from '../shared/fortkinds.ts';

const STATES: Record<number, number[]> = {
  [Z_CLIMBER]: [ZS_WALK, ZS_ATTACK, ZS_CLIMB, ZS_TOP, ZS_DROP],
  [Z_BLOATER]: [ZS_WALK, ZS_ATTACK],
  [Z_FLYER]: [ZS_WALK, ZS_ATTACK, ZS_FLY_WARN, ZS_FLY_DIVE, ZS_FLY_RECOVER],
  [Z_SHIELD]: [ZS_WALK, ZS_ATTACK],
};

function anim(over: Partial<MobAnim>): MobAnim {
  return { t: 0, gait: 0, speed: 0, st: ZS_WALK, stT: 0, hit: 0, die: 0, seed: 0.5, rage: false, ...over };
}

const tris = (def: MobDef) => def.parts.reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count) / 3, 0);

test('набор B: цвета вершин, бюджет, светящиеся глаза, существующие виды, по 2 варианта на вид', () => {
  assert.equal(new Set(MOBS_B.map((d) => d.id)).size, MOBS_B.length, 'id уникальны');
  for (const def of MOBS_B) {
    assert.ok(def.parts.length <= 6, `${def.id}: частей ${def.parts.length}`);
    assert.ok(tris(def) <= 1550, `${def.id}: треугольников ${tris(def)}`);
    assert.ok(def.parts.some((p) => p.glow), `${def.id}: светящиеся глаза`);
    for (const p of def.parts) {
      assert.ok(BONES.includes(p.bone), `${def.id}: кость ${p.bone}`);
      for (const attr of ['position', 'normal', 'color']) assert.ok(p.geo.getAttribute(attr), `${def.id}/${p.bone}: нет ${attr}`);
    }
    assert.ok(def.kinds.length > 0 && def.kinds.every((k) => ZK[k] && STATES[k]), `${def.id}: виды ${def.kinds}`);
  }
  for (const k of Object.keys(STATES).map(Number)) assert.ok(MOBS_B.filter((d) => d.kinds.includes(k)).length >= 2, `вид ${ZK[k].name}: два варианта`);
});

test('набор B: поза конечна во всех состояниях вида, при ударе и гибели', () => {
  const out = newPose();
  for (const def of MOBS_B) {
    for (const st of STATES[def.kinds[0]]) {
      for (const seed of [0, 0.37, 0.999]) {
        for (let i = 0; i <= 30; i++) {
          for (const [hit, die] of [[0, 0], [1, 0], [0.4, 0], [0, i / 30]]) {
            def.pose(anim({ t: i * 0.13, gait: (i * 0.071) % 1, speed: [0, 2.4, 5.2][i % 3], st, stT: i * 0.09, hit, die, seed, rage: i % 2 === 0 }), out);
            for (const b of BONES) for (const e of out[b].elements) assert.ok(Number.isFinite(e), `${def.id} st=${st} ${b}`);
          }
        }
      }
    }
  }
});

test('набор B: ходячие — стопа в опоре стоит на земле, пока корень идёт вперёд (ноги не скользят)', () => {
  const out = newPose();
  const p = new THREE.Vector3();
  for (const def of MOBS_B.filter((d) => !d.kinds.includes(Z_FLYER))) {
    const leg = def.parts.find((q) => q.bone === 'legL');
    if (!leg) continue;
    // подошва — самая нижняя вершина ноги; у ног-маятников (кость в суставе) — точка под суставом
    const pos = leg.geo.getAttribute('position');
    let low = 0;
    for (let i = 1; i < pos.count; i++) if (pos.getY(i) < pos.getY(low)) low = i;
    const sole = new THREE.Vector3(Math.abs(pos.getX(low)) < 0.3 ? 0 : pos.getX(low), pos.getY(low), Math.abs(pos.getX(low)) < 0.3 ? 0 : pos.getZ(low));
    let windows = 0;
    for (const seed of [0.2, 0.8]) {
      const ys: number[] = [];
      const zs: number[] = [];
      for (let g = 0; g <= 2; g += 0.002) {
        def.pose(anim({ gait: g % 1, speed: 2.2, seed, t: 3 }), out);
        p.copy(sole).applyMatrix4(out.legL);
        ys.push(p.y);
        zs.push(p.z + g * 1.25);
      }
      const ground = Math.min(...ys);
      let start = -1;
      for (let i = 0; i <= ys.length; i++) {
        const planted = i < ys.length && ys[i] < ground + 0.012;
        if (planted && start < 0) start = i;
        if (!planted && start >= 0) {
          const w = zs.slice(start + 2, i - 2);
          if (w.length > 20) {
            windows++;
            assert.ok(Math.max(...w) - Math.min(...w) < 0.03, `${def.id}: стопа уехала на ${(Math.max(...w) - Math.min(...w)).toFixed(3)} м`);
          }
          start = -1;
        }
      }
    }
    assert.ok(windows >= 2, `${def.id}: нашлись опоры (${windows})`);
  }
});
