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
//
// 10.10, прототип (docs/superpowers/plans/2026-10-10-fishing-abilities.md, в игру не подключено): способности мификов и
// божественной — один раз за бой, когда улов впервые дошёл до точки 60…75 % (по своему генератору сида): предупреждение,
// действие, конец. Пять строительных блоков: разлом шкалы (breach — шкала растёт, рыба ныряет в пролом), чернила (ink —
// только экран: модель та же, игрок не видит рыбу), ветер (wind — сила на зону, меняет сторону), мини-шкалы (herring —
// главная шкала стоит, улов медленно откатывается, кнопка ведёт зону мини-шкалы), опасные зоны (teeth — наехал зоной —
// половина улова, второй раз — обрыв). Для острова ещё три: второе дыхание (surge — улов откатывается, рыба быстрее,
// зона меньше), хлыст (whip — удары по зоне раз в несколько секунд), пелена (fog — полосы тумана и стена, только экран).
// dur 0 — эффект до конца боя (срабатывает всё равно один раз). Ещё: fill — время в зоне до поимки, % (120 — на 20 % дольше), wary — рыба чует
// ловушку (зона ждёт у края без рыбы — обходит её), JetHang — реактивный рывок с зависанием наверху. Без этих полей в
// манере модель считает бит в бит как прежде (проверено отпечатком на всех видах).

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
  // 10.10, прототип: реактивный рывок с зависанием наверху (кальмар не дрейфует ко дну — ждать его внизу нельзя)
  'JetHang',
] as const;
export type ReelPattern = typeof REEL_PATTERNS[number];
/** Названия паттернов для игрока (журнал, подсказки) */
export const PATTERN_NAMES: Readonly<Record<ReelPattern, string>> = {
  Dash: 'рывок', FakeDash: 'ложный рывок', Sawtooth: 'пила', HoverDash: 'зависание и рывок', SlowMigration: 'медленный уход',
  EdgeSnapback: 'к краю и назад', DoubleDash: 'двойной рывок', Wave: 'волна', Nervous: 'нервная', Ambush: 'засада',
  Breach: 'свечка', Sound: 'уход на глубину', Circle: 'круги', Zigzag: 'зигзаг', Jet: 'реактивный рывок',
  JetHang: 'реактивный рывок с зависанием',
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
  /** 10.10, прототип: время в зоне до поимки, % от обычного (120 — на 20 % дольше; нет — 100) */
  fill?: number;
  /** Способность (мифик, божественная): один раз за бой; нет — без неё */
  ability?: AbilitySpec;
  /** Стойкость рыбака к способностям, %: их действие на столько короче (уровень рыбалки) */
  abilityResist?: number;
  /** Чует ловушку: зона ждёт у края шкалы без рыбы дольше стольких тиков — рыба её обходит (0 — нет) */
  wary?: number;
  /** Леска провисла / натянута — через столько тиков (нет — SLACK_TICKS / TAUT_TICKS) */
  slack?: number;
  /** С какого улова начинается бой, % (нет — 25) */
  pStart?: number;
}

/** Способности рыб: строительные блоки (см. шапку файла) */
export const ABILITIES = ['breach', 'ink', 'wind', 'herring', 'teeth', 'surge', 'whip', 'fog'] as const;
export type AbilityId = typeof ABILITIES[number];

/**
 * Способность в понятных единицах: проценты шкалы и улова, тики. Общие поля — у всех; остальные — своего блока.
 * Длительности (dur, full, need) режет стойкость рыбака (abilityResist).
 */
