// «Подземелье» и флаг сервера DUNGEON: выключен — режима нет нигде (набережная как была); включён — E у пещеры ведёт в свой
// инстанс, сервер по журналу ввода шагает копию забега, платит за отбитые волны, выход платит один раз, рекорды сохраняются.
// Симуляция здесь — быстрая управляемая подмена (волна — 30 шагов, событие use — смерть): проверяем сервер, а не баланс.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { DG_LOST_MS, DG_PAUSE_MAX_MS, DG_RECORD_COINS, dgWaveCoins, type DgEvent, type DgStage } from '../shared/dungeon/api.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { dungeonEnabled } from '../server/dungeon/room.ts';
import { dgWeekStart } from '../server/dungeon/records.ts';
import type { DgSimApi } from '../server/dungeon/simport.ts';
import { Store, normalizeProfile } from '../server/store.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, lastOf, login, placeAt, setupHub, steps, types } from './kit.ts';

interface Fake { tick: number; stage: DgStage; waves: number; bosses: number; kills: number; ms: number; h: number }
const WAVE = 30;
const fake: DgSimApi<Fake> = {
  createRun: (seed) => ({ tick: 0, stage: 'wave', waves: 0, bosses: 0, kills: 0, ms: 0, h: seed }),
  applyEvent(s, ev) {
    s.h = (Math.imul(s.h, 31) + ev.t) >>> 0;
    if (ev.k === 'use') s.stage = 'over';
  },
  step(s) {
    s.tick++;
    s.h = (Math.imul(s.h, 31) + 7) >>> 0;
    if (s.stage === 'over') return;
    s.kills++;
    if (s.tick % WAVE === 0) {
      s.waves++;
      s.ms = Math.round((s.tick * 1000) / 30);
      s.stage = 'breather';
    } else if (s.stage === 'breather') s.stage = 'wave';
  },
  dgResult: (s) => ({ waves: s.waves, ms: s.ms, kills: s.kills, level: 1, bosses: s.bosses, killedBy: s.stage === 'over' ? 'cooper' : '', dmg: {}, end: s.stage === 'over' ? 'death' : 'running' }),
  dgHash: (s) => s.h,
  tick: (s) => s.tick,
  stage: (s) => s.stage,
  over: (s) => s.stage === 'over',
};

const point = buildLobby().interact.find((i) => i.kind === 'dungeon')!;

/** Сумма состояния клиента после n шагов без событий */
function hashAt(seed: number, n: number): number {
  const s = fake.createRun(seed);
  for (let i = 0; i < n; i++) fake.step(s);
  return fake.dgHash(s);
}

function dgHub(log?: (s: string) => void) {
  let seed = 41;
  return setupHub({ dungeon: true, dungeonSim: fake, dungeonSeed: () => ++seed, log });
}

function enter(hub: Hub, c: Client): void {
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, point.x, point.z);
  hub.onJson(c, { t: 'use', id: point.id });
}

function log(hub: Hub, c: Client, from: number, ev: DgEvent[], upto: number, h: number): void {
  hub.onJson(c, { t: 'dg_log', from, ev, upto, h });
}

test('флаг DUNGEON: 1 — включён, 0 — выключен, без переменной — только в разработке', () => {
  assert.equal(dungeonEnabled('1', false), true);
  assert.equal(dungeonEnabled('0', true), false);
  assert.equal(dungeonEnabled(undefined, true), true);
  assert.equal(dungeonEnabled(undefined, false), false);
});

test('флаг выключен: зала нет, в lobby нет поля dg, E у пещеры ничего не делает', () => {
  const { hub } = setupHub();
  assert.equal(hub.dungeon, null);
  const { c, s } = login(hub, 'Прохожий');
  assert.ok(!('dg' in lastOf(s, 'lobby')!), 'без поля dg');
  enter(hub, c);
  steps(hub, 2 * TICK_RATE);
  assert.equal(c.room?.kind, 'lobby');
  assert.ok(!types(s).includes('dgSt'), 'таблички нет');
  assert.equal(hub.health().dungeon, 0);
});

