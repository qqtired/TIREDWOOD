// «Песочный замок» — арканоид на пляже: надувным матрасом отбиваешь пляжный мяч и разбиваешь замок из песка.
// Сухой песок — с одного удара, мокрый — с двух, камни не бьются. Ракушки роняют подарки. Три мяча на игру.
// Разбил замок — следующий больше, а мяч быстрее. Мяч ускоряется от каждого отскока от матраса.
// Интерфейс модуля — см. kit.js: meta, makeSim(seed), createGame(canvas, opts), replay(seed, log, ticks).
import { H, HZ, W, irand, replayRun, rngFrom, runCabinet, topBar, txt } from './kit.js';

export const meta = {
  id: 'castle',
  title: 'Песочный замок',
  like: 'как арканоид',
  go: 'ПОДАЧА!',
  overTitle: 'МЯЧИ КОНЧИЛИСЬ',
  rules: [
    'Отбивай мяч матрасом и разбей замок из песка.',
    'Мокрый песок — с двух ударов, камни не бьются.',
    'Ракушки роняют подарки: шире, три мяча, медленнее.',
  ],
  controls: [
    ['Мышь', 'двигать матрас'],
    ['← → / A D', 'двигать клавишами'],
    ['Клик / Пробел', 'подать мяч'],
  ],
  scoring: 'Песок 10, мокрый 20, ракушка 30, флажок 50; цепочка без касания матраса +2 за каждый блок. Замок целиком +250.',
  medals: [500, 1500, 3000],
  /** Предложение: жетоны за медаль партии (бронза, серебро, золото) */
  coins: [8, 15, 25],
  cursor: 'none',
};

const L = 8;
const R = W - 8;
const TOPY = 28;
const PY = 222;
const PH = 6;
const PW = 46;
const PW_WIDE = 72;
const BALL = 5;
const BX0 = 8;
const BY0 = 40;
const BW = 16;
const BH = 8;
const COLS = 19;
const KEY_SPEED = 3.8;
export const EV_X = 1;
export const EV_KEY = 2;
export const EV_SERVE = 3;

/** . пусто, s песок, w мокрый песок (2 удара), h ракушка (подарок), k камень, f флажок */
const LEVELS = [
  [
    '...f...........f...',
    '..sss.........sss..',
    '..shs....f....shs..',
    '..sss...sss...sss..',
    '..sssssssssssssss..',
    '..sswssshshssswss..',
    '..sssss.....sssss..',
  ],
  [
    '.f.......f.......f.',
    'sss.....sss.....sss',
    'shs.....shs.....shs',
    'sss..s..sss..s..sss',
    'sssssssssssssssssss',
    'wwwwwwwhwwwhwwwwwww',
    'sssss.........sssss',
    'wwwww.........wwwww',
  ],
  [
    '....f....f....f....',
    '...sss..sss..sss...',
    '...shs..whw..shs...',
    '...sss..sss..sss...',
    '.kwwwwwwwwwwwwwwwk.',
    '.kssshssssssshsssk.',
    '.ksssssskkkssssssk.',
    '.kwwwww.....wwwwwk.',
    '.kkk...........kkk.',
  ],
];
const TYPE = { s: 1, w: 2, h: 3, k: 4, f: 5 };
const PTS = [0, 10, 20, 30, 0, 50];
const DROPS = ['wide', 'multi', 'slow', 'life'];

const baseSpeed = (level) => Math.min(4.2, 2.6 + 0.3 * (level - 1));
/** Скорость мяча: растёт от отскоков и от времени (каждые 10 с), чтобы партия не тянулась дольше 3–4 минут */
const ballSpeed = (s) => Math.min(baseSpeed(s.level) + 2, baseSpeed(s.level) + 0.04 * s.hits + 0.15 * Math.floor(s.tick / 600));

