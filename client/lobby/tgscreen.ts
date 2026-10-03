// Огромный экран на крыше Склада №3: последние сообщения из Telegram-группы друзей (server/tgfeed.ts). Короб стоит на
// стальной раме над парапетом, лицом на юг, к площади, — читается со всей набережной. Сверху — шапка с названием
// чата и временем последнего сообщения, ниже — строки: имя своим цветом (у одного имени — всегда один), потом текст;
// новые — внизу, длинное переносится не больше чем на две строки с «…». Новое сообщение въезжает снизу и коротко
// подсвечивается. Строк нет (экран выключен или чат молчит) — заставка «TIREDWOOD».
// Холст один; перерисовывается, только когда пришли строки или идёт анимация (въезд — 30 раз в секунду, угасание
// подсветки — 10). На телефоне холст мельче (то же самое в масштабе 0,8): экран там и так невелик.
// Отладка (?debug): __opus.app.active.tg.demo() — десяток строк, .push('Имя', 'текст') — новое сообщение, .clear().
import * as THREE from 'three';
import { TG_KEEP, type TgLine } from '../../shared/messages.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { TOUCH } from '../touch.ts';

/** Холст в своих единицах: 16 : 9, как экран; на телефоне в пикселях — SCALE от этого */
const W = 1280;
const H = 720;
const SCALE = TOUCH ? 0.8 : 1;
/** Светящееся поле, м; рамка вокруг него и глубина короба */
const SCREEN_W = 12;
const SCREEN_H = (SCREEN_W * H) / W;
const BEZEL = 0.2;
const DEPTH = 0.42;
/**
 * Склад №3: x −9…9, z −26…−16, крыша — на 9 м, парапет по краю — до 9,6 м. Экран — посередине, лицевая сторона
 * короба — в 1,4 м за передним краем крыши, низ короба — на 0,7 м выше парапета (между ними видны ноги рамы).
 */
const ROOF_Y = 9;
const BASE_Y = 10.3;
const FACE_Z = -17.4;
const CABINET = 0x17191d;
/** Задняя стенка короба — крашеный металл посветлее: сзади и сбоку экран не чёрная дыра */
const CABINET_BACK = 0x4d545c;
const STEEL = 0x47505a;
const STEEL_DARK = 0x2d3238;

const FONT = 'Rubik, system-ui, sans-serif';
const BG_TOP = '#0d141c';
const BG_BOTTOM = '#0a0f15';
const TEXT = '#eef2f6';
/** Шапка и поле строк, единицы холста */
const HEAD_H = 100;
const PAD_X = 46;
const TOP = HEAD_H + 12;
const BOTTOM = H - 22;
const AREA_W = W - PAD_X * 2;
const TEXT_PX = 50;
const ROW_H = 64;
const GAP = 12;
const NAME_GAP = 16;
const MAX_ROWS = 2;
const NAME_FONT = `700 ${TEXT_PX}px ${FONT}`;
const TEXT_FONT = `500 ${TEXT_PX}px ${FONT}`;
/** Имя — не шире такой доли строки; короткое — второй ряд текста начинается под первым */
const NAME_MAX_W = 0.38;
const HANG_MAX_W = 0.3;
/** Въезд снизу и подсветка нового (исправленного) сообщения, с; перерисовка во время них, раз в секунду */
const SLIDE_S = 0.5;
const LIT_S = 2.4;
const EDIT_S = 1.4;
const SLIDE_FPS = 30;
const FADE_FPS = 10;
/** Цвета имён: яркие на тёмном, у одного имени — всегда один */
const NAME_COLORS = ['#ff8a65', '#ffd54f', '#aed581', '#4fc3f7', '#ce93d8', '#f48fb1', '#4dd0e1', '#ffb74d', '#8c9eff', '#81c784', '#ff80ab', '#e6ee9c'];

