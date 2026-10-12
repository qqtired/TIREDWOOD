// Прятки: общая физика сервера и предсказания клиента («Рыбный двор»).
// Прячущийся двигается своей коробкой — размером выбранного предмета, а не «человеческой» 0,84 × 1,6 м: ведро
// пролезает под прилавок, скамейка — нет. Ищущий двигается как обычный игрок (stepPlayer). Все предметы двора и
// прячущиеся — твёрдые для всех одинаково: их коробки пишутся в зарезервированные места мира движения перед шагом.
// Только +, −, ×, ÷, sqrt и sinCos: шаг совпадает на сервере и в браузере бит в бит.
import { AIR_ACCEL, COYOTE_TICKS, DT, GRAVITY, GROUND_BLEND, JUMP_BUFFER_TICKS, JUMP_VELOCITY, MAX_AIR_SPEED, RUN_SPEED } from './constants.ts';
import { sinCos } from './math.ts';
import { BTN_BACK, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, copyState, makeEvents, makeInput, makeState, stepPlayer, type Input, type PlayerState } from './sim.ts';
import { CollisionWorld } from './world.ts';
import { HIDE_BOUNDS, buildHideMap } from './hidemap.ts';
import { HIDE_KIND, hideHalf, hideSpeed, hideYaw, type HideKind } from './hideprops.ts';

/** Предмет двора или прячущийся — для движения и выстрелов они одинаковы. yaw — шаг поворота (0…23). */
export interface HideBody { id: number; kind: HideKind; x: number; y: number; z: number; yaw: number }

/** Сколько подвижных коробок держит мир движения (предметов двора около сотни плюс до восьми прячущихся). */
export const HIDE_PROP_SLOTS = 200;
/** Высота ступеньки, на которую предмет въезжает сам (лестница помоста — 0,275 м). */
export const HIDE_PROP_STEP = 0.3;
const MOVE_BUTTONS = BTN_FORWARD | BTN_BACK | BTN_LEFT | BTN_RIGHT | BTN_JUMP;
const EPS = 1e-7;
const STATIC_BOXES = buildHideMap().boxes.length;

/** Мир для лучей, камеры и видимости: только неподвижное. */
export function hideStaticWorld(): CollisionWorld { return new CollisionWorld(buildHideMap()); }

/** Мир для движения: то же неподвижное плюс места под коробки предметов (пустые места — далеко за картой). */
export function hideMotionWorld(): CollisionWorld {
  const map = buildHideMap();
  for (let i = 0; i < HIDE_PROP_SLOTS; i++) map.boxes.push({ min: [1e6, -1e6, 1e6], max: [1e6, -1e6, 1e6], mat: 'wood', color: 0 });
  return new CollisionWorld(map);
}

const half = { x: 0, z: 0 };

/** Записать коробки предметов (кроме своего) в мир движения. */
export function hideFillProps(w: CollisionWorld, props: readonly HideBody[], skipId: number): void {
  let j = STATIC_BOXES;
  const end = STATIC_BOXES + HIDE_PROP_SLOTS;
  for (const p of props) {
    if (p.id === skipId || j >= end) continue;
    hideHalf(p.kind, p.yaw, half);
    w.minX[j] = p.x - half.x; w.maxX[j] = p.x + half.x;
    w.minY[j] = p.y; w.maxY[j] = p.y + HIDE_KIND[p.kind].h;
    w.minZ[j] = p.z - half.z; w.maxZ[j] = p.z + half.z;
    j++;
  }
  for (; j < end; j++) { w.minX[j] = w.maxX[j] = w.minZ[j] = w.maxZ[j] = 1e6; w.minY[j] = w.maxY[j] = -1e6; }
}

/** Помещается ли предмет kind с поворотом yaw в точке (на земле или на чём-то): в границах двора и ни во что не врезается. */
export function hideFits(w: CollisionWorld, x: number, y: number, z: number, kind: HideKind, yaw: number): boolean {
  if (!Number.isFinite(x + y + z)) return false;
  hideHalf(kind, yaw, half);
  const b = HIDE_BOUNDS;
  if (x - half.x < b.minX || x + half.x > b.maxX || z - half.z < b.minZ || z + half.z > b.maxZ || y < -0.05 || y > 3) return false;
  return !w.overlaps(x - half.x, y + 0.01, z - half.z, x + half.x, y + HIDE_KIND[kind].h, z + half.z);
}

