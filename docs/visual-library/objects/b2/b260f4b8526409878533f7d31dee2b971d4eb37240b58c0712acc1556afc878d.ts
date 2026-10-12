// Бесконечная станция радио на лодке: поток отрезков по 8 тактов для движка автомата (MusicFeed, client/music/engine.ts).
// Станция — круг ролей (вступление, куплет, припев, спад…), у каждой роли несколько вариантов (прогрессия, мелодия,
// рисунок баса и барабанов, инструмент соло), круг за кругом тональность сдвигается. Отрезок k определяется только
// номером (случай — от id станции и k): у всех слушателей звучит одно и то же, войти можно в любое место потока.
import { RADIO_BLOCK_BARS, radioBlockSec, type RadioStation } from '../../shared/boatradio.ts';
import type { JukeSong } from '../../shared/jukebox.ts';
import type { MusicFeed } from '../music/engine.ts';
import { compileSong, DRUM_BASE, DRUMS, INSTS, KITS, drumVoice, type CompiledSong, type Inst, type Kit, type Section, type SongDef } from '../music/song.ts';
import { rep, rngOf, type Rng } from './radiogen.ts';

export interface StationDef extends Omit<SongDef, 'id' | 'sections' | 'form'> {
  id: string;
  /** Все инструменты и наборы ударных станции (цепочка звука строится на них один раз) */
  insts: readonly Inst[];
  kits: readonly Kit[];
  /** Круг станции: роли отрезков по 8 тактов */
  form: readonly string[];
  /** Сдвиг тональности (полутоны) по кругам: круг c — keys[c % keys.length] */
  keys?: readonly number[];
  /** Отрезок: роль, случай отрезка, номер круга, номер отрезка → аккорды и партии на 8 тактов */
  block(role: string, r: Rng, cycle: number, k: number): Section;
}

export interface StationFeed extends MusicFeed {
  readonly def: StationDef;
  /** Роль и сдвиг тональности отрезка (для стенда) */
  role(k: number): { role: string; cycle: number; key: number };
}

const CACHE = 6;

export function stationFeed(def: StationDef, meta: RadioStation): StationFeed {
  const songMeta: JukeSong = { id: def.id, title: meta.title, mood: meta.mood, emoji: meta.emoji, bpm: meta.bpm, meter: meta.meter, bars: RADIO_BLOCK_BARS, tail: 0 };
  const base = { key: def.key, swing: def.swing, swingUnit: def.swingUnit, gain: def.gain, reverb: def.reverb, echo: def.echo, chorus: def.chorus, mix: def.mix };
  const n = def.form.length;
  const where = (k: number): { role: string; cycle: number; key: number } => {
    const cycle = Math.floor(k / n);
    const keys = def.keys ?? [0];
    return { role: def.form[((k % n) + n) % n], cycle, key: keys[((cycle % keys.length) + keys.length) % keys.length] };
  };
  // «студия»: зал, эхо, микс и все голоса станции
  const empty = compileSong({ ...base, id: `${def.id}:studio`, sections: { s: { chords: rep('C', RADIO_BLOCK_BARS), parts: [] } }, form: ['s'] }, songMeta);
  const voices: number[] = def.insts.map((i) => INSTS.indexOf(i));
  for (const kit of def.kits) for (let d = 0; d < DRUMS.length; d++) voices.push(drumVoice(KITS.indexOf(kit), d));
  const studio: CompiledSong = { ...empty, voice: Uint8Array.from(voices) };
  const cache = new Map<number, CompiledSong>();
  const block = (k: number): CompiledSong => {
    const had = cache.get(k);
    if (had) return had;
    const w = where(k);
    const sec = def.block(w.role, rngOf(def.id, k), w.cycle, k);
    const song = compileSong({ ...base, id: `${def.id}:${k}`, sections: { [w.role]: sec }, form: [w.role] }, songMeta);
    if (w.key) {
      for (let i = 0; i < song.n; i++) {
        if (song.voice[i] >= DRUM_BASE) continue;
        song.midi[i] += w.key;
        if (song.from[i]) song.from[i] += w.key;
      }
    }
    cache.set(k, song);
    if (cache.size > CACHE) cache.delete(cache.keys().next().value!);
    return song;
  };
  return { def, length: radioBlockSec(meta), studio, block, role: where };
}
