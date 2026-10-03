// Звуки баркаса — всё синтезом (WebAudio), ни одного файла. Баян Витька: свой вальс на 3/4 (две темы по 16 тактов,
// «умпа-па» левой рукой, мюзет — три язычка с расстройкой), три темы подряд — и Витёк отдыхает. В дождь — та же
// мелодия в миноре (ми гармонический), медленнее и тише. Звучит из-за рубки, где он сидит; дальше FAR — тишина.
// Корабль: скрип дерева, шлепки волн о борт, звяканье цепи; рында (склянки бьёт Михалыч — crew.ts), колокол у калитки,
// чайки (в дождь молчат). Лодка «Удалая»: «тук-тук» мотора (чаще на ходу) и гудок при отходе.
// Громкость баяна — один регулятор: ACCORDION_VOLUME (узел music). Пока всё идёт в шину эффектов sound.kit.
import * as THREE from 'three';
import { BARKAS } from '../../../shared/barkas.ts';
import type { Squeeze } from './crew.ts';

/** Громкость баяна — единственный регулятор музыки баркаса */
export const ACCORDION_VOLUME = 0.5;
/** В дождь баян тише во столько раз (и минор, и медленнее) */
const RAIN_QUIET = 0.6;
/** Корабельные звуки, колокола, чайки, лодка */
const SHIP_VOLUME = 0.55;
/** Дальше от баркаса (м) баян и корабль не звучат; лодку слышно до FERRY_FAR от неё */
const FAR = 95;
const NEAR_SHIP = 60;
const FERRY_FAR = 90;
/** Темп, ударов в минуту: в ясную погоду и в дождь */
const BPM_FAIR = 92;
const BPM_RAIN = 76;
/** Отдых Витька между подходами, с */
const REST: readonly [number, number] = [8, 14];
/** Сколько тем подряд до отдыха */
const SET = 3;
/** Планирование нот вперёд, с */
const AHEAD = 0.3;

export interface Kit {
  ctx: AudioContext;
  sfx: GainNode;
  noise: AudioBuffer;
  brown: AudioBuffer;
}

type Bar = ReadonlyArray<readonly [number | null, number]>;

/** Тема А: ступени (7 — тоника второй октавы), длительности в долях. Аккорды — ступени корня по тактам. */
const MEL_A: readonly Bar[] = [
  [[9, 1], [11, 1], [14, 1]], [[13, 2], [12, 1]], [[11, 1], [10, 1], [8, 1]], [[6, 3]],
  [[8, 1], [10, 1], [13, 1]], [[12, 2], [11, 1]], [[11, 1], [9, 1], [7, 1]], [[9, 3]],
  [[9, 1], [11, 1], [14, 1]], [[15, 2], [14, 1]], [[14, 1], [12, 1], [10, 1]], [[12, 3]],
  [[11, 1], [9, 1], [11, 1]], [[10, 1], [8, 1], [6, 1]], [[7, 1], [9, 1], [11, 1]], [[7, 2], [null, 1]],
];
const CH_A = [0, 0, 4, 4, 4, 4, 0, 0, 0, 0, 3, 3, 0, 4, 0, 0];
const MEL_B: readonly Bar[] = [
  [[10, 1], [12, 0.5], [11, 0.5], [10, 1]], [[9, 1], [11, 0.5], [10, 0.5], [9, 1]], [[8, 1], [10, 1], [12, 1]], [[11, 2], [9, 1]],
  [[10, 1], [12, 0.5], [11, 0.5], [10, 1]], [[9, 1], [14, 1], [11, 1]], [[13, 1], [12, 1], [10, 1]], [[8, 3]],
  [[7, 1], [9, 1], [11, 1]], [[14, 1.5], [13, 0.5], [12, 1]], [[12, 1], [10, 1], [12, 1]], [[14, 2], [12, 1]],
  [[11, 1], [9, 1], [7, 1]], [[8, 1], [10, 1], [13, 1]], [[14, 1], [11, 1], [9, 1]], [[7, 2], [null, 1]],
];
const CH_B = [3, 0, 1, 0, 3, 0, 4, 4, 0, 5, 3, 3, 0, 4, 0, 0];
const THEMES = [[MEL_A, CH_A], [MEL_B, CH_B], [MEL_A, CH_A]] as const;
/** Лады: соль мажор и ми гармонический минор (полутоны ступеней) и их тоника (нота «ступень 0»), Гц */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 11];
const G3 = 196;
const E3 = 164.81;

