// Король-Тыква (Z_PUMPKIN) — босс 28, 70, 112 … (числа — shared/fortbosses.ts). Огромная тыква с горящим лицом и
// короной: скачет к северной стене и стоит на одном из двух постов (x = ±PK_POST_X перед стеной). По кругу:
//   тыквята — оранжевый круг вокруг него, потом стая пузырей ковыляет к воротам и лопается о створки;
//   семечки — красный круг на человеке (по очереди), горсть летит навесом; людей нет — в ворота;
//   перекат — сворачивается (круг на стене над ним), катится вдоль стены на другой пост, круг бежит вместе с ним:
//   кто стоит под ним на стене и не в прыжке — получает. Своих расталкивает, своих тыквят давит (лопаются).
// После каждой атаки открыт (кружится голова). Ярость — перекат туда и сразу обратно (каждый — с полной меткой), тыквят
// больше. Ворота пали — по оси ворот во двор: тыквята у кристалла, перекат в постамент, семечки по людям.
import { DT } from '../../shared/constants.ts';
import { ZS_BOSS_APPROACH, ZS_BOSS_OPEN, ZS_PK_ROLL, ZS_PK_ROLL_WARN, ZS_PK_SPIT, ZS_PK_SUMMON, ZS_WALK } from '../../shared/fort.ts';
import {
  PK_IN_Z, PK_POST_X, PK_POST_Z, PK_RAGE_ADDS, PK_ROLL_CRYSTAL, PK_ROLL_DMG, PK_ROLL_HIT, PK_ROLL_R, PK_ROLL_SPEED,
  PK_SPIT_CRYSTAL, PK_SPIT_DMG, PK_SPIT_FLIGHT, PK_SPIT_GATE, PK_SPIT_R, PK_SUMMON_R, PK_WALL_Z0, PK_WALL_Z1,
} from '../../shared/fortbosses.ts';
import { BOSS_RAGE_SPEED, ZK, Z_BLOATER, Z_PUMPKIN, isWalkerKind } from '../../shared/fortkinds.ts';
import { CRYSTAL, GATE, PEDESTAL, WALL_H } from '../../shared/fortmap.ts';
import { bossSpeed, packSize, raging, type BossCtx } from './bosses.ts';
import {
  AT_CRYSTAL, AT_GATE, WALL_WALK_Z, addAt, begin, blastReaches, breachCheck, enterYard, insideYard, open, pauseOf,
  rageCheck, r2, roofCheck, targetOf, walk,
} from './boss-kit.ts';
import type { Zombie } from './horde.ts';

/** Где кончается перекат во дворе: перед постаментом кристалла */
const ROLL_IN_Z = PEDESTAL.z0 - ZK[Z_PUMPKIN].r - 0.3;

export function stepPumpkin(c: BossCtx, z: Zombie): void {
  const { host } = c;
  rageCheck(c, z);
  const goIn = insideYard(z) || !host.gateUp();
  breachCheck(c, z, goIn);
  switch (z.state) {
    case ZS_PK_SUMMON:
      if (--z.t > 0) return;
      summon(c, z);
      return;
    case ZS_PK_SPIT:
      if (--z.t === PK_SPIT_FLIGHT) {
        // горсть сорвалась с губ: летит к метке, у всех на виду
        host.event(['throw', r2(z.x), r2(z.y + ZK[Z_PUMPKIN].headY), r2(z.z), r2(z.toX), r2(z.toY), r2(z.toZ), PK_SPIT_FLIGHT, ZS_PK_SPIT]);
      }
      if (z.t > 0) return;
      spitLands(c, z);
      open(z);
      return;
    case ZS_PK_ROLL_WARN:
      if (--z.t > 0) return;
      z.state = ZS_PK_ROLL;
      z.hits.length = 0;
      z.t = Math.max(1, Math.ceil(Math.hypot(rollToX(z) - z.x, rollToZ(z) - z.z) / (PK_ROLL_SPEED * (raging(z) ? BOSS_RAGE_SPEED : 1) * DT)));
      return;
    case ZS_PK_ROLL:
      roll(c, z);
      return;
    case ZS_BOSS_OPEN:
      if (--z.t > 0) return;
      z.state = ZS_WALK;
      z.t = pauseOf(z);
      return;
    default:
      idle(c, z, goIn);
  }
}

