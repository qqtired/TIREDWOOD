// Гидроплан «Стриж» (shared/plane.ts, server/lobby/plane.ts): цена и отказ без денег, очередь, полёт по входам пилота,
// пол и потолок, широкий круг с мягким разворотом, автопосадка по времени, «сесть сейчас», выход пилота в полёте,
// позиции всем и точное состояние пилоту, флаг PLANE. Баннер: 50 жетонов, текст как в чате и до 40 знаков, пролёт
// над площадью и берегом без пилота, общая очередь с оплатой при взлёте, раз в 5 минут на игрока, +50 к своему полёту.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE, WATER_Y } from '../shared/constants.ts';
import { ACT_NONE, ACT_PLANE, isHeld, isRiding } from '../shared/lobby.ts';
import { linkNumbered } from '../shared/link.ts';
import {
  BANNER_COOLDOWN_TICKS, BANNER_PRICE, BANNER_TRIP_TICKS, PL_DOCK, PL_FLY, PL_HOME, PL_LAND, PL_START, PLANE_AREA, PLANE_DOCK, PLANE_EXIT, PLANE_FLOAT_Y,
  PLANE_FLY_TICKS, PLANE_HOLD_TICKS, PLANE_LAND_TICKS, PLANE_PRICE, PLANE_SIGN, PLANE_TAKEOFF_TICKS, PLANE_USE, bannerText, copyPlane, makePlane, planeCeil,
  planeEnabled, planeFloor, samePlane, startPlane, stepPlane, wrapAngle, type PlaneState,
} from '../shared/plane.ts';
import { BTN_BACK, BTN_DASH, makeInput } from '../shared/sim.ts';
import { Hub, type Client } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { allOf, connect, lastOf, login, placeAt, sendInput } from './kit.ts';
import { PROTOCOL_VERSION } from '../shared/constants.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** clock.t — часы хаба (можно двигать: частота сообщений считается по ним) */
function planeHub(plane = true, clock = { t: Date.UTC(2026, 9, 1, 12) }): Hub {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-plane-'));
  dirs.push(dir);
  const now = (): number => clock.t;
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now });
  store.load();
  const profiles = new Profiles(store, { now });
  return new Hub({ store, profiles, smokeToken: 'f'.repeat(64), build: 'test', now, log: () => {}, plane });
}

function banner(hub: Hub, c: Client, text: unknown): void {
  hub.onJson(c, { t: 'plane', a: 'banner', text } as never);
}

const chats = (s: { msgs: Array<{ t: string }> }): string[] => allOf(s as never, 'chat').map((m) => (m as { text: string }).text);

function planeId(hub: Hub): number {
  const it = hub.lobby.map.interact.find((i) => i.kind === 'plane');
  assert.ok(it, 'точка самолёта на карте');
  return it.id;
}

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

function usePlane(hub: Hub, c: Client): void {
  placeAt(hub, c, PLANE_USE.x, PLANE_USE.z);
  hub.onJson(c, { t: 'use', id: planeId(hub) });
}

/** n тиков: пилот шлёт вход с курсом yaw (и кнопками), остальные молчат */
function fly(hub: Hub, pilot: Client | null, n: number, yaw = 0, buttons = 0): void {
  for (let i = 0; i < n; i++) {
    if (pilot) sendInput(hub, pilot, buttons, yaw);
    hub.step();
  }
}

const toasts = (s: { msgs: Array<{ t: string }> }): string[] => allOf(s as never, 'toast').map((m) => (m as { text: string }).text);

