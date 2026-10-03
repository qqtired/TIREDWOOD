import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  emptyFishProgress, fishCastMods, fishCatchXp, fishLevel, fishLevelView, normalizeFishProgress,
  questNeed, rodBonus, unlockedRod,
} from '../shared/fishprogress.ts';

const sp = (id: string) => FISH.findIndex((f) => f.id === id);

test('fishing skill earns exactly ten levels at Stardew cumulative XP thresholds', () => {
  const thresholds = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10_000, 15_000];
  assert.equal(fishLevel(0), 0);
  for (let i = 0; i < thresholds.length; i++) {
    assert.equal(fishLevel(thresholds[i] - 1), i);
    assert.equal(fishLevel(thresholds[i]), i + 1);
  }
  assert.deepEqual(fishLevelView(379), { level: 1, xp: 379, from: 100, next: 380 });
  assert.deepEqual(fishLevelView(16_000), { level: 10, xp: 16_000, from: 15_000, next: null });
  assert.equal(fishLevel(Number.MAX_SAFE_INTEGER), 10);
});

test('saved fishing progress rejects invalid counters and unearned or fractional rods', () => {
  assert.deepEqual(normalizeFishProgress(null), { xp: 0, questsDone: 0, questCaught: 0, rod: 0, beerUntil: 0 });
  const raw = { xp: 381.9, questsDone: 5, questCaught: 37.8, rod: 3, beerUntil: 600_001.9 };
  assert.deepEqual(normalizeFishProgress(raw), { xp: 381, questsDone: 5, questCaught: 37, rod: 2, beerUntil: 600_001 });
  assert.equal(raw.rod, 3, 'normalization must not mutate a loaded save');
  assert.equal(normalizeFishProgress({ questsDone: 10, rod: 1.5 }).rod, 0);
  assert.equal(normalizeFishProgress({ questsDone: 10, rod: 1 }).rod, 1, 'earned lower rod is a valid selection');
  assert.deepEqual(normalizeFishProgress({ xp: NaN, questsDone: Infinity, questCaught: -2, beerUntil: '600000' }), emptyFishProgress());
  assert.equal(fishLevel(-1), 0);
  assert.equal(fishLevel(Infinity), 0);
});

test('each quest requires five more real fish; only quests one, five and ten unlock a rod', () => {
  for (const [done, need, rod] of [[0, 5, 0], [1, 10, 1], [4, 25, 1], [5, 30, 2], [9, 50, 2], [10, 55, 3], [100, 505, 3]] as const) {
    assert.equal(questNeed(done), need);
    assert.equal(unlockedRod(done), rod);
    assert.equal(need * 5, (done + 1) * 25, 'NPC reward is exactly N*5; claims owned by server');
  }
  assert.equal(questNeed(-1), 5);
});

test('one selected rod grants its own 10/20/30 percent bonus without stacking', () => {
  for (const [rod, bonus] of [[0, 0], [1, .1], [2, .2], [3, .3]] as const) {
    assert.equal(rodBonus(rod), bonus);
    const mods = fishCastMods({ ...emptyFishProgress(), questsDone: 10, rod }, 1000);
    assert.equal(mods.biteSpeed, 1 + bonus);
    assert.equal(mods.zoneScale, 1 + bonus);
  }
  const best = fishCastMods({ ...emptyFishProgress(), xp: 15_000, questsDone: 10, rod: 3 }, 1000);
  assert.equal(best.zoneScale, 1.25 * 1.3);
  assert.equal(best.biteSpeed, 1.3);
});

test('skill increases only reel zone 2.5 percent per level and rare weighting', () => {
  const fresh = fishCastMods(emptyFishProgress(), 1000);
  const level1 = fishCastMods({ ...emptyFishProgress(), xp: 100 }, 1000);
  const max = fishCastMods({ ...emptyFishProgress(), xp: 100_000 }, 1000);
  assert.equal(level1.zoneScale, 1.025);
  assert.equal(max.zoneScale, 1.25);
  assert.ok(level1.rareMultiplier > fresh.rareMultiplier);
  assert.ok(max.rareMultiplier > level1.rareMultiplier);
  assert.equal(max.biteSpeed, 1);
  assert.equal(max.incomeScale, 1);
});

test('beer expires at wall-clock boundary and affects rare weights and fish sale only', () => {
  const progress = { ...emptyFishProgress(), beerUntil: 10_000 };
  const active = fishCastMods(progress, 9999);
  assert.equal(active.incomeScale, 1.1);
  assert.ok(active.rareMultiplier > 1);
  const expired = fishCastMods(progress, 10_000);
  assert.equal(expired.incomeScale, 1);
  assert.equal(expired.rareMultiplier, 1);
  assert.equal(active.zoneScale, 1);
  assert.equal(active.biteSpeed, 1);
  assert.equal(active.incomeScale, 1.1, 'a saved cast snapshot stays active after expiry');
});

test('only landed collection fish earn difficulty-based XP; perfect and legendary follow Stardew truncation', () => {
  // Game has no quality grade or simultaneous chest, so normal quality and no treasure XP factor.
  assert.ok(fishCatchXp(sp('hamsa')) >= 1);
  assert.ok(fishCatchXp(sp('bluefish')) > fishCatchXp(sp('hamsa')));
  assert.equal(fishCatchXp(sp('hamsa'), true), Math.round(Math.trunc(17 * 2.4) * .3333));
  assert.ok(fishCatchXp(sp('sturgeon')) >= 33);
  assert.ok(fishCatchXp(sp('whiteshark')) >= fishCatchXp(sp('sturgeon')));
  for (const id of ['boot', 'bottle', 'chest', 'goldfish']) assert.equal(fishCatchXp(sp(id)), 0, id);
  assert.equal(fishCatchXp(-1), 0);
});

test('XP freezes released difficulty and rounds one-third after perfect then legendary factors', () => {
  // Independently derived from 1200-seed real cost-to-success calibration in the release report.
  assert.equal(fishCatchXp(sp('hamsa')), 6);
  assert.equal(fishCatchXp(sp('goby')), 5);
  assert.equal(fishCatchXp(sp('bluefish')), 10);
  assert.equal(fishCatchXp(sp('tuna')), 57);
  assert.equal(fishCatchXp(sp('tuna'), true), 135, '34 → floor(34*2.4)=81 → 81*5=405 → round(405*.3333)=135');
  assert.equal(fishCatchXp(sp('whiteshark')), 65);
  assert.equal(fishCatchXp(sp('whiteshark'), true), 155);
});
