// Табличка «Веранда v3» для вывесок мира, которые рисуются на дереве или на своей доске (SIGNS3, client/ui/signs3.ts):
// жёсткая тень на дерево (без размытия) → тёмный контур → слива с лёгким вертикальным переходом → одна золотая кайма со
// скосами, звёздочки в углах. Деревянные доски остаются досками: табличка «привинчена» поверх, дерево видно по краям.
import { V3, v3Font, v3Path, v3Star } from '../ui/signs3.ts';

type Ctx = CanvasRenderingContext2D;

export interface PlaqueOpts {
  /** Жёсткая тень вниз — когда табличка лежит на дереве */
  shadow?: boolean;
  /** Звёздочки в углах — только у крупных */
  stars?: boolean;
  /** Толщина золотой каймы, px */
  line?: number;
}

export function v3Plaque(c: Ctx, x: number, y: number, w: number, h: number, cut: number, o: PlaqueOpts = {}): void {
  const line = o.line ?? Math.max(2, Math.round(h * 0.016));
  const ink = Math.max(2, Math.round(line * 1.3));
  if (o.shadow) {
    v3Path(c, x + 2, y + Math.max(3, h * 0.02), w, h, cut);
    c.fillStyle = 'rgba(40, 22, 12, .45)';
    c.fill();
  }
  v3Path(c, x, y, w, h, cut);
  c.fillStyle = V3.ink;
  c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#3d2632');
  g.addColorStop(1, '#2a1a22');
  v3Path(c, x + ink, y + ink, w - 2 * ink, h - 2 * ink, Math.max(1, cut - ink * 0.6));
  c.fillStyle = g;
  c.fill();
  const i2 = ink + line * 1.5;
  v3Path(c, x + i2, y + i2, w - 2 * i2, h - 2 * i2, Math.max(1, cut - i2 * 0.6));
  c.strokeStyle = V3.gold;
  c.lineWidth = line;
  c.stroke();
  if (o.stars) {
    const sp = cut * 0.62 + ink;
    const r = Math.max(5, cut * 0.3);
    for (const [sx, sy] of [[x + sp, y + sp], [x + w - sp, y + sp], [x + sp, y + h - sp], [x + w - sp, y + h - sp]]) v3Star(c, sx, sy, r);
  }
}

/** Строка по центру (cx): Rubik, кегль ужимается под ширину; spacing — разрядка в долях кегля (для заголовков) */
export function v3Line(c: Ctx, text: string, cx: number, y: number, weight: number, size: number, color: string, maxW: number, spacing = 0): void {
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.letterSpacing = `${Math.round(size * spacing)}px`;
  c.font = v3Font(weight, size);
  const w = c.measureText(text).width;
  if (w > maxW) {
    const s = Math.floor((size * maxW) / w);
    c.letterSpacing = `${Math.round(s * spacing)}px`;
    c.font = v3Font(weight, s);
  }
  c.fillStyle = color;
  c.fillText(text, cx, y);
  c.letterSpacing = '0px';
}
