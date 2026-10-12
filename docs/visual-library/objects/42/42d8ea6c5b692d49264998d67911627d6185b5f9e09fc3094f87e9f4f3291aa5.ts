// Звук погоды (WebAudio, синтез, без файлов) — всё в шину «Окружение». Дождь: мягкий широкий шелест, у которого
// с силой дождя открывается lowpass (морось — тихое «шшш», ливень — плотнее и ярче, но без резкого белого шума),
// лёгкий стук по крышам и навесам рядом, редкие «кап»; под крышей — глуше, зато стучит над головой.
// Гром: далёкий — низкий и долгий, перекатами; близкий — треск, удар и раскат. Задержка после вспышки — по расстоянию.

type Rnd = () => number;

/** Скорость звука, м/с, и самая долгая задержка грома после вспышки, с */
const SOUND_SPEED = 340;
const THUNDER_DELAY_MAX = 6;

/** Короткий шум через фильтр с огибающей: щелчок, стук, раскат */
function burst(ctx: AudioContext, dest: AudioNode, buf: AudioBuffer, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, attack: number): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * (buf.duration - 0.1));
  src.stop(t + dur + 0.05);
}

/** Шум дождя: живёт, пока жив звук; громкость и фильтры — по силе дождя и укрытию. */
export class RainVoice {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly bed: GainNode;
  private readonly lps: BiquadFilterNode[] = [];
  private readonly body: GainNode;
  private readonly sheen: GainNode;
  private readonly noise: AudioBuffer;
  private level = 0;
  private shelter = 0;
  private set0 = -1;
  private nextTap = 0;
  private nextDrop = 0;
  private readonly rnd: Rnd = Math.random;

  constructor(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, brown: AudioBuffer) {
    this.ctx = ctx;
    this.noise = noise;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest);
    // широкий фон: два независимых шума по краям стерео, мягкий lowpass (открывается с силой) и срез низа
    this.bed = ctx.createGain();
    this.bed.gain.value = 0;
    this.bed.connect(this.out);
    // шум — длинная петля (audio.ts loopBuf): левый и правый края берём из мест, отстоящих на полпетли
    const from = this.rnd();
    for (const side of [-0.7, 0.7]) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      lp.Q.value = 0.35;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 160;
      hp.Q.value = 0.5;
      const pan = ctx.createStereoPanner();
      pan.pan.value = side;
      src.connect(lp).connect(hp).connect(pan).connect(this.bed);
      src.start(0, ((from + (side > 0 ? 0.5 : 0)) % 1) * noise.duration);
      this.lps.push(lp);
    }
    // плотность ливня: низкий шум (капли по воде и плитке издалека)
    this.body = ctx.createGain();
    this.body.gain.value = 0;
    this.body.connect(this.out);
    const b = ctx.createBufferSource();
    b.buffer = brown;
    b.loop = true;
    const blp = ctx.createBiquadFilter();
    blp.type = 'lowpass';
    blp.frequency.value = 520;
    b.connect(blp).connect(this.body);
    b.start(0, this.rnd());
    // лёгкий «шелест» сверху — только в сильный дождь, мягко
    this.sheen = ctx.createGain();
    this.sheen.gain.value = 0;
    this.sheen.connect(this.out);
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.45;
    const slp = ctx.createBiquadFilter();
    slp.type = 'lowpass';
    slp.frequency.value = 5200;
    s.connect(bp).connect(slp).connect(this.sheen);
    s.start(0, this.rnd() * 1.5);
  }

  /** level — сила дождя 0…1, shelter — под крышей (0…1) */
  set(level: number, shelter: number): void {
    this.level = level;
    this.shelter = shelter;
    const key = Math.round(level * 200) + Math.round(shelter * 20) * 1000;
    if (key === this.set0) return;
    this.set0 = key;
    const t = this.ctx.currentTime;
    const k = Math.pow(Math.max(0, level), 0.8);
    const muffle = 1 - 0.5 * shelter;
    for (const lp of this.lps) lp.frequency.setTargetAtTime((900 + 2000 * k) * muffle, t, 0.4);
    this.bed.gain.setTargetAtTime(level < 0.005 ? 0 : 0.185 * (0.6 + 0.4 * level) * Math.min(1, level / 0.08) * (1 - 0.3 * shelter), t, 0.4);
    this.body.gain.setTargetAtTime(0.08 * Math.max(0, level - 0.3) / 0.7, t, 0.6);
    const sh = Math.max(0, Math.min(1, (level - 0.5) / 0.5));
    this.sheen.gain.setTargetAtTime(0.022 * sh * sh * (1 - 0.6 * shelter), t, 0.6);
  }

  /** Раз в кадр: стук капель по крышам и навесам рядом (под крышей — над головой, чаще), редкие «кап». */
  tick(dt: number): void {
    const lv = this.level;
    if (lv < 0.03) return;
    this.nextTap -= dt;
    for (let n = 0; this.nextTap <= 0 && n < 4; n++) {
      const rate = lv * (2.5 + 22 * this.shelter);
      this.nextTap += (0.4 + this.rnd() * 1.2) / Math.max(0.2, rate);
      this.tap();
    }
    this.nextTap = Math.max(this.nextTap, 0);
    this.nextDrop -= dt;
    if (this.nextDrop <= 0) {
      this.nextDrop = (0.5 + this.rnd() * 2.2) / (0.25 + 0.9 * lv);
      this.drop();
    }
  }

  /** Тук по навесу: короткий глухой щелчок, то ближе, то дальше */
  private tap(): void {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (this.rnd() * 2 - 1) * (this.shelter > 0.5 ? 0.5 : 0.85);
    pan.connect(this.out);
    const f = 700 + this.rnd() * 1300;
    const g = (0.012 + this.rnd() * 0.022) * (0.5 + 0.5 * this.shelter) * (0.4 + 0.6 * this.level);
    burst(ctx, pan, this.noise, ctx.currentTime, 0.018 + this.rnd() * 0.02, 'bandpass', f, f * 0.75, 2.2, g, 0.002);
  }

  /** Редкая капля в лужу: короткий тон, который съезжает вниз */
  private drop(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.rnd() * 1.6 - 0.8;
    pan.connect(this.out);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 1100 + this.rnd() * 1100;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((0.008 + this.rnd() * 0.012) * (1 - 0.5 * this.shelter), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(pan);
    o.start(t);
    o.stop(t + 0.12);
  }
}

