// Ткачиха (Z_WEAVER) — босс 35, 77, 119 … (числа — shared/fortbosses.ts). Паучиха-бабушка в платочке: к воротам не
// идёт — выбирает сторону северной стены, где больше людей, лезет на наружную грань и висит на ней, голова над
// бруствером. По кругу, между атаками переползая по стене поближе к людям:
//   паутина — круг на человеке; накрыло — урон и липкая паутина на WV_WEB_TICKS: жжётся, пока в ней стоишь; рвётся
//     выстрелами (WV_WEB_HP попаданий в её круг — tearWebAt из game.ts); башня в паутине стреляет реже (webSlowAt);
//   хлёст лапами — круг на ходу стены перед ней; прыжок не спасает — отойди;
//   кладка — брюшко раздувается, у подножия стены вылупляются паучата-липучки и лезут на стену рядом с ней.
// После каждой атаки открыта (висит, сердце на брюшке светится). Ярость (или пали ворота) — бросает атаку и перелезает
// через стену во двор, идёт к кристаллу: первым делом укус кристалла, потом паутина, хлёст вокруг себя, кладка во дворе.
// Застрять негде: подход, стена и перелаз — по заданным точкам, без поля расстояний.
import { DT } from '../../shared/constants.ts';
import {
  ZS_BOSS_OPEN, ZS_WALK, ZS_WV_BITE, ZS_WV_BROOD, ZS_WV_CLIMB, ZS_WV_HANG, ZS_WV_OVER, ZS_WV_SWEEP, ZS_WV_TORN, ZS_WV_WEB,
  type FortEvent,
} from '../../shared/fort.ts';
import {
  WV_BITE_CRYSTAL, WV_BITE_DMG, WV_BITE_R, WV_BROOD_R, WV_CLIMB_TICKS, WV_CRAWL_SPEED, WV_DROP_Z, WV_FOOT_Z, WV_HANG_Y,
  WV_HANG_Z, WV_IN_Z, WV_OVER_TICKS, WV_SWEEP_DMG, WV_SWEEP_R, WV_WEB_DOT, WV_WEB_EVERY, WV_WEB_HIT, WV_WEB_HP, WV_WEB_MAX,
  WV_WEB_R, WV_WEB_TICKS, WV_WEB_TOWER_SLOW, WV_X_IN, WV_X_OUT,
} from '../../shared/fortbosses.ts';
import { Z_CLIMBER } from '../../shared/fortkinds.ts';
import { PARAPET_H, PEDESTAL, WALL_H } from '../../shared/fortmap.ts';
import { bossSpeed, packSize, raging, type BossCtx } from './bosses.ts';
import {
  AT_CRYSTAL, WALL_WALK_Z, addAt, begin, blastReaches, onWall, open, pauseOf, rageCheck, r2, roofCheck, targetOf, walk,
} from './boss-kit.ts';
import type { Horde, Zombie } from './horde.ts';

/** Биты в z.addsMask: висит на стене, перелезла во двор, во дворе обошла лестницу */
const ON_WALL = 2;
const INSIDE = 4;
const PASSED = 8;
/** Паутина летит столько тиков (конец предупреждения) */
const WEB_FLIGHT = 24;
/** Перелаз во двор: x — между лестницей со двора и боковой стеной; обход лестницы по пути к кристаллу */
const DROP_X = 12;
const AROUND_Z = -6;

/** Висит на стене (влезла и ещё не перелезла во двор) */
export function weaverOnWall(z: Zombie): boolean {
  return (z.addsMask & ON_WALL) !== 0;
}

/** Перелезла во двор (ярость) */
export function weaverInside(z: Zombie): boolean {
  return (z.addsMask & INSIDE) !== 0;
}

export function stepWeaver(c: BossCtx, z: Zombie): void {
  stepWebs(c, z);
  act(c, z);
  // висит на стене — признак ZF_WV_WALL (= ZF_CARRY, у босса бочки не бывает) в снимке: модели — лежать на грани стены
  // или стоять на земле в тех же состояниях (атаки и окно — и на стене, и во дворе)
  z.carry = weaverOnWall(z);
}

