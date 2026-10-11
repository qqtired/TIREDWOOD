// «Тир» — тир на набережной (логика без экрана; картинка — client/lobby/plaza3/arcade/tir.ts): 60 секунд, жестяные
// чайки, лодочки и крабы едут по рельсам, пират выглядывает из бочки. Серия попаданий умножает очки до ×5, промах
// сбрасывает серию. Желейка в спасательном круге — не мишень: −50. Последние 10 секунд очки ×2. Между выстрелами —
// 0,27 с. Перенесено из лаборатории (lab/plaza3/arcade/games/tir.js) без изменений логики.
import { H, HZ, W, irand, rngFrom, type ArcEvent, type ArcFx, type ArcMeta, type ArcSimBase } from './kit.ts';

export const meta: ArcMeta = {
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
  coins: [5, 10, 15],
  cursor: 'none',
};

export const DURATION = 60 * HZ;
export const FINAL = 50 * HZ;
export const COOLDOWN = 16;
type Kind = 'gull' | 'boat' | 'swimmer' | 'crab' | 'pirate';
const KINDS: Record<Kind, { w: number; h: number; pts: number }> = {
  gull: { w: 20, h: 13, pts: 30 },
  boat: { w: 22, h: 17, pts: 20 },
  swimmer: { w: 20, h: 17, pts: -50 },
  crab: { w: 18, h: 12, pts: 10 },
  pirate: { w: 18, h: 20, pts: 100 },
};
/** Полосы: высота мишени, куда едут, скорость (px/тик), интервал появления (тики) */
export const LANES: ReadonlyArray<{ y: number; dir: number; speed: number; gap: readonly [number, number]; kind: Kind }> = [
  { y: 50, dir: -1, speed: 1.0, gap: [40, 90], kind: 'gull' },
  { y: 105, dir: 1, speed: 0.55, gap: [50, 100], kind: 'boat' },
  { y: 153, dir: -1, speed: 0.42, gap: [45, 95], kind: 'crab' },
];
export const BARRELS = [64, 160, 256];
export const BARREL_Y = 190;
export const POP_LIFE = 84;
export const EV_SHOT = 1;

export interface Target {
  id: number;
  lane: number;
  kind: Kind;
  x: number;
  w: number;
  h: number;
  pts: number;
  alive: boolean;
  dead: number;
}
export interface Popper {
  x: number;
  born: number;
  alive: boolean;
  dead: number;
  pts: number;
  w: number;
}

export interface TirSim extends ArcSimBase {
  targets: Target[];
  next: number[];
  pop: Popper | null;
  nextPop: number;
  cool: number;
  streak: number;
  mult: number;
  shots: number;
  hits: number;
  left: number;
}

export const popUp = (p: Popper, tick: number): number => {
  const a = tick - p.born;
  if (a < 10) return a / 10;
  if (a > POP_LIFE - 10) return Math.max(0, (POP_LIFE - a) / 10);
  return 1;
};

export function makeSim(seed: number): TirSim {
  const rng = rngFrom(seed);
  const s: TirSim = {
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
  const fx = (f: ArcFx): void => {
    s.fx.push(f);
  };

  function spawn(li: number, x: number): void {
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

  function hitTest(x: number, y: number): Target | Popper | null {
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

  function shoot(x: number, y: number): void {
    if (s.cool > 0) return;
    s.cool = COOLDOWN;
    s.shots++;
    const t = hitTest(x, y);
    fx({ k: 'shot', x, y });
    if (!t) {
      s.streak = 0;
      s.mult = 1;
      fx({ k: 'miss', x, y });
      return;
    }
    t.alive = false;
    t.dead = s.tick;
    const isPop = t === s.pop;
    const ty = isPop ? BARREL_Y - 16 : LANES[(t as Target).lane].y;
    if (t.pts < 0) {
      s.score = Math.max(0, s.score + t.pts);
      s.streak = 0;
      s.mult = 1;
      fx({ k: 'bad', x: t.x, y: ty, pts: t.pts });
      return;
    }
    s.streak++;
    s.hits++;
    s.mult = Math.min(5, 1 + Math.floor(s.streak / 3));
    const pts = t.pts * s.mult * (s.tick >= FINAL ? 2 : 1);
    s.score += pts;
    fx({ k: 'hit', x: t.x, y: ty, pts, kind: isPop ? 'pirate' : (t as Target).kind });
  }

  function step(events: readonly ArcEvent[]): void {
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
      fx({ k: 'popup', x: s.pop.x, y: BARREL_Y - 20 });
    }
    if (s.tick === FINAL) fx({ k: 'final', x: W / 2, y: 120 });
    if (s.tick >= DURATION) {
      s.over = true;
      fx({ k: 'time', x: W / 2, y: 120 });
    }
  }

  return s;
}

/** Событие в границах игры: выстрел в точку экрана */
export function validEvent(type: number, a: number, b: number): boolean {
  return type === EV_SHOT && a >= 0 && a <= W && b >= 0 && b <= H;
}

// ------------------------------------------------------------------ автопилот для демо

/** Прицел (у бота и у игрока — одно и то же состояние экрана) */
export interface TirAim {
  x: number;
  y: number;
  recoil: number;
}

function targetPos(s: TirSim, t: Target | Popper): { x: number; y: number } {
  if (t === s.pop) return { x: t.x, y: BARREL_Y - 6 - 20 * popUp(t, s.tick) + 8 };
  const tt = t as Target;
  return { x: tt.x + LANES[tt.lane].dir * LANES[tt.lane].speed * 6, y: LANES[tt.lane].y };
}

export function bot(s: TirSim, mem: { t?: Target | Popper | null; wait?: number }, rng: () => number, ui: TirAim): ArcEvent[] {
  if (s.over) return [];
  let t = mem.t ?? null;
  const live = (q: Target | Popper | null): boolean => !!q && q.alive && (q === s.pop ? popUp(q, s.tick) > 0.8 : q.x > 16 && q.x < W - 16);
  if (s.pop && live(s.pop) && t !== s.pop && rng() < 0.2) t = null;
  if (!live(t)) {
    t = null;
    let bestD = 1e9;
    const cands: Array<Target | Popper> = s.targets.filter((q) => q.pts > 0 && live(q));
    if (s.pop && live(s.pop)) cands.push(s.pop);
    for (const q of cands) {
      const p = targetPos(s, q);
      const d = Math.abs(p.x - ui.x) + Math.abs(p.y - ui.y) * 0.7 - (q === s.pop ? 80 : 0);
      if (d < bestD) {
        bestD = d;
        t = q;
      }
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
  mem.wait = mem.wait ?? 0;
  if (d < 4 && s.cool === 0 && --mem.wait <= 0) {
    mem.wait = 8 + irand(rng, 14);
    const err = rng() < 0.24 ? 9 : 0;
    ui.recoil = 6;
    return [[EV_SHOT, Math.round(ui.x + err), Math.round(ui.y - err * 0.5)]];
  }
  return [];
}
