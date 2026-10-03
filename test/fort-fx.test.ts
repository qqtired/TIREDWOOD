import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import * as THREE from 'three';
import { CRATE_DOWN, CRATE_FALL, CRATE_FALL_S, CRATE_NONE, EventFx } from '../client/fort/eventfx.ts';
import { buildShore, SHORE_LANDINGS, SHORE_LANE_FREE, SHORE_LANE_Z, SHORE_PIER } from '../client/fort/shore.ts';
import { buildFort } from '../shared/fortmap.ts';
import { CollisionWorld } from '../shared/world.ts';

/** В node нет canvas: краски текстур берега рисуются в пустоту, вся геометрия — настоящая */
function fakeCanvas(t: TestContext): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (o, k) => (k in o ? o[k] : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => {
      o[k] = v;
      return true;
    },
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
}

function frames(fx: EventFx, seconds: number, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    each?.();
    fx.update(1 / 60);
  }
}

test('берег: на местах высадки выше колена ничего нет — абордажники с лодок проходят к стене', (t) => {
  fakeCanvas(t);
  const scene = new THREE.Scene();
  const shore = buildShore(scene);
  assert.equal(shore.parent, scene);
  shore.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const inst = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  let vertices = 0;
  shore.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    const im = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
    for (let k = 0; k < (im ? im.count : 1); k++) {
      world.copy(m.matrixWorld);
      if (im) {
        im.getMatrixAt(k, inst);
        world.multiply(inst);
      }
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(world);
        vertices++;
        if (v.y < 0.35 || v.z < SHORE_LANE_Z[0] || v.z > SHORE_LANE_Z[1]) continue;
        for (const l of SHORE_LANDINGS) {
          assert.ok(Math.abs(v.x - l) >= SHORE_LANE_FREE, `${m.name || 'деталь'}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) на проходе x = ${l}`);
        }
      }
    }
  });
  assert.ok(vertices > 1000);
  // причал — в стороне от обоих мест высадки и снаружи крепостной стены
  for (const l of SHORE_LANDINGS) assert.ok(Math.abs(SHORE_PIER.x - l) - SHORE_PIER.headW / 2 > SHORE_LANE_FREE + 3);
});

test('туман и золото: свет плавно меняется и возвращается как был, туман сцены не трогаем', () => {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd8e4ee, 110, 620);
  const sun = new THREE.DirectionalLight(0xfff4e2, 3.1);
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x7f9a5a, 1.55);
  scene.add(sun, hemi);
  const fx = new EventFx(scene, new THREE.PerspectiveCamera());
  const light = () => ({ sun: sun.color.getHex(), sunI: sun.intensity, sky: hemi.color.getHex(), ground: hemi.groundColor.getHex(), hemiI: hemi.intensity });
  const before = light();
  const fog = scene.fog as THREE.Fog;
  fx.fog(true);
  fx.goldRush(true);
  frames(fx, 0.5);
  const mid = fx.stats();
  assert.ok(mid.fog > 0 && mid.fog < 1 && mid.gold > 0 && mid.gold < 1, 'включается плавно');
  frames(fx, 4);
  assert.equal(fx.stats().fog, 1);
  assert.equal(fx.stats().gold, 1);
  assert.ok(sun.intensity < before.sunI, 'в тумане солнце слабее');
  assert.notEqual(sun.color.getHex(), before.sun, 'в лихорадку солнце теплее');
  // дальность тумана — видимость, её меняет match.ts посреди события; мы её не пишем
  fog.near = 12;
  fog.far = 50;
  frames(fx, 0.2);
  assert.deepEqual([fog.near, fog.far, fog.color.getHex()], [12, 50, 0xd8e4ee]);
  fx.fog(false);
  fx.goldRush(false);
  frames(fx, 5);
  assert.deepEqual(light(), before);
  assert.deepEqual([fx.stats().fog, fx.stats().gold], [0, 0]);
  // всё выключено — свет больше не трогаем
  sun.intensity = 2;
  frames(fx, 0.2);
  assert.equal(sun.intensity, 2);
  // clear() посреди события возвращает свет сразу
  fx.goldRush(true);
  frames(fx, 1);
  fx.clear();
  assert.equal(sun.color.getHex(), before.sun);
  assert.equal(sun.intensity, 2);
});

