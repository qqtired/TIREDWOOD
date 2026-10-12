// Экран с чатом друзей на крыше склада: бот Telegram читает группу друзей (long polling getUpdates), набережная
// показывает последние строки — только имя и текст: без ников, фамилий и телефонов (набережная открыта всем по ссылке).
// Токен бота владелец кладёт в DATA_DIR/tg-token (deploy/set-tg-token.sh). Файла нет — на экране заставка, а файл
// перечитывается раз в 30 с: токен подхватится без перезапуска. Токен не попадает ни в журнал, ни в файлы, ни в тексты
// ошибок: он есть в адресе каждого запроса, поэтому в журнал идут только код HTTP, описание от Telegram и код сетевой
// ошибки, и всё — через scrub().
// Чат — один: первая группа, где бот увидел сообщение (DATA_DIR/tg-chat.json); группы, куда бота добавят посторонние,
// на экран не попадут. Последние строки — в DATA_DIR/tg-feed.json: после выкладки экран не пустой.
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import path from 'node:path';
import { TG_KEEP, type ServerMsg, type TgLine } from '../shared/messages.ts';
import { makeTgFetch } from './tgnet.ts';

export const TOKEN_FILE = 'tg-token';
export const CHAT_FILE = 'tg-chat.json';
export const FEED_FILE = 'tg-feed.json';

/** Пока токена нет или он не подошёл — перечитывать tg-token раз в столько мс */
export const RECHECK_MS = 30_000;
/** HTTP 409 (у бота вебхук или его уже опрашивает кто-то другой) — пробовать раз в столько мс */
export const CONFLICT_MS = 60_000;
/** Сеть: пауза после ошибки — от и до, с каждой ошибкой подряд вдвое дольше */
export const RETRY_MS: readonly [number, number] = [5_000, 60_000];
/** Сколько секунд Telegram держит запрос, пока новостей нет; ответа нет дольше FETCH_MS — бросаем и повторяем */
export const POLL_S = 50;
export const FETCH_MS = 60_000;
/** Ответ без новостей пришёл раньше, чем секунда, — пауза, чтобы не крутиться вхолостую */
export const EMPTY_GAP_MS = 1_000;
/** Набережной — не чаще раза в столько мс: пачка сообщений уходит одним письмом */
export const SEND_MS = 300;
/** tg-feed.json — не чаще раза в столько мс */
export const SAVE_MS = 2_000;
/** Сколько знаков на экране: имя, текст, название чата (эмодзи — один знак) */
export const NAME_MAX = 20;
export const TEXT_MAX = 200;
const TITLE_MAX = 48;
/** Ников для «@ник → @Имя» помним не больше стольких (только в памяти) */
const NAMES_KEEP = 200;
/** Похоже на токен бота: число, двоеточие, буквы и цифры. Другое в адрес запроса не подставляем */
const TOKEN_RE = /^\d{1,20}:[\w-]{1,200}$/;
/** Ссылки, которые Telegram не разметил: с http(s):// или www., и «домен/путь» */
const URL_RE = /(?:\bhttps?:\/\/|\bwww\.)\S+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,10}\/\S*/gi;

// ------------------------------------------------------------ что приходит от Telegram (Bot API, только нужное)

interface TgUser {
  id?: number;
  first_name?: string;
  username?: string;
}

interface TgChat {
  id: number;
  type?: string;
  title?: string;
}

interface TgEntity {
  type: string;
  offset: number;
  length: number;
  user?: TgUser;
}

export interface TgMessage {
  message_id: number;
  date: number;
  chat: TgChat;
  from?: TgUser;
  /** От имени группы (анонимный админ) или канала */
  sender_chat?: TgChat;
  text?: string;
  entities?: TgEntity[];
  caption?: string;
  caption_entities?: TgEntity[];
  photo?: unknown;
  sticker?: { emoji?: string };
  voice?: unknown;
  audio?: unknown;
  video?: unknown;
  animation?: unknown;
  video_note?: unknown;
  document?: unknown;
  location?: unknown;
  venue?: unknown;
  contact?: unknown;
  poll?: { question?: string };
  dice?: { emoji?: string; value?: number };
  /** Группа стала супергруппой: в старой — номер новой, в новой — номер старой */
  migrate_to_chat_id?: number;
  migrate_from_chat_id?: number;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}

