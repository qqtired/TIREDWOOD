// Фото у маяка: тем, кто рядом, — отсчёт «3, 2, 1» и вспышка; у кого был у маяка — снимок с фотоаппарата на
// штативе (кадр рисует тот же рендер с неподвижной камеры прямо перед обычным кадром — на экране его не видно)
// в белой рамке с подписью «кто на фото» и кнопкой «Сохранить» (F). Карточка — над меню: сохранить можно и на паузе.
// На телефоне «Сохранить» открывает «Поделиться» — там есть «Сохранить фото» (файлом телефон скачивает неудобно).
import * as THREE from 'three';
import { PHOTO } from '../../shared/maps/lobby.ts';
import { TOUCH } from '../touch.ts';
import { PHOTO_LENS_Y, type LobbyWorld } from './world.ts';

/** Отсчёт виден и слышен ближе стольких метров от площадки перед маяком; снимок достаётся тем, кто ближе PHOTO_KEEP */
export const PHOTO_HEAR = 30;
export const PHOTO_KEEP = 12;
/** От нажатия до вспышки, с */
export const PHOTO_COUNT_S = 3;
/** Карточка со снимком висит столько, мс */
const CARD_MS = 30000;
/** Кадр 3 : 2 и вертикальный обзор объектива */
const ASPECT = 1.5;
const FOV_V = 50;
/** Где объектив фотоаппарата на штативе — отсюда и снимаем */
export const PHOTO_LENS = new THREE.Vector3(PHOTO.x + 0.03, PHOTO_LENS_Y, PHOTO.z + 0.2);
/** Куда смотрит объектив: чуть выше голов перед маяком — чтобы влезла башня */
const LOOK = new THREE.Vector3(PHOTO.spotX, 1.9, PHOTO.spotZ + 3);
/** Подписываем тех, кто в кадре и не дальше стольких метров от штатива (вдали на набережной — нет) */
const NAME_R = 14;
/** Снимок в рамке: ширина кадра, поля, нижнее поле под подпись, px */
const OUT_W = 1440;
const PAD = 54;
const FOOT = 196;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export interface PhotoPerson {
  nick: string;
  x: number;
  y: number;
  z: number;
}

export class PhotoBooth {
  /** Каждая секунда отсчёта (для писка) */
  onBeep: () => void = () => {};
  private readonly count: HTMLElement;
  private readonly digitEl: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly card: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly cam = new THREE.PerspectiveCamera(FOV_V, ASPECT, 0.15, 600);
  private readonly v = new THREE.Vector3();
  /** До вспышки, с (0 — отсчёта нет) */
  private left = 0;
  private digit = 0;
  private url = '';
  private blob: Blob | null = null;
  private fileName = '';
  private hideTimer = 0;

  /** hud — слой набережной (отсчёт и вспышка), overlay — слой над меню (карточка со снимком) */
  constructor(hud: HTMLElement, overlay: HTMLElement) {
    this.count = el('div', 'ph-count');
    this.digitEl = this.count.appendChild(el('b', ''));
    this.count.appendChild(el('span', '')).textContent = '📸 Фото у маяка — все в кадр!';
    this.flashEl = el('div', 'ph-flash');
    hud.append(this.flashEl, this.count);

    this.card = el('div', 'ph-card');
    this.img = this.card.appendChild(document.createElement('img'));
    this.img.alt = 'Фото у маяка';
    const row = this.card.appendChild(el('div', 'ph-row'));
    this.saveBtn = row.appendChild(document.createElement('button'));
    this.saveBtn.className = 'ph-save';
    const close = row.appendChild(document.createElement('button'));
    close.className = 'ph-close';
    close.title = 'Закрыть';
    close.textContent = '✕';
    this.saveBtn.addEventListener('click', () => this.save());
    close.addEventListener('click', () => this.hide());
    overlay.appendChild(this.card);
  }

  /** Есть снимок, который можно сохранить */
  get hasCard(): boolean {
    return this.card.classList.contains('show');
  }

  /** Нажали у штатива: «3, 2, 1» по центру экрана. */
  startCount(): void {
    this.left = PHOTO_COUNT_S;
    this.digit = 0;
  }

  update(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    const d = Math.ceil(this.left);
    if (this.left <= 0) {
      this.left = 0;
      this.count.classList.remove('show');
      return;
    }
    if (d === this.digit) return;
    this.digit = d;
    this.digitEl.textContent = String(d);
    // каждая цифра — заново с анимацией
    this.count.classList.remove('show');
    void this.count.offsetWidth;
    this.count.classList.add('show');
    this.onBeep();
  }

