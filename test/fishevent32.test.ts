import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  COLLECTION, COLLECTION_SIZE, COIN_PER_POINT, FISH_OTHER_PRICE_SCALE, RULE, T_COMMON, T_LEGEND, T_MYTH,
  biteShare, collectionCount, fishPrice2, isCollected, rollCatch2,
} from '../shared/fishrules.ts';
import { emptyFishProgress, fishCastMods } from '../shared/fishprogress.ts';
import { makeRng } from '../shared/math.ts';
import { TYPICAL, EXPERT, fishIncome, reelStats } from './fishbot.ts';

const sp = (id: string) => FISH.findIndex(f => f.id === id);

test('exactly two appended real species expand completion to32 without shifting old species IDs', () => {
  assert.equal(COLLECTION_SIZE, 32);
  assert.equal(COLLECTION.length, 32);
  assert.equal(sp('whiteshark'), 32);
  assert.equal(sp('chest'), 33);
  assert.equal(sp('bluemarlin'), 34);
  assert.equal(sp('greenlandshark'), 35);
  assert.equal(RULE[34]!.tier, T_LEGEND);
  assert.equal(RULE[35]!.tier, T_MYTH);
  const oldAlbum = Object.fromEntries(COLLECTION.filter(s => s < 34).map(s => [FISH[s].id, [FISH[s].g[0], 1] as const]));
  assert.equal(collectionCount(oldAlbum), 30, 'old full album cannot satisfy32');
  assert.ok(collectionCount(oldAlbum) < COLLECTION_SIZE);
  for (const s of [34, 35]) oldAlbum[FISH[s].id] = [FISH[s].g[0], 1];
  assert.equal(collectionCount(oldAlbum), 32);
});

test('unique event-only pool contains allfive rarity tiers, includes common picarel and two real new species', () => {
  const unique = COLLECTION.filter(s => RULE[s]!.rain);
  assert.equal(unique.length, 8);
  assert.deepEqual([...new Set(unique.map(s => RULE[s]!.tier))].sort(), [0, 1, 2, 3, 4]);
  assert.equal(RULE[sp('picarel')]!.tier, T_COMMON);
  assert.ok(RULE[sp('picarel')]!.rain);
  const mods = fishCastMods({ ...emptyFishProgress(), xp: 15_000, beerUntil: 1_000_000 }, 0);
  const rng = makeRng(337);
  for (let i = 0; i < 100_000; i++) assert.ok(!RULE[rollCatch2(false, rng, mods).sp]!.rain);
  for (const s of unique) {
    assert.equal(biteShare(s, false, mods), 0);
    assert.ok(biteShare(s, true) > 0 && isCollected(s));
  }
});

test('new event myth is rarest and harder than legend but skilled players can land it', () => {
  const legend = sp('bluemarlin'), myth = sp('greenlandshark');
  assert.ok(legend >= 0 && myth >= 0, 'both species exist');
  const eventRares = COLLECTION.filter(s => RULE[s]!.rain && RULE[s]!.tier >= 1 && RULE[s]!.tier <= 2);
  assert.ok(biteShare(myth, true) < biteShare(legend, true));
  for (const s of eventRares) assert.ok(biteShare(legend, true) < biteShare(s, true));
  for (const s of COLLECTION) if (s !== myth) assert.ok(biteShare(myth, true) < biteShare(s, true), FISH[s].id);
  const oldMyth = RULE[sp('whiteshark')]!;
  for (const skill of [TYPICAL, EXPERT]) {
    const green = reelStats(RULE[myth]!.style, skill, 1200, 11 + myth * 7919);
    const marlin = reelStats(RULE[legend]!.style, skill, 1200, 11 + legend * 7919);
    const white = reelStats(oldMyth.style, skill, 1200, 11 + oldMyth.sp * 7919);
    assert.ok(marlin.costTicks < white.costTicks, 'new legendary must stay below the old myth band');
    assert.ok(green.costTicks >= white.costTicks, 'event myth is at least as difficult as the old myth');
    assert.ok(green.p > (skill === EXPERT ? .4 : .05), 'myth must be difficult but catchable');
  }
});

test('new legendary/myth use the same1.5 event reward with appropriate base values and no special nerf', () => {
  const legend = sp('bluemarlin'), myth = sp('greenlandshark');
  assert.ok(legend >= 0 && myth >= 0);
  assert.ok(RULE[myth]!.val[0] > RULE[legend]!.val[1]);
  for (const s of [legend, myth]) {
    const r = RULE[s]!, f = FISH[s];
    for (const [g, value] of [[f.g[0], r.val[0]], [f.g[1], r.val[1]]] as const) {
      assert.equal(fishPrice2(s, g), Math.round(value * COIN_PER_POINT * FISH_OTHER_PRICE_SCALE * 1.5));
    }
  }
  const common = sp('picarel');
  assert.equal(fishPrice2(common, FISH[common].g[0]), 6, 'old integer2 → common round(2*1.75)=4 → unique round(4*1.5)=6');
});

test('event is noticeably more profitable by its fish pool while novice clear stays within5% of +50% target', t => {
  const clear = fishIncome(TYPICAL, false, 300), event = fishIncome(TYPICAL, true, 300);
  t.diagnostic(`clear ${clear.coins.toFixed(6)} event ${event.coins.toFixed(6)} event gain ${(100 * (event.coins / clear.coins - 1)).toFixed(2)}%`);
  assert.ok(Math.abs(clear.coins / (13.465547009661105 * 1.5) - 1) < .05);
  assert.ok(event.coins > clear.coins * 1.3, 'event earns >30% extra fish sale via unique weights and rewards');
});
