// «Тир» — тир на набережной: 60 секунд, жестяные чайки, лодочки и крабы едут по рельсам, пират выглядывает из бочки.
// Серия попаданий умножает очки до ×5, промах сбрасывает серию. Желейка в спасательном круге — не мишень: −50.
// Последние 10 секунд очки ×2. Между выстрелами — 0,27 с (пневматика), поэтому «закликать» не выйдет.
// Интерфейс модуля — см. kit.js: meta, makeSim(seed), createGame(canvas, opts), replay(seed, log, ticks).
import { H, HZ, W, irand, jelly, replayRun, rngFrom, runCabinet, topBar, txt } from './kit.js';

export const meta = {
  id: 'tir',
  title: 'Тир',
  like: 'стрельба по мишеням',
  go: 'ОГОНЬ!',
  overTitle: 'ВРЕМЯ!',
  rules: [
    '60 секунд: сбивай чаек, лодочки и крабов.',
    'Попадай подряд — серия умножает очки до ×5.',
    'Пират из бочки — +100. В спасателя не стреляй: −50.',
  ],
  controls: [
    ['Мышь', 'прицел'],
    ['Клик / Пробел', 'выстрел'],
    ['← ↑ ↓ →', 'или WASD — прицел клавишами'],
  ],
  scoring: 'Краб 10, лодка 20, чайка 30, пират 100. Серия: каждые 3 попадания подряд +×1. Последние 10 с — ×2.',
  medals: [800, 2500, 5000],
  /** Предложение: жетоны за медаль партии (бронза, серебро, золото) */
  coins: [5, 10, 15],
  cursor: 'none',
};

const DURATION = 60 * HZ;
const FINAL = 50 * HZ;
const COOLDOWN = 16;
const KINDS = {
  gull: { w: 20, h: 13, pts: 30 },
  boat: { w: 22, h: 17, pts: 20 },
  swimmer: { w: 20, h: 17, pts: -50 },
  crab: { w: 18, h: 12, pts: 10 },
  pirate: { w: 18, h: 20, pts: 100 },
};
/** Полосы: высота мишени, куда едут, скорость (px/тик), интервал появления (тики) */
const LANES = [
  { y: 50, dir: -1, speed: 1.0, gap: [40, 90], kind: 'gull' },
  { y: 105, dir: 1, speed: 0.55, gap: [50, 100], kind: 'boat' },
  { y: 153, dir: -1, speed: 0.42, gap: [45, 95], kind: 'crab' },
];
const BARRELS = [64, 160, 256];
const BARREL_Y = 190;
const POP_LIFE = 84;
export const EV_SHOT = 1;

const popUp = (p, tick) => {
  const a = tick - p.born;
  if (a < 10) return a / 10;
  if (a > POP_LIFE - 10) return Math.max(0, (POP_LIFE - a) / 10);
  return 1;
};

