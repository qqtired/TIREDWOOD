// Набережная: ходьба, вода, автоматы, джекпот, эмоции, места, примерочная, покупки, вход на склад, круг «Старт».
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { RC_RACE, RC_RESULTS, RC_RESULTS_TICKS } from '../shared/kart.ts';
import { ACT_DURAK, ACT_NONE, ACT_RESPECT, ACT_SIT, ACT_SLOT, ACT_WARDROBE, ACT_WAVE } from '../shared/lobby.ts';
import { KART_START, type Interactable } from '../shared/maps/lobby.ts';
import { BTN_DASH, BTN_FORWARD } from '../shared/sim.ts';
import { RESPECT_COUNT_MS, RESPECT_TICKS, STATUE_AT } from '../shared/respect.ts';
import { POOL_MIN, SLOT_AFK_TICKS, SLOT_AFK_WARN_TICKS, SPIN_TICKS } from '../shared/slots.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, hold, lastOf, login, setupHub, steps, types } from './kit.ts';

function setupLobby(roll?: () => number) {
  return setupHub({ roll });
}

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

/** Поставить игрока в точку (как будто дошёл сам). */
function place(hub: Hub, c: Client, x: number, z: number, y = 0): void {
  const st = lp(hub, c).state;
  st.x = x;
  st.y = y;
  st.z = z;
  st.vx = 0;
  st.vy = 0;
  st.vz = 0;
}

function spot(hub: Hub, kind: Interactable['kind'], arg = 0): Interactable {
  const it = hub.lobby.map.interact.find((i) => i.kind === kind && i.arg === arg);
  assert.ok(it, `${kind} ${arg}`);
  return it;
}

function goUse(hub: Hub, c: Client, it: Interactable): void {
  place(hub, c, it.x, it.z);
  hub.onJson(c, { t: 'use', id: it.id });
}

test('W 60 тиков — идёт вперёд (на север, к складу)', () => {
  const { hub } = setupLobby();
  const { c } = login(hub, 'Ходок');
  const z0 = lp(hub, c).state.z;
  hold(hub, [c], BTN_FORWARD, 60);
  assert.ok(lp(hub, c).state.z < z0 - 3, `z было ${z0}, стало ${lp(hub, c).state.z}`);
});

test('упал в воду — плюх для всех и обратно к точке входа', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Ныряльщик');
  const b = login(hub, 'Зритель');
  // в море к югу от площади (к западу — аквапарк: оттуда на его мостик, см. aqua.test.ts)
  place(hub, a.c, 0, 30, -1);
  for (let i = 0; i < 60 && !lastOf(b.s, 'lev'); i++) hub.step();
  const ev = lastOf(b.s, 'lev');
  assert.ok(ev, 'событие плюха');
  assert.equal(ev.e[0][0], 'splash');
  assert.equal(ev.e[0][3], lp(hub, a.c).slot);
  const st = lp(hub, a.c).state;
  assert.ok(Math.hypot(st.x, st.z - 6) < 1.2 && st.y === 0, 'снова на набережной');
});

test('автомат: издалека не сесть, из точки — можно, второму — «занят»', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Игрок');
  const b = login(hub, 'Сосед');
  const m0 = spot(hub, 'slot', 0);
  hub.onJson(a.c, { t: 'use', id: m0.id });
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'издалека нельзя');
  goUse(hub, a.c, m0);
  assert.equal(lp(hub, a.c).action, ACT_SLOT);
  assert.equal(lp(hub, a.c).arg, 0);
  assert.equal(hub.lobby.slots.machines[0].occupant, lp(hub, a.c).slot);
  goUse(hub, b.c, m0);
  assert.equal(lp(hub, b.c).action, ACT_NONE);
  assert.match(lastOf(b.s, 'toast')!.text, /занят/);
  // стоящий у автомата не сдвигается без кнопок движения, а W его отпускает
  steps(hub, 30);
  assert.equal(lp(hub, a.c).state.x, m0.x);
  hold(hub, [a.c], BTN_FORWARD, 1);
  assert.equal(lp(hub, a.c).action, ACT_NONE);
  assert.equal(hub.lobby.slots.machines[0].occupant, 0);
});

