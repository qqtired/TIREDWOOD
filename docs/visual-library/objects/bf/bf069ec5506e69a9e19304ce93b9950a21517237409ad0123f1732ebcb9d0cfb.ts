// Катер «Портовой регаты»: шаг 60 раз в секунду, общий для сервера и предсказания клиента (поэтому только точная
// арифметика: + − × ÷, Math.sqrt и синус из shared/math.ts). Газ W, тормоз и задний ход S, руль A/D, занос — Shift или
// пробел (корма уходит в сторону; дольше держишь — сильнее мини-ускорение на выходе), R — к последним воротам.
// Пары жёлтых флажков — сильное ускорение на 1,5 с (каждая пара — раз за круг). Коридор — канат с поплавками
// (отскок и −15 %), буй — −30 %, камни, риф и лодки на якоре — −50 % и пауза мотора. Трамплин перед рифом:
// чисто приводнился — мини-ускорение, боком — −20 %. Столкновения катеров — collideRgBoats (только на сервере).
import { DT } from './constants.ts';
import { sinCos } from './math.ts';
import { RG_LAPS, type RgCourse } from './regattacourse.ts';
import { BTN_BACK, BTN_DASH, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, type Input } from './sim.ts';
import { locate, locateAny, makeLoc, type TrackLoc } from './track.ts';

/** Потолок скорости без ускорения и задним ходом, м/с */
export const RG_TOP = 17;
export const RG_REVERSE = 4;
/** Ускорения: флажки (до 25 м/с), мини-ускорение после заноса, чистого приводнения и удачного старта (до 20 м/с) */
export const RG_FLAG_TOP = 25;
export const RG_MINI_TOP = 20;
export const RG_FLAG_TICKS = 90;
/** Корпус — два круга: у носа и у кормы (от середины по курсу), радиус */
export const RG_BOW = 1.25;
export const RG_R = 0.95;
/** R — к воротам не чаще раза в 3 с; после — 1,5 с «призраком» (катера сквозь) */
export const RG_RESPAWN_COOL = 180;
export const RG_GHOST = 90;

const ACCEL = 12;
const BRAKE = 14;
const REV_ACCEL = 5;
/** Без газа: вода тормозит (постоянная часть и квадратичная) */
const COAST = 2.5;
const QUAD = 0.012;
/** Выше потолка (ускорение кончилось) — сбрасывает до него */
const OVER = 6;
const BOOST_ACCEL = 30;
/** Руль: рад/с на ходу; ниже PLOW м/с нос «пашет» воду — руль слабее (у стоянки — PLOW_MIN) */
const TURN = 1.3;
const PLOW = 7;
const PLOW_MIN = 0.35;
const STEER_RATE = 0.1;
/** Сколько бокового скольжения гасится за тик: обычно и в заносе */
const GRIP = 0.12;
const DRIFT_GRIP = 0.06;
/** Занос: с какой скорости начинается и до какой держится; поворот в нём; потеря скорости за тик (−3 %/с) */
const DRIFT_MIN = 8;
const DRIFT_KEEP = 5;
const DRIFT_BASE = 1;
const DRIFT_STEER = 0.45;
const DRIFT_LOSS = 0.0005;
/** Мини-ускорение: занос дольше 0,7 с — на 0,5 с, дольше 1,4 с — на 0,9 с */
export const RG_MINI1 = 42;
export const RG_MINI2 = 84;
const MINI1_T = 30;
const MINI2_T = 54;
/** Старт: газ нажат в последние 0,25 с отсчёта — ускорение на 1 с; держал дольше секунды — мотор захлебнулся на 0,5 с */
const START_WINDOW = 15;
const START_BOOST = 60;
const START_FLOOD = 60;
const START_STALL = 30;
/** После старта и финиша (без хода) катер останавливается */
const COAST_STOP = 0.985;
/** Удары: сильнее HIT_MIN м/с — потеря скорости; о камень — ещё и мотор молчит 0,3 с */
const HIT_MIN = 1.5;
const CRASH_STALL = 18;
const ROPE_E = 0.3;
const ROPE_HIT = 1.2;
const ROPE_KEEP = 0.85;
/** Дальше за канатом — значит, что-то пошло не так: к воротам */
const LOST = 4;
/** Трамплин: подъём по скорости, падение, руль в воздухе; приводнение «чисто» — нос по ходу в пределах 15° */
const RAMP_VY_K = 0.45;
const RAMP_VY_MAX = 9;
const GRAVITY = 22;
const AIR_STEER = 0.2;
const LAND_COS = 0.9659;
const LAND_KEEP = 0.8;
/** Флажки: центр катера — не дальше половины просвета минус этот запас */
const FLAG_MARGIN = 0.4;
/** Столкновение катеров: скорость сближения превращается в разлёт (не больше BUMP_MAX) и толчок в стороны */
const BUMP_K = 1.2;
const BUMP_MAX = 14;
const BUMP_SIDE = 1;

