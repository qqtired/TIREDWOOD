// Арсенал «Крепости» (агент arsenal): золото матча 💰, награды за врагов, личная прокачка, стволы, гранаты, башни на
// стенах, ворота и кристалл. Общее для сервера и клиента: цены и эффекты считают одни и те же функции — сервер решает,
// клиент рисует лавку и подсказки. Шаг стволов и лестниц для предсказания — fortgun.ts / fortladder.ts.
import { TICK_RATE } from './constants.ts';
import { CRYSTAL_HP, GATE_HP, KF_AIR, KF_ARMORED, KF_BOSS, KF_SEA, KF_SUPER, ZK, Z_BOSS } from './fort.ts';

// ------------------------------------------------------------ золото

/** С этим золотом начинается каждая игра (хватает на первую ступень урона ещё в сборе) */
export const START_GOLD = 150;
/** Доля награды стрелку (всплывает «+N»); остальное — в общак волны, делится поровну в конце */
export const KILL_SHARE = 0.6;
/** Чистая волна (никого не повалили, ворота стоят): общак ×1,5 */
export const CLEAN_MULT = 1.5;
/** Опоздавший получает такую долю от среднего «заработано» команды */
export const LATE_SHARE = 0.75;
/** Затонувшая лодка десанта (агент fort) — команде, поровну */
export const BOAT_BOUNTY = 150;
export const SUPERBOSS_BOUNTY = 1500;
export const ELITE_MUL = 2;
export const CHAMPION_MUL = 5;
/** Экипаж лодки — половина своей награды */
export const CREW_MUL = 0.5;

/** Бонус волны каждому, кто её отбивал */
export function waveBonus(wave: number): number {
  return 20 + 5 * Math.max(1, wave);
}

/** Рост награды с номером волны: ×(1 + 0,05·(W−1)). От HP врагов не зависит — HP двигает агент fort. */
export function bountyMul(wave: number): number {
  return 1 + 0.05 * (Math.max(1, wave) - 1);
}

/** Доля стрелка за врага 1-й волны: шаркун, шустрик, бугай, липучка, пузырь, крылатка, босс; новым — HP/5 */
const BASE_BOUNTY = [12, 6, 100, 10, 8, 14, 500];

/** Флаги типа врага от агента fort (air / sea / boss / armored / superBoss); пока их нет — по известным типам */
export interface KindFlags {
  air: boolean;
  sea: boolean;
  boss: boolean;
  armored: boolean;
  superBoss: boolean;
}

export function kindFlags(kind: number): KindFlags {
  // признаки типа — из таблицы агента fort (ZK[kind].flags, KF_*); супер-босс — сам Кракен, щупальца — его части
  const f = (ZK[kind] ?? ZK[0]).flags;
  return {
    air: (f & KF_AIR) !== 0,
    sea: (f & KF_SEA) !== 0,
    boss: (f & KF_BOSS) !== 0,
    armored: (f & KF_ARMORED) !== 0,
    superBoss: (f & KF_SUPER) !== 0 && (f & KF_BOSS) !== 0,
  };
}

/** База награды стрелку за тип (до роста по волнам): боссы — как Барон, части супер-босса (щупальца) — без награды */
export function baseBounty(kind: number): number {
  const f = kindFlags(kind);
  if (f.superBoss) return SUPERBOSS_BOUNTY;
  if (f.boss) return BASE_BOUNTY[Z_BOSS];
  if (((ZK[kind] ?? ZK[0]).flags & KF_SUPER) !== 0) return 0;
  return BASE_BOUNTY[kind] ?? Math.max(1, Math.round((ZK[kind]?.hp ?? 60) / 5));
}

/** Ранг врага от агента fort: 0 — обычный, 1 — элита (×2), 2 — чемпион (×5) */
export function rankMul(rank: number): number {
  return rank >= 2 ? CHAMPION_MUL : rank === 1 ? ELITE_MUL : 1;
}

/** «+N» стрелку за врага на волне W (вся награда — N / KILL_SHARE: остальное уходит в общак) */
export function killBounty(kind: number, wave: number, rank = 0, crew = false): number {
  return Math.max(1, Math.round(baseBounty(kind) * rankMul(rank) * (crew ? CREW_MUL : 1) * bountyMul(wave)));
}

