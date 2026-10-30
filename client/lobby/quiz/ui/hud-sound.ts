// «Ракушка»: тихие звуки HUD (перенос lab/quiz/v2/js/sfx.js). Идут в шину «Интерфейс» игры — слушаются общей громкости,
// «без звука» и настройки «Звуки интерфейса» (sfx.enabled). Шину даёт kit.audio (() => sound.kit); без неё звучат ближайшие
// по смыслу звуки кита (sfx.play). Повтор одного звука чаще 40 мс глушится; частые (догадки, «поп») тихие. Дробь «Проверяем…»
// длится 3 с и обрывается отменой, праздником или уходом (stopRoll).
import { sfx, type SfxName } from '../../../ui/kit/sfx.ts';
import type { QuizSound } from '../fx.ts';

/** Контекст и шина «Интерфейс» игры (sound.kit) */
export interface AudioKit {
  ctx: AudioContext;
  ui: GainNode;
}

const MASTER = 0.16;
/** Без своей шины — ближайший звук кита */
const NEAREST: Record<QuizSound, SfxName> = {
  pop: 'pop', vote: 'click', warm: 'toast', miss: 'close', drum: 'tick', undo: 'close', fanfare: 'level', fail: 'error', puff: 'open', tick: 'tick',
};

interface ToneOpts { type?: OscillatorType; vol?: number; at?: number; to?: number | null }
interface NoiseOpts { vol?: number; at?: number; freq?: number; q?: number; dest?: AudioNode }

export class QuizSounds {
  private readonly audio: (() => AudioKit | null) | undefined;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private bus: GainNode | null = null;
  private readonly last = new Map<QuizSound, number>();
  private stopDrum: (() => void) | null = null;
  private clapAt = -Infinity;

  constructor(audio?: () => AudioKit | null) {
    this.audio = audio;
  }

  /** Подключиться к шине игры (она появляется после первого жеста); false — звука пока нет */
  private attach(): boolean {
    const kit = this.audio?.() ?? null;
    if (!kit) return false;
    if (kit.ctx !== this.ctx || kit.ui !== this.bus) {
      this.out?.disconnect();
      this.ctx = kit.ctx;
      this.bus = kit.ui;
      this.out = kit.ctx.createGain();
      this.out.gain.value = MASTER;
      this.out.connect(kit.ui);
    }
    return true;
  }

  play(name: QuizSound): void {
    if (!sfx.enabled) return;
    if (name === 'drum') { this.roll(3000); return; }
    // оборвать дробь, если пришёл исход проверки
    if (name === 'undo' || name === 'fanfare' || name === 'fail') this.stop();
    const now = performance.now();
    if (now - (this.last.get(name) ?? -Infinity) < 40) return;
    this.last.set(name, now);
    if (!this.audio) { sfx.play(NEAREST[name]); return; }
    if (!this.attach() || !this.ctx || !this.out) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    try { this.synth(name); } catch { /* звук не важнее интерфейса */ }
  }

  /**
   * «Ракушка» 1.1, E1: хлопки. Один «Браво!» (crowd = false) — три тихих хлопка в такт рукам (первый через 0,11 с, дальше
   * через 0,23 с); зал (crowd) — россыпь из 14 хлопков за 1,4 с. Шина та же, что у звуков «Ракушки» (общий выключатель
   * и громкость); без шины — тихий «поп» кита. Чаще раза в 120 мс одинаковое не звучит.
   */
  clap(crowd = false): void {
    if (!sfx.enabled) return;
    const now = performance.now();
    if (now - this.clapAt < 120) return;
    this.clapAt = now;
    if (!this.audio) { sfx.play('pop'); return; }
    if (!this.attach() || !this.ctx || !this.out) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    try {
      if (crowd) {
        for (let i = 0; i < 14; i++) this.noise(0.045, { vol: 0.12 + Math.random() * 0.14, at: 0.05 + Math.random() * 1.35, freq: 1100 + Math.random() * 900, q: 1.1 });
      } else {
        [0.5, 0.38, 0.26].forEach((vol, i) => this.noise(0.05, { vol, at: 0.11 + i * 0.23, freq: 1500, q: 1.2 }));
      }
    } catch { /* звук не важнее интерфейса */ }
  }