/** Строка на экране: имя (обрезанное по ширине), ряды текста после переноса, высота; подсветка — с какого времени */
interface Item {
  line: TgLine;
  name: string;
  nameW: number;
  color: string;
  rows: string[];
  /** Откуда начинаются второй и дальше ряды текста */
  indent: number;
  h: number;
  /** Время сцены, когда пришло (−1 — без подсветки), и исправление ли это */
  lit: number;
  edit: boolean;
}

/** Отладка: как будто чат живой — разной длины, с эмодзи, вложениями и упоминанием */
const DEMO: ReadonlyArray<readonly [string, string]> = [
  ['Петя', 'Всем привет! Кто сегодня на набережную? 🌅'],
  ['Маша', 'Я! Только сначала в дурака — реванш за вчера 🃏'],
  ['Саша', 'Ссылка на ту песню 🔗'],
  ['Ольга', '📷 Закат у маяка — смотрите, какое небо'],
  ['Дима', 'Кто опять утопил катер? 😂😂😂'],
  ['Константин-Александр', 'Это был не я, честно. Я вообще стоял у автоматов и крутил «Вишенку», пока все катались, выиграл сорок жетонов, а потом всё спустил на семёрки, как обычно'],
  ['Маша', '😂'],
  ['Петя', '🎤 голосовое'],
  ['Лена', 'Во сколько собираемся? Я после восьми смогу, раньше никак 🙏'],
  ['Дима', '🎬 гифка'],
  ['Саша', '@Петя ты где? Мы уже у гаража, гонка через минуту 🏁'],
];

export class TgScreen {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  /** Тёмные линии между «светодиодами» — один раз, поверх каждой перерисовки */
  private readonly grid: HTMLCanvasElement;
  private title = '';
  private items: Item[] = [];
  /** Время сцены, с (из update): от него идут анимации */
  private t = 0;
  /** Въезд снизу: на сколько всё сдвинуто вниз в начале и когда начался (−1 — нет) */
  private slideFrom = 0;
  private slideAt = -1;
  private dirty = true;
  private drawnAt = -Infinity;
  private animated = false;
  private demoId = 1_000_000;

