// Крысиные бега (флаг сервера RATRACE): маленький ипподром на понтоне у набережной, шесть крыс, ставка в жетонах на
// победителя. Коэффициенты фиксированы на забег: перед каждым забегом сервер раздаёт крысам шесть «форм дня»
// (×3, ×4, ×5, ×7, ×12, ×25). Шанс крысы — ровно 2100/× из 2204, поэтому возврат на любую крысу одинаковый:
// 2100 / 2204 ≈ 95,3 %. Победителя и весь порядок на финише тянет сервер (crypto.randomInt) с этими вероятностями;
// клиенты проигрывают забег по сиду и порядку по серверному времени — у всех одинаково, на финише ровно серверный порядок.
// Здесь: крысы, шансы, лимиты, таймер, раскладка понтона и трассы, план забега (без three.js — проверяется тестами).
import { makeRng } from './math.ts';
import { ROULETTE_MAX_PAYOUT } from './roulette.ts';

/** Как бежит крыса: характер виден в забеге (кто рвёт со старта, кто финиширует), на шансы не влияет */
export type RatStyle = 'bolt' | 'closer' | 'steady' | 'erratic' | 'lazy' | 'burst';

export interface RatDef {
  name: string;
  /** Окрас: спина и брюшко/лапы */
  coat: number;
  belly: number;
  /** Характер в одну строку — в окне ставки */
  trait: string;
  style: RatStyle;
  /** Цвет попоны с номером (как на скачках): по нему крысу видно на дорожке, в окне и на табло */
  saddle: string;
  /** Она (Пуля, Соня, Ириска) или он (Барон, Шнырь, Кексик) — для «победила / победил» */
  fem: boolean;
}

export const RATS: readonly RatDef[] = [
  { name: 'Пуля', coat: 0x8f9296, belly: 0xd9d6cf, trait: 'рвёт со старта, к финишу выдыхается', style: 'bolt', saddle: '#d64541', fem: true },
  { name: 'Соня', coat: 0x8a6748, belly: 0xd8c3a5, trait: 'медленно, но упорно — сильный финиш', style: 'closer', saddle: '#3f7fd8', fem: true },
  { name: 'Барон', coat: 0x3b3a3f, belly: 0x77746f, trait: 'старый чемпион, бежит ровно', style: 'steady', saddle: '#e8b923', fem: false },
  { name: 'Шнырь', coat: 0xeeeae2, belly: 0xf6d6d0, trait: 'петляет по дорожке, но шустрый', style: 'erratic', saddle: '#3fa65a', fem: false },
  { name: 'Кексик', coat: 0xc7864a, belly: 0xf0d2a8, trait: 'толстый и вечно голодный — может отвлечься на крошку', style: 'lazy', saddle: '#8e5bd0', fem: false },
  { name: 'Ириска', coat: 0xd9b382, belly: 0xf3e3c6, trait: 'бежит рывками: то стоит, то летит', style: 'burst', saddle: '#f08a2c', fem: true },
];
export const RAT_COUNT = RATS.length;

/** «Победила Соня» / «Победил Барон» */
export function ratWon(rat: number): string {
  const d = RATS[rat];
  return d ? `${d.fem ? 'Победила' : 'Победил'} ${d.name}` : '';
}

/** Формы дня: во сколько раз вернётся ставка на крысу (вместе со ставкой) */
export const RAT_MULTS: readonly number[] = [3, 4, 5, 7, 12, 25];
/** Шанс формы ×m — (2100/m) из 2204: 700, 525, 420, 300, 175, 84 */
const RAT_SCALE = 2100;
export const RAT_WEIGHT_SUM = 2204;
/** Возврат игрокам: одинаковый на любую крысу */
export const RAT_RTP = RAT_SCALE / RAT_WEIGHT_SUM;

/** Ставка, жетонов: минимум, максимум, фишки окна; потолок выплаты — как у рулетки рыбака */
export const RAT_MIN_BET = 5;
export const RAT_MAX_BET = 1000;
export const RAT_CHIPS: readonly number[] = [10, 50, 100, 500];
export const RAT_MAX_PAYOUT = ROULETTE_MAX_PAYOUT;
/** Таймер: первая ставка — 15 с до старта; каждый новый игрок в забеге — +3 с; всего с первой ставки не больше 30 с */
export const RAT_OPEN_MS = 15_000;
export const RAT_ADD_MS = 3_000;
export const RAT_OPEN_MAX_MS = 30_000;
/** Забег от открытия воротец до расчёта, мс (последняя крыса финиширует не позже RAT_LAST_MS) */
export const RAT_RUN_MS = 12_000;
/** С такого выигрыша — строка в общий чат */
export const RAT_ANNOUNCE = 300;
/** «Болеть»: с одного игрока не чаще раза в RAT_CHEER_MS; кричать можно с RAT_CHEER_R метров от арены */
export const RAT_CHEER_MS = 1200;
export const RAT_CHEER_R = 16;