export function makeSim(seed) {
  const rng = rngFrom(seed);
  const s = {
    tick: 0,
    score: 0,
    over: false,
    fx: [],
    level: 1,
    lives: 3,
    px: (W - PW) / 2,
    pw: PW,
    wideT: 0,
    slowT: 0,
    keyL: 0,
    keyR: 0,
    balls: [],
    grid: [],
    left: 0,
    drops: [],
    held: true,
    holdT: 0,
    speed: baseSpeed(1),
    hits: 0,
    chain: 0,
    sincePaddle: 0,
    step,
  };

  function build() {
    const rows = LEVELS[(s.level - 1) % LEVELS.length];
    s.grid = [];
    s.left = 0;
    for (let r = 0; r < rows.length; r++) {
      const line = rows[r].padEnd(COLS, '.').slice(0, COLS);
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const t = TYPE[line[c]] ?? 0;
        if (!t) { row.push(null); continue; }
        row.push({ r, c, t, hp: t === 2 ? 2 : 1 });
        if (t !== 4) s.left++;
      }
      s.grid.push(row);
    }
    s.drops = [];
  }

  function serve() {
    s.held = true;
    s.holdT = 0;
    s.balls = [{ x: s.px + s.pw / 2 - BALL / 2, y: PY - BALL - 1, vx: 0, vy: 0 }];
    s.hits = 0;
    s.speed = ballSpeed(s);
    s.chain = 0;
    s.sincePaddle = 0;
  }

  function launch() {
    if (!s.held) return;
    s.held = false;
    const b = s.balls[0];
    const k = (rng() < 0.5 ? -1 : 1) * (0.3 + rng() * 0.25);
    b.vx = s.speed * k;
    b.vy = -Math.sqrt(s.speed * s.speed - b.vx * b.vx);
    s.fx.push({ k: 'bounce', x: b.x, y: b.y });
  }

  build();
  serve();

  function setPaddle(x) {
    const c = s.px + s.pw / 2;
    s.px = Math.max(L, Math.min(R - s.pw, x - s.pw / 2));
    if (s.held && c !== s.px + s.pw / 2) s.balls[0].x = s.px + s.pw / 2 - BALL / 2;
  }

  function hitBrick(b, br) {
    if (br.t === 4) {
      s.fx.push({ k: 'stone', x: BX0 + br.c * BW + BW / 2, y: BY0 + br.r * BH + BH / 2 });
      return;
    }
    br.hp--;
    const cx = BX0 + br.c * BW + BW / 2;
    const cy = BY0 + br.r * BH + BH / 2;
    if (br.hp > 0) {
      s.score += 5;
      s.fx.push({ k: 'crack', x: cx, y: cy });
      return;
    }
    s.grid[br.r][br.c] = null;
    s.left--;
    const pts = PTS[br.t] + 2 * Math.min(10, s.chain);
    s.chain++;
    s.score += pts;
    s.fx.push({ k: 'brick', x: cx, y: cy, pts, t: br.t });
    if (br.t === 3) {
      let kind = DROPS[irand(rng, s.lives < 5 ? 4 : 3)];
      if (kind === 'life' && rng() < 0.5) kind = 'wide';
      s.drops.push({ x: cx, y: cy, kind });
    }
  }

  function brickAt(c, r) {
    if (r < 0 || r >= s.grid.length || c < 0 || c >= COLS) return null;
    return s.grid[r][c];
  }

  function moveBall(b, k) {
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * k;
    const n = Math.max(1, Math.ceil(sp / 2));
    for (let i = 0; i < n; i++) {
      const ox = b.x;
      const oy = b.y;
      b.x += (b.vx * k) / n;
      b.y += (b.vy * k) / n;
      if (b.x < L) { b.x = L; b.vx = Math.abs(b.vx); s.fx.push({ k: 'wall', x: b.x, y: b.y }); }
      if (b.x + BALL > R) { b.x = R - BALL; b.vx = -Math.abs(b.vx); s.fx.push({ k: 'wall', x: b.x, y: b.y }); }
      if (b.y < TOPY) { b.y = TOPY; b.vy = Math.abs(b.vy); s.fx.push({ k: 'wall', x: b.x, y: b.y }); }
      // матрас
      if (b.vy > 0 && b.y + BALL >= PY && oy + BALL <= PY + 2 && b.x + BALL > s.px - 1 && b.x < s.px + s.pw + 1) {
        b.y = PY - BALL;
        s.hits++;
        s.speed = ballSpeed(s);
        const off = Math.max(-1, Math.min(1, (b.x + BALL / 2 - (s.px + s.pw / 2)) / (s.pw / 2)));
        b.vx = s.speed * 0.8 * off;
        b.vy = -Math.sqrt(s.speed * s.speed - b.vx * b.vx);
        s.chain = 0;
        s.sincePaddle = 0;
        s.fx.push({ k: 'bounce', x: b.x, y: b.y });
        return;
      }
      // песок
      const c0 = Math.floor((b.x - BX0) / BW);
      const c1 = Math.floor((b.x + BALL - 1 - BX0) / BW);
      const r0 = Math.floor((b.y - BY0) / BH);
      const r1 = Math.floor((b.y + BALL - 1 - BY0) / BH);
      let hit = null;
      for (let r = r0; r <= r1 && !hit; r++) for (let c = c0; c <= c1 && !hit; c++) hit = brickAt(c, r);
      if (hit) {
        const bx = BX0 + hit.c * BW;
        const wasInX = ox + BALL > bx && ox < bx + BW;
        if (wasInX) b.vy = -b.vy;
        else b.vx = -b.vx;
        b.x = ox;
        b.y = oy;
        hitBrick(b, hit);
        return;
      }
    }
  }

  function step(events) {
    if (s.over) return;
    for (const e of events) {
      if (e[0] === EV_X) setPaddle(e[1]);
      else if (e[0] === EV_KEY) { if (e[1] === 0) s.keyL = e[2] ? 1 : 0; else s.keyR = e[2] ? 1 : 0; }
      else if (e[0] === EV_SERVE) launch();
    }
    s.tick++;
    if (s.keyL || s.keyR) setPaddle(s.px + s.pw / 2 + (s.keyR - s.keyL) * KEY_SPEED);
    if (s.wideT > 0 && --s.wideT === 0) {
      const c = s.px + s.pw / 2;
      s.pw = PW;
      setPaddle(c);
    }
    if (s.slowT > 0) s.slowT--;
    if (s.held) {
      s.balls[0].x = s.px + s.pw / 2 - BALL / 2;
      if (++s.holdT >= 2.5 * HZ) launch();
    } else {
      const k = s.slowT > 0 ? 0.68 : 1;
      for (const b of s.balls) moveBall(b, k);
      if (++s.sincePaddle > 15 * HZ) {
        // мяч застрял между камнями — подтолкнуть
        s.sincePaddle = 0;
        for (const b of s.balls) {
          b.vx += (rng() - 0.5) * 1.2;
          const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
          b.vx *= s.speed / sp;
          b.vy *= s.speed / sp;
        }
      }
      for (let i = s.balls.length - 1; i >= 0; i--) if (s.balls[i].y > H) s.balls.splice(i, 1);
      if (!s.balls.length) {
        s.lives--;
        s.fx.push({ k: 'lose', x: s.px + s.pw / 2, y: PY });
        s.wideT = 0;
        s.slowT = 0;
        s.pw = PW;
        if (s.lives <= 0) {
          s.over = true;
          return;
        }
        serve();
      }
    }
    for (let i = s.drops.length - 1; i >= 0; i--) {
      const d = s.drops[i];
      d.y += 1.15;
      if (d.y + 4 >= PY && d.y - 4 <= PY + PH && d.x >= s.px - 5 && d.x <= s.px + s.pw + 5) {
        s.drops.splice(i, 1);
        s.fx.push({ k: 'power', x: d.x, y: PY - 6, kind: d.kind });
        if (d.kind === 'wide') {
          const c = s.px + s.pw / 2;
          s.pw = PW_WIDE;
          s.wideT = 14 * HZ;
          setPaddle(c);
        } else if (d.kind === 'slow') s.slowT = 9 * HZ;
        else if (d.kind === 'life') s.lives = Math.min(5, s.lives + 1);
        else if (d.kind === 'multi' && !s.held && s.balls.length) {
          const b = s.balls[0];
          for (const k of [-0.55, 0.55]) {
            const vx = s.speed * k;
            s.balls.push({ x: b.x, y: b.y, vx, vy: -Math.sqrt(s.speed * s.speed - vx * vx) });
          }
        }
      } else if (d.y > H) s.drops.splice(i, 1);
    }
    if (s.left <= 0) {
      s.score += 250;
      s.fx.push({ k: 'clear', x: W / 2, y: 110, level: s.level });
      s.level++;
      build();
      serve();
    }
  }

  return s;
}