function act(c: BossCtx, z: Zombie): void {
  if (rageCheck(c, z) && weaverOnWall(z)) {
    // ярость на стене: бросает атаку и лезет через стену во двор
    overStart(c, z);
    return;
  }
  switch (z.state) {
    case ZS_WV_CLIMB:
      climb(c, z);
      return;
    case ZS_WV_OVER:
      over(z);
      return;
    case ZS_WV_SWEEP:
      if (--z.t > 0) return;
      sweepLands(c, z);
      open(z);
      return;
    case ZS_WV_WEB:
      if (--z.t === WEB_FLIGHT) {
        const head = weaverOnWall(z) ? 3.6 : 2.3;
        c.host.event(['throw', r2(z.x), r2(z.y + head), r2(z.z), r2(z.toX), r2(z.toY), r2(z.toZ), WEB_FLIGHT, ZS_WV_WEB]);
      }
      if (z.t > 0) return;
      webLands(c, z);
      open(z);
      return;
    case ZS_WV_BROOD:
      if (--z.t > 0) return;
      brood(c, z);
      open(z);
      return;
    case ZS_WV_BITE:
      if (--z.t > 0) return;
      biteLands(c, z);
      open(z);
      return;
    case ZS_BOSS_OPEN:
      if (--z.t > 0) return;
      z.state = weaverOnWall(z) ? ZS_WV_HANG : ZS_WALK;
      z.t = pauseOf(z);
      return;
    case ZS_WV_HANG:
      hang(c, z);
      return;
    default:
      ground(c, z);
  }
}

// ------------------------------------------------------------ путь: подход, подъём, стена, перелаз

/** Сторона северной стены (−1 запад, 1 восток), где больше людей на стене; поровну — запад */
function sideByDefenders(c: BossCtx): number {
  let west = 0;
  let east = 0;
  for (const p of c.host.targets()) {
    if (!onWall(p)) continue;
    if (p.x < 0) west++;
    else east++;
  }
  return east > west ? 1 : -1;
}

/** На земле: снаружи — к подножию стены под своим местом и наверх; во дворе — к постаменту и атаки оттуда */
function ground(c: BossCtx, z: Zombie): void {
  const speed = bossSpeed(c, z);
  if (weaverInside(z)) {
    // к кристаллу мимо лестницы со двора: сначала вдоль боковой стены, потом к постаменту
    if (!(z.addsMask & PASSED)) {
      if (walk(z, Math.sign(z.homeX || 1) * DROP_X, AROUND_Z, speed)) return;
      z.addsMask |= PASSED;
    }
    if (walk(z, 0, WV_IN_Z, speed)) return;
    if (z.state !== ZS_WALK) {
      z.state = ZS_WALK;
      z.t = pauseOf(z);
      z.yaw = Math.PI;
      return;
    }
    if (z.t > 0 && --z.t > 0) return;
    attackInside(c, z);
    return;
  }
  if (!z.homeX) z.homeX = sideByDefenders(c) * WV_X_IN;
  if (walk(z, z.homeX, WV_FOOT_Z, speed)) return;
  // у подножия: лезет на грань стены
  z.state = ZS_WV_CLIMB;
  z.t = WV_CLIMB_TICKS;
  z.fromX = z.x;
  z.fromY = 0;
  z.fromZ = z.z;
  z.yaw = Math.PI;
}

function climb(c: BossCtx, z: Zombie): void {
  const u = 1 - Math.max(0, --z.t) / WV_CLIMB_TICKS;
  z.y = z.fromY + (WV_HANG_Y - z.fromY) * u;
  z.z = z.fromZ + (WV_HANG_Z - z.fromZ) * u;
  if (z.t > 0) return;
  z.addsMask |= ON_WALL;
  if (raging(z) || !c.host.gateUp()) {
    overStart(c, z);
    return;
  }
  z.state = ZS_WV_HANG;
  z.t = pauseOf(z);
  z.homeX = nextAnchor(c, z);
}

