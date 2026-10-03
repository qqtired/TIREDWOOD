// Боссы «Крепости»: Барон Варенья (7, 28, 49 …), Таран (14, 35, 56 …), Валун (21, 42, 63 …). Общий ритм: идёт на свою
// стоянку, между атаками броня (BOSS_ARMOR), каждая атака — метка на полное время предупреждения, после удара ядро
// открыто (BOSS_OPEN_TICKS). На 50 % HP — ярость (ZF_RAGE в снимке): быстрее, паузы короче и своё усиление.
// Орда (horde.ts) вызывает step* каждый тик для живого босса; люди, ворота, кристалл — через HordeHost.
import { DT } from '../../shared/constants.ts';
import {
  BOSS_BOMB_R, BOSS_CRYSTAL_DMG, BOSS_GATE_DMG, BOSS_OPEN_TICKS, BOSS_PULSE_R, BOSS_WARN_TICKS, ZK, ZS_BOSS_APPROACH,
  ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE, ZS_CHARGE, ZS_CHARGE_WARN, ZS_HOWL, ZS_QUAKE, ZS_STOMP, ZS_THROW,
  ZS_WALK, Z_BOSS, Z_FLYER, Z_RAM, Z_RUNNER, isWalkerKind,
} from '../../shared/fort.ts';
import {
  BOSS_PAUSE, BOSS_PAUSE_RAGE, BOSS_RAGE, BOSS_RAGE_SPEED, BOSS_TIER_SPEED, GOLEM_HOME_Z, HOWL_TICKS, QUAKE_DMG, QUAKE_R,
  RAM_CRYSTAL_DMG, RAM_GATE_DMG, RAM_HIT, RAM_HOME_Z, RAM_LANE, RAM_SPEED, ROCK_CRYSTAL_DMG, ROCK_DMG, ROCK_FLIGHT_TICKS,
  ROCK_GATE_DMG, ROCK_R, STOMP_DMG, STOMP_R,
} from '../../shared/fortkinds.ts';
import { CRYSTAL, GATE, PEDESTAL, WALL_H } from '../../shared/fortmap.ts';
import type { Horde, HordeHost, HordeTarget, Zombie } from './horde.ts';

/** Что боссу нужно от орды: хозяин (люди, ворота, события) и сама орда (подкрепления, урон волны, круг босса) */
export interface BossCtx {
  readonly host: HordeHost;
  readonly horde: Horde;
}

/** Цель атаки: человек (его номер), ворота, кристалл */
const AT_GATE = -1;
const AT_CRYSTAL = -2;

const _hit = { x: 0, y: 0, z: 0 };

// ------------------------------------------------------------ общее

export function raging(z: Zombie): boolean {
  return z.stage >= 2;
}

function pauseOf(z: Zombie): number {
  return raging(z) ? BOSS_PAUSE_RAGE : BOSS_PAUSE;
}

/** Ход босса, м/с: тип × круг × ярость */
export function bossSpeed(c: BossCtx, z: Zombie): number {
  return ZK[z.kind].speed * Math.min(1.5, 1 + BOSS_TIER_SPEED * c.horde.bossTier) * (raging(z) ? BOSS_RAGE_SPEED : 1);
}

/** Ярость на BOSS_RAGE HP — один раз; true — началась только что */
function rageCheck(c: BossCtx, z: Zombie): boolean {
  if (z.stage >= 2 || z.hp > z.maxHp * BOSS_RAGE) return false;
  z.stage = 2;
  c.host.event(['bossphase', z.id, 2]);
  return true;
}

/** Шаг к точке; face — поворачиваться по ходу (иначе — пятится лицом к крепости). true — ещё идёт. */
function walk(z: Zombie, x: number, zz: number, speed: number, face = true): boolean {
  const dx = x - z.x;
  const dz = zz - z.z;
  const d = Math.hypot(dx, dz);
  if (d <= 0.3) return false;
  const move = Math.min(d, speed * DT);
  z.x += (dx / d) * move;
  z.z += (dz / d) * move;
  z.yaw = turnTo(z.yaw, face ? Math.atan2(-dx, -dz) : Math.PI, 0.12);
  return true;
}

