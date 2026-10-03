// Баркас «Альбатрос» и лодка Семёна «Удалая»: палуба и места рыбалки, пути лодки, рейсы по требованию, 3-й уровень,
// колокол с баркаса, возрождение на палубе, Саня отправляет на пирс к Семёну.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BARKAS, BARKAS_BOARD, BARKAS_FISH_SPOTS, BARKAS_LANDING_SPOTS, BARKAS_RAIL_T, SANYA_PRICE, SANYA_USE, barkasHalf, barkasWater,
} from '../shared/barkas.ts';
import { PLAYER_HALF, PLAYER_HEIGHT, TICK_RATE } from '../shared/constants.ts';
import {
  FE_AWAY, FE_BACK, FE_BOARD, FE_HOME, FE_OUT, FERRY_AWAY, FERRY_BACK_TICKS, FERRY_BOARD_TICKS, FERRY_CALL_TICKS, FERRY_FLOOR_Y,
  FERRY_FULL_TICKS, FERRY_HALF_B, FERRY_HALF_L, FERRY_HOME, FERRY_HOME_SPOTS, FERRY_OUT_TICKS, FERRY_SEATS, FERRY_WAIT_TICKS, ferryLocal,
  ferryPose, ferrySeat,
} from '../shared/ferry.ts';
import { FISH_ISLAND_COUNT, FISH_SPOTS, fishZone } from '../shared/fishplaces.ts';
import { ACT_FERRY, ACT_FERRY_RIDE, ACT_NONE } from '../shared/lobby.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { BTN_FORWARD, BTN_JUMP } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';
import type { Client, Hub } from '../server/hub.ts';
import { FerryRide } from '../server/lobby/ferry.ts';
import { hold, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

function ferryId(hub: Hub, arg: number): number {
  const it = hub.lobby.map.interact.find((i) => i.kind === 'ferry' && i.arg === arg);
  assert.ok(it, `точка лодки ${arg}`);
  return it.id;
}

/** Подойти к лодке у мостков (arg 0) или к калитке баркаса (arg 1) и нажать E */
function useFerry(hub: Hub, c: Client, arg: number): void {
  const it = hub.lobby.map.interact[ferryId(hub, arg)];
  placeAt(hub, c, arg === 0 ? -15 : it.x, it.z);
  hub.onJson(c, { t: 'use', id: it.id });
}

function near(a: { x: number; z: number }, b: { x: number; z: number }, what: string, eps = 1e-6): void {
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < eps, `${what}: (${a.x}, ${a.z}) ≠ (${b.x}, ${b.z})`);
}

function standable(w: CollisionWorld, x: number, z: number, y: number, why: string): void {
  assert.equal(w.groundBelow(x, y + 0.5, z), y, `${why}: под ногами палуба (${x}, ${z})`);
  assert.ok(!w.overlaps(x - PLAYER_HALF, y + 0.002, z - PLAYER_HALF, x + PLAYER_HALF, y + PLAYER_HEIGHT, z + PLAYER_HALF), `${why}: свободно (${x}, ${z})`);
}

