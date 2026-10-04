// Музыкальный автомат набережной: каталог песен (длины считает сервер — отсюда), цена, очередь, места, громкость по
// расстоянию и сообщения. Автоматов два — на площади и на баке баркаса, очередь у них одна (JUKE_SPOTS). Песни целиком
// синтезирует клиент (client/music/), здесь — только то, что нужно серверу и обоим: номер, название, настроение, темп
// и число тактов.
import { BARKAS, BARKAS_BAK_Y } from './barkas.ts';

/** Песня в каталоге: длина = такты × доли × 60 / темп + хвост (звенит последний аккорд и реверберация) */
export interface JukeSong {
  /** Короткое имя для кода (client/music/songs.ts) */
  id: string;
  title: string;
  mood: string;
  emoji: string;
  bpm: number;
  /** Долей в такте: 4 — 4/4, 3 — вальс */
  meter: number;
  bars: number;
  /** Секунд после последнего такта */
  tail: number;
  /** Цена в жетонах, если не обычная (JUKE_PRICE): особая песня — дороже */
  price?: number;
}

export const JUKE_SONGS: readonly JukeSong[] = [
  { id: 'plombir', title: 'Пломбир на пирсе', mood: 'летний поп', emoji: '🍦', bpm: 112, meter: 4, bars: 48, tail: 2 },
  { id: 'surf', title: 'Чайка на доске', mood: 'серф-рок', emoji: '🏄', bpm: 160, meter: 4, bars: 56, tail: 2 },
  { id: 'mayak', title: 'Сонный маяк', mood: 'лоу-фай', emoji: '🌙', bpm: 78, meter: 4, bars: 28, tail: 2.5 },
  { id: 'crab', title: 'Пиксельный краб', mood: 'чиптюн', emoji: '🦀', bpm: 140, meter: 4, bars: 48, tail: 1 },
  { id: 'bossa', title: 'Кофе на террасе', mood: 'босса-нова', emoji: '☕', bpm: 124, meter: 4, bars: 44, tail: 2 },
  { id: 'waltz', title: 'Вальс для баркаса', mood: 'морской вальс', emoji: '⚓', bpm: 144, meter: 3, bars: 64, tail: 2.5 },
  { id: 'polka', title: 'Кадриль с притопом', mood: 'полька-кадриль', emoji: '🪗', bpm: 128, meter: 4, bars: 48, tail: 1.5 },
  { id: 'sunset', title: 'Закат над бухтой', mood: 'синти-закат', emoji: '🌅', bpm: 96, meter: 4, bars: 40, tail: 3 },
  { id: 'parom', title: 'Последний паром', mood: 'эмо-трэп', emoji: '🖤', bpm: 78, meter: 4, bars: 36, tail: 3, price: 200 },
];

/** Длина песни в секундах (вместе с хвостом) */
export function songSeconds(s: JukeSong): number {
  return (s.bars * s.meter * 60) / s.bpm + s.tail;
}

/** Длина песни в миллисекундах по номеру; −1 — нет такой */
export function songMs(song: number): number {
  const s = JUKE_SONGS[song];
  return s ? Math.round(songSeconds(s) * 1000) : -1;
}

/** «1:34» */
export function fmtSongTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Обычная цена песни в жетонах (особые — дороже, своё поле price) */
export const JUKE_PRICE = 10;

/** Цена песни по номеру (сервер списывает именно её); нет такой песни — обычная */
export function songPrice(song: number): number {
  return JUKE_SONGS[song]?.price ?? JUKE_PRICE;
}

/** Особая песня — дороже обычной: в окне — звёздочка */
export function songSpecial(song: number): boolean {
  return songPrice(song) > JUKE_PRICE;
}
/** Ждут своей очереди не больше стольких песен (без той, что играет) */
export const JUKE_QUEUE_MAX = 5;
/** Тишина между песнями */
export const JUKE_GAP_MS = 2000;
/** Автомат молчал — песня начнётся через столько: все успеют получить сообщение и начать с первой ноты */
export const JUKE_LEAD_MS = 1500;
/** Не чаще одной попытки за столько с одного соединения */
export const JUKE_RATE_MS = 1500;

/**
 * Автомат: на западе площади, в пару доске почёта на востоке, лицом на юг — к точке появления и морю.
 * x, z — середина корпуса у пола; yaw — куда смотрит лицевая сторона (0 — на −Z, как у игрока; π — на юг).
 */
