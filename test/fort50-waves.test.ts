import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FT_BREAK, FT_END, FT_WAVE, type FortEvent } from '../shared/fort.ts';
import {
  F50_GOLD_MUL, F50_LAST_WAVE, f50Boss, f50BossNumber, f50BreakSeconds, f50First, f50Force, f50Wave, f50WaveTokens,
} from '../shared/fort50.ts';
import { Z_BOSS, Z_GOLEM, Z_KRAKEN, Z_WALKER } from '../shared/fortkinds.ts';
import { Z_BATTERY, Z_ROPECRAB, Z_SIEGE_TOWER, Z_SPRING, siegeBodyTier } from '../shared/fortsiege.ts';
import { bossHp, crewSize, EV_NONE, KRAKEN_HEAD_BASE_HP, krakenHp, waveDmgMul, waveTokens } from '../shared/fortwaves.ts';
import { ACT_GATE, killBounty, repairPrice, waveBonus } from '../shared/fortarsenal.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { budgetHp, F50_FEATURES, FEATURES, planWave, SIEGE_FEATURES, type WavePlan } from '../server/fort/director.ts';
import { FortGame } from '../server/fort/game.ts';
import type { Sink } from '../server/paintball/game.ts';

function sink(): Sink & { msgs: ServerMsg[] } {
  const msgs: ServerMsg[] = [];
  return { msgs, sendBinary() {}, sendJson(m) { msgs.push(m); }, close() {} };
}

test('Ф50: все 50 планов, точные боссы, осада, лодки, события и сила', () => {
  const bosses: number[] = [], krakens: number[] = [];
  let last = { wave: -99, kind: EV_NONE };
  for (let w = 1; w <= F50_LAST_WAVE; w++) {
    const p = planWave(w, 2, 5031, last, F50_FEATURES);
    const spec = f50Wave(w), b = f50Boss(w), wf = f50Force(w);
    assert.equal(p.card.f50, true);
    assert(p.spawns.length > 0);
    assert.deepEqual([...p.roads].sort(), [0, 1, 2]);
    assert.equal(p.dmgMul, waveDmgMul(wf));
    assert.equal(p.boss, b?.kind ?? -1);
    if (p.boss >= 0) {
      bosses.push(w);
      const tier = b?.final ? 4 : Math.floor((f50BossNumber(w) - 1) / 3);
      assert.equal(p.bossHp, bossHp(wf, 2, tier) * (p.boss === Z_GOLEM ? 3 : 1));
      assert.equal(p.bossTier, b?.tier);
    }
    if (p.kraken) { krakens.push(w); assert.equal(p.krakenTier, b?.kraken); }
    assert.equal(p.card.tier, p.kraken ? b?.kraken : b?.tier ?? 0);
    if (!b) assert.equal(p.card.title, spec.title);
    assert.equal(p.boats.length, spec.boats ?? 0);
    for (const boat of p.boats) assert.equal(boat.crew.length, crewSize(wf));
    assert.equal(p.boats.some((boat) => boat.anchor), !!spec.anchor);
    assert.equal(p.event !== EV_NONE, !!spec.event);
    if (p.event) { assert.notEqual(p.event, last.kind); last = { wave: w, kind: p.event }; }
    const machines = p.spawns.filter((s) => s.kind === Z_SIEGE_TOWER || s.kind === Z_BATTERY);
    assert.equal(machines.length, spec.siege?.length ?? 0);
    for (const m of machines) assert.equal(m.tier, siegeBodyTier(wf));
    for (const k of p.card.fresh) assert.equal(f50First(k), w);
    for (const s of p.spawns) if (FEATURES.kinds.has(s.kind)) assert(f50First(s.kind) <= w);
  }
  assert.deepEqual(bosses, [5, 10, 15, 20, 28, 30, 35, 40, 45, 50]);
  assert.deepEqual(krakens, [25, 50]);
  const kinds = bosses.filter((w) => w !== 35 && w !== 50).map((w) => f50Boss(w)!.kind);
  assert.equal(new Set(kinds).size, kinds.length);
  assert.equal(f50Boss(35)?.kind, Z_BOSS);
  assert.equal(f50Boss(50)?.kind, Z_BOSS);
  assert.equal(planWave(8, 1, 1, undefined, F50_FEATURES).spawns.filter((s) => s.kind === Z_ROPECRAB).length, 1);
  assert.equal(planWave(9, 1, 1, undefined, F50_FEATURES).spawns.filter((s) => s.kind === Z_SPRING).length, 1);
  const recovery = planWave(9, 2, 1, { wave: -99, kind: EV_NONE, siegeFailureWave: 8 }, F50_FEATURES);
  assert(!recovery.spawns.some((s) => s.kind === Z_SPRING));
});

test('Ф50: сила 25-й соответствует прежней 48-й; HP учитывает половину сопровождения Кракена', () => {
  const f50 = planWave(25, 3, 1, undefined, F50_FEATURES);
  const old = planWave(48, 3, 1);
  const hp = (p: WavePlan, w: number) => p.spawns.reduce((sum, s) => sum + budgetHp(s.kind, s.tier, w, 3, p.hpScale, p.siegeHpScale), 0)
    + p.boats.reduce((sum, boat) => sum + boat.crew.reduce((n, k, i) => n + budgetHp(k, boat.tiers[i], w, 3, p.hpScale), 0), 0);
  assert.equal(f50Force(25), 48);
  assert(Math.abs(hp(f50, 48) / 0.5 / hp(old, 48) - 1) < 0.15);
});

