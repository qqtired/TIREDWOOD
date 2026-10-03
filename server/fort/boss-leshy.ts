// Леший (Z_LESHY) — босс 42, 84, 126 … (числа — shared/fortbosses.ts). Ходячее дерево на корнях: стоит далеко в поле и
// бьёт сквозь землю. По кругу:
//   корни — круг под человеком, под воротами или под кристаллом: кристаллу достаётся и без пролома; уйди из круга;
//   целебная роща — зелёный круг LS_HEAL_R вокруг него, колдует полное предупреждение и лечит армию на LS_HEAL_FRAC;
//     набрать по нему LS_BREAK его HP за каст — колдовство сорвано, Леший открыт; не сбили — лечит и окна нет;
//   корни ещё раз, потом прятки — уходит под землю (там неуязвим: выстрел и взрыв не достают), холм ползёт к новому
//     месту, круг — где вылезет (полное предупреждение); вылезает с ударом корней и «рощей» — щитоносцами-лесовиками
//     перед собой; потом открыт.
// После корней — тоже окно. Ярость — корни бьют дважды подряд (у каждых — полная метка), лесовиков больше. Ворота пали —
// по оси ворот во двор (как Барон), прячется и вылезает уже во дворе.
import {
  BOSS_WARN_TICKS, ZS_BOSS_APPROACH, ZS_BOSS_OPEN, ZS_LS_HEAL, ZS_LS_RISE, ZS_LS_ROOTS, ZS_LS_SINK, ZS_LS_UNDER, ZS_WALK,
} from '../../shared/fort.ts';
import {
  LS_BREAK, LS_EMERGE_DMG, LS_EMERGE_R, LS_GROVE_AHEAD, LS_GROVE_BASE, LS_HEAL_FRAC, LS_HEAL_R, LS_HEAL_SELF, LS_HOME_Z,
  LS_IN_SPOTS, LS_IN_Z, LS_RAGE_ADDS, LS_RISE_TICKS, LS_ROOT_CRYSTAL, LS_ROOT_DMG, LS_ROOT_GATE, LS_ROOT_R, LS_SINK_TICKS,
  LS_SPOTS, LS_UNDER_Y,
} from '../../shared/fortbosses.ts';
import { Z_SHIELD, isBossKind } from '../../shared/fortkinds.ts';
import { CRYSTAL, GATE } from '../../shared/fortmap.ts';
import { bossSpeed, raging, type BossCtx } from './bosses.ts';
import {
  AT_CRYSTAL, AT_GATE, addAt, begin, breachCheck, enterYard, insideYard, open, pauseOf, rageCheck, r2, targetOf, walk,
} from './boss-kit.ts';
import type { Zombie } from './horde.ts';

/**
 * Вылез, а корень ещё столько тиков под землёй: снимок с холмом и снимок «уже на земле» не попадают в один отрезок
 * сглаживания клиента — холм не взлетает (модель рисует холм на LS_UNDER_Y выше корня). Тело в позе вылезания ещё в земле.
 */
const RISE_HOLD = 6;

/** Сейчас под землёй (неуязвим) */
export function leshyUnder(z: Zombie): boolean {
  return z.y < -1;
}

