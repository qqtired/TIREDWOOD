// Renderer и пункты графики «Тени» и «Дальность» (client/render/renderer.ts): действуют на все сцены через общий render(),
// в том числе на ждущие в памяти; сцена, которая сама меняет размер карты теней или туман, не ломается.
// Видеокарту подменяем так же, как в renderer-restore.test.ts: настоящий Renderer, фальшивый WebGLRenderer.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

interface Seen { fogNear: number | null; fogFar: number | null; camFar: number; enabled: boolean }

async function makeRenderer(t: { after(fn: () => void): void }) {
  const canvas = new EventTarget();
  const seen: Seen[] = [];
  const gpu = {
    shadowMap: { enabled: true, type: 0, autoUpdate: false, needsUpdate: false },
    info: { autoReset: false, reset: () => {} },
    getContext: () => ({ getExtension: () => null }),
    domElement: canvas,
    clear: () => {},
    setPixelRatio: () => {},
    setSize: () => {},
    render: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
      const fog = scene.fog as THREE.Fog | null;
      seen.push({ fogNear: fog ? fog.near : null, fogFar: fog ? fog.far : null, camFar: camera.far, enabled: gpu.shadowMap.enabled });
    },
  };
  Object.defineProperty(globalThis, '__gfxGpuFactory', { configurable: true, value: () => gpu });
  const hooks = registerHooks({
    load(url, context, next) {
      const result = next(url, context);
      if (new URL(url).pathname.endsWith('/client/render/renderer.ts')) {
        return { ...result, source: String(result.source).replace("new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false })", '(globalThis as any).__gfxGpuFactory()') };
      }
      return result;
    },
  });
  t.after(() => {
    hooks.deregister();
    Reflect.deleteProperty(globalThis, '__gfxGpuFactory');
  });
  const { Renderer } = await import(new URL('../client/render/renderer.ts?gfx=1', import.meta.url).href);
  return { renderer: new Renderer(canvas as unknown as HTMLCanvasElement), gpu, seen };
}

function makeScene(opts: { fog?: [number, number]; size?: number } = {}) {
  const scene = new THREE.Scene();
  if (opts.fog) scene.fog = new THREE.Fog(0x88aacc, opts.fog[0], opts.fog[1]);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  const size = opts.size ?? 2048;
  sun.shadow.mapSize.set(size, size);
  let disposed = 0;
  (sun.shadow as unknown as { map: unknown }).map = { dispose: () => { disposed++; } };
  const mat = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [mat, new THREE.MeshBasicMaterial()]);
  scene.add(sun, sun.target, mesh);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 1600);
  return { scene, sun, mat, mesh, camera, disposed: () => disposed };
}

test('тени «выкл»: карта не рисуется, материалы пересобираются, флаг пересчёта не взводится', async (t) => {
  const { renderer, gpu } = await makeRenderer(t);
  const a = makeScene();
  const b = makeScene();
  renderer.render(a.scene, a.camera);
  renderer.render(b.scene, b.camera);
  const v = a.mat.version;
  gpu.shadowMap.needsUpdate = false;
  renderer.setShadows('off');
  assert.equal(gpu.shadowMap.enabled, false);
  assert.equal(gpu.shadowMap.needsUpdate, false, 'пока тени выключены, пересчитывать нечего (иначе запечённая плитка пекла бы каждый кадр)');
  assert.equal(renderer.shadowGen, 1);
  // каждая сцена подстраивается при своей первой отрисовке после смены, а не сразу
  assert.equal(a.mat.version, v);
  renderer.render(a.scene, a.camera);
  assert.ok(a.mat.version > v, 'материалы сцены собираются заново без кода теней');
  const vb = b.mat.version;
  assert.equal(b.mat.version, vb, 'сцена в памяти ещё не рисовалась — не трогаем');
  renderer.render(b.scene, b.camera);
  assert.ok(b.mat.version > vb, 'а нарисовали — подстроилась');
  const v2 = a.mat.version;
  renderer.render(a.scene, a.camera);
  assert.equal(a.mat.version, v2, 'повторно в том же режиме ничего не пересобираем');
  // включили обратно
  renderer.setShadows('high');
  assert.equal(gpu.shadowMap.enabled, true);
  assert.equal(gpu.shadowMap.needsUpdate, true, 'тени статики пересчитать');
  renderer.render(a.scene, a.camera);
  assert.ok(a.mat.version > v2);
  // то же значение — ничего не делаем
  const gen = renderer.shadowGen;
  renderer.setShadows('high');
  assert.equal(renderer.shadowGen, gen);
});

