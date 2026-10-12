// Боты картинга: едут по своей линии (внутрь поворотов, по асфальту), которая заранее обходит бочки, блоки и лужи и
// заезжает на ускорители; заранее тормозят до допустимой скорости, перед трамплином и гребнем только газуют; перед
// движущимися помехами прикидывают, где окажутся они и сам бот, и сдвигаются в сторону или притормаживают.
// Сильные боты проходят крутые повороты заносом (и стреляют мини-турбо), в полёте крутят трюк, на старте ловят «1».
// Бонусы применяют по простым правилам, застряли — R. Срезки (через бухту, через реку, по песку) — только для людей.
// Руль — кнопками, но «пропорционально»: каждый тик выбирают A, D или ничего — что ближе к нужному повороту руля.
import { MV_GATE, gatePhase, MV_SPIN, NO_DECK, deckAt, makeCap, moverCap, type Mover, type Solid } from '../../shared/hazards.ts';
import { ITEM_BUBBLE, ITEM_CLAP, ITEM_JAM, ITEM_PAINT, ITEM_TURBO, KART_R, type KartState } from '../../shared/kart.ts';
import { makeRng } from '../../shared/math.ts';
import { BTN_BACK, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, type Input } from '../../shared/sim.ts';
import { locate, locateAny, makeLoc, wrapSeg, type Track } from '../../shared/track.ts';

export type KartSkill = 'easy' | 'normal' | 'hard';

/** Что бот знает о гонке */
export interface BotView {
  /** Идёт гонка (на решётке и после финиша — нет) */
  racing: boolean;
  /** На решётке: тиков до старта (0 — не на решётке) */
  gridLeft: number;
  place: number;
  karts: number;
  /** Ближайший сзади и впереди, м по трассе (Infinity — никого) */
  behind: number;
  ahead: number;
  /** Ближайший карт рядом (без пузыря), м по прямой */
  near: number;
  painted: boolean;
  /** На боте пузырь */
  bubble: boolean;
}

interface SkillParams {
  /** Допустимое боковое ускорение в повороте, м/с² */
  lat: number;
  /** Доля предельного поворота руля, на которую бот рассчитывает */
  turn: number;
  /** Каким замедлением бот считает торможение, м/с² */
  brake: number;
  /** Насколько бот срезает повороты (доля от возможного) */
  cut: number;
  /** Быстрее этого по прямой не едет */
  top: number;
  /** Как далеко вперёд бот смотрит на движущиеся помехи, с, и какой запас оставляет до них, м */
  look: number;
  margin: number;
  /** Доля поворотов, которые проходит заносом (0 — никогда) */
  drift: number;
  /** Ракетный старт: газ за столько тиков до старта (от и до; больше ROCKET_WINDOW из kart.ts — пробуксовка, 0 — с места) */
  launch: [number, number];
  /** Трюк в полёте: вероятность */
  trick: number;
}

const SKILLS: Record<KartSkill, SkillParams> = {
  easy: { lat: 9.5, turn: 0.72, brake: 10, cut: 0.6, top: 19.5, look: 1.0, margin: -0.15, drift: 0, launch: [0, 110], trick: 0 },
  normal: { lat: 12, turn: 0.82, brake: 14, cut: 0.85, top: 21, look: 2.0, margin: 0.45, drift: 0.5, launch: [20, 80], trick: 0.5 },
  hard: { lat: 15, turn: 0.9, brake: 18, cut: 1, top: 22, look: 2.9, margin: 0.9, drift: 1, launch: [24, 58], trick: 1 },
};

// числа физики карта (shared/kart.ts) — для расчёта скоростей в поворотах
const STEER_STEP = 8 / 60;
const TURN_RATE = 2.3;
const TURN_FALL = 0.58;
const TURN_MIN = 0.5;
const TURN_FULL_AT = 5;
const MAX_SPEED = 22;
/** Занос: множитель поворота и руль внутрь (0,75 + 0,4) — на это бот рассчитывает с запасом */
const DRIFT_TURN = 1.5 * 1.15;
/** Путь в заносе шире, чем курс: боковое скольжение */
const DRIFT_SLIP = 1.12;
/** С ускорителем быстрее потолка бот не тормозит, если поворот позволяет */
const BOOST_TOP = 30;
/** Занос начинается не медленнее и держится, пока поворот круче (1/м) */
const DRIFT_MIN_SPEED = 11;
const DRIFT_CURV = 1 / 34;
/** Поворот под занос — не короче, м, и без заноса требует скорости не выше, м/с */
const DRIFT_ZONE_LEN = 14;
const DRIFT_ZONE_SPEED = 19;

const STUCK_TICKS = 120;
/** Цель руля — точка линии впереди на столько метров: база и на каждый м/с скорости */
const LOOK_BASE = 3.5;
const LOOK_SPEED = 0.3;

