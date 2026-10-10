// Мини-игра «Набери лейку» у корыта колодца (design-v11 §7, часть B4). Сервер на fillStart тратит набор воды и шлёт
// зерно (событие fill); сцена зовёт start(seed, done, can), игра копит отсчёты (shared/farmwell.ts: на тик 30 Гц пара
// «x ведра 0–1000, наклон 0–1») и отдаёт их в done — сцена шлёт fillEnd, а долю набранного пересчитывает сервер той же
// моделью. Пока open — сцена не берёт ввод. Мышь двигает ведро, ЛКМ (или пробел) наклоняет, Esc и × закрывают окно:
// налитое к этому моменту засчитывается. Окно рисует то, что считает общая модель, поэтому экран и сервер сходятся.
import { WELL, WELL_AFK_SHARE, WELL_HZ, WELL_X, newWell, stepWell, wellAfk, wellShare, type WellEnd, type WellSim } from '../../shared/farmwell.ts';
import { WellPainter, type WellView } from './well/draw.ts';
import { WellSfx } from './well/sound.ts';
import './well/well.css';

const DT = 1 / WELL_HZ;

export interface FarmWellOpts {
  /** Громкость звука 0…1 (общая × эффекты); без неё звук по умолчанию 0,7 */
  volume?: () => number;
  /** Окно закрылось (сцене вернуть мышь) */
  closed?: () => void;
}

/** Лейка до попытки, в «зарядах ×100» как FarmProgress.water и canMax */
export interface WellCanInfo {
  have: number;
  max: number;
}

const WHY: Record<WellEnd, string> = {
  full: '',
  empty: 'ведро опустело',
  time: 'вышло время налива',
  release: 'пауза в наливе слишком долгая',
  idle: 'налив не начат',
};

const comma = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');

/** 1 заряд, 2–4 заряда, 5 зарядов; дробное — «заряда» */
function charges(n: number): string {
  if (!Number.isInteger(n)) return 'заряда';
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'заряд';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'заряда';
  return 'зарядов';
}