/** Висит: переползает к своему месту по грани стены, пауза, атака */
function hang(c: BossCtx, z: Zombie): void {
  const dx = z.homeX - z.x;
  if (Math.abs(dx) > 0.05) {
    z.x += Math.sign(dx) * Math.min(Math.abs(dx), WV_CRAWL_SPEED * (raging(z) ? 1.25 : 1) * DT);
    return;
  }
  if (z.t > 0 && --z.t > 0) return;
  // ворота пали — вся армия во дворе, и она туда же: через стену
  if (!c.host.gateUp()) overStart(c, z);
  else attackWall(c, z);
}

/** Следующее место на стене: напротив ближайшего человека на её стороне (между башней и бастионом); нет людей — качается */
function nextAnchor(c: BossCtx, z: Zombie): number {
  const side = Math.sign(z.homeX || z.x || -1);
  let best = Infinity;
  let x = Math.abs(z.x) > (WV_X_IN + WV_X_OUT) / 2 ? WV_X_IN : WV_X_OUT;
  for (const p of c.host.targets()) {
    if (!onWall(p) || Math.sign(p.x) !== side) continue;
    const d = Math.abs(p.x - z.x);
    if (d < best) {
      best = d;
      x = Math.min(WV_X_OUT, Math.max(WV_X_IN, Math.abs(p.x)));
    }
  }
  return side * x;
}

/** Начать перелаз во двор; прорыв объявляем (бит 1 в addsMask — как у остальных боссов, один раз) */
function overStart(c: BossCtx, z: Zombie): void {
  if (!(z.addsMask & 1)) {
    z.addsMask |= 1;
    c.host.event(['breach', z.id]);
  }
  z.state = ZS_WV_OVER;
  z.t = WV_OVER_TICKS;
  z.fromX = z.x;
  z.fromY = z.y;
  z.fromZ = z.z;
  z.chase = 0;
}

/** Перелаз: вверх по грани до бруствера, через ход стены к месту прыжка, прыжок во двор */
function over(z: Zombie): void {
  const u = 1 - Math.max(0, --z.t) / WV_OVER_TICKS;
  const dropX = Math.sign(z.fromX || 1) * DROP_X;
  const top = WALL_H + PARAPET_H - 0.2;
  if (u < 0.45) {
    const k = u / 0.45;
    z.y = z.fromY + (top - z.fromY) * k;
    z.z = z.fromZ + (-15.4 - z.fromZ) * k;
  } else if (u < 0.7) {
    const k = (u - 0.45) / 0.25;
    z.x = z.fromX + (dropX - z.fromX) * k;
    z.y = top + (WALL_H - top) * k;
    z.z = -15.4 + (-13.6 + 15.4) * k;
  } else {
    const k = (u - 0.7) / 0.3;
    z.x = dropX;
    z.y = Math.max(0, WALL_H * (1 - k * k) + 1.2 * k * (1 - k));
    z.z = -13.6 + (WV_DROP_Z + 13.6) * k;
  }
  if (z.t > 0) return;
  z.y = 0;
  z.addsMask = (z.addsMask & ~ON_WALL) | INSIDE;
  z.homeX = dropX;
  z.state = ZS_WALK;
  z.t = pauseOf(z);
  // во дворе первым делом — укус кристалла
  z.attackIndex = 0;
}

// ------------------------------------------------------------ атаки

/** На стене по кругу: паутина, хлёст, кладка; людей нет — вместо паутины кладка */
function attackWall(c: BossCtx, z: Zombie): void {
  const step = z.attackIndex++ % 3;
  if (step === 0 && webWarn(c, z)) {
    // место для следующей атаки — после этой
  } else if (step === 1) begin(c, z, ZS_WV_SWEEP, z.x, WALL_H + 0.8, WALL_WALK_Z, WV_SWEEP_R);
  else begin(c, z, ZS_WV_BROOD, z.x, 0.8, WV_FOOT_Z + 0.6, WV_BROOD_R);
  z.homeX = nextAnchor(c, z);
}