  constructor(scene: THREE.Scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(W * SCALE);
    this.canvas.height = Math.round(H * SCALE);
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    // издалека и под углом: мип-уровни (по умолчанию) и анизотропия — текст не рябит и не мылится
    this.tex.anisotropy = 8;
    this.grid = ledGrid(this.canvas.width, this.canvas.height);
    const frame = new THREE.Mesh(buildFrame(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }));
    frame.matrixAutoUpdate = false;
    // светодиоды светят сами: цвет холста как есть, без тонмаппинга (как экран над воротами склада)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    face.position.set(0, BASE_Y + BEZEL + SCREEN_H / 2, FACE_Z + 0.005);
    face.matrixAutoUpdate = false;
    face.updateMatrix();
    scene.add(frame, face);
    this.draw();
    // main.ts ждёт только жирные начертания Rubik; обычное (500) догрузится — разметим строки заново и перерисуем
    document.fonts?.load(TEXT_FONT, 'Аб7').then(() => {
      this.items = this.items.map((it) => this.item(it.line, it.lit, it.edit));
      this.dirty = true;
    }, () => {});
  }

  /** Всё сразу (вход на набережную, экран включили или выключили) — без анимации. */
  set(title: string, lines: readonly TgLine[]): void {
    this.title = typeof title === 'string' ? title : '';
    this.items = valid(lines).slice(-TG_KEEP).map((l) => this.item(l, -1, false));
    this.slideAt = -1;
    this.slideFrom = 0;
    this.dirty = true;
  }

  /** Новые и исправленные строки (по id): новые въезжают снизу, исправленные — коротко подсвечиваются на месте. */
  add(title: string, lines: readonly TgLine[]): void {
    if (typeof title === 'string') this.title = title;
    let grow = 0;
    for (const l of valid(lines)) {
      const i = this.items.findIndex((it) => it.line.id === l.id);
      if (i >= 0) {
        const old = this.items[i].line;
        if (old.name !== l.name || old.text !== l.text) this.items[i] = this.item(l, this.t, true);
        continue;
      }
      const it = this.item(l, this.t, false);
      this.items.push(it);
      grow += it.h + GAP;
    }
    if (this.items.length > TG_KEEP) this.items.splice(0, this.items.length - TG_KEEP);
    if (grow > 0) {
      // уже едет — добавляем к тому, что осталось проехать
      this.slideFrom = this.slideOffset() + grow;
      this.slideAt = this.t;
    }
    this.dirty = true;
  }

  /** Каждый кадр (время сцены, с): перерисовка — только если пришло новое или идёт анимация. */
  update(time: number): void {
    this.t = time;
    const sliding = this.slideAt >= 0 && time - this.slideAt < SLIDE_S;
    const fading = this.items.some((it) => it.lit >= 0 && time - it.lit < (it.edit ? EDIT_S : LIT_S));
    const anim = sliding || fading;
    if (anim) {
      if (!this.dirty && time - this.drawnAt < 1 / (sliding ? SLIDE_FPS : FADE_FPS)) return;
    } else if (!this.dirty && !this.animated) {
      return;
    }
    // анимация кончилась — ещё одна перерисовка, без подсветки
    this.animated = anim;
    this.draw();
  }

  /** Отладка: десяток строк (последняя въезжает), заголовок — как у настоящего чата. */
  demo(): void {
    const now = Date.now();
    const lines = DEMO.map(([name, text], i) => ({ id: this.demoId++, name, text, at: now - (DEMO.length - i) * 47_000 }));
    this.set('Друзья 🌊', lines.slice(0, -1));
    this.add('Друзья 🌊', lines.slice(-1));
  }

  /** Отладка: новое сообщение — въезжает снизу с подсветкой. */
  push(name: string, text: string): void {
    this.add(this.title || 'Друзья 🌊', [{ id: this.demoId++, name, text, at: Date.now() }]);
  }

  /** Отладка: пусто — заставка. */
  clear(): void {
    this.set('', []);
  }

  debug(): Record<string, unknown> {
    return { title: this.title, lines: this.items.length, idle: this.items.length === 0, sliding: this.slideOffset() > 0 };
  }

  /** Сколько ещё проехать снизу вверх, единиц холста */
  private slideOffset(): number {
    if (this.slideAt < 0) return 0;
    const k = Math.min(1, Math.max(0, (this.t - this.slideAt) / SLIDE_S));
    return this.slideFrom * (1 - k) ** 3;
  }

  /** Разметить строку: имя по ширине, перенос текста по словам. */
  private item(line: TgLine, lit: number, edit: boolean): Item {
    const c = this.ctx;
    c.font = NAME_FONT;
    const name = ellipsize(c, line.name || 'Кто-то', AREA_W * NAME_MAX_W);
    const nameW = c.measureText(name).width;
    c.font = TEXT_FONT;
    const hang = nameW + NAME_GAP;
    const indent = hang <= AREA_W * HANG_MAX_W ? hang : 40;
    const rows = wrap(c, line.text, [AREA_W - hang, AREA_W - indent], MAX_ROWS);
    return { line, name, nameW, color: nameColor(line.name), rows, indent, h: rows.length * ROW_H, lit, edit };
  }

  private draw(): void {
    this.dirty = false;
    this.drawnAt = this.t;
    const c = this.ctx;
    c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    if (this.items.length === 0) {
      this.drawIdle(c);
    } else {
      this.drawLines(c);
      this.drawHead(c);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.grid, 0, 0);
    this.tex.needsUpdate = true;
  }

  /** Строки снизу вверх: новые внизу; верхняя, что не влезла, гаснет под шапкой. */
  private drawLines(c: CanvasRenderingContext2D): void {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, BG_TOP);
    g.addColorStop(1, BG_BOTTOM);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.save();
    c.beginPath();
    c.rect(0, TOP, W, H - TOP);
    c.clip();
    let y = BOTTOM + this.slideOffset();
    for (let i = this.items.length - 1; i >= 0 && y > TOP; i--) {
      const it = this.items[i];
      y -= it.h;
      this.drawItem(c, it, y);
      y -= GAP;
    }
    c.restore();
    // полоса гашения начинается чуть выше края обрезки: в масштабе 0,8 край попадает между пикселями — без светлого шва
    const fade = c.createLinearGradient(0, TOP - 4, 0, TOP + 56);
    fade.addColorStop(0, 'rgba(13,20,28,1)');
    fade.addColorStop(0.1, 'rgba(13,20,28,1)');
    fade.addColorStop(1, 'rgba(13,20,28,0)');
    c.fillStyle = fade;
    c.fillRect(0, TOP - 4, W, 60);
  }

  private drawItem(c: CanvasRenderingContext2D, it: Item, y: number): void {
    const span = it.edit ? EDIT_S : LIT_S;
    const age = it.lit >= 0 ? this.t - it.lit : span;
    if (age < span) {
      // подсветка гаснет: новое — голубым, исправленное — жёлтым; слева — полоска цвета имени
      const a = (1 - age / span) ** 2;
      c.fillStyle = it.edit ? `rgba(255,196,77,${0.3 * a})` : `rgba(58,167,238,${0.36 * a})`;
      roundRect(c, PAD_X - 20, y - 6, AREA_W + 40, it.h + 12, 14);
      c.fill();
      c.globalAlpha = a;
      c.fillStyle = it.color;
      roundRect(c, PAD_X - 20, y - 6, 8, it.h + 12, 4);
      c.fill();
      c.globalAlpha = 1;
    }
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    const mid = y + ROW_H / 2 + 2;
    c.font = NAME_FONT;
    c.fillStyle = it.color;
    c.fillText(it.name, PAD_X, mid);
    c.font = TEXT_FONT;
    c.fillStyle = TEXT;
    for (let r = 0; r < it.rows.length; r++) c.fillText(it.rows[r], PAD_X + (r === 0 ? it.nameW + NAME_GAP : it.indent), mid + r * ROW_H);
  }

  /** Шапка: значок, название чата, справа — время последнего сообщения. */
  private drawHead(c: CanvasRenderingContext2D): void {
    const g = c.createLinearGradient(0, 0, 0, HEAD_H);
    g.addColorStop(0, '#21496f');
    g.addColorStop(1, '#173550');
    c.fillStyle = g;
    c.fillRect(0, 0, W, HEAD_H);
    c.fillStyle = '#3aa7ee';
    c.fillRect(0, HEAD_H - 5, W, 5);
    const cy = HEAD_H / 2 - 2;
    planeIcon(c, PAD_X + 30, cy, 30);
    c.textBaseline = 'middle';
    let right = W - PAD_X;
    const last = this.items[this.items.length - 1];
    if (last) {
      const time = hhmm(last.line.at);
      c.font = `700 40px ${FONT}`;
      c.textAlign = 'right';
      c.fillStyle = '#a9c9e6';
      c.fillText(time, right, cy + 2);
      right -= c.measureText(time).width + 32;
    }
    const x = PAD_X + 82;
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    fitFont(c, this.title || 'Чат', 52, 36, right - x, 900);
    c.fillText(ellipsize(c, this.title || 'Чат', right - x), x, cy + 2);
  }

  /** Заставка: самолётик, «TIREDWOOD» и обещание. */
  private drawIdle(c: CanvasRenderingContext2D): void {
    const g = c.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, '#172b40');
    g.addColorStop(1, '#0a0f15');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    planeIcon(c, W / 2, 200, 62);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const gold = c.createLinearGradient(0, 310, 0, 440);
    gold.addColorStop(0, '#ffe39a');
    gold.addColorStop(1, '#ffa54d');
    c.font = `900 140px ${FONT}`;
    c.shadowColor = 'rgba(255,170,80,0.45)';
    c.shadowBlur = 36 * SCALE;
    c.fillStyle = gold;
    c.fillText('TIREDWOOD', W / 2, 376, W * .86);
    c.shadowBlur = 0;
    c.shadowColor = 'transparent';
    c.font = `500 56px ${FONT}`;
    c.fillStyle = '#d3e3f1';
    c.fillText('Здесь будет наш чат', W / 2, 500);
  }
}