// ------------------------------------------------------------------ ввод и автопилот

function makeUi() {
  return { lastX: -1 };
}
function resetUi(ui) {
  ui.lastX = -1;
}

const KEYS = { ArrowLeft: 0, KeyA: 0, ArrowRight: 1, KeyD: 1 };

function key(code, down, ctl) {
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

function pointer(type, x, y, button, ctl, ui) {
  const px = Math.round(x);
  if (px !== ui.lastX) {
    ui.lastX = px;
    ctl.push(EV_X, px);
  }
  if (type === 'down') ctl.push(EV_SERVE);
}

export function bot(s, mem, rng) {
  if (s.over) return [];
  const ev = [];
  if (s.held) {
    mem.serve = (mem.serve ?? 30 + irand(rng, 40)) - 1;
    if (mem.serve <= 0) { ev.push([EV_SERVE, 0, 0]); mem.serve = undefined; }
  }
  let target = W / 2;
  let lowest = null;
  for (const b of s.balls) if (b.vy >= 0 && (!lowest || b.y > lowest.y)) lowest = b;
  if (lowest && lowest.y < 110) lowest = null;
  if (lowest) {
    if (mem.hits !== s.hits) { mem.hits = s.hits; mem.off = (rng() - 0.5) * s.pw * (rng() < 0.12 ? 1.25 : 0.7); }
    target = lowest.x + BALL / 2 + (mem.off ?? 0);
  } else if (s.drops.length) target = s.drops[0].x;
  else if (s.balls[0]) target = s.balls[0].x;
  mem.x = mem.x ?? W / 2;
  const v = 3.3;
  mem.x += Math.max(-v, Math.min(v, target - mem.x));
  const px = Math.round(mem.x);
  if (px !== mem.sent) { mem.sent = px; ev.push([EV_X, px, 0]); }
  return ev;
}

// ------------------------------------------------------------------ эффекты

const BRICK_FX = [[], ['#f0cf8c', '#e2b971'], ['#c79a5c', '#a87b45'], ['#ffb3c7', '#f0cf8c'], [], ['#d9483a', '#fff3de']];
const POWER_TEXT = { wide: 'ШИРЕ!', multi: 'ТРИ МЯЧА!', slow: 'МЕДЛЕННЕЕ', life: '+1 МЯЧ' };

function onFx(view, f) {
  const fx = view.fx;
  if (f.k === 'brick') {
    fx.burst(f.x, f.y, BRICK_FX[f.t], 7, 1.1, 22);
    fx.text(f.x, f.y - 6, `+${f.pts}`, f.pts >= 30 ? '#ffd35a' : '#fff3de', 8, 34);
  } else if (f.k === 'crack') fx.burst(f.x, f.y, ['#a87b45'], 3, 0.7, 14, 1);
  else if (f.k === 'power') fx.text(f.x, f.y - 6, POWER_TEXT[f.kind], '#ffd35a', 10, 60);
  else if (f.k === 'lose') { view.shake = 12; fx.text(f.x, f.y - 20, 'МЯЧ УПЛЫЛ', '#ff9a8a', 10, 60); }
  else if (f.k === 'clear') { fx.text(W / 2, 120, `ЗАМОК ${f.level} РАЗБИТ! +250`, '#ffd35a', 14, 110); fx.burst(W / 2, 120, ['#ffd35a', '#fff3de', '#d9483a', '#3fb6a8'], 40, 2.6, 50, 3); }
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
  const sky = c.createLinearGradient(0, 16, 0, 100);
  sky.addColorStop(0, '#8fd0ee');
  sky.addColorStop(1, '#d6f1fb');
  c.fillStyle = sky;
  c.fillRect(0, 16, W, 86);
  // солнце
  c.fillStyle = '#fff1b8';
  c.beginPath();
  c.arc(272, 70, 14, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ffe08a';
  c.beginPath();
  c.arc(272, 70, 10, 0, Math.PI * 2);
  c.fill();
  // море
  const sea = c.createLinearGradient(0, 100, 0, 150);
  sea.addColorStop(0, '#3aa8c4');
  sea.addColorStop(1, '#2a8fae');
  c.fillStyle = sea;
  c.fillRect(0, 100, W, 50);
  c.fillStyle = 'rgba(255,255,255,.5)';
  for (let i = 0; i < 26; i++) c.fillRect((i * 47) % W, 106 + ((i * 13) % 40), 6, 1);
  // пена и песок
  c.fillStyle = '#fff3de';
  for (let x = 0; x < W; x += 12) { c.beginPath(); c.arc(x + 6, 150, 6, Math.PI, 0); c.fill(); }
  c.fillStyle = '#f3d9a4';
  c.fillRect(0, 150, W, 90);
  c.fillStyle = '#e5c07c';
  for (let i = 0; i < 80; i++) c.fillRect((i * 61) % W, 154 + ((i * 23) % 84), 2, 1);
  // заборчик из досок по бокам
  for (const x of [0, R]) {
    c.fillStyle = '#7a4e2c';
    c.fillRect(x, 16, 8, H - 16);
    c.fillStyle = '#a8754a';
    c.fillRect(x + 1, 16, 2, H - 16);
    for (let y = 30; y < H; y += 26) { c.fillStyle = '#6b4426'; c.fillRect(x, y, 8, 2); }
  }
  bgCache = { scale, cv };
  return cv;
}

function garland(ctx) {
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

function drawBrick(ctx, br) {
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

function drawPaddle(ctx, s) {
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
    ctx.fillStyle = i % 2 ? '#fff3de' : (s.wideT > 0 ? '#ff8a1c' : '#d9483a');
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

function drawBall(ctx, b, clock) {
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

const DROP_COLOR = { wide: '#ff8a1c', multi: '#ff6b8a', slow: '#3fb6a8', life: '#d9283a' };

function drawDrop(ctx, d, clock) {
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
    for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.arc(x + dx, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
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

function draw(ctx, s, view, ui, st, best) {
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

const def = { meta, makeSim, makeUi, resetUi, key, pointer, bot, onFx, draw };

export function createGame(canvas, opts) {
  return runCabinet(canvas, def, opts);
}

export function replay(seed, log, ticks) {
  return replayRun(makeSim, seed, log, ticks);
}
