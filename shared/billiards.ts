// Бильярд в казино набережной — «американка»: 15 одинаковых шаров и биток, любой шар в любую лузу, кто первым забил 8 —
// выиграл. Здесь общее для сервера и клиента: зал и столы, детерминированная 2D-физика на плоскости стола, правила удара,
// ставки и типы сообщений.
//
// Физика: фиксированный шаг SIM_DT, в шаге — только + − × ÷ и Math.sqrt (они округляются одинаково в любом движке JS),
// никаких sin/cos/exp/hypot. Начальную скорость битка (vx, vz) считает сервер и шлёт числами — клиенты проигрывают тот же
// расчёт бит в бит, а конечные позиции всё равно приходят с сервера в виде стола.
import { TICK_RATE } from './constants.ts';
import type { MapBox } from './maps/types.ts';

// ------------------------------------------------------------ зал

/** Пристройка к павильону автоматов: навес на столбах к югу от него. Столы — длинной стороной с севера на юг. */
export const BL_HALL = { x0: -28, x1: -12.6, z0: -16, z1: -7.8, roofY: 4.25, eaveY: 3.75 } as const;
/** Центры столов (мировые x, z). Номер стола — индекс. */
export const BL_TABLES: ReadonlyArray<{ readonly x: number; readonly z: number }> = [
  { x: -24.5, z: -11.9 },
  { x: -20, z: -11.9 },
  { x: -15.5, z: -11.9 },
];
export const BL_TABLE_COUNT = BL_TABLES.length;
/** Столбы навеса по южному краю (x, z), 0,18 × 0,18 м */
export const BL_POSTS: ReadonlyArray<readonly [number, number]> = [[-27.8, -7.9], [-22.25, -7.9], [-17.75, -7.9], [-12.8, -7.9]];

// ------------------------------------------------------------ стол (локальные координаты: x — поперёк, z — вдоль)

/** Игровое поле: половина ширины (x) и длины (z), м. Полный стол 2,24 × 1,12 — «восьмифутовый». */
export const BL_HX = 0.56;
export const BL_HZ = 1.12;
/** Радиус шара, м (57 мм) */
export const BL_R = 0.0285;
/** Высота сукна над полом, м */
export const BL_SURFACE_Y = 0.8;
/** Борт (резина) и деревянная рама поверх поля, м: снаружи рамы стол кончается */
export const BL_CUSHION = 0.05;
export const BL_RAIL = 0.11;
/** Половины внешнего размера стола (коллизия набережной) */
export const BL_OUT_HX = BL_HX + BL_CUSHION + BL_RAIL;
export const BL_OUT_HZ = BL_HZ + BL_CUSHION + BL_RAIL;
/** Проём угловой лузы: резина борта начинается на столько от угла по каждому борту */
export const BL_CORNER_GAP = 0.085;
/** Половина проёма средней лузы (на длинных бортах x = ±HX, при z = 0) */
export const BL_SIDE_GAP = 0.066;
/** Лузы: центр (на линии бортов) и радиус «захвата» центра шара. 0–3 — углы, 4–5 — средние. */
export const BL_POCKETS: ReadonlyArray<{ readonly x: number; readonly z: number; readonly r: number }> = [
  { x: -BL_HX, z: -BL_HZ, r: 0.05 },
  { x: BL_HX, z: -BL_HZ, r: 0.05 },
  { x: -BL_HX, z: BL_HZ, r: 0.05 },
  { x: BL_HX, z: BL_HZ, r: 0.05 },
  { x: -BL_HX, z: 0, r: 0.03 },
  { x: BL_HX, z: 0, r: 0.03 },
];
/** Отрезки бортов (x0, z0, x1, z1): между лузами. Концы отрезков — «губки» луз: шар от них отскакивает. */
export const BL_RAILS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-BL_HX, -BL_HZ + BL_CORNER_GAP, -BL_HX, -BL_SIDE_GAP],
  [-BL_HX, BL_SIDE_GAP, -BL_HX, BL_HZ - BL_CORNER_GAP],
  [BL_HX, -BL_HZ + BL_CORNER_GAP, BL_HX, -BL_SIDE_GAP],
  [BL_HX, BL_SIDE_GAP, BL_HX, BL_HZ - BL_CORNER_GAP],
  [-BL_HX + BL_CORNER_GAP, -BL_HZ, BL_HX - BL_CORNER_GAP, -BL_HZ],
  [-BL_HX + BL_CORNER_GAP, BL_HZ, BL_HX - BL_CORNER_GAP, BL_HZ],
];
/** «Дом» (откуда бьют начальный удар и куда ставят биток после фола) и точка пирамиды */
export const BL_HEAD = { x: 0, z: -BL_HZ / 2 } as const;
export const BL_FOOT = { x: 0, z: BL_HZ / 2 } as const;

