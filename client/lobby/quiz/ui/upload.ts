// «Ракушка», окно «Загрузить»: отправка пака на набережную (docs/quiz/tech.md §20, shared/quiz/net.ts «HTTP загрузки паков»).
// Билет по WebSocket (upTicket → qzTicket, 5 минут на один пак) → POST /quiz/up (пак и список файлов) → PUT каждого файла
// строго по одному (параллельные сервер отклоняет с 409) → POST /quiz/up/<id>/done. 429 — ждём и повторяем; билет истёк
// (401) — новый билет и заново с начала. Сеть и ожидание передаются снаружи (UploadDeps) — тесты идут в Node с заглушкой.
// «Ракушка» 1.1, F5: fetchPack — скачать .siq по ссылке из библиотеки SIGame (POST /quiz/fetch с тем же билетом); байты дальше
// разбирает siq.ts, как перетащенный файл.
import { QZ_TICKET_HEADER, type QzFetchBody, type QzUpBody, type QzUpStart } from '../../../../shared/quiz/net.ts';
import { QZ_PACK, type QzPack, type QzPackInfo, type QzUpFile } from '../../../../shared/quiz/types.ts';
import { fileName } from '../../../../shared/quiz/pack.ts';

/** Что делаем сейчас — для подписи и полоски */
export interface UploadProgress {
  phase: 'ticket' | 'pack' | 'files' | 'done';
  /** отправлено байт файлов и сколько всего */
  sent: number;
  total: number;
  /** сколько секунд ждём перед повтором (429); 0 — не ждём */
  wait: number;
  /** какой файл по счёту и сколько их */
  file: number;
  files: number;
}

export interface UploadTicket {
  ticket: string;
  exp: number;
  left: number;
}

export interface UploadJob {
  pack: QzPack;
  files: QzUpFile[];
  /** байты файлов: <sha256>.<ext> → Blob */
  blobs: ReadonlyMap<string, Blob>;
}

/** Что помним между попытками: билет сервера — один на пак, поэтому оборванную загрузку продолжаем с тем же билетом и тем же пакетом
 *  (новый POST с этим билетом сервер откажет: «Этот билет уже использован для пака»). Объект держит окно на всё время работы. */
export interface UploadMemo {
  cur: { ticket: string; id: string; key: string } | null;
}

export interface UploadDeps {
  /** Билет: WS upTicket → qzTicket. Отказ (уровень, дневной предел) — UploadError с текстом сервера */
  ticket(): Promise<UploadTicket>;
  fetch(url: string, init: RequestInit): Promise<Response>;
  sleep(ms: number): Promise<void>;
  /** Память между попытками (не передали — каждая попытка с нуля) */
  memo?: UploadMemo;
}

export type UploadErrorCode = 'level' | 'limit' | 'bad' | 'net' | 'ticket' | 'busy';

/** Отказ с готовой строкой для игрока */
export class UploadError extends Error {
  readonly code: UploadErrorCode;
  /** HTTP-статус отказа сервера (если был) */
  readonly status: number;
  constructor(code: UploadErrorCode, text: string, status = 0) {
    super(text);
    this.name = 'UploadError';
    this.code = code;
    this.status = status;
  }
}

/** Билет истёк (401): внутренний сигнал «начни с нового билета» */
class Expired extends Error {}

/** Сколько раз повторяем один запрос на 429 и сколько раз начинаем заново с нового билета */
export const RETRY_429 = 6;
export const RESTARTS = 2;
const WAIT_MIN_S = 2;
const WAIT_MAX_S = 30;

/** Сколько ждать после 429: Retry-After (секунды), иначе 5 с, 10 с, … не больше 30 с */
export function waitSeconds(retryAfter: string | null, attempt: number): number {
  const n = retryAfter === null ? NaN : Number(retryAfter);
  const s = Number.isFinite(n) && n > 0 ? n : 5 * (attempt + 1);
  return Math.min(WAIT_MAX_S, Math.max(WAIT_MIN_S, Math.ceil(s)));
}

/** Разбор ответа сервера: JSON или пусто; ошибка — {ok:false, error} со строкой для игрока */
async function body(res: Response): Promise<Record<string, unknown>> {
  try { const j: unknown = await res.json(); return j && typeof j === 'object' ? j as Record<string, unknown> : {}; } catch { return {}; }
}

/** Один запрос с билетом: 429 — ждём Retry-After и повторяем (wait — сколько секунд ждём), 401 — Expired («начни с нового билета»),
 *  нет связи — UploadError; остальное (в том числе отказы 4xx и 5xx) отдаём как есть — разбирает вызвавший */
