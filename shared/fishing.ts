// Рыбалка с мостков к маяку: что клюёт (рыба Чёрного моря и немного хлама), как часто, сколько весит и стоит,
// сроки проб, поклёвки и подсечки, альбом рыбака. Решает сервер (server/lobby/fishing.ts); клиент по этим же
// таблицам рисует рыбу, карточку улова и альбом. В конце таблицы — виды рыбалки 2.0 (у старой рыбалки они не клюют:
// w = 0): правила для них — в shared/fishrules.ts.
import { TICK_RATE } from './constants.ts';

export const R_COMMON = 0;
export const R_UNCOMMON = 1;
export const R_RARE = 2;
export const R_EPIC = 3;
export const R_LEGEND = 4;
export const R_JUNK = 5;
export const RARITY_NAMES = ['обычная', 'необычная', 'редкая', 'очень редкая', 'легенда', 'хлам'] as const;
/** Цвет редкости: рамка карточки улова и клетки альбома */
export const RARITY_CSS = ['#8f9aa3', '#3fa463', '#2f86d8', '#9a4ee0', '#eb9a12', '#8a7766'] as const;
/** Новый вид в альбоме — бонус, жетонов */
export const NEW_BONUS = [5, 10, 20, 40, 80, 5] as const;
/** Подсечь надо успеть за столько мс после поклёвки (плюс пинг рыбака): чем реже рыба, тем быстрее */
export const HOOK_MS = [1000, 900, 800, 700, 650, 1000] as const;
/** С этой редкости улов объявляется в общем чате (хлам — никогда) */
export const ANNOUNCE_FROM = R_RARE;

export type FishShape = 'fish' | 'long' | 'flat' | 'ray' | 'shark' | 'boot' | 'bottle' | 'eel' | 'sword' | 'angler' | 'chest';

export interface FishKind {
  /** Ключ в альбоме профиля: не менять */
  id: string;
  name: string;
  /** Кого вытаскивают: «… вытаскивает катрана» */
  acc: string;
  rarity: number;
  /** Вес, граммы: от и до (тяжёлые попадаются реже) */
  g: readonly [number, number];
  /** Цена, жетоны: за самую лёгкую и за самую тяжёлую */
  price: readonly [number, number];
  /** Как часто клюёт: доля из 1000 */
  w: number;
  shape: FishShape;
  /** Спина и брюхо */
  c: readonly [number, number];
}

