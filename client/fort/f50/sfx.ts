// Звуки «Крепости 50»: удар по стене, обвал и пролом, камень со стены («бух»), молоток на лесах, «заделали»,
// лагерь Барона и катапульта. Синтез на лету теми же кирпичиками, что client/audio.ts (как fort/sfx.ts), без файлов.
// Частые звуки (удар по стене, молоток) — тихие и не чаще своего шага: 20 подряд не раздражают.
import type { Sound } from '../../audio.ts';
import type { CampSound } from './camp3d.ts';

type V3 = [number, number, number];

interface Synth {
  readonly ok: boolean;
  readonly sfx: GainNode;
  out(pos: V3 | null, bus: GainNode, muffle?: number, ref?: number): AudioNode;
  tone(dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, gain: number, when?: number, attack?: number): void;
  noise(dest: AudioNode, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, when?: number, attack?: number, brown?: boolean): void;
}

export type WallSound = 'hit' | 'breach' | 'stone' | 'fixed' | 'hammer' | 'cata';

export class F50Sfx {
  private readonly s: Synth;
  /** Где слушатель (камера) — для приглушения издалека */
  private lx = 0;
  private ly = 0;
  private lz = 0;
  private readonly last = new Map<string, number>();

  constructor(sound: Sound) {
    this.s = sound as unknown as Synth;
  }

  listener(x: number, y: number, z: number): void {
    this.lx = x;
    this.ly = y;
    this.lz = z;
  }

