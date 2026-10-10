// Ферма, часть B1: Древо разлома (design-v11 §11) — окно 19:00–01:00 МСК, «Цветение» от N, очки = XP сбора, шишки,
// награды за вклад и «Последняя капля», без наград к 01:00.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyFarm, type FarmProgress } from '../shared/farm.ts';
import { bossHp, bossPhase, bossWindow, normalizeBoss } from '../shared/farmboss.ts';
import type { FarmServerMsg } from '../shared/farmnet.ts';
import { makeRng } from '../shared/math.ts';
import { FarmPlots } from '../server/farm/plots.ts';
import type { FarmCtx, FarmPlayer } from '../server/farm/room.ts';
import { FarmSystems } from '../server/farm/systems.ts';

/** 10.10.2026 19:00 МСК */
const START = Date.UTC(2026, 9, 10, 16);

function kit() {
  const clock = { now: START - 3600_000 };
  const farms = new Map<number, FarmProgress>();
  const players = new Map<number, FarmPlayer>();
  const sent: { to: number; m: FarmServerMsg }[] = [];
  let saved: unknown = null;
  const ctx = {
    now: () => clock.now, rng: makeRng(9), plots: new FarmPlots(undefined),
    farm: (p: FarmPlayer) => farms.get(p.c.pid)!, players: () => players.values(), byPid: (pid: number) => players.get(pid),
    farmOfPid: (pid: number) => farms.get(pid), sendMe: () => {}, send: (to: FarmPlayer | null, m: FarmServerMsg) => { sent.push({ to: to?.c.pid ?? 0, m }); },
    plotChanged: () => {}, ev: () => {}, fail: () => {}, xp: () => {}, credit: () => {}, spend: () => true, grantItem: () => true, dirty: () => {},
    bossLoad: () => saved, bossSave: (s: unknown) => { saved = JSON.parse(JSON.stringify(s)); },
  } satisfies FarmCtx & Record<string, unknown>;
  const add = (pid: number): FarmPlayer => {
    farms.set(pid, emptyFarm(clock.now));
    const plot = ctx.plots.enter(pid, clock.now);
    const p = { c: { pid, profile: { id: pid, nick: `Tester${pid}` } }, state: { x: -9, z: 9 }, plot } as unknown as FarmPlayer;
    players.set(pid, p);
    return p;
  };
  return { clock, ctx, farms, sent, add, saved: () => saved };
}

test('Древо: окно по Москве, здоровье от N (3–20), фазы по цветению', () => {
  assert.deepEqual(bossWindow(START - 3600_000), { day: '2026-10-10', start: START, end: START + 6 * 3600_000, announce: START - 300_000 });
  assert.equal(bossWindow(START + 5.5 * 3600_000).day, '2026-10-10', '00:30 МСК — ещё вчерашнее событие');
  assert.equal(bossWindow(START + 6.5 * 3600_000).day, '2026-10-11');
  assert.deepEqual(bossHp(1), { n: 3, hp: 6000 });
  assert.deepEqual(bossHp(8), { n: 8, hp: 16000 });
  assert.deepEqual(bossHp(40), { n: 20, hp: 40000 });
  assert.deepEqual([0, 1500, 3000, 4500, 6000].map((b) => bossPhase(b, 6000)), [1, 2, 3, 4, 4]);
  assert.equal(normalizeBoss({ day: 'x' }), null);
});

test('Древо: очки — XP сбора и шишки, расцвело — баффы, репутация, «Последняя капля»; к 01:00 — без наград', () => {
  const k = kit();
  const sys = new FarmSystems(k.ctx);
  const a = k.add(1);
  const b = k.add(2);
  sys.on(a, { k: 'harvest', xp: 500, items: [] });
  sys.second(k.clock.now);
  assert.equal(sys.boss.total(), 0, 'до 19:00 очков нет');
  k.clock.now = START;
  sys.second(k.clock.now);
  assert.equal(sys.boss.st?.hp, 6000, 'двое активных → минимум N = 3');
  sys.on(a, { k: 'harvest', xp: 4000, items: [] });
  k.clock.now += 1000;
  sys.second(k.clock.now);
  const view = k.sent.filter((s) => s.to === 1 && s.m.t === 'farmBoss').at(-1)!.m;
  assert.ok(view.t === 'farmBoss' && view.b.phase === 3 && view.b.cones.length === 1 && view.b.place === 1);
  const cone = view.t === 'farmBoss' ? view.b.cones[0] : null!;
  Object.assign(b.state, { x: cone.x, z: cone.z });
  sys.cone(b, { t: 'farm', a: 'cone', id: cone.id });
  assert.equal(sys.boss.st?.pts[2], 10);
  sys.on(b, { k: 'harvest', xp: 1990, items: [] });
  const s = sys.boss.st!;
  assert.equal(s.st, 'bloom');
  assert.equal(s.last, 2);
  const fa = k.farms.get(1)!;
  const fb = k.farms.get(2)!;
  // A: 4000 / 6000 = 66 % → 132; B: 2000 / 6000 = 33 % → 66 + 5 за последнюю каплю
  assert.equal(fa.rep, 132);
  assert.equal(fb.rep, 71);
  assert.equal(fa.buffs.length, 1);
  assert.equal(fa.buffs[0].until, k.clock.now + 24 * 3600_000);
  assert.equal(fb.counters.bossDrops, 1);
  assert.equal(fa.counters.bossShares, 1);
  assert.ok(k.sent.some((x) => x.to === 1 && x.m.t === 'farmBossEnd' && x.m.r.bloom && x.m.r.mine.place === 1));
  assert.equal(normalizeBoss(k.saved())?.st, 'bloom', 'состояние уходит в State.farmBoss');
  // следующий день: никто не растит — в 01:00 Древо уходит спать без наград
  k.clock.now = START + 24 * 3600_000;
  sys.second(k.clock.now);
  sys.on(a, { k: 'harvest', xp: 100, items: [] });
  k.clock.now += 6 * 3600_000;
  sys.second(k.clock.now);
  assert.equal(sys.boss.st?.st, 'gone');
  assert.equal(fa.rep, 132);
});