test('ящик: «летит» → «лежит» → нет; подбор в любом порядке с последним снимком; зашёл посреди волны — лежит сразу', () => {
  const collision = new CollisionWorld(buildFort());
  const fx = new EventFx(new THREE.Scene(), new THREE.PerspectiveCamera(), collision);
  const peek = fx as unknown as { canDrape: boolean; canX: number; canZ: number; crateRoot: THREE.Group };
  /** Купол лёг на ту же опору, что и ящик, или накрыл сам ящик — в воздухе не висит */
  const canopyRests = () => {
    if (peek.canDrape) return true;
    const a = peek.crateRoot.rotation.y;
    const cx = x + peek.canX * Math.cos(a) + peek.canZ * Math.sin(a);
    const cz = z - peek.canX * Math.sin(a) + peek.canZ * Math.cos(a);
    const g = collision.groundBelow(cx, y + 0.5, cz);
    return Math.abs((Number.isFinite(g) ? Math.max(0, g) : 0) - y) < 0.3;
  };
  let state = CRATE_FALL;
  let [x, z, y] = [-4, -5, 0];
  const snap = () => fx.crate(state, x, z, y);
  frames(fx, 1, snap);
  assert.equal(fx.stats().crate, CRATE_FALL);
  // сервер ещё говорит «летит», а по своим часам ящик уже сел: не начинает падать заново
  frames(fx, CRATE_FALL_S + 0.5, snap);
  assert.equal(fx.stats().crate, CRATE_DOWN);
  assert.ok(canopyRests());
  state = CRATE_DOWN;
  frames(fx, 0.5, snap);
  assert.equal(fx.stats().crate, CRATE_DOWN);
  // событие подбора раньше снимка: запоздавший «лежит» ящик не возвращает
  fx.cratePicked(x, y, z);
  frames(fx, 0.3, snap);
  state = CRATE_NONE;
  frames(fx, 1.2, snap);
  assert.equal(fx.stats().crate, CRATE_NONE);
  // снимок «нет» раньше события — тоже уходит и гаснет
  [x, z] = [6, 3];
  state = CRATE_FALL;
  frames(fx, 0.2, snap);
  state = CRATE_DOWN;
  frames(fx, 0.2, snap);
  state = CRATE_NONE;
  snap();
  fx.cratePicked(x, y, z);
  frames(fx, 1.2, snap);
  assert.equal(fx.stats().crate, CRATE_NONE);
  // зашёл посреди волны: первый вызов сразу «лежит»; на ходу стены купол не свисает над двором (поворот случайный —
  // несколько раз)
  y = collision.groundBelow(-6, 30, -14.6);
  assert.ok(y > 3);
  for (let i = 0; i < 8; i++) {
    [x, z] = [-6 + i * 1.5, -14.6];
    state = CRATE_DOWN;
    frames(fx, 0.1, snap);
    assert.equal(fx.stats().crate, CRATE_DOWN);
    assert.ok(canopyRests(), `купол ящика на стене в x = ${x}`);
    state = CRATE_NONE;
    frames(fx, 1.2, snap);
  }
});

test('метеор: летит, удар гасит ком и оставляет кляксу; монеты; clear и dispose убирают всё', () => {
  const scene = new THREE.Scene();
  const start = scene.children.length;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1.5, 6.4, -12.6);
  const fx = new EventFx(scene, camera, new CollisionWorld(buildFort()));
  fx.meteor(13, 40, -97, -3, 0, -27, 1.4);
  frames(fx, 1);
  assert.equal(fx.stats().meteors, 1);
  const trail = fx.stats().particles;
  assert.ok(trail > 20, 'за комом тянется шлейф');
  fx.meteorHit(-3, 0, -27, 3);
  frames(fx, 0.1);
  assert.equal(fx.stats().meteors, 0, 'удар гасит ком, даже если тот не долетел');
  assert.ok(fx.stats().particles > trail);
  // не дождался удара — гаснет сам вскоре после прилёта
  fx.meteor(13, 40, -60, 5, 0, -10, 0.5);
  frames(fx, 1);
  assert.equal(fx.stats().meteors, 0);
  fx.coins(0, 0, -20, true);
  frames(fx, 0.2);
  assert.ok(fx.stats().coins > 10);
  fx.setQuality('low');
  fx.coins(0, 0, -20);
  frames(fx, 0.1);
  fx.clear();
  frames(fx, 0.05);
  assert.deepEqual([fx.stats().particles, fx.stats().coins, fx.stats().meteors], [0, 0, 0]);
  fx.dispose();
  assert.equal(scene.children.length, start);
});
