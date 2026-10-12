// Гидроплан «Стриж»: прогулка над городом за жетоны (флаг сервера PLANE). Общее для сервера и клиента.
// Стоит на воде у западного края площади, к северу от аквапарка. Взлёт и посадка — по общему расписанию (как путь
// катера «Ласточка»): разворот на воде, разбег на север вдоль берега, отрыв и набор; посадка — с севера вдоль берега
// прямо к стоянке. Между ними — свободный полёт без симулятора: мышь ведёт нос (куда смотришь — туда и летит),
// скорость постоянная (Shift — быстрее, S или Ctrl — медленнее), крен сам по повороту, сваливаний нет. Над водой и
// крышами держит мягкий «пол», сверху — потолок; за широким кругом вокруг города самолёт сам разворачивается к нему.
// Время вышло (или пилот попросил) — автопилот ведёт домой: к точке захода на севере, оттуда — на посадку.
// Сервер шагает самолёт по входам пилота (stepPlane), клиент пилота предсказывает тем же шагом, остальные видят
// самолёт по сообщениям planePos с плавностью.
import { TICK_RATE, WATER_Y } from './constants.ts';
import type { Outfit } from './outfit.ts';
import { BTN_BACK, BTN_DASH, BTN_FORWARD, type Input } from './sim.ts';
import { sanitizeChat } from './text.ts';
import { WHEEL } from './wheel.ts';

/** Цена полёта, жетонов */
export const PLANE_PRICE = 100;
/** Свободный полёт — 3 минуты; потом автопилот ведёт домой */
export const PLANE_FLY_TICKS = 180 * TICK_RATE;
/** Очередь — до стольких человек; подошла очередь — самолёт ждёт 30 с */
export const PLANE_QUEUE_MAX = 8;
export const PLANE_HOLD_TICKS = 30 * TICK_RATE;
/** Пилот без связи дольше 10 с — автопилот ведёт домой */
export const PLANE_AFK_TICKS = 10 * TICK_RATE;
/** Позиции самолёта всем — каждые 4 тика (15 раз в секунду) */
export const PLANE_SEND_EVERY = 4;

/** Что с самолётом: стоит, взлёт (мотор, разворот, разбег, набор), свободный полёт, автопилот домой, посадка */
export const PL_DOCK = 0;
export const PL_START = 1;
export const PL_FLY = 2;
export const PL_HOME = 3;
export const PL_LAND = 4;

/** Стоянка на воде у западного края площади (берег — x = −30): нос на юг, к аквапарку */
export const PLANE_DOCK = { x: -38, z: -11, yaw: Math.PI } as const;
/** E — у края набережной напротив самолёта (кто подошёл к воде лицом к самолёту — в радиусе), рядом с кнехтом */
export const PLANE_USE = { x: -29.2, z: -10.9, r: 2.6 } as const;
/** Сюда встаёт пилот после посадки (лицом к самолёту) */
export const PLANE_EXIT = { x: -28.6, z: -10.2, yaw: Math.PI / 2 } as const;
/** Табличка на столбике у угла павильона, лицом к площади */
export const PLANE_SIGN = { x: -28.4, z: -14.7 } as const;
/** Высота самолёта (его начала координат) на воде: поплавки — на воде */
export const PLANE_FLOAT_Y = WATER_Y + 1.25;

/** Скорость: ровная, быстрее (Shift или W), медленнее (S или Ctrl), м/с */
export const PLANE_CRUISE = 18;
export const PLANE_FAST = 27;
export const PLANE_SLOW = 11;
/** Насколько цель взгляда может обгонять нос (рад) — клиент держит мышь в этих пределах */
export const PLANE_LEAD = 1.2;
/** Набор и снижение: угол пути не круче (рад) */
export const PLANE_PITCH_MAX = 0.42;
/** Потолок над водой (над холмами — выше рельефа на PLANE_CEIL_GAP) */
export const PLANE_CEIL = 135;
const CEIL_GAP = 25;
/** Широкий круг вокруг города: за мягкой границей самолёт поворачивает к центру, за жёсткой — разворачивается */
export const PLANE_AREA = { x: 110, z: -120, soft: 430, hard: 520 } as const;

