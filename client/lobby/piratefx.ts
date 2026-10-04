// «Набег пиратов»: эффекты — ядра с дымным хвостом, вспышки и дым выстрелов, брызги, шарики краски и лужи от них,
// щепки, кольца, красный круг под падающим ядром корабля, кольцо прицела пушки и кольца высадки у причалов. Всё из
// заранее созданных пулов (частицы — одним InstancedMesh, лужи — другим), без выделений памяти в кадре. Мультяшно:
// дым — белые шарики, брызги — голубые капли, краска — цвета стрелка.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { PIRATE_DOCKS, shellApex, shellAt, type V3 } from '../../shared/pirates.ts';
import { fxCount, fxKeep } from '../render/gfx.ts';
import { glowTexture } from '../render/kit.ts';
import type { LootKit } from './pirateloot.ts';

const MAX_PARTS = 360;
const MAX_DECALS = 150;
const MAX_BALLS = 12;
const MAX_RINGS = 10;
const BALL_SCALE = 2.3;
const DECAL_Y = 0.016;
const TAU = Math.PI * 2;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

interface Ball { on: boolean; o: V3; t: V3; apex: number; k: number; ticks: number; trail: number; ship: boolean }
interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; on: boolean; t: number; life: number; r0: number; r1: number }
interface Tele { ring: THREE.Mesh; fill: THREE.Mesh; k0: number; k1: number }

/** Частицы одним мешем: сферы разного размера и цвета; смерть — обмен с последней */
class Parts {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly x = new Float32Array(MAX_PARTS);
  private readonly y = new Float32Array(MAX_PARTS);
  private readonly z = new Float32Array(MAX_PARTS);
  private readonly vx = new Float32Array(MAX_PARTS);
  private readonly vy = new Float32Array(MAX_PARTS);
  private readonly vz = new Float32Array(MAX_PARTS);
  private readonly life = new Float32Array(MAX_PARTS);
  private readonly max = new Float32Array(MAX_PARTS);
  private readonly size = new Float32Array(MAX_PARTS);
  private readonly grow = new Float32Array(MAX_PARTS);
  private readonly grav = new Float32Array(MAX_PARTS);
  private readonly drag = new Float32Array(MAX_PARTS);
  private readonly floor = new Float32Array(MAX_PARTS);
  private readonly col = new Float32Array(MAX_PARTS * 3);

