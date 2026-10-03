// Стены замка из боксов карты: тёплый песчаник кладки, светлый тёсаный камень бруствера и зубцов с «шапками»,
// мощёный ход по стенам, цоколь у земли, карниз с кронштейнами под бруствером, угловые камни, бойницы, плющ, ниши в
// стенах проезда (в них ложатся открытые створки), замковый камень над воротами. Коллизия — те же боксы: вид лежит
// точно на них, выступы — сантиметры и только наружу (не в проём, не на ход по стене).
import * as THREE from 'three';
import { LADDERS } from '../../../shared/fortladder.ts';
import { GATE, PARAPET_H, PEDESTAL, TERRACE, THROAT_Z, WALL_H, type FortMap } from '../../../shared/fortmap.ts';
import type { MapBox } from '../../../shared/maps/types.ts';
import { Bucket, subtract, type Axis, type Rect } from './geo.ts';
import { GATEHOUSE, NICHE } from './layout.ts';

type Kind = 'wall' | 'arch' | 'terrace' | 'parapet' | 'merlon' | 'stair' | 'rail' | 'pedestal' | 'crate' | 'skip';

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

function kindOf(b: MapBox, i: number, map: FortMap): Kind {
  if (i === map.gateBox || b.mat === 'invisible' || b.mat === 'deck') return 'skip';
  if (b.mat === 'brick') return b.min[1] > 0.1 ? 'arch' : near(b.max[1], TERRACE.h) ? 'terrace' : 'wall';
  if (b.mat === 'concrete') {
    if (near(b.min[1], WALL_H + PARAPET_H)) return 'merlon';
    if (near(b.min[1], WALL_H)) return 'parapet';
    if (near(b.min[1], TERRACE.h)) return 'rail';
    if (near(b.min[0], PEDESTAL.x0) && near(b.min[2], PEDESTAL.z0)) return 'pedestal';
    // колодец (двор) рисует мир крепости — круглым срубом
    if (near(b.min[0], -9.4) && near(b.min[2], -2.4)) return 'skip';
    return b.min[1] < 0.01 ? 'stair' : 'skip';
  }
  if (b.mat === 'wood' && b.variant !== undefined) return 'crate';
  return 'skip';
}

export interface MasonryOut {
  /** кладка (текстура песчаника) */
  stone: Bucket;
  /** тёсаный камень: бруствер, зубцы, шапки, карниз, кронштейны, угловые камни, ступени, ход по стене */
  trim: Bucket;
  /** без текстуры: щели бойниц */
  dark: Bucket;
  /** плющ (своя текстура с прозрачностью) */
  ivy: Bucket;
  /** перемычка над воротами — отдельно: трясётся, когда босс протискивается */
  archStone: Bucket;
  archTrim: Bucket;
  /** ящики во дворе (у них своя текстура) */
  crates: MapBox[];
}

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const WALL = C(1, 0.98, 0.94);
const PLINTH = C(0.8, 0.73, 0.64);
const NICHE_C = C(0.72, 0.66, 0.58);
const SOFFIT = C(0.74, 0.67, 0.58);
const TRIM = C(1, 0.98, 0.93);
const CAP = C(1.07, 1.05, 1.0);
const PAVE = C(0.9, 0.84, 0.75);
const CORNICE = C(1.02, 0.98, 0.9);
const CORBEL = C(0.94, 0.89, 0.8);
const QUOIN = C(1.06, 1.02, 0.94);
const STEP = C(0.94, 0.9, 0.83);
const SLIT = C(0.16, 0.12, 0.1);
const IVY = C(1, 1, 1);

interface Face {
  axis: Axis;
  sign: number;
  c: number;
  rect: Rect;
  /** где грань: снаружи крепости, во дворе, в «горле» или проезде */
  side: 'outer' | 'inner' | 'throat';
  box: MapBox;
}

/** Бойницы снаружи: x, z — точка на грани, n — её нормаль */
const SLITS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-19.6, -19, 0, -1], [-15.9, -19, 0, -1], [19.6, -19, 0, -1], [15.9, -19, 0, -1],
  [-21, -17.4, -1, 0], [-21, -14.8, -1, 0], [21, -17.4, 1, 0], [21, -14.8, 1, 0],
  [-15, -17.6, 1, 0], [15, -17.6, -1, 0],
  [-6, -17.25, -1, 0], [6, -17.25, 1, 0],
  [-10.5, -16, 0, -1], [10.5, -16, 0, -1], [-14, -16, 0, -1], [14, -16, 0, -1],
  [-18, -11.6, -1, 0], [18, -11.6, 1, 0], [-18, 1.6, -1, 0], [18, 1.6, 1, 0], [-18, 8, -1, 0], [18, 8, 1, 0],
  [-8.5, 14, 0, 1], [8.5, 14, 0, 1], [-3.5, 14, 0, 1], [3.5, 14, 0, 1],
];