const DT = 1 / TICK_RATE;
const ACCEL = 4 / TICK_RATE;
const TURN_GAIN = 1.1;
const MAX_RATE = 0.62;
/** Плавность (доля за тик): поворот ~0,33 с, крен ~0,25 с, тангаж ~0,4 с. Литералы — без Math.exp в разных движках */
const RATE_K = 0.0488;
const ROLL_K = 0.0645;
const PITCH_K = 0.0408;
const MAX_ROLL = 0.55;
/** Мягкий пол и потолок: за столько метров до них начинают выравнивать */
const SOFT_M = 16;
/** Пол: над водой и над крышами (метров над рельефом) */
const WATER_FLOOR = WATER_Y + 12;
const ROOF_CLEAR = 30;

export interface PlaneState {
  ph: number;
  /** Тиков в фазе: взлёт и посадка — по расписанию, полёт — время, автопилот — сколько ведёт */
  t: number;
  x: number;
  y: number;
  z: number;
  /** Курс (0 — на −Z, как у взгляда), угол пути (вверх — плюс), крен (влево — плюс), скорость поворота, скорость */
  yaw: number;
  pitch: number;
  roll: number;
  rate: number;
  v: number;
  /** Автопилот: 1 — выравнивается на посадочную прямую (иначе летит к точке захода) */
  al: number;
  /** Посадка: сдвиг от точки захода в миг захвата — гаснет за первые секунды посадки */
  bx: number;
  by: number;
  bz: number;
}

export const PLANE_KEYS = ['ph', 't', 'x', 'y', 'z', 'yaw', 'pitch', 'roll', 'rate', 'v', 'al', 'bx', 'by', 'bz'] as const;

export function makePlane(): PlaneState {
  return { ph: PL_DOCK, t: 0, x: PLANE_DOCK.x, y: PLANE_FLOAT_Y, z: PLANE_DOCK.z, yaw: PLANE_DOCK.yaw, pitch: 0, roll: 0, rate: 0, v: 0, al: 0, bx: 0, by: 0, bz: 0 };
}

export function copyPlane(dst: PlaneState, src: PlaneState): void {
  for (const k of PLANE_KEYS) dst[k] = src[k];
}

export function samePlane(a: PlaneState, b: PlaneState): boolean {
  for (const k of PLANE_KEYS) if (a[k] !== b[k]) return false;
  return true;
}

/** Состояние из сообщения сервера (всё — числа; иначе null) */
export function readPlane(v: unknown, out: PlaneState): PlaneState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  for (const k of PLANE_KEYS) if (typeof o[k] !== 'number' || !Number.isFinite(o[k])) return null;
  for (const k of PLANE_KEYS) out[k] = o[k] as number;
  return out;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const smooth = (t: number): number => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};
/** Угол в −π…π */
export function wrapAngle(a: number): number {
  return a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
}

// ------------------------------------------------------------ рельеф города (копия landY из client/lobby/world.ts)

const PLAZA_E = 30;
const PLAZA_N = -26;
const QUAY_Z = 22;
const QUAY_X = -30;
const STREET_Y = -0.6;
/** Подъём за надписью TIREDWOOD (client/lobby/tiredwood.ts: signHill) */
const HILL_UP = 90;
const HILL_BEARING = (62 * Math.PI) / 180;
const HILL_FROM = 400;
const HILL_TO = 800;
const HILL_SIDE = 750;

function landDepth(x: number, z: number): number {
  return Math.max(Math.min(x - PLAZA_E, QUAY_Z - z), Math.min(PLAZA_N - z, x - QUAY_X));
}

function signHill(x: number, z: number): number {
  const dx = x - WHEEL.x;
  const dz = z - WHEEL.z;
  const along = dx * Math.sin(HILL_BEARING) - dz * Math.cos(HILL_BEARING);
  const across = dx * Math.cos(HILL_BEARING) + dz * Math.sin(HILL_BEARING);
  const t = clamp((along - HILL_FROM) / (HILL_TO - HILL_FROM), 0, 1);
  return HILL_UP * t * t * (3 - 2 * t) * Math.exp(-0.5 * (across / HILL_SIDE) ** 2);
}

/** Земля города в точке (на площади и у кромки — улица) */
function groundY(x: number, z: number, d: number): number {
  if (d < 0) return STREET_Y;
  const ramp = clamp((d - 150) / 350, 0, 1);
  const hill = Math.max(0, d - 70) * 0.1 + 34 * Math.sin(x * 0.006 + 0.4) * Math.cos(z * 0.0045 - 0.3) * ramp + signHill(x, z);
  const wob = 5 * Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.014 - 0.7) * clamp((d - 60) / 120, 0, 1);
  return STREET_Y + Math.max(0, hill + wob);
}

