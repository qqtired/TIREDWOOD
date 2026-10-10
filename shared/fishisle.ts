// ЗАГЛУШКА пакета рыб острова (D, ветка fish/islefish): только то, что нужно лодкам, — те же имена и числа, что в контракте плана
// docs/superpowers/plans/2026-10-10-fishing-implementation.md. При слиянии берётся файл пакета D целиком.
// Остров «Последний свет» (флаг сервера ISLE, нужна FISH2): где воды острова и какой пул клюёт с лодки в точке.
// X — восток, Z — юг (как в shared/maps/lobby.ts).

/** Центр острова (x, z), м: 2,4 км на запад-юго-запад от площади, в сторону заката */
export const ISLE_CENTER = { x: -2364.9, z: 557.6 } as const;
/** Воды острова — круг такого радиуса от центра: здесь клюёт пул острова */
export const ISLE_WATERS_R = 300;
/** Рыба острова — с этого уровня рыбалки (как первая лодка) */
export const ISLE_MIN_LEVEL = 6;

/** В водах ли острова точка (x, z) */
export function inIsleWaters(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x - ISLE_CENTER.x, z - ISLE_CENTER.z) <= ISLE_WATERS_R;
}

/** Пул для заброса с лодки в море: в водах острова — остров, везде ещё — баркас */
export function fishZoneAtSea(x: number, z: number): 'barkas' | 'isle' {
  return inIsleWaters(x, z) ? 'isle' : 'barkas';
}

/** Флаг ISLE: на сервере ставит server/main.ts при запуске, у клиента — сообщение лодок набережной */
export const ISLE = { on: false };

export function setIsle(on: boolean): void {
  ISLE.on = on;
}

/** ISLE=1 — включить, ISLE=0 — выключить, без переменной — только в разработке; без рыбалки 2.0 (FISH2) острова нет */
export function isleEnabled(v: string | undefined, dev: boolean, fish2: boolean): boolean {
  return fish2 && (v === undefined ? dev : v === '1');
}