/** Плющ: грань (ось, знак, координата), по грани a0…a1, высота до top */
const IVY_PATCHES: ReadonlyArray<readonly [Axis, number, number, number, number, number]> = [
  ['z', 1, -13, -13.3, -10.5, 2.9],
  ['x', 1, -15, 2.7, 5.9, 2.6],
  ['x', -1, 15, -3.6, -0.9, 2.4],
  ['z', -1, 11, -14.7, -11.2, 3.1],
  ['z', -1, 11, 11.0, 14.6, 2.7],
  ['z', 1, 14, -6.2, -4.0, 2.8],
  ['z', 1, 14, 4.6, 7.6, 2.3],
  ['x', -1, -6, -18.4, -16.6, 1.3],
  ['x', 1, 6, -18.4, -16.6, 1.2],
];

export function buildMasonry(map: FortMap): MasonryOut {
  const out: MasonryOut = { stone: new Bucket(), trim: new Bucket(), dark: new Bucket(), ivy: new Bucket(), archStone: new Bucket(), archTrim: new Bucket(), crates: [] };
  const kinds = map.boxes.map((b, i) => kindOf(b, i, map));
  const solids = map.boxes.filter((_, i) => ['wall', 'arch', 'terrace', 'stair'].includes(kinds[i]));
  const faces: Face[] = [];

  map.boxes.forEach((b, i) => {
    const k = kinds[i];
    if (k === 'wall' || k === 'arch' || k === 'terrace') wallBox(b, k, solids, out, faces);
    else if (k === 'parapet') parapet(b, out.trim);
    else if (k === 'merlon') merlon(b, out.trim);
    else if (k === 'stair' || k === 'rail') out.trim.box(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], { su: 2, sv: 2, color: STEP, ao: k === 'stair' ? 0.7 : 1 });
    else if (k === 'pedestal') out.trim.box(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], { su: 2, sv: 2, color: CAP, ao: 0.72 });
    else if (k === 'crate') out.crates.push(b);
  });

  for (const f of faces) decorate(f, out);
  corners(faces, out);
  slits(out);
  ivy(out);
  lintel(out);
  return out;
}

/** Грани стены: видимые части (минус соседние боксы), ниши проезда, верх — мощение, низ перемычки — свод. */
function wallBox(b: MapBox, k: Kind, solids: readonly MapBox[], out: MasonryOut, faces: Face[]): void {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  const stone = k === 'arch' ? out.archStone : out.stone;
  const sides: Array<[Axis, number, number, number, number]> = [
    ['x', 1, x1, z0, z1],
    ['x', -1, x0, z0, z1],
    ['z', 1, z1, x0, x1],
    ['z', -1, z0, x0, x1],
  ];
  for (const [axis, sign, c, a0, a1] of sides) {
    const holes: Rect[] = [];
    const ai = axis === 'x' ? 0 : 2;
    const bi = axis === 'x' ? 2 : 0;
    const probe = c + sign * 1e-3;
    for (const s of solids) {
      if (s === b) continue;
      if (!(s.min[ai] < probe && s.max[ai] > probe)) continue;
      holes.push({ a0: s.min[bi], a1: s.max[bi], b0: s.min[1], b1: s.max[1] });
    }
    for (const r of subtract({ a0, a1, b0: y0, b1: y1 }, holes)) {
      const passage = k === 'wall' && axis === 'x' && near(Math.abs(c), GATE.x1) && r.a0 >= GATE.face - 0.01 && r.a1 <= GATE.face + 3.01;
      if (passage) {
        niche(sign, c, r, out.stone);
        continue;
      }
      stone.face(axis, sign, c, r.a0, r.a1, r.b0, r.b1, { color: WALL, ao: r.b0 < 0.01 ? 0.62 : 1 });
      const mid = (r.a0 + r.a1) / 2;
      const px = axis === 'x' ? c + sign * 0.6 : mid;
      const pz = axis === 'z' ? c + sign * 0.6 : mid;
      const side: Face['side'] = Math.abs(px) < GATE.x1 && pz > THROAT_Z && pz < GATE.face + 3 ? 'throat' : px > -15 && px < 15 && pz > -13 && pz < 11 ? 'inner' : 'outer';
      if (k !== 'arch') faces.push({ axis, sign, c, rect: r, side, box: b });
    }
  }
  // ход по стене и верх террасы — мощение
  out.trim.face('y', 1, y1, x0, x1, z0, z1, { su: 2.4, color: PAVE });
  if (y0 > 0.01) stone.face('y', -1, y0, x0, x1, z0, z1, { color: SOFFIT });
}

