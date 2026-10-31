// BANANA: общий трос и крен, заезд через настоящий хаб, возврат из воды и освобождение мест.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  ACT_BANANA, BN_BACK_TICKS, BN_GRACE_TICKS, BN_HALF, BN_POS_N, BN_ROPE, BN_SWIM,
  bnArg, bnChatLine, bnClock, bnHitch, bnLean, bnRiderStep, bnSpeed, bnStep, bnStern, makeBnPose, makeBnRider,
} from '../shared/banana.ts';
import { TICK_RATE, WATER_Y } from '../shared/constants.ts';
import { BOATS } from '../shared/fishboat.ts';
import { FISH_XP_LEVELS } from '../shared/fishprogress.ts';
import { ACT_NONE, ACT_OWNBOAT, isHeld, isRiding } from '../shared/lobby.ts';
import {
  BERTHS, OB_DOCK, OB_GONE_SEA_TICKS, OB_SEA, OB_SUMMON_TICKS, PARK_CENTER, berthLanding, nearestLanding,
} from '../shared/ownboat.ts';
import { BTN_BACK, BTN_FORWARD, BTN_LEFT, BTN_RIGHT } from '../shared/sim.ts';
import { Hub, type Client } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { allOf, lastOf, login, newKey, placeAt, sendInput, type FakeSink } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function isleHub(banana?: boolean, isle = true): Hub {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-bn-'));
  dirs.push(dir);
  const now = (): number => Date.UTC(2026, 9, 31, 12);
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now });
  store.load();
  return new Hub({ store, profiles: new Profiles(store, { now }), smokeToken: 'f'.repeat(64), build: 'test', now, log: () => {}, fish2: true, isle, banana });
}

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

function fisher(hub: Hub, nick: string, owner = false) {
  const a = login(hub, nick, newKey());
  a.c.profile!.fishing.xp = FISH_XP_LEVELS[owner ? 6 : 0];
  if (owner) a.c.profile!.fishing.boats = ['volzhanka'];
  return a;
}

function steps(hub: Hub, n: number, driver?: Client, buttons = 0, rider?: Client): void {
  for (let i = 0; i < n; i++) {
    if (driver) sendInput(hub, driver, buttons);
    if (rider) sendInput(hub, rider, 0);
    hub.step();
  }
}

function summon(hub: Hub, c: Client, berth = 0): void {
  placeAt(hub, c, PARK_CENTER.x, PARK_CENTER.z - 14);
  hub.onJson(c, { t: 'ob', a: 'summon', b: berth, boat: 'volzhanka' });
  steps(hub, OB_SUMMON_TICKS + 2);
}

function useBerth(hub: Hub, c: Client, berth = 0): void {
  const it = hub.lobby.map.interact.find(i => i.kind === 'oboat' && i.arg === berth);
  assert.ok(it);
  placeAt(hub, c, BERTHS[berth].px, BERTHS[berth].pz, BERTHS[berth].py);
  hub.onJson(c, { t: 'use', id: it.id });
  hub.step();
}

function hitch(hub: Hub, c: Client): void {
  hub.onJson(c, { t: 'bn', a: 'hitch' });
  hub.step();
}

function board(hub: Hub, c: Client): void {
  const pos = hub.lobby.bananas!.full().pos;
  assert.equal(pos.length, BN_POS_N);
  placeAt(hub, c, pos[1] + 3, pos[2], WATER_Y);
  hub.onJson(c, { t: 'bn', a: 'board', i: 0 });
  hub.step();
}

function toast(s: FakeSink, text: string): boolean {
  return allOf(s, 'toast').some(m => m.text.includes(text));
}

