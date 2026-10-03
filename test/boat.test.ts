// Катер «Ласточка»: путь поездки, места, посадка (первый платит, остальные бесплатно), отплытие, поездка, возврат.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOAT_BOARD_TICKS, BOAT_FLOOR_Y, BOAT_FULL_TICKS, BOAT_PATH_LEN, BOAT_PRICE, BOAT_RIDE_TICKS, BP_BOARD, BP_DOCK, BP_RIDE, LAUNCH, rideDistance, ridePose, seatAt,
} from '../shared/boat.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { ACT_BOAT, ACT_NONE, ACT_RIDE, ACT_WAVE } from '../shared/lobby.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { BTN_FORWARD, BTN_JUMP } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';
import type { Client, Hub } from '../server/hub.ts';
import { BoatRide } from '../server/lobby/boat.ts';
import { hold, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

function boatId(hub: Hub): number {
  const it = hub.lobby.map.interact.find((i) => i.kind === 'boat');
  assert.ok(it, 'точка катера');
  return it.id;
}

/** Подойти к катеру по причалу и нажать E. */
function useBoat(hub: Hub, c: Client): void {
  placeAt(hub, c, LAUNCH.x, 20.5);
  hub.onJson(c, { t: 'use', id: boatId(hub) });
}

function near(a: { x: number; z: number }, b: { x: number; z: number }, what: string): void {
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6, `${what}: (${a.x}, ${a.z}) ≠ (${b.x}, ${b.z})`);
}

