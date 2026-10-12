// Actual island geometry must stop the ordinary follow camera, including a ridge between clear endpoints.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { cameraRig, CAM_MIN, PIVOT_Y, RIG_LOBBY } from '../shared/aim.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { buildPier } from '../shared/maps/pier.ts';
import { ISLE_CENTER, ISLE_Y } from '../shared/maps/isle.ts';
import { ISLE_SURFACE_POINTS, ISLE_SURFACE_INDICES } from '../shared/maps/isleterrain-data.ts';
import type { GameMap } from '../shared/maps/types.ts';
import { CollisionWorld, makeRayHit } from '../shared/world.ts';

const decode = (s: string): ArrayBuffer => {
  const b = Buffer.from(s, 'base64'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const surfacePoints = new Float32Array(decode(ISLE_SURFACE_POINTS)), surfaceIndices = new Uint32Array(decode(ISLE_SURFACE_INDICES));
const triangle = new THREE.Triangle(), closest = new THREE.Vector3();

/** Offline acceptance only: exact distance to every real upward triangle, including neighbouring faces. */
function sphereClearance(point: THREE.Vector3): number {
  let best = Infinity;
  for (let i = 0; i < surfaceIndices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const j = surfaceIndices[i + k] * 3;
      (k === 0 ? triangle.a : k === 1 ? triangle.b : triangle.c).set(ISLE_CENTER.x + surfacePoints[j], ISLE_Y + surfacePoints[j + 1], ISLE_CENTER.z + surfacePoints[j + 2]);
    }
    triangle.closestPointToPoint(point, closest); best = Math.min(best, closest.distanceToSquared(point));
  }
  return Math.sqrt(best);
}

function assertNearPlane(w: CollisionWorld, point: THREE.Vector3, yaw: number, pitch: number): void {
  // Actual lobby near=.15, actual root PNG FOV / aspect (1440×900). No game camera settings changed.
  const near = 0.15, h = near * Math.tan(THREE.MathUtils.degToRad(63.08828455525376) / 2), width = h * 1.6;
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  assert.ok(Math.hypot(near, h, width) < 0.25, 'near plane fits inside the reserved camera sphere');
  for (const x of [-width, width]) for (const y of [-h, h]) {
    const corner = new THREE.Vector3(x, y, -near).applyQuaternion(quat).add(point);
    assert.ok(corner.y > w.terrainHeight(corner.x, corner.z) + 0.01, 'actual near-plane corner enters visible terrain');
    assert.ok(sphereClearance(corner) > 0.01, 'near corner intersects a neighbouring triangle');
  }
}

test('terrain-padding защищает объём камеры / всю near-plane у реальных холмов', () => {
  const w = new CollisionWorld(buildLobby());
  for (const [u, v, yaw, pitch] of [[20, -50, Math.PI, 0], [24, -54, Math.PI, 0.1], [40, -44, Math.PI, 0], [19.95863941050891, -49.95870109084743, Math.PI, 0]]) {
    const x = ISLE_CENTER.x + u, z = ISLE_CENTER.z + v, y = w.terrainHeight(x, z), out = { x: 0, y: 0, z: 0 };
    cameraRig(x, y, z, yaw, pitch, RIG_LOBBY, 0, w, out, 6);
    const camera = new THREE.Vector3(out.x, out.y, out.z);
    assert.ok(sphereClearance(camera) >= 0.25 - 1e-6, `(${u},${v}): sphere clearance ${sphereClearance(camera)}`);
    assertNearPlane(w, camera, yaw, pitch);
  }
});

test('объём камеры не пересекает промежуточный гребень при свободных концах луча', () => {
  const w = new CollisionWorld(buildLobby()), x = ISLE_CENTER.x + 52, z = ISLE_CENTER.z - 60, y = ISLE_Y + 16, out = { x: 0, y: 0, z: 0 };
  const d = cameraRig(x, y - PIVOT_Y, z, -Math.PI / 2, 0, { back: 12, up: 0, side: 0 }, 0, w, out);
  assert.ok(d > CAM_MIN && d < 12);
  const camera = new THREE.Vector3(out.x, out.y, out.z); assert.ok(sphereClearance(camera) >= 0.25 - 1e-6);
  assertNearPlane(w, camera, -Math.PI / 2, 0);
});

test('касательная нормаль даёт конечный отступ и прежний CAM_MIN', () => {
  for (const incidence of [0, 1e-12, 1e-6]) {
    const map: GameMap = { name: 'grazing', boxes: [], spawns: [], trampolines: [], pickups: [], deco: [], bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      terrain: { height: () => -Infinity, raycast: (_x, _y, _z, _dx, _dy, _dz, _max, h) => { h.t = 2; h.nx = Math.sqrt(1 - incidence * incidence); h.ny = 0; h.nz = incidence; return true; } },
    };
    const out = { x: 0, y: 0, z: 0 }, d = cameraRig(0, 0, 0, 0, 0, RIG_LOBBY, 0, new CollisionWorld(map), out, 6);
    assert.equal(d, CAM_MIN); assert.ok(Object.values(out).every(Number.isFinite));
  }
});

test('штатная камера за спиной остаётся над настоящим холмом на маршруте острова', () => {
  const w = new CollisionWorld(buildLobby());
  for (const [u, v, yaw, pitch] of [[20, -50, Math.PI, 0], [24, -54, Math.PI, 0.1], [40, -44, Math.PI, 0]]) {
    const x = ISLE_CENTER.x + u, z = ISLE_CENTER.z + v, y = w.terrainHeight(x, z), out = { x: 0, y: 0, z: 0 };
    const d = cameraRig(x, y, z, yaw, pitch, RIG_LOBBY, 0, w, out, 6);
    assert.ok(d < 6.01, 'ray retracts the camera');
    assert.ok(out.y >= w.terrainHeight(out.x, out.z) - 1e-6, `камера у (${u},${v}) внутри земли`);
  }
});

test('луч камеры видит промежуточный гребень, хотя оба конца находятся над землёй', () => {
  const w = new CollisionWorld(buildLobby()), x = ISLE_CENTER.x + 52, z = ISLE_CENTER.z - 60, y = ISLE_Y + 16;
  assert.ok(w.terrainHeight(x, z) < y && w.terrainHeight(x - 12, z) < y, 'оба конца свободны');
  const h = makeRayHit();
  assert.equal(w.raycast(x, y, z, -1, 0, 0, 12, h, true, true, true), true);
  assert.equal(h.box, -2); assert.ok(h.t > 0 && h.t < 12 && h.ny > 0);
});

test('точный вертикальный луч на границе клеток, нулевой луч и выключенный остров', () => {
  const map = buildLobby(), w = new CollisionWorld(map), x = ISLE_CENTER.x + 20, z = ISLE_CENTER.z - 50;
  const y = ISLE_Y + 50, h = makeRayHit(), expected = (y - w.terrainHeight(x, z)) / 2;
  assert.equal(w.raycast(x, y, z, 0, -2, 0, 30, h, true, true, true), true);
  assert.ok(Math.abs(h.t - expected) < 1e-6); assert.equal(h.box, -2);
  assert.equal(w.raycast(x, y, z, 0, 0, 0, 30, makeRayHit(), true, true, true), false);
  for (const i of map.isleBoxes) w.setEnabled(i, false);
  assert.equal(w.raycast(x, y, z, 0, -2, 0, 30, makeRayHit(), true, true, true), false);
});

test('карты без terrain и обычные shot-ray сохраняют прежние hit-поля', () => {
  const w = new CollisionWorld(buildPier());
  for (const [x, y, z, dx, dy, dz, maxT] of [[0, 50, 0, 0, -1, 0, 60], [-40, 2, 0, 1, 0, 0, 100], [0, 2, 0, 0, 0, 1, 50], [80, 100, 80, 1, 0, 0, 3]]) {
    const a = makeRayHit(), b = makeRayHit();
    const was = w.raycast(x, y, z, dx, dy, dz, maxT, a, true, true);
    const now = w.raycast(x, y, z, dx, dy, dz, maxT, b, true, true, true);
    assert.equal(now, was); assert.deepEqual(b, a);
  }
  const isle = new CollisionWorld(buildLobby()), hit = makeRayHit();
  assert.equal(isle.raycast(ISLE_CENTER.x + 52, ISLE_Y + 16, ISLE_CENTER.z - 60, -1, 0, 0, 12, hit, true, true), false, 'terrain does not change existing callers without opt-in');
});
