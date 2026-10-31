// Следы наборов в мире (флаг PAINT4): у каждого свой. Брызгалка — струйка мелких капель и мелкие кляксы; Лейка — веер
// крупных капель из розетки и пятна вразброс; Лук — стрела летит дугой, втыкается в стену с кляксой (в игроке — лопается
// краской); ведёрко — кувыркается в полёте, роняя капли, и разливается большой лужей. Плюс пунктир-дуга: куда упадёт
// ведёрко (держишь G) и куда полетит стрела (тянешь лук). Кляксы, брызги и облачка — общие Effects (render/effects.ts).
import * as THREE from 'three';
import { DT, TEAM_COLORS } from '../../../shared/constants.ts';
import { makeGrenade, type Grenade } from '../../../shared/fortgren.ts';
import { BUCKET_R, bucketLaunch, bucketStep, type Arrow, arrowStep } from '../../../shared/paint4.ts';
import { makeRayHit, type CollisionWorld } from '../../../shared/world.ts';
import type { Effects } from '../../render/effects.ts';
import { arrowMesh, bucketMesh } from './kits3d.ts';

const MAX_DROPS = 240;
const DROP_SPEED = 40;
const FAN_SPEED = 26;
const STICK_S = 5;

interface Drop {
  active: boolean;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
  dur: number;
  delay: number;
  size: number;
  sag: number;
  /** Что сделать по прилёте: 0 — стена (клякса), 1 — игрок (брызги), 2 — мимо (упасть), −1 — ничего (хвост струйки) */
  kind: number;
  nx: number;
  ny: number;
  nz: number;
  splat: number;
  color: number;
}

interface FlyArrow {
  obj: THREE.Group;
  team: 0 | 1;
  active: boolean;
  owner: number;
  shot: number;
  a: Arrow;
  /** Воткнулась: сколько ещё торчит, с (0 — летит) */
  stuck: number;
}

