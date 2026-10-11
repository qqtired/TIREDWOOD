import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyHudScale, hudScale } from '../client/ui/kit/scale.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';

test('HUD уменьшается на 10% при каждом прежнем размере интерфейса и экрана', () => {
  assert.equal(hudScale(1440, 900, 1), 0.9);
  assert.equal(hudScale(1440, 900, 0.9), 0.81);
  assert.equal(hudScale(2560, 1440, 1), 1.44);
  assert.equal(hudScale(1280, 720, 1), 0.72);
  assert.equal(hudScale(1920, 1080, 1), 1.08);
  assert.equal(hudScale(1920, 1080, 1.15), 1.242);
  assert.equal(hudScale(844, 390, 1, true), 0.54);
});

test('смена размера обновляет отдельно базу окон и числовой масштаб HUD', (t) => {
  const names = ['innerWidth', 'innerHeight', 'matchMedia'] as const;
  const before = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  t.after(() => names.forEach((name, i) => {
    if (before[i]) Object.defineProperty(globalThis, name, before[i]!);
    else Reflect.deleteProperty(globalThis, name);
  }));
  Object.defineProperties(globalThis, {
    innerWidth: { value: 1440, configurable: true, writable: true },
    innerHeight: { value: 900, configurable: true, writable: true },
    matchMedia: { value: () => ({ matches: false }), configurable: true, writable: true },
  });
  const vars = new Map<string, string>();
  const root = { style: { setProperty: (name: string, value: string) => vars.set(name, value) } } as unknown as HTMLElement;
  applyHudScale(root, 0.9);
  assert.equal(vars.get('--ui-base-k'), '0.9');
  assert.equal(vars.get('--hud-k'), '0.81');
  globalThis.innerWidth = 2560;
  globalThis.innerHeight = 1440;
  applyHudScale(root, 1);
  assert.equal(vars.get('--ui-base-k'), '1.6');
  assert.equal(vars.get('--hud-k'), '1.44');
  globalThis.innerWidth = 844;
  globalThis.innerHeight = 390;
  Object.defineProperty(globalThis, 'matchMedia', { value: () => ({ matches: true }), configurable: true });
  applyHudScale(root, 1);
  assert.equal(vars.get('--ui-base-k'), '0.6');
  assert.equal(vars.get('--hud-k'), '0.54');
});

test('портрет берёт цвета и лицо своего наряда, а снасти не меняют его', async () => {
  const { portraitModel, jellyPortrait } = await import('../client/ui/kit/avatar.ts');
  const model = portraitModel({ ...DEFAULT_OUTFIT, c: 0, c2: 6, p: 'dots', e: 'happy', h: 'crown', a: 'mustache' });
  assert.equal(model.color, '#ff4d6d');
  assert.equal(model.secondary, '#5fd8a8');
  assert.equal(model.eyes, 'happy');
  assert.equal(model.hat, 'crown');
  const portrait = jellyPortrait(DEFAULT_OUTFIT);
  assert.equal(jellyPortrait({ ...DEFAULT_OUTFIT, r: 'gold', w: 'night', b: 'duck' }), portrait);
  for (const change of [{ c: 3 }, { c2: 4, p: 'dots' }, { e: 'angry' }, { h: 'crown' }, { a: 'scarf' }, { u: 'plaid' }, { s: 'parrot' }]) {
    assert.notEqual(jellyPortrait({ ...DEFAULT_OUTFIT, ...change }), portrait);
  }
});

test('неизвестные значения наряда не попадают в inline SVG', async () => {
  const { portraitModel, jellyPortrait } = await import('../client/ui/kit/avatar.ts');
  const broken = { ...DEFAULT_OUTFIT, c: -1, c2: Infinity, h: '\"><script>alert(1)</script>', e: 'onload=alert(1)' };
  const model = portraitModel(broken);
  assert.equal(model.color, '#4a63ff');
  assert.equal(model.secondary, '#f2eadc');
  assert.equal(model.hat, 'none');
  assert.equal(model.eyes, 'normal');
  assert.equal(jellyPortrait(broken), jellyPortrait({ ...DEFAULT_OUTFIT, h: 'none' }));
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
