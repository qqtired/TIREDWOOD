import { PackError } from '../../../shared/quiz/pack.ts';
import { QZ_PACK } from '../../../shared/quiz/types.ts';

const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const libraryError = () => new PackError('Библиотека не отдала пак', 502);
export const quizFetchTimeout = () => new PackError('Библиотека не ответила — попробуй ещё раз', 504);

function allowed(raw: string, base?: URL): URL {
  let url: URL;
  try { url = new URL(raw, base); } catch { throw new PackError('Нужна ссылка на пак из библиотеки SIGame'); }
  if (url.protocol !== 'https:' || url.username || url.password
    || !QZ_PACK.FETCH_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new PackError('Можно только паки из библиотеки SIGame');
  }
  return url;
}

/** Не буферизуем .siq; лимит проверяется по фактическим (в том числе распакованным fetch) байтам. */
async function* chunks(response: Response, signal: AbortSignal, metadata = false): AsyncGenerator<Uint8Array> {
  const limit = metadata ? QZ_PACK.JSON_BYTES : QZ_PACK.FETCH_BYTES;
  const tooBig = () => metadata ? libraryError() : new PackError('Пак больше 100 МБ', 413);
  const reader = response.body?.getReader();
  if (!reader) return;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (Number(response.headers.get('content-length')) > limit) throw tooBig();
    let size = 0;
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw tooBig();
      yield value;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}

/** Ссылка → API (для GUID) → поток .siq. Один срок и не больше трёх переходов на весь путь.
 *  fetch внедряется для тестов; наружу не уходят билет, заголовки или cookies игрока. */
export async function* fetchQuizPack(raw: string, fetcher: typeof fetch = globalThis.fetch,
  signal: AbortSignal = AbortSignal.timeout(QZ_PACK.FETCH_MS)): AsyncGenerator<Uint8Array> {
  const stop = new AbortController(), requestSignal = AbortSignal.any([signal, stop.signal]);
  let redirects = 0;
  const request = async (start: URL): Promise<Response> => {
    let url = start;
    while (true) {
      requestSignal.throwIfAborted();
      const response = await fetcher(url, { redirect: 'manual', credentials: 'omit', signal: requestSignal });
      if (REDIRECTS.has(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location) throw libraryError();
        url = allowed(location, url);
        if (++redirects > 3) throw libraryError();
      } else {
        if (!response.ok) { await response.body?.cancel(); throw libraryError(); }
        if (Number(response.headers.get('content-length')) > QZ_PACK.FETCH_BYTES) {
          await response.body?.cancel(); throw new PackError('Пак больше 100 МБ', 413);
        }
        return response;
      }
    }
  };
  try {
    let url = allowed(raw);
    const guid = url.href.match(GUID)?.[0];
    if (guid) {
      const response = await request(allowed(QZ_PACK.FETCH_API + guid));
      const body: Uint8Array[] = [];
      for await (const chunk of chunks(response, requestSignal, true)) body.push(chunk);
      let metadata: unknown;
      try { metadata = JSON.parse(Buffer.concat(body).toString('utf8')); } catch { throw libraryError(); }
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw libraryError();
      const data = metadata as Record<string, unknown>;
      const uri = typeof data.directContentUri === 'string' && data.directContentUri ? data.directContentUri : data.contentUri;
      if (typeof uri !== 'string' || !uri) throw libraryError();
      url = allowed(uri);
    } else if (!url.pathname.toLowerCase().endsWith('.siq')) {
      throw new PackError('Нужна ссылка на пак из библиотеки SIGame');
    }
    yield* chunks(await request(url), requestSignal);
  } catch (e) {
    if (signal.aborted || e instanceof Error && e.name === 'TimeoutError') throw quizFetchTimeout();
    if (e instanceof PackError) throw e;
    throw libraryError();
  } finally { stop.abort(); }
}
