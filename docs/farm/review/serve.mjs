#!/usr/bin/env node
/**
 * Минимальный статический сервер для страницы-обзора «Ферма».
 *
 * Запуск (из любой папки):
 *   node docs/farm/review/serve.mjs            → http://localhost:3104/docs/farm/review/
 *   PORT=4000 node docs/farm/review/serve.mjs  → другой порт
 *
 * Корень сервера — корень репозитория, поэтому glb, png и документы грузятся по относительным путям
 * (../../../client/assets/farm/models/…). Слушает только 127.0.0.1 (HOST=0.0.0.0, чтобы открыть в локальной сети).
 * Файлы с точкой в пути (.git, .env) и папки data/, ssh/, node_modules не отдаются. Только GET и HEAD.
 * Перед открытием обновите данные: node docs/farm/review/build.mjs
 */
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, extname, resolve, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.ROOT || join(HERE, '../../..'));
const PORT = Number(process.env.PORT) || 3104;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const BLOCK = ['data', 'ssh', 'node_modules', 'backups'];

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname === '/') {
    res.writeHead(302, { Location: '/docs/farm/review/' }).end();
    return;
  }
  const parts = normalize(pathname).split(sep).filter(Boolean);
  if (parts.some((p) => p.startsWith('.') || p === '..') || BLOCK.includes(parts[0])) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let file = join(ROOT, ...parts);
  if (!file.startsWith(ROOT + sep) && file !== ROOT) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    let st = existsSync(file) ? statSync(file) : null;
    if (st?.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: pathname + '/' }).end();
        return;
      }
      file = join(file, 'index.html');
      st = existsSync(file) ? statSync(file) : null;
    }
    if (!st || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found: ' + pathname);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Server error: ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Ферма · обзор: http://localhost:${PORT}/docs/farm/review/   (корень ${ROOT})`);
});
