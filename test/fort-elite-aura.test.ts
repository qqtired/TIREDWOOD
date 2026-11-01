// Аура элиток (client/fort/elite): ступень едет во вспышке модели, шейдер мобов знает контур, пул частиц рождает
// частицы только у элиток и не переполняется.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { mobMaterial, type MobAnim } from '../client/fort/mobs/kit.ts';
import { MobRenderer, mobRoot } from '../client/fort/mobs/renderer.ts';
import { MOBS_A } from '../client/fort/mobs/set-a.ts';
import { AURA_CAP, AURA_JELLY, EliteAura, setAuraLook } from '../client/fort/elite/aura.ts';
import { AURA_RIM } from '../client/fort/elite/rim.ts';
import { ZS_WALK } from '../shared/fort.ts';

const anim = (): MobAnim => ({ t: 1, gait: 0.3, path: 1, speed: 1.5, st: ZS_WALK, stT: 0, hit: 0, die: 0, seed: 0.4, rage: false, flags: 0, flagT: 99, stage: 0 });

test('ступень элитки — во вспышке: mobFlash = вспышка + 2 × ступень, обычная особь как раньше', () => {
  const def = MOBS_A[0];
  const r = new MobRenderer(new THREE.Group(), [def]);
  const root = mobRoot(new THREE.Matrix4(), 0, 0, -20, 0.3, 1.5);
  r.begin();
  assert.ok(r.add(def.kinds[0], 0.5, root, anim(), 0.5, null, 0, 2));
  assert.ok(r.add(def.kinds[0], 0.5, root, anim(), 0.5));
  assert.ok(r.add(def.kinds[0], 0.5, root, anim(), 3, null, 0, 1));
  r.end();
  const mesh = r.group.children[0] as THREE.InstancedMesh;
  const fl = mesh.geometry.getAttribute('mobFlash').array as Float32Array;
  assert.ok(Math.abs(fl[0] - 4.5) < 1e-6 && Math.abs(fl[1] - 0.5) < 1e-6 && Math.abs(fl[2] - 3) < 1e-6, 'вспышка не больше 1, ступень сверху');
  r.dispose();
});

test('шейдер мобов: ступень разбирается из вспышки, контур после emissivemap, ручки общие', () => {
  for (const glow of [false, true]) {
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    mobMaterial(glow).onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    assert.ok(shader.vertexShader.includes('vMobAura = floor( vMobFlash * 0.5 );'));
    assert.ok(shader.fragmentShader.includes('if ( vMobAura > 0.5 )') && shader.fragmentShader.includes('#include <emissivemap_fragment>'));
    assert.equal(shader.uniforms.uAuraRim, AURA_RIM.uAuraRim, 'одни ручки на все материалы');
  }
});

test('пул частиц: только у элиток, без ауры — пусто, не больше AURA_CAP', () => {
  const pool = new EliteAura(new THREE.Group());
  const cam = new THREE.Vector3(0, 6, 0);
  const root = mobRoot(new THREE.Matrix4(), 0, 0, -20, 0.3, 1.25);
  const def = MOBS_A[0];
  setAuraLook('A', 'rank');
  for (let i = 0; i < 30; i++) {
    pool.begin(1 / 60, cam);
    pool.add(def, root, anim(), 0, 1);
    pool.end();
  }
  assert.equal(pool.count, 0, 'обычная особь — без частиц');
  for (const v of ['A', 'B', 'C'] as const) {
    setAuraLook(v, 'mono');
    pool.clear();
    for (let i = 0; i < 60; i++) {
      pool.begin(1 / 60, cam);
      pool.add(def, root, anim(), 1, 1.25);
      pool.add(AURA_JELLY, root, null, 2, 1.5);
      pool.end();
    }
    assert.ok(pool.count > 20 && pool.count <= AURA_CAP, `вариант ${v}: ${pool.count} частиц`);
  }
  for (let i = 0; i < 200; i++) {
    pool.begin(1 / 30, cam);
    for (let k = 0; k < 40; k++) pool.add(def, root, anim(), 2, 1.5);
    pool.end();
  }
  assert.ok(pool.count <= AURA_CAP, 'толпа чемпионов не переполняет пул');
  setAuraLook('A', 'rank', false);
  pool.clear();
  pool.begin(1 / 60, cam);
  pool.add(def, root, anim(), 2, 1.5);
  pool.end();
  assert.equal(pool.count, 0, 'аура выключена — частиц нет');
  assert.equal(AURA_RIM.uAuraRim.value.y, 0, 'и контура нет');
  pool.dispose();
});

test('A2 в игре: хитбокс без модели даёт частицы, на низком качестве и вдали их меньше; без вызова флага — старый вид', async () => {
  const { eliteEnabled, setEliteEnabled } = await import('../client/fort/elite/flag.ts');
  assert.equal(eliteEnabled(), false, 'по умолчанию — старый вид');
  setEliteEnabled(true);
  assert.equal(eliteEnabled(), true);
  setEliteEnabled(false);
  setAuraLook('A2', 'rank');
  const cam = new THREE.Vector3(0, 6, 0);
  const run = (q: 'high' | 'low', z: number): number => {
    const pool = new EliteAura(new THREE.Group());
    pool.setQuality(q);
    const root = mobRoot(new THREE.Matrix4(), 0, 0, z, 0, 1.5);
    let sum = 0;
    for (let i = 0; i < 120; i++) {
      pool.begin(1 / 60, cam);
      for (let k = 0; k < 4; k++) pool.add({ hull: true, r: 0.9, h: 2.4 }, root, null, 2, 1.5);
      pool.end();
      sum += pool.count;
    }
    pool.dispose();
    return sum;
  };
  const near = run('high', -12);
  assert.ok(near > 0, 'осадный GLB без модели — частицы по хитбоксу');
  assert.ok(run('low', -12) < near * 0.6, 'низкое качество — меньше');
  assert.ok(run('high', -70) < near * 0.6, 'далеко — меньше');
});
