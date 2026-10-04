// Звуки арсенала «Крепости»: дробовик, арбалет, пулемёт, смена ствола, граната (бросок, стук, взрыв), башни
// (баллиста, пушка, котёл, жаровня), покупка у прилавка и золото. Синтез на лету теми же кирпичиками, что client/audio.ts
// (у Sound они закрытые — берём через узкий интерфейс, своих узлов и буферов не заводим). Ни одного файла.
import type { Sound } from '../audio.ts';

type V3 = [number, number, number];

/** То, что у Sound закрыто: выход, тон, шум, шины */
interface Synth {
  readonly ok: boolean;
  readonly sfx: GainNode;
  readonly ui: GainNode;
  out(pos: V3 | null, bus: GainNode, muffle?: number, ref?: number): AudioNode;
  tone(dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, gain: number, when?: number, attack?: number): void;
  noise(dest: AudioNode, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, when?: number, attack?: number, brown?: boolean): void;
}

export class FortSfx {
  private readonly s: Synth;
  private readonly sound: Sound;
  /** Не чаще: монетки, стук гранат */
  private coinAt = 0;
  private bounceAt = 0;

  constructor(sound: Sound) {
    this.sound = sound;
    this.s = sound as unknown as Synth;
  }

  private now(): number {
    return performance.now() / 1000;
  }

  private dest(pos: V3 | null, dist: number, ref = 3, bus?: GainNode): AudioNode | null {
    const s = this.s;
    if (!s.ok) return null;
    return s.out(pos, bus ?? s.sfx, Math.min(0.8, dist / 70), ref);
  }

  /** Дробовик: глухой «бух» с шорохом дроби. pos = null — свой. */
  shotgun(pos: V3 | null, dist = 0): void {
    const d = this.dest(pos, dist, 6);
    if (!d) return;
    const g = pos ? 1 : 0.8;
    const k = 0.95 + Math.random() * 0.1;
    this.s.noise(d, 0.05, 'highpass', 3600 * k, 2200, 0.7, 0.7 * g);
    this.s.tone(d, 130 * k, 42, 0.32, 'sine', 0.9 * g);
    this.s.noise(d, 0.35, 'lowpass', 1400, 160, 0.7, 0.55 * g, 0.004, 0.006, true);
    this.s.noise(d, 0.12, 'bandpass', 5200, 3000, 1.2, 0.16 * g, 0.03);
    if (pos) return;
    // передёрнуть цевьё
    this.s.noise(this.s.sfx, 0.04, 'bandpass', 2400, 1800, 4, 0.2, 0.32);
    this.s.noise(this.s.sfx, 0.04, 'bandpass', 2000, 2800, 4, 0.22, 0.45);
  }

  /** Арбалет: щелчок спуска, гул тетивы и свист болта. */
  crossbow(pos: V3 | null, dist = 0): void {
    const d = this.dest(pos, dist, 5);
    if (!d) return;
    const g = pos ? 1 : 0.8;
    this.s.noise(d, 0.03, 'bandpass', 3000, 2400, 3, 0.4 * g);
    this.s.tone(d, 180, 120, 0.22, 'triangle', 0.35 * g);
    this.s.tone(d, 95, 70, 0.3, 'sine', 0.3 * g, 0.005);
    this.s.noise(d, 0.25, 'bandpass', 1800, 4200, 2.5, 0.16 * g, 0.02);
  }

  /** Пулемёт: сухой частый «тук». */
  mg(pos: V3 | null, dist = 0): void {
    const d = this.dest(pos, dist, 5);
    if (!d) return;
    const g = pos ? 0.75 : 0.5;
    const k = 0.92 + Math.random() * 0.16;
    this.s.noise(d, 0.035, 'bandpass', 2300 * k, 1300, 1, 0.65 * g);
    this.s.tone(d, 170 * k, 75, 0.06, 'sine', 0.55 * g);
    this.s.noise(d, 0.06, 'highpass', 5000, 4000, 0.6, 0.1 * g, 0.01);
  }

