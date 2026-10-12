// Слова интерфейса «Крепости» на ките (client/fort/ui/text.ts): тревога → тост с картинкой, откуда идёт волна.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alarmText, capFirst, nickTone, roadsText, sec1 } from '../client/fort/ui/text.ts';
import { bossMaxHp } from '../client/fort/ui/schedule.ts';
import { TopCenterModel } from '../client/ui/kit/topcenter.ts';
import { FEATURES, planWave } from '../server/fort/director.ts';
import { KRAKEN_HEAD_BASE_HP, bossHp, krakenHp } from '../shared/fortwaves.ts';
import { Z_GOLEM, Z_KRAKEN } from '../shared/fortkinds.ts';
import { siegeBossNumber } from '../shared/fortsiege.ts';

test('тревога с эмодзи → картинка, заголовок до « · », остальное — подстрокой, без тегов', () => {
  assert.deepEqual(alarmText('🚪 Ворота трещат!'), { icon: 'gate', title: 'Ворота трещат!', sub: '', tone: 'warn' });
  const b = alarmText('💣 Бочка у ворот · фитиль 3 с — сбейте подрывника!');
  assert.equal(b.icon, 'bomb');
  assert.equal(b.title, 'Бочка у ворот');
  assert.equal(b.sub, 'фитиль 3 с — сбейте подрывника!');
  // сведения (колокол, молоток) — спокойным тоном; теги — прочь
  const g = alarmText('🔔 Щит строений на 8 с · игроки уходят с меток');
  assert.equal(g.tone, 'info');
  assert.equal(alarmText('💣 Гранаты: <b>3</b> · G — бросок').title, 'Гранаты: 3');
  // без эмодзи — картинка по умолчанию
  assert.equal(alarmText('Крылатка пикирует · уйди с метки').icon, 'warn');
  assert.equal(alarmText('Залп Барона', 'level').icon, 'level');
  // эмодзи с вариантом (☄️, 🏳️)
  assert.equal(alarmText('☄️ Метеоры!').icon, 'meteor');
});

test('откуда идёт волна, цвет ника, мелочи', () => {
  assert.equal(roadsText([1]), 'идут с севера');
  assert.equal(roadsText([0, 2]), 'идут с запада и востока');
  assert.equal(roadsText([1, 0], 2), 'идут с севера, запада и моря');
  assert.equal(roadsText([]), '');
  const t = nickTone('Tester7');
  assert.ok(t >= 1 && t <= 6);
  assert.equal(nickTone('Tester7'), t, 'цвет ника не меняется');
  assert.equal(capFirst('лавка оружейника'), 'Лавка оружейника');
  assert.equal(sec1(3.44), '3,4');
});

test('полное HP босса на клиенте — как у сервера (полоса «1 628 / 2 200»)', () => {
  for (const w of [7, 14, 21, 28, 49]) {
    for (const n of [1, 3, 6]) {
      const plan = planWave(w, n, 12345);
      assert.ok(plan.boss >= 0, `на волне ${w} есть босс`);
      assert.equal(Math.round(bossMaxHp(plan.boss, w, n)), Math.round(plan.bossHp), `волна ${w}, защитников ${n}`);
    }
  }
  assert.equal(bossMaxHp(Z_KRAKEN, 25, 2), krakenHp(KRAKEN_HEAD_BASE_HP, 25, 2));
  assert.equal(bossMaxHp(0, 5, 2), 0, 'не босс-волна — только проценты');
});

test('осадный HUD: HP всех восьми боссов и следующего круга совпадает с сервером', () => {
  const siege = { ...FEATURES, siege: true };
  for (const wave of [5, 10, 15, 20, 30, 35, 40, 45, 55, 65, 90, 100]) {
    for (const defenders of [1, 3, 6]) {
      const plan = planWave(wave, defenders, 12345, undefined, siege);
      assert.ok(plan.boss >= 0);
      assert.equal(bossMaxHp(plan.boss, wave, defenders, true), plan.bossHp, `волна ${wave}, защитников ${defenders}`);
      if (wave % 25 !== 0) assert.equal(plan.bossTier, Math.floor((siegeBossNumber(wave) - 1) / 8));
    }
  }
  assert.equal(bossMaxHp(Z_GOLEM, 15, 2, true), bossHp(15, 2, 0) * 3);
  assert.equal(bossMaxHp(Z_KRAKEN, 25, 2, true), krakenHp(KRAKEN_HEAD_BASE_HP, 25, 2));
  assert.equal(bossMaxHp(0, 7, 2, true), 0, 'старый номер босс-волны не действует в siege');
});

test('уходя из крепости, убираем только свои тосты (ключ ft-…)', () => {
  const m = new TopCenterModel(() => 0);
  m.toast({ key: 'ft-al-Ворота', icon: '', title: 'Ворота трещат!' });
  m.toast({ key: 'friend', icon: '', title: 'Друг зашёл' });
  m.toast({ key: 'ft-coach', icon: '', title: 'Новичку', cls: 'ft-coach', html: '<b>x</b>' });
  m.clearToasts('ft-');
  assert.deepEqual(m.toasts().map((t) => t.key), ['friend']);
  m.clearToasts();
  assert.equal(m.toasts().length, 0);
});
