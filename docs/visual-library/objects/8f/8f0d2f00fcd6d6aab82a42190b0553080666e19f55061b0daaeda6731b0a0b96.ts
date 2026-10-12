// Двор и огни: кузня в северо-восточном углу (горн с углями и искрами, колпак с трубой, наковальня, бочка с водой),
// склад в северо-западном (бочки, ящики, мешки), стойка с копьями и щитами, поленница, ящики с цветами на бортике
// террасы, фонари у «горла» и на столбах террасы, факелы на стенах двора. Всё — вплотную к стенам, в стороне от
// лестниц, мест спрыгивания липучек и пути к кристаллу (габариты — в layout.ts, их проверяет тест).
import * as THREE from 'three';
import { CastleFx } from './fx.ts';
import { Bucket, put } from './geo.ts';
import { LIGHTS, TERRACE_POSTS, YARD, type Light } from './layout.ts';

export interface YardOut {
  stone: Bucket;
  trim: Bucket;
  dark: Bucket;
  glow: Bucket;
  /** ящики (текстура ящика): min, max */
  crates: Array<[number, number, number, number, number, number]>;
  /** где горн (искры и дымок из трубы) */
  forge: THREE.Vector3;
  chimney: THREE.Vector3;
}

const H = (hex: number) => new THREE.Color(hex);
const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const WOOD = H(0x7a5232);
const WOOD_L = H(0x9a6b42);
const WOOD_D = H(0x553a22);
const END = H(0xd9b07a);
const BARK = H(0x6b4a2c);
const IRON = H(0x3b3c42);
const STEEL = H(0x8a8f99);
const STONE = C(0.92, 0.86, 0.78);
const TRIM = C(1, 0.97, 0.9);
const SACK = H(0xd6c29a);
const WATER = H(0x2e5566);
const GREEN = H(0x4f9436);
const FLOWERS = [0xe0492f, 0xf2c230, 0xffffff, 0xe86aa6, 0xff8a3a, 0xb06ad8].map(H);
const FLAME = C(1, 0.85, 0.55);
const HALO = C(1, 0.62, 0.3);
const COAL = C(1, 0.42, 0.12);
const COAL_D = C(0.55, 0.14, 0.05);
const GLASS = C(1, 0.86, 0.55);

export function buildYard(fx: CastleFx): YardOut {
  const out: YardOut = { stone: new Bucket(), trim: new Bucket(), dark: new Bucket(), glow: new Bucket(), crates: [], forge: new THREE.Vector3(), chimney: new THREE.Vector3() };
  forge(out, fx);
  stores(out);
  rack(out);
  logs(out);
  flowers(out);
  for (const l of LIGHTS) light(out, fx, l);
  for (const p of TERRACE_POSTS) {
    // столб до низа фонаря (фонарь — сверху, см. LIGHTS)
    rod(out.dark, new THREE.Vector3(p.x, p.y0, p.z), new THREE.Vector3(p.x, p.y1 - 0.53, p.z), 0.055, WOOD_D, 8);
    out.dark.geo(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 8).translate(p.x, p.y0 + 0.04, p.z), IRON);
  }
  return out;
}

function rod(bucket: Bucket, a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.Color, sides = 6): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, sides, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  bucket.geo(g, color);
}

/** Бочка: пузатая клёпка, три железных обруча, крышка */
function barrel(b: Bucket, x: number, y: number, z: number, r: number, h: number, color = WOOD, lying = 0): void {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push(new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(Math.PI * t)), t * h));
  }
  const parts: Array<[THREE.BufferGeometry, THREE.Color]> = [
    [new THREE.LatheGeometry(prof, 12), color],
    [new THREE.CircleGeometry(r * 0.86, 12).rotateX(-Math.PI / 2).translate(0, h, 0), color.clone().multiplyScalar(0.8)],
  ];
  for (const t of [0.12, 0.5, 0.88]) {
    const rr = r * (0.86 + 0.14 * Math.sin(Math.PI * t)) + 0.012;
    parts.push([new THREE.CylinderGeometry(rr, rr, 0.05, 12, 1, true).translate(0, t * h, 0), IRON]);
  }
  for (const [g, c] of parts) {
    if (lying) g.translate(0, -h / 2, 0).rotateX(Math.PI / 2).rotateY(lying);
    b.geo(put(g, x, y + (lying ? r : 0), z), c);
  }
}