/** Во дворе по кругу: укус кристалла, паутина, хлёст вокруг себя, кладка */
function attackInside(c: BossCtx, z: Zombie): void {
  const step = z.attackIndex++ % 4;
  if (step === 0) {
    z.chase = AT_CRYSTAL;
    begin(c, z, ZS_WV_BITE, 0, 0.8, PEDESTAL.z0, WV_BITE_R);
  } else if (step === 1 && webWarn(c, z)) {
    // паутина
  } else if (step === 2) begin(c, z, ZS_WV_SWEEP, z.x, 0.8, z.z, WV_SWEEP_R);
  else begin(c, z, ZS_WV_BROOD, z.x, 0.8, z.z, WV_BROOD_R);
  z.yaw = Math.PI;
}

/** Паутина в человека по очереди; false — людей нет */
function webWarn(c: BossCtx, z: Zombie): boolean {
  const target = targetOf(c, z.attackIndex);
  if (!target) return false;
  z.chase = target.id;
  z.toX = target.x;
  z.toY = target.y + 0.8;
  z.toZ = target.z;
  roofCheck(c, z);
  begin(c, z, ZS_WV_WEB, z.toX, z.toY, z.toZ, WV_WEB_R);
  return true;
}

function sweepLands(c: BossCtx, z: Zombie): void {
  const wall = z.toY > WALL_H;
  for (const p of c.host.targets()) {
    const level = wall ? onWall(p) : p.y < 1.5;
    if (level && Math.hypot(p.x - z.toX, p.z - z.toZ) < WV_SWEEP_R) c.host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, WV_SWEEP_DMG));
  }
  z.atk = (z.atk + 1) & 255;
  c.host.event(['blast', ZS_WV_SWEEP, r2(z.toX), r2(z.toY), r2(z.toZ), WV_SWEEP_R]);
}

function webLands(c: BossCtx, z: Zombie): void {
  for (const p of c.host.targets()) {
    if (blastReaches(c, z, p, WV_WEB_R)) c.host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, WV_WEB_HIT));
  }
  z.atk = (z.atk + 1) & 255;
  addWeb(c, z, z.toX, z.toY - 0.8, z.toZ);
}

/** Кладка: паучата-липучки — у подножия стены (лезут рядом с ней) или во дворе вокруг неё (сразу к кристаллу) */
function brood(c: BossCtx, z: Zombie): void {
  const inside = weaverInside(z);
  const count = packSize(c.horde.defenders);
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 1.1;
    const add = inside
      ? addAt(c, Z_CLIMBER, z.x + Math.sin(i * 2.4) * 2.6, z.z + Math.cos(i * 2.4) * 2.6)
      : addAt(c, Z_CLIMBER, z.x + off, WV_FOOT_Z + 0.6);
    if (!add) break;
    // снаружи лезут в ближнюю точку северной стены (у неё за спиной), во дворе — сразу к кристаллу
    add.climb = inside ? -1 : add.x < 0 ? 0 : 1;
  }
  z.atk = (z.atk + 1) & 255;
  c.host.event(['blast', ZS_WV_BROOD, r2(z.toX), r2(z.toY), r2(z.toZ), WV_BROOD_R]);
}

function biteLands(c: BossCtx, z: Zombie): void {
  c.host.hitCrystal(c.horde.dmgOf(z, WV_BITE_CRYSTAL));
  for (const p of c.host.targets()) {
    if (p.y < 2 && Math.hypot(p.x - z.toX, p.z - z.toZ) < WV_BITE_R) c.host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, WV_BITE_DMG));
  }
  z.atk = (z.atk + 1) & 255;
  c.host.event(['blast', ZS_WV_BITE, r2(z.toX), r2(z.toY), r2(z.toZ), WV_BITE_R]);
}

// ------------------------------------------------------------ паутина

