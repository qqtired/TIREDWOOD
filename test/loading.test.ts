// Ожидание загрузки перед стартом раунда (server/readygate.ts): отсчёт стоит, пока все не прислали «готов»,
// не дольше LOAD_WAIT_TICKS; кто ни разу не присылал «готов» — того не ждём (как раньше).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RC_GRID, RC_GRID_TICKS, RC_RACE } from '../shared/kart.ts';
import { GO_TICKS, LOAD_WAIT_TICKS } from '../shared/loading.ts';
import { FT_GATHER } from '../shared/fort.ts';
import { allOf, lastOf, login, setupHub, steps } from './kit.ts';

/** Вошёл на набережную и отрисовал её — клиент умеет говорить «готов». */
function readyLobby(hub: ReturnType<typeof setupHub>['hub'], c: Parameters<ReturnType<typeof setupHub>['hub']['onJson']>[0]): void {
  hub.onJson(c, { t: 'ready', e: c.epoch });
}

test('картинг: решётка стоит, пока не загрузились все, потом обычные 5 с и `go` за 3 с', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Гонщик');
  const b = login(hub, 'Второй', undefined, '10.0.0.2');
  readyLobby(hub, a.c);
  readyLobby(hub, b.c);
  hub.startRace([a.c, b.c], 'port');
  const race = hub.race.race!;
  steps(hub, RC_GRID_TICKS + 60);
  assert.equal(race.phase, RC_GRID, 'пока никто не загрузился, гонка не начинается');
  const load = lastOf(b.s, 'load');
  assert.deepEqual(load?.who.map((w) => [w.nick, w.ok]), [['Гонщик', false], ['Второй', false]]);
  assert.ok((load?.wait ?? 0) > 0);

  hub.onJson(a.c, { t: 'ready', e: a.c.epoch });
  steps(hub, 2);
  assert.deepEqual(lastOf(b.s, 'load')?.who.map((w) => w.ok), [true, false], 'второй видит, кто уже готов');
  steps(hub, 60);
  assert.equal(race.phase, RC_GRID, 'второй ещё грузится (до 8 с) — ждём');

  hub.onJson(b.c, { t: 'ready', e: b.c.epoch });
  steps(hub, 2);
  assert.equal(lastOf(a.s, 'load')?.wait, 0, 'дождались');
  assert.equal(allOf(a.s, 'go').length, 0);
  steps(hub, RC_GRID_TICKS - GO_TICKS);
  const go = lastOf(a.s, 'go');
  assert.ok(go && go.ms > 2900 && go.ms <= 3000, `go за 3 с до старта: ${JSON.stringify(go)}`);
  steps(hub, GO_TICKS + 2);
  assert.equal(race.phase, RC_RACE, 'после отсчёта — гонка');
});

test('кто не загрузился за 8 с — начинаем без него; старый ready от прошлой комнаты не считается', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Тормоз');
  readyLobby(hub, a.c);
  const lobbyEpoch = a.c.epoch;
  hub.startRace([a.c], 'port');
  hub.onJson(a.c, { t: 'ready', e: lobbyEpoch });
  assert.equal(hub.gate.loading(a.c), true, 'ready с номером набережной — не про гонку');
  steps(hub, LOAD_WAIT_TICKS);
  assert.equal(hub.gate.loading(a.c), false, 'срок вышел');
  assert.equal(hub.race.race!.phase, RC_GRID);
  steps(hub, RC_GRID_TICKS + 2);
  assert.equal(hub.race.race!.phase, RC_RACE);
});

test('старый клиент без «готов» не задерживает старт; ушёл, не загрузившись, — ждать перестаём', () => {
  const { hub } = setupHub();
  const old = login(hub, 'Старый');
  hub.startRace([old.c], 'port');
  steps(hub, RC_GRID_TICKS + 2);
  assert.equal(hub.race.race!.phase, RC_RACE, 'без ready — как раньше');
  assert.equal(allOf(old.s, 'load').length, 0);

  const { hub: hub2 } = setupHub({ fort: true });
  const a = login(hub2, 'Защитник');
  const b = login(hub2, 'Ушедший', undefined, '10.0.0.2');
  readyLobby(hub2, a.c);
  readyLobby(hub2, b.c);
  steps(hub2, 130);
  hub2.enterFort(a.c);
  hub2.onJson(a.c, { t: 'ready', e: a.c.epoch });
  steps(hub2, 60);
  hub2.enterFort(b.c);
  const fort = hub2.fort!.game;
  assert.equal(fort.phase, FT_GATHER);
  const end = fort.phaseEnd;
  steps(hub2, 120);
  assert.equal(fort.phaseEnd, end + 120, 'сбор стоит, пока второй грузится');
  hub2.onJson(b.c, { t: 'leave' });
  steps(hub2, 120);
  assert.equal(fort.phaseEnd, end + 120, 'ушёл — сбор снова идёт');
  assert.equal(lastOf(a.s, 'load')?.wait, 0);
});

test('/go — только на сервере разработки', () => {
  const { hub } = setupHub({ fort: true });
  const a = login(hub, 'Проверяльщик');
  hub.onJson(a.c, { t: 'chat', text: '/go fort' });
  assert.equal(a.c.room, hub.lobby);
  hub.gate.devGo = true;
  hub.onJson(a.c, { t: 'chat', text: '/go fort' });
  assert.equal(a.c.room, hub.fort);
});
