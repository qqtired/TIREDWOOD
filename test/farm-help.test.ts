// Ферма, часть B1: помощь соседям и репутация (design-v11 §8, §18.5) — лимиты, награды, первое достижение «Соседи».
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFarmXp, emptyFarm, type FarmProgress } from '../shared/farm.ts';
import { HELP_RESET_MS } from '../shared/farmdata.ts';
import { helpBlock, helpView } from '../shared/farmhelp.ts';
import { bedWorld } from '../shared/farmmap.ts';
import type { FarmEvent, FarmServerMsg } from '../shared/farmnet.ts';
import { makeRng } from '../shared/math.ts';
import { FarmPlots } from '../server/farm/plots.ts';
import { grantLevel } from '../server/farm/rewards.ts';
import type { FarmCtx, FarmPlayer } from '../server/farm/room.ts';
import { FarmSystems } from '../server/farm/systems.ts';

const T0 = Date.UTC(2026, 9, 10, 9);

function kit() {
  const clock = { now: T0 };
  const farms = new Map<number, FarmProgress>();
  const players = new Map<number, FarmPlayer>();
  const coins = new Map<number, number>();
  const owned = new Set<string>();
  const evs: { to: number; e: FarmEvent }[] = [];
  const sent: { to: number; m: FarmServerMsg }[] = [];
  const ctx: FarmCtx = {
    now: () => clock.now, rng: makeRng(7), plots: new FarmPlots(undefined),
    farm: (p) => farms.get(p.c.pid)!, players: () => players.values(), byPid: (pid) => players.get(pid), farmOfPid: (pid) => farms.get(pid),
    sendMe: () => {}, send: (to, m) => { sent.push({ to: to?.c.pid ?? 0, m }); }, plotChanged: () => {},
    ev: (to, e) => { evs.push({ to: to?.c.pid ?? 0, e }); }, fail: (p, a, why) => { evs.push({ to: p.c.pid, e: { k: 'fail', a, why } }); },
    xp: (p, n) => { for (const lv of addFarmXp(farms.get(p.c.pid)!, n)) grantLevel(ctx, p, lv); },
    credit: (p, n) => { coins.set(p.c.pid, (coins.get(p.c.pid) ?? 0) + n); }, spend: () => true,
    grantItem: (p, id) => { const k = `${p.c.pid}/${id}`; if (owned.has(k)) return false; owned.add(k); return true; }, dirty: () => {},
  };
  const add = (pid: number, xp = 0): FarmPlayer => {
    const f = emptyFarm(clock.now);
    f.xp = xp;
    farms.set(pid, f);
    const plot = ctx.plots.enter(pid, clock.now);
    const p = { c: { pid, profile: { id: pid, nick: `Tester${pid}` } }, state: { x: 0, z: 0 }, plot } as unknown as FarmPlayer;
    players.set(pid, p);
    return p;
  };
  const lastFail = (pid: number): string | undefined => {
    const e = evs.filter((x) => x.to === pid && x.e.k === 'fail').at(-1)?.e;
    return e && e.k === 'fail' ? e.why : undefined;
  };
  return { clock, ctx, farms, coins, owned, evs, sent, add, lastFail };
}

