// Пеликан-Бомбардир (Z_PELICAN) — летающий босс «Крепости 50» (35-я волна; модель и клипы — client/fort/bosses/pelican.ts,
// стенд lab/fort-rework/bosses.html, числа — shared/fortbosses50.ts). Воздушный бомбардировщик Барона. Три фазы по здоровью:
//   1 — кружит высоко над северной стеной; бомбёжка (летит вдоль линии, четыре бочки в метки) и пике за человеком
//       (красный круг на нём; не ушёл — унесён в зобе). После пике висит низко у стены — зоб открыт (окно): набрали урона —
//       выплёвывает пойманного на стену, иначе — в конце окна;
//   2 — подбит (ниже 60 %): кувырок, летает ниже; бомбёжка, потом садится на зубцы бастиона, клюёт башню (участок
//       бастиона получает удар — обвал глушит башню), ветер крыльями вдоль хода стены (сдувает), сидит открытый;
//   3 — сбит (ниже 25 %, ярость): падает перед стеной и дальше ходит пешком, щёлкает клювом по стене и воротам;
//       ворота пали — во двор, щёлкает по кристаллу.
// Сбить можно выстрелами с учётом высоты (хитбокс — на высоте полёта); башни: баллисты бьют его в первую очередь,
// пушки и смола — по летающим не стреляют (как с крылатками).
import { DT, TICK_RATE } from '../../shared/constants.ts';
import { BOSS_GATE_DMG, BOSS_OPEN_TICKS, ZS_BARREL, ZS_BOSS_APPROACH, ZS_BOSS_OPEN, ZS_THROW } from '../../shared/fort.ts';
import { BOSS_PAUSE, BOSS_PAUSE_RAGE, BOSS_RAGE_SPEED, ZK, Z_PELICAN } from '../../shared/fortkinds.ts';
import {
  PL_AIR_SPEED, PL_BOMB_DMG, PL_BOMB_FLIGHT, PL_BOMB_R, PL_BOMB_TICKS, PL_BOMB_WALL, PL_BOMB_Y, PL_BOMBS, PL_CIRCLE_R, PL_CIRCLE_X,
  PL_CIRCLE_Z, PL_CRASH_TICKS, PL_CRASH_TOUCH, PL_DIVE_GRAB, PL_DIVE_TICKS, PL_FLY_Y, PL_FLY_Y2, PL_GRAB_DMG, PL_GRAB_R,
  PL_GROUND_Z, PL_GUST_DMG, PL_GUST_HIT, PL_GUST_LEN, PL_GUST_PUSH, PL_GUST_TICKS, PL_GUST_W, PL_HOVER_Y, PL_IN_Z, PL_OPEN_Y,
  PL_PECK_DMG, PL_PECK_HIT, PL_PECK_R, PL_PECK_TICKS, PL_PECK_WALL, PL_PERCH_TICKS, PL_PERCH_TOUCH, PL_PERCH_X, PL_PERCH_Y,
  PL_PERCH_Z, PL_PHASE2, PL_PHASE3, PL_PHASE_TICKS, PL_POST_X, PL_SNAP_CRYSTAL, PL_SNAP_DMG, PL_SNAP_HIT, PL_SNAP_R, PL_SNAP_TICKS,
  PL_SNAP_WALL, PL_SPIT_FRAC, ZS_PL_BOMB, ZS_PL_CRASH, ZS_PL_DIVE, ZS_PL_FLY, ZS_PL_GROUND, ZS_PL_GUST, ZS_PL_PECK,
  ZS_PL_PERCH, ZS_PL_PHASE, ZS_PL_SNAP,
} from '../../shared/fortbosses50.ts';
import { CRYSTAL, TOWER_SPOTS, WALL_H } from '../../shared/fortmap.ts';
import { WALL_SECTIONS, sectionAt } from '../../shared/fort50.ts';
import type { BossCtx } from './bosses.ts';
import { WALL_WALK_Z, breachCheck, enterYard, insideYard, onWall, r2, targetOf, walk } from './boss-kit.ts';
import { fly, lerp, reaches, smooth, surfaceY, warnAt, yawTo } from './boss50.ts';
import type { HordeTarget, Zombie } from './horde.ts';

