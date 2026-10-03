// Мяч на площади набережной. Пляжный: лёгкий (падает медленнее желеек), отскакивает от настила, стен и всего
// твёрдого (те же боксы, по которым ходят), катится с трением и тормозит в воздухе. Упал в воду — покачается
// на волнах и вернётся в середину площади; застрял там, куда не допрыгнуть, или долго лежит в дальнем углу —
// тоже. Пинок: желейка вбегает в мяч — он летит по направлению бега, от рывка — сильнее, в прыжке — выше;
// в стоящую желейку мяч просто упруго отскакивает. Решает сервер, 60 раз в секунду, и шлёт мяч в каждом снимке
// целиком (со скоростью); клиент считает его у себя тем же кодом — свой пинок видно сразу (client/lobby/ballsim.ts).
import { DT, PLAYER_HEIGHT, TICK_RATE, WATER_Y } from './constants.ts';
import type { CollisionWorld } from './world.ts';

/** Радиус: большой надувной мяч, по пояс желейке */
export const BALL_R = 0.34;
/** Дом мяча — середина мозаики «роза ветров» (сюда он возвращается, падая с высоты BALL_DROP_Y) */
export const BALL_HOME = { x: 0, z: 3.6 };
export const BALL_DROP_Y = 2.6;
/** Пинок с одной желейки — не чаще раза в столько тиков */
export const BALL_KICK_TICKS = 15;
/** В воде мяч качается столько тиков, потом пропадает и ещё через BALL_GONE_TICKS падает дома */
export const BALL_FLOAT_TICKS = 100;
export const BALL_GONE_TICKS = 30;
/** Лежит выше стольких метров (на крыше) столько тиков — домой */
export const BALL_STUCK_Y = 2.3;
export const BALL_STUCK_TICKS = 6 * TICK_RATE;
/** Никто не трогал 2 минуты, а лежит дальше BALL_FAR_R от дома — домой */
export const BALL_IDLE_TICKS = 120 * TICK_RATE;
const BALL_FAR_R = 6;

const GRAVITY = 15;
/** Сопротивление воздуха и трение качения, доля скорости в секунду; ROLL_STOP — ещё и постоянное торможение, м/с² */
const AIR_DRAG = 0.3;
const ROLL_DRAG = 0.65;
const ROLL_STOP = 0.4;
/** Отскок от пола и стен; в пол медленнее REST_VN — не отскакивает, а катится */
const BOUNCE_FLOOR = 0.7;
const BOUNCE_WALL = 0.6;
const REST_VN = 1.4;
/** С батута — вверх с такой скоростью (~4,4 м); каждый следующий отскок подряд — слабее во столько раз */
export const BALL_TRAMP_VY = 11.5;
const TRAMP_FADE = 0.75;
/** На батут быстрее этого — подбрасывает */
const TRAMP_HIT = 0.8;
/** Удар сильнее этой скорости — стук (клиенту — звук) */
const BOUNCE_SOUND = 2.2;
/** За подшаг — не дальше (тонкие столбы и заборы насквозь не проскочить) */
const SUBSTEP = 0.11;
/** Медленнее — «стоит»; столько тиков подряд — спит (шаг не считаем) */
const SLEEP_SPEED = 0.06;
const SLEEP_TICKS = 20;
/** Тело желейки для мяча — вертикальный цилиндр такого радиуса */
export const BALL_BODY_R = 0.46;
/** Пинок: скорость = KICK_BASE + бег × KICK_RUN (не больше KICK_MAX); подскок — с земли, с рывка, в прыжке */
const KICK_BASE = 2.4;
const KICK_RUN = 1.05;
const KICK_MAX = 17;
const KICK_VY = 2.4;
const KICK_VY_DASH = 3.4;
const KICK_VY_AIR = 6.8;
/** Пинок — если желейка бежит на мяч хотя бы так быстро, м/с */
const KICK_APPROACH = 1;
/** В стоящую желейку — отскок */
const JELLY_BOUNCE = 0.5;

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Опирается на что-то снизу (в последнем тике) */
  grounded: boolean;
  /** Тиков подряд почти без движения (с SLEEP_TICKS — спит) */
  still: number;
  /** Тиков в воде: 0 — на суше; до BALL_FLOAT_TICKS качается, потом пропал, затем — дома */
  wet: number;
  /** Тиков лежит там, куда не допрыгнуть */
  stuck: number;
  /** Тиков без пинков */
  idle: number;
  /** Отскоков с батута подряд (каждый следующий ниже) */
  tramps: number;
  /** Пинков и стуков, по кругу 0–255 (по ним клиент играет звук) */
  kicks: number;
  bounces: number;
}

