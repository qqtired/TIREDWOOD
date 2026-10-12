// Подвал кафе «Чайка» для «Fight Club» — только статика: бетонный пол с пятнами, стены с облезлой зелёной краской
// и сыростью, балки и ржавые трубы под потолком, лестница наверх к железной двери, старая стойка бара с бутылками
// и лампой дневного света, ящики с розовым мылом, доска «Правила клуба», лампы в решётках на стенах (свет от них
// нарисован пятнами на стенах), щиток, ведро со шваброй. Свет над рингом, лампы на проводах и толпа — arena.ts.
import * as THREE from 'three';
import { FC_CEIL, FC_ROOM } from '../../shared/fight.ts';
import { glowSprite, mergeColored, paint, place } from '../render/kit.ts';
import { blobTexture, canvas, concreteTexture, rulesTexture, seeded, soapTexture, stencilTexture, texture } from './paint.ts';

const R = FC_ROOM;
const H = FC_CEIL;
/** Лестница: вдоль северной стены, снизу (z = STAIR_Z0) вверх к двери (z = −R), x — STAIR_X0…STAIR_X1 */
const STAIR_X0 = 4.4;
const STAIR_X1 = 6.0;
const STAIR_Z0 = -7.6;
const STAIR_N = 15;
/** Проём в потолке над лестницей */
const HOLE = { x0: 4.3, x1: 6.1, z0: -R, z1: -8.3 };
/** Стойка бара у западной стены */
const BAR = { x0: -11.7, x1: -10.75, z0: -3.6, z1: 3.6, h: 1.05 };
/** Где мигает лампа дневного света (над полками бара) */
export const TUBE_AT = new THREE.Vector3(-11.75, 2.95, 0);
/** Откуда капает с трубы (под ней — лужа с кругами) */
export const DRIP_AT = new THREE.Vector3(3.2, 3.68, 6.4);

