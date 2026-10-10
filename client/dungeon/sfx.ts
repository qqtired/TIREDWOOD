// Звуки «Подземелья» (соло, вид сверху, сотни врагов) — синтез на лету, без файлов: уютно-подземные (дерево, камень,
// стекло фонаря, варенье «шлёп» вместо крови). Свои звуки сцены через sound.kit (как client/fight/sfx.ts): шины
// sfx/amb/ui, шумы noise/brown. Позиция — только стерео (pan −1…1), без HRTF: врагов сотни.
//
// Защита от каши (враги бьются сотнями):
//  - на каждый вид звука свой минимальный интервал (hit 35 мс, kill 45 мс, gem 40 мс, оружие 60–120 мс и т. д.);
//  - общий бюджет разовых голосов: не больше MAX_VOICES (24) одновременно, лишние молча не играют;
//    важные (уровень, босс, смерть, взрывы) могут выйти за предел на VIP_EXTRA;
//  - в плотной серии одного и того же звука громкость слегка падает (до 45 %);
//  - интервалы и голоса считаются по настенным часам (performance.now), а не по ctx.currentTime: в фоновой вкладке
//    currentTime может стоять — тогда звуки не копятся в очереди, а пропускаются.
// Громкость: весь режим идёт через свои шины (MODE_VOL — тише общей громкости игры, владелец: «потише»); в паузе
// режима звук можно выключить целиком и отдельно — «динь» опыта (prefs.ts, хранится в браузере).
import type { Sound } from '../audio.ts';
import { dgPrefs, onDgPrefs } from './prefs.ts';

type Kit = NonNullable<Sound['kit']>;
type Bus = 'sfx' | 'ui' | 'amb';

interface V {
  k: Kit;
  /** Куда подключать звук голоса: громкость × стерео → шина */
  d: GainNode;
}

interface Gate {
  /** Когда играли в прошлый раз, с (настенные часы); −1 — ещё не играли */
  t: number;
  /** Плотность серии: сколько таких звуков «висит» в последних ~0,5 с */
  dens: number;
}

interface Hum {
  ctx: AudioContext;
  g: GainNode;
  t0: number;
  srcs: AudioScheduledSourceNode[];
}

interface Bed {
  ctx: AudioContext;
  out: GainNode;
  t0: number;
  drone: GainNode;
  lp: BiquadFilterNode;
  hi: GainNode;
  sines: OscillatorNode[];
  srcs: AudioScheduledSourceNode[];
}

/** Не больше стольких разовых звуков одновременно (лишние не играют) и запас для важных */
const MAX_VOICES = 24;
const VIP_EXTRA = 8;
/** Громкость режима по шинам относительно общей громкости игры */
const MODE_VOL: Record<Bus, number> = { sfx: 0.55, ui: 0.75, amb: 0.65 };
/** Пентатоника (полутонов от основного тона) — осколки «поют» по ступеням */
const PENTA = [0, 2, 4, 7, 9];
/** Серия осколков поднимается не выше стольких ступеней (дальше — по кругу верхних, без писка) */
const GEM_MAX_STEP = 6;
/** Без подборов столько секунд — серия осколков начинается заново */
const GEM_SERIES_GAP = 0.6;
/** Осколков подряд не чаще раза в столько секунд; в длинной серии (магнит) — ещё реже */
const GEM_GAP = 0.085;
/** Заряд Q: нарастание гула, с, и его громкость */
const HUM_RISE = 1;
const HUM_LEVEL = 0.2;
const AMB_FADE_IN = 1;

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const vary = (f: number, k = 0.08): number => f * (1 + (Math.random() * 2 - 1) * k);
const semis = (base: number, s: number): number => base * 2 ** (s / 12);
const pent = (step: number): number => {
  const s = Math.max(0, Math.floor(step));
  return PENTA[s % 5] + 12 * Math.floor(s / 5);
};
const clamp01 = (x: number): number => (x > 1 ? 1 : x > 0 ? x : 0);
/** Уровень экспоненциальной подачи lo→hi за dur секунд от t0 в момент t */
const expAt = (t: number, t0: number, dur: number, lo: number, hi: number): number => lo * (hi / lo) ** clamp01((t - t0) / dur);

export class DungeonSfx {
  private readonly sound: Sound;
  private readonly gates = new Map<string, Gate>();
  /** Когда (настенные часы) заканчиваются играющие сейчас разовые звуки */
  private readonly ends: number[] = [];
  private lastCt = -1;
  private lastWall = 0;
  private gemAt = -10;
  private gemRun = 0;
  private tickFlip = false;
  private hum: Hum | null = null;
  private bed: Bed | null = null;
  private wantAmb = false;
  private tension = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextDrip = 0;
  private buses: { ctx: AudioContext; sfx: GainNode; ui: GainNode; amb: GainNode } | null = null;

  constructor(sound: Sound) {
    this.sound = sound;
    onDgPrefs((p) => this.applyMute(p.sound));
  }

  /** Шина режима (громкость режима и выключатель) поверх общей шины игры */
  private bus(k: Kit, b: Bus): GainNode {
    if (!this.buses || this.buses.ctx !== k.ctx) {
      const on = dgPrefs().sound;
      const mk = (name: Bus): GainNode => {
        const g = k.ctx.createGain();
        g.gain.value = on ? MODE_VOL[name] : 0;
        g.connect(k[name]);
        return g;
      };
      this.buses = { ctx: k.ctx, sfx: mk('sfx'), ui: mk('ui'), amb: mk('amb') };
    }
    return this.buses[b];
  }

  /** Выключить/включить весь звук режима — плавно, без щелчка */
  private applyMute(on: boolean): void {
    const b = this.buses;
    if (!on) this.stopHum(0.06);
    if (!b) return;
    const t = b.ctx.currentTime;
    for (const name of ['sfx', 'ui', 'amb'] as const) {
      b[name].gain.cancelScheduledValues(t);
      b[name].gain.setTargetAtTime(on ? MODE_VOL[name] : 0, t, 0.08);
    }
  }