/** Цель полёта в z.combo: кружит, к началу бомбёжки, к точке зависания перед пике, к заходу на насест */
const GO_CIRCLE = 0;
const GO_BOMB = 1;
const GO_DIVE = 2;
const GO_PERCH = 3;
/** Сколько кружит между атаками, тиков: в 1-й фазе и во 2-й */
const CIRCLE_PAUSE = Math.round(2.5 * TICK_RATE);
const CIRCLE_PAUSE2 = Math.round(1.5 * TICK_RATE);
/** Бит в addsMask: следующий насест — восточный бастион */
const PERCH_EAST = 4;
const BASTION_W = WALL_SECTIONS.findIndex((s) => s.id === 'bw');
const BASTION_E = WALL_SECTIONS.findIndex((s) => s.id === 'be');
/** Где выплёвывает пойманного: ход северной стены между воротами и проломами */
const SPIT_X = 8;

export function stepPelican(c: BossCtx, z: Zombie): void {
  if (z.state === ZS_BOSS_APPROACH) {
    // с конца дороги — взлетает и уходит на круг
    z.state = ZS_PL_FLY;
    z.combo = GO_CIRCLE;
    z.t = CIRCLE_PAUSE;
    z.homeX = Math.atan2(z.z - PL_CIRCLE_Z, z.x - PL_CIRCLE_X);
  }
  if (z.chase > 0) holdCheck(c, z);
  switch (z.state) {
    case ZS_PL_FLY:
      flight(c, z);
      return;
    case ZS_PL_BOMB:
      bombRun(c, z);
      return;
    case ZS_PL_DIVE:
      dive(c, z);
      return;
    case ZS_PL_PHASE:
      if (--z.t > 0) {
        // кувырок: снижается до высоты 2-й фазы
        z.y = lerp(z.y, PL_FLY_Y2, 0.03);
        return;
      }
      toCircle(z);
      return;
    case ZS_PL_PERCH:
      perch(c, z);
      return;
    case ZS_PL_PECK:
      peck(c, z);
      return;
    case ZS_PL_GUST:
      gust(c, z);
      return;
    case ZS_PL_CRASH:
      crash(c, z);
      return;
    case ZS_PL_SNAP:
      snap(c, z);
      return;
    case ZS_BOSS_OPEN:
      openTick(c, z);
      return;
    default:
      ground(c, z);
  }
}

function pauseOf(z: Zombie): number {
  return z.stage >= 3 ? BOSS_PAUSE_RAGE : z.stage === 2 ? CIRCLE_PAUSE2 : CIRCLE_PAUSE;
}

function toCircle(z: Zombie): void {
  z.state = ZS_PL_FLY;
  z.combo = GO_CIRCLE;
  z.t = pauseOf(z);
  z.homeX = Math.atan2(z.z - PL_CIRCLE_Z, z.x - PL_CIRCLE_X);
}

/** Фаза по здоровью (только между атаками); true — началась смена */
function phaseCheck(c: BossCtx, z: Zombie): boolean {
  const next = z.hp <= z.maxHp * PL_PHASE3 ? 3 : z.hp <= z.maxHp * PL_PHASE2 ? 2 : 1;
  if (next <= z.stage) return false;
  release(c, z);
  z.attackIndex = 0;
  z.hits.length = 0;
  if (next === 3) {
    // сбит: падает кувырком перед северной стеной
    z.stage = 3;
    z.state = ZS_PL_CRASH;
    z.t = PL_CRASH_TICKS;
    z.fromX = z.x;
    z.fromY = z.y;
    z.fromZ = z.z;
    const sx = z.x < 0 ? -1 : 1;
    z.toX = sx * Math.min(12, Math.max(7, Math.abs(z.x)));
    z.toY = 0;
    z.toZ = PL_GROUND_Z;
    z.homeX = sx * PL_POST_X;
  } else {
    z.stage = 2;
    z.state = ZS_PL_PHASE;
    z.t = PL_PHASE_TICKS;
  }
  c.host.event(['bossphase', z.id, next]);
  return true;
}

// ------------------------------------------------------------ полёт

function flight(c: BossCtx, z: Zombie): void {
  const height = z.stage >= 2 ? PL_FLY_Y2 : PL_FLY_Y;
  const speed = PL_AIR_SPEED;
  if (z.combo !== GO_CIRCLE) {
    // к началу атаки — прямо и быстрее
    if (fly(z, z.fromX, z.fromY, z.fromZ, speed * 1.4)) return;
    if (z.combo === GO_BOMB) bombBegin(c, z);
    else if (z.combo === GO_DIVE) diveBegin(c, z);
    else perchBegin(c, z);
    return;
  }
  if (phaseCheck(c, z)) return;
  // круг против часовой над северной стеной
  z.homeX += (speed / PL_CIRCLE_R) * DT;
  const cx = PL_CIRCLE_X + PL_CIRCLE_R * Math.cos(z.homeX);
  const cz = PL_CIRCLE_Z + PL_CIRCLE_R * Math.sin(z.homeX);
  fly(z, cx, height, cz, speed * 1.2);
  if (z.t > 0 && --z.t > 0) return;
  // ход: 1-я фаза — бомбёжка и пике по очереди; 2-я — бомбёжка, за ней насест
  const step = z.attackIndex++ % 2;
  if (z.stage >= 2 || step === 0 || !diveGoal(c, z)) bombGoal(c, z);
}

