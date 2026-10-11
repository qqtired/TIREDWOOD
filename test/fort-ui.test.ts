// Слова интерфейса «Крепости» на ките (client/fort/ui/text.ts): тревога → тост с картинкой, откуда идёт волна.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alarmText, capFirst, nickTone, roadsText, sec1 } from '../client/fort/ui/text.ts';

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
