// Бюджет отрисовки новой набережной (PLAZA3, WP13, client/lobby/plaza3/perf.ts): какие материалы приводим к общему виду,
// с какого расстояния не рисуем мелочь, где отсечение работает и что греем из спрятанного. Чистые решения, без WebGL.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Plaza3Perf, UNIT_MAX_R, canonOf, cullDistance, inArea, paintsLate, warmHidden } from '../client/lobby/plaza3/perf.ts';
import { buildOccluders, openSight, semanticDistance, makeFade, decideFade, stepFade, fadingMaterial, prepareFadeMaterial } from '../client/lobby/plaza3/visibility.ts';

test('дальность: мелочь — с 20 м, вывеска 2 м — с 45 м, катер 3 м — с 67 м, растёт с размером', () => {
  assert.equal(cullDistance(0.05), 20);
  assert.equal(cullDistance(0.5), 30);
  assert.equal(cullDistance(2), 45);
  assert.equal(cullDistance(3), 67.5);
  assert.equal(cullDistance(UNIT_MAX_R), 180);
  for (let r = 0; r < UNIT_MAX_R; r += 0.25) assert.ok(cullDistance(r + 0.25) >= cullDistance(r), `монотонно при r=${r}`);
});

test('отсекаем на суше, в порту и у мола, задник за рамкой не трогаем', () => {
  assert.ok(inArea(8, -5.6), 'спавн');
  assert.ok(inArea(-6, 14), 'порт');
  assert.ok(inArea(-68, 58), 'мол');
  assert.ok(!inArea(-490, 19), 'дальний берег');
  assert.ok(!inArea(120, 0), 'город на востоке');
  assert.ok(!inArea(0, -80), 'город на севере');
});

test('общий вид: простые стандартные, неосвещённые и точки — да; свой шейдер, желейка, ферма — нет', () => {
  assert.deepEqual(canonOf(new THREE.MeshStandardMaterial(), false), { vc: true, map: true });
  assert.deepEqual(canonOf(new THREE.MeshBasicMaterial(), false), { vc: true, map: true });
  assert.deepEqual(canonOf(new THREE.PointsMaterial(), false), { vc: true, map: false });
  assert.equal(canonOf(new THREE.MeshStandardMaterial(), true), null, 'желейка');
  assert.equal(canonOf(new THREE.MeshStandardMaterial({ name: 'farm_soft' }), false), null, 'ферма');
  const own = new THREE.MeshStandardMaterial();
  own.customProgramCacheKey = () => 'durak-card';
  assert.equal(canonOf(own, false), null, 'свой шейдер');
  const keep = new THREE.MeshBasicMaterial();
  keep.userData.p3keep = true;
  assert.equal(canonOf(keep, false), null, 'p3keep');
  assert.equal(canonOf(new THREE.MeshLambertMaterial(), false), null, 'ламберт — как есть');
  const def = new THREE.MeshStandardMaterial();
  def.defines = { STANDARD: '', USE_FOO: '' };
  assert.equal(canonOf(def, false), null, 'свои defines');
});

test('«рисованный» вид поздней модели: без своего шейдера, не желейка, не ферма и ещё не крашеное', () => {
  assert.ok(paintsLate(new THREE.MeshStandardMaterial(), false));
  assert.ok(!paintsLate(new THREE.MeshStandardMaterial(), true), 'желейка');
  assert.ok(!paintsLate(new THREE.MeshStandardMaterial({ name: 'farm_soft' }), false), 'ферма');
  const own = new THREE.MeshStandardMaterial();
  own.customProgramCacheKey = () => 'billiard-balls-v1';
  assert.ok(!paintsLate(own, false), 'свой шейдер');
  const painted = new THREE.MeshStandardMaterial();
  const key = painted.customProgramCacheKey();
  painted.customProgramCacheKey = () => key + '|look2g';
  assert.ok(!paintsLate(painted, false), 'уже крашено');
});

test('прогрев спрятанного: отдельная сетка со своим шейдером (дождь, след лодки) — да; группа события — нет', () => {
  const rain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial());
  assert.ok(warmHidden(rain));
  const event = new THREE.Group();
  event.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial()));
  assert.ok(!warmHidden(event), 'группа');
  assert.ok(!warmHidden(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial())), 'обычный материал');
});

test('прямая видимость: настоящая стена закрывает, пол/граница/целевая рама не прячут предмет', () => {
  const walls = buildOccluders([
    { id: 'wall', pav: 'cafe', min: [4, 0, -2], max: [5, 5, 2] },
    { id: 'floor', pav: 'cafe', min: [0, -.5, -10], max: [20, 0, 10] },
    { id: 'world', q: 'edge', min: [2, -5, -20], max: [3, 30, 20] },
  ]);
  assert.equal(walls.length, 1);
  const cam = new THREE.Vector3(0, 2, 0);
  assert.equal(openSight(cam, new THREE.Vector3(10, 2, 0), .5, walls), false);
  assert.equal(openSight(cam, new THREE.Vector3(10, 2, 8), .5, walls), true);
  assert.equal(openSight(cam, new THREE.Vector3(4.7, 2, 0), 1, walls), true, 'собственное здание/корпус');
});

