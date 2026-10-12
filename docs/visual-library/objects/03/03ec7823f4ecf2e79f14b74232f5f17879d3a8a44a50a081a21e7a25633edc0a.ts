// Звуки подвала «Fight Club» — синтез на лету, без файлов: гул подвала и треск лампы дневного света, толпа (ровный
// гомон, рёв и «у-у-у»), удары (глухой лёгкий и хлёсткий тяжёлый), блок, пробитый блок, свист замаха и уклона,
// захват, бросок и шлепок об пол, нокаут (желейка сдувается), лампа над рингом лопается (хлопок, звон, шипение),
// звон трубы вместо гонга, капля в луже. Объёмные — через HRTF, слушатель — камера (Sound.setListener).
import type { Sound } from '../audio.ts';

type V3 = [number, number, number];

interface Kit {
  ctx: AudioContext;
  sfx: GainNode;
  noise: AudioBuffer;
  brown: AudioBuffer;
}

interface Bed {
  out: GainNode;
  hum: GainNode;
  buzz: GainNode;
  crowd: GainNode;
  crowdF: BiquadFilterNode;
  srcs: AudioScheduledSourceNode[];
}

export class FightSfx {
  private readonly sound: Sound;
  private bed: Bed | null = null;
  private crowdLevel = 0.3;

  constructor(sound: Sound) {
    this.sound = sound;
  }

  private get kit(): Kit | null {
    return this.sound.kit;
  }

  // ------------------------------------------------------------ кирпичики

  private out(k: Kit, pos: V3 | null, ref = 2.5): AudioNode {
    if (!pos) return k.sfx;
    const p = k.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.1;
    p.maxDistance = 60;
    if (p.positionX) {
      p.positionX.value = pos[0];
      p.positionY.value = pos[1];
      p.positionZ.value = pos[2];
    } else {
      p.setPosition(pos[0], pos[1], pos[2]);
    }
    p.connect(k.sfx);
    return p;
  }