test('флаг PLANE: «1» — включён, «0» — выключен, без флага — как в разработке; без флага самолёта на набережной нет', () => {
  assert.equal(planeEnabled('1', false), true);
  assert.equal(planeEnabled('0', true), false);
  assert.equal(planeEnabled(undefined, true), true);
  assert.equal(planeEnabled(undefined, false), false);
  const hub = planeHub(false);
  const a = login(hub, 'Tester7');
  assert.equal(lastOf(a.s, 'lobby')?.plane, undefined, 'в приветствии набережной самолёта нет');
  assert.equal(hub.lobby.plane, null);
  const tokens = a.c.profile!.tokens;
  usePlane(hub, a.c);
  hub.step();
  assert.equal(a.c.profile!.tokens, tokens, 'жетоны не тронуты');
  assert.equal(lp(hub, a.c).action, ACT_NONE);
  // столбик таблички без флага — не твёрдый (сверху на нём не стоять)
  assert.ok(hub.lobby.world.groundBelow(PLANE_SIGN.x, 2.5, PLANE_SIGN.z) < 1, 'столбика нет');
  assert.ok(planeHub(true).lobby.world.groundBelow(PLANE_SIGN.x, 2.5, PLANE_SIGN.z) > 1.8, 'с флагом столбик есть');
});

test('посадка: E у самолёта — минус 100 жетонов, пилот в кабине, взлёт; без денег — отказ с причиной', () => {
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  assert.ok(lastOf(a.s, 'lobby')?.plane, 'в приветствии набережной — самолёт');
  a.c.profile!.tokens = 250;
  b.c.profile!.tokens = 60;
  usePlane(hub, b.c);
  hub.step();
  assert.equal(b.c.profile!.tokens, 60, 'без денег не списали');
  assert.ok(toasts(b.s).some((t) => t.includes(`${PLANE_PRICE} 🪙`) && t.includes('60')), `отказ с причиной: ${toasts(b.s).join(' | ')}`);
  assert.equal(hub.lobby.plane!.s.ph as number, PL_DOCK, 'самолёт стоит');
  usePlane(hub, a.c);
  hub.step();
  assert.equal(a.c.profile!.tokens, 150, 'списали 100');
  assert.equal(lastOf(a.s, 'tokens')?.n, 150, 'жетоны — игроку');
  const p = lp(hub, a.c);
  assert.equal(p.action, ACT_PLANE);
  assert.ok(isHeld(ACT_PLANE) && isRiding(ACT_PLANE), 'шагом не встать');
  assert.equal(hub.lobby.plane!.s.ph, PL_START);
  const v = lastOf(b.s, 'plane')?.v;
  assert.ok(v && v.slot === p.slot && v.nick === 'Tester7' && v.ph === PL_START, `все видят пилота: ${JSON.stringify(v)}`);
  // шаг и прыжок не поднимают: пилот летит дальше
  for (let i = 0; i < 30; i++) {
    sendInput(hub, a.c, 1 | 16, 0);
    hub.step();
  }
  assert.equal(p.action, ACT_PLANE);
});

test('один пилот: занятый самолёт — очередь с ожиданием; вернулся — ждёт первого 30 с, чужим E — тоже очередь', () => {
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  const c = login(hub, 'Tester9');
  for (const x of [a, b, c]) x.c.profile!.tokens = 500;
  usePlane(hub, a.c);
  hub.step();
  usePlane(hub, b.c);
  hub.step();
  assert.equal(b.c.profile!.tokens, 500, 'в очередь — бесплатно');
  assert.equal(lp(hub, b.c).action, ACT_NONE);
  const tb = toasts(b.s).at(-1) ?? '';
  assert.ok(tb.includes('1-й в очереди') && tb.includes('Tester7') && /через \d+ (с|мин)/.test(tb), `очередь и ожидание: ${tb}`);
  usePlane(hub, c.c);
  hub.step();
  assert.ok((toasts(c.s).at(-1) ?? '').includes('2-й в очереди'));
  assert.deepEqual(lastOf(a.s, 'plane')?.v.q, ['Tester8', 'Tester9'], 'очередь видят все');
  // долетел: пилот сам садится по времени — у стоянки самолёт ждёт Tester8
  fly(hub, a.c, PLANE_TAKEOFF_TICKS + PLANE_FLY_TICKS + 2);
  assert.equal(hub.lobby.plane!.s.ph, PL_HOME, 'время вышло — автопилот');
  for (let i = 0; i < 200 * TICK_RATE && (hub.lobby.plane!.s.ph as number) !== PL_DOCK; i++) fly(hub, a.c, 1);
  assert.equal(hub.lobby.plane!.s.ph as number, PL_DOCK, 'сел и встал к стоянке');
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'пилот вышел');
  const pa = lp(hub, a.c).state;
  assert.ok(Math.hypot(pa.x - PLANE_EXIT.x, pa.z - PLANE_EXIT.z) < 1e-6 && pa.y === 0, 'на набережной у самолёта');
  assert.ok((toasts(b.s).at(-1) ?? '').includes('Твоя очередь'), 'первому в очереди — зов');
  assert.equal(lastOf(a.s, 'plane')?.v.hold, 'Tester8');
  // чужой (не его очередь) — снова в очередь, не садится
  usePlane(hub, c.c);
  hub.step();
  assert.equal(lp(hub, c.c).action, ACT_NONE);
  assert.ok((toasts(c.s).at(-1) ?? '').includes('ждёт Tester8'));
  // Tester8 пришёл — летит
  usePlane(hub, b.c);
  hub.step();
  assert.equal(lp(hub, b.c).action, ACT_PLANE);
  assert.equal(b.c.profile!.tokens, 400);
});

