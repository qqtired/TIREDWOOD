// Снимки пола «Подземелья» на стенде (headless Chrome, 1440 × 900) и замер отрисовок/FPS.
//   node tools/survivors/floor/shots.mjs <метка> <папка снимков> [порт сервера=3127] [порт отладки=9363]
// Нужен запущенный сервер разработки (npm run dev с PORT=3127). Свой Chrome: свой профиль, свой порт отладки;
// закрывается Browser.close (или по своему PID), чужие браузеры не трогает.
// Снимки: по одному на биом, одна граница биомов, угол склейки тора, толпа 300 вокруг героя (dgStand.crowd). Замер — в <метка>-info.json.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const TAG = process.argv[2] ?? 'after';
const OUT = resolve(process.argv[3] ?? '.');
const PORT = Number(process.argv[4] ?? 3127);
const DBG = Number(process.argv[5] ?? 9363);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

/** Открытые места каждого биома, одна граница (погреба | грибы) и угол склейки тора (x = 240, z = 240) */
const SPOTS = [
  ['cellars', 132, 104],
  ['mushrooms', 40, 100],
  ['crystals', 158, 76],
  ['mine', 150, 206],
  ['jam', 26, 212],
  ['border', 80, 100],
  ['join', 238, 236],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'dg-floor-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${DBG}`,
  `--user-data-dir=${prof}`,
  '--window-size=1440,900',
  '--use-angle=metal',
  '--ignore-gpu-blocklist',
  '--enable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required',
  'about:blank',
], { stdio: 'ignore' });

let ws;
let id = 0;
const wait = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const n = ++id;
    wait.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  const f = join(OUT, `${TAG}-${name}.jpg`);
  writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('снимок', f);
}
/** FPS и средние отрисовки за ms */
const measure = (ms) =>
  ev(`new Promise((done) => {
    const t0 = performance.now(); let n = 0; let calls = 0; let tris = 0; let worst = 0; let last = t0;
    const f = () => {
      const now = performance.now(); worst = Math.max(worst, now - last); last = now; n++;
      const i = dgStand.info(); calls += i.calls; tris += i.triangles;
      if (now - t0 < ${ms}) requestAnimationFrame(f);
      else { const i2 = dgStand.info(); done({ fps: +(n * 1000 / (now - t0)).toFixed(1), worstMs: +worst.toFixed(1), calls: Math.round(calls / n), tris: Math.round(tris / n), programs: i2.programs, textures: i2.memory.textures, geometries: i2.memory.geometries, cpuMs: i2.cpuMs }); }
    };
    requestAnimationFrame(f);
  })`);

const info = { tag: TAG };
try {
  let list;
  for (let i = 0; i < 50; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json();
      if (list.some((t) => t.type === 'page')) break;
    } catch {}
    await sleep(200);
  }
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) {
      const w = wait.get(m.id);
      wait.delete(m.id);
      if (m.error) w.rej(new Error(m.error.message));
      else w.res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') console.log('ошибка страницы:', m.params.exceptionDetails?.exception?.description?.split('\n')[0]);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/survivors/stand/?seed=777` });
  // ждём карту и забег
  for (let i = 0; i < 240; i++) {
    await sleep(500);
    const ok = await ev(`!!(window.dgStand && dgStand.scene.game && dgStand.scene.game.run && dgStand.scene.game.run.sim)`).catch(() => false);
    if (ok) break;
  }
  info.gpu = await ev(`(() => { const gl = dgStand.scene.game ? document.querySelector('canvas').getContext('webgl2') : null; const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })()`);
  await sleep(3000);
  // герой бессмертен, мобы волны не мешают снимкам пола
  await ev(`(() => { dgStand.level(0); const s = dgStand.scene.game.run.sim; s.hero.hp = s.hero.hpMax = 1e7; s.mobs.length = 0; return true; })()`);
  info.spawn = await measure(4000);
  console.log('у колодца', JSON.stringify(info.spawn));
  for (const [name, x, z] of SPOTS) {
    await ev(`(() => { const s = dgStand.scene.game.run.sim; s.hero.x = ${x}; s.hero.z = ${z}; s.mobs.length = 0; return true; })()`);
    await sleep(1800);
    await ev(`(() => { dgStand.scene.game.run.sim.mobs.length = 0; return true; })()`);
    await sleep(400);
    await shot(name);
  }
  // толпа 300 у колодца
  await ev(`(() => { const s = dgStand.scene.game.run.sim; s.hero.x = 132; s.hero.z = 104; s.mobs.length = 0; return true; })()`);
  await sleep(1500);
  await ev(`(dgStand.crowd(300), true)`);
  await sleep(2500);
  await shot('crowd300');
  info.crowd300 = await measure(5000);
  console.log('толпа 300', JSON.stringify(info.crowd300));
  info.mobs = await ev(`dgStand.scene.game.run.sim.mobs.length`);
  writeFileSync(join(OUT, `${TAG}-info.json`), JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info));
  await send('Browser.close').catch(() => {});
} catch (e) {
  console.error(e);
} finally {
  await sleep(500);
  if (chrome.exitCode === null) chrome.kill();
}
