// Клавиатура и мышь. Мышь поворачивает взгляд сразу в обработчике события —
// камера рисуется с самым свежим углом, без задержки на тик симуляции.
// На телефоне мышь не захватывают: «захвачено» значит «управление пальцами включено», а экранные кнопки
// (touch.ts) нажимают те же клавиши через tap().
import { PITCH_LIMIT } from '../shared/protocol.ts';
import { BTN_ADS, BTN_BACK, BTN_DASH, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, BTN_USE } from '../shared/sim.ts';
import { TOUCH } from './touch.ts';

const KEYMAP: Record<string, number> = {
  KeyW: BTN_FORWARD,
  ArrowUp: BTN_FORWARD,
  KeyS: BTN_BACK,
  ArrowDown: BTN_BACK,
  KeyA: BTN_LEFT,
  ArrowLeft: BTN_LEFT,
  KeyD: BTN_RIGHT,
  ArrowRight: BTN_RIGHT,
  Space: BTN_JUMP,
  ShiftLeft: BTN_DASH,
  ShiftRight: BTN_DASH,
  KeyR: BTN_RELOAD,
  KeyE: BTN_USE,
};

/** Базовая чувствительность: радиан на «пиксель» мыши при sens = 1 */
const BASE_SENS = 0.0021;
/** Палец: радиан на пиксель экрана при sens = 1 (провёл через полэкрана телефона — повернулся на ~90°) */
const TOUCH_SENS = 0.0055;

/** Поля, в которые не печатают: после клика по ним фокус остаётся на них, а клавиши-команды должны работать */
const NOT_TEXT = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/** Фокус в поле, куда печатают (ник, код, чат): там клавиша — буква, а не команда. Неизвестное поле считаем текстовым. */
export function isTyping(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !NOT_TEXT.has((el as HTMLInputElement).type);
}

/**
 * M — «без звука». Не считаем: повторы при удержании, Ctrl / Cmd / Alt (команды браузера: в Firefox Ctrl+M глушит
 * вкладку) и набор текста в поле.
 */
export function isMuteKey(e: Pick<KeyboardEvent, 'code' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): boolean {
  return e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target as HTMLElement | null);
}

