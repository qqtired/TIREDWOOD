// Улица Аттракционов: единая дорожка вдоль фасадов (x −29,7…29,6), уличные доски по краям, номер дома у павильона автоматов
// и указатель «Куда идти» у звезды. Всё без коллизии, кроме столба указателя (shared/plaza2.ts — SIGNPOST).
import { SIGNPOST } from '../../../shared/plaza2.ts';
import { drawArm, drawHouseNumber, drawSignTop, drawStreetPlate, drawStreetRibbon } from './art.ts';
import { floorRibbon, paintTexture } from './gfx.ts';
import { Venue, type VenueCtx } from './venue.ts';

/** Куда указывают стрелки: всегда включённые места (режимы за флагами читаются по своим вывескам и афише у кафе) */
const DEST: ReadonlyArray<{ label: string; x: number; z: number }> = [
  { label: 'АВТОМАТЫ', x: -20, z: -21 },
  { label: 'ПЕЙНТБОЛ', x: 0, z: -16 },
  { label: 'КАРТИНГ', x: 20.5, z: -16 },
  { label: 'КАФЕ · КАРТЫ', x: 24, z: -3 },
  { label: 'КОЛЕСО ОБОЗРЕНИЯ', x: 24.4, z: 13 },
  { label: 'КАТЕР «ЛАСТОЧКА»', x: 8, z: 22 },
  { label: 'МАЯК · РЫБАЛКА', x: -19, z: 24 },
  { label: 'АКВАПАРК', x: -32, z: 9 },
  { label: 'ПРИМЕРОЧНАЯ', x: -25.5, z: -3 },
];

const IRON = 0x2a2f33;
const TIMBER = 0xb07a45;
const TIMBER_DARK = 0x6b4423;

/** Лента вдоль фасадов: от кромки (x −29,7) до парапета (x 29,6), от стен домов (z −16) на 3,4 м к площади */
const RIBBON = { x0: -29.7, x1: 29.6, z0: -16, z1: -12.6 };

export function buildStreet(ctx: VenueCtx): Venue {
  const v = new Venue('street', ctx, 59);
  const d = v.detail;

  // дорожка: повторяющийся холст (период 2 м)
  const w = RIBBON.x1 - RIBBON.x0;
  const map = paintTexture(256, 435, drawStreetRibbon, true);
  map.repeat.set(w / 2, 1);
  v.group.add(floorRibbon(map, (RIBBON.x0 + RIBBON.x1) / 2, (RIBBON.z0 + RIBBON.z1) / 2, w, RIBBON.z1 - RIBBON.z0, ctx.wet));

  // уличные доски на низких кирпичных стенках по краям улицы, стрелка — вдоль неё
  v.plaques.add({ x: -29, y: 0.72, z: -15.985, ry: 0, w: 1.7, h: 0.36, draw: (c, W, H) => drawStreetPlate(c, W, H, 1), ppm: 220 });
  v.plaques.add({ x: 29, y: 0.72, z: -15.985, ry: 0, w: 1.7, h: 0.36, draw: (c, W, H) => drawStreetPlate(c, W, H, -1), ppm: 220 });
  // номер дома на столбе павильона автоматов (дом 1)
  v.plaques.add({ x: -22.5, y: 2.2, z: -15.985, ry: 0, w: 0.36, h: 0.36, draw: (c, W, H) => drawHouseNumber(c, W, H, 1), ppm: 260 });

  // указатель «Куда идти»: столб на кирпичном основании, на нём — стрелки в сторону мест, на макушке — табличка
  const { x, z, h } = SIGNPOST;
  d.box(0.56, 0.16, 0.56, x, 0.08, z, 0x8f8a80);
  d.box(0.4, 0.12, 0.4, x, 0.22, z, 0xa8a398);
  d.cyl(0.07, 0.1, h, x, h / 2, z, TIMBER_DARK, 10);
  d.cyl(0.13, 0.13, 0.1, x, h + 0.02, z, IRON, 10);
  d.ball(0.09, x, h + 0.14, z, 0xffd23f, 8, 6);
  for (const side of [1, -1]) {
    v.plaques.add({ x, y: h - 0.05, z: z + side * 0.115, ry: side > 0 ? 0 : Math.PI, w: 1.0, h: 0.3, draw: (c, W, H) => drawSignTop(c, W, H, 'КУДА ИДТИ?'), ppm: 240 });
  }
  const arms = DEST.map((t) => {
    const dx = t.x - x;
    const dz = t.z - z;
    return { ...t, meters: Math.hypot(dx, dz), theta: Math.atan2(-dz, dx) };
  }).sort((a, b) => a.theta - b.theta);
  const L = 1.95;
  arms.forEach((a, i) => {
    const y = 1.35 + i * 0.205;
    const dirx = Math.cos(a.theta);
    const dirz = -Math.sin(a.theta);
    const nx = Math.sin(a.theta);
    const nz = Math.cos(a.theta);
    // сердцевина доски без острия и две лицевые таблички; остриё — на табличках
    const body = L - 0.18;
    const cx = x + dirx * (0.12 + body / 2);
    const cz = z + dirz * (0.12 + body / 2);
    d.box(body, 0.27, 0.05, cx, y, cz, TIMBER, a.theta);
    const px = x + dirx * (0.12 + L / 2);
    const pz = z + dirz * (0.12 + L / 2);
    v.plaques.add({ x: px + nx * 0.03, y, z: pz + nz * 0.03, ry: a.theta, w: L, h: 0.3, draw: (c, W, H) => drawArm(c, W, H, a.label, a.meters, true), ppm: 200 });
    v.plaques.add({ x: px - nx * 0.03, y, z: pz - nz * 0.03, ry: a.theta + Math.PI, w: L, h: 0.3, draw: (c, W, H) => drawArm(c, W, H, a.label, a.meters, false), ppm: 200 });
    // хомут на столбе
    d.box(0.3, 0.06, 0.3, x, y, z, IRON);
  });
  return v.finish(true);
}
