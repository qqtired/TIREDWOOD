// Эффекты набережной: монеты из лотка автомата (подпрыгивают на ковре и ложатся плашмя), всплывающие
// надписи «+50», холодные фонтаны искр у автомата (крупный выигрыш), конфетти и салют при джекпоте,
// звёздочки и сердечки (жесты вдвоём).
// Всё — из заранее созданных пулов, без аллокаций в кадре.
// Брызги от падения в воду рисует общий Effects (как в пейнтболе).
import * as THREE from 'three';
import { glowTexture } from '../render/kit.ts';
import { metalEnvTexture } from '../render/textures.ts';
import type { LobbyQuality } from './world.ts';

const MAX_COINS = 160;
const MAX_TEXTS = 8;
const COIN_LIFE = 3.4;
/** Монета лежит на ковре на этой высоте (над накладкой ковра) */
const COIN_REST_Y = 0.02;
const COIN_GRAVITY = 13;
const TEXT_LIFE = 1.9;
/** Надпись всплывает на столько метров */
const TEXT_RISE = 0.42;
/** Салют: искр в залпе и запас на хвосты ракет */
const SPARKS_PER_BURST: Record<LobbyQuality, number> = { high: 110, medium: 80, low: 50 };
const MAX_SPARKS = 1100;
const SPARK_GRAVITY = 3.2;
const SPARK_DRAG = 1.5;
/** Фонтаны у автомата: искры мельче и падают быстрее; сколько в секунду из одного фонтана */
const MAX_NEAR_SPARKS = 600;
const FOUNTAIN_RATE: Record<LobbyQuality, number> = { high: 160, medium: 110, low: 70 };
const NEAR_GRAVITY = 8;
const NEAR_DRAG = 1.1;
const ROCKET_S = 0.6;
const PALETTE = [0xffd34d, 0xff5a4a, 0x6ad1ff, 0xb689ff, 0x7dff8f, 0xffffff, 0xff9a3c];
/** Конфетти: бумажки 12 × 8 см (крупнее настоящих, иначе издалека не видно), кувыркаются и планируют вниз; на полу лежат, пока не истечёт срок */
const MAX_CONFETTI = 900;
const CONFETTI_LIFE = 6;
const CONFETTI_GRAVITY = 9.8;
/** Сопротивление воздуха: сразу после выстрела слабое (летят далеко), потом сильное (падают ~1,5 м/с) */
const CONFETTI_DRAG_START = 0.7;
const CONFETTI_DRAG_END = 6.5;
/** За сколько секунд сопротивление нарастает от начального до конечного */
const CONFETTI_DRAG_RAMP = 1.0;
const CONFETTI_COLORS = [0xff4f5e, 0xffc93c, 0x3fb6ff, 0x7ee06a, 0xc77dff, 0xff8a3c, 0xffffff, 0xff7ab8];
/** Звёздочки и сердечки: сколько сразу, сколько живут, с */
const MAX_POPS = 32;
const POP_LIFE = 1.3;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const TAU = Math.PI * 2;

interface Coin {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Наклон и вращение: монета кувыркается в полёте, на полу ложится плашмя */
  tilt: number;
  turn: number;
  spinTilt: number;
  spinTurn: number;
  life: number;
  /** Сколько ещё ждать в лотке (монеты вылетают струйкой) */
  wait: number;
  grounded: boolean;
}

interface FloatText {
  sprite: THREE.Sprite;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  life: number;
  y0: number;
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  max: number;
  /** Ракета: летит вверх и по пути сыплет хвостом, в конце — залп */
  rocket: boolean;
}

interface Burst {
  at: number;
  x: number;
  y: number;
  z: number;
  launched: boolean;
}

interface Fountain {
  x: number;
  y: number;
  z: number;
  until: number;
  /** Накопленная доля следующей искры */
  acc: number;
}

/**
 * Облако искр одного размера: точки со светящимся пятнышком, складываются по яркости. Цвет — RGBA: искра гаснет
 * прозрачностью. core — ещё и плотная цветная серединка обычным смешиванием: на светлом дневном небе
 * одно свечение выцветает в белое, а с серединкой цвет залпа читается.
 */
