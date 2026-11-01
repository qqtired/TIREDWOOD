// Избушка (Z_HUT) — финал «Крепости 50» (50-я волна, одна, без Кракена; модель и клипы — client/fort/bosses/hut.ts, стенд
// lab/fort-rework/bosses.html, числа — shared/fortbosses50.ts). Рыбацкая изба Барона на лапах чайки, 11 м. Появляется
// сидя наседкой и встаёт, идёт к северной стене и встаёт перед участком (сначала сквозные — запад и восток, потом
// бастионы; пробила — к следующему). Три фазы по здоровью, у каждой атаки — метка на всё время предупреждения:
//   пинок — участок стены под меткой получает удар (пролом через несколько пинков), кто на ходу стены в метке — получает;
//   печные бомбы — 3 (со 2-й фазы — 5) бочек из трубы в метки вокруг человека (людей нет — в кристалл);
//   топот (2-я фаза) — прыжок и волна вокруг неё: по земле и по стене (кто в прыжке — цел), ворота и стена трещат;
//   наседка (3-я фаза, ярость) — прыгает на стену, ломает участок, сидит с открытой дверью (бить можно) и несёт три
//   бочки-яйца во двор.
// После пинка и топота дверь открыта (окно ZS_BOSS_OPEN). Ворота пали — во двор не лезет (11 м), бомбит через стену.
import { ZS_BOSS_APPROACH, ZS_BOSS_OPEN, ZS_BARREL, ZS_THROW, ZS_WALK } from '../../shared/fort.ts';
import { BOSS_OPEN_TICKS, BOSS_GATE_DMG } from '../../shared/fort.ts';
import { BOSS_PAUSE, BOSS_PAUSE_RAGE, BOSS_RAGE_SPEED, ZK, Z_HUT } from '../../shared/fortkinds.ts';
import {
  EGG_CRYSTAL, EGG_DMG, EGG_FLIGHT, EGG_R, HUT_APPEAR_TICKS, HUT_BOMB_CRYSTAL, HUT_BOMB_DMG, HUT_BOMB_FLIGHT, HUT_BOMB_GAP,
  HUT_BOMB_R, HUT_BOMB_WALL, HUT_BOMBS1, HUT_BOMBS2, HUT_BOMBS_TICKS, HUT_KICK_DMG, HUT_KICK_HIT, HUT_KICK_R, HUT_KICK_TICKS,
  HUT_KICK_WALL, HUT_NEST_EGGS, HUT_NEST_LAND, HUT_NEST_TICKS, HUT_PHASE2, HUT_PHASE3, HUT_PHASE_TICKS, HUT_REACH,
  HUT_STOMP_DMG, HUT_STOMP_GATE, HUT_STOMP_HIT, HUT_STOMP_PUSH, HUT_STOMP_R, HUT_STOMP_TICKS, HUT_STOMP_WALL, NEST_DMG, NEST_DZ,
  NEST_R, NEST_WALL, ZS_F50_BARREL, ZS_HUT_APPEAR, ZS_HUT_BOMBS, ZS_HUT_KICK, ZS_HUT_NEST, ZS_HUT_PHASE, ZS_HUT_STOMP, nestOnWall,
} from '../../shared/fortbosses50.ts';
import { CRYSTAL, GATE, WALL_H } from '../../shared/fortmap.ts';
import { WALL_SECTIONS, holeCenter, sectionAt } from '../../shared/fort50.ts';
import type { BossCtx } from './bosses.ts';
import { WALL_WALK_Z, YARD_Z, onWall, r2, targetOf, walk } from './boss-kit.ts';
import { lerp, reaches, surfaceY, warnAt } from './boss50.ts';
import type { Zombie } from './horde.ts';

