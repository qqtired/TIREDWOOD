// Колесо обозрения: вращение по общему времени, кабинки и места, посадка за 5 жетонов, один оборот, выход внизу.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACT_NONE, ACT_WHEEL } from '../shared/lobby.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { BTN_FORWARD, BTN_JUMP } from '../shared/sim.ts';
import {
  CABIN_DROP, CABIN_FLOOR_LOW, CABIN_STEP, WHEEL, WHEEL_CABINS, WHEEL_EXIT, WHEEL_GATE, WHEEL_HUB_Y, WHEEL_PERIOD, WHEEL_PRICE, WHEEL_R, WHEEL_SEATS,
  bottomCabin, cabinAt, seatAt, wheelArrival, wheelTurn,
} from '../shared/wheel.ts';
import type { Client, Hub } from '../server/hub.ts';
import { WheelRide } from '../server/lobby/wheel.ts';
import { hold, lastOf, login, newKey, placeAt, setupHub, steps } from './kit.ts';

/** Кабинка снаружи: от середины по x и по z, от пола вверх (с крышей) */
const CAB_X = 1.05;
const CAB_Z = 1.0;
const CAB_H = 2.45;

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

function wheelId(hub: Hub): number {
  const it = hub.lobby.map.interact.find((i) => i.kind === 'wheel');
  assert.ok(it, 'точка колеса');
  return it.id;
}

function useWheel(hub: Hub, c: Client): void {
  placeAt(hub, c, WHEEL_GATE.x, WHEEL_GATE.z, 0.15);
  hub.onJson(c, { t: 'use', id: wheelId(hub) });
}

test('колесо: вертится по общим часам, кабинка 0 внизу в тик 0, оборот — 90 с, кабинки — по кругу без скачков', () => {
  assert.equal(WHEEL_PERIOD, 90 * 60);
  assert.equal(wheelTurn(0), 0);
  assert.ok(Math.abs(wheelTurn(WHEEL_PERIOD / 4) - Math.PI / 2) < 1e-12);
  assert.equal(wheelTurn(WHEEL_PERIOD), 0);
  assert.equal(wheelTurn(-WHEEL_PERIOD / 2), wheelTurn(WHEEL_PERIOD / 2), 'и до нуля — то же колесо');
  const p = cabinAt(0, 0, { y: 0, z: 0 });
  assert.ok(Math.abs(p.y - CABIN_DROP - CABIN_FLOOR_LOW) < 1e-9, 'пол нижней кабинки — на ступеньку выше площади');
  assert.equal(p.z, WHEEL.z);
  const top = cabinAt(0, WHEEL_PERIOD / 2, { y: 0, z: 0 });
  assert.ok(Math.abs(top.y - (WHEEL_HUB_Y + WHEEL_R)) < 1e-9, 'через полоборота — наверху');
  assert.ok(cabinAt(0, 60, { y: 0, z: 0 }).z > WHEEL.z, 'поднимаются со стороны моря');
  const prev = { y: 0, z: 0 };
  const cur = { y: 0, z: 0 };
  for (let c = 0; c < WHEEL_CABINS; c++) {
    cabinAt(c, 0, prev);
    for (let t = 1; t <= WHEEL_PERIOD; t += 7) {
      cabinAt(c, t, cur);
      // за 7 тиков — 7 · 2πR / оборот ≈ 0,057 м
      assert.ok(Math.hypot(cur.y - prev.y, cur.z - prev.z) < 0.06, `кабинка ${c}, тик ${t}: без скачков`);
      Object.assign(prev, cur);
    }
  }
});

test('колесо: внизу всегда одна кабинка (ближе всех к низу), приезжает вниз через один оборот', () => {
  const at = { y: 0, z: 0 };
  for (let t = -1000; t < WHEEL_PERIOD * 2; t += 37) {
    const { c, dt } = bottomCabin(t);
    assert.ok(Math.abs(dt) <= CABIN_STEP / 2 + 1e-9, `тик ${t}: до низа ${dt}`);
    let low = Infinity;
    let lowest = -1;
    for (let k = 0; k < WHEEL_CABINS; k++) {
      cabinAt(k, t, at);
      if (at.y < low) {
        low = at.y;
        lowest = k;
      }
    }
    assert.equal(c, lowest, `тик ${t}: нижняя кабинка`);
    const arrive = wheelArrival(c, t);
    assert.ok(Math.abs(arrive - t - WHEEL_PERIOD) <= CABIN_STEP / 2 + 1e-9, `тик ${t}: один оборот (${arrive - t})`);
    cabinAt(c, arrive, at);
    assert.ok(Math.abs(at.y - CABIN_DROP - CABIN_FLOOR_LOW) < 1e-6, `тик ${t}: приезжает в самый низ`);
  }
});

