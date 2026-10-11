// Аркада новой набережной (WP12): сервер переигрывает партию по журналу и пишет свой счёт, подделанный счёт не проходит,
// потолок жетонов в день, один игрок на корпус.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as castle from '../shared/arcade/castle.ts';
import { ARC_GAME_IDS, checkArcLog, replayArc } from '../shared/arcade/games.ts';
import { HZ, rngFrom, type ArcEvent, type ArcGameId, type ArcLogRow, type ArcSimBase } from '../shared/arcade/kit.ts';
import type { ArcadeServerMsg } from '../shared/arcade/net.ts';
import { ARC_DAY_CAP, arcDay, arcadeReward } from '../shared/arcade/rewards.ts';
import * as tir from '../shared/arcade/tir.ts';
import * as train from '../shared/arcade/train.ts';
import { emptyStats, type Stats } from '../shared/economy.ts';
import { ArcadeHall, type ArcadeHost } from '../server/lobby/arcade.ts';

/** Партия автопилотом: журнал ввода, как его пишет клиент, и счёт на экране */
function botRun(game: ArcGameId, seed: number, maxTicks = 3 * 60 * HZ): { log: ArcLogRow[]; ticks: number; score: number } {
  const mods = { train, tir, castle } as const;
  const sim = mods[game].makeSim(seed) as ArcSimBase;
  const mem = {};
  const rng = rngFrom(seed ^ 0x9e3779b9);
  const ui = { x: 160, y: 120, recoil: 0 };
  const log: ArcLogRow[] = [];
  while (!sim.over && sim.tick < maxTicks) {
    const ev: ArcEvent[] =
      game === 'train' ? train.bot(sim as train.TrainSim, mem, rng)
      : game === 'tir' ? tir.bot(sim as tir.TirSim, mem, rng, ui).map((e) => [e[0], Math.max(0, Math.min(320, e[1])), Math.max(0, Math.min(240, e[2]))] as ArcEvent)
      : castle.bot(sim as castle.CastleSim, mem, rng);
    for (const e of ev) log.push([sim.tick, e[0], e[1], e[2]]);
    sim.step(ev);
    sim.fx.length = 0;
  }
  return { log, ticks: sim.tick, score: sim.score };
}

interface Fake {
  hall: ArcadeHall;
  sent: Array<{ slot: number; m: ArcadeServerMsg }>;
  toasts: string[];
  chat: string[];
  coins: Map<number, number>;
  profiles: Array<{ id: number; nick: string; stats: Stats }>;
  clock: { now: number };
  last(slot: number, t: string): ArcadeServerMsg | undefined;
}

function fake(seed = 12345): Fake {
  const clock = { now: Date.UTC(2026, 9, 12, 9, 0, 0) };
  const profiles = [1, 2].map((id) => ({ id, nick: `Tester${id}`, stats: emptyStats() }));
  const sent: Fake['sent'] = [];
  const toasts: string[] = [];
  const chat: string[] = [];
  const coins = new Map<number, number>();
  const cabs = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 51.5 + i * 1.3, z: 6.7, r: 0.8 }));
  const host: ArcadeHost = {
    cabs,
    who: (slot) => {
      const p = profiles[slot - 1];
      return p ? { pid: p.id, nick: p.nick, profile: p, x: cabs[0].x, z: cabs[0].z } : null;
    },
    profiles: () => profiles,
    credit: (pid, n) => coins.set(pid, (coins.get(pid) ?? 0) + n),
    send: (slot, m) => sent.push({ slot, m }),
    broadcast: (m) => sent.push({ slot: 0, m }),
    toast: (_slot, text) => toasts.push(text),
    announce: (text) => chat.push(text),
    markDirty: () => {},
    limit: () => true,
    now: () => clock.now,
  };
  const hall = new ArcadeHall(host, () => seed);
  const last = (slot: number, t: string): ArcadeServerMsg | undefined => [...sent].reverse().find((x) => x.slot === slot && x.m.t === t)?.m;
  return { hall, sent, toasts, chat, coins, profiles, clock, last };
}

/** Сыграть на сервере: занять корпус, взять зерно, отправить журнал кусками и конец партии */
function play(f: Fake, slot: number, cab: number, make: (seed: number) => { log: ArcLogRow[]; ticks: number; score: number }, claimed?: number): Extract<ArcadeServerMsg, { t: 'arcRes' }> | Extract<ArcadeServerMsg, { t: 'arcErr' }> {
  f.hall.use(slot, cab);
  f.hall.message(slot, { t: 'arc', a: 'start' });
  const run = f.last(slot, 'arcRun') as Extract<ArcadeServerMsg, { t: 'arcRun' }>;
  const r = make(run.seed);
  for (let i = 0; i < r.log.length; i += 300) f.hall.message(slot, { t: 'arc', a: 'log', run: run.run, from: i, ev: r.log.slice(i, i + 300), s: r.score });
  f.clock.now += Math.ceil((r.ticks / HZ) * 1000) + 1500;
  const before = f.sent.length;
  f.hall.message(slot, { t: 'arc', a: 'end', run: run.run, ticks: r.ticks, s: claimed ?? r.score });
  const out = f.sent.slice(before).find((x) => x.slot === slot && (x.m.t === 'arcRes' || x.m.t === 'arcErr'));
  assert.ok(out, 'сервер ответил на конец партии');
  return out.m as Extract<ArcadeServerMsg, { t: 'arcRes' }> | Extract<ArcadeServerMsg, { t: 'arcErr' }>;
}