test('трос на полном ходу и в повороте; A/D удерживают седока, первые две секунды падать нельзя', () => {
  const boat = { x: -180, z: 330, yaw: 0, length: BOATS[0].length };
  const pose = makeBnPose();
  bnHitch(pose, boat);
  const idle = makeBnRider();
  const held = makeBnRider();
  let idleFell = false;
  let heldFell = false;
  let maxLat = 0;
  for (let k = 0; k < 20 * TICK_RATE; k++) {
    if (k >= 10 * TICK_RATE) boat.yaw += BOATS[0].turn / TICK_RATE;
    boat.x -= Math.sin(boat.yaw) * BOATS[0].speed / TICK_RATE;
    boat.z -= Math.cos(boat.yaw) * BOATS[0].speed / TICK_RATE;
    bnStep(pose, boat, 1 / TICK_RATE);
    const stern = bnStern(boat);
    const nose = { x: pose.x - Math.sin(pose.yaw) * BN_HALF, z: pose.z - Math.cos(pose.yaw) * BN_HALF };
    assert.ok(Math.hypot(stern.x - nose.x, stern.z - nose.z) <= BN_ROPE + 0.01, 'трос не растянулся');
    if (k < 10 * TICK_RATE) continue;
    maxLat = Math.max(maxLat, pose.lat);
    const lean = Math.abs(held.tilt) > 0.15 ? -Math.sign(held.tilt) : 0;
    idleFell = bnRiderStep(idle, pose.lat, 0, 0, 0, bnSpeed(pose)) || idleFell;
    heldFell = bnRiderStep(held, pose.lat, lean, 0, 0, bnSpeed(pose)) || heldFell;
  }
  assert.ok(maxLat > 0.3, 'в левом повороте клонит вправо');
  assert.ok(idleFell, 'без кнопок упал за десять секунд поворота');
  assert.equal(heldFell, false, 'противодействие крену удержало седока');
  const grace = makeBnRider();
  for (let k = 0; k < BN_GRACE_TICKS; k++) assert.equal(bnRiderStep(grace, 3, 1, 0.5, 2, 20), false);
  assert.equal(bnLean(BTN_LEFT), -1);
  assert.equal(bnLean(BTN_RIGHT), 1);
  assert.equal(bnLean(BTN_LEFT | BTN_RIGHT), 0);
});

test('итог заезда: лучший первым, время 0:48, меньше пяти секунд — без строки', () => {
  const rows = [{ nick: 'Tester8', best: 31 * TICK_RATE }, { nick: 'Tester9', best: 48 * TICK_RATE }];
  assert.equal(bnClock(48 * TICK_RATE), '0:48');
  assert.equal(bnChatLine('Волжанка', 'Tester7', rows, 3), '🍌 Банан за лодкой «Волжанка» Tester7: дольше всех продержался Tester9 — 0:48 · Tester8 0:31 · падений: 3');
  assert.equal(bnChatLine('Волжанка', 'Tester7', [{ nick: 'Tester8', best: 5 * TICK_RATE - 1 }], 1), null);
  assert.equal(rows[0].nick, 'Tester8', 'исходные результаты не переставлены');
});

