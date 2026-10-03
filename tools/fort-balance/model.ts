// Модель экономики «Крепости» (агент arsenal): доход, покупки и сила защитника по волнам против нагрузки директора
// волн. Награды, цены и эффекты — настоящие функции shared/fortarsenal.ts: поменяли цену или урон в игре — модель
// считает уже по-новому. Допущения о людях (меткость, головы, время у прицела, толпа, что покупают) — здесь, явно,
// в SKILLS. Директор волн — агента fort: подключается функцией Director (пример — currentDirector).
// Запуск: node tools/fort-balance/run.ts --help
import { TICK_RATE } from '../../shared/constants.ts';
import { waveCounts, waveSpawnTicks, zombieHp } from '../../shared/fort.ts';
import {
  BOAT_BOUNTY, CLEAN_MULT, CRIT_MUL, GREN_BUY, GREN_DMG, GREN_EDGE, GREN_PER_WAVE, GUNS, GUN_CROSSBOW, GUN_MARKER, GUN_MG, GUN_SHOTGUN,
  KILL_SHARE, START_GOLD, TAR_TICKS, TOWERS, TOWER_MAX_LEVEL, TOWER_SPOT_COUNT, TW_BALLISTA, TW_BRAZIER, TW_CANNON, TW_TAR, UPGRADES,
  UP_CRIT, UP_DMG, UP_LINES, UP_MAG, UP_POUCH, UP_RATE, critChance, dmgMul, grenadePrice, gunIntervalQ, gunMag, gunReload, killBounty, towerMul,
  towerUpgradePrice, upgradePrice, waveBonus,
} from '../../shared/fortarsenal.ts';

// ------------------------------------------------------------ директор волн (агент fort)

/** Кто выходит в волну — на всю команду */
export interface Spawn {
  kind: number;
  count: number;
  /** Сколько урона нужно, чтобы свалить одного (HP с бронёй и щитом) */
  hp: number;
  /** 0 — обычный, 1 — элита, 2 — чемпион */
  rank?: number;
  /** Экипаж лодки: половина своей награды */
  crew?: boolean;
}

export interface WaveSpec {
  spawns: readonly Spawn[];
  /** За сколько секунд волна выпускает всех */
  seconds: number;
  /** Лодок десанта: за каждую потопленную команде BOAT_BOUNTY */
  boats?: number;
}

/** Директор: волна W при n защитниках */
export type Director = (wave: number, defenders: number) => WaveSpec;

/** Нынешний директор из shared/fort.ts (8 волн, дальше повторяет последнюю) — пример подключения для fort */
export const currentDirector: Director = (wave, n) => ({
  spawns: waveCounts(wave, n)
    .map((count, kind) => ({ kind, count, hp: zombieHp(kind, n) }))
    .filter((s) => s.count > 0),
  seconds: waveSpawnTicks(Math.min(wave, 8)) / TICK_RATE,
});

// ------------------------------------------------------------ нагрузка L(W)

/** Нагрузка: HP волны на защитника за секунду её выхода */
export function loadOf(w: WaveSpec, defenders: number): number {
  let hp = 0;
  for (const s of w.spawns) hp += s.count * s.hp;
  return hp / Math.max(1, defenders) / Math.max(1, w.seconds);
}

/** HP волны на защитника */
export function hpOf(w: WaveSpec, defenders: number): number {
  let hp = 0;
  for (const s of w.spawns) hp += s.count * s.hp;
  return hp / Math.max(1, defenders);
}

/** Договор с fort: нагрузка в разах к 1-й волне на опорных волнах, допуск ±15 % */
export const LOAD_TARGET: readonly (readonly [number, number])[] = [
  [1, 1], [10, 10], [30, 55], [50, 160], [80, 400], [100, 590], [200, 1600], [300, 2400],
];
export const LOAD_TOLERANCE = 0.15;

/** Цель на любой волне: между опорными точками растёт в одно и то же число раз за волну (за 300-й — как перед ней) */
export function targetLoad(wave: number): number {
  const a = LOAD_TARGET;
  if (wave <= a[0][0]) return a[0][1];
  let i = 1;
  while (i < a.length - 1 && wave > a[i][0]) i++;
  const [w0, l0] = a[i - 1];
  const [w1, l1] = a[i];
  return l0 * (l1 / l0) ** ((wave - w0) / (w1 - w0));
}

