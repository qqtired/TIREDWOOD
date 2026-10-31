// Вывески и табло в мире в стиле «Веранда v3» (UI 3.0, docs/ui3/brief.md, решение №14): общая палитра и рисование на холсте.
// Пока вывески показываются владельцу, новый вид включает ?ui3 в адресе (снимки для лаборатории lab/signs3/); в игре он будет
// включаться вместе с новым HUD. Старый вид каждой вывески остаётся в коде рядом — откат одной строкой.

export const SIGNS3: boolean = typeof location !== 'undefined' && new URLSearchParams(location.search).has('ui3');

/** Палитра HUD «Веранда v3»: тёмная слива, золото, крем; акценты — как у HUD. */
export const V3 = {
  plum: '#2e1d26', plumDeep: '#22151c', plumLift: '#3d2632', ink: '#1e1016',
  gold: '#d4a552', goldHi: '#ffd35a', goldDim: 'rgba(212, 165, 82, .45)',
  cream: '#fff3de', creamDim: '#ecd8b6', dim: 'rgba(255, 243, 222, .62)',
  teal: '#7fdccd', coral: '#ff6a5c', good: '#a2d872',
  font: 'Rubik, system-ui, sans-serif',
} as const;

export const v3Font = (weight: number, px: number): string => `${weight} ${Math.round(px)}px ${V3.font}`;

/** Контур таблички со скошенными углами (скос c). */
export function v3Path(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number): void {
  const k = Math.max(0, Math.min(c, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y); ctx.lineTo(x + w - k, y); ctx.lineTo(x + w, y + k); ctx.lineTo(x + w, y + h - k);
  ctx.lineTo(x + w - k, y + h); ctx.lineTo(x + k, y + h); ctx.lineTo(x, y + h - k); ctx.lineTo(x, y + k);
  ctx.closePath();
}

/** Четырёхлучевая звёздочка — только у крупных вывесок (по углам или по краям заголовка). */
export function v3Star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string = V3.gold): void {
  const t = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + t, cy - t); ctx.lineTo(cx + r, cy); ctx.lineTo(cx + t, cy + t);
  ctx.lineTo(cx, cy + r); ctx.lineTo(cx - t, cy + t); ctx.lineTo(cx - r, cy); ctx.lineTo(cx - t, cy - t);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

export interface V3PlateOpts {
  cut?: number; // скос угла, px
  line?: number; // толщина каймы, px
  inset?: number; // отступ каймы от края, px
  fill?: string | CanvasGradient;
  edge?: string;
  stars?: boolean; // звёздочки в четырёх углах каймы
}

/** Табличка v3: тёмная слива со скошенными углами и одной золотой волосяной каймой внутри. */
export function v3Plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: V3PlateOpts = {}): void {
  const cut = o.cut ?? Math.min(w, h) * 0.1;
  const line = o.line ?? Math.max(2, Math.min(w, h) * 0.014);
  const inset = o.inset ?? line * 2.5;
  v3Path(ctx, x, y, w, h, cut);
  ctx.fillStyle = o.fill ?? V3.plum;
  ctx.fill();
  v3Path(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, cut - inset * 0.6));
  ctx.lineWidth = line;
  ctx.strokeStyle = o.edge ?? V3.gold;
  ctx.stroke();
  if (o.stars) {
    const s = inset + line * 4, r = line * 2.4;
    for (const [sx, sy] of [[x + s, y + s], [x + w - s, y + s], [x + s, y + h - s], [x + w - s, y + h - s]]) v3Star(ctx, sx, sy, r, o.edge ?? V3.gold);
  }
}

/** Тонкая золотая линия-разделитель, тающая к краям (как в карточках HUD). */
export function v3Rule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, line = 2, color: string = V3.goldDim): void {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(212, 165, 82, 0)'); g.addColorStop(0.12, color); g.addColorStop(0.88, color); g.addColorStop(1, 'rgba(212, 165, 82, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y - line / 2, w, line);
}