// ------------------------------------------------------------ бомбёжка

/** Линия бомбёжки: вдоль x над человеком (на стене — над ходом стены), летит со своей стороны; бочки — точки в z.hits */
function bombGoal(c: BossCtx, z: Zombie): void {
  const target = targetOf(c, z.attackIndex);
  const cx = target ? Math.max(-15, Math.min(15, target.x)) : 0;
  const lineZ = target ? (onWall(target) && target.z < -12 ? WALL_WALK_Z : target.z) : WALL_WALK_Z;
  const dir = z.x < cx ? 1 : -1;
  // середина четырёх бочек — над целью: старт на 8 м/с × середину времени сброса раньше
  const mid = (PL_BOMBS[0] + PL_BOMBS[PL_BOMBS.length - 1]) / 2 / TICK_RATE;
  z.combo = GO_BOMB;
  z.fromX = cx - dir * PL_AIR_SPEED * mid;
  z.fromY = PL_BOMB_Y;
  z.fromZ = lineZ;
  z.toY = dir;
}

function bombBegin(c: BossCtx, z: Zombie): void {
  const dir = z.toY >= 0 ? 1 : -1;
  z.state = ZS_PL_BOMB;
  z.t = PL_BOMB_TICKS;
  z.combo = GO_CIRCLE;
  z.hits.length = 0;
  z.hits.push(z.fromX, dir, z.fromZ);
  for (const s of PL_BOMBS) {
    const x = z.fromX + dir * PL_AIR_SPEED * (s / TICK_RATE);
    const y = surfaceY(c, x, z.fromZ, 0) + 0.8;
    z.hits.push(r2(x), r2(y), r2(z.fromZ));
    warnAt(c, z, ZS_PL_BOMB, x, y, z.fromZ, PL_BOMB_R, s + PL_BOMB_FLIGHT);
  }
  z.toX = z.fromX;
  z.toZ = z.fromZ;
  z.yaw = yawTo(dir, 0);
}

function bombRun(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  const T = PL_BOMB_TICKS - z.t;
  const s = T / TICK_RATE;
  const x0 = z.hits[0], dir = z.hits[1], lz = z.hits[2];
  z.x = x0 + dir * PL_AIR_SPEED * s;
  z.y = PL_BOMB_Y + 0.6 * Math.sin(s * 1.3) + 1.2 * smooth(2.7, 3.4, s);
  z.z = lz;
  for (let i = 0; i < PL_BOMBS.length; i++) {
    const o = 3 + i * 3;
    const x = z.hits[o], y = z.hits[o + 1], zz = z.hits[o + 2];
    // бочка из зоба — почти отвесно в метку
    if (T === PL_BOMBS[i]) host.event(['throw', r2(z.x), r2(z.y + 1.3), r2(z.z), x, y, zz, PL_BOMB_FLIGHT, ZS_THROW]);
    if (T === PL_BOMBS[i] + PL_BOMB_FLIGHT) barrel(c, z, x, y, zz, PL_BOMB_R, PL_BOMB_DMG, PL_BOMB_WALL);
  }
  if (z.t > 0) return;
  z.hits.length = 0;
  // 2-я фаза: после бомбёжки — сразу на насест
  if (z.stage >= 2) {
    z.state = ZS_PL_FLY;
    perchGoal(z);
  } else toCircle(z);
}

function barrel(c: BossCtx, z: Zombie, x: number, y: number, zz: number, r: number, dmg: number, wall: number): void {
  const { host } = c;
  for (const p of host.targets()) if (p.id !== z.chase && reaches(c, p, x, y, zz, r)) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, dmg));
  const sec = sectionAt(x, zz);
  if (sec >= 0 && y >= WALL_H) host.hitWall?.(sec, c.horde.dmgOf(z, wall), x, WALL_H, zz);
  z.atk = (z.atk + 1) & 255;
  host.event(['blast', ZS_BARREL, x, r2(y - 0.6), zz, r]);
}

