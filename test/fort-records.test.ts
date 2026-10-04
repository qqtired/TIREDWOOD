// Рекорды «Крепости» (shared/fortrecord.ts, server/fort/game.ts, server/store.ts). Рекорд — ОТБИТЫЕ волны, а не номер
// начатой; общий рекорд меняется только при большем числе волн и пишется сразу после отбитой волны (одна запись на
// игру); свой рекорд — сразу в профиль; таблица переживает перезапуск, старый state.json без неё читается.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import * as F from '../shared/fort.ts';
import { namesLine, recWhen, wavesText } from '../shared/fortrecord.ts';
import { FortGame } from '../server/fort/game.ts';
import { addFortRun, Store } from '../server/store.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { lastOf, login, placeAt, setupHub, steps } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

type Msg = ServerMsg;
const of = <T extends Msg['t']>(list: Msg[], t: T) => list.filter((m): m is Extract<Msg, { t: T }> => m.t === t);

/** Начать волну (минуя сбор и передышку) и отбить её целиком */
function clearWave(game: FortGame, by: number): void {
  if (game.phase !== F.FT_WAVE) {
    game.phaseEnd = game.tick + 1;
    game.step();
  }
  assert.equal(game.phase, F.FT_WAVE);
  for (let i = 0; i < 200 * TICK_RATE && game.phase === F.FT_WAVE; i++) {
    for (const z of game.horde.zombies) if (z.alive) game.horde.damage(z, 1e12, by, true, z.x, z.y + 1, z.z);
    game.step();
  }
}

test('рекорд крепости — отбитые волны: повторили — не побит, больше — побит, сразу после волны, одна строка на игру', () => {
  let top: F.FortRunRec[] = [{ wave: 2, names: ['Старожил'], at: 1, n: 1 }];
  const msgs: Msg[] = [];
  const grew: number[] = [];
  const said: string[] = [];
  const game = new FortGame({
    top: () => top, saveRun: (rec) => { top = addFortRun(top, rec); }, progress: (_p, w) => grew.push(w), announce: (t) => said.push(t),
  });
  const sink = { sendJson: (m: Msg) => msgs.push(m), sendBinary() {}, close() {} };
  const p = game.addHuman({ pid: 1, nick: 'Защ', outfit: DEFAULT_OUTFIT, best: 1 }, sink)!;
  const hello = of(msgs, 'fort')[0];
  assert.deepEqual(hello.rec, { top: { wave: 2, names: ['Старожил'], at: 1 }, base: 2, best: 1, my: 0 }, 'при входе — рекорд и свой');

  clearWave(game, p.id);
  assert.equal(game.cleared, 1);
  assert.deepEqual(top.map((t) => [t.wave, t.names[0]]), [[2, 'Старожил'], [1, 'Защ']], 'забег — в таблице сразу');
  assert.equal(of(msgs, 'frec').length, 0, 'одна волна: ни рекорда, ни своего (было 1)');

  clearWave(game, p.id);
  assert.equal(top[0].names[0], 'Старожил', 'повторили — рекорд за тем, кто раньше');
  assert.deepEqual(of(msgs, 'frec').map((m) => [m.k, m.wave, m.prev, m.first ?? false]), [['tie', 2, 2, false], ['me', 2, 1, true]]);
  assert.deepEqual(grew, [2], 'свой рекорд — сразу в профиль');

  clearWave(game, p.id);
  assert.deepEqual([top[0].wave, top[0].names, top[0].id], [3, ['Защ'], game.runId], 'побили — рекорд наш');
  assert.equal(top.filter((t) => t.id === game.runId).length, 1, 'одна строка на игру, а не по строке на волну');
  assert.deepEqual(of(msgs, 'frec').slice(2).map((m) => [m.k, m.wave, m.prev]), [['team', 3, 2], ['me', 3, 1]]);
  assert.equal(said.length, 1, 'всему серверу — один раз за игру');

  // началась 4-я: в рекорде по-прежнему 3 — начатая волна не считается
  game.phaseEnd = game.tick + 1;
  game.step();
  assert.equal(game.phase, F.FT_WAVE);
  assert.equal(game.wave, 4);
  assert.equal(top[0].wave, 3);
  assert.deepEqual(game.status().rec, { wave: 3, names: ['Защ'], at: top[0].at, live: true });
  // кристалл разбит на 4-й: итоги — 3 волны, новый рекорд против того, что был до игры
  game.crystal = 0;
  game.step();
  const end = of(msgs, 'fend')[0];
  assert.deepEqual([end.wave, end.record, end.prev, end.run], [3, true, 2, game.runId]);
  assert.deepEqual([end.rows[0].best, end.rows[0].my], [1, 3], 'свой: до игры 1, в игре 3');
  assert.equal(top[0].wave, 3);
  assert.equal(said.length, 2, 'и в итогах — строка всем');
});

