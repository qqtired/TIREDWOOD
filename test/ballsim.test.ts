// Мяч у клиента (client/lobby/ballsim.ts): свой пинок — сразу, раньше сервера, и сервер его подтверждает без
// поправок; чужой пинок приходит со снимком — мяч догоняет «сейчас» плавно, звук один; вдали от своей желейки
// мяч показан во времени чужих (их пинок — когда желейка добежала); домой — без «проезда» через площадь;
// всплеск — один, сколько бы снимков ни пересчитывали падение в воду.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BallPredictor, EV_APPEAR, EV_KICK, EV_SPLASH } from '../client/lobby/ballsim.ts';
import { Predictor } from '../client/predict.ts';
import {
  BALL_BYTES, BALL_FLOAT_TICKS, BALL_GONE_TICKS, BALL_HOME, BALL_KICK_TICKS, makeBall, stepBall, touchBall, writeBall, type Ball,
} from '../shared/ball.ts';
import { COYOTE_TICKS } from '../shared/constants.ts';
import { stepHeld } from '../shared/lobby.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { BTN_FORWARD, makeEvents, makeInput, makeState, type Input } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

const world = new CollisionWorld(buildLobby());

/**
 * Сервер и клиент с одной желейкой, как в комнате: вход доходит до сервера через lag тиков, снимок — каждые
 * 2 тика (обратно — мгновенно). Мяч сервера — та же логика, что в server/lobby/room.ts. remoteLag — на сколько
 * тиков позади «сейчас» видны чужие желейки (null — не знаем: мяч всегда «сейчас»).
 */
function setup(lag: number, x: number, z: number, remoteLag: number | null = null) {
  const srv = makeState();
  srv.x = x;
  srv.z = z;
  srv.grounded = 1;
  srv.coyote = COYOTE_TICKS;
  const ball = makeBall();
  const pred = new Predictor(world);
  pred.reset(srv, 0);
  const bp = new BallPredictor(world);
  const ev = makeEvents();
  const flight: Input[] = [];
  const view = new DataView(new ArrayBuffer(BALL_BYTES));
  let seq = 0;
  let ack = 0;
  let tick = 0;
  let kickAt = 0;
  let hold = 0;
  const fired = [0, 0, 0, 0, 0];
  const firedAt: Array<[number, number]> = [];
  let maxOffset = 0;
  const h = {
    srv,
    ball,
    pred,
    bp,
    fired,
    firedAt,
    get tick() {
      return tick;
    },
    get maxOffset() {
      return maxOffset;
    },
    /** Тик клиента и сервера; other — что ещё сделать с мячом сервера в этом тике (чужая желейка) */
    step(buttons: number, other?: (b: Ball) => void): void {
      const inp = makeInput();
      inp.seq = ++seq;
      inp.buttons = buttons;
      pred.step(inp, false);
      bp.tick(inp.seq, pred.state, pred.hold);
      flight.push(inp);
      tick++;
      if (flight.length > lag) {
        const s = flight.shift()!;
        hold = stepHeld(srv, hold, s, world, false, 0, ev);
        ack = s.seq;
      }
      if (touchBall(ball, srv, hold === 0 && tick >= kickAt)) kickAt = tick + BALL_KICK_TICKS;
      other?.(ball);
      stepBall(ball, world);
      if (tick % 2 === 0) {
        writeBall(view, 0, ball);
        pred.reconcile(ack, srv, hold);
        bp.rebase(view, 0, ack, pred);
      }
      // кадр ровно на тике: показ «сейчас» — последний тик
      bp.frame(1 / 60, 1, pred.state.x, pred.state.z, remoteLag === null ? null : seq - remoteLag);
      for (const e of bp.fired) {
        fired[e.kind]++;
        firedAt.push([e.kind, tick]);
      }
      maxOffset = Math.max(maxOffset, Math.hypot(bp.offset.x, bp.offset.y, bp.offset.z));
    },
  };
  return h;
}

test('свой пинок: у клиента — сразу, у сервера — позже, и он совпал без поправок; звук один', () => {
  // желейка в 2,4 м южнее мяча, бежит на север; вход идёт до сервера 6 тиков (~100 мс); чужие видны на 20 тиков позже
  const h = setup(6, BALL_HOME.x, BALL_HOME.z + 2.4, 20);
  let clientAt = -1;
  let serverAt = -1;
  for (let t = 0; t < 120; t++) {
    h.step(t < 22 ? BTN_FORWARD : 0);
    if (clientAt < 0 && h.bp.ball.kicks === 1) clientAt = h.tick;
    if (serverAt < 0 && h.ball.kicks === 1) serverAt = h.tick;
  }
  assert.ok(clientAt >= 0 && serverAt >= 0, 'пнули оба');
  assert.equal(serverAt - clientAt, 6, 'клиент видит пинок на задержку раньше');
  assert.equal(h.fired[EV_KICK], 1, 'звук пинка — один');
  const heard = h.firedAt.find((f) => f[0] === EV_KICK)![1];
  assert.ok(heard - clientAt <= 1, `и слышен сразу (свой мяч — «сейчас», хоть чужие и видны позже): ${heard - clientAt}`);
  assert.ok(h.maxOffset < 0.01, `сервер подтвердил без поправок: ${h.maxOffset}`);
  assert.equal(h.bp.corrections, 0);
  // клиент «сейчас» — впереди сервера на те же 6 тиков; мяч улёгся — у обоих одно и то же
  for (let t = 0; t < 900 && (h.ball.still < 20 || t < 60); t++) h.step(0);
  assert.equal(h.fired[EV_KICK], 1);
  assert.ok(Math.hypot(h.bp.ball.x - h.ball.x, h.bp.ball.z - h.ball.z) < 0.01, 'мяч один и тот же');
});