test('Ф50: Кракен берёт HP от силы волны и круг из плана', () => {
  for (const w of [25, 50]) {
    const g = new FortGame({ fort50: true });
    const plan = planWave(w, 1, 1, undefined, F50_FEATURES);
    g.horde.startWave(plan, 0);
    g.tick = 30;
    g.horde.step();
    const head = g.horde.zombies.find((z) => z.alive && z.kind === Z_KRAKEN)!;
    assert(head);
    assert.equal(head.maxHp, krakenHp(KRAKEN_HEAD_BASE_HP, f50Force(w), 1, f50Boss(w)!.kraken));
  }
});

test('Ф50: жетоны, передышки, золото и победа после 50-й; /wave ограничена 50', () => {
  const g = new FortGame({ fort50: true });
  const out = sink();
  const p = g.addHuman({ pid: 1, nick: 'Tester7', outfit: DEFAULT_OUTFIT }, out)!;
  assert.equal(out.msgs[0].t, 'fort');
  assert.equal(out.msgs[1].t, 'f50');
  assert.equal(g.siegeEnabled, true);
  for (const w of [1, 5, 24, 25, 49, 50]) {
    g.jumpTo(w);
    g.phaseEnd = g.tick + 1;
    g.step();
    assert.equal(g.wave, w);
    assert.equal(g.phase, FT_WAVE);
    const tokens = p.run.tokWaves;
    const gold = p.run.arsenal.gold;
    g.horde.clear();
    g.step();
    assert.equal(p.run.tokWaves - tokens, f50WaveTokens(w));
    assert.equal(p.run.arsenal.gold - gold, Math.round(waveBonus(f50Force(w)) * F50_GOLD_MUL));
    if (w < 50) {
      assert.equal(g.phase, FT_BREAK);
      assert.equal(g.phaseEnd - g.tick, f50BreakSeconds(w) * TICK_RATE);
    } else assert.equal(g.phase, FT_END);
  }
  g.newGame();
  g.debug = true;
  g.command(p, '/wave 51');
  assert.equal(g.wave, 0);
});

test('Ф50: выплаты за сбитых и цены ремонта используют силу волны; лавка сохраняет уровни', () => {
  const g = new FortGame({ fort50: true });
  const p = g.addHuman({ pid: 1, nick: 'Tester7', outfit: DEFAULT_OUTFIT }, sink())!;
  g.wave = 20;
  const z = g.horde.spawn(Z_WALKER, 1)!;
  const gold = p.run.arsenal.gold;
  g.horde.damage(z, 1e9, p.id, true, z.x, z.y, z.z);
  assert.equal(p.run.arsenal.gold - gold, Math.round(killBounty(Z_WALKER, f50Force(20)) * F50_GOLD_MUL));
  p.run.arsenal.gold = 10000;
  g.gate = 500;
  const st = g.map.stations.find((s) => s.kind === 'gate')!;
  Object.assign(p.state, { x: st.x, y: st.y, z: st.z });
  g.use(p, ACT_GATE);
  assert.equal(p.run.arsenal.gold, 10000 - repairPrice(f50Force(20)));
});

test('без Ф50 прежние планы, 100 волн и ни одного нового сообщения', () => {
  for (const w of [1, 25, 50, 100]) {
    assert.deepEqual(planWave(w, 2, 7), planWave(w, 2, 7, undefined, { ...FEATURES, f50: false }));
    assert.deepEqual(planWave(w, 2, 7, undefined, SIEGE_FEATURES), planWave(w, 2, 7, undefined, { ...SIEGE_FEATURES, f50: false }));
  }
  const g = new FortGame({ fort50: false, siege: false });
  const out = sink();
  const p = g.addHuman({ pid: 1, nick: 'Tester7', outfit: DEFAULT_OUTFIT }, out)!;
  g.jumpTo(50);
  g.phaseEnd = 1;
  g.step(); g.horde.clear(); g.step();
  assert.equal(g.phase, FT_BREAK);
  assert.equal(p.run.tokWaves, waveTokens(50));
  g.jumpTo(100);
  g.phaseEnd = g.tick + 1;
  g.step(); g.horde.clear(); g.step();
  assert.equal(g.phase, FT_END);
  assert(!out.msgs.some((m) => m.t === 'f50'));
  const wallEvents = new Set<FortEvent[0]>(['whit', 'wstage', 'stone']);
  assert(!out.msgs.some((m) => m.t === 'fev' && m.e.some((e) => wallEvents.has(e[0]))));
  const override = new FortGame({ fort50: true, siege: false });
  override.addHuman({ pid: 2, nick: 'Tester8', outfit: DEFAULT_OUTFIT }, sink());
  override.jumpTo(6); override.phaseEnd = 1; override.step();
  assert.equal(override.siegeEnabled, false);
  assert(!override.plan?.siege, 'явный хук siege=false сохраняет приоритет над флагом');
});
