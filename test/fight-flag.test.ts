// «Fight Club» и флаг сервера: выключен — режима нет нигде (набережная как была); включён — круг мелом у двери
// в подвал кафе: хозяин (первый в круге) меняет режим, отсчёт, все из круга — вниз (лишние — зрителями), во время
// боя E у двери — спуститься посмотреть, выход — к двери, жетоны и статистика по итогам — в профиль.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FC_CHECK_EVERY, FC_CIRCLE, FC_COUNT_FULL_TICKS, FC_COUNT_TICKS, FC_END_TICKS, FC_SPAWN, FP_END, FP_FIGHT } from '../shared/fight.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { BTN_JUMP } from '../shared/sim.ts';
import { fightEnabled } from '../server/fight/room.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { SMOKE, allOf, lastOf, login, placeAt, sendInput, setupHub, steps, types } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Хаб с включённым «Fight Club» (как setupHub из kit.ts, но с флагом) */
function fightHub(): Hub {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fight-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 2, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  return new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fight: true });
}

const point = buildLobby().interact.find((i) => i.kind === 'fight')!;

test('Fight Club jumping keeps the host, selected mode and full-circle deadline', () => {
  const hub = fightHub(), a = login(hub, 'Host'), b = login(hub, 'Guest');
  placeAt(hub, a.c, FC_CIRCLE.x, FC_CIRCLE.z); steps(hub, FC_CHECK_EVERY);
  hub.onJson(a.c, { t: 'use', id: point.id }); // team: two people do not shorten this countdown
  placeAt(hub, b.c, FC_CIRCLE.x + 0.6, FC_CIRCLE.z);
  let previous = Infinity, apex = 0;
  for (let tick = 0; tick < FC_COUNT_TICKS; tick++) {
    sendInput(hub, a.c, tick % 60 === 0 ? BTN_JUMP : 0); hub.step();
    const p = hub.lobby.playerOf(a.c); if (!p) break;
    apex = Math.max(apex, p.state.y);
    if (tick < FC_CHECK_EVERY) continue;
    const status = lastOf(a.s, 'fcSt')!;
    assert.equal(status.host, 'Host'); assert.equal(status.mode, 'team');
    assert.deepEqual(status.names, ['Host', 'Guest']);
    assert.ok(status.left <= previous); previous = status.left;
  }
  assert.ok(apex > 1.3); assert.equal(a.c.room?.kind, 'fight'); assert.equal(b.c.room?.kind, 'fight');
});

test('флаг FIGHT: 1 — включён, 0 — выключен, без переменной — только в разработке', () => {
  assert.equal(fightEnabled('1', false), true);
  assert.equal(fightEnabled('0', true), false);
  assert.equal(fightEnabled(undefined, true), true);
  assert.equal(fightEnabled(undefined, false), false);
  assert.equal(fightEnabled('yes', false), false);
});

test('точка fight — в круге мелом у двери кафе, на настиле', () => {
  assert.ok(point);
  assert.equal(point.x, FC_CIRCLE.x);
  assert.equal(point.z, FC_CIRCLE.z);
  assert.equal(point.r, FC_CIRCLE.r);
  assert.ok(Math.hypot(FC_SPAWN.x - FC_CIRCLE.x, FC_SPAWN.z - FC_CIRCLE.z) > FC_CIRCLE.r + 0.5, 'вернувшийся — не в круге');
});

test('флаг выключен: комнаты нет, в lobby нет поля fc, круг и E у двери ничего не делают', () => {
  const { hub } = setupHub();
  assert.equal(hub.fight, null);
  const { c, s } = login(hub, 'Прохожий');
  assert.ok(!('fc' in lastOf(s, 'lobby')!), 'без поля fc');
  placeAt(hub, c, FC_CIRCLE.x, FC_CIRCLE.z);
  steps(hub, FC_COUNT_TICKS + 2 * TICK_RATE);
  hub.onJson(c, { t: 'use', id: point.id });
  steps(hub, 5);
  assert.equal(c.room?.kind, 'lobby');
  assert.ok(!types(s).some((t) => t.startsWith('fc')), 'ни одного сообщения боя');
  assert.equal(hub.health().fight, 0);
});

