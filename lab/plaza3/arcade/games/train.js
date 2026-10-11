// «Паровозик» — змейка на набережной. Курортный паровозик подбирает отдыхающих на остановках: каждый садится
// в новый вагончик. Врезался в парапет (край экрана), в клумбу или в свой хвост — крушение.
// Вызов с первых секунд: отдыхающий ждёт 9 с и уходит; каждые 4 пассажира — новая клумба; каждые 6 — быстрее.
// Интерфейс модуля — см. kit.js: meta, makeSim(seed), createGame(canvas, opts), replay(seed, log, ticks).
import { H, HZ, W, irand, jelly, replayRun, rngFrom, runCabinet, topBar, txt } from './kit.js';

export const meta = {
  id: 'train',
  title: 'Паровозик',
  like: 'как змейка',
  go: 'ПОЕХАЛИ!',
  overTitle: 'КРУШЕНИЕ!',
  rules: [
    'Вези отдыхающих: каждый садится в новый вагончик.',
    'Не врезайся в парапет, в клумбы и в свой хвост.',
    'Турист с мороженым — +50, но ждёт всего 5 секунд.',
  ],
  controls: [
    ['← ↑ ↓ →', 'или WASD — поворот'],
    ['Клик', 'повернуть в сторону клика'],
    ['P', 'пауза'],
  ],
  scoring: 'Пассажир +10, турист +50. За каждые 10 вагонов очки растут: ×2, ×3…',
  medals: [200, 600, 1200],
  /** Предложение: жетоны за медаль партии (бронза, серебро, золото) */
  coins: [8, 15, 25],
  cursor: 'pointer',
};

const COLS = 20;
const ROWS = 14;
const CELL = 16;
const TOP = 16;
/** вверх, вправо, вниз, влево */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const COLORS = ['#ff8a1c', '#ff6b8a', '#7bd88f', '#a98bff', '#3fb6a8', '#ff5a4e', '#f59bd8', '#69c1f0'];
const WAIT = 9 * HZ;
const GOLD_WAIT = 5 * HZ;
const START_EVERY = 8;
const MIN_EVERY = 5;
const MAX_BLOCKS = 14;
export const EV_TURN = 1;