/**
 * Крыша навеса для карты укрытий от дождя (у клиента, как рубка баркаса): полосы по 0,5 м с севера на юг по скату от
 * roofY к eaveY. Дождь под навесом не идёт, пол не мокнет, брызги — на крыше. Коллизия у крыши своя (невидимый бокс).
 */
export function billiardsCover(): MapBox[] {
  const H = BL_HALL;
  const x0 = H.x0 - 0.12, x1 = H.x1 + 0.22, z1 = H.z1 + 0.2;
  const out: MapBox[] = [];
  for (let z = H.z0; z < z1 - 1e-6; z += 0.5) {
    const top = H.roofY + ((z - H.z0) * (H.eaveY - H.roofY)) / (H.z1 - H.z0) + 0.05;
    out.push({ min: [x0, top - 0.1, z], max: [x1, top, Math.min(z1, z + 0.5)], mat: 'wood', color: 0x6b4a36 });
  }
  return out;
}

/** Места игроков у стола: 0 — западная длинная сторона, 1 — восточная. Где стоит желейка и куда смотрит. */
export function blSpot(table: number, side: number): { x: number; z: number; yaw: number } {
  const t = BL_TABLES[table];
  const dx = BL_OUT_HX + 0.5;
  return side === 0 ? { x: t.x - dx, z: t.z, yaw: -Math.PI / 2 } : { x: t.x + dx, z: t.z, yaw: Math.PI / 2 };
}

// ------------------------------------------------------------ физика

/** Шаг физики, с: 600 шагов в секунду — за шаг даже самый сильный удар проходит меньше трети радиуса шара */
export const SIM_HZ = 600;
export const SIM_DT = 1 / SIM_HZ;
/** Не дольше 12 с: дальше всё, что ещё катится, останавливается */
export const SIM_MAX_STEPS = 12 * SIM_HZ;
/** Кадр анимации у клиента — каждые столько шагов (60 кадров в секунду) */
export const SIM_FRAME_STEPS = 10;
/** Качение: постоянное торможение (м/с²) и пропорциональное скорости (1/с) — быстрые шары после разбоя гаснут заметнее,
 *  слабые катятся как раньше; ниже V_STOP шар стоит */
const ROLL_A = 0.3;
const ROLL_K = 0.35;
const V_STOP = 0.006;
/** Упругость шар–шар и шар–борт; трение вдоль борта при ударе */
const E_BALL = 0.93;
const E_RAIL = 0.7;
const RAIL_SLIP = 0.94;
/**
 * Шар о шар — жёсткая пружина на время касания CONTACT_S (несколько подшагов): толчок расходится по всей пирамиде сразу,
 * как в настоящем бильярде, и сильный разбой разводит шары по столу. Одиночный удар — тот же обмен скоростью вдоль линии
 * центров с упругостью E_BALL: сжатие жёсткостью K_PRESS, отдача — K_RELEASE = E²·K_PRESS.
 */
const CONTACT_S = 0.0015;
const SUB = 8;
const SUB_DT = SIM_DT / SUB;
const CONTACT_W = Math.PI / CONTACT_S;
const K_PRESS = (CONTACT_W * CONTACT_W) / 2;
const K_RELEASE = K_PRESS * E_BALL * E_BALL;
/** Скорость битка по силе удара 0…1, м/с */
export const BL_VMIN = 0.25;
export const BL_VMAX = 5;

