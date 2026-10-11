import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hudScale } from '../client/ui/kit/scale.ts';

test('масштаб HUD: 1440×900 — 1, 2K — 1,6, маленький экран — не меньше 0,8, под пальцем — не меньше 0,6', () => {
  assert.equal(hudScale(1440, 900, 1), 1);
  assert.equal(hudScale(2560, 1440, 1), 1.6);
  assert.equal(hudScale(1280, 720, 1), 0.8);
  assert.equal(hudScale(1920, 1080, 1), 1.2);
  assert.equal(hudScale(1920, 1080, 1.15), 1.38);
  assert.equal(hudScale(844, 390, 1, true), 0.6);
});
import { TopCenterModel, PRIO } from '../client/ui/kit/topcenter.ts';

test('верх-центр: одна плашка — с самым высоким приоритетом', () => {
  const m = new TopCenterModel();
  m.show({ key: 'storm', prio: PRIO.storm, html: 'Шторм' });
  m.show({ key: 'vote', prio: PRIO.vote, html: 'Выгнать?' });
  assert.equal(m.current()?.key, 'vote');
  m.hide('vote');
  assert.equal(m.current()?.key, 'storm');
});

test('верх-центр: тостов не больше трёх, тот же ключ заменяет', () => {
  const m = new TopCenterModel();
  for (const t of ['a', 'b', 'c', 'd']) m.toast({ title: t, icon: '' });
  assert.deepEqual(m.toasts().map((t) => t.title), ['b', 'c', 'd']);
  m.toast({ key: 'tok', title: '+5', icon: '' });
  m.toast({ key: 'tok', title: '+12', icon: '' });
  assert.equal(m.toasts().filter((t) => t.key === 'tok').length, 1);
  assert.equal(m.toasts().at(-1)?.title, '+12');
});
