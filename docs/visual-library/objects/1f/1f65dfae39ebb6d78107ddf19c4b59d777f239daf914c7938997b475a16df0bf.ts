// Раскладка набережной: 2 — как сейчас, 3 — новая (флаг сервера PLAZA3=1, docs/plaza3/tech-foundation.md §1.1).
// Выбирается один раз при загрузке модуля и больше не меняется: сервер — из окружения (только явная 1, даже в dev),
// браузер — из globalThis.__opusPlaza (ставит client/layout-boot.ts по /health до import() игры в client/main.ts).
// Без импортов: модуль должен вычислиться раньше всех модулей с координатами.
type G = { __opusPlaza?: unknown; process?: { env?: Record<string, string | undefined> } };
const g = globalThis as G;
export const LAYOUT: 2 | 3 = g.__opusPlaza === 3 || g.process?.env?.PLAZA3 === '1' ? 3 : 2;
export const PLAZA3 = LAYOUT === 3;
/** Значение по раскладке; plaza3 считается лениво — в старой раскладке его код вообще не выполняется */
export function pick<T>(old: T, p3: () => T): T {
  return PLAZA3 ? p3() : old;
}