// ------------------------------------------------------------ личная прокачка

export const UP_DMG = 0;
export const UP_RATE = 1;
export const UP_MAG = 2;
export const UP_CRIT = 3;
export const UP_POUCH = 4;
export const UP_LINES = 5;

export interface UpgradeLine {
  key: string;
  name: string;
  base: number;
  /** Цена ступени t = base × growth^t */
  growth: number;
  max: number;
}

export const UPGRADES: readonly UpgradeLine[] = [
  { key: 'dmg', name: 'Урон', base: 150, growth: 1.6, max: 60 },
  { key: 'rate', name: 'Темп', base: 200, growth: 1.6, max: 8 },
  { key: 'mag', name: 'Магазин', base: 150, growth: 1.6, max: 6 },
  { key: 'crit', name: 'Крит', base: 250, growth: 1.6, max: 8 },
  { key: 'pouch', name: 'Подсумок', base: 250, growth: 1.6, max: 3 },
];

/** Цена, округлённая «по-человечески»: 150, 240, 380, 610, 980, 1 570, 2 500… */
export function nicePrice(v: number): number {
  const step = v < 100 ? 5 : v < 1000 ? 10 : v < 10000 ? 50 : v < 100000 ? 500 : 5000;
  return Math.max(step, Math.round(v / step) * step);
}

/** Цена следующей ступени (сейчас ступень tier) */
export function upgradePrice(line: number, tier: number): number {
  const u = UPGRADES[line];
  return nicePrice(u.base * u.growth ** tier);
}

export const CRIT_MUL = 2.5;
export const dmgMul = (tier: number): number => 1.2 ** tier;
export const rateMul = (tier: number): number => 1.1 ** tier;
export const reloadMul = (tier: number): number => 0.9 ** tier;
export const magMul = (tier: number): number => 1 + 0.25 * tier;
export const critChance = (tier: number): number => 0.05 * tier;
export const grenadeMax = (pouch: number): number => GREN_MAX + pouch;

// ------------------------------------------------------------ стволы

export const GUN_MARKER = 0;
export const GUN_SHOTGUN = 1;
export const GUN_CROSSBOW = 2;
export const GUN_MG = 3;
export const GUN_COUNT = 4;

export interface GunSpec {
  name: string;
  icon: string;
  price: number;
  /** Между выстрелами, тиков (дробно — темп копится в четвертях тика) */
  interval: number;
  mag: number;
  /** Перезарядка, тиков */
  reload: number;
  body: number;
  head: number;
  /** Урон полный до start м, к end м — доля min */
  falloff: readonly [number, number, number];
  pellets: number;
  /** Конус дроби, рад */
  cone: number;
  spreadHip: number;
  spreadAds: number;
  moveHip: number;
  moveAds: number;
  airHip: number;
  airAds: number;
  bloom: number;
  bloomMax: number;
  kick: number;
  kickYaw: number;
  /** Сколько целей прошивает (1 — первую) и сколько урона остаётся после каждой */
  pierce: number;
  pierceKeep: number;
  /** Толчок мелочи (м/с), если в неё попало хотя бы 3 дробины / болт */
  knock: number;
  /** Во сколько раз приближает прицел */
  zoom: number;
  role: string;
}

