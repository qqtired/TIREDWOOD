// Одно уведомление о проверенном релизе: существующий бот/чат, без фоновой очереди и повторов sendMessage.
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHAT_FILE, TOKEN_FILE, type TgFetch } from './tgfeed.ts';
import { makeTgFetch } from './tgnet.ts';

export const RELEASE_STATE_DIR = 'tg-releases';
export interface ReleaseNotes { releaseId: string; notes: string }
export type ReleaseStatus = 'sent' | 'already-sent' | 'already-attempted' | 'not-verified' | 'invalid-notes'
  | 'unconfigured' | 'failed' | 'uncertain' | 'state-error';
export interface ReleaseOptions {
  dir: string;
  release: ReleaseNotes;
  smokePassed: boolean;
  activeReleaseId: string;
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
};

function syncDir(dir: string): void {
  const fd = openSync(dir, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function save(file: string, releaseId: string, status: string, exclusive: boolean): void {
  const target = exclusive ? file : `${file}.tmp`;
  const fd = openSync(target, exclusive ? 'wx' : 'w', 0o600);
  try {
    writeFileSync(fd, JSON.stringify({ releaseId, status, at: new Date().toISOString() }) + '\n');
    fsyncSync(fd);
  } finally { closeSync(fd); }
  if (!exclusive) renameSync(target, file);
  syncDir(path.dirname(file));
}

/** До отправки сохраняем попытку. Даже после обрыва процесса/ответа обычный повтор не создаст дубль. */
export async function announceRelease(o: ReleaseOptions): Promise<ReleaseStatus> {
  const report = (status: ReleaseStatus): ReleaseStatus => {
    // Только фиксированные статусы: ошибки транспорта могут содержать URL с токеном.
    (o.log ?? console.log)(`tg-release: ${status}: ${statusText[status]}`);
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
  try {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    syncDir(o.dir);
    save(file, release.releaseId, 'attempted', true);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return report('state-error');
    try {
      const state = JSON.parse(readFileSync(file, 'utf8')) as { releaseId?: unknown; status?: unknown };
      if (state.releaseId === release.releaseId && state.status === 'sent') return report('already-sent');
    } catch { /* Неясный старый статус тоже не даёт права повторять отправку. */ }
    return report('already-attempted');
  }

  let result: ReleaseStatus;
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
      const reply = await response.json() as { ok?: unknown; result?: { message_id?: unknown } };
      if (response.ok && reply?.ok === true && Number.isSafeInteger(reply.result?.message_id)) return 'sent';
      return reply?.ok === false && response.status >= 400 && response.status < 500 ? 'failed' : 'uncertain';
    };
    result = await Promise.race([send(), deadline]);
  } catch (error) {
    result = !ac.signal.aborted && (error as { connect?: unknown } | null)?.connect === true ? 'failed' : 'uncertain';
  } finally { clearTimeout(timer); }
  try { save(file, release.releaseId, result, false); }
  catch { return report('state-error'); }
  return report(result);
}