test('баркас: восемь мест рыбалки вдоль бортов (в конце списка, зона barkas), палуба держит, поплавок — в море', () => {
  const map = buildLobby();
  const w = new CollisionWorld(map);
  assert.equal(FISH_SPOTS.length, FISH_ISLAND_COUNT + 8);
  assert.deepEqual(FISH_SPOTS.slice(FISH_ISLAND_COUNT), BARKAS_FISH_SPOTS);
  for (let i = 0; i < FISH_SPOTS.length; i++) assert.equal(fishZone(i), i < FISH_ISLAND_COUNT ? 'pier' : 'barkas');
  const spots = map.interact.filter((i) => i.kind === 'fish' && i.arg >= FISH_ISLAND_COUNT);
  assert.deepEqual(spots.map((i) => i.arg), [12, 13, 14, 15, 16, 17, 18, 19]);
  for (const s of BARKAS_FISH_SPOTS) {
    standable(w, s.x, s.z, 0, 'место на баркасе');
    // желейка (радиус до 0,53) и руки с удочкой (до 0,95 м вперёд, ниже планширя) — не в фальшборте
    const toRail = barkasHalf(s.x) - BARKAS_RAIL_T - Math.abs(s.z - BARKAS.z);
    assert.ok(toRail >= 0.95, `место (${s.x}, ${s.z}): до фальшборта ${toRail.toFixed(2)} м`);
    assert.ok(!w.overlaps(s.x - 0.55, 0.002, s.z - 0.55, s.x + 0.55, PLAYER_HEIGHT, s.z + 0.55), `место (${s.x}, ${s.z}): вокруг желейки свободно`);
    for (const d of [6.5, 9.5]) assert.equal(w.groundBelow(s.x - Math.sin(s.yaw) * d, 5, s.z - Math.cos(s.yaw) * d), -Infinity, 'поплавок в воде');
    // зоны точек не наезжают друг на друга: место рыбалки — отдельно от лодки и Сани
    for (const it of map.interact.filter((i) => i.kind !== 'fish' && Math.hypot(i.x - s.x, i.z - s.z) < 20)) {
      assert.ok(Math.hypot(s.x - it.x, s.z - it.z) > 1 + it.r + 0.2, `место (${s.x}, ${s.z}) и ${it.kind}:${it.arg}`);
    }
  }
  for (const [x, z] of BARKAS_LANDING_SPOTS) standable(w, x, z, 0, 'высадка на палубу');
  standable(w, SANYA_USE.x, SANYA_USE.z, 0, 'перед Саней');
  standable(w, BARKAS_BOARD.x, BARKAS_BOARD.z, 0, 'у калитки');
  for (const [x, z] of FERRY_HOME_SPOTS) standable(w, x, z, 0, 'высадка у Семёна');
  // лодка у стоянки твёрдая: на её полу можно стоять, на банке — сидеть
  for (const dock of [FERRY_HOME, FERRY_AWAY]) for (let k = 0; k < FERRY_SEATS; k++) {
    const at = ferrySeat(dock, k);
    if (dock === FERRY_AWAY) for (const i of map.ferryAwayBoxes) w.setEnabled(i, true);
    assert.equal(w.groundBelow(at.x, FERRY_FLOOR_Y + 0.3, at.z), FERRY_FLOOR_Y, 'пол лодки под банкой');
  }
  // баркас и всё на нём — в пределах снимка (±128 м), вдали от острова и пути «Ласточки»
  assert.ok(BARKAS.bow > -120 && BARKAS.z + BARKAS.half < 120);
  assert.ok(barkasWater(BARKAS.x, BARKAS.z + 10) && barkasWater(-40, 60) && !barkasWater(-20, 45) && !barkasWater(-35, 10));
});

test('пути «Удалой»: от стоянки до стоянки, плавно, весь корпус над водой, в пределах снимка; разворот у мостков', () => {
  const map = buildLobby();
  const w = new CollisionWorld(map);
  for (const i of [...map.ferryHomeBoxes, ...map.ferryAwayBoxes]) w.setEnabled(i, false);
  for (const [ph, T, from, to] of [[FE_OUT, FERRY_OUT_TICKS, FERRY_HOME, FERRY_AWAY], [FE_BACK, FERRY_BACK_TICKS, FERRY_AWAY, FERRY_HOME]] as const) {
    near(ferryPose(ph, 0, 0), from, 'начало у стоянки');
    near(ferryPose(ph, 0, T), to, 'конец у стоянки');
    const end = ferryPose(ph, 0, T).yaw - to.yaw;
    assert.ok(Math.abs(end - Math.round(end / (2 * Math.PI)) * 2 * Math.PI) < 1e-9, 'у стоянки — её курсом');
    const prev = ferryPose(ph, 0, 0);
    const p = { x: 0, z: 0, yaw: 0 };
    for (let t = 1; t <= T; t++) {
      ferryPose(ph, 0, t, p);
      assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) < 0.07, `тик ${t}: без скачков`);
      let dy = p.yaw - prev.yaw;
      dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      assert.ok(Math.abs(dy) < 0.025, `тик ${t}: поворачивает плавно (${dy})`);
      Object.assign(prev, p);
      if (t % 3 !== 0) continue;
      for (const lx of [-FERRY_HALF_B, 0, FERRY_HALF_B]) for (const lz of [-FERRY_HALF_L, -1, 0, 1, FERRY_HALF_L]) {
        const q = ferryLocal(p, lx, lz);
        assert.ok(Math.abs(q.x) < 120 && Math.abs(q.z) < 120, 'в пределах снимка');
        assert.equal(w.groundBelow(q.x, 50, q.z), -Infinity, `тик ${t}: корпус над водой (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`);
      }
    }
  }
  // до и после рейса — у стоянок
  near(ferryPose(FE_HOME, 0, 999), FERRY_HOME, 'стоит у Семёна');
  near(ferryPose(FE_BOARD, 0, 999), FERRY_HOME, 'отсчёт у Семёна');
  near(ferryPose(FE_AWAY, 0, 999), FERRY_AWAY, 'у баркаса');
});

