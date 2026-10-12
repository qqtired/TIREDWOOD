// Ошибки в браузере игрока → журнал сервера ({t:'err'}): так видно баги, о которых никто не сказал.
// Одинаковых — не больше 5, всего — не больше 20 за загрузку страницы. Пока игрок не вошёл — ждут в очереди.
// Если игра не запустилась вовсе (нет WebGL 2 и т. п.), reportFatal отправит одну строку отдельным соединением.
import type { ClientMsg } from '../shared/messages.ts';

export type ErrMsg = Extract<ClientMsg, { t: 'err' }>;

const SAME_MAX = 5;
const TOTAL_MAX = 20;
const QUEUE_MAX = 10;

/** Шум, а не наши ошибки: расширения браузера, предупреждение ResizeObserver */
const NOISE = /^(chrome|moz|safari(-web)?)-extension:|ResizeObserver loop/;

export class ErrorReport {
  private readonly queue: ErrMsg[] = [];
  private readonly seen = new Map<string, number>();
  private total = 0;
  /** Отправить на сервер; false — связи или входа пока нет, ошибка подождёт */
  send: ((m: ErrMsg) => boolean) | null = null;
  /** Где сейчас игрок: lobby, race, join… */
  scene: () => string = () => '';
  /** Браузер и система (в тестах подменяется) */
  ua = '';

  /** Ловить ошибки страницы */
  install(): void {
    this.ua = browserName(navigator.userAgent);
    addEventListener('error', (e) => {
      const err = e.error as Error | null | undefined;
      this.add(e.message || String(err ?? 'error'), e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '', err?.stack ?? '');
    });
    addEventListener('unhandledrejection', (e) => {
      const r = e.reason as { message?: unknown; stack?: unknown } | null | undefined;
      const text = typeof r?.message === 'string' ? r.message : String(r);
      this.add(`промис без catch: ${text}`, '', typeof r?.stack === 'string' ? r.stack : '');
    });
  }

  add(message: string, at: string, stack: string): void {
    if (NOISE.test(at) || NOISE.test(message)) return;
    const m = message.slice(0, 200);
    const n = (this.seen.get(m) ?? 0) + 1;
    this.seen.set(m, n);
    if (n > SAME_MAX || this.total >= TOTAL_MAX) return;
    this.total++;
    if (this.queue.length >= QUEUE_MAX) this.queue.shift();
    this.queue.push({ t: 'err', m, at: at.slice(0, 160), st: stackHead(stack), sc: this.scene().slice(0, 16), ua: this.ua });
    this.flush();
  }

  /** Отправить накопленное (зовётся при входе в игру) */
  flush(): void {
    while (this.queue.length && this.send?.(this.queue[0])) this.queue.shift();
  }

  get pending(): number {
    return this.queue.length;
  }
}

export const errorReport = new ErrorReport();

/** Начало стека: до 4 строк вызовов, без первой строки с текстом ошибки */
export function stackHead(stack: string): string {
  const calls = stack
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('at ') || /@.+:\d+/.test(s));
  return calls.slice(0, 4).join(' ← ').slice(0, 400);
}

/** Браузер и система коротко: «Chrome 154, macOS» */
export function browserName(ua: string): string {
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '?';
  const names: Array<[RegExp, string]> = [
    [/Edg\w*\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/YaBrowser\/(\d+)/, 'Яндекс'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[\d.]* .*Safari/, 'Safari'],
  ];
  for (const [re, name] of names) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}, ${os}`;
  }
  return os;
}

/** Игра не запустилась: одна строка серверу отдельным коротким соединением (без входа). */
export function reportFatal(err: unknown, nick: string): void {
  const e = err as { message?: unknown; stack?: unknown } | null | undefined;
  const text = typeof e?.message === 'string' ? e.message : String(err);
  const msg: ErrMsg = {
    t: 'err', m: `не запустилось: ${text}`.slice(0, 200), at: '', st: stackHead(typeof e?.stack === 'string' ? e.stack : ''),
    sc: 'start', ua: browserName(navigator.userAgent), n: nick.slice(0, 16),
  };
  try {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      ws.send(JSON.stringify(msg));
      setTimeout(() => ws.close(), 300);
    };
  } catch {
    // без связи — ничего не поделать
  }
}
