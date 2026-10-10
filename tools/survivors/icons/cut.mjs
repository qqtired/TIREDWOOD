// «Подземелье»: режет листы Codex на иконки, кодирует WebP и собирает контактный лист.
// Запуск: node tools/survivors/icons/cut.mjs            — все листы → client/assets/dungeon/icons/*.webp + контактный лист
//         node tools/survivors/icons/cut.mjs --preview <файл-листа без .png>  — только просмотр одного листа (в папку --out)
// Как режет: фон листа ровный белый → маска «не фон» (расстояние до цвета фона по краям листа) → связные области →
// каждая крупная область — медальон, его клетка сетки — по центру. Круг медальона = центр рамки области и меньшая
// из её сторон (тень или торчащий кусок удлиняют только одну). Квадрат вокруг круга уменьшается до SIZE px,
// снаружи круга — прозрачность (сглаженный край, отступ INSET px внутрь, чтобы не тянуть белую кромку).
// Кодирование WebP и подписи контактного листа — canvas в headless Chrome (playwright chrome-headless-shell),
// ничего не рисуется заново: только обрезка, масштаб и маска.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHEETS } from './sheets.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = ROOT + 'docs/survivors/art/icons-src/';
const OUT = ROOT + 'client/assets/dungeon/icons/';
const SHEET_PNG = ROOT + 'docs/survivors/art/icons-sheet.png';
const SIZE = 192;
const QUALITY = 0.82;
const INSET = 0.012; // доля диаметра, срезаемая с края круга

/** Какой файл листа брать (имя в icons-src без .png). По умолчанию — имя листа. */
const SHEET_FILE = {};
/** Отдельные иконки из перегенерированных листов той же раскладки: 'weapon-spark': 'weapons-b' */
const PICK = { 'weapon-fireflies': 'fix', 'weapon-stalactites': 'fix', 'ui-wave': 'fix', 'evo-fireflies_evo': 'fix' };

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const preview = opt('--preview');
const extraOut = opt('--out');

const CHROME = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell');

async function startChrome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-icons-chrome-'));
  const proc = spawn(CHROME, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//); if (m) res(m[1]); });
    proc.on('exit', () => rej(new Error('chrome вышел: ' + buf)));
  });
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res) => ws.addEventListener('open', res, { once: true }));
  let id = 0;
  const wait = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 800));
    return r.result.result.value;
  };
  const stop = () => { try { ws.close(); } catch {} proc.kill('SIGKILL'); };
  return { evaluate, stop };
}

// --- код, который выполняется в странице
const PAGE = String.raw`
window.loadImg = async (url) => { const im = new Image(); im.src = url; await im.decode(); return im; };
window.cutSheet = async (url, cols, rows, size, quality, inset) => {
  const im = await loadImg(url);
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;
  // фон — медиана краёв листа
  const edge = [[], [], []];
  for (let x = 0; x < W; x += 4) for (const y of [1, H - 2]) { const i = (y * W + x) * 4; edge[0].push(px[i]); edge[1].push(px[i + 1]); edge[2].push(px[i + 2]); }
  for (let y = 0; y < H; y += 4) for (const x of [1, W - 2]) { const i = (y * W + x) * 4; edge[0].push(px[i]); edge[1].push(px[i + 1]); edge[2].push(px[i + 2]); }
  const bg = edge.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  // image_gen часто сам отдаёт прозрачный фон: тогда маска — по альфе, иначе — по расстоянию до цвета фона
  let clear = 0; for (const [x, y] of [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2], [W >> 1, 1], [W >> 1, H - 2]]) if (px[(y * W + x) * 4 + 3] < 20) clear++;
  const byAlpha = clear >= 4;
  if (byAlpha) bg.push('прозрачный');
  const T = 60 * 60;
  const mask = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) {
    if (byAlpha) { mask[i] = px[j + 3] > 160 ? 1 : 0; continue; }
    const dr = px[j] - bg[0], dg = px[j + 1] - bg[1], db = px[j + 2] - bg[2]; mask[i] = dr * dr + dg * dg + db * db > T ? 1 : 0;
  }
  // связные области (4-связность)
  const lab = new Int32Array(W * H); const comps = []; const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = comps.length + 1; let sp = 0; stack[sp++] = s; lab[s] = id;
    let area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (sp) { const p = stack[--sp]; area++; const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
      if (y < H - 1 && mask[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; } }
    comps.push({ area, x0, y0, x1, y1 });
  }
  const cw = W / cols, ch = H / rows, cmin = Math.min(cw, ch);
  const cells = new Array(cols * rows).fill(null);
  for (const k of comps) {
    if (k.area < 0.15 * cmin * cmin) continue;
    const cx = (k.x0 + k.x1) / 2, cy = (k.y0 + k.y1) / 2;
    const idx = Math.min(rows - 1, Math.floor(cy / ch)) * cols + Math.min(cols - 1, Math.floor(cx / cw));
    if (!cells[idx] || cells[idx].area < k.area) cells[idx] = k;
  }
  const out = [];
  for (let idx = 0; idx < cells.length; idx++) {
    const k = cells[idx]; if (!k) { out.push(null); continue; }
    const w = k.x1 - k.x0 + 1, h = k.y1 - k.y0 + 1, d = Math.min(w, h);
    // по длинной стороне центр берём по «ядру»: середина отрезка, где ширина области близка к диаметру
    let cx = (k.x0 + k.x1 + 1) / 2, cy = (k.y0 + k.y1 + 1) / 2;
    if (h - w > 2) { cy = k.y0 + d / 2; const alt = k.y1 + 1 - d / 2; const run = (y) => { let n = 0; for (let x = k.x0; x <= k.x1; x++) n += mask[Math.round(y) * W + x]; return n; }; if (run(alt) > run(cy)) cy = alt; }
    if (w - h > 2) { cx = k.x0 + d / 2; const alt = k.x1 + 1 - d / 2; const run = (x) => { let n = 0; for (let y = k.y0; y <= k.y1; y++) n += mask[y * W + Math.round(x)]; return n; }; if (run(alt) > run(cx)) cx = alt; }
    const t = document.createElement('canvas'); t.width = size; t.height = size;
    const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
    // уменьшение в два шага, чтобы не было зубцов
    const mid = document.createElement('canvas'); mid.width = mid.height = size * 2;
    const mg = mid.getContext('2d'); mg.imageSmoothingQuality = 'high';
    mg.drawImage(c, cx - d / 2, cy - d / 2, d, d, 0, 0, size * 2, size * 2);
    tg.drawImage(mid, 0, 0, size, size);
    tg.globalCompositeOperation = 'destination-in';
    tg.beginPath(); tg.arc(size / 2, size / 2, size / 2 * (1 - inset * 2), 0, Math.PI * 2); tg.fill();
    out.push({ webp: t.toDataURL('image/webp', quality), w, h, warn: Math.abs(w - h) > d * 0.03 });
  }
  return { W, H, bg, found: cells.filter(Boolean).length, out };
};
// контактный лист: иконка 128 px и она же 48 px, подпись id снизу
window.contact = async (items, cols) => {
  const TW = 200, TH = 196, PAD = 24;
  const rows = Math.ceil(items.length / cols);
  const c = document.createElement('canvas'); c.width = cols * TW + PAD * 2; c.height = rows * TH + PAD * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#231a16'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; const x = PAD + (i % cols) * TW, y = PAD + Math.floor(i / cols) * TH;
    const im = await loadImg(it.url);
    g.drawImage(im, x + 8, y + 6, 128, 128);
    g.drawImage(im, x + 142, y + 86, 48, 48);
    g.fillStyle = '#e8d9c0'; g.font = '600 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(it.label, x + TW / 2, y + 146, TW - 8);
    if (it.note) { g.fillStyle = '#c79a5a'; g.font = '12px system-ui, sans-serif'; g.fillText(it.note, x + TW / 2, y + 166, TW - 8); }
  }
  return c.toDataURL('image/png');
};
'ok'`;