export const RG_HIT_ROPE = 1;
export const RG_HIT_BUOY = 2;
export const RG_HIT_ROCK = 3;
export const RG_HIT_BOAT = 4;

export interface RgBoat {
  x: number;
  z: number;
  /** Высота над водой (на трамплине и в прыжке) */
  y: number;
  vx: number;
  vz: number;
  vy: number;
  /** Курс — единичный вектор; руль −1…1 (+ — влево) */
  hx: number;
  hz: number;
  steer: number;
  /** Точка осевой рядом (поиск — от неё) */
  seg: number;
  /** Последние пройденные ворота (0 — линия старта), круг 1…3, взятые на этом круге флажки (биты), финишировал */
  cp: number;
  lap: number;
  flags: number;
  done: number;
  /** Шагов гонки с «Марш!», шаг начала круга, лучший круг (шаги) */
  rt: number;
  lapRt: number;
  best: number;
  /** Ускорение: сколько шагов ещё и до какой скорости */
  boost: number;
  boostTop: number;
  /** Занос: шагов в нём (0 — нет) и в какую сторону */
  drift: number;
  driftDir: number;
  /** Мотор молчит (удар, захлебнулся на старте), «призрак», пауза до следующего R */
  stall: number;
  ghost: number;
  cool: number;
  /** До старта: сколько шагов подряд зажат газ; стартовал ли */
  start: number;
  go: number;
  /** На трамплине, в воздухе */
  ramp: number;
  air: number;
  prevButtons: number;
  respawns: number;
  /** Сильных ударов (камень, риф, катер) — по нему у всех брызги */
  hits: number;
}

/** Порядок полей — для точной передачи состояния своего катера (shared/regatta.ts). */
export const RG_KEYS = [
  'x', 'z', 'y', 'vx', 'vz', 'vy', 'hx', 'hz', 'steer', 'seg', 'cp', 'lap', 'flags', 'done', 'rt', 'lapRt', 'best', 'boost', 'boostTop',
  'drift', 'driftDir', 'stall', 'ghost', 'cool', 'start', 'go', 'ramp', 'air', 'prevButtons', 'respawns', 'hits',
] as const satisfies ReadonlyArray<keyof RgBoat>;

export interface RgEvents {
  /** Пройденные ворота (−1 — нет), круг закончен (время круга в шагах, лучший ли), финиш */
  gate: number;
  lapTicks: number;
  best: boolean;
  lap: boolean;
  finish: boolean;
  /** Взятые флажки (−1 — нет), мини-ускорение (1, 2), занос начался, старт (1 — удачный, −1 — захлебнулся) */
  flag: number;
  mini: number;
  drift: boolean;
  start: number;
  /** Удар: сила (м/с) и о что (RG_HIT_*) */
  hit: number;
  hitKind: number;
  /** Взлетел с трамплина; приводнился (1 — чисто, 2 — боком) */
  jump: boolean;
  land: number;
  respawn: boolean;
}

