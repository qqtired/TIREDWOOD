// Помехи и зоны трассы картинга: ускорители, лужи, бочки и блоки, движущиеся помехи, настилы-трамплины.
// Всё — геометрия в мировых координатах (X — восток, Z — юг), собранная из описания «нога / метр / вбок» при сборке трассы.
// Положение движущихся помех — функция «времени гонки» карта rt (тиков в пути): оно лежит в состоянии карта, поэтому
// сервер и предсказание в браузере считают их бит в бит. Считается только на + − × ÷, Math.sqrt/abs/min/max и sinCos
// (тест следит, чтобы сюда не пробрались Math.sin, atan2 и прочие).
import { TICK_RATE } from './constants.ts';
import { TAU, sinCos } from './math.ts';

/** Нет настила под точкой */
export const NO_DECK = -1e9;

/** Шаг карты за тик — на столько метров мы заранее смотрим «достанет ли помеха» (запас на скорость и толчок) */
const REACH_PAD = 3;

// ------------------------------------------------------------ данные

export interface Pad {
  x: number;
  z: number;
  /** Курс по дороге (единичный): вперёд — (fx, fz), вправо — (−fz, fx) */
  fx: number;
  fz: number;
  hl: number;
  hw: number;
  seg: number;
  r2: number;
}

export interface Slick {
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** Полуоси эллипса: вдоль курса и поперёк */
  rl: number;
  rw: number;
  /** Доля боковой скорости, которая гасится за тик (у асфальта 0,25) */
  grip: number;
  /** 0 — вода, 1 — масло */
  kind: number;
  seg: number;
  r2: number;
}

/** Неподвижная твёрдая помеха — капсула: отрезок (ax, az)–(bx, bz) и радиус r. Бочка — точка, блок — отрезок. */
export interface Solid {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  /** 0 — бочка, 1 — бетонный блок */
  kind: number;
  seg: number;
  cx: number;
  cz: number;
  reach2: number;
}

/** Настил: прямоугольник с наклоном — высота на заднем крае y0, на переднем (по курсу) y1 */
export interface Deck {
  x: number;
  z: number;
  fx: number;
  fz: number;
  hl: number;
  hw: number;
  y0: number;
  y1: number;
  seg: number;
  r2: number;
}

export const MV_SLIDE = 0;
export const MV_SWING = 1;
export const MV_SPIN = 2;
export const MV_GATE = 3;

/**
 * Движущаяся помеха. slide — контейнер на рельсах: центр ходит между (ax, az) и (bx, bz), стоит у краёв dwell тиков;
 * swing — груз крана качается поперёк дороги между (ax, az) и (bx, bz); spin — шлагбаум вращается вокруг (ax, az).
 */
export interface Mover {
  kind: number;
  /** 1 — удар закручивает карт, 0 — только отбрасывает */
  hard: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** slide: ось контейнера (единичная); spin: —, swing: направление качания */
  ux: number;
  uz: number;
  /** slide: полудлина оси капсулы; spin: длина руки */
  h: number;
  r: number;
  /** Период (тиков на круг / на цикл), пауза у краёв (slide), сдвиг по времени */
  period: number;
  dwell: number;
  phase: number;
  /** spin: доли длины руки по обе стороны от оси вращения (0…1 и 0…−1) и направление вращения */
  arm0: number;
  arm1: number;
  dir: number;
  seg: number;
  /** Описывающий круг: центр и квадрат радиуса */
  cx: number;
  cz: number;
  reach2: number;
}

export interface Hazards {
  pads: Pad[];
  slicks: Slick[];
  solids: Solid[];
  decks: Deck[];
  movers: Mover[];
}

export function emptyHazards(): Hazards {
  return { pads: [], slicks: [], solids: [], decks: [], movers: [] };
}

// ------------------------------------------------------------ описание (нога / метр / вбок)

/**
 * Точка на ноге трассы: курс (tx, tz) — по дороге, y — высота дороги на осевой напротив; at — метры от начала ноги
 * (за конец можно, отрицательное — от конца ноги), lat — вправо
 */
export interface FramePoint {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
}

export interface Frame {
  at(leg: number, at: number, lat: number, out: FramePoint): FramePoint;
  /** Ближайший отрезок оси */
  seg(x: number, z: number): number;
}

interface Place {
  leg: number;
  at: number;
  lat?: number;
}