export interface LoadCheck {
  wave: number;
  want: number;
  got: number;
  ok: boolean;
}

/** Сверка директора с целью на опорных волнах — в разах к его же 1-й волне */
export function checkLoad(director: Director, defenders: number, tolerance = LOAD_TOLERANCE): LoadCheck[] {
  const base = loadOf(director(1, defenders), defenders);
  return LOAD_TARGET.map(([wave, want]) => {
    const got = loadOf(director(wave, defenders), defenders) / base;
    return { wave, want, got, ok: Math.abs(got / want - 1) <= tolerance + 1e-9 };
  });
}

/** Абсолютная нагрузка 1-й волны на защитника, HP/с, у троих. Подобрана моделью (fitHpScale) под цели стен при
 * нынешних ценах; в игре сейчас ≈57 — то есть 1-я волна должна быть примерно в 2,4 раза легче. */
export const BASE_LOAD = 23.8;
/** Башен (8 точек), ворот и кристалла на каждого тем меньше, чем больше защитников: нагрузка на одного ∝ (3/n)^0,4 */
export const TEAM_EXP = 0.4;
export const baseLoad = (defenders: number): number => BASE_LOAD * (3 / Math.max(1, defenders)) ** TEAM_EXP;

/** Убитых на защитника за волну в эталоне: 14 на первой, до 70 (допущение этапа 1) */
export const targetKills = (wave: number): number => Math.min(70, 14 + 0.8 * (wave - 1));
/** Длина выхода волны в эталоне, с: как сейчас в начале, дальше около минуты */
export const targetSeconds = (wave: number): number => Math.min(60, 14 + 2 * wave);

/** Эталонный директор: только шаркуны по счёту targetKills, их HP — так, что нагрузка идёт ровно
 * baseLoad(n) × targetLoad(W). Для fort — образец; цели стен проверяются на нём. */
export const targetDirector: Director = (wave, n) => {
  const seconds = targetSeconds(wave);
  const count = Math.max(1, Math.round(targetKills(wave) * n));
  const hp = (targetLoad(wave) * baseLoad(n) * seconds * n) / count;
  return { spawns: [{ kind: 0, count, hp }], seconds };
};

/** Тот же директор, у всех врагов HP × k */
export function scaleHp(director: Director, k: number): Director {
  return (wave, n) => {
    const w = director(wave, n);
    return { ...w, spawns: w.spawns.map((s) => ({ ...s, hp: s.hp * k })) };
  };
}

/** Убитых на защитника «в шаркунах» по награде (элита, чемпион, экипаж — по их доле) */
export function killsOf(w: WaveSpec, wave: number, defenders: number): number {
  let sum = 0;
  for (const s of w.spawns) sum += s.count * killBounty(s.kind, wave, s.rank ?? 0, s.crew ?? false);
  return sum / killBounty(0, wave) / Math.max(1, defenders);
}

// ------------------------------------------------------------ доход

/** Ожидаемый доход защитника за отбитую волну: награды (стрелку и общак), бонус волны, лодки */
export function waveIncome(w: WaveSpec, wave: number, defenders: number, clean: number): number {
  let total = 0;
  for (const s of w.spawns) total += (s.count * killBounty(s.kind, wave, s.rank ?? 0, s.crew ?? false)) / KILL_SHARE;
  const pot = 1 - KILL_SHARE;
  const mul = KILL_SHARE + pot * (clean * CLEAN_MULT + (1 - clean));
  return (total * mul) / Math.max(1, defenders) + waveBonus(wave) + ((w.boats ?? 0) * BOAT_BOUNTY) / Math.max(1, defenders);
}

// ------------------------------------------------------------ люди

export interface Skill {
  name: string;
  /** Доля выстрелов в цель */
  accuracy: number;
  /** Доля попаданий в голову */
  heads: number;
  /** Доля волны у прицела: не бежит в лавку, не лежит, не чинит */
  uptime: number;
  /** Врагов под гранатой, ядром, в луже и в огне */
  crowd: number;
  /** Доля дохода на свою силу; остальное — ремонт, укрепление ворот, кристалл */
  spend: number;
  /** greedy — лучшее за золото; cheapest — что подешевле (так покупает новичок) */
  buyer: 'greedy' | 'cheapest';
  /** Какой тяжёлый ствол берёт и сколько времени он в руках */
  gun: number;
  gunShare: number;
  /** Какие башни строит на своих точках */
  towers: readonly number[];
  /** Гранат за волну: кидает все, что дали; покупает ли ещё пачку */
  buysGrenades: boolean;
  /** Вероятность чистой волны (общак ×1,5) */
  clean: number;
}