const div = (cls: string, text = ''): HTMLDivElement => {
  const e = document.createElement('div');
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class FarmWell {
  /** Мини-игра на экране */
  open = false;
  /** Модель текущей попытки (для проверок и отладки) */
  sim: WellSim | null = null;
  private readonly opts: FarmWellOpts;
  private readonly sfx: WellSfx;
  private readonly el = div('fw');
  private readonly stage = div('fw-stage');
  private readonly canvas = document.createElement('canvas');
  private readonly tag = div('fw-tag');
  private readonly pct = document.createElement('b');
  private readonly sub = document.createElement('small');
  private readonly time = div('fw-time');
  private readonly timeBar = document.createElement('i');
  private readonly hint = div('fw-hint');
  private readonly res = div('fw-res');
  private painter: WellPainter | null = null;
  private done: ((samples: number[]) => void) | null = null;
  private seed = 0;
  private base = 0;
  private maxCharges = 0;
  private haveX100 = 0;
  private maxX100 = 1000;
  private known = false;
  private samples: number[] = [];
  private mx = WELL_X / 2;
  private down = false;
  private kb = false;
  private acc = 0;
  private clock = 0;
  private last = 0;
  private raf = 0;
  private prev = { x: 0.5, tilt: 0, bucket: 1, fill: 0, t: 0 };
  private finished = false;
  private fullAt = -1;
  private wasHit = false;
  private closeTimer = 0;
  private hideTimer = 0;
  private tagKey = '';
  private endTilt = 0;
  private endWhy: WellEnd | null = null;

  constructor(root: HTMLElement, opts: FarmWellOpts = {}) {
    this.opts = opts;
    this.sfx = new WellSfx(opts.volume ?? (() => 0.7));
    const frame = div('fw-frame');
    this.tag.append(this.pct, this.sub);
    this.time.append(this.timeBar);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'fw-x';
    x.textContent = '×';
    x.title = 'Закончить (Esc)';
    x.setAttribute('aria-label', 'Закрыть');
    x.addEventListener('click', () => this.abort());
    x.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.hint.innerHTML = 'Двигай мышь — ведро едет следом.<br>Зажми <kbd>ЛКМ</kbd> или <kbd>Пробел</kbd> и лей в горлышко лейки';
    this.stage.append(this.canvas, this.tag, this.time, this.hint, div('fw-foot', 'Esc — закончить'), this.res);
    this.canvas.className = 'fw-canvas';
    this.canvas.setAttribute('aria-label', 'Мини-игра: набери лейку');
    frame.append(this.stage, x);
    this.el.append(frame);
    this.el.hidden = true;
    this.el.addEventListener('pointermove', (e) => this.point(e));
    this.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      this.point(e);
      this.down = true;
      this.stage.classList.add('down');
      try { this.el.setPointerCapture(e.pointerId); } catch { /* не страшно */ }
    });
    const up = (): void => { this.down = false; this.stage.classList.remove('down'); };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    root.appendChild(this.el);
  }

  /**
   * Начать попытку: seed от сервера (событие fill), done получит отсчёты (сцена шлёт их в fillEnd), can — сколько воды
   * в лейке и сколько влезает, в «зарядах ×100». Без can показываем только проценты.
   */
  start(seed: number, done: (samples: number[]) => void, can?: WellCanInfo): void {
    if (this.open) this.shut(false);
    window.clearTimeout(this.hideTimer);
    this.seed = seed;
    this.done = done;
    this.known = !!can && can.max > 0;
    this.maxX100 = can && can.max > 0 ? can.max : 1000;
    this.haveX100 = can ? Math.min(this.maxX100, Math.max(0, can.have)) : 0;
    this.maxCharges = this.maxX100 / 100;
    this.base = this.haveX100 / this.maxX100;
    this.sim = newWell(seed);
    this.samples = [];
    this.mx = WELL_X / 2;
    this.down = false;
    this.kb = false;
    this.acc = 0;
    this.clock = 0;
    this.finished = false;
    this.fullAt = -1;
    this.wasHit = false;
    this.tagKey = '';
    this.endTilt = 0;
    this.endWhy = null;
    this.prev = { x: 0.5, tilt: 0, bucket: WELL.bucket, fill: 0, t: 0 };
    this.res.className = 'fw-res';
    this.hint.classList.remove('off');
    this.time.classList.remove('show', 'low');
    this.timeBar.style.width = '100%';
    this.stage.classList.remove('down');
    this.el.hidden = false;
    this.open = true;
    // мышь должна быть свободной (при захвате clientX застывает); open уже true, поэтому оболочка паузу не покажет
    if (document.pointerLockElement) document.exitPointerLock();
    this.painter = new WellPainter(this.canvas, this.base);
    this.painter.resize();
    this.setTag(this.base);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(() => this.el.classList.add('show'));
    this.sfx.begin();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Итог от сервера (событие filled): поправить число на карточке, если оно не то, что посчитали у себя. true — окно ещё
   * показывает итог (сцене не нужен свой тост поверх него), false — окна нет (закрыли по Esc/×): тост нужен.
   */
  result(_share: number, add: number): boolean {
    if (!this.open || !this.finished) return false;
    const gained = Math.min(this.maxX100, this.haveX100 + Math.max(0, add)) - this.haveX100;
    this.showResult(gained, this.endWhy);
    return true;
  }

  /** Закрыть без отсчётов и без возврата мыши (ушли с фермы, оборвалась связь) */
  cancel(): void {
    if (this.open) this.shut(false);
  }

  // ------------------------------------------------------------ ввод

  private point(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width <= 0) return;
    this.mx = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * WELL_X);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.abort();
    } else if (e.code === 'Space') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.kb = true;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.kb = false;
  };

  private readonly onBlur = (): void => {
    this.down = false;
    this.kb = false;
    this.stage.classList.remove('down');
  };

  private readonly onResize = (): void => this.painter?.resize();

  // ------------------------------------------------------------ ход игры

  private readonly frame = (now: number): void => {
    if (!this.open || !this.sim) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.clock += dt;
    const sim = this.sim;
    if (this.finished) {
      // налив кончился: ведро выпрямляется, как обычно, за 0,4 с
      this.endTilt = Math.max(0, this.endTilt - dt / WELL.tiltDown);
    } else {
      this.acc += dt;
      while (this.acc >= DT && !this.finished) {
        this.acc -= DT;
        this.tick(sim);
      }
    }
    const k = this.finished ? 1 : Math.min(1, this.acc / DT);
    const lerp = (a: number, b: number): number => a + (b - a) * k;
    const fill = lerp(this.prev.fill, sim.fill);
    const level = Math.min(1, this.base + fill);
    const view: WellView = {
      t: lerp(this.prev.t, sim.t),
      clock: this.clock,
      can: sim.can,
      x: lerp(this.prev.x, sim.x),
      tilt: this.finished ? this.endTilt : lerp(this.prev.tilt, sim.tilt),
      bucket: lerp(this.prev.bucket, sim.bucket),
      level,
      hit: sim.hit,
      pouring: !this.finished && sim.phase === 'play' && sim.tilt > WELL.pour && sim.bucket > 1e-4,
      fullFor: this.fullAt >= 0 ? this.clock - this.fullAt : -1,
    };
    this.painter?.draw(view, dt);
    this.sfx.pour(view.pouring ? view.tilt : 0, view.hit && view.pouring, level);
    this.setTag(level);
    if (sim.phase === 'play') {
      const left = Math.max(0, 1 - sim.playT / WELL.duration);
      this.timeBar.style.width = `${(left * 100).toFixed(1)}%`;
      this.time.classList.add('show');
      this.time.classList.toggle('low', left < 0.25);
      this.hint.classList.add('off');
    }
  };

  /** Один тик модели: записать отсчёт и сдвинуть мир */
  private tick(sim: WellSim): void {
    const want = this.down || this.kb ? 1 : 0;
    this.prev = { x: sim.x, tilt: sim.tilt, bucket: sim.bucket, fill: sim.fill, t: sim.t };
    this.samples.push(this.mx, want);
    stepWell(sim, this.mx / WELL_X, want);
    if (sim.phase !== 'ready' && sim.tilt > WELL.pour && sim.bucket > 1e-4) {
      if (sim.hit && !this.wasHit) this.sfx.plop();
      else if (!sim.hit) this.sfx.splash();
    }
    this.wasHit = sim.hit;
    if (this.fullAt < 0 && this.base + sim.fill >= 1 - 1e-9) {
      this.fullAt = this.clock;
      this.sfx.full();
      this.finish('full');
    } else if (sim.phase === 'done') this.finish(sim.end ?? 'time');
  }

  private setTag(level: number): void {
    const pct = Math.round(level * 100);
    const have = Math.floor((level * this.maxX100) / 100 + 1e-9);
    const key = `${pct}|${have}`;
    if (key === this.tagKey) return;
    this.tagKey = key;
    this.pct.textContent = `${pct} %`;
    this.sub.textContent = this.known ? `${have} из ${this.maxCharges} 💧` : '';
    this.tag.classList.toggle('full', pct >= 100);
  }

  /** Налив кончился сам: отдать отсчёты серверу и показать итог */
  private finish(why: WellEnd): void {
    if (this.finished) return;
    this.finished = true;
    this.hint.classList.add('off');
    this.stage.classList.remove('down');
    this.endTilt = this.sim!.tilt;
    this.endWhy = why;
    const share = wellShare(this.seed, this.samples);
    const add = Math.round(Math.min(1, share) * this.maxX100);
    const gained = Math.min(this.maxX100, this.haveX100 + add) - this.haveX100;
    this.showResult(gained, why);
    this.sfx.chord(Math.min(1, this.base + share));
    this.done?.(this.samples);
    this.done = null;
    this.closeTimer = window.setTimeout(() => this.shut(true), WELL.closeAfter * 1000);
  }

  private showResult(gainedX100: number, why: WellEnd | null): void {
    const sim = this.sim!;
    const level = Math.min(1, this.base + Math.min(1, wellShare(this.seed, this.samples)));
    const full = level >= 0.995;
    const n = gainedX100 / 100;
    const afk = wellAfk(sim) && sim.fill >= WELL_AFK_SHARE;
    this.res.textContent = '';
    const h = document.createElement('h3');
    h.textContent = full ? 'Полная лейка!' : why === 'idle' ? 'Налив не начат' : `${Math.round(level * 100)} %`;
    const plus = div(`plus${n <= 0 ? ' zero' : ''}`);
    plus.append(`+${comma(n)}`);
    const unit = document.createElement('small');
    unit.textContent = ` ${charges(n)}`;
    plus.append(unit);
    const rest = this.known ? `В лейке ${Math.floor((this.haveX100 + gainedX100) / 100)} из ${this.maxCharges} 💧` : '';
    const reason = why ? WHY[why] : '';
    const sub = div('sub', [rest, afk ? 'без движения больше трети не набрать' : reason].filter(Boolean).join(' · '));
    this.res.append(h, plus, sub);
    this.res.classList.toggle('gold', full);
    this.res.classList.add('show');
  }

  // ------------------------------------------------------------ закрытие

  /** Esc или ×: налитое к этому моменту засчитывается */
  private abort(): void {
    if (!this.open) return;
    if (!this.finished) {
      this.finished = true;
      const cb = this.done;
      this.done = null;
      cb?.(this.samples);
    }
    this.shut(true);
  }

  /** Спрятать окно; notify — вернуть сцене мышь */
  private shut(notify: boolean): void {
    if (!this.open) return;
    this.open = false;
    window.clearTimeout(this.closeTimer);
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.sfx.end();
    this.down = false;
    this.kb = false;
    this.done = null;
    this.el.classList.remove('show');
    this.hideTimer = window.setTimeout(() => { if (!this.open) this.el.hidden = true; }, 220);
    if (notify) this.opts.closed?.();
  }
}