interface TgReply {
  ok?: unknown;
  result?: unknown;
  description?: unknown;
  parameters?: { retry_after?: unknown };
}

// ------------------------------------------------------------ текст строки

const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ru', { granularity: 'grapheme' }) : null;

/** Знаки строки — как их видит глаз (эмодзи с модификаторами — один знак). */
function chars(s: string): string[] {
  return graphemes ? Array.from(graphemes.segment(s), (g) => g.segment) : Array.from(s);
}

/** Не длиннее max знаков: длиннее — обрезано и в конце tail (он входит в max). */
export function clip(s: string, max: number, tail = '…'): string {
  const g = chars(s);
  if (g.length <= max) return s;
  return g.slice(0, Math.max(0, max - chars(tail).length)).join('').trimEnd() + tail;
}

/**
 * Без управляющих и невидимых символов (склейку эмодзи U+200D оставляем), без «переворота» текста и горы диакритики;
 * переводы строк и табуляции — пробелы, пробелы — не подряд.
 */
export function clean(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/[\u00ad\u061c\u180e\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g, '')
    .replace(/(\p{M}{3})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Чем заменить размеченный кусок текста: ссылки, почта, телефоны, ники, спойлеры (null — оставить как есть). */
function masked(e: TgEntity, part: string, names: ReadonlyMap<string, string> | undefined): string | null {
  switch (e.type) {
    case 'url':
      return '🔗';
    case 'email':
      return '✉️';
    case 'phone_number':
      return '📞';
    case 'mention': {
      // @ник: если знаем имя — покажем его, ников на экране нет
      const name = names?.get(part.slice(1).toLowerCase());
      return name ? `@${name}` : '@…';
    }
    case 'text_mention': {
      // упоминание без ника: в тексте может быть имя с фамилией — оставляем только имя
      const name = clip(clean(e.user?.first_name ?? ''), NAME_MAX);
      return name ? `@${name}` : '@…';
    }
    case 'spoiler':
      // скрытое в Telegram и на экране скрыто
      return '░'.repeat(Math.min(8, Math.max(3, chars(part).length)));
    default:
      return null;
  }
}

/** Текст или подпись для экрана: разметка Telegram → значки, неразмеченные ссылки → 🔗, без переводов строк. */
function body(raw: string, entities: readonly TgEntity[] | undefined, names?: ReadonlyMap<string, string>): string {
  let s = raw;
  if (Array.isArray(entities) && entities.length > 0) {
    // сначала внешние (раньше и длиннее): то, что внутри спойлера, уходит вместе с ним
    const take: TgEntity[] = [];
    const list = entities
      .filter((e) => e && Number.isInteger(e.offset) && Number.isInteger(e.length) && e.offset >= 0 && e.length > 0 && e.offset + e.length <= s.length)
      .sort((a, b) => a.offset - b.offset || b.length - a.length);
    for (const e of list) {
      const last = take[take.length - 1];
      if (masked(e, '', undefined) !== null && (!last || e.offset >= last.offset + last.length)) take.push(e);
    }
    // с конца: замена не сдвигает то, что ещё не заменено (отступы у Telegram — в тех же UTF-16, что и строки JS)
    for (let i = take.length - 1; i >= 0; i--) {
      const e = take[i];
      const part = s.slice(e.offset, e.offset + e.length);
      s = s.slice(0, e.offset) + (masked(e, part, names) ?? part) + s.slice(e.offset + e.length);
    }
  }
  return clean(s.replace(URL_RE, ' 🔗 ')).replace(/🔗(?:\s*🔗)+/gu, '🔗');
}

/** Кто написал: только имя (без фамилии и ника); от имени группы — «Админ», от имени канала — его название. */
function senderName(m: TgMessage): string {
  const sc = m.sender_chat;
  const raw = sc ? (sc.id === m.chat.id ? 'Админ' : (sc.title ?? '')) : (m.from?.first_name ?? '');
  return clip(clean(typeof raw === 'string' ? raw : ''), NAME_MAX) || 'Кто-то';
}

/** Что показать: текст, подпись или значок вложения; '' — не показываем (команда боту, служебное, незнакомое). */
function lineText(m: TgMessage, names?: ReadonlyMap<string, string>): string {
  const caption = (): string => (typeof m.caption === 'string' ? body(m.caption, m.caption_entities, names) : '');
  const labeled = (icon: string, word: string): string => `${icon} ${caption() || word}`;
  if (typeof m.text === 'string') return m.text.trimStart().startsWith('/') ? '' : body(m.text, m.entities, names);
  if (m.photo) return labeled('📷', 'фото');
  if (m.sticker) return clean(typeof m.sticker.emoji === 'string' ? m.sticker.emoji : '') || '🙂 стикер';
  if (m.voice) return labeled('🎤', 'голосовое');
  if (m.audio) return labeled('🎵', 'аудио');
  if (m.video_note) return '🎬 кружок';
  // у гифки Telegram заполняет и document — она раньше
  if (m.animation) return labeled('🎬', 'гифка');
  if (m.video) return labeled('🎬', 'видео');
  if (m.document) return labeled('📎', 'файл');
  if (m.poll) return `📊 ${body(typeof m.poll.question === 'string' ? m.poll.question : '', undefined, names) || 'опрос'}`;
  if (m.dice) return `${clean(typeof m.dice.emoji === 'string' ? m.dice.emoji : '') || '🎲'}${Number.isInteger(m.dice.value) ? ` ${m.dice.value}` : ''}`;
  // место и контакт — без подробностей: координаты и телефоны на набережной ни к чему
  if (m.venue || m.location) return '📍 геопозиция';
  if (m.contact) return '👤 контакт';
  // служебные (вошёл, вышел, закрепил, сменил название…) и всё незнакомое
  return '';
}

/** Строка экрана из сообщения Telegram; null — не показываем. names — «ник → имя» для упоминаний. */
export function formatLine(m: TgMessage, names?: ReadonlyMap<string, string>): TgLine | null {
  if (!m || typeof m !== 'object' || !Number.isSafeInteger(m.message_id) || !Number.isFinite(m.date) || !m.chat) return null;
  const text = clip(lineText(m, names), TEXT_MAX);
  return text ? { id: m.message_id, name: senderName(m), text, at: Math.round(m.date * 1000) } : null;
}

// ------------------------------------------------------------ журнал без токена

/** Убрать всё, похожее на токен бота (и сами известные токены — целиком и часть после двоеточия). */
export function scrub(s: string, ...known: string[]): string {
  let out = s;
  for (const t of known) {
    if (!t) continue;
    out = out.split(t).join('[токен]');
    const secret = t.slice(t.indexOf(':') + 1);
    if (secret.length >= 8) out = out.split(secret).join('[токен]');
  }
  return out.replace(/bot\d+:[\w-]+/gi, 'bot[токен]').replace(/\b\d{3,}:[\w-]{16,}/g, '[токен]');
}

/** Код ошибки для журнала (ECONNRESET, UND_ERR_CONNECT_TIMEOUT…) — не её текст: в тексте бывает адрес с токеном. */
function errCode(err: unknown): string {
  const e = err as { code?: unknown; name?: unknown; cause?: { code?: unknown; name?: unknown } } | null | undefined;
  for (const v of [e?.cause?.code, e?.code, e?.cause?.name, e?.name]) {
    if (typeof v === 'string' && /^[A-Z][A-Za-z0-9_]{1,40}$/.test(v) && v !== 'Error' && v !== 'TypeError') return v;
  }
  return 'сбой';
}

function describe(d: TgReply | null): string {
  return typeof d?.description === 'string' ? clip(clean(d.description), 160) : '';
}

/** 429: сколько мс просит подождать Telegram */
function retryAfter(d: TgReply | null): number {
  const s = d?.parameters?.retry_after;
  return typeof s === 'number' && Number.isFinite(s) ? Math.min(3600, Math.max(1, s)) * 1000 : 0;
}

// ------------------------------------------------------------ файлы

/** Запись без порчи: во временный файл, на диск, переименовать поверх. Файл — только для владельца. */
function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

function readJson(file: string): { ok: true; value: unknown } | { ok: false; why: string } {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    return { ok: false, why: (err as NodeJS.ErrnoException).code ?? 'ошибка' };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, why: 'испорчен' };
  }
}