function forge(out: YardOut, fx: CastleFx): void {
  const h = YARD.hearth;
  // горн: каменный короб с кромкой, сверху — угли
  out.stone.box(h.x0, 0, h.z0, h.x1, h.y1 - 0.1, h.z1, { color: STONE, ao: 0.7 }, 0b110111);
  out.trim.box(h.x0 - 0.05, h.y1 - 0.1, h.z0 - 0.05, h.x1, h.y1, h.z1 + 0.05, { su: 2, sv: 2, color: TRIM }, 0b111111);
  const cx = (h.x0 + h.x1) / 2;
  const cz = (h.z0 + h.z1) / 2;
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39;
    const r = 0.12 + (i % 5) * 0.07;
    out.glow.geo(new THREE.IcosahedronGeometry(0.07 + (i % 3) * 0.025, 0).translate(cx + Math.cos(a) * r * 0.8, h.y1 + 0.02, cz + Math.sin(a) * r * 1.6), i % 3 ? COAL : COAL_D);
  }
  out.forge.set(cx, h.y1 + 0.1, cz);
  fx.addStatic(cx, h.y1 + 0.35, cz, 2.2, C(1, 0.45, 0.15), 0.42, 1, 1.3);
  fx.addStatic(cx, h.y1 + 0.18, cz - 0.3, 0.42, FLAME, 0.9, 0, 2.1, 1.3);
  fx.addStatic(cx, h.y1 + 0.16, cz + 0.35, 0.36, FLAME, 0.9, 0, 4.7, 1.3);
  // колпак: усечённая пирамида к стене, труба до верха стены и чуть выше
  const hd = YARD.hood;
  const y0 = hd.y0;
  const y1 = 3.3;
  const top = { x0: 14.62, z0: -11.85, z1: -10.95 };
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const g = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute([a.z / 2, a.y / 2, b.z / 2, b.y / 2, c.z / 2, c.y / 2, a.z / 2, a.y / 2, c.z / 2, c.y / 2, d.z / 2, d.y / 2], 2));
    out.trim.geo(g, STONE);
  };
  // лицевая (к −x), бока (к −z и +z) — обход против часовой снаружи
  quad(P(hd.x0, y0, hd.z0), P(hd.x0, y0, hd.z1), P(top.x0, y1, top.z1), P(top.x0, y1, top.z0));
  quad(P(15, y0, hd.z0), P(hd.x0, y0, hd.z0), P(top.x0, y1, top.z0), P(15, y1, top.z0));
  quad(P(hd.x0, y0, hd.z1), P(15, y0, hd.z1), P(15, y1, top.z1), P(top.x0, y1, top.z1));
  out.trim.box(hd.x0 - 0.04, y0 - 0.1, hd.z0 - 0.04, 15, y0, hd.z1 + 0.04, { su: 2, sv: 2, color: TRIM }, 0b111111);
  out.stone.box(top.x0, y1, top.z0, 15, 4.45, top.z1, { color: STONE }, 0b111111 & ~8);
  out.trim.box(top.x0 - 0.05, 4.45, top.z0 - 0.05, 15.0, 4.55, top.z1 + 0.05, { su: 2, sv: 2, color: TRIM }, 0b111111);
  out.chimney.set((top.x0 + 15) / 2, 4.6, (top.z0 + top.z1) / 2);
  // наковальня на чурбаке
  const an = YARD.anvil;
  const ax = (an.x0 + an.x1) / 2;
  const az = (an.z0 + an.z1) / 2;
  out.dark.geo(new THREE.CylinderGeometry(0.27, 0.3, 0.5, 10).translate(ax, 0.25, az), BARK);
  out.dark.geo(new THREE.CircleGeometry(0.27, 10).rotateX(-Math.PI / 2).translate(ax, 0.501, az), END);
  out.dark.box(ax - 0.13, 0.5, az - 0.1, ax + 0.13, 0.62, az + 0.1, { color: IRON }, 0b111111);
  out.dark.box(ax - 0.3, 0.62, az - 0.12, ax + 0.22, 0.78, az + 0.12, { color: IRON }, 0b111111);
  out.dark.geo(new THREE.ConeGeometry(0.1, 0.32, 8).rotateZ(Math.PI / 2).translate(ax + 0.37, 0.71, az), IRON);
  out.dark.box(ax - 0.28, 0.78, az - 0.11, ax + 0.2, 0.8, az + 0.11, { color: STEEL }, 0b111111);
  // молот на наковальне
  out.dark.box(ax - 0.05, 0.8, az - 0.06, ax + 0.07, 0.88, az + 0.06, { color: IRON }, 0b111111);
  rod(out.dark, new THREE.Vector3(ax, 0.84, az), new THREE.Vector3(ax - 0.05, 0.86, az + 0.36), 0.018, WOOD_L);
  // бочка с водой
  const q = YARD.quench;
  barrel(out.dark, (q.x0 + q.x1) / 2, 0, (q.z0 + q.z1) / 2, 0.29, 0.74);
  out.dark.geo(new THREE.CircleGeometry(0.24, 12).rotateX(-Math.PI / 2).translate((q.x0 + q.x1) / 2, 0.66, (q.z0 + q.z1) / 2), WATER);
  // клещи и молоты на стене над горном
  for (let i = 0; i < 3; i++) {
    const z = h.z0 + 0.35 + i * 0.32;
    rod(out.dark, new THREE.Vector3(14.97, 2.05, z), new THREE.Vector3(14.97, 1.35, z + 0.04), 0.014, IRON);
    out.dark.box(14.93, 1.25, z - 0.04, 14.99, 1.38, z + 0.08, { color: IRON }, 0b111111);
  }
}

