// «Песочный замок» — арканоид на пляже (логика без экрана; картинка — client/lobby/plaza3/arcade/castle.ts):
// надувным матрасом отбиваешь пляжный мяч и разбиваешь замок из песка. Сухой песок — с одного удара, мокрый — с двух,
// камни не бьются. Ракушки роняют подарки. Три мяча на игру. Разбил замок — следующий больше, а мяч быстрее.
// Перенесено из лаборатории (lab/plaza3/arcade/games/castle.js) без изменений логики.
import { H, HZ, W, irand, rngFrom, type ArcEvent, type ArcFx, type ArcMeta, type ArcSimBase } from './kit.ts';

export const meta: ArcMeta = {
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
  coins: [8, 15, 25],
  cursor: 'none',
};

export const L = 8;
export const R = W - 8;
const TOPY = 28;
export const PY = 222;
export const PH = 6;
const PW = 46;
const PW_WIDE = 72;
export const BALL = 5;
export const BX0 = 8;
export const BY0 = 40;
export const BW = 16;
export const BH = 8;
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
const TYPE: Record<string, number> = { s: 1, w: 2, h: 3, k: 4, f: 5 };
const PTS = [0, 10, 20, 30, 0, 50];
export type DropKind = 'wide' | 'multi' | 'slow' | 'life';
const DROPS: DropKind[] = ['wide', 'multi', 'slow', 'life'];

export interface Brick {
  r: number;
  c: number;
  t: number;
  hp: number;
}
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface Drop {
  x: number;
  y: number;
  kind: DropKind;
}

export interface CastleSim extends ArcSimBase {
  level: number;
  lives: number;
  px: number;
  pw: number;
  wideT: number;
  slowT: number;
  keyL: number;
  keyR: number;
  balls: Ball[];
  grid: Array<Array<Brick | null>>;
  left: number;
  drops: Drop[];
  held: boolean;
  holdT: number;
  speed: number;
  hits: number;
  chain: number;
  sincePaddle: number;
}

const baseSpeed = (level: number): number => Math.min(4.2, 2.6 + 0.3 * (level - 1));
/** Скорость мяча: растёт от отскоков и от времени (каждые 10 с), чтобы партия не тянулась дольше 3–4 минут */
const ballSpeed = (s: CastleSim): number => Math.min(baseSpeed(s.level) + 2, baseSpeed(s.level) + 0.04 * s.hits + 0.15 * Math.floor(s.tick / 600));

