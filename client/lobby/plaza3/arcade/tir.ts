// «Тир» на экране автомата: картинка, прицел, эффекты и ввод (логика — shared/arcade/tir.ts). Из лаборатории.
import { H, HZ, W } from '../../../../shared/arcade/kit.ts';
import { BARRELS, BARREL_Y, COOLDOWN, EV_SHOT, FINAL, LANES, bot, makeSim, meta, popUp, type Popper, type Target, type TirSim } from '../../../../shared/arcade/tir.ts';
import { cachedLayer, jelly, rr, topBar, txt, type Ctl, type Ctx, type GameDef, type View } from './kit.ts';

interface TirUi {
  x: number;
  y: number;
  keys: { l: number; r: number; u: number; d: number };
  hold: number;
  recoil: number;
}

function makeUi(): TirUi {
  return { x: 160, y: 120, keys: { l: 0, r: 0, u: 0, d: 0 }, hold: 0, recoil: 0 };
}
function resetUi(ui: TirUi): void {
  ui.keys = { l: 0, r: 0, u: 0, d: 0 };
  ui.hold = 0;
  ui.recoil = 0;
}

function uiTick(ui: TirUi): void {
  const k = ui.keys;
  const mx = k.r - k.l;
  const my = k.d - k.u;
  if (mx || my) {
    ui.hold = Math.min(30, ui.hold + 1);
    const v = 1.6 + ui.hold * 0.08;
    ui.x = Math.max(4, Math.min(W - 4, ui.x + mx * v));
    ui.y = Math.max(20, Math.min(H - 6, ui.y + my * v));
  } else ui.hold = 0;
  if (ui.recoil > 0) ui.recoil--;
}

const KEYMAP: Record<string, 'l' | 'r' | 'u' | 'd'> = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };

function key(code: string, down: boolean, ctl: Ctl, ui: TirUi): boolean {
  if (code in KEYMAP) {
    ui.keys[KEYMAP[code]] = down ? 1 : 0;
    return true;
  }
  if (code === 'Space' && down) {
    ctl.push(EV_SHOT, Math.round(ui.x), Math.round(ui.y));
    ui.recoil = 6;
    return true;
  }
  return false;
}

function pointer(type: 'move' | 'down', x: number, y: number, ctl: Ctl, ui: TirUi): void {
  ui.x = Math.max(0, Math.min(W, x));
  ui.y = Math.max(16, Math.min(H, y));
  if (type === 'down') {
    ctl.push(EV_SHOT, Math.round(ui.x), Math.round(ui.y));
    ui.recoil = 6;
  }
}

// ------------------------------------------------------------------ эффекты

const HIT_COLORS: Record<string, string[]> = { gull: ['#fff3de', '#c9d1d9'], boat: ['#d9483a', '#fff3de'], crab: ['#e8613a', '#ffb36b'], pirate: ['#ffd35a', '#d9483a', '#fff3de'] };

function onFx(view: View, f: { k: string; x: number; y: number; [k: string]: unknown }): void {
  const fx = view.fx;
  if (f.k === 'hit') {
    const pirate = f.kind === 'pirate';
    fx.text(f.x, f.y - 12, `+${f.pts}`, pirate ? '#ffd35a' : '#fff3de', pirate ? 14 : 10, 46);
    fx.burst(f.x, f.y, HIT_COLORS[f.kind as string] ?? ['#fff3de'], pirate ? 18 : 10, 1.6, 26);
  } else if (f.k === 'miss') {
    fx.puff(f.x, f.y, 'rgba(255,243,222,.75)', 22, 1.6);
    fx.burst(f.x, f.y, ['#c9b294'], 4, 0.8, 14, 1);
  } else if (f.k === 'bad') {
    view.shake = 10;
    fx.text(f.x, f.y - 14, 'НЕ В СПАСАТЕЛЯ! −50', '#ff8a8a', 9, 70);
  } else if (f.k === 'final') {
    fx.text(W / 2, 120, 'ПОСЛЕДНИЕ 10 СЕКУНД — ОЧКИ ×2!', '#ffd35a', 12, 110);
  } else if (f.k === 'popup') {
    fx.burst(f.x, f.y + 6, ['#c98a4a', '#f0cf8c'], 6, 0.8, 18);
  }
}

// ------------------------------------------------------------------ картинка