function stores(out: YardOut): void {
  barrel(out.dark, -14.55, 0, -12.55, 0.36, 0.86);
  barrel(out.dark, -14.62, 0, -11.75, 0.34, 0.82, WOOD_L);
  barrel(out.dark, -13.95, 0, -12.62, 0.3, 0.7);
  // бочка лёжа поверх двух
  barrel(out.dark, -14.58, 0.82, -12.15, 0.27, 0.62, WOOD_L, Math.PI / 2);
  out.crates.push([-14.85, 0, -11.25, -14.05, 0.72, -10.45]);
  out.crates.push([-14.7, 0.72, -11.08, -14.2, 1.2, -10.6]);
  // мешки
  for (const [x, z, s] of [[-13.85, -11.05, 1], [-13.9, -10.55, 0.85]] as const) {
    const g = new THREE.SphereGeometry(0.27 * s, 10, 8).scale(1, 0.75, 0.85);
    out.dark.geo(put(g, x, 0.2 * s, z, 0.4), SACK);
    out.dark.geo(new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 0.12 * s, 6).translate(x, 0.42 * s, z), SACK.clone().multiplyScalar(0.85));
  }
}

function rack(out: YardOut): void {
  const r = YARD.rack;
  const z = r.z0 + 0.22;
  for (const x of [r.x0 + 0.12, r.x1 - 0.12]) out.dark.box(x - 0.05, 0, z - 0.05, x + 0.05, 1.5, z + 0.05, { color: WOOD_D }, 0b110111);
  for (const y of [0.35, 1.22]) out.dark.box(r.x0 + 0.05, y - 0.04, z - 0.07, r.x1 - 0.05, y + 0.04, z + 0.07, { color: WOOD }, 0b111111);
  // копья: стоят, прислонены к стене
  for (let i = 0; i < 6; i++) {
    const x = r.x0 + 0.38 + i * 0.25;
    const a = new THREE.Vector3(x, 0.02, z + 0.12);
    const b = new THREE.Vector3(x + (i % 2 ? 0.03 : -0.03), 2.0, r.z0 + 0.06);
    rod(out.dark, a, b, 0.02, WOOD_L);
    const tip = new THREE.ConeGeometry(0.045, 0.24, 4);
    tip.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    out.dark.geo(tip.translate(b.x, b.y + 0.1, b.z - 0.01), STEEL);
  }
  // щиты на стене по бокам
  for (const [x, c] of [[r.x0 - 0.05, 0xc8442e], [r.x1 + 0.05, 0x2f66c8]] as const) {
    const disc = new THREE.CylinderGeometry(0.33, 0.33, 0.05, 16).rotateX(Math.PI / 2).translate(x, 1.65, r.z0 + 0.04);
    out.dark.geo(disc, H(c));
    out.dark.geo(new THREE.SphereGeometry(0.08, 8, 6).scale(1, 1, 0.6).translate(x, 1.65, r.z0 + 0.07), H(0xf0c04a));
    out.dark.box(x - 0.33, 1.62, r.z0 + 0.065, x + 0.33, 1.68, r.z0 + 0.075, { color: H(0xf6f2e6) }, 0b111111);
  }
}

function logs(out: YardOut): void {
  const l = YARD.logs;
  const r = 0.115;
  const len = l.z1 - l.z0 - 0.02;
  const zc = (l.z0 + l.z1) / 2;
  let row = 0;
  for (let n = 7; n >= 4; n--, row++) {
    const y = r + row * r * 1.72;
    const x0 = (l.x0 + l.x1) / 2 - ((n - 1) * r * 2.05) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * r * 2.05;
      const rr = r * (0.88 + ((i * 7 + row * 3) % 4) * 0.05);
      out.dark.geo(new THREE.CylinderGeometry(rr, rr, len, 8, 1, true).rotateX(Math.PI / 2).translate(x, y, zc), BARK);
      out.dark.geo(new THREE.CircleGeometry(rr, 8).translate(x, y, zc + len / 2), END);
    }
  }
}

