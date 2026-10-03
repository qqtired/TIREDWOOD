// JSON-сообщения протокола: вход, профиль, общий чат, набережная (с дураком и рыбалкой), пейнтбол, картинг.
// Двоичные (ввод и снимки мира) — в protocol.ts.
import type { DurakMode, DurakView } from './durak.ts';
import type { PbReward, RcReward, Stats } from './economy.ts';
import type { FishAlbum, FishSpotView } from './fishing.ts';
import type { FishCastMods, FishProgress } from './fishprogress.ts';
import type { FishTop } from './fishrules.ts';
import type { FcEvent, FcMode, FcResultRow, FcReward, FcRosterRow, FcStatus } from './fight.ts';
import type { FortEvent, FortPlayerRow, FortResultRow, FortStatus, FtReward } from './fort.ts';
import type { Outfit } from './outfit.ts';
import type { BlackjackAct, BlackjackView } from './blackjack.ts';
import type { RaceTrackId } from './racecourse.ts';
import type { SkillServerMsg, SkillStatus } from './skilltest.ts';
import type { BoatRaceServerMsg, BoatRaceStatus } from './boatrace.ts';
import type { HideClientMsg, HideServerMsg, HideStatus } from './hide.ts';
import type { LevelUp } from './levels.ts';
import type { StormView } from './storm.ts';
import type { PirateView } from './pirates.ts';
import type { GatherStatus } from './startzones.ts';
import type { VoiceClientMsg, VoiceServerMsg } from './voice.ts';
import type { GiftClientMsg, GiftServerMsg } from './gifts.ts';
import type { LoadClientMsg, LoadServerMsg } from './loading.ts';

export type RoomKind = 'lobby' | 'paintball' | 'race' | 'fort' | 'fight' | 'skill' | 'boatrace' | 'hide';

export interface RosterEntry {
  id: number;
  level?: number;
  name: string;
  team: 0 | 1;
  bot: boolean;
  k: number;
  d: number;
  a: number;
  ping: number;
  /** Выпавшие на автомате символы (или пусто, если ещё не крутил) */
  reels: number[];
  maxHp: number;
  dmg: number;
  /** Наряд */
  o: Outfit;
}

/** Код закрытия «клиент 20 с ничего не слышал от сервера» (клиент закрывает сам и переподключается) */
export const CLOSE_SILENCE = 4900;

/** Символы однорукого бандита пейнтбола (бонус на раунд) */
export const SLOT_HP = 0;
export const SLOT_ARMOR = 1;
export const SLOT_DAMAGE = 2;
export const SLOT_CHERRY = 3;
export const SLOT_SYMBOLS = ['❤️', '🛡️', '💥', '🍒'] as const;

export interface SlotBonus {
  hp: number;
  armor: number;
  dmg: number;
  jackpot: boolean;
}

/** Строка общего чата. room — где сказано ('' — системная общая), team — цвет ника в пейнтболе (−1 — нет). */
export interface ChatLine {
  from: string;
  pid: number;
  room: RoomKind | '';
  team: number;
  text: string;
  sys: boolean;
}

/** Игрок набережной: id — место в комнате (как в снимке), pid — профиль. */
export interface LobbyPlayerInfo {
  id: number;
  level?: number;
  pid: number;
  nick: string;
  o: Outfit;
}

/** Что сейчас на складе — для экрана над воротами. left — секунд до конца фазы. */
export interface PbStatus {
  phase: number;
  left: number;
  scores: [number, number];
  humans: number;
  names: string[];
}

export interface HonorRow {
  nick: string;
  n: number;
  level?: number;
}

/** Обратная сторона доски почёта — «Последние входы»: столько строк */
export const RECENT_ROWS = 8;

/** Кто был на набережной: on — сейчас в игре, иначе ago — сколько секунд назад ушёл (на момент отправки) */
export interface RecentRow {
  nick: string;
  ago: number;
  on: boolean;
}

export interface HonorInfo {
  rich: HonorRow[];
  wins: HonorRow[];
  lastJackpot: { nick: string; win: number; at: number } | null;
  recent: RecentRow[];
}

export interface OnlineEntry {
  nick: string;
  room: RoomKind;
  level?: number;
}

