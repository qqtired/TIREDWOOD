// Общий «конструктор» статики для миров: склейка боксов в меши с развёрткой и запечённым затенением,
// декор карты (кнехты, фонари, бочки, буи, лодки), батуты и чайки. Им пользуются «Причал» и набережная.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import type { Deco, Trampoline } from '../../shared/maps/types.ts';
import { makeRng } from '../../shared/math.ts';
import * as tex from './textures.ts';

export interface GeoParts {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  idx: number[];
}

export function parts(): GeoParts {
  return { pos: [], nor: [], uv: [], col: [], idx: [] };
}

export function buildGeo(p: GeoParts): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
  g.setIndex(p.idx);
  g.computeBoundingSphere();
  return g;
}

export type V3 = [number, number, number];

/** Грань из 4 вершин (против часовой, если смотреть снаружи). */
export function quad(p: GeoParts, a: V3, b: V3, c: V3, d: V3, n: V3, uvs: number[], cols: THREE.Color[]): void {
  const base = p.pos.length / 3;
  for (const v of [a, b, c, d]) p.pos.push(v[0], v[1], v[2]);
  for (let i = 0; i < 4; i++) p.nor.push(n[0], n[1], n[2]);
  p.uv.push(...uvs);
  for (const c2 of cols) p.col.push(c2.r, c2.g, c2.b);
  p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

interface UvScale {
  /** метров на один повтор текстуры по горизонтали и вертикали */
  su: number;
  sv: number;
  /** false — у каждой грани своя развёртка 0..1 (ящики) */
  world: boolean;
  /** вертикаль отсчитывается от низа бокса (контейнеры) */
  local: boolean;
}

const UV: Record<string, UvScale> = {
  container: { su: 2.44, sv: 2.6, world: true, local: true },
  wood: { su: 1, sv: 1, world: false, local: false },
  brick: { su: 4, sv: 4, world: true, local: false },
  metal: { su: 1, sv: 1, world: true, local: false },
  concrete: { su: 2, sv: 2, world: true, local: false },
  deck: { su: 4, sv: 4, world: true, local: false },
  roof: { su: 2.44, sv: 2.6, world: true, local: false },
  plank: { su: 2, sv: 2, world: true, local: false },
};

/** Параллелепипед с развёрткой и «запечённым» затенением у основания. */
export function addBox(p: GeoParts, b: { min: number[]; max: number[]; color: number; variant?: number }, mat: string, rng: () => number, groundY = 0.01): void {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  const uv = UV[mat] ?? UV.concrete;
  const tint = 0.94 + rng() * 0.1;
  const base = new THREE.Color(b.color).multiplyScalar(tint);
  const onGround = y0 <= groundY;
  const top = base.clone();
  const bot = base.clone().multiplyScalar(onGround ? 0.52 : 0.7);
  const under = base.clone().multiplyScalar(0.4);
  const vOff = (b.variant ?? 0) * 0.37;
  const vy = (y: number) => (uv.local ? (y - y0) / uv.sv : y / uv.sv);
  const cols4 = [bot, bot, top, top];

  const side = (a: V3, bb: V3, c: V3, d: V3, n: V3, ua: number, ub: number) => {
    let uvs: number[];
    if (uv.world) uvs = [ua / uv.su + vOff, vy(a[1]), ub / uv.su + vOff, vy(bb[1]), ub / uv.su + vOff, vy(c[1]), ua / uv.su + vOff, vy(d[1])];
    else uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    quad(p, a, bb, c, d, n, uvs, cols4);
  };
  side([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], -z1, -z0);
  side([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], z0, z1);
  side([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], x0, x1);
  side([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], -x1, -x0);
  let uvs: number[];
  if (uv.world) uvs = [x0 / uv.su, -z1 / uv.su, x1 / uv.su, -z1 / uv.su, x1 / uv.su, -z0 / uv.su, x0 / uv.su, -z0 / uv.su];
  else uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  quad(p, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uvs, [top, top, top, top]);
  // низ — только если бокс висит в воздухе
  if (!onGround) {
    quad(p, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [under, under, under, under]);
  }
}

/** Покрасить геометрию в один цвет (вершинные цвета) и сделать неиндексированной. */
export function paint(g: THREE.BufferGeometry, hex: number | THREE.Color): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const c = hex instanceof THREE.Color ? hex : new THREE.Color(hex);
  const n = src.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  src.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return src;
}

