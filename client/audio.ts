// Звук синтезируется на лету (WebAudio) — ни одного файла. Выстрелы и шаги других
// игроков — объёмные (HRTF), чтобы на слух понимать, откуда стреляют. Дождь и гром — weathersound.ts.
import { DEFAULTS } from './settings.ts';
import { compressorMakeup, crowdDuck, type Voice, VoicePool, voicePrio, type VoiceStats } from './voices.ts';
import { RainVoice, thunderSound } from './weathersound.ts';

/** Ограничитель на выходе: после мягкого компрессора сумма не выше этого уровня (дБ полной шкалы) */
const LIMIT_DB = -2;

type Wave = OscillatorType;
type V3 = [number, number, number];
export type SoundPos = V3 | null;
export type LobbyEventSound = 'siren' | 'thunder' | 'wave' | 'success' | 'horn' | 'cannon' | 'splash' | 'victory' | 'loss' | 'mop';
/** Ползунки меню «Звук»: пример звука шины, когда ползунок отпустили */
export type MixPreview = 'music' | 'amb' | 'sfx' | 'ui';

/** Мотор карта: пила и квадрат через фильтр, «тарахтение» — модуляция громкости, гул — шум; визг шин — отдельно */
interface EngineVoice {
  o1: OscillatorNode;
  o2: OscillatorNode;
  lfo: OscillatorNode;
  lp: BiquadFilterNode;
  out: GainNode;
  skid: GainNode;
  pan: PannerNode | null;
  srcs: AudioScheduledSourceNode[];
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ui!: GainNode;
  private amb!: GainNode;
  /** Музыка: общий регулятор (ползунок «Музыка»), вход прочей музыки (его приглушает автомат) и вход автомата */
  private musicOut!: GainNode;
  private musicIn!: GainNode;
  private jukeIn!: GainNode;
  private noiseBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;
  private volume = 0.7;
  /** Доли эффектов, окружения, интерфейса и музыки от общей громкости (меню → Звук) и «на улице ли» (в подвале прибоя не слышно) */
  private sfxMix = 1;
  private ambMix = 1;
  private uiMix = 1;
  private musicMix = DEFAULTS.musicVolume;
  /** Прочая музыка, пока играет автомат: доля громкости (1 — как есть) */
  private duck = 1;
  private outdoor = 1;
  private nextGull = 8;
  private nextHorn = 50;
  /** Дождь: голос дождя (создаётся с первым дождём) и его сила 0…1 */
  private rainVoice: RainVoice | null = null;
  /** До какого времени звучит мелодия у статуи (пока играет — заново не начинается) */
  private respectEnd = 0;
  private rainLevel = 0;
  private started = false;
  private readonly engines = new Map<number, EngineVoice>();
  /** Голоса: сколько звучит и кому место, когда звуков слишком много (толпа в «Крепости») — client/voices.ts */
  private readonly pool = new VoicePool();
  private readonly voiceOf = new WeakMap<AudioNode, Voice>();
  /** Сюда «играют» несыгранные звуки: никуда не подключён */
  private mute!: GainNode;
  /** Эффекты под толпу (crowdDuck) — отдельно от ползунка */
  private sfxDuck!: GainNode;
  private crowd = 1;
  /** Ограничитель после компрессора и возврат его автоподъёма: ниже порога громкость прежняя */
  private limiter!: DynamicsCompressorNode;
  private limTrim!: GainNode;
  /** Где слушатель — для важности звуков */
  private lx = 0;
  private ly = 0;
  private lz = 0;
  /** Проверки: пики суммы до компрессора и на выходе */
  private meters: { pre: AnalyserNode; post: AnalyserNode; buf: Float32Array<ArrayBuffer>; preMax: number; postMax: number } | null = null;

  /** Браузер разрешает звук только после жеста пользователя. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      // мягкий лимитер, чтобы залп не хрипел
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      // а сумма толпы всё равно может уйти за 0 дБ — ограничитель после компрессора держит выход ниже LIMIT_DB
      this.limiter = ctx.createDynamicsCompressor();
      this.limTrim = ctx.createGain();
      this.setLimiter(true);
      this.master.connect(comp).connect(this.limiter).connect(this.limTrim).connect(ctx.destination);
      this.mute = ctx.createGain();
      this.sfxDuck = ctx.createGain();
      this.sfx = ctx.createGain();
      this.ui = ctx.createGain();
      this.amb = ctx.createGain();
      this.sfx.gain.value = this.sfxMix;
      this.ui.gain.value = this.uiMix;
      this.amb.gain.value = 0.55 * this.outdoor * this.ambMix;
      this.sfx.connect(this.sfxDuck).connect(this.master);
      this.ui.connect(this.master);
      this.amb.connect(this.master);
      this.musicOut = ctx.createGain();
      this.musicOut.gain.value = this.musicMix;
      this.musicOut.connect(this.master);
      this.musicIn = ctx.createGain();
      this.musicIn.gain.value = this.duck;
      this.musicIn.connect(this.musicOut);
      this.jukeIn = ctx.createGain();
      this.jukeIn.connect(this.musicOut);
      this.noiseBuf = this.makeNoise(false);
      this.brownBuf = this.makeNoise(true);
      const l = ctx.listener;
      if (l.forwardX) {
        l.forwardX.value = 0;
        l.forwardY.value = 0;
        l.forwardZ.value = -1;
        l.upX.value = 0;
        l.upY.value = 1;
        l.upZ.value = 0;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startAmbience();
    }
  }

  private setLimiter(on: boolean): void {
    const l = this.limiter;
    const thr = on ? LIMIT_DB : 0;
    const ratio = on ? 20 : 1;
    l.threshold.value = thr;
    l.knee.value = 0;
    l.ratio.value = ratio;
    l.attack.value = 0.001;
    l.release.value = 0.1;
    this.limTrim.gain.value = 1 / compressorMakeup(thr, 0, ratio);
  }

  /** Тревога или сигнал интерфейса: не чаще раза в gap секунд на тип, одинаковые склеиваются (false — не играть) */
  once(key: string, gap: number): boolean {
    return this.pool.once(key, gap, performance.now() / 1000);
  }

