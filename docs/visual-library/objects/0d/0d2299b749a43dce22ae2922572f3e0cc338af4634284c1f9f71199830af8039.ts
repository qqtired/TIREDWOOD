// «Песочный замок» на экране автомата: картинка, эффекты и ввод (логика — shared/arcade/castle.ts). Из лаборатории.
// Мышь двигает матрас каждый кадр: в одном тике в журнал идёт только последняя позиция (merge) — журнал короче,
// а партия та же (клиент применяет ровно то, что записал).
import { H, HZ, W } from '../../../../shared/arcade/kit.ts';
import {
  BALL, BH, BW, BX0, BY0, EV_KEY, EV_SERVE, EV_X, L, PH, PY, R, bot, makeSim, meta, type Ball, type Brick, type CastleSim, type Drop, type DropKind,
} from '../../../../shared/arcade/castle.ts';
import { cachedLayer, rr, topBar, txt, type Ctl, type Ctx, type GameDef, type View } from './kit.ts';

interface CastleUi {
  lastX: number;
}

const KEYS: Record<string, number> = { ArrowLeft: 0, KeyA: 0, ArrowRight: 1, KeyD: 1 };

function key(code: string, down: boolean, ctl: Ctl): boolean {
  if (code in KEYS) {
    ctl.push(EV_KEY, KEYS[code], down ? 1 : 0);
    return true;
  }
  if (code === 'Space' && down) {
    ctl.push(EV_SERVE);
    return true;
  }
  return false;
}

function pointer(type: 'move' | 'down', x: number, _y: number, ctl: Ctl, ui: CastleUi): void {
  const px = Math.max(-20, Math.min(W + 20, Math.round(x)));
  if (px !== ui.lastX && ctl.mode === 'play') {
    ui.lastX = px;
    ctl.push(EV_X, px);
  }
  if (type === 'down') ctl.push(EV_SERVE);
}

// ------------------------------------------------------------------ эффекты

const BRICK_FX: string[][] = [[], ['#f0cf8c', '#e2b971'], ['#c79a5c', '#a87b45'], ['#ffb3c7', '#f0cf8c'], [], ['#d9483a', '#fff3de']];
const POWER_TEXT: Record<DropKind, string> = { wide: 'ШИРЕ!', multi: 'ТРИ МЯЧА!', slow: 'МЕДЛЕННЕЕ', life: '+1 МЯЧ' };

function onFx(view: View, f: { k: string; x: number; y: number; [k: string]: unknown }): void {
  const fx = view.fx;
  if (f.k === 'brick') {
    fx.burst(f.x, f.y, BRICK_FX[f.t as number], 7, 1.1, 22);
    fx.text(f.x, f.y - 6, `+${f.pts}`, (f.pts as number) >= 30 ? '#ffd35a' : '#fff3de', 8, 34);
  } else if (f.k === 'crack') fx.burst(f.x, f.y, ['#a87b45'], 3, 0.7, 14, 1);
  else if (f.k === 'power') fx.text(f.x, f.y - 6, POWER_TEXT[f.kind as DropKind], '#ffd35a', 10, 60);
  else if (f.k === 'lose') {
    view.shake = 12;
    fx.text(f.x, f.y - 20, 'МЯЧ УПЛЫЛ', '#ff9a8a', 10, 60);
  } else if (f.k === 'clear') {
    fx.text(W / 2, 120, `ЗАМОК ${f.level} РАЗБИТ! +250`, '#ffd35a', 14, 110);
    fx.burst(W / 2, 120, ['#ffd35a', '#fff3de', '#d9483a', '#3fb6a8'], 40, 2.6, 50, 3);
  }
}

// ------------------------------------------------------------------ картинка