export function makeSim(seed) {
  const rng = rngFrom(seed);
  const s = {
    tick: 0,
    score: 0,
    over: false,
    fx: [],
    targets: [],
    next: [0, 0, 0],
    pop: null,
    nextPop: 4 * HZ + irand(rng, 3 * HZ),
    cool: 0,
    streak: 0,
    mult: 1,
    shots: 0,
    hits: 0,
    left: DURATION,
    step,
  };
  let id = 0;

  function spawn(li, x) {
    const L = LANES[li];
    let kind = L.kind;
    if (li === 1 && rng() < 0.16 + 0.14 * (s.tick / DURATION)) kind = 'swimmer';
    const k = KINDS[kind];
    s.targets.push({ id: ++id, lane: li, kind, x, w: k.w, h: k.h, pts: k.pts, alive: true, dead: 0 });
  }
  // На старте мишени уже на рельсах — стрелять можно с первой секунды
  for (let li = 0; li < 3; li++) {
    let x = 30 + irand(rng, 40);
    while (x < W - 20) {
      spawn(li, x);
      x += 60 + irand(rng, 50);
    }
    s.next[li] = 20 + irand(rng, 40);
  }

  function hitTest(x, y) {
    if (s.pop && s.pop.alive) {
      const up = popUp(s.pop, s.tick);
      const top = BARREL_Y - 6 - 20 * up;
      if (up > 0.5 && Math.abs(x - s.pop.x) <= 10 && y >= top - 1 && y <= BARREL_Y - 4) return s.pop;
    }
    for (let li = 2; li >= 0; li--) {
      const L = LANES[li];
      for (const t of s.targets) {
        if (!t.alive || t.lane !== li) continue;
        if (Math.abs(x - t.x) <= t.w / 2 + 1 && Math.abs(y - L.y) <= t.h / 2 + 1) return t;
      }
    }
    return null;
  }

  function shoot(x, y) {
    if (s.cool > 0) return;
    s.cool = COOLDOWN;
    s.shots++;
    const t = hitTest(x, y);
    s.fx.push({ k: 'shot', x, y });
    if (!t) {
      s.streak = 0;
      s.mult = 1;
      s.fx.push({ k: 'miss', x, y });
      return;
    }
    t.alive = false;
    t.dead = s.tick;
    const ty = t === s.pop ? BARREL_Y - 16 : LANES[t.lane].y;
    if (t.pts < 0) {
      s.score = Math.max(0, s.score + t.pts);
      s.streak = 0;
      s.mult = 1;
      s.fx.push({ k: 'bad', x: t.x, y: ty, pts: t.pts });
      return;
    }
    s.streak++;
    s.hits++;
    s.mult = Math.min(5, 1 + Math.floor(s.streak / 3));
    const pts = t.pts * s.mult * (s.tick >= FINAL ? 2 : 1);
    s.score += pts;
    s.fx.push({ k: 'hit', x: t.x, y: ty, pts, kind: t === s.pop ? 'pirate' : t.kind });
  }

  function step(events) {
    if (s.over) return;
    for (const e of events) if (e[0] === EV_SHOT) shoot(e[1], e[2]);
    s.tick++;
    s.left = DURATION - s.tick;
    if (s.cool > 0) s.cool--;
    const f = 1 + (0.75 * s.tick) / DURATION;
    for (let i = s.targets.length - 1; i >= 0; i--) {
      const t = s.targets[i];
      const L = LANES[t.lane];
      if (t.alive) t.x += L.dir * L.speed * f;
      if ((!t.alive && s.tick - t.dead > 20) || t.x < -30 || t.x > W + 30) s.targets.splice(i, 1);
    }
    for (let li = 0; li < 3; li++) {
      if (s.tick < s.next[li]) continue;
      const L = LANES[li];
      spawn(li, L.dir > 0 ? -14 : W + 14);
      s.next[li] = s.tick + Math.round((L.gap[0] + irand(rng, L.gap[1] - L.gap[0])) / f);
    }
    if (s.pop) {
      if (s.tick - s.pop.born >= POP_LIFE || (!s.pop.alive && s.tick - s.pop.dead > 20)) {
        s.pop = null;
        s.nextPop = s.tick + Math.round((3 * HZ + irand(rng, 3 * HZ)) / f);
      }
    } else if (s.tick >= s.nextPop) {
      s.pop = { x: BARRELS[irand(rng, 3)], born: s.tick, alive: true, dead: 0, pts: KINDS.pirate.pts, w: 18 };
      s.fx.push({ k: 'popup', x: s.pop.x, y: BARREL_Y - 20 });
    }
    if (s.tick === FINAL) s.fx.push({ k: 'final', x: W / 2, y: 120 });
    if (s.tick >= DURATION) {
      s.over = true;
      s.fx.push({ k: 'time', x: W / 2, y: 120 });
    }
  }

  return s;
}

// ------------------------------------------------------------------ прицел, ввод, автопилот

function makeUi() {
  return { x: 160, y: 120, keys: { l: 0, r: 0, u: 0, d: 0 }, hold: 0, recoil: 0 };
}
function resetUi(ui) {
  ui.keys = { l: 0, r: 0, u: 0, d: 0 };
  ui.hold = 0;
  ui.recoil = 0;
}

