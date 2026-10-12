// Мир «Портового кольца» вокруг дороги: порт в ясный полдень. Суша — один контур вокруг дороги (бетонная плита
// с тёплой плиткой, стенки причалов до воды с кранцами), на ней штабеля контейнеров, склады, резервуары, портальные
// краны, мелочь (бочки, поддоны, барабаны, бытовки), портал старта с вывеской, фонари, клумбы вдоль старта,
// трибуна на сваях над водой со зрителями-желейками, флаги по причалу; дальний берег — город, холмы и маяк.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import { CRANE_HALF_X, type Ring, type Shed, type Tank } from '../../shared/maps/ring.ts';
import { landHas } from '../../shared/maps/ringland.ts';
import type { Deco } from '../../shared/maps/types.ts';
import { makeRng } from '../../shared/math.ts';
import { locateAny, makeLoc, type Track } from '../../shared/track.ts';
import { addBox, buildGeo, craneGeometry, paint, parts, place, staticMesh, type V3 } from '../render/kit.ts';
import * as tex from '../render/textures.ts';
import { buildGrandstand, type Festive } from './crowd.ts';
import { face, same } from './geom.ts';
import { arrowSignTexture } from './racetex.ts';
import { WALL_NONE, type EdgeLayout } from './trackgeo.ts';

/** Фонари вдоль прямых: первый через столько метров от начала прямой, дальше — с шагом */
const LAMP_FIRST = 6;
const LAMP_EVERY = 24;
/** Контейнеры: длина 40-футового, 20-футового, ширина, высота; шаг колонок, проход между блоками, зазор торцов */
const BOX_L = 12.19;
const BOX_S = 6.06;
const BOX_W = 2.44;
const BOX_H = 2.59;
const COL_STEP = 2.52;
const AISLE = 3.4;
const END_GAP = 0.9;
export const CONTAINER_COLORS = [0xb8503a, 0x3f7fae, 0x4c8a5a, 0xd88a3a, 0xc9a84a, 0x8a9298, 0xe2dccb, 0x3f62a0, 0x9a5a8a, 0x4a9a9a];

export interface HarborCtx {
  scene: THREE.Scene;
  ring: Ring;
  track: Track;
  rx: Float64Array;
  rz: Float64Array;
  layout: EdgeLayout;
  /** Статика с вершинными цветами (склеивается миром) */
  solid: THREE.BufferGeometry[];
  /** Декор карты (кнехты, бочки, лодки, буи) — мир строит его общим кодом */
  deco: Deco[];
  festive: Festive;
  /** Цвет дымки у горизонта (дальний берег «запечён» в неё) */
  haze: THREE.Color;
  lite: boolean;
}

export class HarborScene {
  private readonly c: HarborCtx;
  private readonly tr: Track;
  /** Занятые места на суше (для мелочи): x, z, радиус */
  private readonly taken: Array<[number, number, number]> = [];
  private readonly toAxisLoc = makeLoc();

  constructor(c: HarborCtx) {
    this.c = c;
    this.tr = c.track;
    this.buildLand();
    this.buildContainers();
    for (const s of c.ring.deco.sheds) this.shed(s);
    for (const t of c.ring.deco.tanks) this.tank(t);
    for (const k of c.ring.deco.cranes) c.solid.push(craneGeometry(k.x, 0, k.z, k.yaw, 1));
    this.buildStand();
    this.buildPlanters();
    this.buildClutter();
    this.buildGantry();
    this.buildLamps();
    this.buildSigns();
    for (const d of c.ring.deco.water) c.deco.push(d);
    this.buildFarShore();
  }

  /**
   * Высота земли под краем дороги: плита суши на нуле. У открытого края (вода) — тоже ноль: там стенка причала —
   * часть суши, «юбка» дороги нужна только над плитой (кикер, трамплины).
   */
  ground(_x: number, _z: number): number {
    return 0;
  }

  // ------------------------------------------------------------ помощники