async function ask(deps: UploadDeps, wait: (s: number) => void, method: string, path: string, ticket: string, init: { body?: BodyInit; type?: string } = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await deps.fetch(path, { method, headers: { [QZ_TICKET_HEADER]: ticket, ...(init.type ? { 'content-type': init.type } : {}) }, body: init.body });
    } catch {
      throw new UploadError('net', 'Нет связи с сервером — попробуй ещё раз.');
    }
    if (res.status === 429) {
      if (attempt >= RETRY_429) throw new UploadError('busy', 'Сервер занят — попробуй чуть позже.');
      const s = waitSeconds(res.headers.get('retry-after'), attempt);
      wait(s);
      await deps.sleep(s * 1000);
      wait(0);
      continue;
    }
    if (res.status === 401) throw new Expired();
    return res;
  }
}

/** Отправить пак. Возвращает строку каталога (QzPackInfo). Ошибка — UploadError (текст — для игрока) */
export async function uploadPack(job: UploadJob, deps: UploadDeps, onProgress: (p: UploadProgress) => void = () => {}): Promise<QzPackInfo> {
  const total = job.files.reduce((n, f) => n + f.size, 0);
  const state: UploadProgress = { phase: 'ticket', sent: 0, total, wait: 0, file: 0, files: job.files.length };
  const tell = (p: Partial<UploadProgress>): void => { Object.assign(state, p); onProgress({ ...state }); };

  /** Один запрос: 429 — ждём и повторяем, 401 — Expired, остальные отказы — UploadError */
  async function call(method: string, path: string, ticket: string, init: { body?: BodyInit; type?: string } = {}): Promise<Record<string, unknown>> {
    const res = await ask(deps, (s) => tell({ wait: s }), method, path, ticket, init);
    const j = await body(res);
    if (!res.ok || j.ok === false) throw new UploadError('bad', typeof j.error === 'string' && j.error ? j.error : `Сервер отказал (${res.status}).`, res.status);
    return j;
  }

  async function once(): Promise<QzPackInfo> {
    tell({ phase: 'ticket', sent: 0, file: 0 });
    const t = await deps.ticket();
    tell({ phase: 'pack' });
    const memo = deps.memo, body0 = JSON.stringify({ pack: job.pack, files: job.files } satisfies QzUpBody);
    let started: QzUpStart;
    if (memo?.cur && memo.cur.ticket === t.ticket) {
      // прошлая попытка оборвалась после POST: билет ещё жив и привязан к тому пакету — продолжаем его (файлы можно присылать повторно)
      if (memo.cur.key !== body0) throw new UploadError('busy', 'Прошлая загрузка ещё не закрылась: отправь тот же пак ещё раз или подожди пять минут.', 409);
      started = { ok: true, id: memo.cur.id, need: job.files.map(fileName) };
    } else {
      if (memo) memo.cur = null;
      try {
        started = await call('POST', '/quiz/up', t.ticket, { body: body0, type: 'application/json' }) as unknown as QzUpStart;
      } catch (e) {
        // 409 на первом запросе: билет уже привязан к другому пакету или идёт чужой запрос — ждать, пока билет истечёт
        if (e instanceof UploadError && e.status === 409) throw new UploadError('busy', 'Прошлая загрузка ещё не закрылась — подожди пять минут и попробуй ещё раз.', 409);
        throw e;
      }
      if (memo) memo.cur = { ticket: t.ticket, id: started.id, key: body0 };
    }
    const need = Array.isArray(started.need) ? started.need : [];
    const sizes = new Map(job.files.map((f) => [fileName(f), f.size]));
    let sent = 0;
    tell({ phase: 'files', files: need.length });
    // строго по одному: параллельные сервер отклоняет (409)
    for (let i = 0; i < need.length; i++) {
      const blob = job.blobs.get(need[i]);
      if (!blob) throw new UploadError('bad', 'Не нашёл файл пака — разбери пак заново.');
      tell({ file: i + 1 });
      await call('PUT', `/quiz/up/${started.id}/${need[i]}`, t.ticket, { body: blob, type: 'application/octet-stream' });
      sent += sizes.get(need[i]) ?? blob.size;
      tell({ sent });
    }
    const done = await call('POST', `/quiz/up/${started.id}/done`, t.ticket);
    if (memo) memo.cur = null;
    tell({ phase: 'done', sent: total });
    return done.info as QzPackInfo;
  }

  for (let restarts = 0; ; restarts++) {
    try {
      return await once();
    } catch (e) {
      if (!(e instanceof Expired)) throw e;
      if (deps.memo) deps.memo.cur = null;
      if (restarts >= RESTARTS) throw new UploadError('ticket', 'Время загрузки вышло — нажми «Сохранить» ещё раз.');
    }
  }
}

