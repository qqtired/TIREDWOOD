// Вываживание (рыбалка 2.0): шкала как в Stardew Valley. Рыба ходит вверх-вниз по шкале в своей манере — плывёт
// к цели, разгоняется и тормозит, передумывает, делает рывки, зависает; игрок водит зону: держишь кнопку — зона идёт
// вверх, отпустил — опускается (с инерцией). О край шкалы — и о дно, и о верх — зона бьётся как мячик: чем быстрее
// летела, тем сильнее отскок (на полной скорости — ×3/4), а медленнее половины полной — не отскакивает, ложится; за
// край шкалы не уходит. Рыба в зоне — прогресс растёт, вне — падает; 100 % — поймана, 0 — сорвалась. Легла на дно и
// не подматываешь дольше 0,7 с — «леска провисла» (надпись): улов не подтягивается и тает, как вне зоны, — иначе зона
// в покое сама вываживала бы рыбу, которая держится у дна (мифика ловили, вообще не трогая кнопку). Подмотать —
// толкнуть зону вверх (скорость от PUMP, это от ~3 тиков удержания): касание вслепую не считается. У самого края шкалы
// (ближе 1 %) зона накрывает и край: подмотка подбрасывает зону на доли процента — рыбу у дна это не выпускает.
// 04.10: зона больше не уходит под шкалу — снизу отскакивает по инерции, как сверху; провисание — по лежанию на дне.
// 04.10 (вечер, владелец): рыба держится в 2…98 % шкалы (лежащую на дне рыбу подматывали — зона уходила с неё);
// «натяжение лески» — зеркало провисания у верха (держишь зону прижатой к верху дольше 0,7 с — улов не идёт);
// ошибки — сколько раз рыба вышла из зоны, по ним оценка и множитель опыта (REEL_GRADES); водка — отпустил кнопку,
// а зона ещё 0,1 с едет по инерции, и икота (лёгкий толчок зоны вверх по сиду заброса). Моргание, покачивание и
// «двоится» — только у клиента (client/lobby/fishgame.ts): они не меняют модель.
//
// Одинаково считают клиент (играет у себя, без задержки) и сервер (повторяет по нажатиям и решает, поймана ли):
// только целые числа и свой генератор случайных (mulberry32 на Math.imul) — никаких Math.sin/exp/pow и Math.random,
// поэтому Chrome, Safari и Node по одному сиду и одним нажатиям приходят бит в бит к одному итогу.

/** Высота шкалы, единиц (1 % = 1000) */
export const REEL_BAR = 100_000;
/** Прогресс: 100 % и с чего начинается (25 %) */
export const REEL_P_MAX = 40_000;
export const REEL_P_START = 10_000;
/** Прибавка за тик, пока рыба в зоне: от начала до 100 % — ровно 300 тиков (5 с) */
export const REEL_GAIN = 100;
export const REEL_FILL_TICKS = (REEL_P_MAX - REEL_P_START) / REEL_GAIN;
/** Дольше этого (тиков) не тянут: леска устала — рыба сходит */
export const REEL_MAX_TICKS = 90 * 60;
/**
 * Леска провисла: зона легла на дно шкалы (отскакала и легла) и с тех пор её не подматывали (PUMP) дольше стольких
 * тиков (0,7 с). Тогда улов не подтягивается (шкала улова тает, как вне зоны) и видна надпись «приподними зону».
 * Короткий отпуск кнопки не наказывается: 0,7 с — это много.
 */
export const SLACK_TICKS = 42;
/**
 * Натяжение лески — зеркало провисания: зону держат прижатой к верху шкалы дольше стольких тиков (0,7 с) — улов не
 * подтягивается и тает, у шкалы надпись, в чат «Леска слишком натянута, возможен обрыв!». Ослабить — отпустить кнопку:
 * зона пошла вниз быстрее PUMP. Иначе рыбу, которая держится у верха, вываживали бы, просто не отпуская кнопку.
 */
export const TAUT_TICKS = SLACK_TICKS;
/** Прежде зона уходила под шкалу на столько (до 04.10); теперь не уходит — оставлено для старых проверок */
export const ZONE_SINK = 0;
/** Рыба не опускается ниже и не поднимается выше стольких единиц от края шкалы (2 %) */
export const FISH_EDGE = 2_000;
const FISH_LO = FISH_EDGE;
const FISH_HI = REEL_BAR - FISH_EDGE;
/**
 * Водка: отпустил кнопку — зона ещё столько тиков (0,1 с) едет по инерции с той же скоростью (не падает). Замер
 * модели игрока (test/fishbot.ts): «опытный» с водкой на эпической рыбе — 85 % поимок без опьянения, ~65 % пьяным.
 */