// ------------------------------------------------------------ помощники

/** Строки с сервера, похожие на строки (на случай чего-то странного в письме) */
function valid(lines: readonly TgLine[]): TgLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.filter((l) => l && typeof l.id === 'number' && typeof l.name === 'string' && typeof l.text === 'string' && typeof l.at === 'number');
}

/** Цвет имени: хеш строки → палитра (у всех игроков одинаковый) */
function nameColor(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return NAME_COLORS[(h >>> 0) % NAME_COLORS.length];
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ru', { granularity: 'grapheme' }) : null;

/** Знаки, как их видит глаз: эмодзи с модификаторами не разрезаем */
function chars(s: string): string[] {
  return segmenter ? Array.from(segmenter.segment(s), (g) => g.segment) : Array.from(s);
}

/** Влезает в maxW — как есть, нет — обрезано с «…» (текущим шрифтом). */
function ellipsize(c: CanvasRenderingContext2D, s: string, maxW: number): string {
  if (c.measureText(s).width <= maxW) return s;
  const g = chars(s);
  let lo = 0;
  let hi = g.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c.measureText(`${g.slice(0, mid).join('').trimEnd()}…`).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${g.slice(0, lo).join('').trimEnd()}…`;
}

/** Шрифт от size до min, чтобы текст влез в maxW (не влез и на min — обрежет ellipsize). */
function fitFont(c: CanvasRenderingContext2D, text: string, size: number, min: number, maxW: number, weight: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.max(min, Math.floor((size * maxW) / w))}px ${FONT}`;
}

/** Сколько первых знаков влезает в maxW (хотя бы один). */
function fitCount(c: CanvasRenderingContext2D, g: readonly string[], maxW: number): number {
  let lo = 1;
  let hi = g.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c.measureText(g.slice(0, mid).join('')).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Перенос по словам: ряд i шириной widths[i] (дальше — последней), слово длиннее ряда режется по знакам.
 * Рядов больше max — последний обрезается с «…».
 */
function wrap(c: CanvasRenderingContext2D, text: string, widths: readonly number[], max: number): string[] {
  const width = (i: number): number => widths[Math.min(i, widths.length - 1)];
  const rows: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    if (!word) continue;
    const next = cur ? `${cur} ${word}` : word;
    if (c.measureText(next).width <= width(rows.length)) {
      cur = next;
      continue;
    }
    if (cur) rows.push(cur);
    cur = word;
    // слово само не влезает в ряд — режем по знакам
    while (c.measureText(cur).width > width(rows.length) && rows.length <= max) {
      const g = chars(cur);
      const n = fitCount(c, g, width(rows.length));
      rows.push(g.slice(0, n).join(''));
      cur = g.slice(n).join('');
    }
    if (rows.length > max) break;
  }
  if (cur) rows.push(cur);
  if (rows.length === 0) return [''];
  if (rows.length <= max) return rows;
  const kept = rows.slice(0, max - 1);
  kept.push(ellipsize(c, rows.slice(max - 1).join(' '), width(max - 1)));
  return kept;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

/** Бумажный самолётик в голубом круге — значок чата. */
function planeIcon(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.fillStyle = '#3aa7ee';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  const k = r / 30;
  const p = (pts: ReadonlyArray<readonly [number, number]>, color: string): void => {
    c.fillStyle = color;
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(x + px * k, y + py * k) : c.moveTo(x + px * k, y + py * k)));
    c.closePath();
    c.fill();
  };
  // крыло и корпус, нос — вправо вверх; складка — чуть темнее
  p([[-16, 0], [15, -12], [9, 14], [1, 7], [-4, 13], [-5, 4]], '#ffffff');
  p([[-5, 4], [15, -12], [1, 7], [-4, 13]], '#d4ebfb');
}

