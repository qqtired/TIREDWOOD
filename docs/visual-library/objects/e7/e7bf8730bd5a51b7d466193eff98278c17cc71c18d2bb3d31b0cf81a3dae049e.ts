// Инструменты музыкального автомата — всё синтезом, без файлов. Электропиано (FM), басы, пэды, аккордеон, свист,
// чиптюн, колокольчики, маримба, синт-лид — узлы WebAudio на ноту; щипковые (нейлон, электрогитара, мандолина) —
// Карплус-Стронг: буфер на ноту считается один раз (частота дискретизации подобрана под точную высоту) и кэшируется;
// ударные — буферы, посчитанные один раз на набор. Импульс реверберации — тоже сгенерированный.
// Работает и в живом AudioContext, и в OfflineAudioContext (проверка уровней песен).
import { DRUM_BASE, INSTS, type Inst } from './song.ts';
import { midiHz } from './theory.ts';

const I = (name: Inst): number => INSTS.indexOf(name);
export const V = {
  epiano: I('epiano'), bass: I('bass'), sub: I('sub'), tuba: I('tuba'), nylon: I('nylon'), guitar: I('guitar'), mando: I('mando'),
  pad: I('pad'), strings: I('strings'), accordion: I('accordion'), whistle: I('whistle'), square: I('square'), pulse: I('pulse'),
  tri: I('tri'), bell: I('bell'), marimba: I('marimba'), lead: I('lead'), boom: I('boom'), dist: I('dist'), saw: I('saw'),
} as const;