test('чужой пинок (мяч «сейчас»): приходит со снимком, мяч догоняет плавно, звук один', () => {
  // своя желейка стоит в стороне; мяч дома пинает кто-то другой (на сервере)
  const h = setup(6, 5, 10);
  for (let t = 0; t < 20; t++) h.step(0);
  assert.equal(h.fired[EV_KICK], 0);
  const kicker = { x: BALL_HOME.x, y: 0, z: BALL_HOME.z + 0.75, vx: 0, vy: 0, vz: -8.4, grounded: 1, dashT: 0 };
  h.step(0, (b) => touchBall(b, kicker, true));
  h.step(0);
  assert.equal(h.ball.kicks, 1);
  assert.equal(h.fired[EV_KICK], 1, 'со снимком — звук пинка');
  // мяч у клиента — уже «сейчас» (пересчитан на 6 тиков вперёд), а на экране — плавно из прежнего места
  assert.ok(h.bp.ball.z < h.ball.z - 0.3, 'клиент впереди сервера');
  assert.ok(h.maxOffset > 0.3, 'рывок не сразу — через поправку');
  for (let t = 0; t < 60; t++) h.step(0);
  assert.equal(h.fired[EV_KICK], 1, 'следующие снимки звук не повторяют');
  assert.ok(Math.hypot(h.bp.offset.x, h.bp.offset.z) < 0.01, 'поправка растворилась');
});

test('мяч вдали: показан во времени чужих желеек — чужой пинок виден и слышен позже, мяч летит только вперёд', () => {
  // чужие видны на 14 тиков позже «сейчас»; своя желейка далеко от мяча
  const h = setup(6, 12, 12, 14);
  for (let t = 0; t < 60; t++) h.step(0);
  assert.ok(Math.abs(h.bp.tau - 14) < 0.01, `показ отстал на 14 тиков: ${h.bp.tau}`);
  const kicker = { x: BALL_HOME.x, y: 0, z: BALL_HOME.z + 0.75, vx: 0, vy: 0, vz: -8.4, grounded: 1, dashT: 0 };
  h.step(0, (b) => touchBall(b, kicker, true));
  const kickTick = h.tick;
  h.step(0);
  assert.equal(h.fired[EV_KICK], 0, 'снимок пришёл, а показ до пинка ещё не дошёл');
  assert.ok(Math.abs(h.bp.show.z - BALL_HOME.z) < 0.01, 'мяч на экране ещё лежит');
  let prevZ = h.bp.show.z;
  let back = 0;
  for (let t = 0; t < 40; t++) {
    h.step(0);
    if (h.bp.show.z > prevZ + 1e-6) back++;
    prevZ = h.bp.show.z;
  }
  assert.equal(h.fired[EV_KICK], 1, 'пинок — один');
  const heard = h.firedAt.find((f) => f[0] === EV_KICK)![1];
  assert.ok(heard - kickTick >= 6, `слышно позже снимка: через ${heard - kickTick} тиков`);
  assert.equal(back, 0, 'мяч на экране летит только вперёд');
});

test('в воду и домой: всплеск и появление — по разу, домой — без «проезда» через площадь', () => {
  // своя желейка в стороне; связь устоялась — и мяч (чужим пинком) летит с западного края настила в воду
  const h = setup(6, 5, 10);
  for (let t = 0; t < 20; t++) h.step(0);
  h.step(0, (b) => Object.assign(b, { x: -29, y: 1, z: 10, vx: -6, vy: 0, vz: 0, still: 0, grounded: false }));
  h.step(0);
  const jump = h.maxOffset;
  let hiddenSeen = false;
  for (let t = 0; t < BALL_FLOAT_TICKS + BALL_GONE_TICKS + 120 && h.fired[EV_APPEAR] === 0; t++) {
    h.step(0);
    if (!h.bp.show.shown) hiddenSeen = true;
  }
  assert.equal(h.fired[EV_SPLASH], 1, 'всплеск — один, хоть падение в воду и пересчитывали несколько снимков');
  assert.ok(hiddenSeen, 'пропадал');
  assert.equal(h.fired[EV_APPEAR], 1, 'появился дома');
  assert.ok(Math.hypot(h.bp.show.x - BALL_HOME.x, h.bp.show.z - BALL_HOME.z) < 0.01, 'дома');
  assert.ok(jump < 0.01, `прыжок через полплощади — без сглаживания: ${jump}`);
  assert.ok(h.maxOffset < 0.01, `и дальше без поправок: ${h.maxOffset}`);
});
