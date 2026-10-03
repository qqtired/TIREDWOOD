import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FishClock, confirmedFishBeer, fishTimeLeft } from '../client/lobby/fishclock.ts';

test('buff display advances from the server sample without trusting local wall time', () => {
  const clock = new FishClock();
  clock.sync(1_700_000_000_000, 50);
  assert.equal(clock.now(10_050), 1_700_000_010_000);
  assert.equal(clock.now(40), 1_700_000_000_000);
  clock.sync(1_700_000_011_000, 10_050);
  assert.equal(clock.now(11_050), 1_700_000_012_000);
  clock.sync(NaN, 11_050);
  assert.equal(clock.now(12_050), 1_700_000_013_000);
});

test('buff countdown includes the final partial second and stops at expiry', () => {
  assert.equal(fishTimeLeft(600_000, 0), '10:00');
  assert.equal(fishTimeLeft(600_000, 18_001), '09:42');
  assert.equal(fishTimeLeft(600_000, 599_999), '00:01');
  assert.equal(fishTimeLeft(600_000, 600_000), '00:00');
  assert.equal(fishTimeLeft(600_000, 700_000), '00:00');
});

test('only a confirmed pending beer purchase starts consumption, never load or rejection', () => {
  assert.equal(confirmedFishBeer(null, 0, 600_000, 0), false);
  assert.equal(confirmedFishBeer('open', 0, 600_000, 0), false);
  assert.equal(confirmedFishBeer('claim', 0, 600_000, 0), false);
  assert.equal(confirmedFishBeer('beer', 600_000, 600_000, 10_000), false);
  assert.equal(confirmedFishBeer('beer', 0, 600_000, 600_000), false);
  assert.equal(confirmedFishBeer('beer', 0, 600_000, 10_000), true);
  // Use the value captured on click even when me/progress arrived before the NPC reply.
  assert.equal(confirmedFishBeer('beer', 600_000, 1_300_000, 700_000), true);
});