interface Feed {
  chat: number;
  title: string;
  max: number;
  lines: TgLine[];
}

/** tg-feed.json → строки (что не похоже на строку — пропускаем); null — файл не про то. */
function parseFeed(v: unknown): Feed | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.lines)) return null;
  const lines: TgLine[] = [];
  const seen = new Set<number>();
  for (const x of o.lines.slice(-TG_KEEP)) {
    const l = x as Record<string, unknown> | null;
    if (!l || !Number.isSafeInteger(l.id) || typeof l.name !== 'string' || typeof l.text !== 'string' || !Number.isFinite(l.at)) continue;
    const id = l.id as number;
    const text = clip(clean(l.text), TEXT_MAX);
    if (seen.has(id) || !text) continue;
    seen.add(id);
    lines.push({ id, name: clip(clean(l.name), NAME_MAX) || 'Кто-то', text, at: l.at as number });
  }
  const chat = Number.isSafeInteger(o.chat) ? (o.chat as number) : 0;
  const max = Number.isSafeInteger(o.max) ? (o.max as number) : 0;
  const title = typeof o.title === 'string' ? clip(clean(o.title), TITLE_MAX) : '';
  return { chat, title, max: Math.max(max, ...lines.map((l) => l.id)), lines };
}

// ------------------------------------------------------------ лента