test('дальность семантической группы передаётся струям, мелким деталям и поздним потомкам', () => {
  const root = new THREE.Group(); root.userData.p3visibility = 110;
  const middle = new THREE.Group(); root.add(middle);
  const water = new THREE.Mesh(new THREE.SphereGeometry(.05), new THREE.MeshStandardMaterial()); middle.add(water);
  assert.equal(semanticDistance(water), 110);
  middle.userData.p3visibility = 60;
  assert.equal(semanticDistance(water), 110, 'ребёнок не сокращает дальность важного целого');
});

test('проявление: подтверждение, гистерезис и разворот без скачка размера/яркости', () => {
  const f = makeFade();
  decideFade(f, 111, 110, 0); stepFade(f, .1);
  assert.equal(f.value, 1, 'дальний порог должен продержаться .2с');
  decideFade(f, 111, 110, .21); stepFade(f, .11);
  assert.ok(f.value > 0 && f.value < 1);
  const half = f.value;
  decideFade(f, 107, 110, .22); stepFade(f, .03);
  assert.ok(f.value < half, 'обратные 3м остаются в гистерезисе');
  decideFade(f, 103, 110, .25);
  const reversed = f.value; stepFade(f, .1);
  assert.ok(f.value > reversed && f.value <= 1, 'разворот проявляется от текущего значения');
});

test('fade не меняет соседний общий материал и не переключает прозрачность/ключ программы', () => {
  const source = new THREE.MeshStandardMaterial({ color: 0xabcdef });
  const a = fadingMaterial(source), b = fadingMaterial(source);
  a.fade.value = .4;
  assert.equal(b.fade.value, 1); assert.equal(source.opacity, 1);
  assert.equal(a.material.transparent, false); assert.equal(a.material.depthWrite, true);
  assert.equal(a.material.customProgramCacheKey(), b.material.customProgramCacheKey());
  const key = a.material.customProgramCacheKey(); a.fade.value = 0;
  assert.equal(a.material.customProgramCacheKey(), key, 'значение uniform не создаёт программу');
});

test('настоящий scene graph: на Близко тонкие струи наследуют110м и не остаются на скрытом слое', () => {
  const add = THREE.Object3D.prototype.add, attach = THREE.Object3D.prototype.attach, before = THREE.Material.prototype.onBeforeRender;
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1.6, .1, 1600);
    camera.position.set(15, 3, 65); camera.lookAt(15, 1, 10); camera.updateMatrixWorld();
    const root = new THREE.Group(); root.userData.p3visibility = 110; root.position.set(15, 0, 10);
    const shared = new THREE.MeshStandardMaterial();
    for (let i = 0; i < 3; i++) { const jet = new THREE.Mesh(new THREE.SphereGeometry(.1), shared); jet.position.set(i, 1, 0); root.add(jet); }
    scene.add(root); scene.updateMatrixWorld(true);
    // Здесь проверяется сцена/слои; WebGL-compile и бюджет проверяет ведущий в браузере.
    const gl = { properties: { get: () => ({}) }, info: { programs: [] } } as unknown as THREE.WebGLRenderer;
    const perf = new Plaza3Perf({ scene, camera, gl, look: null });
    const core = perf as unknown as { scan(): void; cull(cam: THREE.Vector3, scale: number, now: number): void; fadeFrame(dt: number): void };
    core.scan(); core.cull(camera.position, .58, 0); core.cull(camera.position, .58, .3); core.fadeFrame(.3);
    for (const jet of root.children) assert.equal(jet.layers.mask, 1, 'нет независимого20м cutoff потомка');
    assert.equal(perf.debug().units, 1, 'цельный эффект имеет один согласованный порог');
    const late = new THREE.Mesh(new THREE.SphereGeometry(.04), shared); root.add(late); scene.updateMatrixWorld(true);
    core.scan(); core.cull(camera.position, .58, .6); core.fadeFrame(.3);
    assert.equal(late.layers.mask, 1, 'поздний потомок наследует тот же порог');
  } finally { THREE.Object3D.prototype.add = add; THREE.Object3D.prototype.attach = attach; THREE.Material.prototype.onBeforeRender = before; }
});

