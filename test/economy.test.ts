// Жетоны: день по Москве, награды за пейнтбол, дурака и гонку, цены вещей.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PB_MIN_PLAY_TICKS, durakReward, emptyStats, itemPrice, mskDay, paintballReward, raceReward } from '../shared/economy.ts';

test('день бонуса считается по Москве (UTC+3)', () => {
  assert.equal(mskDay(Date.UTC(2026, 9, 1, 20, 59, 59)), '2026-10-01');
  assert.equal(mskDay(Date.UTC(2026, 9, 1, 21, 0, 0)), '2026-10-02');
  assert.equal(mskDay(Date.UTC(2026, 11, 31, 22, 0, 0)), '2027-01-01');
});

test('награда за раунд пейнтбола: только если играл минуту, сбитые — не больше 30', () => {
  assert.equal(paintballReward({ playTicks: PB_MIN_PLAY_TICKS - 1, kills: 5, won: true, mvp: true }), null);
  assert.deepEqual(paintballReward({ playTicks: PB_MIN_PLAY_TICKS, kills: 0, won: false, mvp: false }), { total: 15, round: 15, kills: 0, win: 0, mvp: 0 });
  assert.deepEqual(paintballReward({ playTicks: 20000, kills: 20, won: true, mvp: true }), { total: 95, round: 15, kills: 45, win: 20, mvp: 15 });
  assert.deepEqual(paintballReward({ playTicks: 20000, kills: 3, won: true, mvp: false }), { total: 44, round: 15, kills: 9, win: 20, mvp: 0 });
});

test('цены: обычная 300, редкая 1200, эпическая 3600, премиальная 12000; награды не продаются', () => {
  assert.equal(itemPrice('common'), 300);
  assert.equal(itemPrice('rare'), 1200);
  assert.equal(itemPrice('epic'), 3600);
  assert.equal(itemPrice('premium'), 12000);
  assert.equal(itemPrice('trophy'), null);
  assert.equal(itemPrice('free'), null);
  assert.equal(itemPrice('jackpot'), null);
  assert.equal(itemPrice('system'), null);
});

test('награда за дурака: доиграл 10, не дурак ещё 10, вышел первым — по 5 за каждого соперника', () => {
  assert.deepEqual(durakReward({ fool: true, first: false, players: 4 }), { total: 15, finish: 15, notFool: 0, first: 0 });
  assert.deepEqual(durakReward({ fool: false, first: false, players: 4 }), { total: 30, finish: 15, notFool: 15, first: 0 });
  assert.deepEqual(durakReward({ fool: false, first: true, players: 2 }), { total: 38, finish: 15, notFool: 15, first: 8 });
  // чем больше за столом (боты считаются), тем труднее выйти первым — и тем больше за это
  assert.deepEqual([2, 3, 4, 5, 6].map((players) => durakReward({ fool: false, first: true, players }).total), [38, 46, 54, 62, 70]);
  // «первый» и «дурак» сразу не бывает, но если вдруг — за первое место ничего
  assert.equal(durakReward({ fool: true, first: true, players: 6 }).first, 0);
});

test('награда за гонку: финиш 10, места 25 / 15 / 10, дальше — только финиш', () => {
  assert.deepEqual(raceReward(1), { total: 55, finish: 15, place: 40, pos: 1 });
  assert.deepEqual(raceReward(2), { total: 40, finish: 15, place: 25, pos: 2 });
  assert.deepEqual(raceReward(3), { total: 30, finish: 15, place: 15, pos: 3 });
  assert.deepEqual(raceReward(4), { total: 15, finish: 15, place: 0, pos: 4 });
  const st = emptyStats();
  assert.deepEqual([st.rcRaces, st.rcWins, st.rcPodiums, st.rcBestLap], [0, 0, 0, 0]);
});
