// Общее для новых боссов «Крепости» — Короля-Тыквы, Ткачихи и Лешего (server/fort/boss-*.ts): шаг к точке, метка атаки,
// окно уязвимости, ярость, подкрепление, проход павших ворот, цель по очереди. Ритм тот же, что у Барона, Тарана и
// Валуна (bosses.ts): их помощники там закрыты, а сам bosses.ts не трогаем — здесь свои, того же смысла.
import { DT } from '../../shared/constants.ts';
import { BOSS_OPEN_TICKS, BOSS_WARN_TICKS, ZS_BOSS_OPEN } from '../../shared/fort.ts';
import { BOSS_PAUSE, BOSS_PAUSE_RAGE, BOSS_RAGE } from '../../shared/fortkinds.ts';
import { THROAT_Z, WALL_H } from '../../shared/fortmap.ts';
import { raging, type BossCtx } from './bosses.ts';
import type { HordeTarget, Zombie } from './horde.ts';

/** Цель атаки в z.chase: человек — его номер, ворота, кристалл */
export const AT_GATE = -1;
export const AT_CRYSTAL = -2;

/** Дальше этого z — прошёл проём ворот во двор (внутренняя грань северной стены — −13) */
export const YARD_Z = -12;
/** Середина хода по северной стене (z): там метки атак по стене */
export const WALL_WALK_Z = -14.6;

/** Точка попадания луча (traceAttack) — общий буфер, в тике без выделений */
export const hitOut = { x: 0, y: 0, z: 0 };

export function pauseOf(z: Zombie): number {
  return raging(z) ? BOSS_PAUSE_RAGE : BOSS_PAUSE;
}

/** Ярость на BOSS_RAGE HP — один раз; true — началась только что (событие bossphase) */
export function rageCheck(c: BossCtx, z: Zombie): boolean {
  if (z.stage >= 2 || z.hp > z.maxHp * BOSS_RAGE) return false;
  z.stage = 2;
  c.host.event(['bossphase', z.id, 2]);
  return true;
}

/** Шаг к точке; face — поворачиваться по ходу (иначе — лицом к крепости). true — ещё идёт. */
export function walk(z: Zombie, x: number, zz: number, speed: number, face = true): boolean {
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

/** Метка атаки: событие 'warn' — цель (toX/Y/Z), радиус и тик удара (через z.t тиков) */
export function warn(c: BossCtx, z: Zombie, attack: number, r: number): void {
  c.host.event(['warn', z.id, attack, r2(z.toX), r2(z.toY), r2(z.toZ), r, c.host.tick + z.t]);
}

/** Начать атаку: состояние, цель, полное предупреждение (или ticks) и метка событием */
export function begin(c: BossCtx, z: Zombie, attack: number, x: number, y: number, zz: number, r: number, ticks = BOSS_WARN_TICKS): void {
  z.state = attack;
  z.t = ticks;
  z.toX = x;
  z.toY = y;
  z.toZ = zz;
  warn(c, z, attack, r);
}

/** Открыт после удара: окно уязвимости, потом пауза и следующая атака */
export function open(z: Zombie): void {
  z.state = ZS_BOSS_OPEN;
  z.t = BOSS_OPEN_TICKS;
}

/** Удар сверху по метке: если над ней крыша — удар примет крыша (её и отмечаем заранее) */
export function roofCheck(c: BossCtx, z: Zombie): boolean {
  if (!c.host.traceAttack(z.toX, z.toY + 15, z.toZ, z.toX, z.toY, z.toZ, hitOut)) return false;
  z.toY = hitOut.y + 0.06;
  return true;
}

/** Задело ли человека взрывом в метке радиуса r: в шаре и без стены между */
export function blastReaches(c: BossCtx, z: Zombie, p: HordeTarget, r: number): boolean {
  if (Math.hypot(p.x - z.toX, p.y + 0.8 - z.toY, p.z - z.toZ) >= r) return false;
  return !c.host.traceAttack(z.toX, z.toY + 0.05, z.toZ, p.x, p.y + 0.8, p.z, hitOut);
}

/** Человек на высоте хода стены (ход, башни, бастионы) */
export function onWall(p: HordeTarget): boolean {
  return p.y >= WALL_H - 0.4 && p.y < WALL_H + 1.4;
}

/** Подкрепление: враг kind в точке (x, zz); лимит живых не пробивает (мест нет — null) */
export function addAt(c: BossCtx, kind: number, x: number, zz: number): Zombie | null {
  const add = c.horde.spawn(kind, 1);
  if (!add) return null;
  add.x = x;
  add.z = zz;
  return add;
}

/** Босс во дворе (прошёл проём ворот) */
export function insideYard(z: Zombie): boolean {
  return z.z > YARD_Z;
}

/**
 * Ворота пали — во двор: снаружи сначала на ось ворот (подальше от «горла»), потом прямо по оси через проём до (0, inZ).
 * Застрять негде: ходит напрямую, проём проходит по оси. true — ещё идёт.
 */
export function enterYard(z: Zombie, inZ: number, speed: number): boolean {
  if (!insideYard(z) && Math.abs(z.x) > 0.3 && walk(z, 0, Math.min(z.z, THROAT_Z - 3), speed)) return true;
  return walk(z, 0, inZ, speed);
}

/** Прорыв во двор объявляем один раз (бит 1 в addsMask); встали новые ворота раньше, чем вошёл, — снова снаружи */
export function breachCheck(c: BossCtx, z: Zombie, goIn: boolean): void {
  if (goIn && !insideYard(z) && !(z.addsMask & 1)) {
    z.addsMask |= 1;
    c.host.event(['breach', z.id]);
  } else if (!goIn) z.addsMask &= ~1;
}

/** Человек по очереди: index-й из живых (null — никого) */
export function targetOf(c: BossCtx, index: number): HordeTarget | null {
  const list = c.host.targets();
  return list.length ? list[index % list.length] : null;
}

export function turnTo(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
