// Табло крысиных бегов (флаг RATRACE): большой щит на двух столбах у южного края понтона, лицом к площади, низ — выше
// голов и ников желеек у арены. На холсте: состояние крупно (делайте ставки / старт через N с / забег, кто впереди /
// кто победил), шесть строк — номер в цвете попоны, имя, коэффициент, кто поставил (ник и сумма; своя ставка
// подсвечена) и сколько всего на крысу. В забеге строки идут по местам, под каждой — полоска хода (меши: холст
// не перерисовываем каждый кадр), на финише — места и выплаты. Внизу — банк и что нажать. Холст перерисовывается
// только когда что-то поменялось (в отсчёте — раз в секунду, в забеге — при обгоне).
import * as THREE from 'three';
import { RAT_BOARD, RAT_COUNT, RAT_OPEN_MS, RATS, ratWon, type RatBetView } from '../../shared/ratrace.ts';
import { paint, place } from '../render/kit.ts';
import { SIGNS3, V3, v3Path, v3Rule } from '../ui/signs3.ts';
import { v3Line, v3Screen, v3Status, type Seg } from './tablo3.ts';

export type BoardPhase = 'idle' | 'open' | 'run' | 'result';

export interface BoardState {
  phase: BoardPhase;
  /** Отсчёт до старта, с (open) */
  secs: number;
  odds: readonly number[];
  /** Ставки забега: текущего (idle, open, run) или только что прошедшего (result) */
  bets: readonly RatBetView[];
  /** Мой номер игрока — своя ставка подсвечена */
  me: number;
  /** Места: в забеге — кто впереди сейчас, на финише — порядок */
  order: readonly number[] | null;
  /** Финиш: коэффициент победителя и кто сколько выиграл */
  winMult: number;
  wins: ReadonlyArray<{ nick: string; payout: number }>;
}

/** Холст: ширина и высота в пикселях (пропорции щита) */
const W = 1600;
const H = Math.round((W * RAT_BOARD.h) / RAT_BOARD.w);
const PX = RAT_BOARD.w / W;
const FONT = 'Rubik, system-ui, sans-serif';
const BG = '#1c3a2b';
const CREAM = SIGNS3 ? V3.cream : '#fff4d8';
const GOLD = SIGNS3 ? V3.goldHi : '#ffd45c';
const DIM = SIGNS3 ? V3.creamDim : '#bfd0b4';
/** Строки: первая сверху и высота */
const ROW0 = 196;
const ROW_H = 94;
/** Полоска хода под строкой: от и до по холсту, высота */
const BAR_X0 = 44;
const BAR_X1 = W - 44;
const BAR_H = 9;
const fmt = new Intl.NumberFormat('ru-RU');
const num = (n: number): string => fmt.format(n);

/** Скруглённый прямоугольник (без roundRect — его нет в старых Safari) */
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

/** Текст не шире max: иначе обрезаем с многоточием */
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Номер крысы в кружке цвета попоны */
function badge(g: CanvasRenderingContext2D, x: number, y: number, r: number, rat: number): void {
  const saddle = RATS[rat].saddle;
  g.fillStyle = saddle;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#fffaf0'; g.stroke();
  g.fillStyle = saddle === '#e8b923' ? '#2a2420' : '#ffffff';
  g.font = `800 ${Math.round(r * 1.25)}px ${FONT}`;
  g.textAlign = 'center';
  g.fillText(String(rat + 1), x, y + r * 0.45);
}

/** Строка из кусков: текст и монетки ('🪙'); align — от x влево, вправо или по центру */
function line(g: CanvasRenderingContext2D, parts: readonly string[], x: number, y: number, align: 'left' | 'right' | 'center', size: number): void {
  const r = size * 0.36;
  const widths = parts.map((p) => (p === '🪙' ? r * 2 + 8 : g.measureText(p).width));
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
  g.textAlign = 'left';
  parts.forEach((p, i) => {
    if (p === '🪙') coin(g, cx + 4 + r, y - size * 0.34, r);
    else g.fillText(p, cx, y);
    cx += widths[i];
  });
}