export const JUKEBOX = { x: -8.6, z: -3.2, yaw: Math.PI } as const;
/** Корпус: ширина (по X), глубина (по Z), высота с аркой — он же коллайдер */
export const JUKE_W = 1.36;
export const JUKE_D = 0.78;
export const JUKE_H = 2.05;
/** Где встаёт игрок, чтобы выбрать песню: перед лицевой стороной */
export const JUKE_USE = { x: JUKEBOX.x, z: JUKEBOX.z + JUKE_D / 2 + 0.85, r: 2.2 } as const;
/** Сервер принимает заказ с чуть большего расстояния (задержка сети, игрок отошёл на шаг) */
export const JUKE_SERVER_R = 4.2;
/**
 * Второй автомат — на баркасе «Альбатрос» (shared/barkas.ts): на баке у южного борта, лицом на север (к брашпилю).
 * Очередь и песня — те же, что у автомата на площади (одна музыка на всю набережную, автоматов два); y — палуба бака.
 */
export const JUKEBOX_BARKAS = { x: BARKAS.x - 12.8, y: BARKAS_BAK_Y, z: BARKAS.z + 2.15, yaw: 0 } as const;
export const JUKE_BARKAS_USE = { x: JUKEBOX_BARKAS.x, z: JUKEBOX_BARKAS.z - JUKE_D / 2 - 0.85, r: 1.6 } as const;

/**
 * Оба автомата по порядку (0 — площадь, 1 — баркас): где корпус (y — пол под ним), куда смотрит и где встаёт игрок.
 * Очередь одна: на площади автомат слышно по всей набережной (не тише 40 %), две разные песни звучали бы кашей.
 */
export const JUKE_SPOTS = [
  { x: JUKEBOX.x, y: 0, z: JUKEBOX.z, yaw: JUKEBOX.yaw, use: JUKE_USE },
  { x: JUKEBOX_BARKAS.x, y: JUKEBOX_BARKAS.y, z: JUKEBOX_BARKAS.z, yaw: JUKEBOX_BARKAS.yaw, use: JUKE_BARKAS_USE },
] as const;

/** Номер автомата (в JUKE_SPOTS), у места заказа которого ближе всего точка (x, z) */
export function jukeNearest(x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  JUKE_SPOTS.forEach((s, i) => {
    const d = Math.hypot(x - s.use.x, z - s.use.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Расстояние от (x, z) до места заказа ближнего автомата: сервер принимает заказ, если оно не больше JUKE_SERVER_R */
export function jukeUseDist(x: number, z: number): number {
  const u = JUKE_SPOTS[jukeNearest(x, z)].use;
  return Math.hypot(x - u.x, z - u.z);
}

/**
 * Громкость песни по расстоянию до ближнего автомата: полная до 12 м, дальше плавно до 40 % (к ~42 м) — играет везде,
 * но не оглушает
 */
export const JUKE_NEAR = 12;
export const JUKE_FAR = 42;
export const JUKE_FLOOR = 0.4;
export function jukeGain(dist: number): number {
  if (!(dist > JUKE_NEAR)) return 1;
  if (dist >= JUKE_FAR) return JUKE_FLOOR;
  const k = (dist - JUKE_NEAR) / (JUKE_FAR - JUKE_NEAR);
  const s = k * k * (3 - 2 * k);
  return 1 - (1 - JUKE_FLOOR) * s;
}

/** Строка очереди и песня, что играет: кто поставил (pid — свою отмечаем), start — серверные мс начала */
export interface JukeEntry {
  song: number;
  pid: number;
  nick: string;
}
export interface JukeNow extends JukeEntry {
  start: number;
}
/** Состояние автомата: now — серверные мс в момент отправки (по нему и start клиент считает, какое сейчас место песни) */
export interface JukeView {
  now: number;
  cur: JukeNow | null;
  queue: JukeEntry[];
}

export type JukeClientMsg = { t: 'juke'; song: number };
export type JukeServerMsg =
  | { t: 'juke'; v: JukeView }
  /** Ответ на заказ: ok — песня в очереди (жетоны списаны), иначе — почему нет (жетоны не тронуты) */
  | { t: 'jukeRes'; ok: boolean; text: string };

/** Флаг сервера JUKEBOX: 1 — включить, 0 — выключить, без переменной — только в разработке */
export function jukeboxEnabled(flag: string | undefined, dev: boolean): boolean {
  return flag === undefined ? dev : flag === '1';
}
