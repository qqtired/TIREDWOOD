// Супер-босс «Крепости» — Кракен (волны 25, 50, 75 …). Голова в бухте за обрывом, четыре щупальца — каждое на своей
// полосе вдоль морской стены (числа и геометрия — shared/fortkraken.ts).
//  • Щупальца по очереди (в ярости — парами) замахиваются: метка на полное время там, где стоит человек на южной части
//    террасы, морской стене, берегу или причале; людей рядом нет — по ходу стены и берегу. После удара булава лежит на
//    месте удара — окно: урон полный, в остальное время — броня боссов, под водой — неуязвимы.
//  • Голова плюётся вареньем (метка на человеке по очереди; людей нет — по кристаллу), раз в 25 с ныряет (неуязвима) и
//    всплывает в другом месте. Пока живо хоть одно щупальце — голова в броне (ZS_WALK); срубили все — оглушена (ZS_BOSS_OPEN
//    с отсчётом), потом ныряет и, пока щупальца не отрастут, на поверхности открыта (ZS_BOSS_OPEN без отсчёта): урон
//    полный, плюётся, ныряет чаще.
//  • На 50 % HP — ярость (ZF_RAGE у головы и щупалец): срубленные щупальца отрастают, голова ныряет, удары парами,
//    булава лежит меньше, плевки по два. Погибла голова — щупальца уходят под воду (без награды).
// HP — krakenHp (волна, защитники, круг II/III), урон — как у орды (dmgOf). Орда (horde.ts) вызывает stepKraken и
// stepTentacle для живых частей, урон по частям умножает на krakenArmor. Чистые правила от состояния и тика — без
// случайностей: тот же вход — тот же бой.
//
// Поля Zombie у частей Кракена:
//  голова — t: отсчёт нырка, плевка, оглушения (0 — не оглушена); healT: до следующего нырка в другое место; atkCd: перезарядка плевка;
//    combo: до приказа следующему щупальцу; attackIndex: сколько плевков (очередь целей); addsMask: какие полосы со
//    щупальцами (видела живыми); chase: кому плевок (0 — кристалл); from*: откуда нырнула; to*: метка плевка или где
//    всплывёт; stage: 1, в ярости 2.
//  щупальце — stage: номер полосы (0…3); t: отсчёт подъёма, замаха, лежания; chase: номер головы; attackIndex: сколько
//    ударов; combo: 1 — голова в ярости; from*: откуда пошёл взмах; to*: метка удара (где ляжет булава).
import { WATER_Y } from '../../shared/constants.ts';
import {
  BOSS_ARMOR, ZK, ZS_BOSS_APPROACH, ZS_BOSS_OPEN, ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_TENT_IDLE, ZS_TENT_REST, ZS_TENT_SLAM,
  ZS_WALK, Z_KRAKEN, Z_TENTACLE, isBossKind,
} from '../../shared/fort.ts';
import { BOSS_RAGE } from '../../shared/fortkinds.ts';
import {
  KRAKEN_DEEP_Y, KRAKEN_DIVE_R, KRAKEN_DIVE_RAGE, KRAKEN_DIVE_TICKS, KRAKEN_LURK_BARE, KRAKEN_LURK_RAGE, KRAKEN_LURK_TICKS,
  KRAKEN_LURK_Y, KRAKEN_OPEN_RAGE, KRAKEN_OPEN_TICKS, KRAKEN_OPEN_Y, KRAKEN_RISE_TICKS, KRAKEN_SPIT_CRYSTAL, KRAKEN_SPIT_DMG,
  KRAKEN_SPIT_DOUBLE, KRAKEN_SPIT_FLIGHT, KRAKEN_SPIT_R, KRAKEN_SPIT_RANGE, KRAKEN_SPIT_TICKS, KRAKEN_SPOTS, SEA_WALK_Y, SEA_WALK_Z,
  SHORE_HIT_Z, TENT_COUNT, TENT_DMG, TENT_IDLE_Y, TENT_IDLE_Z, TENT_LANES, TENT_REST_RAGE, TENT_REST_TICKS, TENT_RISE_STEP,
  TENT_RISE_TICKS, TENT_SLAM_R, TENT_SWING_TICKS, TENT_WARN_TICKS, TENT_WIND_Y, TENT_WIND_Z, TENT_ZONE_X, TENT_ZONE_Z0, TENT_ZONE_Z1,
  krakenSpitEvery, tentacleGap, tentacleRoot,
} from '../../shared/fortkraken.ts';
import { CRYSTAL } from '../../shared/fortmap.ts';
import { KRAKEN_HEAD_BASE_HP, TENTACLE_BASE_HP, krakenHp, superTier } from '../../shared/fortwaves.ts';
import type { BossCtx } from './bosses.ts';
import type { Horde, HordeTarget, Zombie } from './horde.ts';

