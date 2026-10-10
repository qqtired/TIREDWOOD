// Награды рыбалки в 3D: каждая вещь построена своим кодом, общая на всех, конечная и в бюджете треугольников.
import { FARM_ITEM_IDS } from '../shared/farmdata.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as THREE from 'three';
import { ISLE_ITEMS } from '../shared/fishstyle.ts';
import { ITEMS } from '../shared/outfit.ts';
import { wearOf } from '../client/render/outfit3d.ts';
import { petGeometry, wearFor } from '../client/render/outfitfish.ts';

function triangles(geos: Array<THREE.BufferGeometry | null>, id: string): number {
  let n = 0;
  for (const g of geos) {
    if (!g) continue;
    const p = g.getAttribute('position');
    n += (g.index?.count ?? p.count) / 3;
    for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), id);
  }
  return n;
}

test('одежда-трофеи рыбалки: своя геометрия, кэш, конечные числа, не больше 5000 треугольников', () => {
  // вещи острова — из GLB (render/islegear.ts), их проверяет test/islecos.test.ts; вещи фермы — test/farm-3d.test.ts
  const clothes = ITEMS.filter((it) => it.tier === 'trophy' && !ISLE_ITEMS.has(it.id) && !FARM_ITEM_IDS.has(it.id) && (it.slot === 'h' || it.slot === 'a'));
  assert.deepEqual(clothes.map((it) => it.id).sort(), ['a:angler', 'a:kukan', 'a:net', 'a:oilskin', 'a:tunic', 'h:angler', 'h:captain', 'h:sou']);
  for (const it of clothes) {
    const slot = it.slot as 'h' | 'a';
    const w = wearFor(slot, it.key);
    assert.equal(wearFor(slot, it.key), w, `${it.id}: одна геометрия на всех`);
    assert.ok(w.geo, `${it.id}: есть геометрия`);
    const n = triangles([w.geo, w.metal], it.id);
    assert.ok(n > 300 && n <= 5000, `${it.id}: ${n} треугольников`);
  }
  // жилет и панама — новые, не старые из outfit3d.ts
  assert.notEqual(wearFor('a', 'angler'), wearOf('a', 'angler'));
  assert.notEqual(wearFor('h', 'angler'), wearOf('h', 'angler'));
  // остальное — как было
  assert.equal(wearFor('h', 'cap'), wearOf('h', 'cap'));
});

test('питомцы: чайка и попугай — лёгкие; «без питомца» и чужой ключ — никого', () => {
  for (const key of ['gull', 'parrot']) {
    const g = petGeometry(key);
    assert.ok(g, key);
    const n = triangles([g], key);
    assert.ok(n > 200 && n <= 3000, `${key}: ${n} треугольников`);
  }
  assert.equal(petGeometry('none'), null);
  assert.equal(petGeometry('toString'), null);
});
