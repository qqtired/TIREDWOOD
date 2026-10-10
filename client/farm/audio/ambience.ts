// Окружение фермы (шина «Окружение», синтез без файлов): редкие птицы — воробей, синица, певчая и изредка далёкая
// кукушка, каждый раз новой песней; лёгкий шелест листвы; далёкое море с юга (ферма на холме — накат с шипением, без
// ровного гула: ровный рокот прибоя набережной здесь звучал как сильный ветер); рядом с костром — треск, у пасеки —
// жужжание (позиционно, слышно только вблизи). Чистая логика (песни птиц, треск, интервалы) — без WebAudio, проверяется
// в node (test/farm-audio.test.ts); узлы — в FarmAmbience.
import { FARM_LAYOUT } from '../../../shared/farmlayout.ts';
import { loopNoise } from '../../ambience.ts';

type Rnd = () => number;

/** Паузы между событиями, с (от…до, случайно) */
export const BIRD_GAP: readonly [number, number] = [3, 9];
export const RUSTLE_GAP: readonly [number, number] = [8, 18];
export const WAVE_GAP: readonly [number, number] = [6.5, 13];
/** Кукушка — не чаще раза в столько секунд и не раньше CUCKOO_FIRST от входа */
export const CUCKOO_GAP = 110;
export const CUCKOO_FIRST = 45;
/** Громкость на пике (до шины «Окружение»): нота птицы, шелест, волна, костёр и пчёлы рядом */
const BIRD_PEAK = 0.12;
const RUSTLE_PEAK = 0.03;
const WAVE_PEAK = 0.085;
const FIRE_GAIN = 0.55;
const BEES_GAIN = 0.5;
/** Костёр и пасека: слышно не дальше (м); голос строится чуть раньше и снимается чуть позже — без дребезга на границе */
const FIRE_FAR = 13;
const BEES_FAR = 10;

const FIRE = FARM_LAYOUT.objects.find((o) => o.id === 'campfire')!;
const HIVES = (FARM_LAYOUT.nooks.find((n) => n.id === 'apiary')!.items as readonly { kind: string; x: number; z: number }[]).filter((i) => i.kind === 'hiveDecor');
const APIARY = { x: HIVES.reduce((a, h) => a + h.x, 0) / HIVES.length, z: HIVES.reduce((a, h) => a + h.z, 0) / HIVES.length };
const SOUTH_EDGE = FARM_LAYOUT.bounds.maxZ;
const NORTH_EDGE = FARM_LAYOUT.bounds.minZ;

const between = (r: Rnd, [a, b]: readonly [number, number]): number => a + r() * (b - a);

/** Сколько ещё звучит (по временам конца); отзвучавшие убираются из списка */
function sounding(ends: number[], now: number): number {
  for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= now) ends.splice(i, 1);
  return ends.length;
}

// ------------------------------------------------------------ птицы

export type BirdKind = 'sparrow' | 'tit' | 'warbler' | 'cuckoo';

/** Нота птицы: когда (с от начала), длина, высота в начале и в конце (Гц), громкость 0…1 */
export interface BirdNote {
  at: number;
  dur: number;
  f0: number;
  f1: number;
  gain: number;
}

/** Кто запоёт: кукушка — только если давно не куковала (cuckooOk) и редко */
export function pickBird(r: Rnd, cuckooOk: boolean): BirdKind {
  if (cuckooOk && r() < 0.18) return 'cuckoo';
  const x = r();
  return x < 0.38 ? 'sparrow' : x < 0.62 ? 'tit' : 'warbler';
}