/** Голова поднимается из глубины за последние столько тиков нырка; опускается — за первые (быстро) */
const SURFACE_TICKS = 60;
/** Щупальце под водой (ждёт подъёма) — так глубоко */
const TENT_DEEP_Y = WATER_Y - 10;

const _hit = { x: 0, y: 0, z: 0 };
const _root = { x: 0, y: 0, z: 0 };

// ------------------------------------------------------------ общее

function raging(z: Zombie): boolean {
  return z.stage >= 2;
}

/** Круг супер-босса (0 — Кракен 25-й волны, 1 — II на 50-й …) */
function tierOf(c: BossCtx): number {
  return superTier(c.horde.current?.w ?? 0);
}

/**
 * HP части — по формуле Кракена для этой волны и числа защитников (fill — полное). Подкрепление орды при входе новых
 * защитников (raiseDefenders) масштабирует всех своим множителем — здесь доля HP сохраняется, а максимум возвращается к
 * формуле Кракена.
 */
function fixHp(c: BossCtx, z: Zombie, base: number, fill = false): void {
  const want = krakenHp(base, c.horde.current?.w ?? 1, c.horde.defenders);
  if (fill) {
    z.maxHp = want;
    z.hp = want;
    return;
  }
  if (Math.abs(z.maxHp - want) <= want * 1e-9) return;
  z.hp = z.maxHp > 0 ? z.hp / z.maxHp * want : want;
  z.maxHp = want;
}

/** Живые щупальца головы: маска полос (бит i — полоса i) */
function armsMask(h: Horde, head: Zombie): number {
  let mask = 0;
  for (const o of h.zombies) {
    if (o.alive && o.kind === Z_TENTACLE && o.chase === head.id) mask |= 1 << (o.stage & 7);
  }
  return mask;
}

/** Живая голова щупальца (null — погибла) */
function headOf(h: Horde, z: Zombie): Zombie | null {
  for (const o of h.zombies) if (o.alive && o.kind === Z_KRAKEN && o.id === z.chase) return o;
  return null;
}

/**
 * Множитель урона по части Кракена: под водой — 0; щупальце — полный, пока булава лежит после удара, иначе броня
 * боссов; голова — броня, пока живо хоть одно её щупальце, иначе полный.
 */
export function krakenArmor(h: Horde, z: Zombie): number {
  if (z.state === ZS_KRAKEN_DIVE || z.state === ZS_BOSS_APPROACH) return 0;
  if (z.kind === Z_TENTACLE) return z.state === ZS_TENT_REST ? 1 : BOSS_ARMOR;
  return armsMask(h, z) !== 0 ? BOSS_ARMOR : 1;
}

/** Щупальце в ярости головы — для признака ZF_RAGE в снимке */
export function tentacleRage(z: Zombie): boolean {
  return z.kind === Z_TENTACLE && z.combo > 0;
}

/** Разработка (/hp N в чате крепости): всем боссам и частям Кракена — N % HP, чтобы вживую проверить ярость и гибель */
export function devBossHp(h: Horde, pct: number): number {
  if (!(pct > 0 && pct <= 100)) return 0;
  let n = 0;
  for (const z of h.zombies) {
    if (!z.alive || !(isBossKind(z.kind) || z.kind === Z_TENTACLE)) continue;
    z.hp = Math.max(1, z.maxHp * pct / 100);
    n++;
  }
  return n;
}