test('общий source и два clones получают один shader hook с независимыми uniform', () => {
  const source = new THREE.MeshStandardMaterial(); prepareFadeMaterial(source);
  const a = fadingMaterial(source), b = fadingMaterial(source);
  const shader = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader });
  const sa = shader(), sb = shader();
  a.material.onBeforeCompile(sa as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
  b.material.onBeforeCompile(sb as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
  a.fade.value = .2;
  const uniforms = sa.uniforms as Record<string, { value: number }>;
  assert.equal(uniforms.p3Fade.value, .2);
  assert.equal((sb.uniforms as Record<string, { value: number }>).p3Fade.value, 1);
  assert.equal(sa.fragmentShader.match(/uniform float p3Fade;/g)?.length, 1, 'без повторного объявления GLSL');
  assert.equal(a.material.customProgramCacheKey(), source.customProgramCacheKey(), 'source и clones не плодят варианты');
});

test('остров и калитка фермы прогревают source и fade clone с одним ключом', () => {
  const add = THREE.Object3D.prototype.add, attach = THREE.Object3D.prototype.attach, before = THREE.Material.prototype.onBeforeRender;
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const isle = new THREE.Group(); isle.name = 'isle'; scene.add(isle);
    const sources = [new THREE.MeshStandardMaterial({ name: 'fi_glass' }), new THREE.MeshStandardMaterial({ name: 'farm_soft' }), new THREE.MeshStandardMaterial({ name: 'farm_plant' })];
    for (const [i, source] of sources.entries()) (i === 0 ? isle : scene).add(new THREE.Mesh(new THREE.BoxGeometry(), source));
    const gl = { properties: { get: () => ({}) }, info: { programs: [] } } as unknown as THREE.WebGLRenderer;
    const perf = new Plaza3Perf({ scene, camera, gl, look: null });
    (perf as unknown as { prepareFadeSources(root: THREE.Object3D): void }).prepareFadeSources(scene);
    for (const source of sources) {
      const clone = fadingMaterial(source);
      assert.equal(source.customProgramCacheKey(), clone.material.customProgramCacheKey(), source.name + ': source не оставляет лишнюю программу без fade');
      assert.equal(source.opacity, 1); assert.equal(source.transparent, false);
    }
  } finally { THREE.Object3D.prototype.add = add; THREE.Object3D.prototype.attach = attach; THREE.Material.prototype.onBeforeRender = before; }
});

test('готовый fade материал повторно принимается в сцену без второй GLSL инъекции', () => {
  const source = new THREE.MeshStandardMaterial(), first = fadingMaterial(source);
  first.fade.value = .35;
  const key = first.material.customProgramCacheKey();
  prepareFadeMaterial(first.material);
  const second = fadingMaterial(first.material);
  assert.equal(first.material.customProgramCacheKey(), key);
  assert.equal(second.material.customProgramCacheKey(), key);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as Parameters<THREE.Material['onBeforeCompile']>[0];
  first.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.equal(shader.fragmentShader.match(/uniform float p3Fade;/g)?.length, 1);
  assert.equal((shader.uniforms.p3Fade as { value: number }).value, .35, 'повторный adopt не сбрасывает текущий fade');
});

test('поздний island attach подготавливает нейтральный fade и белую Basic карту до компиляции', () => {
  const add = THREE.Object3D.prototype.add, attach = THREE.Object3D.prototype.attach, before = THREE.Material.prototype.onBeforeRender;
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const root = new THREE.Group(); root.name = 'isle'; scene.add(root);
    const gl = { properties: { get: () => ({}) }, info: { programs: [] }, shadowMap: { enabled: false }, compileAsync: () => Promise.resolve() } as unknown as THREE.WebGLRenderer;
    const perf = new Plaza3Perf({ scene, camera, gl, look: null });
    perf.beforeRender(); perf.afterRender();
    const material = new THREE.MeshBasicMaterial({ name: 'fi_glow', vertexColors: true, color: 0xff9933 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); mesh.position.set(3, 2, 1); mesh.updateMatrixWorld();
    const worldBefore = mesh.matrixWorld.clone();
    root.attach(mesh);
    assert.equal(material.customProgramCacheKey().match(/\|p3fade1/g)?.length, 1);
    assert.equal(material.map?.name, 'p3-white', 'identity карта объединяет map/no-map glow shader');
    const image = material.map!.image as { data: Uint8Array };
    assert.deepEqual([...image.data], [255, 255, 255, 255], 'карта умножает все цветовые/alpha каналы на1');
    assert.equal(material.color.getHex(), 0xff9933); assert.equal(material.opacity, 1);
    assert.deepEqual(mesh.matrixWorld.elements, worldBefore.elements, 'attach сохраняет мировую позу');
  } finally { THREE.Object3D.prototype.add = add; THREE.Object3D.prototype.attach = attach; THREE.Material.prototype.onBeforeRender = before; }
});