export function stepLeshy(c: BossCtx, z: Zombie): void {
  const { host } = c;
  rageCheck(c, z);
  const goIn = insideYard(z) || !host.gateUp();
  if (!leshyUnder(z)) breachCheck(c, z, goIn);
  switch (z.state) {
    case ZS_LS_ROOTS:
      if (--z.t > 0) return;
      rootsLand(c, z);
      if (z.combo > 0) {
        // ярость: сразу вторые корни — в цель другого рода (человек ↔ ворота/кристалл), со своей полной меткой
        z.combo--;
        rootsWarn(c, z, z.chase < 0, z.attackIndex >> 2);
      } else open(z);
      return;
    case ZS_LS_HEAL:
      heal(c, z);
      return;
    case ZS_LS_SINK:
      if (--z.t > 0) return;
      underStart(c, z, goIn);
      return;
    case ZS_LS_UNDER: {
      // холм ползёт к месту вылезания: приходит ровно к удару
      const left = Math.max(1, z.t);
      z.x += (z.toX - z.x) / left;
      z.z += (z.toZ - z.z) / left;
      if (--z.t > 0) return;
      emerge(c, z);
      return;
    }
    case ZS_LS_RISE:
      if (z.y < 0 && z.t <= LS_RISE_TICKS - RISE_HOLD) z.y = 0;
      if (--z.t > 0) return;
      open(z);
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

/** Подход к своему месту (в поле — z LS_HOME_Z, во дворе — по оси ворот), пауза и выбор атаки */
function idle(c: BossCtx, z: Zombie, goIn: boolean): void {
  const speed = bossSpeed(c, z);
  const moving = goIn
    ? insideYard(z) ? walk(z, z.homeX, LS_IN_Z, speed) : enterYard(z, LS_IN_Z, speed)
    : walk(z, z.homeX, LS_HOME_Z, speed);
  if (moving) {
    if (goIn && !insideYard(z)) {
      z.state = ZS_BOSS_APPROACH;
      // во дворе встанет по оси ворот, оттуда и прячется
      z.homeX = 0;
    }
    return;
  }
  if (z.state !== ZS_WALK) {
    z.state = ZS_WALK;
    z.t = pauseOf(z);
    z.yaw = Math.PI;
    return;
  }
  if (z.t > 0 && --z.t > 0) return;
  const step = z.attackIndex % 4;
  if (step === 0 || step === 2) {
    if (raging(z)) z.combo = 1;
    rootsWarn(c, z, step === 0, z.attackIndex >> 2);
  } else if (step === 1) {
    // колдует: метка — роща вокруг него; запоминаем HP на начало — сбить можно уроном за каст
    z.fromY = z.hp;
    begin(c, z, ZS_LS_HEAL, z.x, 0.8, z.z, LS_HEAL_R);
    z.yaw = Math.PI;
  } else {
    z.state = ZS_LS_SINK;
    z.t = LS_SINK_TICKS;
    z.chase = 0;
  }
  z.attackIndex++;
}

/**
 * Корни: под человеком (по очереди, n — номер круга атак) или под строением — воротами (стоят, через раз) или
 * кристаллом. Людей нет — под строением. Метка — на поверхности под целью (ход стены, двор, земля).
 */
function rootsWarn(c: BossCtx, z: Zombie, wantPerson: boolean, n: number): void {
  const person = wantPerson ? targetOf(c, n) : null;
  const gate = c.host.gateUp() && !insideYard(z) && n % 2 === 0;
  if (person) {
    z.chase = person.id;
    begin(c, z, ZS_LS_ROOTS, person.x, person.y + 0.8, person.z, LS_ROOT_R);
  } else if (gate) {
    z.chase = AT_GATE;
    begin(c, z, ZS_LS_ROOTS, 0, 0.8, GATE.face - 0.6, LS_ROOT_R);
  } else {
    z.chase = AT_CRYSTAL;
    begin(c, z, ZS_LS_ROOTS, CRYSTAL.x, 0.8, CRYSTAL.z, LS_ROOT_R);
  }
  z.yaw = Math.atan2(-(z.toX - z.x), -(z.toZ - z.z));
}

/** Корни вылезли: кто в круге на той же высоте, что метка, — получает (прыжок не спасает); ворота или кристалл */
function rootsLand(c: BossCtx, z: Zombie): void {
  const { host } = c;
  const floor = z.toY - 0.8;
  for (const p of host.targets()) {
    if (Math.abs(p.y - floor) < 1.6 && Math.hypot(p.x - z.toX, p.z - z.toZ) < LS_ROOT_R) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, LS_ROOT_DMG));
  }
  if (z.chase === AT_GATE) {
    if (host.gateUp()) host.hitGate(c.horde.dmgOf(z, LS_ROOT_GATE));
  } else if (z.chase === AT_CRYSTAL) host.hitCrystal(c.horde.dmgOf(z, LS_ROOT_CRYSTAL));
  z.atk = (z.atk + 1) & 255;
  host.event(['blast', ZS_LS_ROOTS, r2(z.toX), r2(z.toY), r2(z.toZ), LS_ROOT_R]);
}

/** Колдовство: сбили (урон за каст ≥ LS_BREAK HP) — сорвано и открыт; докастовал — лечит своих и себя, окна нет */
function heal(c: BossCtx, z: Zombie): void {
  const { host } = c;
  if (z.fromY - z.hp >= z.maxHp * LS_BREAK) {
    // радиус 0 — колдовство сорвано
    host.event(['blast', ZS_LS_HEAL, r2(z.x), 0.8, r2(z.z), 0]);
    open(z);
    return;
  }
  if (--z.t > 0) return;
  for (const o of c.horde.zombies) {
    if (!o.alive || o === z || isBossKind(o.kind) || o.hp >= o.maxHp) continue;
    if (Math.hypot(o.x - z.x, o.z - z.z) > LS_HEAL_R) continue;
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * LS_HEAL_FRAC);
  }
  z.hp = Math.min(z.maxHp, z.hp + z.maxHp * LS_HEAL_SELF);
  z.atk = (z.atk + 1) & 255;
  host.event(['heal', z.id, r2(z.x), r2(z.y), r2(z.z), LS_HEAL_R]);
  z.state = ZS_WALK;
  z.t = pauseOf(z);
}

/** Ушёл под землю: выбирает новое место (по кругу из мест поля или двора), метка — где вылезет */
function underStart(c: BossCtx, z: Zombie, goIn: boolean): void {
  const inside = insideYard(z) || goIn;
  const spots = inside ? LS_IN_SPOTS : LS_SPOTS;
  let i = spots.indexOf(z.homeX);
  if (i < 0) i = 1;
  z.homeX = spots[(i + 1 + (z.attackIndex >> 2) % 2) % spots.length];
  z.y = LS_UNDER_Y;
  begin(c, z, ZS_LS_UNDER, z.homeX, 0.8, inside ? LS_IN_Z : LS_HOME_Z, LS_EMERGE_R, BOSS_WARN_TICKS);
}

/** Вылез: удар корнями вокруг себя и «роща» — щитоносцы-лесовики встают перед ним (к крепости); на поверхность — в RISE */
function emerge(c: BossCtx, z: Zombie): void {
  const { host } = c;
  for (const p of host.targets()) {
    if (Math.abs(p.y) < 1.6 && Math.hypot(p.x - z.x, p.z - z.z) < LS_EMERGE_R) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, LS_EMERGE_DMG));
  }
  const count = LS_GROVE_BASE + Math.floor(c.horde.defenders / 2) + (raging(z) ? LS_RAGE_ADDS : 0);
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 1.6;
    const add = addAt(c, Z_SHIELD, z.x + off, z.z + LS_GROVE_AHEAD - Math.abs(off) * 0.25);
    if (!add) break;
    add.yaw = Math.PI;
  }
  z.atk = (z.atk + 1) & 255;
  host.event(['blast', ZS_LS_UNDER, r2(z.x), 0.8, r2(z.z), LS_EMERGE_R]);
  z.state = ZS_LS_RISE;
  z.t = LS_RISE_TICKS;
  z.yaw = Math.PI;
}