export interface AbilitySpec {
  id: AbilityId;
  /** Срабатывает, когда улов впервые дошёл до точки между at[0] и at[1] % (точка — по сиду боя) */
  at: readonly [number, number];
  /** Предупреждение, тики: рыба готовит удар (игра идёт как обычно, клиент показывает, что будет) */
  warn: number;
  /** Сколько действует, тики (0 — до конца боя; у ink, wind, herring — нужно больше 0) */
  dur: number;
  /** breach: шкала растёт на столько % (50); сторона — 1 верх, −1 низ (нет — по сиду); размах рыбы после, % (150) */
  grow?: number;
  side?: 1 | -1;
  ampMul?: number;
  /** breach: шкала срастается обратно за столько тиков (после dur) */
  heal?: number;
  /** ink: сколько тиков чернила закрывают всю шкалу (дальше до dur — стекают сверху вниз); jet — под чернилами выстрел */
  full?: number;
  jet?: boolean;
  /** ink: пока чернила закрывают всю шкалу, катушка молчит — улов не растёт и в зоне (вне зоны тает, как всегда) */
  stall?: boolean;
  /** wind: сила, % от ускорения зоны (35); сколько раз меняет сторону — от turns[0] до turns[1] */
  force?: number;
  turns?: readonly [number, number];
  /** herring, teeth: сколько мелких рыб / зубов */
  count?: number;
  /** herring: столько тиков мелкая рыба в зоне — поймана (30 = 0,5 с; копятся) */
  need?: number;
  /** herring: улов откатывается на столько десятых % в секунду (15 — 1,5 %/с), не ниже floor % */
  rollback?: number;
  floor?: number;
  /** herring: после мелких рыб — один цикл главного паттерна со скоростью ×standAfter/100 (130 — как «последний рывок»; нет — без него) */
  standAfter?: number;
  /** herring: манера мелкой рыбы на мини-шкале (её zone — зона мини-шкалы) */
  minion?: ReelStyle;
  /** teeth: размер зуба, % шкалы; первый укус — минус cut % улова, второй — обрыв */
  size?: number;
  cut?: number;
  /** teeth: зубы остаются на шкале и щёлкают по кругу: острые cycle[0] тиков, тупые cycle[1] (можно проехать), мерцают cycle[2] (сейчас станут острыми); нет — острые всё время */
  cycle?: readonly [number, number, number];
  /** surge: улов падает на drop п. п. (не ниже floor %), рыба быстрее ×spdMul/100, зона ×zoneMul/100 — до конца действия */
  drop?: number;
  spdMul?: number;
  zoneMul?: number;
  /** whip: удар раз в every[0]…every[1] тиков; замах swing тиков (виден); отбрасывает зону на kick % шкалы; вниз — down % ударов */
  every?: readonly [number, number];
  swing?: number;
  kick?: number;
  down?: number;
  /** fog: две полосы по band % плывут drift[0]…drift[1] %/с; раз в wallEvery тиков — стена wall % на wallDur тиков (только экран) */
  band?: number;
  drift?: readonly [number, number];
  wall?: number;
  wallEvery?: number;
  wallDur?: number;
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
  /** Время в зоне до поимки, % (100 — как всегда) */
  fill: number;
  ab: AbilitySpec | null;
  resist: number;
  wary: number;
  slack: number;
  pStart: number;
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
  /** Шкала сейчас: низ и верх, ед. (0 и REEL_BAR; разлом растягивает её в одну сторону) */
  lo: number;
  hi: number;
  /** Где рыбе привычно сейчас и её размах, ед. (разлом расширяет до всей шкалы) */
  hlo: number;
  hhi: number;
  amp: number;
  /** Ветер: сила на зону сейчас, ед./тик² (+ — вверх, − — вниз; 0 — тихо) */
  wind: number;
  /** Прибавка улова при fill ≠ 100: остаток деления */
  pacc: number;
  /** Чует ловушку: у какого края ждёт зона (1 — низ, −1 — верх, 0 — нигде) и сколько тиков без рыбы */
  campSide: number;
  /** «Последний рывок»: множитель скорости, % (свой у рыбы; способность может назначить свой) */
  standMul: number;
  /** Скорость рыбы ×spdMul/100 всегда (второе дыхание; 100 — как есть) */
  spdMul: number;
  camp: number;
  /** Способность: null — у рыбы её нет */
  ab: AbilityState | null;
}