  private tone(k: Kit, dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, gain: number, when = 0, attack = 0.003): void {
    const t = k.ctx.currentTime + when;
    const o = k.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(k: Kit, dest: AudioNode, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, when = 0, attack = 0.002, brown = false): void {
    const t = k.ctx.currentTime + when;
    const src = k.ctx.createBufferSource();
    src.buffer = brown ? k.brown : k.noise;
    src.loop = true;
    const f = k.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
  }

  // ------------------------------------------------------------ фон

  /** Включить фон подвала (если звук уже разрешён; иначе — при первом update). */
  start(): void {
    const k = this.kit;
    if (!k || this.bed) return;
    const ctx = k.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.5);
    out.connect(k.sfx);
    const srcs: AudioScheduledSourceNode[] = [];
    // гул: низкий тон трансформатора и коричневый шум вентиляции
    const hum = ctx.createGain();
    hum.gain.value = 0.05;
    hum.connect(out);
    for (const [f, g] of [[50, 0.6], [100, 0.35], [150, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(hum);
      o.start();
      srcs.push(o);
    }
    const vent = ctx.createBufferSource();
    vent.buffer = k.brown;
    vent.loop = true;
    const vlp = ctx.createBiquadFilter();
    vlp.type = 'lowpass';
    vlp.frequency.value = 260;
    const vg = ctx.createGain();
    vg.gain.value = 1.2;
    vent.connect(vlp).connect(vg).connect(hum);
    vent.start();
    srcs.push(vent);
    // треск лампы дневного света: пила 120 Гц через полосовой фильтр (громкость — по тому, горит ли лампа)
    const buzz = ctx.createGain();
    buzz.gain.value = 0.012;
    const bo = ctx.createOscillator();
    bo.type = 'sawtooth';
    bo.frequency.value = 120;
    const bbp = ctx.createBiquadFilter();
    bbp.type = 'bandpass';
    bbp.frequency.value = 2400;
    bbp.Q.value = 1.2;
    bo.connect(bbp).connect(buzz).connect(out);
    bo.start();
    srcs.push(bo);
    // толпа: гомон — шум через «голосовые» полосы, громкость и яркость — по жару
    const crowd = ctx.createGain();
    crowd.gain.value = 0.1;
    const cs = ctx.createBufferSource();
    cs.buffer = k.noise;
    cs.loop = true;
    const crowdF = ctx.createBiquadFilter();
    crowdF.type = 'bandpass';
    crowdF.frequency.value = 700;
    crowdF.Q.value = 0.7;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'peaking';
    f2.frequency.value = 1500;
    f2.gain.value = 6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.4;
    const lg = ctx.createGain();
    lg.gain.value = 0.03;
    lfo.connect(lg).connect(crowd.gain);
    cs.connect(crowdF).connect(f2).connect(crowd).connect(out);
    cs.start();
    lfo.start();
    srcs.push(cs, lfo);
    this.bed = { out, hum, buzz, crowd, crowdF, srcs };
  }

  stop(): void {
    const b = this.bed;
    this.bed = null;
    const k = this.kit;
    if (!b || !k) return;
    const t = k.ctx.currentTime;
    b.out.gain.setTargetAtTime(0.0001, t, 0.2);
    for (const s of b.srcs) s.stop(t + 1);
  }

  /** Раз в кадр: толпа по жару (0…1,6), треск — по лампе дневного света. */
  update(heat: number, tube: number): void {
    if (!this.bed) this.start();
    const b = this.bed;
    const k = this.kit;
    if (!b || !k) return;
    const t = k.ctx.currentTime;
    this.crowdLevel += (heat - this.crowdLevel) * 0.05;
    const c = this.crowdLevel;
    b.crowd.gain.setTargetAtTime(0.07 + c * 0.13, t, 0.15);
    b.crowdF.frequency.setTargetAtTime(600 + c * 500, t, 0.2);
    b.buzz.gain.setTargetAtTime(tube > 0.5 ? 0.012 : 0.002 + Math.random() * 0.02, t, 0.01);
  }

  // ------------------------------------------------------------ бой

  /** Удар: kind — FA_* (1–3 лёгкие, 4 — тяжёлый), res — 1 попал, 2 в блок, 3 пробил блок. */
  punch(pos: V3 | null, heavy: boolean, res: number): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 3);
    if (res === 2) {
      // в блок: глухой «ток» по варежкам
      this.tone(k, d, 420, 300, 0.07, 'triangle', 0.35);
      this.noise(k, d, 0.05, 'bandpass', 1800, 900, 2, 0.25);
      this.noise(k, d, 0.12, 'lowpass', 600, 200, 1, 0.3, 0, 0.002, true);
      return;
    }
    if (res === 3) {
      // пробил блок: треск и тяжёлый удар
      this.noise(k, d, 0.09, 'highpass', 2500, 1200, 0.8, 0.6);
      this.tone(k, d, 140, 45, 0.3, 'sine', 0.9);
      this.noise(k, d, 0.25, 'lowpass', 900, 120, 1, 0.7, 0, 0.002, true);
      return;
    }
    if (heavy) {
      // тяжёлый: хлёсткий шлепок, низ, «желе» дрожит
      this.noise(k, d, 0.06, 'bandpass', 2600, 1400, 1.2, 0.7);
      this.tone(k, d, 120, 38, 0.38, 'sine', 1.0);
      this.noise(k, d, 0.32, 'lowpass', 700, 90, 1, 0.8, 0, 0.002, true);
      this.tone(k, d, 260, 180, 0.22, 'sine', 0.25, 0.03);
      return;
    }
    // лёгкий: глухой «тук» и мокрый шлепок
    this.tone(k, d, 170, 70, 0.16, 'sine', 0.75);
    this.noise(k, d, 0.07, 'bandpass', 1300, 700, 1.4, 0.45);
    this.noise(k, d, 0.14, 'lowpass', 500, 150, 1, 0.35, 0.01, 0.002, true);
  }