test('тени «низкие»: карта не больше 1024, «высокие» возвращают то, что хотела сцена (в том числе её собственные смены)', async (t) => {
  const { renderer, gpu } = await makeRenderer(t);
  const a = makeScene({ size: 2048 });
  const skill = makeScene({ size: 4096 });
  renderer.render(a.scene, a.camera);
  assert.equal(a.sun.shadow.mapSize.x, 2048, 'на «высоких» сцену не трогаем');
  renderer.setShadows('low');
  gpu.shadowMap.needsUpdate = false;
  renderer.render(a.scene, a.camera);
  assert.deepEqual([a.sun.shadow.mapSize.x, a.sun.shadow.mapSize.y], [1024, 1024]);
  assert.equal(a.disposed(), 1, 'старая карта отпущена, новая — по размеру');
  assert.equal(gpu.shadowMap.needsUpdate, true, 'и тени статики пересчитаются');
  renderer.render(a.scene, a.camera);
  assert.equal(a.disposed(), 1, 'каждый кадр заново не режем');
  renderer.render(skill.scene, skill.camera);
  assert.equal(skill.sun.shadow.mapSize.x, 1024, 'сцена из памяти, увидевшая «низкие» впервые, тоже урезана');
  // сцена сама поменяла размер (свой уровень детализации): это её новое «хочу»
  a.sun.shadow.mapSize.set(512, 512);
  renderer.render(a.scene, a.camera);
  assert.equal(a.sun.shadow.mapSize.x, 512, 'меньше предела — оставляем как просит сцена');
  a.sun.shadow.mapSize.set(2048, 2048);
  renderer.render(a.scene, a.camera);
  assert.equal(a.sun.shadow.mapSize.x, 1024);
  renderer.setShadows('high');
  renderer.render(a.scene, a.camera);
  renderer.render(skill.scene, skill.camera);
  assert.equal(a.sun.shadow.mapSize.x, 2048, 'вернули её последнее «хочу»');
  assert.equal(skill.sun.shadow.mapSize.x, 4096);
  // «выкл» размеров не трогает
  renderer.setShadows('off');
  renderer.render(a.scene, a.camera);
  assert.equal(a.sun.shadow.mapSize.x, 2048);
});

test('дальность: на время кадра туман и дальняя плоскость ближе, после кадра — как были; подвал не трогаем', async (t) => {
  const { renderer, seen } = await makeRenderer(t);
  const lobby = makeScene({ fog: [200, 1400] });
  renderer.render(lobby.scene, lobby.camera);
  assert.deepEqual(seen.at(-1), { fogNear: 200, fogFar: 1400, camFar: 1600, enabled: true }, 'по умолчанию — как у сцены');
  renderer.setViewDistance(0.5);
  renderer.render(lobby.scene, lobby.camera);
  const s = seen.at(-1)!;
  assert.deepEqual([s.fogNear, s.fogFar], [100, 700]);
  assert.ok(Math.abs(s.camFar - 735) < 1e-6, `дальняя плоскость чуть дальше тумана: ${s.camFar}`);
  const fog = lobby.scene.fog as THREE.Fog;
  assert.deepEqual([fog.near, fog.far, lobby.camera.far], [200, 1400, 1600], 'сцена получает свои значения обратно');
  // сцена меняет туман каждый кадр (погода) — берём её текущие значения
  fog.far = 900;
  renderer.render(lobby.scene, lobby.camera);
  assert.equal(seen.at(-1)!.fogFar, 450);
  assert.equal(fog.far, 900);
  // камера и так ближе тумана — не удлиняем
  const near = makeScene({ fog: [100, 1000] });
  near.camera.far = 300;
  renderer.render(near.scene, near.camera);
  assert.equal(seen.at(-1)!.camFar, 300);
  // подвал: туман в десятки метров — дальность там ни при чём
  const cellar = makeScene({ fog: [9, 26] });
  cellar.camera.far = 60;
  renderer.render(cellar.scene, cellar.camera);
  assert.deepEqual(seen.at(-1), { fogNear: 9, fogFar: 26, camFar: 60, enabled: true });
  // сцена без тумана
  const clear = makeScene();
  renderer.render(clear.scene, clear.camera);
  assert.equal(seen.at(-1)!.camFar, 1600);
  // упала ли отрисовка — всё равно возвращаем
  renderer.setViewDistance(0.3);
  const gl = renderer.gl as { render: (...a: unknown[]) => void };
  const was = gl.render;
  gl.render = () => { throw new Error('boom'); };
  assert.throws(() => renderer.render(lobby.scene, lobby.camera), /boom/);
  gl.render = was;
  assert.deepEqual([fog.near, fog.far, lobby.camera.far], [200, 900, 1600]);
  // мусор вместо множителя
  renderer.setViewDistance(Number.NaN);
  renderer.render(lobby.scene, lobby.camera);
  assert.equal(seen.at(-1)!.fogFar, 900);
  assert.deepEqual(renderer.gfxState(), { shadows: 'high', shadowsEnabled: true, viewK: 1 });
});