function warn(c: BossCtx, z: Zombie, attack: number, r: number): void {
  c.host.event(['warn', z.id, attack, r2(z.toX), r2(z.toY), r2(z.toZ), r, c.host.tick + z.t]);
}

/** Метка удара сверху: если над точкой крыша — удар примет крыша (её и отмечаем заранее) */
function roofCheck(c: BossCtx, z: Zombie): boolean {
  if (!c.host.traceAttack(z.toX, z.toY + 15, z.toZ, z.toX, z.toY, z.toZ, _hit)) return false;
  z.toY = _hit.y + 0.06;
  return true;
}

/** Задело ли человека взрывом в (toX, toY, toZ) радиуса r: в шаре и без стены между */
function blastReaches(c: BossCtx, z: Zombie, p: HordeTarget, r: number): boolean {
  if (Math.hypot(p.x - z.toX, p.y + 0.8 - z.toY, p.z - z.toZ) >= r) return false;
  return !c.host.traceAttack(z.toX, z.toY + 0.05, z.toZ, p.x, p.y + 0.8, p.z, _hit);
}

/** Подкрепление: count врагов kind по бокам от (x, z); лимит живых не пробивает (мест нет — не выходят) */
function pack(c: BossCtx, kind: number, count: number, x: number, z: number, spread: number): void {
  for (let i = 0; i < count; i++) {
    const add = c.horde.spawn(kind, i % 2 ? 0 : 2);
    if (!add) return;
    add.x = x + (i % 2 ? -1 : 1) * (spread + i);
    add.z = z - 2 - (i >> 1) * 1.5;
  }
}

/** Сколько в стае подкрепления на n защитников */
export function packSize(n: number): number {
  return 3 + Math.ceil((n - 1) * 0.8);
}

/** Открыт после удара; потом пауза и следующая атака */
function open(z: Zombie): void {
  z.state = ZS_BOSS_OPEN;
  z.t = BOSS_OPEN_TICKS;
}

// ------------------------------------------------------------ Барон Варенья

/**
 * Барон стоит в 7 м от ворот и по кругу: удар по воротам (пока стоят), залп по людям (метки), волна по стене (прыгни).
 * Ярость — паузы короче, зовёт крылаток (одна стая).
 */
export function stepBaron(c: BossCtx, z: Zombie): void {
  const { host } = c;
  if (rageCheck(c, z)) pack(c, Z_FLYER, packSize(c.horde.defenders), 0, -27, 7);
  if (z.state === ZS_BOSS_APPROACH) {
    if (walk(z, 0, -23, bossSpeed(c, z))) return;
    z.state = ZS_WALK;
    z.t = pauseOf(z);
  }
  if (z.state === ZS_BOSS_OPEN) {
    if (--z.t > 0) return;
    z.state = ZS_WALK;
    z.t = pauseOf(z);
    return;
  }
  if (z.state === ZS_BOSS_GATE || z.state === ZS_BOSS_BOMB || z.state === ZS_BOSS_PULSE) {
    if (--z.t > 0) return;
    const attack = z.state;
    const r = attack === ZS_BOSS_PULSE ? BOSS_PULSE_R : attack === ZS_BOSS_GATE ? 6 : BOSS_BOMB_R;
    const covered = attack === ZS_BOSS_BOMB && roofCheck(c, z);
    for (const p of host.targets()) {
      const inArea = attack === ZS_BOSS_PULSE
        ? Math.hypot(p.x - z.toX, p.z - z.toZ) < r && p.y >= WALL_H - 0.4 && p.y < WALL_H + 1.2
        : Math.hypot(p.x - z.toX, p.y + 0.8 - z.toY, p.z - z.toZ) < r;
      const visible = !host.traceAttack(z.toX, z.toY + 0.05, z.toZ, p.x, p.y + 0.8, p.z, _hit);
      if (inArea && visible) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, attack === ZS_BOSS_GATE ? 20 : attack === ZS_BOSS_BOMB ? 24 : ZK[Z_BOSS].hit));
    }
    if (attack === ZS_BOSS_GATE) {
      if (host.gateUp()) host.hitGate(c.horde.dmgOf(z, BOSS_GATE_DMG));
    } else if (attack === ZS_BOSS_BOMB && z.chase === 0 && !covered) host.hitCrystal(c.horde.dmgOf(z, BOSS_CRYSTAL_DMG));
    z.atk = (z.atk + 1) & 255;
    host.event(['blast', attack, r2(z.toX), r2(z.toY), r2(z.toZ), r]);
    open(z);
    return;
  }
  if (z.t > 0 && --z.t > 0) return;
  const index = z.attackIndex++;
  const step = index % 3;
  const attack = step === 0 && host.gateUp() ? ZS_BOSS_GATE : step === 2 ? ZS_BOSS_PULSE : ZS_BOSS_BOMB;
  let target: HordeTarget | null = null;
  if (attack === ZS_BOSS_BOMB) {
    const targets = host.targets();
    // по очереди; метка не следует за человеком после начала замаха
    if (targets.length) target = targets[index % targets.length];
  }
  z.chase = attack === ZS_BOSS_GATE ? AT_GATE : target?.id ?? 0;
  z.toX = attack === ZS_BOSS_BOMB ? target?.x ?? CRYSTAL.x : 0;
  z.toY = attack === ZS_BOSS_GATE ? 1.5 : attack === ZS_BOSS_PULSE ? WALL_H + 0.8 : target ? target.y + 0.8 : CRYSTAL.y;
  z.toZ = attack === ZS_BOSS_GATE ? GATE.face : attack === ZS_BOSS_PULSE ? -14.6 : target?.z ?? CRYSTAL.z;
  // крыша над меткой — отмечаем крышу сразу, на всё время предупреждения
  if (attack === ZS_BOSS_BOMB) roofCheck(c, z);
  z.state = attack;
  z.t = BOSS_WARN_TICKS;
  warn(c, z, attack, attack === ZS_BOSS_PULSE ? BOSS_PULSE_R : attack === ZS_BOSS_GATE ? 6 : BOSS_BOMB_R);
}

