// Лаборатория (/lab): страница-каталог идей и решения владельца. Это обычный HTTP, а не игровой WebSocket:
// протокол игры не меняется. Включается флагом LAB (в dev включён). Смотреть решения может каждый, менять — только
// владелец, у которого есть ключ из DATA_DIR/lab-key. Сам ключ нигде не печатается: ссылку собирает отдельный скрипт.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import {
  LAB_BODY_MAX, LAB_ID_MAX, LAB_KEY_HEADER,
  cleanNote, cleanTitle, isLabId, isLabStatus, type LabDecision,
} from '../../shared/lab.ts';
import { RateLimiter } from '../ratelimit.ts';
import { LabError, LabStore } from './store.ts';

/** LAB=1 включает, LAB=0 выключает, без переменной включена только в dev. */
export function labEnabled(raw: string | undefined, dev: boolean): boolean {
  return raw === undefined ? dev : raw === '1';
}

const READS_PER_MIN = 120;
const WRITES_PER_MIN = 30;
/** Неверный ключ: сколько промахов с одного адреса за окно, потом отказ. */
const KEY_MISSES = 10;
const KEY_MISS_WINDOW_MS = 10 * 60_000;
const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
const KEY_HEADER_MAX = 200;

/** Ключ владельца: файл в DATA_DIR, права 0600. Нет файла или он негодный — создаётся новый; изменился — перечитывается. */
class OwnerKey {
  private readonly file: string;
  private hash: Buffer | null = null;
  private stamp = '';

  constructor(file: string) {
    this.file = file;
  }

  /** Хеш действующего ключа (null — ключа нет и создать не вышло: владелец недоступен, чтение работает). */
  current(): Buffer | null {
    try {
      const st = statSync(this.file);
      if (this.hash && stampOf(st) === this.stamp) return this.hash;
    } catch {
      // файла нет — создадим ниже
    }
    return this.load();
  }

  private load(): Buffer | null {
    try {
      let key = '';
      try {
        key = readFileSync(this.file, 'utf8').trim();
      } catch {
        // нет файла
      }
      if (!KEY_RE.test(key)) {
        key = randomBytes(32).toString('hex');
        const tmp = `${this.file}.tmp-${process.pid}`;
        writeFileSync(tmp, `${key}\n`, { mode: 0o600 });
        renameSync(tmp, this.file);
        console.log('lab: создан ключ владельца (файл lab-key в DATA_DIR, сам ключ не печатается)');
      } else {
        chmodSync(this.file, 0o600);
      }
      this.stamp = stampOf(statSync(this.file));
      this.hash = digest(key);
    } catch {
      console.error('lab: не удалось создать или прочитать lab-key, менять решения нельзя');
      this.hash = null;
    }
    return this.hash;
  }
}

const stampOf = (st: { mtimeMs: number; size: number }): string => `${st.mtimeMs}:${st.size}`;
const digest = (s: string): Buffer => createHash('sha256').update(s).digest();

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface LabHttpOptions {
  enabled: boolean;
  /** DATA_DIR: здесь живут lab.json и lab-key */
  dir: string;
  /** Адрес для ограничений частоты (в игре — clientIp: за nginx берёт X-Real-IP только с этой же машины) */
  ip: (req: http.IncomingMessage) => string;
  now?: () => number;
}

export class LabHttp {
  readonly enabled: boolean;
  readonly store: LabStore;
  private readonly key: OwnerKey;
  private readonly ipOf: (req: http.IncomingMessage) => string;
  private readonly limiter: RateLimiter;

  constructor(opts: LabHttpOptions) {
    this.enabled = opts.enabled;
    this.ipOf = opts.ip;
    this.limiter = new RateLimiter(opts.now ?? Date.now);
    const clock = opts.now;
    this.store = new LabStore(opts.dir, clock ? () => new Date(clock()) : undefined);
    this.key = new OwnerKey(path.join(opts.dir, 'lab-key'));
    if (this.enabled) {
      this.store.load();
      this.key.current(); // ключ появляется сразу, чтобы скрипт ссылки его нашёл
      setInterval(() => this.limiter.sweep(KEY_MISS_WINDOW_MS), 60_000).unref();
    }
  }