test('путь катера: от причала и обратно к нему, плавно, над водой, в пределах снимка и вдали от поплавков', () => {
  const map = buildLobby();
  const world = new CollisionWorld(map);
  for (const i of map.boatBoxes) world.setEnabled(i, false);
  for (const t of [-10, 0, BOAT_RIDE_TICKS, BOAT_RIDE_TICKS + 100]) {
    const p = ridePose(t);
    near(p, LAUNCH, `тик ${t}: у причала`);
    assert.ok(Math.abs(p.yaw - LAUNCH.yaw) < 1e-9, `тик ${t}: нос — как на стоянке`);
  }
  const prev = ridePose(0);
  const p = { x: 0, z: 0, yaw: 0 };
  for (let t = 1; t <= BOAT_RIDE_TICKS; t++) {
    ridePose(t, p);
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) < 0.08, `тик ${t}: без скачков`);
    let dy = p.yaw - prev.yaw;
    dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    assert.ok(Math.abs(dy) < 0.012, `тик ${t}: поворачивает плавно`);
    Object.assign(prev, p);
    // корпус (по длине — от носа до кормы, по ширине — оба борта) — над водой: ни настила, ни мостков, ни берега;
    // от бордюра причала (z = 22) — с запасом: на повороте корму заносит
    for (const lz of [-3.4, -2.5, -1.5, 0, 1.5, 2.5, 3]) {
      for (const lx of [-1.15, 0, 1.15]) {
        const x = p.x + lx * Math.cos(p.yaw) + lz * Math.sin(p.yaw);
        const z = p.z - lx * Math.sin(p.yaw) + lz * Math.cos(p.yaw);
        if (x > -17 && x < 30) assert.ok(z > 22.1, `тик ${t}: корпус задевает причал (${x.toFixed(2)}, ${z.toFixed(2)})`);
        if (t % 6 !== 0) continue;
        assert.ok(Math.abs(x) < 120 && Math.abs(z) < 120, 'в пределах снимка (±128 м)');
        assert.equal(world.groundBelow(x, 1000, z), -Infinity, `тик ${t}: корпус над водой (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
    if (t % 6 !== 0) continue;
    // рыбаки на мостках забрасывают не дальше x = −9,5
    if (p.z < 46) assert.ok(p.x > -6, `тик ${t}: x ${p.x.toFixed(1)} — близко к поплавкам`);
  }
  // мимо буёв и лодок на воде
  for (const d of map.deco) {
    if (d.kind !== 'buoy' && d.kind !== 'boat') continue;
    for (let t = 0; t <= BOAT_RIDE_TICKS; t += 6) {
      ridePose(t, p);
      assert.ok(Math.hypot(p.x - d.x, p.z - d.z) > (d.kind === 'boat' ? 7 : 3), `тик ${t}: мимо ${d.kind} (${d.x}, ${d.z})`);
    }
  }
});

test('ход катера: разгон 6 с, ровный ход, швартовка 6 с — скорость без рывков', () => {
  assert.equal(rideDistance(0), 0);
  assert.equal(rideDistance(BOAT_RIDE_TICKS / TICK_RATE), BOAT_PATH_LEN);
  let v0 = 0;
  for (let t = 1; t <= BOAT_RIDE_TICKS; t++) {
    const v = (rideDistance(t / TICK_RATE) - rideDistance((t - 1) / TICK_RATE)) * TICK_RATE;
    assert.ok(v >= 0 && Math.abs(v - v0) < 0.05, `тик ${t}: скорость ${v}`);
    v0 = v;
  }
  assert.ok(v0 < 0.05, 'у причала — почти стоит');
});

test('места в катере: капитан за рулём и ещё трое; все заняты — отплытие через 3 с; ушли все — посадка отменяется', () => {
  const b = new BoatRide();
  assert.equal(b.phase, BP_DOCK);
  assert.equal(b.start(7, 'Капитан', 100), 0);
  assert.deepEqual(b.status(), { ph: BP_BOARD, at: 100 + BOAT_BOARD_TICKS, n: 1, nick: 'Капитан' });
  assert.equal(b.take(3, 200), 1);
  assert.equal(b.take(9, 300), 2);
  b.leave(3);
  assert.equal(b.take(4, 400), 1, 'освободившееся место');
  assert.equal(b.at, 100 + BOAT_BOARD_TICKS, 'пока есть места — ждём полные 30 с');
  assert.equal(b.take(5, 500), 3);
  assert.ok(b.full);
  assert.equal(b.at, 500 + BOAT_FULL_TICKS, 'последнее место — отплытие через 3 с');
  assert.equal(b.take(6, 501), -1, 'пятому мест нет');
  assert.equal(b.step(500 + BOAT_FULL_TICKS - 1), null);
  assert.equal(b.step(500 + BOAT_FULL_TICKS), 'depart');
  assert.equal(b.phase, BP_RIDE);
  assert.equal(b.step(b.at + BOAT_RIDE_TICKS - 1), null);
  assert.equal(b.step(b.at + BOAT_RIDE_TICKS), 'arrive');
  assert.equal(b.status().nick, '', 'у причала — ничей');
  b.start(1, 'Одиночка', 1000);
  assert.deepEqual(b.seats, [1, 0, 0, 0], 'новая посадка — с пустыми местами');
  b.leave(1);
  assert.equal(b.step(1000 + BOAT_BOARD_TICKS), 'cancel');
  assert.equal(b.phase, BP_DOCK);
});

test('катер: первый платит 10 🪙 и садится за руль, всем — приглашение в чат; второй садится бесплатно; новичок видит посадку', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Капитан');
  const b = login(hub, 'Матрос');
  const t0 = a.c.profile!.tokens;
  useBoat(hub, a.c);
  const pa = lp(hub, a.c);
  assert.equal(pa.action, ACT_BOAT);
  assert.equal(pa.arg, 0, 'за рулём');
  assert.equal(a.c.profile!.tokens, t0 - BOAT_PRICE);
  assert.equal(lastOf(a.s, 'tokens')!.n, t0 - BOAT_PRICE);
  near(pa.state, seatAt(LAUNCH, 0), 'место у руля');
  assert.equal(pa.state.y, BOAT_FLOOR_Y);
  const invite = lastOf(b.s, 'chat')!;
  assert.ok(invite.sys, 'системная строка в чате');
  assert.match(invite.text, /Капитан заводит катер «Ласточка»: отплытие через 30 с — садись бесплатно/);
  const st = lastOf(b.s, 'boat')!;
  assert.deepEqual([st.ph, st.n, st.nick], [BP_BOARD, 1, 'Капитан']);
  const tb = b.c.profile!.tokens;
  useBoat(hub, b.c);
  assert.equal(lp(hub, b.c).action, ACT_BOAT);
  assert.equal(lp(hub, b.c).arg, 1);
  assert.equal(b.c.profile!.tokens, tb, 'бесплатно');
  assert.equal(lastOf(a.s, 'boat')!.n, 2);
  steps(hub, 30);
  near(lp(hub, b.c).state, seatAt(LAUNCH, 1), 'сидит, пока не шагнёт');
  const c = login(hub, 'Новичок');
  assert.equal(lastOf(c.s, 'lobby')!.boat.ph, BP_BOARD);
  assert.equal(lastOf(c.s, 'lobby')!.boat.nick, 'Капитан');
});

test('катер: без 10 🪙 не уплыть', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Бедняк');
  a.c.profile!.tokens = 5;
  useBoat(hub, a.c);
  assert.equal(lp(hub, a.c).action, ACT_NONE);
  assert.match(lastOf(a.s, 'toast')!.text, /10 🪙, а у тебя 5/);
  assert.equal(hub.lobby.boat.phase, BP_DOCK);
  assert.equal(a.c.profile!.tokens, 5);
});

test('катер: четверо — отплытие через 3 с, пятому мест нет; в поездке везёт сервер и встать нельзя; приплыли — стоят в катере', () => {
  const { hub } = setupHub();
  const ps = ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый'].map((n) => login(hub, n));
  const riders = ps.slice(0, 4).map((p) => p.c);
  for (const c of riders) useBoat(hub, c);
  riders.forEach((c, k) => assert.equal(lp(hub, c).arg, k, 'места по порядку'));
  useBoat(hub, ps[4].c);
  assert.equal(lp(hub, ps[4].c).action, ACT_NONE);
  assert.match(lastOf(ps[4].s, 'toast')!.text, /мест нет/);
  steps(hub, BOAT_FULL_TICKS - 1);
  assert.equal(hub.lobby.boat.phase, BP_BOARD);
  steps(hub, 1);
  assert.equal(hub.lobby.boat.phase, BP_RIDE, 'все сели — через 3 с');
  assert.equal(lastOf(ps[4].s, 'boat')!.ph, BP_RIDE);
  const d = hub.lobby.boat.at;
  for (const c of riders) assert.equal(lp(hub, c).action, ACT_RIDE);
  const w = hub.lobby.world;
  assert.equal(w.groundBelow(LAUNCH.x, 1, LAUNCH.z), -Infinity, 'катера у причала нет — там вода');
  // в катер, которого нет, не сесть: «вернётся через N с»
  useBoat(hub, ps[4].c);
  assert.equal(lp(hub, ps[4].c).action, ACT_NONE);
  assert.match(lastOf(ps[4].s, 'toast')!.text, /вернётся через 60 с/);
  // ни шаг, ни любые кнопки, ни «встать», ни эмоция, ни E не снимают с катера
  hold(hub, riders, BTN_FORWARD | BTN_JUMP, 30);
  hold(hub, riders, 0xffff, 30);
  for (const c of riders) {
    hub.onJson(c, { t: 'unuse' });
    hub.onJson(c, { t: 'emote', e: ACT_WAVE });
    hub.onJson(c, { t: 'use', id: boatId(hub) });
  }
  steps(hub, 600 - 60);
  assert.equal(hub.lobby.tick - d, 600);
  const pose = ridePose(600);
  riders.forEach((c, k) => {
    const p = lp(hub, c);
    assert.equal(p.action, ACT_RIDE);
    near(p.state, seatAt(pose, k), `место ${k} — по пути катера`);
    assert.equal(p.state.y, BOAT_FLOOR_Y);
    assert.equal(p.heldYaw, pose.yaw, 'смотрит по носу');
  });
  steps(hub, BOAT_RIDE_TICKS - 600 - 1);
  assert.equal(hub.lobby.boat.phase, BP_RIDE);
  steps(hub, 1);
  assert.equal(hub.lobby.boat.phase, BP_DOCK, 'через минуту — у причала');
  assert.equal(w.groundBelow(LAUNCH.x, 1, LAUNCH.z), BOAT_FLOOR_Y, 'катер снова твёрдый');
  assert.deepEqual(hub.lobby.boat.seats, [0, 0, 0, 0]);
  riders.forEach((c, k) => {
    const p = lp(hub, c);
    assert.equal(p.action, ACT_NONE, 'встали');
    near(p.state, seatAt(LAUNCH, k), `стоит у места ${k}`);
    assert.equal(p.state.y, BOAT_FLOOR_Y);
  });
  assert.match(lastOf(ps[0].s, 'toast')!.text, /Приплыли/);
  steps(hub, 30);
  assert.equal(lp(hub, riders[1]).state.y, BOAT_FLOOR_Y, 'стоит на полу катера');
  // из катера — прыжком на причал (второе место — у левого борта, причал — на север)
  hold(hub, [riders[1]], BTN_FORWARD | BTN_JUMP, 45, 0);
  const s1 = lp(hub, riders[1]).state;
  assert.ok(s1.z < 21.7 && s1.y >= 0, `на причале: z ${s1.z.toFixed(2)}, y ${s1.y.toFixed(2)}`);
});

test('катер: встал до отплытия — место свободно, E из катера — снова сел; ушли все — посадка отменяется, плата не возвращается', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Передумал');
  const t0 = a.c.profile!.tokens;
  useBoat(hub, a.c);
  hold(hub, [a.c], BTN_FORWARD, 1);
  assert.equal(lp(hub, a.c).action, ACT_NONE);
  assert.equal(hub.lobby.boat.riders, 0);
  assert.equal(lastOf(a.s, 'boat')!.n, 0);
  hub.onJson(a.c, { t: 'use', id: boatId(hub) });
  assert.equal(lp(hub, a.c).action, ACT_BOAT, 'из самого катера — тоже');
  assert.equal(a.c.profile!.tokens, t0 - BOAT_PRICE, 'пока идёт посадка — бесплатно');
  hub.onJson(a.c, { t: 'unuse' });
  assert.equal(lp(hub, a.c).action, ACT_NONE);
  steps(hub, BOAT_BOARD_TICKS);
  assert.equal(hub.lobby.boat.phase, BP_DOCK);
  assert.equal(lastOf(a.s, 'boat')!.ph, BP_DOCK);
  assert.equal(hub.lobby.world.groundBelow(LAUNCH.x, 1, LAUNCH.z), BOAT_FLOOR_Y, 'катер никуда не уплыл');
  assert.equal(a.c.profile!.tokens, t0 - BOAT_PRICE);
});

test('катер: твёрдый; стоял в нём без места — при отплытии на причал; вышел из игры в поездке — место свободно', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Капитан');
  const b = login(hub, 'Зевака');
  const c = login(hub, 'Попутчик');
  useBoat(hub, a.c);
  useBoat(hub, c.c);
  // спрыгнул в кокпит сверху — стоит на полу
  placeAt(hub, b.c, LAUNCH.x - 1.7, LAUNCH.z, 0.5);
  steps(hub, 40);
  assert.equal(lp(hub, b.c).state.y, BOAT_FLOOR_Y);
  steps(hub, BOAT_BOARD_TICKS - 40);
  assert.equal(hub.lobby.boat.phase, BP_RIDE);
  const sb = lp(hub, b.c).state;
  assert.ok(sb.z < 21.7 && sb.y === 0, `на причале: z ${sb.z}, y ${sb.y}`);
  assert.match(lastOf(b.s, 'toast')!.text, /ты на причале/);
  hub.disconnect(c.c);
  assert.equal(hub.lobby.boat.riders, 1);
  assert.equal(lastOf(a.s, 'boat')!.n, 1);
  steps(hub, BOAT_RIDE_TICKS);
  assert.equal(hub.lobby.boat.phase, BP_DOCK);
  assert.equal(lp(hub, a.c).action, ACT_NONE);
});