test('рейсы по требованию: первый сел — 10 с, полная — 3 с, ушли все — отмена; у баркаса 12 с и назад в любом случае; колокол', () => {
  const f = new FerryRide();
  assert.equal(f.phase, FE_HOME);
  assert.equal(f.step(1000), null, 'пустая лодка стоит сколько угодно');
  assert.equal(f.take(5, 100), 0);
  assert.deepEqual(f.status(), { ph: FE_BOARD, at: 100 + FERRY_BOARD_TICKS, n: 1, c: 0 });
  assert.equal(f.leave(5), true, 'ушёл единственный — отсчёт отменён сразу');
  assert.equal(f.phase, FE_HOME);
  for (let k = 0; k < FERRY_SEATS; k++) assert.equal(f.take(10 + k, 200 + k), k);
  assert.equal(f.at, 205 + FERRY_FULL_TICKS, 'все места — отход через 3 с');
  assert.equal(f.take(99, 206), -1, 'седьмому мест нет');
  assert.equal(f.step(204 + FERRY_FULL_TICKS), null);
  assert.equal(f.step(205 + FERRY_FULL_TICKS), 'depart');
  assert.equal(f.take(99, 300), -1, 'в рейсе не сесть');
  const d = f.at;
  assert.equal(f.step(d + FERRY_OUT_TICKS - 1), null);
  assert.equal(f.step(d + FERRY_OUT_TICKS), 'arrive');
  assert.equal(f.phase, FE_AWAY);
  f.seats.fill(0);
  assert.equal(f.at, d + FERRY_OUT_TICKS + FERRY_WAIT_TICKS);
  assert.equal(f.step(f.at - 1), null);
  assert.equal(f.step(f.at), 'leave', 'пустая — всё равно назад к Семёну');
  const b = f.at;
  // колокол, пока лодка идёт назад: у Семёна сразу отсчёт 3 с — и снова в море, хоть и пустая
  assert.equal(f.call(b + 10), 'soon');
  assert.equal(f.call(b + 11), 'busy');
  assert.equal(f.step(b + FERRY_BACK_TICKS), 'home');
  assert.deepEqual(f.status(), { ph: FE_BOARD, at: b + FERRY_BACK_TICKS + FERRY_CALL_TICKS, n: 0, c: 1 });
  assert.equal(f.step(b + FERRY_BACK_TICKS + FERRY_CALL_TICKS), 'depart');
  assert.equal(f.called, false);
  assert.equal(f.call(f.at + 5), 'coming', 'уже идёт');
  // колокол у пустой лодки у Семёна
  const g = new FerryRide();
  assert.equal(g.call(50), 'soon');
  assert.deepEqual(g.status(), { ph: FE_BOARD, at: 50 + FERRY_CALL_TICKS, n: 0, c: 1 });
  assert.equal(g.step(50 + FERRY_CALL_TICKS), 'depart');
});