/**
 * Пол — ниже не спуститься: над водой 12 м, над городом, площадью и маяком — 30 м над крышами (рельеф + запас).
 * У берега — плавный переход на 25 м в обе стороны.
 */
export function planeFloor(x: number, z: number): number {
  const d = landDepth(x, z);
  const px = Math.max(-30 - x, 0, x - 30);
  const pz = Math.max(-26 - z, 0, z - 46);
  const k = Math.max(smooth((d + 25) / 50), 1 - smooth(Math.hypot(px, pz) / 30));
  if (k <= 0) return WATER_FLOOR;
  return WATER_FLOOR + (Math.max(WATER_FLOOR, groundY(x, z, d) + ROOF_CLEAR) - WATER_FLOOR) * k;
}

/** Потолок в точке с полом floor */
export function planeCeil(floor: number): number {
  return Math.max(PLANE_CEIL, floor + CEIL_GAP);
}

// ------------------------------------------------------------ взлёт: разворот на воде, разбег, отрыв, набор

/** Разворот у стоянки: дуга вправо радиусом TURN_R (с юга через запад на север), дальше — прямо на север */
const TURN_R = 7.5;
const TURN_LEN = Math.PI * TURN_R;
const RUN_X = PLANE_DOCK.x - 2 * TURN_R;
/** Мотор заводится 2 с; рулёжка 4,5 м/с; разбег с ускорением 2,2 м/с²; отрыв на 15 м/с; набор под углом CLIMB */
const ENGINE_TICKS = 2 * TICK_RATE;
const TAXI_V = 4.5;
const LIFT_V = 15;
const CLIMB_TAN = 0.1717;
const ROTATE_M = 30;
/** Отдаём управление пилоту на высоте 11 м над водой */
const RELEASE_UP = 11;

interface Script {
  /** Пройденный путь по тикам */
  s: number[];
  ticks: number;
}

function takeoffScript(): Script & { lift: number } {
  const s: number[] = [];
  let d = 0;
  let v = 0;
  let lift = -1;
  for (let t = 0; t < 120 * TICK_RATE; t++) {
    s.push(d);
    if (lift < 0 && d >= TURN_LEN && v >= LIFT_V) lift = d;
    if (lift >= 0 && climbAt(d - lift) >= RELEASE_UP) return { s, ticks: t, lift };
    if (t < ENGINE_TICKS) v = 0;
    else if (d < TURN_LEN) v = Math.min(TAXI_V, v + 1.0 / TICK_RATE);
    else v = Math.min(PLANE_CRUISE, v + 2.2 / TICK_RATE);
    d += v / TICK_RATE;
  }
  return { s, ticks: s.length - 1, lift: Math.max(0, lift) };
}

/** Набор высоты на d м после отрыва: сначала плавно (поднимает нос), потом ровно */
function climbAt(d: number): number {
  if (d <= 0) return 0;
  if (d < ROTATE_M) return (CLIMB_TAN * d * d) / (2 * ROTATE_M);
  return CLIMB_TAN * (d - ROTATE_M / 2);
}

const TAKEOFF = takeoffScript();
/** Сколько длится взлёт (тиков): с посадки пилота до передачи управления */
export const PLANE_TAKEOFF_TICKS = TAKEOFF.ticks;

/** Точка взлётного пути на расстоянии d от стоянки: x, z, курс */
function takeoffXZ(d: number, out: { x: number; z: number; yaw: number }): void {
  if (d < TURN_LEN) {
    const th = d / TURN_R;
    out.x = PLANE_DOCK.x - TURN_R + TURN_R * Math.cos(th);
    out.z = PLANE_DOCK.z + TURN_R * Math.sin(th);
    out.yaw = Math.PI - th;
    return;
  }
  out.x = RUN_X;
  out.z = PLANE_DOCK.z - (d - TURN_LEN);
  out.yaw = 0;
}

const _p = { x: 0, z: 0, yaw: 0 };