// --- Дурак за столиками кафе

/**
 * Действие за столом. Аргументы: card — карта; on — для beat номер пары на столе, для tomato стул-цель,
 * для react номер реакции, для mode 0 — подкидной / 1 — переводной, для ready 0 / 1.
 */
export type DurakAct = 'ready' | 'bot' | 'unbot' | 'mode' | 'ante' | 'stake' | 'attack' | 'beat' | 'transfer' | 'take' | 'pass' | 'tomato' | 'react';

/** wait — собираемся, count — отсчёт до раздачи, play — партия, result — итог */
export type DurakPhase = 'wait' | 'count' | 'play' | 'result';

/**
 * Стул стола. k: 0 — пусто, 1 — человек, 2 — бот. id — номер человека на набережной (0 — отошёл).
 * p — номер в партии (−1 — не играет: зритель или пусто). away — сколько мс осталось до замены отошедшего ботом.
 */
export interface DurakSeatView {
  k: 0 | 1 | 2;
  id: number;
  pid: number;
  nick: string;
  o: Outfit | null;
  ready: boolean;
  p: number;
  away: number;
  stake?: boolean;
  wager?: number;
}

/** Открытое состояние стола: видят все на набережной. left — мс до конца отсчёта, хода или показа итога. */
export interface DurakTableView {
  phase: DurakPhase;
  mode: DurakMode;
  /** Стул, который выбирает режим (−1 — никто) */
  modeBy: number;
  left: number;
  seats: DurakSeatView[];
  ante?: number;
  bank?: number;
  game: DurakView | null;
  /** Итог: дурак (номер в партии, −1 — ничья), погоны, кто вышел первым */
  result: { fool: number; ep: boolean; first: number; payouts?: { pid: number; wager: number; payout: number }[] } | null;
}

export type ClientMsg =
  | GiftClientMsg
  | LoadClientMsg
  | VoiceClientMsg
  | HideClientMsg
  /** re — переподключение: код, с которым закрылось прошлое соединение (сервер пишет причину в журнал);
   *  rs — вернуться в ту же сессию после обрыва: сколько JSON-сообщений сессии клиент уже принял */
  | { t: 'hello'; v: number; key?: string; nick?: string; code?: string; smoke?: string; re?: number; rs?: number }
  | { t: 'chat'; text: string }
  /** r — сколько JSON-сообщений сессии клиент принял (сервер забывает подтверждённое) */
  | { t: 'ping'; c: number; r?: number }
  /** Вкладку закрывают или обновляют: не ждать возврата (без него закрытие 1001 — как заморозка вкладки в фоне) */
  | { t: 'bye' }
  /** Ошибка в браузере игрока: текст, где (файл:строка), начало стека, сцена, браузер; n — ник на устройстве (до входа) */
  | { t: 'err'; m: string; at?: string; st?: string; sc?: string; ua?: string; n?: string }
  | { t: 'use'; id: number }
  | { t: 'unuse' }
  | { t: 'emote'; e: number }
  /** Жест вдвоём (k: 0 — «дай пять», 1 — обняться): позвать того, кто перед тобой, или ответить на приглашение */
  | { t: 'pair'; k: number }
  | { t: 'spin' }
  /** «Press F to pay respects» у статуи */
  | { t: 'respect' }
  | { t: 'outfit'; o: Outfit }
  | { t: 'buy'; item: string }
  | { t: 'rename'; nick: string }
  | { t: 'code' }
  | { t: 'leave' }
  | { t: 'pull' }
  /** Рыбалка: забросить, подсечь (n — последнее событие поплавка, которое видел), рыбу — в альбом или продать */
  | { t: 'fish'; a: 'cast' | 'hook' | 'keep' | 'sell'; n?: number }
  /** Рыбак: сервер проверяет близость, цену, заработанную удочку и готовность текущего квеста. */
  | { t: 'fishNpc'; a: 'open' | 'beer' | 'rain' | 'claim' | 'rod'; rod?: number }
  /**
   * Рыбалка 2.0, шкала вываживания: новые переключения кнопки (k — номера тиков, i — номер первого из них с начала),
   * u — до какого тика досчитал у себя, d: 1 — у себя вываживание кончилось на u
   */
  | { t: 'reel'; i: number; k: number[]; u: number; d?: number }
  | { t: 'durak'; table: number; a: DurakAct; card?: number; on?: number }
  | { t: 'blackjack'; table: number; a: BlackjackAct; rev: number; amount?: number }
  | { t: 'kartTrack'; track: RaceTrackId }
  | { t: 'stormLight' }
  | { t: 'lobbyMenu'; open: boolean };