test('«Удалая»: в море — с 3-го уровня; сел — отсчёт; в рейсе везёт сервер; на баркасе — на палубе; там 12 с и назад', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Рыбак');
  const b = login(hub, 'Новичок');
  assert.deepEqual(lastOf(a.s, 'lobby')!.ferry, { ph: FE_HOME, at: 0, n: 0, c: 0 });
  useFerry(hub, b.c, 0);
  assert.equal(lp(hub, b.c).action, ACT_NONE, 'новичка не берут');
  assert.match(lastOf(b.s, 'toast')!.text, /с 3-го уровня рыбалки».*У тебя 0-й, ещё 770 опыта/);
  a.c.profile!.fishing.xp = 770;
  useFerry(hub, a.c, 0);
  const pa = lp(hub, a.c);
  assert.equal(pa.action, ACT_FERRY);
  assert.equal(pa.arg, 0);
  near(pa.state, ferrySeat(FERRY_HOME, 0), 'на первой банке');
  assert.equal(pa.state.y, FERRY_FLOOR_Y);
  assert.match(lastOf(a.s, 'toast')!.text, /отход через 10 с/);
  const st = lastOf(b.s, 'ferry')!;
  assert.deepEqual([st.ph, st.n], [FE_BOARD, 1]);
  steps(hub, FERRY_BOARD_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE_OUT);
  assert.equal(pa.action, ACT_FERRY_RIDE);
  assert.equal(hub.lobby.world.groundBelow(FERRY_HOME.x, 1, FERRY_HOME.z), -Infinity, 'лодки у мостков нет — там вода');
  // ни шаг, ни прыжок, ни «встать» не снимают с лодки; везёт по пути
  hold(hub, [a.c], BTN_FORWARD | BTN_JUMP, 60);
  hub.onJson(a.c, { t: 'unuse' });
  steps(hub, 240);
  const pose = ferryPose(FE_OUT, hub.lobby.ferry.at, hub.lobby.tick);
  assert.equal(pa.action, ACT_FERRY_RIDE);
  near(pa.state, ferrySeat(pose, 0), 'место — по пути лодки', 1e-9);
  steps(hub, FERRY_OUT_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE_AWAY);
  assert.equal(pa.action, ACT_NONE);
  assert.equal(pa.state.y, 0, 'на палубе');
  near(pa.state, { x: BARKAS_LANDING_SPOTS[0][0], z: BARKAS_LANDING_SPOTS[0][1] }, 'высадка у кормы');
  assert.match(lastOf(a.s, 'toast')!.text, /Приплыли на «Альбатрос»/);
  // по палубе можно ходить: шаг вперёд — и стоит на досках
  hold(hub, [a.c], BTN_FORWARD, 20, Math.PI / 2);
  assert.equal(pa.state.y, 0);
  assert.ok(pa.state.x < BARKAS_LANDING_SPOTS[0][0] - 0.5, 'идёт по палубе на запад');
  steps(hub, FERRY_WAIT_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE_BACK, 'никто не сел — всё равно назад');
  steps(hub, FERRY_BACK_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE_HOME);
});

test('с баркаса: колокол зовёт пустую лодку; обратно — высадка у Семёна; упал за борт — снова на палубе', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Моряк');
  placeAt(hub, a.c, BARKAS_LANDING_SPOTS[1][0], BARKAS_LANDING_SPOTS[1][1]);
  useFerry(hub, a.c, 1);
  assert.match(lastOf(a.s, 'toast')!.text, /Гоша услышал — «Удалая» будет у борта через \d+ с/);
  assert.deepEqual(lastOf(a.s, 'ferry'), { t: 'ferry', ph: FE_BOARD, at: hub.lobby.tick + FERRY_CALL_TICKS, n: 0, c: 1 });
  // позвонил ещё раз, пока лодка у мостков: не «уже идёт», а «отходит»
  useFerry(hub, a.c, 1);
  assert.match(lastOf(a.s, 'toast')!.text, /Гоша уже слышал колокол — «Удалая» отходит от мостков Семёна, у борта будет через \d+ с/);
  steps(hub, FERRY_CALL_TICKS + FERRY_OUT_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE_AWAY, 'пришла пустой');
  useFerry(hub, a.c, 1);
  const pa = lp(hub, a.c);
  assert.equal(pa.action, ACT_FERRY, 'с баркаса — без уровня и бесплатно');
  near(pa.state, ferrySeat(FERRY_AWAY, 0), 'на банке у калитки');
  steps(hub, FERRY_WAIT_TICKS + FERRY_BACK_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE_HOME);
  assert.equal(pa.action, ACT_NONE);
  near(pa.state, { x: FERRY_HOME_SPOTS[0][0], z: FERRY_HOME_SPOTS[0][1] }, 'на мостках у Семёна');
  // за борт у баркаса: матросы вытаскивают на палубу
  placeAt(hub, a.c, -52, 60, 0);
  hold(hub, [a.c], 0, 90);
  assert.ok(BARKAS_LANDING_SPOTS.some(([x, z]) => Math.hypot(pa.state.x - x, pa.state.z - z) < 1e-6), `на палубе (${pa.state.x}, ${pa.state.z})`);
  assert.equal(pa.state.y, 0);
});