/** Поза на взлёте через t тиков после посадки пилота (крен — ноль, на воде нос ровно). */
function takeoffPose(s: PlaneState, t: number): void {
  const k = Math.min(t, TAKEOFF.ticks);
  const d = TAKEOFF.s[k];
  takeoffXZ(d, _p);
  s.x = _p.x;
  s.z = _p.z;
  s.yaw = _p.yaw;
  const up = TAKEOFF.lift > 0 && d > TAKEOFF.lift ? climbAt(d - TAKEOFF.lift) : 0;
  s.y = PLANE_FLOAT_Y + up;
  // скорость и угол — по соседнему тику (в последнем — по предыдущему)
  const d0 = k < TAKEOFF.ticks ? d : TAKEOFF.s[k - 1];
  const d1 = k < TAKEOFF.ticks ? TAKEOFF.s[k + 1] : d;
  const step = d1 - d0;
  s.v = step * TICK_RATE;
  const climb = (x: number): number => (TAKEOFF.lift > 0 && x > TAKEOFF.lift ? climbAt(x - TAKEOFF.lift) : 0);
  s.pitch = step > 1e-6 ? Math.atan2(climb(d1) - climb(d0), step) : 0;
  s.roll = 0;
  s.rate = 0;
}

// ------------------------------------------------------------ посадка: с севера вдоль берега прямо к стоянке

/** Точка захода (над морем на севере, курс на юг) и откуда к ней подходит автопилот */
export const PLANE_GATE = { x: PLANE_DOCK.x, y: 30, z: -300 } as const;
const GATE_ENTRY = { x: PLANE_GATE.x, z: PLANE_GATE.z - 160 };
/** От точки захода до касания воды — 210 м (выравнивание у воды само: кривая без излома) */
const TOUCH_M = 210;
const LAND_LEN = PLANE_DOCK.z - PLANE_GATE.z;
/** Сдвиг от точки захода гаснет за 8 с */
const BLEND_TICKS = 8 * TICK_RATE;

function landScript(): Script {
  const s: number[] = [];
  let d = 0;
  let v = PLANE_CRUISE;
  for (let t = 0; t < 120 * TICK_RATE; t++) {
    s.push(d);
    if (d >= LAND_LEN) return { s, ticks: t };
    // в воздухе — плавно до 14 м/с, на воде — до рулёжки 4 м/с, последние 6 м — до остановки у стоянки
    if (d < TOUCH_M) v = Math.max(14, v - 0.305 / TICK_RATE);
    else if (d < LAND_LEN - 6) v = Math.max(4, v - 1.8 / TICK_RATE);
    else v = Math.max(0.5, v - 1.33 / TICK_RATE);
    d = Math.min(LAND_LEN, d + v / TICK_RATE);
  }
  return { s, ticks: s.length - 1 };
}

const LAND = landScript();
/** Сколько длится посадка (тиков): от захвата над морем до остановки у стоянки */
export const PLANE_LAND_TICKS = LAND.ticks;

function landY(d: number): number {
  return PLANE_FLOAT_Y + (PLANE_GATE.y - PLANE_FLOAT_Y) * (1 - smooth(d / TOUCH_M));
}

const _a = { x: 0, y: 0, z: 0 };
const _b = { x: 0, y: 0, z: 0 };

function landPoint(s: PlaneState, t: number, out: { x: number; y: number; z: number }): void {
  const k = clamp(t, 0, LAND.ticks);
  const d = LAND.s[k];
  const fade = 1 - smooth(k / BLEND_TICKS);
  out.x = PLANE_GATE.x + s.bx * fade;
  out.y = landY(d) + s.by * fade;
  out.z = PLANE_GATE.z + d + s.bz * fade;
}

/** Поза на посадке через t тиков после захвата: путь со сдвигом, курс и угол — по ходу. */
function landPose(s: PlaneState, t: number): void {
  landPoint(s, t, _a);
  landPoint(s, t + 1, _b);
  s.x = _a.x;
  s.y = _a.y;
  s.z = _a.z;
  const dx = _b.x - _a.x;
  const dz = _b.z - _a.z;
  const h = Math.hypot(dx, dz);
  s.v = Math.hypot(h, _b.y - _a.y) * TICK_RATE;
  if (h > 1e-4) {
    s.yaw = Math.atan2(-dx, -dz);
    s.pitch = Math.atan2(_b.y - _a.y, h);
  } else {
    s.yaw = PLANE_DOCK.yaw;
    s.pitch = 0;
  }
  s.roll *= 0.96;
  s.rate = 0;
}

// ------------------------------------------------------------ шаг

/** Сесть в самолёт: мотор заводится, дальше — взлёт по расписанию. */
export function startPlane(s: PlaneState): void {
  Object.assign(s, makePlane());
  s.ph = PL_START;
  takeoffPose(s, 0);
}