/** Порядок — порядок клеток альбома. */
export const FISH: readonly FishKind[] = [
  { id: 'hamsa', name: 'Хамса', acc: 'хамсу', rarity: R_COMMON, g: [12, 35], price: [1, 1], w: 120, shape: 'fish', c: [0x52789a, 0xe9eff3] },
  { id: 'goby', name: 'Бычок', acc: 'бычка', rarity: R_COMMON, g: [40, 320], price: [1, 1], w: 150, shape: 'fish', c: [0x6e5c3b, 0xdccba0] },
  { id: 'scad', name: 'Ставрида', acc: 'ставриду', rarity: R_COMMON, g: [80, 450], price: [1, 1], w: 140, shape: 'fish', c: [0x4a7b86, 0xe1e9e8] },
  { id: 'redmullet', name: 'Барабуля', acc: 'барабулю', rarity: R_COMMON, g: [40, 220], price: [1, 1], w: 110, shape: 'fish', c: [0xd25f4c, 0xf5d8c9] },
  { id: 'mullet', name: 'Кефаль', acc: 'кефаль', rarity: R_UNCOMMON, g: [300, 1800], price: [1, 3], w: 80, shape: 'fish', c: [0x67757f, 0xeceff1] },
  { id: 'mackerel', name: 'Скумбрия', acc: 'скумбрию', rarity: R_UNCOMMON, g: [180, 800], price: [1, 3], w: 75, shape: 'fish', c: [0x2c6c66, 0xe7eef0] },
  { id: 'garfish', name: 'Сарган', acc: 'саргана', rarity: R_UNCOMMON, g: [150, 700], price: [1, 3], w: 55, shape: 'long', c: [0x377b6c, 0xe0efe8] },
  { id: 'scorpion', name: 'Морской ёрш', acc: 'морского ерша', rarity: R_UNCOMMON, g: [100, 650], price: [1, 3], w: 55, shape: 'fish', c: [0xa7472e, 0xe9b98f] },
  { id: 'flounder', name: 'Камбала', acc: 'камбалу', rarity: R_RARE, g: [500, 4500], price: [3, 8], w: 45, shape: 'flat', c: [0x79694b, 0xf1ece1] },
  { id: 'bluefish', name: 'Луфарь', acc: 'луфаря', rarity: R_RARE, g: [700, 4000], price: [3, 8], w: 35, shape: 'fish', c: [0x33608a, 0xe0e8f0] },
  { id: 'gurnard', name: 'Морской петух', acc: 'морского петуха', rarity: R_RARE, g: [300, 1600], price: [4, 8], w: 25, shape: 'fish', c: [0xd4533a, 0xf7c9a4] },
  { id: 'dogfish', name: 'Катран', acc: 'катрана', rarity: R_EPIC, g: [2500, 12000], price: [8, 20], w: 18, shape: 'shark', c: [0x6b737d, 0xe5e7e9] },
  { id: 'ray', name: 'Скат', acc: 'ската', rarity: R_EPIC, g: [3000, 15000], price: [8, 20], w: 14, shape: 'ray', c: [0x89735a, 0xf0e7d9] },
  { id: 'sturgeon', name: 'Осётр', acc: 'осетра', rarity: R_LEGEND, g: [6000, 40000], price: [25, 60], w: 5, shape: 'shark', c: [0x4b5141, 0xd9d7c5] },
  { id: 'goldfish', name: 'Золотая рыбка', acc: 'золотую рыбку', rarity: R_LEGEND, g: [150, 600], price: [50, 50], w: 3, shape: 'fish', c: [0xf0b02c, 0xffe28c] },
  { id: 'boot', name: 'Старый сапог', acc: 'старый сапог', rarity: R_JUNK, g: [500, 1400], price: [0, 0], w: 50, shape: 'boot', c: [0x3d3530, 0x2a2420] },
  { id: 'bottle', name: 'Бутылка с запиской', acc: 'бутылку с запиской', rarity: R_JUNK, g: [350, 700], price: [0, 0], w: 20, shape: 'bottle', c: [0x3e8a5a, 0xf2e6c8] },
  // --- рыбалка 2.0 (shared/fishrules.ts): старая рыбалка их не ловит (w = 0), ключи альбома — тоже не менять
  { id: 'wrasse', name: 'Зеленушка', acc: 'зеленушку', rarity: R_COMMON, g: [50, 300], price: [1, 1], w: 0, shape: 'fish', c: [0x5b7f3c, 0xd8cf94] },
  { id: 'karas', name: 'Ласкирь', acc: 'ласкиря', rarity: R_COMMON, g: [50, 300], price: [1, 1], w: 0, shape: 'fish', c: [0x9aa49b, 0xeef0e2] },
  { id: 'blenny', name: 'Морская собачка', acc: 'морскую собачку', rarity: R_COMMON, g: [20, 120], price: [1, 1], w: 0, shape: 'fish', c: [0x7d6a40, 0xd9c99c] },
  { id: 'sardine', name: 'Сардина', acc: 'сардину', rarity: R_COMMON, g: [30, 120], price: [1, 1], w: 0, shape: 'fish', c: [0x3c6e8c, 0xeef2f4] },
  { id: 'whiting', name: 'Мерланг', acc: 'мерланга', rarity: R_COMMON, g: [60, 500], price: [1, 1], w: 0, shape: 'fish', c: [0x9a8f78, 0xeeeae2] },
  { id: 'picarel', name: 'Смарида', acc: 'смариду', rarity: R_COMMON, g: [30, 150], price: [1, 1], w: 0, shape: 'fish', c: [0x7d8a92, 0xe8ecee] },
  { id: 'eel', name: 'Угорь', acc: 'угря', rarity: R_RARE, g: [300, 3000], price: [3, 8], w: 0, shape: 'eel', c: [0x4b4a2c, 0xd9c271] },
  { id: 'meagre', name: 'Горбыль', acc: 'горбыля', rarity: R_RARE, g: [500, 4000], price: [3, 8], w: 0, shape: 'fish', c: [0x5a4632, 0xc9a86a] },
  { id: 'shad', name: 'Черноморская сельдь', acc: 'черноморскую сельдь', rarity: R_RARE, g: [200, 1200], price: [3, 8], w: 0, shape: 'fish', c: [0x3d6b7a, 0xeef3f4] },
  { id: 'turbot', name: 'Калкан', acc: 'калкана', rarity: R_EPIC, g: [2000, 12000], price: [8, 20], w: 0, shape: 'flat', c: [0x6b6250, 0xf2eee4] },
  { id: 'seabass', name: 'Лаврак', acc: 'лаврака', rarity: R_EPIC, g: [1000, 8000], price: [8, 20], w: 0, shape: 'fish', c: [0x5f7480, 0xeef2f3] },
  { id: 'leerfish', name: 'Лихия', acc: 'лихию', rarity: R_EPIC, g: [2000, 15000], price: [8, 20], w: 0, shape: 'fish', c: [0x6d7f88, 0xf0f2f2] },
  { id: 'tuna', name: 'Голубой тунец', acc: 'голубого тунца', rarity: R_LEGEND, g: [20000, 150000], price: [25, 60], w: 0, shape: 'fish', c: [0x1f3a68, 0xdfe6ec] },
  { id: 'swordfish', name: 'Меч-рыба', acc: 'меч-рыбу', rarity: R_LEGEND, g: [15000, 120000], price: [25, 60], w: 0, shape: 'sword', c: [0x4a3a5a, 0xd8d0c8] },
  { id: 'angler', name: 'Морской чёрт', acc: 'морского чёрта', rarity: R_LEGEND, g: [5000, 40000], price: [25, 60], w: 0, shape: 'angler', c: [0x6a5440, 0xd8c8b0] },
  { id: 'whiteshark', name: 'Большая белая акула', acc: 'большую белую акулу', rarity: R_LEGEND, g: [300000, 900000], price: [25, 60], w: 0, shape: 'shark', c: [0x5d6a73, 0xf2f2ee] },
  { id: 'chest', name: 'Сундук', acc: 'сундук', rarity: R_JUNK, g: [3000, 9000], price: [0, 0], w: 0, shape: 'chest', c: [0x7a5230, 0x3a3a3a] },
  // Real marine event species; append only, preserving every existing species/album ID.
  { id: 'bluemarlin', name: 'Синий марлин', acc: 'синего марлина', rarity: R_LEGEND, g: [50_000, 650_000], price: [25, 60], w: 0, shape: 'sword', c: [0x174982, 0xe7eef5] },
  { id: 'greenlandshark', name: 'Гренландская акула', acc: 'гренландскую акулу', rarity: R_LEGEND, g: [250_000, 1_400_000], price: [25, 60], w: 0, shape: 'shark', c: [0x655c51, 0xb3ada1] },
  // Баркас в открытом море (shared/fishrules.ts, zone 'barkas'): 15 своих видов и 4 — только в дождь. Только в конец, ID не менять.
  { id: 'sprat', name: 'Шпрот', acc: 'шпрота', rarity: R_COMMON, g: [6, 25], price: [1, 1], w: 0, shape: 'fish', c: [0x3f6f86, 0xeef3f5] },
  { id: 'flyingfish', name: 'Летучая рыба', acc: 'летучую рыбу', rarity: R_COMMON, g: [120, 450], price: [1, 1], w: 0, shape: 'fish', c: [0x24486e, 0xe6eef4] },
  { id: 'haddock', name: 'Пикша', acc: 'пикшу', rarity: R_COMMON, g: [400, 3000], price: [1, 1], w: 0, shape: 'fish', c: [0x6b6474, 0xeeecef] },
  { id: 'hake', name: 'Хек', acc: 'хека', rarity: R_COMMON, g: [300, 3000], price: [1, 1], w: 0, shape: 'fish', c: [0x6f7c86, 0xe9edf0] },
  { id: 'redfish', name: 'Морской окунь', acc: 'морского окуня', rarity: R_RARE, g: [500, 5000], price: [3, 8], w: 0, shape: 'fish', c: [0xd2512f, 0xf3b08e] },
  { id: 'bonito', name: 'Пеламида', acc: 'пеламиду', rarity: R_RARE, g: [800, 6000], price: [3, 8], w: 0, shape: 'fish', c: [0x2c4f72, 0xe4ebef] },
  { id: 'cod', name: 'Треска', acc: 'треску', rarity: R_RARE, g: [1000, 15_000], price: [3, 8], w: 0, shape: 'fish', c: [0x6f6a43, 0xe8e2c8] },
  { id: 'barracuda', name: 'Барракуда', acc: 'барракуду', rarity: R_RARE, g: [800, 8000], price: [3, 8], w: 0, shape: 'long', c: [0x5b6870, 0xe7ebec] },
  { id: 'wolffish', name: 'Зубатка', acc: 'зубатку', rarity: R_EPIC, g: [2000, 18_000], price: [8, 20], w: 0, shape: 'eel', c: [0x5a6670, 0xb9c0c4] },
  { id: 'mahi', name: 'Корифена', acc: 'корифену', rarity: R_EPIC, g: [2500, 25_000], price: [8, 20], w: 0, shape: 'fish', c: [0x2f8a6a, 0xf2d34a] },
  { id: 'amberjack', name: 'Сериола', acc: 'сериолу', rarity: R_EPIC, g: [5000, 60_000], price: [8, 20], w: 0, shape: 'fish', c: [0x5c6a52, 0xe9e6d8] },
  { id: 'sunfish', name: 'Рыба-луна', acc: 'рыбу-луну', rarity: R_LEGEND, g: [150_000, 1_500_000], price: [25, 60], w: 0, shape: 'fish', c: [0x7d8890, 0xd9dde0] },
  { id: 'halibut', name: 'Палтус', acc: 'палтуса', rarity: R_LEGEND, g: [10_000, 200_000], price: [25, 60], w: 0, shape: 'flat', c: [0x5a4a35, 0xf1ece0] },
  { id: 'mako', name: 'Акула-мако', acc: 'акулу-мако', rarity: R_LEGEND, g: [50_000, 500_000], price: [25, 60], w: 0, shape: 'shark', c: [0x2a4f86, 0xf2f3f5] },
  { id: 'oarfish', name: 'Сельдяной король', acc: 'сельдяного короля', rarity: R_LEGEND, g: [30_000, 270_000], price: [25, 60], w: 0, shape: 'eel', c: [0xc9d0d6, 0xe8ecef] },
  { id: 'hairtail', name: 'Рыба-сабля', acc: 'рыбу-саблю', rarity: R_RARE, g: [400, 4000], price: [3, 8], w: 0, shape: 'eel', c: [0xaab4bd, 0xe8edf1] },
  { id: 'wahoo', name: 'Ваху', acc: 'ваху', rarity: R_EPIC, g: [8000, 60_000], price: [8, 20], w: 0, shape: 'fish', c: [0x1f5f7a, 0xdfe7ec] },
  { id: 'blueshark', name: 'Голубая акула', acc: 'голубую акулу', rarity: R_EPIC, g: [30_000, 200_000], price: [8, 20], w: 0, shape: 'shark', c: [0x2d58a8, 0xf0f2f6] },
  { id: 'hammerhead', name: 'Рыба-молот', acc: 'рыбу-молот', rarity: R_LEGEND, g: [40_000, 400_000], price: [25, 60], w: 0, shape: 'shark', c: [0x6f7166, 0xeeeeea] },
];