export const GUNS: readonly GunSpec[] = [
  {
    name: 'Маркер', icon: '🔫', price: 0, interval: 6, mag: 30, reload: 84, body: 20, head: 34, falloff: [24, 55, 0.65], pellets: 1, cone: 0,
    spreadHip: 0.0095, spreadAds: 0.0018, moveHip: 0.02, moveAds: 0.007, airHip: 0.032, airAds: 0.016, bloom: 0.0042, bloomMax: 0.026,
    kick: 0.0105, kickYaw: 0.0042, pierce: 1, pierceKeep: 1, knock: 0, zoom: 1.25, role: 'на всё',
  },
  {
    name: 'Дробовик', icon: '💥', price: 500, interval: 46, mag: 8, reload: 120, body: 15, head: 22, falloff: [8, 20, 0.25], pellets: 8, cone: 0.075,
    spreadHip: 0.01, spreadAds: 0.006, moveHip: 0.012, moveAds: 0.008, airHip: 0.02, airAds: 0.012, bloom: 0, bloomMax: 0,
    kick: 0.05, kickYaw: 0.012, pierce: 1, pierceKeep: 1, knock: 7, zoom: 1.15, role: 'толпа у ворот',
  },
  {
    name: 'Арбалет', icon: '🏹', price: 650, interval: 50, mag: 6, reload: 120, body: 120, head: 300, falloff: [999, 1000, 1], pellets: 1, cone: 0,
    spreadHip: 0.012, spreadAds: 0, moveHip: 0.02, moveAds: 0.004, airHip: 0.03, airAds: 0.012, bloom: 0, bloomMax: 0,
    kick: 0.05, kickYaw: 0.006, pierce: 3, pierceKeep: 0.75, knock: 3, zoom: 2.2, role: 'бугаи, головы, ядро босса',
  },
  {
    name: 'Пулемёт', icon: '⚙️', price: 800, interval: 3.75, mag: 100, reload: 192, body: 14, head: 22, falloff: [20, 50, 0.6], pellets: 1, cone: 0,
    spreadHip: 0.022, spreadAds: 0.009, moveHip: 0.02, moveAds: 0.01, airHip: 0.03, airAds: 0.02, bloom: 0.0035, bloomMax: 0.03,
    kick: 0.006, kickYaw: 0.005, pierce: 1, pierceKeep: 1, knock: 0, zoom: 1.2, role: 'поток, налёт',
  },
];

/** Смена ствола: 0,35 с (в четвертях тика — как fireCd) */
export const DRAW_Q = 84;

/** Урон ствола на расстоянии (до прокачки) */
export function gunDamage(gun: number, dist: number, head: boolean): number {
  const g = GUNS[gun] ?? GUNS[0];
  const base = head ? g.head : g.body;
  const [a, b, min] = g.falloff;
  if (dist <= a) return base;
  if (dist >= b) return base * min;
  return base * (1 - (1 - min) * (dist - a) / (b - a));
}

/** Сколько патронов в магазине ствола при ступени «Магазина» */
export function gunMag(gun: number, magTier: number): number {
  return Math.max(1, Math.round((GUNS[gun] ?? GUNS[0]).mag * magMul(magTier)));
}

/** Между выстрелами, в четвертях тика (не меньше 1 тика) */
export function gunIntervalQ(gun: number, rateTier: number): number {
  return Math.max(4, Math.round(((GUNS[gun] ?? GUNS[0]).interval * 4) / rateMul(rateTier)));
}

export function gunReload(gun: number, rateTier: number): number {
  return Math.max(12, Math.round((GUNS[gun] ?? GUNS[0]).reload * reloadMul(rateTier)));
}

// ------------------------------------------------------------ гранаты

export const GREN_START = 2;
export const GREN_MAX = 3;
export const GREN_PER_WAVE = 1;
export const GREN_BUY = 2;
export const GREN_FUSE = 84;
export const GREN_CD = 48;
export const GREN_R = 4;
export const GREN_DMG = 140;
export const GREN_EDGE = 70;
export const GREN_SPEED = 15;
/** Бросок чуть выше прицела */
export const GREN_LOFT = 0.2;
export const GREN_GRAVITY = 20;
export const GREN_BOUNCE = 0.42;
export const GREN_KNOCK = 14;

export function grenadePrice(wave: number): number {
  return 60 + 3 * Math.max(1, wave);
}

// ------------------------------------------------------------ башни на стенах

export const TW_BALLISTA = 0;
export const TW_CANNON = 1;
export const TW_TAR = 2;
export const TW_BRAZIER = 3;
export const TW_TYPES = 4;
export const TOWER_MAX_LEVEL = 10;

export interface TowerSpec {
  name: string;
  icon: string;
  price: number;
  /** Между выстрелами, тиков */
  every: number;
  dmg: number;
  range: number;
  minRange: number;
  /** Пушка — радиус взрыва; котёл — радиус лужи; жаровня — дальность углей */
  radius: number;
  role: string;
}

