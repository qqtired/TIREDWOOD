// Аквапарк «Волна» (выпуск 5, полоса 2.0 — выпуск 6): надувная полоса препятствий на воде к западу и к югу от площади —
// по фану, на время. Общее для сервера и клиента: неподвижные куски (карта собирает из них боксы, клиент рисует надувные
// фигуры), подвижные площадки (паромы, лифт, тонущие подушки), «толкатели» (вертушка и мешки), старт и финиш, сроки
// и доска рекордов. Как всё это двигается и толкает в физике — shared/aquadyn.ts.
// Путь — петлёй «П»: с мостика на запад — подушки, паром, тонущие подушки; на углу батуты на башню, с неё горка на юг,
// вертушка; потом на восток — бревно с мешками, лифт на верхнюю палубу, тумбы вниз, два парома навстречу и финиш.
// Время — по шагам самого игрока (номерам его входов): сошёл с мостика на запад — пошло, встал на финиш — стоп.
// Упал в воду — снова на мостике.
import { TICK_RATE, WATER_Y } from './constants.ts';

/** Версия полосы: новая полоса — новая доска рекордов (хранилище сбрасывает старую и личные лучшие) */
export const AQUA_COURSE = 2;

export type AquaKind = 'pad' | 'deck' | 'step' | 'tower' | 'slide' | 'tramp' | 'beam' | 'disc' | 'pylon' | 'pillar' | 'finish';

/** Неподвижный кусок полосы: что за фигура, прямоугольник сверху (x0 < x1, z0 < z1) и высота верха; низ — под водой */
export interface AquaPiece {
  kind: AquaKind;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  /** Горка: высота нижнего края (верхний — top) и куда она спускается: на запад ('-x') или на юг ('+z') */
  low?: number;
  down?: '-x' | '+z';
  /** Батут: скорость отскока вверх, м/с (слабый — на ступень, сильный — на башню) */
  bounce?: number;
  color: number;
}

/**
 * Подвижная площадка: прямоугольник и верх в покое и сдвиг в крайнем положении. Расписание (тики): стоит в покое
 * rest, плавно едет туда go, стоит там stay, едет обратно back; phase — на сколько тиков позже соседей.
 * Паром ездит по воде, лифт — вверх-вниз, тонущая подушка уходит под воду и всплывает. Снизу площадка — столб
 * до дна: под неё не поднырнуть.
 */
export interface AquaMover {
  kind: 'ferry' | 'lift' | 'sink';
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  dx: number;
  dy: number;
  dz: number;
  rest: number;
  go: number;
  stay: number;
  back: number;
  phase: number;
  color: number;
}

/** Вертушка: в середине площадки-круга столб, вокруг него в обе стороны крутится перекладина по колено */
export interface AquaSweeper {
  x: number;
  z: number;
  /** Верх площадки */
  top: number;
  /** Длина плеча от оси, радиус трубы, низ и верх трубы над площадкой */
  len: number;
  r: number;
  y0: number;
  y1: number;
  /** Оборот, тиков */
  period: number;
}

/** Мешок на верёвке: висит на раме над бревном (точка подвеса), качается поперёк бревна (вдоль z) */
export interface AquaBag {
  x: number;
  z: number;
  /** Высота подвеса, длина верёвки до середины мешка */
  py: number;
  len: number;
  /** Размах, рад; качание туда-обратно, тиков; сдвиг по фазе */
  amp: number;
  period: number;
  phase: number;
}

/** Низ надувных кусков — под водой */
export const AQUA_BOTTOM = WATER_Y - 0.4;
/** Горка — ступеньками по столько (шаг их сглаживает, сверху клиент рисует ровный скат) */
export const SLIDE_STEP = 0.2;

const BLUE = 0x1f7ae0;
const YELLOW = 0xffc61a;
const ORANGE = 0xff7b1c;
const RED = 0xe8402e;
const GREEN = 0x37b956;
const PINK = 0xff5c9e;
const TEAL = 0x18b5a8;

/** Мостик от площади — старт: дощатый, вровень с настилом */
export const AQUA_JETTY = { x0: -34.5, x1: -30, z0: 7.5, z1: 10.5 };

/**
 * Неподвижные куски по пути. Прыжок с разбега — до 6 м и до 1,5 м вверх (с рывком — до 11 м), промежутки — 1,4–1,6 м;
 * на ступень 1,6 м — только со слабого батута, на башню 4 м — только с сильного, на верхнюю палубу 3,2 м — только лифтом.
 */