/** Номер золотой рыбки: её не продают, а отпускают — за желание */
export const GOLDFISH = FISH.findIndex((f) => f.id === 'goldfish');

// ------------------------------------------------------------ фазы и события

/** С удочкой, не заброшено */
export const FP_IDLE = 0;
/** Замах и полёт поплавка */
export const FP_CAST = 1;
/** Поплавок на воде: пробы, ждём поклёвку */
export const FP_WAIT = 2;
/** Поклёвка: поплавок под водой, окно подсечки */
export const FP_BITE = 3;
/** Подсёк: вываживание */
export const FP_REEL = 4;
/** Рыба в руках: в альбом или на продажу */
export const FP_HOLD = 5;

/** События места (в lev: ['fish', событие, место, a, b]) */
export const FE_CAST = 0; // a, b — куда упал поплавок (x, z)
export const FE_NIBBLE = 1; // a — номер события поплавка
export const FE_BITE = 2; // a — номер события поплавка
export const FE_HOOK = 3; // подсёк: a — вид, b — граммы (тянем)
export const FE_EARLY = 4; // рано: a = 1 — сорвалась на пробе, 0 — просто смотал
export const FE_MISS = 5; // не успел — ушла
export const FE_LAND = 6; // вытащил: a — вид, b — граммы (в руках)
export const FE_DONE = 7; // a = 1 — в альбом, 0 — продал (отпустил, выбросил)
export const FE_OFF = 8; // ушёл с места
export const FE_LOST = 9; // рыбалка 2.0: сорвалась на шкале вываживания