export function makeRgBoat(): RgBoat {
  return {
    x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, hx: 1, hz: 0, steer: 0, seg: 0, cp: 0, lap: 1, flags: 0, done: 0, rt: 0, lapRt: 0, best: 0,
    boost: 0, boostTop: 0, drift: 0, driftDir: 0, stall: 0, ghost: 0, cool: 0, start: 0, go: 0, ramp: 0, air: 0, prevButtons: 0, respawns: 0, hits: 0,
  };
}

export function makeRgEvents(): RgEvents {
  return { gate: -1, lapTicks: 0, best: false, lap: false, finish: false, flag: -1, mini: 0, drift: false, start: 0, hit: 0, hitKind: 0, jump: false, land: 0, respawn: false };
}

function resetEvents(ev: RgEvents): void {
  ev.gate = -1; ev.lapTicks = 0; ev.best = false; ev.lap = false; ev.finish = false; ev.flag = -1; ev.mini = 0; ev.drift = false; ev.start = 0;
  ev.hit = 0; ev.hitKind = 0; ev.jump = false; ev.land = 0; ev.respawn = false;
}

const sc = { s: 0, c: 0 };
const _loc = makeLoc();
const _hull = makeLoc();

/** Катер на место решётки: всё с нуля, круг 1, носом по ходу. */
export function placeRgBoat(s: RgBoat, c: RgCourse, slot: number): void {
  Object.assign(s, makeRgBoat());
  const g = c.grid[slot % c.grid.length];
  s.x = g.x;
  s.z = g.z;
  s.hx = g.hx;
  s.hz = g.hz;
  s.seg = locateAny(c.track, s.x, s.z, _loc).seg;
}

function boost(s: RgBoat, ticks: number, top: number): void {
  s.boost = s.boost > ticks ? s.boost : ticks;
  s.boostTop = s.boostTop > top ? s.boostTop : top;
}

/** К последним пройденным воротам (до первых ворот — за решётку): стоит, носом по ходу, «призрак». */
export function respawnRgBoat(s: RgBoat, c: RgCourse): void {
  const g = c.gates[s.cp];
  const first = s.cp === 0 && s.lap === 1;
  s.x = first ? g.x - g.tx * 20 : g.rx;
  s.z = first ? g.z - g.tz * 20 : g.rz;
  s.hx = g.tx;
  s.hz = g.tz;
  s.vx = s.vz = s.vy = s.y = 0;
  s.steer = 0;
  s.air = s.ramp = 0;
  s.drift = s.driftDir = 0;
  s.boost = s.boostTop = s.stall = 0;
  s.seg = locateAny(c.track, s.x, s.z, _loc).seg;
  s.ghost = RG_GHOST;
  s.cool = RG_RESPAWN_COOL;
  s.respawns++;
}

function endDrift(s: RgBoat, ev: RgEvents): void {
  const t = s.drift >= RG_MINI2 ? MINI2_T : s.drift >= RG_MINI1 ? MINI1_T : 0;
  if (t > 0) {
    boost(s, t, RG_MINI_TOP);
    ev.mini = t === MINI2_T ? 2 : 1;
  }
  s.drift = 0;
  s.driftDir = 0;
}

function turn(s: RgBoat, rate: number): void {
  sinCos(rate * DT, sc);
  const hx = s.hx * sc.c + s.hz * sc.s;
  const hz = -s.hx * sc.s + s.hz * sc.c;
  const n = Math.sqrt(hx * hx + hz * hz);
  s.hx = hx / n;
  s.hz = hz / n;
}

/**
 * Шаг катера по входу. drive — гонка идёт (по метке входа: тот же ответ у сервера и у предсказания); до старта газ
 * только считается (удачный старт), после финиша и итогов катер без хода. topMul — потолок ботов (у людей 1).
 */