let bgCache: { scale: number; cv: HTMLCanvasElement } | null = null;
function background(scale: number): HTMLCanvasElement {
  bgCache = cachedLayer(scale, bgCache, (c) => {
    const sky = c.createLinearGradient(0, 16, 0, 100);
    sky.addColorStop(0, '#8fd0ee');
    sky.addColorStop(1, '#d6f1fb');
    c.fillStyle = sky;
    c.fillRect(0, 16, W, 86);
    c.fillStyle = '#fff1b8';
    c.beginPath();
    c.arc(272, 70, 14, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffe08a';
    c.beginPath();
    c.arc(272, 70, 10, 0, Math.PI * 2);
    c.fill();
    const sea = c.createLinearGradient(0, 100, 0, 150);
    sea.addColorStop(0, '#3aa8c4');
    sea.addColorStop(1, '#2a8fae');
    c.fillStyle = sea;
    c.fillRect(0, 100, W, 50);
    c.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 26; i++) c.fillRect((i * 47) % W, 106 + ((i * 13) % 40), 6, 1);
    c.fillStyle = '#fff3de';
    for (let x = 0; x < W; x += 12) {
      c.beginPath();
      c.arc(x + 6, 150, 6, Math.PI, 0);
      c.fill();
    }
    c.fillStyle = '#f3d9a4';
    c.fillRect(0, 150, W, 90);
    c.fillStyle = '#e5c07c';
    for (let i = 0; i < 80; i++) c.fillRect((i * 61) % W, 154 + ((i * 23) % 84), 2, 1);
    for (const x of [0, R]) {
      c.fillStyle = '#7a4e2c';
      c.fillRect(x, 16, 8, H - 16);
      c.fillStyle = '#a8754a';
      c.fillRect(x + 1, 16, 2, H - 16);
      for (let y = 30; y < H; y += 26) {
        c.fillStyle = '#6b4426';
        c.fillRect(x, y, 8, 2);
      }
    }
  });
  return bgCache.cv;
}