export const TOWERS: readonly TowerSpec[] = [
  { name: 'Баллиста', icon: '🎯', price: 300, every: 46, dmg: 45, range: 32, minRange: 0, radius: 0, role: 'одна цель · сначала крылатые' },
  { name: 'Пушка', icon: '💣', price: 400, every: 132, dmg: 70, range: 34, minRange: 10, radius: 3, role: 'ядро по площади, отброс' },
  { name: 'Смоляной котёл', icon: '🛢️', price: 300, every: 420, dmg: 10, range: 0, minRange: 0, radius: 4, role: 'лужа смолы: −55 % скорости' },
  { name: 'Жаровня', icon: '🔥', price: 350, every: 72, dmg: 18, range: 8, minRange: 0, radius: 8, role: 'угли: поджог вблизи' },
];

/** Смола: сколько лежит, во сколько раз медленнее; огонь: сколько горит */
export const TAR_TICKS = 5 * TICK_RATE;
export const TAR_SLOW = 0.45;
export const BURN_TICKS = 4 * TICK_RATE;
/** Урон от горения и смолы — раз в столько тиков (реже событий) */
export const DOT_EVERY = 30;
/** Ядро летит со скоростью, м/с */
export const CANNON_SPEED = 22;

/** Цена улучшения башни с уровня level до level + 1 */
export function towerUpgradePrice(type: number, level: number): number {
  return nicePrice(TOWERS[type].price * 1.6 ** level);
}

/** Множитель урона башни: уровень и (корнем) средний «Урон» команды */
export function towerMul(level: number, teamDmgMul: number): number {
  return 1.3 ** Math.max(0, level - 1) * Math.sqrt(Math.max(1, teamDmgMul));
}

// ------------------------------------------------------------ ворота и кристалл

export const GATE_TIERS = 8;
export const CRYSTAL_TIERS = 5;

export function gateMax(tier: number): number {
  return Math.round(GATE_HP * (1 + 0.25 * tier));
}

export function crystalMax(tier: number): number {
  return Math.round(CRYSTAL_HP * (1 + 0.2 * tier));
}

export const repairPrice = (wave: number): number => 40 + 4 * Math.max(1, wave);
export const newGatePrice = (wave: number): number => 120 + 8 * Math.max(1, wave);
export const crystalHealPrice = (wave: number): number => 60 + 6 * Math.max(1, wave);
export const gateTierPrice = (tier: number): number => nicePrice(200 * 1.6 ** tier);
export const crystalTierPrice = (tier: number): number => nicePrice(250 * 1.6 ** tier);

// ------------------------------------------------------------ действия (id в сообщении 'use')

/** Прилавок: строки 1–9 */
export const ACT_SHOP = 2000;
/** Ворота: 0 ремонт, 1 укрепить, 2 новые */
export const ACT_GATE = 2100;
/** Кристалл: 0 подлечить, 1 укрепить */
export const ACT_CRYSTAL = 2200;
/** Башня: 2300 + точка·10 + тип (0–3 — построить), 9 — улучшить */
export const ACT_TOWER = 2300;
export const TOWER_UPGRADE = 9;

export const SHOP_ROWS = 9;
export const ROW_GRENADES = 4;
export const ROW_POUCH = 5;
/** Строки 7–9 — тяжёлые стволы */
export const ROW_GUN0 = 6;

// ------------------------------------------------------------ состояние игрока (в составе 'froster')

export interface ArsenalRow {
  /** Золото */
  g: number;
  /** Ступени: урон, темп, магазин, крит, подсумок */
  lv: number[];
  /** Купленные тяжёлые стволы: бит на номер ствола */
  gn: number;
  /** Какой тяжёлый ствол во втором слоте (0 — никакого) */
  hv: number;
  /** Гранат в запасе */
  gr: number;
}

export function makeArsenalRow(): ArsenalRow {
  return { g: 0, lv: [0, 0, 0, 0, 0], gn: 0, hv: 0, gr: 0 };
}

/** Что нужно предсказанию стволов */
export interface Loadout {
  heavy: number;
  rate: number;
  mag: number;
}

