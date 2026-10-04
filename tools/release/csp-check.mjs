// Desktop acceptance of the production build under the site's CSP; no deployment.
// Start an isolated game server/CSP proxy and Chrome/CDP first (see csp-proxy.mjs).
// EXPECT_FORTRESS=1 EXPECT_FIGHT=1 EXPECT_FISH2=1 OUT=<temporary evidence directory>
//   CDP_PORT=9333 URL=http://localhost:5192/?debug node tools/release/csp-check.mjs
// All expected service flags are required: use 0 explicitly for a flags-off check.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const expected = {};
for (const [flag, env] of [['fortress', 'EXPECT_FORTRESS'], ['fight', 'EXPECT_FIGHT'], ['fish2', 'EXPECT_FISH2']]) {
  const value = process.env[env];
  if (value !== '0' && value !== '1') {
    console.error(`${env} must explicitly be 0 or 1`);
    process.exit(1);
  }
  expected[flag] = value === '1';
}

const CDP = Number(process.env.CDP_PORT ?? 9333);
const URL_ = process.env.URL ?? 'http://localhost:5192/?debug';
const OUT = path.resolve(process.env.OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'opus-csp-')));
fs.mkdirSync(OUT, { recursive: true });
const report = { ok: false, expected, desktop: null, csp: null, logs: [], failures: [] };
let tab;
let ws;
let id = 0;
const waits = new Map();

// A fresh browser may warn that audio awaits a gesture; errors mentioning AudioContext still fail.
function browserLog(level, text) {
  if (level !== 'error' && level !== 'warning') return;
  if (level === 'warning' && text.startsWith('The AudioContext was not allowed to start.') && text.includes('user gesture')) return;
  report.logs.push(`[${level}] ${text}`);
}

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => { waits.delete(i); reject(new Error(`CDP timeout: ${method}`)); }, 35_000);
    waits.set(i, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

async function ev(expression) {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text ?? 'Browser evaluation failed');
  return r.result?.result?.value;
}

async function shot() {
  const s = await call('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  fs.writeFileSync(path.join(OUT, 'lobby.jpg'), Buffer.from(s.result.data, 'base64'));
}

try {
  const response = await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`CDP HTTP ${response.status}`);
  tab = await response.json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 5000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('CDP connection failed')); };
  });
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    const pending = waits.get(m.id);
    if (pending) {
      clearTimeout(pending.timer);
      waits.delete(m.id);
      if (m.error) pending.reject(new Error(`${m.error.message ?? 'CDP command failed'}`));
      else pending.resolve(m);
    }
    if (m.method === 'Log.entryAdded') browserLog(m.params.entry.level, m.params.entry.text);
    if (m.method === 'Runtime.consoleAPICalled') browserLog(m.params.type, m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') browserLog('error', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  };
  ws.onclose = ws.onerror = () => {
    for (const pending of waits.values()) { clearTimeout(pending.timer); pending.reject(new Error('CDP connection closed')); }
    waits.clear();
  };
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ← ' + String(e.blockedURI).slice(0, 60)));`,
  });
  const navigation = await call('Page.navigate', { url: URL_ });
  if (navigation.result.errorText) throw new Error(`Navigation failed: ${navigation.result.errorText}`);

  report.desktop = await ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 100 && !window.__opus?.app; i++) await sleep(100);
    if (!window.__opus?.app) throw new Error('Game app missing');
    const a = __opus.app;
    for (let k = 0; k < 3 && __opus.state().screen === 'join'; k++) {
      const input = document.querySelector('input.name');
      if (input) input.value = 'Tester6';
      a.play();
      await sleep(2000);
    }
    for (let i = 0; i < 40 && !(__opus.state().screen === 'game' && __opus.state().scene === 'lobby'); i++) await sleep(250);
    a.input.locked = true;
    a.setPaused(false);
    await sleep(1000);
    const state = __opus.state();
    const lobby = a.active;
    const canvas = document.querySelector('#game');
    return {
      screen: state.screen, scene: state.scene, nick: state.nick, pos: state.pos, paused: state.paused,
      canvas: !!canvas && canvas.width > 0 && canvas.height > 0,
      build: [...document.scripts].map((s) => s.src.split('/').pop()).filter(Boolean),
      coins: [...document.querySelectorAll('img.coin')].map((image) => image.complete && image.naturalWidth > 0),
      // крепость: прежняя арка или (новое оформление площади, client/lobby/plaza) пришедший статус крепости
      flags: { fortress: !!(lobby?.fortGate || lobby?.fortSt), fight: !!lobby?.fcDoor, fish2: !!lobby?.fish2?.on },
    };
  })()`);
  const d = report.desktop;
  if (!d || d.screen !== 'game' || d.scene !== 'lobby' || d.paused || typeof d.nick !== 'string' || !d.nick.trim() || !Array.isArray(d.pos) || d.pos.length !== 3 || !d.pos.every(Number.isFinite)) report.failures.push('Primary desktop join/scene smoke failed');
  if (!d?.canvas || !Array.isArray(d.build) || !d.build.length) report.failures.push('Built app content/canvas missing');
  if (!Array.isArray(d?.coins) || !d.coins.length || !d.coins.every((loaded) => loaded === true)) report.failures.push('Primary coin images missing or failed');
  for (const flag of Object.keys(expected)) if (d?.flags?.[flag] !== expected[flag]) report.failures.push(`Wrong feature flag: ${flag} (expected ${expected[flag]})`);
  report.csp = await ev('window.__csp');
  if (!Array.isArray(report.csp) || report.csp.length) report.failures.push('CSP violations or missing CSP observer');
  await shot();
} catch (error) {
  report.failures.push(error.message);
} finally {
  if (ws) {
    try { await call('Page.navigate', { url: 'about:blank' }); } catch (error) { report.failures.push(error.message); }
    ws.close();
  }
  if (tab?.id) {
    try { await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`, { signal: AbortSignal.timeout(5000) }); } catch (error) { report.failures.push(`CDP cleanup failed: ${error.message}`); }
  }
  if (report.logs.length) report.failures.push('Browser errors/warnings recorded');
  report.ok = report.failures.length === 0;
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(report, null, 2));
  console.log('desktop:', JSON.stringify(report.desktop));
  console.log('CSP:', JSON.stringify(report.csp));
  console.log(report.logs.length ? report.logs.join('\n') : 'ошибок в консоли нет');
  console.log('evidence:', OUT);
  if (!report.ok) { console.error(report.failures.join('\n')); process.exitCode = 1; }
}
