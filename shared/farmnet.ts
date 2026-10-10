// Ферма: сообщения клиент ↔ сервер. Клиент шлёт только намерения ({t:'farm', a:…}), сервер считает всё сам и
// отвечает своим прогрессом (farmMe), публичным видом участков (farmPlot), составом (farmRoster) и событиями (farmEv).
// Все действия режима объявлены здесь заранее, чтобы параллельные части (Фургон, заказы, помощь, Древо, колодец)
// не правили этот файл: сервер разбирает их в server/farm/room.ts и отдаёт обработчику своей части.
import type { FarmFail, FarmProgress, HarvestItem } from './farm.ts';
import type { FarmSysMsg } from './farmsys.ts';
import type { Outfit } from './outfit.ts';

export type FarmClientMsg =
  /** Посадить культуру на грядки своего участка (Грабли — несколько сразу) */
  | { t: 'farm'; a: 'plant'; beds: number[]; crop: string }
  /** Полить свои грядки (заряд за каждую) */
  | { t: 'farm'; a: 'water'; beds: number[] }
  /** Собрать спелые грядки */
  | { t: 'farm'; a: 'harvest'; beds: number[] }
  /** Дядюшка Гриб: продать урожай (id культуры или 'truffle') */
  | { t: 'farm'; a: 'sell'; item: string; n: number }
  /** Дядюшка Гриб: вторичный ресурс → опыт фермы */
  | { t: 'farm'; a: 'convert'; res: string; n: number }
  /** «Хозяйство»: купить улучшение (UPGRADES) */
  | { t: 'farm'; a: 'upgrade'; id: string }
  /** Колодец: начать мини-игру (тратит набор воды, сервер отвечает зерном) и закончить (отсчёты x ведра и наклона) */
  | { t: 'farm'; a: 'fillStart' }
  | { t: 'farm'; a: 'fillEnd'; s: number[] }
  /** Помочь соседу: полить его грядки (участок 0–19) */
  | { t: 'farm'; a: 'help'; plot: number; beds: number[] }
  /** Фургон: сдать ящик слота */
  | { t: 'farm'; a: 'van'; slot: number }
  /** Доска заказов: забрать награду или заменить заказ i */
  | { t: 'farm'; a: 'order'; k: 'claim' | 'reroll'; i: number }
  /** Свин: забрать трюфели в сумку */
  | { t: 'farm'; a: 'pig' }
  /** Переехать на свободный участок (не чаще раза в минуту, не дальше 12 м) */
  | { t: 'farm'; a: 'claimPlot'; plot: number }
  /** Обучение Семечкина: закрыть крестиком или начать заново */
  | { t: 'farm'; a: 'tutorial'; k: 'close' | 'open' }
  /** «Хозяйство → Убранство»: надеть титул, рамку, скин инструмента, вещь участка (id из decor или '' — снять) */
  | { t: 'farm'; a: 'look'; slot: 'title' | 'frame' | 'can' | 'shovel' | 'fence' | 'decor'; id: string }
  /** Древо разлома: подобрать шишку-ворчунью */
  | { t: 'farm'; a: 'cone'; id: number };

export type FarmAction = FarmClientMsg['a'];

/** Грядка в публичном виде (чужие видят то же, что хозяин): культура, посадка, созревание, полита ли, сколько помогли */
export interface FarmBedView {
  c: string | null;
  p: number;
  r: number;
  w: boolean;
  h: number;
}

/** Участок для всех на ферме: хозяин (0 — свободен), спит ли, уровень фермы, открытые грядки */
export interface FarmPlotView {
  i: number;
  pid: number;
  nick: string;
  level: number;
  sleeping: boolean;
  beds: FarmBedView[];
  /** Постройки на заднем дворе: свин, пчёлы, компост */
  pig: boolean;
  bees: boolean;
  compost: boolean;
}

/** Кто на ферме: номер в снимках, профиль, общий уровень, одежда, участок */
export interface FarmRosterRow {
  id: number;
  pid: number;
  nick: string;
  level: number;
  o: Outfit;
  plot: number;
}

export type FarmEvent =
  /** Сбор: участок, что выпало, опыт фермы и общий опыт (для полёта иконок и «+XP») */
  | { k: 'harvest'; plot: number; items: HarvestItem[]; xp: number; gx: number; bagFull: boolean }
  | { k: 'plant'; plot: number; beds: number[]; crop: string; paid: number }
  | { k: 'water'; plot: number; beds: number[]; by: number }
  | { k: 'sold'; item: string; n: number; coins: number }
  | { k: 'xp'; n: number; why: string }
  /** Новый уровень фермы и вещи за него (повтор → жетоны) */
  | { k: 'level'; level: number; items: string[]; coins: number }
  | { k: 'upgrade'; id: string }
  /** Шаг обучения закрыт */
  | { k: 'tut'; step: number; xp: number; coins: number }
  /** Колодец: зерно мини-игры (fillStart) и итог (fillEnd: доля и сколько зарядов ×100 налито) */
  | { k: 'fill'; seed: number }
  | { k: 'filled'; share: number; add: number }
  /** Отказ: действие и причина (для подсказки на месте) */
  | { k: 'fail'; a: FarmAction; why: FarmFail | 'far' | 'plot' | 'rate' | 'off' }
  | { k: 'note'; text: string };

export type FarmServerMsg =
  /** Вход на ферму: свой номер в снимках, свой участок, серверное время, все участки, свой прогресс, состав */
  | { t: 'farm'; id: number; plot: number; now: number; plots: FarmPlotView[]; me: FarmProgress; roster: FarmRosterRow[] }
  /** Свой прогресс изменился (now — серверное время ответа: поправка часов для таймеров) */
  | { t: 'farmMe'; now: number; me: FarmProgress }
  | { t: 'farmPlot'; plot: FarmPlotView }
  | { t: 'farmRoster'; list: FarmRosterRow[] }
  | { t: 'farmEv'; e: FarmEvent[] }
  /** Сообщения частей B1 (Фургон, заказы, босс) — shared/farmsys.ts */
  | FarmSysMsg;

/** Для калитки на площади: сколько фермеров и мест */
export interface FarmStatus {
  n: number;
  max: number;
}

/** Флаг сервера FARM: без переменной режим есть только в npm run dev */
export function farmEnabled(raw: string | undefined, dev = false): boolean {
  return raw === '1' || (raw === undefined && dev);
}
