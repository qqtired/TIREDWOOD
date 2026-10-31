// Отправка готовых строк в существующую Telegram-группу; тексты и расписание задаёт хаб.
import { closeSync, fchmodSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mskDay } from '../shared/economy.ts';
import { CHAT_FILE, TOKEN_FILE, clean, clip, scrub, type TgFetch } from './tgfeed.ts';
import { makeTgFetch } from './tgnet.ts';

export const TG_CALL_FILE = 'tg-call.json';
export const CALL_ONLINE_MAX = 3;
export const CALL_PLAYER_GAP_MS = 10 * 60_000;
export const CALL_GLOBAL_GAP_MS = 5 * 60_000;
export const CALL_DAY_MAX = 12;
export type TgCallStatus = 'sent' | 'enough' | 'player-gap' | 'global-gap' | 'day-limit'
  | 'unconfigured' | 'failed' | 'uncertain' | 'already-sent';
export interface TgCallOptions { dir: string; fetch?: TgFetch; now?: () => number; log?: (s: string) => void }

type Delivery = 'sent' | 'failed' | 'uncertain';
interface Config { token: string; chat: number }
interface CallSlot { pid: number; at: number; day: string }
interface DigestState { digestWeek: number; tries: number; status: Delivery; at: number }
const DIGEST_GAP_MS = 10 * 60_000;
const DIGEST_TRIES_MAX = 3;

function config(dir: string): Config | undefined {
  try {
    const token = readFileSync(path.join(dir, TOKEN_FILE), 'utf8').trim();
    const chat = (JSON.parse(readFileSync(path.join(dir, CHAT_FILE), 'utf8')) as { id: number }).id;
    if (/^\d{1,20}:[\w-]{1,200}$/.test(token) && Number.isSafeInteger(chat) && chat !== 0) return { token, chat };
  } catch { /* Настройки не читаются: ни пути, ни содержимое ошибки не выводим. */ }
  return undefined;
}

function safeText(text: string, c: Config, multiline: boolean): string {
  const cleaned = multiline ? text.replace(/\r\n?/g, '\n').split('\n').map(clean).join('\n') : clean(text);
  return clip(scrub(cleaned, c.token).split(String(c.chat)).join('[chat]')
    .split(String(Math.abs(c.chat))).join('[chat]'), multiline ? 1200 : 300);
}

function save(file: string, state: DigestState): void {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeFileSync(fd, JSON.stringify(state) + '\n');
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(tmp, file);
  const dir = openSync(path.dirname(file), 'r');
  try { fsyncSync(dir); } finally { closeSync(dir); }
}

export class TgCall {
  private readonly dir: string;
  private readonly file: string;
  private readonly fetch: TgFetch;
  private readonly now: () => number;
  private readonly log: (s: string) => void;
  private calls: CallSlot[] = [];
  private digestState: DigestState | undefined;
  private stateUnreadable = false;
  private digestBusy = false;

