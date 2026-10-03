// Связь с Telegram в обход блокировки: адрес из DNS закрыт — запасной; рабочий запоминается; ошибка после соединения
// и обрыв по таймеру — не повод перебирать адреса.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TG_SPARE_IPS, makeTgFetch, type TgRequest } from '../server/tgnet.ts';

const URL_UPD = 'https://api.telegram.org/bot1:x/getUpdates';
const init = (): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const connectErr = (): Error => Object.assign(new Error('нет соединения'), { code: 'ETIMEDOUT', connect: true });

test('telegram: адрес из DNS закрыт — запасной; дальше сразу рабочий; закрыли и его — снова по списку', async () => {
  const tried: string[] = [];
  const closed = new Set(['10.9.9.9']);
  const request: TgRequest = async (_u, _i, ip) => {
    tried.push(ip);
    if (closed.has(ip)) throw connectErr();
    return new Response('{"ok":true,"result":[]}', { status: 200 });
  };
  const log: string[] = [];
  const f = makeTgFetch({ resolve: async () => ['10.9.9.9'], request, log: (s) => log.push(s) });
  assert.equal((await f(URL_UPD, init())).status, 200);
  assert.deepEqual(tried, ['10.9.9.9', TG_SPARE_IPS[0]]);
  assert.match(log[0], /запасной адрес/);
  tried.length = 0;
  await f(URL_UPD, init());
  assert.deepEqual(tried, [TG_SPARE_IPS[0]], 'рабочий адрес — первым');
  assert.equal(log.length, 1, 'тот же адрес — без новой строки в журнал');
  closed.add(TG_SPARE_IPS[0]);
  tried.length = 0;
  await f(URL_UPD, init());
  assert.deepEqual(tried, [TG_SPARE_IPS[0], '10.9.9.9', TG_SPARE_IPS[1]]);
  assert.equal(log.length, 2);
});

test('telegram: ошибка после соединения и обрыв по таймеру — сразу наверх; закрыто всё — последняя ошибка', async () => {
  let n = 0;
  const after = makeTgFetch({
    resolve: async () => ['10.9.9.9'],
    request: async () => {
      n++;
      throw Object.assign(new Error('обрыв'), { code: 'ECONNRESET' });
    },
  });
  await assert.rejects(after(URL_UPD, init()), /обрыв/);
  assert.equal(n, 1);

  const ac = new AbortController();
  n = 0;
  const aborted = makeTgFetch({
    resolve: async () => [],
    request: async () => {
      n++;
      ac.abort();
      throw connectErr();
    },
  });
  await assert.rejects(aborted(URL_UPD, { ...init(), signal: ac.signal }));
  assert.equal(n, 1);

  const tried: string[] = [];
  const none = makeTgFetch({
    resolve: async () => {
      throw new Error('нет DNS');
    },
    request: async (_u, _i, ip) => {
      tried.push(ip);
      throw connectErr();
    },
  });
  await assert.rejects(none(URL_UPD, init()), (e: { connect?: boolean }) => e.connect === true);
  assert.deepEqual(tried, [...TG_SPARE_IPS], 'без DNS — по запасным');
});