/** Событие темы: доля от начала, длительность в долях, ступень; голос — мелодия, бас, аккорд, «вздох» мехов */
interface Ev {
  at: number;
  len: number;
  deg: number;
  voice: 0 | 1 | 2 | 3;
}

function theme(mel: readonly Bar[], ch: readonly number[]): Ev[] {
  const out: Ev[] = [];
  for (let bar = 0; bar < mel.length; bar++) {
    const b0 = bar * 3;
    let at = b0;
    for (const [deg, len] of mel[bar]) {
      if (deg !== null) out.push({ at, len, deg, voice: 0 });
      at += len;
    }
    // левая рука: бас на раз (повтор аккорда — квинта), аккорд на два и три
    const r = ch[bar];
    const again = bar > 0 && ch[bar - 1] === r;
    const bass = again ? r + 4 - 14 : r <= 3 ? r - 7 : r - 14;
    out.push({ at: b0, len: 0.9, deg: bass, voice: 1 });
    out.push({ at: b0 + 1, len: 0.45, deg: r, voice: 2 });
    out.push({ at: b0 + 2, len: 0.45, deg: r, voice: 2 });
    // меха меняют ход каждые два такта — короткий провал громкости
    if (bar > 0 && bar % 2 === 0) out.push({ at: b0 - 0.04, len: 0.08, deg: 0, voice: 3 });
  }
  return out.sort((a, b) => a.at - b.at);
}

const PARTS = THEMES.map(([m, c]) => theme(m, c));

function freq(deg: number, minor: boolean): number {
  const steps = minor ? MINOR : MAJOR;
  const o = Math.floor(deg / 7);
  const s = steps[((deg % 7) + 7) % 7];
  return (minor ? E3 : G3) * Math.pow(2, o + s / 12);
}

interface Phrase {
  start: number;
  spb: number;
  minor: boolean;
  events: Ev[];
  next: number;
  end: number;
}

export class BarkasAudio {
  private kit: Kit | null = null;
  /** Громкость баяна (ACCORDION_VOLUME, в дождь тише) → меха (провалы на смене хода) → панорама у Витька */
  private music: GainNode | null = null;
  private bellows: GainNode | null = null;
  private musicPan: PannerNode | null = null;
  private ship: GainNode | null = null;
  private motorPan: PannerNode | null = null;
  /** Песенные часы (с): идут по звуку, а без него — по кадрам (Витёк играет и в тишине меню) */
  private st = 0;
  private base: number | null = null;
  private cur: Phrase | null = null;
  private restUntil = 3;
  private played = 0;
  private nextCreak = 4;
  private nextSlap = 1;
  private nextClink = 18;
  private nextGull = 6;
  private nextThump = 0;
  private musicSet = -1;
  private readonly vityok: THREE.Vector3;
  private readonly sq: Squeeze = { playing: false, bellows: 0, beat: 0 };

  constructor(vityok: THREE.Vector3) {
    this.vityok = vityok.clone();
  }

  /** Что сейчас с баяном (для рук Витька) */
  get squeeze(): Squeeze {
    return this.sq;
  }

  /**
   * Раз в кадр. kit — звук (null — ещё не разрешён: музыка идёт «про себя»), cam — слушатель, rain 0…1,
   * motor — мотор лодки (где и ход, м/с; null — заглушен).
   */
  update(dt: number, kit: Kit | null, cam: THREE.Vector3, rain: number, motor: { pos: THREE.Vector3; speed: number } | null): void {
    const live = kit !== null && kit.ctx.state === 'running';
    if (live && this.kit?.ctx !== kit!.ctx) this.attach(kit!);
    if (live) {
      if (this.base === null) this.base = kit!.ctx.currentTime - this.st;
      this.st = kit!.ctx.currentTime - this.base;
    } else {
      this.base = null;
      this.st += Math.min(dt, 0.1);
    }
    const d = Math.hypot(cam.x - BARKAS.x, cam.z - BARKAS.z);
    const audible = live && d < FAR;
    const vol = ACCORDION_VOLUME * (1 - (1 - RAIN_QUIET) * rain);
    if (live && this.music && Math.abs(vol - this.musicSet) > 0.005) {
      this.musicSet = vol;
      this.music.gain.setTargetAtTime(vol, kit!.ctx.currentTime, 0.5);
    }
    this.conduct(audible, rain);
    this.squeezeNow();
    if (!live) return;
    if (d < NEAR_SHIP) this.shipLife(dt, d, rain);
    this.motor(motor, cam);
  }

