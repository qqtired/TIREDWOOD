import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { FISH } from '../shared/fishing.ts';
import { reelStart, reelRun, REEL_MAX_TICKS } from '../shared/fishreel.ts';
import { COLLECTION, RULE, fishPrice2 } from '../shared/fishrules.ts';
import { EXPERT, TYPICAL, fishIncome, playReel, reelStats } from './fishbot.ts';

test('common base sale is old integer price plus75%, and event-only common separately gets1.5 at every weight', () => {
  const oldVal: Record<string, readonly [number, number]> = {
    hamsa: [2, 3], goby: [2, 4], scad: [2, 5], redmullet: [2, 5], wrasse: [2, 4],
    karas: [2, 4], blenny: [2, 3], sardine: [2, 3], whiting: [2, 5], picarel: [2, 3],
  };
  for (const sp of COLLECTION.filter(s => RULE[s]!.tier === 0)) {
    const f = FISH[sp];
    const [lo, hi] = oldVal[f.id];
    for (let g = f.g[0]; g <= f.g[1]; g++) {
      const k = (g - f.g[0]) / (f.g[1] - f.g[0]);
      const oldCoins = Math.max(1, Math.round((lo + (hi - lo) * k) * (13.5 / 13.7)));
      const commonBase = Math.round(oldCoins * 1.75);
      const expected = f.id === 'picarel' ? Math.round(commonBase * 1.5) : commonBase;
      assert.equal(fishPrice2(sp, g), expected, `${f.id}, ${g}g; old integer ${oldCoins}, common base ${commonBase}`);
    }
  }
});

test('base typical fish-only earnings stay within5% of +50% target after approved event-common availability change', t => {
  const measuredBefore = 13.465547009661105;
  const current = fishIncome(TYPICAL, false, 300);
  t.diagnostic(`clear ${current.coins.toFixed(6)}, chest ${current.chest.toFixed(6)}, gain ${(100 * (current.coins / measuredBefore - 1)).toFixed(3)}%`);
  assert.ok(Math.abs(current.coins / (measuredBefore * 1.5) - 1) < .05, `${current.coins} should be within5% of20.1983205 fish coins/min`);
});

test('actual reel cost per success orders all 32 species into strict rarity bands', t => {
  for (const [skill, seedBatch] of [[TYPICAL, 0], [EXPERT, 0], [TYPICAL, 1], [EXPERT, 1]] as const) {
    const rows = COLLECTION.map(sp => {
      const s = reelStats(RULE[sp]!.style, skill, 1200, seedBatch === 0 ? 11 + sp * 7919 : 1_000_003 + sp * 1543);
      return { id: FISH[sp].id, tier: RULE[sp]!.tier, fail: s.failure, cost: s.costTicks };
    });
    for (let tier = 1; tier <= 4; tier++) {
      const before = rows.filter(r => r.tier === tier - 1);
      const next = rows.filter(r => r.tier === tier);
      const hardestBefore = before.reduce((a, b) => a.cost > b.cost ? a : b);
      const easiestNext = next.reduce((a, b) => a.cost < b.cost ? a : b);
      t.diagnostic(`${skill === TYPICAL ? 'typical' : 'expert'} batch${seedBatch} ${tier}: ${hardestBefore.id} cost${hardestBefore.cost.toFixed(1)} fail${hardestBefore.fail.toFixed(3)} < ${easiestNext.id} cost${easiestNext.cost.toFixed(1)} fail${easiestNext.fail.toFixed(3)}`);
      assert.ok(hardestBefore.cost < easiestNext.cost, `${hardestBefore.id} must be easier than ${easiestNext.id}`);
    }
  }
});

test('internal difficulty is the measured cost of a success, rather than a fake tier ordering', () => {
  for (const sp of COLLECTION) {
    const measured = reelStats(RULE[sp]!.style, TYPICAL, 1200, 11 + sp * 7919);
    assert.ok(Math.abs(RULE[sp]!.difficulty - measured.costTicks) <= .051, `${FISH[sp].id}: calibrated=${RULE[sp]!.difficulty}, actual=${measured.costTicks}`);
    assert.equal(measured.failure, 1 - measured.p);
  }
});

test('perfect is computed by every reel tick and survives chunked authoritative replay', () => {
  const still = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 0, hi: 30, roam: 2, zone: 30, drain: 10 };
  const easy = reelStart(still, 42);
  reelRun(easy, [], REEL_MAX_TICKS + 1);
  assert.equal(easy.perfect, true);
  const hard = RULE[COLLECTION.find(sp => RULE[sp]!.tier === 4)!]!.style;
  const played = playReel(hard, 327, TYPICAL);
  const whole = reelStart(hard, 327);
  const chunks = reelStart(hard, 327);
  reelRun(whole, played.toggles, REEL_MAX_TICKS + 1);
  let k = 0;
  for (let tick = 0; chunks.done === 0; tick += 37) k = reelRun(chunks, played.toggles, tick, k);
  assert.equal(whole.perfect, false);
  assert.equal(chunks.perfect, whole.perfect);
});

// Compare final behavior to the immutable pre-pattern replay measurements, not a synthetic tier score.
test('two independent seed batches meet the approved effort increase for typical and expert players', t => {
  const baseline = JSON.parse(readFileSync(new URL('../docs/expansion-2026-10-03/fishing-baseline/baseline.json', import.meta.url), 'utf8'));
  for (const key of ['typical', 'expert'] as const) for (let batch = 0; batch < 2; batch++) {
    for (let tier = 0; tier <= 4; tier++) {
      const rows = baseline.rows.filter((r: { tier: number }) => r.tier === tier);
      let before = 0, after = 0;
      const target = tier === 0 ? 1.5 : tier === 1 ? 1.4 : 1.3;
      for (const row of rows) {
        const actual = reelStats(RULE[row.sp]!.style, key === 'typical' ? TYPICAL : EXPERT, 1200, row.samples[batch].seed);
        const old = row.samples[batch][key].costTicks;
        assert.ok(Math.abs(actual.costTicks / old - target) < .17, row.id + ': effort outlier');
        before += old; after += actual.costTicks;
      }
      t.diagnostic(key + ' batch' + batch + ' tier' + tier + ' ratio=' + (after / before).toFixed(4));
      assert.ok(Math.abs(after / before - target) < .065, key + ': tier' + tier);
    }
  }
});