/** Набережной: tg — всё сразу, tgUp — новые и исправленные строки */
export type TgMsg = Extract<ServerMsg, { t: 'tg' | 'tgUp' }>;

export type TgFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** Обычные таймеры: процесс они не держат */
const realTimers: Timers = {
  set(fn, ms) {
    const t = setTimeout(fn, ms);
    t.unref();
    return t;
  },
  clear(h) {
    clearTimeout(h as ReturnType<typeof setTimeout>);
  },
};

export interface TgFeedOptions {
  /** Папка данных: tg-token кладёт владелец, tg-chat.json и tg-feed.json пишем сами */
  dir: string;
  fetch?: TgFetch;
  now?: () => number;
  timers?: Timers;
  log?: (s: string) => void;
}

/** Что ответил Telegram на getUpdates */
type Poll =
  | { k: 'ok'; updates: readonly unknown[] }
  | { k: 'bad'; status: number; desc: string }
  | { k: 'conflict'; desc: string }
  | { k: 'retry'; why: string; after: number }
  | { k: 'stopped' };

/** Состояние для журнала: строка — при смене, а не на каждой попытке */
type Mode = 'start' | 'off' | 'bad' | 'ok' | 'conflict' | 'net';

export class TgFeed {
  /** Разослать набережной (ставит хаб) */
  onSend: ((msg: TgMsg) => void) | null = null;
  private readonly dir: string;
  private readonly fetch: TgFetch;
  private readonly now: () => number;
  private readonly timers: Timers;
  private readonly log: (s: string) => void;
  private title = '';
  private lines: TgLine[] = [];
  /** Чат экрана (0 — ещё не выбран), чат, из которого строки, и самый большой номер сообщения в нём */
  private chat = 0;
  private feedChat = 0;
  private maxId = 0;
  /** Токен есть (файл не пустой): нет — экран показывает заставку */
  private on = false;
  private token = '';
  /** Токен, который не подошёл: пока в файле он же — Telegram не спрашиваем */
  private bad = '';
  private offset = 0;
  private fails = 0;
  private mode: Mode = 'start';
  private everOk = false;
  /** «ник → имя» для упоминаний в тексте (только в памяти) */
  private readonly names = new Map<string, string>();
  /** Что разослать: строки по номерам, название, всё заново */
  private readonly dirty = new Set<number>();
  private titleDirty = false;
  private full = false;
  private sendTimer: unknown = null;
  private saveTimer: unknown = null;
  private loopTimer: unknown = null;
  private ac: AbortController | null = null;
  private running = false;
  private stopped = false;

  constructor(o: TgFeedOptions) {
    this.dir = o.dir;
    // адрес api.telegram.org из DNS у хостинга закрыт (блокировка в РФ) — ходим по списку адресов (server/tgnet.ts)
    this.fetch = o.fetch ?? makeTgFetch({ log: (s) => this.say(s) });
    this.now = o.now ?? Date.now;
    this.timers = o.timers ?? realTimers;
    this.log = o.log ?? ((s) => console.log(s));
    this.load();
    this.on = 'token' in this.readToken();
  }

  /** Что на экране сейчас — входящему на набережную. */
  view(): { title: string; lines: TgLine[] } {
    return this.on ? { title: this.title, lines: this.lines.slice() } : { title: '', lines: [] };
  }