/** Шанс крысы с коэффициентом m (0…1) */
export function ratChance(m: number): number {
  return RAT_MULTS.includes(m) ? RAT_SCALE / m / RAT_WEIGHT_SUM : 0;
}

/** Сколько принесёт ставка stake при коэффициенте m, если крыса победит (с потолком) */
export function ratWin(stake: number, m: number): number {
  return Math.min(RAT_MAX_PAYOUT, stake * m);
}

/** Выплата ставки stake на крысу rat при коэффициентах odds, если победила winner: 0 — проиграл */
export function ratPayout(stake: number, rat: number, odds: readonly number[], winner: number): number {
  if (!Number.isSafeInteger(stake) || stake <= 0 || rat !== winner) return 0;
  const m = odds[rat];
  return m === undefined ? 0 : ratWin(stake, m);
}

export function isRatIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < RAT_COUNT;
}

/** Ставка в пределах стола (без баланса) */
export function isRatBet(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= RAT_MIN_BET && v <= RAT_MAX_BET;
}

/** Больше этого поставить нельзя: лимит стола или сколько у тебя жетонов */
export function maxRatBet(balance: number): number {
  return Math.max(0, Math.min(RAT_MAX_BET, Math.floor(Number.isFinite(balance) ? balance : 0)));
}

/** Новый игрок поставил: старт отодвигается на RAT_ADD_MS, но не дальше RAT_OPEN_MAX_MS от первой ставки */
export function ratExtend(openedAt: number, until: number): number {
  return Math.min(until + RAT_ADD_MS, openedAt + RAT_OPEN_MAX_MS);
}

/** Коэффициенты забега по перестановке форм: perm[i] — номер формы крысы i */
export function ratOdds(perm: readonly number[]): number[] {
  return perm.map((k) => RAT_MULTS[k]);
}