test('очередь: не пришёл за 30 с — самолёт ждёт следующего', () => {
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  const c = login(hub, 'Tester9');
  for (const x of [a, b, c]) x.c.profile!.tokens = 500;
  usePlane(hub, a.c);
  hub.step();
  usePlane(hub, b.c);
  usePlane(hub, c.c);
  hub.step();
  // пилот попросил сесть сразу
  const seq = sendInput(hub, a.c, 0, 0);
  hub.onJson(a.c, { t: 'plane', a: 'land', at: seq + 1 });
  for (let i = 0; i < 300 * TICK_RATE && (hub.lobby.plane!.s.ph as number) !== PL_DOCK; i++) fly(hub, a.c, 1);
  assert.equal(hub.lobby.plane!.s.ph, PL_DOCK);
  assert.equal(hub.lobby.plane!.debug().hold, 'Tester8');
  fly(hub, null, PLANE_HOLD_TICKS + 1);
  assert.equal(hub.lobby.plane!.debug().hold, 'Tester9', 'очередь перешла');
  assert.ok(toasts(b.s).some((t) => t.includes('не дождался')));
});

test('полёт: мышь ведёт нос, скорость ровная (Shift — быстрее, S — медленнее), пол и потолок держат, круг разворачивает', () => {
  const s = makePlane();
  startPlane(s);
  const inp = makeInput();
  for (let i = 0; i < PLANE_TAKEOFF_TICKS; i++) stepPlane(s, inp, false);
  assert.equal(s.ph, PL_FLY, 'взлетел — управление пилоту');
  assert.ok(s.y > WATER_Y + 10 && Math.abs(s.v - 18) < 0.5, `высота ${s.y}, скорость ${s.v}`);
  // поворот на цель: плавно, с креном в сторону поворота
  inp.yaw = s.yaw + 1;
  let prev = s.yaw;
  for (let i = 0; i < 4 * TICK_RATE; i++) {
    stepPlane(s, inp, false);
    assert.ok(Math.abs(wrapAngle(s.yaw - prev)) < 0.62 / TICK_RATE + 1e-9, 'поворот не резче 0,62 рад/с');
    prev = s.yaw;
    if (i === 40) assert.ok(s.roll > 0.1, `крен влево в левом повороте: ${s.roll}`);
  }
  assert.ok(Math.abs(wrapAngle(s.yaw - inp.yaw)) < 0.2, 'довернул на цель');
  inp.buttons = BTN_DASH;
  for (let i = 0; i < 4 * TICK_RATE; i++) stepPlane(s, inp, false);
  assert.ok(Math.abs(s.v - 27) < 0.01, `Shift — быстрее: ${s.v}`);
  inp.buttons = BTN_BACK;
  for (let i = 0; i < 6 * TICK_RATE; i++) stepPlane(s, inp, false);
  assert.ok(Math.abs(s.v - 11) < 0.01, `S — медленнее: ${s.v}`);
  inp.buttons = 0;
  // пикирование в воду: пол держит, не ниже
  inp.pitch = -0.42;
  let low = Infinity;
  for (let i = 0; i < 20 * TICK_RATE; i++) {
    stepPlane(s, inp, false);
    low = Math.min(low, s.y - planeFloor(s.x, s.z));
  }
  assert.ok(low > -1.5, `пол держит: ниже на ${-low}`);
  assert.ok(s.y > WATER_Y + 8, 'над водой');
  // вверх до потолка
  inp.pitch = 0.42;
  let high = -Infinity;
  for (let i = 0; i < 60 * TICK_RATE; i++) {
    stepPlane(s, inp, false);
    high = Math.max(high, s.y - planeCeil(planeFloor(s.x, s.z)));
  }
  assert.ok(high < 2.01, `потолок держит: выше на ${high}`);
});

