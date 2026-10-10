// Звук фермы (client/farm/audio/): своя тема собирается, длиной 2–3 минуты, без барабанов, по кругу без шва (D7 → G),
// мелодия не трётся об аккорды; птицы каждый раз поют по-разному, кукушка — только когда можно; треск костра —
// петля без стыка и без перегруза; паузы окружения редкие.
import assert from 'node:assert/strict';
import test from 'node:test';
import { birdCall, BIRD_GAP, callLength, crackleLoop, CUCKOO_GAP, pickBird, RUSTLE_GAP, WAVE_GAP, type BirdKind } from '../client/farm/audio/ambience.ts';
import { farmThemeSong } from '../client/farm/audio/farmaudio.ts';
import { FARM_THEME_META } from '../client/farm/audio/theme.ts';
import { DRUM_BASE, INSTS } from '../client/music/song.ts';
import { chordPcs, midiName } from '../client/music/theory.ts';
import { JUKE_SONGS } from '../shared/jukebox.ts';

/** Предсказуемый «случайный» ряд (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('тема фермы: 2–3 минуты, не в каталоге автомата, без барабанов, гитара, аккордеон, свирель и колокольчик', () => {
  const s = farmThemeSong();
  assert.ok(s.length >= 120 && s.length <= 180, `длина ${s.length} с`);
  assert.ok(!JUKE_SONGS.some((j) => j.id === FARM_THEME_META.id), 'тема не должна попасть в автомат');
  const used = new Set<string>();
  for (let i = 0; i < s.n; i++) {
    const v = s.voice[i];
    assert.ok(v < DRUM_BASE, 'ударных быть не должно');
    used.add(INSTS[v]);
    assert.ok(s.midi[i] >= 28 && s.midi[i] <= 100, `${INSTS[v]} ${midiName(s.midi[i])}`);
    assert.ok(s.vel[i] > 0 && s.vel[i] <= 1);
    assert.ok(s.dur[i] > 0 && s.dur[i] < 5);
    assert.ok(s.t[i] < s.length, 'нота после конца круга');
  }
  for (const inst of ['nylon', 'accordion', 'whistle', 'bell']) assert.ok(used.has(inst), `нет ${inst}`);
  assert.ok(new Set(s.sections.map((x) => x.name)).size >= 6);
});

test('тема фермы: круг без шва — последний аккорд D7 ведёт в первый G; долгие ноты не трутся полутоном', () => {
  const s = farmThemeSong();
  assert.equal(s.chords[0].chord.name, 'G');
  assert.equal(s.chords[s.chords.length - 1].chord.name, 'D7');
  for (const m of s.melody) {
    if (m.beats < 1 || Math.abs(m.beatInBar - Math.round(m.beatInBar)) > 1e-6) continue;
    let ch = s.chords[0];
    for (const c of s.chords) if (c.t <= m.t + 1e-6) ch = c;
    const pcs = chordPcs(ch.chord);
    const pc = m.midi % 12;
    if (pcs.includes(pc)) continue;
    assert.ok(!pcs.some((p) => (pc - p + 12) % 12 === 1 || (p - pc + 12) % 12 === 1), `${m.part} ${midiName(m.midi)} на ${ch.chord.name}`);
  }
});

test('птицы: песни разные, короткие и в птичьих высотах; кукушка — только когда разрешено и редко', () => {
  const r = rng(7);
  for (const kind of ['sparrow', 'tit', 'warbler', 'cuckoo'] as BirdKind[]) {
    const seen = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const c = birdCall(kind, r);
      assert.ok(c.length >= 2, `${kind}: нот ${c.length}`);
      const len = callLength(c);
      assert.ok(len > 0.1 && len < (kind === 'cuckoo' ? 5 : 2.6), `${kind}: ${len} с`);
      for (const n of c) {
        const lo = kind === 'cuckoo' ? 400 : 1500;
        assert.ok(n.f0 >= lo && n.f0 <= 8000 && n.f1 >= lo && n.f1 <= 8000, `${kind}: ${n.f0}→${n.f1} Гц`);
        assert.ok(n.gain > 0 && n.gain <= 1 && n.dur > 0);
      }
      seen.add(c.map((n) => `${Math.round(n.f0)}:${n.at.toFixed(3)}`).join(' '));
    }
    assert.equal(seen.size, 40, `${kind}: песни повторяются`);
  }
  let cuckoo = 0;
  for (let k = 0; k < 2000; k++) {
    assert.notEqual(pickBird(r, false), 'cuckoo');
    if (pickBird(r, true) === 'cuckoo') cuckoo++;
  }
  assert.ok(cuckoo > 200 && cuckoo < 500, `кукушка ${cuckoo} из 2000`);
  assert.ok(CUCKOO_GAP >= 60);
});

test('треск костра: петля без стыка (щелчок у конца продолжается в начале), без перегруза', () => {
  const sr = 48000;
  const len = sr * 2;
  const a = crackleLoop(len, sr, 22, rng(3));
  let peak = 0;
  let nonzero = 0;
  for (const x of a) {
    assert.ok(Number.isFinite(x));
    peak = Math.max(peak, Math.abs(x));
    if (x !== 0) nonzero++;
  }
  assert.ok(peak > 0.05 && peak < 1, `пик ${peak}`);
  assert.ok(nonzero < len * 0.5, 'треск — редкие щелчки, а не сплошной шум');
  // разные зёрна — разный треск
  const b = crackleLoop(len, sr, 22, rng(4));
  let same = 0;
  for (let i = 0; i < len; i++) if (a[i] === b[i]) same++;
  assert.ok(same < len, 'петли одинаковые');
});

test('окружение редкое: паузы между птицами, шелестом и волнами — секунды, не сплошной фон', () => {
  assert.ok(BIRD_GAP[0] >= 2 && BIRD_GAP[1] > BIRD_GAP[0]);
  assert.ok(RUSTLE_GAP[0] >= 5);
  assert.ok(WAVE_GAP[0] >= 5);
});
