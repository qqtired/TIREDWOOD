// «Крепость»: учёт забега по профилю (P1) — повторный вход не выдаёт бюджет заново, жетоны за отбитые волны
// платятся при выходе и в итогах ровно один раз, статистика профиля считает игру один раз.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FIX_PRICE, FT_BREAK, FT_END, FT_WAVE, START_PTS, type FortResultRow, type FtReward } from '../shared/fort.ts';
import { waveTokens } from '../shared/fortwaves.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FortGame, type FortPlayer } from '../server/fort/game.ts';
import type { Sink } from '../server/paintball/game.ts';

function sink(): Sink & { msgs: ServerMsg[] } {
  const msgs: ServerMsg[] = [];
  return { msgs, sendBinary() {}, sendJson(m) { msgs.push(m); }, close() {} };
}

interface Paid { pid: number; row: FortResultRow; reward: FtReward | null }

function game(): { g: FortGame; paid: Paid[] } {
  const paid: Paid[] = [];
  const g = new FortGame({ result: (p, row, reward) => paid.push({ pid: p.pid, row, reward }) });
  return { g, paid };
}

/** Волна w: старт и все сбиты стрелком killer — до передышки */
function clearWave(g: FortGame, killer: FortPlayer): void {
  const wave = g.wave;
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, FT_WAVE);
  assert.equal(g.wave, wave + 1);
  for (let i = 0; i < 200 * TICK_RATE && g.phase === FT_WAVE; i++) {
    for (const z of g.horde.zombies) if (z.alive) g.horde.damage(z, 1e9, killer.id, true, z.x, z.y + 1, z.z);
    g.step();
  }
  assert.equal(g.phase, FT_BREAK);
}

test('P1: выход и вход в ту же игру не возвращает стартовые очки — потраченное остаётся потраченным', () => {
  const { g } = game();
  const a = g.addHuman({ pid: 11, nick: 'Строитель', outfit: DEFAULT_OUTFIT }, sink())!;
  g.addHuman({ pid: 12, nick: 'Союзник', outfit: DEFAULT_OUTFIT }, sink())!;
  assert.equal(a.pts, START_PTS);
  // ремонт ворот у стойки
  g.gate = 900;
  const st = g.map.stations.find((s) => s.kind === 'gate')!;
  Object.assign(a.state, { x: st.x, y: st.y, z: st.z });
  g.use(a, st.id);
  assert.equal(a.pts, START_PTS - FIX_PRICE);
  g.removePlayer(a.id);
  const back = g.addHuman({ pid: 11, nick: 'Строитель', outfit: DEFAULT_OUTFIT }, sink())!;
  assert.equal(back.pts, START_PTS - FIX_PRICE, 'вернулся — с тем, что было, а не с новыми 50');
  assert.equal(g.gate, 900 + 400, 'ремонт тоже сохранился');
  // другой профиль — свой старт
  const c = g.addHuman({ pid: 13, nick: 'Новенький', outfit: DEFAULT_OUTFIT }, sink())!;
  assert.equal(c.pts, START_PTS);
});

test('жетоны за волны платятся при выходе, при возвращении — только новые; итоги считают игру один раз', () => {
  const { g, paid } = game();
  const a = g.addHuman({ pid: 21, nick: 'Ветеран', outfit: DEFAULT_OUTFIT }, sink())!;
  const b = g.addHuman({ pid: 22, nick: 'Друг', outfit: DEFAULT_OUTFIT }, sink())!;
  clearWave(g, a);
  clearWave(g, a);
  assert.equal(a.waves, 2);
  const kills = a.kills;
  g.removePlayer(a.id);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].pid, 21);
  assert.equal(paid[0].reward!.waves, waveTokens(1) + waveTokens(2));
  assert.equal(paid[0].row.again, false, 'первая выплата — игра считается');
  assert.equal(paid[0].row.kNew, kills);
  // вернулся, отбили ещё волну, потом кристалл разбит
  const a2 = g.addHuman({ pid: 21, nick: 'Ветеран', outfit: DEFAULT_OUTFIT }, sink())!;
  assert.equal(a2.waves, 2, 'забег продолжается');
  clearWave(g, a2);
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, FT_WAVE);
  g.crystal = 0;
  g.step();
  assert.equal(g.phase, FT_END);
  const last = paid.filter((p) => p.pid === 21);
  assert.equal(last.length, 2);
  assert.equal(last[1].reward!.waves, waveTokens(3), 'волны 1–2 уже оплачены при выходе');
  assert.equal(last[1].row.again, true, 'игру в статистике второй раз не считают');
  assert.equal(last[1].row.kNew, a2.kills - kills);
  const friend = paid.find((p) => p.pid === 22)!;
  assert.equal(friend.reward!.waves, waveTokens(1) + waveTokens(2) + waveTokens(3));
  assert.equal(b.waves, 3);
});

test('вышел, ничего не отбив, — ни выплаты, ни игры в статистике; пустая крепость — новая игра и новый забег', () => {
  const { g, paid } = game();
  const a = g.addHuman({ pid: 31, nick: 'Гость', outfit: DEFAULT_OUTFIT }, sink())!;
  g.removePlayer(a.id);
  assert.equal(paid.length, 0);
  const again = g.addHuman({ pid: 31, nick: 'Гость', outfit: DEFAULT_OUTFIT }, sink())!;
  assert.equal(again.pts, START_PTS);
  clearWave(g, again);
  g.removePlayer(again.id);
  assert.equal(paid.length, 1);
  // все ушли — следующий вход начинает новую игру с чистого листа
  const fresh = g.addHuman({ pid: 31, nick: 'Гость', outfit: DEFAULT_OUTFIT }, sink())!;
  assert.equal(fresh.waves, 0);
  assert.equal(fresh.pts, START_PTS);
});