/** Скачивание пака по ссылке (F5): что делаем сейчас — для строки «Скачиваю пак…» */
export interface FetchProgress {
  phase: 'ticket' | 'download';
  /** получено байт и сколько всего (0 — сервер размер не назвал: он присылает пак по кускам) */
  got: number;
  total: number;
  /** сколько секунд ждём перед повтором (429); 0 — не ждём */
  wait: number;
}

/** F5: скачать .siq из библиотеки SIGame через сервер (POST /quiz/fetch, билет тот же, что у загрузки; сервер берёт файл только с
 *  vladimirkhil.com). Возвращает байты пака — дальше их разбирает parseSiq, как файл, который игрок перетащил в окно.
 *  Отказ — UploadError со строкой сервера для игрока («Библиотека не ответила — попробуй ещё раз» и т. п.). */
export async function fetchPack(url: string, deps: UploadDeps, onProgress: (p: FetchProgress) => void = () => {}): Promise<Blob> {
  const state: FetchProgress = { phase: 'ticket', got: 0, total: 0, wait: 0 };
  const tell = (p: Partial<FetchProgress>): void => { Object.assign(state, p); onProgress({ ...state }); };

  async function once(): Promise<Blob> {
    tell({ phase: 'ticket', got: 0, total: 0 });
    const t = await deps.ticket();
    tell({ phase: 'download' });
    const res = await ask(deps, (s) => tell({ wait: s }), 'POST', '/quiz/fetch', t.ticket, { body: JSON.stringify({ url } satisfies QzFetchBody), type: 'application/json' });
    // ошибки сервера — JSON с готовой строкой; пак приходит байтами (если вместо них JSON или страница — это тоже отказ)
    if (!res.ok || /json|html/i.test(res.headers.get('content-type') ?? '')) {
      const j = await body(res);
      throw new UploadError('bad', typeof j.error === 'string' && j.error ? j.error : `Сервер отказал (${res.status}).`, res.status);
    }
    tell({ total: Number(res.headers.get('content-length')) || 0 });
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let got = 0;
    try {
      const reader = res.body?.getReader();
      if (!reader) {
        const all = new Uint8Array(await res.arrayBuffer());
        parts.push(all);
        got = all.byteLength;
      } else {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          got += value.byteLength;
          if (got > QZ_PACK.FETCH_BYTES) { void reader.cancel().catch(() => {}); throw new UploadError('bad', 'Пак больше 100 МБ.', 413); }
          parts.push(value as Uint8Array<ArrayBuffer>);
          tell({ got });
        }
      }
    } catch (e) {
      throw e instanceof UploadError ? e : new UploadError('net', 'Связь оборвалась, пока качался пак — попробуй ещё раз.');
    }
    if (!got) throw new UploadError('bad', 'Библиотека не отдала пак.');
    tell({ got });
    return new Blob(parts, { type: 'application/octet-stream' });
  }

  for (let restarts = 0; ; restarts++) {
    try {
      return await once();
    } catch (e) {
      if (!(e instanceof Expired)) throw e;
      if (restarts >= RESTARTS) throw new UploadError('ticket', 'Время загрузки вышло — нажми «Скачать» ещё раз.');
    }
  }
}

/** Чем ждём ответ сервера на upTicket: HUD кладёт сюда обещание, а письма qzTicket и qzErr его закрывают */
export class TicketDesk {
  private wait: { ok: (t: UploadTicket) => void; no: (e: UploadError) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  /** Попросить билет (send шлёт { t: 'qz', a: 'upTicket' }); сервер молчит дольше timeoutMs — ошибка */
  ask(send: () => void, timeoutMs = 10_000): Promise<UploadTicket> {
    this.wait?.no(new UploadError('ticket', 'Запрос отменён.'));
    return new Promise<UploadTicket>((ok, no) => {
      const timer = setTimeout(() => this.settle(() => no(new UploadError('ticket', 'Сервер не отвечает — попробуй ещё раз.'))), timeoutMs);
      this.wait = { ok, no, timer };
      send();
    });
  }

  private settle(fn: () => void): void {
    if (!this.wait) return;
    clearTimeout(this.wait.timer);
    this.wait = null;
    fn();
  }

  /** qzTicket пришёл */
  ticket(t: UploadTicket): void {
    const w = this.wait;
    this.settle(() => w?.ok(t));
  }

  /** qzErr пришёл: уровень и дневной предел — отказ в билете, остальное нас не касается */
  error(code: string, text: string): boolean {
    if (!this.wait || (code !== 'level' && code !== 'limit')) return false;
    const w = this.wait;
    this.settle(() => w.no(new UploadError(code, text)));
    return true;
  }

  get pending(): boolean {
    return this.wait !== null;
  }
}