/** Песня птицы: каждый раз своя (число нот, высоты, паузы) — повтора на слух нет */
export function birdCall(kind: BirdKind, r: Rnd = Math.random): BirdNote[] {
  const out: BirdNote[] = [];
  let at = 0;
  if (kind === 'sparrow') {
    // «чик-чирик»: 2–5 коротких чириканий вниз, иногда в конце — трель
    const base = 3600 + r() * 1400;
    const n = 2 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const dur = 0.045 + r() * 0.05;
      const f = base * (0.92 + r() * 0.16);
      out.push({ at, dur, f0: f * (1.08 + r() * 0.18), f1: f * (0.72 + r() * 0.12), gain: 0.7 + r() * 0.3 });
      at += dur + 0.06 + r() * 0.09;
    }
    if (r() < 0.3) {
      const m = 5 + Math.floor(r() * 5);
      for (let i = 0; i < m; i++) {
        out.push({ at, dur: 0.022, f0: base * (i % 2 ? 1.1 : 1.25), f1: base * (i % 2 ? 0.95 : 1.05), gain: 0.55 });
        at += 0.032;
      }
    }
  } else if (kind === 'tit') {
    // синица: «ци-вить» — высокая и низкая, 2–4 раза
    const hi = 5000 + r() * 1100;
    const lo = hi * (0.6 + r() * 0.08);
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const k = 0.97 + r() * 0.06;
      out.push({ at, dur: 0.07, f0: hi * k * 1.03, f1: hi * k * 0.96, gain: 0.8 });
      at += 0.07 + 0.05 + r() * 0.03;
      out.push({ at, dur: 0.1 + r() * 0.04, f0: lo * k, f1: lo * k * 0.98, gain: 0.95 });
      at += 0.14 + 0.1 + r() * 0.08;
    }
  } else if (kind === 'warbler') {
    // певчая: 5–11 нот из своего лада, с подъездами и короткими трелями; громче к середине
    const set = Array.from({ length: 4 + Math.floor(r() * 2) }, () => 2200 + r() * 2400);
    const n = 5 + Math.floor(r() * 7);
    for (let i = 0; i < n; i++) {
      const f = set[Math.floor(r() * set.length)];
      const shape = 0.65 + 0.35 * Math.sin((Math.PI * (i + 0.5)) / n);
      if (r() < 0.22) {
        for (let j = 0; j < 3 + Math.floor(r() * 3); j++) {
          out.push({ at, dur: 0.028, f0: f * 1.08, f1: f * 0.94, gain: shape * 0.7 });
          at += 0.036;
        }
      } else {
        const dur = 0.06 + r() * 0.11;
        out.push({ at, dur, f0: f, f1: f * (0.84 + r() * 0.36), gain: shape });
        at += dur;
      }
      at += 0.025 + r() * 0.07;
    }
  } else {
    // кукушка издалека: «ку-ку» вниз на терцию, 2–4 раза, мягко
    const f = 640 + r() * 90;
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      out.push({ at, dur: 0.2, f0: f, f1: f * 0.97, gain: 0.9 });
      out.push({ at: at + 0.32, dur: 0.32, f0: f * 0.82, f1: f * 0.79, gain: 0.8 });
      at += 0.32 + 0.32 + 0.5 + r() * 0.2;
    }
  }
  return out;
}

/** Сколько длится песня, с */
export function callLength(c: readonly BirdNote[]): number {
  return c.reduce((a, n) => Math.max(a, n.at + n.dur), 0);
}

// ------------------------------------------------------------ треск костра

/**
 * Петля мелкого треска (len отсчётов): щелчки — короткие всплески шума с быстрым спадом, в среднем rate в секунду,
 * в основном тихие и изредка громче. Щелчок у конца переходит в начало — петля без стыка. Громкие «стрельбы» —
 * отдельно и случайно (FarmAmbience), чтобы в петле не было заметного повторяющегося щелчка.
 */
export function crackleLoop(len: number, sr: number, rate: number, r: Rnd = Math.random): Float32Array<ArrayBuffer> {
  const out = new Float32Array(len);
  const n = Math.round((len / sr) * rate);
  for (let k = 0; k < n; k++) {
    const at = Math.floor(r() * len);
    const amp = 0.08 + 0.55 * r() ** 3;
    const tau = sr * (0.0003 + r() * 0.0011);
    const m = Math.ceil(tau * 5);
    for (let i = 0; i < m; i++) out[(at + i) % len] += (r() * 2 - 1) * amp * Math.exp(-i / tau);
  }
  return out;
}

// ------------------------------------------------------------ узлы

/** Голос рядом с местом (костёр, пасека): живёт, пока слушатель близко; снимается плавно */
interface Near {
  out: GainNode;
  srcs: AudioScheduledSourceNode[];
  /** Костёр: громкость пламени «дышит» — сюда новая цель раз в долю секунды */
  breath?: GainNode;
}

export class FarmAmbience {
  readonly out: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly r: Rnd;
  private readonly white: AudioBuffer;
  private readonly brown: AudioBuffer;
  private crackles: AudioBuffer[] | null = null;
  private nextBird: number;
  private nextRustle: number;
  private nextWave: number;
  private nextPop = 0;
  private nextBreath = 0;
  private lastCuckoo: number;
  private time = 0;
  /** Часы контекста на прошлом вызове: паузы считаются по звуку, а не по кадрам (на слабой машине кадры редкие) */
  private last = NaN;
  /** Когда кончаются уже звучащие песни и волны (по часам контекста): не больше двух сразу */
  private readonly birdsEnd: number[] = [];
  private readonly wavesEnd: number[] = [];
  private fire: Near | null = null;
  private bees: Near | null = null;

