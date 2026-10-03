// Рыбаки у маяка: удочка идёт теми же событиями, что и у игрока на сервере (заброс → пробы → поклёвка → …).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FE_BITE, FE_CAST, FE_DONE, FE_EARLY, FE_HOOK, FE_LAND, FE_MISS, FE_NIBBLE, FISH } from '../shared/fishing.ts';
import { makeRng } from '../shared/math.ts';
import { FisherBrain } from '../client/lobby/folksim.ts';

test('рыбак: события удочки идут в том же порядке, что у игрока, и улов уходит в ведро или в море', () => {
  const fisher = new FisherBrain(-14.6, 40.3, -Math.PI / 2, makeRng(11));
  const log: Array<[number, number, number]> = [];
  for (let i = 0; i < 60 * 60 * 20; i++) fisher.step(1 / 60, (k, a, b) => log.push([k, a, b]));
  assert.ok(fisher.caught >= 5, `за 20 минут поймал ${fisher.caught}`);
  let phase = 'idle';
  let lastN = 0;
  let sp = -1;
  for (const [k, a, b] of log) {
    switch (k) {
      case FE_CAST:
        assert.equal(phase, 'idle', 'забрасывает, только когда свободен');
        // поплавок — в воду перед рыбаком (на восток), 5,5–8 м
        assert.ok(a - -14.6 >= 5.5 && a - -14.6 <= 8 + 1e-9, `заброс на x = ${a}`);
        assert.ok(Math.abs(b - 40.3) <= 1.2 + 1e-9);
        phase = 'wait';
        lastN = 0;
        break;
      case FE_NIBBLE:
      case FE_BITE:
        assert.equal(phase, 'wait');
        assert.equal(a, lastN + 1, 'номера проб и поклёвки — по порядку');
        lastN = a;
        if (k === FE_BITE) phase = 'bite';
        break;
      case FE_EARLY:
        assert.equal(phase, 'wait', 'дёрнул на пробе');
        phase = 'idle';
        break;
      case FE_MISS:
        assert.equal(phase, 'bite', 'прозевал поклёвку');
        phase = 'idle';
        break;
      case FE_HOOK:
        assert.equal(phase, 'bite');
        assert.ok(FISH[a], 'вид рыбы — из списка');
        assert.ok(b > 0);
        sp = a;
        phase = 'reel';
        break;
      case FE_LAND:
        assert.equal(phase, 'reel');
        assert.equal(a, sp, 'вытащил ту, что подсёк');
        phase = 'hold';
        break;
      case FE_DONE:
        assert.equal(phase, 'hold');
        assert.ok(a === 0 || a === 2, 'в море (0) или в ведро (2)');
        phase = 'idle';
        break;
      default:
        assert.fail(`лишнее событие ${k}`);
    }
  }
});
