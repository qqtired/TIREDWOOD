// «Подземелье» — договор между симуляцией (shared/dungeon/*), сервером (server/dungeon/*) и клиентом (client/dungeon/*).
// Одна детерминированная симуляция на 30 Гц: клиент играет её у себя (без задержки, с паузой), сервер повторяет её по журналу
// ввода и сам решает волны, жетоны и рекорды. Поэтому в симуляции нет Math.random/sin/cos/hypot/atan2 и Date: только
// +, −, ×, ÷, sqrt, makeRng и sinCos из shared/math.ts. Всё состояние — простые объекты и массивы, без классов и замыканий.
// Этот файл — витрина: типы и функции, которые видят сервер и клиент. Реализация — в соседних файлах shared/dungeon/*.

/** Частота шага симуляции */
export const DG_HZ = 30;
/** Сторона карты-тора, м (края склеены) */
export const DG_MAP = 240;

/** Ввод игрока — журнал событий с номером шага, на котором событие применяется (до шага `t`) */
export type DgEvent =
  /** направление движения: целые −100…100, длина ≤ 100 (0,0 — стоп) */
  | { t: number; k: 'mv'; x: number; y: number }
  /** рывок (Пробел) */
  | { t: number; k: 'dash' }
  /** удар фонарём Q: 1 — нажал (начал заряд), 0 — отпустил (удар) */
  | { t: number; k: 'q'; on: 0 | 1 }
  /** E — постройка рядом (алтарь, сундук, кузня …) */
  | { t: number; k: 'use' }
  /** выбрать карточку i (0…2) в открытом выборе */
  | { t: number; k: 'pick'; i: number }
  /** перебросить карточки */
  | { t: number; k: 'reroll' }
  /** убрать карточку i навсегда */
  | { t: number; k: 'ban'; i: number }
  /** начать следующую волну раньше (Enter в передышке) */
  | { t: number; k: 'go' };

export type DgStage = 'intro' | 'wave' | 'breather' | 'boss' | 'over';

/** Итог забега — его считает сервер по своей копии симуляции */
export interface DgResult {
  /** отбито волн (текущая не в счёт) */
  waves: number;
  /** игровое время до конца последней отбитой волны, мс (без пауз и экранов выбора) */
  ms: number;
  kills: number;
  level: number;
  bosses: number;
  /** кто нанёс последний удар герою (ключ врага) или '' */
  killedBy: string;
  /** урон по оружиям: id оружия → урон */
  dmg: Record<string, number>;
  /** чем кончился забег */
  end: 'death' | 'leave' | 'timeout' | 'running';
}

/** Сообщения режима. Клиент → сервер */
export type DgClientMsg =
  /** кусок журнала: события с индекса `from` (подряд, ≤ 20 штук) и шаг `upto`, до которого клиент дошёл;
   *  `h` — сумма состояния на шаге `upto` (dgHash) для поиска расхождений */
  | { t: 'dg_log'; from: number; ev: DgEvent[]; upto: number; h: number }
  /** пауза (Esc, свёрнутая вкладка) и продолжение — сервер не считает паузу занятостью */
  | { t: 'dg_pause'; on: 0 | 1 }
  /** «Ещё раз» с экрана итогов */
  | { t: 'dg_again' };

/** Сервер → клиент */
export type DgServerMsg =
  /** вход в инстанс: зерно забега и личные рекорды */
  | { t: 'dg_hello'; seed: number; best: number; bestMs: number; weekBest: number }
  /** сервер принял журнал до события `n` (клиент может выбросить подтверждённое); `need` — прислать заново с этого индекса */
  | { t: 'dg_ack'; n: number; need?: number }
  /** волна отбита по серверной копии: жетоны за неё */
  | { t: 'dg_wave'; wave: number; coins: number }
  /** итог забега */
  | { t: 'dg_end'; result: DgResult; coins: number; newBest: boolean; weekRank: number };

/** Строка таблицы рекордов */
export interface DgRec { nick: string; waves: number; ms: number; at: number }

/** Что сервер кладёт в статус набережной для таблички у входа (null — режим выключен флагом) */
export interface DgStatus { top: DgRec[]; week: DgRec[] }
