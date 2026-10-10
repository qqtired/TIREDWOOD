// Ферма: мини-игра «Набери лейку» (design-v11 §7). Одна и та же одномерная модель крутится и у клиента (рисует и считает
// процент на экране), и у сервера (переигрывает отсчёты со своим зерном и сам решает, сколько налито). Клиент шлёт
// только ввод — на каждый тик 30 Гц пару (x ведра 0–1000, хочу наклон 0–1); скорость ведра и наклон ограничивает
// сама модель, горлышко лейки качается по зерну сервера, поэтому «записать идеальную игру» заранее и подсунуть
// не выйдет, а мгновенный наклон или телепорт ведра просто обрезаются. Владелец файла — часть B4.

/** Сколько тиков в секунду шлёт и считает модель */
export const WELL_HZ = 30;
const DT = 1 / WELL_HZ;

/** Числа дизайна §7.1; всё, что про поле, — в долях его ширины (поле 0–1) */
export const WELL = {
  /** Наклон ведра 0 → 90° и обратно, секунд */
  tiltUp: 0.8,
  tiltDown: 0.4,
  /** Струя уходит вправо на столько ширин поля при полном наклоне */
  shift: 0.25,
  /** Горлышко лейки, амплитуда и период (с) его качания */
  mouth: 0.18,
  amp: 0.3,
  periodMin: 2.5,
  periodMax: 4,
  /** Налив длится не дольше, ведро пустеет при полном наклоне за empty с, пауза без наклона — не дольше release с */
  duration: 10,
  empty: 4,
  release: 1.5,
  /** Ведро всегда полнее лейки (§7): воды в нём 1,35 лейки */
  bucket: 1.35,
  /** Ждём начала налива не дольше (дальше попытка пуста) */
  ready: 12,
  /** Предел скорости ведра за мышью, ширин поля в секунду (человек машет ≈ 2,7 — от резкого рывка это не мешает) */
  speed: 2.5,
  /** Где ведро может стоять над корытом */
  xMin: 0.05,
  xMax: 0.95,
  /** Толщина струи (доля поля): тонкая при слабом наклоне, толстая при полном */
  streamMin: 0.005,
  streamAdd: 0.032,
  /** Наклон, с которого налив начался, и с которого струя считается льющейся */
  start: 0.02,
  pour: 0.05,
  /** Окно закрывается само после конца налива (с) */
  closeAfter: 1,
} as const;

/** Отсчёты x приходят целым числом 0…WELL_X: так короче по сети (лимит сообщения 16 КБ) */
export const WELL_X = 1000;
/** Самая длинная попытка: ожидание + налив + запас; пары (x, наклон) */
export const WELL_MAX_TICKS = Math.ceil((WELL.ready + WELL.duration + 1) * WELL_HZ);
export const WELL_MAX_SAMPLES = WELL_MAX_TICKS * 2;
/** Доля без движения мышью (§7.1: «Зажал и не двигал мышь — 25–35 %»): выше стоящему не дадим */
export const WELL_AFK_SHARE = 0.3;
/** Стоял на месте: мышь за налив ушла меньше чем на AFK_RANGE ширины поля, а наклон почти не менялся (суммарно ≤ AFK_TILT) */
const AFK_RANGE = 0.08;
const AFK_TILT = 3;
/** Сколько секунд игры можно «пересчитать» сверх реального времени с fillStart (часы, пакет) */
const TIME_SLACK_MS = 2000;

export type WellPhase = 'ready' | 'play' | 'done';
/** Почему налив кончился */
export type WellEnd = 'full' | 'empty' | 'time' | 'release' | 'idle';

/** Качание горлышка по зерну */
export interface WellCan {
  period: number;
  phase: number;
  j1: number;
  j2: number;
}

