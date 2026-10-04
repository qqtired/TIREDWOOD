// Улица Аттракционов, север площади: входы в «Пейнтбол» (склад), «Картинг» (гараж), «Крепость» (проулок справа от склада)
// и «Выше облаков» (портал перед проулком слева). Вывески-марки с лампочками, флаги, кляксы, коврики-«двери», покрышки,
// башни над крышами и зазывалы. Всё, кроме бочек и покрышек (shared/plaza2.ts), — без коллизии: над головой, на стенах
// и на земле, а башни — за линией зданий (z < −27), куда не попасть.
import { FORT_ARCH, KART_START, SKILL_PORTAL } from '../../../shared/maps/lobby.ts';
import { KART_TIRES, PB_BARRELS } from '../../../shared/plaza2.ts';
import {
  drawBanner, drawClock, drawCloudPad, drawCloudSign, drawDrawbridge, drawFortSign, drawKartPad, drawKarting, drawPaintPad, drawPaintball,
} from './art.ts';
import { TOUT_INFO } from './data.ts';
import { Decals, cloud, floorPad, paintTexture, wallPlate } from './gfx.ts';
import { LinePlate } from './plate.ts';
import { Venue, type VenueCtx } from './venue.ts';

const RED = 0xe8403a;
const BLUE = 0x2f8cff;
const YELLOW = 0xffc83a;
const STONE = 0xdccaa0;
const STONE_DARK = 0xbfa97c;
const IRON = 0x30353b;
const WOOD = 0x7a4f2e;

/** Улица за домами: уровень земли (как в world.ts) */
const STREET_Y = -0.6;

export interface NorthParts {
  paint: Venue;
  kart: Venue;
  fort: Venue;
  fortKeep: Venue;
  fortPlate: LinePlate;
  sky: Venue;
  skyTower: Venue;
}

// ------------------------------------------------------------ пейнтбол

function buildPaintball(ctx: VenueCtx): Venue {
  const v = new Venue('paint', ctx, 11);
  const d = v.detail;
  // вывеска над воротами склада вместо «СКЛАД №3»
  v.sign({ w: 9.2, h: 1.75, x: 0, y: 9.5, z: -15.9, frame: 0x14275c, bulbs: 0xfff0b0, glow: 0.42, halo: 0x8fb8ff, haloK: 0.2, draw: drawPaintball });
  for (const x of [-4.2, 4.2]) d.box(0.2, 0.8, 0.28, x, 9.2, -16.12, IRON);
  // флаги команд над краями крыши
  for (const [x, hex] of [[-8.3, RED], [8.3, BLUE]] as const) {
    d.cyl(0.045, 0.06, 3.5, x, 11.35, -16.2, IRON, 8);
    d.ball(0.1, x, 13.15, -16.2, YELLOW);
    v.flags.add(x, 12.9, -16.2, 2.3, 1.3, [hex], 0, x);
  }
  // бочки-мишени по бокам ворот (твёрдые — shared/plaza2.ts)
  for (const b of PB_BARRELS) {
    d.cyl(0.34, 0.34, b.h, b.x, b.h / 2, b.z, b.color, 18);
    for (const y of [0.2, 0.75]) d.torus(0.345, 0.024, b.x, y, b.z, 0x2a2a2a, Math.PI / 2, 0, 0, 5, 18);
    d.cyl(0.3, 0.3, 0.02, b.x, b.h + 0.005, b.z, 0x383838, 18);
    // мишень на боку, лицом к площади
    for (const [r, c] of [[0.22, 0xf4f1e8], [0.155, b.color], [0.095, 0xf4f1e8], [0.04, b.color]] as const) {
      d.cyl(r, r, 0.02, b.x, 0.5, b.z + 0.335, c, 20, 0, Math.PI / 2);
    }
    // банка с краской на бочке
    d.cyl(0.1, 0.1, 0.16, b.x - 0.1, b.h + 0.09, b.z, b.color === RED ? 0xffd23f : 0xf4f1e8, 10);
  }
  // коврик перед воротами: красная и синяя половины, стрелки внутрь
  const pad = paintTexture(1400, 640, drawPaintPad);
  v.group.add(floorPad(pad, 0, -14.6, 7.0, 3.2, ctx.wet, 0.005));
  // кляксы на кирпиче и на плитке
  const dec = new Decals();
  const wall: Array<[number, number, number, number, number]> = [
    [-6.1, 2.6, 2.7, 0, RED], [-8.2, 4.5, 2.1, 3, BLUE], [6.2, 1.9, 2.8, 1, BLUE], [7.0, 4.2, 2.0, 2, RED],
    [-5.0, 4.9, 1.7, 1, YELLOW], [5.2, 4.9, 1.6, 3, YELLOW], [-8.4, 1.0, 1.6, 2, BLUE]
  ];
  for (const [x, y, size, cell, hex] of wall) dec.wall(x, y, -15.955, size, 0, cell, hex, (x + y) % 3);
  const floor: Array<[number, number, number, number, number]> = [
    [-2.3, -12.4, 2.4, 0, RED], [2.5, -12.2, 2.5, 2, BLUE], [-5.3, -11.6, 1.8, 1, YELLOW], [5.2, -11.2, 1.9, 3, RED],
    [0.2, -10.2, 1.4, 0, BLUE], [-7.6, -13.4, 2.0, 2, BLUE], [7.7, -13.1, 1.9, 1, RED],
  ];
  for (const [x, z, size, cell, hex] of floor) dec.floor(x, z, size, cell, hex, x * 1.7);
  v.group.add(dec.mesh(ctx.wet));
  v.touts.push({ ...TOUT_INFO.paint, key: 'paint', x: -4.45, z: -13.2, yaw: Math.PI, gun: true });
  return v.finish();
}