function uiTick(ui) {
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

const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };

function key(code, down, ctl, ui) {
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

function pointer(type, x, y, button, ctl, ui) {
  ui.x = Math.max(0, Math.min(W, x));
  ui.y = Math.max(16, Math.min(H, y));
  if (type === 'down') {
    ctl.push(EV_SHOT, Math.round(ui.x), Math.round(ui.y));
    ui.recoil = 6;
  }
}

function targetPos(s, t) {
  if (t === s.pop) return { x: t.x, y: BARREL_Y - 6 - 20 * popUp(t, s.tick) + 8 };
  return { x: t.x + LANES[t.lane].dir * LANES[t.lane].speed * 6, y: LANES[t.lane].y };
}

export function bot(s, mem, rng, ui) {
  if (s.over) return [];
  let t = mem.t;
  const live = (q) => q && q.alive && (q === s.pop ? popUp(q, s.tick) > 0.8 : q.x > 16 && q.x < W - 16);
  if (s.pop && live(s.pop) && t !== s.pop && rng() < 0.2) t = null;
  if (!live(t)) {
    t = null;
    let bestD = 1e9;
    const cands = s.targets.filter((q) => q.pts > 0 && live(q));
    if (s.pop && live(s.pop)) cands.push(s.pop);
    for (const q of cands) {
      const p = targetPos(s, q);
      const d = Math.abs(p.x - ui.x) + Math.abs(p.y - ui.y) * 0.7 - (q === s.pop ? 80 : 0);
      if (d < bestD) { bestD = d; t = q; }
    }
    mem.t = t;
    mem.wait = 8 + irand(rng, 14);
  }
  if (!t) return [];
  const p = targetPos(s, t);
  const dx = p.x - ui.x;
  const dy = p.y - ui.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const v = 2.3;
  if (d > v) {
    ui.x += (dx / d) * v;
    ui.y += (dy / d) * v;
  } else {
    ui.x = p.x;
    ui.y = p.y;
  }
  if (d < 4 && s.cool === 0 && --mem.wait <= 0) {
    mem.wait = 8 + irand(rng, 14);
    const err = rng() < 0.24 ? 9 : 0;
    ui.recoil = 6;
    return [[EV_SHOT, Math.round(ui.x + err), Math.round(ui.y - err * 0.5), 0]];
  }
  return [];
}

// ------------------------------------------------------------------ эффекты

const HIT_COLORS = { gull: ['#fff3de', '#c9d1d9'], boat: ['#d9483a', '#fff3de'], crab: ['#e8613a', '#ffb36b'], pirate: ['#ffd35a', '#d9483a', '#fff3de'] };

function onFx(view, f) {
  const fx = view.fx;
  if (f.k === 'hit') {
    fx.text(f.x, f.y - 12, `+${f.pts}`, f.kind === 'pirate' ? '#ffd35a' : '#fff3de', f.kind === 'pirate' ? 14 : 10, 46);
    fx.burst(f.x, f.y, HIT_COLORS[f.kind] ?? ['#fff3de'], f.kind === 'pirate' ? 18 : 10, 1.6, 26);
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

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

let bgCache = null;
function background(scale) {
  if (bgCache && bgCache.scale === scale) return bgCache.cv;
  const cv = document.createElement('canvas');
  cv.width = W * scale;
  cv.height = H * scale;
  const c = cv.getContext('2d');
  c.setTransform(scale, 0, 0, scale, 0, 0);
  // небо
  const sky = c.createLinearGradient(0, 16, 0, 80);
  sky.addColorStop(0, '#8fd0ee');
  sky.addColorStop(1, '#d6f1fb');
  c.fillStyle = sky;
  c.fillRect(0, 16, W, 66);
  // море
  const sea = c.createLinearGradient(0, 80, 0, 130);
  sea.addColorStop(0, '#3aa8c4');
  sea.addColorStop(1, '#1f7f9e');
  c.fillStyle = sea;
  c.fillRect(0, 80, W, 52);
  // песок
  c.fillStyle = '#f0cf8c';
  c.fillRect(0, 130, W, 72);
  c.fillStyle = '#e2b971';
  for (let i = 0; i < 90; i++) c.fillRect((i * 53) % W, 134 + ((i * 37) % 64), 2, 1);
  c.fillStyle = '#fff3de';
  for (let i = 0; i < 30; i++) c.fillRect((i * 71 + 13) % W, 136 + ((i * 29) % 60), 1, 1);
  // латунные рельсы
  for (const [y, top] of [[61, 0], [166, 1]]) {
    c.fillStyle = '#9a6a2c';
    c.fillRect(0, y, W, 3);
    c.fillStyle = '#e8b85a';
    c.fillRect(0, y, W, 1);
    if (top !== undefined) for (let x = 8; x < W; x += 40) { c.fillStyle = '#7a4e2c'; c.fillRect(x, y + 3, 3, 6); }
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
  bgCache = { scale, cv };
  return cv;
}

function awning(ctx) {
  for (let i = 0; i < 16; i++) {
    const x = i * 20;
    ctx.fillStyle = i % 2 ? '#fff3de' : '#d9483a';
    ctx.fillRect(x, 16, 20, 7);
    ctx.beginPath();
    ctx.arc(x + 10, 23, 10, 0, Math.PI);
    ctx.fill();
  }
  // лампочки
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(i * 20 + 10, 33.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clouds(ctx, clock) {
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

function waves(ctx, y, clock, color, off) {
  ctx.fillStyle = color;
  const sh = (clock * 0.4 + off) % 16;
  for (let x = -16; x < W + 16; x += 16) {
    ctx.beginPath();
    ctx.arc(x + sh, y, 8, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillRect(0, y, W, 132 - y);
}

function flip(t, tick) {
  return t.alive ? 1 : Math.max(0, 1 - (tick - t.dead) / 10);
}

function drawGull(ctx, x, y, k, clock) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, k);
  // палочка на рельс
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

function drawBoat(ctx, x, y, k) {
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

function drawSwimmer(ctx, x, y, k, clock) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, k);
  // круг
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

function drawCrab(ctx, x, y, k, clock) {
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
  // клешни
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

function drawBarrel(ctx, x) {
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

function drawPirate(ctx, p, tick, clock) {
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
  // бандана
  ctx.fillStyle = '#d9483a';
  ctx.beginPath();
  ctx.arc(0, -3, 8, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  ctx.fillRect(6, -6, 4, 2);
  ctx.fillStyle = '#fff3de';
  ctx.fillRect(-3, -9, 2, 2);
  ctx.fillRect(2, -8, 2, 2);
  // повязка на глаз
  ctx.fillStyle = '#2a1f24';
  ctx.fillRect(1, -2, 5, 4);
  ctx.fillRect(-7, -4, 14, 1);
  ctx.restore();
}

function drawRifle(ctx, ui) {
  const bx = 160;
  const by = 252;
  const dx = ui.x - bx;
  const dy = ui.y - by;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const len = 58 - ui.recoil;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = '#6b4426';
  rr(ctx, -6, -6, 34, 12, 4);
  ctx.fillStyle = '#a8754a';
  ctx.fillRect(-6, -6, 34, 3);
  ctx.fillStyle = '#3a2b31';
  ctx.fillRect(26, -2.5, len - 26, 5);
  ctx.fillStyle = '#7d8a98';
  ctx.fillRect(26, -2.5, len - 26, 1.5);
  ctx.restore();
  return d;
}

function drawCross(ctx, ui, s) {
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

function draw(ctx, s, view, ui, st, best) {
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

const def = { meta, makeSim, makeUi, resetUi, uiTick, key, pointer, bot, onFx, draw };

export function createGame(canvas, opts) {
  return runCabinet(canvas, def, opts);
}

export function replay(seed, log, ticks) {
  return replayRun(makeSim, seed, log, ticks);
}