export interface WellSim {
  can: WellCan;
  phase: WellPhase;
  /** Секунд с открытия окна и с начала налива */
  t: number;
  playT: number;
  /** Ведро над корытом (доля поля) и его наклон 0–1 */
  x: number;
  tilt: number;
  /** Воды в ведре (лейка = 1) */
  bucket: number;
  /** Налито в лейку, 0–1 */
  fill: number;
  /** Секунд без наклона подряд (после начала налива) */
  idle: number;
  /** Струя попала в горлышко на этом тике */
  hit: boolean;
  /** Куда падает струя (доля поля) */
  stream: number;
  /** Куда тянула мышь за налив (от и до, доля поля) и сколько менялся наклон: по ним ловим «зажал и ушёл» */
  wantLo: number;
  wantHi: number;
  tiltTravel: number;
  end: WellEnd | null;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Рисунок качания — только от зерна, которое выдал сервер */
export function wellCan(seed: number): WellCan {
  const r = mulberry32(Number.isFinite(seed) ? Math.floor(seed) : 0);
  return {
    period: WELL.periodMin + r() * (WELL.periodMax - WELL.periodMin),
    phase: r() * Math.PI * 2,
    j1: r() * Math.PI * 2,
    j2: r() * Math.PI * 2,
  };
}

/** Где горлышко в момент t (доля поля): синусоида и лёгкое дрожание */
export function mouthAt(can: WellCan, t: number): number {
  return 0.5 + WELL.amp * Math.sin((Math.PI * 2 * t) / can.period + can.phase) + 0.0037 * Math.sin(t * 9.1 + can.j1) + 0.0024 * Math.sin(t * 5.3 + can.j2);
}

/** Ширина струи (доля поля) при наклоне tilt */
export function streamWidth(tilt: number): number {
  return WELL.streamMin + tilt * WELL.streamAdd;
}

export function newWell(seed: number): WellSim {
  return {
    can: wellCan(seed), phase: 'ready', t: 0, playT: 0, x: 0.5, tilt: 0, bucket: WELL.bucket, fill: 0, idle: 0, hit: false,
    stream: 0.5, wantLo: 1, wantHi: 0, tiltTravel: 0, end: null,
  };
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Один тик (1/30 с). wantX — куда мышь тянет ведро (0–1), wantTilt — как сильно наклонять (0–1; клиент шлёт 0 или 1).
 * Ведро едет за мышью не быстрее WELL.speed, наклон меняется не быстрее 1/0,8 с вверх и 1/0,4 с вниз — это и есть
 * проверка честности: любой ввод приводится к тому, что рука физически может сделать.
 */
export function stepWell(s: WellSim, wantX: number, wantTilt: number): void {
  if (s.phase === 'done') return;
  s.t += DT;
  const tx = Number.isFinite(wantX) ? clamp(wantX, WELL.xMin, WELL.xMax) : s.x;
  const dx = clamp(tx - s.x, -WELL.speed * DT, WELL.speed * DT);
  s.x += dx;
  const was = s.tilt;
  const wt = Number.isFinite(wantTilt) ? clamp(wantTilt, 0, 1) : 0;
  s.tilt = clamp(wt, was - DT / WELL.tiltDown, was + DT / WELL.tiltUp);
  if (s.phase === 'play') {
    s.wantLo = Math.min(s.wantLo, tx);
    s.wantHi = Math.max(s.wantHi, tx);
    s.tiltTravel += Math.abs(s.tilt - was);
  }
  s.hit = false;
  s.stream = s.x + s.tilt * WELL.shift;
  if (s.phase === 'ready') {
    if (s.tilt <= WELL.start) {
      if (s.t >= WELL.ready) { s.phase = 'done'; s.end = 'idle'; }
      return;
    }
    s.phase = 'play';
  }
  s.playT += DT;
  // ведро льёт; в лейку попадает только струя, угодившая в горлышко
  const use = Math.min((s.tilt * WELL.bucket * DT) / WELL.empty, s.bucket);
  s.bucket -= use;
  if (s.tilt > WELL.pour) {
    s.idle = 0;
    s.hit = Math.abs(s.stream - mouthAt(s.can, s.t)) < WELL.mouth / 2 + streamWidth(s.tilt) / 4;
    if (s.hit) s.fill = Math.min(1, s.fill + use);
  } else s.idle += DT;
  if (s.fill >= 1) s.end = 'full';
  else if (s.bucket <= 1e-4) s.end = 'empty';
  else if (s.playT >= WELL.duration) s.end = 'time';
  else if (s.idle > WELL.release) s.end = 'release';
  if (s.end) s.phase = 'done';
}

/** Стоял без дела: мышь не двигалась и наклон не менялся (зажал ЛКМ и ушёл) */
export function wellAfk(s: WellSim): boolean {
  return s.wantHi - s.wantLo < AFK_RANGE && s.tiltTravel < AFK_TILT;
}

/**
 * Доля лейки 0–1 по зерну попытки и отсчётам клиента (пары: x 0–1000, наклон 0–1). Сервер зовёт её на fillEnd.
 * elapsedMs (необязательно) — сколько прошло с fillStart: больше игрового времени, чем реального, не засчитываем.
 */
export function wellShare(seed: number, samples: readonly number[], elapsedMs?: number): number {
  const s = newWell(seed);
  let n = Math.min(Math.floor(samples.length / 2), WELL_MAX_TICKS);
  if (elapsedMs !== undefined && Number.isFinite(elapsedMs)) n = Math.min(n, Math.max(0, Math.floor(((elapsedMs + TIME_SLACK_MS) * WELL_HZ) / 1000)));
  for (let i = 0; i < n && s.phase !== 'done'; i++) stepWell(s, Number(samples[i * 2]) / WELL_X, Number(samples[i * 2 + 1]));
  const share = clamp(s.fill, 0, 1);
  return wellAfk(s) ? Math.min(share, WELL_AFK_SHARE) : share;
}