/**
 * Полёт к цели: курс tYaw (не дальше PLANE_LEAD от носа; за кругом — к центру), угол пути tPitch (пол и потолок
 * поправляют), скорость want. Поворот, крен и угол — плавно.
 */
function fly(s: PlaneState, tYaw: number, tPitch: number, want: number): void {
  let lead = clamp(wrapAngle(tYaw - s.yaw), -PLANE_LEAD, PLANE_LEAD);
  const ox = s.x - PLANE_AREA.x;
  const oz = s.z - PLANE_AREA.z;
  const dist = Math.hypot(ox, oz);
  if (dist > PLANE_AREA.soft) {
    const k = smooth((dist - PLANE_AREA.soft) / (PLANE_AREA.hard - PLANE_AREA.soft));
    const home = wrapAngle(Math.atan2(ox, oz) - s.yaw);
    lead += (home - lead) * k;
  }
  const rateCmd = clamp(lead * TURN_GAIN, -MAX_RATE, MAX_RATE);
  s.rate += (rateCmd - s.rate) * RATE_K;
  s.yaw = wrapAngle(s.yaw + s.rate * DT);
  s.roll += (clamp((s.rate / MAX_RATE) * MAX_ROLL, -MAX_ROLL, MAX_ROLL) - s.roll) * ROLL_K;

  // пол — с упреждением по курсу (к берегу набираем заранее), потолок
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  const f0 = planeFloor(s.x, s.z);
  const floor = Math.max(f0, planeFloor(s.x + fx * 25, s.z + fz * 25) - 3, planeFloor(s.x + fx * 55, s.z + fz * 55) - 8);
  const ceil = planeCeil(floor);
  let p = clamp(tPitch, -PLANE_PITCH_MAX, PLANE_PITCH_MAX);
  const above = s.y - floor;
  if (above < SOFT_M) {
    const minP = -PLANE_PITCH_MAX + (0.3 + PLANE_PITCH_MAX) * smooth(1 - above / SOFT_M);
    if (p < minP) p = minP;
  }
  const below = ceil - s.y;
  if (below < SOFT_M) {
    const maxP = PLANE_PITCH_MAX - (PLANE_PITCH_MAX + 0.15) * smooth(1 - below / SOFT_M);
    if (p > maxP) p = maxP;
  }
  s.pitch += (p - s.pitch) * PITCH_K;
  s.v += clamp(want - s.v, -ACCEL, ACCEL);

  const c = Math.cos(s.pitch) * s.v * DT;
  s.x += fx * c;
  s.z += fz * c;
  s.y += Math.sin(s.pitch) * s.v * DT;
  // страховка: ниже пола на 4 м и выше потолка не бывает
  if (s.y < f0 - 4) {
    s.y = f0 - 4;
    if (s.pitch < 0) s.pitch = 0;
  }
  if (s.y > planeCeil(f0) + 2) {
    s.y = planeCeil(f0) + 2;
    if (s.pitch > 0) s.pitch = 0;
  }
}

/** Скорость, которую просит пилот кнопками */
export function planeWant(buttons: number): number {
  if (buttons & (BTN_DASH | BTN_FORWARD)) return PLANE_FAST;
  if (buttons & BTN_BACK) return PLANE_SLOW;
  return PLANE_CRUISE;
}

/** Автопилот домой: к точке захода, оттуда — на юг по посадочной прямой; захват — в посадку по расписанию. */
function home(s: PlaneState): void {
  const ex = GATE_ENTRY.x - s.x;
  const ez = GATE_ENTRY.z - s.z;
  if (!s.al && (s.z < GATE_ENTRY.z || Math.hypot(ex, ez) < 70)) s.al = 1;
  // прошёл точку захода мимо — на новый круг
  if (s.al && s.z > PLANE_GATE.z + 20) s.al = 0;
  const tYaw = s.al ? Math.PI - clamp((s.x - PLANE_GATE.x) * 0.025, -0.9, 0.9) : Math.atan2(-ex, -ez);
  const tPitch = clamp((PLANE_GATE.y - s.y) * 0.05, -0.25, 0.25);
  const z0 = s.z;
  fly(s, tYaw, tPitch, PLANE_CRUISE);
  const crossed = z0 < PLANE_GATE.z && s.z >= PLANE_GATE.z;
  const lined = Math.abs(s.x - PLANE_GATE.x) < 30 && Math.abs(s.y - PLANE_GATE.y) < 30 && Math.abs(wrapAngle(s.yaw - Math.PI)) < 0.7;
  // запасной выход: автопилот летает дольше двух минут — заходим откуда есть (сдвиг погасит посадка)
  if ((s.al && crossed && lined) || s.t > 120 * TICK_RATE) {
    s.bx = s.x - PLANE_GATE.x;
    s.by = s.y - PLANE_GATE.y;
    s.bz = s.z - PLANE_GATE.z;
    s.ph = PL_LAND;
    s.t = 0;
    landPose(s, 0);
  }
}