export const DRUNK_LAG = 6;
/**
 * Водка, икота: первая через 2…7 с, дальше раз в 5…10 с (по сиду заброса); зону толкает вверх на столько ед./тик —
 * заметно (почти на 1 % шкалы), но не срывает: сильнее толчок вместе с инерцией валил и «опытного».
 */
export const HIC_FIRST = 120;
export const HIC_EVERY = 300;
export const HIC_KICK = 250;

/** Зона игрока: ускорение, пока держишь, и вниз, когда отпустил (ед./тик²) */
export const ZONE_UP = 36;
export const ZONE_DOWN = 34;
/**
 * Подмотал: зона идёт вверх не медленнее стольких единиц за тик (3 тика удержания; с рыбой в зоне — 4) — счёт провисания
 * сброшен. Касание вслепую в один тик даёт 36 — не подматывает.
 */
export const PUMP = 3 * ZONE_UP;
/** Рыба в зоне — зона спокойнее: ускорение ×8/10 (в Stardew — ×6/10) */
const ZONE_ASSIST = 8;
/** «Полная скорость» удара (так зона падает с самого верха): с неё отскок самый сильный */
export const BOUNCE_FULL = 2_000;
/**
 * Отскок: медленнее этого (ед./тик — половина полной, так зона падает с 15 % высоты шкалы) зона о край не отскакивает —
 * ложится. С самой малой скорости отскок помогал держать рыбу у дна: легендарные выходили
 * легче прежнего (замер 03.10), а владелец просил чуть сложнее.
 */
export const BOUNCE_SOFT = BOUNCE_FULL / 2;
/** Самый сильный отскок: скорость ×3/4 обратно; между BOUNCE_SOFT и BOUNCE_FULL коэффициент растёт от 0 ровно */
const BOUNCE_NUM = 3;
const BOUNCE_DEN = 4;

/** Рыба дошла до цели: ближе стольких единиц и почти без скорости */
const ARRIVE = 800;
/** Рывок — не дольше стольких тиков */
const DART_TICKS = 40;
/** Начало: рыба стоит в зоне столько тиков (+ до столько же), чтобы успеть взяться */
const START_HOVER = 30;

export const REEL_PATTERNS = [
  'Dash', 'FakeDash', 'Sawtooth', 'HoverDash', 'SlowMigration', 'EdgeSnapback', 'DoubleDash', 'Wave', 'Nervous', 'Ambush',
  // fisheco: «Свечка», «Уход на глубину», «Круги», «Зигзаг»
  'Breach', 'Sound', 'Circle', 'Zigzag',
  // 04.10: «Реактивный рывок» кальмара (божественная) — только в конец, номера прежних не меняются
  'Jet',
] as const;
export type ReelPattern = typeof REEL_PATTERNS[number];
/** Названия паттернов для игрока (журнал, подсказки) */
export const PATTERN_NAMES: Readonly<Record<ReelPattern, string>> = {
  Dash: 'рывок', FakeDash: 'ложный рывок', Sawtooth: 'пила', HoverDash: 'зависание и рывок', SlowMigration: 'медленный уход',
  EdgeSnapback: 'к краю и назад', DoubleDash: 'двойной рывок', Wave: 'волна', Nervous: 'нервная', Ambush: 'засада',
  Breach: 'свечка', Sound: 'уход на глубину', Circle: 'круги', Zigzag: 'зигзаг', Jet: 'реактивный рывок',
};
/** «Последний рывок» легенд и мификов начинается, когда прогресс дошёл до стольких единиц (70 %) */
export const STAND_P = 28_000;

/**
 * Манера рыбы на шкале — в понятных единицах (таблица в shared/fishrules.ts):
 * spd — скорость, % шкалы в секунду; sharp — резкость разгона и смены направления, 1–10;
 * turn — сколько раз в минуту передумывает на ходу; dart — рывков в минуту, dartSpd — их скорость (%/с),
 * dartUp — доля рывков вверх, %; hover — сколько зависает, мс (в среднем), hoverP — как часто, дойдя до цели, %;
 * lo…hi — где ей привычно, % шкалы снизу; roam — на сколько % шкалы обычно переплывает;
 * zone — размер зоны игрока, % шкалы; drain — сопротивление: на сколько % в секунду падает прогресс вне зоны.
 */
