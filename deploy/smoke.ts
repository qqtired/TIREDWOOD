// Проверка после выкладки: заходим в игру как настоящий клиент и ждём профиль, комнату и снимок мира.
// node deploy/smoke.ts [адрес WebSocket] [Origin] [токен проверки]
// Токен лежит в DATA_DIR/smoke-token (на сервере — /var/lib/game-opus/smoke-token). С ним сервер
// пускает «Проверку» без профиля: профили, жетоны и журнал входов не трогаются.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../shared/constants.ts';
import { MSG_SNAPSHOT } from '../shared/protocol.ts';
import { type ServerMsg } from '../shared/messages.ts';

const url = process.argv[2] || 'ws://127.0.0.1:5190/ws';
const origin = process.argv[3] || 'https://game.tired.solutions';
// Release automation reads the credential inside this process, never in shell arguments or logs.
let token = '';
try { token = (process.argv[4] === '--token-file' ? readFileSync(process.argv[5], 'utf8') : process.argv[4] ?? '').trim(); }
catch { console.error('ОШИБКА: недоступен файл проверки'); process.exit(1); }

if (!token) {
  console.log(`ОШИБКА: ${url} — нет токена проверки`);
  process.exit(1);
}

const ws = new WebSocket(url, { headers: { Origin: origin }, handshakeTimeout: 5000 });
let me = false;
let scene = false;
let done = false;

function finish(ok: boolean, text: string): void {
  if (done) return;
  done = true;
  clearTimeout(timer);
  console.log(`${ok ? 'ok' : 'ОШИБКА'}: ${url} — ${text}`);
  ws.close(1000);
  process.exitCode = ok ? 0 : 1;
  setTimeout(() => process.exit(), 200).unref();
}

const timer = setTimeout(() => finish(false, !me ? 'нет профиля' : !scene ? 'не пустило в комнату' : 'нет снимков мира'), 6000);

// Ключ устройства — случайный и без ника: если токен не подошёл, сервер ответит «нужен ник» и профиль не создаст
ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, key: randomBytes(16).toString('hex'), smoke: token })));
ws.on('message', (data, isBinary) => {
  if (!isBinary) {
    const m = JSON.parse(String(data)) as ServerMsg;
    if (m.t === 'me') me = true;
    else if (m.t === 'scene') scene = true;
    else if (m.t === 'error') finish(false, m.code === 'need_nick' ? 'токен проверки не подошёл' : m.text);
    return;
  }
  const buf = data as Buffer;
  if (me && scene && buf[0] === MSG_SNAPSHOT) finish(true, `профиль, комната и снимок мира (${buf.length} байт)`);
});
ws.on('unexpected-response', (_req, res) => finish(false, `HTTP ${res.statusCode}`));
ws.on('error', (e) => finish(false, e.message));
ws.on('close', (code) => finish(false, `соединение закрыто (${code})`));