export const SKILLS = {
  newbie: {
    name: 'новичок', accuracy: 0.45, heads: 0.08, uptime: 0.7, crowd: 2, spend: 0.75, buyer: 'cheapest',
    gun: GUN_MG, gunShare: 0.5, towers: [TW_BALLISTA], buysGrenades: false, clean: 0.3,
  },
  experienced: {
    name: 'опытный', accuracy: 0.6, heads: 0.22, uptime: 0.8, crowd: 3, spend: 0.85, buyer: 'greedy',
    gun: GUN_SHOTGUN, gunShare: 0.55, towers: [TW_BALLISTA, TW_CANNON], buysGrenades: false, clean: 0.6,
  },
  master: {
    name: 'мастер', accuracy: 0.72, heads: 0.4, uptime: 0.88, crowd: 4, spend: 0.9, buyer: 'greedy',
    gun: GUN_CROSSBOW, gunShare: 0.6, towers: [TW_BALLISTA, TW_CANNON, TW_TAR, TW_BRAZIER], buysGrenades: true, clean: 0.85,
  },
} as const satisfies Record<string, Skill>;

// ------------------------------------------------------------ сила защитника

/** Последний враг волны доходит до ворот за столько секунд после выхода */
export const APPROACH = 12;
/** Ворота с ремонтом держат хвост, который не успели добить: окно ×1,25 */
export const GATE_SLACK = 1.25;
/** Башня занята целью такую долю волны */
const TOWER_BUSY = 0.8;
/** Жаровня бьёт только у стены: враги в её 8 м такую долю волны */
const BRAZIER_NEAR = 0.6;
/** Лужа смолы замедляет — вся команда бьёт дольше по тем же: +6 % за котёл */
const TAR_TEAM = 0.06;

/** Точка башни в модели: тип (−1 — пусто), уровень, доля защитника (8 точек на n человек: у троих по 2⅔) */
export interface Slot {
  type: number;
  level: number;
  share: number;
}

/** Состояние защитника в модели */
export interface Kit {
  lv: number[];
  /** Тяжёлый ствол или −1 */
  gun: number;
  slots: Slot[];
}

export function makeKit(defenders: number): Kit {
  const share = TOWER_SPOT_COUNT / Math.max(1, defenders);
  const slots: Slot[] = [];
  for (let left = share; left > 0.01; left -= 1) slots.push({ type: -1, level: 0, share: Math.min(1, left) });
  return { lv: new Array<number>(UP_LINES).fill(0), gun: -1, slots };
}

/** Урон в секунду ствола по одной цели с перезарядкой, до меткости (настоящие темп, магазин, крит) */
export function sustainedDps(gun: number, lv: readonly number[]): number {
  const g = GUNS[gun];
  const shot = g.body * g.pellets * dmgMul(lv[UP_DMG]) * (1 + critChance(lv[UP_CRIT]) * (CRIT_MUL - 1));
  const mag = gunMag(gun, lv[UP_MAG]);
  const interval = gunIntervalQ(gun, lv[UP_RATE]) / 4 / TICK_RATE;
  const reload = gunReload(gun, lv[UP_RATE]) / TICK_RATE;
  return (shot * mag) / (mag * interval + reload);
}

/** Ствол в деле: головы, толпа, разброс (допущения модели) */
export function gunContext(gun: number, s: Skill): number {
  const g = GUNS[gun];
  const head = 1 + s.heads * (g.head / g.body - 1);
  if (gun === GUN_SHOTGUN) return head * 0.85 * (1 + 0.3 * (s.crowd - 1));
  if (gun === GUN_CROSSBOW) return head * (1 + 0.5 * g.pierceKeep * (Math.min(s.crowd, g.pierce) - 1));
  if (gun === GUN_MG) return head * 0.8;
  return head;
}

export interface Power {
  player: number;
  towers: number;
  grenades: number;
  total: number;
}

