// Проигрыватель песен автомата: ноты ставятся в расписание WebAudio чуть вперёд (около 0,15 с) по таймеру — точно
// в такт, даже если кадры игры неровные. Песню можно начать с любого места (вошёл посреди — слышишь то же, что все).
// Цепочка песни: инструменты → «сухо» + реверберация (+ эхо солистам) → громкость песни → общая шина проигрывателя →
// мягкий ограничитель → анализатор (эквалайзер на автомате) → «расстояние» (приглушение, панорама, громкость) → выход.
// Во время игры ничего не выделяется на кадр: ноты — плоские массивы, полосы эквалайзера — в готовый массив.
import { DRUM_BASE, INSTS, KITS, type CompiledSong, type Inst } from './song.ts';
import { Synth, V } from './synth.ts';

/** Без реверберации: бас мутит «зал» */
const BASSES: ReadonlySet<number> = new Set([V.bass, V.sub, V.tuba, V.boom]);
/** Тянущиеся голоса: вошли посреди такой ноты — дотягиваем её остаток */
const SUSTAIN: ReadonlySet<number> = new Set([V.pad, V.strings, V.accordion, V.whistle, V.lead, V.sub, V.bass, V.tuba, V.tri, V.square, V.pulse, V.boom, V.dist, V.saw]);
/** Кому эхо, если песня не сказала */
const ECHO_DEFAULT: readonly Inst[] = ['lead', 'whistle', 'bell', 'pulse'];

const TICK_MS = 25;

/**
 * Бесконечный поток (радио на лодке, client/boat/radiostream.ts): отрезки одной длины по номеру, все — в одной «студии»
 * (зал, эхо, микс). Номер отрезка — место в потоке, делённое на длину: кто угодно может войти в любое место.
 */
export interface MusicFeed {
  /** Длина отрезка, с */
  readonly length: number;
  /** Образец для цепочки: def — зал, эхо, хорус, микс; voice — все голоса, какие могут прозвучать в потоке */
  readonly studio: CompiledSong;
  block(k: number): CompiledSong;
}

interface Run {
  song: CompiledSong;
  /** Поток (радио): следующий отрезок — feed.block(k + 1); null — одна песня */
  feed: MusicFeed | null;
  k: number;
  /** Время контекста, соответствующее началу песни */
  t0: number;
  /** Следующая нота к постановке */
  idx: number;
  /** Куда играет голос (номер голоса → узел) */
  dest: Array<AudioNode | null>;
  fade: GainNode;
  nodes: AudioNode[];
  /** Генераторы хоруса: остановить, когда песня снята */
  lfos: OscillatorNode[];
}