test('флаг включён: вход в свой инстанс, журнал, жетоны за волну, выход платит один раз, рекорды сохраняются', () => {
  const { hub, store, clock } = dgHub();
  const { c, s } = login(hub, 'Шахтёр');
  assert.deepEqual(lastOf(s, 'lobby')!.dg, { top: [], week: [] }, 'в lobby — табличка у пещеры');
  enter(hub, c);
  assert.equal(c.room?.kind, 'dungeon');
  assert.deepEqual(lastOf(s, 'scene'), { t: 'scene', scene: 'dungeon', epoch: 2 });
  assert.equal(types(s)[types(s).lastIndexOf('scene') + 1], 'dg_hello', 'сразу за scene — приветствие забега');
  const hello = lastOf(s, 'dg_hello')!;
  assert.deepEqual(hello, { t: 'dg_hello', seed: 42, best: 0, bestMs: 0, weekBest: 0 });
  assert.equal(hub.dungeon!.rooms.size, 1);
  assert.equal(hub.health().dungeon, 1);
  assert.equal(hub.health().busy, 1, 'идущий забег — выкладка подождёт');
  // пауза — не занятость
  hub.onJson(c, { t: 'dg_pause', on: 1 });
  assert.equal(hub.health().busy, 0);
  hub.onJson(c, { t: 'dg_pause', on: 0 });
  // второй игрок — в свой инстанс
  const two = login(hub, 'Второй', undefined, '10.0.0.2');
  enter(hub, two.c);
  assert.equal(two.c.room?.kind, 'dungeon');
  assert.notEqual(two.c.room, c.room, 'у каждого своя комната');
  assert.equal(hub.dungeon!.rooms.size, 2);

  // 95 шагов клиента (3 волны) — сервер шагает свою копию, но не обгоняет часы
  const before = c.profile!.tokens;
  log(hub, c, 0, [], 95, hashAt(42, 95));
  assert.deepEqual(lastOf(s, 'dg_ack'), { t: 'dg_ack', n: 0 });
  steps(hub, 40);
  const room = hub.dungeon!.rooms.values().next().value!;
  assert.ok(room.state.tick < 95, 'за ~1 с часов — не дальше часов');
  clock.now += 4000;
  steps(hub, 40);
  assert.equal(room.state.tick, 95, 'догнал клиента');
  const waves = allOf(s, 'dg_wave');
  assert.deepEqual(waves.map((w) => [w.wave, w.coins]), [[1, dgWaveCoins(1)], [2, dgWaveCoins(2)], [3, dgWaveCoins(3)]]);
  const paid = dgWaveCoins(1) + dgWaveCoins(2) + dgWaveCoins(3);
  assert.equal(c.profile!.tokens, before + paid, 'жетоны за волны — сразу');
  assert.equal(lastOf(s, 'tokens')!.n, c.profile!.tokens);

  // пропуск в журнале — просьба прислать заново
  log(hub, c, 5, [{ t: 96, k: 'dash' }], 96, 0);
  assert.deepEqual(lastOf(s, 'dg_ack'), { t: 'dg_ack', n: 0, need: 0 });

  // выход посреди забега: бонус за личный рекорд, итог, статистика; за волны второй раз не платят
  hub.onJson(c, { t: 'leave' });
  assert.equal(c.room?.kind, 'lobby');
  const end = lastOf(s, 'dg_end')!;
  assert.equal(end.result.end, 'leave');
  assert.equal(end.result.waves, 3);
  assert.equal(end.coins, paid + DG_RECORD_COINS);
  assert.deepEqual(end.pay, { waves: paid, bosses: 0, record: DG_RECORD_COINS });
  assert.equal(end.newBest, true);
  assert.equal(end.weekRank, 1);
  const st = c.profile!.stats;
  assert.equal(c.profile!.tokens, before + paid + DG_RECORD_COINS);
  assert.deepEqual([st.dgRuns, st.dgBest, st.dgBestMs], [1, 3, 3000]);
  assert.ok(st.dgKills > 0);
  assert.ok(s.msgs.some((m) => m.t === 'toast' && m.text.includes('Подземелье')), 'итог тостом');
  assert.equal(hub.dungeon!.rooms.size, 1, 'пустой инстанс удалён');
  const lp = hub.lobby.playerOf(c)!;
  const spot = hub.lobby.map.dungeonSpawn;
  assert.ok(Math.hypot(lp.state.x - spot.x, lp.state.z - spot.z) < 1.2, 'появился у пещеры');

  // табличка у входа — с рекордом
  steps(hub, TICK_RATE);
  const dg = lastOf(s, 'dgSt')!;
  assert.equal(dg.top.length, 1);
  assert.deepEqual([dg.top[0].nick, dg.top[0].waves, dg.top[0].ms], ['Шахтёр', 3, 3000]);
  assert.equal(dg.week[0].waves, 3);

  // снова зашёл и сразу вышел: ни жетонов, ни забега в статистике
  const mid = c.profile!.tokens;
  enter(hub, c);
  assert.equal(lastOf(s, 'dg_hello')!.best, 3);
  assert.equal(lastOf(s, 'dg_hello')!.weekBest, 3);
  hub.move(c, hub.lobby, true);
  assert.equal(c.profile!.tokens, mid);
  assert.equal(st.dgRuns, 1);

  // смена ника — в строках рекордов
  clock.now += 61_000;
  hub.onJson(c, { t: 'rename', nick: 'Шахтёр2' });
  assert.equal(store.state.dgTop![0].nick, 'Шахтёр2');
  assert.equal(store.state.dgWeek!.top[0].nick, 'Шахтёр2');

  // рекорды и статистика переживают перезапуск
  store.flush();
  const again = new Store(store.dir, { log: () => {} });
  again.load();
  assert.equal(again.state.dgTop![0].waves, 3);
  assert.equal(again.state.dgTop![0].pid, c.pid);
  assert.equal(again.state.dgWeek!.from, dgWeekStart(clock.now));
  const prof = again.state.profiles.find((p) => p.id === c.pid)!;
  assert.deepEqual([prof.stats.dgRuns, prof.stats.dgBest, prof.stats.dgBestMs], [1, 3, 3000]);
});