export function stepRgBoat(s: RgBoat, inp: Input, c: RgCourse, ev: RgEvents, drive: boolean, topMul = 1): void {
  resetEvents(ev);
  const b = inp.buttons;
  const pressed = b & ~s.prevButtons;
  s.prevButtons = b;
  if (s.ghost > 0) s.ghost--;
  if (s.cool > 0) s.cool--;
  const target = ((b & BTN_LEFT) !== 0 ? 1 : 0) - ((b & BTN_RIGHT) !== 0 ? 1 : 0);
  const ds = target - s.steer;
  s.steer += ds > STEER_RATE ? STEER_RATE : ds < -STEER_RATE ? -STEER_RATE : ds;
  if (!drive || s.done) {
    if (!s.go && !s.done) s.start = (b & BTN_FORWARD) !== 0 ? s.start + 1 : 0;
    s.drift = s.driftDir = 0;
    s.boost = s.boostTop = 0;
    if (s.air) {
      air(s, c, ev);
      return;
    }
    s.vx *= COAST_STOP;
    s.vz *= COAST_STOP;
    const ox = s.x;
    const oz = s.z;
    s.x += s.vx * DT;
    s.z += s.vz * DT;
    ramp(s, c, oz, 0, ev);
    if (!s.air) collide(s, c, ev, ox, oz);
    return;
  }
  if (!s.go) {
    s.go = 1;
    if ((b & BTN_FORWARD) !== 0 && s.start >= 1 && s.start <= START_WINDOW) {
      boost(s, START_BOOST, RG_MINI_TOP);
      ev.start = 1;
    } else if (s.start > START_FLOOD) {
      s.stall = START_STALL;
      ev.start = -1;
    }
    s.start = 0;
  }
  s.rt++;
  if ((pressed & BTN_RELOAD) !== 0 && s.cool === 0 && !s.air) {
    respawnRgBoat(s, c);
    ev.respawn = true;
    return;
  }
  const ox = s.x;
  const oz = s.z;
  if (s.air) {
    air(s, c, ev);
    crossings(s, c, ox, oz, ev);
    return;
  }
  let fwd = s.vx * s.hx + s.vz * s.hz;
  // занос: начинается на ходу с рулём, держится, пока зажата кнопка и есть скорость
  const driftBtn = (b & (BTN_DASH | BTN_JUMP)) !== 0;
  if (s.drift > 0) {
    if (!driftBtn || fwd < DRIFT_KEEP) endDrift(s, ev);
    else s.drift++;
  } else if (driftBtn && target !== 0 && fwd >= DRIFT_MIN && s.stall === 0) {
    s.drift = 1;
    s.driftDir = target;
    ev.drift = true;
  }
  let rate: number;
  if (s.drift > 0) rate = TURN * (DRIFT_BASE * s.driftDir + DRIFT_STEER * s.steer);
  else {
    const a = fwd < 0 ? -fwd : fwd;
    const plow = a < PLOW ? PLOW_MIN + ((1 - PLOW_MIN) * a) / PLOW : 1;
    rate = TURN * s.steer * plow * (fwd < -0.5 ? -1 : 1);
  }
  turn(s, rate);
  // вода держит катер: курс повернул, а скорость — как была; поперёк — гасится (в заносе — меньше)
  fwd = s.vx * s.hx + s.vz * s.hz;
  let lat = -s.vx * s.hz + s.vz * s.hx;
  lat *= 1 - (s.drift > 0 ? DRIFT_GRIP : GRIP);
  const top = RG_TOP * topMul;
  const gas = (b & BTN_FORWARD) !== 0;
  // тяга — по полной скорости (в заносе катер скользит боком, и быстрее потолка от этого не становится)
  const sp = Math.sqrt(fwd * fwd + lat * lat);
  let thrust = false;
  if (s.stall > 0) s.stall--;
  else if (s.boost > 0) {
    if (sp < s.boostTop * topMul) fwd += BOOST_ACCEL * DT;
    s.boost--;
    thrust = true;
  } else if (gas) {
    thrust = true;
    if (fwd < 0) fwd += BRAKE * DT;
    else if (sp < top) fwd += (sp < 0.7 * top ? ACCEL : (ACCEL * (top - sp)) / (0.3 * top)) * DT;
  } else if ((b & BTN_BACK) !== 0) {
    fwd -= (fwd > 0 ? BRAKE : REV_ACCEL) * DT;
  }
  if (!thrust) {
    const drag = (COAST + QUAD * fwd * fwd) * DT;
    if (fwd > 0) fwd = fwd > drag ? fwd - drag : 0;
    else if (fwd < 0 && (b & BTN_BACK) === 0) fwd = -fwd > drag ? fwd + drag : 0;
  }
  if (s.drift > 0) fwd -= fwd * DRIFT_LOSS;
  if (fwd < -RG_REVERSE) fwd = -RG_REVERSE;
  // выше потолка (ускорение кончилось, толкнули) — вода сбрасывает до него
  const cap = s.boost > 0 ? s.boostTop * topMul : top;
  const sp2 = Math.sqrt(fwd * fwd + lat * lat);
  if (sp2 > cap) {
    const k = (sp2 - OVER * DT > cap ? sp2 - OVER * DT : cap) / sp2;
    fwd *= k;
    lat *= k;
  }
  if (s.boost === 0) s.boostTop = 0;
  s.vx = s.hx * fwd - s.hz * lat;
  s.vz = s.hz * fwd + s.hx * lat;
  s.x += s.vx * DT;
  s.z += s.vz * DT;
  ramp(s, c, oz, fwd, ev);
  if (!s.air) collide(s, c, ev, ox, oz);
  if (!Number.isFinite(s.x + s.z + s.vx + s.vz)) {
    respawnRgBoat(s, c);
    ev.respawn = true;
    return;
  }
  crossings(s, c, ox, oz, ev);
}

