// Детерминированная симуляция игрока: движение + маркер (в пейнтболе — ещё подобранная AWP).
// Один и тот же код крутится на сервере (истина) и на клиенте (предсказание).
import {
  ADS_SPEED, AIR_ACCEL, COYOTE_TICKS, DASH_COOLDOWN_TICKS, DASH_EXIT_SPEED, DASH_SPEED, DASH_TICKS, DT, EYE_HEIGHT,
  GRAVITY, GROUND_BLEND, JUMP_BUFFER_TICKS, JUMP_VELOCITY, MAX_AIR_SPEED, PLAYER_HALF, PLAYER_HEIGHT, RUN_SPEED,
  STEP_HEIGHT, TRAMPOLINE_VELOCITY,
} from './constants.ts';
import { hashFloat, sinCos } from './math.ts';
import type { CollisionWorld } from './world.ts';

// --- Кнопки ввода (битовая маска)
export const BTN_FORWARD = 1;
export const BTN_BACK = 2;
export const BTN_LEFT = 4;
export const BTN_RIGHT = 8;
export const BTN_JUMP = 16;
export const BTN_DASH = 32;
export const BTN_FIRE = 64;
export const BTN_ADS = 128;
export const BTN_RELOAD = 256;
export const BTN_USE = 512;
/** Камера над левым плечом (пейнтбол от третьего лица): сервер строит ту же камеру для прицела. */
export const BTN_SHOULDER = 1024;

// --- Маркер (пейнтбольный, автоматический)
export const MAG_SIZE = 30;
export const FIRE_INTERVAL = 6; // тиков: 10 выстрелов в секунду
export const RELOAD_TICKS = 84;
export const DAMAGE_BODY = 20;
export const DAMAGE_HEAD = 34;
export const FALLOFF_START = 24;
export const FALLOFF_END = 55;
export const FALLOFF_MIN = 0.65;
export const SHOT_RANGE = 160;

const SPREAD_HIP = 0.0095;
const SPREAD_ADS = 0.0018;
const SPREAD_MOVE_HIP = 0.02;
const SPREAD_MOVE_ADS = 0.007;
const SPREAD_AIR_HIP = 0.032;
const SPREAD_AIR_ADS = 0.016;
const BLOOM_PER_SHOT = 0.0042;
const BLOOM_MAX = 0.026;
const BLOOM_DECAY = 0.0011;
const KICK_PITCH = 0.0105;
const KICK_YAW = 0.0042;
const RECOIL_MAX = 0.085;
const RECOIL_KEEP_FIRING = 0.972;
const RECOIL_KEEP_IDLE = 0.86;

// --- Снайперская AWP (пейнтбол, лежит на карте): AWP_SHOTS выстрелов без перезарядки, каждый — по новому нажатию.
// В прицеле бьёт точно (разброс — только на бегу и в прыжке), от бедра — с разбросом. Попадание сбивает сразу
// (это решает сервер), урон не падает с дистанцией. После последнего выстрела — снова маркер.
export const AWP_SHOTS = 3;
export const AWP_INTERVAL = 72; // тиков: 1,2 с между выстрелами
export const AWP_SWITCH_TICKS = 30; // после последнего выстрела маркер готов через 0,5 с
const AWP_SPREAD_HIP = 0.03;
const AWP_SPREAD_MOVE_HIP = 0.03;
const AWP_SPREAD_MOVE_ADS = 0.006;
const AWP_SPREAD_AIR_HIP = 0.05;
const AWP_SPREAD_AIR_ADS = 0.02;
const AWP_KICK = 0.05;
const AWP_RECOIL_KEEP = 0.94;

export interface Input {
  seq: number;
  buttons: number;
  yaw: number;
  pitch: number;
  /** Серверный тик (с дробью), который игрок видел на экране — для компенсации лага */
  viewTick: number;
}

export function makeInput(): Input {
  return { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 };
}