test('за борт с палубы: под водой унесло за край воды баркаса — всё равно на палубу; с мостков туда же — к аквапарку', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Ныряльщик');
  const pa = lp(hub, a.c);
  const onDeck = () => BARKAS_LANDING_SPOTS.some(([x, z]) => Math.hypot(pa.state.x - x, pa.state.z - z) < 1e-6);
  placeAt(hub, a.c, BARKAS_LANDING_SPOTS[2][0], BARKAS_LANDING_SPOTS[2][1]);
  hold(hub, [a.c], 0, 10);
  assert.equal(pa.state.grounded, 1, 'стоит на палубе');
  // с разбега и рывком на север под водой уносит за z = 50 — край barkasWater
  const lost = { x: -50.6, z: 48.5 };
  assert.equal(barkasWater(lost.x, lost.z), false);
  placeAt(hub, a.c, lost.x, lost.z, -1);
  hold(hub, [a.c], 0, 60);
  assert.ok(onDeck(), `на палубе (${pa.state.x}, ${pa.state.z})`);
  assert.equal(pa.state.y, 0);
  // кто прыгнул с мостков Семёна, того матросы не ловят
  placeAt(hub, a.c, FERRY_HOME_SPOTS[0][0], FERRY_HOME_SPOTS[0][1]);
  hold(hub, [a.c], 0, 10);
  assert.equal(pa.state.grounded, 1, 'стоит на мостках');
  placeAt(hub, a.c, lost.x, lost.z, -1);
  hold(hub, [a.c], 0, 60);
  assert.ok(!onDeck() && !barkasWater(pa.state.x, pa.state.z), `не на баркасе (${pa.state.x}, ${pa.state.z})`);
});

test('Саня: за 250 🪙 — на пирс к Семёну (действие ferry разговора fisheco); далеко или без денег — нет; E у прилавка — говорит Саня', () => {
  const { hub, clock } = setupHub({ fish2: true });
  const a = login(hub, 'Турист');
  const ferry = { t: 'fishNpc', npc: 'sanya', a: 'ferry' } as const;
  hub.onJson(a.c, ferry);
  assert.equal(lastOf(a.s, 'fishNpc')!.message, 'Подойди к Сане на баркасе');
  assert.equal(lastOf(a.s, 'fishNpc')!.open, false);
  assert.equal(lastOf(a.s, 'barkasHome'), undefined, 'издали до Сани не доходит');
  placeAt(hub, a.c, SANYA_USE.x, SANYA_USE.z);
  a.c.profile!.tokens = SANYA_PRICE - 1;
  steps(hub, 60);
  clock.now += 1500;
  hub.onJson(a.c, ferry);
  assert.equal(lastOf(a.s, 'barkasHome')!.ok, false);
  assert.match(lastOf(a.s, 'barkasHome')!.message, /250 🪙, а у тебя 249/);
  assert.match(lastOf(a.s, 'fishNpc')!.message!, /250 🪙, а у тебя 249/, 'причина — в окне разговора');
  assert.equal(a.c.profile!.tokens, SANYA_PRICE - 1);
  const sanya = hub.lobby.map.interact.find((i) => i.kind === 'fisher' && i.arg === 1)!;
  hub.onJson(a.c, { t: 'use', id: sanya.id });
  assert.equal(lastOf(a.s, 'fishNpc')!.npc, 'sanya');
  assert.equal(lastOf(a.s, 'fishNpc')!.open, true);
  a.c.profile!.tokens = 1000;
  clock.now += 1500;
  hub.onJson(a.c, ferry);
  assert.equal(lastOf(a.s, 'barkasHome')!.ok, true);
  assert.equal(a.c.profile!.tokens, 1000 - SANYA_PRICE);
  assert.equal(lastOf(a.s, 'tokens')!.n, 1000 - SANYA_PRICE);
  const p = lp(hub, a.c).state;
  assert.ok(FERRY_HOME_SPOTS.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 1e-6), 'на мостках у стоянки лодки');
  assert.equal(TICK_RATE, 60);
});