/** Полёт с трамплина: руль слабый, ни канат, ни камни не мешают; приводнение — с проверкой курса. */
function air(s: RgBoat, c: RgCourse, ev: RgEvents): void {
  turn(s, TURN * AIR_STEER * s.steer);
  const ox = s.x;
  const oz = s.z;
  s.x += s.vx * DT;
  s.z += s.vz * DT;
  s.y += s.vy * DT;
  s.vy -= GRAVITY * DT;
  if (s.y > 0) return;
  s.y = 0;
  s.vy = 0;
  s.air = 0;
  const sp = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
  const cos = sp > 0.5 ? (s.hx * s.vx + s.hz * s.vz) / sp : 1;
  if (cos >= LAND_COS) {
    ev.land = 1;
    boost(s, MINI1_T, RG_MINI_TOP);
  } else {
    ev.land = 2;
    s.vx *= LAND_KEEP;
    s.vz *= LAND_KEEP;
    s.hits++;
  }
  collide(s, c, ev, ox, oz);
}

/** Трамплин: въехал с юга — поднимает к кромке, с кромки — в воздух; с севера в кромку — как в камень. */
function ramp(s: RgBoat, c: RgCourse, oz: number, fwd: number, ev: RgEvents): void {
  const r = c.ramp;
  const inX = s.x > r.x0 && s.x < r.x1;
  if (s.ramp) {
    if (inX && s.z >= r.z0 && s.z <= r.z1) {
      s.y = (r.h * (r.z1 - s.z)) / (r.z1 - r.z0);
      return;
    }
    s.ramp = 0;
    if (inX && s.z < r.z0 && oz >= r.z0) {
      s.air = 1;
      s.y = r.h;
      const v = fwd > 0 ? fwd : 0;
      s.vy = RAMP_VY_K * v < RAMP_VY_MAX ? RAMP_VY_K * v : RAMP_VY_MAX;
      ev.jump = true;
      return;
    }
    s.y = 0;
    return;
  }
  if (!inX || s.z < r.z0 || s.z > r.z1 || s.air) return;
  if (oz < r.z0) {
    // в кромку с севера: стенка
    s.z = r.z0 - 0.01;
    if (s.vz > 0) {
      const hit = s.vz;
      s.vz = -0.2 * s.vz;
      if (hit > HIT_MIN) {
        s.vx *= 0.5;
        s.vz *= 0.5;
        s.stall = s.stall > CRASH_STALL ? s.stall : CRASH_STALL;
        s.hits++;
        if (hit > ev.hit) {
          ev.hit = hit;
          ev.hitKind = RG_HIT_ROCK;
        }
      }
    }
    return;
  }
  s.ramp = 1;
  s.y = (r.h * (r.z1 - s.z)) / (r.z1 - r.z0);
}

