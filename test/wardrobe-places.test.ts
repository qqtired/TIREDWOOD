import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Client, Hub } from '../server/hub.ts';
import { ACT_NONE, ACT_WARDROBE, ACT_WAVE } from '../shared/lobby.ts';
import type { Interactable } from '../shared/maps/lobby.ts';
import { BTN_FORWARD } from '../shared/sim.ts';
import { WARDROBE_OFFSETS, wardrobePlace } from '../shared/wardrobe.ts';
import { allOf, hold, lastOf, login, placeAt, setupHub } from './kit.ts';

function player(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p);
  return p;
}

function enter(hub: Hub, c: Client): void {
  const kiosk = hub.lobby.map.interact.find(it => it.kind === 'kiosk');
  assert.ok(kiosk);
  placeAt(hub, c, kiosk.x, kiosk.z, kiosk.y);
  hub.onJson(c, { t: 'use', id: kiosk.id });
}

function filled() {
  const e = setupHub();
  const interactBefore = e.hub.lobby.map.interact.map(it => ({ ...it }));
  const who = ['Примерка1', 'Примерка2', 'Примерка3'].map(nick => login(e.hub, nick));
  for (const { c } of who) enter(e.hub, c);
  return { ...e, who, interactBefore };
}

test('wardrobePlace сохраняет базовую точку и задаёт относительную позицию и номер места', () => {
  const base: Interactable = { id: 7, kind: 'kiosk', x: 5, y: 2, z: 10, yaw: Math.PI / 2, r: 1.6, arg: 0, label: 'примерочная' };
  const before = { ...base };
  assert.deepEqual(WARDROBE_OFFSETS.map((_, n) => wardrobePlace(base, n)), [
    { ...before, arg: 0, z: 10 },
    { ...before, arg: 1, z: 8 },
    { ...before, arg: 2, z: 6 },
  ]);
  assert.deepEqual(base, before);
  assert.notEqual(wardrobePlace(base, 0), base, 'даже первое место — отдельная копия');
});

test('wardrobePlace отклоняет индекс вне диапазона и нецелые значения', () => {
  const { hub } = setupHub();
  const base = hub.lobby.map.interact.find(it => it.kind === 'kiosk')!;
  for (const n of [-1, 3, 99, 0.5, NaN, Infinity, -Infinity]) assert.equal(wardrobePlace(base, n), undefined, `индекс ${n}`);
});

test('к примерочной можно подойти вплотную у зеркала, окошка и нижней части фасада', () => {
  const { hub } = setupHub();
  const kiosk = hub.lobby.map.interact.find(it => it.kind === 'kiosk')!;
  const approaches = [
    { nick: 'Окошко', x: -24.7, z: -4.3 },
    { nick: 'Зеркало', x: -25, z: -1.4 },
    { nick: 'Край фасада', x: -24.7, z: -5.4 },
  ];
  for (const [n, approach] of approaches.entries()) {
    const { c } = login(hub, approach.nick);
    placeAt(hub, c, approach.x, approach.z);
    hub.onJson(c, { t: 'use', id: kiosk.id });
    const p = player(hub, c);
    assert.equal(p.action, ACT_WARDROBE, `${approach.nick}: вход с подхода к фасаду`);
    assert.equal(p.arg, n, `${approach.nick}: своё свободное место`);
    assert.ok(Math.hypot(approach.x - kiosk.x, approach.z - kiosk.z) <= kiosk.r, `${approach.nick}: область подсказки также покрывает подход`);
  }
});

test('расширенная область примерочной не разрешает вход издали или с крыши', () => {
  const { hub } = setupHub();
  const { c } = login(hub, 'Далеко');
  const kiosk = hub.lobby.map.interact.find(it => it.kind === 'kiosk')!;
  for (const [x, z, y] of [[-18.2, -1.4, 0], [-23.4, -1.4, 3.4]]) {
    placeAt(hub, c, x, z, y);
    hub.onJson(c, { t: 'use', id: kiosk.id });
    assert.equal(player(hub, c).action, ACT_NONE);
  }
});

test('три игрока примерочной стоят в отдельных местах перед фасадом', () => {
  const { hub, who, interactBefore } = filled();
  assert.deepEqual(who.map(({ c }) => {
    const p = player(hub, c);
    return [p.action, p.arg, p.state.x, p.state.y, p.state.z, p.heldYaw];
  }), [
    [ACT_WARDROBE, 0, -23.4, 0, -1.4, Math.PI / 2],
    [ACT_WARDROBE, 1, -23.4, 0, -3.4, Math.PI / 2],
    [ACT_WARDROBE, 2, -23.4, 0, -5.4, Math.PI / 2],
  ]);
  hold(hub, who.map(({ c }) => c), 0, 2);
  assert.deepEqual(who.map(({ c }) => player(hub, c).state.z), [-1.4, -3.4, -5.4]);
  assert.deepEqual(hub.lobby.map.interact, interactBefore, 'распределение не меняет взаимодействия карты');
});

test('переполненная примерочная показывает причину и сохраняет текущую активность', () => {
  const { hub } = filled();
  const fourth = login(hub, 'Примерка4');
  hub.onJson(fourth.c, { t: 'emote', e: ACT_WAVE });
  const p = player(hub, fourth.c);
  const before = [p.action, p.arg, p.actionUntil];
  enter(hub, fourth.c);
  assert.deepEqual([p.action, p.arg, p.actionUntil], before);
  assert.notEqual(p.action, ACT_WARDROBE);
  assert.match(lastOf(fourth.s, 'toast')!.text, /занят/);
});

test('повторный use сохраняет своё место при полной примерочной и после освобождения первого', () => {
  const { hub, who } = filled();
  const owner = who[2];
  const kiosk = hub.lobby.map.interact.find(it => it.kind === 'kiosk')!;
  for (const [n, current] of who.entries()) {
    const p = player(hub, current.c);
    const toasts = allOf(current.s, 'toast').length;
    hub.onJson(current.c, { t: 'use', id: kiosk.id });
    assert.deepEqual([p.action, p.arg, p.state.x, p.state.z], [ACT_WARDROBE, n, -23.4, [-1.4, -3.4, -5.4][n]]);
    assert.equal(allOf(current.s, 'toast').length, toasts);
  }
  const p = player(hub, owner.c);
  hub.onJson(who[0].c, { t: 'unuse' });
  hub.onJson(owner.c, { t: 'use', id: kiosk.id });
  assert.deepEqual([p.action, p.arg, p.state.x, p.state.z], [ACT_WARDROBE, 2, -23.4, -5.4]);
});

for (const release of ['unuse', 'step', 'disconnect'] as const) {
  test(`освобождённое через ${release} место получает следующий игрок`, () => {
    const { hub, who } = filled();
    const fourth = login(hub, 'Примерка4');
    const owner = who[1];
    assert.equal(player(hub, owner.c).arg, 1);
    if (release === 'unuse') hub.onJson(owner.c, { t: 'unuse' });
    else if (release === 'step') hold(hub, [owner.c], BTN_FORWARD, 1);
    else hub.disconnect(owner.c);
    if (release !== 'disconnect') assert.equal(player(hub, owner.c).action, ACT_NONE);
    enter(hub, fourth.c);
    assert.deepEqual([player(hub, fourth.c).action, player(hub, fourth.c).arg, player(hub, fourth.c).state.z], [ACT_WARDROBE, 1, -3.4]);
    assert.deepEqual([player(hub, who[0].c).arg, player(hub, who[2].c).arg], [0, 2]);
  });
}
