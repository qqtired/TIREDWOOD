// «Общее»: кнопка «Позвать» (О-1), зов в Telegram (О-2), викторина в общем чате (Р-2) и огни букв TIREDWOOD (Н-5).
// Общее для сервера (server/social.ts) и клиента (client/ui/social.ts, client/lobby/social3d.ts): числа правил, сообщения.
// Флаг сервера SOCIAL включает «Позвать», викторину и огни; зов в Telegram — отдельный флаг TG_CALL (только явная 1).
// Решает сервер: частоту зова, награды, буквы. Клиент только показывает.
import type { RoomKind } from './messages.ts';

/** Куда можно позвать: круги сбора (картинг, регата, прятки), арка крепости, «Ракушка» */
export const CALL_KINDS = ['kart', 'boatrace', 'hide', 'fort', 'quiz'] as const;
export type CallKind = (typeof CALL_KINDS)[number];

export function isCallKind(v: unknown): v is CallKind {
  return typeof v === 'string' && (CALL_KINDS as readonly string[]).includes(v);
}

/** on — «зовёт …» (куда), title — короткое имя */
export const CALL_INFO: Readonly<Record<CallKind, { on: string; title: string }>> = {
  kart: { on: 'на картинг', title: 'Картинг' },
  boatrace: { on: 'в регату', title: 'Регата' },
  hide: { on: 'в прятки', title: 'Прятки' },
  fort: { on: 'в крепость', title: 'Крепость' },
  quiz: { on: 'в «Ракушку»', title: 'Ракушка' },
};

/** Один игрок зовёт не чаще раза в столько, мс */
export const CALL_GAP_MS = 2 * 60_000;
/** Плашка «Иду» висит у позванных, мс */
export const CALL_ASK_MS = 30_000;
/** Световой столб над входом, мс */
export const CALL_BEAM_MS = 45_000;
/** Игрок на набережной в одном из этих мест видит у себя «Позвать» */
export const CALL_QUIZ_MIN = 4;

/** Где игрок «сейчас» — для строки в Telegram: «Рома на набережной, зовёт на картинг» */
export const ROOM_PLACE: Readonly<Record<RoomKind, string>> = {
  lobby: 'на набережной',
  paintball: 'на складе',
  race: 'на картинге',
  fort: 'в крепости',
  skill: 'на каланче',
  hide: 'в прятках',
  farm: 'на ферме',
  dungeon: 'в подземелье',
};

// ------------------------------------------------------------ огни букв TIREDWOOD

/** Букв в надписи на горе (client/lobby/tiredwood.ts SIGN_WORD) */
export const LETTER_COUNT = 9;
/** Один режим зажигает не больше стольких букв за вечер */
export const LETTERS_PER_MODE = 2;
/** Все девять — каждому, кто зажигал, жетонов */
export const LETTERS_REWARD = 20;
/** Вечер кончается в 06:00 по Москве: буквы горят до утра */
export const LETTERS_RESET_HOUR = 6;
/** Режимы, чьи совместные партии зажигают буквы */
export const LETTER_MODES = ['kart', 'boatrace', 'hide', 'fort', 'paintball', 'durak', 'billiards'] as const;
export type LetterMode = (typeof LETTER_MODES)[number];

const MSK = 3 * 3600_000;
const DAY = 86_400_000;

/** Номер «вечера»: сутки по Москве, сдвинутые на LETTERS_RESET_HOUR (03:00 → ещё вчерашний вечер) */
export function nightOf(ms: number): number {
  return Math.floor((ms + MSK - LETTERS_RESET_HOUR * 3600_000) / DAY);
}

/** Понедельник 00:00 по Москве той недели, в которую попадает ms */
export function mskWeekStart(ms: number): number {
  const day = Math.floor((ms + MSK) / DAY);
  const dow = (day + 3) % 7; // 0 — понедельник (1 января 1970 — четверг)
  return (day - dow) * DAY - MSK;
}

// ------------------------------------------------------------ сообщения

export type SocialClientMsg =
  /** «Позвать» — в какое место */
  | { t: 'call'; kind: CallKind }
  /** «Иду» на приглашение id — зовущему придёт «идёт» */
  | { t: 'callGo'; id: number }
  /** Выключатель викторины в чате (меню Esc); шлётся при входе и при переключении */
  | { t: 'socPref'; quiz: boolean };

export type SocialServerMsg =
  /** При входе: что включено (call — «Позвать», quiz — викторина) и сколько букв горит */
  | { t: 'social'; call: 1; quiz: 0 | 1; lit: number }
  /** Тебя зовут: id приглашения, куда, кто, на сколько мс */
  | { t: 'callAsk'; id: number; kind: CallKind; nick: string; ms: number }
  /** Световой столб над входом в место kind на ms мс (всем на набережной) */
  | { t: 'callBeam'; kind: CallKind; ms: number }
  /** Когда снова можно звать: sec секунд (0 — зов не ушёл и ждать нечего) */
  | { t: 'callWait'; sec: number }
  /** Горят первые lit букв; boom — зажглась последняя: салют над бухтой */
  | { t: 'letters'; lit: number; boom?: 1 };

/** Все ли буквы горят */
export function allLit(lit: number): boolean {
  return lit >= LETTER_COUNT;
}

/** SOCIAL=1 — включить, SOCIAL=0 — выключить, без переменной — только с --dev (образец — HIDE, FARM) */
export function socialEnabled(env: string | undefined, dev: boolean): boolean {
  return env === undefined ? dev : env === '1';
}

/** TG_CALL — только явная 1, даже в dev (бот пишет настоящим людям; включает владелец) */
export function tgCallEnabled(env: string | undefined): boolean {
  return env === '1';
}
