// Кафе «Чайка» как справочная площади: живая афиша «Сегодня в городе» на фасаде (меловая доска с лампочками, строки
// обновляются по статусам режимов), бариста Тоня у окна читает её вслух, на полке окна — чайник, чашки и булочки, на двери
// — табличка «Открыто». Домик и его коллизия — прежние (client/lobby/world.ts, shared/maps/lobby.ts); здесь только то, что
// висит на стене и стоит перед ней: твёрдого ничего нет.
import { TOUT_INFO } from './data.ts';
import { AGENDA_PPM, AgendaBoard, drawAgenda } from './agenda.ts';
import { bigText, fitFont, paintTexture, roundRectPath, wallPlate } from './gfx.ts';
import { Venue, type VenueCtx } from './venue.ts';

const WOOD = 0x6f4a2e;
const WOOD_DARK = 0x4a3020;

/** Где висит доска: западная стена кафе (x = 24), севернее окна и вывески, лицом на запад, к террасе и площади */
export const AGENDA_AT = { x: 23.9, y: 1.95, z: -8.3, w: 2.8, h: 2.3 };

/** Табличка на двери: «ОТКРЫТО» и чем здесь заняты */
function drawOpenSign(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
  roundRectPath(ctx, 2, 2, W - 4, H - 4, H * 0.16);
  ctx.fillStyle = '#b83a2e';
  ctx.fill();
  ctx.strokeStyle = '#f6f2e8';
  ctx.lineWidth = Math.max(3, H * 0.04);
  roundRectPath(ctx, H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14, H * 0.11);
  ctx.stroke();
  bigText(ctx, 'ОТКРЫТО', W / 2, H * 0.4, H * 0.3, W * 0.8, '#ffffff', '#b83a2e', 0, 900, '');
  const t = 'АФИША · КАРТЫ · ЧАЙ';
  fitFont(ctx, t, H * 0.115, W * 0.8, 800);
  ctx.fillStyle = '#ffe9b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, W / 2, H * 0.76);
}

export interface CafeParts {
  venue: Venue;
  board: AgendaBoard;
}

export function buildCafe(ctx: VenueCtx): CafeParts {
  const v = new Venue('cafe', ctx, 71);
  const d = v.detail;
  const A = AGENDA_AT;

  // доска афиши: рамка и лампочки — как у вывесок улицы, холст — живой
  const out = v.sign({
    w: A.w, h: A.h, x: A.x, y: A.y, z: A.z, ry: -Math.PI / 2, frame: WOOD, bulbs: 0xfff0c8, bulbStep: 0.34,
    glow: 0.3, halo: 0xffe2a8, haloK: 0.1, ppm: AGENDA_PPM, draw: (c, W, H) => drawAgenda(c, W, H, []),
  });
  const board = new AgendaBoard(out.panel);
  // мелованный лоток под доской: два мелка и губка
  const ledgeY = A.y - A.h / 2 - 0.27;
  d.box(0.16, 0.05, A.w + 0.4, 23.83, ledgeY, A.z, WOOD_DARK);
  for (const [dz, c] of [[-0.46, 0xffffff], [-0.36, 0xffd96b]] as const) d.cyl(0.011, 0.011, 0.075, 23.82, ledgeY + 0.04, A.z + dz, c, 6, 0, Math.PI / 2, 0);
  d.box(0.07, 0.04, 0.1, 23.83, ledgeY + 0.045, A.z + 0.5, 0xe9c34a);

  // полка окна (стена x = 24, полка 23,6…24; верх y = 1,13): чайник, чашки, булочки, банка с ромашками
  const sx = 23.8;
  const top = 1.13;
  const TEAL = 0x3f86c9;
  const CREAM = 0xf2ede0;
  const tz = -5.2;
  d.ball(0.1, sx, top + 0.095, tz, TEAL, 12, 9, 1, 0.92, 1);
  d.cyl(0.05, 0.065, 0.03, sx, top + 0.2, tz, CREAM, 10);
  d.ball(0.022, sx, top + 0.235, tz, CREAM, 6, 5);
  d.rod([sx, top + 0.1, tz + 0.08], [sx, top + 0.2, tz + 0.2], 0.018, TEAL, 5);
  d.torus(0.055, 0.014, sx, top + 0.11, tz - 0.1, TEAL, 0, Math.PI / 2, 0, 5, 12);
  const cups: ReadonlyArray<readonly [number, number]> = [[-4.55, 0xd9534f], [-4.15, CREAM], [-3.75, 0xf2c230]];
  for (const [cz, cc] of cups) {
    d.cyl(0.075, 0.065, 0.012, 23.84, top + 0.006, cz, CREAM, 10);
    d.cyl(0.055, 0.04, 0.065, 23.84, top + 0.044, cz, cc, 10);
    d.torus(0.022, 0.008, 23.84, top + 0.05, cz + 0.058, cc, 0, Math.PI / 2, 0, 4, 8);
  }
  d.cyl(0.18, 0.16, 0.014, sx, top + 0.007, -2.8, 0xd8c7a0, 14);
  for (const [bx, bz] of [[-0.07, -0.05], [0.07, -0.05], [0, 0.06]] as const) d.ball(0.065, sx + bx, top + 0.055, -2.8 + bz, 0xd68a3c, 8, 6, 1, 0.78, 1);
  d.ball(0.055, sx, top + 0.115, -2.8, 0xe3a14e, 8, 6, 1, 0.8, 1);
  d.cyl(0.05, 0.05, 0.12, sx, top + 0.06, -1.5, 0xcfe6ee, 10);
  for (const [fx, fz, fh] of [[-0.03, -0.02, 0.28], [0.03, 0.02, 0.33], [0, 0.04, 0.24]] as const) {
    d.rod([sx, top + 0.1, -1.5], [sx + fx, top + fh, -1.5 + fz], 0.006, 0x4f9a3a, 4);
    d.ball(0.03, sx + fx, top + fh, -1.5 + fz, 0xffffff, 8, 6, 1, 0.5, 1);
    d.ball(0.012, sx + fx - 0.012, top + fh, -1.5 + fz, 0xf2c230, 5, 4);
  }

  // табличка на двери (окошко двери — на x = 23,94, табличка перед ним)
  const open = paintTexture(240, 152, drawOpenSign);
  const sign = wallPlate(open, 23.915, 1.62, 2.2, 0.6, 0.38, -Math.PI / 2, 0.28);
  v.group.add(sign);
  ctx.signs.set(sign.material, 0.28);

  // бариста у северного края окна, лицом к террасе
  v.touts.push({ ...TOUT_INFO.cafe, key: 'cafe', x: 22.75, z: -6.4, yaw: Math.PI / 2 + 0.25 });
  return { venue: v.finish(true), board };
}
