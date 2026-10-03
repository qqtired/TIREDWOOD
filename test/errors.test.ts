// Ошибки из браузеров игроков → журнал сервера: ограничения, очистка текста, очередь на клиенте.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErrorReport, browserName, stackHead, type ErrMsg } from '../client/errors.ts';
import { cleanLog } from '../server/hub.ts';
import { connect, login, setupHub } from './kit.ts';

const STACK = `TypeError: Cannot read properties of undefined (reading 'x')
    at KartView.update (https://game.tired.solutions/assets/index-abc.js?v=2:1:2345)
    at RaceMatch.frame (https://game.tired.solutions/assets/index-abc.js:1:999)
    at App.frame (https://game.tired.solutions/assets/index-abc.js:1:100)
    at a (x.js:1:1)
    at b (x.js:1:2)`;

test('ошибка игрока — одной строкой в журнал: кто, где, браузер, место и начало стека', () => {
  const lines: string[] = [];
  const { hub } = setupHub({ log: (s) => lines.push(s) });
  const a = login(hub, 'Свошник');
  lines.length = 0;
  hub.onJson(a.c, {
    t: 'err', m: "Cannot read properties of undefined (reading 'x')\nвторая строка", at: 'https://game.tired.solutions/assets/index-abc.js?token=секрет:1:2345',
    st: stackHead(STACK), sc: 'race', ua: 'Chrome 154, macOS',
  });
  assert.equal(lines.length, 1);
  assert.equal(
    lines[0],
    `[ошибка у игрока] Свошник (#${a.c.pid}, race, Chrome 154, macOS): Cannot read properties of undefined (reading 'x') вторая строка` +
      ' @ /assets/index-abc.js:1:2345 | at KartView.update (/assets/index-abc.js:1:2345) ← at RaceMatch.frame (/assets/index-abc.js:1:999)' +
      ' ← at App.frame (/assets/index-abc.js:1:100) ← at a (x.js:1:1)',
  );
  assert.ok(!lines[0].includes('секрет'));
});

test('ошибки игрока: не больше 20 с соединения и 30 в минуту с адреса, мусор — мимо', () => {
  const lines: string[] = [];
  const { hub, clock } = setupHub({ log: (s) => lines.push(s) });
  const a = login(hub, 'Шумный', undefined, '10.0.0.7');
  lines.length = 0;
  for (let i = 0; i < 25; i++) hub.onJson(a.c, { t: 'err', m: `ошибка ${i}` });
  assert.equal(lines.length, 20, 'с одного соединения');
  const b = login(hub, 'Сосед', undefined, '10.0.0.7');
  lines.length = 0;
  for (let i = 0; i < 20; i++) hub.onJson(b.c, { t: 'err', m: `ошибка ${i}` });
  assert.equal(lines.length, 10, 'с одного адреса — 30 в минуту');
  clock.now += 61_000;
  lines.length = 0;
  hub.onJson(b.c, { t: 'err', m: 'через минуту' });
  hub.onJson(b.c, { t: 'err', m: 42 as unknown as string });
  hub.onJson(b.c, { t: 'err', m: '   ' });
  assert.equal(lines.length, 1);
});

test('ошибка до входа (игра не запустилась): пишется с ником на устройстве', () => {
  const lines: string[] = [];
  const { hub } = setupHub({ log: (s) => lines.push(s) });
  const { c } = connect(hub, '10.0.0.9');
  hub.onJson(c, { t: 'err', m: 'не запустилось: WebGL 2 недоступен', sc: 'start', ua: 'Safari 17, iOS', n: 'Свошник' });
  assert.deepEqual(lines, ['[ошибка у игрока] до входа (start, Safari 17, iOS, ник на устройстве «Свошник»): не запустилось: WebGL 2 недоступен']);
  assert.equal(c.profile, null);
});

test('очистка текста для журнала', () => {
  assert.equal(cleanLog('a\u0000b\r\nc d', 50), 'a b c d');
  assert.equal(cleanLog('see http://127.0.0.1:5190/x.js?k=1#h:3:4 ok', 50), 'see /x.js:3:4 ok');
  assert.equal(cleanLog('x'.repeat(500), 10), 'x'.repeat(10));
  assert.equal(cleanLog(null, 10), '');
});

function reporter(sent: ErrMsg[], online = { v: false }): ErrorReport {
  const r = new ErrorReport();
  r.ua = 'Chrome 154, macOS';
  r.scene = () => 'lobby';
  r.send = (m) => {
    if (!online.v) return false;
    sent.push(m);
    return true;
  };
  return r;
}

test('клиент: до входа ошибки ждут, одинаковых — до 5, всего — до 20, шум расширений — мимо', () => {
  const sent: ErrMsg[] = [];
  const online = { v: false };
  const r = reporter(sent, online);
  r.add('boom', '/assets/a.js:1:2', STACK);
  r.add('boom', '/assets/a.js:1:2', STACK);
  r.add('bad', 'chrome-extension://abc/x.js:1:1', '');
  r.add('ResizeObserver loop completed with undelivered notifications.', '', '');
  assert.equal(sent.length, 0);
  assert.equal(r.pending, 2);
  online.v = true;
  r.flush();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], {
    t: 'err', m: 'boom', at: '/assets/a.js:1:2', st: stackHead(STACK), sc: 'lobby', ua: 'Chrome 154, macOS',
  });
  for (let i = 0; i < 10; i++) r.add('boom', '', '');
  assert.equal(sent.length, 5, 'одинаковых — до 5');
  for (let i = 0; i < 30; i++) r.add(`ошибка ${i}`, '', '');
  assert.equal(sent.length, 20, 'всего — до 20');
});

test('клиент: начало стека и имя браузера', () => {
  assert.equal(stackHead(STACK).split(' ← ').length, 4);
  assert.ok(stackHead(STACK).startsWith('at KartView.update'));
  assert.equal(stackHead('render@https://x/a.js:1:2\nloop@https://x/a.js:3:4'), 'render@https://x/a.js:1:2 ← loop@https://x/a.js:3:4');
  const ua = {
    chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0',
    yandex: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 YaBrowser/25.6.0.0 Safari/537.36',
  };
  assert.equal(browserName(ua.chromeMac), 'Chrome 154, macOS');
  assert.equal(browserName(ua.safariIos), 'Safari 17, iOS');
  assert.equal(browserName(ua.edgeWin), 'Edge 150, Windows');
  assert.equal(browserName(ua.firefoxAndroid), 'Firefox 140, Android');
  assert.equal(browserName(ua.yandex), 'Яндекс 25, Windows');
});
