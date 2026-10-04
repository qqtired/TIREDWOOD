// Звуки баркаса — всё синтезом (WebAudio), ни одного файла. Корабль: скрип дерева, шлепки волн о борт, звяканье цепи;
// рында (склянки бьёт Михалыч — crew.ts), колокол у калитки, чайки (в дождь молчат). Лодка «Удалая»: «тук-тук» мотора
// (чаще на ходу) и гудок при отходе. Всё — в шину эффектов (kit.sfx). Своей музыки на баркасе нет: песни играет
// музыкальный автомат на баке (client/lobby/jukebox.ts, очередь общая с автоматом на площади).
import * as THREE from 'three';
import { BARKAS } from '../../../shared/barkas.ts';

/** Корабельные звуки, колокола, чайки, лодка */
const SHIP_VOLUME = 0.55;
/** Склянки и колокол у калитки слышны ближе FAR + 20 м; скрип, волны и чайки — ближе NEAR_SHIP; лодка — до FERRY_FAR от неё */
const FAR = 95;
const NEAR_SHIP = 60;
const FERRY_FAR = 90;

export interface Kit {
  ctx: AudioContext;
  sfx: GainNode;
  noise: AudioBuffer;
  brown: AudioBuffer;
}

export class BarkasAudio {
  private kit: Kit | null = null;
  private ship: GainNode | null = null;
  private motorPan: PannerNode | null = null;
  private nextCreak = 4;
  private nextSlap = 1;
  private nextClink = 18;
  private nextGull = 6;
  private nextThump = 0;

  /**
   * Раз в кадр. kit — звук (null — ещё не разрешён: тишина), cam — слушатель, rain 0…1,
   * motor — мотор лодки (где и ход, м/с; null — заглушен).
   */
  update(dt: number, kit: Kit | null, cam: THREE.Vector3, rain: number, motor: { pos: THREE.Vector3; speed: number } | null): void {
    const live = kit !== null && kit.ctx.state === 'running';
    if (!live) return;
    if (this.kit?.ctx !== kit.ctx) this.attach(kit);
    const d = Math.hypot(cam.x - BARKAS.x, cam.z - BARKAS.z);
    if (d < NEAR_SHIP) this.shipLife(dt, d, rain);
    this.motor(motor, cam);
  }

  private attach(kit: Kit): void {
    this.kit = kit;
    this.ship = kit.ctx.createGain();
    this.ship.gain.value = SHIP_VOLUME;
    this.ship.connect(kit.sfx);
    this.motorPan = null;
  }

  // ------------------------------------------------------------ корабль

  private panner(x: number, y: number, z: number, ref: number, model: PanningModelType = 'equalpower'): PannerNode {
    const p = this.kit!.ctx.createPanner();
    p.panningModel = model;
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.2;
    p.maxDistance = 140;
    setPos(p, x, y, z);
    return p;
  }

  /** Разовый звук в точке: панорама → шина корабля */
  private at(x: number, y: number, z: number, ref: number): AudioNode {
    const p = this.panner(x, y, z, ref);
    p.connect(this.ship!);
    return p;
  }

  private shipLife(dt: number, d: number, rain: number): void {
    this.nextCreak -= dt;
    this.nextSlap -= dt;
    this.nextClink -= dt;
    this.nextGull -= dt;
    if (this.nextCreak <= 0) {
      this.nextCreak = 4 + Math.random() * 8;
      this.creak(BARKAS.stern - Math.random() * 26, 0.6 + Math.random() * 2, BARKAS.z + (Math.random() - 0.5) * 6);
    }
    if (this.nextSlap <= 0) {
      this.nextSlap = (1.4 + Math.random() * 3) * (1 - 0.4 * rain);
      const side = Math.random() < 0.5 ? -1 : 1;
      this.slap(BARKAS.stern - Math.random() * 26, BARKAS.z + side * 3.6, 0.6 + 0.6 * rain);
    }
    if (this.nextClink <= 0) {
      this.nextClink = 15 + Math.random() * 20;
      this.clink(-71.5, 0.8, BARKAS.z);
    }
    if (this.nextGull <= 0) {
      this.nextGull = 9 + Math.random() * 16;
      if (rain < 0.3 && d < 45) this.gull(BARKAS.stern - Math.random() * 20, 6 + Math.random() * 5, BARKAS.z + (Math.random() - 0.5) * 14);
    }
  }

