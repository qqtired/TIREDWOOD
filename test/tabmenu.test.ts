// Меню Tab: громкость каждого игрока — те же настройки голоса, что во вкладке «Голос» (client/voice-prefs.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VOICE_PREFS_KEY, loadVoicePrefs, peerVoices, setPeerVoice, setVoiceVolumeOwner } from '../client/voice-prefs.ts';

function memory(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

test('громкость в Tab: без голоса — запоминается в настройках, с голосом — через него (одно значение с вкладкой «Голос»)', () => {
  const st = memory();
  setPeerVoice(7, { volume: 0.4 }, st);
  setPeerVoice(7, { muted: true }, st);
  assert.deepEqual(peerVoices(st)(7), { muted: true, volume: 0.4 }, 'человека нет в голосе — всё равно запомнили');
  assert.deepEqual(peerVoices(st)(8), { muted: false, volume: 1 });
  assert.ok(st.getItem(VOICE_PREFS_KEY)!.includes('"7"'));

  const calls: string[] = [];
  setVoiceVolumeOwner({
    view: { volume: 1 },
    setVolume: () => {},
    setPeerMuted: (pid, muted) => calls.push(`mute ${pid} ${muted}`),
    setPeerVolume: (pid, volume) => calls.push(`vol ${pid} ${volume}`),
  });
  try {
    setPeerVoice(7, { volume: 0.5, muted: false }, st);
    setPeerVoice(0, { volume: 0.5 }, st);
    assert.deepEqual(calls, ['vol 7 0.5', 'mute 7 false'], 'голос включён — меняем через него: звук сразу');
    assert.equal(loadVoicePrefs(st).peers['7'].volume, 0.4, 'сохраняет сам голос, не мы');
  } finally {
    setVoiceVolumeOwner(null);
  }
});