test('новая игра с меньшим числом волн рекорд не трогает; зашедший позже — свой рекорд только за засчитанные волны', () => {
  let top: F.FortRunRec[] = [{ wave: 5, names: ['Рома', 'Петя'], at: 10, n: 2, id: 77 }];
  const msgs: Msg[] = [];
  const game = new FortGame({ top: () => top, saveRun: (rec) => { top = addFortRun(top, rec); } });
  const sink = { sendJson: (m: Msg) => msgs.push(m), sendBinary() {}, close() {} };
  const a = game.addHuman({ pid: 1, nick: 'А', outfit: DEFAULT_OUTFIT, best: 0 }, sink)!;
  clearWave(game, a.id);
  clearWave(game, a.id);
  // второй входит в передышке и уходит, не дождавшись волны: свой рекорд ему не засчитан
  const late = game.addHuman({ pid: 2, nick: 'Б', outfit: DEFAULT_OUTFIT, best: 0 }, sink)!;
  assert.equal(late.run.best0, 0);
  game.removePlayer(late.id);
  assert.equal(late.run.recWave, 0);
  assert.deepEqual(top.map((t) => t.wave), [5, 2]);
  assert.deepEqual([top[0].names, top[0].id], [['Рома', 'Петя'], 77], 'рекорд не тронут');
  assert.equal(of(msgs, 'frec').filter((m) => m.k !== 'me').length, 0, 'до рекорда далеко — ни «повторили», ни «побили»');
  // новая игра после итогов: рекорды заново, рекорд до игры — тот же
  game.crystal = 0;
  game.phaseEnd = game.tick + 1;
  game.step();
  game.step();
  assert.equal(game.phase, F.FT_END);
  game.phaseEnd = game.tick + 1;
  game.step();
  assert.equal(game.phase, F.FT_GATHER);
  const again = of(msgs, 'frecNew').at(-1)!;
  assert.deepEqual([again.rec.base, again.rec.best, again.rec.my, again.rec.top?.wave], [5, 2, 0, 5]);
});

test('свой рекорд — в профиль сразу (без итогов); все ушли посреди игры — рекорд крепости остаётся и переживает перезапуск', () => {
  const { hub, store } = setupHub({ fort: true });
  store.state.fortTop = [{ wave: 1, names: ['Старожил'], at: 1, n: 1 }];
  const point = buildLobby().interact.find((i) => i.kind === 'fort')!;
  const { c, s } = login(hub, 'Рекордсмен');
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, point.x, point.z);
  hub.onJson(c, { t: 'use', id: point.id });
  const game = hub.fort!.game;
  const p = hub.fort!.playerOf(c)!;
  assert.deepEqual(lastOf(s, 'fort')?.rec?.top?.names, ['Старожил']);
  clearWave(game, p.id);
  clearWave(game, p.id);
  assert.equal(c.profile!.stats.ftBest, 2, 'свой рекорд — сразу после волны');
  assert.equal(lastOf(s, 'frec')?.k, 'me');
  // ушёл посреди третьей волны — итогов не было, рекорд уже в таблице
  game.phaseEnd = game.tick + 1;
  hub.step();
  hub.move(c, hub.lobby, true);
  assert.equal(game.humanCount, 0);
  assert.deepEqual([store.state.fortTop?.[0].wave, store.state.fortTop?.[0].names], [2, ['Рекордсмен']]);
  assert.equal(c.profile!.stats.ftBest, 2, 'при выходе свой рекорд — те же 2, не 3 (третья не отбита)');
  // на набережной — рекорд в статусе крепости (табличка у входа)
  assert.deepEqual(hub.fortStatus()?.rec, { wave: 2, names: ['Рекордсмен'], at: store.state.fortTop![0].at });
  store.flush();
  const again = new Store(store.dir, { log: () => {} });
  again.load();
  assert.deepEqual(again.state.fortTop, store.state.fortTop, 'после перезапуска — та же таблица, с номером игры');
  assert.ok((again.state.fortTop?.[0].id ?? 0) > 0);
  assert.equal(again.state.profiles.find((x) => x.nick === 'Рекордсмен')?.stats.ftBest, 2);
});

test('старый state.json: без рекордов крепости, без номеров игр, с битым номером — читается, ничего не теряется', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fort-rec-'));
  dirs.push(dir);
  const prof = { id: 3, nick: 'Ветеран', keyHashes: [], createdAt: 1, lastSeen: 2, tokens: 500, owned: [], daily: '', stats: { ftGames: 4, ftWins: 0, ftBest: 8, ftKills: 120 } };
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ v: 1, nextId: 4, jackpot: 1000, respects: 0, aqua: [], profiles: [prof] }));
  const old = new Store(dir, { log: () => {} });
  old.load();
  assert.equal(old.state.fortTop, undefined, 'поля не было — нет и таблицы (появится с первой отбитой волной)');
  assert.equal(old.state.profiles[0].stats.ftBest, 8, 'свой рекорд из старого профиля на месте');
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ v: 1, nextId: 4, profiles: [prof],
    fortTop: [{ wave: 12, names: ['Рома'], at: 5, n: 1 }, { wave: 30, names: ['Петя'], at: 9, n: 2, id: 1759500000000 }, { wave: 7, names: ['Вася'], at: 3, n: 1, id: -4 }] }));
  const mixed = new Store(dir, { log: () => {} });
  mixed.load();
  assert.deepEqual(mixed.state.fortTop, [
    { wave: 30, names: ['Петя'], at: 9, n: 2, id: 1759500000000 }, { wave: 12, names: ['Рома'], at: 5, n: 1 }, { wave: 7, names: ['Вася'], at: 3, n: 1 },
  ]);
});

test('слова рекордов: волны по-русски, ники команды, когда', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 47, 112].map(wavesText), ['1 волна', '2 волны', '5 волн', '11 волн', '21 волна', '22 волны', '47 волн', '112 волн']);
  assert.equal(namesLine(['Рома']), 'Рома');
  assert.equal(namesLine(['Рома', 'Петя', 'Вася']), 'Рома, Петя и Вася');
  assert.equal(namesLine(['А', 'Б', 'В', 'Г', 'Д']), 'А, Б, В и ещё 2');
  const now = Date.UTC(2026, 9, 4, 12);
  assert.deepEqual([recWhen(now - 3600_000, now), recWhen(now - 86_400_000, now), recWhen(Date.UTC(2026, 8, 28, 12), now), recWhen(Date.UTC(2025, 9, 3, 12), now)],
    ['сегодня', 'вчера', '28 сентября', '3 октября 2025']);
});
