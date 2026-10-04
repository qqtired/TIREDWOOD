// Аквапарк «Волна»: вход с площади и «парк» вокруг полосы (оформление plaza2). Сама полоса, её физика и рекорды — прежние
// (shared/aqua.ts, client/lobby/aquapark.ts): здесь ворота с вывеской и вымпелами над мостиком, коврик со стрелкой на
// старт, спасатель Лёва с живой репликой про рекорд, буйковая линия по границе парка и надувные игрушки на воде.
// Твёрдого нет: ворота и игрушки стоят на воде за линией настила, куда игрок попадает только падением (и возвращается на мостик).
import * as THREE from 'three';
import { AQUA_JETTY } from '../../../shared/aqua.ts';
import { WATER_Y } from '../../../shared/constants.ts';
import { drawAquaGate, drawAquaPad } from './art.ts';
import { TOUT_INFO } from './data.ts';
import { detailMesh, floorPad, Mesher, paintTexture, wallPlate } from './gfx.ts';
import { Venue, type VenueCtx } from './venue.ts';

const BLUE = 0x1f7ae0;
const BLUE_DARK = 0x0f4ea6;
const WHITE = 0xf4f6f8;
const YELLOW = 0xffc61a;
const RED = 0xe8402e;
const ORANGE = 0xff7b1c;
const GREEN = 0x37b956;
const PINK = 0xff5c9e;

/** Ворота над мостиком: плоскость x, ось по z — середина мостика, стойки на воде по бокам, вывеска лицом на восток */
const GATE = { x: -31.4, zc: (AQUA_JETTY.z0 + AQUA_JETTY.z1) / 2, half: 2.3, signY: 4.0, signW: 3.9, signH: 1.15, top: 5.0 };
/** Арка «СТАРТ» в конце мостика (client/lobby/aquapark.ts): колонны по краям */
const START_ARCH = { x: -34.3, half: 1.8, top: 2.9 };

/** Буйковая линия по границе парка: от стенки севернее мостика на запад, вокруг полосы и обратно на восток к площади */
const BUOY_LINE: ReadonlyArray<readonly [number, number]> = [[-30.7, 5.0], [-96.0, 5.0], [-96.0, 41.5], [-32.5, 41.5], [-32.5, 23.0]];
const BUOY_STEP = 2.6;

/** Игрушка на воде: группа качается на волне (вверх-вниз, с боку на бок) вокруг своего места */
export interface Toy {
  group: THREE.Group;
  x: number;
  z: number;
  yaw: number;
  phase: number;
  /** Размах качания (м) */
  amp: number;
}

export interface AquaParts {
  gate: Venue;
  far: Venue;
  toys: Toy[];
}

/** Двусторонний треугольный флажок вымпельной гирлянды: основание в точке (px, py, pz) вдоль (dx, dz), остриё вниз */
function flag(m: Mesher, px: number, py: number, pz: number, dx: number, dz: number, color: number, w = 0.15, h = 0.36): void {
  const g = new THREE.BufferGeometry();
  const a = [px - dx * w, py, pz - dz * w];
  const b = [px + dx * w, py, pz + dz * w];
  const c = [px, py - h, pz];
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...b, ...a, ...c], 3));
  g.computeVertexNormals();
  m.add(g, color);
}

/** Гирлянда флажков на верёвке между двумя точками (провисает). */
function bunting(m: Mesher, a: readonly [number, number, number], b: readonly [number, number, number], n: number, colors: readonly number[]): void {
  const sag = 0.28;
  const at = (t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const dx = (b[0] - a[0]) / len;
  const dz = (b[2] - a[2]) / len;
  const steps = 8;
  for (let i = 0; i < steps; i++) m.rod(at(i / steps), at((i + 1) / steps), 0.012, 0xe9e2cf, 4);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = at(t);
    flag(m, p[0], p[1] - 0.01, p[2], dx, dz, colors[i % colors.length]);
  }
}

// ------------------------------------------------------------ игрушки (локальные оси: нос — по +x, вверх — по +y, ватерлиния на y = 0)

function duck(m: Mesher): void {
  const Y = 0xffd23f;
  const Y2 = 0xf2b400;
  m.ball(1.0, 0, 0.3, 0, Y, 16, 10, 1.2, 0.8, 0.92);
  m.ball(0.5, 1.0, 1.05, 0, Y, 14, 10);
  m.ball(0.2, 1.5, 0.95, 0, ORANGE, 10, 8, 1.4, 0.45, 1.05);
  for (const s of [-1, 1]) {
    m.ball(0.075, 1.2, 1.25, 0.27 * s, 0x1b1b1f, 6, 5);
    m.ball(0.42, -0.1, 0.5, 0.82 * s, Y2, 10, 8, 1.35, 0.55, 0.32);
  }
  m.cone(0.3, 0.55, -1.3, 0.78, 0, Y, 8, 0, 0, Math.PI / 2 - 0.55);
}