/** Состояние способности в бою (общее для блоков; лишние поля блоку не нужны) */
export interface AbilityState {
  readonly id: AbilityId;
  readonly spec: AbilitySpec;
  /** Порог улова, ед.: дошёл впервые — предупреждение */
  readonly at: number;
  /** 0 — ждёт, 1 — предупреждение, 2 — действует, 3 — позади */
  phase: number;
  /** Тиков в этой фазе */
  t: number;
  /** Сколько действует, тики (со стойкостью; у breach 0 — до конца боя) */
  dur: number;
  /** breach: сторона пролома (1 — верх, −1 — низ); wind: куда дует сейчас (1 — вверх, −1 — вниз) */
  side: number;
  /** wind: тики смены стороны от начала действия; teeth: зубы — пары [низ, верх] подряд, ед. */
  marks: number[];
  /** herring: какая мелкая рыба (0…count), сколько тиков она уже в зоне; teeth: сколько раз укусил */
  n: number;
  hold: number;
  /** herring: мини-шкала мелкой рыбы (своя зона и рыба), null — нет */
  sub: Reel | null;
  /** breach/herring: рыбу ведёт способность — цель, скорость, сколько ещё тиков (0 — рыба сама) */
  ft: number;
  fs: number;
  ftimer: number;
  /** teeth: тик последнего укуса (−1 — не было); касался ли зуба на прошлом тике */
  bit: number;
  touch: boolean;
  /** Свой генератор: способность не сдвигает генератор рыбы — до срабатывания бой идёт как без неё */
  rng: number;
  /** Стойкость рыбака, %: действие короче */
  readonly resist: number;
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
    fill: Math.round(clampI(s.fill ?? 100, 50, 300)),
    ab: s.ability ?? null,
    resist: Math.round(clampI(s.abilityResist ?? 0, 0, 90)),
    wary: Math.round(clampI(s.wary ?? 0, 0, 100_000)),
    slack: Math.round(clampI(s.slack ?? SLACK_TICKS, 1, 600)),
    pStart: Math.round(clampI(s.pStart ?? 25, 1, 99) * (REEL_P_MAX / 100)),
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
    t: 0, f: 0, fv: 0, ft: 0, mode: M_HOVER, timer: 0, z: 0, zv: 0, zone: c.zone, p: c.pStart, done: 0, inZone: true, err: 0, rng: seed | 0, patternTick: -1, patternCycle: 0, patternLength: 0, patternAnchor: 0, patternDir: 1, patternTarget: 0, stand: 0, rest: 0, hit: 0,
    taut: 0, drunk, lag: 0, hic: 0, hr: (seed ^ 0x2545f491) | 0, c,
    lo: 0, hi: REEL_BAR, hlo: c.lo, hhi: c.hi, amp: c.patternAmplitude, wind: 0, pacc: 0, campSide: 0, camp: 0, standMul: c.stand, spdMul: 100, ab: null,
  };
  if (c.ab) r.ab = abilityNew(c.ab, c.resist, seed);
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
  // 3 — рывок назначила способность (король дождался селёдок — и рванул)
  const stand = (c.stand > 0 && r.stand === 0 && r.patternTick >= 0 && r.p >= STAND_P) || r.stand === 3;
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
    if (r.f < r.hlo + div(r.amp, 2)) r.patternDir = 1;
    if (r.f > r.hhi - div(r.amp, 2)) r.patternDir = -1;
    r.patternTarget = r.f;
    r.patternCycle++;
  }
  const q = div(r.patternTick * 1000, r.patternLength);
  const kind = r.stand === 1 ? c.mainPattern : r.patternCycle % 3 === 0 ? c.secondaryPattern : c.mainPattern;
  const amp = r.amp;
  const a = amp * r.patternDir;
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
      target = q < 600 ? (r.patternDir > 0 ? r.hi : r.lo) : origin;
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
      const peak = origin + amp + div(amp, 2);
      if (q < 220) { target = peak; speed = c.dartSpd; acceleration *= 3; }
      else if (q < 380) { target = peak; speed = div(c.spd, 3); }
      else if (q < 620) { target = origin - div(amp, 3); speed = div(c.dartSpd * 4, 5); acceleration *= 2; }
      break;
    }
    case 11: { // Sound «Уход на глубину»: бросок ко дну, упрямое покачивание у самого дна, медленный подъём.
      const floor = r.lo + div(r.hi - r.lo, 25);
      if (q < 260) { target = floor; speed = c.dartSpd; acceleration *= 2; }
      else if (q < 760) target = floor + div(amp * (wave((q * 3) % 1000) + 1000), 8000);
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
    case 15: { // JetHang (10.10, прототип): тот же выстрел через всю шкалу, но наверху кальмар замирает и чуть качается,
      // обманный бросок — лишь на четверть назад, дрожит выше исходной глубины: сам ко дну не дрейфует.
      const far = a + div(a, 4);
      if (q < 140) { target = origin - div(a, 5); speed = div(c.spd, 2); }
      else if (q < 280) { target = origin + far; speed = div(c.dartSpd * 3, 2); acceleration *= 4; }
      else if (q < 560) { target = origin + far + div(a * wave((q * 5) % 1000), 12_000); speed = div(c.spd, 3); }
      else if (q < 680) { target = origin + div(a, 4); speed = c.dartSpd; acceleration *= 4; }
      else target = origin + div(a, 4) + div(a * wave((q * 4) % 1000), 6000);
      break;
    }
  }
  // чует ловушку: зона давно ждёт у края без рыбы — рыба держится по ту сторону её края (дразнит, но не заходит)
  if (c.wary > 0 && r.camp >= c.wary) {
    const gap = div(r.hi - r.lo, 16);
    if (r.campSide > 0 && target < r.z + r.zone + gap) target = r.z + r.zone + gap;
    else if (r.campSide < 0 && target > r.z - gap) target = r.z - gap;
  }
  if (r.stand === 1) speed = div(speed * r.standMul, 100);
  if (r.spdMul !== 100) speed = div(speed * r.spdMul, 100);
  moveFish(r, target, speed, acceleration);
  r.patternTick++;
}

/** Рыба плывёт к цели (не за край шкалы): скорость не больше speed, разгон acceleration */
function moveFish(r: Reel, target: number, speed: number, acceleration: number): void {
  const flo = r.lo + FISH_EDGE;
  const fhi = r.hi - FISH_EDGE;
  r.ft = clampI(target, flo, fhi);
  // Existing HUD reads mode 2 for burst feedback. Pattern identity lives in config/cycle;
  // keep the public move/hover/dart contract, including a calm arrival at the target.
  r.mode = Math.abs(r.ft - r.f) <= ARRIVE ? M_HOVER : speed > r.c.spd ? M_DART : M_MOVE;
  r.fv = toward(r.fv, clampI(div(r.ft - r.f, 6), -speed, speed), acceleration);
  r.f = clampI(r.f + r.fv, flo, fhi);
  if (r.f === flo || r.f === fhi) r.fv = 0;
}

function fishStep(r: Reel): void {
  const ab = r.ab;
  // способность ведёт рыбу (разлом: к краю и в пролом; селёдки: король ждёт) — потом паттерн с нового цикла
  if (ab && ab.ftimer > 0) {
    moveFish(r, ab.ft, ab.fs, r.c.acc * 3);
    if (--ab.ftimer === 0) r.patternTick = r.patternLength;
    return;
  }
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
  const lo = r.z <= r.lo + ZONE_EDGE ? r.lo : r.z;
  const hi = r.z + r.zone >= r.hi - ZONE_EDGE ? r.hi : r.z + r.zone;
  return r.f >= lo && r.f <= hi;
}

