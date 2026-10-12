import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { PASS_ROUTES } from '../client/lobby/boats.ts';
import { BOATS } from '../shared/fishboat.ts';
import { OB_SEA, makeObState, stepOwnBoat } from '../shared/ownboat.ts';
import { RG_BANKS } from '../shared/regattabankdata.ts';
import { regattaBankContact, resolveRegattaBanks } from '../shared/regattabanks.ts';
import { BTN_BACK, BTN_FORWARD, BTN_LEFT, BTN_RIGHT, makeInput } from '../shared/sim.ts';

function bankNear(x: number, z: number) {
  return RG_BANKS.reduce((a, b) => Math.hypot((b[0] + b[2]) / 2 - x, (b[1] + b[3]) / 2 - z) < Math.hypot((a[0] + a[2]) / 2 - x, (a[1] + a[3]) / 2 - z) ? b : a);
}

test('рыбацкие лодки всех размеров упираются в оба берега и отмель маячка, могут отойти задним ходом', () => {
  for (const [x, z] of [[177, 184], [146, 184], [64, 188]]) {
    const [ax, az, bx, bz, nx, nz] = bankNear(x, z), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    for (let kind = 0; kind < BOATS.length; kind++) {
      const s = makeObState(kind), b = BOATS[kind];
      Object.assign(s, { x: mx + nx * 10, z: mz + nz * 10, ph: OB_SEA, yaw: Math.atan2(nx, nz), v: b.speed });
      for (let t = 0; t < 180; t++) stepOwnBoat(s, { ...makeInput(), buttons: BTN_FORWARD });
      const stopped = (s.x - mx) * nx + (s.z - mz) * nz;
      assert.ok(stopped > b.length / 2 - .05, `${b.id}: нос не прошёл в скалу`);
      assert.ok(s.v < .2, 'двигатель не проталкивает сквозь берег');
      for (let t = 0; t < 180; t++) stepOwnBoat(s, { ...makeInput(), buttons: BTN_BACK });
      assert.ok((s.x - mx) * nx + (s.z - mz) * nz > stopped + 5, 'задний ход освобождает катер');
    }
  }
});

test('крутой поворот у берега не проводит корму сквозь стену; аномальный шаг откатывается в безопасную позу', () => {
  const [ax, az, bx, bz, nx, nz] = bankNear(177, 184), mx = (ax + bx) / 2, mz = (az + bz) / 2;
  for (const turn of [BTN_LEFT, BTN_RIGHT]) {
    const s = makeObState(2);
    Object.assign(s, { x: mx + nx * 4, z: mz + nz * 4, ph: OB_SEA, yaw: Math.atan2(nx, nz), v: 2 });
    for (let t = 0; t < 240; t++) {
      stepOwnBoat(s, { ...makeInput(), buttons: BTN_FORWARD | turn });
      assert.ok(Number.isFinite(s.x + s.z + s.yaw + s.v));
      const b = BOATS[2], r = b.beam / 2, half = b.length / 2 - r;
      for (const side of [-1, 1]) assert.equal(regattaBankContact(s.x - Math.sin(s.yaw) * half * side, s.z - Math.cos(s.yaw) * half * side, r - .01), null, 'оба конца корпуса остаются снаружи');
    }
  }
  const before = { x: mx + nx * 8, z: mz + nz * 8, yaw: Math.atan2(nx, nz) };
  const invalid = { x: mx - nx * 8, z: mz - nz * 8, yaw: before.yaw, v: 20.8 };
  assert.equal(resolveRegattaBanks(invalid, before, BOATS[2]), true);
  assert.deepEqual(invalid, { ...before, v: 0 }, 'сохраняется последняя безопасная поза без переноса в другой причал');
});

test('оба декоративных маршрута в обоих направлениях проходят вне реального нового берега', () => {
  for (const original of PASS_ROUTES) for (const reverse of [false, true]) {
    const points = original.map(([x, z]) => new THREE.Vector3(x, 0, z));
    if (reverse) points.reverse();
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    curve.arcLengthDivisions = 3000;
    const steps = Math.ceil(curve.getLength());
    for (let i = 0; i <= steps; i++) {
      const p = curve.getPointAt(i / steps);
      assert.equal(regattaBankContact(p.x, p.z, 3.5), null, `декоративная лодка задевает берег (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
  }
});
