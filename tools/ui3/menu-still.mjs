// Первая загрузка (вход 3.0, docs/ui3/entry.md): застывший первый кадр меню — камера client/lobby/menucam.ts в момент 0.
// Снимок экрана headless Chrome на 2560×1440 зависает, поэтому кадр берём прямо с канваса WebGL сразу после отрисовки.
// Нужны запущенная игра с флагами сайта (PLAZA3=1 QUIZ=1 UI3=1 …) и headless Chrome с --remote-debugging-port (CHROME, 9564).
//   W=2560 H=1440 node tools/ui3/menu-still.mjs http://127.0.0.1:<порт>/ client/assets/loading/hd/menu.webp client/assets/loading/hd/menu-lqip.txt
// Потом строку из menu-lqip.txt — в index.html (#startup::before), источник — в client/assets/loading/hd/PROVENANCE-hd.md.
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME ?? '9564';
const W = +(process.env.W ?? 2560), H = +(process.env.H ?? 1440);
const [url, outWebp, outLqip] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${CHROME}`;
const ver = await (await fetch(`${base}/json/version`)).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r, j) => { bws.onopen = r; bws.onerror = j; });
let id = 0;
const wait = new Map();
const on = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
bws.onmessage = on;
const call = (ws, method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ctx = (await call(bws, 'Target.createBrowserContext', { disposeOnDetach: true })).result.browserContextId;
const tid = (await call(bws, 'Target.createTarget', { url: 'about:blank', browserContextId: ctx })).result.targetId;
const ws = new WebSocket(`ws://127.0.0.1:${CHROME}/devtools/page/${tid}`);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = on;
await call(ws, 'Runtime.enable');
await call(ws, 'Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const ev = async (js) => {
  const r = await call(ws, 'Runtime.evaluate', { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval');
  return r.result?.result?.value;
};
await call(ws, 'Page.navigate', { url });
for (const end = Date.now() + 60000; Date.now() < end; await sleep(200)) {
  let ok = false;
  try { ok = await ev('return !!window.__opus?.app?.lobby && __opus.app.screen === "join" && !!document.querySelector(".en-v3")'); } catch { /* грузится */ }
  if (ok) break;
}
await sleep(7000);
const info = await ev(`
  const gl = __opus.app.renderer.gl;
  const orig = gl.render;
  window.__copy = null;
  __opus.app.lobby.time = 0;
  gl.render = function (s, c) {
    orig.call(gl, s, c);
    if (!window.__copy && gl.getRenderTarget() === null) {
      const cv = document.createElement('canvas'); cv.width = gl.domElement.width; cv.height = gl.domElement.height;
      cv.getContext('2d').drawImage(gl.domElement, 0, 0);
      window.__copy = cv; gl.render = orig;
    }
  };
  for (let i = 0; i < 100 && !window.__copy; i++) await new Promise((r) => setTimeout(r, 50));
  return JSON.stringify({ w: window.__copy?.width, h: window.__copy?.height, t: __opus.app.lobby.time });`);
console.log('кадр', info);
const pick = async (expr) => (await ev(`return ${expr}`)).split(',')[1];
writeFileSync(outWebp, Buffer.from(await pick(`window.__copy.toDataURL('image/webp', 0.8)`), 'base64'));
const lqip = await ev(`const b = await createImageBitmap(window.__copy, { resizeWidth: 48, resizeHeight: 27, resizeQuality: 'high' });
  const t = document.createElement('canvas'); t.width = 48; t.height = 27; t.getContext('2d').drawImage(b, 0, 0);
  return t.toDataURL('image/webp', 0.5);`);
writeFileSync(outLqip, lqip);
console.log(outWebp, lqip.length, 'знаков lqip');
await call(bws, 'Target.disposeBrowserContext', { browserContextId: ctx });
process.exit(0);
