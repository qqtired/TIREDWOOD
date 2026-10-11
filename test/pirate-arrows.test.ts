import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import type { ArrowSpec } from '../client/lobby/piratehud.ts';

// piratehud.ts подключает свой CSS и картинку жетона — в Node это заглушки
const hook = registerHooks({ load(url, ctx, next) { if (/\.(webp|png|jpg|css)$/.test(new URL(url).pathname)) return { format: 'module', source: `export default ${JSON.stringify(url)}`, shortCircuit: true }; return next(url, ctx); } });
const { binArrows } = await import('../client/lobby/piratehud.ts');
hook.deregister();

const at = (kind: ArrowSpec['kind'], angle: number, label = ''): ArrowSpec => ({ kind, x: 0, y: 0, angle, label });

test('стрелки пиратов: ящик рядом не прячет вора в той же стороне — у каждого вида своя стрелка', () => {
  const g = binArrows([at('loot', 0.05, '10'), at('thief', 0.08, '25'), at('loot', 0.1, '12')]);
  assert.deepEqual(g.map((x) => [x.s.kind, x.n, x.nth]), [['loot', 2, 0], ['thief', 1, 1]]);
  assert.equal(g[0].s.label, '10', 'стрелка группы — первая (самая важная) угроза');
});

test('стрелки пиратов: +π и −π — одна сторона', () => {
  const g = binArrows([at('boat', Math.PI - 0.01), at('boat', -Math.PI + 0.01)]);
  assert.equal(g.length, 1);
  assert.equal(g[0].n, 2);
});

test('стрелки пиратов: разные стороны — разные стрелки', () => {
  const g = binArrows([at('pirate', 0), at('pirate', Math.PI / 2), at('pirate', -Math.PI / 2)]);
  assert.equal(g.length, 3);
  assert.ok(g.every((x) => x.n === 1 && x.nth === 0));
});