// ------------------------------------------------------------ картинг

function buildKarting(ctx: VenueCtx): Venue {
  const v = new Venue('kart', ctx, 17);
  const d = v.detail;
  v.sign({ w: 9.6, h: 1.85, x: 20.5, y: 7.6, z: -15.9, frame: 0x2a2a2e, bulbs: 0xffe8a0, glow: 0.4, halo: 0xffd9a0, haloK: 0.18, draw: drawKarting });
  for (const x of [16.6, 24.4]) d.box(0.2, 0.7, 0.28, x, 6.9, -16.12, IRON);
  // стопки красно-белых покрышек у ворот (твёрдые — shared/plaza2.ts)
  for (const t of KART_TIRES) {
    for (let i = 0; i < 3; i++) d.torus(0.31, 0.14, t.x, 0.14 + i * 0.28, t.z, i % 2 ? 0xf4f1e8 : 0xd9372b, Math.PI / 2, 0, 0, 8, 20);
    d.cyl(0.22, 0.22, 0.02, t.x, 0.84, t.z, 0x25272b, 14);
  }
  // шлем на верхней покрышке левой стопки
  const l = KART_TIRES[0];
  d.ball(0.17, l.x, 0.84 + 0.12, l.z, 0xffd23f, 12, 8, 1, 0.9, 1.1);
  d.box(0.16, 0.06, 0.04, l.x, 0.84 + 0.15, l.z + 0.14, 0x1d1d20);
  // канистры и ящик с инструментом у стены
  d.cyl(0.14, 0.14, 0.42, 14.2, 0.21, -15.3, 0xd9372b, 12);
  d.cyl(0.14, 0.14, 0.42, 14.55, 0.21, -15.2, 0xd9372b, 12);
  d.box(0.46, 0.22, 0.26, 25.4, 0.11, -15.45, 0x2f6ad8);
  // пит-лейн: асфальт с белой решёткой и красно-белым поребриком вокруг круга «Старт»
  const pad = paintTexture(1900, 1120, drawKartPad);
  v.group.add(floorPad(pad, KART_START.x, -13.2, 9.5, 5.6, ctx.wet, 0.004));
  v.touts.push({ ...TOUT_INFO.kart, key: 'kart', x: 17.0, z: -11.5, yaw: Math.PI * 0.85 });
  return v.finish();
}

// ------------------------------------------------------------ крепость

