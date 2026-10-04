// Голосование «выгнать игрока» (votekick) из меню Tab. Общее для сервера (server/votekick.ts) и клиента
// (client/ui/kickvote.ts, client/ui/online.ts): все числа правила — здесь, в одном месте; итог считает только сервер.
// Клиент шлёт {t:'kick', a:'start', pid} (👢 в списке Tab) и {t:'kick', a:'vote', yes} (Y / N или кнопки), сервер
// рассылает {t:'kickVote'} — каждому своё: может ли он голосовать и как уже проголосовал.

/** Голосование длится, мс */
export const KICK_VOTE_MS = 60_000;
/** Выгоняем, если «за» больше стольких процентов от проголосовавших («за» + «против»; молчание не считается) */
export const KICK_PERCENT = 60;
/** …и «за» не меньше стольких: инициатор и хотя бы ещё один (иначе инициатор один набирает свои 100 %) */
export const KICK_MIN_YES = 2;
/** Выгнанный не может войти столько, мс — по профилю и по IP, хранится в памяти сервера (перезапуск — забыли) */
export const KICK_BAN_MS = 10 * 60_000;
/** Один игрок запускает голосование не чаще, мс */
export const KICK_COOLDOWN_MS = 3 * 60_000;
/** Начать можно, только если в игре хотя бы столько людей — вместе с инициатором и тем, кого выгоняют */
export const KICK_MIN_ONLINE = 3;

/** Хватает ли голосов, чтобы выгнать (целые числа — без ошибок округления на границе 60 %) */
export function kickPasses(yes: number, no: number): boolean {
  return yes >= KICK_MIN_YES && yes * 100 > KICK_PERCENT * (yes + no);
}

/**
 * Итог голосования: 'kick' — выгоняем, 'stay' — остаётся, null — ещё не ясно. pending — сколько ещё могут
 * проголосовать (в игре и не голосовали), timeUp — время вышло. До конца времени решаем, только если проголосовали все
 * или оставшиеся голоса ничего уже не изменят: даже если все они «против» — всё равно выгоняем; даже если все «за» —
 * всё равно нет.
 */
export function kickOutcome(yes: number, no: number, pending: number, timeUp: boolean): 'kick' | 'stay' | null {
  if (timeUp || pending <= 0) return kickPasses(yes, no) ? 'kick' : 'stay';
  if (kickPasses(yes, no + pending)) return 'kick';
  if (!kickPasses(yes + pending, no)) return 'stay';
  return null;
}

/** Ты в голосовании: out — не голосуешь (выгоняют тебя или тебя не было в игре на начало), can — можешь, yes / no — твой голос */
export type KickMe = 'out' | 'can' | 'yes' | 'no';

/** Идущее голосование, как его видит один игрок */
export interface KickVoteView {
  /** Номер голосования */
  id: number;
  /** Кого выгоняют: профиль и ник */
  pid: number;
  nick: string;
  /** Кто предложил */
  by: string;
  yes: number;
  no: number;
  /** Сколько всего голосует: проголосовавшие и те, кто ещё может (ушедший из игры, не проголосовав, не считается) */
  voters: number;
  /** Сколько мс осталось на момент отправки */
  left: number;
  me: KickMe;
}

/** Итог: выгнали или нет и счёт */
export interface KickResult {
  pid: number;
  nick: string;
  kicked: boolean;
  yes: number;
  no: number;
}

export type KickClientMsg =
  | { t: 'kick'; a: 'start'; pid: number }
  | { t: 'kick'; a: 'vote'; yes: boolean };

export type KickServerMsg =
  /** v — идущее голосование (null — нет); on — голосование на сервере включено (при входе); end — только что кончилось */
  | { t: 'kickVote'; v: KickVoteView | null; on?: 1; end?: KickResult };

/** «7 мин», «40 с» — сколько ждать */
export function kickWait(ms: number): string {
  if (ms <= 60_000) return `${Math.max(1, Math.ceil(ms / 1000))} с`;
  return `${Math.ceil(ms / 60_000)} мин`;
}

/** Текст выгнанному (под заголовком «Тебя выгнали»): при кике и когда пробует войти раньше срока */
export function kickedText(left: number, score = ''): string {
  return `Так решили игроки голосованием${score ? ` (${score})` : ''}. Вернуться можно через ${kickWait(left)}.`;
}