  /** Оборвать дробь «Проверяем…» (отмена, праздник, уход) */
  stop(): void {
    this.stopDrum?.();
    this.stopDrum = null;
  }

  dispose(): void {
    this.stop();
    this.out?.disconnect();
    this.out = null;
    this.ctx = null;
    this.bus = null;
  }

  // ---------------------------------------------------------------- синтез (lab/quiz/v2/js/sfx.js)

  private synth(name: QuizSound): void {
    const t = (f: number, dur: number, o?: ToneOpts): void => this.tone(f, dur, o);
    switch (name) {
      case 'pop': t(520, 0.08, { vol: 0.35, to: 900 }); break;
      case 'vote': t(880, 0.05, { type: 'triangle', vol: 0.5 }); break;
      case 'warm': t(1175, 0.18, { type: 'triangle', vol: 0.4 }); t(1568, 0.26, { vol: 0.28, at: 0.07 }); break;
      case 'miss': t(150, 0.14, { vol: 0.7, to: 90 }); this.noise(0.08, { vol: 0.2, freq: 500 }); break;
      case 'undo': t(740, 0.07, { type: 'triangle', vol: 0.32, to: 560 }); t(560, 0.09, { vol: 0.22, at: 0.055, to: 400 }); break;
      case 'fanfare':
        [523, 659, 784, 1047].forEach((f, i) => t(f, 0.2, { type: 'triangle', vol: 0.45, at: i * 0.09 }));
        t(1319, 0.7, { vol: 0.3, at: 0.36 });
        t(1047, 0.7, { type: 'triangle', vol: 0.22, at: 0.36 });
        break;
      case 'fail': t(330, 0.16, { type: 'triangle', vol: 0.3, to: 220 }); t(247, 0.22, { type: 'triangle', vol: 0.24, at: 0.12, to: 165 }); break;
      case 'puff': this.noise(0.3, { vol: 0.35, freq: 700, q: 0.5 }); t(300, 0.2, { vol: 0.25, to: 600 }); break;
      case 'tick': t(1320, 0.03, { type: 'square', vol: 0.1 }); break;
      default: break;
    }
  }

  private tone(f: number, dur: number, { type = 'sine', vol = 1, at = 0, to = null }: ToneOpts = {}): void {
    const c = this.ctx, out = this.out;
    if (!c || !out) return;
    const t0 = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, { vol = 0.3, at = 0, freq = 900, q = 0.8, dest }: NoiseOpts = {}): void {
    const c = this.ctx, out = this.out;
    if (!c || !out) return;
    const t0 = c.currentTime + at;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource();
    s.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp).connect(g).connect(dest ?? out);
    s.start(t0);
  }

  /** Тихая дробь «Проверяем…» на ms: удары учащаются (150 → 45 мс) и крепнут */
  private roll(ms: number): void {
    this.stop();
    if (!this.audio) {
      // без своей шины: тики кита с нарастающей частотой
      let t = 0, alive = true;
      const step = (): void => {
        if (!alive || t >= ms) return;
        sfx.play('tick');
        const gap = 150 - 105 * (t / ms);
        t += gap;
        setTimeout(step, gap);
      };
      step();
      this.stopDrum = () => { alive = false; };
      return;
    }
    if (!this.attach() || !this.ctx || !this.out) return;
    const c = this.ctx;
    if (c.state === 'suspended') c.resume().catch(() => {});
    let bus: GainNode | null = null;
    try {
      bus = c.createGain();
      bus.gain.value = 0.55;
      bus.connect(this.out);
      const end = ms / 1000 - 0.05;
      let t = 0;
      for (let i = 0; t < end; i++) {
        const k = t / (ms / 1000);
        this.noise(0.05, { vol: 0.07 + 0.2 * k, at: t, freq: 1700 + (i % 2) * 260, q: 0.7, dest: bus });
        t += 0.15 - 0.105 * k;
      }
    } catch { /* звук не важнее интерфейса */ }
    this.stopDrum = () => {
      if (!bus) return;
      const b = bus;
      bus = null;
      try { b.gain.cancelScheduledValues(c.currentTime); b.gain.setTargetAtTime(0, c.currentTime, 0.015); } catch { /* */ }
      setTimeout(() => { try { b.disconnect(); } catch { /* */ } }, 250);
    };
  }
}