/** Место рыбалки для входящего на набережную: фаза, поплавок, что на крючке или в руках */
export interface FishSpotView {
  ph: number;
  x: number;
  z: number;
  sp: number;
  g: number;
}

// ------------------------------------------------------------ сроки (тики)

/** Замах и полёт поплавка */
export const CAST_TICKS = Math.round(0.75 * TICK_RATE);
/** После приземления поплавка до поклёвки */
export const WAIT_MIN = 6 * TICK_RATE;
export const WAIT_MAX = 18 * TICK_RATE;
/** Рыба в руках: не выбрал за столько — выберется само (выгоднее для альбома или продать) */
export const HOLD_TICKS = 30 * TICK_RATE;
/** Пинг сверх этого окно подсечки уже не растягивает, мс */
const PING_CAP = 600;

/** Пробы перед поклёвкой (тики от приземления) и сама поклёвка. rand — случайное 0…1. */
export function planBite(rand: () => number): { nibbles: number[]; bite: number } {
  const bite = WAIT_MIN + Math.floor(rand() * (WAIT_MAX - WAIT_MIN));
  const r = rand();
  const count = r < 0.2 ? 0 : r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
  const nibbles: number[] = [];
  let t = bite - Math.round((0.7 + rand() * 0.9) * TICK_RATE);
  for (let i = 0; i < count && t > TICK_RATE; i++) {
    nibbles.unshift(t);
    t -= Math.round((0.9 + rand() * 1.1) * TICK_RATE);
  }
  return { nibbles, bite };
}

