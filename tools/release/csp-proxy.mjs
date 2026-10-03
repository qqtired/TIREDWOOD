// Проверка боевой сборки под той же CSP, что отдаёт nginx на game.tired.solutions.
// Прокси добавляет заголовок CSP и пропускает WebSocket. Запуск (сервер игры уже слушает 5191):
//   node tools/release/csp-proxy.mjs            → http://localhost:5192 → 127.0.0.1:5191
// Сам сервер: npm run build && PORT=5191 DATA_DIR=<временная папка> ALLOWED_ORIGINS=http://localhost:5192 node server/main.ts
import http from 'node:http';
import net from 'node:net';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss://game.tired.solutions; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const T = { host: '127.0.0.1', port: Number(process.env.TARGET_PORT ?? 5191) };
const LISTEN = Number(process.env.PROXY_PORT ?? 5192);

const srv = http.createServer((req, res) => {
  const p = http.request({ ...T, method: req.method, path: req.url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, { ...r.headers, 'content-security-policy': CSP, 'x-frame-options': 'DENY' });
    r.pipe(res);
  });
  p.on('error', () => res.writeHead(502).end());
  req.pipe(p);
});
srv.on('upgrade', (req, sock, head) => {
  const up = net.connect(T.port, T.host, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head.length) up.write(head);
    sock.pipe(up).pipe(sock);
  });
  up.on('error', () => sock.destroy());
  sock.on('error', () => up.destroy());
});
srv.listen(LISTEN, '127.0.0.1', () => console.log(`csp proxy: http://localhost:${LISTEN} → ${T.host}:${T.port}`));
