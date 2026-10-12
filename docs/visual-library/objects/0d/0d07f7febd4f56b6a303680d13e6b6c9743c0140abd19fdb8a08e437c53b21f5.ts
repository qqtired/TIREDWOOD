// Телефоны и планшеты. Сенсорный экран определяется один раз при запуске (?touch=1 / ?touch=0 — включить или
// выключить для проверки). Управление пальцами — слой поверх сцены: слева джойстик (в гонке — руль ◀ ▶), справа обзор
// пальцем и кнопки, сверху — пауза, чат, «кто где» и эмоции. Кнопки нажимают те же клавиши (Input.tap), что и
// клавиатура, — сцены не знают, чем ими управляют.
import type { Input } from './input.ts';

export const TOUCH = detectTouch();

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(location.search).get('touch');
  if (q !== null) return q !== '0';
  return window.matchMedia?.('(pointer: coarse)').matches === true;
}

/**
 * Раскладка кнопок: бег по набережной, с удочкой, у автомата, гонка, пейнтбол, поездка на катере (без кнопок —
 * весь экран, чтобы осмотреться); none — только верхние кнопки (за столом дурака и в примерочной на экране свои кнопки).
 */
export type TouchMode = 'walk' | 'fish' | 'slot' | 'kart' | 'shoot' | 'ride' | 'fight' | 'none';
/** Что видно: ничего (меню, пауза, открыт чат), только верхние кнопки, всё */
export type TouchShow = 'off' | 'bar' | 'all';

interface Pad {
  /** Имя для CSS (там же — место на экране) */
  id: string;
  /** Клавиши, которые держит кнопка; 'mouse0' — огонь, 'mouse2' — прицел */
  codes: readonly string[];
  icon: string;
  /** Подпись под кнопкой */
  name: string;
  modes: readonly TouchMode[];
  /** Нажал — включилась, нажал ещё — выключилась (прицел) */
  toggle?: boolean;
  /** Ведёшь пальцем, не отпуская, — заодно поворачиваешь взгляд (огонь) */
  look?: boolean;
}

const PADS: readonly Pad[] = [
  { id: 'jump', codes: ['Space'], icon: '⤒', name: 'прыжок', modes: ['walk', 'shoot', 'fight'] },
  { id: 'use', codes: ['KeyE'], icon: 'E', name: 'действие', modes: ['walk', 'fish'] },
  { id: 'dash', codes: ['ShiftLeft'], icon: '»', name: 'рывок', modes: ['walk', 'shoot', 'fight'] },
  { id: 'cast', codes: ['Space'], icon: '🎣', name: 'заброс', modes: ['fish'] },
  { id: 'spin', codes: ['Space'], icon: '🎰', name: 'крутить', modes: ['slot'] },
  { id: 'fire', codes: ['mouse0'], icon: '💥', name: 'огонь', modes: ['shoot'], look: true },
  { id: 'reload', codes: ['KeyR'], icon: '↻', name: 'перезарядка', modes: ['shoot'] },
  { id: 'ads', codes: ['mouse2'], icon: '🔍', name: 'прицел', modes: ['shoot'], toggle: true },
  { id: 'shoulder', codes: ['KeyQ'], icon: '⇄', name: 'плечо', modes: ['shoot'] },
  // гонка: руль ◀ ▶ — отдельно (tc-steer), бонус — нажать на его значок в интерфейсе гонки (race/hud.ts)
  { id: 'gas', codes: ['KeyW'], icon: '▲', name: 'газ', modes: ['kart'] },
  // занос — с газом: правый палец держит одну кнопку, а не две
  { id: 'drift', codes: ['KeyW', 'Space'], icon: '⤴', name: 'занос', modes: ['kart'] },
  { id: 'brake', codes: ['KeyS'], icon: '▼', name: 'тормоз', modes: ['kart'] },
  { id: 'back', codes: ['KeyR'], icon: '↺', name: 'на трассу', modes: ['kart'] },
  // «Fight Club»: удар — ведёшь пальцем, заодно поворачиваешь; блок держат (Q); захват и бросок — E
  { id: 'punch', codes: ['mouse0'], icon: '👊', name: 'удар', modes: ['fight'], look: true },
  { id: 'heavy', codes: ['mouse2'], icon: '💥', name: 'тяжёлый', modes: ['fight'] },
  { id: 'block', codes: ['KeyQ'], icon: '🛡', name: 'блок', modes: ['fight'] },
  { id: 'grab', codes: ['KeyE'], icon: '✊', name: 'захват', modes: ['fight'] },
];

