// Свои лодки рыбака (флаг сервера ISLE, нужна FISH2): три лодки у Деда Семёна — таблица, кому что можно купить и что
// записано в профиле. Дизайн — docs/superpowers/plans/2026-10-10-fishing-island.md §3 и .json (boats, boatRules): числа
// оттуда. Езда, стоянка и сеть — shared/ownboat.ts, сервер — server/lobby/ownboats.ts, клиент — client/boat/.
// Профиль: fishing.boats — купленные лодки (id); в старых сохранениях поля нет — лодок нет (shared/fishprogress.ts).
// Лайвел (садок, пакет лайвела shared/fishlivewell.ts) берёт отсюда вместимость по лучшей купленной лодке.

export type BoatId = 'volzhanka' | 'albakor' | 'northsilver';

/** Место в лодке в её осях (three.js: x — правый борт, y — вверх от воды, z — к корме): точки seat_0…2 из GLB */
export type BoatSeat = readonly [number, number, number];

export interface BoatKind {
  id: BoatId;
  name: string;
  /** Прототип и длина — строка карточки в окне покупки */
  proto: string;
  /** С какого уровня рыбалки продаётся */
  level: number;
  /** Цена у Семёна, жетонов */
  price: number;
  /** Полный ход, м/с; разгон до полного, с; задний ход, м/с; поворот на полном ходу, рад/с */
  speed: number;
  accel: number;
  reverse: number;
  turn: number;
  /** Мест в лайвеле (садке) */
  livewell: number;
  /** Эхолот: ожидание поклёвки с якоря короче на долю (поклёвка быстрее для всех троих в лодке) */
  sonar: number;
  /** Якорь: бросить или поднять, с */
  anchor: number;
  /** Корпус модели (GLB, extras length_m / beam_m), м: по нему ставим в берт и считаем столкновения */
  length: number;
  beam: number;
  /** Места: 0 — штурвал, 1 и 2 — сзади слева и справа */
  seats: readonly [BoatSeat, BoatSeat, BoatSeat];
  /** Время до вод острова на полном ходу (дизайн §3.3) */
  trip: string;
  /** Нос якоря (узел anchor) в осях лодки: отсюда трос уходит в воду */
  bowZ: number;
}

/** Три лодки (порядок — от простой к лучшей; номер в таблице — тип лодки в сообщениях) */
export const BOATS: readonly BoatKind[] = [
  {
    id: 'volzhanka', name: 'Волжанка', proto: 'Волжанка 46 Fish, 4,7 м', level: 6, price: 5000, speed: 12, accel: 5, reverse: 3, turn: 0.95,
    livewell: 25, sonar: 0.05, anchor: 2.5, length: 4.7, beam: 1.94, trip: '3:00', bowZ: -2.55,
    seats: [[0.391, 0.49, 0.517], [-0.402, 0.47, 1.363], [0.402, 0.47, 1.363]],
  },
  {
    id: 'albakor', name: 'Альбакор', proto: 'Albakore 560 Fish, 5,6 м', level: 8, price: 10_000, speed: 15.5, accel: 5, reverse: 3.5, turn: 0.85,
    livewell: 50, sonar: 0.1, anchor: 1, length: 5.6, beam: 2.3, trip: '2:20', bowZ: -3,
    seats: [[0.457, 0.55, 0.392], [-0.5, 0.73, 2.156], [0.5, 0.73, 2.156]],
  },
  {
    id: 'northsilver', name: 'Нортсильвер', proto: 'NorthSilver 700 Fish Sport, 7 м', level: 10, price: 15_000, speed: 20.8, accel: 5.5, reverse: 4, turn: 0.75,
    livewell: 75, sonar: 0.15, anchor: 0.3, length: 7, beam: 2.36, trip: '1:45', bowZ: -3.7,
    seats: [[0.1, 0.7, 0.525], [-0.58, 0.87, 2.765], [0.58, 0.87, 2.765]],
  },
];

export const BOAT_IDS: readonly BoatId[] = BOATS.map((b) => b.id);

/** Лодка по id (нет такой — undefined) */
export function boatById(id: unknown): BoatKind | undefined {
  return BOATS.find((b) => b.id === id);
}

/** Номер лодки в таблице (тип в сообщениях): −1 — нет такой */
export function boatIndex(id: unknown): number {
  return BOATS.findIndex((b) => b.id === id);
}

/** Купленные лодки из профиля: только известные, без повторов, в порядке таблицы */
export function ownedBoats(p: { readonly boats?: readonly string[] } | null | undefined): BoatId[] {
  const have = p?.boats ?? [];
  return BOAT_IDS.filter((id) => have.includes(id));
}

/** Лучшая купленная лодка (по ней — вместимость лайвела); null — лодок нет */
export function bestBoat(p: { readonly boats?: readonly string[] } | null | undefined): BoatKind | null {
  const own = ownedBoats(p);
  return own.length ? boatById(own[own.length - 1]) ?? null : null;
}

/** Что с покупкой лодки: уже есть, не тот уровень рыбалки, не хватает жетонов, можно купить */
export type BoatBuyState = 'owned' | 'level' | 'tokens' | 'ok';

export function boatBuyState(b: BoatKind, owned: readonly string[], fishLevel: number, tokens: number): BoatBuyState {
  if (owned.includes(b.id)) return 'owned';
  if (fishLevel < b.level) return 'level';
  if (tokens < b.price) return 'tokens';
  return 'ok';
}

/** Почему нельзя купить — прямо на кнопке («С 10-го уровня рыбалки (у тебя 8-й)», «Не хватает 2 340 🪙») */
export function boatBuyNote(b: BoatKind, st: BoatBuyState, fishLevel: number, tokens: number): string {
  if (st === 'level') return `С ${b.level}-го уровня рыбалки (у тебя ${fishLevel}-й)`;
  if (st === 'tokens') return `Не хватает ${fmtInt(b.price - tokens)} 🪙`;
  if (st === 'owned') return 'Твоя — вызывай на стоянке за домом';
  return `Купить · ${fmtInt(b.price)} 🪙`;
}

/** 15000 → «15 000» (неразрывный пробел, как в окнах игры) */
export function fmtInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
