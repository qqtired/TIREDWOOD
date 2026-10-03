// Меню настроек по категориям: старые сохранения в браузере читаются как были, новые поля (эффекты, окружение,
// инверсия, подсказки клавиш, размер интерфейса, сообщения чата) получают значения по умолчанию, мусор не ломает.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DEFAULTS, loadSettings, saveSettings, UI_SCALES } from '../client/settings.ts';

function fakeStorage(initial?: unknown) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('opus.settings.v1', JSON.stringify(initial));
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

test('сохранение до нового меню: прежние значения целы, новые поля — по умолчанию', () => {
  const old = { sens: 2.5, adsSens: 0.5, fov: 104, volume: 0.35, muted: true, quality: 'low', showStats: false };
  fakeStorage(old);
  const s = loadSettings();
  assert.deepEqual(s, {
    ...old,
    sfxVolume: 1,
    ambVolume: 1,
    invertY: false,
    keyHints: true,
    uiScale: 1,
    chatFeed: 'fade',
  });
  // и записываются под прежним ключом, вместе со старыми
  const data = fakeStorage();
  saveSettings({ ...s, invertY: true, uiScale: 1.15, chatFeed: 'keep', keyHints: false, sfxVolume: 0.4 });
  assert.ok(data.has('opus.settings.v1'));
  const back = loadSettings();
  assert.equal(back.sens, 2.5);
  assert.equal(back.muted, true);
  assert.deepEqual([back.invertY, back.uiScale, back.chatFeed, back.keyHints, back.sfxVolume], [true, 1.15, 'keep', false, 0.4]);
});

test('мусор в новых полях: громкости в пределах, размер — ближайший из предложенных, остальное — по умолчанию', () => {
  fakeStorage({ sfxVolume: 3, ambVolume: -1, invertY: 'yes', keyHints: 0, uiScale: 1.2, chatFeed: 'loud' });
  const s = loadSettings();
  assert.deepEqual([s.sfxVolume, s.ambVolume, s.invertY, s.keyHints, s.uiScale, s.chatFeed], [1, 0, false, true, 1.15, 'fade']);
  for (const [raw, want] of [[0.5, 0.9], [1.07, 1], [1.1, 1.15], [9, 1.3], ['big', 1], [null, 1]] as const) {
    fakeStorage({ uiScale: raw });
    assert.equal(loadSettings().uiScale, want, `uiScale: ${JSON.stringify(raw)}`);
  }
  for (const k of UI_SCALES) {
    fakeStorage({ uiScale: k });
    assert.equal(loadSettings().uiScale, k, 'предложенные размеры не сдвигаются');
  }
  fakeStorage({ sfxVolume: 'loud', ambVolume: Number.NaN });
  assert.deepEqual([loadSettings().sfxVolume, loadSettings().ambVolume], [DEFAULTS.sfxVolume, DEFAULTS.ambVolume]);
});
