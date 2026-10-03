// Бот «Портовой регаты»: жмёт те же кнопки, что человек (физика и ворота общие). Едет по своей линии поперёк
// коридора: обходит камни, риф и лодки на якоре, флажки берёт с вероятностью по силе, сильный — заносом в шпильках
// (и с мини-ускорением на выходе), сильный быстрый — через трамплин. Застрял — R. Потолок скорости — по силе
// и «резинке» (её ставит гонка: далеко от людей — ±5 %).
import type { RgCourse } from '../../shared/regattacourse.ts';
import { RG_TOP, type RgBoat } from '../../shared/regattaphysics.ts';
import { BTN_BACK, BTN_DASH, BTN_FORWARD, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, makeInput, type Input } from '../../shared/sim.ts';
import { locateAny, makeLoc, wrapSeg } from '../../shared/track.ts';

/** Сила ботов: потолок скорости, шанс взять пару флажков, заносы в шпильках */
const LEVELS = [
  { top: 0.92, flag: 0.3, drift: 0, ramp: 0 },
  { top: 0.95, flag: 0.55, drift: 0.3, ramp: 0.4 },
  { top: 0.98, flag: 0.8, drift: 0.6, ramp: 0.6 },
] as const;
/** Трамплин — только с разгона: медленнее этого (за 30 м до него) бот идёт правой стороной */
const RAMP_SPEED = 12.5;
/** Обход: точка, куда целится бот, отодвигается от камня, если прямая к ней проходит ближе этого (к радиусу) */
const AVOID = 1.6;
/** Как круто линия бота уходит вбок, м на метр пути */
const SLOPE = 0.2;

export const RG_BOT_NAMES = ['Чайка', 'Бриз', 'Капитан Пена', 'Лазурь', 'Маяк', 'Прибой'];

/** Узкие места: на этом участке (по пути вдоль осевой, м) центр катера — в пределах [lo, hi] поперёк */
interface Gap {
  s0: number;
  s1: number;
  lo: number;
  hi: number;
}

export class RgBot {
  readonly level: number;
  /** «Резинка» к потолку скорости (ставит гонка) */
  rubber = 1;
  private readonly c: RgCourse;
  private readonly rnd: () => number;
  private readonly lane: number;
  private readonly line: Float64Array;
  private readonly safe: Gap[] = [];
  private readonly ramp: Gap;
  private readonly flags: Gap[] = [];
  private readonly rampLine: Float64Array;
  private rampTaken = false;
  private drifts = false;
  private early = false;
  private lap = -1;
  private stuck = 0;
  private readonly inp: Input = makeInput();

  constructor(course: RgCourse, level: number, rnd: () => number) {
    this.c = course;
    this.level = Math.max(0, Math.min(2, level));
    this.rnd = rnd;
    this.lane = (rnd() - 0.5) * 2;
    this.line = new Float64Array(course.track.n);
    this.rampLine = new Float64Array(course.track.n);
    const tr = course.track;
    const at = (x: number, z: number) => {
      const l = locateAny(tr, x, z, makeLoc());
      return { s: tr.s[l.seg] + tr.len[l.seg] * l.t, lat: l.lat };
    };
    const span = (x0: number, z0: number, x1: number, z1: number, lo: number, hi: number, m = 6): Gap => {
      const a = at(x0, z0).s;
      const b = at(x1, z1).s;
      return { s0: Math.min(a, b) - m, s1: Math.max(a, b) + m, lo, hi };
    };
    // лодки на якоре справа (у правого края) — держись левее; камень у F4 — правее (или левее, за флажками)
    this.safe.push(span(72.5, 115, 67.5, 115, -5.5, 1));
    this.safe.push(span(51.5, 114, 46.5, 114, -5.5, 1.8));
    this.safe.push(span(61, 119.5, 59, 119.5, 2.6, 3.6, 3));
    // риф после трамплина — правой стороной; узкий проход меж камней — посередине
    this.safe.push(span(36, 99, 36, 86, 3.9, 6.5));
    this.safe.push(span(35, 52, 35, 46, -1.8, 2));
    this.ramp = span(32, 99, 32, 86, -4.5, -3.5);
    for (const f of course.flags) {
      const p = at(f.x, f.z);
      const w = f.hw - 1;
      this.flags.push({ s0: p.s - 8, s1: p.s + 3, lo: p.lat - w, hi: p.lat + w });
    }
    // у F4 слева — тот же камень: флажки берутся левее камня
    this.plan(0);
  }

