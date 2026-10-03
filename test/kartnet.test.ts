// Снимок гонки: своё состояние (с временем гонки rt) — точно, чужие карты — с шагом 1/128 м, ловушки и маска ящиков (23 бита); битый — null.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOOST_MT3, BOOST_TURBO, ITEM_PAINT, MT3_TICKS, kartsEqual, makeKartState } from '../shared/kart.ts';
import {
  KE_DRIFT,
  KE_GROUND,
  KE_ON,
  KM_BUBBLE,
  KM_BURN,
  KM_SPARK,
  KM_TRICK,
  MSG_KART_SNAPSHOT,
  kartMisc,
  miscBoost,
  decodeKartSnapshot,
  encodeKartSnapshot,
  encodeKarts,
  encodeTraps,
  kartYaw,
  makeKartHeader,
  type KartSnap,
  type TrapSnap,
} from '../shared/kartnet.ts';
import { SNAP_HAS_SELF, SNAP_SELF_RESET } from '../shared/protocol.ts';

const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

test('снимок гонки туда-обратно: своё — точно, чужие — до 1/256 м, курс — до 1e-4', () => {
  const self = makeKartState();
  Object.assign(self, {
    x: -12.345678901, y: 1.25, z: 40.0000001, vx: 21.9, vy: -3.3, vz: 0.1, hx: 0.6, hz: -0.8, steer: -0.4666, seg: 345,
    grounded: 0, drift: -1, driftT: 1234, hop: 7, boostT: 55, boostLvl: 2, slowT: 120, spinT: 40, ghostT: 90, cp: 7, lap: 3,
    done: 1, item: ITEM_PAINT, itemT: 48, prevButtons: 1023, rt: 54321, air: 37, trick: 2, gasT: 66, burnT: 12, surf: 2,
  });
  const karts: KartSnap[] = [
    { id: 0, flags: KE_ON | KE_DRIFT, x: -99.9921875, y: 1.5, z: 65.5, yaw: 3.1, steer: -1, lap: 2, place: 1, misc: 6 },
    { id: 5, flags: KE_GROUND, x: 77.123, y: -1.6, z: -63.9, yaw: -2.5, steer: 0.5, lap: 0, place: 6, misc: 0 },
  ];
  const traps: TrapSnap[] = [{ id: 9, x: 10.5, y: 0, z: -48.25 }];
  const h = { tick: 123456, ack: 99, flags: SNAP_SELF_RESET, queue: 3, phase: 1, phaseEnd: 130000, crates: 0x555555 };
  const buf = encodeKartSnapshot(h, self, encodeKarts(karts), encodeTraps(traps));
  assert.equal(buf[0], MSG_KART_SNAPSHOT);

  const h2 = makeKartHeader();
  const s2 = makeKartState();
  const k2: KartSnap[] = [];
  const t2: TrapSnap[] = [];
  assert.deepEqual(decodeKartSnapshot(buf.buffer, h2, s2, k2, t2), { karts: 2, traps: 1 });
  assert.deepEqual(h2, { ...h, flags: SNAP_SELF_RESET | SNAP_HAS_SELF });
  assert.ok(kartsEqual(self, s2));
  assert.equal(s2.rt, 54321, 'время гонки едет в снимке: от него зависят движущиеся помехи');
  karts.forEach((a, i) => {
    const b = k2[i];
    assert.deepEqual([b.id, b.flags, b.lap, b.place, b.misc], [a.id, a.flags, a.lap, a.place, a.misc]);
    for (const key of ['x', 'y', 'z'] as const) assert.ok(Math.abs(a[key] - b[key]) <= 1 / 256, `${key}: ${b[key]}`);
    assert.ok(angleDiff(a.yaw, b.yaw) < 1e-4, `yaw ${b.yaw}`);
    assert.ok(Math.abs(a.steer - b.steer) <= 1 / 127);
  });
  assert.deepEqual(t2, traps);
});

test('снимок без своего карта; короткий или чужой — null', () => {
  const h = { tick: 5, ack: 0, flags: 0, queue: 0, phase: 0, phaseEnd: 300, crates: 0x7fffff };
  const buf = encodeKartSnapshot(h, null, encodeKarts([]), encodeTraps([]));
  const h2 = makeKartHeader();
  const s2 = makeKartState();
  assert.deepEqual(decodeKartSnapshot(buf.buffer, h2, s2, [], []), { karts: 0, traps: 0 });
  assert.equal(h2.flags & SNAP_HAS_SELF, 0);
  assert.equal(h2.crates, 0x7fffff);

  const one: KartSnap = { id: 1, flags: KE_ON, x: 0, y: 0, z: 0, yaw: 0, steer: 0, lap: 1, place: 1, misc: 0 };
  const full = encodeKartSnapshot(h, makeKartState(), encodeKarts([one]), encodeTraps([{ id: 1, x: 1, y: 0, z: 1 }]));
  for (const cut of [10, 17, 50, full.length - 8, full.length - 1]) {
    assert.equal(decodeKartSnapshot(full.slice(0, cut).buffer, h2, s2, [], []), null, `обрезан до ${cut}`);
  }
  const wrong = full.slice();
  wrong[0] = 2;
  assert.equal(decodeKartSnapshot(wrong.buffer, h2, s2, [], []), null);
});

test('курс карта в yaw: yaw = 0 смотрит в −Z, π/2 — в −X', () => {
  assert.ok(Math.abs(kartYaw({ hx: 0, hz: -1 })) < 1e-12);
  assert.ok(Math.abs(kartYaw({ hx: -1, hz: 0 }) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(kartYaw({ hx: 1, hz: 0 }) + Math.PI / 2) < 1e-12);
});

test('биты misc: искры 0–3, уровень ускорения 0–4, пузырь, трюк и пробуксовка не мешают друг другу', () => {
  const k = makeKartState();
  k.drift = 1;
  k.driftT = MT3_TICKS;
  k.boostT = 30;
  k.boostLvl = BOOST_TURBO;
  k.grounded = 0;
  k.trick = 2;
  k.burnT = 5;
  const m = kartMisc(k) | KM_BUBBLE;
  assert.equal(m & KM_SPARK, 3);
  assert.equal(miscBoost(m), BOOST_TURBO);
  assert.ok(m & KM_BUBBLE && m & KM_TRICK && m & KM_BURN);
  assert.ok(m < 256, 'misc — один байт');
  k.boostLvl = BOOST_MT3;
  k.trick = 0;
  k.burnT = 0;
  k.drift = 0;
  const n = kartMisc(k);
  assert.deepEqual([n & KM_SPARK, miscBoost(n), n & (KM_BUBBLE | KM_TRICK | KM_BURN)], [0, BOOST_MT3, 0]);
  k.boostT = 0;
  assert.equal(miscBoost(kartMisc(k)), 0, 'ускорение кончилось — уровень 0');
});
