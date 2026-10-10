// Свои лодки (флаг ISLE, shared/fishboat.ts, shared/ownboat.ts, server/lobby/ownboats.ts): покупка у Семёна (уровень,
// жетоны, списывает сервер), вызов к берту стоянки, посадка хозяина и пассажира, якорь — все с удочкой на месте в лодке,
// эхолот; на стоянке не больше 8 лодок (2 места свободны) — уходит та, что дольше стоит без хозяина; хозяин вышел —
// в море лодка уходит через 10 с, пассажира Гоша отвозит к причалу. Старые профили без лодок грузятся как раньше.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { BOATS, boatBuyNote, boatBuyState, ownedBoats } from '../shared/fishboat.ts';
import { BOAT_FISH_FIRST, BOAT_FISH_SPOTS, FISHER_USE } from '../shared/fishplaces.ts';
import { FISH_XP_LEVELS, normalizeFishProgress } from '../shared/fishprogress.ts';
import { ACT_FISH, ACT_NONE, ACT_OWNBOAT, isHeld, isRiding } from '../shared/lobby.ts';
import {
  BERTHS, OB_ANCHORED, OB_DOCK, OB_GONE_SEA_TICKS, OB_SEA, OB_SUMMON_TICKS, PARK_BERTHS, PARK_CENTER, canAnchorAt, makeObState, stepOwnBoat,
} from '../shared/ownboat.ts';
import { BTN_BACK, BTN_FORWARD, makeInput } from '../shared/sim.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { Hub, type Client } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { allOf, lastOf, login, newKey, placeAt, sendInput } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function isleHub(isle = true): Hub {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-ob-'));
  dirs.push(dir);
  const now = (): number => Date.UTC(2026, 9, 10, 12);
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now });
  store.load();
  const profiles = new Profiles(store, { now });
  return new Hub({ store, profiles, smokeToken: 'f'.repeat(64), build: 'test', now, log: () => {}, fish2: true, isle });
}

const toasts = (s: { msgs: Array<{ t: string }> }): string[] => allOf(s as never, 'toast').map((m) => (m as { text: string }).text);

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

/** Рыбак уровня level с лодками boats */
function fisher(hub: Hub, nick: string, level: number, boats: string[] = [], ip = '10.0.0.1') {
  const a = login(hub, nick, newKey(), ip);
  a.c.profile!.fishing.xp = FISH_XP_LEVELS[level];
  if (boats.length) a.c.profile!.fishing.boats = boats;
  return a;
}

function summon(hub: Hub, c: Client, berth: number, boat = 'volzhanka'): void {
  placeAt(hub, c, PARK_CENTER.x, PARK_CENTER.z - 14);
  hub.onJson(c, { t: 'ob', a: 'summon', b: berth, boat } as never);
}

function useBerth(hub: Hub, c: Client, berth: number): void {
  const it = hub.lobby.map.interact.find((i) => i.kind === 'oboat' && i.arg === berth);
  assert.ok(it, 'табличка берта на карте');
  placeAt(hub, c, BERTHS[berth].px, BERTHS[berth].pz);
  hub.onJson(c, { t: 'use', id: it.id });
}

function steps(hub: Hub, n: number, drivers: Client[] = [], buttons = 0): void {
  for (let i = 0; i < n; i++) {
    for (const c of drivers) sendInput(hub, c, buttons, 0);
    hub.step();
  }
}