/** Склеить раскрашенные части (paint) в одну геометрию: развёртки им не нужны, а у части фигур их нет. */
export function mergeColored(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of list) g.deleteAttribute('uv');
  return mergeGeometries(list, false)!;
}

export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ'));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

export function staticMesh(g: THREE.BufferGeometry, m: THREE.Material, shadows: boolean): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/** Рамка теневой камеры направленного света точно по коробке мира. */
export function fitShadow(light: THREE.DirectionalLight, target: THREE.Vector3, box: THREE.Box3): void {
  const m = new THREE.Matrix4().lookAt(light.position, target, new THREE.Vector3(0, 1, 0));
  m.setPosition(light.position);
  m.invert();
  const v = new THREE.Vector3();
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(m);
    lo.min(v);
    hi.max(v);
  }
  const c = light.shadow.camera;
  c.left = lo.x - 1;
  c.right = hi.x + 1;
  c.bottom = lo.y - 1;
  c.top = hi.y + 1;
  c.near = Math.max(0.5, -hi.z - 2);
  c.far = -lo.z + 2;
  c.updateProjectionMatrix();
}

let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  glowTex ??= tex.softDot('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  return glowTex;
}

/** Тёплый ореол вокруг лампы (аддитивный спрайт). */
export function glowSprite(color: number, size: number, opacity = 0.5): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

// ------------------------------------------------------------ декор

/** Предмет на воде: покачивается вокруг высоты y. */
export interface Floater {
  obj: THREE.Object3D;
  y: number;
  phase: number;
  amp: number;
  rock: number;
}

/** Декор карты (краны строит сам мир — craneGeometry). Буи и лодки попадают в floaters. */
export function buildDeco(scene: THREE.Scene, deco: Deco[], floaters: Floater[]): void {
  const solid: THREE.BufferGeometry[] = [];
  const bulbs: THREE.BufferGeometry[] = [];
  for (const d of deco) {
    switch (d.kind) {
      case 'bollard':
        solid.push(place(paint(new THREE.CylinderGeometry(0.19, 0.23, 0.46, 14), 0x3b3f45), d.x, 0.23, d.z));
        solid.push(place(paint(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 14), 0x34373c), d.x, 0.5, d.z));
        break;
      case 'piling':
        solid.push(place(paint(new THREE.CylinderGeometry(0.2, 0.22, 3.4, 8), 0x4d3b2b), d.x, -2.25, d.z));
        break;
      case 'rope':
        for (let i = 0; i < 3; i++) {
          solid.push(place(paint(new THREE.TorusGeometry(0.36 - i * 0.05, 0.05, 6, 20), 0xc9b183), d.x, 0.05 + i * 0.09, d.z, d.yaw, Math.PI / 2));
        }
        break;
      case 'barrel':
        solid.push(place(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 18), d.color), d.x, 0.475, d.z));
        for (const y of [0.22, 0.73]) solid.push(place(paint(new THREE.TorusGeometry(0.345, 0.025, 5, 18), 0x2a2a2a), d.x, y, d.z, 0, Math.PI / 2));
        solid.push(place(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 18), 0x3a3a3a), d.x, 0.955, d.z));
        break;
      case 'lamp': {
        solid.push(place(paint(new THREE.CylinderGeometry(0.06, 0.09, 5.2, 8), 0x2f3a3a), d.x, 2.6, d.z));
        const ax = -Math.sin(d.yaw) * 0.6;
        const az = -Math.cos(d.yaw) * 0.6;
        solid.push(place(paint(new THREE.BoxGeometry(0.06, 0.06, 1.2), 0x2f3a3a), d.x + ax, 5.1, d.z + az, d.yaw));
        const hx = d.x + ax * 2;
        const hz = d.z + az * 2;
        solid.push(place(paint(new THREE.CylinderGeometry(0.08, 0.28, 0.22, 12), 0x2f3a3a), hx, 5.0, hz));
        bulbs.push(place(paint(new THREE.SphereGeometry(0.13, 12, 8), 0xffe2a8), hx, 4.88, hz));
        const glow = glowSprite(0xffc27a, 1.6);
        glow.position.set(hx, 4.85, hz);
        scene.add(glow);
        break;
      }
      case 'crane':
        break;
      case 'buoy': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 12), new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.6 }));
        body.position.y = 0.5;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 }));
        g.add(body, base);
        g.position.set(d.x, WATER_Y, d.z);
        scene.add(g);
        floaters.push({ obj: g, y: WATER_Y, phase: d.x * 0.3, amp: 0.12, rock: 0.12 });
        break;
      }
      case 'boat': {
        const g = makeBoat(d.color);
        g.position.set(d.x, WATER_Y, d.z);
        g.rotation.y = d.yaw;
        scene.add(g);
        floaters.push({ obj: g, y: WATER_Y, phase: d.z * 0.2, amp: 0.1, rock: 0.05 });
        break;
      }
    }
  }
  if (solid.length) {
    scene.add(staticMesh(mergeGeometries(solid, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }), true));
  }
  if (bulbs.length) {
    scene.add(staticMesh(mergeGeometries(bulbs, false)!, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false));
  }
}