/** Подход, пост и выбор атаки. Пост снаружи — ближний к нему (homeX), во дворе — по оси ворот. */
function idle(c: BossCtx, z: Zombie, goIn: boolean): void {
  const speed = bossSpeed(c, z);
  if (!z.homeX) z.homeX = z.x < 0 ? -PK_POST_X : PK_POST_X;
  const moving = goIn ? enterYard(z, PK_IN_Z, speed) : walk(z, z.homeX, PK_POST_Z, speed);
  if (moving) {
    if (goIn && !insideYard(z)) z.state = ZS_BOSS_APPROACH;
    return;
  }
  if (z.state !== ZS_WALK) {
    z.state = ZS_WALK;
    z.t = pauseOf(z);
    z.yaw = Math.PI;
    return;
  }
  if (z.combo > 0) {
    // ярость: сразу второй перекат — обратно
    z.combo--;
    rollWarn(c, z);
    return;
  }
  if (z.t > 0 && --z.t > 0) return;
  const step = z.attackIndex++ % 3;
  if (step === 0) {
    begin(c, z, ZS_PK_SUMMON, z.x, 0.8, z.z, PK_SUMMON_R);
    z.yaw = Math.PI;
  } else if (step === 1) spitWarn(c, z);
  else {
    if (raging(z)) z.combo = 1;
    rollWarn(c, z);
  }
}

/** Тыквята: стая пузырей веером перед ним (к воротам, во дворе — к кристаллу) */
function summon(c: BossCtx, z: Zombie): void {
  const inside = insideYard(z);
  const count = Math.max(2, packSize(c.horde.defenders) + (raging(z) ? PK_RAGE_ADDS : 0) - (inside ? 1 : 0));
  const r = ZK[Z_PUMPKIN].r + 1;
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count - 0.5) * 2.4;
    if (!addAt(c, Z_BLOATER, z.x + Math.sin(a) * r, z.z + Math.cos(a) * r)) break;
  }
  z.atk = (z.atk + 1) & 255;
  c.host.event(['blast', ZS_PK_SUMMON, r2(z.x), 0.8, r2(z.z), PK_SUMMON_R]);
  open(z);
}

/** Семечки: метка на человеке по очереди (метка не следует за ним после замаха); людей нет — ворота, ворот нет — кристалл */
function spitWarn(c: BossCtx, z: Zombie): void {
  const target = targetOf(c, z.attackIndex);
  const gate = c.host.gateUp();
  z.chase = target ? target.id : gate ? AT_GATE : AT_CRYSTAL;
  z.toX = target ? target.x : gate ? 0 : CRYSTAL.x;
  z.toY = target ? target.y + 0.8 : gate ? 1.5 : CRYSTAL.y;
  z.toZ = target ? target.z : gate ? GATE.face - 0.4 : CRYSTAL.z;
  // крыша над меткой — отмечаем крышу сразу, на всё время предупреждения
  if (z.chase !== AT_GATE) roofCheck(c, z);
  begin(c, z, ZS_PK_SPIT, z.toX, z.toY, z.toZ, PK_SPIT_R);
  z.yaw = Math.atan2(-(z.toX - z.x), -(z.toZ - z.z));
}

function spitLands(c: BossCtx, z: Zombie): void {
  const { host } = c;
  const covered = roofCheck(c, z);
  for (const p of host.targets()) {
    if (blastReaches(c, z, p, PK_SPIT_R)) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, PK_SPIT_DMG));
  }
  if (z.chase === AT_GATE) {
    if (host.gateUp()) host.hitGate(c.horde.dmgOf(z, PK_SPIT_GATE));
  } else if (z.chase === AT_CRYSTAL && !covered) host.hitCrystal(c.horde.dmgOf(z, PK_SPIT_CRYSTAL));
  z.atk = (z.atk + 1) & 255;
  host.event(['blast', ZS_PK_SPIT, r2(z.toX), r2(z.toY), r2(z.toZ), PK_SPIT_R]);
}