/** Корпус (нос и корма) о буи, камни, риф и лодки на якоре, потом о канат по краям коридора. */
function collide(s: RgBoat, c: RgCourse, ev: RgEvents, ox: number, oz: number): void {
  // на трамплине корпус выше рифа и камней у воды
  for (let k = -1; k <= 1 && !s.ramp; k += 2) {
    for (const o of c.obstacles) {
      const px = s.x + s.hx * RG_BOW * k;
      const pz = s.z + s.hz * RG_BOW * k;
      const ex = o.bx - o.ax;
      const ez = o.bz - o.az;
      const ll = ex * ex + ez * ez;
      let t = ll > 0 ? ((px - o.ax) * ex + (pz - o.az) * ez) / ll : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const dx = px - (o.ax + ex * t);
      const dz = pz - (o.az + ez * t);
      const min = o.r + RG_R;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      // ровно в центре — выталкивает назад по курсу
      const nx = d > 1e-6 ? dx / d : -s.hx * k;
      const nz = d > 1e-6 ? dz / d : -s.hz * k;
      s.x += nx * (min - d);
      s.z += nz * (min - d);
      const vn = s.vx * nx + s.vz * nz;
      if (vn >= 0) continue;
      const buoy = o.kind === 'buoy';
      const e = buoy ? 0.3 : 0.2;
      s.vx -= (1 + e) * vn * nx;
      s.vz -= (1 + e) * vn * nz;
      const hit = -vn;
      if (hit <= HIT_MIN) continue;
      const keep = buoy ? 0.7 : 0.5;
      s.vx *= keep;
      s.vz *= keep;
      if (!buoy) {
        s.stall = s.stall > CRASH_STALL ? s.stall : CRASH_STALL;
        s.hits++;
      }
      if (hit > ev.hit) {
        ev.hit = hit;
        ev.hitKind = buoy ? RG_HIT_BUOY : RG_HIT_ROCK;
      }
    }
  }
  const tr = c.track;
  const at = locate(tr, s.x, s.z, s.seg, _loc);
  s.seg = at.seg;
  if ((at.lat > 0 ? at.lat : -at.lat) > at.hw + LOST) {
    respawnRgBoat(s, c);
    ev.respawn = true;
    return;
  }
  for (let k = -1; k <= 1; k += 2) {
    const l: TrackLoc = locate(tr, s.x + s.hx * RG_BOW * k, s.z + s.hz * RG_BOW * k, s.seg, _hull);
    const over = (l.lat > 0 ? l.lat : -l.lat) - (l.hw - RG_R);
    if (over <= 0) continue;
    const sg = l.lat > 0 ? 1 : -1;
    // наружу — вправо по ходу (−tz, tx) со знаком стороны
    const nx = -tr.tz[l.seg] * sg;
    const nz = tr.tx[l.seg] * sg;
    s.x -= nx * over;
    s.z -= nz * over;
    const vn = s.vx * nx + s.vz * nz;
    if (vn <= 0) continue;
    s.vx -= (1 + ROPE_E) * vn * nx;
    s.vz -= (1 + ROPE_E) * vn * nz;
    if (vn > ROPE_HIT) {
      s.vx *= ROPE_KEEP;
      s.vz *= ROPE_KEEP;
      if (vn > ev.hit) {
        ev.hit = vn;
        ev.hitKind = RG_HIT_ROPE;
      }
    }
  }
  void ox;
  void oz;
}

