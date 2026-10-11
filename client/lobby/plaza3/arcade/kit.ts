// Аркада: «автомат» на canvas — режимы (демо с автопилотом → «Готов?» → игра ⇄ пауза → итог), цикл 60 Гц, журнал
// ввода, рисование и тихий звук. Перенесено из лаборатории (lab/plaza3/arcade/games/kit.js); логика партий — в
// shared/arcade (её же переигрывает сервер). Отличия от лаборатории: цикл крутит хозяин (окно — по кадрам браузера,
// экраны корпусов в курзале — из кадра сцены, реже), партия стартует с зерном сервера, звук идёт в шину игры.
import { H, HZ, MEDAL_NAMES, W, medalOf, rngFrom, type ArcEvent, type ArcFx, type ArcLogRow, type ArcMeta, type ArcSimBase } from '../../../../shared/arcade/kit.ts';

export const FONT = 'Rubik, system-ui, -apple-system, "Segoe UI", sans-serif';
export type Ctx = CanvasRenderingContext2D;

export const MEDALS = [
  { name: MEDAL_NAMES[0], color: '#9a8a80', dark: '#5c4f49' },
  { name: MEDAL_NAMES[1], color: '#e0904e', dark: '#8a4a1c' },
  { name: MEDAL_NAMES[2], color: '#dfe6ee', dark: '#7d8a98' },
  { name: MEDAL_NAMES[3], color: '#ffd35a', dark: '#a8620c' },
];

// ------------------------------------------------------------------ звук

export type SfxName =
  | 'start' | 'go' | 'pick' | 'gold' | 'goldin' | 'leave' | 'crash' | 'shot' | 'hit' | 'miss' | 'bad' | 'popup' | 'final' | 'bounce' | 'wall'
  | 'brick' | 'crack' | 'stone' | 'power' | 'lose' | 'clear' | 'over' | 'record';

export interface Sfx {
  play(name: string): void;
  muted: boolean;
}

/**
 * Тихие «пиканья» WebAudio в шину интерфейса игры (общая громкость и «без звука» на M действуют и на них):
 * одинаковый звук не чаще 22 раз в секунду, не больше 14 голосов — без каши.
 */
