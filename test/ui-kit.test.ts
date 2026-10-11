import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hudScale } from '../client/ui/kit/scale.ts';

test('масштаб HUD: 1440×900 — 1, 2K — 1,6, маленький экран — не меньше 0,8', () => {
  assert.equal(hudScale(1440, 900, 1), 1);
  assert.equal(hudScale(2560, 1440, 1), 1.6);
  assert.equal(hudScale(1280, 720, 1), 0.8);
  assert.equal(hudScale(1920, 1080, 1), 1.2);
  assert.equal(hudScale(1920, 1080, 1.15), 1.38);
});
