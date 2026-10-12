// Fight Club, восток площади: вход в подвал — в южной стене кафе «Чайка» (client/fight/door.ts). Его сам приямок уже
// есть; здесь — то, что делает вход видимым: вывеска-кронштейн у юго-западного угла (её видно с набережной), красный
// фонарь над проёмом, латунные столбики с канатом (твёрдые, shared/plaza2.ts), коврик под кругом и вышибала Макс.
import { FC_CIRCLE, FC_DOOR } from '../../../shared/fight.ts';
import { FIGHT_POSTS } from '../../../shared/plaza2.ts';
import { drawFightPad, drawFightSign } from './art.ts';
import { TOUT_INFO } from './data.ts';
import { floorPad, paintTexture, wallPlate } from './gfx.ts';
import { Venue, type VenueCtx } from './venue.ts';

const IRON = 0x2a2f33;
const BRASS = 0xd9b04a;
const ROPE = 0xa3162b;

/** Где висит вывеска-кронштейн: перпендикулярно южной стене, лицо на запад (к набережной) и на восток */
const BLADE = { x: 24.95, y: 3.0, z: 4.95, w: 1.5, h: 1.9 };

export function buildFight(ctx: VenueCtx): Venue {
  const v = new Venue('fight', ctx, 53);
  const d = v.detail;
  const wallZ = FC_DOOR.z;

  // вывеска-кронштейн: западная сторона — с рамкой и красными лампочками, восточная — просто та же картинка
  const west = v.sign({ w: BLADE.w, h: BLADE.h, x: BLADE.x, y: BLADE.y, z: BLADE.z, ry: -Math.PI / 2, frame: 0x2a1d17, bulbs: 0xff6a4a, bulbStep: 0.3, glow: 0.45, halo: 0xff5a40, haloK: 0.2, ppm: 220, draw: drawFightSign });
  const east = wallPlate(west.panel.material.map!, BLADE.x + 0.14, BLADE.y, BLADE.z, BLADE.w, BLADE.h, Math.PI / 2, 0.35);
  v.group.add(east);
  // рука кронштейна от стены над доской, раскос и две цепи
  const top = BLADE.y + BLADE.h / 2 + 0.2;
  d.box(0.09, 0.09, 1.9, BLADE.x + 0.04, top, wallZ + 0.95, IRON);
  d.rod([BLADE.x + 0.04, top - 0.04, wallZ + 0.1], [BLADE.x + 0.04, top - 0.7, wallZ + 0.0], 0.03, IRON, 5);
  d.rod([BLADE.x + 0.04, top - 0.02, wallZ + 1.1], [BLADE.x + 0.04, top - 0.52, wallZ + 0.1], 0.024, IRON, 5);
  d.box(0.16, 0.16, 0.06, BLADE.x + 0.04, top, wallZ + 0.04, IRON);
  for (const dz of [0.35, 1.5]) d.rod([BLADE.x + 0.04, top, wallZ + dz], [BLADE.x + 0.04, top - 0.3, wallZ + dz], 0.012, 0x777777, 4);
  v.glow.ball(0.07, BLADE.x + 0.04, top - 0.3, wallZ + 1.5, 0xff5a40, 8, 6);

  // красный фонарь над проёмом: клетка, красное стекло, ореол
  const lx = FC_DOOR.x;
  const ly = 3.62;
  d.box(0.07, 0.07, 0.18, lx, ly + 0.28, wallZ + 0.09, IRON);
  d.cyl(0.13, 0.13, 0.03, lx, ly + 0.18, wallZ + 0.2, IRON, 10);
  v.glow.cyl(0.1, 0.1, 0.24, lx, ly, wallZ + 0.2, 0xff4638, 10);
  d.cyl(0.13, 0.13, 0.03, lx, ly - 0.16, wallZ + 0.2, IRON, 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    d.cyl(0.011, 0.011, 0.34, lx + Math.cos(a) * 0.115, ly, wallZ + 0.2 + Math.sin(a) * 0.115, IRON, 4);
  }
  v.lampGlow(0xff4a3a, 2.6, lx, ly, wallZ + 0.2, 0.55);

  // латунные столбики и канат (столбики твёрдые)
  const rope: Array<[number, number, number]> = [];
  for (const p of FIGHT_POSTS) {
    d.cyl(0.15, 0.17, 0.035, p.x, 0.018, p.z, BRASS, 14);
    d.cyl(0.032, 0.04, p.h - 0.1, p.x, p.h / 2 - 0.02, p.z, BRASS, 8);
    d.ball(0.065, p.x, p.h, p.z, BRASS, 10, 8);
    rope.push([p.x, p.h - 0.06, p.z]);
  }
  const [a, b] = rope;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const at = (t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] - 0.2 * (1 - (2 * t - 1) ** 2), a[2] + (b[2] - a[2]) * t];
    d.rod(at(t0), at(t1), 0.024, ROPE, 5);
  }

  // коврик под кругом: бетон с красно-чёрной каймой
  const pad = paintTexture(920, 760, drawFightPad, false, 0.55);
  v.group.add(floorPad(pad, FC_CIRCLE.x, FC_CIRCLE.z - 0.03, 3.7, 3.04, ctx.wet, 0.004));

  v.touts.push({ ...TOUT_INFO.fight, key: 'fight', x: 29.55, z: 5.0, yaw: (Math.PI * 3) / 4, arms: 'hips' });
  return v.finish(false);
}