/** Урон защитника в секунду (свой, его башен, его гранат) на волне длиной window секунд */
export function powerOf(k: Kit, s: Skill, window: number): Power {
  const marker = sustainedDps(GUN_MARKER, k.lv) * gunContext(GUN_MARKER, s);
  const heavy = k.gun >= 0 ? sustainedDps(k.gun, k.lv) * gunContext(k.gun, s) : marker;
  const share = k.gun >= 0 ? s.gunShare : 0;
  let tars = 0;
  for (const t of k.slots) if (t.type === TW_TAR && t.level > 0) tars++;
  const player = (marker * (1 - share) + heavy * share) * s.accuracy * s.uptime * (1 + TAR_TEAM * Math.min(2, tars));
  const team = dmgMul(k.lv[UP_DMG]);
  let towers = 0;
  for (const t of k.slots) if (t.type >= 0) towers += towerDps(t.type, t.level, team, s) * t.share;
  const thrown = GREN_PER_WAVE + (s.buysGrenades ? GREN_BUY : 0);
  const grenades = (thrown * ((GREN_DMG + GREN_EDGE) / 2) * dmgMul(k.lv[UP_DMG]) * s.crowd) / window;
  return { player, towers, grenades, total: player + towers + grenades };
}

/** Урон башни в секунду по настоящим TOWERS и towerMul (толпа — из допущений) */
export function towerDps(type: number, level: number, teamDmgMul: number, s: Skill): number {
  if (level <= 0) return 0;
  const t = TOWERS[type];
  const m = towerMul(level, teamDmgMul) * TOWER_BUSY;
  const rate = TICK_RATE / t.every;
  if (type === TW_BALLISTA) return t.dmg * rate * m;
  if (type === TW_CANNON) return t.dmg * 0.8 * s.crowd * rate * m;
  if (type === TW_TAR) return t.dmg * s.crowd * (TAR_TICKS / t.every) * m;
  if (type === TW_BRAZIER) return t.dmg * s.crowd * 1.5 * BRAZIER_NEAR * m;
  return 0;
}

// ------------------------------------------------------------ покупки

interface Offer {
  price: number;
  apply: (k: Kit) => void;
}

function offers(k: Kit, s: Skill): Offer[] {
  const out: Offer[] = [];
  for (let line = 0; line < UP_LINES; line++) {
    if (k.lv[line] >= UPGRADES[line].max) continue;
    // подсумок в модели силы не даёт урона: берёт только тот, кто покупает как попало
    if (line === UP_POUCH && s.buyer !== 'cheapest') continue;
    out.push({ price: upgradePrice(line, k.lv[line]), apply: (x) => x.lv[line]++ });
  }
  if (k.gun < 0) out.push({ price: GUNS[s.gun].price, apply: (x) => (x.gun = s.gun) });
  k.slots.forEach((t, i) => {
    // общую точку строят вскладчину: платит свою долю
    if (t.type < 0) {
      for (const type of s.towers) out.push({ price: Math.round(TOWERS[type].price * t.share), apply: (x) => ((x.slots[i].type = type), (x.slots[i].level = 1)) });
    } else if (t.level < TOWER_MAX_LEVEL) {
      out.push({ price: Math.round(towerUpgradePrice(t.type, t.level) * t.share), apply: (x) => x.slots[i].level++ });
    }
  });
  return out;
}

function cloneKit(k: Kit): Kit {
  return { lv: k.lv.slice(), gun: k.gun, slots: k.slots.map((t) => ({ ...t })) };
}

/** Покупает, пока хватает: жадный — по приросту урона за монету, новичок — что дешевле. Возвращает число покупок. */
export function shop(k: Kit, s: Skill, gold: { v: number }, window: number): number {
  let n = 0;
  for (;;) {
    const list = offers(k, s).filter((o) => o.price <= gold.v);
    if (!list.length) return n;
    let best = list[0];
    if (s.buyer === 'cheapest') {
      for (const o of list) if (o.price < best.price) best = o;
    } else {
      const now = powerOf(k, s, window).total;
      let br = -1;
      for (const o of list) {
        const x = cloneKit(k);
        o.apply(x);
        const r = (powerOf(x, s, window).total - now) / o.price;
        if (r > br) {
          br = r;
          best = o;
        }
      }
      if (br <= 0) return n;
    }
    gold.v -= best.price;
    best.apply(k);
    n++;
  }
}

