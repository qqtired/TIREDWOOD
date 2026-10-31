// Проверка моделей новых боссов (стенд lab/fort-rework/bosses.html): бюджет треугольников, все кости заданы, поза каждого
// клипа на всём его протяжении даёт конечные матрицы (без NaN), Избушка стоит на земле, лапа в опоре не скользит.
// Запуск: node --test lab/fort-rework/bosses/models.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { bossTris, newBossPose, type BossDef, type MobAnim } from './bosskit.ts';
import { HUT } from './hut.ts';
import { PELICAN } from './pelican.ts';

const anim = (o: Partial<MobAnim> = {}): MobAnim => ({ t: 1.3, gait: 0, path: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: 0.37, rage: false, flags: 0, stage: 1, ...o });

for (const def of [HUT, PELICAN] as BossDef[]) {
  test(`${def.name}: до 18 тыс. треугольников, части на своих костях`, () => {
    const tris = bossTris(def);
    assert.ok(tris > 3000 && tris <= 18000, `треугольников ${tris}`);
    for (const p of def.parts) assert.ok(def.bones.includes(p.bone), `кость ${p.bone}`);
  });

  test(`${def.name}: каждый клип даёт конечную позу`, () => {
    const out = newBossPose(def);
    for (const c of def.clips) {
      const dur = c.dur || 3;
      for (let T = 0; T <= dur; T += 0.05) {
        def.pose(anim({ st: c.st, stT: T, t: 2 + T, speed: c.speed ?? 0, path: (c.speed ?? 0) * T, die: c.die ? T / dur : 0, rage: !!c.rage, stage: c.stage ?? 1, hit: c.id === 'hit' ? 1 - T / dur : 0 }), out);
        for (const b of def.bones) for (const e of out[b].elements) assert.ok(Number.isFinite(e), `${c.id} T=${T.toFixed(2)} ${b}`);
      }
    }
  });
}

test('Избушка: стоит лапами на земле, в опоре стопа не едет относительно земли', () => {
  const out = newBossPose(HUT);
  HUT.pose(anim(), out);
  const p = new THREE.Vector3();
  for (const f of ['footL', 'footR']) {
    p.setFromMatrixPosition(out[f]);
    assert.ok(Math.abs(p.y - 0.32) < 0.05, `${f} щиколотка на ${p.y}`);
  }
  // идёт: в опоре (левая лапа — первые 60 % цикла) положение лапы + пройденный путь постоянно
  const v = 1.8;
  const zs: number[] = [];
  for (let T = 0.2; T < 1.0; T += 0.1) {
    HUT.pose(anim({ speed: v, path: v * T, t: T }), out);
    p.setFromMatrixPosition(out.footL);
    zs.push(p.z + v * T);
  }
  const spread = Math.max(...zs) - Math.min(...zs);
  assert.ok(spread < 0.03, `стопа скользит на ${spread.toFixed(3)} м`);
});