  private edge(i: number, sd: number, off: number, y: number): V3 {
    const tr = this.tr;
    const lat = sd * (tr.hw[i] + off);
    return [tr.px[i] + this.c.rx[i] * lat, y, tr.pz[i] + this.c.rz[i] * lat];
  }

  private out(i: number, sd: number): number {
    return (sd > 0 ? this.c.layout.outR : this.c.layout.outL)[i];
  }

  private onLand(x: number, z: number): boolean {
    return landHas(this.c.ring.land, x, z);
  }

  private toAxis(x: number, z: number): number {
    const tr = this.tr;
    let best = Infinity;
    for (let i = 0; i < tr.n; i++) {
      const dx = tr.tx[i] * tr.len[i];
      const dz = tr.tz[i] * tr.len[i];
      const t = Math.max(0, Math.min(1, ((x - tr.px[i]) * dx + (z - tr.pz[i]) * dz) / (tr.len[i] * tr.len[i])));
      best = Math.min(best, Math.hypot(x - tr.px[i] - dx * t, z - tr.pz[i] - dz * t));
    }
    return best;
  }

  /** Дальше от внешнего края ограждения, чем на gap метров */
  private clearOfRoad(x: number, z: number, gap: number): boolean {
    const l = locateAny(this.tr, x, z, this.toAxisLoc);
    const out = l.lat > 0 ? this.c.layout.outR[l.seg] : this.c.layout.outL[l.seg];
    return Math.abs(l.lat) > l.hw + out + gap || this.toAxis(x, z) > this.tr.half + gap + 40;
  }

