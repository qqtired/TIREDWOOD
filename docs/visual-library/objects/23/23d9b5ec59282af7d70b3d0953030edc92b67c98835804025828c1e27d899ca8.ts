// Раскладка набережной до загрузки игры (флаг сервера PLAZA3, docs/plaza3/tech-foundation.md §1.2). Модули с координатами
// (shared/*) выбирают площадь при импорте по globalThis.__opusPlaza (shared/layout.ts), поэтому client/main.ts ждёт
// bootLayout() и только потом делает import() игры. Без импортов из shared/: этот файл — во входном чанке, а
// shared/layout.ts должен вычислиться позже (test/plaza3-boot.test.ts).
export type Lay = 2 | 3;

/** Последняя раскладка сервера — на случай, если /health не ответил */
export const PLAZA_KEY = 'opus.plaza';
/** Флаг «уже перезагружались из-за смены раскладки» — чтобы не зациклиться */
const RELOAD_KEY = 'opus.plazareload';
const TIMEOUT_MS = 1500;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface BootEnv {
  fetch: (url: string, init: RequestInit) => Promise<{ json(): Promise<unknown> }>;
  storage: Store | null;
  timeoutMs: number;
}

/** localStorage / sessionStorage или null (приватный режим, запрет сайта) */
export function webStorage(kind: 'local' | 'session'): Store | null {
  try {
    return kind === 'local' ? globalThis.localStorage ?? null : globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function remember(storage: Store | null, lay: Lay): void {
  try {
    storage?.setItem(PLAZA_KEY, String(lay));
  } catch {
    // без хранилища — спросим сервер в следующий раз
  }
}

/** Спросить сервер (/health → plaza), поставить globalThis.__opusPlaza и запомнить. Сервер молчит — последняя известная или 2. */
export async function bootLayout(env: BootEnv = { fetch: (u, i) => fetch(u, i), storage: webStorage('local'), timeoutMs: TIMEOUT_MS }): Promise<Lay> {
  let lay: Lay = 2;
  try {
    lay = env.storage?.getItem(PLAZA_KEY) === '3' ? 3 : 2;
  } catch {
    // хранилище недоступно
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), env.timeoutMs);
  try {
    const j = await env.fetch('/health', { cache: 'no-store', signal: ctrl.signal }).then((r) => r.json());
    lay = (j as { plaza?: unknown } | null)?.plaza === 3 ? 3 : 2;
  } catch {
    // нет ответа за timeoutMs или ошибка — остаётся последняя известная
  } finally {
    clearTimeout(timer);
  }
  (globalThis as { __opusPlaza?: Lay }).__opusPlaza = lay;
  remember(env.storage, lay);
  return lay;
}

/**
 * Сверка после входа: сервер прислал свою раскладку в `me` (lay; старый сервер не шлёт — это 2). Не совпала с той,
 * на которой собрана площадь (сервер перезапущен с другим PLAZA3), — запомнить её и перезагрузиться, но один раз подряд.
 */
export function layoutReload(server: Lay, mine: Lay, local: Store | null, session: Store | null): boolean {
  try {
    if (server === mine) {
      session?.removeItem(RELOAD_KEY);
      return false;
    }
    remember(local, server);
    if (!session || session.getItem(RELOAD_KEY) === '1') return false;
    session.setItem(RELOAD_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