export function createSfx(out: () => { ctx: AudioContext; ui: AudioNode } | null, volume = 0.22): Sfx {
  let master: GainNode | null = null;
  let ac: AudioContext | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = false;
  let voices = 0;
  const lastAt = new Map<string, number>();

  function ensure(): AudioContext | null {
    const k = out();
    if (!k) return null;
    if (k.ctx !== ac) {
      ac = k.ctx;
      master = ac.createGain();
      master.gain.value = volume;
      master.connect(k.ui);
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  }

  function env(g: GainNode, t0: number, vol: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.4, slide = 0, delay = 0): void {
    if (voices > 14 || !ac || !master) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    env(g, t0, vol, dur);
    o.connect(g).connect(master);
    voices++;
    o.onended = () => voices--;
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur: number, vol = 0.4, freq = 1800, delay = 0): void {
    if (voices > 14 || !ac || !master || !noiseBuf) return;
    const t0 = ac.currentTime + delay;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq / 6), t0 + dur);
    const g = ac.createGain();
    env(g, t0, vol, dur);
    s.connect(f).connect(g).connect(master);
    voices++;
    s.onended = () => voices--;
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  const notes = (list: number[], step: number, type: OscillatorType = 'square', vol = 0.3, dur = 0.09): void => list.forEach((f, i) => tone(f, dur, type, vol, 0, i * step));

  const PRESETS: Record<SfxName, () => void> = {
    start: () => notes([523, 659, 784], 0.07, 'square', 0.25),
    go: () => notes([784, 1047], 0.08, 'square', 0.28),
    pick: () => notes([660, 990], 0.05, 'square', 0.28, 0.07),
    gold: () => notes([784, 988, 1175, 1568], 0.05, 'square', 0.25),
    goldin: () => tone(1320, 0.12, 'triangle', 0.2, 1760),
    leave: () => tone(392, 0.18, 'triangle', 0.3, 262),
    crash: () => { noise(0.35, 0.55, 1200); tone(196, 0.3, 'sawtooth', 0.18, 55); },
    shot: () => noise(0.07, 0.45, 3200),
    hit: () => { tone(1480, 0.05, 'square', 0.22); tone(1976, 0.07, 'triangle', 0.22, 0, 0.035); },
    miss: () => tone(150, 0.06, 'triangle', 0.25),
    bad: () => tone(233, 0.28, 'sawtooth', 0.22, 117),
    popup: () => tone(523, 0.1, 'triangle', 0.2, 1047),
    final: () => notes([880, 880], 0.12, 'square', 0.22, 0.07),
    bounce: () => tone(392, 0.04, 'square', 0.2),
    wall: () => tone(294, 0.03, 'square', 0.12),
    brick: () => tone(660, 0.05, 'triangle', 0.3, 880),
    crack: () => tone(330, 0.05, 'triangle', 0.25),
    stone: () => tone(180, 0.04, 'square', 0.16),
    power: () => notes([523, 659, 784, 1047], 0.045, 'triangle', 0.3),
    lose: () => notes([392, 330, 262], 0.11, 'triangle', 0.3, 0.14),
    clear: () => notes([523, 659, 784, 1047, 1319], 0.07, 'square', 0.22),
    over: () => notes([392, 330, 262, 196], 0.13, 'triangle', 0.3, 0.16),
    record: () => notes([523, 659, 784, 1047, 784, 1047, 1319], 0.08, 'square', 0.22, 0.1),
  };

  return {
    play(name: string) {
      const p = PRESETS[name as SfxName];
      if (muted || !p) return;
      if (!ensure()) return;
      const now = performance.now();
      if (now - (lastAt.get(name) ?? -1e9) < 45) return;
      lastAt.set(name, now);
      p();
    },
    get muted() {
      return muted;
    },
    set muted(v: boolean) {
      muted = !!v;
    },
  };
}

// ------------------------------------------------------------------ рисование