/** Перед какими участками встаёт: сначала сквозные северные, потом бастионы */
const PASSAGES = ['nw', 'ne'].map((id) => WALL_SECTIONS.findIndex((s) => s.id === id));
const BASTIONS = ['bw', 'be'].map((id) => WALL_SECTIONS.findIndex((s) => s.id === id));
/** Участка нет (все северные лежат или без «Крепости 50») — стоит перед воротами */
const GATE_POST_Z = GATE.face - HUT_REACH - 2;
/** Бит в addsMask: уже встала после появления */
const APPEARED = 2;

export function stepHut(c: BossCtx, z: Zombie): void {
  if (!(z.addsMask & APPEARED)) {
    // выходит сидя наседкой: открывает ставни, встряхивается, встаёт на лапы
    z.addsMask |= APPEARED;
    z.state = ZS_HUT_APPEAR;
    z.t = HUT_APPEAR_TICKS;
    z.yaw = Math.PI;
    z.homeX = -1;
    return;
  }
  switch (z.state) {
    case ZS_HUT_APPEAR:
      if (--z.t > 0) return;
      z.state = ZS_BOSS_APPROACH;
      return;
    case ZS_HUT_PHASE:
      if (--z.t > 0) return;
      rest(z);
      return;
    case ZS_HUT_KICK:
      kick(c, z);
      return;
    case ZS_HUT_BOMBS:
      bombs(c, z);
      return;
    case ZS_HUT_STOMP:
      stomp(c, z);
      return;
    case ZS_HUT_NEST:
      nest(c, z);
      return;
    case ZS_BOSS_OPEN:
      if (--z.t > 0) return;
      rest(z);
      return;
    default:
      idle(c, z);
  }
}

function rest(z: Zombie): void {
  z.state = ZS_WALK;
  z.t = z.stage >= 3 ? BOSS_PAUSE_RAGE : BOSS_PAUSE;
}

/** Фаза по здоровью: 2-я ниже 2/3, 3-я ниже 1/3 (ярость); true — началась смена (клип 2,6 с) */
function phaseCheck(c: BossCtx, z: Zombie): boolean {
  const next = z.hp <= z.maxHp * HUT_PHASE3 ? 3 : z.hp <= z.maxHp * HUT_PHASE2 ? 2 : 1;
  if (next <= z.stage) return false;
  z.stage = next;
  z.attackIndex = 0;
  z.state = ZS_HUT_PHASE;
  z.t = HUT_PHASE_TICKS;
  c.host.event(['bossphase', z.id, next]);
  return true;
}

/** Участок, перед которым стоит (−1 — нет): прежний, пока цел; иначе ближний целый сквозной, потом бастион */
function sectionOf(c: BossCtx, z: Zombie): number {
  const up = (sec: number) => c.host.wallUp?.(sec) ?? false;
  if (z.homeX >= 0 && up(z.homeX)) return z.homeX;
  let best = -1;
  for (const list of [PASSAGES, BASTIONS]) {
    let d = Infinity;
    for (const sec of list) {
      if (sec < 0 || !up(sec)) continue;
      const dd = Math.abs(holeCenter(sec).x - z.x);
      if (dd < d) { d = dd; best = sec; }
    }
    if (best >= 0) break;
  }
  z.homeX = best;
  return best;
}

/** Где стоит перед участком: напротив дыры, корень на HUT_REACH от наружной грани */
function postOf(sec: number): { x: number; z: number } {
  if (sec < 0) return { x: 0, z: GATE_POST_Z };
  const s = WALL_SECTIONS[sec];
  return { x: holeCenter(sec).x, z: s.face - HUT_REACH };
}

/** Метка на ходу стены над участком (по ней пинок и посадка наседки) */
function wallMark(sec: number, out: { x: number; y: number; z: number }): void {
  const s = WALL_SECTIONS[sec];
  const c = holeCenter(sec);
  out.x = c.x;
  out.y = WALL_H + 0.8;
  out.z = s.kind === 'passage' ? WALL_WALK_Z : (s.hole[2] + s.hole[3]) / 2 + 1.5;
}
const _m = { x: 0, y: 0, z: 0 };