/** Стена: бетон сверху, снизу — облезлая зелёная краска с потёками, у пола — сырость. 6 м по ширине на повтор. */
function wallTexture(): THREE.CanvasTexture {
  const W = 1024;
  const Hpx = 720;
  const [c, ctx] = canvas(W, Hpx);
  const r = seeded(31);
  const base = concreteTexture(256, '#8c877b', 33, 0).image as HTMLCanvasElement;
  for (let x = 0; x < W; x += 256) for (let y = 0; y < Hpx; y += 256) ctx.drawImage(base, x, y);
  // краска до 1,35 м (из 4,2 м — снизу 32 % высоты), край неровный и облезлый
  const edge = Hpx * (1 - 1.35 / H);
  ctx.fillStyle = '#3e5a4b';
  ctx.beginPath();
  ctx.moveTo(0, Hpx);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, edge + Math.sin(x * 0.02) * 3 + (r() - 0.5) * 4);
  ctx.lineTo(W, Hpx);
  ctx.closePath();
  ctx.fill();
  // полоса по краю краски
  ctx.fillStyle = 'rgba(30,48,38,0.8)';
  ctx.fillRect(0, edge - 6, W, 7);
  // облезлые места: пятна бетона на краске
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const y = edge + r() * (Hpx - edge);
    const w = 6 + r() * 50;
    const h = 4 + r() * 22;
    ctx.fillStyle = `rgba(140,135,120,${0.5 + r() * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // потёки сырости сверху вниз
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = r() * Hpx * 0.4;
    const len = 60 + r() * 300;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(40,46,30,0.35)');
    g.addColorStop(1, 'rgba(40,46,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 3 + r() * 10, len);
  }
  // сырость у пола
  const gb = ctx.createLinearGradient(0, Hpx * 0.86, 0, Hpx);
  gb.addColorStop(0, 'rgba(12,18,10,0)');
  gb.addColorStop(1, 'rgba(12,18,10,0.55)');
  ctx.fillStyle = gb;
  ctx.fillRect(0, Hpx * 0.86, W, Hpx * 0.14);
  const t = texture(c, true);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Доски ящика, на боку — «МЫЛО» по трафарету. */
function crateTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const r = seeded(41);
  for (let i = 0; i < 4; i++) {
    const y = i * 64;
    ctx.fillStyle = ['#8a6a44', '#7d5f3b', '#937149', '#806240'][i];
    ctx.fillRect(0, y, 256, 62);
    ctx.fillStyle = 'rgba(40,24,10,0.6)';
    ctx.fillRect(0, y + 62, 256, 2);
    for (let k = 0; k < 18; k++) {
      ctx.fillStyle = `rgba(60,40,20,${0.08 + r() * 0.12})`;
      ctx.fillRect(r() * 256, y + r() * 60, 30 + r() * 80, 1 + r() * 2);
    }
  }
  ctx.strokeStyle = 'rgba(40,24,10,0.7)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 246);
  ctx.font = '900 54px Impact, "Arial Narrow", Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(28,20,14,0.82)';
  ctx.fillText('МЫЛО', 128, 120);
  ctx.font = '700 22px Rubik, sans-serif';
  ctx.fillText('РОЗОВОЕ · 48 ШТ', 128, 170);
  return texture(c);
}

export interface Tube {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Sprite;
  pool: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

/** Строит подвал в scene. Возвращает то, что оживляет arena.ts (лампа дневного света). */
export function buildBasement(scene: THREE.Scene): { tube: Tube } {
  // --- пол
  const floorTex = concreteTexture(512, '#7a766c', 21, 0);
  floorTex.repeat.set(5, 5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // пятна и следы на полу (потемнее) — круглые мягкие пятна
  const stain = new THREE.MeshBasicMaterial({ map: blobTexture('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const rs = seeded(7);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), stain);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rs() * 3;
    m.scale.set(1 + rs() * 3, 1 + rs() * 2.4, 1);
    m.position.set((rs() - 0.5) * 2 * (R - 1), 0.004, (rs() - 0.5) * 2 * (R - 1));
    scene.add(m);
  }

  // --- стены (лицом внутрь)
  const wallTex = wallTexture();
  wallTex.repeat.set((2 * R) / 6, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
  const wall = (x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, H), wallMat);
    m.position.set(x, H / 2, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  wall(0, -R, 0);
  wall(0, R, Math.PI);
  wall(-R, 0, Math.PI / 2);
  wall(R, 0, -Math.PI / 2);

  // --- потолок с проёмом над лестницей
  const shape = new THREE.Shape();
  shape.moveTo(-R, -R);
  shape.lineTo(R, -R);
  shape.lineTo(R, R);
  shape.lineTo(-R, R);
  shape.closePath();
  const hole = new THREE.Path();
  // в осях фигуры: x — как в мире, y — это z (поворот вокруг x на +90° кладёт фигуру лицом вниз)
  hole.moveTo(HOLE.x0, HOLE.z0);
  hole.lineTo(HOLE.x0, HOLE.z1);
  hole.lineTo(HOLE.x1, HOLE.z1);
  hole.lineTo(HOLE.x1, HOLE.z0);
  hole.closePath();
  shape.holes.push(hole);
  const ceilGeo = new THREE.ShapeGeometry(shape);
  ceilGeo.rotateX(Math.PI / 2);
  const ceil = new THREE.Mesh(ceilGeo, new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 1, side: THREE.DoubleSide }));
  ceil.position.y = H;
  scene.add(ceil);

  // --- всё некрашеное текстурой: вершинные цвета, одним мешем
  const solid: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0) => {
    solid.push(place(paint(new THREE.BoxGeometry(w, h, d), c), x, y, z, ry));
  };
  const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, c: number, seg = 10, rx = 0, ry = 0) => {
    solid.push(place(paint(new THREE.CylinderGeometry(rt, rb, h, seg), c), x, y, z, ry, rx));
  };
  // балки
  for (let z = -8; z <= 8; z += 4) box(2 * R, 0.3, 0.34, 0, H - 0.15, z, 0x57534a);
  // трубы вдоль x: ржавые, с муфтами; одна — с вентилем
  // (цилиндр стоит вдоль y — трубу кладём поворотом вокруг z; place так не умеет, поэтому вручную)
  const pipes: Array<[number, number, number, number]> = [[-3.1, 3.78, 0.09, 0x6b4a36], [2.4, 3.86, 0.13, 0x56605a], [6.4, 3.68, 0.07, 0x7a5236]];
  for (const [z, y, rad, c] of pipes) {
    const g = paint(new THREE.CylinderGeometry(rad, rad, 2 * R, 10), c);
    g.rotateZ(Math.PI / 2);
    g.translate(0, y, z);
    solid.push(g);
    for (let x = -R + 2; x < R; x += 3.2) {
      const j = paint(new THREE.CylinderGeometry(rad * 1.35, rad * 1.35, 0.16, 10), 0x3e3a34);
      j.rotateZ(Math.PI / 2);
      j.translate(x, y, z);
      solid.push(j);
    }
  }
  // вентиль и стояк в углу
  {
    const w = paint(new THREE.TorusGeometry(0.16, 0.025, 6, 16), 0x8a2a1e);
    w.rotateX(Math.PI / 2);
    w.translate(-5.2, 3.86 - 0.24, 2.4);
    solid.push(w);
    cyl(0.03, 0.03, 0.2, -5.2, 3.86 - 0.13, 2.4, 0x3e3a34, 6);
    cyl(0.11, 0.11, H, R - 0.3, H / 2, R - 0.3, 0x5a5e58, 10);
    cyl(0.07, 0.07, H, -R + 0.25, H / 2, R - 0.6, 0x6b4a36, 8);
  }
  // лестница: ступени — сплошные блоки, сбоку — перила на стойках
  const rise = H / STAIR_N;
  const tread = (STAIR_Z0 + R) / STAIR_N;
  for (let i = 0; i < STAIR_N; i++) {
    const top = (i + 1) * rise;
    const z = STAIR_Z0 - i * tread;
    box(STAIR_X1 - STAIR_X0, top, tread, (STAIR_X0 + STAIR_X1) / 2, top / 2, z - tread / 2, i % 2 ? 0x77746a : 0x7d7a70);
    box(STAIR_X1 - STAIR_X0, 0.02, 0.04, (STAIR_X0 + STAIR_X1) / 2, top + 0.01, z - 0.02, 0x9a968a);
  }
  {
    const len = Math.hypot(STAIR_Z0 + R, H);
    const ang = Math.atan2(H, STAIR_Z0 + R);
    const g = paint(new THREE.CylinderGeometry(0.03, 0.03, len, 8), 0x2e3230);
    g.rotateX(ang - Math.PI / 2);
    g.translate(STAIR_X0 - 0.05, H / 2 + 0.95, (STAIR_Z0 - R) / 2);
    solid.push(g);
    for (let i = 0; i <= 4; i++) {
      const z = STAIR_Z0 - (i / 4) * (STAIR_Z0 + R) * 0.92;
      const y = ((STAIR_Z0 - z) / (STAIR_Z0 + R)) * H;
      cyl(0.025, 0.025, 0.95, STAIR_X0 - 0.05, y + 0.47, z, 0x2e3230, 6);
    }
  }
  // шахта над лестницей и железная дверь наверху (из подвала видна в проёме)
  box(0.1, 2.6, HOLE.z1 - HOLE.z0, HOLE.x0 - 0.05, H + 1.3, (HOLE.z0 + HOLE.z1) / 2, 0x5c5850);
  box(0.1, 2.6, HOLE.z1 - HOLE.z0, HOLE.x1 + 0.05, H + 1.3, (HOLE.z0 + HOLE.z1) / 2, 0x5c5850);
  box(HOLE.x1 - HOLE.x0 + 0.2, 0.1, HOLE.z1 - HOLE.z0, (HOLE.x0 + HOLE.x1) / 2, H + 2.6, (HOLE.z0 + HOLE.z1) / 2, 0x45423c);
  box(HOLE.x1 - HOLE.x0 + 0.2, 2.6, 0.1, (HOLE.x0 + HOLE.x1) / 2, H + 1.3, HOLE.z1 + 0.05, 0x5c5850);
  box(0.95, 2.0, 0.06, (STAIR_X0 + STAIR_X1) / 2, H + 1.0, -R + 0.05, 0x3a4a42);
  box(0.06, 0.3, 0.08, (STAIR_X0 + STAIR_X1) / 2 + 0.33, H + 1.0, -R + 0.1, 0x1c1f1d);

  // стойка бара: короб, столешница, подножка, табуреты; на стене — полки с бутылками
  box(BAR.x1 - BAR.x0, BAR.h, BAR.z1 - BAR.z0, (BAR.x0 + BAR.x1) / 2, BAR.h / 2, 0, 0x4a3324);
  box(BAR.x1 - BAR.x0 + 0.16, 0.06, BAR.z1 - BAR.z0 + 0.1, (BAR.x0 + BAR.x1) / 2 + 0.06, BAR.h + 0.03, 0, 0x2e1e14);
  cyl(0.025, 0.025, BAR.z1 - BAR.z0, BAR.x1 + 0.14, 0.22, 0, 0x8a7a52, 6, Math.PI / 2);
  for (const z of [-2.4, -0.6, 1.3, 2.9]) {
    cyl(0.2, 0.2, 0.06, BAR.x1 + 0.6, 0.74, z, 0x5a2a22, 14);
    cyl(0.03, 0.05, 0.72, BAR.x1 + 0.6, 0.36, z, 0x2a2a2a, 6);
  }
  for (const y of [1.55, 2.1]) box(0.28, 0.04, 6.4, -R + 0.15, y, 0, 0x3a281a);
  const rb = seeded(17);
  const glassCols = [0x3a5a2a, 0x5a3a1a, 0x8aa08a, 0x2a4a3a, 0x6a4a1a];
  for (const y of [1.57, 2.12]) {
    for (let z = -3; z < 3; z += 0.22 + rb() * 0.2) {
      if (rb() < 0.25) continue;
      const c = glassCols[Math.floor(rb() * glassCols.length)];
      const hgt = 0.22 + rb() * 0.12;
      cyl(0.04, 0.045, hgt, -R + 0.15 + (rb() - 0.5) * 0.08, y + hgt / 2, z, c, 8);
      cyl(0.014, 0.02, 0.09, -R + 0.15, y + hgt + 0.045, z, c, 6);
    }
  }
  // корпус лампы дневного света
  box(0.1, 0.08, 2.5, TUBE_AT.x + 0.02, TUBE_AT.y + 0.06, TUBE_AT.z, 0x2a2c2a);

  // щиток, ведро со шваброй, сломанный стул — у южной стены
  box(0.6, 0.8, 0.16, -4, 2.0, R - 0.08, 0x5a605a);
  box(0.5, 0.06, 0.02, -4, 2.2, R - 0.17, 0xc8b030);
  cyl(0.18, 0.15, 0.34, 2.2, 0.17, R - 0.5, 0x6a7a80, 12);
  cyl(0.015, 0.015, 1.4, 2.32, 0.75, R - 0.42, 0x8a6a40, 6, -0.25);
  box(0.42, 0.04, 0.42, -7.8, 0.45, R - 0.8, 0x5a3a24, 0.4);
  for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18]]) cyl(0.02, 0.02, 0.45, -7.8 + dx, 0.22, R - 0.8 + dz, 0x3a2a1a, 6);

  const solidMesh = new THREE.Mesh(mergeColored(solid), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 }));
  scene.add(solidMesh);

  // свет из двери наверху шахты: тёплая щель под дверью и ореол
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.03), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }));
  crack.position.set((STAIR_X0 + STAIR_X1) / 2, H + 0.02, -R + 0.09);
  scene.add(crack);
  const doorGlow = glowSprite(0xffb060, 2.2, 0.35);
  doorGlow.position.set((STAIR_X0 + STAIR_X1) / 2, H + 0.4, -R + 0.5);
  scene.add(doorGlow);

  // ящики с мылом у восточной стены; верхний открыт — внутри розовые бруски
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 });
  const crateGeo = new THREE.BoxGeometry(0.62, 0.5, 0.62);
  const crates: Array<[number, number, number, number]> = [
    [R - 0.45, 0.25, -5.6, 0.1], [R - 0.45, 0.25, -4.9, -0.05], [R - 0.5, 0.75, -5.25, 0.2], [R - 1.2, 0.25, -5.4, 0.5],
    [R - 0.45, 0.25, 5.2, 0], [R - 0.45, 0.75, 5.1, -0.15], [R - 1.15, 0.25, 5.6, 0.3],
  ];
  for (const [x, y, z, ry] of crates) {
    const m = new THREE.Mesh(crateGeo, crateMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
  }
  const soapLabel = soapTexture();
  const pink = new THREE.MeshStandardMaterial({ color: 0xe08aa6, roughness: 0.35 });
  const soapTop = new THREE.MeshStandardMaterial({ map: soapLabel, roughness: 0.35 });
  const soapGeo = new THREE.BoxGeometry(0.17, 0.06, 0.1);
  const rsoap = seeded(23);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(soapGeo, [pink, pink, soapTop, pink, pink, pink]);
    m.position.set(R - 0.5 + (rsoap() - 0.5) * 0.4, 1.03 + (i % 3) * 0.02, -5.25 + (rsoap() - 0.5) * 0.4);
    m.rotation.y = rsoap() * 3;
    scene.add(m);
  }

  // доска «Правила клуба» на восточной стене (над толпой), подсвечена своей лампой
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.9), new THREE.MeshStandardMaterial({
    map: rulesTexture(), roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0.16,
  }));
  board.material.emissiveMap = board.material.map;
  board.position.set(R - 0.03, 2.35, 0);
  board.rotation.y = -Math.PI / 2;
  scene.add(board);

  // надпись по трафарету на северной стене у лестницы — своя, без чужих слов
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshStandardMaterial({
    map: stencilTexture('ТЫ НЕ ТВОЯ ЖЕЛЕЙКА', 1024, 200, '#d8d0b8', 12, -0.02), transparent: true, depthWrite: false, roughness: 0.9,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  tag.position.set(-1.5, 2.7, -R + 0.02);
  scene.add(tag);

  // лампы в решётках на стенах: колба, ореол и пятно света на стене (свет нарисован — настоящих ламп мало)
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.4 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false });
  const poolTex = blobTexture('rgba(255,190,120,0.55)', 'rgba(255,190,120,0)');
  const pool = (x: number, y: number, z: number, ry: number, w: number, h: number, color = 0xffffff, opacity = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: poolTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  };
  const lamps: Array<[number, number, number, number]> = [
    [-R, 3.0, -8, Math.PI / 2], [-R, 3.0, 8, Math.PI / 2], [R, 3.4, 0, -Math.PI / 2], [R, 3.0, -8.5, -Math.PI / 2], [R, 3.0, 8.5, -Math.PI / 2],
    [-8, 3.0, R, Math.PI], [0.5, 3.0, R, Math.PI], [8, 3.0, R, Math.PI], [-7.5, 3.0, -R, 0],
  ];
  for (const [x, y, z, ry] of lamps) {
    const nx = Math.sin(ry);
    const nz = Math.cos(ry);
    const bx = x + nx * 0.16;
    const bz = z + nz * 0.16;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 8, 1, true), cageMat);
    cage.material.wireframe = false;
    cage.position.set(bx, y, bz);
    scene.add(cage);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulbMat);
    b.position.set(bx, y, bz);
    scene.add(b);
    const g = glowSprite(0xffb870, 1.0, 0.45);
    g.position.set(bx, y, bz);
    scene.add(g);
    pool(x + nx * 0.015, y - 0.5, z + nz * 0.015, ry, 3.4, 3.4);
  }

  // лампа дневного света над баром: трубка, ореол, холодное пятно на стене
  const tube: Tube = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.3), new THREE.MeshBasicMaterial({ color: 0xd8ffe8, toneMapped: false })),
    glow: glowSprite(0xb8ffd8, 2.4, 0.35),
    pool: pool(-R + 0.015, 2.3, 0, Math.PI / 2, 7, 4, 0x9fe8c4, 0.8) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
  };
  tube.mesh.position.copy(TUBE_AT);
  tube.glow.position.copy(TUBE_AT).add(new THREE.Vector3(0.1, 0, 0));
  tube.glow.scale.set(3.4, 1.0, 1);
  scene.add(tube.mesh, tube.glow);
  return { tube };
}