export function makeSim(seed) {
  const rng = rngFrom(seed);
  const s = {
    tick: 0,
    score: 0,
    over: false,
    fx: [],
    body: [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }],
    /** Откуда ехал каждый сегмент на последнем шаге — для плавной картинки */
    from: null,
    /** Цвет пассажира в каждом вагоне (вагон i — сегмент i+1); null — пустой */
    cars: [null, null],
    dir: 1,
    queue: [],
    every: START_EVERY,
    since: 0,
    moves: 0,
    grow: [],
    picked: 0,
    blocks: [],
    pass: null,
    gold: null,
    nextGold: 10 * HZ + irand(rng, 5 * HZ),
    crashAt: null,
    mult: 1,
    step,
  };
  s.from = s.body.map((p) => ({ ...p }));

  const at = (list, x, y) => list.some((p) => p.x === x && p.y === y);
  const taken = (x, y) => at(s.body, x, y) || at(s.blocks, x, y) || (s.pass && s.pass.x === x && s.pass.y === y) || (s.gold && s.gold.x === x && s.gold.y === y);

  function ahead(x, y, n) {
    const h = s.body[0];
    const [dx, dy] = DIRS[s.dir];
    for (let k = 1; k <= n; k++) if (h.x + dx * k === x && h.y + dy * k === y) return true;
    return false;
  }

  function freeCell(minDist, avoidAhead) {
    const h = s.body[0];
    const ok = (x, y) => !taken(x, y) && Math.abs(x - h.x) + Math.abs(y - h.y) >= minDist && !(avoidAhead && ahead(x, y, 5));
    for (let k = 0; k < 200; k++) {
      const x = irand(rng, COLS);
      const y = irand(rng, ROWS);
      if (ok(x, y)) return { x, y };
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (ok(x, y)) return { x, y };
    return null;
  }

  function spawnPass() {
    const c = freeCell(4, false);
    s.pass = c && { ...c, color: COLORS[irand(rng, COLORS.length)], born: s.tick };
  }
  spawnPass();

  function turn(d) {
    if (!(d >= 0 && d < 4) || s.queue.length >= 2) return;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d === last || (d + 2) % 4 === last) return;
    s.queue.push(d);
  }

  function board(pts, x, y, color, gold) {
    s.score += pts;
    s.picked++;
    s.grow.push(color);
    s.fx.push({ k: gold ? 'gold' : 'pick', x, y, pts, color });
    if (s.picked % 4 === 0 && s.blocks.length < MAX_BLOCKS) {
      const c = freeCell(4, true);
      if (c) {
        s.blocks.push(c);
        s.fx.push({ k: 'block', x: c.x, y: c.y });
      }
    }
    s.every = Math.max(MIN_EVERY, START_EVERY - Math.floor(s.picked / 6));
  }

  function move() {
    if (s.queue.length) s.dir = s.queue.shift();
    const [dx, dy] = DIRS[s.dir];
    const h = s.body[0];
    const nx = h.x + dx;
    const ny = h.y + dy;
    const growing = s.grow.length > 0;
    const n = s.body.length;
    let hit = nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || at(s.blocks, nx, ny);
    for (let i = 0; i < n && !hit; i++) if ((growing || i < n - 1) && s.body[i].x === nx && s.body[i].y === ny) hit = true;
    if (hit) {
      s.over = true;
      s.crashAt = { x: nx, y: ny };
      s.fx.push({ k: 'crash', x: h.x, y: h.y });
      return;
    }
    const old = s.body;
    s.body = [{ x: nx, y: ny }, ...old.slice(0, growing ? n : n - 1)];
    s.from = s.body.map((_, i) => ({ ...(old[i] ?? old[i - 1]) }));
    if (growing) s.cars.push(s.grow.shift());
    s.moves++;
    s.mult = 1 + Math.floor(s.cars.length / 10);
    if (s.pass && s.pass.x === nx && s.pass.y === ny) {
      board(10 * s.mult, nx, ny, s.pass.color, false);
      spawnPass();
    }
    if (s.gold && s.gold.x === nx && s.gold.y === ny) {
      board(50 * s.mult, nx, ny, '#ffb21c', true);
      s.gold = null;
      s.nextGold = s.tick + 12 * HZ + irand(rng, 6 * HZ);
    }
  }

  function step(events) {
    if (s.over) return;
    for (const e of events) if (e[0] === EV_TURN) turn(e[1]);
    s.tick++;
    if (++s.since >= s.every) {
      s.since = 0;
      move();
      if (s.over) return;
    }
    if (s.pass && s.tick - s.pass.born > WAIT) {
      s.fx.push({ k: 'leave', x: s.pass.x, y: s.pass.y, color: s.pass.color });
      spawnPass();
    }
    if (s.gold && s.tick - s.gold.born > GOLD_WAIT) {
      s.fx.push({ k: 'goldgone', x: s.gold.x, y: s.gold.y });
      s.gold = null;
      s.nextGold = s.tick + 12 * HZ + irand(rng, 6 * HZ);
    }
    if (!s.gold && s.tick >= s.nextGold) {
      const c = freeCell(6, false);
      if (c) {
        s.gold = { ...c, born: s.tick };
        s.fx.push({ k: 'goldin', x: c.x, y: c.y });
      } else s.nextGold = s.tick + HZ;
    }
  }

  return s;
}

// ------------------------------------------------------------------ автопилот для демо

function blocked(s, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
  if (s.blocks.some((b) => b.x === x && b.y === y)) return true;
  for (let i = 0; i < s.body.length - 1; i++) if (s.body[i].x === x && s.body[i].y === y) return true;
  return false;
}