function idle(c: BossCtx, z: Zombie): void {
  if (phaseCheck(c, z)) return;
  const sec = sectionOf(c, z);
  const post = postOf(sec);
  const speed = ZK[Z_HUT].speed * (z.stage >= 3 ? BOSS_RAGE_SPEED : 1);
  if (walk(z, post.x, post.z, speed)) {
    if (z.state !== ZS_BOSS_APPROACH) z.state = ZS_WALK;
    return;
  }
  if (z.state !== ZS_WALK) {
    z.state = ZS_WALK;
    z.t = BOSS_PAUSE;
    z.yaw = Math.PI;
    return;
  }
  z.yaw = Math.PI;
  if (z.t > 0 && --z.t > 0) return;
  // ход по фазам: 1 — пинок, бомбы; 2 — пинок, бомбы, топот, бомбы; 3 — наседка, пинок, топот, бомбы
  const cycle = z.stage >= 3 ? CYCLE3 : z.stage === 2 ? CYCLE2 : CYCLE1;
  let next = cycle[z.attackIndex++ % cycle.length];
  const target = sec >= 0 || c.host.gateUp();
  if ((next === ZS_HUT_KICK && !target) || (next === ZS_HUT_NEST && sec < 0)) next = ZS_HUT_STOMP;
  if (next === ZS_HUT_KICK) kickWarn(c, z, sec);
  else if (next === ZS_HUT_BOMBS) bombsWarn(c, z);
  else if (next === ZS_HUT_STOMP) stompWarn(c, z);
  else nestWarn(c, z, sec);
}
const CYCLE1 = [ZS_HUT_KICK, ZS_HUT_BOMBS];
const CYCLE2 = [ZS_HUT_KICK, ZS_HUT_BOMBS, ZS_HUT_STOMP, ZS_HUT_BOMBS];
const CYCLE3 = [ZS_HUT_NEST, ZS_HUT_KICK, ZS_HUT_STOMP, ZS_HUT_BOMBS];

// ------------------------------------------------------------ пинок

function kickWarn(c: BossCtx, z: Zombie, sec: number): void {
  z.state = ZS_HUT_KICK;
  z.t = HUT_KICK_TICKS;
  z.chase = sec;
  if (sec >= 0) wallMark(sec, _m);
  else { _m.x = 0; _m.y = 1.5; _m.z = GATE.face - 0.4; }
  z.toX = _m.x;
  z.toY = _m.y;
  z.toZ = _m.z;
  warnAt(c, z, ZS_HUT_KICK, z.toX, z.toY, z.toZ, HUT_KICK_R, HUT_KICK_HIT);
}

function kick(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  if (HUT_KICK_TICKS - z.t === HUT_KICK_HIT) {
    const sec = z.chase;
    if (sec >= 0) host.hitWall?.(sec, c.horde.dmgOf(z, HUT_KICK_WALL), z.toX, WALL_H, WALL_SECTIONS[sec].face);
    else if (host.gateUp()) host.hitGate(c.horde.dmgOf(z, BOSS_GATE_DMG * 2));
    for (const p of host.targets()) if (reaches(c, p, z.toX, z.toY, z.toZ, HUT_KICK_R)) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, HUT_KICK_DMG));
    z.atk = (z.atk + 1) & 255;
    host.event(['blast', ZS_HUT_KICK, r2(z.toX), r2(z.toY), r2(z.toZ), HUT_KICK_R]);
  }
  if (z.t > 0) return;
  open(z);
}

function open(z: Zombie): void {
  z.state = ZS_BOSS_OPEN;
  z.t = BOSS_OPEN_TICKS;
}

// ------------------------------------------------------------ печные бомбы (и яйца наседки — тот же учёт точек в z.hits)