test('покупка у Семёна: уровень и жетоны с причиной, списывает сервер; старые профили без лодок', () => {
  assert.deepEqual(normalizeFishProgress({}).boats, undefined, 'старый профиль — лодок нет');
  assert.deepEqual(ownedBoats(normalizeFishProgress({ boats: ['northsilver', 'x', 'volzhanka', 'volzhanka'] })), ['volzhanka', 'northsilver']);
  assert.equal(boatBuyNote(BOATS[2], boatBuyState(BOATS[2], [], 8, 99_999), 8, 99_999), 'С 10-го уровня рыбалки (у тебя 8-й)');
  const hub = isleHub();
  const a = fisher(hub, 'Tester7', 6);
  a.c.profile!.tokens = 7000;
  placeAt(hub, a.c, FISHER_USE.x, FISHER_USE.z);
  hub.onJson(a.c, { t: 'fishNpc', npc: 'semyon', a: 'buyBoat', boat: 'albakor' });
  assert.equal(a.c.profile!.tokens, 7000, 'уровня мало — жетоны целы');
  assert.ok(lastOf(a.s, 'fishNpc')?.message?.includes('8-го уровня'), 'причина в окне');
  hub.onJson(a.c, { t: 'fishNpc', npc: 'semyon', a: 'buyBoat', boat: 'volzhanka' });
  assert.equal(a.c.profile!.tokens, 2000, 'списали 5000');
  assert.deepEqual(a.c.profile!.fishing.boats, ['volzhanka']);
  assert.deepEqual(lastOf(a.s, 'fishNpc')?.progress.boats, ['volzhanka'], 'окно видит покупку');
  hub.onJson(a.c, { t: 'fishNpc', npc: 'semyon', a: 'buyBoat', boat: 'volzhanka' });
  assert.equal(a.c.profile!.tokens, 2000, 'вторую такую не продают');
});

test('без флага ISLE лодок нет: вызов не работает, мостков стоянки нет', () => {
  const hub = isleHub(false);
  assert.equal(hub.lobby.ownboats, null);
  const a = fisher(hub, 'Tester7', 10, ['volzhanka']);
  summon(hub, a.c, 0);
  hub.step();
  assert.equal(allOf(a.s, 'ob').length, 0);
});

test('вызов, посадка хозяина и пассажира, якорь: все трое с удочкой, эхолот; подняли якорь — снова на сиденьях', () => {
  const hub = isleHub();
  const a = fisher(hub, 'Tester7', 6, ['volzhanka']);
  const b = fisher(hub, 'Tester8', 3);
  summon(hub, a.c, 0);
  steps(hub, OB_SUMMON_TICKS + 2);
  const ob = hub.lobby.ownboats!;
  const boat = ob.boats[0]!;
  assert.equal(boat.s.ph, OB_DOCK, 'лодка подошла к берту');
  assert.equal(boat.s.b, 0);
  assert.ok(lastOf(b.s, 'ob')?.boats.some((v) => v.nick === 'Tester7'), 'все видят лодку');
  // пассажир раньше хозяина не садится
  useBerth(hub, b.c, 0);
  hub.step();
  assert.equal(lp(hub, b.c).action, ACT_NONE);
  useBerth(hub, a.c, 0);
  hub.step();
  assert.equal(lp(hub, a.c).action, ACT_OWNBOAT);
  assert.ok(isHeld(ACT_OWNBOAT) && isRiding(ACT_OWNBOAT));
  useBerth(hub, b.c, 0);
  hub.step();
  assert.equal(lp(hub, b.c).action, ACT_OWNBOAT, 'пассажир сел');
  assert.equal(lp(hub, b.c).arg, 1, 'место 1');
  // радио лодки (пакет F): у лодки есть радио, хозяин — Tester7, на борту оба
  assert.equal(hub.lobby.radios!.wires().find((w) => w.id === 0)?.owner, a.c.profile!.id, 'у лодки есть радио');
  assert.deepEqual(hub.lobby.radios!.carrier(0)?.aboard, [a.c.profile!.id, b.c.profile!.id]);
  // задним ходом — отошли от берта
  steps(hub, 20, [a.c, b.c], BTN_BACK);
  assert.equal(boat.s.ph, OB_SEA);
  assert.ok(boat.s.v < 0, 'задний ход');
  // в море: якорь
  const at = { x: -120, z: 260 };
  assert.ok(canAnchorAt(at.x, at.z), 'тут можно встать на якорь');
  Object.assign(boat.s, { x: at.x, z: at.z, v: 0 });
  const seq = sendInput(hub, a.c, 0, 0);
  hub.onJson(a.c, { t: 'ob', a: 'anchor', at: seq + 1 } as never);
  steps(hub, 4 * TICK_RATE, [a.c, b.c]);
  assert.equal(boat.s.ph, OB_ANCHORED, 'якорь на дне');
  assert.equal(lp(hub, a.c).action, ACT_FISH);
  assert.equal(lp(hub, a.c).arg, BOAT_FISH_FIRST);
  assert.equal(lp(hub, b.c).arg, BOAT_FISH_FIRST + 1, 'пассажир — со своего места');
  assert.equal(BOAT_FISH_SPOTS[0].zone, 'barkas', 'вдали от острова — пул баркаса');
  assert.equal(BOAT_FISH_SPOTS[0].sonar, BOATS[0].sonar, 'эхолот лодки');
  // сойти в море нельзя
  hub.onJson(b.c, { t: 'unuse' });
  assert.equal(lp(hub, b.c).action, ACT_OWNBOAT, 'с удочки — на сиденье, не в воду');
  hub.onJson(b.c, { t: 'ob', a: 'e' } as never);
  assert.equal(lp(hub, b.c).action, ACT_FISH, 'E на якоре — снова с удочкой');
  // подняли якорь
  const seq2 = sendInput(hub, a.c, 0, 0);
  hub.onJson(a.c, { t: 'ob', a: 'anchor', at: seq2 + 1 } as never);
  steps(hub, 4 * TICK_RATE, [a.c, b.c]);
  assert.equal(boat.s.ph, OB_SEA);
  assert.equal(lp(hub, a.c).action, ACT_OWNBOAT);
  assert.equal(lp(hub, b.c).action, ACT_OWNBOAT);
  // газ вперёд
  steps(hub, 3 * TICK_RATE, [a.c, b.c], BTN_FORWARD);
  assert.ok(boat.s.v > 5, `разгон: ${boat.s.v}`);
  const st = lp(hub, b.c).state;
  assert.ok(Math.hypot(st.x - boat.s.x, st.z - boat.s.z) < 3, 'пассажир едет в лодке');
});