class SparkCloud {
  private readonly sparks: Spark[] = [];
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly gravity: number;
  private readonly drag: number;
  private next = 0;
  private alive = 0;

  constructor(scene: THREE.Scene, max: number, size: number, gravity: number, drag: number, order: number, core = 0) {
    this.gravity = gravity;
    this.drag = drag;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    // свечение снизу, серединка поверх; при серединке свечение слабее — иначе оно выбеливает цвет
    const layers: Array<[number, THREE.Blending, number]> = [[size, THREE.AdditiveBlending, core > 0 ? 0.45 : 1]];
    if (core > 0) layers.push([core, THREE.NormalBlending, 1]);
    for (const [sz, blending, opacity] of layers) {
      const mat = new THREE.PointsMaterial({
        size: sz, sizeAttenuation: true, map: glowTexture(), vertexColors: true, transparent: true, opacity,
        depthWrite: false, blending, fog: false, toneMapped: false,
      });
      const points = new THREE.Points(this.geo, mat);
      points.frustumCulled = false;
      points.renderOrder = order;
      scene.add(points);
    }
    for (let i = 0; i < max; i++) {
      this.sparks.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, life: 0, max: 1, rocket: false });
      this.pos[i * 3 + 1] = -100;
    }
  }

  /** Следующая искра из кольца (самые старые затираются). */
  spawn(): Spark {
    const s = this.sparks[this.next];
    this.next = (this.next + 1) % this.sparks.length;
    this.alive++;
    return s;
  }

  clear(): void {
    for (const s of this.sparks) s.life = 0;
    // точки погасит ближайший update
    this.alive = Math.max(this.alive, 1);
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    const drag = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      const o = i * 3;
      const q = i * 4;
      if (s.life <= 0) {
        if (this.col[q + 3] !== 0) {
          this.col[q + 3] = 0;
          this.pos[o + 1] = -100;
        }
        continue;
      }
      s.life -= dt;
      if (s.rocket) {
        s.y += s.vy * dt;
        // хвост: тусклые искорки, гаснут быстро
        if (Math.random() < 0.7) {
          const t = this.spawn();
          t.x = s.x + (Math.random() - 0.5) * 0.08;
          t.y = s.y;
          t.z = s.z + (Math.random() - 0.5) * 0.08;
          t.vx = (Math.random() - 0.5) * 0.6;
          t.vy = -1 - Math.random();
          t.vz = (Math.random() - 0.5) * 0.6;
          t.r = 1;
          t.g = 0.6;
          t.b = 0.25;
          t.max = 0.35;
          t.life = 0.35;
          t.rocket = false;
        }
      } else {
        s.vx *= drag;
        s.vy = s.vy * drag - this.gravity * dt;
        s.vz *= drag;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
      }
      // гаснет к концу, в последней трети — мерцает
      const k = Math.max(0, s.life / s.max);
      const flicker = k < 0.35 && !s.rocket ? 0.4 + Math.random() * 0.6 : 1;
      const lum = Math.min(1, k * 1.6) * flicker;
      this.pos[o] = s.x;
      this.pos[o + 1] = s.y;
      this.pos[o + 2] = s.z;
      this.col[q] = s.r;
      this.col[q + 1] = s.g;
      this.col[q + 2] = s.b;
      this.col[q + 3] = lum;
      alive++;
    }
    this.alive = alive;
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Кувыркание: углы и их скорости */
  ax: number;
  ay: number;
  az: number;
  wx: number;
  wy: number;
  wz: number;
  /** Порхание из стороны в сторону: фаза и частота */
  ph: number;
  fr: number;
  age: number;
  life: number;
  grounded: boolean;
}

interface Pop {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  spin: number;
  size: number;
}

