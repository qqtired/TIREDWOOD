// Аркада: сообщения клиента и сервера (подключены в shared/messages.ts).
//
// Подошёл к корпусу, E → use (точка 'arcade', arg — номер корпуса) → сервер занимает корпус (один игрок на корпус)
// и шлёт arcOpen. Пробел в окне → arc start → arcRun {run, seed}: партию клиент играет у себя по зерну сервера и раз
// в полсекунды шлёт arc log — новые строки журнала ввода (from — сколько строк уже отправлено) и свой счёт s (только
// для экрана соседей, ему не верим). Конец партии (или Esc) → arc end {ticks} → сервер сам переигрывает партию тем же
// модулем из shared/arcade/ и шлёт arcRes со своим счётом, медалью, жетонами и таблицами. Закрыл окно → arc close.
// Всем на набережной — arcCabs: кто за каким корпусом и его живой счёт, лидеры недели по играм.
import type { ArcGameId, ArcLogRow } from './kit.ts';
import type { ArcRow } from './rewards.ts';

export type ArcadeClientMsg =
  | { t: 'arc'; a: 'start' }
  | { t: 'arc'; a: 'log'; run: number; from: number; ev: ArcLogRow[]; s: number }
  | { t: 'arc'; a: 'end'; run: number; ticks: number; s: number }
  | { t: 'arc'; a: 'close' };

export interface ArcBoard {
  week: ArcRow[];
  all: ArcRow[];
}

/** Своё в игре: лучший за всё время и за неделю, партий; жетоны аркады сегодня */
export interface ArcMe {
  best: number;
  week: number;
  runs: number;
  dayCoins: number;
}

export interface ArcResult {
  run: number;
  /** Счёт сервера (он записан) и счёт, который показал экран игрока */
  score: number;
  claimed: number;
  medal: number;
  /** Жетоны: всего и за что */
  coins: number;
  parts: { medal: number; record: number; first: number };
  capped: boolean;
  newBest: boolean;
  /** Место за неделю и за всё время (0 — не в таблице) */
  week: number;
  all: number;
}

/** Корпус на экране соседей: кто играет и его живой счёт (null — свободен, на экране демо) */
export interface ArcCabView {
  nick: string;
  s: number;
}

export type ArcadeServerMsg =
  | { t: 'arcOpen'; cab: number; game: ArcGameId; me: ArcMe; board: ArcBoard; cap: number }
  | { t: 'arcRun'; run: number; seed: number }
  | ({ t: 'arcRes'; me: ArcMe; board: ArcBoard } & ArcResult)
  | { t: 'arcErr'; text: string }
  /** Сервер освободил корпус (отошёл, минута без игры, вышел): окно закрыть */
  | { t: 'arcClose'; cab: number }
  | { t: 'arcCabs'; cabs: Array<ArcCabView | null>; lead: Array<ArcRow | null> };