  /** Белая вспышка на весь экран. */
  flash(): void {
    this.left = 0;
    this.count.classList.remove('show');
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  /**
   * Снимок: кадр с объектива штатива — тем же рендером на тот же холст (его сразу перерисует обычный кадр),
   * середина 3 : 2 — в белую рамку с подписью, кто в кадре. Вызывать в кадре перед обычной отрисовкой.
   */
  capture(world: LobbyWorld, people: readonly PhotoPerson[]): void {
    const src = world.renderer.canvas;
    const W = src.width;
    const H = src.height;
    if (W < 16 || H < 16) return;
    // кадр 3 : 2 из середины холста: холст шире — обрезаем бока, выше — верх и низ
    let cw = W;
    let ch = Math.round(W / ASPECT);
    if (ch > H) {
      ch = H;
      cw = Math.round(H * ASPECT);
    }
    const cam = this.cam;
    cam.aspect = W / H;
    // обзор FOV_V — у кадра; холст выше кадра — камере нужен обзор шире во столько же раз
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV_V) / 2) * (H / ch)));
    cam.position.copy(PHOTO_LENS);
    cam.lookAt(LOOK);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    world.renderWith(cam);

    const PW = OUT_W;
    const PH = Math.round(OUT_W / ASPECT);
    const out = document.createElement('canvas');
    out.width = PW + PAD * 2;
    out.height = PH + PAD + FOOT;
    const g = out.getContext('2d')!;
    g.fillStyle = '#fbf7ee';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(src, (W - cw) / 2, (H - ch) / 2, cw, ch, PAD, PAD, PW, PH);
    g.strokeStyle = 'rgba(42, 31, 36, 0.14)';
    g.lineWidth = 2;
    g.strokeRect(PAD - 1, PAD - 1, PW + 2, PH + 2);

    const now = new Date();
    const y0 = PAD + PH;
    g.fillStyle = '#2a1f24';
    g.font = '900 58px Rubik, system-ui, sans-serif';
    g.fillText('У маяка', PAD + 4, y0 + 88);
    g.textAlign = 'right';
    g.fillStyle = '#8a7a70';
    g.font = '500 34px Rubik, system-ui, sans-serif';
    g.fillText(`${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`, PAD + PW - 4, y0 + 84);
    g.font = '500 26px Rubik, system-ui, sans-serif';
    g.fillStyle = '#b3a59a';
    g.fillText('game.tired.solutions', PAD + PW - 4, y0 + 150);
    g.textAlign = 'left';
    const who = this.inFrame(people, W, H, cw, ch);
    if (who.length) {
      g.fillStyle = '#4a3b40';
      g.font = '500 36px Rubik, system-ui, sans-serif';
      fitText(g, who.join(', '), PAD + 4, y0 + 150, PW - 420);
    }

    const p2 = (n: number) => String(n).padStart(2, '0');
    this.fileName = `mayak-${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}.jpg`;
    out.toBlob((b) => {
      if (!b) return;
      if (this.url) URL.revokeObjectURL(this.url);
      this.blob = b;
      // blob-адрес — только для «Сохранить»: CSP сайта пускает в <img> лишь data:, поэтому на карточке — data-адрес
      this.url = URL.createObjectURL(b);
      const reader = new FileReader();
      reader.onload = () => {
        this.img.src = String(reader.result);
        this.showCard();
      };
      reader.readAsDataURL(b);
    }, 'image/jpeg', 0.92);
  }

  /** Скачать снимок файлом (телефон — через «Поделиться», если умеет). */
  save(): void {
    if (!this.url) return;
    const file = TOUCH && this.blob ? new File([this.blob], this.fileName, { type: 'image/jpeg' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: 'Фото у маяка' }).then(() => this.saved(), () => {});
      return;
    }
    const a = document.createElement('a');
    a.href = this.url;
    a.download = this.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.saved();
  }

  private saved(): void {
    this.saveBtn.innerHTML = 'Сохранено ✓';
    this.saveBtn.classList.add('done');
  }

  hide(): void {
    clearTimeout(this.hideTimer);
    this.card.classList.remove('show');
  }

  /** Ушли с набережной: без отсчёта и карточки. */
  reset(): void {
    this.left = 0;
    this.count.classList.remove('show');
    this.flashEl.classList.remove('on');
    this.hide();
  }

  private showCard(): void {
    this.saveBtn.innerHTML = TOUCH ? 'Сохранить' : '<kbd>F</kbd> Сохранить';
    this.saveBtn.classList.remove('done');
    this.card.classList.remove('show');
    void this.card.offsetWidth;
    this.card.classList.add('show');
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), CARD_MS);
  }

  /** Ники тех, кто попал в кадр (по голове), слева направо — как на снимке. */
  private inFrame(people: readonly PhotoPerson[], W: number, H: number, cw: number, ch: number): string[] {
    const list: Array<[number, string]> = [];
    for (const p of people) {
      if (Math.hypot(p.x - PHOTO.x, p.z - PHOTO.z) > NAME_R) continue;
      this.v.set(p.x, p.y + 1.1, p.z).project(this.cam);
      if (this.v.z < -1 || this.v.z > 1) continue;
      const sx = (this.v.x * 0.5 + 0.5) * W - (W - cw) / 2;
      const sy = (0.5 - this.v.y * 0.5) * H - (H - ch) / 2;
      if (sx < 0 || sx > cw || sy < 0 || sy > ch) continue;
      list.push([sx, p.nick]);
    }
    return list.sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }
}

/** Строка в ширину w: не влезает — с многоточием. */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number): void {
  let t = text;
  if (g.measureText(t).width > w) {
    while (t.length > 1 && g.measureText(`${t}…`).width > w) t = t.slice(0, -1);
    t = `${t.trimEnd()}…`;
  }
  g.fillText(t, x, y);
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