/** Сетка «светодиодов»: тонкие тёмные линии через 4 пикселя */
function ledGrid(w: number, h: number): HTMLCanvasElement {
  const g = document.createElement('canvas');
  g.width = w;
  g.height = h;
  const c = g.getContext('2d')!;
  c.fillStyle = 'rgba(0,0,0,0.24)';
  for (let x = 3; x < w; x += 4) c.fillRect(x, 0, 1, h);
  for (let y = 3; y < h; y += 4) c.fillRect(0, y, w, 1);
  return g;
}

/** Короб экрана и стальная рама на крыше: стойки, подкосы к крыше, поперечины, ноги под коробом — одной сеткой. */
function buildFrame(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0): void => {
    parts.push(place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, 0, rx));
  };
  const cabW = SCREEN_W + BEZEL * 2;
  const cabH = SCREEN_H + BEZEL * 2;
  // спереди — тёмная рамка вокруг светодиодов, за ней — корпус чуть меньше
  box(cabW, cabH, 0.12, 0, BASE_Y + cabH / 2, FACE_Z - 0.06, CABINET);
  box(cabW - 0.12, cabH - 0.12, DEPTH - 0.12, 0, BASE_Y + cabH / 2, FACE_Z - 0.12 - (DEPTH - 0.12) / 2, CABINET_BACK);
  // ноги под передним краем короба и балка по ним — их видно с площади над парапетом
  const legZ = FACE_Z - 0.2;
  for (const x of [-5.6, -1.9, 1.9, 5.6]) box(0.14, BASE_Y - ROOF_Y, 0.14, x, (ROOF_Y + BASE_Y) / 2, legZ, STEEL);
  box(cabW - 0.3, 0.14, 0.14, 0, BASE_Y - 0.07, legZ, STEEL);
  // стойки за коробом — от крыши почти до верха, подкосы назад к крыше, опоры на крыше
  const colZ = FACE_Z - DEPTH - 0.13;
  const top = BASE_Y + cabH - 0.35;
  const footZ = colZ - 3.8;
  // подкос: от опоры на крыше до стойки на 0,6 высоты короба
  const dy = BASE_Y + cabH * 0.6 - ROOF_Y;
  const dz = colZ - 0.1 - footZ;
  for (const x of [-4.6, 0, 4.6]) {
    box(0.24, top - ROOF_Y, 0.24, x, (ROOF_Y + top) / 2, colZ, STEEL);
    box(0.16, Math.hypot(dy, dz), 0.16, x, ROOF_Y + dy / 2, footZ + dz / 2, STEEL, Math.atan2(dz, dy));
    box(0.6, 0.08, 0.6, x, ROOF_Y + 0.04, colZ, STEEL_DARK);
    box(0.5, 0.08, 0.5, x, ROOF_Y + 0.04, footZ, STEEL_DARK);
  }
  // поперечины по стойкам сзади и связь подкосов невысоко над крышей
  for (const y of [BASE_Y + 0.25, BASE_Y + cabH * 0.5, top - 0.25]) box(9.44, 0.16, 0.16, 0, y, colZ - 0.2, STEEL);
  box(9.44, 0.12, 0.12, 0, ROOF_Y + 0.9, footZ + (0.9 / dy) * dz, STEEL_DARK);
  return mergeColored(parts);
}
