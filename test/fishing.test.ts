// Рыбалка с мостков: что клюёт и почём, сроки; места, заброс, пробы и поклёвка, подсечка вовремя, рано (на пробе)
// и поздно — с поправкой на пинг; улов в альбом (новый вид — бонус, рекорд) или на продажу, сам — если ушёл с места
// или не выбрал; редкий улов — в общий чат; альбом в хранилище.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import {
  CAST_TICKS, FE_BITE, FE_CAST, FE_DONE, FE_EARLY, FE_HOOK, FE_LAND, FE_MISS, FE_NIBBLE, FE_OFF, FISH, FP_BITE, FP_HOLD, FP_IDLE, FP_REEL,
  FP_WAIT, GOLDFISH, HOLD_TICKS, NEW_BONUS, WAIT_MAX, WAIT_MIN, fishPrice, fmtWeight, hookTicks, planBite, reelTicks, rollCatch,
  sanitizeAlbum,
} from '../shared/fishing.ts';
import { ACT_FISH, ACT_NONE } from '../shared/lobby.ts';
import { FISH_SPOTS, type Interactable } from '../shared/maps/lobby.ts';
import { makeRng } from '../shared/math.ts';
import type { LobbyEvent } from '../shared/messages.ts';
import { BTN_FORWARD, BTN_JUMP } from '../shared/sim.ts';
import { normalizeProfile } from '../server/store.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, hold, lastOf, login, placeAt, setupHub, steps, type FakeSink } from './kit.ts';

const sp = (id: string): number => FISH.findIndex((f) => f.id === id);

// ------------------------------------------------------------ таблицы

test('улов: частоты в сумме 1000, ключи разные, вес и цена — в границах вида, тяжёлые попадаются реже', () => {
  assert.equal(FISH.reduce((s, f) => s + f.w, 0), 1000);
  assert.equal(new Set(FISH.map((f) => f.id)).size, FISH.length);
  const rng = makeRng(7);
  const count = new Array<number>(FISH.length).fill(0);
  const light = new Array<number>(FISH.length).fill(0);
  const N = 200_000;
  for (let i = 0; i < N; i++) {
    const c = rollCatch(rng);
    const f = FISH[c.sp];
    count[c.sp]++;
    assert.ok(c.g >= f.g[0] && c.g <= f.g[1], `${f.name}: ${c.g} г`);
    const p = fishPrice(c.sp, c.g);
    assert.ok(p >= f.price[0] && p <= f.price[1], `${f.name}: ${p} 🪙`);
    if (c.g < (f.g[0] + f.g[1]) / 2) light[c.sp]++;
  }
  FISH.forEach((f, i) => {
    assert.ok(Math.abs(count[i] / N - f.w / 1000) < 0.003, `${f.name}: ${count[i] / N} против ${f.w / 1000}`);
    // виды рыбалки 2.0 старой рыбалке не попадаются (w = 0)
    if (f.w > 0) assert.ok(light[i] > count[i] * 0.6, `${f.name}: лёгких больше половины`);
  });
  // цена растёт с весом, золотая рыбка — всегда 50, хлам — даром
  const m = sp('mullet');
  assert.ok(fishPrice(m, FISH[m].g[1]) > fishPrice(m, FISH[m].g[0]));
  assert.equal(fishPrice(GOLDFISH, 300), 50);
  assert.equal(fishPrice(sp('boot'), 900), 0);
});