  // ------------------------------------------------------------ кирпичики

  /** Контекст «живой»: его время идёт (в фоновой вкладке currentTime может стоять — тогда звуки пропускаем) */
  private alive(k: Kit): boolean {
    const w = performance.now() / 1000;
    const c = k.ctx.currentTime;
    if (c !== this.lastCt) {
      this.lastCt = c;
      this.lastWall = w;
      return true;
    }
    return w - this.lastWall < 0.25;
  }

  /**
   * Допуск разового звука: интервал по ключу, бюджет голосов, падение громкости в плотной серии.
   * null — не играть. vip — важный звук: бюджет для него шире. Всё считается по настенным часам.
   */
  private v(key: string, gap: number, dur: number, pan = 0, gain = 1, vip = false, bus: Bus = 'sfx'): V | null {
    if (gain <= 0 || !dgPrefs().sound) return null;
    const now = performance.now() / 1000;
    let g = this.gates.get(key);
    if (!g) this.gates.set(key, (g = { t: -1, dens: 0 }));
    const dt = now - g.t;
    if (g.t >= 0 && dt < gap) return null;
    const k = this.sound.kit;
    if (!k || !this.alive(k)) return null;
    const ends = this.ends;
    let w = 0;
    for (let i = 0; i < ends.length; i++) if (ends[i] > now) ends[w++] = ends[i];
    ends.length = w;
    if (w >= MAX_VOICES + (vip ? VIP_EXTRA : 0)) return null;
    ends.push(now + dur + 0.05);
    g.dens = g.t < 0 ? 1 : g.dens * Math.exp(-dt / 0.5) + 1;
    g.t = now;
    const vol = Math.max(0.45, 1 - 0.06 * (g.dens - 1)) * Math.min(1, gain);
    return { k, d: this.out(k, pan, vol, bus) };
  }

  private out(k: Kit, pan: number, vol: number, bus: Bus): GainNode {
    const g = k.ctx.createGain();
    g.gain.value = vol;
    const dest = this.bus(k, bus);
    if (Math.abs(pan) > 0.02 && typeof k.ctx.createStereoPanner === 'function') {
      const p = k.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(dest);
    } else {
      g.connect(dest);
    }
    return g;
  }

  /** Тон: f0→f1 за dur; attack — нарастание; lp — срез сверху (0 — без); sus — сколько держать громкость, потом спад */
  private tone(k: Kit, dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, gain: number, when = 0, attack = 0.003, lp = 0, sus = 0): void {
    if (gain <= 0.0001) return;
    const ctx = k.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    if (sus > 0) g.gain.setValueAtTime(gain, t + attack + sus);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (lp > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f).connect(g).connect(dest);
    } else {
      o.connect(g).connect(dest);
    }
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(k: Kit, dest: AudioNode, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, when = 0, attack = 0.002, brown = false): void {
    if (gain <= 0.0001) return;
    const ctx = k.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = brown ? k.brown : k.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
  }

  /** Стекло фонаря / колокольчик: основной тон и негармонические обертоны, которые гаснут быстрее */
  private bell(k: Kit, dest: AudioNode, f: number, gain: number, dur: number, when = 0): void {
    this.tone(k, dest, f, f, dur, 'sine', gain, when, 0.002);
    this.tone(k, dest, f * 2.76, f * 2.76, dur * 0.5, 'sine', gain * 0.4, when, 0.002);
    this.tone(k, dest, f * 5.4, f * 5.4, dur * 0.28, 'sine', gain * 0.18, when, 0.002);
  }

  /** Россыпь коротких щелчков (камень, искры, угли) в окне span секунд */
  private ticks(k: Kit, dest: AudioNode, n: number, span: number, lo: number, hi: number, gain: number, when = 0, type: BiquadFilterType = 'bandpass'): void {
    for (let i = 0; i < n; i++) {
      const f = rnd(lo, hi);
      this.noise(k, dest, rnd(0.012, 0.03), type, f, f * 0.7, 3, gain * rnd(0.5, 1), when + Math.random() * span, 0.001);
    }
  }