test('помощь: −20 % чужой грядке, заряд и очко, +1 репутации и 1 🪙, «Добро пожаловать по соседству»', () => {
  const k = kit();
  const sys = new FarmSystems(k.ctx);
  const a = k.add(1, 200);
  const b = k.add(2);
  const fa = k.farms.get(1)!;
  const fb = k.farms.get(2)!;
  fa.water = 1000;
  fb.beds[0] = { crop: 'wheat', plantedAt: T0, ripeAt: T0 + 15 * 60_000, watered: false, helpers: [] };
  Object.assign(a.state, bedWorld(b.plot, 0));
  sys.join(a);
  sys.help(a, { t: 'farm', a: 'help', plot: b.plot, beds: [0] });
  assert.equal(fb.beds[0].ripeAt, T0 + 12 * 60_000, '−20 % оставшегося');
  assert.deepEqual(fb.beds[0].helpers, [1]);
  assert.equal(fa.water, 900);
  assert.deepEqual(helpView(fa, T0), { points: 5, max: 6, resetAt: T0 + HELP_RESET_MS });
  assert.equal(fa.rep, 1);
  assert.equal(k.coins.get(1), 1);
  assert.equal(fa.counters.helps, 1);
  assert.ok(fa.achievements.includes('welcome'));
  assert.ok(k.owned.has('1/n:neighbor'));
  // та же грядка второй раз, свой участок, новичок ур. 1 — отказ
  sys.help(a, { t: 'farm', a: 'help', plot: b.plot, beds: [0] });
  assert.equal(k.lastFail(1), 'watered');
  sys.help(a, { t: 'farm', a: 'help', plot: a.plot, beds: [0] });
  assert.equal(k.lastFail(1), 'plot');
  Object.assign(b.state, bedWorld(a.plot, 0));
  k.farms.get(2)!.water = 1000;
  sys.help(b, { t: 'farm', a: 'help', plot: a.plot, beds: [0] });
  assert.equal(k.lastFail(2), 'level');
  // далеко от грядки
  a.state.x += 30;
  sys.help(a, { t: 'farm', a: 'help', plot: b.plot, beds: [0] });
  assert.equal(k.lastFail(1), 'far');
});

test('помощь: 3 капли на грядку, ≥ 20 с до созревания, потолки репутации и жетонов, сброс очков через 10 мин', () => {
  const bed = { crop: 'wheat', plantedAt: T0, ripeAt: T0 + 60_000, watered: false, helpers: [5, 6, 7] };
  assert.equal(helpBlock(bed, 8, T0), 'max');
  assert.equal(helpBlock({ ...bed, helpers: [] }, 8, T0 + 41_000), 'unripe');
  assert.equal(helpBlock({ ...bed, helpers: [] }, 8, T0), null);

  const k = kit();
  const sys = new FarmSystems(k.ctx);
  const a = k.add(1, 200);
  const b = k.add(2);
  const fa = k.farms.get(1)!;
  const fb = k.farms.get(2)!;
  fa.water = 1000;
  fa.repHelpDay = '2026-10-10';
  fa.repHelpToday = 30;
  fa.help.coinsBy['2'] = [T0 - 1, T0 - 2, T0 - 3, T0 - 4, T0 - 5];
  Object.assign(a.state, bedWorld(b.plot, 0));
  for (let i = 0; i < 6; i++) {
    fb.beds[0] = { crop: 'wheat', plantedAt: T0, ripeAt: T0 + 15 * 60_000, watered: false, helpers: [] };
    sys.help(a, { t: 'farm', a: 'help', plot: b.plot, beds: [0] });
  }
  assert.equal(fa.rep, 0, 'репутация за помощь — не больше 30 в сутки');
  assert.equal(k.coins.get(1) ?? 0, 0, 'с одного соседа — не больше 5 жетонов в час');
  assert.equal(fa.help.points, 0);
  fb.beds[0] = { crop: 'wheat', plantedAt: T0, ripeAt: T0 + 15 * 60_000, watered: false, helpers: [] };
  sys.help(a, { t: 'farm', a: 'help', plot: b.plot, beds: [0] });
  assert.equal(k.lastFail(1), 'count');
  k.clock.now = T0 + HELP_RESET_MS;
  fb.beds[0] = { crop: 'wheat', plantedAt: T0, ripeAt: k.clock.now + 15 * 60_000, watered: false, helpers: [] };
  sys.help(a, { t: 'farm', a: 'help', plot: b.plot, beds: [0] });
  assert.equal(fa.help.points, 5, 'через 10 минут — полный запас');
});
