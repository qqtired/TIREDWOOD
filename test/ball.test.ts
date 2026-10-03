// Мяч на площади: отскоки и покой, качение, стена, вода и возврат домой, батут, пинки, застрял на крыше,
// давно не пинали; на сервере — пинок с разбега и мяч в снимке.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALL_BYTES, BALL_DROP_Y, BALL_FLOAT_TICKS, BALL_GONE_TICKS, BALL_HOME, BALL_IDLE_TICKS, BALL_R, BALL_STUCK_TICKS, BALL_TRAMP_VY, ballShown,
  ballWet, makeBall, readBall, stepBall, touchBall, type Ball, type BallKicker,
} from '../shared/ball.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { decodeSnapshot, makeHeader, type EntitySnap } from '../shared/protocol.ts';
import { BTN_FORWARD, makeState } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';
import { hold, login, placeAt, setupHub } from './kit.ts';

const world = new CollisionWorld(buildLobby());

/** Мяч в точке со скоростью — проснувшийся. */
function ballAt(x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): Ball {
  const b = makeBall();
  Object.assign(b, { x, y, z, vx, vy, vz, still: 0, grounded: false });
  return b;
}

/** Шагать, пока не уснёт (или не кончится время); вершины подскоков — по пути. */
function settle(b: Ball, seconds: number): { ticks: number; apexes: number[]; splashes: number } {
  const apexes: number[] = [];
  let splashes = 0;
  let prevVy = b.vy;
  let ticks = 0;
  for (; ticks < seconds * TICK_RATE; ticks++) {
    if (stepBall(b, world)) splashes++;
    if (prevVy > 0 && b.vy <= 0) apexes.push(b.y);
    prevVy = b.vy;
    if (b.still >= 20 && !ballWet(b)) break;
  }
  return { ticks, apexes, splashes };
}

function kicker(o: Partial<BallKicker>): BallKicker {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: 1, dashT: 0, ...o };
}

test('мяч падает, отскакивает всё ниже и ложится на настил', () => {
  const b = ballAt(BALL_HOME.x, 3, BALL_HOME.z);
  const { ticks, apexes } = settle(b, 8);
  assert.ok(ticks < 8 * TICK_RATE, 'уснул');
  assert.ok(apexes.length >= 2, `отскоки: ${apexes.length}`);
  for (let i = 1; i < apexes.length; i++) assert.ok(apexes[i] < apexes[i - 1], 'каждый ниже прежнего');
  assert.ok(apexes[0] > 1.2, 'первый отскок заметный');
  assert.ok(Math.abs(b.y - BALL_R) < 0.01, `лежит на настиле: ${b.y}`);
  assert.equal(b.vx + b.vy + b.vz, 0);
  assert.ok(b.bounces >= 1, 'стук слышно');
});

test('катится по площади и останавливается', () => {
  const b = ballAt(BALL_HOME.x, BALL_R, BALL_HOME.z, -8, 0, 0);
  const { ticks } = settle(b, 10);
  assert.ok(ticks < 10 * TICK_RATE, 'остановился');
  const path = BALL_HOME.x - b.x;
  assert.ok(path > 4 && path < 16, `укатился на ${path.toFixed(1)} м`);
  assert.ok(Math.abs(b.z - BALL_HOME.z) < 0.01, 'прямо');
  assert.ok(Math.abs(b.y - BALL_R) < 0.01, 'по настилу');
});

test('в стену — отскакивает назад и теряет скорость', () => {
  // склад: южная стена — z = −16
  const b = ballAt(6, BALL_R, -14, 0, 0, -8);
  let before = 0;
  for (let i = 0; i < TICK_RATE; i++) {
    if (b.vz < 0) before = -b.vz;
    stepBall(b, world);
    if (b.vz > 0) break;
  }
  assert.ok(b.vz > 0, 'летит обратно');
  assert.ok(b.vz < before * 0.75 && b.vz > before * 0.4, `${before.toFixed(2)} → ${b.vz.toFixed(2)}`);
  assert.ok(b.z - BALL_R >= -16 - 1e-6, 'в стену не вошёл');
});

