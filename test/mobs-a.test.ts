// Мобы крепости, набор A и общая часть: рендерер орды (инстансы, выбор варианта, вспышка), модели набора —
// цвета, бюджет, конечные позы во всех состояниях вида, существующие виды.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { colored, merge, mobMaterial, newPose, pickVariant, setBone, setChild, type MobAnim, type MobDef } from '../client/fort/mobs/kit.ts';
import { MOB_CAP, MobRenderer, mobRoot, mobSeed } from '../client/fort/mobs/renderer.ts';

function anim(over: Partial<MobAnim> = {}): MobAnim {
  return { t: 1.3, gait: 0.4, speed: 2.4, st: 0, stT: 0.2, hit: 0, die: 0, seed: 0.5, rage: false, flags: 0, ...over };
}

function testDef(id: string, kinds: number[], weight = 1): MobDef {
  const body = colored(new THREE.BoxGeometry(0.6, 1, 0.4).translate(0, 0.5, 0), 0x88aa66);
  const eye = merge([colored(new THREE.SphereGeometry(0.05, 6, 4).translate(0.1, 0, 0.2), 0xc17bff), colored(new THREE.SphereGeometry(0.05, 6, 4).translate(-0.1, 0, 0.2), 0xc17bff)]);
  return {
    id, name: id, kinds, weight, height: 1.4,
    parts: [{ bone: 'body', geo: body }, { bone: 'head', geo: eye, glow: true }],
    pose(a, out) {
      setBone(out.body, 0, Math.sin(a.gait * Math.PI * 2) * 0.05, 0, -a.hit * 0.3, 0, 0, 1 - a.die * 0.9);
      setChild(out.head, out.body, 0, 1.1, 0);
    },
  };
}

test('рендерер: вариант по seed — тот же, что pickVariant (и на краях)', () => {
  const defs = [testDef('a', [0]), testDef('b', [0, 3], 3), testDef('c', [1])];
  const r = new MobRenderer(new THREE.Group(), defs);
  assert.ok(r.has(0) && r.has(1) && r.has(3));
  assert.ok(!r.has(2));
  for (let i = 0; i <= 200; i++) {
    for (const kind of [0, 1, 2, 3]) assert.equal(r.variant(kind, i / 200)?.id ?? null, pickVariant(defs, kind, i / 200)?.id ?? null);
  }
  for (const seed of [1, 1.5, -0.2, Number.NaN]) assert.ok(pickVariant(defs, 0, seed), `seed ${seed} не теряет модель`);
  assert.equal(r.variant(0, 0.1)?.id, 'a');
  assert.equal(r.variant(0, 0.9)?.id, 'b');
  for (let id = 1; id < 500; id++) {
    const s = mobSeed(id);
    assert.ok(s >= 0 && s < 1);
  }
  assert.notEqual(mobSeed(1), mobSeed(2));
});

