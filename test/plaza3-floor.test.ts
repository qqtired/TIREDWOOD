// Пол и дальность новой набережной (флаг PLAZA3; client/lobby/plaza3/floor.ts, perf.ts, npc.ts): слои земли блокаута
// не лежат вплотную и все ниже плитки моделей; наклейки (круги режимов, старт картинга, пятна света, тени-пятна, лужи)
// — выше земли и плитки; игровое (userData.p3keep) отсечение дальности не прячет никогда, мелочь — по меню «Дальность
// видимости»; жители на «Далеко» видны через всю набережную. На старой площади подъём наклеек — 0.
// Раскладка выбирается при импорте (shared/layout.ts): сначала PLAZA3=1, потом — только динамический import().
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import * as THREE from 'three';

process.env.PLAZA3 = '1';
const { FLOOR_Y, MODEL_FLOOR_MIN, DECAL_LIFT } = await import('../client/lobby/plaza3/floor.ts');
const { P3 } = await import('../shared/plaza3/layout.ts');
const { Plaza3Perf, decorScale, cullDistance } = await import('../client/lobby/plaza3/perf.ts');
const { NPC_FAR, npcFar } = await import('../client/lobby/plaza3/npc.ts');

/** Самая высокая плитка моделей павильонов у земли (мол, Рыбный двор — 4,4 см; замер по сценам 11.10) */
const MODEL_FLOOR_MAX = 0.044;
/** Наклейки на высотах старой площади (м): пятна света, круги режимов, старт картинга, тени, лужи, отблески фонарей */
const DECALS = { pool: 0.012, circleRing: 0.016, circleDisc: 0.019, kartPad: 0.01, kartRing: 0.012, kartLabel: 0.014, kartGlow: 0.02, ballShadow: 0.02, avatarShadow: 0.015, npcShadow: 0.02, puddle: 0.012, streak: 0.02 };

test('земля: стопка слоёв с шагом ≥ 2 мм, вся ниже плитки моделей; у каждого вида дорожки своя высота', () => {
  const stack = [0, FLOOR_Y.patch, FLOOR_Y.secondary, FLOOR_Y.boulevard, FLOOR_Y.main, FLOOR_Y.plaza, FLOOR_Y.rose];
  for (let i = 1; i < stack.length; i++) assert.ok(stack[i] - stack[i - 1] >= 0.002 - 1e-9, `шаг ${i}: ${stack[i - 1]} → ${stack[i]}`);
  assert.ok(FLOOR_Y.rose + 0.002 <= MODEL_FLOOR_MIN + 1e-9, 'роза ниже самой низкой плитки моделей');
  const kinds = new Set(P3.paths.map((p) => p.kind));
  for (const k of kinds) assert.ok(k in FLOOR_Y, `вид дорожки ${k} — со своей высотой`);
  const ys = [...kinds].map((k) => FLOOR_Y[k as keyof typeof FLOOR_Y]);
  assert.equal(new Set(ys).size, ys.length, 'разные виды дорожек — на разных высотах (перекрёстки не мерцают)');
  for (const g of P3.ground) assert.ok(g.kind in FLOOR_Y || ['sand', 'lawn', 'gravel', 'dirt'].includes(g.kind), `пятно ${g.kind}`);
});

test('наклейки: выше розы на ≥ 1,5 см и выше плитки моделей; подложка батута — над газоном и аллеей', () => {
  for (const [what, y] of Object.entries(DECALS)) {
    assert.ok(y + DECAL_LIFT >= FLOOR_Y.rose + 0.015, `${what}: ${y + DECAL_LIFT} над розой`);
    assert.ok(y + DECAL_LIFT >= MODEL_FLOOR_MAX + 0.005, `${what}: ${y + DECAL_LIFT} над плиткой моделей`);
  }
  // батуты (client/render/kit.ts, подложка на 0,7 см) стоят на газоне, крайний — краем на аллее
  assert.ok(0.007 - FLOOR_Y.secondary >= 0.002 && 0.007 - FLOOR_Y.patch >= 0.002);
});

test('старая площадь: подъёма наклеек нет', () => {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./client/lobby/plaza3/floor.ts'); console.log(m.DECAL_LIFT);"], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PLAZA3: '' },
    encoding: 'utf8',
  });
  assert.equal(out.trim(), '0');
});

test('дальность по меню: «Далеко» — как замерено для бюджета, ближе — раньше; жители на «Далеко» — через всю набережную', () => {
  assert.equal(decorScale(1), 1);
  assert.ok(decorScale(0.6) < 1 && decorScale(0.3) < decorScale(0.6) && decorScale(0.3) >= 0.5);
  assert.ok(npcFar(0.3) >= NPC_FAR && npcFar(0.3) <= 50, '«Близко» — как зазывалы старой площади');
  assert.ok(npcFar(0.6) > NPC_FAR && npcFar(0.6) < npcFar(1));
  // суша 94×78 м и мол: из любого угла видно жителя в другом
  const xs = P3.land.polygon.map(([x]) => x);
  const zs = P3.land.polygon.map(([, z]) => z);
  assert.ok(npcFar(1) >= Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)), `npcFar(1) = ${npcFar(1)}`);
});

test('отсечение: игровое (p3keep) не прячется никогда, мелочь — дальше cullDistance × дальность меню', () => {
  // WebGL не нужен: отсечение смотрит только на сцену, слои и камеру
  const gl = {
    properties: { get: () => ({}) }, info: { programs: [] }, shadowMap: { enabled: false, needsUpdate: false },
    toneMapping: THREE.NoToneMapping, compileAsync: () => Promise.resolve(),
  } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  let k = 1;
  const perf = new Plaza3Perf({ gl, scene, camera, look: null, viewK: () => k });
  const box = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshLambertMaterial());
  const ball = new THREE.Group();
  ball.add(box());
  ball.userData.p3keep = true;
  ball.position.set(8, 0, -8);
  const crate = box();
  crate.position.set(8, 0, -9);
  const far = box();
  far.position.set(8, 0, -50);
  scene.add(ball, crate, far);
  scene.updateMatrixWorld(true);
  const drawn = (o: THREE.Object3D): boolean => o.layers.test(camera.layers);
  const at = (z: number): void => {
    camera.position.set(8, 1.7, z);
    (perf as unknown as { scanAt: number; cullAt: number }).scanAt = 0;
    (perf as unknown as { cullAt: number }).cullAt = 0;
    perf.beforeRender();
    perf.afterRender();
  };
  const lim = cullDistance(Math.hypot(0.3, 0.3, 0.3));
  at(-9 + lim + 10);
  assert.ok(drawn(ball.children[0]), 'мяч виден издалека');
  assert.ok(!drawn(crate), 'ящик дальше своей дальности не рисуется');
  at(-9 + lim - 6);
  assert.ok(drawn(crate), 'ближе — снова виден');
  k = 0.3;
  at(-9 + lim - 6);
  assert.ok(!drawn(crate) && drawn(ball.children[0]), '«Близко»: ящик прячется раньше, мяч — нет');
  at(-9);
  assert.ok(drawn(crate) && drawn(far) === false, 'рядом ящик виден; дальний — нет');
});