/** Через сколько секунд после вспышки слышен гром (по расстоянию, не больше 6 с) */
export function thunderDelay(dist: number): number {
  return Math.min(THUNDER_DELAY_MAX, Math.max(0, dist) / SOUND_SPEED);
}

/** Громкость грома по расстоянию (0,12…1) */
export function thunderGain(dist: number, power: number): number {
  return power * Math.max(0.12, Math.min(1, 170 / (Math.max(0, dist) + 60)));
}

/**
 * Гром. dist — до удара (м), pan — где на слух (−1 слева … 1 справа), power — сила (0…1), far — далёкая гроза.
 * Близкий (до ~320 м) — сухой треск, «разрыв» и удар, потом раскаты; далёкий — только низкие долгие перекаты.
 */
export function thunderSound(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, brown: AudioBuffer, o: { dist: number; pan: number; power: number; far: boolean }, rnd: Rnd = Math.random): void {
  const g = thunderGain(o.dist, o.power);
  const t0 = ctx.currentTime + thunderDelay(o.dist);
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, o.pan)) * 0.75;
  pan.connect(dest);
  const near = !o.far && o.dist < 320;
  let t = t0;
  if (near) {
    burst(ctx, pan, noise, t0, 0.1, 'highpass', 2200, 1600, 0.6, 0.42 * g, 0.002);
    for (let i = 0; i < 4; i++) burst(ctx, pan, noise, t0 + 0.025 + i * 0.035 + rnd() * 0.012, 0.035, 'bandpass', 2600, 1300, 1.2, (0.22 - i * 0.03) * g, 0.002);
    burst(ctx, pan, brown, t0 + 0.03, 1.5, 'lowpass', 1000, 90, 0.7, 0.85 * g, 0.012);
    t += 0.35;
  }
  // раскаты: несколько волн низкого шума с медленной атакой; дальше — ниже и длиннее
  const n = (o.far ? 4 : 3) + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const len = o.far ? 1.8 + rnd() * 2.2 : 1.2 + rnd() * 1.6;
    const f = (o.far ? 170 : 300) * (0.7 + 0.6 * rnd());
    const amp = g * (o.far ? 0.6 : 0.55) * (1 - (i / (n + 1)) * 0.65) * (0.6 + 0.4 * rnd());
    burst(ctx, pan, brown, t, len, 'lowpass', f, f * 0.45, 0.6, amp, 0.2 + rnd() * 0.45);
    t += 0.45 + rnd() * (o.far ? 1.3 : 0.9);
  }
  // низкий гул под раскатами
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(52, t0);
  sub.frequency.exponentialRampToValueAtTime(34, t + 1.5);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(0.18 * g, t0 + 0.5);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  sub.connect(sg).connect(pan);
  sub.start(t0);
  sub.stop(t + 1.6);
}
