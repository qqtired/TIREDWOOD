// Одно уведомление о проверенном релизе: существующий бот/чат, без фоновой очереди и повторов при неясной доставке.
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHAT_FILE, TOKEN_FILE, clean, clip, scrub, type TgFetch } from './tgfeed.ts';
import { makeTgFetch } from './tgnet.ts';

export const RELEASE_STATE_DIR = 'tg-releases';
export interface ReleaseNotes { releaseId: string; notes: string }
export type ReleaseStatus = 'sent' | 'already-sent' | 'already-attempted' | 'not-verified' | 'invalid-notes'
  | 'unconfigured' | 'failed' | 'uncertain' | 'state-error' | 'retry-refused';
interface Diagnostic {
  kind: 'connect-failed' | 'api-rejected' | 'http-response' | 'invalid-response' | 'timeout' | 'transport';
  code?: string;
  httpStatus?: number;
  telegramErrorCode?: number;
  description?: string;
}
interface Attempt { status: string; at: string; diagnostic?: Diagnostic }
interface ReleaseState extends Attempt { releaseId: string; attempts?: Attempt[] }
export interface ReleaseOptions {
  dir: string;
  release: ReleaseNotes;
  smokePassed: boolean;
  activeReleaseId: string;
  /** Только явная команда retry для уже сохранённого подтверждённого отказа. */
  retryFailed?: boolean;
  /** send: до трёх попыток только при доказанном отказе соединения до TLS. */
  retryConnectFailures?: boolean;
  fetch?: TgFetch;
  log?: (text: string) => void;
}

/** Notes пишет выпускающий: не подменяем пустой текст git log или выдуманной сводкой. */
export function prepareReleaseNotes(releaseId: string, notes: string): ReleaseNotes {
  if (typeof releaseId !== 'string' || !/^\d{8}-\d{6}$/.test(releaseId)) throw new Error('Неверный номер релиза');
  if (typeof notes !== 'string' || !notes.trim()) throw new Error('Нужен подготовленный текст изменений для игроков');
  const text = notes.replace(/\r\n?/g, '\n').trim();
  if (text.length > 3000) throw new Error('Текст изменений должен быть не длиннее 3000 знаков');
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) throw new Error('Текст изменений содержит управляющие символы');
  return { releaseId, notes: text };
}

const statusText: Record<ReleaseStatus, string> = {
  sent: 'сообщение об обновлении отправлено',
  'already-sent': 'сообщение уже отправлено; повтор пропущен',
  'already-attempted': 'попытка уже была; доставка не подтверждена, автоматического повтора нет',
  'not-verified': 'отправки нет: успешная проверка активного релиза не подтверждена',
  'invalid-notes': 'отправки нет: некорректный номер релиза или текст изменений',
  unconfigured: 'отправки нет: токен или привязанный чат отсутствует либо не читается',
  failed: 'сообщение не отправлено: нет соединения или Telegram отклонил запрос; автоматического повтора нет',
  uncertain: 'доставка не подтверждена; проверь чат вручную, автоматического повтора нет',
  'state-error': 'сбой сохранения статуса уведомления; автоматического повтора нет',
  'retry-refused': 'повтор запрещён: нет подтверждённого отказа предыдущей попытки',
};

