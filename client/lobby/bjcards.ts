// Атлас 52 карт блэкджека + рубашка: один холст на всё — и 3D-карты на сукне, и карты в нижней панели.
// Рисунок масти и рубашка — те же, что у дурака (client/render/textures.ts), только достоинства 2…10 тоже есть.
import * as THREE from 'three';
import { RANK_NAMES, rankOf, suitOf } from '../../shared/blackjack.ts';
import { drawCardBack, drawSuit } from '../render/textures.ts';

/** 9 × 6 ячеек: 0–51 — лица (масть = c div 13, достоинство = c mod 13, туз — 0), 52 — рубашка. */
export const BJ_ATLAS = { cols: 9, rows: 6, cellW: 112, cellH: 160, padX: 3, padY: 3, back: 52 } as const;

const RED = '#cc2730';
const BLACK = '#1d1f2c';
const PAPER = '#fbf7ee';

function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight: number): void {
  ctx.font = `${weight} ${size}px Rubik, system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = `${weight} ${Math.floor((size * maxW) / w)}px Rubik, system-ui, sans-serif`;
}

/** Лицо карты: индексы в углах (нижний перевёрнут), посередине крупно достоинство и масть; картинки и туз — в золотой рамке. */
function drawFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, card: number): void {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const ink = suit >= 2 ? RED : BLACK;
  const label = RANK_NAMES[rank];
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96,74,52,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (rank === 0 || rank >= 10) {
    ctx.fillStyle = suit >= 2 ? 'rgba(204,39,48,0.07)' : 'rgba(29,31,44,0.06)';
    ctx.beginPath();
    ctx.roundRect(x + 21, y + 19, w - 42, h - 38, 8);
    ctx.fill();
    ctx.strokeStyle = '#c99a3c';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const flip of [false, true]) {
    ctx.save();
    if (flip) {
      ctx.translate(x + w, y + h);
      ctx.rotate(Math.PI);
    } else {
      ctx.translate(x, y);
    }
    fitFont(ctx, label, 30, 27, 800);
    ctx.fillText(label, 15, 19);
    drawSuit(ctx, suit, 15, 42, 16);
    ctx.restore();
  }
  fitFont(ctx, label, 62, w - 40, 900);
  ctx.fillText(label, x + w / 2, y + h * 0.42);
  drawSuit(ctx, suit, x + w / 2, y + h * 0.71, 37);
}

let atlas: HTMLCanvasElement | null = null;

/** Холст атласа (создаётся один раз). */
export function bjAtlasCanvas(): HTMLCanvasElement {
  if (atlas) return atlas;
  const A = BJ_ATLAS;
  const c = document.createElement('canvas');
  c.width = A.cols * A.cellW;
  c.height = A.rows * A.cellH;
  const ctx = c.getContext('2d')!;
  const w = A.cellW - A.padX * 2;
  const h = A.cellH - A.padY * 2;
  for (let i = 0; i <= A.back; i++) {
    const x = (i % A.cols) * A.cellW + A.padX;
    const y = Math.floor(i / A.cols) * A.cellH + A.padY;
    if (i === A.back) drawCardBack(ctx, x, y, w, h);
    else drawFace(ctx, x, y, w, h, i);
  }
  atlas = c;
  return c;
}

export function bjAtlasTexture(): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(bjAtlasCanvas());
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Положение карты c в CSS-атласе: background-position в процентах (card < 0 — рубашка). */
export function bjAtlasPosition(card: number): string {
  const A = BJ_ATLAS;
  const i = card < 0 ? A.back : card;
  const bx = ((i % A.cols) / (A.cols - 1)) * 100;
  const by = (Math.floor(i / A.cols) / (A.rows - 1)) * 100;
  return `${bx.toFixed(3)}% ${by.toFixed(3)}%`;
}