/** Раскладка листа по имени файла: «weapons», «weapons-b» → лист weapons */
const sheetOf = (base) => SHEETS.find((s) => base === s.name) ?? SHEETS.find((s) => base.startsWith(s.name + '-'));
const dataUrl = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
const fromData = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');

const chrome = await startChrome();
try {
  await chrome.evaluate(PAGE);
  const cache = new Map();
  async function cutFile(base, sheet) {
    if (cache.has(base)) return cache.get(base);
    const file = SRC + base + '.png';
    if (!fs.existsSync(file)) throw new Error('нет листа ' + file);
    const r = await chrome.evaluate(`cutSheet(${JSON.stringify(dataUrl(file))}, ${sheet.cols}, ${sheet.rows}, ${SIZE}, ${QUALITY}, ${INSET})`);
    const want = sheet.items.filter(Boolean).length;
    console.log(`${base}: ${r.W}×${r.H}, фон ${r.bg.join(',')}, медальонов ${r.found} из ${want}`);
    cache.set(base, r);
    return r;
  }

  if (preview) {
    const sheet = sheetOf(preview);
    const r = await cutFile(preview, sheet);
    const items = sheet.items.map((it, i) => it && r.out[i] ? { url: r.out[i].webp, label: `${it[0]}-${it[1]}`, note: r.out[i].warn ? `рамка ${r.out[i].w}×${r.out[i].h}` : '' } : null).filter(Boolean);
    const png = await chrome.evaluate(`contact(${JSON.stringify(items)}, ${Math.min(6, items.length)})`);
    const dst = path.join(extraOut ?? os.tmpdir(), `preview-${preview}.png`);
    fs.writeFileSync(dst, fromData(png));
    console.log('просмотр:', dst);
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    const items = [];
    let total = 0;
    const missing = [];
    for (const main of SHEETS.filter((s) => !s.fix)) {
      for (const it of main.items) {
        if (!it) continue;
        const key = `${it[0]}-${it[1]}`;
        const base = PICK[key] ?? SHEET_FILE[main.name] ?? main.name;
        const sheet = sheetOf(base);
        const i = sheet.items.findIndex((x) => x && x[0] === it[0] && x[1] === it[1]);
        let r;
        try { r = await cutFile(base, sheet); } catch (e) { missing.push(key); continue; }
        const o = r.out[i];
        if (!o) { missing.push(key); continue; }
        const buf = fromData(o.webp);
        fs.writeFileSync(OUT + key + '.webp', buf);
        total += buf.length;
        items.push({ url: o.webp, label: key, note: base === main.name ? '' : `из листа ${base}` });
      }
    }
    const png = await chrome.evaluate(`contact(${JSON.stringify(items)}, 9)`);
    fs.writeFileSync(SHEET_PNG, fromData(png));
    if (extraOut) fs.copyFileSync(SHEET_PNG, path.join(extraOut, 'icons-sheet.png'));
    console.log(`иконок ${items.length}, всего ${(total / 1024).toFixed(0)} КБ; контактный лист ${SHEET_PNG}`);
    if (missing.length) console.log('нет:', missing.join(', '));
  }
} finally {
  chrome.stop();
}
process.exit(0);
