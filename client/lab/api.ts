// Обёртка над /lab/api и ключ владельца. Ключ приходит во фрагменте адреса (#key=…): он не уходит на сервер, в журналы
// и в Referer. Страница забирает его в localStorage и убирает из адресной строки; в запросы он едет заголовком.
import { LAB_KEY_HEADER, type LabDecision, type LabStatus } from '../../shared/lab.ts';

const STORE = 'lab.key';
const KEY_IN_HASH = /^#key=([A-Za-z0-9_-]{32,128})$/;

let memoryKey: string | null = null;

export class LabApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface LabState {
  owner: boolean;
  updatedAt: string;
  decisions: Record<string, LabDecision>;
}

/** Забрать ключ из адреса (если он там) и спрятать адрес. */
export function takeKeyFromUrl(): void {
  const m = KEY_IN_HASH.exec(location.hash);
  if (!m) return;
  memoryKey = m[1] ?? null;
  try {
    localStorage.setItem(STORE, memoryKey ?? '');
  } catch {
    // хранилище закрыто: ключ живёт, пока открыта вкладка
  }
  history.replaceState(null, '', location.pathname + location.search);
}

export function getKey(): string | null {
  if (memoryKey) return memoryKey;
  try {
    const v = localStorage.getItem(STORE);
    if (v && /^[A-Za-z0-9_-]{32,128}$/.test(v)) return v;
  } catch {
    // нет хранилища
  }
  return null;
}

export function forgetKey(): void {
  memoryKey = null;
  try {
    localStorage.removeItem(STORE);
  } catch {
    // нечего забывать
  }
}

async function call(method: string, path: string, body?: unknown, withKey = true): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  const key = withKey ? getKey() : null;
  if (key) headers[LAB_KEY_HEADER] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new LabApiError(0, 'Нет связи с сервером');
  }
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
  } catch {
    // не JSON: на сервере нет лаборатории (страница-заглушка или 404)
  }
  if (!json) throw new LabApiError(res.status === 200 ? 502 : res.status, 'Сервер лаборатории не отвечает');
  if (!res.ok || json.ok !== true) throw new LabApiError(res.status, typeof json.error === 'string' ? json.error : 'Не получилось');
  return json;
}

/** Состояние решений. Верный ключ даёт owner: true; неверный просто не владелец. */
export async function loadState(): Promise<LabState> {
  const j = await call('GET', '/lab/api/state');
  return { owner: j.owner === true, updatedAt: String(j.updatedAt ?? ''), decisions: (j.decisions as Record<string, LabDecision>) ?? {} };
}

export async function saveDecision(id: string, body: { status: LabStatus; note?: string; title?: string }): Promise<LabDecision> {
  const j = await call('PUT', `/lab/api/decisions/${encodeURIComponent(id)}`, body);
  return j.decision as LabDecision;
}

export async function clearDecision(id: string): Promise<void> {
  await call('DELETE', `/lab/api/decisions/${encodeURIComponent(id)}`);
}

/** Понятная фраза для человека по ошибке */
export function explain(e: unknown): string {
  if (e instanceof LabApiError) {
    if (e.status === 401) return 'Ключ не подошёл. Открой ссылку владельца ещё раз.';
    if (e.status === 429) return 'Слишком часто. Подожди минуту.';
    if (e.status === 413) return 'Заметка слишком длинная.';
    return e.message;
  }
  return 'Что-то пошло не так';
}