export const AQUA_PIECES: readonly AquaPiece[] = [
  // разминка: подушки зигзагом и лесенкой вверх
  { kind: 'pad', x0: -38.2, x1: -36.0, z0: 7.9, z1: 10.1, top: -0.45, color: YELLOW },
  { kind: 'pad', x0: -41.9, x1: -39.7, z0: 9.3, z1: 11.5, top: -0.15, color: ORANGE },
  { kind: 'pad', x0: -45.6, x1: -43.4, z0: 6.7, z1: 8.9, top: 0.15, color: GREEN },
  // причалы парома (вода между ними — 12,6 м)
  { kind: 'deck', x0: -49.4, x1: -47.0, z0: 7.6, z1: 10.4, top: -0.4, color: BLUE },
  { kind: 'deck', x0: -64.6, x1: -62.0, z0: 7.6, z1: 10.4, top: -0.4, color: BLUE },
  // за тонущими подушками — площадка, слабый батут, ступень, сильный батут, башня
  { kind: 'deck', x0: -81.6, x1: -78.8, z0: 7.2, z1: 10.8, top: -0.4, color: BLUE },
  { kind: 'tramp', x0: -83.8, x1: -82.2, z0: 8.1, z1: 9.9, top: -0.55, bounce: 12, color: GREEN },
  { kind: 'step', x0: -87.4, x1: -84.8, z0: 6.8, z1: 11.2, top: 1.6, color: YELLOW },
  { kind: 'tramp', x0: -89.2, x1: -87.8, z0: 8.1, z1: 9.9, top: 1.45, bounce: 15.2, color: RED },
  { kind: 'tower', x0: -93.6, x1: -89.6, z0: 7.0, z1: 11.0, top: 4.0, color: YELLOW },
  // горка с башни на юг и площадка под ней
  { kind: 'slide', x0: -93.2, x1: -90.0, z0: 11.0, z1: 23.0, top: 4.0, low: -0.4, down: '+z', color: YELLOW },
  { kind: 'deck', x0: -93.6, x1: -89.6, z0: 23.0, z1: 26.0, top: -0.4, color: BLUE },
  // вертушка: площадка и столб (перекладина — AQUA_SWEEPER)
  { kind: 'disc', x0: -94.6, x1: -88.6, z0: 27.6, z1: 33.6, top: -0.3, color: TEAL },
  { kind: 'pylon', x0: -92.05, x1: -91.15, z0: 30.15, z1: 31.05, top: 1.3, color: RED },
  // площадка, бревно на восток (мешки — AQUA_BAGS), площадка у лифта
  { kind: 'deck', x0: -94.0, x1: -89.2, z0: 35.2, z1: 38.0, top: -0.4, color: BLUE },
  { kind: 'beam', x0: -89.2, x1: -76.2, z0: 36.1, z1: 37.1, top: -0.3, color: RED },
  { kind: 'deck', x0: -76.2, x1: -73.0, z0: 35.2, z1: 38.0, top: -0.4, color: BLUE },
  // верхняя палуба за лифтом и тумбы вниз
  { kind: 'tower', x0: -70.4, x1: -65.6, z0: 34.8, z1: 38.4, top: 3.2, color: ORANGE },
  { kind: 'pillar', x0: -64.0, x1: -62.4, z0: 35.6, z1: 37.2, top: 2.0, color: GREEN },
  { kind: 'pillar', x0: -60.8, x1: -59.2, z0: 36.2, z1: 37.8, top: 0.9, color: PINK },
  // причал двух паромов и финиш (вода между ними — 16,5 м)
  { kind: 'deck', x0: -57.6, x1: -55.1, z0: 35.2, z1: 38.0, top: -0.2, color: BLUE },
  { kind: 'finish', x0: -38.6, x1: -33.8, z0: 34.6, z1: 38.6, top: -0.2, color: BLUE },
];

