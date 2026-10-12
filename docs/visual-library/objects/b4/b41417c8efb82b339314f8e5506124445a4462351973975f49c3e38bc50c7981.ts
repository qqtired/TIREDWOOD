// Надвратная башня и эркеры — только вид, без коллизии. Башня над воротами: этаж из светлого тёсаного камня на
// консолях (под ним ход по стене и обзор вниз на «горло» свободны), окна с тёплым светом и ставнями, герб, поднятая
// решётка над «горлом», шатёр из черепицы с золотым навершием и флагом. Эркеры — круглые башенки на углах северных
// бастионов: ступенчатые консоли, кладка, бойницы, колпак-шатёр с флажком.
// Грани только наружу: если камера над плечом залезет внутрь этажа (игрок на арке над воротами) — видно насквозь.
import * as THREE from 'three';
import { GATE, THROAT_Z, WALL_T } from '../../../shared/fortmap.ts';
import { Bucket, put } from './geo.ts';
import { BARTIZAN, BARTIZANS, GATEHOUSE, POLE_FLAGS } from './layout.ts';

export interface TowersOut {
  stone: Bucket;
  trim: Bucket;
  roof: Bucket;
  /** без текстуры: дерево, железо, золото, гербы, ставни */
  dark: Bucket;
  /** свет в окнах */
  glow: Bucket;
}

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const H = (hex: number) => new THREE.Color(hex);
const STONE = C(1, 0.97, 0.92);
const ASHLAR = C(1.02, 0.98, 0.9);
const TRIM = C(1.05, 1.02, 0.95);
const DENTIL = C(0.92, 0.86, 0.76);
const QUOIN = C(0.93, 0.82, 0.66);
const WOOD = H(0x6b4a2c);
const WOOD_D = H(0x553a22);
const IRON = H(0x3b3c42);
const GOLD = H(0xf0c04a);
const BLUE = H(0x2f66c8);
const RED = H(0xc8442e);
const GREEN = H(0x3f8a4c);

const GEM = H(0x9ff0ff);
const GLOW_TOP = C(1.0, 0.88, 0.55);
const GLOW_BOT = C(1.0, 0.7, 0.34);
const ROOF = C(1, 1, 1);
const RIDGE = H(0x8f3a22);

export function buildTowers(): TowersOut {
  const out: TowersOut = { stone: new Bucket(), trim: new Bucket(), roof: new Bucket(), dark: new Bucket(), glow: new Bucket() };
  gatehouse(out);
  for (const b of BARTIZANS) bartizan(out, b.x, b.z);
  return out;
}

/** Отрезок-брус (цилиндр из 6 граней) от a до b */
function rod(bucket: Bucket, a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.Color, sides = 6): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, sides, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  bucket.geo(g, color);
}

/** Щит-герб: синее поле, золотая кайма, белый кристалл под золотой короной. Лицом к −z (или повёрнут на ry). */
export function shield(bucket: Bucket, x: number, y: number, z: number, w: number, h: number, ry = 0): void {
  const shape = (sw: number, sh: number) => {
    const s = new THREE.Shape();
    s.moveTo(-sw / 2, sh / 2);
    s.lineTo(sw / 2, sh / 2);
    s.lineTo(sw / 2, -sh * 0.02);
    s.quadraticCurveTo(sw / 2, -sh * 0.32, 0, -sh / 2);
    s.quadraticCurveTo(-sw / 2, -sh * 0.32, -sw / 2, -sh * 0.02);
    s.closePath();
    return s;
  };
  const place = (g: THREE.BufferGeometry, dz: number) => {
    // фигура — в плоскости XY лицом к +z; разворачиваем лицом к −z и ставим на место
    g.rotateY(Math.PI + ry);
    g.translate(x - Math.sin(ry) * dz, y, z - Math.cos(ry) * dz);
    return g;
  };
  bucket.geo(place(new THREE.ExtrudeGeometry(shape(w, h), { depth: 0.05, bevelEnabled: false }), 0), GOLD);
  bucket.geo(place(new THREE.ExtrudeGeometry(shape(w * 0.84, h * 0.86), { depth: 0.04, bevelEnabled: false }), 0.035), BLUE);
  // кристалл
  const gem = new THREE.Shape();
  gem.moveTo(0, h * 0.2);
  gem.lineTo(w * 0.17, -h * 0.02);
  gem.lineTo(0, -h * 0.33);
  gem.lineTo(-w * 0.17, -h * 0.02);
  gem.closePath();
  bucket.geo(place(new THREE.ExtrudeGeometry(gem, { depth: 0.02, bevelEnabled: false }), 0.07), GEM);
  // корона
  const cr = new THREE.Shape();
  const cw = w * 0.22;
  const cy = h * 0.27;
  cr.moveTo(-cw, cy - 0.05 * h);
  cr.lineTo(-cw, cy + 0.07 * h);
  cr.lineTo(-cw * 0.5, cy + 0.02 * h);
  cr.lineTo(0, cy + 0.11 * h);
  cr.lineTo(cw * 0.5, cy + 0.02 * h);
  cr.lineTo(cw, cy + 0.07 * h);
  cr.lineTo(cw, cy - 0.05 * h);
  cr.closePath();
  bucket.geo(place(new THREE.ExtrudeGeometry(cr, { depth: 0.02, bevelEnabled: false }), 0.07), GOLD);
}