  constructor(ctx: BaseAudioContext, dest: AudioNode, r: Rnd = Math.random) {
    this.ctx = ctx;
    this.r = r;
    this.out = ctx.createGain();
    this.out.connect(dest);
    const sr = ctx.sampleRate;
    const mk = (seconds: number, brown: boolean): AudioBuffer => {
      const data = loopNoise(Math.round(sr * seconds), Math.round(sr * 0.5), brown, r);
      const b = ctx.createBuffer(1, data.length, sr);
      b.getChannelData(0).set(data);
      return b;
    };
    this.white = mk(5, false);
    this.brown = mk(11, true);
    this.nextBird = 1.5 + r() * 3;
    this.nextRustle = between(r, RUSTLE_GAP) * 0.6;
    this.nextWave = 1 + r() * 3;
    this.lastCuckoo = CUCKOO_FIRST - CUCKOO_GAP;
  }

  /**
   * Раз в кадр (паузы считаются по часам звука): x, z — слушатель (камера), rz — z правой оси камеры (море на юге:
   * справа или слева на слух), near — строить ли голоса костра и пасеки (в офлайн-превью — нет). Здесь только решения
   * «когда»: звуки ставятся в расписание контекста; в кадре ничего не выделяется, пока нет события.
   */
  update(x: number, z: number, rz: number, near = true): void {
    const r = this.r;
    const now = this.ctx.currentTime;
    const dt = Number.isNaN(this.last) ? 0 : Math.min(1, Math.max(0, now - this.last));
    this.last = now;
    this.time += dt;
    this.nextBird -= dt;
    this.nextRustle -= dt;
    this.nextWave -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = between(r, BIRD_GAP);
      if (sounding(this.birdsEnd, now) < 2) {
        const kind = pickBird(r, this.time - this.lastCuckoo >= CUCKOO_GAP);
        if (kind === 'cuckoo') this.lastCuckoo = this.time;
        const pan = r() * 1.7 - 0.85;
        const end = this.bird(kind, now + 0.03, pan, 0.3 + r() * 0.7);
        this.birdsEnd.push(end);
        // иногда отвечает соседка того же вида с другой стороны
        if (kind !== 'cuckoo' && r() < 0.28) this.birdsEnd.push(this.bird(kind, end + 0.5 + r() * 1.3, -pan * (0.6 + r() * 0.4), 0.25 + r() * 0.5));
      }
    }
    if (this.nextRustle <= 0) {
      this.nextRustle = between(r, RUSTLE_GAP);
      this.rustle(now + 0.03);
    }
    if (this.nextWave <= 0) {
      this.nextWave = between(r, WAVE_GAP);
      if (sounding(this.wavesEnd, now) < 2) {
        // море на юге: справа или слева на слух — по оси камеры; у обрыва ближе и громче
        const south = Math.min(1, Math.max(0, (z - NORTH_EDGE) / (SOUTH_EDGE - NORTH_EDGE)));
        this.wavesEnd.push(this.wave(now + 0.03, 0.62 * rz, 0.55 + 0.45 * south));
      }
    }
    this.nearby(dt, near ? Math.hypot(x - FIRE.x, z - FIRE.z) : Infinity, near ? Math.hypot(x - APIARY.x, z - APIARY.z) : Infinity);
  }

  /** Для проверок: звучат ли рядом костёр и пасека */
  debug(): { fire: boolean; bees: boolean } {
    return { fire: !!this.fire, bees: !!this.bees };
  }

  /** Плавно снять голоса костра и пасеки (ушли с фермы) */
  release(): void {
    this.fire = this.drop(this.fire);
    this.bees = this.drop(this.bees);
  }

  // ------------------------------------------------------------ разовые

  private bird(kind: BirdKind, t: number, pan: number, near: number): number {
    const ctx = this.ctx;
    const notes = birdCall(kind, this.r);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // дальше — глуше и тише; кукушка — всегда издалека
    lp.frequency.value = kind === 'cuckoo' ? 1800 : 4500 + 7000 * near;
    const g = ctx.createGain();
    g.gain.value = BIRD_PEAK * (kind === 'cuckoo' ? 0.45 : 0.35 + 0.65 * near);
    p.connect(lp).connect(g).connect(this.out);
    const soft = kind === 'cuckoo';
    for (const n of notes) {
      const a = t + n.at;
      const o = ctx.createOscillator();
      o.type = kind === 'sparrow' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(n.f0, a);
      o.frequency.exponentialRampToValueAtTime(n.f1, a + n.dur);
      const e = ctx.createGain();
      const att = soft ? 0.04 : Math.min(0.008, n.dur * 0.2);
      e.gain.setValueAtTime(0, a);
      e.gain.linearRampToValueAtTime(n.gain, a + att);
      e.gain.setTargetAtTime(0, a + n.dur * (soft ? 0.6 : 0.45), n.dur * (soft ? 0.18 : 0.2));
      o.connect(e).connect(p);
      o.start(a);
      o.stop(a + n.dur * 1.6 + 0.02);
    }
    return t + callLength(notes) + 0.1;
  }

  /** Шелест листвы: короткий высокий шорох с «хрустом» — громкость скачет каждые 35–70 мс */
  private rustle(t: number): void {
    const ctx = this.ctx;
    const r = this.r;
    const dur = 1.2 + r() * 2;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000 + r() * 2600;
    bp.Q.value = 0.55;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const crinkle = ctx.createGain();
    crinkle.gain.setValueAtTime(0.5, t);
    for (let s = 0.04; s < dur; s += 0.035 + r() * 0.035) crinkle.gain.setValueAtTime(0.3 + r() * 0.7, t + s);
    const env = ctx.createGain();
    const peak = RUSTLE_PEAK * (0.6 + r() * 0.4);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
    env.gain.setTargetAtTime(0, t + dur * 0.45, dur * 0.18);
    const p = ctx.createStereoPanner();
    p.pan.value = r() * 1.4 - 0.7;
    src.connect(bp).connect(hp).connect(crinkle).connect(env).connect(p).connect(this.out);
    src.start(t, r() * 4);
    src.stop(t + dur + 0.6);
  }

  /** Далёкая волна: мягкий накат (низ), на гребне — шипение пены, которое уходит вниз и затихает */
  private wave(t: number, pan: number, k: number): number {
    const ctx = this.ctx;
    const r = this.r;
    const rise = 1.3 + r() * 1.1;
    const fall = 1.1 + r() * 0.6;
    const end = t + rise + fall * 6;
    const peak = WAVE_PEAK * k * (0.7 + r() * 0.3);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out);
    // накат
    const body = ctx.createBufferSource();
    body.buffer = this.brown;
    body.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520 + r() * 260;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(peak, t + rise);
    bg.gain.setTargetAtTime(0, t + rise, fall);
    body.connect(lp).connect(bg).connect(p);
    body.start(t, r() * 10);
    body.stop(end);
    // пена: шипение уходит вниз по частоте
    const foam = ctx.createBufferSource();
    foam.buffer = this.white;
    foam.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.6;
    bp.frequency.setValueAtTime(1500 + r() * 500, t + rise - 0.2);
    bp.frequency.exponentialRampToValueAtTime(650, t + rise + fall * 3);
    const fg = ctx.createGain();
    const f0 = t + rise - 0.25;
    fg.gain.setValueAtTime(0, f0);
    fg.gain.linearRampToValueAtTime(peak * 0.45, f0 + 0.3);
    fg.gain.setTargetAtTime(0, f0 + 0.3, fall * 0.8);
    foam.connect(bp).connect(fg).connect(p);
    foam.start(f0, r() * 4);
    foam.stop(end);
    return end;
  }

  // ------------------------------------------------------------ рядом: костёр и пасека

  private nearby(dt: number, dFire: number, dBees: number): void {
    const ctx = this.ctx;
    const r = this.r;
    if (!this.fire && dFire < FIRE_FAR + 2) this.fire = this.makeFire();
    else if (this.fire && dFire > FIRE_FAR + 4) this.fire = this.drop(this.fire);
    if (!this.bees && dBees < BEES_FAR + 2) this.bees = this.makeBees();
    else if (this.bees && dBees > BEES_FAR + 4) this.bees = this.drop(this.bees);
    const fire = this.fire;
    if (!fire) return;
    const now = ctx.currentTime;
    this.nextBreath -= dt;
    if (this.nextBreath <= 0 && fire.breath) {
      this.nextBreath = 0.25 + r() * 0.35;
      fire.breath.gain.setTargetAtTime(0.5 + r() * 0.5, now, 0.2);
    }
    this.nextPop -= dt;
    if (this.nextPop <= 0) {
      this.nextPop = 0.7 + r() * 2.6;
      // «стрельнуло» полено: короткий звонкий всплеск, каждый раз другой
      const t = now + 0.02;
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900 + r() * 1900;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      const len = 0.012 + r() * 0.025;
      g.gain.setValueAtTime(0.12 + r() * 0.28, t);
      g.gain.setTargetAtTime(0, t + 0.002, len / 3);
      src.connect(bp).connect(g).connect(fire.out);
      src.start(t, r() * 4);
      src.stop(t + len * 2 + 0.05);
    }
  }

  private panner(x: number, y: number, z: number, far: number): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    // линейная модель: у самого места — полностью, к far — до нуля (дальше не слышно совсем)
    p.distanceModel = 'linear';
    p.refDistance = 1.2;
    p.maxDistance = far;
    p.rolloffFactor = 1;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else p.setPosition(x, y, z);
    return p;
  }

  private nearOut(x: number, y: number, z: number, far: number, gain: number): GainNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 1.2);
    g.connect(this.panner(x, y, z, far)).connect(this.out);
    return g;
  }

  private makeFire(): Near {
    const ctx = this.ctx;
    const out = this.nearOut(FIRE.x, 0.5, FIRE.z, FIRE_FAR, FIRE_GAIN);
    const srcs: AudioScheduledSourceNode[] = [];
    // пламя: тихий низкий «фыр», громкость дышит
    const breath = ctx.createGain();
    breath.gain.value = 0.7;
    const bed = ctx.createBufferSource();
    bed.buffer = this.brown;
    bed.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    const bg = ctx.createGain();
    bg.gain.value = 0.16;
    bed.connect(bp).connect(bg).connect(breath).connect(out);
    bed.start(0, this.r() * 10);
    srcs.push(bed);
    // мелкий треск: две петли разной длины — вместе они не повторяются минутами
    if (!this.crackles) {
      const sr = ctx.sampleRate;
      this.crackles = [[6.13, 22], [8.71, 9]].map(([sec, rate]) => {
        const data = crackleLoop(Math.round(sr * sec), sr, rate, this.r);
        const b = ctx.createBuffer(1, data.length, sr);
        b.getChannelData(0).set(data);
        return b;
      });
    }
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;
    const cg = ctx.createGain();
    cg.gain.value = 0.32;
    hp.connect(cg).connect(out);
    for (const b of this.crackles) {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.connect(hp);
      s.start(0, this.r() * b.duration);
      srcs.push(s);
    }
    return { out, srcs, breath };
  }

  private makeBees(): Near {
    const ctx = this.ctx;
    const r = this.r;
    const out = this.nearOut(APIARY.x, 0.8, APIARY.z, BEES_FAR, BEES_GAIN);
    const srcs: AudioScheduledSourceNode[] = [];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1150;
    lp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 160;
    // рой «дышит»: громкость медленно плывёт
    const swell = ctx.createGain();
    swell.gain.value = 0.75;
    const sl = ctx.createOscillator();
    sl.frequency.value = 0.21 + r() * 0.12;
    const sd = ctx.createGain();
    sd.gain.value = 0.25;
    sl.connect(sd).connect(swell.gain);
    lp.connect(hp).connect(swell).connect(out);
    srcs.push(sl);
    // три пчелы: пила с дрожью и медленным уходом высоты, у каждой своя
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 195 + r() * 60;
      const vib = ctx.createOscillator();
      vib.frequency.value = 4 + r() * 3;
      const vd = ctx.createGain();
      vd.gain.value = 4 + r() * 3;
      const drift = ctx.createOscillator();
      drift.frequency.value = 0.13 + r() * 0.17;
      const dd = ctx.createGain();
      dd.gain.value = 8 + r() * 6;
      vib.connect(vd).connect(o.frequency);
      drift.connect(dd).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.045;
      o.connect(g).connect(lp);
      srcs.push(o, vib, drift);
    }
    for (const s of srcs) s.start();
    return { out, srcs };
  }

  private drop(v: Near | null): null {
    if (!v) return null;
    const t = this.ctx.currentTime;
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setValueAtTime(v.out.gain.value, t);
    v.out.gain.linearRampToValueAtTime(0, t + 0.9);
    for (const s of v.srcs) s.stop(t + 1);
    return null;
  }
}