/** Случайная перестановка 0…n−1; rand(n) — равномерное целое 0…n−1 (на сервере — crypto.randomInt) */
export function ratShuffle(n: number, rand: (n: number) => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Порядок на финише: первым — победитель по шансам забега, дальше каждый следующий по тем же весам среди оставшихся.
 * rand(n) — равномерное целое 0…n−1. Веса целые (2100/m), поэтому шанс победы ровно 2100/m из 2204.
 */
export function ratDrawOrder(odds: readonly number[], rand: (n: number) => number): number[] {
  const left = odds.map((_, i) => i);
  const order: number[] = [];
  while (left.length) {
    const w = left.map((i) => RAT_SCALE / odds[i]);
    let r = rand(w.reduce((a, b) => a + b, 0));
    let k = 0;
    while (r >= w[k]) r -= w[k++];
    order.push(left[k]);
    left.splice(k, 1);
  }
  return order;
}

export function isRatOrder(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === RAT_COUNT && new Set(v).size === RAT_COUNT && v.every(isRatIndex);
}

// ------------------------------------------------------------ состояние для всех и сообщения

export interface RatBetView {
  pid: number;
  nick: string;
  rat: number;
  stake: number;
}

/** Итог прошлого забега: порядок на финише, коэффициенты и кто сколько выиграл */
export interface RatLast {
  race: number;
  order: number[];
  odds: number[];
  wins: Array<{ nick: string; payout: number }>;
}

/**
 * Ипподром для всех на набережной. phase: idle — мыши живут, ставка открывает приём; open — отсчёт до старта (left мс
 * в момент отправки); run — забег (left — до расчёта), seed и order — план забега. odds — коэффициенты текущего
 * (или следующего) забега, race — его номер. last — итог прошлого забега (до конца следующего).
 */
export interface RatRaceView {
  phase: 'idle' | 'open' | 'run';
  left: number;
  race: number;
  odds: number[];
  bets: RatBetView[];
  seed?: number;
  order?: number[];
  last?: RatLast;
}

/** Сообщения клиента: ставка (rat, amount, на забег race) и «болеть» за крысу */
export type RatClientMsg =
  | { t: 'rat'; a: 'bet'; rat: number; amount: number; race: number }
  | { t: 'rat'; a: 'cheer'; rat: number };

/**
 * Сообщения сервера: ипподром (при каждом изменении); свой итог (когда забег рассчитан); кто-то болеет (id — номер
 * в снимке, rat — за кого); ответ на ставку (ok — принята; иначе text — почему нет, окно остаётся открытым).
 */
export type RatServerMsg =
  | { t: 'rat'; v: RatRaceView }
  | { t: 'ratResult'; race: number; rat: number; stake: number; payout: number; winner: number }
  | { t: 'ratCheer'; id: number; rat: number }
  | { t: 'ratBet'; ok: boolean; text: string };

// ------------------------------------------------------------ понтон и трасса (X — восток, Z — юг, yaw 0 — на −Z)

/** Понтон у набережной между скамейкой и мостками к маяку: верх настила — y 0, вровень с набережной */
export const RAT_DECK = { x0: -10.8, x1: -4.0, z0: 22, z1: 26.8 } as const;
/** Бортик арены (внешний контур) и его высота: выше шага (0,52 м), не перешагнуть — только перепрыгнуть */
export const RAT_PEN = { x0: -10.2, x1: -4.6, z0: 23.2, z1: 26.2, h: 0.6, t: 0.08 } as const;
/** Трасса — стадион: центр, половина прямой, радиус осевой на поворотах, ширина дорожки */
export const RAT_TRACK = { x: -7.4, z: 24.7, half: 1.3, r: 0.95, w: 0.9 } as const;
/**
 * Табло на двух столбах у южного края понтона, лицом к площади: большое и выше голов (низ щита — 2,4 м, над никами
 * желеек у арены), чтобы читалось с площадки и издалека. x — середина щита, z — линия столбов, w × h — щит, y — его низ.
 */
export const RAT_BOARD = { x: -7.4, z: 26.55, w: 6.2, h: 3.3, y: 2.4 } as const;
/** Где встать, чтобы сделать ставку (E): перед ареной с набережной и с понтона */
export const RAT_USE = { x: -7.4, z: 22.5, r: 3.3 } as const;
/** Центр арены — для «рядом ли игрок» */
export const RAT_CENTER = { x: RAT_TRACK.x, z: RAT_TRACK.z } as const;

/** Длина круга по осевой, м */
export const RAT_LAP = 4 * RAT_TRACK.half + 2 * Math.PI * RAT_TRACK.r;

/**
 * Точка трассы: s — пройдено от линии старта-финиша по осевой (м, по кругу), lat — сдвиг наружу от осевой (м).
 * Линия — середина передней (северной) прямой; бегут на запад (слева направо, если смотреть с площади), круг — против
 * часовой стрелки на виде сверху с севером вверху. yaw — куда смотрит бегущая крыса.
 */
export function ratTrackPoint(s: number, lat: number, out: { x: number; z: number; yaw: number } = { x: 0, z: 0, yaw: 0 }): { x: number; z: number; yaw: number } {
  const { x: cx, z: cz, half, r } = RAT_TRACK;
  const arc = Math.PI * r;
  let d = ((s % RAT_LAP) + RAT_LAP) % RAT_LAP;
  // 1) передняя прямая, от середины на запад
  if (d < half) {
    out.x = cx - d; out.z = cz - r - lat; out.yaw = Math.PI / 2;
    return out;
  }
  d -= half;
  // 2) западный поворот: центр (cx − half, cz), с севера через запад на юг
  if (d < arc) {
    const a = d / r;
    const ox = cx - half, rr = r + lat;
    out.x = ox - Math.sin(a) * rr; out.z = cz - Math.cos(a) * rr; out.yaw = Math.PI / 2 + a;
    return out;
  }
  d -= arc;
  // 3) задняя прямая, на восток
  if (d < 2 * half) {
    out.x = cx - half + d; out.z = cz + r + lat; out.yaw = -Math.PI / 2;
    return out;
  }
  d -= 2 * half;
  // 4) восточный поворот: центр (cx + half, cz), с юга через восток на север
  if (d < arc) {
    const a = d / r;
    const ox = cx + half, rr = r + lat;
    out.x = ox + Math.sin(a) * rr; out.z = cz + Math.cos(a) * rr; out.yaw = -Math.PI / 2 + a;
    return out;
  }
  d -= arc;
  // 5) передняя прямая с востока к линии
  out.x = cx + half - d; out.z = cz - r - lat; out.yaw = Math.PI / 2;
  return out;
}

// ------------------------------------------------------------ план забега (одинаковый у всех клиентов)

/** Шаг плана, мс */
export const RAT_PLAN_STEP = 50;
/** Воротца поднимаются с начала забега; крысы срываются после RAT_GATE_MS */
export const RAT_GATE_MS = 700;
/** Первая крыса финиширует в этом окне, последняя — не позже RAT_LAST_MS */
const FIRST_MIN = 9_800;
const FIRST_MAX = 10_500;
export const RAT_LAST_MS = 11_800;
/** После финиша крыса пробегает ещё до RAT_RUNOUT м и встаёт */
export const RAT_RUNOUT = 0.9;

export interface RatEvent {
  rat: number;
  /** мс от старта */
  at: number;
  /** trip — споткнулась (кувырок), dash — рывок, snack — отвлёкся на крошку */
  kind: 'trip' | 'dash' | 'snack';
}

export interface RatPlan {
  /** Когда каждая крыса пересекла финиш, мс от старта (по номеру крысы) */
  finish: number[];
  /** Пройдено по кругу (м) на каждом шаге плана; после финиша — накат до RAT_LAP + RAT_RUNOUT */
  dist: Float32Array[];
  /** Сдвиг поперёк дорожки, м (наружу — плюс) */
  lat: Float32Array[];
  events: RatEvent[];
  steps: number;
}

const smooth01 = (v: number): number => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};