/** Ворота по порядку (за последними — линия старта: круг, на третьем — финиш) и флажки (каждая пара — раз за круг). */
function crossings(s: RgBoat, c: RgCourse, ox: number, oz: number, ev: RgEvents): void {
  if (s.done) return;
  const next = s.cp + 1 < c.gates.length ? s.cp + 1 : 0;
  const g = c.gates[next];
  const a = (ox - g.x) * g.tx + (oz - g.z) * g.tz;
  const bb = (s.x - g.x) * g.tx + (s.z - g.z) * g.tz;
  if (a < 0 && bb >= 0) {
    const u = -a / (bb - a);
    const lat = (ox + (s.x - ox) * u - g.x) * -g.tz + (oz + (s.z - oz) * u - g.z) * g.tx;
    if (lat <= g.hw + 1 && lat >= -g.hw - 1) {
      s.cp = next;
      ev.gate = next;
      if (next === 0) {
        const t = s.rt - s.lapRt;
        s.lapRt = s.rt;
        ev.lapTicks = t;
        if (s.best === 0 || t < s.best) {
          s.best = t;
          ev.best = true;
        }
        s.flags = 0;
        if (s.lap >= RG_LAPS) {
          s.done = 1;
          ev.finish = true;
          return;
        }
        s.lap++;
        ev.lap = true;
      }
    }
  }
  for (let i = 0; i < c.flags.length; i++) {
    if ((s.flags & (1 << i)) !== 0) continue;
    const f = c.flags[i];
    const fa = (ox - f.x) * f.tx + (oz - f.z) * f.tz;
    const fb = (s.x - f.x) * f.tx + (s.z - f.z) * f.tz;
    if (fa >= 0 || fb < 0) continue;
    const u = -fa / (fb - fa);
    const lat = (ox + (s.x - ox) * u - f.x) * -f.tz + (oz + (s.z - oz) * u - f.z) * f.tx;
    if (lat > f.hw - FLAG_MARGIN || lat < -f.hw + FLAG_MARGIN) continue;
    s.flags |= 1 << i;
    boost(s, RG_FLAG_TICKS, RG_FLAG_TOP);
    ev.flag = i;
  }
}

/**
 * Два катера бортами (сервер, после шагов всех): расталкивает, сближение — в разлёт и толчок в стороны.
 * «Призраки», финишировавшие и летящие — сквозь. Возвращает скорость сближения (0 — не задели).
 */
export function collideRgBoats(a: RgBoat, b: RgBoat): number {
  if (a.ghost > 0 || b.ghost > 0 || a.done || b.done || a.air || b.air) return 0;
  const reach = 2 * (RG_BOW + RG_R);
  const qx = b.x - a.x;
  const qz = b.z - a.z;
  if (qx * qx + qz * qz >= reach * reach) return 0;
  let best = 0;
  let nx = 0;
  let nz = 0;
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      const dx = b.x + b.hx * RG_BOW * j - (a.x + a.hx * RG_BOW * i);
      const dz = b.z + b.hz * RG_BOW * j - (a.z + a.hz * RG_BOW * i);
      const d = Math.sqrt(dx * dx + dz * dz);
      const pen = 2 * RG_R - d;
      if (pen <= best) continue;
      best = pen;
      nx = d > 1e-6 ? dx / d : 1;
      nz = d > 1e-6 ? dz / d : 0;
    }
  }
  if (best <= 0) return 0;
  a.x -= (nx * best) / 2;
  a.z -= (nz * best) / 2;
  b.x += (nx * best) / 2;
  b.z += (nz * best) / 2;
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing <= 0) return 0;
  const dv = (BUMP_K * closing < BUMP_MAX ? BUMP_K * closing : BUMP_MAX) / 2 + BUMP_SIDE;
  a.vx -= nx * dv;
  a.vz -= nz * dv;
  b.vx += nx * dv;
  b.vz += nz * dv;
  if (closing > HIT_MIN) {
    a.hits++;
    b.hits++;
  }
  return closing;
}

/** Прогресс по гонке, м: круг × длина + путь от линии старта (для мест). */
export function rgProgress(s: RgBoat, c: RgCourse): number {
  const tr = c.track;
  const base = tr.s[tr.cpSeg[s.cp]];
  let d = tr.s[s.seg] - base;
  if (d > tr.length / 2) d -= tr.length;
  else if (d <= -tr.length / 2) d += tr.length;
  return (s.lap - 1) * tr.length + base + d;
}