/**
 * Портальный кран порта (красно-белый, вершинные цвета): опоры ±6 × ±5 м, стрела 34 м смотрит по yaw
 * (как взгляд игрока: yaw = 0 → −Z), противовес — назад. (x, y, z) — середина между опорами на земле, s — масштаб.
 */
export function craneGeometry(x: number, y: number, z: number, yaw: number, s: number): THREE.BufferGeometry {
  const red = 0xb2473a;
  const white = 0xe8e2d8;
  const list: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, px: number, py: number, pz: number, c: number) => {
    const g = paint(new THREE.BoxGeometry(w * s, h * s, d * s), c);
    g.translate(px * s, py * s, pz * s);
    list.push(g);
  };
  for (const lx of [-6, 6]) for (const lz of [-5, 5]) box(1, 26, 1, lx, 13, lz, red);
  box(14, 1.2, 1, 0, 8, -5, white);
  box(14, 1.2, 1, 0, 8, 5, white);
  box(1, 1.2, 10, -6, 8, 0, white);
  box(1, 1.2, 10, 6, 8, 0, white);
  box(14, 2, 12, 0, 27, 0, red);
  // стрела над водой, противовес, ванты, кабина
  box(1.6, 1.4, 30, 0, 28, -19, red);
  box(1.6, 1.4, 12, 0, 28, 10, red);
  box(0.7, 12, 0.7, 0, 34, 0, white);
  box(0.25, 0.25, 22, 0, 33, -11, white);
  box(4, 3.4, 4, 3, 30.5, 2, white);
  box(2.2, 1.6, 2.2, 0, 26.4, -12, 0x3a4450);
  const g = mergeGeometries(list, false)!;
  g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

export function updateFloaters(list: readonly Floater[], t: number): void {
  for (const f of list) {
    f.obj.position.y = f.y + Math.sin(t * 1.3 + f.phase) * f.amp;
    f.obj.rotation.z = Math.sin(t * 0.9 + f.phase) * f.rock;
    f.obj.rotation.x = Math.cos(t * 0.7 + f.phase) * f.rock * 0.6;
  }
}

export function makeBoat(color: number): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.3, -3);
  shape.lineTo(1.3, -3);
  shape.lineTo(1.4, 1.5);
  shape.quadraticCurveTo(0.9, 3.2, 0, 4);
  shape.quadraticCurveTo(-0.9, 3.2, -1.4, 1.5);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 2 });
  hull.rotateX(Math.PI / 2);
  hull.translate(0, 0.7, 0);
  const hullMesh = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  // полоса вдоль борта — та же форма, чуть шире и тонкая
  const stripeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
  stripeGeo.rotateX(Math.PI / 2);
  stripeGeo.scale(1.1, 1, 1.04);
  stripeGeo.translate(0, 0.62, 0);
  const stripe = new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({ color: 0xb33a2c, roughness: 0.6 }));
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 2), new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.7 }));
  cabin.position.set(0, 1.4, -0.8);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 2.3), new THREE.MeshStandardMaterial({ color: 0x3c5d78, roughness: 0.6 }));
  roof.position.set(0, 2.06, -0.8);
  g.add(hullMesh, stripe, cabin, roof);
  return g;
}

// ------------------------------------------------------------ батуты

export interface TrampolineVis {
  x: number;
  z: number;
  top: number;
  r: number;
  mat: THREE.Mesh;
  squash: number;
  vel: number;
}

export class Trampolines {
  readonly list: TrampolineVis[] = [];