  constructor(parent: THREE.Object3D) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PARTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTS * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'pirate-parts';
    parent.add(this.mesh);
  }

  /** floor — ниже этой высоты частица гаснет (вода или земля) */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, grav: number, drag: number, color: number, floor = -9): void {
    if (this.n >= MAX_PARTS) return;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag; this.floor[i] = floor;
    _c.setHex(color);
    this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
  }

  private kill(i: number): void {
    const l = --this.n;
    if (i === l) return;
    this.x[i] = this.x[l]; this.y[i] = this.y[l]; this.z[i] = this.z[l];
    this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
    this.life[i] = this.life[l]; this.max[i] = this.max[l]; this.size[i] = this.size[l]; this.grow[i] = this.grow[l];
    this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.floor[i] = this.floor[l];
    for (let c = 0; c < 3; c++) this.col[i * 3 + c] = this.col[l * 3 + c];
  }

  clear(): void { this.n = 0; this.mesh.count = 0; }

  update(dt: number): void {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0 || this.y[i] < this.floor[i]) { this.kill(i); continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d; this.vz[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
    }
    const arr = this.mesh.instanceColor!.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const u = 1 - this.life[i] / this.max[i];
      // растёт, потом в последней трети сжимается
      const s = this.size[i] * (1 + this.grow[i] * u) * (u > 0.66 ? Math.max(0.02, 1 - (u - 0.66) / 0.34) : 1);
      _m.makeScale(s, s, s);
      _m.setPosition(this.x[i], this.y[i], this.z[i]);
      this.mesh.setMatrixAt(i, _m);
      arr[i * 3] = this.col[i * 3]; arr[i * 3 + 1] = this.col[i * 3 + 1]; arr[i * 3 + 2] = this.col[i * 3 + 2];
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

/** Лужи и пятна краски на земле: плоские кружки, живут и сжимаются под конец */
class Decals {
  readonly mesh: THREE.InstancedMesh;
  private readonly x = new Float32Array(MAX_DECALS);
  private readonly z = new Float32Array(MAX_DECALS);
  private readonly r = new Float32Array(MAX_DECALS);
  private readonly born = new Float32Array(MAX_DECALS);
  private readonly life = new Float32Array(MAX_DECALS);
  private readonly rot = new Float32Array(MAX_DECALS);
  private next = 0;
  private time = 0;

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_DECALS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'pirate-decals';
    for (let i = 0; i < MAX_DECALS; i++) { this.mesh.setMatrixAt(i, ZERO); this.life[i] = 0; }
    parent.add(this.mesh);
  }

  add(x: number, z: number, r: number, color: number, life: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_DECALS;
    this.x[i] = x; this.z[i] = z; this.r[i] = r; this.born[i] = this.time; this.life[i] = life; this.rot[i] = Math.random() * TAU;
    _c.setHex(color);
    this.mesh.setColorAt(i, _c);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Пятно: основное и две-три капли рядом */
  splat(x: number, z: number, r: number, color: number, life: number): void {
    this.add(x, z, r, color, life);
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = r * (0.9 + Math.random() * 0.8);
      this.add(x + Math.cos(a) * d, z + Math.sin(a) * d, r * (0.25 + Math.random() * 0.3), color, life * 0.9);
    }
  }

  clear(): void {
    for (let i = 0; i < MAX_DECALS; i++) { this.life[i] = 0; this.mesh.setMatrixAt(i, ZERO); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.time += dt;
    let dirty = false;
    for (let i = 0; i < MAX_DECALS; i++) {
      if (this.life[i] <= 0) continue;
      const age = this.time - this.born[i];
      if (age >= this.life[i]) { this.life[i] = 0; this.mesh.setMatrixAt(i, ZERO); dirty = true; continue; }
      const pop = Math.min(1, age / 0.12);
      const fade = Math.min(1, (this.life[i] - age) / 2.5);
      const s = this.r[i] * (1 - (1 - pop) * (1 - pop)) * (0.15 + 0.85 * fade * fade * (3 - 2 * fade) + (fade >= 1 ? 0 : 0));
      _q.setFromEuler(_e.set(0, this.rot[i], 0));
      _m.compose(_p.set(this.x[i], DECAL_Y + (i % 7) * 0.0006, this.z[i]), _q, _s.set(s, 1, s));
      this.mesh.setMatrixAt(i, _m);
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class PirateFx {
  readonly group = new THREE.Group();
  private readonly parts: Parts;
  private readonly decals: Decals;
  private readonly balls: THREE.InstancedMesh;
  private readonly ball: Ball[] = [];
  private readonly rings: Ring[] = [];
  private readonly tele: Tele[] = [];
  private readonly flash: THREE.Sprite[] = [];
  private readonly flashLife: number[] = [];
  private readonly dockRings: THREE.Mesh[] = [];
  private readonly aimRing: THREE.Mesh;
  private readonly aimMat: THREE.MeshBasicMaterial;
  private readonly aimDot: THREE.Mesh;
  private tick = 0;
  private time = 0;
  private readonly tmpP: V3 = { x: 0, y: 0, z: 0 };

  constructor(scene: THREE.Object3D, kit: LootKit) {
    this.group.name = 'pirate-fx';
    scene.add(this.group);
    this.parts = new Parts(this.group);
    this.decals = new Decals(this.group);
    this.balls = new THREE.InstancedMesh(kit.ball, kit.material, MAX_BALLS);
    this.balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.balls.frustumCulled = false;
    this.balls.count = 0;
    this.group.add(this.balls);
    for (let i = 0; i < MAX_BALLS; i++) this.ball.push({ on: false, o: { x: 0, y: 0, z: 0 }, t: { x: 0, y: 0, z: 0 }, apex: 0, k: 0, ticks: 1, trail: 0, ship: false });
    const ringGeo = new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, on: false, t: 0, life: 1, r0: 0.3, r1: 2 });
    }
    // красный круг под ядром корабля: контур и бледная заливка
    const fillGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      for (const m of [ring, fill]) { m.visible = false; m.frustumCulled = false; m.renderOrder = 3; this.group.add(m); }
      this.tele.push({ ring, fill, k0: 0, k1: 0 });
    }
    // кольца высадки у причалов
    for (let i = 0; i < PIRATE_DOCKS.length; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; m.renderOrder = 3;
      this.group.add(m);
      this.dockRings.push(m);
    }
    // кольцо прицела пушки (там, куда упадёт ядро) и точка в его середине
    this.aimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    this.aimRing = new THREE.Mesh(ringGeo, this.aimMat);
    this.aimDot = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14).rotateX(-Math.PI / 2), this.aimMat);
    for (const m of [this.aimRing, this.aimDot]) { m.visible = false; m.frustumCulled = false; m.renderOrder = 6; this.group.add(m); }
    // вспышки выстрелов
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      this.group.add(s);
      this.flash.push(s);
      this.flashLife.push(0);
    }
  }

  // ------------------------------------------------------------ запуск эффектов

  /** Ядро: от o к t по дуге, вылет в тик k, в полёте ticks тиков */
  shoot(o: V3, t: V3, k: number, ticks: number, ship: boolean): void {
    const dist = Math.hypot(t.x - o.x, t.z - o.z);
    for (const b of this.ball) {
      if (b.on) continue;
      b.on = true; b.o.x = o.x; b.o.y = o.y; b.o.z = o.z; b.t.x = t.x; b.t.y = t.y; b.t.z = t.z;
      b.apex = shellApex(dist); b.k = k; b.ticks = Math.max(1, ticks); b.trail = 0; b.ship = ship;
      return;
    }
  }

  /** Вспышка и дым у дула; dir — куда смотрит ствол */
  muzzle(p: V3, dx: number, dy: number, dz: number, big: boolean): void {
    for (let i = 0; i < this.flash.length; i++) {
      if (this.flashLife[i] > 0) continue;
      this.flashLife[i] = 0.14;
      this.flash[i].position.set(p.x + dx * 0.4, p.y + dy * 0.4, p.z + dz * 0.4);
      this.flash[i].scale.setScalar(big ? 4.2 : 2.6);
      this.flash[i].visible = true;
      break;
    }
    const n = fxCount(big ? 9 : 6);
    for (let i = 0; i < n; i++) {
      const sp = 1.2 + Math.random() * 3.4;
      this.parts.spawn(p.x + dx * 0.5, p.y + dy * 0.5, p.z + dz * 0.5, dx * sp + (Math.random() - 0.5) * 1.6, dy * sp + 0.4 + Math.random() * 0.8, dz * sp + (Math.random() - 0.5) * 1.6,
        0.9 + Math.random() * 0.8, (big ? 0.55 : 0.38) * (0.7 + Math.random() * 0.6), 1.6, -0.35, 1.6, i % 3 === 0 ? 0xcfd6dd : 0xffffff);
    }
    // искры
    for (let i = 0; i < fxCount(5); i++) {
      this.parts.spawn(p.x + dx * 0.4, p.y + dy * 0.4, p.z + dz * 0.4, dx * 6 + (Math.random() - 0.5) * 3, dy * 6 + Math.random() * 2, dz * 6 + (Math.random() - 0.5) * 3, 0.35, 0.06, 0, 6, 1, 0xffc23a);
    }
  }

  /** Облачко дыма: n шариков вокруг точки, поднимаются */
  puff(x: number, y: number, z: number, n: number, size: number, dark = false): void {
    const k = fxCount(n);
    for (let i = 0; i < k; i++) {
      this.parts.spawn(x + (Math.random() - 0.5) * size, y + Math.random() * size * 0.4, z + (Math.random() - 0.5) * size, (Math.random() - 0.5) * 1.1, 0.8 + Math.random() * 1.1, (Math.random() - 0.5) * 1.1,
        0.9 + Math.random() * 0.8, size * (0.35 + Math.random() * 0.35), 1.5, -0.25, 1.4, dark ? 0x8d97a3 : i % 3 === 0 ? 0xd6dde5 : 0xffffff);
    }
  }

  /** Всплеск на воде: кольцо, столб капель, пена */
  splash(x: number, z: number, big: boolean): void {
    const y = WATER_Y;
    this.ring(x, y + 0.05, z, 0xeaf8ff, big ? 4.2 : 2.2, big ? 1.1 : 0.8, big ? 0.9 : 0.5);
    if (big) this.ring(x, y + 0.05, z, 0xbfe6ff, 2.6, 0.8, 0.3);
    const n = fxCount(big ? 26 : 12);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (big ? 2.2 : 1.2) * (0.3 + Math.random() * 0.9), up = (big ? 7.5 : 4.5) * (0.5 + Math.random() * 0.7);
      this.parts.spawn(x + Math.cos(a) * 0.3, y + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * sp, up, Math.sin(a) * sp, 1.4, big ? 0.17 : 0.11, 0, 14, 0.2, i % 4 === 0 ? 0xffffff : 0x9fdcff, y - 0.1);
    }
    this.puff(x, y + 0.4, z, big ? 4 : 2, big ? 1.0 : 0.6);
  }

  /** Шарик краски: быстрая капля от a к b; на земле — пятно, во всём — брызги цвета краски */
  pellet(a: V3, b: V3, color: number, hit: boolean): void {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1, life = Math.min(0.28, Math.max(0.05, d / 90));
    this.parts.spawn(a.x, a.y, a.z, dx / life, dy / life, dz / life, life, 0.13, 0, 0, 0, color);
    // хвост: пара капель следом, чуть медленнее
    for (let i = 1; i <= 2; i++) this.parts.spawn(a.x, a.y, a.z, dx / life * (1 - i * 0.12), dy / life * (1 - i * 0.12), dz / life * (1 - i * 0.12), life * 1.05, 0.085 - i * 0.02, 0, 0, 0, color);
    if (!hit && b.y < 0.35) { this.decals.splat(b.x, b.z, 0.45 + Math.random() * 0.2, color, 30); this.burst(b.x, Math.max(0.05, b.y), b.z, color, 7); }
    else if (!hit && b.y < WATER_Y + 0.4) this.splash(b.x, b.z, false);
    else if (!hit) this.burst(b.x, b.y, b.z, color, 6);
  }

  /** Брызги краски во все стороны */
  burst(x: number, y: number, z: number, color: number, n: number): void {
    const k = fxCount(n);
    for (let i = 0; i < k; i++) {
      const a = Math.random() * TAU, sp = 1.2 + Math.random() * 3;
      this.parts.spawn(x, y, z, Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp, 0.5 + Math.random() * 0.4, 0.07 + Math.random() * 0.05, 0, 11, 0.4, color, 0.02);
    }
  }

  /** Попали по пирату: пятно на нём (брызги) и звёздочки */
  paintHit(x: number, y: number, z: number, color: number): void {
    this.burst(x, y, z, color, 14);
    this.ring(x, y, z, color, 1.3, 0.35, 0.7);
  }

  /** Заляпан: большая лужа цвета краски на земле, пока впитывается (≈ 4 с), и хлопок */
  puddle(x: number, z: number, color: number): void {
    this.decals.add(x, z, 1.05, color, 7);
    for (let i = 0; i < 5; i++) { const a = Math.random() * TAU, d = 0.7 + Math.random() * 0.5; this.decals.add(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.2 + Math.random() * 0.25, color, 5.5); }
    this.burst(x, 0.8, z, color, 22);
    this.ring(x, 0.06, z, color, 2.1, 0.6, 0.8);
  }

  /** Просто пятно краски на земле (мимо) */
  splat(x: number, z: number, color: number): void { this.decals.splat(x, z, 0.45 + Math.random() * 0.2, color, 30); }

  /** Щепки */
  splinters(x: number, y: number, z: number, n: number): void {
    const k = fxCount(n);
    for (let i = 0; i < k; i++) {
      const a = Math.random() * TAU, sp = 1.5 + Math.random() * 4;
      this.parts.spawn(x, y, z, Math.cos(a) * sp, 2 + Math.random() * 4.5, Math.sin(a) * sp, 1.1, 0.09 + Math.random() * 0.07, 0, 12, 0.3, i % 2 ? 0xb87a44 : 0xe2b979, WATER_Y - 0.1);
    }
  }

  /** Кольцо, расходящееся по плоскости y */
  ring(x: number, y: number, z: number, color: number, r1: number, life: number, r0 = 0.3): void {
    for (const r of this.rings) {
      if (r.on) continue;
      r.on = true; r.t = 0; r.life = life; r.r0 = r0; r.r1 = r1;
      r.mesh.position.set(x, y, z);
      r.mat.color.setHex(color);
      r.mesh.visible = true;
      return;
    }
  }

  /** Красный круг на земле под ядром корабля: от тика k0 до k1 */
  telegraph(x: number, z: number, radius: number, k0: number, k1: number): void {
    for (const t of this.tele) {
      if (t.k1 > this.tick && t.k1 !== 0) continue;
      t.k0 = k0; t.k1 = k1;
      t.ring.position.set(x, 0.03, z); t.fill.position.set(x, 0.028, z);
      t.ring.scale.setScalar(radius); t.fill.scale.setScalar(radius);
      return;
    }
  }

  /** Кольцо высадки у причала i (on — шлюпка идёт), мигает; pulse — 0…1 */
  dock(i: number, on: boolean, pulse: number): void {
    const m = this.dockRings[i];
    if (!m) return;
    m.visible = on;
    if (!on) return;
    const d = PIRATE_DOCKS[i];
    m.position.set(d.exitX, 0.04, d.exitZ - 0.6);
    m.scale.setScalar(1.7 + 0.25 * pulse);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.4 * pulse;
  }

  /** Кольцо прицела пушки: где упадёт ядро (null — спрятать); color — по виду цели */
  aim(p: V3 | null, color: number, radius: number): void {
    this.aimRing.visible = this.aimDot.visible = p !== null;
    if (!p) return;
    this.aimMat.color.setHex(color);
    this.aimRing.position.set(p.x, p.y + 0.06, p.z);
    this.aimDot.position.copy(this.aimRing.position);
    this.aimRing.scale.setScalar(radius);
  }

  clear(): void {
    this.parts.clear(); this.decals.clear();
    for (const b of this.ball) b.on = false;
    this.balls.count = 0;
    for (const r of this.rings) { r.on = false; r.mesh.visible = false; }
    for (const t of this.tele) { t.k1 = 0; t.ring.visible = t.fill.visible = false; }
    for (const m of this.dockRings) m.visible = false;
    this.aimRing.visible = this.aimDot.visible = false;
    for (let i = 0; i < this.flash.length; i++) { this.flashLife[i] = 0; this.flash[i].visible = false; }
  }

  // ------------------------------------------------------------ кадр

  update(tick: number, dt: number): void {
    this.tick = tick;
    this.time += dt;
    // ядра по серверному времени: дуга, дымный хвост
    let n = 0;
    for (const b of this.ball) {
      if (!b.on) continue;
      const u = (tick - b.k) / b.ticks;
      if (u >= 1) { b.on = false; continue; }
      if (u < 0) continue;
      shellAt(b.o, b.t, b.apex, u, this.tmpP);
      b.trail -= dt;
      if (b.trail <= 0) {
        b.trail = 0.035;
        if (fxKeep()) this.parts.spawn(this.tmpP.x, this.tmpP.y, this.tmpP.z, (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5, 0.7, b.ship ? 0.34 : 0.26, 0.9, -0.1, 1.2, 0xe9edf2);
        if (u < 0.2 && fxKeep()) this.parts.spawn(this.tmpP.x, this.tmpP.y, this.tmpP.z, 0, 0.3, 0, 0.25, 0.14, 0, 0, 0, 0xffb02e);
      }
      _q.identity();
      _m.compose(_p.set(this.tmpP.x, this.tmpP.y - 0.15 * BALL_SCALE, this.tmpP.z), _q, _s.setScalar(BALL_SCALE));
      this.balls.setMatrixAt(n++, _m);
    }
    this.balls.count = n;
    this.balls.instanceMatrix.needsUpdate = true;
    this.parts.update(dt);
    this.decals.update(dt);
    for (const r of this.rings) {
      if (!r.on) continue;
      r.t += dt;
      const u = r.t / r.life;
      if (u >= 1) { r.on = false; r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - u) * (1 - u)));
      r.mat.opacity = 0.85 * (1 - u);
    }
    for (const t of this.tele) {
      const on = t.k1 !== 0 && tick >= t.k0 && tick < t.k1;
      t.ring.visible = t.fill.visible = on;
      if (!on) continue;
      const u = (tick - t.k0) / (t.k1 - t.k0);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * (6 + 10 * u));
      (t.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.4 * pulse;
      (t.fill.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.2 * u;
    }
    for (let i = 0; i < this.flash.length; i++) {
      if (this.flashLife[i] <= 0) continue;
      this.flashLife[i] -= dt;
      const s = this.flash[i];
      (s.material as THREE.SpriteMaterial).opacity = Math.max(0, this.flashLife[i] / 0.14);
      if (this.flashLife[i] <= 0) s.visible = false;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== this.balls.geometry) geos.add(m.geometry);
      if (m.material) for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if (mm !== this.balls.material) mats.add(mm);
    });
    geos.forEach(g => g.dispose());
    mats.forEach(m => m.dispose());
    this.parts.mesh.dispose(); this.decals.mesh.dispose(); this.balls.dispose();
  }
}
