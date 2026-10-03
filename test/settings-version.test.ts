// Версия настроек и музыка по умолчанию 0,5. Сохранение целиком пишется при каждом входе, поэтому по одному значению нельзя
// отличить «ползунок не трогали» от «выбрали именно это»: у сохранения есть версия. Без неё лежащие 0,8 — прежнее умолчание
// (не трогали) и становятся 0,5; любое другое значение и всё, что сохранено уже с версией, остаётся как выбрал игрок.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Sound } from '../client/audio.ts';
import { DEFAULTS, loadSettings, saveSettings, SETTINGS_VERSION } from '../client/settings.ts';

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

test('музыка по умолчанию — 0,5: и в настройках, и у звука до первых настроек', () => {
  assert.equal(DEFAULTS.musicVolume, 0.5);
  assert.equal(DEFAULTS.ver, SETTINGS_VERSION);
  const snd = new Sound();
  snd.setVolume(1);
  assert.equal(snd.musicLevel, DEFAULTS.musicVolume);
  // игрок, у которого настроек ещё нет
  fakeStorage();
  assert.equal(loadSettings().musicVolume, 0.5);
});

test('сохранение без версии: 0,8 — «не трогал», становится 0,5; свои значения целы', () => {
  fakeStorage({ volume: 0.6, musicVolume: 0.8, sfxVolume: 0.4 });
  const s = loadSettings();
  assert.equal(s.musicVolume, 0.5);
  assert.deepEqual([s.volume, s.sfxVolume, s.ver], [0.6, 0.4, SETTINGS_VERSION]);
  for (const mine of [0, 0.25, 0.5, 0.75, 0.85, 1]) {
    fakeStorage({ musicVolume: mine });
    assert.equal(loadSettings().musicVolume, mine, `своё значение ${mine} не трогаем`);
  }
  // совсем старое сохранение (ползунка ещё не было) — просто умолчание
  fakeStorage({ volume: 0.3 });
  assert.equal(loadSettings().musicVolume, 0.5);
  // мусор вместо версии — как её отсутствие
  for (const ver of ['2', null, Number.NaN, 'x']) {
    fakeStorage({ ver, musicVolume: 0.8 });
    assert.equal(loadSettings().musicVolume, 0.5, `ver: ${String(ver)}`);
  }
});

test('сохранение с версией: 0,8 игрок выбрал сам — остаётся', () => {
  fakeStorage({ ver: SETTINGS_VERSION, musicVolume: 0.8 });
  assert.equal(loadSettings().musicVolume, 0.8);
  // и версия из будущего ничего не ломает
  fakeStorage({ ver: SETTINGS_VERSION + 1, musicVolume: 0.8 });
  assert.equal(loadSettings().musicVolume, 0.8);
});

test('полный путь: загрузили старое, записали, игрок поставил 0,8 — на следующем входе всё ещё 0,8', () => {
  const data = fakeStorage({ musicVolume: 0.8, fov: 100 });
  const s = loadSettings();
  assert.equal(s.musicVolume, 0.5);
  saveSettings(s);
  const written = JSON.parse(data.get('opus.settings.v1')!);
  assert.equal(written.ver, SETTINGS_VERSION);
  assert.equal(written.musicVolume, 0.5);
  assert.equal(written.fov, 100, 'остальное не теряется');
  // игрок сам вернул 0,8 — теперь это его выбор
  saveSettings({ ...loadSettings(), musicVolume: 0.8 });
  assert.equal(loadSettings().musicVolume, 0.8);
  assert.equal(loadSettings().musicVolume, 0.8, 'и так при каждом входе');
});