export interface ReelStyle {
  mainPattern?: ReelPattern;
  secondaryPattern?: ReelPattern;
  /** Typical cycle length in ticks; seeded ±20% variation. */
  patternPeriod?: number;
  /** Excursion amplitude in percent of the bar. */
  patternAmplitude?: number;
  /** «Последний рывок» на 70 % прогресса: один цикл главного паттерна со скоростью ×lastStand/100 (130 — ×1,3); нет — без него */
  lastStand?: number;
  spd: number;
  sharp: number;
  turn: number;
  dart: number;
  dartSpd: number;
  dartUp: number;
  hover: number;
  hoverP: number;
  lo: number;
  hi: number;
  roam: number;
  zone: number;
  drain: number;
}

/** Манера в единицах шкалы и тиках */
interface Cfg {
  mainPattern: number;
  secondaryPattern: number;
  patternPeriod: number;
  patternAmplitude: number;
  /** «Последний рывок»: множитель скорости, % (0 — нет) */
  stand: number;
  spd: number;
  acc: number;
  turn: number;
  dart: number;
  dartSpd: number;
  dartUp: number;
  hover: number;
  hoverP: number;
  lo: number;
  hi: number;
  roam: number;
  zone: number;
  drain: number;
}

const M_MOVE = 0;
const M_HOVER = 1;
const M_DART = 2;