/** Звёздочка (0) или сердечко (1) на прозрачном фоне. */
function iconTexture(kind: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.beginPath();
  if (kind === 0) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 24 : 56;
      g.lineTo(64 + Math.cos(a) * r, 68 + Math.sin(a) * r);
    }
  } else {
    g.moveTo(64, 112);
    g.bezierCurveTo(14, 78, 8, 46, 26, 30);
    g.bezierCurveTo(42, 16, 60, 24, 64, 40);
    g.bezierCurveTo(68, 24, 86, 16, 102, 30);
    g.bezierCurveTo(120, 46, 114, 78, 64, 112);
  }
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 9;
  g.strokeStyle = kind === 0 ? '#9a5a08' : '#8f1036';
  g.stroke();
  const grad = g.createLinearGradient(0, 16, 0, 112);
  grad.addColorStop(0, kind === 0 ? '#fff4a8' : '#ff9ac0');
  grad.addColorStop(1, kind === 0 ? '#ffb31f' : '#ff3d7a');
  g.fillStyle = grad;
  g.fill();
  // блик
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(kind === 0 ? 52 : 40, kind === 0 ? 50 : 44, 9, 5, -0.6, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Звёздочки и сердечки: выскакивают из точки, разлетаются, всплывают и гаснут. */
class Pops {
  private readonly items: Pop[] = [];
  private readonly maps: THREE.Texture[];
  private next = 0;

  constructor(scene: THREE.Scene) {
    this.maps = [iconTexture(0), iconTexture(1)];
    for (let i = 0; i < MAX_POPS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.maps[0], transparent: true, depthWrite: false, fog: false }));
      sprite.visible = false;
      sprite.renderOrder = 7;
      scene.add(sprite);
      this.items.push({ sprite, vx: 0, vy: 0, vz: 0, age: 0, life: 0, spin: 0, size: 0 });
    }
  }

  burst(x: number, y: number, z: number, kind: number, count: number): void {
    for (let k = 0; k < count; k++) {
      const p = this.items[this.next];
      this.next = (this.next + 1) % MAX_POPS;
      const a = (k / count) * TAU + Math.random() * 0.7;
      const out = 0.8 + Math.random() * 0.8;
      p.vx = Math.cos(a) * out;
      p.vz = Math.sin(a) * out;
      p.vy = 1.1 + Math.random() * 1.0;
      p.age = 0;
      p.life = POP_LIFE * (0.8 + Math.random() * 0.4);
      p.spin = (Math.random() - 0.5) * 4;
      p.size = 0.16 + Math.random() * 0.1;
      const m = p.sprite.material;
      m.map = this.maps[kind] ?? this.maps[0];
      m.rotation = (Math.random() - 0.5) * 0.8;
      m.opacity = 1;
      p.sprite.position.set(x, y, z);
      p.sprite.scale.setScalar(0.01);
      p.sprite.visible = true;
    }
  }

  clear(): void {
    for (const p of this.items) {
      p.life = 0;
      p.sprite.visible = false;
    }
  }

  update(dt: number): void {
    const drag = Math.exp(-dt * 2.6);
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.age += dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      // разлёт гаснет, а вверх тянет: всплывают, как пузырьки
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag + 0.5 * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const t = p.age;
      const pop = t < 0.12 ? (t / 0.12) * 1.3 : t < 0.26 ? 1.3 - ((t - 0.12) / 0.14) * 0.3 : 1;
      p.sprite.scale.setScalar(p.size * pop);
      p.sprite.material.rotation += p.spin * dt;
      p.sprite.material.opacity = Math.min(1, p.life / 0.45);
    }
  }
}