/**
 * Окно с полукруглым верхом: тёплый свет, светлая рамка с подоконником, переплёт, распахнутые ставни.
 * axis/sign — грань (x или z, нормаль наружу), c — её координата, m — середина окна вдоль грани.
 */
function win(out: TowersOut, axis: 'x' | 'z', sign: number, c: number, m: number, y0: number, w: number, h: number, shutter: THREE.Color | null, flowers = false): void {
  const r = w / 2;
  // всё строим лицом к +z в точке (0, 0, 0), потом ставим на грань
  const ry = axis === 'z' ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2;
  const at = (g: THREE.BufferGeometry, dz: number): THREE.BufferGeometry => {
    g.translate(0, 0, dz);
    g.rotateY(ry);
    if (axis === 'z') g.translate(m, y0, c);
    else g.translate(c, y0, m);
    return g;
  };
  // стекло со светом: прямоугольник и полукруг, снизу теплее
  const pane = new THREE.Shape();
  pane.moveTo(-r, 0);
  pane.lineTo(r, 0);
  pane.lineTo(r, h);
  pane.absarc(0, h, r, 0, Math.PI, false);
  pane.closePath();
  const pg = new THREE.ShapeGeometry(pane, 10);
  const pp = pg.getAttribute('position');
  const pc = new Float32Array(pp.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pp.count; i++) {
    tmp.copy(GLOW_BOT).lerp(GLOW_TOP, Math.min(1, pp.getY(i) / (h + r)));
    pc.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  out.glow.geo(at(pg, 0.012), C(1, 1, 1));
  // переплёт
  out.dark.geo(at(new THREE.BoxGeometry(0.045, h + r - 0.02, 0.03).translate(0, (h + r) / 2, 0), 0.02), WOOD_D);
  out.dark.geo(at(new THREE.BoxGeometry(w, 0.04, 0.03).translate(0, h * 0.62, 0), 0.02), WOOD_D);
  // рамка: подоконник, откосы, арка
  out.trim.geo(at(new THREE.BoxGeometry(w + 0.26, 0.08, 0.12).translate(0, -0.04, 0), 0.04), TRIM);
  out.trim.geo(at(new THREE.BoxGeometry(0.09, h, 0.05).translate(-r - 0.045, h / 2, 0), 0.02), TRIM);
  out.trim.geo(at(new THREE.BoxGeometry(0.09, h, 0.05).translate(r + 0.045, h / 2, 0), 0.02), TRIM);
  const arch = new THREE.RingGeometry(r, r + 0.1, 12, 1, 0, Math.PI);
  arch.translate(0, h, 0);
  out.trim.geo(at(arch, 0.03), TRIM);
  if (shutter) {
    for (const s of [-1, 1]) {
      const x = s * (r + 0.1 + 0.17);
      out.dark.geo(at(new THREE.BoxGeometry(0.34, h + r * 0.6, 0.035).translate(x, (h + r * 0.6) / 2, 0), 0.03), shutter);
      out.dark.geo(at(new THREE.BoxGeometry(0.36, 0.05, 0.045).translate(x, h * 0.25, 0), 0.03), WOOD_D);
      out.dark.geo(at(new THREE.BoxGeometry(0.36, 0.05, 0.045).translate(x, h * 0.85, 0), 0.03), WOOD_D);
    }
  }
  if (flowers) {
    out.dark.geo(at(new THREE.BoxGeometry(w + 0.2, 0.16, 0.2).translate(0, -0.16, 0.12), 0), WOOD);
    const cols = [0xe0492f, 0xf2c230, 0xffffff, 0xe86aa6, 0xe0492f];
    for (let i = 0; i < 7; i++) {
      const fx = -w / 2 + (i / 6) * w;
      out.dark.geo(at(new THREE.IcosahedronGeometry(0.075, 0).translate(fx, -0.02 + (i % 2) * 0.03, 0.12), 0), H(i % 2 ? 0x4f9436 : cols[i % cols.length]));
    }
  }
}

function gatehouse(out: TowersOut): void {
  const g = GATEHOUSE;
  const zc = (g.z0 + g.z1) / 2;
  const inner = GATE.face + WALL_T;
  // --- консоли: спереди на грани воротных башен, сзади на внутренней грани стены
  for (const s of [-1, 1]) {
    const x0 = Math.min(s * g.sx0, s * g.sx1);
    const x1 = Math.max(s * g.sx0, s * g.sx1);
    const cx = (x0 + x1) / 2;
    const steps = [
      [g.front, g.front + 0.3, 0.1, 0.2],
      [g.front + 0.3, g.front + 0.6, 0.2, 0.25],
      [g.front + 0.6, g.front + 1.0, 0.3, 0.3],
    ];
    for (const [y0, y1, d, hw] of steps) out.trim.box(cx - hw, y0, THROAT_Z - d, cx + hw, y1, THROAT_Z, { su: 2, sv: 2, color: TRIM });
    out.stone.box(x0, g.front + 1.0, g.z0, x1, g.floor, THROAT_Z, { color: STONE }, 0b111111 & ~8);
    const rs = [
      [g.rear, g.rear + 0.3, 0.1, 0.18],
      [g.rear + 0.3, g.rear + 0.65, 0.18, 0.25],
      [g.rear + 0.65, g.rear + 1.0, 0.25, 0.3],
    ];
    for (const [y0, y1, d, hw] of rs) out.trim.box(cx - hw, y0, inner, cx + hw, y1, inner + d, { su: 2, sv: 2, color: TRIM });
    out.stone.box(x0, g.rear + 1.0, inner, x1, g.floor, g.z1, { color: STONE }, 0b111111 & ~8);
  }
  // --- арки между консолями: спереди над входом в «горло» (из-под неё выглядывает решётка), сзади над выходом во
  // двор (повыше — с хода по стене видно двор)
  arch(out.trim, g.sx0, 4.95, 5.8, g.floor, g.z0, THROAT_Z);
  arch(out.trim, g.sx0 + 0.03, 5.3, 5.95, g.floor, inner, g.z1);
  // --- плита пола: кромка тёсаным камнем, снизу — дощатый потолок с балками
  const e = 0.12;
  out.trim.box(-g.hx - e, g.floor, g.z0 - e, g.hx + e, g.story, g.z1 + e, { su: 2, sv: 2, color: TRIM }, 0b110011);
  out.dark.face('y', -1, g.floor, -g.hx - e, g.hx + e, g.z0 - e, g.z1 + e, { color: WOOD });
  for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) out.dark.box(x - 0.08, g.beams, g.z0 + 0.05, x + 0.08, g.floor, g.z1 - 0.05, { color: WOOD_D }, 0b111011);
  for (const z of [g.z0 + 0.13, g.z1 - 0.13]) out.dark.box(-g.hx, g.beams, z - 0.08, g.hx, g.floor, z + 0.08, { color: WOOD_D }, 0b111011);
  // кронштейны под передней кромкой (между консолями)
  for (const x of [-1.95, -0.65, 0.65, 1.95]) {
    out.trim.box(x - 0.13, g.floor - 0.22, g.z0 - e, x + 0.13, g.floor, g.z0 + 0.2, { su: 2, sv: 2, color: DENTIL }, 0b111111);
    out.trim.box(x - 0.09, g.floor - 0.4, g.z0 - e + 0.06, x + 0.09, g.floor - 0.22, g.z0 + 0.2, { su: 2, sv: 2, color: DENTIL }, 0b111111);
  }
  // --- этаж: светлый тёсаный камень, угловые камни, карниз с сухариками
  const y0 = g.story;
  const y1 = g.eave;
  out.trim.face('z', -1, g.z0, -g.hx, g.hx, y0, y1, { su: 2, sv: 2, color: ASHLAR });
  out.trim.face('z', 1, g.z1, -g.hx, g.hx, y0, y1, { su: 2, sv: 2, color: ASHLAR });
  out.trim.face('x', -1, -g.hx, g.z0, g.z1, y0, y1, { su: 2, sv: 2, color: ASHLAR });
  out.trim.face('x', 1, g.hx, g.z0, g.z1, y0, y1, { su: 2, sv: 2, color: ASHLAR });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * g.hx;
      const cz = sz < 0 ? g.z0 : g.z1;
      for (let k = 0; k < 5; k++) {
        const yb = y0 + 0.06 + k * 0.5;
        const la = k % 2 ? 0.3 : 0.5;
        const lb = k % 2 ? 0.5 : 0.3;
        const xa = cx + sx * 0.04;
        const xb = cx - sx * la;
        const za = cz + sz * 0.04;
        const zb = cz - sz * lb;
        out.trim.box(Math.min(xa, xb), yb, Math.min(za, zb), Math.max(xa, xb), yb + 0.44, Math.max(za, zb), { su: 2, sv: 2, color: QUOIN }, 0b111111);
      }
    }
  }
  const ce = 0.15;
  out.trim.box(-g.hx - ce, y1 - 0.18, g.z0 - ce, g.hx + ce, y1 + 0.02, g.z1 + ce, { su: 2, sv: 2, color: TRIM }, 0b111011);
  for (const [axis, sign, c, a0, a1] of [['z', -1, g.z0, -g.hx, g.hx], ['z', 1, g.z1, -g.hx, g.hx], ['x', -1, -g.hx, g.z0, g.z1], ['x', 1, g.hx, g.z0, g.z1]] as const) {
    const n = Math.floor((a1 - a0) / 0.36);
    for (let i = 0; i < n; i++) {
      const m = a0 + 0.18 + i * ((a1 - a0 - 0.36) / (n - 1));
      const o = c + sign * 0.08;
      if (axis === 'z') out.trim.box(m - 0.07, y1 - 0.32, Math.min(c, o), m + 0.07, y1 - 0.18, Math.max(c, o), { su: 2, sv: 2, color: DENTIL }, 0b111111);
      else out.trim.box(Math.min(c, o), y1 - 0.32, m - 0.07, Math.max(c, o), y1 - 0.18, m + 0.07, { su: 2, sv: 2, color: DENTIL }, 0b111111);
    }
  }
  // --- окна: спереди два с ставнями и цветами, сзади большое и два малых, по бокам по одному
  win(out, 'z', -1, g.z0, -1.35, y0 + 0.5, 0.62, 0.95, RED, true);
  win(out, 'z', -1, g.z0, 1.35, y0 + 0.5, 0.62, 0.95, RED, true);
  win(out, 'z', 1, g.z1, 0, y0 + 0.45, 0.72, 1.0, GREEN, true);
  win(out, 'z', 1, g.z1, -2.15, y0 + 0.75, 0.42, 0.5, null);
  win(out, 'z', 1, g.z1, 2.15, y0 + 0.75, 0.42, 0.5, null);
  win(out, 'x', -1, -g.hx, zc, y0 + 0.55, 0.56, 0.85, GREEN);
  win(out, 'x', 1, g.hx, zc, y0 + 0.55, 0.56, 0.85, GREEN);
  // герб над «горлом»
  shield(out.dark, 0, y0 + 1.15, g.z0 - 0.02, 1.0, 1.2);
  // --- поднятая решётка над входом в «горло»: прутья с остриями внизу
  const pz = THROAT_Z - 0.06;
  for (let i = 0; i < 13; i++) {
    const x = -2.34 + i * 0.39;
    out.dark.box(x - 0.028, 5.42, pz - 0.035, x + 0.028, g.floor, pz + 0.035, { color: IRON }, 0b111111);
    const tip = new THREE.ConeGeometry(0.045, 0.16, 4).rotateX(Math.PI);
    out.dark.geo(put(tip, x, 5.34, pz), IRON);
  }
  for (const y of [5.62, 6.02]) out.dark.box(-2.42, y - 0.03, pz - 0.04, 2.42, y + 0.03, pz + 0.04, { color: IRON }, 0b111111);
  // --- шатёр: вынос карниза, излом у основания, черепица; рёбра, подшивка снизу, навершие
  const ov = 0.55;
  const kink = 0.22;
  const yk = y1 + 0.42;
  const top = new THREE.Vector3(0, g.peak, zc);
  // углы против часовой, если смотреть сверху: тогда скаты смотрят наружу
  const rect = (o: number, y: number) => [
    new THREE.Vector3(-g.hx - o, y, g.z1 + o),
    new THREE.Vector3(g.hx + o, y, g.z1 + o),
    new THREE.Vector3(g.hx + o, y, g.z0 - o),
    new THREE.Vector3(-g.hx - o, y, g.z0 - o),
  ];
  const eave = rect(ov, y1);
  const mid = rect(kink, yk);
  const tile = 1.6;
  for (let i = 0; i < 4; i++) {
    const a = eave[i];
    const b = eave[(i + 1) % 4];
    const c = mid[(i + 1) % 4];
    const d = mid[i];
    roofQuad(out.roof, a, b, c, d, tile);
    roofTri(out.roof, d, c, top, tile);
    rod(out.dark, a, d, 0.07, RIDGE);
    rod(out.dark, d, top, 0.07, RIDGE);
  }
  // подшивка карниза снизу (видна с хода по стене)
  const wall = rect(0, y1 - 0.18);
  const low = rect(ov, y1 - 0.005);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const p = new THREE.BufferGeometry().setFromPoints([wall[i], low[j], low[i], wall[i], wall[j], low[j]]);
    p.computeVertexNormals();
    out.dark.geo(p, WOOD);
  }
  const ball = new THREE.SphereGeometry(0.16, 10, 8).translate(0, g.peak + 0.06, zc);
  out.dark.geo(ball, GOLD);
  const pole = POLE_FLAGS[0];
  rod(out.dark, new THREE.Vector3(pole.x, pole.y, pole.z), new THREE.Vector3(pole.x, pole.y + pole.pole + 0.05, pole.z), 0.045, WOOD_D);
  out.dark.geo(new THREE.SphereGeometry(0.09, 8, 6).translate(pole.x, pole.y + pole.pole + 0.1, pole.z), GOLD);
}

