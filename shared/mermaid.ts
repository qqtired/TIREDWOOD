// Русалка у мостков к маяку: когда выплывает, с какого борта и что делает. Сервер о ней не знает, сообщений нет — всё
// чистая функция серверного тика лобби. Тик у всех игроков один и тот же (ClockSync в client/net.ts), поэтому все видят её
// одновременно, с одной стороны и в одном и том же движении; кто вошёл посреди появления, застанет её на нужной секунде.
// Без three.js и DOM — проверяется в node (test/mermaid.test.ts). Модель, сердечки, всплески и звук — client/lobby/mermaid.ts.
import { TICK_RATE, WATER_Y } from './constants.ts';
import { FISH_SPOTS, type FishSpot } from './fishplaces.ts';
import { CRITTER_QUIET_ZONE } from './maps/critters.ts';
import type { MapBox } from './maps/types.ts';
import { clamp, hashFloat, lerp } from './math.ts';

/**
 * Расписание: окно 300 с, в каждом окне — одно появление на 120…180-й секунде. Между соседними появлениями выходит
 * 240…360 с (4–6 минут, в среднем 5), а первое — не раньше второй минуты после запуска сервера.
 */
export const MERMAID_WINDOW_S = 300;
export const MERMAID_FROM_S = 120;
export const MERMAID_SPREAD_S = 60;
/** Сколько длится появление: всплеск, взмахи, сердечки, нырок и круги на воде */
export const MERMAID_SHOW_S = 9.2;

// ------------------------------------------------------------ где: считается по местам рыбалки и настилу
//
// Ничего не записано координатами. Борта и места всплытия выводятся из тех же данных, что рисуют и держат пирс:
//  · места рыбалки пирса — FISH_SPOTS (shared/fishplaces.ts: где стоят и куда смотрят; баркас не берём);
//  · настил — боксы карты лобби (shared/maps/lobby.ts, buildLobby().boxes: мостки, площадка маяка, FISH_DECKS и всё,
//    что к ним пристроят): от места по ходу заброса идём до края настила — это кромка борта;
//  · памятник — CRITTER_QUIET_ZONE (shared/maps/critters.ts): рядом с ним русалка не появляется.
// Борт — ряд из трёх и более мест, смотрящих в одну сторону; между двумя соседними местами одного ряда (на ровной кромке) —
// промежуток, где поплавки и леска не проходят: там она и всплывает. Удлинят пирс или сдвинут места — борта и промежутки
// пересчитаются сами, русалка окажется у новых мест (test/mermaid.test.ts проверяет и сдвиг, и удлинение).

/** Один промежуток между соседними местами борта: точка на кромке настила посередине между ними */
export interface MermaidLane {
  x: number;
  z: number;
}

/** Борт пирса: ряд мест, смотрящих в одну сторону (в ту сторону — море) */
export interface MermaidSideDef {
  /** Единичный вектор: куда смотрят места борта */
  dx: number;
  dz: number;
  /** Для отладки: «запад», «восток», «юг», «север» */
  name: string;
  /** Сколько мест в ряду */
  spots: number;
  /** Где можно всплыть: промежутки между местами, где вокруг свободная вода */
  lanes: readonly MermaidLane[];
}

/** Что умеет русалка вокруг мостков: борта и их промежутки (пусто — не появляется вовсе) */
export interface MermaidLayout {
  sides: readonly MermaidSideDef[];
}

/** Борт — не меньше стольких мест в ряд (одиночные места на площадке маяка и на конце — не борт) */
const MIN_SPOTS = 3;
/** Промежуток между соседними местами: не теснее и не шире, м (там поплавки идут по рядам, а не между) */
const MIN_GAP = 2.4;
const MAX_GAP = 6.5;
/** Кромка соседних мест — на одной линии с точностью до стольких метров (иначе между ними уступ настила) */
const STRAIGHT = 0.6;
/** Свободная вода вокруг неё, м (тело, волосы и сердечки) и запас до памятника сверх его тихой зоны */
const CLEAR = 1.6;
const QUIET_MARGIN = 2;
/** От кромки настила, м: видно рыбакам, но не под самым носом (3–6 м) */
export const MERMAID_DIST: readonly [number, number] = [3.4, 5.6];
/** Куда она смотрит, повернувшись к мосткам: на настил в этом месте, на столько метров вглубь от кромки */
const FACE_INTO = 2.1;

type Box = Pick<MapBox, 'min' | 'max'>;

/** Настил: верх у уровня пола (y = 0), низ ушёл под воду; бордюры, кнехты и стены — нет */
const isDeck = (b: Box): boolean => b.max[1] > -0.1 && b.max[1] < 0.3 && b.min[1] < -0.2;

