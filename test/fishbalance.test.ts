import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { reelStart, reelRun, reelStep, REEL_MAX_TICKS } from '../shared/fishreel.ts';
import { COLLECTION, RULE, fishPrice2, reelStyleFor, zoneSpecies } from '../shared/fishrules.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods } from '../shared/fishprogress.ts';
import { BARKAS_LEVEL } from '../shared/fishshop.ts';
import { TYPICAL, fishIncome, playReel, reelStats } from './fishbot.ts';

test('common base sale is old integer price plus75%, and event-only common separately gets1.5 at every weight', () => {
  const oldVal: Record<string, readonly [number, number]> = {
    hamsa: [2, 3], goby: [2, 4], scad: [2, 5], redmullet: [2, 5], wrasse: [2, 4],
    karas: [2, 4], blenny: [2, 3], sardine: [2, 3], whiting: [2, 5], picarel: [2, 3],
  };
  // обычные пристани — от старой цены; у обычных баркаса своя цена ×1,25 (test/fishing2.test.ts, «цены»)
  for (const sp of COLLECTION.filter(s => RULE[s]!.tier === 0 && RULE[s]!.zone === 'pier')) {
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

// 03.10: зона −10 % и отскок от дна (владелец: чуть сложнее, шансы не подтягивать) — новичок ~−15 % к цели выпуска
test('fisheco: novice clear-weather pier earnings pay at most 20% for harder fish below the released +50% target', t => {
  const measuredBefore = 13.465547009661105;
  const released = measuredBefore * 1.5;
  const current = fishIncome(TYPICAL, false, 300);
  t.diagnostic(`clear ${current.coins.toFixed(6)}, chest ${current.chest.toFixed(6)}, vs released ${(100 * (current.coins / released - 1)).toFixed(3)}%`);
  assert.ok(current.coins >= released * 0.8 && current.coins <= released * 0.92, `${current.coins} should be 8…20% below ${released.toFixed(4)} fish coins/min`);
});

test('fisheco: no species is an outlier inside its rarity tier at the place entry (pier level 0, barkas level 3 with rod 1)', t => {
  for (const zone of ['pier', 'barkas'] as const) {
    const level = zone === 'barkas' ? BARKAS_LEVEL : 0;
    const rod = zone === 'barkas' ? 1 : 0;
    const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: rod, rod }, 0, zone);
    assert.equal(mods.rod, rod);
    for (const seed of [11, 1_000_003]) {
      const rows = zoneSpecies(zone).map(sp => ({ id: FISH[sp].id, tier: RULE[sp]!.tier, p: reelStats(reelStyleFor(sp, mods), TYPICAL, 600, seed + sp * 7919).p }));
      for (let tier = 0; tier <= 4; tier++) {
        const same = rows.filter(r => r.tier === tier);
        const mean = same.reduce((s, r) => s + r.p, 0) / same.length;
        t.diagnostic(`${zone} seed${seed} tier${tier} mean ${(mean * 100).toFixed(1)}%: ${same.map(r => `${r.id} ${(r.p * 100).toFixed(0)}`).join(', ')}`);
        for (const r of same) assert.ok(Math.abs(r.p - mean) <= 0.2, `${zone}: ${r.id} ${r.p.toFixed(3)} vs tier${tier} mean ${mean.toFixed(3)}`);
      }
    }
  }
});

test('errors (fish leaving the zone) are counted by every reel tick and survive chunked authoritative replay', () => {
  const still = { spd: 0, sharp: 5, turn: 0, dart: 0, dartSpd: 0, dartUp: 50, hover: 60_000, hoverP: 100, lo: 0, hi: 30, roam: 2, zone: 30, drain: 10 };
  // держит середину зоны на рыбе; зона полежала на дне полсекунды — подматывает (иначе через 0,7 с «леска провисла»);
  // нажатия повторяем, как сервер
  const tracked = reelStart(still, 42);
  const toggles: number[] = [];
  let held = false;
  while (tracked.done === 0) {
    const h = tracked.z + Math.trunc(tracked.zone / 2) < tracked.f || tracked.rest >= 30;
    if (h !== held) { held = h; toggles.push(tracked.t); }
    reelStep(tracked, held);
  }
  const easy = reelStart(still, 42);
  reelRun(easy, toggles, REEL_MAX_TICKS + 1);
  assert.equal(easy.done, 1);
  assert.equal(easy.err, 0);
  const hard = RULE[COLLECTION.find(sp => RULE[sp]!.tier === 4)!]!.style;
  const played = playReel(hard, 327, TYPICAL);
  const whole = reelStart(hard, 327);
  const chunks = reelStart(hard, 327);
  reelRun(whole, played.toggles, REEL_MAX_TICKS + 1);
  let k = 0;
  for (let tick = 0; chunks.done === 0; tick += 37) k = reelRun(chunks, played.toggles, tick, k);
  assert.ok(whole.err > 0, `у «обычного» с легендой рыба выходит из зоны: ${whole.err}`);
  assert.equal(whole.err, played.err);
  assert.equal(chunks.err, whole.err);
});