function flowers(out: YardOut): void {
  for (const f of [YARD.flowersW, YARD.flowersE]) {
    out.dark.box(f.x0, f.y0, f.z0, f.x1, f.y0 + 0.24, f.z1, { color: WOOD }, 0b111111);
    out.dark.box(f.x0 - 0.02, f.y0 + 0.2, f.z0 - 0.02, f.x1 + 0.02, f.y0 + 0.26, f.z1 + 0.01, { color: WOOD_D }, 0b111111);
    const n = Math.round((f.x1 - f.x0) / 0.16);
    for (let i = 0; i < n; i++) {
      const x = f.x0 + 0.08 + i * ((f.x1 - f.x0 - 0.16) / (n - 1));
      const zz = (f.z0 + f.z1) / 2 + ((i % 3) - 1) * 0.06;
      out.dark.geo(new THREE.IcosahedronGeometry(0.11, 0).scale(1, 0.75, 1).translate(x, f.y0 + 0.3, zz), GREEN.clone().multiplyScalar(0.85 + (i % 2) * 0.2));
      if (i % 2 === 0) out.dark.geo(new THREE.IcosahedronGeometry(0.06, 0).translate(x + 0.03, f.y0 + 0.42 + (i % 4) * 0.02, zz - 0.04), FLOWERS[(i / 2) % FLOWERS.length]);
    }
  }
}

/** Фонарь (у «горла», на столбе) или факел на стене: железо, стекло со светом, огонь и ореол */
function light(out: YardOut, fx: CastleFx, l: Light): void {
  const ph = l.x * 1.7 + l.z * 0.9;
  if (l.kind === 'torch') {
    // держатель в стене, палка наклонена наружу, на конце — обмотка и огонь
    const base = new THREE.Vector3(l.x, l.y - 0.25, l.z);
    const tip = new THREE.Vector3(l.x + l.nx * 0.24, l.y + 0.18, l.z + l.nz * 0.24);
    out.dark.box(l.x - 0.07 + l.nx * 0.0, l.y - 0.38, l.z - 0.07, l.x + 0.07, l.y - 0.12, l.z + 0.07, { color: IRON }, 0b111111);
    rod(out.dark, base, tip, 0.035, WOOD_D);
    out.dark.geo(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 8).translate(tip.x, tip.y, tip.z), H(0x3a2a1c));
    fx.addStatic(tip.x, tip.y + 0.2, tip.z, 0.48, FLAME, 0.95, 0, ph, 1.5);
    fx.addStatic(tip.x, tip.y + 0.15, tip.z, 2.0, HALO, 0.28, 1, ph + 1);
    return;
  }
  const cx = l.kind === 'post' ? l.x : l.x + l.nx * 0.0;
  const cz = l.kind === 'post' ? l.z : l.z + l.nz * 0.0;
  const y0 = l.y - 0.2;
  const y1 = l.y + 0.2;
  if (l.kind === 'lantern') {
    // кронштейн из стены и крюк
    const wallZ = l.z - l.nz * 0.24;
    rod(out.dark, new THREE.Vector3(cx, y1 + 0.22, wallZ), new THREE.Vector3(cx, y1 + 0.22, cz), 0.025, IRON);
    rod(out.dark, new THREE.Vector3(cx, y1 + 0.22, wallZ), new THREE.Vector3(cx, y1 - 0.12, wallZ), 0.02, IRON);
    rod(out.dark, new THREE.Vector3(cx, y1 + 0.22, cz), new THREE.Vector3(cx, y1 + 0.08, cz), 0.012, IRON);
  }
  const s = 0.13;
  // стекло, рамка, крыша-пирамидка и донце
  out.glow.box(cx - s + 0.01, y0 + 0.03, cz - s + 0.01, cx + s - 0.01, y1 - 0.03, cz + s - 0.01, { color: GLASS }, 0b110011);
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) out.dark.box(cx + dx * s - 0.017, y0, cz + dz * s - 0.017, cx + dx * s + 0.017, y1, cz + dz * s + 0.017, { color: IRON }, 0b110011);
  out.dark.box(cx - s - 0.02, y0 - 0.03, cz - s - 0.02, cx + s + 0.02, y0 + 0.02, cz + s + 0.02, { color: IRON }, 0b111111);
  out.dark.geo(new THREE.ConeGeometry(s * 1.55, 0.14, 4).rotateY(Math.PI / 4).translate(cx, y1 + 0.06, cz), IRON);
  out.dark.geo(new THREE.SphereGeometry(0.025, 6, 4).translate(cx, y1 + 0.15, cz), IRON);
  fx.addStatic(cx, l.y - 0.02, cz, 0.2, FLAME, 1, 0, ph, 1.35);
  fx.addStatic(cx, l.y, cz, 1.35, HALO, 0.3, 1, ph + 0.5);
}