/** Скорость по характеру: u — доля своего забега 0…1, ph — своя фаза */
function styleSpeed(style: RatStyle, u: number, ph: number): number {
  switch (style) {
    case 'bolt': return 1.55 - 0.95 * u;
    case 'closer': return 0.62 + 0.95 * u ** 1.6;
    case 'steady': return 1 + 0.04 * Math.sin(6 * u + ph);
    case 'erratic': return 1 + 0.38 * Math.sin(2 * Math.PI * (2.3 * u) + ph);
    case 'lazy': return 0.92 + 0.15 * Math.sin(2 * Math.PI * (1.4 * u) + ph);
    case 'burst': return 0.55 + 1.1 * Math.max(0, Math.sin(2 * Math.PI * (2.6 * u) + ph)) ** 2;
  }
}

/**
 * План забега: время финиша по порядку order, путь каждой крысы по шагам (с характером, рывками и спотыканиями) и
 * сдвиг по дорожке. Путь нормирован так, что крыса пересекает линию ровно в своё время финиша, — порядок на финише
 * всегда серверный, а по пути есть обгоны: у каждой свой ритм.
 */
export function ratPlan(seed: number, order: readonly number[]): RatPlan {
  const rng = makeRng(seed >>> 0);
  const steps = Math.ceil(RAT_RUN_MS / RAT_PLAN_STEP) + 1;
  const finish: number[] = new Array(RAT_COUNT).fill(RAT_LAST_MS);
  // финиши: победитель в окне FIRST, дальше с разрывами; весь хвост укладываем до RAT_LAST_MS
  let t = FIRST_MIN + rng() * (FIRST_MAX - FIRST_MIN);
  const gaps = order.slice(1).map(() => 120 + rng() * 380);
  const room = RAT_LAST_MS - t;
  const sum = gaps.reduce((a, b) => a + b, 0);
  const k = sum > room ? room / sum : 1;
  order.forEach((rat, i) => {
    if (i > 0) t += gaps[i - 1] * k;
    finish[rat] = Math.min(RAT_LAST_MS, t);
  });
  const events: RatEvent[] = [];
  const dist: Float32Array[] = [];
  const lat: Float32Array[] = [];
  for (let rat = 0; rat < RAT_COUNT; rat++) {
    const style = RATS[rat].style;
    const T = finish[rat];
    const ph = rng() * Math.PI * 2;
    const wob = rng() * Math.PI * 2;
    // свои происшествия: споткнулась, рывок, крошка (у Кексика чаще)
    const mine: RatEvent[] = [];
    const chance = (p: number): boolean => rng() < p;
    if (chance(style === 'erratic' ? 0.5 : style === 'lazy' ? 0.2 : 0.28)) mine.push({ rat, at: RAT_GATE_MS + (0.25 + rng() * 0.5) * (T - RAT_GATE_MS), kind: 'trip' });
    if (chance(style === 'burst' ? 0.15 : 0.3)) mine.push({ rat, at: RAT_GATE_MS + (0.2 + rng() * 0.6) * (T - RAT_GATE_MS), kind: 'dash' });
    if (style === 'lazy' && chance(0.55)) mine.push({ rat, at: RAT_GATE_MS + (0.3 + rng() * 0.45) * (T - RAT_GATE_MS), kind: 'snack' });
    events.push(...mine);
    // сырой путь до финиша: скорость по характеру × рябь × происшествия, разгон после воротец. Шаг, на который
    // приходится финиш, считаем только до T — так путь в момент финиша ровно total, и крыса пересекает линию ровно в T
    const raw = new Float64Array(steps);
    let acc = 0;
    for (let i = 1; i < steps; i++) {
      const a = Math.max((i - 1) * RAT_PLAN_STEP, RAT_GATE_MS);
      const b = Math.min(i * RAT_PLAN_STEP, T);
      if (b > a) {
        const tt = (a + b) / 2;
        const u = Math.min(1, Math.max(0, (tt - RAT_GATE_MS) / (T - RAT_GATE_MS)));
        let v = styleSpeed(style, u, ph) * (1 + 0.12 * Math.sin(tt / 310 + wob) * Math.sin(tt / 770 + ph));
        v *= smooth01((tt - RAT_GATE_MS) / 600);
        for (const e of mine) {
          const dt = tt - e.at;
          if (e.kind === 'trip' && dt >= 0 && dt < 520) v *= 0.08;
          if (e.kind === 'snack' && dt >= 0 && dt < 900) v *= 0.05;
          if (e.kind === 'dash' && dt >= 0 && dt < 650) v *= 1.75;
        }
        acc += Math.max(0.01, v) * (b - a);
      }
      raw[i] = acc;
    }
    const iT = Math.floor(T / RAT_PLAN_STEP);
    const total = acc || 1;
    const d = new Float32Array(steps);
    const l = new Float32Array(steps);
    const lane0 = ((rat / (RAT_COUNT - 1)) * 2 - 1) * (RAT_TRACK.w / 2 - 0.1);
    for (let i = 0; i < steps; i++) {
      const ms = i * RAT_PLAN_STEP;
      if (ms <= T) d[i] = (raw[i] / total) * RAT_LAP;
      else d[i] = RAT_LAP + RAT_RUNOUT * (1 - Math.exp(-(ms - T) / 380));
      // поперёк: от своего места на старте к внутренней бровке, с покачиванием
      const u = Math.min(1, Math.max(0, (ms - RAT_GATE_MS) / (T - RAT_GATE_MS)));
      const sway = (style === 'erratic' ? 0.16 : 0.07) * Math.sin(ms / 420 + wob);
      l[i] = Math.max(-(RAT_TRACK.w / 2 - 0.08), Math.min(RAT_TRACK.w / 2 - 0.08, lane0 * (1 - 0.55 * smooth01(u * 1.6)) + sway * smooth01(u * 4)));
    }
    // последняя точка до финиша — ровно круг (без погрешности шага)
    if (iT < steps) d[iT] = Math.min(d[iT], RAT_LAP);
    dist.push(d);
    lat.push(l);
  }
  events.sort((a, b) => a.at - b.at);
  return { finish, dist, lat, events, steps };
}