/** Что нужно мячу от желейки (состояние игрока из shared/sim.ts подходит как есть). */
export interface BallKicker {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: number | boolean;
  dashT: number;
}

export function makeBall(): Ball {
  return {
    x: BALL_HOME.x, y: BALL_R, z: BALL_HOME.z, vx: 0, vy: 0, vz: 0, grounded: true, still: SLEEP_TICKS, wet: 0, stuck: 0, idle: 0,
    tramps: 0, kicks: 0, bounces: 0,
  };
}

// ------------------------------------------------------------ в снимке

/** Мяч в снимке набережной — сразу за списком сущностей: положение, скорость и счётчики, байт */
export const BALL_BYTES = 30;

export function writeBall(v: DataView, o: number, b: Ball): void {
  v.setFloat32(o, b.x, true);
  v.setFloat32(o + 4, b.y, true);
  v.setFloat32(o + 8, b.z, true);
  v.setFloat32(o + 12, b.vx, true);
  v.setFloat32(o + 16, b.vy, true);
  v.setFloat32(o + 20, b.vz, true);
  v.setUint8(o + 24, Math.min(255, b.wet));
  v.setUint8(o + 25, Math.min(255, b.still));
  v.setUint8(o + 26, b.grounded ? 1 : 0);
  v.setUint8(o + 27, Math.min(255, b.tramps));
  v.setUint8(o + 28, b.kicks & 255);
  v.setUint8(o + 29, b.bounces & 255);
}

/** Мяч из снимка. «Застрял» и «давно не пинали» не передаём: домой мяч отправляет только сервер. */
export function readBall(v: DataView, o: number, b: Ball): void {
  b.x = v.getFloat32(o, true);
  b.y = v.getFloat32(o + 4, true);
  b.z = v.getFloat32(o + 8, true);
  b.vx = v.getFloat32(o + 12, true);
  b.vy = v.getFloat32(o + 16, true);
  b.vz = v.getFloat32(o + 20, true);
  b.wet = v.getUint8(o + 24);
  b.still = v.getUint8(o + 25);
  b.grounded = v.getUint8(o + 26) === 1;
  b.tramps = v.getUint8(o + 27);
  b.kicks = v.getUint8(o + 28);
  b.bounces = v.getUint8(o + 29);
  b.stuck = 0;
  b.idle = 0;
}

export function copyBall(to: Ball, from: Ball): void {
  Object.assign(to, from);
}

/** Мяч виден (не пропал между водой и домом). */
export function ballShown(b: Ball): boolean {
  return b.wet < BALL_FLOAT_TICKS;
}

/** Мяч в воде (качается или пропал). */
export function ballWet(b: Ball): boolean {
  return b.wet > 0;
}

/** Домой: пропасть сейчас и через BALL_GONE_TICKS упасть на середину площади. */
export function sendBallHome(b: Ball): void {
  b.wet = BALL_FLOAT_TICKS;
  b.x = BALL_HOME.x;
  b.y = BALL_DROP_Y;
  b.z = BALL_HOME.z;
  b.vx = b.vy = b.vz = 0;
  b.stuck = 0;
  b.idle = 0;
  b.tramps = 0;
}