function room(s, x, y, need) {
  const seen = new Set([x + y * COLS]);
  const stack = [[x, y]];
  while (stack.length && seen.size < need) {
    const [cx, cy] = stack.pop();
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = nx + ny * COLS;
      if (seen.has(k) || blocked(s, nx, ny)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return seen.size;
}

export function bot(s, mem, rng) {
  if (s.over || s.queue.length || mem.m === s.moves) return [];
  mem.m = s.moves;
  const h = s.body[0];
  const target = s.gold || s.pass;
  const options = [];
  for (let d = 0; d < 4; d++) {
    if ((d + 2) % 4 === s.dir) continue;
    const nx = h.x + DIRS[d][0];
    const ny = h.y + DIRS[d][1];
    if (blocked(s, nx, ny)) continue;
    const need = s.body.length + 4;
    const space = room(s, nx, ny, need);
    let score = target ? -(Math.abs(target.x - nx) + Math.abs(target.y - ny)) : 0;
    if (space < need) score -= 1000 - space;
    if (d === s.dir) score += 0.3;
    options.push({ d, score: score + rng() * 0.5 });
  }
  if (!options.length) return [];
  options.sort((a, b) => b.score - a.score);
  // Иногда «по-человечески» ошибается, чтобы демо не шло вечно
  const pick = options.length > 1 && rng() < 0.04 && options[1].score > -500 ? options[1] : options[0];
  return pick.d !== s.dir ? [[EV_TURN, pick.d, 0]] : [];
}

// ------------------------------------------------------------------ ввод

const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };

function key(code, down, ctl) {
  if (!(code in KEYS)) return false;
  if (down) ctl.push(EV_TURN, KEYS[code]);
  return true;
}

/** Клик: повернуть в сторону клика (поперёк текущего хода) */
function pointer(type, x, y, button, ctl, ui, s) {
  if (type !== 'down' || !s) return;
  const h = s.body[0];
  const dir = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  const dx = x - (h.x * CELL + CELL / 2);
  const dy = y - (TOP + h.y * CELL + CELL / 2);
  if (dir === 1 || dir === 3) ctl.push(EV_TURN, dy < 0 ? 0 : 2);
  else ctl.push(EV_TURN, dx < 0 ? 3 : 1);
}

// ------------------------------------------------------------------ эффекты

function onFx(view, f) {
  const cx = f.x * CELL + CELL / 2;
  const cy = TOP + f.y * CELL + CELL / 2;
  const fx = view.fx;
  if (f.k === 'pick') {
    fx.text(cx, cy - 8, `+${f.pts}`, '#fff3de', 10);
    fx.burst(cx, cy, [f.color, '#fff3de'], 8, 1.2, 22);
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

// ------------------------------------------------------------------ картинка

let tileCache = null;
function tiles(scale) {
  if (tileCache && tileCache.scale === scale) return tileCache.cv;
  const cv = document.createElement('canvas');
  cv.width = W * scale;
  cv.height = H * scale;
  const c = cv.getContext('2d');
  c.setTransform(scale, 0, 0, scale, 0, 0);
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
  tileCache = { scale, cv };
  return cv;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawBlock(ctx, b) {
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

function ring(ctx, cx, cy, r, k, color) {
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

function drawStop(ctx, p, tick, clock) {
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

function drawGold(ctx, g, tick, clock) {
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

function seg(s, i, f) {
  const a = s.from[i] ?? s.body[i];
  const b = s.body[i];
  return { x: (a.x + (b.x - a.x) * f) * CELL + CELL / 2, y: TOP + (a.y + (b.y - a.y) * f) * CELL + CELL / 2 };
}

function drawTrain(ctx, s, f, clock) {
  const pts = s.body.map((_, i) => seg(s, i, f));
  // сцепки
  ctx.strokeStyle = '#5c4f49';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i].x, pts[i].y);
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

function draw(ctx, s, view, ui, st, best) {
  ctx.drawImage(tiles(ctx.getTransform().a), 0, 0, W * ctx.getTransform().a, H * ctx.getTransform().a, 0, 0, W, H);
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

const def = { meta, makeSim, bot, key, pointer, onFx, draw };

export function createGame(canvas, opts) {
  return runCabinet(canvas, def, opts);
}

export function replay(seed, log, ticks) {
  return replayRun(makeSim, seed, log, ticks);
}