test('рендерер: особи в инстансах — кость × корень, вспышка и оттенок, пустые сетки спрятаны, переполнение', () => {
  const parent = new THREE.Group();
  const defs = [testDef('a', [0]), testDef('b', [0], 3), testDef('c', [1])];
  const r = new MobRenderer(parent, defs);
  assert.equal(parent.children.length, 1);
  const meshes = (id: string) => r.group.children.filter((m) => m.name.startsWith(`mob:${id}:`)) as THREE.InstancedMesh[];
  assert.equal(meshes('a').length, 2);
  const root = mobRoot(new THREE.Matrix4(), 3, 0, -20, Math.PI);
  // корень: ноги в точке, модель (смотрит по +Z) повёрнута на yaw + π — при yaw = π лицом по +Z
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(root);
  assert.ok(Math.abs(fwd.z - 1) < 1e-6);
  const fwd2 = new THREE.Vector3(0, 0, 1).transformDirection(mobRoot(new THREE.Matrix4(), 0, 0, 0, 0));
  assert.ok(Math.abs(fwd2.z + 1) < 1e-6, 'yaw = 0 — лицом в −Z, как у сервера');

  r.begin();
  assert.equal(r.add(0, 0.1, root, anim({ hit: 1 }), 0.7, new THREE.Color(0x5b9bd5), 0.25), true);
  assert.equal(r.add(0, 0.1, root, anim()), true);
  assert.equal(r.add(0, 0.9, root, anim()), true);
  assert.equal(r.add(2, 0.5, root, anim()), false, 'для вида нет модели — рисует крепость');
  r.end();
  assert.equal(r.count, 3);
  for (const m of meshes('a')) assert.equal(m.count, 2);
  for (const m of meshes('b')) assert.equal(m.count, 1);
  for (const m of meshes('a')) assert.equal(m.visible, true);
  for (const m of meshes('c')) assert.equal(m.visible, false, 'пустая сетка не рисуется');

  const pose = newPose();
  defs[0].pose(anim({ hit: 1 }), pose);
  const got = new THREE.Matrix4();
  const body = meshes('a').find((m) => m.name.endsWith(':body'))!;
  body.getMatrixAt(0, got);
  const want = new THREE.Matrix4().multiplyMatrices(root, pose.body);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(got.elements[i] - want.elements[i]) < 1e-4, 'матрица инстанса = корень × кость (float32)');
  const geo = body.geometry;
  assert.ok(Math.abs((geo.getAttribute('mobFlash').array as Float32Array)[0] - 0.7) < 1e-6);
  const tint = geo.getAttribute('mobTint').array as Float32Array;
  assert.ok(Math.abs(tint[3] - 0.25) < 1e-6 && tint[7] === 0, 'оттенок только у первой особи');
  assert.equal(geo.getAttribute('position'), defs[0].parts[0].geo.getAttribute('position'), 'буферы модели общие, без копий');

  r.begin();
  let ok = 0;
  for (let i = 0; i < MOB_CAP + 5; i++) if (r.add(1, 0.5, root, anim())) ok++;
  r.end();
  assert.equal(ok, MOB_CAP, 'сверх вместимости — false, крепость дорисует по-старому');
  for (const m of meshes('a')) assert.equal(m.visible, false, 'кого нет в кадре — спрятаны');

  r.dispose();
  assert.equal(parent.children.length, 0);
});

test('материал: вставки в шейдер three на месте, нормаль инстанса точна при сжатом корне', () => {
  for (const glow of [false, true]) {
    const mat = mobMaterial(glow);
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    assert.ok(!shader.vertexShader.includes('#include <defaultnormal_vertex>'), 'нормаль инстанса — своя');
    assert.ok(shader.vertexShader.includes('attribute float mobFlash') && shader.vertexShader.includes('vMobFlash = mobFlash'));
    assert.ok(shader.vertexShader.includes('cross( mobIm[ 1 ], mobIm[ 2 ] )'));
    assert.ok(shader.fragmentShader.includes('mix( diffuseColor.rgb, vec3( 1.0 ), clamp( vMobFlash, 0.0, 1.0 ) )'), 'вспышка в белый после цвета вершин');
    assert.ok('uMobFlash' in shader.uniforms && 'uMobTint' in shader.uniforms);
  }
  // то же, что шейдер: присоединённая матрица против точной (обратной транспонированной) — корень сжат, кость повёрнута
  const root = mobRoot(new THREE.Matrix4(), 1, 0, -14, 0.7).multiply(new THREE.Matrix4().makeScale(0.82, 0.58, 0.82));
  const bone = setBone(new THREE.Matrix4(), 0, 1.2, 0, 0.6, 0.3, -0.4, 1);
  const m = new THREE.Matrix4().multiplyMatrices(root, bone);
  const e = m.elements;
  const c0 = new THREE.Vector3(e[0], e[1], e[2]);
  const c1 = new THREE.Vector3(e[4], e[5], e[6]);
  const c2 = new THREE.Vector3(e[8], e[9], e[10]);
  const adj = new THREE.Matrix3().set(...[new THREE.Vector3().crossVectors(c1, c2), new THREE.Vector3().crossVectors(c2, c0), new THREE.Vector3().crossVectors(c0, c1)]
    .flatMap((v) => v.toArray()) as [number, number, number, number, number, number, number, number, number]).transpose();
  const exact = new THREE.Matrix3().getNormalMatrix(m);
  for (const n of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.3, -0.5, 0.8).normalize()]) {
    const a = n.clone().applyMatrix3(adj).normalize();
    const b = n.clone().applyMatrix3(exact).normalize();
    assert.ok(a.distanceTo(b) < 1e-6, 'нормаль сжатого босса — без искажения');
  }
});
