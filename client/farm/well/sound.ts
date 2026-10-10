// Звук мини-игры «Набери лейку» (design-v11 §7.3): скрип ворота на старте, одна петля «льётся вода» (громкость — по
// толщине струи, тон растёт с заполнением, как у наливаемой бутылки), «буль» при попадании, брызги мимо не чаще
// 4 в секунду, колокольчик на 100 % и короткий аккорд итога. Всё синтезируется на лету, файлов нет.
// Свой AudioContext на всю страницу (один на все попытки), свой мягкий ограничитель, одноразовых голосов не больше
// MAX_VOICES сразу — повторы и наложения не перегружают мастер.

const MAX_VOICES = 6;
/** Не чаще: «буль» 0,15 с, брызги 0,25 с (≤ 4 в секунду) */
const PLOP_GAP = 0.15;
const SPLASH_GAP = 0.25;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let live = 0;

type Volume = () => number;

function audio(volume: Volume): { c: AudioContext; out: GainNode } | null {
  const v = volume();
  if (!(v > 0)) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    master = ctx.createGain();
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -12;
    lim.knee.value = 8;
    lim.ratio.value = 12;
    lim.attack.value = 0.003;
    lim.release.value = 0.15;
    master.connect(lim).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.35; // чуть тёмный шум: вода, а не шипение
      d[i] = lp * 1.6;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  master!.gain.setTargetAtTime(Math.min(1, v) * 0.55, ctx.currentTime, 0.03);
  return { c: ctx, out: master! };
}

export class WellSfx {
  private readonly volume: Volume;
  private loop: { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode; osc: OscillatorNode; og: GainNode } | null = null;
  private lastPlop = -9;
  private lastSplash = -9;
  private lastSet = 0;
  /** Для проверок: сколько одноразовых голосов звучит сейчас и сколько запущено всего */
  static get liveVoices(): number { return live; }
  static started = 0;

  constructor(volume: Volume) {
    this.volume = volume;
  }

  /** Одноразовый голос: узлы живут, пока играют; сверх MAX_VOICES — молчим (кроме важных) */
  private shot(important: boolean, build: (c: AudioContext, out: GainNode, t: number) => AudioScheduledSourceNode | null): void {
    const a = audio(this.volume);
    if (!a || live >= MAX_VOICES + (important ? 3 : 0)) return;
    const end = build(a.c, a.out, a.c.currentTime);
    if (!end) return;
    live++;
    WellSfx.started++;
    end.onended = () => { live = Math.max(0, live - 1); };
  }

  private tone(c: AudioContext, out: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine', delay = 0): OscillatorNode {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t + delay);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(peak, t + delay + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(g).connect(out);
    o.start(t + delay);
    o.stop(t + delay + dur + 0.02);
    return o;
  }

  private burst(c: AudioContext, out: AudioNode, t: number, dur: number, f: number, q: number, peak: number, delay = 0): AudioBufferSourceNode {
    const s = c.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(peak, t + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    s.connect(bp).connect(g).connect(out);
    s.start(t + delay, Math.random());
    s.stop(t + delay + dur + 0.02);
    return s;
  }

  /** Окно открылось: скрип ворота и тихая петля воды (пока без струи) */
  begin(): void {
    this.end();
    const a = audio(this.volume);
    if (!a) return;
    const { c, out } = a;
    // скрип: пила вниз через узкий фильтр и пять коротких «зубцов»
    this.shot(true, (cc, o, t) => {
      const saw = cc.createOscillator();
      const bp = cc.createBiquadFilter();
      const g = cc.createGain();
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(150, t);
      saw.frequency.linearRampToValueAtTime(82, t + 0.55);
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 5;
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 5; i++) {
        g.gain.linearRampToValueAtTime(0.11, t + 0.04 + i * 0.1);
        g.gain.linearRampToValueAtTime(0.02, t + 0.09 + i * 0.1);
      }
      g.gain.linearRampToValueAtTime(0.0001, t + 0.62);
      saw.connect(bp).connect(g).connect(o);
      saw.start(t);
      saw.stop(t + 0.66);
      return saw;
    });
    // петля воды: один источник на всю попытку
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(out);
    src.start(0, Math.random());
    // «бутылочный» тон: растёт с заполнением, слышен только при попадании в горлышко
    const osc = c.createOscillator();
    const og = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 240;
    og.gain.value = 0;
    osc.connect(og).connect(out);
    osc.start();
    this.loop = { src, bp, g, osc, og };
    this.lastSet = 0;
  }