/** Запас между краем карта и неподвижной помехой, м */
const CLEAR = KART_R + 0.45;
/** Запас вдоль дороги до помехи и расстояние, на котором линия возвращается на место, м */
const AHEAD_PAD = KART_R + 0.5;
const BLEND = 7;
/** Лужу объезжаем, только если для этого не нужно сдвигаться дальше, м */
const SLICK_MAX_SHIFT = 4.6;
/** Ускоритель притягивает линию, если до него не дальше, м */
const PAD_REACH = 4.5;
/** Сдвиги линии (кроме «по линии» и «остаться в полосе»), из которых бот выбирает перед движущейся помехой */
const SHIFTS = [2.6, -2.6, 4.6, -4.6];
/** Шаг прикидки пути, тиков */
const PLAN_STEP = 6;
/** Ждать перед зоной помехи: встать за столько метров до её границы; запас вокруг зоны, м */
const HOLD_STOP = 2;
const ZONE_PAD = 1.2;
/** Запас от сдвинутой линии до бочек и блоков, м */
const SOLID_CLEAR = 0.45;
/** Разгон бота в прикидке, м/с², и как быстро он уходит вбок на линии, м/с */
const PLAN_ACCEL = 10;
const LAT_SPEED = 3.2;
/** От бота до движущейся помехи по трассе: смотрим, пока она не дальше (отрезков) и не позади больше чем на */
const PLAN_AHEAD = 60;
const PLAN_BEHIND = 4;

/** Наибольшая скорость, на которой руль ещё проходит поворот радиуса r. */

/** Наибольшая скорость, на которой руль ещё проходит поворот радиуса r (занос — сильнее, но путь шире курса). */
function turnLimit(r: number, share: number, drift = false): number {
  let v = 30;
  for (; v > 5; v -= 0.25) {
    const w = share * TURN_RATE * (TURN_MIN + (1 - TURN_MIN) * Math.min(1, v / TURN_FULL_AT)) * (1 - TURN_FALL * Math.min(1, v / MAX_SPEED));
    if (drift ? (v * DRIFT_SLIP) / r <= w * DRIFT_TURN : v / r <= w) break;
  }
  return v;
}

/** Помеха на дороге для линии бота: полоса поперёк (lo…hi, м вправо от осевой) и вдоль (путь a0…a1) */
interface Block {
  a0: number;
  a1: number;
  lo: number;
  hi: number;
  /** Лужа: объезжается, только если недорого */
  soft: boolean;
  /** Ускоритель: притягивает линию к lat */
  pad: boolean;
  lat: number;
}

