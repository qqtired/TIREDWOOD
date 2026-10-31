// Постоянный id выбирает тему трассы. Новая геометрия V3 пишет в отдельные поля RACE_RECORD:
// прежние рекорды port/foundry/harbor/hills сохраняются в профиле, их нельзя сравнивать с новым кругом.
import { buildRing, type Ring } from './maps/ring.ts';
import { buildHills } from './maps/hills.ts';

export type RaceTrackId = 'harbor' | 'hills';
export const DEFAULT_TRACK: RaceTrackId = 'harbor';
export const RACE_TRACKS: ReadonlyArray<{ id: RaceTrackId; name: string; description: string }> = [
  { id: 'harbor', name: 'Портовое кольцо', description: 'Большой порт: 1,85 км, каналы, бухта и грузовая змейка' },
  { id: 'hills', name: 'Солнечный серпантин', description: 'Большой серпантин: три шпильки, гребень и прыжок через реку' },
];
export function isRaceTrackId(id: unknown): id is RaceTrackId {
  return id === 'harbor' || id === 'hills';
}
/** Имя трассы по id (неизвестный — как трасса по умолчанию) */
export function raceTrackName(id: unknown): string {
  const t = RACE_TRACKS.find((r) => r.id === id) ?? RACE_TRACKS[0];
  return t.name;
}
/** Номер и имя трассы для подсказок у гаража: «1 — Портовое кольцо» */
export function raceTrackLabel(id: unknown): string {
  const i = Math.max(0, RACE_TRACKS.findIndex((r) => r.id === id));
  return `${i + 1} — ${RACE_TRACKS[i].name}`;
}
/** Следующая трасса по кругу (выбор у гаража) */
export function nextRaceTrack(id: RaceTrackId): RaceTrackId {
  const i = RACE_TRACKS.findIndex((r) => r.id === id);
  return RACE_TRACKS[(i + 1) % RACE_TRACKS.length].id;
}

/**
 * Голоса за трассу у круга старта: сколько голосов у каждой (в порядке RACE_TRACKS) и кто впереди.
 * Голосов нет — впереди трасса по умолчанию (одна, жребия нет); поровну — впереди несколько, решает жребий.
 */
export function tallyTrackVotes(votes: Iterable<unknown>): { counts: number[]; leaders: RaceTrackId[] } {
  const counts = RACE_TRACKS.map(() => 0);
  for (const v of votes) {
    const i = RACE_TRACKS.findIndex((t) => t.id === v);
    if (i >= 0) counts[i]++;
  }
  const max = Math.max(...counts);
  if (max === 0) return { counts, leaders: [DEFAULT_TRACK] };
  return { counts, leaders: RACE_TRACKS.filter((_, i) => counts[i] === max).map((t) => t.id) };
}

/** Поле лучшего круга в статистике профиля для трассы */
export const RACE_RECORD: Record<RaceTrackId, 'rcBestLapHarborV3' | 'rcBestLapHillsV3'> = {
  harbor: 'rcBestLapHarborV3',
  hills: 'rcBestLapHillsV3',
};

export function buildRaceCourse(id: RaceTrackId = DEFAULT_TRACK): Ring {
  if (id === 'hills') return buildHills();
  return buildRing();
}