function buildFort(ctx: VenueCtx): { near: Venue; keep: Venue; plate: LinePlate } {
  const near = new Venue('fort', ctx, 23);
  const d = near.detail;
  const w = near.walls;
  const x = FORT_ARCH.x;
  // надвратная башня над проходом: проход шириной 4 м остаётся свободным, камень — только выше 4 м
  w.box('concrete', [8.8, 4.0, -17.2], [13.2, 6.6, -15.55], STONE);
  w.box('concrete', [8.65, 6.6, -17.35], [13.35, 6.9, -15.4], STONE_DARK);
  for (let i = 0; i < 6; i++) {
    const x0 = 8.85 + i * 0.84;
    w.box('concrete', [x0, 6.9, -15.92], [x0 + 0.56, 7.7, -15.4], STONE);
  }
  // боковые «эркеры»-башенки на уголках
  for (const sx of [-1, 1]) {
    const cx = x + sx * 2.4;
    d.cyl(0.6, 0.34, 0.55, cx, 6.33, -15.7, STONE_DARK, 12);
    d.cyl(0.4, 0.2, 0.4, cx, 5.95, -15.7, STONE_DARK, 12);
    d.cyl(0.52, 0.52, 1.5, cx, 7.3, -15.7, STONE, 12);
    d.cyl(0.58, 0.58, 0.12, cx, 8.1, -15.7, STONE_DARK, 12);
    d.cone(0.68, 1.1, cx, 8.7, -15.7, 0xb8493a, 12);
    d.ball(0.07, cx, 9.3, -15.7, 0xf2c230);
    for (const dz of [-0.45, 0.45]) d.box(0.08, 0.34, 0.04, cx + dz * 0.2, 7.3, -15.7 + 0.51, 0x1a1a1a);
  }
  // бойницы
  for (const bx of [9.45, 12.55]) d.box(0.13, 0.75, 0.05, bx, 5.9, -15.53, 0x181818);
  // вывеска и строка статуса
  near.sign({ w: 3.6, h: 0.95, x, y: 5.55, z: -15.5, glow: 0.38, draw: drawFortSign });
  const plate = new LinePlate(2.1, 0.36, { bg: '#3b2a1d', border: '#c9a46a', fg: '#ffe9b8' });
  plate.mesh.position.set(x, 4.62, -15.5);
  near.group.add(plate.mesh);
  // поднятая решётка под перемычкой
  for (let i = 0; i < 12; i++) {
    const bx = 9.35 + i * 0.3;
    d.cyl(0.024, 0.024, 0.78, bx, 3.62, -16.55, IRON, 5);
    d.cone(0.04, 0.16, bx, 3.15, -16.55, IRON, 5, 0, Math.PI);
  }
  d.box(3.6, 0.05, 0.05, x, 3.88, -16.55, IRON);
  d.box(3.6, 0.05, 0.05, x, 3.45, -16.55, IRON);
  // знамёна на фасадах по сторонам проулка
  const banner = paintTexture(160, 420, (c, W, H) => drawBanner(c, W, H));
  for (const [bx, face] of [[8.1, 0], [13.9, 0]] as const) {
    near.group.add(wallPlate(banner, bx, 3.0, -15.96, 0.8, 2.1, face, 0.2));
    d.box(0.95, 0.06, 0.08, bx, 4.07, -15.93, WOOD);
  }
  // факелы на стенах проулка
  for (const sx of [-1, 1]) {
    const tx = x + sx * 1.93;
    const tz = -17.4;
    d.box(0.1, 0.1, 0.34, tx - sx * 0.02, 2.55, tz, IRON);
    d.cyl(0.035, 0.05, 0.56, tx - sx * 0.1, 2.85, tz, WOOD, 6);
    near.glow.cone(0.11, 0.36, tx - sx * 0.1, 3.3, tz, 0xff8a2a, 6);
    near.glow.cone(0.065, 0.24, tx - sx * 0.1, 3.27, tz, 0xffe08a, 6);
    near.lampGlow(0xff9a3c, 2.4, tx - sx * 0.12, 3.35, tz, 0.55);
  }
  // подъёмный мост: доски на земле от порога, цепи к перемычке
  const bridge = paintTexture(640, 300, drawDrawbridge);
  near.group.add(floorPad(bridge, x, -14.7, 3.6, 2.6, ctx.wet, 0.004));
  for (const sx of [-1, 1]) d.rod([x + sx * 1.74, 0.05, -13.45], [x + sx * 1.74, 4.0, -15.5], 0.022, IRON, 5);
  // мешки с песком у стен
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bx = x + sx * (1.55 - i * 0.02) - sx * 0.05 * i;
      d.ball(0.3, bx, 0.14, -15.3 + i * 0.34 - 0.2, 0xcdb88e, 8, 6, 1.5, 0.5, 1);
    }
    d.ball(0.3, x + sx * 1.62, 0.4, -15.12, 0xc8b283, 8, 6, 1.5, 0.5, 1);
  }
  near.touts.push({ ...TOUT_INFO.fort, key: 'fort', x: 13.45, z: -13.7, yaw: Math.PI - 0.5, arms: 'zombie' });

  // донжон за линией зданий: виден над крышами и в конце проулка
  const keep = new Venue('fortkeep', ctx, 29, false);
  const k = keep.walls;
  const kd = keep.detail;
  const Y0 = STREET_Y;
  const KX = x;
  const KZ = -32.6;
  k.box('concrete', [KX - 2.6, Y0, KZ - 2.6], [KX + 2.6, 14.2, KZ + 2.6], STONE, Y0 + 0.01);
  k.box('concrete', [KX - 2.95, 14.2, KZ - 2.95], [KX + 2.95, 15.0, KZ + 2.95], STONE_DARK);
  for (let i = 0; i < 5; i++) {
    const o = -2.5 + i * 1.25;
    for (const s of [-1, 1]) {
      k.box('concrete', [KX + o - 0.3, 15.0, KZ + s * 2.95 - 0.25], [KX + o + 0.3, 15.9, KZ + s * 2.95 + 0.25], STONE);
      if (i > 0 && i < 4) k.box('concrete', [KX + s * 2.95 - 0.25, 15.0, KZ + o - 0.3], [KX + s * 2.95 + 0.25, 15.9, KZ + o + 0.3], STONE);
    }
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = KX + sx * 2.7;
    const cz = KZ + sz * 2.7;
    kd.cyl(1.0, 1.1, 18.2, cx, Y0 + 9.1, cz, STONE, 14);
    kd.cyl(1.2, 1.2, 0.35, cx, 17.4, cz, STONE_DARK, 14);
    kd.cone(1.3, 2.6, cx, 19.0, cz, 0xb8493a, 14);
    kd.ball(0.1, cx, 20.4, cz, 0xf2c230);
  }
  // щит на южной стене (виден в конце проулка), бойницы и окна
  keep.group.add(wallPlate(paintTexture(300, 360, (c, W, H) => drawBanner(c, W, H)), KX, 7.0, KZ + 2.62, 2.2, 2.6, 0, 0.25));
  for (const [wx, wy] of [[-1.5, 11.5], [1.5, 11.5], [-1.6, 3.8], [1.6, 3.8]] as const) kd.box(0.4, 1.1, 0.1, KX + wx, wy, KZ + 2.62, 0x1b1f2a);
  kd.cyl(0.05, 0.06, 4.6, KX, 17.9, KZ, IRON, 8);
  keep.flags.add(KX, 20.1, KZ, 3.1, 1.8, [0xc0392b, 0xf2c230, 0xc0392b], 0, 1.3);
  keep.flags.add(KX + 2.7, 21.3, KZ + 2.7, 1.5, 0.8, [0xf2c230], 0, 2.1);
  keep.finish(false);
  return { near: near.finish(false), keep, plate };
}