let bgCache: { scale: number; cv: HTMLCanvasElement } | null = null;
function background(scale: number): HTMLCanvasElement {
  bgCache = cachedLayer(scale, bgCache, (c) => {
    const sky = c.createLinearGradient(0, 16, 0, 80);
    sky.addColorStop(0, '#8fd0ee');
    sky.addColorStop(1, '#d6f1fb');
    c.fillStyle = sky;
    c.fillRect(0, 16, W, 66);
    const sea = c.createLinearGradient(0, 80, 0, 130);
    sea.addColorStop(0, '#3aa8c4');
    sea.addColorStop(1, '#1f7f9e');
    c.fillStyle = sea;
    c.fillRect(0, 80, W, 52);
    c.fillStyle = '#f0cf8c';
    c.fillRect(0, 130, W, 72);
    c.fillStyle = '#e2b971';
    for (let i = 0; i < 90; i++) c.fillRect((i * 53) % W, 134 + ((i * 37) % 64), 2, 1);
    c.fillStyle = '#fff3de';
    for (let i = 0; i < 30; i++) c.fillRect((i * 71 + 13) % W, 136 + ((i * 29) % 60), 1, 1);
    // латунные рельсы
    for (const y of [61, 166]) {
      c.fillStyle = '#9a6a2c';
      c.fillRect(0, y, W, 3);
      c.fillStyle = '#e8b85a';
      c.fillRect(0, y, W, 1);
      for (let x = 8; x < W; x += 40) {
        c.fillStyle = '#7a4e2c';
        c.fillRect(x, y + 3, 3, 6);
      }
    }
    // прилавок
    c.fillStyle = '#7a4e2c';
    c.fillRect(0, 202, W, 38);
    for (let y = 206; y < H; y += 8) {
      c.fillStyle = '#6b4426';
      c.fillRect(0, y, W, 1);
    }
    c.fillStyle = '#a8754a';
    c.fillRect(0, 200, W, 4);
    c.fillStyle = '#c99566';
    c.fillRect(0, 200, W, 1);
  });
  return bgCache.cv;
}