  constructor(o: TgCallOptions) {
    this.dir = o.dir;
    this.file = path.join(o.dir, TG_CALL_FILE);
    this.fetch = o.fetch ?? makeTgFetch();
    this.now = o.now ?? Date.now;
    this.log = o.log ?? console.log;
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as DigestState | null;
      if (s && Number.isSafeInteger(s.digestWeek) && Number.isSafeInteger(s.at)
        && Number.isInteger(s.tries) && s.tries >= 1 && s.tries <= DIGEST_TRIES_MAX
        && (s.status === 'sent' || s.status === 'failed' || s.status === 'uncertain')) this.digestState = s;
      else this.stateUnreadable = true;
    } catch (error) {
      this.stateUnreadable = (error as NodeJS.ErrnoException).code !== 'ENOENT';
    }
  }

  /** Одна строка «зовёт»: слот занят до await, доказанный отказ освобождает его. */
  async call(o: { pid: number; online: number; text: string }): Promise<TgCallStatus> {
    if (o.online >= CALL_ONLINE_MAX) return this.report('call', 'enough');
    const c = config(this.dir);
    if (!c) return this.report('call', 'unconfigured');
    const now = this.now(), day = mskDay(now);
    // Храним сегодняшний счёт и короткий хвост прошлого дня для пауз через полночь.
    this.calls = this.calls.filter((s) => s.day === day || now - s.at < CALL_PLAYER_GAP_MS);
    if (this.calls.some((s) => s.pid === o.pid && now - s.at < CALL_PLAYER_GAP_MS)) return this.report('call', 'player-gap');
    if (this.calls.some((s) => now - s.at < CALL_GLOBAL_GAP_MS)) return this.report('call', 'global-gap');
    if (this.calls.filter((s) => s.day === day).length >= CALL_DAY_MAX) return this.report('call', 'day-limit');
    const text = safeText(o.text, c, false);
    const slot = { pid: o.pid, at: now, day };
    this.calls.push(slot);
    const result = await this.send(c, text);
    if (result === 'failed') this.calls = this.calls.filter((s) => s !== slot);
    return this.report('call', result);
  }

  /** Отметка до отправки переживает обрыв процесса; sent/uncertain не повторяются. */
  async digest(o: { weekStart: number; text: string }): Promise<TgCallStatus> {
    const blocked = this.digestBlocked(o.weekStart);
    if (blocked) return this.report('digest', blocked);
    const c = config(this.dir);
    if (!c) return this.report('digest', 'unconfigured');
    const text = safeText(o.text, c, true);
    const previous = this.digestState;
    const pending: DigestState = { digestWeek: o.weekStart,
      tries: (previous?.digestWeek === o.weekStart ? previous.tries : 0) + 1, status: 'uncertain', at: this.now() };
    this.digestState = pending;
    this.digestBusy = true;
    try {
      save(this.file, pending);
      const result = await this.send(c, text);
      const finished: DigestState = { ...pending, status: result };
      save(this.file, finished);
      this.digestState = finished;
      return this.report('digest', result);
    } catch {
      // Нет надёжной записи — отправку/повтор не разрешаем; старую отметку не стираем.
      return this.report('digest', 'uncertain');
    } finally { this.digestBusy = false; }
  }

  /** Проверка паузы и числа попыток без отправки и без записи состояния. */
  digestDue(weekStart: number): boolean {
    return this.digestBlocked(weekStart) === undefined;
  }

  private digestBlocked(weekStart: number): TgCallStatus | undefined {
    if (this.stateUnreadable || this.digestBusy) return 'uncertain';
    const s = this.digestState;
    if (!s || s.digestWeek !== weekStart) return undefined;
    if (s.status === 'sent') return 'already-sent';
    if (s.status === 'uncertain') return 'uncertain';
    // Во время паузы/после третьего отказа возвращаем прежний failed, без нового запроса.
    if (s.tries >= DIGEST_TRIES_MAX || this.now() - s.at < DIGEST_GAP_MS) return 'failed';
    return undefined;
  }

  private report(kind: 'call' | 'digest', status: TgCallStatus): TgCallStatus {
    // Только фиксированные строки: никаких error.message, description, URL, текста или настроек.
    this.log(`tg-call: ${kind}: ${status}`);
    return status;
  }

  private async send(c: Config, text: string): Promise<Delivery> {
    const ac = new AbortController();
    let responded = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { ac.abort(); reject(new Error('timeout')); }, 20_000);
    });
    try {
      const send = async (): Promise<Delivery> => {
        const response = await this.fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: ac.signal,
          body: JSON.stringify({ chat_id: c.chat, text, link_preview_options: { is_disabled: true } }),
        });
        responded = true;
        const reply = await response.json() as { ok?: unknown; result?: { message_id?: unknown } };
        if (response.ok && reply?.ok === true && Number.isSafeInteger(reply.result?.message_id)) return 'sent';
        return response.status >= 400 && response.status < 500 && reply?.ok === false ? 'failed' : 'uncertain';
      };
      return await Promise.race([send(), deadline]);
    } catch (error) {
      return !responded && !ac.signal.aborted && (error as { connect?: unknown } | null)?.connect === true ? 'failed' : 'uncertain';
    } finally { clearTimeout(timer); }
  }
}
