// Боты играют сами с собой 90 секунд симуляции: ходят, стреляют, убивают, не застревают навсегда.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHASE_PLAY, TICK_RATE } from '../shared/constants.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { Game, type Sink } from '../server/paintball/game.ts';

test('боты воюют: есть убийства, счёт растёт, все живые двигаются', () => {
  const game = new Game();
  const msgs: ServerMsg[] = [];
  const sink: Sink = { sendBinary() {}, sendJson(m) { msgs.push(m); }, close() {} };
  const human = game.addHuman({ pid: 1, nick: 'Тестер', outfit: DEFAULT_OUTFIT }, sink);
  assert.ok(human);
  // человек стоит на спавне и ничего не делает — пусть не мешает
  game.botsPerTeam = 4;
  game.balanceBots();
  assert.equal(game.players.size, 8);

  const start = new Map<number, { x: number; z: number }>();
  const moved = new Map<number, number>();
  const t0 = performance.now();
  for (let i = 0; i < 90 * TICK_RATE; i++) {
    game.step();
    if (game.phase === PHASE_PLAY && start.size === 0) {
      for (const p of game.players.values()) start.set(p.id, { x: p.state.x, z: p.state.z });
    }
    for (const p of game.players.values()) {
      if (!p.isBot) continue;
      const s = start.get(p.id);
      if (s) moved.set(p.id, Math.max(moved.get(p.id) ?? 0, Math.hypot(p.state.x - s.x, p.state.z - s.z)));
    }
  }
  const ms = performance.now() - t0;
  const kills = [...game.players.values()].reduce((a, p) => a + p.kills, 0);
  const deaths = [...game.players.values()].reduce((a, p) => a + p.deaths, 0);
  console.log(`90 с игры за ${ms.toFixed(0)} мс (${(ms / (90 * TICK_RATE)).toFixed(3)} мс/тик); убийств: ${kills}, смертей: ${deaths}, счёт ${game.scores.join(':')}`);
  for (const p of game.players.values()) {
    console.log(`  ${p.isBot ? 'бот ' : 'чел.'} ${p.name.padEnd(10)} команда ${p.team} K/D ${p.kills}/${p.deaths} уехал на ${(moved.get(p.id) ?? 0).toFixed(1)} м, бонус ${JSON.stringify(p.bonus)}`);
  }
  assert.ok(kills >= 6, `слишком мало убийств: ${kills}`);
  for (const p of game.players.values()) {
    if (p.isBot) assert.ok((moved.get(p.id) ?? 0) > 5, `${p.name} почти не двигался`);
  }
  assert.ok(msgs.some((m) => m.t === 'slot' || m.t === 'round'));
});