// ------------------------------------------------------------ пике и зоб

/** Пике за человеком по очереди: зависает выше и снаружи от него; людей нет — false */
function diveGoal(c: BossCtx, z: Zombie): boolean {
  const target = targetOf(c, z.attackIndex);
  if (!target) return false;
  z.combo = GO_DIVE;
  z.chase = 0;
  z.fromX = target.x;
  z.fromY = PL_HOVER_Y;
  z.fromZ = Math.min(target.z - 9, -22);
  z.hits.length = 0;
  z.hits.push(target.id);
  return true;
}

function diveBegin(c: BossCtx, z: Zombie): void {
  const id = z.hits[0];
  const target = c.host.targets().find((p) => p.id === id) ?? targetOf(c, z.attackIndex);
  if (!target) { toCircle(z); return; }
  z.state = ZS_PL_DIVE;
  z.t = PL_DIVE_TICKS;
  z.combo = GO_CIRCLE;
  z.toX = target.x;
  z.toY = target.y + 0.8;
  z.toZ = target.z;
  z.yaw = yawTo(z.toX - z.x, z.toZ - z.z);
  warnAt(c, z, ZS_PL_DIVE, z.toX, z.toY, z.toZ, PL_GRAB_R, PL_DIVE_GRAB);
}

function dive(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  const T = PL_DIVE_TICKS - z.t;
  const s = T / TICK_RATE;
  const w = PL_DIVE_GRAB / TICK_RATE;
  if (s < 1.8) {
    z.x = z.fromX;
    z.y = z.fromY + 0.3 * Math.sin(s * 6);
    z.z = z.fromZ;
  } else if (T < PL_DIVE_GRAB) {
    const k = smooth(1.8, w, s);
    z.x = lerp(z.fromX, z.toX, k);
    z.y = lerp(z.fromY, z.toY - 0.8, k);
    z.z = lerp(z.fromZ, z.toZ, k);
  } else {
    // уходит вверх и от стены — к окну
    const k = smooth(w, PL_DIVE_TICKS / TICK_RATE, s);
    z.x = z.toX;
    z.y = lerp(z.toY - 0.8, PL_OPEN_Y, k);
    z.z = lerp(z.toZ, Math.min(z.toZ - 6, -21), k);
    z.yaw = yawTo(0, 1);
  }
  if (T === PL_DIVE_GRAB) {
    let best: HordeTarget | null = null;
    let bd = PL_GRAB_R;
    for (const p of host.targets()) {
      const d = Math.hypot(p.x - z.toX, p.z - z.toZ);
      if (d < bd && Math.abs(p.y + 0.8 - z.toY) < 2.2) { bd = d; best = p; }
    }
    if (best) {
      z.chase = best.id;
      z.carry = true;
      host.hitPlayer(z.id, best.id, c.horde.dmgOf(z, PL_GRAB_DMG));
    }
    z.atk = (z.atk + 1) & 255;
    host.event(['blast', ZS_PL_DIVE, r2(z.toX), r2(z.toY), r2(z.toZ), best ? PL_GRAB_R : 1]);
  }
  if (z.t > 0) return;
  z.state = ZS_BOSS_OPEN;
  z.t = BOSS_OPEN_TICKS;
  z.fromX = z.x;
  z.fromY = z.y;
  z.fromZ = z.z;
  // сколько у него было здоровья, когда схватил: набрали по нему урона — выплюнет раньше
  z.hits.length = 0;
  z.hits.push(z.hp);
}

/** Пойманный — в зобе (под клювом, впереди корня); умер или вышел — отпускаем */
function holdCheck(c: BossCtx, z: Zombie): void {
  if (!c.host.targets().some((p) => p.id === z.chase)) {
    z.chase = 0;
    z.carry = false;
    return;
  }
  const fx = -Math.sin(z.yaw);
  const fz = -Math.cos(z.yaw);
  c.host.holdPlayer?.(z.chase, z.x + fx * 1.3, z.y + 0.5, z.z + fz * 1.3);
}

/** Выплёвывает пойманного на ход северной стены */
function release(c: BossCtx, z: Zombie): void {
  if (z.chase <= 0) return;
  const x = z.x < 0 ? -SPIT_X : SPIT_X;
  c.host.holdPlayer?.(z.chase, x, WALL_H + 0.05, WALL_WALK_Z);
  c.host.event(['blast', ZS_PL_DIVE, r2(x), r2(WALL_H + 0.8), WALL_WALK_Z, 0]);
  z.chase = 0;
  z.carry = false;
}