test('сроки: пробы — после приземления и до поклёвки, окно подсечки растёт с пингом (до 600 мс), вываживание 1,2–3,2 с', () => {
  const rng = makeRng(3);
  let withNibbles = 0;
  for (let i = 0; i < 2000; i++) {
    const p = planBite(rng);
    assert.ok(p.bite >= WAIT_MIN && p.bite < WAIT_MAX);
    let prev = 0;
    for (const t of p.nibbles) {
      assert.ok(t > TICK_RATE && t > prev && t < p.bite - Math.round(0.6 * TICK_RATE), `проба ${t}, поклёвка ${p.bite}`);
      prev = t;
    }
    if (p.nibbles.length > 0) withNibbles++;
  }
  assert.ok(withNibbles > 1400 && withNibbles < 1800, `с пробами — почти всегда: ${withNibbles}`);
  assert.equal(hookTicks(0, 0), 62, 'обычная: 1 с и два тика на рассылку');
  assert.equal(hookTicks(0, 300), 80);
  assert.equal(hookTicks(0, 5000), hookTicks(0, 600), 'пинг больше 600 мс окно не тянет');
  assert.ok(hookTicks(4, 0) < hookTicks(0, 0), 'легенду подсекать быстрее');
  assert.equal(reelTicks(30), Math.round(1.2 * TICK_RATE));
  assert.equal(reelTicks(40000), Math.round(3.2 * TICK_RATE));
  assert.equal(fmtWeight(85), '85 г');
  assert.equal(fmtWeight(1240), '1,24 кг');
  assert.equal(fmtWeight(12400), '12,4 кг');
});

test('альбом из хранилища: только известные виды и целые числа; переживает сохранение', () => {
  assert.deepEqual(sanitizeAlbum({ goby: [210, 3], whale: [9e6, 1], scad: ['x', 1], ray: [5000.7, 2.2], boot: [0, 1] }), { goby: [210, 3], ray: [5000, 2] });
  assert.deepEqual(sanitizeAlbum(null), {});
  const p = normalizeProfile({ id: 1, nick: 'Рыбак', album: { mullet: [1240, 2] } });
  assert.deepEqual(p?.album, { mullet: [1240, 2] });
  assert.deepEqual(normalizeProfile({ id: 2, nick: 'Старый' })?.album, {}, 'старые профили — с пустым альбомом');
});

// ------------------------------------------------------------ на мостках

function spotIt(hub: Hub, spot: number): Interactable {
  const it = hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === spot);
  assert.ok(it, `место рыбалки ${spot}`);
  return it;
}

/** События рыбалки, которые получил игрок: [событие, место, a, b]. */
function fishEvents(s: FakeSink): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (const m of s.msgs) if (m.t === 'lev') for (const e of m.e as LobbyEvent[]) if (e[0] === 'fish') out.push([e[1], e[2], e[3], e[4]]);
  return out;
}

/** Рыбак на месте spot; rand всегда 0,5 (заброс на 8 м прямо, поклёвка через 12 с, одна проба); попадается what. */
function fisher(what: { sp: number; g: number } = { sp: sp('mullet'), g: 900 }, spot = 0) {
  const env = setupHub();
  const { hub } = env;
  const a = login(hub, 'Рыбак');
  const it = spotIt(hub, spot);
  placeAt(hub, a.c, it.x, it.z);
  hub.onJson(a.c, { t: 'use', id: it.id });
  const hall = hub.lobby.fishing;
  hall.rand = () => 0.5;
  hall.roll = () => what;
  const p = hub.lobby.playerOf(a.c)!;
  return { ...env, a, it, hall, p };
}

/** Шагать, пока не придёт событие kind (не дольше max тиков); номер события поплавка в нём. */
function until(hub: Hub, s: FakeSink, kind: number, max = 30 * TICK_RATE): [number, number, number, number] {
  for (let i = 0; i < max; i++) {
    const e = fishEvents(s).find((x) => x[0] === kind);
    if (e) return e;
    hub.step();
  }
  assert.fail(`не дождались события ${kind}`);
}

function cast(hub: Hub, c: Client): void {
  hub.onJson(c, { t: 'fish', a: 'cast' });
}