  /** Каждый кадр: tilt 0–1 (толщина струи), hit — льётся в горлышко, level 0–1 — сколько в лейке */
  pour(tilt: number, hit: boolean, level: number): void {
    const l = this.loop;
    if (!l || !ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastSet < 0.04) return;
    this.lastSet = now;
    const th = tilt > 0.05 ? tilt : 0;
    l.g.gain.setTargetAtTime(th * (hit ? 0.2 : 0.11), now, 0.05);
    l.bp.frequency.setTargetAtTime(hit ? 520 + level * 1700 : 420 + th * 260, now, 0.06);
    l.osc.frequency.setTargetAtTime(230 + level * 620, now, 0.06);
    l.og.gain.setTargetAtTime(hit ? 0.028 * th : 0, now, 0.05);
  }

  /** Струя только что попала в горлышко: короткий «буль» */
  plop(): void {
    const now = ctx?.currentTime ?? 0;
    if (now - this.lastPlop < PLOP_GAP) return;
    this.lastPlop = now;
    this.shot(false, (c, o, t) => {
      this.burst(c, o, t, 0.08, 900, 1.2, 0.05);
      return this.tone(c, o, t, 420, 190, 0.11, 0.1);
    });
  }

  /** Брызги мимо — не чаще 4 в секунду */
  splash(): void {
    const now = ctx?.currentTime ?? 0;
    if (now - this.lastSplash < SPLASH_GAP) return;
    this.lastSplash = now;
    this.shot(false, (c, o, t) => this.burst(c, o, t, 0.12, 1700 + Math.random() * 900, 1.4, 0.07));
  }

  /** 100 %: «бульк» и тёплый колокольчик */
  full(): void {
    this.shot(true, (c, o, t) => {
      this.tone(c, o, t, 520, 160, 0.16, 0.12);
      for (const [f, d, p] of [[880, 0.06, 0.1], [1320, 0.06, 0.05], [1760, 0.08, 0.035]] as const) this.tone(c, o, t, f, f, 1.1, p, 'sine', d);
      return this.tone(c, o, t, 2420, 2420, 0.5, 0.012, 'sine', 0.06);
    });
  }

  /** Итог: короткий аккорд, светлее при хорошей доле */
  chord(share: number): void {
    const notes = share >= 0.7 ? [523.25, 659.25, 783.99] : share >= 0.3 ? [440, 554.37, 659.25] : [329.63, 392];
    this.shot(true, (c, o, t) => {
      const voices = notes.map((f, i) => this.tone(c, o, t, f, f, 0.5, 0.06, 'triangle', 0.05 + i * 0.07));
      return voices[voices.length - 1];
    });
  }

  /** Окно закрылось: петля стихает за 0,15 с и отключается */
  end(): void {
    const l = this.loop;
    this.loop = null;
    if (!l || !ctx) return;
    const t = ctx.currentTime;
    l.g.gain.cancelScheduledValues(t);
    l.og.gain.cancelScheduledValues(t);
    l.g.gain.setTargetAtTime(0, t, 0.04);
    l.og.gain.setTargetAtTime(0, t, 0.04);
    l.src.stop(t + 0.3);
    l.osc.stop(t + 0.3);
    l.src.onended = () => { l.src.disconnect(); l.bp.disconnect(); l.g.disconnect(); };
    l.osc.onended = () => { l.osc.disconnect(); l.og.disconnect(); };
  }
}
