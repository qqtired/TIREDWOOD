import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { QZ_TICKET_HEADER, type QzUpStart } from '../../../shared/quiz/net.ts';
import { fileName, PackError, validatePack } from '../../../shared/quiz/pack.ts';
import { QZ_PACK, type QzUpFile } from '../../../shared/quiz/types.ts';
import { RateLimiter } from '../../ratelimit.ts';
import { QuizPacks } from './packs.ts';

interface Ticket { pid: number; exp: number; id: string | null; busy: boolean }
export interface QuizHttpOptions {
  packs: QuizPacks; enabled?: boolean; now?: () => number;
  /** clientIp из server/main.ts (не доверять X-Forwarded-For от произвольного адреса). */
  ip?: (req: IncomingMessage) => string;
  log?: (message: string) => void;
  /** «Ракушка» 1.1: ники, которым можно загружать паки (QUIZ_UPLOADERS, без учёта регистра); пусто — по уровню, как раньше */
  uploaders?: readonly string[];
}
/** QUIZ_UPLOADERS=Tired,Ник — ники через запятую */
export function quizUploaders(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map(s => s.trim()).filter(Boolean))];
}
const MIME: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4' };
function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }).end(JSON.stringify(value));
}
function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let n = 0, settled = false;
    const chunks: Buffer[] = [];
    const fail = (e: Error) => { if (!settled) { settled = true; chunks.length = 0; reject(e); } };
    const length = Number(req.headers['content-length']);
    if (Number.isFinite(length) && length > max) { req.resume(); fail(new PackError('Файл слишком большой.', 413)); return; }
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      n += chunk.length;
      if (n > max) { fail(new PackError('Файл слишком большой.', 413)); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    req.on('aborted', () => fail(new PackError('Загрузка прервалась.')));
    req.on('error', () => fail(new PackError('Загрузка прервалась.')));
  });
}
/** Проверяем именно заявленный вид, не только общий префикс файла. SVG/HTML не принимаются. */
export function quizFileSignature(bytes: Uint8Array, ext: QzUpFile['ext']): boolean {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), ascii = (at: number, s: string) => b.subarray(at, at + s.length).toString('ascii') === s;
  switch (ext) {
    case 'webp': return b.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'png': return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'jpg': return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'gif': return b.length >= 6 && (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'));
    case 'mp3': return b.length >= 3 && (ascii(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
    case 'ogg': return b.length >= 4 && ascii(0, 'OggS');
    case 'm4a': return b.length >= 12 && ascii(4, 'ftyp');
  }
}

export class QuizHttp {
  readonly packs: QuizPacks;
  readonly enabled: boolean;
  private now: () => number;
  private ip: (req: IncomingMessage) => string;
  private log: (message: string) => void;
  private uploaders: string[];
  private tickets = new Map<string, Ticket>();
  private limiter: RateLimiter;
  private sweepTimer: ReturnType<typeof setInterval>;
  constructor(opts: QuizHttpOptions) {
    this.packs = opts.packs; this.enabled = opts.enabled ?? true; this.now = opts.now ?? Date.now;
    this.ip = opts.ip ?? (req => req.socket.remoteAddress ?? 'local'); this.log = opts.log ?? console.error;
    this.uploaders = [...(opts.uploaders ?? [])];
    this.limiter = new RateLimiter(this.now);
    this.sweepTimer = setInterval(() => { try { this.sweep(); } catch { this.log('quiz: не удалось убрать истёкшую загрузку'); } }, 30_000);
    this.sweepTimer.unref();
  }
  close(): void { clearInterval(this.sweepTimer); this.packs.flush(); }
  sweep(): void {
    const now = this.now();
    for (const [key, t] of this.tickets) if (t.exp <= now && !t.busy) this.tickets.delete(key);
    this.packs.expire(now); this.limiter.sweep(60_000);
  }
  /** Можно ли загружать паки; why — готовая строка для окна «Ракушки» (QzMe.uploadWhy) */
  uploadCheck(nick: string, level: number): { ok: boolean; why: string } {
    if (!this.enabled) return { ok: false, why: 'Паки пока недоступны.' };
    const key = nick.trim().toLowerCase();
    if (this.uploaders.length && !this.uploaders.some(n => n.toLowerCase() === key)) return { ok: false, why: `Загружать паки пока может только ${this.uploaders.join(', ')}` };
    if (!Number.isFinite(level) || level < QZ_PACK.MIN_LEVEL) return { ok: false, why: 'Загружать паки можно с 3-го уровня' };
    return { ok: true, why: '' };
  }
  /** Вызывает WS-сцена с pid, ником и уровнем из профиля; билет никогда не пишется в каталог или журнал. */
  ticket(pid: number, level: number, nick = ''): { ticket: string; exp: number; left: number } {
    if (!this.enabled) throw new PackError('Паки пока недоступны.', 404);
    this.sweep();
    const check = this.uploadCheck(nick, level);
    if (!check.ok) throw new PackError(check.why, 403);
    for (const [ticket, t] of this.tickets) if (t.pid === pid) return { ticket, exp: t.exp, left: this.packs.uploadsLeft(pid, this.now()) };
    this.packs.checkUpload(pid, level, this.now());
    const ticket = randomBytes(32).toString('hex'), exp = this.now() + QZ_PACK.TICKET_MS;
    this.tickets.set(ticket, { pid, exp, id: null, busy: false });
    return { ticket, exp, left: this.packs.uploadsLeft(pid, this.now()) };
  }
  handle(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
    if (pathname !== '/quiz' && !pathname.startsWith('/quiz/')) return false;
    if (!this.enabled) { json(res, 404, { ok: false, error: 'Паки пока недоступны.' }); return true; }
    this.request(req, res, pathname).catch((e: unknown) => {
      req.resume();
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof PackError) json(res, e.status, { ok: false, error: e.message });
      else { this.log('quiz: ошибка обработки загрузки пака'); json(res, 500, { ok: false, error: 'Что-то пошло не так' }); }
    });
    return true;
  }
  private auth(req: IncomingMessage): { key: string; ticket: Ticket } {
    const key = req.headers[QZ_TICKET_HEADER];
    const t = typeof key === 'string' && /^[a-f0-9]{64}$/.test(key) ? this.tickets.get(key) : undefined;
    if (!t || t.exp <= this.now()) { this.sweep(); throw new PackError('Билет истёк — получи новый.', 401); }
    return { key: key as string, ticket: t };
  }
  private async request(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const media = /^\/quiz\/m\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (media && (req.method === 'GET' || req.method === 'HEAD')) {
      const file = this.packs.media(media[1], media[2]); if (!file) throw new PackError('Файл не найден.', 404);
      res.writeHead(200, { 'content-type': MIME[media[2].split('.').at(-1)!], 'content-length': file.size,
        'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox" });
      if (req.method === 'HEAD') res.end();
      else {
        const stream = createReadStream(file.path); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
      }
      return;
    }
    const put = /^\/quiz\/up\/([a-f0-9]{12})\/([a-f0-9]{64}\.(?:webp|png|jpg|gif|mp3|ogg|m4a))$/.exec(pathname);
    const done = /^\/quiz\/up\/([a-f0-9]{12})\/done$/.exec(pathname);
    if (!(pathname === '/quiz/up' && req.method === 'POST') && !(put && req.method === 'PUT') && !(done && req.method === 'POST')) throw new PackError('Нет такого адреса.', 404);
    const files = req.method === 'PUT';
    if (!this.limiter.hit(`${files ? 'file' : 'post'}:${this.ip(req)}`, files ? 600 : 60, 60_000)) throw new PackError('Не так быстро — попробуй через минуту.', 429);
    const { key, ticket } = this.auth(req);
    if (ticket.busy) throw new PackError('Загрузка ещё идёт.', 409);
    ticket.busy = true;
    try {
      if (pathname === '/quiz/up') {
        if (ticket.id) throw new PackError('Этот билет уже использован для пака.', 409);
        const body = await readBody(req, QZ_PACK.JSON_BYTES);
        this.auth(req); // билет может истечь, пока приходило тело
        let raw: unknown;
        try { raw = JSON.parse(body.toString('utf8')); } catch { throw new PackError('Не получилось прочитать пак.'); }
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PackError('Не получилось прочитать пак.');
        const data = raw as Record<string, unknown>, validated = validatePack(data.pack, data.files);
        const draft = this.packs.begin(ticket.pid, ticket.exp, validated, this.now()); ticket.id = draft.id;
        const reply: QzUpStart = { ok: true, id: draft.id, need: draft.files.map(fileName) }; json(res, 200, reply);
      } else if (put) {
        if (ticket.id !== put[1]) throw new PackError('Билет от другого пака.', 401);
        const file = this.packs.draft(put[1])?.files.find(f => fileName(f) === put[2]);
        if (!file) throw new PackError('Файл не найден в списке пака.', 404);
        const body = await readBody(req, file.kind === 'image' ? QZ_PACK.IMAGE_BYTES : QZ_PACK.AUDIO_BYTES);
        this.auth(req);
        if (body.length !== file.size) throw new PackError('Размер файла не совпал.', body.length > file.size ? 413 : 400);
        if (createHash('sha256').update(body).digest('hex') !== file.sha256) throw new PackError('Хеш файла не совпал.', 409);
        if (!quizFileSignature(body, file.ext)) throw new PackError('Содержимое файла не соответствует его виду.');
        json(res, 200, { ok: true, left: this.packs.put(put[1], put[2], body) });
      } else if (done) {
        if (ticket.id !== done[1]) throw new PackError('Билет от другого пака.', 401);
        const info = this.packs.done(done[1], ticket.pid, this.now()); this.tickets.delete(key);
        req.resume(); json(res, 200, { ok: true, info });
      }
    } finally { ticket.busy = false; }
  }
}