interface FlyBucket {
  obj: THREE.Group;
  team: 0 | 1;
  active: boolean;
  owner: number;
  g: Grenade;
  t: number;
  acc: number;
  spin: THREE.Vector3;
  splashed: boolean;
  color: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const FWD = new THREE.Vector3(0, 0, -1);
const Y = new THREE.Vector3(0, 1, 0);

export class P4Fx {
  private readonly scene: THREE.Scene;
  private readonly effects: Effects;
  private readonly world: CollisionWorld;
  private readonly hit = makeRayHit();
  private readonly drops: Drop[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private next = 0;
  private readonly arrows: FlyArrow[] = [];
  private readonly buckets: FlyBucket[] = [];
  private readonly arc: THREE.Points;
  private readonly arcPos = new Float32Array(3 * 90);
  private readonly arcRing: THREE.Mesh;
  /** Звук по прилёте (хозяин подставляет): kind — 'drop' | 'fan' | 'arrow' | 'bucket' */
  onImpact: (kind: string, x: number, y: number, z: number) => void = () => {};

  constructor(scene: THREE.Scene, effects: Effects, world: CollisionWorld) {
    this.scene = scene;
    this.effects = effects;
    this.world = world;
    const geo = new THREE.SphereGeometry(1, 8, 6);
    this.dropMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0 }), MAX_DROPS);
    this.dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dropMesh.setColorAt(0, _c.set(0xffffff));
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    scene.add(this.dropMesh);
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops.push({ active: false, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, t: 0, dur: 1, delay: 0, size: 0, sag: 0, kind: -1, nx: 0, ny: 0, nz: 0, splat: 0, color: 0 });
    }
    // пунктир дуги — точки, как у гранаты крепости
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    // пунктир — круглые точки (без текстуры точки квадратные)
    this.arc = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0xfff1c8, size: 0.15, map: dotTexture(), alphaTest: 0.35, transparent: true, opacity: 0.95, depthWrite: false }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arc.renderOrder = 7;
    scene.add(this.arc);
    this.arcRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.arcRing.visible = false;
    this.arcRing.renderOrder = 7;
    scene.add(this.arcRing);
  }

  // ------------------------------------------------------------ капли

  private drop(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, speed: number, delay: number, size: number, color: number, kind: number, nx: number, ny: number, nz: number, splat: number): void {
    const d = this.drops[this.next];
    this.next = (this.next + 1) % MAX_DROPS;
    const dist = Math.hypot(tx - fx, ty - fy, tz - fz);
    d.active = true;
    d.fx = fx;
    d.fy = fy;
    d.fz = fz;
    d.tx = tx;
    d.ty = ty;
    d.tz = tz;
    d.t = 0;
    d.delay = delay;
    d.dur = Math.max(0.03, dist / speed);
    d.sag = Math.min(0.6, dist * 0.012);
    d.size = size;
    d.kind = kind;
    d.nx = nx;
    d.ny = ny;
    d.nz = nz;
    d.splat = splat;
    d.color = color;
  }

  /** Брызгалка: струйка из трёх капель; на стене — маленькая клякса, в игроке — брызги, мимо — капли падают */
  squirt(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, kind: number, nx: number, ny: number, nz: number, color: number): void {
    const j = () => (Math.random() - 0.5) * 0.08;
    this.drop(sx, sy, sz, ex, ey, ez, DROP_SPEED, 0, 0.032, color, kind, nx, ny, nz, 0.2 + Math.random() * 0.12);
    this.drop(sx, sy, sz, ex + j(), ey + j(), ez + j(), DROP_SPEED * 0.94, 0.018, 0.022, color, -1, 0, 0, 0, 0);
    this.drop(sx, sy, sz, ex + j(), ey + j() - 0.05, ez + j(), DROP_SPEED * 0.88, 0.036, 0.016, color, -1, 0, 0, 0, 0);
    this.effects.puff(sx, sy, sz, 0.12, color, 0.1, 0.1, 0.35, 1.6);
  }

  /** Лейка: облако у розетки и веер крупных капель к концам (ends — четвёрки x, y, z, чем кончилась) */
  fan(sx: number, sy: number, sz: number, ends: ArrayLike<number>, color: number): void {
    this.effects.puff(sx, sy, sz, 0.55, color, 0.28, 0.2, 0.55, 2.2);
    this.effects.puff(sx, sy, sz, 0.4, 0xffffff, 0.2, 0.3, 0.35, 2);
    for (let i = 0; i + 3 < ends.length; i += 4) {
      const ex = ends[i];
      const ey = ends[i + 1];
      const ez = ends[i + 2];
      const kind = ends[i + 3];
      // нормаль стены не знаем — кляксу кладём навстречу полёту, Effects сам найдёт грань рядом
      _v.set(sx - ex, sy - ey, sz - ez).normalize();
      this.drop(sx, sy, sz, ex, ey, ez, FAN_SPEED * (0.9 + Math.random() * 0.2), Math.random() * 0.03, 0.05, color, kind === 0 ? 3 : kind, _v.x, _v.y, _v.z, 0.32 + Math.random() * 0.16);
      this.drop(sx, sy, sz, ex + (Math.random() - 0.5) * 0.3, ey - 0.1, ez + (Math.random() - 0.5) * 0.3, FAN_SPEED * 0.8, 0.03, 0.03, color, -1, 0, 0, 0, 0);
    }
  }

  private land(d: Drop): void {
    if (d.kind === 0) {
      this.effects.splat(d.tx, d.ty, d.tz, d.nx, d.ny, d.nz, d.splat, d.color, -1);
      this.effects.burst(d.tx, d.ty, d.tz, d.color, 3, 2.2, d.nx, d.ny, d.nz, 0.025);
      this.onImpact('drop', d.tx, d.ty, d.tz);
    } else if (d.kind === 3) {
      // капля веера в стену: нормаль ищем лучом вдоль полёта
      const dx = d.tx - d.fx;
      const dy = d.ty - d.fy;
      const dz = d.tz - d.fz;
      const l = Math.hypot(dx, dy, dz) || 1;
      const bx = d.tx - (dx / l) * 0.3;
      const by = d.ty - (dy / l) * 0.3;
      const bz = d.tz - (dz / l) * 0.3;
      if (this.world.raycast(bx, by, bz, dx / l, dy / l, dz / l, 0.6, this.hit, true)) {
        const t = this.hit.t;
        this.effects.splat(bx + (dx / l) * t, by + (dy / l) * t, bz + (dz / l) * t, this.hit.nx, this.hit.ny, this.hit.nz, d.splat, d.color, this.hit.box);
      }
      this.effects.burst(d.tx, d.ty, d.tz, d.color, 4, 2.6, d.nx, d.ny, d.nz, 0.03);
      this.onImpact('fan', d.tx, d.ty, d.tz);
    } else if (d.kind === 1) {
      this.effects.burst(d.tx, d.ty, d.tz, d.color, 6, 3.4, 0, 0.4, 0, 0.035);
    }
  }

  // ------------------------------------------------------------ стрелы

  /** Стрела: летит дугой по тем же формулам, что у сервера; в стену втыкается сама, в игрока — по событию сервера */
  arrow(owner: number, shot: number, ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, team: 0 | 1): void {
    let a = this.arrows.find((x) => !x.active && x.team === team);
    if (!a) {
      if (this.arrows.length >= 24) {
        a = this.arrows.find((x) => x.stuck > 0 && x.team === team);
        if (!a) return;
      } else {
        a = { obj: arrowMesh(team), team, active: false, owner: 0, shot: 0, a: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 }, stuck: 0 };
        this.scene.add(a.obj);
        this.arrows.push(a);
      }
    }
    a.active = true;
    a.owner = owner;
    a.shot = shot;
    a.stuck = 0;
    Object.assign(a.a, { x: ox, y: oy, z: oz, vx, vy, vz, t: 0 });
    a.obj.visible = true;
    a.obj.scale.setScalar(1);
    this.orient(a);
  }

  /** Сервер: стрела кончилась (1 — в игроке: лопнула краской, 0 — в стене, 2 — потерялась) */
  arrowEnd(owner: number, shot: number, x: number, y: number, z: number, kind: number, nx: number, ny: number, nz: number, color: number): void {
    const a = this.arrows.find((q) => q.active && q.owner === owner && q.shot === shot);
    if (kind === 1) {
      this.effects.burst(x, y, z, color, 18, 4.6, 0, 0.4, 0, 0.045);
      this.effects.puff(x, y, z, 0.6, color, 0.3, 0.3, 0.5);
      if (a) {
        a.active = false;
        a.obj.visible = false;
      }
      return;
    }
    if (!a) return;
    if (a.stuck > 0) return;
    if (kind === 2) {
      a.active = false;
      a.obj.visible = false;
      return;
    }
    a.a.x = x;
    a.a.y = y;
    a.a.z = z;
    this.stick(a, nx, ny, nz, color);
  }

  private stick(a: FlyArrow, nx: number, ny: number, nz: number, color: number): void {
    a.stuck = STICK_S;
    this.orient(a);
    this.effects.splat(a.a.x, a.a.y, a.a.z, nx, ny, nz, 0.62 + Math.random() * 0.18, color, -1);
    this.effects.burst(a.a.x, a.a.y, a.a.z, color, 10, 3.6, nx, ny, nz, 0.04);
    this.onImpact('arrow', a.a.x, a.a.y, a.a.z);
  }

  private orient(a: FlyArrow): void {
    a.obj.position.set(a.a.x, a.a.y, a.a.z);
    _v.set(a.a.vx, a.a.vy, a.a.vz);
    if (_v.lengthSq() > 1e-6) a.obj.quaternion.setFromUnitVectors(FWD, _v.normalize());
  }

  // ------------------------------------------------------------ ведёрки

  /** Ведёрко: кувыркается, роняет капли; разливается там, где ударилось (или по событию сервера — что раньше) */
  bucket(owner: number, ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, team: 0 | 1, color: number): void {
    let b = this.buckets.find((x) => !x.active && x.team === team);
    if (!b) {
      if (this.buckets.length >= 10) return;
      b = { obj: bucketMesh(team), team, active: false, owner: 0, g: makeGrenade(), t: 0, acc: 0, spin: new THREE.Vector3(), splashed: false, color };
      this.scene.add(b.obj);
      this.buckets.push(b);
    }
    b.active = true;
    b.owner = owner;
    b.t = 0;
    b.acc = 0;
    b.splashed = false;
    b.color = color;
    Object.assign(b.g, { x: ox, y: oy, z: oz, vx, vy, vz, rest: false });
    b.spin.set(6 + Math.random() * 3, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3);
    b.obj.visible = true;
    b.obj.rotation.set(0, Math.atan2(-vx, -vz), 0);
    b.obj.position.set(ox, oy, oz);
  }

  /** Сервер: ведёрко разлилось */
  bucketSplash(owner: number, x: number, y: number, z: number, color: number): void {
    let best: FlyBucket | null = null;
    for (const b of this.buckets) if (b.owner === owner && (b.active || b.splashed) && (!best || b.t > best.t)) best = b;
    if (best?.splashed && Math.hypot(best.g.x - x, best.g.z - z) < 1.6) return;
    if (best) {
      best.active = false;
      best.obj.visible = false;
      best.splashed = true;
    }
    this.splash(x, y, z, color);
  }

  private splash(x: number, y: number, z: number, color: number): void {
    const fx = this.effects;
    const ground = this.world.groundBelow(x, y + 0.5, z);
    const gy = ground > -100 && y - ground < 2.5 ? ground : y;
    fx.splat(x, gy, z, 0, 1, 0, BUCKET_R * 1.5, color, -1);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random();
      const r = BUCKET_R * (0.55 + Math.random() * 0.45);
      fx.splat(x + Math.cos(a) * r, gy, z + Math.sin(a) * r, 0, 1, 0, 0.5 + Math.random() * 0.5, color, -1);
    }
    fx.burst(x, gy + 0.3, z, color, 46, 7.5, 0, 1, 0, 0.06);
    fx.puff(x, gy + 0.6, z, 2.6, color, 0.45, 0.6, 0.55);
    fx.puff(x, gy + 0.4, z, 1.8, 0xffffff, 0.3, 0.4, 0.3);
    this.onImpact('bucket', x, gy, z);
  }

  // ------------------------------------------------------------ дуга

  /** Пунктир: n точек подряд (x, y, z), кольцо — где кончится; ok — можно (ведёрко готово), иначе красноватый */
  setArc(pts: ArrayLike<number>, n: number, ex: number, ey: number, ez: number, ok: boolean, ring: number): void {
    const m = Math.min(n, this.arcPos.length / 3);
    for (let i = 0; i < m * 3; i++) this.arcPos[i] = pts[i];
    const g = this.arc.geometry;
    g.setDrawRange(0, m);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.arc.material as THREE.PointsMaterial).color.setHex(ok ? 0xfff1c8 : 0xff8a7a);
    this.arc.visible = true;
    this.arcRing.visible = ring > 0;
    this.arcRing.scale.setScalar(Math.max(0.2, ring));
    this.arcRing.position.set(ex, ey + 0.06, ez);
    (this.arcRing.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0xffb35a : 0xff6b6b);
  }

  hideArc(): void {
    this.arc.visible = false;
    this.arcRing.visible = false;
  }

  // ------------------------------------------------------------ кадр

  update(dt: number): void {
    // капли
    let n = 0;
    for (const d of this.drops) {
      if (!d.active) continue;
      if (d.delay > 0) {
        d.delay -= dt;
        continue;
      }
      d.t += dt;
      let k = d.t / d.dur;
      if (k >= 1) {
        if (d.kind === 2 && d.t < d.dur + 0.4) {
          // мимо: капля падает дальше
          k = 1 + (d.t - d.dur) / d.dur;
        } else {
          d.active = false;
          this.land(d);
          continue;
        }
      }
      const x = d.fx + (d.tx - d.fx) * k;
      const y = d.fy + (d.ty - d.fy) * k - d.sag * 4 * k * (1 - k) * 0.25 - (k > 1 ? (k - 1) * (k - 1) * 3 : 0);
      const z = d.fz + (d.tz - d.fz) * k;
      _v.set(d.tx - d.fx, d.ty - d.fy, d.tz - d.fz).normalize();
      _q.setFromUnitVectors(Y, _v);
      _s.set(d.size, d.size * 2.6, d.size);
      _m.compose(_v.set(x, y, z), _q, _s);
      this.dropMesh.setMatrixAt(n, _m);
      this.dropMesh.setColorAt(n, _c.set(d.color));
      n++;
    }
    this.dropMesh.count = n;
    if (n > 0) {
      this.dropMesh.instanceMatrix.needsUpdate = true;
      if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;
    }

    // стрелы: летят целыми тиками (как у сервера), торчащие — тают
    for (const a of this.arrows) {
      if (!a.active) continue;
      if (a.stuck > 0) {
        a.stuck -= dt;
        if (a.stuck < 0.4) a.obj.scale.setScalar(Math.max(0.01, a.stuck / 0.4));
        if (a.stuck <= 0) {
          a.active = false;
          a.obj.visible = false;
        }
        continue;
      }
      const steps = Math.max(1, Math.round(dt / DT));
      for (let i = 0; i < steps; i++) {
        if (arrowStep(a.a, this.world, this.hit)) {
          this.stick(a, this.hit.nx, this.hit.ny, this.hit.nz, TEAM_COLORS[a.team]);
          break;
        }
        if (a.a.t > 200 || a.a.y < -4) {
          a.active = false;
          a.obj.visible = false;
          break;
        }
      }
      if (a.active && a.stuck <= 0) this.orient(a);
    }

    // ведёрки: шаги тиками, кувырок, капли за собой
    for (const b of this.buckets) {
      if (!b.active) continue;
      b.acc += dt;
      b.t += dt;
      while (b.acc >= DT && b.active) {
        b.acc -= DT;
        if (bucketStep(b.g, this.world, this.hit) || b.t > 2.5 || b.g.y < -2) {
          b.active = false;
          b.obj.visible = false;
          b.splashed = true;
          if (b.g.y > -1.2) this.splash(b.g.x, b.g.y, b.g.z, b.color);
          else this.effects.waterSplash(b.g.x, b.g.z, true);
        }
      }
      if (!b.active) continue;
      b.obj.position.set(b.g.x, b.g.y, b.g.z);
      b.obj.rotation.x += b.spin.x * dt;
      b.obj.rotation.z += b.spin.z * dt;
      if (Math.random() < dt * 14) this.effects.burst(b.g.x, b.g.y, b.g.z, b.color, 1, 0.8, 0, -1, 0, 0.035);
    }
  }

  clear(): void {
    for (const d of this.drops) d.active = false;
    this.dropMesh.count = 0;
    for (const a of this.arrows) {
      a.active = false;
      a.obj.visible = false;
    }
    for (const b of this.buckets) {
      b.active = false;
      b.splashed = false;
      b.obj.visible = false;
    }
    this.hideArc();
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.dropMesh, this.arc, this.arcRing);
    for (const a of this.arrows) this.scene.remove(a.obj);
    for (const b of this.buckets) this.scene.remove(b.obj);
  }
}