/** Поворот под занос: участок пути и сторона (+1 — влево) */
interface DriftZone {
  s0: number;
  s1: number;
  dir: number;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export class KartBot {
  private readonly tr: Track;
  private readonly rng: () => number;
  private readonly sk: SkillParams;
  /** Своя линия и допустимая скорость в каждой точке трассы */
  private readonly lx: Float64Array;
  private readonly lz: Float64Array;
  private readonly vcap: Float64Array;
  /** То же без потолка скорости бота: под ускорителем */
  private readonly vboost: Float64Array;
  /** Допустимая скорость в заносе */
  private readonly vdrift: Float64Array;
  /** 1 — впереди (до 30 м) трамплин, провал или гребень: только газ по линии */
  private readonly jump: Uint8Array;
  /** Повороты под занос и номер поворота для каждой точки (−1 — нет) */
  private readonly zones: DriftZone[] = [];
  private readonly zoneAt: Int16Array;
  /** Кривизна своей линии со знаком (+ — влево) */
  private readonly kv: Float64Array;
  /** Какие повороты этот бот проходит заносом */
  private readonly zoneUse: boolean[] = [];
  private readonly loc = makeLoc();
  private readonly cap = makeCap();
  /** Выбор перед движущимися помехами: сдвиг линии вправо и потолок скорости, пока ждём */
  private planShift = 0;
  private holdCap = Infinity;
  private itemAt = -1;
  private itemWait = 0;
  private stuckSince = -1;
  private prevButtons = 0;
  private jx = 0;
  private jz = 0;
  /** Занос: поворот, в котором бот заносит (−1 — нет), и тик подскока */
  private driftZone = -1;
  private hopTick = -1;
  /** Старт: за сколько тиков до «Вперёд!» нажать газ; трюк в этом полёте */
  private readonly launchAt: number;
  private trickTry = false;

  constructor(tr: Track, skill: KartSkill, seed: number) {
    this.tr = tr;
    this.rng = makeRng(seed);
    const sk = SKILLS[skill];
    this.sk = sk;
    const n = tr.n;
    this.launchAt = Math.round(sk.launch[0] + (sk.launch[1] - sk.launch[0]) * this.rng());
    // сдвиг внутрь поворота, сглаженный, плюс свой сдвиг ±0,8 м (чтобы боты не ехали гуськом)
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const c = tr.curv[i];
      raw[i] = -Math.sign(c) * Math.min(0.6, Math.abs(c) * 12) * (tr.hw[i] - 1.6) * sk.cut;
    }
    const bias = (this.rng() * 2 - 1) * 0.8;
    const off = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let d = -10; d <= 10; d++) s += raw[wrapSeg(tr, i + d)];
      off[i] = s / 21 + bias;
    }
    // ускорители притягивают линию, бочки, блоки и лужи — отталкивают
    this.steer(off, this.blocks());
    this.lx = new Float64Array(n);
    this.lz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const edge = tr.hw[i] - 1.4;
      const o = Math.max(-edge, Math.min(edge, off[i]));
      this.lx[i] = tr.px[i] - tr.tz[i] * o;
      this.lz[i] = tr.pz[i] + tr.tx[i] * o;
    }
    // кривизна своей линии (со знаком: + — влево) и допустимые скорости: по рулю и боковому ускорению, в заносе — по
    // рулю заноса; с запасом на торможение до следующих поворотов
    const kv = new Float64Array(n);
    this.kv = kv;
    this.vboost = new Float64Array(n);
    this.vdrift = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = wrapSeg(tr, i - 2);
      const c = wrapSeg(tr, i + 2);
      const abx = this.lx[i] - this.lx[a];
      const abz = this.lz[i] - this.lz[a];
      const bcx = this.lx[c] - this.lx[i];
      const bcz = this.lz[c] - this.lz[i];
      const acx = this.lx[c] - this.lx[a];
      const acz = this.lz[c] - this.lz[a];
      const cross = abx * bcz - abz * bcx;
      const k = (2 * Math.abs(cross)) / (Math.hypot(abx, abz) * Math.hypot(bcx, bcz) * Math.hypot(acx, acz));
      kv[i] = cross > 0 ? -k : k;
      const r = k > 1e-4 ? 1 / k : 1e4;
      this.vboost[i] = Math.min(Math.sqrt(sk.lat * r), turnLimit(r, sk.turn), BOOST_TOP);
      this.vdrift[i] = Math.min(turnLimit(r, sk.turn, true), BOOST_TOP);
    }
    // повороты под занос: подряд кривизна одного знака круче DRIFT_CURV, длиной не меньше DRIFT_ZONE_LEN, где без заноса
    // пришлось бы ехать медленнее DRIFT_ZONE_SPEED
    this.zoneAt = new Int16Array(n).fill(-1);
    for (let i = 0; i < n; ) {
      const dir = Math.sign(kv[i]);
      if (Math.abs(kv[i]) < DRIFT_CURV || (i === 0 && Math.sign(kv[n - 1]) === dir && Math.abs(kv[n - 1]) >= DRIFT_CURV)) {
        i++;
        continue;
      }
      let j = i;
      let slow = Infinity;
      while (j < n && Math.sign(kv[j]) === dir && Math.abs(kv[j]) >= DRIFT_CURV) {
        slow = Math.min(slow, this.vboost[j]);
        j++;
      }
      const s0 = tr.s[i];
      const s1 = j < n ? tr.s[j] : tr.length;
      // в повороте и сразу за ним — ни помех, которые надо объезжать, ни прыжков: из заноса туда не вписаться
      let clear = true;
      for (const so of tr.hz.solids) {
        const d = (tr.s[so.seg] - s0 + tr.length) % tr.length;
        if (d < s1 - s0 + 25) clear = false;
      }
      for (let q = i, m = 0; m < s1 - s0 + 20 && clear; m += tr.len[q], q = wrapSeg(tr, q + 1)) if (tr.gap[q]) clear = false;
      if (clear && s1 - s0 >= DRIFT_ZONE_LEN && slow < DRIFT_ZONE_SPEED) {
        const z = this.zones.length;
        this.zones.push({ s0, s1, dir });
        this.zoneUse.push(this.rng() < sk.drift);
        for (let q = i; q < j; q++) this.zoneAt[q] = z;
      }
      i = j;
    }
    for (const arr of [this.vboost, this.vdrift]) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = n - 1; i >= 0; i--) {
          const next = arr[wrapSeg(tr, i + 1)];
          const reach = Math.sqrt(next * next + 2 * sk.brake * tr.len[i]);
          if (reach < arr[i]) arr[i] = reach;
        }
      }
    }
    this.vcap = new Float64Array(n);
    for (let i = 0; i < n; i++) this.vcap[i] = Math.min(this.vboost[i], sk.top);
    // впереди прыжок: провал или излом рельефа вниз (гребень)
    this.jump = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let hit = false;
      for (let m = 0, j = i; m < 30 && !hit; m += tr.len[j], j = wrapSeg(tr, j + 1)) {
        const p = wrapSeg(tr, j - 1);
        const q = wrapSeg(tr, j + 1);
        const g0 = (tr.h[j] - tr.h[p]) / tr.len[p];
        const g1 = (tr.h[q] - tr.h[j]) / tr.len[j];
        if (tr.gap[j] || g1 - g0 < -0.06) hit = true;
      }
      this.jump[i] = hit ? 1 : 0;
    }
    const lc = makeLoc();
    for (const m of tr.hz.movers) {
      locateAny(tr, m.cx, m.cz, lc);
      this.moverS.push(tr.s[lc.seg] + tr.len[lc.seg] * lc.t);
    }
  }

  /** Допустимая скорость в точке трассы (для тестов и отладки) */
  speedAt(seg: number): number {
    return this.vcap[seg];
  }

  /** Сколько поворотов этот бот проходит заносом (для тестов) */
  driftCorners(): number {
    let c = 0;
    for (const u of this.zoneUse) if (u) c++;
    return c;
  }

  /** Помехи, которые линия обходит или (ускорители) ищет: в координатах «путь, вправо от осевой». */
  private blocks(): Block[] {
    const tr = this.tr;
    const hz = tr.hz;
    const loc = makeLoc();
    const out: Block[] = [];
    const at = (x: number, z: number): [number, number, number] => {
      locateAny(tr, x, z, loc);
      return [tr.s[loc.seg] + tr.len[loc.seg] * loc.t, loc.lat, loc.seg];
    };
    for (const s of hz.solids) {
      const [sa, la] = at(s.ax, s.az);
      const [sb, lb] = at(s.bx, s.bz);
      out.push({ a0: Math.min(sa, sb) - s.r, a1: Math.max(sa, sb) + s.r, lo: Math.min(la, lb) - s.r, hi: Math.max(la, lb) + s.r, soft: false, pad: false, lat: 0 });
    }
    for (const s of hz.slicks) {
      const [sc, lc, seg] = at(s.x, s.z);
      // опорная функция эллипса по направлению u: sqrt((rl · u·f)² + (rw · u·g)²), g — поперёк оси лужи
      const ext = (ux: number, uz: number): number => {
        const a = s.rl * (ux * s.fx + uz * s.fz);
        const b = s.rw * (-ux * s.fz + uz * s.fx);
        return Math.sqrt(a * a + b * b);
      };
      const along = ext(tr.tx[seg], tr.tz[seg]);
      const side = ext(-tr.tz[seg], tr.tx[seg]);
      out.push({ a0: sc - along, a1: sc + along, lo: lc - side, hi: lc + side, soft: true, pad: false, lat: 0 });
    }
    for (const p of hz.pads) {
      // ускорители на настилах срезки не ищем
      if (deckAt(hz, p.x, p.z) > NO_DECK) continue;
      const [sc, lc] = at(p.x, p.z);
      if (Math.abs(lc) > tr.hw[loc.seg] - 0.8) continue;
      out.push({ a0: sc - p.hl, a1: sc + p.hl, lo: lc - p.hw, hi: lc + p.hw, soft: false, pad: true, lat: lc });
    }
    return out;
  }

  /** Подправить сдвиги линии: сначала ускорители (притягивают), потом всё твёрдое и лужи (отталкивают). */
  private steer(off: Float64Array, list: Block[]): void {
    const tr = this.tr;
    const L = tr.length;
    const n = tr.n;
    const wrap = (d: number): number => {
      d %= L;
      return d > L / 2 ? d - L : d < -L / 2 ? d + L : d;
    };
    const at = (sc: number): number => {
      let best = 0;
      for (let i = 1; i < n; i++) if (Math.abs(wrap(tr.s[i] - sc)) < Math.abs(wrap(tr.s[best] - sc))) best = i;
      return best;
    };
    // границы, которые обязаны выдержать сдвиги на самих помехах (блоки и бочки идут подряд — плавные подходы друг
    // другу мешают, а границы — нет)
    const lo = new Float64Array(n).fill(-Infinity);
    const hi = new Float64Array(n).fill(Infinity);
    const apply = (b: Block, f: (i: number, w: number) => void, bound?: (i: number) => void): void => {
      const sc = (b.a0 + b.a1) / 2;
      const z0 = sc - b.a0 + AHEAD_PAD;
      const z1 = b.a1 - sc + AHEAD_PAD;
      for (let i = 0; i < n; i++) {
        const d = wrap(tr.s[i] - sc);
        if (d < -z0 - BLEND || d > z1 + BLEND) continue;
        const inside = d >= -z0 && d <= z1;
        f(i, inside ? 1 : smooth(d < -z0 ? (d + z0 + BLEND) / BLEND : (z1 + BLEND - d) / BLEND));
        if (inside && bound) bound(i);
      }
    };
    for (const b of list) {
      if (!b.pad) continue;
      const c = at((b.a0 + b.a1) / 2);
      if (Math.abs(b.lat - off[c]) > PAD_REACH) continue;
      apply(b, (i, w) => (off[i] += w * (b.lat - off[i])));
    }
    for (const b of list) {
      if (b.pad) continue;
      const c = at((b.a0 + b.a1) / 2);
      const edge = tr.hw[c] - 1.4;
      const toLeft = b.lo - CLEAR;
      const toRight = b.hi + CLEAR;
      const okL = toLeft >= -edge;
      const okR = toRight <= edge;
      const costL = Math.max(0, off[c] - toLeft);
      const costR = Math.max(0, toRight - off[c]);
      let left: boolean;
      if (okL && okR) left = costL <= costR;
      else if (okL) left = true;
      else if (okR) left = false;
      else left = b.lo + b.hi >= 0;
      const cost = left ? costL : costR;
      // лужу объезжаем, только если это недорого и есть где
      if (b.soft && (!(left ? okL : okR) || cost > SLICK_MAX_SHIFT)) continue;
      if (left) {
        apply(b, (i, w) => (off[i] += w * (Math.min(off[i], toLeft) - off[i])), (i) => (hi[i] = Math.min(hi[i], toLeft)));
      } else {
        apply(b, (i, w) => (off[i] += w * (Math.max(off[i], toRight) - off[i])), (i) => (lo[i] = Math.max(lo[i], toRight)));
      }
    }
    for (let i = 0; i < n; i++) off[i] = Math.max(lo[i], Math.min(hi[i], off[i]));
  }

  /** Точка своей линии в ahead метрах впереди от точки (seg, t) отрезка; сдвиг shift — вправо от линии */
  private lineAt(seg: number, t: number, ahead: number, shift: number, out: { x: number; z: number }): void {
    const tr = this.tr;
    let j = seg;
    let rem = ahead + t * tr.len[j];
    while (rem > tr.len[j]) {
      rem -= tr.len[j];
      j = wrapSeg(tr, j + 1);
    }
    const j2 = wrapSeg(tr, j + 1);
    const f = rem / tr.len[j];
    out.x = this.lx[j] + (this.lx[j2] - this.lx[j]) * f - tr.tz[j] * shift;
    out.z = this.lz[j] + (this.lz[j2] - this.lz[j]) * f + tr.tx[j] * shift;
  }

  private readonly pt = { x: 0, z: 0 };
  private readonly cands: number[] = [];
  /** Путь от линии старта до середины каждой движущейся помехи */
  private readonly moverS: number[] = [];
  /** Неподвижные помехи впереди (для сдвинутой линии) */
  private readonly solidsNear: Solid[] = [];
  private readonly moversNear: Mover[] = [];

  /**
   * Через сколько тиков карт заденет движущуюся помеху из списка или (если он не на своей линии) неподвижную
   * (Infinity — не заденет в ближайшие look секунд), если поедет по своей линии со сдвигом shift: карт сейчас в сдвиге
   * from от линии и уходит к shift не сразу, скорость v0 — к vf.
   */
  private conflict(movers: readonly Mover[], rt: number, seg: number, t: number, v0: number, vf: number, from: number, shift: number, margin: number): number {
    const p = this.pt;
    const cap = this.cap;
    const steps = Math.ceil((this.sk.look * 60) / PLAN_STEP);
    const dt = PLAN_STEP / 60;
    let v = v0;
    let d = 0;
    for (let q = 0; q <= steps; q++) {
      const ticks = q * PLAN_STEP;
      const lim = (LAT_SPEED * ticks) / 60;
      const lat = from + Math.max(-lim, Math.min(lim, shift - from));
      this.lineAt(seg, t, d, lat, p);
      for (const m of movers) {
        moverCap(m, rt + 1 + ticks, cap);
        // расстояние от точки до отрезка капсулы
        const ex = cap.bx - cap.ax;
        const ez = cap.bz - cap.az;
        const l2 = ex * ex + ez * ez;
        let u = l2 > 1e-9 ? ((p.x - cap.ax) * ex + (p.z - cap.az) * ez) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = p.x - (cap.ax + ex * u);
        const dz = p.z - (cap.az + ez * u);
        const R = cap.r + KART_R + margin;
        if ((m.kind !== MV_GATE || gatePhase(m, rt + 1 + ticks) === 2) && dx * dx + dz * dz < R * R) return ticks;
      }
      // сдвинутая линия (и возврат на линию сбоку) не должна упираться в бочки и блоки, которые основная линия объезжала
      if (shift !== 0 || from !== 0) {
        for (const s of this.solidsNear) {
          const sx = s.bx - s.ax;
          const sz = s.bz - s.az;
          const sl2 = sx * sx + sz * sz;
          let w = sl2 > 1e-9 ? ((p.x - s.ax) * sx + (p.z - s.az) * sz) / sl2 : 0;
          w = w < 0 ? 0 : w > 1 ? 1 : w;
          const ox = p.x - (s.ax + sx * w);
          const oz = p.z - (s.az + sz * w);
          const RS = s.r + KART_R + SOLID_CLEAR;
          if (ox * ox + oz * oz < RS * RS) return ticks;
        }
      }
      v = vf < v ? Math.max(vf, v - this.sk.brake * dt) : Math.min(vf, v + PLAN_ACCEL * dt);
      d += v * dt;
    }
    return Infinity;
  }

  /** Сколько метров по трассе до границы зоны помехи m (меньше нуля — карт уже в зоне или проехал её). */
  private gapTo(m: Mover, seg: number, t: number): number {
    const tr = this.tr;
    const L = tr.length;
    let ds = this.moverS[this.tr.hz.movers.indexOf(m)] - (tr.s[seg] + tr.len[seg] * t);
    ds %= L;
    if (ds > L / 2) ds -= L;
    else if (ds < -L / 2) ds += L;
    return ds - (m.kind === MV_SPIN ? m.h + m.r : m.r + 0.5) - KART_R - ZONE_PAD;
  }

  /**
   * Перед движущимися помехами впереди: ехать по линии (со сдвигом в сторону, если так проскочить можно) или, если
   * проскочить нельзя, ждать — тормозить так, чтобы встать до границы зоны. Уже в зоне — выбираться, не вставать.
   */
  private plan(k: KartState, seg: number, t: number, speed: number): void {
    const tr = this.tr;
    const movers = tr.hz.movers;
    const last = this.planShift;
    this.planShift = 0;
    this.holdCap = Infinity;
    const near = this.moversNear;
    near.length = 0;
    for (let i = 0; i < movers.length; i++) {
      const m = movers[i];
      const d = wrapSeg(tr, m.seg - seg);
      if (d <= PLAN_AHEAD || d >= tr.n - PLAN_BEHIND) near.push(m);
    }
    // на сколько карт сейчас правее своей линии (отрезок линии рядом с ним)
    const here = this.pt;
    this.lineAt(seg, t, 0, 0, here);
    const from = (k.x - here.x) * -tr.tz[seg] + (k.z - here.z) * tr.tx[seg];
    // на своей линии и ничего не движется рядом — линия и так объезжает бочки
    if (near.length === 0 && Math.abs(from) < 0.6) return;
    this.solidsNear.length = 0;
    for (const s of tr.hz.solids) {
      const d = wrapSeg(tr, s.seg - seg);
      if (d <= PLAN_AHEAD || d >= tr.n - PLAN_BEHIND) this.solidsNear.push(s);
    }
    if (near.length === 0 && this.solidsNear.length === 0) return;
    const v0 = Math.max(0, speed);
    const vOwn = Math.min(this.vcap[seg], this.vcap[wrapSeg(tr, seg + 1)]);
    // сдвиг не должен прижимать к стене: о стену карт теряет скорость и опаздывает к своему окну
    let hwMin = tr.hw[seg];
    for (const m of near) hwMin = Math.min(hwMin, tr.hw[m.seg]);
    const room = hwMin - KART_R - 0.3;
    const lineOff = (this.lx[seg] - tr.px[seg]) * -tr.tz[seg] + (this.lz[seg] - tr.pz[seg]) * tr.tx[seg];
    // кандидаты: прежний выбор (пока рядом помеха и он свободен — не метаться: на малой скорости карт перекладывается
    // медленнее, чем думает план), своя линия, «остаться в своей полосе» (где карт сейчас), сдвиги в стороны
    const cands = this.cands;
    cands.length = 0;
    if (near.length > 0 && last !== 0) cands.push(last);
    cands.push(0);
    if (Math.abs(from) > 0.4) cands.push(from);
    for (const sh of SHIFTS) cands.push(sh);
    let late = -1;
    let lateShift = 0;
    for (const sh of cands) {
      // сдвинутая линия не должна уходить за край дороги
      if (Math.abs(sh) > 0.01 && Math.abs(lineOff + sh) > room) continue;
      // кроме нынешнего выбора берём только с запасом: так выбор не мечется
      const margin = Math.abs(sh - last) < 0.3 ? this.sk.margin : this.sk.margin + 0.5;
      const first = this.conflict(near, k.rt, seg, t, v0, vOwn, from, sh, margin);
      if (first === Infinity) {
        this.planShift = sh;
        return;
      }
      if (first > late) {
        late = first;
        lateShift = sh;
      }
    }
    // проскочить нельзя: если до зоны ещё есть место — встать перед ней, а если уже в зоне — выбираться, где удар позже
    let dz = Infinity;
    for (const m of near) dz = Math.min(dz, this.gapTo(m, seg, t));
    if (near.length > 0 && dz > 0) {
      // стоим в своей полосе: линия «со сдвигом» — там, где карт уже едет
      this.planShift = from;
      this.holdCap = Math.sqrt(2 * this.sk.brake * Math.max(0, dz - HOLD_STOP));
    } else this.planShift = lateShift;
  }


  /** Путь от линии старта до точки (seg, t) */
  private sAt(seg: number, t: number): number {
    return this.tr.s[seg] + this.tr.len[seg] * t;
  }

  /** Сколько метров по трассе от s до s1 (вперёд, по кругу) */
  private ahead(s: number, s1: number): number {
    const L = this.tr.length;
    let d = (s1 - s) % L;
    if (d < 0) d += L;
    return d;
  }

  update(k: KartState, v: BotView, tick: number, out: Input): Input {
    let b = 0;
    if (k.done) {
      out.buttons = 0;
      this.prevButtons = 0;
      return out;
    }
    const tr = this.tr;
    // решётка: газ — когда до старта осталось launchAt тиков (сильные ловят «1», слабые иногда спешат)
    if (!v.racing) {
      if (v.gridLeft > 0 && this.launchAt > 0 && v.gridLeft <= this.launchAt) b |= BTN_FORWARD;
      this.prevButtons = b;
      out.buttons = b;
      return out;
    }
    const loc = locate(tr, k.x, k.z, k.seg, this.loc);
    const speed = k.vx * k.hx + k.vz * k.hz;
    const sNow = this.sAt(loc.seg, loc.t);
    // перед трамплином и гребнем — только газ по своей линии, никаких «уворотов»
    const ramp = this.jump[loc.seg] === 1;
    if (k.ghostT === 0 && !ramp && k.grounded && k.drift === 0) this.plan(k, loc.seg, loc.t, speed);
    else {
      this.planShift = 0;
      this.holdCap = Infinity;
    }

    // занос: поворот впереди — подскок с рулём в его сторону; в повороте держим пробел; кончился — отпускаем (мини-турбо)
    let driftDir = 0;
    if (k.drift !== 0 && this.driftZone >= 0) {
      const z = this.zones[this.driftZone];
      const left = this.ahead(sNow, z.s1);
      const out2 = left > z.s1 - z.s0 + 20; // уже за концом поворота (ahead по кругу ушёл далеко)
      if (!out2 && left > 3 + speed * 0.12 && speed > 8) {
        b |= BTN_JUMP;
        driftDir = z.dir;
      } else this.driftZone = -1;
    } else if (k.drift !== 0) {
      // занос без плана (подскок перед трамплином и т. п.) — сразу выйти
      this.driftZone = -1;
    } else {
      if (this.hopTick >= 0 && tick - this.hopTick < 24 && this.driftZone >= 0) {
        // в подскоке: держим пробел и руль в сторону поворота — на приземлении начнётся занос
        b |= BTN_JUMP;
        driftDir = this.zones[this.driftZone].dir;
      } else {
        this.hopTick = -1;
        this.driftZone = -1;
        const zi = this.nextZone(loc.seg, sNow, speed);
        if (zi >= 0 && k.grounded && speed >= DRIFT_MIN_SPEED && this.planShift === 0 && k.spinT === 0 && !ramp) {
          this.driftZone = zi;
          this.hopTick = tick;
          b |= BTN_JUMP;
          driftDir = this.zones[zi].dir;
        }
      }
    }

    // цель — точка своей линии впереди (со сдвигом, если перед нами движущаяся помеха)
    const p = this.pt;
    const drifting = k.drift !== 0;
    this.lineAt(loc.seg, loc.t, LOOK_BASE + LOOK_SPEED * Math.max(0, speed) + (drifting ? 2 : 0), this.planShift, p);
    let tx = p.x;
    let tz = p.z;
    if (v.painted) {
      // краска на экране: цель дрожит
      if (tick % 12 === 0) {
        this.jx = (this.rng() * 2 - 1) * 2;
        this.jz = (this.rng() * 2 - 1) * 2;
      }
      tx += this.jx;
      tz += this.jz;
    }
    const dx = tx - k.x;
    const dz = tz - k.z;
    // в заносе нос смотрит внутрь поворота — целимся по скорости, а не по носу
    let fx = k.hx;
    let fz = k.hz;
    const vv = Math.hypot(k.vx, k.vz);
    if (drifting && vv > 3) {
      fx = k.vx / vv;
      fz = k.vz / vv;
    }
    const ang = Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz);
    let want = Math.abs(ang) < 0.03 ? 0 : Math.max(-1, Math.min(1, ang * 3.5));
    if (drifting) {
      // в заносе: руль «по кривизне линии» чуть впереди (сколько нужно поворота) плюс поправка на отклонение
      const need = this.needTurn(loc.seg, speed) * DRIFT_SLIP;
      const base = TURN_RATE * (1 - TURN_FALL * Math.min(1, Math.abs(speed) / MAX_SPEED)) * 1.5;
      const factor = need * k.drift / base;
      const ff = ((factor - 0.75) / 0.4) * k.drift;
      want = Math.max(-1, Math.min(1, ff + ang * 2));
    } else if (driftDir !== 0) {
      // в подскоке перед заносом — руль в сторону поворота: сколько нужно, но не меньше порога заноса
      const need = this.needTurn(loc.seg, speed) * driftDir;
      const base = TURN_RATE * (1 - TURN_FALL * Math.min(1, Math.abs(speed) / MAX_SPEED));
      want = driftDir * Math.max(0.4, Math.min(1, need / base));
    }
    // какая кнопка приблизит сглаженный руль к нужному
    const left = Math.min(1, k.steer + STEER_STEP);
    const right = Math.max(-1, k.steer - STEER_STEP);
    const none = k.steer > 0 ? Math.max(0, k.steer - STEER_STEP) : Math.min(0, k.steer + STEER_STEP);
    const dl = Math.abs(left - want);
    const dr = Math.abs(right - want);
    const dn = Math.abs(none - want);
    if (dl < dn && dl <= dr) b |= BTN_LEFT;
    else if (dr < dn) b |= BTN_RIGHT;

    // газ и тормоз
    const caps = drifting || driftDir !== 0 ? this.vdrift : k.boostT > 0 ? this.vboost : this.vcap;
    let cap = Math.min(caps[loc.seg], caps[wrapSeg(tr, loc.seg + 1)]);
    if (drifting || driftDir !== 0) cap = Math.min(cap, k.boostT > 0 ? BOOST_TOP : this.sk.top + 1);
    // ждём перед движущейся помехой — тормозим до остановки у границы её зоны
    if (this.holdCap < cap) cap = this.holdCap;
    if (ramp || speed < cap) b |= BTN_FORWARD;
    else if (speed > cap + 1) b |= BTN_BACK;

    // трюк: в полёте с гребня или трамплина — пробел (не держим его с земли)
    if (!k.grounded && k.trick === 1 && k.air >= 4) {
      if (k.air === 4) this.trickTry = this.rng() < this.sk.trick;
      if (this.trickTry && (this.prevButtons & BTN_JUMP) === 0) b |= BTN_JUMP;
    }

    // бонусы
    if (k.item !== 0 && k.itemT === 0) {
      if (this.itemAt < 0) {
        this.itemAt = tick;
        this.itemWait = k.item === ITEM_JAM ? 240 + Math.floor(this.rng() * 240) : 60 + Math.floor(this.rng() * 60);
      }
      const held = tick - this.itemAt;
      let use = false;
      if (k.item === ITEM_TURBO) {
        let c = 0;
        for (let m = 0, i = loc.seg; m < 30; m += tr.len[i], i = wrapSeg(tr, i + 1)) c = Math.max(c, Math.abs(tr.curv[i]));
        use = held >= 180 || (c < 0.01 && speed > 12 && !drifting);
      } else if (k.item === ITEM_JAM) use = v.behind < 12 || held >= this.itemWait;
      else if (k.item === ITEM_PAINT) use = v.place > 1 && held >= this.itemWait;
      else if (k.item === ITEM_BUBBLE) use = !v.bubble && (v.painted || k.slowT > 0 || v.behind < 15 || held >= this.itemWait + 120);
      else if (k.item === ITEM_CLAP) use = v.near < 6.5 || held >= 420;
      else use = true;
      if (use) b |= BTN_FIRE;
    } else this.itemAt = -1;

    // застрял — назад на КТ (ждёт перед помехой — не застрял, если только не упёрся, держа газ)
    if (k.ghostT === 0 && Math.abs(speed) < 1.5 && (this.holdCap === Infinity || (b & BTN_FORWARD) !== 0)) {
      if (this.stuckSince < 0) this.stuckSince = tick;
      else if (tick - this.stuckSince >= STUCK_TICKS) {
        b |= BTN_RELOAD;
        this.stuckSince = -1;
      }
    } else this.stuckSince = -1;

    // кнопки действий — только нажатием (отпустить на тик, если держал)
    b &= ~(this.prevButtons & (BTN_FIRE | BTN_RELOAD));
    this.prevButtons = b;
    out.buttons = b;
    return out;
  }

  /** Скорость поворота курса (рад/с, + — влево), которую требует своя линия чуть впереди на скорости v */
  private needTurn(seg: number, v: number): number {
    const tr = this.tr;
    let k = 0;
    let c = 0;
    for (let m = 0, i = seg; m < 2 + v * 0.25; m += tr.len[i], i = wrapSeg(tr, i + 1)) {
      k += this.kv[i];
      c++;
    }
    return (k / Math.max(1, c)) * Math.max(0, v);
  }

  /** Поворот под занос, в который пора входить (подскок — за ~0,35 с до начала), или −1 */
  private nextZone(seg: number, sNow: number, speed: number): number {
    const z0 = this.zoneAt[seg];
    if (z0 >= 0) {
      // уже в повороте: войти в занос, если до конца ещё далеко
      const z = this.zones[z0];
      return this.zoneUse[z0] && this.ahead(sNow, z.s1) > 12 && this.ahead(sNow, z.s1) < z.s1 - z.s0 ? z0 : -1;
    }
    const lead = 1 + speed * 0.08;
    for (let m = 0, i = seg; m <= lead; m += this.tr.len[i], i = wrapSeg(this.tr, i + 1)) {
      const z = this.zoneAt[i];
      if (z >= 0) return this.zoneUse[z] ? z : -1;
    }
    return -1;
  }
}