test('заезд: прицеп, посадка по близости, падение, E обратно, второе падение и спасение через пять секунд', () => {
  const hub = isleHub(true);
  const a = fisher(hub, 'Tester7', true);
  const b = fisher(hub, 'Tester8');
  summon(hub, a.c);
  useBerth(hub, a.c);
  assert.equal(lp(hub, a.c).action, ACT_OWNBOAT);
  hitch(hub, a.c);
  assert.equal(lastOf(b.s, 'bn')?.b.length, 1);
  assert.ok(allOf(b.s, 'chat').some(m => m.text.includes('прицепил банан')));
  placeAt(hub, b.c, 0, 0);
  hub.onJson(b.c, { t: 'bn', a: 'board', i: 0 });
  assert.equal(lp(hub, b.c).action, ACT_NONE, 'издалека не садится');
  board(hub, b.c);
  const p = lp(hub, b.c);
  assert.equal(p.action, ACT_BANANA);
  assert.equal(p.arg, bnArg(0, 0));
  assert.ok(isHeld(p.action) && isRiding(p.action));
  assert.deepEqual(lastOf(b.s, 'bn')?.b[0].s, [p.slot, 0, 0]);
  hub.onJson(a.c, { t: 'bn', a: 'board', i: 0 });
  assert.equal(lp(hub, a.c).action, ACT_OWNBOAT, 'штурман на свой банан не пересаживается');
  hub.onJson(b.c, { t: 'unuse' });
  hub.onJson(b.c, { t: 'ob', a: 'horn' });
  assert.equal(p.action, ACT_BANANA, 'обычное освобождение не высаживает');
  assert.equal(allOf(a.s, 'obHorn').length, 0, 'сообщения лодки от седока игнорируются');
  const seq = sendInput(hub, b.c, BTN_LEFT);
  hub.step();
  assert.equal(p.inq.ack, seq, 'ввод съеден');
  assert.equal(p.lastInput.buttons, BTN_LEFT);
  assert.equal(p.state.prevButtons, BTN_LEFT);
  sendInput(hub, b.c, 0);
  // Отойти от стоянки задним ходом, повернуть в море и разогнаться; дальше — длинные повороты A/D.
  let driveTick = 0;
  function driveUntilFall(): void {
    for (let k = 0; k < 60 * TICK_RATE && !(p.arg & BN_SWIM); k++, driveTick++) {
      const t = driveTick / TICK_RATE;
      const buttons = t < 8 ? BTN_BACK : t < 10.5 ? BTN_FORWARD | BTN_RIGHT : t < 19 ? BTN_FORWARD
        : BTN_FORWARD | (Math.floor((t - 19) / 10) % 2 === 0 ? BTN_LEFT : BTN_RIGHT);
      steps(hub, 1, a.c, buttons, b.c);
    }
    assert.ok(p.arg & BN_SWIM, 'седок без кнопок упал');
  }
  driveUntilFall();
  assert.equal(lastOf(b.s, 'bnFx')?.a, 'fall');
  assert.ok(toast(a.s, 'Стряхнул Tester8!'));
  const water = { x: p.state.x, z: p.state.z };
  steps(hub, 10, a.c, BTN_FORWARD, b.c);
  assert.equal(p.state.x, water.x, 'упавший остаётся в точке падения');
  assert.equal(p.state.z, water.z);
  assert.equal(p.state.y, WATER_Y - 0.45);
  hub.onJson(b.c, { t: 'bn', a: 'e' });
  assert.equal(p.arg, bnArg(0, 0));
  assert.equal(lastOf(b.s, 'bnFx')?.a, 'back');
  driveUntilFall();
  assert.equal(allOf(b.s, 'bnFx').filter(m => m.a === 'fall').length, 2);
  const at = nearestLanding(p.state.x, p.state.z);
  steps(hub, BN_BACK_TICKS - 1, a.c, BTN_FORWARD, b.c);
  assert.equal(p.action, ACT_BANANA, 'до истечения пяти секунд место занято');
  steps(hub, 1, a.c, BTN_FORWARD, b.c);
  assert.equal(p.action, ACT_NONE);
  assert.ok(Math.abs(p.state.x - at.x) <= 0.3 && p.state.z === at.z, 'Гоша высадил на берег');
  assert.ok(toast(b.s, 'Не успел — тебя выловил Гоша'));
  assert.deepEqual(lastOf(b.s, 'bn')?.b[0].s, [0, 0, 0]);
  assert.ok(allOf(b.s, 'chat').some(m => m.text.includes('дольше всех продержался Tester8')), 'заезд завершён строкой в чат');
});