function flamingo(m: Mesher): void {
  const P = 0xff7fae;
  const neck: ReadonlyArray<readonly [number, number]> = [[0.95, 0.4], [1.2, 1.1], [1.05, 1.9], [1.25, 2.6], [1.62, 3.0]];
  m.torus(1.0, 0.42, 0, 0.18, 0, P, Math.PI / 2, 0, 0, 12, 26);
  neck.forEach(([x, y], i) => {
    if (i > 0) m.rod([neck[i - 1][0], neck[i - 1][1], 0], [x, y, 0], 0.17 - i * 0.012, P, 8);
    m.ball(0.18 - i * 0.012, x, y, 0, P, 8, 6);
  });
  m.ball(0.25, 1.78, 3.04, 0, P, 10, 8);
  m.cone(0.11, 0.5, 2.1, 2.93, 0, 0xffb347, 8, 0, 0, -(Math.PI / 2 - 0.5));
  m.cone(0.05, 0.16, 2.3, 2.84, 0, 0x1b1b1f, 6, 0, 0, -(Math.PI / 2 - 0.5));
  for (const s of [-1, 1]) {
    m.ball(0.06, 1.9, 3.12, 0.19 * s, 0x1b1b1f, 6, 5);
    m.ball(0.5, 0.1, 0.6, 0.95 * s, 0xff5c9e, 10, 8, 1.4, 0.4, 0.3);
  }
  m.ball(0.3, -1.05, 0.55, 0, 0xff5c9e, 8, 6, 1.7, 0.35, 0.9);
}

function donut(m: Mesher): void {
  m.torus(1.25, 0.55, 0, 0.2, 0, 0xd9913c, Math.PI / 2, 0, 0, 12, 30);
  m.torus(1.25, 0.5, 0, 0.34, 0, 0xff8ec7, Math.PI / 2, 0, 0, 12, 30);
  const colors = [0xffffff, 0xffd23f, 0x5ab8ff, 0x37b956, 0xffffff];
  for (let i = 0; i < 30; i++) {
    const a = i * 2.399;
    const r = 1.25 + Math.sin(i * 1.7) * 0.28;
    m.box(0.22, 0.05, 0.07, Math.cos(a) * r, 0.34 + Math.sqrt(Math.max(0.02, 0.5 * 0.5 - (r - 1.25) ** 2)), Math.sin(a) * r, colors[i % colors.length], a + i);
  }
}

/** Пляжный мяч: шесть долек. */
function beachBall(m: Mesher, r: number): void {
  const cols = [RED, WHITE, YELLOW, WHITE, BLUE, WHITE];
  for (let i = 0; i < 6; i++) m.add(new THREE.SphereGeometry(r, 8, 8, (i * Math.PI) / 3, Math.PI / 3), cols[i], 0, r * 0.7, 0);
}

function toyGroup(ctx: VenueCtx, build: (m: Mesher) => void): THREE.Group {
  const m = new Mesher();
  build(m);
  const g = new THREE.Group();
  const mesh = detailMesh(m, ctx.wet, false);
  if (mesh) g.add(mesh);
  return g;
}

// ------------------------------------------------------------ вход

function buildGate(ctx: VenueCtx): Venue {
  const v = new Venue('aqua', ctx, 83);
  const d = v.detail;
  const { x, zc, half } = GATE;
  const y0 = WATER_Y - 0.25;

  // две надувные стойки на плавучих основаниях и перекладина над вывеской — как арка «СТАРТ», только выше
  for (const s of [-1, 1]) {
    const z = zc + s * half;
    d.add(new THREE.CapsuleGeometry(0.27, GATE.top - y0 - 0.54, 4, 14), BLUE, x, (y0 + GATE.top) / 2, z);
    for (let k = 1; k <= 4; k++) d.torus(0.275, 0.05, x, y0 + ((GATE.top - y0) * k) / 5, z, WHITE, Math.PI / 2, 0, 0, 6, 16);
    d.box(1.0, 0.32, 1.0, x, WATER_Y + 0.05, z, BLUE_DARK);
    d.ball(0.3, x, GATE.top + 0.05, z, YELLOW, 12, 8);
    // спасательный круг на стойке (лицом на восток)
    d.torus(0.24, 0.07, x + 0.3, 2.2, z, RED, 0, Math.PI / 2, 0, 6, 16);
    for (const [dz, dy] of [[0, 0.24], [0, -0.24], [0.24, 0], [-0.24, 0]] as const) d.box(0.07, 0.1, 0.12, x + 0.3, 2.2 + dy, z + dz, WHITE);
    v.flags.pennant(x, GATE.top + 0.55, z, 1.0, 0.36, s > 0 ? RED : YELLOW, Math.PI * 0.62, s + 1.3);
  }
  d.add(new THREE.CapsuleGeometry(0.25, 2 * half, 4, 14).rotateX(Math.PI / 2), BLUE, x, GATE.top, zc);
  for (let k = -3; k <= 3; k++) d.torus(0.255, 0.045, x, GATE.top, zc + k * 0.55, WHITE, 0, Math.PI / 2, 0, 6, 16);

  // вывеска — на восток (к площади), с лампочками; на запад (с воды) — тот же рисунок
  const sign = v.sign({
    w: GATE.signW, h: GATE.signH, x, y: GATE.signY, z: zc, ry: Math.PI / 2, frame: 0x14468a, bulbs: 0xfff0c0, bulbStep: 0.34,
    glow: 0.42, halo: 0x9fd6ff, haloK: 0.12, ppm: 220, draw: drawAquaGate,
  });
  const back = wallPlate(sign.panel.material.map!, x - 0.14, GATE.signY, zc, GATE.signW, GATE.signH, -Math.PI / 2, 0.35);
  v.group.add(back);

  // вымпелы от ворот к арке «СТАРТ» — вдоль мостика, по обе стороны
  const colors = [RED, YELLOW, WHITE, GREEN, PINK, ORANGE, BLUE];
  for (const s of [-1, 1]) {
    bunting(d, [x, 4.2, zc + s * half], [START_ARCH.x, START_ARCH.top + 0.05, zc + s * START_ARCH.half], 7, colors);
  }

  // коврик на настиле у мостика: стрелка «на старт»
  const pad = paintTexture(920, 600, drawAquaPad);
  v.group.add(floorPad(pad, -27.65, zc, 4.6, AQUA_JETTY.z1 - AQUA_JETTY.z0, ctx.wet, 0.005));

  // спасатель Лёва — на настиле севернее входа, лицом к подходящим
  v.touts.push({ ...TOUT_INFO.aqua, key: 'aqua', x: -28.1, z: 6.75, yaw: -Math.PI / 2 - 0.35 });
  return v.finish(true);
}

