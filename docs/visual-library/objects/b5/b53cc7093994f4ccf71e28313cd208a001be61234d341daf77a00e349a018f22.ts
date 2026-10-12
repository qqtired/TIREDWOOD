// Табло рулетки на баркасе (флаг ROULETTE): щит позади стола, лицом к палубе. Сверху — что со столом (приём ставок,
// колесо крутится, что выпало), ниже — последние ROULETTE_LOG_SIZE ставок двумя колонками по пять, свежие сверху:
// кружок выпавшего числа, ник, на что и сколько поставил, итог «+N 🪙» зелёным или «−N» красным; своя строка — золотом.
// Щит стоит в осях стола (его группа добавляется к группе стола — roulette3d.ts), поэтому ездит вместе со столом и с
// баркасом: от ROULETTE_SPOT. Холст — одна текстура, перерисовывается только когда что-то поменялось (новый розыгрыш,
// секунда отсчёта), а не каждый кадр.
import * as THREE from 'three';
import { ROULETTE_COLOR_NAMES, ROULETTE_LOG_SIZE, rouletteColor, type RouletteColor, type RouletteLogRow } from '../../shared/roulette.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

/** Что сказать в шапке щита */
export type BoardHead =
  | { kind: 'idle' }
  | { kind: 'open'; secs: number; names: string }
  | { kind: 'spin'; bets: number }
  | { kind: 'result'; n: number };

export interface BoardState {
  head: BoardHead;
  /** Последние ставки, свежие сверху */
  rows: readonly RouletteLogRow[];
  /** Мой номер игрока: своя строка — золотом */
  me: number;
}

/** Щит в осях стола, м (стол потом укрупняется на TABLE_SCALE): ширина, высота, низ над палубой, плоскость позади стола */
const B = { w: 3.2, h: 1.0, y: 0.936, z: -0.715 };
/** Холст: ширина и высота в пикселях (пропорции щита); щит в мире 4 × 1,25 м, пиксель — 2 мм */
const W = 2048;
const H = Math.round((W * B.h) / B.w);
const FONT = 'Rubik, system-ui, sans-serif';
const BG = '#26332b';
const GOLD = '#ffd45c';
const CREAM = '#fff4d8';
const DIM = '#b9c4ad';
const WIN = '#7ee59b';
const LOSS = '#ff8577';
const SUIT: Record<RouletteColor, string> = { red: '#b3262b', black: '#1d1d22', green: '#1e7a3d' };
/** Колонки: слева и справа по пять строк */
const COLS = [{ x: 40 }, { x: 1048 }];
const COL_W = 960;
const PER_COL = ROULETTE_LOG_SIZE / 2;
const ROW0 = 124;
const ROW_H = 92;
const fmt = new Intl.NumberFormat('ru-RU');
const num = (n: number): string => fmt.format(n);

/** Скруглённый прямоугольник (roundRect есть не во всех Safari) */
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/** Монетка, как значок жетона в интерфейсе: золото, тёмный ободок, кольцо */
function coin(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.5, '#ffc93a');
  grad.addColorStop(1, '#b87a00');
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = r * 0.16; g.strokeStyle = '#8a5a00'; g.stroke();
  g.beginPath(); g.arc(x, y, r * 0.62, 0, Math.PI * 2); g.lineWidth = r * 0.12; g.strokeStyle = '#9a6300'; g.stroke();
}