test('в воду — всплеск, качается, пропадает и падает дома', () => {
  const b = ballAt(-29, 1, 10, -6, 0, 0);
  let t = 0;
  while (!ballWet(b) && t++ < 3 * TICK_RATE) stepBall(b, world);
  assert.ok(ballWet(b), 'в воде');
  assert.ok(b.x < -30, 'за краем настила');
  // всплеск — один раз
  const r = settle(b, 0.5);
  assert.equal(r.splashes, 0, 'всплеск был при входе, не повторяется');
  assert.ok(ballShown(b), 'качается — виден');
  assert.ok(b.y < -1 && b.y > -1.3, `на волнах: ${b.y}`);
  let float = 30;
  while (ballShown(b) && float < 2 * BALL_FLOAT_TICKS) {
    stepBall(b, world);
    float++;
  }
  assert.ok(!ballShown(b), 'пропал');
  assert.ok(float <= BALL_FLOAT_TICKS, `качался ${float} тиков`);
  for (let i = 0; i < BALL_GONE_TICKS; i++) stepBall(b, world);
  assert.ok(ballShown(b) && !ballWet(b), 'снова на площади');
  assert.equal(b.x, BALL_HOME.x);
  assert.equal(b.z, BALL_HOME.z);
  assert.ok(b.y > BALL_DROP_Y - 0.2, 'падает сверху');
  settle(b, 8);
  assert.ok(Math.abs(b.y - BALL_R) < 0.01, 'лёг дома');
});

test('всплеск: stepBall сообщает о нём ровно в тик входа в воду', () => {
  const b = ballAt(-29, 1, 10, -6, 0, 0);
  let splashes = 0;
  for (let i = 0; i < 3 * TICK_RATE; i++) if (stepBall(b, world)) splashes++;
  assert.equal(splashes, 1);
});

test('батут подбрасывает высоко, и подряд — всё ниже, потом мяч на нём ложится', () => {
  const tr = buildLobby().trampolines[0];
  const b = ballAt(tr.x, 2, tr.z);
  const { ticks, apexes } = settle(b, 30);
  assert.ok(apexes[0] > tr.top + BALL_R + (BALL_TRAMP_VY * BALL_TRAMP_VY) / 30 - 1, `первый подскок: ${apexes[0].toFixed(2)}`);
  assert.ok(apexes[1] < apexes[0] - 0.5, 'второй ниже');
  assert.ok(ticks < 30 * TICK_RATE, 'улёгся');
  assert.ok(Math.abs(b.y - (tr.top + BALL_R)) < 0.01, 'лежит на батуте');
});

test('пинок: по бегу, рывком — сильнее, в прыжке — выше; стоящий не пинает — мяч отскакивает', () => {
  // бежит на север (−Z), мяч прямо перед ним
  const at0 = () => ballAt(0, BALL_R, 0);
  const run = at0();
  assert.ok(touchBall(run, kicker({ z: 0.7, vz: -8.4 }), true), 'пинок');
  const sRun = Math.hypot(run.vx, run.vz);
  assert.ok(run.vz < 0 && Math.abs(run.vx) < 0.01, 'по направлению бега');
  assert.ok(sRun > 9 && sRun < 13, `с разбега: ${sRun.toFixed(1)} м/с`);
  assert.ok(run.vy > 1 && run.vy < 3, 'чуть подскакивает');
  assert.equal(run.kicks, 1);

  const dash = at0();
  touchBall(dash, kicker({ z: 0.7, vz: -18.5, dashT: 4 }), true);
  assert.ok(Math.hypot(dash.vx, dash.vz) > sRun + 3, 'рывком — сильнее');
  assert.ok(dash.vy > run.vy, 'и чуть выше');

  const air = at0();
  touchBall(air, kicker({ z: 0.7, vz: -8.4, vy: 4, grounded: 0 }), true);
  assert.ok(air.vy > 6, `в прыжке — выше: ${air.vy}`);

  // вскользь — слабее и больше в сторону удара
  const side = at0();
  touchBall(side, kicker({ x: -0.55, z: 0.45, vz: -8.4 }), true);
  assert.ok(Math.hypot(side.vx, side.vz) < sRun, 'вскользь слабее');
  assert.ok(side.vx > 1, 'и в сторону');

  // перезарядка пинка — только вытолкнуло
  const cool = at0();
  assert.equal(touchBall(cool, kicker({ z: 0.7, vz: -8.4 }), false), false);
  assert.equal(cool.kicks, 0);
  assert.ok(Math.hypot(cool.x, cool.z - 0.7) >= 0.8 - 1e-9, 'вытолкнут из тела');

  // мяч катится в стоящую желейку — отскок, не пинок
  const roll = ballAt(0, BALL_R, -0.75, 0, 0, 5);
  assert.equal(touchBall(roll, kicker({}), true), false);
  assert.ok(roll.vz < -2 && roll.vz > -3, `отскок от тела: ${roll.vz}`);

  // далеко или над головой — не касается
  assert.equal(touchBall(at0(), kicker({ z: 0.9, vz: -8.4 }), true), false);
  const high = at0();
  high.y = 2.4;
  assert.equal(touchBall(high, kicker({ z: 0.5, vz: -8.4 }), true), false);
});

