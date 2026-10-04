import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FishClock, confirmedFishBeer, fishTimeLeft } from '../client/lobby/fishclock.ts';
import { FishSeasonClock, isFishSeasonMsg, seasonLeft, seasonLine, seasonWait } from '../client/lobby/fishseason.ts';

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

test('сезон рыбалки: подписи окна Семёна и плашки — «до сезона» минутами вверх, идущий — таймером', () => {
  assert.equal(seasonWait(45_000), '45 с');
  assert.equal(seasonWait(60_001), '2 мин');
  assert.equal(seasonWait(72 * 60_000), '1 ч 12 мин');
  assert.equal(seasonWait(2 * 3600_000), '2 ч');
  assert.equal(seasonLeft(400_000), '6:40');
  assert.equal(seasonLeft(0), '0:00');
  assert.equal(seasonLine(null), '');
  assert.equal(seasonLine({ on: false, left: 72 * 60_000 }), 'До сезона рыбалки: 1 ч 12 мин');
  assert.equal(seasonLine({ on: true, left: 400_000 }), 'Сезон рыбалки идёт! осталось 6:40');
});

test('сезон рыбалки: письмо сервера проверяется по полям и заменяет заглушку; кончился — до следующего', () => {
  assert.equal(isFishSeasonMsg({ t: 'fishSeason', on: true, endsAt: 1, nextAt: 2 }), true);
  assert.equal(isFishSeasonMsg({ t: 'fishSeason', on: 1, endsAt: 1, nextAt: 2 }), false);
  assert.equal(isFishSeasonMsg({ t: 'fishEvent', on: true, until: 0 }), false);
  assert.equal(isFishSeasonMsg(null), false);
  const s = new FishSeasonClock();
  const t0 = 1_700_000_000_000;
  s.onMsg({ t: 'fishSeason', on: true, endsAt: t0 + 400_000, nextAt: t0 + 7_200_000 });
  assert.equal(s.stub, false);
  assert.deepEqual(s.state(t0), { on: true, left: 400_000 });
  // письмо о конце опоздало: показываем, сколько до следующего
  assert.deepEqual(s.state(t0 + 500_000), { on: false, left: 6_700_000 });
  assert.equal(s.state(t0 + 8_000_000), null);
});