test('джекпот: без жетонов — отказ; три семёрки — выигрыш, корона, банк, объявление через 2,4 с', () => {
  const { hub, store } = setupLobby(() => 63);
  const a = login(hub, 'Везунчик');
  const b = login(hub, 'Завистник');
  goUse(hub, a.c, spot(hub, 'slot', 0));
  a.c.profile!.tokens = 0;
  hub.onJson(a.c, { t: 'spin' });
  assert.match(lastOf(a.s, 'toast')!.text, /Не хватает жетонов/);
  a.c.profile!.tokens = 100;
  hub.onJson(a.c, { t: 'spin' });
  const spin = lastOf(b.s, 'slotSpin')!;
  assert.deepEqual(spin.reels, [5, 5, 5]);
  assert.equal(spin.jackpot, true);
  assert.equal(spin.item, 'h:crown');
  assert.equal(spin.m, 0);
  assert.equal(spin.nick, 'Везунчик');
  // ставка 1: ×100 и доля банка 1000,05 · 1/50 = 20
  assert.equal(spin.win, 120);
  assert.deepEqual(allOf(a.s, 'tokens').map((t) => [t.n, t.delay]), [[99, undefined], [219, 2400]]);
  assert.ok(a.c.profile!.owned.includes('h:crown'));
  assert.equal(a.c.profile!.stats.jackpots, 1);
  assert.ok(store.state.jackpot >= POOL_MIN);
  assert.equal(store.state.lastJackpot?.nick, 'Везунчик');
  const jackpotLines = () => allOf(b.s, 'chat').filter((m) => m.sys && m.text.includes('ДЖЕКПОТ'));
  steps(hub, SPIN_TICKS - 1);
  assert.equal(jackpotLines().length, 0, 'до остановки барабанов — тишина');
  steps(hub, 1);
  assert.equal(jackpotLines().length, 1);
  assert.match(jackpotLines()[0].text, /Корона/);
  assert.ok(lastOf(b.s, 'pool'), 'банк обновился у всех');
  assert.ok(lastOf(b.s, 'honor'), 'доска почёта обновилась');
});

test('повторное вращение до остановки барабанов — «ещё крутится»', () => {
  const { hub } = setupLobby(() => 0);
  const a = login(hub, 'Торопыга');
  goUse(hub, a.c, spot(hub, 'slot', 1));
  hub.onJson(a.c, { t: 'spin' });
  hub.onJson(a.c, { t: 'spin' });
  assert.equal(allOf(a.s, 'slotSpin').length, 1);
  assert.match(lastOf(a.s, 'toast')!.text, /крутится/);
  // три вишни на ставке 5: ×6
  assert.equal(lastOf(a.s, 'slotSpin')!.win, 30);
  assert.equal(a.c.profile!.tokens, 100 - 5 + 30);
});

test('автомат: минуту не крутишь — за 10 с предупреждение, потом встаёшь и автомат свободен; вращение продлевает', () => {
  const { hub } = setupLobby(() => 0);
  const a = login(hub, 'Соня');
  const b = login(hub, 'Очередь');
  const warns = () => allOf(a.s, 'toast').filter((t) => /освободится/.test(t.text)).length;
  goUse(hub, a.c, spot(hub, 'slot', 0));
  steps(hub, SLOT_AFK_WARN_TICKS - TICK_RATE);
  assert.equal(warns(), 0, 'рано предупреждать');
  steps(hub, 2 * TICK_RATE);
  assert.equal(warns(), 1, 'за 10 с — предупреждение');
  steps(hub, SLOT_AFK_TICKS - SLOT_AFK_WARN_TICKS - 3 * TICK_RATE);
  assert.equal(lp(hub, a.c).action, ACT_SLOT, 'ещё стоит');
  steps(hub, 2 * TICK_RATE);
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'минута без вращения — встал');
  assert.equal(hub.lobby.slots.machines[0].occupant, 0, 'автомат свободен');
  assert.match(lastOf(a.s, 'toast')!.text, /освобождён/);
  assert.equal(warns(), 1, 'предупредили один раз');
  goUse(hub, b.c, spot(hub, 'slot', 0));
  assert.equal(lp(hub, b.c).action, ACT_SLOT, 'другой садится');
  // вращение начинает минуту заново
  goUse(hub, a.c, spot(hub, 'slot', 1));
  steps(hub, SLOT_AFK_TICKS - 10 * TICK_RATE);
  hub.onJson(a.c, { t: 'spin' });
  assert.equal(allOf(a.s, 'slotSpin').length, 1);
  steps(hub, SLOT_AFK_TICKS - 10 * TICK_RATE);
  assert.equal(lp(hub, a.c).action, ACT_SLOT, 'после вращения — снова минута');
  steps(hub, 12 * TICK_RATE);
  assert.equal(lp(hub, a.c).action, ACT_NONE);
});