// ------------------------------------------------------------ голова

/** Ход головы: появление, ярость, нырки, плевки, приказы щупальцам, оглушение */
export function stepKraken(c: BossCtx, z: Zombie): void {
  if (z.state === ZS_BOSS_APPROACH) {
    initKraken(c, z);
    return;
  }
  fixHp(c, z, KRAKEN_HEAD_BASE_HP);
  const rage = raging(z);
  // ярость — между атаками (начатый плевок долетит, нырок закончится)
  if (!rage && z.hp <= z.maxHp * BOSS_RAGE && (z.state === ZS_WALK || z.state === ZS_BOSS_OPEN)) {
    z.stage = 2;
    c.host.event(['bossphase', z.id, 2]);
    regrow(c, z);
    dive(c, z);
    return;
  }
  switch (z.state) {
    case ZS_KRAKEN_DIVE:
      stepDive(c, z);
      return;
    case ZS_KRAKEN_SPIT:
      conduct(c, z);
      if (z.healT > 0) z.healT--;
      stepSpit(c, z);
      return;
    default:
      lurk(c, z, rage);
  }
}

/**
 * На поверхности: со щупальцами — в броне, приказывает им и плюётся; срубили последнее (могли и пока голова была под
 * водой) — оглушена и открыта; без щупалец — открыта, глаза над водой, плюётся и ныряет чаще.
 */
function lurk(c: BossCtx, z: Zombie, rage: boolean): void {
  const mask = armsMask(c.horde, z);
  const lost = z.addsMask !== 0 && mask === 0;
  z.addsMask = mask;
  const bare = mask === 0;
  z.y += ((bare ? KRAKEN_OPEN_Y : KRAKEN_LURK_Y) - z.y) * 0.06;
  if (lost) {
    z.state = ZS_BOSS_OPEN;
    z.t = rage ? KRAKEN_OPEN_RAGE : KRAKEN_OPEN_TICKS;
    c.host.event(['blast', ZS_BOSS_OPEN, r2(z.x), r2(z.y + ZK[Z_KRAKEN].hcy + 1), r2(z.z), 5]);
    return;
  }
  if (z.state === ZS_BOSS_OPEN && z.t > 0) {
    // оглушена: не плюётся, потом ныряет
    if (--z.t > 0) return;
    dive(c, z);
    return;
  }
  z.state = bare ? ZS_BOSS_OPEN : ZS_WALK;
  z.t = 0;
  z.yaw = turnTo(z.yaw, Math.atan2(z.x, z.z), 0.04);
  conduct(c, z);
  if (z.healT > 0) z.healT--;
  if (z.healT <= 0) {
    dive(c, z);
    return;
  }
  if (z.atkCd === 0) startSpit(c, z);
}

/** Появление: глубоко под первым местом в бухте, щупальца поднимаются по одному, потом голова */
function initKraken(c: BossCtx, z: Zombie): void {
  const spot = KRAKEN_SPOTS[0];
  z.x = z.fromX = spot.x;
  z.z = z.fromZ = spot.z;
  z.y = z.fromY = KRAKEN_DEEP_Y;
  z.yaw = 0;
  z.vx = z.vz = 0;
  z.stage = 1;
  z.combo = 0;
  z.atkCd = 0;
  z.healT = 0;
  z.chase = 0;
  z.attackIndex = 0;
  z.addsMask = 0;
  fixHp(c, z, KRAKEN_HEAD_BASE_HP, true);
  z.state = ZS_KRAKEN_DIVE;
  z.t = KRAKEN_RISE_TICKS;
  z.toX = spot.x;
  z.toY = WATER_Y;
  z.toZ = spot.z;
  c.host.event(['warn', z.id, ZS_KRAKEN_DIVE, r2(z.toX), r2(z.toY), r2(z.toZ), KRAKEN_DIVE_R, c.host.tick + z.t]);
  // середина раньше краёв: 1, 2, 0, 3
  const order = [1, 2, 0, 3];
  for (let k = 0; k < TENT_COUNT; k++) grow(c, z, order[k], 40 + k * TENT_RISE_STEP);
}