/**
 * Шаг самолёта на вход пилота. land — пилот попросил садиться (с этого входа). Так считают сервер и предсказание
 * клиента пилота — поэтому совпадают.
 */
export function stepPlane(s: PlaneState, inp: Input, land: boolean): void {
  switch (s.ph) {
    case PL_START:
      s.t++;
      if (s.t >= TAKEOFF.ticks) {
        takeoffPose(s, TAKEOFF.ticks);
        s.ph = PL_FLY;
        s.t = 0;
      } else takeoffPose(s, s.t);
      return;
    case PL_FLY:
      if (land || s.t >= PLANE_FLY_TICKS) {
        s.ph = PL_HOME;
        s.t = 0;
        s.al = 0;
        home(s);
        return;
      }
      s.t++;
      fly(s, inp.yaw, inp.pitch, planeWant(inp.buttons));
      return;
    case PL_HOME:
      s.t++;
      home(s);
      return;
    case PL_LAND:
      s.t++;
      if (s.t >= LAND.ticks) {
        Object.assign(s, makePlane());
        return;
      }
      landPose(s, s.t);
      return;
  }
}

/** Сколько тиков ещё до стоянки (примерно: автопилот — по расстоянию до захода) */
export function planeEta(s: Pick<PlaneState, 'ph' | 't' | 'x' | 'z'>): number {
  const homeEst = (x: number, z: number): number => Math.round(((Math.hypot(x - GATE_ENTRY.x, z - GATE_ENTRY.z) + 160) / PLANE_CRUISE) * TICK_RATE);
  switch (s.ph) {
    case PL_START:
      return TAKEOFF.ticks - s.t + PLANE_FLY_TICKS + homeEst(RUN_X, PLANE_GATE.z) + LAND.ticks;
    case PL_FLY:
      return Math.max(0, PLANE_FLY_TICKS - s.t) + homeEst(s.x, s.z) + LAND.ticks;
    case PL_HOME:
      return homeEst(s.x, s.z) + LAND.ticks;
    case PL_LAND:
      return Math.max(0, LAND.ticks - s.t);
    default:
      return 0;
  }
}

/** Полный полёт одного человека — для оценки очереди */
export const PLANE_TRIP_TICKS = PLANE_TAKEOFF_TICKS + PLANE_FLY_TICKS + Math.round((400 / PLANE_CRUISE) * TICK_RATE) + PLANE_LAND_TICKS;

/** Флаг сервера PLANE: «1» — включён, «0» — выключен, без флага — как в разработке. */
export function planeEnabled(v: string | undefined, dev: boolean): boolean {
  return v === '1' ? true : v === '0' ? false : dev;
}

// ------------------------------------------------------------ сеть

/** Что с самолётом — всем на набережной при каждом изменении (и в приветствии набережной) */
export interface PlaneView {
  ph: number;
  /** Пилот: номер в снимке (0 — нет: самолёт стоит или летит домой без него), профиль, ник, наряд, уровень */
  slot: number;
  pid: number;
  nick: string;
  o: Outfit | null;
  level: number;
  /** Очередь: ники по порядку; qb[i] = 1 — это заказ баннера, а не полёт */
  q: string[];
  qb: number[];
  /** Баннер за самолётом в этом полёте: текст и чей ('' — без баннера) */
  b: string;
  bn: string;
  /** Самолёт ждёт этого по очереди до тика hu (пусто — никого) */
  hold: string;
  hu: number;
  /** Тик сервера, когда посчитано eta: через сколько тиков самолёт будет у стоянки */
  k: number;
  eta: number;
}

export function emptyPlaneView(): PlaneView {
  return { ph: PL_DOCK, slot: 0, pid: 0, nick: '', o: null, level: 1, q: [], qb: [], b: '', bn: '', hold: '', hu: 0, k: 0, eta: 0 };
}