test('колесо: места в кабинке — по две на скамейке, внутри неё; кабинки не задевают ничего твёрдого и не выходят за снимок', () => {
  const s = { x: 0, y: 0, z: 0, yaw: 0 };
  const cab = { y: 0, z: 0 };
  const seen = new Set<string>();
  for (let i = 0; i < WHEEL_CABINS * WHEEL_SEATS; i++) {
    const c = Math.floor(i / WHEEL_SEATS);
    seatAt(i, 1234, s);
    cabinAt(c, 1234, cab);
    assert.ok(Math.abs(s.x - WHEEL.x) < CAB_X - 0.42 && Math.abs(s.z - cab.z) < CAB_Z - 0.42, `место ${i} — в кабинке`);
    assert.ok(Math.abs(s.y - (cab.y - CABIN_DROP)) < 1e-9, `место ${i} — на полу кабинки`);
    seen.add(`${c}:${s.x.toFixed(2)}:${(s.z - cab.z).toFixed(2)}`);
  }
  assert.equal(seen.size, WHEEL_CABINS * WHEEL_SEATS, 'места не совпадают');
  const map = buildLobby();
  for (let c = 0; c < WHEEL_CABINS; c++) {
    for (let t = 0; t < WHEEL_PERIOD; t += 15) {
      cabinAt(c, t, cab);
      const y0 = cab.y - CABIN_DROP;
      assert.ok(Math.abs(cab.z) < 120 && cab.y + 1 < 120, 'в пределах снимка');
      for (const b of map.boxes) {
        const hit = b.max[0] > WHEEL.x - CAB_X && b.min[0] < WHEEL.x + CAB_X && b.max[2] > cab.z - CAB_Z && b.min[2] < cab.z + CAB_Z && b.max[1] > y0 && b.min[1] < y0 + CAB_H;
        assert.ok(!hit, `кабинка ${c}, тик ${t} задевает бокс ${b.min.join(',')} — ${b.max.join(',')}`);
      }
    }
  }
});

test('места колеса: в нижнюю кабинку — четверо, пятому ждать следующую; приехала — выходят все; вышел из игры — место свободно', () => {
  const w = new WheelRide();
  const t = 100;
  const { c } = bottomCabin(t);
  for (let k = 0; k < WHEEL_SEATS; k++) assert.equal(w.board(10 + k, t + k), c * WHEEL_SEATS + k);
  assert.equal(w.board(99, t + 5), -1, 'кабинка полная');
  w.leave(11);
  assert.equal(w.seatOf(11), -1);
  assert.equal(w.board(12 + 50, t + 6), c * WHEEL_SEATS + 1, 'освободившееся место');
  const arrive = wheelArrival(c, t);
  assert.deepEqual(w.arrived(arrive - 1), []);
  assert.deepEqual(w.arrived(arrive), [0, 1, 2, 3].map((k) => c * WHEEL_SEATS + k), 'вместе с кабинкой');
  const next = bottomCabin(t + CABIN_STEP).c;
  assert.notEqual(next, c);
  assert.equal(w.board(99, t + CABIN_STEP), next * WHEEL_SEATS, 'следующая кабинка');
});