  /** Сменил ствол: лязг и щелчок */
  swap(heavy: boolean): void {
    const d = this.dest(null, 0);
    if (!d) return;
    this.s.noise(d, 0.04, 'bandpass', heavy ? 1500 : 2600, heavy ? 1100 : 2000, 4, 0.25);
    this.s.tone(d, heavy ? 420 : 760, heavy ? 300 : 620, 0.05, 'square', 0.04, 0.09);
    this.s.noise(d, 0.03, 'bandpass', 3000, 3400, 5, 0.18, 0.16);
  }

  /** Бросок гранаты: замах и свист */
  throwGrenade(pos: V3 | null): void {
    const d = this.dest(pos, 0, 4);
    if (!d) return;
    this.s.noise(d, 0.22, 'bandpass', 700, 2200, 1.5, 0.25);
    this.s.tone(d, 300, 520, 0.12, 'triangle', 0.05, 0.02);
  }

  /** Граната стукнулась о камень */
  bounce(pos: V3, dist: number): void {
    const t = this.now();
    if (t - this.bounceAt < 0.06 || dist > 50) return;
    this.bounceAt = t;
    const d = this.dest(pos, dist, 3);
    if (!d) return;
    this.s.tone(d, 620 + Math.random() * 200, 380, 0.07, 'triangle', 0.12);
    this.s.noise(d, 0.04, 'bandpass', 2400, 1600, 3, 0.12);
  }

  /** Взрыв гранаты или ядра: удар, рокот и осыпь */
  boom(pos: V3, dist: number, big: boolean): void {
    const d = this.dest(pos, dist * 0.6, big ? 14 : 10);
    if (!d) return;
    const g = big ? 1 : 0.85;
    this.s.noise(d, 0.04, 'highpass', 3000, 1800, 0.7, 0.6 * g);
    this.s.tone(d, 90, 30, 0.7, 'sine', 0.95 * g);
    this.s.noise(d, 0.9, 'lowpass', 1300, 90, 0.6, 0.8 * g, 0.005, 0.006, true);
    this.s.noise(d, 0.5, 'bandpass', 2600, 700, 0.8, 0.18 * g, 0.08);
    for (let i = 0; i < 6; i++) this.s.noise(d, 0.05, 'bandpass', 1800 + Math.random() * 2400, 900, 2, 0.08, 0.25 + Math.random() * 0.5);
  }

  /** Баллиста: удар плеч и гудение тетивы */
  ballista(pos: V3, dist: number): void {
    const d = this.dest(pos, dist, 8);
    if (!d) return;
    this.s.noise(d, 0.05, 'bandpass', 1600, 900, 2, 0.5);
    this.s.tone(d, 110, 80, 0.35, 'triangle', 0.3);
    this.s.noise(d, 0.3, 'bandpass', 1200, 3200, 2, 0.12, 0.03);
  }

  /** Пушка: глухой бабах с эхом */
  cannon(pos: V3, dist: number): void {
    const d = this.dest(pos, dist * 0.5, 16);
    if (!d) return;
    this.s.noise(d, 0.05, 'highpass', 2600, 1500, 0.7, 0.7);
    this.s.tone(d, 70, 28, 0.8, 'sine', 1);
    this.s.noise(d, 1.1, 'lowpass', 900, 80, 0.6, 0.7, 0.005, 0.008, true);
    this.s.noise(d, 0.6, 'lowpass', 600, 120, 0.6, 0.18, 0.35, 0.02, true);
  }

  /** Котёл выплеснул смолу: тяжёлый плеск и шипение */
  tar(pos: V3, dist: number): void {
    const d = this.dest(pos, dist, 8);
    if (!d) return;
    this.s.noise(d, 0.6, 'lowpass', 700, 140, 1, 0.55, 0, 0.02, true);
    this.s.tone(d, 120, 60, 0.4, 'sine', 0.25, 0.05);
    this.s.noise(d, 1.2, 'highpass', 3500, 5000, 0.6, 0.08, 0.2, 0.1);
  }

