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

test('верх-центр: баннер по центру — один; менее важный не перебивает, пока висит важный', () => {
  let now = 0;
  const m = new TopCenterModel(() => now);
  assert.equal(m.hero({ key: 'level', prio: PRIO.mode, tone: 'gold', title: 'Уровень 5!' }), true);
  assert.equal(m.hero({ key: 'jackpot', prio: PRIO.info, tone: 'gold', title: 'Джекпот!' }), false);
  assert.equal(m.currentHero()?.key, 'level');
  now = 3400;
  assert.equal(m.currentHero(), null);
  assert.equal(m.hero({ key: 'jackpot', prio: PRIO.info, tone: 'gold', title: 'Джекпот!' }), true);
  assert.equal(m.clearHero('level'), false);
  assert.equal(m.clearHero('jackpot'), true);
  assert.equal(m.currentHero(), null);
});

import { toastLead } from '../client/ui/toastlead.ts';

test('тосты: начальный эмодзи → картинка кита, сам эмодзи из текста убран', () => {
  // флаг пиратов — со склейкой и вариантным селектором и без него
  assert.deepEqual(toastLead('\u{1F3F4}\u{200D}\u{2620}\u{FE0F} Пираты на горизонте!'), { icon: 'pirate-flag', title: 'Пираты на горизонте!' });
  assert.deepEqual(toastLead('\u{1F3F4}\u{200D}\u{2620} Пираты'), { icon: 'pirate-flag', title: 'Пираты' });
  assert.deepEqual(toastLead('\u{26C8}\u{FE0F} Гроза'), { icon: 'storm', title: 'Гроза' });
  // незнакомый — картинки нет, но и в тексте его нет (у тоста своя картинка)
  assert.deepEqual(toastLead('\u{1F389} Сезон рыбалки'), { icon: '', title: 'Сезон рыбалки' });
  assert.deepEqual(toastLead('Без значка'), { icon: '', title: 'Без значка' });
});
