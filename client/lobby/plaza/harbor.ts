// Гавань, юг площади: «Рыбный двор» (прятки), «Портовая регата» и катер «Ласточка». Двор — арка, сушилки с рыбой, бочка
// с жителем, перевёрнутая лодка и ящики; регата — две мачты с вывеской над кругом и две спортивные лодки у стенки на воде;
// «Ласточка» — портал над посадкой со строкой статуса катера. Твёрдое (shared/plaza2.ts) совпадает с видимым; всё остальное
// — над головой, на стенах, на земле и на воде.
import * as THREE from 'three';
import { BOAT_RACE_CIRCLE, HIDE_CIRCLE } from '../../../shared/maps/lobby.ts';
import { WATER_Y } from '../../../shared/constants.ts';
import {
  BOAT_GATE, REGATTA_BOATS, REGATTA_BOAT_SIZE, REGATTA_MASTS, YARD_BARREL, YARD_BOAT, YARD_CRATES, YARD_GATE, YARD_RACKS,
} from '../../../shared/plaza2.ts';
import { drawBoatGateSign, drawNumberPlate, drawRegattaPad, drawRegattaSign, drawYardPad, drawYardSign } from './art.ts';
import { TOUT_INFO } from './data.ts';
import { Mesher, detailMesh, floorPad, paintTexture, wallPlate } from './gfx.ts';
import { LinePlate } from './plate.ts';
import { Venue, type VenueCtx } from './venue.ts';

const RED = 0xd9372b;
const WHITE = 0xf1ece0;
const NAVY = 0x1f4a72;
const BLUE = 0x2f6ad8;
const YELLOW = 0xffd23f;
const IRON = 0x2a2f33;
const WOOD_DARK = 0x4a3220;
const TIMBER = 0xb07a45;
const TIMBER_DARK = 0x8d5d33;

/** Лодка на воде: качается на месте (корень — по ватерлинии у стенки) */
interface Bob {
  sway: THREE.Group;
  phase: number;
}

export interface HarborParts {
  yard: Venue;
  regatta: Venue;
  boat: Venue;
  boatPlate: LinePlate;
  /** Лодки регаты у стенки: качка зависит от времени */
  bobs: Bob[];
}

// ------------------------------------------------------------ Рыбный двор (прятки)

/** Серебристая рыбина вниз головой на верёвке: тело, хвост, глаз */
function hangingFish(d: Mesher, x: number, y: number, z: number, len: number, color: number): void {
  d.ball(len * 0.17, x, y - len * 0.5, z, color, 8, 6, 0.8, 2.9, 0.42);
  d.cone(len * 0.12, len * 0.26, x, y - len * 0.02, z, color, 5, 0, Math.PI);
  for (const sz of [-1, 1]) d.ball(len * 0.026, x - len * 0.06, y - len * 0.8, z + sz * len * 0.075, 0x1a2a33, 5, 4);
  d.box(0.012, len * 0.18, 0.012, x, y + len * 0.1, z, 0xd9c9a0);
}