/** 0 — биток, 1…15 — шары. on — на столе. */
export interface BlBall {
  x: number;
  z: number;
  vx: number;
  vz: number;
  on: boolean;
}

export interface BlSimEvents {
  /** шар a ударил шар b; v — скорость сближения, м/с */
  hit?(step: number, a: number, b: number, v: number): void;
  /** шар a отскочил от борта; v — скорость в борт */
  rail?(step: number, a: number, v: number): void;
  /** шар a упал в лузу p */
  pot?(step: number, a: number, p: number): void;
}

export interface BlSimResult {
  /** Сколько шагов катились шары */
  steps: number;
  /** Упавшие шары по порядку и лузы */
  potted: number[];
  pockets: number[];
  /** Первый шар, которого коснулся биток (−1 — ни одного) */
  firstHit: number;
}

export function makeBalls(): BlBall[] {
  return Array.from({ length: 16 }, () => ({ x: 0, z: 0, vx: 0, vz: 0, on: false }));
}

/** Пирамида: биток в «доме», 15 шаров треугольником вершиной к битку. */
export function rack(balls: BlBall[] = makeBalls()): BlBall[] {
  const gap = 0.0006;
  const d = 2 * BL_R + gap;
  const row = d * 0.8660254037844386;
  let k = 1;
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i <= r; i++) {
      const b = balls[k++];
      b.x = (i - r / 2) * d;
      b.z = BL_FOOT.z + (r - 2) * row;
      b.vx = b.vz = 0;
      b.on = true;
    }
  }
  const cue = balls[0];
  cue.x = BL_HEAD.x;
  cue.z = BL_HEAD.z;
  cue.vx = cue.vz = 0;
  cue.on = true;
  return balls;
}

/** Свободно ли место для шара i (никого ближе двух радиусов, внутри поля). */
function freeAt(balls: BlBall[], i: number, x: number, z: number): boolean {
  if (x < -BL_HX + BL_R || x > BL_HX - BL_R || z < -BL_HZ + BL_R || z > BL_HZ - BL_R) return false;
  for (let j = 0; j < balls.length; j++) {
    if (j === i || !balls[j].on) continue;
    const dx = balls[j].x - x, dz = balls[j].z - z;
    if (dx * dx + dz * dz < 4 * BL_R * BL_R + 1e-9) return false;
  }
  return true;
}

/** Вернуть шар i на стол в точку (x, z), а если занято — в ближайшую свободную вдоль стола, потом поперёк. */
export function respot(balls: BlBall[], i: number, x: number, z: number): void {
  const b = balls[i];
  const step = 2 * BL_R + 0.002;
  for (let k = 0; k < 80; k++) {
    // 0, +1, −1, +2, −2… шагов вдоль стола; каждые 16 — ещё ряд поперёк
    const along = ((k % 16) + 1) >> 1;
    const sign = k % 2 === 0 ? 1 : -1;
    const across = (k >> 4) * step * (((k >> 4) % 2) === 0 ? 1 : -1);
    const tz = z + sign * along * step;
    const tx = x + across;
    if (freeAt(balls, i, tx, tz)) {
      b.x = tx; b.z = tz; b.vx = b.vz = 0; b.on = true;
      return;
    }
  }
  b.x = x; b.z = z; b.vx = b.vz = 0; b.on = true;
}

/** Все ли шары стоят. */
export function atRest(balls: readonly BlBall[]): boolean {
  return balls.every((b) => !b.on || (b.vx === 0 && b.vz === 0));
}

/**
 * Прокатить удар: биток получает скорость (vx, vz), дальше — до остановки всех шаров (или SIM_MAX_STEPS).
 * Меняет balls на месте. frame(step) — после каждого SIM_FRAME_STEPS шага (для анимации у клиента).
 */
