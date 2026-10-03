// Связь с api.telegram.org с нашего сервера. Адрес из DNS (149.154.166.110) хостинг не пропускает — блокировка Telegram
// в РФ, а другой адрес того же api.telegram.org открыт. Поэтому запрос идёт по списку адресов: сначала тот, что сработал
// последним, потом из DNS, потом запасные; не соединились за CONNECT_MS или соединение оборвали до TLS — следующий адрес.
// Имя в TLS (SNI) и проверка сертификата — как обычно, на api.telegram.org: чужой сервер вместо Telegram не подставить.
// Закроют и запасные — следующий шаг: свой релей на Cloudflare Workers, как у CarGuru (там deploy/telegram-relay).
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import type { TgFetch } from './tgfeed.ts';

export const TG_HOST = 'api.telegram.org';
/** Запасные адреса api.telegram.org: первым — открытый у нашего хостинга (проверено 2 октября 2026) */
export const TG_SPARE_IPS: readonly string[] = ['149.154.167.220', '149.154.166.110'];
/** Не соединились (TCP и TLS) за столько мс — следующий адрес */
export const CONNECT_MS = 5_000;
/** Ответ длиннее — обрываем: getUpdates на сотню сообщений много меньше */
const MAX_BODY = 4 << 20;

/** Один запрос по заданному адресу. Ошибка до TLS помечена connect: true — можно пробовать другой адрес. */
export type TgRequest = (url: URL, init: RequestInit, ip: string) => Promise<Response>;

export interface TgNetOptions {
  resolve?: (host: string) => Promise<string[]>;
  request?: TgRequest;
  /** Сменился рабочий адрес — строка в журнал */
  log?: (s: string) => void;
}

export function makeTgFetch(o: TgNetOptions = {}): TgFetch {
  const resolve = o.resolve ?? resolve4;
  const request = o.request ?? httpsRequest;
  let good = '';
  return async (url, init) => {
    const u = new URL(url);
    if (u.hostname !== TG_HOST) return fetch(url, init);
    const dns = await resolve(TG_HOST).catch(() => [] as string[]);
    const ips = [...new Set([good, ...dns, ...TG_SPARE_IPS])].filter(Boolean);
    let last: unknown = null;
    for (const ip of ips) {
      try {
        const res = await request(u, init, ip);
        if (ip !== good) o.log?.(`tg: до Telegram достаю через ${ip}${dns.includes(ip) ? '' : ' (запасной адрес: адрес из DNS закрыт)'}`);
        good = ip;
        return res;
      } catch (err) {
        if (init.signal?.aborted || (err as { connect?: unknown } | null)?.connect !== true) throw err;
        last = err;
        if (ip === good) good = '';
      }
    }
    throw last;
  };
}

async function resolve4(host: string): Promise<string[]> {
  return (await lookup(host, { all: true, family: 4 })).map((a) => a.address);
}

function httpsRequest(u: URL, init: RequestInit, ip: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    let connected = false;
    const fail = (err: Error): void => {
      clearTimeout(timer);
      if (!connected) Object.assign(err, { connect: true });
      reject(err);
    };
    const body = typeof init.body === 'string' ? init.body : undefined;
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
    if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));
    const req = https.request(
      {
        host: u.hostname,
        servername: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: init.method ?? 'GET',
        headers,
        signal: init.signal ?? undefined,
        agent: false,
        lookup: (_host, opts, cb) => (opts.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY) req.destroy(new Error('слишком длинный ответ'));
          else chunks.push(c);
        });
        res.on('error', fail);
        res.on('end', () => {
          const status = res.statusCode ?? 502;
          const ok = status >= 200 && status <= 599;
          const empty = status === 204 || status === 205 || status === 304;
          resolve(new Response(empty ? null : Buffer.concat(chunks), { status: ok ? status : 502, headers: { 'content-type': String(res.headers['content-type'] ?? '') } }));
        });
      },
    );
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('нет соединения'), { code: 'ETIMEDOUT' })), CONNECT_MS);
    timer.unref();
    req.on('socket', (s) =>
      s.once('secureConnect', () => {
        connected = true;
        clearTimeout(timer);
      }),
    );
    req.on('error', fail);
    req.end(body);
  });
}