/** Нырок: в другое место в бухте (по очереди из двух других), неуязвима */
function dive(c: BossCtx, z: Zombie): void {
  let cur = 0;
  let best = Infinity;
  KRAKEN_SPOTS.forEach((s, i) => {
    const d = Math.hypot(s.x - z.x, s.z - z.z);
    if (d < best) { best = d; cur = i; }
  });
  const next = KRAKEN_SPOTS[(cur + 1 + (z.attackIndex & 1)) % KRAKEN_SPOTS.length];
  z.state = ZS_KRAKEN_DIVE;
  z.t = raging(z) ? KRAKEN_DIVE_RAGE : KRAKEN_DIVE_TICKS;
  z.fromX = z.x;
  z.fromY = z.y;
  z.fromZ = z.z;
  z.toX = next.x;
  z.toY = WATER_Y;
  z.toZ = next.z;
  c.host.event(['warn', z.id, ZS_KRAKEN_DIVE, r2(z.toX), r2(z.toY), r2(z.toZ), KRAKEN_DIVE_R, c.host.tick + z.t]);
}

/** Под водой: уходит на глубину, плывёт к новому месту, последние SURFACE_TICKS — всплывает */
function stepDive(c: BossCtx, z: Zombie): void {
  z.t--;
  if (z.t >= SURFACE_TICKS) {
    z.y += (KRAKEN_DEEP_Y - z.y) * 0.12;
    const left = z.t - SURFACE_TICKS + 1;
    z.x += (z.toX - z.x) / left;
    z.z += (z.toZ - z.z) / left;
    return;
  }
  z.x = z.toX;
  z.z = z.toZ;
  const u = 1 - z.t / SURFACE_TICKS;
  z.y = KRAKEN_DEEP_Y + (KRAKEN_LURK_Y - KRAKEN_DEEP_Y) * (1 - (1 - u) * (1 - u));
  z.yaw = turnTo(z.yaw, Math.atan2(z.x, z.z), 0.1);
  if (z.t > 0) return;
  // всплыла: осмотреться, потом плевок; приказы щупальцам — сразу
  const rage = raging(z);
  z.state = ZS_WALK;
  z.healT = rage ? KRAKEN_LURK_RAGE : armsMask(c.horde, z) !== 0 ? KRAKEN_LURK_TICKS : KRAKEN_LURK_BARE;
  z.atkCd = Math.max(z.atkCd, 70);
  z.combo = Math.min(z.combo, 30);
  c.host.event(['blast', ZS_KRAKEN_DIVE, r2(z.x), r2(WATER_Y), r2(z.z), KRAKEN_DIVE_R]);
}

/** Плевок вареньем: метка на человеке по очереди (кто в досягаемости), людей нет — по кристаллу */
function startSpit(c: BossCtx, z: Zombie): void {
  const targets = c.host.targets();
  let target: HordeTarget | null = null;
  for (let k = 0; k < targets.length; k++) {
    const p = targets[(z.attackIndex + k) % targets.length];
    if (Math.hypot(p.x - z.x, p.z - z.z) <= KRAKEN_SPIT_RANGE) {
      target = p;
      break;
    }
  }
  z.attackIndex++;
  if (target) {
    z.chase = target.id;
    z.toX = target.x;
    z.toY = target.y + 0.8;
    z.toZ = target.z;
  } else {
    z.chase = 0;
    z.toX = CRYSTAL.x;
    z.toY = CRYSTAL.y;
    z.toZ = CRYSTAL.z;
  }
  // крыша над меткой — отмечаем крышу сразу, на всё время предупреждения
  roofCheck(c, z);
  z.state = ZS_KRAKEN_SPIT;
  z.t = KRAKEN_SPIT_TICKS;
  z.yaw = Math.atan2(-(z.toX - z.x), -(z.toZ - z.z));
  c.host.event(['warn', z.id, ZS_KRAKEN_SPIT, r2(z.toX), r2(z.toY), r2(z.toZ), KRAKEN_SPIT_R, c.host.tick + z.t]);
}

