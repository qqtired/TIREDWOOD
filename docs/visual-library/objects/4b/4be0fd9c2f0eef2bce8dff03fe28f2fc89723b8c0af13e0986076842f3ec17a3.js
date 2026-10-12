// Прототип мини-игры «Набери лейку» по разделу 7 документа. Числа берутся из data.minigame, физика приближённая.
import { h, nf, seg } from './lib.js';

const W = 820;
const H = 520;
const BY = 126; // высота центра ведра

export function mountMinigame(container, data) {
  const M = data.minigame;
  const cfg = {
    tiltUp: M.tiltUpSec, tiltDown: M.tiltDownSec, shift: M.shiftPct / 100, mouth: M.mouthPct / 100, amp: M.amplitudePct / 100,
    dur: M.durationSec, empty: M.emptySec, release: M.releaseSec, close: M.closeAfterSec, pMin: M.periodMin, pMax: M.periodMax, sets: M.waterSets, regenMin: M.waterMin,
  };
  const BUCKET_WATER = 1.35; // ведро всегда полнее лейки (раздел 7)
  let level = 0; // 0..2 — заряды 10 / 20 / 50
  let sets = cfg.sets;
  let regenAt = null;
  let carry = 0; // дробная часть зарядов копится

  const canvas = h('canvas', { width: W, height: H, 'aria-label': 'Мини-игра: набери лейку' });
  const ctx = canvas.getContext('2d');
  const tag = h('div.mg-tag', '0 % · 0/10 💧');
  const over = h('div.mg-over', { hidden: true });
  const wrap = h('div.mg-wrap', { style: 'max-width:820px;margin:0 auto' }, canvas, tag, over);
  const drops = h('div.drops');
  const waterInfo = h('div.small.muted');
  const stats = h('div.small.muted');
  const levelSeg = seg(M.charges.map((c, i) => ({ value: i, label: `Лейка ${i + 1}: ${c} зарядов` })), 0, (v) => { level = v; if (g.phase === 'ready') updateTag(0); });
  const hint = h('div.callout.gold', { style: 'max-width:820px;margin:12px auto 0' }, h('b.t', 'Как играть'), h('span', 'Двигай мышь над корытом: ведро едет вслед. Зажми левую кнопку: ведро наклоняется, струя толще и уходит правее. Лей в горлышко лейки внизу: оно качается. Лить сильно значит целиться левее горлышка.'));

  const g = {
    phase: 'ready', t: 0, x: W / 2, tilt: 0, down: false, bucket: BUCKET_WATER, fill: 0, started: false, released: 0, canPhase: Math.random() * 6.28, period: cfg.pMin + Math.random() * (cfg.pMax - cfg.pMin), seed: Math.random() * 100, parts: [], endAt: 0, hitTime: 0, pourTime: 0,
  };
  const mouthPos = (t) => {
    const w = 2 * Math.PI / g.period;
    return W / 2 + cfg.amp * W * Math.sin(w * t + g.canPhase) + Math.sin(t * 9.1 + g.seed) * 3 + Math.sin(t * 5.3) * 2;
  };

  function reset() {
    Object.assign(g, { phase: 'ready', t: 0, tilt: 0, bucket: BUCKET_WATER, fill: 0, started: false, released: 0, canPhase: Math.random() * 6.28, period: cfg.pMin + Math.random() * (cfg.pMax - cfg.pMin), seed: Math.random() * 100, parts: [], hitTime: 0, pourTime: 0 });
    over.hidden = true;
    updateTag(0);
  }
  function updateDrops() {
    drops.replaceChildren(...Array.from({ length: cfg.sets }, (_, i) => h('i' + (i < sets ? '' : '.off'))));
    waterInfo.textContent = sets > 0 ? `Наборов воды: ${sets} из ${cfg.sets}. Новый набор в игре приходит раз в ${cfg.regenMin} минут и копится офлайн.` : `Колодец набирается: следующее ведро через ${cfg.regenMin}:00. Здесь можно вернуть наборы кнопкой.`;
  }
  function updateTag(fill) {
    const max = M.charges[level];
    tag.textContent = `${Math.round(fill * 100)} % · ${Math.floor(fill * max + 1e-9)}/${max} 💧`;
  }

  function finish(reason) {
    if (g.phase !== 'play') return;
    g.phase = 'done';
    g.endAt = g.t;
    const max = M.charges[level];
    const exact = g.fill * max + carry;
    const whole = Math.floor(exact + 1e-9);
    carry = exact - whole;
    const pct = Math.round(g.fill * 100);
    stats.textContent = `Последний результат: ${pct} %, получено ${whole} из ${max}, в запасе дробная часть ${nf(carry, 2)}.`;
    over.replaceChildren(h('div.box',
      h('div.eyebrow', { style: 'margin:0' }, { time: 'вышло время налива', empty: 'ведро опустело', release: 'отпустил ЛКМ слишком надолго', full: 'лейка полна' }[reason] || ''),
      h('h3', { style: 'margin:.1rem 0 .3rem;font-size:1.6rem' }, g.fill >= 0.995 ? 'Полная лейка!' : `${pct} %`),
      h('div', { style: 'font-size:1.15rem;font-weight:600' }, `+${whole} из ${max} зарядов 💧`),
      h('div.small.muted', { style: 'margin:.4rem 0 .8rem' }, `Дробная часть ${nf(carry, 2)} копится на следующий раз. В игре окно закроется само через ${cfg.close} с.`),
      h('button.btn.primary', { type: 'button', onclick: () => { if (sets > 0) reset(); else reset(); } }, 'Ещё раз')));
    over.hidden = false;
  }

  function step(dt) {
    if (g.phase === 'ready' || g.phase === 'play' || g.phase === 'done') g.t += dt;
    // наклон
    if (g.phase !== 'done') {
      g.tilt = g.down ? Math.min(1, g.tilt + dt / cfg.tiltUp) : Math.max(0, g.tilt - dt / cfg.tiltDown);
    } else g.tilt = Math.max(0, g.tilt - dt / cfg.tiltDown);
    if (g.phase === 'ready' && g.down && sets > 0) { g.phase = 'play'; g.started = true; g.playStart = g.t; sets--; updateDrops(); }
    if (g.phase === 'ready' && g.down && sets <= 0) { /* нет воды: ничего не происходит */ }
    if (g.phase === 'play') {
      const flow = g.tilt * (BUCKET_WATER / cfg.empty);
      const x = g.x + g.tilt * cfg.shift * W;
      const mouthW = cfg.mouth * W;
      const m = mouthPos(g.t);
      const streamW = 4 + g.tilt * 26;
      const use = Math.min(flow * dt, g.bucket);
      g.bucket -= use;
      const hit = Math.abs(x - m) < mouthW / 2 + streamW / 4 && g.tilt > 0.05;
      if (hit) { g.fill = Math.min(1, g.fill + use); g.hitTime += dt; }
      if (g.tilt > 0.05 && Math.random() < dt * 60) g.parts.push({ x: hit ? x + (Math.random() - 0.5) * 10 : x + (Math.random() - 0.5) * streamW, y: hit ? 392 : 470, vx: (Math.random() - 0.5) * (hit ? 60 : 110), vy: -(hit ? 40 : 80) * Math.random(), life: 0.5 });
      if (g.tilt > 0.05) g.released = 0; else g.released += dt;
      updateTag(g.fill);
      if (g.fill >= 1) finish('full');
      else if (g.bucket <= 1e-4) finish('empty');
      else if (g.t - g.playStart >= cfg.dur) finish('time');
      else if (g.released > cfg.release) finish('release');
    }
    for (const p of g.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; }
    g.parts = g.parts.filter((p) => p.life > 0);
  }

  // ───── рисование ─────
  const roundRect = (x, y, w, hh, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); };
  function draw() {
    const m = mouthPos(g.t);
    // фон: небо и камень колодца
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#dff0f4'); sky.addColorStop(0.55, '#f8ecd0'); sky.addColorStop(1, '#e2cc9c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c9bda5';
    for (let i = 0; i < 9; i++) { roundRect(i * 100 - 20 + (i % 2) * 30, 330, 110, 58, 10); ctx.fill(); }
    ctx.fillStyle = '#b6a98f'; ctx.fillRect(0, 380, W, 140);
    // корыто
    ctx.fillStyle = '#8a5a2b'; roundRect(40, 420, W - 80, 70, 16); ctx.fill();
    ctx.fillStyle = '#6fa3b4'; roundRect(56, 428, W - 112, 30, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; roundRect(70, 433, W - 280, 6, 3); ctx.fill();
    // лейка на качающейся доске
    const mouthW = cfg.mouth * W;
    const sway = Math.sin(((2 * Math.PI) / g.period) * g.t + g.canPhase);
    ctx.save();
    ctx.translate(m, 430);
    ctx.rotate(-sway * 0.06);
    ctx.fillStyle = '#a77a45'; roundRect(-mouthW / 2 - 40, 30, mouthW + 80, 12, 6); ctx.fill();
    // корпус лейки
    ctx.fillStyle = '#5f8f9f'; roundRect(-mouthW / 2 - 18, -40, mouthW + 36, 74, 18); ctx.fill();
    ctx.fillStyle = '#7fb3c4'; roundRect(-mouthW / 2 - 10, -34, 14, 60, 7); ctx.fill();
    // вода в лейке
    const lvl = 62 * g.fill;
    ctx.fillStyle = '#9fd7ec'; roundRect(-mouthW / 2 - 12, 28 - lvl, mouthW + 24, Math.max(0, lvl), 8); ctx.fill();
    // горлышко
    ctx.fillStyle = '#2f5766'; roundRect(-mouthW / 2, -46, mouthW, 12, 6); ctx.fill();
    ctx.fillStyle = '#244755'; roundRect(-mouthW / 2 + 5, -43, mouthW - 10, 6, 3); ctx.fill();
    // ручка и носик
    ctx.strokeStyle = '#4b7a8b'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(mouthW / 2 + 18, -2, 24, -1.2, 1.2); ctx.stroke();
    ctx.restore();
    // ведро
    const ang = g.tilt * (Math.PI / 2);
    ctx.save();
    ctx.translate(g.x, BY);
    ctx.rotate(ang * 0.98);
    ctx.fillStyle = '#9a6a38';
    ctx.beginPath(); ctx.moveTo(-34, -42); ctx.lineTo(34, -42); ctx.lineTo(26, 36); ctx.lineTo(-26, 36); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a4522'; ctx.fillRect(-36, -44, 72, 7); ctx.fillRect(-30, -4, 60, 6);
    const lv = 70 * (g.bucket / BUCKET_WATER);
    ctx.fillStyle = '#8ecde6'; ctx.fillRect(-28, -38 + (70 - lv) * 0.55, 56, Math.max(0, lv * 0.7));
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -42, 30, Math.PI, 0); ctx.stroke();
    // варежка
    ctx.fillStyle = '#f4c34d'; ctx.beginPath(); ctx.arc(0, -70, 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // струя
    if (g.tilt > 0.05 && (g.phase === 'play' || g.phase === 'ready')) {
      const sx = g.x + g.tilt * cfg.shift * W;
      const wd = 4 + g.tilt * 26;
      const fromX = g.x + Math.sin(ang) * 30; const fromY = BY + (1 - Math.cos(ang)) * 10 + 20 * g.tilt;
      const endY = 392;
      ctx.fillStyle = 'rgba(142, 205, 230, 0.9)';
      ctx.beginPath();
      ctx.moveTo(fromX - wd / 4, fromY);
      ctx.bezierCurveTo(fromX + (sx - fromX) * 0.2 - wd / 3, fromY + 80, sx - wd / 2, endY - 120, sx - wd / 2, endY);
      ctx.lineTo(sx + wd / 2, endY);
      ctx.bezierCurveTo(sx + wd / 2, endY - 120, fromX + (sx - fromX) * 0.2 + wd / 3, fromY + 80, fromX + wd / 4, fromY);
      ctx.fill();
    }
    // брызги
    for (const p of g.parts) { ctx.fillStyle = `rgba(160,215,240,${Math.max(0, p.life * 2)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
    // подсказка до старта
    if (g.phase === 'ready' && sets > 0) {
      ctx.fillStyle = 'rgba(58,46,34,0.65)'; ctx.font = "600 20px Rubik, sans-serif"; ctx.textAlign = 'center';
      ctx.fillText('Зажми левую кнопку и лей в горлышко', W / 2, 232);
    }
    if (g.phase === 'ready' && sets <= 0) {
      ctx.fillStyle = 'rgba(165,80,47,0.9)'; ctx.font = "600 20px Rubik, sans-serif"; ctx.textAlign = 'center';
      ctx.fillText(`Колодец набирается: следующее ведро через ${cfg.regenMin}:00`, W / 2, 232);
    }
    // шкала времени налива
    if (g.phase === 'play') {
      const f = Math.min(1, (g.t - g.playStart) / cfg.dur);
      ctx.fillStyle = 'rgba(138,90,43,0.25)'; roundRect(W - 190, 20, 160, 10, 5); ctx.fill();
      ctx.fillStyle = '#c89558'; roundRect(W - 190, 20, 160 * (1 - f), 10, 5); ctx.fill();
    }
  }

  // ───── ввод ─────
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; };
  canvas.addEventListener('pointermove', (e) => { g.x = Math.max(40, Math.min(W - 40, pt(e))); });
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); g.x = Math.max(40, Math.min(W - 40, pt(e))); if (e.button === 0 || e.pointerType !== 'mouse') g.down = true; });
  const up = () => { g.down = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
  function onKey(e) { if (e.key === 'Escape' && g.phase === 'play') finish('time'); }

  // ───── цикл ─────
  let raf = 0; let last = performance.now(); let disposed = false;
  function loop(now) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!canvas.offsetParent) return;
    step(dt);
    draw();
  }
  raf = requestAnimationFrame(loop);

  const refill = h('button.btn.small', { type: 'button', onclick: () => { sets = cfg.sets; regenAt = null; updateDrops(); } }, 'Вернуть наборы воды');
  const params = [
    ['Заряды лейки', M.charges.join(' / '), M.src.charges], ['Наклон ведра до 90°', `${M.tiltUpSec} с (обратно ${M.tiltDownSec} с)`, M.src.tiltUpSec],
    ['Сдвиг струи вправо при полном наклоне', `до +${M.shiftPct} % ширины поля`, M.src.shiftPct], ['Горлышко лейки', `${M.mouthPct} % ширины поля`, M.src.mouthPct],
    ['Качание горлышка', `амплитуда ${M.amplitudePct} % поля, период ${M.periodMin}–${M.periodMax} с`, M.src.period], ['Налив', `до ${M.durationSec} с`, M.src.durationSec],
    ['Ведро пустеет', `за ${M.emptySec} с при полном наклоне`, M.src.emptySec], ['Пауза без ЛКМ', `дольше ${M.releaseSec} с после первого налива`, M.src.releaseSec],
    ['Наборы воды', `${M.waterSets}, новый раз в ${M.waterMin} мин`, M.src.waterSets], ['Окно закрывается', `через ${M.closeAfterSec} с`, M.src.closeAfterSec],
  ];
  container.append(
    h('div.row', { style: 'justify-content:center;gap:16px;margin-bottom:10px;max-width:820px;margin-left:auto;margin-right:auto' }, levelSeg, h('div.row', h('span.small.muted', 'Вода в колодце'), drops), refill),
    wrap, waterInfo, stats, hint,
  );
  container.querySelectorAll('.small.muted').forEach((e) => { e.style.textAlign = 'center'; });
  updateDrops();
  reset();

  return {
    params,
    dispose() { disposed = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); },
  };
}
