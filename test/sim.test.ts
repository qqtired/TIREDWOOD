// Физика и протокол: одинаковый ввод даёт одинаковое состояние бит в бит, а ввод и снимки
// проходят через сеть без потерь. На этом держится предсказание своего движения без поправок.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Predictor } from '../client/predict.ts';
import { buildPier } from '../shared/maps/pier.ts';
import { clamp, makeRng, sinCos, wrapAngle } from '../shared/math.ts';
import {
  E_ALIVE, E_TEAM, PITCH_LIMIT, SNAP_HAS_SELF, decodeInputs, decodeSnapshot, encodeEntities, encodeInputs, encodeSnapshot, inputEpoch,
  makeHeader, type EntitySnap,
} from '../shared/protocol.ts';
import {
  BTN_ADS, BTN_BACK, BTN_DASH, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, applySpread, copyState, makeEvents,
  makeState, shotDirection, statesEqual, stepPlayer, type Input, type PlayerState,
} from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

const map = buildPier();
const world = new CollisionWorld(map);
const SEED = 0x5eed1234;
const MOVES = [BTN_FORWARD, BTN_FORWARD | BTN_LEFT, BTN_FORWARD | BTN_RIGHT, BTN_BACK, BTN_LEFT, BTN_RIGHT, 0];

/** «Живой» ввод: бег в разные стороны, повороты, прыжки, рывки, очереди, прицел, перезарядка. */
function script(seed: number, ticks: number): Input[] {
  const rng = makeRng(seed);
  const out: Input[] = [];
  let yaw = rng() * Math.PI * 2;
  let pitch = 0;
  let move = 0;
  let turn = 0;
  let hold = 0;
  for (let i = 0; i < ticks; i++) {
    if (hold-- <= 0) {
      hold = 10 + Math.floor(rng() * 50);
      move = MOVES[Math.floor(rng() * MOVES.length)];
      turn = (rng() - 0.5) * 0.08;
    }
    yaw = wrapAngle(yaw + turn);
    pitch = clamp(pitch + (rng() - 0.5) * 0.03, -1.2, 1.2);
    let buttons = move;
    if (rng() < 0.03) buttons |= BTN_JUMP;
    if (rng() < 0.01) buttons |= BTN_DASH;
    if (rng() < 0.3) buttons |= BTN_FIRE;
    if (rng() < 0.2) buttons |= BTN_ADS;
    if (rng() < 0.005) buttons |= BTN_RELOAD;
    out.push({ seq: i + 1, buttons, yaw: Math.fround(yaw), pitch: Math.fround(pitch), viewTick: 0 });
  }
  return out;
}

function spawnState(i: number): PlayerState {
  const sp = map.spawns[i % map.spawns.length];
  const s = makeState();
  s.x = sp.x;
  s.y = sp.y;
  s.z = sp.z;
  return s;
}

test('физика детерминирована: одинаковый ввод — одинаковое состояние на каждом тике', () => {
  const ev = makeEvents();
  for (let k = 0; k < 6; k++) {
    const inputs = script(1 + k, 1200);
    const a = spawnState(k);
    const b = spawnState(k);
    let travelled = 0;
    for (const inp of inputs) {
      const x0 = a.x;
      const z0 = a.z;
      stepPlayer(a, inp, world, true, SEED, ev);
      stepPlayer(b, inp, world, true, SEED, ev);
      assert.ok(statesEqual(a, b), `разошлись на тике ${inp.seq}`);
      travelled += Math.hypot(a.x - x0, a.z - z0);
    }
    // сценарий действительно двигает игрока и стреляет, а не стоит на месте
    assert.ok(travelled > 30, `пробежал всего ${travelled.toFixed(1)} м`);
    assert.ok(a.shots > 50, `выстрелов всего ${a.shots}`);
  }
});

test('предсказание как в игре: сервер отстаёт на 7 тиков, снимки идут через протокол — ни одной поправки', () => {
  const LAG = 7;
  const ev = makeEvents();
  const h = makeHeader();
  const got = makeHeader();
  const decoded = makeState();
  const ents: EntitySnap[] = [];
  const noEntities = encodeEntities([]);
  for (let k = 0; k < 6; k++) {
    const inputs = script(100 + k, 1500);
    const server = spawnState(k);
    const pred = new Predictor(world);
    pred.seed = SEED;
    pred.reset(server, 0);
    for (let t = 0; t < inputs.length + LAG; t++) {
      if (t < inputs.length) pred.step(inputs[t], true);
      const si = t - LAG;
      if (si < 0 || si >= inputs.length) continue;
      stepPlayer(server, inputs[si], world, true, SEED, ev);
      h.tick = 1000 + si;
      h.ack = inputs[si].seq;
      const buf = encodeSnapshot(h, server, noEntities);
      assert.equal(decodeSnapshot(buf.buffer as ArrayBuffer, got, decoded, ents), 0);
      assert.ok(got.flags & SNAP_HAS_SELF);
      pred.reconcile(got.ack, decoded);
    }
    assert.equal(pred.corrections, 0, `сценарий ${k}: поправок ${pred.corrections}`);
    assert.ok(statesEqual(pred.state, server));
  }
});