/** Всё, что нужно для предсказания. Никаких производных величин — только состояние. */
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: number; // 0/1
  coyote: number;
  jumpBuf: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashZ: number;
  prevButtons: number;
  ammo: number;
  fireCd: number;
  reloadT: number;
  bloom: number;
  recoilP: number;
  recoilY: number;
  shots: number;
  /** Выстрелов AWP в руках (0 — обычный маркер); выдаёт сервер, когда игрок заходит в лежащую винтовку */
  awp: number;
}

export function makeState(): PlayerState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    grounded: 0, coyote: 0, jumpBuf: 0, dashT: 0, dashCd: 0, dashX: 0, dashZ: 0, prevButtons: 0,
    ammo: MAG_SIZE, fireCd: 0, reloadT: 0, bloom: 0, recoilP: 0, recoilY: 0, shots: 0, awp: 0,
  };
}

export function copyState(dst: PlayerState, s: PlayerState): PlayerState {
  dst.x = s.x; dst.y = s.y; dst.z = s.z;
  dst.vx = s.vx; dst.vy = s.vy; dst.vz = s.vz;
  dst.grounded = s.grounded; dst.coyote = s.coyote; dst.jumpBuf = s.jumpBuf;
  dst.dashT = s.dashT; dst.dashCd = s.dashCd; dst.dashX = s.dashX; dst.dashZ = s.dashZ;
  dst.prevButtons = s.prevButtons;
  dst.ammo = s.ammo; dst.fireCd = s.fireCd; dst.reloadT = s.reloadT;
  dst.bloom = s.bloom; dst.recoilP = s.recoilP; dst.recoilY = s.recoilY; dst.shots = s.shots;
  dst.awp = s.awp;
  return dst;
}

export function statesEqual(a: PlayerState, b: PlayerState): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.vx === b.vx && a.vy === b.vy && a.vz === b.vz &&
    a.grounded === b.grounded && a.coyote === b.coyote && a.jumpBuf === b.jumpBuf && a.dashT === b.dashT &&
    a.dashCd === b.dashCd && a.dashX === b.dashX && a.dashZ === b.dashZ && a.prevButtons === b.prevButtons &&
    a.ammo === b.ammo && a.fireCd === b.fireCd && a.reloadT === b.reloadT && a.bloom === b.bloom &&
    a.recoilP === b.recoilP && a.recoilY === b.recoilY && a.shots === b.shots && a.awp === b.awp;
}

/** Что произошло за тик — для звуков, эффектов и сервера. */
export interface StepEvents {
  jumped: boolean;
  landed: boolean;
  landSpeed: number;
  dashed: boolean;
  bounced: boolean;
  /** На сколько поднялись ступенькой (для сглаживания камеры) */
  stepUp: number;
  fired: boolean;
  dirX: number;
  dirY: number;
  dirZ: number;
  /** Взгляд с отдачей в момент выстрела (до нового толчка) — от него строится прицел от третьего лица */
  aimYaw: number;
  aimPitch: number;
  /** Разброс этого выстрела, рад */
  spread: number;
  /** Выстрел — из AWP (а не из маркера) */
  awp: boolean;
  reloadStart: boolean;
  reloaded: boolean;
  dry: boolean;
}

export function makeEvents(): StepEvents {
  return {
    jumped: false, landed: false, landSpeed: 0, dashed: false, bounced: false, stepUp: 0,
    fired: false, dirX: 0, dirY: 0, dirZ: -1, aimYaw: 0, aimPitch: 0, spread: 0, awp: false, reloadStart: false, reloaded: false, dry: false,
  };
}

export function resetEvents(e: StepEvents): void {
  e.jumped = false; e.landed = false; e.landSpeed = 0; e.dashed = false; e.bounced = false; e.stepUp = 0;
  e.fired = false; e.awp = false; e.reloadStart = false; e.reloaded = false; e.dry = false;
}

// --- Коллизии ---------------------------------------------------------------

const EPS = 1e-7;

/**
 * Насколько AABB игрока в (x,y,z) может сдвинуться по оси на d, не влезая в боксы.
 * Боксы, в которые игрок уже влез, игнорируются — так он всегда может выбраться.
 */
