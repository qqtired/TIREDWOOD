import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import * as catalog from '../shared/outfit.ts';
import { itemPrice } from '../shared/economy.ts';
import { bodyR, wearOf } from '../client/render/outfit3d.ts';
import { devilHeadParts, devilTailParts } from '../client/render/devil3d.ts';

const ids = ['h:devil', 'a:deviltail'];

test('gift set is appended, hidden until owned, individually equippable and never sold', () => {
  assert.deepEqual(catalog.ITEMS.slice(-2).map(it => it.id), ids);
  const visible = catalog.isItemVisible;
  for (const id of ids) {
    const it = catalog.itemById(id)!;
    assert.equal(it.tier, 'promo');
    assert.equal(itemPrice(it.tier), null);
    assert.equal(visible(it, []), false);
    assert.equal(visible(it, [id]), true);
    assert.equal(visible(it, ids.filter(other => other !== id)), false);
    assert.equal(catalog.isOwned([], it), false);
    assert.equal(catalog.sanitizeOutfit(catalog.withItem(catalog.DEFAULT_OUTFIT, it), [id])[it.slot], it.key);
    assert.equal(catalog.sanitizeOutfit(catalog.withItem(catalog.DEFAULT_OUTFIT, it), [])[it.slot], 'none');
  }
  for (const it of catalog.ITEMS.filter(it => it.tier !== 'promo')) assert.equal(visible(it, []), true);
  const worn = { ...catalog.DEFAULT_OUTFIT, c: 12, h: 'devil', a: 'deviltail' };
  assert.deepEqual(catalog.sanitizeOutfit(JSON.parse(JSON.stringify(worn)), ids), worn);
  assert.equal(catalog.sanitizeOutfit(worn, ['h:devil']).a, 'none');
  assert.equal(catalog.sanitizeOutfit(worn, ['a:deviltail']).h, 'none');
});

test('pre-gift catalog keeps all item and slot indexes, including premium expansion', () => {
  const old = ['p:none', 'p:stripes', 'p:dots', 'p:spots', 'p:sunset', 'p:camo', 'p:sugar', 'p:gold',
    'e:normal', 'e:sleepy', 'e:angry', 'e:happy', 'e:glasses', 'e:shades', 'e:patch', 'e:monocle', 'e:angler',
    'h:none', 'h:cap', 'h:panama', 'h:ushanka', 'h:fisher', 'h:bandana', 'h:helmet', 'h:sailor', 'h:tophat', 'h:crown', 'h:fool', 'h:angler',
    'a:none', 'a:scarf', 'a:mustache', 'a:bowtie', 'a:headphones', 'a:lifebuoy', 'a:chain', 'a:epaulets', 'a:angler',
    'h:astronaut', 'h:storm', 'a:jetpack', 'e:prism'];
  assert.deepEqual(catalog.ITEMS.slice(0, old.length).map(it => it.id), old);
});

test('tail shaft has an open silhouette without a returning loop and tapers toward its tip', () => {
  const parts = devilTailParts();
  const shaft = parts[0];
  const p = shaft.getAttribute('position'), uv = shaft.getAttribute('uv');
  const rings = new Map<number, Map<string, THREE.Vector3>>();
  // Side triangles span neighbouring longitudinal UV rows; end-cap triangles do not.
  for (let i = 0; i < p.count; i += 3) {
    const us = [uv.getX(i), uv.getX(i + 1), uv.getX(i + 2)];
    const span = Math.max(...us) - Math.min(...us);
    if (span <= 0 || span > .04) continue;
    for (let j = 0; j < 3; j++) {
      const v = new THREE.Vector3(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
      const key = v.toArray().map(n => n.toFixed(5)).join(',');
      const ring = rings.get(us[j]) ?? new Map<string, THREE.Vector3>();
      ring.set(key, v); rings.set(us[j], ring);
    }
  }
  const samples = [...rings].sort(([a], [b]) => a - b).map(([, ring]) => {
    const points = [...ring.values()];
    const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
    return { center, radius: points.reduce((sum, p) => sum + p.distanceTo(center), 0) / points.length };
  });
  assert.ok(samples.length > 30, 'test covers actual mesh cross-sections');
  assert.ok(samples[0].center.y < .5, 'root remains low');
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].center.x > samples[i - 1].center.x, 'front/back silhouette does not fold into a loop');
    assert.ok(samples[i].center.z > samples[i - 1].center.z, 'side silhouette does not fold into a loop');
  }
  assert.ok(Math.min(...samples.map(s => s.center.y)) < .31, 'shorter tail retains its hanging curve');
  assert.ok(samples.at(-1)!.center.y > .5, 'open tip curls upward');
  assert.ok(samples.at(-1)!.radius < samples[0].radius * .55, 'shaft narrows smoothly at arrow joint');
  parts.forEach(g => g.dispose());
});