export interface HazardSpec {
  /** Ускоритель: len — вдоль дороги, w — поперёк */
  pads?: Array<Place & { len?: number; w?: number }>;
  /** Лужа: полуоси rl (вдоль) и rw (поперёк), yaw — поворот относительно дороги (рад, + вправо) */
  slicks?: Array<Place & { kind: 'water' | 'oil'; rl: number; rw: number; yaw?: number }>;
  barrels?: Place[];
  /** Бетонный блок: длина, ширина, поворот относительно дороги */
  blocks?: Array<Place & { len?: number; wid?: number; yaw?: number }>;
  /** Настил (трамплин вне оси): len — по курсу настила, w — поперёк; высота y0 сзади, y1 спереди — над дорогой напротив */
  decks?: Array<Place & { len: number; w: number; y0: number; y1: number; yaw?: number }>;
  movers?: MoverSpec[];
}

export type MoverSpec =
  | (Place & { kind: 'gate'; len: number; wid: number; period: number; phase?: number })
  | (Place & { kind: 'slide'; from: number; to: number; len: number; wid: number; period: number; dwell: number; phase?: number })
  | (Place & { kind: 'swing'; amp: number; r: number; period: number; phase?: number })
  | (Place & { kind: 'spin'; arm: number; both?: boolean; r: number; period: number; phase?: number });

const _p: FramePoint = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
const _q: FramePoint = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
const _sc = { s: 0, c: 0 };

/** Курс, повёрнутый на yaw вправо */
function turned(tx: number, tz: number, yaw: number, out: { x: number; z: number }): void {
  if (!yaw) {
    out.x = tx;
    out.z = tz;
    return;
  }
  sinCos(yaw, _sc);
  out.x = tx * _sc.c - tz * _sc.s;
  out.z = tz * _sc.c + tx * _sc.s;
}

const _d = { x: 0, z: 0 };

export function buildHazards(spec: HazardSpec, fr: Frame): Hazards {
  const hz = emptyHazards();
  for (const s of spec.pads ?? []) {
    const p = fr.at(s.leg, s.at, s.lat ?? 0, _p);
    const hl = (s.len ?? 6) / 2;
    const hw = (s.w ?? 3.6) / 2;
    hz.pads.push({ x: p.x, z: p.z, fx: p.tx, fz: p.tz, hl, hw, seg: fr.seg(p.x, p.z), r2: hl * hl + hw * hw });
  }
  for (const s of spec.slicks ?? []) {
    const p = fr.at(s.leg, s.at, s.lat ?? 0, _p);
    turned(p.tx, p.tz, s.yaw ?? 0, _d);
    const r = Math.max(s.rl, s.rw);
    hz.slicks.push({
      x: p.x, z: p.z, fx: _d.x, fz: _d.z, rl: s.rl, rw: s.rw, grip: s.kind === 'oil' ? OIL_GRIP : WATER_GRIP,
      kind: s.kind === 'oil' ? 1 : 0, seg: fr.seg(p.x, p.z), r2: r * r,
    });
  }
  for (const s of spec.barrels ?? []) {
    const p = fr.at(s.leg, s.at, s.lat ?? 0, _p);
    hz.solids.push(solid(p.x, p.z, p.x, p.z, BARREL_R, 0, fr));
  }
  for (const s of spec.blocks ?? []) {
    const p = fr.at(s.leg, s.at, s.lat ?? 0, _p);
    turned(p.tx, p.tz, s.yaw ?? 0, _d);
    const r = (s.wid ?? 0.9) / 2;
    const h = Math.max(0, (s.len ?? 3.8) / 2 - r);
    hz.solids.push(solid(p.x - _d.x * h, p.z - _d.z * h, p.x + _d.x * h, p.z + _d.z * h, r, 1, fr));
  }
  for (const s of spec.decks ?? []) {
    const p = fr.at(s.leg, s.at, s.lat ?? 0, _p);
    turned(p.tx, p.tz, s.yaw ?? 0, _d);
    const hl = s.len / 2;
    const hw = s.w / 2;
    hz.decks.push({ x: p.x, z: p.z, fx: _d.x, fz: _d.z, hl, hw, y0: p.y + s.y0, y1: p.y + s.y1, seg: fr.seg(p.x, p.z), r2: hl * hl + hw * hw });
  }
  for (const s of spec.movers ?? []) hz.movers.push(mover(s, fr));
  return hz;
}

/** Сцепление в луже: у воды карт ещё рулит, у масла — почти нет (у асфальта 0,25, у заноса 0,06) */
export const WATER_GRIP = 0.09;
export const OIL_GRIP = 0.02;
export const BARREL_R = 0.55;

function solid(ax: number, az: number, bx: number, bz: number, r: number, kind: number, fr: Frame): Solid {
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  const rad = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) / 2 + r + REACH_PAD;
  return { ax, az, bx, bz, r, kind, seg: fr.seg(cx, cz), cx, cz, reach2: rad * rad };
}

