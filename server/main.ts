// Точка входа сервера: HTTP (в разработке — Vite, в бою — готовая сборка из dist/),
// WebSocket на /ws, хаб с комнатами (набережная, пейнтбол) и игровой цикл 60 тиков в секунду.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { TICK_MS } from '../shared/constants.ts';
import { fightEnabled } from './fight/room.ts';
import { fortEnabled } from './fort/room.ts';
import { Hub, closeReason, type Sink } from './hub.ts';
import { fish2Enabled } from './lobby/fishing2.ts';
import { weatherMode } from './lobby/weather.ts';
import { eventFlag } from './lobby/events.ts';
import { boatRaceEnabled } from './boatrace/room.ts';
import { hideEnabled } from '../shared/hide.ts';
import { Profiles } from './profiles.ts';
import { MsgBudget, PULSE_MS, Pulse } from './pulse.ts';
import { Store } from './store.ts';
import { TgFeed } from './tgfeed.ts';
import { voiceConfigFromEnv } from './voice-config.ts';
import { DEVIL_GIFT_CODE_HASH } from './gift-config.ts';
import { parseClientJson, sendServerBinary, sendServerJson } from './voice-wire.ts';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT ?? 5190);
const HOST = process.env.HOST ?? '127.0.0.1';
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
/** Профили, банк джекпота, копии и токен проверки. На сервере — /var/lib/game-opus (StateDirectory). */
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR ?? 'data');

mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
const store = new Store(DATA_DIR);
store.load();
const profiles = new Profiles(store);
const build = DEV ? 'dev' : buildId();
// DEV_RIG=777 — автоматы всегда дают три семёрки, чтобы посмотреть джекпот (только в разработке)
const roll = DEV && process.env.DEV_RIG === '777' ? () => 63 : undefined;
// DEV_WEATHER=rain / clear / cycle — дождь всегда, никогда или по 45 с (только в разработке)
const weather = DEV ? weatherMode(process.env.DEV_WEATHER) : 'auto';
// Экран с чатом друзей из Telegram на крыше склада: токен бота владелец кладёт в DATA_DIR/tg-token (deploy/set-tg-token.sh)
const tg = new TgFeed({ dir: DATA_DIR });
// «Крепость» до «да» владельца скрыта: FORTRESS=1 — включить, FORTRESS=0 — выключить, без переменной — только с --dev
const fort = fortEnabled(process.env.FORTRESS, DEV);
// «Fight Club» до «да» владельца тоже скрыт: FIGHT=1 — включить, FIGHT=0 — выключить, без переменной — только с --dev
const fight = fightEnabled(process.env.FIGHT, DEV);
const skill = process.env.SKILL === undefined ? DEV : process.env.SKILL === '1';
const storm = eventFlag(process.env.STORM, DEV), pirates = eventFlag(process.env.PIRATES, DEV);
const boatrace = boatRaceEnabled(process.env.BOATRACE, DEV);
const hide = hideEnabled(process.env.HIDE, DEV);
const voice = process.env.VOICE === undefined ? DEV : process.env.VOICE === '1';
const voiceIce = voice ? voiceConfigFromEnv(process.env) : undefined;
const gifts = process.env.GIFTS === undefined ? DEV : process.env.GIFTS === '1';
// Рыбалка 2.0 (шкала вываживания, 32 вида, доска у мостков): FISH2=1 — включить, без переменной — старая рыбалка
const fish2 = fish2Enabled(process.env.FISH2);
const hub = new Hub({ store, profiles, smokeToken: smokeToken(), build, roll, weather, tg, fort, fight, skill, boatrace, hide, fish2, storm, pirates, voice, voiceIce,
  giftCodeHash: gifts ? DEVIL_GIFT_CODE_HASH : null,
  devStorm: DEV && process.env.DEV_STORM === 'now', devPirates: DEV && process.env.DEV_PIRATES === 'now', devFort: DEV });