function buildYard(ctx: VenueCtx): Venue {
  const v = new Venue('hide', ctx, 41);
  const d = v.detail;
  const w = v.walls;
  const { x: gx, z: gz, half } = YARD_GATE;

  // арка-ворота: две стойки (твёрдые), балка, вывеска, поплавки и фонари
  for (const sx of [-1, 1]) {
    const px = gx + sx * half;
    w.box('plank', [px - 0.17, 0, gz - 0.17], [px + 0.17, 3.4, gz + 0.17], TIMBER);
    d.box(0.52, 0.16, 0.52, px, 0.08, gz, IRON);
    d.box(0.46, 0.1, 0.46, px, 3.45, gz, IRON);
    // раскос наружу — «коленом» под балку
    d.rod([px - sx * 0.17, 2.7, gz], [px - sx * 0.62, 3.4, gz], 0.045, IRON, 6);
    // фонарь на макушке
    d.box(0.05, 0.3, 0.05, px, 3.7, gz, IRON);
    v.glow.box(0.2, 0.26, 0.2, px, 3.98, gz, 0xffd88a);
    d.cone(0.19, 0.18, px, 4.2, gz, IRON, 4, Math.PI / 4);
    v.lampGlow(0xffc874, 2.4, px, 3.98, gz, 0.5);
    // стеклянные поплавки на верёвках у стойки
    const fx = px - sx * 0.42;
    [[0, 0xff7a2f], [0.28, 0xf4f1e8], [0.56, 0x39a7a1]].forEach(([dy, hex]) => {
      d.rod([fx, 3.4, gz], [fx, 3.12 - (dy as number), gz], 0.012, 0xd9c9a0, 4);
      d.ball(0.12, fx, 3.0 - (dy as number), gz, hex as number, 10, 8);
    });
  }
  w.box('plank', [gx - half - 0.4, 3.4, gz - 0.22], [gx + half + 0.4, 3.74, gz + 0.22], TIMBER_DARK);
  const yardSign = v.sign({ w: 3.7, h: 0.98, x: gx, y: 2.82, z: gz, ry: Math.PI, frame: 0x6b4423, bulbs: 0xfff0c0, glow: 0.42, halo: 0xfff0c0, haloK: 0.12, draw: drawYardSign });
  // с двора (с юга) видна обратная сторона: тот же рисунок, а не голая доска
  v.group.add(wallPlate(yardSign.panel.material.map!, gx, 2.82, gz + 0.14, 3.7, 0.98, 0, 0.35));
  // флюгер-рыба над серединой балки
  d.rod([gx, 3.74, gz], [gx, 4.3, gz], 0.025, IRON, 6);
  d.ball(0.26, gx, 4.55, gz, 0xd7e1e8, 10, 8, 1.7, 0.85, 0.3);
  d.add(new THREE.ConeGeometry(0.2, 0.36, 4).scale(1, 1, 0.22), 0xd7e1e8, gx + 0.52, 4.55, gz, 0, 0, Math.PI / 2);
  d.ball(0.035, gx - 0.28, 4.6, gz + 0.1, 0x17323d, 6, 5);
  // вымпелы по ветру с макушек
  v.flags.pennant(gx - half - 0.4, 3.57, gz, 1.1, 0.32, RED, Math.PI, 0.4);
  v.flags.pennant(gx + half + 0.4, 3.57, gz, 1.1, 0.32, YELLOW, 0, 1.3);

  // сушилки с рыбой: две ножки (твёрдые), перекладина, ряд рыбин и ещё ряд ниже
  YARD_RACKS.forEach((r, k) => {
    for (const sx of [-0.95, 0.95]) w.box('plank', [r.x + sx - 0.07, 0, r.z - 0.07], [r.x + sx + 0.07, 1.7, r.z + 0.07], TIMBER_DARK);
    w.box('plank', [r.x - 1.05, 1.62, r.z - 0.045], [r.x + 1.05, 1.7, r.z + 0.045], TIMBER_DARK);
    w.box('plank', [r.x - 1.05, 1.06, r.z - 0.045], [r.x + 1.05, 1.12, r.z + 0.045], TIMBER_DARK);
    for (let i = 0; i < 7; i++) hangingFish(d, r.x - 0.84 + i * 0.28, 1.62, r.z + (i % 2 ? 0.05 : -0.04), 0.5 + (i % 3) * 0.04, (i + k) % 3 === 0 ? 0xd9a441 : 0xb9c9d1);
    for (let i = 0; i < 5; i++) hangingFish(d, r.x - 0.6 + i * 0.3, 1.06, r.z + (i % 2 ? -0.05 : 0.04), 0.38, (i + k) % 2 ? 0xd9a441 : 0xcfd9de);
    // козелок под рыбой: подставка с лотком
    d.box(0.62, 0.08, 0.38, r.x + (k ? 1.4 : -1.4), 0.34, r.z + 0.1, WOOD_DARK);
  });
  // чайка-хозяйка на перекладине правой сушилки
  d.ball(0.1, YARD_RACKS[1].x + 0.65, 1.78, YARD_RACKS[1].z, 0xf4f1e8, 8, 6, 1.1, 0.9, 1.5);
  d.ball(0.065, YARD_RACKS[1].x + 0.65, 1.86, YARD_RACKS[1].z - 0.12, 0xf4f1e8, 8, 6);
  d.cone(0.025, 0.09, YARD_RACKS[1].x + 0.65, 1.86, YARD_RACKS[1].z - 0.2, 0xffb02e, 5, 0, -Math.PI / 2);

  // бочка у задней стены двора (твёрдая); внутри — Бочка
  const b = YARD_BARREL;
  d.cyl(0.56, 0.62, 0.32, b.x, 0.16, b.z, 0x9a6a3a, 18);
  d.cyl(0.62, 0.62, 0.36, b.x, 0.5, b.z, 0x9a6a3a, 18);
  d.cyl(0.62, 0.56, 0.32, b.x, 0.84, b.z, 0x9a6a3a, 18);
  for (const y of [0.14, 0.4, 0.62, 0.86]) d.torus(0.625, 0.026, b.x, y, b.z, IRON, Math.PI / 2, 0, 0, 5, 20);
  d.cyl(0.5, 0.5, 0.02, b.x, b.h - 0.02, b.z, 0x1d1a18, 18);

  // перевёрнутая лодка (твёрдая): днище кверху, белый планширь, киль, рядом вёсла
  const hb = YARD_BOAT;
  const dome = (grow: number, depth: number, y: number, color: number): void => {
    const g = new THREE.ExtrudeGeometry(rowboatShape(grow), { depth, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.2, bevelSegments: 4, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    d.add(g, color, hb.x, y, hb.z);
  };
  dome(0, YARD_BOAT.h - 0.28, 0, 0x2f6e86);
  d.add(new THREE.ExtrudeGeometry(rowboatShape(0.215), { depth: 0.07, bevelEnabled: false, curveSegments: 10 }).rotateX(-Math.PI / 2), 0xf1ece0, hb.x, 0.1, hb.z);
  d.box(0.09, 0.05, hb.hz * 1.45, hb.x, hb.h + 0.02, hb.z, WOOD_DARK);
  d.rod([hb.x + 0.95, 0.06, hb.z - 1.0], [hb.x + 1.0, 0.06, hb.z + 1.3], 0.035, 0xc99a5b, 6);
  d.rod([hb.x + 1.2, 0.06, hb.z - 0.8], [hb.x + 1.25, 0.06, hb.z + 1.2], 0.035, 0xc99a5b, 6);
  d.box(0.14, 0.02, 0.46, hb.x + 0.99, 0.06, hb.z + 1.5, 0xc99a5b, 0.05);
  d.box(0.14, 0.02, 0.46, hb.x + 1.24, 0.06, hb.z + 1.4, 0xc99a5b, 0.05);

  // ящики справа от круга (твёрдые): два внизу, один сверху
  YARD_CRATES.forEach((c, i) => {
    const tone = [0xc79b5c, 0xb88848, 0xd3a96b][i % 3];
    w.box('wood', [c.x - c.hx, c.y, c.z - c.hz], [c.x + c.hx, c.y + c.h, c.z + c.hz], tone, c.y > 0 ? -1 : 0.01);
  });
  // ведро с рыбой у ящиков
  d.cyl(0.2, 0.16, 0.32, YARD_CRATES[1].x + 0.9, 0.16, YARD_CRATES[1].z + 0.5, 0x2f6ad8, 12);
  d.ball(0.17, YARD_CRATES[1].x + 0.9, 0.33, YARD_CRATES[1].z + 0.5, 0xb9c9d1, 8, 5, 1, 0.5, 1);
  d.cyl(0.03, 0.03, 0.34, YARD_CRATES[1].x + 0.9, 0.3, YARD_CRATES[1].z + 0.5, IRON, 4, 0, 0, Math.PI / 2);

  // брезент с сетью на земле под кругом
  const pad = paintTexture(1344, 1024, drawYardPad);
  v.group.add(floorPad(pad, HIDE_CIRCLE.x, HIDE_CIRCLE.z + 0.45, 8.4, 6.4, ctx.wet, 0.004));

  v.touts.push({ ...TOUT_INFO.hide, key: 'hide', x: YARD_BARREL.x, z: YARD_BARREL.z, y: 0.02, yaw: 0 });
  return v.finish(false);
}

// ------------------------------------------------------------ спортивный катер на стапеле

/** План лодки-плоскодонки в осях двора: нос и корма заострены, ширина по x. grow — припуск (для белой каймы). */
function rowboatShape(grow: number): THREE.Shape {
  const L = YARD_BOAT.hz - 0.2 + grow;
  const W = YARD_BOAT.hx - 0.2 + grow;
  const s = new THREE.Shape();
  s.moveTo(0, -L);
  s.bezierCurveTo(W * 0.9, -L * 0.55, W, -L * 0.15, W, 0);
  s.bezierCurveTo(W, L * 0.15, W * 0.9, L * 0.55, 0, L);
  s.bezierCurveTo(-W * 0.9, L * 0.55, -W, L * 0.15, -W, 0);
  s.bezierCurveTo(-W, -L * 0.15, -W * 0.9, -L * 0.55, 0, -L);
  return s;
}

/** План катера: нос в +y, корма в −y, ширина по x; k — масштаб, grow — припуск. Борт плавный к носу. */
function hullShape(k: number, grow = 0): THREE.Shape {
  const half: ReadonlyArray<readonly [number, number]> = [[-2.2, 0.8], [-1.0, 0.93], [0.5, 0.92], [1.2, 0.72], [1.75, 0.36]];
  const s = new THREE.Shape();
  const r = half.map(([y, hw]) => [(hw + grow) * k, y * k] as const);
  s.moveTo(-r[0][0], r[0][1]);
  s.lineTo(r[0][0], r[0][1]);
  for (let i = 1; i < r.length; i++) s.lineTo(r[i][0], r[i][1]);
  s.quadraticCurveTo(0.2 * k, 2.15 * k, 0, 2.35 * k);
  s.quadraticCurveTo(-0.2 * k, 2.15 * k, -r[r.length - 1][0], r[r.length - 1][1]);
  for (let i = r.length - 2; i >= 0; i--) s.lineTo(-r[i][0], r[i][1]);
  return s;
}

/** Катер в своих осях: нос в −z, борт в ±x, киль на 0,25 м над нулём. Верх палубы — ровно REGATTA_BOAT_SIZE.h. */
function speedboat(m: Mesher, hull: number, accent: number): void {
  const slab = (k: number, y0: number, h: number, color: number, grow = 0): void => {
    const g = new THREE.ExtrudeGeometry(hullShape(k, grow), { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    m.add(g, color, 0, y0, 0);
  };
  slab(0.78, 0.25, 0.22, 0x1a2230);
  slab(1, 0.47, 0.43, hull);
  slab(1, 0.62, 0.1, accent, 0.012);
  slab(0.9, 0.9, REGATTA_BOAT_SIZE.h - 0.9, 0xe9e4d6);
  // кокпит: диван у кормы, пульт и ветровое стекло
  m.box(1.2, 0.3, 0.7, 0, 1.15, 0.85, 0x253342);
  m.box(1.2, 0.34, 0.1, 0, 1.4, 1.22, accent);
  m.box(0.72, 0.26, 0.44, 0, 1.13, -0.3, 0x2f3a4a);
  m.torus(0.1, 0.018, 0, 1.38, -0.28, 0x1c1c20, 0.9, 0, 0, 5, 14);
  m.box(1.1, 0.34, 0.04, 0, 1.36, -0.62, 0xbfe4f4, 0, 0.55);
  // тент на четырёх стойках над кокпитом: цветная крыша торчит над кромкой набережной — лодку видно с площади
  for (const sx of [-0.62, 0.62]) for (const z of [-0.45, 1.3]) m.cyl(0.022, 0.022, 1.45, sx, 1.72, z, WHITE, 6);
  m.box(1.5, 0.07, 2.05, 0, 2.47, 0.42, hull);
  m.box(1.56, 0.04, 2.11, 0, 2.43, 0.42, accent);
  // подвесной мотор на транце: чёрная нога и колпак цвета борта
  m.box(0.34, 0.74, 0.28, 0, 0.82, 2.42, IRON);
  m.box(0.42, 0.3, 0.38, 0, 1.2, 2.4, hull);
  m.box(0.1, 0.4, 0.2, 0, 0.35, 2.55, 0x1a1a1e);
  // носовой кнехт и флагшток
  m.cyl(0.14, 0.14, 0.1, 0, 1.05, -1.75, IRON, 10);
  m.cyl(0.022, 0.03, POLE_H, 0, 1.0 + POLE_H / 2, -0.9, WHITE, 6);
  m.ball(0.05, 0, 1.0 + POLE_H, -0.9, YELLOW, 6, 5);
  // кранцы вдоль борта, обращённого к стенке (+x): белые шары на верёвках
  for (const z of [-0.2, 1.1]) {
    m.rod([0.9, 0.9, z], [1.0, 0.72, z], 0.012, WHITE, 4);
    m.ball(0.15, 1.02, 0.62, z, WHITE, 10, 8);
  }
}

/** Палуба лодки на воде — на 0,55 м выше ватерлинии: лодка сидит в воде на ~0,25 м */
const DECK_ABOVE_WATER = 0.7;
/** Высота флагштока над палубой: торчит над кромкой набережной, чтобы лодки были видны с площади */
const POLE_H = 2.5;

function buildRegatta(ctx: VenueCtx): { venue: Venue; bobs: Bob[] } {
  const v = new Venue('regatta', ctx, 43);
  const d = v.detail;
  const bobs: Bob[] = [];

  // две лодки у стенки на воде: носом на запад, к кругу сбора; номера на бортах; швартов к кнехту на кромке
  REGATTA_BOATS.forEach((b, i) => {
    const m = new Mesher();
    speedboat(m, b.hull, b.accent);
    const hull = detailMesh(m, ctx.wet, true);
    if (!hull) return;
    hull.matrixAutoUpdate = true;
    const root = new THREE.Group();
    root.position.set(b.x, WATER_Y + DECK_ABOVE_WATER - REGATTA_BOAT_SIZE.h, b.z);
    root.rotation.y = Math.PI / 2;
    const sway = new THREE.Group();
    sway.position.y = REGATTA_BOAT_SIZE.h;
    hull.position.y = -REGATTA_BOAT_SIZE.h;
    sway.add(hull);
    const plate = paintTexture(256, 148, (c, W, H) => drawNumberPlate(c, W, H, b.num));
    for (const side of [1, -1]) {
      const p = wallPlate(plate, side * 0.945, 0.7 - REGATTA_BOAT_SIZE.h, 0.25, 0.62, 0.36, side * (Math.PI / 2), 0.1);
      sway.add(p);
    }
    root.add(sway);
    v.group.add(root);
    bobs.push({ sway, phase: i * 2.3 });
    // швартов: от носового кнехта лодки к ближайшему кнехту на кромке (тот стоит в карте: shared/maps/lobby.ts)
    const bx = i === 0 ? 20 : 26;
    const deckY = WATER_Y + DECK_ABOVE_WATER;
    d.rod([bx, 0.46, 21.2], [b.x - 0.4, deckY + 0.05, b.z - 0.95], 0.02, 0xd9c9a0, 4);
    // вымпел цвета лодки на флагштоке: виден над кромкой с площади
    const px = b.x - 0.9;
    v.flags.pennant(px + 0.03, deckY + POLE_H - 0.12, b.z, 1.4, 0.5, b.hull, 0, i * 1.9 + 0.4);
    v.flags.pennant(px + 0.03, deckY + POLE_H - 0.5, b.z, 0.9, 0.3, b.accent, 0, i * 1.9 + 1.2);
  });

  // две мачты по краям площадки (твёрдые), рея между ними и вывеска на оттяжках, вымпелы на макушках
  const [m0, m1] = REGATTA_MASTS;
  const cx = (m0.x + m1.x) / 2;
  for (const m of REGATTA_MASTS) {
    d.cyl(0.2, 0.23, 0.3, m.x, 0.15, m.z, WOOD_DARK, 12);
    d.cyl(0.075, 0.11, 6.6, m.x, 3.6, m.z, WHITE, 12);
    d.ball(0.13, m.x, 6.98, m.z, YELLOW, 10, 8);
    d.box(0.3, 0.05, 0.3, m.x, 5.5, m.z, 0xd9c9a0);
    // раскос-«нога» в сторону воды
    d.rod([m.x, 1.2, m.z + 0.12], [m.x, 0.06, m.z + 0.7], 0.035, WOOD_DARK, 5);
  }
  const yardY = 6.2;
  d.box(m1.x - m0.x, 0.08, 0.08, cx, yardY, m0.z, WHITE);
  const regattaSign = v.sign({ w: 4.9, h: 1.4, x: cx, y: 4.35, z: m0.z - 0.12, ry: Math.PI, frame: 0x14275c, bulbs: 0xfff0b0, glow: 0.42, halo: 0x8fb8ff, haloK: 0.16, draw: drawRegattaSign });
  v.group.add(wallPlate(regattaSign.panel.material.map!, cx, 4.35, m0.z - 0.12 + 0.14, 4.9, 1.4, 0, 0.35));
  for (const sx of [-1, 1]) {
    d.rod([cx + sx * 2.5, yardY - 0.04, m0.z], [cx + sx * 2.5, 5.2, m0.z - 0.12], 0.014, 0xd9c9a0, 4);
  }
  v.flags.add(m0.x + 0.06, 6.85, m0.z, 1.5, 0.84, [RED, WHITE, BLUE], 0, 1.7);
  v.flags.pennant(m1.x + 0.06, 6.85, m1.z, 1.3, 0.38, YELLOW, 0, 2.4);
  v.flags.pennant(cx - 1.6, yardY, m0.z, 1.0, 0.3, RED, Math.PI / 2, 0.2);
  v.flags.pennant(cx + 1.6, yardY, m0.z, 1.0, 0.3, BLUE, Math.PI / 2, 1.1);

  // стапель-площадка с шашечками линии старта под кругом
  const pad = paintTexture(1190, 1020, drawRegattaPad);
  v.group.add(floorPad(pad, BOAT_RACE_CIRCLE.x + 0.2, BOAT_RACE_CIRCLE.z + 0.1, 7.0, 6.0, ctx.wet, 0.004));
  // бухта каната у основания мачты
  d.torus(0.22, 0.07, m0.x + 0.75, 0.07, m0.z - 0.4, 0xd9c9a0, Math.PI / 2, 0, 0, 6, 14);

  v.touts.push({ ...TOUT_INFO.regatta, key: 'regatta', x: 14.3, z: 20.2, yaw: Math.PI / 4, arms: 'megaphone' });
  return { venue: v.finish(false), bobs };
}

// ------------------------------------------------------------ катер «Ласточка»

function buildBoat(ctx: VenueCtx): { venue: Venue; plate: LinePlate } {
  const v = new Venue('boat', ctx, 47);
  const d = v.detail;
  const { x0, x1, z } = BOAT_GATE;
  const cx = (x0 + x1) / 2;

  // портал над посадкой: две полосатые стойки (твёрдые), балка, вывеска, спасательные круги, вымпелы
  for (const px of [x0, x1]) {
    for (let i = 0; i < 6; i++) d.box(0.26, 0.6, 0.26, px, 0.3 + i * 0.6, z, i % 2 ? WHITE : NAVY);
    d.cone(0.24, 0.26, px, 3.73, z, RED, 4, Math.PI / 4);
    d.torus(0.24, 0.07, px, 1.55, z - 0.17, RED, 0, 0, 0, 6, 16);
    for (const [dx, dy] of [[0, 0.24], [0, -0.24], [0.24, 0], [-0.24, 0]] as const) d.box(0.12, 0.1, 0.07, px + dx, 1.55 + dy, z - 0.17, WHITE);
  }
  d.box(x1 - x0 + 0.5, 0.2, 0.3, cx, 3.7, z, WHITE);
  d.box(x1 - x0 + 0.5, 0.05, 0.32, cx, 3.82, z, NAVY);
  const gateSign = v.sign({ w: 4.9, h: 1.1, x: cx, y: 2.95, z, ry: Math.PI, frame: NAVY, bulbs: 0xfff0c0, glow: 0.42, halo: 0xbfe0ff, haloK: 0.12, draw: drawBoatGateSign });
  v.group.add(wallPlate(gateSign.panel.material.map!, cx, 2.95, z + 0.14, 4.9, 1.1, 0, 0.35));
  for (const sx of [-1, 1]) v.flags.pennant(cx + sx * 3.0, 3.95, z, 0.9, 0.3, sx > 0 ? RED : YELLOW, sx > 0 ? 0 : Math.PI, sx + 1.3);

  // строка статуса катера — живая: свободен / посадка / в поездке; висит под вывеской на двух цепях
  const plate = new LinePlate(3.4, 0.34, { bg: '#10304e', border: '#9fd6ff', fg: '#fff3c4', ppm: 300 }, ctx.signs);
  plate.mesh.position.set(cx, 1.96, z - 0.02);
  plate.mesh.rotation.y = Math.PI;
  v.group.add(plate.mesh);
  for (const sx of [-1, 1]) d.rod([cx + sx * 1.6, 2.2, z], [cx + sx * 1.6, 2.1, z - 0.02], 0.012, 0x777777, 4);
  // бухта каната у левой стойки
  d.torus(0.3, 0.07, x0 - 0.55, 0.07, z - 0.6, 0xd9c9a0, Math.PI / 2, 0, 0, 6, 14);

  v.touts.push({ ...TOUT_INFO.boat, key: 'boat', x: 4.1, z: 20.2, yaw: 0 });
  return { venue: v.finish(true), plate };
}

export function buildHarbor(ctx: VenueCtx): HarborParts {
  const yard = buildYard(ctx);
  const regatta = buildRegatta(ctx);
  const boat = buildBoat(ctx);
  return { yard, regatta: regatta.venue, boat: boat.venue, boatPlate: boat.plate, bobs: regatta.bobs };
}