/** Куда катится: снаружи — на другой пост (homeX уже переставлен), во дворе — в постамент */
function rollToX(z: Zombie): number {
  return insideYard(z) ? 0 : z.homeX;
}

function rollToZ(z: Zombie): number {
  return insideYard(z) ? ROLL_IN_Z : PK_POST_Z;
}

/** Сворачивается: снаружи — метка на стене над ним, катится на другой пост; во дворе — метка вокруг него, в постамент */
function rollWarn(c: BossCtx, z: Zombie): void {
  const inside = insideYard(z);
  if (!inside) z.homeX = z.x < 0 ? PK_POST_X : -PK_POST_X;
  z.fromX = z.x;
  z.fromZ = z.z;
  z.chase = inside ? AT_CRYSTAL : 0;
  begin(c, z, ZS_PK_ROLL_WARN, z.x, inside ? 0.8 : WALL_H + 0.8, inside ? z.z : WALL_WALK_Z, PK_ROLL_R);
  z.yaw = Math.atan2(-(rollToX(z) - z.x), -(rollToZ(z) - z.z));
}

/** Тик переката: катится к концу, метка бежит с ним; кого задел — получает (раз за перекат), своих — в стороны */
function roll(c: BossCtx, z: Zombie): void {
  const { host } = c;
  const inside = z.chase === AT_CRYSTAL;
  const left = Math.max(1, z.t);
  z.x += (rollToX(z) - z.x) / left;
  z.z += (rollToZ(z) - z.z) / left;
  z.toX = z.x;
  if (inside) z.toZ = z.z;
  const r = ZK[Z_PUMPKIN].r;
  for (const p of host.targets()) {
    if (p.air || z.hits.includes(p.id)) continue;
    // снаружи: трясётся ход стены над ним; рядом по земле — тоже под тыкву
    const wall = !inside && p.y >= WALL_H - 0.4 && p.z > PK_WALL_Z0 && p.z < PK_WALL_Z1 && Math.abs(p.x - z.x) < PK_ROLL_HIT;
    const ground = p.y < 1.5 && Math.hypot(p.x - z.x, p.z - z.z) < r + 0.5;
    if (!wall && !ground) continue;
    z.hits.push(p.id);
    host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, PK_ROLL_DMG));
  }
  for (const o of c.horde.zombies) {
    if (!o.alive || o === z || !isWalkerKind(o.kind) || o.y > 0.01) continue;
    const dx = o.x - z.x;
    const dz = o.z - z.z;
    const reach = r + ZK[o.kind].r;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach || Math.hypot(dx, dz) > reach) continue;
    if (o.kind === Z_BLOATER) {
      // своих тыквят давит — лопаются (и ему чуть достаётся)
      c.horde.kill(o, 0);
      continue;
    }
    // в сторону от линии переката
    if (inside) o.x = z.x + (dx >= 0 ? 1 : -1) * (reach + 0.2);
    else o.z = z.z + (dz >= 0 ? 1 : -1) * (reach + 0.2);
  }
  if (--z.t > 0) return;
  z.atk = (z.atk + 1) & 255;
  if (inside) {
    host.hitCrystal(c.horde.dmgOf(z, PK_ROLL_CRYSTAL));
    host.event(['blast', ZS_PK_ROLL, r2(z.x), 0.8, r2(z.z + r), 3]);
  } else host.event(['blast', ZS_PK_ROLL, r2(z.x), r2(WALL_H + 0.8), WALL_WALK_Z, PK_ROLL_R]);
  if (z.combo > 0) {
    // ярость: сразу назад, второй перекат — со своей полной меткой
    z.state = ZS_WALK;
    z.t = 1;
  } else open(z);
}
