// Звуки наборов (PAINT4): синтез на лету теми же кирпичиками, что client/audio.ts (у Sound они закрытые — берём через
// узкий интерфейс, как звуки арсенала крепости client/fort/sfx.ts). Частое — тихое и мягкое: Брызгалка стреляет 20 раз
// в секунду, поэтому у неё короткий глухой «пс» без щелчка, громкость ниже маркера, а подряд идущие сливаются в шипение.
import type { Sound } from '../../audio.ts';

type V3 = [number, number, number];

interface Synth {
  readonly ok: boolean;
  readonly sfx: GainNode;
  out(pos: V3 | null, bus: GainNode, muffle?: number, ref?: number): AudioNode;
  tone(dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, gain: number, when?: number, attack?: number): void;
  noise(dest: AudioNode, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, when?: number, attack?: number, brown?: boolean): void;
}

export class P4Sfx {
  private readonly s: Synth;
  /** Не чаще: капли о стену (их много) */
  private dropAt = 0;

  constructor(sound: Sound) {
    this.s = sound as unknown as Synth;
  }

  private dest(pos: V3 | null, dist: number, ref = 3): AudioNode | null {
    const s = this.s;
    if (!s.ok) return null;
    return s.out(pos, s.sfx, Math.min(0.8, dist / 60), ref);
  }

  /** Брызгалка: мягкий «пс» (свой — тише, чужой — дальше глуше) */
  squirt(pos: V3 | null, dist = 0): void {
    const d = this.dest(pos, dist, 2);
    if (!d) return;
    const k = 0.9 + Math.random() * 0.2;
    const g = pos ? 0.5 : 0.32;
    this.s.noise(d, 0.06, 'bandpass', 1900 * k, 1300 * k, 1.4, 0.55 * g, 0, 0.006);
    this.s.tone(d, 320 * k, 210 * k, 0.04, 'sine', 0.16 * g, 0, 0.005);
  }

  /** Лейка: тяжёлый «плюх» с журчанием */
  can(pos: V3 | null, dist = 0): void {
    const d = this.dest(pos, dist, 4);
    if (!d) return;
    const g = pos ? 1 : 0.8;
    this.s.noise(d, 0.22, 'lowpass', 1800, 420, 0.9, 0.7 * g, 0, 0.01);
    this.s.tone(d, 150, 62, 0.16, 'sine', 0.5 * g);
    this.s.noise(d, 0.3, 'bandpass', 2600, 1200, 1.6, 0.18 * g, 0.05, 0.03);
  }

  /** Лук: тетива — «дзынь» с гулом плеч; сила — по натяжению */
  bow(pos: V3 | null, dist = 0, charge = 1): void {
    const d = this.dest(pos, dist, 4);
    if (!d) return;
    const g = (pos ? 1 : 0.85) * (0.6 + 0.4 * charge);
    this.s.tone(d, 210 + 60 * charge, 150, 0.28, 'triangle', 0.32 * g, 0, 0.002);
    this.s.tone(d, 95, 70, 0.22, 'sine', 0.4 * g);
    this.s.noise(d, 0.05, 'highpass', 3600, 2400, 0.8, 0.22 * g);
  }

  /** Натягиваю лук (только свой): тихий скрип дерева */
  creak(): void {
    const d = this.dest(null, 0, 2);
    if (!d) return;
    this.s.noise(d, 0.32, 'bandpass', 700, 1100, 6, 0.1, 0, 0.08);
    this.s.tone(d, 140, 190, 0.3, 'sawtooth', 0.025, 0, 0.08);
  }

  /** Бросок ведёрка: свист и плеск внутри */
  toss(pos: V3 | null, dist = 0): void {
    const d = this.dest(pos, dist, 3);
    if (!d) return;
    this.s.noise(d, 0.3, 'bandpass', 600, 2200, 2.2, 0.22, 0, 0.1);
    this.s.noise(d, 0.18, 'lowpass', 900, 400, 1, 0.12, 0.05, 0.02);
  }

  /** Удар: капля в стену (редко), стрела воткнулась, ведёрко разлилось */
  impact(kind: string, pos: V3, dist: number): void {
    if (dist > 50) return;
    const d = this.dest(pos, dist, kind === 'bucket' ? 6 : 3);
    if (!d) return;
    if (kind === 'drop' || kind === 'fan') {
      const now = performance.now();
      if (now - this.dropAt < (kind === 'drop' ? 90 : 40)) return;
      this.dropAt = now;
      this.s.noise(d, 0.05, 'lowpass', 1300, 500, 0.8, kind === 'drop' ? 0.16 : 0.28);
    } else if (kind === 'arrow') {
      this.s.tone(d, 260, 120, 0.06, 'square', 0.12);
      this.s.noise(d, 0.08, 'lowpass', 1500, 500, 0.8, 0.4);
    } else if (kind === 'bucket') {
      this.s.noise(d, 0.5, 'lowpass', 1300, 180, 0.9, 0.9, 0, 0.01, true);
      this.s.tone(d, 120, 45, 0.3, 'sine', 0.6);
      this.s.noise(d, 0.35, 'bandpass', 2000, 700, 1.4, 0.3, 0.06, 0.02);
      this.s.tone(d, 900, 1400, 0.05, 'triangle', 0.08, 0.02);
    }
  }

  /** Меня толкнули Лейкой: «ух!» */
  shoved(): void {
    const d = this.dest(null, 0, 2);
    if (!d) return;
    this.s.noise(d, 0.25, 'bandpass', 500, 1800, 2, 0.25, 0, 0.04);
    this.s.tone(d, 260, 420, 0.14, 'sine', 0.12);
  }
}