export class Input {
  yaw = 0;
  pitch = 0;
  sens = 1;
  adsSens = 0.8;
  /** В прицеле — ещё медленнее во столько раз (сцена ставит: оптика AWP в пейнтболе) */
  scopeSens = 1;
  /** Инверсия по вертикали (меню → Управление): мышь или палец вверх — взгляд вниз */
  invertY = false;
  locked = false;
  /** Сколько запросов захвата мыши ещё ждут ответа браузера */
  private pendingLocks = 0;
  /** Пока открыт чат/меню, игровые клавиши не работают */
  blocked = false;
  private held = 0;
  private latched = 0;
  private readonly canvas: HTMLCanvasElement;
  onLockChange: (locked: boolean) => void = () => {};
  onKey: (code: string, down: boolean, e: KeyboardEvent) => void = () => {};
  /** E или ЛКМ (mouse = true): что делать — решает сцена */
  onUse: (mouse: boolean) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => {
      this.held = 0;
    });
    document.addEventListener('mousemove', (e) => this.mouse(e));
    document.addEventListener('mousedown', (e) => this.button(e, true));
    document.addEventListener('mouseup', (e) => this.button(e, false));
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.held = 0;
      this.onLockChange(this.locked);
    });
  }

  /** Захват мыши запрошен, браузер ещё не ответил */
  get lockPending(): boolean {
    return this.pendingLocks > 0;
  }

  async lock(): Promise<void> {
    if (this.locked) return;
    if (TOUCH) {
      this.setLocked(true);
      return;
    }
    this.pendingLocks++;
    try {
      // unadjustedMovement: «сырая» мышь без системного ускорения — точнее прицел
      await (this.canvas.requestPointerLock as (o?: object) => Promise<void>).call(this.canvas, { unadjustedMovement: true });
    } catch {
      try {
        await (this.canvas.requestPointerLock as () => Promise<void> | void).call(this.canvas);
      } catch {
        // браузер не дал — останемся на экране «кликни, чтобы играть»
      }
    } finally {
      this.pendingLocks--;
    }
  }

  unlock(): void {
    if (TOUCH) this.setLocked(false);
    else if (document.pointerLockElement) document.exitPointerLock();
  }

  /**
   * Телефон: «захват» без мыши. Как и pointerlockchange, сообщаем чуть позже: сцена, что отпустила мышь
   * (села за стол), успеет дописать своё состояние — иначе оболочка решит, что пора на паузу.
   */
  private setLocked(v: boolean): void {
    if (this.locked === v) return;
    this.locked = v;
    if (!v) this.held = 0;
    queueMicrotask(() => {
      if (this.locked === v) this.onLockChange(v);
    });
  }

  /** Экранная кнопка — как клавиша: тот же onKey сцены и те же биты ввода. */
  tap(code: string, down: boolean): void {
    this.key(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, cancelable: true }), down);
  }

  /** «Огонь» (0) и «прицел» (2) пальцем — как кнопки мыши. */
  touchButton(button: 0 | 2, down: boolean): void {
    this.press(button === 0 ? BTN_FIRE : BTN_ADS, down);
  }

  /** Обзор пальцем: сдвиг в пикселях экрана. */
  turn(dx: number, dy: number): void {
    if (this.blocked) return;
    this.rotate(dx, dy, TOUCH_SENS);
  }

  /** Кнопки на этот тик. Короткие нажатия между тиками не теряются. */
  sample(): number {
    const b = this.blocked ? 0 : this.held | this.latched;
    this.latched = 0;
    return b;
  }

  isHeld(bit: number): boolean {
    return !this.blocked && (this.held & bit) !== 0;
  }

  releaseAll(): void {
    this.held = 0;
    this.latched = 0;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    this.onKey(e.code, down, e);
    if (e.defaultPrevented) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const bit = KEYMAP[e.code];
    if (bit === undefined) return;
    if (this.locked) e.preventDefault();
    if (this.blocked) return;
    if (down) {
      if (e.repeat) return;
      this.held |= bit;
      this.latched |= bit;
      if (bit === BTN_USE) this.onUse(false);
    } else {
      this.held &= ~bit;
    }
  }

  private button(e: MouseEvent, down: boolean): void {
    // на телефоне за касанием идут и «мышиные» события — их не считаем
    if (!this.locked || TOUCH) return;
    const bit = e.button === 0 ? BTN_FIRE : e.button === 2 ? BTN_ADS : 0;
    if (bit) this.press(bit, down);
  }

  /** Огонь или прицел: ЛКМ / ПКМ или кнопка на экране телефона. */
  private press(bit: number, down: boolean): void {
    if (down) {
      if (this.blocked) return;
      this.held |= bit;
      this.latched |= bit;
      if (bit === BTN_FIRE) this.onUse(true);
    } else {
      this.held &= ~bit;
    }
  }

  private mouse(e: MouseEvent): void {
    if (!this.locked || TOUCH) return;
    const dx = e.movementX;
    const dy = e.movementY;
    // Известный баг Chrome: изредка прилетает гигантский скачок — выкидываем
    if (Math.abs(dx) > 600 || Math.abs(dy) > 600) return;
    this.rotate(dx, dy, BASE_SENS);
  }

  /** Повернуть взгляд на (dx, dy) «пикселей»; в прицеле медленнее. */
  private rotate(dx: number, dy: number, base: number): void {
    const ads = (this.held & BTN_ADS) !== 0;
    const k = base * this.sens * (ads ? this.adsSens * 0.8 * this.scopeSens : 1);
    this.yaw -= dx * k;
    this.pitch -= (this.invertY ? -dy : dy) * k;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
    // держим yaw в разумных пределах, чтобы float32 не терял точность
    if (this.yaw > Math.PI * 64 || this.yaw < -Math.PI * 64) this.yaw %= Math.PI * 2;
  }
}