test('аркада: переигровка журнала даёт тот же счёт (все три игры), журнал в границах', () => {
  for (const game of ARC_GAME_IDS) {
    for (const seed of [7, 4242, 987654321]) {
      const r = botRun(game, seed);
      assert.equal(checkArcLog(game, r.log, r.ticks), null, `${game}: журнал проходит проверку`);
      const again = replayArc(game, seed, r.log, r.ticks);
      assert.equal(again.score, r.score, `${game} ${seed}: счёт повтора`);
      assert.equal(again.ticks, r.ticks);
    }
  }
});

test('аркада: сервер записывает свой счёт, подделанный счёт и подделанный журнал не принимаются', () => {
  const f = fake();
  // честная партия в «Тир» (корпус 2): счёт сервера = счёт экрана, медаль и жетоны по нему
  const res = play(f, 1, 2, (seed) => botRun('tir', seed));
  assert.equal(res.t, 'arcRes');
  if (res.t !== 'arcRes') return;
  const honest = botRun('tir', 12345);
  assert.equal(res.score, honest.score);
  assert.ok(res.score > 0);
  assert.equal(f.profiles[0].stats.arBestTi, honest.score);
  assert.equal(f.coins.get(1), res.coins);

  // подделанный счёт: журнал пустой, на экране «99999» — записан счёт сервера (0), рекорд не тронут
  const forged = play(f, 1, 2, () => ({ log: [], ticks: 60 * HZ, score: 99999 }), 99999);
  assert.equal(forged.t, 'arcRes');
  if (forged.t === 'arcRes') {
    assert.equal(forged.score, 0);
    assert.equal(forged.claimed, 99999);
  }
  assert.equal(f.profiles[0].stats.arBestTi, honest.score);

  // подделанный журнал (выстрел за экраном) — партия не засчитана
  const bad = play(f, 1, 2, () => ({ log: [[5, tir.EV_SHOT, 9000, 10]], ticks: 60 * HZ, score: 5000 }));
  assert.equal(bad.t, 'arcErr');
  // слишком быстро: минута игры за 5 секунд — не засчитана
  f.hall.message(1, { t: 'arc', a: 'start' });
  const run = f.last(1, 'arcRun') as Extract<ArcadeServerMsg, { t: 'arcRun' }>;
  f.clock.now += 5000;
  f.hall.message(1, { t: 'arc', a: 'end', run: run.run, ticks: 60 * HZ, s: 0 });
  assert.equal(f.last(1, 'arcErr')?.t, 'arcErr');
  assert.equal(f.profiles[0].stats.arRunsTi, 2, 'засчитаны только честная и «пустая» партии');
});

test('аркада: потолок жетонов — 150 в день по Москве', () => {
  assert.deepEqual(arcadeReward({ medal: 3, coins: [8, 15, 25], record: true, first: true, dayCoins: 0 }), { medal: 25, record: 10, first: 25, total: 60, capped: false });
  assert.deepEqual(arcadeReward({ medal: 3, coins: [8, 15, 25], record: false, first: false, dayCoins: 140 }), { medal: 25, record: 0, first: 0, total: 10, capped: true });
  assert.equal(arcadeReward({ medal: 2, coins: [5, 10, 15], record: false, first: false, dayCoins: ARC_DAY_CAP }).total, 0);

  const f = fake();
  const st = f.profiles[0].stats;
  st.arDay = arcDay(f.clock.now);
  st.arDayCoins = 145;
  const res = play(f, 1, 0, (seed) => botRun('train', seed));
  assert.equal(res.t, 'arcRes');
  if (res.t !== 'arcRes') return;
  assert.ok(res.medal > 0, 'автопилот берёт медаль');
  assert.equal(res.coins, 5);
  assert.ok(res.capped);
  assert.equal(st.arDayCoins, ARC_DAY_CAP);
  // новый день — снова можно
  f.clock.now += 24 * 3600_000;
  const next = play(f, 1, 0, (seed) => botRun('train', seed));
  assert.ok(next.t === 'arcRes' && next.coins > 0 && !next.capped);
});

test('аркада: один игрок на корпус, соседям — кто играет и его счёт', () => {
  const f = fake();
  f.hall.use(1, 4);
  assert.equal(f.last(1, 'arcOpen')?.t, 'arcOpen');
  assert.equal(f.hall.occupant(4), 1);
  f.hall.use(2, 4);
  assert.equal(f.hall.occupant(4), 1, 'занятый корпус не отдаём');
  assert.match(f.toasts.at(-1) ?? '', /Играет Tester1/);
  assert.equal(f.last(2, 'arcOpen'), undefined);
  // живой счёт играющего — всем
  f.hall.message(1, { t: 'arc', a: 'start' });
  const run = f.last(1, 'arcRun') as Extract<ArcadeServerMsg, { t: 'arcRun' }>;
  f.hall.message(1, { t: 'arc', a: 'log', run: run.run, from: 0, ev: [], s: 340 });
  f.hall.step(15);
  const cabs = f.last(0, 'arcCabs') as Extract<ArcadeServerMsg, { t: 'arcCabs' }>;
  assert.deepEqual(cabs.cabs[4], { nick: 'Tester1', s: 340 });
  assert.equal(cabs.cabs[5], null);
  // ушёл — корпус свободен
  f.hall.leave(1);
  f.hall.use(2, 4);
  assert.equal(f.hall.occupant(4), 2);
});
