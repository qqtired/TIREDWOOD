// Микшер в меню «Звук»: новые ползунки «Музыка» и «Интерфейс» в старых сохранениях браузера (ключ прежний).
// Интерфейс раньше звучал вместе с эффектами — старое сохранение получает ту же долю, что у эффектов.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DEFAULTS, loadSettings, saveSettings } from '../client/settings.ts';

function fakeStorage(initial?: unknown) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('opus.settings.v1', JSON.stringify(initial));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, String(v)) },
  });
  return data;
}
after(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

test('старое сохранение: музыка по умолчанию, интерфейс — как были эффекты, остальное цело', () => {
  fakeStorage({ volume: 0.5, muted: false, sfxVolume: 0.4, ambVolume: 0.7, fov: 100 });
  const s = loadSettings();
  assert.equal(s.musicVolume, DEFAULTS.musicVolume);
  assert.equal(s.uiVolume, 0.4);
  assert.deepEqual([s.volume, s.sfxVolume, s.ambVolume, s.fov], [0.5, 0.4, 0.7, 100]);
  // совсем старое (без эффектов) — интерфейс на полную
  fakeStorage({ volume: 0.3 });
  assert.equal(loadSettings().uiVolume, 1);
});

test('свои значения запоминаются под прежним ключом, мусор — в пределах или по умолчанию', () => {
  const data = fakeStorage();
  saveSettings({ ...loadSettings(), musicVolume: 0.25, uiVolume: 0.6, sfxVolume: 0.9 });
  assert.ok(data.has('opus.settings.v1'));
  const back = loadSettings();
  assert.deepEqual([back.musicVolume, back.uiVolume, back.sfxVolume], [0.25, 0.6, 0.9]);
  fakeStorage({ musicVolume: 7, uiVolume: -2, sfxVolume: 0.5 });
  assert.deepEqual([loadSettings().musicVolume, loadSettings().uiVolume], [1, 0]);
  fakeStorage({ musicVolume: 'loud', uiVolume: null, sfxVolume: 0.5 });
  assert.deepEqual([loadSettings().musicVolume, loadSettings().uiVolume], [DEFAULTS.musicVolume, 0.5]);
});