test('horns shrink around their roots and the band narrows without shrinking its head fit', () => {
  const [band, ...horns] = devilHeadParts(bodyR);
  band.computeBoundingBox();
  const b = band.boundingBox!;
  assert.ok(Math.abs(b.max.z - b.min.z - .02784) < .0001, 'narrow padded band');
  assert.ok(b.max.y < 1.62, 'rounded crown has no high pointed peak');
  assert.ok(b.min.x < -.39 && b.max.x > .39, 'band keeps its fitted contour with inset ends');
  const bandPoints = band.getAttribute('position');
  for (let i = 0; i < bandPoints.count; i++) {
    const y = bandPoints.getY(i);
    if (y < 1.252) assert.ok(Math.hypot(bandPoints.getX(i), bandPoints.getZ(i)) <= bodyR(y) + .002, 'lower tips blend into the body rather than exposing flat caps');
  }
  for (const horn of horns) {
    horn.computeBoundingBox();
    const h = horn.boundingBox!;
    assert.ok(h.max.y > 1.756 && h.max.y < 1.758, 'short horns rise half the original height above their seated roots');
    assert.ok(h.min.y < 1.49, 'horn remains seated at its original root');
  }
  [band, ...horns].forEach(g => g.dispose());
});

test('devil set uses two cached vertex-color draws, finite smooth meshes and a bounded triangle budget', () => {
  for (const [slot, key] of [['h', 'devil'], ['a', 'deviltail']] as const) {
    const w = wearOf(slot, key);
    assert.equal(wearOf(slot, key), w);
    assert.ok(w.geo, key);
    assert.equal(w.metal, null, 'one existing material/draw per item');
    const p = w.geo.getAttribute('position');
    const n = w.geo.getAttribute('normal');
    assert.equal(w.geo.getAttribute('color').count, p.count);
    const triangles = (w.geo.index?.count ?? p.count) / 3;
    assert.ok(triangles > 200 && triangles < 2200, `${key}: ${triangles} triangles`);
    for (let i = 0; i < p.count; i++) {
      assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), key);
      assert.ok(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) > .9, 'valid lit normals');
    }
    w.geo.computeBoundingBox();
    const b = w.geo.boundingBox!;
    assert.ok(b.min.y + w.y > .1, 'tail clears ground');
    assert.ok(b.max.y + w.y < 2.2, 'head silhouette stays within label-aware bounds');
    if (slot === 'h') {
      assert.ok(b.max.y + w.y > 1.75 && b.max.y + w.y < 1.77 && b.min.x < -.35 && b.max.x > .35, 'short horns keep their fitted headband');
    } else {
      assert.ok(b.max.x > .82 && b.max.x < .9 && b.min.z > .35, 'shortened curl reads beside body, stays behind face');
      assert.ok(w.y >= .35 && w.y <= .5, 'tail attaches to lower back, not mid-body');
      assert.ok(b.max.y + w.y < .72, 'low open curl without a long diagonal upper stem');
      // Same parent scale and waist anchor rotation used by Avatar for run/jump/sit/emotes.
      for (const [sx, sy, leanX, leanZ, lift] of [[1, 1, 0, 0, 0], [.93, 1.14, .16, -.16, .1], [1.04, .88, -.16, .16, .3]]) {
        for (let i = 0; i < p.count; i++) {
          const q = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))
            .applyEuler(new THREE.Euler(leanZ * 2 * w.y / 1.58 ** 2, 0, -leanX * 2 * w.y / 1.58 ** 2));
          q.y += w.y;
          q.multiply(new THREE.Vector3(sx, sy, sx));
          assert.ok(q.y + lift > 0, 'tail does not sweep below standing/sitting support');
        }
      }
    }
  }
});