/** Ниша в стене проезда: полоски стены до и после, задняя стенка глубже, боковые откосы и потолок ниши */
function niche(sign: number, c: number, r: Rect, stone: Bucket): void {
  const s = Math.sign(c);
  const back = s * NICHE.x;
  const h = NICHE.h;
  stone.face('x', sign, c, r.a0, NICHE.z0, r.b0, r.b1, { color: WALL, ao: 0.62 });
  stone.face('x', sign, c, NICHE.z1, r.a1, r.b0, r.b1, { color: WALL, ao: 0.62 });
  stone.face('x', sign, back, NICHE.z0, NICHE.z1, 0, h, { color: NICHE_C, ao: 0.55 });
  const xa = Math.min(c, back);
  const xb = Math.max(c, back);
  stone.face('z', 1, NICHE.z0, xa, xb, 0, h, { color: NICHE_C, ao: 0.55 });
  stone.face('z', -1, NICHE.z1, xa, xb, 0, h, { color: NICHE_C, ao: 0.55 });
  stone.face('y', -1, h, xa, xb, NICHE.z0, NICHE.z1, { color: SOFFIT });
  // над нишей до верха стены — обычная кладка (там перемычка, она закрывает)
  if (r.b1 > h + 0.01) stone.face('x', sign, c, NICHE.z0, NICHE.z1, h, r.b1, { color: WALL });
}

/** Бруствер: без верха (вместо него — шапка шире на 4,5 см по сторонам), стороны — тёсаный камень */
function parapet(b: MapBox, trim: Bucket): void {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  trim.box(x0, y0, z0, x1, y1, z1, { su: 2, sv: 2, color: TRIM }, 0b110011);
  const alongX = x1 - x0 > z1 - z0;
  const e = 0.045;
  // у шапок вдоль x и вдоль z верх на миллиметр разный — на углах не мерцает
  const top = alongX ? y1 : y1 - 0.0015;
  trim.box(x0 - (alongX ? 0 : e), y1 - 0.08, z0 - (alongX ? e : 0), x1 + (alongX ? 0 : e), top, z1 + (alongX ? e : 0), { su: 2, sv: 2, color: CAP });
}

/** Зубец с шапкой */
function merlon(b: MapBox, trim: Bucket): void {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  trim.box(x0, y0, z0, x1, y1, z1, { su: 2, sv: 2, color: TRIM }, 0b110011);
  const e = 0.04;
  trim.box(x0 - e, y1 - 0.08, z0 - e, x1 + e, y1, z1 + e, { su: 2, sv: 2, color: CAP });
}

/** Полоса на грани наружу: from — высота низа, to — верха, out — вынос, ends — продлить на вынос на концах */
function band(trim: Bucket, f: Face, a0: number, a1: number, y0: number, y1: number, outw: number, color: THREE.Color, bottom = false): void {
  const { axis, sign, c } = f;
  const o = c + sign * outw;
  const lo = Math.min(c, o);
  const hi = Math.max(c, o);
  // верх у полос на гранях по x и по z на 2 мм разный — на углах не мерцает
  const top = axis === 'x' ? y1 : y1 - 0.002;
  const mask = 0b111111 & ~(bottom ? 0 : 8);
  if (axis === 'x') trim.box(lo, y0, a0, hi, top, a1, { su: 2, sv: 2, color }, mask);
  else trim.box(a0, y0, lo, a1, top, hi, { su: 2, sv: 2, color }, mask);
}

