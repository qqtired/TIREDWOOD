// Набережная вдвоём: «дай пять» и обнимашки (приглашение, согласие, дальность, отмена шагом), фото у маяка.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { ACT_FIVE, ACT_HUG, ACT_NONE, ACT_SIT, PAIR_ASK_TICKS, PAIR_TICKS } from '../shared/lobby.ts';
import type { Interactable } from '../shared/maps/lobby.ts';
import type { LobbyEvent } from '../shared/messages.ts';
import { BTN_FORWARD } from '../shared/sim.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, hold, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

function spot(hub: Hub, kind: Interactable['kind'], arg = 0): Interactable {
  const it = hub.lobby.map.interact.find((i) => i.kind === kind && i.arg === arg);
  assert.ok(it, `${kind} ${arg}`);
  return it;
}

/** События набережной, которые получил игрок (все пакеты подряд). */
function events(s: { msgs: unknown[] }, kind: string): LobbyEvent[] {
  const out: LobbyEvent[] = [];
  for (const m of s.msgs as Array<{ t: string; e?: LobbyEvent[] }>) if (m.t === 'lev') for (const e of m.e!) if (e[0] === kind) out.push(e);
  return out;
}

/**
 * Двое на площади: a в (0, 6) смотрит на север (yaw 0), b — в dist метрах перед ним (севернее) или, если dist < 0,
 * позади. Взгляд приходит с входом — по тику на каждого.
 */
function pairUp(dist = 1.5) {
  const env = setupHub();
  const { hub } = env;
  const a = login(hub, 'Зовущий');
  const b = login(hub, 'Отвечающий');
  placeAt(hub, a.c, 0, 6);
  placeAt(hub, b.c, 0, 6 - dist);
  hold(hub, [a.c, b.c], 0, 2, 0);
  return { ...env, a, b };
}

test('«дай пять»: зовёшь того, кто перед тобой; он жмёт ту же клавишу — оба в жесте друг с другом', () => {
  const { hub, a, b } = pairUp();
  hub.onJson(a.c, { t: 'pair', k: 0 });
  const pa = lp(hub, a.c);
  const pb = lp(hub, b.c);
  assert.equal(pa.action, ACT_FIVE, 'позвал — рука поднята');
  assert.equal(pa.arg, 0, 'ждёт ответа');
  const ask = lastOf(b.s, 'pairAsk');
  assert.deepEqual(ask, { t: 'pairAsk', id: pa.slot, nick: 'Зовущий', k: 0 });

  hub.onJson(b.c, { t: 'pair', k: 0 });
  assert.equal(pa.action, ACT_FIVE);
  assert.equal(pb.action, ACT_FIVE);
  assert.equal(pa.arg, pb.slot, 'партнёр — номер в снимке');
  assert.equal(pb.arg, pa.slot);
  steps(hub, 2);
  assert.deepEqual(events(a.s, 'pair'), [['pair', 0, pa.slot, pb.slot]], 'событие — всем (и звёздочки)');
  assert.deepEqual(events(b.s, 'pair'), [['pair', 0, pa.slot, pb.slot]]);
  // жест кончается сам у обоих
  steps(hub, PAIR_TICKS[0]);
  assert.equal(pa.action, ACT_NONE);
  assert.equal(pb.action, ACT_NONE);
});

test('обнимашки: b позвал, a ответил той же клавишей — обнялись, и это дольше, чем «пять»', () => {
  const { hub, a, b } = pairUp();
  hold(hub, [b.c], 0, 1, Math.PI);
  hub.onJson(b.c, { t: 'pair', k: 1 });
  hub.onJson(a.c, { t: 'pair', k: 1 });
  const pa = lp(hub, a.c);
  const pb = lp(hub, b.c);
  assert.equal(pa.action, ACT_HUG);
  assert.equal(pb.action, ACT_HUG);
  assert.equal(pa.arg, pb.slot);
  assert.equal(pb.arg, pa.slot);
  steps(hub, 2);
  assert.deepEqual(events(a.s, 'pair'), [['pair', 1, pb.slot, pa.slot]], 'позвал b, ответил a');
  steps(hub, PAIR_TICKS[1] - 4);
  assert.equal(pa.action, ACT_HUG, 'обнимаются дольше, чем дают пять');
});

test('дальность и направление: дальше 2 м, за спиной, на другом уровне, сидящий — не зовутся', () => {
  for (const [dist, why] of [[2.4, 'дальше 2 м'], [-1.5, 'за спиной']] as const) {
    const { hub, a, b } = pairUp(dist);
    hub.onJson(a.c, { t: 'pair', k: 0 });
    assert.equal(lp(hub, a.c).action, ACT_NONE, why);
    assert.equal(lastOf(b.s, 'pairAsk'), undefined, why);
    assert.match(lastOf(a.s, 'toast')!.text, /ближе/, why);
  }
  // вплотную — с любой стороны
  {
    const { hub, a, b } = pairUp(-0.7);
    hub.onJson(a.c, { t: 'pair', k: 1 });
    assert.equal(lp(hub, a.c).action, ACT_HUG, 'вплотную за спиной — можно');
    assert.ok(lastOf(b.s, 'pairAsk'));
  }
  // на батуте над головой — нет
  {
    const { hub, a, b } = pairUp();
    lp(hub, b.c).state.y = 1.5;
    hub.onJson(a.c, { t: 'pair', k: 0 });
    assert.equal(lastOf(b.s, 'pairAsk'), undefined, 'на другом уровне');
  }
  // сидящего на скамейке не зовут
  {
    const { hub, a, b } = pairUp();
    const seat = spot(hub, 'seat', 18);
    placeAt(hub, b.c, seat.x, seat.z);
    hub.onJson(b.c, { t: 'use', id: seat.id });
    assert.equal(lp(hub, b.c).action, ACT_SIT);
    placeAt(hub, a.c, seat.x, seat.z + 1.5);
    hold(hub, [a.c], 0, 1, 0);
    hub.onJson(a.c, { t: 'pair', k: 0 });
    assert.equal(lastOf(b.s, 'pairAsk'), undefined, 'сидит — не зовём');
    assert.equal(lp(hub, b.c).action, ACT_SIT);
  }
});

