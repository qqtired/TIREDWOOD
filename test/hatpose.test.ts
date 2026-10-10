// A headpiece must deform with the body itself, including impact wobble; parent transforms cover running/jump/KO.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { ITEMS } from '../shared/outfit.ts';
import { BODY_H, bodyR } from '../client/render/outfit3d.ts';
import { wearFor as wearOf } from '../client/render/outfitfish.ts';
import { headwearBounds, headwearLabelHeight, makeHatMaterial, posedHatPoint } from '../client/render/hatpose.ts';
import { primeIsle } from '../client/render/islegear.ts';

// шапка смотрителя (остров) — из GLB, в игре грузится fetch-ем; здесь — с диска
const keeperHat = readFileSync(new URL('../client/assets/islecos/keeper-hat.glb', import.meta.url));
primeIsle('keeper-hat', keeperHat.buffer.slice(keeperHat.byteOffset, keeperHat.byteOffset + keeperHat.byteLength));

function bodyAt(x: number, y: number, z: number, time: number, wobble: number, lean: THREE.Vector2): THREE.Vector3 {
  const h = Math.max(0, Math.min(1, y / BODY_H));
  const w = Math.sin(time * 2.7 + h * 2.5) * 0.014 + wobble * Math.sin(time * 23 - h * 6) * h * 0.17;
  return new THREE.Vector3(x * (1 + w) + lean.x * h * h, y, z * (1 + w) + lean.y * h * h);
}

test('all hats stay at their body surface through idle, acceleration, jump stretch and Fight knockout', () => {
  const parents = [
    new THREE.Matrix4(),
    new THREE.Matrix4().compose(new THREE.Vector3(0, 0.1, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.13)), new THREE.Vector3(0.93, 1.14, 1.1)),
    new THREE.Matrix4().makeScale(1.6, 0.2, 1.6),
    new THREE.Matrix4().makeScale(0.65, 1.25, 0.65),
    new THREE.Matrix4().makeScale(1.4, 1.4, 1.4),
  ];
  for (const item of ITEMS.filter(it => it.slot === 'h' && it.key !== 'none')) {
    const wear = wearOf('h', item.key);
    let samples = 0;
    for (const geo of [wear.geo, wear.metal]) {
      if (!geo) continue;
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i += 7) {
        const raw = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
        const y = raw.y + wear.y;
        const radial = Math.hypot(raw.x, raw.z);
        // Outer surface samples; cap closures deliberately lie inside and are hidden by the body.
        if (y < 1.1 || y > BODY_H || radial < bodyR(y) + 0.008) continue;
        const bodyRaw = raw.clone().multiplyScalar(bodyR(y) / radial);
        for (const [time, wobble, lx, lz] of [[0, 0, 0, 0], [.32, 0, .16, -.16], [.32, 1.8, .24, -.29], [.8, 1.8, -.24, .29]]) {
          const lean = new THREE.Vector2(lx, lz);
          const actual = posedHatPoint(raw, wear.y, time, wobble, lean);
          const expected = bodyAt(raw.x, y, raw.z, time, wobble, lean);
          const surface = bodyAt(bodyRaw.x, y, bodyRaw.z, time, wobble, lean);
          assert.ok(actual.distanceTo(expected) < 1e-8, item.id);
          const center = bodyAt(0, y, 0, time, wobble, lean);
          for (const matrix of parents) {
            const o = center.clone().applyMatrix4(matrix);
            const rHat = actual.clone().applyMatrix4(matrix).distanceTo(o);
            const rBody = surface.clone().applyMatrix4(matrix).distanceTo(o);
            assert.ok(rHat > rBody + 0.001, `${item.id}: body pierces hat during pose`);
          }
        }
        samples++;
      }
    }
    assert.ok(samples > 5, `${item.id}: real geometry covered`);
  }
});

test('regression witness: the old rigid anchor places cap geometry inside the wobbling body', () => {
  const w = wearOf('h', 'cap');
  const p = w.geo!.getAttribute('position');
  const lean = new THREE.Vector2(.16, -.16);
  let worst = 0;
  for (let i = 0; i < p.count; i++) {
    const raw = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const y = raw.y + w.y;
    if (y < 1.32 || y > 1.55 || Math.hypot(raw.x, raw.z) < bodyR(y) + .008) continue;
    const old = raw.clone().applyEuler(new THREE.Euler(lean.y * 2 * w.y / BODY_H ** 2, 0, -lean.x * 2 * w.y / BODY_H ** 2));
    old.add(new THREE.Vector3(lean.x * (w.y / BODY_H) ** 2, w.y, lean.y * (w.y / BODY_H) ** 2));
    const center = bodyAt(0, old.y, 0, .32, 1.8, lean);
    const surface = bodyAt(bodyR(old.y), old.y, 0, .32, 1.8, lean);
    worst = Math.min(worst, old.distanceTo(center) - surface.distanceTo(center));
  }
  assert.ok(worst < -.04, `old path should demonstrate >4cm penetration, got ${worst}`);
});

test('hat shader shares live body uniforms and uses each geometry anchor; disposal leaves shared template intact', () => {
  const base = new THREE.MeshStandardMaterial({ vertexColors: true });
  const u = { uTime: { value: 0 }, uWobble: { value: 0 }, uLean: { value: new THREE.Vector2() } };
  const anchor = { value: 1.45 };
  const material = makeHatMaterial(base, u, anchor);
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '' };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.equal((shader.uniforms as Record<string, unknown>).uLean, u.uLean);
  assert.equal((shader.uniforms as Record<string, unknown>).uWearY, anchor);
  assert.ok(shader.vertexShader.includes('uWobble * sin'));
  assert.ok(shader.vertexShader.includes('position.y + uWearY'));
  assert.notEqual(material, base);
  material.dispose();
  base.dispose();
});

test('premium geometry is cached, finite, textured without images and within draw/triangle budget', () => {
  for (const it of ITEMS.filter(it => it.tier === 'premium')) {
    assert.notEqual(it.slot, 'p');
    const w = wearOf(it.slot as 'h' | 'e' | 'a', it.key);
    assert.equal(wearOf(it.slot as 'h' | 'e' | 'a', it.key), w);
    let triangles = 0;
    for (const g of [w.geo, w.metal]) {
      if (!g) continue;
      const p = g.getAttribute('position');
      triangles += (g.index?.count ?? p.count) / 3;
      for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), it.id);
    }
    assert.ok(triangles > 0 && triangles <= 2400, `${it.id}: ${triangles} triangles`);
  }
});


test('nickname support bound clears tall hats under squash, dance and impact without a universal hat lift', () => {
  for (const item of ITEMS.filter(it => it.slot === 'h')) {
    const wear = wearOf('h', item.key);
    const bounds = headwearBounds(wear);
    for (const [sx, sy, sway, lift] of [[1, 1, 0, 0], [.93, 1.14, .13, .1], [1.04, .88, -.13, .3]]) {
      const scale = new THREE.Vector3(sx, sy, sx);
      const lean = new THREE.Vector2(.24, -.29);
      const label = headwearLabelHeight(bounds, scale, sway, lift, lean.x, 1.8);
      for (const geo of [wear.geo, wear.metal]) {
        if (!geo) continue;
        const p = geo.getAttribute('position');
        for (let i = 0; i < p.count; i += 11) {
          const point = posedHatPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)), wear.y, .32, 1.8, lean)
            .multiply(scale).applyAxisAngle(new THREE.Vector3(0, 0, 1), sway);
          assert.ok(label > point.y + lift + .13, item.id);
        }
      }
    }
  }
});