test('застрял на крыше павильона — через 6 с дома', () => {
  const b = ballAt(-20, 6, -20);
  settle(b, 3);
  assert.ok(Math.abs(b.y - (5 + BALL_R)) < 0.01, `лежит на крыше: ${b.y}`);
  for (let i = 0; i < BALL_STUCK_TICKS; i++) stepBall(b, world);
  assert.ok(!ballShown(b), 'пропал с крыши');
  for (let i = 0; i < BALL_GONE_TICKS; i++) stepBall(b, world);
  assert.equal(b.x, BALL_HOME.x);
  assert.equal(b.z, BALL_HOME.z);
});

test('давно не пинали и лежит вдали — домой; рядом с домом — лежит', () => {
  const far = ballAt(15, BALL_R, 0);
  const near = ballAt(BALL_HOME.x + 3, BALL_R, BALL_HOME.z);
  settle(far, 1);
  settle(near, 1);
  for (let i = 0; i < BALL_IDLE_TICKS; i++) {
    stepBall(far, world);
    stepBall(near, world);
  }
  for (let i = 0; i < BALL_GONE_TICKS + 1; i++) stepBall(far, world);
  assert.equal(far.x, BALL_HOME.x, 'вернулся');
  assert.equal(near.x, BALL_HOME.x + 3, 'рядом с домом — не трогаем');
});

test('сервер: желейка с разбега пинает мяч, мяч — в снимке набережной', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Нападающий');
  const ball = hub.lobby.ball;
  // мяч дома (0; 3,6), игрок в 2,4 м южнее, бежит на север
  placeAt(hub, a.c, BALL_HOME.x, BALL_HOME.z + 2.4);
  hold(hub, [a.c], BTN_FORWARD, 30, 0);
  assert.equal(ball.kicks, 1, 'один пинок');
  assert.ok(ball.z < BALL_HOME.z - 2, `улетел на север: ${ball.z.toFixed(2)}`);
  assert.ok(ball.vz < -4, 'и летит дальше');

  const h = makeHeader();
  const ents: EntitySnap[] = [];
  const buf = a.s.bins[a.s.bins.length - 1];
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  assert.equal(decodeSnapshot(ab, h, makeState(), ents), 1, 'в списке — только игрок');
  // мяч — за списком, со скоростью и счётчиками (снимок ушёл чуть раньше последнего тика)
  const got = makeBall();
  readBall(new DataView(ab), h.tail, got);
  assert.equal(ab.byteLength, h.tail + BALL_BYTES);
  assert.equal(got.kicks, 1, 'счётчик пинков');
  assert.ok(got.vz < -4, 'летит на север');
  assert.ok(Math.abs(got.z - ball.z) < 1, 'там же, где на сервере');
});
