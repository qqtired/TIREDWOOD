// Форма данных новой набережной (plaza3): docs/plaza3/level/layout.json → tools/plaza3/layout.mjs → shared/plaza3/layout.ts.
// Метры; x — восток, z — юг (север = −Z); yaw = 0 смотрит на −Z, поворот — как rotation.y в three.js.
// Решение целиком и правила для левел-дизайнера — docs/plaza3/tech-foundation.md (§1.3 данные, §7 геометрия).
// Раскладка уровня — v5.1 левел-дизайнера (concepts_blender/plaza3/layout), блокаут — WP2.
import type { Material, Vec3 } from '../maps/types.ts';

/** Четверть оборота: rot·90° вокруг старого центра группы (cx, cz) — как rotation.y, yaw растёт на rot·π/2 */
export type Rot = 0 | 1 | 2 | 3;

/** Жёсткий перенос старой сборки режима: поворот (если rot ≠ 0 — вокруг (cx, cz)), затем сдвиг на (dx, dz) */
export interface Xf {
  dx: number;
  dz: number;
  rot: Rot;
  cx?: number;
  cz?: number;
}

/**
 * Группы, которые переезжают целиком (§1.4): у каждой — свой якорь в layout.json. Подключают их пакеты WP3–WP8 в своих
 * shared/<режим>.ts (docs/plaza3/wp3-8.md); «Подземелье» не группа — вход стоит под углом, его точки абсолютные (modes)
 */
export type Plaza3Group =
  | 'slots' | 'billiards' | 'jukebox' | 'fishPodium' | 'fishBoard' | 'regatta' | 'boat' | 'rat' | 'plane' | 'hide' | 'aqua' | 'wheel'
  | 'farmGate' | 'marina' | 'udalaya';

/** Точка E: где встаёт игрок, куда смотрит, радиус подсветки */
export interface P3Use {
  x: number;
  z: number;
  yaw: number;
  r: number;
}

export interface P3Spot {
  x: number;
  z: number;
  yaw: number;
}

export interface P3Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export type P3Pt = [number, number];

