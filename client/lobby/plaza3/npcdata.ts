// Жители новой набережной (флаг PLAZA3, WP11): кто где стоит, куда смотрит, что говорит и как живёт в ожидании.
// Чистые данные без three.js и DOM — их проверяет test/plaza3-npc.test.ts. Состав, облик и реплики — по
// concepts_blender/plaza3/npc/roster.md, модели — client/assets/plaza3/npc/<id>.glb (части по userData.animation_part:
// models/README.md, README-b.md). Места — якоря `anchor_resident` павильонов (pavilions/models/manifest*.json) и
// `npcs` в docs/plaza3/level/layout.json (имена там устарели — верны имена отсюда); Мирона в раскладке нет — он у штатива
// фото на площадке маяка. Рисует и оживляет их client/lobby/plaza3/npc.ts (все 17 — одной сеткой с жёсткими костями).
// У прежних зазывал (Паша, Зуко, Вова, Гена, Бочка, Борис, Сева, Тоня, Лёва) реплики и поведение — как в plaza2
// (client/lobby/plaza/data.ts TOUT_INFO и live.ts liveLines): новая только модель. Галю ведёт калитка фермы
// (client/farm/lobbygate.ts) через npcHandle('galya').
import type { PlazaMode } from '../plaza/index.ts';
import { TOUT_INFO, type ToutKey } from '../plaza/data.ts';
import { FARM_LAYOUT } from '../../../shared/farmlayout.ts';
import { FARM_PLAZA_GATE } from '../../../shared/farmmap.ts';
import { PLAZA3 } from '../../../shared/layout.ts';
import { P3 } from '../../../shared/plaza3/layout.ts';

/** Жители plaza3 рисуются (оформление plaza3 вместо plaza2 — тот же выбор, что в client/lobby/scene.ts) */
export const NPC3 = PLAZA3 && !P3.legacyStatic;

export type NpcId =
  | 'zhetonych' | 'lyonya' | 'tonya' | 'miron' | 'seva' | 'boris' | 'bochka' | 'tolik' | 'asya'
  | 'lyova' | 'liza' | 'pasha' | 'gena' | 'zuko' | 'vova' | 'shura' | 'galya';

/** Части модели (userData.animation_part) и корень — место жителя на площади */
export type NpcPart = 'root' | 'body' | 'eyes' | 'lid' | 'hand.L' | 'hand.R' | 'prop' | 'prop.L' | 'prop.R' | 'live' | 'static' | 'tag';
export const NPC_PARTS: readonly NpcPart[] = ['root', 'body', 'eyes', 'lid', 'hand.L', 'hand.R', 'prop', 'prop.L', 'prop.R', 'live', 'static', 'tag'];
/** Без них житель не собирается */
export const NPC_REQUIRED: readonly NpcPart[] = ['body', 'eyes', 'hand.L', 'hand.R', 'tag'];

/** О чём говорит: ключ зазывалы plaza2 (живые реплики — liveLines) или свой статус */
export type NpcTalk = ToutKey | 'slots' | 'billiards' | 'lighthouse' | 'plane' | 'wardrobe' | 'ratrace' | 'dungeon' | 'farm';

type V3 = readonly [number, number, number];

/**
 * Ход ожидания: смещение части от покоя на отрезке цикла [t; t + d] (с). pos — метры, rot — радианы (оси модели: x —
 * вправо, y — вверх, −z — лицо), scl — добавка к масштабу. Форма: hold — плавно туда, подержать, обратно; arc — туда и
 * сразу обратно; osc — n колебаний ±, затухающих к краям; spin — равномерно от 0 до rot (целые обороты — без шва).
 */
export interface IdleMove {
  p: Exclude<NpcPart, 'root' | 'tag'>;
  t: number;
  d: number;
  e: 'hold' | 'arc' | 'osc' | 'spin';
  n?: number;
  pos?: V3;
  rot?: V3;
  scl?: V3;
}