/** Детерминированный шум (одинаковые буферы при каждом рендере — уровни песен воспроизводимы) */
function noiseGen(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Фильтр с переменным состоянием (трапеции, устойчив на любой частоте): step → полоса; low и hp — рядом */
class Svf {
  private ic1 = 0;
  private ic2 = 0;
  low = 0;
  hp = 0;
  private readonly k: number;
  private readonly a1: number;
  private readonly a2: number;
  private readonly a3: number;
  constructor(freq: number, sr: number, q = 0.7) {
    const g = Math.tan((Math.PI * Math.min(freq, sr * 0.45)) / sr);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  step(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.hp = x - this.k * v1 - v2;
    return v1;
  }
}

type DrumFn = (t: number, rnd: () => number, st: DrumState) => number;
interface DrumState { ph: number; sr: number; a: Svf; b: Svf; c: Svf; hold: number; held: number }

const env = (t: number, tau: number): number => Math.exp(-t / tau);

/** Звуки ударных по наборам: [длина, функция отсчёта]. Наборы: pop, lofi, brush, chip, synth, surf, trap, break */
function drumDef(kit: number, d: number): { len: number; gain: number; fn: DrumFn; hz?: [number, number, number] } | null {
  // d: k s c h o p r t m y w
  const kick = (f0: number, f1: number, ptau: number, atau: number, click: number, drive: number): DrumFn => (t, rnd, st) => {
    const f = f1 + (f0 - f1) * env(t, ptau);
    st.ph += (2 * Math.PI * f) / st.sr;
    const body = Math.sin(st.ph) * env(t, atau);
    const c = click * rnd() * env(t, 0.0025);
    return Math.tanh(drive * (body + c)) / Math.tanh(drive);
  };
  const snare = (tone: number, ttau: number, ntau: number, mixN: number): DrumFn => (t, rnd, st) => {
    st.ph += (2 * Math.PI * tone) / st.sr;
    const body = (Math.sin(st.ph) + 0.45 * Math.sin(st.ph * 1.78)) * env(t, ttau) * (1 - mixN);
    const n = st.a.step(rnd()) * env(t, ntau) * mixN * 1.6;
    return body + n;
  };
  const hat = (tau: number): DrumFn => (t, rnd, st) => { st.a.step(rnd()); return st.a.hp * env(t, tau) * 0.9; };
  const chipNoise = (tau: number, hold: number): DrumFn => (t, rnd, st) => {
    if (st.held <= 0) { st.hold = rnd() > 0 ? 1 : -1; st.held = hold; }
    st.held--;
    return st.hold * env(t, tau) * 0.6;
  };
  switch (d) {
    case 0: // бочка
      if (kit === 7) return { len: 0.32, gain: 1, fn: kick(170, 50, 0.022, 0.12, 0.6, 2.4) };
      if (kit === 6) return { len: 0.3, gain: 0.7, fn: kick(165, 52, 0.02, 0.11, 0.55, 2) };
      if (kit === 0) return { len: 0.45, gain: 1, fn: kick(150, 48, 0.035, 0.17, 0.35, 1.6) };
      if (kit === 1) return { len: 0.4, gain: 0.9, fn: kick(115, 46, 0.04, 0.16, 0.12, 1.2) };
      if (kit === 2) return { len: 0.35, gain: 0.7, fn: kick(95, 52, 0.03, 0.13, 0.05, 1.1) };
      if (kit === 3) return { len: 0.18, gain: 0.8, fn: (t, rnd, st) => { const f = 50 + 210 * env(t, 0.018); st.ph += (2 * Math.PI * f) / st.sr; return (Math.sin(st.ph) > 0 ? 0.7 : -0.7) * env(t, 0.06); } };
      if (kit === 4) return { len: 0.7, gain: 1, fn: kick(120, 42, 0.05, 0.3, 0.25, 1.8) };
      return { len: 0.42, gain: 0.95, fn: kick(135, 55, 0.03, 0.15, 0.3, 1.5) };
    case 1: // малый барабан
      if (kit === 7) return { len: 0.3, gain: 0.95, fn: snare(200, 0.045, 0.12, 0.74), hz: [4600, 0, 0.55] };
      if (kit === 6) return { len: 0.34, gain: 0.9, fn: snare(205, 0.05, 0.16, 0.8), hz: [5200, 0, 0.5] };
      if (kit === 0) return { len: 0.3, gain: 0.85, fn: snare(185, 0.06, 0.11, 0.62), hz: [3200, 0, 0.6] };
      if (kit === 1) return { len: 0.25, gain: 0.7, fn: snare(200, 0.045, 0.08, 0.58), hz: [2000, 0, 0.6] };
      if (kit === 2) return { len: 0.3, gain: 0.5, fn: snare(210, 0.03, 0.13, 0.85), hz: [3800, 0, 0.5] };
      if (kit === 3) return { len: 0.16, gain: 0.7, fn: chipNoise(0.05, 3) };
      if (kit === 4) return { len: 0.42, gain: 0.8, fn: snare(180, 0.07, 0.2, 0.7), hz: [2600, 0, 0.5] };
      return { len: 0.32, gain: 0.85, fn: snare(220, 0.09, 0.12, 0.55), hz: [3500, 0, 0.7] };
    case 2: // хлопок: три всплеска и хвост
      return { len: 0.35, gain: kit === 4 ? 0.9 : 0.75, hz: [1300, 0, 1.4], fn: (t, rnd, st) => {
        let e = env(t, 0.09) * 0.5;
        for (const o of [0, 0.011, 0.022]) if (t >= o) e += env(t - o, 0.006);
        return st.a.step(rnd()) * e * 1.8;
      } };
    case 3: // закрытый хэт
      if (kit === 3) return { len: 0.06, gain: 0.45, fn: chipNoise(0.012, 1) };
      if (kit === 6) return { len: 0.06, gain: 0.55, fn: hat(0.011), hz: [9500, 0, 0.7] };
      return { len: 0.09, gain: kit === 1 ? 0.5 : 0.6, fn: hat(kit === 1 ? 0.016 : 0.022), hz: [kit === 1 ? 6500 : 8000, 0, 0.7] };
    case 4: // открытый хэт
      if (kit === 3) return { len: 0.25, gain: 0.35, fn: chipNoise(0.08, 1) };
      return { len: 0.45, gain: 0.45, fn: hat(0.16), hz: [7500, 0, 0.7] };
    case 5: // шейкер: мягкая атака
      return { len: 0.14, gain: 0.5, hz: [5500, 0, 1.6], fn: (t, rnd, st) => st.a.step(rnd()) * Math.min(1, t / 0.012) * env(Math.max(0, t - 0.012), 0.035) * 1.6 };
    case 6: // римшот / боковой удар
      return { len: 0.08, gain: 0.55, hz: [2500, 0, 1.2], fn: (t, rnd, st) => {
        st.ph += (2 * Math.PI * 1650) / st.sr;
        return Math.sin(st.ph) * env(t, 0.012) * 0.8 + st.a.step(rnd()) * env(t, 0.007) * 1.2;
      } };
    case 7: // том низкий
    case 8: { // том средний
      const f0 = d === 7 ? 115 : 165;
      return { len: 0.45, gain: 0.75, fn: (t, rnd, st) => {
        const f = f0 + f0 * 0.5 * env(t, 0.06);
        st.ph += (2 * Math.PI * f) / st.sr;
        return Math.sin(st.ph) * env(t, 0.2) + rnd() * env(t, 0.01) * 0.15;
      } };
    }
    case 9: // тарелка
      if (kit === 3) return { len: 0.6, gain: 0.3, fn: chipNoise(0.25, 1) };
      return { len: 1.8, gain: 0.32, hz: [6500, 0, 0.6], fn: (t, rnd, st) => {
        st.a.step(rnd());
        st.ph += (2 * Math.PI * 431) / st.sr;
        const ring = Math.sign(Math.sin(st.ph)) * Math.sign(Math.sin(st.ph * 2.37)) * Math.sign(Math.sin(st.ph * 3.61));
        st.b.step(ring);
        return (st.a.hp * 0.9 + st.b.hp * 0.25) * (env(t, 0.55) * 0.8 + env(t, 0.05) * 0.4);
      } };
    case 10: // щётка: «шшух»
      return { len: 0.32, gain: 0.45, hz: [3800, 0, 0.6], fn: (t, rnd, st) => st.a.step(rnd()) * Math.min(1, t / 0.04) * env(Math.max(0, t - 0.04), 0.09) * 1.4 };
    case 11: // треск пластинки: редкие щелчки и тихое шипение; буфер длиннее такта — его запускают раз в такт
      return { len: 3.4, gain: 0.5, hz: [3000, 0, 0.6], fn: (t, rnd, st) => {
        if (rnd() > 1 - (2 * 11) / st.sr) st.hold = (rnd() > 0 ? 1 : -1) * (0.2 + 0.8 * Math.abs(rnd())) * (rnd() > 0.8 ? 2 : 1);
        else st.hold *= 0.55;
        const click = st.a.step(st.hold) * 2.5;
        const hiss = st.b.step(rnd()) * 0.035;
        // мягкие края: стык тактов не щёлкает
        return (click + hiss) * Math.max(0, Math.min(1, t / 0.05, (3.4 - t) / 0.05));
      } };
  }
  return null;
}

export class Synth {
  readonly ctx: BaseAudioContext;
  private readonly noiseBuf: AudioBuffer;
  private readonly pulseWave: PeriodicWave;
  private readonly drums = new Map<number, AudioBuffer | null>();
  private readonly plucks = new Map<number, AudioBuffer>();
  private readonly irs = new Map<string, AudioBuffer>();
  /** Усилители гитары dist по выходам партий */
  private readonly amps = new WeakMap<AudioNode, AudioNode>();
  /** Мягкий перегруз «808»: обертоны, чтобы саб был слышен и в маленьких динамиках */
  private readonly sat: Float32Array<ArrayBuffer>;
  /** Перегруз гитары (dist): жёстче, с лёгкой несимметрией — «ламповый» призвук */
  private readonly fuzz: Float32Array<ArrayBuffer>;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, sr, sr);
    const nd = this.noiseBuf.getChannelData(0);
    const rnd = noiseGen(7);
    for (let i = 0; i < nd.length; i++) nd[i] = rnd();
    // импульс 25 %: ряд Фурье
    const H = 40;
    const re = new Float32Array(H);
    const im = new Float32Array(H);
    for (let n = 1; n < H; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
    this.pulseWave = ctx.createPeriodicWave(re, im, { disableNormalization: false });
    const sn = 1024;
    this.sat = new Float32Array(new ArrayBuffer(sn * 4));
    for (let i = 0; i < sn; i++) {
      const x = (i / (sn - 1)) * 2 - 1;
      this.sat[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
    }
    this.fuzz = new Float32Array(new ArrayBuffer(sn * 4));
    for (let i = 0; i < sn; i++) {
      const x = (i / (sn - 1)) * 2 - 1;
      this.fuzz[i] = Math.tanh(5 * x + 0.35 * x * x) / Math.tanh(5.35);
    }
  }

  /** Забыть буферы щипковых, которых нет в новой песне (память) */
  keepPlucks(keys: Set<number>): void {
    for (const k of this.plucks.keys()) if (!keys.has(k)) this.plucks.delete(k);
  }

  // ------------------------------------------------------------ узлы

  private osc(type: OscillatorType, f: number, t: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    return o;
  }

  private gain(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  /** Огибающая: атака до peak, спад к sustain·peak с tau, отпускание с rel от момента off */
  private adsr(g: GainNode, t: number, off: number, peak: number, attack: number, tau: number, sustain: number, rel: number): void {
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack);
    if (sustain < 1) p.setTargetAtTime(peak * sustain, t + attack, tau);
    p.setTargetAtTime(0, Math.max(off, t + attack), rel);
  }

  /** Сыграть ноту: голос (инструмент или ударный), момент t (время контекста), MIDI, длина (с), громкость 0…1; from — глайд из ноты */
  play(dest: AudioNode, voice: number, t: number, midi: number, dur: number, vel: number, from = 0): void {
    if (voice >= DRUM_BASE) {
      this.drum(dest, voice, t, vel);
      return;
    }
    const ctx = this.ctx;
    const f = midiHz(midi);
    const off = t + dur;
    switch (voice) {
      case V.epiano: {
        // FM: несущая и модулятор 1:1, яркость гаснет; «язычок» — короткий высокий призвук
        const car = this.osc('sine', f, t);
        const mod = this.osc('sine', f, t);
        const mg = this.gain(0);
        mg.gain.setValueAtTime(f * (0.7 + 1.5 * vel), t);
        mg.gain.setTargetAtTime(f * 0.1, t, 0.28);
        mod.connect(mg).connect(car.frequency);
        const tine = this.osc('sine', f * 4.02, t);
        const tg = this.gain(0);
        tg.gain.setValueAtTime(0.11 * vel, t);
        tg.gain.setTargetAtTime(0, t, 0.045);
        const amp = this.gain(0);
        const tau = Math.min(2.2, Math.max(0.7, 2.6 - (midi - 40) * 0.035));
        this.adsr(amp, t, off, 0.16 + 0.2 * vel, 0.004, tau, 0.0001, 0.11);
        car.connect(amp);
        tine.connect(tg).connect(amp);
        amp.connect(dest);
        const end = off + 0.6;
        for (const o of [car, mod, tine]) { o.start(t); o.stop(end); }
        return;
      }
      case V.bass: {
        const o1 = this.osc('sine', f, t);
        const o2 = this.osc('sawtooth', f, t);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.9;
        lp.frequency.setValueAtTime(500 + 900 * vel, t);
        lp.frequency.setTargetAtTime(240, t, 0.09);
        const g2 = this.gain(0.32);
        const amp = this.gain(0);
        this.adsr(amp, t, off, 0.42 + 0.25 * vel, 0.005, 0.35, 0.62, 0.045);
        o1.connect(amp);
        o2.connect(g2).connect(lp).connect(amp);
        amp.connect(dest);
        for (const o of [o1, o2]) { o.start(t); o.stop(off + 0.3); }
        return;
      }
      case V.sub: {
        const o1 = this.osc('sawtooth', f, t);
        const o2 = this.osc('sawtooth', f * 1.0046, t);
        const o3 = this.osc('sine', f / 2, t);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 3.2;
        lp.frequency.setValueAtTime(1500 + 1200 * vel, t);
        lp.frequency.setTargetAtTime(330, t, 0.11);
        const mix = this.gain(0.22);
        const amp = this.gain(0);
        this.adsr(amp, t, off, 0.5 + 0.2 * vel, 0.003, 0.3, 0.8, 0.04);
        o1.connect(mix);
        o2.connect(mix);
        mix.connect(lp).connect(amp);
        const sg = this.gain(0.55);
        o3.connect(sg).connect(amp);
        amp.connect(dest);
        for (const o of [o1, o2, o3]) { o.start(t); o.stop(off + 0.25); }
        return;
      }
      case V.tuba: {
        const o1 = this.osc('triangle', f, t);
        const o2 = this.osc('sawtooth', f, t);
        for (const o of [o1, o2]) {
          o.frequency.setValueAtTime(f * 0.985, t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
        }
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 650;
        lp.Q.value = 1.1;
        const g2 = this.gain(0.22);
        const amp = this.gain(0);
        this.adsr(amp, t, off, 0.5 + 0.25 * vel, 0.018, 0.25, 0.75, 0.05);
        o1.connect(amp);
        o2.connect(g2).connect(lp).connect(amp);
        amp.connect(dest);
        for (const o of [o1, o2]) { o.start(t); o.stop(off + 0.3); }
        return;
      }
      case V.nylon:
      case V.guitar:
      case V.mando: {
        const buf = this.pluck(voice, midi);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const amp = this.gain(0);
        const p = amp.gain;
        const peak = (voice === V.mando ? 0.32 : 0.38) * (0.45 + 0.75 * vel);
        p.setValueAtTime(peak, t);
        p.setTargetAtTime(0, off, voice === V.nylon ? 0.12 : 0.08);
        src.connect(amp).connect(dest);
        src.start(t);
        src.stop(Math.min(t + buf.duration, off + 0.6));
        return;
      }
      case V.pad:
      case V.strings: {
        const strings = voice === V.strings;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = strings ? 2600 : 1500 + 700 * vel;
        lp.Q.value = 0.5;
        const amp = this.gain(0);
        const p = amp.gain;
        const att = strings ? 0.45 : 0.35;
        const peak = 0.055 + 0.04 * vel;
        p.setValueAtTime(0, t);
        p.linearRampToValueAtTime(peak, t + Math.min(att, dur * 0.5));
        p.setTargetAtTime(0, off, strings ? 0.3 : 0.4);
        const det = strings ? [-6, 0, 6] : [-7, 7];
        const oscs: OscillatorNode[] = [];
        for (const c of det) {
          const o = this.osc('sawtooth', f, t);
          o.detune.value = c;
          o.connect(lp);
          oscs.push(o);
        }
        if (!strings) {
          const sub = this.osc('triangle', f / 2, t);
          const sg = this.gain(0.35);
          sub.connect(sg).connect(lp);
          oscs.push(sub);
        }
        lp.connect(amp).connect(dest);
        for (const o of oscs) { o.start(t); o.stop(off + 1.6); }
        return;
      }
      case V.accordion: {
        // два язычка с расстройкой (мюзет) и квадрат пониже — «меха» на шине (тремоло, форманта)
        const amp = this.gain(0);
        this.adsr(amp, t, off, 0.09 + 0.06 * vel, 0.028, 0.5, 0.88, 0.05);
        const bp = ctx.createBiquadFilter();
        bp.type = 'peaking';
        bp.frequency.value = 1250;
        bp.Q.value = 1.2;
        bp.gain.value = 5;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4200;
        const oscs = [this.osc('sawtooth', f, t), this.osc('sawtooth', f, t), this.osc('square', f, t)];
        oscs[0].detune.value = -9;
        oscs[1].detune.value = 9;
        const sq = this.gain(0.35);
        oscs[0].connect(bp);
        oscs[1].connect(bp);
        oscs[2].connect(sq).connect(bp);
        bp.connect(lp).connect(amp).connect(dest);
        for (const o of oscs) { o.start(t); o.stop(off + 0.3); }
        return;
      }
      case V.whistle: {
        const o = this.osc('sine', f * 0.975, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
        const lfo = this.osc('sine', 5.4, t);
        const depth = this.gain(0);
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.35, dur * 0.7));
        lfo.connect(depth).connect(o.frequency);
        const amp = this.gain(0);
        this.adsr(amp, t, off, 0.16 + 0.1 * vel, 0.04, 0.6, 0.85, 0.06);
        o.connect(amp).connect(dest);
        // дыхание: шум у основного тона
        const n = ctx.createBufferSource();
        n.buffer = this.noiseBuf;
        n.loop = true;
        const nb = ctx.createBiquadFilter();
        nb.type = 'bandpass';
        nb.frequency.value = f * 2;
        nb.Q.value = 3;
        const ng = this.gain(0);
        this.adsr(ng, t, off, 0.03 * vel, 0.03, 0.15, 0.4, 0.05);
        n.connect(nb).connect(ng).connect(dest);
        o.start(t);
        lfo.start(t);
        n.start(t, (midi * 0.0137) % 0.8);
        const end = off + 0.35;
        o.stop(end);
        lfo.stop(end);
        n.stop(end);
        return;
      }
      case V.square:
      case V.pulse:
      case V.tri: {
        const o = ctx.createOscillator();
        if (voice === V.pulse) o.setPeriodicWave(this.pulseWave);
        else o.type = voice === V.tri ? 'triangle' : 'square';
        o.frequency.setValueAtTime(f, t);
        if (voice !== V.tri && dur > 0.35) {
          // длинная нота — лёгкое вибрато, как в приставочной музыке
          const lfo = this.osc('sine', 6, t);
          const dg = this.gain(0);
          dg.gain.setValueAtTime(0, t);
          dg.gain.setValueAtTime(0, t + 0.16);
          dg.gain.linearRampToValueAtTime(f * 0.006, t + 0.3);
          lfo.connect(dg).connect(o.frequency);
          lfo.start(t);
          lfo.stop(off + 0.1);
        }
        const amp = this.gain(0);
        const peak = voice === V.tri ? 0.42 + 0.15 * vel : 0.12 + 0.08 * vel;
        this.adsr(amp, t, off, peak, 0.003, 0.4, voice === V.tri ? 1 : 0.75, 0.018);
        o.connect(amp).connect(dest);
        o.start(t);
        o.stop(off + 0.12);
        return;
      }
      case V.bell:
      case V.marimba: {
        const parts = voice === V.bell ? [[1, 0.9, 1], [2.756, 0.24, 0.32], [5.404, 0.07, 0.14]] : [[1, 0.38, 1], [3.93, 0.055, 0.28], [9.2, 0.018, 0.1]];
        const amp = this.gain(0.2 + 0.18 * vel);
        amp.connect(dest);
        for (const [k, tau, g] of parts) {
          const o = this.osc('sine', f * k, t);
          const e = this.gain(0);
          e.gain.setValueAtTime(0, t);
          e.gain.linearRampToValueAtTime(g, t + 0.002);
          e.gain.setTargetAtTime(0, t + 0.002, tau);
          e.gain.setTargetAtTime(0, Math.max(off, t + 0.01), 0.1);
          o.connect(e).connect(amp);
          o.start(t);
          o.stop(t + Math.min(dur + 0.6, tau * 6 + 0.05));
        }
        return;
      }
      case V.boom: {
        // «808»: синус с толчком высоты на атаке или глайдом из прошлой ноты; перегруз даёт обертоны, спад долгий
        const o = this.osc('sine', f, t);
        if (from > 0) {
          o.frequency.setValueAtTime(midiHz(from), t);
          o.frequency.setTargetAtTime(f, t + 0.01, 0.05);
        } else {
          o.frequency.setValueAtTime(f * 1.45, t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
        }
        const drive = this.gain(0.85 + 0.3 * vel);
        const sh = ctx.createWaveShaper();
        sh.curve = this.sat;
        const amp = this.gain(0);
        this.adsr(amp, t, off, 0.4 + 0.2 * vel, 0.004, 1.2, 0.0001, 0.05);
        o.connect(drive).connect(sh).connect(amp).connect(dest);
        o.start(t);
        o.stop(off + 0.35);
        return;
      }
      case V.dist: {
        // перегруженная гитара: нота — «пауэр-аккорд» (тон, квинта, октава); перегруз и «кабинет» — один на партию
        // (как один усилитель на гитару, и дешевле: узлы на ноту — только генераторы и огибающая)
        const env = this.gain(0);
        // короткая нота — «глушёная» (ладонью): гаснет быстрее
        const short = dur < 0.2;
        this.adsr(env, t, off, 0.3 + 0.2 * vel, 0.003, short ? 0.07 : 0.9, short ? 0.2 : 0.75, 0.04);
        const oscs: OscillatorNode[] = [];
        for (const [k, det, g] of [[1, -5, 1], [1.4983, 4, 0.8], [2, 2, 0.45]] as const) {
          const o = this.osc('sawtooth', f * k, t);
          o.detune.value = det;
          const og = this.gain(g);
          o.connect(og).connect(env);
          oscs.push(o);
        }
        env.connect(this.distAmp(dest));
        for (const o of oscs) { o.start(t); o.stop(off + 0.25); }
        return;
      }
      case V.saw: {
        // «суперпила»: три пилы с расстройкой, фильтр щипком (яркая атака, быстро темнеет) — арпеджио и аккорды-стабы
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 2.2;
        const bright = 900 + 5200 * vel;
        lp.frequency.setValueAtTime(bright, t);
        lp.frequency.setTargetAtTime(Math.min(bright, 650 + f * 1.5), t, dur > 0.4 ? 0.28 : 0.09);
        const mix = this.gain(0.34);
        const oscs: OscillatorNode[] = [];
        for (const det of [-13, 0, 13]) {
          const o = this.osc('sawtooth', f, t);
          o.detune.value = det;
          o.connect(mix);
          oscs.push(o);
        }
        const amp = this.gain(0);
        this.adsr(amp, t, off, 0.11 + 0.07 * vel, 0.003, 0.22, 0.4, 0.07);
        mix.connect(lp).connect(amp).connect(dest);
        for (const o of oscs) { o.start(t); o.stop(off + 0.3); }
        return;
      }
      case V.lead: {
        const o1 = this.osc('sawtooth', f, t);
        const o2 = this.osc('square', f, t);
        o2.detune.value = 7;
        const lfo = this.osc('sine', 5.2, t);
        const dg = this.gain(0);
        dg.gain.setValueAtTime(0, t);
        dg.gain.linearRampToValueAtTime(f * 0.005, t + Math.min(0.4, dur));
        lfo.connect(dg);
        dg.connect(o1.frequency);
        dg.connect(o2.frequency);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 1.4;
        lp.frequency.setValueAtTime(3600, t);
        lp.frequency.setTargetAtTime(1700, t, 0.25);
        const g2 = this.gain(0.4);
        const amp = this.gain(0);
        this.adsr(amp, t, off, 0.12 + 0.07 * vel, 0.012, 0.5, 0.8, 0.12);
        o1.connect(lp);
        o2.connect(g2).connect(lp);
        lp.connect(amp).connect(dest);
        const end = off + 0.7;
        for (const o of [o1, o2, lfo]) { o.start(t); o.stop(end); }
        return;
      }
    }
  }

  /** Усилитель перегруженной гитары: перегруз и «кабинет» (полоса 95 Гц…3,6 кГц) — один на каждый выход партии */
  private distAmp(dest: AudioNode): AudioNode {
    const had = this.amps.get(dest);
    if (had) return had;
    const ctx = this.ctx;
    const sh = ctx.createWaveShaper();
    sh.curve = this.fuzz;
    sh.oversample = '2x';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 95;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1500;
    mid.Q.value = 0.9;
    mid.gain.value = 3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    lp.Q.value = 0.9;
    sh.connect(hp).connect(mid).connect(lp).connect(this.gain(0.25)).connect(dest);
    this.amps.set(dest, sh);
    return sh;
  }

  // ------------------------------------------------------------ щипковые: Карплус-Стронг

  private pluck(voice: number, midi: number): AudioBuffer {
    const key = voice * 128 + midi;
    const cached = this.plucks.get(key);
    if (cached) return cached;
    const f = midiHz(midi);
    const kind = voice === V.nylon ? 0 : voice === V.guitar ? 1 : 2;
    const target = kind === 1 ? 26000 : 22050;
    const N = Math.max(4, Math.floor(target / f - 0.5));
    // частота дискретизации буфера — под точную высоту (петля длиной N + 0,5 отсчёта)
    const rate = Math.min(96000, Math.max(8000, f * (N + 0.5)));
    const seconds = kind === 0 ? 1.9 : kind === 1 ? 2.6 : 1.1;
    const t60 = (kind === 0 ? 2.8 : kind === 1 ? 5 : 1.5) * Math.min(1.4, Math.max(0.55, 196 / f) ** 0.35);
    const rho = Math.pow(0.001, 1 / (t60 * f));
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, len, rate);
    const out = buf.getChannelData(0);
    const line = new Float32Array(N);
    const rnd = noiseGen(midi * 31 + kind * 7 + 3);
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) raw[i] = rnd();
    // щипок: место (гребёнка убирает часть обертонов) и мягкость (нейлон — подушечкой пальца)
    const pick = Math.max(1, Math.round(N * (kind === 0 ? 0.24 : kind === 1 ? 0.13 : 0.09)));
    const soft = kind === 0 ? 0.6 : kind === 1 ? 0.25 : 0.12;
    let lp = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      const v = raw[i] - 0.85 * raw[(i - pick + N) % N];
      lp += (1 - soft) * (v - lp);
      line[i] = lp;
      mean += lp;
    }
    mean /= N;
    let peak = 0;
    for (let i = 0; i < N; i++) { line[i] -= mean; peak = Math.max(peak, Math.abs(line[i])); }
    const norm = peak > 0 ? 1 / peak : 1;
    for (let i = 0; i < N; i++) line[i] *= norm;
    let idx = 0;
    for (let n = 0; n < len; n++) {
      const next = idx + 1 === N ? 0 : idx + 1;
      out[n] = line[idx];
      line[idx] = rho * 0.5 * (line[idx] + line[next]);
      idx = next;
    }
    // без щелчков: мягкое начало и конец
    const fin = Math.floor(rate * 0.0015);
    for (let n = 0; n < fin && n < len; n++) out[n] *= n / fin;
    const fout = Math.floor(rate * 0.08);
    for (let n = 0; n < fout && n < len; n++) out[len - 1 - n] *= n / fout;
    this.plucks.set(key, buf);
    return buf;
  }

  // ------------------------------------------------------------ ударные

  private drum(dest: AudioNode, voice: number, t: number, vel: number): void {
    const buf = this.drumBuf(voice);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.gain(vel);
    src.connect(g).connect(dest);
    src.start(t);
  }

  private drumBuf(voice: number): AudioBuffer | null {
    const had = this.drums.get(voice);
    if (had !== undefined) return had;
    const kit = Math.floor((voice - DRUM_BASE) / 16);
    const d = (voice - DRUM_BASE) % 16;
    const def = drumDef(kit, d);
    if (!def) {
      this.drums.set(voice, null);
      return null;
    }
    const sr = kit === 3 ? 22050 : this.ctx.sampleRate;
    const len = Math.floor(def.len * sr);
    const buf = this.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const hz = def.hz ?? [5000, 0, 0.7];
    const st: DrumState = { ph: 0, sr, a: new Svf(hz[0], sr, hz[2]), b: new Svf(4200, sr, 0.8), c: new Svf(2000, sr, 0.7), hold: 0, held: 0 };
    const rnd = noiseGen(voice * 977 + 11);
    let peak = 0;
    for (let i = 0; i < len; i++) {
      out[i] = def.fn(i / sr, rnd, st);
      peak = Math.max(peak, Math.abs(out[i]));
    }
    const k = peak > 0 ? def.gain / peak : 1;
    const fade = Math.floor(sr * 0.01);
    for (let i = 0; i < len; i++) out[i] *= k * (i >= len - fade ? (len - 1 - i) / fade : 1);
    this.drums.set(voice, buf);
    return buf;
  }

  // ------------------------------------------------------------ реверберация

  /** Импульс «зала»: ранние отражения и хвост — шум, гаснущий за decay секунд, высокие гаснут быстрее */
  impulse(decay: number): AudioBuffer {
    const key = decay.toFixed(2);
    const had = this.irs.get(key);
    if (had) return had;
    // держим один зал — той песни, что играет (прошлый держит её свёртка, пока не отключена)
    this.irs.clear();
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * (decay + 0.1));
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const out = buf.getChannelData(ch);
      const rnd = noiseGen(101 + ch * 17);
      const pre = Math.floor(sr * 0.012);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        // высокие тают: коэффициент сглаживания растёт со временем
        const a = Math.min(0.92, 0.2 + t / (decay * 0.9));
        lp += (1 - a) * (rnd() - lp);
        out[i] = lp * Math.exp((-6.9 * t) / decay) * (t < 0.004 ? t / 0.004 : 1);
      }
      for (const [ms, g] of [[9, 0.5], [17, 0.35], [29, 0.3], [41, 0.22]] as const) {
        const i = pre + Math.floor((sr * (ms + ch * 3)) / 1000);
        if (i < len) out[i] += g * (ch ? -1 : 1);
      }
    }
    this.irs.set(key, buf);
    return buf;
  }
}