export function makeSim(seed: number): CastleSim {
  const rng = rngFrom(seed);
  const s: CastleSim = {
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
  const fx = (f: ArcFx): void => {
    s.fx.push(f);
  };

  function build(): void {
    const rows = LEVELS[(s.level - 1) % LEVELS.length];
    s.grid = [];
    s.left = 0;
    for (let r = 0; r < rows.length; r++) {
      const line = rows[r].padEnd(COLS, '.').slice(0, COLS);
      const row: Array<Brick | null> = [];
      for (let c = 0; c < COLS; c++) {
        const t = TYPE[line[c]] ?? 0;
        if (!t) {
          row.push(null);
          continue;
        }
        row.push({ r, c, t, hp: t === 2 ? 2 : 1 });
        if (t !== 4) s.left++;
      }
      s.grid.push(row);
    }
    s.drops = [];
  }

  function serve(): void {
    s.held = true;
    s.holdT = 0;
    s.balls = [{ x: s.px + s.pw / 2 - BALL / 2, y: PY - BALL - 1, vx: 0, vy: 0 }];
    s.hits = 0;
    s.speed = ballSpeed(s);
    s.chain = 0;
    s.sincePaddle = 0;
  }

  function launch(): void {
    if (!s.held) return;
    s.held = false;
    const b = s.balls[0];
    const k = (rng() < 0.5 ? -1 : 1) * (0.3 + rng() * 0.25);
    b.vx = s.speed * k;
    b.vy = -Math.sqrt(s.speed * s.speed - b.vx * b.vx);
    fx({ k: 'bounce', x: b.x, y: b.y });
  }

  build();
  serve();

  function setPaddle(x: number): void {
    const c = s.px + s.pw / 2;
    s.px = Math.max(L, Math.min(R - s.pw, x - s.pw / 2));
    if (s.held && c !== s.px + s.pw / 2) s.balls[0].x = s.px + s.pw / 2 - BALL / 2;
  }

  function hitBrick(br: Brick): void {
    if (br.t === 4) {
      fx({ k: 'stone', x: BX0 + br.c * BW + BW / 2, y: BY0 + br.r * BH + BH / 2 });
      return;
    }
    br.hp--;
    const cx = BX0 + br.c * BW + BW / 2;
    const cy = BY0 + br.r * BH + BH / 2;
    if (br.hp > 0) {
      s.score += 5;
      fx({ k: 'crack', x: cx, y: cy });
      return;
    }
    s.grid[br.r][br.c] = null;
    s.left--;
    const pts = PTS[br.t] + 2 * Math.min(10, s.chain);
    s.chain++;
    s.score += pts;
    fx({ k: 'brick', x: cx, y: cy, pts, t: br.t });
    if (br.t === 3) {
      let kind = DROPS[irand(rng, s.lives < 5 ? 4 : 3)];
      if (kind === 'life' && rng() < 0.5) kind = 'wide';
      s.drops.push({ x: cx, y: cy, kind });
    }
  }

  function brickAt(c: number, r: number): Brick | null {
    if (r < 0 || r >= s.grid.length || c < 0 || c >= COLS) return null;
    return s.grid[r][c];
  }

  function moveBall(b: Ball, k: number): void {
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * k;
    const n = Math.max(1, Math.ceil(sp / 2));
    for (let i = 0; i < n; i++) {
      const ox = b.x;
      const oy = b.y;
      b.x += (b.vx * k) / n;
      b.y += (b.vy * k) / n;
      if (b.x < L) {
        b.x = L;
        b.vx = Math.abs(b.vx);
        fx({ k: 'wall', x: b.x, y: b.y });
      }
      if (b.x + BALL > R) {
        b.x = R - BALL;
        b.vx = -Math.abs(b.vx);
        fx({ k: 'wall', x: b.x, y: b.y });
      }
      if (b.y < TOPY) {
        b.y = TOPY;
        b.vy = Math.abs(b.vy);
        fx({ k: 'wall', x: b.x, y: b.y });
      }
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
        fx({ k: 'bounce', x: b.x, y: b.y });
        return;
      }
      // песок
      const c0 = Math.floor((b.x - BX0) / BW);
      const c1 = Math.floor((b.x + BALL - 1 - BX0) / BW);
      const r0 = Math.floor((b.y - BY0) / BH);
      const r1 = Math.floor((b.y + BALL - 1 - BY0) / BH);
      let hit: Brick | null = null;
      for (let r = r0; r <= r1 && !hit; r++) for (let c = c0; c <= c1 && !hit; c++) hit = brickAt(c, r);
      if (hit) {
        const bx = BX0 + hit.c * BW;
        const wasInX = ox + BALL > bx && ox < bx + BW;
        if (wasInX) b.vy = -b.vy;
        else b.vx = -b.vx;
        b.x = ox;
        b.y = oy;
        hitBrick(hit);
        return;
      }
    }
  }

  function step(events: readonly ArcEvent[]): void {
    if (s.over) return;
    for (const e of events) {
      if (e[0] === EV_X) setPaddle(e[1]);
      else if (e[0] === EV_KEY) {
        if (e[1] === 0) s.keyL = e[2] ? 1 : 0;
        else s.keyR = e[2] ? 1 : 0;
      } else if (e[0] === EV_SERVE) launch();
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
        fx({ k: 'lose', x: s.px + s.pw / 2, y: PY });
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
        fx({ k: 'power', x: d.x, y: PY - 6, kind: d.kind });
        if (d.kind === 'wide') {
          const c = s.px + s.pw / 2;
          s.pw = PW_WIDE;
          s.wideT = 14 * HZ;
          setPaddle(c);
        } else if (d.kind === 'slow') s.slowT = 9 * HZ;
        else if (d.kind === 'life') s.lives = Math.min(5, s.lives + 1);
        else if (d.kind === 'multi' && !s.held && s.balls.length) {
          const b = s.balls[0];
          for (const kk of [-0.55, 0.55]) {
            const vx = s.speed * kk;
            s.balls.push({ x: b.x, y: b.y, vx, vy: -Math.sqrt(s.speed * s.speed - vx * vx) });
          }
        }
      } else if (d.y > H) s.drops.splice(i, 1);
    }
    if (s.left <= 0) {
      s.score += 250;
      fx({ k: 'clear', x: W / 2, y: 110, level: s.level });
      s.level++;
      build();
      serve();
    }
  }

  return s;
}

/** Событие в границах игры: матрас мышью (x экрана), клавиша ←/→ (нажата/отпущена), подача */
export function validEvent(type: number, a: number, b: number): boolean {
  if (type === EV_X) return a >= -20 && a <= W + 20 && b === 0;
  if (type === EV_KEY) return (a === 0 || a === 1) && (b === 0 || b === 1);
  return type === EV_SERVE && a === 0 && b === 0;
}

// ------------------------------------------------------------------ автопилот для демо

export function bot(s: CastleSim, mem: { serve?: number; hits?: number; off?: number; x?: number; sent?: number }, rng: () => number): ArcEvent[] {
  if (s.over) return [];
  const ev: ArcEvent[] = [];
  if (s.held) {
    mem.serve = (mem.serve ?? 30 + irand(rng, 40)) - 1;
    if (mem.serve <= 0) {
      ev.push([EV_SERVE, 0, 0]);
      mem.serve = undefined;
    }
  }
  let target = W / 2;
  let lowest: Ball | null = null;
  for (const b of s.balls) if (b.vy >= 0 && (!lowest || b.y > lowest.y)) lowest = b;
  if (lowest && lowest.y < 110) lowest = null;
  if (lowest) {
    if (mem.hits !== s.hits) {
      mem.hits = s.hits;
      mem.off = (rng() - 0.5) * s.pw * (rng() < 0.12 ? 1.25 : 0.7);
    }
    target = lowest.x + BALL / 2 + (mem.off ?? 0);
  } else if (s.drops.length) target = s.drops[0].x;
  else if (s.balls[0]) target = s.balls[0].x;
  mem.x = mem.x ?? W / 2;
  const v = 3.3;
  mem.x += Math.max(-v, Math.min(v, target - mem.x));
  const px = Math.round(mem.x);
  if (px !== mem.sent) {
    mem.sent = px;
    ev.push([EV_X, px, 0]);
  }
  return ev;
}