/** Тик мяча. true — только что упал в воду (всплеск). */
export function stepBall(b: Ball, w: CollisionWorld): boolean {
  if (b.wet > 0) {
    b.wet++;
    if (b.wet < BALL_FLOAT_TICKS) {
      // качается на волнах: всплывает к поверхности, скорость гаснет
      b.y += (WATER_Y + BALL_R * 0.35 - b.y) * 0.12;
      b.vx *= 0.97;
      b.vz *= 0.97;
      b.x += b.vx * DT;
      b.z += b.vz * DT;
    } else if (b.wet === BALL_FLOAT_TICKS) {
      sendBallHome(b);
    } else if (b.wet >= BALL_FLOAT_TICKS + BALL_GONE_TICKS) {
      b.wet = 0;
      b.still = 0;
      b.grounded = false;
    }
    return false;
  }
  b.idle++;
  if (b.still < SLEEP_TICKS) {
    move(b, w);
    if (b.y - BALL_R * 0.4 < WATER_Y) {
      b.wet = 1;
      b.vy = 0;
      b.vx *= 0.3;
      b.vz *= 0.3;
      b.still = 0;
      return true;
    }
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    if (b.grounded && sp < SLEEP_SPEED) {
      if (++b.still >= SLEEP_TICKS) b.vx = b.vy = b.vz = 0;
    } else {
      b.still = 0;
    }
  }
  // застрял там, куда не допрыгнуть, или давно не пинали, а он вдали (хоть и скачет на батуте) — домой
  b.stuck = b.still >= SLEEP_TICKS && b.y > BALL_STUCK_Y ? b.stuck + 1 : 0;
  if (b.stuck >= BALL_STUCK_TICKS) sendBallHome(b);
  else if (b.idle >= BALL_IDLE_TICKS && Math.hypot(b.x - BALL_HOME.x, b.z - BALL_HOME.z) > BALL_FAR_R) sendBallHome(b);
  return false;
}

/** Полёт за тик подшагами, удары о боксы; в конце — сопротивление воздуха и трение качения. */
function move(b: Ball, w: CollisionWorld): void {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  const n = Math.min(8, Math.max(1, Math.ceil((sp * DT) / SUBSTEP)));
  const h = DT / n;
  b.grounded = false;
  for (let i = 0; i < n; i++) {
    b.vy -= GRAVITY * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    collide(b, w);
  }
  const air = 1 - AIR_DRAG * DT;
  b.vx *= air;
  b.vy *= air;
  b.vz *= air;
  if (b.grounded) {
    const hs = Math.hypot(b.vx, b.vz);
    if (hs > 0) {
      const k = Math.max(0, hs * (1 - ROLL_DRAG * DT) - ROLL_STOP * DT) / hs;
      b.vx *= k;
      b.vz *= k;
    }
  }
}

