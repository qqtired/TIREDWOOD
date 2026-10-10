import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  COLLECTION, COLLECTION_SIZE, COIN_PER_POINT, FISH_OTHER_PRICE_SCALE, FISH_PRICE_CUT, RULE, T_COMMON, T_DIVINE, T_LEGEND, T_MYTH,
  biteShare, collectionCount, fishPrice2, isCollected, rollCatch2,
} from '../shared/fishrules.ts';
import { emptyFishProgress, fishCastMods } from '../shared/fishprogress.ts';
import { makeRng } from '../shared/math.ts';
import { TYPICAL, EXPERT, fishIncome, reelStats } from './fishbot.ts';

const sp = (id: string) => FISH.findIndex(f => f.id === id);

test('appended real species expand completion (32 at the pier + 19 on the barkas + the divine kalmar everywhere) without shifting old species IDs', () => {
  assert.equal(COLLECTION_SIZE, 52);
  assert.equal(COLLECTION.length, 52);
  assert.equal(sp('whiteshark'), 32);
  assert.equal(sp('chest'), 33);
  assert.equal(sp('bluemarlin'), 34);
  assert.equal(sp('greenlandshark'), 35);
  assert.equal(sp('sprat'), 36, 'виды баркаса — строго после прежних');
  assert.equal(sp('hammerhead'), 54);
  assert.equal(sp('kalmar'), 55, '04.10: кальмар — в самый конец, номера прежних не сдвинуты');
  assert.equal(RULE[55]!.tier, T_DIVINE);
  assert.deepEqual(RULE[55]!.zones, ['pier', 'barkas'], 'божественный — и у пристани, и с баркаса');
  assert.equal(RULE[34]!.tier, T_LEGEND);
  assert.equal(RULE[35]!.tier, T_MYTH);
  const pier = COLLECTION.filter(s => RULE[s]!.zone === 'pier' && RULE[s]!.tier !== T_DIVINE);
  assert.equal(pier.length, 32);
  assert.ok(pier.every(s => s < 36));
  const oldAlbum = Object.fromEntries(pier.map(s => [FISH[s].id, [FISH[s].g[0], 1] as const]));
  assert.equal(collectionCount(oldAlbum), 32, 'вся прежняя коллекция на месте');
  assert.ok(collectionCount(oldAlbum) < COLLECTION_SIZE, 'для полной — нужен баркас');
});

test('unique event-only pools: pier keeps all five tiers with picarel; barkas adds its own four; greenland shark bites at both (04.10)', () => {
  const unique = COLLECTION.filter(s => RULE[s]!.rain);
  const pier = unique.filter(s => RULE[s]!.zone === 'pier');
  const sea = unique.filter(s => RULE[s]!.zone === 'barkas');
  assert.equal(pier.length, 8);
  assert.equal(sea.length, 4);
  assert.deepEqual([...new Set(pier.map(s => RULE[s]!.tier))].sort(), [0, 1, 2, 3, 4]);
  assert.deepEqual(sea.map(s => RULE[s]!.tier).sort(), [1, 2, 2, 3], 'баркас в дождь: 1 редкая, 2 эпические, 1 легенда');
  assert.equal(RULE[sp('picarel')]!.tier, T_COMMON);
  assert.ok(RULE[sp('picarel')]!.rain);
  for (const zone of ['pier', 'barkas'] as const) {
    const mods = fishCastMods({ ...emptyFishProgress(), xp: 15_000, beerUntil: 1_000_000 }, 0, zone);
    const rng = makeRng(337);
    for (let i = 0; i < 50_000; i++) assert.ok(!RULE[rollCatch2(false, rng, mods).sp]!.rain);
    assert.equal(biteShare(sp('greenlandshark'), true, mods) > 0, true, `${zone}: гренландская акула в дождь — и у пристани, и с баркаса`);
    for (const s of unique) {
      assert.equal(biteShare(s, false, mods), 0);
      assert.equal(biteShare(s, true, mods) > 0, RULE[s]!.zones.includes(zone), `${FISH[s].id}: только в своём месте`);
      assert.ok(isCollected(s));
    }
  }
});

test('event myth is the rarest pier fish of its tiers (only the divine tier is rarer than the myth tier), harder than its legend, and still catchable', () => {
  const legend = sp('bluemarlin'), myth = sp('greenlandshark');
  assert.ok(legend >= 0 && myth >= 0, 'both species exist');
  const pier = COLLECTION.filter(s => RULE[s]!.zone === 'pier' && RULE[s]!.tier !== T_DIVINE);
  // 04.10 (причёсанные шансы): божественная — 0,43 % против 0,99 % мифических; в дождь мифические делят долю на двоих,
  // и гренландской акуле (трети мифических) достаётся меньше, чем кальмару, — сравниваем категории, а не виды
  const mythTier = pier.filter(s => RULE[s]!.tier === T_MYTH).reduce((a, s) => a + biteShare(s, true), 0);
  assert.ok(biteShare(sp('kalmar'), true) < mythTier, 'реже мифических — только божественная');
  const eventRares = pier.filter(s => RULE[s]!.rain && RULE[s]!.tier >= 1 && RULE[s]!.tier <= 2);
  assert.ok(biteShare(myth, true) < biteShare(legend, true));
  for (const s of eventRares) assert.ok(biteShare(legend, true) < biteShare(s, true));
  for (const s of pier) if (s !== myth) assert.ok(biteShare(myth, true) < biteShare(s, true), FISH[s].id);
  for (const skill of [TYPICAL, EXPERT]) {
    const green = reelStats(RULE[myth]!.style, skill, 1200, 11 + myth * 7919);
    const marlin = reelStats(RULE[legend]!.style, skill, 1200, 11 + legend * 7919);
    assert.ok(green.p < marlin.p || skill === EXPERT, 'обычному игроку мифик труднее легенды');
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
      // хотфикс 10.10: поверх прежней цены рыба дешевле на 35 % (FISH_PRICE_CUT)
      assert.equal(fishPrice2(s, g), Math.max(1, Math.round(Math.round(value * COIN_PER_POINT * FISH_OTHER_PRICE_SCALE * 1.5) * FISH_PRICE_CUT)));
    }
  }
  const common = sp('picarel');
  assert.equal(fishPrice2(common, FISH[common].g[0]), 4, 'old integer2 → common round(2*1.75)=4 → unique round(4*1.5)=6 → хотфикс 10.10 round(6*0.65)=4');
});

test('event is noticeably more profitable by its fish pool while novice clear stays at most 20% below the +50% target (fisheco: harder rare fish, 03.10 zone −10%)', t => {
  const clear = fishIncome(TYPICAL, false, 300), event = fishIncome(TYPICAL, true, 300);
  t.diagnostic(`clear ${clear.coins.toFixed(6)} event ${event.coins.toFixed(6)} event gain ${(100 * (event.coins / clear.coins - 1)).toFixed(2)}%`);
  const ratio = clear.coins / (13.465547009661105 * 1.5 * FISH_PRICE_CUT);
  assert.ok(ratio >= 0.8 && ratio <= 0.92, `novice clear ${ratio.toFixed(3)} of the +50% target`);
  assert.ok(event.coins > clear.coins * 1.3, 'event earns >30% extra fish sale via unique weights and rewards');
});