test('пол над городом и водой: случайные полёты не уходят ниже пола и за круг; без NaN', () => {
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let worst = Infinity;
  let far = 0;
  const inp = makeInput();
  for (let run = 0; run < 40; run++) {
    const s = makePlane();
    s.ph = PL_FLY;
    s.x = -300 + rnd() * 800;
    s.z = -500 + rnd() * 800;
    s.yaw = rnd() * 6.28 - 3.14;
    s.v = 18;
    s.y = planeFloor(s.x, s.z) + 5 + rnd() * 40;
    for (let t = 0; t < 90 * TICK_RATE; t++) {
      if (t % 90 === 0) {
        inp.yaw = s.yaw + (rnd() - 0.5) * 3;
        inp.pitch = (rnd() - 0.5) * 0.9;
        inp.buttons = rnd() < 0.3 ? BTN_DASH : 0;
      }
      stepPlane(s, inp, false);
      assert.ok(Number.isFinite(s.x + s.y + s.z + s.yaw + s.pitch + s.roll + s.v), 'без NaN');
      worst = Math.min(worst, s.y - planeFloor(s.x, s.z));
      far = Math.max(far, Math.hypot(s.x - PLANE_AREA.x, s.z - PLANE_AREA.z));
    }
  }
  // пол — 30 м над крышами; страховка не пускает ниже него больше чем на 4 м
  assert.ok(worst > -4, `ниже пола на ${-worst} м`);
  assert.ok(far < PLANE_AREA.hard + 60, `улетел за круг: ${far}`);
});

test('граница: летит прямо из круга — сам мягко разворачивается к городу', () => {
  const s = makePlane();
  s.ph = PL_FLY;
  s.x = PLANE_AREA.x + PLANE_AREA.soft - 20;
  s.z = PLANE_AREA.z;
  s.y = 60;
  s.yaw = -Math.PI / 2; // на восток — от центра
  s.v = 18;
  const inp = makeInput();
  let far = 0;
  let maxTurn = 0;
  let prev = s.yaw;
  for (let i = 0; i < 60 * TICK_RATE; i++) {
    inp.yaw = s.yaw; // мышь «тянет» дальше по курсу
    stepPlane(s, inp, false);
    far = Math.max(far, Math.hypot(s.x - PLANE_AREA.x, s.z - PLANE_AREA.z));
    maxTurn = Math.max(maxTurn, Math.abs(wrapAngle(s.yaw - prev)) * TICK_RATE);
    prev = s.yaw;
  }
  assert.ok(far < PLANE_AREA.hard + 40, `не дальше жёсткой границы: ${far}`);
  assert.ok(maxTurn <= 0.62 + 1e-9, 'разворот мягкий');
  assert.ok(Math.hypot(s.x - PLANE_AREA.x, s.z - PLANE_AREA.z) < PLANE_AREA.soft + 40, 'вернулся к городу');
});

