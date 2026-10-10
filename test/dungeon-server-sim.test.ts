// «Подземелье»: сервер повторяет настоящую симуляцию по журналу клиента. Бот (tools/survivors/bot.mjs) играет у «клиента»,
// журнал идёт кусками dg_log; ждём, что копия сервера дошла до того же шага с тем же итогом, ни одного расхождения хеша,
// и жетоны пришли ровно за волны, отбитые у клиента.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DG_LOG_MAX, dgWaveCoins, type DgEvent } from '../shared/dungeon/api.ts';
import { applyEvent, createRun, dgHash, dgResult, step, type DgSim } from '../shared/dungeon/sim.ts';
import { allOf, lastOf, login, setupHub } from './kit.ts';

// бот симуляции — JS-модуль без типов (tools/survivors/bot.mjs)
const BOT = '../tools/survivors/bot.mjs';
const { botEvents } = (await import(BOT)) as { botEvents: (sim: DgSim, mem: object) => DgEvent[] };

test('сервер = клиент: тот же журнал → тот же шаг, хеш и итог', () => {
  const lines: string[] = [];
  const { hub, clock } = setupHub({ dungeon: true, dungeonSeed: () => 777, log: (l) => lines.push(l) });
  const { c, s } = login(hub, 'Tester7');
  assert.ok(hub.dungeon!.enter(c, true));
  const sim = createRun(lastOf(s, 'dg_hello')!.seed);
  const mem = { mx: 0, mz: 0, q: 0 };
  const log: DgEvent[] = [];
  let acked = 0;
  const send = (): void => {
    const ev = log.slice(acked);
    assert.ok(ev.length <= DG_LOG_MAX, 'кусок журнала — не больше 20 событий');
    hub.onJson(c, { t: 'dg_log', from: acked, ev, upto: sim.t, h: dgHash(sim) });
    acked = lastOf(s, 'dg_ack')!.n;
  };
  // ~2 минуты игры: каждые 3 шага — кусок журнала, каждые 15 — полсекунды настенных часов и 30 тиков хаба
  for (let frame = 0; frame < 3600 && sim.end === 'running'; frame++) {
    for (const e of botEvents(sim, mem)) {
      applyEvent(sim, e);
      log.push(e);
    }
    step(sim);
    if (frame % 3 === 2) send();
    if (frame % 15 === 14) {
      clock.now += 500;
      for (let i = 0; i < 30; i++) hub.step();
    }
  }
  send();
  clock.now += 5000;
  for (let i = 0; i < 600; i++) hub.step();
  const room = [...hub.dungeon!.rooms][0];
  assert.equal(room.state.tick, sim.t, 'копия сервера дошла до шага клиента');
  assert.equal(room.state.received, log.length);
  assert.ok(!lines.some((l) => l.includes('разошлись')), lines.join('\n'));
  const mine = dgResult(sim);
  assert.ok(mine.waves >= 1, `бот отбил хоть одну волну (${mine.waves})`);
  assert.deepEqual(allOf(s, 'dg_wave').map((w) => w.wave), Array.from({ length: mine.waves }, (_, i) => i + 1));
  assert.deepEqual(allOf(s, 'dg_wave').map((w) => w.coins), Array.from({ length: mine.waves }, (_, i) => dgWaveCoins(i + 1)));
  if (sim.end === 'running') hub.move(c, hub.lobby, true);
  const end = lastOf(s, 'dg_end')!;
  assert.equal(end.result.end, sim.end === 'death' ? 'death' : 'leave');
  assert.deepEqual([end.result.waves, end.result.ms, end.result.kills, end.result.level], [mine.waves, mine.ms, mine.kills, mine.level]);
});