// ------------------------------------------------------------ парк на воде

function buildFar(ctx: VenueCtx): { venue: Venue; toys: Toy[] } {
  const v = new Venue('aqua-far', ctx, 84, false);
  const d = v.detail;
  const y = WATER_Y + 0.05;

  // буйки и верёвка по границе парка
  const spots: Array<[number, number]> = [];
  for (let i = 0; i + 1 < BUOY_LINE.length; i++) {
    const [ax, az] = BUOY_LINE[i];
    const [bx, bz] = BUOY_LINE[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / BUOY_STEP));
    for (let k = 0; k < n; k++) spots.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    const ang = Math.atan2(-(bz - az), bx - ax);
    d.box(len, 0.035, 0.05, (ax + bx) / 2, y, (az + bz) / 2, 0x2f4f7f, ang);
  }
  const last = BUOY_LINE[BUOY_LINE.length - 1];
  spots.push([last[0], last[1]]);
  const buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.21, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.4 }), spots.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  spots.forEach(([bx, bz], i) => {
    buoys.setMatrixAt(i, m4.makeTranslation(bx, y + 0.03, bz));
    buoys.setColorAt(i, col.setHex(i % 2 === 0 ? ORANGE : WHITE));
  });
  buoys.frustumCulled = false;
  v.group.add(buoys);

  // надувные игрушки: у входа видно с набережной, дальше — вдоль полосы
  const toys: Toy[] = [];
  const addToy = (build: (m: Mesher) => void, x: number, z: number, yaw: number, scale = 1, amp = 0.05): void => {
    const group = toyGroup(ctx, build);
    group.scale.setScalar(scale);
    group.position.set(x, WATER_Y, z);
    group.rotation.y = yaw;
    v.group.add(group);
    toys.push({ group, x, z, yaw, phase: toys.length * 1.9, amp });
  };
  addToy(flamingo, -39.5, 16.8, 1.2, 1.1);
  addToy(duck, -50.5, 18.5, 0.5, 1.0);
  addToy(donut, -61.5, 17.0, 0.3, 1.0, 0.04);
  addToy((m) => beachBall(m, 0.65), -54.5, 14.2, 0, 1, 0.07);
  addToy((m) => beachBall(m, 0.5), -56.2, 15.6, 0, 1, 0.07);
  addToy(duck, -76.0, 26.5, 0.9, 0.8);
  return { venue: v.finish(true), toys };
}

export function buildAqua(ctx: VenueCtx): AquaParts {
  const gate = buildGate(ctx);
  const far = buildFar(ctx);
  return { gate, far: far.venue, toys: far.toys };
}

/** Качание игрушек на волне (кадр) */
export function bobToys(toys: readonly Toy[], time: number): void {
  for (const t of toys) {
    const g = t.group;
    g.position.y = WATER_Y + Math.sin(time * 1.1 + t.phase) * t.amp;
    g.rotation.z = Math.sin(time * 0.8 + t.phase * 1.3) * 0.03;
    g.rotation.x = Math.sin(time * 0.6 + t.phase) * 0.025;
    g.rotation.y = t.yaw + Math.sin(time * 0.15 + t.phase) * 0.08;
  }
}