function mover(s: MoverSpec, fr: Frame): Mover {
  const lat = s.lat ?? 0;
  const base: Mover = {
    kind: 0, hard: 1, ax: 0, az: 0, bx: 0, bz: 0, ux: 0, uz: 0, h: 0, r: 0, period: s.period, dwell: 0, phase: s.phase ?? 0,
    arm0: 0, arm1: 0, dir: 1, seg: 0, cx: 0, cz: 0, reach2: 0,
  };
  let rad = 0;
  if (s.kind === 'slide') {
    const a = fr.at(s.leg, s.at, s.from, _p);
    const ax = a.x;
    const az = a.z;
    const b = fr.at(s.leg, s.at, s.to, _q);
    const l = Math.sqrt((b.x - ax) * (b.x - ax) + (b.z - az) * (b.z - az));
    base.kind = MV_SLIDE;
    base.ax = ax;
    base.az = az;
    base.bx = b.x;
    base.bz = b.z;
    base.ux = (b.x - ax) / l;
    base.uz = (b.z - az) / l;
    base.r = s.wid / 2;
    base.h = Math.max(0, s.len / 2 - base.r);
    base.dwell = s.dwell;
    base.cx = (ax + b.x) / 2;
    base.cz = (az + b.z) / 2;
    rad = l / 2 + base.h + base.r;
  } else if (s.kind === 'gate') {
    const a = fr.at(s.leg, s.at, lat, _p);
    base.kind = MV_GATE;
    base.hard = 0;
    base.cx = a.x; base.cz = a.z;
    base.ux = -a.tz; base.uz = a.tx;
    base.r = s.wid / 2;
    base.h = s.len / 2 - base.r;
    base.ax = a.x - base.ux * base.h; base.az = a.z - base.uz * base.h;
    base.bx = a.x + base.ux * base.h; base.bz = a.z + base.uz * base.h;
    rad = base.h + base.r;
  } else if (s.kind === 'swing') {
    const a = fr.at(s.leg, s.at, lat - s.amp, _p);
    const ax = a.x;
    const az = a.z;
    const b = fr.at(s.leg, s.at, lat + s.amp, _q);
    const l = Math.sqrt((b.x - ax) * (b.x - ax) + (b.z - az) * (b.z - az));
    base.kind = MV_SWING;
    base.ax = ax;
    base.az = az;
    base.bx = b.x;
    base.bz = b.z;
    base.ux = (b.x - ax) / l;
    base.uz = (b.z - az) / l;
    base.r = s.r;
    base.cx = (ax + b.x) / 2;
    base.cz = (az + b.z) / 2;
    rad = l / 2 + s.r;
  } else {
    const a = fr.at(s.leg, s.at, lat, _p);
    base.kind = MV_SPIN;
    base.ax = a.x;
    base.az = a.z;
    base.cx = a.x;
    base.cz = a.z;
    base.h = s.arm;
    base.r = s.r;
    base.arm0 = s.both ? -1 : 0;
    base.arm1 = 1;
    base.dir = s.period < 0 ? -1 : 1;
    base.period = Math.abs(s.period);
    rad = s.arm + s.r;
  }
  base.seg = fr.seg(base.cx, base.cz);
  const rr = rad + REACH_PAD;
  base.reach2 = rr * rr;
  return base;
}

// ------------------------------------------------------------ зоны

export function padAt(h: Hazards, x: number, z: number): Pad | null {
  for (let i = 0; i < h.pads.length; i++) {
    const p = h.pads[i];
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz > p.r2) continue;
    const a = dx * p.fx + dz * p.fz;
    const b = dz * p.fx - dx * p.fz;
    if (a >= -p.hl && a <= p.hl && b >= -p.hw && b <= p.hw) return p;
  }
  return null;
}

export function slickAt(h: Hazards, x: number, z: number): Slick | null {
  for (let i = 0; i < h.slicks.length; i++) {
    const s = h.slicks[i];
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz > s.r2) continue;
    const a = (dx * s.fx + dz * s.fz) / s.rl;
    const b = (dz * s.fx - dx * s.fz) / s.rw;
    if (a * a + b * b <= 1) return s;
  }
  return null;
}

/** Высота настила под точкой или NO_DECK */
export function deckAt(h: Hazards, x: number, z: number): number {
  let best = NO_DECK;
  for (let i = 0; i < h.decks.length; i++) {
    const d = h.decks[i];
    const dx = x - d.x;
    const dz = z - d.z;
    if (dx * dx + dz * dz > d.r2) continue;
    const a = dx * d.fx + dz * d.fz;
    const b = dz * d.fx - dx * d.fz;
    if (a < -d.hl || a > d.hl || b < -d.hw || b > d.hw) continue;
    const y = d.y0 + ((d.y1 - d.y0) * (a + d.hl)) / (2 * d.hl);
    if (y > best) best = y;
  }
  return best;
}

