// Карта «Набережная»: общее лобби. Вечерний причал, на севере — павильон автоматов, Склад №3
// (вход в пейнтбол) и гараж картинга; на востоке — кафе «Чайка» с террасой; на западе у воды —
// ларёк «Примерочная»; на юго-западе — мостки к маяку; к западу и юго-западу на воде — аквапарк «Волна»; в юго-восточном углу —
// колесо обозрения. X — восток, Z — юг, «север» = −Z.
import { AQUA_BOARD, AQUA_BOTTOM, AQUA_JETTY, AQUA_MOVERS, AQUA_PIECES, slideSteps } from '../aqua.ts';
import { BARKAS_BOARD, BARKAS_FISH_FIRST, BARKAS_FISH_SPOTS, SANYA_USE, barkasBoxes } from '../barkas.ts';
import { BOAT_FLOOR_Y, LAUNCH } from '../boat.ts';
import { FERRY_AWAY, FERRY_HOME, FERRY_HOME_BOARD, FERRY_SIGN, ferryBoxes } from '../ferry.ts';
import { BJ_TABLE } from '../blackjack.ts';
import { BL_HALL, BL_OUT_HX, BL_OUT_HZ, BL_POSTS, BL_SURFACE_Y, BL_TABLES } from '../billiards.ts';
import { FC_CIRCLE } from '../fight.ts';
import { JUKEBOX, JUKEBOX_BARKAS, JUKE_BARKAS_USE, JUKE_D, JUKE_H, JUKE_USE, JUKE_W } from '../jukebox.ts';
import {
  FISH_BOARD, FISH_BOARD_BODY, FISH_DECKS, FISH_FAR_SPOTS, FISH_HOUSE_BOXES, FISH_ISLAND_COUNT, FISH_MOORINGS, FISH_PIER2, FISH_PIER_HEAD,
  FISH_FAR_FIRST, FISH_PODIUM_BODY, FISH_PODIUM_STEP_BOXES, FISH_SPOTS, FISHER_BODY, FISHER_CANOPY_BOXES, FISHER_USE, ROULETTE_SPOT,
  barkasSpotIndex,
} from '../fishplaces.ts';
import { RAT_BOARD, RAT_DECK, RAT_PEN, RAT_USE } from '../ratrace.ts';
import { PLANE_SIGN, PLANE_USE } from '../plane.ts';
import { plazaSolids, type PlazaSolidMode } from '../plaza2.ts';
import { WHEEL, WHEEL_GATE } from '../wheel.ts';
import { billiardsTableGuards, cafeTableGuards } from '../tableguard.ts';
import { Builder } from './builder.ts';
import type { GameMap } from './types.ts';
import { CRITTERS_ENABLED, coveBoxes } from './critters.ts';

/** durak — стул за столиком кафе (стол дурака), seat — место на скамейке */
/** ferry — лодка Семёна «Удалая» (arg 0 — у мостков, 1 — у калитки баркаса); fisher arg 1 — Саня на баркасе; roulette — стол на баркасе */
/** ratrace — крысиные бега на понтоне у набережной (флаг RATRACE); billiards — бильярдный стол (флаг BILLIARDS);
 * plane — гидроплан «Стриж» у западного края площади, banner — заказ баннера (флаг PLANE, shared/plane.ts) */
export type InteractKind = 'slot' | 'pb_gate' | 'garage' | 'kiosk' | 'seat' | 'durak' | 'blackjack' | 'honor' | 'kboard' | 'photo' | 'fish' | 'recent' | 'boat' | 'wheel' | 'fort' | 'fight' | 'fisher' | 'skill' | 'boatrace' | 'hide' | 'juke' | 'ferry' | 'roulette' | 'ratrace' | 'billiards' | 'plane' | 'banner';

export interface Interactable {
  id: number;
  kind: InteractKind;
  x: number;
  y: number;
  z: number;
  /** Куда смотрит игрок, вставший в эту точку */
  yaw: number;
  /** Радиус, в котором предмет подсвечивается */
  r: number;
  /** Номер автомата / номер места */
  arg: number;
  label: string;
}

export interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface Box2 {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface LobbyMap extends GameMap {
  spawn: Spot;
  /** Где появляется вернувшийся из пейнтбола */
  gateSpawn: Spot;
  /** Где появляется вернувшийся из гонки — рядом с кругом «Старт», но не в нём */
  garageSpawn: Spot;
  /** Где появляется вернувшийся из «Крепости» — перед аркой */
  fortSpawn: Spot;
  /** Возвращение с небесной полосы: перед порталом, вне его стоек. */
  skillSpawn: Spot;
  boatraceSpawn: Spot;
  hideSpawn: Spot;
  interact: Interactable[];
  /** Центры корпусов автоматов (передняя грань — z = MACHINE_FRONT_Z) */
  machines: Array<{ x: number; z: number }>;
  tables: Array<{ x: number; z: number }>;
  /** Скамейки: центр и куда смотрят сидящие */
  benches: Array<{ x: number; z: number; yaw: number }>;
  lighthouse: { x: number; z: number };
  /** Места для зеркала примерочной и доски почёта */
  mirror: Spot;
  honorBoard: Box2;
  zones: { arcade: Box2; warehouse: Box2; garage: Box2; cafe: Box2; terrace: Box2; kiosk: Box2 };
  /** Боксы катера у причала (номера в boxes): на время поездки их убирают */
  boatBoxes: number[];
  /** Где у катера стоит пассажир, не севший на место (x0…x1, z0…z1): при отплытии его ставят на причал */
  boatArea: Box2;
  /** Боксы подвижных площадок аквапарка (номера в boxes, в порядке AQUA_MOVERS): в мире они только на время шага игрока */
  aquaMovers: number[];
  /** NPC, доска и пьедестал видны только с FISH2: при выключенном режиме эти коллизии тоже выключают. */
  fishPropsBoxes: number[];
  skillPortalBoxes: number[];
  /** Лодка «Удалая» у мостков и у баркаса (номера в boxes): включены только у той стоянки, где она стоит */
  ferryHomeBoxes: number[];
  ferryAwayBoxes: number[];
  /** Корпус музыкального автомата (флаг сервера JUKEBOX): без флага коллизию выключают */
  jukeBoxes: number[];
  /** Понтон крысиных бегов: настил, бортик арены, столбы табло (флаг сервера RATRACE): без флага коллизию выключают */
  ratBoxes: number[];
  /** Бильярдные столы и столбы навеса (флаг сервера BILLIARDS): без флага коллизию выключают */
  billiardsBoxes: number[];
  /** Столбик таблички гидроплана (флаг сервера PLANE): без флага коллизию выключают */
  planeBoxes: number[];
  /** Твёрдые предметы оформления площади (shared/plaza2.ts): бочки, покрышки и прочее, в самом конце списка боксов */
  plazaBoxes: number[];
  /** Из них — предметы режимов за флагами (двор прятков, мачты регаты, столбики Fight Club): без флага их выключают, как на экране */
  plazaModeBoxes: Record<PlazaSolidMode, number[]>;
}

export const MACHINE_XS = [-25, -22.5, -20, -17.5, -15];
export const MACHINE_FRONT_Z = -23.7;
export const TABLE_ZS = [-5, 3, 11];
export const TABLE_X = 18;
export const SKILL_PORTAL = { x: -10, z: -12.8, r: 2.1 } as const;
/** Фонарь у проулка крепости: стоял на оси арки (11; −11) и закрывал её с площади, теперь — правее, у картинга */
export const LAMP_FORT = { x: 14.9, z: -11 } as const;
export const BOAT_RACE_CIRCLE = { x: 16, z: 18, r: 2.25 } as const;
export const HIDE_CIRCLE = { x: -4, z: 12.5, r: 2.1 } as const;
/**
 * Три батута треугольником вокруг розы ветров (0; 3,6): сторона 14,5 м — как было между двумя прежними батутами;
 * треугольник повёрнут на 16°: угол не упирается в арку «Рыбного двора», а мяч из центра катится на запад свободно.
 */
export const PLAZA_TRAMPOLINES: ReadonlyArray<readonly [number, number]> = [[2.32, -4.47], [5.84, 9.64], [-8.15, 5.63]];
export const CHAIR_R = 1.35;
export const BENCH_XS = [-8, 0, 8];
export const BENCH_Z = 19.5;
/** Столбы навеса из гирлянд над террасой (x, z), высота CANOPY_POLE_H */
export const CANOPY_POLES: ReadonlyArray<readonly [number, number]> = [[14.2, -9], [14.2, 1], [14.2, 11], [24, 11]];
export const CANOPY_POLE_H = 3.6;
/** Стульев у стола дурака. Места 0…17 — стулья (стол × 6), 18…23 — скамейки. */
export const TABLE_SEATS = 6;
export const LOBBY_SEAT_COUNT = TABLE_ZS.length * TABLE_SEATS + BENCH_XS.length * 2;

export function seatTable(seat: number): number {
  return Math.floor(seat / TABLE_SEATS);
}

export function seatChair(seat: number): number {
  return seat % TABLE_SEATS;
}

export function tableSeat(table: number, chair: number): number {
  return table * TABLE_SEATS + chair;
}
/** Деревья в кадках на площади (x, z): у моря на западе (на востоке у парапета — колесо обозрения). Кадка — по колено, на неё можно запрыгнуть */
export const PLANTERS: ReadonlyArray<readonly [number, number]> = [[-24, 7], [-24, 15]];
export const PLANTER_R = 0.62;
export const PLANTER_H = 0.55;
/**
 * Статуя у входа на мостки к маяку (западнее прохода, у воды): постамент с фигурой — один твёрдый бокс,
 * наверх не запрыгнуть (прыжок ~1,5 м). yaw — куда смотрит фигура (0 — на −Z): на площадь.
 */
export const STATUE = { x: -23.6, z: 19.2, yaw: yawTo(-23.6, 19.2, -6, 8), half: 0.65, height: 3.4 };
/**
 * Стоит ли памятник на набережной. По слову владельца 05.10.2026 скрыт: нет ни фигуры с постаментом, ни свечей
 * с «Press F», ни бокса — место свободно. Файлы памятника и счёт «RESPECTS PAID» целы; вернуть — true, только по его слову.
 */
export const STATUE_SHOWN = false;
/** Табличка у катера на причале (столбик с доской, лицом к площади): «Отплытие через N с» */
export const BOAT_SIGN = { x: 10.2, z: 21.3 };
/** Круг «Старт» перед гаражом: кто в нём стоит, тот через 15 с отсчёта едет в гонку */
export const KART_START = { x: 20.5, z: -12.6, r: 2.2 };
/**
 * Арка «Крепость» (выпуск 6) в проулке между складом и гаражом: середина, ширина проёма. Арку рисует клиент и только
 * с флагом сервера FORTRESS; твёрдого у неё нет — без флага на набережной ничего не меняется.
 */
export const FORT_ARCH = { x: 11, z: -16.2, w: 3.4 };
/**
 * Фото у маяка: штатив с фотоаппаратом в конце мостков смотрит на юг, на площадку перед маяком (spot — где встают
 * в кадр). E — у штатива, с северной стороны, как у фотографа.
 */
export const PHOTO = { x: -19, z: 33.75, spotX: -19, spotZ: 39.6 };
/** Сохранён прежний import path: 8 мест на мостках и 4 на площадке маяка. */
export { FISH_SPOTS } from '../fishplaces.ts';

const BRICK = 0x9a5a48;
const BRICK_DARK = 0x7d4a3c;
const CONCRETE = 0xcfc7b6;
const WOOD = 0xb07a4a;
const METAL = 0x5b6670;

/** Поворот взгляда из (x, z) на точку (tx, tz): yaw = 0 смотрит в −Z. */
function yawTo(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

export function buildLobby(): LobbyMap {
  const b = new Builder(false);
  const interact: Interactable[] = [];
  const add = (kind: InteractKind, x: number, z: number, yaw: number, r: number, arg: number, label: string): void => {
    interact.push({ id: interact.length, kind, x, y: 0, z, yaw, r, arg, label });
  };

  // --- Настил и бордюр вдоль моря (запад и юг), кроме проходов на мостки к маяку и на мостик аквапарка
  const J = AQUA_JETTY;
  b.box([-30, -0.6, -26], [30, 0, 22], 'deck', 0xd2c3aa);
  b.box([-30, 0, -26], [-29.7, 0.22, J.z0], 'concrete', CONCRETE);
  b.box([-30, 0, J.z1], [-29.7, 0.22, 22], 'concrete', CONCRETE);
  b.box([-29.7, 0, 21.7], [-21, 0.22, 22], 'concrete', CONCRETE);
  b.box([-17, 0, 21.7], [30, 0.22, 22], 'concrete', CONCRETE);
  // Восток — парапет над улицей (кроме стены кафе)
  b.box([29.6, 0, -16], [30, 1.0, -10], 'concrete', CONCRETE);
  b.box([29.6, 0, 4], [30, 1.0, 22], 'concrete', CONCRETE);

  // --- Невидимые стены: далеко в море (на западе — за аквапарком), за зданиями и над парапетом. Южная — с проёмом
  // x −30…−5 у пирса: вокруг дальних мостков и дома рыбака своя «бухта» (стены — в блоке пирса ниже)
  b.box([-98, -6, -30], [-97, 30, 50], 'invisible', 0);
  b.box([-98, -6, 48], [-30, 30, 49], 'invisible', 0);
  b.box([30.5, -6, -30], [31.5, 30, 50], 'invisible', 0);
  b.box([-98, -6, -27], [31.5, 30, -26], 'invisible', 0);

  // --- Павильон автоматов (x −28..−12): задняя стена, боковые, крыша на столбах
  b.box([-28, 0, -26], [-12, 5, -25.4], 'brick', BRICK);
  b.box([-28, 0, -25.4], [-27.4, 5, -16], 'brick', BRICK);
  b.box([-12.6, 0, -25.4], [-12, 5, -16], 'brick', BRICK);
  b.box([-28, 4.6, -25.4], [-12, 5.0, -16], 'wood', 0x6b4a36);
  for (const x of [-22.5, -17.5]) b.box([x - 0.2, 0, -16.4], [x + 0.2, 4.6, -16], 'wood', 0x6b4a36);
  const machines: Array<{ x: number; z: number }> = [];
  MACHINE_XS.forEach((x, m) => {
    b.box([x - 0.55, 0, -25.4], [x + 0.55, 2.1, MACHINE_FRONT_Z], 'metal', METAL);
    machines.push({ x, z: (-25.4 + MACHINE_FRONT_Z) / 2 });
    add('slot', x, MACHINE_FRONT_Z + 1, 0, 1.0, m, 'сыграть');
  });

  // --- Склад №3 (x −9..9, 9 м): два блока, перемычка над воротами, ниша 2 м вглубь
  b.box([-9, 0, -26], [-3, 9, -16], 'brick', BRICK_DARK);
  b.box([3, 0, -26], [9, 9, -16], 'brick', BRICK_DARK);
  b.box([-3, 4.5, -26], [3, 9, -16], 'brick', BRICK_DARK);
  b.box([-3, 0, -26], [3, 4.5, -18], 'invisible', 0);

  // --- Гараж картинга (x 13..28)
  b.box([13, 0, -26], [28, 6, -16], 'brick', BRICK);

  // Закутки у моря и за гаражом закрыты низкой стенкой, проулки между зданиями — забором
  b.box([-30, 0, -16.3], [-28, 1.2, -16], 'brick', BRICK);
  b.box([28, 0, -16.3], [30, 1.2, -16], 'brick', BRICK);
  b.box([-12, 0, -25.6], [-9, 2.2, -25.4], 'wood', WOOD);
  b.box([9, 0, -25.6], [13, 2.2, -25.4], 'wood', WOOD);
  b.crate(-10.9, 0, -23.8, 1.2, false);
  b.crate(-10.9, 1.2, -23.8, 1.0, false);
  b.crate(-10.2, 0, -21.9, 1.0, false);
  b.barrel(11.2, -23.6, 0x2f6a8a);
  b.barrel(11.9, -22.8, 0x2f6a8a);
  b.barrel(10.6, -21.2, 0xb04a36);

  add('pb_gate', 0, -15.2, 0, 2.2, 0, 'в пейнтбол');
  add('garage', KART_START.x, KART_START.z, 0, KART_START.r, 0, 'Картинг');

  // --- Ларёк «Примерочная» у воды; зеркало на его восточной стене
  b.box([-29.5, 0, -6], [-25.5, 3.2, 0], 'wood', 0x3f6f8f);
  const mirror: Spot = { x: -25.4, y: 0, z: -1.4, yaw: -Math.PI / 2 };
  add('kiosk', -23.4, -1.4, Math.PI / 2, 4.5, 0, 'примерочная');

  // --- Доска почёта на площади (лицом на юг, к точке появления)
  const honorBoard: Box2 = { x0: 6, z0: -2, x1: 10, z1: -1.6 };
  b.box([honorBoard.x0, 0, honorBoard.z0], [honorBoard.x1, 3.4, honorBoard.z1], 'wood', 0x5a3e2b);
  add('honor', 8, -0.3, 0, 1.8, 0, 'Доска почёта');

  // --- Кафе «Чайка»: домик у восточного края, терраса со столиками
  b.box([24, 0, -10], [30, 4, 4], 'wood', 0xe8dcc4);
  const tables = TABLE_ZS.map((z) => ({ x: TABLE_X, z }));
  for (const t of tables) b.box([t.x - 0.55, 0, t.z - 0.55], [t.x + 0.55, 0.75, t.z + 0.55], 'wood', WOOD);
  // невидимые колпаки над столиками: на стол не запрыгнуть и не встать (shared/tableguard.ts)
  for (const g of cafeTableGuards(tables)) b.box(g.min, g.max, 'invisible', 0);
  for (const [x, z] of CANOPY_POLES) b.box([x - 0.08, 0, z - 0.08], [x + 0.08, CANOPY_POLE_H, z + 0.08], 'invisible', 0);

  // --- Площадь: батуты, фонари, скамейки у моря
  for (const [x, z] of PLAZA_TRAMPOLINES) b.trampoline(x, z);
  for (const [x, z] of [[-14, -2], [-4.5, -11], [LAMP_FORT.x, LAMP_FORT.z], [-14, 16], [2, 16], [14, 16]]) b.lamp(x, z);
  const benches = BENCH_XS.map((x) => ({ x, z: BENCH_Z, yaw: Math.PI }));

  // Места: сначала стулья (стол × 6, против часовой стрелки, если смотреть сверху), потом скамейки (по 2)
  let seat = 0;
  for (const t of tables) {
    for (let k = 0; k < TABLE_SEATS; k++) {
      const a = (k * 60 + 30) * (Math.PI / 180);
      const x = t.x + Math.sin(a) * CHAIR_R;
      const z = t.z + Math.cos(a) * CHAIR_R;
      add(seatTable(seat) === BJ_TABLE ? 'blackjack' : 'durak', x, z, yawTo(x, z, t.x, t.z), 0.7, seat++, 'сесть за стол');
    }
  }
  for (const bn of benches) for (const dx of [-0.5, 0.5]) add('seat', bn.x + dx, bn.z, bn.yaw, 0.7, seat++, 'сесть');

  // Перед табло гонки на стене гаража (табло — x 26,05, на высоте 1,8–3,7 м): E — болеть за гонщиков
  add('kboard', 26.05, -14.3, Math.PI, 1.6, 0, 'Табло гонки');

  // Кадки с деревьями: сама кадка и ствол над ней
  for (const [x, z] of PLANTERS) {
    b.box([x - PLANTER_R, 0, z - PLANTER_R], [x + PLANTER_R, PLANTER_H, z + PLANTER_R], 'invisible', 0);
    b.box([x - 0.14, PLANTER_H, z - 0.14], [x + 0.14, 3.0, z + 0.14], 'invisible', 0);
  }

  // --- Кнехты вдоль воды
  for (const z of [-12, 6, 12, 18]) b.bollard(-29.2, z);
  for (const x of [-26, -12, -4, 4, 12, 20, 26]) b.bollard(x, 21.2);

  // --- Мостки и маяк на юго-западе
  b.box([-21, -0.6, 22], [-17, 0, 38], 'wood', 0x8a6a4a);
  b.box([-24, -0.6, 38], [-14, 0, 46], 'concrete', 0xb9b3a6);
  b.box([-20.6, 0, 41.4], [-17.4, 12, 44.6], 'concrete', 0xf0ece4);
  b.bollard(-23.3, 38.7);
  b.bollard(-14.7, 45.3);
  // штатив: тонкий, но насквозь не пройти
  b.box([PHOTO.x - 0.2, 0, PHOTO.z - 0.2], [PHOTO.x + 0.2, 1.4, PHOTO.z + 0.2], 'invisible', 0);
  add('photo', PHOTO.x, PHOTO.z - 0.9, Math.PI, 1.4, 0, 'фото у маяка');
  FISH_SPOTS.slice(0, 6).forEach((s, i) => add('fish', s.x, s.z, s.yaw, 1.0, i, 'порыбачить'));
  // обратная сторона доски почёта — «Последние входы». Новые точки — только в конец: их номера шлют клиенты
  add('recent', 8, honorBoard.z0 - 1.3, Math.PI, 1.8, 0, 'Последние входы');
  // катер у причала: E — покататься (первый платит). Точка — у середины катера: достать и с причала, и из катера
  add('boat', LAUNCH.x, LAUNCH.z - 0.4, Math.PI, 3.5, 0, 'катер');

  // --- Статуя у входа на мостки (скрыта — бокса нет, номера остальных боксов каждая сторона считает сама)
  if (STATUE_SHOWN) b.box([STATUE.x - STATUE.half, 0, STATUE.z - STATUE.half], [STATUE.x + STATUE.half, STATUE.height, STATUE.z + STATUE.half], 'invisible', 0);

  // --- Катер «Ласточка» у причала — твёрдый: пол кокпита, борта, транец, носовая палуба, два пульта. Невидимые боксы
  // (катер рисует сам клиент); на время поездки сервер и клиенты их убирают. E у причала — покататься (shared/boat.ts)
  const bx = (lx0: number, lx1: number, lz0: number, lz1: number, y0: number, y1: number): void => {
    // в осях катера: x — к правому борту (у причала — на юг), z — к корме (у причала — на запад)
    b.box([LAUNCH.x - lz1, y0, LAUNCH.z + lx0], [LAUNCH.x - lz0, y1, LAUNCH.z + lx1], 'invisible', 0);
  };
  const boatBoxes: number[] = [];
  const first = b.boxes.length;
  const F = BOAT_FLOOR_Y;
  bx(-1.12, 1.12, -1.0, 3.0, F - 0.75, F);
  bx(-1.12, -0.96, -1.0, 3.0, F, F + 0.35);
  bx(0.96, 1.12, -1.0, 3.0, F, F + 0.35);
  bx(-0.96, 0.96, 2.82, 3.0, F, F + 0.33);
  bx(-0.92, 0.92, -3.1, -1.0, F - 0.75, F + 0.43);
  bx(0.17, 0.79, -0.3, 0.3, F, F + 0.9);
  bx(-0.79, -0.17, -0.3, 0.3, F, F + 0.9);
  for (let i = first; i < b.boxes.length; i++) boatBoxes.push(i);
  const boatArea: Box2 = { x0: LAUNCH.x - 3.5, z0: LAUNCH.z - 1.2, x1: LAUNCH.x + 3.5, z1: LAUNCH.z + 1.2 };
  // табличка у катера: столбик (обходить, как кнехт)
  b.box([BOAT_SIGN.x - 0.05, 0, BOAT_SIGN.z - 0.05], [BOAT_SIGN.x + 0.05, 1.9, BOAT_SIGN.z + 0.05], 'invisible', 0);

  // --- Аквапарк «Волна» к западу от площади (shared/aqua.ts): дощатый мостик на сваях — старт, дальше надувная полоса
  // на воде. Надувное рисует клиент сам (боксы невидимые), батуты подбрасывают, горка — ступеньками. Подвижные площадки —
  // свои боксы, убранные далеко за карту: на время шага игрока их ставит shared/aquadyn.ts
  b.box([J.x0, -0.6, J.z0], [J.x1, 0, J.z1], 'wood', 0x8a6a4a);
  for (const x of [J.x0 + 0.3, J.x0 + 2.4]) for (const z of [J.z0 + 0.3, J.z1 - 0.3]) b.deco.push({ kind: 'piling', x, z });
  for (const p of AQUA_PIECES) {
    if (p.kind === 'slide') {
      for (const s of slideSteps(p)) b.box([s.x0, AQUA_BOTTOM, s.z0], [s.x1, s.top, s.z1], 'invisible', 0);
    } else {
      b.box([p.x0, AQUA_BOTTOM, p.z0], [p.x1, p.top, p.z1], p.kind === 'tramp' ? 'tramp' : 'invisible', 0, p.kind === 'tramp' ? { tramp: true } : {});
    }
  }
  const aquaMovers: number[] = [];
  for (let i = 0; i < AQUA_MOVERS.length; i++) {
    aquaMovers.push(b.boxes.length);
    b.box([1e6, -1e6, 1e6], [1e6, -1e6, 1e6], 'invisible', 0);
  }
  // доска рекордов: два столбика (обходить)
  for (const dz of [-0.62, 0.62]) b.box([AQUA_BOARD.x - 0.06, 0, AQUA_BOARD.z + dz - 0.06], [AQUA_BOARD.x + 0.06, 2.4, AQUA_BOARD.z + dz + 0.06], 'invisible', 0);

  // --- Колесо обозрения в юго-восточном углу (shared/wheel.ts): дощатый помост, ноги колеса, оградка вокруг того места,
  // где низко проходят кабинки (вход — у кассы, с запада), касса. Колесо и кабинки рисует клиент
  const W = WHEEL;
  b.box([24.3, 0, 7.2], [29.5, 0.15, 18.8], 'wood', 0x9b7a55);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // низ ноги: дальше вверх она уходит к оси, над головой
    const lx = W.x + sx * 2.35;
    const lz = W.z + sz * 4.6;
    b.box([lx - 0.25, 0.15, Math.min(lz, lz - sz * 0.9) - 0.2], [lx + 0.25, 1.9, Math.max(lz, lz - sz * 0.9) + 0.2], 'invisible', 0);
  }
  b.box([25.55, 0.15, 7.4], [25.65, 1.1, 12.1], 'invisible', 0);
  b.box([25.55, 0.15, 13.9], [25.65, 1.1, 18.6], 'invisible', 0);
  b.box([28.35, 0.15, 7.4], [28.45, 1.1, 18.6], 'invisible', 0);
  b.box([25.55, 0.15, 7.35], [28.45, 1.1, 7.45], 'invisible', 0);
  b.box([25.55, 0.15, 18.55], [28.45, 1.1, 18.65], 'invisible', 0);
  b.box([24.6, 0.15, 10.2], [25.5, 2.5, 11.6], 'wood', 0x2f7fb8);
  // новые точки — только в конец: их номера шлют клиенты
  add('wheel', WHEEL_GATE.x, WHEEL_GATE.z, -Math.PI / 2, 1.6, 0, 'колесо обозрения');
  // «Крепость» (выпуск 6): перед аркой — E, в крепость. Точка есть всегда, работает (и арку видно) только с флагом сервера
  add('fort', FORT_ARCH.x, FORT_ARCH.z + 0.9, 0, 1.6, 0, 'в крепость');
  // «Fight Club» (выпуск 6): круг мелом у двери в подвал кафе — E, хозяин круга меняет режим (shared/fight.ts).
  // Точка есть всегда, работает (и дверь видно) только с флагом сервера
  add('fight', FC_CIRCLE.x, FC_CIRCLE.z, Math.PI, FC_CIRCLE.r, 0, 'Fight Club');

  // Новые места и NPC — строго после всех прежних interactables: номера уже используются клиентами.
  FISH_SPOTS.slice(6, FISH_ISLAND_COUNT).forEach((s, i) => add('fish', s.x, s.z, s.yaw, 1.0, i + 6, 'порыбачить'));
  add('fisher', FISHER_USE.x, FISHER_USE.z, FISHER_USE.yaw, FISHER_USE.r, 0, 'поговорить с рыбаком');
  add('skill', SKILL_PORTAL.x, SKILL_PORTAL.z, 0, SKILL_PORTAL.r, 0, 'Выше облаков — скилл-тест');
  add('boatrace', BOAT_RACE_CIRCLE.x, BOAT_RACE_CIRCLE.z, 0, BOAT_RACE_CIRCLE.r, 0, 'Портовая регата');
  add('hide', HIDE_CIRCLE.x, HIDE_CIRCLE.z, 0, HIDE_CIRCLE.r, 0, 'Прятки: Рыбный двор');
  // Музыкальный автомат (shared/jukebox.ts): E перед лицевой стороной — выбрать песню
  add('juke', JUKE_USE.x, JUKE_USE.z, 0, JUKE_USE.r, 0, 'музыкальный автомат');
  // Настилы встык к мосткам и площадке; швартовные углы и рыбак совпадают с видимыми предметами.
  for (const f of FISH_DECKS) b.box([f.x0, f.y0, f.z0], [f.x1, f.y1, f.z1], 'wood', 0x8a6a4a);
  for (const m of FISH_MOORINGS) b.box([m.x - m.r, 0, m.z - m.r], [m.x + m.r, m.h, m.z + m.r], 'invisible', 0);
  const fishPropsBoxes: number[] = [];
  for (const f of [FISHER_BODY, FISH_BOARD_BODY, FISH_PODIUM_BODY, ...FISH_PODIUM_STEP_BOXES, ...FISHER_CANOPY_BOXES]) {
    fishPropsBoxes.push(b.boxes.length);
    b.box([f.x0, f.y0, f.z0], [f.x1, f.y1, f.z1], 'invisible', 0);
  }
  for (const sign of [-1, 1]) {
    const x = FISH_BOARD.x + sign * (FISH_BOARD.w / 2 + 0.09);
    fishPropsBoxes.push(b.boxes.length);
    b.box([x - 0.075, 0, FISH_BOARD.z - 0.075], [x + 0.075, FISH_BOARD.h + 0.45, FISH_BOARD.z + 0.075], 'invisible', 0);
  }

  // Портал: коллизия совпадает со стойками client/skilltest/portal.ts; центр свободен.
  const skillPortalBoxes: number[] = [];
  for (const sign of [-1, 1]) {
    const x = SKILL_PORTAL.x + sign * 1.5;
    skillPortalBoxes.push(b.boxes.length);
    b.box([x - .18, 0, SKILL_PORTAL.z - .18], [x + .18, 3.4, SKILL_PORTAL.z + .18], 'invisible', 0);
  }
  skillPortalBoxes.push(b.boxes.length);
  b.box([SKILL_PORTAL.x - 1.68, 2.9, SKILL_PORTAL.z - .18], [SKILL_PORTAL.x + 1.68, 3.35, SKILL_PORTAL.z + .18], 'invisible', 0);
  // Песчаная отмель у мостков к маяку рисуется в LobbyCritters; здесь только твёрдая ровная часть (можно спрыгнуть и вернуться).
  if (CRITTERS_ENABLED) for (const s of coveBoxes()) b.box([s.x0, -1.8, s.z0], [s.x1, s.top, s.z1], 'invisible', 0);
  // Корпус музыкального автомата — твёрдый (рисует клиент, client/lobby/jukebox3d.ts); без флага JUKEBOX его выключают
  const jukeBoxes = [b.boxes.length];
  b.box([JUKEBOX.x - JUKE_W / 2, 0, JUKEBOX.z - JUKE_D / 2], [JUKEBOX.x + JUKE_W / 2, JUKE_H, JUKEBOX.z + JUKE_D / 2], 'invisible', 0);

  // --- Баркас «Альбатрос» в море (shared/barkas.ts) и лодка Семёна «Удалая» у обеих стоянок (shared/ferry.ts). Всё
  // невидимое — рисует client/lobby/barkas. Точки — в самый конец: места рыбалки на борту, лодка, Саня (fisher arg 1)
  for (const k of barkasBoxes()) b.box(k.min, k.max, 'invisible', 0);
  const ferryHomeBoxes: number[] = [];
  const ferryAwayBoxes: number[] = [];
  for (const [dock, list] of [[FERRY_HOME, ferryHomeBoxes], [FERRY_AWAY, ferryAwayBoxes]] as const) {
    for (const k of ferryBoxes(dock)) {
      list.push(b.boxes.length);
      b.box(k.min, k.max, 'invisible', 0);
    }
  }
  // табличка «Удалой» у стоянки: столбик (обходить, как кнехт)
  b.box([FERRY_SIGN.x - 0.05, 0, FERRY_SIGN.z - 0.05], [FERRY_SIGN.x + 0.05, 1.9, FERRY_SIGN.z + 0.05], 'invisible', 0);
  BARKAS_FISH_SPOTS.slice(0, BARKAS_FISH_FIRST).forEach((s, i) => add('fish', s.x, s.z, s.yaw, 1.0, FISH_ISLAND_COUNT + i, 'порыбачить'));
  add('ferry', FERRY_HOME_BOARD.x, FERRY_HOME_BOARD.z, FERRY_HOME_BOARD.yaw, FERRY_HOME_BOARD.r, 0, 'лодка «Удалая»');
  add('ferry', BARKAS_BOARD.x, BARKAS_BOARD.z, BARKAS_BOARD.yaw, BARKAS_BOARD.r, 1, 'лодка «Удалая»');
  add('fisher', SANYA_USE.x, SANYA_USE.z, SANYA_USE.yaw, SANYA_USE.r, 1, 'поговорить с Саней');
  // стол рулетки рыбака (fisheco, флаг ROULETTE) — на палубе под тентом за рубкой
  add('roulette', ROULETTE_SPOT.x, ROULETTE_SPOT.z, ROULETTE_SPOT.yaw, ROULETTE_SPOT.r, 0, 'рулетка рыбака');
  // крысиные бега (флаг RATRACE) — понтон у набережной между скамейкой и мостками; всё невидимое рисует
  // client/lobby/ratrace3d.ts, без флага коллизию выключают (там снова вода). Точка — в самый конец списка
  add('ratrace', RAT_USE.x, RAT_USE.z, Math.PI, RAT_USE.r, 0, 'крысиные бега');
  const ratBoxes: number[] = [];
  const ratBox = (min: [number, number, number], max: [number, number, number]): void => {
    ratBoxes.push(b.boxes.length);
    b.box(min, max, 'invisible', 0);
  };
  ratBox([RAT_DECK.x0, -0.6, RAT_DECK.z0], [RAT_DECK.x1, 0, RAT_DECK.z1]);
  const P = RAT_PEN;
  ratBox([P.x0 - P.t, 0, P.z0 - P.t], [P.x1 + P.t, P.h, P.z0]);
  ratBox([P.x0 - P.t, 0, P.z1], [P.x1 + P.t, P.h, P.z1 + P.t]);
  ratBox([P.x0 - P.t, 0, P.z0], [P.x0, P.h, P.z1]);
  ratBox([P.x1, 0, P.z0], [P.x1 + P.t, P.h, P.z1]);
  for (const sx of [-1, 1]) {
    const x = RAT_BOARD.x + sx * (RAT_BOARD.w / 2 + 0.05);
    ratBox([x - 0.05, 0, RAT_BOARD.z - 0.05], [x + 0.05, RAT_BOARD.y + RAT_BOARD.h + 0.1, RAT_BOARD.z + 0.05]);
  }

  // второй музыкальный автомат — на баке баркаса (та же очередь, что на площади); корпус твёрдый только с флагом JUKEBOX
  add('juke', JUKE_BARKAS_USE.x, JUKE_BARKAS_USE.z, JUKEBOX_BARKAS.yaw + Math.PI, JUKE_BARKAS_USE.r, 1, 'музыкальный автомат');
  jukeBoxes.push(b.boxes.length);
  b.box([JUKEBOX_BARKAS.x - JUKE_W / 2, JUKEBOX_BARKAS.y, JUKEBOX_BARKAS.z - JUKE_D / 2], [JUKEBOX_BARKAS.x + JUKE_W / 2, JUKEBOX_BARKAS.y + JUKE_H, JUKEBOX_BARKAS.z + JUKE_D / 2], 'invisible', 0);

  // --- Пирс дальше в море (shared/fishplaces.ts): дальние мостки и площадка с домом рыбака — настилы уже в FISH_DECKS.
  // Вода вокруг — своя «бухта» в стенах: к баркасу (его вода — shared/barkas.ts) не доплыть и не долететь рывком.
  b.box([-5, -6, 48], [31.5, 30, 49], 'invisible', 0);
  b.box([-31, -6, 48], [-30, 30, 72], 'invisible', 0);
  b.box([-5, -6, 48], [-4, 30, 72], 'invisible', 0);
  b.box([-31, -6, 71], [-4, 30, 72], 'invisible', 0);
  // дом рыбака: сруб, стойки крыльца, бочки и ящики (рисует client/lobby/fishhouse.ts)
  for (const h of FISH_HOUSE_BOXES) b.box([h.x0, h.y0, h.z0], [h.x1, h.y1, h.z1], 'invisible', 0);
  // сваи под дальними мостками и площадкой (как у мостков к маяку)
  for (const x of [FISH_PIER2.x0 + 0.25, FISH_PIER2.x1 - 0.25]) for (const z of [48, 52]) b.deco.push({ kind: 'piling', x, z });
  for (const x of [FISH_PIER_HEAD.x0 + 0.25, -19, FISH_PIER_HEAD.x1 - 0.25]) b.deco.push({ kind: 'piling', x, z: FISH_PIER_HEAD.z1 + 0.25 });
  // места рыбалки на дальних мостках и у дома — в самый конец: номера прежних точек не меняются
  FISH_FAR_SPOTS.forEach((s, i) => add('fish', s.x, s.z, s.yaw, 1.0, FISH_FAR_FIRST + i, 'порыбачить'));

  // бильярд (флаг BILLIARDS; места столов — в самый конец списка) — навес к югу от павильона автоматов: столы и столбы твёрдые, E — у стола (shared/billiards.ts)
  const billiardsBoxes: number[] = [];
  for (const t of BL_TABLES) {
    billiardsBoxes.push(b.boxes.length);
    b.box([t.x - BL_OUT_HX, 0, t.z - BL_OUT_HZ], [t.x + BL_OUT_HX, BL_SURFACE_Y + 0.04, t.z + BL_OUT_HZ], 'invisible', 0);
  }
  // колпаки над столами до крыши: на стол не запрыгнуть и не встать (shared/tableguard.ts)
  for (const g of billiardsTableGuards()) {
    billiardsBoxes.push(b.boxes.length);
    b.box(g.min, g.max, 'invisible', 0);
  }
  for (const [x, z] of BL_POSTS) {
    billiardsBoxes.push(b.boxes.length);
    b.box([x - 0.09, 0, z - 0.09], [x + 0.09, 3.8, z + 0.09], 'invisible', 0);
  }
  // крыша навеса: камера за спиной не пролезает сквозь неё (снизу не достать — выше прыжка)
  billiardsBoxes.push(b.boxes.length);
  b.box([BL_HALL.x0 - 0.1, BL_HALL.eaveY, BL_HALL.z0], [BL_HALL.x1 + 0.2, BL_HALL.roofY + 0.05, BL_HALL.z1 + 0.2], 'invisible', 0);
  BL_TABLES.forEach((t, i) => add('billiards', t.x, t.z, 0, 1.9, i, 'бильярд'));

  // --- Далёкая красота: буи и лодки
  b.deco.push({ kind: 'buoy', x: -42, z: -12, color: 0xe0492f });
  b.deco.push({ kind: 'buoy', x: -8, z: 34, color: 0xf2c230 });
  b.deco.push({ kind: 'boat', x: -44, z: 26, yaw: 0.6, color: 0xe8e2d4 });
  b.deco.push({ kind: 'boat', x: 6, z: 40, yaw: 2.2, color: 0x5d8fb0 });

  // --- Гидроплан «Стриж» (флаг PLANE, shared/plane.ts): самолёт на воде рисует клиент, здесь — точка у края
  // набережной напротив него, точка заказа баннера перед табличкой и столбик таблички. Точки — в самый конец списка
  add('plane', PLANE_USE.x, PLANE_USE.z, Math.PI / 2, PLANE_USE.r, 0, 'Полёт над городом');
  add('banner', PLANE_SIGN.x + 1, PLANE_SIGN.z, Math.PI / 2, 1.8, 0, 'Баннер над набережной');
  // ещё два места рыбалки на удлинённом баркасе — точки в самый конец списка (номера прежних не меняются)
  BARKAS_FISH_SPOTS.slice(BARKAS_FISH_FIRST).forEach((s, i) => add('fish', s.x, s.z, s.yaw, 1.0, barkasSpotIndex(BARKAS_FISH_FIRST + i), 'порыбачить'));
  const planeBoxes = [b.boxes.length];
  b.box([PLANE_SIGN.x - 0.05, 0, PLANE_SIGN.z - 0.05], [PLANE_SIGN.x + 0.05, 1.9, PLANE_SIGN.z + 0.05], 'invisible', 0);

  // --- Оформление площади (shared/plaza2.ts, client/lobby/plaza): небольшие твёрдые предметы у входов — в самый конец
  const plazaBoxes: number[] = [];
  const plazaModeBoxes: Record<PlazaSolidMode, number[]> = { hide: [], regatta: [], fight: [], dungeon: [] };
  for (const p of plazaSolids()) {
    plazaBoxes.push(b.boxes.length);
    if (p.mode) plazaModeBoxes[p.mode].push(b.boxes.length);
    b.box([p.x - p.hx, p.y ?? 0, p.z - p.hz], [p.x + p.hx, (p.y ?? 0) + p.h, p.z + p.hz], 'invisible', 0);
  }

  const spawn: Spot = { x: 0, y: 0, z: 6, yaw: 0 };
  return {
    name: 'Набережная',
    boxes: b.boxes,
    spawns: [{ x: spawn.x, y: 0, z: spawn.z, yaw: spawn.yaw, team: 0 }],
    trampolines: b.trampolines,
    pickups: [],
    deco: b.deco,
    bounds: { minX: -30, maxX: 30, minZ: -26, maxZ: FISH_PIER_HEAD.z1 },
    spawn,
    gateSpawn: { x: 0, y: 0, z: -12.5, yaw: Math.PI },
    garageSpawn: { x: 15.2, y: 0, z: -12.4, yaw: Math.PI },
    fortSpawn: { x: FORT_ARCH.x, y: 0, z: FORT_ARCH.z + 2.4, yaw: Math.PI },
    skillSpawn: { x: SKILL_PORTAL.x, y: 0, z: -9.4, yaw: 0 },
    boatraceSpawn: { x: BOAT_RACE_CIRCLE.x, y: 0, z: BOAT_RACE_CIRCLE.z - 3.1, yaw: Math.PI },
    hideSpawn: { x: HIDE_CIRCLE.x, y: 0, z: HIDE_CIRCLE.z - 3.1, yaw: Math.PI },
    interact,
    machines,
    tables,
    benches,
    lighthouse: { x: -19, z: 43 },
    mirror,
    honorBoard,
    zones: {
      arcade: { x0: -28, z0: -26, x1: -12, z1: -16 },
      warehouse: { x0: -9, z0: -26, x1: 9, z1: -16 },
      garage: { x0: 13, z0: -26, x1: 28, z1: -16 },
      cafe: { x0: 24, z0: -10, x1: 30, z1: 4 },
      terrace: { x0: 14, z0: -9, x1: 23, z1: 15 },
      kiosk: { x0: -29.5, z0: -6, x1: -25.5, z1: 0 },
    },
    boatBoxes,
    boatArea,
    aquaMovers,
    fishPropsBoxes,
    skillPortalBoxes,
    ferryHomeBoxes,
    ferryAwayBoxes,
    jukeBoxes,
    ratBoxes,
    billiardsBoxes,
    planeBoxes,
    plazaBoxes,
    plazaModeBoxes,
  };
}