function awning(ctx: Ctx): void {
  for (let i = 0; i < 16; i++) {
    const x = i * 20;
    ctx.fillStyle = i % 2 ? '#fff3de' : '#d9483a';
    ctx.fillRect(x, 16, 20, 7);
    ctx.beginPath();
    ctx.arc(x + 10, 23, 10, 0, Math.PI);
    ctx.fill();
  }
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(i * 20 + 10, 33.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clouds(ctx: Ctx, clock: number): void {
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const [x0, y, r] of [[40, 44, 7], [190, 38, 9], [290, 52, 6]]) {
    const x = ((x0 + clock * 0.06) % (W + 60)) - 30;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r, y + 2, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x - r, y + 2, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function waves(ctx: Ctx, y: number, clock: number, color: string, off: number): void {
  ctx.fillStyle = color;
  const sh = (clock * 0.4 + off) % 16;
  for (let x = -16; x < W + 16; x += 16) {
    ctx.beginPath();
    ctx.arc(x + sh, y, 8, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillRect(0, y, W, 132 - y);
}

function flip(t: { alive: boolean; dead: number }, tick: number): number {
  return t.alive ? 1 : Math.max(0, 1 - (tick - t.dead) / 10);
}

function drawGull(ctx: Ctx, x: number, y: number, k: number, clock: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, k);
  ctx.fillStyle = '#7a4e2c';
  ctx.fillRect(-1, 4, 2, 8);
  const wing = Math.floor(clock / 8) % 2 ? -3 : 0;
  ctx.fillStyle = '#2a1f24';
  rr(ctx, -10, -5, 20, 10, 5);
  ctx.fillStyle = '#ffffff';
  rr(ctx, -9, -4, 18, 8, 4);
  ctx.fillStyle = '#c9d1d9';
  ctx.beginPath();
  ctx.moveTo(-3, -2);
  ctx.lineTo(4, -2);
  ctx.lineTo(1, -8 + wing);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff8a1c';
  ctx.fillRect(-12, -1, 4, 2);
  ctx.fillStyle = '#2a1f24';
  ctx.fillRect(-6, -2, 2, 2);
  ctx.restore();
}

function drawBoat(ctx: Ctx, x: number, y: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, k);
  ctx.fillStyle = '#2a1f24';
  ctx.beginPath();
  ctx.moveTo(-12, 1);
  ctx.lineTo(12, 1);
  ctx.lineTo(8, 8);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d9483a';
  ctx.beginPath();
  ctx.moveTo(-11, 2);
  ctx.lineTo(11, 2);
  ctx.lineTo(7.5, 7);
  ctx.lineTo(-7.5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff3de';
  ctx.fillRect(-10, 2, 20, 1.5);
  ctx.fillStyle = '#7a4e2c';
  ctx.fillRect(-0.5, -9, 1.5, 11);
  ctx.fillStyle = '#fff3de';
  ctx.beginPath();
  ctx.moveTo(1, -9);
  ctx.lineTo(9, 0);
  ctx.lineTo(1, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d9483a';
  ctx.fillRect(1, -4, 5, 1.5);
  ctx.restore();
}

function drawSwimmer(ctx: Ctx, x: number, y: number, k: number, clock: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, k);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#fff3de' : '#e0283a';
    ctx.beginPath();
    ctx.arc(0, 4, 9, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4);
    ctx.arc(0, 4, 5, ((i + 1) * Math.PI) / 4, (i * Math.PI) / 4, true);
    ctx.closePath();
    ctx.fill();
  }
  jelly(ctx, 0, -2, 5.5, '#ff9ec4', Math.sin(clock / 20));
  const wave = Math.floor(clock / 10) % 2 ? -2 : 0;
  ctx.fillStyle = '#ff9ec4';
  ctx.beginPath();
  ctx.arc(-7, -6 + wave, 2, 0, Math.PI * 2);
  ctx.arc(7, -6 - wave, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrab(ctx: Ctx, x: number, y: number, k: number, clock: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, k);
  const leg = Math.floor(clock / 6) % 2;
  ctx.fillStyle = '#a8322a';
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) ctx.fillRect(sx * (6 + i * 2) - (sx < 0 ? 2 : 0), 2 + ((i + leg) % 2), 2, 4);
  }
  ctx.fillStyle = '#2a1f24';
  rr(ctx, -8, -5, 16, 10, 5);
  ctx.fillStyle = '#e8613a';
  rr(ctx, -7, -4, 14, 8, 4);
  ctx.fillStyle = '#e8613a';
  ctx.beginPath();
  ctx.arc(-10, -5 - leg, 3, 0, Math.PI * 2);
  ctx.arc(10, -5 - (1 - leg), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-4, -7, 3, 3);
  ctx.fillRect(1, -7, 3, 3);
  ctx.fillStyle = '#2a1f24';
  ctx.fillRect(-3, -6, 1.5, 1.5);
  ctx.fillRect(2, -6, 1.5, 1.5);
  ctx.restore();
}

function drawBarrel(ctx: Ctx, x: number): void {
  ctx.fillStyle = '#2a1f24';
  rr(ctx, x - 12, BARREL_Y - 6, 24, 20, 4);
  ctx.fillStyle = '#a8754a';
  rr(ctx, x - 11, BARREL_Y - 5, 22, 18, 3);
  ctx.fillStyle = '#7a4e2c';
  ctx.fillRect(x - 11, BARREL_Y - 1, 22, 2);
  ctx.fillRect(x - 11, BARREL_Y + 7, 22, 2);
  ctx.fillStyle = '#c99566';
  ctx.fillRect(x - 8, BARREL_Y - 5, 2, 18);
}

function drawPirate(ctx: Ctx, p: Popper, tick: number, clock: number): void {
  const up = popUp(p, tick);
  const k = p.alive ? 1 : Math.max(0, 1 - (tick - p.dead) / 10);
  const y = BARREL_Y - 6 - 18 * up + 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x - 14, 20, 28, BARREL_Y - 5 - 20);
  ctx.clip();
  ctx.translate(p.x, y);
  ctx.scale(1, k);
  jelly(ctx, 0, 0, 8, '#7bd88f', Math.sin(clock / 12));
  ctx.fillStyle = '#d9483a';
  ctx.beginPath();
  ctx.arc(0, -3, 8, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  ctx.fillRect(6, -6, 4, 2);
  ctx.fillStyle = '#fff3de';
  ctx.fillRect(-3, -9, 2, 2);
  ctx.fillRect(2, -8, 2, 2);
  ctx.fillStyle = '#2a1f24';
  ctx.fillRect(1, -2, 5, 4);
  ctx.fillRect(-7, -4, 14, 1);
  ctx.restore();
}

function drawRifle(ctx: Ctx, ui: TirUi): void {
  const bx = 160;
  const by = 252;
  const len = 58 - ui.recoil;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(Math.atan2(ui.y - by, ui.x - bx));
  ctx.fillStyle = '#6b4426';
  rr(ctx, -6, -6, 34, 12, 4);
  ctx.fillStyle = '#a8754a';
  ctx.fillRect(-6, -6, 34, 3);
  ctx.fillStyle = '#3a2b31';
  ctx.fillRect(26, -2.5, len - 26, 5);
  ctx.fillStyle = '#7d8a98';
  ctx.fillRect(26, -2.5, len - 26, 1.5);
  ctx.restore();
}

function drawCross(ctx: Ctx, ui: TirUi, s: TirSim): void {
  const x = Math.round(ui.x);
  const y = Math.round(ui.y);
  const ready = s.cool === 0;
  const r = ready ? 7 : 5 + (s.cool / COOLDOWN) * 3;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(42,31,36,.85)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ready ? '#fff3de' : '#ff9a8a';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(42,31,36,.85)';
  ctx.fillRect(x - 11, y - 1.5, 7, 3);
  ctx.fillRect(x + 4, y - 1.5, 7, 3);
  ctx.fillRect(x - 1.5, y - 11, 3, 7);
  ctx.fillRect(x - 1.5, y + 4, 3, 7);
  ctx.fillStyle = ready ? '#fff3de' : '#ff9a8a';
  ctx.fillRect(x - 10, y - 0.5, 6, 1);
  ctx.fillRect(x + 4, y - 0.5, 6, 1);
  ctx.fillRect(x - 0.5, y - 10, 1, 6);
  ctx.fillRect(x - 0.5, y + 4, 1, 6);
  ctx.fillStyle = '#d9483a';
  ctx.fillRect(x - 1, y - 1, 2, 2);
  if (s.mult > 1) txt(ctx, `×${s.mult}`, x + 12, y - 10, 10, '#ffd35a', 'left');
}

function draw(ctx: Ctx, s: TirSim, _view: View, ui: TirUi, st: { mode: string; clock: number }, best: number): void {
  const sc = ctx.getTransform().a;
  ctx.drawImage(background(sc), 0, 0, W * sc, H * sc, 0, 0, W, H);
  clouds(ctx, st.clock);
  const tick = s.tick;
  for (const t of s.targets) if (t.lane === 0) drawGull(ctx, Math.round(t.x), LANES[0].y + (Math.floor((st.clock + t.id * 7) / 12) % 2), flip(t, tick), st.clock + t.id * 5);
  waves(ctx, 98, st.clock, '#2f93b2', 0);
  for (const t of s.targets) {
    if (t.lane !== 1) continue;
    const bob = Math.floor((st.clock + t.id * 11) / 16) % 2;
    if (t.kind === 'swimmer') drawSwimmer(ctx, Math.round(t.x), LANES[1].y + bob, flip(t, tick), st.clock + t.id * 9);
    else drawBoat(ctx, Math.round(t.x), LANES[1].y + bob, flip(t, tick));
  }
  waves(ctx, 116, st.clock, '#1f7f9e', 8);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let x = 0; x < W; x += 24) ctx.fillRect((x + Math.floor(st.clock * 0.4)) % W, 118, 8, 1);
  for (const t of s.targets) if (t.lane === 2) drawCrab(ctx, Math.round(t.x), LANES[2].y, flip(t, tick), st.clock + t.id * 3);
  if (s.pop) drawPirate(ctx, s.pop, tick, st.clock);
  for (const x of BARRELS) drawBarrel(ctx, x);
  awning(ctx);
  drawRifle(ctx, ui);
  if (st.mode !== 'over') drawCross(ctx, ui, s);
  const sec = Math.ceil(s.left / HZ);
  const final = s.tick >= FINAL;
  const timeStr = `0:${String(Math.max(0, sec)).padStart(2, '0')}${final ? '  ×2' : ''}`;
  topBar(ctx, `СЧЁТ ${s.score}`, timeStr, `РЕКОРД ${Math.max(best, s.score)}`, final ? (Math.floor(st.clock / 15) % 2 ? '#ff9a8a' : '#ffd35a') : '#fff3de');
}

export const tirDef: GameDef<TirSim, TirUi> = {
  meta,
  makeSim,
  bot: (s, mem, rng, ui) => bot(s, mem as { t?: Target | Popper | null; wait?: number }, rng, ui),
  makeUi,
  resetUi,
  uiTick: (ui) => uiTick(ui),
  key: (code, down, ctl, ui) => key(code, down, ctl, ui),
  pointer: (type, x, y, ctl, ui) => pointer(type, x, y, ctl, ui),
  onFx,
  draw,
};