// ------------------------------------------------------------ движение

/** Капсула движущейся помехи в момент rt: отрезок, радиус, скорость точек (поступательная и вращение вокруг (px, pz)) */
export interface Cap {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  vx: number;
  vz: number;
  /** Угловая скорость, рад/с, вокруг (px, pz) */
  w: number;
  px: number;
  pz: number;
}

export function makeCap(): Cap {
  return { ax: 0, az: 0, bx: 0, bz: 0, r: 0, vx: 0, vz: 0, w: 0, px: 0, pz: 0 };
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Доля пути контейнера 0…1: стоит у A, едет к B, стоит у B, едет обратно; плавно трогается и тормозит. */
export function slideU(m: Mover, rt: number): number {
  const P = m.period;
  const t = (rt + m.phase) % P;
  const D = m.dwell;
  const M = P / 2 - D;
  if (t < D) return 0;
  if (t < D + M) return smooth((t - D) / M);
  if (t < 2 * D + M) return 1;
  return 1 - smooth((t - 2 * D - M) / M);
}

/** Откуда качается груз: −1…1 по пути от A к B */
export function swingU(m: Mover, rt: number): number {
  sinCos((TAU * ((rt + m.phase) % m.period)) / m.period, _sc);
  return _sc.s;
}

/** Угол руки шлагбаума в момент rt, рад */
export function spinAngle(m: Mover, rt: number): number {
  return (m.dir * TAU * ((rt + m.phase) % m.period)) / m.period;
}

/** Центр подвижной части (slide, swing) в момент rt */
function centre(m: Mover, rt: number, out: { x: number; z: number }): void {
  const u = m.kind === MV_SLIDE ? slideU(m, rt) : (swingU(m, rt) + 1) / 2;
  out.x = m.ax + (m.bx - m.ax) * u;
  out.z = m.az + (m.bz - m.az) * u;
}

const _c0 = { x: 0, z: 0 };
const _c1 = { x: 0, z: 0 };

/** Шлагбаум: предупреждение (мигает и звенит) столько тиков перед тем, как стрела ляжет */
export const GATE_WARN = 60;

/** Тик внутри цикла шлагбаума 0…period−1 */
export function gateTime(m: Mover, rt: number): number {
  return (((rt + m.phase) % m.period) + m.period) % m.period;
}

/** 0 — открыт, 1 — мигает и звенит (стрела опускается), 2 — стрела лежит поперёк (твёрдая). Секунда предупреждения. */
export function gatePhase(m: Mover, rt: number): number {
  const t = gateTime(m, rt);
  return t < m.period * 0.45 ? 0 : t < m.period * 0.45 + GATE_WARN ? 1 : 2;
}

export function moverCap(m: Mover, rt: number, out: Cap): Cap {
  if (m.kind === MV_GATE) {
    out.ax = m.ax; out.az = m.az; out.bx = m.bx; out.bz = m.bz; out.r = m.r;
    out.vx = 0; out.vz = 0; out.w = 0; out.px = m.cx; out.pz = m.cz;
    return out;
  }
  if (m.kind === MV_SPIN) {
    sinCos(spinAngle(m, rt), _sc);
    const dx = _sc.c * m.h;
    const dz = _sc.s * m.h;
    out.ax = m.ax + dx * m.arm0;
    out.az = m.az + dz * m.arm0;
    out.bx = m.ax + dx * m.arm1;
    out.bz = m.az + dz * m.arm1;
    out.r = m.r;
    out.vx = 0;
    out.vz = 0;
    out.w = (m.dir * TAU * TICK_RATE) / m.period;
    out.px = m.ax;
    out.pz = m.az;
    return out;
  }
  centre(m, rt, _c1);
  centre(m, rt > 0 ? rt - 1 : 0, _c0);
  if (m.kind === MV_SLIDE) {
    out.ax = _c1.x - m.ux * m.h;
    out.az = _c1.z - m.uz * m.h;
    out.bx = _c1.x + m.ux * m.h;
    out.bz = _c1.z + m.uz * m.h;
  } else {
    out.ax = _c1.x;
    out.az = _c1.z;
    out.bx = _c1.x;
    out.bz = _c1.z;
  }
  out.r = m.r;
  out.vx = (_c1.x - _c0.x) * TICK_RATE;
  out.vz = (_c1.z - _c0.z) * TICK_RATE;
  out.w = 0;
  out.px = _c1.x;
  out.pz = _c1.z;
  return out;
}

// ------------------------------------------------------------ столкновения

export interface Mass {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface Hit {
  /** Скорость удара (сближения), м/с; 0 — не было */
  sev: number;
  /** 1 — удар подвижной помехой: карт закрутит */
  hard: number;
  /** 0 — бочка, 1 — блок, 2 — подвижная; тип сильнейшего удара */
  what: number;
}

export function makeHit(): Hit {
  return { sev: 0, hard: 0, what: 0 };
}

/** Упругость и потеря скорости при ударе о твёрдую помеху */
const BOUNCE = 0.35;
const LOSS = 0.012;
const LOSS_MAX = 0.5;
/** Закручивает только удар быстрее этого, м/с */
const HARD_MIN = 4;
/** От движущейся помехи карт отлетает хотя бы с такой скоростью, м/с: иначе она «возит» его на себе, пока трение гасит толчки */
const MOVER_SEP = 3;

const _cap = makeCap();

/**
 * Столкнуть карт (круг радиуса R) с капсулами: выдавить из помехи, отразить скорость относительно неё, потерять часть
 * скорости. Результат — в hit (самый сильный удар).
 */
export function collide(h: Hazards, k: Mass, rt: number, R: number, hit: Hit): void {
  for (let i = 0; i < h.solids.length; i++) {
    const s = h.solids[i];
    const dx = k.x - s.cx;
    const dz = k.z - s.cz;
    if (dx * dx + dz * dz > s.reach2) continue;
    contact(k, s.ax, s.az, s.bx, s.bz, s.r + R, 0, 0, 0, 0, 0, s.kind, 0, hit);
  }
  for (let i = 0; i < h.movers.length; i++) {
    const m = h.movers[i];
    if (m.kind === MV_GATE && gatePhase(m, rt) !== 2) continue;
    const dx = k.x - m.cx;
    const dz = k.z - m.cz;
    if (dx * dx + dz * dz > m.reach2) continue;
    const c = moverCap(m, rt, _cap);
    contact(k, c.ax, c.az, c.bx, c.bz, c.r + R, c.vx, c.vz, c.w, c.px, c.pz, 2, m.hard, hit);
  }
}

function contact(
  k: Mass, ax: number, az: number, bx: number, bz: number, rr: number, ovx: number, ovz: number, w: number, px: number, pz: number,
  what: number, hard: number, hit: Hit,
): void {
  const ex = bx - ax;
  const ez = bz - az;
  const l2 = ex * ex + ez * ez;
  let t = l2 > 1e-9 ? ((k.x - ax) * ex + (k.z - az) * ez) / l2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + ex * t;
  const qz = az + ez * t;
  const dx = k.x - qx;
  const dz = k.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2);
  let nx: number;
  let nz: number;
  if (d < 1e-6) {
    // центр на оси: выталкиваем туда, откуда карт едет (поперёк оси, против скорости)
    const l = Math.sqrt(l2);
    const px2 = l > 1e-6 ? -ez / l : 0;
    const pz2 = l > 1e-6 ? ex / l : 1;
    const s = k.vx * px2 + k.vz * pz2 > 0 ? -1 : 1;
    nx = px2 * s;
    nz = pz2 * s;
    if (l <= 1e-6) {
      nx = 0;
      nz = 1;
    }
  } else {
    nx = dx / d;
    nz = dz / d;
  }
  const pen = rr - d;
  k.x += nx * pen;
  k.z += nz * pen;
  // скорость точки помехи, в которую упёрся карт
  const wx = ovx - w * (qz - pz);
  const wz = ovz + w * (qx - px);
  const rvx = k.vx - wx;
  const rvz = k.vz - wz;
  const vn = rvx * nx + rvz * nz;
  const sep = what === 2 ? MOVER_SEP : 0;
  if (vn >= sep) return;
  // скорость отлёта от помехи: отражённая с упругостью BOUNCE, у движущейся — не меньше MOVER_SEP
  const away = vn < 0 ? Math.max(-BOUNCE * vn, sep) : sep;
  const j = away - vn;
  k.vx += nx * j;
  k.vz += nz * j;
  if (vn >= 0) return;
  const sev = -vn;
  const keep = 1 - Math.min(LOSS_MAX, LOSS * sev);
  k.vx *= keep;
  k.vz *= keep;
  if (sev > hit.sev) {
    hit.sev = sev;
    hit.what = what;
  }
  if (hard && sev > HARD_MIN) hit.hard = 1;
}