  constructor(scene: THREE.Scene, trampolines: readonly Trampoline[]) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3f86c9, roughness: 0.55 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x40464d, roughness: 0.5, metalness: 0.5 });
    const matMat = new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.35, metalness: 0.1 });
    for (const t of trampolines) {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      const frame = new THREE.Mesh(new THREE.TorusGeometry(t.r - 0.05, 0.11, 10, 40), frameMat);
      frame.rotation.x = Math.PI / 2;
      frame.position.y = t.top;
      frame.castShadow = true;
      g.add(frame);
      const mat = new THREE.Mesh(new THREE.CircleGeometry(t.r - 0.12, 36), matMat);
      mat.rotation.x = -Math.PI / 2;
      mat.position.y = t.top - 0.03;
      mat.receiveShadow = true;
      g.add(mat);
      const legs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const leg = new THREE.CylinderGeometry(0.04, 0.04, t.top, 6);
        leg.translate(Math.cos(a) * (t.r - 0.08), t.top / 2, Math.sin(a) * (t.r - 0.08));
        legs.push(leg);
      }
      g.add(new THREE.Mesh(mergeGeometries(legs, false)!, legMat));
      scene.add(g);
      this.list.push({ x: t.x, z: t.z, top: t.top, r: t.r, mat, squash: 0, vel: 0 });
    }
  }

  /** Батут просел: кто-то приземлился. */
  bounce(x: number, z: number, power = 1): void {
    for (const t of this.list) {
      if (Math.hypot(t.x - x, t.z - z) < t.r + 0.6) t.vel -= 5 * power;
    }
  }

  update(dt: number): void {
    for (const tr of this.list) {
      tr.vel += (-tr.squash * 220 - tr.vel * 9) * dt;
      tr.squash += tr.vel * dt;
      tr.mat.position.y = tr.top - 0.03 + tr.squash * 0.35;
    }
  }
}

// ------------------------------------------------------------ чайки

interface Gull {
  obj: THREE.Group;
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
  cx: number;
  cz: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
}

/** Чайки кружат над миром вокруг (cx, cz). */
export class Gulls {
  private readonly list: Gull[] = [];

  constructor(scene: THREE.Scene, cx = 0, cz = 0) {
    const rng = makeRng(123);
    const bodyGeo = new THREE.SphereGeometry(0.16, 8, 6);
    bodyGeo.scale(1, 0.8, 2.2);
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0.95, 0.05, 0.05, 0, 0, 0.2, 0.95, 0.05, 0.05, 0.55, 0.02, 0.22, 0, 0, 0.2], 3));
    wingGeo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide });
    const tip = new THREE.MeshLambertMaterial({ color: 0x9aa0a6, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const obj = new THREE.Group();
      obj.add(new THREE.Mesh(bodyGeo, mat));
      const wingR = new THREE.Mesh(wingGeo, i % 2 ? mat : tip);
      const wingL = new THREE.Mesh(wingGeo, i % 2 ? mat : tip);
      wingL.scale.x = -1;
      obj.add(wingR, wingL);
      obj.scale.setScalar(1.4);
      scene.add(obj);
      this.list.push({
        obj, wingL, wingR,
        cx: cx + (rng() - 0.5) * 50,
        cz: cz + (rng() - 0.5) * 70,
        y: 13 + rng() * 12,
        r: 10 + rng() * 22,
        speed: (6 + rng() * 4) * (rng() < 0.5 ? -1 : 1),
        phase: rng() * 100,
      });
    }
  }

  update(t: number): void {
    for (const g of this.list) {
      const a = (t * g.speed) / g.r + g.phase;
      g.obj.position.set(g.cx + Math.cos(a) * g.r, g.y + Math.sin(t * 0.4 + g.phase) * 1.5, g.cz + Math.sin(a) * g.r);
      // летят по касательной к окружности, с креном внутрь
      const dir = g.speed > 0 ? 1 : -1;
      g.obj.rotation.set(0, Math.atan2(Math.sin(a) * dir, -Math.cos(a) * dir), -0.25 * dir);
      // машут крыльями не всё время — иногда парят
      const flapping = Math.sin(t * 0.5 + g.phase) > -0.2;
      const flap = flapping ? Math.sin(t * 9 + g.phase) * 0.55 : 0.12;
      g.wingR.rotation.z = flap;
      g.wingL.rotation.z = -flap;
    }
  }
}