function zoneStep(r: Reel, held: boolean, coast: boolean): void {
  const top = r.hi - r.zone;
  const inZone = zoneCovers(r);
  // водка: только что отпустил — зона по инерции едет с той же скоростью (не тянет вверх и не падает)
  let a = coast ? 0 : held ? ZONE_UP : -ZONE_DOWN;
  if (inZone) a = div(a * ZONE_ASSIST, 10);
  // ветер (способность): сила на зону — в одну сторону разгоняет, в другую тормозит; рыба в зоне его не гасит
  r.zv += a + r.wind;
  // водка: икота — зону подбрасывает вверх (следующая — через 4…8 с)
  if (r.drunk && r.t === r.hic) {
    r.zv += HIC_KICK;
    r.hic = r.t + HIC_EVERY + hicRnd(r, HIC_EVERY + 1);
  }
  r.z += r.zv;
  r.hit = 0;
  if (r.z < r.lo) {
    // дно шкалы — как верх: быстро — отскок по инерции (тем сильнее, чем быстрее), медленно — легла на дно; под шкалу не уходит
    const v = bounceSpeed(-r.zv);
    if (v > 0) r.hit = -r.zv;
    r.z = r.lo;
    r.zv = v;
  } else if (r.z > top) {
    // удар — только с разгона (прижатая к верху зона каждый тик чуть «давит» в него — это не удар)
    if (r.zv > 2 * ZONE_UP) r.hit = -r.zv;
    r.z = top;
    // держишь — прилипла к верху; отпустил — отскок вниз (тоже тем сильнее, чем быстрее)
    r.zv = held ? 0 : -bounceSpeed(r.zv);
  }
}

/** Леска провисла: зона пролежала на дне дольше SLACK_TICKS (уровень рыбалки — дольше) — улов не подтягивается и тает */
export function reelSlack(r: Reel): boolean {
  return r.rest > r.c.slack;
}

/** Леска натянута: зону держали прижатой к верху дольше TAUT_TICKS (уровень — дольше) — улов не подтягивается и тает */
export function reelTaut(r: Reel): boolean {
  return r.taut > r.c.slack;
}

/** Тянет ли сейчас: рыба в зоне, леска не провисла и не перетянута (иначе прогресс тает) */
export function reelPulling(r: Reel): boolean {
  return r.inZone && r.rest <= r.c.slack && r.taut <= r.c.slack;
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
  const ab = r.ab;
  if (ab && ab.phase > 0 && ab.phase < 3) {
    // мини-шкалы: главная стоит (король ждёт), кнопка ведёт зону мелкой рыбы, улов медленно откатывается
    if (abilityTick(r, held, coast)) {
      endTick(r);
      return;
    }
  }
  fishStep(r);
  zoneStep(r, held, coast);
  // легла на дно шкалы — счёт идёт, пока зону не подмотают (вверх от PUMP; касание вслепую — нет); пока скачет — не идёт
  r.rest = r.zv >= PUMP ? 0 : r.rest > 0 || (r.z === r.lo && r.zv === 0) ? r.rest + 1 : 0;
  // прижата к верху (держат кнопку) — зеркально: счёт идёт, пока зону не отпустят вниз быстрее PUMP
  r.taut = r.zv <= -PUMP ? 0 : r.taut > 0 || (r.z === r.hi - r.zone && r.zv === 0) ? r.taut + 1 : 0;
  const was = r.inZone;
  r.inZone = zoneCovers(r);
  if (was && !r.inZone) r.err++;
  if (r.c.wary > 0) campStep(r);
  const pulling = reelPulling(r);
  if (ab && ab.phase === 2 && ab.spec.stall && ab.t <= shorten(ab.spec.full ?? 90, ab.resist)) {
    // чернила: катушка молчит — в зоне улов стоит, вне зоны тает
    if (!pulling) r.p -= r.c.drain;
  } else if (!pulling) r.p -= r.c.drain;
  else if (r.c.fill === 100) r.p += REEL_GAIN;
  else {
    // время в зоне до поимки ×fill/100: прибавка за тик REEL_GAIN·100/fill — целыми, остаток копится
    r.pacc += REEL_GAIN * 100;
    const g = div(r.pacc, r.c.fill);
    r.pacc -= g * r.c.fill;
    r.p += g;
  }
  if (ab && ab.phase === 2 && ab.id === 'teeth') teethBite(r, ab);
  // способность: улов впервые дошёл до своей точки — предупреждение (действие — с его концом)
  if (ab && ab.phase === 0 && r.p >= ab.at && r.p < REEL_P_MAX) abilityPhase(r, ab, 1);
  endTick(r);
}

