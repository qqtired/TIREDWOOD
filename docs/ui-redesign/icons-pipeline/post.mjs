// Usage:
//   node post.mjs process <outDir> <id>=<origPath> ...      -> <outDir>/<id>.webp (+ stats json on stdout)
//   node post.mjs sheet <outDir> <sheetPath> [ids...]       -> contact sheet from <outDir>/<id>.webp
//   node post.mjs preview <previewPath> <label>=<webpOrPng> ... -> quick review strip (cream bg)
// Own headless Chrome (own profile, debug port 9491); killed by own PID at the end.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9491;
const FILE_PORT = 9492;
const [mode, ...rest] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// file server for inputs (any absolute path via ?p=)
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.searchParams.get('p');
  if (!p || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': p.endsWith('.webp') ? 'image/webp' : 'image/png' });
  createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(FILE_PORT, '127.0.0.1', r));

const prof = mkdtempSync(join(tmpdir(), 'ui-icons-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
let ws; let id = 0; const wait = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => { const n = ++id; wait.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json();
      const pg = list.find((t) => t.type === 'page');
      if (pg) {
        ws = new WebSocket(pg.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (m) => { const j = JSON.parse(m.data); const w = wait.get(j.id); if (w) { wait.delete(j.id); j.error ? w.rej(new Error(j.error.message)) : w.res(j.result); } };
        return;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome did not start');
}

const PAGE_LIB = `
window.U = {
  async load(path) {
    const r = await fetch('http://127.0.0.1:${FILE_PORT}/?p=' + encodeURIComponent(path));
    if (!r.ok) throw new Error('fetch ' + path + ' ' + r.status);
    return await createImageBitmap(await r.blob());
  },
  // full pipeline: clean alpha, crop alpha>24, fit 240 into 256 canvas
  async process(path) {
    const bmp = await U.load(path);
    const W = bmp.width, H = bmp.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    const im = x.getImageData(0, 0, W, H); const d = im.data;
    let minX = W, minY = H, maxX = -1, maxY = -1, semi = 0, opaque = 0, borderOpaque = 0, borderN = 0;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const i = (y * W + xx) * 4; let a = d[i + 3];
      if (a <= 6) a = 0; else if (a >= 248) a = 255;
      d[i + 3] = a;
      if (a > 24) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      if (a === 255) opaque++; else if (a > 0) semi++;
      if (xx < 3 || yy(y, H)) { borderN++; if (a > 24) borderOpaque++; }
    }
    function yy(y, H) { return y < 3 || y >= H - 3; }
    // also right edge
    for (let y = 0; y < H; y++) for (let xx = W - 3; xx < W; xx++) { borderN++; if (d[(y * W + xx) * 4 + 3] > 24) borderOpaque++; }
    x.putImageData(im, 0, 0);
    if (maxX < 0) throw new Error('empty image');
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    // crop
    let cur = document.createElement('canvas'); cur.width = cw; cur.height = ch;
    cur.getContext('2d').drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
    const scale = 240 / Math.max(cw, ch);
    let tw = Math.round(cw * scale), th = Math.round(ch * scale);
    // stepwise halving
    while (cur.width / 2 > tw && cur.height / 2 > th) {
      const n = document.createElement('canvas'); n.width = Math.round(cur.width / 2); n.height = Math.round(cur.height / 2);
      const nx = n.getContext('2d'); nx.imageSmoothingEnabled = true; nx.imageSmoothingQuality = 'high';
      nx.drawImage(cur, 0, 0, n.width, n.height); cur = n;
    }
    const out = document.createElement('canvas'); out.width = 256; out.height = 256;
    const ox = out.getContext('2d'); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
    ox.drawImage(cur, 0, 0, cur.width, cur.height, Math.round((256 - tw) / 2), Math.round((256 - th) / 2), tw, th);
    const url = out.toDataURL('image/webp', 0.82);
    return { url, stats: { W, H, bbox: [minX, minY, maxX, maxY], fill: +(Math.max(cw, ch) / W).toFixed(2), semiPct: +(100 * semi / (W * H)).toFixed(1), opaquePct: +(100 * opaque / (W * H)).toFixed(1), borderOpaquePct: +(100 * borderOpaque / borderN).toFixed(1) } };
  },
};
`;

try {
  await connect();
  await send('Runtime.enable');
  await ev(PAGE_LIB);
  if (mode === 'process') {
    const [outDir, ...specs] = rest;
    for (const s of specs) {
      const [iid, path] = s.split('=');
      const r = await ev(`U.process(${JSON.stringify(path)})`);
      const buf = Buffer.from(r.url.split(',')[1], 'base64');
      writeFileSync(join(outDir, `${iid}.webp`), buf);
      console.log(JSON.stringify({ id: iid, kb: +(buf.length / 1024).toFixed(1), ...r.stats }));
    }
  } else if (mode === 'preview') {
    // review strip: each item at 256 on cream, label from filename
    const [outPath, ...items] = rest; // items: label=path
    const data = await ev(`(async () => {
      const items = ${JSON.stringify(items)};
      const cols = Math.min(4, items.length), rows = Math.ceil(items.length / cols), S = 300;
      const c = document.createElement('canvas'); c.width = cols * S; c.height = rows * (S + 22);
      const x = c.getContext('2d'); x.fillStyle = '#fbf3e0'; x.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < items.length; i++) {
        const [label, path] = items[i].split('=');
        const bmp = await U.load(path);
        const cx = (i % cols) * S, cy = Math.floor(i / cols) * (S + 22);
        x.imageSmoothingQuality = 'high';
        const sc = Math.min((S - 8) / bmp.width, (S - 8) / bmp.height);
        x.drawImage(bmp, cx + (S - bmp.width * sc) / 2, cy + (S - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
        x.fillStyle = '#3b2a1a'; x.font = 'bold 15px monospace'; x.fillText(label, cx + 6, cy + S + 14);
      }
      return c.toDataURL('image/png');
    })()`);
    writeFileSync(outPath, Buffer.from(data.split(',')[1], 'base64'));
  } else if (mode === 'sheet') {
    const [outDir, sheetPath, ...ids0] = rest;
    const ids = ids0.length ? ids0 : readdirSync(outDir).filter((f) => f.endsWith('.webp')).map((f) => f.replace('.webp', ''));
    const data = await ev(`(async () => {
      const ids = ${JSON.stringify(ids)}; const dir = ${JSON.stringify(outDir)};
      const cols = 8, CW = 196, CH = 178, pad = 14;
      const rows = Math.ceil(ids.length / cols);
      const c = document.createElement('canvas'); c.width = cols * CW + pad * 2; c.height = rows * CH + pad * 2;
      const x = c.getContext('2d'); x.fillStyle = '#efe3c2'; x.fillRect(0, 0, c.width, c.height);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      for (let i = 0; i < ids.length; i++) {
        const cx = pad + (i % cols) * CW, cy = pad + Math.floor(i / cols) * CH;
        x.fillStyle = '#fffaec'; x.strokeStyle = '#d9c79a'; x.lineWidth = 2;
        x.beginPath(); x.roundRect(cx + 3, cy + 3, CW - 6, CH - 6, 12); x.fill(); x.stroke();
        const bmp = await U.load(dir + '/' + ids[i] + '.webp');
        x.drawImage(bmp, cx + 6, cy + 8, 128, 128);
        x.drawImage(bmp, cx + 140, cy + 14, 48, 48);
        x.fillStyle = '#3b2a1a'; x.font = 'bold 15px monospace'; x.textAlign = 'center';
        x.fillText(ids[i], cx + CW / 2, cy + CH - 16);
        x.fillStyle = '#8a7650'; x.font = '11px monospace'; x.fillText((i + 1) + '', cx + 170, cy + 80);
        x.textAlign = 'left';
      }
      window.__sheet = c.toDataURL('image/png').split(',')[1];
      return window.__sheet.length;
    })()`);
    // big sheets (100+ icons) do not fit one CDP reply: read the base64 in 1 MB slices
    let b64 = '';
    for (let o = 0; o < data; o += 1 << 20) b64 += await ev(`window.__sheet.slice(${o}, ${o + (1 << 20)})`);
    writeFileSync(sheetPath, Buffer.from(b64, 'base64'));
  }
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  server.close();
  await sleep(300);
  process.exit(0);
}