function sweep(w: CollisionWorld, x: number, y: number, z: number, axis: number, d: number): number {
  const x0 = x - PLAYER_HALF;
  const x1 = x + PLAYER_HALF;
  const y0 = y;
  const y1 = y + PLAYER_HEIGHT;
  const z0 = z - PLAYER_HALF;
  const z1 = z + PLAYER_HALF;
  let allowed = d;
  w.lastHit = -1;
  const n = w.n;
  const mnX = w.minX;
  const mnY = w.minY;
  const mnZ = w.minZ;
  const mxX = w.maxX;
  const mxY = w.maxY;
  const mxZ = w.maxZ;
  if (axis === 0) {
    for (let i = 0; i < n; i++) {
      if (y0 >= mxY[i] - EPS || y1 <= mnY[i] + EPS || z0 >= mxZ[i] - EPS || z1 <= mnZ[i] + EPS) continue;
      if (d > 0) {
        if (mnX[i] >= x1 - EPS) {
          const gap = mnX[i] - x1;
          if (gap < allowed) { allowed = gap > 0 ? gap : 0; w.lastHit = i; }
        }
      } else if (mxX[i] <= x0 + EPS) {
        const gap = mxX[i] - x0;
        if (gap > allowed) { allowed = gap < 0 ? gap : 0; w.lastHit = i; }
      }
    }
  } else if (axis === 1) {
    for (let i = 0; i < n; i++) {
      if (x0 >= mxX[i] - EPS || x1 <= mnX[i] + EPS || z0 >= mxZ[i] - EPS || z1 <= mnZ[i] + EPS) continue;
      if (d > 0) {
        if (mnY[i] >= y1 - EPS) {
          const gap = mnY[i] - y1;
          if (gap < allowed) { allowed = gap > 0 ? gap : 0; w.lastHit = i; }
        }
      } else if (mxY[i] <= y0 + EPS) {
        const gap = mxY[i] - y0;
        if (gap > allowed) { allowed = gap < 0 ? gap : 0; w.lastHit = i; }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (x0 >= mxX[i] - EPS || x1 <= mnX[i] + EPS || y0 >= mxY[i] - EPS || y1 <= mnY[i] + EPS) continue;
      if (d > 0) {
        if (mnZ[i] >= z1 - EPS) {
          const gap = mnZ[i] - z1;
          if (gap < allowed) { allowed = gap > 0 ? gap : 0; w.lastHit = i; }
        }
      } else if (mxZ[i] <= z0 + EPS) {
        const gap = mxZ[i] - z0;
        if (gap > allowed) { allowed = gap < 0 ? gap : 0; w.lastHit = i; }
      }
    }
  }
  return allowed;
}

/** Горизонтальный шаг по оси с автоматическим подъёмом на ступеньку. */
function moveHorizontal(s: PlayerState, w: CollisionWorld, axis: 0 | 2, d: number, canStep: boolean, ev: StepEvents): void {
  if (d === 0) return;
  const allowed = sweep(w, s.x, s.y, s.z, axis, d);
  if (allowed === d) {
    if (axis === 0) s.x += d; else s.z += d;
    return;
  }
  if (canStep) {
    const up = sweep(w, s.x, s.y, s.z, 1, STEP_HEIGHT);
    if (up > 0.01) {
      const ry = s.y + up;
      const raised = sweep(w, s.x, ry, s.z, axis, d);
      if (Math.abs(raised) > Math.abs(allowed) + 1e-4) {
        const nx = axis === 0 ? s.x + raised : s.x;
        const nz = axis === 2 ? s.z + raised : s.z;
        const down = sweep(w, nx, ry, nz, 1, -up);
        const ny = ry + down;
        if (ny > s.y + 1e-4) {
          ev.stepUp += ny - s.y;
          s.x = nx;
          s.z = nz;
          s.y = ny;
          if (raised !== d) {
            if (axis === 0) s.vx = 0; else s.vz = 0;
          }
          return;
        }
      }
    }
  }
  if (axis === 0) {
    s.x += allowed;
    s.vx = 0;
  } else {
    s.z += allowed;
    s.vz = 0;
  }
}

/**
 * Сдвинуть игрока по x, потом по z, потом по y, не влезая в боксы (без подъёма на ступеньку). Так подвижная
 * площадка аквапарка везёт того, кто на ней стоит (shared/aquadyn.ts).
 */
export function pushPlayer(s: PlayerState, w: CollisionWorld, dx: number, dy: number, dz: number): void {
  if (dx !== 0) s.x += sweep(w, s.x, s.y, s.z, 0, dx);
  if (dz !== 0) s.z += sweep(w, s.x, s.y, s.z, 2, dz);
  if (dy !== 0) s.y += sweep(w, s.x, s.y, s.z, 1, dy);
}

// --- Шаг симуляции ------------------------------------------------------------

const sc = { s: 0, c: 0 };

/**
 * Один тик игрока. canFire — можно ли стрелять (фаза раунда), seed — личное зерно разброса.
 * Возвращает события в ev (переиспользуется, без аллокаций).
 */
export function stepPlayer(s: PlayerState, inp: Input, w: CollisionWorld, canFire: boolean, seed: number, ev: StepEvents): void {
  resetEvents(ev);
  const b = inp.buttons;
  const pressed = b & ~s.prevButtons;
  // не Math.sin/cos: они в браузерах и Node расходятся в последнем знаке, а движение должно совпадать бит в бит
  sinCos(inp.yaw, sc);
  const sinY = sc.s;
  const cosY = sc.c;

  // Желаемое направление по земле
  const mz = ((b & BTN_FORWARD) ? 1 : 0) - ((b & BTN_BACK) ? 1 : 0);
  const mx = ((b & BTN_RIGHT) ? 1 : 0) - ((b & BTN_LEFT) ? 1 : 0);
  let wx = -sinY * mz + cosY * mx;
  let wz = -cosY * mz - sinY * mx;
  const wl = Math.sqrt(wx * wx + wz * wz);
  if (wl > 0) {
    wx /= wl;
    wz /= wl;
  }
  const ads = (b & BTN_ADS) !== 0;
  const maxSpeed = ads ? ADS_SPEED : RUN_SPEED;
  const wasGrounded = s.grounded === 1;

  // Таймеры
  if (s.dashCd > 0) s.dashCd--;
  if (pressed & BTN_JUMP) s.jumpBuf = JUMP_BUFFER_TICKS;
  else if (s.jumpBuf > 0) s.jumpBuf--;

  // Рывок
  if ((pressed & BTN_DASH) && s.dashCd === 0 && s.dashT === 0) {
    let dx = wx;
    let dz = wz;
    if (wl === 0) {
      dx = -sinY;
      dz = -cosY;
    }
    s.dashX = dx;
    s.dashZ = dz;
    s.dashT = DASH_TICKS;
    s.dashCd = DASH_COOLDOWN_TICKS;
    if (s.vy < 0) s.vy = 0;
    ev.dashed = true;
  }

  if (s.dashT > 0) {
    s.vx = s.dashX * DASH_SPEED;
    s.vz = s.dashZ * DASH_SPEED;
    s.vy -= GRAVITY * DT * 0.3;
    s.dashT--;
    if (s.dashT === 0) {
      s.vx = s.dashX * DASH_EXIT_SPEED;
      s.vz = s.dashZ * DASH_EXIT_SPEED;
    }
  } else if (wasGrounded) {
    s.vx += (wx * maxSpeed - s.vx) * GROUND_BLEND;
    s.vz += (wz * maxSpeed - s.vz) * GROUND_BLEND;
    s.vy -= GRAVITY * DT;
  } else {
    if (wl > 0) {
      const cur = s.vx * wx + s.vz * wz;
      const add = maxSpeed - cur;
      if (add > 0) {
        const acc = add < AIR_ACCEL * DT ? add : AIR_ACCEL * DT;
        s.vx += wx * acc;
        s.vz += wz * acc;
      }
    }
    const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
    if (hs > MAX_AIR_SPEED) {
      s.vx *= MAX_AIR_SPEED / hs;
      s.vz *= MAX_AIR_SPEED / hs;
    }
    s.vy -= GRAVITY * DT;
  }

  // Прыжок (с «койот-таймом» и буфером нажатия)
  let jumped = false;
  if (s.jumpBuf > 0 && (wasGrounded || s.coyote > 0) && s.dashT === 0) {
    s.vy = JUMP_VELOCITY;
    s.jumpBuf = 0;
    s.coyote = 0;
    s.grounded = 0;
    jumped = true;
    ev.jumped = true;
  }

  // Перемещение с подшагами
  const dx = s.vx * DT;
  const dy = s.vy * DT;
  const dz = s.vz * DT;
  const maxD = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const steps = maxD > 0.3 ? Math.ceil(maxD / 0.3) : 1;
  const canStep = wasGrounded && !jumped;
  const fallSpeed = -s.vy;
  let grounded = false;
  let groundBox = -1;
  let vertical = true;
  for (let i = 0; i < steps; i++) {
    moveHorizontal(s, w, 0, dx / steps, canStep, ev);
    moveHorizontal(s, w, 2, dz / steps, canStep, ev);
    if (!vertical) continue;
    const sy = dy / steps;
    const ay = sweep(w, s.x, s.y, s.z, 1, sy);
    s.y += ay;
    if (ay !== sy) {
      if (sy < 0) {
        grounded = true;
        groundBox = w.lastHit;
      }
      s.vy = 0;
      vertical = false;
    }
  }

  // Прилипание к полу на спуске по ступенькам
  if (!grounded && wasGrounded && !jumped && s.vy <= 0 && s.dashT === 0) {
    const down = sweep(w, s.x, s.y, s.z, 1, -STEP_HEIGHT);
    if (down !== -STEP_HEIGHT) {
      s.y += down;
      s.vy = 0;
      grounded = true;
      groundBox = w.lastHit;
    }
  }

  if (grounded && !wasGrounded) {
    ev.landed = true;
    ev.landSpeed = fallSpeed;
  }

  // Батут
  if (grounded && groundBox >= 0 && w.tramp[groundBox] === 1) {
    s.vy = TRAMPOLINE_VELOCITY;
    grounded = false;
    ev.bounced = true;
  }

  s.grounded = grounded ? 1 : 0;
  if (grounded) s.coyote = COYOTE_TICKS;
  else if (s.coyote > 0) s.coyote--;

  // --- Маркер (или AWP)
  stepWeapon(s, inp, pressed, ads, canFire, seed, ev);
  s.prevButtons = b;
}

function stepWeapon(s: PlayerState, inp: Input, pressed: number, ads: boolean, canFire: boolean, seed: number, ev: StepEvents): void {
  if (s.fireCd > 0) s.fireCd--;
  let firing = false;
  if (s.awp > 0) {
    // AWP: без перезарядки; стреляет только новое нажатие — зажатый по привычке огонь выстрелы не тратит
    if (canFire && (pressed & BTN_FIRE) && s.fireCd === 0) {
      firing = true;
      fireAwp(s, inp, ads, seed, ev);
    }
  } else {
    stepMarker(s, inp, pressed, ads, canFire, seed, ev);
    firing = ev.fired;
  }
  if (!firing) {
    s.bloom = s.bloom > BLOOM_DECAY ? s.bloom - BLOOM_DECAY : 0;
    const keep = s.awp > 0 ? AWP_RECOIL_KEEP : s.fireCd > 0 ? RECOIL_KEEP_FIRING : RECOIL_KEEP_IDLE;
    s.recoilP *= keep;
    s.recoilY *= keep;
    if (s.recoilP < 1e-6 && s.recoilP > -1e-6) s.recoilP = 0;
    if (s.recoilY < 1e-6 && s.recoilY > -1e-6) s.recoilY = 0;
  }
}

/** Выстрел из AWP: сильный толчок вверх, следующий — через AWP_INTERVAL, после последнего — снова маркер. */
function fireAwp(s: PlayerState, inp: Input, ads: boolean, seed: number, ev: StepEvents): void {
  s.awp--;
  s.fireCd = s.awp > 0 ? AWP_INTERVAL : AWP_SWITCH_TICKS;
  s.shots = (s.shots + 1) >>> 0;
  const spread = awpSpread(s, ads);
  ev.aimYaw = inp.yaw + s.recoilY;
  ev.aimPitch = inp.pitch + s.recoilP;
  ev.spread = spread;
  shotDirection(ev.aimYaw, ev.aimPitch, spread, seed, s.shots, ev);
  ev.fired = true;
  ev.awp = true;
  s.recoilP += AWP_KICK;
  if (s.recoilP > RECOIL_MAX) s.recoilP = RECOIL_MAX;
  s.recoilY += (hashFloat(seed ^ 0x2c1b, s.shots) - 0.5) * 2 * KICK_YAW;
}

function awpSpread(s: PlayerState, ads: boolean): number {
  const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
  const moveFrac = hs > RUN_SPEED ? 1 : hs / RUN_SPEED;
  let spread = ads ? AWP_SPREAD_MOVE_ADS * moveFrac : AWP_SPREAD_HIP + AWP_SPREAD_MOVE_HIP * moveFrac;
  if (s.grounded === 0) spread += ads ? AWP_SPREAD_AIR_ADS : AWP_SPREAD_AIR_HIP;
  return spread;
}

/** Маркер: перезарядка и автоматический огонь. Выстрел — ev.fired. */
function stepMarker(s: PlayerState, inp: Input, pressed: number, ads: boolean, canFire: boolean, seed: number, ev: StepEvents): void {
  const b = inp.buttons;
  if (s.reloadT > 0) {
    s.reloadT--;
    if (s.reloadT === 0) {
      s.ammo = MAG_SIZE;
      ev.reloaded = true;
    }
  } else if ((pressed & BTN_RELOAD) && s.ammo < MAG_SIZE) {
    s.reloadT = RELOAD_TICKS;
    ev.reloadStart = true;
  }

  if (canFire && (b & BTN_FIRE) && s.fireCd === 0 && s.reloadT === 0) {
    if (s.ammo <= 0) {
      s.reloadT = RELOAD_TICKS;
      ev.reloadStart = true;
      ev.dry = true;
    } else {
      s.ammo--;
      s.fireCd = FIRE_INTERVAL;
      s.shots = (s.shots + 1) >>> 0;
      const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
      const moveFrac = hs > RUN_SPEED ? 1 : hs / RUN_SPEED;
      let spread = ads ? SPREAD_ADS + SPREAD_MOVE_ADS * moveFrac : SPREAD_HIP + SPREAD_MOVE_HIP * moveFrac;
      if (s.grounded === 0) spread += ads ? SPREAD_AIR_ADS : SPREAD_AIR_HIP;
      spread += ads ? s.bloom * 0.45 : s.bloom;
      ev.aimYaw = inp.yaw + s.recoilY;
      ev.aimPitch = inp.pitch + s.recoilP;
      ev.spread = spread;
      shotDirection(ev.aimYaw, ev.aimPitch, spread, seed, s.shots, ev);
      ev.fired = true;
      s.bloom = s.bloom + BLOOM_PER_SHOT > BLOOM_MAX ? BLOOM_MAX : s.bloom + BLOOM_PER_SHOT;
      const k1 = hashFloat(seed ^ 0x51ed, s.shots);
      const k2 = hashFloat(seed ^ 0x2c1b, s.shots);
      const kick = ads ? 0.7 : 1;
      s.recoilP += KICK_PITCH * (0.8 + 0.4 * k1) * kick;
      if (s.recoilP > RECOIL_MAX) s.recoilP = RECOIL_MAX;
      s.recoilY += (k2 - 0.5) * 2 * KICK_YAW * kick;
      if (s.ammo === 0) {
        s.reloadT = RELOAD_TICKS + FIRE_INTERVAL;
        ev.reloadStart = true;
      }
    }
  }
}

/** Направление выстрела: взгляд + отдача + детерминированный разброс. */
export function shotDirection(yaw: number, pitch: number, spread: number, seed: number, shot: number, out: { dirX: number; dirY: number; dirZ: number }): void {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  // вперёд, вправо, вверх
  const fx = -sy * cp;
  const fy = sp;
  const fz = -cy * cp;
  const rx = cy;
  const rz = -sy;
  const ux = sy * sp;
  const uy = cp;
  const uz = cy * sp;
  const u1 = hashFloat(seed, shot);
  const u2 = hashFloat(seed ^ 0x7f4a7c15, shot);
  const ang = u1 * Math.PI * 2;
  const r = spread * Math.sqrt(u2);
  const ox = Math.cos(ang) * r;
  const oy = Math.sin(ang) * r;
  let dx = fx + rx * ox + ux * oy;
  let dy = fy + uy * oy;
  let dz = fz + rz * ox + uz * oy;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  dx /= l;
  dy /= l;
  dz /= l;
  out.dirX = dx;
  out.dirY = dy;
  out.dirZ = dz;
}

/**
 * Тот же детерминированный разброс, но вокруг произвольного направления f
 * (выстрел от третьего лица: из глаз в точку, куда смотрит камера).
 */
export function applySpread(fx: number, fy: number, fz: number, spread: number, seed: number, shot: number, out: { dirX: number; dirY: number; dirZ: number }): void {
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // вправо — горизонтально, перпендикулярно f; вверх — r × f
  let rx = -fz;
  let rz = fx;
  const rl = Math.sqrt(rx * rx + rz * rz);
  if (rl < 1e-6) {
    rx = 1;
    rz = 0;
  } else {
    rx /= rl;
    rz /= rl;
  }
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const u1 = hashFloat(seed, shot);
  const u2 = hashFloat(seed ^ 0x7f4a7c15, shot);
  const ang = u1 * Math.PI * 2;
  const r = spread * Math.sqrt(u2);
  const ox = Math.cos(ang) * r;
  const oy = Math.sin(ang) * r;
  let dx = fx + rx * ox + ux * oy;
  let dy = fy + uy * oy;
  let dz = fz + rz * ox + uz * oy;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  dx /= l;
  dy /= l;
  dz /= l;
  out.dirX = dx;
  out.dirY = dy;
  out.dirZ = dz;
}

/** Урон с учётом дистанции. */
export function damageAt(dist: number, head: boolean): number {
  const base = head ? DAMAGE_HEAD : DAMAGE_BODY;
  if (dist <= FALLOFF_START) return base;
  if (dist >= FALLOFF_END) return base * FALLOFF_MIN;
  const t = (dist - FALLOFF_START) / (FALLOFF_END - FALLOFF_START);
  return base * (1 - (1 - FALLOFF_MIN) * t);
}

export function eyeY(s: PlayerState): number {
  return s.y + EYE_HEIGHT;
}

/** Разброс «прямо сейчас» (для прицела на клиенте), та же формула, что при выстреле. */
export function currentSpread(s: PlayerState, ads: boolean): number {
  if (s.awp > 0) return awpSpread(s, ads);
  const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
  const moveFrac = hs > RUN_SPEED ? 1 : hs / RUN_SPEED;
  let spread = ads ? SPREAD_ADS + SPREAD_MOVE_ADS * moveFrac : SPREAD_HIP + SPREAD_MOVE_HIP * moveFrac;
  if (s.grounded === 0) spread += ads ? SPREAD_AIR_ADS : SPREAD_AIR_HIP;
  spread += ads ? s.bloom * 0.45 : s.bloom;
  return spread;
}