const EMOTES: ReadonlyArray<readonly [string, string]> = [
  ['👋', 'помахать'],
  ['💃', 'танец'],
  ['😴', 'устал'],
  ['😂', 'смех'],
  ['🖐', 'дай пять'],
  ['🤗', 'обняться'],
];

/** Джойстик: радиус хода ручки, px; мёртвая зона — доля радиуса; дальше этого (в радиусах) база едет за пальцем */
const STICK_R = 56;
const STICK_DEAD = 0.3;
const STICK_FOLLOW = 1.5;
/** Направление засчитывается от 22,5° до оси: восемь сторон, как на клавишах */
const STICK_AXIS = 0.38;

/** Джойстик отклонён на (dx, dy) px от центра (y — вниз): какие клавиши держать — одна или две (наискосок). */
export function stickKeys(dx: number, dy: number): string[] {
  const d = Math.hypot(dx, dy);
  const keys: string[] = [];
  if (d <= STICK_R * STICK_DEAD) return keys;
  const f = -dy / d;
  const s = dx / d;
  if (f > STICK_AXIS) keys.push('KeyW');
  else if (f < -STICK_AXIS) keys.push('KeyS');
  if (s > STICK_AXIS) keys.push('KeyD');
  else if (s < -STICK_AXIS) keys.push('KeyA');
  return keys;
}

export type SteerKey = 'ArrowLeft' | 'ArrowRight';

/** Руль: сторона меняется, когда палец ушёл за шов дальше этого, px — у шва не дребезжит */
const STEER_HYST = 10;

/**
 * Руль в гонке — одна полоса ◀ ▶ без щели: палец на x (px экрана), шов между половинками — на seam, was — что палец
 * держит (null — только коснулся). Коснулся — сторона по тому, левее шва палец или правее (мимо не бывает); ведёшь,
 * не отрывая, — руль перекладывается, где бы палец ни был по высоте.
 */
export function steerKey(x: number, seam: number, was: SteerKey | null): SteerKey {
  if (was === 'ArrowLeft') return x > seam + STEER_HYST ? 'ArrowRight' : was;
  if (was === 'ArrowRight') return x < seam - STEER_HYST ? 'ArrowLeft' : was;
  return x < seam ? 'ArrowLeft' : 'ArrowRight';
}

type Grip =
  | { kind: 'stick'; x0: number; y0: number; codes: string[] }
  | { kind: 'look'; x: number; y: number }
  | { kind: 'steer'; seam: number; code: SteerKey }
  | { kind: 'pad'; el: HTMLElement; pad: Pad; x: number; y: number };

export class TouchControls {
  onPause: () => void = () => {};
  onChat: () => void = () => {};
  private readonly input: Input;
  private readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  /** Руль в гонке: половинки ◀ ▶ (горят, пока их держат) */
  private readonly steerL: HTMLElement;
  private readonly steerR: HTMLElement;
  private readonly emotes: HTMLElement;
  private readonly who: HTMLElement;
  private mode: TouchMode = 'none';
  private show: TouchShow = 'off';
  /** Пальцы на экране: pointerId → что держит */
  private readonly grips = new Map<number, Grip>();
  /** Сколько пальцев держат клавишу (газ держат и «▲», и «занос») */
  private readonly held = new Map<string, number>();
  private whoOn = false;
  /** Надпись на кнопке действия (у статуи — «F») */
  private useIcon: HTMLElement | null = null;

