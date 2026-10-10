// Ферма в 3D: вещи фермы из Blender разбираются без загрузчика, у каждой есть сетка в бюджете треугольников,
// у верха и низа есть слой ткани (PNG из cos_layers.json), детали на варежках — у перчаток, корзинки и манжет.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import type * as THREE from 'three';
import { FARM_WEAR } from '../shared/farmdata.ts';
import { farmPiece, isFarmWear, loadFarmWearSync } from '../client/render/farmwear.ts';
import { wearFor } from '../client/render/outfitfish.ts';

loadFarmWearSync((url) => readFileSync(url));
const LAYERS = JSON.parse(readFileSync(new URL('../client/assets/farm/textures/cos_layers.json', import.meta.url), 'utf8')) as {
  layers: Record<string, { png: string; glow?: string }>;
};

function tris(list: (THREE.BufferGeometry | null)[]): number {
  let n = 0;
  for (const g of list) {
    if (!g) continue;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
    n += (g.index?.count ?? p.count) / 3;
  }
  return n;
}

test('вещи фермы h, a, u, l: своя сетка из glb, общая на всех, в бюджете', () => {
  for (const [slot, key] of FARM_WEAR) {
    if (slot !== 'h' && slot !== 'a' && slot !== 'u' && slot !== 'l') continue;
    const id = `${slot}:${key}`;
    assert.ok(isFarmWear(id), id);
    const p = farmPiece(id)!;
    assert.ok(p.loaded, id);
    const n = tris([p.wear.geo, p.wear.metal, p.gloss, ...p.hands]);
    assert.ok(n >= 300 && n <= 1600, `${id}: ${n} треугольников`);
    if (slot === 'h' || slot === 'a') {
      // через тот же путь, что у желейки: outfitfish → outfit3d.wearOf → вещь фермы
      assert.equal(wearFor(slot, key), p.wear, `${id}: та же геометрия`);
    }
  }
  // перчатки и корзинка — на варежках, манжеты — у курток и футболок
  assert.ok(farmPiece('a:greengloves')!.hands[0] && farmPiece('a:greengloves')!.hands[1]);
  assert.ok(farmPiece('a:basket')!.hands[0]);
  assert.ok(farmPiece('u:plaid')!.hands[0] && !farmPiece('u:treevest')!.hands[0]);
  assert.equal(farmPiece('h:cap'), null);
});

test('слои ткани: у каждого верха и низа (кроме накидки) есть PNG, файлы на месте', () => {
  for (const [slot, key] of FARM_WEAR) {
    if (slot !== 'u' && slot !== 'l') continue;
    const def = LAYERS.layers[`${slot}:${key}`];
    if (key === 'leafcape') { assert.equal(def, undefined); continue; }
    assert.ok(def, `${slot}:${key}`);
    for (const f of [def.png, def.glow]) if (f) assert.ok(existsSync(new URL(`../client/assets/farm/textures/${f}`, import.meta.url)), f);
  }
});
