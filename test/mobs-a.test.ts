// Мобы крепости, набор A и общая часть: рендерер орды (инстансы, выбор варианта, вспышка), модели набора —
// цвета, бюджет, конечные позы во всех состояниях вида, существующие виды.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { colored, merge, mobMaterial, newPose, pickVariant, setBone, setChild, type MobAnim, type MobDef } from '../client/fort/mobs/kit.ts';
import { MOB_CAP, MobRenderer, mobRoot, mobSeed } from '../client/fort/mobs/renderer.ts';
import { MOBS_A } from '../client/fort/mobs/set-a.ts';
import { ZS_ATTACK, ZS_BOSS_OPEN, ZS_CLIMB, ZS_HOP, ZS_WALK } from '../shared/fort.ts';
import { KF_BOSS, ZK, Z_BRUTE, Z_KINDS, Z_RUNNER, Z_WALKER } from '../shared/fortkinds.ts';

function anim(over: Partial<MobAnim> = {}): MobAnim {
  return { t: 1.3, gait: 0.4, speed: 2.4, st: 0, stT: 0.2, hit: 0, die: 0, seed: 0.5, rage: false, flags: 0, ...over };
}

function testDef(id: string, kinds: number[], weight = 1, when = 0): MobDef {
  const body = colored(new THREE.BoxGeometry(0.6, 1, 0.4).translate(0, 0.5, 0), 0x88aa66);
  const eye = merge([colored(new THREE.SphereGeometry(0.05, 6, 4).translate(0.1, 0, 0.2), 0xc17bff), colored(new THREE.SphereGeometry(0.05, 6, 4).translate(-0.1, 0, 0.2), 0xc17bff)]);
  return {
    id, name: id, kinds, weight, height: 1.4, ...(when ? { when } : {}),
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
  // низкое качество: у вида один вариант — самый частый
  r.setQuality('low');
  for (const s of [0, 0.1, 0.5, 0.99]) assert.equal(r.variant(0, s)?.id, 'b');
  assert.equal(r.variant(1, 0.3)?.id, 'c');
  r.setQuality('high');
  assert.equal(r.variant(0, 0.1)?.id, 'a');
  for (let id = 1; id < 500; id++) {
    const s = mobSeed(id);
    assert.ok(s >= 0 && s < 1);
  }
  assert.notEqual(mobSeed(1), mobSeed(2));
});