/** События тика пейнтбола (компактные массивы). */
export type GameEvent =
  // выстрел: кто, откуда, куда, чем кончился (0 — стена, 1 — игрок, 2 — в никуда), нормаль стены
  | ['shot', number, number, number, number, number, number, number, number, number, number, number]
  // выстрел из AWP — те же поля, что у 'shot'
  | ['snipe', number, number, number, number, number, number, number, number, number, number, number]
  | ['hit', number, number, number, number, number, number, number]
  // кто, кого, в голову (1/0), чем: 'shot' — маркер, 'awp', 'drown' — в воду, 'self' — /kill
  | ['kill', number, number, number, string]
  | ['spawn', number, number, number, number, number]
  | ['jam', number, number, number]
  // AWP: 1 — подобрал (кто), 0 — снова лежит на кресте
  | ['awp', number, number]
  | ['splash', number, number, number]
  | ['streak', number, number];

// --- Картинг

/** Карт в гонке: id — номер в снимке, color — цвет карта (место на решётке) */
export interface KartInfo {
  id: number;
  level?: number;
  pid: number;
  nick: string;
  bot: boolean;
  o: Outfit;
  color: number;
}

/** Строка итогов: place 0 — не доехал, time и best — мс (0 — нет) */
export interface RaceResultRow {
  id: number;
  nick: string;
  bot: boolean;
  place: number;
  time: number;
  best: number;
  tokens: number;
  /** Отсутствие в старых данных означает первую трассу. */
  track?: RaceTrackId;
}

/**
 * Табло у гаража на набережной. idle — никого, count — отсчёт до старта (n и names — кто в круге), race — гонка
 * (n и names — люди в ней, lap — круг лидера), results — итоги. left — секунд до старта или до конца фазы.
 */
export interface KartStatus {
  phase: 'idle' | 'count' | 'race' | 'results';
  left: number;
  n: number;
  names: string[];
  lap: number;
  laps: number;
  /** Гонка и итоги: карты для табло (позиции — отдельно, в kpos) */
  karts?: BoardKart[];
  track?: RaceTrackId;
  /** Первый вошедший в круг выбирает трассу; id — номер игрока на набережной. */
  hostId?: number;
  hostNick?: string;
}

/**
 * Катер «Ласточка»: ph — стоит (0), посадка (1), в поездке (2) — BP_* из shared/boat.ts; at — тик отплытия (в посадке —
 * когда отплывёт, в поездке — когда отплыл); n — сколько сидит; nick — кто заплатил (капитан).
 */
export interface BoatStatus {
  ph: number;
  at: number;
  n: number;
  nick: string;
}

/** Строка доски «Рекорды полосы» аквапарка: чей профиль (свою строку видно), ник, время, мс */
export interface AquaRow {
  pid: number;
  nick: string;
  ms: number;
}

/** Экран «Топ проигравших» в павильоне автоматов: столько строк */
export const LOSERS_ROWS = 5;

/** Строка «Топа проигравших»: чей профиль (свою строку видно), ник, сколько жетонов проиграл в автоматах (больше нуля) */
export interface LoserRow {
  pid: number;
  nick: string;
  n: number;
}

/** Экран с чатом друзей из Telegram на крыше склада (server/tgfeed.ts): столько последних строк помнят сервер и клиент */
export const TG_KEEP = 30;

/** Строка экрана: id — номер сообщения в чате, name — только имя (first_name, до 20 знаков), text — до 200 знаков, at — когда, мс */
export interface TgLine {
  id: number;
  name: string;
  text: string;
  at: number;
}

/** Карт на табло у гаража */
export interface BoardKart {
  id: number;
  nick: string;
  /** Цвет карта — номер в палитре */
  color: number;
  bot: boolean;
}