/** Арка поперёк проезда: от |x| = hw, пята на высоте spring, замок — top, верх — ceil, по z от z0 до z1 */
function arch(bucket: Bucket, hw: number, spring: number, top: number, ceil: number, z0: number, z1: number): void {
  const s = new THREE.Shape();
  s.moveTo(-hw, spring);
  s.lineTo(-hw, ceil);
  s.lineTo(hw, ceil);
  s.lineTo(hw, spring);
  s.absellipse(0, spring, hw, top - spring, 0, Math.PI, false);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, z0);
  bucket.geo(g, TRIM, [0.5, 0.5]);
  // клинчатые камни по своду — тёмные швы-полоски
  for (let i = 1; i < 9; i++) {
    const a = (i / 9) * Math.PI;
    const x = Math.cos(a) * hw;
    const y = spring + Math.sin(a) * (top - spring);
    const n = new THREE.Vector2(Math.cos(a) / hw, Math.sin(a) / (top - spring)).normalize();
    const seam = new THREE.BoxGeometry(0.035, 0.32, z1 - z0 + 0.02);
    seam.rotateZ(Math.atan2(n.y, n.x) - Math.PI / 2);
    seam.translate(x + n.x * 0.15, y + n.y * 0.15, (z0 + z1) / 2);
    bucket.geo(seam, DENTIL);
  }
}

