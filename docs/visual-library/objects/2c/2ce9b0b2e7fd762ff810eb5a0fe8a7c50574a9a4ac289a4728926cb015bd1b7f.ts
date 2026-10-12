// Мини-игра «Набери лейку» у корыта колодца (design-v11 §7, часть B4). Сервер на fillStart тратит набор воды и шлёт
// зерно (событие fill); сцена зовёт start(seed, done, can), игра копит отсчёты (shared/farmwell.ts: на тик 30 Гц пара
// «x ведра 0–1000, наклон 0–1») и отдаёт их в done — сцена шлёт fillEnd, а долю набранного пересчитывает сервер той же
// моделью. Пока open — сцена не берёт ввод. Мышь двигает ведро, ЛКМ (или пробел) наклоняет, Esc и × закрывают окно:
// налитое к этому моменту засчитывается. Окно рисует то, что считает общая модель, поэтому экран и сервер сходятся.
// Рамка — окно кита (lab/ui/screens/farm.js «Набери лейку»): шапка с колодцем, бирка «64 % · 6 из 10 зарядов», полоса времени,
// управление в подвале; итог — баннер кита в центре поля. Само поле (canvas) — как было.
import { WELL, WELL_AFK_SHARE, WELL_HZ, WELL_X, newWell, stepWell, wellAfk, wellShare, type WellEnd, type WellSim } from '../../shared/farmwell.ts';
import { WELL_SETS } from '../../shared/farmdata.ts';
import { keyHtml } from '../ui/kit/dom.ts';
import { sfx as uiSfx, bindClickSounds } from '../ui/kit/sfx.ts';
import { fi, iconUrl, plural, fmtLeft, ui } from './ui/common.ts';
import { WellPainter, type WellView } from './well/draw.ts';
import { WellSfx } from './well/sound.ts';
import './well/well.css';

const DT = 1 / WELL_HZ;

export interface FarmWellOpts {
  /** Громкость звука 0…1 (общая × эффекты); без неё звук по умолчанию 0,7 */
  volume?: () => number;
  /** Окно закрылось (сцене вернуть мышь) */
  closed?: () => void;
  /** Колодец сейчас: сколько вёдер и когда будет новое (мс серверного времени, 0 — полон); для шапки и итога */
  wellInfo?: () => { sets: number; nextAt: number; now: number };
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

/** Управление в подвале, пока наливаешь */
const CONTROLS = `
  <span class="farm-ctl"><span class="k-key k-key--lg"><i class="k-mouse k-mouse--move"></i></span>Веди ведро</span>
  <span class="farm-ctl">Зажми <span class="k-key k-key--lg"><i class="k-mouse k-mouse--l"></i></span> или ${keyHtml('Space', undefined, 'lg')} — лей в горлышко</span>
  <span class="k-note farm-well-esc">${keyHtml('Esc', undefined, 'sm')} закончить — налитое останется</span>`;

export class FarmWell {
  /** Мини-игра на экране */
  open = false;
  /** Модель текущей попытки (для проверок и отладки) */
  sim: WellSim | null = null;
  private readonly opts: FarmWellOpts;
  private readonly sfx: WellSfx;
  private readonly el = document.createElement('dialog');
  private readonly eyebrow: HTMLElement;
  private readonly stage = div('farm-field fw-stage');
  private readonly canvas = document.createElement('canvas');
  private readonly tag = div('k-plate farm-tag');
  private readonly pct = document.createElement('b');
  private readonly sub = document.createElement('span');
  private readonly tagMeter = document.createElement('div');
  private readonly time = div('k-pill k-pill--plate farm-time');
  private readonly timeBar = document.createElement('div');
  private readonly timeText = document.createElement('b');
  private readonly foot = document.createElement('footer');
  private readonly res = div('farm-field-hero');
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
  private tagKey = '';
  private endTilt = 0;
  private endWhy: WellEnd | null = null;

  constructor(_root: HTMLElement, opts: FarmWellOpts = {}) {
    this.opts = opts;
    this.sfx = new WellSfx(opts.volume ?? (() => 0.7));
    const d = this.el;
    d.className = 'k-scrim farm-scrim fw';
    d.dataset.mode = 'farm';
    d.setAttribute('aria-label', 'Набери лейку');
    d.tabIndex = -1;
    d.innerHTML = `<section class="k-window farm-wellwin">
      <header class="k-win-head">
        <span class="k-win-portrait"><img src="${iconUrl('well')}" alt="" draggable="false"></span>
        <div class="k-win-titles"><p class="k-eyebrow">Колодец</p><h2 class="k-win-title">Набери лейку</h2></div>
        <div class="k-win-tools"><button class="k-close" type="button" aria-label="Закончить"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
      </header>
    </section>`;
    const win = d.querySelector('section')!;
    this.eyebrow = d.querySelector('.k-eyebrow')!;
    this.tag.append(this.pct, this.sub, this.tagMeter);
    this.pct.className = 'farm-tag-p';
    this.sub.className = 'farm-tag-c';
    this.tagMeter.className = 'k-meter k-meter--info k-meter--thin';
    this.tagMeter.innerHTML = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';
    this.timeBar.className = 'k-meter k-meter--thin farm-time-m';
    this.timeBar.innerHTML = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';
    this.time.innerHTML = ui('stopwatch');
    this.time.append(this.timeBar, this.timeText);
    this.canvas.className = 'fw-canvas';
    this.canvas.setAttribute('aria-label', 'Мини-игра: набери лейку');
    this.stage.append(this.canvas, this.tag, this.time, this.res);
    this.foot.className = 'k-win-foot farm-well-foot';
    win.append(this.stage, this.foot);
    d.querySelector('.k-close')!.addEventListener('click', () => this.abort());
    d.addEventListener('cancel', (e) => { e.preventDefault(); this.abort(); });
    d.addEventListener('pointermove', (e) => this.point(e));
    d.addEventListener('pointerdown', (e) => {
      if ((e.button !== 0 && e.pointerType === 'mouse') || (e.target as Element).closest('button')) return;
      e.preventDefault();
      this.point(e);
      this.down = true;
      this.stage.classList.add('down');
      try { d.setPointerCapture(e.pointerId); } catch { /* не страшно */ }
    });
    const up = (): void => { this.down = false; this.stage.classList.remove('down'); };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    bindClickSounds(d);
    document.body.appendChild(d);
  }

