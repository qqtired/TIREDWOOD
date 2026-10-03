// Модель каждого вида помещается в свою коробку столкновений: что видно — то и твёрдое, и по силуэту
// прячущийся не больше и не меньше такого же предмета двора.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propGeometry } from '../client/hide/models.ts';
import { HIDE_KIND, HIDE_KINDS } from '../shared/hideprops.ts';

test('every prop model fits its collision box and fills most of it', () => {
  for (const k of HIDE_KINDS) {
    const b = propGeometry(k).boundingBox!, f = HIDE_KIND[k], tol = 0.021;
    assert.ok(b.min.x >= -f.w - tol && b.max.x <= f.w + tol, `${k}: x ${b.min.x}..${b.max.x} vs ±${f.w}`);
    assert.ok(b.min.z >= -f.d - tol && b.max.z <= f.d + tol, `${k}: z ${b.min.z}..${b.max.z} vs ±${f.d}`);
    assert.ok(b.min.y >= -tol && b.max.y <= f.h + tol, `${k}: y ${b.min.y}..${b.max.y} vs ${f.h}`);
    assert.ok(b.max.y >= f.h * 0.85 && b.max.x - b.min.x >= f.w * 2 * 0.75, `${k}: model is much smaller than its box`);
  }
});