  /** Линия на круг: где держаться поперёк коридора (выбор флажков и трамплина — заново на каждом круге). */
  private plan(lap: number): void {
    this.lap = lap;
    const cfg = LEVELS[this.level];
    const wanted = this.flags.filter(() => this.rnd() < cfg.flag);
    this.rampTaken = this.rnd() < cfg.ramp;
    this.drifts = this.rnd() < cfg.drift;
    // сначала — где опасно (при равенстве побеждает раньше записанное), потом — флажки
    const gaps: Gap[] = [];
    for (const g of this.safe) {
      // камень у F4: кто идёт за флажками, обходит его слева
      if (g.lo > 1 && wanted.some(f => f.s0 < g.s1 + 10 && f.s1 > g.s0 - 10 && f.hi < 0)) gaps.push({ ...g, s0: g.s0 - 4, lo: -5.6, hi: -3.7 });
      else gaps.push(g);
    }
    gaps.push(...wanted);
    this.fill(this.line, gaps);
    this.fill(this.rampLine, gaps.map(g => (g === this.safe[3] ? this.ramp : g)));
  }

  /**
   * Линия поперёк коридора: в узких местах — в своих пределах, между ними — к своей полосе, но не круче SLOPE м
   * вбок на метр пути (пределы протягиваются назад и вперёд по кругу, так что к узкому месту бот выходит заранее).
   */
  private fill(line: Float64Array, gaps: Gap[]): void {
    const tr = this.c.track;
    const n = tr.n;
    const lo = new Float64Array(n);
    const hi = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const w = tr.hw[j] - 1.6;
      lo[j] = -w;
      hi[j] = w;
      const s = tr.s[j];
      for (const g of gaps) {
        if (s < g.s0 || s > g.s1) continue;
        lo[j] = Math.max(lo[j], g.lo);
        hi[j] = Math.min(hi[j], g.hi);
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let j = n - 1; j >= 0; j--) {
        const k = (j + 1) % n;
        const d = SLOPE * tr.len[j];
        lo[j] = Math.max(lo[j], lo[k] - d);
        hi[j] = Math.min(hi[j], hi[k] + d);
      }
      for (let j = 0; j < n; j++) {
        const k = (j + n - 1) % n;
        const d = SLOPE * tr.len[k];
        lo[j] = Math.max(lo[j], lo[k] - d);
        hi[j] = Math.min(hi[j], hi[k] + d);
      }
    }
    for (let j = 0; j < n; j++) line[j] = lo[j] > hi[j] ? (lo[j] + hi[j]) / 2 : Math.max(lo[j], Math.min(hi[j], this.lane));
  }

  /** Прямая от катера к точке проходит у камня — точку отодвигаем от него (в ту сторону, куда прямая и так ближе). */
  private avoid(x: number, z: number, t: { x: number; z: number }): void {
    for (let pass = 0; pass < 2; pass++) {
      for (const o of this.c.obstacles) {
        for (let k = 0; k <= 2; k++) {
          const cx = o.ax + ((o.bx - o.ax) * k) / 2;
          const cz = o.az + ((o.bz - o.az) * k) / 2;
          const ex = t.x - x;
          const ez = t.z - z;
          const ll = ex * ex + ez * ez;
          if (ll < 1e-6) continue;
          const u = Math.max(0, Math.min(1, ((cx - x) * ex + (cz - z) * ez) / ll));
          const qx = x + ex * u - cx;
          const qz = z + ez * u - cz;
          const d = Math.hypot(qx, qz);
          const need = o.r + AVOID;
          if (d >= need || u <= 0 || u >= 1) continue;
          // в сторону от камня, перпендикулярно прямой
          let nx = d > 1e-3 ? qx / d : -ez / Math.sqrt(ll);
          let nz = d > 1e-3 ? qz / d : ex / Math.sqrt(ll);
          const along = (nx * ex + nz * ez) / Math.sqrt(ll);
          nx -= (along * ex) / Math.sqrt(ll);
          nz -= (along * ez) / Math.sqrt(ll);
          const n = Math.hypot(nx, nz) || 1;
          const push = Math.min(2.5, (need - d) * 1.3);
          t.x += (nx / n) * push;
          t.z += (nz / n) * push;
        }
      }
    }
  }

  /** Потолок для шага физики */
  get topMul(): number {
    return LEVELS[this.level].top * this.rubber;
  }

  /** Кнопки на шаг. toGo — тиков до «Марш!» (0 и меньше — гонка идёт). */
  input(s: RgBoat, seq: number, toGo: number): Input {
    const inp = this.inp;
    inp.seq = seq;
    inp.viewTick = seq;
    inp.buttons = 0;
    if (s.done) return inp;
    if (toGo > 0) {
      // сильный ловит удачный старт: газ за 10 тиков до сигнала (иногда)
      if (toGo === 12) this.early = this.level === 2 ? this.rnd() < 0.7 : this.level === 1 && this.rnd() < 0.3;
      inp.buttons = this.early && toGo <= 10 ? BTN_FORWARD : 0;
      return inp;
    }

    if (s.lap !== this.lap) this.plan(s.lap);
    const tr = this.c.track;
    const speed = Math.hypot(s.vx, s.vz);
    // точка впереди по своей линии
    let i = s.seg;
    let ahead = 3 + speed * 0.35;
    while (ahead > 0) {
      ahead -= tr.len[i];
      i = wrapSeg(tr, i + 1);
    }
    // на трамплин — только разогнавшись (за 30 м до него решает по скорости)
    const line = this.rampTaken && speed >= RAMP_SPEED ? this.rampLine : this.line;
    const lat = line[i];
    const aim = { x: tr.px[i] - tr.tz[i] * lat, z: tr.pz[i] + tr.tx[i] * lat };
    this.avoid(s.x, s.z, aim);
    const dx = aim.x - s.x;
    const dz = aim.z - s.z;
    const err = Math.atan2(s.hz * dx - s.hx * dz, s.hx * dx + s.hz * dz);
    // поворот впереди: самая крутая кривизна на тормозном пути и прямо здесь (до 6 м)
    let bend = 0;
    let near = 0;
    let turnSign = 0;
    let j = s.seg;
    for (let m = 0; m < 10 + speed * 1.6; m += tr.len[j], j = wrapSeg(tr, j + 1)) {
      const k = Math.abs(tr.curv[j]);
      bend = Math.max(bend, k);
      if (m < 6 && k > near) {
        near = k;
        turnSign = tr.curv[j] > 0 ? 1 : -1;
      }
    }
    const drifting = s.drift > 0;
    // крутая шпилька (радиус до 12 м) — заносом
    const wantDrift = this.drifts && near > 0.08 && speed > 9;
    const radius = bend > 1e-4 ? 1 / bend : 1e4;
    const target = Math.min(RG_TOP * this.topMul, Math.max(6.5, radius * (this.drifts && bend > 0.08 ? 1.6 : 1.2)));
    const desired = Math.max(-1, Math.min(1, err * (drifting ? 3.2 : 4.5)));
    let b = 0;
    if (desired > s.steer + 0.04) b |= BTN_LEFT;
    else if (desired < s.steer - 0.04) b |= BTN_RIGHT;
    if (speed > target + 1.2 && !drifting) b |= BTN_BACK;
    else if (speed < target + 0.5) b |= BTN_FORWARD;
    if (wantDrift || (drifting && Math.abs(tr.curv[s.seg]) > 0.03)) {
      b |= BTN_DASH;
      // занос начинается с руля в сторону поворота
      if (!drifting) b = (b & ~(BTN_LEFT | BTN_RIGHT)) | (turnSign > 0 ? BTN_LEFT : BTN_RIGHT);
    }
    // застрял (уткнулся) — к воротам
    if (speed < 1.5 && s.stall === 0) this.stuck++;
    else this.stuck = 0;
    if (this.stuck > 150 && s.cool === 0) {
      this.stuck = 0;
      b = BTN_RELOAD;
    }
    inp.buttons = b;
    return inp;
  }
}