test('«Press F» у статуи: издалека нельзя; рядом — честь 5 с, хоть всем сразу; счётчик — не чаще раза в 10 с от игрока', () => {
  const { hub, store, clock } = setupLobby();
  const a = login(hub, 'Ветеран');
  const b = login(hub, 'Сосед');
  hub.onJson(a.c, { t: 'respect' });
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'от точки входа — далеко');
  place(hub, a.c, STATUE_AT.x + 3, STATUE_AT.z - 3);
  place(hub, b.c, STATUE_AT.x + 2, STATUE_AT.z - 4);
  hub.onJson(a.c, { t: 'respect' });
  hub.onJson(b.c, { t: 'respect' });
  assert.equal(lp(hub, a.c).action, ACT_RESPECT);
  assert.equal(lp(hub, b.c).action, ACT_RESPECT, 'вдвоём одновременно');
  assert.equal(store.state.respects, 2);
  steps(hub, 2);
  const evs = allOf(b.s, 'lev').flatMap((m) => m.e).filter((e) => e[0] === 'respect');
  assert.deepEqual(evs.map((e) => e[1]).sort(), [lp(hub, a.c).slot, lp(hub, b.c).slot].sort(), 'все видят обоих');
  assert.equal(evs.at(-1)![2], 2);
  steps(hub, RESPECT_TICKS);
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'через 5 с — сама');
  // ещё раз сразу: честь отдаёт, а счётчик ждёт 10 с; шаг прерывает
  clock.now += 1500;
  hub.onJson(a.c, { t: 'respect' });
  assert.equal(lp(hub, a.c).action, ACT_RESPECT);
  assert.equal(store.state.respects, 2);
  hold(hub, [a.c], BTN_FORWARD, 1);
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'шаг прерывает');
  clock.now += RESPECT_COUNT_MS;
  place(hub, a.c, STATUE_AT.x + 3, STATUE_AT.z - 3);
  hub.onJson(a.c, { t: 'respect' });
  assert.equal(store.state.respects, 3);
  // сидя — нельзя
  const seat = hub.lobby.map.interact.filter((i) => i.kind === 'seat').sort((p, q) => Math.hypot(p.x - STATUE_AT.x, p.z - STATUE_AT.z) - Math.hypot(q.x - STATUE_AT.x, q.z - STATUE_AT.z))[0];
  goUse(hub, b.c, seat);
  assert.equal(lp(hub, b.c).action, ACT_SIT);
  clock.now += RESPECT_COUNT_MS;
  hub.onJson(b.c, { t: 'respect' });
  assert.equal(lp(hub, b.c).action, ACT_SIT);
  // новый игрок видит счётчик сразу
  const c = login(hub, 'Новичок');
  assert.equal(lastOf(c.s, 'lobby')!.respects, 3);
});

test('эмоция: машет рукой, шаг отменяет', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Махун');
  hub.onJson(a.c, { t: 'emote', e: ACT_WAVE });
  assert.equal(lp(hub, a.c).action, ACT_WAVE);
  hold(hub, [a.c], BTN_FORWARD, 1);
  assert.equal(lp(hub, a.c).action, ACT_NONE);
  hub.onJson(a.c, { t: 'emote', e: 99 });
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'чужие номера не принимаются');
});

test('места: стул кафе — за стол дурака, скамейка — просто сесть; второй не сядет; шаг поднимает', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Посетитель');
  const b = login(hub, 'Второй');
  for (const [it, act] of [[spot(hub, 'durak', 4), ACT_DURAK], [spot(hub, 'seat', 18), ACT_SIT]] as const) {
    goUse(hub, a.c, it);
    assert.equal(lp(hub, a.c).action, act, it.kind);
    assert.equal(lp(hub, a.c).arg, it.arg, 'аргумент — номер места');
    assert.equal(hub.lobby.seatOwner(it.arg), lp(hub, a.c).slot);
    goUse(hub, b.c, it);
    assert.equal(lp(hub, b.c).action, ACT_NONE);
    assert.match(lastOf(b.s, 'toast')!.text, /занято/);
    hold(hub, [a.c], BTN_FORWARD, 1);
    assert.equal(lp(hub, a.c).action, ACT_NONE);
    assert.equal(hub.lobby.seatOwner(it.arg), 0);
    hold(hub, [a.c], 0, 2);
  }
});