tg.start();
if (roll) console.log('DEV_RIG=777: автоматы подкручены на джекпот');
if (weather !== 'auto') console.log(`DEV_WEATHER=${weather}: погода на набережной не своя`);
if (fort) console.log('FORTRESS: режим «Крепость» включён');
if (fight) console.log('FIGHT: режим «Fight Club» включён');
if (skill) console.log('SKILL: полоса «Выше облаков» включена');
if (fish2) console.log('FISH2: рыбалка 2.0 включена');
if (voice) console.log('VOICE: голос по удержанию V включён');
if (gifts) console.log('GIFTS: подарочные коды включены');
console.log(`Профилей: ${profiles.count}, банк джекпота: ${Math.floor(store.state.jackpot)}`);

/** Токен для проверки после выкладки (deploy/smoke.ts): создаётся один раз, файл только для владельца. */
function smokeToken(): string {
  const file = path.join(DATA_DIR, 'smoke-token');
  try {
    const t = readFileSync(file, 'utf8').trim();
    if (t.length >= 32) return t;
  } catch {
    // файла нет — создадим
  }
  const t = randomBytes(32).toString('hex');
  writeFileSync(file, `${t}\n`, { mode: 0o600 });
  return t;
}

/** Номер сборки клиента: сменился — открытые вкладки перезагрузятся после переподключения. */
function buildId(): string {
  try {
    return createHash('sha256').update(readFileSync(path.join(DIST, 'index.html'))).digest('hex').slice(0, 12);
  } catch {
    return 'nobuild';
  }
}

const server = http.createServer();

// ------------------------------------------------------------ HTTP

type Middleware = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;
let viteMiddleware: Middleware | null = null;
if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server }, watch: { ignored: ['**/data/**'] } },
  });
  viteMiddleware = vite.middlewares as unknown as Middleware;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

let stepMs = 0;

server.on('request', (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, ...hub.health(), stepMs: Math.round(stepMs * 1000) / 1000 }));
    return;
  }
  if (viteMiddleware) {
    viteMiddleware(req, res, () => {
      res.statusCode = 404;
      res.end('not found');
    });
    return;
  }
  void serveStatic(url.pathname, res).catch(() => {
    // Do not log a caller's URL or let an unexpected async response failure terminate the game process.
    console.error('HTTP: static response failed');
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Internal server error');
    else res.destroy();
  });
});

async function serveStatic(pathname: string, res: http.ServerResponse): Promise<void> {
  let rel: string;
  try { rel = decodeURIComponent(pathname); }
  catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('Bad request');
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(DIST, 'index.html');
  }
  try {
    const st = await stat(file);
    const ext = path.extname(file);
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': st.size,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Сборки нет: запусти npm run build');
  }
}

// ------------------------------------------------------------ WebSocket

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 16 * 1024 });

function originAllowed(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin);
    if (o.host === req.headers.host) return true;
    if (EXTRA_ORIGINS.includes(origin)) return true;
    if (DEV && (o.hostname === 'localhost' || o.hostname === '127.0.0.1' || o.hostname === '[::1]')) return true;
  } catch {
    return false;
  }
  return false;
}

/** Адрес игрока для ограничений частоты. За nginx — из X-Real-IP, но только если соединение пришло с этой же машины. */
function clientIp(req: http.IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? '';
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (!loopback) return remote;
  const h = req.headers['x-real-ip'];
  const v = Array.isArray(h) ? h[0] : h;
  return typeof v === 'string' && v.length <= 64 ? v.trim() : '';
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://local');
  if (url.pathname !== '/ws') {
    // в разработке остальные апгрейды — это HMR Vite, он обработает сам
    if (!DEV) socket.destroy();
    return;
  }
  if (!originAllowed(req) || stopping) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  const ip = clientIp(req);
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
});

interface ConnMeta {
  pulse: Pulse;
  /** Почему сервер сам закрыл соединение — для журнала; пусто — закрыл клиент или оборвалась связь */
  why: string;
}
const conns = new Map<WebSocket, ConnMeta>();