/** Шрифт нужного веса и размера, уменьшенный (не меньше min), чтобы text влез в maxW; не влезло и так — с многоточием */
function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number, min = 0.62): string {
  g.font = `${weight} ${size}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w <= maxW) return text;
  const k = Math.max(min, maxW / w);
  g.font = `${weight} ${Math.floor(size * k)}px ${FONT}`;
  let t = text;
  while (t.length > 1 && g.measureText(t).width > maxW) t = `${t.slice(0, -2)}…`;
  return t;
}

/** Цвет числа на кружке и в шапке */
const disc = (n: number): string => (rouletteColor(n) === 'black' ? '#3a3a42' : SUIT[rouletteColor(n)]);

export class RouletteBoard {
  /** Щит: лицо с холстом и рама на двух столбах; +Z группы смотрит на палубу */
  readonly group = new THREE.Group();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    // крашеный щит со своей подсветкой: под тентом тень, а читать надо с палубы (так же сделано табло крысиных бегов)
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(B.w, B.h),
      new THREE.MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.8 }),
    );
    face.position.set(0, B.y + B.h / 2, B.z);
    this.group.add(face);
    const wood = 0x4a3221;
    const top = B.y + B.h;
    const frame = new THREE.Mesh(
      mergeColored([
        // рама вокруг щита и два столбика на палубе (без коллизии, как у прежней таблички)
        place(paint(new THREE.BoxGeometry(B.w + 0.12, B.h + 0.12, 0.05), wood), 0, B.y + B.h / 2, B.z - 0.03),
        place(paint(new THREE.BoxGeometry(0.07, top + 0.06, 0.07), wood), -(B.w / 2 + 0.01), (top + 0.06) / 2, B.z - 0.03),
        place(paint(new THREE.BoxGeometry(0.07, top + 0.06, 0.07), wood), B.w / 2 + 0.01, (top + 0.06) / 2, B.z - 0.03),
      ]),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 }),
    );
    frame.castShadow = true;
    this.group.add(frame);
    this.draw({ head: { kind: 'idle' }, rows: [], me: 0 });
  }

  draw(s: BoardState): void {
    const g = this.ctx;
    g.save();
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#d8b86a';
    g.lineWidth = 10;
    g.strokeRect(12, 12, W - 24, H - 24);
    this.head(s.head);
    // разделитель под шапкой
    g.fillStyle = 'rgba(216, 184, 106, 0.55)';
    g.fillRect(40, 108, W - 80, 4);
    if (s.rows.length === 0) {
      g.textAlign = 'center';
      g.fillStyle = DIM;
      g.font = `700 62px ${FONT}`;
      g.fillText('Пока никто не играл', W / 2, ROW0 + 170);
      g.font = `600 44px ${FONT}`;
      if (s.head.kind === 'idle') g.fillText('Поставь весь улов — и твоя ставка будет первой', W / 2, ROW0 + 250);
    } else {
      s.rows.slice(0, ROULETTE_LOG_SIZE).forEach((r, i) => this.row(r, COLS[Math.floor(i / PER_COL)].x, ROW0 + (i % PER_COL) * ROW_H, i % PER_COL, r.pid === s.me));
      g.fillStyle = 'rgba(216, 184, 106, 0.28)';
      g.fillRect(W / 2 - 2, ROW0 + 6, 4, PER_COL * ROW_H - 12);
    }
    g.textAlign = 'center';
    g.font = `600 30px ${FONT}`;
    g.fillStyle = DIM;
    g.fillText('Последние ставки · проиграл — улов пропадает · число выбирает сервер', W / 2, H - 28);
    g.restore();
    this.tex.needsUpdate = true;
  }

  /** Шапка: что со столом (то же, что говорила прежняя табличка) */
  private head(h: BoardHead): void {
    const g = this.ctx;
    g.textBaseline = 'alphabetic';
    if (h.kind === 'result') {
      const col = rouletteColor(h.n);
      g.fillStyle = disc(h.n);
      g.beginPath(); g.arc(104, 58, 44, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#f2e6c4'; g.stroke();
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 50px ${FONT}`;
      g.fillText(String(h.n), 104, 62);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      g.font = `800 72px ${FONT}`;
      g.fillStyle = col === 'black' ? CREAM : col === 'red' ? '#ff9d92' : '#9be8b0';
      g.fillText(`Выпало ${ROULETTE_COLOR_NAMES[col].toUpperCase()}`, 172, 82);
      this.hint('E — новая ставка');
      return;
    }
    g.textAlign = 'left';
    g.fillStyle = GOLD;
    switch (h.kind) {
      case 'spin':
        g.font = `800 72px ${FONT}`;
        g.fillText('Колесо крутится…', 56, 82);
        this.hint(`Ставки сделаны · ${h.bets}`);
        break;
      case 'open':
        g.font = `800 72px ${FONT}`;
        g.fillText(`Приём ставок · ${h.secs} с`, 56, 82);
        this.hint(h.names);
        break;
      default:
        g.font = `800 72px ${FONT}`;
        g.fillText('РУЛЕТКА РЫБАКА', 56, 82);
        this.hint('E — поставить весь улов · красное ×2 · чёрное ×2 · зеро ×36');
    }
  }

  /** Подсказка справа в шапке */
  private hint(text: string): void {
    const g = this.ctx;
    g.textAlign = 'right';
    g.fillStyle = CREAM;
    const t = fit(g, text, 600, 38, 940);
    g.fillText(t, W - 56, 78);
  }

  /** Строка колонки: кружок числа, ник, ставка (цвет и сколько), итог */
  private row(r: RouletteLogRow, x: number, top: number, k: number, mine: boolean): void {
    const g = this.ctx;
    const cy = top + ROW_H / 2;
    const base = cy + 20;
    if (mine) {
      g.fillStyle = 'rgba(255, 212, 92, 0.2)';
      rr(g, x, top + 4, COL_W, ROW_H - 8, 16);
      g.fill();
      g.fillStyle = GOLD;
      rr(g, x, top + 4, 10, ROW_H - 8, 5);
      g.fill();
    } else if (k % 2 === 0) {
      g.fillStyle = 'rgba(255, 255, 255, 0.05)';
      rr(g, x, top + 4, COL_W, ROW_H - 8, 16);
      g.fill();
    }
    // что выпало: кружок цвета числа
    g.fillStyle = disc(r.n);
    g.beginPath(); g.arc(x + 54, cy, 34, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.strokeStyle = '#f2e6c4'; g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = `800 ${r.n > 9 ? 36 : 42}px ${FONT}`;
    g.fillText(String(r.n), x + 54, cy + 14);
    // ник
    g.textAlign = 'left';
    g.fillStyle = mine ? GOLD : CREAM;
    g.fillText(fit(g, r.nick, 700, 56, 268), x + 104, base);
    // ставка: плашка цвета, на который поставил, и сколько
    const pill = `${ROULETTE_COLOR_NAMES[r.c]} ${num(r.stake)}`;
    g.font = `700 46px ${FONT}`;
    const pw = Math.min(296, g.measureText(pill).width + 36);
    g.fillStyle = SUIT[r.c];
    rr(g, x + 384, cy - 33, pw, 66, 33);
    g.fill();
    g.lineWidth = 3; g.strokeStyle = r.c === 'black' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.25)'; g.stroke();
    g.fillStyle = '#fff8e6';
    g.fillText(fit(g, pill, 700, 46, pw - 28), x + 384 + 18, cy + 15);
    // итог: выиграл — «+N 🪙» зелёным, проиграл — «−N» красным
    g.textAlign = 'right';
    if (r.payout > 0) {
      const t = `+${num(r.payout)}`;
      g.fillStyle = WIN;
      g.font = `800 56px ${FONT}`;
      const f = fit(g, t, 800, 56, 196);
      g.fillText(f, x + COL_W - 58, base);
      coin(g, x + COL_W - 30, cy - 1, 21);
    } else {
      g.fillStyle = LOSS;
      g.fillText(fit(g, `−${num(r.stake)}`, 800, 56, 220), x + COL_W - 20, base);
    }
  }
}