test('взлёт и посадка по расписанию: без скачков, над водой (не над набережной), посадка — точно к стоянке', () => {
  const s = makePlane();
  startPlane(s);
  const inp = makeInput();
  let prev: PlaneState = makePlane();
  copyPlane(prev, s);
  for (let i = 0; i < PLANE_TAKEOFF_TICKS + 5; i++) {
    stepPlane(s, inp, false);
    assert.ok(Math.hypot(s.x - prev.x, s.z - prev.z) < 0.6, `взлёт, тик ${i}: без скачков`);
    // корпус и крылья (до 4,7 м от оси) — над водой, западнее берега (x = −30)
    assert.ok(s.x + 4.8 < -30, `взлёт, тик ${i}: над водой (${s.x.toFixed(2)})`);
    if (s.z > 0) assert.ok(s.z < 6.7 - 4.8 || s.x > -34 + 4.8, `взлёт, тик ${i}: мимо аквапарка`);
    copyPlane(prev, s);
  }
  // посадка: просим сразу
  stepPlane(s, inp, true);
  assert.equal(s.ph, PL_HOME);
  let ticks = 0;
  while (s.ph === PL_HOME && ticks < 200 * TICK_RATE) {
    stepPlane(s, inp, false);
    ticks++;
  }
  assert.equal(s.ph, PL_LAND, 'автопилот зашёл на посадку');
  copyPlane(prev, s);
  for (let i = 0; i < PLANE_LAND_TICKS + 2 && s.ph === PL_LAND; i++) {
    stepPlane(s, inp, false);
    if (s.ph !== PL_LAND) break;
    assert.ok(Math.hypot(s.x - prev.x, s.y - prev.y, s.z - prev.z) < 0.6, `посадка, тик ${i}: без скачков`);
    assert.ok(s.y >= PLANE_FLOAT_Y - 1e-9, 'не под водой');
    if (s.y < PLANE_FLOAT_Y + 3) assert.ok(s.x + 4.8 < -30, `посадка, тик ${i}: у воды — западнее берега (${s.x.toFixed(2)})`);
    copyPlane(prev, s);
  }
  assert.equal(s.ph, PL_DOCK);
  assert.ok(Math.hypot(prev.x - PLANE_DOCK.x, prev.z - PLANE_DOCK.z) < 0.6, 'остановился у стоянки');
  assert.ok(Math.abs(wrapAngle(s.yaw - PLANE_DOCK.yaw)) < 1e-9);
});

test('шаг детерминирован: те же входы — то же состояние (предсказание пилота совпадает с сервером)', () => {
  const a = makePlane();
  const b = makePlane();
  startPlane(a);
  startPlane(b);
  const inp = makeInput();
  for (let i = 0; i < PLANE_TAKEOFF_TICKS + 3000; i++) {
    inp.seq = i;
    inp.yaw = Math.fround(Math.sin(i * 0.002) * 2);
    inp.pitch = Math.fround(Math.cos(i * 0.003) * 0.3);
    inp.buttons = i % 700 < 200 ? BTN_DASH : 0;
    stepPlane(a, inp, i > 2500);
    stepPlane(b, inp, i > 2500);
  }
  assert.ok(samePlane(a, b));
});

test('сеть: позиции всем 15 раз в секунду, пилоту — точное состояние с номером входа; «сесть сейчас»', () => {
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  a.c.profile!.tokens = 500;
  usePlane(hub, a.c);
  hub.step();
  b.s.msgs.length = 0;
  fly(hub, a.c, 120);
  const pos = allOf(b.s, 'planePos');
  assert.ok(pos.length >= 28 && pos.length <= 32, `позиций за 2 с: ${pos.length}`);
  assert.equal(pos[0].p.length, 8);
  assert.equal(allOf(b.s, 'planeMe').length, 0, 'чужим точное состояние не шлём');
  const me = lastOf(a.s, 'planeMe');
  assert.ok(me && me.ack > 0 && me.s.ph === PL_START);
  assert.ok(!linkNumbered('planePos') && !linkNumbered('planeMe') && linkNumbered('plane'), 'частые сообщения — вне нумерации сессии');
  // взлетели: «сесть сейчас» с номера следующего входа — автопилот
  fly(hub, a.c, PLANE_TAKEOFF_TICKS);
  assert.equal(hub.lobby.plane!.s.ph, PL_FLY);
  const seq = sendInput(hub, a.c, 0, 0);
  hub.onJson(a.c, { t: 'plane', a: 'land', at: seq + 1 });
  hub.step();
  fly(hub, a.c, 3);
  assert.equal(hub.lobby.plane!.s.ph, PL_HOME);
  // чужой не может посадить
  const hub2 = planeHub();
  const x = login(hub2, 'Tester7');
  const y = login(hub2, 'Tester8');
  x.c.profile!.tokens = 500;
  usePlane(hub2, x.c);
  fly(hub2, x.c, PLANE_TAKEOFF_TICKS + 5);
  hub2.onJson(y.c, { t: 'plane', a: 'land', at: 1 });
  fly(hub2, x.c, 5);
  assert.equal(hub2.lobby.plane!.s.ph, PL_FLY);
});