function garland(ctx: Ctx): void {
  ctx.fillStyle = '#7a4e2c';
  ctx.fillRect(L, 17, R - L, 1);
  const cols = ['#d9483a', '#fff3de', '#3fb6a8', '#ff8a1c'];
  for (let i = 0; i < 19; i++) {
    const x = L + 4 + i * 16;
    ctx.fillStyle = cols[i % 4];
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x + 8, 18);
    ctx.lineTo(x + 4, 26);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBrick(ctx: Ctx, br: Brick): void {
  const x = BX0 + br.c * BW;
  const y = BY0 + br.r * BH;
  const base = br.t === 2 ? '#c79a5c' : br.t === 4 ? '#9a9488' : '#f0cf8c';
  const hi = br.t === 2 ? '#d9b07a' : br.t === 4 ? '#bdb7aa' : '#fbe3b0';
  const lo = br.t === 2 ? '#a87b45' : br.t === 4 ? '#6f6a60' : '#d3a865';
  ctx.fillStyle = lo;
  ctx.fillRect(x, y, BW, BH);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, BW - 1, BH - 1);
  ctx.fillStyle = hi;
  ctx.fillRect(x, y, BW - 1, 1);
  ctx.fillStyle = lo;
  ctx.fillRect(x + 3 + ((br.c * 5 + br.r * 3) % 8), y + 3 + ((br.c + br.r) % 3), 1, 1);
  ctx.fillRect(x + 9 + ((br.c * 3) % 5), y + 5, 1, 1);
  if (br.t === 2 && br.hp === 1) {
    ctx.fillStyle = '#6b4426';
    ctx.fillRect(x + 5, y + 1, 1, 3);
    ctx.fillRect(x + 6, y + 3, 3, 1);
    ctx.fillRect(x + 9, y + 4, 1, 3);
  }
  if (br.t === 3) {
    ctx.fillStyle = '#ff9ec4';
    ctx.beginPath();
    ctx.arc(x + 8, y + 5.5, 3.5, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + 6.5, y + 5.5, 3, 1.5);
    ctx.fillStyle = '#e06a98';
    ctx.fillRect(x + 7.5, y + 2.5, 1, 3);
    ctx.fillRect(x + 5.5, y + 3.5, 1, 2);
    ctx.fillRect(x + 9.5, y + 3.5, 1, 2);
  }
  if (br.t === 4) {
    ctx.fillStyle = '#6f6a60';
    ctx.fillRect(x + 4, y + 2, 4, 1);
    ctx.fillRect(x + 10, y + 5, 3, 1);
  }
  if (br.t === 5) {
    ctx.fillStyle = '#7a4e2c';
    ctx.fillRect(x + 7, y - 6, 1, 8);
    ctx.fillStyle = '#d9483a';
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 6);
    ctx.lineTo(x + 14, y - 4);
    ctx.lineTo(x + 8, y - 2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPaddle(ctx: Ctx, s: CastleSim): void {
  const x = Math.round(s.px);
  ctx.fillStyle = 'rgba(42,31,36,.25)';
  rr(ctx, x + 1, PY + 3, s.pw, PH, 3);
  ctx.fillStyle = '#2a1f24';
  rr(ctx, x - 1, PY - 1, s.pw + 2, PH + 2, 4);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, PY, s.pw, PH, 3);
  ctx.clip();
  for (let i = 0; i * 6 < s.pw; i++) {
    ctx.fillStyle = i % 2 ? '#fff3de' : s.wideT > 0 ? '#ff8a1c' : '#d9483a';
    ctx.fillRect(x + i * 6, PY, 6, PH);
  }
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.fillRect(x, PY, s.pw, 1.5);
  ctx.fillStyle = 'rgba(42,31,36,.18)';
  ctx.fillRect(x, PY + PH - 1.5, s.pw, 1.5);
  ctx.restore();
  if (s.wideT > 0 && s.wideT < 2 * HZ && Math.floor(s.wideT / 8) % 2) {
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    rr(ctx, x, PY, s.pw, PH, 3);
  }
}

function drawBall(ctx: Ctx, b: Ball, clock: number): void {
  const x = b.x + BALL / 2;
  const y = b.y + BALL / 2;
  ctx.fillStyle = 'rgba(42,31,36,.25)';
  ctx.beginPath();
  ctx.arc(x + 1, y + 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1f24';
  ctx.beginPath();
  ctx.arc(x, y, 3.4, 0, Math.PI * 2);
  ctx.fill();
  const rot = clock / 6;
  const cols = ['#d9483a', '#fff3de', '#3fb6a8', '#fff3de'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 2.8, rot + (i * Math.PI) / 2, rot + ((i + 1) * Math.PI) / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 1.5, 1.5);
}

const DROP_COLOR: Record<DropKind, string> = { wide: '#ff8a1c', multi: '#ff6b8a', slow: '#3fb6a8', life: '#d9283a' };

function drawDrop(ctx: Ctx, d: Drop, clock: number): void {
  const x = Math.round(d.x);
  const y = Math.round(d.y);
  ctx.fillStyle = '#2a1f24';
  rr(ctx, x - 9, y - 5, 18, 10, 5);
  ctx.fillStyle = DROP_COLOR[d.kind];
  rr(ctx, x - 8, y - 4, 16, 8, 4);
  ctx.fillStyle = '#fff3de';
  if (d.kind === 'wide') {
    ctx.fillRect(x - 5, y - 0.5, 10, 1);
    ctx.fillRect(x - 5, y - 2, 1, 4);
    ctx.fillRect(x + 4, y - 2, 1, 4);
  } else if (d.kind === 'multi') {
    for (const dx of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (d.kind === 'slow') {
    ctx.fillRect(x - 5, y - 1, 3, 1);
    ctx.fillRect(x - 2, y, 3, 1);
    ctx.fillRect(x + 1, y - 1, 3, 1);
  } else {
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1, 1.8, 0, Math.PI * 2);
    ctx.arc(x + 1.5, y - 1, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 3.3, y - 0.5);
    ctx.lineTo(x + 3.3, y - 0.5);
    ctx.lineTo(x, y + 3);
    ctx.closePath();
    ctx.fill();
  }
  if (Math.floor(clock / 6) % 2) {
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    rr(ctx, x - 8, y - 4, 16, 3, 2);
  }
}

function draw(ctx: Ctx, s: CastleSim, _view: View, _ui: CastleUi, st: { mode: string; clock: number }, best: number): void {
  const sc = ctx.getTransform().a;
  ctx.drawImage(background(sc), 0, 0, W * sc, H * sc, 0, 0, W, H);
  garland(ctx);
  for (const row of s.grid) for (const br of row) if (br) drawBrick(ctx, br);
  for (const d of s.drops) drawDrop(ctx, d, st.clock);
  drawPaddle(ctx, s);
  for (const b of s.balls) drawBall(ctx, b, st.clock);
  if (s.slowT > 0) txt(ctx, 'МЕДЛЕННО', R - 4, PY + 12, 7, '#3fb6a8', 'right');
  const lives = '●'.repeat(Math.max(0, s.lives));
  topBar(ctx, `СЧЁТ ${s.score}`, `ЗАМОК ${s.level}   МЯЧИ ${lives}`, `РЕКОРД ${Math.max(best, s.score)}`);
  if (s.held && st.mode === 'play' && Math.floor(st.clock / 25) % 2) txt(ctx, 'ПРОБЕЛ ИЛИ КЛИК — ПОДАТЬ', W / 2, 196, 10, '#fff3de', 'center');
}

export const castleDef: GameDef<CastleSim, CastleUi> = {
  meta,
  makeSim,
  bot: (s, mem, rng) => bot(s, mem as Parameters<typeof bot>[1], rng),
  makeUi: () => ({ lastX: -1 }),
  resetUi: (ui) => {
    ui.lastX = -1;
  },
  key: (code, down, ctl) => key(code, down, ctl),
  pointer: (type, x, y, ctl, ui) => pointer(type, x, y, ctl, ui),
  onFx,
  draw,
  merge: [EV_X],
};
