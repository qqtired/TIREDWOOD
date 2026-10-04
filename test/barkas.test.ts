// Баркас «Альбатрос» и лодка Семёна «Удалая»: палуба и места рыбалки, пути лодки, рейсы по требованию, 3-й уровень,
// колокол с баркаса, возрождение на палубе, Саня отправляет на пирс к Семёну, матросы Витёк и Колян на палубе не мешают.
// Баркас — на уровне дальнего края регаты, «Удалая» — у хижины Семёна, пути ничего не задевают.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BARKAS, BARKAS_AWNING, BARKAS_BOARD, BARKAS_CREW, BARKAS_DECK_Y, BARKAS_FISH_FIRST, BARKAS_FISH_SPOTS, BARKAS_HOUSE, BARKAS_LANDING_SPOTS,
  BARKAS_RAIL_T, KOLYAN_HALF, SANYA, SANYA_PRICE, SANYA_USE, VITYOK_HALF, barkasHalf, barkasWater,
} from '../shared/barkas.ts';
import { AQUA_MOVERS, AQUA_PIECES } from '../shared/aqua.ts';
import { BOAT_RIDE_TICKS, ridePose } from '../shared/boat.ts';
import { regattaCourse } from '../shared/regattacourse.ts';
import { PLAYER_HALF, PLAYER_HEIGHT, TICK_RATE } from '../shared/constants.ts';
import {
  FE_AWAY, FE_BACK, FE_BOARD, FE_HOME, FE_OUT, FERRY_AWAY, FERRY_BACK_TICKS, FERRY_BOARD_TICKS, FERRY_CALL_TICKS, FERRY_FLOOR_Y,
  FERRY_FULL_TICKS, FERRY_HALF_B, FERRY_HALF_L, FERRY_HOME, FERRY_HOME_BOARD, FERRY_HOME_SPOTS, FERRY_OUT_TICKS, FERRY_SEATS, FERRY_SIGN,
  FERRY_WAIT_TICKS, ferryLocal, ferryPose, ferrySeat,
} from '../shared/ferry.ts';
import { FISH_HOUSE, FISH_ISLAND_COUNT, FISH_PIER_HEAD, FISH_SPOTS, ROULETTE_SPOT, barkasSpotIndex, fishZone } from '../shared/fishplaces.ts';
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

/** Где встать у лодки за хижиной Семёна: юго-западный угол площадки */
const HOME_STAND = { x: -24.1, z: 63.5 } as const;

/** Подойти к лодке у хижины Семёна (arg 0) или к калитке баркаса (arg 1) и нажать E */
function useFerry(hub: Hub, c: Client, arg: number): void {
  const it = hub.lobby.map.interact[ferryId(hub, arg)];
  placeAt(hub, c, arg === 0 ? HOME_STAND.x : it.x, arg === 0 ? HOME_STAND.z : it.z);
  hub.onJson(c, { t: 'use', id: it.id });
}

function near(a: { x: number; z: number }, b: { x: number; z: number }, what: string, eps = 1e-6): void {
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < eps, `${what}: (${a.x}, ${a.z}) ≠ (${b.x}, ${b.z})`);
}

function standable(w: CollisionWorld, x: number, z: number, y: number, why: string): void {
  assert.equal(w.groundBelow(x, y + 0.5, z), y, `${why}: под ногами палуба (${x}, ${z})`);
  assert.ok(!w.overlaps(x - PLAYER_HALF, y + 0.002, z - PLAYER_HALF, x + PLAYER_HALF, y + PLAYER_HEIGHT, z + PLAYER_HALF), `${why}: свободно (${x}, ${z})`);
}