/** kpos: чисел на карт — номер, отрезок трассы, круг, место, финишировал (1/0) */
export const KPOS_STRIDE = 5;

export type RaceEvent =
  // ящик, кто взял
  | ['crate', number, number]
  // кто, какой бонус применил
  | ['item', number, number]
  | ['pulse', number, number[]]
  | ['shield', number, number]
  // банка, кто наехал (0 — пропала)
  | ['jam', number, number]
  // кто бросил краску, в кого (0 — некому)
  | ['paint', number, number]
  // кто, место, время мс
  | ['finish', number, number, number]
  // кто, x, z
  | ['splash', number, number, number]
  // сила, x, z
  | ['bump', number, number, number]
  // кто, сила, x, z: удар о бочку, бетонный блок или движущуюся помеху (свой удар клиент видит сразу, по предсказанию)
  | ['hit', number, number, number, number];

/** События набережной: плюх в воду (x, z, id), помидор (стол, со стула, в стул), реакция (стол, стул, номер). */
export type LobbyEvent =
  | ['splash', number, number, number]
  | ['tomato', number, number, number]
  | ['react', number, number, number]
  // за гонщиков болеют у табло (кто)
  | ['cheer', number]
  // жест вдвоём: какой (0 — «дай пять», 1 — обнимашки), кто позвал, кто ответил
  | ['pair', number, number, number]
  // фото у маяка: кто нажал (через 3 с — вспышка)
  | ['photo', number]
  // рыбалка: событие (FE_* в fishing.ts), место, два числа события
  | ['fish', number, number, number, number]
  // отдал честь у статуи (кто), сколько всего раз отдавали
  | ['respect', number, number]
  // аквапарк: вертушка или мешок сбили (где: x, z; кто)
  | ['aqhit', number, number, number];

export type ErrorCode = 'version' | 'need_nick' | 'nick_taken' | 'bad_nick' | 'bad_code' | 'bad_key' | 'replaced' | 'full' | 'rate';

/** Один отдельный улов дня; один игрок может занимать несколько мест. at — серверные миллисекунды. */
export interface FishPodiumCatch {
  pid: number;
  nick: string;
  sp: number;
  g: number;
  at: number;
}

export interface FishBoardView extends FishTop {
  podium: FishPodiumCatch[];
}

/** Снимок места при входе: модификаторы активного заброса нужны и после повторного входа в сцену. */
export interface FishSpotSnapshot extends FishSpotView {
  mods?: FishCastMods;
}