test('Shift (рывок) не выбрасывает из-за столика, от автомата и из примерочной; шаг — выбрасывает', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Непоседа');
  for (const [kind, act, arg] of [['seat', ACT_SIT, 18], ['durak', ACT_DURAK, 0], ['slot', ACT_SLOT, 0], ['kiosk', ACT_WARDROBE, 0]] as const) {
    goUse(hub, a.c, spot(hub, kind, arg));
    assert.equal(lp(hub, a.c).action, act, kind);
    const { x, z } = lp(hub, a.c).state;
    for (let i = 0; i < 3; i++) {
      hold(hub, [a.c], 0, 2);
      hold(hub, [a.c], BTN_DASH, 2);
    }
    assert.equal(lp(hub, a.c).action, act, `${kind}: Shift не поднимает`);
    assert.deepEqual([lp(hub, a.c).state.x, lp(hub, a.c).state.z], [x, z], `${kind}: и не двигает`);
    hold(hub, [a.c], BTN_FORWARD, 1);
    assert.equal(lp(hub, a.c).action, ACT_NONE, `${kind}: шаг — встал`);
    hold(hub, [a.c], 0, 2);
  }
  // эмоцию рывок по-прежнему прерывает: рывок двигает желейку
  hub.onJson(a.c, { t: 'emote', e: ACT_WAVE });
  hold(hub, [a.c], BTN_DASH, 1);
  assert.equal(lp(hub, a.c).action, ACT_NONE);
});

test('наряд меняется только в примерочной и виден всем', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Модница');
  const b = login(hub, 'Смотрящий');
  const o = { c: 3, c2: 5, p: 'none', e: 'happy', h: 'none', a: 'scarf' };
  hub.onJson(a.c, { t: 'outfit', o });
  assert.equal(lastOf(b.s, 'outfitOf'), undefined, 'вне ларька не меняется');
  goUse(hub, a.c, spot(hub, 'kiosk'));
  assert.equal(lp(hub, a.c).action, ACT_WARDROBE);
  hub.onJson(a.c, { t: 'outfit', o });
  assert.deepEqual(lastOf(b.s, 'outfitOf'), { t: 'outfitOf', id: lp(hub, a.c).slot, o });
  assert.deepEqual(lastOf(a.s, 'me')!.outfit, o);
  // чужую дорогую вещь надеть нельзя — сбрасывается на «без»
  hub.onJson(a.c, { t: 'outfit', o: { ...o, h: 'crown' } });
  assert.equal(lastOf(b.s, 'outfitOf')!.o.h, 'none');
});

test('покупка в примерочной: −300 жетонов, вещь своя и сразу надета', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Покупатель');
  a.c.profile!.tokens = 340;
  goUse(hub, a.c, spot(hub, 'kiosk'));
  hub.onJson(a.c, { t: 'buy', item: 'h:panama' });
  const me = lastOf(a.s, 'me')!;
  assert.equal(me.tokens, 40);
  assert.ok(me.owned.includes('h:panama'));
  assert.equal(me.outfit.h, 'panama');
  assert.match(lastOf(a.s, 'toast')!.text, /Куплено: Панама/);
  steps(hub, 60);
  hub.onJson(a.c, { t: 'buy', item: 'h:tophat' });
  assert.match(lastOf(a.s, 'toast')!.text, /Не хватает/);
  assert.equal(a.c.profile!.tokens, 40);
});

test('ворота склада — в пейнтбол', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Боец');
  steps(hub, 121);
  goUse(hub, a.c, spot(hub, 'pb_gate'));
  assert.deepEqual(lastOf(a.s, 'scene'), { t: 'scene', scene: 'paintball', epoch: 2 });
  assert.equal(hub.paintball.humans, 1);
  assert.ok(types(a.s).includes('welcome'));
});