  /** Слушать Telegram (сервер запустился). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    void this.loop();
  }

  /** Сервер останавливается: оборвать запрос, дописать tg-feed.json. */
  stop(): void {
    this.stopped = true;
    this.running = false;
    this.ac?.abort();
    for (const h of [this.loopTimer, this.sendTimer]) if (h !== null) this.timers.clear(h);
    this.loopTimer = null;
    this.sendTimer = null;
    if (this.saveTimer !== null) {
      this.timers.clear(this.saveTimer);
      this.saveTimer = null;
      this.save();
    }
  }

  private async loop(): Promise<void> {
    this.loopTimer = null;
    if (this.stopped) return;
    let wait: number;
    try {
      wait = await this.step();
    } catch (err) {
      this.say(`tg: сбой (${errCode(err)}) — повтор через минуту`);
      wait = RETRY_MS[1];
    }
    if (!this.stopped) this.loopTimer = this.timers.set(() => void this.loop(), wait);
  }

  /**
   * Один шаг: перечитать tg-token и, если токен есть, один запрос getUpdates. Возвращает, через сколько мс следующий
   * (0 — сразу: long polling сам ждёт новостей до 50 с).
   */
  async step(): Promise<number> {
    const t = this.readToken();
    if (!('token' in t)) {
      this.setOn(false);
      this.enter('off', `tg: ${t.why} — на экране чата заставка; токен подхвачу сам, без перезапуска`);
      return RECHECK_MS;
    }
    this.setOn(true);
    const token = t.token;
    if (token === this.bad) return RECHECK_MS;
    if (token !== this.token) {
      // другой токен — может быть, и другой бот: у него своя нумерация обновлений, и в журнал — заново
      this.token = token;
      this.bad = '';
      this.offset = 0;
      this.fails = 0;
      this.mode = 'start';
    }
    if (!TOKEN_RE.test(token)) {
      this.bad = token;
      this.token = '';
      this.enter('bad', 'tg: в tg-token не токен бота (нужен вида 123456:ABC…) — жду правильный');
      return RECHECK_MS;
    }
    const t0 = this.now();
    const r = await this.poll();
    switch (r.k) {
      case 'stopped':
        return RECHECK_MS;
      case 'ok':
        this.fails = 0;
        this.apply(r.updates);
        this.enter('ok', this.everOk ? 'tg: связь с Telegram снова есть' : `tg: бот на связи${this.chat ? '' : ' — жду первое сообщение из группы друзей'}`);
        this.everOk = true;
        return r.updates.length === 0 && this.now() - t0 < EMPTY_GAP_MS ? EMPTY_GAP_MS : 0;
      case 'bad':
        this.bad = token;
        this.token = '';
        this.enter('bad', `tg: токен не подошёл (HTTP ${r.status}${r.desc ? `: ${r.desc}` : ''}) — жду другой в tg-token`);
        return RECHECK_MS;
      case 'conflict':
        // сеть-то работает: следующая сетевая ошибка — снова с короткой паузы
        this.fails = 0;
        this.enter('conflict', `tg: HTTP 409${r.desc ? ` (${r.desc})` : ''} — у бота вебхук или его уже кто-то опрашивает; пробую раз в минуту`);
        return CONFLICT_MS;
      case 'retry': {
        const wait = Math.max(Math.min(RETRY_MS[1], RETRY_MS[0] * 2 ** this.fails), r.after);
        this.fails++;
        this.enter('net', `tg: ${r.why} — повторяю (через ${Math.round(wait / 1000)} с, дальше реже)`);
        return wait;
      }
    }
  }

