// Свой headless Chrome для группы farm: порт отладки 9484, свой профиль, закрытие только по своему PID.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
export const W = '/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/lead-work';
export const LOCK = '/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/chrome.lock';
const DBG = 9480;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pid = 0;
export async function lock() {
  for (let i = 0; i < 40; i++) {
    try { mkdirSync(LOCK); return; } catch { console.log('lock busy, wait 30s'); await sleep(30000); }
  }
  throw new Error('lock timeout');
}
export function unlock() { try { rmdirSync(LOCK); } catch {} }
export async function launch(w = 1440, h = 900) {
  const prof = mkdtempSync(join(W, 'prof-'));
  const c = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, `--window-size=${w},${h}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  c.unref();
  pid = c.pid;
  writeFileSync(join(W, 'chrome.pid'), String(pid));
  return pid;
}
export function kill() { if (pid) { try { process.kill(pid); } catch {} } }
let ws, id = 0;
const wait = new Map();
export const logs = [];
export async function connect(w = 1440, h = 900) {
  let list;
  for (let i = 0; i < 60; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); if (list.some((t) => t.type === 'page')) break; } catch {}
    await sleep(200);
  }
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { const x = wait.get(m.id); wait.delete(m.id); m.error ? x.rej(new Error(m.error.message)) : x.res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').split('\n')[0]);
    else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push('CON ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('LOG ' + m.params.entry.text + ' ' + (m.params.entry.url ?? ''));
  });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
}
export function send(method, params = {}) { return new Promise((res, rej) => { const n = ++id; wait.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); }); }
export async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr.slice(0, 100)}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}
export async function nav(url) { await send('Page.navigate', { url }); await sleep(400); for (let i = 0; i < 50; i++) { if ((await ev('document.readyState')) === 'complete') break; await sleep(100); } }
export async function shot(file, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 }, captureBeyondViewport: true } : {}) });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
}
