import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBundleSize } from '../client/fitting-room/bundle.ts';

test('bundle: all 40 maximum-sized reference images and one model can be restored', () => {
  // 40 × 8 MiB images + 20 MiB GLB, base64 expansion + 1 MiB metadata.
  const encodedBytes = 476403032;
  assert.doesNotThrow(() => checkBundleSize(encodedBytes));
});
test('bundle: exported and imported files share a readable size boundary', () => {
  assert.doesNotThrow(() => checkBundleSize(536870912));
  assert.throws(() => checkBundleSize(536870913), /512 МБ/);
});