  private box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0): void {
    this.c.solid.push(place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry));
  }

  // ------------------------------------------------------------ суша

  /** Плита суши по контуру (тёплая плитка со швами), стенки причалов до воды с мокрой полосой, кранцы, кнехты. */
  private buildLand(): void {
    const land = this.c.ring.land;
    const poly = land.poly;
    const m = land.count;
    const contour: THREE.Vector2[] = [];
    for (let k = 0; k < m; k++) contour.push(new THREE.Vector2(poly[k * 2], poly[k * 2 + 1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const pos: number[] = [];
    const uv: number[] = [];
    for (const v of contour) {
      pos.push(v.x, 0, v.y);
      uv.push(v.x / 4, -v.y / 4);
    }
    const idx: number[] = [];
    for (const [a, b, c] of tris) {
      const cross = (contour[b].y - contour[a].y) * (contour[c].x - contour[a].x) - (contour[b].x - contour[a].x) * (contour[c].y - contour[a].y);
      if (cross > 0) idx.push(a, b, c);
      else idx.push(a, c, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // плитка теплее и светлее: песочно-кремовая
    const tint = new THREE.Color(1.08, 1.02, 0.9);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(contour.flatMap(() => [tint.r, tint.g, tint.b]), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex.deckTexture(), vertexColors: true, roughness: 0.93 }));
    top.receiveShadow = true;
    this.c.scene.add(top);

    const wall = parts();
    const dry = new THREE.Color(0xd2ccbf);
    const wet = new THREE.Color(0x5e6656);
    const deep = new THREE.Color(0x26302e);
    const wetY = WATER_Y + 0.45;
    const botY = WATER_Y - 2.5;
    let run = 0;
    for (let k = 0; k < m; k++) {
      const ax = poly[k * 2];
      const az = poly[k * 2 + 1];
      const bx = poly[((k + 1) % m) * 2];
      const bz = poly[((k + 1) % m) * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const nrm: V3 = [nx, 0, nz];
      const ua = (ax + az) / 2;
      const ub = ua + len / 2;
      face(wall, [ax, wetY, az], [bx, wetY, bz], [bx, 0, bz], [ax, 0, az], nrm, [ua, wetY / 2, ub, wetY / 2, ub, 0, ua, 0], [wet, wet, dry, dry]);
      face(wall, [ax, botY, az], [bx, botY, bz], [bx, wetY, bz], [ax, wetY, az], nrm, [ua, botY / 2, ub, botY / 2, ub, wetY / 2, ua, wetY / 2], [deep, deep, wet, wet]);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      let d = 9 - (run % 9);
      for (; d < len; d += 9) {
        const x = ax + dx * d;
        const z = az + dz * d;
        const ry = Math.atan2(nx, nz);
        this.c.solid.push(place(paint(new THREE.BoxGeometry(0.55, 1.5, 0.3), 0x232528), x + nx * 0.15, -0.85, z + nz * 0.15, ry));
        if (this.clearOfRoad(x, z, 1.4) && Math.round((run + d) / 9) % 2 === 0) this.c.deco.push({ kind: 'bollard', x: x - nx * 0.55, z: z - nz * 0.55 });
      }
      run += len;
    }
    this.c.scene.add(staticMesh(buildGeo(wall), new THREE.MeshStandardMaterial({ map: tex.concreteTexture(), vertexColors: true, roughness: 0.95 }), false));
  }

  // ------------------------------------------------------------ порт

  private buildContainers(): void {
    const cont = parts();
    const rng = makeRng(31);
    for (const y of this.c.ring.deco.yards) {
      const z = y.alongZ;
      const a0 = z ? y.x0 : y.z0;
      const a1 = z ? y.x1 : y.z1;
      const b0 = z ? y.z0 : y.x0;
      const b1 = z ? y.z1 : y.x1;
      for (let a = a0 + 0.3; a + COL_STEP * 3 <= a1 + 0.01; a += COL_STEP * 3 + AISLE) {
        for (let col = 0; col < 3; col++) {
          const ca = a + col * COL_STEP;
          for (let b = b0 + 0.3; b + BOX_L <= b1 + 0.01; b += BOX_L + END_GAP) {
            if (rng() < 0.12) continue;
            const levels = 1 + Math.floor(rng() * rng() * 4.6);
            for (let l = 0; l < levels; l++) {
              const halves = rng() < 0.18 ? [[b, b + BOX_S], [b + BOX_L - BOX_S, b + BOX_L]] : [[b, b + BOX_L]];
              for (const [s0, s1] of halves) {
                const y0 = l * BOX_H;
                const min = z ? [ca, y0, s0] : [s0, y0, ca];
                const max = z ? [ca + BOX_W, y0 + BOX_H, s1] : [s1, y0 + BOX_H, ca + BOX_W];
                addBox(cont, { min, max, color: CONTAINER_COLORS[Math.floor(rng() * CONTAINER_COLORS.length)], variant: Math.floor(rng() * 7) }, 'container', rng, 0.01);
              }
            }
          }
        }
      }
    }
    if (cont.idx.length) {
      this.c.scene.add(staticMesh(buildGeo(cont), new THREE.MeshStandardMaterial({ map: tex.containerTexture(), vertexColors: true, roughness: 0.6, metalness: 0.15 }), true));
    }
  }

  private shed(s: Shed): void {
    const len = s.alongZ ? s.z1 - s.z0 : s.x1 - s.x0;
    const wid = s.alongZ ? s.x1 - s.x0 : s.z1 - s.z0;
    const pitch = 0.2;
    const list: THREE.BufferGeometry[] = [];
    list.push(place(paint(new THREE.BoxGeometry(len, s.h, wid), new THREE.Color(s.color)), 0, s.h / 2, 0));
    const slope = wid / 2 / Math.cos(pitch) + 0.6;
    const rise = (wid / 4) * Math.tan(pitch);
    for (const sd of [-1, 1]) list.push(place(paint(new THREE.BoxGeometry(len + 1.2, 0.22, slope), 0x9aa0a8), 0, s.h + rise + 0.1, (sd * wid) / 4, 0, sd * pitch));
    list.push(place(paint(new THREE.BoxGeometry(len + 1.2, 0.3, 0.5), 0x70757c), 0, s.h + rise * 2 + 0.2, 0));
    const doors = Math.max(2, Math.floor(len / 16));
    for (let k = 0; k < doors; k++) {
      const x = -len / 2 + (len * (k + 0.5)) / doors;
      for (const sd of [-1, 1]) {
        list.push(place(paint(new THREE.BoxGeometry(5, 4.2, 0.2), 0x4f6f8a), x, 2.1, (sd * wid) / 2 + sd * 0.05));
        list.push(place(paint(new THREE.BoxGeometry(5.4, 0.3, 0.3), 0xe2b33c), x, 4.35, (sd * wid) / 2 + sd * 0.1));
      }
    }
    const g = mergeGeometries(list, false)!;
    if (s.alongZ) g.rotateY(Math.PI / 2);
    g.translate((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
    this.c.solid.push(g);
    this.taken.push([(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, Math.max(len, wid) / 2 + 1]);
  }

  private tank(t: Tank): void {
    const list: THREE.BufferGeometry[] = [];
    list.push(place(paint(new THREE.CylinderGeometry(t.r + 0.5, t.r + 0.6, 0.4, 32), 0x8e8a82), t.x, 0.2, t.z));
    list.push(place(paint(new THREE.CylinderGeometry(t.r, t.r, t.h, 32), 0xf0eee8), t.x, 0.4 + t.h / 2, t.z));
    list.push(place(paint(new THREE.CylinderGeometry(t.r + 0.04, t.r + 0.04, 0.7, 32), 0xd23b30), t.x, 0.4 + t.h * 0.78, t.z));
    list.push(place(paint(new THREE.CylinderGeometry(t.r * 0.25, t.r, 0.9, 32), 0xe2dfd8), t.x, 0.4 + t.h + 0.45, t.z));
    list.push(place(paint(new THREE.BoxGeometry(0.12, t.h + 1, 0.6), 0x4a4f55), t.x + t.r + 0.06, 0.4 + (t.h + 1) / 2, t.z));
    list.push(place(paint(new THREE.CylinderGeometry(0.3, 0.3, t.r * 1.2, 12), 0x6b7078), t.x - t.r * 0.9, 0.9, t.z, 0, Math.PI / 2));
    this.c.solid.push(mergeGeometries(list, false)!);
    this.taken.push([t.x, t.z, t.r + 1.5]);
  }

  /** Трибуна на сваях над водой справа от стартовой прямой и мостки под ней */
  private buildStand(): void {
    const tr = this.tr;
    const i = 0;
    const fx = tr.tx[i];
    const fz = tr.tz[i];
    const sd = 1;
    const rx = -fz * sd;
    const rz = fx * sd;
    // за отбойником — полоса бетона, дальше вода: трибуна стоит на свайном настиле
    const off = tr.hw[i] + this.out(i, sd) + 3.6;
    const a0 = -30;
    const a1 = 30;
    const deckY = 0;
    const L = a1 - a0;
    const midA = (a0 + a1) / 2;
    const dOff = off + 3.4;
    const cx = tr.px[i] + fx * midA + rx * dOff;
    const cz = tr.pz[i] + fz * midA + rz * dOff;
    const ry = Math.atan2(fx, fz);
    this.box(8.4, 0.35, L + 1, cx, deckY - 0.18, cz, 0x9a7650, ry);
    for (let a = a0; a <= a1 + 1e-6; a += 4) {
      for (const o of [off - 0.6, off + 3.4, off + 7.4]) {
        const x = tr.px[i] + fx * a + rx * o;
        const z = tr.pz[i] + fz * a + rz * o;
        this.c.solid.push(place(paint(new THREE.CylinderGeometry(0.2, 0.24, 4, 8), 0x4a3a2a), x, deckY - 2.2, z));
      }
    }
    const spot = buildGrandstand(this.c.scene, this.c.solid, this.c.festive, { x: tr.px[i], z: tr.pz[i], fx, fz, sd, a0, a1, off, y0: deckY, floor: deckY - 0.2 });
    this.taken.push(spot);
    // флаги вдоль причала по обе стороны трибуны
    const colors = [0xe8423a, 0xffd23f, 0x2f8fe0, 0x3cbf5a, 0xffffff];
    let k = 0;
    for (const a of [-70, -58, -46, 42, 54, 66]) {
      const x = tr.px[i] + fx * a + rx * (off - 1.4);
      const z = tr.pz[i] + fz * a + rz * (off - 1.4);
      if (!this.onLand(x, z)) continue;
      this.c.festive.flag(x, 0, z, 6, Math.atan2(-fz, fx), colors[k++ % colors.length], 1.5);
    }
  }

  /** Клумбы в бетонных кадках вдоль газона у старта (слева от прямой) */
  private buildPlanters(): void {
    const tr = this.tr;
    const rng = makeRng(71);
    const flowers = [0xff4f6d, 0xffd23f, 0xff8ad8, 0xffffff, 0xb486ff, 0xff7a3d];
    for (let i = 0; i < tr.n; i++) {
      if (tr.leg[i] !== 0 || Math.round(tr.legAt[i]) % 9 !== 0) continue;
      const sd = -1;
      if (this.c.layout.wallL[i] === WALL_NONE) continue;
      const [x, , z] = this.edge(i, sd, this.out(i, sd) + 1.1, 0);
      if (!this.onLand(x, z) || !this.clearOfRoad(x, z, 0.5)) continue;
      const ry = Math.atan2(tr.tx[i], tr.tz[i]);
      this.box(0.9, 0.55, 2.2, x, 0.275, z, 0xd9d2c4, ry);
      this.box(0.75, 0.12, 2.05, x, 0.6, z, 0x5a4330, ry);
      for (let k = 0; k < 7; k++) {
        const t = (k / 6 - 0.5) * 1.8;
        const px = x + tr.tx[i] * t + (rng() - 0.5) * 0.3 * tr.tz[i];
        const pz = z + tr.tz[i] * t - (rng() - 0.5) * 0.3 * tr.tx[i];
        this.c.solid.push(place(paint(new THREE.IcosahedronGeometry(0.26, 0), 0x4f9a3a), px, 0.78, pz));
        this.c.solid.push(place(paint(new THREE.IcosahedronGeometry(0.13, 0), flowers[Math.floor(rng() * flowers.length)]), px + 0.05, 0.98, pz));
      }
      this.taken.push([x, z, 1.4]);
    }
  }

  /** Мелочь на пустом бетоне: бытовки, бочки, поддоны с грузом, кабельные барабаны. */
  private buildClutter(): void {
    const { yards, cranes, sheds } = this.c.ring.deco;
    const rng = makeRng(57);
    const free = (x: number, z: number, r: number): boolean => {
      const e = r + 1.5;
      if (![[-e, -e], [e, -e], [e, e], [-e, e]].every(([dx, dz]) => this.onLand(x + dx, z + dz))) return false;
      if (!this.clearOfRoad(x, z, 2.4 + r)) return false;
      if (yards.some((y) => x > y.x0 - r - 1 && x < y.x1 + r + 1 && z > y.z0 - r - 1 && z < y.z1 + r + 1)) return false;
      if (sheds.some((y) => x > y.x0 - r - 1 && x < y.x1 + r + 1 && z > y.z0 - r - 1 && z < y.z1 + r + 1)) return false;
      if (cranes.some((c) => Math.abs(x - c.x) < CRANE_HALF_X + r + 1 && Math.abs(z - c.z) < CRANE_HALF_X + r + 1)) return false;
      return this.taken.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > r + or + 1.5);
    };
    const at = (x: number, z: number, ry: number, lx: number, lz: number): [number, number] =>
      [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
    const cabin = (x: number, z: number, ry: number) => {
      this.taken.push([x, z, 3.5]);
      this.box(6, 2.6, 2.5, x, 1.3, z, 0xe6dfcf, ry);
      this.box(6.2, 0.14, 2.7, x, 2.67, z, 0x8a8f96, ry);
      for (const lx of [-1.9, -0.1]) {
        const [wx, wz] = at(x, z, ry, lx, 1.27);
        this.box(1.3, 0.8, 0.05, wx, 1.65, wz, 0x2c3a48, ry);
      }
      const [dx, dz] = at(x, z, ry, 1.9, 1.27);
      this.box(0.9, 2, 0.05, dx, 1, dz, 0x5a6470, ry);
    };
    const BARRELS = [0x2f7fbf, 0xc8452f, 0x3f8f4a, 0xe0a83a, 0x5a5f66];
    const barrels = (x: number, z: number) => {
      this.taken.push([x, z, 1.4]);
      const n = 3 + Math.floor(rng() * 5);
      const base = BARRELS[Math.floor(rng() * BARRELS.length)];
      const ry = rng() * Math.PI;
      for (let k = 0; k < n; k++) {
        const row = Math.floor(k / 3);
        const [bx, bz] = at(x, z, ry, (k % 3) * 0.72 + (row % 2) * 0.36 - 0.72, row * 0.63 - 0.6);
        const color = rng() < 0.2 ? BARRELS[Math.floor(rng() * BARRELS.length)] : base;
        this.c.deco.push({ kind: 'barrel', x: bx, z: bz, color });
      }
    };
    const pallets = (x: number, z: number) => {
      this.taken.push([x, z, 1.8]);
      const n = 2 + Math.floor(rng() * 3);
      const ry = Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.1;
      for (let k = 0; k < n; k++) {
        const [px, pz] = at(x, z, ry, k * 1.35 - (n - 1) * 0.675, 0);
        let y = 0;
        for (let l = rng() < 0.3 ? 2 : 1; l > 0; l--) {
          this.box(1.2, 0.14, 1, px, y + 0.07, pz, 0xa8845a, ry);
          const h = 0.5 + rng() * 0.4;
          this.box(1.1, h, 0.92, px, y + 0.14 + h / 2, pz, rng() < 0.5 ? 0xe6e0d4 : 0xb8945f, ry + (rng() - 0.5) * 0.08);
          y += 0.14 + h;
        }
      }
    };
    const drum = (x: number, z: number) => {
      const R = 0.6 + rng() * 0.25;
      this.taken.push([x, z, R + 0.3]);
      const ry = rng() * Math.PI;
      for (const side of [-0.45, 0.45]) this.c.solid.push(place(paint(new THREE.CylinderGeometry(R, R, 0.07, 18), 0x9a7048), x + Math.sin(ry) * side, R, z + Math.cos(ry) * side, ry, Math.PI / 2));
      this.c.solid.push(place(paint(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.84, 16), 0x2a2c30), x, R, z, ry, Math.PI / 2));
    };
    const b = this.c.ring.land.box;
    for (let gx = Math.floor(b.x0 / 7) * 7; gx <= b.x1; gx += 7) {
      for (let gz = Math.floor(b.z0 / 7) * 7; gz <= b.z1; gz += 7) {
        const x = gx + rng() * 4;
        const z = gz + rng() * 4;
        const k = rng();
        if (rng() > 0.16) continue;
        if (k < 0.5) {
          if (free(x, z, 1.4)) barrels(x, z);
        } else if (k < 0.8) {
          if (free(x, z, 1.8)) pallets(x, z);
        } else if (free(x, z, 1)) {
          drum(x, z);
        }
      }
    }
    for (const [x, z, ry] of this.c.ring.deco.cabins) if (free(x, z, 3.5)) cabin(x, z, ry);
  }

  /** Портал над линией старта: жёлтые опоры за ограждением, балки, кабина, шахматный баннер, вывеска, гирлянды. */
  private buildGantry(): void {
    const tr = this.tr;
    const yaw = Math.atan2(-tr.tx[0], -tr.tz[0]);
    const span = tr.hw[0] + Math.max(this.out(0, -1), this.out(0, 1)) + 1.4;
    const H = 8;
    const yellow = 0xf0bf3c;
    const list: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => {
      list.push(paint(new THREE.BoxGeometry(w, h, d), c).translate(x, y, z));
    };
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) box(0.7, H, 0.7, sx * span, H / 2, sz * 2.6, yellow);
      box(0.9, 0.7, 7, sx * span, 0.35, 0, yellow);
      for (const sz of [-1, 1]) box(0.5, 0.5, 0.9, sx * span, 0.25, sz * 3.1, 0x2a2c30);
      box(0.8, 0.9, 6, sx * span, H + 0.45, 0, yellow);
      const brace = new THREE.BoxGeometry(0.22, 8.2, 0.22).rotateX(0.68);
      list.push(paint(brace, yellow).translate(sx * span, 4.2, 0));
    }
    for (const sz of [-1, 1]) box(span * 2 + 1.2, 0.9, 0.8, 0, H + 0.45, sz * 2.6, yellow);
    box(span * 2, 0.3, 0.3, 0, H - 0.3, 0, 0x3a4048);
    box(3.4, 2, 3.2, span - 1.3, H + 1.9, 0, 0xeee8dc);
    box(3.6, 0.2, 3.4, span - 1.3, H + 3, 0, 0xb04a3a);
    const g = mergeGeometries(list, false)!;
    g.rotateY(yaw);
    g.translate(tr.px[0], tr.h[0], tr.pz[0]);
    this.c.solid.push(g);

    const frame = new THREE.Group();
    frame.position.set(tr.px[0], tr.h[0], tr.pz[0]);
    frame.rotation.y = yaw;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 1.2, 1.4), new THREE.MeshStandardMaterial({ map: tex.checkerTexture(16, 2), roughness: 0.8, side: THREE.DoubleSide }));
    banner.position.set(0, H - 1.15, 0);
    frame.add(banner);
    const signTex = tex.signTexture(tr.name.toUpperCase(), '#1f4fa8', '#ffffff', 1024, 128);
    for (const sz of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.7 }));
      sign.position.set(0, H + 0.45, sz * 3.02);
      if (sz < 0) sign.rotation.y = Math.PI;
      frame.add(sign);
    }
    frame.updateMatrixWorld(true);
    this.c.scene.add(frame);
    // гирлянды с портала вдоль прямой
    const fx = tr.tx[0];
    const fz = tr.tz[0];
    for (const s of [-1, 1]) {
      const x = tr.px[0] + this.c.rx[0] * span * s;
      const z = tr.pz[0] + this.c.rz[0] * span * s;
      this.c.festive.bunting(x, H + 0.6, z, x + fx * 24, 4.6, z + fz * 24, 0.5);
      this.c.festive.bunting(x, H + 0.6, z, x - fx * 24, 4.6, z - fz * 24, 0.5);
    }
  }

  /** Фонари вдоль прямых — за ограждением, плафон над краем дороги. */
  private buildLamps(): void {
    const tr = this.tr;
    const byLeg = new Map<number, number[]>();
    for (let i = 0; i < tr.n; i++) {
      if (tr.leg[i] < 0) continue;
      const list = byLeg.get(tr.leg[i]) ?? [];
      list.push(i);
      byLeg.set(tr.leg[i], list);
    }
    for (const pts of byLeg.values()) {
      const end = Math.max(...pts.map((i) => tr.legAt[i]));
      for (let d = LAMP_FIRST; d <= end - 4; d += LAMP_EVERY) {
        let i = pts[0];
        for (const k of pts) if (Math.abs(tr.legAt[k] - d) < Math.abs(tr.legAt[i] - d)) i = k;
        if (tr.gap[i] || this.c.layout.rampDeck[i] || Math.abs(tr.s[i]) < 3 || tr.h[i] > 0.05) continue;
        const sd = tr.openR[i] ? -1 : 1;
        if (sd < 0 && tr.openL[i]) continue;
        if ((sd > 0 ? this.c.layout.wallR : this.c.layout.wallL)[i] === WALL_NONE) continue;
        const [x, , z] = this.edge(i, sd, this.out(i, sd) + 0.5, 0);
        if (!this.onLand(x, z)) continue;
        this.lamp(x, z, Math.atan2(this.c.rx[i] * sd, this.c.rz[i] * sd));
      }
    }
  }

  private lamp(x: number, z: number, yaw: number): void {
    const ax = -Math.sin(yaw) * 0.6;
    const az = -Math.cos(yaw) * 0.6;
    const s = this.c.solid;
    s.push(place(paint(new THREE.CylinderGeometry(0.06, 0.09, 5.2, 8), 0x2f4a4a), x, 2.6, z));
    s.push(place(paint(new THREE.BoxGeometry(0.06, 0.06, 1.2), 0x2f4a4a), x + ax, 5.1, z + az, yaw));
    const hx = x + ax * 2;
    const hz = z + az * 2;
    s.push(place(paint(new THREE.CylinderGeometry(0.08, 0.28, 0.22, 12), 0x2f4a4a), hx, 5.0, hz));
    s.push(place(paint(new THREE.SphereGeometry(0.13, 12, 8), 0xf2eee0), hx, 4.88, hz));
  }

  /** Указатели карты («СРЕЗКА» у мыса) */
  private buildSigns(): void {
    for (const s of this.c.ring.deco.signs) {
      const map = arrowSignTexture(s.text, s.bg, '#ffffff', s.dir);
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      const h = s.w / 3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, h), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.6 }));
      m.position.set(s.x, 1.4 + h / 2, s.z);
      m.rotation.y = Math.atan2(fx, fz);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.c.scene.add(m);
      const rx = fz;
      const rz = -fx;
      for (const side of [-1, 1]) this.box(0.1, 1.4 + h, 0.1, s.x + rx * side * (s.w / 2 - 0.15) - fx * 0.07, (1.4 + h) / 2, s.z + rz * side * (s.w / 2 - 0.15) - fz * 0.07, 0x3a3d42);
    }
  }

  /** Дальний берег: город на востоке, холмы, маяк на волнорезе и сухогруз на западе. Без тумана — дымка «запечена». */
  private buildFarShore(): void {
    const rng = makeRng(99);
    const geos: THREE.BufferGeometry[] = [];
    const haze = this.c.haze;
    const pushBox = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color) => {
      geos.push(place(paint(new THREE.BoxGeometry(w, h, d), c), x, y, z));
    };
    for (let i = 0; i < 64; i++) {
      const z = -480 + i * 15 + rng() * 8;
      const h = 12 + rng() * 34 + (Math.abs(z) < 140 ? rng() * 28 : 0);
      const w = 10 + rng() * 14;
      const c = new THREE.Color().setHSL(0.06 + rng() * 0.08, 0.35, 0.7 + rng() * 0.14).lerp(haze, 0.45);
      pushBox(w, h, w, 470 + rng() * 60, WATER_Y + h / 2, z, c);
    }
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Color(0x7fae6e).lerp(haze, 0.45 + rng() * 0.1);
      const r = 110 + rng() * 80;
      const h = 40 + rng() * 45;
      const dome = paint(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, h / r, 1), c);
      geos.push(place(dome, 660 + rng() * 120, WATER_Y - 2, -560 + i * 150));
    }
    pushBox(6, 3, 150, -300, WATER_Y + 1, 40, new THREE.Color(0x8f8a82).lerp(haze, 0.35));
    pushBox(5, 14, 5, -300, WATER_Y + 8, -36, new THREE.Color(0xf4efe6).lerp(haze, 0.25));
    pushBox(5.2, 3, 5.2, -300, WATER_Y + 16, -36, new THREE.Color(0xd23b30).lerp(haze, 0.25));
    const dark = new THREE.Color(0x4a5560).lerp(haze, 0.3);
    pushBox(26, 10, 170, -520, WATER_Y + 4, 180, dark);
    pushBox(22, 14, 18, -520, WATER_Y + 16, 252, new THREE.Color(0xe8e2d8).lerp(haze, 0.4));
    for (let k = 0; k < 9; k++) {
      const c = new THREE.Color(CONTAINER_COLORS[k % 5]).lerp(haze, 0.45);
      pushBox(22, 5 + rng() * 5, 14, -520, WATER_Y + 11, 108 + k * 15, c);
    }
    this.c.scene.add(staticMesh(mergeGeometries(geos, false)!, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }), false));
    void same;
  }
}