// ------------------------------------------------------------ забег

export interface WaveRow {
  wave: number;
  /** «+N» стрелку за шаркуна */
  popup: number;
  income: number;
  /** Заработано за игру всего, со стартовым золотом */
  earned: number;
  /** Золото после покупок перед волной */
  gold: number;
  /** Урон защитника в секунду: свой, башни, гранаты */
  power: Power;
  /** Запас: больше 1 — волну держит, меньше — ворота падают */
  margin: number;
  buys: number;
  lv: number[];
  gun: number;
  slots: Slot[];
}

export interface RunResult {
  rows: WaveRow[];
  /** Первая волна, которую не удержать (waves + 1 — дошли до конца) */
  wall: number;
}

/** Забег одного защитника из n одинаковых: перед волной покупает, на волне сравнивает силу с HP волны */
export function simulate(director: Director, defenders: number, skill: Skill, waves = 300): RunResult {
  const kit = makeKit(defenders);
  const gold = { v: START_GOLD };
  let earned = START_GOLD;
  let wall = waves + 1;
  const rows: WaveRow[] = [];
  for (let wave = 1; wave <= waves; wave++) {
    const w = director(wave, defenders);
    const window = w.seconds + APPROACH;
    if (skill.buysGrenades) gold.v -= Math.min(gold.v, grenadePrice(wave));
    const buys = shop(kit, skill, gold, window);
    const power = powerOf(kit, skill, window);
    const margin = (power.total * window * GATE_SLACK) / Math.max(1, hpOf(w, defenders));
    if (margin < 1 && wall > waves) wall = wave;
    const income = waveIncome(w, wave, defenders, skill.clean);
    earned += income;
    gold.v += income * skill.spend;
    rows.push({ wave, popup: killBounty(0, wave), income, earned, gold: gold.v, power, margin, buys, lv: kit.lv.slice(), gun: kit.gun, slots: kit.slots.map((t) => ({ ...t })) });
  }
  return { rows, wall };
}

/** Стартовый капитал для старта с волны W (контрольные точки, если появятся): сколько к ней заработал опытный */
export function startCapital(wave: number, director: Director = targetDirector, defenders = 3, skill: Skill = SKILLS.experienced): number {
  let gold = START_GOLD;
  for (let w = 1; w < wave; w++) gold += waveIncome(director(w, defenders), w, defenders, skill.clean);
  return Math.round(gold);
}

// ------------------------------------------------------------ цели стен

/** Где упирается каждый: [с какой волны, по какую]; 301 — прошёл все 300 */
export const TARGET_WALLS = {
  newbie: [25, 40],
  experienced: [60, 100],
  master: [250, 301],
} as const satisfies Record<keyof typeof SKILLS, readonly [number, number]>;

export interface ScaleFit {
  /** HP всех врагов × k (k в (lo, hi]) — тогда все стены в целях; lo ≥ hi — такого k нет */
  lo: number;
  hi: number;
  /** Для каждого: в каком k его стена в цели */
  each: Record<keyof typeof SKILLS, { lo: number; hi: number; wall: number }>;
}

/** Каким множителем HP директора уложить стены в цели. Запас считается как урон / HP, доход и сила от HP не
 * зависят — значит, при HP × k стена там, где запас впервые меньше k. */
export function fitHpScale(director: Director, defenders: number, waves = 300): ScaleFit {
  let lo = 0;
  let hi = Infinity;
  const each = {} as ScaleFit['each'];
  for (const key of Object.keys(SKILLS) as (keyof typeof SKILLS)[]) {
    const run = simulate(director, defenders, SKILLS[key], waves);
    const m = run.rows.map((r) => r.margin);
    const [a, b] = TARGET_WALLS[key];
    const kHi = Math.min(...m.slice(0, a - 1));
    const kLo = b > waves ? Math.min(...m) : Math.min(...m.slice(0, b));
    // за 300-ю никто не играет: «прошёл все» — любой k не выше худшего запаса
    each[key] = { lo: b > waves ? 0 : kLo, hi: kHi, wall: run.wall };
    lo = Math.max(lo, each[key].lo);
    hi = Math.min(hi, kHi);
  }
  return { lo, hi, each };
}