/** Метров от места до кромки настила по ходу заброса (0 — место не на настиле) */
function edgeDistance(decks: readonly Box[], x: number, z: number, dx: number, dz: number): number {
  const on = (px: number, pz: number): boolean => decks.some((d) => px >= d.min[0] - 1e-6 && px <= d.max[0] + 1e-6 && pz >= d.min[2] - 1e-6 && pz <= d.max[2] + 1e-6);
  if (!on(x, z)) return 0;
  let last = 0;
  for (let i = 1; i <= 400; i++) {
    const t = i * 0.05;
    if (on(x + dx * t, z + dz * t)) last = t;
    else if (t - last >= 0.3) break;
  }
  return last;
}

/** Свободна ли вода вокруг точки: ни настила, ни берега, ни мели, ни лодок и столбов в радиусе CLEAR и вдали от памятника */
function freeWater(boxes: readonly Box[], x: number, z: number, quiet: { x: number; z: number; r: number } | null): boolean {
  if (quiet && Math.hypot(x - quiet.x, z - quiet.z) <= quiet.r + QUIET_MARGIN) return false;
  for (const b of boxes) {
    if (b.max[1] <= WATER_Y - 0.3 || b.min[1] >= WATER_Y + 2.4) continue;
    if (x + CLEAR > b.min[0] && x - CLEAR < b.max[0] && z + CLEAR > b.min[2] && z - CLEAR < b.max[2]) return false;
  }
  return true;
}

/**
 * Борта и места всплытия по местам рыбалки и настилу. spots — места (берутся только пирса), boxes — боксы карты,
 * quiet — где русалке не место (памятник). Порядок бортов не зависит от порядка мест: сортируем по направлению.
 */
