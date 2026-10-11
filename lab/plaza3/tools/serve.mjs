#!/usr/bin/env node
// Маленький статический сервер для проверки страницы обзора: node lab/plaza3/tools/serve.mjs [порт]
// Отдаёт папку lab/ (чтобы работали и обзор /plaza3/, и аркада /plaza3/arcade/). Без зависимостей, только node:http.
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url))); // lab/
const PORT = Number(process.argv[2] || process.env.PORT || 3118);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

const server = http.createServer((req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  let file = normalize(join(ROOT, path));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
  let st;
  try {
    st = statSync(file);
    if (st.isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { Location: path + '/' }).end(); return; }
      file = join(file, 'index.html');
      st = statSync(file);
    }
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('не найдено'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});
server.listen(PORT, '127.0.0.1', () => console.log(`lab/ на порту ${PORT}: /plaza3/  (pid ${process.pid})`));