test('колесо: 5 🪙 — садишься в нижнюю кабинку, везёт сервер, встать нельзя; через оборот внизу выходишь сам', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Турист');
  steps(hub, 200);
  const t0 = a.c.profile!.tokens;
  const tick = hub.lobby.tick;
  useWheel(hub, a.c);
  const p = lp(hub, a.c);
  assert.equal(p.action, ACT_WHEEL);
  const { c } = bottomCabin(tick);
  assert.equal(Math.floor(p.arg / WHEEL_SEATS), c, 'в нижней кабинке');
  assert.equal(a.c.profile!.tokens, t0 - WHEEL_PRICE);
  assert.equal(lastOf(a.s, 'tokens')!.n, t0 - WHEEL_PRICE);
  assert.match(lastOf(a.s, 'toast')!.text, /Поехали!/);
  // шаг, прыжок, «встать» — не помогают: везёт колесо
  hold(hub, [a.c], BTN_FORWARD, 20);
  hold(hub, [a.c], BTN_JUMP, 3);
  hub.onJson(a.c, { t: 'unuse' });
  steps(hub, 1);
  assert.equal(p.action, ACT_WHEEL);
  const s = seatAt(p.arg, hub.lobby.tick, { x: 0, y: 0, z: 0, yaw: 0 });
  assert.ok(Math.abs(p.state.x - s.x) < 1e-9 && Math.abs(p.state.y - s.y) < 1e-9 && Math.abs(p.state.z - s.z) < 1e-9, 'сидит на своём месте');
  steps(hub, WHEEL_PERIOD / 2 - 30);
  assert.ok(p.state.y > WHEEL_HUB_Y + WHEEL_R - CABIN_DROP - 0.5, `наверху (${p.state.y.toFixed(2)})`);
  const arrive = wheelArrival(c, tick);
  steps(hub, arrive - hub.lobby.tick - 1);
  assert.equal(p.action, ACT_WHEEL, 'до низа — едет');
  steps(hub, 1);
  assert.equal(p.action, ACT_NONE, 'внизу — вышел');
  assert.ok(Math.hypot(p.state.x - WHEEL_EXIT.x, p.state.z - WHEEL_EXIT.z) < 1.5, 'у выхода');
  assert.match(lastOf(a.s, 'toast')!.text, /Приехали/);
  steps(hub, 30);
  assert.ok(Math.abs(p.state.y - 0.15) < 1e-6, 'стоит на помосте');
});

test('колесо: без 5 🪙 не прокатиться; пятому — ждать следующую кабинку; вышел из игры — место свободно', () => {
  const { hub } = setupHub();
  const poor = login(hub, 'Бедняк');
  poor.c.profile!.tokens = 3;
  useWheel(hub, poor.c);
  assert.equal(lp(hub, poor.c).action, ACT_NONE);
  assert.match(lastOf(poor.s, 'toast')!.text, /5 🪙, а у тебя 3/);
  assert.equal(poor.c.profile!.tokens, 3);

  const ps = ['Раз', 'Два', 'Три', 'Четыре', 'Пять'].map((n, i) => login(hub, n, newKey(), `10.0.1.${i + 1}`));
  for (const q of ps.slice(0, 4)) useWheel(hub, q.c);
  const cab = Math.floor(lp(hub, ps[0].c).arg / WHEEL_SEATS);
  for (const q of ps.slice(0, 4)) assert.equal(Math.floor(lp(hub, q.c).arg / WHEEL_SEATS), cab, 'все в одной кабинке');
  const t5 = ps[4].c.profile!.tokens;
  useWheel(hub, ps[4].c);
  assert.equal(lp(hub, ps[4].c).action, ACT_NONE);
  assert.match(lastOf(ps[4].s, 'toast')!.text, /мест нет — следующая через \d+ с/);
  assert.equal(ps[4].c.profile!.tokens, t5, 'плата не списана');
  steps(hub, CABIN_STEP);
  useWheel(hub, ps[4].c);
  assert.equal(lp(hub, ps[4].c).action, ACT_WHEEL);
  assert.notEqual(Math.floor(lp(hub, ps[4].c).arg / WHEEL_SEATS), cab, 'в следующей кабинке');

  const seat = lp(hub, ps[1].c).arg;
  hub.disconnect(ps[1].c);
  assert.equal(hub.lobby.wheel.seats[seat], 0, 'место освободилось');
});

test('колесо: точка кассы — сразу за катером (номера точек шлют клиенты; новые — только после неё)', () => {
  const map = buildLobby();
  const kinds = map.interact.map((i) => i.kind);
  assert.equal(kinds.indexOf('wheel'), kinds.indexOf('boat') + 1);
  assert.equal(kinds.lastIndexOf('wheel'), kinds.indexOf('wheel'));
});