// ------------------------------------------------------------ Таран

/**
 * Таран стоит в разбеге от ворот. По очереди: рывок по красной дорожке (в ворота; пали — к кристаллу), после него
 * открыт, потом топот вокруг себя (прыгни), пятится назад; вой — стая шустриков. Ярость — два рывка подряд.
 */
export function stepRam(c: BossCtx, z: Zombie): void {
  const { host } = c;
  rageCheck(c, z);
  const speed = bossSpeed(c, z);
  switch (z.state) {
    case ZS_BOSS_APPROACH:
      if (walk(z, 0, RAM_HOME_Z, speed)) return;
      z.state = ZS_WALK;
      z.t = pauseOf(z);
      return;
    case ZS_WALK: {
      // домой — пятится лицом к воротам
      if (walk(z, 0, RAM_HOME_Z, speed * 1.6, false)) return;
      if (z.t > 0 && --z.t > 0) return;
      if (z.combo > 0) {
        z.combo--;
        chargeWarn(c, z);
        return;
      }
      if (z.attackIndex++ % 2 === 0) {
        if (raging(z)) z.combo = 1;
        chargeWarn(c, z);
      } else {
        z.state = ZS_HOWL;
        z.t = HOWL_TICKS;
        z.toX = z.x;
        z.toY = 2;
        z.toZ = z.z;
        warn(c, z, ZS_HOWL, 0);
      }
      return;
    }
    case ZS_CHARGE_WARN:
      if (--z.t > 0) return;
      z.state = ZS_CHARGE;
      z.fromX = z.x;
      z.fromZ = z.z;
      z.hits.length = 0;
      z.t = Math.max(1, Math.ceil(Math.hypot(z.toX - z.x, z.toZ - z.z) / (RAM_SPEED * (raging(z) ? BOSS_RAGE_SPEED : 1) * DT)));
      return;
    case ZS_CHARGE: {
      const left = z.t;
      z.x += (z.toX - z.x) / left;
      z.z += (z.toZ - z.z) / left;
      rammed(c, z);
      if (--z.t > 0) return;
      // удар: ворота (если метили их и они стоят) или кристалл
      if (z.chase === AT_GATE) {
        if (host.gateUp()) host.hitGate(c.horde.dmgOf(z, RAM_GATE_DMG));
      } else if (z.chase === AT_CRYSTAL) host.hitCrystal(c.horde.dmgOf(z, RAM_CRYSTAL_DMG));
      z.atk = (z.atk + 1) & 255;
      host.event(['blast', ZS_CHARGE, r2(z.x), r2(z.chase === AT_GATE ? 1.5 : 0.8), r2(z.z + ZK[Z_RAM].r), 3]);
      if (z.combo > 0) {
        // ярость: сразу назад и второй рывок
        z.state = ZS_WALK;
        z.t = 1;
      } else open(z);
      return;
    }
    case ZS_BOSS_OPEN:
      if (--z.t > 0) return;
      z.state = ZS_STOMP;
      z.t = BOSS_WARN_TICKS;
      z.toX = z.x;
      z.toY = 0.8;
      z.toZ = z.z;
      warn(c, z, ZS_STOMP, STOMP_R);
      return;
    case ZS_STOMP:
      if (--z.t > 0) return;
      for (const p of host.targets()) {
        if (!p.air && Math.hypot(p.x - z.x, p.z - z.z) < STOMP_R) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, STOMP_DMG));
      }
      z.atk = (z.atk + 1) & 255;
      host.event(['blast', ZS_STOMP, r2(z.x), 0, r2(z.z), STOMP_R]);
      z.state = ZS_WALK;
      z.t = pauseOf(z);
      return;
    case ZS_HOWL:
      if (--z.t > 0) return;
      pack(c, Z_RUNNER, packSize(c.horde.defenders), z.x, z.z, 3);
      z.state = ZS_WALK;
      z.t = pauseOf(z);
      return;
    default:
      z.state = ZS_WALK;
  }
}