  /** Скрип: «прилипание-срыв» — частые щелчки через узкий фильтр, высота плывёт */
  private creak(x: number, y: number, z: number): void {
    const ctx = this.kit!.ctx;
    const t = ctx.currentTime + 0.01;
    const dur = 0.4 + Math.random() * 0.6;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(18 + Math.random() * 14, t);
    o.frequency.linearRampToValueAtTime(30 + Math.random() * 30, t + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    const f0 = 480 + Math.random() * 400;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.5), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(this.at(x, y, z, 4));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Волна шлёпнула о борт: глухой бурый шум и брызги */
  private slap(x: number, z: number, k: number): void {
    const kit = this.kit!;
    const ctx = kit.ctx;
    const t = ctx.currentTime + 0.01;
    const out = this.at(x, 0, z, 5);
    this.burst(out, kit.brown, t, 0.38, 'lowpass', 520, 200, 0.5 * k);
    this.burst(out, kit.noise, t + 0.03, 0.16, 'highpass', 2400, 1800, 0.05 * k);
  }

  private burst(dest: AudioNode, buf: AudioBuffer, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number): void {
    const ctx = this.kit!.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private ping(dest: AudioNode, f: number, t: number, dur: number, gain: number): void {
    const ctx = this.kit!.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Якорная цепь звякнула на брашпиле */
  private clink(x: number, y: number, z: number): void {
    const t = this.kit!.ctx.currentTime + 0.01;
    const out = this.at(x, y, z, 3);
    this.ping(out, 2300, t, 0.14, 0.08);
    this.ping(out, 3150, t + 0.11, 0.1, 0.05);
  }

  /** Чайка над кормой: «кьяа-кьяа» */
  private gull(x: number, y: number, z: number): void {
    const ctx = this.kit!.ctx;
    const out = this.at(x, y, z, 6);
    const n = 2 + Math.floor(Math.random() * 2);
    const base = 1250 + Math.random() * 350;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + 0.01 + i * (0.26 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 0.8, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.25, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = base * 1.4;
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(bp).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.25);
    }
  }

  /** Колокол: удар и гул с негармоничными обертонами (рында — крупнее и ниже, у калитки — мелкий) */
  private bell(x: number, y: number, z: number, f0: number, len: number, gain: number): void {
    if (!this.live) return;
    const t = this.kit!.ctx.currentTime + 0.005;
    const out = this.at(x, y, z, 8);
    for (const [k, g, l] of [[1, 1, 1], [2.01, 0.5, 0.7], [2.76, 0.38, 0.55], [4.07, 0.18, 0.35], [5.43, 0.08, 0.25]] as const) this.ping(out, f0 * k, t, len * l, gain * g);
    this.burstNoise(out, t, gain);
  }

  private burstNoise(out: AudioNode, t: number, gain: number): void {
    this.burst(out, this.kit!.noise, t, 0.03, 'bandpass', 3200, 2600, gain * 0.5);
  }

  private get live(): boolean {
    return this.kit !== null && this.kit.ctx.state === 'running' && this.ship !== null;
  }

  /** Михалыч ударил в рынду */
  rynda(pos: THREE.Vector3, cam: THREE.Vector3): void {
    if (cam.distanceTo(pos) < FAR + 20) this.bell(pos.x, pos.y, pos.z, 880, 2.6, 0.2);
  }

  /** Позвонили в колокол у калитки: «дзынь-дзынь» */
  gateBell(pos: THREE.Vector3, cam: THREE.Vector3): void {
    if (!this.live || cam.distanceTo(pos) > FAR + 20) return;
    this.bell(pos.x, pos.y, pos.z, 1320, 1.4, 0.14);
    const t0 = this.kit!.ctx.currentTime;
    // второй удар — через 0,3 с (по часам звука)
    const out = this.at(pos.x, pos.y, pos.z, 8);
    for (const [k, g, l] of [[1, 1, 1], [2.01, 0.5, 0.7], [2.76, 0.38, 0.55]] as const) this.ping(out, 1320 * k, t0 + 0.32, 1.3 * l, 0.12 * g);
  }

  /** Гудок «Удалой» при отходе: короткий и длинный, «би-бииип» */
  horn(pos: THREE.Vector3, cam: THREE.Vector3): void {
    if (!this.live || cam.distanceTo(pos) > 140) return;
    const ctx = this.kit!.ctx;
    const out = this.at(pos.x, pos.y + 0.5, pos.z, 10);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    lp.connect(out);
    const t = ctx.currentTime + 0.01;
    for (const [t0, len] of [[0, 0.22], [0.34, 0.95]] as const) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + t0);
      g.gain.exponentialRampToValueAtTime(0.2, t + t0 + 0.04);
      g.gain.setValueAtTime(0.2, t + t0 + len - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + t0 + len);
      g.connect(lp);
      for (const f of [330, 415]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 12;
        o.connect(g);
        o.start(t + t0);
        o.stop(t + t0 + len + 0.05);
      }
    }
  }

  // ------------------------------------------------------------ мотор лодки: «тук-тук»

  private motor(m: { pos: THREE.Vector3; speed: number } | null, cam: THREE.Vector3): void {
    const kit = this.kit!;
    const ctx = kit.ctx;
    if (!m || cam.distanceTo(m.pos) > FERRY_FAR) {
      this.nextThump = 0;
      return;
    }
    if (!this.motorPan) {
      this.motorPan = this.panner(m.pos.x, m.pos.y, m.pos.z, 4, 'HRTF');
      this.motorPan.connect(this.ship!);
    }
    const p = this.motorPan;
    const now = ctx.currentTime;
    if (p.positionX) {
      p.positionX.setTargetAtTime(m.pos.x, now, 0.03);
      p.positionY.setTargetAtTime(m.pos.y, now, 0.03);
      p.positionZ.setTargetAtTime(m.pos.z, now, 0.03);
    } else p.setPosition(m.pos.x, m.pos.y, m.pos.z);
    // одноцилиндровый: на холостых ~4 вспышки в секунду, на ходу — до 7
    const v = Math.min(1, m.speed / 3.6);
    const rate = 4.2 + 2.8 * v;
    if (this.nextThump < now) this.nextThump = now + 0.02;
    while (this.nextThump < now + 0.25) {
      const t = this.nextThump;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(78, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 + 0.12 * v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.14);
      this.burst(p, kit.brown, t, 0.07, 'lowpass', 900, 260, 0.35 + 0.15 * v);
      this.nextThump += (1 / rate) * (0.94 + Math.random() * 0.12);
    }
  }
}

function setPos(p: PannerNode, x: number, y: number, z: number): void {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else p.setPosition(x, y, z);
}