/** Подвижные площадки. Карта держит под каждую свой бокс (shared/maps/lobby.ts, aquaMovers) — в этом же порядке. */
export const AQUA_MOVERS: readonly AquaMover[] = [
  // паром: 1,1 с у причала, 3,4 с через воду, 1,1 с у другого причала, обратно
  { kind: 'ferry', x0: -51.9, x1: -49.5, z0: 7.8, z1: 10.2, top: -0.4, dx: -10, dy: 0, dz: 0, rest: 66, go: 204, stay: 66, back: 204, phase: 0, color: ORANGE },
  // тонущие подушки: 2,5 с наверху (последние 0,8 с мигают), 0,35 с тонет, 0,8 с под водой, 0,35 с всплывает;
  // каждая — на 0,6 с позже восточной соседки: волна идёт на запад
  { kind: 'sink', x0: -67.8, x1: -66.0, z0: 8.1, z1: 9.9, top: -0.45, dx: 0, dy: -1.95, dz: 0, rest: 150, go: 21, stay: 48, back: 21, phase: 0, color: PINK },
  { kind: 'sink', x0: -71.0, x1: -69.2, z0: 7.4, z1: 9.2, top: -0.45, dx: 0, dy: -1.95, dz: 0, rest: 150, go: 21, stay: 48, back: 21, phase: 36, color: YELLOW },
  { kind: 'sink', x0: -74.2, x1: -72.4, z0: 8.6, z1: 10.4, top: -0.45, dx: 0, dy: -1.95, dz: 0, rest: 150, go: 21, stay: 48, back: 21, phase: 72, color: GREEN },
  { kind: 'sink', x0: -77.4, x1: -75.6, z0: 7.6, z1: 9.4, top: -0.45, dx: 0, dy: -1.95, dz: 0, rest: 150, go: 21, stay: 48, back: 21, phase: 108, color: ORANGE },
  // лифт: 1,1 с внизу (вровень с площадкой), 2 с вверх, 1,1 с наверху (вровень с палубой), 2 с вниз
  { kind: 'lift', x0: -72.9, x1: -70.5, z0: 35.4, z1: 37.8, top: -0.4, dx: 0, dy: 3.6, dz: 0, rest: 66, go: 120, stay: 66, back: 120, phase: 0, color: YELLOW },
  // два парома навстречу: стоят у причала и у финиша, сходятся (там стоят 1 с — пересесть) и расходятся. Со встречи
  // до финиша и с причала до встречи — больше прыжка: дальше только на пароме
  { kind: 'ferry', x0: -55.0, x1: -52.8, z0: 35.5, z1: 37.7, top: -0.2, dx: 4.8, dy: 0, dz: 0, rest: 60, go: 120, stay: 60, back: 120, phase: 0, color: GREEN },
  { kind: 'ferry', x0: -40.9, x1: -38.7, z0: 35.5, z1: 37.7, top: -0.2, dx: -7, dy: 0, dz: 0, rest: 60, go: 120, stay: 60, back: 120, phase: 0, color: PINK },
];

/** Тонущая подушка мигает столько тиков перед тем, как уйти под воду */
export const AQUA_WARN = 48;

/** Вертушка: оборот за 3,6 с, перекладина в обе стороны — каждое место накрывает раз в 1,8 с */
export const AQUA_SWEEPER: AquaSweeper = { x: -91.6, z: 30.6, top: -0.3, len: 4.3, r: 0.22, y0: 0.2, y1: 0.64, period: 216 };

/** Мешки над бревном: качание за 3 с, соседи — на треть качания позже */
export const AQUA_BAGS: readonly AquaBag[] = [
  { x: -85.6, z: 36.6, py: 4.3, len: 3.3, amp: 0.95, period: 180, phase: 0 },
  { x: -82.2, z: 36.6, py: 4.3, len: 3.3, amp: 0.95, period: 180, phase: 60 },
  { x: -78.8, z: 36.6, py: 4.3, len: 3.3, amp: 0.95, period: 180, phase: 120 },
];
/** Мешок: радиус и высота */
export const AQUA_BAG_R = 0.38;
export const AQUA_BAG_H = 1.3;

export const AQUA_FINISH = AQUA_PIECES[AQUA_PIECES.length - 1];
/** Где встаёт упавший в воду: на мостике у старта, лицом к полосе (на запад) */
export const AQUA_RESPAWN = { x: -32.6, z: 9, yaw: Math.PI / 2 };
/** Арки «СТАРТ» (в конце мостика) и «ФИНИШ» (на финишной площадке), кольца над полосой (только для красоты: x, z, середина) */
export const AQUA_START_X = -34.3;
export const AQUA_FINISH_X = -38.0;
export const AQUA_RINGS: ReadonlyArray<{ x: number; z: number; y: number }> = [
  { x: -68.5, z: 8.65, y: 0.6 },
  { x: -58.4, z: 36.8, y: 1.1 },
];
/** Доска «Рекорды полосы» на площади у мостика, лицом на восток */
export const AQUA_BOARD = { x: -28.6, z: 13.6 };
/** Западнее этой линии — полоса: тут препятствия в физике, тут сервер не додумывает шаги */
export const AQUA_NEAR_X = -33;

