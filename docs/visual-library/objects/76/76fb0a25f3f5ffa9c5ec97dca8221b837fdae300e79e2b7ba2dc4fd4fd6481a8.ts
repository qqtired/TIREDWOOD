// Афиша «СЕГОДНЯ В ГОРОДЕ» на фасаде кафе «Чайка»: меловая доска, в строке — одно место (режим), точка горит, если там что-то
// идёт или можно присоединиться. Рисунок — на холсте панели вывески; перерисовывается, только когда меняется текст строк
// (в худшем случае раз в секунду — тикает обратный отсчёт).
import * as THREE from 'three';
import { FONT, roundRectPath, speckle } from './gfx.ts';
import type { AgendaRow } from './live.ts';

/** Пикселей на метр у доски афиши */
export const AGENDA_PPM = 300;

const SLATE_TOP = '#28483f';
const SLATE_BOTTOM = '#1a332d';
const CHALK = '#f6efdc';
const CHALK_DIM = 'rgba(246,239,220,0.46)';
const YELLOW = '#ffd96b';
const HOT = '#8fe38a';

/** Чайка: два взмаха одной линией, как на вывеске кафе */
function gull(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.15;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.52, cy + s * 0.05);
  ctx.quadraticCurveTo(cx - s * 0.28, cy - s * 0.42, cx, cy + s * 0.04);
  ctx.quadraticCurveTo(cx + s * 0.28, cy - s * 0.42, cx + s * 0.52, cy + s * 0.05);
  ctx.stroke();
}

/** Доска целиком: шапка, строки афиши (не больше восьми), подпись внизу. */
export function drawAgenda(ctx: CanvasRenderingContext2D, W: number, H: number, rows: readonly AgendaRow[]): void {
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, SLATE_TOP);
  g.addColorStop(1, SLATE_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 31, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.14)', 16);
  // стёртые разводы мела
  ctx.fillStyle = 'rgba(255,255,255,0.028)';
  for (const [x, y, rx, ry] of [[0.28, 0.4, 0.3, 0.1], [0.72, 0.62, 0.28, 0.09], [0.45, 0.88, 0.34, 0.06]] as const) {
    ctx.beginPath();
    ctx.ellipse(W * x, H * y, W * rx, H * ry, -0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  // меловая рамка
  ctx.strokeStyle = 'rgba(246,239,220,0.36)';
  ctx.lineWidth = Math.max(3, H * 0.005);
  roundRectPath(ctx, H * 0.03, H * 0.03, W - H * 0.06, H - H * 0.06, H * 0.035);
  ctx.stroke();

  // шапка
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  gull(ctx, W * 0.115, H * 0.115, H * 0.12, YELLOW);
  ctx.font = `900 ${Math.round(H * 0.078)}px ${FONT}`;
  ctx.fillStyle = YELLOW;
  ctx.fillText('СЕГОДНЯ В ГОРОДЕ', W * 0.2, H * 0.1, W * 0.72);
  ctx.font = `600 ${Math.round(H * 0.034)}px ${FONT}`;
  ctx.fillStyle = CHALK_DIM;
  ctx.fillText('Кафе «Чайка» · афиша обновляется сама', W * 0.2, H * 0.165, W * 0.72);
  ctx.strokeStyle = 'rgba(246,239,220,0.4)';
  ctx.lineWidth = Math.max(2.5, H * 0.004);
  ctx.setLineDash([H * 0.02, H * 0.014]);
  ctx.beginPath();
  ctx.moveTo(W * 0.06, H * 0.205);
  ctx.lineTo(W * 0.94, H * 0.205);
  ctx.stroke();
  ctx.setLineDash([]);

  // строки: чем их меньше, тем крупнее; блок — по центру области
  const top = H * 0.225;
  const area = H * 0.7;
  const n = Math.max(1, rows.length);
  const rowH = Math.min(H * 0.125, area / n);
  const y0 = top + (area - rowH * n) / 2;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const y = y0 + i * rowH;
    const cy = y + rowH / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRectPath(ctx, W * 0.05, y + 2, W * 0.9, rowH - 4, rowH * 0.28);
      ctx.fill();
    }
    const rad = Math.max(7, rowH * 0.16);
    const dx = W * 0.095;
    if (r.hot) {
      ctx.fillStyle = 'rgba(143,227,138,0.24)';
      ctx.beginPath();
      ctx.arc(dx, cy, rad * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = HOT;
      ctx.beginPath();
      ctx.arc(dx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = CHALK_DIM;
      ctx.lineWidth = Math.max(2.5, rad * 0.3);
      ctx.beginPath();
      ctx.arc(dx, cy, rad * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.font = `800 ${Math.round(rowH * 0.5)}px ${FONT}`;
    ctx.fillStyle = r.hot ? CHALK : CHALK_DIM;
    ctx.fillText(r.name, W * 0.14, cy + rowH * 0.02, W * 0.29);
    ctx.font = `600 ${Math.round(rowH * 0.42)}px ${FONT}`;
    ctx.fillStyle = r.hot ? '#fff2c2' : CHALK_DIM;
    ctx.fillText(r.text, W * 0.45, cy + rowH * 0.02, W * 0.47);
  }

  // подпись внизу: куда идти за подробностями
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.round(H * 0.031)}px ${FONT}`;
  ctx.fillStyle = CHALK_DIM;
  ctx.fillText('Бариста Тоня расскажет, куда идти', W / 2, H * 0.953, W * 0.86);
}

/** Панель афиши: холст живёт у вывески (marquee), здесь он только перерисовывается по новым строкам. */
export class AgendaBoard {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly map: THREE.Texture;
  private key = '\u0000';
  private last: readonly AgendaRow[] = [];

  constructor(panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>) {
    const map = panel.material.map;
    if (!map) throw new Error('у панели афиши нет холста');
    this.map = map;
    this.ctx = (map.image as HTMLCanvasElement).getContext('2d')!;
    // шрифт мог догрузиться уже после первой отрисовки: тогда перерисуем те же строки
    void document.fonts?.ready.then(() => {
      this.key = '\u0000';
      this.set(this.last);
    });
  }

  /** Строки афиши; те же слова второй раз не перерисовываются. */
  set(rows: readonly AgendaRow[]): void {
    let key = '';
    for (const r of rows) key += `${r.name}\u0001${r.text}\u0001${r.hot ? 1 : 0}\u0002`;
    this.last = rows;
    if (key === this.key) return;
    this.key = key;
    const { canvas } = this.ctx;
    drawAgenda(this.ctx, canvas.width, canvas.height, rows);
    this.map.needsUpdate = true;
  }
}
