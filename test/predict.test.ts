// Предсказание: на набережной «сидение» считается одинаково на сервере и у клиента — без поправок;
// у карта — сверка с сервером (банка, ящик, сброс на решётку, переполнение истории).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Predictor } from '../client/predict.ts';
import { KartPredictor } from '../client/race/predict.ts';
import { COYOTE_TICKS } from '../shared/constants.ts';
import { ITEM_ROLL_TICKS, ITEM_TURBO, SLOW_TICKS, SPIN_TICKS, kartsEqual, makeKartEvents, makeKartState, placeOnGrid, stepKart, type KartEvents, type KartState } from '../shared/kart.ts';
import { LEAVE_SEAT, stepHeld } from '../shared/lobby.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { buildRing } from '../shared/maps/ring.ts';
import { BTN_FORWARD, BTN_JUMP, BTN_LEFT, makeEvents, makeInput, makeState, type Input } from '../shared/sim.ts';
import type { Track } from '../shared/track.ts';
import { CollisionWorld } from '../shared/world.ts';

test('сел на ходу с зажатым W: сервер и клиент сходятся, встаёт от нового нажатия', () => {
  const world = new CollisionWorld(buildLobby());
  const srv = makeState();
  srv.z = 6;
  srv.grounded = 1;
  srv.coyote = COYOTE_TICKS;
  let srvHold = 0;
  let ack = 0;
  let lastButtons = 0;
  const ev = makeEvents();
  const pred = new Predictor(world);
  pred.reset(srv, 0);
  const inFlight: Input[] = [];
  let seq = 0;
  const send = (buttons: number): void => {
    const inp = makeInput();
    inp.seq = ++seq;
    inp.buttons = buttons;
    pred.step(inp, false);
    inFlight.push(inp);
  };
  /** Сервер обработал всё, что дошло, и прислал снимок. */
  const serve = (): void => {
    for (const inp of inFlight.splice(0)) {
      srvHold = stepHeld(srv, srvHold, inp, world, false, 0, ev);
      ack = inp.seq;
      lastButtons = inp.buttons;
    }
    assert.equal(pred.reconcile(ack, srv, srvHold), false, `вход ${ack}: без поправок`);
  };
  for (let i = 0; i < 10; i++) {
    send(BTN_FORWARD);
    serve();
  }
  // ещё два шага в пути, а сервер уже посадил (нажал E): телепорт в «стоя на полу»
  send(BTN_FORWARD);
  send(BTN_FORWARD);
  Object.assign(srv, makeState(), { x: 3, y: 0, z: 2, grounded: 1, coyote: COYOTE_TICKS, prevButtons: lastButtons });
  srvHold = LEAVE_SEAT;
  pred.reset(srv, ack, srvHold);
  serve();
  for (let i = 0; i < 20; i++) {
    send(BTN_FORWARD);
    serve();
  }
  assert.equal(pred.hold, LEAVE_SEAT, 'сидит, хотя W зажат');
  assert.deepEqual([pred.state.x, pred.state.z], [3, 2]);
  send(0);
  serve();
  send(BTN_FORWARD);
  serve();
  assert.equal(pred.hold, 0, 'нажал W заново — встал');
  assert.equal(srvHold, 0);
  for (let i = 0; i < 10; i++) {
    send(BTN_FORWARD);
    serve();
  }
  assert.ok(pred.state.z < 2 - 0.5, 'пошёл вперёд');
  assert.equal(pred.corrections, 0);
});

// --- Карт: предсказание по той же физике, сверка со «сервером» в тесте

interface KartHarness {
  pred: KartPredictor;
  srv: KartState;
  /** Нажать кнопки: тик предсказания, вход — «в пути» к серверу */
  send(buttons: number): void;
  /** Сервер применил всё, кроме последних keep входов; true — была поправка */
  serve(keep?: number): boolean;
  readonly ack: number;
  /** События последнего тика сервера */
  readonly ev: KartEvents;
}

function kartHarness(setup?: (k: KartState, tr: Track) => void): KartHarness {
  const tr = buildRing().track;
  const srv = makeKartState();
  placeOnGrid(srv, tr, 0);
  setup?.(srv, tr);
  const pred = new KartPredictor(tr);
  pred.reset(srv, 0);
  const ev = makeKartEvents();
  const inFlight: Input[] = [];
  let seq = 0;
  let ack = 0;
  return {
    pred,
    srv,
    send(buttons) {
      const inp = makeInput();
      inp.seq = ++seq;
      inp.buttons = buttons;
      pred.step(inp, true);
      inFlight.push(inp);
    },
    serve(keep = 0) {
      for (const inp of inFlight.splice(0, Math.max(0, inFlight.length - keep))) {
        stepKart(srv, inp, tr, ev, true);
        ack = inp.seq;
      }
      return pred.reconcile(ack, srv);
    },
    get ack() {
      return ack;
    },
    ev,
  };
}

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('карт: без вмешательства сервера сверка не поправляет (входы в пути, руль, занос)', () => {
  const h = kartHarness();
  for (let i = 0; i < 240; i++) {
    let b = BTN_FORWARD;
    if (i > 90 && i < 150) b |= BTN_LEFT | BTN_JUMP;
    h.send(b);
    assert.equal(h.serve(3), false, `тик ${i}`);
  }
  assert.equal(h.serve(), false);
  assert.equal(h.pred.corrections, 0);
  assert.ok(kartsEqual(h.pred.state, h.srv));
});

