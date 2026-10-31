// «Топ проигравших»: автоматы и рулетка за неделю и за всё время, без преждевременного раскрытия итогов.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ROULETTE_SPOT } from '../shared/fishplaces.ts';
import { LOSERS_ALL_ROWS, LOSERS_ROWS } from '../shared/messages.ts';
import { ROULETTE_SPIN_MS } from '../shared/roulette.ts';
import { REELS, SPIN_READY_TICKS, SPIN_TICKS, evaluate } from '../shared/slots.ts';
import { Hub, type Client } from '../server/hub.ts';
import { dgWeekStart } from '../server/dungeon/records.ts';
import { addLoss, LosersBoard, rouletteLost, topLosers, topLosersAll } from '../server/lobby/losers.ts';
import { Profiles } from '../server/profiles.ts';
import { Store, normalizeProfile, type Profile } from '../server/store.ts';
import { SMOKE, allOf, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

const NOW = Date.UTC(2026, 9, 1, 12);

/** Хаб, где барабаны выдают то, что положили в очередь (положение на ленте 0..63) */
function setup() {
  const queue: number[] = [];
  return { ...setupHub({ roll: () => queue.shift() ?? 0 }), queue };
}

/** Положения на лентах автомата m, на которых выпадут эти символы */
function rolls(m: number, syms: readonly [number, number, number]): number[] {
  return syms.map((s, k) => REELS[m][k].slice(0, s).reduce((a, b) => a + b, 0));
}

/** Встать к автомату m (как будто дошёл сам) */
function sit(hub: Hub, c: Client, m: number): void {
  const it = hub.lobby.map.interact.find((i) => i.kind === 'slot' && i.arg === m);
  assert.ok(it, `автомат ${m}`);
  placeAt(hub, c, it.x, it.z);
  hub.onJson(c, { t: 'use', id: it.id });
}

/** Профиль с такими ставками и выигрышами в автоматах */
function prof(id: number, nick: string, bet: number, paid: number, now = NOW): Profile {
  const p = normalizeProfile({ id, nick })!;
  p.stats.slotBet = bet;
  p.stats.slotPaid = paid;
  addLoss(p.stats, bet - paid, now);
  return p;
}

// Копеечка (ставка 1): вишня, лимон, колокол — пусто; три вишни — 6; три семёрки — джекпот.
// Полтинник (ставка 50): лимон, якорь, колокол — пусто.
const LOSE0 = [0, 1, 2] as const;
const CHERRIES = [0, 0, 0] as const;
const SEVENS = [5, 5, 5] as const;
const LOSE4 = [1, 3, 2] as const;

test('вращение: ставка и выигрыш (с джекпотом) — в общий и недельный счёт', () => {
  assert.equal(evaluate(0, LOSE0).win, 0);
  assert.equal(evaluate(0, CHERRIES).win, 6);
  const { hub, queue, clock } = setup();
  const a = login(hub, 'Игроман');
  const st = a.c.profile!.stats;
  assert.deepEqual([st.slotBet, st.slotPaid], [0, 0]);
  assert.deepEqual([st.lsWeek, st.lsLost], [0, 0]);
  sit(hub, a.c, 0);
  queue.push(...rolls(0, LOSE0));
  hub.onJson(a.c, { t: 'spin' });
  assert.deepEqual([st.slotBet, st.slotPaid], [1, 0]);
  assert.deepEqual([st.lsWeek, st.lsLost], [dgWeekStart(clock.now), 1]);
  steps(hub, SPIN_READY_TICKS);
  assert.deepEqual(hub.lobby.slots.losers.top.map((r) => r.n), [1]);
  queue.push(...rolls(0, CHERRIES));
  hub.onJson(a.c, { t: 'spin' });
  assert.deepEqual([st.slotBet, st.slotPaid], [2, 6]);
  assert.equal(st.lsLost, -4);
  steps(hub, SPIN_READY_TICKS);
  assert.deepEqual(hub.lobby.slots.losers.top, []);
  queue.push(...rolls(0, SEVENS));
  hub.onJson(a.c, { t: 'spin' });
  const jp = lastOf(a.s, 'slotSpin')!;
  assert.equal(jp.jackpot, true);
  assert.ok(jp.win > 100, 'джекпот — со своей долей банка');
  assert.deepEqual([st.slotBet, st.slotPaid], [3, 6 + jp.win]);
  assert.equal(st.lsLost, 3 - 6 - jp.win, 'джекпот вычитается из недельного проигрыша');
  assert.equal(st.slotWon, 6 + jp.win, 'выигрыши за всё время — как и раньше');
  assert.equal(st.spins, 3);
});

test('топ: только кто в минусе, больше проиграл — выше, поровну — старший профиль; не больше пяти строк', () => {
  const list = [
    prof(1, 'При своих', 50, 50),
    prof(2, 'Везунчик', 10, 400),
    prof(3, 'Борис', 300, 100),
    prof(4, 'Алла', 250, 50),
    prof(5, 'Гоша', 1000, 1),
    prof(6, 'Дима', 5, 0),
    prof(7, 'Ева', 60, 20),
    prof(8, 'Женя', 30, 0),
  ];
  assert.equal(LOSERS_ROWS, 5);
  const top = topLosers(list, undefined, NOW);
  assert.deepEqual(top.map((r) => [r.pid, r.nick, r.n]), [[5, 'Гоша', 999], [3, 'Борис', 200], [4, 'Алла', 200], [7, 'Ева', 40], [8, 'Женя', 30]]);
  assert.deepEqual(topLosers([...list].reverse(), undefined, NOW), top, 'порядок не зависит от того, как лежат профили');
  assert.deepEqual(topLosers([prof(1, 'При своих', 5, 5), prof(2, 'В плюсе', 5, 9)], undefined, NOW), []);
});

test('экран: итог вращения — только когда докрутились барабаны, всем на набережной; вошедшему — сразу при входе', () => {
  assert.equal(evaluate(4, LOSE4).win, 0);
  const { hub, queue } = setup();
  const a = login(hub, 'Растратчик');
  const b = login(hub, 'Зевака');
  assert.deepEqual(lastOf(b.s, 'lobby')!.losers, [], 'пока никто не проиграл');
  assert.deepEqual(lastOf(b.s, 'lobby')!.losersAll, []);
  sit(hub, a.c, 4);
  queue.push(...rolls(4, LOSE4));
  hub.onJson(a.c, { t: 'spin' });
  const late = login(hub, 'Опоздун');
  assert.deepEqual(lastOf(late.s, 'lobby')!.losers, [], 'вошёл, пока барабаны крутятся, — итога ещё нет');
  assert.deepEqual(lastOf(late.s, 'lobby')!.losersAll, []);
  steps(hub, SPIN_TICKS - 1);
  assert.equal(allOf(b.s, 'losers').length, 0, 'пока крутится — экран не подсказывает');
  steps(hub, 1);
  const row = { pid: a.c.profile!.id, nick: 'Растратчик', n: 50 };
  assert.deepEqual(lastOf(b.s, 'losers'), { t: 'losers', top: [row], all: [row] });
  assert.deepEqual(lastOf(a.s, 'losers')!.top, [row], 'и самому');
  assert.deepEqual(lastOf(late.s, 'losers')!.top, [row]);
  const fresh = login(hub, 'Новичок');
  assert.deepEqual(lastOf(fresh.s, 'lobby')!.losers, [row]);
  assert.deepEqual(lastOf(fresh.s, 'lobby')!.losersAll, [row]);
  // джекпот выводит в плюс — строка уходит с экрана (тоже после остановки)
  steps(hub, SPIN_READY_TICKS);
  queue.push(...rolls(4, SEVENS));
  hub.onJson(a.c, { t: 'spin' });
  steps(hub, SPIN_TICKS - 1);
  assert.deepEqual(lastOf(b.s, 'losers')!.top, [row]);
  steps(hub, 1);
  assert.deepEqual(lastOf(b.s, 'losers'), { t: 'losers', top: [], all: [] });
  assert.equal(allOf(b.s, 'losers').length, 2, 'рассылка — только когда топ меняется');
});

test('два автомата: экран не выдаёт итог второго вращения, пока его барабаны крутятся', () => {
  const { hub, queue } = setup();
  const a = login(hub, 'Первый');
  const b = login(hub, 'Второй');
  sit(hub, a.c, 4);
  sit(hub, b.c, 0);
  queue.push(...rolls(4, LOSE4));
  hub.onJson(a.c, { t: 'spin' });
  steps(hub, 60);
  queue.push(...rolls(0, LOSE0));
  hub.onJson(b.c, { t: 'spin' });
  steps(hub, SPIN_TICKS - 60);
  assert.deepEqual(lastOf(b.s, 'losers')!.top.map((r) => r.nick), ['Первый']);
  assert.deepEqual(lastOf(b.s, 'losers')!.all?.map((r) => r.nick), ['Первый']);
  steps(hub, 60);
  assert.deepEqual(lastOf(b.s, 'losers')!.top.map((r) => [r.nick, r.n]), [['Первый', 50], ['Второй', 1]]);
  assert.deepEqual(lastOf(b.s, 'losers')!.all?.map((r) => [r.nick, r.n]), [['Первый', 50], ['Второй', 1]]);
});

test('смена ника: на экране — новый ник, даже если меняли не с набережной; ник не из топа — без рассылки', () => {
  const { hub, queue } = setup();
  const a = login(hub, 'Транжира');
  const b = login(hub, 'Смотрящий');
  const c = login(hub, 'Тихоня');
  sit(hub, a.c, 0);
  queue.push(...rolls(0, LOSE0));
  hub.onJson(a.c, { t: 'spin' });
  steps(hub, SPIN_TICKS);
  assert.deepEqual(lastOf(b.s, 'losers')!.top.map((r) => r.nick), ['Транжира']);
  const sent = allOf(b.s, 'losers').length;
  hub.onJson(c.c, { t: 'rename', nick: 'Скромник' });
  assert.equal(c.c.nick, 'Скромник');
  assert.equal(allOf(b.s, 'losers').length, sent, 'кого нет на экране — экран не трогаем');
  // ушёл на склад и там сменил ник — экран на набережной всё равно обновился
  assert.ok(hub.move(a.c, hub.paintball, true));
  hub.onJson(a.c, { t: 'rename', nick: 'Мот' });
  assert.equal(a.c.nick, 'Мот');
  assert.deepEqual(lastOf(b.s, 'losers')!.top, [{ pid: a.c.profile!.id, nick: 'Мот', n: 1 }]);
  assert.equal(allOf(b.s, 'losers').length, sent + 1);
});

test('LosersBoard: считает только по событиям; итог вращения скрыт до своего тика; без перемен — null', () => {
  const p = prof(1, 'Тестер', 0, 0);
  const board = new LosersBoard(() => [p], () => NOW);
  assert.deepEqual(board.top, []);
  assert.equal(board.step(100), null, 'ничего не крутится — ничего не делает');
  p.stats.slotBet += 10;
  addLoss(p.stats, 10, NOW);
  board.spun(1, 10, 150);
  assert.equal(board.refresh(), null, 'проигрыш ещё скрыт');
  assert.equal(board.step(149), null);
  const row = { pid: 1, nick: 'Тестер', n: 10 };
  assert.deepEqual(board.step(150), { top: [row], all: [row] });
  assert.equal(board.refresh(), null, 'ничего не поменялось');
  p.nick = 'Тестер2';
  const renamed = { ...row, nick: 'Тестер2' };
  assert.deepEqual(board.refresh(), { top: [renamed], all: [renamed] });
  assert.deepEqual(board.top, [{ pid: 1, nick: 'Тестер2', n: 10 }]);
  assert.deepEqual(board.allTop, board.top);
});

test('сохраняется: после перезапуска ставки и выигрыши на месте и топ тот же', () => {
  const { hub, store, queue, clock } = setup();
  const a = login(hub, 'Постоянный');
  sit(hub, a.c, 1);
  queue.push(...rolls(1, [1, 3, 0]));
  assert.equal(evaluate(1, [1, 3, 0]).win, 0);
  hub.onJson(a.c, { t: 'spin' });
  steps(hub, SPIN_TICKS);
  assert.deepEqual(hub.lobby.slots.losers.top.map((r) => r.n), [5]);
  store.flush();
  const again = new Store(store.dir, { log: () => {} });
  again.load();
  const p = again.state.profiles.find((x) => x.id === a.c.profile!.id)!;
  assert.deepEqual([p.stats.slotBet, p.stats.slotPaid], [5, 0]);
  assert.deepEqual([p.stats.lsWeek, p.stats.lsLost], [dgWeekStart(clock.now), 5]);
  const board = new LosersBoard(() => again.state.profiles, () => clock.now);
  assert.deepEqual(board.top, hub.lobby.slots.losers.top);
  assert.deepEqual(board.allTop, hub.lobby.slots.losers.allTop);
});

test('старые профили без новых полей — нули и на экран не попадают; минус из битой записи — ноль', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-losers-'));
  try {
    writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
      v: 1, nextId: 3, jackpot: 1000, profiles: [
        { id: 1, nick: 'Старожил', keyHashes: ['aa'], tokens: 40, stats: { spins: 120, slotWon: 900, bestWin: 100 } },
        { id: 2, nick: 'Битый', keyHashes: ['bb'], tokens: 10, stats: { slotBet: -500, slotPaid: -20, spins: -3 } },
      ],
    }));
    const s = new Store(dir, { log: () => {} });
    s.load();
    const [old, bad] = s.state.profiles;
    assert.deepEqual([old.stats.slotBet, old.stats.slotPaid, old.stats.spins, old.stats.slotWon], [0, 0, 120, 900]);
    assert.deepEqual([old.stats.lsWeek, old.stats.lsLost], [0, 0]);
    assert.deepEqual([bad.stats.slotBet, bad.stats.slotPaid, bad.stats.spins], [0, 0, 0]);
    assert.deepEqual(new LosersBoard(() => s.state.profiles).top, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('неделя: за секунду до понедельника 00:00 МСК — прежний счёт, на границе — ноль без вращений', () => {
  const monday = Date.parse('2026-10-05T00:00:00+03:00');
  let now = monday - 1000;
  const p = prof(1, 'Недельный', 100, 0, now);
  const row = { pid: 1, nick: 'Недельный', n: 100 };
  const board = new LosersBoard(() => [p], () => now);
  assert.equal(p.stats.lsWeek, Date.parse('2026-09-28T00:00:00+03:00'));
  assert.deepEqual(topLosers([p], undefined, now), [row]);
  assert.deepEqual(board.top, [row]);
  assert.equal(board.step(1), null);
  now = monday;
  assert.deepEqual(topLosers([p], undefined, now), []);
  assert.deepEqual(board.step(2), { top: [], all: [row] });
  assert.deepEqual(board.top, []);
  assert.deepEqual(board.allTop, [row]);
  assert.equal(board.step(3), null, 'на границе рассылается один раз');
  addLoss(p.stats, -10, now);
  assert.deepEqual([p.stats.lsWeek, p.stats.lsLost], [monday, -10], 'первое вращение новой недели не прибавляет старый счёт');
  addLoss(p.stats, 15, now + 1000);
  assert.equal(p.stats.lsLost, 5);
  assert.deepEqual(topLosers([p], undefined, now), [{ ...row, n: 5 }]);
});

test('нормализация: недельные поля конечные и целые, выигрыш сохраняет отрицательный знак', () => {
  const p = normalizeProfile({ id: 1, nick: 'Выигравший', stats: { lsWeek: NOW + .9, lsLost: -12.9 } })!;
  assert.deepEqual([p.stats.lsWeek, p.stats.lsLost], [NOW, -12]);
  const invalid = normalizeProfile({ id: 2, nick: 'Битые числа', stats: { lsWeek: NaN, lsLost: Infinity } })!;
  assert.deepEqual([invalid.stats.lsWeek, invalid.stats.lsLost], [0, 0]);
});

test('смена недели во время вращения: скрытый выигрыш прошлой недели не превращается в новый проигрыш', () => {
  const monday = Date.parse('2026-10-05T00:00:00+03:00');
  let now = monday - 1000;
  const p = prof(1, 'Джекпот', 50, 0, now);
  const row = { pid: p.id, nick: p.nick, n: 50 };
  const board = new LosersBoard(() => [p], () => now);
  p.stats.slotBet++;
  p.stats.slotPaid += 101;
  addLoss(p.stats, -100, now);
  board.spun(p.id, -100, 200);
  assert.equal(board.refresh(), null);
  now = monday;
  assert.deepEqual(board.step(1), { top: [], all: [row] });
  assert.equal(board.step(199), null);
  assert.deepEqual(board.step(200), { top: [], all: [] });
});

test('allTop: автоматы и завершённая рулетка за всё время, только положительный итог, до трёх строк', () => {
  const a = prof(1, 'Первый', 100, 20);
  const b = prof(2, 'Второй', 100, 0);
  const c = prof(3, 'Третий', 20, 0);
  const d = prof(4, 'Четвёртый', 150, 0);
  const e = prof(5, 'В плюсе', 20, 0);
  Object.assign(a.stats, { rlStaked: 300, rlWon: 80 });
  a.rouletteEscrow = { round: 'ещё-крутится', amount: 100 };
  Object.assign(b.stats, { rlStaked: 100, rlWon: 0 });
  Object.assign(c.stats, { rlStaked: 1000, rlWon: 500 });
  Object.assign(e.stats, { rlStaked: 50, rlWon: 100 });
  // Недельный счёт тут устарел, общий всё равно остаётся.
  const list = [e, d, c, b, a];
  const now = NOW + 7 * 86_400_000;
  assert.equal(LOSERS_ALL_ROWS, 3);
  assert.equal(rouletteLost(a), 120, 'залог не входит в проигрыш');
  const expected = [{ pid: 3, nick: 'Третий', n: 520 }, { pid: 1, nick: 'Первый', n: 200 }, { pid: 2, nick: 'Второй', n: 200 }];
  assert.deepEqual(topLosersAll(list), expected);
  assert.deepEqual(topLosersAll([...list].reverse()), expected);
  assert.deepEqual(topLosersAll([e]), []);
  const board = new LosersBoard(() => list, () => now);
  assert.deepEqual(board.top, []);
  assert.deepEqual(board.allTop, expected);
  assert.equal(board.refresh(), null);
  c.nick = 'Новое имя';
  assert.deepEqual(board.refresh(), { top: [], all: [{ ...expected[0], nick: c.nick }, ...expected.slice(1)] }, 'изменение только общего списка тоже возвращает обновление');
});

test('рулетка: залог скрыт, расчёт учитывает проигрыш и выигрыш в недельном и общем счёте, выигрыш переживает загрузку', () => {
  const { hub, store, profiles, clock } = setup();
  const p = login(hub, 'Рулеточник').c.profile!;
  p.fishing.bag = [{ n: 1, f: 'tuna', g: 30_000, p: 100, m: 0 }];
  assert.deepEqual(profiles.reserveRoulette(p, 'проигрыш'), { stake: 100, fish: 1 });
  assert.equal(p.stats.rlStaked, 100);
  assert.equal(rouletteLost(p), 0);
  assert.equal(p.stats.lsLost, 0);
  assert.deepEqual(topLosersAll([p]), []);
  assert.equal(profiles.settleRoulette(p.id, 'проигрыш', 0), true);
  assert.equal(p.rouletteEscrow, null);
  assert.deepEqual([p.stats.lsWeek, p.stats.lsLost], [dgWeekStart(clock.now), 100]);
  assert.equal(rouletteLost(p), 100);
  assert.deepEqual(topLosers([p], undefined, clock.now), topLosersAll([p]));
  p.fishing.bag = [{ n: 2, f: 'tuna', g: 30_000, p: 150, m: 0 }];
  assert.ok(profiles.reserveRoulette(p, 'выигрыш'));
  assert.equal(rouletteLost(p), 100, 'новый залог не меняет завершённый счёт');
  assert.equal(profiles.settleRoulette(p.id, 'выигрыш', 300), true);
  assert.equal(p.stats.lsLost, -50);
  assert.equal(rouletteLost(p), -50);
  assert.deepEqual(topLosers([p], undefined, clock.now), []);
  assert.deepEqual(topLosersAll([p]), []);
  assert.equal(profiles.settleRoulette(p.id, 'выигрыш', 300), false);
  assert.equal(p.stats.lsLost, -50, 'повторный расчёт не меняет счёт');
  const again = new Store(store.dir, { now: () => clock.now, log: () => {} });
  again.load();
  const restored = again.state.profiles.find((r) => r.id === p.id)!;
  assert.deepEqual([restored.stats.lsWeek, restored.stats.lsLost], [dgWeekStart(clock.now), -50]);
  assert.equal(rouletteLost(restored), -50);
});

test('рулетка в хабе: после остановки колеса всем уходит losers {top, all}, во время вращения — нет', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-losers-roulette-'));
  const clock = { now: NOW };
  const now = () => clock.now;
  const store = new Store(dir, { now, log: () => {}, saveDelayMs: 60_000 });
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.load();
  const profiles = new Profiles(store, { now });
  const hub = new Hub({ store, profiles, now, log: () => {}, build: 'test', smokeToken: SMOKE, fish2: true, roulette: true, weather: 'clear' });
  const a = login(hub, 'Рыбак');
  const b = login(hub, 'Зритель');
  const p = a.c.profile!;
  const table = hub.lobby.roulette!;
  p.fishing.bag = [{ n: 1, f: 'tuna', g: 30_000, p: 100, m: 0 }];
  placeAt(hub, a.c, ROULETTE_SPOT.x + 1, ROULETTE_SPOT.z + 1, ROULETTE_SPOT.y);
  table.spin = () => 2; // чёрное, ставка на красное проигрывает
  hub.onJson(a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(table.view().phase, 'spin');
  assert.equal(hub.lobby.slots.losers.refresh(), null, 'залог не меняет ни одного списка');
  const late = login(hub, 'Поздний зритель');
  assert.deepEqual(lastOf(late.s, 'lobby')!.losers, []);
  assert.deepEqual(lastOf(late.s, 'lobby')!.losersAll, []);
  clock.now += ROULETTE_SPIN_MS - 1;
  hub.step();
  assert.equal(allOf(b.s, 'losers').length, 0);
  clock.now++;
  hub.step();
  const row = { pid: p.id, nick: p.nick, n: 100 };
  for (const { s } of [a, b, late]) assert.deepEqual(lastOf(s, 'losers'), { t: 'losers', top: [row], all: [row] });
  assert.equal(p.stats.lsLost, 100);
  const fresh = login(hub, 'Новый зритель');
  assert.deepEqual(lastOf(fresh.s, 'lobby')!.losers, [row]);
  assert.deepEqual(lastOf(fresh.s, 'lobby')!.losersAll, [row]);
  p.fishing.bag = [{ n: 2, f: 'tuna', g: 30_000, p: 150, m: 0 }];
  placeAt(hub, a.c, ROULETTE_SPOT.x + 1, ROULETTE_SPOT.z + 1, ROULETTE_SPOT.y);
  table.spin = () => 1; // красное, выигрыш выводит в плюс
  hub.onJson(a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(table.view().phase, 'spin');
  assert.equal(hub.lobby.slots.losers.refresh(), null);
  assert.equal(allOf(b.s, 'losers').length, 1);
  clock.now += ROULETTE_SPIN_MS;
  hub.step();
  assert.equal(p.stats.lsLost, -50);
  assert.deepEqual(lastOf(b.s, 'losers'), { t: 'losers', top: [], all: [] });
  assert.equal(allOf(b.s, 'losers').length, 2);
});
