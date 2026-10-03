// Звуки пряток — синтез на лету, без файлов. Насмешки — объёмные (HRTF): по ним ищут. Восемь смешных:
// кряканье, «ку-ку», клаксон велосипеда, свисток-горка, пружина «бойнг», пищалка, «пфррр» и резиновая курица.
// Писк попадания — по размеру предмета (маленький пищит, большой гудит), хлопок превращения, гудок выхода ловцов,
// тиканье в последние секунды, «шлёп» краски и бульканье пустого бака.
import type { Sound } from '../audio.ts';

type V3 = [number, number, number];
interface Kit { ctx: AudioContext; sfx: GainNode; noise: AudioBuffer; brown: AudioBuffer }

export class HideSfx {
  private readonly sound: Sound;
  constructor(sound: Sound) { this.sound = sound; }
  private get kit(): Kit | null { return this.sound.kit; }

  private out(k: Kit, pos: V3 | null, gain = 1, ref = 3): AudioNode {
    const g = k.ctx.createGain();
    g.gain.value = gain;
    g.connect(k.sfx);
    if (!pos) return g;
    const p = k.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.05;
    p.maxDistance = 80;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
    else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(g);
    return p;
  }

  /** Тон с переходом частоты; vib — вибрато (Гц, глубина в долях) */
  private tone(k: Kit, dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, gain: number, when = 0, attack = 0.005, vib: [number, number] | null = null): void {
    const t = k.ctx.currentTime + when;
    const o = k.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (vib) {
      const l = k.ctx.createOscillator(), lg = k.ctx.createGain();
      l.frequency.value = vib[0];
      lg.gain.value = f0 * vib[1];
      l.connect(lg).connect(o.frequency);
      l.start(t); l.stop(t + dur + 0.05);
    }
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Тон через полосовой фильтр (голосовая «форманта»: кряк, клаксон) */
  private voiced(k: Kit, dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, formant: number, q: number, gain: number, when = 0): void {
    const t = k.ctx.currentTime + when;
    const o = k.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const f = k.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = formant; f.Q.value = q;
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(k: Kit, dest: AudioNode, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, when = 0, attack = 0.003): void {
    const t = k.ctx.currentTime + when;
    const src = k.ctx.createBufferSource();
    src.buffer = k.noise; src.loop = true;
    const f = k.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  /** Насмешка s (0…7) из точки pos; loud — 0/1/2 (рядом с ловцом громче). */
  taunt(pos: V3, s: number, loud: number): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 0.75 + loud * 0.2, 4);
    switch (s % 8) {
      case 0: // кря-кря
        for (const w of [0, 0.22]) { this.voiced(k, d, 330, 250, 0.16, 'sawtooth', 1150, 3.5, 0.9, w); this.noise(k, d, 0.08, 'bandpass', 1400, 900, 2, 0.2, w); }
        break;
      case 1: // ку-ку
        this.tone(k, d, 784, 770, 0.24, 'sine', 0.5, 0, 0.02); this.tone(k, d, 622, 610, 0.36, 'sine', 0.5, 0.3, 0.02);
        this.tone(k, d, 1568, 1540, 0.2, 'sine', 0.06, 0); this.tone(k, d, 1244, 1220, 0.3, 'sine', 0.06, 0.3);
        break;
      case 2: // клаксон велосипеда: ба-бах
        for (const w of [0, 0.26]) this.voiced(k, d, 420, 380, 0.2, 'square', 900, 2, 0.75, w);
        break;
      case 3: // свисток-горка вверх
        this.tone(k, d, 520, 1900, 0.55, 'sine', 0.45, 0, 0.02, [9, 0.03]);
        break;
      case 4: // пружина «бойнг»
        this.tone(k, d, 140, 520, 0.5, 'triangle', 0.6, 0, 0.005, [18, 0.25]);
        this.tone(k, d, 280, 1040, 0.4, 'sine', 0.15, 0, 0.005, [18, 0.25]);
        break;
      case 5: // пищалка: уи-уи
        for (const w of [0, 0.18]) this.tone(k, d, 1300, 1900, 0.14, 'triangle', 0.4, w, 0.01);
        break;
      case 6: // пфррр
        this.voiced(k, d, 130, 95, 0.55, 'sawtooth', 600, 1.2, 0.8);
        this.noise(k, d, 0.55, 'bandpass', 500, 300, 1.5, 0.25);
        break;
      default: // резиновая курица
        this.noise(k, d, 0.12, 'highpass', 2000, 2000, 0.7, 0.25);
        this.voiced(k, d, 980, 620, 0.5, 'square', 1700, 4, 0.7, 0.05);
        break;
    }
  }

  /** Попадание по прячущемуся: маленький пищит, средний «уиик», большой гудит. Слышат все. */
  squeak(pos: V3, size: number): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 1, 4);
    if (size === 0) { this.tone(k, d, 1500, 2300, 0.12, 'triangle', 0.55); this.tone(k, d, 2300, 1700, 0.1, 'triangle', 0.4, 0.12); }
    else if (size === 1) { this.voiced(k, d, 700, 1100, 0.22, 'sawtooth', 1400, 3, 0.7); }
    else { this.voiced(k, d, 160, 120, 0.4, 'sawtooth', 420, 2.5, 0.9); this.tone(k, d, 80, 70, 0.4, 'sine', 0.4); }
  }

  /** Хлопок превращения */
  puff(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 0.8, 3);
    this.noise(k, d, 0.3, 'bandpass', 2600, 500, 0.9, 0.45);
    this.tone(k, d, 420, 900, 0.09, 'sine', 0.25, 0.02);
  }

  /** Выстрел краской: «чвок». pos = null — свой. */
  blaster(pos: V3 | null): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, pos ? 0.9 : 0.6, 4);
    this.noise(k, d, 0.09, 'bandpass', 900, 300, 1.2, 0.6);
    this.tone(k, d, 260, 90, 0.12, 'sine', 0.5);
    this.tone(k, d, 1200, 500, 0.04, 'triangle', 0.1);
  }

  /** Краска шлёпнулась */
  splat(pos: V3): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, pos, 0.8, 3);
    this.noise(k, d, 0.12, 'lowpass', 1800, 300, 0.8, 0.5);
    this.tone(k, d, 180, 60, 0.1, 'sine', 0.3);
  }

  /** Бак пуст: сухой щелчок и бульканье */
  dry(): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, null, 0.6);
    this.tone(k, d, 1800, 1200, 0.03, 'square', 0.12);
    for (let i = 0; i < 3; i++) this.tone(k, d, 300 + i * 90, 200, 0.06, 'sine', 0.18, 0.06 + i * 0.07);
  }

  /** Ловцы выходят: пароходный гудок */
  horn(): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, null, 0.5);
    for (const f of [110, 138.6, 164.8]) this.voiced(k, d, f, f * 0.99, 1.6, 'sawtooth', 500, 0.7, 0.45);
  }

  /** Поймали: «та-дам» и хлопок конфетти */
  caught(pos: V3, mine: boolean): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, mine ? null : pos, 0.8, 5);
    this.noise(k, d, 0.18, 'bandpass', 3000, 800, 0.8, 0.5);
    [523, 659, 784, 1047].forEach((f, i) => this.tone(k, d, f, f, 0.22 + i * 0.05, 'triangle', 0.22, 0.08 + i * 0.08));
  }

  /** Тиканье последних секунд (last — последняя) и сигнал финала */
  tick(last: boolean): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, null, 0.5);
    this.tone(k, d, last ? 1320 : 990, last ? 1320 : 990, 0.06, 'square', 0.12);
  }
  finalBell(): void {
    const k = this.kit;
    if (!k) return;
    const d = this.out(k, null, 0.6);
    for (const [f, w] of [[880, 0], [1175, 0.18], [880, 0.36]] as const) this.tone(k, d, f, f, 0.35, 'sine', 0.3, w);
  }
}