/** Как sweep() из sim.ts, но для коробки произвольного размера: на сколько можно сдвинуться по оси. */
function sweepBox(w: CollisionWorld, x: number, y: number, z: number, hx: number, hz: number, h: number, axis: number, d: number): number {
  const x0 = x - hx, x1 = x + hx, y0 = y, y1 = y + h, z0 = z - hz, z1 = z + hz;
  let allowed = d;
  const n = w.n, mnX = w.minX, mnY = w.minY, mnZ = w.minZ, mxX = w.maxX, mxY = w.maxY, mxZ = w.maxZ;
  for (let i = 0; i < n; i++) {
    if (axis === 0) {
      if (y0 >= mxY[i] - EPS || y1 <= mnY[i] + EPS || z0 >= mxZ[i] - EPS || z1 <= mnZ[i] + EPS) continue;
      if (d > 0) { if (mnX[i] >= x1 - EPS) { const gap = mnX[i] - x1; if (gap < allowed) allowed = gap > 0 ? gap : 0; } }
      else if (mxX[i] <= x0 + EPS) { const gap = mxX[i] - x0; if (gap > allowed) allowed = gap < 0 ? gap : 0; }
    } else if (axis === 1) {
      if (x0 >= mxX[i] - EPS || x1 <= mnX[i] + EPS || z0 >= mxZ[i] - EPS || z1 <= mnZ[i] + EPS) continue;
      if (d > 0) { if (mnY[i] >= y1 - EPS) { const gap = mnY[i] - y1; if (gap < allowed) allowed = gap > 0 ? gap : 0; } }
      else if (mxY[i] <= y0 + EPS) { const gap = mxY[i] - y0; if (gap > allowed) allowed = gap < 0 ? gap : 0; }
    } else {
      if (x0 >= mxX[i] - EPS || x1 <= mnX[i] + EPS || y0 >= mxY[i] - EPS || y1 <= mnY[i] + EPS) continue;
      if (d > 0) { if (mnZ[i] >= z1 - EPS) { const gap = mnZ[i] - z1; if (gap < allowed) allowed = gap > 0 ? gap : 0; } }
      else if (mxZ[i] <= z0 + EPS) { const gap = mxZ[i] - z0; if (gap > allowed) allowed = gap < 0 ? gap : 0; }
    }
  }
  return allowed;
}

function moveAxis(s: PlayerState, w: CollisionWorld, hx: number, hz: number, h: number, axis: 0 | 2, d: number, canStep: boolean): void {
  if (d === 0) return;
  const allowed = sweepBox(w, s.x, s.y, s.z, hx, hz, h, axis, d);
  if (allowed === d) {
    if (axis === 0) s.x += d; else s.z += d;
    return;
  }
  if (canStep) {
    const up = sweepBox(w, s.x, s.y, s.z, hx, hz, h, 1, HIDE_PROP_STEP);
    if (up > 0.01) {
      const ry = s.y + up;
      const raised = sweepBox(w, s.x, ry, s.z, hx, hz, h, axis, d);
      if (Math.abs(raised) > Math.abs(allowed) + 1e-4) {
        const nx = axis === 0 ? s.x + raised : s.x, nz = axis === 2 ? s.z + raised : s.z;
        const ny = ry + sweepBox(w, nx, ry, nz, hx, hz, h, 1, -up);
        if (ny > s.y + 1e-4) {
          s.x = nx; s.z = nz; s.y = ny;
          if (raised !== d) { if (axis === 0) s.vx = 0; else s.vz = 0; }
          return;
        }
      }
    }
  }
  if (axis === 0) { s.x += allowed; s.vx = 0; } else { s.z += allowed; s.vz = 0; }
}

const sc = { s: 0, c: 0 };

