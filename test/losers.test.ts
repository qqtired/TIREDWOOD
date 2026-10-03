// «Топ проигравших» в павильоне автоматов: ставки и выигрыши в профиле, порядок и пять строк, экран — только когда
// докрутились барабаны, смена ника, сохранение, старые профили без новых полей.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { LOSERS_ROWS } from '../shared/messages.ts';
import { REELS, SPIN_READY_TICKS, SPIN_TICKS, evaluate } from '../shared/slots.ts';
import type { Client, Hub } from '../server/hub.ts';
import { LosersBoard, topLosers } from '../server/lobby/losers.ts';
import { Store, normalizeProfile, type Profile } from '../server/store.ts';
import { allOf, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

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
function prof(id: number, nick: string, bet: number, paid: number): Profile {
  const p = normalizeProfile({ id, nick })!;
  p.stats.slotBet = bet;
  p.stats.slotPaid = paid;
  return p;
}

// Копеечка (ставка 1): вишня, лимон, колокол — пусто; три вишни — 6; три семёрки — джекпот.
// Полтинник (ставка 50): лимон, якорь, колокол — пусто.
const LOSE0 = [0, 1, 2] as const;
const CHERRIES = [0, 0, 0] as const;
const SEVENS = [5, 5, 5] as const;
const LOSE4 = [1, 3, 2] as const;

test('вращение: ставка — в slotBet, выигрыш (и джекпот) — в slotPaid', () => {
  assert.equal(evaluate(0, LOSE0).win, 0);
  assert.equal(evaluate(0, CHERRIES).win, 6);
  const { hub, queue } = setup();
  const a = login(hub, 'Игроман');
  const st = a.c.profile!.stats;
  assert.deepEqual([st.slotBet, st.slotPaid], [0, 0]);
  sit(hub, a.c, 0);
  queue.push(...rolls(0, LOSE0));
  hub.onJson(a.c, { t: 'spin' });
  assert.deepEqual([st.slotBet, st.slotPaid], [1, 0]);
  steps(hub, SPIN_READY_TICKS);
  queue.push(...rolls(0, CHERRIES));
  hub.onJson(a.c, { t: 'spin' });
  assert.deepEqual([st.slotBet, st.slotPaid], [2, 6]);
  steps(hub, SPIN_READY_TICKS);
  queue.push(...rolls(0, SEVENS));
  hub.onJson(a.c, { t: 'spin' });
  const jp = lastOf(a.s, 'slotSpin')!;
  assert.equal(jp.jackpot, true);
  assert.ok(jp.win > 100, 'джекпот — со своей долей банка');
  assert.deepEqual([st.slotBet, st.slotPaid], [3, 6 + jp.win]);
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
  const top = topLosers(list);
  assert.deepEqual(top.map((r) => [r.pid, r.nick, r.n]), [[5, 'Гоша', 999], [3, 'Борис', 200], [4, 'Алла', 200], [7, 'Ева', 40], [8, 'Женя', 30]]);
  assert.deepEqual(topLosers([...list].reverse()), top, 'порядок не зависит от того, как лежат профили');
  assert.deepEqual(topLosers([prof(1, 'При своих', 5, 5), prof(2, 'В плюсе', 5, 9)]), []);
});

test('экран: итог вращения — только когда докрутились барабаны, всем на набережной; вошедшему — сразу при входе', () => {
  assert.equal(evaluate(4, LOSE4).win, 0);
  const { hub, queue } = setup();
  const a = login(hub, 'Растратчик');
  const b = login(hub, 'Зевака');
  assert.deepEqual(lastOf(b.s, 'lobby')!.losers, [], 'пока никто не проиграл');
  sit(hub, a.c, 4);
  queue.push(...rolls(4, LOSE4));
  hub.onJson(a.c, { t: 'spin' });
  const late = login(hub, 'Опоздун');
  assert.deepEqual(lastOf(late.s, 'lobby')!.losers, [], 'вошёл, пока барабаны крутятся, — итога ещё нет');
  steps(hub, SPIN_TICKS - 1);
  assert.equal(allOf(b.s, 'losers').length, 0, 'пока крутится — экран не подсказывает');
  steps(hub, 1);
  const row = { pid: a.c.profile!.id, nick: 'Растратчик', n: 50 };
  assert.deepEqual(lastOf(b.s, 'losers')!.top, [row]);
  assert.deepEqual(lastOf(a.s, 'losers')!.top, [row], 'и самому');
  assert.deepEqual(lastOf(late.s, 'losers')!.top, [row]);
  const fresh = login(hub, 'Новичок');
  assert.deepEqual(lastOf(fresh.s, 'lobby')!.losers, [row]);
  // джекпот выводит в плюс — строка уходит с экрана (тоже после остановки)
  steps(hub, SPIN_READY_TICKS);
  queue.push(...rolls(4, SEVENS));
  hub.onJson(a.c, { t: 'spin' });
  steps(hub, SPIN_TICKS - 1);
  assert.deepEqual(lastOf(b.s, 'losers')!.top, [row]);
  steps(hub, 1);
  assert.deepEqual(lastOf(b.s, 'losers')!.top, []);
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
  steps(hub, 60);
  assert.deepEqual(lastOf(b.s, 'losers')!.top.map((r) => [r.nick, r.n]), [['Первый', 50], ['Второй', 1]]);
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
  const board = new LosersBoard(() => [p]);
  assert.deepEqual(board.top, []);
  assert.equal(board.step(100), null, 'ничего не крутится — ничего не делает');
  p.stats.slotBet += 10;
  board.spun(1, 10, 150);
  assert.equal(board.refresh(), null, 'проигрыш ещё скрыт');
  assert.equal(board.step(149), null);
  assert.deepEqual(board.step(150), [{ pid: 1, nick: 'Тестер', n: 10 }]);
  assert.equal(board.refresh(), null, 'ничего не поменялось');
  p.nick = 'Тестер2';
  assert.deepEqual(board.refresh(), [{ pid: 1, nick: 'Тестер2', n: 10 }]);
  assert.deepEqual(board.top, [{ pid: 1, nick: 'Тестер2', n: 10 }]);
});

test('сохраняется: после перезапуска ставки и выигрыши на месте и топ тот же', () => {
  const { hub, store, queue } = setup();
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
  assert.deepEqual(new LosersBoard(() => again.state.profiles).top, hub.lobby.slots.losers.top);
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
    assert.deepEqual([bad.stats.slotBet, bad.stats.slotPaid, bad.stats.spins], [0, 0, 0]);
    assert.deepEqual(new LosersBoard(() => s.state.profiles).top, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