function openTick(c: BossCtx, z: Zombie): void {
  if (z.stage === 1) {
    // висит низко у стены, пыхтит
    z.y = z.fromY + 0.25 * Math.sin((BOSS_OPEN_TICKS - z.t) / TICK_RATE * 6.9);
    if (z.chase > 0 && z.hits.length && z.hits[0] - z.hp >= z.maxHp * PL_SPIT_FRAC) release(c, z);
  }
  if (--z.t > 0) return;
  release(c, z);
  z.hits.length = 0;
  if (z.stage >= 3) {
    z.state = ZS_PL_GROUND;
    z.t = pauseOf(z);
    z.homeX = -z.homeX;
  } else toCircle(z);
}

// ------------------------------------------------------------ насест (2-я фаза)

function perchSide(z: Zombie): number {
  return z.addsMask & PERCH_EAST ? 1 : -1;
}

function perchGoal(z: Zombie): void {
  const side = perchSide(z);
  z.combo = GO_PERCH;
  z.fromX = side * 8;
  z.fromY = 11;
  z.fromZ = -27;
}

function perchBegin(c: BossCtx, z: Zombie): void {
  const side = perchSide(z);
  z.state = ZS_PL_PERCH;
  z.t = PL_PERCH_TICKS;
  z.combo = GO_CIRCLE;
  z.fromX = z.x;
  z.fromY = z.y;
  z.fromZ = z.z;
  z.toX = side * PL_PERCH_X;
  z.toY = PL_PERCH_Y;
  z.toZ = PL_PERCH_Z;
  z.yaw = yawTo(z.toX - z.x, z.toZ - z.z);
  void c;
}

function perch(c: BossCtx, z: Zombie): void {
  z.t--;
  const T = PL_PERCH_TICKS - z.t;
  if (T <= PL_PERCH_TOUCH) {
    const k = smooth(0, PL_PERCH_TOUCH, T);
    z.x = lerp(z.fromX, z.toX, k);
    z.y = lerp(z.fromY, z.toY, k) + 1.5 * Math.sin(Math.PI * k) * (1 - k);
    z.z = lerp(z.fromZ, z.toZ, k);
  }
  if (T === PL_PERCH_TOUCH) {
    // сел на зубцы: смотрит вдоль хода стены к воротам
    z.yaw = yawTo(-perchSide(z), 0);
    c.host.event(['blast', ZS_PL_PERCH, r2(z.x), r2(z.y), r2(z.z), 1.5]);
  }
  if (z.t > 0) return;
  peckWarn(c, z);
}

function peckWarn(c: BossCtx, z: Zombie): void {
  const tower = TOWER_SPOTS[perchSide(z) < 0 ? 2 : 3];
  z.state = ZS_PL_PECK;
  z.t = PL_PECK_TICKS;
  z.toX = tower.x;
  z.toY = WALL_H + 0.8;
  z.toZ = tower.z;
  z.yaw = yawTo(tower.x - z.x, tower.z - z.z);
  warnAt(c, z, ZS_PL_PECK, z.toX, z.toY, z.toZ, PL_PECK_R, PL_PECK_HIT);
}

function peck(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  if (PL_PECK_TICKS - z.t === PL_PECK_HIT) {
    const sec = perchSide(z) < 0 ? BASTION_W : BASTION_E;
    if (sec >= 0) host.hitWall?.(sec, c.horde.dmgOf(z, PL_PECK_WALL), z.toX, WALL_H, z.toZ);
    for (const p of host.targets()) if (reaches(c, p, z.toX, z.toY, z.toZ, PL_PECK_R)) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, PL_PECK_DMG));
    z.atk = (z.atk + 1) & 255;
    host.event(['blast', ZS_PL_PECK, r2(z.toX), r2(z.toY), r2(z.toZ), PL_PECK_R]);
  }
  if (z.t > 0) return;
  // ветер крыльями вдоль хода стены к воротам: полоса от насеста
  const dir = -perchSide(z);
  z.state = ZS_PL_GUST;
  z.t = PL_GUST_TICKS;
  z.yaw = yawTo(dir, 0);
  z.toX = z.x + dir * (1.5 + PL_GUST_LEN / 2);
  z.toY = WALL_H + 0.8;
  z.toZ = WALL_WALK_Z;
  warnAt(c, z, ZS_PL_GUST, z.toX, z.toY, z.toZ, PL_GUST_LEN / 2, PL_GUST_HIT);
}