/** Метка рывка: дорожка от Тарана к воротам (пали — к кристаллу) */
function chargeWarn(c: BossCtx, z: Zombie): void {
  const gate = c.host.gateUp();
  const r = ZK[Z_RAM].r;
  z.chase = gate ? AT_GATE : AT_CRYSTAL;
  z.toX = 0;
  z.toY = gate ? 1.5 : 0.8;
  z.toZ = gate ? GATE.face - r - 0.2 : PEDESTAL.z0 - r - 0.3;
  z.state = ZS_CHARGE_WARN;
  z.t = BOSS_WARN_TICKS;
  z.yaw = Math.atan2(-(z.toX - z.x), -(z.toZ - z.z));
  warn(c, z, ZS_CHARGE_WARN, RAM_LANE);
}

/** Рывок: кто на дорожке у Тарана — получает (раз за рывок, в прыжке над землёй — нет), своих — разбрасывает в стороны */
function rammed(c: BossCtx, z: Zombie): void {
  const reach = ZK[Z_RAM].r + 0.5;
  for (const p of c.host.targets()) {
    if (p.y > 1.5 || z.hits.includes(p.id)) continue;
    if (Math.hypot(p.x - z.x, p.z - z.z) < reach) {
      z.hits.push(p.id);
      c.host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, RAM_HIT));
    }
  }
  // ось рывка
  let ax = z.toX - z.fromX;
  let az = z.toZ - z.fromZ;
  const len = Math.hypot(ax, az) || 1;
  ax /= len;
  az /= len;
  for (const o of c.horde.zombies) {
    if (!o.alive || o === z || !isWalkerKind(o.kind) || o.y > 0.01) continue;
    const dx = o.x - z.x;
    const dz = o.z - z.z;
    if (Math.abs(dx) > reach + 1 || Math.abs(dz) > reach + 1) continue;
    const along = dx * ax + dz * az;
    const side = dx * -az + dz * ax;
    if (along < -0.5 || along > reach + 0.5 || Math.abs(side) > RAM_LANE + 0.6) continue;
    const push = (RAM_LANE + 1.4) * (side >= 0 ? 1 : -1) - side;
    o.x += -az * push;
    o.z += ax * push;
  }
}

// ------------------------------------------------------------ Валун

/**
 * Валун стоит в поле и бросает камни: в ворота (пока стоят) и по людям по очереди — круг на месте падения и растущая
 * тень; каждая третья атака — землетрясение по стене перед ним (прыгни). Ярость — два камня подряд.
 */