test('место рыбалки: E — встал с удочкой лицом к воде; занято — нельзя; шаг — ушёл, место свободно', () => {
  const { hub, a, it, hall, p } = fisher();
  assert.equal(p.action, ACT_FISH);
  assert.equal(p.arg, 0);
  assert.equal(p.heldYaw, FISH_SPOTS[0].yaw);
  assert.equal(hall.occupant(0), p.slot);
  const b = login(hub, 'Второй');
  placeAt(hub, b.c, it.x + 0.3, it.z);
  hub.onJson(b.c, { t: 'use', id: it.id });
  assert.equal(hub.lobby.playerOf(b.c)!.action, ACT_NONE);
  assert.match(lastOf(b.s, 'toast')!.text, /уже рыбачат/);
  // пробел (прыжок) с места не поднимает, шаг — поднимает
  hold(hub, [a.c], 0, 1);
  hold(hub, [a.c], BTN_JUMP, 3);
  assert.equal(p.action, ACT_FISH, 'прыжок не поднимает');
  hold(hub, [a.c], BTN_FORWARD, 2);
  assert.equal(p.action, ACT_NONE);
  assert.equal(hall.occupant(0), 0);
  steps(hub, 2);
  assert.deepEqual(fishEvents(a.s).at(-1), [FE_OFF, 0, 0, 0]);
});

test('заброс → проба → поклёвка → подсёк вовремя → тянем → в руках; в альбом — новый вид и бонус', () => {
  const { hub, a, hall, p } = fisher({ sp: sp('mullet'), g: 900 });
  const before = a.c.profile!.tokens;
  cast(hub, a.c);
  const c = until(hub, a.s, FE_CAST);
  // поплавок — в воде, западнее мостков, в 8 м
  assert.ok(Math.abs(c[2] - (FISH_SPOTS[0].x - 8)) < 0.01 && Math.abs(c[3] - FISH_SPOTS[0].z) < 0.01, `${c[2]}, ${c[3]}`);
  const nib = until(hub, a.s, FE_NIBBLE);
  assert.equal(nib[2], 1, 'проба — событие поплавка №1');
  assert.equal(hall.phase(0), FP_WAIT);
  const bite = until(hub, a.s, FE_BITE);
  assert.equal(bite[2], 2, 'поклёвка — №2');
  assert.equal(hall.phase(0), FP_BITE);
  hub.onJson(a.c, { t: 'fish', a: 'hook', n: 2 });
  assert.equal(hall.phase(0), FP_REEL);
  assert.deepEqual(until(hub, a.s, FE_HOOK), [FE_HOOK, 0, sp('mullet'), 900]);
  until(hub, a.s, FE_LAND);
  assert.equal(hall.phase(0), FP_HOLD);
  const card = lastOf(a.s, 'fishCatch')!;
  assert.deepEqual(card, { t: 'fishCatch', sp: sp('mullet'), g: 900, price: fishPrice(sp('mullet'), 900), fresh: true, record: false, best: 0 });
  assert.equal(a.c.profile!.stats.fsCaught, 1);
  hub.onJson(a.c, { t: 'fish', a: 'keep' });
  assert.equal(hall.phase(0), FP_IDLE);
  assert.deepEqual(a.c.profile!.album, { mullet: [900, 1] });
  assert.equal(a.c.profile!.tokens, before + NEW_BONUS[FISH[sp('mullet')].rarity], 'новый вид — бонус');
  assert.match(lastOf(a.s, 'toast')!.text, /Новый вид в альбоме: Кефаль, 900 г · \+10/);
  assert.deepEqual(lastOf(a.s, 'me')!.album, { mullet: [900, 1] }, 'альбом — в профиль клиента');
  steps(hub, 2);
  assert.deepEqual(fishEvents(a.s).at(-1), [FE_DONE, 0, 1, 0]);
  assert.equal(p.action, ACT_FISH, 'удочка в руках — можно снова');
});