test('стоянка: не больше 8 лодок, 2 места свободны — уходит та, что дольше всех стоит без хозяина', () => {
  const hub = isleHub();
  const players = Array.from({ length: 9 }, (_, i) => fisher(hub, `Tester${10 + i}`, 6, ['volzhanka'], `10.0.1.${i}`));
  for (let i = 0; i < 9; i++) {
    summon(hub, players[i].c, i);
    steps(hub, 3);
  }
  steps(hub, OB_SUMMON_TICKS + 2);
  const ob = hub.lobby.ownboats!;
  const parked = ob.debug().filter((d) => d.b < PARK_BERTHS.length);
  assert.equal(parked.length, 8, 'восемь у стоянки');
  assert.ok(!parked.some((d) => d.nick === 'Tester10'), 'ушла первая (дольше всех без хозяина)');
  assert.ok(toasts(players[0].s).some((t) => t.includes('ушла со стоянки')), 'хозяину — почему');
});

test('хозяин вышел в море — через 10 с лодка уходит, пассажира Гоша отвозит к причалу', () => {
  const hub = isleHub();
  const a = fisher(hub, 'Tester7', 6, ['volzhanka']);
  const b = fisher(hub, 'Tester8', 5);
  summon(hub, a.c, 3);
  steps(hub, OB_SUMMON_TICKS + 2);
  useBerth(hub, a.c, 3);
  hub.step();
  useBerth(hub, b.c, 3);
  hub.step();
  steps(hub, 20, [a.c, b.c], BTN_BACK);
  const boat = hub.lobby.ownboats!.boats[0]!;
  assert.equal(boat.s.ph, OB_SEA);
  hub.disconnect(a.c);
  steps(hub, OB_GONE_SEA_TICKS + 2, [b.c]);
  assert.equal(hub.lobby.ownboats!.count, 0, 'лодка ушла');
  assert.ok(!hub.lobby.radios!.wires().some((w) => w.id === 0), 'радио ушедшей лодки молчит');
  const p = lp(hub, b.c);
  assert.equal(p.action, ACT_NONE, 'пассажир на берегу');
  assert.ok(toasts(b.s).some((t) => t.includes('Гоша')));
});

test('ход лодки: полный ход по таблице, поворот, у берега не проходит сквозь мостки', () => {
  for (const kind of BOATS) {
    const s = makeObState(BOATS.indexOf(kind));
    Object.assign(s, { ph: OB_SEA, x: -150, z: 300, yaw: 0 });
    const inp = makeInput();
    inp.buttons = BTN_FORWARD;
    for (let i = 0; i < (kind.accel + 6) * TICK_RATE; i++) stepOwnBoat(s, inp);
    assert.ok(Math.abs(s.v - kind.speed) < kind.speed * 0.05, `${kind.id}: ${s.v} ≈ ${kind.speed}`);
  }
});
