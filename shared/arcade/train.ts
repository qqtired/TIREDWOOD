// «Паровозик» — змейка на набережной (логика без экрана; картинка — client/lobby/plaza3/arcade/train.ts).
// Курортный паровозик подбирает отдыхающих на остановках: каждый садится в новый вагончик. Врезался в парапет
// (край экрана), в клумбу или в свой хвост — крушение. Отдыхающий ждёт 9 с и уходит; каждые 4 пассажира — новая
// клумба; каждые 6 — быстрее. Перенесено из лаборатории (lab/plaza3/arcade/games/train.js) без изменений логики.
import { HZ, irand, rngFrom, type ArcEvent, type ArcFx, type ArcMeta, type ArcSimBase } from './kit.ts';

export const meta: ArcMeta = {
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
  coins: [8, 15, 25],
  cursor: 'pointer',
};

export const COLS = 20;
export const ROWS = 14;
export const CELL = 16;
export const TOP = 16;
/** вверх, вправо, вниз, влево */
export const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const COLORS = ['#ff8a1c', '#ff6b8a', '#7bd88f', '#a98bff', '#3fb6a8', '#ff5a4e', '#f59bd8', '#69c1f0'];
export const WAIT = 9 * HZ;
export const GOLD_WAIT = 5 * HZ;
const START_EVERY = 8;
const MIN_EVERY = 5;
const MAX_BLOCKS = 14;
export const EV_TURN = 1;

export interface Cell {
  x: number;
  y: number;
}
export interface Stop extends Cell {
  color: string;
  born: number;
}

export interface TrainSim extends ArcSimBase {
  body: Cell[];
  /** Откуда ехал каждый сегмент на последнем шаге — для плавной картинки */
  from: Cell[];
  /** Цвет пассажира в каждом вагоне (вагон i — сегмент i+1); null — пустой */
  cars: Array<string | null>;
  dir: number;
  queue: number[];
  every: number;
  since: number;
  moves: number;
  grow: string[];
  picked: number;
  blocks: Cell[];
  pass: Stop | null;
  gold: { x: number; y: number; born: number } | null;
  nextGold: number;
  crashAt: Cell | null;
  mult: number;
}

export function makeSim(seed: number): TrainSim {
  const rng = rngFrom(seed);
  const s: TrainSim = {
    tick: 0,
    score: 0,
    over: false,
    fx: [],
    body: [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }],
    from: [],
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

  const fx = (f: ArcFx): void => {
    s.fx.push(f);
  };
  const at = (list: readonly Cell[], x: number, y: number): boolean => list.some((p) => p.x === x && p.y === y);
  const taken = (x: number, y: number): boolean => at(s.body, x, y) || at(s.blocks, x, y) || (!!s.pass && s.pass.x === x && s.pass.y === y) || (!!s.gold && s.gold.x === x && s.gold.y === y);

  function ahead(x: number, y: number, n: number): boolean {
    const h = s.body[0];
    const [dx, dy] = DIRS[s.dir];
    for (let k = 1; k <= n; k++) if (h.x + dx * k === x && h.y + dy * k === y) return true;
    return false;
  }

  function freeCell(minDist: number, avoidAhead: boolean): Cell | null {
    const h = s.body[0];
    const ok = (x: number, y: number): boolean => !taken(x, y) && Math.abs(x - h.x) + Math.abs(y - h.y) >= minDist && !(avoidAhead && ahead(x, y, 5));
    for (let k = 0; k < 200; k++) {
      const x = irand(rng, COLS);
      const y = irand(rng, ROWS);
      if (ok(x, y)) return { x, y };
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (ok(x, y)) return { x, y };
    return null;
  }

  function spawnPass(): void {
    const c = freeCell(4, false);
    s.pass = c && { ...c, color: COLORS[irand(rng, COLORS.length)], born: s.tick };
  }
  spawnPass();

  function turn(d: number): void {
    if (!(d >= 0 && d < 4) || s.queue.length >= 2) return;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d === last || (d + 2) % 4 === last) return;
    s.queue.push(d);
  }

  function board(pts: number, x: number, y: number, color: string, gold: boolean): void {
    s.score += pts;
    s.picked++;
    s.grow.push(color);
    fx({ k: gold ? 'gold' : 'pick', x, y, pts, color });
    if (s.picked % 4 === 0 && s.blocks.length < MAX_BLOCKS) {
      const c = freeCell(4, true);
      if (c) {
        s.blocks.push(c);
        fx({ k: 'block', x: c.x, y: c.y });
      }
    }
    s.every = Math.max(MIN_EVERY, START_EVERY - Math.floor(s.picked / 6));
  }

  function move(): void {
    if (s.queue.length) s.dir = s.queue.shift()!;
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
      fx({ k: 'crash', x: h.x, y: h.y });
      return;
    }
    const old = s.body;
    s.body = [{ x: nx, y: ny }, ...old.slice(0, growing ? n : n - 1)];
    s.from = s.body.map((_, i) => ({ ...(old[i] ?? old[i - 1]) }));
    if (growing) s.cars.push(s.grow.shift()!);
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

  function step(events: readonly ArcEvent[]): void {
    if (s.over) return;
    for (const e of events) if (e[0] === EV_TURN) turn(e[1]);
    s.tick++;
    if (++s.since >= s.every) {
      s.since = 0;
      move();
      if (s.over) return;
    }
    if (s.pass && s.tick - s.pass.born > WAIT) {
      fx({ k: 'leave', x: s.pass.x, y: s.pass.y, color: s.pass.color });
      spawnPass();
    }
    if (s.gold && s.tick - s.gold.born > GOLD_WAIT) {
      fx({ k: 'goldgone', x: s.gold.x, y: s.gold.y });
      s.gold = null;
      s.nextGold = s.tick + 12 * HZ + irand(rng, 6 * HZ);
    }
    if (!s.gold && s.tick >= s.nextGold) {
      const c = freeCell(6, false);
      if (c) {
        s.gold = { ...c, born: s.tick };
        fx({ k: 'goldin', x: c.x, y: c.y });
      } else s.nextGold = s.tick + HZ;
    }
  }

  return s;
}

/** Событие в границах игры: поворот 0–3 */
export function validEvent(type: number, a: number, b: number): boolean {
  return type === EV_TURN && a >= 0 && a <= 3 && b === 0;
}

// ------------------------------------------------------------------ автопилот для демо

function blocked(s: TrainSim, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
  if (s.blocks.some((b) => b.x === x && b.y === y)) return true;
  for (let i = 0; i < s.body.length - 1; i++) if (s.body[i].x === x && s.body[i].y === y) return true;
  return false;
}

function room(s: TrainSim, x: number, y: number, need: number): number {
  const seen = new Set([x + y * COLS]);
  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length && seen.size < need) {
    const [cx, cy] = stack.pop()!;
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

export function bot(s: TrainSim, mem: Record<string, unknown>, rng: () => number): ArcEvent[] {
  if (s.over || s.queue.length || mem.m === s.moves) return [];
  mem.m = s.moves;
  const h = s.body[0];
  const target = s.gold || s.pass;
  const options: Array<{ d: number; score: number }> = [];
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