test('рано: подсёк на пробе — сорвалась; без проб — просто смотал; на поклёвку, которую ещё не видел, — тоже рано', () => {
  const { hub, a, hall } = fisher();
  cast(hub, a.c);
  until(hub, a.s, FE_NIBBLE);
  hub.onJson(a.c, { t: 'fish', a: 'hook', n: 1 });
  assert.equal(hall.phase(0), FP_IDLE);
  assert.deepEqual(until(hub, a.s, FE_EARLY), [FE_EARLY, 0, 1, 0], 'сорвалась на пробе');
  a.s.msgs.length = 0;
  cast(hub, a.c);
  until(hub, a.s, FE_CAST);
  steps(hub, CAST_TICKS + 5);
  hub.onJson(a.c, { t: 'fish', a: 'hook', n: 0 });
  assert.deepEqual(until(hub, a.s, FE_EARLY), [FE_EARLY, 0, 0, 0], 'без проб — смотал');
  a.s.msgs.length = 0;
  cast(hub, a.c);
  until(hub, a.s, FE_BITE);
  // жал на пробу (видел №1), а пришло, когда уже клюнуло
  hub.onJson(a.c, { t: 'fish', a: 'hook', n: 1 });
  assert.deepEqual(until(hub, a.s, FE_EARLY), [FE_EARLY, 0, 1, 0]);
  assert.equal(a.c.profile!.stats.fsCaught, 0);
});

test('поздно: окно подсечки прошло — ушла; пинг окно растягивает', () => {
  // кефаль — необычная: без пинга окно 0,9 с
  const r = FISH[sp('mullet')].rarity;
  const one = fisher();
  cast(one.hub, one.a.c);
  until(one.hub, one.a.s, FE_BITE);
  steps(one.hub, hookTicks(r, 0) + 1);
  assert.deepEqual(until(one.hub, one.a.s, FE_MISS), [FE_MISS, 0, 0, 0]);
  one.hub.onJson(one.a.c, { t: 'fish', a: 'hook', n: 2 });
  assert.equal(one.hall.phase(0), FP_IDLE, 'опоздавшая подсечка ничего не делает');

  // пинг 300 мс: та же задержка подсечки — ещё успел
  const two = fisher();
  two.a.c.ping = 300;
  cast(two.hub, two.a.c);
  until(two.hub, two.a.s, FE_BITE);
  steps(two.hub, hookTicks(r, 0) + 1);
  assert.equal(two.hall.phase(0), FP_BITE, 'окно ещё открыто');
  two.hub.onJson(two.a.c, { t: 'fish', a: 'hook', n: 2 });
  assert.equal(two.hall.phase(0), FP_REEL);
});

test('продать: жетоны по весу; рекорд и не новый вид — в альбоме отмечается; не выбрал — само, ушёл — тоже само', () => {
  const { hub, a, hall, clock } = fisher({ sp: sp('bluefish'), g: 3000 });
  const land = (): void => {
    // сообщений рыбалки — не больше 6 в секунду: часы хаба в тестах сами не идут
    clock.now += 1000;
    a.s.msgs.length = 0;
    cast(hub, a.c);
    until(hub, a.s, FE_BITE);
    hub.onJson(a.c, { t: 'fish', a: 'hook', n: 2 });
    until(hub, a.s, FE_LAND);
  };
  const t0 = a.c.profile!.tokens;
  land();
  hub.onJson(a.c, { t: 'fish', a: 'sell' });
  const price = fishPrice(sp('bluefish'), 3000);
  assert.equal(a.c.profile!.tokens, t0 + price);
  assert.equal(a.c.profile!.stats.fsSold, 1);
  assert.deepEqual(a.c.profile!.album, {}, 'продал — в альбом не попало');
  assert.equal(lastOf(a.s, 'tokens')!.n, t0 + price);

  // не выбрал за 30 с: новый вид — сам в альбом
  land();
  steps(hub, HOLD_TICKS + 1);
  assert.equal(hall.phase(0), FP_IDLE);
  assert.deepEqual(a.c.profile!.album, { bluefish: [3000, 1] });
  // тот же вес ещё раз: не рекорд — сам продаётся
  land();
  assert.deepEqual(lastOf(a.s, 'fishCatch'), { t: 'fishCatch', sp: sp('bluefish'), g: 3000, price, fresh: false, record: false, best: 3000 });
  steps(hub, HOLD_TICKS + 1);
  assert.equal(a.c.profile!.stats.fsSold, 2);
  // тяжелее — рекорд; ушёл с места с рыбой в руках — она в альбом
  hall.roll = () => ({ sp: sp('bluefish'), g: 3500 });
  land();
  assert.equal(lastOf(a.s, 'fishCatch')!.record, true);
  hold(hub, [a.c], 0, 1);
  hold(hub, [a.c], BTN_FORWARD, 2);
  assert.deepEqual(a.c.profile!.album, { bluefish: [3500, 2] });
  assert.match(allOf(a.s, 'toast').at(-1)!.text, /Новый рекорд: Луфарь, 3,50 кг/);
});