  /** Замах: свист воздуха; тяжёлый — длиннее и ниже. */
  swing(pos: V3 | null, heavy: boolean): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 2);
    if (heavy) this.noise(k, d, 0.32, 'bandpass', 500, 1600, 2.2, 0.22, 0, 0.12);
    else this.noise(k, d, 0.16, 'bandpass', 900, 2600, 2.5, 0.16, 0, 0.05);
  }

  dodge(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 2);
    this.noise(k, d, 0.22, 'bandpass', 2400, 700, 3, 0.25, 0, 0.03);
  }

  grab(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 2.5);
    this.noise(k, d, 0.18, 'lowpass', 900, 300, 2, 0.4, 0, 0.004, true);
    this.tone(k, d, 220, 140, 0.15, 'sine', 0.3);
  }

  throwAway(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 3);
    this.noise(k, d, 0.4, 'bandpass', 400, 1400, 1.8, 0.3, 0, 0.1);
    // шлепок об пол — когда долетит
    this.tone(k, d, 110, 40, 0.3, 'sine', 0.8, 0.55);
    this.noise(k, d, 0.3, 'lowpass', 600, 100, 1, 0.6, 0.55, 0.002, true);
  }

  escape(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 2.5);
    this.tone(k, d, 300, 600, 0.12, 'sine', 0.3);
    this.noise(k, d, 0.1, 'bandpass', 1500, 2500, 2, 0.2);
  }

  /** Нокаут: желейка сдувается с бульканьем. */
  ko(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 4);
    this.tone(k, d, 320, 55, 0.75, 'sine', 0.6, 0.05, 0.02);
    this.tone(k, d, 160, 40, 0.6, 'triangle', 0.3, 0.08);
    this.noise(k, d, 0.6, 'lowpass', 1200, 150, 2, 0.4, 0.05, 0.05, true);
  }

  /** Толпа ревёт (k: 0,3 — одобрение, 1 — нокаут). */
  roar(k0: number): void {
    const k = this.kit;
    if (!k) return;
    const dur = 1 + k0 * 1.6;
    const g = 0.12 + k0 * 0.22;
    this.noise(k, k.sfx, dur, 'bandpass', 600, 900, 0.8, g, 0, 0.08);
    this.noise(k, k.sfx, dur * 0.9, 'bandpass', 1400, 1100, 1.2, g * 0.6, 0.05, 0.1);
    this.noise(k, k.sfx, dur * 0.7, 'lowpass', 400, 300, 1, g * 0.8, 0, 0.06, true);
  }

  /** «У-у-у» толпы (тяжёлый мимо, пробитый блок). */
  ooh(): void {
    const k = this.kit;
    if (!k) return;
    this.noise(k, k.sfx, 0.9, 'bandpass', 380, 520, 4, 0.16, 0, 0.15);
    this.noise(k, k.sfx, 0.9, 'bandpass', 800, 950, 5, 0.08, 0, 0.15);
  }

  /** Вместо гонга кто-то бьёт гаечным ключом по трубе: «дзынь» с неровными обертонами. */
  pipe(times = 1): void {
    const k = this.kit;
    if (!k) return;
    for (let i = 0; i < times; i++) {
      const w = i * 0.22;
      for (const [f, g, dur] of [[523, 0.22, 1.6], [1386, 0.12, 1.1], [2213, 0.07, 0.7], [3110, 0.04, 0.4]] as const) {
        this.tone(k, k.sfx, f, f * 0.995, dur, 'sine', g, w, 0.002);
      }
      this.noise(k, k.sfx, 0.04, 'highpass', 3000, 3000, 0.7, 0.2, w);
    }
  }

  /** Лампа над рингом лопнула: хлопок, звон стекла, шипение. */
  pop(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 4);
    this.noise(k, d, 0.05, 'highpass', 3500, 2000, 0.7, 0.7);
    this.tone(k, d, 90, 40, 0.15, 'sine', 0.5);
    for (let i = 0; i < 5; i++) {
      const f = 3000 + Math.random() * 4000;
      this.tone(k, d, f, f * 0.98, 0.12 + Math.random() * 0.15, 'sine', 0.05, 0.03 + Math.random() * 0.2);
    }
    this.noise(k, d, 0.7, 'highpass', 5000, 3000, 0.5, 0.08, 0.05, 0.05);
  }

  /** Перед тем как погаснуть, лампы трещат. */
  crackle(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 3);
    this.noise(k, d, 0.03 + Math.random() * 0.04, 'bandpass', 4000, 3000, 2, 0.08);
  }

  drip(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 1.5);
    const f = 1500 + Math.random() * 600;
    this.tone(k, d, f, f * 0.6, 0.07, 'sine', 0.12);
  }

  /** Запыхался: хриплый выдох. */
  winded(): void {
    const k = this.kit;
    if (!k) return;
    this.noise(k, k.sfx, 0.35, 'bandpass', 1300, 800, 3, 0.12, 0, 0.06);
  }

  /** Толпа отпихнула бойца: «оф!» и шлепок. */
  shove(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 3);
    this.noise(k, d, 0.25, 'bandpass', 500, 350, 3, 0.25, 0, 0.02);
    this.tone(k, d, 130, 70, 0.15, 'sine', 0.4);
  }

  land(pos: V3 | null, power: number): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 2);
    this.tone(k, d, 120, 60, 0.12, 'sine', Math.min(0.5, 0.15 + power * 0.04));
  }

  /** Метка смены бобины: еле слышный щелчок проектора. */
  reel(): void {
    const k = this.kit;
    if (!k) return;
    this.noise(k, k.sfx, 0.025, 'highpass', 2500, 2500, 0.7, 0.05);
    this.noise(k, k.sfx, 0.025, 'highpass', 2500, 2500, 0.7, 0.04, 0.09);
  }
}