/** Конец тика: время, поймана, сорвалась, леска устала */
function endTick(r: Reel): void {
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

// ------------------------------------------------------------ способности (10.10, прототип)

/** Мелкая рыба мини-шкалы по умолчанию (селёдка): юркая, зона мини-шкалы — 30 % */
export const MINION_DEFAULT: ReelStyle = {
  mainPattern: 'Zigzag', secondaryPattern: 'Nervous', patternPeriod: 120, patternAmplitude: 40, spd: 26, sharp: 8, turn: 10, dart: 8,
  dartSpd: 100, dartUp: 50, hover: 300, hoverP: 30, lo: 10, hi: 90, roam: 30, zone: 30, drain: 1,
};

/** Свой генератор способности: 0…n−1 */
function abRnd(ab: AbilityState, n: number): number {
  ab.rng = (ab.rng + 0x6d2b79f5) | 0;
  return n > 0 ? m32(ab.rng) % n : 0;
}

/** Тики со стойкостью рыбака: короче на resist % (не меньше 1) */
function shorten(ticks: number, resist: number): number {
  return Math.max(1, div(ticks * (100 - resist), 100));
}

function abilityNew(spec: AbilitySpec, resist: number, seed: number): AbilityState {
  const pct = div(REEL_P_MAX, 100);
  const a0 = clampI(Math.round(spec.at[0]), 1, 99);
  const a1 = clampI(Math.round(spec.at[1]), a0, 99);
  const ab: AbilityState = {
    id: spec.id, spec, at: 0, phase: 0, t: 0, dur: spec.dur > 0 ? shorten(spec.dur, resist) : 0, side: 1, marks: [], n: 0, hold: 0, sub: null,
    ft: 0, fs: 0, ftimer: 0, bit: -1, touch: false, rng: (seed ^ 0x51ed270b) | 0, resist,
  };
  (ab as { at: number }).at = a0 * pct + abRnd(ab, (a1 - a0) * pct + 1);
  return ab;
}

/** Рыба и зона — внутри шкалы (шкала срастается после разлома) */
function keepInside(r: Reel): void {
  const flo = r.lo + FISH_EDGE;
  const fhi = r.hi - FISH_EDGE;
  if (r.f < flo) { r.f = flo; r.fv = 0; }
  else if (r.f > fhi) { r.f = fhi; r.fv = 0; }
  r.ft = clampI(r.ft, flo, fhi);
  if (r.z < r.lo) { r.z = r.lo; if (r.zv < 0) r.zv = 0; }
  else if (r.z > r.hi - r.zone) { r.z = r.hi - r.zone; if (r.zv > 0) r.zv = 0; }
}

/** Сила ветра, ед./тик²: force % от среднего ускорения зоны (35 % — 12) */
export function windForce(force: number): number {
  return div((ZONE_UP + ZONE_DOWN) * clampI(Math.round(force), 0, 100), 200);
}

/** Новая мелкая рыба мини-шкалы: в случайном месте выше зоны (зона мини-шкалы — внизу), без стоянки в зоне */
function minionNew(ab: AbilityState): Reel {
  const sub = reelStart(ab.spec.minion ?? MINION_DEFAULT, abRnd(ab, 0x7fff_ffff) ^ Math.imul(ab.n + 1, 0x9e3779b1));
  sub.f = div(REEL_BAR * (45 + abRnd(ab, 41)), 100);
  sub.ft = sub.f;
  sub.timer = 0;
  return sub;
}

/** Способность входит в фазу: 1 — предупреждение, 2 — действие, 3 — позади */
function abilityPhase(r: Reel, ab: AbilityState, phase: number): void {
  const s = ab.spec;
  const c = r.c;
  ab.phase = phase;
  ab.t = 0;
  if (phase === 1) {
    switch (ab.id) {
      case 'breach':
        // акула разгоняется к краю, который пробьёт
        ab.side = s.side ?? (abRnd(ab, 2) === 0 ? 1 : -1);
        ab.ft = ab.side > 0 ? r.hi - FISH_EDGE : r.lo + FISH_EDGE;
        ab.fs = c.dartSpd;
        ab.ftimer = Math.max(1, s.warn);
        break;
      case 'wind':
        ab.side = abRnd(ab, 2) === 0 ? 1 : -1;
        break;
      case 'herring':
        // король замирает и зовёт селёдок
        ab.ft = r.f;
        ab.fs = div(c.spd, 4);
        ab.ftimer = Math.max(1, s.warn);
        break;
      case 'surge':
        // рыба всплывает за воздухом
        ab.ft = r.hi - FISH_EDGE - div(r.hi - r.lo, 10);
        ab.fs = c.spd;
        ab.ftimer = Math.max(1, s.warn);
        break;
      case 'whip':
        // первый замах: куда ударит (вниз — down % ударов)
        ab.side = abRnd(ab, 100) < clampI(s.down ?? 67, 0, 100) ? -1 : 1;
        break;
      case 'teeth': {
        // зубы — сразу на своих местах (растут во время предупреждения): не на зоне и не друг на друге
        const span = r.hi - r.lo;
        const size = div(span * clampI(s.size ?? 8, 2, 30), 100);
        const room = span - 2 * div(span, 16) - size;
        for (let i = 0; i < (s.count ?? 2); i++) {
          for (let k = 0; k < 12; k++) {
            const y = r.lo + div(span, 16) + abRnd(ab, Math.max(1, room));
            const near = y < r.z + r.zone + div(span, 20) && y + size > r.z - div(span, 20);
            let hitOther = false;
            for (let j = 0; j < ab.marks.length; j += 2) if (y < ab.marks[j + 1] + div(span, 25) && y + size > ab.marks[j] - div(span, 25)) hitOther = true;
            if (!near && !hitOther) { ab.marks.push(y, y + size); break; }
          }
        }
        break;
      }
    }
  } else if (phase === 2) {
    switch (ab.id) {
      case 'breach': {
        // пролом: шкала длиннее на grow % в свою сторону, рыба привыкает ко всей шкале и ныряет в пролом
        const g = div((r.hi - r.lo) * clampI(s.grow ?? 50, 0, 200), 100);
        ab.n = g;
        if (ab.side > 0) r.hi += g; else r.lo -= g;
        r.hlo = r.lo;
        r.hhi = r.hi;
        r.amp = div(r.amp * clampI(s.ampMul ?? 150, 50, 300), 100);
        ab.ft = ab.side > 0 ? r.hi - FISH_EDGE - div(g, 8) : r.lo + FISH_EDGE + div(g, 8);
        ab.fs = div(c.dartSpd * 6, 5);
        ab.ftimer = 60;
        break;
      }
      case 'ink':
        // чернила и под ними — выстрел (новый цикл паттерна с того места, где кальмар сейчас)
        if (s.jet) r.patternTick = r.patternLength;
        break;
      case 'wind': {
        const n = (s.turns?.[0] ?? 1) + abRnd(ab, (s.turns?.[1] ?? 2) - (s.turns?.[0] ?? 1) + 1);
        const step = div(ab.dur, n + 1);
        const jitter = div(step, 4);
        for (let i = 1; i <= n; i++) ab.marks.push(step * i - jitter + abRnd(ab, 2 * jitter + 1));
        r.wind = ab.side * windForce(s.force ?? 35);
        break;
      }
      case 'herring':
        ab.n = 0;
        ab.hold = 0;
        ab.sub = minionNew(ab);
        r.zv = 0;
        break;
      case 'surge': {
        // второе дыхание: улов откатывается, рыба быстрее, зона меньше (середина — на месте)
        const floor = div(REEL_P_MAX * clampI(s.floor ?? 10, 0, 90), 100);
        const drop = div(REEL_P_MAX * clampI(s.drop ?? 20, 0, 90), 100);
        if (r.p > floor) r.p = Math.max(floor, r.p - drop);
        const zone = Math.max(div(REEL_BAR, 20), div(r.zone * clampI(s.zoneMul ?? 90, 30, 100), 100));
        r.z += div(r.zone - zone, 2);
        r.zone = zone;
        r.spdMul = clampI(Math.round(s.spdMul ?? 115), 50, 200);
        r.patternTick = r.patternLength;
        keepInside(r);
        break;
      }
      case 'whip':
        whipStrike(r, ab);
        break;
      case 'fog': {
        // две полосы тумана: место и скорость — по сиду; ab.marks = [центр, скорость] ×2
        const half = div(div((r.hi - r.lo) * clampI(s.band ?? 22, 5, 50), 100), 2);
        const d0 = clampI(Math.round(s.drift?.[0] ?? 6), 1, 50);
        const d1 = clampI(Math.round(s.drift?.[1] ?? 9), d0, 50);
        for (let i = 0; i < 2; i++) {
          const c0 = r.lo + half + abRnd(ab, Math.max(1, r.hi - r.lo - 2 * half));
          const v = div(REEL_BAR * (d0 + abRnd(ab, d1 - d0 + 1)), 6000) * (abRnd(ab, 2) === 0 ? 1 : -1);
          ab.marks.push(c0, v);
        }
        ab.n = -1;
        break;
      }
    }
  } else if (phase === 3) {
    ab.ftimer = 0;
    switch (ab.id) {
      case 'breach':
        r.lo = 0;
        r.hi = REEL_BAR;
        r.hlo = c.lo;
        r.hhi = c.hi;
        r.amp = c.patternAmplitude;
        keepInside(r);
        break;
      case 'wind':
        r.wind = 0;
        break;
      case 'herring':
        // селёдки кончились — король снова тянет; леска — с чистого листа
        ab.sub = null;
        r.rest = 0;
        r.taut = 0;
        r.patternTick = r.patternLength;
        if (s.standAfter) {
          r.stand = 3;
          r.standMul = clampI(Math.round(s.standAfter), 100, 200);
        }
        break;
      case 'teeth':
      case 'fog':
        ab.marks = [];
        break;
      case 'surge':
        r.spdMul = 100;
        break;
    }
  }
}

/** Хлыст: удар по зоне (скорость — чтобы её отбросило на kick % шкалы, как если бы рука не мешала), следующий замах */
function whipStrike(r: Reel, ab: AbilityState): void {
  const s = ab.spec;
  const d = div((r.hi - r.lo) * clampI(s.kick ?? 25, 1, 80), 100);
  r.zv += ab.side * Math.floor(Math.sqrt((ZONE_UP + ZONE_DOWN) * d));
  ab.n++;
  ab.bit = r.t;
  const e0 = Math.max(60, Math.round(s.every?.[0] ?? 240));
  const e1 = Math.max(e0, Math.round(s.every?.[1] ?? 360));
  ab.hold = e0 + abRnd(ab, e1 - e0 + 1);
  ab.side = abRnd(ab, 100) < clampI(s.down ?? 67, 0, 100) ? -1 : 1;
}

/** Тик способности (в начале тика): true — главная шкала на этом тике стоит (мини-шкала) */
function abilityTick(r: Reel, held: boolean, coast: boolean): boolean {
  const ab = r.ab!;
  const s = ab.spec;
  if (ab.phase === 1 && ab.t >= s.warn) abilityPhase(r, ab, 2);
  let skip = false;
  if (ab.phase === 2) {
    switch (ab.id) {
      case 'breach': {
        if (ab.dur === 0 || ab.t < ab.dur) break;
        // шкала срастается: пролом закрывается за heal тиков, рыба и зона — внутрь
        const heal = Math.max(1, s.heal ?? 60);
        const k = ab.t - ab.dur + 1;
        if (k >= heal) abilityPhase(r, ab, 3);
        else {
          if (ab.side > 0) r.hi = REEL_BAR + div(ab.n * (heal - k), heal);
          else r.lo = -div(ab.n * (heal - k), heal);
          r.hlo = r.lo;
          r.hhi = r.hi;
          keepInside(r);
        }
        break;
      }
      case 'ink':
        if (ab.t >= ab.dur) abilityPhase(r, ab, 3);
        break;
      case 'teeth':
      case 'surge':
        if (ab.dur > 0 && ab.t >= ab.dur) abilityPhase(r, ab, 3);
        break;
      case 'whip':
        if (ab.dur > 0 && ab.t >= ab.dur) abilityPhase(r, ab, 3);
        else if (--ab.hold <= 0) whipStrike(r, ab);
        break;
      case 'fog': {
        if (ab.dur > 0 && ab.t >= ab.dur) {
          abilityPhase(r, ab, 3);
          break;
        }
        // полосы плывут и отражаются от краёв шкалы; раз в wallEvery тиков — стена посередине между ними
        const half = div(div((r.hi - r.lo) * clampI(s.band ?? 22, 5, 50), 100), 2);
        for (let i = 0; i < 4; i += 2) {
          let c0 = ab.marks[i] + ab.marks[i + 1];
          if (c0 < r.lo + half) { c0 = 2 * (r.lo + half) - c0; ab.marks[i + 1] = -ab.marks[i + 1]; }
          else if (c0 > r.hi - half) { c0 = 2 * (r.hi - half) - c0; ab.marks[i + 1] = -ab.marks[i + 1]; }
          ab.marks[i] = c0;
        }
        const every = Math.max(60, Math.round(s.wallEvery ?? 480));
        const wd = Math.max(1, shorten(s.wallDur ?? 90, ab.resist));
        const wh = div(div((r.hi - r.lo) * clampI(s.wall ?? 50, 10, 90), 100), 2);
        if (ab.t > 0 && ab.t % every === 0) ab.n = clampI(div(ab.marks[0] + ab.marks[2], 2), r.lo + wh, r.hi - wh);
        else if (ab.n >= 0 && ab.t % every >= wd) ab.n = -1;
        break;
      }
      case 'wind':
        if (ab.t >= ab.dur) abilityPhase(r, ab, 3);
        else {
          for (const m of ab.marks) if (m === ab.t) ab.side = -ab.side;
          r.wind = ab.side * windForce(s.force ?? 35);
        }
        break;
      case 'herring': {
        skip = true;
        // король ждёт, улов медленно откатывается (не ниже пола — не сбегает)
        const floor = div(REEL_P_MAX * clampI(s.floor ?? 10, 0, 90), 100);
        const back = div(REEL_P_MAX * clampI(s.rollback ?? 15, 0, 1000) * (100 - ab.resist), 6_000_000);
        if (r.p > floor) r.p = Math.max(floor, r.p - back);
        if (ab.t >= ab.dur) {
          abilityPhase(r, ab, 3);
          break;
        }
        const sub = ab.sub!;
        fishStep(sub);
        zoneStep(sub, held, coast);
        sub.t++;
        if (zoneCovers(sub) && ++ab.hold >= shorten(s.need ?? 30, ab.resist)) {
          ab.n++;
          ab.hold = 0;
          if (ab.n >= (s.count ?? 3)) abilityPhase(r, ab, 3);
          else ab.sub = minionNew(ab);
        }
        break;
      }
    }
  }
  if (ab.phase === 1 || ab.phase === 2) ab.t++;
  return skip;
}

/** Зубы: зона наехала на зуб (с этого тика) — первый раз минус cut % улова, второй — леска перекушена */
function teethTouch(r: Reel, ab: AbilityState): boolean {
  if (teethState(ab) !== 2) return false;
  for (let i = 0; i < ab.marks.length; i += 2) if (r.z < ab.marks[i + 1] && r.z + r.zone > ab.marks[i]) return true;
  return false;
}

/** Зубы сейчас: 2 — острые, 1 — мерцают (сейчас станут острыми), 0 — тупые; без cycle — острые всё действие */
function teethState(ab: AbilityState): number {
  const c = ab.spec.cycle;
  if (!c || ab.phase !== 2) return ab.phase === 2 ? 2 : 0;
  const q = ab.t % Math.max(3, c[0] + c[1] + c[2]);
  return q < c[0] ? 2 : q < c[0] + c[1] ? 0 : 1;
}

function teethBite(r: Reel, ab: AbilityState): void {
  const touch = teethTouch(r, ab);
  if (touch && !ab.touch) {
    ab.n++;
    ab.bit = r.t;
    if (ab.n === 1) r.p -= div(r.p * clampI(ab.spec.cut ?? 50, 0, 100), 100);
    else r.done = -1;
  }
  ab.touch = touch;
}

/** Чует ловушку: у какого края ждёт зона (её середина — в четверти шкалы у края) и сколько тиков там без рыбы */
function campStep(r: Reel): void {
  const mid = r.z + div(r.zone, 2);
  const band = div(r.hi - r.lo, 4);
  const side = mid <= r.lo + band ? 1 : mid >= r.hi - band ? -1 : 0;
  if (side !== r.campSide) {
    r.campSide = side;
    r.camp = 0;
  }
  if (side !== 0 && !r.inZone) r.camp++;
}

/** Леска перекушена (зубы, второй укус) — для надписи итога */
export function reelBitten(r: Reel): boolean {
  return r.ab !== null && r.ab.id === 'teeth' && r.ab.n >= 2;
}

/** Способность для рисования (клиент, модель игрока): доли шкалы — от её низа до верха сейчас */
export interface AbilityView {
  id: AbilityId;
  /** 0 — ждёт, 1 — предупреждение, 2 — действует, 3 — позади */
  phase: number;
  /** Доля фазы 0…1 (у действия до конца боя — 0) */
  k: number;
  /** ink: верх чернил, доля шкалы (1 — закрыта вся, 0 — чисто) */
  ink: number;
  /** wind: куда дует (1 — вверх, −1 — вниз), через сколько тиков сменит сторону (−1 — больше не сменит) */
  wind: number;
  windNext: number;
  /** breach: сторона пролома */
  side: number;
  /** herring: какая мелкая рыба, сколько всего, сколько она уже в зоне из нужного, где она и зона мини-шкалы (0…1) */
  minion: { n: number; count: number; hold: number; need: number; fish: number; z0: number; z1: number } | null;
  /** teeth: зубы [низ, верх] долями шкалы; сколько раз укусил; сейчас: 2 — острые, 1 — мерцают, 0 — тупые */
  teeth: number[];
  bites: number;
  toothState: number;
  /** whip: куда ударит следующий (1 — вверх, −1 — вниз), замах 0…1 (0 — нет замаха), сколько ударов было, тик последнего */
  whipSide: number;
  swing: number;
  strikes: number;
  struckAt: number;
  /** fog: полосы [низ, верх, низ, верх] и стена [низ, верх] (пусто — нет) долями шкалы */
  fog: number[];
  wall: number[];
}

export function abilityView(r: Reel): AbilityView | null {
  const ab = r.ab;
  if (!ab) return null;
  const s = ab.spec;
  const span = r.hi - r.lo;
  const k = ab.phase === 1 ? ab.t / Math.max(1, s.warn) : ab.phase === 2 && ab.dur > 0 ? Math.min(1, ab.t / ab.dur) : 0;
  let ink = 0;
  if (ab.id === 'ink' && ab.phase === 2) {
    const full = shorten(s.full ?? 90, ab.resist);
    ink = ab.t < full ? 1 : Math.max(0, 1 - (ab.t - full) / Math.max(1, ab.dur - full));
  }
  let windNext = -1;
  if (ab.id === 'wind' && ab.phase === 2) for (const m of ab.marks) if (m > ab.t) { windNext = m - ab.t; break; }
  const sub = ab.sub;
  return {
    id: ab.id, phase: ab.phase, k, ink, wind: ab.id === 'wind' && ab.phase > 0 && ab.phase < 3 ? ab.side : 0, windNext, side: ab.side,
    minion: sub ? {
      n: ab.n, count: s.count ?? 3, hold: ab.hold, need: shorten(s.need ?? 30, ab.resist),
      fish: sub.f / REEL_BAR, z0: sub.z / REEL_BAR, z1: (sub.z + sub.zone) / REEL_BAR,
    } : null,
    teeth: ab.marks.length && ab.id === 'teeth' ? ab.marks.map((y) => (y - r.lo) / span) : [],
    bites: ab.id === 'teeth' ? ab.n : 0,
    toothState: ab.id === 'teeth' ? (ab.phase === 1 ? 1 : teethState(ab)) : 0,
    whipSide: ab.id === 'whip' ? ab.side : 0,
    swing: ab.id === 'whip' && ab.phase > 0 && ab.phase < 3 ? whipSwing(ab) : 0,
    strikes: ab.id === 'whip' ? ab.n : 0,
    struckAt: ab.id === 'whip' ? ab.bit : -1,
    fog: ab.id === 'fog' && ab.phase === 2 ? fogBands(r, ab).map((y) => (y - r.lo) / span) : [],
    wall: ab.id === 'fog' && ab.phase === 2 && ab.n >= 0 ? fogWall(r, ab).map((y) => (y - r.lo) / span) : [],
  };
}

/** Хлыст: замах 0…1 (предупреждение — первый замах; дальше — последние swing тиков перед ударом) */
function whipSwing(ab: AbilityState): number {
  const sw = Math.max(1, ab.spec.swing ?? 36);
  if (ab.phase === 1) return Math.min(1, ab.t / Math.max(1, ab.spec.warn));
  return ab.hold <= sw ? 1 - ab.hold / sw : 0;
}

/** Пелена: полосы тумана [низ, верх, низ, верх], ед. */
export function fogBands(r: Reel, ab: AbilityState): number[] {
  const half = div(div((r.hi - r.lo) * clampI(ab.spec.band ?? 22, 5, 50), 100), 2);
  const out: number[] = [];
  for (let i = 0; i < ab.marks.length; i += 2) out.push(ab.marks[i] - half, ab.marks[i] + half);
  return out;
}

/** Пелена: стена [низ, верх], ед. (пусто — нет стены) */
export function fogWall(r: Reel, ab: AbilityState): number[] {
  if (ab.n < 0) return [];
  const wh = div(div((r.hi - r.lo) * clampI(ab.spec.wall ?? 50, 10, 90), 100), 2);
  return [ab.n - wh, ab.n + wh];
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

/**
 * Доли для рисования: где рыба и зона (0…1 снизу), прогресс 0…1. lo, hi — шкала сейчас в долях обычной (0 и 1; после
 * разлома, например, −0,5 и 1): клиент растягивает шкалу на (hi − lo) от обычной, зона в пикселях та же.
 */
export function reelView(r: Reel): { fish: number; z0: number; z1: number; p: number; lo: number; hi: number } {
  return { fish: r.f / REEL_BAR, z0: r.z / REEL_BAR, z1: (r.z + r.zone) / REEL_BAR, p: r.p / REEL_P_MAX, lo: r.lo / REEL_BAR, hi: r.hi / REEL_BAR };
}
