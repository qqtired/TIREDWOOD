// Камера «Крепости» (client/fort/fortcam.ts): дальше пейнтбола, колесо в пределах и на всю сессию, стены и вид
// замка (надвратная башня, эркеры) камеру не пускают.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PIVOT_Y, RIG_PB, RIG_PB_ADS, type V3 } from '../shared/aim.ts';
import { GATE, WALL_H, WALL_T, buildFort } from '../shared/fortmap.ts';
import { CollisionWorld, makeRayHit } from '../shared/world.ts';
import { GATEHOUSE } from '../client/fort/castle/layout.ts';
import { FORT_CAM_DEFAULT, FORT_CAM_MAX, FORT_CAM_MIN, FortCam, castleBlockT } from '../client/fort/fortcam.ts';

const world = new CollisionWorld(buildFort());

function settle(cam: FortCam, x: number, y: number, z: number, yaw: number, pitch: number, out: V3, ads = 0): number {
  const rig = { ...RIG_PB };
  let d = 0;
  for (let i = 0; i < 120; i++) d = cam.place(x, y, z, yaw, pitch, rig, RIG_PB_ADS.back, ads, 1, world, 1 / 30, out);
  return d;
}

test('fort camera: default farther than paintball, wheel within limits, remembered for the session', () => {
  assert.ok(FORT_CAM_DEFAULT >= RIG_PB.back * 1.8, 'по умолчанию заметно дальше пейнтбола');
  assert.ok(FORT_CAM_MAX >= FORT_CAM_DEFAULT * 2, 'колесом — минимум вдвое дальше');
  assert.ok(FORT_CAM_MIN < FORT_CAM_DEFAULT);
  const a = new FortCam();
  assert.equal(a.distance, FORT_CAM_DEFAULT);
  a.zoomBy(100000);
  const out = { x: 0, y: 0, z: 0 };
  settle(a, 0, 0, -4, 0, 0, out);
  assert.ok(Math.abs(a.distance - FORT_CAM_MAX) < 1e-3, 'дальше предела не уходит');
  assert.equal(new FortCam().distance, FORT_CAM_MAX, 'новая игра — то же расстояние');
  a.zoomBy(-100000);
  settle(a, 0, 0, -4, 0, 0, out);
  assert.ok(Math.abs(a.distance - FORT_CAM_MIN) < 1e-3, 'ближе предела не подходит');
  // шаг колеса — плавно, не скачком к пределу
  const b = new FortCam();
  b.zoomBy(-100000);
  b.zoomBy(100); // один щелчок
  settle(b, 0, 0, -4, 0, 0, out);
  assert.ok(b.distance > FORT_CAM_MIN && b.distance < FORT_CAM_MIN * 1.3, `щелчок — немного: ${b.distance}`);
  // вернуть «по умолчанию» для следующих проверок (расстояние общее на модуль)
  b.zoomBy(-100000);
  b.zoomBy(Math.log(FORT_CAM_DEFAULT / FORT_CAM_MIN) / 0.0012);
  settle(b, 0, 0, -4, 0, 0, out);
});

test('fort camera: in the open yard it stands at the full distance behind the player', () => {
  const cam = new FortCam();
  const out = { x: 0, y: 0, z: 0 };
  const d = settle(cam, 0, 0, -4, 0, 0, out);
  assert.ok(Math.abs(cam.distance - FORT_CAM_DEFAULT) < 0.05, `колесо: ${cam.distance}`);
  assert.ok(d > FORT_CAM_DEFAULT - 0.1, `свободно — во всю длину: ${d}`);
  assert.ok(out.z > -4 + FORT_CAM_DEFAULT - 0.2, 'за спиной (взгляд к воротам, на −z)');
});

test('fort camera: never inside the gatehouse or behind a wall', () => {
  // луч вверх с хода стены под надвратной башней упирается в её балки
  const t = castleBlockT(0, WALL_H + PIVOT_Y, -14.5, 0, 1, 0, 20);
  assert.ok(Math.abs(t - (GATEHOUSE.beams - WALL_H - PIVOT_Y)) < 1e-6, `балки: ${t}`);
  assert.equal(castleBlockT(0, 1, 0, 0, 1, 0, 20), Infinity, 'посреди двора — ничего');
  // столб-консоль под башней сзади (внутренняя грань стены): камера за него не встаёт
  const inner = GATE.face + WALL_T;
  assert.ok(Math.abs(castleBlockT(2.82, WALL_H + PIVOT_Y, -14.42, 0, 0, 1, 20) - (inner + 14.42)) < 1e-6, 'столб');
  const hit = makeRayHit();
  const cam = new FortCam();
  cam.zoomBy(100000);
  const out = { x: 0, y: 0, z: 0 };
  // на стене под надвратной башней, взгляд вниз на подход орды, колесо до упора
  for (const [x, z, yaw, pitch] of [
    [0, -14.5, 0, -0.6],
    [0, -14.5, 0, -1.2],
    [1.5, -14.5, 0.4, -0.9],
    [0, -14.5, Math.PI, -0.5],
    [-8, -14.5, 0, -0.7],
    [2.82, -14.42, 0, -0.3],
    [-2.8, -14.42, 0.1, -0.2],
  ] as const) {
    cam.reset();
    const d = settle(cam, x, WALL_H, z, yaw, pitch, out);
    const oy = WALL_H + PIVOT_Y;
    const inGate = Math.abs(out.x) < GATEHOUSE.hx && out.y > GATEHOUSE.beams && out.z > GATEHOUSE.z0 && out.z < GATEHOUSE.z1;
    assert.ok(!inGate, `камера в надвратной башне: ${JSON.stringify(out)} (${x}, ${z}, ${yaw}, ${pitch})`);
    const dx = (out.x - x) / d;
    const dy = (out.y - oy) / d;
    const dz = (out.z - z) / d;
    assert.ok(castleBlockT(x, oy, z, dx, dy, dz, d) >= d - 1e-6, 'между головой и камерой нет башни');
    assert.equal(world.raycast(x, oy, z, dx, dy, dz, d, hit, true, true), false, 'между головой и камерой нет стены');
  }
  // у самой стены во дворе (не в проёме ворот): камера не за стеной, а перед ней
  cam.reset();
  const d = settle(cam, -8, 0, -11.5, Math.PI, -0.1, out);
  assert.ok(out.z > -13.5 && d < FORT_CAM_MAX, `перед стеной: ${out.z}, ${d}`);
});
