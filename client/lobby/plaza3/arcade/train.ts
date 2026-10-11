// «Паровозик» на экране автомата: картинка, эффекты и ввод (логика — shared/arcade/train.ts). Из лаборатории.
import { H, W } from '../../../../shared/arcade/kit.ts';
import { CELL, COLS, DIRS, EV_TURN, GOLD_WAIT, ROWS, TOP, WAIT, bot, makeSim, meta, type Cell, type Stop, type TrainSim } from '../../../../shared/arcade/train.ts';
import { cachedLayer, jelly, rr, topBar, txt, type Ctl, type Ctx, type GameDef, type View } from './kit.ts';

const KEYS: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };

function key(code: string, down: boolean, ctl: Ctl): boolean {
  if (!(code in KEYS)) return false;
  if (down) ctl.push(EV_TURN, KEYS[code]);
  return true;
}

/** Клик: повернуть в сторону клика (поперёк текущего хода) */
function pointer(type: 'move' | 'down', x: number, y: number, ctl: Ctl, _ui: unknown, s: TrainSim): void {
  if (type !== 'down' || !s) return;
  const h = s.body[0];
  const dir = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  const dx = x - (h.x * CELL + CELL / 2);
  const dy = y - (TOP + h.y * CELL + CELL / 2);
  if (dir === 1 || dir === 3) ctl.push(EV_TURN, dy < 0 ? 0 : 2);
  else ctl.push(EV_TURN, dx < 0 ? 3 : 1);
}

function onFx(view: View, f: { k: string; x: number; y: number; [k: string]: unknown }): void {
  const cx = f.x * CELL + CELL / 2;
  const cy = TOP + f.y * CELL + CELL / 2;
  const fx = view.fx;
  if (f.k === 'pick') {
    fx.text(cx, cy - 8, `+${f.pts}`, '#fff3de', 10);
    fx.burst(cx, cy, [f.color as string, '#fff3de'], 8, 1.2, 22);
  } else if (f.k === 'gold') {
    fx.text(cx, cy - 10, `+${f.pts}`, '#ffd35a', 13, 60);
    fx.burst(cx, cy, ['#ffd35a', '#fff3de', '#ff8a8a'], 16, 1.8, 34);
  } else if (f.k === 'crash') {
    view.shake = 18;
    fx.burst(cx, cy, ['#fff3de', '#ffd35a', '#d9483a', '#5c4f49'], 22, 2.2, 40, 3);
    for (let i = 0; i < 6; i++) fx.puff(cx + (Math.random() - 0.5) * 12, cy + (Math.random() - 0.5) * 8, 'rgba(240,230,220,.9)', 50, 4);
  } else if (f.k === 'leave') {
    fx.text(cx, cy - 8, 'УШЁЛ', '#ffb36b', 8, 40);
  } else if (f.k === 'block') {
    fx.burst(cx, cy, ['#7bd88f', '#f59bd8'], 8, 1, 20);
  }
}

let tileCache: { scale: number; cv: HTMLCanvasElement } | null = null;
function tiles(scale: number): HTMLCanvasElement {
  tileCache = cachedLayer(scale, tileCache, (c) => {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = x * CELL;
        const py = TOP + y * CELL;
        c.fillStyle = (x + y) % 2 ? '#f1d9aa' : '#ead09b';
        c.fillRect(px, py, CELL, CELL);
        c.fillStyle = 'rgba(160,110,60,.16)';
        c.fillRect(px, py + CELL - 1, CELL, 1);
        c.fillRect(px + CELL - 1, py, 1, CELL);
        c.fillStyle = 'rgba(255,255,255,.25)';
        c.fillRect(px + 2 + ((x * 7 + y * 3) % 9), py + 3 + ((x * 5 + y * 11) % 8), 2, 1);
      }
    }
    c.strokeStyle = '#b8563a';
    c.lineWidth = 2;
    c.strokeRect(1, TOP + 1, W - 2, H - TOP - 2);
  });
  return tileCache.cv;
}