test('пилот вышел из игры в полёте: самолёт сам летит домой и садится, очередь идёт дальше', () => {
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  a.c.profile!.tokens = 500;
  b.c.profile!.tokens = 500;
  usePlane(hub, a.c);
  hub.step();
  usePlane(hub, b.c);
  fly(hub, a.c, PLANE_TAKEOFF_TICKS + 10 * TICK_RATE);
  assert.equal(hub.lobby.plane!.s.ph, PL_FLY);
  hub.disconnect(a.c);
  fly(hub, null, 2);
  assert.equal(hub.lobby.plane!.debug().pilot, '', 'пилота нет');
  const ph = hub.lobby.plane!.s.ph as number;
  assert.ok(ph === PL_HOME || ph === PL_LAND, 'автопилот домой');
  for (let i = 0; i < 300 * TICK_RATE && (hub.lobby.plane!.s.ph as number) !== PL_DOCK; i++) hub.step();
  assert.equal(hub.lobby.plane!.s.ph as number, PL_DOCK, 'сел без пилота');
  assert.equal(hub.lobby.plane!.debug().hold, 'Tester8', 'очередь дошла до следующего');
});

test('пилот без связи 10 с — автопилот домой', () => {
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  a.c.profile!.tokens = 500;
  usePlane(hub, a.c);
  fly(hub, a.c, PLANE_TAKEOFF_TICKS + 30);
  assert.equal(hub.lobby.plane!.s.ph, PL_FLY);
  fly(hub, null, 11 * TICK_RATE);
  assert.equal(hub.lobby.plane!.s.ph, PL_HOME);
  assert.equal(lp(hub, a.c).action, ACT_PLANE, 'пилот всё ещё в кабине');
});

test('проверочный вход (без профиля) не летает', () => {
  const hub = planeHub();
  const { c } = connect(hub);
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, smoke: 'f'.repeat(64) });
  if (!hub.lobby.playerOf(c)) return;
  usePlane(hub, c);
  hub.step();
  assert.equal(hub.lobby.plane!.s.ph, PL_DOCK);
});

