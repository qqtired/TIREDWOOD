// Праздник у трассы: зрители-желейки на трибунах, флажки-гирлянды и флаги на флагштоках. Всё — инстансами (один
// вызов отрисовки на вид), а движение — в вершинном шейдере по одной униформе времени: желейки подпрыгивают и
// покачиваются каждая в своём ритме, флажки и флаги полощутся на ветру. Тени от них не считаются (статика — одна
// карта теней на гонку), только принимаются.
import * as THREE from 'three';

/** Место зрителя: точка на ступени трибуны, взгляд по yaw (0 → +Z) */
export interface Seat {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const JELLY = [0xff5f87, 0xffa63d, 0x6fd651, 0x48b8ff, 0xa97bff, 0xffd84a, 0xff7fd0, 0x3fd9b5, 0xff6b4a, 0x8fe3ff];
const PENNANT = [0xe8423a, 0xffd23f, 0x2f8fe0, 0x3cbf5a, 0xffffff, 0xff8a2a, 0xb05cf0];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** Подмешать к шейдеру материала время и кусок кода после begin_vertex (номер экземпляра — gl_InstanceID) */
function animate(m: THREE.Material, time: THREE.IUniform<number>, key: string, code: string): void {
  m.onBeforeCompile = (s) => {
    s.uniforms.uFestTime = time;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFestTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}`);
  };
  m.customProgramCacheKey = () => `fest-${key}`;
}

/** Прыжок желейки: тот же код у тела и у глаз — они двигаются вместе */
const HOP = /* glsl */ `
  float fid = float(gl_InstanceID);
  float fsp = 2.6 + mod(fid * 7.0, 5.0) * 0.45;
  float fb = sin(uFestTime * fsp + fid * 1.93);
  float fhop = max(0.0, fb);
  // на земле — сплющивается, в прыжке — вытягивается
  float fsq = 1.0 + 0.09 * (fhop * 2.0 - 1.0);
  transformed.y *= fsq;
  transformed.xz *= 1.0 / sqrt(fsq);
  transformed.y += fhop * fhop * 0.32;
  transformed.x += sin(uFestTime * 1.3 + fid) * 0.05 * transformed.y;
`;

/** Флажок гирлянды висит вниз от шнура (−y): низ полощется поперёк шнура */
const FLAP = /* glsl */ `
  float fid = float(gl_InstanceID);
  float fw = sin(uFestTime * 3.1 + fid * 0.83) * 0.5 + sin(uFestTime * 5.3 + fid * 1.7) * 0.25;
  transformed.z += fw * -transformed.y * 0.45;
`;

/** Флаг на флагштоке: полотнище вдоль +x от древка, волна бежит от древка к краю */
const WAVE = /* glsl */ `
  float fid = float(gl_InstanceID);
  float fx = max(0.0, transformed.x);
  transformed.z += sin(fx * 2.2 - uFestTime * 5.0 + fid * 2.1) * 0.16 * fx;
  transformed.y -= fx * fx * 0.012;
`;

export class Festive {
  private readonly time: THREE.IUniform<number> = { value: 0 };
  private readonly seats: Seat[] = [];
  private readonly pennants: Array<{ x: number; y: number; z: number; yaw: number; color: number }> = [];
  private readonly flags: Array<{ x: number; y: number; z: number; yaw: number; color: number; w: number }> = [];
  private readonly lines: number[] = [];
  private readonly scene: THREE.Scene;
  private readonly rng: () => number;

  constructor(scene: THREE.Scene, rng: () => number) {
    this.scene = scene;
    this.rng = rng;
  }

  /** Зритель на месте */
  seat(s: Seat): void {
    this.seats.push(s);
  }

  /** Гирлянда флажков от a до b с провисом sag метров, флажок через step метров */
  bunting(ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag = 0.8, step = 0.7): void {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(2, Math.round(len / step));
    const yaw = Math.atan2(bx - ax, bz - az);
    let k0 = Math.floor(this.rng() * PENNANT.length);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t - sag * 4 * t * (1 - t);
      this.lines.push(x, y, z);
      if (i > 0 && i < n) this.lines.push(x, y, z);
      if (i > 0 && i < n) this.pennants.push({ x, y, z, yaw, color: PENNANT[k0++ % PENNANT.length] });
    }
  }

  /** Флагшток с флагом: основание (x, y, z), высота h, флаг смотрит по yaw (полотнище — вдоль +x после поворота) */
  flag(x: number, y: number, z: number, h: number, yaw: number, color: number, w = 1.6): void {
    this.flags.push({ x, y: y + h, z, yaw, color, w });
    this.pole(x, y, z, h);
  }

  private readonly poles: THREE.Matrix4[] = [];
  private pole(x: number, y: number, z: number, h: number): void {
    this.poles.push(new THREE.Matrix4().compose(_p.set(x, y + h / 2, z), _q.identity(), _s.set(1, h, 1)));
  }

  /** Собрать всё в инстансы (после того как сцена раздала места) */
  build(lite: boolean): void {
    this.buildCrowd(lite);
    this.buildPennants();
    this.buildFlags();
  }

  private buildCrowd(lite: boolean): void {
    const seats = lite ? this.seats.filter((_, i) => i % 2 === 0) : this.seats;
    if (!seats.length) return;
    // тело: капля — шире книзу, плоское дно
    const body = new THREE.SphereGeometry(0.42, 12, 9);
    const pos = body.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      const k = y < 0 ? 1.12 : 1 - y * 0.35;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
      if (y < -0.3) y = -0.3 + (y + 0.3) * 0.25;
      pos.setY(i, (y + 0.31) * 1.12);
    }
    body.computeVertexNormals();
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0, emissive: 0x000000 });
    animate(bodyMat, this.time, 'jelly-body', HOP);
    const bodies = new THREE.InstancedMesh(body, bodyMat, seats.length);
    // глаза: плоские белки и зрачки чуть перед лицом, смотрят по +z (на дорогу) — мало треугольников
    const eyeParts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const white = new THREE.CircleGeometry(0.115, 10).translate(sx * 0.14, 0.63, 0.335);
      const pupil = new THREE.CircleGeometry(0.06, 8).translate(sx * 0.14, 0.64, 0.342);
      eyeParts.push(colored(white, 0xffffff), colored(pupil, 0x1b1d24));
    }
    const eyesGeo = mergeAll(eyeParts);
    const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25 });
    animate(eyeMat, this.time, 'jelly-eyes', HOP);
    const eyes = new THREE.InstancedMesh(eyesGeo, eyeMat, seats.length);
    seats.forEach((s, i) => {
      const sc = 0.85 + this.rng() * 0.35;
      _q.setFromAxisAngle(UP, s.yaw + (this.rng() - 0.5) * 0.5);
      _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(sc, sc, sc));
      bodies.setMatrixAt(i, _m);
      eyes.setMatrixAt(i, _m);
      bodies.setColorAt(i, _c.set(JELLY[Math.floor(this.rng() * JELLY.length)]));
    });
    for (const m of [bodies, eyes]) {
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
    }
  }

  private buildPennants(): void {
    if (!this.pennants.length) return;
    // треугольник: верх на шнуре, острие вниз
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.24, 0, 0, 0.24, 0, 0, 0, -0.5, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 });
    animate(mat, this.time, 'pennant', FLAP);
    const mesh = new THREE.InstancedMesh(g, mat, this.pennants.length);
    this.pennants.forEach((p, i) => {
      // плоскость флажка — вдоль шнура: поворот так, чтобы локальная x шла по шнуру
      _q.setFromEuler(_e.set(0, p.yaw - Math.PI / 2, 0));
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(p.color));
    });
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(this.lines, 3));
    this.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a3330 })));
  }

  private buildFlags(): void {
    if (this.poles.length) {
      const pole = new THREE.CylinderGeometry(0.05, 0.07, 1, 6);
      const mesh = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.4, metalness: 0.5 }), this.poles.length);
      this.poles.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    if (!this.flags.length) return;
    const g = new THREE.PlaneGeometry(1, 0.62, 8, 1).translate(0.5, -0.31, 0);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.75 });
    animate(mat, this.time, 'flag', WAVE);
    const mesh = new THREE.InstancedMesh(g, mat, this.flags.length);
    this.flags.forEach((f, i) => {
      _q.setFromAxisAngle(UP, f.yaw);
      _m.compose(_p.set(f.x, f.y, f.z), _q, _s.set(f.w, f.w, f.w));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(f.color));
    });
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  update(t: number): void {
    this.time.value = t;
  }
}

function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const n = src.getAttribute('position').count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  src.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  src.deleteAttribute('uv');
  return src;
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of list) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** Цвет зрителя по номеру (для своих моделей у трибун) */
export function jellyColor(i: number): number {
  return JELLY[i % JELLY.length];
}

/** Трибуна у прямой: точка i осевой, сторона sd, от a0 до a1 метров по ходу, первый ряд — в off метрах от оси */
export interface StandSpec {
  /** Точка осевой и курс трибуны (по дороге) */
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** Сторона: +1 — справа по ходу */
  sd: number;
  a0: number;
  a1: number;
  off: number;
  /** Высота основания (пол первого ряда — на 0,5 выше) */
  y0: number;
  /** Ступени уходят вниз до этой высоты (земля или вода) */
  floor: number;
}

/**
 * Трибуна: четыре ряда ступеней с цветными сиденьями, задняя стенка, навес в красно-белую полоску на столбах,
 * флаги по краю навеса, гирлянда спереди и зрители-желейки лицом к дороге. Возвращает центр и радиус занятого места.
 */
export function buildGrandstand(scene: THREE.Scene, solid: THREE.BufferGeometry[], fest: Festive, s: StandSpec): [number, number, number] {
  const { fx, fz, sd, a0, a1, off, y0 } = s;
  const rx = -fz * sd;
  const rz = fx * sd;
  const ry = Math.atan2(fx, fz);
  const L = a1 - a0;
  const ROWS = 4;
  const DEPTH = 1.5;
  const RISE = 0.6;
  const mid = (a0 + a1) / 2;
  const P = (a: number, o: number): [number, number] => [s.x + fx * a + rx * o, s.z + fz * a + rz * o];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, rot = ry): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    const src = g.toNonIndexed();
    const n = src.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    _c.set(c);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    src.setAttribute('color', new THREE.BufferAttribute(col, 3));
    src.applyMatrix4(_m.makeRotationY(rot).setPosition(x, y, z));
    solid.push(src);
  };
  const bottom = Math.min(s.floor, y0) - 0.5;
  for (let r = 0; r < ROWS; r++) {
    const [x, z] = P(mid, off + DEPTH * (r + 0.5));
    const top = y0 + 0.5 + RISE * r;
    box(DEPTH, top - bottom, L, x, (top + bottom) / 2, z, r % 2 ? 0xdfe4ea : 0xeef1f4);
    const [sx, sz] = P(mid, off + DEPTH * r + 0.35);
    box(0.42, 0.12, L - 0.4, sx, top + 0.06, sz, r % 2 ? 0x2f8fe0 : 0xe8423a);
  }
  const back = off + DEPTH * ROWS + 0.2;
  const topY = y0 + 0.5 + RISE * ROWS;
  {
    const [x, z] = P(mid, back);
    box(0.4, topY + 3 - bottom, L, x, (topY + 3 + bottom) / 2, z, 0xf1e6cc);
    // изнанка трибуны: крашеная полоса с белой и красной каймой, чтобы сзади не было голой серой стены
    const [bx, bz] = P(mid, back + 0.23);
    const band = (topY + bottom) / 2 + 1.2;
    box(0.06, 1.3, L - 0.8, bx, band, bz, 0x2f8fe0);
    box(0.06, 0.22, L - 0.8, bx, band + 0.86, bz, 0xffffff);
    box(0.06, 0.22, L - 0.8, bx, band - 0.86, bz, 0xe8423a);
  }
  const roofY = topY + 3.6;
  const posts = Math.max(2, Math.round(L / 9));
  for (let k = 0; k <= posts; k++) {
    const a = a0 + 0.6 + ((L - 1.2) * k) / posts;
    for (const o of [off - 0.2, back]) {
      const [x, z] = P(a, o);
      box(0.22, roofY - bottom, 0.22, x, (roofY + bottom) / 2, z, 0xf4f1ea, 0);
    }
  }
  // навес: полосы поперёк, скат к дороге
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const n = Math.round(L / 2.4);
  for (let k = 0; k < n; k++) {
    const a = a0 + (L * k) / n;
    const b = a0 + (L * (k + 1)) / n;
    _c.set(k % 2 ? 0xf6f3ec : 0xe23a33);
    const [x0, z0] = P(a, off - 1.2);
    const [x1, z1] = P(b, off - 1.2);
    const [x2, z2] = P(b, back + 0.4);
    const [x3, z3] = P(a, back + 0.4);
    const v = [[x0, roofY - 0.5, z0], [x1, roofY - 0.5, z1], [x2, roofY + 0.4, z2], [x3, roofY + 0.4, z3]];
    for (const t of [0, 1, 2, 0, 2, 3]) {
      pos.push(...v[t]);
      nor.push(0, 1, 0);
      col.push(_c.r, _c.g, _c.b);
    }
  }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ag.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  ag.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const awning = new THREE.Mesh(ag, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  awning.castShadow = true;
  awning.receiveShadow = true;
  scene.add(awning);
  const yaw = Math.atan2(-rx, -rz);
  for (let r = 0; r < ROWS; r++) {
    const top = y0 + 0.5 + RISE * r;
    for (let a = a0 + 0.8; a < a1 - 0.6; a += 0.95) {
      const [x, z] = P(a + (r % 2) * 0.45, off + DEPTH * r + 0.85);
      fest.seat({ x, y: top, z, yaw });
    }
  }
  const colors = [0xe8423a, 0xffd23f, 0x2f8fe0, 0x3cbf5a];
  let k = 0;
  for (let a = a0 + 2; a <= a1 - 2; a += 6) {
    const [x, z] = P(a, back + 0.4);
    fest.flag(x, roofY + 0.4, z, 2.4, Math.atan2(-fz, fx), colors[k++ & 3], 1.3);
  }
  const [bx0, bz0] = P(a0, off - 1.2);
  const [bx1, bz1] = P(a1, off - 1.2);
  fest.bunting(bx0, roofY - 0.6, bz0, bx1, roofY - 0.6, bz1, 0.5, 0.75);
  const [cx, cz] = P(mid, off + DEPTH * 2);
  return [cx, cz, L / 2 + 3];
}