export type ServerMsg =
  | GiftServerMsg
  | LoadServerMsg
  | VoiceServerMsg
  | SkillServerMsg
  | BoatRaceServerMsg
  | HideServerMsg
  | ({ t: 'skillSt' } & SkillStatus)
  | { t: 'brSt'; v: GatherStatus | BoatRaceStatus }
  | { t: 'hideSt'; v: GatherStatus | HideStatus }
  | { t: 'startZone'; kind: 'paintball' | 'fort' | null; left: number }
  | { t: 'storm'; v: StormView }
  | { t: 'pirates'; v: PirateView }
  // --- вход и профиль
  | { t: 'me'; pid: number; nick: string; tokens: number; owned: string[]; outfit: Outfit; stats: Stats; album: FishAlbum; fishing: FishProgress; xp?: number; level?: number; gifts?: boolean; build: string }
  | ({ t: 'levelUp'; pid: number } & LevelUp)
  | { t: 'tokens'; n: number; delay?: number }
  | { t: 'toast'; text: string }
  | { t: 'scene'; scene: RoomKind; epoch: number }
  | { t: 'code'; code: string; until: number }
  | { t: 'restart' }
  /** Возврат в ту же сессию после обрыва принят: следом — всё, что не дошло, сцена у клиента остаётся */
  | { t: 'resumed' }
  | { t: 'error'; text: string; code?: ErrorCode }
  | { t: 'pong'; c: number; k: number }
  // --- общий чат и «кто где»
  | ({ t: 'chat' } & ChatLine)
  | { t: 'chatlog'; list: ChatLine[] }
  | { t: 'online'; list: OnlineEntry[] }
  // --- набережная
  // id — свой номер в снимках, yaw — куда смотреть после появления, rain — идёт ли дождь (1 — да),
  // respects — сколько раз отдавали честь у статуи, aqua — доска рекордов аквапарка, losers — «Топ проигравших»
  | {
    t: 'lobby'; id: number; tick: number; yaw: number; players: LobbyPlayerInfo[]; pool: number; pb: PbStatus; honor: HonorInfo; tables: DurakTableView[];
    blackjack?: BlackjackView;
    skill?: SkillStatus;
    boatrace?: GatherStatus | BoatRaceStatus;
    hide?: GatherStatus | HideStatus;
    kart: KartStatus; fish: FishSpotSnapshot[]; rain: number; respects: number; boat: BoatStatus; aqua: AquaRow[]; losers: LoserRow[];
    /** «Крепость»: что в ней (для подсказки у арки) — только если режим включён флагом сервера */
    fort?: FortStatus;
    /** «Fight Club»: круг у двери в подвал кафе — только если режим включён флагом сервера */
    fc?: FcStatus;
    /** Рыбалка 2.0 (флаг сервера FISH2): 1 — шкала вываживания, полная коллекция, доска рекордов у мостков (ftop) */
    fish2?: number;
    ftop?: FishBoardView;
  }
  // катер «Ласточка» (shared/boat.ts): что с ним — при каждом изменении
  | ({ t: 'boat' } & BoatStatus)
  // аквапарк (shared/aqua.ts): доска рекордов — при каждом изменении; свой забег: пошло время (at — номер своего входа,
  // с которого старт: время идёт по своим шагам), снят (вернулся на мостик, упал в воду, пауза), финиш (время по шагам,
  // свой лучший, место на доске: −1 — не попал)
  | { t: 'aquaTop'; top: AquaRow[] }
  | { t: 'aquaRun'; a: 'start'; at: number }
  | { t: 'aquaRun'; a: 'stop' }
  | { t: 'aquaRun'; a: 'finish'; ms: number; best: number; place: number }
  // «Топ проигравших» в павильоне автоматов — при каждом изменении (докрутились барабаны, кто-то из топа сменил ник)
  | { t: 'losers'; top: LoserRow[] }
  // экран с чатом друзей из Telegram (server/tgfeed.ts): tg — всё сразу (входящему на набережную, экран включили или
  // выключили), tgUp — только новые и исправленные строки (по id), пачкой, не чаще нескольких раз в секунду
  | { t: 'tg'; title: string; lines: TgLine[] }
  | { t: 'tgUp'; title: string; lines: TgLine[] }
  // погода на набережной сменилась: rain — 1, пошёл дождь, 0 — кончился
  | { t: 'weather'; rain: number }
  /** Единое рыболовное событие для всех комнат; until — конец по серверным часам, 0 — постоянный DEV дождь. */
  | { t: 'fishEvent'; on: boolean; until: number }
  | { t: 'fishProgress'; progress: FishProgress; now: number }
  | { t: 'fishNpc'; progress: FishProgress; now: number; open?: boolean; message?: string }
  | { t: 'lroster'; players: LobbyPlayerInfo[] }
  | { t: 'outfitOf'; id: number; o: Outfit; level?: number }
  | { t: 'lev'; e: LobbyEvent[] }
  // тебя зовут на жест вдвоём (id — кто, k — какой) и приглашение снято (отошёл, передумал, 5 с прошло)
  | { t: 'pairAsk'; id: number; nick: string; k: number }
  | { t: 'pairOff'; id: number }
  // вытащил рыбу: что, сколько весит и стоит, новый ли вид, рекорд (best — прежний рекорд, граммы; 0 — не было)
  | { t: 'fishCatch'; sp: number; g: number; price: number; fresh: boolean; record: boolean; best: number }
  // рыбалка 2.0: подсёк — шкала вываживания (вид и сид от сервера; играешь у себя, нажатия — сообщением reel)
  | { t: 'fishReel'; spot: number; sp: number; seed: number; mods: FishCastMods }
  // рыбалка 2.0: вытащил (сервер повторил вываживание): цена (сундук — что в нём, coins), бонус за новый вид, рекорд
  // (best — прежний, граммы), сколько видов в коллекции и собрана ли она этим уловом (full)
  | { t: 'fishLand'; sp: number; g: number; price: number; coins: number; bonus: number; fresh: boolean; record: boolean; best: number; got: number; full: boolean }
  // рыбалка 2.0: доска рекордов у мостков — при изменении
  | { t: 'fishTop'; top: FishBoardView }
  // line — выигравшая строка таблицы выплат автомата m (−1 — ничего)
  | { t: 'slotSpin'; m: number; id: number; nick: string; reels: number[]; win: number; line: number; jackpot: boolean; item: string | null }
  | { t: 'pool'; n: number }
  | ({ t: 'pb' } & PbStatus)
  | ({ t: 'honor' } & HonorInfo)
  | { t: 'durak'; table: number; v: DurakTableView }
  // своя рука — только владельцу
  | { t: 'durakHand'; table: number; cards: number[] }
  | { t: 'blackjack'; v: BlackjackView }
  | { t: 'blackjackError'; message: string; rev: number }
  // --- пейнтбол
  | { t: 'welcome'; id: number; tick: number; team: 0 | 1; seed: number; phase: number; phaseEnd: number; roster: RosterEntry[]; botSkill: string }
  | { t: 'roster'; players: RosterEntry[] }
  | { t: 'ev'; k: number; e: GameEvent[] }
  | { t: 'slot'; reels: number[]; bonus: SlotBonus; auto: boolean }
  | { t: 'round'; phase: number; end: number; scores: [number, number]; winner: number; mvp: number }
  | ({ t: 'pbReward' } & PbReward)
  // --- картинг
  // id — свой номер в снимках
  | { t: 'race'; id: number; tick: number; phase: number; phaseEnd: number; karts: KartInfo[]; track?: RaceTrackId }
  | { t: 'rroster'; karts: KartInfo[] }
  | { t: 'rev'; k: number; e: RaceEvent[] }
  | { t: 'raceEnd'; results: RaceResultRow[]; track?: RaceTrackId }
  | ({ t: 'raceReward' } & RcReward)
  | ({ t: 'kart' } & KartStatus)
  /** Табло у гаража: где карты, 10 раз в секунду, пока идёт гонка (по KPOS_STRIDE чисел на карт, по местам) */
  | { t: 'kpos'; p: number[] }
  /** Гонщикам: за них болеют на набережной */
  | { t: 'cheer'; nick: string }
  // --- крепость (shared/fort.ts): вход (id — свой номер в снимках, wave — какая волна идёт или была последней),
  // состав, события тика, смена фазы, итоги, жетоны; на набережную — что в крепости (раз в секунду, если менялось)
  | { t: 'fort'; id: number; tick: number; seed: number; phase: number; phaseEnd: number; wave: number; players: FortPlayerRow[] }
  | { t: 'froster'; players: FortPlayerRow[] }
  | { t: 'fev'; k: number; e: FortEvent[] }
  | { t: 'fphase'; phase: number; end: number; wave: number }
  | { t: 'fend'; win: boolean; wave: number; mvp: number; rows: FortResultRow[] }
  | ({ t: 'fortReward' } & FtReward)
  | ({ t: 'fortSt' } & FortStatus)
  // --- Fight Club (shared/fight.ts): вход (id — свой номер в снимках, ring — радиус ринга), состав, события тика,
  // смена фазы (win — кто взял раунд: команда или номер бойца, −1 — никто), итоги, жетоны; на набережную — круг у двери
  | { t: 'fcInit'; id: number; mode: FcMode; ring: number; tick: number; phase: number; phaseEnd: number; round: number; wins: number[]; roster: FcRosterRow[] }
  | { t: 'fcRoster'; roster: FcRosterRow[] }
  | { t: 'fcEv'; k: number; e: FcEvent[] }
  | { t: 'fcPhase'; phase: number; phaseEnd: number; round: number; wins: number[]; win: number }
  | { t: 'fcEnd'; mode: FcMode; rows: FcResultRow[] }
  | ({ t: 'fcReward' } & FcReward)
  | ({ t: 'fcSt' } & FcStatus)