/** Где на грани нельзя карниз и кронштейны: у лестниц с луга и под консолями надвратной башни */
function cuts(f: Face): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const l of LADDERS) {
    const onFace = f.axis === 'x' ? near(l.x, f.c) && l.nx === f.sign : near(l.z, f.c) && l.nz === f.sign;
    if (!onFace) continue;
    const m = f.axis === 'x' ? l.z : l.x;
    out.push([m - l.w - 0.35, m + l.w + 0.35]);
  }
  if (f.axis === 'z' && near(f.c, THROAT_Z)) {
    out.push([-GATEHOUSE.sx1 - 0.15, -GATEHOUSE.sx0 + 0.05], [GATEHOUSE.sx0 - 0.05, GATEHOUSE.sx1 + 0.15]);
  }
  return out;
}

function minus(a0: number, a1: number, cut: Array<[number, number]>): Array<[number, number]> {
  let spans: Array<[number, number]> = [[a0, a1]];
  for (const [c0, c1] of cut) {
    const next: Array<[number, number]> = [];
    for (const [s0, s1] of spans) {
      if (c1 <= s0 || c0 >= s1) next.push([s0, s1]);
      else {
        if (c0 > s0) next.push([s0, c0]);
        if (c1 < s1) next.push([c1, s1]);
      }
    }
    spans = next;
  }
  return spans.filter(([s0, s1]) => s1 - s0 > 0.05);
}

/**
 * Продлить полосу за конец грани (на выпуклом углу — чтобы полосы сошлись)? Нет — у входа в «горло» и выхода из
 * проезда: там полоса торчала бы в проём.
 */
function ext(f: Face, a: number, d: number): number {
  const x = f.axis === 'x' ? f.c : a;
  const z = f.axis === 'z' ? f.c : a;
  const throat = Math.abs(x) <= GATE.x1 + 0.01 && z >= THROAT_Z - 0.01 && z <= GATE.face + 3.01;
  return throat ? 0 : d;
}

/** Цоколь у земли, карниз с кронштейнами под бруствером (снаружи) */
function decorate(f: Face, out: MasonryOut): void {
  const r = f.rect;
  if (f.side === 'throat') return;
  const terrace = near(f.box.max[1], TERRACE.h);
  const P = terrace ? 0.06 : 0.09;
  if (r.b0 < 0.01) {
    // цоколь: на гранях по x и по z разной высоты (на углах — ступенька в сантиметр, не мерцание)
    const h = (terrace ? 0.38 : 0.55) + (f.axis === 'z' ? 0.015 : 0);
    band(out.stone, f, r.a0 - ext(f, r.a0, P), r.a1 + ext(f, r.a1, P), 0, h, P, PLINTH);
  }
  if (terrace) {
    if (near(r.b1, TERRACE.h)) band(out.trim, f, r.a0 - 0.06, r.a1 + 0.06, TERRACE.h - 0.16, TERRACE.h, 0.06, CORNICE, true);
    return;
  }
  if (f.side !== 'outer' || !near(r.b1, WALL_H)) return;
  const spans = minus(r.a0 - ext(f, r.a0, 0.13), r.a1 + ext(f, r.a1, 0.13), cuts(f));
  for (const [s0, s1] of spans) {
    band(out.trim, f, s0, s1, WALL_H - 0.26, WALL_H, 0.13, CORNICE, true);
    // кронштейны через ~1,15 м
    const len = s1 - s0 - 0.5;
    const n = Math.max(0, Math.floor(len / 1.15) + 1);
    const step = n > 1 ? len / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const m = n > 1 ? s0 + 0.25 + i * step : (s0 + s1) / 2;
      band(out.trim, f, m - 0.12, m + 0.12, WALL_H - 0.42, WALL_H - 0.26, 0.11, CORBEL, true);
      band(out.trim, f, m - 0.08, m + 0.08, WALL_H - 0.56, WALL_H - 0.42, 0.06, CORBEL, true);
    }
  }
}

