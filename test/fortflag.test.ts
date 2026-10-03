// «Крепость» и флаг сервера: выключен — режима нет нигде (набережная как была); включён — арка ведёт в крепость,
// выход — к арке, жетоны и статистика по итогам — в профиль.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FORT_WAVES, FT_BREAK, FT_END, FT_GATHER } from '../shared/fort.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { BTN_FORWARD } from '../shared/sim.ts';
import { fortEnabled } from '../server/fort/room.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { SMOKE, lastOf, login, placeAt, sendInput, setupHub, steps, types } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Хаб с включённой крепостью (как setupHub из kit.ts, но с флагом) */
function fortHub(): Hub {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fort-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 2, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  return new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fort: true });
}

const point = buildLobby().interact.find((i) => i.kind === 'fort')!;

test('флаг FORTRESS: 1 — включён, 0 — выключен, без переменной — только в разработке', () => {
  assert.equal(fortEnabled('1', false), true);
  assert.equal(fortEnabled('0', true), false);
  assert.equal(fortEnabled(undefined, true), true);
  assert.equal(fortEnabled(undefined, false), false);
  assert.equal(fortEnabled('yes', false), false);
});

test('флаг выключен: комнаты нет, в lobby нет поля fort, E у арки ничего не делает', () => {
  const { hub } = setupHub();
  assert.equal(hub.fort, null);
  const { c, s } = login(hub, 'Прохожий');
  assert.ok(!('fort' in lastOf(s, 'lobby')!), 'без поля fort');
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, point.x, point.z);
  hub.onJson(c, { t: 'use', id: point.id });
  steps(hub, 5);
  assert.equal(c.room?.kind, 'lobby');
  assert.ok(!types(s).includes('fortSt'), 'статуса крепости нет');
  assert.equal(hub.health().fort, 0);
  assert.equal(hub.fortStatus(), null);
});

test('флаг включён: арка → крепость (приветствие сразу за scene), выход — к арке', () => {
  const hub = fortHub();
  assert.ok(hub.fort);
  const { c, s } = login(hub, 'Защитник');
  const lobby = lastOf(s, 'lobby')!;
  assert.ok(lobby.fort, 'в lobby — статус крепости');
  assert.equal(lobby.fort.humans, 0);
  steps(hub, 3 * TICK_RATE);
  assert.ok(types(s).includes('fortSt'), 'раз в секунду — статус для арки');
  placeAt(hub, c, point.x, point.z);
  hub.onJson(c, { t: 'use', id: point.id });
  assert.equal(c.room?.kind, 'fort');
  assert.deepEqual(lastOf(s, 'scene'), { t: 'scene', scene: 'fort', epoch: 2 });
  assert.equal(types(s)[types(s).lastIndexOf('scene') + 1], 'fort', 'сразу за scene — приветствие крепости');
  const hello = lastOf(s, 'fort')!;
  assert.equal(hello.phase, FT_GATHER);
  assert.equal(hello.players.length, 1);
  assert.equal(hub.health().fort, 1);
  assert.equal(hub.health().busy, 1, 'выкладка не оборвёт оборону');
  // ввод доходит: идём вперёд по террасе
  const p = hub.fort.playerOf(c)!;
  const z0 = p.state.z;
  for (let i = 0; i < 30; i++) {
    sendInput(hub, c, BTN_FORWARD);
    hub.step();
  }
  assert.ok(p.state.z < z0 - 1, 'шёл вперёд');
  assert.ok(s.bins.length > 0, 'снимки идут');
  // в lobby статус — с защитником
  steps(hub, 3 * TICK_RATE);
  hub.onJson(c, { t: 'leave' });
  assert.equal(c.room?.kind, 'lobby');
  const lp = hub.lobby.playerOf(c)!;
  const spot = hub.lobby.map.fortSpawn;
  assert.ok(Math.hypot(lp.state.x - spot.x, lp.state.z - spot.z) < 1.2, 'появился у арки');
  assert.equal(lastOf(s, 'lobby')!.yaw, spot.yaw);
  assert.equal(hub.health().fort, 0);
});

test('итоги крепости: жетоны и статистика — в профиль', () => {
  const hub = fortHub();
  const { c, s } = login(hub, 'Ветеран');
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, point.x, point.z);
  hub.onJson(c, { t: 'use', id: point.id });
  const game = hub.fort!.game;
  const p = hub.fort!.playerOf(c)!;
  const before = c.profile!.tokens;
  // последняя волна: всех, кто выходит, сбиваем
  game.wave = FORT_WAVES - 1;
  game.cleared = FORT_WAVES - 1;
  p.waves = FORT_WAVES - 1;
  game.phaseEnd = game.tick + 1;
  for (let i = 0; i < 80 * TICK_RATE && game.phase !== FT_END; i++) {
    for (const z of game.horde.zombies) if (z.alive) game.horde.damage(z, 9999, p.id, false, z.x, 1, z.z);
    hub.step();
  }
  assert.equal(game.phase, FT_END);
  const reward = lastOf(s, 'fortReward')!;
  assert.ok(reward && reward.win > 0);
  const prof = c.profile!;
  assert.equal(prof.tokens, before + reward.total);
  assert.equal(prof.stats.ftGames, 1);
  assert.equal(prof.stats.ftWins, 1);
  assert.equal(prof.stats.ftBest, FORT_WAVES);
  assert.equal(prof.stats.ftKills, p.kills);
  assert.equal(lastOf(s, 'tokens')!.n, prof.tokens);
  assert.ok(lastOf(s, 'me')!.stats.ftGames === 1, 'профиль обновлён');
});

test('выход из крепости посреди забега: жетоны за отбитые волны — в профиль сразу, игра в статистике — один раз', () => {
  const hub = fortHub();
  const { c, s } = login(hub, 'Беглец');
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, point.x, point.z);
  hub.onJson(c, { t: 'use', id: point.id });
  const game = hub.fort!.game;
  const p = hub.fort!.playerOf(c)!;
  const before = c.profile!.tokens;
  // волна 1 отбита
  game.phaseEnd = game.tick + 1;
  for (let i = 0; i < 80 * TICK_RATE && (game.wave < 1 || game.phase !== FT_BREAK); i++) {
    for (const z of game.horde.zombies) if (z.alive) game.horde.damage(z, 1e9, p.id, true, z.x, 1, z.z);
    hub.step();
  }
  assert.equal(p.waves, 1);
  // уходит на набережную: выплата сразу, надпись — в общий тост
  hub.move(c, hub.lobby, true);
  const prof = c.profile!;
  assert.ok(prof.tokens > before, 'жетоны за волну зачислены при выходе');
  assert.equal(prof.stats.ftGames, 1);
  assert.ok(s.msgs.some((m) => m.t === 'toast' && m.text.includes('Крепость')));
  // крепость опустела — вернулся уже в новую игру; ушёл без волны — ни денег, ни второй игры в статистике
  const mid = prof.tokens;
  steps(hub, 2 * TICK_RATE);
  placeAt(hub, c, point.x, point.z);
  hub.onJson(c, { t: 'use', id: point.id });
  assert.equal(hub.fort!.playerOf(c)!.waves, 0, 'пустая крепость — новая игра');
  hub.move(c, hub.lobby, true);
  assert.equal(prof.tokens, mid);
  assert.equal(prof.stats.ftGames, 1);
});