function stepSpit(c: BossCtx, z: Zombie): void {
  const { host } = c;
  z.y += (KRAKEN_LURK_Y + 0.6 - z.y) * 0.08;
  if (--z.t === KRAKEN_SPIT_FLIGHT) {
    // клякса сорвалась: летит к метке у всех на виду
    const k = ZK[Z_KRAKEN];
    const fx = z.x - Math.sin(z.yaw) * k.hrx * 0.7;
    const fz = z.z - Math.cos(z.yaw) * k.hrx * 0.7;
    host.event(['throw', r2(fx), r2(z.y + k.hcy + 1.2), r2(fz), r2(z.toX), r2(z.toY), r2(z.toZ), KRAKEN_SPIT_FLIGHT, ZS_KRAKEN_SPIT]);
  }
  if (z.t > 0) return;
  const covered = roofCheck(c, z);
  for (const p of host.targets()) {
    if (Math.hypot(p.x - z.toX, p.y + 0.8 - z.toY, p.z - z.toZ) >= KRAKEN_SPIT_R + 0.3) continue;
    if (host.traceAttack(z.toX, z.toY + 0.05, z.toZ, p.x, p.y + 0.8, p.z, _hit)) continue;
    host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, KRAKEN_SPIT_DMG));
  }
  if (z.chase === 0 && !covered) host.hitCrystal(c.horde.dmgOf(z, KRAKEN_SPIT_CRYSTAL));
  z.atk = (z.atk + 1) & 255;
  host.event(['blast', ZS_KRAKEN_SPIT, r2(z.toX), r2(z.toY), r2(z.toZ), KRAKEN_SPIT_R]);
  z.state = ZS_WALK;
  // ярость: второй плевок почти сразу (у каждого — полная метка), потом перезарядка
  const rage = raging(z);
  z.atkCd = rage && (z.attackIndex & 1) === 1 ? KRAKEN_SPIT_DOUBLE : krakenSpitEvery(c.horde.defenders, rage, tierOf(c));
}

/** Метка сверху: если над точкой крыша — удар примет крыша (её и отмечаем) */
function roofCheck(c: BossCtx, z: Zombie): boolean {
  if (!c.host.traceAttack(z.toX, z.toY + 15, z.toZ, z.toX, z.toY, z.toZ, _hit)) return false;
  z.toY = _hit.y + 0.06;
  return true;
}

/**
 * Приказы щупальцам: раз в шаг очереди — следующему свободному (кто меньше бил, при равенстве — по полосе), в ярости —
 * сразу двоим. Пока голова под водой — щупальца только доделывают начатое.
 */
function conduct(c: BossCtx, head: Zombie): void {
  if (head.combo > 0) {
    head.combo--;
    return;
  }
  const rage = raging(head);
  let a: Zombie | null = null;
  let b: Zombie | null = null;
  for (const o of c.horde.zombies) {
    if (!o.alive || o.kind !== Z_TENTACLE || o.chase !== head.id || o.state !== ZS_TENT_IDLE) continue;
    if (!a || before(o, a)) {
      b = a;
      a = o;
    } else if (!b || before(o, b)) b = o;
  }
  if (!a) return;
  slam(c, a);
  if (rage && b) slam(c, b);
  head.combo = tentacleGap(rage, tierOf(c));
}

function before(a: Zombie, b: Zombie): boolean {
  return a.attackIndex < b.attackIndex || (a.attackIndex === b.attackIndex && a.stage < b.stage);
}

/** Ярость: срубленные щупальца отрастают (живые — как есть) */
function regrow(c: BossCtx, head: Zombie): void {
  const mask = armsMask(c.horde, head);
  let k = 0;
  for (let lane = 0; lane < TENT_COUNT; lane++) {
    if (mask & (1 << lane)) continue;
    grow(c, head, lane, 30 + k * TENT_RISE_STEP);
    k++;
  }
}