/** Дольше 10 минут (по шагам) забег не считается */
export const AQUA_MAX_TICKS = 10 * 60 * TICK_RATE;
/** Метка времени входа прыгнула дальше этого (свернул вкладку — шаги не шли, а препятствия ехали) — забег снят */
export const AQUA_PAUSE = TICK_RATE;
/**
 * Время препятствий и шаги забега идут вместе: разошлись больше чем на столько тиков плюс AQUA_SKEW_K от числа шагов
 * (игра подвисала, шла «замедленно» или метку придерживали) — забег снят. Время — по шагам, и подкрутить его,
 * растянув или придержав часы препятствий, можно не больше чем на секунду с небольшим.
 */
export const AQUA_SKEW = TICK_RATE;
export const AQUA_SKEW_K = 0.05;
/** Строк на доске рекордов */
export const AQUA_TOP = 5;
/** Запас по краям зон: желейка шириной 0,84 м стоит на куске, пока хоть краем над ним */
const EDGE = 0.45;

/** Ступенька горки: прямоугольник и высота верха */
export interface SlideStep {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
}

/** Ступеньки горки — от верхнего края вниз; нижняя — ровно вровень с площадкой под горкой. */
export function slideSteps(p: AquaPiece): SlideStep[] {
  const low = p.low ?? p.top;
  const n = Math.max(1, Math.round((p.top - low) / SLIDE_STEP));
  const out: SlideStep[] = [];
  const south = p.down === '+z';
  const len = (south ? p.z1 - p.z0 : p.x1 - p.x0) / n;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const top = last ? low : p.top - ((p.top - low) * (i + 1)) / n;
    if (south) out.push({ x0: p.x0, x1: p.x1, z0: p.z0 + len * i, z1: last ? p.z1 : p.z0 + len * (i + 1), top });
    else out.push({ x0: last ? p.x0 : p.x1 - len * (i + 1), x1: p.x1 - len * i, z0: p.z0, z1: p.z1, top });
  }
  return out;
}

/** Стоит (или прыгает) на мостике старта. */
export function onJetty(x: number, y: number, z: number): boolean {
  const j = AQUA_JETTY;
  return x >= j.x0 - EDGE && x <= j.x1 + 0.3 && z >= j.z0 - EDGE && z <= j.z1 + EDGE && y > -0.3 && y < 2.5;
}

/** Стоит на финишной площадке (на полу, не в прыжке над ней — это проверяют по grounded). */
export function onFinish(x: number, y: number, z: number): boolean {
  const f = AQUA_FINISH;
  return x >= f.x0 - EDGE && x <= f.x1 + EDGE && z >= f.z0 - EDGE && z <= f.z1 + EDGE && Math.abs(y - f.top) < 0.05;
}

/** Упал в воду к западу от площади — встаёт на мостике у старта, а не на площади. */
export function aquaFall(x: number): boolean {
  return x < AQUA_JETTY.x1;
}

/** Время забега по шагам, мс. */
export function aquaMs(steps: number): number {
  return Math.round((steps * 1000) / TICK_RATE);
}

/** «0:21.35» — как секундомер. */
export function fmtAquaTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** Рекорд полосы: чей профиль, ник, время (мс), когда (мс от 1970) */
export interface AquaRecord {
  pid: number;
  nick: string;
  ms: number;
  at: number;
}

/**
 * Новый результат на доску: у каждого — только свой лучший, на доске — AQUA_TOP лучших (при равном времени выше тот,
 * кто раньше). place — какое место занял (−1 — не попал или своего лучшего не побил: доска та же).
 */
export function addRecord(top: readonly AquaRecord[], r: AquaRecord): { top: AquaRecord[]; place: number } {
  const old = top.find((x) => x.pid === r.pid);
  if (old && old.ms <= r.ms) return { top: [...top], place: -1 };
  const next = top.filter((x) => x.pid !== r.pid);
  next.push(r);
  next.sort((a, b) => a.ms - b.ms || a.at - b.at);
  const cut = next.slice(0, AQUA_TOP);
  return { top: cut, place: cut.indexOf(r) };
}