  /**
   * Начать попытку: seed от сервера (событие fill), done получит отсчёты (сцена шлёт их в fillEnd), can — сколько воды
   * в лейке и сколько влезает, в «зарядах ×100». Без can показываем только проценты.
   */
  start(seed: number, done: (samples: number[]) => void, can?: WellCanInfo): void {
    if (this.open) this.shut(false);
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
    this.res.className = 'farm-field-hero';
    this.res.textContent = '';
    this.time.hidden = true;
    this.time.classList.remove('is-low');
    this.timeBar.style.setProperty('--v', '1');
    this.stage.classList.remove('down');
    this.foot.innerHTML = CONTROLS;
    this.foot.classList.remove('is-result');
    this.setEyebrow();
    if (!this.el.open) {
      this.el.showModal();
      this.el.focus({ preventScroll: true });
    }
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
    uiSfx.play('open');
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
    } else if (e.code === 'KeyE' && this.finished) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.shut(true);
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
      this.timeBar.style.setProperty('--v', left.toFixed(3));
      const sec = Math.ceil(left * WELL.duration);
      if (this.timeText.textContent !== `${sec} с`) this.timeText.textContent = `${sec} с`;
      this.time.hidden = false;
      this.time.classList.toggle('is-low', left < 0.25);
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
    this.sub.innerHTML = this.known ? `${fi('watering-can')}${have} из ${this.maxCharges} ${charges(this.maxCharges)}` : '';
    this.tagMeter.style.setProperty('--v', level.toFixed(3));
    this.tag.classList.toggle('is-full', pct >= 100);
  }

  /** Налив кончился сам: отдать отсчёты серверу и показать итог */
  private finish(why: WellEnd): void {
    if (this.finished) return;
    this.finished = true;
    this.stage.classList.remove('down');
    this.time.hidden = true;
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

  /** «Колодец · ведро 3 из 4»: сколько уже взято из четырёх (пока сервер не прислал — просто «Колодец») */
  private setEyebrow(): void {
    const w = this.opts.wellInfo?.();
    const taken = w ? WELL_SETS - w.sets : 0;
    this.eyebrow.textContent = taken >= 1 && taken <= WELL_SETS ? `Колодец · ведро ${taken} из ${WELL_SETS}` : 'Колодец';
  }

  private showResult(gainedX100: number, why: WellEnd | null): void {
    const sim = this.sim!;
    const level = Math.min(1, this.base + Math.min(1, wellShare(this.seed, this.samples)));
    const full = level >= 0.995;
    const n = gainedX100 / 100;
    const afk = wellAfk(sim) && sim.fill >= WELL_AFK_SHARE;
    const pct = Math.round(level * 100);
    const share = Math.min(1, wellShare(this.seed, this.samples));
    const title = full ? 'Полная лейка!' : why === 'idle' ? 'Налив не начат' : n <= 0 ? 'Мимо!' : share >= 0.6 ? 'Отлично!' : share >= 0.3 ? 'Неплохо!' : 'Могло быть лучше';
    const w = this.opts.wellInfo?.();
    const bucket = w ? `<span class="k-pill k-pill--plate">${fi('bucket')}В колодце ${w.sets > 0 ? `ещё ${w.sets} ${plural(w.sets, 'ведро', 'ведра', 'вёдер')}` : 'вёдер не осталось'}${w.nextAt > w.now ? ` · новое через ${fmtLeft(w.nextAt - w.now)}` : ''}</span>` : '';
    this.res.innerHTML = `<div class="k-hero k-hero--${full ? 'gold' : n > 0 ? 'win' : 'info'} is-pop"><p class="k-hero-title is-sm">${title}</p><span class="k-hero-sub">${fi('watering-can')}+${comma(n)} ${charges(n)} · ${pct} %</span></div>${bucket}`;
    this.res.classList.add('is-show');
    const reason = afk ? 'без движения больше трети не набрать' : why ? WHY[why] : '';
    this.foot.classList.add('is-result');
    this.foot.innerHTML = `<span class="k-note">${reason ? `${reason} · ` : ''}Окно закроется само через секунду</span><button class="k-btn k-btn--go" type="button" data-done data-sfx="reward">Готово${keyHtml('E', 'tr')}</button>`;
    this.foot.querySelector('[data-done]')!.addEventListener('click', () => this.shut(true));
    this.setEyebrow();
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
    // закрываем сразу: пока модальное окно открыто, сцена не получит захват мыши
    if (this.el.open) this.el.close();
    if (notify) this.opts.closed?.();
  }
}