// ------------------------------------------------------------ пунктир: те же шаги, что у сервера

const arcHit = makeRayHit();

/** Куда полетит стрела: из (ox, oy, oz) по (dx, dy, dz) со скоростью speed. Точки — в out (x, y, z подряд), вернёт их число */
export function bowArc(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, speed: number, world: CollisionWorld, out: Float32Array): number {
  const a: Arrow = { x: ox, y: oy, z: oz, vx: dx * speed, vy: dy * speed, vz: dz * speed, t: 0 };
  const max = out.length / 3;
  let n = 0;
  out[0] = ox;
  out[1] = oy;
  out[2] = oz;
  n = 1;
  for (let i = 0; i < 270 && n < max; i++) {
    const hitW = arrowStep(a, world, arcHit);
    if (i % 3 === 2 || hitW) {
      out[n * 3] = a.x;
      out[n * 3 + 1] = a.y;
      out[n * 3 + 2] = a.z;
      n++;
    }
    if (hitW || a.y < -2) break;
  }
  return n;
}

/** Куда упадёт ведёрко, брошенное игроком в (px, py, pz) со взглядом (yaw, pitch) */
export function bucketArc(px: number, py: number, pz: number, yaw: number, pitch: number, world: CollisionWorld, out: Float32Array): number {
  const g = makeGrenade();
  bucketLaunch(px, py, pz, yaw, pitch, world, arcHit, g);
  const max = out.length / 3;
  out[0] = g.x;
  out[1] = g.y;
  out[2] = g.z;
  let n = 1;
  for (let i = 0; i < 150 && n < max; i++) {
    const landed = bucketStep(g, world, arcHit);
    if (i % 2 === 1 || landed) {
      out[n * 3] = g.x;
      out[n * 3 + 1] = g.y;
      out[n * 3 + 2] = g.z;
      n++;
    }
    if (landed || g.y < -2) break;
  }
  return n;
}

let dot: THREE.Texture | null = null;
/** Круглая мягкая точка для пунктира дуги */
function dotTexture(): THREE.Texture {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(0.7, '#fff');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  dot = new THREE.CanvasTexture(c);
  return dot;
}
