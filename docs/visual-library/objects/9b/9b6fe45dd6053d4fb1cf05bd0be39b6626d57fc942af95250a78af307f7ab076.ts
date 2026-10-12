// Звуки Небесной каланчи — синтез на лету, без файлов: колокол (басовитое «бом» с гулом), «бумс» удара, свист
// мешка, шипение и стук тарана, ветер (нарастает перед порывом), «пфф» облака, грохот осыпающихся ступеней,
// пружина гриба, отсчёт старта и короткие фанфары. Объёмные — через HRTF, слушатель — камера.
import type { Sound } from '../audio.ts';

type V3 = [number, number, number];

interface Kit {
  ctx: AudioContext;
  sfx: GainNode;
  noise: AudioBuffer;
  brown: AudioBuffer;
}

export class SkillSfx {
  private readonly sound: Sound;
  private bed: { out: GainNode; wind: GainNode; windF: BiquadFilterNode; srcs: AudioScheduledSourceNode[] } | null = null;

  constructor(sound: Sound) {
    this.sound = sound;
  }

  private get kit(): Kit | null {
    return this.sound.kit;
  }

  private out(k: Kit, pos: V3 | null, ref = 4): AudioNode {
    if (!pos) return k.sfx;
    const p = k.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1;
    p.maxDistance = 120;
    if (p.positionX) {
      p.positionX.value = pos[0];
      p.positionY.value = pos[1];
      p.positionZ.value = pos[2];
    } else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(k.sfx);
    return p;
  }

  private tone(k: Kit, dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, gain: number, when = 0, attack = 0.004): void {
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
    o.stop(t + dur + 0.05);
  }

  private noise(k: Kit, dest: AudioNode, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, when = 0, attack = 0.004, brown = false): void {
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
    src.stop(t + dur + 0.05);
  }