test('отмена шагом: позвавший пошёл — приглашение снято; в жесте шаг одного — жест кончился у обоих', () => {
  const { hub, a, b } = pairUp();
  hub.onJson(a.c, { t: 'pair', k: 0 });
  const pa = lp(hub, a.c);
  const pb = lp(hub, b.c);
  hold(hub, [a.c], BTN_FORWARD, 1);
  assert.equal(pa.action, ACT_NONE, 'шаг — рука опущена');
  steps(hub, 1);
  assert.deepEqual(lastOf(b.s, 'pairOff'), { t: 'pairOff', id: pa.slot }, 'у второго приглашение пропало');
  hub.onJson(b.c, { t: 'pair', k: 0 });
  assert.equal(pa.action, ACT_NONE, 'поздно отвечать');
  assert.notEqual(pb.action, ACT_FIVE);
  assert.equal(events(a.s, 'pair').length, 0);

  // заново, и в самом жесте шагнул второй
  placeAt(hub, a.c, 0, 6);
  hold(hub, [a.c, b.c], 0, 2, 0);
  hub.onJson(a.c, { t: 'pair', k: 1 });
  hub.onJson(b.c, { t: 'pair', k: 1 });
  assert.equal(pb.action, ACT_HUG);
  hold(hub, [b.c], BTN_FORWARD, 1);
  steps(hub, 1);
  assert.equal(pb.action, ACT_NONE);
  assert.equal(pa.action, ACT_NONE, 'обнимать некого — отпустил');
});

test('приглашение живёт 5 с; ответ издалека (дальше 2,5 м) не считается', () => {
  {
    const { hub, a, b } = pairUp();
    hub.onJson(a.c, { t: 'pair', k: 0 });
    steps(hub, PAIR_ASK_TICKS + 1);
    assert.equal(lp(hub, a.c).action, ACT_NONE, 'рука опущена');
    assert.ok(lastOf(b.s, 'pairOff'), 'приглашение снято');
    hub.onJson(b.c, { t: 'pair', k: 0 });
    assert.equal(events(a.s, 'pair').length, 0);
  }
  {
    const { hub, a, b } = pairUp();
    hub.onJson(a.c, { t: 'pair', k: 0 });
    placeAt(hub, b.c, 0, 6 - 2.8);
    hub.onJson(b.c, { t: 'pair', k: 0 });
    steps(hub, 2);
    assert.equal(events(a.s, 'pair').length, 0, 'ушёл дальше 2,5 м');
    assert.equal(lp(hub, b.c).action, ACT_NONE);
  }
  {
    // другой жест — не ответ: «пять» на приглашение обняться зовёт сам
    const { hub, a, b } = pairUp();
    hold(hub, [b.c], 0, 1, Math.PI);
    hub.onJson(a.c, { t: 'pair', k: 1 });
    hub.onJson(b.c, { t: 'pair', k: 0 });
    assert.equal(lp(hub, a.c).action, ACT_HUG);
    assert.equal(lp(hub, a.c).arg, 0, 'всё ещё ждёт обнимашек');
    assert.equal(lp(hub, b.c).action, ACT_FIVE);
    assert.equal(lp(hub, b.c).arg, 0);
    assert.deepEqual(lastOf(a.s, 'pairAsk'), { t: 'pairAsk', id: lp(hub, b.c).slot, nick: 'Отвечающий', k: 0 });
  }
});

test('фото у маяка: E у штатива — событие всем, повтор во время отсчёта — тост, потом снова можно', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Фотограф');
  const b = login(hub, 'Модель');
  const it = spot(hub, 'photo');
  placeAt(hub, a.c, it.x, it.z);
  hub.onJson(a.c, { t: 'use', id: it.id });
  steps(hub, 2);
  const pa = lp(hub, a.c);
  assert.deepEqual(events(b.s, 'photo'), [['photo', pa.slot]]);
  hub.onJson(a.c, { t: 'use', id: it.id });
  steps(hub, 2);
  assert.equal(events(b.s, 'photo').length, 1, 'пока идёт отсчёт — второй раз нельзя');
  assert.match(lastOf(a.s, 'toast')!.text, /снимаем/);
  steps(hub, 5 * TICK_RATE);
  hub.onJson(a.c, { t: 'use', id: it.id });
  steps(hub, 2);
  assert.equal(events(b.s, 'photo').length, 2);
  assert.equal(allOf(b.s, 'toast').length, 0, 'модели тостов не было');
});