/** Ник покороче: на табло влезает больше ставок */
const short = (nick: string): string => (nick.length > 12 ? `${nick.slice(0, 11)}…` : nick);

/** Склонение «ставка»: 1 ставка, 3 ставки, 5 ставок */
export function betsWord(n: number): string {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'ставка';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'ставки';
  return 'ставок';
}

/** Банк забега — сумма ставок */
export const ratBank = (bets: readonly RatBetView[]): number => bets.reduce((s, b) => s + b.stake, 0);

export class RatBoard {
  /** Щит с холстом и полосками хода: в группе ось +Z смотрит на площадь */
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly bars: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; rat: number }> = [];

  constructor() {
    const B = RAT_BOARD;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    // крашеный щит: свой свет (как у вывесок набережной), в грозу без света гаснет вместе с ними
    this.material = new THREE.MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.8 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), this.material);
    this.group.add(screen);
    this.group.position.set(B.x, B.y + B.h / 2, B.z - 0.06);
    this.group.rotation.y = Math.PI;
    // полоски хода — под каждой строкой, слева направо (как видно с площади)
    const geo = new THREE.PlaneGeometry(1, BAR_H * PX).translate(0.5, 0, 0);
    for (let k = 0; k < RAT_COUNT; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-B.w / 2 + BAR_X0 * PX, (H / 2 - (ROW0 + (k + 1) * ROW_H - 13)) * PX, 0.008);
      mesh.visible = false;
      this.group.add(mesh);
      this.bars.push({ mesh, mat, rat: -1 });
    }
  }

  /** Дерево табло (столбы, рамка, козырёк, флажки) — в общий меш понтона */
  static frame(parts: THREE.BufferGeometry[]): void {
    const B = RAT_BOARD;
    const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): void => {
      parts.push(place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z));
    };
    const top = B.y + B.h;
    // столбы (коллизия — shared/maps/lobby.ts, по RAT_BOARD) с башмаками на настиле
    for (const sx of [-1, 1]) {
      const px = B.x + sx * (B.w / 2 + 0.05);
      box(0.16, top + 0.42, 0.16, 0x6e4a2e, px, (top + 0.42) / 2, B.z + 0.04);
      box(0.24, 0.12, 0.24, 0x5a3c25, px, 0.06, B.z + 0.04);
    }
    // рамка щита, полка снизу, козырёк сверху (красный с белой каймой)
    box(B.w + 0.2, B.h + 0.2, 0.06, SIGNS3 ? 0x2e1d26 : 0x4a3322, B.x, B.y + B.h / 2, B.z);
    box(B.w + 0.3, 0.09, 0.22, SIGNS3 ? 0xb8893e : 0xb07a4a, B.x, B.y - 0.08, B.z - 0.04);
    box(B.w + 0.6, 0.1, 0.5, 0xc0473a, B.x, top + 0.36, B.z - 0.06);
    box(B.w + 0.66, 0.06, 0.56, 0xf2ece0, B.x, top + 0.29, B.z - 0.06);
    // флажки под козырьком, над щитом
    const cols = [0xd64541, 0xf2c230, 0x3f7fd8, 0x3fa65a, 0xf08a2c, 0x8e5bd0];
    const n = 21;
    for (let i = 0; i < n; i++) {
      const x = B.x - (B.w + 0.5) / 2 + ((i + 0.5) * (B.w + 0.5)) / n;
      parts.push(place(paint(new THREE.ConeGeometry(0.09, 0.2, 3).rotateX(Math.PI), cols[i % cols.length]), x, top + 0.18, B.z - 0.32));
    }
  }

  /** Полоски хода в забеге: order — кто на каком месте, prog(rat) — доля круга 0…1; null — спрятать */
  setProgress(order: readonly number[] | null, prog: (rat: number) => number): void {
    const len = (BAR_X1 - BAR_X0) * PX;
    this.bars.forEach((b, k) => {
      const rat = order ? order[k] : -1;
      b.mesh.visible = rat >= 0;
      if (rat < 0) return;
      if (b.rat !== rat) {
        b.rat = rat;
        b.mat.color.set(RATS[rat].saddle);
      }
      b.mesh.scale.x = Math.max(0.001, Math.min(1, prog(rat)) * len);
    });
  }

  draw(s: BoardState): void {
    const g = this.ctx;
    g.save();
    g.textBaseline = 'alphabetic';
    if (SIGNS3) this.head3(s);
    else this.head(s);
    const placed = (s.phase === 'run' || s.phase === 'result') && s.order;
    const rows = placed ? s.order! : [0, 1, 2, 3, 4, 5];
    rows.forEach((rat, k) => this.row(s, rat, k, !!placed));
    if (SIGNS3) this.footer3(s);
    else this.footer(s);
    g.restore();
    this.tex.needsUpdate = true;
  }

  /** v3: экран в золотой раме, название — золотом вразрядку, состояние — плашкой (открыто — зелёным, забег — золотом) */
  private head3(s: BoardState): void {
    const g = this.ctx;
    v3Screen(g, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = V3.gold;
    g.font = `700 42px ${FONT}`;
    if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = '8px';
    g.fillText('КРЫСИНЫЕ БЕГА', W / 2 + 4, 56);
    if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
    const max = W - 140;
    switch (s.phase) {
      case 'open': v3Status(g, W / 2, 124, [{ t: 'СТАРТ ЧЕРЕЗ ' }, { t: `${s.secs} С`, c: V3.goldHi }], s.secs <= 5 ? 'bad' : 'good', 62, max); break;
      case 'run': v3Status(g, W / 2, 124, s.order ? [{ t: 'ЗАБЕГ! ВПЕРЕДИ — ' }, { t: RATS[s.order[0]].name.toUpperCase(), c: V3.goldHi }] : [{ t: 'ЗАБЕГ!' }], 'live', 62, max); break;
      case 'result': v3Status(g, W / 2, 124, s.order ? [{ t: `${ratWon(s.order[0]).toUpperCase()} ` }, { t: `×${s.winMult}!`, c: V3.goldHi }] : [{ t: 'ФИНИШ' }], 'live', 62, max); break;
      default: v3Status(g, W / 2, 124, [{ t: 'ДЕЛАЙТЕ СТАВКИ!' }], 'good', 62, max);
    }
    v3Rule(g, 44, 186, W - 88, 3);
    g.textBaseline = 'alphabetic';
  }

  private head(s: BoardState): void {
    const g = this.ctx;
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#d9b45a';
    g.lineWidth = 8;
    g.strokeRect(16, 16, W - 32, H - 32);
    // заголовок и состояние — крупно, видно с площади
    g.textAlign = 'center';
    g.fillStyle = '#f0dca8';
    g.font = `700 50px ${FONT}`;
    if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = '8px';
    g.fillText('КРЫСИНЫЕ БЕГА', W / 2, 74);
    if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
    const [state, color] = this.stateLine(s);
    g.font = `800 82px ${FONT}`;
    g.fillStyle = color;
    g.fillText(fit(g, state, W - 100), W / 2, 162);
    g.fillStyle = 'rgba(217, 180, 90, 0.6)';
    g.fillRect(44, 184, W - 88, 4);
  }

  private stateLine(s: BoardState): [string, string] {
    switch (s.phase) {
      case 'open': return [`СТАРТ ЧЕРЕЗ ${s.secs} С`, s.secs <= 5 ? '#ffb15c' : GOLD];
      case 'run': return [s.order ? `ЗАБЕГ! ВПЕРЕДИ — ${RATS[s.order[0]].name.toUpperCase()}` : 'ЗАБЕГ!', GOLD];
      case 'result': return s.order ? [`${ratWon(s.order[0]).toUpperCase()} ×${s.winMult}!`, GOLD] : ['ФИНИШ', GOLD];
      default: return ['ДЕЛАЙТЕ СТАВКИ!', CREAM];
    }
  }

  private row(s: BoardState, rat: number, k: number, placed: boolean): void {
    const g = this.ctx;
    const top = ROW0 + k * ROW_H;
    const cy = top + ROW_H / 2 - 6;
    const base = cy + 21;
    const bets = s.bets.filter((b) => b.rat === rat);
    const mine = bets.some((b) => b.pid === s.me);
    const won = s.phase === 'result' && s.order?.[0] === rat;
    // фон: своя ставка — золотом, победитель — ярче, остальные — через строку
    const band = (): void => (SIGNS3 ? v3Path(g, 40, top + 4, W - 80, ROW_H - 8, 14) : rr(g, 32, top + 4, W - 64, ROW_H - 8, 16));
    if (won || mine) {
      g.fillStyle = won ? 'rgba(255, 212, 92, 0.26)' : 'rgba(255, 212, 92, 0.16)';
      band();
      g.fill();
      if (mine) {
        g.fillStyle = GOLD;
        if (SIGNS3) g.fillRect(40, top + 18, 8, ROW_H - 36);
        else {
          rr(g, 32, top + 4, 12, ROW_H - 8, 6);
          g.fill();
        }
      }
    } else if (k % 2 === 0) {
      g.fillStyle = SIGNS3 ? 'rgba(255, 243, 222, 0.05)' : 'rgba(255, 255, 255, 0.045)';
      band();
      g.fill();
    }
    // место (в забеге и на финише)
    if (placed) {
      g.textAlign = 'right';
      g.font = `800 58px ${FONT}`;
      g.fillStyle = k === 0 ? GOLD : CREAM;
      g.fillText(String(k + 1), 104, base);
    }
    badge(g, 152, cy, 35, rat);
    g.textAlign = 'left';
    g.font = `700 58px ${FONT}`;
    g.fillStyle = CREAM;
    g.fillText(RATS[rat].name, 204, base);
    g.textAlign = 'right';
    g.font = `800 56px ${FONT}`;
    g.fillStyle = GOLD;
    g.fillText(`×${s.odds[rat] ?? '?'}`, 560, base);
    this.chips(s, bets, 596, 1340, cy, won);
    const sum = ratBank(bets);
    if (sum > 0) {
      g.font = `700 48px ${FONT}`;
      g.fillStyle = CREAM;
      line(g, [num(sum), '🪙'], W - 50, base - 3, 'right', 48);
    }
    if (s.phase === 'run') {
      g.fillStyle = 'rgba(255, 255, 255, 0.13)';
      rr(g, BAR_X0, top + ROW_H - 13 - BAR_H / 2, BAR_X1 - BAR_X0, BAR_H, BAR_H / 2);
      g.fill();
    }
  }

  /** Кто поставил на крысу: ник и сумма (своя — золотом, первой); на финише у победителя — выигрыш, остальные бледнее */
  private chips(s: BoardState, bets: readonly RatBetView[], x0: number, x1: number, cy: number, won: boolean): void {
    const g = this.ctx;
    const list = [...bets].sort((a, b) => Number(b.pid === s.me) - Number(a.pid === s.me));
    const lost = s.phase === 'result' && !won;
    g.font = `600 46px ${FONT}`;
    let x = x0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const mine = b.pid === s.me;
      const pay = won ? (s.wins.find((w) => w.nick === b.nick)?.payout ?? 0) : 0;
      const label = `${short(b.nick)} ${won && pay ? `+${num(pay)}` : num(b.stake)}`;
      const w = g.measureText(label).width + 34;
      const more = list.length - i - 1;
      if (i > 0 && x + w > x1 - (more > 0 ? 96 : 0)) {
        g.fillStyle = DIM;
        g.textAlign = 'left';
        g.fillText(`+${list.length - i}`, x + 4, cy + 16);
        break;
      }
      g.globalAlpha = lost ? 0.45 : 1;
      g.fillStyle = won && pay ? '#3c9b55' : mine ? GOLD : SIGNS3 ? 'rgba(255, 243, 222, 0.13)' : 'rgba(255, 255, 255, 0.14)';
      if (SIGNS3) v3Path(g, x, cy - 33, Math.min(w, x1 - x), 66, 14);
      else rr(g, x, cy - 33, Math.min(w, x1 - x), 66, 33);
      g.fill();
      g.fillStyle = mine && !(won && pay) ? (SIGNS3 ? V3.ink : '#2a2216') : SIGNS3 ? V3.cream : '#fff8e6';
      g.textAlign = 'left';
      g.fillText(fit(g, label, x1 - x - 34), x + 17, cy + 16);
      g.globalAlpha = 1;
      x += w + 12;
    }
  }

  /** v3: банк и выплаты — числа золотом с монеткой, подсказка с клавишей-колпачком E */
  private footer3(s: BoardState): void {
    const g = this.ctx;
    const y = H - 62;
    const coinSeg: Seg = { t: '', dw: 0.95, draw: (c, x, cy, px) => coin(c, x + px * 0.5, cy, px * 0.36) };
    const n = s.bets.length;
    const dim = (t: string): Seg => ({ t, c: DIM, w: 600 });
    const gold = (t: string): Seg => ({ t, c: V3.goldHi, w: 800 });
    let left: Seg[];
    let right: Seg[];
    if (s.phase === 'result') {
      const paid = s.wins.reduce((a, w) => a + w.payout, 0);
      left = s.wins.length ? [dim('Выплачено '), gold(num(paid)), coinSeg, dim(` · ставок было: ${n}`)] : n ? [dim(`Никто не угадал · ставок было: ${n}`)] : [dim('Без ставок')];
      right = [{ t: 'E', key: true }, dim('у арены — ставка на следующий')];
    } else {
      left = n ? [dim('Банк '), gold(num(ratBank(s.bets))), coinSeg, dim(` · ${n} ${betsWord(n)}`)] : [dim('Ставок пока нет')];
      right = s.phase === 'run' ? [dim('Ставки — после финиша · 1–6 болеть')]
        : s.phase === 'open' ? [{ t: 'E', key: true }, dim('у арены — успей поставить · 1–6 болеть')]
          : [{ t: 'E', key: true }, dim(`у арены — ставка · старт через ${RAT_OPEN_MS / 1000} с после первой`)];
    }
    const lw = v3Line(g, left, 70, y, 'left', 40, 620, 600).w;
    v3Line(g, right, W - 70, y, 'right', 40, W - 140 - lw - 40, 600);
    g.textBaseline = 'alphabetic';
  }

  private footer(s: BoardState): void {
    const g = this.ctx;
    const y = H - 44;
    g.font = `600 42px ${FONT}`;
    g.fillStyle = DIM;
    const n = s.bets.length;
    if (s.phase === 'result') {
      const paid = s.wins.reduce((a, w) => a + w.payout, 0);
      line(g, s.wins.length ? ['Выплачено ', num(paid), '🪙', ` · ставок было: ${n}`] : n ? [`Никто не угадал · ставок было: ${n}`] : ['Без ставок'], 50, y, 'left', 42);
      line(g, ['E у арены — ставка на следующий'], W - 50, y, 'right', 42);
      return;
    }
    line(g, n ? ['Банк ', num(ratBank(s.bets)), '🪙', ` · ${n} ${betsWord(n)}`] : ['Ставок пока нет'], 50, y, 'left', 42);
    const hint = s.phase === 'run' ? 'Ставки — после финиша · 1–6 болеть'
      : s.phase === 'open' ? 'E у арены — успей поставить · 1–6 болеть'
        : `E у арены — ставка · старт через ${RAT_OPEN_MS / 1000} с после первой`;
    line(g, [hint], W - 50, y, 'right', 42);
  }
}