  /**
   * Проверки и разработка: сколько звуков звучит (максимумы с последнего сброса), сколько не сыграно, пики суммы до
   * компрессора и на выходе (meter — включить измерители). legacy — как до ограничений: всё играет, без ограничителя
   * и приглушения (сравнить «до» и «после»). null — звук не разрешён.
   */
  voiceStats(o: { reset?: boolean; legacy?: boolean; meter?: boolean } = {}): (VoiceStats & { preDb: number; postDb: number; crowd: number; legacy: boolean }) | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (o.legacy !== undefined && o.legacy !== this.pool.off) {
      this.pool.off = o.legacy;
      this.setLimiter(!o.legacy);
    }
    if (o.meter && !this.meters) {
      const mk = (src: AudioNode): AnalyserNode => {
        const a = ctx.createAnalyser();
        a.fftSize = 4096;
        src.connect(a);
        return a;
      };
      this.meters = { pre: mk(this.master), post: mk(this.limTrim), buf: new Float32Array(4096), preMax: 0, postMax: 0 };
    }
    if (o.reset) {
      this.pool.resetStats(ctx.currentTime);
      if (this.meters) this.meters.preMax = this.meters.postMax = 0;
    }
    const db = (x: number): number => Math.round((x > 0 ? 20 * Math.log10(x) : -120) * 10) / 10;
    return { ...this.pool.count(ctx.currentTime), preDb: db(this.meters?.preMax ?? 0), postDb: db(this.meters?.postMax ?? 0), crowd: Math.round(this.crowd * 100) / 100, legacy: this.pool.off };
  }

  /** Каждый кадр: эффекты чуть тише, когда звуков в мире много; измерители пиков (если включены) */
  private crowdTick(): void {
    const ctx = this.ctx!;
    const s = this.pool.count(ctx.currentTime);
    const k = this.pool.off ? 1 : crowdDuck(s.world);
    if (Math.abs(k - this.crowd) > 0.01) {
      this.sfxDuck.gain.setTargetAtTime(k, ctx.currentTime, k < this.crowd ? 0.08 : 0.6);
      this.crowd = k;
    }
    const m = this.meters;
    if (!m) return;
    const peak = (a: AnalyserNode): number => {
      a.getFloatTimeDomainData(m.buf);
      let p = 0;
      for (const x of m.buf) p = Math.max(p, Math.abs(x));
      return p;
    };
    m.preMax = Math.max(m.preMax, peak(m.pre));
    m.postMax = Math.max(m.postMax, peak(m.post));
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /**
   * Громкость эффектов, окружения, интерфейса и музыки — доли 0…1 от общей (ползунки меню «Звук»). Без интерфейса —
   * как эффекты, без музыки — прежняя.
   */
  setMix(effects: number, ambience: number, ui = effects, music = this.musicMix): void {
    this.sfxMix = effects;
    this.ambMix = ambience;
    this.uiMix = ui;
    this.musicMix = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(effects, t, 0.05);
    this.ui.gain.setTargetAtTime(ui, t, 0.05);
    this.amb.gain.setTargetAtTime(0.55 * this.outdoor * ambience, t, 0.05);
    this.musicOut.gain.setTargetAtTime(music, t, 0.05);
  }

  /** Доля громкости музыки (ползунок «Музыка»): 0 — автомату незачем синтезировать */
  get musicLevel(): number {
    return this.musicMix * this.volume;
  }

  /**
   * Шина «Музыка» для прочей музыки (баян на баркасе и т. п.): общий ползунок «Музыка», и её приглушает автомат на
   * площади (duckMusic). null — звук ещё не разрешён.
   */
  get music(): GainNode | null {
    return this.ctx ? this.musicIn : null;
  }

  /** Для музыкального автомата (client/music): контекст и вход шины «Музыка» мимо приглушения; null — звук не разрешён */
  get jukeKit(): { ctx: AudioContext; out: GainNode } | null {
    return this.ok ? { ctx: this.ctx!, out: this.jukeIn } : null;
  }

  /** Приглушить прочую музыку, пока играет автомат: k — доля громкости 0…1 (1 — как есть), плавно. */
  duckMusic(k: number): void {
    const v = Math.min(1, Math.max(0, Number.isFinite(k) ? k : 1));
    if (Math.abs(v - this.duck) < 0.01) return;
    this.duck = v;
    if (this.ctx) this.musicIn.gain.setTargetAtTime(v, this.ctx.currentTime, 0.35);
  }

  /** Отпустили ползунок в меню: короткий пример его звука — музыка — фраза, окружение — волна, эффекты — щелчок, интерфейс — «дзынь». */
  preview(kind: MixPreview): void {
    if (!this.ok) {
      // звук только что разрешили этим же жестом — сыграем, когда контекст проснётся
      if (this.ctx?.state === 'suspended') void this.ctx.resume().then(() => { if (this.ok) this.preview(kind); });
      return;
    }
    if (kind === 'amb') {
      // волна: накат и шипение пены
      this.noise(this.amb, 1.5, 'lowpass', 420, 1500, 0.7, 0.5, 0, 0.45, true);
      this.noise(this.amb, 1.1, 'bandpass', 2600, 1300, 0.8, 0.07, 0.5, 0.25);
    } else if (kind === 'sfx') {
      // щелчок: сухой «ток» и короткий хлопок
      this.noise(this.sfx, 0.035, 'bandpass', 2400, 1600, 1.2, 0.45);
      this.tone(this.sfx, 520, 260, 0.05, 'triangle', 0.22);
    } else if (kind === 'ui') {
      this.tone(this.ui, 1568, 1568, 0.35, 'sine', 0.13);
      this.tone(this.ui, 2349, 2349, 0.28, 'sine', 0.06, 0.02);
    } else {
      // фраза электропиано и бас: до мажор, вверх и обратно (через вход автомата — ползунок «Музыка»)
      const d = this.jukeIn;
      const notes: ReadonlyArray<readonly [number, number]> = [[523.25, 0], [659.25, 0.16], [783.99, 0.32], [987.77, 0.48], [880, 0.72]];
      for (const [f, at] of notes) {
        this.tone(d, f, f, 0.9, 'sine', 0.13, at, 0.006);
        this.tone(d, f * 2, f * 2, 0.25, 'sine', 0.025, at, 0.004);
      }
      this.tone(d, 130.81, 130.81, 1.1, 'triangle', 0.2, 0, 0.01);
      this.tone(d, 174.61, 174.61, 0.8, 'triangle', 0.18, 0.72, 0.01);
    }
  }

  /** Под землёй (подвал «Fight Club») прибоя и дождя не слышно: k — от 0 (внизу) до 1 (на улице). */
  setOutdoor(k: number): void {
    this.outdoor = k;
    if (this.ctx) this.amb.gain.setTargetAtTime(0.55 * k * this.ambMix, this.ctx.currentTime, 0.3);
  }

  /**
   * Для своих звуков сцены (client/fight/sfx.ts): контекст, шины и шумы; null — звук ещё не разрешён.
   * sfx — эффекты, amb — окружение (ветер, море, толпа), ui — интерфейс, music — прочая музыка (её приглушает автомат).
   */
  get kit(): { ctx: AudioContext; sfx: GainNode; amb: GainNode; ui: GainNode; music: GainNode; noise: AudioBuffer; brown: AudioBuffer } | null {
    return this.ok ? { ctx: this.ctx!, sfx: this.sfx, amb: this.amb, ui: this.ui, music: this.musicIn, noise: this.noiseBuf, brown: this.brownBuf } : null;
  }

  private makeNoise(brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }

  /** Слушатель = камера. */
  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.lx = x;
    this.ly = y;
    this.lz = z;
    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setTargetAtTime(x, t, 0.01);
      l.positionY.setTargetAtTime(y, t, 0.01);
      l.positionZ.setTargetAtTime(z, t, 0.01);
      l.forwardX.setTargetAtTime(fx, t, 0.01);
      l.forwardY.setTargetAtTime(fy, t, 0.01);
      l.forwardZ.setTargetAtTime(fz, t, 0.01);
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  // ------------------------------------------------------------ кирпичики

  /**
   * Вход звука. ref — до какого расстояния звук не тише (салют слышно издалека); key — один и тот же звук (не больше
   * KEY_MAX за KEY_WINDOW). Звуков в мире слишком много — тихий и дальний не играет (вернёт mute) или вытесняет самый
   * слабый, если сам заметно громче.
   */
  private out(pos: [number, number, number] | null, bus: GainNode, muffle = 0, ref = 3, key = ''): AudioNode {
    const ctx = this.ctx!;
    const dist = pos ? Math.hypot(pos[0] - this.lx, pos[1] - this.ly, pos[2] - this.lz) : 0;
    const v = this.pool.admit(key, pos ? voicePrio(dist, ref) : 1, pos !== null, ctx.currentTime);
    if (!v) return this.mute;
    const g = ctx.createGain();
    this.voiceOf.set(g, v);
    v.stop = () => {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      setTimeout(() => g.disconnect(), 80);
    };
    if (!pos) {
      g.connect(bus);
      return g;
    }
    const p = ctx.createPanner();
    // в толпе дальние — простая панорама вместо HRTF (она дорогая): звуковой поток не захлёбывается
    p.panningModel = dist > 25 && this.pool.stats.world > 12 ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.15;
    p.maxDistance = 120;
    if (p.positionX) {
      p.positionX.value = pos[0];
      p.positionY.value = pos[1];
      p.positionZ.value = pos[2];
    } else {
      p.setPosition(pos[0], pos[1], pos[2]);
    }
    if (muffle > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 12000 - muffle * 10000;
      lp.connect(p);
      p.connect(bus);
      g.connect(lp);
      return g;
    }
    p.connect(bus);
    g.connect(p);
    return g;
  }

  /** Голос звучит до end (по часам контекста) — для счёта одновременных */
  private hold(dest: AudioNode, end: number): void {
    const v = this.voiceOf.get(dest);
    if (v && end > v.end) v.end = end;
  }

  private tone(dest: AudioNode, f0: number, f1: number, dur: number, type: Wave, gain: number, when = 0, attack = 0.004): void {
    if (dest === this.mute) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    this.hold(dest, t + dur + 0.02);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dest: AudioNode, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, when = 0, attack = 0.002, brown = false): void {
    if (dest === this.mute) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    this.hold(dest, t + dur + 0.02);
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  private get ok(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  // ------------------------------------------------------------ оружие

  /** Хлопок маркера: пневматический «пфф-ток». pos = null — свой выстрел. */
  shot(pos: [number, number, number] | null, dist = 0): void {
    if (!this.ok) return;
    const muffle = Math.min(0.8, dist / 70);
    const d = this.out(pos, this.sfx, muffle, 3, 'shot');
    const k = 0.94 + Math.random() * 0.12;
    const g = pos ? 0.9 : 0.55;
    this.noise(d, 0.05, 'bandpass', 2600 * k, 1400 * k, 0.9, 0.7 * g);
    this.tone(d, 210 * k, 85 * k, 0.07, 'sine', 0.55 * g);
    this.tone(d, 900 * k, 500 * k, 0.025, 'triangle', 0.18 * g);
    this.noise(d, 0.11, 'highpass', 5200, 3800, 0.6, 0.12 * g, 0.012);
  }

  /** Выстрел AWP: сухой щелчок, тяжёлый удар и эхо от складов; свой — ещё лязг затвора. pos = null — свой. */
  awpShot(pos: V3 | null, dist = 0): void {
    if (!this.ok) return;
    // слышно на весь причал: глушится слабее маркера
    const d = this.out(pos, this.sfx, Math.min(0.55, dist / 120), 9);
    const g = pos ? 1 : 0.8;
    this.noise(d, 0.035, 'highpass', 4200, 2600, 0.7, 0.9 * g);
    this.noise(d, 0.09, 'bandpass', 1800, 700, 0.8, 0.8 * g, 0.004);
    this.tone(d, 150, 38, 0.42, 'sine', 0.95 * g);
    this.tone(d, 420, 90, 0.12, 'triangle', 0.35 * g);
    this.noise(d, 0.55, 'lowpass', 1100, 140, 0.6, 0.45 * g, 0.01, 0.01, true);
    this.noise(d, 0.4, 'lowpass', 900, 200, 0.6, 0.16 * g, 0.28, 0.02, true);
    this.noise(d, 0.35, 'lowpass', 700, 180, 0.6, 0.08 * g, 0.55, 0.02, true);
    if (pos) return;
    // затвор: назад и вперёд
    this.noise(this.sfx, 0.03, 'bandpass', 3200, 2400, 4, 0.22, 0.55);
    this.tone(this.sfx, 900, 600, 0.03, 'square', 0.05, 0.56);
    this.noise(this.sfx, 0.035, 'bandpass', 2600, 3400, 4, 0.25, 0.8);
    this.tone(this.sfx, 700, 1000, 0.03, 'square', 0.05, 0.81);
  }

  /** Подобрали AWP: лязг затвора и короткий подъём из двух нот. pos = null — сам. */
  awpTake(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, pos ? this.sfx : this.ui, 0, 6);
    this.noise(d, 0.03, 'bandpass', 3000, 2400, 4, 0.3);
    this.tone(d, 880, 600, 0.03, 'square', 0.06);
    this.noise(d, 0.035, 'bandpass', 2600, 3300, 4, 0.3, 0.18);
    this.tone(d, 660, 660, 0.14, 'triangle', 0.16, 0.28);
    this.tone(d, 990, 990, 0.24, 'triangle', 0.14, 0.38);
  }

  /** AWP снова лежит на кресте: тихий звон. */
  awpBack(pos: V3): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 10);
    this.tone(d, 1320, 1320, 0.35, 'sine', 0.12);
    this.tone(d, 1760, 1760, 0.4, 'sine', 0.08, 0.08);
  }

  /** Шлепок краски о стену/пол. */
  splat(pos: [number, number, number], dist: number): void {
    if (!this.ok || dist > 45) return;
    const d = this.out(pos, this.sfx, Math.min(0.7, dist / 50), 3, 'splat');
    const k = 0.9 + Math.random() * 0.2;
    this.noise(d, 0.07, 'lowpass', 1600 * k, 500, 0.8, 0.5);
    this.tone(d, 160 * k, 70, 0.06, 'sine', 0.3);
  }

  /** Попадание по врагу: чёткий «тик», в голову — звонкий «динь». */
  hitmarker(head: boolean): void {
    if (!this.ok || !this.once(head ? 'hitH' : 'hit', 0.03)) return;
    const d = this.ui;
    if (head) {
      this.tone(d, 1850, 1850, 0.32, 'sine', 0.28);
      this.tone(d, 2790, 2790, 0.22, 'sine', 0.14);
      this.tone(d, 4150, 4150, 0.12, 'sine', 0.07);
    } else {
      this.tone(d, 2300, 1900, 0.035, 'triangle', 0.3);
      this.noise(d, 0.02, 'highpass', 6000, 6000, 0.7, 0.18);
    }
  }

  /** Сбил: «чпок» и маленький аккорд. */
  kill(head: boolean): void {
    if (!this.ok || !this.once('kill', 0.08)) return;
    const d = this.ui;
    this.tone(d, 700, 180, 0.09, 'sine', 0.45);
    this.noise(d, 0.06, 'lowpass', 2500, 600, 0.7, 0.3);
    const base = head ? 784 : 659;
    this.tone(d, base, base, 0.16, 'triangle', 0.16, 0.06);
    this.tone(d, base * 1.26, base * 1.26, 0.2, 'triangle', 0.14, 0.12);
    this.tone(d, base * 1.5, base * 1.5, 0.3, 'triangle', 0.12, 0.18);
  }

  /** В нас попали: мокрый шлепок + «уф». */
  hurt(head: boolean): void {
    if (!this.ok) return;
    const d = this.sfx;
    this.noise(d, 0.09, 'lowpass', 1400, 300, 0.9, 0.7);
    this.tone(d, head ? 240 : 190, head ? 120 : 100, 0.12, 'sine', 0.5);
  }

  /** Мы лопнули. */
  death(): void {
    if (!this.ok) return;
    const d = this.sfx;
    this.tone(d, 520, 60, 0.35, 'sine', 0.55);
    this.noise(d, 0.3, 'lowpass', 3000, 200, 0.7, 0.55);
    this.tone(d, 330, 330, 0.25, 'triangle', 0.1, 0.25);
    this.tone(d, 262, 262, 0.4, 'triangle', 0.1, 0.45);
  }

  /** Чужая желейка лопнула рядом. */
  popAt(pos: [number, number, number], dist: number): void {
    if (!this.ok || dist > 60) return;
    const d = this.out(pos, this.sfx, 0, 3, 'pop');
    this.tone(d, 480, 90, 0.18, 'sine', 0.5);
    this.noise(d, 0.16, 'lowpass', 2400, 300, 0.8, 0.45);
  }

  reload(): void {
    if (!this.ok) return;
    const d = this.sfx;
    this.tone(d, 420, 300, 0.05, 'square', 0.06);
    // шарики сыплются в бункер
    for (let i = 0; i < 16; i++) {
      const t = 0.22 + i * 0.045 + Math.random() * 0.02;
      this.noise(d, 0.025, 'bandpass', 3000 + Math.random() * 2500, 2500, 3, 0.1 + Math.random() * 0.08, t);
    }
    this.tone(d, 300, 520, 0.06, 'square', 0.05, 1.18);
  }

  dry(): void {
    if (!this.ok) return;
    this.tone(this.sfx, 1400, 900, 0.03, 'square', 0.08);
  }

  // ------------------------------------------------------------ движение

  jump(): void {
    if (!this.ok) return;
    this.tone(this.sfx, 260, 520, 0.09, 'sine', 0.16);
  }

  land(power: number): void {
    if (!this.ok || power < 3) return;
    const g = Math.min(0.6, power * 0.035);
    this.noise(this.sfx, 0.1, 'lowpass', 900, 200, 0.8, g, 0, 0.003, true);
    this.tone(this.sfx, 120, 60, 0.09, 'sine', g * 0.8);
  }

  trampoline(pos: [number, number, number] | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx);
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.28);
    // «пружинное» дрожание
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 30;
    lfo.connect(lfoG).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(d);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.5);
    lfo.stop(t + 0.5);
  }

  dash(): void {
    if (!this.ok) return;
    this.noise(this.sfx, 0.26, 'bandpass', 500, 2600, 1.4, 0.45, 0, 0.02);
  }

  /** Мягкий «чвак» шага желейки. */
  step(pos: [number, number, number] | null, dist = 0): void {
    if (!this.ok || dist > 28) return;
    const d = this.out(pos, this.sfx, 0, 3, 'step');
    const k = 0.85 + Math.random() * 0.3;
    const g = pos ? 0.5 : 0.09;
    this.noise(d, 0.06, 'lowpass', 700 * k, 250, 1.2, g, 0, 0.004, true);
    this.tone(d, 150 * k, 90, 0.05, 'sine', g * 0.5);
  }

  splash(pos: [number, number, number] | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx);
    this.noise(d, 0.5, 'lowpass', 2600, 300, 0.6, 0.7, 0, 0.005);
    for (let i = 0; i < 6; i++) this.tone(d, 300 + Math.random() * 500, 700 + Math.random() * 600, 0.05, 'sine', 0.12, 0.08 + i * 0.07);
  }

  jam(pos: [number, number, number] | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx);
    for (let i = 0; i < 3; i++) this.tone(d, 240 + i * 30, 160, 0.09, 'sine', 0.35, i * 0.11);
    this.tone(d, 1047, 1047, 0.25, 'triangle', 0.12, 0.34);
    this.tone(d, 1319, 1319, 0.35, 'triangle', 0.1, 0.42);
  }

  // ------------------------------------------------------------ интерфейс и раунд

  chat(): void {
    if (!this.ok) return;
    this.tone(this.ui, 880, 1100, 0.06, 'sine', 0.08);
  }

  lever(): void {
    if (!this.ok) return;
    this.noise(this.ui, 0.12, 'bandpass', 800, 300, 2, 0.35);
    this.tone(this.ui, 140, 70, 0.14, 'square', 0.1, 0.1);
  }

  /** Трещотка крутящихся барабанов. */
  reelTick(): void {
    if (!this.ok) return;
    this.tone(this.ui, 1700 + Math.random() * 300, 1200, 0.018, 'square', 0.035);
  }

  reelStop(i: number): void {
    if (!this.ok) return;
    this.tone(this.ui, 420 + i * 90, 300, 0.08, 'square', 0.1);
    this.noise(this.ui, 0.05, 'lowpass', 1500, 500, 1, 0.2);
  }

  slotWin(jackpot: boolean): void {
    if (!this.ok) return;
    const notes = jackpot ? [523, 659, 784, 1047, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((f, i) => this.tone(this.ui, f, f, 0.22, 'square', 0.07, i * (jackpot ? 0.09 : 0.1)));
    if (jackpot) for (let i = 0; i < 18; i++) this.tone(this.ui, 2000 + Math.random() * 2000, 1500, 0.04, 'sine', 0.05, 0.4 + i * 0.05);
  }

  // ------------------------------------------------------------ автоматы набережной
  // pos — передняя панель автомата; null — свой автомат: без затухания по расстоянию

  /** Рычаг дёрнули: лязг, защёлка и разгон мотора барабанов. */
  slotSpinStart(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx);
    const g = pos ? 1 : 0.7;
    this.noise(d, 0.12, 'bandpass', 900, 300, 2, 0.4 * g);
    this.tone(d, 150, 70, 0.16, 'square', 0.12 * g, 0.08);
    this.noise(d, 0.65, 'bandpass', 240, 900, 3, 0.1 * g, 0.12, 0.25);
  }

  /** Трещотка крутящихся барабанов. */
  reelTickAt(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx);
    this.tone(d, 1700 + Math.random() * 300, 1200, 0.018, 'square', pos ? 0.09 : 0.04);
  }

  /** Барабан встал: щелчок и глухой стук. */
  reelStopAt(i: number, pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx);
    this.tone(d, 420 + i * 90, 300, 0.08, 'square', 0.11);
    this.noise(d, 0.06, 'lowpass', 1600, 500, 1, 0.24);
    this.tone(d, 95, 60, 0.12, 'sine', 0.22);
  }

  /** Выигрыш: весёлая трель, big — длиннее и выше. */
  /**
   * «Press F to pay respects»: тихая торжественная мелодия у статуи, ~14 с (своя: до минор, аккорды
   * Cm – A♭ – E♭ – B♭ – Cm, сверху — колокольчик). Одна на всех: пока звучит, новая не начинается.
   */
  respectTheme(pos: V3): void {
    if (!this.ok) return;
    const ctx = this.ctx!;
    if (ctx.currentTime < this.respectEnd) return;
    const beat = 60 / 84;
    this.respectEnd = ctx.currentTime + 20 * beat;
    const d = this.out(pos, this.sfx, 0, 8);
    const C3 = 130.81, Eb3 = 155.56, G3 = 196, Ab2 = 103.83, Bb2 = 116.54, D3 = 146.83, F3 = 174.61, Bb3 = 233.08;
    const chords = [[C3, Eb3, G3], [Ab2, C3, Eb3], [Eb3, G3, Bb3], [Bb2, D3, F3], [C3, Eb3, G3]];
    chords.forEach((ch, i) => {
      const len = i === 4 ? 5 * beat : 4 * beat + 0.4;
      for (const f of ch) {
        this.pad(d, f, i * 4 * beat, len, 0.035);
        this.pad(d, f * 2.002, i * 4 * beat, len, 0.012);
      }
    });
    const G4 = 392, Eb4 = 311.13, F4 = 349.23, Ab4 = 415.3, Bb4 = 466.16, C5 = 523.25;
    const mel: Array<[number, number, number]> = [
      [G4, 0, 2], [Eb4, 2, 1], [F4, 3, 1],
      [G4, 4, 1.5], [Ab4, 5.5, 0.5], [G4, 6, 1], [F4, 7, 1],
      [Eb4, 8, 2], [F4, 10, 1], [G4, 11, 1],
      [Bb4, 12, 2], [Ab4, 14, 1], [G4, 15, 1],
      [C5, 16, 4],
    ];
    for (const [f, at, len] of mel) {
      const t = at * beat;
      const dur = Math.max(1.6, len * beat + 0.9);
      this.tone(d, f, f, dur, 'sine', 0.11, t, 0.006);
      this.tone(d, f * 2.76, f * 2.76, dur * 0.45, 'sine', 0.025, t, 0.004);
      this.tone(d, f * 2, f * 2, dur * 0.7, 'triangle', 0.018, t, 0.01);
    }
  }

  /** Мягкий тянущийся звук для аккордов: медленная атака, держится, плавно гаснет. */
  private pad(dest: AudioNode, f: number, when: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.7, dur / 3));
    g.gain.setValueAtTime(gain, t + Math.max(0.8, dur - 1.1));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Выигрыш на автомате: size 0 — мелочь меньше ставки, 1 — обычный, 2 — крупный (от ×20). Свой (null) — интерфейс. */
  slotWinAt(pos: V3 | null, size: 0 | 1 | 2): void {
    if (!this.ok) return;
    const d = this.out(pos, pos ? this.sfx : this.ui);
    const notes = size === 2 ? [523, 659, 784, 1047, 784, 1047, 1319, 1568] : size === 1 ? [523, 659, 784, 1047] : [784, 1047];
    notes.forEach((f, i) => this.tone(d, f, f, 0.2, 'square', 0.07, i * 0.085));
    notes.forEach((f, i) => this.tone(d, f * 2, f * 2, 0.12, 'triangle', 0.04, i * 0.085 + 0.02));
  }

  /** Одна монета: звонкое «дзинь». Свои монетки (null — награда, продажа, уровень) — интерфейс, в мире — эффекты. */
  coin(pos: V3 | null, when = 0): void {
    if (!this.ok) return;
    const d = this.out(pos, pos ? this.sfx : this.ui);
    const f = 2500 + Math.random() * 1100;
    this.tone(d, f, f * 0.985, 0.22, 'sine', 0.07, when);
    this.tone(d, f * 1.51, f * 1.5, 0.15, 'sine', 0.04, when);
  }

  /** Горсть монет сыплется в лоток и на пол. */
  coins(pos: V3 | null, n: number): void {
    if (!this.ok) return;
    let t = 0;
    for (let i = 0; i < Math.min(n, 26); i++) {
      this.coin(pos, t);
      t += 0.025 + Math.random() * 0.05;
    }
  }

  /** Сирена джекпота: слышат все. */
  siren(): void {
    if (!this.ok || !this.once('siren', 2)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const len = 2.8;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 820;
    // вой: частота ходит вверх-вниз
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 1.6;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.15);
    g.gain.setValueAtTime(0.09, t + len - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    // сирена в павильоне — событие мира, а не кнопка: ползунок «Эффекты»
    o.connect(lp).connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + len + 0.05);
    lfo.stop(t + len + 0.05);
  }

  /** Залп салюта: хлопок и треск. */
  firework(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 22);
    this.noise(d, 0.6, 'lowpass', 1200, 160, 0.7, 0.55, 0, 0.003, true);
    this.tone(d, 120, 45, 0.35, 'sine', 0.3);
    for (let i = 0; i < 14; i++) this.noise(d, 0.03, 'highpass', 3500, 3500, 1, 0.07, 0.18 + Math.random() * 0.8);
  }

  /** Свисток судьи: начало боя. */
  whistle(): void {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const [start, len] of [[0, 0.16], [0.22, 0.5]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 2900;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const lg = ctx.createGain();
      lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(0.16, t + start + 0.02);
      g.gain.setValueAtTime(0.16, t + start + len - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + len);
      o.connect(g).connect(this.ui);
      o.start(t + start);
      lfo.start(t + start);
      o.stop(t + start + len + 0.05);
      lfo.stop(t + start + len + 0.05);
    }
  }

  /** Короткое мягкое «ух» кракена: плавная атака, общий регулятор громкости и mute сохраняются. */
  krakenScare(pos: V3): void {
    if (!this.ok || !this.once('krakenScare', 1.5)) return;
    const dest = this.out(pos, this.amb, .35, 14);
    this.tone(dest, 105, 64, 1.25, 'sine', .085, 0, .2);
    this.tone(dest, 156, 96, .95, 'triangle', .028, .12, .16);
    this.noise(dest, .85, 'lowpass', 480, 170, .5, .038, .06, .16, true);
  }

  /** Event cues are deliberately quieter than weapon/round sounds and use the existing mute/master buses. */
  lobbyEvent(kind: LobbyEventSound, pos: SoundPos = null): void {
    if (!this.ok) return;
    const ambient = kind === 'siren' || kind === 'horn' || kind === 'thunder' || kind === 'wave' || kind === 'cannon';
    const d = this.out(pos, ambient ? this.amb : this.sfx, .15, ambient ? 14 : 5);
    if (kind === 'siren') {
      for (let i = 0; i < 3; i++) this.tone(d, 340, 570, .65, 'triangle', .075, i * .7, .12);
    } else if (kind === 'horn') {
      this.tone(d, 110, 108, 1.6, 'triangle', .075, 0, .18);
      this.tone(d, 165, 163, 1.4, 'sine', .035, .08, .2);
    } else if (kind === 'thunder') {
      // далёкий раскат без молнии (удары со вспышкой гремят через thunder): низкие перекаты
      this.noise(d, 2.6, 'lowpass', 260, 70, .6, .11, 0, .45, true);
      this.noise(d, 2.2, 'lowpass', 200, 60, .6, .08, .9, .5, true);
      this.tone(d, 50, 34, 2.4, 'sine', .05, .1, .5);
    } else if (kind === 'cannon') {
      this.noise(d, .65, 'lowpass', 950, 90, .7, .12, 0, .07, true);
      this.tone(d, 120, 36, .5, 'sine', .055, .04, .05);
    } else if (kind === 'wave' || kind === 'splash') {
      this.noise(d, .7, 'lowpass', 1900, 360, .6, .11, 0, .05);
    } else if (kind === 'mop') {
      this.noise(d, .14, 'bandpass', 850, 1800, 1.2, .075, 0, .015);
      this.tone(d, 180, 90, .09, 'sine', .025);
    } else if (kind === 'loss') {
      this.tone(d, 330, 196, .65, 'triangle', .065, 0, .04);
    } else {
      for (const [i, f] of [523, 659, 784, 1047].entries()) this.tone(d, f, f, .3, 'sine', .045, i * .12, .03);
    }
  }

  /** Close, quiet cat vocalization; no loop or persistent oscillator. */
  purr(pos: V3, hiss = false): void {
    if (!this.ok) return;
    const d = this.out(pos, this.amb, .15, 2.5);
    if (hiss) { this.noise(d, .38, 'bandpass', 1800, 1100, .7, .045, 0, .06); return; }
    for (let i = 0; i < 8; i++) this.tone(d, 44 + i % 2 * 3, 39, .1, 'triangle', .023, i * .08, .035);
    this.noise(d, .7, 'lowpass', 240, 170, .5, .015, 0, .12, true);
  }

  /** Spatial call for the nearby harbor gulls; global distant ambience remains unchanged. */
  gullCry(pos: V3): void {
    if (!this.ok) return;
    const d = this.out(pos, this.amb, .15, 4);
    for (let i = 0; i < 2; i++) {
      this.tone(d, 1200, 1850, .09, 'triangle', .043, i * .28, .025);
      this.tone(d, 1850, 920, .19, 'triangle', .033, i * .28 + .09, .025);
    }
  }

  /** Harbour dog: two short barks, heard only nearby. */
  woof(pos: V3): void {
    if (!this.ok) return;
    const d = this.out(pos, this.amb, .15, 5);
    for (let i = 0; i < 2; i++) {
      this.tone(d, 360, 190, .12, 'sawtooth', .04, i * .2, .012);
      this.noise(d, .1, 'bandpass', 900, 500, .8, .02, i * .2, .01);
    }
  }

  /** Гудок парохода: конец раунда (и изредка — просто так, для атмосферы); pos — откуда (старт регаты слышно с пирса). */
  horn(gain = 0.35, pos: V3 | null = null): void {
    if (!this.ok || !this.once('horn', 1.5)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.25);
    g.gain.setValueAtTime(gain, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    lp.connect(g).connect(this.out(pos, this.amb, 0, 25));
    for (const f of [92, 138, 184]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 10;
      o.connect(lp);
      o.start(t);
      o.stop(t + 2.5);
    }
  }

  streak(n: number): void {
    if (!this.ok) return;
    const base = 440 * Math.pow(2, Math.min(n, 8) / 12);
    [0, 4, 7, 12].forEach((s, i) => this.tone(this.ui, base * Math.pow(2, s / 12), base * Math.pow(2, s / 12), 0.2, 'triangle', 0.12, i * 0.07));
  }

  // ------------------------------------------------------------ дурак за столиками кафе
  // pos — стол или голова желейки; null — свой стол (без затухания)

  /** Карта легла на стол: сухой щелчок бумаги. */
  card(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    const k = 0.9 + Math.random() * 0.2;
    this.noise(d, 0.045, 'bandpass', 3300 * k, 1800 * k, 1.2, 0.3);
    this.noise(d, 0.03, 'highpass', 6200, 4500, 0.7, 0.1, 0.004);
    this.tone(d, 260 * k, 140, 0.035, 'sine', 0.08);
  }

  /** Тасовка перед раздачей: дробь щелчков за 0,8 с и шорох в конце. */
  shuffle(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    for (let i = 0; i < 10; i++) this.noise(d, 0.04, 'bandpass', 2600 + Math.random() * 1600, 1500, 1.4, 0.16, i * 0.075 + Math.random() * 0.02);
    this.noise(d, 0.22, 'bandpass', 1800, 3600, 1, 0.1, 0.8, 0.05);
  }

  /** Бросок: свист воздуха. */
  whoosh(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    this.noise(d, 0.32, 'bandpass', 500, 2400, 2.2, 0.2, 0, 0.12);
  }

  /** Помидор шлёпнулся: мокрый хлюп. */
  tomatoSplat(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    this.noise(d, 0.16, 'lowpass', 1400, 260, 1.2, 0.6);
    this.tone(d, 190, 55, 0.14, 'sine', 0.38);
    this.noise(d, 0.1, 'bandpass', 2400, 900, 2, 0.16, 0.05);
  }

  /** Остался в дураках: грустный тромбон — четыре ноты вниз, последняя тянется и дрожит. */
  foolHorn(pos: V3 | null): void {
    if (!this.ok || !this.once('foolHorn', 1.5)) return;
    const ctx = this.ctx!;
    const d = this.out(pos, this.sfx, 0, 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 950;
    lp.Q.value = 2;
    lp.connect(d);
    const t0 = ctx.currentTime;
    const notes = [233, 220, 208, 196];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      const t = t0 + i * 0.42;
      const len = last ? 1.25 : 0.36;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.03, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.17, t + 0.05);
      g.gain.setValueAtTime(0.17, t + len * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(lp);
      if (last) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.5;
        const lg = ctx.createGain();
        lg.gain.value = 6;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t + 0.15);
        lfo.stop(t + len + 0.05);
      }
      o.start(t);
      o.stop(t + len + 0.05);
    });
  }

  /** Вышел из игры не дураком: короткое арпеджио. Своё (null) — интерфейс. */
  fanfare(pos: V3 | null): void {
    if (!this.ok || !this.once('fanfare', 1)) return;
    const d = this.out(pos, pos ? this.sfx : this.ui, 0, 3);
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone(d, f, f, 0.24, 'triangle', 0.13, i * 0.09);
      this.tone(d, f * 2, f * 2, 0.12, 'square', 0.025, i * 0.09);
    });
  }

  /** Реакция над головой: «чпок». */
  pop(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    this.tone(d, 520, 1250, 0.07, 'sine', 0.16);
    this.noise(d, 0.03, 'bandpass', 2000, 1200, 1.5, 0.08);
  }

  // ------------------------------------------------------------ блэкджек: фишки, переворот, итоги
  // pos — стол; null — свой стол (без затухания). when — задержка в секундах.

  /** Фишка легла на сукно: сухой керамический «клац». */
  chip(pos: V3 | null, when = 0): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    const k = 0.92 + Math.random() * 0.2;
    this.tone(d, 2300 * k, 1500 * k, 0.03, 'triangle', 0.1, when);
    this.tone(d, 3500 * k, 3000 * k, 0.02, 'sine', 0.05, when + 0.002);
    this.noise(d, 0.025, 'highpass', 5200, 4000, 0.8, 0.14, when);
  }

  /** Стопка фишек съехала: несколько клацаний подряд. */
  chipStack(pos: V3 | null, n = 3, when = 0): void {
    if (!this.ok) return;
    let t = when;
    for (let i = 0; i < n; i++) {
      this.chip(pos, t);
      t += 0.04 + Math.random() * 0.025;
    }
  }

  /** Карта перевёрнута: шорох воздуха и лёгкий щелчок. */
  flip(pos: V3 | null, when = 0): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    this.noise(d, 0.07, 'bandpass', 1400, 3200, 1.1, 0.16, when, 0.004);
    this.noise(d, 0.025, 'highpass', 5800, 4200, 0.7, 0.1, when + 0.05);
  }

  /** Выигрыш за столом: два звонких «динь» и несколько монет. big — блэкджек: длиннее и ярче. */
  tableWin(big = false): void {
    if (!this.ok) return;
    const d = this.ui;
    const notes = big ? [659, 784, 988, 1319, 1568] : [784, 1047];
    notes.forEach((f, i) => {
      this.tone(d, f, f, big ? 0.28 : 0.22, 'triangle', 0.14, i * 0.085);
      this.tone(d, f * 2, f * 2, 0.14, 'sine', 0.04, i * 0.085 + 0.01);
    });
    this.coins(null, big ? 12 : 5);
  }

  /** Проигрыш за столом: мягкий низкий «уу-ух», без издевательств. */
  tableLose(): void {
    if (!this.ok) return;
    const d = this.ui;
    this.tone(d, 330, 247, 0.22, 'triangle', 0.12);
    this.tone(d, 247, 196, 0.34, 'triangle', 0.12, 0.17);
  }

  /** Ничья: одна нейтральная нота. */
  tablePush(): void {
    if (!this.ok) return;
    this.tone(this.ui, 523, 523, 0.22, 'triangle', 0.1);
    this.tone(this.ui, 523, 523, 0.22, 'triangle', 0.1, 0.16);
  }

  /** Болеют у табло гонки: гул толпы, хлопки вразнобой и свист. pos = null — для гонщика, без объёма. */
  applause(pos: V3 | null): void {
    if (!this.ok || !this.once('applause', 1.5)) return;
    const d = this.out(pos, this.sfx, 0, 5);
    this.noise(d, 1.7, 'bandpass', 900, 1300, 0.7, 0.06, 0, 0.3);
    for (let i = 0; i < 24; i++) {
      const f = 1300 + Math.random() * 1700;
      this.noise(d, 0.03 + Math.random() * 0.02, 'bandpass', f, f * 0.75, 1.6, 0.1 + Math.random() * 0.08, Math.random() * 1.4);
    }
    this.tone(d, 1750, 2350, 0.3, 'sine', 0.045, 0.15, 0.03);
    this.tone(d, 2300, 1600, 0.35, 'sine', 0.04, 0.5, 0.03);
  }

  // ------------------------------------------------------------ мяч на площади

  /** Пинок по надувному мячу: глухое «пумф» и звон винила. power — скорость мяча после пинка, м/с. */
  ballKick(pos: V3 | null, power: number): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    const g = Math.min(1, 0.35 + power / 16);
    const k = 0.92 + Math.random() * 0.16;
    this.noise(d, 0.09, 'lowpass', 1100 * k, 260, 0.9, 0.42 * g, 0, 0.003, true);
    this.tone(d, 230 * k, 120 * k, 0.13, 'sine', 0.42 * g);
    this.tone(d, 470 * k, 330 * k, 0.07, 'triangle', 0.07 * g, 0.004);
  }

  /** Мяч стукнулся о пол или стену: лёгкое «пок». power — его скорость, м/с. */
  ballBounce(pos: V3 | null, power: number): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    const g = Math.min(1, 0.25 + power / 12);
    const k = 0.9 + Math.random() * 0.2;
    this.tone(d, 300 * k, 190 * k, 0.08, 'sine', 0.26 * g);
    this.noise(d, 0.035, 'bandpass', 1500 * k, 900, 1.2, 0.12 * g);
  }

  // ------------------------------------------------------------ вдвоём и фото у маяка

  /** «Дай пять»: звонкий шлепок ладоней и искорка следом. */
  highFive(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    this.noise(d, 0.07, 'bandpass', 2100, 1300, 1.1, 0.55);
    this.noise(d, 0.025, 'highpass', 4200, 3000, 0.7, 0.18);
    this.tone(d, 330, 150, 0.06, 'sine', 0.2);
    this.tone(d, 1568, 1568, 0.18, 'triangle', 0.05, 0.05);
    this.tone(d, 2093, 2093, 0.24, 'triangle', 0.045, 0.11);
  }

  /** Обнимашки: мягкий шлепок двух желеек и тёплое «о-о» вверх. */
  hug(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    this.noise(d, 0.18, 'lowpass', 900, 260, 0.9, 0.3, 0, 0.02, true);
    this.tone(d, 170, 120, 0.2, 'sine', 0.22, 0, 0.02);
    this.tone(d, 523, 659, 0.45, 'sine', 0.06, 0.08, 0.08);
    this.tone(d, 659, 784, 0.5, 'sine', 0.05, 0.22, 0.08);
  }

  /** Тебя зовут на жест вдвоём: два мягких «динь». */
  pairAsk(): void {
    if (!this.ok) return;
    this.tone(this.ui, 880, 880, 0.16, 'sine', 0.08);
    this.tone(this.ui, 1320, 1320, 0.24, 'sine', 0.07, 0.12);
  }

  /** Затвор фотоаппарата: «чик-чак» и тонкий писк вспышки. */
  shutter(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 4);
    this.noise(d, 0.025, 'bandpass', 3200, 2400, 1.4, 0.45);
    this.noise(d, 0.04, 'bandpass', 1800, 1200, 1.6, 0.32, 0.07);
    this.tone(d, 3800, 5200, 0.12, 'sine', 0.025, 0, 0.03);
  }

  // ------------------------------------------------------------ рыбалка (pos = null — своя удочка, без объёма)

  /** Заброс: свист удилища и тихое «ж-ж-ж» лески с катушки. */
  fishCast(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    const g = pos ? 0.6 : 1;
    this.noise(d, 0.26, 'bandpass', 900, 3200, 3, 0.16 * g, 0.1, 0.1);
    this.noise(d, 0.4, 'bandpass', 5200, 4000, 6, 0.04 * g, 0.3, 0.03);
  }

  /** Поплавок шлёпнулся в воду: «плюп». */
  fishPlop(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    const g = pos ? 0.7 : 1;
    this.tone(d, 900, 260, 0.09, 'sine', 0.2 * g);
    this.noise(d, 0.12, 'lowpass', 1800, 400, 0.8, 0.1 * g, 0.01);
  }

  /** Проба: поплавок дёрнулся — тихое «тук». */
  fishNibble(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    const g = pos ? 0.5 : 1;
    this.tone(d, 640, 380, 0.05, 'sine', 0.13 * g);
    this.noise(d, 0.04, 'bandpass', 1500, 900, 1.5, 0.05 * g);
  }

  /** Поклёвка: поплавок ушёл под воду — «бульк» и пузырёк. */
  fishBite(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    const g = pos ? 0.6 : 1;
    this.tone(d, 520, 110, 0.16, 'sine', 0.3 * g);
    this.tone(d, 300, 900, 0.07, 'sine', 0.09 * g, 0.13);
    this.noise(d, 0.2, 'lowpass', 1400, 300, 1, 0.15 * g, 0.02);
  }

  /** Вываживание: трещотка катушки dur секунд и всплески рыбы у поверхности. */
  fishReel(pos: V3 | null, dur: number): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    const g = pos ? 0.5 : 1;
    const n = Math.floor(dur * 15);
    for (let i = 0; i < n; i++) this.noise(d, 0.018, 'bandpass', 3300 + Math.random() * 700, 2600, 4, 0.06 * g, i / 15 + Math.random() * 0.012);
    for (let t = 0.15; t < dur; t += 0.4 + Math.random() * 0.35) this.noise(d, 0.14, 'lowpass', 1700, 380, 0.8, 0.07 * g, t, 0.01);
  }

  /** Вытащил: плеск и звонкое арпеджио; big — редкий улов, нот больше. */
  fishCatch(pos: V3 | null, big: boolean): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    const g = pos ? 0.6 : 1;
    this.noise(d, 0.35, 'lowpass', 2600, 400, 0.6, 0.26 * g, 0, 0.005);
    const notes = big ? [523, 659, 784, 1047, 1319] : [587, 740, 880];
    notes.forEach((f, i) => this.tone(d, f, f, 0.2, 'triangle', 0.09 * g, 0.12 + i * 0.075));
  }

  /** Сорвалась или ушла: грустное «у-у» вниз. */
  fishEscape(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 2);
    const g = pos ? 0.5 : 1;
    this.tone(d, 440, 330, 0.18, 'triangle', 0.08 * g);
    this.tone(d, 330, 220, 0.28, 'triangle', 0.08 * g, 0.16);
    this.noise(d, 0.15, 'lowpass', 1200, 300, 0.8, 0.07 * g);
  }

  /** Новый вид в альбоме: шелест страницы и «динь-динь». */
  fishAlbum(): void {
    if (!this.ok) return;
    this.noise(this.ui, 0.12, 'highpass', 2500, 5000, 0.7, 0.05);
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(this.ui, f, f, 0.22, 'sine', 0.07, 0.08 + i * 0.07));
  }

  // ------------------------------------------------------------ картинг

  /**
   * Мотор карта id: держится, пока его обновляют каждый кадр (engineStop — заглушить). pos = null — свой,
   * без объёма. speed — м/с, boost — турбо или мини-турбо, skid 0…1 — визг шин в заносе, gain — громкость.
   */
  engine(id: number, pos: V3 | null, speed: number, boost: boolean, skid: number, gain: number): void {
    if (!this.ok) return;
    const ctx = this.ctx!;
    let v = this.engines.get(id);
    if (!v) {
      v = this.makeEngine(pos !== null);
      this.engines.set(id, v);
    }
    const t = ctx.currentTime;
    const k = Math.min(1, Math.max(0, speed / 30));
    const f = (46 + k * 118) * (boost ? 1.12 : 1);
    v.o1.frequency.setTargetAtTime(f, t, 0.06);
    v.o2.frequency.setTargetAtTime(f * 2.02, t, 0.06);
    v.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    v.lp.frequency.setTargetAtTime(520 + k * 2400 + (boost ? 900 : 0), t, 0.08);
    v.out.gain.setTargetAtTime(gain * (0.5 + k * 0.5) * (boost ? 1.25 : 1), t, 0.08);
    v.skid.gain.setTargetAtTime(Math.min(1, skid) * gain * 0.55, t, 0.05);
    if (v.pan && pos) {
      if (v.pan.positionX) {
        v.pan.positionX.setTargetAtTime(pos[0], t, 0.02);
        v.pan.positionY.setTargetAtTime(pos[1], t, 0.02);
        v.pan.positionZ.setTargetAtTime(pos[2], t, 0.02);
      } else {
        v.pan.setPosition(pos[0], pos[1], pos[2]);
      }
    }
  }

  engineStop(id: number): void {
    const v = this.engines.get(id);
    if (!v || !this.ctx) return;
    this.engines.delete(id);
    const t = this.ctx.currentTime;
    v.out.gain.setTargetAtTime(0, t, 0.04);
    v.skid.gain.setTargetAtTime(0, t, 0.04);
    for (const src of v.srcs) src.stop(t + 0.3);
  }

  enginesOff(): void {
    for (const id of [...this.engines.keys()]) this.engineStop(id);
  }

  private makeEngine(positional: boolean): EngineVoice {
    const ctx = this.ctx!;
    let dest: AudioNode = this.sfx;
    let pan: PannerNode | null = null;
    if (positional) {
      pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = 4;
      pan.rolloffFactor = 1.3;
      pan.maxDistance = 120;
      pan.connect(this.sfx);
      dest = pan;
    }
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(dest);
    // «тарахтение»: громкость дышит с частотой вспышек в цилиндре
    const am = ctx.createGain();
    am.gain.value = 0.72;
    am.connect(out);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    const depth = ctx.createGain();
    depth.gain.value = 0.28;
    lfo.connect(depth).connect(am.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.4;
    lp.connect(am);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const g1 = ctx.createGain();
    g1.gain.value = 0.5;
    o1.connect(g1).connect(lp);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.1;
    o2.connect(g2).connect(lp);
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.brownBuf;
    rumble.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 180;
    bp.Q.value = 0.8;
    const gn = ctx.createGain();
    gn.gain.value = 0.6;
    rumble.connect(bp).connect(gn).connect(lp);
    // визг шин — мимо фильтра мотора
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuf;
    hiss.loop = true;
    const sb = ctx.createBiquadFilter();
    sb.type = 'bandpass';
    sb.frequency.value = 1900;
    sb.Q.value = 5;
    const skid = ctx.createGain();
    skid.gain.value = 0;
    hiss.connect(sb).connect(skid).connect(dest);
    const t = ctx.currentTime;
    const srcs = [o1, o2, lfo, rumble, hiss];
    for (const src of srcs) src.start(t, src === rumble || src === hiss ? Math.random() * 1.5 : 0);
    return { o1, o2, lfo, lp, out, skid, pan, srcs };
  }

  /** Турбо: свист воздуха и рёв. lvl 1–3 — мини-турбо (синее, оранжевое, фиолетовое), 4 — турбо из ящика. */
  kartBoost(pos: V3 | null, lvl: number): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 4);
    const big = lvl >= 3;
    this.noise(d, big ? 0.7 : 0.4, 'bandpass', 500, 2600, 1.6, big ? 0.32 : 0.2, 0, 0.03);
    this.tone(d, 110, big ? 330 : 240, big ? 0.6 : 0.35, 'sawtooth', big ? 0.09 : 0.06, 0, 0.02);
    if (lvl >= 2) this.tone(d, 900, 1600, 0.12, 'square', 0.04);
    if (lvl === 3) this.tone(d, 1400, 2600, 0.18, 'triangle', 0.05, 0.04);
  }

  /** Подскок карта на пробел: пружинка подвески; land — приземлился (мягкий «тук»). */
  kartHop(land: boolean): void {
    if (!this.ok) return;
    if (land) {
      this.noise(this.sfx, 0.07, 'lowpass', 700, 180, 0.8, 0.12, 0, 0.003, true);
      this.tone(this.sfx, 140, 80, 0.06, 'sine', 0.08);
      return;
    }
    this.tone(this.sfx, 330, 620, 0.08, 'sine', 0.1);
    this.noise(this.sfx, 0.05, 'bandpass', 2600, 1800, 2, 0.04);
  }

  /** Занос накопил мини-турбо: искры сменили цвет. */
  driftCharge(lvl: number): void {
    if (!this.ok) return;
    const f = lvl >= 3 ? 2093 : lvl === 2 ? 1568 : 1175;
    this.tone(this.ui, f, f * 1.06, 0.09, 'triangle', 0.06);
  }

  /** Ящик разбит: треск досок и «дзынь» — бонус в рулетке. */
  crate(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    this.noise(d, 0.12, 'bandpass', 1600, 500, 1.2, 0.4);
    this.noise(d, 0.07, 'highpass', 3000, 2500, 0.7, 0.15, 0.03);
    this.tone(d, 880, 880, 0.12, 'triangle', 0.1, 0.05);
    this.tone(d, 1320, 1320, 0.18, 'triangle', 0.09, 0.12);
  }

  /** Рулетка бонуса остановилась. */
  itemReady(): void {
    if (!this.ok) return;
    this.tone(this.ui, 1047, 1047, 0.16, 'triangle', 0.1);
    this.tone(this.ui, 1568, 1568, 0.24, 'triangle', 0.08, 0.07);
  }

  /** Наехал на банку варенья: шлепок и «уиии» кружения. */
  jamHit(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    this.noise(d, 0.2, 'lowpass', 1200, 200, 1.2, 0.55);
    this.tone(d, 200, 60, 0.18, 'sine', 0.35);
    this.tone(d, 620, 240, 0.6, 'triangle', 0.07, 0.08, 0.05);
  }

  /** Толчок картов или удар о стену: глухой «бум» (strength — скорость удара, м/с). */
  kartBump(pos: V3 | null, strength: number): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    const g = Math.min(1, strength / 12);
    this.noise(d, 0.12, 'lowpass', 600, 120, 1, 0.25 + g * 0.45, 0, 0.003, true);
    this.tone(d, 95, 48, 0.14, 'sine', 0.15 + g * 0.3);
    this.noise(d, 0.06, 'bandpass', 2400, 1200, 1.5, 0.05 + g * 0.1);
  }

  /** Пузырь надулся: мягкое «блуп» вверх и переливы. */
  bubbleUp(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    this.tone(d, 260, 820, 0.2, 'sine', 0.16, 0, 0.01);
    this.tone(d, 1300, 2300, 0.26, 'triangle', 0.035, 0.08, 0.03);
  }

  /** Пузырь лопнул: звонкий «чпок». */
  bubblePop(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 3);
    this.tone(d, 1100, 380, 0.07, 'sine', 0.2);
    this.noise(d, 0.05, 'highpass', 3600, 2400, 0.8, 0.12);
  }

  /** «Хлопок»: удар в ладоши великана — хлёсткий треск и низкий гул волны. */
  clap(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 6);
    this.noise(d, 0.14, 'bandpass', 1500, 700, 1.1, 0.55);
    this.noise(d, 0.45, 'lowpass', 500, 90, 0.8, 0.4, 0.01, 0.004, true);
    this.tone(d, 130, 45, 0.32, 'sine', 0.32);
  }

  /** Колёса буксуют: короткий визг шин. gain 0…1. */
  skid(gain: number): void {
    if (!this.ok) return;
    this.noise(this.sfx, 0.5, 'bandpass', 2300, 1700, 7, 0.14 * gain, 0, 0.02);
    this.tone(this.sfx, 820, 700, 0.45, 'sawtooth', 0.025 * gain, 0, 0.02);
  }

  /** Трюк в прыжке: весёлое «уи-и». */
  trick(): void {
    if (!this.ok) return;
    this.tone(this.ui, 660, 1320, 0.16, 'triangle', 0.07);
    this.tone(this.ui, 990, 1980, 0.12, 'sine', 0.04, 0.05);
  }

  /** Съехал на траву (шорох) или в песок (шуршание погуще). */
  offroad(sand: boolean): void {
    if (!this.ok) return;
    this.noise(this.sfx, sand ? 0.32 : 0.22, sand ? 'lowpass' : 'bandpass', sand ? 1300 : 2200, sand ? 380 : 1400, 0.9, sand ? 0.16 : 0.08, 0, 0.02, sand);
  }

  /** Отсчёт на решётке: три коротких бипа и высокий на «Вперёд!». */
  countBeep(go: boolean): void {
    if (!this.ok) return;
    const f = go ? 1046 : 523;
    this.tone(this.ui, f, f, go ? 0.5 : 0.22, 'square', 0.07);
    this.tone(this.ui, f * 2, f * 2, go ? 0.4 : 0.16, 'triangle', 0.05);
  }

  // ------------------------------------------------------------ крепость (pos — где зомби, ворота, кристалл)

  /** Зомби стонет: низкое «ыыы» с дрожью; pitch > 1 — выше (шустрик), < 1 — ниже (бугай). */
  zombieGroan(pos: V3 | null, pitch = 1): void {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const d = this.out(pos, this.sfx, 0.2, 4, 'groan');
    if (d === this.mute) return;
    const t = ctx.currentTime;
    const len = 0.7 + Math.random() * 0.5;
    this.hold(d, t + len + 0.05);
    const f = (95 + Math.random() * 30) * pitch;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.15, t);
    o.frequency.linearRampToValueAtTime(f, t + len * 0.4);
    o.frequency.linearRampToValueAtTime(f * 0.82, t + len);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7 + Math.random() * 4;
    const lg = ctx.createGain();
    lg.gain.value = f * 0.06;
    lfo.connect(lg).connect(o.frequency);
    // «рот» — полосовой фильтр на гласной «ы»
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520 * pitch;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.12);
    g.gain.setValueAtTime(0.22, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(bp).connect(g).connect(d);
    o.start(t);
    lfo.start(t);
    o.stop(t + len + 0.05);
    lfo.stop(t + len + 0.05);
  }

  /** Удар по воротам: глухой стук по дереву. */
  gateHit(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 5, 'gate');
    const k = 0.9 + Math.random() * 0.2;
    this.noise(d, 0.16, 'lowpass', 900 * k, 160, 1, 0.5, 0, 0.002, true);
    this.tone(d, 110 * k, 60, 0.18, 'sine', 0.45);
    this.noise(d, 0.05, 'bandpass', 1800 * k, 900, 2, 0.12, 0.01);
  }

  /** Ворота пали: треск досок и грохот. */
  gateBreak(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 14);
    this.noise(d, 1.1, 'lowpass', 1600, 120, 0.8, 0.7, 0, 0.004, true);
    this.tone(d, 80, 34, 0.7, 'sine', 0.5);
    for (let i = 0; i < 12; i++) this.noise(d, 0.06, 'bandpass', 1500 + Math.random() * 2500, 700, 2, 0.16, Math.random() * 0.6);
  }

  /** Молоток: починка ворот (новые ворота — дробью подлиннее). */
  hammer(pos: V3 | null, n = 3): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 4, 'hammer');
    for (let i = 0; i < n; i++) {
      this.tone(d, 900, 600, 0.06, 'square', 0.06, i * 0.16);
      this.noise(d, 0.05, 'bandpass', 2600, 1800, 3, 0.18, i * 0.16);
    }
  }

  /** Колокол на террасе: удар и долгий гул с обертонами. */
  bell(pos: V3 | null): void {
    if (!this.ok || !this.once('bell', 1.5)) return;
    const d = this.out(pos, this.sfx, 0, 10);
    for (const [f, g, len] of [[392, 0.16, 2.4], [784, 0.08, 1.6], [1176, 0.05, 1.1], [523, 0.05, 2.0]] as const) this.tone(d, f, f * 0.995, len, 'sine', g, 0, 0.003);
    this.noise(d, 0.04, 'bandpass', 3000, 2000, 2, 0.1);
  }

  /** Кристалл получил удар: стеклянный звон. */
  crystalHit(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 8, 'crystal');
    const f = 1400 + Math.random() * 500;
    this.tone(d, f, f * 0.97, 0.5, 'sine', 0.1);
    this.tone(d, f * 1.5, f * 1.48, 0.35, 'sine', 0.06, 0.01);
    this.noise(d, 0.08, 'highpass', 5000, 6000, 1, 0.06);
  }

  /** Пузырь лопнул: мокрый «бумм». */
  bloat(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 10, 'bloat');
    this.noise(d, 0.5, 'lowpass', 900, 120, 1, 0.65, 0, 0.003, true);
    this.tone(d, 140, 40, 0.4, 'sine', 0.5);
    this.noise(d, 0.25, 'bandpass', 1800, 500, 1.5, 0.2, 0.03);
  }

  // --- «Крепость»: новые враги, боссы, море, события

  /** Шарик по кастрюле Чугунка: звонкий металл с искрой. */
  clang(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 6, 'clang');
    const f = 900 + Math.random() * 300;
    this.tone(d, f, f * 0.98, 0.22, 'triangle', 0.09);
    this.tone(d, f * 2.7, f * 2.6, 0.12, 'sine', 0.05);
    this.noise(d, 0.04, 'highpass', 4000, 5000, 1, 0.08);
  }

  /** Щит щитоносца разбит: треск досок. */
  planks(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 8, 'planks');
    this.noise(d, 0.35, 'lowpass', 1400, 200, 1, 0.45, 0, 0.003, true);
    for (let i = 0; i < 6; i++) this.noise(d, 0.05, 'bandpass', 1200 + Math.random() * 1800, 600, 2, 0.14, Math.random() * 0.25);
  }

  /** Лекарь лечит: мягкий восходящий перезвон. */
  heal(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 7, 'heal');
    for (const [f, w] of [[523, 0], [659, 0.07], [784, 0.14]] as const) this.tone(d, f, f * 1.01, 0.35, 'sine', 0.05, w);
  }

  /** Плевок: влажный «тьфу». */
  spit(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 6, 'spit');
    this.noise(d, 0.18, 'bandpass', 1500, 600, 2, 0.3, 0, 0.002);
    this.tone(d, 300, 160, 0.12, 'sine', 0.12);
  }

  /** Бочка рванула: гулкий взрыв с треском. */
  boom(pos: V3 | null, big = 1): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 14 * big, 'boom');
    this.noise(d, 0.9 * big, 'lowpass', 1200, 80, 0.8, 0.8, 0, 0.003, true);
    this.tone(d, 90, 30, 0.6 * big, 'sine', 0.6);
    for (let i = 0; i < 5; i++) this.noise(d, 0.06, 'bandpass', 900 + Math.random() * 2000, 500, 2, 0.15, 0.05 + Math.random() * 0.3);
  }

  /** Рёв босса: низкий гул с хрипом (ярость, появление). */
  roar(pos: V3 | null, pitch = 1): void {
    if (!this.ok || !this.once('roar', 1)) return;
    const d = this.out(pos, this.sfx, 0, 20, 'roar');
    this.tone(d, 90 * pitch, 55 * pitch, 1.3, 'sawtooth', 0.12, 0, 0.08);
    this.tone(d, 135 * pitch, 80 * pitch, 1.1, 'square', 0.05, 0.05, 0.1);
    this.noise(d, 1.2, 'lowpass', 700 * pitch, 200, 1.2, 0.3, 0, 0.08, true);
  }

  /** Землетрясение и удар камня: низкий раскатистый грохот. */
  rumble(pos: V3 | null, len = 1): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 18, 'rumble');
    this.noise(d, len, 'lowpass', 300, 60, 0.7, 0.7, 0, 0.05, true);
    this.tone(d, 50, 32, len, 'sine', 0.45, 0, 0.05);
  }

  /** Лодка тонет: треск досок и большой всплеск. */
  sink(pos: V3 | null): void {
    if (!this.ok) return;
    const d = this.out(pos, this.sfx, 0, 16, 'sink');
    for (let i = 0; i < 8; i++) this.noise(d, 0.06, 'bandpass', 900 + Math.random() * 1500, 500, 2, 0.16, Math.random() * 0.4);
    this.noise(d, 1.1, 'lowpass', 2200, 200, 0.7, 0.55, 0.25, 0.02, true);
    this.tone(d, 120, 45, 0.6, 'sine', 0.3, 0.3);
  }

  // ------------------------------------------------------------ атмосфера

  private startAmbience(): void {
    const ctx = this.ctx!;
    // прибой: коричневый шум через фильтр, громкость «дышит»
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg).connect(g.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.07;
    const lg2 = ctx.createGain();
    lg2.gain.value = 180;
    lfo2.connect(lg2).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.amb);
    src.start();
    lfo.start();
    lfo2.start();
  }

  /**
   * Дождь: level — 0 нет … 1 ливень, shelter — под крышей (0…1). Мягкий шелест по силе, стук по навесам и редкие
   * «кап» (в tick) — weathersound.ts, шина «Окружение».
   */
  setRain(level: number, shelter = 0): void {
    this.rainLevel = level;
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    if (!this.rainVoice) {
      if (level < 0.005) return;
      this.rainVoice = new RainVoice(ctx, this.amb, this.noiseBuf, this.brownBuf);
    }
    this.rainVoice.set(level, shelter);
  }

  /** Гром после молнии: dist — до удара (м), pan — где на слух (−1…1), power — сила, far — далёкая гроза. */
  thunder(dist: number, pan = 0, power = 0.8, far = false): void {
    if (!this.ok) return;
    thunderSound(this.ctx!, this.amb, this.noiseBuf, this.brownBuf, { dist, pan, power, far });
  }

  /** Раз в кадр: изредка кричат чайки (в дождь прячутся), иногда гудит пароход, в дождь — стук и капли рядом. */
  tick(dt: number): void {
    if (!this.ok) return;
    this.crowdTick();
    this.nextGull -= dt;
    if (this.nextGull <= 0) {
      this.nextGull = 7 + Math.random() * 14;
      if (this.rainLevel < 0.3) this.gull();
    }
    this.rainVoice?.tick(dt);
    this.nextHorn -= dt;
    if (this.nextHorn <= 0) {
      this.nextHorn = 70 + Math.random() * 60;
      this.horn(0.12);
    }
  }

  private gull(): void {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    pan.connect(g).connect(this.amb);
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 1300 + Math.random() * 400;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * (0.24 + Math.random() * 0.08);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 0.8, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.25, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = base * 1.4;
      bp.Q.value = 2.5;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.0001, t);
      eg.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(bp).connect(eg).connect(pan);
      o.start(t);
      o.stop(t + 0.25);
    }
  }
}