export function simulate(balls: BlBall[], vx: number, vz: number, ev?: BlSimEvents, frame?: (step: number) => void): BlSimResult {
  const res: BlSimResult = { steps: 0, potted: [], pockets: [], firstHit: -1 };
  const cue = balls[0];
  if (!cue.on || !Number.isFinite(vx) || !Number.isFinite(vz)) return res;
  cue.vx = vx;
  cue.vz = vz;
  const n = balls.length;
  const D = 2 * BL_R;
  const D2 = D * D;
  // пары, которые могут коснуться за шаг (i, j подряд), и номер подшага, на котором пара последний раз касалась
  const cand: number[] = [];
  const touched = new Int32Array(n * n).fill(-2);
  let sub = 0;
  let step = 0;
  while (step < SIM_MAX_STEPS) {
    step++;
    let moving = false;
    let vmax = 0;
    // качение: торможение
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.on || (b.vx === 0 && b.vz === 0)) continue;
      const s = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
      const ns = s - (ROLL_A + ROLL_K * s) * SIM_DT;
      if (ns <= V_STOP) {
        b.vx = 0; b.vz = 0;
        continue;
      }
      const f = ns / s;
      b.vx *= f; b.vz *= f;
      if (ns > vmax) vmax = ns;
      moving = true;
    }
    if (!moving) break;
    // кто может коснуться за этот шаг: оба навстречу на полной скорости
    cand.length = 0;
    const reach = D + 2 * vmax * SIM_DT;
    const reach2 = reach * reach;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (!b.on || (a.vx === 0 && a.vz === 0 && b.vx === 0 && b.vz === 0)) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        if (dx * dx + dz * dz < reach2) cand.push(i, j);
      }
    }
    if (cand.length === 0) {
      for (let i = 0; i < n; i++) {
        const b = balls[i];
        if (!b.on) continue;
        b.x += b.vx * SIM_DT;
        b.z += b.vz * SIM_DT;
      }
      sub += SUB;
    } else {
      // касание — подшагами: пружина вдоль линии центров, сдвиг понемногу
      for (let s = 0; s < SUB; s++, sub++) {
        for (let c = 0; c < cand.length; c += 2) {
          const i = cand[c], j = cand[c + 1];
          const a = balls[i], b = balls[j];
          const dx = b.x - a.x, dz = b.z - a.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= D2 || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          const pair = i * n + j;
          if (touched[pair] !== sub - 1 && rv > 0) {
            // новое касание: для звука и правил
            if (i === 0 && res.firstHit < 0) res.firstHit = j;
            ev?.hit?.(step, i, j, rv);
          }
          touched[pair] = sub;
          const k = (rv > 0 ? K_PRESS : K_RELEASE) * (D - d) * SUB_DT;
          a.vx -= k * nx; a.vz -= k * nz;
          b.vx += k * nx; b.vz += k * nz;
        }
        for (let i = 0; i < n; i++) {
          const b = balls[i];
          if (!b.on) continue;
          b.x += b.vx * SUB_DT;
          b.z += b.vz * SUB_DT;
        }
      }
    }
    // лузы и борта
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.on) continue;
      let pocket = -1;
      for (let p = 0; p < BL_POCKETS.length; p++) {
        const pk = BL_POCKETS[p];
        const dx = b.x - pk.x, dz = b.z - pk.z;
        if (dx * dx + dz * dz < pk.r * pk.r) { pocket = p; break; }
      }
      // за линию бортов шар может уйти только в проём лузы — значит, упал в ближайшую
      if (pocket < 0 && (b.x < -BL_HX || b.x > BL_HX || b.z < -BL_HZ || b.z > BL_HZ)) pocket = nearestPocket(b.x, b.z);
      if (pocket >= 0) {
        b.on = false; b.vx = 0; b.vz = 0;
        res.potted.push(i); res.pockets.push(pocket);
        ev?.pot?.(step, i, pocket);
        continue;
      }
      for (let r = 0; r < BL_RAILS.length; r++) {
        const [x0, z0, x1, z1] = BL_RAILS[r];
        const sx = x1 - x0, sz = z1 - z0;
        let t = ((b.x - x0) * sx + (b.z - z0) * sz) / (sx * sx + sz * sz);
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const cx = x0 + sx * t, cz = z0 + sz * t;
        const dx = b.x - cx, dz = b.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= BL_R * BL_R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        b.x = cx + nx * BL_R; b.z = cz + nz * BL_R;
        const vn = b.vx * nx + b.vz * nz;
        if (vn >= 0) continue;
        // нормальная часть отражается с потерей, касательная чуть гасится
        const tx = b.vx - vn * nx, tz = b.vz - vn * nz;
        b.vx = tx * RAIL_SLIP - vn * E_RAIL * nx;
        b.vz = tz * RAIL_SLIP - vn * E_RAIL * nz;
        ev?.rail?.(step, i, -vn);
      }
    }
    if (frame && step % SIM_FRAME_STEPS === 0) frame(step);
  }
  for (const b of balls) { b.vx = 0; b.vz = 0; }
  relax(balls);
  res.steps = step;
  if (frame && step % SIM_FRAME_STEPS !== 0) frame(step);
  return res;
}