test('если сервер сделал то, чего клиент не знал, — одна поправка, и клиент снова совпадает с сервером', () => {
  const LAG = 7;
  const ev = makeEvents();
  const inputs = script(777, 900);
  const server = spawnState(2);
  const pred = new Predictor(world);
  pred.seed = SEED;
  pred.reset(server, 0);
  const serverCopy = makeState();
  for (let t = 0; t < inputs.length + LAG; t++) {
    if (t < inputs.length) pred.step(inputs[t], true);
    const si = t - LAG;
    if (si < 0 || si >= inputs.length) continue;
    stepPlayer(server, inputs[si], world, true, SEED, ev);
    // на 300-м тике сервер сдвигает игрока (как будто ввод опоздал и его подвинули по старому)
    if (si === 300) server.x += 0.25;
    pred.reconcile(inputs[si].seq, copyState(serverCopy, server));
  }
  assert.equal(pred.corrections, 1);
  assert.ok(statesEqual(pred.state, server));
});

test('ввод: пакет разбирается ровно в то, что отправили; битые пакеты отбрасываются', () => {
  const src: Input[] = [
    { seq: 1, buttons: BTN_FORWARD | BTN_FIRE, yaw: Math.fround(1.2345), pitch: Math.fround(-0.5), viewTick: 1234.5 },
    { seq: 4_000_000_000, buttons: 0x3ff, yaw: Math.fround(-3.1), pitch: Math.fround(1.5), viewTick: 99_999.99 },
  ];
  const buf = encodeInputs(src, 0, 2, 7);
  assert.equal(buf.length, 3 + 2 * 19);
  assert.equal(inputEpoch(buf), 7, 'номер комнаты (epoch) в заголовке');
  assert.equal(inputEpoch(buf.subarray(0, 1)), -1);
  const out: Input[] = [];
  assert.equal(decodeInputs(buf, out), 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(out[i].seq, src[i].seq);
    assert.equal(out[i].buttons, src[i].buttons);
    assert.equal(out[i].yaw, src[i].yaw);
    assert.equal(out[i].pitch, src[i].pitch);
    assert.ok(Math.abs(out[i].viewTick - src[i].viewTick) < 1 / 256 + 1e-9);
  }

  assert.equal(decodeInputs(buf.subarray(0, buf.length - 1), out), -1, 'обрезанный пакет');
  const nan = buf.slice();
  new DataView(nan.buffer).setFloat32(3 + 6, Number.NaN, true);
  assert.equal(decodeInputs(nan, out), -1, 'NaN вместо угла');
  const steep = encodeInputs([{ seq: 9, buttons: 0, yaw: 0, pitch: 3, viewTick: 0 }], 0, 1, 0);
  assert.equal(decodeInputs(steep, out), 1);
  assert.equal(out[0].pitch, PITCH_LIMIT, 'взгляд вертикальнее предела обрезается');
});

test('снимок: своё состояние доходит точно, чужие игроки — с точностью до сантиметра', () => {
  const self = makeState();
  const inputs = script(55, 200);
  const ev = makeEvents();
  copyState(self, spawnState(3));
  for (const inp of inputs) stepPlayer(self, inp, world, true, SEED, ev);

  const list: EntitySnap[] = [
    { id: 5, flags: E_ALIVE | E_TEAM, x: 12.3456, y: 5.2, z: -37.9, yaw: 4.0, pitch: -0.7, hp: 129.4, armor: 80 },
    { id: 250, flags: 0, x: -21.99, y: -1.3, z: 37.99, yaw: -2.5, pitch: 1.5, hp: 0, armor: 0 },
  ];
  const h = makeHeader();
  Object.assign(h, { tick: 123_456, ack: 777, flags: 0, queue: 3, phase: 1, phaseEnd: 140_000, scoreA: 49, scoreB: 7, pickups: 5 });
  const buf = encodeSnapshot(h, self, encodeEntities(list));

  const got = makeHeader();
  const decoded = makeState();
  const ents: EntitySnap[] = [];
  assert.equal(decodeSnapshot(buf.buffer as ArrayBuffer, got, decoded, ents), 2);
  // tail — где кончился список: весь снимок, хвоста нет
  assert.equal(got.tail, buf.byteLength);
  assert.deepEqual({ ...got, flags: got.flags & ~SNAP_HAS_SELF, tail: 0 }, h);
  assert.ok(statesEqual(decoded, self), 'своё состояние должно совпасть бит в бит');
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const b = ents[i];
    assert.equal(b.id, a.id);
    assert.equal(b.flags, a.flags);
    for (const key of ['x', 'y', 'z'] as const) assert.ok(Math.abs(b[key] - a[key]) <= 0.5 / 256 + 1e-9, `${key}: ${a[key]} → ${b[key]}`);
    const dyaw = Math.abs(wrapAngle(b.yaw - a.yaw));
    assert.ok(dyaw < 1e-4, `yaw: ${a.yaw} → ${b.yaw}`);
    assert.ok(Math.abs(b.pitch - a.pitch) < 1e-4, `pitch: ${a.pitch} → ${b.pitch}`);
    assert.equal(b.hp, Math.ceil(a.hp));
    assert.equal(b.armor, Math.ceil(a.armor));
  }
});