function onConnection(ws: WebSocket, ip: string): void {
  const meta: ConnMeta = { pulse: new Pulse(performance.now()), why: '' };
  const sink: Sink = {
    sendBinary(data) {
      sendServerBinary(ws, data, () => { if (!meta.why) meta.why = 'переполнена исходящая очередь'; });
    },
    sendJson(msg) {
      sendServerJson(ws, msg, voice, () => { if (!meta.why) meta.why = 'переполнена исходящая очередь'; });
    },
    close(code, reason) {
      if (!meta.why) meta.why = closeReason(code, reason);
      ws.close(code, reason);
    },
  };
  const client = hub.connect(sink, ip);
  conns.set(ws, meta);
  const budget = new MsgBudget(performance.now());

  ws.on('message', (data, isBinary) => {
    const now = performance.now();
    meta.pulse.alive(now);
    if (!budget.take(now)) {
      if (!meta.why) meta.why = 'флуд: слишком много сообщений';
      ws.close(1008, 'flood');
      return;
    }
    if (isBinary) {
      hub.onBinary(client, data as Buffer);
      return;
    }
    const text = data.toString();
    const msg = parseClientJson(text, voice);
    if (msg === null) return;
    hub.onJson(client, msg);
    startLoop();
  });

  ws.on('pong', (data) => {
    const rtt = meta.pulse.pong(performance.now(), data.toString());
    if (rtt !== null) client.ping = client.ping ? client.ping * 0.7 + rtt * 0.3 : rtt;
  });

  ws.on('close', (code, reason) => {
    conns.delete(ws);
    hub.disconnect(client, meta.why || closeReason(code, reason.toString()));
  });
  ws.on('error', (e) => {
    if (!meta.why) meta.why = `ошибка сокета: ${String(e.message).slice(0, 80)}`;
    ws.terminate();
  });
}

// Пульс: заодно меряем пинг; кто молчит три пульса подряд — отключаем (см. pulse.ts)
setInterval(() => {
  const now = performance.now();
  for (const [ws, meta] of conns) {
    const seq = meta.pulse.beat(now);
    if (seq === null) {
      if (!meta.why) meta.why = `нет ответа ${meta.pulse.silentS(now)} с`;
      ws.terminate();
      continue;
    }
    ws.ping(String(seq));
  }
}, PULSE_MS).unref();

// ------------------------------------------------------------ игровой цикл

let running = false;
let startTime = 0;
let done = 0;

function startLoop(): void {
  if (running || !hub.active) return;
  running = true;
  startTime = performance.now();
  done = 0;
  setTimeout(loop, 0);
}

function loop(): void {
  if (!hub.active) {
    // никого нет — не тратим процессор
    running = false;
    return;
  }
  const now = performance.now();
  const due = Math.floor((now - startTime) / TICK_MS);
  let n = 0;
  while (done < due && n < 4) {
    const t0 = performance.now();
    hub.step();
    const dt = performance.now() - t0;
    stepMs = stepMs * 0.95 + dt * 0.05;
    done++;
    n++;
  }
  if (due - done > 8) done = due; // сильно отстали (сервер тормозил) — не догоняем рывком
  const next = startTime + (done + 1) * TICK_MS;
  setTimeout(loop, Math.max(0, next - performance.now()));
}

server.listen(PORT, HOST, () => {
  const where = HOST === '0.0.0.0' ? `http://localhost:${PORT} (и по IP в локальной сети)` : `http://${HOST}:${PORT}`;
  console.log(`Game Opus ${DEV ? '[разработка]' : `[сборка ${build}]`} → ${where}`);
});

// ------------------------------------------------------------ завершение

let stopping = false;

/** Перезапуск: игроков предупреждаем, профили сохраняем, соединения закрываем с кодом 1012 (клиент переподключится). */
function shutdown(): void {
  if (stopping) return;
  stopping = true;
  tg.stop();
  hub.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 800).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