test('флаг включён: круг, хозяин меняет режим, отсчёт, вниз — бойцы и зритель; выход — к двери', () => {
  const hub = fightHub();
  assert.ok(hub.fight);
  const a = login(hub, 'Хозяин', undefined, '10.0.0.2');
  const b = login(hub, 'Второй', undefined, '10.0.0.3');
  const w = login(hub, 'Зевака', undefined, '10.0.0.4');
  assert.deepEqual(lastOf(a.s, 'lobby')!.fc?.phase, 'idle', 'в lobby — круг');
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, a.c, FC_CIRCLE.x, FC_CIRCLE.z);
  steps(hub, FC_CHECK_EVERY);
  let st = lastOf(a.s, 'fcSt')!;
  assert.equal(st.phase, 'count');
  assert.equal(st.host, 'Хозяин');
  assert.equal(st.mode, 'duel');
  // хозяин: 1 на 1 → 2 на 2 → каждый за себя → 1 на 1
  hub.onJson(a.c, { t: 'use', id: point.id });
  steps(hub, FC_CHECK_EVERY);
  assert.equal(lastOf(a.s, 'fcSt')!.mode, 'team');
  steps(hub, TICK_RATE);
  hub.onJson(a.c, { t: 'use', id: point.id });
  steps(hub, FC_CHECK_EVERY);
  assert.equal(lastOf(a.s, 'fcSt')!.mode, 'ffa');
  steps(hub, TICK_RATE);
  hub.onJson(a.c, { t: 'use', id: point.id });
  steps(hub, FC_CHECK_EVERY);
  assert.equal(lastOf(a.s, 'fcSt')!.mode, 'duel');
  // второй тоже в круге: режим не его
  placeAt(hub, b.c, FC_CIRCLE.x + 0.5, FC_CIRCLE.z);
  placeAt(hub, w.c, FC_CIRCLE.x - 0.5, FC_CIRCLE.z + 0.3);
  steps(hub, FC_CHECK_EVERY);
  hub.onJson(b.c, { t: 'use', id: point.id });
  assert.match(lastOf(b.s, 'toast')!.text, /Хозяин/);
  st = lastOf(a.s, 'fcSt')!;
  assert.deepEqual(st.names, ['Хозяин', 'Второй', 'Зевака']);
  assert.ok(st.left <= FC_COUNT_FULL_TICKS / TICK_RATE, 'круг полон — отсчёт короче');
  // досчитали: все трое внизу, третий — зрителем
  steps(hub, FC_COUNT_FULL_TICKS + FC_CHECK_EVERY);
  for (const x of [a, b, w]) {
    assert.equal(x.c.room?.kind, 'fight');
    assert.ok(types(x.s).lastIndexOf('fcInit') > types(x.s).lastIndexOf('scene'), 'за scene — приветствие боя');
  }
  const init = lastOf(a.s, 'fcInit')!;
  assert.equal(init.mode, 'duel');
  assert.deepEqual(init.roster.filter((r) => r.fighter).map((r) => r.nick).sort(), ['Второй', 'Хозяин']);
  assert.equal(init.roster.find((r) => r.nick === 'Зевака')!.fighter, false);
  assert.equal(hub.health().fight, 3);
  assert.equal(hub.health().busy, 3, 'выкладка не оборвёт бой');
  steps(hub, FC_CHECK_EVERY);
  // на набережной картон показывает бой
  const c4 = login(hub, 'Опоздавший', undefined, '10.0.0.5');
  assert.equal(lastOf(c4.s, 'lobby')!.fc?.phase, 'fight');
  // опоздавший — E у двери: вниз зрителем
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c4.c, FC_CIRCLE.x, FC_CIRCLE.z);
  hub.onJson(c4.c, { t: 'use', id: point.id });
  assert.equal(c4.c.room?.kind, 'fight');
  assert.equal(hub.fight!.playerOf(c4.c)!.fighter, false);
  // зритель выходит — к двери
  hub.onJson(w.c, { t: 'leave' });
  assert.equal(w.c.room?.kind, 'lobby');
  const lp = hub.lobby.playerOf(w.c)!;
  assert.ok(Math.hypot(lp.state.x - FC_SPAWN.x, lp.state.z - FC_SPAWN.z) < 1.2, 'появился у двери');
  assert.equal(lastOf(w.s, 'lobby')!.yaw, FC_SPAWN.yaw);
});

test('итоги боя: жетоны и статистика — в профиль, потом все наверх', () => {
  const hub = fightHub();
  const { c, s } = login(hub, 'Боец');
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, FC_CIRCLE.x, FC_CIRCLE.z);
  steps(hub, FC_COUNT_TICKS + 2 * FC_CHECK_EVERY);
  assert.equal(c.room?.kind, 'fight');
  const game = hub.fight!.game!;
  const me = hub.fight!.playerOf(c)!;
  const bot = [...game.players.values()].find((p) => p.bot)!;
  const before = c.profile!.tokens;
  me.dmg = 40; // попадал по боту — без попаданий жетонов нет
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 20 * TICK_RATE && game.phase !== FP_FIGHT; i++) hub.step();
    bot.f.hp = 0;
    bot.f.ko = 1;
    for (let i = 0; i < 6 * TICK_RATE && game.phase === FP_FIGHT; i++) hub.step();
  }
  for (let i = 0; i < 10 * TICK_RATE && game.phase !== FP_END; i++) hub.step();
  assert.equal(game.phase, FP_END);
  const reward = lastOf(s, 'fcReward')!;
  assert.ok(reward.win > 0);
  const prof = c.profile!;
  assert.equal(prof.tokens, before + reward.total);
  assert.equal(prof.stats.fcFights, 1);
  assert.equal(prof.stats.fcWins, 1);
  assert.equal(prof.stats.fcKos, me.kos);
  assert.equal(lastOf(s, 'tokens')!.n, prof.tokens);
  assert.ok(lastOf(s, 'me')!.stats.fcFights === 1, 'профиль обновлён');
  assert.ok(allOf(s, 'chat').some((m) => m.sys && m.text.includes('подвала')), 'строка в общем чате — без подробностей');
  steps(hub, FC_END_TICKS + 2);
  assert.equal(c.room?.kind, 'lobby', 'итоги показаны — наверх');
  assert.ok(hub.fight!.idle);
  // круг снова свободен: новый бой собирается
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, FC_CIRCLE.x, FC_CIRCLE.z);
  steps(hub, FC_CHECK_EVERY);
  assert.equal(lastOf(s, 'fcSt')!.phase, 'count');
});

test('все ушли из подвала — бой закрыт, круг свободен', () => {
  const hub = fightHub();
  const { c } = login(hub, 'Беглец');
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, FC_CIRCLE.x, FC_CIRCLE.z);
  steps(hub, FC_COUNT_TICKS + 2 * FC_CHECK_EVERY);
  assert.equal(c.room?.kind, 'fight');
  steps(hub, 3 * TICK_RATE);
  hub.onJson(c, { t: 'leave' });
  assert.equal(c.room?.kind, 'lobby');
  assert.ok(hub.fight!.idle);
  assert.equal(hub.health().fight, 0);
});