export interface NpcDef {
  id: NpcId;
  name: string;
  /** Цвет кружка на табличке имени */
  accent: string;
  talk: NpcTalk;
  /** Режим за флагом сервера: пока он выключен, житель не стоит у входа */
  mode: PlazaMode | null;
  x: number;
  z: number;
  y: number;
  /** Куда смотрит в покое (0 → −Z, как взгляд игрока) */
  yaw: number;
  /** Реплики без живого статуса */
  lines: readonly string[];
  /** Здоровается репликой, когда подходишь (новые жители); прежние зазывалы только машут — как в plaza2 */
  greet: boolean;
  /** Чем машет подошедшему и насколько поднимает руку (м, оси модели) */
  wave: { hand: 'hand.L' | 'hand.R'; lift: V3 };
  /** Цикл ожидания: длина (с) и ходы частей */
  idle: { len: number; moves: readonly IdleMove[] };
  /** Поведение у другого модуля (место, поворот, взмах, реплики — через npcHandle) */
  ext?: boolean;
  /** Стоит внутри твёрдого по замыслу: Бочка — в бочке двора, Тоня — в нише окна кафе */
  inside?: string;
  /** id в layout.json → npcs, если житель там есть */
  layout?: string;
}

/** Курс из (x, z) на точку (tx, tz): yaw = 0 смотрит в −Z (как yawToward у зазывал) */
export function toward(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

const C = P3.center;
/** К центру площади («Роза ветров») */
const center = (x: number, z: number): number => +toward(x, z, C.x, C.z).toFixed(3);
const HALF_PI = Math.PI / 2;
const TURN = Math.PI * 2;

const tout = (key: ToutKey): Pick<NpcDef, 'name' | 'accent' | 'lines' | 'talk' | 'greet'> => ({
  name: TOUT_INFO[key].name, accent: TOUT_INFO[key].accent, lines: TOUT_INFO[key].lines, talk: key, greet: false,
});

const R: NpcDef['wave'] = { hand: 'hand.R', lift: [0.1, 0.45, -0.12] };
const L: NpcDef['wave'] = { hand: 'hand.L', lift: [-0.1, 0.45, -0.12] };

/** Калитка фермы: Галя стоит у неё (место и поворот — её логика в client/farm/lobbygate.ts) */
const GATE = FARM_PLAZA_GATE;

export const NPCS: readonly NpcDef[] = [
  // ---------------------------------------------------------------- игровой квартал
  {
    id: 'zhetonych', name: 'Жетоныч', accent: '#9b1b30', talk: 'slots', mode: null, layout: 'kurzal',
    // Кафейный проулок у западной двери курзала, лицом вдоль проулка к скверу
    x: 45.2, z: 4.6, y: 0, yaw: 0.45, greet: true, wave: L,
    lines: [
      'Заходи, тут всё звенит и мигает!',
      'Автоматы налево, аркада направо — выбирай',
      'Рычаг тяни уверенно: автоматы это любят',
      'Три аркады с рекордами. Побей чужой!',
      'Проиграл? Зато попадёшь в «Топ проигравших»!',
      'Жетон к жетону — так и копится джекпот',
    ],
    idle: {
      len: 4, moves: [
        { p: 'body', t: 0, d: 0.6, e: 'hold', scl: [0.03, -0.06, 0.03] },
        { p: 'hand.R', t: 0.4, d: 0.6, e: 'arc', pos: [0, 0.1, 0] },
        { p: 'prop', t: 0.6, d: 1, e: 'arc', pos: [0, 0.4, 0] },
        { p: 'prop', t: 0.6, d: 1, e: 'spin', rot: [2 * TURN, 0, 0] },
        { p: 'body', t: 1.6, d: 0.5, e: 'arc', scl: [-0.015, 0.035, -0.015] },
      ],
    },
  },
  {
    id: 'lyonya', name: 'Маркёр Лёня', accent: '#2f7d4f', talk: 'billiards', mode: null, layout: 'billiards',
    // у восточного края бильярдной лоджии, лицом к столам
    x: 49.6, z: 15.6, y: 0, yaw: 1.862, greet: true, wave: L,
    lines: [
      'Партию? Сукно свежее, шары как новые',
      'Кий держи легче — шар сам знает дорогу',
      'Мел — на кончик кия. Не на нос: носа у тебя нет',
      'Тут играют вдвоём: зови соперника',
      'Тихо. Человек целится',
      'Сначала разбой, потом разговоры',
    ],
    idle: {
      len: 5, moves: [
        { p: 'hand.L', t: 0.3, d: 2.4, e: 'hold', pos: [0.12, 0.35, -0.14] },
        { p: 'hand.L', t: 0.7, d: 1.6, e: 'osc', n: 3, pos: [0.04, 0.03, 0] },
        { p: 'body', t: 2.6, d: 0.5, e: 'arc', scl: [0.015, -0.03, 0.015] },
        { p: 'body', t: 3, d: 2, e: 'osc', n: 1, rot: [0, 0, 0.05] },
      ],
    },
  },
  {
    id: 'tonya', ...tout('cafe'), mode: null, layout: 'cafe',
    // в нише окна-прилавка кафе (anchor_barista), лицом к веранде с картами
    x: 35.6, z: 2, y: 0, yaw: HALF_PI, wave: R, inside: 'ниша окна кафе «Чайка» (за прилавком)',
    idle: {
      len: 4, moves: [
        { p: 'hand.R', t: 0.2, d: 2, e: 'hold', pos: [-0.08, 0.1, -0.1] },
        { p: 'hand.R', t: 0.4, d: 1.6, e: 'osc', n: 2, pos: [0.04, 0.03, 0] },
        { p: 'prop.L', t: 0, d: 4, e: 'osc', n: 2, rot: [0, 0, 0.06] },
        { p: 'body', t: 0, d: 4, e: 'osc', n: 1, rot: [0, 0, 0.035] },
      ],
    },
  },
  // ---------------------------------------------------------------- порт
  {
    id: 'miron', name: 'Смотритель Мирон', accent: '#ffd23f', talk: 'lighthouse', mode: null,
    // площадка маяка: сбоку от входа с мостков, у штатива фото, лицом к мосткам
    x: -15.8, z: 39.2, y: 0, yaw: +toward(-15.8, 39.2, -19, 34).toFixed(3), greet: true, wave: L,
    lines: [
      'С маяка всю бухту видно. И чаек, и рыбу',
      'Встань у штатива — сниму тебя на память',
      'Ловят с мостков и с Маячного мола',
      'Тише. Рыба всё слышит',
      'Чай с маяка — самый тёплый на набережной',
      'Дед Семён — в лавке у мостков',
    ],
    idle: {
      len: 5, moves: [
        { p: 'hand.R', t: 0.2, d: 2.4, e: 'hold', pos: [-0.3, 0.42, -0.25] },
        { p: 'body', t: 0.4, d: 2, e: 'hold', rot: [0, -0.26, 0] },
        { p: 'hand.L', t: 3, d: 1.6, e: 'hold', pos: [0.25, 0.25, -0.28] },
        { p: 'body', t: 3.2, d: 1.2, e: 'hold', rot: [0.06, 0, 0] },
      ],
    },
  },
  {
    id: 'seva', ...tout('boat'), mode: null, layout: 'lastochka',
    // у трапа «Ласточки», лицом к променаду
    x: 3.8, z: 20.4, y: 0, yaw: center(3.8, 20.4), wave: R,
    idle: {
      len: 4, moves: [
        { p: 'hand.L', t: 0.2, d: 2.2, e: 'hold', pos: [0.12, 0.3, -0.05] },
        { p: 'hand.R', t: 0.8, d: 1.2, e: 'hold', pos: [-0.25, 0.4, -0.45] },
        { p: 'hand.R', t: 1, d: 0.8, e: 'osc', n: 3, pos: [0, 0.04, 0] },
        { p: 'body', t: 2.6, d: 0.4, e: 'arc', pos: [0, 0.03, 0] },
      ],
    },
  },
  {
    id: 'boris', ...tout('regatta'), mode: 'regatta', layout: 'regatta',
    // у мачт старта, сбоку от круга сбора, лицом к променаду
    x: 13.4, z: 16.2, y: 0, yaw: center(13.4, 16.2), wave: L,
    idle: {
      len: 4, moves: [
        { p: 'hand.R', t: 0.3, d: 0.35, e: 'arc', pos: [0, 0.06, -0.06] },
        { p: 'body', t: 0.25, d: 0.3, e: 'arc', scl: [0.03, -0.05, 0.03] },
        { p: 'body', t: 0.55, d: 0.3, e: 'arc', scl: [-0.02, 0.04, -0.02] },
        { p: 'hand.R', t: 1, d: 0.35, e: 'arc', pos: [0, 0.06, -0.06] },
        { p: 'body', t: 0.95, d: 0.3, e: 'arc', scl: [0.03, -0.05, 0.03] },
        { p: 'body', t: 1.25, d: 0.3, e: 'arc', scl: [-0.02, 0.04, -0.02] },
      ],
    },
  },
  {
    id: 'bochka', ...tout('hide'), mode: 'hide', layout: 'hide',
    // в бочке «Рыбного двора» (YARD_BARREL — твёрдая, бочка жителя рисуется вместо неё), лицом к воротам двора
    x: -4, z: 16.7, y: 0, yaw: 0, wave: { hand: 'hand.R', lift: [0, 0.22, 0] }, inside: 'бочка «Рыбного двора» (YARD_BARREL)',
    idle: {
      len: 6, moves: [
        { p: 'body', t: 0.3, d: 2.6, e: 'hold', pos: [0, -0.25, 0] },
        { p: 'hand.R', t: 0.3, d: 2.6, e: 'hold', pos: [0, -0.12, 0] },
        { p: 'body', t: 3.2, d: 2.4, e: 'osc', n: 1.5, rot: [0, 0.35, 0] },
      ],
    },
  },
  {
    id: 'tolik', name: 'Букмекер Толик', accent: '#7a3f9e', talk: 'ratrace', mode: null, layout: 'ratrace',
    // у тумбы букмекера на берегу у понтона бегов
    x: -11.6, z: 20.6, y: 0, yaw: 0, greet: true, wave: L,
    lines: [
      'Крысиные бега! Ставки — у табло',
      'Пуля рвёт со старта, Соня берёт на финише',
      'Барон — старый чемпион. Но и чемпионы устают',
      'Кексик опять что-то жуёт. Я бы подумал',
      'Ставка от 5 до 1000. Жми E у табло',
      'Болей громче — крыса услышит!',
    ],
    idle: {
      len: 4, moves: [
        { p: 'hand.R', t: 0.3, d: 0.3, e: 'arc', pos: [0, 0.06, -0.04] },
        { p: 'body', t: 0.8, d: 1.8, e: 'hold', rot: [0, -0.35, 0] },
        { p: 'hand.L', t: 2.8, d: 0.3, e: 'arc', pos: [0.05, -0.08, 0] },
        { p: 'hand.L', t: 3.2, d: 0.3, e: 'arc', pos: [0.05, -0.08, 0] },
      ],
    },
  },
  {
    id: 'asya', name: 'Пилот Ася', accent: '#1fb5b0', talk: 'plane', mode: null, layout: 'plane',
    // на причале гидроплана у будки аэроклуба, лицом к площади
    x: -26.4, z: -12.4, y: 0, yaw: -HALF_PI, greet: true, wave: L,
    lines: [
      'Гидроплан «Стриж»! Три минуты над городом',
      'Полёт — 100 жетонов. Вид — бесценный',
      'Мышь ведёт нос, Shift — быстрее',
      'Над крышами не снижайся — чайки ругаются',
      'За хвостом можно пустить баннер с твоими словами',
      'Пристегнись. Шучу: ты же желе',
    ],
    idle: {
      len: 5, moves: [
        { p: 'body', t: 0.2, d: 2.6, e: 'hold', rot: [0.1, 0, 0] },
        { p: 'body', t: 0.4, d: 2.2, e: 'osc', n: 1, rot: [0, 0.26, 0] },
        { p: 'hand.L', t: 3.2, d: 1, e: 'osc', n: 2, pos: [0.05, 0.06, 0] },
      ],
    },
  },
  // ---------------------------------------------------------------- пляж
  {
    id: 'lyova', ...tout('aqua'), mode: null, layout: 'aquapark',
    // у ворот аквапарка сбоку от мостика, лицом к площади
    x: -27.2, z: 11.6, y: 0, yaw: -HALF_PI, wave: R,
    idle: {
      len: 4, moves: [
        { p: 'body', t: 0.2, d: 0.3, e: 'arc', scl: [-0.02, 0.04, -0.02] },
        { p: 'body', t: 0.6, d: 0.3, e: 'arc', scl: [-0.02, 0.04, -0.02] },
        { p: 'body', t: 1.4, d: 2.4, e: 'osc', n: 1, rot: [0, 0.35, 0] },
      ],
    },
  },
  {
    id: 'liza', name: 'Модистка Лиза', accent: '#b39ddb', talk: 'wardrobe', mode: null, layout: 'wardrobe',
    // у входа в примерочную, сбоку от мест примерки
    x: -24.4, z: 1.8, y: 0, yaw: -HALF_PI, greet: true, wave: { hand: 'hand.R', lift: [-0.05, 0.2, -0.35] },
    lines: [
      'Примерочная! Зеркало честное, я тоже',
      'Шапку набок — и ты уже звезда',
      'Три кабинки, все твои. Жми E у зеркала',
      'Этот цвет тебе к лицу. А лицо — к цвету',
      'Горошек нынче снова в моде',
    ],
    idle: {
      len: 4, moves: [
        { p: 'hand.R', t: 0.2, d: 1.8, e: 'hold', pos: [-0.2, 0.15, -0.25] },
        { p: 'body', t: 0.3, d: 1.6, e: 'hold', rot: [0, -0.17, 0] },
        { p: 'hand.L', t: 2.2, d: 1.2, e: 'hold', pos: [0.05, 0.7, -0.05] },
        { p: 'body', t: 2.4, d: 1.4, e: 'osc', n: 1, rot: [0, 0, 0.04] },
      ],
    },
  },
  // ---------------------------------------------------------------- арены
  {
    id: 'pasha', ...tout('paint'), mode: null, layout: 'paintball',
    // у ворот «Склада №3» слева от круга старта, лицом к площади
    x: 1.6, z: -27.6, y: 0, yaw: center(1.6, -27.6), wave: L,
    idle: {
      len: 4, moves: [
        { p: 'body', t: 0.3, d: 2.6, e: 'osc', n: 1, rot: [0, 0.26, 0] },
        { p: 'hand.R', t: 0.2, d: 2.8, e: 'hold', pos: [0, 0.12, -0.05] },
        { p: 'hand.L', t: 0.2, d: 2.8, e: 'hold', pos: [0, 0.12, -0.05] },
        { p: 'prop', t: 0.6, d: 1.2, e: 'osc', n: 4, rot: [0, 0, 0.06] },
      ],
    },
  },
  {
    id: 'gena', ...tout('kart'), mode: null, layout: 'karting',
    // у рольставни гаража справа от круга старта
    x: 36.4, z: -27.9, y: 0, yaw: center(36.4, -27.9), wave: { hand: 'hand.R', lift: [0, 0.5, -0.05] },
    idle: {
      len: 4, moves: [
        { p: 'hand.R', t: 0.3, d: 1.8, e: 'hold', pos: [-0.42, -0.09, -0.52] },
        { p: 'hand.L', t: 0.3, d: 1.8, e: 'hold', pos: [0.35, 0.08, -0.4] },
        { p: 'hand.R', t: 0.7, d: 1, e: 'osc', n: 2, pos: [0, 0.07, 0] },
        { p: 'body', t: 0.7, d: 1, e: 'osc', n: 2, rot: [0.05, 0, 0] },
      ],
    },
  },
  {
    id: 'zuko', ...tout('fort'), mode: 'fort', layout: 'fortress',
    // у арки крепости сбоку от круга старта
    x: 29.8, z: -27.6, y: 0, yaw: center(29.8, -27.6), wave: { hand: 'hand.R', lift: [0, 0.14, 0] },
    idle: {
      len: 4, moves: [
        { p: 'hand.L', t: 0, d: 4, e: 'osc', n: 2, pos: [0, 0.05, 0] },
        { p: 'hand.R', t: 0, d: 4, e: 'osc', n: 2, pos: [0, -0.05, 0] },
        { p: 'body', t: 0, d: 4, e: 'osc', n: 1, rot: [0, 0, 0.09] },
        { p: 'body', t: 2.6, d: 1, e: 'arc', scl: [-0.025, 0.05, -0.025] },
      ],
    },
  },
  {
    id: 'vova', ...tout('sky'), mode: 'sky', layout: 'kalancha',
    // у портала у подножия каланчи, сбоку от прохода
    x: -10.6, z: -27.8, y: 0, yaw: center(-10.6, -27.8), wave: R,
    idle: {
      len: 4, moves: [
        { p: 'prop', t: 0, d: 4, e: 'osc', n: 1, rot: [0, 0, 0.14] },
        { p: 'body', t: 0.6, d: 0.35, e: 'arc', pos: [0, 0.08, 0] },
        { p: 'body', t: 0.95, d: 0.15, e: 'arc', scl: [0.03, -0.06, 0.03] },
        { p: 'body', t: 1.1, d: 0.35, e: 'arc', pos: [0, 0.08, 0] },
        { p: 'body', t: 2.2, d: 1.4, e: 'hold', rot: [0.1, 0, 0] },
      ],
    },
  },
  // ---------------------------------------------------------------- скалы
  {
    id: 'shura', name: 'Шахтёр Шура', accent: '#d6336c', talk: 'dungeon', mode: 'dungeon', layout: 'dungeon',
    // у зева пещеры со стороны площади, рядом с доской рекордов (якорь модели скалы −14,2; −33,6 — в 0,2 м от вагонетки)
    x: -13.6, z: -33.4, y: 0, yaw: center(-13.6, -33.4), greet: true, wave: { hand: 'hand.L', lift: [0.2, 0.15, -0.3] },
    lines: [
      'Под набережной кто-то варит варенье…',
      'Внизу темно. Фонарь не гаси',
      'Крысы там погребные. Не беговые',
      'Слышишь, булькает? Это котёл Барона',
      'Десять волн — и выползет Старый Повидл',
      'Жми E у пещеры. Я посвечу',
    ],
    idle: {
      len: 5, moves: [
        { p: 'hand.L', t: 0.2, d: 2.6, e: 'hold', pos: [0.25, 0.1, -0.3] },
        { p: 'prop.L', t: 0.2, d: 4.6, e: 'osc', n: 3, rot: [0, 0, 0.17] },
        { p: 'body', t: 0.4, d: 2.2, e: 'hold', rot: [-0.14, 0, 0] },
        { p: 'body', t: 3, d: 1.8, e: 'hold', rot: [0, 0.44, 0] },
      ],
    },
  },
  // ---------------------------------------------------------------- выезд в поле
  {
    id: 'galya', name: 'Фермерша Галя', accent: '#d9913c', talk: 'farm', mode: null, ext: true, greet: false,
    // место и поворот — у калитки фермы (FarmGate ставит её каждый кадр); здесь — те же числа для проверки
    x: GATE.tout.x, z: GATE.tout.z, y: 0, yaw: FARM_LAYOUT.plazaGate.anchor.yaw + Math.PI, wave: R,
    lines: [],
    idle: {
      len: 4, moves: [
        { p: 'hand.L', t: 0.2, d: 0.9, e: 'arc', pos: [0, 0.14, 0] },
        { p: 'hand.R', t: 1.4, d: 1.4, e: 'hold', pos: [-0.3, 0.15, -0.3] },
        { p: 'hand.R', t: 1.6, d: 1, e: 'osc', n: 2, pos: [0.06, 0, 0] },
        { p: 'body', t: 0, d: 4, e: 'osc', n: 1, rot: [0, 0, 0.035] },
      ],
    },
  },
];

// ------------------------------------------------------------ свои статусы новых жителей

/** Что знают новые жители кроме LiveIn (null — данных нет: говорят обычные реплики) */
export interface NpcStatusIn {
  /** «Подземелье»: лучший забег и лучший за неделю (client/lobby/dgstatus.ts) */
  dg: { top: { nick: string; waves: number } | null; week: { nick: string; waves: number } | null } | null;
  /** Сезон рыбалки (client/lobby/fishseason.ts): идёт ли и сколько мс до конца / до начала */
  season: { on: boolean; left: number } | null;
  /** Вещь дня в примерочной (имя из каталога shared/outfit.ts) */
  fashion: string | null;
}

const cut = (s: string): string => (s.length > 60 ? `${s.slice(0, 59)}…` : s);

/** «12 мин», «1 ч 5 мин», «40 с» */
function wait(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s} с`;
  const m = Math.ceil(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? (m % 60 ? `${h} ч ${m % 60} мин` : `${h} ч`) : `${m} мин`;
}

/** «7 волн», «21 волна» */
function waves(n: number): string {
  const a = n % 100;
  const b = a % 10;
  return `${n} ${a > 10 && a < 20 ? 'волн' : b === 1 ? 'волна' : b > 1 && b < 5 ? 'волны' : 'волн'}`;
}

/** Реплики нового жителя по статусу его места; пусто — говорит обычные (до 60 знаков, как у зазывал) */
export function npcStatusLines(talk: NpcTalk, s: NpcStatusIn): string[] {
  switch (talk) {
    case 'dungeon': {
      const d = s.dg;
      if (!d) return [];
      if (!d.top) return ['Рекордов ещё нет. Будь первым!'];
      const out = [cut(`Рекорд — ${waves(d.top.waves)}, ${d.top.nick}. Побьёшь?`)];
      if (d.week && (d.week.nick !== d.top.nick || d.week.waves !== d.top.waves)) out.push(cut(`За неделю лучший — ${d.week.nick}: ${waves(d.week.waves)}`));
      return out;
    }
    case 'lighthouse': {
      const f = s.season;
      if (!f) return [];
      return [f.on ? cut(`Сезон рыбалки! Клюёт вовсю ещё ${wait(f.left)}`) : cut(`До сезона рыбалки ${wait(f.left)}. Проверь удочку`)];
    }
    case 'wardrobe':
      return s.fashion ? [cut(`Сегодня в моде: ${s.fashion}. Примерь!`)] : [];
    default:
      return [];
  }
}

/** Вещь дня: одна на всех в этот день (UTC), из обычных и редких вещей узора, глаз, шапки и аксессуара */
export function fashionOfDay(items: ReadonlyArray<{ slot: string; name: string; tier: string }>, now: number): string | null {
  const pool = items.filter((it) => (it.tier === 'common' || it.tier === 'rare') && 'peha'.includes(it.slot));
  if (!pool.length) return null;
  const day = Math.floor(now / 86_400_000);
  const name = pool[(day * 7919) % pool.length].name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

// ------------------------------------------------------------ жители под чужой логикой

/**
 * Пульт жителя, которого ведёт другой модуль (Галя — калитка фермы): тот ставит место и поворот, просит помахать
 * и сказать реплику; npc.ts каждый кадр забирает это и сам рисует ожидание, табличку и облачко.
 */
export class NpcHandle {
  on = false;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  /** Сколько раз просили помахать (npc.ts помнит, сколько уже отработал) */
  waves = 0;
  /** Последняя реплика и её номер */
  line = '';
  lines = 0;

  place(x: number, y: number, z: number, yaw: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
  }

  wave(): void {
    this.waves++;
  }

  say(text: string): void {
    this.line = text;
    this.lines++;
  }
}

const HANDLES = new Map<NpcId, NpcHandle>();

/** Пульт жителя по id (один на всю игру) */
export function npcHandle(id: NpcId): NpcHandle {
  let h = HANDLES.get(id);
  if (!h) HANDLES.set(id, (h = new NpcHandle()));
  return h;
}