/** Шар против всех боксов: вытолкнуть и отразить скорость по нормали; батут подбрасывает (подряд — всё ниже). */
function collide(b: Ball, w: CollisionWorld): void {
  const r = BALL_R;
  for (let i = 0; i < w.n; i++) {
    const x0 = w.minX[i];
    const x1 = w.maxX[i];
    const y0 = w.minY[i];
    const y1 = w.maxY[i];
    const z0 = w.minZ[i];
    const z1 = w.maxZ[i];
    if (b.x + r <= x0 || b.x - r >= x1 || b.y + r <= y0 || b.y - r >= y1 || b.z + r <= z0 || b.z - r >= z1) continue;
    const dx = b.x - (b.x < x0 ? x0 : b.x > x1 ? x1 : b.x);
    const dy = b.y - (b.y < y0 ? y0 : b.y > y1 ? y1 : b.y);
    const dz = b.z - (b.z < z0 ? z0 : b.z > z1 ? z1 : b.z);
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) continue;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let pen: number;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      nx = dx / d;
      ny = dy / d;
      nz = dz / d;
      pen = r - d;
    } else {
      // центр внутри бокса — наружу через ближайшую грань
      const faces = [b.x - x0, x1 - b.x, b.y - y0, y1 - b.y, b.z - z0, z1 - b.z];
      let k = 0;
      for (let f = 1; f < 6; f++) if (faces[f] < faces[k]) k = f;
      const s = k % 2 === 0 ? -1 : 1;
      if (k < 2) nx = s;
      else if (k < 4) ny = s;
      else nz = s;
      pen = faces[k] + r;
    }
    b.x += nx * pen;
    b.y += ny * pen;
    b.z += nz * pen;
    const floor = ny > 0.7;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < 0) {
      const e = floor ? (vn < -REST_VN ? BOUNCE_FLOOR : 0) : BOUNCE_WALL;
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      b.vz -= (1 + e) * vn * nz;
      const tramp = floor && w.tramp[i] === 1 && vn < -TRAMP_HIT;
      if (tramp) {
        b.vy = Math.max(b.vy, BALL_TRAMP_VY * TRAMP_FADE ** b.tramps);
        b.tramps++;
      } else if (floor) {
        b.tramps = 0;
      }
      if (tramp || -vn > BOUNCE_SOUND) b.bounces = (b.bounces + 1) & 255;
    }
    if (floor) b.grounded = true;
  }
}

/**
 * Желейка и мяч. Касаются — мяч выталкиваем из тела (цилиндр BALL_BODY_R). Желейка бежит на мяч и может пнуть
 * (can — пинок не на перезарядке) — пинок: по направлению бега, рывком — сильнее, в прыжке — выше. Иначе мяч
 * упруго отскакивает от тела. true — был пинок.
 */
export function touchBall(b: Ball, p: BallKicker, can: boolean): boolean {
  if (b.wet > 0) return false;
  if (b.y - BALL_R > p.y + PLAYER_HEIGHT || b.y + BALL_R < p.y) return false;
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  const d = Math.hypot(dx, dz);
  const reach = BALL_BODY_R + BALL_R;
  if (d >= reach) return false;
  const sp = Math.hypot(p.vx, p.vz);
  // от желейки к мячу (мяч прямо под ней — по ходу)
  let nx = 0;
  let nz = 1;
  if (d > 1e-4) {
    nx = dx / d;
    nz = dz / d;
  } else if (sp > 1e-4) {
    nx = p.vx / sp;
    nz = p.vz / sp;
  }
  b.x = p.x + nx * (reach + 0.005);
  b.z = p.z + nz * (reach + 0.005);
  b.still = 0;
  const approach = p.vx * nx + p.vz * nz;
  if (can && approach > KICK_APPROACH) {
    // прямо на мяч — по бегу и в полную силу; вскользь — больше от точки удара и слабее
    const along = approach / sp;
    const a = 0.65 * along;
    let kx = (p.vx / sp) * a + nx * (1 - a);
    let kz = (p.vz / sp) * a + nz * (1 - a);
    const kl = Math.hypot(kx, kz);
    kx /= kl;
    kz /= kl;
    const air = !p.grounded;
    const power = Math.min(KICK_MAX, KICK_BASE + sp * (0.4 + 0.6 * along) * KICK_RUN) * (air ? 0.8 : 1);
    b.vx = kx * power;
    b.vz = kz * power;
    b.vy = air ? KICK_VY_AIR + Math.max(0, p.vy) * 0.25 : p.dashT > 0 ? KICK_VY_DASH : KICK_VY;
    b.kicks = (b.kicks + 1) & 255;
    b.idle = 0;
    b.tramps = 0;
    return true;
  }
  const vn = (b.vx - p.vx) * nx + (b.vz - p.vz) * nz;
  if (vn < 0) {
    b.vx -= (1 + JELLY_BOUNCE) * vn * nx;
    b.vz -= (1 + JELLY_BOUNCE) * vn * nz;
    if (-vn > BOUNCE_SOUND) b.bounces = (b.bounces + 1) & 255;
  }
  return false;
}