  constructor(parent: HTMLElement, input: Input) {
    this.input = input;
    const root = (this.root = el('div', 'tc'));
    root.dataset.mode = 'none';
    root.dataset.show = 'off';
    root.append(el('div', 'tc-zone tc-stick-zone'), el('div', 'tc-zone tc-look'));
    this.base = root.appendChild(el('div', 'tc-stick'));
    this.knob = this.base.appendChild(el('i', ''));
    // руль: зона пальца шире видимых ◀ ▶ — от края экрана и с запасом вокруг (места — в CSS)
    const steer = root.appendChild(el('div', 'tc-steer'));
    this.steerL = steer.appendChild(el('div', 'tc-steer-l'));
    this.steerL.appendChild(el('b', '')).textContent = '◀';
    this.steerR = steer.appendChild(el('div', 'tc-steer-r'));
    this.steerR.appendChild(el('b', '')).textContent = '▶';
    for (let i = 0; i < PADS.length; i++) {
      const p = PADS[i];
      const b = root.appendChild(el('div', `tc-pad p-${p.id}`));
      b.dataset.pad = String(i);
      b.dataset.m = p.modes.join(' ');
      const icon = b.appendChild(el('b', ''));
      icon.textContent = p.icon;
      if (p.id === 'use') this.useIcon = icon;
      if (p.name) b.appendChild(el('small', '')).textContent = p.name;
    }
    const bar = root.appendChild(el('div', 'tc-bar'));
    const barBtn = (cls: string, icon: string, title: string, on: () => void): HTMLElement => {
      const b = bar.appendChild(el('button', `tc-btn ${cls}`));
      b.textContent = icon;
      b.title = title;
      // click, а не pointerdown: только в нём телефон даёт поставить курсор в поле чата и открыть клавиатуру
      b.addEventListener('click', on);
      return b;
    };
    barBtn('b-pause', '☰', 'Пауза и настройки', () => this.onPause());
    barBtn('b-chat', '💬', 'Чат', () => this.onChat());
    this.who = barBtn('b-who', '👥', 'Кто где · счёт', () => this.toggleWho());
    barBtn('b-emo', '😊', 'Эмоции', () => this.emotes.classList.toggle('show'));
    this.emotes = root.appendChild(el('div', 'tc-emotes'));
    EMOTES.forEach(([icon, name], i) => {
      const b = this.emotes.appendChild(el('button', 'tc-emote'));
      b.appendChild(el('b', '')).textContent = icon;
      b.appendChild(el('small', '')).textContent = name;
      b.addEventListener('click', () => {
        this.input.tap(`Digit${i + 1}`, true);
        this.input.tap(`Digit${i + 1}`, false);
        this.emotes.classList.remove('show');
      });
    });
    root.appendChild(el('div', 'tc-rotate')).textContent = '📱 Поверни телефон боком — так удобнее';

    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('pointermove', (e) => this.move(e));
    root.addEventListener('pointerup', (e) => this.up(e));
    root.addEventListener('pointercancel', (e) => this.up(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS: два пальца (руль и газ) Safari норовит принять за щипок — масштаб, долгое касание — за выделение текста;
    // и то и другое отменяет касание (pointercancel), и кнопка отпускается сама. На кнопках и руле — запрещаем
    // (верхним кнопкам и эмоциям нужен click — их не трогаем).
    const guard = (e: TouchEvent): void => {
      if (!(e.target as HTMLElement).closest('.tc-bar, .tc-emotes')) e.preventDefault();
    };
    root.addEventListener('touchstart', guard, { passive: false });
    root.addEventListener('touchmove', guard, { passive: false });
    parent.appendChild(root);
  }

  /** Раз в кадр: какая раскладка и что видно. Сменилась — всё, что держали, отпускаем. */
  sync(mode: TouchMode, show: TouchShow, useIcon = 'E'): void {
    if (this.useIcon && this.useIcon.textContent !== useIcon) this.useIcon.textContent = useIcon;
    if (mode === this.mode && show === this.show) return;
    if (show !== 'all' || mode !== this.mode) this.releaseAll();
    if (show === 'off' && this.whoOn) this.toggleWho();
    if (mode !== 'walk' || show !== 'all') this.emotes.classList.remove('show');
    this.mode = mode;
    this.show = show;
    const useLabel = this.root.querySelector('.p-use small');
    if (useLabel) useLabel.textContent = mode === 'fish' ? 'встать' : 'действие';
    this.root.dataset.mode = mode;
    this.root.dataset.show = show;
  }

  // ------------------------------------------------------------ пальцы

  private down(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('.tc-bar, .tc-emotes')) return;
    if (this.show !== 'all') return;
    e.preventDefault();
    this.emotes.classList.remove('show');
    const padEl = t.closest<HTMLElement>('[data-pad]');
    if (padEl) {
      const pad = PADS[Number(padEl.dataset.pad)];
      if (pad.toggle) {
        const on = !padEl.classList.contains('on');
        padEl.classList.toggle('on', on);
        for (const c of pad.codes) this.press(c, on);
        return;
      }
      this.grips.set(e.pointerId, { kind: 'pad', el: padEl, pad, x: e.clientX, y: e.clientY });
      for (const c of pad.codes) this.press(c, true);
      padEl.classList.add('down');
    } else if (t.closest('.tc-steer')) {
      // шов — посередине между половинками
      const seam = (this.steerL.getBoundingClientRect().right + this.steerR.getBoundingClientRect().left) / 2;
      const code = steerKey(e.clientX, seam, null);
      this.grips.set(e.pointerId, { kind: 'steer', seam, code });
      this.press(code, true);
      this.paintSteer();
    } else if (t.classList.contains('tc-stick-zone')) {
      // база джойстика — под пальцем, но целиком на экране
      const r = this.root.getBoundingClientRect();
      const m = STICK_R + 10;
      const x0 = Math.min(Math.max(e.clientX - r.left, m), r.width - m);
      const y0 = Math.min(Math.max(e.clientY - r.top, m), r.height - m);
      this.grips.set(e.pointerId, { kind: 'stick', x0, y0, codes: [] });
      this.base.classList.add('on');
      this.placeStick(x0, y0, 0, 0);
    } else if (t.classList.contains('tc-look')) {
      this.grips.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    } else {
      return;
    }
    // все движения этого пальца — сюда, даже если он уехал с кнопки
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // палец уже убрали
    }
  }

