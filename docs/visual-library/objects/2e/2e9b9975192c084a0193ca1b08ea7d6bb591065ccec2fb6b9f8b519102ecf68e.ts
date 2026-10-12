// Песни автомата по номерам каталога (shared/jukebox.ts): ноты собираются один раз — при первом исполнении.
import { JUKE_SONGS } from '../../shared/jukebox.ts';
import { compileSong, type CompiledSong, type SongDef } from './song.ts';
import { bossa } from './songs/bossa.ts';
import { crab } from './songs/crab.ts';
import { mayak } from './songs/mayak.ts';
import { parom } from './songs/parom.ts';
import { plombir } from './songs/plombir.ts';
import { polka } from './songs/polka.ts';
import { sunset } from './songs/sunset.ts';
import { surf } from './songs/surf.ts';
import { waltz } from './songs/waltz.ts';

export const SONG_DEFS: Record<string, SongDef> = { plombir, surf, mayak, crab, bossa, waltz, polka, sunset, parom };

const cache = new Map<number, CompiledSong>();

/** Песня по номеру каталога; null — нет такой (или клиент старее сервера) */
export function songByIndex(i: number): CompiledSong | null {
  const had = cache.get(i);
  if (had) return had;
  const meta = JUKE_SONGS[i];
  const def = meta ? SONG_DEFS[meta.id] : undefined;
  if (!def) return null;
  const s = compileSong(def);
  cache.set(i, s);
  return s;
}