/** Угловые камни на выпуклых углах снаружи (бастионы, воротные башни, углы крепости) */
function corners(faces: readonly Face[], out: MasonryOut): void {
  const outer = faces.filter((f) => f.side === 'outer' && f.rect.b0 < 0.01 && near(f.rect.b1, WALL_H));
  const done = new Set<string>();
  for (const fx of outer) {
    if (fx.axis !== 'x') continue;
    for (const fz of outer) {
      if (fz.axis !== 'z' || fz.box !== fx.box) continue;
      // общий угол: x-грань на x = fx.c, z-грань на z = fz.c; угол должен быть концом обеих видимых частей
      const zEnd = near(fx.rect.a0, fz.c) || near(fx.rect.a1, fz.c);
      const xEnd = near(fz.rect.a0, fx.c) || near(fz.rect.a1, fx.c);
      if (!zEnd || !xEnd) continue;
      const key = `${fx.c},${fz.c}`;
      if (done.has(key)) continue;
      done.add(key);
      // внутрь по грани: от угла вдоль x-грани — к центру бокса по z, вдоль z-грани — по x
      const dz = near(fx.rect.a0, fz.c) ? 1 : -1;
      const dx = near(fz.rect.a0, fx.c) ? 1 : -1;
      const o = 0.035;
      for (let k = 0; k < 5; k++) {
        const y0 = 0.6 + k * 0.5;
        const la = k % 2 ? 0.34 : 0.56;
        const lb = k % 2 ? 0.56 : 0.34;
        const xa = fx.c + fx.sign * o;
        const xb = fx.c + dx * lb;
        const za = fz.c + fz.sign * o;
        const zb = fz.c + dz * la;
        out.trim.box(Math.min(xa, xb), y0 + 0.01, Math.min(za, zb), Math.max(xa, xb), y0 + 0.49, Math.max(za, zb), { su: 2, sv: 2, color: QUOIN }, 0b111111);
      }
    }
  }
}

/** Бойницы: тёмная щель в светлой рамке */
function slits(out: MasonryOut): void {
  const y0 = 1.45;
  const y1 = 2.35;
  for (const [x, z, nx, nz] of SLITS) {
    const ax = nx !== 0;
    const c = ax ? x : z;
    const m = ax ? z : x;
    const s = ax ? nx : nz;
    const axis: Axis = ax ? 'x' : 'z';
    const f = (a0: number, a1: number, b0: number, b1: number, depth: number, color: THREE.Color, bucket: Bucket) => {
      const o = c + s * depth;
      if (ax) bucket.box(Math.min(c, o), b0, a0, Math.max(c, o), b1, a1, { su: 2, sv: 2, color }, 0b111111);
      else bucket.box(a0, b0, Math.min(c, o), a1, b1, Math.max(c, o), { su: 2, sv: 2, color }, 0b111111);
    };
    f(m - 0.17, m + 0.17, y0 - 0.1, y0, 0.035, TRIM, out.trim);
    f(m - 0.17, m + 0.17, y1, y1 + 0.12, 0.035, TRIM, out.trim);
    f(m - 0.17, m - 0.08, y0, y1, 0.03, TRIM, out.trim);
    f(m + 0.08, m + 0.17, y0, y1, 0.03, TRIM, out.trim);
    out.dark.face(axis, s, c + s * 0.012, m - 0.08, m + 0.08, y0, y1, { color: SLIT });
  }
}

/** Плющ: наклейки на грани (чуть впереди), снизу гуще */
function ivy(out: MasonryOut): void {
  for (const [axis, sign, c, a0, a1, top] of IVY_PATCHES) {
    if (axis === 'y') continue;
    out.ivy.decal(axis, sign, c + sign * 0.025, a0, a1, 0, top, IVY);
  }
}

/** Перемычка над воротами: клинчатые камни через один светлее, замковый камень с выносом (низ — ровно по проёму) */
function lintel(out: MasonryOut): void {
  const z = GATE.face;
  const y0 = GATE.h;
  const y1 = WALL_H;
  const n = 11;
  const w = (GATE.x1 - GATE.x0) / n;
  for (let i = 0; i < n; i++) {
    if (i === 5) continue;
    const xa = GATE.x0 + i * w + 0.02;
    const xb = xa + w - 0.04;
    const light = i % 2 === 0;
    out.archTrim.box(xa, y0 + 0.02, z - 0.025, xb, y1 - 0.03, z, { su: 2, sv: 2, color: light ? CAP : CORBEL }, 0b111111);
  }
  // замковый камень: шире кверху (две ступени), чуть выше хода по стене спереди
  out.archTrim.box(-0.26, y0, z - 0.08, 0.26, y1 + 0.06, z, { su: 2, sv: 2, color: QUOIN }, 0b111111);
  out.archTrim.box(-0.34, y1 - 0.14, z - 0.1, 0.34, y1 + 0.1, z - 0.02, { su: 2, sv: 2, color: CAP }, 0b111111);
  // со двора — скромнее
  const zb = GATE.face + 3;
  out.archTrim.box(-0.24, y0, zb, 0.24, y1, zb + 0.05, { su: 2, sv: 2, color: QUOIN }, 0b111111);
}