function gust(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  if (PL_GUST_TICKS - z.t === PL_GUST_HIT) {
    const dir = -perchSide(z);
    for (const p of host.targets()) {
      if (!onWall(p) || Math.abs(p.z - z.toZ) > PL_GUST_W / 2 + 0.5 || Math.abs(p.x - z.toX) > PL_GUST_LEN / 2) continue;
      host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, PL_GUST_DMG));
      host.pushPlayer?.(p.id, dir * PL_GUST_PUSH, 0);
    }
    z.atk = (z.atk + 1) & 255;
    host.event(['blast', ZS_PL_GUST, r2(z.toX), r2(z.toY), r2(z.toZ), PL_GUST_LEN / 2]);
  }
  if (z.t > 0) return;
  // сидит открытый, потом — на другой бастион
  z.state = ZS_BOSS_OPEN;
  z.t = BOSS_OPEN_TICKS;
  z.addsMask ^= PERCH_EAST;
}

// ------------------------------------------------------------ сбит: пешком (3-я фаза)

function crash(c: BossCtx, z: Zombie): void {
  z.t--;
  const T = PL_CRASH_TICKS - z.t;
  if (T <= PL_CRASH_TOUCH) {
    const k = (T / PL_CRASH_TOUCH) ** 2;
    z.x = lerp(z.fromX, z.toX, k);
    z.y = lerp(z.fromY, 0, k);
    z.z = lerp(z.fromZ, z.toZ, k);
  }
  if (T === PL_CRASH_TOUCH) {
    z.y = 0;
    c.host.event(['blast', ZS_PL_CRASH, r2(z.x), 0.3, r2(z.z), 3]);
  }
  if (z.t > 0) return;
  z.state = ZS_PL_GROUND;
  z.t = BOSS_PAUSE;
}

function ground(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.y = 0;
  const goIn = insideYard(z) || !host.gateUp();
  breachCheck(c, z, goIn);
  const speed = ZK[Z_PELICAN].speed * BOSS_RAGE_SPEED;
  if (!z.homeX) z.homeX = z.x < 0 ? -PL_POST_X : PL_POST_X;
  const moving = goIn ? enterYard(z, PL_IN_Z, speed) : walk(z, z.homeX, PL_GROUND_Z + 1.5, speed);
  if (moving) {
    z.state = ZS_PL_GROUND;
    return;
  }
  z.yaw = Math.PI;
  if (z.t > 0 && --z.t > 0) return;
  // щёлк, щёлк — и открыт
  if (z.combo >= 2) {
    z.combo = 0;
    z.state = ZS_BOSS_OPEN;
    z.t = BOSS_OPEN_TICKS;
    return;
  }
  z.combo++;
  const inside = insideYard(z);
  z.state = ZS_PL_SNAP;
  z.t = PL_SNAP_TICKS;
  z.toX = inside ? CRYSTAL.x : z.x;
  z.toY = inside ? CRYSTAL.y : WALL_H + 0.8;
  z.toZ = inside ? CRYSTAL.z : WALL_WALK_Z;
  z.chase = 0;
  warnAt(c, z, ZS_PL_SNAP, z.toX, z.toY, z.toZ, PL_SNAP_R, PL_SNAP_HIT);
}

function snap(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  if (PL_SNAP_TICKS - z.t === PL_SNAP_HIT) {
    if (insideYard(z)) host.hitCrystal(c.horde.dmgOf(z, PL_SNAP_CRYSTAL));
    else {
      const sec = sectionAt(z.x, WALL_WALK_Z);
      if (sec >= 0) host.hitWall?.(sec, c.horde.dmgOf(z, PL_SNAP_WALL), z.x, WALL_H, WALL_SECTIONS[sec].face);
      if (host.gateUp() && Math.abs(z.x) < 6.5) host.hitGate(c.horde.dmgOf(z, BOSS_GATE_DMG));
    }
    for (const p of host.targets()) if (reaches(c, p, z.toX, z.toY, z.toZ, PL_SNAP_R)) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, PL_SNAP_DMG));
    z.atk = (z.atk + 1) & 255;
    host.event(['blast', ZS_PL_SNAP, r2(z.toX), r2(z.toY), r2(z.toZ), PL_SNAP_R]);
  }
  if (z.t > 0) return;
  z.state = ZS_PL_GROUND;
  z.t = BOSS_PAUSE_RAGE;
}