  private move(e: PointerEvent): void {
    const g = this.grips.get(e.pointerId);
    if (!g) return;
    if (g.kind === 'look') {
      this.input.turn(e.clientX - g.x, e.clientY - g.y);
      g.x = e.clientX;
      g.y = e.clientY;
    } else if (g.kind === 'stick') {
      this.moveStick(g, e.clientX, e.clientY);
    } else if (g.kind === 'steer') {
      const code = steerKey(e.clientX, g.seam, g.code);
      if (code === g.code) return;
      this.press(code, true);
      this.press(g.code, false);
      g.code = code;
      this.paintSteer();
    } else if (g.pad.look) {
      this.input.turn(e.clientX - g.x, e.clientY - g.y);
      g.x = e.clientX;
      g.y = e.clientY;
    } else {
      // палец съехал на соседнюю кнопку — теперь держит её (как на кнопках геймпада)
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-pad]');
      if (!under || under === g.el || !this.root.contains(under)) return;
      const pad = PADS[Number(under.dataset.pad)];
      if (pad.toggle || pad.look || !pad.modes.includes(this.mode)) return;
      for (const c of pad.codes) this.press(c, true);
      for (const c of g.pad.codes) this.press(c, false);
      g.el.classList.remove('down');
      under.classList.add('down');
      g.el = under;
      g.pad = pad;
    }
  }

  private up(e: PointerEvent): void {
    const g = this.grips.get(e.pointerId);
    if (!g) return;
    this.grips.delete(e.pointerId);
    this.release(g);
  }

  private release(g: Grip): void {
    if (g.kind === 'pad') {
      for (const c of g.pad.codes) this.press(c, false);
      g.el.classList.remove('down');
    } else if (g.kind === 'steer') {
      this.press(g.code, false);
      this.paintSteer();
    } else if (g.kind === 'stick') {
      for (const c of g.codes) this.press(c, false);
      g.codes = [];
      this.base.classList.remove('on');
      this.base.style.transform = '';
      this.knob.style.transform = '';
    }
  }

  private releaseAll(): void {
    for (const g of this.grips.values()) this.release(g);
    this.grips.clear();
    for (const b of this.root.querySelectorAll<HTMLElement>('.tc-pad.on')) {
      b.classList.remove('on');
      for (const c of PADS[Number(b.dataset.pad)].codes) this.press(c, false);
    }
    // что осталось нажатым (на всякий случай) — отпустить
    for (const [c, n] of this.held) if (n > 0) this.send(c, false);
    this.held.clear();
    this.paintSteer();
  }

  /** Половинка руля горит, пока её держит хоть один палец */
  private paintSteer(): void {
    this.steerL.classList.toggle('down', (this.held.get('ArrowLeft') ?? 0) > 0);
    this.steerR.classList.toggle('down', (this.held.get('ArrowRight') ?? 0) > 0);
  }

  // ------------------------------------------------------------ джойстик

  private moveStick(g: Extract<Grip, { kind: 'stick' }>, cx: number, cy: number): void {
    const r = this.root.getBoundingClientRect();
    const x = cx - r.left;
    const y = cy - r.top;
    let dx = x - g.x0;
    let dy = y - g.y0;
    let d = Math.hypot(dx, dy);
    // палец ушёл далеко за край — база подтягивается за ним
    if (d > STICK_R * STICK_FOLLOW) {
      const k = 1 - (STICK_R * STICK_FOLLOW) / d;
      g.x0 += dx * k;
      g.y0 += dy * k;
      dx = x - g.x0;
      dy = y - g.y0;
      d = Math.hypot(dx, dy);
    }
    const codes = stickKeys(dx, dy);
    for (const c of codes) if (!g.codes.includes(c)) this.press(c, true);
    for (const c of g.codes) if (!codes.includes(c)) this.press(c, false);
    g.codes = codes;
    const k = d > STICK_R ? STICK_R / d : 1;
    this.placeStick(g.x0, g.y0, dx * k, dy * k);
  }

  private placeStick(x0: number, y0: number, kx: number, ky: number): void {
    this.base.style.transform = `translate(${(x0 - STICK_R).toFixed(1)}px, ${(y0 - STICK_R).toFixed(1)}px)`;
    this.knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
  }

  // ------------------------------------------------------------ клавиши

  /** Нажать или отпустить клавишу; одну клавишу могут держать два пальца — отпускаем, когда уберут оба. */
  private press(code: string, down: boolean): void {
    const n = this.held.get(code) ?? 0;
    const next = down ? n + 1 : Math.max(0, n - 1);
    this.held.set(code, next);
    if ((n === 0) !== (next === 0)) this.send(code, down);
  }

  private send(code: string, down: boolean): void {
    if (code === 'mouse0') this.input.touchButton(0, down);
    else if (code === 'mouse2') this.input.touchButton(2, down);
    else this.input.tap(code, down);
  }

  /** «Кто где» (на складе — счёт): нажал — открыто, ещё раз — закрыто. */
  private toggleWho(): void {
    this.whoOn = !this.whoOn;
    this.who.classList.toggle('on', this.whoOn);
    this.input.tap('Tab', this.whoOn);
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