export function buildMermaidLayout(
  spots: readonly FishSpot[],
  boxes: readonly Box[],
  quiet: { x: number; z: number; r: number } | null = CRITTER_QUIET_ZONE,
): MermaidLayout {
  const decks = boxes.filter(isDeck);
  const groups = new Map<string, Array<{ x: number; z: number; ex: number; ez: number; dx: number; dz: number }>>();
  for (const s of spots) {
    if ((s.zone ?? 'pier') !== 'pier') continue;
    const dx = -Math.sin(s.yaw);
    const dz = -Math.cos(s.yaw);
    const e = edgeDistance(decks, s.x, s.z, dx, dz);
    if (e <= 0) continue;
    const key = `${Math.round(dx * 100) || 0},${Math.round(dz * 100) || 0}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push({ x: s.x, z: s.z, ex: s.x + dx * e, ez: s.z + dz * e, dx, dz });
  }
  const sides: Array<{ def: MermaidSideDef; kx: number; kz: number }> = [];
  for (const [key, g] of groups) {
    if (g.length < MIN_SPOTS) continue;
    const { dx, dz } = g[0];
    // вдоль борта: u растёт по кромке
    const u = (p: { x: number; z: number }): number => -p.x * dz + p.z * dx;
    g.sort((a, b) => u(a) - u(b));
    const lanes: MermaidLane[] = [];
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i];
      const b = g[i + 1];
      const gap = u(b) - u(a);
      if (gap < MIN_GAP || gap > MAX_GAP) continue;
      if (Math.abs((b.ex - a.ex) * dx + (b.ez - a.ez) * dz) > STRAIGHT) continue;
      const lane = { x: (a.ex + b.ex) / 2, z: (a.ez + b.ez) / 2 };
      // на обоих краях диапазона расстояний вокруг свободная вода
      if (MERMAID_DIST.every((d) => freeWater(boxes, lane.x + dx * d, lane.z + dz * d, quiet))) lanes.push(lane);
    }
    if (!lanes.length) continue;
    const name = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'восток' : 'запад') : dz > 0 ? 'юг' : 'север';
    const [kx, kz] = key.split(',').map(Number);
    sides.push({ def: { dx, dz, name, spots: g.length, lanes }, kx, kz });
  }
  // порядок бортов — по целым ключам направления (запад раньше востока): от движка и от порядка мест он не зависит, а от него
  // зависит, какой борт выберет хеш, — у всех игроков он должен быть один
  sides.sort((a, b) => a.kx - b.kx || a.kz - b.kz);
  return { sides: sides.map((s) => s.def) };
}

/** Раскладка для набережной: места рыбалки пирса и боксы карты лобби (`buildLobby().boxes`) */
export function lobbyMermaidLayout(boxes: readonly Box[]): MermaidLayout {
  return buildMermaidLayout(FISH_SPOTS, boxes);
}

/** Одно появление: когда, с какого борта и где */
export interface MermaidShow {
  /** Номер окна расписания */
  n: number;
  /** Начало, секунды серверного времени лобби */
  start: number;
  /** Номер борта в MermaidLayout.sides и номер промежутка в его lanes */
  side: number;
  lane: number;
  /** Где вынырнула (центр тела на воде) */
  x: number;
  z: number;
  /** Куда смотрит, повернувшись к мосткам (рад; 0 — на −Z, как у игроков) и на сколько отвёрнута, пока только вынырнула */
  yaw: number;
  look: number;
  /** Зерно для сердечек */
  seed: number;
}

const SALT = 0x6d65;
const h = (n: number, k: number): number => hashFloat(n, SALT + k);

let memoLayout: MermaidLayout | null = null;
let memoShow: MermaidShow | null = null;
/**
 * Появление окна n. Борт, промежуток, расстояние и сдвиг внутри окна — по хешу номера окна, поэтому у всех одинаково.
 * side — только для проверок и отладки: принудительно этот борт (остальное — как у окна). null — раскладка пуста.
 */
export function mermaidShow(n: number, layout: MermaidLayout, side?: number): MermaidShow | null {
  const count = layout.sides.length;
  if (!count) return null;
  if (side === undefined && memoShow && memoShow.n === n && memoLayout === layout) return memoShow;
  const si = side === undefined ? Math.min(count - 1, Math.floor(h(n, 1) * count)) : ((Math.floor(side) % count) + count) % count;
  const def = layout.sides[si];
  const li = Math.min(def.lanes.length - 1, Math.floor(h(n, 2) * def.lanes.length));
  const lane = def.lanes[li];
  const dist = lerp(MERMAID_DIST[0], MERMAID_DIST[1], h(n, 3));
  // вдоль кромки её чуть сносит (±0,25 м), чтобы не вставала в одну и ту же точку
  const slide = (h(n, 4) - 0.5) * 0.5;
  const x = lane.x + def.dx * dist - def.dz * slide;
  const z = lane.z + def.dz * dist + def.dx * slide;
  // смотрит на настил напротив себя
  const tx = lane.x - def.dx * FACE_INTO;
  const tz = lane.z - def.dz * FACE_INTO;
  const show: MermaidShow = {
    n, start: n * MERMAID_WINDOW_S + MERMAID_FROM_S + h(n, 0) * MERMAID_SPREAD_S, side: si, lane: li, x, z,
    yaw: Math.atan2(-(tx - x), -(tz - z)),
    look: (h(n, 5) < 0.5 ? -1 : 1) * lerp(0.8, 1.4, h(n, 6)),
    seed: Math.floor(h(n, 7) * 1e9),
  };
  if (side === undefined) {
    memoLayout = layout;
    memoShow = show;
  }
  return show;
}

/** Идёт ли сейчас появление (по тику лобби) и сколько секунд ему */
export function mermaidAt(tick: number, layout: MermaidLayout): { show: MermaidShow; age: number } | null {
  if (!Number.isFinite(tick) || tick < 0) return null;
  const t = tick / TICK_RATE;
  const show = mermaidShow(Math.floor(t / MERMAID_WINDOW_S), layout);
  if (!show) return null;
  const age = t - show.start;
  return age >= 0 && age < MERMAID_SHOW_S ? { show, age } : null;
}

/** Ход появления, с от начала */
export const MERMAID_T = {
  /** Вынырнула: вершина прыжка (тело над водой, мелькает хвост) и осела по пояс */
  apex: 0.5, settle: 1.25,
  /** Повернулась к мосткам */
  turnFrom: 0.9, turnTo: 1.8,
  /** Рука: пошла вверх, наверху, три взмаха по swingS, пошла вниз, опущена */
  handFrom: 1.3, handTop: 1.9, swings: 3, swingS: 0.85, handDown: 4.5, handEnd: 5.2,
  /** Сердечки: первое, пауза между ними, сколько живёт каждое */
  heartsFrom: 2.0, heartsGap: 0.4, heartLife: 2.4,
  /** Нырок: начало, сколько длится */
  dive: 6.5, diveS: 1.3,
} as const;
/** Когда всплеск со звуком: вынырнула — сразу, нырнула — когда плавник уходит в воду */
export const MERMAID_CUE = { up: 0.1, down: 7.5 } as const;
export const MERMAID_HEARTS = 10;

/** Тело сидит в воде по пояс: низ тела на столько метров ниже воды; на вершине прыжка — выше */
export const MERMAID_REST = -0.46;
const APEX = 1.5;
const DIVE_PITCH = 2.3;
const DIVE_SINK = 2.9;

const smooth = (x: number): number => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Что делает русалка в этот момент (всё в метрах и радианах, высоты — от уровня воды) */
export interface MermaidFrame {
  /** Над водой ли хоть что-то (иначе модель прячем) */
  shown: boolean;
  /** Прыгает или ныряет: тело не «стоит» на воде (желе тянется и сплющивается при посадке) */
  air: boolean;
  /** Высота низа тела над водой: под водой — отрицательная */
  lift: number;
  /** Куда смотрит (абсолютный угол) */
  yaw: number;
  /** Наклон вперёд при нырке, рад */
  pitch: number;
  /** Рука: 0 — внизу, 1 — поднята; взмах −1…1 */
  hand: number;
  swing: number;
  /** Хвост машет из стороны в сторону, рад (при нырке) */
  flick: number;
  /** Радуется: улыбка во весь рот и довольные глаза (машет и сердечки) */
  happy: boolean;
}

export function newMermaidFrame(): MermaidFrame {
  return { shown: false, air: false, lift: -3, yaw: 0, pitch: 0, hand: 0, swing: 0, flick: 0, happy: false };
}

/** Кадр появления show на секунде age (до 0 и после MERMAID_SHOW_S — под водой) */
export function mermaidFrame(show: MermaidShow, age: number, out: MermaidFrame = newMermaidFrame()): MermaidFrame {
  const T = MERMAID_T;
  out.shown = age >= 0 && age < T.dive + T.diveS + 0.2;
  out.air = false;
  // покачивание на воде
  const bob = 0.025 * Math.sin((Math.max(0, age - T.settle) / 2.4) * Math.PI * 2);
  out.pitch = 0;
  out.flick = 0;
  out.yaw = show.yaw + show.look * (1 - smooth((age - T.turnFrom) / (T.turnTo - T.turnFrom)));
  if (age < T.apex) {
    // вынырнула: быстро вверх, на вершине — над водой целиком (мелькает хвост)
    const u = clamp(age / T.apex, 0, 1);
    out.lift = lerp(-2.4, APEX, 1 - (1 - u) * (1 - u));
    out.air = true;
  } else if (age < T.settle) {
    // осела по пояс: чуть глубже, чем надо, и вернулась
    const u = (age - T.apex) / (T.settle - T.apex);
    out.lift = lerp(APEX, MERMAID_REST, smooth(u)) - 0.09 * Math.sin(Math.PI * u) * u;
    out.air = u < 0.9;
  } else {
    out.lift = MERMAID_REST + bob;
  }
  // рука и взмахи
  const wave0 = T.handTop, wave1 = T.handTop + T.swings * T.swingS;
  out.hand = smooth((age - T.handFrom) / (T.handTop - T.handFrom)) * (1 - smooth((age - T.handDown) / (T.handEnd - T.handDown)));
  const swingOn = smooth((age - wave0 + 0.2) / 0.3) * (1 - smooth((age - wave1) / 0.3));
  out.swing = Math.sin(((age - wave0) / T.swingS) * Math.PI * 2) * swingOn;
  out.happy = age >= T.handFrom && age < T.dive;
  if (age >= T.dive) {
    // нырок: быстро поворачивается спиной к мосткам, клонится вперёд (от них), хвост поднимается над водой у рыбаков,
    // машет и уходит под воду
    const u = clamp((age - T.dive) / T.diveS, 0, 1);
    out.air = true;
    out.yaw += Math.PI * smooth(u / 0.25);
    out.pitch = DIVE_PITCH * smooth((u - 0.2) / 0.6);
    out.lift = MERMAID_REST + bob - DIVE_SINK * smooth((u - 0.45) / 0.55);
    const wag = smooth((u - 0.3) / 0.15) * (1 - smooth((u - 0.8) / 0.15));
    out.flick = 0.4 * Math.sin(((u - 0.3) / 0.22) * Math.PI * 2) * wag;
  }
  return out;
}

/** Сердечко над русалкой: смещения от её места (вправо от неё, вперёд, высота над водой), размер, прозрачность, крен */
export interface MermaidHeart {
  ox: number;
  oz: number;
  oy: number;
  size: number;
  alpha: number;
  roll: number;
}

/** Сердечко номер i на секунде age: false — его сейчас нет (ещё не появилось или растаяло) */
export function mermaidHeart(show: MermaidShow, i: number, age: number, out: MermaidHeart): boolean {
  const T = MERMAID_T;
  const r = (k: number): number => hashFloat(show.seed + i * 7 + k, SALT + 40);
  const t = (age - (T.heartsFrom + i * T.heartsGap + (r(0) - 0.5) * 0.16)) / T.heartLife;
  if (t < 0 || t >= 1) return false;
  out.ox = (r(1) - 0.5) * 0.95 + 0.09 * Math.sin(t * 6.5 + i * 1.9);
  out.oz = -0.1 + (r(2) - 0.5) * 0.4;
  out.oy = 1.5 + 1.7 * (1 - Math.pow(1 - t, 1.7));
  out.size = lerp(0.36, 0.5, r(3)) * smooth(t / 0.12) * (1 + 0.1 * Math.sin(t * 9 + i));
  out.alpha = smooth(t / 0.1) * (1 - smooth((t - 0.55) / 0.45));
  out.roll = 0.35 * Math.sin(t * 4 + i * 2.3);
  return true;
}