export interface Reel {
  /** Сколько тиков прошло */
  t: number;
  /** Рыба: где (центр, 0 — дно шкалы), скорость, цель, что делает, сколько ещё (тики) */
  f: number;
  fv: number;
  ft: number;
  mode: number;
  timer: number;
  /** Зона: нижний край и скорость; размер */
  z: number;
  zv: number;
  zone: number;
  /** Прогресс 0…REEL_P_MAX */
  p: number;
  /** 0 — идёт, 1 — поймана, −1 — сорвалась */
  done: number;
  /** Рыба в зоне после этого тика */
  inZone: boolean;
  /** Ошибки: сколько раз рыба вышла из зоны (по одной за выход); считают и клиент, и повтор сервера — по ним оценка */
  err: number;
  rng: number;
  patternTick: number;
  patternCycle: number;
  patternLength: number;
  patternAnchor: number;
  patternDir: number;
  patternTarget: number;
  /** «Последний рывок»: 0 — ещё не было, 1 — идёт, 2 — позади */
  stand: number;
  /** Сколько тиков зона пролежала у дна шкалы с тех пор, как легла на него (больше SLACK_TICKS — леска провисла) */
  rest: number;
  /** Удар о край на этом тике, ед./тик: больше 0 — о дно шкалы (отскочила), меньше 0 — о верх; 0 — не было */
  hit: number;
  /** Сколько тиков зону держат прижатой к верху шкалы (больше TAUT_TICKS — леска натянута) */
  taut: number;
  /** Водка: задержка (сколько ещё тиков зона едет вверх после отпускания), тик следующей икоты, свой генератор икоты */
  readonly drunk: boolean;
  lag: number;
  hic: number;
  hr: number;
  readonly c: Cfg;
}

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function clampI(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function toward(v: number, w: number, a: number): number {
  return v < w ? (v + a < w ? v + a : w) : v - a > w ? v - a : w;
}

function cfgOf(s: ReelStyle): Cfg {
  const pct = REEL_BAR / 100;
  const lo = Math.round(clampI(s.lo, 0, 100) * pct);
  return {
    mainPattern: s.mainPattern === undefined ? -1 : REEL_PATTERNS.indexOf(s.mainPattern),
    secondaryPattern: s.secondaryPattern === undefined ? -1 : REEL_PATTERNS.indexOf(s.secondaryPattern),
    patternPeriod: Math.round(clampI(s.patternPeriod ?? 180, 60, 480)),
    patternAmplitude: Math.round(clampI(s.patternAmplitude ?? s.roam, 5, 85) * pct),
    stand: s.lastStand ? Math.round(clampI(s.lastStand, 100, 200)) : 0,
    spd: div(s.spd * pct, 60),
    acc: Math.round(6 + clampI(s.sharp, 1, 10) * 9),
    turn: div(s.turn * 10_000, 3600),
    dart: div(s.dart * 10_000, 3600),
    dartSpd: div(s.dartSpd * pct, 60),
    dartUp: clampI(s.dartUp, 0, 100),
    hover: div(s.hover * 60, 1000),
    hoverP: clampI(s.hoverP, 0, 100),
    lo,
    hi: Math.max(lo + 5 * pct, Math.round(clampI(s.hi, 0, 100) * pct)),
    roam: Math.max(2 * pct, Math.round(s.roam * pct)),
    zone: Math.round(clampI(s.zone, 5, 90) * pct),
    drain: Math.max(1, div(s.drain * REEL_P_MAX, 6000)),
  };
}

/** mulberry32: 32-битное число без знака из уже сдвинутого состояния */
function m32(s: number): number {
  let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Следующее число генератора рыбы */
function next(r: Reel): number {
  r.rng = (r.rng + 0x6d2b79f5) | 0;
  return m32(r.rng);
}

/** Икота — свой генератор: с водкой рыба ходит ровно так же, как без неё */
function hicRnd(r: Reel, n: number): number {
  r.hr = (r.hr + 0x6d2b79f5) | 0;
  return m32(r.hr) % n;
}

/** Случайное целое 0…n−1 */
function rnd(r: Reel, n: number): number {
  return n > 0 ? next(r) % n : 0;
}

/** Новое вываживание: рыба в манере style, сид seed — от сервера; drunk — рыбак пьёт водку (задержка зоны и икота). */
export function reelStart(style: ReelStyle, seed: number, drunk = false): Reel {
  const c = cfgOf(style);
  const r: Reel = {
    t: 0, f: 0, fv: 0, ft: 0, mode: M_HOVER, timer: 0, z: 0, zv: 0, zone: c.zone, p: REEL_P_START, done: 0, inZone: true, err: 0, rng: seed | 0, patternTick: -1, patternCycle: 0, patternLength: 0, patternAnchor: 0, patternDir: 1, patternTarget: 0, stand: 0, rest: 0, hit: 0,
    taut: 0, drunk, lag: 0, hic: 0, hr: (seed ^ 0x2545f491) | 0, c,
  };
  // рыба сначала стоит посреди зоны (зона — внизу шкалы)
  r.f = clampI(div(c.zone, 2), FISH_LO, FISH_HI);
  r.ft = r.f;
  r.timer = START_HOVER + rnd(r, START_HOVER);
  if (drunk) r.hic = HIC_FIRST + hicRnd(r, HIC_EVERY + 1);
  return r;
}

/** Новая цель в привычных местах: туда-сюда на roam (± половина), не за пределы lo…hi. */
function newTarget(r: Reel): void {
  const c = r.c;
  r.mode = M_MOVE;
  let up: boolean;
  if (r.f < c.lo) up = true;
  else if (r.f > c.hi) up = false;
  else up = rnd(r, 2) === 0;
  const dist = div(c.roam, 2) + rnd(r, c.roam + 1);
  let t = clampI(up ? r.f + dist : r.f - dist, c.lo, c.hi);
  // упёрлась в край привычного — в другую сторону
  if ((t - r.f < 0 ? r.f - t : t - r.f) < div(c.roam, 4)) t = clampI(up ? r.f - dist : r.f + dist, c.lo, c.hi);
  r.ft = clampI(t, FISH_LO, FISH_HI);
}

/** Рывок: далеко и быстро, чаще в свою сторону (вверх — dartUp %); у края — от края. */
function startDart(r: Reel): void {
  const c = r.c;
  r.mode = M_DART;
  r.timer = DART_TICKS;
  let up = rnd(r, 100) < c.dartUp;
  if (up && r.f > REEL_BAR - div(REEL_BAR, 5)) up = false;
  else if (!up && r.f < div(REEL_BAR, 5)) up = true;
  const dist = div(REEL_BAR, 5) + rnd(r, div(REEL_BAR, 4));
  r.ft = clampI(up ? r.f + dist : r.f - dist, FISH_LO, FISH_HI);
}

/** Дошла до цели (или рывок кончился): зависнуть или дальше. После рывка — всегда короткая остановка. */
function arrive(r: Reel, afterDart: boolean): void {
  const c = r.c;
  if (afterDart || rnd(r, 100) < c.hoverP) {
    r.mode = M_HOVER;
    const h = afterDart ? div(c.hover, 2) : c.hover;
    r.timer = div(h, 2) + rnd(r, h + 1) + 1;
  } else {
    newTarget(r);
  }
}

function legacyFishStep(r: Reel): void {
  const c = r.c;
  if (r.mode === M_HOVER) {
    r.fv = toward(r.fv, 0, c.acc);
    if (--r.timer <= 0) newTarget(r);
  } else {
    const dart = r.mode === M_DART;
    const d = r.ft - r.f;
    const cap = dart ? c.dartSpd : c.spd;
    const a = dart ? c.acc * 3 : c.acc;
    // к цели, у самой цели — тише
    r.fv = toward(r.fv, clampI(div(d, 8), -cap, cap), a);
    const ad = d < 0 ? -d : d;
    const av = r.fv < 0 ? -r.fv : r.fv;
    if (ad <= ARRIVE && av <= a * 2) arrive(r, dart);
    else if (dart) {
      if (--r.timer <= 0) arrive(r, true);
    } else if (rnd(r, 10_000) < c.turn) newTarget(r);
  }
  if (r.mode !== M_DART && rnd(r, 10_000) < c.dart) startDart(r);
  r.f += r.fv;
  if (r.f < FISH_LO) {
    r.f = FISH_LO;
    r.fv = 0;
  } else if (r.f > FISH_HI) {
    r.f = FISH_HI;
    r.fv = 0;
  }
}

/** Integer rational approximation of a sine wave (Bhaskara), in -1000…1000. */
function wave(q: number): number {
  const negative = q >= 500;
  const x = (negative ? q - 500 : q) * 2;
  const product = x * (1000 - x);
  const value = div(16 * product * 1000, 5_000_000 - 4 * product);
  return negative ? -value : value;
}

/** A main/main/secondary cadence gives a recognizable species identity without identical loops.
 * All phase lengths, directions and targets use the shared seeded integer generator. */
function patternedFishStep(r: Reel): void {
  const c = r.c;
  if (r.patternTick < 0 && r.timer > 0) { r.timer--; return; }
  // «Последний рывок»: прогресс дошёл до 70 % — сразу новый цикл главного паттерна, быстрее обычного
  const stand = c.stand > 0 && r.stand === 0 && r.patternTick >= 0 && r.p >= STAND_P;
  if (stand) {
    r.stand = 1;
    r.patternTick = r.patternLength;
  }
  if (r.patternTick < 0 || r.patternTick >= r.patternLength) {
    if (r.stand === 1 && !stand) r.stand = 2;
    r.patternTick = 0;
    r.patternLength = div(c.patternPeriod * (80 + rnd(r, 41)), 100);
    r.patternAnchor = r.f;
    r.patternDir = rnd(r, 100) < c.dartUp ? 1 : -1;
    if (r.f < c.lo + div(c.patternAmplitude, 2)) r.patternDir = 1;
    if (r.f > c.hi - div(c.patternAmplitude, 2)) r.patternDir = -1;
    r.patternTarget = r.f;
    r.patternCycle++;
  }
  const q = div(r.patternTick * 1000, r.patternLength);
  const kind = r.stand === 1 ? c.mainPattern : r.patternCycle % 3 === 0 ? c.secondaryPattern : c.mainPattern;
  const a = c.patternAmplitude * r.patternDir;
  const origin = r.patternAnchor;
  let target = origin;
  let speed = c.spd;
  let acceleration = c.acc;
  switch (kind) {
    case 0: // Dash: one decisive burst, with a readable short wind-up.
      target = q < 200 ? origin : origin + a;
      if (q >= 200) { speed = c.dartSpd; acceleration *= 3; }
      break;
    case 1: // FakeDash: commits briefly, then reverses past its starting point.
      target = q < 350 ? origin + div(a, 2) : origin - a;
      speed = c.dartSpd; acceleration *= 3;
      break;
    case 2: { // Sawtooth: steady climb followed by repeated sharp returns.
      const tooth = q * 3 % 1000;
      target = origin + div(a * tooth, 1000);
      speed = tooth < 120 ? c.dartSpd : c.spd;
      acceleration *= 2;
      break;
    }
    case 3: // HoverDash: conspicuous pause followed by one burst.
      target = q < 550 ? origin : origin + a;
      if (q >= 550) { speed = c.dartSpd; acceleration *= 3; }
      break;
    case 4: // SlowMigration: a continuous moving target, no acceleration spike.
      target = origin + div(a * q, 1000);
      break;
    case 5: // EdgeSnapback: approaches an extreme then snaps back to its starting depth.
      target = q < 600 ? (r.patternDir > 0 ? REEL_BAR : 0) : origin;
      if (q >= 600) { speed = c.dartSpd; acceleration *= 3; }
      break;
    case 6: // DoubleDash: two separate pulses with a braking interval.
      target = q < 150 ? origin : q < 600 ? origin + div(a, 2) : origin + a;
      speed = q >= 400 && q < 600 ? div(c.spd, 3) : c.dartSpd;
      acceleration *= 3;
      break;
    case 7: // Wave: smooth reversal, integer-only sine approximation.
      target = origin + div(a * wave(q), 1000);
      break;
    case 8: // Nervous: seeded small target changes, not a cosmetic label.
      if (r.patternTick % 12 === 0) r.patternTarget = origin + div(a * (rnd(r, 1001) - 500), 500);
      target = r.patternTarget;
      acceleration *= 2;
      break;
    case 9: // Ambush: longest stillness, then an abrupt committed attack.
      target = q < 720 ? origin : origin + a;
      if (q >= 720) { speed = div(c.dartSpd * 6, 5); acceleration *= 4; }
      break;
    case 10: { // Breach «Свечка»: стремительно вверх выше привычного, миг на высоте, падение ниже исходной глубины.
      const peak = origin + c.patternAmplitude + div(c.patternAmplitude, 2);
      if (q < 220) { target = peak; speed = c.dartSpd; acceleration *= 3; }
      else if (q < 380) { target = peak; speed = div(c.spd, 3); }
      else if (q < 620) { target = origin - div(c.patternAmplitude, 3); speed = div(c.dartSpd * 4, 5); acceleration *= 2; }
      break;
    }
    case 11: { // Sound «Уход на глубину»: бросок ко дну, упрямое покачивание у самого дна, медленный подъём.
      const floor = div(REEL_BAR, 25);
      if (q < 260) { target = floor; speed = c.dartSpd; acceleration *= 2; }
      else if (q < 760) target = floor + div(c.patternAmplitude * (wave((q * 3) % 1000) + 1000), 8000);
      else speed = div(c.spd, 2);
      break;
    }
    case 12: // Circle «Круги»: два витка волны, размах растёт от трети до полного.
      target = origin + div(div(a * (300 + div(q * 7, 10)), 1000) * wave((q * 2) % 1000), 1000);
      break;
    case 13: // Zigzag «Зигзаг»: шесть коротких бросков то вверх, то вниз.
      target = origin + (div(q * 6, 1000) % 2 === 0 ? div(a, 2) : -div(a, 2));
      speed = c.dartSpd; acceleration *= 2;
      break;
    case 14: { // Jet «Реактивный рывок» (кальмар): набирает воду — выстрел через всю шкалу — скольжение — чернильный обман
      // назад — и снова дрожит на месте. Самый быстрый выстрел у всех: ×3/2 к рывку, разгон ×4.
      const far = a + div(a, 4);
      if (q < 160) { target = origin - div(a, 5); speed = div(c.spd, 2); }
      else if (q < 300) { target = origin + far; speed = div(c.dartSpd * 3, 2); acceleration *= 4; }
      else if (q < 500) { target = origin + a; speed = c.spd; }
      else if (q < 620) { target = origin - div(a, 2); speed = c.dartSpd; acceleration *= 4; }
      else target = origin - div(a, 2) + div(a * wave((q * 4) % 1000), 6000);
      break;
    }
  }
  if (r.stand === 1) speed = div(speed * c.stand, 100);
  r.ft = clampI(target, FISH_LO, FISH_HI);
  // Existing HUD reads mode 2 for burst feedback. Pattern identity lives in config/cycle;
  // keep the public move/hover/dart contract, including a calm arrival at the target.
  r.mode = Math.abs(r.ft - r.f) <= ARRIVE ? M_HOVER : speed > c.spd ? M_DART : M_MOVE;
  r.fv = toward(r.fv, clampI(div(r.ft - r.f, 6), -speed, speed), acceleration);
  r.f = clampI(r.f + r.fv, FISH_LO, FISH_HI);
  if (r.f === FISH_LO || r.f === FISH_HI) r.fv = 0;
  r.patternTick++;
}

function fishStep(r: Reel): void {
  if (r.c.mainPattern >= 0 && r.c.secondaryPattern >= 0) patternedFishStep(r);
  else legacyFishStep(r);
}

/**
 * Скорость после отскока при ударе со скоростью v: медленнее BOUNCE_SOFT — 0 (легла), дальше коэффициент растёт со
 * скоростью и к BOUNCE_FULL доходит до 3/4 — медленно легла не отскакивает, чуть быстрее — едва подпрыгивает, с полной
 * скорости — сильно (с самого верха — почти на половину шкалы).
 */
export function bounceSpeed(v: number): number {
  const k = clampI(v - BOUNCE_SOFT, 0, BOUNCE_FULL - BOUNCE_SOFT);
  return div(v * k * BOUNCE_NUM, (BOUNCE_FULL - BOUNCE_SOFT) * BOUNCE_DEN);
}

/** У самого края шкалы (ближе стольких единиц — 1 %) зона накрывает и край: подмотка у дна рыбу у дна не выпускает */
export const ZONE_EDGE = 1_000;

/** Рыба в зоне; у края шкалы зона накрывает и край (ZONE_EDGE) */
export function zoneCovers(r: Reel): boolean {
  const lo = r.z <= ZONE_EDGE ? 0 : r.z;
  const hi = r.z + r.zone >= REEL_BAR - ZONE_EDGE ? REEL_BAR : r.z + r.zone;
  return r.f >= lo && r.f <= hi;
}

function zoneStep(r: Reel, held: boolean, coast: boolean): void {
  const top = REEL_BAR - r.zone;
  const inZone = zoneCovers(r);
  // водка: только что отпустил — зона по инерции едет с той же скоростью (не тянет вверх и не падает)
  let a = coast ? 0 : held ? ZONE_UP : -ZONE_DOWN;
  if (inZone) a = div(a * ZONE_ASSIST, 10);
  r.zv += a;
  // водка: икота — зону подбрасывает вверх (следующая — через 4…8 с)
  if (r.drunk && r.t === r.hic) {
    r.zv += HIC_KICK;
    r.hic = r.t + HIC_EVERY + hicRnd(r, HIC_EVERY + 1);
  }
  r.z += r.zv;
  r.hit = 0;
  if (r.z < 0) {
    // дно шкалы — как верх: быстро — отскок по инерции (тем сильнее, чем быстрее), медленно — легла на дно; под шкалу не уходит
    const v = bounceSpeed(-r.zv);
    if (v > 0) r.hit = -r.zv;
    r.z = 0;
    r.zv = v;
  } else if (r.z > top) {
    // удар — только с разгона (прижатая к верху зона каждый тик чуть «давит» в него — это не удар)
    if (r.zv > 2 * ZONE_UP) r.hit = -r.zv;
    r.z = top;
    // держишь — прилипла к верху; отпустил — отскок вниз (тоже тем сильнее, чем быстрее)
    r.zv = held ? 0 : -bounceSpeed(r.zv);
  }
}

/** Леска провисла: зона пролежала на дне дольше SLACK_TICKS — улов не подтягивается и тает */
export function reelSlack(r: Reel): boolean {
  return r.rest > SLACK_TICKS;
}

/** Леска натянута: зону держали прижатой к верху дольше TAUT_TICKS — улов не подтягивается и тает */
export function reelTaut(r: Reel): boolean {
  return r.taut > TAUT_TICKS;
}

/** Тянет ли сейчас: рыба в зоне, леска не провисла и не перетянута (иначе прогресс тает) */
export function reelPulling(r: Reel): boolean {
  return r.inZone && r.rest <= SLACK_TICKS && r.taut <= TAUT_TICKS;
}

/** Один тик: рыба, зона (held — держит ли игрок), прогресс. После итога — ничего не меняет. */
export function reelStep(r: Reel, held: boolean): void {
  if (r.done !== 0) return;
  // водка: отпустил — зона ещё DRUNK_LAG тиков едет по инерции с той же скоростью
  let coast = false;
  if (r.drunk) {
    if (held) r.lag = DRUNK_LAG;
    else if (r.lag > 0) {
      r.lag--;
      coast = true;
    }
  }
  fishStep(r);
  zoneStep(r, held, coast);
  // легла на дно шкалы — счёт идёт, пока зону не подмотают (вверх от PUMP; касание вслепую — нет); пока скачет — не идёт
  r.rest = r.zv >= PUMP ? 0 : r.rest > 0 || (r.z === 0 && r.zv === 0) ? r.rest + 1 : 0;
  // прижата к верху (держат кнопку) — зеркально: счёт идёт, пока зону не отпустят вниз быстрее PUMP
  r.taut = r.zv <= -PUMP ? 0 : r.taut > 0 || (r.z === REEL_BAR - r.zone && r.zv === 0) ? r.taut + 1 : 0;
  const was = r.inZone;
  r.inZone = zoneCovers(r);
  if (was && !r.inZone) r.err++;
  const pulling = reelPulling(r);
  r.p += pulling ? REEL_GAIN : -r.c.drain;
  r.t++;
  if (r.p >= REEL_P_MAX) {
    r.p = REEL_P_MAX;
    r.done = 1;
  } else if (r.p <= 0) {
    r.p = 0;
    r.done = -1;
  } else if (r.t >= REEL_MAX_TICKS) {
    r.done = -1;
  }
}

/**
 * Нажатия игрока — номера тиков, с которых кнопка переключается (по возрастанию, первое — «нажал»): держит ли он кнопку
 * на тике t.
 */
export function heldAt(toggles: readonly number[], t: number): boolean {
  let n = 0;
  while (n < toggles.length && toggles[n] <= t) n++;
  return (n & 1) === 1;
}

/**
 * Довести вываживание до тика upTo (не включая) по нажатиям: toggles — все переключения с начала. Возвращает, сколько
 * переключений уже позади (чтобы в следующий раз продолжить с них).
 */
export function reelRun(r: Reel, toggles: readonly number[], upTo: number, from = 0): number {
  let k = from;
  while (r.done === 0 && r.t < upTo) {
    while (k < toggles.length && toggles[k] <= r.t) k++;
    reelStep(r, (k & 1) === 1);
  }
  return k;
}

/**
 * Оценка вываживания по ошибкам (выходам рыбы из зоны), 04.10, владелец: название и множитель опыта за улов; upTo —
 * до скольких ошибок включительно. 8–9 ошибок — тоже «Обычное вываживание» (владелец подтвердил).
 */
export interface ReelGradeInfo {
  readonly name: string;
  readonly xp: number;
  readonly upTo: number;
}
export const REEL_GRADES: readonly ReelGradeInfo[] = [
  { name: 'Идеально', xp: 2.5, upTo: 0 },
  { name: 'Хорошо', xp: 1.5, upTo: 1 },
  { name: 'Сойдёт', xp: 1.25, upTo: 3 },
  { name: 'Обычное вываживание', xp: 1, upTo: 9 },
  { name: 'Ну ты и червь', xp: 0.5, upTo: Number.POSITIVE_INFINITY },
];
/** Номер оценки: 0 — «Идеально» … 4 — «Ну ты и червь» */
export type ReelGrade = 0 | 1 | 2 | 3 | 4;
/** «Обычное вываживание» (×1): опыт без оценки — утешительный, подсчёты */
export const GRADE_PLAIN: ReelGrade = 3;

/** Оценка по числу ошибок */
export function reelGrade(errors: number): ReelGrade {
  const e = Number.isFinite(errors) && errors > 0 ? Math.trunc(errors) : 0;
  return REEL_GRADES.findIndex((g) => e <= g.upTo) as ReelGrade;
}

/** Множитель опыта оценки (неизвестная — ×1) */
export function gradeXp(grade: number): number {
  return REEL_GRADES[grade]?.xp ?? 1;
}

/** Доли для рисования: где рыба и зона (0…1 снизу), прогресс 0…1. */
export function reelView(r: Reel): { fish: number; z0: number; z1: number; p: number } {
  return { fish: r.f / REEL_BAR, z0: r.z / REEL_BAR, z1: (r.z + r.zone) / REEL_BAR, p: r.p / REEL_P_MAX };
}