export function loadoutOf(row: ArsenalRow | undefined, out: Loadout): Loadout {
  out.heavy = row?.hv ?? 0;
  out.rate = row?.lv[UP_RATE] ?? 0;
  out.mag = row?.lv[UP_MAG] ?? 0;
  return out;
}

// ------------------------------------------------------------ строки панелей (лавка, ворота, кристалл, башня)

export interface PanelRow {
  id: number;
  key: string;
  icon: string;
  name: string;
  /** Что даёт (короткая строка) */
  detail: string;
  /** Ступень сейчас и предел (−1 — без ступеней) */
  tier: number;
  max: number;
  price: number;
  /** Пусто — можно купить; иначе почему нельзя (МАКС, «ещё 120», «в руках»…) */
  reason: string;
  /** Купить нельзя совсем (не из-за денег) */
  locked: boolean;
  /** Подпись на кнопке вместо цены («Взять», «В руках») */
  tag?: string;
}

export interface ShopView {
  wave: number;
  calm: boolean;
  row: ArsenalRow;
}

const fmt = (v: number): string => (Math.round(v * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

function money(r: Omit<PanelRow, 'reason'> & { reason?: string }, gold: number): PanelRow {
  const reason = r.reason ?? (r.price > gold ? `ещё ${r.price - gold}` : '');
  return { ...r, reason };
}

/** Прилавок: 9 строк под клавиши 1–9 */
export function shopRows(v: ShopView): PanelRow[] {
  const { row } = v;
  const gold = row.g;
  const rows: PanelRow[] = [];
  const line = (i: number, detail: string): void => {
    const t = row.lv[i] ?? 0;
    const u = UPGRADES[i];
    const max = t >= u.max;
    rows.push(money({ id: ACT_SHOP + rows.length, key: u.key, icon: u.key, name: u.name, detail, tier: t, max: u.max, price: max ? 0 : upgradePrice(i, t),
      locked: max, reason: max ? 'МАКС' : undefined }, gold));
  };
  const d = row.lv[UP_DMG] ?? 0;
  line(UP_DMG, `+20 % урона: ×${fmt(dmgMul(d))} → ×${fmt(dmgMul(d + 1))}`);
  const r = row.lv[UP_RATE] ?? 0;
  line(UP_RATE, `+10 % темпа, −10 % перезарядки: ×${fmt(rateMul(r))} → ×${fmt(rateMul(r + 1))}`);
  const m = row.lv[UP_MAG] ?? 0;
  line(UP_MAG, `+25 % патронов: маркер ${gunMag(GUN_MARKER, m)} → ${gunMag(GUN_MARKER, m + 1)}`);
  const c = row.lv[UP_CRIT] ?? 0;
  line(UP_CRIT, `+5 % шанс урона ×2,5: ${Math.round(critChance(c) * 100)} % → ${Math.round(critChance(c + 1) * 100)} %`);
  const pouch = row.lv[UP_POUCH] ?? 0;
  const gmax = grenadeMax(pouch);
  const full = row.gr >= gmax;
  rows.push(money({ id: ACT_SHOP + ROW_GRENADES, key: 'gren', icon: 'gren', name: `Гранаты +${GREN_BUY}`, detail: `в запасе ${row.gr} из ${gmax} · G — бросок`,
    tier: -1, max: 0, price: grenadePrice(v.wave), locked: full, reason: full ? 'полный запас' : undefined }, gold));
  line(UP_POUCH, `+1 к запасу гранат: ${gmax} → ${gmax + 1}`);
  for (let gun = GUN_SHOTGUN; gun < GUN_COUNT; gun++) {
    const g = GUNS[gun];
    const owned = (row.gn & (1 << gun)) !== 0;
    const held = row.hv === gun;
    rows.push(money({ id: ACT_SHOP + ROW_GUN0 + gun - 1, key: `gun${gun}`, icon: ['', 'shotgun', 'crossbow', 'mg'][gun], name: g.name,
      detail: `${g.role} · ${g.pellets > 1 ? `${g.pellets}×${g.body}` : `${g.body}/${g.head}`} · магазин ${gunMag(gun, m)}`,
      tier: -1, max: 0, price: owned ? 0 : g.price, locked: held, reason: held ? 'в руках · 2' : undefined, tag: held ? 'В руках' : owned ? 'Взять' : undefined }, gold));
  }
  return rows;
}

export interface TeamView {
  wave: number;
  calm: boolean;
  gold: number;
  gate: number;
  gateTier: number;
  crystal: number;
  crystalTier: number;
}

export function gateRows(v: TeamView): PanelRow[] {
  const max = gateMax(v.gateTier);
  const down = v.gate <= 0;
  const top = v.gateTier >= GATE_TIERS;
  return [
    money({ id: ACT_GATE, key: 'repair', icon: 'gate', name: 'Ремонт ворот', detail: `+25 % прочности · сейчас ${Math.round((v.gate / max) * 100)} %`, tier: -1, max: 0,
      price: repairPrice(v.wave), locked: down || v.gate >= max, reason: down ? 'нужны новые ворота' : v.gate >= max ? 'ворота целы' : undefined }, v.gold),
    money({ id: ACT_GATE + 1, key: 'gatetier', icon: 'gate', name: 'Укрепить ворота', detail: `+25 % прочности навсегда: ${max} → ${gateMax(v.gateTier + 1)}`,
      tier: v.gateTier, max: GATE_TIERS, price: top ? 0 : gateTierPrice(v.gateTier), locked: top || down, reason: top ? 'МАКС' : down ? 'сначала новые ворота' : undefined }, v.gold),
    money({ id: ACT_GATE + 2, key: 'newgate', icon: 'gate', name: 'Новые ворота', detail: `полная прочность ${max}`, tier: -1, max: 0, price: newGatePrice(v.wave),
      locked: !down || !v.calm, reason: !down ? 'ворота стоят' : !v.calm ? 'ставят в передышку' : undefined }, v.gold),
  ];
}

export function crystalRows(v: TeamView): PanelRow[] {
  const max = crystalMax(v.crystalTier);
  const top = v.crystalTier >= CRYSTAL_TIERS;
  return [
    money({ id: ACT_CRYSTAL, key: 'heal', icon: 'crystal', name: 'Подлечить кристалл', detail: `+10 % прочности · сейчас ${Math.round((v.crystal / max) * 100)} %`, tier: -1, max: 0,
      price: crystalHealPrice(v.wave), locked: v.crystal >= max, reason: v.crystal >= max ? 'кристалл цел' : undefined }, v.gold),
    money({ id: ACT_CRYSTAL + 1, key: 'crystier', icon: 'crystal', name: 'Укрепить кристалл', detail: `+20 % прочности навсегда: ${max} → ${crystalMax(v.crystalTier + 1)}`,
      tier: v.crystalTier, max: CRYSTAL_TIERS, price: top ? 0 : crystalTierPrice(v.crystalTier), locked: top, reason: top ? 'МАКС' : undefined }, v.gold),
  ];
}

/** Точка башни: пустая — выбор типа (1–4); построена — улучшение (1) */
export function towerRows(spot: number, type: number, level: number, gold: number, teamDmgMul: number): PanelRow[] {
  const icons = ['ballista', 'cannon', 'tar', 'brazier'];
  if (type < 0) {
    return TOWERS.map((t, i) => money({ id: ACT_TOWER + spot * 10 + i, key: `tw${i}`, icon: icons[i], name: t.name, detail: t.role, tier: -1, max: 0, price: t.price, locked: false }, gold));
  }
  const t = TOWERS[type];
  const top = level >= TOWER_MAX_LEVEL;
  const now = towerMul(level, teamDmgMul);
  const next = towerMul(level + 1, teamDmgMul);
  return [money({ id: ACT_TOWER + spot * 10 + TOWER_UPGRADE, key: `tw${type}`, icon: icons[type], name: `${t.name} → ур. ${level + 1}`,
    detail: `${t.role} · сила ×${fmt(now)} → ×${fmt(next)}`, tier: level, max: TOWER_MAX_LEVEL, price: top ? 0 : towerUpgradePrice(type, level), locked: top, reason: top ? 'МАКС' : undefined }, gold)];
}

// ------------------------------------------------------------ хвост снимка: блок арсенала (после списка зомби)

export const TOWER_SPOT_COUNT = 8;
/** Метка блока, тип+уровень башен (8 байт), лужи смолы (бит на точку), ступени ворот и кристалла */
export const AR_TAIL_BYTES = 1 + TOWER_SPOT_COUNT + 1 + 1;
const AR_MAGIC = 0xa7;

export interface ArsenalTail {
  /** Тип башни на точке (−1 — пусто) и уровень */
  type: number[];
  level: number[];
  tar: number;
  gateTier: number;
  crystalTier: number;
}

export function makeArsenalTail(): ArsenalTail {
  return { type: new Array(TOWER_SPOT_COUNT).fill(-1), level: new Array(TOWER_SPOT_COUNT).fill(0), tar: 0, gateTier: 0, crystalTier: 0 };
}

export function encodeArsenalTail(out: Uint8Array, at: number, t: ArsenalTail): number {
  out[at] = AR_MAGIC;
  for (let i = 0; i < TOWER_SPOT_COUNT; i++) out[at + 1 + i] = t.type[i] < 0 ? 0 : ((t.type[i] + 1) & 7) | ((Math.min(31, t.level[i]) & 31) << 3);
  out[at + 1 + TOWER_SPOT_COUNT] = t.tar & 0xff;
  out[at + 2 + TOWER_SPOT_COUNT] = (t.gateTier & 15) | ((t.crystalTier & 15) << 4);
  return at + AR_TAIL_BYTES;
}

/** false — блока нет или он битый (старый сервер): состояние не трогаем */
export function decodeArsenalTail(buf: ArrayBuffer, at: number, t: ArsenalTail): boolean {
  if (at < 0 || buf.byteLength < at + AR_TAIL_BYTES) return false;
  const v = new Uint8Array(buf, at, AR_TAIL_BYTES);
  if (v[0] !== AR_MAGIC) return false;
  for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
    const b = v[1 + i];
    t.type[i] = (b & 7) - 1;
    t.level[i] = b >> 3;
  }
  t.tar = v[1 + TOWER_SPOT_COUNT];
  t.gateTier = v[2 + TOWER_SPOT_COUNT] & 15;
  t.crystalTier = v[2 + TOWER_SPOT_COUNT] >> 4;
  return true;
}

// ------------------------------------------------------------ события арсенала (в 'fev' вместе с событиями крепости)

/** Почему сервер не дал купить: далеко от стойки, строка закрыта, мало золота */
export const NOPE_FAR = 0;
export const NOPE_LOCKED = 1;
export const NOPE_GOLD = 2;

export type ArsenalEvent =
  // выстрел тяжёлого ствола: кто, ствол, откуда, куда (центральная дробина), чем кончился (0 — стена, 1 — зомби,
  // 2 — в никуда), нормаль стены
  | ['gshot', number, number, number, number, number, number, number, number, number, number, number, number]
  // следующее попадание по этому зомби — крит
  | ['crit', number]
  // золото: кому, сколько, где всплыть
  | ['gold', number, number, number, number, number]
  // конец волны: кому, доля общака, бонус волны, чистая ли волна (1/0)
  | ['pot', number, number, number, number]
  // граната: кто, номер гранаты, откуда, скорость (полёт клиент считает тем же шагом)
  | ['gren', number, number, number, number, number, number, number, number]
  // взрыв: где, радиус, вид (0 — граната, 1 — ядро), номер гранаты (0 — ядро)
  | ['boom', number, number, number, number, number, number]
  // башня построена или улучшена: место, тип, уровень, кто
  | ['tower', number, number, number, number]
  // баллиста: место, зомби, куда
  | ['bolt', number, number, number, number, number]
  // пушка: место, куда летит ядро, сколько тиков
  | ['cball', number, number, number, number, number]
  // котёл вылил смолу: место, куда
  | ['tar', number, number, number]
  // жаровня плюнула углями: место
  | ['coals', number]
  // зомби загорелся: какой, на сколько тиков
  | ['burn', number, number]
  // покупка: кто, id действия
  | ['abuy', number, number]
  // покупка не прошла: кто, id действия, почему (NOPE_*)
  | ['anope', number, number, number]
  // гранаты выданы (начало волны, припасы): кому, сколько стало
  | ['grens', number, number];
