// Эффекты: шарики краски в полёте, кляксы на стенах (живут до конца раунда, самые старые сменяются новыми),
// брызги, облачка, круги на воде. Всё — из заранее созданных пулов, без аллокаций в кадре.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { makeRayHit } from '../../shared/world.ts';
import { softDot, splatAtlas } from './textures.ts';

const MAX_SPLATS = 720;
const MAX_BALLS = 160;
const MAX_DROPS = 700;
const MAX_PUFFS = 48;
const BALL_SPEED = 135;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export interface BallImpact {
  /** 0 — стена, 1 — игрок, 2 — в никуда */
  kind: number;
  nx: number;
  ny: number;
  nz: number;
  /** кого забрызгать по прилёте (id жертвы), если известно */
  victim: number;
  head: boolean;
}

interface Ball {
  active: boolean;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
  dur: number;
  sag: number;
  color: number;
  shooter: number;
  impact: BallImpact;
}

interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
}

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  size: number;
  grow: number;
  rise: number;
  alpha: number;
}

export class Effects {
  private readonly world: CollisionWorld;
  private readonly splats: THREE.InstancedMesh;
  private readonly atlasAttr: THREE.InstancedBufferAttribute;
  private splatNext = 0;
  private splatCount = 0;
  private splatSerial = 0;
  private temporarySplats = 0;
  private readonly splatIds = new Float64Array(MAX_SPLATS);
  private readonly splatLife = new Float32Array(MAX_SPLATS);
  private readonly balls: Ball[] = [];
  private readonly ballMesh: THREE.InstancedMesh;
  private readonly drops: Drop[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private dropNext = 0;
  private readonly puffs: Puff[] = [];
  private puffNext = 0;
  private readonly rings: Array<{ mesh: THREE.Mesh; life: number; max: number; size: number }> = [];
  private ringNext = 0;
  private readonly hit = makeRayHit();
  /** По прилёте шарика в игрока — забрызгать его (session подставляет) */
  onBallHitsPlayer: (victim: number, x: number, y: number, z: number, head: boolean, color: number) => void = () => {};
  /** Шарик шлёпнулся — для звука */
  onImpact: (x: number, y: number, z: number, kind: number) => void = () => {};

  constructor(scene: THREE.Scene, world: CollisionWorld) {
    this.world = world;

    // --- кляксы: инстансы квадрата с атласом из 4 вариантов
    const atlas = splatAtlas();
    const splatMat = new THREE.MeshStandardMaterial({
      map: atlas, transparent: true, depthWrite: false, roughness: 0.32, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    });
    splatMat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute vec2 aAtlas;\n' + shader.vertexShader.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n  vMapUv = vMapUv * 0.5 + aAtlas;',
      );
    };
    splatMat.customProgramCacheKey = () => 'splat-atlas';
    const quad = new THREE.PlaneGeometry(1, 1);
    this.atlasAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLATS * 2), 2);
    quad.setAttribute('aAtlas', this.atlasAttr);
    this.splats = new THREE.InstancedMesh(quad, splatMat, MAX_SPLATS);
    this.splats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.splats.setColorAt(0, _c.set(0xffffff));
    this.splats.count = 0;
    this.splats.frustumCulled = false;
    this.splats.receiveShadow = true;
    this.splats.renderOrder = 2;
    scene.add(this.splats);

    // --- шарики в полёте
    const ballGeo = new THREE.SphereGeometry(1, 10, 8);
    this.ballMesh = new THREE.InstancedMesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_BALLS);
    this.ballMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ballMesh.setColorAt(0, _c.set(0xffffff));
    this.ballMesh.count = 0;
    this.ballMesh.frustumCulled = false;
    scene.add(this.ballMesh);
    for (let i = 0; i < MAX_BALLS; i++) {
      this.balls.push({
        active: false, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, t: 0, dur: 1, sag: 0, color: 0, shooter: 0,
        impact: { kind: 2, nx: 0, ny: 0, nz: 0, victim: 0, head: false },
      });
    }

    // --- брызги
    const dropGeo = new THREE.IcosahedronGeometry(1, 1);
    this.dropMesh = new THREE.InstancedMesh(dropGeo, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0 }), MAX_DROPS);
    this.dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dropMesh.setColorAt(0, _c.set(0xffffff));
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    scene.add(this.dropMesh);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0 });
      this.dropMesh.setMatrixAt(i, _m);
    }

    // --- облачка (дым из дула, пыль)
    const puffTex = softDot('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    for (let i = 0; i < MAX_PUFFS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      sprite.renderOrder = 3;
      scene.add(sprite);
      this.puffs.push({ sprite, life: 0, max: 1, size: 1, grow: 1, rise: 0, alpha: 1 });
    }

    // --- круги на воде (на набережной их много: удочки игроков и рыбаков у маяка, мяч)
    const ringTex = makeRingTexture();
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, opacity: 0 }),
      );
      mesh.visible = false;
      mesh.position.y = WATER_Y + 0.03;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, size: 1 });
    }
  }

  // ------------------------------------------------------------ шарики

  /** Выпустить шарик: летит от from к to; по прилёте — клякса/брызги. */
  shootBall(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, color: number, shooter: number, impact: BallImpact): Ball | null {
    let ball: Ball | null = null;
    for (const b of this.balls) {
      if (!b.active) {
        ball = b;
        break;
      }
    }
    if (!ball) return null;
    const dist = Math.hypot(tx - fx, ty - fy, tz - fz);
    ball.active = true;
    ball.fx = fx;
    ball.fy = fy;
    ball.fz = fz;
    ball.tx = tx;
    ball.ty = ty;
    ball.tz = tz;
    ball.t = 0;
    ball.dur = Math.max(0.02, dist / BALL_SPEED);
    // лёгкая «дуга» — чисто визуально, попадание всё равно прямое
    ball.sag = Math.min(0.3, dist * 0.0028);
    ball.color = color;
    ball.shooter = shooter;
    ball.impact.kind = impact.kind;
    ball.impact.nx = impact.nx;
    ball.impact.ny = impact.ny;
    ball.impact.nz = impact.nz;
    ball.impact.victim = impact.victim;
    ball.impact.head = impact.head;
    return ball;
  }

  /** Последний летящий шарик этого стрелка (чтобы приписать ему жертву из события hit). */
  lastBallOf(shooter: number): Ball | null {
    let best: Ball | null = null;
    for (const b of this.balls) {
      if (b.active && b.shooter === shooter && (!best || b.t < best.t)) best = b;
    }
    return best;
  }

  private landBall(b: Ball): void {
    const im = b.impact;
    if (im.kind === 0) {
      this.splat(b.tx, b.ty, b.tz, im.nx, im.ny, im.nz, 0.42 + Math.random() * 0.3, b.color, -1);
      this.burst(b.tx, b.ty, b.tz, b.color, 7, 3.2, im.nx, im.ny, im.nz, 0.035);
    } else if (im.kind === 1) {
      this.burst(b.tx, b.ty, b.tz, b.color, 12, 4.2, 0, 0.4, 0, 0.045);
      if (im.victim) this.onBallHitsPlayer(im.victim, b.tx, b.ty, b.tz, im.head, b.color);
    }
    if (im.kind !== 2) this.onImpact(b.tx, b.ty, b.tz, im.kind);
  }

  // ------------------------------------------------------------ кляксы

  /**
   * Клякса на поверхности. box — индекс бокса (если известен), по нему размер
   * ограничивается, чтобы клякса не свисала с края. Невидимые боксы и батуты не красим.
   * box=-2: verified dynamic mesh surface. life=0 preserves the normal round-long paint.
   * Returns a generation-safe handle, or -1 when no visible paint can be placed.
   */
  splat(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, color: number, box: number, life = 0): number {
    const normalLength = Math.hypot(nx,ny,nz);
    if (!Number.isFinite(x+y+z+normalLength+size) || normalLength < .001 || size <= 0) return -1;
    nx/=normalLength;ny/=normalLength;nz/=normalLength;
    const w = this.world;
    if (box === -1) {
      if (w.raycast(x + nx * 0.06, y + ny * 0.06, z + nz * 0.06, -nx, -ny, -nz, 0.25, this.hit, true)) box = this.hit.box;
    }
    if (box >= 0) {
      if (w.invisible[box] || w.tramp[box]) return -1;
      // расстояние до краёв грани по двум касательным осям
      let d = Infinity;
      if (nx === 0) d = Math.min(d, x - w.minX[box], w.maxX[box] - x);
      if (ny === 0) d = Math.min(d, y - w.minY[box], w.maxY[box] - y);
      if (nz === 0) d = Math.min(d, z - w.minZ[box], w.maxZ[box] - z);
      if (d < 0.03) return -1;
      size = Math.min(size, Math.max(0.16, d * 2.3));
    } else if (y < -0.2) {
      return -1;
    }
    const i = this.splatNext;
    this.splatNext = (this.splatNext + 1) % MAX_SPLATS;
    if (this.splatCount < MAX_SPLATS) this.splatCount++;
    const id = ++this.splatSerial * MAX_SPLATS + i;
    if (this.splatLife[i]>0) this.temporarySplats--;
    this.splatIds[i] = id;
    this.splatLife[i] = Number.isFinite(life) && life > 0 ? life : 0;
    if (this.splatLife[i]>0) this.temporarySplats++;
    // чуть над поверхностью, чтобы не мерцало; соседние кляксы — на разной высоте
    const lift = 0.006 + (i % 16) * 0.0007;
    _v.set(nx, ny, nz);
    _q.setFromUnitVectors(Z_AXIS, _v);
    _q2.setFromAxisAngle(Z_AXIS, Math.random() * Math.PI * 2);
    _q.multiply(_q2);
    _s.set(size, size, size);
    _v2.set(x + nx * lift, y + ny * lift, z + nz * lift);
    _m.compose(_v2, _q, _s);
    this.splats.setMatrixAt(i, _m);
    // краска чуть светлее цвета команды и немного «гуляет» по тону
    _c.set(color).offsetHSL((Math.random() - 0.5) * 0.02, 0.05, (Math.random() - 0.5) * 0.06);
    this.splats.setColorAt(i, _c);
    const v = Math.floor(Math.random() * 4);
    this.atlasAttr.setXY(i, (v % 2) * 0.5, 0.5 - Math.floor(v / 2) * 0.5);
    this.splats.count = this.splatCount;
    this.splats.instanceMatrix.needsUpdate = true;
    if (this.splats.instanceColor) this.splats.instanceColor.needsUpdate = true;
    this.atlasAttr.needsUpdate = true;
    return id;
  }

  /** Большая клякса на полу там, где лопнула желейка. */
  deathSplat(x: number, y: number, z: number, color: number): void {
    const ground = this.world.groundBelow(x, y + 0.3, z);
    if (ground > -100 && y - ground < 3) this.splat(x, ground, z, 0, 1, 0, 2.3, color, -1);
    this.burst(x, y + 0.7, z, color, 34, 6, 0, 0.6, 0, 0.05);
    this.puff(x, y + 0.8, z, 1.6, color, 0.35, 0.5, 0.55);
  }

  clearSplats(): void {
    this.splatCount = 0;
    this.splatNext = 0;
    this.splats.count = 0;
    this.splatIds.fill(0);
    this.splatLife.fill(0);
    this.temporarySplats = 0;
  }

  /** Safe even when the ring has already reused this handle's old slot. */
  removeSplat(id: number): void {
    if (!Number.isSafeInteger(id) || id < MAX_SPLATS) return;
    const index = id % MAX_SPLATS;
    if (this.splatIds[index] !== id) return;
    this.splatIds[index] = 0;
    if (this.splatLife[index]!==0) this.temporarySplats--;
    this.splatLife[index] = 0;
    this.splats.setMatrixAt(index, _m.makeScale(0,0,0));
    this.splats.instanceMatrix.needsUpdate = true;
  }

  /** Room exit/round reset: no pending projectile may recreate paint after clearing. */
  clear(): void {
    this.clearSplats();
    for (const ball of this.balls) ball.active = false;
    this.ballMesh.count = 0;
    for (const drop of this.drops) {drop.life=0;drop.size=0;}
    this.dropMesh.count = 0;
    for (const puff of this.puffs) {puff.life=0;puff.sprite.visible=false;}
    for (const ring of this.rings) {ring.life=0;ring.mesh.visible=false;}
  }

  // ------------------------------------------------------------ брызги и облачка

  burst(x: number, y: number, z: number, color: number, count: number, speed: number, nx: number, ny: number, nz: number, size: number): void {
    _c.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.dropNext;
      this.dropNext = (this.dropNext + 1) % MAX_DROPS;
      const d = this.drops[i];
      // случайное направление, смещённое к нормали
      let dx = Math.random() * 2 - 1;
      let dy = Math.random() * 2 - 1;
      let dz = Math.random() * 2 - 1;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx = dx / l + nx * 1.2;
      dy = dy / l + ny * 1.2 + 0.5;
      dz = dz / l + nz * 1.2;
      const sp = speed * (0.35 + Math.random() * 0.75);
      d.x = x;
      d.y = y;
      d.z = z;
      d.vx = dx * sp;
      d.vy = dy * sp;
      d.vz = dz * sp;
      d.max = 0.45 + Math.random() * 0.5;
      d.life = d.max;
      d.size = size * (0.5 + Math.random());
      this.dropMesh.setColorAt(i, _c);
    }
    if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;
  }

  puff(x: number, y: number, z: number, size: number, color: number, life: number, rise: number, alpha = 0.6, grow = 1.8): void {
    const p = this.puffs[this.puffNext];
    this.puffNext = (this.puffNext + 1) % MAX_PUFFS;
    p.sprite.position.set(x, y, z);
    p.sprite.material.color.set(color);
    p.sprite.visible = true;
    p.life = life;
    p.max = life;
    p.size = size;
    p.grow = grow;
    p.rise = rise;
    p.alpha = alpha;
  }

  /** Плюх в воду: брызги и расходящиеся круги. */
  waterSplash(x: number, z: number, big = true): void {
    this.burst(x, WATER_Y + 0.1, z, 0xdff4ff, big ? 30 : 10, big ? 7 : 4, 0, 1.2, 0, big ? 0.06 : 0.04);
    for (let k = 0; k < (big ? 2 : 1); k++) {
      const r = this.rings[this.ringNext];
      this.ringNext = (this.ringNext + 1) % this.rings.length;
      r.mesh.position.set(x, WATER_Y + 0.03 + k * 0.005, z);
      r.mesh.visible = true;
      r.life = 1.4 + k * 0.5;
      r.max = r.life;
      r.size = big ? 4 + k * 2 : 2;
    }
  }

  /** Круг на воде (поплавок, проба, рыба у поверхности): расходится до size метров за life секунд. */
  ripple(x: number, z: number, size = 1.2, life = 1): void {
    const r = this.rings[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.rings.length;
    r.mesh.position.set(x, WATER_Y + 0.03, z);
    r.mesh.visible = true;
    r.life = life;
    r.max = life;
    r.size = size;
  }

  // ------------------------------------------------------------ кадр

  update(dt: number): void {
    if (this.temporarySplats>0) for (let i=0;i<this.splatCount;i++) {
      if (this.splatLife[i]<=0) continue;
      const remaining=this.splatLife[i]-dt;
      if (remaining<=0) this.removeSplat(this.splatIds[i]);
      else this.splatLife[i]=remaining;
    }
    // шарики
    let n = 0;
    for (const b of this.balls) {
      if (!b.active) continue;
      b.t += dt;
      let u = b.t / b.dur;
      if (u >= 1) {
        b.active = false;
        this.landBall(b);
        continue;
      }
      u = Math.max(0, u);
      const sag = 4 * b.sag * u * (1 - u);
      const x = b.fx + (b.tx - b.fx) * u;
      const y = b.fy + (b.ty - b.fy) * u - sag;
      const z = b.fz + (b.tz - b.fz) * u;
      _v.set(b.tx - b.fx, b.ty - b.fy, b.tz - b.fz).normalize();
      _q.setFromUnitVectors(Z_AXIS, _v);
      // вблизи дула шарик меньше вытянут (чтобы не «торчал» из ствола)
      const stretch = Math.min(1, b.t * 30);
      _s.set(0.045, 0.045, 0.045 + 0.22 * stretch);
      _v2.set(x, y, z);
      _m.compose(_v2, _q, _s);
      this.ballMesh.setMatrixAt(n, _m);
      this.ballMesh.setColorAt(n, _c.set(b.color).multiplyScalar(1.25));
      n++;
    }
    this.ballMesh.count = n;
    if (n) {
      this.ballMesh.instanceMatrix.needsUpdate = true;
      if (this.ballMesh.instanceColor) this.ballMesh.instanceColor.needsUpdate = true;
    }

    // брызги: простая баллистика, гаснут уменьшаясь
    let alive = 0;
    let maxIdx = 0;
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = this.drops[i];
      if (d.life <= 0) {
        if (d.size !== 0) {
          d.size = 0;
          _m.makeScale(0, 0, 0);
          this.dropMesh.setMatrixAt(i, _m);
        }
        continue;
      }
      d.life -= dt;
      d.vy -= 16 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      // пол пирса
      if (d.y < 0.02 && d.y > -0.4 && Math.abs(d.x) < 22) {
        d.y = 0.02;
        d.vy = 0;
        d.vx *= 0.6;
        d.vz *= 0.6;
      }
      const k = Math.max(0, d.life / d.max);
      const s = d.size * Math.sqrt(k);
      _m.makeScale(s, s * (1 + Math.min(1.2, Math.abs(d.vy) * 0.08)), s);
      _m.setPosition(d.x, d.y, d.z);
      this.dropMesh.setMatrixAt(i, _m);
      alive++;
      maxIdx = i + 1;
    }
    this.dropMesh.count = alive ? maxIdx : 0;
    if (alive) this.dropMesh.instanceMatrix.needsUpdate = true;

    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      p.sprite.scale.setScalar(p.size * (0.5 + k * p.grow));
      p.sprite.position.y += p.rise * dt;
      p.sprite.material.opacity = p.alpha * (1 - k) * (1 - k);
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.4 + k * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
  }
}

function makeRingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