/** Скат шатра (четырёхугольник a b c d против часовой снаружи), черепица: u вдоль карниза, v вверх по скату */
function roofQuad(bucket: Bucket, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, tile: number): void {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  const along = new THREE.Vector3().subVectors(b, a).normalize();
  const up = new THREE.Vector3().crossVectors(n, along).normalize();
  const uv = (p: THREE.Vector3) => [p.clone().sub(a).dot(along) / tile, p.clone().sub(a).dot(up) / tile];
  const g = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...n.toArray(), ...n.toArray(), ...n.toArray(), ...n.toArray(), ...n.toArray(), ...n.toArray()], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([...uv(a), ...uv(b), ...uv(c), ...uv(a), ...uv(c), ...uv(d)], 2));
  bucket.geo(g, ROOF);
}

function roofTri(bucket: Bucket, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, tile: number): void {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  const along = new THREE.Vector3().subVectors(b, a).normalize();
  const up = new THREE.Vector3().crossVectors(n, along).normalize();
  const uv = (p: THREE.Vector3) => [p.clone().sub(a).dot(along) / tile, p.clone().sub(a).dot(up) / tile + 0.3];
  const g = new THREE.BufferGeometry().setFromPoints([a, b, c]);
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...n.toArray(), ...n.toArray(), ...n.toArray()], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([...uv(a), ...uv(b), ...uv(c)], 2));
  bucket.geo(g, ROOF);
}