/** Окно подсечки в тиках: по редкости, плюс пинг рыбака (не больше PING_CAP) и тик-другой на рассылку. */
export function hookTicks(rarity: number, pingMs: number): number {
  const ping = Math.min(PING_CAP, Math.max(0, pingMs || 0));
  return Math.ceil(((HOOK_MS[rarity] ?? 1000) + ping) * TICK_RATE / 1000) + 2;
}

/** Вываживание: мелочь — 1,2 с, крупная рыба дольше (до 3,2 с). */
export function reelTicks(g: number): number {
  const s = 1.2 + 0.25 * Math.log2(Math.max(1, g / 100));
  return Math.round(Math.min(3.2, Math.max(1.2, s)) * TICK_RATE);
}

// ------------------------------------------------------------ улов

/** Что попалось: вид по частоте, вес — ближе к лёгкому (крупные редки). */
export function rollCatch(rand: () => number): { sp: number; g: number } {
  let r = rand() * 1000;
  let sp = FISH.length - 1;
  for (let i = 0; i < FISH.length; i++) {
    r -= FISH[i].w;
    if (r < 0) {
      sp = i;
      break;
    }
  }
  const f = FISH[sp];
  const u = rand();
  const raw = f.g[0] + (f.g[1] - f.g[0]) * u * u;
  // от килограмма — с точностью до 10 г
  const g = raw >= 1000 ? Math.round(raw / 10) * 10 : Math.round(raw);
  return { sp, g: Math.min(f.g[1], Math.max(f.g[0], g)) };
}

/** Цена улова: от цены самой лёгкой до цены самой тяжёлой по весу. */
export function fishPrice(sp: number, g: number): number {
  const f = FISH[sp];
  if (!f) return 0;
  const k = f.g[1] > f.g[0] ? (g - f.g[0]) / (f.g[1] - f.g[0]) : 0;
  return Math.round(f.price[0] + (f.price[1] - f.price[0]) * Math.min(1, Math.max(0, k)));
}

/** «350 г», «1,24 кг», «12,4 кг». */
export function fmtWeight(g: number): string {
  if (g < 1000) return `${Math.round(g)} г`;
  return `${(g / 1000).toFixed(g < 10000 ? 2 : 1).replace('.', ',')} кг`;
}

// ------------------------------------------------------------ альбом

/** Альбом рыбака: ключ вида → [рекорд, граммы; сколько положено в альбом] */
export type FishAlbum = Record<string, [number, number]>;

/** Альбом из прочитанного JSON: только известные виды, целые неотрицательные числа. */
export function sanitizeAlbum(raw: unknown): FishAlbum {
  const out: FishAlbum = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const f of FISH) {
    const e = r[f.id];
    if (!Array.isArray(e)) continue;
    const g = Math.floor(Number(e[0]));
    const n = Math.floor(Number(e[1]));
    if (Number.isFinite(g) && Number.isFinite(n) && g > 0 && n > 0) out[f.id] = [g, n];
  }
  return out;
}

/** Улов против альбома: новый вид, новый рекорд. */
export function albumNews(album: FishAlbum, sp: number, g: number): { fresh: boolean; record: boolean } {
  const e = album[FISH[sp].id];
  return { fresh: !e, record: !!e && g > e[0] };
}
