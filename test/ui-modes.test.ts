import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rewardParts } from '../client/ui/kit/modetext.ts';

test('итоги режимов: награда — крупное «+N» и подпись, без «+N» — строкой как есть', () => {
  assert.deepEqual(rewardParts('+40 жетонов за второе место'), { plus: '+40', rest: 'жетонов за второе место' });
  assert.deepEqual(rewardParts('🪙 +12 · лучший защитник'), { plus: '+12', rest: '· лучший защитник' });
  assert.deepEqual(rewardParts('+1 250'), { plus: '+1 250', rest: 'жетонов' });
  assert.equal(rewardParts('Жетонов нет — гонку не доехал'), null);
});
