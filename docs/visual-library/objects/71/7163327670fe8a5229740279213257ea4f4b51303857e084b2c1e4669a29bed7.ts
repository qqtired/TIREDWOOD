// Звук прототипов: маленький синтезатор на Web Audio. Ничего не скачивается; звук начинается только после нажатия
// пользователя (запуск превью), его можно выключить кнопкой «Звук» под сценой, выбор помнится в этом браузере.
import type { Sound } from './types.ts';

const STORE = 'lab.sound';

export class LabSound implements Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private off = false;

  constructor() {
    try {
      this.off = localStorage.getItem(STORE) === 'off';
    } catch {
      // без памяти: звук включён
    }
  }

  get enabled(): boolean {
    return !this.off;
  }

  setEnabled(on: boolean): void {
    this.off = !on;
    try {
      localStorage.setItem(STORE, on ? 'on' : 'off');
    } catch {
      // не запомнили — не беда
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.02);
  }

  /** Вызывать из нажатия пользователя: браузер разрешает звук только после него. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.off ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private ready(): boolean {
    return !this.off && this.ctx !== null && this.master !== null && this.ctx.state === 'running';
  }

  tone(o: { f0: number; f1?: number; dur: number; type?: OscillatorType; vol?: number; delay?: number }): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
    const vol = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  noise(o: { dur: number; vol?: number; lp0?: number; lp1?: number; delay?: number }): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(o.lp0 ?? 2000, t0);
    if (o.lp1 !== undefined) lp.frequency.exponentialRampToValueAtTime(Math.max(40, o.lp1), t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(lp).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }

  tick(pitch = 1): void {
    this.tone({ f0: 1500 * pitch, f1: 900 * pitch, dur: 0.05, type: 'square', vol: 0.1 });
  }
  boom(): void {
    this.noise({ dur: 0.55, vol: 0.55, lp0: 2400, lp1: 160 });
    this.tone({ f0: 130, f1: 38, dur: 0.5, vol: 0.6 });
  }
  whoosh(): void {
    this.noise({ dur: 0.28, vol: 0.18, lp0: 500, lp1: 3200 });
  }
  pop(): void {
    this.tone({ f0: 620, f1: 190, dur: 0.09, type: 'triangle', vol: 0.3 });
  }
  ding(): void {
    this.tone({ f0: 880, dur: 1.5, vol: 0.32 });
    this.tone({ f0: 1318, dur: 1.1, vol: 0.18 });
    this.tone({ f0: 1760, dur: 0.7, vol: 0.1 });
  }
  slip(): void {
    this.tone({ f0: 760, f1: 190, dur: 0.38, type: 'sawtooth', vol: 0.14 });
    this.tone({ f0: 300, f1: 520, dur: 0.2, type: 'triangle', vol: 0.2, delay: 0.38 });
  }
  splat(): void {
    this.noise({ dur: 0.2, vol: 0.4, lp0: 2000, lp1: 260 });
    this.tone({ f0: 220, f1: 70, dur: 0.16, vol: 0.4 });
  }
  honk(): void {
    this.tone({ f0: 150, f1: 62, dur: 0.5, type: 'sawtooth', vol: 0.22 });
    this.tone({ f0: 154, f1: 66, dur: 0.5, type: 'square', vol: 0.08 });
    this.noise({ dur: 0.45, vol: 0.12, lp0: 700, lp1: 150 });
  }
  plip(pitch = 1): void {
    this.tone({ f0: 760 * pitch, f1: 360 * pitch, dur: 0.09, vol: 0.22 });
  }
  step(i: number): void {
    if (i % 2 === 0) this.tone({ f0: 160, f1: 55, dur: 0.12, vol: 0.34 });
    else this.noise({ dur: 0.05, vol: 0.12, lp0: 9000, lp1: 5000 });
  }
  fanfare(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ f0: f, dur: i === 3 ? 0.5 : 0.14, type: 'square', vol: 0.12, delay: i * 0.12 }));
  }
}
