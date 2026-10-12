// Вращение колеса рулетки рыбака: чистая математика без three.js. Сервер присылает выпавшее число и сколько мс осталось
// крутить; отсюда по времени с начала вращения (у всех одинаковому) получаем, где колесо и шарик. В конце шарик лежит
// ровно в лунке этого числа. Рисует по этим кадрам client/lobby/roulette3d.ts; проверки — test/roulette.test.ts.
import { ROULETTE_SPIN_MS, ROULETTE_WHEEL } from '../../shared/roulette.ts';

export const TAU = Math.PI * 2;
/** Угол одной лунки */
export const POCKET = TAU / 37;
/** Радиусы, м: бортик, диск с лунками, дорожка шарика, шарик в лунке */
export const R_RIM = 0.46;
export const R_DISK = 0.36;
export const R_TRACK = 0.41;
export const R_POCKET = 0.27;

/** Колесо делает столько оборотов за вращение, шарик бежит навстречу столько оборотов относительно колеса */
const WHEEL_TURNS = 3.4;
const BALL_TURNS = 8.5;
/** Шарик перестаёт бежать относительно колеса на этой доле вращения, дальше только прыгает по лункам */
const BALL_END = 0.86;
const BALL_POWER = 2;
/** Шарик сходит с дорожки в лунки между этими долями вращения */
const DROP_FROM = 0.5;
const DROP_TO = 0.82;
/** Прыжки по лункам перед остановкой: с какой доли, на сколько лунок, сколько полуволн */
const HOP_FROM = 0.78;
const HOP_POCKETS = 1.7;
const HOP_WAVES = 3;
/** Колесо раскручивается за эту долю вращения (постоянная нарастания скорости) */
const RAMP = 0.035;

/** Угол колеса: доля пути g(u) — интеграл скорости (быстрый разгон, затем плавное торможение до нуля), посчитан один раз */
const TABLE_N = 1024;
const WHEEL_CURVE: Float64Array = (() => {
  const t = new Float64Array(TABLE_N + 1);
  const speed = (u: number): number => (1 - Math.exp(-u / RAMP)) * (1 - u) ** 2;
  let acc = 0;
  for (let j = 1; j <= TABLE_N; j++) {
    acc += (speed((j - 1) / TABLE_N) + speed(j / TABLE_N)) / 2 / TABLE_N;
    t[j] = acc;
  }
  for (let j = 0; j <= TABLE_N; j++) t[j] /= acc;
  return t;
})();

function wheelShare(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const x = u * TABLE_N;
  const j = Math.floor(x);
  return WHEEL_CURVE[j] + (WHEEL_CURVE[j + 1] - WHEEL_CURVE[j]) * (x - j);
}

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** Номер лунки (0…36, по часовой от зеро) для числа n; -1 — такого числа нет */
export function pocketOf(n: number): number {
  return ROULETTE_WHEEL.indexOf(n);
}

/** Угол лунки на колесе, рад (против часовой сверху, как у текстуры колеса) */
export function pocketAngle(n: number): number {
  return pocketOf(n) * POCKET;
}

export interface SpinFrame {
  /** Угол колеса, рад */
  wheel: number;
  /** Угол шарика, рад (в тех же осях) */
  ball: number;
  /** Расстояние шарика от оси колеса, м */
  radius: number;
  /** На сколько шарик подпрыгнул над лункой, м */
  bounce: number;
  /** Доля вращения 0…1 */
  k: number;
  /** Вращение закончилось: шарик лежит в лунке */
  done: boolean;
}

/**
 * Кадр вращения. n — выпавшее число, w0 — угол колеса в начале, elapsed — мс с начала вращения (до 0 — стоит, после
 * total — лежит в лунке), total — сколько всего длится вращение (ROULETTE_SPIN_MS).
 */
export function spinFrame(n: number, w0: number, elapsed: number, total = ROULETTE_SPIN_MS): SpinFrame {
  const u = Math.min(1, Math.max(0, elapsed / total));
  const pocket = pocketAngle(n);
  const wheel = w0 + WHEEL_TURNS * TAU * wheelShare(u);
  // шарик относительно колеса: из далёкого «позади» — в лунку, у конца прыгает по соседним лункам
  const run = u < BALL_END ? (1 - u / BALL_END) ** BALL_POWER : 0;
  let hop = 0;
  if (u > HOP_FROM) {
    const x = (u - HOP_FROM) / (1 - HOP_FROM);
    hop = HOP_POCKETS * POCKET * (1 - x) ** 2 * Math.sin(Math.PI * HOP_WAVES * x);
  }
  const ball = wheel + pocket + BALL_TURNS * TAU * run + hop;
  const radius = R_TRACK - (R_TRACK - R_POCKET) * smooth((u - DROP_FROM) / (DROP_TO - DROP_FROM));
  const hopping = u > 0.7 && u < 0.97;
  const bounce = hopping ? Math.abs(Math.sin((u - 0.7) * 38)) * 0.022 * (1 - (u - 0.7) / 0.27) : 0;
  return { wheel, ball, radius, bounce, k: u, done: elapsed >= total };
}

/** Угол колеса в конце вращения при начальном w0 — туда колесо встаёт и крутится дальше тихо */
export function spinEndWheel(w0: number): number {
  return w0 + WHEEL_TURNS * TAU;
}

/**
 * Начало вращения в локальных часах: сервер прислал, что до конца left мс; письмо шло latency мс (сеть в одну сторону),
 * поэтому в момент отправки до конца оставалось left, а сейчас — на latency меньше. Возвращает локальное время
 * (performance.now) начала вращения: по нему все видят одну и ту же картину.
 */
export function spinStartAt(now: number, left: number, latency: number, total = ROULETTE_SPIN_MS): number {
  return now - latency + left - total;
}
