// Песни музыкального автомата: все есть, собираются, длина сходится с каталогом сервера, ноты в разумных пределах,
// долгие ноты мелодии не трутся полутоном об аккорд. Нотный формат: ошибки ловятся с указанием места.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JUKE_SONGS, songMs } from '../shared/jukebox.ts';
import { compileSong, DRUM_BASE, INSTS, type SongDef } from '../client/music/song.ts';
import { SONG_DEFS, songByIndex } from '../client/music/songs.ts';
import { chordPcs, midiName } from '../client/music/theory.ts';

test('у каждой песни каталога есть ноты; длина — как у сервера, 60–120 с', () => {
  assert.equal(Object.keys(SONG_DEFS).length, JUKE_SONGS.length);
  JUKE_SONGS.forEach((meta, i) => {
    const s = songByIndex(i);
    assert.ok(s, `нет песни ${meta.id}`);
    assert.equal(s.meta.id, meta.id);
    assert.ok(Math.abs(s.total * 1000 - songMs(i)) <= 1, `${meta.id}: длина ${s.total} с, у сервера ${songMs(i)} мс`);
    assert.ok(s.total >= 60 && s.total <= 120, `${meta.id}: ${s.total} с`);
    assert.ok(s.n > 300, `${meta.id}: всего ${s.n} нот`);
    assert.ok(s.melody.length > 60, `${meta.id}: мелодия из ${s.melody.length} нот`);
    // разные части, повтор не сплошной
    assert.ok(new Set(s.sections.map((x) => x.name)).size >= 4, `${meta.id}: частей мало`);
  });
  assert.equal(songByIndex(99), null);
});

test('ноты в пределах: высота, громкость, время по порядку, голоса известные; уровни песни разумные', () => {
  for (const meta of JUKE_SONGS) {
    const s = compileSong(SONG_DEFS[meta.id]);
    for (let i = 0; i < s.n; i++) {
      const v = s.voice[i];
      assert.ok(v < INSTS.length || (v >= DRUM_BASE && v < DRUM_BASE + 6 * 16), `${meta.id}: голос ${v}`);
      if (v < INSTS.length) assert.ok(s.midi[i] >= 28 && s.midi[i] <= 100, `${meta.id}: ${INSTS[v]} ${midiName(s.midi[i])}`);
      assert.ok(s.vel[i] > 0 && s.vel[i] <= 1, `${meta.id}: громкость ${s.vel[i]}`);
      assert.ok(s.dur[i] > 0 && s.dur[i] < 5, `${meta.id}: длина ноты ${s.dur[i]}`);
      if (i > 0) assert.ok(s.t[i] >= s.t[i - 1], `${meta.id}: ноты не по порядку`);
      assert.ok(s.t[i] < s.length, `${meta.id}: нота после конца`);
    }
    const def = SONG_DEFS[meta.id];
    assert.ok(def.gain > 0.2 && def.gain <= 1.2, `${meta.id}: gain ${def.gain}`);
    for (const [k, g] of Object.entries(def.mix)) assert.ok(g! > 0 && g! <= 1.2, `${meta.id}: ${k} ${g}`);
  }
});

test('долгие ноты мелодии на долю не трутся полутоном о звуки аккорда', () => {
  for (const meta of JUKE_SONGS) {
    const s = compileSong(SONG_DEFS[meta.id]);
    for (const m of s.melody) {
      if (m.beats < 1 || Math.abs(m.beatInBar - Math.round(m.beatInBar)) > 1e-6) continue;
      let ch = s.chords[0];
      for (const c of s.chords) if (c.t <= m.t + 1e-6) ch = c;
      const pcs = chordPcs(ch.chord);
      const pc = m.midi % 12;
      if (pcs.includes(pc)) continue;
      const rub = pcs.some((p) => (pc - p + 12) % 12 === 1 || (p - pc + 12) % 12 === 1);
      assert.ok(!rub, `${meta.id}: ${midiName(m.midi)} (${m.beats} д.) на ${ch.chord.name}, такт ${Math.floor(m.t / (s.beat * meta.meter)) + 1}`);
    }
  }
});

test('нотный формат: «%» повторяет такт, несошедшийся такт — ошибка с местом', () => {
  const base: SongDef = {
    id: 'plombir', key: 'D', gain: 0.5, reverb: { wet: 0.2, decay: 1.5 }, mix: {},
    sections: { a: { chords: 'D | % | G A | %', parts: [{ i: 'bass', bass: '1/2 5/2 | %' }, { kit: 'pop', drums: { k: 'x...x...x...x...' } }] } },
    form: [],
  };
  const forty = { ...base, form: Array(12).fill('a') };
  const s = compileSong(forty);
  assert.equal(s.chords.filter((c) => c.chord.name === 'D').length, 24);
  assert.equal(s.n, 12 * 4 * 2 + 12 * 4 * 4);
  const bad = { ...forty, sections: { a: { ...base.sections.a, parts: [{ i: 'whistle' as const, mel: 'd5/1 | d5/4 | d5/4 | d5/4' }] } } };
  assert.throws(() => compileSong(bad), /мелодия whistle, такт 1 — 1 долей из 4/);
  assert.throws(() => compileSong({ ...forty, form: ['a'] }), /4 тактов, а в каталоге 48/);
});