/** Текст с жёсткой тенью: аркадный, но читаемый (Rubik). */
export function txt(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', shadow: string | null = 'rgba(30,14,18,.9)'): void {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(s, x + 1, y + 1);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** Желейка: круглая, блестящая, с глазками. look: −1..1 — куда смотрит. */
export function jelly(ctx: Ctx, cx: number, cy: number, r: number, color: string, look = 0, squash = 0): void {
  const rx = r * (1 + squash * 0.15);
  const ry = r * (1 - squash * 0.15);
  ctx.fillStyle = 'rgba(42,31,36,.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.92, rx * 0.9, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.38, cy - ry * 0.45, rx * 0.28, ry * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  const ex = r * 0.34;
  const ey = cy - r * 0.05;
  const er = Math.max(1, r * 0.24);
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + sx * ex + look * r * 0.12, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1f24';
    ctx.beginPath();
    ctx.arc(cx + sx * ex + look * r * 0.2, ey + er * 0.15, er * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Медаль-кружок с лентой */
export function medalIcon(ctx: Ctx, x: number, y: number, m: number, r = 7): void {
  const c = MEDALS[m];
  ctx.fillStyle = '#d9483a';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.8, y - r * 1.9);
  ctx.lineTo(x - r * 0.1, y - r * 0.4);
  ctx.lineTo(x + r * 0.1, y - r * 0.4);
  ctx.lineTo(x + r * 0.8, y - r * 1.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(x, y + 1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

interface FxItem {
  k: 't' | 'p' | 'c';
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: string;
  color: string;
  size: number;
  r: number;
  g: number;
  life: number;
  age: number;
}

/** Всплывающие «+10», искры и пыль: только для картинки, на счёт не влияют. */
export class FxLayer {
  readonly items: FxItem[] = [];
  private add(o: Partial<FxItem> & Pick<FxItem, 'k' | 'x' | 'y' | 'life'>): void {
    this.items.push({ vx: 0, vy: 0, s: '', color: '#fff', size: 2, r: 3, g: 0, age: 0, ...o });
  }
  text(x: number, y: number, s: string, color = '#ffd35a', size = 10, life = 50): void {
    this.add({ k: 't', x, y, s, color, size, life });
  }
  burst(x: number, y: number, colors: readonly string[], n = 10, speed = 1.6, life = 30, size = 2): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.add({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, color: colors[i % colors.length], life, size, g: 0.06 });
    }
  }
  puff(x: number, y: number, color = 'rgba(255,255,255,.8)', life = 40, r = 3): void {
    this.add({ k: 'c', x, y, vx: (Math.random() - 0.5) * 0.3, vy: -0.35 - Math.random() * 0.2, color, life, r });
  }
  clear(): void {
    this.items.length = 0;
  }
  step(): void {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.age++;
      if (p.k === 'p') {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.g;
      } else if (p.k === 'c') {
        p.x += p.vx;
        p.y += p.vy;
      } else p.y -= 0.45;
      if (p.age >= p.life) items.splice(i, 1);
    }
  }
  draw(ctx: Ctx): void {
    for (const p of this.items) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      if (p.k === 't') txt(ctx, p.s, p.x, p.y, p.size, p.color, 'center');
      else if (p.k === 'p') {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1.6 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Тёмная плашка сверху экрана (16 px): счёт, середина, рекорд */
export function topBar(ctx: Ctx, left: string, mid: string, right: string, midColor = '#fff3de'): void {
  ctx.fillStyle = '#2a1f24';
  ctx.fillRect(0, 0, W, 16);
  ctx.fillStyle = '#4a3238';
  ctx.fillRect(0, 15, W, 1);
  txt(ctx, left, 6, 8.5, 10, '#fff3de');
  if (mid) txt(ctx, mid, W / 2, 8.5, 10, midColor, 'center');
  txt(ctx, right, W - 6, 8.5, 10, '#ffd35a', 'right');
}

/** Картинка-кэш на холсте размером экрана (фон, плитка) */
export function cachedLayer(scale: number, cache: { scale: number; cv: HTMLCanvasElement } | null, paint: (c: Ctx) => void): { scale: number; cv: HTMLCanvasElement } {
  if (cache && cache.scale === scale) return cache;
  const cv = document.createElement('canvas');
  cv.width = W * scale;
  cv.height = H * scale;
  const c = cv.getContext('2d')!;
  c.setTransform(scale, 0, 0, scale, 0, 0);
  paint(c);
  return { scale, cv };
}

// ------------------------------------------------------------------ автомат: режимы, цикл, ввод

export type CabMode = 'attract' | 'count' | 'play' | 'paused' | 'over';

/** Ввод в партию: событие попадает в журнал и в симуляцию в начале следующего тика */
export interface Ctl {
  push(type: number, a?: number, b?: number): void;
  readonly mode: CabMode;
}

export interface View {
  fx: FxLayer;
  shake: number;
  clock: number;
}

export interface DrawState {
  mode: CabMode;
  clock: number;
  alpha: number;
  banner: string;
}

/** Мини-игра на экране: логика из shared, картинка, ввод и автопилот */
export interface GameDef<S extends ArcSimBase, U> {
  meta: ArcMeta;
  makeSim(seed: number): S;
  bot(sim: S, mem: Record<string, unknown>, rng: () => number, ui: U): ArcEvent[];
  makeUi(): U;
  resetUi?(ui: U): void;
  uiTick?(ui: U, sim: S, ctl: Ctl | null): void;
  key?(code: string, down: boolean, ctl: Ctl, ui: U, sim: S): boolean;
  pointer?(type: 'move' | 'down', x: number, y: number, ctl: Ctl, ui: U, sim: S): void;
  onFx?(view: View, f: ArcFx, sim: S): void;
  draw(ctx: Ctx, sim: S, view: View, ui: U, st: DrawState, best: number): void;
  /** Типы событий, которые в одном тике заменяют друг друга (мышь «Замка»: важна последняя позиция) */
  merge?: readonly number[];
}

export interface CabResult {
  game: string;
  seed: number;
  ticks: number;
  score: number;
  log: ArcLogRow[];
  aborted: boolean;
  medal: number;
  newBest: boolean;
}

export interface CabOpts {
  /** Мышь по экрану (окно игры); на корпусе в курзале — только демо */
  interactive: boolean;
  startHint: string;
  best: number;
  sfx?: (name: string) => void;
  onScore?: (score: number) => void;
  onEnd?: (r: CabResult) => void;
  onMode?: (mode: CabMode) => void;
  /** Игрок хочет партию (пробел, клик): хозяин просит зерно у сервера и зовёт start(seed) */
  onWantStart?: () => void;
}

/** Автомат: один на холст. Цикл крутит хозяин — frame(dt) из кадра браузера или сцены. */
export class Cabinet<S extends ArcSimBase = ArcSimBase, U = unknown> {
  readonly def: GameDef<S, U>;
  readonly meta: ArcMeta;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: Ctx;
  private readonly scale: number;
  private readonly o: CabOpts;
  private modeNow: CabMode = 'attract';
  private prevMode: CabMode = 'play';
  private simNow!: S;
  private seedNow = 0;
  private log: ArcLogRow[] = [];
  private pending: ArcEvent[] = [];
  private botMem: Record<string, unknown> = {};
  private botRng = rngFrom(1);
  private acc = 0;
  private clock = 0;
  private countdown = 0;
  private attractEnd = 0;
  private overAt = 0;
  private lastScore = -1;
  private best: number;
  private resultNow: CabResult | null = null;
  private banner = '';
  /** Живой счёт играющего (экран корпуса у соседей); −1 — не показывать */
  private live = -1;
  /** Ждём зерно сервера: «Готов?» без отсчёта */
  waiting = false;
  private readonly ui: U;
  private readonly view: View = { fx: new FxLayer(), shake: 0, clock: 0 };
  private readonly ctl: Ctl;
  private readonly listeners: Array<[string, (e: Event) => void]> = [];

  constructor(canvas: HTMLCanvasElement, def: GameDef<S, U>, opts: CabOpts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.scale = canvas.width / W;
    this.def = def;
    this.meta = def.meta;
    this.o = opts;
    this.best = opts.best | 0;
    this.ui = def.makeUi();
    const self = this;
    this.ctl = {
      push(type: number, a = 0, b = 0) {
        if (self.modeNow !== 'play') return;
        const ev: ArcEvent = [type | 0, a | 0, b | 0];
        const last = self.pending[self.pending.length - 1];
        if (last && last[0] === ev[0] && def.merge?.includes(ev[0])) self.pending[self.pending.length - 1] = ev;
        else self.pending.push(ev);
      },
      get mode() {
        return self.modeNow;
      },
    };
    if (opts.interactive) {
      const on = (type: string, fn: (e: Event) => void): void => {
        canvas.addEventListener(type, fn);
        this.listeners.push([type, fn]);
      };
      on('pointermove', (e) => this.onPointer(e as PointerEvent, 'move'));
      on('pointerdown', (e) => this.onPointer(e as PointerEvent, 'down'));
      on('contextmenu', (e) => e.preventDefault());
    }
    this.attract();
  }

  get mode(): CabMode {
    return this.modeNow;
  }
  get score(): number {
    return this.simNow ? this.simNow.score : 0;
  }
  get result(): CabResult | null {
    return this.resultNow;
  }
  get sim(): S {
    return this.simNow;
  }
  /** Строк журнала текущей партии (растёт в игре) */
  get logRows(): readonly ArcLogRow[] {
    return this.log;
  }

  private setMode(next: CabMode): void {
    this.modeNow = next;
    this.o.onMode?.(next);
  }

  private begin(seed: number): void {
    this.seedNow = seed >>> 0;
    this.simNow = this.def.makeSim(this.seedNow);
    this.log = [];
    this.pending = [];
    this.lastScore = -1;
    this.view.fx.clear();
    this.view.shake = 0;
    this.def.resetUi?.(this.ui);
  }

  private attract(): void {
    this.begin(Math.floor(Math.random() * 4294967296) >>> 0);
    this.botRng = rngFrom(this.seedNow ^ 0x9e3779b9);
    this.botMem = {};
    this.attractEnd = 0;
    this.setMode('attract');
  }

  /** Партия с зерном сервера */
  start(seed: number): void {
    this.waiting = false;
    this.begin(seed);
    this.countdown = Math.round(1.3 * HZ);
    this.resultNow = null;
    this.setMode('count');
    this.o.sfx?.('start');
  }

  /** Пробел/клик/«Играть»: попросить партию (зерно — у сервера) */
  want(force = false): void {
    if (this.waiting) return;
    if (this.modeNow === 'attract' || (this.modeNow === 'over' && (force || this.clock - this.overAt > 40))) {
      this.waiting = true;
      this.o.onWantStart?.();
    } else if (this.modeNow === 'paused') this.resume();
  }

  private end(aborted: boolean): CabResult | null {
    const m = this.modeNow;
    if (!this.simNow || (m !== 'play' && m !== 'paused' && m !== 'count')) return null;
    const score = this.simNow.score;
    const newBest = score > this.best && score > 0;
    if (newBest) this.best = score;
    const r: CabResult = { game: this.meta.id, seed: this.seedNow, ticks: this.simNow.tick, score, log: this.log.slice(), aborted, medal: medalOf(score, this.meta.medals), newBest };
    this.resultNow = r;
    this.overAt = this.clock;
    this.setMode('over');
    if (!aborted) this.o.sfx?.(newBest ? 'record' : 'over');
    this.o.onEnd?.(r);
    return r;
  }

  private apply(ev: ArcEvent[]): void {
    const sim = this.simNow;
    sim.step(ev);
    for (const f of sim.fx) {
      this.def.onFx?.(this.view, f, sim);
      if (this.modeNow === 'play') this.o.sfx?.(f.k);
    }
    sim.fx.length = 0;
    if (this.modeNow === 'play' && sim.score !== this.lastScore) {
      this.lastScore = sim.score;
      this.o.onScore?.(sim.score);
    }
  }

  private tick(): void {
    this.clock++;
    this.view.clock = this.clock;
    this.view.fx.step();
    if (this.view.shake > 0) this.view.shake--;
    const sim = this.simNow;
    if (this.modeNow === 'attract') {
      if (!sim.over) {
        this.def.uiTick?.(this.ui, sim, null);
        this.apply(this.def.bot(sim, this.botMem, this.botRng, this.ui));
        if (sim.tick > 75 * HZ) sim.over = true;
      }
      if (sim.over && !this.attractEnd) this.attractEnd = this.clock + 2 * HZ;
      if (this.attractEnd && this.clock >= this.attractEnd) this.attract();
    } else if (this.modeNow === 'count') {
      this.def.uiTick?.(this.ui, sim, this.ctl);
      if (--this.countdown <= 0) {
        this.setMode('play');
        this.o.sfx?.('go');
      }
    } else if (this.modeNow === 'play') {
      this.def.uiTick?.(this.ui, sim, this.ctl);
      const ev = this.pending;
      this.pending = [];
      for (const e of ev) this.log.push([sim.tick, e[0], e[1], e[2]]);
      this.apply(ev);
      if (sim.over) this.end(false);
    }
  }

  /** Прошло dt секунд: тики 60 Гц (не больше 6 за раз) и, если draw, картинка */
  frame(dt: number, draw = true): void {
    this.acc += Math.min(0.25, Math.max(0, dt));
    let n = 0;
    while (this.acc >= 1 / HZ && n < 6) {
      this.acc -= 1 / HZ;
      this.tick();
      n++;
    }
    if (n >= 6) this.acc = 0;
    if (draw) this.draw();
  }

  draw(): void {
    const ctx = this.ctx;
    const sim = this.simNow;
    const stepping = this.modeNow === 'play' || (this.modeNow === 'attract' && !sim.over);
    const st: DrawState = { mode: this.modeNow, clock: this.clock, alpha: stepping ? this.acc * HZ : 0, banner: this.banner };
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (this.view.shake > 0) {
      const k = this.view.shake / 3;
      ctx.translate(Math.round((Math.random() - 0.5) * k), Math.round((Math.random() - 0.5) * k));
    }
    this.def.draw(ctx, sim, this.view, this.ui, st, this.best);
    this.view.fx.draw(ctx);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.overlay();
  }

  private blink(period = 50): boolean {
    return Math.floor(this.clock / period) % 2 === 0;
  }

  private dim(a = 0.62): void {
    this.ctx.fillStyle = `rgba(28,16,20,${a})`;
    this.ctx.fillRect(0, 16, W, H - 16);
  }

  private medalsRow(y: number): void {
    const xs = [W / 2 - 84, W / 2, W / 2 + 84];
    for (let i = 0; i < 3; i++) {
      medalIcon(this.ctx, xs[i] - 26, y, i + 1, 6);
      txt(this.ctx, String(this.meta.medals[i]), xs[i] - 16, y + 1, 11, '#fff3de');
    }
  }

  private overlay(): void {
    const ctx = this.ctx;
    const m = this.meta;
    const mode = this.modeNow;
    if (mode === 'attract') {
      if (this.banner) {
        // кто-то играет: полоса с ником и его живой счёт поверх демо (решение 3а)
        if (this.live >= 0) topBar(ctx, `СЧЁТ ${this.live}`, m.title.toUpperCase(), 'ИГРАЕТ', '#ffd35a');
        ctx.fillStyle = 'rgba(28,16,20,.86)';
        ctx.fillRect(0, H - 24, W, 24);
        // счёт и внизу: сверху экран у зрителя выше корпуса закрывает козырёк вывески
        txt(ctx, `ИГРАЕТ ${this.banner.toUpperCase()}${this.live >= 0 ? ` · СЧЁТ ${this.live}` : ''}`, W / 2, H - 12, 13, '#ffd35a', 'center');
        return;
      }
      const titlePage = Math.floor(this.clock / (4 * HZ)) % 2 === 0;
      if (titlePage) {
        this.dim(0.66);
        txt(ctx, m.title.toUpperCase(), W / 2, 74, m.title.length > 10 ? 26 : 32, '#ffd35a', 'center', '#7a2a1c');
        txt(ctx, m.like.toUpperCase(), W / 2, 102, 11, '#fff3de', 'center');
        this.medalsRow(136);
        if (this.best > 0) txt(ctx, `ТВОЙ РЕКОРД ${this.best}`, W / 2, 162, 11, '#ffd35a', 'center');
        if (this.blink(36)) txt(ctx, this.waiting ? 'ГОТОВИМ АВТОМАТ…' : this.o.startHint, W / 2, 198, 14, '#fff3de', 'center');
      } else {
        ctx.fillStyle = 'rgba(28,16,20,.75)';
        ctx.fillRect(0, H - 20, W, 20);
        txt(ctx, 'ДЕМО', 8, H - 10, 10, '#ffb36b');
        if (this.blink(36)) txt(ctx, this.waiting ? 'ГОТОВИМ АВТОМАТ…' : this.o.startHint, W / 2, H - 10, 11, '#fff3de', 'center');
      }
    } else if (mode === 'count') {
      this.dim(0.3);
      const first = this.countdown > 0.6 * HZ;
      txt(ctx, first ? 'ГОТОВ?' : m.go, W / 2, H / 2 + 4, first ? 28 : 34, first ? '#fff3de' : '#ffd35a', 'center', '#7a2a1c');
    } else if (mode === 'paused') {
      this.dim(0.6);
      txt(ctx, 'ПАУЗА', W / 2, H / 2 - 8, 30, '#fff3de', 'center');
      txt(ctx, 'P ИЛИ ПРОБЕЛ — ДАЛЬШЕ', W / 2, H / 2 + 24, 11, '#ffd35a', 'center');
    } else if (mode === 'over' && this.resultNow) {
      const r = this.resultNow;
      this.dim(0.7);
      const md = r.medal;
      txt(ctx, r.aborted ? 'ИГРА ЗАКОНЧЕНА' : m.overTitle, W / 2, 54, 20, '#ff9a8a', 'center');
      txt(ctx, String(r.score), W / 2, 92, 34, '#fff3de', 'center');
      if (md > 0) {
        medalIcon(ctx, W / 2 - 40, 132, md, 8);
        txt(ctx, MEDALS[md].name.toUpperCase(), W / 2 - 26, 133, 14, MEDALS[md].color, 'left');
      } else {
        txt(ctx, `ДО БРОНЗЫ ЕЩЁ ${m.medals[0] - r.score}`, W / 2, 133, 12, '#ffb36b', 'center');
      }
      if (md > 0 && md < 3) txt(ctx, `ДО МЕДАЛИ «${MEDALS[md + 1].name.toUpperCase()}» — ${m.medals[md] - r.score}`, W / 2, 152, 9, '#d8c4b0', 'center');
      if (r.newBest && this.blink(20)) txt(ctx, 'НОВЫЙ РЕКОРД!', W / 2, 174, 16, '#ffd35a', 'center', '#a8620c');
      if (this.clock - this.overAt > 40 && this.o.interactive) txt(ctx, this.waiting ? 'ГОТОВИМ АВТОМАТ…' : 'ПРОБЕЛ — ЕЩЁ РАЗ', W / 2, 210, 12, '#fff3de', 'center');
    }
  }

  // ---------------------------------------------------------------- ввод

  private onPointer(e: PointerEvent, type: 'move' | 'down'): void {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    if (type === 'move') {
      this.def.pointer?.('move', x, y, this.ctl, this.ui, this.simNow);
      return;
    }
    e.preventDefault();
    if (e.button !== 0) return;
    if (this.modeNow === 'attract' || this.modeNow === 'over' || this.modeNow === 'paused') {
      this.want();
      return;
    }
    this.def.pointer?.('down', x, y, this.ctl, this.ui, this.simNow);
  }

  resume(): void {
    if (this.modeNow !== 'paused') return;
    this.setMode(this.prevMode);
  }

  pause(): void {
    if (this.modeNow !== 'play' && this.modeNow !== 'count') return;
    this.prevMode = this.modeNow;
    this.setMode('paused');
  }

  togglePause(): void {
    if (this.modeNow === 'paused') this.resume();
    else this.pause();
  }

  /** Закончить партию сейчас (Esc, «Заново»): счёт засчитывается как есть */
  finish(): CabResult | null {
    return this.end(true);
  }

  /** Клавиша: true — игра её съела */
  key(code: string, down: boolean): boolean {
    if (down && code === 'Space' && (this.modeNow === 'attract' || this.modeNow === 'over' || this.modeNow === 'paused')) {
      this.want();
      return true;
    }
    if (this.modeNow === 'play' || this.modeNow === 'count') return !!this.def.key?.(code, down, this.ctl, this.ui, this.simNow);
    return false;
  }

  setBest(v: number): void {
    this.best = v | 0;
  }

  /** «ИГРАЕТ <ник>» и его живой счёт поверх демо (пусто — свободен) */
  setBanner(nick: string, live: number): void {
    this.banner = nick || '';
    this.live = nick ? live : -1;
  }

  destroy(): void {
    for (const [type, fn] of this.listeners) this.canvas.removeEventListener(type, fn);
    this.listeners.length = 0;
  }
}