  /** Жаровня плюнула углями: «пфф» и треск */
  coals(pos: V3, dist: number): void {
    const d = this.dest(pos, dist, 7);
    if (!d) return;
    this.s.noise(d, 0.35, 'bandpass', 900, 2600, 1, 0.4, 0, 0.01);
    for (let i = 0; i < 7; i++) this.s.noise(d, 0.03, 'highpass', 3000 + Math.random() * 3000, 4000, 1, 0.1, 0.05 + Math.random() * 0.6);
  }

  /** Башня встала: стук молотков и «тук-тук» */
  build(pos: V3 | null): void {
    this.sound.hammer(pos, 4);
  }

  /** Покупка у прилавка: монетки и колокольчик лавки */
  buy(big: boolean): void {
    const d = this.dest(null, 0, 3, this.s.ui);
    if (!d) return;
    this.sound.coins(null, big ? 9 : 4);
    this.s.tone(d, 1568, 1568, 0.3, 'sine', 0.06, 0.06);
    this.s.tone(d, 2093, 2093, 0.4, 'sine', 0.05, 0.14);
  }

  /** Не купить: глухой «бум-бум» */
  deny(): void {
    if (!this.sound.once('deny', 1)) return;
    const d = this.dest(null, 0, 3, this.s.ui);
    if (!d) return;
    this.s.tone(d, 220, 200, 0.09, 'square', 0.035);
    this.s.tone(d, 165, 150, 0.12, 'square', 0.035, 0.1);
  }

  /** Золото за врага: звон монетки, не чаще 12 в секунду */
  gold(): void {
    const t = this.now();
    if (t - this.coinAt < 0.085) return;
    this.coinAt = t;
    this.sound.coin(null);
  }

  /** Общак волны: горсть монет */
  pot(n: number): void {
    this.sound.coins(null, Math.max(4, Math.min(20, Math.round(n / 25))));
  }

  /** Крит: высокий «дзинь» */
  crit(): void {
    if (!this.sound.once('crit', 1)) return;
    const d = this.dest(null, 0, 3, this.s.ui);
    if (!d) return;
    this.s.tone(d, 1760, 2400, 0.08, 'triangle', 0.08);
    this.s.tone(d, 2640, 2640, 0.12, 'sine', 0.05, 0.03);
  }

  /**
   * Рекорд крепости: big — побит (труба вверх, аккорд, салют и хлопки толпы), иначе — повторён или свой рекорд (короткая
   * фанфара). Свой звук интерфейса — слышно, где бы ни стоял.
   */
  record(big: boolean): void {
    if (!this.sound.once(big ? 'recBig' : 'rec', 1.5)) return;
    const d = this.dest(null, 0, 3, this.s.ui);
    if (!d) return;
    const notes = big ? [392, 523, 659, 784, 1047] : [523, 659, 784, 1047];
    const step = big ? 0.12 : 0.09;
    notes.forEach((f, i) => {
      this.s.tone(d, f, f, 0.3, 'square', 0.045, i * step);
      this.s.tone(d, f, f, 0.36, 'triangle', 0.12, i * step);
    });
    const end = notes.length * step;
    // финал: аккорд держится (в большом — подольше и с верхней нотой)
    for (const f of big ? [523, 659, 784, 1047, 1568] : [784, 1047]) {
      this.s.tone(d, f, f * 1.003, big ? 1.4 : 0.5, 'triangle', big ? 0.07 : 0.06, end, 0.02);
      if (big) this.s.tone(d, f * 2, f * 2, 0.9, 'sine', 0.02, end + 0.02, 0.03);
    }
    if (!big) return;
    this.sound.firework(null);
    this.sound.applause(null);
  }

  /** Лестница: деревянный скрип ступеньки */
  rung(): void {
    const d = this.dest(null, 0);
    if (!d) return;
    this.s.noise(d, 0.06, 'bandpass', 700 + Math.random() * 300, 500, 4, 0.14);
    this.s.tone(d, 240, 210, 0.05, 'triangle', 0.03);
  }
}