/** Остановились на касании и чуть вдавлены — раздвинуть, не выпуская за борта (доли миллиметра). */
function relax(balls: BlBall[]): void {
  const D = 2 * BL_R;
  const lx = BL_HX - BL_R, lz = BL_HZ - BL_R;
  const keep = (v: number, old: number, lim: number) => (v > lim && old <= lim ? lim : v < -lim && old >= -lim ? -lim : v);
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.on) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= D * D || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (D - d) * 0.5 + 1e-6;
        const nx = dx / d, nz = dz / d;
        a.x = keep(a.x - nx * push, a.x, lx); a.z = keep(a.z - nz * push, a.z, lz);
        b.x = keep(b.x + nx * push, b.x, lx); b.z = keep(b.z + nz * push, b.z, lz);
        moved = true;
      }
    }
    if (!moved) return;
  }
}

function nearestPocket(x: number, z: number): number {
  let best = 0, bd = Infinity;
  for (let p = 0; p < BL_POCKETS.length; p++) {
    const dx = x - BL_POCKETS[p].x, dz = z - BL_POCKETS[p].z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** Скорость битка по направлению (угол в плоскости стола: 0 — вдоль +z, π/2 — вдоль +x) и силе 0…1 — считает сервер. */
export function cueVelocity(ang: number, power: number): { vx: number; vz: number } {
  const p = Math.min(1, Math.max(0, power));
  const v = BL_VMIN + (BL_VMAX - BL_VMIN) * p * Math.sqrt(p);
  return { vx: Math.sin(ang) * v, vz: Math.cos(ang) * v };
}

/** Шары на проводе: [x, z] подряд (у снятых — 0, 0) и маска «на столе» (бит i — шар i). */
export function packBalls(balls: readonly BlBall[]): { pos: number[]; on: number } {
  const pos: number[] = [];
  let on = 0;
  balls.forEach((b, i) => {
    pos.push(b.on ? b.x : 0, b.on ? b.z : 0);
    if (b.on) on |= 1 << i;
  });
  return { pos, on };
}

export function unpackBalls(pos: readonly number[], on: number, out: BlBall[] = makeBalls()): BlBall[] {
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    b.x = pos[2 * i] ?? 0;
    b.z = pos[2 * i + 1] ?? 0;
    b.vx = b.vz = 0;
    b.on = (on & (1 << i)) !== 0;
  }
  return out;
}

/** Сколько тиков сервера катятся шары после удара в steps шагов. */
export const rollTicks = (steps: number): number => Math.ceil((steps * TICK_RATE) / SIM_HZ);

// ------------------------------------------------------------ правила и ставки

/** Нужно забить, чтобы выиграть */
export const BL_WIN = 8;
/** Ход в партии — 30 с; ушедшего ждём 45 с, потом техническое поражение; итог на экране — 7 с */
export const BL_TURN_TICKS = 30 * TICK_RATE;
export const BL_AWAY_TICKS = 45 * TICK_RATE;
export const BL_RESULT_TICKS = 7 * TICK_RATE;
/** После остановки шаров — ещё полсекунды до следующего удара (запас на сеть и анимацию) */
export const BL_SETTLE_TICKS = 30;
/** Фишки в окне ставки и лимит стола. Комиссии нет: банк — две ставки, победитель забирает весь. */
export const BL_CHIPS: readonly number[] = [10, 20, 50, 100];
export const BL_MAX_BET = 1000;
export const BL_FEE = 0;
/** Ставка по правилам стола (без баланса): целое 0…лимит; 0 — партия без ставки. */
export const isBlBet = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= BL_MAX_BET;
export const blMaxBet = (balance: number): number => Math.max(0, Math.min(BL_MAX_BET, Math.floor(Number.isFinite(balance) ? balance : 0)));

/** Итог удара в партии: сколько очков, фол ли, какие шары вернуть на стол. */
export interface BlJudgement {
  scored: number;
  foul: boolean;
  /** Шары, которые возвращаются на стол (забиты фолом) */
  back: number[];
  /** Биток упал — ставится в «дом» */
  cueBack: boolean;
  /** Ход остаётся у бившего */
  again: boolean;
}

/**
 * Правила «американки» в простом виде: забил любой шар (не биток) — очко за каждый и бьёшь ещё; не забил — ход
 * сопернику; биток в лузе — фол: забитое этим ударом не считается и возвращается на стол, ход сопернику.
 */
export function judge(res: BlSimResult): BlJudgement {
  const balls = res.potted.filter((i) => i !== 0);
  const cueBack = res.potted.includes(0);
  if (cueBack) return { scored: 0, foul: true, back: balls, cueBack, again: false };
  return { scored: balls.length, foul: false, back: [], cueBack: false, again: balls.length > 0 };
}

export const BL_RULES_SHORT = 'Американка: бей битком (красный) по любому шару, любой шар — в любую лузу. Забил — бьёшь ещё, кто первым забил 8 — выиграл.';
export const BL_RULES_FOUL = 'Не забил — ход сопернику. Биток в лузе — фол: забитое этим ударом возвращается на стол.';

// ------------------------------------------------------------ сообщения

export type BlPhase = 'open' | 'match' | 'result';

export interface BlSeatView {
  pid: number;
  nick: string;
  /** Отошёл посреди партии: сколько мс ещё ждём (0 — на месте) */
  away: number;
}

export interface BlTableView {
  table: number;
  phase: BlPhase;
  /** Стороны стола: 0 — запад, 1 — восток */
  seats: [BlSeatView | null, BlSeatView | null];
  /** Предложенная партия: кто (сторона) и ставка; ставка предложившего уже в банке */
  offer: { by: number; amount: number } | null;
  /** Ставка каждого в партии (банк — вдвое больше) */
  bet: number;
  score: [number, number];
  /** Чей удар в партии (−1 — не партия) */
  turn: number;
  /** Сколько мс осталось на ход (считая с момента, когда остановятся шары) */
  left: number;
  /** Сколько мс ещё катятся шары */
  rolling: number;
  /** Номер последнего удара на этом столе */
  shot: number;
  /** Шары: [x, z] × 16 и маска «на столе» */
  pos: number[];
  on: number;
  /** Итог: победившая сторона и почему */
  winner: number;
  why: '' | 'score' | 'resign' | 'away';
  /** Что случилось последним ударом — строка для всех («Tester7 забил 2», «Фол: биток в лузе») */
  note: string;
}

/** Удар: стол, номер удара, кто бил (сторона, −1 — тренировка), откуда стояли шары и скорость битка. */
export interface BlShotWire {
  table: number;
  n: number;
  by: number;
  pos: number[];
  on: number;
  vx: number;
  vz: number;
  steps: number;
}

export type BilliardsClientMsg =
  | { t: 'bl'; a: 'shoot'; table: number; n: number; ang: number; pw: number }
  | { t: 'bl'; a: 'offer'; table: number; amount: number }
  | { t: 'bl'; a: 'cancel'; table: number }
  | { t: 'bl'; a: 'accept'; table: number; amount: number }
  | { t: 'bl'; a: 'rack'; table: number }
  | { t: 'bl'; a: 'resign'; table: number }
  | { t: 'bl'; a: 'aim'; table: number; ang: number; pw: number };

export type BilliardsServerMsg =
  | { t: 'bl'; v: BlTableView }
  | { t: 'blShot'; s: BlShotWire }
  | { t: 'blAim'; table: number; ang: number; pw: number }
  | { t: 'blErr'; table: number; text: string };