  /** Обрабатывает /lab и /lab/api/*. true — ответ уже отправлен; false — запрос не наш (страницу отдаст Vite или dist). */
  handle(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
    if (pathname !== '/lab' && !pathname.startsWith('/lab/')) return false;
    if (!this.enabled) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('not found');
      return true;
    }
    if (pathname === '/lab') {
      res.writeHead(302, { location: '/lab/', 'cache-control': 'no-store' }).end();
      return true;
    }
    if (!pathname.startsWith('/lab/api/')) return false;
    this.api(req, res, pathname.slice('/lab/api/'.length)).catch((e: unknown) => {
      if (e instanceof LabError) {
        fail(res, e.status, e.message, e.retryAfter ? { 'retry-after': e.retryAfter } : {});
      } else {
        console.error('lab: ошибка обработчика');
        fail(res, 500, 'Что-то пошло не так');
      }
    });
    return true;
  }

  private async api(req: http.IncomingMessage, res: http.ServerResponse, rest: string): Promise<void> {
    const ip = this.ipOf(req) || 'local';
    const method = req.method ?? 'GET';
    if (rest === 'state') {
      if (method !== 'GET') return fail(res, 405, 'Только GET', { allow: 'GET' });
      if (!this.limiter.hit(`read:${ip}`, READS_PER_MIN, 60_000)) throw tooMany(60);
      // чтение открыто всем: неверный ключ не ошибка, просто owner=false (и промах в счётчик)
      const owner = this.check(req, ip) === 'ok';
      const snap = this.store.snapshot();
      return send(res, 200, { ok: true, owner, updatedAt: snap.updatedAt, decisions: snap.decisions });
    }
    const m = /^decisions\/([^/]+)$/.exec(rest);
    if (!m) return fail(res, 404, 'Нет такого адреса');
    if (method !== 'PUT' && method !== 'DELETE') return fail(res, 405, 'Только PUT или DELETE', { allow: 'PUT, DELETE' });
    const id = m[1] ?? '';
    // сначала ограничения и ключ — тело чужого запроса даже не читаем
    if (!this.limiter.hit(`write:${ip}`, WRITES_PER_MIN, 60_000)) throw tooMany(60);
    const who = this.check(req, ip);
    if (who === 'blocked') throw tooMany(Math.ceil(KEY_MISS_WINDOW_MS / 1000));
    if (who !== 'ok') return fail(res, 401, 'Нужен ключ владельца');
    if (!isLabId(id)) return fail(res, 400, `Неверный id: латиница, цифры и дефис, до ${LAB_ID_MAX} знаков`);
    if (method === 'DELETE') {
      const removed = this.store.clear(id);
      return send(res, 200, { ok: true, id, removed, updatedAt: this.store.snapshot().updatedAt });
    }
    const body = await readJson(req);
    if (!isRecord(body)) return fail(res, 400, 'Ждали объект JSON');
    if (!isLabStatus(body.status)) return fail(res, 400, 'Неизвестный статус');
    if (body.note !== undefined && typeof body.note !== 'string') return fail(res, 400, 'Заметка должна быть строкой');
    if (body.title !== undefined && typeof body.title !== 'string') return fail(res, 400, 'Название должно быть строкой');
    const prev = this.store.get(id);
    const decision: LabDecision = this.store.set(id, {
      status: body.status,
      // заметку не прислали — прежняя остаётся: один клик по статусу её не стирает
      note: body.note === undefined ? prev?.note ?? '' : cleanNote(body.note),
      title: cleanTitle(body.title) || prev?.title || '',
    });
    return send(res, 200, { ok: true, id, decision, updatedAt: this.store.snapshot().updatedAt });
  }

  /** ok — ключ верный; none — ключа нет; bad — неверный (засчитан промах); blocked — промахов уже слишком много. */
  private check(req: http.IncomingMessage, ip: string): 'ok' | 'none' | 'bad' | 'blocked' {
    const raw = req.headers[LAB_KEY_HEADER];
    const given = Array.isArray(raw) ? raw[0] : raw;
    if (typeof given !== 'string' || given === '') return 'none';
    if (!this.limiter.peek(`miss:${ip}`, KEY_MISSES, KEY_MISS_WINDOW_MS)) return 'blocked';
    const want = this.key.current();
    const ok = want !== null && given.length <= KEY_HEADER_MAX && timingSafeEqual(digest(given), want);
    if (ok) return 'ok';
    this.limiter.hit(`miss:${ip}`, KEY_MISSES, KEY_MISS_WINDOW_MS);
    return 'bad';
  }
}

function tooMany(seconds: number): LabError {
  const e = new LabError(429, 'Слишком часто, попробуй чуть позже');
  e.retryAfter = seconds;
  return e;
}

function send(res: http.ServerResponse, status: number, body: unknown, extra: Record<string, string | number> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(text),
    ...extra,
  });
  res.end(text);
}

function fail(res: http.ServerResponse, status: number, error: string, extra: Record<string, string | number> = {}): void {
  send(res, status, { ok: false, error }, status === 413 ? { connection: 'close', ...extra } : extra);
}

/** Тело запроса как JSON; больше LAB_BODY_MAX байт — 413, не разбирается — 400. */
function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > LAB_BODY_MAX) {
      reject(new LabError(413, 'Слишком длинное тело запроса'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const done = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > LAB_BODY_MAX) done(() => reject(new LabError(413, 'Слишком длинное тело запроса')));
      else if (!settled) chunks.push(chunk);
    });
    req.on('end', () =>
      done(() => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new LabError(400, 'Тело не разобрать: ждали JSON'));
        }
      }));
    req.on('error', () => done(() => reject(new LabError(400, 'Запрос оборвался'))));
  });
}