test('сел на ходу с зажатым W — сидит, пока W не нажать заново', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Бегун');
  const seat = spot(hub, 'seat', 18);
  hold(hub, [a.c], BTN_FORWARD, 3);
  goUse(hub, a.c, seat);
  assert.equal(lp(hub, a.c).action, ACT_SIT);
  hold(hub, [a.c], BTN_FORWARD, 30);
  assert.equal(lp(hub, a.c).action, ACT_SIT, 'W, зажатый ещё на ходу, не поднимает');
  assert.equal(lp(hub, a.c).state.x, seat.x);
  assert.equal(lp(hub, a.c).state.z, seat.z);
  hold(hub, [a.c], 0, 1);
  assert.equal(lp(hub, a.c).action, ACT_SIT, 'отпустил — всё ещё сидит');
  hold(hub, [a.c], BTN_FORWARD, 1);
  assert.equal(lp(hub, a.c).action, ACT_NONE, 'нажал заново — встал');
  assert.equal(hub.lobby.seatOwner(18), 0);
});

test('круг «Старт»: семеро — шестеро уезжают по порядку входа, седьмому — тост; табло видит гонку', () => {
  const { hub } = setupLobby();
  const all = Array.from({ length: 7 }, (_, i) => login(hub, `Гонщик${i + 1}`, undefined, `10.0.1.${i}`));
  const zevaka = login(hub, 'Зевака', undefined, '10.0.2.1');
  all.forEach((p, i) => {
    const a = (i / all.length) * Math.PI * 2;
    place(hub, p.c, KART_START.x + Math.cos(a) * 1.2, KART_START.z + Math.sin(a) * 1.2);
    steps(hub, 6);
  });
  const count = lastOf(zevaka.s, 'kart')!;
  assert.equal(count.phase, 'count');
  assert.equal(count.n, 7);
  steps(hub, 15 * TICK_RATE);
  const [last, ...rest] = [...all].reverse();
  for (const p of rest) assert.equal(p.c.room?.kind, 'race', `${p.c.nick} уехал`);
  assert.equal(last.c.room?.kind, 'lobby', 'седьмой остался');
  assert.equal(lastOf(last.s, 'toast')!.text, 'Мест нет — поедешь в следующий заезд');
  assert.equal(hub.race.humans, 6);
  assert.equal(hub.race.race!.karts.size, 6, 'полная решётка — без ботов');
  steps(hub, TICK_RATE);
  const st = lastOf(zevaka.s, 'kart')!;
  assert.equal(st.phase, 'race');
  assert.equal(st.n, 6);
  assert.deepEqual(st.names, rest.map((p) => p.c.nick).reverse());
  assert.equal(st.laps, 3);
});

test('пока идёт гонка, отсчёт не начинается; после неё — сам', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Первый');
  const b = login(hub, 'Опоздал');
  place(hub, a.c, KART_START.x, KART_START.z);
  steps(hub, 15 * TICK_RATE + 6);
  assert.equal(a.c.room?.kind, 'race');
  place(hub, b.c, KART_START.x, KART_START.z);
  steps(hub, 20 * TICK_RATE);
  assert.equal(b.c.room?.kind, 'lobby', 'в круге во время гонки — ждёт');
  assert.equal(lastOf(b.s, 'kart')!.phase, 'race');
  // гонка кончилась: время вышло, итоги показаны
  const race = hub.race.race!;
  assert.equal(race.phase, RC_RACE);
  race.phaseEnd = race.tick + 1;
  steps(hub, 2);
  assert.equal(race.phase, RC_RESULTS);
  steps(hub, 6);
  assert.equal(lastOf(b.s, 'kart')!.phase, 'results');
  steps(hub, RC_RESULTS_TICKS);
  assert.equal(a.c.room?.kind, 'lobby', 'первый вернулся');
  steps(hub, 6);
  const st = lastOf(b.s, 'kart')!;
  assert.equal(st.phase, 'count', 'круг не пуст — отсчёт пошёл сам');
  assert.deepEqual(st.names, ['Опоздал']);
});

test('E в круге «Старт» выбирает следующую трассу и оставляет игрока в очереди', () => {
  const { hub } = setupLobby();
  const a = login(hub, 'Любопытный');
  goUse(hub, a.c, spot(hub, 'garage'));
  assert.equal(a.c.room?.kind, 'lobby');
  assert.equal(hub.lobby.kartStatus().track, 'foundry');
  assert.equal(hub.lobby.kartStatus().hostId, hub.lobby.playerOf(a.c)!.slot);
  assert.match(lastOf(a.s, 'toast')!.text, /Литейный вираж/);
});
