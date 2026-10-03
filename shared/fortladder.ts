// Лестницы «Крепости» (вместо каменных маршей): простые деревянные лестницы, прислонённые к стенам. Лезть — W лицом
// к стене, вниз — S, висеть — ничего не жать, спрыгнуть — пробел. Коллизии у лестницы нет: шаг делает своё до
// stepPlayer (вертикальная скорость), поэтому сервер и предсказание клиента считают одинаково.
import { DT, GRAVITY, PLAYER_HALF } from './constants.ts';
import { WALL_H } from './fortmap.ts';
import { sinCos } from './math.ts';
import { BTN_BACK, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, type Input, type PlayerState } from './sim.ts';

export interface Ladder {
  /** Середина лестницы на грани стены (у земли) */
  x: number;
  z: number;
  /** Нормаль грани — к тому, кто лезет */
  nx: number;
  nz: number;
  /** Низ и верх (ход по стене) */
  y0: number;
  y1: number;
  /** Полуширина вдоль стены */
  w: number;
  name: string;
}

const W = 0.55;

export const LADDERS: readonly Ladder[] = [
  // снаружи: в проёмы бруствера западной и восточной стен (вернуться в крепость с луга)
  { x: -18, z: -1, nx: -1, nz: 0, y0: 0, y1: WALL_H, w: W, name: 'west-out' },
  { x: 18, z: -1, nx: 1, nz: 0, y0: 0, y1: WALL_H, w: W, name: 'east-out' },
  // со двора на северную стену (там, где были каменные марши)
  { x: -9, z: -13, nx: 0, nz: 1, y0: 0, y1: WALL_H, w: W, name: 'north-w' },
  { x: 9, z: -13, nx: 0, nz: 1, y0: 0, y1: WALL_H, w: W, name: 'north-e' },
  // со двора на боковые стены
  { x: -15, z: -6, nx: 1, nz: 0, y0: 0, y1: WALL_H, w: W, name: 'side-w' },
  { x: 15, z: -6, nx: -1, nz: 0, y0: 0, y1: WALL_H, w: W, name: 'side-e' },
];

/** Вверх и вниз по лестнице, м/с */
export const LADDER_UP = 4.5;
export const LADDER_DOWN = 3;
/** Спрыгнуть: толчок от стены и вверх */
const JUMP_OFF = 4.2;
const JUMP_UP = 4.5;
/** Лицом к стене: косинус угла между взглядом и стеной не меньше */
const FACING = 0.3;
/** Насколько далеко от грани ещё «на лестнице» (центр игрока у стены — PLAYER_HALF) */
const REACH = PLAYER_HALF + 0.5;

const sc = { s: 0, c: 0 };

/** Номер лестницы, у которой стоит игрок (ноги в пределах высоты лестницы), или −1 */
export function ladderAt(x: number, y: number, z: number): number {
  for (let i = 0; i < LADDERS.length; i++) {
    const l = LADDERS[i];
    const rx = x - l.x;
    const rz = z - l.z;
    const out = rx * l.nx + rz * l.nz;
    if (out < 0.15 || out > REACH) continue;
    const along = -rx * l.nz + rz * l.nx;
    if (along < -l.w - 0.1 || along > l.w + 0.1) continue;
    if (y < l.y0 - 0.2 || y > l.y1 + 0.12) continue;
    return i;
  }
  return -1;
}

/**
 * До stepPlayer: на лестнице (у неё и лицом к стене) — своя вертикаль. out — вход для stepPlayer (его копия): на
 * лестнице «назад» не уводит от стены. Возвращает номер лестницы, если игрок на ней (−1 — нет).
 */
export function ladderBefore(s: PlayerState, inp: Input, out: Input, pressed: number): number {
  const i = ladderAt(s.x, s.y, s.z);
  if (i < 0) return -1;
  const l = LADDERS[i];
  sinCos(inp.yaw, sc);
  const facing = sc.s * l.nx + sc.c * l.nz;
  if (facing < FACING) return -1;
  const b = inp.buttons;
  const up = (b & BTN_FORWARD) !== 0 && (b & BTN_BACK) === 0;
  const down = (b & BTN_BACK) !== 0 && (b & BTN_FORWARD) === 0;
  // стоит у подножия и не лезет — обычная ходьба (S уводит от стены)
  if (s.grounded === 1 && !up) return -1;
  if (s.grounded === 0 && (pressed & BTN_JUMP) !== 0) {
    // спрыгнуть: от стены и чуть вверх; сам прыжок stepPlayer уже не делает
    s.vx = l.nx * JUMP_OFF;
    s.vz = l.nz * JUMP_OFF;
    s.vy = JUMP_UP;
    s.jumpBuf = 0;
    s.coyote = 0;
    out.buttons &= ~(BTN_JUMP | BTN_FORWARD | BTN_BACK);
    return -1;
  }
  // stepPlayer вычтет гравитацию этого тика
  s.vy = (up ? LADDER_UP : down ? -LADDER_DOWN : 0) + GRAVITY * DT;
  // к стене — чуть-чуть (держимся), вдоль — гасим, если не идём вбок
  const vn = s.vx * l.nx + s.vz * l.nz;
  const pull = -0.3 - vn;
  s.vx += l.nx * pull;
  s.vz += l.nz * pull;
  if ((b & (BTN_LEFT | BTN_RIGHT)) === 0) {
    const vt = -s.vx * l.nz + s.vz * l.nx;
    s.vx -= -l.nz * vt * 0.5;
    s.vz -= l.nx * vt * 0.5;
  }
  out.buttons &= ~BTN_BACK;
  return i;
}