/** Новое щупальце на полосе lane: под водой у корня, поднимется через delay тиков */
function grow(c: BossCtx, head: Zombie, lane: number, delay: number): Zombie | null {
  const z = c.horde.spawn(Z_TENTACLE, 1);
  if (!z) return null;
  tentacleRoot(lane, _root);
  z.stage = lane;
  z.chase = head.id;
  z.tier = 0;
  z.crew = false;
  z.x = z.fromX = z.toX = _root.x;
  z.y = z.fromY = z.toY = TENT_DEEP_Y;
  z.z = z.fromZ = z.toZ = _root.z;
  z.yaw = 0;
  z.vx = z.vz = 0;
  z.state = ZS_KRAKEN_DIVE;
  z.t = TENT_RISE_TICKS + delay;
  z.attackIndex = 0;
  z.combo = raging(head) ? 1 : 0;
  fixHp(c, z, TENTACLE_BASE_HP, true);
  head.addsMask |= 1 << lane;
  return z;
}

// ------------------------------------------------------------ щупальца

/** Ход щупальца: поднимается из воды, покачивается, замах и удар по метке, лежит (окно), поднимается обратно */
export function stepTentacle(c: BossCtx, z: Zombie): void {
  const head = headOf(c.horde, z);
  if (!head) {
    // голова погибла — щупальце уходит под воду (без награды)
    c.horde.kill(z, 0);
    return;
  }
  fixHp(c, z, TENTACLE_BASE_HP);
  z.combo = raging(head) ? 1 : 0;
  const lane = TENT_LANES[z.stage % TENT_COUNT];
  switch (z.state) {
    case ZS_KRAKEN_DIVE: {
      z.t--;
      if (z.t >= TENT_RISE_TICKS) return;
      // поднимается от корня к месту покоя (вынырнуло — всплеск)
      tentacleRoot(z.stage, _root);
      const u = 1 - z.t / TENT_RISE_TICKS;
      const e = 1 - (1 - u) * (1 - u);
      const wasUnder = z.y < WATER_Y;
      z.x = _root.x;
      z.y = TENT_DEEP_Y + (TENT_IDLE_Y - TENT_DEEP_Y) * e;
      z.z = _root.z + (TENT_IDLE_Z - _root.z) * e;
      if (wasUnder && z.y >= WATER_Y) c.host.event(['blast', ZS_KRAKEN_DIVE, r2(_root.x), r2(WATER_Y), r2(_root.z), 2]);
      if (z.t <= 0) z.state = ZS_TENT_IDLE;
      return;
    }
    case ZS_TENT_SLAM:
      stepSlam(c, z, lane);
      return;
    case ZS_TENT_REST:
      if (--z.t > 0) return;
      z.state = ZS_TENT_IDLE;
      return;
    default: {
      // покачивается над кромкой берега (на месте покоя — и после удара возвращается туда же)
      z.state = ZS_TENT_IDLE;
      const k = c.host.tick;
      const ix = lane + Math.sin(k * 0.021 + z.stage * 1.7) * 0.7;
      const iy = TENT_IDLE_Y + Math.sin(k * 0.033 + z.stage * 2.3) * 0.35;
      z.x += (ix - z.x) * 0.1;
      z.y += (iy - z.y) * 0.1;
      z.z += (TENT_IDLE_Z - z.z) * 0.1;
      faceFromRoot(z);
    }
  }
}