/** Эркер: ступенчатые консоли, круглая кладка, бойницы наружу, карниз, колпак-шатёр, навершие и шест флажка */
function bartizan(out: TowersOut, x: number, z: number): void {
  const B = BARTIZAN;
  // наружу — от угла бастиона к центру эркера; шов развёртки — внутрь (в стену)
  const ix = Math.sign(x) * (Math.abs(x) < 18 ? 15 : 21) - x;
  const iz = (z < -16 ? -19 : -13) - z;
  const seam = Math.atan2(ix, iz);
  const steps = [
    [B.corbel, B.corbel + 0.2, 0.3],
    [B.corbel + 0.2, B.corbel + 0.4, 0.46],
    [B.corbel + 0.4, B.corbel + 0.6, 0.62],
    [B.corbel + 0.6, B.body, 0.76],
  ];
  for (const [y0, y1, r] of steps) {
    const c = new THREE.CylinderGeometry(r, r, y1 - y0, 16).translate(x, (y0 + y1) / 2, z);
    out.trim.geo(c, TRIM, [2, 0.5]);
  }
  const body = new THREE.CylinderGeometry(B.r, B.r, B.top - B.body, 20, 2, true);
  body.rotateY(seam);
  body.translate(x, (B.body + B.top) / 2, z);
  out.stone.geo(body, STONE, [(2 * Math.PI * B.r) / 4, (B.top - B.body) / 4], [0, B.body / 4]);
  // бойницы: наружу под 45° от диагонали
  const outA = Math.atan2(-ix, -iz);
  for (const da of [-0.6, 0.6]) {
    const a = outA + da;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const slit = new THREE.PlaneGeometry(0.12, 0.62);
    slit.rotateY(a);
    slit.translate(x + nx * (B.r + 0.012), 4.25, z + nz * (B.r + 0.012));
    out.dark.geo(slit, H(0x221a14));
    const frame = new THREE.BoxGeometry(0.26, 0.8, 0.05);
    frame.rotateY(a);
    frame.translate(x + nx * (B.r + 0.0), 4.25, z + nz * (B.r + 0.0));
    out.trim.geo(frame, TRIM, [0.5, 0.5]);
  }
  out.trim.geo(new THREE.CylinderGeometry(B.r + 0.1, B.r + 0.06, 0.16, 20).translate(x, B.top - 0.02, z), TRIM, [2, 0.3]);
  // колпак: расширение у карниза, вогнутый скат к острию
  const prof = [
    [B.eave, B.top + 0.03],
    [0.98, B.top + 0.2],
    [0.84, B.top + 0.55],
    [0.62, B.top + 1.25],
    [0.36, B.top + 2.05],
    [0.12, B.peak - 0.18],
    [0.001, B.peak],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const cap = new THREE.LatheGeometry(prof, 20);
  cap.rotateY(seam);
  cap.translate(x, 0, z);
  out.roof.geo(cap, ROOF, [4, 1.9]);
  // подшивка колпака снизу
  const under = new THREE.RingGeometry(B.r + 0.05, B.eave, 20, 1).rotateX(Math.PI / 2).translate(x, B.top + 0.03, z);
  out.dark.geo(under, WOOD);
  out.dark.geo(new THREE.SphereGeometry(0.09, 8, 6).translate(x, B.peak + 0.04, z), GOLD);
  rod(out.dark, new THREE.Vector3(x, B.peak, z), new THREE.Vector3(x, B.pole + 0.05, z), 0.025, WOOD_D);
  out.dark.geo(new THREE.SphereGeometry(0.05, 8, 6).translate(x, B.pole + 0.08, z), GOLD);
}