test('разброс вокруг произвольного направления: 0 — ровно по лучу, иначе в пределах конуса, детерминированно', () => {
  const out = { dirX: 0, dirY: 0, dirZ: 0 };
  const f = [0.3, -0.2, -0.9];
  const l = Math.hypot(f[0], f[1], f[2]);
  applySpread(f[0], f[1], f[2], 0, SEED, 5, out);
  assert.ok(Math.abs(out.dirX - f[0] / l) < 1e-12 && Math.abs(out.dirY - f[1] / l) < 1e-12 && Math.abs(out.dirZ - f[2] / l) < 1e-12);
  for (let shot = 1; shot < 200; shot++) {
    applySpread(f[0], f[1], f[2], 0.02, SEED, shot, out);
    const cos = (out.dirX * f[0] + out.dirY * f[1] + out.dirZ * f[2]) / l;
    assert.ok(Math.acos(Math.min(1, cos)) <= 0.02 + 1e-9, 'угол не больше разброса');
    assert.ok(Math.abs(Math.hypot(out.dirX, out.dirY, out.dirZ) - 1) < 1e-12);
  }
  const a = { dirX: 0, dirY: 0, dirZ: 0 };
  const b = { dirX: 0, dirY: 0, dirZ: 0 };
  applySpread(0, 1, 0, 0.03, SEED, 9, a); // взгляд строго вверх — тоже без NaN
  applySpread(0, 1, 0, 0.03, SEED, 9, b);
  assert.ok(Number.isFinite(a.dirX) && a.dirX === b.dirX && a.dirY === b.dirY && a.dirZ === b.dirZ);
});

test('при стрельбе в событиях есть угол прицела и разброс; направление совпадает с прежней формулой', () => {
  const s = spawnState(0);
  const ev = makeEvents();
  const inp: Input = { seq: 1, buttons: BTN_FIRE, yaw: Math.fround(0.4), pitch: Math.fround(0.1), viewTick: 0 };
  stepPlayer(s, inp, world, true, SEED, ev);
  assert.ok(ev.fired);
  assert.equal(ev.aimYaw, inp.yaw);
  assert.equal(ev.aimPitch, inp.pitch);
  assert.ok(ev.spread > 0);
  const out = { dirX: 0, dirY: 0, dirZ: 0 };
  shotDirection(ev.aimYaw, ev.aimPitch, ev.spread, SEED, s.shots, out);
  assert.equal(out.dirX, ev.dirX);
  assert.equal(out.dirY, ev.dirY);
  assert.equal(out.dirZ, ev.dirZ);
});

test('sinCos: те же синус и косинус, что Math, но только на +, −, × — бит в бит одинаково в браузере и Node', () => {
  // Math.sin/cos в Chrome, Safari и Node расходятся в последнем знаке — предсказание поправлялось бы на каждом снимке
  const sc = { s: 0, c: 0 };
  sinCos(0, sc);
  assert.equal(sc.s, 0);
  assert.equal(sc.c, 1);
  const rng = makeRng(7);
  let worst = 0;
  for (let i = 0; i < 50000; i++) {
    const a = (rng() - 0.5) * 200; // ±100 рад: поворот мышью копится
    sinCos(a, sc);
    worst = Math.max(worst, Math.abs(sc.s - Math.sin(a)), Math.abs(sc.c - Math.cos(a)));
  }
  assert.ok(worst < 5e-16, `ошибка ${worst}`);
  for (const a of [Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4]) {
    sinCos(a, sc);
    assert.ok(Math.abs(sc.s - Math.sin(a)) < 2e-16 && Math.abs(sc.c - Math.cos(a)) < 2e-16, `угол ${a}`);
  }
});