test('баннер: 50 жетонов — самолёт без пилота пролетает над площадью, мостками и берегом с надписью; все видят, строка в чате', () => {
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  a.c.profile!.tokens = 120;
  placeAt(hub, a.c, PLANE_SIGN.x + 1, PLANE_SIGN.z);
  banner(hub, a.c, '  С днём   рождения, Миша! ');
  hub.step();
  assert.equal(a.c.profile!.tokens, 120 - BANNER_PRICE, 'списали 50');
  assert.equal(lastOf(a.s, 'tokens')?.n, 70);
  const pl = hub.lobby.plane!;
  assert.equal(pl.s.ph, PL_START, 'взлетает');
  assert.equal(pl.pilot, null, 'без пилота');
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'заказчик стоит на набережной');
  const v = lastOf(b.s, 'plane')?.v;
  assert.ok(v && v.b === 'С днём рождения, Миша!' && v.bn === 'Tester7' && v.nick === '', `все видят баннер: ${JSON.stringify(v)}`);
  assert.ok(chats(b.s).includes('✈ Tester7 запустил баннер: «С днём рождения, Миша!»'), `строка в чате: ${chats(b.s).join(' | ')}`);
  let plaza = Infinity;
  let pier = Infinity;
  let east = -Infinity;
  let low = Infinity;
  let n = 1;
  for (; n < BANNER_TRIP_TICKS + 60 && (pl.s.ph as number) !== PL_DOCK; n++) {
    hub.step();
    if ((pl.s.ph as number) !== PL_FLY) continue;
    plaza = Math.min(plaza, Math.hypot(pl.s.x, pl.s.z));
    pier = Math.min(pier, Math.hypot(pl.s.x + 19, pl.s.z - 30));
    east = Math.max(east, pl.s.x);
    low = Math.min(low, pl.s.y - planeFloor(pl.s.x, pl.s.z));
  }
  assert.equal(pl.s.ph as number, PL_DOCK, 'вернулся к стоянке');
  assert.ok(Math.abs(n - BANNER_TRIP_TICKS) <= 2, `время пролёта как в оценке: ${n} и ${BANNER_TRIP_TICKS}`);
  assert.ok(BANNER_TRIP_TICKS < 3 * 60 * TICK_RATE, 'пролёт короче 3 минут');
  assert.ok(plaza < 20, `над площадью: ${plaza.toFixed(1)}`);
  assert.ok(pier < 20, `над мостками к маяку: ${pier.toFixed(1)}`);
  assert.ok(east > 90, `вдоль берега на восток: ${east.toFixed(0)}`);
  assert.ok(low > -1, `не ниже пола: ${low.toFixed(2)}`);
  assert.ok(allOf(b.s, 'planePos').length > BANNER_TRIP_TICKS / 6, 'позиции — всем');
  assert.equal(lastOf(b.s, 'plane')?.v.b, '', 'сел — баннер снят');
});

test('баннер: текст как в чате (без управляющих символов) и не длиннее 40 знаков; без денег — отказ с причиной', () => {
  assert.equal(bannerText('  При\u202eвет\u0007   мир  '), 'Привет мир', 'чистка как у чата');
  assert.equal(bannerText(''), null);
  assert.equal(bannerText('   '), null);
  assert.equal(bannerText(42), null, 'не строка');
  assert.equal(bannerText('я'.repeat(40)), 'я'.repeat(40), '40 знаков — можно');
  assert.equal(bannerText('я'.repeat(41)), null, '41 — нельзя');
  assert.equal(bannerText('🎉'.repeat(40)), '🎉'.repeat(40), 'эмодзи — один знак');
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  const c = login(hub, 'Tester9');
  a.c.profile!.tokens = 500;
  banner(hub, a.c, '   ');
  banner(hub, a.c, 'Длинно'.repeat(7));
  hub.step();
  assert.equal(a.c.profile!.tokens, 500, 'не списали');
  assert.equal(hub.lobby.plane!.s.ph, PL_DOCK, 'не взлетел');
  assert.ok(toasts(a.s).filter((t) => t.includes('от 1 до 40 знаков')).length === 2, `отказы: ${toasts(a.s).join(' | ')}`);
  c.c.profile!.tokens = 30;
  banner(hub, c.c, 'Хочу баннер');
  hub.step();
  assert.equal(c.c.profile!.tokens, 30);
  assert.ok((toasts(c.s).at(-1) ?? '').includes(`${BANNER_PRICE} 🪙, а у тебя 30`), `без денег: ${toasts(c.s).at(-1)}`);
  assert.equal(hub.lobby.plane!.s.ph, PL_DOCK);
  b.c.profile!.tokens = 100;
  banner(hub, b.c, 'При\u202eвет\u0000 с   моря');
  hub.step();
  assert.equal(lastOf(a.s, 'plane')?.v.b, 'Привет с моря', 'на полотнище — чистый текст');
  assert.equal(b.c.profile!.tokens, 50);
});