/** Бочки в метки вокруг человека по очереди (людей нет — у кристалла); точки — в z.hits по три числа */
function bombsWarn(c: BossCtx, z: Zombie): void {
  z.state = ZS_HUT_BOMBS;
  z.t = HUT_BOMBS_TICKS;
  z.hits.length = 0;
  const target = targetOf(c, z.attackIndex);
  const times = z.stage >= 2 ? HUT_BOMBS2 : HUT_BOMBS1;
  const cx = target ? target.x : CRYSTAL.x;
  const cz = target ? target.z : CRYSTAL.z - 2;
  const n = times.length;
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * HUT_BOMB_GAP;
    const y = surfaceY(c, x, cz, target ? target.y : 0) + 0.8;
    z.hits.push(r2(x), r2(y), r2(cz));
    warnAt(c, z, ZS_HUT_BOMBS, x, y, cz, HUT_BOMB_R, times[i] + HUT_BOMB_FLIGHT);
  }
  z.toX = cx;
  z.toY = target ? target.y + 0.8 : CRYSTAL.y;
  z.toZ = cz;
}

function bombs(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  const T = HUT_BOMBS_TICKS - z.t;
  const times = z.stage >= 2 ? HUT_BOMBS2 : HUT_BOMBS1;
  for (let i = 0; i < times.length && i * 3 + 2 < z.hits.length; i++) {
    const x = z.hits[i * 3], y = z.hits[i * 3 + 1], zz = z.hits[i * 3 + 2];
    // из трубы (слева сзади на крыше) — навесом в метку
    if (T === times[i]) host.event(['throw', r2(z.x - 1.25), r2(z.y + 11.9), r2(z.z - 0.75), x, y, zz, HUT_BOMB_FLIGHT, ZS_HUT_BOMBS]);
    if (T === times[i] + HUT_BOMB_FLIGHT) barrelLands(c, z, x, y, zz, HUT_BOMB_R, HUT_BOMB_DMG, HUT_BOMB_WALL, HUT_BOMB_CRYSTAL);
  }
  if (z.t > 0) return;
  z.hits.length = 0;
  rest(z);
}

/** Бочка упала: люди в шаре, участок стены под ней, кристалл рядом; вспышка — как бочка подрывника */
function barrelLands(c: BossCtx, z: Zombie, x: number, y: number, zz: number, r: number, dmg: number, wall: number, crystal: number): void {
  const { host } = c;
  for (const p of host.targets()) if (reaches(c, p, x, y, zz, r)) host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, dmg));
  const sec = sectionAt(x, zz);
  if (wall > 0 && sec >= 0 && y >= WALL_H) host.hitWall?.(sec, c.horde.dmgOf(z, wall), x, WALL_H, zz);
  if (crystal > 0 && Math.hypot(x - CRYSTAL.x, zz - CRYSTAL.z) < r + 1.5) host.hitCrystal(c.horde.dmgOf(z, crystal));
  z.atk = (z.atk + 1) & 255;
  host.event(['blast', ZS_BARREL, x, r2(y - 0.6), zz, r]);
}

// ------------------------------------------------------------ топот

function stompWarn(c: BossCtx, z: Zombie): void {
  z.state = ZS_HUT_STOMP;
  z.t = HUT_STOMP_TICKS;
  z.toX = z.x;
  z.toY = 0.8;
  z.toZ = z.z;
  warnAt(c, z, ZS_HUT_STOMP, z.toX, z.toY, z.toZ, HUT_STOMP_R, HUT_STOMP_HIT);
}

function stomp(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  if (HUT_STOMP_TICKS - z.t === HUT_STOMP_HIT) {
    for (const p of host.targets()) {
      if (p.air || p.y > WALL_H + 1.4 || Math.hypot(p.x - z.x, p.z - z.z) > HUT_STOMP_R) continue;
      host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, HUT_STOMP_DMG));
      // со стены — кубарем к краю (во двор, если она снаружи)
      if (onWall(p)) host.pushPlayer?.(p.id, 0, Math.sign(p.z - z.z) * HUT_STOMP_PUSH);
    }
    if (host.gateUp() && Math.hypot(z.x, z.z - GATE.face) < HUT_STOMP_R + 3) host.hitGate(c.horde.dmgOf(z, HUT_STOMP_GATE));
    host.hitWallAt?.(z.x, z.z + HUT_REACH, HUT_STOMP_R, c.horde.dmgOf(z, HUT_STOMP_WALL), 2);
    z.atk = (z.atk + 1) & 255;
    host.event(['blast', ZS_HUT_STOMP, r2(z.x), 0.3, r2(z.z), HUT_STOMP_R]);
  }
  if (z.t > 0) return;
  open(z);
}