export function stepGolem(c: BossCtx, z: Zombie): void {
  const { host } = c;
  rageCheck(c, z);
  switch (z.state) {
    case ZS_BOSS_APPROACH:
      if (walk(z, 0, GOLEM_HOME_Z, bossSpeed(c, z))) return;
      z.state = ZS_WALK;
      z.t = pauseOf(z);
      return;
    case ZS_WALK:
      if (walk(z, 0, GOLEM_HOME_Z, bossSpeed(c, z))) return;
      if (z.t > 0 && --z.t > 0) return;
      if (z.attackIndex % 3 === 2) {
        z.attackIndex++;
        z.state = ZS_QUAKE;
        z.t = BOSS_WARN_TICKS;
        z.toX = Math.max(-12, Math.min(12, z.x));
        z.toY = WALL_H + 0.8;
        z.toZ = -14.6;
        z.yaw = Math.PI;
        warn(c, z, ZS_QUAKE, QUAKE_R);
      } else {
        if (raging(z)) z.combo = 1;
        throwRock(c, z);
      }
      return;
    case ZS_THROW:
      if (--z.t === ROCK_FLIGHT_TICKS) {
        // камень сорвался с рук: летит к метке, у всех на виду
        const k = ZK[z.kind];
        host.event(['throw', r2(z.x), r2(z.y + k.headY + 1.2), r2(z.z), r2(z.toX), r2(z.toY), r2(z.toZ), ROCK_FLIGHT_TICKS, ZS_THROW]);
      }
      if (z.t > 0) return;
      rockLands(c, z);
      if (z.combo > 0) {
        z.combo--;
        throwRock(c, z);
      } else open(z);
      return;
    case ZS_QUAKE:
      if (--z.t > 0) return;
      for (const p of host.targets()) {
        if (!p.air && p.y >= WALL_H - 0.4 && p.y < WALL_H + 1.2 && Math.hypot(p.x - z.toX, p.z - z.toZ) < QUAKE_R) {
          host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, QUAKE_DMG));
        }
      }
      z.atk = (z.atk + 1) & 255;
      host.event(['blast', ZS_QUAKE, r2(z.toX), r2(z.toY), r2(z.toZ), QUAKE_R]);
      open(z);
      return;
    case ZS_BOSS_OPEN:
      if (--z.t > 0) return;
      z.state = ZS_WALK;
      z.t = pauseOf(z);
      return;
    default:
      z.state = ZS_WALK;
  }
}

/** Замах камнем: метка на месте падения — ворота (каждый второй, пока стоят) или человек по очереди; нет людей — кристалл */
function throwRock(c: BossCtx, z: Zombie): void {
  const index = z.attackIndex++;
  const gate = c.host.gateUp();
  const targets = c.host.targets();
  const target = !(gate && index % 2 === 0) && targets.length ? targets[(index >> 1) % targets.length] : null;
  if (target) {
    z.chase = target.id;
    z.toX = target.x;
    z.toY = target.y + 0.8;
    z.toZ = target.z;
    roofCheck(c, z);
  } else if (gate) {
    z.chase = AT_GATE;
    z.toX = 0;
    z.toY = 1.5;
    z.toZ = GATE.face - 0.4;
  } else {
    z.chase = AT_CRYSTAL;
    z.toX = CRYSTAL.x;
    z.toY = CRYSTAL.y;
    z.toZ = CRYSTAL.z;
    roofCheck(c, z);
  }
  z.state = ZS_THROW;
  z.t = BOSS_WARN_TICKS;
  z.yaw = Math.atan2(-(z.toX - z.x), -(z.toZ - z.z));
  warn(c, z, ZS_THROW, ROCK_R);
}

function rockLands(c: BossCtx, z: Zombie): void {
  const { host } = c;
  const covered = roofCheck(c, z);
  for (const p of host.targets()) {
    if (blastReaches(c, z, p, ROCK_R)) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, ROCK_DMG));
  }
  if (z.chase === AT_GATE) {
    if (host.gateUp()) host.hitGate(c.horde.dmgOf(z, ROCK_GATE_DMG));
  } else if (z.chase === AT_CRYSTAL && !covered) host.hitCrystal(c.horde.dmgOf(z, ROCK_CRYSTAL_DMG));
  z.atk = (z.atk + 1) & 255;
  host.event(['blast', ZS_THROW, r2(z.toX), r2(z.toY), r2(z.toZ), ROCK_R]);
}

function turnTo(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
