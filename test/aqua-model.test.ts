import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AquaKit, AQUA_MODEL_PARTS } from '../client/lobby/aquamodels.ts';
import { AQUA_BAGS, AQUA_BAG_H, AQUA_MOVERS, AQUA_PIECES, AQUA_SWEEPERS } from '../shared/aqua.ts';
import { WATER_Y } from '../shared/constants.ts';

test('аквапарк: принятые GLB-модули имеют игровой верх, длину толкателей и общую ватерлинию', async () => {
  const b = readFileSync(new URL('../client/assets/aqua/v3/aqua-kit-v3.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  const kit = new AquaKit(gltf.scene);
  let triangles = 0;
  for (const name of AQUA_MODEL_PARTS) {
    const p = kit.part(name).getAttribute('position');
    assert.ok(p.count > 0, name);
    assert.ok(Array.from(p.array).every(Number.isFinite), `${name}: конечные вершины`);
    triangles += p.count / 3;
  }
  assert.ok(triangles < 12_000, `библиотека ${triangles} треугольников`);
  for (const m of AQUA_MOVERS) {
    const g = kit.mover(m); g.computeBoundingBox();
    if (m.kind !== 'ferry') assert.ok(Math.abs(g.boundingBox!.max.y) < 0.001, 'верх подушки и лифта совпадает с коллизией');
    if (m.kind !== 'lift') assert.ok(g.boundingBox!.min.y + m.top <= WATER_Y - 0.1, 'плавающий модуль погружён в общую воду');
  }
  for (const sw of AQUA_SWEEPERS) {
    const g = kit.sweeper(sw); g.computeBoundingBox();
    assert.ok(Math.abs(g.boundingBox!.max.x - sw.len) < 0.001);
    assert.ok(Math.abs(g.boundingBox!.min.x + sw.len) < 0.001);
  }
  const bag = kit.bag(); bag.computeBoundingBox();
  assert.ok(Math.abs(bag.boundingBox!.min.y + AQUA_BAGS[0].len + AQUA_BAG_H / 2) < 0.001, 'дно мешка соответствует общему hit test');
  const slide = kit.slide(AQUA_PIECES.find((p) => p.kind === 'slide')!);
  assert.ok(Array.from(slide.getAttribute('position').array).every(Number.isFinite));
});