/** Литералы buildLobby(), которые зависят от площади (§1.5 п. 1): в старой раскладке — те же числа в shared/maps/lobby.ts */
export interface Plaza3Lobby {
  spawn: P3Spot;
  pbGate: P3Use;
  kiosk: P3Use;
  mirror: P3Spot;
  /** Доска почёта (прямоугольник на земле); в старой раскладке «Последние входы» — с обратной (северной) стороны */
  honorBoard: P3Rect;
  honor: P3Use;
  /** «Последние входы» / «Кто на набережной» (точка recent, №41) */
  recent: P3Use;
  kboard: P3Use;
  lamps: P3Pt[];
  bollardsWest: { x: number; zs: number[] };
  bollardsSouth: { z: number; xs: number[] };
  gateSpawn: P3Spot;
  garageSpawn: P3Spot;
  skillSpawn: P3Spot;
  fortSpawn: P3Spot;
  lighthouse: { x: number; z: number };
  zones: { arcade: P3Rect; warehouse: P3Rect; garage: P3Rect; cafe: P3Rect; terrace: P3Rect; kiosk: P3Rect };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Константы уровня модуля shared/maps/lobby.ts, которые в plaza3 ставятся заново (абсолютные точки) */
export interface Plaza3Modes {
  /** Столы дурака и блэкджека (BJ_TABLE — номер в этом списке); сервер берёт только их число */
  tables: Array<{ x: number; z: number; yaw?: number }>;
  /** Корпуса автоматов и места игры; ids — прежний порядок 0…4. */
  slotPoses: Array<{ body: P3Spot; use: P3Spot }>;
  /** Поля табло казино из GLB-якорей; yaw — поворот плоскости, лицевая сторона по локальной +Z. */
  casinoBoards: Record<'jackpot' | 'losers', P3Spot & { y: number; w: number; h: number }>;
  /** Дополнительная скамья бельведера: существующие места 18–23 не перенумеровываются. */
  sunsetBench: P3Spot & { y: number; offset: number };
  /** Стойки перголы над столами (CANOPY_POLES) и их высота */
  pergola: { posts: P3Pt[]; h: number };
  trampolines: P3Pt[];
  /** Скамьи с местами 18–23 (их три — номера точек не меняются) */
  benches: { xs: number[]; z: number };
  /** Скамьи кольца площади — пока без мест (WP8) */
  benchesRing: P3Pt[];
  planters: P3Pt[];
  lampFort: { x: number; z: number };
  kartStart: { x: number; z: number; r: number };
  fortArch: { x: number; z: number; w: number };
  skillPortal: { x: number; z: number; r: number };
  dungeonUse: { x: number; z: number; r: number; yaw: number };
  dungeonReturn: P3Spot;
  /** Корень plaza_entrance.glb и доска рекордов — для WP6 (shared/plaza2.ts DUNGEON_ROCK / DUNGEON_BOARD) */
  dungeonRock: P3Spot;
  dungeonBoard: P3Spot;
}

/** Суша: многоугольник настила (y = deckY), массив скалы, поле фермы и задник до города (y = streetY), рамка города */
export interface Plaza3Land {
  polygon: P3Pt[];
  cliff: P3Pt[];
  field: P3Pt[];
  backlot: P3Pt[];
  deckY: number;
  streetY: number;
  /** Рамка «площади» для рельефа и задника города (client/lobby/world.ts PLAZA_E/N и копия в shared/plane.ts) */
  town: { e: number; n: number };
}

/** Твёрдое новой площади (AABB): настил ('deck'), стены ('invisible'), павильоны-коробки блокаута; q — квартал (один меш на квартал) */
export interface P3Collider {
  id: string;
  q: string;
  min: Vec3;
  max: Vec3;
  mat?: Material;
  color?: number;
  /** Павильон-модель (client/lobby/plaza3/pavdata.ts): коробку блокаута прячут, когда его GLB встал; твёрдое остаётся */
  pav?: string;
}

/** Только вид, без твёрдого: коробка (центр c, размер s, поворот yaw) или цилиндр/конус (низ c, радиус r, высота h) */
export interface P3Decor {
  q: string;
  t: 'box' | 'cyl' | 'cone';
  c: Vec3;
  s?: Vec3;
  r?: number;
  h?: number;
  yaw?: number;
  color: number;
  /** Павильон-модель: фигура блокаута прячется, когда его GLB встал */
  pav?: string;
}

/** Пятно на земле: площадь, роза, песок, газон, гравий, грунтовка */
export interface P3Ground {
  kind: 'plaza' | 'rose' | 'sand' | 'lawn' | 'gravel' | 'dirt';
  poly?: P3Pt[];
  circle?: { x: number; z: number; r: number };
}

/** Променад: ломаная и ширина */
export interface P3Path {
  id: string;
  kind: string;
  w: number;
  pts: P3Pt[];
}

export interface P3Quarter {
  id: string;
  name: string;
  poly?: P3Pt[];
  circle?: { x: number; z: number; r: number };
}

/** Павильон из раскладки (для арта WP9): след, высота, куда смотрит фасад (компас, °) */
export interface P3Pavilion {
  id: string;
  q: string;
  name: string;
  box?: P3Rect;
  h: number;
  top?: number;
  face: number;
  glb?: string;
}

export interface Plaza3Layout {
  version: number;
  /** Скелет WP0: plaza3 побитно совпадает со старой площадью (test/plaza3-map.test.ts). Левел-дизайн (WP1) ставит false */
  skeleton: boolean;
  /** true — строить старую статику (настил, павильоны plaza2), пока нет блокаута новой суши (WP2 ставит false) */
  legacyStatic: boolean;
  /** Центральная площадь: от неё до любого входа ≤ maxFromCenter */
  center: { x: number; z: number };
  /** Предел «от центра до входа по прямой», м: по умолчанию и для кварталов-исключений */
  maxFromCenter: { default: number; games: number; farm: number };
  anchors: Record<Plaza3Group, Xf>;
  lobby: Plaza3Lobby;
  modes: Plaza3Modes;
  land: Plaza3Land;
  ground: P3Ground[];
  paths: P3Path[];
  quarters: P3Quarter[];
  colliders: P3Collider[];
  decor: P3Decor[];
  pavilions: P3Pavilion[];
  /**
   * Вывески (WP10), столбы-указатели, жители (WP11) — места из раскладки. Вывеска: центр поля (x, y, z), куда оно смотрит
   * (yaw: 0 — на −Z), размер w × h, м; back — центр поля на обратной стороне (вывеска висит двусторонняя).
   * Данные берутся из якорей anchor_sign_* моделей: node tools/plaza3/signs.mjs
   */
  signs: Array<{ id: string; text: string; x: number; y: number; z: number; yaw: number; w: number; h: number; back?: Vec3 }>;
  posts: Array<{ id: string; x: number; z: number; name: string; arrows: string[] }>;
  npcs: Array<{ id: string; name: string; x: number; z: number }>;
  /** Надпись TIREDWOOD: азимут с колеса, ось и высота холма, изолиния букв; коридор вида (дома ≤ 2 этажей, без рощ) */
  sign: {
    bearingDeg: number;
    hillBearingDeg: number;
    hillUp: number;
    lineY: number;
    corridor: { x: number; z: number; a0: number; a1: number; dMax: number; floorsMax: number };
  };
  /** Выезд на ферму (WP7): арка, калитка, зона перехода, возврат, телега */
  farmRoad: {
    arch: { x: number; z: number; posts: P3Pt[] };
    gate: P3Spot;
    use: { x: number; z: number; r: number };
    zone: P3Rect;
    spawnBack: P3Spot;
    cart: { x: number; z: number };
  };
  /** Порт B «Маячный мол» (WP4): мол, голова, сходни, места ловли, стоянка, «Удалая», Семён, Рыбная витрина */
  port: Record<string, unknown>;
  /** Аркадные автоматы (WP12): точки 'arcade' — №113 и дальше, arg = номер в этом списке */
  arcade: P3Use[];
}
