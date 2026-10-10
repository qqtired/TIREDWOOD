// Счётчик видов острова «Последний свет» для лестницы косметики острова (ISLE_LADDER в shared/fishstyle.ts).
// ЗАГЛУШКА пакета E: настоящие виды острова и их таблицы делает пакет D (shared/fishing.ts, FishZone 'isle').
// Имена из контракта — isleCaught и ISLE_TOTAL; ведущий сведёт с реализацией D. Ключи альбома — id видов, поэтому
// счётчик работает и до слияния: видов острова в альбоме нет — 0, ничего не выдаётся и не отнимается.

/** Видов на острове: 12 всегда + 8 только в туман (дизайн §5) */
export const ISLE_TOTAL = 20;

/** id видов острова — ключи альбома, порядок как в дизайне (plans/2026-10-10-fishing-island.md §5) */
export const ISLE_SPECIES: readonly string[] = [
  'capelin', 'smelt', 'navaga', 'lanternfish', 'lumpfish', 'saithe', 'grenadier', 'lamprey', 'salmon', 'ling',
  'chimaera', 'roughy', 'opah', 'albacore', 'coelacanth', 'goblinshark', 'beluga', 'thresher', 'baskingshark', 'frilledshark',
];

/** Сколько видов острова в альбоме (профиль сервера или свой профиль на клиенте) */
export function isleCaught(p: { album: Readonly<Record<string, unknown>> }): number {
  let n = 0;
  for (const id of ISLE_SPECIES) if (p.album[id]) n++;
  return n;
}