test('баннер в очереди: небо занято — «через ~N», оплата при взлёте; ушёл с набережной — снят без оплаты', () => {
  const hub = planeHub();
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  const c = login(hub, 'Tester9');
  for (const x of [a, b, c]) x.c.profile!.tokens = 500;
  usePlane(hub, a.c);
  hub.step();
  banner(hub, b.c, 'Ура набережной!');
  banner(hub, c.c, 'Привет от Tester9');
  hub.step();
  assert.equal(b.c.profile!.tokens, 500, 'в очереди — без оплаты');
  const tb = toasts(b.s).at(-1) ?? '';
  assert.ok(tb.includes('твой баннер через ~') && /~\d+ (с|мин)/.test(tb), `ожидание: ${tb}`);
  const v = lastOf(a.s, 'plane')!.v;
  assert.deepEqual([v.q, v.qb], [['Tester8', 'Tester9'], [1, 1]], 'очередь с пометкой «баннер»');
  banner(hub, b.c, 'Второй баннер');
  hub.step();
  assert.ok((toasts(b.s).at(-1) ?? '').includes('уже в очереди'), 'второй — нельзя');
  hub.disconnect(c.c);
  hub.step();
  assert.deepEqual(lastOf(a.s, 'plane')!.v.q, ['Tester8'], 'ушёл — из очереди');
  // пилот садится раньше: «сесть сейчас» после взлёта
  fly(hub, a.c, PLANE_TAKEOFF_TICKS + 5);
  hub.onJson(a.c, { t: 'plane', a: 'land', at: 1 });
  for (let i = 0; i < 200 * TICK_RATE && lp(hub, a.c).action === ACT_PLANE; i++) fly(hub, a.c, 1);
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'пилот сел и вышел');
  assert.equal(hub.lobby.plane!.s.ph as number, PL_START, 'сразу следом взлетает баннер');
  assert.equal(b.c.profile!.tokens, 500 - BANNER_PRICE, 'оплата — при взлёте');
  assert.equal(c.c.profile!.tokens, 500, 'ушедшему — ничего не списали');
  assert.equal(lastOf(a.s, 'plane')?.v.b, 'Ура набережной!');
  assert.ok(chats(a.s).includes('✈ Tester8 запустил баннер: «Ура набережной!»'));
});

test('баннер не чаще раза в 5 минут; пилот цепляет баннер к своему полёту за +50, второй — нельзя', () => {
  const clock = { t: Date.UTC(2026, 9, 1, 12) };
  const hub = planeHub(true, clock);
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8');
  a.c.profile!.tokens = 500;
  usePlane(hub, a.c);
  hub.step();
  assert.equal(a.c.profile!.tokens, 400);
  banner(hub, a.c, 'Привет с неба!');
  hub.step();
  assert.equal(a.c.profile!.tokens, 350, 'баннер к полёту — ещё 50');
  const pl = hub.lobby.plane!;
  assert.equal(pl.pilot, lp(hub, a.c), 'пилот тот же');
  assert.equal(lastOf(b.s, 'plane')?.v.b, 'Привет с неба!', 'все видят баннер за самолётом');
  assert.ok(chats(b.s).includes('✈ Tester7 запустил баннер: «Привет с неба!»'));
  banner(hub, a.c, 'Ещё один');
  hub.step();
  assert.equal(a.c.profile!.tokens, 350);
  assert.ok((toasts(a.s).at(-1) ?? '').includes('не чаще раза в 5 минут'), `второй — нельзя: ${toasts(a.s).at(-1)}`);
  fly(hub, a.c, PLANE_TAKEOFF_TICKS + 5);
  hub.onJson(a.c, { t: 'plane', a: 'land', at: 1 });
  for (let i = 0; i < 200 * TICK_RATE && (pl.s.ph as number) !== PL_DOCK; i++) fly(hub, a.c, 1);
  assert.equal(pl.s.ph as number, PL_DOCK);
  clock.t += 5000;
  banner(hub, a.c, 'Пролёт');
  hub.step();
  assert.equal(pl.s.ph as number, PL_DOCK, 'раньше 5 минут — нет');
  assert.ok(/следующий через \d+ (с|мин)/.test(toasts(a.s).at(-1) ?? ''), `сколько ждать: ${toasts(a.s).at(-1)}`);
  for (let i = 0; i < BANNER_COOLDOWN_TICKS; i++) hub.step();
  clock.t += 5000;
  banner(hub, a.c, 'Пролёт');
  hub.step();
  assert.equal(pl.s.ph as number, PL_START, 'через 5 минут — можно');
  assert.equal(a.c.profile!.tokens, 300);
});