function syncDir(dir: string): void {
  const fd = openSync(dir, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function save(file: string, state: ReleaseState, exclusive: boolean): void {
  const target = exclusive ? file : `${file}.tmp`;
  const fd = openSync(target, exclusive ? 'wx' : 'w', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(state) + '\n');
    fsyncSync(fd);
  } finally { closeSync(fd); }
  if (!exclusive) renameSync(target, file);
  syncDir(path.dirname(file));
}

function retryable(state: ReleaseState, releaseId: string): boolean {
  if (state.releaseId !== releaseId || state.status !== 'failed') return false;
  const d = state.diagnostic;
  if (d?.kind === 'connect-failed') return true;
  if (d?.kind === 'api-rejected' && d.httpStatus! >= 400 && d.httpStatus! < 500) return true;
  // Формат первого выпуска: failed записывался ТОЛЬКО для connect-before-TLS или HTTP 4xx ok:false.
  // Старую причину не выдумываем; исходная запись остаётся первым элементом истории.
  return !d && !state.attempts && typeof state.at === 'string' && Number.isFinite(Date.parse(state.at))
    && Object.keys(state).every((key) => ['releaseId', 'status', 'at'].includes(key));
}

function description(value: unknown, token: string, chat: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return clip(clean(scrub(value, token)).replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[url]')
    .split(String(chat)).join('[chat]').split(String(Math.abs(chat))).join('[chat]')
    .replace(/-?\d{5,}/g, '[id]'), 200);
}

function errorCode(error: unknown, token: string): string | undefined {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  for (const value of [e?.cause?.code, e?.code]) {
    if (typeof value === 'string') {
      const safe = scrub(value, token);
      if (/^[A-Z][A-Z0-9_]{1,40}$/.test(safe)) return safe;
    }
  }
  return undefined;
}

/** До отправки сохраняем попытку. Даже после обрыва процесса/ответа обычный повтор не создаст дубль. */
export async function announceRelease(o: ReleaseOptions): Promise<ReleaseStatus> {
  const report = (status: ReleaseStatus, diagnostic?: Diagnostic): ReleaseStatus => {
    // Только фиксированные статусы и очищенная диагностика, никогда raw error / response.
    (o.log ?? console.log)(`tg-release: ${status}: ${statusText[status]}${diagnostic ? ` ${JSON.stringify(diagnostic)}` : ''}`);
    return status;
  };
  let release: ReleaseNotes;
  try { release = prepareReleaseNotes(o.release.releaseId, o.release.notes); }
  catch { return report('invalid-notes'); }
  if (!o.smokePassed || o.activeReleaseId !== release.releaseId) return report('not-verified');

  let token: string, chat: number;
  try {
    token = readFileSync(path.join(o.dir, TOKEN_FILE), 'utf8').trim();
    chat = (JSON.parse(readFileSync(path.join(o.dir, CHAT_FILE), 'utf8')) as { id: number }).id;
    if (!/^\d{1,20}:[\w-]{1,200}$/.test(token) || !Number.isSafeInteger(chat) || chat === 0) return report('unconfigured');
  } catch { return report('unconfigured'); }

  const stateDir = path.join(o.dir, RELEASE_STATE_DIR);
  const file = path.join(stateDir, `${release.releaseId}.json`);
  const lock = `${file}.retry-lock`;
  let locked = false;
  let history: Attempt[] = [];
  try {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    syncDir(o.dir);
    if (o.retryFailed || o.retryConnectFailures) {
      try { closeSync(openSync(lock, 'wx', 0o600)); locked = true; }
      catch (error) { return report((error as NodeJS.ErrnoException).code === 'EEXIST' ? 'already-attempted' : 'state-error'); }
    }
    if (o.retryFailed) {
      let previous: ReleaseState;
      try { previous = JSON.parse(readFileSync(file, 'utf8')) as ReleaseState; }
      catch { return report('retry-refused'); }
      if (!previous || !retryable(previous, release.releaseId)) return report('retry-refused');
      history = previous.attempts ?? [{ status: previous.status, at: previous.at, ...(previous.diagnostic ? { diagnostic: previous.diagnostic } : {}) }];
      if (!Array.isArray(history)) return report('retry-refused');
    }
    const maxAttempts = o.retryConnectFailures ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started: Attempt = { status: 'attempted', at: new Date().toISOString() };
      try {
        save(file, { releaseId: release.releaseId, ...started, attempts: [...history, started] }, !o.retryFailed && attempt === 1);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || o.retryFailed) return report('state-error');
        try {
          const state = JSON.parse(readFileSync(file, 'utf8')) as ReleaseState;
          if (state.releaseId === release.releaseId && state.status === 'sent') return report('already-sent');
        } catch { /* Неясный статус не даёт права повторять отправку. */ }
        return report('already-attempted');
      }

      let result: ReleaseStatus;
      let diagnostic: Diagnostic | undefined;
      const ac = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { ac.abort(); reject(new Error('timeout')); }, 20_000);
      });
      try {
        const send = async (): Promise<ReleaseStatus> => {
          const response = await (o.fetch ?? makeTgFetch())(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, signal: ac.signal,
            body: JSON.stringify({ chat_id: chat, text: `Обновление TIREDWOOD уже на сервере\n\n${release.notes}\n\nhttps://game.tired.solutions`,
              link_preview_options: { is_disabled: true } }),
          });
          diagnostic = { kind: 'invalid-response', httpStatus: response.status };
          const reply = await response.json() as { ok?: unknown; result?: { message_id?: unknown }; error_code?: unknown; description?: unknown };
          if (response.ok && reply?.ok === true && Number.isSafeInteger(reply.result?.message_id)) { diagnostic = undefined; return 'sent'; }
          const rejected = reply?.ok === false && response.status >= 400 && response.status < 500;
          diagnostic = { kind: rejected ? 'api-rejected' : 'http-response', httpStatus: response.status,
            ...(typeof reply?.error_code === 'number' && Number.isSafeInteger(reply.error_code) && reply.error_code >= 100 && reply.error_code < 600
              ? { telegramErrorCode: reply.error_code } : {}), description: description(reply?.description, token, chat) };
          return rejected ? 'failed' : 'uncertain';
        };
        result = await Promise.race([send(), deadline]);
      } catch (error) {
        const connect = !ac.signal.aborted && (error as { connect?: unknown } | null)?.connect === true;
        result = connect ? 'failed' : 'uncertain';
        diagnostic = ac.signal.aborted ? { kind: 'timeout' } : diagnostic ?? { kind: connect ? 'connect-failed' : 'transport', code: errorCode(error, token) };
      } finally { clearTimeout(timer); }
      const finished: Attempt = { ...started, status: result, ...(diagnostic ? { diagnostic } : {}) };
      try { save(file, { releaseId: release.releaseId, ...finished, attempts: [...history, finished] }, false); }
      catch { return report('state-error', diagnostic); }
      if (result === 'failed' && diagnostic?.kind === 'connect-failed' && attempt < maxAttempts) {
        history = [...history, finished];
        (o.log ?? console.log)(`tg-release: connect-retry: соединение не установлено; попытка ${attempt + 1}/${maxAttempts} через 1 с ${JSON.stringify(diagnostic)}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      return report(result, diagnostic);
    }
    return report('state-error'); // Цикл всегда заканчивается статусом последней попытки.
  } catch { return report('state-error'); }
  finally {
    if (locked) { try { unlinkSync(lock); syncDir(stateDir); } catch { /* Только свой lock; незавершённая запись уже запрещает повтор. */ } }
  }
}
