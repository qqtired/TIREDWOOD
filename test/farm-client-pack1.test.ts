import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WellPainter, FIELD_H, FIELD_W } from '../client/farm/well/draw.ts';
import { newWell, WELL } from '../shared/farmwell.ts';
import { beltCrops } from '../client/farm/ui/belt-model.ts';

test('пояс семян содержит только открытые на текущем уровне культуры', () => {
  const list = beltCrops(1);
  assert.ok(list.length > 0);
  assert.ok(list.every(c => c.level <= 1));
});

test('повторная попытка колодца рисует новый полный фон на прежнем canvas', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const sources: { width: number; height: number; scale: number }[] = [];
  const makeCanvas = () => {
    let scale = 1;
    const ctx = new Proxy({}, { get: (_, key) => key === 'setTransform' ? (value: number) => { scale = value; } : key === 'drawImage' ? (canvas: { width: number; height: number }) => sources.push({ width: canvas.width, height: canvas.height, scale }) : String(key).startsWith('create') ? () => ({ addColorStop() {} }) : () => {} });
    return { width: 300, height: 150, getContext: () => ctx, getBoundingClientRect: () => ({ width: 656 }) };
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: makeCanvas } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } });
  try {
    const canvas = makeCanvas();
    const sim = newWell(123);
    const view = { t: 0, clock: 0, can: sim.can, x: .5, tilt: 0, bucket: WELL.bucket, level: 0, hit: false, pouring: false, fullFor: -1 };
    new WellPainter(canvas as unknown as HTMLCanvasElement, 0).draw(view, .016);
    new WellPainter(canvas as unknown as HTMLCanvasElement, .2).draw(view, .016);
    assert.deepEqual(sources, [{ width: 656, height: Math.round(656 * FIELD_H / FIELD_W), scale: .8 }, { width: 656, height: Math.round(656 * FIELD_H / FIELD_W), scale: .8 }]);
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});

import { aggregateHarvest } from '../client/farm/ui/loot-model.ts';
import { canHelpBed, helpPrompt } from '../client/farm/ui/prompt-model.ts';
import { emptyFarm } from '../shared/farm.ts';

test('квитанция складывает весь основной и вторичный сбор, не теряя двойной урожай', () => {
  const rows = aggregateHarvest([{ bed: 0, crop: 'radish', n: 2, res: 'root', xp: 1 }, { bed: 1, crop: 'radish', n: 1, res: 'root', xp: 1 }, { bed: 2, crop: 'wheat', n: 1, res: null, xp: 1 }]);
  assert.equal(rows.find(r => r.key === 'crop:radish')?.n, 3);
  assert.equal(rows.find(r => r.key === 'res:root')?.n, 2);
  assert.equal(rows.find(r => r.key === 'crop:wheat')?.n, 1);
  assert.equal(rows.length, 3);
});

test('чужая спелая грядка доступна для осмотра новичку и может получить помощь', () => {
  const f = emptyFarm(0);
  const bed = { c: 'radish', p: 0, r: 100, w: true, h: 0 };
  assert.ok(canHelpBed(bed, 101));
  const p = helpPrompt(f, 'Ферма Паши', 0, bed, 101);
  assert.match(p.whose?.text ?? '', /Редис.*Ферма Паши.*Созрело/);
  assert.equal(p.keys.length, 0);
});

import { buildFarmMap } from '../shared/farmmap.ts';
import { CollisionWorld } from '../shared/world.ts';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { POND_USE } from '../shared/farmpond.ts';

test('прилавок и тело Фомы твёрдые, точка разговора остаётся доступной', () => {
  const world = new CollisionWorld(buildFarmMap(['van', 'boss']));
  assert.ok(world.overlaps(22.175, .1, -23.975, 23.325, .85, -23.325), 'нельзя пройти сквозь прилавок');
  assert.ok(world.overlaps(22.05, .9, -23.7, 22.8, 1.7, -22.95), 'тело Фомы твёрдое выше прилавка');
  assert.equal(world.overlaps(POND_USE.x - PLAYER_HALF, .12, POND_USE.z - PLAYER_HALF, POND_USE.x + PLAYER_HALF, .12 + PLAYER_HEIGHT, POND_USE.z + PLAYER_HALF), false, 'место E у Фомы свободно');
});