  /** Фон: ветер на высоте — громче, чем выше (h 0…1). */
  bedUpdate(h: number, gust: number): void {
    const k = this.kit;
    if (!k) return;
    if (!this.bed) {
      const ctx = k.ctx;
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2);
      out.connect(k.sfx);
      const src = ctx.createBufferSource();
      src.buffer = k.brown;
      src.loop = true;
      const windF = ctx.createBiquadFilter();
      windF.type = 'bandpass';
      windF.frequency.value = 380;
      windF.Q.value = 0.6;
      const wind = ctx.createGain();
      wind.gain.value = 0.05;
      src.connect(windF).connect(wind).connect(out);
      src.start();
      this.bed = { out, wind, windF, srcs: [src] };
    }
    const t = k.ctx.currentTime;
    this.bed.wind.gain.setTargetAtTime(0.04 + 0.1 * h + 0.25 * gust, t, 0.25);
    this.bed.windF.frequency.setTargetAtTime(320 + 260 * h + 500 * gust, t, 0.3);
  }

  stop(): void {
    if (!this.bed) return;
    const k = this.kit;
    const b = this.bed;
    this.bed = null;
    if (k) b.out.gain.setTargetAtTime(0.0001, k.ctx.currentTime, 0.2);
    setTimeout(() => { for (const s of b.srcs) try { s.stop(); } catch { /* уже остановлен */ } b.out.disconnect(); }, 800);
  }

  /** Колокол: «бом» — гул, основной тон и неровные обертоны с долгим хвостом. near — свой или чужой. */
  bell(pos: V3 | null, near = true): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 18);
    const g = near ? 1 : 0.6;
    const f = 196;
    const partials: Array<[number, number, number]> = [[0.5, 0.32, 7], [1, 0.42, 5], [1.19, 0.2, 3.6], [1.5, 0.14, 3], [2, 0.16, 2.6], [2.52, 0.08, 1.8], [3.01, 0.06, 1.4], [4.17, 0.04, 1]];
    for (const [r, a, dur] of partials) {
      this.tone(k, d, f * r * 1.0015, f * r * 0.998, dur, 'sine', a * g, 0, 0.004);
      this.tone(k, d, f * r * 0.9985, f * r * 0.9995, dur * 0.9, 'sine', a * g * 0.5, 0.01, 0.004);
    }
    this.noise(k, d, 0.12, 'bandpass', 2600, 1200, 1.4, 0.18 * g);
  }

  /** «Бумс»: глухой удар и короткий шорох. */
  bums(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 3);
    this.tone(k, d, 150, 46, 0.32, 'sine', 0.7);
    this.tone(k, d, 420, 160, 0.12, 'triangle', 0.2);
    this.noise(k, d, 0.22, 'lowpass', 1800, 300, 0.8, 0.35);
    this.tone(k, d, 880, 1320, 0.18, 'square', 0.04, 0.08);
  }

  /** Мешок пролетает рядом. */
  swoosh(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 3);
    this.noise(k, d, 0.45, 'bandpass', 350, 1400, 1.6, 0.22, 0, 0.18);
  }

  /** Таран: шипение замаха и удар. */
  ramWind(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 4);
    this.noise(k, d, 0.6, 'highpass', 1800, 5200, 0.7, 0.12, 0, 0.3);
    this.tone(k, d, 300, 200, 0.5, 'sawtooth', 0.025, 0.05, 0.2);
  }

  ramHit(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 5);
    this.tone(k, d, 120, 52, 0.28, 'sine', 0.55);
    this.noise(k, d, 0.16, 'lowpass', 1200, 200, 1, 0.4);
    this.tone(k, d, 700, 500, 0.06, 'square', 0.06);
  }

  /** Ветер: предупреждение (нарастает) и порыв. */
  gustWarn(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 8);
    this.noise(k, d, 0.7, 'bandpass', 300, 1100, 1.1, 0.18, 0, 0.6);
  }

  gust(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 8);
    this.noise(k, d, 1.5, 'bandpass', 900, 500, 0.7, 0.32, 0, 0.08);
    this.noise(k, d, 1.4, 'lowpass', 400, 250, 0.7, 0.2, 0, 0.08, true);
  }

  /** Облако растаяло (или вернулось). */
  puff(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 3);
    this.noise(k, d, 0.3, 'lowpass', 900, 300, 0.7, 0.18, 0, 0.02);
  }

  /** Ступени осыпаются: грохот. */
  crumble(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 5);
    this.noise(k, d, 0.5, 'lowpass', 260, 120, 0.8, 0.35, 0, 0.01, true);
    for (let i = 0; i < 4; i++) this.tone(k, d, 300 + Math.random() * 400, 120, 0.06, 'square', 0.03, i * 0.07);
  }

  /** Лестница собралась: вжух и звон. */
  stairsBack(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 10);
    this.noise(k, d, 0.5, 'bandpass', 400, 2200, 1.2, 0.16, 0, 0.3);
    this.tone(k, d, 1320, 1320, 0.5, 'sine', 0.08, 0.45);
  }

  /** Гриб и тележка: пружина. */
  boing(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 3);
    this.tone(k, d, 160, 640, 0.32, 'triangle', 0.32);
    this.tone(k, d, 330, 990, 0.25, 'sine', 0.12, 0.02);
  }

  /** Отсчёт старта: 3-2-1 и «марш!». */
  count(n: number): void {
    const k = this.kit;
    if (!k) return;
    if (n > 0) this.tone(k, k.sfx, 660, 660, 0.16, 'sine', 0.3);
    else {
      this.tone(k, k.sfx, 990, 990, 0.45, 'square', 0.12);
      this.tone(k, k.sfx, 1320, 1320, 0.45, 'sine', 0.18);
    }
  }

  /** Точка взята. */
  checkpoint(): void {
    const k = this.kit;
    if (!k) return;
    this.tone(k, k.sfx, 659, 659, 0.35, 'sine', 0.22);
    this.tone(k, k.sfx, 988, 988, 0.5, 'sine', 0.2, 0.09);
  }

  /** Финиш: короткие фанфары поверх колокола. */
  fanfare(): void {
    const k = this.kit;
    if (!k) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(k, k.sfx, f, f, 0.28 + (i === 3 ? 0.5 : 0), 'triangle', 0.18, 0.35 + i * 0.12));
  }

  /** Упал — назад на точку: «уф». */
  fall(): void {
    const k = this.kit;
    if (!k) return;
    this.tone(k, k.sfx, 520, 180, 0.4, 'sine', 0.18);
  }
}