/** Конфетти: бумажки одним инстансным мешем, у каждой своё место в пуле и свой цвет. */
class Confetti {
  private readonly bits: Bit[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private alive = 0;

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.08), mat, MAX_CONFETTI);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    for (let i = 0; i < MAX_CONFETTI; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, _c.set(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]));
      this.bits.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, wx: 0, wy: 0, wz: 0, ph: 0, fr: 0, age: 0, life: 0, grounded: false });
    }
    scene.add(this.mesh);
  }

  /** count бумажек из (x, y, z) в сторону (dx, dy, dz): конус разлёта spread, скорость до speed м/с. */
  burst(x: number, y: number, z: number, count: number, dx: number, dy: number, dz: number, spread: number, speed: number): void {
    const n0 = Math.hypot(dx, dy, dz) || 1;
    for (let k = 0; k < count; k++) {
      const b = this.bits[this.next];
      this.next = (this.next + 1) % MAX_CONFETTI;
      const vx = dx / n0 + (Math.random() - 0.5) * 2 * spread;
      const vy = dy / n0 + (Math.random() - 0.5) * 2 * spread;
      const vz = dz / n0 + (Math.random() - 0.5) * 2 * spread;
      const n = Math.hypot(vx, vy, vz) || 1;
      const v = speed * (0.5 + Math.random() * 0.5);
      b.x = x + (Math.random() - 0.5) * 0.12;
      b.y = y;
      b.z = z + (Math.random() - 0.5) * 0.12;
      b.vx = (vx / n) * v;
      b.vy = (vy / n) * v;
      b.vz = (vz / n) * v;
      b.ax = Math.random() * TAU;
      b.ay = Math.random() * TAU;
      b.az = Math.random() * TAU;
      b.wx = (Math.random() - 0.5) * 18;
      b.wy = (Math.random() - 0.5) * 8;
      b.wz = (Math.random() - 0.5) * 18;
      b.ph = Math.random() * TAU;
      b.fr = 3 + Math.random() * 4;
      b.age = 0;
      b.life = CONFETTI_LIFE * (0.75 + Math.random() * 0.5);
      b.grounded = false;
    }
    this.alive = Math.max(this.alive, 1);
    this.mesh.visible = true;
  }

  clear(): void {
    for (const b of this.bits) b.life = 0;
    if (this.mesh.visible) this.alive = Math.max(this.alive, 1);
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < MAX_CONFETTI; i++) {
      const b = this.bits[i];
      if (b.life <= 0) {
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      b.life -= dt;
      b.age += dt;
      if (!b.grounded) {
        const k = CONFETTI_DRAG_START + (CONFETTI_DRAG_END - CONFETTI_DRAG_START) * Math.min(1, b.age / CONFETTI_DRAG_RAMP);
        const drag = Math.exp(-k * dt);
        b.vx *= drag;
        b.vz *= drag;
        b.vy = (b.vy - CONFETTI_GRAVITY * dt) * drag;
        // порхает, когда уже падает
        const flutter = Math.min(1, b.age / 0.6) * 0.55;
        b.x += (b.vx + Math.sin(b.age * b.fr + b.ph) * flutter) * dt;
        b.y += b.vy * dt;
        b.z += (b.vz + Math.cos(b.age * b.fr * 0.8 + b.ph) * flutter) * dt;
        b.ax += b.wx * dt;
        b.ay += b.wy * dt;
        b.az += b.wz * dt;
        if (b.y <= 0.015 && b.vy < 0) {
          // легла на пол плашмя
          b.y = 0.015;
          b.grounded = true;
          b.ax = -Math.PI / 2;
          b.az = 0;
        }
      }
      _e.set(b.ax, b.ay, b.az, 'YXZ');
      _q.setFromEuler(_e);
      _s.setScalar(Math.min(1, b.life / 0.5));
      _m.compose(_p.set(b.x, b.y, b.z), _q, _s);
      this.mesh.setMatrixAt(i, _m);
      alive++;
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (alive === 0) this.mesh.visible = false;
  }
}

export class LobbyFx {
  /** Залп салюта (для звука) */
  onBurst: (x: number, y: number, z: number) => void = () => {};
  private readonly coinPool: Coin[] = [];
  private readonly coinMesh: THREE.InstancedMesh;
  private coinNext = 0;
  private readonly texts: FloatText[] = [];
  private textNext = 0;
  /** Искры салюта в небе и мелкие — фонтанов у автомата */
  private readonly sky: SparkCloud;
  private readonly near: SparkCloud;
  private readonly bursts: Burst[] = [];
  private readonly fountains: Fountain[] = [];
  private readonly paper: Confetti;
  private readonly pops: Pops;
  /** Доля конфетти по качеству графики */
  private paperK: number;
  private perBurst: number;
  private fountainRate: number;
  private time = 0;