function drawBlock(ctx: Ctx, b: Cell): void {
  const x = b.x * CELL;
  const y = TOP + b.y * CELL;
  ctx.fillStyle = '#b8563a';
  rr(ctx, x + 1, y + 6, 14, 9, 2);
  ctx.fillStyle = '#d9643a';
  ctx.fillRect(x + 1, y + 6, 14, 2);
  ctx.fillStyle = '#3f9a52';
  ctx.beginPath();
  ctx.arc(x + 5, y + 6, 4, 0, Math.PI * 2);
  ctx.arc(x + 11, y + 6, 4, 0, Math.PI * 2);
  ctx.arc(x + 8, y + 3.5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f59bd8';
  ctx.fillRect(x + 4, y + 3, 2, 2);
  ctx.fillRect(x + 10, y + 5, 2, 2);
  ctx.fillStyle = '#fff3de';
  ctx.fillRect(x + 7, y + 1, 2, 2);
}

function ring(ctx: Ctx, cx: number, cy: number, r: number, k: number, color: string): void {
  ctx.strokeStyle = 'rgba(42,31,36,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  ctx.stroke();
}

function drawStop(ctx: Ctx, p: Stop, tick: number, clock: number): void {
  const cx = p.x * CELL + CELL / 2;
  const cy = TOP + p.y * CELL + CELL / 2;
  const k = Math.max(0, 1 - (tick - p.born) / WAIT);
  ring(ctx, cx, cy, 7.5, k, k > 0.5 ? '#3f9a52' : k > 0.25 ? '#ff8a1c' : '#d9283a');
  const hop = Math.abs(Math.sin(clock / 9)) * (k < 0.25 ? 2.5 : 1.2);
  jelly(ctx, cx, cy + 1 - hop, 4.6, p.color, Math.sin(clock / 30));
  // ручка машет
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(cx + 5, cy - 2 - hop - (Math.floor(clock / 10) % 2) * 1.5, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawGold(ctx: Ctx, g: { x: number; y: number; born: number }, tick: number, clock: number): void {
  const cx = g.x * CELL + CELL / 2;
  const cy = TOP + g.y * CELL + CELL / 2;
  const k = Math.max(0, 1 - (tick - g.born) / GOLD_WAIT);
  ctx.fillStyle = `rgba(255,211,90,${0.25 + 0.2 * Math.sin(clock / 5)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();
  ring(ctx, cx, cy, 8, k, '#ffd35a');
  jelly(ctx, cx, cy + 2, 4.6, '#ffb21c');
  // мороженое
  ctx.fillStyle = '#e7b56a';
  ctx.beginPath();
  ctx.moveTo(cx + 3, cy - 2);
  ctx.lineTo(cx + 7, cy - 2);
  ctx.lineTo(cx + 5, cy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff8fb3';
  ctx.beginPath();
  ctx.arc(cx + 5, cy - 3.5, 2.4, 0, Math.PI * 2);
  ctx.fill();
  if (Math.floor(clock / 8) % 2) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 7, cy - 7, 2, 2);
    ctx.fillRect(cx + 6, cy + 5, 2, 2);
  }
}

function seg(s: TrainSim, i: number, f: number): { x: number; y: number } {
  const a = s.from[i] ?? s.body[i];
  const b = s.body[i];
  return { x: (a.x + (b.x - a.x) * f) * CELL + CELL / 2, y: TOP + (a.y + (b.y - a.y) * f) * CELL + CELL / 2 };
}

function drawTrain(ctx: Ctx, s: TrainSim, f: number, clock: number): void {
  const pts = s.body.map((_, i) => seg(s, i, f));
  // сцепки
  ctx.strokeStyle = '#5c4f49';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i) ctx.lineTo(pts[i].x, pts[i].y);
    else ctx.moveTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
  // вагончики — с хвоста
  for (let i = pts.length - 1; i >= 1; i--) {
    const p = pts[i];
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    ctx.fillStyle = 'rgba(42,31,36,.25)';
    rr(ctx, x - 6, y - 4, 13, 12, 3);
    ctx.fillStyle = '#fff3de';
    rr(ctx, x - 6.5, y - 6.5, 13, 13, 3);
    ctx.fillStyle = i % 2 ? '#3fb6a8' : '#d9483a';
    ctx.fillRect(x - 6.5, y + 3, 13, 3);
    const c = s.cars[i - 1];
    if (c) jelly(ctx, x, y - 0.5, 3.8, c, 0, Math.sin(clock / 7 + i) * 0.4);
    else {
      ctx.fillStyle = '#d8c4a0';
      ctx.fillRect(x - 3, y - 2, 6, 3);
    }
    // полосатая крыша-маркиза сверху
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? '#fff3de' : '#d9483a';
      ctx.fillRect(x - 6.5 + k * 3.25, y - 7.5, 3.25, 2);
    }
  }
  // паровозик
  const h = pts[0];
  const [dx, dy] = DIRS[s.dir];
  ctx.save();
  ctx.translate(Math.round(h.x), Math.round(h.y));
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = 'rgba(42,31,36,.3)';
  rr(ctx, -7, -5, 15, 13, 3);
  ctx.fillStyle = '#d9483a';
  rr(ctx, -7.5, -7, 15, 14, 4);
  ctx.fillStyle = '#a8322a';
  ctx.fillRect(-7.5, 3, 15, 3);
  ctx.fillStyle = '#ffd35a';
  ctx.fillRect(-7.5, -2, 15, 2);
  // будка машиниста
  ctx.fillStyle = '#fff3de';
  rr(ctx, -7, -5, 6, 10, 2);
  // труба и фонарь
  ctx.fillStyle = '#2a1f24';
  ctx.beginPath();
  ctx.arc(3, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(6, -2, 2, 4);
  ctx.restore();
}

function draw(ctx: Ctx, s: TrainSim, view: View, _ui: unknown, st: { mode: string; clock: number; alpha: number }, best: number): void {
  const sc = ctx.getTransform().a;
  ctx.drawImage(tiles(sc), 0, 0, W * sc, H * sc, 0, 0, W, H);
  for (const b of s.blocks) drawBlock(ctx, b);
  if (s.pass) drawStop(ctx, s.pass, s.tick, st.clock);
  if (s.gold) drawGold(ctx, s.gold, s.tick, st.clock);
  const f = s.over ? 0 : Math.min(1, (s.since + st.alpha) / s.every);
  // дым из трубы
  if (!s.over && st.clock % 9 === 0 && (st.mode === 'play' || st.mode === 'attract')) {
    const h = seg(s, 0, f);
    const [dx, dy] = DIRS[s.dir];
    view.fx.puff(h.x + dx * 3, h.y + dy * 3 - 3, 'rgba(255,255,255,.75)', 34, 2);
  }
  drawTrain(ctx, s, f, st.clock);
  if (s.over && s.crashAt) {
    const cx = s.crashAt.x * CELL + CELL / 2;
    const cy = TOP + s.crashAt.y * CELL + CELL / 2;
    txt(ctx, 'БАХ!', Math.max(22, Math.min(W - 22, cx)), Math.max(28, Math.min(H - 10, cy)), 12, '#ffd35a', 'center');
  }
  topBar(ctx, `СЧЁТ ${s.score}`, `ВАГОНОВ ${s.cars.length}${s.mult > 1 ? `  ×${s.mult}` : ''}`, `РЕКОРД ${Math.max(best, s.score)}`, s.mult > 1 ? '#ffd35a' : '#fff3de');
}

export const trainDef: GameDef<TrainSim, Record<string, never>> = {
  meta,
  makeSim,
  bot: (s, mem, rng) => bot(s, mem, rng),
  makeUi: () => ({}),
  key: (code, down, ctl) => key(code, down, ctl),
  pointer: (type, x, y, ctl, ui, s) => pointer(type, x, y, ctl, ui, s),
  onFx,
  draw,
};