/** Где крыса rat в ms от старта: пройдено (м) и сдвиг (м); до старта — на линии, после конца — где встала */
export function ratAt(plan: RatPlan, rat: number, ms: number): { dist: number; lat: number } {
  const f = Math.min(plan.steps - 1, Math.max(0, ms / RAT_PLAN_STEP));
  const i = Math.floor(f);
  const j = Math.min(plan.steps - 1, i + 1);
  const k = f - i;
  const d = plan.dist[rat], l = plan.lat[rat];
  let dist = d[i] + (d[j] - d[i]) * k;
  // ровно в момент финиша — ровно на линии (между шагами интерполяция не должна перескочить)
  const T = plan.finish[rat];
  if (ms < T && dist >= RAT_LAP) dist = RAT_LAP - 1e-4;
  if (ms >= T && dist < RAT_LAP) dist = RAT_LAP;
  return { dist, lat: l[i] + (l[j] - l[i]) * k };
}

/** Кто впереди в ms от старта: номера крыс по убыванию пройденного (финишировавшие — по времени финиша) */
export function ratStandings(plan: RatPlan, ms: number): number[] {
  const rows = plan.finish.map((T, rat) => ({ rat, T, d: ratAt(plan, rat, ms).dist }));
  rows.sort((a, b) => {
    const fa = ms >= a.T, fb = ms >= b.T;
    if (fa && fb) return a.T - b.T;
    if (fa !== fb) return fa ? -1 : 1;
    return b.d - a.d;
  });
  return rows.map((r) => r.rat);
}