// ------------------------------------------------------------ наседка

/** Прыгает на ход стены над участком (корень едет вперёд, как поза стенда), метка посадки — там */
function nestWarn(c: BossCtx, z: Zombie, sec: number): void {
  z.state = ZS_HUT_NEST;
  z.t = HUT_NEST_TICKS;
  z.chase = sec;
  z.fromZ = z.z;
  z.hits.length = 0;
  wallMark(sec, _m);
  z.toX = _m.x;
  z.toY = _m.y;
  z.toZ = _m.z;
  warnAt(c, z, ZS_HUT_NEST, z.toX, z.toY, z.toZ, NEST_R, HUT_NEST_LAND);
}

function nest(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.t--;
  const T = HUT_NEST_TICKS - z.t;
  // на стене: корень там же, где изба (метки, выстрелы, полоска — по ней)
  z.z = z.fromZ + NEST_DZ * nestOnWall(T);
  if (T === HUT_NEST_LAND) {
    const sec = z.chase;
    if (sec >= 0) host.hitWall?.(sec, c.horde.dmgOf(z, NEST_WALL), z.toX, WALL_H, WALL_SECTIONS[sec].face);
    for (const p of host.targets()) {
      if (!reaches(c, p, z.toX, z.toY, z.toZ, NEST_R)) continue;
      host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, NEST_DMG));
      host.pushPlayer?.(p.id, Math.sign(p.x - z.toX || 1) * 2, 0);
    }
    z.atk = (z.atk + 1) & 255;
    host.event(['blast', ZS_HUT_NEST, r2(z.toX), r2(z.toY), r2(z.toZ), NEST_R]);
  }
  for (let i = 0; i < HUT_NEST_EGGS.length; i++) {
    if (T === HUT_NEST_EGGS[i]) eggWarn(c, z, i);
    if (T === HUT_NEST_EGGS[i] + EGG_FLIGHT && i * 3 + 2 < z.hits.length) {
      barrelLands(c, z, z.hits[i * 3], z.hits[i * 3 + 1], z.hits[i * 3 + 2], EGG_R, EGG_DMG, 0, EGG_CRYSTAL);
    }
  }
  if (z.t > 0) return;
  z.z = z.fromZ;
  z.hits.length = 0;
  rest(z);
}

/** Яйцо-бочка во двор: в человека во дворе по очереди, иначе — к кристаллу всё ближе */
function eggWarn(c: BossCtx, z: Zombie, i: number): void {
  const yard = c.host.targets().filter((p) => p.z > YARD_Z && p.y < WALL_H - 0.5);
  const p = yard.length ? yard[(z.attackIndex + i) % yard.length] : null;
  const k = 0.35 + 0.25 * i;
  const x = p ? p.x : lerp(z.toX, CRYSTAL.x, k);
  const zz = p ? p.z : lerp(YARD_Z + 1, CRYSTAL.z - 1.5, k);
  const y = surfaceY(c, x, zz, 0) + 0.8;
  z.hits.push(r2(x), r2(y), r2(zz));
  warnAt(c, z, ZS_F50_BARREL, x, y, zz, EGG_R, EGG_FLIGHT);
  c.host.event(['throw', r2(z.x), r2(WALL_H + 2.5), r2(z.z), r2(x), r2(y), r2(zz), EGG_FLIGHT, ZS_THROW]);
}