/** Липкая паутина на поверхности: где (ноги), до какого тика, сколько попаданий выдержит, чья */
interface Web {
  x: number;
  y: number;
  z: number;
  until: number;
  hp: number;
  owner: number;
}

/** Паутина орды (у орды своя; сама орда о ней не знает — horde.ts не трогаем) */
const WEBS = new WeakMap<Horde, Web[]>();

function websOf(horde: Horde): Web[] {
  let list = WEBS.get(horde);
  if (!list) {
    list = [];
    WEBS.set(horde, list);
  }
  return list;
}

function tornEvent(w: Web): FortEvent {
  return ['blast', ZS_WV_TORN, r2(w.x), r2(w.y), r2(w.z), WV_WEB_R];
}

function addWeb(c: BossCtx, z: Zombie, x: number, y: number, zz: number): void {
  const list = websOf(c.horde);
  // больше WV_WEB_MAX — старая спадает
  while (list.length >= WV_WEB_MAX) c.host.event(tornEvent(list.shift()!));
  list.push({ x, y, z: zz, until: c.host.tick + WV_WEB_TICKS, hp: WV_WEB_HP, owner: z.id });
  c.host.event(['blast', ZS_WV_WEB, r2(x), r2(y), r2(zz), WV_WEB_R]);
}

/** Тик паутины этой Ткачихи: старая спадает сама, стоящих в ней жжёт раз в WV_WEB_EVERY тиков */
function stepWebs(c: BossCtx, z: Zombie): void {
  const list = WEBS.get(c.horde);
  if (!list || !list.length) return;
  const tick = c.host.tick;
  let n = 0;
  for (const w of list) if (w.until > tick) list[n++] = w;
  list.length = n;
  if (tick % WV_WEB_EVERY !== 0) return;
  for (const w of list) {
    if (w.owner !== z.id) continue;
    for (const p of c.host.targets()) {
      if (p.air || Math.abs(p.y - w.y) > 1 || Math.hypot(p.x - w.x, p.z - w.z) >= WV_WEB_R) continue;
      c.host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, WV_WEB_DOT));
    }
  }
}

/** Живая паутина: не истекла и её Ткачиха жива */
function live(horde: Horde, w: Web, tick: number): boolean {
  return w.until > tick && horde.byId(w.owner) !== null;
}

/**
 * Выстрел кончился в (x, y, z) — если в круге живой паутины, она рвётся (WV_WEB_HP попаданий; порвана — вспышка
 * ZS_WV_TORN). Зовёт game.ts на каждый выстрел (и arsenal — на каждую дробину). true — попал в паутину.
 */
export function tearWebAt(host: { readonly tick: number; event(e: FortEvent): void }, horde: Horde, x: number, y: number, zz: number): boolean {
  const list = WEBS.get(horde);
  if (!list || !list.length) return false;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (!live(horde, w, host.tick) || Math.abs(y - w.y) > 1.6 || Math.hypot(x - w.x, zz - w.z) > WV_WEB_R) continue;
    if (--w.hp > 0) return true;
    host.event(tornEvent(w));
    list.splice(i, 1);
    return true;
  }
  return false;
}

/** Во сколько раз реже стреляет башня в точке (паутина на ней — WV_WEB_TOWER_SLOW, иначе 1) — для arsenal */
export function webSlowAt(horde: Horde, tick: number, x: number, y: number, zz: number): number {
  const list = WEBS.get(horde);
  if (!list) return 1;
  for (const w of list) {
    if (live(horde, w, tick) && Math.abs(y - w.y) < 2 && Math.hypot(x - w.x, zz - w.z) < WV_WEB_R + 0.5) return WV_WEB_TOWER_SLOW;
  }
  return 1;
}

/** Сколько живой паутины (тесты, отладка) */
export function webCount(horde: Horde, tick: number): number {
  const list = WEBS.get(horde);
  if (!list) return 0;
  let n = 0;
  for (const w of list) if (live(horde, w, tick)) n++;
  return n;
}