  /** Рык: пила с дрожью громкости (rate Гц), через фильтр */
  private growl(k: Kit, dest: AudioNode, f0: number, f1: number, dur: number, gain: number, rate: number, lp: number, when = 0, attack = 0.2): void {
    const ctx = k.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    f.Q.value = 2;
    const am = ctx.createGain();
    am.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg).connect(am.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(am).connect(env).connect(dest);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.03);
    lfo.stop(t + dur + 0.03);
  }

  // ------------------------------------------------------------ враги

  /** Попадание по врагу: мягкий «тук/шлёп». big — крупное попадание (крит, тяжёлое оружие). */
  hit(pan = 0, big = false, gain = 1): void {
    const v = big ? this.v('hitBig', 0.07, 0.25, pan, gain * 0.9) : this.v('hit', 0.035, 0.18, pan, gain * 0.8);
    if (!v) return;
    const { k, d } = v;
    if (big) {
      const f = vary(140);
      this.tone(k, d, f * 1.2, f * 0.4, 0.16, 'sine', 0.45, 0, 0.002);
      this.noise(k, d, 0.07, 'bandpass', vary(900), 450, 1.2, 0.26, 0, 0.002);
      this.noise(k, d, 0.16, 'lowpass', 500, 100, 1, 0.3, 0.005, 0.003, true);
      this.tone(k, d, f * 1.9, f, 0.09, 'triangle', 0.1, 0.01);
      return;
    }
    const f = vary(190);
    this.tone(k, d, f, f * 0.45, 0.1, 'sine', 0.3, 0, 0.002);
    this.noise(k, d, 0.05, 'bandpass', vary(1100), 600, 1.4, 0.16, 0, 0.002);
    this.noise(k, d, 0.08, 'lowpass', 420, 130, 1, 0.16, 0.005, 0.002, true);
  }

  /** Враг лопнул вареньем: «блюп» и мокрый шлёп. */
  kill(pan = 0, gain = 1): void {
    const v = this.v('kill', 0.045, 0.22, pan, gain * 0.85);
    if (!v) return;
    const { k, d } = v;
    const f = vary(300);
    this.tone(k, d, f * 0.8, f * 1.9, 0.07, 'sine', 0.22, 0, 0.004);
    this.noise(k, d, 0.13, 'bandpass', 1800, 400, 0.9, 0.26, 0.02, 0.002);
    this.tone(k, d, 170, 60, 0.12, 'sine', 0.26, 0.02);
    this.noise(k, d, 0.12, 'lowpass', 500, 120, 1, 0.2, 0.03, 0.003, true);
  }

  /** Звон по щиту жука: стеклянный «тинь» с деревянным корпусом. */
  shieldBlock(pan = 0, gain = 1): void {
    const v = this.v('shield', 0.06, 0.3, pan, gain * 0.8);
    if (!v) return;
    const { k, d } = v;
    this.bell(k, d, vary(1250), 0.14, 0.22);
    this.noise(k, d, 0.025, 'highpass', 3500, 3500, 0.7, 0.12, 0, 0.001);
    this.tone(k, d, 300, 200, 0.06, 'triangle', 0.18);
  }

  // ------------------------------------------------------------ осколки и интерфейс

  /**
   * Подбор осколка: «динь». step — ступень пентатоники (0…10); не передан — класс сам считает серию подборов
   * подряд (сбрасывается через 0,6 с без подборов).
   */
  gem(step?: number, gain = 1): void {
    if (!dgPrefs().xp) return;
    const now = performance.now() / 1000;
    if (now - this.gemAt > GEM_SERIES_GAP) this.gemRun = 0;
    this.gemAt = now;
    // несколько осколков за кадр — один звук; длинная серия (магнит, конец волны) — реже и тише, без «пулемёта»
    const run = this.gemRun;
    const v = this.v('gem', GEM_GAP + Math.min(0.09, run * 0.006), 0.3, 0, gain * Math.max(0.45, 1 - run * 0.03));
    if (!v) return;
    const { k, d } = v;
    this.gemRun++;
    const s = Math.min(GEM_MAX_STEP, step ?? run);
    const f = vary(semis(587.33, pent(s)), 0.015);
    // мягкое стеклянное «пинь»: чистый тон с плавной атакой и тихая октава, без щелчка шума
    this.tone(k, d, f, f * 0.995, 0.22, 'sine', 0.07, 0, 0.006);
    this.tone(k, d, f * 2, f * 2, 0.09, 'sine', 0.015, 0, 0.006);
  }

  /** Новый уровень: тёплое мажорное арпеджио с колокольчиками. */
  level(gain = 1): void {
    const v = this.v('level', 0.5, 1.6, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    [0, 4, 7, 12, 16].forEach((s, i) => this.bell(k, d, semis(523.25, s), 0.15, i === 4 ? 1.3 : 0.9, i * 0.09 + (i === 4 ? 0.04 : 0)));
    this.tone(k, d, 261.6, 261.6, 1, 'sine', 0.1, 0, 0.05, 0, 0.35);
    this.tone(k, d, 392, 392, 1, 'sine', 0.07, 0.05, 0.06, 0, 0.3);
    this.tone(k, d, 150, 90, 0.08, 'triangle', 0.2);
  }

  /** Выбрана карточка: деревянный тук и чистый колокольчик вверх. */
  cardPick(gain = 1): void {
    const v = this.v('cardPick', 0.12, 0.7, 0, gain, true, 'ui');
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 392, 587, 0.12, 'triangle', 0.18, 0, 0.004);
    this.noise(k, d, 0.03, 'bandpass', 2200, 1500, 2, 0.12);
    this.bell(k, d, 880, 0.1, 0.5, 0.05);
    this.bell(k, d, 1319, 0.07, 0.5, 0.11);
  }

  /** Наведение на карточку: еле слышный тик. */
  cardHover(gain = 1): void {
    const v = this.v('cardHover', 0.05, 0.08, 0, gain, false, 'ui');
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 1320, 1568, 0.05, 'sine', 0.05, 0, 0.003);
    this.noise(k, d, 0.015, 'bandpass', 2500, 2000, 2, 0.03);
  }

  /** Переброс карточек: деревянная трещотка и блик. */
  reroll(gain = 1): void {
    const v = this.v('reroll', 0.15, 0.5, 0, gain, true, 'ui');
    if (!v) return;
    const { k, d } = v;
    for (let i = 0; i < 5; i++) {
      const f = rnd(1500, 3500);
      this.noise(k, d, 0.02, 'bandpass', f, f * 0.8, 4, 0.1, i * 0.05 + rnd(0, 0.01), 0.001);
      this.tone(k, d, rnd(420, 640), 330, 0.025, 'triangle', 0.05, i * 0.05, 0.001);
    }
    this.tone(k, d, 300, 700, 0.25, 'sine', 0.05, 0, 0.05);
    this.bell(k, d, 1397, 0.07, 0.3, 0.26);
  }

  /** Кнопка интерфейса: короткий деревянный щелчок. */
  uiClick(gain = 1): void {
    const v = this.v('uiClick', 0.04, 0.1, 0, gain, true, 'ui');
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 620, 380, 0.05, 'triangle', 0.15, 0, 0.002);
    this.noise(k, d, 0.02, 'bandpass', 2200, 1600, 2, 0.12, 0, 0.001);
  }

  // ------------------------------------------------------------ герой: рывок и удар Q

  /** Рывок: свист воздуха. */
  dash(gain = 1): void {
    const v = this.v('dash', 0.15, 0.3, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.noise(k, d, 0.24, 'bandpass', 350, 2600, 1.4, 0.3, 0, 0.05);
    this.noise(k, d, 0.18, 'highpass', 3000, 1500, 0.8, 0.05, 0.03, 0.04);
    this.tone(k, d, 200, 120, 0.14, 'sine', 0.12, 0, 0.01);
  }

  /** Рывок снова готов: щелчок-блик. */
  dashReady(gain = 1): void {
    const v = this.v('dashReady', 0.2, 0.3, 0, gain * 0.8);
    if (!v) return;
    const { k, d } = v;
    this.noise(k, d, 0.012, 'bandpass', 3500, 3000, 2, 0.1, 0, 0.001);
    this.bell(k, d, 2349, 0.08, 0.18, 0.01);
    this.tone(k, d, 3136, 3136, 0.1, 'sine', 0.04, 0.05, 0.002);
  }

  /**
   * Заряд удара Q: гул, нарастающий за 1 с. Звать каждый кадр можно: пока on — гул держится петлёй,
   * при off плавно затухает.
   */
  qCharge(on: boolean): void {
    if (!on) {
      this.stopHum(0.06);
      return;
    }
    if (this.hum || !dgPrefs().sound) return;
    const k = this.sound.kit;
    if (!k || !this.alive(k)) return;
    this.hum = this.makeHum(k);
  }

  private makeHum(k: Kit): Hum {
    const ctx = k.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(HUM_LEVEL, t + HUM_RISE);
    g.connect(this.bus(k, 'sfx'));
    const srcs: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, f0: number, f1: number, level: number, lp = 0): void => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + HUM_RISE);
      const og = ctx.createGain();
      og.gain.value = level;
      if (lp > 0) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(lp * 0.4, t);
        f.frequency.exponentialRampToValueAtTime(lp, t + HUM_RISE);
        o.connect(f).connect(og).connect(g);
      } else {
        o.connect(og).connect(g);
      }
      o.start(t);
      srcs.push(o);
    };
    osc('sine', 60, 150, 0.9);
    osc('sawtooth', 60.5, 151, 0.35, 1100);
    osc('sine', 120, 300, 0.25);
    // коричневый шум: нарастающий рокот
    const n = ctx.createBufferSource();
    n.buffer = k.brown;
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(250, t);
    nf.frequency.exponentialRampToValueAtTime(900, t + HUM_RISE);
    const ng = ctx.createGain();
    ng.gain.value = 0.4;
    n.connect(nf).connect(ng).connect(g);
    n.start(t, Math.random() * 1.5);
    srcs.push(n);
    // стекло фонаря звенит выше и выше
    const gl = ctx.createOscillator();
    gl.frequency.setValueAtTime(1400, t);
    gl.frequency.exponentialRampToValueAtTime(2400, t + HUM_RISE);
    const glg = ctx.createGain();
    glg.gain.setValueAtTime(0.0001, t);
    glg.gain.exponentialRampToValueAtTime(0.16, t + HUM_RISE);
    gl.connect(glg).connect(g);
    gl.start(t);
    srcs.push(gl);
    return { ctx, g, t0: t, srcs };
  }

  private stopHum(tc: number): void {
    const h = this.hum;
    this.hum = null;
    if (!h) return;
    const t = h.ctx.currentTime;
    h.g.gain.cancelScheduledValues(t);
    h.g.gain.setValueAtTime(expAt(t, h.t0, HUM_RISE, 0.0001, HUM_LEVEL), t);
    h.g.gain.setTargetAtTime(0.0001, t, tc);
    for (const s of h.srcs) s.stop(t + tc * 6 + 0.05);
  }

  /** Заряд полон: «дзынь» стекла фонаря. */
  qFull(gain = 1): void {
    const v = this.v('qFull', 0.3, 1, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.bell(k, d, 1568, 0.18, 0.9);
    this.bell(k, d, 2349, 0.08, 0.6, 0.03);
    this.tone(k, d, 392, 392, 0.3, 'sine', 0.1, 0, 0.01);
  }

  /** Лёгкий удар фонарём в землю (неполный заряд): глухой стук и звонкая искра стекла. */
  qTap(pan = 0, gain = 1): void {
    const v = this.v('qTap', 0.1, 0.4, pan, gain);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 160, 60, 0.2, 'sine', 0.55, 0, 0.002);
    this.noise(k, d, 0.15, 'lowpass', 900, 150, 1, 0.45, 0, 0.002, true);
    this.noise(k, d, 0.04, 'bandpass', 1800, 900, 2, 0.2);
    this.bell(k, d, 1760, 0.05, 0.15, 0.01);
  }

  /** Полный удар Q: глубокий гул, треск камня и осыпь. */
  qBlast(gain = 1): void {
    const v = this.v('qBlast', 0.3, 1.7, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 95, 28, 0.9, 'sine', 0.95, 0, 0.004);
    this.tone(k, d, 55, 25, 1.2, 'triangle', 0.5, 0, 0.01);
    this.noise(k, d, 1, 'lowpass', 900, 70, 1, 0.9, 0, 0.005, true);
    this.noise(k, d, 1.5, 'lowpass', 250, 60, 1, 0.4, 0.2, 0.1, true);
    let w = 0;
    for (let i = 0; i < 4; i++) {
      w += rnd(0.015, 0.05);
      const f = rnd(2200, 3500);
      this.noise(k, d, rnd(0.05, 0.09), 'highpass', f, 900, 0.8, 0.4, w, 0.001);
    }
    this.ticks(k, d, 6, 0.5, 600, 2200, 0.12, 0.15);
    this.bell(k, d, 1480, 0.05, 0.4, 0.02);
  }

  /** Удар Q снова готов: два нежных звонких «пинь». */
  qReady(gain = 1): void {
    const v = this.v('qReady', 0.5, 0.5, 0, gain * 0.8);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 880, 1175, 0.1, 'triangle', 0.1, 0, 0.004);
    this.bell(k, d, 1760, 0.09, 0.35, 0.07);
  }

  // ------------------------------------------------------------ герой: урон и смерть

  /** Герой получил удар: глухой стук, не страшный. */
  hurt(gain = 1): void {
    const v = this.v('hurt', 0.12, 0.4, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 130, 65, 0.24, 'sine', 0.6, 0, 0.003);
    this.noise(k, d, 0.22, 'lowpass', 600, 120, 1, 0.5, 0, 0.003, true);
    this.noise(k, d, 0.08, 'bandpass', 500, 300, 2, 0.28);
  }

  /** Фонарь гаснет: нисходящий тон, звон стекла, последний «пф». */
  death(gain = 1): void {
    const v = this.v('death', 1, 2.3, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 100, 50, 0.3, 'sine', 0.45, 0, 0.003);
    this.tone(k, d, 520, 95, 1.3, 'triangle', 0.28, 0, 0.01, 1500);
    this.tone(k, d, 780, 140, 1.3, 'sine', 0.12, 0, 0.01);
    this.noise(k, d, 0.5, 'bandpass', 3000, 1200, 1.2, 0.06, 0, 0.05);
    for (let i = 0; i < 6; i++) this.bell(k, d, rnd(2500, 5500), 0.05, 0.25, 0.05 + i * rnd(0.07, 0.1));
    this.noise(k, d, 0.35, 'lowpass', 800, 200, 1, 0.25, 1.1, 0.02, true);
  }

  // ------------------------------------------------------------ элиты и боссы

  /** Рог элиты: две низкие ноты (кварта вверх). */
  eliteHorn(gain = 1): void {
    const v = this.v('eliteHorn', 1, 1.4, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    for (const [f0, f1, dur, when] of [[138, 147, 0.34, 0], [205, 220, 0.85, 0.28]] as const) {
      const sus = dur * 0.55;
      this.tone(k, d, f0, f1, dur, 'sawtooth', 0.2, when, 0.06, 1000, sus);
      this.tone(k, d, f0 * 1.006, f1 * 1.006, dur, 'square', 0.06, when, 0.08, 700, sus);
      this.tone(k, d, f0 / 2, f1 / 2, dur, 'sine', 0.18, when, 0.06, 0, sus);
    }
  }

  /** Рёв босса: низкий шум через «рот» и дрожащий рык. */
  bossRoar(gain = 1): void {
    const v = this.v('bossRoar', 2, 2.4, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 70, 35, 0.5, 'sine', 0.6, 0, 0.01);
    this.noise(k, d, 0.8, 'lowpass', 200, 700, 1, 0.7, 0, 0.3, true);
    this.noise(k, d, 1.4, 'lowpass', 700, 150, 1, 0.7, 0.6, 0.05, true);
    this.growl(k, d, 78, 40, 1.8, 0.4, 26, 380, 0.05, 0.25);
    this.noise(k, d, 1.3, 'bandpass', 450, 300, 4, 0.25, 0.1, 0.25);
    this.noise(k, d, 1.1, 'bandpass', 900, 600, 5, 0.12, 0.15, 0.25);
  }

  /** Босс зарывается: гул и грохот под землёй. */
  bossBurrow(gain = 1): void {
    const v = this.v('bossBurrow', 1.5, 2, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.noise(k, d, 1.7, 'lowpass', 220, 80, 1, 0.9, 0, 0.3, true);
    this.tone(k, d, 45, 28, 1.6, 'sine', 0.6, 0, 0.2);
    this.tone(k, d, 90, 50, 1.3, 'triangle', 0.18, 0.1, 0.2, 300);
    this.ticks(k, d, 8, 1.4, 250, 700, 0.15, 0.1);
  }

  /** Босс вылетает: удар-выброс камня, осыпь. */
  bossEmerge(gain = 1): void {
    const v = this.v('bossEmerge', 1, 1.5, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 80, 28, 0.6, 'sine', 1, 0, 0.004);
    this.noise(k, d, 0.7, 'lowpass', 1500, 100, 1, 0.9, 0, 0.003, true);
    let w = 0;
    for (let i = 0; i < 4; i++) {
      w += rnd(0.015, 0.05);
      this.noise(k, d, rnd(0.05, 0.1), 'highpass', rnd(2500, 3500), 1000, 0.8, 0.4, w, 0.001);
    }
    this.ticks(k, d, 6, 0.5, 1200, 2500, 0.1, 0.1);
    this.noise(k, d, 1, 'lowpass', 300, 70, 1, 0.4, 0.15, 0.05, true);
  }

  /** Плевок вареньем. */
  spit(pan = 0, gain = 1): void {
    const v = this.v('spit', 0.08, 0.2, pan, gain * 0.9);
    if (!v) return;
    const { k, d } = v;
    this.noise(k, d, 0.1, 'bandpass', 1100, 2800, 1.2, 0.22, 0, 0.008);
    this.tone(k, d, 350, 900, 0.07, 'sine', 0.14, 0, 0.004);
    this.noise(k, d, 0.1, 'lowpass', 1500, 500, 1, 0.08, 0.02);
  }

  /** Сгусток варенья упал: «шлёп». */
  splat(pan = 0, gain = 1): void {
    const v = this.v('splat', 0.07, 0.25, pan, gain * 0.9);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 220, 70, 0.11, 'sine', 0.4, 0, 0.002);
    this.noise(k, d, 0.14, 'bandpass', 1500, 350, 1, 0.3, 0, 0.002);
    this.tone(k, d, 420, 240, 0.07, 'sine', 0.12, 0.035, 0.004);
    this.noise(k, d, 0.1, 'lowpass', 400, 100, 1, 0.25, 0.01, 0.003, true);
  }

  // ------------------------------------------------------------ оружие

  /** Вспышка фонаря: мягкий «вжух» со стеклом. */
  lantern(pan = 0, gain = 1): void {
    const v = this.v('lantern', 0.09, 0.35, pan, gain * 0.85);
    if (!v) return;
    const { k, d } = v;
    this.noise(k, d, 0.22, 'bandpass', 600, 2400, 1, 0.18, 0, 0.05);
    this.tone(k, d, 220, 330, 0.15, 'sine', 0.1, 0, 0.02);
    this.bell(k, d, vary(1760), 0.05, 0.25, 0.02);
  }

  /** Уголёк: тихое «фуф» и потрескивание. */
  ember(pan = 0, gain = 1): void {
    const v = this.v('ember', 0.09, 0.3, pan, gain * 0.85);
    if (!v) return;
    const { k, d } = v;
    this.noise(k, d, 0.2, 'bandpass', 1000, 450, 1.2, 0.16, 0, 0.03);
    this.tone(k, d, 260, 180, 0.1, 'sine', 0.06, 0, 0.01);
    this.ticks(k, d, 2, 0.12, 3500, 6000, 0.08, 0.02);
  }

  /** Кирка: свист вращения (вверх и вниз по высоте) и деревянный стук. */
  pickaxe(pan = 0, gain = 1): void {
    const v = this.v('pickaxe', 0.1, 0.5, pan, gain * 0.85);
    if (!v) return;
    const { k, d } = v;
    this.noise(k, d, 0.28, 'bandpass', 600, 2200, 4, 0.14, 0, 0.06);
    this.noise(k, d, 0.28, 'bandpass', 2200, 700, 4, 0.1, 0.2, 0.06);
    this.tone(k, d, 300, 180, 0.05, 'triangle', 0.1);
  }

  /** Искра: электрический треск. */
  spark(pan = 0, gain = 1): void {
    const v = this.v('spark', 0.09, 0.25, pan, gain * 0.85);
    if (!v) return;
    const { k, d } = v;
    this.ticks(k, d, 6, 0.14, 2500, 6500, 0.1);
    this.tone(k, d, 1500, 900, 0.14, 'square', 0.035, 0, 0.005, 3000);
    this.tone(k, d, 110, 100, 0.12, 'sawtooth', 0.04, 0, 0.005, 600);
  }

  /** Сосулька-камень падает: тонкий свист и удар. */
  stalactite(pan = 0, gain = 1): void {
    const v = this.v('stalactite', 0.1, 0.5, pan, gain * 0.9);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 1100, 350, 0.16, 'sine', 0.04, 0, 0.02);
    this.tone(k, d, 120, 48, 0.22, 'sine', 0.5, 0.16, 0.002);
    this.noise(k, d, 0.09, 'bandpass', 1400, 500, 1, 0.3, 0.16, 0.002);
    this.noise(k, d, 0.2, 'lowpass', 700, 120, 1, 0.45, 0.16, 0.002, true);
    this.ticks(k, d, 3, 0.2, 1500, 3500, 0.08, 0.18);
  }

  /** Взрыв шашки: глухой хлопок, осыпь. */
  charge(pan = 0, gain = 1): void {
    const v = this.v('charge', 0.1, 0.6, pan, gain * 0.9);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 130, 40, 0.4, 'sine', 0.6, 0, 0.003);
    this.noise(k, d, 0.45, 'lowpass', 2200, 140, 1, 0.6, 0, 0.003, true);
    this.noise(k, d, 0.06, 'highpass', 3000, 1200, 0.8, 0.3);
    this.ticks(k, d, 4, 0.3, 600, 2000, 0.1, 0.05);
  }

  /** Луч: гудящий импульс (звать с шагом ~0,12 с — склеится в ровный гул). */
  beam(pan = 0, gain = 1): void {
    const v = this.v('beam', 0.12, 0.3, pan, gain * 0.9);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 196, 200, 0.3, 'sawtooth', 0.07, 0, 0.06, 700, 0.1);
    this.tone(k, d, 198.5, 203, 0.3, 'sawtooth', 0.07, 0, 0.06, 700, 0.1);
    this.tone(k, d, 784, 790, 0.3, 'sine', 0.03, 0, 0.06, 0, 0.1);
  }

  /** Бочонок: большой взрыв на весь экран — гул, треск досок, долгая осыпь. */
  keg(gain = 1): void {
    const v = this.v('keg', 0.25, 2.4, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 70, 22, 1.1, 'sine', 1, 0, 0.004);
    this.tone(k, d, 140, 40, 0.5, 'triangle', 0.3, 0, 0.004, 400);
    this.noise(k, d, 1.2, 'lowpass', 1200, 60, 1, 1, 0, 0.004, true);
    this.noise(k, d, 0.2, 'highpass', 3000, 800, 0.8, 0.7);
    this.noise(k, d, 1.4, 'lowpass', 250, 50, 1, 0.5, 0.8, 0.1, true);
    this.ticks(k, d, 10, 0.7, 800, 3000, 0.12, 0.1);
    this.ticks(k, d, 5, 1, 600, 1800, 0.07, 0.6);
  }

  // ------------------------------------------------------------ волны, сундук, предметы

  /** Старт волны n: деревянный барабан и колокол, выше с номером (по пентатонике). */
  waveStart(n: number, gain = 1): void {
    const v = this.v('waveStart', 0.5, 1.7, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    const s = pent((Math.max(1, n) - 1) % 5);
    this.tone(k, d, 120, 65, 0.25, 'sine', 0.55, 0, 0.003);
    this.noise(k, d, 0.15, 'lowpass', 500, 120, 1, 0.3, 0, 0.003, true);
    if (n >= 6) this.tone(k, d, 110, 60, 0.22, 'sine', 0.4, 0.16, 0.003);
    this.bell(k, d, semis(440, s), 0.2, 1.4, 0.02);
    this.bell(k, d, semis(660, s), 0.08, 1, 0.1);
  }

  /** Волна пройдена: короткая тёплая фанфара. */
  waveWin(gain = 1): void {
    const v = this.v('waveWin', 0.8, 1.7, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      this.tone(k, d, f, f, 0.3, 'triangle', 0.2, i * 0.1, 0.01, 2500, 0.08);
      this.tone(k, d, f, f, 0.3, 'sine', 0.1, i * 0.1, 0.01);
    });
    this.tone(k, d, 1046.5, 1046.5, 0.9, 'triangle', 0.22, 0.32, 0.01, 2500, 0.4);
    this.tone(k, d, 523.25, 523.25, 0.9, 'sine', 0.14, 0.32, 0.01, 0, 0.4);
    this.bell(k, d, 2093, 0.07, 1, 0.36);
  }

  /** Тик секундомера в передышке (тик-так через раз). */
  breatherTick(gain = 1): void {
    const v = this.v('breatherTick', 0.2, 0.12, 0, gain * 0.9);
    if (!v) return;
    const { k, d } = v;
    this.tickFlip = !this.tickFlip;
    this.tone(k, d, this.tickFlip ? 1900 : 1500, this.tickFlip ? 1700 : 1350, 0.03, 'sine', 0.1, 0, 0.001);
    this.noise(k, d, 0.012, 'highpass', 4500, 4500, 0.7, 0.07, 0, 0.001);
  }

  /** Барабан сундука крутится ~1,2 с: трещотка, замедляющаяся к концу, и тяжёлый «клац». */
  chestSpin(gain = 1): void {
    const v = this.v('chestSpin', 0.5, 1.4, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    const N = 26;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const w = 1.2 * (0.35 * u + 0.65 * u * u);
      const f = (i % 2 ? 2300 : 1900) * rnd(0.95, 1.05);
      this.noise(k, d, 0.014, 'bandpass', f, f * 0.8, 4, 0.11, w, 0.001);
      this.tone(k, d, 520 + (i % 2) * 60, 380, 0.025, 'triangle', 0.07, w, 0.001);
    }
    this.tone(k, d, 300, 800, 1.2, 'sine', 0.035, 0, 0.15, 0, 0.8);
    this.tone(k, d, 200, 120, 0.09, 'triangle', 0.3, 1.2, 0.002);
    this.noise(k, d, 0.06, 'bandpass', 900, 600, 2, 0.15, 1.2, 0.002);
  }

  /** Сундук открылся: стук крышки, скрип, звон монет; evo — ярче, с хором и бликами. */
  chestOpen(evo = false, gain = 1): void {
    const v = this.v('chestOpen', 0.5, evo ? 2.4 : 1.6, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 150, 80, 0.12, 'sine', 0.4, 0, 0.003);
    this.noise(k, d, 0.1, 'lowpass', 600, 150, 1, 0.3, 0, 0.003, true);
    this.noise(k, d, 0.3, 'bandpass', 350, 950, 6, 0.1, 0.06, 0.08);
    const coins = evo ? 18 : 10;
    for (let i = 0; i < coins; i++) {
      const f = rnd(2200, 5200);
      const when = 0.25 + i * rnd(0.02, 0.05);
      this.tone(k, d, f, f, rnd(0.12, 0.3), 'sine', rnd(0.03, 0.07), when, 0.002);
      this.tone(k, d, f * 2.76, f * 2.76, 0.06, 'sine', 0.02, when, 0.002);
    }
    if (!evo) return;
    // хор: тёплый аккорд до-мажор, и восходящие блики
    for (const f of [261.6, 329.6, 392, 523.3, 659.3]) {
      this.tone(k, d, f, f, 1.7, 'sawtooth', 0.045, 0.2, 0.15, 1300, 0.9);
      this.tone(k, d, f * 1.004, f * 1.004, 1.7, 'sine', 0.05, 0.2, 0.15, 0, 0.9);
    }
    for (let i = 0; i < 6; i++) this.bell(k, d, semis(1046.5, pent(i)), 0.06, 0.6, 0.3 + i * 0.09);
  }

  /** Алтарь: скрип камня, низкий гул и мерцающая квинта. */
  altar(gain = 1): void {
    const v = this.v('altar', 0.6, 1.7, 0, gain, true);
    if (!v) return;
    const { k, d } = v;
    this.noise(k, d, 0.5, 'lowpass', 320, 90, 1, 0.45, 0, 0.02, true);
    this.tone(k, d, 98, 60, 0.6, 'sine', 0.4, 0, 0.02);
    this.tone(k, d, 196, 196, 1.2, 'sine', 0.18, 0.05, 0.1, 0, 0.3);
    this.bell(k, d, 784, 0.1, 1.3, 0.15);
    this.bell(k, d, 1175, 0.07, 1.5, 0.3);
  }

  /** Родник: пара пузырьков, «бульк». */
  spring(gain = 1): void {
    const v = this.v('spring', 0.15, 0.5, 0, gain);
    if (!v) return;
    const { k, d } = v;
    for (let i = 0; i < 3; i++) {
      const f = rnd(350, 600);
      this.tone(k, d, f, f * 2.2, 0.09, 'sine', 0.2, i * 0.075, 0.004);
    }
    this.noise(k, d, 0.25, 'lowpass', 1500, 400, 1, 0.12, 0, 0.01);
    this.tone(k, d, 1760, 1760, 0.12, 'sine', 0.05, 0.22, 0.003);
  }

  /** Жаровню опрокинули: звон железа и осыпь углей. */
  brazierTip(pan = 0, gain = 1): void {
    const v = this.v('brazierTip', 0.2, 0.7, pan, gain);
    if (!v) return;
    const { k, d } = v;
    this.bell(k, d, vary(480), 0.2, 0.45);
    this.tone(k, d, 140, 70, 0.15, 'sine', 0.4, 0, 0.003);
    this.noise(k, d, 0.35, 'lowpass', 1400, 200, 1, 0.5, 0.03, 0.005, true);
    this.noise(k, d, 0.4, 'bandpass', 800, 300, 1, 0.1, 0.1, 0.05);
    this.ticks(k, d, 8, 0.45, 2500, 5000, 0.08, 0.06);
  }

  /** Подобрал вещь (похлёбка, магнит): мягкое «глюк» и блик. */
  pickupItem(gain = 1): void {
    const v = this.v('pickupItem', 0.1, 0.6, 0, gain);
    if (!v) return;
    const { k, d } = v;
    this.tone(k, d, 220, 520, 0.1, 'sine', 0.25, 0, 0.004);
    this.tone(k, d, 300, 700, 0.1, 'sine', 0.2, 0.08, 0.004);
    this.bell(k, d, 1319, 0.08, 0.5, 0.12);
    this.bell(k, d, 1976, 0.05, 0.5, 0.2);
  }

  // ------------------------------------------------------------ фон пещеры

  /** Фон пещеры: низкий гул и редкие капли по сторонам; плавно включается и выключается (~1 с). */
  ambience(on: boolean): void {
    this.wantAmb = on;
    if (on) {
      if (this.timer === null) this.timer = setInterval(() => this.ambStep(), 250);
      this.ambStep();
    } else {
      this.stopAmb(1);
    }
  }

  /** Напряжение 0…1: к концу волны и в «Орде» гул чуть громче и выше (музыки нет). */
  setTension(k: number): void {
    this.tension = clamp01(Number.isFinite(k) ? k : 0);
    this.applyTension(false);
  }

  /** Погасить петли (заряд, фон). */
  stopAll(): void {
    this.stopHum(0.06);
    this.wantAmb = false;
    this.stopAmb(0.5);
  }

  private ambStep(): void {
    if (!this.wantAmb) return;
    const k = this.sound.kit;
    if (!k) return;
    if (!this.bed) {
      this.bed = this.makeBed(k);
      this.applyTension(true);
    }
    const now = performance.now() / 1000;
    if (now >= this.nextDrip) {
      this.nextDrip = now + rnd(1.4, 5.5);
      this.drip();
    }
  }

  private makeBed(k: Kit): Bed {
    const ctx = k.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(1, t + AMB_FADE_IN);
    out.connect(this.bus(k, 'amb'));
    const srcs: AudioScheduledSourceNode[] = [];
    const sines: OscillatorNode[] = [];
    // низкий гул: коричневый шум под фильтром и две низкие синусоиды (основной тон и квинта)
    const drone = ctx.createGain();
    drone.gain.value = 0.3;
    drone.connect(out);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 150;
    const rb = ctx.createBufferSource();
    rb.buffer = k.brown;
    rb.loop = true;
    const rg = ctx.createGain();
    rg.gain.value = 0.6;
    rb.connect(lp).connect(rg).connect(drone);
    rb.start(t, Math.random() * 1.5);
    srcs.push(rb);
    for (const [f, lv] of [[55, 0.2], [82.4, 0.08]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = lv;
      o.connect(og).connect(drone);
      o.start(t);
      srcs.push(o);
      sines.push(o);
    }
    // медленное «дыхание» пещеры
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.04;
    lfo.connect(lg).connect(drone.gain);
    lfo.start(t);
    srcs.push(lfo);
    // сквозняк: еле слышный шорох воздуха
    const air = ctx.createBufferSource();
    air.buffer = k.noise;
    air.loop = true;
    const af = ctx.createBiquadFilter();
    af.type = 'bandpass';
    af.frequency.value = 500;
    af.Q.value = 0.4;
    const ag = ctx.createGain();
    ag.gain.value = 0.012;
    air.connect(af).connect(ag).connect(out);
    air.start(t, Math.random() * 1.5);
    srcs.push(air);
    // верхний слой напряжения (почти не слышен, пока напряжения нет)
    const hi = ctx.createGain();
    hi.gain.value = 0.002;
    hi.connect(out);
    for (const f of [110, 165]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(hi);
      o.start(t);
      srcs.push(o);
      sines.push(o);
    }
    return { ctx, out, t0: t, drone, lp, hi, sines, srcs };
  }

  private applyTension(instant: boolean): void {
    const b = this.bed;
    if (!b) return;
    const x = this.tension;
    const t = b.ctx.currentTime;
    const tc = instant ? 0.001 : 0.8;
    b.drone.gain.setTargetAtTime(0.3 + 0.25 * x, t, tc);
    b.lp.frequency.setTargetAtTime(150 + 170 * x, t, tc);
    b.hi.gain.setTargetAtTime(0.002 + 0.03 * x, t, tc);
    for (const o of b.sines) o.detune.setTargetAtTime(200 * x, t, tc);
  }

  private stopAmb(fade: number): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const b = this.bed;
    this.bed = null;
    if (!b) return;
    const t = b.ctx.currentTime;
    b.out.gain.cancelScheduledValues(t);
    b.out.gain.setValueAtTime(expAt(t, b.t0, AMB_FADE_IN, 0.0001, 1), t);
    b.out.gain.setTargetAtTime(0.0001, t, fade / 4);
    for (const s of b.srcs) s.stop(t + fade * 1.4 + 0.1);
  }

  /** Капля где-то в пещере: плинь с эхом, случайно слева или справа. */
  private drip(): void {
    const v = this.v('drip', 0.35, 0.7, rnd(-0.85, 0.85), rnd(0.35, 1), false, 'amb');
    if (!v) return;
    const { k, d } = v;
    if (Math.random() < 0.25) {
      const f = rnd(500, 800);
      this.tone(k, d, f, f * 0.5, 0.12, 'sine', 0.1, 0, 0.003);
      this.noise(k, d, 0.08, 'lowpass', 900, 300, 1, 0.04, 0, 0.003, true);
      this.tone(k, d, f * 0.97, f * 0.5, 0.14, 'sine', 0.035, 0.2, 0.004);
      return;
    }
    const f = rnd(1000, 2300);
    this.tone(k, d, f, f * 0.55, 0.08, 'sine', 0.12, 0, 0.002);
    this.tone(k, d, f * 2.02, f * 1.2, 0.04, 'sine', 0.03, 0, 0.002);
    this.tone(k, d, f * 0.98, f * 0.55, 0.1, 'sine', 0.04, 0.17, 0.004);
  }
}