test('карт: сервер включил варенье — переигровка с ним, поправка гаснет', () => {
  const h = kartHarness();
  for (let i = 0; i < 120; i++) {
    h.send(BTN_FORWARD);
    h.serve(3);
  }
  const before = { ...h.pred.state };
  h.send(BTN_FORWARD);
  // банка: сервер замедлил и закружил карт после входа ack, три входа ещё в пути
  for (let i = 0; i < 1; i++) h.serve(3);
  h.srv.slowT = SLOW_TICKS;
  h.srv.spinT = SPIN_TICKS;
  assert.equal(h.pred.reconcile(h.ack, h.srv), true);
  assert.equal(h.pred.corrections, 1);
  assert.equal(h.pred.state.slowT, SLOW_TICKS - 3, 'три входа переиграны уже в варенье');
  assert.equal(h.pred.state.spinT, SPIN_TICKS - 3);
  const off = Math.hypot(h.pred.offset.x, h.pred.offset.y, h.pred.offset.z);
  assert.ok(off > 0.005 && off < 0.5, `поправка ${off}`);
  assert.ok(dist(h.pred.state, before) < 3);
  // дальше сервер считает так же — новых поправок нет
  for (let i = 0; i < 30; i++) {
    h.send(BTN_FORWARD);
    assert.equal(h.serve(3), false);
  }
  h.pred.decay(1);
  assert.ok(Math.hypot(h.pred.offset.x, h.pred.offset.y, h.pred.offset.z) < 1e-4, 'поправка погасла');
});

test('карт: ящик — бонус от сервера, рулетка тикает дальше, без визуального сдвига', () => {
  const h = kartHarness();
  for (let i = 0; i < 60; i++) {
    h.send(BTN_FORWARD);
    h.serve(2);
  }
  h.srv.item = ITEM_TURBO;
  h.srv.itemT = ITEM_ROLL_TICKS;
  assert.equal(h.pred.reconcile(h.ack, h.srv), true);
  assert.equal(h.pred.state.item, ITEM_TURBO);
  assert.equal(h.pred.state.itemT, ITEM_ROLL_TICKS - 2);
  assert.equal(Math.hypot(h.pred.offset.x, h.pred.offset.y, h.pred.offset.z), 0);
});

test('карт: SNAP_SELF_RESET — встаёт как сервер, без сглаживания', () => {
  const h = kartHarness();
  for (let i = 0; i < 90; i++) {
    h.send(BTN_FORWARD);
    h.serve(2);
  }
  const tr = buildRing().track;
  placeOnGrid(h.srv, tr, 0);
  h.pred.reset(h.srv, h.ack);
  assert.deepEqual(h.pred.offset, { x: 0, y: 0, z: 0 });
  assert.ok(kartsEqual(h.pred.prev, h.pred.state), 'без проезда от старого места');
  assert.ok(dist(h.pred.state, h.srv) < 0.05, 'на решётке (два входа в пути — едва тронулся)');
});

test('карт: история переполнилась — жёстко как сервер; вход новее своих — без поправки', () => {
  const h = kartHarness();
  for (let i = 0; i < 300; i++) h.send(BTN_FORWARD);
  const tr = buildRing().track;
  const srv = makeKartState();
  placeOnGrid(srv, tr, 0);
  srv.x += 6;
  const corrections = h.pred.corrections;
  assert.equal(h.pred.reconcile(20, srv), true);
  assert.deepEqual(h.pred.offset, { x: 0, y: 0, z: 0 });
  assert.ok(kartsEqual(h.pred.prev, h.pred.state));
  assert.equal(h.pred.corrections, corrections);
  assert.equal(h.pred.reconcile(400, srv), false);
});

test('карт: выехавший контейнер — удар, закрутка и rt сходятся с сервером без поправок; чужое rt переигрывается', () => {
  const tr = buildRing().track;
  const m = tr.hz.movers[0];
  // 8 м до контейнера на южной прямой, вдоль дороги; контейнер выехал (rt ~230 при встрече)
  const h = kartHarness((k) => {
    k.x = m.ax - 8;
    k.z = tr.pz[0];
    k.hx = 1;
    k.hz = 0;
    k.vx = 20;
    k.seg = 0;
    for (let i = 0; i < tr.n; i++) if (Math.abs(tr.px[i] - k.x) < 1 && Math.abs(tr.pz[i] - k.z) < 1) k.seg = i;
    k.cp = 1;
    k.lap = 1;
    k.rt = 205;
  });
  let hit = 0;
  for (let i = 0; i < 90; i++) {
    h.send(BTN_FORWARD);
    assert.equal(h.serve(3), false, `тик ${i}`);
    hit = Math.max(hit, h.ev.hit);
  }
  assert.equal(h.serve(), false);
  assert.equal(h.pred.corrections, 0, 'поправок нет: предсказание считает контейнер так же');
  assert.ok(kartsEqual(h.pred.state, h.srv));
  assert.ok(hit > 3, `удар о контейнер ${hit}`);
  assert.equal(h.srv.rt, 205 + 90);
  // сервер говорит другое rt (сдвиг часов): переигровка с серверным состоянием, расхождение гасится поправкой
  h.srv.rt += 40;
  for (let i = 0; i < 10; i++) h.send(BTN_FORWARD);
  assert.equal(h.pred.reconcile(h.ack, h.srv), true);
  assert.equal(h.pred.state.rt, h.srv.rt + 10);
});