test('редкий улов — строка в общий чат; золотую рыбку отпускают за желание; хлам — в урну', () => {
  const { hub, a, hall, clock } = fisher({ sp: sp('dogfish'), g: 6200 });
  const b = login(hub, 'Зевака');
  const catchOne = (): void => {
    clock.now += 1000;
    a.s.msgs.length = 0;
    cast(hub, a.c);
    until(hub, a.s, FE_BITE);
    hub.onJson(a.c, { t: 'fish', a: 'hook', n: 2 });
    until(hub, a.s, FE_LAND);
  };
  catchOne();
  const line = allOf(b.s, 'chat').find((m) => m.sys && m.text.includes('катрана'));
  assert.ok(line, 'в чат');
  assert.equal(line.text, '🎣 Рыбак вытаскивает катрана на 6,20 кг!');
  hub.onJson(a.c, { t: 'fish', a: 'sell' });

  hall.roll = () => ({ sp: GOLDFISH, g: 300 });
  catchOne();
  assert.ok(allOf(b.s, 'chat').some((m) => m.sys && m.text.includes('золотую рыбку')));
  const t0 = a.c.profile!.tokens;
  hub.onJson(a.c, { t: 'fish', a: 'sell' });
  assert.equal(a.c.profile!.tokens, t0 + 50);
  assert.match(lastOf(a.s, 'toast')!.text, /исполнила желание: \+50/);

  hall.roll = () => ({ sp: sp('boot'), g: 800 });
  const chats = allOf(b.s, 'chat').length;
  catchOne();
  assert.equal(allOf(b.s, 'chat').length, chats, 'сапог в чат не объявляют');
  hub.onJson(a.c, { t: 'fish', a: 'sell' });
  assert.match(lastOf(a.s, 'toast')!.text, /Старый сапог — в урну/);
});

test('видно всем: заброс и поклёвка приходят и соседям; вошедший позже видит, где поплавок и что в руках', () => {
  const { hub, a, hall } = fisher({ sp: sp('scad'), g: 200 });
  const b = login(hub, 'Сосед');
  cast(hub, a.c);
  until(hub, a.s, FE_BITE);
  assert.ok(fishEvents(b.s).some((e) => e[0] === FE_CAST), 'сосед видит заброс');
  assert.ok(fishEvents(b.s).some((e) => e[0] === FE_BITE));
  hub.onJson(a.c, { t: 'fish', a: 'hook', n: 2 });
  until(hub, a.s, FE_LAND);
  assert.equal(hall.phase(0), FP_HOLD);
  const c = login(hub, 'Позже');
  const view = lastOf(c.s, 'lobby')!.fish[0];
  assert.equal(view.ph, FP_HOLD);
  assert.equal(view.sp, sp('scad'));
  assert.equal(view.g, 200);
  assert.equal(lastOf(c.s, 'lobby')!.fish[1].ph, FP_IDLE, 'на свободном месте — ничего');
});