// ------------------------------------------------------------ «Выше облаков»

function buildSky(ctx: VenueCtx): { near: Venue; tower: Venue } {
  const near = new Venue('sky', ctx, 31);
  const d = near.detail;
  const { x, z } = SKILL_PORTAL;
  // облако-вывеска над порталом, видно с обеих сторон
  const cloudTex = paintTexture(1100, 420, (c, W, H) => drawCloudSign(c, W, H, 'ВЫШЕ ОБЛАКОВ', 'небесная каланча · до 5 человек'));
  near.group.add(wallPlate(cloudTex, x, 5.55, z + 0.1, 5.5, 2.1, 0, 0.5));
  const back = wallPlate(cloudTex, x, 5.55, z - 0.1, 5.5, 2.1, Math.PI, 0.5);
  near.group.add(back);
  for (const sx of [-1, 1]) d.cyl(0.04, 0.04, 2.3, x + sx * 1.3, 4.5, z, 0xf4f8fb, 8);
  // клубы по краям: «облако присело на столбы»
  for (const sx of [-1, 1]) cloud(near.flat, x + sx * 1.55, 3.75, z, 0.55, 1.2);
  // облачный порог на плитке
  const pad = paintTexture(920, 680, drawCloudPad);
  near.group.add(floorPad(pad, x, z + 0.1, 4.6, 3.4, ctx.wet, 0.005));
  near.touts.push({ ...TOUT_INFO.sky, key: 'sky', x: x + 3.1, z: z + 1.1, yaw: Math.PI - 0.5 });

  // каланча за линией зданий — над проулком слева
  const tower = new Venue('skytower', ctx, 37, false);
  const w = tower.walls;
  const td = tower.detail;
  const TX = x - 0.5;
  const TZ = -31.4;
  const Y0 = STREET_Y;
  const BLUE_WALL = 0xcfe4f2;
  w.box('concrete', [TX - 1.9, Y0, TZ - 1.9], [TX + 1.9, 6.0, TZ + 1.9], STONE, Y0 + 0.01);
  w.box('concrete', [TX - 2.05, 6.0, TZ - 2.05], [TX + 2.05, 6.3, TZ + 2.05], STONE_DARK);
  w.box('concrete', [TX - 1.45, 6.3, TZ - 1.45], [TX + 1.45, 14.0, TZ + 1.45], BLUE_WALL);
  // белые углы шахты и пояса
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    td.box(0.3, 7.7, 0.3, TX + sx * 1.42, 10.15, TZ + sz * 1.42, 0xf7f3e8);
  }
  for (const y of [8.0, 12.0]) td.box(3.1, 0.2, 3.1, TX, y, TZ, 0xf7f3e8);
  // колокольня: четыре столба, пол, колокол
  w.box('concrete', [TX - 1.7, 14.0, TZ - 1.7], [TX + 1.7, 14.3, TZ + 1.7], STONE_DARK);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) td.box(0.4, 2.6, 0.4, TX + sx * 1.35, 15.6, TZ + sz * 1.35, 0xf7f3e8);
  td.cyl(0.05, 0.05, 1.0, TX, 16.3, TZ, IRON, 6);
  td.cone(0.5, 0.8, TX, 15.35, TZ, 0xe0b24a, 14, 0, Math.PI);
  td.ball(0.08, TX, 14.95, TZ, 0xe0b24a);
  // шатёр и шпиль
  td.cone(2.5, 3.2, TX, 18.5, TZ, 0x3f86c9, 4, Math.PI / 4);
  td.cyl(0.04, 0.05, 2.4, TX, 21.1, TZ, IRON, 6);
  td.ball(0.14, TX, 22.4, TZ, 0xffd23f);
  tower.flags.pennant(TX, 21.7, TZ, 1.2, 0.5, 0xffffff, 0, 0.7);
  // часы на южной стене, окна-щели
  tower.group.add(wallPlate(paintTexture(512, 512, drawClock), TX, 10.0, TZ + 1.47, 1.8, 1.8, 0, 0.35));
  for (const [wx, wy] of [[0, 3.5], [-0.9, 3.5], [0.9, 3.5]] as const) td.box(0.3, 1.0, 0.08, TX + wx, wy, TZ + 1.92, 0x2b3a52);
  // облака у верхушки
  cloud(tower.flat, TX - 3.4, 20.6, TZ + 1.2, 1.4);
  cloud(tower.flat, TX + 2.8, 18.4, TZ + 1.8, 1.1);
  cloud(tower.flat, TX - 0.6, 23.4, TZ + 0.2, 1.0);
  tower.finish(false);
  return { near: near.finish(false), tower };
}

export function buildNorth(ctx: VenueCtx): NorthParts {
  const paint = buildPaintball(ctx);
  const kart = buildKarting(ctx);
  const f = buildFort(ctx);
  const s = buildSky(ctx);
  return { paint, kart, fort: f.near, fortKeep: f.keep, fortPlate: f.plate, sky: s.near, skyTower: s.tower };
}
