// Клавиша M — «без звука»: что считать нажатием, как переключается настройка, что уходит в звук и как всё
// запоминается в браузере (настройки живут в localStorage рядом с громкостью).
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { isMuteKey, isTyping } from '../client/input.ts';
import { DEFAULTS, effectiveVolume, loadSettings, saveSettings, toggleMute } from '../client/settings.ts';

/** Поддельное хранилище браузера: настройки лежат под одним ключом, поэтому достаточно одной строки */
function fakeStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('opus.settings.v1', initial);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
    },
  });
  return data;
}
after(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

/** Нажатие в браузере: поле, где оно случилось, и клавиши-модификаторы */
function press(code: string, over: Record<string, unknown> = {}) {
  return { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, ...over } as unknown as KeyboardEvent;
}
const field = (tagName: string, type?: string, isContentEditable = false) => ({ tagName, type, isContentEditable }) as unknown as HTMLElement;

test('M: «без звука» включается и выключается, громкость в настройках не меняется', () => {
  const s = { volume: 0.4, muted: false };
  assert.equal(effectiveVolume(s), 0.4);
  assert.equal(toggleMute(s), true);
  assert.equal(effectiveVolume(s), 0, 'в звук уходит ноль');
  assert.equal(s.volume, 0.4, 'а ползунок помнит прежнюю громкость');
  assert.equal(toggleMute(s), false);
  assert.equal(effectiveVolume(s), 0.4, 'включили — звук прежний');
  for (let i = 0; i < 5; i++) toggleMute(s);
  assert.deepEqual(s, { volume: 0.4, muted: true }, 'сколько ни жми, громкость цела');
});

test('M при ползунке на нуле: «звук включён» не остаётся без звука', () => {
  const s = { volume: 0, muted: false };
  assert.equal(toggleMute(s), true, 'выключить — просто флаг');
  assert.equal(s.volume, 0);
  assert.equal(toggleMute(s), false);
  assert.equal(s.volume, DEFAULTS.volume, 'включили — вернулась обычная громкость');
  assert.ok(effectiveVolume(s) > 0);
});

test('M запоминается вместе с громкостью и переживает перезагрузку', () => {
  const data = fakeStorage();
  const s = { ...loadSettings(), volume: 0.35 };
  assert.equal(s.muted, false, 'по умолчанию звук есть');
  toggleMute(s);
  saveSettings(s);
  assert.ok(data.get('opus.settings.v1')!.includes('"muted":true'));
  const back = loadSettings();
  assert.equal(back.muted, true);
  assert.equal(back.volume, 0.35, 'громкость рядом с флагом не теряется');
  assert.equal(effectiveVolume(back), 0, 'и после перезагрузки звука нет');
  toggleMute(back);
  saveSettings(back);
  assert.deepEqual([loadSettings().muted, loadSettings().volume], [false, 0.35]);
});

test('настройки без поля «без звука» и с мусором в нём читаются как «звук есть»', () => {
  fakeStorage(JSON.stringify({ volume: 0.5, sens: 2 }));
  const old = loadSettings();
  assert.equal(old.muted, false, 'сохранено до появления M');
  assert.equal(old.volume, 0.5);
  assert.equal(old.sens, 2);
  for (const junk of ['yes', 1, 'true', null, {}, []]) {
    fakeStorage(JSON.stringify({ muted: junk }));
    assert.equal(loadSettings().muted, false, `muted: ${JSON.stringify(junk)}`);
  }
  fakeStorage(JSON.stringify({ muted: true }));
  assert.equal(loadSettings().muted, true);
  fakeStorage('{сломано');
  assert.deepEqual(loadSettings(), DEFAULTS, 'битое хранилище — настройки по умолчанию');
});

test('нажатие M: по коду клавиши, без повторов удержания и без Ctrl / Cmd / Alt', () => {
  assert.equal(isMuteKey(press('KeyM')), true);
  assert.equal(isMuteKey(press('KeyM', { shiftKey: true })), true, 'с Shift (рывок) — тоже она');
  assert.equal(isMuteKey(press('KeyM', { repeat: true })), false, 'удержание не мигает звуком');
  assert.equal(isMuteKey(press('KeyM', { ctrlKey: true })), false, 'Ctrl+M — браузеру');
  assert.equal(isMuteKey(press('KeyM', { metaKey: true })), false);
  assert.equal(isMuteKey(press('KeyM', { altKey: true })), false);
  for (const code of ['KeyN', 'KeyE', 'Comma', 'Digit4', 'Space', 'Enter', 'Tab', 'Escape']) {
    assert.equal(isMuteKey(press(code)), false, code);
  }
});

test('M не срабатывает, пока печатают: чат, ник, код, любое текстовое поле', () => {
  for (const type of ['text', 'search', 'password', 'email', 'tel', 'url', 'number', undefined]) {
    assert.equal(isMuteKey(press('KeyM', { target: field('INPUT', type) })), false, `input ${type}`);
  }
  assert.equal(isMuteKey(press('KeyM', { target: field('TEXTAREA') })), false);
  assert.equal(isMuteKey(press('KeyM', { target: field('DIV', undefined, true) })), false, 'contenteditable');
});

test('M работает, когда фокус остался на ползунке, флажке или кнопке в паузе', () => {
  for (const type of ['range', 'checkbox', 'radio', 'button']) {
    assert.equal(isTyping(field('INPUT', type)), false, type);
    assert.equal(isMuteKey(press('KeyM', { target: field('INPUT', type) })), true, type);
  }
  for (const tag of ['BUTTON', 'SELECT', 'CANVAS', 'BODY', 'DIV']) {
    assert.equal(isMuteKey(press('KeyM', { target: field(tag) })), true, tag);
  }
  assert.equal(isMuteKey(press('KeyM', { target: null })), true, 'экранная кнопка телефона шлёт нажатие без цели');
});