test('баркас: десять мест рыбалки вдоль бортов (прежние восемь — сразу после острова, новые два — в конце; зона barkas), палуба держит, поплавок — в море', () => {
  const map = buildLobby();
  const w = new CollisionWorld(map);
  // прежние восемь мест — с теми же номерами (12…19), два новых — в самом конце списка (после дальних мостков)
  assert.equal(BARKAS_FISH_SPOTS.length, 10);
  assert.equal(BARKAS_FISH_FIRST, 8);
  assert.deepEqual(FISH_SPOTS.slice(FISH_ISLAND_COUNT, FISH_ISLAND_COUNT + 8), BARKAS_FISH_SPOTS.slice(0, 8));
  assert.deepEqual(FISH_SPOTS.slice(-2), BARKAS_FISH_SPOTS.slice(8));
  const barkasIdx = BARKAS_FISH_SPOTS.map((_, i) => barkasSpotIndex(i));
  assert.deepEqual(barkasIdx, [12, 13, 14, 15, 16, 17, 18, 19, 28, 29]);
  for (let i = 0; i < FISH_SPOTS.length; i++) assert.equal(fishZone(i), barkasIdx.includes(i) ? 'barkas' : 'pier');
  const spots = map.interact.filter((i) => i.kind === 'fish' && barkasIdx.includes(i.arg));
  assert.deepEqual(spots.map((i) => i.arg), barkasIdx);
  // точки двух новых мест — в самом конце списка точек (номера прежних точек не меняются)
  assert.deepEqual(map.interact.slice(-2).map((i) => [i.kind, i.arg]), [['fish', 28], ['fish', 29]]);
  // по пять мест у каждого борта
  assert.equal(BARKAS_FISH_SPOTS.filter((s) => s.z < BARKAS.z).length, 5);
  assert.equal(BARKAS_FISH_SPOTS.filter((s) => s.z > BARKAS.z).length, 5);
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
  // баркас и всё на нём — в пределах снимка (±128 м, и прыгнуть за борт есть куда), вдали от острова
  assert.ok(BARKAS.bow > -120 && BARKAS.z + BARKAS.half < 124);
  assert.ok(barkasWater(BARKAS.x, BARKAS.z + 10) && barkasWater(BARKAS.x + 20, BARKAS.z - 12));
  assert.ok(!barkasWater(-20, 45) && !barkasWater(-35, 10) && !barkasWater(-40, 60) && !barkasWater(-19, 66), 'у острова и пирса — не вода баркаса');
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
        assert.ok(Math.abs(q.x) < 120 && Math.abs(q.z) < 126, 'в пределах снимка');
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
  assert.equal(hub.lobby.world.groundBelow(FERRY_HOME.x, 1, FERRY_HOME.z), -Infinity, 'лодки у причала нет — там вода');
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
  // позвонил ещё раз, пока лодка у хижины: не «уже идёт», а «отходит»
  useFerry(hub, a.c, 1);
  assert.match(lastOf(a.s, 'toast')!.text, /Гоша уже слышал колокол — «Удалая» отходит от хижины Семёна, у борта будет через \d+ с/);
  steps(hub, FERRY_CALL_TICKS + FERRY_OUT_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE_AWAY, 'пришла пустой');
  useFerry(hub, a.c, 1);
  const pa = lp(hub, a.c);
  assert.equal(pa.action, ACT_FERRY, 'с баркаса — без уровня и бесплатно');
  near(pa.state, ferrySeat(FERRY_AWAY, 0), 'на банке у калитки');
  steps(hub, FERRY_WAIT_TICKS + FERRY_BACK_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE_HOME);
  assert.equal(pa.action, ACT_NONE);
  near(pa.state, { x: FERRY_HOME_SPOTS[0][0], z: FERRY_HOME_SPOTS[0][1] }, 'у хижины Семёна');
  // за борт у баркаса: матросы вытаскивают на палубу
  placeAt(hub, a.c, BARKAS.x + 8, BARKAS.z - 8, 0);
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
  // с разбега и рывком на север под водой уносит за северный край barkasWater
  const lost = { x: BARKAS.x + 9.4, z: BARKAS.z - 19.5 };
  assert.equal(barkasWater(lost.x, lost.z), false);
  placeAt(hub, a.c, lost.x, lost.z, -1);
  hold(hub, [a.c], 0, 60);
  assert.ok(onDeck(), `на палубе (${pa.state.x}, ${pa.state.z})`);
  assert.equal(pa.state.y, 0);
  // кто прыгнул с пирса у хижины Семёна, того матросы не ловят
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

test('матрос Витёк: на палубе в своём углу, твёрдый; не у мест рыбалки, высадки, калитки, Сани и рулетки; проходы на бак свободны', () => {
  const map = buildLobby();
  const w = new CollisionWorld(map);
  const v = BARKAS_CREW.vityok;
  assert.equal(v.y, BARKAS_DECK_Y, 'стоит на главной палубе, не на крыше рубки');
  assert.ok(Math.abs(v.z - BARKAS.z) + VITYOK_HALF < barkasHalf(v.x) - BARKAS_RAIL_T, 'внутри фальшборта');
  assert.equal(w.groundBelow(v.x, 0.5, v.z), BARKAS_DECK_Y, 'под ногами палуба');
  assert.ok(w.overlaps(v.x - 0.1, 0.4, v.z - 0.1, v.x + 0.1, 1.4, v.z + 0.1), 'сквозь него не пройти');
  const far = (x: number, z: number, d: number, what: string): void => {
    assert.ok(Math.hypot(x - v.x, z - v.z) >= d, `${what} (${x}, ${z}) — дальше ${d} м от матроса`);
  };
  for (const s of BARKAS_FISH_SPOTS) far(s.x, s.z, 1.5, 'место рыбалки');
  for (const [x, z] of BARKAS_LANDING_SPOTS) far(x, z, 1.5, 'высадка');
  far(BARKAS_BOARD.x, BARKAS_BOARD.z, 2, 'калитка');
  far(SANYA_USE.x, SANYA_USE.z, 2, 'у Сани');
  far(SANYA.x, SANYA.z, 2, 'Саня');
  far(ROULETTE_SPOT.x, ROULETTE_SPOT.z, ROULETTE_SPOT.r + 2, 'рулетка');
  const A = BARKAS_AWNING;
  assert.ok(v.x - VITYOK_HALF > A.x1 + 1, 'не под тентом');
  // проходы вдоль бортов рубки на бак (к брашпилю и автомату) свободны во всю длину
  const H = BARKAS_HOUSE;
  const lanes = [(BARKAS.z - BARKAS.half + BARKAS_RAIL_T + H.z0) / 2, (H.z1 + BARKAS.z + BARKAS.half - BARKAS_RAIL_T) / 2];
  for (const z of lanes) for (const x of [H.x0 + 0.5, (H.x0 + H.x1) / 2, H.x1 - 0.5]) standable(w, x, z, 0, 'проход вдоль рубки');
});

test('матрос Колян рыбачит у северного борта: на своём месте в ряду (не на месте игрока), твёрдый, удочка — над водой', () => {
  const map = buildLobby();
  const w = new CollisionWorld(map);
  const k = BARKAS_CREW.kolyan;
  assert.equal(k.y, BARKAS_DECK_Y);
  assert.equal(k.yaw, 0, 'лицом на север, в море');
  assert.ok(k.z < BARKAS.z && Math.abs(k.z - BARKAS.z) + KOLYAN_HALF < barkasHalf(k.x) - BARKAS_RAIL_T, 'у северного борта, внутри фальшборта');
  assert.equal(w.groundBelow(k.x, 0.5, k.z), BARKAS_DECK_Y, 'под ногами палуба');
  assert.ok(w.overlaps(k.x - 0.1, 0.4, k.z - 0.1, k.x + 0.1, 1.4, k.z + 0.1), 'сквозь него не пройти');
  // в ряду мест северного борта, но не на месте игрока: до ближайшего места — шаг ряда
  const north = BARKAS_FISH_SPOTS.filter((s) => s.z < BARKAS.z);
  const gap = Math.min(...north.map((s) => Math.abs(s.x - k.x)));
  assert.ok(gap >= 2.4 && gap <= 2.6, `до соседнего места ${gap} м`);
  for (const s of BARKAS_FISH_SPOTS) assert.ok(Math.hypot(s.x - k.x, s.z - k.z) >= 2.4, `место (${s.x}, ${s.z}) свободно от Коляна`);
  // не под тентом рулетки и не в её круге; проход на бак свободен
  assert.ok(k.x - KOLYAN_HALF > BARKAS_AWNING.x1 + 0.9, 'не под тентом');
  assert.ok(Math.hypot(ROULETTE_SPOT.x - k.x, ROULETTE_SPOT.z - k.z) > ROULETTE_SPOT.r + 1, 'не у стола рулетки');
  for (const x of [BARKAS_AWNING.x1 + 0.3, k.x + 1.2]) standable(w, x, BARKAS.z, 0, 'проход по палубе мимо Коляна');
  // поплавок — за бортом, в воде
  for (const d of [6.5, 8.5]) assert.equal(w.groundBelow(k.x, 5, k.z - d), -Infinity, 'поплавок в воде');
});

test('баркас — на уровне дальнего края регаты: не задевает трассу, аквапарк, «Ласточку», пиратов и гидроплан', () => {
  const c = regattaCourse();
  const t = c.track;
  let far = -Infinity;
  for (let i = 0; i < t.px.length; i++) far = Math.max(far, t.pz[i] + t.hw[i]);
  // дальний край коридора регаты — z ≈ 126; середина баркаса — на её дальней прямой (z 119), снимок — до 128
  assert.ok(Math.abs(BARKAS.z - 119) <= 2 && far - BARKAS.z < 10, `баркас z ${BARKAS.z}, край регаты ${far.toFixed(1)}`);
  const hull = { x0: BARKAS.bow - 1, x1: BARKAS.stern + 1, z0: BARKAS.z - BARKAS.half - 1, z1: BARKAS.z + BARKAS.half + 1 };
  const outside = (x: number, z: number, m: number): boolean => x < hull.x0 - m || x > hull.x1 + m || z < hull.z0 - m || z > hull.z1 + m;
  // коридор регаты (с поплавками по краям) — дальше 20 м
  for (let i = 0; i < t.px.length; i++) assert.ok(outside(t.px[i], t.pz[i], t.hw[i] + 20), 'регата далеко');
  // аквапарк
  for (const p of [...AQUA_PIECES, ...AQUA_MOVERS]) assert.ok(outside(p.x0, p.z0, 10) && outside(p.x1, p.z1, 10), 'аквапарк далеко');
  // «Ласточка»: весь путь — дальше 10 м от корпуса
  const bp = { x: 0, z: 0, yaw: 0 };
  for (let k = 0; k <= BOAT_RIDE_TICKS; k += 6) assert.ok(outside(ridePose(k, bp).x, bp.z, 10), `«Ласточка» (${bp.x.toFixed(1)}, ${bp.z.toFixed(1)})`);
  // пираты ходят восточнее x = −4 (shared/pirates.ts: путь к острову и бегство), гидроплан взлетает и садится у z < 0
  assert.ok(hull.x1 < -4 - 30 && hull.z0 > 30);
});

test('«Удалая» у хижины Семёна: бортом к краю площадки за хижиной, между сваями; посадка, табличка и высадка — рядом', () => {
  const map = buildLobby();
  const w = new CollisionWorld(map);
  const P = FISH_PIER_HEAD;
  const H = FISH_HOUSE;
  // нос на запад, правый борт — к южному краю площадки, по линии свай перед ним (сваи — до z1 + 0,47), корпус — у задней стены хижины
  assert.equal(FERRY_HOME.yaw, Math.PI / 2);
  const north = FERRY_HOME.z - FERRY_HALF_B;
  assert.ok(north - P.z1 >= 0.5 && north - P.z1 <= 0.6, `зазор до площадки ${(north - P.z1).toFixed(2)}`);
  const x0 = FERRY_HOME.x - FERRY_HALF_L;
  const x1 = FERRY_HOME.x + FERRY_HALF_L;
  assert.ok(x0 < H.x0 && x1 > H.x0 && x1 < H.x1, 'корпус — за хижиной, нос — у юго-западного угла');
  // сваи у южного края (shared/maps/lobby.ts: x0 + 0,25, −19, x1 − 0,25; радиус 0,22) — мимо
  for (const px of [P.x0 + 0.25, -19, P.x1 - 0.25]) assert.ok(px + 0.22 < x0 || px - 0.22 > x1, `свая x ${px}`);
  // точка посадки — над носом лодки, достаёт с угла площадки; табличка и места высадки — на площадке, свободны
  standable(w, HOME_STAND.x, HOME_STAND.z, 0, 'у лодки');
  assert.ok(Math.hypot(FERRY_HOME_BOARD.x - HOME_STAND.x, FERRY_HOME_BOARD.z - HOME_STAND.z) < FERRY_HOME_BOARD.r - 0.3, 'с угла площадки — достать');
  assert.ok(Math.abs(FERRY_HOME_BOARD.x - FERRY_HOME.x) < FERRY_HALF_L && Math.abs(FERRY_HOME_BOARD.z - FERRY_HOME.z) < FERRY_HALF_B, 'точка — над лодкой');
  for (const [x, z] of FERRY_HOME_SPOTS) standable(w, x, z, 0, 'высадка у хижины');
  assert.ok(FERRY_SIGN.x > P.x0 && FERRY_SIGN.x < P.x1 && FERRY_SIGN.z > P.z0 && FERRY_SIGN.z < P.z1, 'табличка на площадке');
  // места рыбалки на краях площадки не задеты: до лодки — дальше заброса вбок
  for (const s of FISH_SPOTS.filter((f) => f.x >= P.x0 && f.x <= P.x1 && f.z >= P.z0 && f.z <= P.z1)) {
    assert.ok(Math.hypot(s.x - FERRY_HOME_BOARD.x, s.z - FERRY_HOME_BOARD.z) > 1 + FERRY_HOME_BOARD.r + 0.2, `место (${s.x}, ${s.z}) и посадка`);
    assert.ok(Math.abs(s.z - FERRY_HOME.z) > FERRY_HALF_B + 1.5 || s.x > x1 + 2, `леска места (${s.x}, ${s.z}) не ложится на лодку`);
  }
});

test('пути «Удалой» ничего не задевают: сваи, площадку и хижину, корму баркаса, аквапарк, регату и «Ласточку»', () => {
  const P = FISH_PIER_HEAD;
  const piles = [P.x0 + 0.25, -19, P.x1 - 0.25].map((x) => ({ x, z: P.z1 + 0.25, r: 0.22 }));
  const c = regattaCourse();
  // путь «Ласточки» — ломаной по тикам
  const boat: Array<{ x: number; z: number }> = [];
  for (let k = 0; k <= BOAT_RIDE_TICKS; k += 6) boat.push({ ...ridePose(k, { x: 0, z: 0, yaw: 0 }) });
  const p = { x: 0, z: 0, yaw: 0 };
  let minBoat = Infinity;
  for (const [ph, T] of [[FE_OUT, FERRY_OUT_TICKS], [FE_BACK, FERRY_BACK_TICKS]] as const) {
    for (let t = 0; t <= T; t += 2) {
      ferryPose(ph, 0, t, p);
      for (let lx = -FERRY_HALF_B; lx <= FERRY_HALF_B + 1e-9; lx += FERRY_HALF_B / 2) for (let lz = -FERRY_HALF_L; lz <= FERRY_HALF_L + 1e-9; lz += 0.5) {
        const q = ferryLocal(p, lx, lz);
        for (const s of piles) assert.ok(Math.hypot(q.x - s.x, q.z - s.z) > s.r + 0.03, `тик ${t}: свая (${s.x}) задета`);
        // площадка у хижины и сама хижина: корпус — южнее края
        if (q.x > P.x0 - 0.05 && q.x < P.x1 + 0.05) assert.ok(q.z > P.z1 + 0.04, `тик ${t}: корпус у площадки (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`);
        // корма баркаса: лодка не заходит внутрь корпуса
        assert.ok(!(q.x > BARKAS.bow && q.x < BARKAS.stern + 0.2 && Math.abs(q.z - BARKAS.z) < BARKAS.half + 0.2), `тик ${t}: в корпусе баркаса`);
        for (const a of [...AQUA_PIECES, ...AQUA_MOVERS]) assert.ok(q.x < a.x0 - 5 || q.x > a.x1 + 5 || q.z < a.z0 - 5 || q.z > a.z1 + 5, 'аквапарк');
        if (t % 12 === 0) farFromRegatta(c, q.x, q.z);
        for (const b of boat) minBoat = Math.min(minBoat, Math.hypot(q.x - b.x, q.z - b.z));
      }
    }
  }
  // «Ласточка» (корпус 2,2 м шириной) проходит не ближе 4 м от любой точки корпуса лодки
  assert.ok(minBoat > 4, `до пути «Ласточки» ${minBoat.toFixed(2)} м`);
});

/** Точка дальше 15 м от коридора регаты */
function farFromRegatta(c: ReturnType<typeof regattaCourse>, x: number, z: number): void {
  const t = c.track;
  for (let i = 0; i < t.px.length; i += 4) assert.ok(Math.hypot(x - t.px[i], z - t.pz[i]) > t.hw[i] + 15, 'регата');
}