test('прицеп только у хозяина за штурвалом; три места, E на берег и отцеп у берта', () => {
  const hub = isleHub(true);
  const a = fisher(hub, 'Tester7', true);
  const riders = ['Tester8', 'Tester9', 'Tester10', 'Tester11'].map(nick => fisher(hub, nick));
  summon(hub, a.c);
  hitch(hub, a.c);
  assert.equal(hub.lobby.bananas!.full().b.length, 0, 'хозяин на берегу не цепляет');
  useBerth(hub, a.c);
  hitch(hub, riders[0].c);
  assert.equal(hub.lobby.bananas!.full().b.length, 0, 'чужой не цепляет');
  const boat = hub.lobby.ownboats!.boats[0]!;
  boat.s.v = 4;
  hub.onJson(a.c, { t: 'bn', a: 'hitch' });
  assert.ok(toast(a.s, 'Сбавь ход'));
  boat.s.v = 0;
  hitch(hub, a.c);
  for (const rider of riders) board(hub, rider.c);
  assert.deepEqual(hub.lobby.bananas!.full().b[0].s, riders.slice(0, 3).map(r => lp(hub, r.c).slot));
  assert.equal(lp(hub, riders[3].c).action, ACT_NONE);
  assert.ok(toast(riders[3].s, 'На банане мест нет'));
  hub.onJson(riders[0].c, { t: 'bn', a: 'e' });
  assert.equal(lp(hub, riders[0].c).action, ACT_NONE);
  const at = berthLanding(0);
  assert.equal(lp(hub, riders[0].c).state.z, at.z);
  hitch(hub, a.c);
  assert.equal(hub.lobby.bananas!.full().b.length, 0);
  for (const rider of riders) assert.equal(lp(hub, rider.c).action, ACT_NONE);
  hitch(hub, a.c);
  assert.equal(allOf(a.s, 'chat').filter(m => m.text.includes('прицепил банан')).length, 1, 'повторное приглашение ждёт минуту');
  assert.equal(boat.s.ph, OB_DOCK);
});

test('прыжок, занятое место в воде, выход седока и исчезновение лодки освобождают игроков', () => {
  const hub = isleHub(true);
  const a = fisher(hub, 'Tester7', true);
  const b = fisher(hub, 'Tester8');
  const c = fisher(hub, 'Tester9');
  summon(hub, a.c);
  useBerth(hub, a.c);
  hitch(hub, a.c);
  board(hub, b.c);
  board(hub, c.c);
  const boat = hub.lobby.ownboats!.boats[0]!;
  // Как в ownboat.test: участок открытого моря без береговых коллизий.
  Object.assign(boat.s, { ph: OB_SEA, b: -1, x: -150, z: 300, v: 0 });
  hub.step();
  hub.onJson(b.c, { t: 'bn', a: 'e' });
  assert.equal(lastOf(b.s, 'bnFx')?.a, 'jump');
  assert.ok(lp(hub, b.c).arg & BN_SWIM);
  assert.equal(hub.lobby.bananas!.full().b[0].s[0], lp(hub, b.c).slot, 'упавшее место не свободно');
  hub.onJson(a.c, { t: 'bn', a: 'hitch' });
  assert.ok(toast(a.s, 'На банане сидят — сначала к причалу'));
  assert.equal(toast(a.s, 'Стряхнул'), false, 'прыжок не засчитывается штурману');
  hub.disconnect(c.c);
  assert.equal(hub.lobby.bananas!.full().b[0].s[1], 0, 'выход освободил второе место');
  hub.onJson(b.c, { t: 'bn', a: 'e' });
  hub.disconnect(a.c);
  steps(hub, OB_GONE_SEA_TICKS + 2, undefined, 0, b.c);
  assert.equal(hub.lobby.ownboats!.count, 0);
  assert.equal(hub.lobby.bananas!.full().b.length, 0);
  assert.equal(lp(hub, b.c).action, ACT_NONE);
  assert.ok(toast(b.s, 'Лодка ушла — тебя подбросил Гоша'));
});

test('без BANANA или без ISLE прицеп не работает, сообщений bn* нет', () => {
  for (const [banana, isle] of [[undefined, true], [true, false]] as const) {
    const hub = isleHub(banana, isle);
    const a = fisher(hub, 'Tester7', true);
    assert.equal(hub.lobby.bananas, null);
    if (isle) { summon(hub, a.c); useBerth(hub, a.c); }
    hitch(hub, a.c);
    hub.onJson(a.c, { t: 'bn', a: 'board', i: 0 });
    hub.onJson(a.c, { t: 'bn', a: 'e' });
    steps(hub, 30);
    assert.equal(a.s.msgs.some(m => m.t.startsWith('bn')), false);
  }
});