/** Шаг прячущегося: ходьба с долей скорости по размеру, прыжок, ступеньки до 0,3 м. Замерший не двигается (падает, если в воздухе). */
export function stepProp(s: PlayerState, inp: Input, w: CollisionWorld, kind: HideKind, yawIdx: number, locked: boolean): void {
  hideHalf(kind, yawIdx, half);
  const hx = half.x, hz = half.z, h = HIDE_KIND[kind].h;
  const b = locked ? 0 : inp.buttons & MOVE_BUTTONS;
  const pressed = b & ~s.prevButtons;
  sinCos(inp.yaw, sc);
  const mz = ((b & BTN_FORWARD) ? 1 : 0) - ((b & BTN_BACK) ? 1 : 0);
  const mx = ((b & BTN_RIGHT) ? 1 : 0) - ((b & BTN_LEFT) ? 1 : 0);
  let wx = -sc.s * mz + sc.c * mx, wz = -sc.c * mz - sc.s * mx;
  const wl = Math.sqrt(wx * wx + wz * wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  const maxSpeed = RUN_SPEED * hideSpeed(kind);
  const wasGrounded = s.grounded === 1;
  if (pressed & BTN_JUMP) s.jumpBuf = JUMP_BUFFER_TICKS;
  else if (s.jumpBuf > 0) s.jumpBuf--;
  if (wasGrounded) {
    s.vx += (wx * maxSpeed - s.vx) * GROUND_BLEND;
    s.vz += (wz * maxSpeed - s.vz) * GROUND_BLEND;
  } else {
    if (wl > 0) {
      const add = maxSpeed - (s.vx * wx + s.vz * wz);
      if (add > 0) { const acc = add < AIR_ACCEL * DT ? add : AIR_ACCEL * DT; s.vx += wx * acc; s.vz += wz * acc; }
    }
    const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
    if (hs > MAX_AIR_SPEED) { s.vx *= MAX_AIR_SPEED / hs; s.vz *= MAX_AIR_SPEED / hs; }
  }
  s.vy -= GRAVITY * DT;
  if (locked) { s.vx = 0; s.vz = 0; }
  let jumped = false;
  if (s.jumpBuf > 0 && (wasGrounded || s.coyote > 0)) { s.vy = JUMP_VELOCITY; s.jumpBuf = 0; s.coyote = 0; jumped = true; }
  const dx = s.vx * DT, dy = s.vy * DT, dz = s.vz * DT;
  const maxD = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const steps = maxD > 0.3 ? Math.ceil(maxD / 0.3) : 1;
  const canStep = wasGrounded && !jumped;
  let grounded = false, vertical = true;
  for (let i = 0; i < steps; i++) {
    moveAxis(s, w, hx, hz, h, 0, dx / steps, canStep);
    moveAxis(s, w, hx, hz, h, 2, dz / steps, canStep);
    if (!vertical) continue;
    const sy = dy / steps;
    const ay = sweepBox(w, s.x, s.y, s.z, hx, hz, h, 1, sy);
    s.y += ay;
    if (ay !== sy) { if (sy < 0) grounded = true; s.vy = 0; vertical = false; }
  }
  if (!grounded && wasGrounded && !jumped && s.vy <= 0) {
    const down = sweepBox(w, s.x, s.y, s.z, hx, hz, h, 1, -HIDE_PROP_STEP);
    if (down !== -HIDE_PROP_STEP) { s.y += down; s.vy = 0; grounded = true; }
  }
  s.grounded = grounded ? 1 : 0;
  if (grounded) s.coyote = COYOTE_TICKS;
  else if (s.coyote > 0) s.coyote--;
  s.prevButtons = b;
}

/** prop — прячущийся (свой шаг), hunter — ищущий (обычный шаг без рывка), still — стоит (сарай, пойман, ждёт раунда). */
export type HideMover = 'prop' | 'hunter' | 'still';

/**
 * Шаг игрока пряток. Тот же объект — «крючок» предсказания клиента (Predictor: before → stepHeld → after) и шаг
 * сервера (step). Вход не портится: маска кнопок уходит в отдельный вход, иначе переигровка разошлась бы.
 */
export class HidePhysics {
  mover: HideMover = 'still';
  kind: HideKind = 'crate';
  yaw = 0;
  locked = false;
  /** Все предметы двора и прячущиеся (свой пропускается по ownId) */
  props: readonly HideBody[] = [];
  ownId = 0;
  readonly world: CollisionWorld;
  private readonly out = makeState();
  private readonly masked = makeInput();
  private readonly events = makeEvents();
  constructor(world: CollisionWorld) { this.world = world; }

  before(s: PlayerState, input: Input): Input {
    hideFillProps(this.world, this.props, this.ownId);
    if (this.mover === 'prop') { copyState(this.out, s); stepProp(this.out, input, this.world, this.kind, this.yaw, this.locked); }
    const m = this.masked;
    m.seq = input.seq; m.yaw = input.yaw; m.pitch = input.pitch; m.viewTick = input.viewTick;
    m.buttons = this.mover === 'hunter' ? input.buttons & MOVE_BUTTONS : 0;
    if (this.mover !== 'hunter') { s.vx = 0; s.vz = 0; }
    return m;
  }

  after(s: PlayerState): void {
    if (this.mover === 'prop') copyState(s, this.out);
  }

  step(s: PlayerState, input: Input): void {
    const m = this.before(s, input);
    stepPlayer(s, m, this.world, false, 0, this.events);
    this.after(s);
  }
}

/** Попадание луча в повёрнутую коробку предмета: расстояние до входа (Infinity — мимо) и нормаль грани в out. */
export function hideRayBody(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: HideBody, max: number, out?: { nx: number; ny: number; nz: number }): number {
  const f = HIDE_KIND[b.kind], a = hideYaw(b.yaw), c = Math.cos(a), s = Math.sin(a);
  const rx = ox - b.x, rz = oz - b.z;
  const o = [rx * c - rz * s, oy - b.y, rx * s + rz * c], dir = [dx * c - dz * s, dy, dx * s + dz * c];
  const lo = [-f.w, 0, -f.d], hi = [f.w, f.h, f.d];
  let near = 0, far = max, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return Infinity; continue; }
    const t0 = (lo[i] - o[i]) / dir[i], t1 = (hi[i] - o[i]) / dir[i];
    const tn = Math.min(t0, t1), tf = Math.max(t0, t1);
    if (tn > near) { near = tn; axis = i; sign = t0 < t1 ? -1 : 1; }
    if (tf < far) far = tf;
    if (near > far) return Infinity;
  }
  if (out) {
    // локальная нормаль грани входа → мир (как rotation.y = a у three.js)
    const lx = axis === 0 ? sign : 0, ly = axis === 1 ? sign : 0, lz = axis === 2 ? sign : 0;
    out.nx = c * lx + s * lz; out.ny = ly; out.nz = -s * lx + c * lz;
  }
  return near <= max ? near : Infinity;
}