/** Первая нота не раньше t */
function lowerBound(a: Float64Array, n: number, t: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface PlayerOptions {
  /** Живой звук: таймер, эквалайзер, «расстояние»; офлайн — только песня (проверка уровней) */
  live: boolean;
  /** Мягкий ограничитель на выходе (офлайн-замер выключает — видно честный пик) */
  limiter?: boolean;
}

export class MusicPlayer {
  readonly ctx: BaseAudioContext;
  readonly synth: Synth;
  /** На сколько секунд вперёд ставить ноты */
  lookahead: number;
  private readonly bus: GainNode;
  private readonly level: GainNode;
  private readonly lp: BiquadFilterNode | null = null;
  private readonly pan: StereoPannerNode | null = null;
  readonly analyser: AnalyserNode | null = null;
  private readonly freq: Uint8Array<ArrayBuffer> | null = null;
  private run: Run | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly live: boolean;
  private spaceGain = -1;
  private spacePan = 9;
  private spaceLp = -1;

  constructor(ctx: BaseAudioContext, dest: AudioNode, opts: PlayerOptions) {
    this.ctx = ctx;
    this.live = opts.live;
    this.synth = new Synth(ctx);
    this.lookahead = opts.live ? 0.16 : 0.75;
    this.bus = ctx.createGain();
    let tail: AudioNode = this.bus;
    if (opts.limiter ?? true) {
      // мягкий ограничитель: до 0,7 — как есть, выше — плавно к 1 (вход ×0,5: кривая покрывает ±2)
      this.bus.gain.value = 0.5;
      const sh = ctx.createWaveShaper();
      const n = 2048;
      const curve = new Float32Array(new ArrayBuffer(n * 4));
      for (let i = 0; i < n; i++) {
        const x = ((i / (n - 1)) * 2 - 1) * 2;
        const a = Math.abs(x);
        const y = a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3);
        curve[i] = Math.sign(x) * y;
      }
      sh.curve = curve;
      this.bus.connect(sh);
      tail = sh;
    }
    if (opts.live) {
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.72;
      this.analyser = an;
      this.freq = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 20000;
      lp.Q.value = 0.5;
      const pan = ctx.createStereoPanner();
      this.lp = lp;
      this.pan = pan;
      tail.connect(an);
      an.connect(lp);
      lp.connect(pan);
      tail = pan;
    }
    this.level = ctx.createGain();
    tail.connect(this.level);
    this.level.connect(dest);
  }

  /** Что играет (null — ничего) */
  get current(): CompiledSong | null {
    return this.run?.song ?? null;
  }

  /** Место в песне, с (до начала — отрицательное); NaN — ничего не играет */
  get time(): number {
    return this.run ? this.ctx.currentTime - this.run.t0 : NaN;
  }

  /**
   * Играть песню с места offset (с; отрицательное — начнётся через −offset) в момент when (время контекста).
   * Прошлая песня гаснет.
   */
  start(song: CompiledSong, offset: number, when = this.ctx.currentTime + 0.05): void {
    this.stop(0.25);
    const run = this.build(song, when - offset);
    this.run = run;
    this.begin(run, song, offset, when);
  }

  /** Поток, что играет (null — песня или ничего) */
  get feed(): MusicFeed | null {
    return this.run?.feed ?? null;
  }

  /** Место в потоке, с; NaN — поток не играет */
  get streamPos(): number {
    const run = this.run;
    return run?.feed ? run.k * run.feed.length + (this.ctx.currentTime - run.t0) : NaN;
  }

  /** Играть поток с места pos (с от начала потока) в момент when; прошлое гаснет */
  startFeed(feed: MusicFeed, pos: number, when = this.ctx.currentTime + 0.05): void {
    this.stop(0.25);
    const k = Math.max(0, Math.floor(pos / feed.length));
    const offset = pos - k * feed.length;
    const song = feed.block(k);
    const run = this.build(feed.studio, when - offset);
    run.song = song;
    run.feed = feed;
    run.k = k;
    this.run = run;
    this.begin(run, song, offset, when);
  }

  private begin(run: Run, song: CompiledSong, offset: number, when: number): void {
    const from = Math.max(0, offset);
    run.idx = lowerBound(song.t, song.n, from);
    if (from > 0.3) {
      // вошли посреди песни: дотянуть длинные ноты, начатые раньше (пэды, бас, мелодия)
      for (let j = lowerBound(song.t, song.n, from - song.maxDur); j < run.idx; j++) {
        const v = song.voice[j];
        const left = song.t[j] + song.dur[j] - from;
        const dest = run.dest[v];
        if (dest && left > 0.3 && SUSTAIN.has(v)) this.synth.play(dest, v, when, song.midi[j], left, song.vel[j] * 0.85);
      }
    }
    const keep = new Set<number>();
    for (let i = 0; i < song.n; i++) if (song.voice[i] === V.nylon || song.voice[i] === V.guitar || song.voice[i] === V.mando) keep.add(song.voice[i] * 128 + song.midi[i]);
    this.synth.keepPlucks(keep);
    this.pump();
    if (this.live && !this.timer) this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  /** Погасить песню за fade секунд */
  stop(fade = 0.35): void {
    const run = this.run;
    if (!run) return;
    this.run = null;
    const t = this.ctx.currentTime;
    run.fade.gain.cancelScheduledValues(t);
    run.fade.gain.setValueAtTime(run.fade.gain.value, t);
    run.fade.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 4));
    const drop = (): void => {
      for (const o of run.lfos) o.stop();
      for (const n of run.nodes) n.disconnect();
    };
    if (this.live) setTimeout(drop, (fade + 0.4) * 1000);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Поставить в расписание ноты на lookahead вперёд; песня кончилась — убрать её */
  pump(): void {
    const run = this.run;
    if (!run) return;
    const now = this.ctx.currentTime;
    const late = now - 0.025;
    for (;;) {
      const song = run.song;
      const horizon = now + this.lookahead - run.t0;
      while (run.idx < song.n && song.t[run.idx] < horizon) {
        const i = run.idx++;
        const at = run.t0 + song.t[i];
        // кадр завис дольше запаса — опоздавшие ноты пропускаем, а не играем пачкой
        if (at < late) continue;
        const v = song.voice[i];
        const dest = run.dest[v];
        if (dest) this.synth.play(dest, v, at < now ? now : at, song.midi[i], song.dur[i], song.vel[i], song.from[i]);
      }
      if (run.idx < song.n) return;
      if (!run.feed) {
        if (now - run.t0 > song.total + 0.3) this.stop(0.05);
        return;
      }
      // поток: следующий отрезок, как только его начало попало в окно постановки
      if (song.length >= horizon) return;
      run.t0 += song.length;
      run.song = run.feed.block(++run.k);
      run.idx = 0;
    }
  }

  /** «Расстояние»: громкость 0…1, панорама −1…1, срез высоких (Гц; далеко — глуше). Плавно, без лишних вызовов. */
  setSpace(gain: number, pan: number, lowpass: number): void {
    const t = this.ctx.currentTime;
    if (Math.abs(gain - this.spaceGain) > 0.004) {
      this.spaceGain = gain;
      this.level.gain.setTargetAtTime(gain, t, 0.12);
    }
    if (this.pan && Math.abs(pan - this.spacePan) > 0.01) {
      this.spacePan = pan;
      this.pan.pan.setTargetAtTime(pan, t, 0.12);
    }
    if (this.lp && Math.abs(lowpass - this.spaceLp) > 20) {
      this.spaceLp = lowpass;
      this.lp.frequency.setTargetAtTime(lowpass, t, 0.15);
    }
  }

  /** Полосы эквалайзера 0…1 в готовый массив (низкие → высокие) */
  bands(out: Float32Array): void {
    const an = this.analyser;
    const f = this.freq;
    if (!an || !f || !this.run) {
      out.fill(0);
      return;
    }
    an.getByteFrequencyData(f);
    const n = out.length;
    const bins = f.length;
    for (let b = 0; b < n; b++) {
      // границы полос по логарифму: от ~180 Гц до ~11 кГц
      const lo = Math.max(1, Math.floor(Math.pow(bins * 0.45, b / n)));
      const hi = Math.max(lo + 1, Math.floor(Math.pow(bins * 0.45, (b + 1) / n)));
      let s = 0;
      for (let i = lo; i < hi; i++) s += f[i];
      out[b] = s / ((hi - lo) * 255);
    }
  }

  dispose(): void {
    this.stop(0.05);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ------------------------------------------------------------ цепочка песни

  private build(song: CompiledSong, t0: number): Run {
    const ctx = this.ctx;
    const def = song.def;
    const nodes: AudioNode[] = [];
    const g = (v: number): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      nodes.push(n);
      return n;
    };
    const fade = g(1);
    fade.connect(this.bus);
    const out = g(def.gain);
    out.connect(fade);
    // реверберация
    const conv = ctx.createConvolver();
    conv.buffer = this.synth.impulse(def.reverb.decay);
    nodes.push(conv);
    const revIn = g(1);
    const revOut = g(def.reverb.wet);
    revIn.connect(conv);
    conv.connect(revOut);
    revOut.connect(out);
    // эхо солистам
    let echoIn: GainNode | null = null;
    const echoOn = new Set(def.echo?.on ?? ECHO_DEFAULT);
    if (def.echo) {
      const d = ctx.createDelay(3);
      d.delayTime.value = Math.min(2.9, def.echo.beats * song.beat);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2800;
      nodes.push(d, lp);
      echoIn = g(1);
      const fb = g(def.echo.feedback);
      const wet = g(def.echo.wet);
      echoIn.connect(d);
      d.connect(lp);
      lp.connect(fb);
      fb.connect(d);
      lp.connect(wet);
      wet.connect(out);
      wet.connect(revIn);
    }
    // хорус: две задержки, их время плывёт от медленных генераторов в противофазе, разведены влево и вправо
    let chorusIn: GainNode | null = null;
    const chorusOn = new Set(def.chorus?.on ?? []);
    const lfos: OscillatorNode[] = [];
    if (def.chorus) {
      const ch = def.chorus;
      chorusIn = g(1);
      const wet = g(ch.wet);
      wet.connect(out);
      wet.connect(revIn);
      for (const side of [-1, 1]) {
        const d = ctx.createDelay(0.1);
        d.delayTime.value = ch.ms / 1000;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = ch.rate * (side < 0 ? 1 : 1.13);
        const depth = g((ch.depth / 1000) * side);
        const pan = ctx.createStereoPanner();
        pan.pan.value = 0.7 * side;
        nodes.push(d, lfo, pan);
        lfo.connect(depth);
        depth.connect(d.delayTime);
        chorusIn.connect(d);
        d.connect(pan);
        pan.connect(wet);
        lfo.start();
        lfos.push(lfo);
      }
    }
    const dest: Array<AudioNode | null> = new Array(256).fill(null);
    const kits = new Map<number, GainNode>();
    const drumRev = g(0.3);
    drumRev.connect(revIn);
    const used = new Set(song.voice);
    for (const v of used) {
      if (v >= DRUM_BASE) {
        const kit = (v - DRUM_BASE) >> 4;
        let kg = kits.get(kit);
        if (!kg) {
          kg = g(def.mix[KITS[kit]] ?? 0.8);
          kg.connect(out);
          kg.connect(drumRev);
          kits.set(kit, kg);
        }
        dest[v] = kg;
        continue;
      }
      const inst = INSTS[v];
      const ig = g(def.mix[inst] ?? 0.8);
      ig.connect(out);
      if (!BASSES.has(v)) ig.connect(revIn);
      if (echoIn && echoOn.has(inst)) ig.connect(echoIn);
      if (chorusIn && chorusOn.has(inst)) ig.connect(chorusIn);
      dest[v] = ig;
    }
    return { song, feed: null, k: 0, t0, idx: 0, dest, fade, nodes, lfos };
  }
}