/** Приказ: метка на месте удара (не следует за человеком после начала замаха) */
function slam(c: BossCtx, z: Zombie): void {
  const { host } = c;
  const lane = TENT_LANES[z.stage % TENT_COUNT];
  // человек в зоне своей полосы: ближайший к полосе (при равенстве — с меньшим номером)
  let target: HordeTarget | null = null;
  let best = Infinity;
  for (const p of host.targets()) {
    const dx = Math.abs(p.x - lane);
    if (dx > TENT_ZONE_X || p.z < TENT_ZONE_Z0 || p.z > TENT_ZONE_Z1 || p.y < -0.5) continue;
    if (dx < best - 1e-9 || (Math.abs(dx - best) <= 1e-9 && target && p.id < target.id)) {
      best = dx;
      target = p;
    }
  }
  if (target) {
    z.toX = target.x;
    z.toZ = target.z;
    // метка — на опоре под ногами (на стене, террасе, причале, песке)
    z.toY = host.traceAttack(target.x, target.y + 0.6, target.z, target.x, target.y - 8, target.z, _hit) ? _hit.y : target.y;
  } else if (((z.attackIndex + z.stage) & 1) === 0) {
    // людей нет — по ходу морской стены напротив полосы
    z.toX = lane;
    z.toY = SEA_WALK_Y;
    z.toZ = SEA_WALK_Z;
  } else {
    // … или по берегу (причалу) у воды
    z.toX = lane;
    z.toZ = SHORE_HIT_Z;
    z.toY = host.traceAttack(lane, 6, SHORE_HIT_Z, lane, -3, SHORE_HIT_Z, _hit) ? _hit.y : 0;
  }
  z.toY += 0.06;
  z.attackIndex++;
  z.state = ZS_TENT_SLAM;
  z.t = TENT_WARN_TICKS;
  z.fromX = z.x;
  z.fromY = z.y;
  z.fromZ = z.z;
  host.event(['warn', z.id, ZS_TENT_SLAM, r2(z.toX), r2(z.toY), r2(z.toZ), TENT_SLAM_R, host.tick + z.t]);
}

/** Замах (булава взмывает и отходит назад), в конце — взмах дугой и удар по метке */
function stepSlam(c: BossCtx, z: Zombie, lane: number): void {
  z.t--;
  if (z.t >= TENT_SWING_TICKS) {
    const wx = lane + (z.toX - lane) * 0.25;
    z.x += (wx - z.x) * 0.07;
    z.y += (TENT_WIND_Y - z.y) * 0.07;
    z.z += (TENT_WIND_Z - z.z) * 0.07;
    faceFromRoot(z);
    if (z.t === TENT_SWING_TICKS) {
      z.fromX = z.x;
      z.fromY = z.y;
      z.fromZ = z.z;
    }
    return;
  }
  // взмах: дуга от верхней точки замаха к метке, с разгоном
  const u = 1 - z.t / TENT_SWING_TICKS;
  const e = u * u;
  const cx = (z.fromX + z.toX) * 0.5;
  const cy = Math.max(z.fromY, z.toY) + 3;
  const cz = z.fromZ * 0.6 + z.toZ * 0.4;
  const a = (1 - e) * (1 - e);
  const b = 2 * e * (1 - e);
  const d = e * e;
  z.x = a * z.fromX + b * cx + d * z.toX;
  z.y = a * z.fromY + b * cy + d * (z.toY - 0.06);
  z.z = a * z.fromZ + b * cz + d * z.toZ;
  faceFromRoot(z);
  if (z.t > 0) return;
  impact(c, z);
}

/** Удар: кто в круге на том же уровне и не за стеной — получает (в прыжке не спастись — уходи с метки); булава ложится */
function impact(c: BossCtx, z: Zombie): void {
  const { host } = c;
  const floor = z.toY - 0.06;
  for (const p of host.targets()) {
    if (Math.hypot(p.x - z.toX, p.z - z.toZ) >= TENT_SLAM_R) continue;
    if (p.y < floor - 0.8 || p.y > floor + 2.4) continue;
    if (host.traceAttack(z.toX, z.toY + 0.5, z.toZ, p.x, p.y + 0.8, p.z, _hit)) continue;
    host.hitPlayer(z.id, p.id, c.horde.dmgOf(z, TENT_DMG));
  }
  z.atk = (z.atk + 1) & 255;
  host.event(['blast', ZS_TENT_SLAM, r2(z.toX), r2(z.toY), r2(z.toZ), TENT_SLAM_R]);
  z.x = z.toX;
  z.y = floor;
  z.z = z.toZ;
  z.state = ZS_TENT_REST;
  z.t = z.combo > 0 ? TENT_REST_RAGE : TENT_REST_TICKS;
}

/** Курс булавы — от корня к ней (куда тянется рука) */
function faceFromRoot(z: Zombie): void {
  tentacleRoot(z.stage, _root);
  const dx = z.x - _root.x;
  const dz = z.z - _root.z;
  if (dx * dx + dz * dz > 0.01) z.yaw = Math.atan2(-dx, -dz);
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