  /** Токен из tg-token (без пробелов по краям) или почему его нет. Сам токен живёт только в памяти. */
  private readToken(): { token: string } | { why: string } {
    let text: string;
    try {
      text = readFileSync(path.join(this.dir, TOKEN_FILE), 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      return { why: code === 'ENOENT' ? 'токена нет (файл tg-token в папке данных)' : `tg-token не читается (${errCode(err)})` };
    }
    const token = text.trim();
    return token ? { token } : { why: 'tg-token пустой' };
  }

  private async poll(): Promise<Poll> {
    const ac = new AbortController();
    this.ac = ac;
    const timer = this.timers.set(() => ac.abort(), FETCH_MS);
    try {
      const body: Record<string, unknown> = { timeout: POLL_S, allowed_updates: ['message', 'edited_message'] };
      if (this.offset > 0) body.offset = this.offset;
      const res = await this.fetch(`https://api.telegram.org/bot${this.token}/getUpdates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      let data: TgReply | null = null;
      try {
        data = (await res.json()) as TgReply;
      } catch {
        // не JSON (прокси, обрыв) — ниже это просто ошибка
      }
      if (this.stopped) return { k: 'stopped' };
      const desc = describe(data);
      if (res.status === 401 || res.status === 404) return { k: 'bad', status: res.status, desc };
      if (res.status === 409) return { k: 'conflict', desc };
      if (res.ok && data?.ok === true && Array.isArray(data.result)) return { k: 'ok', updates: data.result };
      return { k: 'retry', why: `HTTP ${res.status}${desc ? `: ${desc}` : ''}`, after: res.status === 429 ? retryAfter(data) : 0 };
    } catch (err) {
      if (this.stopped) return { k: 'stopped' };
      return { k: 'retry', why: ac.signal.aborted ? `Telegram не ответил за ${FETCH_MS / 1000} с` : `нет связи с Telegram (${errCode(err)})`, after: 0 };
    } finally {
      this.timers.clear(timer);
      if (this.ac === ac) this.ac = null;
    }
  }

  /** Пачка обновлений: сдвинуть offset (Telegram забудет присланное), разобрать сообщения. */
  private apply(updates: readonly unknown[]): void {
    for (const raw of updates) {
      const u = raw as TgUpdate | null;
      if (!u || typeof u !== 'object' || !Number.isSafeInteger(u.update_id)) continue;
      this.offset = Math.max(this.offset, u.update_id + 1);
      const m = u.message ?? u.edited_message;
      if (m && typeof m === 'object') this.onMessage(m, !u.message);
    }
  }

  private onMessage(m: TgMessage, edited: boolean): void {
    const chat = m.chat;
    // только группы: личные сообщения боту и каналы — мимо
    if (!chat || !Number.isSafeInteger(chat.id) || (chat.type !== 'group' && chat.type !== 'supergroup')) return;
    if (this.chat === 0) this.lock(chat.id, typeof chat.title === 'string' ? chat.title : '');
    // группа стала супергруппой — у чата новый номер (о переезде пишут и в старый, и в новый)
    if (chat.id === this.chat && Number.isSafeInteger(m.migrate_to_chat_id)) {
      this.relock(m.migrate_to_chat_id as number);
      return;
    }
    if (chat.id !== this.chat && m.migrate_from_chat_id === this.chat) this.relock(chat.id);
    // чужие группы — молча мимо
    if (chat.id !== this.chat) return;
    const title = typeof chat.title === 'string' ? clip(clean(chat.title), TITLE_MAX) : '';
    if (title && title !== this.title) {
      this.title = title;
      this.titleDirty = true;
      this.changed();
    }
    this.learn(m.from);
    const line = formatLine(m, this.names);
    const i = this.lines.findIndex((l) => l.id === m.message_id);
    if (i >= 0) {
      // уже на экране: исправили — или Telegram прислал то же ещё раз (после перезапуска он повторяет последнюю пачку)
      const old = this.lines[i];
      if (!line) {
        if (edited) {
          this.lines.splice(i, 1);
          this.full = true;
          this.changed();
        }
        return;
      }
      if (old.name === line.name && old.text === line.text && old.at === line.at) return;
      this.lines[i] = line;
      this.dirty.add(line.id);
      this.changed();
      return;
    }
    // исправили то, что уже ушло с экрана; старое, уже показанное; нечего показать (команда, служебное)
    if (edited || !line || line.id <= this.maxId) return;
    this.maxId = line.id;
    this.lines.push(line);
    if (this.lines.length > TG_KEEP) this.lines.splice(0, this.lines.length - TG_KEEP);
    this.dirty.add(line.id);
    this.changed();
  }

  /** Первая группа — чат экрана: запомнить навсегда (сбросить — удалить tg-chat.json). */
  private lock(id: number, title: string): void {
    this.chat = id;
    if (this.feedChat !== id) {
      // строки в tg-feed.json — из другого чата (выбор сбросили): начинаем с пустого экрана
      if (this.lines.length > 0 || this.title) {
        this.lines = [];
        this.title = '';
        this.full = true;
        this.changed();
      }
      this.feedChat = id;
      this.maxId = 0;
    }
    this.writeJson(CHAT_FILE, { id });
    this.say(`tg: экран показывает чат «${clip(clean(title), TITLE_MAX) || id}» — другие чаты бот не покажет`);
  }

  /** Группа стала супергруппой. В ней своя нумерация сообщений: у старых строк номера — с минусом, чтобы не совпали. */
  private relock(id: number): void {
    if (id === this.chat || id === 0) return;
    this.chat = id;
    this.feedChat = id;
    this.maxId = 0;
    this.lines = this.lines.map((l) => (l.id > 0 ? { ...l, id: -l.id } : l));
    this.full = true;
    this.writeJson(CHAT_FILE, { id });
    this.say('tg: группа стала супергруппой — экран следит за ней по новому номеру');
    this.changed();
  }

  /** Запомнить «ник → имя» (только в памяти): вместо @ника в тексте покажем имя. */
  private learn(u: TgUser | undefined): void {
    if (!u || typeof u.username !== 'string' || typeof u.first_name !== 'string') return;
    const name = clip(clean(u.first_name), NAME_MAX);
    if (!name) return;
    const key = u.username.toLowerCase();
    this.names.delete(key);
    this.names.set(key, name);
    if (this.names.size > NAMES_KEEP) this.names.delete(this.names.keys().next().value as string);
  }

  private setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.full = true;
    this.sendSoon();
  }

  private changed(): void {
    this.sendSoon();
    this.saveSoon();
  }

  private sendSoon(): void {
    if (this.sendTimer !== null || this.stopped) return;
    this.sendTimer = this.timers.set(() => {
      this.sendTimer = null;
      this.send();
    }, SEND_MS);
  }

  /** Разослать накопленное: всё заново — tg, иначе новые и исправленные строки — tgUp. */
  private send(): void {
    const all = this.full;
    const title = this.titleDirty;
    const lines = all ? [] : this.lines.filter((l) => this.dirty.has(l.id));
    this.full = false;
    this.titleDirty = false;
    this.dirty.clear();
    if (all) this.onSend?.({ t: 'tg', ...this.view() });
    else if (this.on && (lines.length > 0 || title)) this.onSend?.({ t: 'tgUp', title: this.title, lines });
  }

  private saveSoon(): void {
    if (this.saveTimer !== null || this.stopped) return;
    this.saveTimer = this.timers.set(() => {
      this.saveTimer = null;
      this.save();
    }, SAVE_MS);
  }

  private save(): void {
    this.writeJson(FEED_FILE, { v: 1, chat: this.feedChat, title: this.title, max: this.maxId, lines: this.lines });
  }

  private writeJson(name: string, value: unknown): void {
    try {
      writeAtomic(path.join(this.dir, name), `${JSON.stringify(value)}\n`);
    } catch (err) {
      this.say(`tg: не записать ${name} (${errCode(err)})`);
    }
  }

  /** Чат экрана и последние строки с прошлого запуска; испорченные файлы — не беда. */
  private load(): void {
    const lock = readJson(path.join(this.dir, CHAT_FILE));
    const id = lock.ok ? (lock.value as { id?: unknown } | null)?.id : undefined;
    if (Number.isSafeInteger(id) && id !== 0) this.chat = id as number;
    else if (lock.ok || lock.why !== 'ENOENT') this.say(`tg: ${CHAT_FILE} не читается — чат выберется заново, по первому сообщению из группы`);
    const file = readJson(path.join(this.dir, FEED_FILE));
    const feed = file.ok ? parseFeed(file.value) : null;
    if (!feed) {
      if (file.ok || file.why !== 'ENOENT') this.say(`tg: ${FEED_FILE} не читается — экран начнёт с пустого`);
      return;
    }
    // строки из другого чата (выбор сбросили и выбрали другой) не показываем
    if (this.chat !== 0 && feed.chat !== this.chat) return;
    this.feedChat = feed.chat;
    this.title = feed.title;
    this.maxId = feed.max;
    this.lines = feed.lines;
  }

  /** В журнал — только этой дорогой: без управляющих символов и без всего, похожего на токен. */
  private say(text: string): void {
    this.log(scrub(clean(text), this.token, this.bad));
  }

  /** Новое состояние — строка в журнал (то же состояние повторно не пишем). */
  private enter(mode: Mode, text: string): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.say(text);
  }
}