  constructor(scene: THREE.Scene, quality: LobbyQuality) {
    this.perBurst = SPARKS_PER_BURST[quality];
    this.paperK = quality === 'high' ? 1 : quality === 'medium' ? 0.75 : 0.5;
    this.fountainRate = FOUNTAIN_RATE[quality];

    // --- монеты: золотые жетоны с отражениями — крупнее настоящих, иначе за пару метров их не видно
    const coinGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.011, 20);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc847, metalness: 1, roughness: 0.3, envMap: metalEnvTexture(), envMapIntensity: 1.3 });
    this.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, MAX_COINS);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.coinMesh.castShadow = true;
    scene.add(this.coinMesh);
    for (let i = 0; i < MAX_COINS; i++) {
      this.coinPool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tilt: 0, turn: 0, spinTilt: 0, spinTurn: 0, life: 0, wait: 0, grounded: false });
    }

    // --- всплывающие надписи
    for (let i = 0; i < MAX_TEXTS; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 120;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false }));
      sprite.visible = false;
      sprite.renderOrder = 8;
      scene.add(sprite);
      this.texts.push({ sprite, ctx: canvas.getContext('2d')!, tex, life: 0, y0: 0 });
    }

    // --- искры: крупные в небе (видно с другого конца площади), мелкие — у автомата
    this.sky = new SparkCloud(scene, MAX_SPARKS, 0.6, SPARK_GRAVITY, SPARK_DRAG, 7, 0.26);
    this.near = new SparkCloud(scene, MAX_NEAR_SPARKS, 0.07, NEAR_GRAVITY, NEAR_DRAG, 7);
    this.paper = new Confetti(scene);
    this.pops = new Pops(scene);
  }

  /** Монеты из лотка в (x, y, z), летят в сторону (fx, fz) — от автомата к игроку. */
  coins(x: number, y: number, z: number, count: number, fx = 0, fz = 1): void {
    for (let k = 0; k < count; k++) {
      const c = this.coinPool[this.coinNext];
      this.coinNext = (this.coinNext + 1) % MAX_COINS;
      // веером в стороны: прямо вперёд их заслонил бы тот, кто стоит у автомата
      const side = (Math.random() - 0.5) * 2;
      const fwd = 0.5 + Math.random() * 1.4;
      // не все сразу: струйка из лотка
      const delay = k * 0.018;
      c.x = x + side * 0.12 * -fz;
      c.y = y + Math.random() * 0.04;
      c.z = z + side * 0.12 * fx;
      c.vx = fx * fwd + -fz * side * 2.4;
      c.vy = 2.4 + Math.random() * 2.8;
      c.vz = fz * fwd + fx * side * 2.4;
      c.tilt = Math.random() * Math.PI;
      c.turn = Math.random() * Math.PI * 2;
      c.spinTilt = (Math.random() - 0.5) * 26;
      c.spinTurn = (Math.random() - 0.5) * 12;
      c.life = COIN_LIFE + delay;
      c.wait = delay;
      c.grounded = false;
    }
  }

  /** Надпись над точкой: всплывает и гаснет. */
  floatText(x: number, y: number, z: number, text: string, color: string): void {
    const t = this.texts[this.textNext];
    this.textNext = (this.textNext + 1) % MAX_TEXTS;
    const { ctx, tex } = t;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    let size = 84;
    ctx.font = `900 ${size}px Rubik, system-ui, sans-serif`;
    while (ctx.measureText(text).width > W - 36 && size > 30) {
      size -= 4;
      ctx.font = `900 ${size}px Rubik, system-ui, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255, 190, 70, 0.9)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#2a1206';
    ctx.strokeText(text, W / 2, H / 2 + 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, H / 2 + 4);
    tex.needsUpdate = true;
    t.sprite.position.set(x, y, z);
    t.sprite.visible = true;
    t.life = TEXT_LIFE;
    t.y0 = y;
  }

  /** Салют: bursts залпов вокруг center, по очереди. */
  fireworks(center: THREE.Vector3, bursts: number): void {
    for (let i = 0; i < bursts; i++) {
      this.bursts.push({
        at: this.time + i * 0.42 + Math.random() * 0.15,
        x: center.x + (Math.random() - 0.5) * 14,
        y: center.y + (Math.random() - 0.5) * 4,
        z: center.z + (Math.random() - 0.5) * 6,
        launched: false,
      });
    }
  }

  /** Конфетти из точки: count бумажек в сторону (dx, dy, dz), разлёт spread, скорость до speed м/с. */
  confetti(x: number, y: number, z: number, count: number, dx = 0, dy = 1, dz = 0, spread = 0.4, speed = 6): void {
    this.paper.burst(x, y, z, Math.round(count * this.paperK), dx, dy, dz, spread, speed);
  }

  /** Звёздочки (kind 0) или сердечки (1) из точки — жест вдвоём. */
  icons(x: number, y: number, z: number, kind: number, count: number): void {
    this.pops.burst(x, y, z, kind, count);
  }

  /** Искорки во все стороны из точки (хлопок ладоней). */
  sparkle(x: number, y: number, z: number, count: number): void {
    for (let k = 0; k < count; k++) {
      const s = this.near.spawn();
      const u = Math.random() * 2 - 1;
      const a = Math.random() * TAU;
      const r = Math.sqrt(1 - u * u);
      const v = 1.6 + Math.random() * 1.8;
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = r * Math.cos(a) * v;
      s.vy = u * v + 1.2;
      s.vz = r * Math.sin(a) * v;
      s.r = 1;
      s.g = 0.88 + Math.random() * 0.12;
      s.b = 0.5 + Math.random() * 0.45;
      s.max = 0.4 + Math.random() * 0.3;
      s.life = s.max;
      s.rocket = false;
    }
  }

  /** Холодный фонтан искр из точки на полу на seconds секунд (крупный выигрыш, джекпот). */
  fountain(x: number, y: number, z: number, seconds: number): void {
    this.fountains.push({ x, y, z, until: this.time + seconds, acc: 0 });
  }

  /** Убрать всё сразу (ушли с набережной): монеты, надписи, фонтаны, салют. */
  clear(): void {
    for (const c of this.coinPool) c.life = 0;
    this.coinMesh.count = 0;
    for (const t of this.texts) {
      t.life = 0;
      t.sprite.visible = false;
    }
    this.bursts.length = 0;
    this.fountains.length = 0;
    this.sky.clear();
    this.near.clear();
    this.paper.clear();
    this.pops.clear();
  }

  update(dt: number): void {
    this.time += dt;
    this.updateCoins(dt);
    this.updateTexts(dt);
    this.updateFountains(dt);
    this.updateFireworks(dt);
    this.paper.update(dt);
    this.pops.update(dt);
  }

  /** Переключение пресета действует и на следующие залпы, без пересоздания сцены. */
  setQuality(quality: LobbyQuality): void {
    this.perBurst = SPARKS_PER_BURST[quality];
    this.paperK = quality === 'high' ? 1 : quality === 'medium' ? 0.75 : 0.5;
    this.fountainRate = FOUNTAIN_RATE[quality];
  }

  private updateCoins(dt: number): void {
    let n = 0;
    for (const c of this.coinPool) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.wait > 0) {
        // ещё в лотке — невидима
        c.wait -= dt;
        continue;
      }
      if (!c.grounded) {
        c.vy -= COIN_GRAVITY * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.tilt += c.spinTilt * dt;
        c.turn += c.spinTurn * dt;
        if (c.y < COIN_REST_Y && c.vy < 0) {
          c.y = COIN_REST_Y;
          if (-c.vy < 1.1) {
            c.grounded = true;
            c.vy = 0;
          } else {
            c.vy = -c.vy * 0.38;
            c.vx *= 0.62;
            c.vz *= 0.62;
            c.spinTilt *= 0.55;
          }
        }
      } else {
        // докатилась и легла: наклон уходит к плашмя
        c.vx *= Math.exp(-6 * dt);
        c.vz *= Math.exp(-6 * dt);
        c.x += c.vx * dt;
        c.z += c.vz * dt;
        const flat = Math.round(c.tilt / Math.PI) * Math.PI;
        c.tilt += (flat - c.tilt) * Math.min(1, dt * 14);
        c.spinTurn *= Math.exp(-5 * dt);
        c.turn += c.spinTurn * dt;
      }
      const fade = Math.min(1, c.life / 0.45);
      _e.set(c.tilt, c.turn, 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(c.x, c.y, c.z);
      _s.setScalar(fade);
      _m.compose(_p, _q, _s);
      this.coinMesh.setMatrixAt(n++, _m);
    }
    this.coinMesh.count = n;
    if (n) this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  private updateTexts(dt: number): void {
    for (const t of this.texts) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.sprite.visible = false;
        continue;
      }
      const age = TEXT_LIFE - t.life;
      const rise = 1 - Math.exp(-age * 2.2);
      t.sprite.position.y = t.y0 + rise * TEXT_RISE;
      const pop = age < 0.16 ? 0.55 + (age / 0.16) * 0.45 : 1;
      t.sprite.scale.set(0.96 * pop, 0.36 * pop, 1);
      t.sprite.material.opacity = Math.min(1, age / 0.08, t.life / 0.5);
    }
  }

  private updateFountains(dt: number): void {
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i];
      if (this.time >= f.until) {
        this.fountains.splice(i, 1);
        continue;
      }
      f.acc += dt * this.fountainRate;
      while (f.acc >= 1) {
        f.acc -= 1;
        const s = this.near.spawn();
        const a = Math.random() * Math.PI * 2;
        const spread = Math.random() * 0.55;
        s.x = f.x;
        s.y = f.y;
        s.z = f.z;
        s.vx = Math.cos(a) * spread;
        s.vy = 4.6 + Math.random() * 1.6;
        s.vz = Math.sin(a) * spread;
        // от золотых до почти белых
        const w = Math.random();
        s.r = 1;
        s.g = 0.75 + w * 0.25;
        s.b = 0.35 + w * 0.55;
        s.max = 0.75 + Math.random() * 0.45;
        s.life = s.max;
        s.rocket = false;
      }
    }
    this.near.update(dt);
  }

  private explode(b: Burst): void {
    this.onBurst(b.x, b.y, b.z);
    // один-два цвета на залп
    const c1 = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const c2 = Math.random() < 0.5 ? c1 : PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const speed = 6.5 + Math.random() * 2.5;
    for (let k = 0; k < this.perBurst; k++) {
      const s = this.sky.spawn();
      // равномерно по сфере
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = speed * (0.82 + Math.random() * 0.18);
      s.x = b.x;
      s.y = b.y;
      s.z = b.z;
      s.vx = r * Math.cos(a) * v;
      s.vy = u * v;
      s.vz = r * Math.sin(a) * v;
      _c.set(k % 2 ? c1 : c2);
      s.r = _c.r;
      s.g = _c.g;
      s.b = _c.b;
      s.max = 1.3 + Math.random() * 0.7;
      s.life = s.max;
      s.rocket = false;
    }
  }

  private updateFireworks(dt: number): void {
    // ракеты стартуют заранее, чтобы взорваться ровно в назначенное время
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      if (this.time >= b.at - ROCKET_S && !b.launched) {
        b.launched = true;
        const s = this.sky.spawn();
        s.x = b.x;
        s.y = b.y - ROCKET_S * 14;
        s.z = b.z;
        s.vx = 0;
        s.vy = 14;
        s.vz = 0;
        s.r = 1;
        s.g = 0.85;
        s.b = 0.55;
        s.max = ROCKET_S;
        s.life = ROCKET_S;
        s.rocket = true;
      }
      if (this.time >= b.at) {
        this.explode(b);
        this.bursts.splice(i, 1);
      }
    }
    this.sky.update(dt);
  }
}