export type PlaneServerMsg =
  | { t: 'plane'; v: PlaneView }
  /** Где самолёт: тик сервера и [фаза, x, y, z, курс, угол, крен, скорость] (15 раз в секунду, пока не у стоянки) */
  | { t: 'planePos'; k: number; p: number[] }
  /** Пилоту: точное состояние после его входа ack (для сверки предсказания) */
  | { t: 'planeMe'; ack: number; s: PlaneState };

/** «Сесть сейчас»: начиная со своего входа at — автопилот домой. «Баннер»: пилоту — за свой самолёт, остальным — пролёт */
export type PlaneClientMsg = { t: 'plane'; a: 'land'; at: number } | { t: 'plane'; a: 'banner'; text: string };

/** Позиция для planePos: округлённая до сантиметров и тысячных радиана */
export function planePosArray(s: PlaneState): number[] {
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  const r3 = (v: number): number => Math.round(v * 1000) / 1000;
  return [s.ph, r2(s.x), r2(s.y), r2(s.z), r3(s.yaw), r3(s.pitch), r3(s.roll), r2(s.v)];
}

// ------------------------------------------------------------ баннер

/** Баннер за самолётом: 50 жетонов, текст до 40 знаков, не чаще раза в 5 минут на игрока */
export const BANNER_PRICE = 50;
export const BANNER_MAX = 40;
export const BANNER_COOLDOWN_TICKS = 5 * 60 * TICK_RATE;

/**
 * Пролёт с баннером без пилота: точки [x, z, высота, медленно] — после взлёта над северной частью города, по городу
 * к площади, медленно над площадью, мостками к маяку и вдоль южного берега на восток, назад над городом и ещё раз
 * медленно над площадью; оттуда — обычным автопилотом домой.
 */
export const BANNER_ROUTE: readonly (readonly [number, number, number, number])[] = [
  [-70, -230, 40, 0],
  [10, -200, 42, 0],
  [25, -90, 36, 0],
  [2, -18, 32, 1],
  [-19, 42, 30, 1],
  [25, 48, 30, 1],
  [130, 30, 32, 0],
  [160, -40, 40, 0],
  [60, -40, 36, 0],
  [-10, 0, 32, 1],
];
/** Точку маршрута считаем пройденной ближе этого: на ровной скорости радиус разворота ~30 м, на медленной ~18 м */
const ROUTE_NEAR = 30;
const ROUTE_NEAR_SLOW = 15;

/** Текст баннера — как строка чата (sanitizeChat), и не длиннее BANNER_MAX знаков; null — пустой или длинный */
export function bannerText(raw: unknown): string | null {
  const t = sanitizeChat(raw);
  const n = [...t].length;
  return n === 0 || n > BANNER_MAX ? null : t;
}

/** Вход «пилота» пролёта с баннером: к точке маршрута at.i (пройденные — пропускает). true — маршрут пройден. */
export function routeInput(s: Pick<PlaneState, 'x' | 'y' | 'z'>, at: { i: number }, out: Input): boolean {
  while (at.i < BANNER_ROUTE.length) {
    const [x, z, y, slow] = BANNER_ROUTE[at.i];
    const dx = x - s.x;
    const dz = z - s.z;
    if (Math.hypot(dx, dz) < (slow ? ROUTE_NEAR_SLOW : ROUTE_NEAR)) {
      at.i++;
      continue;
    }
    out.yaw = Math.atan2(-dx, -dz);
    out.pitch = clamp((y - s.y) / 30, -0.3, 0.3);
    out.buttons = slow ? BTN_BACK : 0;
    return false;
  }
  out.buttons = 0;
  return true;
}

/** Шаг пролёта с баннером (без пилота): взлёт, маршрут, домой, посадка — тот же stepPlane */
export function stepBanner(s: PlaneState, at: { i: number }, inp: Input): void {
  stepPlane(s, inp, s.ph !== PL_FLY || routeInput(s, at, inp));
}

/** Весь пролёт с баннером от взлёта до стоянки, тиков (детерминирован — считаем один раз) — для очереди */
export const BANNER_TRIP_TICKS = ((): number => {
  const s = makePlane();
  startPlane(s);
  const at = { i: 0 };
  const inp: Input = { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 };
  let n = 0;
  while (s.ph !== PL_DOCK && n < 30 * 60 * TICK_RATE) {
    stepBanner(s, at, inp);
    n++;
  }
  return n;
})();