  /** Не чаще gap секунд для этого ключа */
  private gate(key: string, gap: number): boolean {
    const now = performance.now() / 1000;
    if (now - (this.last.get(key) ?? -1e9) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  private dest(x: number, y: number, z: number, ref = 5): AudioNode | null {
    const s = this.s;
    if (!s.ok) return null;
    const dist = Math.hypot(x - this.lx, y - this.ly, z - this.lz);
    return s.out([x, y, z], s.sfx, Math.min(0.8, dist / 70), ref);
  }

  wall(kind: WallSound, x: number, y: number, z: number): void {
    switch (kind) {
      case 'hit': {
        // глухой удар по кладке и шорох камешков — тихо, не чаще 4 раз в секунду
        if (!this.gate('hit', 0.25)) return;
        const d = this.dest(x, y, z, 6);
        if (!d) return;
        const k = 0.9 + Math.random() * 0.2;
        this.s.tone(d, 90 * k, 38, 0.22, 'sine', 0.38);
        this.s.noise(d, 0.18, 'lowpass', 900 * k, 260, 0.8, 0.22, 0.005, 0.004, true);
        this.s.noise(d, 0.22, 'bandpass', 2600, 1800, 1.4, 0.05, 0.05);
        return;
      }
      case 'cata': {
        // ядро катапульты в стену: тяжелее удара, с отзвуком
        const d = this.dest(x, y, z, 10);
        if (!d) return;
        this.s.tone(d, 70, 30, 0.5, 'sine', 0.8);
        this.s.noise(d, 0.5, 'lowpass', 1200, 140, 0.7, 0.5, 0.004, 0.005, true);
        this.s.noise(d, 0.6, 'bandpass', 2200, 900, 1.1, 0.12, 0.08);
        return;
      }
      case 'breach': {
        // обвал: низкий гул, грохот осыпи, долгий шорох
        const d = this.dest(x, y, z, 14);
        if (!d) return;
        this.s.tone(d, 55, 24, 1.3, 'sine', 0.9);
        this.s.noise(d, 1.1, 'lowpass', 700, 90, 0.6, 0.7, 0, 0.02, true);
        for (let i = 0; i < 5; i++) this.s.noise(d, 0.12, 'bandpass', 1400 + Math.random() * 900, 700, 1.3, 0.22, 0.15 + i * 0.17 + Math.random() * 0.08);
        this.s.noise(d, 1.6, 'bandpass', 3200, 1400, 0.9, 0.08, 0.4, 0.3);
        return;
      }
      case 'stone': {
        // «бух»: валун о землю
        const d = this.dest(x, y, z, 8);
        if (!d) return;
        this.s.tone(d, 75, 32, 0.42, 'sine', 1);
        this.s.noise(d, 0.3, 'lowpass', 600, 120, 0.7, 0.55, 0, 0.003, true);
        this.s.noise(d, 0.2, 'bandpass', 1800, 1100, 1.2, 0.1, 0.03);
        return;
      }
      case 'hammer': {
        // стук молотка по камню — тихий, не чаще 2,5 раза в секунду
        if (!this.gate('hammer', 0.38)) return;
        const d = this.dest(x, y, z, 4);
        if (!d) return;
        const k = 0.94 + Math.random() * 0.12;
        this.s.tone(d, 820 * k, 640, 0.07, 'triangle', 0.12);
        this.s.noise(d, 0.04, 'bandpass', 3200 * k, 2600, 3, 0.1);
        return;
      }
      case 'fixed': {
        // заделали: камень лёг и короткий светлый «дзинь»
        const d = this.dest(x, y, z, 8);
        if (!d) return;
        this.s.tone(d, 110, 70, 0.25, 'sine', 0.5);
        this.s.noise(d, 0.2, 'lowpass', 900, 300, 0.7, 0.25, 0, 0.003, true);
        this.s.tone(d, 660, 660, 0.25, 'triangle', 0.1, 0.12, 0.01);
        this.s.tone(d, 990, 990, 0.35, 'triangle', 0.08, 0.2, 0.01);
        return;
      }
    }
  }

  camp(kind: CampSound, x: number, y: number, z: number): void {
    if (!this.gate(`camp-${kind}`, kind === 'creak' ? 0.09 : 0.15)) return;
    const d = this.dest(x, y, z, 8);
    if (!d) return;
    switch (kind) {
      case 'rise':
        this.s.noise(d, 0.9, 'lowpass', 500, 160, 0.6, 0.35, 0, 0.2, true);
        this.s.tone(d, 60, 90, 0.8, 'sine', 0.25, 0, 0.2);
        return;
      case 'thud':
        this.s.tone(d, 140, 70, 0.14, 'sine', 0.4);
        this.s.noise(d, 0.08, 'bandpass', 900, 500, 1.4, 0.18);
        return;
      case 'creak':
        this.s.noise(d, 0.03, 'bandpass', 2200 + Math.random() * 400, 1800, 6, 0.16);
        this.s.tone(d, 420, 380, 0.04, 'square', 0.03);
        return;
      case 'whoosh':
        this.s.noise(d, 0.5, 'bandpass', 500, 1800, 1.4, 0.3, 0, 0.06);
        return;
      case 'bang':
        this.s.tone(d, 95, 45, 0.3, 'sine', 0.7);
        this.s.noise(d, 0.2, 'lowpass', 1400, 300, 0.8, 0.4, 0, 0.002, true);
        this.s.noise(d, 0.12, 'bandpass', 1300, 900, 2, 0.18, 0.05);
        return;
      case 'ignite':
        this.s.noise(d, 0.6, 'bandpass', 1600, 900, 0.8, 0.2, 0, 0.1);
        return;
      case 'fizzle':
        this.s.noise(d, 0.45, 'highpass', 3600, 2400, 0.7, 0.14, 0, 0.01);
        return;
      case 'roar':
        this.s.noise(d, 1.6, 'lowpass', 900, 380, 0.5, 0.55, 0, 0.15, true);
        this.s.noise(d, 1.2, 'bandpass', 2400, 1200, 0.7, 0.12, 0.1, 0.2);
        this.s.tone(d, 70, 50, 1.0, 'sine', 0.3, 0, 0.1);
        return;
      case 'crack':
        for (let i = 0; i < 3; i++) this.s.noise(d, 0.06, 'bandpass', 1600 + i * 300, 900, 2, 0.35, i * 0.09);
        this.s.tone(d, 110, 50, 0.45, 'sine', 0.5, 0.2);
        return;
      case 'chest':
        this.s.tone(d, 880, 880, 0.18, 'triangle', 0.12);
        this.s.tone(d, 1320, 1320, 0.22, 'triangle', 0.1, 0.08);
        this.s.tone(d, 1760, 1760, 0.3, 'triangle', 0.08, 0.16);
        this.s.noise(d, 0.4, 'highpass', 6000, 5000, 0.7, 0.05, 0.05);
        return;
      case 'sink':
        this.s.noise(d, 1.2, 'lowpass', 400, 120, 0.6, 0.3, 0, 0.2, true);
        return;
    }
  }
}
