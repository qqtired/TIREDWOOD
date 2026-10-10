// «Подземелье»: крошечный статический сервер для локального просмотра страницы.
// Запуск: node tools/survivors/page/serve.mjs   -> http://localhost:3103/
// Порт можно сменить: PORT=3110 node tools/survivors/page/serve.mjs
// index.html хранится без <!doctype>/<html>/<head>/<body> (как для Artifact), сервер добавляет оболочку.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/survivors/page');
const PORT = Number(process.env.PORT || 3103);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};
const HEAD = '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>';
const TAIL = '</body></html>';

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end('403'); return; }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404'); return; }
    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'no-store' };
    if (p === '/index.html') {
      const body = HEAD + (await readFile(file, 'utf8')) + TAIL;
      res.writeHead(200, { ...headers, 'content-length': Buffer.byteLength(body) });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(200, { ...headers, 'content-length': st.size });
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('500 ' + e.message);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Подземелье: http://localhost:${PORT}/  (папка ${ROOT})`));