test('выбор варианта: особые (when) — только особям с признаками, вес 0 не выбирается никогда', () => {
  const CREW = 8;
  const RAGE = 64;
  const defs = [testDef('a', [0]), testDef('crab', [0, 3], 2, CREW), testDef('nil', [0], 0), testDef('fiddler', [0], 1, CREW), testDef('b', [0], 2)];
  const r = new MobRenderer(new THREE.Group(), defs);
  const seen = new Set<string>();
  for (let i = 0; i <= 300; i++) {
    const s = i / 300;
    for (const flags of [0, CREW, CREW | RAGE, RAGE]) {
      for (const kind of [0, 3]) {
        const want = pickVariant(defs, kind, s, flags)?.id ?? null;
        assert.equal(r.variant(kind, s, flags)?.id ?? null, want, `вид ${kind}, seed ${s}, признаки ${flags}`);
        if (want) seen.add(`${kind}:${flags & CREW ? 'crew' : 'plain'}:${want}`);
      }
    }
  }
  // обычным — только обычные, экипажу — только особые; вид 3 без обычных моделей рисует крепость, экипаж — краб
  assert.deepEqual([...seen].sort(), ['0:crew:crab', '0:crew:fiddler', '0:plain:a', '0:plain:b', '3:crew:crab'].sort());
  assert.ok(!r.has(3) && r.has(3, CREW) && r.has(0));
  assert.equal(pickVariant(defs, 0, 0.9999999)?.id, 'b', 'хвост — последнему с весом, не нулевому');
  assert.equal(r.group.children.filter((m) => m.name.startsWith('mob:nil:')).length, 0, 'вес 0 — без сеток');
  // anim.flags выбирает особый вариант и в add()
  const root = mobRoot(new THREE.Matrix4(), 0, 0, 0, 0);
  r.begin();
  assert.equal(r.add(3, 0.5, root, anim({ flags: CREW })), true);
  assert.equal(r.add(3, 0.5, root, anim()), false);
  r.end();
  assert.equal((r.group.children.find((m) => m.name === 'mob:crab:body') as THREE.InstancedMesh).count, 1);
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
  // морской туман: светящиеся части без тумана, остальные — как были
  const glowMat = meshes('a').find((m) => m.name.endsWith(':head'))!.material as THREE.MeshStandardMaterial;
  const bodyMat = meshes('a').find((m) => m.name.endsWith(':body'))!.material as THREE.MeshStandardMaterial;
  r.setFogGlow(true);
  assert.equal(glowMat.fog, false);
  assert.equal(bodyMat.fog, true);
  r.setFogGlow(false);
  assert.equal(glowMat.fog, true);

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

// ------------------------------------------------------------ модели набора A

const STATES_A = [ZS_WALK, ZS_ATTACK, ZS_HOP, ZS_CLIMB, ZS_BOSS_OPEN];

test('набор A: части с цветом, бюджет, существующие виды, 2–3 варианта у вида', () => {
  assert.ok(MOBS_A.length >= 7);
  const ids = new Set<string>();
  for (const def of MOBS_A) {
    assert.ok(!ids.has(def.id), `id ${def.id} уникален`);
    ids.add(def.id);
    assert.ok(def.kinds.length > 0 && def.kinds.every((k) => Number.isInteger(k) && k >= 0 && k < Z_KINDS && ZK[k]), `${def.id}: виды существуют`);
    assert.ok(def.parts.length > 0 && def.parts.length <= 6, `${def.id}: до 6 частей`);
    let tris = 0;
    for (const part of def.parts) {
      for (const name of ['position', 'normal', 'color']) assert.ok(part.geo.getAttribute(name), `${def.id}/${part.bone}: есть ${name}`);
      tris += (part.geo.index ? part.geo.index.count : part.geo.getAttribute('position').count) / 3;
    }
    const boss = def.kinds.some((k) => (ZK[k].flags & KF_BOSS) !== 0);
    assert.ok(tris <= (boss ? 6000 : 1500), `${def.id}: ${tris} треугольников`);
    assert.ok(def.parts.some((p) => p.glow), `${def.id}: светящиеся глаза (glow)`);
  }
  for (const kind of [Z_WALKER, Z_RUNNER, Z_BRUTE]) {
    const n = MOBS_A.filter((d) => d.kinds.includes(kind)).length;
    assert.ok(n >= 2 && n <= 3, `${ZK[kind].name}: ${n} варианта`);
  }
});

test('набор A: позы конечные во всех состояниях, при ударе и гибели; стоит на земле; к концу гибели почти исчез', () => {
  const pose = newPose();
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  const posed = (def: MobDef, a: MobAnim) => {
    def.pose(a, pose);
    box.makeEmpty();
    for (const part of def.parts) {
      if (!part.geo.boundingBox) part.geo.computeBoundingBox();
      b.copy(part.geo.boundingBox!).applyMatrix4(pose[part.bone]);
      box.union(b);
    }
    return box;
  };
  for (const def of MOBS_A) {
    for (const st of STATES_A) {
      for (const stT of [0, 0.1, 0.18, 0.3, 0.6, 2.5]) {
        for (const [hit, die] of [[0, 0], [1, 0], [0.5, 0], [0, 0.2], [0, 0.5], [0, 0.8], [0, 1]]) {
          for (const seed of [0, 0.37, 0.999]) {
            def.pose(anim({ st, stT, hit, die, seed, gait: (stT * 1.7) % 1, t: stT * 3 + seed, speed: st === ZS_WALK ? 2.4 : 0 }), pose);
            for (const part of def.parts) {
              const m = pose[part.bone];
              assert.ok(m.elements.every(Number.isFinite), `${def.id}/${part.bone}: st ${st} die ${die} — конечная матрица`);
              assert.ok(Math.abs(m.determinant()) > 1e-9, `${def.id}/${part.bone}: масштаб не ноль`);
            }
          }
        }
      }
    }
    const rest = posed(def, anim({ speed: 0, gait: 0 }));
    assert.ok(Math.abs(rest.min.y) < 0.05, `${def.id}: ноги на земле (${rest.min.y.toFixed(3)})`);
    assert.ok(rest.max.y > def.height * 0.85 && rest.max.y < def.height * 1.2, `${def.id}: рост ${def.height} ≈ ${rest.max.y.toFixed(2)}`);
    const k = ZK[def.kinds[0]];
    assert.ok(rest.max.y > k.headY, `${def.id}: голова выше кольца «в голову»`);
    const gone = posed(def, anim({ die: 1, speed: 0 }));
    assert.ok(gone.max.y < def.height * 0.45, `${def.id}: к концу гибели ушёл в землю или сжался (${gone.max.y.toFixed(2)})`);
  }
});

test('набор A: стопы не скользят — опорная нога стоит, пока тело идёт', () => {
  const pose = newPose();
  const lowest = new THREE.Vector3();
  const p = new THREE.Vector3();
  const root = new THREE.Matrix4();
  for (const def of MOBS_A) {
    const legs = def.parts.filter((part) => part.bone === 'legL' || part.bone === 'legR');
    if (!legs.length) continue;
    const speed = ZK[def.kinds[0]].speed;
    for (const leg of legs) {
      // подошва: точка прямо под шарниром на глубине самой нижней вершины ноги
      const pos = leg.geo.getAttribute('position');
      lowest.set(0, Infinity, 0);
      for (let i = 0; i < pos.count; i++) lowest.y = Math.min(lowest.y, pos.getY(i));
      let slide = 0;
      let path = 0;
      let lastZ = NaN;
      const dt = 1 / 240;
      let z = 0;
      let gait = 0;
      for (let f = 0; f < 240 * 3; f++) {
        z += speed * dt;
        gait = (gait + (speed * dt) / 1.25) % 1;
        def.pose(anim({ gait, speed, t: f * dt, seed: 0.5 }), pose);
        root.makeTranslation(0, 0, z);
        p.copy(lowest).applyMatrix4(pose[leg.bone]).applyMatrix4(root);
        if (p.y < 0.012) {
          if (!Number.isNaN(lastZ)) {
            slide += Math.abs(p.z - lastZ);
            path += speed * dt;
          }
          lastZ = p.z;
        } else {
          lastZ = NaN;
        }
      }
      assert.ok(path > 0.3, `${def.id}/${leg.bone}: нога касается земли`);
      assert.ok(slide / path < 0.2, `${def.id}/${leg.bone}: скольжение ${(100 * slide / path).toFixed(0)} % пути опоры`);
    }
  }
});
