import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { REEL_MAX_TICKS, reelStart, reelRun } from '../shared/fishreel.ts';
import * as rules from '../shared/fishrules.ts';
import { emptyFishProgress, fishCastMods } from '../shared/fishprogress.ts';
import { makeRng } from '../shared/math.ts';
import { TYPICAL, playReel } from './fishbot.ts';

test('levels and rods change real zone width without changing fish movement or drain', () => {
  const boosted = fishCastMods({ ...emptyFishProgress(), xp: 15_000, questsDone: 10, rod: 3 }, 1000);
  assert.equal(typeof rules.reelStyleFor, 'function');
  for (const sp of rules.COLLECTION) {
    const base = rules.RULE[sp]!.style;
    const next = rules.reelStyleFor(sp, boosted);
    assert.equal(next.zone, base.zone * 1.625);
    assert.deepEqual({ ...next, zone: base.zone }, base, FISH[sp].id);
    const reel = reelStart(next, 427);
    assert.equal(reel.zone, Math.round(base.zone * 1.625 * 1000));
    const played = playReel(next, 427, TYPICAL);
    reelRun(reel, played.toggles, REEL_MAX_TICKS + 1);
    assert.equal(reel.done === 1, played.caught);
    assert.equal(reel.t, played.ticks);
    for (const [key, n] of Object.entries(reel.c)) assert.ok(Number.isInteger(n), `${FISH[sp].id}: ${key} must be integer`);
  }
});

test('beer rare weighting changes actual draws and keeps event-only fish unavailable in clear weather', () => {
  const plainRng = makeRng(947), beerRng = makeRng(947);
  const mods = fishCastMods({ ...emptyFishProgress(), beerUntil: 20_000 }, 1000);
  let plainRare = 0, beerRare = 0, plainChest = 0, beerChest = 0, plainJunk = 0, beerJunk = 0;
  for (let i = 0; i < 100_000; i++) {
    const a = rules.rollCatch2(false, plainRng);
    const b = rules.rollCatch2(false, beerRng, mods);
    assert.ok(!rules.RULE[b.sp]!.rain, 'beer never bypasses event availability');
    const at = rules.RULE[a.sp]!.tier, bt = rules.RULE[b.sp]!.tier;
    if (at >= 1 && at <= 4) plainRare++;
    if (bt >= 1 && bt <= 4) beerRare++;
    if (a.sp === rules.SP_CHEST) plainChest++;
    if (b.sp === rules.SP_CHEST) beerChest++;
    if (at === 5) plainJunk++;
    if (bt === 5) beerJunk++;
    if (a.sp === rules.SP_CHEST) assert.deepEqual(b, a, 'fish weights cannot change chest draw, content or weight');
  }
  assert.ok(beerRare > plainRare * 1.05, `rare catches ${beerRare} vs ${plainRare}`);
  assert.equal(beerChest, plainChest);
  assert.equal(beerJunk, plainJunk);
});

test('beer multiplies fish sale by 1.1 with integer rounding while chest and junk are unchanged', () => {
  const mods = fishCastMods({ ...emptyFishProgress(), beerUntil: 20_000 }, 1000);
  for (const sp of rules.COLLECTION) {
    const g = FISH[sp].g[1];
    assert.equal(rules.fishPrice2(sp, g, 0, mods), Math.round(rules.fishPrice2(sp, g) * 1.1), FISH[sp].id);
  }
  assert.equal(rules.fishPrice2(rules.SP_CHEST, 5000, 137, mods), 137);
  assert.equal(rules.fishPrice2(rules.SP_BOOT, 900, 0, mods), 0);
});

test('fisheco: green zone is one per rarity tier and within 1.5 points of the released high-tier sizes ×0.9 (03.10: zone −10%)', () => {
  const before: Record<string, readonly [number, number, number]> = {
    bluefish: [33, 120, 28], dogfish: [32, 115, 28], ray: [32, 118, 28], turbot: [37, 143, 28],
    seabass: [33, 113, 27], leerfish: [33, 118, 27], sturgeon: [28, 115, 25], tuna: [27, 106, 24],
    swordfish: [26, 105, 24], angler: [34, 169, 24], whiteshark: [27, 111, 22],
    bluemarlin: [27, 115, 24], greenlandshark: [26, 115, 21],
  };
  for (const sp of rules.COLLECTION.filter(sp => rules.RULE[sp]!.tier >= 2)) {
    const s = rules.RULE[sp]!.style;
    assert.ok(s.mainPattern && s.secondaryPattern, FISH[sp].id);
    assert.ok(s.spd > 0 && s.dartSpd > 0, FISH[sp].id);
    assert.equal(s.zone, rules.BAND[rules.tierRank(rules.RULE[sp]!.tier)].zone * rules.ZONE_BASE, FISH[sp].id);
    const old = before[FISH[sp].id];
    if (old) assert.ok(Math.abs(s.zone - old[2] * rules.ZONE_BASE) <= 1.5, `${FISH[sp].id}: зона почти как в выпуске, −10 %`);
  }
});
