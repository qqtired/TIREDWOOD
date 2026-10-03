// Прицел от третьего лица: камера не лезет в стены, точка прицела там, куда смотрит центр экрана,
// выстрел летит из глаз в эту точку. Сервер и клиент считают одно и то же.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIM_FALLBACK, CAM_MIN, PIVOT_Y, RIG_PB, aimPoint, cameraRig, tpsShotDir, type V3 } from '../shared/aim.ts';
import { EYE_HEIGHT, HITBOX_CY, HITBOX_RX, HITBOX_RY } from '../shared/constants.ts';
import { buildPier } from '../shared/maps/pier.ts';
import { viewDir } from '../shared/math.ts';
import { makeState } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

const world = new CollisionWorld(buildPier());
const v3 = (): V3 => ({ x: 0, y: 0, z: 0 });
const NONE = new Float64Array(0);
const FULL = Math.hypot(RIG_PB.back, RIG_PB.side, RIG_PB.up);

test('на открытом месте камера стоит на полном расстоянии', () => {
  const cam = v3();
  const d = cameraRig(-10, 0, -6, 0, 0, RIG_PB, 1, world, cam);
  assert.ok(Math.abs(d - FULL) < 1e-9);
  assert.ok(Math.abs(cam.x - (-10 + RIG_PB.side)) < 1e-9, 'правое плечо — камера правее');
  assert.ok(Math.abs(cam.y - (PIVOT_Y + RIG_PB.up)) < 1e-9);
  assert.ok(Math.abs(cam.z - (-6 + RIG_PB.back)) < 1e-9, 'сзади');
  cameraRig(-10, 0, -6, 0, 0, RIG_PB, -1, world, cam);
  assert.ok(Math.abs(cam.x - (-10 - RIG_PB.side)) < 1e-9, 'левое плечо');
});

test('спиной к стене склада: камера подъезжает ближе и не заходит в стену', () => {
  const cam = v3();
  const d = cameraRig(-8, 0, -37, Math.PI, 0, RIG_PB, 1, world, cam);
  assert.ok(d >= CAM_MIN && d < FULL - 0.5, `расстояние ${d}`);
  const e = 0.05;
  assert.ok(!world.overlaps(cam.x - e, cam.y - e, cam.z - e, cam.x + e, cam.y + e, cam.z + e), 'камера вне боксов');
});

test('цель на линии взгляда: точка прицела на поверхности её хитбокса', () => {
  const cam = v3();
  cameraRig(-10, 0, -6, 0, 0, RIG_PB, 1, world, cam);
  const f = v3();
  viewDir(0, 0, f);
  // центр хитбокса ровно на луче камеры, в 10 м
  const cx = cam.x + f.x * 10;
  const cy = cam.y + f.y * 10;
  const cz = cam.z + f.z * 10;
  const targets = new Float64Array([cx, cy - HITBOX_CY, cz]);
  const P = v3();
  aimPoint(cam, -10, PIVOT_Y, -6, 0, 0, world, targets, 1, P);
  const k = ((P.x - cx) / HITBOX_RX) ** 2 + ((P.y - cy) / HITBOX_RY) ** 2 + ((P.z - cz) / HITBOX_RX) ** 2;
  assert.ok(Math.abs(k - 1) < 1e-6, `на поверхности: ${k}`);
  assert.ok(P.z > cz, 'передняя сторона');
});

test('без целей: точка прицела на стене контейнера', () => {
  const cam = v3();
  const yaw = Math.PI / 2; // смотрим на запад
  cameraRig(-10, 0, -6, yaw, 0, RIG_PB, 1, world, cam);
  const P = v3();
  aimPoint(cam, -10, PIVOT_Y, -6, yaw, 0, world, NONE, 0, P);
  assert.ok(Math.abs(P.x - -14.38) < 1e-9, `x = ${P.x}`);
  assert.ok(Math.abs(P.y - cam.y) < 1e-9);
});

test('выстрел без разброса летит из глаз точно в точку прицела', () => {
  const s = makeState();
  s.x = -10;
  s.z = -6;
  const yaw = Math.PI / 2;
  const out = { dirX: 0, dirY: 0, dirZ: 0 };
  tpsShotDir(s, yaw, 0, 0, 1, 1, 1, false, world, NONE, 0, out);
  const cam = v3();
  cameraRig(s.x, s.y, s.z, yaw, 0, RIG_PB, 1, world, cam);
  const P = v3();
  aimPoint(cam, s.x, s.y + PIVOT_Y, s.z, yaw, 0, world, NONE, 0, P);
  const vx = P.x - s.x;
  const vy = P.y - (s.y + EYE_HEIGHT);
  const vz = P.z - s.z;
  const l = Math.hypot(vx, vy, vz);
  assert.ok(Math.abs(out.dirX - vx / l) < 1e-12 && Math.abs(out.dirY - vy / l) < 1e-12 && Math.abs(out.dirZ - vz / l) < 1e-12);
});

test('стена вплотную к лицу: запасной путь — стреляем прямо по взгляду', () => {
  const s = makeState();
  s.x = -14.38 + 0.45;
  s.z = -5.2;
  const yaw = Math.PI / 2;
  const out = { dirX: 0, dirY: 0, dirZ: 0 };
  const f = v3();
  viewDir(yaw, 0.1, f);
  tpsShotDir(s, yaw, 0.1, 0, 1, 1, 1, false, world, NONE, 0, out);
  assert.ok(AIM_FALLBACK > 0.45);
  assert.ok(Math.abs(out.dirX - f.x) < 1e-12 && Math.abs(out.dirY - f.y) < 1e-12 && Math.abs(out.dirZ - f.z) < 1e-12);
});

test('детерминированно: одинаковые данные — одинаковый результат бит в бит', () => {
  const s = makeState();
  s.x = -10;
  s.z = -6;
  s.y = 0.3;
  const targets = new Float64Array([-10.4, 0, -15, -9, 0.5, -20]);
  const a = { dirX: 0, dirY: 0, dirZ: 0 };
  const b = { dirX: 0, dirY: 0, dirZ: 0 };
  tpsShotDir(s, 0.05, -0.02, 0.013, 77, 5, -1, true, world, targets, 2, a);
  tpsShotDir(s, 0.05, -0.02, 0.013, 77, 5, -1, true, world, targets, 2, b);
  assert.deepEqual(a, b);
});