  // ------------------------------------------------------------ баян

  private attach(kit: Kit): void {
    this.kit = kit;
    const ctx = kit.ctx;
    this.music = ctx.createGain();
    this.music.gain.value = ACCORDION_VOLUME;
    this.bellows = ctx.createGain();
    this.musicPan = this.panner(this.vityok.x, this.vityok.y + 0.6, this.vityok.z, 6, 'equalpower');
    this.bellows.connect(this.music).connect(this.musicPan).connect(kit.sfx);
    this.ship = ctx.createGain();
    this.ship.gain.value = SHIP_VOLUME;
    this.ship.connect(kit.sfx);
    this.motorPan = null;
    this.musicSet = -1;
  }

  /** Для отладки: что сейчас играет Витёк (минор — в дождь) */
  get tune(): { minor: boolean; bpm: number } | null {
    return this.cur ? { minor: this.cur.minor, bpm: Math.round(60 / this.cur.spb) } : null;
  }

  /** Дирижёр: темы одна за другой по песенным часам, нот вперёд на AHEAD; играет вслух, если audible. */
  private conduct(audible: boolean, rain: number): void {
    const st = this.st;
    for (let guard = 0; guard < 200; guard++) {
      if (!this.cur) {
        if (st < this.restUntil - AHEAD) return;
        const minor = rain > 0.5;
        const events = PARTS[this.played % PARTS.length];
        const spb = 60 / (minor ? BPM_RAIN : BPM_FAIR);
        const start = Math.max(this.restUntil, st);
        this.cur = { start, spb, minor, events, next: 0, end: start + 48 * spb };
      }
      const p = this.cur;
      const ev = p.events[p.next];
      if (!ev) {
        if (st < p.end - AHEAD) return;
        this.played++;
        this.restUntil = this.played % SET === 0 ? p.end + REST[0] + Math.random() * (REST[1] - REST[0]) : p.end;
        this.cur = null;
        continue;
      }
      const at = p.start + ev.at * p.spb;
      if (at > st + AHEAD) return;
      p.next++;
      if (audible && at >= st - 0.05) this.note(ev, p, at);
    }
  }

  private squeezeNow(): void {
    const p = this.cur;
    const sq = this.sq;
    if (!p || this.st < p.start || this.st >= p.end) {
      sq.playing = false;
      return;
    }
    const beats = (this.st - p.start) / p.spb;
    sq.playing = true;
    sq.beat = beats % 1;
    sq.bellows = 0.5 - 0.5 * Math.cos((2 * Math.PI * beats) / 12);
  }

  private note(ev: Ev, p: Phrase, at: number): void {
    const kit = this.kit!;
    const t = this.base! + at;
    const dur = ev.len * p.spb;
    if (ev.voice === 3) {
      const g = this.bellows!.gain;
      g.setTargetAtTime(0.72, t, 0.015);
      g.setTargetAtTime(1, t + dur, 0.03);
      return;
    }
    const f = freq(ev.deg, p.minor);
    if (ev.voice === 0) this.reed(f, t, dur * 0.94, 0.11, 2600, [-8, 0, 8]);
    else if (ev.voice === 1) this.reed(f, t, dur * 0.8, 0.1, 700, [0, 4]);
    else {
      // аккорд: трезвучие от корня, всё в пределах малой и первой октав
      for (const k of [0, 2, 4]) {
        let deg = ev.deg + k;
        if (deg > 8) deg -= 7;
        this.reed(freq(deg, p.minor), t, dur, 0.032, 1500, [0, 6]);
      }
    }
    void kit;
  }

  /** Язычок баяна: пила через фильтр, несколько расстроенных — «мюзет» */
  private reed(f: number, t: number, dur: number, gain: number, bright: number, detune: readonly number[]): void {
    const ctx = this.kit!.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.025);
    g.gain.setTargetAtTime(gain * 0.78, t + 0.03, 0.18);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.04);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = bright;
    lp.Q.value = 0.7;
    lp.connect(g).connect(this.bellows!);
    for (const det of detune) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.3);
    }
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