test('смерть по серверной копии — итог; «Ещё раз» — новый забег; расхождение — в журнал; пауза 10 минут — тайм-аут', () => {
  const lines: string[] = [];
  const { hub, clock } = dgHub((l) => lines.push(l));
  const { c, s } = login(hub, 'Бочар');
  enter(hub, c);
  const seed = lastOf(s, 'dg_hello')!.seed;
  // неверная сумма на шаге 20 — только строка в журнал сервера
  log(hub, c, 0, [], 20, 12345);
  clock.now += 5000;
  steps(hub, 20);
  assert.ok(lines.some((l) => l.includes('разошлись на шаге 20')), lines.join('\n'));
  // E (в подмене — смерть) на шаге 40
  log(hub, c, 0, [{ t: 40, k: 'use' }], 45, 0);
  steps(hub, 20);
  const end = lastOf(s, 'dg_end')!;
  assert.equal(end.result.end, 'death');
  assert.equal(end.result.waves, 1);
  assert.equal(c.room?.kind, 'dungeon', 'экран итогов — в той же комнате');
  assert.equal(hub.health().busy, 0, 'итоги — не занятость');
  assert.equal(c.profile!.stats.dgRuns, 1);
  // «Ещё раз»
  hub.onJson(c, { t: 'dg_again' });
  const hello = lastOf(s, 'dg_hello')!;
  assert.notEqual(hello.seed, seed);
  assert.equal(hello.best, 1);
  // пауза 10 минут — тайм-аут, затем на набережную
  hub.onJson(c, { t: 'dg_pause', on: 1 });
  clock.now += DG_PAUSE_MAX_MS;
  steps(hub, 2);
  assert.equal(lastOf(s, 'dg_end')!.result.end, 'timeout');
  assert.equal(c.room?.kind, 'lobby', 'после тайм-аута — на набережную');
  assert.equal(hub.dungeon!.rooms.size, 0);
});

test('обрыв связи: забег ждёт 60 с, не вернулся — итог по отбитым волнам', () => {
  const { hub, clock } = dgHub();
  const { c, s } = login(hub, 'Связист');
  enter(hub, c);
  log(hub, c, 0, [], 31, hashAt(42, 31));
  clock.now += 3000;
  steps(hub, 20);
  assert.equal(lastOf(s, 'dg_wave')?.wave, 1);
  hub.linkLost(c, s, 'обрыв связи', 1006);
  assert.equal(hub.health().busy, 0, 'без связи — не занятость');
  clock.now += 50_000;
  steps(hub, TICK_RATE);
  assert.equal(c.room?.kind, 'dungeon', 'через 50 с ещё ждём (у других режимов — 45 с)');
  clock.now += DG_LOST_MS - 50_000;
  steps(hub, TICK_RATE);
  assert.equal(c.closed, true);
  assert.equal(hub.dungeon!.rooms.size, 0);
  assert.equal(c.profile!.stats.dgBest, 1);
});

test('рекорды: неделя с понедельника 00:00 МСК; старые сохранения без полей «Подземелья» грузятся', () => {
  // суббота 10.10.2026 → понедельник 05.10.2026 00:00 МСК = 04.10 21:00 UTC
  assert.equal(dgWeekStart(Date.UTC(2026, 9, 10, 12)), Date.UTC(2026, 9, 4, 21));
  assert.equal(dgWeekStart(Date.UTC(2026, 9, 11, 21)), Date.UTC(2026, 9, 11, 21), 'ровно понедельник 00:00 МСК — новая неделя');
  assert.equal(dgWeekStart(Date.UTC(2026, 9, 11, 20, 59)), Date.UTC(2026, 9, 4, 21));
  const p = normalizeProfile({ id: 3, nick: 'Старый', tokens: 10, stats: { ftGames: 2 } })!;
  assert.deepEqual([p.stats.dgRuns, p.stats.dgBest, p.stats.dgBestMs, p.stats.dgKills, p.stats.dgBosses, p.stats.ftGames], [0, 0, 0, 0, 0, 2]);
});
